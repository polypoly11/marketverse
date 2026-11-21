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
  let maxMissiles = 5;
  let nextAt = null;
  let pressedAt = 0;
  let aiming = false;
  let bossActive = false;
  let locked = null;

  const shots = new Map();

  const LOCK_MS = 700;
  const RANGE = 15;

  // ========================================
  // 미사일 인벤토리
  // ========================================

  const indicator = document.createElement('div');

  indicator.id = 'jmc-missile-inventory';

indicator.style.cssText = `
  position:fixed;
  z-index:9998;
  width:64px;
  min-height:58px;
  box-sizing:border-box;
  padding:8px 4px 7px;
  border:1px solid #d8ba80;
  border-radius:12px;
  background:rgba(15,29,47,.97);
  color:#fff;
  font:700 12px Arial,sans-serif;
  line-height:1.25;
  text-align:center;
  white-space:pre-line;
  cursor:help;
  box-shadow:0 5px 18px rgba(0,0,0,.28);
`;

  indicator.title =
    '🚀 유도 미사일 사용법\n' +
    'S키를 0.7초 이상 누르면 조준합니다.\n' +
    'S키를 떼면 미사일이 발사됩니다.\n' +
    '다른 이용자와 고래 보스를 공격할 수 있습니다.\n' +
    '명중 피해: HP 40\n' +
    '20분마다 1개 지급\n' +
    '최대 3개 보유 가능';

indicator.textContent =
  '🚀\n0/3';

  document.body.appendChild(indicator);

  function positionMissileInventory() {

    const item = document.getElementById(
      'jmc-inventory-toggle'
    );

    if (!item) {
      indicator.style.display = 'none';
      return;
    }

    const rect = item.getBoundingClientRect();

    indicator.style.display = 'block';

    indicator.style.left =
      `${rect.left}px`;

    indicator.style.top =
      `${rect.bottom + 6}px`;

    indicator.style.width =
      `${rect.width}px`;
  }

  positionMissileInventory();

  setInterval(positionMissileInventory, 300);

  // ========================================
  // 카트라이더 스타일 조준 표시
  // ========================================

  const crosshair = document.createElement('div');

  crosshair.style.cssText = `
    position:fixed;
    z-index:9997;
    width:108px;
    height:108px;
    box-sizing:border-box;
    transform:translate(-50%,-50%);
    border:3px solid #ffd45a;
    border-radius:13px;
    box-shadow:
      0 0 18px rgba(255,65,65,.45),
      inset 0 0 14px rgba(255,65,65,.2);
    background:rgba(255,30,30,.04);
    color:white;
    font:bold 12px Arial,sans-serif;
    text-align:center;
    text-shadow:0 2px 5px black;
    pointer-events:none;
    display:none;
    align-items:flex-end;
    justify-content:center;
    padding-bottom:8px;
  `;

  document.body.appendChild(crosshair);

  const aimPosition = new THREE.Vector3();

  function updateTargetReticle(target, isLocked) {

    if (!target) {
      crosshair.style.display = 'none';
      return;
    }

    if (target.id === 'boss') {

      aimPosition.set(0, 4, -13);

    } else {

      const avatar = getOthers().get(target.id);

      if (!avatar) {
        crosshair.style.display = 'none';
        return;
      }

      avatar.getWorldPosition(aimPosition);
      aimPosition.y += 1.35;
    }

    aimPosition.project(camera);

    if (
      aimPosition.z < -1 ||
      aimPosition.z > 1
    ) {
      crosshair.style.display = 'none';
      return;
    }

    const rect =
      renderer.domElement.getBoundingClientRect();

    crosshair.style.left = `${
      rect.left +
      (aimPosition.x + 1) * rect.width / 2
    }px`;

    crosshair.style.top = `${
      rect.top +
      (1 - aimPosition.y) * rect.height / 2
    }px`;

    crosshair.style.display = 'flex';

    crosshair.textContent = isLocked
      ? '🔒 LOCK ON'
      : '◎ TARGET';

    crosshair.style.borderColor = isLocked
      ? '#ff3535'
      : '#ffd45a';

    crosshair.style.boxShadow = isLocked
      ? '0 0 24px rgba(255,40,40,.8)'
      : '0 0 14px rgba(255,210,60,.5)';
  }

  // ========================================
  // 모바일 미사일 버튼
  // ========================================

  const mobileButton = document.createElement('button');

  mobileButton.type = 'button';
  mobileButton.textContent = '🚀';

