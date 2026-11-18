import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'12kb'}));
const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID||'';
const ADMIN_EMAILS=(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const SESSION_SECRET=process.env.SESSION_SECRET||'';
const google=new OAuth2Client(GOOGLE_CLIENT_ID);
const sessions=new Map();
const bans=new Map();
const notices=[];
const audit=[];
function logAction(action,detail,email){audit.unshift({time:Date.now(),action,detail,email});if(audit.length>100)audit.pop();}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));}
function cookie(name,value,maxAge,req){const secure=req.secure||req.headers['x-forwarded-proto']==='https';return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;}
function guestId(req,res){let id=cookies(req).jmc_guest;if(!/^[a-f0-9]{32}$/.test(id||'')){id=crypto.randomBytes(16).toString('hex');res.append('Set-Cookie',cookie('jmc_guest',id,60*60*24*365,req));}return id;}
function adminSession(req){const id=cookies(req).jmc_admin;const sess=id&&sessions.get(id);if(!sess)return null;if(sess.expires<Date.now()){sessions.delete(id);return null;}return sess;}
function requireAdmin(req,res,next){const sess=adminSession(req);if(!sess)return res.status(401).json({error:'관리자 로그인이 필요합니다.'});req.admin=sess;next();}
function sameOrigin(req,res,next){const origin=req.headers.origin;const host=req.headers.host;if(!origin||!host){return res.status(403).json({error:'요청 출처를 확인할 수 없습니다.'});}try{if(new URL(origin).host!==host)return res.status(403).json({error:'잘못된 요청 출처입니다.'});}catch{return res.status(403).json({error:'잘못된 요청 출처입니다.'});}next();}
app.get('/api/admin/config',(_req,res)=>res.json({clientId:GOOGLE_CLIENT_ID,configured:Boolean(GOOGLE_CLIENT_ID&&ADMIN_EMAILS.length&&SESSION_SECRET)}));
app.post('/api/admin/login',sameOrigin,async(req,res)=>{
 if(!GOOGLE_CLIENT_ID||!ADMIN_EMAILS.length||SESSION_SECRET.length<32)return res.status(503).json({error:'서버의 Google 관리자 환경변수를 설정하세요.'});
 try{
  const credential=String(req.body?.credential||'');if(credential.length>10000)return res.status(400).json({error:'잘못된 인증 정보'});
  const ticket=await google.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID});
  const user=ticket.getPayload();const email=String(user.email||'').toLowerCase();
  if(!user.email_verified||!ADMIN_EMAILS.includes(email))return res.status(403).json({error:'관리자로 등록된 Google 계정이 아닙니다.'});
  const sid=crypto.randomBytes(32).toString('hex');sessions.set(sid,{email,expires:Date.now()+8*60*60*1000});
  res.append('Set-Cookie',cookie('jmc_admin',sid,8*60*60,req));logAction('login','Google 로그인',email);res.json({ok:true,email});
 }catch(e){res.status(401).json({error:'Google 인증에 실패했습니다.'});}
});
app.get('/api/admin/me',requireAdmin,(req,res)=>res.json({email:req.admin.email}));
app.post('/api/admin/logout',sameOrigin,requireAdmin,(req,res)=>{const sid=cookies(req).jmc_admin;sessions.delete(sid);res.append('Set-Cookie',cookie('jmc_admin','',0,req));res.json({ok:true});});
app.use('/api/admin', (req,res,next)=>{if(req.method!=='GET')return sameOrigin(req,res,next);next();},requireAdmin);
app.get('/api/admin/state',(req,res)=>res.json({players:[...clients.values()].filter(p=>p.ready).map(p=>({id:p.id,name:p.name,animal:p.animal,joinedAt:p.joinedAt})),messages:history,notices,audit:audit.slice(0,40)}));
app.delete('/api/admin/messages/:id',(req,res)=>{const i=history.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'메시지가 없습니다.'});history.splice(i,1);broadcast({type:'chat_deleted',id:req.params.id});logAction('delete_chat',req.params.id,req.admin.email);res.json({ok:true});});
app.post('/api/admin/users/:id/kick',(req,res)=>{const entry=[...clients.entries()].find(([,p])=>p.id===req.params.id&&p.ready);if(!entry)return res.status(404).json({error:'접속자가 없습니다.'});const [ws,player]=entry;send(ws,{type:'moderation',message:'관리자에 의해 퇴장 처리되었습니다.'});ws.close(4001,'Kicked');logAction('kick',player.name,req.admin.email);res.json({ok:true});});
app.post('/api/admin/users/:id/ban',(req,res)=>{const entry=[...clients.entries()].find(([,p])=>p.id===req.params.id&&p.ready);if(!entry)return res.status(404).json({error:'접속자가 없습니다.'});const [ws,player]=entry;bans.set(player.guestId,Date.now()+60*60*1000);send(ws,{type:'moderation',message:'관리자에 의해 1시간 동안 접속이 제한되었습니다.'});ws.close(4003,'Temporarily banned');logAction('ban_1h',player.name,req.admin.email);res.json({ok:true});});
app.post('/api/admin/notices',(req,res)=>{const text=clean(req.body?.text,500);if(!text)return res.status(400).json({error:'공지 내용을 입력하세요.'});const item={id:crypto.randomUUID(),text,time:Date.now()};notices.unshift(item);if(notices.length>30)notices.pop();broadcast({type:'notices',notices});logAction('notice_create',item.id,req.admin.email);res.json({ok:true,item});});
app.delete('/api/admin/notices/:id',(req,res)=>{const i=notices.findIndex(n=>n.id===req.params.id);if(i<0)return res.status(404).json({error:'공지가 없습니다.'});notices.splice(i,1);broadcast({type:'notices',notices});logAction('notice_delete',req.params.id,req.admin.email);res.json({ok:true});});
app.get('/api/notices',(_req,res)=>res.json({notices}));
app.use((req,res,next)=>{if(req.path==='/'||req.path==='/index.html')guestId(req,res);next();});
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
  const players = [...clients.values()].filter(p => p.ready).map(({id,name,animal,x,y,z,direction,seated}) => ({id,name,animal,x,y,z,direction,seated}));
  broadcast({type:'presence',count:players.length,players});
}
wss.on('connection', (ws,req) => {
  const guest=cookies(req).jmc_guest||'';
  if(!/^[a-f0-9]{32}$/.test(guest)){send(ws,{type:'moderation',message:'새로고침 후 다시 입장해주세요.'});ws.close(4002,'Missing guest cookie');return;}
  if((bans.get(guest)||0)>Date.now()){send(ws,{type:'moderation',message:'관리자에 의해 일시적으로 접속이 제한되었습니다.'});ws.close(4003,'Banned');return;}

  const p = {guestId:guest,joinedAt:Date.now(),id:crypto.randomUUID(),name:'',animal:'seal',x:0,y:0,z:-8,direction:Math.PI,seated:false,ready:false,vote:null,lastChat:0,lastMove:0};
  clients.set(ws,p);
  send(ws,{type:'welcome',id:p.id,votes:{...votes},history,notices});
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
      if(Number.isFinite(Number(m.y)))p.y=Math.max(0,Math.min(2.5,Number(m.y)));
      p.seated=m.seated===true;
      if(Number.isFinite(direction))p.direction=Math.atan2(Math.sin(direction),Math.cos(direction));
      p.lastMove=now; presence(); return;
    }
    if (m.type === 'chat') {
      const now=Date.now(); if(now-p.lastChat<700)return;
      const message=clean(m.message); if(!message)return;
      p.lastChat=now; const item={id:crypto.randomUUID(),senderId:p.id,name:p.name,animal:p.animal,message,time:now};
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
