
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const $ = id => document.getElementById(id);

const START_POSITION = new THREE.Vector3(0, 0, -8);
const BOARD_Z = -18.65;
const START_YAW = Math.PI;

const animals = [
  { id:'seal', name:'아기물개', emoji:'🦭' },
  { id:'cat', name:'고양이', emoji:'🐱' },
  { id:'dog', name:'강아지', emoji:'🐶' },
  { id:'rabbit', name:'토끼', emoji:'🐰' },
  { id:'fox', name:'여우', emoji:'🦊' },
  { id:'panda', name:'판다', emoji:'🐼' },
  { id:'bear', name:'곰', emoji:'🐻' },
  { id:'penguin', name:'펭귄', emoji:'🐧' },
  { id:'frog', name:'개구리', emoji:'🐸' },
  { id:'hamster', name:'햄스터', emoji:'🐹' }
];

const symbols = [
  { id:'BTC', name:'비트코인', price:null, candles:[] },
  { id:'ETH', name:'이더리움', price:null, candles:[] },
  { id:'SOL', name:'솔라나', price:null, candles:[] },
  { id:'XRP', name:'리플', price:null, candles:[] }
];

const ranges = {
  '1h': { granularity:60, limit:60 },
  '1d': { granularity:900, limit:96 },
  '1w': { granularity:3600, limit:168 }
};

let profile = null;
let selectedAnimal = 'seal';
let activeSymbol = null;
let activeRange = '1d';
let socket = null;
let myId = null;
let yaw = START_YAW;

// ==============================
// 기본 유틸리티
// ==============================
function animalInfo(id) {
  return animals.find(a => a.id === id) || animals[0];
}

function formatPrice(symbol, value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return '연결 대기';
  }

  return '$' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

// ==============================
// 최초 입장 팝업
// ==============================
function loadProfile() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('jmc-profile')
    );

    if (!saved || !String(saved.name || '').trim()) {
      return null;
    }

    return {
      name:String(saved.name).trim().slice(0, 16),
      animal:animals.some(a => a.id === saved.animal)
        ? saved.animal : 'seal'
    };
  } catch {
    return null;
  }
}

function renderAnimalOptions() {
  const grid = $('animal-grid');
  grid.replaceChildren();

  for (const animal of animals) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'animal-option' +
      (selectedAnimal === animal.id ? ' selected' : '');

    const emoji = document.createElement('span');
    emoji.className = 'animal-emoji';
    emoji.textContent = animal.emoji;

    const name = document.createElement('span');
    name.className = 'animal-name';
    name.textContent = animal.name;

    button.append(emoji, name);

    button.onclick = () => {
      selectedAnimal = animal.id;
      renderAnimalOptions();
    };

    grid.append(button);
  }
}

function showProfileModal(editing = false) {
  selectedAnimal = profile?.animal || 'seal';

  $('nickname').value = profile?.name || '';
  $('profile-error').textContent = '';
  $('cancel-profile').hidden = !editing;

  $('enter-lounge').textContent = editing
    ? '설정 저장하기'
    : 'JMC 라운지 입장하기';

  renderAnimalOptions();
  $('profile-modal').hidden = false;
  $('nickname').focus();
}

function saveProfile() {
  const name = $('nickname').value.trim().slice(0, 16);

  if (!name) {
    $('profile-error').textContent =
      '닉네임을 입력해주세요.';
    return;
  }

  const firstEntry = !profile;

  profile = { name, animal:selectedAnimal };

  try {
    localStorage.setItem(
      'jmc-profile',
      JSON.stringify(profile)
    );
  } catch {}

  $('profile-modal').hidden = true;
  $('my-profile').textContent =
    `${animalInfo(profile.animal).emoji} ${profile.name}`;

  if (firstEntry) {
    resetToMarketBoard();
  }

  updateMyAvatar();
  sendProfile();
}

$('enter-lounge').onclick = saveProfile;

$('cancel-profile').onclick = () => {
  if (profile) $('profile-modal').hidden = true;
};

$('rename').onclick = () => showProfileModal(true);

$('nickname').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveProfile();
});

profile = loadProfile();

if (profile) {
  $('profile-modal').hidden = true;
  $('my-profile').textContent =
    `${animalInfo(profile.animal).emoji} ${profile.name}`;
} else {
  showProfileModal(false);
}

