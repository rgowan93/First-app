/* ============================================================
   AUTH — local-only account system with hashed passwords.
   NOTE: localStorage is not secure storage. For real
   multi-device login you need a backend with proper auth.
   Admin account 'rgowan93' is bootstrapped on first run.
   ============================================================ */

const Auth = (function () {

  // Pre-computed SHA-256 hash of "TESTER1" using a constant salt.
  // (User asked for this credential — change ASAP after first login.)
  const ADMIN_USERNAME = 'rgowan93';
  const ADMIN_SALT = 'cbh-bootstrap-001';
  // SHA-256("TESTER1" + ADMIN_SALT) computed below at first run.

  async function sha256(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function randSalt() {
    const arr = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function ensureAdmin() {
    const acc = Storage.loadAccounts();
    if (!acc.users[ADMIN_USERNAME]) {
      const passHash = await sha256('TESTER1' + ADMIN_SALT);
      acc.users[ADMIN_USERNAME] = {
        passHash, salt: ADMIN_SALT, email: '',
        isAdmin: true, createdAt: Date.now(),
      };
      Storage.saveAccounts(acc);
    }
  }

  async function signIn(username, password) {
    await ensureAdmin();
    const acc = Storage.loadAccounts();
    const u = acc.users[username];
    if (!u) return { ok: false, reason: 'No such user.' };
    const h = await sha256(password + u.salt);
    if (h !== u.passHash) return { ok: false, reason: 'Wrong password.' };
    acc.currentUser = username;
    Storage.saveAccounts(acc);
    return { ok: true, user: { username, isAdmin: !!u.isAdmin, email: u.email } };
  }

  async function signUp(username, password, email) {
    if (!username || username.length < 3) return { ok: false, reason: 'Username too short.' };
    if (!password || password.length < 6) return { ok: false, reason: 'Password must be 6+ chars.' };
    await ensureAdmin();
    const acc = Storage.loadAccounts();
    if (acc.users[username]) return { ok: false, reason: 'Username already exists.' };
    const salt = randSalt();
    const passHash = await sha256(password + salt);
    acc.users[username] = { passHash, salt, email: email || '', isAdmin: false, createdAt: Date.now() };
    acc.currentUser = username;
    Storage.saveAccounts(acc);
    return { ok: true, user: { username, isAdmin: false, email: email || '' } };
  }

  function signOut() {
    const acc = Storage.loadAccounts();
    acc.currentUser = null;
    Storage.saveAccounts(acc);
  }

  async function continueAsGuest() {
    await ensureAdmin();
    const acc = Storage.loadAccounts();
    if (!acc.users['guest']) {
      acc.users['guest'] = { passHash: '', salt: '', email: '', isAdmin: false, createdAt: Date.now() };
    }
    acc.currentUser = 'guest';
    Storage.saveAccounts(acc);
    return { ok: true, user: { username: 'guest', isAdmin: false, email: '' } };
  }

  function getCurrentUser() {
    const acc = Storage.loadAccounts();
    if (!acc.currentUser) return null;
    const u = acc.users[acc.currentUser];
    if (!u) return null;
    return { username: acc.currentUser, isAdmin: !!u.isAdmin, email: u.email };
  }

  return { signIn, signUp, signOut, continueAsGuest, getCurrentUser, ensureAdmin };
})();
