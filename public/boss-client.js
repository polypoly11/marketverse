
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

// ========================================
// 고래 꼬리 광역공격 시각 효과
// ========================================

let tailWarningUntil = 0;
let tailStrikeTime = -1000000;

const tailShockwaves = [];

// 광역공격 경고 문구
const tailWarning = document.createElement('div');

tailWarning.style.cssText = `
  position:absolute;
  z-index:75;
  left:50%;
  top:70px;
  transform:translateX(-50%);
  width:max-content;
  max-width:calc(100% - 20px);
  padding:10px 14px;
  box-sizing:border-box;
  border:1px solid #ffad68;
  border-radius:10px;
  background:rgba(99,27,22,.94);
  color:#fff4db;
  font:bold 13px Arial,sans-serif;
  text-align:center;
  pointer-events:none;
  box-shadow:0 0 20px rgba(255,80,35,.35);
`;

tailWarning.hidden = true;
sceneEl.appendChild(tailWarning);

// 고래 꼬리 공격 충격파 생성
function createTailShockwave() {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.7,0.95,64),
    new THREE.MeshBasicMaterial({
      color:0xff8745,
      transparent:true,
      opacity:0.85,
      side:THREE.DoubleSide,
      depthWrite:false
    })
  );

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0,0.1,-13);

  scene.add(mesh);

  tailShockwaves.push({
    mesh,
    born:performance.now()
  });
}

