import {installMissileClient} from './missile-client.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import {createBossClient} from './boss-client.js?v=20261120-whale-scale-99';
const $ = id => document.getElementById(id);

const animals = [
  ['seal','아기물개','🦭',0xe9f0ed],
  ['cat','고양이','🐱',0xd89b61],
  ['dog','강아지','🐶',0xc9945b],
  ['rabbit','토끼','🐰',0xf1e9e3],
  ['fox','여우','🦊',0xe7833d],
  ['panda','판다','🐼',0xf0eee8],
  ['bear','곰','🐻',0x9b6548],
  ['penguin','펭귄','🐧',0x293746],
  ['frog','개구리','🐸',0x6bba59],
  ['hamster','햄스터','🐹',0xe6bb83],
  ['lion','사자','🦁',0xd5a052],
  ['tiger','호랑이','🐯',0xe69a40],
  ['koala','코알라','🐨',0x9ea7ae],
  ['raccoon','너구리','🦝',0x777d81],
  ['deer','사슴','🦌',0xb87d54],
  ['ichigo','쿠로사키 이치고','⚔️',0xf2782e]
].map(([id,name,emoji,color])=>({
  id,name,emoji,color
}));

const animal = id =>
  animals.find(a=>a.id===id) || animals[0];

const symbols = ['BTC','ETH','SOL','XRP'].map((id,i)=>({
  id,
  name:['비트코인','이더리움','솔라나','리플'][i],
  price:null,
  candles:[]
}));

const ranges = {
  '1h':[60,60],
  '1d':[900,96],
  '1w':[3600,168]
};

const money = n =>
  Number.isFinite(n)
    ? '$'+n.toLocaleString('en-US',{
        minimumFractionDigits:2,
        maximumFractionDigits:2
      })
    : '연결 대기';

const angle = a =>
  Math.atan2(Math.sin(a),Math.cos(a));

function turn(current,target,max){
  const diff = angle(target-current);
  return Math.abs(diff)<=max
    ? target
    : current+Math.sign(diff)*max;
}

const isMobileDevice = window.matchMedia(
  '(max-width: 980px), (pointer: coarse)'
).matches;

const renderPixelRatio = Math.min(
  window.devicePixelRatio || 1,
  isMobileDevice ? 1.75 : 2
);

const CHARACTER_SCALE = 0.7;

const CAMERA_BASE_DISTANCE = isMobileDevice ? 7.5 : 6.8;
const CAMERA_MAX_DISTANCE = isMobileDevice ? 25 : 18;
const CAMERA_HEIGHT = isMobileDevice ? 3.2 : 3.3;
const CAMERA_FOLLOW_SPEED = 9;

const BOARD_Z = -18.65;
const BOARD_WIDTH = 23;
const sphere = new THREE.SphereGeometry(1,20,14);

function makeAnimal(id){
  const a = animal(id);
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();

  root.scale.setScalar(CHARACTER_SCALE);
  root.add(bodyGroup);

  const mat = (color,roughness=.84) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness:0
    });

  const fur = mat(a.color);
  const light = mat(0xffe9d4);
  const dark = mat(0x20212b);
  const pink = mat(0xe98f9d);
  const white = mat(0xffffff);
  const brown = mat(0x7d4b30);

  function orb(parent,x,y,z,sx,sy,sz,material){
    const m = new THREE.Mesh(sphere,material);
    m.position.set(x,y,z);
    m.scale.set(sx,sy,sz);
    parent.add(m);
    return m;
  }

  function cone(parent,x,y,z,r,h,material,rotation=0){
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(r,h,12),
      material
    );
    m.position.set(x,y,z);
    m.rotation.z = rotation;
    parent.add(m);
    return m;
  }

  // 이치고: 추가 모델 파일이 없어도 보이는 Three.js 기본 형상 아바타
  if(id==='ichigo'){
    const skin=mat(0xf2bd96), black=mat(0x17191e), orange=mat(0xf67627);
    const cloth=mat(0x161922), silver=mat(0xd8e9f2,.33);
    const bladeMat=new THREE.MeshStandardMaterial({color:0xd5e8f7,metalness:.8,roughness:.25,emissive:0x142b49});
    orb(bodyGroup,0,1.14,0,.43,.63,.28,cloth);
    // 흰색 하오리 안쪽 옷깃
    for(const x of [-.18,.18]){
      const collar=orb(bodyGroup,x,1.56,.27,.11,.34,.055,white);
      collar.rotation.z=x>0?.42:-.42;
    }
    orb(bodyGroup,0,1.95,.02,.43,.46,.40,skin);
    orb(bodyGroup,0,2.26,-.07,.48,.24,.4,orange);
    for(let i=0;i<12;i++){
      const x=((i%6)-2.5)*.17;
      const z=i<6?.20:-.26;
      const spike=cone(bodyGroup,x,2.48+(i%3)*.06,z,.16,.56,orange,(i%2?-.34:.34));
      spike.rotation.x=i<6?-.15:.2;
    }
    for(const x of [-.18,.18]){
      orb(bodyGroup,x,2.04,.4,.075,.055,.035,black);
      orb(bodyGroup,x,2.12,.4,.12,.025,.03,orange);
    }
    // 검은 사신복 소매와 다리
    for(const x of [-.51,.51]){
      const sleeve=orb(bodyGroup,x,1.29,.03,.24,.5,.25,cloth);
      sleeve.rotation.z=x>0?-.23:.23;
    }
    for(const x of [-.22,.22]){
      orb(bodyGroup,x,.47,0,.20,.48,.22,cloth);
      orb(bodyGroup,x,.16,.13,.24,.13,.29,black);
    }
    const belt=orb(bodyGroup,0,.82,.05,.49,.10,.32,white);
    belt.rotation.z=.02;
    // 오른손에 든 참백도: 어두운 손잡이와 은빛 장검
    const sword=new THREE.Group();
    sword.position.set(.7,.97,.12);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,.52,8),black);
    grip.position.y=.13;
    const guard=new THREE.Mesh(new THREE.BoxGeometry(.42,.065,.11),silver);
    guard.position.y=.42;
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.14,1.45,.045),bladeMat);
    blade.position.y=1.17;
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.10,.28,4),bladeMat);
    tip.position.y=2.01;
    tip.rotation.y=Math.PI/4;
    sword.add(grip,guard,blade,tip);
    sword.rotation.z=-.32;
    sword.rotation.x=.14;
    bodyGroup.add(sword);
    root.userData.ichigoSword=sword;
  } else {
  orb(bodyGroup,0,.91,0,.53,.68,.42,fur);
  orb(bodyGroup,0,1.82,.1,.67,.61,.58,fur);
  orb(bodyGroup,0,.92,.37,.36,.45,.1,light);

  for(const x of [-.31,.31]){
    for(const z of [-.23,.24]){
      orb(bodyGroup,x,.32,z,.18,.32,.2,fur);
    }
  }

  if(['rabbit','deer'].includes(id)){
    for(const x of [-.39,.39]){
      const e = orb(
        bodyGroup,x,2.48,.04,
        .2,id==='rabbit'?.59:.42,.16,fur
      );
      e.rotation.z = x>0 ? -.18 : .18;

      if(id==='rabbit'){
        const inner = orb(
          bodyGroup,x,2.49,.19,
          .11,.41,.04,pink
        );
        inner.rotation.z = e.rotation.z;
      }
    }
  }else if(['seal','penguin','frog'].includes(id)){
    if(id==='frog'){
      for(const x of [-.43,.43]){
        orb(bodyGroup,x,2.26,.39,.24,.24,.21,fur);
      }
    }
  }else{
    for(const x of [-.47,.47]){
      if(['cat','fox','tiger','raccoon'].includes(id)){
        cone(
          bodyGroup,x,2.39,.04,
          .24,.5,fur,x>0?-.23:.23
        );
      }else{
        orb(bodyGroup,x,2.36,.02,.26,.3,.2,fur);
      }
    }
  }

  if(['panda','raccoon'].includes(id)){
    for(const x of [-.29,.29]){
      orb(bodyGroup,x,1.91,.58,.24,.24,.06,dark);
    }
  }

  if(id==='penguin'){
    orb(bodyGroup,0,1.04,.35,.36,.52,.11,white);
    orb(bodyGroup,0,1.87,.57,.46,.4,.1,white);
  }

  if(['fox','cat','dog','hamster','lion'].includes(id)){
    orb(bodyGroup,0,1.56,.57,.42,.24,.14,light);
  }

  for(const x of [-.26,.26]){
    orb(bodyGroup,x,1.93,.62,.14,.17,.09,white);
    orb(bodyGroup,x,1.93,.695,.09,.12,.05,dark);
    orb(bodyGroup,x-.03,1.98,.738,.033,.042,.015,white);
  }

  if(id==='frog'){
    for(const x of [-.43,.43]){
      orb(bodyGroup,x,2.28,.55,.15,.16,.1,white);
      orb(bodyGroup,x,2.28,.64,.08,.11,.045,dark);
    }
  }

  if(id==='penguin'){
    cone(
      bodyGroup,0,1.63,.7,
      .19,.36,mat(0xf2aa43),Math.PI/2
    );
  }else{
    orb(
      bodyGroup,0,1.65,.69,.16,.11,.12,
      ['dog','bear','koala','raccoon','seal','panda']
        .includes(id) ? dark : pink
    );
  }

  for(const x of [-.42,.42]){
    orb(bodyGroup,x,1.68,.57,.13,.085,.035,pink);
  }

  if(!['seal','penguin','frog'].includes(id)){
    const tail = orb(
      bodyGroup,0,.9,-.52,
      id==='fox'?.34:.2,
      id==='fox'?.37:.25,
      id==='fox'?.5:.3,
      fur
    );
    tail.rotation.x = -.35;
  }

  if(id==='seal'){
    for(const x of [-.54,.54]){
      const fin = orb(
        bodyGroup,x,.55,.12,.31,.13,.42,fur
      );
      fin.rotation.z = x>0 ? -.45 : .45;
    }
    orb(bodyGroup,0,.29,-.47,.46,.13,.29,fur);
  }

  if(id==='penguin'){
    for(const x of [-.57,.57]){
      const wing = orb(
        bodyGroup,x,1.05,0,.19,.47,.2,fur
      );
      wing.rotation.z = x>0 ? -.35 : .35;
    }
  }

  if(id==='lion'){
    orb(
      bodyGroup,0,1.82,-.05,
      .83,.79,.54,mat(0xa56c31)
    );
    orb(bodyGroup,0,1.84,.43,.6,.54,.26,fur);

    for(const x of [-.26,.26]){
      orb(bodyGroup,x,1.93,.67,.14,.17,.09,white);
      orb(bodyGroup,x,1.93,.74,.09,.12,.05,dark);
    }
    orb(bodyGroup,0,1.65,.73,.15,.1,.1,dark);
  }

  if(id==='tiger'){
    for(const x of [-.42,.42]){
      for(const y of [1.65,1.91,2.12]){
        const stripe = orb(
          bodyGroup,x,y,.47,.11,.045,.1,dark
        );
        stripe.rotation.z = x>0 ? .35 : -.35;
      }
    }
  }

  if(id==='deer'){
    for(const x of [-.34,.34]){
      cone(
        bodyGroup,x,2.75,-.06,
        .09,.75,brown,x>0?-.3:.3
      );
    }
  }

  if(id==='koala'){
    orb(bodyGroup,0,1.68,.72,.22,.29,.16,dark);
    for(const x of [-.65,.65]){
      orb(bodyGroup,x,2.38,.06,.3,.33,.13,fur);
    }
  }

  if(id==='hamster'){
    for(const x of [-.46,.46]){
      orb(bodyGroup,x,1.64,.45,.29,.25,.2,light);
    }
  }

  } // 기존 동물 모델 분기 종료

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.7,24),
    new THREE.MeshBasicMaterial({
      color:0x000000,
      transparent:true,
      opacity:.2,
      depthWrite:false
    })
  );

  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = .02;
  root.add(shadow);

  root.userData.bodyGroup = bodyGroup;
  root.userData.targetDirection = Math.PI;
  root.userData.animal = id;
  root.userData.walk = 0;
  root.userData.seated = false;
root.userData.jumpHeight = 0;

// ========================================
// ========================================
// 캐릭터 배 중앙: 미니멀 전적 아이콘
// ========================================

const markerCanvas = document.createElement('canvas');
markerCanvas.width = 128;
markerCanvas.height = 128;

const markerCtx = markerCanvas.getContext('2d');

// 반투명 원형 배경
markerCtx.beginPath();
markerCtx.arc(64, 64, 50, 0, Math.PI * 2);
markerCtx.fillStyle = 'rgba(12, 32, 53, 0.58)';
markerCtx.fill();

// 얇은 테두리
markerCtx.strokeStyle = 'rgba(190, 226, 255, 0.7)';
markerCtx.lineWidth = 3;
markerCtx.stroke();

// 막대그래프 아이콘
markerCtx.fillStyle = '#d6efff';

markerCtx.fillRect(35, 65, 12, 25);
markerCtx.fillRect(58, 49, 12, 41);
markerCtx.fillRect(81, 36, 12, 54);

// 아이콘 아래 기준선
markerCtx.strokeStyle = '#d6efff';
markerCtx.lineWidth = 3;
markerCtx.beginPath();
markerCtx.moveTo(30, 94);
markerCtx.lineTo(99, 94);
markerCtx.stroke();

const markerTexture = new THREE.CanvasTexture(
  markerCanvas
);

markerTexture.colorSpace = THREE.SRGBColorSpace;

const marker = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: markerTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  })
);

// 기존 위치 유지, 크기만 축소
marker.position.set(0, 1.06, 0.57);
marker.scale.set(0.40, 0.40, 1);
marker.renderOrder = 85;

root.add(marker);
root.userData.pvpMarker = marker;

return root;
}

// ====================================================
// 캐릭터 머리 위 HP 바 (본인 및 다른 참가자)
// ====================================================
function addCharacterHpBar(avatar,hp=100,maxHp=100){
  const canvas=document.createElement('canvas');
  canvas.width=256;
  canvas.height=80;

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;

  const sprite=new THREE.Sprite(
    new THREE.SpriteMaterial({
      map:texture,
      transparent:true,
      depthTest:false,
      depthWrite:false
    })
  );

  sprite.position.set(0,2.8,0);
  sprite.scale.set(2.4,.75,1);
  sprite.renderOrder=90;
  avatar.add(sprite);

  avatar.userData.hpBar={
    canvas,texture,sprite,hp:null,maxHp:null
  };
  setCharacterHpBar(avatar,hp,maxHp);
}

function setCharacterHpBar(avatar,hp,maxHp=100){
  const bar=avatar?.userData.hpBar;
  if(!bar)return;

  const max=Math.max(1,Number(maxHp)||100);
  const current=Math.max(0,
    Math.min(max,Math.round(Number(hp)||0))
  );
  if(bar.hp===current && bar.maxHp===max)return;

  bar.hp=current;
  bar.maxHp=max;

  const ctx=bar.canvas.getContext('2d');
  ctx.clearRect(0,0,256,80);
  ctx.fillStyle='rgba(8,18,30,.88)';
  ctx.beginPath();
  ctx.roundRect(8,6,240,68,12);
  ctx.fill();

  ctx.textAlign='center';
  ctx.font='bold 24px Arial';
  ctx.fillStyle='#fff';
  ctx.fillText(`HP ${current} / ${max}`,128,32);

  ctx.fillStyle='#57323d';
  ctx.fillRect(20,44,216,18);
  ctx.fillStyle=current/max>.5?'#43de9a':
    current/max>.25?'#f0bc52':'#f16c7c';
  ctx.fillRect(20,44,216*current/max,18);
  ctx.strokeStyle='rgba(255,255,255,.65)';
  ctx.lineWidth=1;
  ctx.strokeRect(20,44,216,18);

  bar.texture.needsUpdate=true;
}

function removeCharacterHpBar(avatar){
  const bar=avatar?.userData.hpBar;
  if(!bar)return;
  avatar.remove(bar.sprite);
  bar.sprite.material.dispose();
  bar.texture.dispose();
  delete avatar.userData.hpBar;
}

// ====================================================
// 캐릭터 머리 위 닉네임 (HP 바 위쪽)
// ====================================================
function setCharacterName(avatar, value) {
  if (!avatar) return;
  const name=String(value ?? '').trim().slice(0,16);
  const old=avatar.userData.nameTag;
  if(old?.name===name) {
    old.sprite.position.y = avatar.userData.npcMode === 'npc' ? 2.65 : 3.55;
    return;
  }
  if(old) {
    avatar.remove(old.sprite);
    old.sprite.material.dispose();
    old.texture.dispose();
    delete avatar.userData.nameTag;
  }
  if(!name) return;
  const canvas=document.createElement('canvas');
  canvas.width=512;
  canvas.height=120;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,512,120);
  ctx.fillStyle='rgba(8,18,30,.90)';
  ctx.beginPath();
  ctx.roundRect(18,10,476,94,22);
  ctx.fill();
  ctx.lineWidth=3;
  ctx.strokeStyle='rgba(220,195,140,.75)';
  ctx.stroke();
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle='#ffffff';
  ctx.font='bold 47px Arial,sans-serif';
  ctx.fillText(name,256,58,446);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:texture,transparent:true,depthTest:false,depthWrite:false
  }));
  sprite.position.set(0,avatar.userData.npcMode === 'npc' ? 2.65 : 3.55,0);
  sprite.scale.set(2.75,.68,1);
  sprite.renderOrder=95;
  avatar.add(sprite);
  avatar.userData.nameTag={name,sprite,texture};
}

function removeCharacterName(avatar) {
  if(!avatar) return;
  const tag=avatar.userData.nameTag;
  if(!tag)return;
  avatar.remove(tag.sprite);
  tag.sprite.material.dispose();
  tag.texture.dispose();
  delete avatar.userData.nameTag;
}
const previewScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(
  35,1,.1,40
);

previewCamera.position.set(0,1.6,7.7);
previewCamera.lookAt(0,1.45,0);

previewScene.add(
  new THREE.HemisphereLight(0xffffff,0x56758d,2.5)
);

const previewLight = new THREE.DirectionalLight(
  0xffe8c4,3.2
);

