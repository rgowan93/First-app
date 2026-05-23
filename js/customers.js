/* ============================================================
   CUSTOMERS — vendor-facing customer profiles + trade credit.
   Tracks repeat customers, their purchase/sell history, store credit.
   ============================================================ */

const CustomersMod = (function () {

  function rid() { return 'c_' + Math.random().toString(36).slice(2, 10); }

  function list(username) {
    return Storage.loadUser(username).customers || [];
  }

  function create(username, { name, phone, email, notes }) {
    const u = Storage.loadUser(username);
    if (!name) return null;
    const c = { id: rid(), name, phone: phone || '', email: email || '', notes: notes || '', creditCents: 0, transactions: [], createdAt: Date.now() };
    u.customers.unshift(c);
    Storage.saveUser(username, c.id ? u : u);  // no-op safety
    Storage.saveUser(username, u);
    return c;
  }

  function remove(username, id) {
    const u = Storage.loadUser(username);
    u.customers = u.customers.filter(c => c.id !== id);
    Storage.saveUser(username, u);
  }

  function get(username, id) {
    return (Storage.loadUser(username).customers || []).find(c => c.id === id);
  }

  function addTransaction(username, id, txn) {
    // txn: { type: 'buy'|'sell'|'credit'|'redeem', items: [...], totalCents, paymentMethod, note }
    const u = Storage.loadUser(username);
    const c = u.customers.find(x => x.id === id);
    if (!c) return false;
    const entry = { ts: Date.now(), ...txn };
    c.transactions.unshift(entry);
    // Adjust credit if paymentMethod is 'credit' or txn type 'credit'/'redeem'
    if (txn.paymentMethod === 'trade-credit') c.creditCents += txn.totalCents;          // we gave them store credit
    if (txn.type === 'redeem')                c.creditCents -= txn.totalCents;          // they spent credit
    Storage.saveUser(username, u);
    return entry;
  }

  function adjustCredit(username, id, deltaCents, note) {
    const u = Storage.loadUser(username);
    const c = u.customers.find(x => x.id === id);
    if (!c) return false;
    c.creditCents += deltaCents;
    c.transactions.unshift({ ts: Date.now(), type: deltaCents > 0 ? 'credit' : 'redeem', totalCents: Math.abs(deltaCents), note: note || '' });
    Storage.saveUser(username, u);
    return true;
  }

  return { list, create, remove, get, addTransaction, adjustCredit };
})();