// 고래 꼬리 움직임과 충격파 갱신
function updateTailEffects(now) {

  if (current.state !== 'active') {
    tailWarningUntil = 0;
    tailWarning.hidden = true;
  }

  if (whale?.root.visible) {

    // 공격 전: 꼬리를 뒤로 크게 젖힘
    if (tailWarningUntil > now) {
      const remaining = tailWarningUntil - now;

      const progress = Math.max(
        0,
        Math.min(1,1 - remaining / 1400)
      );

      whale.tail.rotation.y =
        -0.15 - progress * 0.95;

      whale.tail.rotation.z =
        0.15 + progress * 0.35;

      tailWarning.textContent =
        `🐋 꼬리 광역공격! ${(remaining/1000).toFixed(1)}초 후 · 점프! (HP -40)`;
    }

    // 공격 순간: 꼬리를 반대 방향으로 휘두름
    else if (
      now - tailStrikeTime >= 0 &&
      now - tailStrikeTime < 500
    ) {
      const progress =
        (now - tailStrikeTime) / 500;

      whale.tail.rotation.y =
        -1.1 +
        Math.sin(progress * Math.PI / 2) * 2.2;

      whale.tail.rotation.z =
        0.5 * (1 - progress);
    }
  }

  if (
    tailWarningUntil > 0 &&
    now >= tailWarningUntil
  ) {
    tailWarningUntil = 0;
    tailWarning.hidden = true;
  }

  // 충격파가 라운지 전체로 퍼지는 효과
  for (let i = tailShockwaves.length - 1; i >= 0; i--) {
    const wave = tailShockwaves[i];
    const progress = (now - wave.born) / 900;

    if (progress >= 1) {
      scene.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.mesh.material.dispose();
      tailShockwaves.splice(i,1);
      continue;
    }

    wave.mesh.scale.setScalar(
      1 + progress * 48
    );

    wave.mesh.material.opacity =
      0.85 * (1 - progress);
  }
}

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

    // 몸통은 X축 방향: 오른쪽(+X)이 머리, 왼쪽(-X)이 꼬리.
    // 카메라에서 고래의 옆모습이 보이도록 Y축 회전은 0으로 유지한다.
    root.rotation.y=0;
    scene.add(root);

    const palette={
      back:0x397fae,
      flank:0x69b7d5,
      belly:0xc5eaf0,
      fin:0x357ba8,
      eye:0x102338,
      water:0xb1edff
    };

    // 하나로 연결된 매끄러운 유선형 몸통.
    // 머리·허리·꼬리의 실루엣이 자연스럽게 이어진다.
    const stations=[
      [-2.20, 0.01, 0.05, 0.07],
      [-2.00, 0.01, 0.20, 0.20],
      [-1.70, 0.00, 0.38, 0.37],
      [-1.35, 0.00, 0.57, 0.56],
      [-0.90, 0.00, 0.76, 0.72],
      [-0.40, 0.00, 0.88, 0.84],
      [ 0.15, 0.01, 0.94, 0.88],
      [ 0.65, 0.04, 0.90, 0.84],
      [ 1.10, 0.09, 0.80, 0.76],
      [ 1.47, 0.09, 0.69, 0.68],
      [ 1.78, 0.04, 0.54, 0.54],
      [ 2.02,-0.04, 0.34, 0.37],
      [ 2.16,-0.07, 0.13, 0.19],
      [ 2.18,-0.07, 0.01, 0.01]
    ];

    function smooth(a,b,c,d,t) {
      return 0.5*(
        2*b+(-a+c)*t+
        (2*a-5*b+4*c-d)*t*t+
        (-a+3*b-3*c+d)*t*t*t
      );
    }

    const longitudinal=4;
    const radial=36;
    const positions=[];
    const colors=[];
    const indices=[];
    const backColor=new THREE.Color(palette.back);
    const flankColor=new THREE.Color(palette.flank);
    const bellyColor=new THREE.Color(palette.belly);

    for(let i=0;i<=(stations.length-1)*longitudinal;i++) {
      const section=Math.min(
        stations.length-2,
        Math.floor(i/longitudinal)
      );

      const t=(i-section*longitudinal)/longitudinal;
      const before=stations[Math.max(0,section-1)];
      const left=stations[section];
      const right=stations[section+1];
      const after=stations[Math.min(stations.length-1,section+2)];

      const values=[0,1,2,3].map(k=>smooth(
        before[k],left[k],right[k],after[k],t
      ));

      const [x,centerY,ry,rz]=values;

      for(let j=0;j<=radial;j++) {
        const angle=j/radial*Math.PI*2;
        const height=Math.sin(angle);

        positions.push(
          x,
          centerY+Math.max(0.01,ry)*height,
          Math.max(0.01,rz)*Math.cos(angle)
        );

        // 위쪽은 푸른색, 측면은 밝은 청색, 배는 연한 하늘색.
        const c=backColor.clone().lerp(
          flankColor,
          THREE.MathUtils.smoothstep(-height,-0.65,0.8)*0.18+0.22
        );

        const bellyBlend=THREE.MathUtils.smoothstep(
          -height,0.17,0.61
        );

        c.lerp(bellyColor,bellyBlend);
        colors.push(c.r,c.g,c.b);
      }
    }

    const rings=(stations.length-1)*longitudinal;

    for(let i=0;i<rings;i++) {
      for(let j=0;j<radial;j++) {
        const a=i*(radial+1)+j;
        const b=(i+1)*(radial+1)+j;
        const c=a+1;
        const d=b+1;

        indices.push(a,b,c,b,d,c);
      }
    }

    const bodyGeometry=new THREE.BufferGeometry();

    bodyGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions,3)
    );

    bodyGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors,3)
    );

    bodyGeometry.setIndex(indices);
    bodyGeometry.computeVertexNormals();

    const body=new THREE.Mesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({
        vertexColors:true,
        roughness:0.57,
        metalness:0.05
      })
    );

    root.add(body);

    // 둥글고 부드러운 아래턱.
    ellipsoid(
      root,palette.belly,
      1.55,-0.30,0,
      0.52,0.22,0.46
    );

    function addCurve(points,color,radius,opacity=1) {
      const curve=new THREE.CatmullRomCurve3(
        points.map(p=>new THREE.Vector3(...p))
      );

      const material=new THREE.MeshStandardMaterial({
        color,
        roughness:0.7,
        transparent:opacity<1,
        opacity
      });

      const mesh=new THREE.Mesh(
        new THREE.TubeGeometry(curve,24,radius,6,false),
        material
      );

      root.add(mesh);
      return mesh;
    }

    // 양쪽 눈, 눈동자, 반사광 및 입선.
    for(const side of [-1,1]) {
      ellipsoid(
        root,0xe8f8fb,
        1.34,0.28,side*0.690,
        0.16,0.16,0.055
      );

      ellipsoid(
        root,palette.eye,
        1.36,0.28,side*0.737,
        0.102,0.109,0.035
      );

      ellipsoid(
        root,0xffffff,
        1.392,0.331,side*0.766,
        0.035,0.037,0.018
      );

      // 볼 하이라이트
      ellipsoid(
        root,0x8bcee2,
        1.08,-0.11,side*0.732,
        0.19,0.10,0.035
      );

      // 웃는 입선
      addCurve([
        [0.79,-0.245,side*0.784],
        [1.14,-0.298,side*0.692],
        [1.51,-0.335,side*0.574],
        [1.78,-0.294,side*0.421]
      ],0x315c79,0.016);
    }

    // 등지느러미: 단단한 윤곽과 둥근 모서리.
    function extrudedFin(shape,depth,color) {
      return new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape,{
          depth,
          steps:1,
          bevelEnabled:true,
          bevelSize:0.032,
          bevelThickness:0.027,
          bevelSegments:2,
          curveSegments:14
        }),
        new THREE.MeshStandardMaterial({
          color,
          roughness:0.63,
          side:THREE.DoubleSide
        })
      );
    }

    const dorsalShape=new THREE.Shape();

    dorsalShape.moveTo(-1.00,0.69);
    dorsalShape.bezierCurveTo(
      -0.77,0.92,
      -0.64,1.27,
      -0.39,1.38
    );
    dorsalShape.bezierCurveTo(
      -0.43,1.13,
      -0.12,0.94,
      0.15,0.78
    );
    dorsalShape.quadraticCurveTo(
      -0.40,0.88,
      -1.00,0.69
    );

    const dorsal=extrudedFin(
      dorsalShape,0.12,0x3479a5
    );

    dorsal.position.z=-0.06;
    root.add(dorsal);

    // 가슴지느러미는 뒤로 뻗어 옆 실루엣을 만든다.
    const finShape=new THREE.Shape();

    finShape.moveTo(-0.18,-0.30);
    finShape.bezierCurveTo(
      -0.41,-0.39,
      -0.95,-0.75,
      -1.18,-1.03
    );
    finShape.quadraticCurveTo(
      -1.34,-1.22,
      -1.16,-1.23
    );
    finShape.bezierCurveTo(
      -0.77,-1.17,
      -0.15,-0.69,
      0.09,-0.43
    );
    finShape.quadraticCurveTo(
      0.10,-0.29,
      -0.18,-0.30
    );

    const farFin=extrudedFin(
      finShape,0.11,0x3373a0
    );
    farFin.position.z=-0.91;
    root.add(farFin);

    const nearFin=extrudedFin(
      finShape,0.13,palette.fin
    );
    nearFin.position.z=0.79;
    root.add(nearFin);

    // 꼬리자루와 좌우 꼬리지느러미.
    const tail=new THREE.Group();
    tail.position.set(-2.08,0.01,0);
    root.add(tail);

    ellipsoid(
      tail,0x367da9,
      -0.22,0,0,
      0.52,0.17,0.19
    );

    for(const side of [-1,1]) {
      const fluke=ellipsoid(
        tail,palette.fin,
        -0.61,0.045,side*0.35,
        0.60,0.115,0.47
      );

      fluke.rotation.y=side*0.36;
      fluke.rotation.z=side*0.075;
    }

    // 머리 위 물 분출구.
    ellipsoid(
      root,0x214c6a,
      0.97,0.879,0,
      0.13,0.024,0.105
    );

    const spout=new THREE.Group();

    spout.position.set(0.97,0.93,0);
    root.add(spout);

    const water=[];

    for(let i=0;i<7;i++) {
      const drop=new THREE.Mesh(
        new THREE.SphereGeometry(0.055,10,8),
        new THREE.MeshBasicMaterial({
          color:palette.water,
          transparent:true,
          opacity:0.65,
          depthWrite:false
        })
      );

      drop.userData.phase=i/7;
      spout.add(drop);
      water.push(drop);
    }

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

    hpSprite.position.set(0,1.95,0);
    hpSprite.scale.set(4.8,0.95,1);
    root.add(hpSprite);

    whale={
      root,
      tail,
      nearFin,
      farFin,
      spout,
      water
    };

    updateHp(current.hp);
  }

  // ==========================================
  // 사이버 고래 GLB 로컬 미리보기
  // ==========================================

  const cyberPreview = {
    object: null,
    targets: []
  };

  function addCyberPreviewButton() {
    if (
      !new URLSearchParams(window.location.search)
        .has('cyberwhale')
    ) return;

    const button = document.createElement('button');

    button.textContent = '🐋 사이버 고래 불러오기';

    button.style.cssText = `
      position:absolute;
      top:110px;
      right:12px;
      z-index:99;
      padding:10px 13px;
      border:1px solid #a89dff;
      border-radius:9px;
      background:#18213c;
      color:white;
      font:bold 13px Arial;
      cursor:pointer;
    `;

    sceneEl.appendChild(button);

    button.onclick = () => {
      if (!whale) {
        say('고래 보스를 먼저 소환해 주세요.');
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.glb';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        button.disabled = true;
        button.textContent = '🐋 모델 불러오는 중…';

        try {
          const { GLTFLoader } = await import(
            'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js'
          );

          const buffer = await file.arrayBuffer();
          const gltf = await new GLTFLoader()
            .parseAsync(buffer, '');

          const model = new THREE.Group();

          // 사이버 고래의 방향 및 크기 조정
          model.rotation.y = 2.34;
          model.scale.setScalar(1.8);
          model.add(gltf.scene);

          const center = new THREE.Box3()
            .setFromObject(model)
            .getCenter(new THREE.Vector3());

          model.position.sub(center);

          // GLB 안의 꼬리 형태 키 검색
          const targets = [];

          model.traverse(node => {
            if (
              !node.isMesh ||
              !node.morphTargetDictionary
            ) return;

            const lift =
              node.morphTargetDictionary.TailLift;

            const slam =
              node.morphTargetDictionary.TailSlam;

            if (
              Number.isInteger(lift) &&
              Number.isInteger(slam)
            ) {
              targets.push({ node, lift, slam });
            }
          });

          if (!targets.length) {
            throw new Error(
              'TailLift / TailSlam을 찾지 못했습니다.'
            );
          }

          // 새 GLB가 준비된 후에만 외형 교체
          if (cyberPreview.object) {
            whale.root.remove(cyberPreview.object);
          }

          whale.root.add(model);

          for (const child of whale.root.children) {
            if (
              child !== model &&
              !child.isSprite
            ) {
              child.visible = false;
            }
          }

          cyberPreview.object = model;
          cyberPreview.targets = targets;

          say('✅ 사이버 고래 미리보기 적용 완료!');

        } catch (error) {
          console.error(
            '사이버 고래 로딩 실패',
            error
          );

          say('모델을 열지 못했습니다. F12 콘솔을 확인해 주세요.');

        } finally {
          button.disabled = false;
          button.textContent = '🐋 사이버 고래 불러오기';
        }
      };

      input.click();
    };
  }

  addCyberPreviewButton();
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