previewLight.position.set(3,6,5);
previewScene.add(previewLight);

const previewRenderer = new THREE.WebGLRenderer({
  alpha:true,
  antialias:!isMobileDevice,
  powerPreference:'low-power'
});

previewRenderer.setPixelRatio(renderPixelRatio);
$('animal-preview').appendChild(
  previewRenderer.domElement
);

let previewModel = null;
let previewAngle = 0;
let previewDragging = false;
let previewX = 0;
let selectedAnimal = 'seal';

function selectAnimal(id){
  selectedAnimal = id;

  if(previewModel){
    previewScene.remove(previewModel);
  }

  previewModel = makeAnimal(id);
  previewScene.add(previewModel);
  previewAngle = 0;

  $('selected-animal-name').textContent =
    animal(id).name;

  document.querySelectorAll('.animal-option')
    .forEach(b=>{
      b.classList.toggle(
        'selected',
        b.dataset.animal===id
      );
    });
}

const animalGrid = $('animal-grid');

for(const a of animals){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'animal-option';
  b.dataset.animal = a.id;

  const e = document.createElement('span');
  e.className = 'animal-emoji';
  e.textContent = a.emoji;

  const n = document.createElement('span');
  n.className = 'animal-name';
  n.textContent = a.name;

  b.append(e,n);
  b.onclick = ()=>selectAnimal(a.id);
  animalGrid.append(b);
}

selectAnimal('seal');

const previewEl = $('animal-preview');

previewEl.addEventListener('pointerdown',e=>{
  previewDragging = true;
  previewX = e.clientX;
  previewEl.setPointerCapture(e.pointerId);
});

previewEl.addEventListener('pointermove',e=>{
  if(previewDragging){
    previewAngle += (e.clientX-previewX)*.013;
    previewX = e.clientX;
  }
});

for(const event of [
  'pointerup',
  'pointercancel',
  'lostpointercapture'
]){
  previewEl.addEventListener(event,()=>{
    previewDragging = false;
  });
}

function resizePreview(){
  const r = previewEl.getBoundingClientRect();
  if(!r.width || !r.height)return;

  previewRenderer.setSize(
    r.width,r.height,false
  );

  previewCamera.aspect = r.width/r.height;
  previewCamera.updateProjectionMatrix();
}

new ResizeObserver(resizePreview).observe(previewEl);

let visitorId = null;

try {
  visitorId = localStorage.getItem('jmc-visitor-id');

  if (
    !visitorId ||
    !/^[0-9a-f-]{36}$/i.test(visitorId)
  ) {
    visitorId = crypto.randomUUID();

    localStorage.setItem(
      'jmc-visitor-id',
      visitorId
    );
  }
} catch (error) {
  console.warn('[JMC] Visitor ID unavailable:', error);
}

const INVENTORY_TOKEN_KEY = 'jmc-inventory-token';
let inventoryToken = '';

try {
  inventoryToken =
    localStorage.getItem(INVENTORY_TOKEN_KEY) || '';

  if (!/^[0-9a-f]{64}$/i.test(inventoryToken)) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    inventoryToken = Array.from(bytes)
      .map(value => value.toString(16).padStart(2, '0'))
      .join('');

    localStorage.setItem(
      INVENTORY_TOKEN_KEY,
      inventoryToken
    );
  }
} catch (error) {
  console.warn('[JMC] Inventory token unavailable:', error);
}

let profile = null;
let myAvatar = null;
let activeSymbol = null;
let activeRange = '1d';
let socket = null;
let myId = null;
let yaw = Math.PI;
let defeated = false;
let reentryRequired = false;
let myHp = 100;

try{
  reentryRequired =
    sessionStorage.getItem('jmc-reentry-required')==='1';
}catch{}

try{
  const p = JSON.parse(
    localStorage.getItem('jmc-profile')
  );

  if(p?.name){
    profile = {
      name:String(p.name).slice(0,16),
      animal:animal(p.animal).id
    };
  }
}catch{}

function showProfile(editing=false){
  selectedAnimal = profile?.animal || 'seal';
  selectAnimal(selectedAnimal);
  $('nickname').value = profile?.name || '';
  $('profile-error').textContent = '';
  $('cancel-profile').hidden = !editing;
  $('enter-lounge').textContent =
    editing ? '설정 저장하기' : '게스트로 입장하기';

  $('profile-modal').hidden = false;
  resizePreview();
}

function saveProfile(){
  const name = $('nickname').value.trim().slice(0,16);

  if(!name){
    $('profile-error').textContent = '닉네임을 입력해주세요.';
    return;
  }

  const first = !profile;
  profile = {
    name,
    animal:selectedAnimal
  };

  try{
    localStorage.setItem(
      'jmc-profile',
      JSON.stringify(profile)
    );
  }catch{}

  $('profile-modal').hidden = true;
  $('my-profile').textContent =
    `${animal(profile.animal).emoji} ${name}`;

  updateMyAvatar();

  if(first || reentryRequired){
    resetToBoard();
  }

  reentryRequired=false;
  try{
    sessionStorage.removeItem('jmc-reentry-required');
  }catch{}
  sendProfile();
}

$('enter-lounge').onclick = saveProfile;

// ========================================
// Google 로그인 + 게스트 입장
// ========================================

const jmcGoogleButton = document.createElement('button');
jmcGoogleButton.type = 'button';
jmcGoogleButton.id = 'jmc-google-login';
jmcGoogleButton.textContent = 'Google 계정으로 로그인';
jmcGoogleButton.style.cssText = `
  display:block;width:100%;margin-top:9px;padding:11px 10px;
  border:1px solid #b7c7d6;border-radius:10px;
  background:#fff;color:#223246;font:bold 13px Arial,sans-serif;
  cursor:pointer;box-sizing:border-box;
`;
$('enter-lounge').insertAdjacentElement('afterend',jmcGoogleButton);

const jmcAuthNote = document.createElement('div');
jmcAuthNote.id = 'jmc-google-auth-note';
jmcAuthNote.style.cssText =
  'padding:7px 3px;font:12px Arial,sans-serif;text-align:center;color:#9bb7c9;';
jmcGoogleButton.insertAdjacentElement('afterend',jmcAuthNote);

const jmcAccountButton = document.createElement('button');
jmcAccountButton.type = 'button';
jmcAccountButton.id = 'jmc-account-button';
jmcAccountButton.textContent = '게스트 · 로그인';
jmcAccountButton.style.cssText = `
  margin-left:8px;padding:6px 9px;border:1px solid #7290a5;
  border-radius:8px;background:#15283c;color:#fff;
  font:11px Arial,sans-serif;cursor:pointer;
`;
$('rename').insertAdjacentElement('afterend',jmcAccountButton);

// Google 로그인 상태에서는 설정창 밖에서도 로그아웃할 수 있게 표시.
const jmcHeaderLogoutButton = document.createElement('button');
jmcHeaderLogoutButton.type = 'button';
jmcHeaderLogoutButton.id = 'jmc-header-google-logout';
jmcHeaderLogoutButton.textContent = '로그아웃';
jmcHeaderLogoutButton.hidden = true;
jmcHeaderLogoutButton.style.cssText = `
  margin-left:5px;padding:6px 9px;border:1px solid #8c9aaf;
  border-radius:8px;background:#26364a;color:#fff;
  font:700 11px Arial,sans-serif;cursor:pointer;
  display:none;
`;
jmcAccountButton.insertAdjacentElement('afterend',jmcHeaderLogoutButton);


// ====================================================
// Google 계정별 고정 닉네임 / 대표 캐릭터 설정
// ====================================================

const jmcAccountModal=document.createElement('div');
jmcAccountModal.id='jmc-account-profile-modal';
jmcAccountModal.hidden=true;
jmcAccountModal.style.cssText=`
  position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);
  display:none;align-items:center;justify-content:center;
  padding:16px;box-sizing:border-box;
`;

const jmcAccountCard=document.createElement('div');
jmcAccountCard.style.cssText=`
  width:min(460px,100%);max-height:90vh;overflow-y:auto;
  background:#112337;color:#fff;padding:22px;border-radius:16px;
  border:1px solid #6e8a9e;box-sizing:border-box;
`;

const jmcAccountTitle=document.createElement('h3');
jmcAccountTitle.textContent='Google 계정 프로필 설정';

const jmcAccountDesc=document.createElement('p');
jmcAccountDesc.textContent=
  '계정 고정 닉네임과 대표 캐릭터를 등록하세요. 라운지 입장 닉네임은 별도로 바꿀 수 있습니다.';
jmcAccountDesc.style.cssText=
  'font-size:13px;line-height:1.5;color:#b5cad9';

const jmcNicknameInput=document.createElement('input');
jmcNicknameInput.placeholder='고정 닉네임 (2~16자)';
jmcNicknameInput.maxLength=16;
jmcNicknameInput.style.cssText=
  'width:100%;padding:12px;border-radius:8px;box-sizing:border-box';

const jmcCheckButton=document.createElement('button');
jmcCheckButton.type='button';
jmcCheckButton.textContent='닉네임 중복 확인';
jmcCheckButton.style.cssText=`
  display:block;
  width:100%;
  margin-top:10px;
  padding:13px 12px;
  border:1px solid #ffe2a3;
  border-radius:10px;
  background:linear-gradient(135deg,#dfbd72,#f3d99e);
  color:#202d3c;
  font:800 14px Arial,sans-serif;
  cursor:pointer;
  box-shadow:0 0 14px rgba(240,200,119,.35);
  transition:background .2s,box-shadow .2s,transform .2s;
`;

const jmcNicknameMessage=document.createElement('div');
jmcNicknameMessage.style.cssText=
  'min-height:28px;padding-top:7px;font-size:13px';

const jmcAnimalLabel=document.createElement('p');
jmcAnimalLabel.textContent='대표 캐릭터 선택';

const jmcAnimalSelector=document.createElement('select');
jmcAnimalSelector.style.cssText=
  'width:100%;padding:11px;border-radius:8px;box-sizing:border-box';

for(const a of animals) {
  const opt=document.createElement('option');
  opt.value=a.id;
  opt.textContent=`${a.emoji} ${a.name}`;
  jmcAnimalSelector.appendChild(opt);
}

const jmcAccountSave=document.createElement('button');
jmcAccountSave.type='button';
jmcAccountSave.textContent='계정 프로필 저장';
jmcAccountSave.disabled=true;
jmcAccountSave.style.cssText=
  'width:100%;padding:12px;margin-top:18px;border-radius:8px;background:#dfc18d;cursor:pointer';

const jmcAccountCancel=document.createElement('button');
jmcAccountCancel.type='button';
jmcAccountCancel.textContent='취소';
jmcAccountCancel.style.cssText=
  'width:100%;padding:9px;margin-top:8px;cursor:pointer';

jmcAccountCard.append(
  jmcAccountTitle,
  jmcAccountDesc,
  jmcNicknameInput,
  jmcCheckButton,
  jmcNicknameMessage,
  jmcAnimalLabel,
  jmcAnimalSelector,
  jmcAccountSave,
  jmcAccountCancel
);

jmcAccountModal.appendChild(jmcAccountCard);
document.body.appendChild(jmcAccountModal);

let jmcCheckedNickname='';
let jmcProfileRequired=false;
// 닉네임 중복 확인 유도
const jmcCheckStyle = document.createElement('style');

jmcCheckStyle.textContent = `
  @keyframes jmcNicknamePulse {
    0%, 100% {
      box-shadow:0 0 8px rgba(240,200,119,.25);
    }
    50% {
      box-shadow:0 0 22px rgba(240,200,119,.75);
    }
  }

  #jmc-account-profile-modal .jmc-check-needed {
    animation:jmcNicknamePulse 1.6s ease-in-out infinite;
  }

  @media (prefers-reduced-motion:reduce) {
    #jmc-account-profile-modal .jmc-check-needed {
      animation:none;
    }
  }
`;

document.head.appendChild(jmcCheckStyle);

function jmcUpdateCheckGuide(checked) {
  jmcCheckButton.classList.toggle(
    'jmc-check-needed',
    !checked
  );

  if (checked) {
    jmcCheckButton.textContent = '✓ 닉네임 중복 확인 완료';
    jmcCheckButton.style.background = '#245d4c';
    jmcCheckButton.style.color = '#baffdc';
    jmcCheckButton.style.borderColor = '#63e6ae';
    jmcCheckButton.style.boxShadow = 'none';
  } else {
    jmcCheckButton.textContent = '① 닉네임 중복 확인하기';
    jmcCheckButton.style.background =
      'linear-gradient(135deg,#dfbd72,#f3d99e)';
    jmcCheckButton.style.color = '#202d3c';
    jmcCheckButton.style.borderColor = '#ffe2a3';
    jmcCheckButton.style.boxShadow = '';
  }
}
function jmcOpenAccountProfile(required=false) {
  if(!jmcGoogleUser)return;

  jmcProfileRequired=required || !jmcGoogleUser.accountNickname;

  jmcAccountModal.hidden=false;
  jmcAccountModal.style.display='flex';
  jmcNicknameInput.value=jmcGoogleUser.accountNickname || '';
  jmcAnimalSelector.value=jmcGoogleUser.accountAnimal || 'seal';
  jmcCheckedNickname='';
  jmcAccountSave.disabled=true;
  jmcUpdateCheckGuide(false);
  jmcNicknameMessage.textContent='닉네임 중복 확인을 눌러주세요.';
  jmcNicknameMessage.style.color='#b5cad9';
  jmcAccountCancel.textContent=
    jmcProfileRequired?'게스트로 돌아가기 (로그아웃)':'취소';
}

function jmcCloseAccountProfile() {
  jmcAccountModal.hidden=true;
  jmcAccountModal.style.display='none';
}

jmcNicknameInput.addEventListener('input',()=>{
  jmcCheckedNickname='';
  jmcAccountSave.disabled=true;
  jmcNicknameMessage.textContent='닉네임 중복 확인이 필요합니다.';
  jmcNicknameMessage.style.color='#b5cad9';
});

jmcCheckButton.onclick=async()=>{
  const nickname=jmcNicknameInput.value.normalize('NFC').trim();
  jmcCheckedNickname='';
  jmcAccountSave.disabled=true;
  jmcCheckButton.disabled=true;

  try {
    const response=await fetch(
      `/api/auth/profile/check?nickname=${encodeURIComponent(nickname)}`,
      {credentials:'same-origin',cache:'no-store'}
    );

    const result=await response.json();

    if(jmcNicknameInput.value.normalize('NFC').trim()!==nickname) return;
    if(!response.ok) throw Error(result.error || '확인 실패');

    if(result.available) {
      jmcCheckedNickname=nickname;
      jmcAccountSave.disabled=false;
      jmcUpdateCheckGuide(true);
      jmcNicknameMessage.textContent='사용 가능한 닉네임입니다.';
      jmcNicknameMessage.style.color='#63e6ae';
    } else {
      jmcNicknameMessage.textContent='이미 사용 중인 닉네임입니다.';
      jmcNicknameMessage.style.color='#ff9090';
    }
  }catch(error) {
    jmcNicknameMessage.textContent=error.message;
    jmcNicknameMessage.style.color='#ff9090';
  }finally{
    jmcCheckButton.disabled=false;
  }
};

jmcAccountSave.onclick=async()=>{
  const nickname=jmcNicknameInput.value.normalize('NFC').trim();

  if(!jmcCheckedNickname || jmcCheckedNickname!==nickname) {
    jmcNicknameMessage.textContent='먼저 닉네임 중복 확인을 해주세요.';
    return;
  }

  jmcAccountSave.disabled=true;

  try {
    const response=await fetch('/api/auth/profile',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        nickname,
        animal:jmcAnimalSelector.value
      })
    });

    const result=await response.json();
    if(!response.ok) throw Error(result.error || '저장 실패');

    location.reload();
  }catch(error) {
    jmcNicknameMessage.textContent=error.message;
    jmcNicknameMessage.style.color='#ff9090';
    jmcCheckedNickname='';
  }
};

jmcAccountCancel.onclick=async()=>{
  if(jmcProfileRequired) {
    try {
      await fetch('/api/auth/logout',{
        method:'POST',
        credentials:'same-origin'
      });
      location.reload();
    }catch(error){
      jmcNicknameMessage.textContent=
        '로그아웃에 실패했습니다. 다시 시도해 주세요.';
    }
  }else{
    jmcCloseAccountProfile();
  }
};

let jmcGoogleUser = null;
let jmcGoogleEnabled = false;

async function jmcLoadGoogleStatus() {
  try {
    const response = await fetch(
      '/api/auth/me',
      {credentials:'same-origin',cache:'no-store'}
    );

    if (!response.ok) throw new Error('인증 서버 응답 실패');

    const data = await response.json();
    jmcGoogleUser = data.user || null;
// Google 로그인: 계정 닉네임과 캐릭터 통일
if (jmcGoogleUser?.accountNickname) {
  profile = {
    name: jmcGoogleUser.accountNickname,
    animal: animal(
      jmcGoogleUser.accountAnimal || 'seal'
    ).id
  };

  $('profile-modal').hidden = true;

  $('my-profile').textContent =
    `${animal(profile.animal).emoji} ${profile.name}`;

  // 기존 재입장 절차 완료
  if (reentryRequired && !defeated) {
    resetToBoard();

    reentryRequired = false;

    try {
      sessionStorage.removeItem(
        'jmc-reentry-required'
      );
    } catch {}
  }

  updateMyAvatar();

  // 구글 계정 프로필로 서버 입장
  sendProfile();
}
    if (jmcGoogleUser) {
      if (!jmcGoogleUser.accountNickname) {
        // Google 계정 프로필을 아직 설정하지 않은 경우
        jmcOpenAccountProfile(true);
      }
    } else {
      // 게스트는 최초 입장 또는 사망 후 재입장 시
      // 기존 캐릭터 설정 절차 유지
      if (!profile || reentryRequired) {
        showProfile();
      }
    }

    jmcGoogleEnabled = data.configured === true;

    jmcGoogleButton.hidden =
      !jmcGoogleEnabled && !jmcGoogleUser;

    jmcGoogleButton.textContent = jmcGoogleUser
      ? 'Google 계정 로그아웃'
      : 'Google 계정으로 로그인';

    jmcAuthNote.textContent = jmcGoogleUser
      ? `${jmcGoogleUser.name || 'Google 이용자'} · 결정은 Google 계정에 보관됩니다.`
      : '게스트도 고래의 결정 조합과 선물상자 개봉을 이용할 수 있습니다.';

    jmcAccountButton.textContent = jmcGoogleUser
      ? `Google · ${jmcGoogleUser.name || '로그인'}`
      : '게스트 · 로그인';

    jmcHeaderLogoutButton.hidden = !jmcGoogleUser;
    jmcHeaderLogoutButton.style.display = jmcGoogleUser ? 'inline-block' : 'none';

  } catch(error) {
    jmcAuthNote.textContent =
      '계정 상태를 불러오지 못했습니다. 게스트로는 입장할 수 있습니다.';

    jmcGoogleButton.hidden = true;
    jmcHeaderLogoutButton.hidden = true;
    jmcHeaderLogoutButton.style.display = 'none';

    // 인증 확인 실패 시에도 게스트 설정창은 정상 표시
    if (!profile || reentryRequired) {
      showProfile();
    }
  }
}

