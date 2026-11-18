import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
const $=id=>document.getElementById(id);
const animals=[
 ['seal','아기물개','🦭',0xe9f0ed],['cat','고양이','🐱',0xd89b61],['dog','강아지','🐶',0xc9945b],
 ['rabbit','토끼','🐰',0xf1e9e3],['fox','여우','🦊',0xe7833d],['panda','판다','🐼',0xf0eee8],
 ['bear','곰','🐻',0x9b6548],['penguin','펭귄','🐧',0x293746],['frog','개구리','🐸',0x6bba59],
 ['hamster','햄스터','🐹',0xe6bb83],['lion','사자','🦁',0xd5a052],['tiger','호랑이','🐯',0xe69a40],
 ['koala','코알라','🐨',0x9ea7ae],['raccoon','너구리','🦝',0x777d81],['deer','사슴','🦌',0xb87d54]
].map(([id,name,emoji,color])=>({id,name,emoji,color}));
const animal=id=>animals.find(a=>a.id===id)||animals[0];
const symbols=['BTC','ETH','SOL','XRP'].map((id,i)=>({id,name:['비트코인','이더리움','솔라나','리플'][i],price:null,candles:[]}));
const ranges={'1h':[60,60],'1d':[900,96],'1w':[3600,168]};
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'연결 대기';
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function turn(current,target,max){const diff=angle(target-current);return Math.abs(diff)<=max?target:current+Math.sign(diff)*max;}

