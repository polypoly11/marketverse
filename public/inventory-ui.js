
(() => {
  function init() {
    const toggle = document.createElement('button');
    toggle.id = 'jmc-inventory-toggle';
    toggle.type = 'button';
    toggle.textContent = '🎒 아이템';

    toggle.style.cssText = `
      position:fixed;
      right:15px;
      top:85px;
      z-index:9998;
      padding:10px 14px;
      border:1px solid #d8ba80;
      border-radius:24px;
      background:rgba(15,29,47,.94);
      color:#ffe2a0;
      font:700 13px Arial;
      cursor:pointer;
      box-shadow:0 5px 24px #0005;
    `;

    const panel = document.createElement('section');
    panel.id = 'jmc-inventory-panel';
    panel.hidden = true;

    panel.style.cssText = `
      position:fixed;
      right:15px;
      top:135px;
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
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <strong style="font-size:19px">🎒 내 인벤토리</strong>
        <button type="button" id="jmc-inventory-close" style="border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer">×</button>
      </div>

      <p style="color:#d9b779;margin:20px 0 8px">🐋 고래의 파편</p>

      <div id="jmc-inventory-slots" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px"></div>

      <p id="jmc-inventory-count" style="text-align:center;color:#d4dceb;font-size:13px"></p>

      <button type="button" id="jmc-inventory-craft" style="width:100%;padding:13px;background:#dfc18d;color:#192838;border:0;border-radius:10px;font-weight:800;cursor:pointer">5개 조합하기</button>

      <p id="jmc-inventory-notice" style="line-height:1.6;color:#b5c8df;font-size:12px"></p>

      <hr style="border:0;border-top:1px solid #344358;margin:18px 0">

      <strong>🎟️ 교환 신청 내역</strong>
      <div id="jmc-inventory-history" style="font-size:12px;line-height:1.65;margin-top:10px"></div>
    `;

    document.body.append(toggle, panel);

    const $ = id => document.getElementById(id);
    const craftButton = $('jmc-inventory-craft');
    const note = $('jmc-inventory-notice');

    let state = {
      enabled: false,
      count: 0,
      crafts: []
    };

    toggle.onclick = () => {
      panel.hidden = !panel.hidden;
    };

    $('jmc-inventory-close').onclick = () => {
      panel.hidden = true;
    };

    function render() {
      const count = Math.max(
        0,
        Number(state.count) || 0
      );

      toggle.textContent = `🎒 아이템 ${count}`;

      $('jmc-inventory-count').textContent =
        `보유 ${count}개 · 조합까지 ${Math.max(0,5-count)}개 필요`;

      const slots = $('jmc-inventory-slots');
      slots.replaceChildren();

      for (let i=0; i<5; i++) {
        const el = document.createElement('span');

        el.textContent =
          i < Math.min(5,count) ? '💠' : '·';

        el.style.cssText = `
          text-align:center;
          padding:11px 0;
          border-radius:9px;
          border:1px solid #5b6e82;
          background:${i<count?'#35445a':'#152336'};
          font-size:20px;
        `;

        slots.append(el);
      }

      craftButton.disabled =
        !state.enabled || count < 5;

      craftButton.style.opacity =
        craftButton.disabled ? '.45' : '1';

      note.textContent = state.enabled
        ? '파편 5개를 조합하면 메가MGC커피 기프티콘 교환 신청권 1개가 생성됩니다. 쿠폰은 운영자 확인 후 지급합니다.'
        : '정식 아이템 보관을 사용하려면 서버에 PostgreSQL 연결이 필요합니다.';

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

          div.textContent =
            `${entry.status==='paid'?'✅ 지급 완료':'🕒 지급 대기'} · ${date}\n교환번호: ${entry.id}`;

          history.append(div);
        }
      }
    }

    craftButton.onclick = () => {
      if (craftButton.disabled) return;

      if (!confirm(
        '고래의 파편 5개를 사용해 기프티콘 교환 신청권을 만들까요?'
      )) return;

      craftButton.disabled = true;

      window.dispatchEvent(
        new Event('jmc-inventory-craft')
      );
    };

    window.addEventListener('jmc-inventory', e => {
      const m = e.detail || {};

      if (m.type === 'inventory_state') {
        state = m;
        render();
      } else if (m.type === 'inventory_crafted') {
        panel.hidden = false;

        alert(
          `🎉 조합 성공!\n교환 신청 번호: ${m.claimId}\n운영자 확인 후 기프티콘을 지급합니다.`
        );
      } else if (m.type === 'inventory_notice') {
        alert(m.message || '인벤토리 오류');
        render();
      }
    });

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
