import crypto from 'node:crypto';
export function installArena(app, wss, clients, broadcast){
 const games=new Map(), challenges=new Map(); let prize={title:'이번 주 오목 우승',reward:'CU 모바일 상품권',status:'예정',updatedAt:Date.now()};
 const nick=id=>clients.get([...clients.keys()].find(ws=>clients.get(ws)?.id===id))?.name||'퇴장한 이용자';
 const send=(ws,obj)=>{if(ws.readyState===1)ws.send(JSON.stringify(obj))};
 const state=()=>({type:'arena-state',prize,challenges:[...challenges.values()],games:[...games.values()].map(g=>({...g,board:g.board}))});
 const publish=()=>broadcast(state());
 const clean=s=>String(s??'').replace(/[<>]/g,'').trim().slice(0,60);
 const winner=(b,x,y,c)=>{for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){let n=1;for(const sign of [-1,1]){let a=x+dx*sign,d=y+dy*sign;while(a>=0&&a<15&&d>=0&&d<15&&b[d][a]===c){n++;a+=dx*sign;d+=dy*sign}}if(n>=5)return true}return false};
 wss.on('connection',ws=>{setTimeout(()=>send(ws,state()),50);ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}const p=clients.get(ws);if(!p)return;
 if(m.type==='arena-challenge'){const to=String(m.to||'');if(to===p.id||![...clients.values()].some(v=>v.id===to))return;if([...games.values()].some(g=>g.status==='playing'&&g.players.includes(p.id)))return;const id=crypto.randomUUID();challenges.set(id,{id,from:p.id,fromName:p.name,to,toName:nick(to),createdAt:Date.now()});publish()}
 if(m.type==='arena-accept'){const c=challenges.get(m.id);if(!c||c.to!==p.id||Date.now()-c.createdAt>120000)return;if([...games.values()].some(g=>g.status==='playing'&&g.players.some(id=>[c.from,c.to].includes(id))))return;challenges.delete(c.id);const id=crypto.randomUUID();games.set(id,{id,players:[c.from,c.to],names:[nick(c.from),p.name],board:Array.from({length:15},()=>Array(15).fill(0)),turn:1,status:'playing',winner:null,moves:0,createdAt:Date.now()});publish()}
 if(m.type==='arena-decline'){const c=challenges.get(m.id);if(c&&(c.to===p.id||c.from===p.id)){challenges.delete(c.id);publish()}}
 if(m.type==='arena-move'){const g=games.get(m.id);const x=Number(m.x),y=Number(m.y);if(!g||g.status!=='playing'||!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>14||y<0||y>14||g.players[g.turn-1]!==p.id||g.board[y][x])return;g.board[y][x]=g.turn;g.moves++;if(winner(g.board,x,y,g.turn)){g.status='finished';g.winner=p.id}else if(g.moves===225){g.status='draw'}else g.turn=3-g.turn;publish()}
 if(m.type==='arena-resign'){const g=games.get(m.id);if(g&&g.status==='playing'&&g.players.includes(p.id)){g.status='finished';g.winner=g.players.find(id=>id!==p.id);publish()}}
 });ws.on('close',()=>{let changed=false;for(const [id,c] of challenges)if(c.from===clients.get(ws)?.id||c.to===clients.get(ws)?.id){challenges.delete(id);changed=true}if(changed)publish()})});
 app.post('/api/admin/prize',(req,res)=>{const key=process.env.ARENA_ADMIN_KEY;if(!key)return res.status(503).json({error:'ARENA_ADMIN_KEY 환경변수를 먼저 설정하세요'});const auth=req.get('x-admin-key')||'';if(auth.length!==key.length||!crypto.timingSafeEqual(Buffer.from(auth),Buffer.from(key)))return res.status(401).json({error:'권한 없음'});const title=clean(req.body?.title),reward=clean(req.body?.reward),status=clean(req.body?.status);if(!title||!reward||!['예정','진행 중','종료'].includes(status))return res.status(400).json({error:'입력값 확인'});prize={title,reward,status,updatedAt:Date.now()};publish();res.json({ok:true,prize})});
 app.get('/api/arena',(_req,res)=>res.json(state()));
}
