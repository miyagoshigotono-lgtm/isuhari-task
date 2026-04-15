// =====================
// マスター管理
// 品目・取引先をlocalStorageで管理
// =====================

const Master = (() => {

  const ITEM_KEY = 'isuhari_items';
  const CLIENT_KEY = 'isuhari_clients';

  // デフォルトデータ
  const DEFAULT_ITEMS = [
    { id: 1, name: '座面縫製なし', hours: 0.5 },
  ];

  const DEFAULT_CLIENTS = [
    { id: 1, name: '前職会社' },
  ];

  function getItems() {
    const data = localStorage.getItem(ITEM_KEY);
    return data ? JSON.parse(data) : [...DEFAULT_ITEMS];
  }

  function getClients() {
    const data = localStorage.getItem(CLIENT_KEY);
    return data ? JSON.parse(data) : [...DEFAULT_CLIENTS];
  }

  function saveItems(items) {
    localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  }

  function saveClients(clients) {
    localStorage.setItem(CLIENT_KEY, JSON.stringify(clients));
  }

  // 品目の工数を取得（時間）
  function getItemHours(itemId) {
    const items = getItems();
    const item = items.find(i => i.id === itemId);
    return item ? item.hours : 0.5;
  }

  // セレクトボックスを更新
  function updateSelects() {
    const itemSel = document.getElementById('item-select');
    const clientSel = document.getElementById('client-select');

    const items = getItems();
    const clients = getClients();

    itemSel.innerHTML = items.map(i =>
      `<option value="${i.id}">${i.name}（${i.hours}h/脚）</option>`
    ).join('');

    clientSel.innerHTML = clients.map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('');
  }

  // モーダル内のマスター編集UIを描画
  function renderMasterUI() {
    const content = document.getElementById('master-content');
    const items = getItems();
    const clients = getClients();

    content.innerHTML = `
      <h4 style="margin-bottom:8px;font-size:13px;">品目</h4>
      <table class="master-table">
        <thead>
          <tr>
            <th>品目名</th>
            <th>工数(h/脚)</th>
            <th>単価(円/脚)</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="item-tbody">
          ${items.map(i => `
            <tr data-id="${i.id}">
              <td><input type="text" class="item-name" value="${i.name}"></td>
              <td><input type="number" class="item-hours" value="${i.hours}" min="0.5" step="0.5" style="width:70px;"></td>
              <td><input type="number" class="item-price" value="${i.price || ''}" min="0" step="100" style="width:80px;" placeholder="例:2500"></td>
              <td><button class="btn-del" data-type="item" data-id="${i.id}">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button id="add-item" class="btn-secondary" style="margin-bottom:16px;">＋品目を追加</button>

      <h4 style="margin-bottom:8px;font-size:13px;">取引先</h4>
      <table class="master-table">
        <thead>
          <tr>
            <th>取引先名</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="client-tbody">
          ${clients.map(c => `
            <tr data-id="${c.id}">
              <td><input type="text" class="client-name" value="${c.name}"></td>
              <td><button class="btn-del" data-type="client" data-id="${c.id}">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button id="add-client" class="btn-secondary" style="margin-bottom:16px;">＋取引先を追加</button>

      <button id="save-master" class="btn-primary">保存</button>
    `;

    // 追加ボタン
    document.getElementById('add-item').addEventListener('click', () => {
      const tbody = document.getElementById('item-tbody');
      const newId = Date.now();
      const tr = document.createElement('tr');
      tr.dataset.id = newId;
      tr.innerHTML = `
        <td><input type="text" class="item-name" value="新しい品目"></td>
        <td><input type="number" class="item-hours" value="0.5" min="0.5" step="0.5" style="width:70px;"></td>
        <td><input type="number" class="item-price" value="" min="0" step="100" style="width:80px;" placeholder="例:2500"></td>
        <td><button class="btn-del" data-type="item" data-id="${newId}">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('add-client').addEventListener('click', () => {
      const tbody = document.getElementById('client-tbody');
      const newId = Date.now();
      const tr = document.createElement('tr');
      tr.dataset.id = newId;
      tr.innerHTML = `
        <td><input type="text" class="client-name" value="新しい取引先"></td>
        <td><button class="btn-del" data-type="client" data-id="${newId}">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    // 削除ボタン（委譲）
    content.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-del')) {
        e.target.closest('tr').remove();
      }
    });

    // 保存
    document.getElementById('save-master').addEventListener('click', () => {
      const newItems = [...document.querySelectorAll('#item-tbody tr')].map(tr => ({
        id: parseInt(tr.dataset.id),
        name: tr.querySelector('.item-name').value.trim(),
        hours: parseFloat(tr.querySelector('.item-hours').value) || 0.5,
        price: parseInt(tr.querySelector('.item-price').value) || 0,
      }));

      const newClients = [...document.querySelectorAll('#client-tbody tr')].map(tr => ({
        id: parseInt(tr.dataset.id),
        name: tr.querySelector('.client-name').value.trim(),
      }));

      saveItems(newItems);
      saveClients(newClients);
      updateSelects();
      document.getElementById('master-modal').classList.add('hidden');
    });
  }

  // 初期化
  function init() {
    updateSelects();

    document.getElementById('open-master').addEventListener('click', () => {
      renderMasterUI();
      document.getElementById('master-modal').classList.remove('hidden');
    });

    document.getElementById('close-master').addEventListener('click', () => {
      document.getElementById('master-modal').classList.add('hidden');
    });
  }

  return { init, getItems, getClients, getItemHours, updateSelects };
})();