case 'boss_tail_warning':
  tailWarningUntil =
    performance.now() +
    Math.max(0, Number(m.leadMs) || 1400);

  tailWarning.hidden = false;
  tailWarning.textContent =
    '🐋 고래 꼬리 광역공격 준비! 점프해서 피하세요!';
  return true;

case 'boss_tail_strike':
  tailWarningUntil = 0;
  tailWarning.hidden = true;

  tailStrikeTime = performance.now();

  createTailShockwave();
  return true;

case 'boss_tail_result':
  if (m.dodged) {
    say('✅ 점프 성공! 고래 공격 회피 · 피해 0');
  } else {
    say('💥 고래 꼬리 공격 적중! HP -40');
  }
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
        bossPos.y+Math.sin(now*0.00145)*0.15;

      // 수영하듯 꼬리를 흔들고 가슴지느러미를 움직인다.
      whale.tail.rotation.y=
        Math.sin(now*0.0025)*0.25;

      whale.tail.rotation.z=
        Math.sin(now*0.0025+0.6)*0.08;

      whale.nearFin.rotation.z=
        Math.sin(now*0.0018)*0.07;

      whale.farFin.rotation.z=
        -Math.sin(now*0.0018)*0.07;

      // 분수처럼 올라갔다 사라지는 물방울.
      for(const drop of whale.water) {
        const progress=
          (now*0.00055+drop.userData.phase)%1;

        const arc=Math.sin(progress*Math.PI);

        drop.position.set(
          Math.sin(progress*Math.PI*2)*0.20,
          0.06+progress*0.68,
          Math.cos(progress*Math.PI*2)*0.15
        );

        drop.scale.setScalar(
          0.7+arc*0.65
        );

        drop.material.opacity=
          Math.max(0,arc*0.68);
      }

      const scale=now-recentHit<200
        ? 1+Math.sin((now-recentHit)*0.055)*0.015
        : 1;

      whale.root.scale.setScalar(scale);
    }

