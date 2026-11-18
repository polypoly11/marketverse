
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// 프로젝트 최상위 폴더에서 실행
const root=process.cwd();

const files={
  server:path.join(root,'server.js'),
  admin:path.join(root,'admin.js'),
  app:path.join(root,'public','app.js'),
  html:path.join(root,'public','admin.html')
};

for(const [name,file] of Object.entries(files)) {
  if(!fs.existsSync(file)) {
    throw Error(
      `${name}: 파일을 찾을 수 없습니다: ${file}`
    );
  }
}

for(const file of [
  'boss-raid.js',
  'public/boss-client.js',
  'public/admin-raid.js'
]) {
  if(!fs.existsSync(path.join(root,file))) {
    throw Error(
      `새 파일을 먼저 만드세요: ${file}`
    );
  }
}

const original=Object.fromEntries(
  Object.entries(files).map(([key,file])=>[
    key,
    fs.readFileSync(file,'utf8')
  ])
);

const updated={...original};

if(updated.server.includes(
  'createBossRaid({clients, send, broadcast})'
)) {
  console.log('레이드 패치가 이미 적용되어 있습니다.');
  process.exit(0);
}

function replaceOne(key,anchor,replacement,label) {
  const before=updated[key];

  const matches=typeof anchor==='string'
    ? before.split(anchor).length-1
    : [...before.matchAll(
        new RegExp(anchor.source,'g')
      )].length;

  if(matches!==1) {
    throw Error(
      `${key}의 ${label} 위치를 1개만 찾아야 하는데 ${matches}개입니다. 파일 버전을 확인하세요.`
    );
  }

  updated[key]=before.replace(
    anchor,
    replacement
  );
}

// ========================================
// server.js 수정
// ========================================

replaceOne(
  'server',
  "from './admin.js';",
  "from './admin.js';\nimport {createBossRaid} from './boss-raid.js';",
  'import'
);

replaceOne(
  'server',
  /mountAdmin\(app,\s*\{[^}]*\bpresence\b[^}]*\}\s*\);/,
  `const raid = await createBossRaid({clients, send, broadcast});
mountAdmin(app, {clients, votes, history, magicShots, send, broadcast, presence, raid});`,
  'mountAdmin'
);

replaceOne(
  'server',
  /(send\(ws,\s*\{\s*type:\s*'welcome'[\s\S]*?\}\);)\s*(presence\(\);)/,
  '$1\n\n  raid.sendSnapshot(ws);\n  $2',
  'welcome'
);

replaceOne(
  'server',
  /(if\s*\(!p\.ready\)\s*\{\s*return;\s*\})/,
  `$1

    if(m.type==='loot_pickup'){
      void raid.pickup(ws,p);
      return;
    }`,
  'pickup'
);

replaceOne(
  'server',
  /      p\.x = Math\.max\(/,
  `      // 순간이동을 방지하기 위한 서버 좌표 검증
      const seconds=Math.max(
        .08,
        Math.min(1,(now-(p.lastMove||p.joinedAt))/1000)
      );

      const maxStep=6.5*seconds+.4;

      if(Math.hypot(x-p.x,z-p.z)>maxStep){
        send(ws,{
          type:'position_correct',
          x:p.x,
          y:p.y,
          z:p.z
        });
        p.lastMove=now;
        return;
      }

      p.x = Math.max(`,
  'move'
);

replaceOne(
  'server',
  /    if\s*\(!nearest\)\s*\{\s*shot\.x\s*=\s*endX;/,
  `    const bossPoint=raid.collision(
      shot,
      startX,
      startZ,
      endX,
      endZ
    );

    if(
      bossPoint &&
      (!nearest || bossPoint.t<nearest.t)
    ){
      magicShots.splice(i,1);
      raid.hit(shot,bossPoint);
      continue;
    }

    if (!nearest) {
      shot.x=endX;`,
  'magic collision'
);

// ========================================
// admin.js 수정
// ========================================

replaceOne(
  'admin',
  /\bpresence(\s*\}\s*=\s*context;)/,
  'presence, raid$1',
  'admin context'
);

replaceOne(
  'admin',
  'audit: auditTrail.slice(0, 20)',
  `audit: auditTrail.slice(0, 20),
      raid: raid.snapshot()`,
  'admin status'
);

const adminRoutes=`
  // ====== 고래 레이드 관리자 API ======

  app.post(
    '/api/admin/raid/spawn',
    safeOrigin,
    requireAdmin,
    async(req,res)=>{
      try{
        const state=await raid.spawn(
          req.body?.damage??1
        );
        remember('고래 보스 소환');
        res.json({ok:true,raid:state});
      }catch(e){
        res.status(400).json({
          error:e.message
        });
      }
    }
  );

  app.post(
    '/api/admin/raid/cancel',
    safeOrigin,
    requireAdmin,
    async(_req,res)=>{
      try{
        const state=await raid.cancel();
        remember('고래 레이드 취소');
        res.json({ok:true,raid:state});
      }catch(e){
        res.status(400).json({
          error:e.message
        });
      }
    }
  );

  app.get(
    '/api/admin/raid/rewards',
    requireAdmin,
    async(_req,res)=>{
      try{
        res.json({
          ok:true,
          prizeEnabled:raid.prizeEnabled,
          rewards:await raid.rewards()
        });
      }catch(e){
        res.status(500).json({
          error:'당첨 기록 조회 실패'
        });
      }
    }
  );

  app.post(
    '/api/admin/raid/verify',
    safeOrigin,
    requireAdmin,
    async(req,res)=>{
      try{
        const valid=await raid.verify(
          String(req.body?.rewardId||''),
          String(req.body?.claimCode||'')
        );
        res.json({ok:true,valid});
      }catch(e){
        res.status(400).json({
          error:'증명 코드 검증 실패'
        });
      }
    }
  );

  app.post(
    '/api/admin/raid/paid',
    safeOrigin,
    requireAdmin,
    async(req,res)=>{
      try{
        await raid.markPaid(
          String(req.body?.rewardId||'')
        );
        remember('쿠폰 지급 완료');
        res.json({ok:true});
      }catch(e){
        res.status(400).json({
          error:e.message
        });
      }
    }
  );
`;

updated.admin=updated.admin.replace(
  /\n\}\s*$/,
  adminRoutes+'\n}\n'
);