jmcGoogleButton.onclick = async () => {
  jmcGoogleButton.disabled = true;

  try {
    if (jmcGoogleUser) {
      const response = await fetch('/api/auth/logout',{
        method:'POST',
        credentials:'same-origin'
      });

      if (!response.ok) throw new Error('로그아웃 실패');

      location.reload();
      return;
    }

    const response = await fetch('/api/auth/google/start',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({inventoryToken})
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      throw new Error(
        data.error || 'Google 인증을 시작할 수 없습니다.'
      );
    }

    location.assign(data.url);

  } catch(error) {
    jmcAuthNote.textContent = error.message;
    jmcGoogleButton.disabled = false;
  }
};

jmcHeaderLogoutButton.onclick = () => {
  if (!jmcGoogleUser || jmcGoogleButton.disabled) return;
  jmcGoogleButton.click(); // 기존 로그아웃 API·오류 처리 재사용
};

jmcAccountButton.onclick = () => {
  if (jmcGoogleUser) {
    jmcOpenAccountProfile(false);
    return;
  }

  showProfile(true);
  jmcGoogleButton.hidden = !jmcGoogleEnabled && !jmcGoogleUser;
};

void jmcLoadGoogleStatus();

$('cancel-profile').onclick = ()=>{
  if(profile){
    $('profile-modal').hidden = true;
  }
};

$('rename').onclick = () => {
  if (jmcGoogleUser) {
    jmcOpenAccountProfile(false);
  } else {
    showProfile(true);
  }
};

$('nickname').addEventListener('keydown',e=>{
  if(e.key==='Enter')saveProfile();
});

// Google 로그인 상태 확인 전에는
// 캐릭터 설정창을 표시하지 않음
$('profile-modal').hidden = true;

if (profile) {
  $('my-profile').textContent =
    `${animal(profile.animal).emoji} ${profile.name}`;
}

function plotChart(canvas,candles,mini=false){
  const c = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  c.fillStyle = '#081421';
  c.fillRect(0,0,w,h);

  const data = (candles||[]).filter(d=>
    [d.open,d.high,d.low,d.close].every(Number.isFinite)
  );

  if(!data.length){
    c.fillStyle = '#8ba4ba';
    c.font = '16px sans-serif';
    c.fillText('캔들 데이터 연결 대기',20,h/2);
    return;
  }

  const lo = Math.min(...data.map(d=>d.low));
  const hi = Math.max(...data.map(d=>d.high));
  const pad = (hi-lo)*.08 || 1;
  const min = lo-pad;
  const max = hi+pad;

  const L = mini?12:28;
  const R = mini?12:90;
  const T = mini?12:24;
  const B = mini?12:30;

  const W = w-L-R;
  const H = h-T-B;
  const step = W/data.length;
  const y = v => T+(max-v)/(max-min)*H;

  c.strokeStyle = '#1d3548';

  for(let i=0;i<=4;i++){
    const yy = T+H*i/4;

    c.beginPath();
    c.moveTo(L,yy);
    c.lineTo(w-R,yy);
    c.stroke();

    if(!mini){
      c.fillStyle = '#809ab0';
      c.font = '13px sans-serif';
      c.fillText(
        (max-(max-min)*i/4).toFixed(2),
        w-R+7,
        yy+4
      );
    }
  }

  data.forEach((d,i)=>{
    const x = L+step*(i+.5);
    const color =
      d.close>=d.open ? '#42dfbd' : '#f17a98';

    c.strokeStyle = color;
    c.fillStyle = color;

    c.beginPath();
    c.moveTo(x,y(d.high));
    c.lineTo(x,y(d.low));
    c.stroke();

    const top = y(Math.max(d.open,d.close));
    const bottom = y(Math.min(d.open,d.close));

    const bw = Math.max(
      1.5,
      Math.min(step*.65,mini?8:16)
    );

    c.fillRect(
      x-bw/2,
      top,
      bw,
      Math.max(1.5,bottom-top)
    );
  });
}

function renderAssets(){
  const parent = $('assets');
  parent.replaceChildren();

  for(const s of symbols){
    const card = document.createElement('div');
    card.className = 'crypto-asset';

    const head = document.createElement('div');
    head.className = 'crypto-head';

    const left = document.createElement('div');
    const title = document.createElement('strong');
    const ticker = document.createElement('small');

    title.textContent = s.name;
    ticker.textContent = s.id+' / USD';
    left.append(title,ticker);

      const right = document.createElement('div');
    right.className = 'price';
    right.textContent = money(s.price);

    const note = document.createElement('span');
    note.className = 'change';
    note.textContent = 'USD · Coinbase';

    right.append(note);
    head.append(left,right);

    const canvas = document.createElement('canvas');
    canvas.className = 'spark-chart';
    canvas.width = 580;
    canvas.height = 155;

    plotChart(canvas,s.candles,true);
    card.append(head,canvas);
    card.onclick = ()=>openDetail(s);
    parent.append(card);
  }
}

async function loadCandles(id,range='1d'){
  const [granularity,limit] = ranges[range];

  const r = await fetch(
    `/api/candles/${id}?granularity=${granularity}&limit=${limit}`,
    {cache:'no-store'}
  );

  if(!r.ok)throw Error('Candles');

  const d = await r.json();
  return d.candles || [];
}

async function updatePrices(){
  await Promise.all(symbols.map(async s=>{
    try{
      const r = await fetch(
        `/api/price/${s.id}`,
        {cache:'no-store'}
      );

      if(!r.ok)throw Error('Price');

      const v = Number(
        (await r.json()).price
      );

      s.price = Number.isFinite(v)?v:null;
    }catch{
      s.price = null;
    }
  }));

  renderAssets();
  refreshBoard();

  if(activeSymbol){
    $('detail-price').textContent =
      money(activeSymbol.price);
  }
}

async function updateCandles(){
  await Promise.all(symbols.map(async s=>{
    try{
      s.candles = await loadCandles(s.id);
    }catch(e){
      console.warn(s.id,e.message);
    }
  }));

  renderAssets();
  refreshBoard();

  if(activeSymbol && activeRange==='1d'){
    updateDetailChart();
  }
}

function openDetail(s){
  activeSymbol = s;
  activeRange = '1d';

  $('detail-name').textContent =
    `${s.name} (${s.id})`;

  $('detail-price').textContent =
    money(s.price);

  $('detail').hidden = false;

  document.querySelectorAll('[data-range]')
    .forEach(b=>{
      b.classList.toggle(
        'selected',
        b.dataset.range==='1d'
      );
    });

  updateDetailChart();
}

async function updateDetailChart(){
  const s = activeSymbol;
  const r = activeRange;

  if(!s)return;

  $('chart-status').textContent =
    '캔들 차트를 불러오는 중...';

  try{
    const data =
      r==='1d' && s.candles.length
        ? s.candles
        : await loadCandles(s.id,r);

    if(s!==activeSymbol || r!==activeRange)return;

    plotChart($('detail-chart'),data);

    $('chart-status').textContent =
      'Coinbase OHLC 캔들 차트';
  }catch{
    plotChart($('detail-chart'),[]);
    $('chart-status').textContent =
      '차트 연결에 실패했습니다.';
  }
}

document.querySelectorAll('[data-range]')
  .forEach(b=>{
    b.onclick = ()=>{
      activeRange = b.dataset.range;

      document.querySelectorAll('[data-range]')
        .forEach(x=>{
          x.classList.toggle(
            'selected',
            x===b
          );
        });

      updateDetailChart();
    };
  });

$('close').onclick = ()=>{
  $('detail').hidden = true;
  activeSymbol = null;
};

$('detail').onclick = e=>{
  if(e.target===$('detail')){
    $('close').click();
  }
};

const sceneEl = $('scene');

// ========================================
// JMC NPC 관전 모드: 3종 반투명 3D 아바타
// 서버가 지정한 외형만 사용하며 브라우저에서 랜덤 선정하지 않음
// ========================================
const NPC_FORM_NAMES = {
  ghost_seal: '꼬마 유령 물범',
  holo_drone: '홀로그램 드론',
  mongle: '몽글이'
};
let npcMode = 'combat';
let npcPendingMode = null;
let npcTransitionEndsAt = 0;
let npcCooldownEndsAt = 0;
let npcForm = null;
let npcServerOffset = 0;

function makeNpcModel(form) {
  const group = new THREE.Group();
  group.userData.npcForm = form;
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x82ecff, emissive: 0x2dbde5, emissiveIntensity: .4,
    transparent: true, opacity: .58, roughness: .28,
    metalness: .12, depthWrite: false
  });
  const mint = new THREE.MeshStandardMaterial({
    color: 0x7bffdc, emissive: 0x30bba0, emissiveIntensity: .38,
    transparent: true, opacity: .59, depthWrite: false
  });
  const white = new THREE.MeshBasicMaterial({color:0xecffff,transparent:true,opacity:.83,depthWrite:false});
  const dark = new THREE.MeshBasicMaterial({color:0x17334c,transparent:true,opacity:.92,depthWrite:false});
  const neon = new THREE.MeshBasicMaterial({color:0x70fff0,transparent:true,opacity:.74,depthWrite:false,side:THREE.DoubleSide});
  const add = (geometry,material,x,y,z,sx=1,sy=1,sz=1)=>{
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);
    mesh.scale.set(sx,sy,sz);
    group.add(mesh);
    return mesh;
  };
  const ball = (mat,x,y,z,sx,sy,sz)=>add(new THREE.SphereGeometry(1,16,12),mat,x,y,z,sx,sy,sz);
  if(form==='ghost_seal') {
    // 살짝 떠 있는 유령 꼬리 + 물범 얼굴·지느러미
    ball(cyan,0,1.28,0,.66,.78,.54);
    ball(cyan,0,.77,-.29,.39,.38,.37);
    for(const x of [-.57,.57]){
      const fin=ball(cyan,x,.91,.16,.32,.13,.38);
      fin.rotation.z=x>0?-.42:.42;
    }
    for(const x of [-.24,.24]){
      ball(white,x,1.52,.48,.15,.17,.085);
      ball(dark,x,1.52,.56,.073,.10,.042);
    }
    ball(dark,0,1.25,.56,.13,.095,.065);
    ball(cyan,0,.36,-.48,.29,.35,.33);
  } else if(form==='holo_drone') {
    ball(cyan,0,1.40,0,.53,.43,.5);
    ball(dark,0,1.44,.43,.35,.19,.11);
    for(const x of [-.17,.17]) ball(neon,x,1.46,.544,.07,.07,.027);
    const torus=new THREE.TorusGeometry(.74,.043,7,44);
    const ring1=add(torus,neon,0,1.38,0);
    ring1.rotation.x=Math.PI/2.8;
    const ring2=add(torus,cyan,0,1.38,0);
    ring2.rotation.y=Math.PI/2.5;
    group.userData.rings=[ring1,ring2];
    ball(white,0,1.39,-.49,.13,.13,.13);
  } else {
    // 몽글이: 둥근 물방울 형태의 민트빛 작은 정령
    ball(mint,0,1.28,0,.62,.68,.52);
    ball(mint,-.34,1.55,-.11,.35,.31,.32);
    ball(mint,.35,1.48,-.08,.35,.32,.3);
    ball(mint,0,.81,0,.46,.31,.37);
    for(const x of [-.23,.23]){
      ball(white,x,1.42,.48,.15,.17,.07);
      ball(dark,x,1.43,.542,.075,.10,.03);
    }
    ball(dark,0,1.17,.52,.115,.055,.027);
    for(const x of [-.39,.39]) ball(neon,x,.78,.22,.16,.16,.15);
  }
  return group;
}

function setNpcAppearance(avatar, mode, form) {
  if(!avatar) return;
  const isNpc = mode === 'npc' && Boolean(NPC_FORM_NAMES[form]);
  const activeForm = isNpc ? form : null;
  if(avatar.userData.npcAppliedForm===activeForm) return;
  if(avatar.userData.npcVisual) {
    const old=avatar.userData.npcVisual;
    avatar.remove(old);
    old.traverse(obj=>{
      if(obj.isMesh) {
        obj.geometry?.dispose();
        if(Array.isArray(obj.material)) obj.material.forEach(mat=>mat.dispose());
        else obj.material?.dispose();
      }
    });
    delete avatar.userData.npcVisual;
  }
  avatar.userData.npcAppliedForm=activeForm;
  avatar.userData.npcMode=isNpc?'npc':'combat';
  if(avatar.userData.bodyGroup) avatar.userData.bodyGroup.visible=!isNpc;
  if(avatar.userData.pvpMarker) avatar.userData.pvpMarker.visible=!isNpc;
  if(isNpc) {
    const visual=makeNpcModel(activeForm);
    avatar.add(visual);
    avatar.userData.npcVisual=visual;
  }
  if(avatar.userData.hpBar?.sprite)
    avatar.userData.hpBar.sprite.visible=!isNpc;
  // 머리 위 이름표에는 관전 상태를 분명히 표시
  const label=avatar.userData.originalNpcName;
  if(label) setCharacterName(avatar,isNpc?`${label} · 관전중`:label);
  // NPC가 작아진 만큼 닉네임도 내려오고 복귀 시 원래 높이로 복원
  if(avatar.userData.nameTag?.sprite) {
    avatar.userData.nameTag.sprite.position.y = isNpc ? 2.65 : 3.55;
  }
}

function animateNpcModel(avatar, now) {
  const visual=avatar?.userData?.npcVisual;
  if(!visual)return;
  const t=now*.001;
  visual.position.y=Math.sin(t*2.6)*.10;
  if(visual.userData.rings){
    visual.userData.rings[0].rotation.z=t*.75;
    visual.userData.rings[1].rotation.y=t*.85;
  }
}

function updateNpcLocalAvatar() {
  if(!myAvatar || !profile)return;
  myAvatar.userData.originalNpcName=profile.name;
  setNpcAppearance(myAvatar,npcMode,npcForm);
}

// PC·모바일 공통: 관전 모드 버튼 하나에 전환 시간·쿨타임 표시
const npcModePanel=document.createElement('div');
npcModePanel.id='jmc-npc-mode-panel';
npcModePanel.style.cssText=`
  position:absolute;
  top:8px;
  right:8px;
  z-index:48;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  max-width:calc(100% - 16px);
  pointer-events:none;
`;
const npcModeButton=document.createElement('button');
npcModeButton.type='button';
npcModeButton.style.cssText=`
  pointer-events:auto;min-width:120px;padding:9px 12px;border-radius:12px;
  border:1px solid rgba(158,244,230,.7);
  background:rgba(12,39,55,.95);color:#e9fff9;
  box-shadow:0 4px 14px rgba(0,0,0,.3);
  font:700 12px Arial,sans-serif;cursor:pointer;touch-action:manipulation;
  white-space:nowrap;
`;

// 모바일에서만 관전 모드 버튼 축소
const npcMobileStyle=document.createElement('style');
npcMobileStyle.textContent=`
  @media (max-width:980px), (pointer:coarse) {
    #jmc-npc-mode-panel button {
      min-width:0 !important;
      max-width:135px !important;
      padding:5px 7px !important;
      font-size:9px !important;
      line-height:1.3 !important;
      border-radius:7px !important;
      white-space:normal !important;
      text-align:center !important;
      overflow-wrap:break-word !important;
    }
  }
`;
document.head.appendChild(npcMobileStyle);
npcModePanel.appendChild(npcModeButton);
sceneEl.appendChild(npcModePanel);

function updateNpcUi() {
  const canUse=Boolean(profile) && !defeated && !reentryRequired &&
    socket?.readyState===WebSocket.OPEN && $('profile-modal').hidden;
  npcModePanel.style.display=canUse?'flex':'none';
  const currentServerNow=Date.now()+npcServerOffset;
  const remaining=Math.max(0,Math.ceil((npcTransitionEndsAt-currentServerNow)/1000));
  const cooldownSeconds=Math.max(0,Math.ceil((npcCooldownEndsAt-currentServerNow)/1000));

if(npcPendingMode) {
  npcModeButton.disabled=true;
  npcModeButton.textContent=npcPendingMode==='npc'
    ? `🛡 관전 모드 ${remaining}초 · 공격 불가`
    : `⚔ 전투 복귀 ${remaining}초`;
  npcModeButton.title=npcPendingMode==='npc'
    ? '전환 대기 중 피격 가능 · 공격 불가'
    : '복귀 대기 중 공격 면역 · 공격 불가';
  npcModeButton.style.opacity='.75';
} else {
    const coolingDown=npcMode==='combat' && cooldownSeconds>0;
    npcModeButton.disabled=!canUse || coolingDown;
    npcModeButton.style.opacity=coolingDown?'.7':'1';
    npcModeButton.textContent=coolingDown
      ? `🛡 관전 대기 ${cooldownSeconds}초`
      : npcMode==='npc'?'⚔ 전투 모드로':'🛡 관전 모드';
    npcModeButton.title=coolingDown
      ? '전투 복귀 후 60초 동안 관전 모드 재전환 제한'
      : npcMode==='npc'
        ? `${NPC_FORM_NAMES[npcForm]||'관전 중'} · 공격 면역 · 미사일 충전 정지`
        : '관전 모드 전환 10초 · 전투 모드 복귀 5초';
  }
}