// ==============================
// 차트 그리기
// ==============================
function plotChart(canvas, candles, mini = false) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#081421';
  ctx.fillRect(0, 0, w, h);

  const data = (candles || []).filter(c =>
    [c.open, c.high, c.low, c.close]
      .every(Number.isFinite)
  );

  if (!data.length) {
    ctx.fillStyle = '#8ba4ba';
    ctx.font = mini ? '20px sans-serif' : '16px sans-serif';
    ctx.fillText('캔들 데이터 연결 대기', 20, h / 2);
    return;
  }

  const low = Math.min(...data.map(c => c.low));
  const high = Math.max(...data.map(c => c.high));
  const padding = (high - low) * .08 || 1;
  const min = low - padding;
  const max = high + padding;

  const L = mini ? 12 : 28;
  const R = mini ? 12 : 90;
  const T = mini ? 12 : 24;
  const B = mini ? 12 : 30;

  const areaW = w - L - R;
  const areaH = h - T - B;
  const step = areaW / data.length;
  const bodyWidth = Math.max(
    1.5,
    Math.min(step * .65, mini ? 8 : 16)
  );

  const y = value =>
    T + (max - value) / (max - min) * areaH;

  ctx.strokeStyle = '#1d3548';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const yy = T + areaH * i / 4;

    ctx.beginPath();
    ctx.moveTo(L, yy);
    ctx.lineTo(w - R, yy);
    ctx.stroke();

    if (!mini) {
      ctx.fillStyle = '#809ab0';
      ctx.font = '13px sans-serif';
      ctx.fillText(
        (max - (max - min) * i / 4).toFixed(2),
        w - R + 7,
        yy + 4
      );
    }
  }

  data.forEach((c, i) => {
    const x = L + step * (i + .5);
    const color = c.close >= c.open
      ? '#42dfbd' : '#f17a98';

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x, y(c.high));
    ctx.lineTo(x, y(c.low));
    ctx.stroke();

    const top = y(Math.max(c.open, c.close));
    const bottom = y(Math.min(c.open, c.close));

    ctx.fillRect(
      x - bodyWidth / 2,
      top,
      bodyWidth,
      Math.max(1.5, bottom - top)
    );
  });
}

function renderAssets() {
  const container = $('assets');
  container.replaceChildren();

  for (const s of symbols) {
    const card = document.createElement('div');
    card.className = 'crypto-asset';

    const head = document.createElement('div');
    head.className = 'crypto-head';

    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = s.name;

    const ticker = document.createElement('small');
    ticker.textContent = `${s.id} / USD`;

    left.append(title, ticker);

    const right = document.createElement('div');
    right.className = 'price';
    right.textContent = formatPrice(s.id, s.price);

    const note = document.createElement('span');
    note.className = 'change';
    note.textContent = 'USD · Coinbase';
    right.append(note);

    head.append(left, right);

    const canvas = document.createElement('canvas');
    canvas.className = 'spark-chart';
    canvas.width = 580;
    canvas.height = 155;

    plotChart(canvas, s.candles, true);

    card.append(head, canvas);
    card.onclick = () => openDetail(s);

    container.append(card);
  }
}

async function loadCandles(symbol, range = '1d') {
  const { granularity, limit } = ranges[range];

  const response = await fetch(
    `/api/candles/${symbol}?granularity=${granularity}&limit=${limit}`,
    { cache:'no-store' }
  );

  if (!response.ok) throw new Error('Candle API error');

  const result = await response.json();

  if (!Array.isArray(result.candles)) {
    throw new Error('Invalid candle data');
  }

  return result.candles;
}

async function updatePrices() {
  await Promise.all(symbols.map(async s => {
    try {
      const response = await fetch(
        `/api/price/${s.id}`,
        { cache:'no-store' }
      );

      if (!response.ok) throw new Error('Price error');

      const data = await response.json();
      const value = Number(data.price);

      s.price = Number.isFinite(value) ? value : null;
    } catch {
      s.price = null;
    }
  }));

  renderAssets();
  refreshBoard();

  if (activeSymbol) {
    $('detail-price').textContent =
      formatPrice(activeSymbol.id, activeSymbol.price);
  }
}

