import crypto from 'node:crypto';

// Google OAuth 2.0 Authorization Code + PKCE.
// 계정 세션은 HttpOnly 쿠키, 세션 해시는 PostgreSQL에 보관한다.
const COOKIE_NAME = 'jmc_google_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const INVENTORY_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const pending = new Map();
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
const random = n => crypto.randomBytes(n).toString('base64url');

function cookieValue(req,name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const c of cookies) {
    const i=c.indexOf('=');
    if (i<0 || c.slice(0,i).trim()!==name) continue;
    return c.slice(i+1).trim();
  }
  return null;
}
function isSecure(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0].trim()==='https';
}
function cookieOptions(req) {
  return {
    httpOnly:true,secure:isSecure(req),sameSite:'lax',path:'/',
    maxAge:SESSION_MAX_AGE*1000
  };
}
function originAllowed(req) {
  const origin=req.headers.origin;
  if (!origin) return true;
  try {
    const u=new URL(origin);
    return u.host===req.headers.host &&
      (u.protocol==='https:' || (u.protocol==='http:' && u.hostname==='localhost'));
  } catch {return false;}
}

export async function createGoogleAuth(app) {
  const clientId=process.env.GOOGLE_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri=process.env.GOOGLE_REDIRECT_URI;
  const configured=Boolean(
    clientId && clientSecret && redirectUri && process.env.DATABASE_URL
  );
  let pool=null;

  if (configured) {
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_google_users (
        google_sub TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_google_sessions (
        token_hash TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL REFERENCES jmc_google_users(google_sub),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_guest_links (
        guest_hash TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL REFERENCES jmc_google_users(google_sub),
        linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  const ownerHash=sub=>sha256(`jmc-google-account:${sub}`);

  async function getUser(req) {
    if (!pool) return null;
    const token=cookieValue(req,COOKIE_NAME);
    if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
    const result=await pool.query(`
      SELECT u.google_sub AS sub,u.name,u.email
      FROM jmc_google_sessions s
      JOIN jmc_google_users u ON u.google_sub=s.google_sub
      WHERE s.token_hash=$1 AND s.expires_at>NOW()
    `,[sha256(token)]);
    return result.rows[0] || null;
  }

  app.get('/api/auth/me',async (req,res) => {
    try {
      const user=await getUser(req);
      res.set('Cache-Control','no-store').json({configured,user});
    } catch(error) {
      console.error('[AUTH] me:',error);
      res.status(503).json({configured:false,user:null});
    }
  });

  app.post('/api/auth/google/start',async (req,res) => {
    if (!configured) return res.status(503).json({error:'Google 로그인 설정이 아직 완료되지 않았습니다.'});
    if (!originAllowed(req)) return res.status(403).json({error:'요청 출처가 올바르지 않습니다.'});
    const inventoryToken=String(req.body?.inventoryToken || '').toLowerCase();
    const guestHash=INVENTORY_TOKEN_PATTERN.test(inventoryToken)
      ? sha256(inventoryToken)
      : null;
    const state=random(32);
    const verifier=random(48);
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const now=Date.now();
    for (const [key,value] of pending) {
      if (now-value.createdAt>PENDING_MAX_AGE_MS) pending.delete(key);
    }
    pending.set(state,{verifier,guestHash,createdAt:now});
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',clientId);
    url.searchParams.set('redirect_uri',redirectUri);
    url.searchParams.set('response_type','code');
    url.searchParams.set('scope','openid email profile');
    url.searchParams.set('state',state);
    url.searchParams.set('code_challenge',challenge);
    url.searchParams.set('code_challenge_method','S256');
    // 브라우저에 state 저장. OAuth callback은 Lax 쿠키를 보낸다.
    res.cookie('jmc_oauth_state',state,{
      httpOnly:true,secure:isSecure(req),sameSite:'lax',path:'/api/auth',
      maxAge:PENDING_MAX_AGE_MS
    });
    res.set('Cache-Control','no-store').json({url:String(url)});
  });

  // 외부 OAuth callback: 토큰 및 Google 사용자 정보는 서버에서만 처리.
  app.get('/api/auth/google/callback',async (req,res) => {
    const state=String(req.query.state || '');
    const match=pending.get(state);
    pending.delete(state);
    res.clearCookie('jmc_oauth_state',{
      path:'/api/auth',sameSite:'lax',secure:isSecure(req)
    });
    if (!configured || !match ||
        !state || cookieValue(req,'jmc_oauth_state')!==state ||
        Date.now()-match.createdAt>PENDING_MAX_AGE_MS ||
        typeof req.query.code!=='string') {
      return res.status(400).send('Google 로그인 상태가 만료됐습니다. JMC로 돌아가 다시 시도해 주세요.');
    }
    try {
      const body=new URLSearchParams({
        code:req.query.code,client_id:clientId,client_secret:clientSecret,
        redirect_uri:redirectUri,grant_type:'authorization_code',
        code_verifier:match.verifier
      });
      const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body,signal:AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) throw new Error('Google token exchange failed');
      const token=await tokenResponse.json();
      if (!token.access_token) throw new Error('Google access token missing');
      const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
        headers:{Authorization:`Bearer ${token.access_token}`},
        signal:AbortSignal.timeout(10000)
      });
      if (!profileResponse.ok) throw new Error('Google userinfo failed');
      const user=await profileResponse.json();
      if (!user.sub || user.email_verified!==true) {
        throw new Error('Verified Google account required');
      }
      const sub=String(user.sub);
      const name=String(user.name || '').slice(0,120);
      const email=String(user.email || '').slice(0,320);
      const sessionToken=random(48);
      const db=await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query(`
          INSERT INTO jmc_google_users(google_sub,email,name)
          VALUES($1,$2,$3)
          ON CONFLICT(google_sub) DO UPDATE SET
            email=EXCLUDED.email,name=EXCLUDED.name,last_login_at=NOW()
        `,[sub,email,name]);
        if (match.guestHash && match.guestHash!==ownerHash(sub)) {
          // 첫 로그인에 해당 게스트 계정만 일회성 병합.
          // 이미 다른 Google 계정과 연결된 게스트 데이터는 병합하지 않는다.
          await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[match.guestHash]);
          const linked=await db.query(`
            INSERT INTO jmc_guest_links(guest_hash,google_sub)
            VALUES($1,$2) ON CONFLICT(guest_hash) DO NOTHING
            RETURNING guest_hash
          `,[match.guestHash,sub]);
          const existing=await db.query(
            'SELECT google_sub FROM jmc_guest_links WHERE guest_hash=$1',
            [match.guestHash]
          );
          if (existing.rows[0]?.google_sub===sub) {
            await db.query(`
              UPDATE jmc_item_drops SET owner_hash=$1
              WHERE owner_hash=$2
            `,[ownerHash(sub),match.guestHash]);
            await db.query(`
              UPDATE jmc_item_crafts SET owner_hash=$1
              WHERE owner_hash=$2
            `,[ownerHash(sub),match.guestHash]);
          } else if (linked.rowCount===0) {
            console.warn('[AUTH] 이미 다른 Google 계정에 연결된 게스트 식별값입니다.');
          }
        }
        await db.query(`
          INSERT INTO jmc_google_sessions(token_hash,google_sub,expires_at)
          VALUES($1,$2,NOW()+INTERVAL '30 days')
        `,[sha256(sessionToken),sub]);
        await db.query('COMMIT');
      } catch(error) {
        await db.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally {
        db.release();
      }
      res.cookie(COOKIE_NAME,sessionToken,cookieOptions(req));
      res.redirect(303,'/');
    } catch(error) {
      console.error('[AUTH] Google callback:',error);
      res.status(502).send('Google 로그인에 실패했습니다. JMC로 돌아가 다시 시도해 주세요.');
    }
  });

  app.post('/api/auth/logout',async (req,res) => {
    if (!originAllowed(req)) return res.sendStatus(403);
    const token=cookieValue(req,COOKIE_NAME);
    try {
      if (pool && token) {
        await pool.query('DELETE FROM jmc_google_sessions WHERE token_hash=$1',[sha256(token)]);
      }
      res.clearCookie(COOKIE_NAME,{path:'/',sameSite:'lax',secure:isSecure(req)});
      res.json({ok:true});
    } catch(error) {
      console.error('[AUTH] logout:',error);
      res.status(503).json({error:'로그아웃 처리 중 오류가 발생했습니다.'});
    }
  });

  return {configured,getUser,ownerHash};
}
