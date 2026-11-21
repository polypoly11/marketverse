import {createMissileSystem} from './missile-server.js';
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
import {createGoogleAuth} from './google-auth.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({limit:'12kb'}));

// ========================================
// 아이템 저장용 브라우저 식별값
// 기존 클라이언트가 inventoryToken을 보내지 않아도
// 같은 브라우저의 재접속 시 아이템 소유자를 식별한다.
// ========================================

const INVENTORY_COOKIE_NAME = 'jmc_inventory_v1';
const INVENTORY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const INVENTORY_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function inventoryTokenFromCookie(req) {
  const cookies = String(req.headers.cookie || '').split(';');

  for (const entry of cookies) {
    const equal = entry.indexOf('=');
    if (equal < 0) continue;

    const name = entry.slice(0, equal).trim();
    if (name !== INVENTORY_COOKIE_NAME) continue;

    const token = entry.slice(equal + 1).trim();
    return INVENTORY_TOKEN_PATTERN.test(token) ? token : null;
  }

  return null;
}

function hashInventoryToken(token) {
  return crypto.createHash('sha256')
    .update(token)
    .digest('hex');
}

// 첫 방문 때만 보안 토큰을 발급한다.
// HttpOnly 쿠키이므로 브라우저 JavaScript에서 노출되지 않는다.
app.use((req, res, next) => {
  if (!inventoryTokenFromCookie(req)) {
    const token = crypto.randomBytes(32).toString('hex');
    const secure = req.secure ||
      String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0].trim() === 'https';

    const cookie =
      `${INVENTORY_COOKIE_NAME}=${token}; ` +
      `Path=/; Max-Age=${INVENTORY_COOKIE_MAX_AGE}; ` +
      'HttpOnly; SameSite=Lax' +
      (secure ? '; Secure' : '');

    res.append('Set-Cookie', cookie);
  }

  next();
});

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
const googleAuth = await createGoogleAuth(app);
// ========================================
// Google 계정 PVP 전적 저장
// ========================================

let pvpPool = null;