// 입체 동물 모델 제작: 모든 캐릭터는 Three.js 실제 3D 메시
const sphere=new THREE.SphereGeometry(1,20,14);
function makeAnimal(id){
 const a=animal(id),root=new THREE.Group(),bodyGroup=new THREE.Group();root.add(bodyGroup);
 const mat=(color,roughness=.84)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0});
 const fur=mat(a.color),light=mat(0xffe9d4),dark=mat(0x20212b),pink=mat(0xe98f9d),white=mat(0xffffff),brown=mat(0x7d4b30);
 function orb(parent,x,y,z,sx,sy,sz,material){const m=new THREE.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
 function cone(parent,x,y,z,r,h,material,rotation=0){const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,12),material);m.position.set(x,y,z);m.rotation.z=rotation;parent.add(m);return m;}
 orb(bodyGroup,0,.91,0,.53,.68,.42,fur); // 몸
 orb(bodyGroup,0,1.82,.1,.67,.61,.58,fur); // 머리
 orb(bodyGroup,0,.92,.37,.36,.45,.1,light); // 배
 // 다리
 for(const x of [-.31,.31])for(const z of [-.23,.24])orb(bodyGroup,x,.32,z,.18,.32,.2,fur);
 // 귀: 종별 형태
 if(['rabbit','deer'].includes(id)){
  for(const x of [-.39,.39]){const e=orb(bodyGroup,x,2.48,.04,.2,id==='rabbit'?.59:.42,.16,fur);e.rotation.z=x>0?-.18:.18;
   if(id==='rabbit'){const inner=orb(bodyGroup,x,2.49,.19,.11,.41,.04,pink);inner.rotation.z=e.rotation.z;}}
 }else if(id==='seal'||id==='penguin'||id==='frog'){
  if(id==='frog')for(const x of [-.43,.43])orb(bodyGroup,x,2.26,.39,.24,.24,.21,fur);
 }else{
  for(const x of [-.47,.47]){
   if(['cat','fox','tiger','raccoon'].includes(id))cone(bodyGroup,x,2.39,.04,.24,.5,fur,x>0?-.23:.23);
   else orb(bodyGroup,x,2.36,.02,.26,.3,.2,fur);
  }
 }
 // 얼굴 무늬
 if(id==='panda'||id==='raccoon')for(const x of [-.29,.29])orb(bodyGroup,x,1.91,.58,.24,.24,.06,dark);
 if(id==='penguin'){orb(bodyGroup,0,1.04,.35,.36,.52,.11,white);orb(bodyGroup,0,1.87,.57,.46,.4,.1,white);}
 if(id==='fox'||id==='cat'||id==='dog'||id==='hamster'||id==='lion')orb(bodyGroup,0,1.56,.57,.42,.24,.14,light);
 // 눈, 눈동자, 빛 반사
 for(const x of [-.26,.26]){
  orb(bodyGroup,x,1.93,.62,.14,.17,.09,white);
  orb(bodyGroup,x,1.93,.695,.09,.12,.05,dark);
  orb(bodyGroup,x-.03,1.98,.738,.033,.042,.015,white);
 }
 if(id==='frog'){for(const x of [-.43,.43]){orb(bodyGroup,x,2.28,.55,.15,.16,.1,white);orb(bodyGroup,x,2.28,.64,.08,.11,.045,dark);}}
 if(id==='penguin')cone(bodyGroup,0,1.63,.7,.19,.36,mat(0xf2aa43),Math.PI/2);
 else orb(bodyGroup,0,1.65,.69,.16,.11,.12,['dog','bear','koala','raccoon','seal','panda'].includes(id)?dark:pink);
 // 볼
 for(const x of [-.42,.42])orb(bodyGroup,x,1.68,.57,.13,.085,.035,pink);
 // 꼬리
 if(!['seal','penguin','frog'].includes(id)){
  const tail=orb(bodyGroup,0,.9,-.52,id==='fox'?.34:.2,id==='fox'?.37:.25,id==='fox'?.5:.3,fur);
  tail.rotation.x=-.35;
 }
 if(id==='seal'){
  for(const x of [-.54,.54]){const fin=orb(bodyGroup,x,.55,.12,.31,.13,.42,fur);fin.rotation.z=x>0?-.45:.45;}
  orb(bodyGroup,0,.29,-.47,.46,.13,.29,fur);
 }
 if(id==='penguin')for(const x of [-.57,.57]){const wing=orb(bodyGroup,x,1.05,0,.19,.47,.2,fur);wing.rotation.z=x>0?-.35:.35;}
 if(id==='lion'){
  const mane=orb(bodyGroup,0,1.82,-.05,.83,.79,.54,mat(0xa56c31));
  // 갈기 뒤에 얼굴이 가려지지 않도록 앞면에 얼굴색 추가
  orb(bodyGroup,0,1.84,.43,.6,.54,.26,fur);
  for(const x of [-.26,.26]){orb(bodyGroup,x,1.93,.67,.14,.17,.09,white);orb(bodyGroup,x,1.93,.74,.09,.12,.05,dark);}
  orb(bodyGroup,0,1.65,.73,.15,.1,.1,dark);
 }
 if(id==='tiger')for(const x of [-.42,.42])for(const y of [1.65,1.91,2.12]){const stripe=orb(bodyGroup,x,y,.47,.11,.045,.1,dark);stripe.rotation.z=x>0?.35:-.35;}
 if(id==='deer')for(const x of [-.34,.34]){const antler=cone(bodyGroup,x,2.75,-.06,.09,.75,brown,x>0?-.3:.3);}
 if(id==='koala'){orb(bodyGroup,0,1.68,.72,.22,.29,.16,dark);for(const x of [-.65,.65])orb(bodyGroup,x,2.38,.06,.3,.33,.13,fur);}
 if(id==='hamster')for(const x of [-.46,.46])orb(bodyGroup,x,1.64,.45,.29,.25,.2,light);
 // 발 밑 그림자
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.7,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.2,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;root.add(shadow);
 root.userData.bodyGroup=bodyGroup;root.userData.targetDirection=Math.PI;root.userData.animal=id;root.userData.walk=0;root.userData.seated=false;root.userData.jumpHeight=0;
 return root;
}

