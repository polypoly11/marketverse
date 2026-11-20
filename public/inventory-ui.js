(() => {
  function init() {
    if (document.getElementById('jmc-inventory-toggle')) return;

    const ITEM_NAME = '고래의 비늘';
    const REQUIRED_COUNT = 5;
    const $ = id => document.getElementById(id);

    // 버튼은 HP바와 위치를 맞추기 위해 body에 추가합니다.
    const toggle = document.createElement('button');
    toggle.id = 'jmc-inventory-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', '인벤토리 열기');
    toggle.style.cssText = `
      position:fixed;
      left:12px;
      top:220px;
      width:62px;
      height:72px;
      box-sizing:border-box;
      padding:3px 2px;
      border:1px solid #d8ba80;
      border-radius:11px;
      background:rgba(15,29,47,.96);
      color:#fff;
      font:700 11px Arial,sans-serif;
      cursor:pointer;
      z-index:9998;
      overflow:hidden;
      box-shadow:0 5px 24px #0005;
    `;

    const panel = document.createElement('section');
    panel.id = 'jmc-inventory-panel';
    panel.hidden = true;
    panel.style.cssText = `
      position:fixed;
      left:12px;
      top:300px;
      z-index:9999;
      width:min(350px,calc(100vw - 20px));
      max-height:70dvh;
      overflow-y:auto;
      box-sizing:border-box;
      padding:20px;
      background:rgba(13,27,45,.98);
      color:#f6f6f6;
      border:1px solid #c3a475;
      border-radius:17px;
      box-shadow:0 15px 60px #0009;
      font:14px Arial,sans-serif;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <strong style="font-size:19px">🎒 내 인벤토리</strong>
        <button type="button" id="jmc-inventory-close" aria-label="인벤토리 닫기"
          style="border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer">×</button>
      </div>
      <p style="color:#d9b779;margin:20px 0 8px">🐋 고래의 비늘</p>
      <div id="jmc-inventory-slots"
        style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px"></div>
      <p id="jmc-inventory-count"
        style="text-align:center;color:#d4dceb;font-size:13px"></p>
      <button type="button" id="jmc-inventory-craft"
        style="width:100%;padding:13px;background:#dfc18d;color:#192838;border:0;border-radius:10px;font-weight:800;cursor:pointer">
        5개 조합하기
      </button>
      <p id="jmc-inventory-notice"
        style="line-height:1.6;color:#b5c8df;font-size:12px"></p>
      <hr style="border:0;border-top:1px solid #344358;margin:18px 0">
      <strong>🎟️ 교환 신청 내역</strong>
      <div id="jmc-inventory-history"
        style="font-size:12px;line-height:1.65;margin-top:10px"></div>
    `;

    document.body.append(toggle, panel);

    // 모바일: 가방 이모지 없이 ITEM / 숫자 2줄.
    // PC: 가방 아이콘 포함. 모바일 버튼은 정확히 42px 높이.
    const style = document.createElement('style');
    style.textContent = `
      #jmc-inventory-toggle .jmc-item-content {
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:2px;
        width:100%;
        height:100%;
        margin:0;
        padding:0;
        box-sizing:border-box;
        line-height:1;
      }
      #jmc-inventory-toggle .jmc-item-icon {
        display:block;
        height:19px;
        line-height:19px;
        font-size:17px;
      }
      #jmc-inventory-toggle .jmc-item-label {
        display:block;
        height:12px;
        line-height:12px;
        font-size:10px;
        font-weight:800;
        letter-spacing:.4px;
        color:#f5cf87;
      }
      #jmc-inventory-toggle .jmc-item-count {
        display:block;
        height:18px;
        line-height:18px;
        font-size:16px;
        font-weight:800;
        color:#fff;
        font-variant-numeric:tabular-nums;
      }
      @media (max-width:980px), (pointer:coarse) {
        #jmc-inventory-toggle .jmc-item-icon { display:none !important; }
        #jmc-inventory-toggle .jmc-item-content { gap:2px; }
        #jmc-inventory-toggle .jmc-item-label { font-size:10px; }
        #jmc-inventory-toggle .jmc-item-count { font-size:15px; }
      }
    `;
    document.head.appendChild(style);

    const craftButton = $('jmc-inventory-craft');
    const note = $('jmc-inventory-notice');
    let state = { enabled:false, count:0, crafts:[] };

    function isMobile() {
      return window.matchMedia('(max-width:980px), (pointer:coarse)').matches;
    }

    function alignInventoryToHp() {
      const hp = $('jmc-hp-hud');
      const mobile = isMobile();
      const gap = mobile ? 4 : 8;
      const buttonHeight = mobile ? 42 : 72;
      const rect = hp?.getBoundingClientRect();

      // HP바가 아직 렌더링되지 않았을 때도 버튼이 사라지지 않도록 처리.
      const left = rect ? rect.left : 12;
      const top = rect ? rect.bottom + gap : 220;
      const width = rect && rect.width > 0 ? rect.width : (mobile ? 52 : 62);

      toggle.style.left = `${Math.max(0, left)}px`;
      toggle.style.top = `${Math.max(0, top)}px`;
      toggle.style.width = `${width}px`;
      toggle.style.height = `${buttonHeight}px`;
      toggle.style.minHeight = `${buttonHeight}px`;
      toggle.style.padding = mobile ? '3px 2px' : '5px 2px';

      // 인벤토리 패널은 화면 안에 들어오도록 위치를 계산합니다.
      const panelWidth = Math.min(350, window.innerWidth - 20);
      const belowTop = top + buttonHeight + gap;
      const roomBelow = window.innerHeight - belowTop;
      const panelLeft = Math.min(Math.max(8, left), Math.max(8, window.innerWidth-panelWidth-8));
      panel.style.width = `${panelWidth}px`;
      panel.style.left = `${panelLeft}px`;

      // 아래 공간이 부족하면 HP바 오른쪽에서 열기.
      if (mobile && roomBelow < 210 && rect) {
        const sideLeft = Math.min(Math.max(8, rect.right + 8), Math.max(8, window.innerWidth-panelWidth-8));
        const sideTop = Math.max(8, Math.min(rect.top, window.innerHeight-140));
        panel.style.left = `${sideLeft}px`;
        panel.style.top = `${sideTop}px`;
      } else {
        panel.style.top = `${Math.max(8,belowTop)}px`;
      }
      const panelTop = Number.parseFloat(panel.style.top) || 8;
      panel.style.maxHeight = `${Math.max(100, window.innerHeight-panelTop-8)}px`;
    }

    let alignmentPending = false;
    function refreshInventoryPosition() {
      if (alignmentPending) return;
      alignmentPending = true;
      requestAnimationFrame(() => {
        alignmentPending = false;
        alignInventoryToHp();
      });
    }

    window.addEventListener('resize', refreshInventoryPosition);
    window.addEventListener('scroll', refreshInventoryPosition, {passive:true});
    window.visualViewport?.addEventListener('resize', refreshInventoryPosition);
    window.addEventListener('load', refreshInventoryPosition);

    // HP HUD가 뒤늦게 생성되거나 높이가 바뀌는 경우 위치 동기화.
    const hpObserver = new ResizeObserver(refreshInventoryPosition);
    const hp = $('jmc-hp-hud');
    if (hp) {
      hpObserver.observe(hp);
    } else {
      const observer = new MutationObserver(() => {
        const node = $('jmc-hp-hud');
        if (!node) return;
        hpObserver.observe(node);
        observer.disconnect();
        refreshInventoryPosition();
      });
      observer.observe(document.body, {childList:true,subtree:true});
    }
    refreshInventoryPosition();

    function createScaleIcon() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      canvas.style.cssText = 'width:34px;height:34px;display:block;margin:auto';

      const ctx = canvas.getContext('2d');
      const scale = new Path2D();
      scale.moveTo(105, 13);
      scale.bezierCurveTo(111, 33, 114, 67, 95, 88);
      scale.bezierCurveTo(74, 109, 42, 113, 13, 116);
      scale.bezierCurveTo(22, 87, 25, 57, 48, 39);
      scale.bezierCurveTo(66, 25, 91, 24, 105, 13);
      scale.closePath();

      // 심해빛 외곽 발광
      ctx.save();
      ctx.shadowColor = '#00eaff';
      ctx.shadowBlur = 17;
      ctx.fillStyle = '#073c65';
      ctx.fill(scale);
      ctx.restore();

      // 심해 남색과 청록색 그라디언트
      const gradient = ctx.createLinearGradient(30, 20, 100, 112);
      gradient.addColorStop(0, '#8fffff');
      gradient.addColorStop(0.18, '#18b9e5');
      gradient.addColorStop(0.38, '#126ca5');
      gradient.addColorStop(0.65, '#123e79');
      gradient.addColorStop(0.85, '#0a285a');
      gradient.addColorStop(1, '#041329');
      ctx.fillStyle = gradient;
      ctx.fill(scale);

      // 비늘 표면의 심해 결
      ctx.save();
      ctx.clip(scale);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(30 + i * 9, 29 + i * 11);
        ctx.bezierCurveTo(
          55 + i * 6, 38 + i * 9,
          84 + i * 3, 49 + i * 9,
          108 - i * 4, 63 + i * 8
        );
        ctx.strokeStyle = i % 2 === 0
          ? 'rgba(77,240,255,0.55)'
          : 'rgba(174,181,255,0.35)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // 수중 광택
      const shine = ctx.createRadialGradient(47, 43, 2, 65, 65, 76);
      shine.addColorStop(0, 'rgba(155,255,255,0.65)');
      shine.addColorStop(0.35, 'rgba(0,217,255,0.18)');
      shine.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, 128, 128);

      const particles = [
        [83,32,2.1], [93,47,1.5], [72,57,1.8],
        [100,68,1.5], [54,78,1.7], [70,91,1.3], [37,97,1.4]
      ];
      for (const [x, y, r] of particles) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#8dfaff';
        ctx.shadowColor = '#00eaff';
        ctx.shadowBlur = 9;
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#48eaff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00cfff';
      ctx.shadowBlur = 8;
      ctx.stroke(scale);
      ctx.restore();
      return canvas;
    }

    toggle.onclick = () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) refreshInventoryPosition();
    };
    $('jmc-inventory-close').onclick = () => { panel.hidden = true; };

    function render() {
      const count = Math.max(0,Math.floor(Number(state.count)||0));
      const enabled = state.enabled === true;

      // 깨진 중복 템플릿을 제거한 단일 ITEM 버튼 구조.
      toggle.innerHTML = `
        <span class="jmc-item-content">
          <span class="jmc-item-icon" aria-hidden="true">🎒</span>
          <span class="jmc-item-label">ITEM</span>
          <strong class="jmc-item-count">${count}</strong>
        </span>
      `;
      toggle.setAttribute('aria-label', `인벤토리 열기, 고래의 비늘 ${count}개`);
      $('jmc-inventory-count').textContent =
        `보유 ${count}개 · 조합까지 ${Math.max(0, REQUIRED_COUNT-count)}개 필요`;

      const slots = $('jmc-inventory-slots');
      slots.replaceChildren();
      for (let i=0;i<REQUIRED_COUNT;i++) {
        const filled = i < Math.min(REQUIRED_COUNT,count);
        const el = document.createElement('span');
        el.style.cssText = `
          display:flex;align-items:center;justify-content:center;
          height:66px;border-radius:9px;
          border:1px solid ${filled?'#58bce8':'#5b6e82'};
          background:${filled?'#203f61':'#152336'};
          box-shadow:${filled?'inset 0 0 12px rgba(44,170,240,.25)':'none'};
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

      craftButton.disabled = !enabled || count < REQUIRED_COUNT;
      craftButton.style.opacity = craftButton.disabled ? '.45' : '1';
      craftButton.style.cursor = craftButton.disabled ? 'not-allowed' : 'pointer';
note.textContent = enabled
  ? `${ITEM_NAME} ${REQUIRED_COUNT}개를 조합하면 행운의 선물 교환 신청권 1개가 생성됩니다. 행운의 선물은 운영자 확인 후 지급합니다.`
  : '정식 아이템 보관을 사용하려면 서버에 PostgreSQL 연결이 필요합니다.';

      const history = $('jmc-inventory-history');
      history.replaceChildren();
      if (!state.crafts?.length) {
        history.textContent = '아직 조합한 기록이 없습니다.';
      } else {
        for (const entry of state.crafts) {
          const div = document.createElement('div');
          div.style.cssText = 'padding:9px 0;border-bottom:1px solid #354358;overflow-wrap:anywhere;white-space:pre-wrap';
          const date = entry.created_at
            ? new Date(entry.created_at).toLocaleString('ko-KR') : '';
          const statusText = entry.status==='paid'?'✅ 지급 완료':'🕒 지급 대기';
          div.textContent = `${statusText} · ${date}\n교환번호: ${entry.id}`;
          history.append(div);
        }
      }
    }

    craftButton.onclick = () => {
      if (craftButton.disabled) return;
      if (!confirm(`${ITEM_NAME} ${REQUIRED_COUNT}개를 사용해 행운의 선물 교환 신청권을 만들까요?`)) return;
      craftButton.disabled = true;
      window.dispatchEvent(new Event('jmc-inventory-craft'));
    };

    window.addEventListener('jmc-inventory', e => {
      const m = e.detail || {};
      if (m.type==='inventory_state') {
        state = {
          enabled:m.enabled===true,
          count:Math.max(0,Math.floor(Number(m.count)||0)),
          crafts:Array.isArray(m.crafts)?m.crafts:[]
        };
        render();
      } else if (m.type==='inventory_crafted') {
        panel.hidden = false;
        refreshInventoryPosition();
alert(`🎉 조합 성공!\n교환 신청 번호: ${m.claimId}\n운영자 확인 후 행운의 선물을 지급합니다.`);
      } else if (m.type==='inventory_notice') {
        alert(m.message || '인벤토리 오류');
        render();
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',init);
  } else {
    init();
  }
})();
