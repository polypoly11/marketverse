
(() => {
  const nav=document.querySelector('.nav');
  const main=document.querySelector('main');

  if(!nav || !main) return;

  const tab=document.createElement('button');
  tab.dataset.tab='raid';
  tab.textContent='🐋 고래 보스 레이드';
  nav.append(tab);

  const panel=document.createElement('section');
  panel.id='tab-raid';
  panel.hidden=true;

  panel.innerHTML=`
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>🐋 고래 보스 관리</h2>
          <p class="muted">
            HP 10,000 · 선착순 보상 아이템 1개
          </p>
        </div>
      </div>

      <p id="raid-mode" class="muted"></p>
      <h3 id="raid-status">상태 확인 중</h3>

      <div style="
        height:13px;
        border-radius:10px;
        background:#442838;
        overflow:hidden;
        margin:12px 0;
      ">
        <div id="raid-hp-bar" style="
          height:100%;
          width:100%;
          background:#e37692;
        "></div>
      </div>

      <p id="raid-hp">HP 10,000 / 10,000</p>

      <div class="actions" style="margin:18px 0">
        <label for="raid-damage">
          마법 1회당 데미지
        </label>

        <input
          id="raid-damage"
          type="number"
          min="1"
          max="100"
          value="1"
          style="max-width:90px"
        >

        <button id="raid-spawn" class="button">
          고래 소환
        </button>

        <button
          id="raid-cancel"
          class="button danger"
        >
          레이드 취소
        </button>
      </div>

      <p class="muted" style="font-size:12px">
        보스가 죽으면 중앙에 보상 아이템이 떨어집니다.
        참가자는 아이템 근처에서 E키를 눌러 획득할 수 있습니다.
      </p>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>스타벅스 쿠폰 당첨 기록</h2>
      </div>

      <p class="muted">
        실제 쿠폰은 DB에 기록된 당첨자에게
        운영자가 직접 지급합니다.
      </p>

      <div id="raid-rewards">
        조회 중...
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>당첨 증명 코드 확인</h2>
      </div>

      <input
        id="raid-reward-id"
        placeholder="당첨자가 제시한 보상 ID"
        style="margin-bottom:9px"
      >

      <input
        id="raid-claim-code"
        placeholder="당첨자가 제시한 수령 코드"
        style="margin-bottom:9px"
      >

      <button
        id="raid-verify"
        class="button secondary"
      >
        수령 코드 검증
      </button>

      <p
        id="raid-verify-result"
        class="muted"
        style="margin-top:12px"
      ></p>
    </div>
  `;

  main.append(panel);

  function showRaid() {
    for(const name of [
      'overview',
      'players',
      'chats',
      'settings'
    ]) {
      const el=document.getElementById(
        'tab-'+name
      );

      if(el) el.hidden=true;
    }

    document.querySelectorAll('.nav button')
      .forEach(b=>{
        b.classList.toggle(
          'active',
          b===tab
        );
      });

    panel.hidden=false;

    const title=document.getElementById(
      'page-title'
    );

    if(title) {
      title.textContent='고래 보스 레이드';
    }

    void refresh();
  }

  tab.addEventListener('click',showRaid);

  nav.addEventListener('click',e=>{
    if(e.target.closest('button')!==tab) {
      panel.hidden=true;
    }
  },true);

  async function api(url,data) {
    const init={
      credentials:'same-origin',
      cache:'no-store'
    };

    if(data!==undefined) {
      init.method='POST';
      init.headers={
        'Content-Type':'application/json',
        'X-JMC-Admin':'1'
      };
      init.body=JSON.stringify(data);
    }

    const r=await fetch(url,init);
    const body=await r.json().catch(()=>({}));

    if(!r.ok) {
      throw Error(
        body.error || `오류 ${r.status}`
      );
    }

    return body;
  }

  let state=null;

  async function refresh() {
    if(
      panel.hidden ||
      document.getElementById('app-view')?.hidden
    ) return;

    try {
      const [status,records]=await Promise.all([
        api('/api/admin/status'),
        api('/api/admin/raid/rewards')
      ]);

      state=status.raid;

      const labels={
        idle:'소환 대기',
        active:'전투 진행 중',
        loot:'보상 아이템 획득 대기',
        claimed:'당첨자 확정',
        cancelled:'취소됨'
      };

      document.getElementById(
        'raid-status'
      ).textContent=labels[state.state] || state.state;

      document.getElementById(
        'raid-hp'
      ).textContent=
        `HP ${Number(state.hp).toLocaleString()} / 10,000`;

      document.getElementById(
        'raid-hp-bar'
      ).style.width=
        Math.max(
          0,
          state.hp/10000*100
        )+'%';

      document.getElementById(
        'raid-mode'
      ).textContent=records.prizeEnabled
        ? '🟢 실제 당첨 기록 저장 활성화 (PostgreSQL)'
        : '🟠 연습 모드: DATABASE_URL 미설정 — 실제 쿠폰 지급 불가';

      document.getElementById(
        'raid-spawn'
      ).disabled=[
        'active','loot'
      ].includes(state.state);

      document.getElementById(
        'raid-cancel'
      ).disabled=![
        'active','loot'
      ].includes(state.state);

      const div=document.getElementById(
        'raid-rewards'
      );

      div.replaceChildren();

      if(!records.rewards.length) {
        div.textContent='당첨 기록이 없습니다.';
        return;
      }

      const table=document.createElement('table');

      table.innerHTML=`
        <thead>
          <tr>
            <th>당첨자</th>
            <th>보상 ID</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
      `;

      const tbody=document.createElement('tbody');

      for(const item of records.rewards) {
        const tr=document.createElement('tr');

        for(const value of [
          item.winner_name,
          item.id,
          item.status==='paid'
            ? '지급 완료'
            : '미지급'
        ]) {
          const td=document.createElement('td');
          td.textContent=value;
          td.style.whiteSpace='normal';
          td.style.overflowWrap='anywhere';
          tr.append(td);
        }

        const td=document.createElement('td');

        if(item.status==='pending') {
          const button=document.createElement('button');

          button.className='button mini';
          button.textContent='지급 완료';

          button.onclick=async()=>{
            if(!confirm(
              '쿠폰을 실제로 전달했습니까? 지급 완료로 기록할까요?'
            )) return;

            try {
              await api(
                '/api/admin/raid/paid',
                {rewardId:item.id}
              );

              await refresh();

            } catch(e) {
              alert(e.message);
            }
          };

          td.append(button);
        }

        tr.append(td);
        tbody.append(tr);
      }

      table.append(tbody);
      div.append(table);

    } catch(e) {
      document.getElementById(
        'raid-status'
      ).textContent=e.message;
    }
  }

  document.getElementById(
    'raid-spawn'
  ).onclick=async()=>{
    const damage=Number(
      document.getElementById(
        'raid-damage'
      ).value
    );

    if(!confirm(
      `HP 10,000 고래 보스를 소환할까요? (1회 피해 ${damage})`
    )) return;

    try {
      await api(
        '/api/admin/raid/spawn',
        {damage}
      );

      await refresh();

    } catch(e) {
      alert(e.message);
    }
  };

  document.getElementById(
    'raid-cancel'
  ).onclick=async()=>{
    if(!confirm(
      '진행 중인 고래 보스와 미획득 보상을 제거할까요?'
    )) return;

    try {
      await api(
        '/api/admin/raid/cancel',
        {}
      );

      await refresh();

    } catch(e) {
      alert(e.message);
    }
  };

  document.getElementById(
    'raid-verify'
  ).onclick=async()=>{
    const rewardId=document.getElementById(
      'raid-reward-id'
    ).value.trim();

    const claimCode=document.getElementById(
      'raid-claim-code'
    ).value.trim();

    try {
      const r=await api(
        '/api/admin/raid/verify',
        {rewardId,claimCode}
      );

      document.getElementById(
        'raid-verify-result'
      ).textContent=r.valid
        ? '✅ 유효한 수령 코드입니다.'
        : '❌ 일치하지 않습니다.';

    } catch(e) {
      document.getElementById(
        'raid-verify-result'
      ).textContent=e.message;
    }
  };

  setInterval(refresh,3000);
})();