async function updateCandles() {
  await Promise.all(symbols.map(async s => {
    try {
      s.candles = await loadCandles(s.id);
    } catch (error) {
      console.warn('Candles:', s.id, error.message);
    }
  }));

  renderAssets();
  refreshBoard();

  if (activeSymbol && activeRange === '1d') {
    updateDetailChart();
  }
}

function openDetail(s) {
  activeSymbol = s;
  activeRange = '1d';

  $('detail-name').textContent = `${s.name} (${s.id})`;
  $('detail-price').textContent =
    formatPrice(s.id, s.price);

  $('detail').hidden = false;

  document.querySelectorAll('[data-range]').forEach(b => {
    b.classList.toggle(
      'selected',
      b.dataset.range === activeRange
    );
  });

  updateDetailChart();
}

async function updateDetailChart() {
  const symbol = activeSymbol;
  const range = activeRange;

  if (!symbol) return;

  $('chart-status').textContent =
    '캔들 차트를 불러오는 중...';

  try {
    const candles =
      range === '1d' && symbol.candles.length
        ? symbol.candles
        : await loadCandles(symbol.id, range);

    if (symbol !== activeSymbol || range !== activeRange) {
      return;
    }

    plotChart($('detail-chart'), candles);
    $('chart-status').textContent =
      'Coinbase OHLC 캔들 차트';
  } catch {
    plotChart($('detail-chart'), []);
    $('chart-status').textContent =
      '차트 연결에 실패했습니다.';
  }
}

document.querySelectorAll('[data-range]').forEach(button => {
  button.onclick = () => {
    activeRange = button.dataset.range;

    document.querySelectorAll('[data-range]').forEach(b => {
      b.classList.toggle('selected', b === button);
    });

    updateDetailChart();
  };
});

$('close').onclick = () => {
  $('detail').hidden = true;
  activeSymbol = null;
};

$('detail').onclick = e => {
  if (e.target === $('detail')) {
    $('detail').hidden = true;
    activeSymbol = null;
  }
};

renderAssets();
updatePrices();
updateCandles();

setInterval(updatePrices, 15000);
setInterval(updateCandles, 60000);

// ==============================
// 3D 휴식공간
// ==============================
const sceneEl = $('scene');
const scene = new THREE.Scene();

scene.background = new THREE.Color('#080f1b');
scene.fog = new THREE.Fog('#080f1b', 25, 80);

const camera = new THREE.PerspectiveCamera(
  64, 1, .1, 120
);

const renderer = new THREE.WebGLRenderer({
  antialias:true
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2)
);

sceneEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(
  0x9bc9e0,
  0x0b1524,
  2.2
));

function makeBox(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      metalness:.35,
      roughness:.55
    })
  );

  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

makeBox(42, .4, 42, 0x101c2b, 0, -.25, 0);

const grid = new THREE.GridHelper(
  42, 42, 0x24435a, 0x182a3e
);

grid.position.y = .01;
scene.add(grid);

makeBox(38, 8, .5, 0x15293a, 0, 4, -19);
makeBox(.5, 8, 38, 0x14283a, -20, 4, 0);
makeBox(.5, 8, 38, 0x14283a, 20, 4, 0);

for (const x of [-18, 18]) {
  for (const z of [-18, 18]) {
    makeBox(.6, 8, .6, 0x304b5c, x, 4, z);
  }
}

for (const x of [-12, 12]) {
  makeBox(7, .55, 2.5, 0x29495e, x, .35, 4);
  makeBox(7, 1.15, .6, 0x365c72, x, 1.05, 5.1);
  makeBox(1.2, .75, 2.4, 0x365c72, x - 3, .65, 4);
  makeBox(1.2, .75, 2.4, 0x365c72, x + 3, .65, 4);
  makeBox(3.5, .2, 1.5, 0xd5b68a, x, .75, 1.7);
}

for (const x of [-17, 17]) {
  for (const z of [-10, 10]) {
    makeBox(1.2, .9, 1.2, 0x24413e, x, .45, z);

    const plant = new THREE.Mesh(
      new THREE.ConeGeometry(.7, 2.5, 8),
      new THREE.MeshStandardMaterial({ color:0x238878 })
    );

    plant.position.set(x, 2, z);
    scene.add(plant);
  }
}

for (const x of [-12, 0, 12]) {
  const light = new THREE.PointLight(
    0xffd49b,
    25,
    17
  );

  light.position.set(x, 6, 3);
  scene.add(light);
}