mobileButton.style.cssText = `
  position:absolute;
  right:14px;
  bottom:178px;
  z-index:41;
  width:54px;
  height:54px;
  padding:0;
  background:rgba(134,47,61,.96);
  color:#fff;
  border:1px solid #ffe1a2;
  border-radius:14px;
  box-shadow:0 4px 14px rgba(0,0,0,.35);
  font:700 22px Arial,sans-serif;
  line-height:54px;
  text-align:center;
  touch-action:none;
  display:none;
  cursor:pointer;
`;

  sceneEl.appendChild(mobileButton);

  if (
    window.matchMedia('(pointer:coarse)').matches
  ) {
    mobileButton.style.display = 'block';
  }

  // ========================================
  // 조준 가능한 대상 검색
  // ========================================

  function availableTarget() {

    const me = getAvatar();

    if (!me) return null;

    const direction =
      me.userData.targetDirection ??
      me.rotation.y;

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

      const dx =
        target.x - me.position.x;

      const dz =
        target.z - me.position.z;

      const distance =
        Math.hypot(dx, dz);

      if (
        distance > RANGE ||
        distance < 0.2
      ) continue;

      const dot = (
        Math.sin(direction) * dx +
        Math.cos(direction) * dz
      ) / distance;

      if (dot < 0.65) continue;

      const score =
        distance + (1 - dot) * 12;

      if (
        !best ||
        score < best.score
      ) {
        best = {
          ...target,
          score
        };
      }
    }

    return best;
  }

  // ========================================
  // S키 누르기: 조준 시작
  // ========================================

  function press() {

    if (
      aiming ||
      isBlocked() ||
      count < 1 ||
      !getAvatar()
    ) return;

    aiming = true;
    locked = null;

    pressedAt = performance.now();

    send({
      type: 'missile_aim_start'
    });
  }

  // ========================================
  // S키 떼기: 유도 미사일 발사
  // ========================================

  function release() {

    if (!aiming) return;

    const elapsed =
      performance.now() - pressedAt;

    const target = locked;

    aiming = false;
    locked = null;

    crosshair.style.display = 'none';

    if (
      elapsed >= LOCK_MS &&
      target
    ) {
      send({
        type: 'missile_fire',
        targetId: target.id
      });
    }
  }

  window.addEventListener(
    'keydown',
    event => {

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
    }
  );

  window.addEventListener(
    'keyup',
    event => {

      if (event.code === 'KeyS') {
        event.preventDefault();
        release();
      }
    }
  );

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
  // 새로운 3D 유도 미사일 모델
  // ========================================

  function createRocketModel() {

    const rocket = new THREE.Group();

    const bodyMat =
      new THREE.MeshStandardMaterial({
        color:0x2787d9,
        metalness:.65,
        roughness:.24
      });

    const noseMat =
      new THREE.MeshStandardMaterial({
        color:0xe63d40,
        metalness:.3,
        roughness:.35
      });

    const finMat =
      new THREE.MeshStandardMaterial({
        color:0xf4bd48,
        metalness:.4,
        roughness:.3
      });

    const engineMat =
      new THREE.MeshBasicMaterial({
        color:0xffa32b
      });

    const metalMat =
      new THREE.MeshStandardMaterial({
        color:0x313641,
        metalness:.8,
        roughness:.3
      });

    // 파란 원통 몸체
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        .18,
        .18,
        .9,
        16
      ),
      bodyMat
    );

    body.rotation.x = Math.PI / 2;
    rocket.add(body);

    // 빨간 탄두
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(
        .18,
        .42,
        16
      ),
      noseMat
    );

    nose.rotation.x = Math.PI / 2;
    nose.position.z = .64;

    rocket.add(nose);

    // 금색 날개 4개
    for (let i = 0; i < 4; i++) {

      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(
          .08,
          .32,
          .35
        ),
        finMat
      );

      const a = i * Math.PI / 2;

      fin.position.set(
        Math.cos(a) * .18,
        Math.sin(a) * .18,
        -.3
      );

      fin.rotation.z = a;

      rocket.add(fin);
    }

    // 엔진 노즐
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(
        .15,
        .2,
        .18,
        12
      ),
      metalMat
    );

    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -.52;

    rocket.add(nozzle);

    // 엔진 불꽃
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(
        .12,
        .5,
        12
      ),
      engineMat
    );

    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -.85;

    rocket.add(flame);

    rocket.userData.flame = flame;

    rocket.scale.setScalar(1.3);

    return rocket;
  }

  // ========================================
  // 미사일 모델 메모리 정리
  // ========================================

  function disposeRocket(object) {

    if (!object) return;

    scene.remove(object);

    object.traverse(child => {

      if (!child.isMesh) return;

      if (child.geometry) {
        child.geometry.dispose();
      }

      if (Array.isArray(child.material)) {

        child.material.forEach(
          material => material.dispose()
        );

      } else if (child.material) {

        child.material.dispose();
      }
    });
  }

  function removeMissile(id) {

    const shot = shots.get(id);

    if (!shot) return;

    disposeRocket(shot.object);

    shots.delete(id);
  }

  // ========================================
  // 서버 메시지 수신
  // ========================================
