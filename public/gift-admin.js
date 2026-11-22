
(() => {
  const raidPanel =
    document.getElementById('tab-raid');

  if (!raidPanel) return;

  const panel = document.createElement('div');
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="panel-head">
      <h2>🎁 기프티콘 재고 관리</h2>
    </div>

    <p class="muted">
      기프티콘을 미리 등록해 보관합니다.
      현재 단계에서는 사용자에게 자동 지급하지 않습니다.
    </p>

    <div id="gift-summary"
      style="margin:15px 0;font-weight:700">
      재고 조회 중...
    </div>

    <div style="display:grid;gap:10px">
      <label>
        브랜드
        <input id="gift-brand"
          type="text"
          maxlength="60"
          placeholder="예: 스타벅스"
          style="width:100%">
      </label>

      <label>
        상품명
        <input id="gift-title"
          type="text"
          maxlength="120"
          placeholder="예: 아메리카노 Tall"
          style="width:100%">
      </label>

      <label>
        유효기간
        <input id="gift-expiry"
          type="date"
          style="width:100%">
      </label>

      <label>
        쿠폰번호 (한 줄에 하나)
        <textarea id="gift-codes"
          rows="6"
          placeholder="1234-5678-9012&#10;5678-9012-3456"
          style="width:100%;box-sizing:border-box"></textarea>
      </label>

      <label>
        바코드 이미지 (단일 쿠폰 등록 시)
        <input id="gift-image"
          type="file"
          accept="image/png,image/jpeg,image/webp">
      </label>

      <p class="muted" style="font-size:12px">
        여러 쿠폰을 등록할 때는 각 번호를 줄바꿈으로 구분하세요.
        이미지는 쿠폰 1개 등록 시에만 첨부할 수 있습니다.
      </p>

      <button id="gift-register"
        class="button secondary">
        기프티콘 등록
      </button>
    </div>

    <h3 style="margin-top:24px">
      등록된 기프티콘
    </h3>

    <div id="gift-list"
      style="overflow-x:auto"></div>
  `;

  raidPanel.appendChild(panel);

  const $ = id => document.getElementById(id);

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

    const response = await fetch(url, options);
    const result = await response.json().catch(
      () => ({})
    );

    if (!response.ok) {
      throw new Error(
        result.error || `요청 오류: ${response.status}`
      );
    }

    return result;
  }

  function imageToDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }

      if (
        !['image/png','image/jpeg','image/webp']
          .includes(file.type) ||
        file.size > 350000
      ) {
        reject(new Error(
          '이미지는 PNG·JPG·WEBP, 350KB 이하만 가능합니다.'
        ));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(
        new Error('이미지를 읽지 못했습니다.')
      );

      reader.readAsDataURL(file);
    });
  }

  async function refresh() {
    try {
      const result = await request('/api/admin/gifts');

      const {stats, coupons} = result;

      $('gift-summary').textContent =
        `전체 ${stats.total}개 · 미사용 ${stats.unused}개 · 지급됨 ${stats.assigned}개`;

      const list = $('gift-list');
      list.replaceChildren();

      if (!coupons.length) {
        list.textContent =
          '등록된 기프티콘이 없습니다.';
        return;
      }

      const table = document.createElement('table');

      table.innerHTML = `
        <thead>
          <tr>
            <th>브랜드</th>
            <th>상품명</th>
            <th>쿠폰번호</th>
            <th>유효기간</th>
            <th>상태</th>
            <th>관리</th>
          </tr>
        </thead>
      `;

      const body = document.createElement('tbody');

      for (const item of coupons) {
        const tr = document.createElement('tr');

        const values = [
          item.brand,
          item.title,
          `****${item.last_four}`,
          item.expires_at
            ? String(item.expires_at).slice(0, 10)
            : '미설정',
          item.status === 'assigned'
            ? '사용됨 (지급 완료)'
            : '미사용'
        ];

        for (const value of values) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        }

        const control = document.createElement('td');

        if (item.status === 'unused') {
          const button = document.createElement('button');

          button.className = 'button mini';
          button.textContent = '삭제';

          button.onclick = async () => {
            if (!confirm(
              `${item.title} 쿠폰을 삭제할까요?`
            )) return;

            button.disabled = true;

            try {
              await request(
                '/api/admin/gifts/delete',
                {id:item.id}
              );

              await refresh();
            } catch (error) {
              button.disabled = false;
              alert(error.message);
            }
          };

          control.appendChild(button);
        } else {
          control.textContent = '배정 완료';
        }

        tr.appendChild(control);
        body.appendChild(tr);
      }

      table.appendChild(body);
      list.appendChild(table);

    } catch (error) {
      $('gift-summary').textContent =
        '조회 실패: ' + error.message;
    }
  }

  $('gift-register').onclick = async () => {
    const brand = $('gift-brand').value.trim();
    const title = $('gift-title').value.trim();
    const expiresAt = $('gift-expiry').value;

    const codes = $('gift-codes').value
      .split('\n')
      .map(code => code.trim())
      .filter(Boolean);

    if (!brand || !title || !codes.length) {
      alert('브랜드, 상품명, 쿠폰번호를 입력해 주세요.');
      return;
    }

    if (codes.length > 100) {
      alert('한 번에 최대 100개까지 등록할 수 있습니다.');
      return;
    }

    const file = $('gift-image').files[0];

    if (file && codes.length !== 1) {
      alert(
        '바코드 이미지는 쿠폰 1개를 등록할 때만 첨부할 수 있습니다.'
      );
      return;
    }

    const button = $('gift-register');
    button.disabled = true;

    try {
      const imageData = await imageToDataURL(file);

      const items = codes.map(code => ({
        brand,
        title,
        code,
        expiresAt,
        imageData
      }));

      const result = await request(
        '/api/admin/gifts/register',
        {items}
      );

      alert(
        `등록 완료: ${result.inserted}개\n중복 제외: ${result.duplicates}개`
      );

      $('gift-codes').value = '';
      $('gift-image').value = '';

      await refresh();

    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  };

  document.querySelector(
    '[data-tab="raid"]'
  )?.addEventListener(
    'click',
    () => void refresh()
  );

  void refresh();
  setInterval(() => {
    if (!raidPanel.hidden) void refresh();
  }, 10000);
})();
