
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const $ = id => document.getElementById(id);
const symbols = [
  { id:'BTC', name:'비트코인', ticker:'BTC / USD', price:null, candles:[] },
  { id:'ETH', name:'이더리움', ticker:'ETH / USD', price:null, candles:[] },
  { id:'SOL', name:'솔라나', ticker:'SOL / USD', price:null, candles:[] },
  { id:'XRP', name:'리플', ticker:'XRP / USD', price:null, candles:[] }
];

const format = n => n == null ? '연동 대기' :
  Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

const chartRanges = {
  '1h': { granularity:60, limit:60 },
  '1d': { granularity:900, limit:96 },
  '1w': { granularity:3600, limit:168 }
};

let activeSymbol = null;
let activeRange = '1d';

function plotChart(canvas, candles, options = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#081421';
  ctx.fillRect(0, 0, w, h);

  if (!candles?.length) {
    ctx.fillStyle = '#91a9c0';
    ctx.font = '17px sans-serif';
    ctx.fillText('캔들 데이터 연결 대기', 20, h / 2);
    return;
  }

  const data = candles.filter(c =>
    [c.open,c.high,c.low,c.close].every(Number.isFinite)
  );
  if (!data.length) return;

  const lo = Math.min(...data.map(c => c.low));
  const hi = Math.max(...data.map(c => c.high));
  const pad = (hi - lo) * .08 || 1;
  const min = lo - pad, max = hi + pad;

  const L = options.mini ? 12 : 28;
  const R = options.mini ? 12 : 85;
  const T = options.mini ? 12 : 24;
  const B = options.mini ? 12 : 30;

  const areaW = w - L - R;
  const areaH = h - T - B;
  const step = areaW / data.length;
  const bodyW = Math.max(1.2, Math.min(step * .64, options.mini ? 8 : 16));
  const y = v => T + (max - v) / (max - min) * areaH;

  ctx.strokeStyle = '#1d3548';
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const yy = T + areaH * i / 4;
    ctx.beginPath();
    ctx.moveTo(L, yy);
    ctx.lineTo(w - R, yy);
    ctx.stroke();

    if (!options.mini) {
      ctx.fillStyle = '#809ab0';
      ctx.font = '14px sans-serif';
      ctx.fillText(format(max - (max - min) * i / 4), w - R + 7, yy + 4);
    }
  }

  data.forEach((c, i) => {
    const x = L + step * (i + .5);
    const up = c.close >= c.open;
    const color = up ? '#42dfbd' : '#f17a98';

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = options.mini ? 1 : 1.6;

    ctx.beginPath();
    ctx.moveTo(x, y(c.high));
    ctx.lineTo(x, y(c.low));
    ctx.stroke();

    const top = y(Math.max(c.open, c.close));
    const bottom = y(Math.min(c.open, c.close));
    ctx.fillRect(
      x - bodyW / 2,
      top,
      bodyW,
      Math.max(1.5, bottom - top)
    );
  });
}

function renderAssets() {
  $('assets').replaceChildren(...symbols.map(s => {
    const el = document.createElement('div');
    el.className = 'asset crypto-asset';

    const head = document.createElement('div');
    head.className = 'crypto-head';

    const left = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = s.name;

    const ticker = document.createElement('small');
    ticker.textContent = s.ticker;
    left.append(name, ticker);

    const right = document.createElement('div');
    right.className = 'price';
    right.textContent = s.price == null ? '—' : `$${format(s.price)}`;

    const note = document.createElement('span');
    note.className = 'change';
    note.textContent = s.price == null ?
      '시세 연결 대기' : 'USD · Coinbase 시세';

    right.append(note);
    head.append(left, right);

    const canvas = document.createElement('canvas');
    canvas.width = 580;
    canvas.height = 155;
    canvas.className = 'spark-chart';
    plotChart(canvas, s.candles, { mini:true });

    el.append(head, canvas);
    el.onclick = () => showDetail(s);
    return el;
  }));
}

