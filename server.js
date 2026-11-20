
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { createVisitorStats } from './visitor-stats.js';
import {
  mountAdmin,
  isBlocked,
  getClientIP,
  adminState
} from './admin.js';
import {createBossRaid} from './boss-raid.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({limit:'12kb'}));
app.use(express.static('public'));

const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws'
});

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];

const ANIMALS = [
  'seal',
  'cat',
  'dog',
  'rabbit',
  'fox',
  'panda',
  'bear',
  'penguin',
  'frog',
  'hamster',
  'lion',
  'tiger',
  'koala',
  'raccoon',
  'deer'
];

const clients = new Map();
const visitorStats = await createVisitorStats();

const votes = {
  long: 0,
  short: 0
};

const history = [];

// ========================================
// 실시간 마법 전투 규칙
// HP 100 / 마법 1회 명중 시 HP -1
// ========================================

const MAX_HP = 100;
const MAGIC_SPEED = 13;
const MAGIC_LIFETIME = 1100;
const MAGIC_FIRE_INTERVAL = 180;
const MAGIC_HIT_RADIUS = 0.72;
const magicShots = [];

// ========================================
// 한국시간 자정 채팅 초기화
// ========================================

const seoulDate = () => new Intl.DateTimeFormat(
  'en-CA',
  {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }
).format(new Date());

let chatDate = seoulDate();

function resetChatAtKoreanMidnight() {

  const today = seoulDate();

  if (today === chatDate) {
    return false;
  }

  chatDate = today;

  history.length = 0;

  broadcast({
    type: 'chat_reset',
    date: today
  });

  console.log(
    `[JMC] 한국시간 날짜 변경: ${today} / 채팅 및 말풍선 초기화`
  );

  return true;
}

setInterval(
  resetChatAtKoreanMidnight,
  1000
).unref();

// ========================================
// 시세 캐시
// ========================================

const priceCache = new Map();
const candleCache = new Map();

// ========================================
// 공통 함수
// ========================================

const clean = (value, max = 180) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, max);

const send = (ws, data) => {

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
};

const broadcast = data => {

  for (const ws of clients.keys()) {
    send(ws, data);
  }
};

// ========================================
// 접속자 정보
// ========================================

function presence() {

  const players = [...clients.values()]
    .filter(p => p.ready)
    .map(({
      id,
      name,
      animal,
      x,
      y,
      z,
      direction,
      seated,
      hp
    }) => ({
      id,
      name,
      animal,
      x,
      y,
      z,
      direction,
      seated,
      hp
    }));

  broadcast({
    type: 'presence',
    count: players.length,
    players
  });
}

// ========================================
// 어드민 기능 등록
// ========================================

const raid = await createBossRaid({clients, send, broadcast});

mountAdmin(app, {
  clients,
  votes,
  history,
  magicShots,
  send,
  broadcast,
  presence,
  raid,
  visitorStats
});

// ========================================
// 고래 보스 꼬리 광역공격
// 10초 주기 / 피해 40 / 점프 회피
// ========================================

const BOSS_TAIL_INTERVAL = 10000;
const BOSS_TAIL_WARNING = 1400;
const BOSS_TAIL_DAMAGE = 40;
const BOSS_TAIL_RADIUS = 8;
let tailRaidId = null;
let nextTailAttackAt = 0;
let warnedTailAttackAt = 0;