npcModeButton.addEventListener('click',()=>{
  if(npcPendingMode || defeated || reentryRequired || !profile ||
     (npcMode==='combat' && Date.now()+npcServerOffset<npcCooldownEndsAt))return;
  send({type:'npc_mode_request',mode:npcMode==='npc'?'combat':'npc'});
  npcModeButton.disabled=true;
});

function applyNpcModeState(m) {
  npcMode=m.mode==='npc'?'npc':'combat';
  npcPendingMode=m.pendingMode==='npc'||m.pendingMode==='combat'
    ?m.pendingMode:null;
  npcTransitionEndsAt=Number(m.transitionEndsAt)||0;
  npcCooldownEndsAt=Number(m.npcCooldownEndsAt)||0;
  npcForm=NPC_FORM_NAMES[m.form]?m.form:null;
  if(Number.isFinite(Number(m.serverNow)))
    npcServerOffset=Number(m.serverNow)-Date.now();
  updateNpcLocalAvatar();
  updateNpcUi();
}


// ====================================================
// JMC 메타버스 내부 라이브 채팅
// 접힘: 최신 1줄 / 펼침: 최근 3줄
// ====================================================

function installSceneLiveChat() {
  const panel = document.querySelector('.chat-panel');
  const messages = $('messages');
  const form = $('chat-form');

  if (!sceneEl || !panel || !messages || !form) return;
  if (panel.classList.contains('jmc-scene-chat')) return;

  panel.classList.add('jmc-scene-chat','jmc-chat-collapsed');
  sceneEl.appendChild(panel);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'jmc-live-chat-toggle';
  toggle.className = 'jmc-chat-toggle';
  toggle.setAttribute('aria-controls','messages');
  toggle.setAttribute('aria-expanded','false');
  toggle.textContent = '펼치기 ▲';
  panel.appendChild(toggle);

  let chatStage = 0;

  toggle.addEventListener('click', () => {
    chatStage = (chatStage + 1) % 3;

    panel.classList.toggle(
      'jmc-chat-collapsed',
      chatStage === 0
    );

    panel.classList.toggle(
      'jmc-chat-large',
      chatStage === 2
    );

    toggle.textContent =
      chatStage === 0 ? '펼치기 ▲' :
      chatStage === 1 ? '더 펼치기 ▲' :
      '접기 ▼';

    toggle.setAttribute(
      'aria-expanded',
      String(chatStage !== 0)
    );

    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  });

  const style = document.createElement('style');
  style.id = 'jmc-scene-chat-style';
  style.textContent = `
    #scene > .jmc-scene-chat {
      position:absolute !important;
      left:14px !important;
      bottom:15px !important;
      right:auto !important;
      top:auto !important;
      z-index:45 !important;
      width:min(450px,calc(100% - 28px)) !important;
      height:auto !important;
      min-height:0 !important;
      max-height:none !important;
      margin:0 !important;
      padding:0 !important;
      border:0 !important;
      border-radius:13px !important;
      background:transparent !important;
      box-shadow:none !important;
      display:flex !important;
      flex-direction:column !important;
      gap:6px !important;
      overflow:visible !important;
      box-sizing:border-box;
    }

    #scene > .jmc-scene-chat .panel-head {
      display:none !important;
    }

    #scene > .jmc-scene-chat #messages {
      display:block !important;
      flex:none !important;
      box-sizing:border-box !important;
      height:83px !important;
      min-height:83px !important;
      max-height:83px !important;
      margin:0 !important;
      padding:8px 84px 8px 10px !important;
      overflow-x:hidden !important;
      overflow-y:auto !important;
      border:1px solid rgba(214,231,248,.2) !important;
      border-radius:12px !important;
      background:rgba(9,15,27,.76) !important;
      color:#f0f4fa !important;
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      font-size:12px !important;
      line-height:22px !important;
    }

    #scene > .jmc-scene-chat #messages > .msg {
      display:block !important;
      box-sizing:border-box !important;
      height:auto !important;
      min-height:22px !important;
      line-height:22px !important;
      margin:0 !important;
      padding:0 !important;
      white-space:normal !important;
      overflow:visible !important;
      text-overflow:clip !important;
      overflow-wrap:anywhere !important;
      word-break:break-word !important;
    }

    /* 접힌 채팅창은 마지막 메시지 한 줄만 미리보기 */
    #scene > .jmc-scene-chat.jmc-chat-collapsed
    #messages > .msg {
      height:22px !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
    }

    #scene > .jmc-scene-chat:not(.jmc-chat-large)
    #messages > .msg:nth-last-child(n+4) {
      display:none !important;
    }

    #scene > .jmc-scene-chat #messages > .msg b {
      color:#9ce8ca !important;
    }

    #scene > .jmc-scene-chat #messages:empty::before {
      content:'실시간 채팅을 기다리는 중...';
      color:#b0c0d0;
      font-size:12px;
      line-height:22px;
    }

    #scene > .jmc-scene-chat #chat-form {
      display:flex !important;
      flex:none !important;
      align-items:center !important;
      gap:6px !important;
      width:100% !important;
      margin:0 !important;
      padding:5px 6px !important;
      box-sizing:border-box !important;
      border:1px solid rgba(214,231,248,.17) !important;
      border-radius:24px !important;
      background:rgba(9,15,27,.88) !important;
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
    }

    #scene > .jmc-scene-chat #chat-input {
      flex:1 !important;
      min-width:0 !important;
      width:auto !important;
      height:36px !important;
      margin:0 !important;
      padding:0 12px !important;
      border:0 !important;
      outline:none !important;
      border-radius:18px !important;
      background:transparent !important;
      color:#fff !important;
      font-size:13px !important;
    }

    #scene > .jmc-scene-chat #chat-form button {
      flex:none !important;
      min-width:55px;
      height:36px;
      padding:0 13px !important;
      border:0 !important;
      border-radius:18px !important;
      background:#e4c58d !important;
      color:#172334 !important;
      font-size:12px;
      font-weight:800;
      cursor:pointer;
    }

    #scene > .jmc-scene-chat .jmc-chat-toggle {
      position:absolute !important;
      top:5px !important;
      right:6px !important;
      z-index:4 !important;
      height:26px !important;
      min-width:66px !important;
      padding:0 8px !important;
      border:1px solid rgba(255,255,255,.18) !important;
      border-radius:14px !important;
      background:rgba(37,48,65,.96) !important;
      color:white !important;
      font-size:11px !important;
      font-weight:700;
      cursor:pointer;
    }

    #scene > .jmc-scene-chat.jmc-chat-collapsed {
      gap:0 !important;
    }

    #scene > .jmc-scene-chat.jmc-chat-collapsed #messages {
      height:36px !important;
      min-height:36px !important;
      max-height:36px !important;
      padding-top:6px !important;
      padding-bottom:6px !important;
    }

    #scene > .jmc-scene-chat.jmc-chat-collapsed
    #messages > .msg:not(:last-child) {
      display:none !important;
    }

    #scene > .jmc-scene-chat.jmc-chat-large #messages {
      height:min(245px,45dvh) !important;
      min-height:min(245px,45dvh) !important;
      max-height:min(245px,45dvh) !important;
      overflow-x:hidden !important;
      overflow-y:auto !important;
      overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch;
      touch-action:pan-y;
    }

    @media (max-width:980px),(pointer:coarse) {
      #scene:has(> .jmc-scene-chat.jmc-chat-large)
      #mobile-controls,
      #scene:has(> .jmc-scene-chat.jmc-chat-large)
      #mobile-actions {
        display:none !important;
      }
      #scene > .jmc-scene-chat {
        left:8px !important;
        bottom:8px !important;
        width:min(420px,calc(100% - 16px)) !important;
      }
      #scene > .jmc-scene-chat #messages {
        font-size:11px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

installSceneLiveChat();

// 채팅 최대 100자 제한
const jmcChatInput = document.getElementById('chat-input');

if (jmcChatInput) {
  jmcChatInput.maxLength = 100;
}

// ========================================
// 마법 발사 / 피격 효과음
// ========================================

let sfxEnabled = true;
let audioCtx = null;

try {
  sfxEnabled = localStorage.getItem('jmc-sfx-enabled') !== '0';
} catch {}

function getAudioContext() {
  if (!sfxEnabled) return null;

  try {
    if (!audioCtx) {
      const AudioClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioClass) return null;
      audioCtx = new AudioClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    return audioCtx;
  } catch {
    return null;
  }
}

document.addEventListener(
  'pointerdown',getAudioContext,{passive:true}
);
document.addEventListener('keydown',getAudioContext);

function playSfxTone(type,startHz,endHz,duration,volume) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running' || volume <= 0) return;

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startHz,now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1,endHz),now+duration
  );

  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(.0002,volume),now+.012
  );
  gain.gain.exponentialRampToValueAtTime(
    .0001,now+duration
  );

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now+duration+.02);

  oscillator.onended=()=>{
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playMagicCastSfx(volume=1) {
  if(!sfxEnabled || volume<=0)return;
  playSfxTone('sawtooth',1000,260,.20,.040*volume);
  playSfxTone('sine',1450,680,.14,.024*volume);
}

function playMagicHitSfx(volume=1) {
  if(!sfxEnabled || volume<=0)return;
  playSfxTone('triangle',260,65,.18,.095*volume);
  playSfxTone('square',650,100,.10,.022*volume);
}

function magicSoundVolume(x,z) {
  if(
    !myAvatar ||
    !Number.isFinite(x) ||
    !Number.isFinite(z)
  ){
    return .7;
  }

  const distance=Math.hypot(
    x-myAvatar.position.x,
    z-myAvatar.position.z
  );

  return Math.max(0,1-distance/20);
}

const sfxButton=document.createElement('button');
sfxButton.type='button';
sfxButton.id='jmc-sfx-toggle';
sfxButton.textContent=sfxEnabled
  ?'🔊 효과음 ON':'🔇 효과음 OFF';

sfxButton.style.cssText=`
  position:absolute;top:12px;right:12px;z-index:30;
  padding:9px 13px;background:rgba(7,20,33,.9);
  color:white;border:1px solid #dfc18d;border-radius:9px;
  cursor:pointer;font-size:13px;
`;

sfxButton.onclick=()=>{
  sfxEnabled=!sfxEnabled;
  sfxButton.textContent=sfxEnabled
    ?'🔊 효과음 ON':'🔇 효과음 OFF';

  try {
    localStorage.setItem(
      'jmc-sfx-enabled',sfxEnabled?'1':'0'
    );
  }catch{}

  if(sfxEnabled)getAudioContext();
};

const loungeBadge = document.querySelector('.scene-head .pill');
const loungeHeader = document.querySelector('.scene-head');

if (isMobileDevice && loungeHeader) {
  loungeHeader.style.flexDirection = 'column';
  loungeHeader.style.alignItems = 'stretch';

  const sfxRow = document.createElement('div');
  sfxRow.style.cssText=`
    display:flex;
    justify-content:flex-end;
    width:100%;
    margin-top:4px;
  `;

  sfxButton.style.position = 'static';
  sfxButton.style.top = 'auto';
  sfxButton.style.right = 'auto';
  sfxButton.style.whiteSpace = 'nowrap';
  sfxButton.style.flexShrink = '0';

  sfxRow.appendChild(sfxButton);
  loungeHeader.appendChild(sfxRow);

} else if (loungeBadge) {
  loungeBadge.style.position = 'relative';
  loungeBadge.appendChild(sfxButton);

  sfxButton.style.position = 'absolute';
  sfxButton.style.top = 'calc(100% + 8px)';
  sfxButton.style.right = '0';
  sfxButton.style.whiteSpace = 'nowrap';
  sfxButton.style.zIndex = '40';

} else {
  sceneEl.appendChild(sfxButton);
}

const scene=new THREE.Scene();
scene.background=new THREE.Color('#080f1b');
scene.fog=new THREE.Fog('#080f1b',25,80);

const camera=new THREE.PerspectiveCamera(74,1,.1,120);

const renderer = new THREE.WebGLRenderer({
  antialias:true,
  powerPreference:'high-performance'
});

renderer.setPixelRatio(renderPixelRatio);
renderer.domElement.style.display='block';
renderer.domElement.style.position='absolute';
renderer.domElement.style.left='0';
renderer.domElement.style.top='0';
renderer.domElement.style.width='100%';
renderer.domElement.style.height='100%';
renderer.domElement.style.touchAction='none';
renderer.domElement.style.zIndex='0';

sceneEl.appendChild(renderer.domElement);

scene.add(
  new THREE.HemisphereLight(
    0x9bc9e0,0x0b1524,2.2
  )
);

function box(w,h,d,color,x,y,z){
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({
      color,
      metalness:.35,
      roughness:.55
    })
  );

  mesh.position.set(x,y,z);
  scene.add(mesh);
  return mesh;
}

box(42,.4,42,0x101c2b,0,-.25,0);

const grid=new THREE.GridHelper(
  42,42,0x24435a,0x182a3e
);
grid.position.y=.01;
scene.add(grid);

box(38,8,.5,0x15293a,0,4,-19);
box(.5,8,38,0x14283a,-20,4,0);
box(.5,8,38,0x14283a,20,4,0);

for(const x of [-18,18]){
  for(const z of [-18,18]){
    box(.6,8,.6,0x304b5c,x,4,z);
  }
}

for(const x of [-12,12]){
  box(7,.55,2.5,0x29495e,x,.35,4);
  box(7,1.15,.6,0x365c72,x,1.05,5.1);
  box(1.2,.75,2.4,0x365c72,x-3,.65,4);
  box(1.2,.75,2.4,0x365c72,x+3,.65,4);
  box(3.5,.2,1.5,0xd5b68a,x,.75,1.7);
}

for(const x of [-17,17]){
  for(const z of [-10,10]){
    box(1.2,.9,1.2,0x24413e,x,.45,z);

    const plant=new THREE.Mesh(
      new THREE.ConeGeometry(.7,2.5,8),
      new THREE.MeshStandardMaterial({
        color:0x238878
      })
    );

    plant.position.set(x,2,z);
    scene.add(plant);
  }
}

for(const x of [-12,0,12]){
  const light=new THREE.PointLight(0xffd49b,25,17);
  light.position.set(x,6,3);
  scene.add(light);
}

const neon=new THREE.PointLight(0x4de0bc,75,30);
neon.position.set(0,7,-10);
scene.add(neon);

const boardCanvas=document.createElement('canvas');
boardCanvas.width=1280;
boardCanvas.height=620;

const boardCtx=boardCanvas.getContext('2d');
const boardTexture=new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace=THREE.SRGBColorSpace;

const board=new THREE.Mesh(
  new THREE.PlaneGeometry(23,10.5),
  new THREE.MeshBasicMaterial({
    map:boardTexture,
    side:THREE.DoubleSide
  })
);
board.position.set(0,5.5,BOARD_Z);
scene.add(board);

// 대형 전광판 전용 후면 프레임: 기존 벽 높이보다 큰 화면도 자연스럽게 지지
const boardBacking = new THREE.Mesh(
  new THREE.BoxGeometry(23.32,10.82,0.14),
  new THREE.MeshStandardMaterial({
    color:0x111c2a,
    metalness:0.7,
    roughness:0.3
  })
);
boardBacking.position.set(0,5.5,BOARD_Z-0.13);
scene.add(boardBacking);

// 가장자리의 얇은 골드 메탈 프레임
const boardFrameMat = new THREE.MeshStandardMaterial({
  color:0xb89a68,
  metalness:0.85,
  roughness:0.25
});
for(const [w,h,x,y] of [
  [23.36,0.085,0,10.91],
  [23.36,0.085,0,0.09],
  [0.085,10.9,-11.68,5.5],
  [0.085,10.9,11.68,5.5]
]){
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(w,h,0.12),
    boardFrameMat
  );
  rail.position.set(x,y,BOARD_Z-0.025);
  scene.add(rail);
}

// ====================================================
// JMC PREMIUM TRADING WALL
// 기존 3D 전광판 텍스처/가격 API 유지
// ====================================================

function boardRoundedRect(c,x,y,w,h,r){
  c.beginPath();
  c.roundRect(x,y,w,h,r);
}

function refreshBoard(){
  const c=boardCtx;
  const W=boardCanvas.width;
  const H=boardCanvas.height;

  c.save();
  c.clearRect(0,0,W,H);

  // 다크 글래스 배경
  const background=c.createLinearGradient(0,0,W,H);
  background.addColorStop(0,'#0d2232');
  background.addColorStop(.5,'#07121f');
  background.addColorStop(1,'#102435');
  c.fillStyle=background;
  c.fillRect(0,0,W,H);

  // 섬세한 배경 격자
  c.strokeStyle='rgba(112,157,180,.055)';
  c.lineWidth=1;
  for(let x=0;x<W;x+=64){
    c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();
  }
  for(let y=0;y<H;y+=62){
    c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();
  }

  // 샴페인 골드 외곽 장식
  c.strokeStyle='#bc9861';
  c.lineWidth=4;
  c.strokeRect(7,7,W-14,H-14);
  c.strokeStyle='rgba(233,202,144,.30)';
  c.lineWidth=1;
  c.strokeRect(14,14,W-28,H-28);

  // 헤더
  const headerGradient=c.createLinearGradient(0,12,0,84);
  headerGradient.addColorStop(0,'#172b3b');
  headerGradient.addColorStop(1,'#091723');
  c.fillStyle=headerGradient;
  c.fillRect(22,20,W-44,64);
  c.fillStyle='#e8cc96';
  c.font='bold 33px Arial,sans-serif';
  c.textAlign='left';
  c.fillText('JMC INVEST LOUNGE',42,60);
  c.fillStyle='#91aebd';
  c.font='16px Arial,sans-serif';
  c.fillText('PREMIUM DIGITAL ASSET TERMINAL',473,57);
  c.fillStyle='#43e4be';
  c.beginPath();c.arc(1156,50,7,0,Math.PI*2);c.fill();
  c.fillStyle='#a4f5df';
  c.font='bold 19px Arial,sans-serif';
  c.fillText('LIVE',1172,57);

  symbols.forEach((s,i)=>{
    const x=36+(i%2)*608;
    const y=90+Math.floor(i/2)*255;
    const w=588;
    const h=240;

    // 고급 유리 패널
    c.save();
    boardRoundedRect(c,x,y,w,h,13);
    const surface=c.createLinearGradient(x,y,x+w,y+h);
    surface.addColorStop(0,'#132b3c');
    surface.addColorStop(.6,'#0a1b2c');
    surface.addColorStop(1,'#081523');
    c.fillStyle=surface;
    c.fill();
    c.strokeStyle='rgba(209,176,116,.70)';
    c.lineWidth=2;
    c.stroke();
    c.clip();

    // 패널 상단 금색 라인
    const gold=c.createLinearGradient(x,y,x+w,y);
    gold.addColorStop(0,'rgba(231,198,132,.75)');
    gold.addColorStop(.6,'rgba(231,198,132,.17)');
    gold.addColorStop(1,'rgba(231,198,132,.55)');
    c.fillStyle=gold;
    c.fillRect(x+1,y+1,w-2,3);

    // 코인 심볼 및 이름
    c.fillStyle='#f3e4c7';
    c.font='bold 23px Arial,sans-serif';
    c.textAlign='left';
    c.fillText(`${s.id} / USD`,x+22,y+35);
    c.fillStyle='#90adbc';
    c.font='16px Arial,sans-serif';
    c.fillText(s.name,x+174,y+35);

    // 가격: 코인별 소수점 표기 유지
    c.fillStyle='#ffffff';
    c.font='bold 35px Arial,sans-serif';
    c.fillText(money(s.price),x+22,y+82,380);

    const raw=Array.isArray(s.candles)?s.candles:[];
    const data=raw.filter(d=>
      [d.open,d.high,d.low,d.close].every(Number.isFinite)
    ).slice(-64);
    const change=data.length>0 && data[0].open>0
      ? (data[data.length-1].close/data[0].open-1)*100
      : null;
    const positive=change===null || change>=0;

    // 가격 증감은 표시된 캔들 구간 기준
    boardRoundedRect(c,x+442,y+48,122,36,9);
    c.fillStyle=change===null
      ? 'rgba(119,145,164,.18)'
      : positive?'rgba(55,190,144,.18)':'rgba(231,100,118,.18)';
    c.fill();
    c.fillStyle=change===null?'#a7b9c8':positive?'#67e1b8':'#f493a0';
    c.font='bold 18px Arial,sans-serif';
    c.textAlign='center';
    c.fillText(
      change===null?'--':`${change>=0?'+':''}${change.toFixed(2)}%`,
      x+503,y+72
    );
    c.textAlign='left';

    // 차트 바탕과 가격 격자
    const plotX=x+20,plotY=y+104,plotW=548,plotH=106;
    c.fillStyle='rgba(3,13,23,.34)';
    c.fillRect(plotX,plotY,plotW,plotH);
    c.strokeStyle='rgba(100,148,170,.20)';
    c.lineWidth=1;
    for(let k=1;k<4;k++){
      const yy=plotY+k*plotH/4;
      c.beginPath();c.moveTo(plotX,yy);c.lineTo(plotX+plotW,yy);c.stroke();
    }
    for(let k=1;k<6;k++){
      const xx=plotX+k*plotW/6;
      c.beginPath();c.moveTo(xx,plotY);c.lineTo(xx,plotY+plotH);c.stroke();
    }

    if(data.length){
      const lo=Math.min(...data.map(d=>d.low));
      const hi=Math.max(...data.map(d=>d.high));
      const pad=(hi-lo)*.09||Math.max(0.001,hi*.001);
      const min=lo-pad,max=hi+pad;
      const step=plotW/data.length;
      const yy=v=>plotY+(max-v)/(max-min)*plotH;

      data.forEach((d,j)=>{
        const xx=plotX+step*(j+.5);
        const up=d.close>=d.open;
        const color=up?'#52dbb5':'#ee7990';
        c.strokeStyle=color;
        c.fillStyle=color;
        c.lineWidth=1.2;
        c.beginPath();c.moveTo(xx,yy(d.high));c.lineTo(xx,yy(d.low));c.stroke();
        const t=yy(Math.max(d.open,d.close));
        const b=yy(Math.min(d.open,d.close));
        c.fillRect(xx-Math.max(1.5,step*.28),t,
          Math.max(3,Math.min(8,step*.56)),Math.max(2,b-t));
      });
    }else{
      c.fillStyle='#9eb7c5';
      c.textAlign='center';
      c.font='18px Arial,sans-serif';
      c.fillText('캔들 데이터를 불러오는 중...',x+w/2,y+169);
      c.textAlign='left';
    }

    // 조작 안내
    c.fillStyle='#8ca4b5';
    c.font='14px Arial,sans-serif';
    c.fillText('COINBASE · CANDLE MARKET DATA',x+20,y+229);
    c.fillStyle='#cfb581';
    c.font='bold 14px Arial,sans-serif';
    c.textAlign='right';
    c.fillText('CLICK TO OPEN TRADINGVIEW  ›',x+w-20,y+229);
    c.textAlign='left';
    c.restore();
  });

  c.restore();
  boardTexture.needsUpdate=true;
}

refreshBoard();

// ====================================================
// 전광판 클릭 시 TradingView 확장 차트 표시
// 3D 전광판은 기존 CanvasTexture 유지
// 클릭한 경우에만 TradingView 공식 위젯을 로드
// ====================================================

const jmcBoardRaycaster=new THREE.Raycaster();
const jmcBoardPointer=new THREE.Vector2();
let jmcBoardPointerStart=null;

const jmcTvOverlay=document.createElement('div');
jmcTvOverlay.id='jmc-tv-overlay';
jmcTvOverlay.hidden=true;
jmcTvOverlay.style.cssText=`
  position:fixed;inset:0;z-index:99995;
  display:none;align-items:center;justify-content:center;
  padding:18px;box-sizing:border-box;
  background:rgba(1,8,16,.89);backdrop-filter:blur(9px);
`;

const jmcTvCard=document.createElement('div');
jmcTvCard.style.cssText=`
  width:min(1320px,100%);height:min(88dvh,880px);
  min-height:320px;display:flex;flex-direction:column;
  box-sizing:border-box;overflow:hidden;
  background:#081827;border:1px solid #b99a67;
  border-radius:16px;box-shadow:0 24px 90px rgba(0,0,0,.70);
`;

const jmcTvHeader=document.createElement('div');
jmcTvHeader.style.cssText=`
  display:flex;align-items:center;justify-content:space-between;
  gap:12px;padding:14px 18px;
  border-bottom:1px solid rgba(202,169,107,.45);
  color:#f3ddb3;font:700 16px Arial,sans-serif;
`;
const jmcTvTitle=document.createElement('strong');
jmcTvTitle.textContent='JMC · TRADINGVIEW';
const jmcTvClose=document.createElement('button');
jmcTvClose.type='button';
jmcTvClose.textContent='✕ 닫기';
jmcTvClose.style.cssText=`
  border:1px solid #b99a67;border-radius:9px;
  background:#263c4c;color:#fff;
  font:700 13px Arial,sans-serif;
  padding:9px 13px;cursor:pointer;
`;
jmcTvHeader.append(jmcTvTitle,jmcTvClose);

const jmcTvContent=document.createElement('div');
jmcTvContent.style.cssText='flex:1;min-height:0;position:relative;background:#081523';
jmcTvCard.append(jmcTvHeader,jmcTvContent);
jmcTvOverlay.appendChild(jmcTvCard);
document.body.appendChild(jmcTvOverlay);

function jmcCloseTradingView(){
  jmcTvOverlay.hidden=true;
  jmcTvOverlay.style.display='none';
  jmcTvContent.replaceChildren();
}

jmcTvClose.addEventListener('click',jmcCloseTradingView);
jmcTvOverlay.addEventListener('pointerdown',event=>{
  if(event.target===jmcTvOverlay)jmcCloseTradingView();
});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !jmcTvOverlay.hidden){
    event.preventDefault();
    event.stopImmediatePropagation();
    jmcCloseTradingView();
  }
});

function jmcOpenTradingView(symbol){
  const tvSymbols={
    BTC:'COINBASE:BTCUSD',
    ETH:'COINBASE:ETHUSD',
    SOL:'COINBASE:SOLUSD',
    XRP:'COINBASE:XRPUSD'
  };
  const tradingSymbol=tvSymbols[symbol];
  if(!tradingSymbol)return;

  jmcTvTitle.textContent=`JMC INVEST LOUNGE  ·  ${symbol}/USD`;
  jmcTvOverlay.hidden=false;
  jmcTvOverlay.style.display='flex';
  jmcTvContent.replaceChildren();

  const widget=document.createElement('div');
  widget.className='tradingview-widget-container';
  widget.style.cssText='width:100%;height:100%;';
  const widgetInner=document.createElement('div');
  widgetInner.className='tradingview-widget-container__widget';
  widgetInner.style.cssText='width:100%;height:100%;';
  widget.appendChild(widgetInner);
  jmcTvContent.appendChild(widget);

  const config={
    autosize:true,
    symbol:tradingSymbol,
    interval:'15',
    timezone:'Asia/Seoul',
    theme:'dark',
    style:'1',
    locale:'kr',
    allow_symbol_change:true,
    calendar:false,
    hide_top_toolbar:false,
    hide_legend:false,
    save_image:false,
    backgroundColor:'rgba(8,21,35,1)',
    gridColor:'rgba(100,129,155,0.10)',
    support_host:'https://www.tradingview.com'
  };
  const widgetScript=document.createElement('script');
  widgetScript.type='text/javascript';
  widgetScript.async=true;
  widgetScript.src=
    'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  widgetScript.textContent=JSON.stringify(config);
  widgetScript.onerror=()=>{
    if(!jmcTvOverlay.hidden){
      widgetInner.textContent='TradingView 차트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      widgetInner.style.color='#f1d4a0';
      widgetInner.style.padding='24px';
    }
  };
  widget.appendChild(widgetScript);
}

renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  jmcBoardPointerStart={x:event.clientX,y:event.clientY};
});

renderer.domElement.addEventListener('pointerup',event=>{
  if(event.button!==0 || !jmcBoardPointerStart)return;
  const moved=Math.hypot(
    event.clientX-jmcBoardPointerStart.x,
    event.clientY-jmcBoardPointerStart.y
  );
  jmcBoardPointerStart=null;
  if(moved>9 || !profile || defeated || reentryRequired ||
     !$('profile-modal').hidden || !jmcTvOverlay.hidden)return;

  const rect=renderer.domElement.getBoundingClientRect();
  if(!rect.width || !rect.height)return;
  jmcBoardPointer.set(
    (event.clientX-rect.left)/rect.width*2-1,
    -(event.clientY-rect.top)/rect.height*2+1
  );
  jmcBoardRaycaster.setFromCamera(jmcBoardPointer,camera);
  const boardHits=jmcBoardRaycaster.intersectObject(board,false);
  if(!boardHits.length || !boardHits[0].uv)return;

  // 전광판보다 앞에 있는 캐릭터 클릭은 기존 PVP 동작 유지
  const potentialAvatars=[...others.values()];
  if(myAvatar)potentialAvatars.push(myAvatar);
  for(const avatar of potentialAvatars){
    if(!avatar.visible)continue;
    const hit=jmcBoardRaycaster.intersectObject(avatar,true)[0];
    if(hit && hit.distance<boardHits[0].distance)return;
  }

  const u=boardHits[0].uv.x*1280;
  const v=(1-boardHits[0].uv.y)*620;
  const col=u>=36 && u<=624?0:u>=644 && u<=1232?1:-1;
  const row=v>=90 && v<=330?0:v>=345 && v<=585?1:-1;
  if(col<0 || row<0)return;
  const symbol=symbols[row*2+col]?.id;
  if(!symbol)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  jmcOpenTradingView(symbol);
});

const others=new Map();
// ========================================
// 캐릭터 클릭 시 PVP 전적 창
// ========================================

const pvpOverlay = document.createElement('div');
pvpOverlay.hidden = true;

pvpOverlay.style.cssText = `
  position:fixed;
  inset:0;
  z-index:99990;
  background:rgba(0,0,0,.66);
  display:none;
  align-items:center;
  justify-content:center;
  padding:20px;
  box-sizing:border-box;
`;

const pvpCard = document.createElement('div');

pvpCard.style.cssText = `
  width:min(370px,100%);
  background:#112439;
  border:1px solid #c8a16b;
  border-radius:16px;
  padding:22px;
  box-sizing:border-box;
  color:white;
  text-align:center;
  font-family:Arial,sans-serif;
`;

const pvpHeading = document.createElement('h2');
pvpHeading.style.cssText =
  'margin:0 0 8px;font-size:23px';

const pvpSub = document.createElement('p');
pvpSub.style.cssText =
  'color:#a9c2d3;font-size:13px;margin:0 0 18px';

const pvpNumbers = document.createElement('div');
pvpNumbers.style.cssText = `
  display:flex;
  justify-content:space-around;
  gap:10px;
  font-weight:700;
  font-size:17px;
`;

const pvpClose = document.createElement('button');
pvpClose.type = 'button';
pvpClose.textContent = '닫기';

pvpClose.style.cssText = `
  margin-top:22px;
  width:100%;
  padding:11px;
  border:0;
  border-radius:9px;
  background:#dfc18d;
  cursor:pointer;
  font-weight:700;
`;

pvpCard.append(
  pvpHeading,
  pvpSub,
  pvpNumbers,
  pvpClose
);

pvpOverlay.appendChild(pvpCard);
document.body.appendChild(pvpOverlay);

function closePvpProfile() {
  pvpOverlay.hidden = true;
  pvpOverlay.style.display = 'none';
}

pvpClose.onclick = closePvpProfile;

pvpOverlay.addEventListener('click',event => {
  if (event.target === pvpOverlay) {
    closePvpProfile();
  }
});

window.addEventListener('keydown',event => {
  if (event.key === 'Escape') {
    closePvpProfile();
  }
});

function openPvpProfile(targetId) {
  if (
    !targetId ||
    !profile ||
    defeated ||
    reentryRequired
  ) return;

  pvpHeading.textContent = 'PVP 전적';
  pvpSub.textContent = '전적을 불러오는 중...';
  pvpNumbers.textContent = '';

  pvpOverlay.hidden = false;
  pvpOverlay.style.display = 'flex';

  send({
    type:'pvp_profile_request',
    targetId
  });
}

function showPvpProfile(data) {
  if (pvpOverlay.hidden) return;

  if (data.error) {
    pvpSub.textContent = data.error;
    pvpNumbers.textContent = '';
    return;
  }

  pvpHeading.textContent =
    `${animal(data.animal).emoji} ${data.displayName}`;

  if (!data.registered) {
    pvpSub.textContent =
      '게스트 이용자 · 공식 PVP 전적 없음';

    pvpNumbers.textContent = '';
    return;
  }

pvpSub.textContent = 'Google 인증 이용자';

  const kills = Number(data.kills) || 0;
  const deaths = Number(data.deaths) || 0;

  const kd = deaths === 0
    ? kills.toFixed(2)
    : (kills / deaths).toFixed(2);

  pvpNumbers.replaceChildren();

  for (const [label,value] of [
    ['KILL',kills],
    ['DEATH',deaths],
    ['K/D',kd]
  ]) {
    const cell = document.createElement('div');

    cell.style.cssText = `
      flex:1;
      padding:13px 3px;
      border-radius:9px;
      background:#1c354a;
    `;

    const title = document.createElement('div');
    title.textContent = label;
    title.style.cssText = `
      font-size:11px;
      color:#a9c2d3;
      margin-bottom:7px;
    `;

    const number = document.createElement('div');
    number.textContent = String(value);

    cell.append(title,number);
    pvpNumbers.appendChild(cell);
  }
}

// ========================================
// 캐릭터 클릭 판정
// ========================================

const pvpRaycaster = new THREE.Raycaster();
const pvpPointer = new THREE.Vector2();

let pvpPress = null;

renderer.domElement.addEventListener(
  'pointerdown',
  event => {
    pvpPress = {
      x:event.clientX,
      y:event.clientY
    };
  }
);

renderer.domElement.addEventListener(
  'pointerup',
  event => {
    if (!pvpPress) return;

    const moved = Math.hypot(
      event.clientX - pvpPress.x,
      event.clientY - pvpPress.y
    );

    pvpPress = null;

    if (
      moved > 9 ||
      !profile ||
      defeated ||
      !$('profile-modal').hidden
    ) return;

    const rect = renderer.domElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) return;

    pvpPointer.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1
    );

    pvpRaycaster.setFromCamera(pvpPointer,camera);

    const entries = [...others.entries()];

    if (myAvatar && myId) {
      entries.push([myId,myAvatar]);
    }

    let nearest = null;

    for (const [id,avatar] of entries) {
      if (!avatar.visible) continue;

      const hits = pvpRaycaster.intersectObject(
        avatar,
        true
      );

      if (
        hits.length &&
        (
          !nearest ||
          hits[0].distance < nearest.distance
        )
      ) {
        nearest = {
          id,
          distance:hits[0].distance
        };
      }
    }

    if (nearest) {
      openPvpProfile(nearest.id);
    }
  }
);
const missileClient = installMissileClient({
  THREE,
  scene,
  sceneEl,
  renderer,
  camera,

  getAvatar: () => myAvatar,
  getOthers: () => others,
  getMyId: () => myId,

  send: msg => send(msg),

  isBlocked: () =>
    npcMode === 'npc' || Boolean(npcPendingMode) ||
    defeated ||
    reentryRequired ||
    !profile ||
    !$('profile-modal').hidden
});
const raidClient=createBossClient({
  THREE,
  scene,
  sceneEl,
  getAvatar:()=>myAvatar,
  getPlayerId:()=>myId,
  send:msg=>send(msg),

  removeShot:shotId=>{
    const i=magicProjectiles.findIndex(s=>s.id===shotId);
    if(i>=0){
      disposeMagicProjectile(magicProjectiles[i]);
      magicProjectiles.splice(i,1);
    }
  },

  playHit:(x,z)=>playMagicHitSfx(
    magicSoundVolume(x,z)
  )
});

function boardFocus(position){
  const facing=THREE.MathUtils.smoothstep(
    (Math.cos(yaw)+1)/2,.55,.95
  );

  const near=1-THREE.MathUtils.smoothstep(
    Math.abs(position.z-BOARD_Z),4,17
  );

  return facing*near;
}

function cameraDistance(position){
  // 모바일은 전광판 접근 시 자동 줌을 하지 않는다.
  if(isMobileDevice){
    return CAMERA_BASE_DISTANCE;
  }

  const focus=boardFocus(position);
  const tanHalfVertical=Math.tan(
    THREE.MathUtils.degToRad(camera.fov/2)
  );
  const tanHalfHorizontal=
    tanHalfVertical*Math.max(.25,camera.aspect||1);
  const requiredToShowBoard=
    (BOARD_WIDTH/2+1.4)/tanHalfHorizontal;
  const distanceFromPlayerToBoard=Math.max(
    0,position.z-BOARD_Z
  );
  const neededBehindPlayer=Math.max(
    CAMERA_BASE_DISTANCE,
    requiredToShowBoard-distanceFromPlayerToBoard
  );
  return THREE.MathUtils.lerp(
    CAMERA_BASE_DISTANCE,
    Math.min(CAMERA_MAX_DISTANCE,neededBehindPlayer),
    focus
  );
}

function cameraPositionFor(position){
  const distance=cameraDistance(position);
  const focus=isMobileDevice ? 0 : boardFocus(position);

  return new THREE.Vector3(
    position.x-Math.sin(yaw)*distance,
    position.y+CAMERA_HEIGHT+focus*.8,
    position.z-Math.cos(yaw)*distance
  );
}

function cameraLookAtFor(position){
  const focus=isMobileDevice ? 0 : boardFocus(position);

  return new THREE.Vector3(
    position.x,
    position.y+1.15+focus*1.25,
    position.z
  );
}

function resetToBoard(){
  yaw=Math.PI;

  if(myAvatar){
    myAvatar.position.set(0, 0, 5);
    myAvatar.rotation.y=Math.PI;
    myAvatar.userData.targetDirection=Math.PI;
  }

  const p=myAvatar?.position||new THREE.Vector3(0, 0, 5)

  camera.position.copy(cameraPositionFor(p));
  camera.lookAt(cameraLookAtFor(p));
  camera.updateMatrixWorld();
}

function updateMyAvatar(){
  if(!profile)return;

  const pos=myAvatar
    ?myAvatar.position.clone()
    :new THREE.Vector3(0,0,5);

  const dir=myAvatar?myAvatar.rotation.y:Math.PI;
  const wasSeated=myAvatar?.userData.seated||false;

  if(myAvatar){
    if(myId)removeBubble(myId);
    scene.remove(myAvatar);
    removeCharacterHpBar(myAvatar);
    removeCharacterName(myAvatar);
  }

  myAvatar=makeAnimal(profile.animal);
  addCharacterHpBar(myAvatar,myHp);
  setCharacterName(myAvatar,profile.name);
  myAvatar.position.copy(pos);
  myAvatar.rotation.y=dir;
  myAvatar.userData.targetDirection=dir;
  myAvatar.userData.seated=wasSeated;
  scene.add(myAvatar);
  updateNpcLocalAvatar();
}

function updateOthers(players){
  const seen=new Set();

  for(const p of players){
    if(p.id===myId)continue;
    seen.add(p.id);

    let avatar=others.get(p.id);

    if(!avatar||avatar.userData.animal!==p.animal){
      if(avatar){
        removeBubble(p.id);
        scene.remove(avatar);
        removeCharacterHpBar(avatar);
        removeCharacterName(avatar);
      }

      avatar=makeAnimal(p.animal);
      addCharacterHpBar(avatar,p.hp??100);
      setCharacterName(avatar,p.name);
      scene.add(avatar);
      others.set(p.id,avatar);
    }

    avatar.position.set(
      Number(p.x)||0,
      Number(p.y)||0,
      Number(p.z)||0
    );

    setCharacterHpBar(avatar,p.hp??100);
    avatar.userData.originalNpcName=p.name;
    const isNpc=p.npcMode==='npc' && Boolean(NPC_FORM_NAMES[p.npcForm]);
    setCharacterName(avatar,isNpc?`${p.name} · 관전중`:p.name);
    setNpcAppearance(avatar,p.npcMode,p.npcForm);
    avatar.userData.seated=p.seated===true;

    if(Number.isFinite(Number(p.direction))){
      avatar.userData.targetDirection=Number(p.direction);
    }
  }

  for(const [id,a] of others){
    if(!seen.has(id)){
      removeBubble(id);
      scene.remove(a);
      removeCharacterHpBar(a);
      removeCharacterName(a);
      others.delete(id);
    }
  }
}

if(profile&&!reentryRequired){
  updateMyAvatar();
}

resetToBoard();

const activeBubbles=new Map();
const BUBBLE_LIFETIME=6000;

function wrapBubbleText(ctx,text,maxWidth,maxLines=3){
  const chars=Array.from(
    String(text).replace(/\s+/g,' ').trim()
  );

  const lines=[];
  let line='';

  for(const ch of chars){
    if(ctx.measureText(line+ch).width>maxWidth&&line){
      lines.push(line);
      line=ch;
      if(lines.length===maxLines-1)break;
    }else{
      line+=ch;
    }
  }

  const consumed=Array.from(lines.join('')).length;

  if(lines.length===maxLines-1){
    let rest=chars.slice(consumed).join('');

    while(rest&&ctx.measureText(rest).width>maxWidth){
      rest=rest.slice(0,-1);
    }

    if(rest.length<chars.length-consumed){
      rest=rest.slice(0,-1)+'…';
    }

    lines.push(rest);
  }else if(line){
    lines.push(line);
  }

  return lines;
}

function removeBubble(senderId){
  const existing=activeBubbles.get(senderId);
  if(!existing)return;

  existing.sprite.parent?.remove(existing.sprite);
  existing.sprite.material.map?.dispose();
  existing.sprite.material.dispose();
  activeBubbles.delete(senderId);
}

function showBubble(item){
  const senderId=item?.senderId;
  if(!senderId||!item.message)return;

  const avatar=senderId===myId
    ?myAvatar
    :others.get(senderId);

  if(!avatar)return;
  removeBubble(senderId);

  const canvas=document.createElement('canvas');
  canvas.width=768;
  canvas.height=320;

  const ctx=canvas.getContext('2d');
  ctx.font='bold 40px sans-serif';

  const lines=wrapBubbleText(ctx,item.message,620,3);
  const lineHeight=52;
  const boxH=Math.max(118,lines.length*lineHeight+48);
  const top=16;
  const bottom=top+boxH;

  ctx.shadowColor='rgba(0,0,0,.35)';
  ctx.shadowBlur=18;
  ctx.fillStyle='rgba(255,255,255,.97)';
  ctx.beginPath();
  ctx.roundRect(20,top,728,boxH,28);
  ctx.fill();

  ctx.shadowBlur=0;
  ctx.beginPath();
  ctx.moveTo(352,bottom);
  ctx.lineTo(384,bottom+30);
  ctx.lineTo(416,bottom);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle='#172b3b';
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  lines.forEach((line,i)=>{
    ctx.fillText(
      line,
      384,
      top+boxH/2+(i-(lines.length-1)/2)*lineHeight,
      650
    );
  });

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;

  const material=new THREE.SpriteMaterial({
    map:texture,
    transparent:true,
    depthTest:false,
    depthWrite:false
  });

  const sprite=new THREE.Sprite(material);
  sprite.position.set(0,avatar.userData.npcMode === 'npc' ? 3.6 : 4.7,0);
  sprite.scale.set(3.8,1.58,1);
  sprite.renderOrder=100;
  avatar.add(sprite);

  activeBubbles.set(senderId,{
    sprite,
    expires:performance.now()+BUBBLE_LIFETIME,
    messageId:item.id
  });
}

function tickBubbles(now){
  for(const [id,bubble] of activeBubbles){
    // 말풍선이 떠 있는 중에 변신해도 즉시 높이 갱신 (PC·모바일 공통)
    const avatar = id === myId ? myAvatar : others.get(id);
    if(avatar && bubble.sprite) {
      bubble.sprite.position.y = avatar.userData.npcMode === 'npc' ? 3.6 : 4.7;
    }
    if(now>=bubble.expires){
      removeBubble(id);
    }else if(now>bubble.expires-900){
      bubble.sprite.material.opacity=Math.max(
        0,(bubble.expires-now)/900
      );
    }
  }
}

function deleteBubbleByMessage(messageId){
  for(const [id,bubble] of activeBubbles){
    if(bubble.messageId===messageId)removeBubble(id);
  }
}

const keys=new Set();
const touchCounts=new Map();

let dragging=false;
let lastPointerX=0;
let jumpVelocity=0;
let onGround=true;

const GRAVITY=19;
const JUMP_SPEED=8;

renderer.domElement.addEventListener('pointerdown',e=>{
  dragging=true;
  lastPointerX=e.clientX;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove',e=>{
  if(dragging){
    yaw+=(e.clientX-lastPointerX)*.005;
    lastPointerX=e.clientX;
  }
});

for(const type of [
  'pointerup','pointercancel','lostpointercapture'
]){
  renderer.domElement.addEventListener(type,()=>{
    dragging=false;
  });
}

window.addEventListener('keydown',e=>{
  if(
    ['INPUT','TEXTAREA'].includes(
      document.activeElement?.tagName
    )||
    !$('profile-modal').hidden||
    defeated||
    reentryRequired
  )return;

  const k=e.key.toLowerCase();

  if(
    k===' '||
    e.code==='Space'||
    e.key.startsWith('Arrow')
  )e.preventDefault();

  if(e.repeat&&(k==='c'||e.code==='Space'))return;

  if(k==='c'&&myAvatar){
    if(!onGround)return;

    myAvatar.userData.seated=!myAvatar.userData.seated;
    myAvatar.userData.bodyGroup.position.y=0;
    sendMove(true);
  }else if(
    (k===' '||e.code==='Space')&&
    myAvatar&&
    !myAvatar.userData.seated&&
    onGround
  ){
    jumpVelocity=JUMP_SPEED;
    onGround=false;

    send({type:'jump'});
    sendMove(true);
  }

 if (k !== 's') {
  keys.add(k);
}
});

window.addEventListener('keyup',e=>{
  keys.delete(e.key.toLowerCase());
});

const controls=$('mobile-controls');

const mobileJoystick={
  x:0,
  y:0,
  pointerId:null
};

controls.classList.add('jmc-joystick');
controls.innerHTML=`
  <div class="jmc-joystick-thumb" aria-hidden="true"></div>
`;

const joystickThumb=controls.querySelector(
  '.jmc-joystick-thumb'
);

const joystickStyle=document.createElement('style');

joystickStyle.textContent=`
  #scene #mobile-controls.jmc-joystick {
    width:120px !important;
    height:120px !important;
    transform:none !important;
    box-sizing:border-box !important;
    border-radius:50% !important;
    border:1.5px solid rgba(237,213,169,.55);
    background:radial-gradient(
      circle at 35% 28%,
      rgba(219,239,255,.23) 0%,
      rgba(104,159,198,.16) 48%,
      rgba(13,37,57,.25) 100%
    );
    -webkit-backdrop-filter:blur(4px);
    backdrop-filter:blur(4px);
    box-shadow:
      0 5px 18px rgba(0,0,0,.18),
      inset 0 0 22px rgba(204,230,255,.08),
      inset 0 0 0 8px rgba(255,255,255,.025);
    touch-action:none !important;
    user-select:none !important;
    -webkit-user-select:none !important;
    z-index:30 !important;
  }

  #scene #mobile-controls.jmc-joystick::before {
    content:"";
    position:absolute;
    left:50%;
    top:50%;
    width:84px;
    height:84px;
    border-radius:50%;
    border:1px solid rgba(223,235,249,.14);
    transform:translate(-50%,-50%);
    pointer-events:none;
  }

  #scene #mobile-controls.jmc-joystick
  .jmc-joystick-thumb {
    position:absolute;
    left:50%;
    top:50%;
    width:52px;
    height:52px;
    box-sizing:border-box;
    border-radius:50%;
    transform:translate(-50%,-50%);
    border:1.5px solid rgba(244,224,183,.75);
    background:radial-gradient(
      circle at 32% 24%,
      rgba(244,250,255,.55) 0%,
      rgba(140,194,232,.32) 42%,
      rgba(50,101,142,.42) 100%
    );
    -webkit-backdrop-filter:blur(3px);
    backdrop-filter:blur(3px);
    box-shadow:
      0 3px 10px rgba(0,0,0,.22),
      inset 0 2px 5px rgba(255,255,255,.18);
    pointer-events:none;
    touch-action:none !important;
    will-change:transform;
  }
