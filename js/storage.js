/* ============================================================
   STORAGE — local-only persistence (per-user namespacing).
   When backend is wired, swap loadUser/saveUser to API calls.
   ============================================================ */

const Storage = (function () {
  const ROOT_KEY = 'cbh.v1';

  function _readRoot() {
    try { return JSON.parse(localStorage.getItem(ROOT_KEY) || '{}'); }
    catch { return {}; }
  }
  function _writeRoot(o) {
    try { localStorage.setItem(ROOT_KEY, JSON.stringify(o)); } catch {}
  }

  function defaultUserData() {
    return {
      portfolio: [],   // [{ id, name, set, number, image, tcg, cardId, condition, graded, purchasePrice, currentValue, addedAt, history: [] }]
      buyList:   [],   // [{ id, name, set, image, cardId, condition, marketValue, image }]
      recents:   [],   // [{ id, name, set, image, value, ts }]
      keys:      { ebayAppId: '', tcgKey: '', paypalClientId: '' },
      offerCash: 70,
      offerTrade: 80,
      myListings: [],
      paypalHandle: '',         // your paypal.me/<handle> — needed to sell
      shippingAddress: '',      // your default ship-from / ship-to address
      ts: Date.now(),
    };
  }

  function defaultAccounts() {
    return {
      currentUser: null,    // username
      users: {},            // { username: { passHash, email, salt, createdAt, isAdmin } }
    };
  }

  // ---- Accounts (auth) ----
  function loadAccounts() {
    const root = _readRoot();
    if (!root.accounts) {
      root.accounts = defaultAccounts();
      _writeRoot(root);
    }
    return root.accounts;
  }
  function saveAccounts(acc) {
    const root = _readRoot();
    root.accounts = acc;
    _writeRoot(root);
  }

  // ---- Per-user data ----
  function loadUser(username) {
    const root = _readRoot();
    if (!root.userData) root.userData = {};
    if (!root.userData[username]) {
      root.userData[username] = defaultUserData();
      _writeRoot(root);
    }
    // Merge defaults so missing fields appear
    return { ...defaultUserData(), ...root.userData[username] };
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

  // ---- Recents helper ----
  function pushRecent(username, card) {
    const u = loadUser(username);
    u.recents = [{ ...card, ts: Date.now() }, ...u.recents.filter(r => r.id !== card.id)].slice(0, 12);
    saveUser(username, u);
  }

  return { loadAccounts, saveAccounts, loadUser, saveUser, pushRecent, exportAll, importAll, wipeAll };
})();