// 3D 캐릭터 미리보기
const previewScene=new THREE.Scene();
const previewCamera=new THREE.PerspectiveCamera(35,1,.1,40);previewCamera.position.set(0,1.6,7.7);previewCamera.lookAt(0,1.45,0);
previewScene.add(new THREE.HemisphereLight(0xffffff,0x56758d,2.5));
const previewLight=new THREE.DirectionalLight(0xffe8c4,3.2);previewLight.position.set(3,6,5);previewScene.add(previewLight);
const previewRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
$('animal-preview').appendChild(previewRenderer.domElement);
let previewModel=null,previewAngle=0,previewDragging=false,previewX=0;
function selectAnimal(id){
 selectedAnimal=id;
 if(previewModel)previewScene.remove(previewModel);
 previewModel=makeAnimal(id);previewScene.add(previewModel);previewAngle=0;
 $('selected-animal-name').textContent=animal(id).name;
 document.querySelectorAll('.animal-option').forEach(b=>b.classList.toggle('selected',b.dataset.animal===id));
}
let selectedAnimal='seal';
const animalGrid=$('animal-grid');
for(const a of animals){
 const b=document.createElement('button');b.type='button';b.className='animal-option';b.dataset.animal=a.id;
 const e=document.createElement('span');e.className='animal-emoji';e.textContent=a.emoji;
 const n=document.createElement('span');n.className='animal-name';n.textContent=a.name;
 b.append(e,n);b.onclick=()=>selectAnimal(a.id);animalGrid.append(b);
}
selectAnimal('seal');
const previewEl=$('animal-preview');
previewEl.addEventListener('pointerdown',e=>{previewDragging=true;previewX=e.clientX;previewEl.setPointerCapture(e.pointerId);});
previewEl.addEventListener('pointermove',e=>{if(previewDragging){previewAngle+=(e.clientX-previewX)*.013;previewX=e.clientX;}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])previewEl.addEventListener(event,()=>previewDragging=false);
function resizePreview(){const r=previewEl.getBoundingClientRect();if(!r.width||!r.height)return;previewRenderer.setSize(r.width,r.height,false);previewCamera.aspect=r.width/r.height;previewCamera.updateProjectionMatrix();}
new ResizeObserver(resizePreview).observe(previewEl);

// 닉네임과 입장
let profile=null,myAvatar=null,activeSymbol=null,activeRange='1d',socket=null,myId=null,yaw=Math.PI;
try{const p=JSON.parse(localStorage.getItem('jmc-profile'));if(p?.name)profile={name:String(p.name).slice(0,16),animal:animal(p.animal).id};}catch{}
function showProfile(editing=false){selectedAnimal=profile?.animal||'seal';selectAnimal(selectedAnimal);$('nickname').value=profile?.name||'';$('profile-error').textContent='';$('cancel-profile').hidden=!editing;$('enter-lounge').textContent=editing?'설정 저장하기':'JMC 라운지 입장하기';$('profile-modal').hidden=false;resizePreview();}
function saveProfile(){const name=$('nickname').value.trim().slice(0,16);if(!name){$('profile-error').textContent='닉네임을 입력해주세요.';return;}
 const first=!profile;profile={name,animal:selectedAnimal};try{localStorage.setItem('jmc-profile',JSON.stringify(profile));}catch{}
 $('profile-modal').hidden=true;$('my-profile').textContent=`${animal(profile.animal).emoji} ${name}`;
 if(first)resetToBoard();updateMyAvatar();sendProfile();}
$('enter-lounge').onclick=saveProfile;$('cancel-profile').onclick=()=>{if(profile)$('profile-modal').hidden=true;};$('rename').onclick=()=>showProfile(true);
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')saveProfile();});
if(profile){$('profile-modal').hidden=true;$('my-profile').textContent=`${animal(profile.animal).emoji} ${profile.name}`;}else showProfile();

// 캔들 차트
function plotChart(canvas,candles,mini=false){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.fillStyle='#081421';c.fillRect(0,0,w,h);
 const data=(candles||[]).filter(d=>[d.open,d.high,d.low,d.close].every(Number.isFinite));
 if(!data.length){c.fillStyle='#8ba4ba';c.font='16px sans-serif';c.fillText('캔들 데이터 연결 대기',20,h/2);return;}
 const lo=Math.min(...data.map(d=>d.low)),hi=Math.max(...data.map(d=>d.high)),pad=(hi-lo)*.08||1,min=lo-pad,max=hi+pad;
 const L=mini?12:28,R=mini?12:90,T=mini?12:24,B=mini?12:30,W=w-L-R,H=h-T-B,step=W/data.length;
 const y=v=>T+(max-v)/(max-min)*H;
 c.strokeStyle='#1d3548';for(let i=0;i<=4;i++){const yy=T+H*i/4;c.beginPath();c.moveTo(L,yy);c.lineTo(w-R,yy);c.stroke();if(!mini){c.fillStyle='#809ab0';c.font='13px sans-serif';c.fillText((max-(max-min)*i/4).toFixed(2),w-R+7,yy+4);}}
 data.forEach((d,i)=>{const x=L+step*(i+.5),color=d.close>=d.open?'#42dfbd':'#f17a98';c.strokeStyle=color;c.fillStyle=color;c.beginPath();c.moveTo(x,y(d.high));c.lineTo(x,y(d.low));c.stroke();const top=y(Math.max(d.open,d.close)),bottom=y(Math.min(d.open,d.close)),bw=Math.max(1.5,Math.min(step*.65,mini?8:16));c.fillRect(x-bw/2,top,bw,Math.max(1.5,bottom-top));});
}
function renderAssets(){const parent=$('assets');parent.replaceChildren();for(const s of symbols){const card=document.createElement('div');card.className='crypto-asset';
 const head=document.createElement('div');head.className='crypto-head';const left=document.createElement('div'),title=document.createElement('strong'),ticker=document.createElement('small');title.textContent=s.name;ticker.textContent=s.id+' / USD';left.append(title,ticker);
 const right=document.createElement('div');right.className='price';right.textContent=money(s.price);const note=document.createElement('span');note.className='change';note.textContent='USD · Coinbase';right.append(note);head.append(left,right);
 const canvas=document.createElement('canvas');canvas.className='spark-chart';canvas.width=580;canvas.height=155;plotChart(canvas,s.candles,true);card.append(head,canvas);card.onclick=()=>openDetail(s);parent.append(card);}}
