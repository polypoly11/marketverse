
import crypto from 'node:crypto';

// 독립적인 보스 레이드 상태.
// 실제 쿠폰 이벤트에는 DATABASE_URL + pg가 필요합니다.
const MAX_HP = 10000;
const BOSS = {x:0,y:1.7,z:-13,radius:2.25};
const LOOT = {x:0,z:-13,radius:1.6};

const sha = text =>
  crypto.createHash('sha256').update(text).digest('hex');

export async function createBossRaid({clients,send,broadcast}) {
  let pool = null;

  if (process.env.DATABASE_URL) {
    const {Pool} = await import('pg');

    pool = new Pool({
      connectionString:process.env.DATABASE_URL
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_raid_runs (
        id UUID PRIMARY KEY,
        state TEXT NOT NULL,
        hp INT NOT NULL,
        damage INT NOT NULL,
        winner_id TEXT,
        winner_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_raid_rewards (
        id UUID PRIMARY KEY,
        run_id UUID NOT NULL UNIQUE REFERENCES jmc_raid_runs(id),
        winner_id TEXT NOT NULL,
        winner_name TEXT NOT NULL,
        claim_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      )
    `);
  }

  let run = {
    id:null,
    state:'idle',
    hp:MAX_HP,
    damage:1,
    winnerName:null
  };

  if (pool) {
    const result = await pool.query(`
      SELECT id,state,hp,damage,winner_name
      FROM jmc_raid_runs
      WHERE state IN ('active','loot')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows[0]) {
      const r = result.rows[0];

      run = {
        id:r.id,
        state:r.state,
        hp:r.hp,
        damage:r.damage,
        winnerName:r.winner_name
      };
    }
  }

  // 연습 모드 당첨 기록 보관
  // DATABASE_URL이 없어도 관리자 페이지에서 조회할 수 있습니다.
  // 서버가 재시작되면 초기화됩니다.
  const testRewards = [];

  let claiming = false;
  let lastHpBroadcast = 0;
  let lastEffect = 0;
  let lastSaved = 0;
  let saving = false;
  let deathSaved = Promise.resolve();

  const snapshot = () => ({
    type:'raid_state',
    id:run.id,
    state:run.state,
    hp:run.hp,
    maxHp:MAX_HP,
    damage:run.damage,
    boss:BOSS,
    loot:LOOT,
    winnerName:run.winnerName,
    prizeEnabled:!!pool
  });

  const publish = () => broadcast(snapshot());
  const sendSnapshot = ws => send(ws,snapshot());

  async function persistHp() {
    if (!pool || run.state!=='active' || saving) return;

    saving = true;

    const current = {
      id:run.id,
      hp:run.hp
    };

    try {
      await pool.query(`
        UPDATE jmc_raid_runs
        SET hp=LEAST(hp,$2)
        WHERE id=$1 AND state='active'
      `,[current.id,current.hp]);

    } catch(e) {
      console.error('[RAID] HP save:',e.message);

    } finally {
      saving = false;
    }
  }

  async function spawn(damage=1) {
    if (run.state==='active' || run.state==='loot') {
      throw Error(
        '진행 중인 보스 또는 미획득 아이템이 있습니다.'
      );
    }

    const n = Number(damage);

    if (!Number.isInteger(n) || n<1 || n>100) {
      throw Error(
        '공격당 데미지는 1~100 사이 정수여야 합니다.'
      );
    }

    const id = crypto.randomUUID();

    if (pool) {
      await pool.query(`
        INSERT INTO jmc_raid_runs(id,state,hp,damage)
        VALUES($1,'active',$2,$3)
      `,[id,MAX_HP,n]);
    }

    run = {
      id,
      state:'active',
      hp:MAX_HP,
      damage:n,
      winnerName:null
    };

    publish();
    return snapshot();
  }

  async function cancel() {
    if (!['active','loot'].includes(run.state)) {
      throw Error('취소할 레이드가 없습니다.');
    }

    if (pool) {
      await pool.query(`
        UPDATE jmc_raid_runs
        SET state='cancelled',finished_at=NOW()
        WHERE id=$1 AND state IN ('active','loot')
      `,[run.id]);
    }

    run = {
      ...run,
      state:'cancelled'
    };

    publish();
    return snapshot();
  }

  // 마법탄 이동 구간에서 고래 충돌 지점 계산
  function collision(shot,x1,z1,x2,z2) {
    if (run.state!=='active') return null;
    if (Math.abs(shot.y-BOSS.y)>1.8) return null;

    const dx=x2-x1;
    const dz=z2-z1;
    const fx=x1-BOSS.x;
    const fz=z1-BOSS.z;
    const a=dx*dx+dz*dz;

    if (a===0) return null;

    const b=2*(fx*dx+fz*dz);
    const c=fx*fx+fz*fz-BOSS.radius*BOSS.radius;
    const disc=b*b-4*a*c;

    if (disc<0) return null;

    const t=c<=0
      ? 0
      : (-b-Math.sqrt(disc))/(2*a);

    if (t<0 || t>1) return null;

    return {
      t,
      x:x1+dx*t,
      y:shot.y,
      z:z1+dz*t
    };
  }

  // 실제 HP 감소는 서버에서만 처리
  function hit(shot,point) {
    if (run.state!=='active') return;

    run.hp=Math.max(0,run.hp-run.damage);

    const now=Date.now();

    if (now-lastEffect>=80 || run.hp===0) {
      broadcast({
        type:'boss_hit',
        shotId:shot.id,
        x:point.x,
        y:point.y,
        z:point.z
      });

      lastEffect=now;

    } else {
      broadcast({
        type:'boss_shot_end',
        shotId:shot.id
      });
    }

    if (now-lastHpBroadcast>=180 || run.hp===0) {
      broadcast({
        type:'boss_hp',
        hp:run.hp,
        maxHp:MAX_HP
      });

      lastHpBroadcast=now;
    }

    if (pool && now-lastSaved>=2000) {
      lastSaved=now;
      void persistHp();
    }

    if (run.hp===0) {
      run.state='loot';

      if (pool) {
        deathSaved=pool.query(`
          UPDATE jmc_raid_runs
          SET state='loot',hp=0
          WHERE id=$1 AND state='active'
        `,[run.id]);
      }

      publish();
    }
  }

  // 선착순 보상 획득
  async function pickup(ws,player) {
    if (run.state!=='loot') {
      return send(ws,{
        type:'raid_notice',
        message:'획득할 아이템이 없습니다.'
      });
    }

    if (!player.ready || player.hp<=0) return;

    if (
      Math.hypot(
        player.x-LOOT.x,
        player.z-LOOT.z
      )>LOOT.radius
    ) {
      return send(ws,{
        type:'raid_notice',
        message:'아이템에 더 가까이 접근하세요.'
      });
    }

    if (claiming) {
      return send(ws,{
        type:'raid_notice',
        message:'다른 획득 요청을 처리 중입니다.'
      });
    }

    claiming=true;

    try {
      const rewardId=crypto.randomUUID();
      const code=crypto.randomBytes(18).toString('base64url');

      if (pool) {
        await deathSaved;

        const db=await pool.connect();

        try {
          await db.query('BEGIN');

          const update=await db.query(`
            UPDATE jmc_raid_runs
            SET state='claimed',
                winner_id=$2,
                winner_name=$3,
                finished_at=NOW()
            WHERE id=$1 AND state='loot'
            RETURNING id
          `,[run.id,player.id,player.name]);

          if (update.rowCount!==1) {
            await db.query('ROLLBACK');

            return send(ws,{
              type:'raid_notice',
              message:'이미 획득된 아이템입니다.'
            });
          }

          await db.query(`
            INSERT INTO jmc_raid_rewards
            (id,run_id,winner_id,winner_name,claim_hash)
            VALUES($1,$2,$3,$4,$5)
          `,[
            rewardId,
            run.id,
            player.id,
            player.name,
            sha(code)
          ]);

          await db.query('COMMIT');

        } catch(e) {
          await db.query('ROLLBACK');
          throw e;

        } finally {
          db.release();
        }
      }

      // 연습 모드에서도 아이템 획득 내역을 기록합니다.
      if (!pool) {
        testRewards.unshift({
          id:rewardId,
          run_id:run.id,
          winner_id:player.id,
          winner_name:player.name,
          status:'test',
          created_at:new Date().toISOString(),
          paid_at:null
        });

        // 최근 30건까지만 메모리에 보관
        if (testRewards.length>30) {
          testRewards.length=30;
        }

        console.log(
          '[RAID TEST REWARD]',
          'nickname:',player.name,
          'rewardId:',rewardId,
          'runId:',run.id
        );
      }

      run.state='claimed';
      run.winnerName=player.name;

      // 수령 코드는 당첨자에게만 전달합니다.
      // 연습 모드에서는 실제 쿠폰 수령 코드를 발급하지 않습니다.
      send(ws,{
        type:'reward_result',
        rewardId,
        claimCode:pool?code:null,
        testMode:!pool
      });

      // 전체 참가자 및 관리자 상태 업데이트
      publish();

    } catch(e) {
      console.error('[RAID] claim failed:',e.message);

      send(ws,{
        type:'raid_notice',
        message:'보상 저장에 실패했습니다. 다시 시도하세요.'
      });

    } finally {
      claiming=false;
    }
  }

  // 관리자 페이지 당첨 기록 조회
  async function rewards() {
    // PostgreSQL을 연결하지 않은 연습 모드에서도
    // 서버 메모리에 기록된 당첨자 목록을 반환합니다.
    if (!pool) {
      return testRewards.slice();
    }

    const r=await pool.query(`
      SELECT id,run_id,winner_name,status,created_at,paid_at
      FROM jmc_raid_rewards
      ORDER BY created_at DESC
      LIMIT 30
    `);

    return r.rows;
  }

  async function verify(rewardId,code) {
    if (!pool) return false;

    const r=await pool.query(`
      SELECT id
      FROM jmc_raid_rewards
      WHERE id=$1 AND claim_hash=$2
    `,[rewardId,sha(code)]);

    return r.rowCount>0;
  }

  async function markPaid(rewardId) {
    if (!pool) {
      throw Error(
        '쿠폰 지급에는 DATABASE_URL이 필요합니다.'
      );
    }

    const r=await pool.query(`
      UPDATE jmc_raid_rewards
      SET status='paid',paid_at=NOW()
      WHERE id=$1 AND status='pending'
      RETURNING id
    `,[rewardId]);

    if (!r.rowCount) {
      throw Error('미지급 보상을 찾지 못했습니다.');
    }
  }

  return {
    snapshot,
    sendSnapshot,
    spawn,
    cancel,
    collision,
    hit,
    pickup,
    rewards,
    verify,
    markPaid,

    get prizeEnabled() {
      return !!pool;
    }
  };
}
