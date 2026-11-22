
import crypto from 'node:crypto';
import path from 'node:path';

// ========================================
// JMC 관리자 설정
// Google 계정 인증 기반
// ========================================

const BLOCK_MS = 5 * 60 * 1000;

const blockedIPs = new Map();
const auditTrail = [];

let adminGoogleAuth = null;

export const adminState = {
  chatEnabled: true,
  magicEnabled: true
};

export function getClientIP(req) {
  const forwarded = req.headers?.['x-forwarded-for'];

  if (
    typeof forwarded === 'string' &&
    forwarded.trim()
  ) {
    return forwarded
      .split(',')
      .at(-1)
      .trim()
      .slice(0, 128);
  }

  return String(
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  ).slice(0, 128);
}

export function isBlocked(req) {
  const ip = getClientIP(req);
  const until = blockedIPs.get(ip);

  if (!until) return false;

  if (Date.now() >= until) {
    blockedIPs.delete(ip);
    return false;
  }

  return true;
}

function remember(action) {
  auditTrail.unshift({
    id: crypto.randomUUID(),
    action,
    time: Date.now()
  });

  auditTrail.length = Math.min(
    auditTrail.length,
    30
  );
}

function cleanText(value, max = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, max);
}

// ========================================
// 관리자 API 요청 출처 확인
// ========================================

function safeOrigin(req, res, next) {
  if (req.get('x-jmc-admin') !== '1') {
    return res.status(403).json({
      error: '허용되지 않은 요청입니다.'
    });
  }

  const origin = req.get('origin');

  const expected =
    `${req.protocol}://${req.get('host')}`;

  if (!origin || origin !== expected) {
    return res.status(403).json({
      error: '잘못된 요청 출처입니다.'
    });
  }

  next();
}

// ========================================
// 관리자 Google 계정 인증
// 등록한 Google 계정만 접근 가능
// ========================================

async function requireAdmin(req, res, next) {
  const allowedSub = String(
    process.env.JMC_ADMIN_GOOGLE_SUB || ''
  ).trim();

  if (
    !allowedSub ||
    !adminGoogleAuth?.configured
  ) {
    return res.status(503).json({
      error:
        '관리자 Google 계정 설정이 완료되지 않았습니다.'
    });
  }

  try {
    const user = await adminGoogleAuth.getUser(req);

    if (!user) {
      return res.status(401).json({
        error:
          'Google 계정으로 로그인해 주세요.'
      });
    }

    if (user.sub !== allowedSub) {
      return res.status(403).json({
        error:
          '관리자 권한이 없는 Google 계정입니다.'
      });
    }

    req.jmcAdminUser = user;

    next();

  } catch (error) {
    console.error(
      '[ADMIN] Google 인증 오류:',
      error
    );

    res.status(503).json({
      error:
        '관리자 인증을 확인할 수 없습니다.'
    });
  }
}

// ========================================
// 관리자 기능 연결
// ========================================

