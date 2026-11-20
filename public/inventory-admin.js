
(() => {
  const raidPanel =
    document.getElementById('tab-raid');

  if (!raidPanel) return;

  // 기존 즉시 쿠폰 당첨 UI는 숨기고
  // 새로운 5개 조합 교환 신청 UI를 사용
  const oldRewards =
    document.getElementById('raid-rewards')
      ?.closest('.panel');

  if (oldRewards) {
    oldRewards.style.display = 'none';
  }

  const oldVerify =
    document.getElementById('raid-verify')
      ?.closest('.panel');

  if (oldVerify) {
    oldVerify.style.display = 'none';
  }

  const panel = document.createElement('div');
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="panel-head">
      <h2>🎟️ 기프티콘 교환 신청 관리</h2>
    </div>

    <p class="muted">
      고래 파편 5개 조합 완료자만 표시됩니다.
      실제 쿠폰을 전달한 뒤 지급 완료를 누르세요.
    </p>

    <div id="jmc-craft-status" class="muted">
      교환 신청 조회 중...
    </div>

    <div id="jmc-craft-list"
      style="overflow-x:auto;margin-top:14px">
    </div>
  `;

  raidPanel.append(panel);

  async function request(url, data) {
    const options = {
      credentials: 'same-origin',
      cache: 'no-store'
    };

    if (data !== undefined) {
      options.method = 'POST';

      options.headers = {
        'Content-Type': 'application/json',
        'X-JMC-Admin': '1'
      };

      options.body = JSON.stringify(data);
    }

    const r = await fetch(url, options);
    const result = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(
        result.error || `요청 실패 (${r.status})`
      );
    }

    return result;
  }

  async function refresh() {
    if (
      raidPanel.hidden ||
      document.getElementById('app-view')?.hidden
    ) return;

    const status =
      document.getElementById('jmc-craft-status');

    const list =
      document.getElementById('jmc-craft-list');

    try {
      const result = await request(
        '/api/admin/inventory/requests'
      );

      status.textContent = result.enabled
        ? `최근 조합 ${result.requests.length}건 (최대 200건)`
        : 'PostgreSQL 미연결 · 쿠폰 교환 비활성';

      list.replaceChildren();

      if (!result.requests.length) {
        list.textContent =
          '아직 조합 완료자가 없습니다.';
        return;
      }

      const table = document.createElement('table');

      table.innerHTML = `
        <thead>
          <tr>
            <th>조합 완료자</th>
            <th>교환번호</th>
            <th>신청일</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
      `;

      const body = document.createElement('tbody');

      for (const item of result.requests) {
        const tr = document.createElement('tr');

        const values = [
          item.owner_name,
          item.id,
          item.created_at
            ? new Date(item.created_at)
                .toLocaleString('ko-KR')
            : '',
          item.status === 'paid'
            ? '지급 완료'
            : '지급 대기'
        ];

        for (const value of values) {
          const td = document.createElement('td');

          td.textContent = String(value ?? '');

          td.style.cssText = `
            overflow-wrap:anywhere;
            white-space:normal;
          `;

          tr.append(td);
        }

        const control = document.createElement('td');

        if (item.status === 'pending') {
          const button =
            document.createElement('button');

          button.className = 'button mini';
          button.textContent = '지급 완료';

          button.onclick = async () => {
            if (!confirm(
              `${item.owner_name}님의 교환번호 ${item.id}\n기프티콘을 실제로 전달했습니까?`
            )) return;

            button.disabled = true;

            try {
              await request(
                '/api/admin/inventory/paid',
                {claimId: item.id}
              );

              await refresh();
            } catch (error) {
              button.disabled = false;
              alert(error.message);
            }
          };

          control.append(button);
        } else {
          control.textContent = '완료';
        }

        tr.append(control);
        body.append(tr);
      }

      table.append(body);
      list.append(table);

    } catch (error) {
      status.textContent =
        '교환 신청 조회 오류: ' + error.message;
    }
  }

  document.querySelector(
    '[data-tab="raid"]'
  )?.addEventListener(
    'click',
    () => void refresh()
  );

  setInterval(() => void refresh(), 5000);
})();
