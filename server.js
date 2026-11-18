import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

const app = express();
app.use(express.static('public'));
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const ANIMALS = ['seal','cat','dog','rabbit','fox','panda','bear','penguin','frog','hamster','lion','tiger','koala','raccoon','deer'];
const clients = new Map();
const votes = { long: 0, short: 0 };
const history = [];
const priceCache = new Map();
const candleCache = new Map();
const clean = (value, max=180) => String(value ?? '').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,max);
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const broadcast = data => { for (const ws of clients.keys()) send(ws,data); };
function presence() {
  const players = [...clients.values()].filter(p => p.ready).map(({id,name,animal,x,z,direction}) => ({id,name,animal,x,z,direction}));
  broadcast({type:'presence',count:players.length,players});
}
wss.on('connection', ws => {
  const p = {id:crypto.randomUUID(),name:'',animal:'seal',x:0,z:-8,direction:Math.PI,ready:false,vote:null,lastChat:0,lastMove:0};
  clients.set(ws,p);
  send(ws,{type:'welcome',id:p.id,votes:{...votes},history});
  presence();
  ws.on('message',raw => {
    if (raw.length > 2048) return;
    let m; try { m=JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'join') {
      const name=clean(m.name,16); if (!name) return;
      p.name=name; p.animal=ANIMALS.includes(m.animal)?m.animal:'seal'; p.ready=true;
      presence(); return;
    }
    if (!p.ready) return;
    if (m.type === 'move') {
      const now=Date.now(); if(now-p.lastMove<80)return;
      const x=Number(m.x),z=Number(m.z),direction=Number(m.direction);
      if(!Number.isFinite(x)||!Number.isFinite(z))return;
      p.x=Math.max(-18,Math.min(18,x)); p.z=Math.max(-18,Math.min(18,z));
      if(Number.isFinite(direction))p.direction=Math.atan2(Math.sin(direction),Math.cos(direction));
      p.lastMove=now; presence(); return;
    }
    if (m.type === 'chat') {
      const now=Date.now(); if(now-p.lastChat<700)return;
      const message=clean(m.message); if(!message)return;
      p.lastChat=now; const item={name:p.name,animal:p.animal,message,time:now};
      history.push(item); if(history.length>40)history.shift();
      broadcast({type:'chat',item}); return;
    }
    if (m.type === 'vote') {
      if(!['long','short'].includes(m.side)||p.vote===m.side)return;
      if(p.vote)votes[p.vote]=Math.max(0,votes[p.vote]-1);
      p.vote=m.side;votes[p.vote]++;
      broadcast({type:'votes',votes:{...votes}});
    }
  });
  ws.on('close',()=>{
    if(p.vote){votes[p.vote]=Math.max(0,votes[p.vote]-1);broadcast({type:'votes',votes:{...votes}});}
    clients.delete(ws);presence();
  });
  ws.on('error',err=>console.error('WebSocket:',err.message));
});
async function cached(cache,key,ttl,loader){
  const old=cache.get(key);if(old&&Date.now()-old.time<ttl)return old.data;
  const data=await loader();cache.set(key,{time:Date.now(),data});return data;
}
app.get('/api/price/:symbol',async(req,res)=>{
  const symbol=req.params.symbol.toUpperCase();
  if(!SYMBOLS.includes(symbol))return res.status(404).json({error:'Unknown symbol'});
  try {
    const data=await cached(priceCache,symbol,10000,async()=>{
      const response=await fetch(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,{signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw Error('Price unavailable');
      const json=await response.json();const price=Number(json?.data?.amount);
      if(!Number.isFinite(price))throw Error('Invalid price');return {price};
    });
    res.set('Cache-Control','no-store').json(data);
  }catch(e){console.error(symbol,e.message);res.status(502).json({error:'Price unavailable'});}
});
app.get('/api/candles/:symbol',async(req,res)=>{
  const symbol=req.params.symbol.toUpperCase(),granularity=Number(req.query.granularity);
  const requested=Number(req.query.limit),limit=Number.isFinite(requested)?Math.max(2,Math.min(300,Math.floor(requested))):96;
  if(!SYMBOLS.includes(symbol)||![60,900,3600].includes(granularity))return res.status(400).json({error:'Invalid request'});
  const key=`${symbol}:${granularity}:${limit}`;
  try {
    const data=await cached(candleCache,key,45000,async()=>{
      const end=Date.now(),start=end-granularity*limit*1000;
      const url=new URL(`https://api.exchange.coinbase.com/products/${symbol}-USD/candles`);
      url.searchParams.set('start',new Date(start).toISOString());
      url.searchParams.set('end',new Date(end).toISOString());
      url.searchParams.set('granularity',String(granularity));
      const response=await fetch(url,{headers:{'User-Agent':'JMC-Invest-Lounge/1.0'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Candles unavailable');
      const raw=await response.json();if(!Array.isArray(raw))throw Error('Invalid candle response');
      const candles=raw.filter(a=>Array.isArray(a)&&a.length>=5).map(a=>({time:Number(a[0]),low:Number(a[1]),high:Number(a[2]),open:Number(a[3]),close:Number(a[4])})).filter(c=>Object.values(c).every(Number.isFinite)).sort((a,b)=>a.time-b.time).slice(-limit);
      if(!candles.length)throw Error('Empty candle data');return {candles};
    });
    res.set('Cache-Control','public, max-age=30').json(data);
  }catch(e){console.error(symbol,e.message);res.status(502).json({error:'Candles unavailable'});}
});
app.get('/api/health',(_req,res)=>res.json({ok:true,online:[...clients.values()].filter(p=>p.ready).length}));
const port=Number(process.env.PORT)||3000;
server.listen(port,'0.0.0.0',()=>console.log(`JMC Lounge listening on ${port}`));