async function loadCandles(id,range='1d'){const [granularity,limit]=ranges[range],r=await fetch(`/api/candles/${id}?granularity=${granularity}&limit=${limit}`,{cache:'no-store'});if(!r.ok)throw Error('Candles');const d=await r.json();return d.candles||[];}
async function updatePrices(){await Promise.all(symbols.map(async s=>{try{const r=await fetch(`/api/price/${s.id}`,{cache:'no-store'});if(!r.ok)throw Error('Price');const v=Number((await r.json()).price);s.price=Number.isFinite(v)?v:null;}catch{s.price=null;}}));renderAssets();refreshBoard();if(activeSymbol)$('detail-price').textContent=money(activeSymbol.price);}
async function updateCandles(){await Promise.all(symbols.map(async s=>{try{s.candles=await loadCandles(s.id);}catch(e){console.warn(s.id,e.message);}}));renderAssets();refreshBoard();if(activeSymbol&&activeRange==='1d')updateDetailChart();}
function openDetail(s){activeSymbol=s;activeRange='1d';$('detail-name').textContent=`${s.name} (${s.id})`;$('detail-price').textContent=money(s.price);$('detail').hidden=false;document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('selected',b.dataset.range==='1d'));updateDetailChart();}
async function updateDetailChart(){const s=activeSymbol,r=activeRange;if(!s)return;$('chart-status').textContent='캔들 차트를 불러오는 중...';try{const data=r==='1d'&&s.candles.length?s.candles:await loadCandles(s.id,r);if(s!==activeSymbol||r!==activeRange)return;plotChart($('detail-chart'),data);$('chart-status').textContent='Coinbase OHLC 캔들 차트';}catch{plotChart($('detail-chart'),[]);$('chart-status').textContent='차트 연결에 실패했습니다.';}}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{activeRange=b.dataset.range;document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('selected',x===b));updateDetailChart();});
$('close').onclick=()=>{$('detail').hidden=true;activeSymbol=null;};$('detail').onclick=e=>{if(e.target===$('detail'))$('close').click();};

