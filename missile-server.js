import crypto from 'node:crypto';

const REWARD_MS = 3 * 60 * 1000;
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

    // 관전 모드 중 남은 충전시간을 DB에 영구 보관한다.
    // NULL: 전투 모드에서 충전 중 / 숫자: NPC 모드에서 일시정지
    await pool.query(`
      ALTER TABLE jmc_missile_inventory
      ADD COLUMN IF NOT EXISTS paused_remaining_ms BIGINT
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

  // 게스트와 구글 계정 모두 최대 5개
  const maximum = p => 5;
  const starting = p => 5;

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

  const isNpc = p => p.npcMode === 'npc';
  const cannotAttack = p =>
    isNpc(p) || p.npcPendingMode === 'npc';

  function ownerHasNpc(ownerKey) {
    return [...clients.values()].some(p =>
      p.ready && p.missileOwnerKey === ownerKey && isNpc(p)
    );
  }

  function state(ws, p) {
    const paused = p.missilePausedRemainingMs !== null &&
      p.missilePausedRemainingMs !== undefined;
    send(ws, {
      type: 'missile_state',
      count: p.missileCount ?? 0,
      max: maximum(p),
      nextAt: paused ? null : (p.missileNextAt ?? null),
      paused,
      pausedRemainingMs: paused ? p.missilePausedRemainingMs : null
    });
  }

  // 같은 계정의 다른 탭에도 동일한 충전 상태를 알린다.
  function syncOwner(ownerKey, quantity, nextAt, pausedRemainingMs = null) {
    for (const [ws, p] of clients) {
      if (p.missileOwnerKey !== ownerKey) continue;
      p.missileCount = quantity;
      p.missileNextAt = nextAt;
      p.missilePausedRemainingMs = pausedRemainingMs;
      state(ws, p);
    }
  }

  // 서버 시각과 PostgreSQL에서 관전 중 충전시간을 원자적으로 정지/재개.
  // 변경 쿼리마다 DB 행을 갱신하므로 자동충전과 경합해도 중복 지급되지 않는다.
  const modeUpdating = new Set();
  const modeDirty = new Set();
  async function updateOwnerMode(ownerKey) {
    if (!ownerKey) return;
    if (modeUpdating.has(ownerKey)) {
      modeDirty.add(ownerKey);
      return;
    }
    modeUpdating.add(ownerKey);
    try {
      const db = await dbReady;
      if (!db) return;
      // 짧은 간격으로 모드가 바뀐 경우 DB 작업 직전 상태를 다시 확인한다.
      for (let attempt = 0; attempt < 5; attempt++) {
        modeDirty.delete(ownerKey);
        const shouldPause = ownerHasNpc(ownerKey);
        const result = await db.query(shouldPause ? `
          UPDATE jmc_missile_inventory
          SET paused_remaining_ms = GREATEST(0,
            FLOOR(EXTRACT(EPOCH FROM (next_at - NOW())) * 1000)::bigint
          ), last_seen = NOW()
          WHERE owner_key = $1 AND paused_remaining_ms IS NULL
          RETURNING quantity,
            (EXTRACT(EPOCH FROM next_at) * 1000)::bigint AS next_ms,
            paused_remaining_ms
        ` : `
          UPDATE jmc_missile_inventory
          SET next_at = NOW() +
            (paused_remaining_ms * INTERVAL '1 millisecond'),
            paused_remaining_ms = NULL, last_seen = NOW()
          WHERE owner_key = $1 AND paused_remaining_ms IS NOT NULL
          RETURNING quantity,
            (EXTRACT(EPOCH FROM next_at) * 1000)::bigint AS next_ms,
            paused_remaining_ms
        `, [ownerKey]);
        if (result.rows[0]) {
          const row = result.rows[0];
          syncOwner(ownerKey, Number(row.quantity),
            Number(row.next_ms),
            row.paused_remaining_ms === null ? null : Number(row.paused_remaining_ms));
        }
        if (shouldPause === ownerHasNpc(ownerKey) &&
            !modeDirty.has(ownerKey)) break;
      }
    } finally {
      modeUpdating.delete(ownerKey);
      if (modeDirty.delete(ownerKey)) {
        void updateOwnerMode(ownerKey).catch(error =>
          console.error('[MISSILE] 후속 모드 반영 실패:', error)
        );
      }
    }
  }

  function modeChanged(p) {
    const ownerKey = p.missileOwnerKey;
    if (!ownerKey) return;
    void updateOwnerMode(ownerKey).catch(error =>
      console.error('[MISSILE] NPC 모드 충전 동기화 실패:', error)
    );
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
    p.missilePausedRemainingMs = null;
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
          last_seen,
          paused_remaining_ms
        )
        VALUES (
          $1,
          $2,
          NOW() + INTERVAL '3 minutes',
          NOW(),
          NULL
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

          next_at = CASE
            WHEN jmc_missile_inventory.paused_remaining_ms IS NOT NULL
            THEN jmc_missile_inventory.next_at
            ELSE NOW() + INTERVAL '3 minutes'
          END,
          last_seen = NOW()

        RETURNING
          quantity,
          (
            EXTRACT(EPOCH FROM next_at) * 1000
          )::bigint AS next_ms,
          paused_remaining_ms
      `, [
        ownerKey,
        starting(p),
        guest
      ]);

      const row = result.rows[0];

      syncOwner(
        ownerKey,
        Number(row.quantity),
        Number(row.next_ms),
        row.paused_remaining_ms === null ? null : Number(row.paused_remaining_ms)
      );
      // NPC 상태로 재접속했으면 DB에도 일시정지를 강제한다.
      modeChanged(p);

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
  // 접속 중 3분마다 1개 충전
  // ========================================

  const ticking = new Set();

  const timer = setInterval(() => {
    const owners = new Map();

    for (const [ws, p] of clients) {
      if (
        p.ready &&
        p.hp > 0 &&
        p.missileOwnerKey &&
        !p.missileLoading &&
        !isNpc(p) &&
        !modeUpdating.has(p.missileOwnerKey) &&
        !ownerHasNpc(p.missileOwnerKey)
      ) {
        owners.set(p.missileOwnerKey, [ws, p]);
      }
    }

    for (const [ownerKey, [ws, p]] of owners) {
      if (
        ticking.has(ownerKey) ||
        p.missilePausedRemainingMs !== null &&
          p.missilePausedRemainingMs !== undefined ||
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
               NOW() + INTERVAL '3 minutes',
             last_seen = NOW()

          WHERE owner_key = $1
            AND paused_remaining_ms IS NULL
            AND next_at <= NOW()

          RETURNING
            quantity,
            (
              EXTRACT(EPOCH FROM next_at) * 1000
            )::bigint AS next_ms,
            paused_remaining_ms
        `, [
          ownerKey,
          maximum(p)
        ]);

        if (result.rows[0]) {
          const row = result.rows[0];

          syncOwner(
            ownerKey,
            Number(row.quantity),
            Number(row.next_ms),
            row.paused_remaining_ms === null ? null : Number(row.paused_remaining_ms)
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
        !isNpc(v) &&
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
  // 조준당하는 이용자에게 경고 전달
  // ========================================

  function sendAimWarning(
    victim,
    attackerId,
    active,
    locked = false
  ) {
    if (!victim) return;

    const victimWs = [...clients].find(
      ([, player]) => player === victim
    )?.[0];

    if (!victimWs) return;

    send(victimWs, {
      type: 'missile_warning',
      attackerId,
      active,
      locked
    });
  }

  function stopAimWarning(p) {
    const previousId = p.missileWarningTargetId;

    if (!previousId) return;

    const previous = targetFor(p, previousId);

    if (previous?.player) {
      sendAimWarning(
        previous.player,
        p.id,
        false
      );
    }

    p.missileWarningTargetId = null;
  }

  // ========================================
  // S키 미사일 발사
  // ========================================

  function handle(ws, p, m) {
    if (m.type === 'missile_aim_start') {
      stopAimWarning(p);

      if (
        p.ready &&
        p.hp > 0 &&
        !cannotAttack(p) &&
        !p.missileLoading &&
        p.missileCount > 0
      ) {
        p.missileAimAt = Date.now();
      }

      return true;
    }

    // ========================================
    // 조준 중 대상 확인
    // ========================================

    if (m.type === 'missile_aim_target') {
      const targetId = m.targetId;

      if (
        !p.ready ||
        p.hp <= 0 ||
        cannotAttack(p) ||
        !p.missileAimAt ||
        p.missileLoading ||
        p.missileCount <= 0 ||
        typeof targetId !== 'string' ||
        targetId.length > 100
      ) {
        stopAimWarning(p);
        return true;
      }

      const target = targetFor(p, targetId);

      if (
        !target?.player ||
        !validAim(p, target)
      ) {
        stopAimWarning(p);
        return true;
      }

      if (
        p.missileWarningTargetId !== targetId
      ) {
        stopAimWarning(p);

        p.missileWarningTargetId = targetId;
      }

      sendAimWarning(
        target.player,
        p.id,
        true,
        Date.now() - p.missileAimAt >= LOCK_MS
      );

      return true;
    }

    // ========================================
    // 조준 종료
    // ========================================

    if (m.type === 'missile_aim_end') {
      stopAimWarning(p);

      p.missileAimAt = 0;

      return true;
    }

    if (m.type !== 'missile_fire') {
      return false;
    }

    stopAimWarning(p);

    const aimAt = p.missileAimAt;
    p.missileAimAt = 0;

    if (
      !p.ready ||
      p.hp <= 0 ||
      cannotAttack(p) ||
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

      if (!db || !p.missileOwnerKey || cannotAttack(p)) {
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
          AND paused_remaining_ms IS NULL

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

      // DB 처리 중 NPC 전환이 끝난 경우 탄약을 돌려준다.
      if (cannotAttack(p)) {
        const refunded = await db.query(`
          UPDATE jmc_missile_inventory
          SET quantity = LEAST(quantity + 1, $2), last_seen = NOW()
          WHERE owner_key = $1
          RETURNING quantity,
            (EXTRACT(EPOCH FROM next_at) * 1000)::bigint AS next_ms,
            paused_remaining_ms
        `, [p.missileOwnerKey, maximum(p)]);
        if (refunded.rows[0]) {
          const back = refunded.rows[0];
          syncOwner(p.missileOwnerKey, Number(back.quantity),
            Number(back.next_ms),
            back.paused_remaining_ms === null ? null : Number(back.paused_remaining_ms));
        }
        return;
      }

      syncOwner(
        p.missileOwnerKey,
        Number(row.quantity),
        Number(row.next_ms),
        p.missilePausedRemainingMs ?? null
      );

      // ====================================
      // 실제 유도 미사일 비행 / 회피 판정
      // ====================================

      const id = crypto.randomUUID();
      const SPEED = 12;
      const TICK_MS = 50;
      const MAX_FLIGHT_MS = 2800;
      const BODY_RADIUS = 0.45;
      const NEAR_RADIUS = 0.8;
      const SPLASH_RADIUS = 1.6;
      const BOSS_RADIUS = 2.25;

      const originX = Number(p.x) || 0;
      const originZ = Number(p.z) || 0;

      const missile = {
        x: originX,
        y: (Number(p.y) || 0) + 1.2,
        z: originZ,
        angle: Math.atan2(
          target.x - originX,
          target.z - originZ
        ),
        targetId: target.id,
        startedAt: Date.now(),
        finished: false
      };

      const clamp = (value, min, max) =>
        Math.max(min, Math.min(max, value));

      const angleDelta = (a, b) =>
        Math.atan2(
          Math.sin(b - a),
          Math.cos(b - a)
        );

      // 미사일 이동 경로에서 목표까지 가장 가까운 지점
      function sweptClosest(
        ax, az, bx, bz, tx, tz
      ) {
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz;

        const t = len2 > 0.000001
          ? clamp(
              (
                (tx - ax) * dx +
                (tz - az) * dz
              ) / len2,
              0,
              1
            )
          : 0;

        const x = ax + t * dx;
        const z = az + t * dz;

        return {
          x,
          z,
          distance: Math.hypot(
            tx - x,
            tz - z
          )
        };
      }

      // 일반 사용자: 직격 40 / 근접 25 / 외곽 10
      // 고래 보스: 유효 공격 범위 내 명중 시 120 고정
      function damageAt(distance) {
        const isBoss = missile.targetId === 'boss';
        const surfaceDistance = Math.max(
          0,
          distance - (isBoss ? BOSS_RADIUS : 0)
        );

        if (isBoss) {
          return surfaceDistance <= SPLASH_RADIUS ? 120 : 0;
        }

        if (surfaceDistance <= BODY_RADIUS) {
          return 40;
        }

        if (surfaceDistance <= NEAR_RADIUS) {
          return 25;
        }

        if (surfaceDistance <= SPLASH_RADIUS) {
          return 10;
        }

        return 0;
      }

      broadcast({
        type: 'missile_launch',
        id,
        shooterId: p.id,
        targetId: missile.targetId,
        x: missile.x,
        y: missile.y,
        z: missile.z,
        angle: missile.angle,
        flightMs: MAX_FLIGHT_MS
      });

      let flightTimer = null;

      function finishMissile(point) {
        if (missile.finished) return;

        missile.finished = true;

        if (flightTimer) {
          clearInterval(flightTimer);
        }

        const liveTarget = targetFor(
          p,
          missile.targetId
        );

        const distance = liveTarget
          ? Math.hypot(
              liveTarget.x - point.x,
              liveTarget.z - point.z
            )
          : Infinity;

        const damage = liveTarget
          ? damageAt(distance)
          : 0;

        const impact = {
          x: point.x,
          y: missile.y,
          z: point.z
        };

        if (damage === 0) {
          broadcast({
            type: 'missile_end',
            id,
            targetId: missile.targetId,
            ...impact,
            damage: 0,
            exploded: true
          });
          return;
        }

        // 타겟이 판정 순간 NPC면 시각 효과는 보여도 피해는 0.
        if (liveTarget?.player && isNpc(liveTarget.player)) {
          broadcast({type: 'missile_end', id,
            targetId: missile.targetId, ...impact,
            damage: 0, exploded: true});
          return;
        }
        broadcast({
          type: 'missile_hit',
          id,
          targetId: missile.targetId,
          ...impact,
          damage
        });

        // 고래 보스 피해 처리
        if (missile.targetId === 'boss') {
          raid.hit(
            { id },
            impact,
            damage
          );
          return;
        }

        // 이용자 피해 처리
        const victim = liveTarget.player;

        if (
          !victim ||
          !victim.ready ||
          victim.hp <= 0 ||
          isNpc(victim)
        ) {
          return;
        }

        victim.hp = Math.max(
          0,
          victim.hp - damage
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

        // PVP 사망 시 킬·데스 기록
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
      }

      // ====================================
      // 서버에서 50ms마다 미사일 위치 계산
      // ====================================

      let lastTick = Date.now();

      flightTimer = setInterval(() => {
        if (missile.finished) {
          clearInterval(flightTimer);
          return;
        }

        const now = Date.now();

        const dt = Math.min(
          (now - lastTick) / 1000,
          0.1
        );

        lastTick = now;

        const liveTarget = targetFor(
          p,
          missile.targetId
        );

        if (!liveTarget) {
          finishMissile({
            x: missile.x,
            z: missile.z
          });
          return;
        }

        const dx =
          liveTarget.x - missile.x;

        const dz =
          liveTarget.z - missile.z;

        const distance =
          Math.hypot(dx, dz);

        const desired = Math.atan2(
          dx,
          dz
        );

        // 가까울수록 회전 속도가 느려져 회피 가능
        const turnRate =
          distance < 3 ? 1.1 : 2.2;

        missile.angle += clamp(
          angleDelta(
            missile.angle,
            desired
          ),
          -turnRate * dt,
          turnRate * dt
        );

        const oldX = missile.x;
        const oldZ = missile.z;

        missile.x +=
          Math.sin(missile.angle) *
          SPEED * dt;

        missile.z +=
          Math.cos(missile.angle) *
          SPEED * dt;

        // 빠른 미사일의 관통 방지
        const nearest = sweptClosest(
          oldX,
          oldZ,
          missile.x,
          missile.z,
          liveTarget.x,
          liveTarget.z
        );

        const directRadius =
          BODY_RADIUS +
          (missile.targetId === 'boss'
            ? BOSS_RADIUS
            : 0);

        broadcast({
          type: 'missile_position',
          id,
          x: missile.x,
          y: missile.y,
          z: missile.z,
          angle: missile.angle
        });

        if (nearest.distance <= directRadius) {
          finishMissile({
            x: nearest.x,
            z: nearest.z
          });
          return;
        }

        // 목표를 지나친 경우 가장 가까운 지점에서 폭발
        const forwardDot =
          (
            liveTarget.x - missile.x
          ) * Math.sin(missile.angle) +
          (
            liveTarget.z - missile.z
          ) * Math.cos(missile.angle);

        if (forwardDot < -0.15) {
          finishMissile({
            x: nearest.x,
            z: nearest.z
          });
          return;
        }

        // 최대 비행시간 초과
        if (
          now - missile.startedAt >=
          MAX_FLIGHT_MS
        ) {
          finishMissile({
            x: missile.x,
            z: missile.z
          });
        }
      }, TICK_MS);

      flightTimer.unref?.();

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
        quantity = 5,
        last_seen = NOW()
      WHERE owner_key = ANY($1::text[])
      RETURNING
        owner_key,
        quantity,
        (
          EXTRACT(EPOCH FROM next_at) * 1000
        )::bigint AS next_ms,
        paused_remaining_ms
    `, [[...owners]]);

    let players = 0;

    for (const row of result.rows) {
      syncOwner(
        row.owner_key,
        Number(row.quantity),
        Number(row.next_ms),
        row.paused_remaining_ms === null ? null : Number(row.paused_remaining_ms)
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
    modeChanged,
    refillOnline
  };
}