const neon = new THREE.PointLight(
  0x4de0bc,
  75,
  30
);

neon.position.set(0, 7, -10);
scene.add(neon);

// ==============================
// 4개 차트 전광판
// ==============================
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 1280;
boardCanvas.height = 620;

const boardCtx = boardCanvas.getContext('2d');
const boardTexture = new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace = THREE.SRGBColorSpace;

const board = new THREE.Mesh(
  new THREE.PlaneGeometry(17, 8.2),
  new THREE.MeshBasicMaterial({
    map:boardTexture,
    side:THREE.DoubleSide
  })
);

board.position.set(0, 4.5, BOARD_Z);
scene.add(board);

function refreshBoard() {
  const c = boardCtx;

  c.fillStyle = '#071421';
  c.fillRect(0, 0, 1280, 620);

  c.fillStyle = '#dfc79a';
  c.font = 'bold 34px Arial';
  c.fillText('JMC INVEST LOUNGE', 40, 55);

  c.fillStyle = '#88a5b8';
  c.font = '20px Arial';
  c.fillText('BTC · ETH · SOL · XRP', 870, 55);

  symbols.forEach((s, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);

    const x = 36 + col * 608;
    const y = 90 + row * 255;

    c.fillStyle = '#10263a';
    c.fillRect(x, y, 588, 240);

    c.strokeStyle = '#315065';
    c.strokeRect(x, y, 588, 240);

    c.fillStyle = '#f0e1c2';
    c.font = 'bold 23px Arial';
    c.fillText(`${s.id} / USD`, x + 18, y + 34);

    c.fillStyle = '#42dfbd';
    c.font = 'bold 29px Arial';
    c.fillText(
      formatPrice(s.id, s.price),
      x + 180,
      y + 35
    );

    const data = s.candles.filter(d =>
      [d.open, d.high, d.low, d.close]
        .every(Number.isFinite)
    );

    if (!data.length) {
      c.fillStyle = '#809ab0';
      c.font = '18px Arial';
      c.fillText('캔들 데이터 연결 대기', x + 20, y + 155);
      return;
    }

    const low = Math.min(...data.map(d => d.low));
    const high = Math.max(...data.map(d => d.high));
    const span = high - low || 1;
    const step = 550 / data.length;

    data.forEach((d, i) => {
      const xx = x + 18 + step * (i + .5);
      const yy = v => y + 220 - (v - low) / span * 156;
      const color = d.close >= d.open
        ? '#42dfbd' : '#f17a98';

      c.strokeStyle = color;
      c.fillStyle = color;

      c.beginPath();
      c.moveTo(xx, yy(d.high));
      c.lineTo(xx, yy(d.low));
      c.stroke();

      const top = yy(Math.max(d.open, d.close));
      const bottom = yy(Math.min(d.open, d.close));
      const bodyW = Math.max(2, step * .6);

      c.fillRect(
        xx - bodyW / 2,
        top,
        bodyW,
        Math.max(2, bottom - top)
      );
    });
  });

  boardTexture.needsUpdate = true;
}

refreshBoard();

// ==============================
// 동물 아바타
// ==============================
const avatarTextures = new Map();

function createAvatarTexture(animalId, name) {
  const key = animalId + ':' + name;

  if (avatarTextures.has(key)) {
    return avatarTextures.get(key);
  }

  const animal = animalInfo(animalId);
  const canvas = document.createElement('canvas');

  canvas.width = 512;
  canvas.height = 512;

  const c = canvas.getContext('2d');

  c.fillStyle = '#132d3b';
  c.beginPath();
  c.arc(256, 210, 170, 0, Math.PI * 2);
  c.fill();

  c.strokeStyle = '#e6c88f';
  c.lineWidth = 12;
  c.stroke();

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '230px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  c.fillText(animal.emoji, 256, 205);

  c.fillStyle = '#102231';
  c.fillRect(35, 385, 442, 82);

  c.fillStyle = '#f4e5c9';
  c.font = 'bold 40px sans-serif';
  c.fillText(name, 256, 425, 410);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  avatarTextures.set(key, texture);
  return texture;
}

