
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Map();
const votes = { long: 0, short: 0 };
const history = [];

const clean = s => String(s ?? '')
  .replace(/[<>]/g, '')
  .trim()
  .slice(0, 180);

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function presence() {
  broadcast({
    type: 'presence',
    count: clients.size,
    players: [...clients.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, z: p.z
    }))
  });
}

wss.on('connection', ws => {
  const id = crypto.randomUUID();
  const player = {
    id,
    name: '방문자-' + id.slice(0, 4),
    x: 0,
    z: 0,
    lastChat: 0
  };

  clients.set(ws, player);
  ws.send(JSON.stringify({ type: 'welcome', id, votes, history }));
  presence();

  ws.on('message', raw => {
    if (raw.length > 2048) return;

    let m;
    try { m = JSON.parse(raw); }
    catch { return; }

    if (m.type === 'join') {
      player.name = clean(m.name).slice(0, 16) || player.name;
      presence();
    }

    if (m.type === 'move') {
      const x = Number(m.x), z = Number(m.z);
      if (Number.isFinite(x) && Number.isFinite(z)) {
        player.x = Math.max(-19, Math.min(19, x));
        player.z = Math.max(-19, Math.min(19, z));
        presence();
      }
    }

    if (m.type === 'chat') {
      if (Date.now() - player.lastChat < 1200) return;
      player.lastChat = Date.now();

      const message = clean(m.message);
      if (!message) return;

      const item = {
        name: player.name,
        message,
        time: Date.now()
      };
      history.push(item);
      if (history.length > 40) history.shift();
      broadcast({ type: 'chat', item });
    }

    if (m.type === 'vote' && ['long', 'short'].includes(m.side)) {
      if (player.vote) votes[player.vote]--;
      player.vote = m.side;
      votes[m.side]++;
      broadcast({ type: 'votes', votes });
    }
  });

  ws.on('close', () => {
    if (player.vote) votes[player.vote]--;
    clients.delete(ws);
    broadcast({ type: 'votes', votes });
    presence();
  });
});

// 실시간 가격: Coinbase
app.get('/api/price/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!['BTC', 'ETH', 'SOL', 'XRP'].includes(symbol)) {
    return res.sendStatus(404);
  }

  try {
    const response = await fetch(
      `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,
      { signal: AbortSignal.timeout(9000) }
    );
    if (!response.ok) throw Error('Price API error');

    const data = await response.json();
    res.set('Cache-Control', 'no-store').json({
      price: data.data.amount
    });
  } catch {
    res.status(502).json({ error: 'Price provider unavailable' });
  }
});

// 캔들 차트: Coinbase OHLC
app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const granularity = Number(req.query.granularity);
  const limit = Math.min(300, Math.max(2, Number(req.query.limit) || 96));

  if (
    !['BTC', 'ETH', 'SOL', 'XRP'].includes(symbol) ||
    ![60, 900, 3600].includes(granularity)
  ) {
    return res.sendStatus(400);
  }

  const end = Date.now();
  const start = end - granularity * limit * 1000;

  try {
    const url = new URL(
      `https://api.exchange.coinbase.com/products/${symbol}-USD/candles`
    );
    url.searchParams.set('granularity', String(granularity));
    url.searchParams.set('start', new Date(start).toISOString());
    url.searchParams.set('end', new Date(end).toISOString());

    const response = await fetch(url, {
      headers: { 'User-Agent': 'JMC-Invest-Lounge/1.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw Error('Candle API error');
    const raw = await response.json();

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
        [c.time, c.open, c.high, c.low, c.close]
          .every(Number.isFinite)
      )
      .sort((a, b) => a.time - b.time)
      .slice(-limit);

    if (!candles.length) throw Error('Empty candles');

    res.set('Cache-Control', 'public, max-age=45')
      .json({ candles });
  } catch (error) {
    console.error('Candle error:', symbol, error.message);
    res.status(502).json({ error: 'Chart provider unavailable' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, online: clients.size });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
