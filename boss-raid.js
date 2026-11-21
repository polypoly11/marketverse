import crypto from 'node:crypto';
import { createItemInventory } from './item-inventory.js';

// 독립적인 보스 레이드 상태.
// 실제 쿠폰 이벤트에는 DATABASE_URL + pg가 필요합니다.
const MAX_HP = 10000;
const BOSS = {x:0,y:1.7,z:-13,radius:2.25};
const LOOT = {x:0,z:-13,radius:1.6};
const LOOT_ITEM_NAME = '고래의 비늘';
const LOOT_EXPIRE_MS = 3 * 60 * 1000;       // 처치 후 3분: 미획득 비늘 소멸
const BOSS_RESPAWN_MS = 10 * 60 * 1000;    // 처치 후 10분: 고래 자동 부활

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

    // 기존 테이블에도 처치 시간을 기록할 수 있도록 안전하게 컬럼 추가.
    await pool.query(`
      ALTER TABLE jmc_raid_runs
      ADD COLUMN IF NOT EXISTS defeated_at TIMESTAMPTZ
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

  // 인벤토리의 기존 내부 아이템 ID와 저장 구조는 유지합니다.
  // 서버가 전달하는 아이템 이름만 새 이름으로 통일합니다.
  function renameInventoryText(value) {
    if (typeof value === 'string') {
      return value.replaceAll('고래의 파편', LOOT_ITEM_NAME);
    }
    if (Array.isArray(value)) {
      return value.map(renameInventoryText);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          renameInventoryText(item)
        ])
      );
    }
    return value;
  }

  const inventory = await createItemInventory(
    pool,
    (ws, data) => send(ws, renameInventoryText(data))
  );

  let run = {
    id:null,
    state:'idle',
    hp:MAX_HP,
    damage:1,
    winnerName:null,
    defeatedAt:null
  };

  if (pool) {
    const result = await pool.query(`
      SELECT id,state,hp,damage,winner_name,defeated_at
      FROM jmc_raid_runs
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
        winnerName:r.winner_name,
        defeatedAt:r.defeated_at ? new Date(r.defeated_at).getTime() : null
      };
    }
  }

  const testRewards = [];

  let claiming = false;
  let lastHpBroadcast = 0;
  let lastEffect = 0;
  let lastSaved = 0;
  let saving = false;
  let deathSaved = Promise.resolve();
  let lifecycleBusy = false;

  // 구버전 서버에서 이미 떨어진 비늘은 처치 시간을 기록하지 않았음.
  // 기존 보상이 영원히 남지 않도록, 초기 로딩 시점을 기준으로 유예.
  if (run.state === 'loot' && !Number.isFinite(run.defeatedAt)) {
    run.defeatedAt = Date.now();
    if (pool) {
      await pool.query(`
        UPDATE jmc_raid_runs
        SET defeated_at = to_timestamp($2 / 1000.0)
        WHERE id = $1 AND defeated_at IS NULL
      `, [run.id, run.defeatedAt]);
    }
  }

  const snapshot = () => ({
    type:'raid_state',
    id:run.id,
    state:run.state,
    hp:run.hp,
    maxHp:MAX_HP,
    damage:run.damage,
    boss:BOSS,
    loot:LOOT,
    lootItemName:LOOT_ITEM_NAME,
    winnerName:run.winnerName,
    defeatedAt:run.defeatedAt,
    lootExpiresAt:run.defeatedAt ? run.defeatedAt + LOOT_EXPIRE_MS : null,
    nextSpawnAt:run.defeatedAt ? run.defeatedAt + BOSS_RESPAWN_MS : null,
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
      winnerName:null,
      defeatedAt:null
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
      state:'cancelled',
      defeatedAt:null
    };

    publish();
    return snapshot();
  }

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
      run.defeatedAt=now;

      if (pool) {
        deathSaved=pool.query(`
          UPDATE jmc_raid_runs
          SET state='loot',hp=0,
              defeated_at=to_timestamp($2 / 1000.0)
          WHERE id=$1 AND state='active'
        `,[run.id,now]).catch(error => {
          console.error('[RAID] 처치 기록 저장 실패:',error);
          throw error;
        });
      }

      publish();
    }
  }

  async function pickup(ws,player) {
    if (run.state!=='loot' ||
        !Number.isFinite(run.defeatedAt) ||
        Date.now() >= run.defeatedAt + LOOT_EXPIRE_MS) {
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

    if (pool && !player.inventoryHash) {
      send(ws, {
        type: 'raid_notice',
        message: '인벤토리 인증 오류입니다. 새로고침해 주세요.'
      });
      return;
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

          await inventory.grant(db, run.id, player);
          await db.query('COMMIT');

        } catch(e) {
          await db.query('ROLLBACK');
          throw e;

        } finally {
          db.release();
        }
      }

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

      send(ws,{
        type:'reward_result',
        rewardId,
        claimCode:pool?code:null,
        testMode:!pool,
        itemName:LOOT_ITEM_NAME,
        quantity:pool?1:0
      });

      await inventory.sendSnapshot(ws, player);

      publish();

    } catch(e) {
      console.error('[RAID] claim failed:',e.message);

      send(ws,{
        type:'raid_notice',
        message:'고래의 비늘 저장에 실패했습니다. 다시 시도하세요.'
      });

    } finally {
      claiming=false;
    }
  }

  // 서버 타이머: 플레이어가 0명이더라도 보상 소멸과 부활 처리.
  // DB의 defeated_at으로 서버 재시작 후에도 같은 시간을 사용한다.
  async function updateRaidLifecycle() {
    if (lifecycleBusy || claiming || !Number.isFinite(run.defeatedAt)) return;
    if (!['loot','claimed','expired'].includes(run.state)) return;

    const now = Date.now();
    const lootDeadline = run.defeatedAt + LOOT_EXPIRE_MS;
    const respawnDeadline = run.defeatedAt + BOSS_RESPAWN_MS;
    if (now < lootDeadline && now < respawnDeadline) return;

    lifecycleBusy = true;
    try {
      if (run.state === 'loot' && now >= lootDeadline) {
        await deathSaved;
        if (pool) {
          const result = await pool.query(`
            UPDATE jmc_raid_runs
            SET state='expired',finished_at=NOW()
            WHERE id=$1 AND state='loot'
          `,[run.id]);
          if (result.rowCount !== 1) return;
        }
        run.state = 'expired';
        publish();
        console.info('[RAID] 미획득 고래 비늘 3분 경과로 소멸');
      }

      if (Date.now() >= respawnDeadline &&
          (run.state === 'claimed' || run.state === 'expired')) {
        const damage = run.damage;
        await spawn(damage);
        console.info('[RAID] 고래 보스 처치 10분 후 자동 재소환');
      }
    } catch (error) {
      console.error('[RAID] 자동 소멸/재소환 처리 실패:',error);
    } finally {
      lifecycleBusy = false;
    }
  }

  setInterval(() => { void updateRaidLifecycle(); }, 1000).unref();
  // 서버 시작 시 이미 지난 기한을 즉시 정산.
  void updateRaidLifecycle();

  async function rewards() {
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
    inventory,
    rewards,
    verify,
    markPaid,

    get prizeEnabled() {
      return !!pool;
    }
  };
}
