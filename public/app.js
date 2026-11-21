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
  ['deer','사슴','🦌',0xb87d54]
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
const BOARD_WIDTH = 17;
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
  if(old?.name===name) return;
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
  sprite.position.set(0,3.55,0);
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
jmcCheckButton.style.cssText=
  'margin-top:8px;padding:9px 12px;border-radius:8px;cursor:pointer';

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

function jmcOpenAccountProfile(required=false) {
  if(!jmcGoogleUser)return;

  jmcProfileRequired=required || !jmcGoogleUser.accountNickname;

  jmcAccountModal.hidden=false;
  jmcAccountModal.style.display='flex';
  jmcNicknameInput.value=jmcGoogleUser.accountNickname || '';
  jmcAnimalSelector.value=jmcGoogleUser.accountAnimal || 'seal';
  jmcCheckedNickname='';
  jmcAccountSave.disabled=true;
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

    if (jmcGoogleUser && !jmcGoogleUser.accountNickname) {
      jmcOpenAccountProfile(true);
    }

    jmcGoogleEnabled = data.configured === true;

    jmcGoogleButton.hidden =
      !jmcGoogleEnabled && !jmcGoogleUser;

    jmcGoogleButton.textContent = jmcGoogleUser
      ? 'Google 계정 로그아웃'
      : 'Google 계정으로 로그인';

    jmcAuthNote.textContent = jmcGoogleUser
      ? `${jmcGoogleUser.name || 'Google 이용자'} · 비늘은 Google 계정에 보관됩니다.`
      : '게스트 입장은 기존 버튼을 이용하세요. 선물 신청은 Google 로그인이 필요합니다.';

    jmcAccountButton.textContent = jmcGoogleUser
      ? `Google · ${jmcGoogleUser.name || '로그인'}`
      : '게스트 · 로그인';

  } catch(error) {
    jmcAuthNote.textContent=
      '계정 상태를 불러오지 못했습니다. 게스트로는 입장할 수 있습니다.';
    jmcGoogleButton.hidden=true;
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

$('rename').onclick = ()=>showProfile(true);

$('nickname').addEventListener('keydown',e=>{
  if(e.key==='Enter')saveProfile();
});

if(profile && !reentryRequired){
  $('profile-modal').hidden = true;
  $('my-profile').textContent =
    `${animal(profile.animal).emoji} ${profile.name}`;
}else{
  showProfile();
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
      overflow:hidden !important;
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
      height:22px !important;
      line-height:22px !important;
      margin:0 !important;
      padding:0 !important;
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      overflow-wrap:normal !important;
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
  new THREE.PlaneGeometry(17,8.2),
  new THREE.MeshBasicMaterial({
    map:boardTexture,
    side:THREE.DoubleSide
  })
);
board.position.set(0,4.5,BOARD_Z);
scene.add(board);

function refreshBoard(){
  const c=boardCtx;

  c.fillStyle='#071421';
  c.fillRect(0,0,1280,620);

  c.fillStyle='#dfc79a';
  c.font='bold 34px Arial';
  c.fillText('JMC INVEST LOUNGE',40,55);

  c.fillStyle='#88a5b8';
  c.font='20px Arial';
  c.fillText('BTC · ETH · SOL · XRP',870,55);

  symbols.forEach((s,i)=>{
    const x=36+(i%2)*608;
    const y=90+Math.floor(i/2)*255;

    c.fillStyle='#10263a';
    c.fillRect(x,y,588,240);
    c.strokeStyle='#315065';
    c.strokeRect(x,y,588,240);

    c.fillStyle='#f0e1c2';
    c.font='bold 23px Arial';
    c.fillText(s.id+' / USD',x+18,y+34);

    c.fillStyle='#42dfbd';
    c.font='bold 29px Arial';
    c.fillText(money(s.price),x+180,y+35);

    const data=s.candles.filter(d=>
      [d.open,d.high,d.low,d.close].every(Number.isFinite)
    );

    if(!data.length){
      c.fillStyle='#809ab0';
      c.font='18px Arial';
      c.fillText('캔들 데이터 연결 대기',x+20,y+155);
      return;
    }

    const lo=Math.min(...data.map(d=>d.low));
    const hi=Math.max(...data.map(d=>d.high));
    const span=hi-lo||1;
    const step=550/data.length;

    data.forEach((d,j)=>{
      const xx=x+18+step*(j+.5);
      const yy=v=>y+220-(v-lo)/span*156;
      const color=d.close>=d.open?'#42dfbd':'#f17a98';

      c.strokeStyle=color;
      c.fillStyle=color;
      c.beginPath();
      c.moveTo(xx,yy(d.high));
      c.lineTo(xx,yy(d.low));
      c.stroke();

      const top=yy(Math.max(d.open,d.close));
      const bottom=yy(Math.min(d.open,d.close));
      const bw=Math.max(2,step*.6);

      c.fillRect(xx-bw/2,top,bw,Math.max(2,bottom-top));
    });
  });

  boardTexture.needsUpdate=true;
}

refreshBoard();

const others=new Map();

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
  const focus=boardFocus(position);

  return new THREE.Vector3(
    position.x-Math.sin(yaw)*distance,
    position.y+CAMERA_HEIGHT+focus*.8,
    position.z-Math.cos(yaw)*distance
  );
}

function cameraLookAtFor(position){
  return new THREE.Vector3(
    position.x,
    position.y+1.15+boardFocus(position)*1.25,
    position.z
  );
}

function resetToBoard(){
  yaw=Math.PI;

  if(myAvatar){
    myAvatar.position.set(0,0,-8);
    myAvatar.rotation.y=Math.PI;
    myAvatar.userData.targetDirection=Math.PI;
  }

  const p=myAvatar?.position||new THREE.Vector3(0,0,-8);

  camera.position.copy(cameraPositionFor(p));
  camera.lookAt(cameraLookAtFor(p));
  camera.updateMatrixWorld();
}

function updateMyAvatar(){
  if(!profile)return;

  const pos=myAvatar
    ?myAvatar.position.clone()
    :new THREE.Vector3(0,0,-8);

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
    setCharacterName(avatar,p.name);
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
  sprite.position.set(0,4.7,0);
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

  keys.add(k);
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
      Number(held('s')||held('arrowdown'))-
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
    new THREE.Vector3(0,0,-8);

  const followAlpha=1-Math.exp(-CAMERA_FOLLOW_SPEED*dt);

  camera.position.lerp(
    cameraPositionFor(target),
    followAlpha
  );

  camera.lookAt(cameraLookAtFor(target));

  tickBubbles(now);
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

window.addEventListener('jmc-inventory-craft',()=>{
  send({type:'inventory_craft'});
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
      m.type === 'inventory_notice'
    ) {
      window.dispatchEvent(
        new CustomEvent('jmc-inventory', {
          detail: m
        })
      );
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
  if(!myAvatar||defeated||reentryRequired)return;
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

  const countdown=document.createElement('p');
  countdown.textContent=
    '3초 후 입장 화면으로 돌아갑니다.';

  countdown.style.cssText=`
    font-size:13px;
    margin:0 0 20px;
    color:#dfb0bc;
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
  let seconds=3;
  let timerId;

  const returnToEntry=()=>{
    if(transitioning)return;
    transitioning=true;
    clearInterval(timerId);

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
    countdown,
    button
  );

  overlay.append(dialog);
  document.body.appendChild(overlay);

  timerId=setInterval(()=>{
    seconds--;

    if(seconds<=0){
      returnToEntry();
    }else{
      countdown.textContent=
        `${seconds}초 후 입장 화면으로 돌아갑니다.`;
    }
  },1000);
}
