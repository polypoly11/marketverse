
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const dataDir =
  process.env.JMC_DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(process.cwd(), 'data');

const legacyFile = path.join(dataDir, 'visitors.json');

const VISITOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function koreanDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function insertHashes(client, table, hashes, date = null) {
  const validHashes = [...new Set(hashes)].filter(
    hash => HASH_PATTERN.test(hash)
  );

  for (let i = 0; i < validHashes.length; i += 400) {
    const batch = validHashes.slice(i, i + 400);

    const params = date
      ? [date, ...batch]
      : batch;

    const values = batch.map((_, n) =>
      date
        ? `($1,$${n + 2})`
        : `($${n + 1})`
    );

    const columns = date
      ? '(day,visitor_hash)'
      : '(visitor_hash)';

    await client.query(
      `INSERT INTO ${table} ${columns}
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      params
    );
  }
}

export async function createVisitorStats() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      '[JMC] DATABASE_URL이 없어 방문 통계를 영구 저장할 수 없습니다.'
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_visitor_totals (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        started_at BIGINT NOT NULL,
        day TEXT NOT NULL,
        total_users BIGINT NOT NULL DEFAULT 0,
        total_visits BIGINT NOT NULL DEFAULT 0,
        today_users BIGINT NOT NULL DEFAULT 0,
        today_visits BIGINT NOT NULL DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_visitor_unique_users (
        visitor_hash TEXT PRIMARY KEY
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jmc_visitor_daily_users (
        day TEXT NOT NULL,
        visitor_hash TEXT NOT NULL,
        PRIMARY KEY (day, visitor_hash)
      )
    `);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const inserted = await client.query(`
        INSERT INTO jmc_visitor_totals (id, started_at, day)
        VALUES (1, $1, $2)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `, [Date.now(), koreanDate()]);

      // 기존 JSON 통계는 DB 최초 생성 시 한 번만 이전
      if (inserted.rowCount === 1) {
        let legacy = null;

        try {
          legacy = JSON.parse(
            await fs.readFile(legacyFile, 'utf8')
          );
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(
              '[JMC] 기존 방문 통계 파일 읽기 실패:',
              error
            );
          }
        }

        if (legacy?.version === 1 && legacy.users) {
          const users = Object.keys(legacy.users);
          const dailyUsers = Object.keys(
            legacy.todayUserIds || {}
          );

          await insertHashes(
            client,
            'jmc_visitor_unique_users',
            users
          );

          const sameDay = legacy.date === koreanDate();

          if (sameDay) {
            await insertHashes(
              client,
              'jmc_visitor_daily_users',
              dailyUsers,
              koreanDate()
            );
          }

          await client.query(`
            UPDATE jmc_visitor_totals SET
              started_at=$1,
              total_users=$2,
              total_visits=$3,
              today_users=$4,
              today_visits=$5
            WHERE id=1
          `, [
            Number(legacy.startedAt) || Date.now(),
            Math.max(
              Number(legacy.totalUsers) || 0,
              users.length
            ),
            Math.max(
              Number(legacy.totalVisits) || 0,
              0
            ),
            sameDay
              ? Math.max(
                  Number(legacy.todayUsers) || 0,
                  dailyUsers.length
                )
              : 0,
            sameDay
              ? Math.max(
                  Number(legacy.todayVisits) || 0,
                  0
                )
              : 0
          ]);

          console.info(
            '[JMC] 기존 visitors.json 방문 통계 DB 이전 완료'
          );
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;

    } finally {
      client.release();
    }

  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }

  let stats = (await pool.query(
    'SELECT * FROM jmc_visitor_totals WHERE id=1'
  )).rows[0];

  let saveError = null;
  let queue = Promise.resolve();

  function snapshot() {
    const isToday = stats.day === koreanDate();

    return {
      totalUsers: Number(stats.total_users),
      totalVisits: Number(stats.total_visits),
      todayUsers: isToday
        ? Number(stats.today_users)
        : 0,
      todayVisits: isToday
        ? Number(stats.today_visits)
        : 0,
      startedAt: Number(stats.started_at),
      persistent: true,
      saveError
    };
  }

  async function saveVisit(visitorId) {
    const id =
      typeof visitorId === 'string' &&
      VISITOR_ID_PATTERN.test(visitorId)
        ? visitorId.toLowerCase()
        : crypto.randomUUID();

    const hash = crypto
      .createHash('sha256')
      .update(id)
      .digest('hex');

    const today = koreanDate();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 통계 행 잠금으로 동시 입장 시 집계 충돌 방지
      const existing = await client.query(
        'SELECT day FROM jmc_visitor_totals WHERE id=1 FOR UPDATE'
      );

      if (existing.rows[0].day !== today) {
        await client.query(`
          UPDATE jmc_visitor_totals
          SET day=$1, today_users=0, today_visits=0
          WHERE id=1
        `, [today]);

        await client.query(
          'DELETE FROM jmc_visitor_daily_users WHERE day<>$1',
          [today]
        );
      }

      // 평생 순사용자 중복 방지
      const unique = await client.query(`
        INSERT INTO jmc_visitor_unique_users (visitor_hash)
        VALUES ($1)
        ON CONFLICT DO NOTHING
        RETURNING visitor_hash
      `, [hash]);

      // 당일 순사용자 중복 방지
      const daily = await client.query(`
        INSERT INTO jmc_visitor_daily_users (day, visitor_hash)
        VALUES ($1,$2)
        ON CONFLICT DO NOTHING
        RETURNING visitor_hash
      `, [today, hash]);

      // 누적 방문 횟수는 매 입장마다 증가
      const result = await client.query(`
        UPDATE jmc_visitor_totals SET
          total_visits=total_visits+1,
          today_visits=today_visits+1,
          total_users=total_users+$1,
          today_users=today_users+$2
        WHERE id=1
        RETURNING *
      `, [
        unique.rowCount,
        daily.rowCount
      ]);

      await client.query('COMMIT');

      stats = result.rows[0];
      saveError = null;

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});

      saveError = error.message;

      console.error(
        '[JMC] 방문 통계 DB 저장 실패:',
        error
      );

      throw error;

    } finally {
      client.release();
    }
  }

  function record(visitorId) {
    const pending = queue.then(
      () => saveVisit(visitorId)
    );

    queue = pending.catch(() => {});

    return pending;
  }

  console.info(
    '[JMC] PostgreSQL 영구 방문 통계 활성화'
  );

  return {
    record,
    snapshot
  };
}