function updateBossTailAttack() {
  const state = raid.snapshot();

  // 고래가 없거나 사망했다면 공격 중지
  if (state.state !== 'active' || !state.id) {
    tailRaidId = null;
    nextTailAttackAt = 0;
    warnedTailAttackAt = 0;
    return;
  }

  const now = Date.now();

  // 새로운 고래가 소환되면 10초 후 첫 공격
  if (tailRaidId !== state.id) {
    tailRaidId = state.id;
    nextTailAttackAt = now + BOSS_TAIL_INTERVAL;
    warnedTailAttackAt = 0;
    return;
  }

  // 공격 1.4초 전 전체 이용자에게 경고
  if (
    warnedTailAttackAt !== nextTailAttackAt &&
    now >= nextTailAttackAt - BOSS_TAIL_WARNING
  ) {
    warnedTailAttackAt = nextTailAttackAt;

    broadcast({
      type: 'boss_tail_warning',
      leadMs: Math.max(0, nextTailAttackAt - now),
      damage: BOSS_TAIL_DAMAGE
    });
  }

  if (now < nextTailAttackAt) return;

  // 전체 이용자에게 꼬리 공격 및 충격파 표시
  broadcast({
    type: 'boss_tail_strike',
    damage: BOSS_TAIL_DAMAGE
  });

  let someoneDied = false;

  for (const [ws, player] of clients) {
    if (!player.ready || player.hp <= 0) continue;

// 고래 중심(0, -13) 기준 공격 반경 8
const distanceFromBoss = Math.hypot(
  player.x,
  player.z + 13
);

// 붉은 원 밖에 있으면 공격을 받지 않음
if (distanceFromBoss > BOSS_TAIL_RADIUS) {
  send(ws, {
    type: 'boss_tail_result',
    outOfRange: true,
    dodged: true,
    damage: 0
  });
  continue;
}

    // 서버가 기록한 실제 점프 시작 시각으로 판정
    const elapsed = (now - player.lastJumpAt) / 1000;

    // 기존 점프 물리값과 동일하게 높이 계산
    // 점프 속도 8 / 중력 19
    const jumpHeight =
      elapsed > 0 && elapsed < 0.85
        ? 8 * elapsed - 9.5 * elapsed * elapsed
        : 0;

    // 충격파가 발생한 순간 공중에 있으면 회피
    const dodged = jumpHeight >= 0.55;

    send(ws, {
      type: 'boss_tail_result',
      dodged,
      damage: dodged ? 0 : BOSS_TAIL_DAMAGE
    });

    if (dodged) continue;

    // 회피 실패: HP 40 감소
    player.hp = Math.max(
      0,
      player.hp - BOSS_TAIL_DAMAGE
    );

    // 본인의 HP 바 갱신
    send(ws, {
      type: 'hp',
      hp: player.hp,
      maxHp: MAX_HP
    });

    // 다른 참가자의 캐릭터 HP 바 갱신
    broadcast({
      type: 'player_hp',
      id: player.id,
      hp: player.hp,
      maxHp: MAX_HP
    });

    // 체력이 0이면 기존 사망 및 퇴장 처리
    if (player.hp === 0) {
      player.ready = false;

      send(ws, {
        type: 'death',
        message: '사망하셨습니다',
        hp: 0
      });

      ws.close(4001, 'HP depleted');
      someoneDied = true;
    }
  }

  if (someoneDied) {
    presence();
  }

  // 다음 광역공격은 10초 후
  nextTailAttackAt = now + BOSS_TAIL_INTERVAL;
  warnedTailAttackAt = 0;
}

// 서버가 공격 시간을 관리
setInterval(updateBossTailAttack, 50).unref();

// ========================================
// WebSocket 멀티플레이 서버
// ========================================