async function loadCandles(s, range = '1d') {
  const { granularity, limit } = chartRanges[range];
  const response = await fetch(
    `/api/candles/${s.id}?granularity=${granularity}&limit=${limit}`,
    { cache:'no-store' }
  );

  if (!response.ok) throw Error('차트 조회 실패');
  const data = await response.json();

  if (!Array.isArray(data.candles) || !data.candles.length) {
    throw Error('차트 데이터 없음');
  }
  return data.candles;
}

async function showDetail(s) {
  activeSymbol = s;
  $('detail-name').textContent = s.name;
  $('detail-price').textContent = s.price == null ?
    '시세 연결 대기' : `$${format(s.price)}`;
  $('detail-note').textContent =
    'Coinbase 시세 기준 · 제공처별 시세 차이가 있을 수 있습니다.';
  $('detail').hidden = false;
  await updateDetailChart();
}

async function updateDetailChart() {
  const s = activeSymbol, range = activeRange;
  if (!s) return;

  $('chart-status').textContent = '차트 불러오는 중…';

  try {
    const candles = range === '1d' && s.candles.length ?
      s.candles : await loadCandles(s, range);

    if (s !== activeSymbol || range !== activeRange) return;

    plotChart($('detail-chart'), candles);
    $('chart-status').textContent =
      `${range === '1h' ? '최근 1시간' :
         range === '1d' ? '최근 1일' : '최근 1주'} · OHLC 캔들 기준`;
  } catch {
    plotChart($('detail-chart'), []);
    $('chart-status').textContent =
      '차트를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
}

document.querySelectorAll('[data-range]').forEach(b => {
  b.onclick = () => {
    activeRange = b.dataset.range;
    document.querySelectorAll('[data-range]').forEach(x =>
      x.classList.toggle('selected', x === b)
    );
    updateDetailChart();
  };
});

$('close').onclick = () => $('detail').hidden = true;
$('detail').onclick = e => {
  if (e.target === $('detail')) $('detail').hidden = true;
};

renderAssets();

async function updatePrices() {
  await Promise.all(symbols.map(async s => {
    try {
      const response = await fetch(`/api/price/${s.id}`, {
        cache:'no-store'
      });
      if (!response.ok) throw Error();

      const data = await response.json();
      s.price = Number(data.price);
      if (!Number.isFinite(s.price)) throw Error();
    } catch {
      s.price = null;
    }
  }));

  renderAssets();
  refreshBoard();
}

async function updateAllCandles() {
  await Promise.all(symbols.map(async s => {
    try {
      s.candles = await loadCandles(s);
    } catch {
      s.candles = [];
    }
  }));

  renderAssets();
  refreshBoard();

  if (activeSymbol && activeRange === '1d') {
    updateDetailChart();
  }
}

updatePrices();
updateAllCandles();
setInterval(updatePrices, 15000);
setInterval(updateAllCandles, 60000);

// 3D 메타버스 휴식공간
const sceneEl = $('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#080f1b');
scene.fog = new THREE.Fog('#080f1b', 20, 75);

const camera = new THREE.PerspectiveCamera(64, 1, .1, 120);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
sceneEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8ebbd7, 0x0b1524, 2));

const lamp = new THREE.PointLight(0x5ee9c8, 85, 30);
lamp.position.set(0, 8, -9);
scene.add(lamp);

function box(w, h, d, color, x, y, z, emissive = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      metalness:.55,
      roughness:.4,
      emissive,
      emissiveIntensity:.22
    })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

box(42, .4, 42, 0x101c2b, 0, -.25, 0);

const grid = new THREE.GridHelper(42, 42, 0x24435a, 0x182a3e);
grid.position.y = .01;
scene.add(grid);

for (const x of [-20,20]) {
  for (const z of [-20,20]) {
    box(.5, 8, .5, 0x213a51, x, 4, z);
    const glow = new THREE.PointLight(0x1b9d8c, 12, 8);
    glow.position.set(x, 6, z);
    scene.add(glow);
  }
}

