// =====================
// データ保存層
// localStorage を基本にしつつ、GAS/Google Sheets と自動同期する
// =====================

const DataStore = (() => {
  const KEYS = {
    orders: 'isuhari_orders',
    items: 'isuhari_items',
    clients: 'isuhari_clients',
    schedule: 'isuhari_schedule',
    pendingSync: 'isuhari_pending_sync',
    lastSyncAt: 'isuhari_last_sync_at',
  };

  let syncTimer = null;

  function hasRemote() {
    return Boolean(CONFIG && CONFIG.GAS_URL && !CONFIG.GAS_URL.includes('ここに'));
  }

  function getJson(key, fallback = null) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function setJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function collectSnapshot() {
    return {
      orders: getJson(KEYS.orders, []),
      items: getJson(KEYS.items, null),
      clients: getJson(KEYS.clients, null),
      schedule: getJson(KEYS.schedule, null),
      syncedAt: new Date().toISOString(),
    };
  }

  async function request(url, options = {}) {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function hydrateFromRemote() {
    if (!hasRemote()) return false;

    try {
      const data = await request(`${CONFIG.GAS_URL}?action=bootstrap&_=${Date.now()}`);
      if (data && data.ok && data.data) {
        const payload = data.data;
        if (payload.orders) setJson(KEYS.orders, payload.orders);
        if (payload.items) setJson(KEYS.items, payload.items);
        if (payload.clients) setJson(KEYS.clients, payload.clients);
        if (payload.schedule) setJson(KEYS.schedule, payload.schedule);
        localStorage.setItem(KEYS.lastSyncAt, new Date().toISOString());
        return true;
      }
    } catch (_) {
      // リモート読込に失敗した場合は localStorage をそのまま使う
    }
    return false;
  }

  async function fetchSchedule() {
    if (!hasRemote()) return null;
    try {
      const data = await request(`${CONFIG.GAS_URL}?action=getSchedule&_=${Date.now()}`);
      if (data && data.ok && data.schedule) {
        setJson(KEYS.schedule, data.schedule);
        return data.schedule;
      }
    } catch (_) {
      // fallback to local cache
    }
    return null;
  }

  async function flushSyncNow(reason = 'manual') {
    if (!hasRemote()) return false;

    const snapshot = collectSnapshot();
    try {
      const result = await request(`${CONFIG.GAS_URL}?action=sync`, {
        method: 'POST',
        body: {
          action: 'sync',
          reason,
          snapshot,
        },
      });
      if (result && result.ok) {
        localStorage.removeItem(KEYS.pendingSync);
        localStorage.setItem(KEYS.lastSyncAt, new Date().toISOString());
        return true;
      }
    } catch (_) {
      setJson(KEYS.pendingSync, { reason, snapshot, failedAt: new Date().toISOString() });
    }
    return false;
  }

  function scheduleSync(reason = 'update') {
    if (!hasRemote()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      flushSyncNow(reason);
    }, 700);
  }

  async function flushPendingSync() {
    if (!hasRemote()) return false;
    const pending = getJson(KEYS.pendingSync, null);
    if (!pending) return false;
    return flushSyncNow(pending.reason || 'retry');
  }

  async function sendLog(action, order) {
    if (!hasRemote()) return false;
    try {
      const result = await request(`${CONFIG.GAS_URL}?action=log`, {
        method: 'POST',
        body: {
          action: 'log',
          log: {
            orderId: order.id,
            clientName: order.clientName,
            itemName: order.itemName,
            quantity: order.quantity,
            logAction: action,
            time: new Date().toLocaleString('ja-JP'),
            totalElapsed: order.totalElapsed || 0,
          },
        },
      });
      return Boolean(result && result.ok);
    } catch (_) {
      return false;
    }
  }

  async function init() {
    await hydrateFromRemote();
    await flushPendingSync();
  }

  return {
    init,
    scheduleSync,
    flushSyncNow,
    flushPendingSync,
    fetchSchedule,
    sendLog,
    hasRemote,
  };
})();