if (process.env.DATABASE_URL) {
  const {Pool} = await import('pg');

  pvpPool = new Pool({
    connectionString:process.env.DATABASE_URL,
    max:2
  });

  await pvpPool.query(`
    CREATE TABLE IF NOT EXISTS jmc_pvp_stats (
      google_sub TEXT PRIMARY KEY
        REFERENCES jmc_google_users(google_sub),
      kills INTEGER NOT NULL DEFAULT 0
        CHECK(kills >= 0),
      deaths INTEGER NOT NULL DEFAULT 0
        CHECK(deaths >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function recordPvpKill(attackerSub,victimSub) {
  if (
    !pvpPool ||
    !attackerSub ||
    !victimSub ||
    attackerSub === victimSub
  ) return;

  const db = await pvpPool.connect();

  try {
    await db.query('BEGIN');

    await db.query(`
      INSERT INTO jmc_pvp_stats(
        google_sub,kills,deaths
      )
      VALUES($1,1,0)
      ON CONFLICT(google_sub)
      DO UPDATE SET
        kills=jmc_pvp_stats.kills+1,
        updated_at=NOW()
    `,[attackerSub]);

    await db.query(`
      INSERT INTO jmc_pvp_stats(
        google_sub,kills,deaths
      )
      VALUES($1,0,1)
      ON CONFLICT(google_sub)
      DO UPDATE SET
        deaths=jmc_pvp_stats.deaths+1,
        updated_at=NOW()
    `,[victimSub]);

    await db.query('COMMIT');

  } catch(error) {
    await db.query('ROLLBACK').catch(()=>{});
    throw error;

  } finally {
    db.release();
  }
}

async function sendPvpProfile(ws,requester,targetId) {
  const target = [...clients.values()].find(
    p => p.ready && p.id === targetId
  );

  if (!target) {
    send(ws,{
      type:'pvp_profile',
      error:'해당 이용자가 접속 중이지 않습니다.'
    });
    return;
  }

  if (!target.googleSub || !pvpPool) {
    send(ws,{
      type:'pvp_profile',
      targetId:target.id,
      displayName:target.name,
      animal:target.animal,
      registered:false,
      kills:0,
      deaths:0
    });
    return;
  }

  const result = await pvpPool.query(`
    SELECT kills,deaths
    FROM jmc_pvp_stats
    WHERE google_sub=$1
  `,[target.googleSub]);

  const stats = result.rows[0] || {
    kills:0,
    deaths:0
  };

  send(ws,{
    type:'pvp_profile',
    targetId:target.id,
    displayName:target.name,
    accountNickname:target.accountNickname,
    animal:target.animal,
    registered:true,
    kills:Number(stats.kills),
    deaths:Number(stats.deaths)
  });
}
const missileSystem = createMissileSystem({
  clients,
  send,
  broadcast,
  raid,
  recordPvpKill,
  presence
});
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

  // ========================================
  // 접속자 0명일 때 고래 자동공격 중지
  // ========================================

  const hasActivePlayer = [...clients.values()].some(
    player => player.ready && player.hp > 0
  );

  // 이용자가 아무도 없으면 공격 대기 상태
  if (!hasActivePlayer) {
    tailRaidId = null;
    nextTailAttackAt = 0;
    warnedTailAttackAt = 0;
    return;
  }

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
// 고래 공격 상태를 0.2초마다 확인
// 기존 0.05초 대비 검사 횟수 75% 감소
setInterval(updateBossTailAttack, 200).unref();

// ========================================
// WebSocket 멀티플레이 서버
// ========================================

wss.on('connection', async (ws, req) => {

  // 관리자가 차단한 IP는 재입장 제한
  if (isBlocked(req)) {
    ws.close(4003, 'Temporarily blocked');
    return;
  }

  // 서버 세션 쿠키에서 로그인 확인:
  // 브라우저가 보낸 계정 ID를 신뢰하지 않는다.
  let googleUser = null;

  try {
    googleUser = await googleAuth.getUser(req);
  } catch (error) {
    console.error('[JMC AUTH] WebSocket session:', error);
  }

  if (ws.readyState !== WebSocket.OPEN) return;

  const p = {
    googleSub: googleUser?.sub || null,
    googleName: googleUser?.name || null,
    accountNickname: googleUser?.accountNickname || null,
    accountAnimal: googleUser?.accountAnimal || null,
    clientIP: getClientIP(req),
    joinedAt: Date.now(),

    id: crypto.randomUUID(),

    name: '',
    animal: 'seal',
    inventoryHash: null,

    // 브라우저가 최초 접속할 때 쿠키에 저장한 익명 식별값
    cookieInventoryHash: (() => {
      const token = inventoryTokenFromCookie(req);
      return token ? hashInventoryToken(token) : null;
    })(),

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

      // Google 계정은 고정 프로필 등록 후 입장
      if (p.googleSub && !p.accountNickname) {
        send(ws, {
          type: 'account_profile_required',
          message:
            '먼저 Google 계정 닉네임과 대표 캐릭터를 등록해 주세요.'
        });
        return;
      }

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

      const firstJoin = !p.ready;

      if (firstJoin) {
        const token =
          typeof m.inventoryToken === 'string'
            ? m.inventoryToken.toLowerCase()
            : '';

        p.inventoryHash = p.googleSub
          ? googleAuth.ownerHash(p.googleSub)
          : (INVENTORY_TOKEN_PATTERN.test(token)
              ? hashInventoryToken(token)
              : p.cookieInventoryHash);

        if (!p.inventoryHash) {
          send(ws, {
            type: 'raid_notice',
            message:
              '아이템 저장 식별값이 없습니다. 새로고침 후 다시 입장해 주세요.'
          });
        }
      }

      p.ready = true;
if (firstJoin) {
  missileSystem.join(ws, p);
} else {
  missileSystem.state(ws, p);
}
      if (firstJoin) {
        void visitorStats.record(m.visitorId);
      }

      void raid.inventory.sendSnapshot(ws, p);

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
    if (missileSystem.handle(ws, p, m)) {
  return;
}
// ========================================
// 캐릭터 클릭 시 PVP 전적 조회
// ========================================

if (m.type === 'pvp_profile_request') {
  if (
    typeof m.targetId !== 'string' ||
    m.targetId.length > 100
  ) return;

  void sendPvpProfile(ws,p,m.targetId)
    .catch(error => {
      console.error(
        '[JMC] PVP 전적 조회 오류:',
        error
      );

      send(ws,{
        type:'pvp_profile',
        error:'전적을 불러오지 못했습니다.'
      });
    });

  return;
}
    // ====================================
    // 고래 광역공격 회피용 점프 판정
    // ====================================

    if (m.type === 'jump') {
      const now = Date.now();

      // 앉은 상태에서는 점프 불가
      // 점프 연타로 회피 판정을 조작하지 않도록 제한
      if (
        p.hp > 0 &&
        !p.seated &&
        now - p.lastJumpAt >= 850
      ) {
        p.lastJumpAt = now;
      }

      return;
    }

    // ====================================
    // 고래의 비늘 선착순 획득
    // ====================================

    if (m.type === 'loot_pickup') {
      // 서버에서 지급 판정 및 영구 저장을 완료한 뒤
      // 현재 인벤토리를 다시 보내 즉시 갱신한다.
      void (async () => {
        try {
          await raid.pickup(ws, p);

          if (p.ready && ws.readyState === WebSocket.OPEN) {
            await raid.inventory.sendSnapshot(ws, p);
          }

        } catch (error) {
          console.error(
            '[JMC] 보스 보상 수령 오류:',
            error
          );

          send(ws, {
            type: 'raid_notice',
            message:
              '아이템 처리에 실패했습니다. 다시 시도해 주세요.'
          });
        }
      })();

      return;
    }

    // ====================================
    // 고래의 비늘 5개 조합
    // ====================================

    if (m.type === 'inventory_craft') {
      if (!p.googleSub) {
        send(ws, {
          type: 'inventory_notice',
          message:
            '행운의 선물 교환 신청은 Google 로그인 후 가능합니다.'
        });
        return;
      }

      void (async () => {
        try {
          await raid.inventory.craft(ws, p);

          if (p.ready && ws.readyState === WebSocket.OPEN) {
            await raid.inventory.sendSnapshot(ws, p);
          }

        } catch (error) {
          console.error(
            '[JMC] 아이템 제작 오류:',
            error
          );

          send(ws, {
            type: 'raid_notice',
            message:
              '아이템 제작에 실패했습니다. 다시 시도해 주세요.'
          });
        }
      })();

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
      const seconds = Math.max(
        .08,
        Math.min(
          1,
          (now - (p.lastMove || p.joinedAt)) / 1000
        )
      );

      const maxStep = 6.5 * seconds + .4;

      if (
        Math.hypot(x - p.x, z - p.z) > maxStep
      ) {
        send(ws, {
          type: 'position_correct',
          x: p.x,
          y: p.y,
          z: p.z
        });

        p.lastMove = now;
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

    const bossPoint = raid.collision(
      shot,
      startX,
      startZ,
      endX,
      endZ
    );

    if (
      bossPoint &&
      (!nearest || bossPoint.t < nearest.t)
    ) {
      magicShots.splice(i, 1);
      raid.hit(shot, bossPoint);
      continue;
    }

    if (!nearest) {
      shot.x = endX;
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

  // Google 계정 이용자끼리의 PVP 사망만 기록
  if (
    shot.owner.googleSub &&
    target.googleSub &&
    shot.owner.googleSub !== target.googleSub
  ) {
    void recordPvpKill(
      shot.owner.googleSub,
      target.googleSub
    ).catch(error => {
      console.error(
        '[JMC] PVP 전적 저장 실패:',
        error
      );
    });
  }

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