// ========================================
// app.js 수정
// ========================================

replaceOne(
  'app',
  "from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';",
  `from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import {createBossClient} from './boss-client.js';`,
  'app import'
);

replaceOne(
  'app',
  'const others = new Map();',
  `const others = new Map();

const raidClient=createBossClient({
  THREE,
  scene,
  sceneEl,

  getAvatar:()=>myAvatar,
  getPlayerId:()=>myId,
  send:msg=>send(msg),

  removeShot:shotId=>{
    const i=magicProjectiles.findIndex(
      s=>s.id===shotId
    );

    if(i>=0){
      disposeMagicProjectile(
        magicProjectiles[i]
      );
      magicProjectiles.splice(i,1);
    }
  },

  playHit:(x,z)=>playMagicHitSfx(
    magicSoundVolume(x,z)
  )
});`,
  'raid client init'
);

replaceOne(
  'app',
  `  tickBubbles(now);
  renderer.render(scene,camera);`,
  `  tickBubbles(now);
  raidClient.update(now,dt);
  renderer.render(scene,camera);`,
  'render loop'
);

replaceOne(
  'app',
  "    if(m.type==='welcome'){",
  `    if(raidClient.onMessage(m))return;

    if(m.type==='position_correct' && myAvatar){
      myAvatar.position.set(
        Number(m.x)||0,
        Number(m.y)||0,
        Number(m.z)||0
      );
      return;
    }

    if(m.type==='welcome'){`,
  'message handler'
);

// ========================================
// admin.html 수정
// ========================================

// 기존 로그인 화면 비밀번호 초기화 오류 방지
updated.html=updated.html.replace(
  /(function showLogin\(\)\s*\{[\s\S]*?\$\('app-view'\)\.hidden\s*=\s*true;)\s*\$\('password'\)\.value\s*=\s*'';/,
  '$1'
);

replaceOne(
  'html',
  '</body>',
  `  <script src="/admin-raid.js" defer></script>
</body>`,
  'admin script'
);

// ========================================
// 문법 확인 및 백업
// ========================================

for(const key of ['server','admin','app']) {
  const scratch=path.join(
    root,
    `.jmc-check-${key}.mjs`
  );

  try {
    fs.writeFileSync(
      scratch,
      updated[key]
    );

    execFileSync(
      process.execPath,
      ['--check',scratch],
      {stdio:'pipe'}
    );

  } finally {
    if(fs.existsSync(scratch)) {
      fs.unlinkSync(scratch);
    }
  }
}

// 검사가 모두 성공했을 때만 파일 교체
for(const [key,file] of Object.entries(files)) {
  const backup=file+'.raid-backup';

  if(!fs.existsSync(backup)) {
    fs.copyFileSync(file,backup);
  }

  fs.writeFileSync(
    file,
    updated[key]
  );
}

console.log(
  '완료: app.js, server.js, admin.js, admin.html 레이드 연동 적용'
);

console.log(
  '기존 파일은 *.raid-backup 으로 백업되었습니다.'
);
