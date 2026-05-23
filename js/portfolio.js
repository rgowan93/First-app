/* ============================================================
   PORTFOLIO + BUY LIST — multi-portfolio with qty stacking,
   refresh, bulk ops, summary.
   ============================================================ */

const PortfolioMod = (function () {

  function rid() { return Math.random().toString(36).slice(2, 10); }

  /* ---- ADD ---- */
  function addToPortfolio(user, card, cond, marketValue, purchasePrice, portfolioId) {
    const u = Storage.loadUser(user);
    const pf = u.portfolios.find(p => p.id === (portfolioId || u.activePortfolioId)) || Storage.activePortfolio(u);
    // Stack if same card + same condition exists
    const condKey = JSON.stringify(cond);
    const existing = pf.cards.find(c => c.cardId === card.id && JSON.stringify(c.condition) === condKey);
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
      // Average cost basis weighted by qty
      if (purchasePrice > 0) {
        existing.purchasePrice = (((existing.purchasePrice || 0) * (existing.qty - 1)) + parseFloat(purchasePrice)) / existing.qty;
      }
      existing.currentValue = marketValue || existing.currentValue;
      existing.updatedAt = Date.now();
      Storage.saveUser(user, u);
      return existing;
    }
    const entry = {
      id: rid(),
      cardId: card.id, tcg: card.tcg, name: card.name, set: card.set, number: card.number, image: card.image || null,
      rarity: card.rarity, finish: pickFinish(card, cond),
      condition: cond, qty: 1,
      purchasePrice: parseFloat(purchasePrice) || 0,
      currentValue: marketValue || 0,
      cardmarket: card.prices?.cardmarket || null,
      addedAt: Date.now(), updatedAt: Date.now(),
      history: [{ t: Date.now(), v: marketValue || 0 }],
    };
    pf.cards.unshift(entry);
    Storage.saveUser(user, u);
    return entry;
  }
  function pickFinish(card, cond) {
    const tcg = card.prices?.tcgplayer || {};
    if (tcg.holofoil) return 'Holofoil';
    if (tcg.reverseHolofoil) return 'Reverse Holo';
    if (tcg.foil) return 'Foil';
    return 'Normal';
  }

  /* ---- REMOVE / UPDATE ---- */
  function removeFromPortfolio(user, entryId, portfolioId) {
    const u = Storage.loadUser(user);
    for (const p of u.portfolios) {
      const before = p.cards.length;
      p.cards = p.cards.filter(c => c.id !== entryId);
      if (p.cards.length < before) break;
    }
    Storage.saveUser(user, u);
  }
  function adjustQty(user, entryId, delta) {
    const u = Storage.loadUser(user);
    for (const p of u.portfolios) {
      const e = p.cards.find(c => c.id === entryId);
      if (e) {
        e.qty = Math.max(0, (e.qty || 1) + delta);
        if (e.qty === 0) p.cards = p.cards.filter(c => c.id !== entryId);
        Storage.saveUser(user, u);
        return true;
      }
    }
    return false;
  }
  function moveToPortfolio(user, entryId, targetPortfolioId) {
    const u = Storage.loadUser(user);
    for (const p of u.portfolios) {
      const idx = p.cards.findIndex(c => c.id === entryId);
      if (idx >= 0) {
        const [card] = p.cards.splice(idx, 1);
        const target = u.portfolios.find(x => x.id === targetPortfolioId);
        if (target) target.cards.unshift(card);
        Storage.saveUser(user, u);
        return true;
      }
    }
    return false;
  }
  function updateValue(user, entryId, newValue) {
    const u = Storage.loadUser(user);
    for (const p of u.portfolios) {
      const e = p.cards.find(c => c.id === entryId);
      if (e) {
        e.currentValue = newValue;
        e.history = e.history || [];
        e.history.push({ t: Date.now(), v: newValue });
        if (e.history.length > 90) e.history = e.history.slice(-90);
        e.updatedAt = Date.now();
        Storage.saveUser(user, u);
        return true;
      }
    }
    return false;
  }

  /* ---- REFRESH all (or one portfolio) ---- */
  async function refreshPortfolio(user, portfolioId, onProgress) {
    const u = Storage.loadUser(user);
    const p = portfolioId ? u.portfolios.find(x => x.id === portfolioId) : Storage.activePortfolio(u);
    if (!p) return { updated: 0, failed: 0 };
    let updated = 0, failed = 0;
    for (let i = 0; i < p.cards.length; i++) {
      const e = p.cards[i];
      if (onProgress) onProgress(i + 1, p.cards.length, e);
      const res = await APIs.refreshValue(e.cardId, e.condition);
      if (res?.value != null) {
        e.currentValue = res.value;
        e.cardmarket = res.card.prices?.cardmarket || e.cardmarket;
        e.history = e.history || [];
        e.history.push({ t: Date.now(), v: res.value });
        if (e.history.length > 90) e.history = e.history.slice(-90);
        e.updatedAt = Date.now();
        updated++;
      } else {
        failed++;
      }
    }
    Storage.saveUser(user, u);
    return { updated, failed, total: p.cards.length };
  }

  /* ---- SUMMARY ---- */
  function portfolioSummary(user, portfolioId) {
    const u = Storage.loadUser(user);
    const cards = portfolioId === '_all'
      ? Storage.allPortfolioCards(u)
      : (u.portfolios.find(p => p.id === (portfolioId || u.activePortfolioId)) || Storage.activePortfolio(u)).cards;
    const totalQty = cards.reduce((a, e) => a + (e.qty || 1), 0);
    const value = cards.reduce((a, e) => a + (e.currentValue || 0) * (e.qty || 1), 0);
    const cost  = cards.reduce((a, e) => a + (e.purchasePrice || 0) * (e.qty || 1), 0);
    const pl    = value - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    // Daily change roll-up
    const dailyDelta = cards.reduce((a, e) => {
      const d = Analytics.dailyChange(e.currentValue || 0, e.history || []);
      return a + (d.abs || 0) * (e.qty || 1);
    }, 0);
    const sealedCount = cards.filter(c => c.tcg === 'sealed' || /booster|etb|box|bundle/i.test(c.name)).reduce((a, c) => a + (c.qty || 1), 0);
    const gradedCount = cards.filter(c => c.condition?.kind === 'graded').reduce((a, c) => a + (c.qty || 1), 0);
    return { value, cost, pl, plPct, count: cards.length, totalQty, dailyDelta, sealedCount, gradedCount };
  }

  /* ============================================================
     BUY LIST
     ============================================================ */
  function addToBuyList(user, card, cond, marketValue) {
    const u = Storage.loadUser(user);
    const entry = {
      id: rid(), cardId: card.id, tcg: card.tcg,
      name: card.name, set: card.set, number: card.number,
      image: card.image || null,
      condition: cond, marketValue: marketValue || 0,
      addedAt: Date.now(),
    };
    u.buyList.push(entry);
    Storage.saveUser(user, u);
    return entry;
  }
  function removeFromBuyList(user, entryId) {
    const u = Storage.loadUser(user); u.buyList = u.buyList.filter(b => b.id !== entryId); Storage.saveUser(user, u);
  }
  function clearBuyList(user) { const u = Storage.loadUser(user); u.buyList = []; Storage.saveUser(user, u); }
  function buyListTotals(user) {
    const u = Storage.loadUser(user);
    const items = u.buyList || [];
    const market = items.reduce((a, e) => a + (e.marketValue || 0), 0);
    const cash = market * (u.offerCash / 100);
    const trade = market * (u.offerTrade / 100);
    return { market, cash, trade, count: items.length, offerCash: u.offerCash, offerTrade: u.offerTrade };
  }
  function moveBuyListToPortfolio(user, portfolioId) {
    const u = Storage.loadUser(user);
    const target = u.portfolios.find(p => p.id === (portfolioId || u.activePortfolioId)) || Storage.activePortfolio(u);
    const ts = Date.now();
    for (const b of u.buyList) {
      target.cards.unshift({
        id: rid(),
        cardId: b.cardId, tcg: b.tcg, name: b.name, set: b.set, number: b.number, image: b.image,
        condition: b.condition, qty: 1,
        purchasePrice: (b.marketValue || 0) * (u.offerCash / 100),
        currentValue: b.marketValue,
        addedAt: ts, updatedAt: ts,
        history: [{ t: ts, v: b.marketValue }],
      });
    }
    u.buyList = [];
    Storage.saveUser(user, u);
  }

  return {
    addToPortfolio, removeFromPortfolio, adjustQty, moveToPortfolio, updateValue,
    refreshPortfolio, portfolioSummary,
    addToBuyList, removeFromBuyList, clearBuyList, buyListTotals, moveBuyListToPortfolio,
  };
})();
