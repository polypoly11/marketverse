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
// Optional Twelve Data adapter. Enable only with public-display/redistribution rights.
// API keys remain server-side and are never sent to browsers.
const tdKey=process.env.TWELVE_DATA_API_KEY;
const tdSymbols={
  '005930':process.env.TD_SAMSUNG_SYMBOL,
  '000660':process.env.TD_HYNIX_SYMBOL,
  'KOSPI':process.env.TD_KOSPI_SYMBOL,
  'NDX':process.env.TD_NDX_SYMBOL
};
const tdInterval=Math.max(60000,Number(process.env.TD_POLL_MS)||60000);
let tdBusy=false;
async function pollTwelveData(){
  if(!tdKey||tdBusy)return;
  tdBusy=true;
  try{
    for(const [symbol,providerSymbol] of Object.entries(tdSymbols)){
      if(!providerSymbol)continue;
      try{
        const url=new URL('https://api.twelvedata.com/quote');
        url.searchParams.set('symbol',providerSymbol);
        url.searchParams.set('apikey',tdKey);
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('HTTP '+response.status);
        const body=await response.json();
        if(body.status==='error'||body.code)throw Error(body.message||'Provider error');
        const price=Number(body.close);
        if(!Number.isFinite(price)||price<=0)throw Error('No valid quote');
        // A quote may be the previous close. Preserve the provider's market timestamp.
        const rawTime=body.datetime||body.timestamp;
        let quoteTime=null;
        if(typeof rawTime==='number')quoteTime=new Date(rawTime*1000);
        else if(typeof rawTime==='string'){
          // Date-only or exchange-local timestamps cannot be assumed to be UTC.
          // Date-only values are labeled as closing data in the client.
          const dateString=rawTime.length===10?rawTime+'T00:00:00Z':rawTime;
          quoteTime=new Date(dateString);
        }
        if(!quoteTime||!Number.isFinite(quoteTime.getTime()))throw Error('Missing timestamp');
        const quote={symbol,price,timestamp:quoteTime.toISOString(),source:'Twelve Data',delayed:true};
        quotes.set(symbol,quote);broadcast({type:'market-quote',quote});
      }catch(error){console.warn('Market quote unavailable:',symbol,error.message)}
    }
  }finally{tdBusy=false}
}
if(tdKey){pollTwelveData();setInterval(pollTwelveData,tdInterval)}
const server=createServer(app);const wss=new WebSocketServer({server,path:'/ws'});
const animalIds=new Set(["seal","lion","hamster","hedgehog","wolf","whale","cheetah","squid","panda","fox","bear","rabbit","cat","dog","penguin","frog","otter","koala","tiger","octopus"]);
const themeIds=new Set(["mint","pink","blue"]);
const clients=new Map();const votes={long:0,short:0};const history=[];
const clean=s=>String(s??'').replace(/[<>]/g,'').trim().slice(0,180);
function broadcast(obj){const s=JSON.stringify(obj);for(const ws of clients.keys())if(ws.readyState===WebSocket.OPEN)ws.send(s)}
function presence(){broadcast({type:'presence',count:clients.size,players:[...clients.values()].map(x=>({id:x.id,name:x.name,x:x.x,z:x.z,avatar:x.avatar||"seal",theme:x.theme||"mint",heading:x.heading||0}))})}
wss.on('connection',(ws)=>{const id=crypto.randomUUID();const player={id,name:'방문자-'+id.slice(0,4),x:0,z:0,avatar:'seal',theme:'mint',heading:0,lastChat:0};clients.set(ws,player);ws.send(JSON.stringify({type:'welcome',id,votes,history,quotes:[...quotes.values()]}));presence();ws.on('message',raw=>{if(raw.length>2048)return;let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){player.name=clean(m.name).slice(0,16)||player.name;presence()}if(m.type==='avatar'&&animalIds.has(m.avatar)){player.avatar=m.avatar;player.theme=themeIds.has(m.theme)?m.theme:'mint';presence()}if(m.type==='move'){const x=Number(m.x),z=Number(m.z);if(Number.isFinite(x)&&Number.isFinite(z)){player.x=Math.max(-19,Math.min(19,x));player.z=Math.max(-19,Math.min(19,z));if(typeof m.heading==='number'&&Number.isFinite(m.heading))player.heading=Math.max(-Math.PI,Math.min(Math.PI,m.heading));presence()}}if(m.type==='chat'){if(Date.now()-player.lastChat<1200)return;player.lastChat=Date.now();const message=clean(m.message);if(!message)return;const item={id:player.id,name:player.name,message,time:Date.now()};history.push(item);if(history.length>40)history.shift();broadcast({type:'chat',item})}if(m.type==='vote'&&['long','short'].includes(m.side)){if(player.vote)votes[player.vote]--;player.vote=m.side;votes[m.side]++;broadcast({type:'votes',votes})}});ws.on('close',()=>{if(player.vote)votes[player.vote]--;clients.delete(ws);broadcast({type:'votes',votes});presence()})});
installArena(app,wss,clients,broadcast);
app.get('/api/health',(_req,res)=>res.json({ok:true,online:clients.size}));
const port=Number(process.env.PORT)||3000;server.listen(port,()=>console.log(`http://localhost:${port}`));
