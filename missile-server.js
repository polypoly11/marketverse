
import crypto from 'node:crypto';

const REWARD_MS = 10 * 60 * 1000;
const DAMAGE = 40;
const RANGE = 15;
const LOCK_MS = 700;

export function createMissileSystem({
  clients,
  send,
  broadcast,
  raid,
  recordPvpKill,
  presence
}) {

  // ========================================
  // PostgreSQL 미사일 영구 저장
  // ========================================

  const dbReady = (async () => {
    if (!process.env.DATABASE_URL) {
      console.error(
        '[MISSILE] DATABASE_URL이 없습니다.'
      );
      return null;
    }

    const { Pool } = await import('pg');

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_missile_inventory (
        owner_key TEXT PRIMARY KEY,
        quantity INTEGER NOT NULL
          CHECK (quantity >= 0 AND quantity <= 5),
        next_at TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    return pool;
  })().catch(error => {
    console.error(
      '[MISSILE] DB 초기화 실패:',
      error
    );
    return null;
  });

  // ========================================
  // 계정별 보유 한도
  // ========================================

  const maximum = p => p.googleSub ? 5 : 3;
  const starting = p => p.googleSub ? 5 : 3;

  function keyFor(p) {
    if (p.googleSub) {
      return `google:${p.googleSub}`;
    }

    const guestHash =
      p.cookieInventoryHash || p.inventoryHash;

    return guestHash
      ? `guest:${guestHash}`
      : null;
  }

  // ========================================
  // 인벤토리 상태 전송
  // ========================================

  function state(ws, p) {
    send(ws, {
      type: 'missile_state',
      count: p.missileCount ?? 0,
      max: maximum(p),
      nextAt: p.missileNextAt ?? null
    });
  }

  // 같은 계정으로 여러 창에 접속한 경우
  // 모든 창의 보유량을 동기화한다.
  function syncOwner(ownerKey, quantity, nextAt) {
    for (const [ws, p] of clients) {
      if (p.missileOwnerKey !== ownerKey) {
        continue;
      }

      p.missileCount = quantity;
      p.missileNextAt = nextAt;

      state(ws, p);
    }
  }

  // ========================================
  // 최초 지급 / 재접속 불러오기
  // ========================================

  function join(ws, p) {
    if (p.missileOwnerKey) {
      state(ws, p);
      return;
    }

    const ownerKey = keyFor(p);

    if (!ownerKey) {
      send(ws, {
        type: 'missile_notice',
        message: '미사일 저장 식별값이 없습니다.'
      });
      return;
    }

    p.missileOwnerKey = ownerKey;
    p.missileCount = 0;
    p.missileNextAt = null;
    p.missileAimAt = 0;
    p.missileLoading = true;

    state(ws, p);

    void (async () => {
      const db = await dbReady;
      if (!db) return;

      const guest = !p.googleSub;

      const result = await db.query(`
        INSERT INTO jmc_missile_inventory (
          owner_key,
          quantity,
          next_at,
          last_seen
        )
        VALUES (
          $1,
          $2,
          NOW() + INTERVAL '10 minutes',
          NOW()
        )

        ON CONFLICT (owner_key)
        DO UPDATE SET
          quantity = CASE
            WHEN $3::boolean
              AND jmc_missile_inventory.last_seen
                < NOW() - INTERVAL '24 hours'
            THEN $2
            ELSE jmc_missile_inventory.quantity
          END,

          next_at = NOW() + INTERVAL '10 minutes',
          last_seen = NOW()

        RETURNING
          quantity,
          (
            EXTRACT(EPOCH FROM next_at) * 1000
          )::bigint AS next_ms
      `, [
        ownerKey,
        starting(p),
        guest
      ]);

      const row = result.rows[0];

      syncOwner(
        ownerKey,
        Number(row.quantity),
        Number(row.next_ms)
      );

    })().catch(error => {
      console.error(
        '[MISSILE] 미사일 불러오기 실패:',
        error
      );

      send(ws, {
        type: 'missile_notice',
        message: '미사일 정보를 불러오지 못했습니다.'
      });

    }).finally(() => {
      p.missileLoading = false;
    });
  }

  // ========================================
  // 접속 중 10분마다 1개 충전
  // ========================================

  const ticking = new Set();

  const timer = setInterval(() => {
    const owners = new Map();

    for (const [ws, p] of clients) {
      if (
        p.ready &&
        p.hp > 0 &&
        p.missileOwnerKey &&
        !p.missileLoading
      ) {
        owners.set(p.missileOwnerKey, [ws, p]);
      }
    }

    for (const [ownerKey, [ws, p]] of owners) {
      if (
        ticking.has(ownerKey) ||
        !p.missileNextAt ||
        Date.now() < p.missileNextAt
      ) {
        continue;
      }

      ticking.add(ownerKey);

      void (async () => {
        const db = await dbReady;
        if (!db) return;

        const result = await db.query(`
          UPDATE jmc_missile_inventory
          SET
            quantity = LEAST(
              quantity + 1,
              $2
            ),
            next_at =
              NOW() + INTERVAL '10 minutes',
            last_seen = NOW()

          WHERE owner_key = $1
            AND next_at <= NOW()

          RETURNING
            quantity,
            (
              EXTRACT(EPOCH FROM next_at) * 1000
            )::bigint AS next_ms
        `, [
          ownerKey,
          maximum(p)
        ]);

        if (result.rows[0]) {
          const row = result.rows[0];

          syncOwner(
            ownerKey,
            Number(row.quantity),
            Number(row.next_ms)
          );
        }

      })().catch(error => {
        console.error(
          '[MISSILE] 자동 충전 실패:',
          error
        );

      }).finally(() => {
        ticking.delete(ownerKey);
      });
    }
  }, 1000);

  timer.unref?.();

  // ========================================
  // 조준 대상 검색
  // ========================================

  function targetFor(p, id) {
    if (id === 'boss') {
      const boss = raid.snapshot();

      if (boss.state !== 'active') {
        return null;
      }

      return {
        id: 'boss',
        x: 0,
        z: -13,
        player: null
      };
    }

    const player = [...clients.values()].find(
      v =>
        v.id === id &&
        v.ready &&
        v.hp > 0 &&
        v !== p
    );

    if (!player) return null;

    return {
      id,
      x: player.x,
      z: player.z,
      player
    };
  }

  function validAim(p, target) {
    const dx = target.x - p.x;
    const dz = target.z - p.z;

    const distance = Math.hypot(dx, dz);

    if (
      distance > RANGE ||
      distance < 0.2
    ) {
      return false;
    }

    const facing =
      Math.sin(p.direction) * dx +
      Math.cos(p.direction) * dz;

    return facing / distance >= 0.65;
  }

  // ========================================
  // S키 미사일 발사
  // ========================================

  function handle(ws, p, m) {
    if (m.type === 'missile_aim_start') {
      if (
        p.ready &&
        p.hp > 0 &&
        !p.missileLoading &&
        p.missileCount > 0
      ) {
        p.missileAimAt = Date.now();
      }

      return true;
    }

    if (m.type !== 'missile_fire') {
      return false;
    }

    const aimAt = p.missileAimAt;
    p.missileAimAt = 0;

    if (
      !p.ready ||
      p.hp <= 0 ||
      p.missileLoading ||
      !p.missileCount ||
      !aimAt ||
      Date.now() - aimAt < LOCK_MS ||
      p.missileFiring
    ) {
      return true;
    }

    if (
      typeof m.targetId !== 'string' ||
      m.targetId.length > 100
    ) {
      return true;
    }

    const target = targetFor(p, m.targetId);

    if (!target || !validAim(p, target)) {
      send(ws, {
        type: 'missile_notice',
        message: '조준 대상이 범위를 벗어났습니다.'
      });

      return true;
    }

    p.missileFiring = true;

    void (async () => {
      const db = await dbReady;

      if (!db || !p.missileOwnerKey) {
        return;
      }

      // DB에서 미사일 1개를 원자적으로 차감
      const result = await db.query(`
        UPDATE jmc_missile_inventory

        SET
          quantity = quantity - 1,
          last_seen = NOW()

        WHERE owner_key = $1
          AND quantity > 0

        RETURNING
          quantity,
          (
            EXTRACT(EPOCH FROM next_at) * 1000
          )::bigint AS next_ms
      `, [p.missileOwnerKey]);

      if (!result.rows[0]) {
        send(ws, {
          type: 'missile_notice',
          message: '미사일이 부족합니다.'
        });

        return;
      }

      const row = result.rows[0];

      syncOwner(
        p.missileOwnerKey,
        Number(row.quantity),
        Number(row.next_ms)
      );

      // ====================================
      // 유도 미사일 발사
      // ====================================

      const id = crypto.randomUUID();

      const distance = Math.hypot(
        target.x - p.x,
        target.z - p.z
      );

      const flightMs = Math.max(
        600,
        Math.min(
          2000,
          Math.round(distance / 9 * 1000)
        )
      );

      broadcast({
        type: 'missile_launch',
        id,
        shooterId: p.id,
        targetId: target.id,
        x: p.x,
        y: p.y + 1.2,
        z: p.z,
        flightMs
      });

      setTimeout(() => {
        const liveTarget = targetFor(
          p,
          target.id
        );

        if (!liveTarget) {
          broadcast({
            type: 'missile_end',
            id
          });

          return;
        }

        const impact = {
          x: liveTarget.x,
          y: 1.1,
          z: liveTarget.z
        };

        broadcast({
          type: 'missile_hit',
          id,
          targetId: target.id,
          ...impact,
          damage: DAMAGE
        });

        // 고래 보스 공격
        if (target.id === 'boss') {
          raid.hit(
            { id },
            impact,
            DAMAGE
          );

          return;
        }

        // 이용자 공격
        const victim = liveTarget.player;

        victim.hp = Math.max(
          0,
          victim.hp - DAMAGE
        );

        const victimWs = [...clients].find(
          ([, value]) => value === victim
        )?.[0];

        if (victimWs) {
          send(victimWs, {
            type: 'hp',
            hp: victim.hp,
            maxHp: 100
          });
        }

        broadcast({
          type: 'player_hp',
          id: victim.id,
          hp: victim.hp,
          maxHp: 100
        });

        // ==================================
        // PVP 사망 및 전적 기록
        // ==================================

        if (victim.hp === 0) {
          if (
            p.googleSub &&
            victim.googleSub &&
            p.googleSub !== victim.googleSub
          ) {
            Promise.resolve(
              recordPvpKill(
                p.googleSub,
                victim.googleSub
              )
            ).catch(error => {
              console.error(
                '[MISSILE] PVP 기록 실패:',
                error
              );
            });
          }

          victim.ready = false;

          if (victimWs) {
            send(victimWs, {
              type: 'death',
              message: '사망하셨습니다',
              hp: 0
            });

            victimWs.close(
              4001,
              'HP depleted'
            );
          }

          presence();
        }

      }, flightMs).unref?.();

    })().catch(error => {
      console.error(
        '[MISSILE] 발사 실패:',
        error
      );

      send(ws, {
        type: 'missile_notice',
        message: '미사일 발사에 실패했습니다.'
      });

    }).finally(() => {
      p.missileFiring = false;
    });

    return true;
  }

  // ========================================
  // 어드민 전체 미사일 충전
  // ========================================

  async function refillOnline() {
    const db = await dbReady;

    if (!db) {
      throw new Error('미사일 DB 연결 실패');
    }

    const owners = new Set();

    for (const p of clients.values()) {
      if (
        p.ready &&
        p.hp > 0 &&
        p.missileOwnerKey &&
        !p.missileLoading
      ) {
        owners.add(p.missileOwnerKey);
      }
    }

    if (owners.size === 0) {
      return {
        owners: 0,
        players: 0
      };
    }

    const result = await db.query(`
      UPDATE jmc_missile_inventory
      SET
        quantity = CASE
          WHEN owner_key LIKE 'google:%'
            THEN 5
          ELSE 3
        END,
        last_seen = NOW()
      WHERE owner_key = ANY($1::text[])
      RETURNING
        owner_key,
        quantity,
        (
          EXTRACT(EPOCH FROM next_at) * 1000
        )::bigint AS next_ms
    `, [[...owners]]);

    let players = 0;

    for (const row of result.rows) {
      syncOwner(
        row.owner_key,
        Number(row.quantity),
        Number(row.next_ms)
      );

      for (const p of clients.values()) {
        if (
          p.ready &&
          p.missileOwnerKey === row.owner_key
        ) {
          players++;
        }
      }
    }

    return {
      owners: result.rows.length,
      players
    };
  }

  return {
    join,
    handle,
    state,
    refillOnline
  };
}
