
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const ANIMALS = [
  'seal', 'cat', 'dog', 'rabbit', 'fox',
  'panda', 'bear', 'penguin', 'frog', 'hamster'
];

const clients = new Map();
const votes = { long: 0, short: 0 };
const history = [];
const candleCache = new Map();
const priceCache = new Map();

function clean(value, max = 180) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, max);
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function presence() {
  broadcast({
    type: 'presence',
    count: clients.size,
    players: [...clients.values()]
      .filter(p => p.ready)
      .map(p => ({
        id: p.id,
        name: p.name,
        animal: p.animal,
        x: p.x,
        z: p.z
      }))
  });
}

function currentVotes() {
  broadcast({ type: 'votes', votes });
}

wss.on('connection', ws => {
  const id = crypto.randomUUID();

  const player = {
    id,
    name: '',
    animal: 'seal',
    x: 0,
    z: 9,
    ready: false,
    vote: null,
    lastChat: 0,
    lastMove: 0
  };

  clients.set(ws, player);

  send(ws, {
    type: 'welcome',
    id,
    votes,
    history
  });

  presence();

  ws.on('message', raw => {
    if (raw.length > 2048) return;

    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (m.type === 'join') {
      const name = clean(m.name, 16);
      if (!name) return;

      player.name = name;
      player.animal = ANIMALS.includes(m.animal)
        ? m.animal : 'seal';
      player.ready = true;

      presence();
      return;
    }

    if (!player.ready) return;

    if (m.type === 'move') {
      if (Date.now() - player.lastMove < 100) return;

      const x = Number(m.x);
      const z = Number(m.z);

      if (!Number.isFinite(x) || !Number.isFinite(z)) return;

      player.x = Math.max(-18, Math.min(18, x));
      player.z = Math.max(-18, Math.min(18, z));
      player.lastMove = Date.now();

      presence();
      return;
    }

    if (m.type === 'chat') {
      if (Date.now() - player.lastChat < 1200) return;

      const message = clean(m.message);
      if (!message) return;

      player.lastChat = Date.now();

      const item = {
        name: player.name,
        animal: player.animal,
        message,
        time: Date.now()
      };

      history.push(item);
      if (history.length > 40) history.shift();

      broadcast({ type: 'chat', item });
      return;
    }

    if (m.type === 'vote') {
      if (!['long', 'short'].includes(m.side)) return;

      if (player.vote === m.side) return;

      if (player.vote) {
        votes[player.vote] = Math.max(
          0, votes[player.vote] - 1
        );
      }

      player.vote = m.side;
      votes[m.side]++;

      currentVotes();
    }
  });

  ws.on('close', () => {
    if (player.vote) {
      votes[player.vote] = Math.max(
        0, votes[player.vote] - 1
      );
      currentVotes();
    }

    clients.delete(ws);
    presence();
  });

  ws.on('error', error => {
    console.error('WebSocket:', error.message);
  });
});

async function cachedFetch(key, ttl, getData) {
  const now = Date.now();
  const existing = key.startsWith('price:')
    ? priceCache.get(key)
    : candleCache.get(key);

  if (existing && now - existing.time < ttl) {
    return existing.data;
  }

  const data = await getData();
  const cache = key.startsWith('price:')
    ? priceCache : candleCache;

  cache.set(key, { data, time: now });
  return data;
}

app.get('/api/price/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  if (!SYMBOLS.includes(symbol)) {
    return res.status(404).json({ error: 'Unknown symbol' });
  }

  try {
    const data = await cachedFetch(
      `price:${symbol}`,
      10000,
      async () => {
        const response = await fetch(
          `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,
          { signal: AbortSignal.timeout(9000) }
        );

        if (!response.ok) {
          throw new Error(`Price HTTP ${response.status}`);
        }

        const json = await response.json();
        const price = Number(json?.data?.amount);

        if (!Number.isFinite(price)) {
          throw new Error('Invalid price');
        }

        return { price };
      }
    );

    res.set('Cache-Control', 'no-store').json(data);
  } catch (error) {
    console.error('Price:', symbol, error.message);
    res.status(502).json({
      error: 'Price provider unavailable'
    });
  }
});

app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const granularity = Number(req.query.granularity);
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(300, Math.max(2, Math.floor(requestedLimit)))
    : 96;

  if (
    !SYMBOLS.includes(symbol) ||
    ![60, 900, 3600].includes(granularity)
  ) {
    return res.status(400).json({
      error: 'Invalid candle request'
    });
  }

  const key = `candles:${symbol}:${granularity}:${limit}`;

  try {
    const data = await cachedFetch(key, 45000, async () => {
      const end = Date.now();
      const start = end - granularity * limit * 1000;

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

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'JMC-Invest-Lounge/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Candle HTTP ${response.status}`);
      }

      const raw = await response.json();

      if (!Array.isArray(raw)) {
        throw new Error('Invalid candle response');
      }

      const candles = raw
        .filter(a => Array.isArray(a) && a.length >= 5)
        .map(a => ({
          time: Number(a[0]),
          low: Number(a[1]),
          high: Number(a[2]),
          open: Number(a[3]),
          close: Number(a[4])
        }))
        .filter(c =>
          [c.time, c.low, c.high, c.open, c.close]
            .every(Number.isFinite)
        )
        .sort((a, b) => a.time - b.time)
        .slice(-limit);

      if (!candles.length) {
        throw new Error('Empty candle data');
      }

      return { candles };
    });

    res.set('Cache-Control', 'public, max-age=30')
      .json(data);
  } catch (error) {
    console.error('Candles:', symbol, error.message);
    res.status(502).json({
      error: 'Chart provider unavailable'
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    online: clients.size
  });
});

const port = Number(process.env.PORT) || 3000;

server.listen(port, '0.0.0.0', () => {
  console.log(`JMC Lounge listening on port ${port}`);
});
