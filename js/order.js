// =====================
// 発注管理
// 発注の登録・工数チェック・localStorage保存
// =====================

const Order = (() => {

  const ORDER_KEY = 'isuhari_orders';
  let editingOrderId = null;

  function getAll() {
    const data = localStorage.getItem(ORDER_KEY);
    return data ? JSON.parse(data) : [];
  }

  function save(orders) {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  }

  function updateById(updated) {
    const orders = getAll();
    const idx = orders.findIndex(o => o.id === updated.id);
    if (idx === -1) return false;
    orders[idx] = updated;
    save(orders);
    return true;
  }

  function removeById(id) {
    const orders = getAll();
    const next = orders.filter(o => o.id !== id);
    save(next);
  }

  // 工数計算：脚数 × 品目の工数(h/脚)
  function calcTotalHours(itemId, quantity) {
    const hours = Master.getItemHours(parseInt(itemId));
    return hours * parseInt(quantity);
  }

  // 搬入日から最短納期を計算
  // 稼働スケジュールを参照して工数が消化できる最短日を返す
  function calcEarliestDue(deliveryDate, totalHours) {
    const scheduleData = Calendar.scheduleData();
    let remaining = totalHours;
    let current = Calendar.fromKey(deliveryDate);
    let safety = 0;
    const MAX_DAYS = 120; // 無限ループ防止

    while (remaining > 0 && safety < MAX_DAYS) {
      const key = Calendar.toKey(current);
      const sched = scheduleData[key];

      if (sched && sched.type === 'work') {
        const used = getUsedHours(key);
        const available = Math.max(0, sched.hours - used);
        remaining -= available;
      }

      if (remaining > 0) {
        current.setDate(current.getDate() + 1);
        safety++;
      }
    }

    // 翌日が最短納期
    current.setDate(current.getDate() + 1);
    return Calendar.toKey(current);
  }

  // 指定日の使用済み工数
  function getUsedHours(dateKey) {
    const orders = getAll();
    let used = 0;

    orders.forEach(order => {
      if (!order.deliveryDate || !order.dueDate) return;

      const scheduleData = Calendar.scheduleData();
      let remaining = order.totalHours;
      let current = Calendar.fromKey(order.deliveryDate);

      while (remaining > 0) {
        const key = Calendar.toKey(current);
        const sched = scheduleData[key];

        if (sched && sched.type === 'work') {
          const dayHours = Math.min(remaining, sched.hours);
          if (key === dateKey) {
            used += dayHours;
          }
          remaining -= dayHours;
        }

        if (remaining > 0) {
          current.setDate(current.getDate() + 1);
        } else {
          break;
        }
      }
    });

    return used;
  }

  // 工数パンクチェック
  function checkOverflow(deliveryDate, dueDate, totalHours, excludeId = null) {
    const scheduleData = Calendar.scheduleData();
    let remaining = totalHours;
    let current = Calendar.fromKey(deliveryDate);
    const due = Calendar.fromKey(dueDate);

    while (remaining > 0 && current <= due) {
      const key = Calendar.toKey(current);
      const sched = scheduleData[key];

      if (sched && sched.type === 'work') {
        const used = getUsedHoursExcluding(key, excludeId);
        const available = Math.max(0, sched.hours - used);
        remaining -= available;
      }

      current.setDate(current.getDate() + 1);
    }

    return remaining > 0; // trueならパンク
  }

  function getUsedHoursExcluding(dateKey, excludeId) {
    const orders = getAll().filter(o => o.id !== excludeId);
    let used = 0;

    orders.forEach(order => {
      if (!order.deliveryDate || !order.dueDate) return;
      const scheduleData = Calendar.scheduleData();
      let remaining = order.totalHours;
      let current = Calendar.fromKey(order.deliveryDate);

      while (remaining > 0) {
        const key = Calendar.toKey(current);
        const sched = scheduleData[key];

        if (sched && sched.type === 'work') {
          const dayHours = Math.min(remaining, sched.hours);
          if (key === dateKey) used += dayHours;
          remaining -= dayHours;
        }

        if (remaining > 0) {
          current.setDate(current.getDate() + 1);
        } else {
          break;
        }
      }
    });

    return used;
  }

  // 発注確定
  function submit() {
    const clientId = parseInt(document.getElementById('client-select').value);
    const itemId = parseInt(document.getElementById('item-select').value);
    const quantity = parseInt(document.getElementById('quantity').value);
    const deliveryDate = document.getElementById('delivery-date').value;
    const dueDate = document.getElementById('due-date').value;
    const note = document.getElementById('note').value.trim();

    if (!deliveryDate || !dueDate) {
      alert('搬入日と希望納期を入力してください');
      return;
    }

    const totalHours = calcTotalHours(itemId, quantity);
    const overflow = checkOverflow(deliveryDate, dueDate, totalHours, editingOrderId);

    if (overflow) {
      document.getElementById('order-warning').classList.remove('hidden');
      return;
    }

    const clients = Master.getClients();
    const items = Master.getItems();
    const client = clients.find(c => c.id === clientId);
    const item = items.find(i => i.id === itemId);

    const orders = getAll();
    const baseOrder = {
      id: editingOrderId || Date.now(),
      clientId,
      clientName: client ? client.name : '',
      itemId,
      itemName: item ? item.name : '',
      quantity,
      deliveryDate,
      dueDate,
      note,
      totalHours,
      priority: 0, // 同一納期内の優先度（小さいほど上）
    };

    if (editingOrderId) {
      const prev = orders.find(o => o.id === editingOrderId);
      const updated = {
        ...(prev || {}),
        ...baseOrder,
        // 編集時は既存の進捗ログ・タイマー累計は維持
        status: (prev && prev.status) ? prev.status : 'pending',
        timerLog: (prev && prev.timerLog) ? prev.timerLog : [],
        totalElapsed: (prev && prev.totalElapsed) ? prev.totalElapsed : 0,
      };
      updateById(updated);
    } else {
      const newOrder = {
        ...baseOrder,
        status: 'pending', // pending / active / pause / done
        timerLog: [],      // { action, time } の配列
        totalElapsed: 0,   // 累計作業秒数
      };
      orders.push(newOrder);
      save(orders);
    }

    // フォームリセット
    document.getElementById('delivery-date').value = '';
    document.getElementById('due-date').value = '';
    document.getElementById('note').value = '';
    document.getElementById('quantity').value = 1;
    document.getElementById('order-warning').classList.add('hidden');
    editingOrderId = null;
    document.getElementById('order-submit').textContent = '発注確定';

    Calendar.render();
  }

  // 最短納期の自動セット（搬入日変更時）
  function onDeliveryChange() {
    const deliveryDate = document.getElementById('delivery-date').value;
    const itemId = document.getElementById('item-select').value;
    const quantity = document.getElementById('quantity').value;

    if (!deliveryDate || !itemId || !quantity) return;

    const totalHours = calcTotalHours(itemId, quantity);
    const earliest = calcEarliestDue(deliveryDate, totalHours);
    document.getElementById('due-date').value = earliest;
    checkAndWarn();
  }

  // 警告チェック
  function checkAndWarn() {
    const deliveryDate = document.getElementById('delivery-date').value;
    const dueDate = document.getElementById('due-date').value;
    const itemId = document.getElementById('item-select').value;
    const quantity = document.getElementById('quantity').value;

    if (!deliveryDate || !dueDate) return;

    const totalHours = calcTotalHours(itemId, quantity);
    const overflow = checkOverflow(deliveryDate, dueDate, totalHours);
    const warning = document.getElementById('order-warning');

    if (overflow) {
      warning.classList.remove('hidden');
    } else {
      warning.classList.add('hidden');
    }
  }

  function init() {
    document.getElementById('order-submit').addEventListener('click', submit);
    document.getElementById('delivery-date').addEventListener('change', onDeliveryChange);
    document.getElementById('due-date').addEventListener('change', checkAndWarn);
    document.getElementById('quantity').addEventListener('change', onDeliveryChange);
    document.getElementById('item-select').addEventListener('change', onDeliveryChange);
  }

  function startEdit(orderId) {
    const order = getAll().find(o => o.id === orderId);
    if (!order) return;
    editingOrderId = order.id;

    document.getElementById('client-select').value = String(order.clientId);
    document.getElementById('item-select').value = String(order.itemId);
    document.getElementById('quantity').value = String(order.quantity);
    document.getElementById('delivery-date').value = order.deliveryDate || '';
    document.getElementById('due-date').value = order.dueDate || '';
    document.getElementById('note').value = order.note || '';
    document.getElementById('order-warning').classList.add('hidden');
    document.getElementById('order-submit').textContent = '更新';
  }

  function cancelEdit() {
    editingOrderId = null;
    document.getElementById('order-submit').textContent = '発注確定';
  }

  return { init, getAll, save, checkOverflow, removeById, updateById, startEdit, cancelEdit };
})();