// 3D 공간
const sceneEl=$('scene'),scene=new THREE.Scene();scene.background=new THREE.Color('#080f1b');scene.fog=new THREE.Fog('#080f1b',25,80);
const camera=new THREE.PerspectiveCamera(64,1,.1,120),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));sceneEl.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0x9bc9e0,0x0b1524,2.2));
function box(w,h,d,color,x,y,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.55}));mesh.position.set(x,y,z);scene.add(mesh);return mesh;}
box(42,.4,42,0x101c2b,0,-.25,0);const grid=new THREE.GridHelper(42,42,0x24435a,0x182a3e);grid.position.y=.01;scene.add(grid);
box(38,8,.5,0x15293a,0,4,-19);box(.5,8,38,0x14283a,-20,4,0);box(.5,8,38,0x14283a,20,4,0);
for(const x of [-18,18])for(const z of [-18,18])box(.6,8,.6,0x304b5c,x,4,z);
for(const x of [-12,12]){box(7,.55,2.5,0x29495e,x,.35,4);box(7,1.15,.6,0x365c72,x,1.05,5.1);box(1.2,.75,2.4,0x365c72,x-3,.65,4);box(1.2,.75,2.4,0x365c72,x+3,.65,4);box(3.5,.2,1.5,0xd5b68a,x,.75,1.7);}
for(const x of [-17,17])for(const z of [-10,10]){box(1.2,.9,1.2,0x24413e,x,.45,z);const plant=new THREE.Mesh(new THREE.ConeGeometry(.7,2.5,8),new THREE.MeshStandardMaterial({color:0x238878}));plant.position.set(x,2,z);scene.add(plant);}
for(const x of [-12,0,12]){const light=new THREE.PointLight(0xffd49b,25,17);light.position.set(x,6,3);scene.add(light);}
const neon=new THREE.PointLight(0x4de0bc,75,30);neon.position.set(0,7,-10);scene.add(neon);
const boardCanvas=document.createElement('canvas');boardCanvas.width=1280;boardCanvas.height=620;const boardCtx=boardCanvas.getContext('2d');const boardTexture=new THREE.CanvasTexture(boardCanvas);boardTexture.colorSpace=THREE.SRGBColorSpace;
const board=new THREE.Mesh(new THREE.PlaneGeometry(17,8.2),new THREE.MeshBasicMaterial({map:boardTexture,side:THREE.DoubleSide}));board.position.set(0,4.5,-18.65);scene.add(board);
function refreshBoard(){const c=boardCtx;c.fillStyle='#071421';c.fillRect(0,0,1280,620);c.fillStyle='#dfc79a';c.font='bold 34px Arial';c.fillText('JMC INVEST LOUNGE',40,55);c.fillStyle='#88a5b8';c.font='20px Arial';c.fillText('BTC · ETH · SOL · XRP',870,55);
 symbols.forEach((s,i)=>{const x=36+(i%2)*608,y=90+Math.floor(i/2)*255;c.fillStyle='#10263a';c.fillRect(x,y,588,240);c.strokeStyle='#315065';c.strokeRect(x,y,588,240);c.fillStyle='#f0e1c2';c.font='bold 23px Arial';c.fillText(s.id+' / USD',x+18,y+34);c.fillStyle='#42dfbd';c.font='bold 29px Arial';c.fillText(money(s.price),x+180,y+35);
 const data=s.candles.filter(d=>[d.open,d.high,d.low,d.close].every(Number.isFinite));if(!data.length){c.fillStyle='#809ab0';c.font='18px Arial';c.fillText('캔들 데이터 연결 대기',x+20,y+155);return;}
 const lo=Math.min(...data.map(d=>d.low)),hi=Math.max(...data.map(d=>d.high)),span=hi-lo||1,step=550/data.length;
 data.forEach((d,j)=>{const xx=x+18+step*(j+.5),yy=v=>y+220-(v-lo)/span*156,color=d.close>=d.open?'#42dfbd':'#f17a98';c.strokeStyle=color;c.fillStyle=color;c.beginPath();c.moveTo(xx,yy(d.high));c.lineTo(xx,yy(d.low));c.stroke();const top=yy(Math.max(d.open,d.close)),bottom=yy(Math.min(d.open,d.close)),bw=Math.max(2,step*.6);c.fillRect(xx-bw/2,top,bw,Math.max(2,bottom-top));});});boardTexture.needsUpdate=true;}
refreshBoard();
const others=new Map();
function resetToBoard(){yaw=Math.PI;if(myAvatar){myAvatar.position.set(0,0,-8);myAvatar.rotation.y=Math.PI;myAvatar.userData.targetDirection=Math.PI;}camera.position.set(0,4.2,-2);camera.lookAt(0,4.5,-18.65);}
function updateMyAvatar(){if(!profile)return;const pos=myAvatar?myAvatar.position.clone():new THREE.Vector3(0,0,-8),dir=myAvatar?myAvatar.rotation.y:Math.PI,wasSeated=myAvatar?.userData.seated||false;if(myAvatar){if(myId)removeBubble(myId);scene.remove(myAvatar);}myAvatar=makeAnimal(profile.animal);myAvatar.position.copy(pos);myAvatar.rotation.y=dir;myAvatar.userData.targetDirection=dir;myAvatar.userData.seated=wasSeated;scene.add(myAvatar);}
function updateOthers(players){const seen=new Set();for(const p of players){if(p.id===myId)continue;seen.add(p.id);let avatar=others.get(p.id);if(!avatar||avatar.userData.animal!==p.animal){if(avatar)scene.remove(avatar);avatar=makeAnimal(p.animal);scene.add(avatar);others.set(p.id,avatar);}avatar.position.set(Number(p.x)||0,Number(p.y)||0,Number(p.z)||0);avatar.userData.seated=p.seated===true;if(Number.isFinite(Number(p.direction)))avatar.userData.targetDirection=Number(p.direction);}
 for(const [id,a] of others)if(!seen.has(id)){removeBubble(id);scene.remove(a);others.delete(id);}}
