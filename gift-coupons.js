
import crypto from 'node:crypto';

const MAX_BATCH = 100;
const MAX_IMAGE_LENGTH = 500000;

const IMAGE_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export async function createGiftCoupons(pool) {
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_gift_coupons (
        id UUID PRIMARY KEY,
        brand TEXT NOT NULL,
        title TEXT NOT NULL,
        coupon_code TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        image_data TEXT,
        expires_at DATE,
        status TEXT NOT NULL DEFAULT 'unused'
          CHECK (status IN ('unused','assigned')),
        craft_id UUID UNIQUE,
        assigned_owner_hash TEXT,
        assigned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS jmc_gift_coupons_status_idx
      ON jmc_gift_coupons(status, created_at)
    `);
  }

  function requirePool() {
    if (!pool) {
      throw new Error(
        'PostgreSQL 연결이 필요합니다.'
      );
    }
  }

  function normalize(item) {
    const brand = String(item?.brand || '').trim();
    const title = String(item?.title || '').trim();
    const code = String(item?.code || '').trim();
    const expiresAt = String(
      item?.expiresAt || ''
    ).trim();

    const imageData = String(
      item?.imageData || ''
    );

    if (
      !brand ||
      !title ||
      !code ||
      brand.length > 60 ||
      title.length > 120 ||
      code.length > 256
    ) {
      throw new Error(
        '브랜드·상품명·쿠폰번호를 확인해 주세요.'
      );
    }

    if (
      expiresAt &&
      !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)
    ) {
      throw new Error(
        '유효기간은 YYYY-MM-DD 형식이어야 합니다.'
      );
    }

    if (expiresAt) {
      const date = new Date(
        `${expiresAt}T00:00:00Z`
      );

      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== expiresAt
      ) {
        throw new Error(
          '유효기간이 올바르지 않습니다.'
        );
      }
    }

    if (
      imageData &&
      (
        imageData.length > MAX_IMAGE_LENGTH ||
        !IMAGE_PATTERN.test(imageData)
      )
    ) {
      throw new Error(
        '바코드 이미지는 PNG·JPG·WEBP 형식으로 등록해 주세요.'
      );
    }

    return {
      brand,
      title,
      code,
      expiresAt: expiresAt || null,
      imageData: imageData || null,
      hash: crypto
        .createHash('sha256')
        .update(code)
        .digest('hex')
    };
  }

  async function addMany(items) {
    requirePool();

    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > MAX_BATCH
    ) {
      throw new Error(
        '쿠폰은 한 번에 1~100개 등록할 수 있습니다.'
      );
    }

    const coupons = items.map(normalize);
    const db = await pool.connect();

    let inserted = 0;

    try {
      await db.query('BEGIN');

      for (const item of coupons) {
        const result = await db.query(`
          INSERT INTO jmc_gift_coupons (
            id,
            brand,
            title,
            coupon_code,
            code_hash,
            image_data,
            expires_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (code_hash) DO NOTHING
          RETURNING id
        `, [
          crypto.randomUUID(),
          item.brand,
          item.title,
          item.code,
          item.hash,
          item.imageData,
          item.expiresAt
        ]);

        inserted += result.rowCount;
      }

      await db.query('COMMIT');

      return {
        inserted,
        duplicates: coupons.length - inserted
      };

    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  }

  async function list() {
    requirePool();

    const [stats, coupons] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INT AS total,
          COUNT(*) FILTER (
            WHERE status='unused'
          )::INT AS unused,
          COUNT(*) FILTER (
            WHERE status='assigned'
          )::INT AS assigned
        FROM jmc_gift_coupons
      `),

      pool.query(`
        SELECT
          id,
          brand,
          title,
          RIGHT(coupon_code, 4) AS last_four,
          image_data IS NOT NULL AS has_image,
          expires_at,
          status,
          assigned_at,
          created_at
        FROM jmc_gift_coupons
        ORDER BY created_at DESC, id DESC
        LIMIT 200
      `)
    ]);

    return {
      stats: stats.rows[0],
      coupons: coupons.rows
    };
  }

  async function removeUnused(id) {
    requirePool();

    const result = await pool.query(`
      DELETE FROM jmc_gift_coupons
      WHERE id=$1
        AND status='unused'
      RETURNING id
    `, [id]);

    if (!result.rowCount) {
      throw new Error(
        '미사용 쿠폰을 찾을 수 없습니다.'
      );
    }
  }

  return {
    enabled: Boolean(pool),
    addMany,
    list,
    removeUnused
  };
}
