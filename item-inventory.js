import crypto from 'node:crypto';

// ========================================
// JMC 인베스트라운지 아이템 시스템
// 고래의 비늘 획득 / 보관 / 5개 조합
// ========================================

const ITEM_NAME = '고래의 비늘';
const CRAFT_REQUIRED = 5;

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
  }

  // ========================================
  // 인벤토리 보유 수량 조회
  // ========================================

  async function sendSnapshot(ws, player) {

    // DB 또는 소유자 인증 정보가 없으면
    // 실제 아이템을 저장하거나 조회할 수 없음
    if (!pool || !player.inventoryHash) {
      send(ws, {
        type: 'inventory_state',
        enabled: false,
        itemName: ITEM_NAME,
        count: 0,
        crafts: []
      });

      return;
    }

    try {
      const [drops, crafts] = await Promise.all([

        // 사용하지 않은 고래의 비늘 수량
        pool.query(`
          SELECT COUNT(*)::INT AS count
          FROM jmc_item_drops
          WHERE owner_hash=$1
            AND craft_id IS NULL
        `, [
          player.inventoryHash
        ]),

        // 기존 조합 및 교환 신청 기록
        pool.query(`
          SELECT
            id,
            status,
            created_at,
            paid_at
          FROM jmc_item_crafts
          WHERE owner_hash=$1
          ORDER BY created_at DESC
          LIMIT 20
        `, [
          player.inventoryHash
        ])
      ]);

      const count = Math.max(
        0,
        Number(drops.rows[0]?.count) || 0
      );

      // 서버에서 확정한 보유 수량 전송
      send(ws, {
        type: 'inventory_state',
        enabled: true,
        itemName: ITEM_NAME,
        count,
        crafts: crafts.rows
      });

    } catch (error) {
      console.error(
        '[JMC inventory] Read:',
        error
      );

      send(ws, {
        type: 'inventory_notice',
        message:
          '고래의 비늘 인벤토리를 불러오지 못했습니다.'
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

    // 보스 레이드별로 한 번만 지급
    // 동일 run_id 중복 지급은 DB 기본키로 방지
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
      'player:', player.name
    );

    // 실제 저장 확정(COMMIT)과
    // 아이템창 갱신은 boss-raid.js에서 처리
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

    let db;
    let claimId;

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

      // 비늘이 5개 미만이면 조합 불가
      if (available.rowCount < CRAFT_REQUIRED) {

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

      // 교환 신청 내역 생성
      await db.query(`
        INSERT INTO jmc_item_crafts (
          id,
          owner_hash,
          owner_name
        )
        VALUES ($1,$2,$3)
      `, [
        claimId,
        player.inventoryHash,
        player.name
      ]);

      // 비늘 5개를 조합에 사용한 상태로 변경
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

      if (used.rowCount !== CRAFT_REQUIRED) {
        throw new Error(
          '고래의 비늘 보유 수량이 변경됐습니다.'
        );
      }

      // 조합 성공 시에만 데이터베이스 확정
      await db.query('COMMIT');

    } catch (error) {

      if (db) {
        try {
          await db.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            '[JMC inventory] Rollback:',
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
          '고래의 비늘 조합에 실패했습니다. 다시 시도해 주세요.'
      });

      return;

    } finally {
      db?.release();
    }

    // ======================================
    // 조합 성공 알림
    // ======================================

    send(ws, {
      type: 'inventory_crafted',
      itemName: ITEM_NAME,
      claimId
    });

    // 사용한 5개를 제외한 보유 수량 갱신
    await sendSnapshot(ws, player);
  }

  // ========================================
  // 관리자 교환 신청 목록 조회
  // ========================================

  async function requests() {

    if (!pool) {
      return [];
    }

    const result = await pool.query(`
      SELECT
        id,
        owner_name,
        status,
        created_at,
        paid_at
      FROM jmc_item_crafts
      ORDER BY created_at DESC
      LIMIT 200
    `);

    return result.rows;
  }

  // ========================================
  // 관리자 기프티콘 지급 완료 처리
  // ========================================

  async function markPaid(claimId) {

    if (!pool) {
      throw new Error(
        'PostgreSQL 연결이 필요합니다.'
      );
    }

    if (!/^[0-9a-f-]{36}$/i.test(String(claimId))) {
      throw new Error(
        '교환 신청 번호가 올바르지 않습니다.'
      );
    }

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
  // 외부 모듈 연결
  // ========================================

  return {
    enabled: Boolean(pool),
    sendSnapshot,
    grant,
    craft,
    requests,
    markPaid
  };
}