updateTailEffects(now);

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


// ==========================================
// JMC 고래 보스 꼬리 내려치기 및 공격 범위
// ==========================================

const JMC_TAIL_RADIUS = 8;

let jmcTailWarnEnd = 0;
let jmcTailSlamAt = -1000000;

// 바닥 공격 범위 표시
const jmcDangerZone = new THREE.Group();
jmcDangerZone.position.set(0, 0, -13);

// 원 내부: 반투명 붉은색
const jmcDangerFill = new THREE.Mesh(
  new THREE.CircleGeometry(JMC_TAIL_RADIUS, 72),
  new THREE.MeshBasicMaterial({
    color: 0xff413c,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);

jmcDangerFill.rotation.x = -Math.PI / 2;
jmcDangerFill.position.y = 0.045;
jmcDangerZone.add(jmcDangerFill);

// 원 테두리
const jmcDangerEdge = new THREE.Mesh(
  new THREE.RingGeometry(
    JMC_TAIL_RADIUS - 0.14,
    JMC_TAIL_RADIUS,
    96
  ),
  new THREE.MeshBasicMaterial({
    color: 0xff5645,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);

jmcDangerEdge.rotation.x = -Math.PI / 2;
jmcDangerEdge.position.y = 0.07;
jmcDangerZone.add(jmcDangerEdge);

jmcDangerZone.visible = false;
scene.add(jmcDangerZone);

// 공격 순간 확산하는 충격파
const jmcTailWave = new THREE.Mesh(
  new THREE.RingGeometry(0.93, 1.1, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffb357,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  })
);

jmcTailWave.rotation.x = -Math.PI / 2;
jmcTailWave.position.set(0, 0.1, -13);
jmcTailWave.visible = false;
scene.add(jmcTailWave);

// 공격 경고 문구
const jmcTailNotice = document.createElement('div');

jmcTailNotice.style.cssText = `
  position:absolute;
  z-index:90;
  left:50%;
  top:60px;
  transform:translateX(-50%);
  width:max-content;
  max-width:calc(100% - 20px);
  padding:10px 14px;
  box-sizing:border-box;
  border:1px solid #ff885e;
  border-radius:9px;
  background:rgba(90,19,19,.94);
  color:#fff;
  font:bold 13px Arial,sans-serif;
  text-align:center;
  pointer-events:none;
`;

jmcTailNotice.hidden = true;
sceneEl.appendChild(jmcTailNotice);

// 서버 공격 메시지 연결
function jmcTailOnMessage(m) {

  if (m.type === 'boss_tail_warning') {
    jmcTailWarnEnd =
      performance.now() +
      Math.max(0, Number(m.leadMs) || 1400);

    jmcTailNotice.hidden = false;
    return true;
  }

  if (m.type === 'boss_tail_strike') {
    jmcTailWarnEnd = 0;
    jmcTailSlamAt = performance.now();
    jmcTailNotice.hidden = true;
    return true;
  }

  if (m.type === 'boss_tail_result') {

    if (m.outOfRange) {
      say('✅ 공격 범위 밖! 피해 0');
    } else if (m.dodged) {
      say('✅ 점프 성공! 고래 공격 회피');
    } else {
      say('💥 고래 꼬리 공격 적중! HP -40');
    }

    return true;
  }

  // 기존 고래 보스 메시지는 그대로 처리
  return onMessage(m);
}

// 꼬리 내려치기 애니메이션
function jmcTailUpdate(now, dt) {

  // 기존 고래 수영 동작과 효과 갱신
  update(now, dt);

  const active =
    current.state === 'active' &&
    !!whale?.root.visible;

  const remaining = jmcTailWarnEnd - now;
  const strikeAge = now - jmcTailSlamAt;

  if (!active) {
    jmcTailWarnEnd = 0;
    jmcDangerZone.visible = false;
    jmcTailWave.visible = false;
    jmcTailNotice.hidden = true;
    return;
  }

  // 공격 1.4초 전: 원형 범위 표시
  jmcDangerZone.visible = remaining > 0;
  jmcTailNotice.hidden = remaining <= 0;

  if (remaining > 0) {

    const progress =
      1 - Math.min(1, remaining / 1400);

    // 위험 구역 깜빡임
    jmcDangerFill.material.opacity =
      0.12 + 0.09 * Math.sin(now * 0.018) ** 2;

    jmcDangerEdge.material.opacity =
      0.65 + 0.35 * Math.sin(now * 0.018) ** 2;

    jmcTailNotice.textContent =
      `🐋 꼬리 공격 ${(remaining / 1000).toFixed(1)}초 전! 점프하거나 원 밖으로!`;

    // 꼬리를 위로 들어 올림
    whale.tail.rotation.z =
      -0.15 - 0.85 * progress;

    whale.tail.rotation.y = 0;

  } else if (
    strikeAge >= 0 &&
    strikeAge < 850
  ) {

    const progress = strikeAge / 850;

    // 빠르게 내려친 다음 원래 자세로 복귀
    if (progress < 0.27) {

      whale.tail.rotation.z =
        -1.0 + 2.25 * (progress / 0.27);

    } else {

      const recover =
        (progress - 0.27) / 0.73;

      whale.tail.rotation.z =
        1.25 * (1 - recover);
    }

    whale.tail.rotation.y = 0;
  }

  
  // 기존 수영 동작보다 나중에 적용하는 큰 꼬리 강타 애니메이션
  // 꼬리자루 전체를 키우고 몸통도 함께 기울여 움직임을 강조한다.
  if (remaining > 0) {

    // 공격 예고 1.4초: 꼬리를 높이 들어 올림
    const lift = Math.max(
      0,
      Math.min(1, 1 - remaining / 1400)
    );

    const eased = lift * lift * (3 - 2 * lift);

    whale.tail.rotation.set(
      0,
      -0.14 * eased,
      -1.45 * eased
    );

    whale.tail.scale.setScalar(1 + 0.9 * eased);

    whale.root.rotation.z = -0.12 * eased;
    whale.root.position.y += 0.18 * eased;

  } else if (strikeAge >= 0 && strikeAge < 1200) {

    // 공격 시작 후 0.3초: 꼬리를 빠르게 내려침
    if (strikeAge < 300) {

      const t = strikeAge / 300;
      const slam = 1 - (1 - t) * (1 - t) * (1 - t);

      whale.tail.rotation.set(
        0,
        -0.14 * (1 - slam),
        -1.45 + 3.1 * slam
      );

      whale.tail.scale.setScalar(1.9);

      whale.root.rotation.z = -0.12 + 0.35 * slam;
      whale.root.position.y += 0.18 - 0.42 * slam;

    } else {

      // 공격 후 0.9초: 원래 자세로 복귀
      const t = Math.min(
        1,
        (strikeAge - 300) / 900
      );

      const eased = t * t * (3 - 2 * t);

      whale.tail.rotation.set(
        0,
        0,
        1.65 * (1 - eased)
      );

      whale.tail.scale.setScalar(
        1 + 0.9 * (1 - eased)
      );

      whale.root.rotation.z = 0.23 * (1 - eased);
      whale.root.position.y -= 0.24 * (1 - eased);
    }

  } else {

    // 공격이 끝나면 평상시 수영 동작 복원
    whale.tail.scale.setScalar(1);
    whale.root.rotation.z = 0;
  }

  // ==========================================
  // GLB 사이버 고래 꼬리 내려치기
  // 기존 공격 시간과 동기화
  // ==========================================

  if (cyberPreview.targets.length) {
    let lift = 0;
    let slam = 0;

    // 공격 예고: 1.4초 동안 꼬리 들어 올리기
    if (remaining > 0) {
      const p = THREE.MathUtils.clamp(
        1 - remaining / 1400,
        0,
        1
      );

      lift = p * p * (3 - 2 * p);

    // 공격 순간: 0.22초 동안 빠르게 내려치기
    } else if (
      strikeAge >= 0 &&
      strikeAge < 220
    ) {
      const p = strikeAge / 220;

      lift = 1 - p;
      slam = p * p * (3 - 2 * p);

    // 공격 후: 원래 자세로 복귀
    } else if (
      strikeAge >= 220 &&
      strikeAge < 1000
    ) {
      const p = (strikeAge - 220) / 780;

      slam = 1 - p * p * (3 - 2 * p);
    }

    for (const target of cyberPreview.targets) {
      target.node.morphTargetInfluences[
        target.lift
      ] = lift;

      target.node.morphTargetInfluences[
        target.slam
      ] = slam;
    }
  }
  // 내려치는 순간 충격파 생성
  jmcTailWave.visible =
    strikeAge >= 0 &&
    strikeAge < 750;

  if (jmcTailWave.visible) {

    const progress = strikeAge / 750;

    jmcTailWave.scale.setScalar(
      0.6 + progress * 7.4
    );

    jmcTailWave.material.opacity =
      0.9 * (1 - progress);
  }
}

// 새 공격 기능과 기존 기능을 함께 실행
return {
  onMessage: jmcTailOnMessage,
  update: jmcTailUpdate
};
}
