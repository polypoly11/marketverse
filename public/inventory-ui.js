(() => {
  function init() {
    // 중복 생성 방지
    if (document.getElementById('jmc-inventory-toggle')) {
      return;
    }

    const ITEM_NAME = '고래의 비늘';
    const REQUIRED_COUNT = 5;

    const toggle = document.createElement('button');
    toggle.id = 'jmc-inventory-toggle';
    toggle.type = 'button';
    toggle.textContent = '🎒 아이템';

toggle.style.cssText = `
  position:fixed;
  left:15px;
  top:320px;
  z-index:9998;
  width:62px;
  min-height:72px;
  padding:7px 3px;
  box-sizing:border-box;
  border:1px solid #d8ba80;
  border-radius:12px;
  background:rgba(15,29,47,.94);
  color:#ffe2a0;
  font:700 11px Arial;
  text-align:center;
  white-space:normal;
  line-height:1.4;
  cursor:pointer;
  box-shadow:0 5px 24px #0005;
`;

    const panel = document.createElement('section');
    panel.id = 'jmc-inventory-panel';
    panel.hidden = true;

panel.style.cssText = `
  position:fixed;
  left:15px;
  top:374px;
  z-index:9999;
  width:min(350px,calc(100vw - 30px));
  max-height:70dvh;
  overflow-y:auto;
  box-sizing:border-box;
  padding:20px;
  background:rgba(13,27,45,.98);
  color:#f6f6f6;
  border:1px solid #c3a475;
  border-radius:17px;
  box-shadow:0 15px 60px #0009;
  font:14px Arial;
`;

    panel.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px
      ">
        <strong style="font-size:19px">
          🎒 내 인벤토리
        </strong>

        <button
          type="button"
          id="jmc-inventory-close"
          style="
            border:0;
            background:transparent;
            color:#fff;
            font-size:22px;
            cursor:pointer
          "
        >×</button>
      </div>

      <p style="
        color:#d9b779;
        margin:20px 0 8px
      ">
        🐋 고래의 비늘
      </p>

      <div
        id="jmc-inventory-slots"
        style="
          display:grid;
          grid-template-columns:repeat(5,1fr);
          gap:6px
        "
      ></div>

      <p
        id="jmc-inventory-count"
        style="
          text-align:center;
          color:#d4dceb;
          font-size:13px
        "
      ></p>

      <button
        type="button"
        id="jmc-inventory-craft"
        style="
          width:100%;
          padding:13px;
          background:#dfc18d;
          color:#192838;
          border:0;
          border-radius:10px;
          font-weight:800;
          cursor:pointer
        "
      >
        5개 조합하기
      </button>

      <p
        id="jmc-inventory-notice"
        style="
          line-height:1.6;
          color:#b5c8df;
          font-size:12px
        "
      ></p>

      <hr style="
        border:0;
        border-top:1px solid #344358;
        margin:18px 0
      ">

      <strong>🎟️ 교환 신청 내역</strong>

      <div
        id="jmc-inventory-history"
        style="
          font-size:12px;
          line-height:1.65;
          margin-top:10px
        "
      ></div>
    `;

    document.body.append(toggle, panel);

// HP바의 실제 화면 위치에 맞춰
// 인벤토리 버튼과 패널을 자동 정렬
function alignInventoryToHp() {
  const hp = document.getElementById('jmc-hp-hud');

  if (!hp) return;

  const rect = hp.getBoundingClientRect();

  // HP바와 왼쪽 정렬 통일
  const left = Math.max(8, rect.left);

  // HP바 아래 8px 간격
  const buttonTop = rect.bottom + 8;

  toggle.style.left = `${left}px`;
  toggle.style.top = `${buttonTop}px`;
  toggle.style.width = `${rect.width}px`;

  // 인벤토리창도 같은 왼쪽 기준선 사용
  panel.style.left = `${left}px`;
  panel.style.top =
    `${buttonTop + toggle.offsetHeight + 8}px`;

  // 화면 밖으로 넘어가지 않도록 높이 제한
  const panelTop = buttonTop + toggle.offsetHeight + 8;

  panel.style.maxHeight =
    `${Math.max(120, window.innerHeight - panelTop - 12)}px`;
}

// 최초 위치 계산
alignInventoryToHp();

// 화면 크기 및 스크롤 변경 시 다시 정렬
window.addEventListener('resize', alignInventoryToHp);
window.addEventListener('scroll', alignInventoryToHp, true);

// HP바가 늦게 생성되는 경우에도 위치 계산
requestAnimationFrame(alignInventoryToHp);

    const $ = id => document.getElementById(id);

    const craftButton = $('jmc-inventory-craft');
    const note = $('jmc-inventory-notice');

    let state = {
      enabled: false,
      count: 0,
      crafts: []
    };

    // ========================================
    // 푸른 고래 비늘 아이콘 생성
    // ========================================

    function createScaleIcon() {
      const canvas = document.createElement('canvas');

      canvas.width = 96;
      canvas.height = 96;

      canvas.style.width = '34px';
      canvas.style.height = '34px';
      canvas.style.display = 'block';
      canvas.style.margin = 'auto';

      const ctx = canvas.getContext('2d');

      const shape = new Path2D();

      shape.moveTo(48,9);
      shape.bezierCurveTo(69,14,83,32,77,51);
      shape.bezierCurveTo(72,67,58,81,48,88);
      shape.bezierCurveTo(38,81,24,67,19,51);
      shape.bezierCurveTo(13,32,27,14,48,9);
      shape.closePath();

      ctx.save();

      ctx.shadowColor = '#38dcff';
      ctx.shadowBlur = 12;

      const gradient = ctx.createLinearGradient(
        18,12,79,86
      );

      gradient.addColorStop(0,'#e6ffff');
      gradient.addColorStop(.2,'#65eaff');
      gradient.addColorStop(.5,'#249dce');
      gradient.addColorStop(.8,'#4759b4');
      gradient.addColorStop(1,'#152d68');

      ctx.fillStyle = gradient;
      ctx.fill(shape);

      ctx.restore();

      ctx.save();
      ctx.clip(shape);

      const shine = ctx.createRadialGradient(
        34,24,2,
        43,48,50
      );

      shine.addColorStop(
        0,'rgba(255,255,255,.85)'
      );

      shine.addColorStop(
        .5,'rgba(128,245,255,.20)'
      );

      shine.addColorStop(
        1,'rgba(0,24,70,.15)'
      );

      ctx.fillStyle = shine;
      ctx.fillRect(10,5,80,85);

      ctx.restore();

      ctx.strokeStyle = '#c8ffff';
      ctx.lineWidth = 2.5;
      ctx.stroke(shape);

      return canvas;
    }

    // ========================================
    // 인벤토리 열기 및 닫기
    // ========================================

    toggle.onclick = () => {
      panel.hidden = !panel.hidden;
    };

    $('jmc-inventory-close').onclick = () => {
      panel.hidden = true;
    };

    // ========================================
    // 인벤토리 화면 갱신
    // ========================================

    function render() {
      const count = Math.max(
        0,
        Math.floor(Number(state.count) || 0)
      );

      const enabled = state.enabled === true;

     toggle.innerHTML = `
  <span style="
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:2px;
    line-height:1.1;
  ">
    <span style="font-size:19px">🎒</span>
    <span style="
      font-size:10px;
      letter-spacing:1.2px;
      color:#f5cf87;
    ">ITEM</span>
    <strong style="
      font-size:17px;
      color:#ffffff;
      font-variant-numeric:tabular-nums;
    ">${count}</strong>
  </span>
`;

      $('jmc-inventory-count').textContent =
        `보유 ${count}개 · 조합까지 ${
          Math.max(0, REQUIRED_COUNT - count)
        }개 필요`;

      const slots = $('jmc-inventory-slots');

      slots.replaceChildren();

      // 최대 5개의 슬롯 표시
      for (let i = 0; i < REQUIRED_COUNT; i++) {
        const el = document.createElement('span');

        const filled = i < Math.min(
          REQUIRED_COUNT,
          count
        );

        el.style.cssText = `
          display:flex;
          align-items:center;
          justify-content:center;
          height:66px;
          border-radius:9px;
          border:1px solid ${
            filled ? '#58bce8' : '#5b6e82'
          };
          background:${
            filled ? '#203f61' : '#152336'
          };
          box-shadow:${
            filled
              ? 'inset 0 0 12px rgba(44,170,240,.25)'
              : 'none'
          };
          font-size:20px;
        `;

        if (filled) {
          const icon = createScaleIcon();

          icon.title = ITEM_NAME;
          el.title = ITEM_NAME;

          el.append(icon);
        } else {
          el.textContent = '·';
        }

        slots.append(el);
      }

      // ======================================
      // 5개 조합 버튼
      // ======================================

      craftButton.disabled =
        !enabled || count < REQUIRED_COUNT;

      craftButton.style.opacity =
        craftButton.disabled ? '.45' : '1';

      craftButton.style.cursor =
        craftButton.disabled
          ? 'not-allowed'
          : 'pointer';

      // ======================================
      // 안내 문구
      // ======================================

      note.textContent = enabled
        ? `${ITEM_NAME} ${REQUIRED_COUNT}개를 조합하면 메가MGC커피 기프티콘 교환 신청권 1개가 생성됩니다. 쿠폰은 운영자 확인 후 지급합니다.`
        : '정식 아이템 보관을 사용하려면 서버에 PostgreSQL 연결이 필요합니다.';

      // ======================================
      // 교환 신청 내역
      // ======================================

      const history = $('jmc-inventory-history');

      history.replaceChildren();

      if (!state.crafts?.length) {
        history.textContent =
          '아직 조합한 기록이 없습니다.';
      } else {
        for (const entry of state.crafts) {
          const div = document.createElement('div');

          div.style.cssText = `
            padding:9px 0;
            border-bottom:1px solid #354358;
            overflow-wrap:anywhere;
            white-space:pre-wrap;
          `;

          const date = entry.created_at
            ? new Date(entry.created_at)
                .toLocaleString('ko-KR')
            : '';

          const statusText =
            entry.status === 'paid'
              ? '✅ 지급 완료'
              : '🕒 지급 대기';

          div.textContent =
            `${statusText} · ${date}\n교환번호: ${entry.id}`;

          history.append(div);
        }
      }
    }

    // ========================================
    // 고래의 비늘 5개 조합
    // ========================================

    craftButton.onclick = () => {
      if (craftButton.disabled) return;

      if (!confirm(
        `${ITEM_NAME} ${REQUIRED_COUNT}개를 사용해 기프티콘 교환 신청권을 만들까요?`
      )) {
        return;
      }

      craftButton.disabled = true;

      // 기존 서버 연동 이벤트 유지
      window.dispatchEvent(
        new Event('jmc-inventory-craft')
      );
    };

    // ========================================
    // 서버 인벤토리 메시지 처리
    // ========================================

    window.addEventListener(
      'jmc-inventory',
      e => {
        const m = e.detail || {};

        if (m.type === 'inventory_state') {

          // 서버에서 받은 수량을 기준으로 표시
          // 브라우저에서 임의로 보상을 추가하지 않음
          state = {
            enabled: m.enabled === true,
            count: Math.max(
              0,
              Math.floor(Number(m.count) || 0)
            ),
            crafts: Array.isArray(m.crafts)
              ? m.crafts
              : []
          };

          render();

        } else if (m.type === 'inventory_crafted') {

          panel.hidden = false;

          alert(
            `🎉 조합 성공!\n교환 신청 번호: ${m.claimId}\n운영자 확인 후 기프티콘을 지급합니다.`
          );

        } else if (m.type === 'inventory_notice') {

          alert(
            m.message || '인벤토리 오류'
          );

          render();
        }
      }
    );

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }
})();