`;

document.head.appendChild(joystickStyle);

if (isMobileDevice) {
  document.addEventListener('touchmove',function(e){
    if(
      mobileJoystick.pointerId !== null &&
      e.cancelable
    ){
      e.preventDefault();
    }
  },{
    passive:false,
    capture:true
  });

  joystickStyle.textContent+=`
    @media (max-width:980px),(pointer:coarse) {
      html body #scene {
        height:65svh !important;
        touch-action:none !important;
        overscroll-behavior:none !important;
      }
      html body #mobile-controls.jmc-joystick,
      html body #mobile-controls.jmc-joystick * {
        touch-action:none !important;
        user-select:none !important;
        -webkit-user-select:none !important;
      }
    }
  `;
}

function updateMobileJoystick(e){
  const rect=controls.getBoundingClientRect();

  const centerX=rect.left+rect.width/2;
  const centerY=rect.top+rect.height/2;
  const radius=Math.min(rect.width,rect.height)*.29;

  const dx=e.clientX-centerX;
  const dy=e.clientY-centerY;
  const distance=Math.hypot(dx,dy);

  const scale=distance>radius
    ?radius/distance
    :1;

  const offsetX=dx*scale;
  const offsetY=dy*scale;

  if(Math.hypot(offsetX,offsetY)<10){
    mobileJoystick.x=0;
    mobileJoystick.y=0;
  }else{
    mobileJoystick.x=offsetX/radius;
    mobileJoystick.y=offsetY/radius;
  }

  joystickThumb.style.transform=
    `translate(calc(-50% + ${offsetX}px),
               calc(-50% + ${offsetY}px))`;
}

function resetMobileJoystick(){
  mobileJoystick.x=0;
  mobileJoystick.y=0;
  mobileJoystick.pointerId=null;

  joystickThumb.style.transform=
    'translate(-50%,-50%)';
}

controls.addEventListener('pointerdown',e=>{
  if(!isMobileDevice)return;
  if(mobileJoystick.pointerId!==null)return;

  e.preventDefault();
  e.stopPropagation();

  mobileJoystick.pointerId=e.pointerId;
  controls.setPointerCapture(e.pointerId);
  updateMobileJoystick(e);
});

controls.addEventListener('pointermove',e=>{
  if(e.pointerId!==mobileJoystick.pointerId)return;

  e.preventDefault();
  e.stopPropagation();
  updateMobileJoystick(e);
});

function finishMobileJoystick(e){
  if(e.pointerId!==mobileJoystick.pointerId)return;
  resetMobileJoystick();
}

controls.addEventListener('pointerup',finishMobileJoystick);
controls.addEventListener('pointercancel',finishMobileJoystick);
controls.addEventListener('lostpointercapture',finishMobileJoystick);

window.addEventListener('blur',resetMobileJoystick);

document.addEventListener('visibilitychange',()=>{
  if(document.hidden)resetMobileJoystick();
});

window.addEventListener('blur',()=>{
  keys.clear();
  touchCounts.clear();
  dragging=false;

  controls.querySelectorAll('.move-btn')
    .forEach(b=>b.classList.remove('pressed'));
});

const held=k=>
  keys.has(k)||(touchCounts.get(k)||0)>0;

let lastFrame=performance.now();
let lastSent=0;
let walkTime=0;

function sendMove(force=false){
  if(!myAvatar||defeated||reentryRequired)return;

  const now=performance.now();
  if(!force&&now-lastSent<120)return;

  send({
    type:'move',
    x:myAvatar.position.x,
    y:myAvatar.position.y,
    z:myAvatar.position.z,
    direction:myAvatar.userData.targetDirection,
    seated:myAvatar.userData.seated
  });

  lastSent=now;
}

// 카메라 시선의 부드러운 추적
const smoothCameraLookAt = cameraLookAtFor(
  myAvatar?.position || new THREE.Vector3(0,0,5)
);
function animate(now){
  requestAnimationFrame(animate);

  const dt=Math.min((now-lastFrame)/1000,.05);
  lastFrame=now;

  if(!$('profile-modal').hidden&&previewModel){
    previewModel.rotation.y=previewAngle;
    previewModel.userData.bodyGroup.position.y=
      Math.sin(now*.002)*.025;
  }

  if(!$('profile-modal').hidden){
    resizePreview();
    previewRenderer.render(previewScene,previewCamera);
  }

  if(
    myAvatar&&
    $('profile-modal').hidden&&
    !defeated&&
    !reentryRequired
  ){
    const f=
      Number(held('w')||held('arrowup'))-
      Number(held('arrowdown'))-
      mobileJoystick.y;

    const s=
      Number(held('d')||held('arrowright'))-
      Number(held('arrowleft'))+
      mobileJoystick.x;

    if((f||s)&&!myAvatar.userData.seated){
      const len=Math.hypot(f,s);
      const forward=f/len;
      const side=s/len;

      const dx=
        Math.sin(yaw)*forward-
        Math.cos(yaw)*side;

      const dz=
        Math.cos(yaw)*forward+
        Math.sin(yaw)*side;

      myAvatar.position.x=Math.max(
        -18,
        Math.min(18,myAvatar.position.x+dx*5*dt)
      );

      myAvatar.position.z=Math.max(
        -18,
        Math.min(18,myAvatar.position.z+dz*5*dt)
      );

      myAvatar.userData.targetDirection=Math.atan2(dx,dz);
      walkTime+=dt*12;

      myAvatar.userData.bodyGroup.position.y=
        Math.abs(Math.sin(walkTime))*.085;

      sendMove();
    }else{
      myAvatar.userData.bodyGroup.position.y*=.8;
    }

    if(!onGround){
      jumpVelocity-=GRAVITY*dt;
      myAvatar.position.y+=jumpVelocity*dt;

      if(myAvatar.position.y<=0){
        myAvatar.position.y=0;
        jumpVelocity=0;
        onGround=true;
      }

      sendMove();
    }

    const body=myAvatar.userData.bodyGroup;

    body.scale.y=THREE.MathUtils.damp(
      body.scale.y,
      myAvatar.userData.seated?.64:1,
      12,dt
    );

    body.position.y=THREE.MathUtils.damp(
      body.position.y,
      myAvatar.userData.seated?-.13:body.position.y,
      12,dt
    );
  }

  for(const other of others.values()){
    const body=other.userData.bodyGroup;

    body.scale.y=THREE.MathUtils.damp(
      body.scale.y,
      other.userData.seated?.64:1,
      12,dt
    );
  }

  if(myAvatar){
    myAvatar.rotation.y=turn(
      myAvatar.rotation.y,
      myAvatar.userData.targetDirection,
      dt*8
    );
  }

  for(const a of others.values()){
    a.rotation.y=turn(
      a.rotation.y,
      a.userData.targetDirection,
      dt*8
    );
  }

  const target=myAvatar?.position||
    new THREE.Vector3(0,0,5);

  const followAlpha=1-Math.exp(-CAMERA_FOLLOW_SPEED*dt);

  camera.position.lerp(
    cameraPositionFor(target),
    followAlpha
  );

  // 모바일 카메라 시선 흔들림 완화
  smoothCameraLookAt.lerp(
    cameraLookAtFor(target),
    followAlpha
  );

  camera.lookAt(smoothCameraLookAt);

  tickBubbles(now);
  animateNpcModel(myAvatar,now);
  for(const a of others.values())animateNpcModel(a,now);
  updateNpcUi();
  raidClient.update(now,dt);
  renderer.render(scene,camera);
}

function resizeScene(){
  const w=Math.max(1,sceneEl.clientWidth);
  const h=Math.max(1,sceneEl.clientHeight);

  renderer.setSize(w,h,false);
  renderer.domElement.style.width='100%';
  renderer.domElement.style.height='100%';

  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resizeScene).observe(sceneEl);
resizeScene();
requestAnimationFrame(animate);

function send(m){
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify(m));
  }
}

window.addEventListener('jmc-inventory-craft', () => {
  send({
    type: 'inventory_craft'
  });
});

window.addEventListener('jmc-inventory-box-open', e => {
  const boxId = e.detail?.boxId;

  if (!boxId) return;

  send({
    type: 'inventory_box_open',
    boxId
  });
});

function sendProfile(){
  if(!profile||defeated||reentryRequired)return;

  send({
    type:'join',
    name:profile.name,
    animal:profile.animal,
    visitorId,
    inventoryToken
  });

  if(myAvatar){
    send({
      type:'move',
      x:myAvatar.position.x,
      y:myAvatar.position.y,
      z:myAvatar.position.z,
      direction:myAvatar.userData.targetDirection,
      seated:myAvatar.userData.seated
    });
  }
}

function addMessage(item){
  const line=document.createElement('div');
  line.className='msg';

  if(item.id)line.dataset.messageId=item.id;

  const b=document.createElement('b');
  b.textContent=
    `${animal(item.animal).emoji} ${item.name}: `;

  line.append(
    b,
    document.createTextNode(item.message||'')
  );

  $('messages').append(line);
  $('messages').scrollTop=$('messages').scrollHeight;
}

function updateVotes(v){
  if(!v)return;

  const total=v.long+v.short;
  const pct=total
    ?Math.round(v.long/total*100)
    :50;

  $('longbar').style.width=pct+'%';
  $('longpct').textContent=`${pct}% LONG (${v.long})`;
  $('shortpct').textContent=
    `${100-pct}% SHORT (${v.short})`;
}

function connect(){
  if(defeated)return;

  const protocol=
    location.protocol==='https:'?'wss':'ws';

  socket=new WebSocket(

        `${protocol}://${location.host}/ws`
  );

  socket.onopen=()=>{
    $('connection').textContent='● 연결됨';
    sendProfile();
  };

  socket.onclose=event=>{
    if(event.code===4001)showDeathPopup();

    if(defeated){
      $('connection').textContent='퇴장';
      return;
    }

    $('connection').textContent='연결 재시도 중';
    setTimeout(connect,2000);
  };

  socket.onerror=()=>{
    $('connection').textContent='연결 오류';
  };

  socket.onmessage=e=>{
    let m;

    try{
      m=JSON.parse(e.data);
    }catch{
      return;
    }

    if (
      m.type === 'inventory_state' ||
      m.type === 'inventory_crafted' ||
      m.type === 'inventory_notice' ||
      m.type === 'inventory_box_empty' ||
      m.type === 'inventory_box_opened'
    ) {
      window.dispatchEvent(
        new CustomEvent('jmc-inventory', {
          detail: m
        })
      );
      return;
    }
if (m.type === 'pvp_profile') {
  showPvpProfile(m);
  return;
}
    if(m.type==='npc_mode_state'){
      applyNpcModeState(m);
      return;
    }
    if (missileClient.onMessage(m)) {
  return;
}
    if(raidClient.onMessage(m))return;

    if(m.type==='position_correct'&&myAvatar){
      myAvatar.position.set(
        Number(m.x)||0,
        Number(m.y)||0,
        Number(m.z)||0
      );
      return;
    }

    if(m.type==='welcome'){
      myId=m.id;
      updateVotes(m.votes);
      $('messages').replaceChildren();

      for(const item of m.history||[]){
        addMessage(item);
      }

      sendProfile();
    }

    if(m.type==='account_profile_required') {
      if (jmcGoogleUser) jmcOpenAccountProfile(true);
      return;
    }

    if(m.type==='presence'){
      $('online').textContent=m.count;
      updateOthers(m.players||[]);
    }

    if(m.type==='magic'){
      spawnRemoteMagic(m);
      return;
    }

    if(m.type==='magic_hit'){
      handleMagicHit(m);
      return;
    }

    if(m.type==='hp'){
      updateHpHud(m.hp,m.maxHp);
    }

    if(m.type==='player_hp'){
      const avatar=m.id===myId
        ?myAvatar
        :others.get(m.id);

      if(avatar){
        setCharacterHpBar(avatar,m.hp,m.maxHp);
      }
    }

    if(m.type==='death'){
      showDeathPopup();
      return;
    }

    if(m.type==='chat'){
      addMessage(m.item);
      showBubble(m.item);
    }

    if(m.type==='votes'){
      updateVotes(m.votes);
    }

    if(m.type==='chat_deleted'){
      document.querySelectorAll('#messages .msg')
        .forEach(el=>{
          if(el.dataset.messageId===m.id){
            el.remove();
          }
        });

      deleteBubbleByMessage(m.id);
    }

    if(m.type==='chat_reset'){
      $('messages').replaceChildren();

      for(const id of [...activeBubbles.keys()]){
        removeBubble(id);
      }
    }
  };
}

