import { installArena } from './arena.js';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
const app=express();app.use(express.json({limit:'16kb'}));app.use(express.static('public'));
// Licensed market-data adapters must push normalized updates to this server.
// No sample or delayed prices are represented as real-time.
const licensedSymbols=new Set(['005930','000660','KOSPI','NDX']);
const quotes=new Map();
const dataKey=process.env.MARKET_DATA_INGEST_KEY;
app.post('/api/market/ingest',(req,res)=>{
  if(!dataKey)return res.status(503).json({error:'Set MARKET_DATA_INGEST_KEY first'});
  if(req.get('x-market-data-key')!==dataKey)return res.status(401).json({error:'Unauthorized'});
  const {symbol,price,timestamp,source}=req.body||{};
  if(!licensedSymbols.has(symbol)||typeof price!=='number'||!Number.isFinite(price)||price<=0||typeof source!=='string'||!source.trim())return res.status(400).json({error:'Invalid quote'});
  const t=Date.parse(timestamp);
  if(!Number.isFinite(t)||Math.abs(Date.now()-t)>120000)return res.status(400).json({error:'Timestamp must be within 2 minutes of server time'});
  const quote={symbol,price,timestamp:new Date(t).toISOString(),source:source.slice(0,80)};
  quotes.set(symbol,quote);broadcast({type:'market-quote',quote});res.json({ok:true});
});
app.get('/api/market/status',(_req,res)=>res.json({licensedProviderConnected:quotes.size>0,quotes:[...quotes.values()],note:'Quotes are accepted only from a separately licensed provider adapter.'}));
const server=createServer(app);const wss=new WebSocketServer({server,path:'/ws'});
const clients=new Map();const votes={long:0,short:0};const history=[];
const clean=s=>String(s??'').replace(/[<>]/g,'').trim().slice(0,180);
function broadcast(obj){const s=JSON.stringify(obj);for(const ws of clients.keys())if(ws.readyState===WebSocket.OPEN)ws.send(s)}
function presence(){broadcast({type:'presence',count:clients.size,players:[...clients.values()].map(x=>({id:x.id,name:x.name,x:x.x,z:x.z,avatar:x.avatar||"human"}))})}
wss.on('connection',(ws)=>{const id=crypto.randomUUID();const player={id,name:'방문자-'+id.slice(0,4),x:0,z:0,avatar:'human',lastChat:0};clients.set(ws,player);ws.send(JSON.stringify({type:'welcome',id,votes,history,quotes:[...quotes.values()]}));presence();ws.on('message',raw=>{if(raw.length>2048)return;let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){player.name=clean(m.name).slice(0,16)||player.name;presence()}if(m.type==='avatar'&&['human','seal'].includes(m.avatar)){player.avatar=m.avatar;presence()}if(m.type==='move'){const x=Number(m.x),z=Number(m.z);if(Number.isFinite(x)&&Number.isFinite(z)){player.x=Math.max(-19,Math.min(19,x));player.z=Math.max(-19,Math.min(19,z));presence()}}if(m.type==='chat'){if(Date.now()-player.lastChat<1200)return;player.lastChat=Date.now();const message=clean(m.message);if(!message)return;const item={id:player.id,name:player.name,message,time:Date.now()};history.push(item);if(history.length>40)history.shift();broadcast({type:'chat',item})}if(m.type==='vote'&&['long','short'].includes(m.side)){if(player.vote)votes[player.vote]--;player.vote=m.side;votes[m.side]++;broadcast({type:'votes',votes})}});ws.on('close',()=>{if(player.vote)votes[player.vote]--;clients.delete(ws);broadcast({type:'votes',votes});presence()})});
installArena(app,wss,clients,broadcast);
app.get('/api/health',(_req,res)=>res.json({ok:true,online:clients.size}));
const port=Number(process.env.PORT)||3000;server.listen(port,()=>console.log(`http://localhost:${port}`));
