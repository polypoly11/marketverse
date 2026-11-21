import crypto from 'node:crypto';

const REWARD_MS = 20 * 60 * 1000;
const MAX_MISSILES = 3;
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

  function state(ws, p) {
    send(ws, {
      type: 'missile_state',
      count: p.missileCount ?? 0,
      max: MAX_MISSILES,
      nextAt: p.missileNextAt ?? null
    });
  }

  function join(ws, p) {
    if (p.missileCount !== undefined) {
      return state(ws, p);
    }

    p.missileCount = 1;
    p.missileNextAt = Date.now() + REWARD_MS;
    p.missileAimAt = 0;

    state(ws, p);
  }

  const timer = setInterval(() => {
    const now = Date.now();

    for (const [ws, p] of clients) {
      if (
        !p.ready ||
        p.hp <= 0 ||
        p.missileNextAt == null
      ) continue;

      if (now < p.missileNextAt) continue;

      p.missileNextAt = now + REWARD_MS;

      if (p.missileCount < MAX_MISSILES) {
        p.missileCount++;
      }

      state(ws, p);
    }
  }, 1000);

  timer.unref?.();

  function targetFor(p, id) {
    if (id === 'boss') {
      const boss = raid.snapshot();

      if (boss.state !== 'active') return null;

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

    if (distance > RANGE || distance < 0.2) {
      return false;
    }

    const facing =
      Math.sin(p.direction) * dx +
      Math.cos(p.direction) * dz;

    return facing / distance >= 0.65;
  }

  function handle(ws, p, m) {
    if (m.type === 'missile_aim_start') {
      if (
        p.ready &&
        p.hp > 0 &&
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
      !p.missileCount ||
      !aimAt ||
      Date.now() - aimAt < LOCK_MS
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

    // 유효한 조준에 성공했을 때만 소비
    p.missileCount--;
    state(ws, p);

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
      const liveTarget = targetFor(p, target.id);

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

      // 고래 보스에게 40 피해
      if (target.id === 'boss') {
        raid.hit(
          { id },
          impact,
          DAMAGE
        );
        return;
      }

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
              '[MISSILE] PVP 저장 오류:',
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

    return true;
  }

  return {
    join,
    handle,
    state
  };
}