$('long').onclick=()=>{
  if(!profile)return showProfile();

  send({
    type:'vote',
    side:'long'
  });
};

$('short').onclick=()=>{
  if(!profile)return showProfile();

  send({
    type:'vote',
    side:'short'
  });
};

$('chat-form').onsubmit=e=>{
  e.preventDefault();
  if(!profile)return showProfile();

  const input=$('chat-input');
  const message=input.value.trim();

  if(message){
    send({
      type:'chat',
      message
    });
    input.value='';
  }
};
// ========================================
// Enter키 채팅 바로가기
// ========================================

window.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.repeat) return;

  if (
    !$('profile-modal').hidden ||
    defeated ||
    reentryRequired ||
    !profile
  ) return;

  const chatInput = $('chat-input');
  const active = document.activeElement;

  // 다른 입력창을 사용하고 있다면 방해하지 않음
  if (
    active?.matches('input, textarea, select, [contenteditable="true"]')
  ) return;

  e.preventDefault();
  keys.clear();
  magicPressed = false;
  chatInput.focus();
});

$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    $('chat-input').blur();
  }

  if (e.key === 'Enter' && !e.isComposing) {
    // 기존 채팅 전송 함수가 처리하도록 유지
    setTimeout(() => $('chat-input').blur(), 0);
  }
});
renderAssets();
updatePrices();
updateCandles();

