export function installMissileClient({
  THREE,
  scene,
  sceneEl,
  renderer,
  camera,
  getAvatar,
  getOthers,
  getMyId,
  send,
  isBlocked
}) {

  let count = 0;
  let nextAt = null;
  let pressedAt = 0;
  let aiming = false;
  let bossActive = false;
  let locked = null;

  const shots = new Map();

  // ========================================
  // 미사일 보유량 표시
  // ========================================

  const indicator = document.createElement('div');

  indicator.style.cssText = `
    position:absolute;
    right:12px;
    top:58px;
    z-index:35;
    background:#12273de8;
    color:white;
    border:1px solid #e0bf87;
    border-radius:10px;
    padding:8px 12px;
    font:700 12px Arial;
    pointer-events:none;
  `;

  indicator.textContent = '🚀 유도 미사일 0/3';
  sceneEl.appendChild(indicator);

  // ========================================
  // 조준 표시
  // ========================================

  const crosshair = document.createElement('div');

  crosshair.style.cssText = `
    position:absolute;
    left:50%;
    top:40%;
    transform:translate(-50%,-50%);
    z-index:39;
    color:#ff7777;
    text-shadow:0 0 7px #000;
    font:800 16px Arial;
    pointer-events:none;
    text-align:center;
    display:none;
  `;

  sceneEl.appendChild(crosshair);

  // ========================================
  // 모바일 미사일 버튼
  // ========================================

  const mobileButton = document.createElement('button');

  mobileButton.type = 'button';
  mobileButton.textContent = '🚀 S 미사일';

  mobileButton.style.cssText = `
    position:absolute;
    right:12px;
    bottom:115px;
    z-index:41;
    padding:12px;
    background:#862f3d;
    color:#fff;
    border:1px solid #ffe1a2;
    border-radius:12px;
    touch-action:none;
    display:none;
  `;

  sceneEl.appendChild(mobileButton);

  if (window.matchMedia('(pointer:coarse)').matches) {
    mobileButton.style.display = 'block';
  }

  // ========================================
  // 전방에서 가장 적합한 목표 검색
  // ========================================

  function availableTarget() {
    const me = getAvatar();

    if (!me) return null;

    const direction =
      me.userData.targetDirection ?? me.rotation.y;

    let best = null;

    const entries = [...getOthers()].map(
      ([id, avatar]) => ({
        id,
        x: avatar.position.x,
        z: avatar.position.z,
        label:
          avatar.userData?.nameTag?.name ||
          '이용자'
      })
    );

    if (bossActive) {
      entries.push({
        id: 'boss',
        x: 0,
        z: -13,
        label: '고래 보스'
      });
    }

    for (const target of entries) {
      const dx = target.x - me.position.x;
      const dz = target.z - me.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance > 15 || distance < 0.2) {
        continue;
      }

      const dot = (
        Math.sin(direction) * dx +
        Math.cos(direction) * dz
      ) / distance;

      if (dot < 0.65) continue;

      const score =
        distance + (1 - dot) * 12;

      if (!best || score < best.score) {
        best = {
          ...target,
          score
        };
      }
    }

    return best;
  }

  // ========================================
  // S키 누르기
  // ========================================

  function press() {
    if (
      aiming ||
      isBlocked() ||
      count < 1 ||
      !getAvatar()
    ) return;

    aiming = true;
    pressedAt = performance.now();

    send({
      type: 'missile_aim_start'
    });

    crosshair.style.display = 'block';
  }

  // ========================================
  // S키 떼기
  // ========================================

  function release() {
    if (!aiming) return;

    aiming = false;
    crosshair.style.display = 'none';

    if (
      performance.now() - pressedAt >= 700 &&
      locked
    ) {
      send({
        type: 'missile_fire',
        targetId: locked.id
      });
    }

    locked = null;
  }

  window.addEventListener('keydown', event => {
    if (
      event.code !== 'KeyS' ||
      event.repeat
    ) return;

    if (
      event.target?.closest?.(
        'input,textarea,select,[contenteditable="true"]'
      )
    ) return;

    event.preventDefault();
    press();
  });

  window.addEventListener('keyup', event => {
    if (event.code === 'KeyS') {
      release();
    }
  });

  window.addEventListener('blur', release);

  mobileButton.addEventListener(
    'pointerdown',
    event => {
      event.preventDefault();

      mobileButton.setPointerCapture(
        event.pointerId
      );

      press();
    }
  );

  mobileButton.addEventListener(
    'pointerup',
    event => {
      event.preventDefault();
      release();
    }
  );

  mobileButton.addEventListener(
    'pointercancel',
    release
  );

  // ========================================
  // 서버 메시지 처리
  // ========================================

  function onMessage(m) {
    if (m.type === 'raid_state') {
      bossActive = m.state === 'active';
    }

    if (m.type === 'missile_state') {
      count = m.count;
      nextAt = m.nextAt;
      return true;
    }

    if (m.type === 'missile_notice') {
      crosshair.textContent = m.message;
      return true;
    }

    if (m.type === 'missile_launch') {
      const geometry = new THREE.ConeGeometry(
        .22,
        .75,
        10
      );

      const material = new THREE.MeshBasicMaterial({
        color: 0xffaa3a
      });

      const object = new THREE.Mesh(
        geometry,
        material
      );

      object.position.set(
        m.x,
        m.y,
        m.z
      );

      scene.add(object);

      shots.set(m.id, {
        object,
        geometry,
        material,
        targetId: m.targetId,
        deadline:
          performance.now() +
          m.flightMs +
          2500
      });

      return true;
    }

    if (
      m.type === 'missile_hit' ||
      m.type === 'missile_end'
    ) {
      const shot = shots.get(m.id);

      if (shot) {
        scene.remove(shot.object);
        shot.geometry.dispose();
        shot.material.dispose();
        shots.delete(m.id);
      }

      return true;
    }

    return false;
  }

  // ========================================
  // 조준 및 추적 애니메이션
  // ========================================

  function animate(now) {
    requestAnimationFrame(animate);

    if (aiming) {
      locked = availableTarget();

      crosshair.textContent = locked
        ? `${
            now - pressedAt >= 700
              ? '🔒 TARGET LOCK'
              : '◎ 조준 중'
          }\n${locked.label}`
        : '◎ 전방에 대상 없음';

      crosshair.style.whiteSpace = 'pre-line';
    }

    const remaining = nextAt
      ? Math.max(
          0,
          Math.ceil(
            (nextAt - Date.now()) / 60000
          )
        )
      : 20;

    indicator.textContent =
      `🚀 ${count}/3 · 다음 지급 ${remaining}분`;

    for (const [id, shot] of shots) {
      const target = shot.targetId === 'boss'
        ? {
            x: 0,
            y: 1.5,
            z: -13
          }
        : getOthers().get(
            shot.targetId
          )?.position ||
          (
            shot.targetId === getMyId()
              ? getAvatar()?.position
              : null
          );

      if (target) {
        const goal = new THREE.Vector3(
          target.x,
          (target.y || 0) + 1.1,
          target.z
        );

        const direction = goal.sub(
          shot.object.position
        );

        const distance = direction.length();

        if (distance > .05) {
          direction.normalize();

          shot.object.position.addScaledVector(
            direction,
            Math.min(distance, .18)
          );

          shot.object.quaternion.setFromUnitVectors(
            new THREE.Vector3(0,1,0),
            direction
          );
        }
      }

      if (now > shot.deadline) {
        scene.remove(shot.object);

        shot.geometry.dispose();
        shot.material.dispose();

        shots.delete(id);
      }
    }
  }

  requestAnimationFrame(animate);

  return {
    onMessage
  };
}
