
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir =
  process.env.JMC_DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(process.cwd(), 'data');

const filePath = path.join(dataDir, 'visitors.json');
const persistent = Boolean(
  process.env.JMC_DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH
);

function koreanDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function createEmptyStats() {
  return {
    version: 1,
    startedAt: Date.now(),
    date: koreanDate(),
    totalUsers: 0,
    totalVisits: 0,
    todayUsers: 0,
    todayVisits: 0,
    users: {},
    todayUserIds: {}
  };
}

export async function createVisitorStats() {
  await fs.mkdir(dataDir, { recursive: true });

  let stats;

  try {
    stats = JSON.parse(
      await fs.readFile(filePath, 'utf8')
    );

    if (
      stats.version !== 1 ||
      !stats.users ||
      !stats.todayUserIds
    ) {
      throw new Error('Invalid visitor stats file');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    stats = createEmptyStats();
  }

  let saveQueue = Promise.resolve();
  let saveError = null;

  function refreshDate() {
    const today = koreanDate();

    if (stats.date !== today) {
      stats.date = today;
      stats.todayUsers = 0;
      stats.todayVisits = 0;
      stats.todayUserIds = {};
    }
  }

  function snapshot() {
    refreshDate();

    return {
      totalUsers: stats.totalUsers,
      totalVisits: stats.totalVisits,
      todayUsers: stats.todayUsers,
      todayVisits: stats.todayVisits,
      startedAt: stats.startedAt,
      persistent,
      saveError
    };
  }

  function record(visitorId) {
    refreshDate();

    const valid =
      typeof visitorId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId);

    const id = valid
      ? visitorId.toLowerCase()
      : crypto.randomUUID();

    const hash = crypto.createHash('sha256')
      .update(id)
      .digest('hex');

    stats.totalVisits++;
    stats.todayVisits++;

    if (!Object.hasOwn(stats.users, hash)) {
      stats.users[hash] = true;
      stats.totalUsers++;
    }

    if (!Object.hasOwn(stats.todayUserIds, hash)) {
      stats.todayUserIds[hash] = true;
      stats.todayUsers++;
    }

    const data = JSON.stringify(stats);

    saveQueue = saveQueue.then(async () => {
      const tempPath = filePath + '.tmp';

      await fs.writeFile(tempPath, data, 'utf8');
      await fs.rename(tempPath, filePath);

      saveError = null;
    }).catch(error => {
      saveError = error.message;
      console.error(
        '[JMC] Visitor stats save failed:',
        error
      );
    });

    return saveQueue;
  }

  console.log(
    '[JMC] Visitor stats initialized:',
    filePath
  );

  return { record, snapshot };
}