setInterval(updatePrices,15000);
setInterval(updateCandles,60000);
connect();

const econFrame=$('investing-calendar');

if(econFrame){
  const custom=
    window.INVESTING_WIDGET_URL||
    window.JMC_INVESTING_WIDGET_URL;

  const fallback=
    'https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=3&features=datepicker&countries=5&calType=week&timeZone=88&lang=18';

  econFrame.src=
    typeof custom==='string'&&
    /^https:\/\/(?:sslecal2\.investing\.com|sslecal2\.forexprostools\.com)(?:\/|\?)/i.test(custom)
      ?custom
      :fallback;
}

$('calendar-scene-button')?.addEventListener(
  'click',
  ()=>{
    const panel=$('econ-panel');

    panel?.scrollIntoView({
      behavior:'smooth',
      block:'center'
    });

    panel?.classList.add('econ-focus');

    setTimeout(
      ()=>panel?.classList.remove('econ-focus'),
      1800
    );
  }
);

// ========================================
// A키 연속 마법 공격 + 멀티플레이 동기화
// ========================================

let magicPressed=false;
let lastMagicTime=0;

const magicProjectiles=[];

const MAGIC_INTERVAL=200;
const MAGIC_SPEED=13;
const MAGIC_LIFETIME=1100;

function castMagic(){
  if(!myAvatar||defeated||reentryRequired||npcMode==='npc'||npcPendingMode)return;
  send({type:'magic'});
}

function createBitcoinMagicTexture(){
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');

  ctx.clearRect(0,0,256,256);

  ctx.fillStyle = '#f7931a';
  ctx.beginPath();
  ctx.arc(128,128,118,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128,128,101,0,Math.PI*2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 150px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₿',128,136);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function spawnRemoteMagic(m){
  if(!m?.shotId||!m.senderId)return;

  const x=Number(m.x);
  const y=Number(m.y);
  const z=Number(m.z);
  const facing=Number(m.direction);

  if(![x,y,z,facing].every(Number.isFinite))return;
  if(magicProjectiles.some(shot=>shot.id===m.shotId))return;

  const direction=new THREE.Vector3(
    Math.sin(facing),0,Math.cos(facing)
  ).normalize();

  // 이치고 전용 월아천충: 서버 검증을 거친 발사자 캐릭터로 판정
  if(m.animal==='ichigo'){
    const projectile=new THREE.Group();
    const crescent=new THREE.Shape();
    // 기존 0.46 두께에서 0.16으로 축소: 날카롭고 얇은 칼날형 월아천충
    const outer=1.02, inner=.86;
    const start=-Math.PI*.64, end=Math.PI*.64;
    for(let i=0;i<=32;i++){
      const t=start+(end-start)*i/32;
      const px=Math.sin(t)*outer, py=Math.cos(t)*outer;
      if(i===0)crescent.moveTo(px,py);else crescent.lineTo(px,py);
    }
    for(let i=32;i>=0;i--){
      const t=start+(end-start)*i/32;
      crescent.lineTo(Math.sin(t)*inner,Math.cos(t)*inner);
    }
    crescent.closePath();
    const core=new THREE.Mesh(
      new THREE.ShapeGeometry(crescent),
      new THREE.MeshBasicMaterial({color:0xeaffff,side:THREE.DoubleSide,
        transparent:true,opacity:.98,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    const aura=new THREE.Mesh(
      new THREE.ShapeGeometry(crescent),
      new THREE.MeshBasicMaterial({color:0x1a8fff,side:THREE.DoubleSide,
        transparent:true,opacity:.30,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    aura.scale.set(1.1,1.08,1);
    aura.position.z=-.02;
    // 가느다란 밝은 윤곽선으로 검날 느낌 강조
    const edge=new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(crescent.getPoints(50)),
      new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.75})
    );
    edge.position.z=.012;
    projectile.add(core,aura,edge);
    projectile.position.set(x,y+1.15,z);
    projectile.position.addScaledVector(direction,.85);
    projectile.rotation.y=facing;
    scene.add(projectile);
    magicProjectiles.push({id:m.shotId,ownerId:m.senderId,object:projectile,
      direction,born:performance.now(),core:null,aura,freezeUntil:0,predictedContact:false});
    const caster=m.senderId===myId?myAvatar:others.get(m.senderId);
    if(caster?.userData?.ichigoSword){
      caster.userData.ichigoSword.rotation.z=-1.05;
      caster.userData.ichigoSword.userData.swingAt=performance.now();
    }
    playMagicCastSfx(magicSoundVolume(x,z));
    return;
  }

  const projectile = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(.24,.24,.08,32),
    new THREE.MeshStandardMaterial({
      color:0xf2a900,
      emissive:0xa85c00,
      emissiveIntensity:.45,
      metalness:.75,
      roughness:.28
    })
  );

  core.rotation.z = Math.PI / 2;

  const frontLogo = new THREE.Mesh(
    new THREE.PlaneGeometry(.34,.34),
    new THREE.MeshBasicMaterial({
      map:createBitcoinMagicTexture(),
      transparent:true,
      depthWrite:false
    })
  );
  frontLogo.position.z = .045;

  const backLogo = new THREE.Mesh(
    new THREE.PlaneGeometry(.34,.34),
    new THREE.MeshBasicMaterial({
      map:createBitcoinMagicTexture(),
      transparent:true,
      depthWrite:false
    })
  );

  backLogo.position.z = -.045;
  backLogo.rotation.y = Math.PI;

  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(.34,.05,10,24),
    new THREE.MeshBasicMaterial({
      color:0xffb347,
      transparent:true,
      opacity:.42,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    })
  );

  aura.rotation.y = Math.PI / 2;

  projectile.add(core,aura,frontLogo,backLogo);
  projectile.position.set(x,y+1.15,z);
  projectile.position.addScaledVector(direction,.85);
  scene.add(projectile);

  magicProjectiles.push({
    id:m.shotId,
    ownerId:m.senderId,
    object:projectile,
    direction,
    born:performance.now(),
    core,
    aura,
    freezeUntil:0,
    predictedContact:false
  });

  playMagicCastSfx(magicSoundVolume(x,z));
}

function advanceVisibleMagic(shot,dt,now){
  if(shot.freezeUntil&&now<shot.freezeUntil)return;
  shot.freezeUntil=0;

  const current=shot.object.position;
  const dx=shot.direction.x*MAGIC_SPEED*dt;
  const dz=shot.direction.z*MAGIC_SPEED*dt;
  const a=dx*dx+dz*dz;
  let best=null;

  if(!shot.predictedContact&&a>0){
    const candidates=[
      ...(myAvatar&&!defeated&&!reentryRequired
        ?[{id:myId,avatar:myAvatar}]
        :[]),
      ...[...others.entries()].map(
        ([id,avatar])=>({id,avatar})
      )
    ];

    for(const {id,avatar} of candidates){
      if(id===shot.ownerId||!avatar?.visible)continue;

      if(
        Math.abs(
          current.y-(avatar.position.y+1.0)
        )>.85
      )continue;

      const fx=current.x-avatar.position.x;
      const fz=current.z-avatar.position.z;
      const b=2*(fx*dx+fz*dz);
      const c=fx*fx+fz*fz-.72*.72;
      const discriminant=b*b-4*a*c;

      if(discriminant<0)continue;

      const t=c<=0
        ?0
        :(-b-Math.sqrt(discriminant))/(2*a);

      if(t<0||t>1)continue;
      if(best===null||t<best)best=t;
    }
  }

  if(best!==null){
    current.x+=dx*best;
    current.z+=dz*best;
    shot.predictedContact=true;
    shot.freezeUntil=now+170;
  }else{
    current.x+=dx;
    current.z+=dz;
  }
}

function disposeMagicProjectile(shot){
  scene.remove(shot.object);

  shot.object.traverse(node=>{
    if(!node.isMesh)return;

    if(node.geometry){
      node.geometry.dispose();
    }

    if(Array.isArray(node.material)){
      node.material.forEach(mat=>{
        if(mat.map)mat.map.dispose();
        mat.dispose();
      });
    }else if(node.material){
      if(node.material.map)node.material.map.dispose();
      node.material.dispose();
    }
  });
}

const impactEffects=[];
const IMPACT_LIFETIME=420;
const HIT_REACTION_DURATION=340;
const HIT_FLASH_COLOR=new THREE.Color(0xff758f);

const damageVeil=document.createElement('div');

damageVeil.style.cssText=`
  position:absolute;inset:0;z-index:18;
  pointer-events:none;opacity:0;
  background:radial-gradient(
    circle,
    transparent 40%,
    rgba(255,44,88,.55)
  );
`;

sceneEl.appendChild(damageVeil);
let lastSelfHit=-Infinity;

function createMagicImpact(x,y,z){
  const group=new THREE.Group();
  group.position.set(x,y,z);
  scene.add(group);

  const orb=new THREE.Mesh(
    new THREE.SphereGeometry(.22,12,8),
    new THREE.MeshBasicMaterial({
      color:0xeaffff,
      transparent:true,
      opacity:1,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    })
  );
  group.add(orb);

  const ring=new THREE.Mesh(
    new THREE.RingGeometry(.18,.27,28),
    new THREE.MeshBasicMaterial({
      color:0x9f7bff,
      transparent:true,
      opacity:.9,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      side:THREE.DoubleSide
    })
  );
  group.add(ring);

  const sparkGeo=new THREE.SphereGeometry(.065,6,4);
  const sparkMat=new THREE.MeshBasicMaterial({
    color:0x7dffff,
    transparent:true,
    opacity:1,
    blending:THREE.AdditiveBlending,
    depthWrite:false
  });

  const sparks=[];

  for(let i=0;i<10;i++){
    const mesh=new THREE.Mesh(sparkGeo,sparkMat);
    const theta=Math.random()*Math.PI*2;
    const rise=(Math.random()-.25)*1.5;
    const speed=1.3+Math.random()*2.2;

    const velocity=new THREE.Vector3(
      Math.cos(theta)*speed,
      rise,
      Math.sin(theta)*speed
    );

    group.add(mesh);
    sparks.push({mesh,velocity});
  }

  const canvas=document.createElement('canvas');
  canvas.width=128;
  canvas.height=64;

  const ctx=canvas.getContext('2d');
  ctx.font='bold 46px Arial';
  ctx.textAlign='center';
  ctx.strokeStyle='#502038';
  ctx.lineWidth=6;
  ctx.strokeText('-1',64,49);
  ctx.fillStyle='#ffb5ca';
  ctx.fillText('-1',64,49);

  const textTexture=new THREE.CanvasTexture(canvas);

  const textSprite=new THREE.Sprite(
    new THREE.SpriteMaterial({
      map:textTexture,
      transparent:true,
      depthTest:false,
      depthWrite:false
    })
  );

  textSprite.position.y=.45;
  textSprite.scale.set(.72,.36,1);
  group.add(textSprite);

  impactEffects.push({
    born:performance.now(),
    group,
    orb,
    ring,
    sparks,
    sparkGeo,
    sparkMat,
    textSprite
  });
}

function beginHitReaction(avatar,dirX,dirZ){
  if(!avatar)return;

  const originals=
    avatar.userData.hitReaction?.originals||
    new Map();

  avatar.userData.bodyGroup.traverse(node=>{
    const material=node.material;

    if(
      material?.isMeshStandardMaterial&&
      !originals.has(material)
    ){
      originals.set(
        material,
        material.color.clone()
      );
    }
  });

  avatar.userData.hitReaction={
    born:performance.now(),
    dirX:Number(dirX)||0,
    dirZ:Number(dirZ)||0,
    originals
  };
}

function handleMagicHit(m){
  const index=magicProjectiles.findIndex(
    shot=>shot.id===m.shotId
  );

  if(index>=0){
    disposeMagicProjectile(magicProjectiles[index]);
    magicProjectiles.splice(index,1);
  }

  const x=Number(m.x);
  const y=Number(m.y);
  const z=Number(m.z);

  if([x,y,z].every(Number.isFinite)){
    createMagicImpact(x,y,z);
  }

  const victim=m.targetId===myId
    ?myAvatar
    :others.get(m.targetId);

  beginHitReaction(victim,m.dirX,m.dirZ);

  if(m.targetId===myId){
    lastSelfHit=performance.now();
  }

  playMagicHitSfx(
    m.targetId===myId
      ?1
      :magicSoundVolume(x,z)
  );
}

function updateMagicImpacts(now){
  for(let i=impactEffects.length-1;i>=0;i--){
    const effect=impactEffects[i];
    const age=now-effect.born;
    const t=Math.min(1,age/IMPACT_LIFETIME);
    const strength=1-t;

    effect.orb.scale.setScalar(1+t*1.5);
    effect.orb.material.opacity=strength;

    effect.ring.scale.setScalar(1+t*4);
    effect.ring.material.opacity=strength*.9;
    effect.ring.quaternion.copy(camera.quaternion);

    effect.sparkMat.opacity=strength;

    for(const {mesh,velocity} of effect.sparks){
      mesh.position.copy(velocity).multiplyScalar(age/1000);
    }

    effect.textSprite.position.y=.45+t*.65;
    effect.textSprite.material.opacity=strength;

    if(age>=IMPACT_LIFETIME){
      scene.remove(effect.group);
      effect.orb.geometry.dispose();
      effect.orb.material.dispose();
      effect.ring.geometry.dispose();
      effect.ring.material.dispose();
      effect.sparkGeo.dispose();
      effect.sparkMat.dispose();
      effect.textSprite.material.map.dispose();
      effect.textSprite.material.dispose();
      impactEffects.splice(i,1);
    }
  }

  const strength=Math.max(0,1-(now-lastSelfHit)/280);
  damageVeil.style.opacity=String(strength*.6);

  for(const avatar of [myAvatar,...others.values()]){
    const hit=avatar?.userData.hitReaction;
    if(!hit)continue;

    const t=Math.min(
      1,
      (now-hit.born)/HIT_REACTION_DURATION
    );

    const shake=
      Math.sin(t*Math.PI)*(.3*(1-t*.4));

    const body=avatar.userData.bodyGroup;

    body.rotation.x=-shake;
    body.rotation.z=shake*(hit.dirX>=0?1:-1);
    body.position.x=hit.dirX*shake*.65;
    body.position.z=hit.dirZ*shake*.65;

    const flash=t<.35?(1-t/.35)*.65:0;

    for(const [material,original] of hit.originals){
      material.color.copy(original)
        .lerp(HIT_FLASH_COLOR,flash);
    }

    if(t>=1){
      body.rotation.x=0;
      body.rotation.z=0;
      body.position.x=0;
      body.position.z=0;
      delete avatar.userData.hitReaction;
    }
  }
}

window.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()!=='a')return;

  if(
    ['INPUT','TEXTAREA'].includes(
      document.activeElement?.tagName
    )
  )return;

  if(
    !$('profile-modal').hidden||
    defeated||
    reentryRequired
  )return;

  e.preventDefault();
  magicPressed=true;
});