box(20, 8, .5, 0x14283a, 0, 4, -16);
box(22, .5, 2, 0x223c52, 0, 8, -15);
box(11, .25, 1.2, 0x27515d, 0, 1.2, -9);

for (const x of [-9,-5,5,9]) {
  box(2, .15, 2, 0x213b4e, x, 1, 4);
  box(.15, 1, .15, 0x4de0bc, x, .5, 4);
}

const loungeGroup = new THREE.Group();
scene.add(loungeGroup);

function furniture(w, h, d, color, x, y, z, metal = .2) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      metalness:metal,
      roughness:.48
    })
  );
  m.position.set(x, y, z);
  loungeGroup.add(m);
  return m;
}

// 목재 데크와 네온 라인
furniture(35, .08, 17, 0x1b2833, 0, .03, 6);

for (const x of [-16,16]) {
  furniture(.15, .18, 17, 0xc6a977, x, .16, 6, .75);
}

// 소파 및 테이블
for (const x of [-13,13]) {
  furniture(7, .48, 2.4, 0x28465b, x, .35, 4);
  furniture(7, 1.05, .55, 0x365c72, x, 1.04, 5.1);
  furniture(1.2, .7, 1.4, 0x365c72, x - 3, .65, 4);
  furniture(1.2, .7, 1.4, 0x365c72, x + 3, .65, 4);

  furniture(3.4, .18, 1.5, 0xd5b68a, x, .73, 1.7, .1);
  furniture(.2, .65, .2, 0x9b845f, x - 1, .37, 1.7);
  furniture(.2, .65, .2, 0x9b845f, x + 1, .37, 1.7);
}

// 식물 장식
for (const x of [-17,17]) {
  for (const z of [-10,11]) {
    furniture(1.25, .9, 1.25, 0x243c3b, x, .45, z);
    const plant = new THREE.Mesh(
      new THREE.ConeGeometry(.65, 2.5, 7),
      new THREE.MeshStandardMaterial({
        color:0x238878,
        roughness:.85
      })
    );
    plant.position.set(x, 2, z);
    loungeGroup.add(plant);
  }
}

// 라운지 조명
for (const x of [-10,0,10]) {
  const light = new THREE.PointLight(0xf6cf9b, 22, 15);
  light.position.set(x, 6, 3);
  scene.add(light);
  furniture(3, .12, 1.4, 0xc1a06d, x, 7.5, 3, .7);
}

// 천장 별빛
const stars = new THREE.BufferGeometry();
const positions = [];

for (let i = 0; i < 150; i++) {
  positions.push(
    (Math.random() - .5) * 38,
    8.5 + Math.random() * 2,
    (Math.random() - .5) * 35
  );
}

stars.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(positions, 3)
);

scene.add(new THREE.Points(
  stars,
  new THREE.PointsMaterial({
    color:0x9ccde2,
    size:.075
  })
));

// JMC 휴식공간 간판
const welcomeCanvas = document.createElement('canvas');
welcomeCanvas.width = 1024;
welcomeCanvas.height = 180;

const wc = welcomeCanvas.getContext('2d');
wc.fillStyle = '#0b2030';
wc.fillRect(0, 0, 1024, 180);
wc.strokeStyle = '#d9bd85';
wc.lineWidth = 8;
wc.strokeRect(8, 8, 1008, 164);
wc.fillStyle = '#f5dfb0';
wc.textAlign = 'center';
wc.font = 'bold 70px Arial';
wc.fillText('JMC REST LOUNGE', 512, 112);

const wt = new THREE.CanvasTexture(welcomeCanvas);
wt.colorSpace = THREE.SRGBColorSpace;

const welcome = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 2.1),
  new THREE.MeshBasicMaterial({ map:wt })
);
welcome.position.set(0, 5.9, 15);
welcome.rotation.y = Math.PI;
scene.add(welcome);

