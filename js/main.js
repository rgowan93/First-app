/* ============================================================
   MAIN — bootstrapping, service worker, install prompt.
   ============================================================ */

(function () {
  // ---- Loading screen fade ----
  function fadeLoading() {
    const ls = document.getElementById('loading-screen');
    if (!ls) return;
    ls.classList.add('fadeout');
    setTimeout(() => ls.remove(), 500);
  }

  // ---- Boot ----
  function boot() {
    try {
      Game.init();
    } catch (e) {
      console.error('init failed', e);
      alert('Game failed to load: ' + e.message);
      return;
    }

    document.getElementById('topbar').classList.remove('hidden');
    document.getElementById('game').classList.remove('hidden');
    document.getElementById('bottom-nav').classList.remove('hidden');

    UI.boot();
    fadeLoading();

    // Schedule notifications if enabled
    const settings = Game.getSettings();
    if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      Notify.scheduleDaily(Game.state, true);
    }

    // Save on page hide
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        Storage.persist(Game.state);
      }
    });
    addEventListener('beforeunload', () => Storage.persist(Game.state));

    // Resume audio on first interaction (autoplay policy)
    const resume = () => { try { Audio.ensureCtx(); } catch {} document.removeEventListener('click', resume); document.removeEventListener('touchstart', resume); };
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('touchstart', resume, { once: true });
  }

  // ---- Service Worker (PWA) ----
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed', err));
    });
  }

  // ---- PWA install prompt ----
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__deferredInstall = e;
    // Show small banner after a delay so it isn't pushy
    setTimeout(() => {
      const banner = document.getElementById('install-prompt');
      if (banner && !localStorage.getItem('hoc.installdismiss')) banner.classList.remove('hidden');
    }, 30000);
  });
  addEventListener('appinstalled', () => {
    document.getElementById('install-prompt')?.classList.add('hidden');
    deferredPrompt = null;
  });
  document.getElementById('install-yes')?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
    document.getElementById('install-prompt').classList.add('hidden');
  });
  document.getElementById('install-no')?.addEventListener('click', () => {
    document.getElementById('install-prompt').classList.add('hidden');
    localStorage.setItem('hoc.installdismiss', '1');
  });

  // Boot
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
