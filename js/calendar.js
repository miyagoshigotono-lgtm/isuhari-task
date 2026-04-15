// =====================
// カレンダー描画
// GASから工数データを取得してカレンダーを描画する
// =====================

const Calendar = (() => {

  const SCHEDULE_KEY = 'isuhari_schedule';
  let scheduleData = {};
  let currentWeekStart = null;

  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const STATUS_KEYS = ['pending', 'active', 'pause', 'done'];

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getThisMonday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return monday;
  }

  async function fetchSchedule() {
    try {
      const res = await fetch(CONFIG.GAS_URL);
      const data = await res.json();
      scheduleData = data;
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
    } catch (e) {
      const cached = localStorage.getItem(SCHEDULE_KEY);
      if (cached) scheduleData = JSON.parse(cached);
    }
    render();
  }

  function getOrders() {
    return Order ? Order.getAll() : [];
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // その日に「各ステータスが何時間使うか」を集計
  // order.totalHours を搬入日から稼働日に順次割り当てる
  function getDailyAllocationByStatus(dateKey) {
    const sched = scheduleData[dateKey];
    if (!sched || sched.type !== 'work') return null;

    const orders = getOrders();
    const byStatus = { pending: 0, active: 0, pause: 0, done: 0 };

    orders.forEach(order => {
      if (!order.deliveryDate || !order.dueDate) return;
      if (dateKey < order.deliveryDate || dateKey > order.dueDate) return;

      let remaining = Number(order.totalHours || 0);
      if (!(remaining > 0)) return;

      let current = fromKey(order.deliveryDate);
      let safety = 0;
      const MAX_DAYS = 240;

      while (remaining > 0 && safety < MAX_DAYS) {
        const key = toKey(current);
        const s = scheduleData[key];
        if (s && s.type === 'work') {
          const dayHours = Math.min(remaining, Number(s.hours || 0));
          if (key === dateKey) {
            const st = STATUS_KEYS.includes(order.status) ? order.status : 'pending';
            byStatus[st] += dayHours;
            break;
          }
          remaining -= dayHours;
        }
        current.setDate(current.getDate() + 1);
        safety++;
      }
    });

    return { schedHours: Number(sched.hours || 0), byStatus };
  }

  function buildGaugeBar(dateKey) {
    const alloc = getDailyAllocationByStatus(dateKey);
    if (!alloc || !(alloc.schedHours > 0)) return null;

    const gauge = document.createElement('div');
    gauge.className = 'gauge-bar';

    const fill = document.createElement('div');
    fill.className = 'gauge-fill';

    // ステータス別に積み上げ（合計が schedHours を超えたらそこで打ち切り）
    let remainingRatio = 1;
    STATUS_KEYS.forEach(st => {
      if (remainingRatio <= 0) return;
      const hours = alloc.byStatus[st] || 0;
      if (!(hours > 0)) return;
      const ratio = clamp01(hours / alloc.schedHours);
      const segRatio = Math.min(remainingRatio, ratio);
      if (segRatio <= 0) return;
      remainingRatio -= segRatio;

      const seg = document.createElement('div');
      seg.className = `gauge-seg status-${st}`;
      seg.style.width = (segRatio * 100).toFixed(2) + '%';
      fill.appendChild(seg);
    });

    gauge.appendChild(fill);
    return gauge;
  }

  function renderWeek(weekStart) {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const today = toKey(new Date());

    // ヘッダー行（曜日のみ）
    const headerRow = document.createElement('div');
    headerRow.className = 'week-row header-row';
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const cell = document.createElement('div');
      cell.className = 'day-header';
      cell.innerHTML = `<span class="dow">${DOW[d.getDay()]}</span>`;
      headerRow.appendChild(cell);
    }
    grid.appendChild(headerRow);

    const orders = getOrders();

    // 4週分描画
    for (let week = 0; week < 4; week++) {
      const row = document.createElement('div');
      row.className = 'week-row data-row';

      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + week * 7 + i);
        const key = toKey(d);
        const sched = scheduleData[key];
        const isToday = key === today;

        const cell = document.createElement('div');
        cell.className = 'day-cell' + (isToday ? ' today' : '');
        cell.dataset.date = key;

        // 日付ラベル（各セル上部）
        const dateLabel = document.createElement('div');
        dateLabel.className = 'cell-date';
        dateLabel.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
        cell.appendChild(dateLabel);

        if (!sched) {
          cell.classList.add('no-schedule');
        } else if (sched.type === 'off') {
          cell.classList.add('off-day');
        } else {
          // 稼働日：ゲージバー
          const gauge = buildGaugeBar(key);
          if (gauge) {
            // 稼働日が隣り合う場合、ゲージをつなげる
            const prev = new Date(d);
            prev.setDate(d.getDate() - 1);
            const next = new Date(d);
            next.setDate(d.getDate() + 1);
            const prevKey = toKey(prev);
            const nextKey = toKey(next);
            const prevSched = scheduleData[prevKey];
            const nextSched = scheduleData[nextKey];
            if (prevSched && prevSched.type === 'work') gauge.classList.add('gauge-continue-left');
            if (nextSched && nextSched.type === 'work') gauge.classList.add('gauge-continue-right');
            cell.appendChild(gauge);
          }
        }

        // リボン表示は廃止（ゲージは1本で塗りつぶし）

        // 搬入・納期フラッグ
        orders.forEach(order => {
          if (order.deliveryDate === key) {
            const flag = document.createElement('div');
            flag.className = 'flag delivery-flag';
            flag.textContent = '入';
            flag.addEventListener('click', (e) => {
              e.stopPropagation();
              showFlagPopup(e, order, 'delivery');
            });
            cell.appendChild(flag);
          }
          if (order.dueDate === key) {
            const flag = document.createElement('div');
            flag.className = 'flag due-flag';
            flag.textContent = '納';
            flag.addEventListener('click', (e) => {
              e.stopPropagation();
              showFlagPopup(e, order, 'due');
            });
            cell.appendChild(flag);
          }
        });

        row.appendChild(cell);
      }

      grid.appendChild(row);
    }
  }

  function showFlagPopup(e, order, type) {
    const popup = document.getElementById('flag-popup');
    const content = document.getElementById('flag-popup-content');
    const label = type === 'delivery' ? '材料搬入日' : '希望納期';

    if (type === 'due') {
      const dueDate = order.dueDate;
      const orders = getOrders()
        .filter(o => o.dueDate === dueDate)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0) || a.id - b.id);

      content.innerHTML = `
        <strong>${label}</strong><br>
        納期：${dueDate}<br><br>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${orders.map((o, idx) => `
            <div data-order-id="${o.id}" style="border:1px solid var(--border);border-radius:6px;padding:8px;">
              <div style="font-weight:700;margin-bottom:4px;">
                ${idx + 1}. ${o.clientName} / ${o.itemName} ${o.quantity}脚
              </div>
              <div style="color:var(--text-muted);line-height:1.6;">
                搬入：${o.deliveryDate} / 納期：${o.dueDate}
                ${o.note ? `<br>注記：${o.note}` : ''}
              </div>
              <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                <button class="flag-action btn-secondary" data-action="edit" data-order-id="${o.id}">編集</button>
                <button class="flag-action btn-secondary" data-action="delete" data-order-id="${o.id}">削除</button>
                <button class="flag-action btn-secondary" data-action="up" data-order-id="${o.id}" ${idx === 0 ? 'disabled' : ''}>↑優先</button>
                <button class="flag-action btn-secondary" data-action="down" data-order-id="${o.id}" ${idx === orders.length - 1 ? 'disabled' : ''}>↓後回し</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      content.innerHTML = `
        <strong>${label}</strong><br>
        取引先：${order.clientName}<br>
        品目：${order.itemName}<br>
        脚数：${order.quantity}脚<br>
        搬入：${order.deliveryDate}<br>
        納期：${order.dueDate}<br>
        ${order.note ? `注記：${order.note}` : ''}
      `;
    }

    popup.style.left = Math.min(e.pageX, window.innerWidth - 220) + 'px';
    popup.style.top = (e.pageY + 10) + 'px';
    popup.classList.remove('hidden');
  }

  function updateWeekLabel() {
    const end = new Date(currentWeekStart);
    end.setDate(currentWeekStart.getDate() + 27);
    const label = document.getElementById('week-label');
    label.textContent = `${currentWeekStart.getMonth() + 1}/${currentWeekStart.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
  }

  function render() {
    renderWeek(currentWeekStart);
    updateWeekLabel();
  }

  function init() {
    currentWeekStart = getThisMonday();

    document.getElementById('prev-week').addEventListener('click', () => {
      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
      render();
    });

    document.getElementById('next-week').addEventListener('click', () => {
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      render();
    });

    document.getElementById('flag-popup-close').addEventListener('click', () => {
      document.getElementById('flag-popup').classList.add('hidden');
    });

    // ポップアップ内部クリックで閉じない
    document.getElementById('flag-popup').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 納期フラッグのメニュー操作（編集/削除/優先順位）
    document.getElementById('flag-popup-content').addEventListener('click', (e) => {
      const btn = e.target.closest('.flag-action');
      if (!btn) return;
      e.stopPropagation();

      const action = btn.dataset.action;
      const orderId = Number(btn.dataset.orderId);
      if (!orderId) return;

      if (action === 'edit') {
        Order.startEdit(orderId);
        document.getElementById('flag-popup').classList.add('hidden');
        return;
      }

      if (action === 'delete') {
        const ok = confirm('この発注を削除しますか？');
        if (!ok) return;
        Order.removeById(orderId);
        document.getElementById('flag-popup').classList.add('hidden');
        render();
        return;
      }

      if (action === 'up' || action === 'down') {
        const orders = Order.getAll();
        const target = orders.find(o => o.id === orderId);
        if (!target || !target.dueDate) return;
        const sameDue = orders
          .filter(o => o.dueDate === target.dueDate)
          .sort((a, b) => (a.priority || 0) - (b.priority || 0) || a.id - b.id);

        const idx = sameDue.findIndex(o => o.id === orderId);
        const swapWith = action === 'up' ? sameDue[idx - 1] : sameDue[idx + 1];
        if (!swapWith) return;

        const a = target.priority || 0;
        const b = swapWith.priority || 0;
        target.priority = b;
        swapWith.priority = a;
        Order.updateById(target);
        Order.updateById(swapWith);

        // 表示更新（現在開いている納期日を維持するため、target を使って再描画）
        showFlagPopup(e, target, 'due');
        render();
      }
    });

    document.addEventListener('click', () => {
      document.getElementById('flag-popup').classList.add('hidden');
    });

    fetchSchedule();
  }

  return { init, render, scheduleData: () => scheduleData, toKey, fromKey };
})();
