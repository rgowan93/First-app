/* ============================================================
   ANALYTICS — recommendations, movers, set completion, EV.
   Pure functions over portfolio data.
   ============================================================ */

const Analytics = (function () {

  /* ============================================================
     BUY/SELL RECOMMENDATION ENGINE
     Compares current value vs a baseline (Cardmarket avg30 from
     Pokemon TCG API when available; else avg7; else local history avg).
     Returns { action, percent, baseline, confidence, reason, color }
     ============================================================ */
  function recommend({ currentValue, cardmarket, history }) {
    if (currentValue == null || currentValue <= 0) {
      return { action: 'NO DATA', percent: 0, confidence: 'low', reason: 'No current price', color: 'grey' };
    }

    // Pick a baseline: cardmarket avg30 > avg7 > local-history-avg > current (no signal)
    let baseline = cardmarket?.avg30 ?? cardmarket?.avg7 ?? null;
    let baselineLabel = baseline ? '30d avg' : '';
    if (!baseline && history && history.length >= 3) {
      const vals = history.slice(-30).map(h => h.v).filter(v => v > 0);
      if (vals.length >= 3) {
        baseline = vals.reduce((a, b) => a + b, 0) / vals.length;
        baselineLabel = `${vals.length}-pt local avg`;
      }
    }
    if (!baseline) return { action: 'HOLD', percent: 0, confidence: 'low', reason: 'No baseline data — view more often to build history', color: 'grey' };

    const pct = ((currentValue - baseline) / baseline) * 100;

    // Confidence: derived from cardmarket data depth + history length
    let confidence = 'medium';
    if (cardmarket?.avg30 && cardmarket?.avg7) confidence = 'high';
    else if (!cardmarket?.avg30 && (!history || history.length < 5)) confidence = 'low';

    if (pct <= -20) return { action: 'STRONG BUY', percent: pct, confidence, baseline, baselineLabel, reason: `Trading ${Math.abs(pct).toFixed(1)}% below ${baselineLabel}`, color: 'green' };
    if (pct <= -10) return { action: 'BUY',        percent: pct, confidence, baseline, baselineLabel, reason: `Trading ${Math.abs(pct).toFixed(1)}% below ${baselineLabel}`, color: 'green' };
    if (pct >=  25) return { action: 'STRONG SELL',percent: pct, confidence, baseline, baselineLabel, reason: `Trading ${pct.toFixed(1)}% above ${baselineLabel}`,        color: 'red'   };
    if (pct >=  12) return { action: 'SELL',       percent: pct, confidence, baseline, baselineLabel, reason: `Trading ${pct.toFixed(1)}% above ${baselineLabel}`,        color: 'red'   };
    return            { action: 'HOLD',       percent: pct, confidence, baseline, baselineLabel, reason: `Within ${Math.abs(pct).toFixed(1)}% of ${baselineLabel}`,     color: 'amber' };
  }

  /* ============================================================
     DAILY CHANGE — derived from history (most-recent vs prior point)
     ============================================================ */
  function dailyChange(currentValue, history) {
    if (!history || history.length < 2) return { abs: 0, pct: 0, dir: 'flat' };
    // Find a history point ~24h old
    const now = Date.now();
    const yesterday = now - 86400000;
    let prior = history[0];
    for (const h of history) { if (h.t <= yesterday) prior = h; else break; }
    if (!prior || !prior.v) return { abs: 0, pct: 0, dir: 'flat' };
    const abs = currentValue - prior.v;
    const pct = (abs / prior.v) * 100;
    return { abs, pct, dir: abs > 0.01 ? 'up' : abs < -0.01 ? 'down' : 'flat' };
  }

  /* ============================================================
     ATH / ATL
     ============================================================ */
  function ath(history) {
    if (!history?.length) return null;
    return history.reduce((max, h) => (h.v > max.v ? h : max), history[0]);
  }
  function atl(history) {
    if (!history?.length) return null;
    return history.reduce((min, h) => (h.v < min.v ? h : min), history[0]);
  }

  /* ============================================================
     VOLATILITY — std-dev / mean from history (small samples OK)
     ============================================================ */
  function volatility(history) {
    if (!history || history.length < 3) return 0;
    const vals = history.map(h => h.v).filter(v => v > 0);
    if (vals.length < 3) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const stddev = Math.sqrt(variance);
    return (stddev / mean) * 100; // % volatility
  }

  /* ============================================================
     MOVERS — top gainers/losers across a card list (by daily %)
     ============================================================ */
  function topMovers(cards, limit = 10) {
    const withChange = cards.map(c => {
      const d = dailyChange(c.currentValue || 0, c.history || []);
      return { ...c, _change: d };
    });
    const gainers = [...withChange].filter(c => c._change.pct > 0).sort((a, b) => b._change.pct - a._change.pct).slice(0, limit);
    const losers  = [...withChange].filter(c => c._change.pct < 0).sort((a, b) => a._change.pct - b._change.pct).slice(0, limit);
    return { gainers, losers };
  }

  /* ============================================================
     SET COMPLETION — given cards owned + set total (if known)
     ============================================================ */
  function setCompletion(cards) {
    const sets = {};
    for (const c of cards) {
      const k = c.set || 'Unknown';
      if (!sets[k]) sets[k] = { name: k, owned: 0, uniqueIds: new Set(), totalValue: 0, totalKnown: null };
      sets[k].owned += c.qty || 1;
      sets[k].uniqueIds.add(c.cardId);
      sets[k].totalValue += (c.currentValue || 0) * (c.qty || 1);
      // Sniff total from number field "X/Y"
      const m = (c.number || '').match(/\d+\s*\/\s*(\d+)/);
      if (m) sets[k].totalKnown = Math.max(sets[k].totalKnown || 0, parseInt(m[1]));
    }
    return Object.values(sets).map(s => ({
      ...s,
      unique: s.uniqueIds.size,
      pct: s.totalKnown ? (s.uniqueIds.size / s.totalKnown) * 100 : null,
    })).sort((a, b) => b.totalValue - a.totalValue);
  }

  /* ============================================================
     TRADE FAIRNESS — given two stacks, compute who wins
     ============================================================ */
  function tradeFairness(sideA, sideB) {
    const valA = sideA.reduce((a, c) => a + (c.currentValue || 0) * (c.qty || 1), 0);
    const valB = sideB.reduce((a, c) => a + (c.currentValue || 0) * (c.qty || 1), 0);
    const diff = valB - valA;       // positive = you (Side A) gain
    const bigger = Math.max(valA, valB);
    const pct = bigger > 0 ? (Math.abs(diff) / bigger) * 100 : 0;
    let verdict;
    if (pct <= 3)        verdict = { tag: 'fair', label: `FAIR TRADE — within ${pct.toFixed(1)}%` };
    else if (pct <= 10)  verdict = { tag: 'slight', label: `Slightly ${diff > 0 ? 'IN YOUR FAVOR' : 'AGAINST YOU'} — ${pct.toFixed(1)}%` };
    else                 verdict = { tag: 'lopsided', label: `LOPSIDED ${diff > 0 ? 'IN YOUR FAVOR' : 'AGAINST YOU'} — ${pct.toFixed(1)}%` };
    return { valA, valB, diff, pct, verdict };
  }

  /* ============================================================
     SEALED PRODUCT EV — rough expected value calculator
     Inputs: pack count + cards per pack + average EV per card (sniffed)
     Real EV needs pull-rate tables; we use a heuristic:
       baseEV = packs × ($1.50 bulk filler + chase odds × chase value)
     Better when integrated with real set EV data later.
     ============================================================ */
  function sealedEV({ packsPerBox = 36, cardsPerPack = 10, modernEra = true, avgChaseValue = 80, chaseRate = 0.04 }) {
    const bulkPerPack = modernEra ? 1.10 : 0.40;
    const chasePerBox = packsPerBox * chaseRate * avgChaseValue;
    const bulkPerBox  = packsPerBox * bulkPerPack;
    return Math.round((chasePerBox + bulkPerBox) * 100) / 100;
  }

  return { recommend, dailyChange, ath, atl, volatility, topMovers, setCompletion, tradeFairness, sealedEV };
})();
