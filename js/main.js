/* ============================================================
   MAIN — bootstrap, service worker, install prompt.
   ============================================================ */

(function () {
  function fadeLoading() {
    const ls = document.getElementById('loading-screen');
    if (!ls) return;
    ls.classList.add('fadeout');
    setTimeout(() => ls.remove(), 500);
  }

  async function boot() {
    try {
      await Auth.ensureAdmin();
      UI.boot();
      fadeLoading();
    } catch (e) {
      console.error('boot failed', e);
      document.body.innerHTML = '<div style="padding:30px;color:white;text-align:center"><h2>Failed to boot</h2><pre style="text-align:left">' + (e.stack || e.message) + '</pre></div>';
    }
  }

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed', err));
    });
  }

  // PWA install
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__deferredInstall = e;
    setTimeout(() => {
      const banner = document.getElementById('install-prompt');
      if (banner && !localStorage.getItem('cbh.installdismiss')) banner.classList.remove('hidden');
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
    localStorage.setItem('cbh.installdismiss', '1');
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
