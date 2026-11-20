
import crypto from 'node:crypto';

export async function createItemInventory(pool, send) {
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
        run_id UUID PRIMARY KEY REFERENCES jmc_raid_runs(id),
        owner_hash TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        craft_id UUID REFERENCES jmc_item_crafts(id),
        acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS jmc_item_drops_owner_idx
      ON jmc_item_drops(owner_hash, acquired_at)
    `);
  }

  async function sendSnapshot(ws, player) {
    if (!pool || !player.inventoryHash) {
      send(ws, {
        type: 'inventory_state',
        enabled: false,
        count: 0,
        crafts: []
      });
      return;
    }

    try {
      const [drops, crafts] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::INT AS count
          FROM jmc_item_drops
          WHERE owner_hash=$1 AND craft_id IS NULL
        `, [player.inventoryHash]),

        pool.query(`
          SELECT id,status,created_at,paid_at
          FROM jmc_item_crafts
          WHERE owner_hash=$1
          ORDER BY created_at DESC LIMIT 20
        `, [player.inventoryHash])
      ]);

      send(ws, {
        type: 'inventory_state',
        enabled: true,
        count: drops.rows[0]?.count || 0,
        crafts: crafts.rows
      });
    } catch (error) {
      console.error('[JMC inventory] Read:', error);
      send(ws, {
        type: 'inventory_notice',
        message: '인벤토리를 불러오지 못했습니다.'
      });
    }
  }

  async function grant(db, runId, player) {
    if (!player.inventoryHash) {
      throw new Error(
        '인벤토리 인증 정보가 없습니다. 새로고침해 주세요.'
      );
    }

    await db.query(`
      INSERT INTO jmc_item_drops(
        run_id,owner_hash,owner_name
      )
      VALUES($1,$2,$3)
    `, [
      runId,
      player.inventoryHash,
      player.name
    ]);
  }

  async function craft(ws, player) {
    if (!pool || !player.ready || !player.inventoryHash) {
      send(ws, {
        type: 'inventory_notice',
        message:
          '교환 기능은 PostgreSQL 연결 및 정상 입장 후 이용할 수 있습니다.'
      });
      return;
    }

    let db;
    let claimId;

    try {
      db = await pool.connect();
      await db.query('BEGIN');

      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [player.inventoryHash]
      );

      const available = await db.query(`
        SELECT run_id
        FROM jmc_item_drops
        WHERE owner_hash=$1 AND craft_id IS NULL
        ORDER BY acquired_at ASC, run_id ASC
        LIMIT 5 FOR UPDATE
      `, [player.inventoryHash]);

      if (available.rowCount < 5) {
        await db.query('ROLLBACK');

        send(ws, {
          type: 'inventory_notice',
          message:
            '조합에는 고래의 파편 5개가 필요합니다.'
        });

        await sendSnapshot(ws, player);
        return;
      }

      claimId = crypto.randomUUID();

      await db.query(`
        INSERT INTO jmc_item_crafts(
          id,owner_hash,owner_name
        )
        VALUES($1,$2,$3)
      `, [
        claimId,
        player.inventoryHash,
        player.name
      ]);

      const used = await db.query(`
        UPDATE jmc_item_drops
        SET craft_id=$1
        WHERE run_id=ANY($2::UUID[])
          AND craft_id IS NULL
        RETURNING run_id
      `, [
        claimId,
        available.rows.map(row => row.run_id)
      ]);

      if (used.rowCount !== 5) {
        throw new Error('파편 수량이 변경됐습니다.');
      }

      await db.query('COMMIT');

    } catch (error) {
      if (db) {
        try {
          await db.query('ROLLBACK');
        } catch {}
      }

      console.error('[JMC inventory] Craft:', error);

      send(ws, {
        type: 'inventory_notice',
        message:
          '조합에 실패했습니다. 다시 시도해 주세요.'
      });

      return;
    } finally {
      db?.release();
    }

    send(ws, {
      type: 'inventory_crafted',
      claimId
    });

    await sendSnapshot(ws, player);
  }

  async function requests() {
    if (!pool) return [];

    const result = await pool.query(`
      SELECT id,owner_name,status,created_at,paid_at
      FROM jmc_item_crafts
      ORDER BY created_at DESC LIMIT 200
    `);

    return result.rows;
  }

  async function markPaid(claimId) {
    if (!pool) {
      throw new Error('PostgreSQL 연결이 필요합니다.');
    }

    if (!/^[0-9a-f-]{36}$/i.test(String(claimId))) {
      throw new Error(
        '교환 신청 번호가 올바르지 않습니다.'
      );
    }

    const result = await pool.query(`
      UPDATE jmc_item_crafts
      SET status='paid',paid_at=NOW()
      WHERE id=$1 AND status='pending'
      RETURNING id
    `, [claimId]);

    if (result.rowCount !== 1) {
      throw new Error(
        '미지급 교환 신청을 찾을 수 없습니다.'
      );
    }
  }

  return {
    enabled: Boolean(pool),
    sendSnapshot,
    grant,
    craft,
    requests,
    markPaid
  };
}