wss.on('connection', (ws, req) => {

  // 관리자가 차단한 IP는 재입장 제한
  if (isBlocked(req)) {
    ws.close(4003, 'Temporarily blocked');
    return;
  }

  const p = {
    clientIP: getClientIP(req),
    joinedAt: Date.now(),

    id: crypto.randomUUID(),

    name: '',
    animal: 'seal',

    x: 0,
    y: 0,
    z: -8,

    direction: Math.PI,
    seated: false,

    ready: false,

    vote: null,

    lastChat: 0,
    lastMove: 0,

    lastMagic: 0,
    lastJumpAt: 0,
    hp: MAX_HP
  };

  clients.set(ws, p);

  resetChatAtKoreanMidnight();

  send(ws, {
    type: 'welcome',
    id: p.id,
    votes: {...votes},
    history
  });

  raid.sendSnapshot(ws);
  presence();

  // ======================================
  // 클라이언트 메시지 수신
  // ======================================

  ws.on('message', raw => {

    if (raw.length > 2048) {
      return;
    }

    let m;

    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!m || typeof m !== 'object') {
      return;
    }

    // ====================================
    // 캐릭터 입장 및 설정
    // ====================================

    if (m.type === 'join') {

      if (p.hp <= 0) {
        return;
      }

      const name = clean(m.name, 16);

      if (!name) {
        return;
      }

      p.name = name;

      p.animal = ANIMALS.includes(m.animal)
        ? m.animal
        : 'seal';

      p.ready = true;

const firstJoin = !p.ready;
p.ready = true;

if (firstJoin) {
  void visitorStats.record(m.visitorId);
}

      send(ws, {
        type: 'hp',
        hp: p.hp,
        maxHp: MAX_HP
      });

      presence();

      return;
    }

    if (!p.ready) {
      return;
    }

    
// 고래 광역공격 회피를 위한 점프 시작 시각 기록
if (m.type === 'jump') {
  const now = Date.now();

  // 앉은 상태에서는 점프 불가
  // 점프 연타로 회피 판정을 조작하지 못하도록 제한
  if (
    p.hp > 0 &&
    !p.seated &&
    now - p.lastJumpAt >= 850
  ) {
    p.lastJumpAt = now;
  }

  return;
}
    if(m.type==='loot_pickup'){
      void raid.pickup(ws,p);
      return;
    }

    // ====================================
    // 캐릭터 이동 동기화
    // ====================================

    if (m.type === 'move') {

      const now = Date.now();

      if (now - p.lastMove < 80) {
        return;
      }

      const x = Number(m.x);
      const z = Number(m.z);
      const direction = Number(m.direction);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(z)
      ) {
        return;
      }

      // 순간이동을 방지하기 위한 서버 좌표 검증
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

      p.x = Math.max(
        -18,
        Math.min(18, x)
      );

      p.z = Math.max(
        -18,
        Math.min(18, z)
      );

      if (Number.isFinite(Number(m.y))) {

        p.y = Math.max(
          0,
          Math.min(2.5, Number(m.y))
        );
      }

      p.seated = m.seated === true;

      if (Number.isFinite(direction)) {

        p.direction = Math.atan2(
          Math.sin(direction),
          Math.cos(direction)
        );
      }

      p.lastMove = now;

      presence();

      return;
    }

    // ====================================
    // 실시간 마법 공격
    // ====================================

    if (m.type === 'magic') {

      // 관리자가 마법 공격을 중단한 경우
      if (!adminState.magicEnabled) {
        return;
      }

      const now = Date.now();

      if (
        now - p.lastMagic <
        MAGIC_FIRE_INTERVAL
      ) {
        return;
      }

      p.lastMagic = now;

      const dirX = Math.sin(p.direction);
      const dirZ = Math.cos(p.direction);

      const shotId = crypto.randomUUID();

      magicShots.push({
        id: shotId,
        owner: p,
        x: p.x + dirX * 0.85,
        z: p.z + dirZ * 0.85,
        y: p.y + 1.15,
        dirX,
        dirZ,
        born: now,
        prevTime: now
      });

      const magicEvent = {
        type: 'magic',

        shotId,

        senderId: p.id,

        animal: p.animal,

        x: p.x,
        y: p.y,
        z: p.z,

        direction: p.direction,

        time: now
      };

      broadcast(magicEvent);

      return;
    }

    // ====================================
    // 실시간 채팅
    // ====================================

    if (m.type === 'chat') {

      // 관리자가 일반 채팅을 중단한 경우
      if (!adminState.chatEnabled) {
        return;
      }

      resetChatAtKoreanMidnight();

      const now = Date.now();

      if (now - p.lastChat < 700) {
        return;
      }

      const message = clean(m.message);

      if (!message) {
        return;
      }

      p.lastChat = now;

      const item = {
        id: crypto.randomUUID(),

        senderId: p.id,

        name: p.name,
        animal: p.animal,

        message,

        time: now
      };

      history.push(item);

      if (history.length > 40) {
        history.shift();
      }

      broadcast({
        type: 'chat',
        item
      });

      return;
    }

    // ====================================
    // 롱 / 숏 투표
    // ====================================

    if (m.type === 'vote') {

      if (
        !['long', 'short'].includes(m.side) ||
        p.vote === m.side
      ) {
        return;
      }

      if (p.vote) {

        votes[p.vote] = Math.max(
          0,
          votes[p.vote] - 1
        );
      }

      p.vote = m.side;

      votes[p.vote]++;

      broadcast({
        type: 'votes',
        votes: {...votes}
      });

      return;
    }
  });

  // ======================================
  // 접속 종료
  // ======================================

  ws.on('close', () => {

    if (p.vote) {

      votes[p.vote] = Math.max(
        0,
        votes[p.vote] - 1
      );

      broadcast({
        type: 'votes',
        votes: {...votes}
      });
    }

    clients.delete(ws);

    presence();
  });

  // ======================================
  // WebSocket 오류 처리
  // ======================================

  ws.on('error', err => {

    console.error(
      'WebSocket:',
      err.message
    );
  });
});

