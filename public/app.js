import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
const $=id=>document.getElementById(id);
const symbols=[{id:'BTC',name:'비트코인',ticker:'BTC / USD',source:'coinbase',price:null},{id:'ETH',name:'이더리움',ticker:'ETH / USD',source:'coinbase',price:null},{id:'005930',name:'삼성전자',ticker:'KRX 005930',currency:'KRW',price:null},{id:'000660',name:'SK하이닉스',ticker:'KRX 000660',currency:'KRW',price:null},{id:'KOSPI',name:'코스피',ticker:'KOSPI INDEX',currency:'points',price:null},{id:'NDX',name:'나스닥100',ticker:'NASDAQ 100',currency:'points',price:null}];
const format=n=>n==null?'연동 대기':Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
function renderAssets(){ $('assets').replaceChildren(...symbols.map(s=>{const el=document.createElement('div');el.className='asset';const left=document.createElement('div');const name=document.createElement('strong');name.textContent=s.name;const ticker=document.createElement('small');ticker.textContent=s.ticker;left.append(name,ticker);const right=document.createElement('div');right.className='price';right.textContent=s.price==null?'—':format(s.price);const note=document.createElement('span');note.className='change';note.textContent=s.price==null?'시세 제공처 미연결':`${s.currency||'USD'} · ${s.sourceName||'Coinbase 현물'}`;right.append(note);el.append(left,right);el.onclick=()=>showDetail(s);return el}))}
function showDetail(s){$('detail-name').textContent=s.name;$('detail-price').textContent=s.price==null?'시세 연동 대기':`${format(s.price)} ${s.currency||'USD'}`;$('detail-note').textContent=s.price==null?'데모 버전입니다. 실제 시세 데이터 제공처 연결이 필요합니다.':`${s.sourceName||'Coinbase 현물'} 제공 가격입니다. 마지막 수신: ${s.lastUpdated||'확인 중'}`;$('detail').hidden=false}$('close').onclick=()=>$('detail').hidden=true;$('detail').onclick=e=>{if(e.target===$('detail'))$('detail').hidden=true};renderAssets();
async function updatePrices(){for(const s of symbols.filter(x=>x.source==='coinbase')){try{const response=await fetch(`https://api.coinbase.com/v2/prices/${s.id}-USD/spot`,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();s.price=Number(data.data.amount)}catch{s.price=null}}renderAssets();refreshBoard()}updatePrices();setInterval(updatePrices,15000);
const sceneEl=$('scene');const scene=new THREE.Scene();scene.background=new THREE.Color('#080f1b');scene.fog=new THREE.Fog('#080f1b',20,75);const camera=new THREE.PerspectiveCamera(64,1,.1,120);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));sceneEl.appendChild(renderer.domElement);scene.add(new THREE.HemisphereLight(0x8ebbd7,0x0b1524,2));const lamp=new THREE.PointLight(0x5ee9c8,85,30);lamp.position.set(0,8,-9);scene.add(lamp);
function box(w,h,d,color,x,y,z,emissive=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness:.55,roughness:.4,emissive,emissiveIntensity:.22}));mesh.position.set(x,y,z);scene.add(mesh);return mesh}
box(42,.4,42,0x101c2b,0,-.25,0);const grid=new THREE.GridHelper(42,42,0x24435a,0x182a3e);grid.position.y=.01;scene.add(grid);for(let x of [-20,20])for(let z of [-20,20]){box(.5,8,.5,0x213a51,x,4,z);const glow=new THREE.PointLight(0x1b9d8c,12,8);glow.position.set(x,6,z);scene.add(glow)}
box(20,8,.5,0x14283a,0,4,-16);box(22,.5,2,0x223c52,0,8,-15);box(11,.25,1.2,0x27515d,0,1.2,-9);for(const x of [-9,-5,5,9]){box(2,.15,2,0x213b4e,x,1,4);box(.15,1,.15,0x4de0bc,x,.5,4)}
function screenCanvas(){const c=document.createElement('canvas');c.width=1280;c.height=620;return c}const boardCanvas=screenCanvas();const ctx=boardCanvas.getContext('2d');const tex=new THREE.CanvasTexture(boardCanvas);tex.colorSpace=THREE.SRGBColorSpace;const board=new THREE.Mesh(new THREE.PlaneGeometry(17,8.2),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));board.position.set(0,4.5,-15.65);scene.add(board);
function refreshBoard(){ctx.fillStyle='#07131f';ctx.fillRect(0,0,1280,620);ctx.fillStyle='#4de0bc';ctx.font='bold 30px Arial';ctx.fillText('◈ MARKETVERSE  /  LIVE MARKET',50,60);ctx.fillStyle='#5d8299';ctx.fillRect(50,86,1180,2);symbols.forEach((s,i)=>{const x=55+(i%3)*405,y=155+Math.floor(i/3)*225;ctx.fillStyle='#122638';ctx.fillRect(x,y,375,190);ctx.fillStyle='#98b2c9';ctx.font='bold 24px Arial';ctx.fillText(s.name,x+25,y+48);ctx.fillStyle=s.price==null?'#71889c':'#4de0bc';ctx.font='bold 36px Arial';ctx.fillText(s.price==null?'DATA PENDING':format(s.price),x+25,y+110);ctx.font='18px Arial';ctx.fillText(s.price==null?'PROVIDER NOT CONNECTED':`${s.currency||'USD'} · ${(s.sourceName||'COINBASE SPOT').slice(0,23)}`,x+25,y+153)});tex.needsUpdate=true}refreshBoard();
// A walk-up, clickable 3D Gomoku arena at the center of the trading floor.
const arenaRoot=new THREE.Group();scene.add(arenaRoot);arenaRoot.position.set(0,0,-2);
const podium=new THREE.Mesh(new THREE.CylinderGeometry(7.1,7.4,.55,64),new THREE.MeshStandardMaterial({color:0x263b5b,metalness:.5,roughness:.38}));podium.position.y=.12;arenaRoot.add(podium);
const ring=new THREE.Mesh(new THREE.TorusGeometry(6.65,.09,8,80),new THREE.MeshBasicMaterial({color:0x56e3d3}));ring.rotation.x=-Math.PI/2;ring.position.y=.43;arenaRoot.add(ring);
for(let i=0;i<14;i++){const a=i*Math.PI*2/14;const seat=new THREE.Mesh(new THREE.BoxGeometry(1.3,.4,.85),new THREE.MeshStandardMaterial({color:0x30445c}));seat.position.set(Math.cos(a)*8,.25,Math.sin(a)*8-2);seat.rotation.y=-a;scene.add(seat)}
const gomokuCanvas=document.createElement('canvas');gomokuCanvas.width=1024;gomokuCanvas.height=1024;const gc=gomokuCanvas.getContext('2d');const gomokuTexture=new THREE.CanvasTexture(gomokuCanvas);gomokuTexture.colorSpace=THREE.SRGBColorSpace;
const gomokuMesh=new THREE.Mesh(new THREE.PlaneGeometry(8.2,8.2),new THREE.MeshBasicMaterial({map:gomokuTexture,side:THREE.DoubleSide}));gomokuMesh.rotation.x=-Math.PI/2;gomokuMesh.position.y=.55;arenaRoot.add(gomokuMesh);
const arenaSign=document.createElement('canvas');arenaSign.width=1024;arenaSign.height=128;const ac=arenaSign.getContext('2d');ac.fillStyle='#102c42';ac.fillRect(0,0,1024,128);ac.font='bold 62px Arial';ac.textAlign='center';ac.fillStyle='#62f1d7';ac.fillText('MARKETVERSE  ·  1 VS 1 ARENA',512,85);const signTexture=new THREE.CanvasTexture(arenaSign);const sign=new THREE.Mesh(new THREE.PlaneGeometry(10,1.25),new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide}));sign.position.set(0,4,-7);arenaRoot.add(sign);
let arenaState={games:[],prize:{}},arenaSelected=null,arenaMyId=null;
function paintGomoku(){gc.fillStyle='#caa875';gc.fillRect(0,0,1024,1024);gc.fillStyle='#9d7849';gc.fillRect(65,65,894,894);gc.fillStyle='#d6b784';gc.fillRect(75,75,874,874);gc.strokeStyle='#6a4a2e';gc.lineWidth=2;for(let i=0;i<15;i++){const n=105+i*58;gc.beginPath();gc.moveTo(105,n);gc.lineTo(917,n);gc.moveTo(n,105);gc.lineTo(n,917);gc.stroke()}for(let y of [3,7,11])for(let x of [3,7,11]){gc.beginPath();gc.arc(105+x*58,105+y*58,5,0,Math.PI*2);gc.fillStyle='#68452a';gc.fill()}
const game=arenaState.games?.find(g=>g.id===arenaSelected)||arenaState.games?.find(g=>g.status==='playing')||arenaState.games?.[0];if(game){game.board.forEach((row,y)=>row.forEach((v,x)=>{if(!v)return;const px=105+x*58,py=105+y*58;gc.beginPath();gc.arc(px,py,25,0,Math.PI*2);const grad=gc.createRadialGradient(px-9,py-10,2,px,py,28);if(v===1){grad.addColorStop(0,'#666');grad.addColorStop(1,'#080808')}else{grad.addColorStop(0,'#fff');grad.addColorStop(1,'#a7a7a7')}gc.fillStyle=grad;gc.fill()}));gc.fillStyle='#30231a';gc.font='bold 28px Arial';gc.textAlign='center';gc.fillText(game.names.join('  VS  '),512,45)}else{gc.fillStyle='#46311f';gc.font='bold 38px Arial';gc.textAlign='center';gc.fillText('대결 신청을 하면 이곳에서 경기가 시작됩니다',512,53)}gomokuTexture.needsUpdate=true}
paintGomoku();window.addEventListener('mv:arena-update',e=>{arenaState=e.detail.state;arenaSelected=e.detail.selected;arenaMyId=e.detail.myId;paintGomoku()});
const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();renderer.domElement.addEventListener('click',e=>{const bounds=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(gomokuMesh)[0];if(!hit)return;const game=arenaState.games?.find(g=>g.id===arenaSelected)||arenaState.games?.find(g=>g.status==='playing');if(!game){document.querySelector('.arena-panel')?.scrollIntoView({behavior:'smooth',block:'center'});return}if(arenaSelected!==game.id)window.mvArenaSelect?.(game.id);const u=hit.uv?.x,v=hit.uv?.y;if(u==null||v==null)return;const x=Math.round((u*1024-105)/58),y=Math.round(((1-v)*1024-105)/58);if(x<0||x>14||y<0||y>14)return;if(game.status==='playing'&&game.players[game.turn-1]===arenaMyId)window.mvSend?.({type:'arena-move',id:game.id,x,y})});
// Twenty lightweight, procedural 3D animal avatars (no external model downloads).
const ANIMALS=[
 ['seal','아기물개','🦭',0xf1f5f5,'flippers'],['lion','사자','🦁',0xdca65b,'mane'],
 ['hamster','햄스터','🐹',0xe8b977,'cheeks'],['hedgehog','고슴도치','🦔',0xa17b59,'spines'],
 ['wolf','늑대','🐺',0x8996a6,'ears'],['whale','고래','🐳',0x649fd3,'fins'],
 ['cheetah','치타','🐆',0xe8b85b,'spots'],['squid','오징어','🦑',0xe59bb7,'tentacles'],
 ['panda','판다','🐼',0xf1eee7,'panda'],['fox','여우','🦊',0xe88a4b,'ears'],
 ['bear','곰','🐻',0x9a6d50,'roundears'],['rabbit','토끼','🐰',0xe7dedf,'longears'],
 ['cat','고양이','🐱',0xc7a889,'ears'],['dog','강아지','🐶',0xcfa878,'floppyears'],
 ['penguin','펭귄','🐧',0x313d52,'wings'],['frog','개구리','🐸',0x76b66d,'frogeyes'],
 ['otter','수달','🦦',0x9b7051,'whiskers'],['koala','코알라','🐨',0xa4a8b2,'bigears'],
 ['tiger','호랑이','🐯',0xe49a4e,'stripes'],['octopus','문어','🐙',0xc981a8,'tentacles']
];
const animalIds=new Set(ANIMALS.map(a=>a[0]));
const themes={mint:0x4de0bc,pink:0xf0a0c6,blue:0x7eafff};
const chosenAvatar=()=>animalIds.has(localStorage.getItem('mv-avatar'))?localStorage.getItem('mv-avatar'):'seal';
const chosenTheme=()=>Object.hasOwn(themes,localStorage.getItem('mv-theme'))?localStorage.getItem('mv-theme'):'mint';
function makeAvatar(kind,theme='mint'){
  const def=ANIMALS.find(a=>a[0]===kind)||ANIMALS[0];kind=def[0];
  const group=new THREE.Group(),fur=def[3],accent=themes[theme]||themes.mint;
  const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.83});
  const main=mat(fur),dark=mat(0x25303a),cream=mat(0xf6e9dc),pink=mat(0xe8a4a9),white=mat(0xffffff),highlight=mat(accent);
  const add=(geo,m,x,y,z,sx=1,sy=1,sz=1)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);group.add(o);return o};
  const ball=(m,x,y,z,r=.2,sx=1,sy=1,sz=1)=>add(new THREE.SphereGeometry(r,12,10),m,x,y,z,sx,sy,sz);
  const cone=(m,x,y,z,r=.13,h=.35)=>add(new THREE.ConeGeometry(r,h,8),m,x,y,z);
  const cylinder=(m,x,y,z,r=.08,h=.5)=>add(new THREE.CylinderGeometry(r,r,h,8),m,x,y,z);
  // Faces point toward -Z, matching the original baby seal.
  ball(main,0,.67,.05,.48,1.05,.86,1.25);ball(main,0,1.18,-.23,.43,1.08,1,.98);
  if(['whale','seal','penguin','otter'].includes(kind)){
    ball(main,-.48,.42,-.04,.23,1.3,.32,.8);ball(main,.48,.42,-.04,.23,1.3,.32,.8);
  }else if(!['squid','octopus'].includes(kind)){
    for(const x of [-.29,.29]){ball(main,x,.24,.22,.17,.8,1,.9);ball(main,x,.24,-.2,.15,.8,1,.9)}
  }
  if(['lion','wolf','fox','cat','cheetah','tiger','bear','panda','koala','rabbit','dog','hamster','hedgehog'].includes(kind)){
    for(const x of [-.31,.31]){
      if(['wolf','fox','cat','cheetah','tiger'].includes(kind))cone(main,x,1.57,-.19,.17,.4);
      else if(kind==='rabbit')ball(main,x,1.77,-.2,.13,.7,2.7,.7);
      else if(kind==='dog')ball(main,x*1.25,1.38,-.12,.22,.65,1.45,.7);
      else ball(main,x,1.52,-.2,kind==='koala'?.23:.17);
    }
  }
  if(kind==='lion')for(let i=0;i<12;i++){const t=i*Math.PI/6;ball(mat(0x986134),Math.cos(t)*.43,1.18+Math.sin(t)*.43,-.12,.21)}
  if(kind==='hedgehog')for(let i=0;i<18;i++){const t=i*Math.PI*2/18;const spike=cone(dark,Math.cos(t)*.45,1.18+Math.sin(t)*.36,.07,.09,.36);spike.rotation.z=-Math.cos(t)*.75}
  if(kind==='panda'){for(const x of [-.19,.19])ball(dark,x,1.23,-.58,.16,1,.9,.28);ball(cream,0,.73,-.37,.31,1,1,.25)}
  if(kind==='penguin')ball(cream,0,.76,-.39,.32,1,1.25,.3);
  if(kind==='hamster')for(const x of [-.33,.33])ball(cream,x,1.04,-.49,.2);
  if(kind==='koala')ball(dark,0,1.08,-.65,.18,1,1.35,.8);
  if(kind==='frog')for(const x of [-.25,.25])ball(main,x,1.54,-.38,.19);
  if(kind==='whale'){ball(main,0,.68,.58,.24,1,.5,1.4);ball(main,0,1.23,.14,.15,.7,1.3,.5)}
  if(kind==='squid'||kind==='octopus'){
    for(let i=0;i<8;i++){const t=i*Math.PI/4;const tent=cylinder(main,Math.cos(t)*.34,.22,Math.sin(t)*.34,.075,.5);tent.rotation.z=Math.sin(t)*.4}
    if(kind==='squid')cone(main,0,1.65,-.05,.37,.65);
  }
  if(kind==='cheetah')for(let i=0;i<14;i++){const t=i*2.399;ball(dark,Math.sin(t)*.43,.64+Math.cos(t)*.28,-.38,.045)}
  if(kind==='tiger')for(let i=0;i<5;i++){const stripe=add(new THREE.BoxGeometry(.06,.17,.035),dark,-.32+i*.16,1.47-Math.abs(2-i)*.05,-.61);stripe.rotation.z=(i-2)*.2}
  if(kind==='otter')for(const x of [-.34,.34])for(let i=0;i<2;i++){const w=cylinder(cream,x,1.01-i*.09,-.59,.012,.25);w.rotation.z=x>0?-.8:.8}
  if(kind==='fox'||kind==='wolf')ball(cream,0,1.02,-.58,.21,1,.6,1.3);
  if(kind==='seal')for(const x of [-.2,.2])ball(pink,x*1.6,1.02,-.59,.085);
  for(const x of [-.19,.19])ball(kind==='panda'?white:dark,x,1.22,-.63,.064);
  ball(kind==='whale'?main:dark,0,1.06,-.67,.085,1,.8,.7);
  // Small colored collar distinguishes the three selectable color themes.
  const collar=add(new THREE.TorusGeometry(.35,.035,6,20),highlight,0,.91,-.23);collar.rotation.x=Math.PI/2;
  group.userData.kind=kind;group.userData.theme=theme;
  return group;
}
let me=makeAvatar(chosenAvatar(),chosenTheme());scene.add(me);me.position.set(0,0,9);const others=new Map();
function replaceSelfAvatar(kind,theme){const pos=me.position.clone();scene.remove(me);me=makeAvatar(kind,theme);me.position.copy(pos);scene.add(me)}
// Screen-space speech bubbles are anchored to each avatar's 3D world position.
const speechLayer=document.createElement('div');speechLayer.className='speech-layer';sceneEl.appendChild(speechLayer);
const bubbles=new Map();const bubblePoint=new THREE.Vector3();
function showSpeech(item){
  if(!item?.id || typeof item.message!=='string')return;
  const existing=bubbles.get(item.id);
  if(existing){existing.el.remove();clearTimeout(existing.timer)}
  const el=document.createElement('div');el.className='speech-bubble';
  const who=document.createElement('strong');who.textContent=String(item.name||'방문자').slice(0,16);
  const msg=document.createElement('span');msg.textContent=item.message.slice(0,180);
  el.append(who,msg);speechLayer.appendChild(el);
  const timer=setTimeout(()=>{el.remove();bubbles.delete(item.id)},5000);
  bubbles.set(item.id,{el,timer});
}
function positionSpeech(){
  const width=sceneEl.clientWidth,height=sceneEl.clientHeight;
  for(const [playerId,bubble] of bubbles){
    const avatar=playerId===id?me:others.get(playerId);
    if(!avatar){bubble.el.style.display='none';continue}
    bubblePoint.set(avatar.position.x,playerId===id?2.18:2.1,avatar.position.z).project(camera);
    const visible=bubblePoint.z>-1&&bubblePoint.z<1&&Math.abs(bubblePoint.x)<1.1&&Math.abs(bubblePoint.y)<1.1;
    bubble.el.style.display=visible?'flex':'none';
    if(visible){bubble.el.style.left=((bubblePoint.x+1)*.5*width)+'px';bubble.el.style.top=((-bubblePoint.y+1)*.5*height)+'px'}
  }
}
function updatePlayers(players,myId){const seen=new Set();for(const p of players){if(p.id===myId)continue;seen.add(p.id);const kind=animalIds.has(p.avatar)?p.avatar:'seal';const theme=Object.hasOwn(themes,p.theme)?p.theme:'mint';const prev=others.get(p.id);if(!prev||prev.userData.kind!==kind||prev.userData.theme!==theme){if(prev)scene.remove(prev);const m=makeAvatar(kind,theme);scene.add(m);others.set(p.id,m)}others.get(p.id).position.set(p.x,0,p.z)}for(const [playerId,m] of others)if(!seen.has(playerId)){scene.remove(m);others.delete(playerId)}}
let arenaCameraMode=false;document.getElementById('arena-view-toggle')?.addEventListener('click',()=>{arenaCameraMode=!arenaCameraMode;document.getElementById('arena-view-toggle').textContent=arenaCameraMode?'캐릭터 시점으로 돌아가기':'오목판 크게 보기';});let yaw=0,dragging=false,lastX=0;renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX});window.addEventListener('pointerup',()=>dragging=false);window.addEventListener('pointermove',e=>{if(dragging){yaw+=(e.clientX-lastX)*.005;lastX=e.clientX}});const keys=new Set();window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;keys.add(e.key.toLowerCase());if(e.key.startsWith('Arrow'))e.preventDefault()});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));let last=performance.now(),lastMove=0;function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));const side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));if(forward||side){const speed=5*dt;me.position.x=Math.max(-18,Math.min(18,me.position.x+(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed));me.position.z=Math.max(-18,Math.min(18,me.position.z+(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*speed));if(now-lastMove>150){send({type:'move',x:me.position.x,z:me.position.z});lastMove=now}}const target=new THREE.Vector3(me.position.x+Math.sin(yaw)*7,5.2,me.position.z+Math.cos(yaw)*7);if(arenaCameraMode){camera.position.lerp(new THREE.Vector3(0,16,10),.12);camera.lookAt(0,0,-2)}else{camera.position.lerp(target,.065);camera.lookAt(me.position.x,1.5,me.position.z-4)}positionSpeech();renderer.render(scene,camera)}function resize(){const w=sceneEl.clientWidth,h=sceneEl.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(sceneEl);resize();requestAnimationFrame(animate);
let socket,id;function send(m){if(socket?.readyState===1)socket.send(JSON.stringify(m))}window.mvSend=send;function connect(){socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.onopen=()=>{$('connection').textContent='● 연결됨';send({type:'join',name:localStorage.getItem('mv-name')||'슈댕'});send({type:'avatar',avatar:chosenAvatar(),theme:chosenTheme()})};socket.onclose=()=>{$('connection').textContent='연결 재시도 중';setTimeout(connect,2000)};socket.onmessage=e=>{const m=JSON.parse(e.data);window.dispatchEvent(new CustomEvent('mv:socket',{detail:m}));if(m.type==='market-quote')applyLicensedQuote(m.quote);if(m.type==='welcome'){(m.quotes||[]).forEach(applyLicensedQuote);id=m.id;updateVotes(m.votes);$('messages').replaceChildren();m.history.forEach(addMessage)}if(m.type==='presence'){$('online').textContent=m.count;updatePlayers(m.players,id)}if(m.type==='chat'){addMessage(m.item);showSpeech(m.item)}if(m.type==='votes')updateVotes(m.votes)}}connect();function addMessage(item){const p=document.createElement('div');p.className='msg';const b=document.createElement('b');b.textContent=item.name+': ';p.append(b,document.createTextNode(item.message));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight}function updateVotes(v){const total=v.long+v.short;const pct=total?Math.round(v.long/total*100):50;$('longbar').style.width=pct+'%';$('longpct').textContent=`${pct}% LONG (${v.long})`;$('shortpct').textContent=`${100-pct}% SHORT (${v.short})`}$('long').onclick=()=>send({type:'vote',side:'long'});$('short').onclick=()=>send({type:'vote',side:'short'});$('chat-form').onsubmit=e=>{e.preventDefault();const input=$('chat-input');send({type:'chat',message:input.value});input.value=''};$('rename').onclick=()=>{const name=prompt('닉네임 (최대 16자)',localStorage.getItem('mv-name')||'');if(name?.trim()){localStorage.setItem('mv-name',name.trim().slice(0,16));send({type:'join',name:name.trim()})}};

function applyLicensedQuote(q){const s=symbols.find(x=>x.id===q.symbol);if(!s)return;const t=Date.parse(q.timestamp);if(!Number.isFinite(t)||Date.now()-t>120000)return;s.price=q.price;s.sourceName=q.source;s.lastUpdated=new Date(t).toLocaleTimeString('ko-KR');renderAssets();refreshBoard()}

// Avatar editor: selection, color and nickname persist in this browser.
const avatarModal=$('avatar-modal');
const avatarChoices=$('avatar-choices');
let pendingAvatar=chosenAvatar(),pendingTheme=chosenTheme();
function updateAvatarEditor(){
  avatarChoices.replaceChildren(...ANIMALS.map(([kind,name,emoji])=>{
    const button=document.createElement('button');button.type='button';button.className='avatar-option'+(kind===pendingAvatar?' selected':'');
    button.textContent=`${emoji} ${name}`;button.setAttribute('aria-pressed',String(kind===pendingAvatar));
    button.onclick=()=>{pendingAvatar=kind;updateAvatarEditor()};return button;
  }));
  document.querySelectorAll('[data-theme]').forEach(button=>{button.classList.toggle('selected',button.dataset.theme===pendingTheme);button.setAttribute('aria-pressed',String(button.dataset.theme===pendingTheme))});
}
$('avatar-customize').onclick=()=>{pendingAvatar=chosenAvatar();pendingTheme=chosenTheme();$('avatar-name').value=localStorage.getItem('mv-name')||'슈댕';updateAvatarEditor();avatarModal.hidden=false};
$('avatar-close').onclick=()=>avatarModal.hidden=true;
avatarModal.addEventListener('click',e=>{if(e.target===avatarModal)avatarModal.hidden=true});
document.querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{pendingTheme=button.dataset.theme;updateAvatarEditor()});
$('avatar-save').onclick=()=>{
  const name=$('avatar-name').value.trim().slice(0,16)||'슈댕';
  localStorage.setItem('mv-name',name);localStorage.setItem('mv-avatar',pendingAvatar);localStorage.setItem('mv-theme',pendingTheme);
  replaceSelfAvatar(pendingAvatar,pendingTheme);send({type:'join',name});send({type:'avatar',avatar:pendingAvatar,theme:pendingTheme});avatarModal.hidden=true;
};
