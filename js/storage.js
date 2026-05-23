/* ============================================================
   STORAGE v2 — multi-portfolio, watchlist, customers, vendor mode.
   Per-user namespacing. Backward-compatible migration from v0.1.
   ============================================================ */

const Storage = (function () {
  const ROOT_KEY = 'cbh.v1';

  function _readRoot()    { try { return JSON.parse(localStorage.getItem(ROOT_KEY) || '{}'); } catch { return {}; } }
  function _writeRoot(o)  { try { localStorage.setItem(ROOT_KEY, JSON.stringify(o)); } catch {} }

  function rid(prefix = 'p_') { return prefix + Math.random().toString(36).slice(2, 10); }

  function defaultUserData() {
    const mainId = 'p_main';
    return {
      portfolios: [
        { id: mainId, name: 'Main Collection', color: '#5ae3ff', icon: '📚', isPublic: false, publicId: null, cards: [] }
      ],
      activePortfolioId: mainId,
      buyList: [],
      watchList: [],
      customers: [],
      isVendor: false,
      bulkRates: [],
      recents: [],
      paypalHandle: '',
      shippingAddress: '',
      offerCash: 70,
      offerTrade: 80,
      keys: { ebayAppId: '', tcgKey: '', paypalClientId: '' },
      ts: Date.now(),
    };
  }

  function defaultAccounts() {
    return { currentUser: null, users: {} };
  }

  // ---- Accounts ----
  function loadAccounts() {
    const root = _readRoot();
    if (!root.accounts) { root.accounts = defaultAccounts(); _writeRoot(root); }
    return root.accounts;
  }
  function saveAccounts(acc) {
    const root = _readRoot(); root.accounts = acc; _writeRoot(root);
  }

  // ---- Per-user data with migration ----
  function loadUser(username) {
    const root = _readRoot();
    if (!root.userData) root.userData = {};
    if (!root.userData[username]) { root.userData[username] = defaultUserData(); _writeRoot(root); }
    const saved = root.userData[username];
    const d = defaultUserData();

    // v0.1 → v0.2 migration: flat `portfolio` array → portfolios[0].cards
    if (saved.portfolio && !saved.portfolios) {
      const mainId = 'p_main';
      saved.portfolios = [{
        id: mainId, name: 'Main Collection', color: '#5ae3ff', icon: '📚',
        isPublic: false, publicId: null,
        cards: saved.portfolio.map(c => ({ ...c, qty: c.qty || 1 })),
      }];
      saved.activePortfolioId = mainId;
      delete saved.portfolio;
    }

    // Ensure required fields exist (forward-compat as we evolve)
    const merged = { ...d, ...saved };
    merged.keys = { ...d.keys, ...(saved.keys || {}) };
    if (!merged.portfolios?.length) merged.portfolios = d.portfolios;
    if (!merged.activePortfolioId) merged.activePortfolioId = merged.portfolios[0].id;

    return merged;
  }

  function saveUser(username, data) {
    const root = _readRoot();
    if (!root.userData) root.userData = {};
    root.userData[username] = { ...data, ts: Date.now() };
    _writeRoot(root);
  }

  function exportAll() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(_readRoot()))));
  }
  function importAll(b64) {
    try {
      const json = decodeURIComponent(escape(atob(b64)));
      const parsed = JSON.parse(json);
      _writeRoot(parsed);
      return true;
    } catch { return false; }
  }
  function wipeAll() { localStorage.removeItem(ROOT_KEY); }

  // ---- Recents ----
  function pushRecent(username, card) {
    const u = loadUser(username);
    u.recents = [{ ...card, ts: Date.now() }, ...u.recents.filter(r => r.id !== card.id)].slice(0, 12);
    saveUser(username, u);
  }

  // ---- Portfolio helpers ----
  function activePortfolio(u) { return u.portfolios.find(p => p.id === u.activePortfolioId) || u.portfolios[0]; }
  function allPortfolioCards(u) { return u.portfolios.flatMap(p => p.cards.map(c => ({ ...c, _portfolioId: p.id, _portfolioName: p.name }))); }

  function createPortfolio(username, name, color = '#5ae3ff', icon = '📚') {
    const u = loadUser(username);
    const newP = { id: rid('p_'), name, color, icon, isPublic: false, publicId: null, cards: [] };
    u.portfolios.push(newP);
    u.activePortfolioId = newP.id;
    saveUser(username, u);
    return newP;
  }
  function renamePortfolio(username, pid, name) {
    const u = loadUser(username);
    const p = u.portfolios.find(x => x.id === pid);
    if (!p) return false;
    p.name = name;
    saveUser(username, u);
    return true;
  }
  function deletePortfolio(username, pid) {
    const u = loadUser(username);
    if (u.portfolios.length <= 1) return false;
    u.portfolios = u.portfolios.filter(p => p.id !== pid);
    if (u.activePortfolioId === pid) u.activePortfolioId = u.portfolios[0].id;
    saveUser(username, u);
    return true;
  }
  function setActivePortfolio(username, pid) {
    const u = loadUser(username);
    if (!u.portfolios.find(p => p.id === pid)) return false;
    u.activePortfolioId = pid;
    saveUser(username, u);
    return true;
  }
  function togglePortfolioPublic(username, pid) {
    const u = loadUser(username);
    const p = u.portfolios.find(x => x.id === pid);
    if (!p) return null;
    p.isPublic = !p.isPublic;
    if (p.isPublic && !p.publicId) p.publicId = rid('s_');
    saveUser(username, u);
    return p;
  }

  return {
    loadAccounts, saveAccounts, loadUser, saveUser, pushRecent,
    exportAll, importAll, wipeAll,
    activePortfolio, allPortfolioCards,
    createPortfolio, renamePortfolio, deletePortfolio,
    setActivePortfolio, togglePortfolioPublic,
    rid,
  };
})();
