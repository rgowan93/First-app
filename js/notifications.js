/* ============================================================
   NOTIFICATIONS — local re-engagement reminders.
   Uses the browser Notification API + setTimeout. Works without
   a push server for in-session reminders. For background push
   (when the PWA is closed), connect a VAPID push server.
   ============================================================ */

const Notify = (function () {
  let timers = [];

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';
    try { return await Notification.requestPermission(); }
    catch { return 'denied'; }
  }

  function clear() { timers.forEach(clearTimeout); timers = []; }

  function fire(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'assets/icon.svg', badge: 'assets/icon.svg', tag: 'hoc-daily' }); } catch {}
  }

  function scheduleDaily(state, enabled) {
    clear();
    if (!enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const t = new Date();
    t.setHours(19, 0, 0, 0); // 7pm
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    const ms = t.getTime() - now.getTime();
    timers.push(setTimeout(() => {
      fire('🎰 Your daily pack is ready!', 'Open HOUSE OF CARDS, rip a free pack, and claim your streak bonus.');
      scheduleDaily(state, enabled); // schedule next
    }, ms));

    // Also a short "come back" notification 30 min from now
    timers.push(setTimeout(() => {
      fire('💰 Your beasts have been mining!', 'Tap to collect your offline earnings.');
    }, 30 * 60 * 1000));
  }

  return { requestPermission, scheduleDaily, fire, clear };
})();