// ========================================
// 마법 명중 판정 및 HP 실시간 동기화
// ========================================

function updateMagicCollisions() {

  const now = Date.now();

  const activePlayers = [...clients.entries()]
    .filter(([, p]) => p.ready && p.hp > 0);

  for (
    let i = magicShots.length - 1;
    i >= 0;
    i--
  ) {

    const shot = magicShots[i];

    if (
      !shot.owner.ready ||
      now - shot.born > MAGIC_LIFETIME
    ) {
      magicShots.splice(i, 1);
      continue;
    }

    const dt = Math.max(
      0,
      Math.min(
        (now - shot.prevTime) / 1000,
        0.12
      )
    );

    shot.prevTime = now;

    const startX = shot.x;
    const startZ = shot.z;

    const endX =
      startX +
      shot.dirX * MAGIC_SPEED * dt;

    const endZ =
      startZ +
      shot.dirZ * MAGIC_SPEED * dt;

    const dx = endX - startX;
    const dz = endZ - startZ;

    const lengthSq = dx * dx + dz * dz;

    let nearest = null;

    for (const [targetWs, target] of activePlayers) {

      if (
        !target.ready ||
        target.hp <= 0 ||
        target === shot.owner
      ) {
        continue;
      }

      if (
        Math.abs(
          shot.y - (target.y + 1.0)
        ) > 0.85
      ) {
        continue;
      }

      const t = lengthSq > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (
                (target.x - startX) * dx +
                (target.z - startZ) * dz
              ) / lengthSq
            )
          )
        : 0;

      const impactX = startX + dx * t;
      const impactZ = startZ + dz * t;

      const distance = Math.hypot(
        target.x - impactX,
        target.z - impactZ
      );

      if (distance > MAGIC_HIT_RADIUS) {
        continue;
      }

      if (!nearest || t < nearest.t) {
        nearest = {
          targetWs,
          target,
          t,
          impactX,
          impactZ
        };
      }
    }

    const bossPoint=raid.collision(
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
      shot.x=endX;
      shot.z = endZ;
      continue;
    }

    // ====================================
    // 실제 명중 처리
    // ====================================

    const {
      targetWs,
      target,
      impactX,
      impactZ
    } = nearest;

    magicShots.splice(i, 1);

    target.hp = Math.max(
      0,
      target.hp - 1
    );

    send(targetWs, {
      type: 'hp',
      hp: target.hp,
      maxHp: MAX_HP
    });

    broadcast({
      type: 'player_hp',
      id: target.id,
      hp: target.hp,
      maxHp: MAX_HP
    });

    // 마법탄 소멸 + 피격 액션 동기화
    broadcast({
      type: 'magic_hit',

      shotId: shot.id,

      targetId: target.id,

      x: impactX,
      y: shot.y,
      z: impactZ,

      dirX: shot.dirX,
      dirZ: shot.dirZ,

      hp: target.hp
    });

    if (target.hp === 0) {

      target.ready = false;

      send(targetWs, {
        type: 'death',
        message: '사망하셨습니다',
        hp: 0
      });

      targetWs.close(
        4001,
        'HP depleted'
      );

      presence();
    }
  }
}

setInterval(
  updateMagicCollisions,
  40
).unref();

// ========================================
// API 캐시 함수
// ========================================