export function mountAdmin(app, context) {
  const {
    clients,
    votes,
    history,
    magicShots,
    send,
    broadcast,
    presence,
    raid,
    visitorStats,
    missileSystem,
    googleAuth
  } = context;

  adminGoogleAuth = googleAuth;

  app.set('trust proxy', 1);

  // =====================================
  // 관리자 화면
  // =====================================

  app.get('/admin', (_req, res) => {
    res.set('Cache-Control', 'no-store');

    res.sendFile(
      path.resolve('public/admin.html')
    );
  });

  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // =====================================
  // 기존 비밀번호 로그인 차단
  // =====================================

  app.post(
    '/api/admin/login',
    safeOrigin,
    (_req, res) => {
      res.status(410).json({
        error:
          '관리자 비밀번호 로그인은 종료됐습니다. Google 계정으로 로그인해 주세요.'
      });
    }
  );

  // =====================================
  // 관리자 Google 로그인 상태 확인
  // =====================================

  app.get(
    '/api/admin/me',
    requireAdmin,
    (req, res) => {
      res.json({
        ok: true,
        user: {
          name: req.jmcAdminUser.name,
          email: req.jmcAdminUser.email
        }
      });
    }
  );

  // =====================================
  // 실시간 운영 현황
  // =====================================

  app.get(
    '/api/admin/status',
    requireAdmin,
    (_req, res) => {
      const players = [...clients.values()]
        .filter(p => p.ready)
        .map(p => ({
          id: p.id,
          name: p.name,
          animal: p.animal,
          hp: p.hp,
          x: p.x,
          z: p.z,
          vote: p.vote,
          joinedAt: p.joinedAt
        }));

      const mem = process.memoryUsage();

      res.json({
        ok: true,
        now: Date.now(),
        uptime: Math.round(process.uptime()),
        memoryMB: Math.round(
          mem.rss / 1024 / 1024
        ),
        online: players.length,
        visitors: visitorStats.snapshot(),
        connections: clients.size,
        shots: magicShots.length,
        chatCount: history.length,
        votes: {...votes},
        settings: {...adminState},
        players,
        history: history.slice(-40),
        audit: auditTrail.slice(0, 20),
        raid: raid.snapshot()
      });
    }
  );

  // =====================================
  // 관리자 로그아웃
  // 실제 Google 세션 종료는
  // /api/auth/logout 사용
  // =====================================

  app.post(
    '/api/admin/logout',
    safeOrigin,
    requireAdmin,
    (_req, res) => {
      res.json({
        ok: true,
        message:
          'Google 계정 로그아웃을 진행해 주세요.'
      });
    }
  );

  // =====================================
  // 공지 전송
  // =====================================

  app.post(
    '/api/admin/notice',
    safeOrigin,
    requireAdmin,
    (req, res) => {
      const message = cleanText(
        req.body?.message,
        160
      );

      if (!message) {
        return res.status(400).json({
          error: '공지 내용을 입력하세요.'
        });
      }

      const item = {
        id: crypto.randomUUID(),
        senderId: 'jmc-admin',
        name: '운영자 공지',
        animal: 'seal',
        message: `📢 ${message}`,
        time: Date.now()
      };

      history.push(item);

      if (history.length > 40) {
        history.shift();
      }

      broadcast({
        type: 'chat',
        item
      });

      remember('전체 공지 전송');

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 채팅 1건 삭제
  // =====================================

  app.post(
    '/api/admin/chat/delete',
    safeOrigin,
    requireAdmin,
    (req, res) => {
      const id = String(
        req.body?.id ?? ''
      );

      const index = history.findIndex(
        item => item.id === id
      );

      if (index < 0) {
        return res.status(404).json({
          error:
            '해당 채팅을 찾을 수 없습니다.'
        });
      }

      history.splice(index, 1);

      broadcast({
        type: 'chat_deleted',
        id
      });

      remember('채팅 1건 삭제');

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 채팅 전체 초기화
  // =====================================

  app.post(
    '/api/admin/chat/reset',
    safeOrigin,
    requireAdmin,
    (_req, res) => {
      history.length = 0;

      broadcast({
        type: 'chat_reset',
        date: Date.now()
      });

      remember('전체 채팅 초기화');

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 참가자 HP 회복
  // =====================================

  app.post(
    '/api/admin/player/heal',
    safeOrigin,
    requireAdmin,
    (req, res) => {
      const id = String(
        req.body?.id ?? ''
      );

      const entry = [...clients.entries()]
        .find(([, p]) =>
          p.id === id && p.ready
        );

      if (!entry) {
        return res.status(404).json({
          error:
            '접속 중인 이용자가 아닙니다.'
        });
      }

      const [ws, p] = entry;

      p.hp = 100;

      send(ws, {
        type: 'hp',
        hp: p.hp,
        maxHp: 100
      });

      broadcast({
        type: 'player_hp',
        id: p.id,
        hp: p.hp,
        maxHp: 100
      });

      presence();

      remember(
        `${p.name} HP 회복`
      );

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 강제 퇴장 및 5분 접속 제한
  // =====================================

  app.post(
    '/api/admin/player/kick',
    safeOrigin,
    requireAdmin,
    (req, res) => {
      const id = String(
        req.body?.id ?? ''
      );

      const entry = [...clients.entries()]
        .find(([, p]) =>
          p.id === id && p.ready
        );

      if (!entry) {
        return res.status(404).json({
          error:
            '접속 중인 이용자가 아닙니다.'
        });
      }

      const [ws, p] = entry;

      blockedIPs.set(
        p.clientIP,
        Date.now() + BLOCK_MS
      );

      p.ready = false;

      ws.close(
        4003,
        'Removed by admin'
      );

      presence();

      remember(
        `${p.name} 강제 퇴장 (5분)`
      );

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 관리자 전체 미사일 충전
  // =====================================

  app.post(
    '/api/admin/missiles/refill',
    safeOrigin,
    requireAdmin,
    async (_req, res) => {
      try {
        const result =
          await missileSystem.refillOnline();

        remember(
          `전체 미사일 충전: ${result.players}명`
        );

        res.json({
          ok: true,
          ...result
        });

      } catch (error) {
        console.error(
          '[ADMIN] 미사일 충전 오류:',
          error
        );

        res.status(500).json({
          error:
            '전체 미사일 충전에 실패했습니다.'
        });
      }
    }
  );

  // =====================================
  // 채팅 / 마법 기능 ON-OFF
  // =====================================

  app.post(
    '/api/admin/settings',
    safeOrigin,
    requireAdmin,
    (req, res) => {
      const key = req.body?.key;
      const value = req.body?.value;

      if (
        ![
          'chatEnabled',
          'magicEnabled'
        ].includes(key) ||
        typeof value !== 'boolean'
      ) {
        return res.status(400).json({
          error:
            '설정 값이 올바르지 않습니다.'
        });
      }

      adminState[key] = value;

      remember(
        `${key} ${
          value ? '사용' : '중단'
        }`
      );

      res.json({
        ok: true,
        settings: {...adminState}
      });
    }
  );

  // =====================================
  // 롱 / 숏 투표 초기화
  // =====================================

  app.post(
    '/api/admin/votes/reset',
    safeOrigin,
    requireAdmin,
    (_req, res) => {
      votes.long = 0;
      votes.short = 0;

      for (const p of clients.values()) {
        p.vote = null;
      }

      broadcast({
        type: 'votes',
        votes: {...votes}
      });

      remember(
        '롱·숏 투표 초기화'
      );

      res.json({
        ok: true
      });
    }
  );

  // =====================================
  // 고래 레이드 관리자 API
  // =====================================

  app.post(
    '/api/admin/raid/spawn',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        const state = await raid.spawn(
          req.body?.damage ?? 1
        );

        remember(
          '고래 보스 소환'
        );

        res.json({
          ok: true,
          raid: state
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );

  app.post(
    '/api/admin/raid/cancel',
    safeOrigin,
    requireAdmin,
    async (_req, res) => {
      try {
        const state = await raid.cancel();

        remember(
          '고래 레이드 취소'
        );

        res.json({
          ok: true,
          raid: state
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );

  // =====================================
  // 고래 레이드 보상 내역
  // =====================================

  app.get(
    '/api/admin/raid/rewards',
    requireAdmin,
    async (_req, res) => {
      try {
        res.json({
          ok: true,
          prizeEnabled: raid.prizeEnabled,
          rewards: await raid.rewards()
        });

      } catch (error) {
        res.status(500).json({
          error:
            '당첨 기록 조회 실패'
        });
      }
    }
  );

  // =====================================
  // 고래 레이드 보상 검증
  // =====================================

  app.post(
    '/api/admin/raid/verify',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        const valid = await raid.verify(
          String(
            req.body?.rewardId || ''
          ),
          String(
            req.body?.claimCode || ''
          )
        );

        res.json({
          ok: true,
          valid
        });

      } catch (error) {
        res.status(400).json({
          error:
            '증명 코드 검증 실패'
        });
      }
    }
  );

  // =====================================
  // 고래 레이드 기존 쿠폰 지급 완료
  // =====================================

  app.post(
    '/api/admin/raid/paid',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        await raid.markPaid(
          String(
            req.body?.rewardId || ''
          )
        );

        remember(
          '쿠폰 지급 완료'
        );

        res.json({
          ok: true
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );

  // =====================================
  // 고래 비늘 5개 조합 완료자 조회
  // =====================================

  app.get(
    '/api/admin/inventory/requests',
    requireAdmin,
    async (_req, res) => {
      try {
        res.json({
          ok: true,
          enabled: raid.inventory.enabled,
          requests:
            await raid.inventory.requests()
        });

      } catch (error) {
        console.error(
          '[Inventory admin]',
          error
        );

        res.status(500).json({
          error:
            '교환 신청 조회에 실패했습니다.'
        });
      }
    }
  );

  // =====================================
  // 기존 교환 신청 지급 완료 처리
  // =====================================

  app.post(
    '/api/admin/inventory/paid',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        const claimId = String(
          req.body?.claimId || ''
        );

        await raid.inventory.markPaid(
          claimId
        );

        remember(
          '기프티콘 지급 완료'
        );

        res.json({
          ok: true
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );

  // =====================================
  // 관리자 기프티콘 재고 관리
  // =====================================

  // 등록된 기프티콘 재고 조회
  app.get(
    '/api/admin/gifts',
    requireAdmin,
    async (_req, res) => {
      try {
        const data =
          await raid.giftCoupons.list();

        res.json({
          ok: true,
          ...data
        });

      } catch (error) {
        console.error(
          '[GIFTS] List:',
          error
        );

        res.status(500).json({
          error:
            '쿠폰 재고 조회에 실패했습니다.'
        });
      }
    }
  );

  // =====================================
  // 기프티콘 여러 개 등록
  // =====================================

  app.post(
    '/api/admin/gifts/register',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        const result =
          await raid.giftCoupons.addMany(
            req.body?.items
          );

        remember(
          `기프티콘 ${result.inserted}개 등록`
        );

        res.json({
          ok: true,
          ...result
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );

  // =====================================
  // 미사용 기프티콘 삭제
  // =====================================

  app.post(
    '/api/admin/gifts/delete',
    safeOrigin,
    requireAdmin,
    async (req, res) => {
      try {
        await raid.giftCoupons.removeUnused(
          String(
            req.body?.id || ''
          )
        );

        remember(
          '미사용 기프티콘 삭제'
        );

        res.json({
          ok: true
        });

      } catch (error) {
        res.status(400).json({
          error: error.message
        });
      }
    }
  );
}
