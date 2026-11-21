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
  const LOCK_MS = 700;
  const RANGE = 15;

  const shots = new Map();
  const explosions = [];
  const recoils = [];

  const forwardAxis = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let count = 0;
  let maxMissiles = 5;
  let nextAt = null;
  let pressedAt = 0;
  let aiming = false;
  let locked = null;
  let bossActive = false;
  let impactFlashUntil = 0;

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
    'S키 또는 모바일 🚀 버튼을 0.7초 이상 누른 뒤 떼면 발사\n' +
    '다른 이용자와 고래 보스 공격 가능\n' +
    '직격 40 / 근접 25 / 외곽 10 / 회피 0 피해\n' +
    '접속 중 10분마다 1개 충전';

  indicator.textContent = '🚀\n0/5';

  document.body.appendChild(indicator);

  function positionInventory() {
    const item = document.getElementById(
      'jmc-inventory-toggle'
    );

    if (
      !item ||
      !item.getClientRects().length
    ) {
      indicator.style.display = 'none';
      return;
    }

    const r = item.getBoundingClientRect();

    indicator.style.display = 'block';
    indicator.style.left = `${r.left}px`;
    indicator.style.top = `${r.bottom + 6}px`;
    indicator.style.width = `${r.width}px`;
  }

  positionInventory();

  setInterval(positionInventory, 300);

  // ========================================
  // 조준 표시
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

  function updateReticle(target, isLocked) {
    if (!target) {
      crosshair.style.display = 'none';
      return;
    }

    if (target.id === 'boss') {
      projected.set(0, 2.2, -13);
    } else {
      const avatar = getOthers().get(target.id);

      if (!avatar) {
        crosshair.style.display = 'none';
        return;
      }

      avatar.getWorldPosition(projected);
      projected.y += 1.35;
    }

    projected.project(camera);

    if (
      projected.z < -1 ||
      projected.z > 1
    ) {
      crosshair.style.display = 'none';
      return;
    }

    const r = renderer.domElement.getBoundingClientRect();

    crosshair.style.left = `${
      r.left + (projected.x + 1) * r.width / 2
    }px`;

    crosshair.style.top = `${
      r.top + (1 - projected.y) * r.height / 2
    }px`;

    crosshair.style.display = 'flex';

    crosshair.textContent = isLocked
      ? '🔒 조준 완료'
      : '◎ 조준 중';

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

  mobileButton.setAttribute(
    'aria-label',
    '유도 미사일 조준 및 발사'
  );

  mobileButton.style.cssText = `
    position:fixed;
    z-index:45;
    width:48px;
    height:48px;
    padding:0;
    background:rgba(134,47,61,.96);
    color:#fff;
    border:1px solid #ffe1a2;
    border-radius:12px;
    box-shadow:0 4px 14px rgba(0,0,0,.35);
    font:700 22px Arial,sans-serif;
    display:none;
    align-items:center;
    justify-content:center;
    touch-action:none;
    user-select:none;
    cursor:pointer;
  `;

  document.body.appendChild(mobileButton);

  const mobileMedia = window.matchMedia(
    '(max-width:980px), (pointer:coarse)'
  );

  function positionMobileButton() {
    const bar = document.getElementById(
      'mobile-actions'
    );

    if (
      !mobileMedia.matches ||
      !bar ||
      !bar.getClientRects().length
    ) {
      mobileButton.style.display = 'none';
      return;
    }

    const r = bar.getBoundingClientRect();

    if (!r.width || !r.height) {
      mobileButton.style.display = 'none';
      return;
    }

    const size = 48;
    const gap = 12;

    let x = Math.max(
      8,
      Math.min(
        window.innerWidth - size - 8,
        r.left + (r.width - size) / 2
      )
    );

    let y = r.top - size - gap;

    if (y < 8) {
      x = Math.max(
        8,
        r.left - size - gap
      );

      y = Math.max(
        8,
        r.top + (r.height - size) / 2
      );
    }

    mobileButton.style.left = `${x}px`;
    mobileButton.style.top = `${y}px`;
    mobileButton.style.display = 'flex';
  }

  positionMobileButton();

  window.addEventListener(
    'resize',
    positionMobileButton
  );

  window.addEventListener(
    'orientationchange',
    positionMobileButton
  );

  setInterval(positionMobileButton, 300);

  // ========================================
  // 조준 가능한 대상 검색
  // ========================================

  function availableTarget() {
    const me = getAvatar();

    if (!me) return null;

    const facing =
      me.userData.targetDirection ??
      me.rotation.y;

    const entries = [...getOthers()].map(
      ([id, avatar]) => ({
        id,
        x: avatar.position.x,
        z: avatar.position.z
      })
    );

    if (bossActive) {
      entries.push({
        id: 'boss',
        x: 0,
        z: -13
      });
    }

    let best = null;

    for (const item of entries) {
      const dx = item.x - me.position.x;
      const dz = item.z - me.position.z;
      const distance = Math.hypot(dx, dz);

      if (
        distance < 0.2 ||
        distance > RANGE
      ) {
        continue;
      }

      const dot = (
        Math.sin(facing) * dx +
        Math.cos(facing) * dz
      ) / distance;

      if (dot < 0.65) continue;

      const score =
        distance + (1 - dot) * 12;

      if (
        !best ||
        score < best.score
      ) {
        best = {
          ...item,
          score
        };
      }
    }

    return best;
  }

  // ========================================
  // S키 / 모바일 조준 및 발사
  // ========================================

  function press() {
    if (
      aiming ||
      isBlocked?.() ||
      count <= 0
    ) {
      return;
    }

    aiming = true;
    pressedAt = performance.now();
    locked = null;

    send({
      type: 'missile_aim_start'
    });
  }

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
      target &&
      !isBlocked?.()
    ) {
      send({
        type: 'missile_fire',
        targetId: target.id
      });
    }
  }

  window.addEventListener(
    'keydown',
    e => {
      if (
        e.code !== 'KeyS' ||
        e.repeat
      ) {
        return;
      }

      if (
        e.target?.closest?.(
          'input,textarea,select,[contenteditable="true"]'
        )
      ) {
        return;
      }

      e.preventDefault();
      press();
    }
  );

  window.addEventListener(
    'keyup',
    e => {
      if (e.code === 'KeyS') {
        e.preventDefault();
        release();
      }
    }
  );

  window.addEventListener('blur', release);

  mobileButton.addEventListener(
    'pointerdown',
    e => {
      e.preventDefault();

      mobileButton.setPointerCapture(
        e.pointerId
      );

      press();
    }
  );

  mobileButton.addEventListener(
    'pointerup',
    e => {
      e.preventDefault();
      release();
    }
  );

  mobileButton.addEventListener(
    'pointercancel',
    release
  );

  // ========================================
  // 3D 미사일 모델
  // ========================================

  function createRocket() {
    const rocket = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2787d9,
      metalness: 0.65,
      roughness: 0.24
    });

    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xe63d40,
      metalness: 0.3,
      roughness: 0.35
    });

    const finMat = new THREE.MeshStandardMaterial({
      color: 0xf4bd48,
      metalness: 0.4,
      roughness: 0.3
    });

    const engineMat = new THREE.MeshBasicMaterial({
      color: 0xffa32b
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x313641,
      metalness: 0.8,
      roughness: 0.3
    });

    // 몸체
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.18,
        0.18,
        0.9,
        16
      ),
      bodyMat
    );

    body.rotation.x = Math.PI / 2;
    rocket.add(body);

    // 탄두
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(
        0.18,
        0.42,
        16
      ),
      noseMat
    );

    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.64;

    rocket.add(nose);

    // 날개
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.08,
          0.32,
          0.35
        ),
        finMat
      );

      const a = i * Math.PI / 2;

      fin.position.set(
        Math.cos(a) * 0.18,
        Math.sin(a) * 0.18,
        -0.3
      );

      fin.rotation.z = a;

      rocket.add(fin);
    }

    // 엔진 노즐
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.15,
        0.2,
        0.18,
        12
      ),
      metalMat
    );

    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -0.52;

    rocket.add(nozzle);

    // 엔진 불꽃
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(
        0.12,
        0.5,
        12
      ),
      engineMat
    );

    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -0.85;

    rocket.add(flame);

    rocket.userData.flame = flame;

    rocket.scale.setScalar(1.3);

    return rocket;
  }

  // ========================================
  // 3D 객체 메모리 정리
  // ========================================

  function disposeObject(obj) {
    if (!obj) return;

    scene.remove(obj);

    const geometries = new Set();
    const materials = new Set();

    obj.traverse(child => {
      if (!child.isMesh) return;

      if (child.geometry) {
        geometries.add(child.geometry);
      }

      if (Array.isArray(child.material)) {
        child.material.forEach(
          material => materials.add(material)
        );
      } else if (child.material) {
        materials.add(child.material);
      }
    });

    geometries.forEach(
      geometry => geometry.dispose()
    );

    materials.forEach(
      material => material.dispose()
    );
  }
  // ========================================
  // 유도 미사일 비행 효과음
  // ========================================

  let missileAudioCtx = null;
  const missileSounds = new Map();

  function missileSoundEnabled() {
    try {
      return localStorage.getItem(
        'jmc-sfx-enabled'
      ) !== '0';
    } catch {
      return true;
    }
  }

  function getMissileAudio() {
    try {
      if (!missileAudioCtx) {
        const AudioClass =
          window.AudioContext ||
          window.webkitAudioContext;

        if (!AudioClass) return null;

        missileAudioCtx = new AudioClass();
      }

      if (missileAudioCtx.state === 'suspended') {
        missileAudioCtx.resume().catch(() => {});
      }

      return missileAudioCtx;
    } catch {
      return null;
    }
  }

  // 모바일 및 PC에서 사용자 조작 시 오디오 활성화
  document.addEventListener(
    'pointerdown',
    getMissileAudio,
    { passive: true }
  );

  document.addEventListener(
    'keydown',
    getMissileAudio
  );

   function startMissileSound(id) {
    if (
      !missileSoundEnabled() ||
      missileSounds.has(id)
    ) return;

    const ctx = getMissileAudio();

    if (!ctx) return;

    try {
      const engine = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // 부드러운 로켓 추진음
      engine.type = 'triangle';

      engine.frequency.setValueAtTime(
        170,
        ctx.currentTime
      );

      // 높은 주파수 제거
      filter.type = 'lowpass';
      filter.frequency.value = 280;

      // 자연스럽게 시작하는 작은 음량
      gain.gain.setValueAtTime(
        0,
        ctx.currentTime
      );

      gain.gain.linearRampToValueAtTime(
        0.008,
        ctx.currentTime + 0.12
      );

      engine.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      engine.start();

      missileSounds.set(id, {
        engine,
        filter,
        gain
      });

    } catch (error) {
      console.warn(
        '[MISSILE] 효과음 시작 실패',
        error
      );
    }
  }

  function stopMissileSound(id) {
    const sound = missileSounds.get(id);

    if (!sound) return;

    missileSounds.delete(id);

    try {
      const ctx = missileAudioCtx;
      const now = ctx.currentTime;

      sound.gain.gain.cancelScheduledValues(now);

      sound.gain.gain.setValueAtTime(
        sound.gain.gain.value,
        now
      );

      sound.gain.gain.linearRampToValueAtTime(
        0,
        now + 0.08
      );

      sound.engine.stop(now + 0.1);

      sound.engine.onended = () => {
        sound.engine.disconnect();
        sound.filter.disconnect();
        sound.gain.disconnect();
      };

    } catch {}
  }

  function updateMissileSounds(now) {
    const enabled = missileSoundEnabled();

    for (const [id, shot] of shots) {
      if (!enabled) {
        stopMissileSound(id);
        continue;
      }

      if (!missileSounds.has(id)) {
        startMissileSound(id);
      }

      const sound = missileSounds.get(id);

      if (!sound) continue;

      // 비행 중 미세한 엔진 회전 변화
const pitch =
  170 + Math.sin(now * 0.008) * 5;

      sound.engine.frequency.setTargetAtTime(
        pitch,
        missileAudioCtx.currentTime,
        0.05
      );
    }
  }
