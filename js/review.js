// =====================
// 案件レビュー
// 左パネル内で一覧・集計・バックアップ復元を扱う
// =====================

const Review = (() => {
  let activeView = 'calendar';

  function formatHours(value) {
    return (Math.round(Number(value || 0) * 10) / 10).toFixed(1);
  }

  function formatElapsed(seconds) {
    const hours = Number(seconds || 0) / 3600;
    return formatHours(hours);
  }

  function statusLabel(status) {
    return {
      pending: '未着手',
      active: '進行中',
      pause: '中断',
      done: '完了',
    }[status] || '未着手';
  }

  function getOrders() {
    return (Order && Order.getAll()) || [];
  }

  function getFilteredOrders() {
    const search = (document.getElementById('review-search')?.value || '').trim().toLowerCase();
    const status = document.getElementById('review-status-filter')?.value || 'all';
    const client = document.getElementById('review-client-filter')?.value || 'all';
    const sort = document.getElementById('review-sort')?.value || 'dueAsc';

    const list = getOrders().filter((order) => {
      if (status !== 'all' && order.status !== status) return false;
      if (client !== 'all' && String(order.clientId) !== client) return false;
      if (!search) return true;
      const haystack = [
        order.clientName,
        order.itemName,
        order.note,
        ...(order.noteHistory || []).map((entry) => entry.after),
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });

    list.sort((a, b) => {
      const diffA = (a.totalElapsed || 0) / 3600 - (a.totalHours || 0);
      const diffB = (b.totalElapsed || 0) / 3600 - (b.totalHours || 0);
      if (sort === 'dueDesc') return (b.dueDate || '').localeCompare(a.dueDate || '') || a.id - b.id;
      if (sort === 'diffDesc') return diffB - diffA || (a.dueDate || '').localeCompare(b.dueDate || '');
      if (sort === 'elapsedDesc') return (b.totalElapsed || 0) - (a.totalElapsed || 0) || a.id - b.id;
      return (a.dueDate || '').localeCompare(b.dueDate || '') || (a.priority || 0) - (b.priority || 0);
    });

    return list;
  }

  function renderSummary(orders) {
    const el = document.getElementById('review-summary');
    if (!el) return;

    const totalPlanned = orders.reduce((sum, order) => sum + Number(order.totalHours || 0), 0);
    const totalElapsed = orders.reduce((sum, order) => sum + Number(order.totalElapsed || 0), 0) / 3600;
    const activeCount = orders.filter((order) => order.status === 'active').length;
    const diff = totalElapsed - totalPlanned;

    el.innerHTML = `
      <div class="aggregate-card">
        <div class="aggregate-title">案件数</div>
        <div class="aggregate-value">${orders.length}</div>
        <div class="aggregate-note">進行中 ${activeCount}件</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">予定工数</div>
        <div class="aggregate-value">${formatHours(totalPlanned)}h</div>
        <div class="aggregate-note">発注時の見積工数</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">実績工数</div>
        <div class="aggregate-value">${formatHours(totalElapsed)}h</div>
        <div class="aggregate-note">タイマー累計</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">差分</div>
        <div class="aggregate-value">${formatHours(diff)}h</div>
        <div class="aggregate-note">実績 - 予定</div>
      </div>
    `;
  }

  function renderAggregates(orders) {
    const el = document.getElementById('review-aggregates');
    if (!el) return;

    const byMonth = {};
    const byClient = {};
    const byItem = {};

    orders.forEach((order) => {
      const month = (order.dueDate || '').slice(0, 7) || '未設定';
      byMonth[month] = (byMonth[month] || 0) + Number(order.totalElapsed || 0) / 3600;
      byClient[order.clientName || '未設定'] = (byClient[order.clientName || '未設定'] || 0) + Number(order.totalElapsed || 0) / 3600;
      byItem[order.itemName || '未設定'] = (byItem[order.itemName || '未設定'] || 0) + Number(order.totalElapsed || 0) / 3600;
    });

    const topText = (map) => Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, hours]) => `${name} ${formatHours(hours)}h`)
      .join(' / ') || 'データなし';

    el.innerHTML = `
      <div class="aggregate-card">
        <div class="aggregate-title">月別実績</div>
        <div class="aggregate-value">${topText(byMonth)}</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">取引先別実績</div>
        <div class="aggregate-value">${topText(byClient)}</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">品目別実績</div>
        <div class="aggregate-value">${topText(byItem)}</div>
      </div>
      <div class="aggregate-card">
        <div class="aggregate-title">バックアップ</div>
        <div class="aggregate-value">JSON対応</div>
        <div class="aggregate-note">右パネルから保存/復元</div>
      </div>
    `;
  }

  function renderList(orders) {
    const el = document.getElementById('review-list');
    if (!el) return;
    if (!orders.length) {
      el.innerHTML = `<div class="detail-empty">条件に合う案件はありません。</div>`;
      return;
    }

    el.innerHTML = orders.map((order) => {
      const elapsedHours = Number(order.totalElapsed || 0) / 3600;
      const diff = elapsedHours - Number(order.totalHours || 0);
      const noteHistory = (order.noteHistory || []).slice(-3).reverse();
      return `
        <div class="review-card" data-order-id="${order.id}">
          <div class="review-top">
            <div>
              <div class="review-title">${order.clientName} / ${order.itemName} ${order.quantity}脚</div>
              <div class="review-sub">搬入 ${order.deliveryDate || '-'} / 納期 ${order.dueDate || '-'} / 優先度 ${Number(order.priority || 0) + 1}</div>
            </div>
            <span class="status-pill status-${order.status || 'pending'}">${statusLabel(order.status)}</span>
          </div>
          <div class="review-metrics">
            <div class="review-metric">
              <div class="review-metric-label">予定</div>
              <div class="review-metric-value">${formatHours(order.totalHours)}h</div>
            </div>
            <div class="review-metric">
              <div class="review-metric-label">実績</div>
              <div class="review-metric-value">${formatHours(elapsedHours)}h</div>
            </div>
            <div class="review-metric">
              <div class="review-metric-label">差分</div>
              <div class="review-metric-value">${formatHours(diff)}h</div>
            </div>
            <div class="review-metric">
              <div class="review-metric-label">状態</div>
              <div class="review-metric-value">${statusLabel(order.status)}</div>
            </div>
          </div>
          <div class="review-sub">注記: ${order.note || 'なし'}</div>
          <div class="review-note-history">
            履歴: ${noteHistory.length
              ? noteHistory.map((entry) => `${entry.at} ${entry.after || '(空欄)'}`).join('<br>')
              : '履歴なし'}
          </div>
          <div class="review-actions">
            <button class="btn-secondary review-action" data-action="timer" data-order-id="${order.id}">タイマー</button>
            <button class="btn-secondary review-action" data-action="edit" data-order-id="${order.id}">編集</button>
            <button class="btn-secondary review-action" data-action="delete" data-order-id="${order.id}">削除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function refreshClientFilter() {
    const select = document.getElementById('review-client-filter');
    if (!select) return;
    const current = select.value || 'all';
    const options = Master.getClients().map((client) => `<option value="${client.id}">${client.name}</option>`).join('');
    select.innerHTML = `<option value="all">全取引先</option>${options}`;
    select.value = [...select.options].some((opt) => opt.value === current) ? current : 'all';
  }

  function render() {
    refreshClientFilter();
    const orders = getFilteredOrders();
    renderSummary(orders);
    renderAggregates(orders);
    renderList(orders);
  }

  function switchView(view) {
    activeView = view;
    document.getElementById('tab-calendar')?.classList.toggle('active', view === 'calendar');
    document.getElementById('tab-review')?.classList.toggle('active', view === 'review');
    document.getElementById('calendar-view')?.classList.toggle('hidden', view !== 'calendar');
    document.getElementById('review-view')?.classList.toggle('hidden', view !== 'review');
    if (view === 'review') {
      render();
    }
  }

  function downloadBackup() {
    const data = Order.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isuhari-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!Order.importAllData(payload)) throw new Error('invalid data');
        Master.updateSelects();
        Calendar.render();
        render();
        alert('バックアップを復元しました');
      } catch (_) {
        alert('JSONの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  }

  function init() {
    document.getElementById('tab-calendar')?.addEventListener('click', () => switchView('calendar'));
    document.getElementById('tab-review')?.addEventListener('click', () => switchView('review'));
    ['review-search', 'review-status-filter', 'review-client-filter', 'review-sort']
      .forEach((id) => document.getElementById(id)?.addEventListener('input', render));
    ['review-status-filter', 'review-client-filter', 'review-sort']
      .forEach((id) => document.getElementById(id)?.addEventListener('change', render));

    document.getElementById('review-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.review-action');
      if (!btn) return;
      const orderId = Number(btn.dataset.orderId);
      const order = getOrders().find((item) => item.id === orderId);
      if (!order) return;
      const action = btn.dataset.action;
      if (action === 'timer') {
        Timer.open(order);
        return;
      }
      if (action === 'edit') {
        Order.startEdit(orderId);
        switchView('calendar');
        return;
      }
      if (action === 'delete') {
        if (!confirm('この案件を削除しますか？')) return;
        Order.removeById(orderId);
        Calendar.render();
        render();
      }
    });

    document.getElementById('btn-export-data')?.addEventListener('click', downloadBackup);
    document.getElementById('import-data-file')?.addEventListener('change', (e) => {
      importBackup(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
  }

  return { init, render, switchView };
})();
