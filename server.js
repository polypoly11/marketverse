
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

const START = { x: 0, z: -8, direction: 0 };
const clients = new Map();
const votes = { long: 0, short: 0 };
const history = [];
const priceCache = new Map();
const candleCache = new Map();

function clean(value, max = 180) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, max);
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  for (const ws of clients.keys()) {
    send(ws, data);
  }
}

function presence() {
  const players = [...clients.values()]
    .filter(p => p.ready)
    .map(p => ({
      id: p.id,
      name: p.name,
      animal: p.animal,
      x: p.x,
      z: p.z,
      direction: p.direction
    }));

  broadcast({
    type: 'presence',
    count: players.length,
    players
  });
}

wss.on('connection', ws => {
  const player = {
    id: crypto.randomUUID(),
    name: '',
    animal: 'seal',
    x: START.x,
    z: START.z,
    direction: START.direction,
    ready: false,
    vote: null,
    lastChat: 0,
    lastMove: 0
  };

  clients.set(ws, player);

  send(ws, {
    type: 'welcome',
    id: player.id,
    votes: { ...votes },
    history
  });

  presence();

  ws.on('message', raw => {
    if (raw.length > 2048) return;

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'join') {
      const name = clean(message.name, 16);
      if (!name) return;

      player.name = name;
      player.animal = ANIMALS.includes(message.animal)
        ? message.animal
        : 'seal';

      player.ready = true;
      presence();
      return;
    }

    if (!player.ready) return;

    if (message.type === 'move') {
      const now = Date.now();
      if (now - player.lastMove < 100) return;

      const x = Number(message.x);
      const z = Number(message.z);
      const direction = Number(message.direction);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(z)
      ) return;

      player.x = Math.max(-18, Math.min(18, x));
      player.z = Math.max(-18, Math.min(18, z));

      if (Number.isFinite(direction)) {
        player.direction = Math.atan2(
          Math.sin(direction),
          Math.cos(direction)
        );
      }

      player.lastMove = now;
      presence();
      return;
    }

    if (message.type === 'chat') {
      const now = Date.now();
      if (now - player.lastChat < 1000) return;

      const text = clean(message.message);
      if (!text) return;

      player.lastChat = now;

      const item = {
        name: player.name,
        animal: player.animal,
        message: text,
        time: now
      };

      history.push(item);
      if (history.length > 40) history.shift();

      broadcast({ type: 'chat', item });
      return;
    }

    if (message.type === 'vote') {
      if (!['long', 'short'].includes(message.side)) return;
      if (player.vote === message.side) return;

      if (player.vote) {
        votes[player.vote] = Math.max(
          0,
          votes[player.vote] - 1
        );
      }

      player.vote = message.side;
      votes[message.side]++;

      broadcast({
        type: 'votes',
        votes: { ...votes }
      });
    }
  });

  ws.on('close', () => {
    if (player.vote) {
      votes[player.vote] = Math.max(
        0,
        votes[player.vote] - 1
      );

      broadcast({
        type: 'votes',
        votes: { ...votes }
      });
    }

    clients.delete(ws);
    presence();
  });

  ws.on('error', error => {
    console.error('WebSocket:', error.message);
  });
});

async function cached(cache, key, ttl, loader) {
  const existing = cache.get(key);

  if (existing && Date.now() - existing.time < ttl) {
    return existing.data;
  }

  const data = await loader();

  cache.set(key, {
    time: Date.now(),
    data
  });

  return data;
}

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
          throw new Error('Price unavailable');
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
    console.error(symbol, error.message);

    res.status(502).json({
      error: 'Price unavailable'
    });
  }
});

app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const granularity = Number(req.query.granularity);
  const requestedLimit = Number(req.query.limit);

  const limit = Number.isFinite(requestedLimit)
    ? Math.max(
        2,
        Math.min(300, Math.floor(requestedLimit))
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

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'JMC-Invest-Lounge/1.0'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          throw new Error('Candles unavailable');
        }

        const raw = await response.json();

        if (!Array.isArray(raw)) {
          throw new Error('Invalid candle response');
        }

        const candles = raw
          .filter(a =>
            Array.isArray(a) && a.length >= 5
          )
          .map(a => ({
            time: Number(a[0]),
            low: Number(a[1]),
            high: Number(a[2]),
            open: Number(a[3]),
            close: Number(a[4])
          }))
          .filter(c =>
            [
              c.time,
              c.low,
              c.high,
              c.open,
              c.close
            ].every(Number.isFinite)
          )
          .sort((a, b) => a.time - b.time)
          .slice(-limit);

        if (!candles.length) {
          throw new Error('Empty candle data');
        }

        return { candles };
      }
    );

    res
      .set('Cache-Control', 'public, max-age=30')
      .json(data);
  } catch (error) {
    console.error(symbol, error.message);

    res.status(502).json({
      error: 'Candles unavailable'
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
  console.log(`JMC Lounge listening on ${port}`);
});