// ========================================
// 미사일 명중 이펙트
// 폭발 / 파편 / 캐릭터 피격 액션
// ========================================

const missileExplosions = [];
const missileRecoils = [];

const impactFlash = document.createElement('div');

impactFlash.style.cssText = `
  position:fixed;
  inset:0;
  z-index:9996;
  pointer-events:none;
  background:radial-gradient(
    circle,
    transparent 35%,
    rgba(255,65,20,.55) 100%
  );
  opacity:0;
`;

document.body.appendChild(impactFlash);

let impactFlashUntil = 0;

function createMissileExplosion(m) {

  const group = new THREE.Group();

  group.position.set(
    Number(m.x) || 0,
    Number(m.y) || 1.1,
    Number(m.z) || 0
  );

  scene.add(group);

  // 폭발 중심의 밝은 섬광
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(.45,12,8),
    new THREE.MeshBasicMaterial({
      color:0xffdd66,
      transparent:true,
      opacity:.9,
      depthWrite:false
    })
  );

  group.add(core);

  const fragments = [];

  // 불꽃 및 금속 파편 생성
  for (let i = 0; i < 18; i++) {

    const colors = [
      0xffdd55,
      0xff782b,
      0xff3420,
      0xffb94d,
      0x9fa9b7
    ];

    const material = new THREE.MeshBasicMaterial({
      color:colors[i % colors.length],
      transparent:true,
      opacity:1,
      depthWrite:false
    });

    const fragment = new THREE.Mesh(
      new THREE.TetrahedronGeometry(
        .08 + Math.random() * .10
      ),
      material
    );

    const a = Math.random() * Math.PI * 2;

    const speed = 2.5 + Math.random() * 4;

    fragment.userData.velocity = new THREE.Vector3(
      Math.cos(a) * speed,
      1.5 + Math.random() * 4,
      Math.sin(a) * speed
    );

    fragment.userData.spin = new THREE.Vector3(
      Math.random() * 8,
      Math.random() * 8,
      Math.random() * 8
    );

    group.add(fragment);
    fragments.push(fragment);
  }

  missileExplosions.push({
    group,
    core,
    fragments,
    elapsed:0,
    duration:.75
  });

  // 피격 대상 캐릭터 움찔 액션
  const avatar =
    m.targetId === getMyId()
      ? getAvatar()
      : getOthers().get(m.targetId);

  const body = avatar?.userData?.bodyGroup;

  if (body) {

    // 기존 피격 액션 중이라면 초기값 복구
    for (let i = missileRecoils.length - 1; i >= 0; i--) {
      const old = missileRecoils[i];

      if (old.body === body) {
        body.rotation.x = old.baseRotation;
        missileRecoils.splice(i,1);
      }
    }

    missileRecoils.push({
      body,
      baseRotation:body.rotation.x,
      elapsed:0,
      duration:.4
    });
  }

  // 내가 맞았을 때 화면 충격 표시
  if (m.targetId === getMyId()) {
    impactFlashUntil = performance.now() + 350;
  }
}