if(profile){updateMyAvatar();resetToBoard();}

// 3D 말풍선: 채팅을 보낸 캐릭터 머리 위에 6초 동안 표시
const activeBubbles = new Map();
const BUBBLE_LIFETIME = 6000;
function wrapBubbleText(ctx, text, maxWidth, maxLines=3) {
 const chars=Array.from(String(text).replace(/\\s+/g,' ').trim());
 const lines=[]; let line='';
 for (const ch of chars) {
  if (ctx.measureText(line+ch).width>maxWidth && line) {
   lines.push(line); line=ch;
   if (lines.length===maxLines-1) break;
  } else line+=ch;
 }
 const consumed=Array.from(lines.join('')).length;
 if (lines.length===maxLines-1) {
  let rest=chars.slice(consumed).join('');
  while(rest && ctx.measureText(rest).width>maxWidth) rest=rest.slice(0,-1);
  if(rest.length<chars.length-consumed) rest=rest.slice(0,-1)+'…';
  lines.push(rest);
 } else if(line) lines.push(line);
 return lines;
}
function removeBubble(senderId) {
 const existing=activeBubbles.get(senderId);
 if(!existing)return;
 existing.sprite.parent?.remove(existing.sprite);
 existing.sprite.material.map?.dispose();
 existing.sprite.material.dispose();
 activeBubbles.delete(senderId);
}
function showBubble(item) {
 const senderId=item?.senderId;
 if(!senderId || !item.message)return;
 const avatar=senderId===myId?myAvatar:others.get(senderId);
 if(!avatar)return;
 removeBubble(senderId);
 const canvas=document.createElement('canvas');
 canvas.width=768; canvas.height=320;
 const ctx=canvas.getContext('2d');
 ctx.font='bold 40px sans-serif';
 const lines=wrapBubbleText(ctx,item.message,620,3);
 const lineHeight=52,boxH=Math.max(118,lines.length*lineHeight+48);
 const top=16,bottom=top+boxH;
 ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=18;
 ctx.fillStyle='rgba(255,255,255,.97)';
 ctx.beginPath();ctx.roundRect(20,top,728,boxH,28);ctx.fill();
 ctx.shadowBlur=0;
 ctx.beginPath();ctx.moveTo(352,bottom);ctx.lineTo(384,bottom+30);ctx.lineTo(416,bottom);ctx.closePath();ctx.fill();
 ctx.fillStyle='#172b3b';ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>ctx.fillText(line,384,top+boxH/2+(i-(lines.length-1)/2)*lineHeight,650));
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
 const sprite=new THREE.Sprite(material);
 sprite.position.set(0,3.65,0);
 sprite.scale.set(3.8,1.58,1);
 sprite.renderOrder=100;
 avatar.add(sprite);
 activeBubbles.set(senderId,{sprite,expires:performance.now()+BUBBLE_LIFETIME,messageId:item.id});
}
function tickBubbles(now) {
 for(const [id,bubble] of activeBubbles) {
  if(now>=bubble.expires)removeBubble(id);
  else if(now>bubble.expires-900)bubble.sprite.material.opacity=Math.max(0,(bubble.expires-now)/900);
 }
}
function deleteBubbleByMessage(messageId) {
 for(const [id,bubble] of activeBubbles) {
  if(bubble.messageId===messageId)removeBubble(id);
 }
}

