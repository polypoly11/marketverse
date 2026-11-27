/* JMC free modeled liquidation levels chart – Swolecharts public API.
 * This is a model of major liquidation clusters, not actual open positions.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('jmc-liq-canvas');
  const coinSelect = $('jmc-liq-coin');
  const rangeSelect = $('jmc-liq-range');
  const refresh = $('jmc-liq-refresh');
  const status = $('jmc-liq-status');
  const meta = $('jmc-liq-meta');
  const detail = $('jmc-liq-detail');
  const source = $('jmc-liq-source');
  if (!canvas || !coinSelect || !rangeSelect || !refresh || !status || !meta) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let current = null;
  let nextAllowedAt = 0;
  let loading = false;
  let reqSerial = 0;
  const cache = new Map();
  const monetary = n => {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  };
  const number = n => Number(n).toLocaleString('en-US', {maximumFractionDigits: 0});
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function parseRows(list, side) {
    return (Array.isArray(list) ? list : []).map(item => ({
      lo: Number(item.lo), hi: Number(item.hi), mid: Number(item.mid),
      usd: Number(item.usd), cum: Number(item.cum), side
    })).filter(p => Number.isFinite(p.mid) && Number.isFinite(p.usd) && p.usd >= 0);
  }
  function normalize(raw) {
    if (!raw || raw.has_data === false || !raw.levels) throw Error('현재 제공 가능한 청산 구간이 없습니다.');
    const price = Number(raw.price);
    const long = parseRows(raw.levels.long, 'long').filter(p => p.mid < price).sort((a,b) => a.mid - b.mid);
    const short = parseRows(raw.levels.short, 'short').filter(p => p.mid > price).sort((a,b) => a.mid - b.mid);
    if (!Number.isFinite(price) || price <= 0 || (!long.length && !short.length)) throw Error('유효한 추정 청산 데이터가 없습니다.');
    return { price, long, short, all: [...long,...short], model: String(raw.model_version || ''), asOf:Number(raw.as_of) || 0 };
  }
  function draw() {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(250, bounds.width || 400);
    const height = Math.max(260, bounds.height || 360);
    const dpr = Math.min(2,window.devicePixelRatio || 1);
    const pxW = Math.round(width * dpr), pxH = Math.round(height * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) { canvas.width = pxW; canvas.height = pxH; }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle = '#090f19'; ctx.fillRect(0,0,width,height);
    const mobile = width < 520;
    const m = {l:mobile?51:68, r:mobile?12:55, t:29, b:49};
    const plotW = width-m.l-m.r, plotH = height-m.t-m.b;
    if (plotW < 20 || plotH < 20) return;
    ctx.font = (mobile?10:11)+'px Arial,sans-serif';
    const drawText = (s,x,y,color='#9badbf',align='left') => {
      ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);
    };
    if (!current) {
      drawText('청산맵 데이터 연결 대기',width/2,height/2,'#b4c4d4','center');
      return;
    }
    const {price,long,short,all}=current;
    // 데이터가 없는 가격대까지 과도하게 확장하지 않도록 실제 제공 구간 중심으로 설정
    const priceLows=all.map(p=>p.lo > 0 && p.lo <= p.mid ? p.lo : p.mid);
    const priceHighs=all.map(p=>p.hi >= p.mid ? p.hi : p.mid);
    const dataMin=Math.min(...priceLows), dataMax=Math.max(...priceHighs);
    const dataSpan=Math.max(1,dataMax-dataMin);
    const pad=Math.max(price*.003, dataSpan*.035);
    const min=Math.min(price,dataMin)-pad;
    const max=Math.max(price,dataMax)+pad;
    const span=Math.max(1,max-min);
    const x = p => m.l + (p-min)/span*plotW;
    const maxBar=Math.max(1,...all.map(p=>p.usd));
    const validCum=all.map(p=>Number.isFinite(p.cum) && p.cum>=0 ? p.cum : 0);
    const maxCum=Math.max(1,...validCum);
    const bottom=m.t+plotH;
    // Grid and axes
    ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const yy=m.t+plotH*i/4;
      ctx.strokeStyle='rgba(125,151,175,.18)';ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.moveTo(m.l,yy);ctx.lineTo(width-m.r,yy);ctx.stroke();ctx.setLineDash([]);
      drawText(monetary(maxBar*(1-i/4)),m.l-8,yy+4,'#8d9caf','right');
      if(!mobile)drawText(monetary(maxCum*(1-i/4)),width-m.r+7,yy+4,'#8d9caf');
    }
    for(let i=0;i<=5;i++){
      const p=min+span*i/5;
      drawText(number(p),x(p),bottom+19,'#92a5b6','center');
    }
    // 공급사가 제공하는 실제 [lo, hi] 가격 구간의 폭을 막대 너비로 사용.
    // 빈 가격대에는 추정치를 생성하거나 보간하지 않음.
    for(const p of all){
      const validBounds=Number.isFinite(p.lo)&&Number.isFinite(p.hi)&&p.lo>0&&p.hi>p.lo;
      const left=validBounds?x(p.lo):x(p.mid)-2;
      const right=validBounds?x(p.hi):x(p.mid)+2;
      const bx=Math.max(m.l,left);
      const bw=Math.max(2,Math.min(width-m.r,right)-bx-0.6);
      const h=Math.max(2,Math.min(plotH,p.usd/maxBar*plotH*.91));
      const gradient=ctx.createLinearGradient(0,bottom-h,0,bottom);
      if(p.side==='long'){
        gradient.addColorStop(0,'#ff8894');
        gradient.addColorStop(1,'#a82c49');
      }else{
        gradient.addColorStop(0,'#70ebd5');
        gradient.addColorStop(1,'#157e83');
      }
      ctx.fillStyle=gradient;
      ctx.fillRect(bx,bottom-h,bw,h);
      ctx.fillStyle=p.side==='long'?'rgba(255,198,202,.8)':'rgba(181,255,244,.8)';
      ctx.fillRect(bx,bottom-h,bw,Math.min(1.6,h));
    }
    // Cumulative curves: source's cum values describe liquidation volume reached as
    // price moves away from current; long curve is drawn from lower prices to current.
    const lines = [
      {color:'#ff4e66',points:[...long].sort((a,b)=>a.mid-b.mid).map(p=>({x:p.mid,y:Number.isFinite(p.cum)?p.cum:0})).concat([{x:price,y:0}])},
      {color:'#24c5a9',points:[{x:price,y:0},...short.map(p=>({x:p.mid,y:Number.isFinite(p.cum)?p.cum:0}))]}
    ];
    for(const line of lines){
      if(line.points.length<2)continue;
      ctx.beginPath();
      line.points.forEach((p,i)=>{const xx=x(p.x),yy=bottom-Math.max(0,p.y)/maxCum*plotH*.91;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});
      ctx.strokeStyle=line.color;ctx.lineWidth=2;ctx.stroke();
    }
    const refX=x(price);
    ctx.strokeStyle='#ff455c';ctx.lineWidth=1.7;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(refX,m.t);ctx.lineTo(refX,bottom);ctx.stroke();ctx.setLineDash([]);
    drawText('현재가 '+number(price),Math.min(width-m.r-4,Math.max(m.l+6,refX)),m.t-10,'#f7a2ae','center');
    drawText('추정 청산 가격대 (USD)',m.l+plotW/2,height-7,'#94a7ba','center');
  }
  function updateMeta() {
    if (!current) return;
    const {price,asOf,long,short}=current;
    const time = Number.isFinite(asOf) && asOf>0 ? new Date(asOf).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',month:'numeric',day:'numeric'})+' KST' : '시간 미확인';
    meta.textContent=`기준가 ${number(price)} USD · ${time} · 롱 ${long.length}개 / 숏 ${short.length}개 원본 가격 구간`;
    detail.textContent='막대 폭: 공급사 가격 구간(lo~hi) 그대로 · 빈 구간은 보간하지 않음 · 곡선: 공급사 누적 추정값';
  }
  async function load(force=false){
    if(loading)return;
    const coin=coinSelect.value==='ETH'?'ETH':'BTC';
    const range=['12h','24h','3d','7d','30d'].includes(rangeSelect.value)?rangeSelect.value:'24h';
    const key=coin+':'+range;
    if(source) source.href='https://swolecharts.com/liquidation-levels/'+coin;
    const cached=cache.get(key);
    // Respect 2m cache for regular requests, using local cache across selector switches.
    if(!force && cached && Date.now()-cached.time<120000){
      current=cached.data;status.textContent='캐시 데이터';updateMeta();draw();return;
    }
    if(Date.now()<nextAllowedAt && !cached){status.textContent='API 호출 제한: 잠시 후 다시 시도하세요';return;}
    const id=++reqSerial;
    loading=true;refresh.disabled=true;status.textContent='데이터 불러오는 중...';
    try{
      const r=await fetch(`https://swolecharts.com/api/liquidation-levels/${coin}?range=${encodeURIComponent(range)}`,{mode:'cors',cache:'default'});
      if(r.status===429){
        const seconds=Math.min(600,Math.max(30,Number(r.headers.get('Retry-After'))||60));
        nextAllowedAt=Date.now()+seconds*1000;
        throw Error('요청 한도 초과 · '+seconds+'초 후 재시도');
      }
      if(!r.ok)throw Error('공급사 API 응답 '+r.status);
      const raw=await r.json();
      const data=normalize(raw);
      cache.set(key,{data,time:Date.now()});
      if(id===reqSerial){current=data;status.textContent='데이터 연결됨';updateMeta();draw();}
    } catch(err){
      if(cached){current=cached.data;status.textContent='최신 데이터 실패 · 이전 자료 표시';updateMeta();draw();}
      else{current=null;status.textContent='불러오기 실패: '+(err?.message||'연결 오류');meta.textContent='공급사 연결 상태 또는 브라우저 네트워크 정책을 확인하세요';draw();}
    }finally{loading=false;refresh.disabled=false;}
  }
  coinSelect.addEventListener('change',()=>{current=null;draw();void load();});
  rangeSelect.addEventListener('change',()=>{current=null;draw();void load();});
  refresh.addEventListener('click',()=>void load(true));
  if(window.ResizeObserver)new ResizeObserver(draw).observe(canvas);
  else window.addEventListener('resize',draw);
  draw();void load();
  setInterval(()=>{if(!document.hidden && !loading)void load();},120000);
})();