function updateMissileImpacts(dt,now) {

  // ====================================
  // 폭발 파편 애니메이션
  // ====================================

  for (
    let i = missileExplosions.length - 1;
    i >= 0;
    i--
  ) {

    const effect = missileExplosions[i];

    effect.elapsed += dt;

    const progress = Math.min(
      1,
      effect.elapsed / effect.duration
    );

    effect.core.scale.setScalar(
      1 + progress * 4
    );

    effect.core.material.opacity =
      .9 * (1 - progress);

    for (const fragment of effect.fragments) {

      const velocity =
        fragment.userData.velocity;

      fragment.position.addScaledVector(
        velocity,
        dt
      );

      velocity.y -= 8 * dt;

      fragment.rotation.x +=
        fragment.userData.spin.x * dt;

      fragment.rotation.y +=
        fragment.userData.spin.y * dt;

      fragment.rotation.z +=
        fragment.userData.spin.z * dt;

      fragment.material.opacity =
        Math.max(0,1 - progress);
    }

    if (progress >= 1) {

      scene.remove(effect.group);

      effect.group.traverse(child => {
        if (!child.isMesh) return;

        child.geometry.dispose();
        child.material.dispose();
      });

      missileExplosions.splice(i,1);
    }
  }

  // ====================================
  // 캐릭터 피격 모션
  // ====================================

  for (
    let i = missileRecoils.length - 1;
    i >= 0;
    i--
  ) {

    const recoil = missileRecoils[i];

    recoil.elapsed += dt;

    const progress = Math.min(
      1,
      recoil.elapsed / recoil.duration
    );

    // 뒤로 젖혀졌다가 원래 자세로 복귀
    const impact = Math.sin(
      progress * Math.PI
    );

    recoil.body.rotation.x =
      recoil.baseRotation - impact * .42;

    if (progress >= 1) {

      recoil.body.rotation.x =
        recoil.baseRotation;

      missileRecoils.splice(i,1);
    }
  }

  // ====================================
  // 화면 피격 효과
  // ====================================

  if (now < impactFlashUntil) {

    const remaining =
      (impactFlashUntil - now) / 350;

    impactFlash.style.opacity =
      String(Math.max(0,remaining));

  } else {

    impactFlash.style.opacity = '0';
  }
}
  function onMessage(m) {

    if (m.type === 'raid_state') {

      bossActive = m.state === 'active';

      return false;
    }

if (m.type === 'missile_state') {
  count = Number(m.count) || 0;
  maxMissiles = Number(m.max) || 5;
  nextAt = m.nextAt || null;

  return true;
}

    if (m.type === 'missile_notice') {

      console.info(
        '[JMC MISSILE]',
        m.message
      );

      return true;
    }

    // 유도 미사일 발사
    if (m.type === 'missile_launch') {

      const object = createRocketModel();

      object.position.set(
        m.x,
        m.y,
        m.z
      );

      scene.add(object);

      shots.set(m.id, {
        object,
        targetId:m.targetId,
        deadline:
          performance.now() +
          (Number(m.flightMs) || 1500) +
          2500
      });

      return true;
    }

    // 명중 또는 발사 종료
// 미사일 명중: 폭발 및 피격 액션
if (m.type === 'missile_hit') {

  removeMissile(m.id);

  createMissileExplosion(m);

  return true;
}

// 명중하지 않고 종료된 미사일
if (m.type === 'missile_end') {

  removeMissile(m.id);

  return true;
}

    return false;
  }

  // ========================================
  // 유도 미사일 애니메이션
  // ========================================

  const forwardAxis =
    new THREE.Vector3(0,0,1);

  const goal = new THREE.Vector3();

  const directionVector =
    new THREE.Vector3();

  let lastFrame = performance.now();

  function animate(now) {

    requestAnimationFrame(animate);

    const dt = Math.min(
      (now - lastFrame) / 1000,
      .05
    );

    lastFrame = now;
updateMissileImpacts(dt,now);
    // ====================================
    // 조준 표시 갱신
    // ====================================

    if (aiming) {

      locked = availableTarget();

      updateTargetReticle(
        locked,
        now - pressedAt >= LOCK_MS
      );

    } else {

      crosshair.style.display = 'none';
    }

    // ====================================
    // 미사일 인벤토리 갱신
    // ====================================

    const remaining = nextAt
      ? Math.max(
          0,
          Math.ceil(
            (nextAt - Date.now()) / 60000
          )
        )
      : 20;

indicator.textContent =
  `🚀\n${count}/${maxMissiles}\n${remaining}분`;

    // ====================================
    // 미사일 이동 및 추적
    // ====================================

    for (const [id, shot] of shots) {

      let targetPosition = null;

      if (shot.targetId === 'boss') {

        targetPosition = {
          x:0,
          y:1.5,
          z:-13
        };

      } else {

        const other =
          getOthers().get(shot.targetId);

        if (other) {

          targetPosition = other.position;

        } else if (
          shot.targetId === getMyId()
        ) {

          targetPosition =
            getAvatar()?.position || null;
        }
      }

      if (targetPosition) {

        goal.set(
          targetPosition.x,
          (targetPosition.y || 0) + 1.1,
          targetPosition.z
        );

        directionVector.subVectors(
          goal,
          shot.object.position
        );

        const distance =
          directionVector.length();

        if (distance > .05) {

          directionVector.normalize();

          // 프레임 속도에 맞춰 미사일 이동
          const speed = 12;

          shot.object.position.addScaledVector(
            directionVector,
            Math.min(
              distance,
              speed * dt
            )
          );

          // 탄두가 목표를 향하도록 회전
          shot.object.quaternion.setFromUnitVectors(
            forwardAxis,
            directionVector
          );
        }
      }

      // 엔진 화염 애니메이션
      const flame =
        shot.object.userData.flame;

      if (flame) {

        flame.scale.y =
          0.8 +
          Math.sin(now * .025) * .2;
      }

      // 오래된 미사일 제거
      if (now > shot.deadline) {

        removeMissile(id);
      }
    }
  }

  requestAnimationFrame(animate);

  return {
    onMessage
  };
}