function removeMissile(id) {
  stopMissileSound(id);

  const shot = shots.get(id);

  if (!shot) return;

  disposeObject(shot.object);

  shots.delete(id);
}

  // ========================================
  // 피격 화면 효과
  // ========================================

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

  // ========================================
  // 폭발 및 파편 효과
  // ========================================

  function createExplosion(m) {
    const group = new THREE.Group();

    group.position.set(
      Number(m.x) || 0,
      Number(m.y) || 1.1,
      Number(m.z) || 0
    );

    scene.add(group);

    const damage = Math.max(
      0,
      Number(m.damage) || 0
    );

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.45,
        12,
        8
      ),
      new THREE.MeshBasicMaterial({
        color: damage ? 0xffdd66 : 0xffa355,
        transparent: true,
        opacity: damage ? 0.9 : 0.5,
        depthWrite: false
      })
    );

    group.add(core);

    const fragments = [];

    const total =
      damage >= 25
        ? 18
        : damage > 0
          ? 12
          : 8;

    const palette = [
      0xffdd55,
      0xff782b,
      0xff3420,
      0xffb94d,
      0x9fa9b7
    ];

    for (let i = 0; i < total; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(
          0.08 + Math.random() * 0.1
        ),
        new THREE.MeshBasicMaterial({
          color: palette[i % palette.length],
          transparent: true,
          opacity: 1,
          depthWrite: false
        })
      );

      const a =
        Math.random() * Math.PI * 2;

      const speed =
        2.5 + Math.random() * 4;

      mesh.userData.velocity = new THREE.Vector3(
        Math.cos(a) * speed,
        1.5 + Math.random() * 4,
        Math.sin(a) * speed
      );

      mesh.userData.spin = new THREE.Vector3(
        Math.random() * 8,
        Math.random() * 8,
        Math.random() * 8
      );

      group.add(mesh);
      fragments.push(mesh);
    }

    explosions.push({
      group,
      core,
      fragments,
      elapsed: 0,
      duration: 0.75
    });

    // 완전 회피면 캐릭터 피격 모션 없음
    if (damage <= 0) return;

    const avatar =
      m.targetId === getMyId()
        ? getAvatar()
        : getOthers().get(m.targetId);

    const body =
      avatar?.userData?.bodyGroup;

    if (body) {
      for (
        let i = recoils.length - 1;
        i >= 0;
        i--
      ) {
        if (recoils[i].body === body) {
          body.rotation.x =
            recoils[i].initial;

          recoils.splice(i, 1);
        }
      }

      recoils.push({
        body,
        initial: body.rotation.x,
        elapsed: 0,
        duration: 0.4,
        damage
      });
    }

    if (m.targetId === getMyId()) {
      impactFlashUntil =
        performance.now() + 350;
    }
  }

  // ========================================
  // 폭발 / 피격 애니메이션
  // ========================================

  function updateImpacts(dt, now) {
    for (
      let i = explosions.length - 1;
      i >= 0;
      i--
    ) {
      const effect = explosions[i];

      effect.elapsed += dt;

      const t = Math.min(
        1,
        effect.elapsed / effect.duration
      );

      effect.core.scale.setScalar(
        1 + t * 4
      );

      effect.core.material.opacity =
        0.9 * (1 - t);

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
          Math.max(0, 1 - t);
      }

      if (t >= 1) {
        disposeObject(effect.group);
        explosions.splice(i, 1);
      }
    }

    for (
      let i = recoils.length - 1;
      i >= 0;
      i--
    ) {
      const recoil = recoils[i];

      recoil.elapsed += dt;

      const t = Math.min(
        1,
        recoil.elapsed / recoil.duration
      );

      const size =
        recoil.damage >= 40
          ? 0.42
          : recoil.damage >= 25
            ? 0.28
            : 0.14;

      recoil.body.rotation.x =
        recoil.initial -
        Math.sin(t * Math.PI) * size;

      if (t >= 1) {
        recoil.body.rotation.x =
          recoil.initial;

        recoils.splice(i, 1);
      }
    }

    impactFlash.style.opacity =
      now < impactFlashUntil
        ? String(
            Math.max(
              0,
              (impactFlashUntil - now) / 350
            )
          )
        : '0';
  }

  // ========================================
  // 서버 메시지 처리
  // ========================================

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

    // 미사일 생성
    if (m.type === 'missile_launch') {
      const object = createRocket();

      const x = Number(m.x) || 0;
      const y = Number(m.y) || 1.2;
      const z = Number(m.z) || 0;

      object.position.set(x, y, z);
      object.rotation.y = Number(m.angle) || 0;

      scene.add(object);

      shots.set(m.id, {
        object,
        serverPosition: new THREE.Vector3(
          x,
          y,
          z
        ),
        targetId: m.targetId,
        angle: Number(m.angle) || 0,
        deadline:
          performance.now() +
          (Number(m.flightMs) || 2800) +
          3000
      });

      return true;
    }

    // 서버에서 계산한 미사일 위치
    if (m.type === 'missile_position') {
      const shot = shots.get(m.id);

      if (!shot) return true;

      shot.serverPosition.set(
        Number(m.x) || 0,
        Number(m.y) || 1.2,
        Number(m.z) || 0
      );

      shot.angle = Number(m.angle) || 0;

      return true;
    }

    // 실제 명중
    if (m.type === 'missile_hit') {
      removeMissile(m.id);
      createExplosion(m);
      return true;
    }

    // 빗나간 미사일 종료
    if (m.type === 'missile_end') {
      removeMissile(m.id);

      if (
        m.exploded &&
        Number.isFinite(Number(m.x))
      ) {
        createExplosion(m);
      }

      return true;
    }

    return false;
  }

  // ========================================
  // 서버 탄도 기반 화면 렌더링
  // ========================================

  let lastFrame = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(
      Math.max(
        0,
        (now - lastFrame) / 1000
      ),
      0.05
    );

lastFrame = now;

updateImpacts(dt, now);

// 미사일 추진음 실행 및 음량 설정 반영
updateMissileSounds(now);

    // 조준 표시 갱신
    if (aiming) {
      locked = availableTarget();

      updateReticle(
        locked,
        now - pressedAt >= LOCK_MS
      );
    } else {
      crosshair.style.display = 'none';
    }

    // 미사일 보유량 / 충전 시간 표시
    const remaining = nextAt
      ? Math.max(
          0,
          Math.ceil(
            (nextAt - Date.now()) / 60000
          )
        )
      : 10;

    indicator.textContent =
      `🚀\n${count}/${maxMissiles}\n${remaining}분`;

    // 미사일 이동
    for (const [id, shot] of shots) {
      shot.object.position.lerp(
        shot.serverPosition,
        Math.min(1, dt * 20)
      );

      dir.set(
        Math.sin(shot.angle),
        0,
        Math.cos(shot.angle)
      );

      shot.object.quaternion.setFromUnitVectors(
        forwardAxis,
        dir
      );

      // 엔진 화염
      const flame =
        shot.object.userData.flame;

      if (flame) {
        flame.scale.y =
          0.8 +
          Math.sin(now * 0.025) * 0.2;
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