async function cached(
  cache,
  key,
  ttl,
  loader
) {

  const old = cache.get(key);

  if (
    old &&
    Date.now() - old.time < ttl
  ) {
    return old.data;
  }

  const data = await loader();

  cache.set(key, {
    time: Date.now(),
    data
  });

  return data;
}

// ========================================
// 암호화폐 실시간 시세 API
// ========================================

app.get('/api/price/:symbol', async (req, res) => {

  const symbol = req.params.symbol.toUpperCase();

  if (!SYMBOLS.includes(symbol)) {

    return res.status(404).json({
      error: 'Unknown symbol'
    });
  }

  try {

    const data = await cached(
      priceCache,
      symbol,
      10000,
      async () => {

        const response = await fetch(
          `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,
          {
            signal: AbortSignal.timeout(9000)
          }
        );

        if (!response.ok) {
          throw Error('Price unavailable');
        }

        const json = await response.json();

        const price = Number(
          json?.data?.amount
        );

        if (!Number.isFinite(price)) {
          throw Error('Invalid price');
        }

        return {price};
      }
    );

    res.set(
      'Cache-Control',
      'no-store'
    ).json(data);

  } catch (e) {

    console.error(
      symbol,
      e.message
    );

    res.status(502).json({
      error: 'Price unavailable'
    });
  }
});

// ========================================
// 암호화폐 캔들 차트 API
// ========================================

app.get('/api/candles/:symbol', async (req, res) => {

  const symbol = req.params.symbol.toUpperCase();

  const granularity = Number(
    req.query.granularity
  );

  const requested = Number(
    req.query.limit
  );

  const limit = Number.isFinite(requested)
    ? Math.max(
        2,
        Math.min(
          300,
          Math.floor(requested)
        )
      )
    : 96;

  if (
    !SYMBOLS.includes(symbol) ||
    ![60, 900, 3600].includes(granularity)
  ) {

    return res.status(400).json({
      error: 'Invalid request'
    });
  }

  const key =
    `${symbol}:${granularity}:${limit}`;

  try {

    const data = await cached(
      candleCache,
      key,
      45000,
      async () => {

        const end = Date.now();

        const start =
          end - granularity * limit * 1000;

        const url = new URL(
          `https://api.exchange.coinbase.com/products/${symbol}-USD/candles`
        );

        url.searchParams.set(
          'start',
          new Date(start).toISOString()
        );

        url.searchParams.set(
          'end',
          new Date(end).toISOString()
        );

        url.searchParams.set(
          'granularity',
          String(granularity)
        );

        const response = await fetch(
          url,
          {
            headers: {
              'User-Agent': 'JMC-Invest-Lounge/1.0'
            },
            signal: AbortSignal.timeout(10000)
          }
        );

        if (!response.ok) {
          throw Error('Candles unavailable');
        }

        const raw = await response.json();

        if (!Array.isArray(raw)) {
          throw Error('Invalid candle response');
        }

        const candles = raw
          .filter(a =>
            Array.isArray(a) &&
            a.length >= 5
          )
          .map(a => ({
            time: Number(a[0]),
            low: Number(a[1]),
            high: Number(a[2]),
            open: Number(a[3]),
            close: Number(a[4])
          }))
          .filter(c =>
            Object.values(c)
              .every(Number.isFinite)
          )
          .sort((a, b) =>
            a.time - b.time
          )
          .slice(-limit);

        if (!candles.length) {
          throw Error('Empty candle data');
        }

        return {candles};
      }
    );

    res.set(
      'Cache-Control',
      'public, max-age=30'
    ).json(data);

  } catch (e) {

    console.error(
      symbol,
      e.message
    );

    res.status(502).json({
      error: 'Candles unavailable'
    });
  }
});

// ========================================
// 서버 상태 확인 API
// ========================================

app.get('/api/health', (_req, res) => {

  res.json({
    ok: true,
    online: [...clients.values()]
      .filter(p => p.ready).length
  });
});

// ========================================
// 서버 실행
// ========================================

const port = Number(process.env.PORT) || 3000;

server.listen(
  port,
  '0.0.0.0',
  () => {

    console.log(
      `JMC Lounge listening on ${port}`
    );
  }
);