// PC 및 모바일 방향키
const keys=new Set(),touchCounts=new Map();let dragging=false,lastPointerX=0,jumpVelocity=0,onGround=true;const GRAVITY=19,JUMP_SPEED=8;
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastPointerX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(dragging){yaw+=(e.clientX-lastPointerX)*.005;lastPointerX=e.clientX;}});
for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,()=>dragging=false);
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||!$('profile-modal').hidden)return;
 const k=e.key.toLowerCase();
 if(k===' '||e.code==='Space'||e.key.startsWith('Arrow'))e.preventDefault();
 if(e.repeat&&(k==='c'||e.code==='Space'))return;
 if(k==='c'&&myAvatar){
  if(!onGround)return;
  myAvatar.userData.seated=!myAvatar.userData.seated;
  myAvatar.userData.bodyGroup.position.y=0;
  sendMove(true);
 }else if((k===' '||e.code==='Space')&&myAvatar&&!myAvatar.userData.seated&&onGround){
  jumpVelocity=JUMP_SPEED;onGround=false;
  sendMove(true);
 }
 keys.add(k);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
const controls=$('mobile-controls');controls.querySelectorAll('.move-btn').forEach(b=>{
 const key=b.dataset.key;
 b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();b.setPointerCapture(e.pointerId);touchCounts.set(key,(touchCounts.get(key)||0)+1);b.classList.add('pressed');});
 const release=e=>{e.preventDefault();e.stopPropagation();touchCounts.set(key,Math.max(0,(touchCounts.get(key)||0)-1));b.classList.remove('pressed');};
 b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);
});
window.addEventListener('blur',()=>{keys.clear();touchCounts.clear();dragging=false;controls.querySelectorAll('.move-btn').forEach(b=>b.classList.remove('pressed'));});
const held=k=>keys.has(k)||(touchCounts.get(k)||0)>0;
let lastFrame=performance.now(),lastSent=0,walkTime=0;
function sendMove(force=false){
 if(!myAvatar)return;
 const now=performance.now();if(!force&&now-lastSent<120)return;
 send({type:'move',x:myAvatar.position.x,y:myAvatar.position.y,z:myAvatar.position.z,direction:myAvatar.userData.targetDirection,seated:myAvatar.userData.seated});
 lastSent=now;
}
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
 if(!$('profile-modal').hidden&&previewModel){previewModel.rotation.y=previewAngle;previewModel.userData.bodyGroup.position.y=Math.sin(now*.002)*.025;}
 if(!$('profile-modal').hidden){resizePreview();previewRenderer.render(previewScene,previewCamera);}
 if(myAvatar&&$('profile-modal').hidden){const f=Number(held('w')||held('arrowup'))-Number(held('s')||held('arrowdown')),s=Number(held('d')||held('arrowright'))-Number(held('a')||held('arrowleft'));
  if((f||s)&&!myAvatar.userData.seated){const len=Math.hypot(f,s),forward=f/len,side=s/len;
   // 좌우 방향 올바르게: ◀ 왼쪽 / ▶ 오른쪽
   const dx=Math.sin(yaw)*forward-Math.cos(yaw)*side;
   const dz=Math.cos(yaw)*forward+Math.sin(yaw)*side;
   myAvatar.position.x=Math.max(-18,Math.min(18,myAvatar.position.x+dx*5*dt));
   myAvatar.position.z=Math.max(-18,Math.min(18,myAvatar.position.z+dz*5*dt));
   myAvatar.userData.targetDirection=Math.atan2(dx,dz);
   walkTime+=dt*12;myAvatar.userData.bodyGroup.position.y=Math.abs(Math.sin(walkTime))*.085;
   sendMove();
  }else{myAvatar.userData.bodyGroup.position.y*=.8;}
  if(!onGround){
   jumpVelocity-=GRAVITY*dt;
   myAvatar.position.y+=jumpVelocity*dt;
   if(myAvatar.position.y<=0){myAvatar.position.y=0;jumpVelocity=0;onGround=true;}
   sendMove();
  }
  const body=myAvatar.userData.bodyGroup;
  body.scale.y=THREE.MathUtils.damp(body.scale.y,myAvatar.userData.seated?.64:1,12,dt);
  body.position.y=THREE.MathUtils.damp(body.position.y,myAvatar.userData.seated?-.13:body.position.y,12,dt);
 }
 for(const other of others.values()){
  const body=other.userData.bodyGroup;
  body.scale.y=THREE.MathUtils.damp(body.scale.y,other.userData.seated?.64:1,12,dt);
 }
 if(myAvatar)myAvatar.rotation.y=turn(myAvatar.rotation.y,myAvatar.userData.targetDirection,dt*8);
 for(const a of others.values())a.rotation.y=turn(a.rotation.y,a.userData.targetDirection,dt*8);
 const t=myAvatar?.position||new THREE.Vector3(0,0,-8);
 camera.position.lerp(new THREE.Vector3(t.x-Math.sin(yaw)*6,4.2,t.z-Math.cos(yaw)*6),.09);
 camera.lookAt(t.x+Math.sin(yaw)*8,3.5,t.z+Math.cos(yaw)*8);
 tickBubbles(now);
 renderer.render(scene,camera);
}
function resizeScene(){const w=sceneEl.clientWidth,h=sceneEl.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resizeScene).observe(sceneEl);resizeScene();requestAnimationFrame(animate);

