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

  // ========================================
  // 미사일 충전 SVG 테두리
  // ========================================

  const MISSILE_RECHARGE_MS = 3 * 60 * 1000;

  const indicator = document.createElement('div');

  indicator.id = 'jmc-missile-inventory';

  indicator.style.cssText = `
    position:fixed;
    z-index:9998;
    width:64px;
    min-height:58px;
    box-sizing:border-box;
    padding:8px 4px 7px;
    border:1px solid rgba(216,186,128,.35);
    border-radius:12px;
    background:rgba(15,29,47,.97);
    color:#fff;
    font:700 12px Arial,sans-serif;
    line-height:1.25;
    text-align:center;
    white-space:pre-line;
    cursor:help;
    box-shadow:0 5px 18px rgba(0,0,0,.28);
    overflow:hidden;
  `;

  // 기존 마우스 오버 안내 설명 그대로 유지
  indicator.title =
    '🚀 유도 미사일 사용법\n' +
    'S키 또는 모바일 🚀 버튼을 0.7초 이상 누른 뒤 떼면 발사\n' +
    '다른 이용자와 고래 보스 공격 가능\n' +
    '직격 40 / 근접 25 / 외곽 10 / 회피 0 피해\n' +
       '접속 중 3분마다 1개 충전';

  // ========================================
  // 둥근 사각형 SVG 경로
  // 상단 중앙에서 시작해 시계 방향으로 진행
  // ========================================

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const missileBorderSvg =
    document.createElementNS(SVG_NS, 'svg');

  missileBorderSvg.setAttribute(
    'viewBox',
    '0 0 100 100'
  );

  missileBorderSvg.setAttribute(
    'preserveAspectRatio',
    'none'
  );

  missileBorderSvg.setAttribute(
    'aria-hidden',
    'true'
  );

  missileBorderSvg.style.cssText = `
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    pointer-events:none;
    overflow:visible;
  `;

  // 상단 중앙 → 우측 → 하단 → 좌측 순서
  const borderPath =
    'M50 2 ' +
    'H84 Q98 2 98 16 ' +
    'V84 Q98 98 84 98 ' +
    'H16 Q2 98 2 84 ' +
    'V16 Q2 2 16 2 ' +
    'H50 Z';

  // 충전되지 않은 테두리
  const missileBorderTrack =
    document.createElementNS(SVG_NS, 'path');

  missileBorderTrack.setAttribute(
    'd',
    borderPath
  );

  missileBorderTrack.setAttribute(
    'fill',
    'none'
  );

  missileBorderTrack.setAttribute(
    'stroke',
    'rgba(216,186,128,.30)'
  );

  missileBorderTrack.setAttribute(
    'stroke-width',
    '4'
  );

  missileBorderTrack.setAttribute(
    'vector-effect',
    'non-scaling-stroke'
  );

  // 실제 충전되는 테두리
  const missileBorderProgress =
    document.createElementNS(SVG_NS, 'path');

  missileBorderProgress.setAttribute(
    'd',
    borderPath
  );

  missileBorderProgress.setAttribute(
    'fill',
    'none'
  );

  missileBorderProgress.setAttribute(
    'stroke',
    '#56f5d6'
  );

  missileBorderProgress.setAttribute(
    'stroke-width',
    '4'
  );

  missileBorderProgress.setAttribute(
    'stroke-linecap',
    'round'
  );

  missileBorderProgress.setAttribute(
    'stroke-linejoin',
    'round'
  );

  missileBorderProgress.setAttribute(
    'vector-effect',
    'non-scaling-stroke'
  );

  // 먼저 경로를 SVG에 등록한다.
  // 경로 길이는 SVG가 실제 DOM에 붙은 다음 계산해야 한다.
  missileBorderSvg.append(
    missileBorderTrack,
    missileBorderProgress
  );

  // 발광 효과
  missileBorderProgress.style.filter =
    'drop-shadow(0 0 3px rgba(86,245,214,.9))';

  // ========================================
  // 아이콘 내부 정보
  // ========================================

  const missileText =
    document.createElement('div');

  missileText.style.cssText = `
    position:relative;
    z-index:1;
    white-space:pre-line;
    pointer-events:none;
    font:700 12px Arial,sans-serif;
    line-height:1.25;
    text-align:center;
  `;

  missileText.textContent = '🚀\n0/5\n03:00';

  indicator.append(
    missileBorderSvg,
    missileText
  );

  document.body.appendChild(indicator);

  // SVG가 화면에 부착된 이후 경로의 실제 길이를 구한다.
  // 일부 브라우저에서 부착 전 getTotalLength()가 0을
  // 반환하여 충전 테두리가 처음부터 가득 보이던 문제 방지.
  let missilePathLength = missileBorderProgress.getTotalLength();

  if (!Number.isFinite(missilePathLength) || missilePathLength <= 0) {
    // 경로 길이 계산을 지원하지 않는 경우 SVG 정규화 길이 사용
    missileBorderProgress.setAttribute('pathLength', '100');
    missilePathLength = 100;
  }

  missileBorderProgress.setAttribute(
    'stroke-dasharray',
    `${missilePathLength} ${missilePathLength}`
  );
  missileBorderProgress.setAttribute(
    'stroke-dashoffset',
    String(missilePathLength)
  );

  // ========================================
  // 실제 충전 진행률 계산
  // ========================================

  function updateMissileBorder() {

    const current = Math.max(
      0,
      Number(count) || 0
    );

    const maximum = Math.max(
      1,
      Number(maxMissiles) || 5
    );

    // 최대 보유량 충전 완료
    if (current >= maximum) {

      missileText.textContent =
        `🚀\n${current}/${maximum}\nMAX`;

      missileBorderProgress.setAttribute(
        'stroke-dashoffset',
        '0'
      );

      missileBorderProgress.setAttribute(
        'stroke',
        '#ffd97e'
      );

      return;
    }

    // 서버에서 받은 다음 충전 시간
    const validNextAt =
      Number.isFinite(Number(nextAt)) &&
      Number(nextAt) > 0;

    if (!validNextAt) {
      missileText.textContent =
        `🚀\n${current}/${maximum}\n--:--`;

      missileBorderProgress.setAttribute(
        'stroke-dashoffset',
        String(missilePathLength)
      );

      return;
    }

    const remainingMs = Math.max(
      0,
      Number(nextAt) - Date.now()
    );

    const progress = Math.max(
      0,
      Math.min(
        1,
        1 - remainingMs / MISSILE_RECHARGE_MS
      )
    );

    // 둥근 사각형 테두리를 시계 방향으로 채움
    const offset =
      missilePathLength * (1 - progress);

    missileBorderProgress.setAttribute(
      'stroke-dashoffset',
      String(offset)
    );

    missileBorderProgress.setAttribute(
      'stroke',
      '#56f5d6'
    );

    // 남은 충전 시간
    const totalSeconds = Math.ceil(
      remainingMs / 1000
    );

    const minutes = Math.floor(
      totalSeconds / 60
    );

    const seconds = totalSeconds % 60;

    const timeText =
      `${String(minutes).padStart(2,'0')}:` +
      `${String(seconds).padStart(2,'0')}`;

    missileText.textContent =
      `🚀\n${current}/${maximum}\n${timeText}`;
  }

  updateMissileBorder();

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

    aimLastBeepAt = pressedAt;
    aimLockAnnounced = false;
    aimLastTargetId = null;

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

    aimLastBeepAt = 0;
    aimLockAnnounced = false;
    aimLastTargetId = null;

    lastAimSyncAt = 0;
    lastSyncedTargetId = null;

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

    // 발사하거나 S키를 떼면 경고 종료
    send({
      type: 'missile_aim_end'
    });
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
  // PC 조작 안내 패널 내 미사일 버튼 연결
  // 기존 모바일 버튼은 수정하지 않음
  // ========================================

  const desktopMissileButton =
    document.getElementById(
      'jmc-glass-missile'
    );

  if (desktopMissileButton) {

    desktopMissileButton.addEventListener(
      'pointerdown',
      e => {
        if (e.button !== 0) return;

        e.preventDefault();

        desktopMissileButton.setPointerCapture(
          e.pointerId
        );

        press();

        if (aiming) {
          desktopMissileButton.classList.add(
            'is-aiming'
          );
        }
      }
    );

    desktopMissileButton.addEventListener(
      'pointerup',
      e => {
        e.preventDefault();

        desktopMissileButton.classList.remove(
          'is-aiming'
        );

        release();
      }
    );

    desktopMissileButton.addEventListener(
      'pointercancel',
      () => {
        desktopMissileButton.classList.remove(
          'is-aiming'
        );

        release();
      }
    );

    window.addEventListener(
      'blur',
      () => {
        desktopMissileButton.classList.remove(
          'is-aiming'
        );
      }
    );

  } else {
    console.warn(
      '[MISSILE] PC 미사일 패널 버튼을 찾지 못했습니다.'
    );
  }

  // ========================================
  // 3D 미사일 모델
  // ========================================
  function createRocket() {
    // 비행 판정/속도와 분리된 3D 외형 전용 객체
    // 기존 미사일 진행 방향(+Z) 유지
    const rocket = new THREE.Group();

    const hull = new THREE.MeshStandardMaterial({
      color: 0x182a46,
      metalness: 0.84,
      roughness: 0.24
    });
    const armor = new THREE.MeshStandardMaterial({
      color: 0x536f92,
      metalness: 0.88,
      roughness: 0.2
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xa4c9e4,
      metalness: 0.75,
      roughness: 0.18
    });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x58f2ff });
    const violet = new THREE.MeshBasicMaterial({ color: 0x9c67ff });
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x63f3ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x855dff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x37cfff,
      transparent: true,
      opacity: 0.19,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 1.05, 16),
      hull
    );
    body.rotation.x = Math.PI / 2;
    rocket.add(body);

    const frontArmor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.19, 0.32, 16),
      armor
    );
    frontArmor.rotation.x = Math.PI / 2;
    frontArmor.position.z = 0.34;
    rocket.add(frontArmor);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.5, 16),
      tipMat
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.78;
    rocket.add(nose);

    // 몸체를 따라 이어지는 얇은 네온 띠
    for (const z of [-0.36, 0.12, 0.47]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.191, 0.018, 5, 20),
        cyan
      );
      ring.position.z = z;
      rocket.add(ring);
    }

    // X형 미래형 꼬리 날개 네 장
    for (let i = 0; i < 4; i++) {
      const wingGroup = new THREE.Group();
      wingGroup.rotation.z = i * Math.PI / 2;

      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.42, 0.46),
        armor
      );
      wing.position.set(0, 0.30, -0.30);
      wing.rotation.x = -0.23;
      wingGroup.add(wing);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.025, 0.37),
        i % 2 ? violet : cyan
      );
      strip.position.set(0, 0.49, -0.30);
      strip.rotation.x = -0.23;
      wingGroup.add(strip);
      rocket.add(wingGroup);
    }

    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.22, 16),
      armor
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -0.59;
    rocket.add(nozzle);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 10, 8),
      cyan
    );
    core.position.z = -0.71;
    rocket.add(core);

    // 엔진의 밝은 중심 불꽃 / 보라색 바깥 불꽃
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.94, 12),
      flameMat
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -1.13;
    rocket.add(flame);

    const outerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.23, 1.30, 12),
      haloMat
    );
    outerFlame.rotation.x = -Math.PI / 2;
    outerFlame.position.z = -1.27;
    rocket.add(outerFlame);

    // 빛의 꼬리는 미사일과 함께 이동하므로 서버 탄도와 무관
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 2.05, 10),
      trailMat
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.z = -1.75;
    rocket.add(trail);

    // 소수의 재사용 가능한 광입자: 매 프레임 새 객체를 만들지 않음
    const particleGeometry = new THREE.SphereGeometry(0.032, 5, 4);
    const particles = [];
    for (let i = 0; i < 10; i++) {
      const particle = new THREE.Mesh(
        particleGeometry,
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xa775ff : 0x60eeff,
          transparent: true,
          opacity: 0.7,
          depthWrite: false
        })
      );
      particle.userData.phase = i / 10;
      rocket.add(particle);
      particles.push(particle);
    }

    // 기존 애니메이션 코드에서 접근하는 이름 유지
    rocket.userData.flame = flame;
    rocket.userData.sfEffects = {
      outerFlame,
      core,
      trail,
      particles
    };
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
  // 미사일 비행 효과음
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

  document.addEventListener(
    'pointerdown',
    getMissileAudio,
    { passive: true }
  );

  document.addEventListener(
    'keydown',
    getMissileAudio
  );

  // ========================================
  // 미사일 조준 및 락온 효과음
  // ========================================

  let aimLastBeepAt = 0;
  let aimLockAnnounced = false;
  let aimLastTargetId = null;

  // 공격자의 조준 대상을 서버에 전달
  let lastAimSyncAt = 0;
  let lastSyncedTargetId = null;

  // 나를 조준하는 공격자 목록
  const incomingAimWarnings = new Map();

  let lastVictimWarningBeepAt = 0;

  function playAimBeep(isLock = false) {
    if (!missileSoundEnabled()) return;

    const ctx = getMissileAudio();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isLock ? 'sine' : 'triangle';

      if (isLock) {
        osc.frequency.setValueAtTime(720, now);
        osc.frequency.exponentialRampToValueAtTime(
          1180,
          now + 0.16
        );
      } else {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(
          660,
          now + 0.07
        );
      }

      const duration = isLock ? 0.22 : 0.09;
      const volume = isLock ? 0.075 : 0.028;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        volume,
        now + 0.012
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.01);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch (error) {
      console.warn(
        '[MISSILE] 조준음 재생 실패:',
        error
      );
    }
  }

  // ========================================
  // 미사일 비행음: 바람 + 로켓 추진 소음
  // ========================================

  function startMissileSound(id) {
    if (
      !missileSoundEnabled() ||
      missileSounds.has(id)
    ) return;

    const ctx = getMissileAudio();
    if (!ctx) return;

    try {
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(
        1,
        sampleRate,
        sampleRate
      );

      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.65;

      const gain = ctx.createGain();

      gain.gain.setValueAtTime(
        0,
        ctx.currentTime
      );

      gain.gain.linearRampToValueAtTime(
        0.16,
        ctx.currentTime + 0.12
      );

      wind.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      wind.start();

      missileSounds.set(id, {
        wind,
        filter,
        gain
      });

    } catch (error) {
      console.warn(
        '[MISSILE] 비행음 생성 오류:',
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
        now + 0.1
      );

      sound.wind.stop(now + 0.12);

      sound.wind.onended = () => {
        sound.wind.disconnect();
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

      const ctx = missileAudioCtx;

      if (!ctx || ctx.state !== 'running') {
        continue;
      }

      const pitch =
        1100 + Math.sin(now * 0.004) * 180;

      sound.filter.frequency.setTargetAtTime(
        pitch,
        ctx.currentTime,
        0.08
      );

      const me = getAvatar();
      const missilePos = shot.object.position;

      let volume = 0.16;

      if (me) {
        const distance = Math.hypot(
          me.position.x - missilePos.x,
          me.position.z - missilePos.z
        );

        volume = Math.max(
          0.05,
          0.16 * (1 - distance / 50)
        );
      }

      sound.gain.gain.setTargetAtTime(
        volume,
        ctx.currentTime,
        0.08
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

    // ========================================
    // 다른 이용자가 나를 조준하는 경우
    // ========================================

    if (m.type === 'missile_warning') {
      const attackerId = String(
        m.attackerId || ''
      );

      if (!attackerId) return true;

      if (m.active) {
        incomingAimWarnings.set(
          attackerId,
          {
            locked: Boolean(m.locked),
            expires: performance.now() + 1000
          }
        );
      } else {
        incomingAimWarnings.delete(attackerId);
      }

      return true;
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

    if (m.type === 'missile_hit') {
      removeMissile(m.id);
      createExplosion(m);
      return true;
    }

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
    updateMissileSounds(now);

    // ========================================
    // 나를 조준하는 미사일 경고음
    // ========================================

    for (
      const [attackerId, warning]
      of incomingAimWarnings
    ) {
      if (now > warning.expires) {
        incomingAimWarnings.delete(attackerId);
      }
    }

    if (
      incomingAimWarnings.size > 0 &&
      !isBlocked?.()
    ) {
      const anyLocked = [
        ...incomingAimWarnings.values()
      ].some(warning => warning.locked);

      const interval = anyLocked ? 180 : 320;

      if (
        now - lastVictimWarningBeepAt >= interval
      ) {
        playAimBeep(anyLocked);

        lastVictimWarningBeepAt = now;
      }
    }

    // ========================================
    // 목표물이 있을 때만 조준 효과음
    // ========================================

    if (aiming) {
      locked = availableTarget();

      const lockReady = Boolean(
        locked && now - pressedAt >= LOCK_MS
      );

      updateReticle(locked, lockReady);

        const visibleTarget =
          locked && crosshair.style.display === 'flex'
            ? locked
            : null;

        // ========================================
        // 현재 조준 중인 상대를 서버에 전달
        // ========================================

        const currentTargetId =
          visibleTarget?.id || null;

        if (
          currentTargetId !== lastSyncedTargetId ||
          now - lastAimSyncAt >= 250
        ) {
          send({
            type: 'missile_aim_target',
            targetId: currentTargetId
          });

          lastSyncedTargetId = currentTargetId;
          lastAimSyncAt = now;
        }

        if (visibleTarget) {
        if (visibleTarget.id !== aimLastTargetId) {
          aimLastTargetId = visibleTarget.id;
          aimLockAnnounced = false;
          aimLastBeepAt = now;

          playAimBeep(false);
        }

        if (lockReady && !aimLockAnnounced) {
          playAimBeep(true);
          aimLockAnnounced = true;
        } else if (
          !lockReady &&
          now - aimLastBeepAt >= 250
        ) {
          playAimBeep(false);
          aimLastBeepAt = now;
        }
      } else {
        locked = null;
        aimLastTargetId = null;
        aimLockAnnounced = false;
        aimLastBeepAt = 0;
      }
    } else {
      crosshair.style.display = 'none';
    }

      // ========================================
    // 미사일 SVG 테두리 충전 진행률 갱신
    // ========================================

    updateMissileBorder();

    // ========================================
    // 미사일 이동
    // ========================================

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

      const flame =
        shot.object.userData.flame;

      if (flame) {
        flame.scale.y =
          0.8 +
          Math.sin(now * 0.025) * 0.2;
      }

      // SF 엔진 광원과 비행 입자 애니메이션 (시각효과만 변경)
      const sf = shot.object.userData.sfEffects;
      if (sf) {
        const t = now * 0.001;
        sf.outerFlame.scale.y = 0.86 + Math.sin(t * 22) * 0.17;
        sf.core.scale.setScalar(1 + Math.sin(t * 18) * 0.15);
        sf.trail.material.opacity = 0.19 + Math.sin(t * 14) * 0.04;

        for (let i = 0; i < sf.particles.length; i++) {
          const particle = sf.particles[i];
          const cycle = (t * 1.7 + particle.userData.phase) % 1;
          const spread = 0.04 + cycle * 0.24;
          particle.position.set(
            Math.sin(i * 2.4 + t * 3) * spread,
            Math.cos(i * 2.4 + t * 3) * spread,
            -0.75 - cycle * 2.3
          );
          particle.scale.setScalar(Math.max(0.15, 1.2 - cycle * 0.95));
          particle.material.opacity = 0.82 * (1 - cycle);
        }
      }

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