function createAvatar(animalId, name, isMe = false) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(.35, .7, 4, 10),
    new THREE.MeshStandardMaterial({
      color:isMe ? 0x4de0bc : 0x789bff
    })
  );

  body.position.y = .85;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({
      map:createAvatarTexture(animalId, name),
      transparent:true,
      side:THREE.DoubleSide,
      depthWrite:false
    })
  );

  face.position.y = 2.65;
  group.add(face);

  group.userData.face = face;
  group.userData.animal = animalId;
  group.userData.name = name;

  return group;
}

let myAvatar = null;
const otherAvatars = new Map();

function resetToMarketBoard() {
  yaw = START_YAW;

  if (myAvatar) {
    myAvatar.position.copy(START_POSITION);
  }

  camera.position.set(
    START_POSITION.x,
    4.2,
    START_POSITION.z + 6
  );

  camera.lookAt(0, 4.5, BOARD_Z);
}

function updateMyAvatar() {
  if (!profile) return;

  const position = myAvatar
    ? myAvatar.position.clone()
    : START_POSITION.clone();

  if (myAvatar) scene.remove(myAvatar);

  myAvatar = createAvatar(
    profile.animal,
    profile.name,
    true
  );

  myAvatar.position.copy(position);
  scene.add(myAvatar);
}

function updateOtherAvatars(players) {
  const seen = new Set();

  for (const p of players) {
    if (p.id === myId) continue;

    seen.add(p.id);

    const existing = otherAvatars.get(p.id);

    if (
      !existing ||
      existing.userData.animal !== p.animal ||
      existing.userData.name !== p.name
    ) {
      if (existing) scene.remove(existing);

      const avatar = createAvatar(p.animal, p.name, false);
      scene.add(avatar);
      otherAvatars.set(p.id, avatar);
    }

    otherAvatars.get(p.id).position.set(
      Number(p.x) || 0,
      0,
      Number(p.z) || 0
    );
  }

  for (const [id, avatar] of otherAvatars) {
    if (!seen.has(id)) {
      scene.remove(avatar);
      otherAvatars.delete(id);
    }
  }
}

if (profile) {
  updateMyAvatar();
  resetToMarketBoard();
}

// ==============================
// PC 및 모바일 이동
// 좌우 방향 반전 오류 수정
// ==============================
let dragging = false;
let lastPointerX = 0;
const keys = new Set();

renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true;
  lastPointerX = e.clientX;

  if (renderer.domElement.setPointerCapture) {
    renderer.domElement.setPointerCapture(e.pointerId);
  }
});

renderer.domElement.addEventListener('pointerup', () => {
  dragging = false;
});

renderer.domElement.addEventListener('pointercancel', () => {
  dragging = false;
});

renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging) return;

  yaw += (e.clientX - lastPointerX) * .005;
  lastPointerX = e.clientX;
});

window.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;

  if (['INPUT', 'TEXTAREA'].includes(tag)) return;

  const key = e.key.toLowerCase();
  keys.add(key);

  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
});

// 모바일 방향키
const mobileControls = $('mobile-controls');

mobileControls.querySelectorAll('.move-btn').forEach(button => {
  const key = button.dataset.key;

  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();

    button.setPointerCapture(e.pointerId);
    keys.add(key);
    button.classList.add('pressed');
  });

  function release(e) {
    e.preventDefault();
    e.stopPropagation();

    keys.delete(key);
    button.classList.remove('pressed');
  }

  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);

  button.addEventListener('lostpointercapture', () => {
    keys.delete(key);
    button.classList.remove('pressed');
  });
});

window.addEventListener('blur', () => {
  keys.clear();
  dragging = false;

  mobileControls.querySelectorAll('.move-btn').forEach(b => {
    b.classList.remove('pressed');
  });
});

