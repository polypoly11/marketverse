
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

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

const votes = {
  long: 0,
  short: 0
};

const history = [];

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

// 자정 경과 후 최대 1초 내 초기화
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
      seated
    }) => ({
      id,
      name,
      animal,
      x,
      y,
      z,
      direction,
      seated
    }));

  broadcast({
    type: 'presence',
    count: players.length,
    players
  });
}

// ========================================
// WebSocket 멀티플레이 서버
// ========================================

wss.on('connection', (ws, req) => {

  const p = {
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

    // 마법 연속 공격 간격 관리
    lastMagic: 0
  };

  clients.set(ws, p);

  resetChatAtKoreanMidnight();

  send(ws, {
    type: 'welcome',
    id: p.id,
    votes: {...votes},
    history
  });

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

      const name = clean(m.name, 16);

      if (!name) {
        return;
      }

      p.name = name;

      p.animal = ANIMALS.includes(m.animal)
        ? m.animal
        : 'seal';

      p.ready = true;

      presence();

      return;
    }

    if (!p.ready) {
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
    // 신규 기능: 실시간 마법 공격 동기화
    // ====================================

    if (m.type === 'magic') {

      const now = Date.now();

      // 공격 간격 제한
      // A키를 누르고 있으면 약 0.2초마다 발사
      if (now - p.lastMagic < 180) {
        return;
      }

      p.lastMagic = now;

      // 서버에 저장된 캐릭터 위치와 방향 사용
      // 클라이언트가 임의의 공격자 ID를 지정할 수 없음

      const magicEvent = {

        type: 'magic',

        senderId: p.id,

        animal: p.animal,

        x: p.x,
        y: p.y,
        z: p.z,

        direction: p.direction,

        time: now
      };

      // 다른 모든 이용자에게 공격 전달
      // 공격한 본인은 이미 자신의 화면에서
      // 마법탄을 표시하므로 중복 전송하지 않음

      for (const otherWs of clients.keys()) {

        if (otherWs !== ws) {

          send(
            otherWs,
            magicEvent
          );
        }
      }

      return;
    }

    // ====================================
    // 실시간 채팅
    // ====================================

    if (m.type === 'chat') {

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

    res.set('Cache-Control', 'no-store').json(data);

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

  const key = `${symbol}:${granularity}:${limit}`;

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
            Object.values(c).every(Number.isFinite)
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