// 4종목 3D 대형 전광판
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 1280;
boardCanvas.height = 620;

const ctx = boardCanvas.getContext('2d');
const tex = new THREE.CanvasTexture(boardCanvas);
tex.colorSpace = THREE.SRGBColorSpace;

const board = new THREE.Mesh(
  new THREE.PlaneGeometry(17, 8.2),
  new THREE.MeshBasicMaterial({
    map:tex,
    side:THREE.DoubleSide
  })
);
board.position.set(0, 4.5, -15.65);
scene.add(board);

function refreshBoard() {
  ctx.fillStyle = '#071421';
  ctx.fillRect(0, 0, 1280, 620);

  ctx.fillStyle = '#dfc79a';
  ctx.font = 'bold 34px Arial';
  ctx.fillText('JMC  |  INVEST LOUNGE', 40, 56);

  ctx.fillStyle = '#88a5b8';
  ctx.font = '20px Arial';
  ctx.fillText('BTC · ETH · SOL · XRP / CANDLE MARKET', 700, 56);

  symbols.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * 608;
    const y = 90 + row * 255;
    const w = 588, h = 240;

    ctx.fillStyle = '#10263a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#315065';
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f0e1c2';
    ctx.font = 'bold 23px Arial';
    ctx.fillText(`${s.id} / USD`, x + 18, y + 33);

    ctx.fillStyle = '#42dfbd';
    ctx.font = 'bold 31px Arial';
    ctx.fillText(
      s.price == null ? '연결 대기' : `$${format(s.price)}`,
      x + 180, y + 35
    );

    const data = s.candles.filter(c =>
      [c.open,c.high,c.low,c.close].every(Number.isFinite)
    );

    if (data.length) {
      const low = Math.min(...data.map(c => c.low));
      const high = Math.max(...data.map(c => c.high));
      const span = high - low || 1;
      const step = 550 / data.length;

      data.forEach((c, j) => {
        const xx = x + 18 + step * (j + .5);
        const yy = v => y + 220 - (v - low) / span * 156;
        const color = c.close >= c.open ? '#42dfbd' : '#f17a98';

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xx, yy(c.high));
        ctx.lineTo(xx, yy(c.low));
        ctx.stroke();

        const top = yy(Math.max(c.open, c.close));
        const bottom = yy(Math.min(c.open, c.close));
        ctx.fillRect(
          xx - Math.max(1, step * .3),
          top,
          Math.max(2, step * .6),
          Math.max(2, bottom - top)
        );
      });
    } else {
      ctx.fillStyle = '#809ab0';
      ctx.font = '18px Arial';
      ctx.fillText('캔들 차트 연결 대기', x + 18, y + 155);
    }
  });

  tex.needsUpdate = true;
}

refreshBoard();

// 내 아바타
const me = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(.32, .75, 4, 8),
  new THREE.MeshStandardMaterial({ color:0x4de0bc })
);
body.position.y = .85;
me.add(body);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(.25, 12, 12),
  new THREE.MeshStandardMaterial({ color:0xd9b89c })
);
head.position.y = 1.63;
me.add(head);
scene.add(me);
me.position.set(0, 0, 9);

// 다른 접속자 아바타
const others = new Map();

function updatePlayers(players, id) {
  const seen = new Set();

  for (const p of players) {
    if (p.id === id) continue;
    seen.add(p.id);

    if (!others.has(p.id)) {
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(.33, 1, 4, 8),
        new THREE.MeshStandardMaterial({ color:0x789bff })
      );
      scene.add(m);
      others.set(p.id, m);
    }
    others.get(p.id).position.set(p.x, 1, p.z);
  }

  for (const [id, m] of others) {
    if (!seen.has(id)) {
      scene.remove(m);
      others.delete(id);
    }
  }
}

// WASD 이동과 마우스 시점 조절
let yaw = 0;
let dragging = false;
let lastX = 0;

renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true;
  lastX = e.clientX;
});