let previousFrame = performance.now();
let lastMoveSent = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min(
    (now - previousFrame) / 1000,
    .05
  );

  previousFrame = now;

  if (myAvatar && $('profile-modal').hidden) {
    const forward =
      Number(keys.has('w') || keys.has('arrowup')) -
      Number(keys.has('s') || keys.has('arrowdown'));

    const side =
      Number(keys.has('d') || keys.has('arrowright')) -
      Number(keys.has('a') || keys.has('arrowleft'));

    if (forward || side) {
      const speed = 5 * dt;
      const length = Math.hypot(forward, side) || 1;
      const f = forward / length;
      const s = side / length;

      // 좌우 이동 방향 수정
      // ◀ = 왼쪽, ▶ = 오른쪽
      myAvatar.position.x = Math.max(
        -18,
        Math.min(
          18,
          myAvatar.position.x +
          (Math.sin(yaw) * f - Math.cos(yaw) * s) * speed
        )
      );

      myAvatar.position.z = Math.max(
        -18,
        Math.min(
          18,
          myAvatar.position.z +
          (Math.cos(yaw) * f + Math.sin(yaw) * s) * speed
        )
      );

      if (now - lastMoveSent > 150) {
        send({
          type:'move',
          x:myAvatar.position.x,
          z:myAvatar.position.z
        });

        lastMoveSent = now;
      }
    }
  }

  const target = myAvatar
    ? myAvatar.position
    : START_POSITION;

  const desiredPosition = new THREE.Vector3(
    target.x - Math.sin(yaw) * 6,
    4.2,
    target.z - Math.cos(yaw) * 6
  );

  camera.position.lerp(desiredPosition, .09);

  camera.lookAt(
    target.x + Math.sin(yaw) * 8,
    3.5,
    target.z + Math.cos(yaw) * 8
  );

  if (myAvatar) {
    myAvatar.userData.face.quaternion.copy(
      camera.quaternion
    );
  }

  for (const avatar of otherAvatars.values()) {
    avatar.userData.face.quaternion.copy(
      camera.quaternion
    );
  }

  renderer.render(scene, camera);
}

function resizeScene() {
  const width = sceneEl.clientWidth;
  const height = sceneEl.clientHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resizeScene).observe(sceneEl);
resizeScene();
requestAnimationFrame(animate);

// ==============================
// 실시간 채팅 및 접속자
// ==============================
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendProfile() {
  if (!profile) return;

  send({
    type:'join',
    name:profile.name,
    animal:profile.animal
  });

  if (myAvatar) {
    send({
      type:'move',
      x:myAvatar.position.x,
      z:myAvatar.position.z
    });
  }
}

function connect() {
  const protocol =
    location.protocol === 'https:' ? 'wss' : 'ws';

  socket = new WebSocket(
    `${protocol}://${location.host}/ws`
  );

  socket.onopen = () => {
    $('connection').textContent = '● 연결됨';
    sendProfile();
  };

  socket.onclose = () => {
    $('connection').textContent = '연결 재시도 중';
    setTimeout(connect, 2000);
  };

  socket.onerror = () => {
    $('connection').textContent = '연결 오류';
  };

  socket.onmessage = e => {
    let message;

    try {
      message = JSON.parse(e.data);
    } catch {
      return;
    }

    if (message.type === 'welcome') {
      myId = message.id;
      updateVotes(message.votes);
      $('messages').replaceChildren();

      for (const item of message.history || []) {
        addMessage(item);
      }

      sendProfile();
    }

    if (message.type === 'presence') {
      $('online').textContent = message.count;
      updateOtherAvatars(message.players || []);
    }

    if (message.type === 'chat') {
      addMessage(message.item);
    }

    if (message.type === 'votes') {
      updateVotes(message.votes);
    }
  };
}

function addMessage(item) {
  const line = document.createElement('div');
  line.className = 'msg';

  const name = document.createElement('b');
  name.textContent =
    `${animalInfo(item.animal).emoji} ${item.name}: `;

  line.append(
    name,
    document.createTextNode(item.message || '')
  );

  $('messages').append(line);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function updateVotes(votes) {
  if (!votes) return;

  const total = votes.long + votes.short;
  const longPct = total
    ? Math.round(votes.long / total * 100)
    : 50;

  $('longbar').style.width = longPct + '%';
  $('longpct').textContent =
    `${longPct}% LONG (${votes.long})`;
  $('shortpct').textContent =
    `${100 - longPct}% SHORT (${votes.short})`;
}

$('long').onclick = () => {
  if (!profile) return showProfileModal(false);
  send({ type:'vote', side:'long' });
};

$('short').onclick = () => {
  if (!profile) return showProfileModal(false);
  send({ type:'vote', side:'short' });
};

$('chat-form').onsubmit = e => {
  e.preventDefault();

  if (!profile) {
    showProfileModal(false);
    return;
  }

  const input = $('chat-input');
  const message = input.value.trim();

  if (!message) return;

  send({ type:'chat', message });
  input.value = '';
};

connect();