window.addEventListener('keyup',e=>{
  if(e.key.toLowerCase()==='a'){
    magicPressed=false;
  }
});

window.addEventListener('blur',()=>{
  magicPressed=false;
});

let previousMagicFrame=performance.now();

function updateMagic(now){
  requestAnimationFrame(updateMagic);

  const dt=Math.min(
    (now-previousMagicFrame)/1000,
    .05
  );

  previousMagicFrame=now;

  if(
    magicPressed&&
    !defeated&&
    !reentryRequired&&
    myAvatar&&
    $('profile-modal').hidden&&
    now-lastMagicTime>=MAGIC_INTERVAL
  ){
    castMagic();
    lastMagicTime=now;
  }

  if(myAvatar?.userData.bodyGroup){
    const body=myAvatar.userData.bodyGroup;

    body.rotation.z=magicPressed
      ?Math.sin(now*.018)*.12
      :THREE.MathUtils.lerp(
          body.rotation.z,
          0,
          .2
        );
  }

  // 참백도 참격 모션을 다른 이용자에게도 표시
  for(const avatar of [myAvatar,...others.values()]){
    const sword=avatar?.userData?.ichigoSword;
    if(!sword)continue;
    const elapsed=now-(sword.userData.swingAt||0);
    sword.rotation.z=elapsed<260
      ?-1.05+Math.sin(Math.min(1,elapsed/260)*Math.PI)*.8
      :THREE.MathUtils.lerp(sword.rotation.z,-.32,.18);
  }

  for(let i=magicProjectiles.length-1;i>=0;i--){
    const shot=magicProjectiles[i];

    advanceVisibleMagic(shot,dt,now);
    shot.aura.rotation.y+=dt*9;
    if(shot.core)shot.core.rotation.x+=dt*12;

    const age=now-shot.born;
    const remaining=Math.max(
      0,
      1-age/MAGIC_LIFETIME
    );

    shot.aura.material.opacity=
      remaining*.48;

    if(age>=MAGIC_LIFETIME){
      disposeMagicProjectile(shot);
      magicProjectiles.splice(i,1);
    }
  }

  updateMagicImpacts(now);
}

requestAnimationFrame(updateMagic);

// ====================================================
// 전투 HP HUD / 사망 팝업 / 입장 화면으로 자동 복귀
// ====================================================

const hpHud = document.createElement('div');
hpHud.id = 'jmc-hp-hud';

hpHud.style.cssText = `
  position:absolute;
  z-index:25;
  left:12px;
  top:12px;
  width:62px;
  height:min(230px,38%);
  min-height:145px;
  padding:9px 5px;
  box-sizing:border-box;
  border:1px solid rgba(212,183,128,.75);
  border-radius:14px;
  background:rgba(7,20,33,.91);
  color:white;
  pointer-events:none;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:7px;
  font:700 11px Arial,sans-serif;
`;

hpHud.innerHTML = `
  <div style="
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:3px;
  ">
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#50dfbc"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="
        display:block;
        filter:drop-shadow(0 0 4px rgba(80,223,188,.35));
      "
    >
      <path d="M2 12h4l3-7 5 14 3-7h5"/>
    </svg>

    <span style="
      font-size:11px;
      font-weight:800;
      letter-spacing:1px;
      color:#e9f4f5;
    ">HP</span>
  </div>

  <div id="jmc-hp-text" style="
    font-size:11px;
    color:white;
    white-space:nowrap;
    width:100%;
    box-sizing:border-box;
    text-align:center;
    line-height:1.2;
    font-variant-numeric:tabular-nums;
  ">100/100</div>

  <div style="
    position:relative;
    width:22px;
    flex:1;
    min-height:65px;
    background:#4e263d;
    border:1px solid rgba(255,255,255,.25);
    border-radius:12px;
    overflow:hidden;
  ">
    <div id="jmc-hp-fill" style="
      position:absolute;
      left:0;
      bottom:0;
      width:100%;
      height:100%;
      background:#43de9a;
      border-radius:10px;
      transition:height .2s ease,background-color .2s ease;
    "></div>
  </div>
`;

sceneEl.appendChild(hpHud);

// ========================================
// 모바일 HP바 메타버스 좌측 상단 고정
// ========================================

function positionMobileHp() {
  const mobile = window.matchMedia(
    '(max-width:980px), (pointer:coarse)'
  ).matches;

  if (!mobile) {
    if (hpHud.parentElement !== sceneEl) {
      sceneEl.appendChild(hpHud);
    }

    [
      'position',
      'left',
      'top',
      'width',
      'height',
      'min-height',
      'padding',
      'gap'
    ].forEach(name => {
      hpHud.style.removeProperty(name);
    });

    hpHud.style.cssText = `
      position:absolute;
      z-index:25;
      left:12px;
      top:12px;
      width:62px;
      height:min(230px,38%);
      min-height:145px;
      padding:9px 5px;
      box-sizing:border-box;
      border:1px solid rgba(212,183,128,.75);
      border-radius:14px;
      background:rgba(7,20,33,.91);
      color:white;
      pointer-events:none;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:7px;
      font:700 11px Arial,sans-serif;
    `;

    return;
  }

  if (hpHud.parentElement !== document.body) {
    document.body.appendChild(hpHud);
  }

  const rect = sceneEl.getBoundingClientRect();

  hpHud.style.setProperty(
    'position',
    'fixed',
    'important'
  );

  hpHud.style.setProperty(
    'left',
    `${rect.left + 6}px`,
    'important'
  );

  hpHud.style.setProperty(
    'top',
    `${rect.top + 6}px`,
    'important'
  );

  hpHud.style.setProperty(
    'width',
    '48px',
    'important'
  );

  hpHud.style.setProperty(
    'height',
    '96px',
    'important'
  );

  hpHud.style.setProperty(
    'min-height',
    '96px',
    'important'
  );

  hpHud.style.setProperty(
    'padding',
    '5px 3px',
    'important'
  );

  hpHud.style.setProperty(
    'gap',
    '3px',
    'important'
  );

  hpHud.style.setProperty(
    'z-index',
    '9997',
    'important'
  );

  const icon = hpHud.querySelector('svg');

  if (icon) {
    icon.style.setProperty(
      'display',
      'none',
      'important'
    );
  }
}

positionMobileHp();

window.addEventListener(
  'resize',
  positionMobileHp
);

window.addEventListener(
  'scroll',
  positionMobileHp,
  {passive:true}
);

window.visualViewport?.addEventListener(
  'resize',
  positionMobileHp
);

window.addEventListener(
  'load',
  positionMobileHp
);

const jmcMobileHpStyle = document.createElement('style');

jmcMobileHpStyle.textContent = `
  @media (max-width:980px), (pointer:coarse) {
    #jmc-hp-hud {
      position:absolute !important;
      left:6px !important;
      top:6px !important;
      width:62px !important;
      height:120px !important;
      min-height:120px !important;
      padding:6px 4px !important;
      gap:4px !important;
      border-radius:11px !important;
    }

    #jmc-hp-hud svg {
      display:none !important;
    }

    #jmc-hp-hud #jmc-hp-text {
      display:block !important;
      width:100% !important;
      max-width:100% !important;
      min-width:0 !important;
      box-sizing:border-box !important;
      padding:0 !important;
      margin:0 !important;
      font-size:8px !important;
      font-weight:700 !important;
      letter-spacing:-0.5px !important;
      line-height:11px !important;
      text-align:center !important;
      white-space:nowrap !important;
      flex-shrink:0 !important;
    }
  }
`;

document.head.appendChild(jmcMobileHpStyle);

function updateMobileHpIcon() {
  const mobile = window.matchMedia(
    '(max-width: 980px), (pointer: coarse)'
  ).matches;

  const icon = hpHud.querySelector('svg');

  if (icon) {
    icon.style.setProperty(
      'display',
      mobile ? 'none' : 'block',
      'important'
    );
  }
}

updateMobileHpIcon();

window.addEventListener(
  'resize',
  updateMobileHpIcon
);

function updateHpHud(hp,maxHp=100){
  const max = Math.max(1,Number(maxHp)||100);

  const remaining = Math.max(
    0,
    Math.min(max,Number(hp)||0)
  );

  myHp = remaining;

  const percent = (remaining/max)*100;

  const hpText = document.getElementById('jmc-hp-text');
  hpText.textContent = `${remaining}/${max}`;

  const isMobileHp = window.matchMedia(
    '(max-width:980px), (pointer:coarse)'
  ).matches;

  if (isMobileHp) {
    hpHud.style.setProperty(
      'overflow',
      'hidden',
      'important'
    );

    hpHud.style.setProperty(
      'box-sizing',
      'border-box',
      'important'
    );

    hpHud.style.setProperty(
      'gap',
      '2px',
      'important'
    );

    hpText.style.setProperty(
      'display',
      'block',
      'important'
    );

    hpText.style.setProperty(
      'font-size',
      '8px',
      'important'
    );

    hpText.style.setProperty(
      'line-height',
      '11px',
      'important'
    );

    hpText.style.setProperty(
      'letter-spacing',
      '-0.6px',
      'important'
    );

    hpText.style.setProperty(
      'width',
      '100%',
      'important'
    );

    hpText.style.setProperty(
      'max-width',
      '100%',
      'important'
    );

    hpText.style.setProperty(
      'min-width',
      '0',
      'important'
    );

    hpText.style.setProperty(
      'text-align',
      'center',
      'important'
    );

    hpText.style.setProperty(
      'white-space',
      'nowrap',
      'important'
    );

    hpText.style.setProperty(
      'overflow',
      'hidden',
      'important'
    );

    hpText.style.setProperty(
      'flex-shrink',
      '0',
      'important'
    );

    const hpTrack = document.getElementById(
      'jmc-hp-fill'
    )?.parentElement;

    if (hpTrack) {
      hpTrack.style.setProperty(
        'min-height',
        '0',
        'important'
      );

      hpTrack.style.setProperty(
        'flex',
        '1 1 0',
        'important'
      );

      hpTrack.style.setProperty(
        'width',
        '15px',
        'important'
      );

      hpTrack.style.setProperty(
        'max-height',
        '100%',
        'important'
      );

      hpTrack.style.setProperty(
        'overflow',
        'hidden',
        'important'
      );
    }
  }

  $('jmc-hp-fill').style.height =
    percent+'%';

  let hpColor;

  if(percent<=25){
    hpColor = '#f16c7c';
  }else if(percent<=50){
    hpColor = '#f0a43c';
  }else{
    hpColor = '#43de9a';
  }

  $('jmc-hp-fill').style.backgroundColor = hpColor;

  if(myAvatar){
    setCharacterHpBar(myAvatar,remaining,max);
  }
}

function showDeathPopup(){
  if(defeated)return;

  defeated=true;
  magicPressed=false;
  keys.clear();
  touchCounts.clear();

  if(myAvatar){
    myAvatar.visible=false;
  }

  updateHpHud(0,100);
  $('connection').textContent='퇴장';

  if(socket?.readyState===WebSocket.OPEN){
    socket.close(4001,'HP depleted');
  }

  const overlay=document.createElement('div');
  overlay.id='jmc-death-overlay';

  overlay.style.cssText=`
    position:fixed;
    inset:0;
    z-index:100000;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(2,6,13,.87);
    padding:20px;
    box-sizing:border-box;
  `;

  const dialog=document.createElement('div');

  dialog.style.cssText=`
    max-width:390px;
    width:100%;
    text-align:center;
    background:#13253a;
    border:1px solid #bc7797;
    border-radius:18px;
    padding:36px 24px;
    color:#fff;
    box-shadow:0 0 50px rgba(155,38,75,.3);
    font-family:Arial,sans-serif;
  `;

  const title=document.createElement('h2');
  title.textContent='전투 불능';

  title.style.cssText=`
    font-size:30px;
    font-weight:800;
    letter-spacing:1px;
    color:#ff9eaa;
    margin:0 0 16px;
  `;

  const message=document.createElement('p');
  message.textContent=
    '모든 체력이 소진되어 전투가 종료되었습니다. 다음 도전을 준비해 주세요.';

  message.style.cssText=`
    font-size:14px;
    line-height:1.8;
    margin:0 0 22px;
    color:#d5dfeb;
    word-break:keep-all;
  `;

  const button=document.createElement('button');
  button.type='button';
  button.textContent='다시 입장하기';

  button.style.cssText=`
    cursor:pointer;
    width:100%;
    border:0;
    border-radius:10px;
    background:#dfc18d;
    color:#182537;
    font-size:15px;
    font-weight:800;
    padding:14px 20px;
  `;

  let transitioning=false;

  const returnToEntry=()=>{
    if(transitioning)return;
    transitioning=true;

    try{
      sessionStorage.setItem(
        'jmc-reentry-required',
        '1'
      );
    }catch{
      try{
        localStorage.removeItem('jmc-profile');
      }catch{}
    }

    location.reload();
  };

  button.addEventListener(
    'click',
    returnToEntry
  );

  dialog.append(
    title,
    message,
    button
  );

  overlay.append(dialog);
  document.body.appendChild(overlay);
}
