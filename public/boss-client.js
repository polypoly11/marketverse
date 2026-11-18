
export function createBossClient({
  THREE,
  scene,
  sceneEl,
  getAvatar,
  getPlayerId,
  send,
  removeShot,
  playHit
}) {
  let current={
    state:'idle',
    hp:10000,
    maxHp:10000,
    damage:1
  };

  let whale=null;
  let loot=null;
  let hpCanvas=null;
  let hpTexture=null;
  let recentHit=0;

  const bossPos=new THREE.Vector3(0,1.7,-13);
  const effects=[];

  const hud=document.createElement('div');

  hud.style.cssText=`
    position:absolute;
    z-index:21;
    left:50%;
    top:14px;
    transform:translateX(-50%);
    width:min(420px,65%);
    padding:10px 12px;
    border-radius:10px;
    border:1px solid #5c9cd3;
    background:rgba(10,21,36,.93);
    color:#fff;
    font:700 13px Arial,sans-serif;
    text-align:center;
    pointer-events:none;
  `;

  hud.hidden=true;
  sceneEl.appendChild(hud);

  const pickupButton=document.createElement('button');

  pickupButton.textContent='🎁 보상 아이템 획득 (E)';
  pickupButton.style.cssText=`
    position:absolute;
    z-index:50;
    left:50%;
    bottom:110px;
    transform:translateX(-50%);
    border:1px solid #f9da8d;
    border-radius:11px;
    padding:13px 19px;
    background:#302c43;
    color:#ffe5a6;
    cursor:pointer;
    font:bold 15px Arial,sans-serif;
  `;

  pickupButton.hidden=true;
  pickupButton.onclick=()=>claim();
  sceneEl.appendChild(pickupButton);

  const notice=document.createElement('div');

  notice.style.cssText=`
    position:absolute;
    z-index:60;
    bottom:18px;
    left:50%;
    transform:translateX(-50%);
    padding:11px 17px;
    border-radius:10px;
    background:#182d42;
    color:white;
    font:bold 14px Arial,sans-serif;
    pointer-events:none;
    max-width:90%;
    text-align:center;
  `;

  notice.hidden=true;
  sceneEl.appendChild(notice);

  let noticeUntil=0;

  function say(text) {
    notice.textContent=String(text);
    notice.hidden=false;
    noticeUntil=performance.now()+3000;
  }

  const mat=(color,other={})=>
    new THREE.MeshStandardMaterial({
      color,
      roughness:.72,
      ...other
    });

  function ellipsoid(parent,color,x,y,z,sx,sy,sz) {
    const mesh=new THREE.Mesh(
      new THREE.SphereGeometry(1,18,12),
      mat(color)
    );

    mesh.position.set(x,y,z);
    mesh.scale.set(sx,sy,sz);
    parent.add(mesh);

    return mesh;
  }

  function makeWhale() {
    const root=new THREE.Group();

    root.position.copy(bossPos);
    scene.add(root);

    // 고래의 몸통과 배
    ellipsoid(
      root,0x438cc9,
      0,0,0,
      1.85,1.15,2.05
    );

    ellipsoid(
      root,0x9ad8ef,
      0,-.53,.45,
      1.52,.54,1.55
    );

    ellipsoid(
      root,0x3b79b9,
      -1.65,.05,-.1,
      .7,.3,.67
    );

    // 양쪽 지느러미와 눈
    for(const side of [-1,1]) {
      const fin=ellipsoid(
        root,0x3a7fbd,
        side*1.73,-.42,.25,
        .95,.18,.52
      );

      fin.rotation.z=side*.24;

      ellipsoid(
        root,0x12253b,
        side*1.18,.28,1.34,
        .17,.18,.13
      );

      ellipsoid(
        root,0xffffff,
        side*1.16,.34,1.45,
        .045,.05,.03
      );
    }

    // 고래 꼬리
    const tail=new THREE.Group();

    tail.position.set(0,.03,-1.9);

    ellipsoid(
      tail,0x448ecd,
      0,0,-.42,
      .2,.28,.62
    );

    ellipsoid(
      tail,0x448ecd,
      -.49,.12,-.65,
      .72,.16,.45
    );

    ellipsoid(
      tail,0x448ecd,
      .49,.12,-.65,
      .72,.16,.45
    );

    root.add(tail);

    // 물 분출구
    const blow=new THREE.Mesh(
      new THREE.ConeGeometry(.16,.35,8),
      mat(0x77d9e8)
    );

    blow.position.set(0,1.13,.3);
    root.add(blow);

    // 고래 머리 위 HP 바
    hpCanvas=document.createElement('canvas');
    hpCanvas.width=512;
    hpCanvas.height=100;

    hpTexture=new THREE.CanvasTexture(hpCanvas);
    hpTexture.colorSpace=THREE.SRGBColorSpace;

    const hpSprite=new THREE.Sprite(
      new THREE.SpriteMaterial({
        map:hpTexture,
        transparent:true,
        depthTest:false,
        depthWrite:false
      })
    );

    hpSprite.position.set(0,2.1,0);
    hpSprite.scale.set(5,1,1);
    root.add(hpSprite);

    whale={root,tail};
    updateHp(current.hp);
  }

  function updateHp(value) {
    current.hp=Math.max(
      0,
      Math.min(
        current.maxHp,
        Number(value)||0
      )
    );

    if(hpCanvas) {
      const ctx=hpCanvas.getContext('2d');

      ctx.clearRect(0,0,512,100);

      ctx.fillStyle='rgba(9,24,41,.88)';
      ctx.fillRect(10,9,492,82);

      ctx.fillStyle='#ffffff';
      ctx.font='bold 25px Arial';
      ctx.textAlign='center';

      ctx.fillText(
        `🐋 WHALE BOSS   ${current.hp.toLocaleString()} / ${current.maxHp.toLocaleString()}`,
        256,
        40
      );

      ctx.fillStyle='#5b3344';
      ctx.fillRect(25,55,462,19);

      ctx.fillStyle='#e36d89';
      ctx.fillRect(
        25,55,
        462*current.hp/current.maxHp,
        19
      );

      hpTexture.needsUpdate=true;
    }

    hud.textContent=
      `🐋 고래 보스 HP ${current.hp.toLocaleString()} / ${current.maxHp.toLocaleString()}`;
  }

  function makeLoot() {
    const root=new THREE.Group();
    root.position.set(0,.85,-13);

    const chest=new THREE.Mesh(
      new THREE.OctahedronGeometry(.58,0),
      new THREE.MeshStandardMaterial({
        color:0xffc54b,
        metalness:.6,
        roughness:.2,
        emissive:0x7a4b00,
        emissiveIntensity:.5
      })
    );

    root.add(chest);

    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(.9,.06,8,32),
      new THREE.MeshBasicMaterial({
        color:0xffedaa
      })
    );

    ring.rotation.x=Math.PI/2;
    root.add(ring);

    const light=new THREE.PointLight(
      0xffd273,
      4,
      6
    );

    root.add(light);
    scene.add(root);

    loot={root,ring};
  }

  function showState(message) {
    current={...current,...message};

    const isBoss=current.state==='active';
    const isLoot=current.state==='loot';

    if(isBoss && !whale) makeWhale();
    if(whale) whale.root.visible=isBoss;

    if(isLoot && !loot) makeLoot();
    if(loot) loot.root.visible=isLoot;

    hud.hidden=!isBoss;

    if(isBoss) updateHp(current.hp);

    if(
      current.state==='claimed' &&
      current.winnerName
    ) {
      say(
        `🎁 ${current.winnerName}님이 보상을 획득했습니다.`
      );
    }

    if(current.state==='cancelled') {
      say('고래 보스 이벤트가 종료되었습니다.');
    }
  }

  function claim() {
    if(current.state!=='loot') return;

    const me=getAvatar();
    if(!me) return;

    const dx=me.position.x;
    const dz=me.position.z+13;

    if(Math.hypot(dx,dz)>1.6) {
      say('아이템 가까이 이동하세요.');
      return;
    }

    // 실제 거리 및 선착순 판정은 서버가 수행
    send({type:'loot_pickup'});
  }

  function showReward(m) {
    if(m.testMode) {
      say(
        '연습용 보상 획득! 실제 쿠폰은 지급되지 않습니다.'
      );
      return;
    }

    const overlay=document.createElement('div');

    overlay.style.cssText=`
      position:fixed;
      inset:0;
      z-index:100100;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:rgba(0,0,0,.85);
    `;

    const card=document.createElement('div');

    card.style.cssText=`
      width:min(430px,100%);
      border:1px solid #e9c786;
      border-radius:18px;
      background:#152338;
      color:#fff;
      padding:28px;
      text-align:center;
      font:14px Arial,sans-serif;
    `;

    const title=document.createElement('h2');
    title.textContent='🎉 스타벅스 쿠폰 당첨!';

    const explain=document.createElement('p');

    explain.textContent=
      '운영자에게 아래 보상 ID와 수령 증명 코드를 전달하세요. 실제 쿠폰은 운영자가 확인한 뒤 지급합니다.';

    const receipt=document.createElement('code');

    receipt.textContent=
      `보상 ID: ${m.rewardId}\n수령 코드: ${m.claimCode}`;

    receipt.style.cssText=`
      white-space:pre-wrap;
      overflow-wrap:anywhere;
      display:block;
      padding:14px;
      background:#0a1828;
      border-radius:9px;
      line-height:1.9;
    `;

    const copy=document.createElement('button');
    copy.textContent='수령 코드 복사';

    copy.style.cssText=`
      margin:14px;
      padding:11px 18px;
      background:#e9c786;
      border:0;
      border-radius:9px;
      cursor:pointer;
    `;

    copy.onclick=()=>navigator.clipboard?.writeText(
      `보상 ID: ${m.rewardId}\n수령 코드: ${m.claimCode}`
    );

    const close=document.createElement('button');
    close.textContent='닫기';

    close.style.cssText=`
      padding:11px 18px;
      background:#34485c;
      color:#fff;
      border:0;
      border-radius:9px;
      cursor:pointer;
    `;

    close.onclick=()=>overlay.remove();

    card.append(
      title,
      explain,
      receipt,
      copy,
      close
    );

    overlay.append(card);
    document.body.append(overlay);
  }

  function impact(m) {
    if(!whale || current.state!=='active') return;

    const mesh=new THREE.Mesh(
      new THREE.SphereGeometry(.18,8,6),
      new THREE.MeshBasicMaterial({
        color:0x9fefff,
        transparent:true,
        opacity:.9
      })
    );

    mesh.position.set(
      Number(m.x)||0,
      Number(m.y)||1.4,
      Number(m.z)||-13
    );

    scene.add(mesh);

    effects.push({
      mesh,
      time:performance.now()
    });

    recentHit=performance.now();
  }

  function onMessage(m) {
    switch(m.type) {
      case 'raid_state':
        showState(m);
        return true;

      case 'boss_hp':
        updateHp(m.hp);
        return true;

      case 'boss_hit':
        removeShot(m.shotId);
        impact(m);
        playHit(m.x,m.z);
        return true;

      case 'boss_shot_end':
        removeShot(m.shotId);
        return true;

      case 'reward_result':
        showReward(m);
        return true;

      case 'raid_notice':
        say(m.message);
        return true;

      default:
        return false;
    }
  }

  function update(now,dt) {
    if(whale?.root.visible) {
      whale.root.position.y=
        bossPos.y+Math.sin(now*.0015)*.16;

      whale.tail.rotation.z=
        Math.sin(now*.002)*.15;

      const scale=now-recentHit<200
        ? 1+Math.sin(
            (now-recentHit)*.055
          )*.015
        : 1;

      whale.root.scale.setScalar(scale);
    }

    if(loot?.root.visible) {
      loot.root.rotation.y+=dt*1.2;

      loot.root.position.y=
        .85+Math.sin(now*.003)*.14;
    }

    const me=getAvatar();

    pickupButton.hidden=!(
      current.state==='loot' &&
      me &&
      Math.hypot(
        me.position.x,
        me.position.z+13
      )<=2.1
    );

    if(noticeUntil && now>=noticeUntil) {
      notice.hidden=true;
      noticeUntil=0;
    }

    for(let i=effects.length-1;i>=0;i--) {
      const e=effects[i];
      const t=(now-e.time)/300;

      e.mesh.scale.setScalar(1+t*3);
      e.mesh.material.opacity=Math.max(0,1-t);

      if(t>=1) {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        effects.splice(i,1);
      }
    }
  }

  // PC E키로 아이템 획득
  window.addEventListener('keydown',e=>{
    if(e.key.toLowerCase()!=='e') return;

    if(
      ['INPUT','TEXTAREA'].includes(
        document.activeElement?.tagName
      )
    ) return;

    if(current.state==='loot') {
      e.preventDefault();
      claim();
    }
  });

  return {
    onMessage,
    update
  };
}
