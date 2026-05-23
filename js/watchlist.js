/* ============================================================
   WATCHLIST — track specific cards + browser-notification alerts.

   Each watch entry: { id, cardId, name, image, alertBelow, alertAbove, lastChecked, lastValue, addedAt }

   Alert check loop runs every 30s while app is open: fetches fresh
   value, fires Notification when threshold crossed.

   For background alerts when app is closed, need a push server.
   Currently flagged as "best-effort while app open."
   ============================================================ */

const Watch = (function () {
  let timer = null;

  function list(username) { return Storage.loadUser(username).watchList || []; }
  function add(username, card, { below, above }) {
    const u = Storage.loadUser(username);
    if (u.watchList.find(w => w.cardId === card.id)) return null;
    const entry = {
      id: 'w_' + Math.random().toString(36).slice(2, 10),
      cardId: card.id, name: card.name, set: card.set, image: card.image, tcg: card.tcg,
      alertBelow: below || null, alertAbove: above || null,
      lastChecked: null, lastValue: null,
      addedAt: Date.now(),
    };
    u.watchList.unshift(entry);
    Storage.saveUser(username, u);
    return entry;
  }
  function update(username, id, patch) {
    const u = Storage.loadUser(username);
    const e = u.watchList.find(x => x.id === id);
    if (!e) return false;
    Object.assign(e, patch);
    Storage.saveUser(username, u);
    return true;
  }
  function remove(username, id) {
    const u = Storage.loadUser(username);
    u.watchList = u.watchList.filter(w => w.id !== id);
    Storage.saveUser(username, u);
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try { return await Notification.requestPermission(); }
    catch { return 'denied'; }
  }
  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'assets/icon.svg', tag: 'cbh-alert' }); } catch {}
  }

  /* Start the alert poll loop for the signed-in user */
  function startLoop(username, onCheck) {
    stopLoop();
    timer = setInterval(() => runCheck(username, onCheck).catch(() => {}), 30000);
    // First check immediately
    runCheck(username, onCheck).catch(() => {});
  }
  function stopLoop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function runCheck(username, onCheck) {
    const u = Storage.loadUser(username);
    const items = u.watchList || [];
    if (!items.length) return;
    // Only re-fetch entries last checked > 5 min ago
    const now = Date.now();
    for (const w of items) {
      if (w.lastChecked && (now - w.lastChecked) < 5 * 60 * 1000) continue;
      try {
        const card = await APIs.getById(w.cardId);
        if (!card) continue;
        const tcg = card.prices?.tcgplayer || {};
        const cm = card.prices?.cardmarket || {};
        const v = tcg.holofoil ?? tcg.normal ?? tcg.reverseHolofoil ?? cm.trend ?? cm.avg7 ?? null;
        if (v == null) continue;
        const prev = w.lastValue;
        w.lastValue = v; w.lastChecked = now;
        // Fire notifications if threshold crossed
        if (w.alertBelow && v <= w.alertBelow && (prev == null || prev > w.alertBelow)) {
          notify(`📉 ${w.name} hit your buy target`, `Now $${v.toFixed(2)} (alert ≤ $${w.alertBelow.toFixed(2)})`);
        }
        if (w.alertAbove && v >= w.alertAbove && (prev == null || prev < w.alertAbove)) {
          notify(`📈 ${w.name} hit your sell target`, `Now $${v.toFixed(2)} (alert ≥ $${w.alertAbove.toFixed(2)})`);
        }
      } catch { /* keep going */ }
    }
    Storage.saveUser(username, u);
    if (onCheck) onCheck();
  }

  return { list, add, update, remove, requestPermission, startLoop, stopLoop, runCheck };
})();