window.addEventListener('pointerup', () => dragging = false);
window.addEventListener('pointermove', e => {
  if (dragging) {
    yaw += (e.clientX - lastX) * .005;
    lastX = e.clientX;
  }
});

const keys = new Set();

window.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  keys.add(e.key.toLowerCase());
  if (e.key.startsWith('Arrow')) e.preventDefault();
});

window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
});

let last = performance.now();
let lastMove = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - last) / 1000, .05);
  last = now;

  const forward =
    Number(keys.has('w') || keys.has('arrowup')) -
    Number(keys.has('s') || keys.has('arrowdown'));

  const side =
    Number(keys.has('d') || keys.has('arrowright')) -
    Number(keys.has('a') || keys.has('arrowleft'));

  if (forward || side) {
    const speed = 5 * dt;

    me.position.x = Math.max(-18, Math.min(18,
      me.position.x +
      (Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed
    ));

    me.position.z = Math.max(-18, Math.min(18,
      me.position.z +
      (-Math.cos(yaw) * forward + Math.sin(yaw) * side) * speed
    ));

    if (now - lastMove > 150) {
      send({ type:'move', x:me.position.x, z:me.position.z });
      lastMove = now;
    }
  }

  const target = new THREE.Vector3(
    me.position.x + Math.sin(yaw) * 7,
    5.2,
    me.position.z + Math.cos(yaw) * 7
  );

  camera.position.lerp(target, .065);
  camera.lookAt(me.position.x, 1.5, me.position.z - 4);
  renderer.render(scene, camera);
}

function resize() {
  const w = sceneEl.clientWidth;
  const h = sceneEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(sceneEl);
resize();
requestAnimationFrame(animate);

// 실시간 채팅 / 접속자 / 투표
let socket, id;

function send(m) {
  if (socket?.readyState === 1) {
    socket.send(JSON.stringify(m));
  }
}

function connect() {
  socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  );

  socket.onopen = () => {
    $('connection').textContent = '● 연결됨';
    send({
      type:'join',
      name:localStorage.getItem('mv-name') || '방문자'
    });
  };

  socket.onclose = () => {
    $('connection').textContent = '연결 재시도 중';
    setTimeout(connect, 2000);
  };

  socket.onmessage = e => {
    const m = JSON.parse(e.data);

    if (m.type === 'welcome') {
      id = m.id;
      updateVotes(m.votes);
      $('messages').replaceChildren();
      m.history.forEach(addMessage);
    }

    if (m.type === 'presence') {
      $('online').textContent = m.count;
      updatePlayers(m.players, id);
    }

    if (m.type === 'chat') addMessage(m.item);
    if (m.type === 'votes') updateVotes(m.votes);
  };
}

connect();

function addMessage(item) {
  const p = document.createElement('div');
  p.className = 'msg';

  const b = document.createElement('b');
  b.textContent = item.name + ': ';

  p.append(b, document.createTextNode(item.message));
  $('messages').append(p);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function updateVotes(v) {
  const total = v.long + v.short;
  const pct = total ? Math.round(v.long / total * 100) : 50;

  $('longbar').style.width = pct + '%';
  $('longpct').textContent = `${pct}% LONG (${v.long})`;
  $('shortpct').textContent = `${100 - pct}% SHORT (${v.short})`;
}

$('long').onclick = () => send({ type:'vote', side:'long' });
$('short').onclick = () => send({ type:'vote', side:'short' });

$('chat-form').onsubmit = e => {
  e.preventDefault();
  const input = $('chat-input');
  send({ type:'chat', message:input.value });
  input.value = '';
};

$('rename').onclick = () => {
  const name = prompt(
    '닉네임 (최대 16자)',
    localStorage.getItem('mv-name') || ''
  );

  if (name?.trim()) {
    const newName = name.trim().slice(0, 16);
    localStorage.setItem('mv-name', newName);
    send({ type:'join', name:newName });
  }
};
