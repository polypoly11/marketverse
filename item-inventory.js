
import crypto from 'node:crypto';

// ========================================
// JMC 인베스트라운지 아이템 시스템
// 고래의 비늘 / 행운의 선물상자 / 기프티콘
// ========================================

const ITEM_NAME = '고래의 비늘';
const CRAFT_REQUIRED = 5;
const MAX_SCALES = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createItemInventory(pool, send) {

  // ========================================
  // PostgreSQL 데이터베이스 테이블 생성
  // ========================================

  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_item_crafts (
        id UUID PRIMARY KEY,
        owner_hash TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_item_drops (
        run_id UUID PRIMARY KEY
          REFERENCES jmc_raid_runs(id),
        owner_hash TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        craft_id UUID
          REFERENCES jmc_item_crafts(id),
        acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS jmc_item_drops_owner_idx
      ON jmc_item_drops(owner_hash, acquired_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS jmc_item_crafts_owner_idx
      ON jmc_item_crafts(owner_hash, created_at)
    `);
        // 관리자 테스트용 비늘
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_item_bonus_scales (
        owner_hash TEXT PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 0
          CHECK (quantity BETWEEN 0 AND 5)
      )
    `);
  }

  // ========================================
  // 인벤토리 보유 수량 조회
  // ========================================

  async function sendSnapshot(ws, player) {

    if (!pool || !player.inventoryHash) {
      send(ws, {
        type: 'inventory_state',
        enabled: false,
        itemName: ITEM_NAME,
        count: 0,
        crafts: [],
        boxes: [],
        coupons: []
      });

      return;
    }

    try {
      const [drops, crafts, coupons] =
        await Promise.all([

          // 미사용 고래비늘 수량
          pool.query(`
            SELECT (
              (
                SELECT COUNT(*)::INT
                FROM jmc_item_drops
                WHERE owner_hash=$1
                  AND craft_id IS NULL
              ) + COALESCE((
                SELECT quantity
                FROM jmc_item_bonus_scales
                WHERE owner_hash=$1
              ), 0)
            ) AS count
          `, [
            player.inventoryHash
          ]),

          // 조합 기록 및 미개봉 선물상자
          pool.query(`
            SELECT
              id,
              status,
              created_at,
              paid_at
            FROM jmc_item_crafts
            WHERE owner_hash=$1
            ORDER BY created_at DESC
            LIMIT 100
          `, [
            player.inventoryHash
          ]),

          // 실제 지급받은 기프티콘
          pool.query(`
            SELECT
              id,
              brand,
              title,
              coupon_code,
              image_data,
              expires_at,
              assigned_at
            FROM jmc_gift_coupons
            WHERE assigned_owner_hash=$1
              AND status='assigned'
            ORDER BY assigned_at DESC
            LIMIT 100
          `, [
            player.inventoryHash
          ])
        ]);

      const entries = crafts.rows;

      const count = Math.max(
        0,
        Number(drops.rows[0]?.count) || 0
      );

      const boxes = entries.filter(
        entry => entry.status === 'box'
      );

      // 이전 수동 교환 신청 내역 유지
      const previousRequests = entries.filter(
        entry =>
          entry.status === 'pending' ||
          entry.status === 'paid'
      );

      send(ws, {
        type: 'inventory_state',
        enabled: true,
        itemName: ITEM_NAME,
        count,
        crafts: previousRequests,
        boxes,
        coupons: coupons.rows
      });

    } catch (error) {
      console.error(
        '[JMC inventory] Snapshot:',
        error
      );

      send(ws, {
        type: 'inventory_notice',
        message:
          '인벤토리를 불러오지 못했습니다.'
      });
    }
  }

  // ========================================
  // 고래의 비늘 지급
  // 보스 처치 후 선착순 획득자에게 1개 지급
  // ========================================

  async function grant(db, runId, player) {

    if (!player.inventoryHash) {
      throw new Error(
        '인벤토리 인증 정보가 없습니다. 새로고침해 주세요.'
      );
    }

    if (!player.ready) {
      throw new Error(
        '정상적으로 입장한 이용자만 아이템을 획득할 수 있습니다.'
      );
    }

    // ========================================
    // 고래비늘 최대 보유량 5개
    // ========================================

    // 같은 이용자가 여러 창에서 동시에
    // 획득하는 경우에도 최대치 초과 방지
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [player.inventoryHash]
    );

    const result = await db.query(`
      SELECT (
        (
          SELECT COUNT(*)::INT
          FROM jmc_item_drops
          WHERE owner_hash=$1
            AND craft_id IS NULL
        ) + COALESCE((
          SELECT quantity
          FROM jmc_item_bonus_scales
          WHERE owner_hash=$1
        ), 0)
      ) AS count
    `, [
      player.inventoryHash
    ]);

    const currentCount =
      Number(result.rows[0]?.count) || 0;

    if (currentCount >= MAX_SCALES) {
      const error = new Error(
        '고래의 비늘은 최대 5개까지 보유할 수 있습니다. 먼저 5개를 조합해 주세요.'
      );

      error.code = 'WHALE_SCALE_FULL';

      throw error;
    }

    // ========================================
    // 보유량 확인 후 비늘 1개 지급
    // ========================================

    await db.query(`
      INSERT INTO jmc_item_drops (
        run_id,
        owner_hash,
        owner_name
      )
      VALUES ($1,$2,$3)
    `, [
      runId,
      player.inventoryHash,
      player.name
    ]);

    console.log(
      '[JMC inventory] 고래의 비늘 지급',
      'runId:', runId,
      'player:', player.name,
      'count:', currentCount + 1
    );
  }

  // ========================================
  // 고래의 비늘 5개 조합
  // ========================================

  async function craft(ws, player) {

    if (
      !pool ||
      !player.ready ||
      !player.inventoryHash
    ) {
      send(ws, {
        type: 'inventory_notice',
        message:
          '고래의 비늘 조합은 PostgreSQL 연결 및 정상 입장 후 이용할 수 있습니다.'
      });

      return;
    }

    if (!player.googleSub) {
      send(ws, {
        type: 'inventory_notice',
        message:
          '행운의 선물상자 조합은 Google 로그인 후 가능합니다.'
      });

      return;
    }

    let db;
    let claimId;
    let committed = false;

    try {
      db = await pool.connect();

      await db.query('BEGIN');

      // 동일 이용자의 동시 조합 방지
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [player.inventoryHash]
      );

      // 사용하지 않은 비늘 5개 조회
      const available = await db.query(`
        SELECT run_id
        FROM jmc_item_drops
        WHERE owner_hash=$1
          AND craft_id IS NULL
        ORDER BY acquired_at ASC, run_id ASC
        LIMIT 5
        FOR UPDATE
      `, [
        player.inventoryHash
      ]);

      const bonusResult = await db.query(`
        SELECT quantity
        FROM jmc_item_bonus_scales
        WHERE owner_hash=$1
        FOR UPDATE
      `, [player.inventoryHash]);

      const bonusCount =
        Number(bonusResult.rows[0]?.quantity) || 0;

      if (
        available.rowCount + bonusCount <
        CRAFT_REQUIRED
      ) {
        await db.query('ROLLBACK');

        send(ws, {
          type: 'inventory_notice',
          message:
            `${ITEM_NAME} ${CRAFT_REQUIRED}개가 있어야 조합할 수 있습니다.`
        });

        await sendSnapshot(ws, player);

        return;
      }

      claimId = crypto.randomUUID();

      // ========================================
      // 비늘 5개로 미개봉 선물상자 생성
      // ========================================

      await db.query(`
        INSERT INTO jmc_item_crafts (
          id,
          owner_hash,
          owner_name,
          status
        )
        VALUES ($1,$2,$3,'box')
      `, [
        claimId,
        player.inventoryHash,
        player.name
      ]);

      // ========================================
      // 비늘 5개 사용 처리
      // ========================================

      const used = await db.query(`
        UPDATE jmc_item_drops
        SET craft_id=$1
        WHERE run_id=ANY($2::UUID[])
          AND owner_hash=$3
          AND craft_id IS NULL
        RETURNING run_id
      `, [
        claimId,
        available.rows.map(row => row.run_id),
        player.inventoryHash
      ]);

      const requiredBonus =
        CRAFT_REQUIRED - used.rowCount;

      if (
        used.rowCount !== available.rowCount ||
        requiredBonus < 0
      ) {
        throw new Error(
          '고래의 비늘 보유 수량이 변경됐습니다.'
        );
      }

      if (requiredBonus > 0) {
        const consumed = await db.query(`
          UPDATE jmc_item_bonus_scales
          SET quantity = quantity - $2
          WHERE owner_hash=$1
            AND quantity >= $2
          RETURNING quantity
        `, [
          player.inventoryHash,
          requiredBonus
        ]);

        if (consumed.rowCount !== 1) {
          throw new Error(
            '테스트 비늘 사용에 실패했습니다.'
          );
        }
      }

      await db.query('COMMIT');
      committed = true;

    } catch (error) {

      if (db && !committed) {
        try {
          await db.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            '[JMC inventory] Craft Rollback:',
            rollbackError
          );
        }
      }

      console.error(
        '[JMC inventory] Craft:',
        error
      );

      send(ws, {
        type: 'inventory_notice',
        message:
          '행운의 선물상자 조합에 실패했습니다. 다시 시도해 주세요.'
      });

      return;

    } finally {
      db?.release();
    }

    // ========================================
    // 조합 성공 알림
    // ========================================

    send(ws, {
      type: 'inventory_crafted',
      itemName: ITEM_NAME,
      claimId,
      rewardType: 'gift_box'
    });

    // 새 선물상자와 남은 비늘 수량 전송
    await sendSnapshot(ws, player);
  }

  // ========================================
  // 행운의 선물상자 개봉
  // ========================================

  async function openBox(ws, player, boxId) {

    if (
      !pool ||
      !player.ready ||
      !player.googleSub ||
      !player.inventoryHash
    ) {
      send(ws, {
        type: 'inventory_notice',
        message:
          '선물상자는 Google 로그인 후 열 수 있습니다.'
      });

      return;
    }

    if (
      typeof boxId !== 'string' ||
      !UUID_PATTERN.test(boxId)
    ) {
      send(ws, {
        type: 'inventory_notice',
        message:
          '올바르지 않은 선물상자입니다.'
      });

      return;
    }

    let db;
    let committed = false;
    let noStock = false;
    let awarded = null;

    try {
      db = await pool.connect();

      await db.query('BEGIN');

      // ========================================
      // 선물상자 소유권 및 미개봉 상태 확인
      // ========================================

      // FOR UPDATE로 동일 상자의 중복 개봉 차단
      const box = await db.query(`
        SELECT id
        FROM jmc_item_crafts
        WHERE id=$1
          AND owner_hash=$2
          AND status='box'
        FOR UPDATE
      `, [
        boxId,
        player.inventoryHash
      ]);

      if (box.rowCount !== 1) {
        const error = new Error(
          '이미 개봉했거나 소유하지 않은 선물상자입니다.'
        );

        error.code = 'GIFT_BOX_NOT_FOUND';

        throw error;
      }

      // ========================================
      // 실제 기프티콘 재고 확인
      // ========================================

      // 유효기간이 지나지 않은
      // 미사용 쿠폰만 무작위 선택
      //
      // SKIP LOCKED:
      // 다른 이용자에게 지급 중인 쿠폰은 제외

      const stock = await db.query(`
        SELECT
          id,
          brand,
          title,
          coupon_code,
          image_data,
          expires_at
        FROM jmc_gift_coupons
        WHERE status='unused'
          AND (
            expires_at IS NULL
            OR expires_at >= CURRENT_DATE
          )
        ORDER BY RANDOM()
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      // ========================================
      // 재고 없음: 선물상자 보존
      // ========================================

      if (stock.rowCount === 0) {
        noStock = true;

        await db.query('ROLLBACK');

      } else {

        awarded = stock.rows[0];

        // ========================================
        // 쿠폰 1개 지급 확정
        // ========================================

        const assigned = await db.query(`
          UPDATE jmc_gift_coupons
          SET
            status='assigned',
            craft_id=$1,
            assigned_owner_hash=$2,
            assigned_at=NOW()
          WHERE id=$3
            AND status='unused'
          RETURNING id
        `, [
          boxId,
          player.inventoryHash,
          awarded.id
        ]);

        if (assigned.rowCount !== 1) {
          throw new Error(
            '쿠폰 지급 중 재고가 변경됐습니다.'
          );
        }

        // ========================================
        // 개봉한 선물상자 사용 처리
        // ========================================

        const opened = await db.query(`
          UPDATE jmc_item_crafts
          SET status='opened'
          WHERE id=$1
            AND owner_hash=$2
            AND status='box'
          RETURNING id
        `, [
          boxId,
          player.inventoryHash
        ]);

        if (opened.rowCount !== 1) {
          throw new Error(
            '선물상자 상태를 변경하지 못했습니다.'
          );
        }

        // 쿠폰 지급과 상자 차감 동시 확정
        await db.query('COMMIT');

        committed = true;
      }

    } catch (error) {

      if (db && !committed) {
        try {
          await db.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            '[JMC GIFT BOX] Rollback:',
            rollbackError
          );
        }
      }

      console.error(
        '[JMC GIFT BOX] Open:',
        error
      );

      send(ws, {
        type: 'inventory_notice',
        message:
          error.code === 'GIFT_BOX_NOT_FOUND'
            ? '이미 개봉했거나 소유하지 않은 선물상자입니다.'
            : '선물상자를 열지 못했습니다. 잠시 후 다시 시도해 주세요.'
      });

      await sendSnapshot(ws, player);

      return;

    } finally {
      db?.release();
    }

    // ========================================
    // 기프티콘 재고가 없는 경우
    // ========================================

    if (noStock) {
      send(ws, {
        type: 'inventory_box_empty',
        message:
          '현재 준비된 기프티콘이 없습니다. 기프티콘이 충전되면 다시 열어주세요. 선물상자는 소모되지 않습니다.'
      });

      return;
    }

    // ========================================
    // 기프티콘 지급 성공
    // ========================================

    if (committed && awarded) {

      console.log(
        '[JMC GIFT BOX] 쿠폰 지급 성공',
        'boxId:', boxId,
        'couponId:', awarded.id,
        'player:', player.name
      );

      send(ws, {
        type: 'inventory_box_opened',
        coupon: {
          id: awarded.id,
          brand: awarded.brand,
          title: awarded.title,
          coupon_code: awarded.coupon_code,
          image_data: awarded.image_data,
          expires_at: awarded.expires_at
        }
      });

      // 개봉한 상자는 목록에서 제거되고
      // 지급된 쿠폰은 내 기프티콘에 표시
      await sendSnapshot(ws, player);
    }
  }

  // ========================================
  // 관리자 기존 교환 신청 목록 조회
  // ========================================

  async function requests() {

    if (!pool) {
      return [];
    }

    // 새 선물상자는 기존 교환 신청 목록에서 제외
    const result = await pool.query(`
      SELECT
        id,
        owner_name,
        status,
        created_at,
        paid_at
      FROM jmc_item_crafts
      WHERE status IN ('pending','paid')
      ORDER BY created_at DESC
      LIMIT 200
    `);

    return result.rows;
  }

  // ========================================
  // 관리자 기존 기프티콘 지급 완료 처리
  // ========================================

  async function markPaid(claimId) {

    if (!pool) {
      throw new Error(
        'PostgreSQL 연결이 필요합니다.'
      );
    }

    if (
      !UUID_PATTERN.test(String(claimId))
    ) {
      throw new Error(
        '교환 신청 번호가 올바르지 않습니다.'
      );
    }

    // 이전 교환 신청만 지급 완료 처리
    // 새 선물상자는 자동 지급 시스템에서 처리
    const result = await pool.query(`
      UPDATE jmc_item_crafts
      SET
        status='paid',
        paid_at=NOW()
      WHERE id=$1
        AND status='pending'
      RETURNING id
    `, [
      claimId
    ]);

    if (result.rowCount !== 1) {
      throw new Error(
        '미지급 교환 신청을 찾을 수 없습니다.'
      );
    }
  }
  // ========================================
  // 관리자 테스트용 고래비늘 5개 채우기
  // ========================================

  async function adminRefill(ownerHash) {
    if (!pool || !ownerHash) {
      throw new Error(
        '인벤토리 DB 또는 계정 정보가 없습니다.'
      );
    }

    const db = await pool.connect();

    try {
      await db.query('BEGIN');

      // 일반 비늘 지급·조합과 동시 실행 방지
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [ownerHash]
      );

      const actual = await db.query(`
        SELECT COUNT(*)::INT AS count
        FROM jmc_item_drops
        WHERE owner_hash=$1
          AND craft_id IS NULL
      `, [ownerHash]);

      const actualCount =
        Number(actual.rows[0]?.count) || 0;

      // 실제 비늘을 유지하고 부족한 수량만
      // 관리자 테스트 비늘로 채움
      const bonusQuantity = Math.max(
        0,
        MAX_SCALES - actualCount
      );

      await db.query(`
        INSERT INTO jmc_item_bonus_scales (
          owner_hash,
          quantity
        )
        VALUES ($1,$2)
        ON CONFLICT (owner_hash)
        DO UPDATE SET
          quantity=EXCLUDED.quantity
      `, [
        ownerHash,
        bonusQuantity
      ]);

      await db.query('COMMIT');

      return {
        count: actualCount + bonusQuantity,
        max: MAX_SCALES
      };

    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});

      throw error;

    } finally {
      db.release();
    }
  }
  // ========================================
  // 외부 모듈 연결
  // ========================================

  return {
    enabled: Boolean(pool),

    sendSnapshot,

    // 고래의 비늘
    grant,

    // 비늘 5개 조합
    craft,

    // 선물상자 개봉
    openBox,

    // 관리자 테스트 비늘 충전
    adminRefill,

    // 이전 교환 신청 관리
    requests,
    markPaid
  };
