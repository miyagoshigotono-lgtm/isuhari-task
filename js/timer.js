// =====================
// 作業タイマー
// 着手・中断・再開・完了の管理とスプレッドシートへのログ送信
// =====================

const Timer = (() => {

  let currentOrder = null;
  let intervalId = null;
  let sessionStart = null; // 現在のセッション開始時刻

  function getElapsed(order) {
    // 完了済みの累計秒数
    let total = order.totalElapsed || 0;
    // 現在進行中の場合は今のセッション分を加算
    if (order.status === 'active' && sessionStart) {
      total += Math.floor((Date.now() - sessionStart) / 1000);
    }
    return total;
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateDisplay() {
    if (!currentOrder) return;
    const elapsed = getElapsed(currentOrder);
    document.getElementById('timer-elapsed').textContent = formatTime(elapsed);
  }

  function open(order) {
    currentOrder = order;
    sessionStart = null;

    const panel = document.getElementById('timer-panel');
    const info = document.getElementById('timer-info');

    info.textContent = `${order.clientName} / ${order.itemName} ${order.quantity}脚`;
    document.getElementById('timer-elapsed').textContent = formatTime(order.totalElapsed || 0);

    // ボタン表示制御
    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnResume = document.getElementById('btn-resume');
    const btnComplete = document.getElementById('btn-complete');

    btnStart.classList.add('hidden');
    btnPause.classList.add('hidden');
    btnResume.classList.add('hidden');
    btnComplete.classList.add('hidden');

    switch (order.status) {
      case 'pending':
        btnStart.classList.remove('hidden');
        break;
      case 'active':
        sessionStart = Date.now() - (order.sessionStartOffset || 0);
        btnPause.classList.remove('hidden');
        btnComplete.classList.remove('hidden');
        startTick();
        break;
      case 'pause':
        btnResume.classList.remove('hidden');
        btnComplete.classList.remove('hidden');
        break;
      case 'done':
        // 完了済みは表示のみ
        break;
    }

    panel.classList.remove('hidden');
  }

  function startTick() {
    clearInterval(intervalId);
    intervalId = setInterval(updateDisplay, 1000);
  }

  function stopTick() {
    clearInterval(intervalId);
    intervalId = null;
  }

  // ログをGASに送信（将来的な拡張用、今は省略可）
  function sendLog(action, order) {
    // GAS_URLが設定されていれば送信
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.includes('ここに')) return;

    const payload = {
      action: 'log',
      orderId: order.id,
      clientName: order.clientName,
      itemName: order.itemName,
      quantity: order.quantity,
      logAction: action,
      time: new Date().toLocaleString('ja-JP'),
      totalElapsed: order.totalElapsed,
    };

    fetch(CONFIG.GAS_URL + '?action=log', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => {}); // エラーは無視
  }

  function updateOrder(updated) {
    const orders = Order.getAll();
    const idx = orders.findIndex(o => o.id === updated.id);
    if (idx !== -1) {
      orders[idx] = updated;
      Order.save(orders);
      currentOrder = updated;
    }
    Calendar.render();
  }

  function init() {
    document.getElementById('btn-start').addEventListener('click', () => {
      if (!currentOrder) return;
      sessionStart = Date.now();
      currentOrder.status = 'active';
      currentOrder.sessionStartOffset = 0;
      currentOrder.timerLog = currentOrder.timerLog || [];
      currentOrder.timerLog.push({ action: '着手', time: new Date().toLocaleString('ja-JP') });
      updateOrder(currentOrder);
      sendLog('着手', currentOrder);

      document.getElementById('btn-start').classList.add('hidden');
      document.getElementById('btn-pause').classList.remove('hidden');
      document.getElementById('btn-complete').classList.remove('hidden');
      startTick();
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      if (!currentOrder) return;
      stopTick();

      const sessionElapsed = Math.floor((Date.now() - sessionStart) / 1000);
      currentOrder.totalElapsed = (currentOrder.totalElapsed || 0) + sessionElapsed;
      currentOrder.status = 'pause';
      currentOrder.timerLog.push({ action: '中断', time: new Date().toLocaleString('ja-JP') });
      updateOrder(currentOrder);
      sendLog('中断', currentOrder);

      document.getElementById('timer-elapsed').textContent = formatTime(currentOrder.totalElapsed);
      document.getElementById('btn-pause').classList.add('hidden');
      document.getElementById('btn-resume').classList.remove('hidden');
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      if (!currentOrder) return;
      sessionStart = Date.now();
      currentOrder.status = 'active';
      currentOrder.timerLog.push({ action: '再開', time: new Date().toLocaleString('ja-JP') });
      updateOrder(currentOrder);
      sendLog('再開', currentOrder);

      document.getElementById('btn-resume').classList.add('hidden');
      document.getElementById('btn-pause').classList.remove('hidden');
      startTick();
    });

    document.getElementById('btn-complete').addEventListener('click', () => {
      if (!currentOrder) return;
      stopTick();

      if (currentOrder.status === 'active') {
        const sessionElapsed = Math.floor((Date.now() - sessionStart) / 1000);
        currentOrder.totalElapsed = (currentOrder.totalElapsed || 0) + sessionElapsed;
      }

      currentOrder.status = 'done';
      currentOrder.timerLog.push({ action: '完了', time: new Date().toLocaleString('ja-JP') });
      updateOrder(currentOrder);
      sendLog('完了', currentOrder);

      document.getElementById('timer-panel').classList.add('hidden');
      currentOrder = null;
    });

    document.getElementById('timer-close').addEventListener('click', () => {
      stopTick();
      document.getElementById('timer-panel').classList.add('hidden');
      currentOrder = null;
    });
  }

  return { init, open };
})();
