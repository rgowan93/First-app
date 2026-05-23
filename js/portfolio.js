/* ============================================================
   PORTFOLIO + BUY LIST — local persistence, value tracking,
   summary statistics.
   ============================================================ */

const PortfolioMod = (function () {

  function rid() { return Math.random().toString(36).slice(2, 10); }

  function addToPortfolio(user, card, cond, marketValue, purchasePrice) {
    const u = Storage.loadUser(user);
    const entry = {
      id: rid(),
      cardId: card.id,
      tcg: card.tcg,
      name: card.name,
      set: card.set,
      number: card.number,
      image: card.image || null,
      condition: cond,
      purchasePrice: parseFloat(purchasePrice) || 0,
      currentValue: marketValue || 0,
      addedAt: Date.now(),
      history: [{ t: Date.now(), v: marketValue || 0 }],
    };
    u.portfolio.unshift(entry);
    Storage.saveUser(user, u);
    return entry;
  }

  function updateValue(user, entryId, newValue) {
    const u = Storage.loadUser(user);
    const e = u.portfolio.find(p => p.id === entryId);
    if (!e) return false;
    e.currentValue = newValue;
    e.history.push({ t: Date.now(), v: newValue });
    if (e.history.length > 60) e.history = e.history.slice(-60);
    Storage.saveUser(user, u);
    return true;
  }

  function removeFromPortfolio(user, entryId) {
    const u = Storage.loadUser(user);
    u.portfolio = u.portfolio.filter(p => p.id !== entryId);
    Storage.saveUser(user, u);
  }

  function portfolioSummary(user) {
    const u = Storage.loadUser(user);
    const items = u.portfolio || [];
    const value = items.reduce((a, e) => a + (e.currentValue || 0), 0);
    const cost  = items.reduce((a, e) => a + (e.purchasePrice || 0), 0);
    const pl    = value - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    const count = items.length;
    const sets = {};
    for (const e of items) {
      if (!e.set) continue;
      sets[e.set] = (sets[e.set] || 0) + (e.currentValue || 0);
    }
    return { value, cost, pl, plPct, count, sets };
  }

  function addToBuyList(user, card, cond, marketValue) {
    const u = Storage.loadUser(user);
    const entry = {
      id: rid(),
      cardId: card.id,
      tcg: card.tcg,
      name: card.name,
      set: card.set,
      number: card.number,
      image: card.image || null,
      condition: cond,
      marketValue: marketValue || 0,
      addedAt: Date.now(),
    };
    u.buyList.push(entry);
    Storage.saveUser(user, u);
    return entry;
  }

  function removeFromBuyList(user, entryId) {
    const u = Storage.loadUser(user);
    u.buyList = u.buyList.filter(b => b.id !== entryId);
    Storage.saveUser(user, u);
  }

  function clearBuyList(user) {
    const u = Storage.loadUser(user);
    u.buyList = [];
    Storage.saveUser(user, u);
  }

  function buyListTotals(user) {
    const u = Storage.loadUser(user);
    const items = u.buyList || [];
    const market = items.reduce((a, e) => a + (e.marketValue || 0), 0);
    const cash = market * (u.offerCash / 100);
    const trade = market * (u.offerTrade / 100);
    return { market, cash, trade, count: items.length, offerCash: u.offerCash, offerTrade: u.offerTrade };
  }

  function moveBuyListToPortfolio(user) {
    const u = Storage.loadUser(user);
    const ts = Date.now();
    for (const b of u.buyList) {
      u.portfolio.unshift({
        ...b, purchasePrice: b.marketValue * (u.offerCash / 100),
        currentValue: b.marketValue, addedAt: ts,
        history: [{ t: ts, v: b.marketValue }],
      });
    }
    u.buyList = [];
    Storage.saveUser(user, u);
  }

  return {
    addToPortfolio, updateValue, removeFromPortfolio, portfolioSummary,
    addToBuyList, removeFromBuyList, clearBuyList, buyListTotals, moveBuyListToPortfolio,
  };
})();