// 멀티플레이, 채팅, 투표
function send(m){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));}
function sendProfile(){if(!profile)return;send({type:'join',name:profile.name,animal:profile.animal});if(myAvatar)send({type:'move',x:myAvatar.position.x,z:myAvatar.position.z,direction:myAvatar.userData.targetDirection,y:myAvatar.position.y,seated:myAvatar.userData.seated});}
function addMessage(item){const line=document.createElement('div');line.className='msg';if(item.id)line.dataset.messageId=item.id;const b=document.createElement('b');b.textContent=`${animal(item.animal).emoji} ${item.name}: `;line.append(b,document.createTextNode(item.message||''));$('messages').append(line);$('messages').scrollTop=$('messages').scrollHeight;}
function updateVotes(v){if(!v)return;const total=v.long+v.short,pct=total?Math.round(v.long/total*100):50;$('longbar').style.width=pct+'%';$('longpct').textContent=`${pct}% LONG (${v.long})`;$('shortpct').textContent=`${100-pct}% SHORT (${v.short})`;}
let moderationStopped=false;function connect(){if(moderationStopped)return;const protocol=location.protocol==='https:'?'wss':'ws';socket=new WebSocket(`${protocol}://${location.host}/ws`);
 socket.onopen=()=>{$('connection').textContent='● 연결됨';sendProfile();};
 socket.onclose=e=>{if([4001,4002,4003].includes(e.code)){moderationStopped=true;$('connection').textContent='접속 종료';return;}$('connection').textContent='연결 재시도 중';setTimeout(connect,2000);};
 socket.onerror=()=>{$('connection').textContent='연결 오류';};
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){renderNotices(m.notices||[]);myId=m.id;updateVotes(m.votes);$('messages').replaceChildren();for(const item of m.history||[])addMessage(item);sendProfile();}
  if(m.type==='presence'){$('online').textContent=m.count;updateOthers(m.players||[]);}
  if(m.type==='chat'){addMessage(m.item);showBubble(m.item);}
  if(m.type==='votes')updateVotes(m.votes);
  if(m.type==='chat_deleted'){document.querySelectorAll('#messages .msg').forEach(el=>{if(el.dataset.messageId===m.id)el.remove();});deleteBubbleByMessage(m.id);}
  if(m.type==='chat_reset'){$('messages').replaceChildren();for(const id of [...activeBubbles.keys()])removeBubble(id);}
  if(m.type==='notices')renderNotices(m.notices||[]);
  if(m.type==='moderation'){moderationStopped=true;alert(m.message||'관리자에 의해 접속이 종료되었습니다.');socket.close();}
 };
}
$('long').onclick=()=>{if(!profile)return showProfile();send({type:'vote',side:'long'});};
$('short').onclick=()=>{if(!profile)return showProfile();send({type:'vote',side:'short'});};
$('chat-form').onsubmit=e=>{e.preventDefault();if(!profile)return showProfile();const input=$('chat-input'),message=input.value.trim();if(message){send({type:'chat',message});input.value='';}};
renderAssets();updatePrices();updateCandles();setInterval(updatePrices,15000);setInterval(updateCandles,60000);connect();

function renderNotices(items){const el=$('notices');if(!el)return;el.replaceChildren();for(const item of items){const line=document.createElement('div');line.textContent='📢 '+item.text;el.append(line);}el.hidden=items.length===0;}
