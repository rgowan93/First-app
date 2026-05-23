/* ============================================================
   GAME — core state, rules, mechanics.
   Pure game logic; DOM updates live in ui.js.
   ============================================================ */

const Game = (function () {
  let state = null;
  let settings = null;
  const listeners = new Set();
  let loopTimer = null;
  let lastLoop = 0;

  /* ---- INIT ---- */
  function init() {
    state = Storage.load();
    settings = Storage.loadSettings();
    Audio.setEnabled(!!settings.sound);

    // First-time setup: give the player a starter card so the tap loop works immediately
    if (!state.activeCard) {
      addCard('bitsy');
      state.activeCard = 'bitsy';
    }

    // Process offline earnings since last seen
    state.__offlinePending = computeOfflineEarnings();

    // Roll daily quests if expired
    rotateDailyQuests();

    // Apply referral if present in URL and not already referred
    const ref = Social.parseReferralFromURL();
    if (ref && !state.referredBy && ref !== state.referralCode) {
      state.referredBy = ref;
      state.coins += 50000;
      state.gems += 100;
      addToast('🎁 Referral bonus: 💎 100 + 💰 50K');
    }

    Storage.markDirty(state);
    startLoop();
  }

  function startLoop() {
    if (loopTimer) cancelAnimationFrame(loopTimer);
    lastLoop = performance.now();
    function tick(t) {
      const dt = Math.min(0.5, (t - lastLoop) / 1000); // cap to avoid huge jumps
      lastLoop = t;
      step(dt);
      loopTimer = requestAnimationFrame(tick);
    }
    loopTimer = requestAnimationFrame(tick);

    // 1-second ticker for time-sensitive UI
    setInterval(() => {
      // Boost expiry check
      if (state.boost.until && state.boost.until < Date.now()) {
        state.boost = { mult: 1, until: 0 };
      }
      // VIP expiry check
      if (state.vipUntil && state.vipUntil < Date.now()) {
        state.vip = false;
        state.vipUntil = 0;
      }
      // Starter offer expiry
      if (!state.starterOfferUntil || state.starterOfferUntil < Date.now()) {
        // Reset offer for another 24h so it keeps showing
        state.starterOfferUntil = Date.now() + 24 * 60 * 60 * 1000;
      }
      // Daily quest rotation
      rotateDailyQuests();
      // Increment playtime metric
      bumpMetric('playtime_today', 1);
      notifyTick();
    }, 1000);
  }

  function step(dt) {
    // Idle income
    const rps = getRps();
    if (rps > 0) {
      const inc = rps * dt;
      state.coins += inc;
      bumpMetric('total_earned', inc);
      bumpMetric('earned_today', inc);
    }
    notify('tick');
  }

  /* ---- LISTENERS ---- */
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify(ev) { listeners.forEach(fn => { try { fn(ev, state); } catch (e) { console.error(e); } }); Storage.markDirty(state); }
  function notifyTick() { listeners.forEach(fn => { try { fn('slow-tick', state); } catch {} }); }

  /* ---- HELPERS ---- */
  function getPerTap() {
    let v = state.baseTapValue;
    for (const id in state.tapUpgrades) {
      const def = TAP_UPGRADES.find(u => u.id === id);
      if (def) v += def.add * state.tapUpgrades[id];
    }
    // Active card passive
    const ac = state.activeCard;
    if (ac && CARD_BY_ID[ac]) {
      const c = CARD_BY_ID[ac];
      if (c.passive?.includes('tap power') || c.passive?.includes('tap ')) {
        if (c.passive.includes('+5%'))  v *= 1.05;
        if (c.passive.includes('+10%')) v *= 1.10;
        if (c.passive.includes('+15%')) v *= 1.15;
        if (c.passive.includes('+20%')) v *= 1.20;
        if (c.passive.includes('×2'))   v *= 2;
      }
    }
    v *= globalMult();
    return Math.floor(v) || 1;
  }

  function getRps() {
    let v = 0;
    for (const id in state.cards) {
      const c = state.cards[id];
      if (!c.count) continue;
      const stats = cardStats(id, c.level, c.evolved);
      v += stats.rps * c.count;
    }
    // Active card passive bonus on earnings
    const ac = state.activeCard;
    if (ac && CARD_BY_ID[ac]?.passive) {
      const p = CARD_BY_ID[ac].passive;
      if (p.includes('+15% all'))  v *= 1.15;
      if (p.includes('+50%'))      v *= 1.50;
      if (p.includes('×2 ALL'))    v *= 2;
      if (p.includes('×3 ALL'))    v *= 3;
    }
    v *= globalMult();
    return v;
  }

  function globalMult() {
    let m = 1;
    if (state.boost.until > Date.now()) m *= state.boost.mult;
    if (state.vip) m *= 2;
    return m;
  }

  /* ---- TAP ---- */
  function tap() {
    const gain = getPerTap();
    state.coins += gain;
    bumpMetric('total_taps', 1);
    bumpMetric('taps_today', 1);
    bumpMetric('total_earned', gain);
    bumpMetric('earned_today', gain);
    addXP(1);
    Audio.tap();
    notify('tap');
    return gain;
  }

  /* ---- COINS / GEMS ---- */
  function addCoins(n)  { state.coins += n; bumpMetric('total_earned', n); bumpMetric('earned_today', n); notify('coins'); }
  function addGems(n)   { state.gems += n; notify('gems'); }
  function spendCoins(n){ if (state.coins < n) return false; state.coins -= n; bumpMetric('spent_today', n); notify('coins'); return true; }
  function spendGems(n) { if (state.gems  < n) return false; state.gems  -= n; notify('gems');  return true; }

  /* ---- XP / LEVEL ---- */
  function addXP(n) {
    state.xp += n;
    let leveledUp = false;
    while (state.xp >= xpForLevel(state.level)) {
      state.xp -= xpForLevel(state.level);
      state.level += 1;
      leveledUp = true;
      // Battle pass progression: earn 50 XP per level-up
      bpAddXP(50);
    }
    if (leveledUp) { Audio.levelUp(); notify('levelup'); }
  }

  /* ---- METRICS ---- */
  function bumpMetric(k, v) {
    state.metrics[k] = (state.metrics[k] || 0) + v;
  }

  /* ---- TAP UPGRADES ---- */
  function buyTapUpgrade(id) {
    const def = TAP_UPGRADES.find(u => u.id === id);
    if (!def) return false;
    const owned = state.tapUpgrades[id] || 0;
    const cost = nextCost(def, owned);
    if (!spendCoins(cost)) return false;
    state.tapUpgrades[id] = owned + 1;
    bumpMetric('upgrades_today', 1);
    Audio.buy();
    notify('upgrade');
    return true;
  }

  /* ---- CARDS ---- */
  function addCard(id) {
    if (!CARD_BY_ID[id]) return false;
    const existing = state.cards[id];
    const isNew = !existing;
    if (existing) existing.count += 1;
    else state.cards[id] = { level: 1, count: 1, evolved: false };

    const tier = CARD_BY_ID[id].tier;
    bumpMetric('total_hatches', 0); // counted at hatch site
    if (tier === 3) bumpMetric('rare_hatched', 1);
    if (tier === 4) bumpMetric('epic_hatched', 1);
    if (tier === 5) bumpMetric('legendary_hatched', 1);
    if (tier === 6) bumpMetric('mythic_hatched', 1);

    if (isNew) {
      const unique = Object.keys(state.cards).length;
      state.metrics.unique_beasts = unique;
    }
    notify('cards');
    return { isNew, tier };
  }

  function levelUpCard(id) {
    const c = state.cards[id]; if (!c) return false;
    const cost = cardLevelCost(id, c.level);
    if (!spendCoins(cost)) return false;
    c.level += 1;
    bumpMetric('levelups_today', 1);
    Audio.buy();
    notify('cards');
    return true;
  }

  function evolveCard(id) {
    const c = state.cards[id]; if (!c) return false;
    const def = CARD_BY_ID[id];
    if (c.evolved) return false;
    if (c.level < 10) return false;
    if (c.count < 2) return false;
    c.count -= 1;
    c.evolved = true;
    bumpMetric('evolutions', 1);
    Audio.levelUp();
    notify('cards');
    return true;
  }

  function fuseCards(tier) {
    const t = TIERS[tier - 1]; if (!t) return false;
    if (tier >= 6) return false;
    // Need 3 cards from this tier
    const eligible = Object.entries(state.cards).filter(([id, c]) => CARD_BY_ID[id].tier === tier && c.count > 0).sort((a, b) => a[1].count - b[1].count);
    let need = t.fuseCost;
    for (const [, c] of eligible) {
      while (c.count > 1 && need > 0) { c.count--; need--; }
    }
    if (need > 0) {
      // Fall back to dupes
      for (const [, c] of eligible) {
        while (c.count > 0 && need > 0) { c.count--; need--; }
      }
    }
    if (need > 0) return false;
    // Add a card from next tier
    const newCard = pickCardFromTier(tier + 1);
    addCard(newCard.id);
    bumpMetric('fusions', 1);
    Audio.rare();
    notify('cards');
    return newCard.id;
  }

  function setActiveCard(id) {
    if (!state.cards[id]) return false;
    state.activeCard = id;
    notify('active');
    return true;
  }

  /* ---- HATCH / PACK RIP ---- */
  function ripPack(packId) {
    const pack = PACKS.find(p => p.id === packId); if (!pack) return null;
    if (pack.costType === 'coins' && !spendCoins(pack.cost)) return null;
    if (pack.costType === 'gems'  && !spendGems(pack.cost))  return null;
    bumpMetric('total_hatches', 1);
    bumpMetric('hatched_today', 1);
    return performHatch(pack);
  }

  function ripTen(packId) {
    const pack = PACKS.find(p => p.id === packId); if (!pack) return null;
    const total = pack.cost * 10;
    if (pack.costType === 'coins' && !spendCoins(total)) return null;
    if (pack.costType === 'gems'  && !spendGems(total))  return null;

    const results = [];
    let hasUltra = false;
    for (let i = 0; i < 10; i++) {
      bumpMetric('total_hatches', 1);
      bumpMetric('hatched_today', 1);
      const r = performHatch(pack, /*tenth=*/ i === 9, hasUltra);
      results.push(r);
      if (r.card.tier >= 5) hasUltra = true;
    }
    return results;
  }

  function performHatch(pack, tenth = false, hasUltraAlready = false) {
    let tier = rollTier(pack.ratesMult);
    // Pity: if pack is mythic and player has hit threshold without mythic, force it
    if (pack.id === 'mythic') {
      state.pity = (state.pity || 0) + 1;
      if (state.pity >= PITY_MYTHIC_THRESHOLD) {
        tier = 6;
        state.pity = 0;
      } else if (tier === 6) {
        state.pity = 0;
      }
      // 10× mythic pack: last card guaranteed tier 5+
      if (tenth && !hasUltraAlready && tier < 5) tier = 5;
    } else {
      // Mythic pity counts only rare+ hatches for non-mythic packs at half rate
      if (tier >= 3) state.pity = (state.pity || 0) + 0.5;
    }
    const card = pickCardFromTier(tier);
    const addRes = addCard(card.id);
    // Big sound for rare+
    if (tier === 6) Audio.legendary();
    else if (tier === 5) Audio.legendary();
    else if (tier === 4) Audio.epic();
    else if (tier === 3) Audio.rare();
    else Audio.rip();
    return { card, isNew: addRes?.isNew, tier };
  }

  /* ---- SPIN ---- */
  function spin() {
    if (state.spins <= 0) return null;
    state.spins -= 1;
    bumpMetric('spins_today', 1);
    const idx = Math.floor(Math.random() * WHEEL.length);
    applyReward({ type: WHEEL[idx].type, amount: WHEEL[idx].amount });
    if (WHEEL[idx].type === 'jackpot') applyReward({ type: 'gems', amount: 500 });
    notify('spin');
    return idx;
  }

  function grantSpin(n = 1) { state.spins += n; notify('spin'); }

  /* ---- BOOST ---- */
  function applyBoost(mult, seconds) {
    const now = Date.now();
    // If a boost is already active and equal/greater, just extend by `seconds`.
    if (state.boost.mult >= mult) state.boost.until = Math.max(state.boost.until, now) + seconds * 1000;
    else state.boost = { mult, until: now + seconds * 1000 };
    notify('boost');
  }

  /* ---- DAILY ---- */
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function canClaimDaily() {
    return state.lastClaimDate !== todayStr();
  }

  function claimDaily() {
    if (!canClaimDaily()) return null;
    const yest = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    if (state.lastClaimDate === yest) state.streak += 1;
    else state.streak = 1;
    state.lastClaimDate = todayStr();
    state.metrics.max_streak = Math.max(state.metrics.max_streak || 0, state.streak);

    const dayIdx = ((state.streak - 1) % 7);
    const reward = STREAK_REWARDS[dayIdx];
    applyReward(reward);
    Audio.coin();
    notify('streak');
    return { reward, streak: state.streak };
  }

  /* ---- DAILY QUESTS ---- */
  function rotateDailyQuests() {
    const today = todayStr();
    if (state.dailyQuestsDate === today && state.dailyQuests.length) return;
    // Reset daily metrics
    for (const k of ['taps_today', 'spent_today', 'earned_today', 'upgrades_today', 'hatched_today', 'levelups_today', 'arena_wins_today', 'spins_today', 'playtime_today']) {
      state.metrics[k] = 0;
    }
    // Pick 3 quests
    const pool = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
    state.dailyQuests = pool.slice(0, 3).map(q => ({ ...q, claimed: false }));
    state.dailyQuestsDate = today;
    notify('quests');
  }

  function claimQuest(id) {
    const q = state.dailyQuests.find(x => x.id === id); if (!q) return false;
    if (q.claimed) return false;
    if ((state.metrics[q.metric] || 0) < q.target) return false;
    q.claimed = true;
    applyReward(q.reward);
    bpAddXP(100);
    Audio.coin();
    notify('quests');
    return true;
  }

  /* ---- ACHIEVEMENTS ---- */
  function claimAchievement(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return false;
    if (state.achClaimed[id]) return false;
    if ((state.metrics[a.metric] || 0) < a.target) return false;
    state.achClaimed[id] = true;
    applyReward(a.reward);
    bpAddXP(200);
    Audio.levelUp();
    notify('quests');
    return true;
  }

  /* ---- BATTLE PASS ---- */
  function bpAddXP(n) {
    const bp = state.bp;
    bp.xp += n;
    while (bp.tier < BATTLEPASS_TIERS.length && bp.xp >= BATTLEPASS_XP_PER_TIER) {
      bp.xp -= BATTLEPASS_XP_PER_TIER;
      bp.tier += 1;
    }
  }
  function claimBPReward(tier, premium) {
    const def = BATTLEPASS_TIERS[tier - 1]; if (!def) return false;
    if (state.bp.tier < tier) return false;
    const claimed = premium ? state.bp.claimedPremium : state.bp.claimedFree;
    if (claimed[tier]) return false;
    if (premium && !state.bp.premium) return false;
    claimed[tier] = true;
    applyReward(premium ? def.premium : def.free);
    Audio.coin();
    notify('quests');
    return true;
  }
  function purchaseBP() { state.bp.premium = true; notify('bp'); }

  /* ---- ARENA ---- */
  function setArenaDeck(deck) {
    state.arenaDeck = (deck || []).filter(id => state.cards[id]).slice(0, 3);
    notify('arena');
  }
  function arenaPower(deck) {
    return deck.reduce((sum, id) => {
      const c = state.cards[id]; if (!c) return sum;
      const s = cardStats(id, c.level, c.evolved);
      return sum + s.atk + s.hp / 5;
    }, 0);
  }
  function arenaFight() {
    if (state.arenaDeck.length < 3) return { error: 'Pick 3 cards' };
    const myPower = arenaPower(state.arenaDeck);
    // Opponent scales with player progress
    const tier = state.arenaTier || 1;
    const oppPower = myPower * (0.75 + tier * 0.05 + Math.random() * 0.5);
    const myRoll = myPower * (0.8 + Math.random() * 0.4);
    const oppRoll = oppPower * (0.8 + Math.random() * 0.4);
    const win = myRoll > oppRoll;
    const oppName = FAKE_LEADERS[Math.floor(Math.random() * FAKE_LEADERS.length)];
    const rewards = win
      ? { gems: 10 + Math.floor(tier * 5), coins: 5000 * tier, bp: 150 }
      : { gems: 2, coins: 1000 * tier, bp: 30 };
    addGems(rewards.gems);
    addCoins(rewards.coins);
    bpAddXP(rewards.bp);
    bumpMetric(win ? 'total_arena_wins' : 'arena_losses', 1);
    if (win) bumpMetric('arena_wins_today', 1);
    state.arenaTier = Math.max(1, (state.arenaTier || 1) + (win ? 1 : -1));
    state.arenaHistory.unshift({ opp: oppName, mine: Math.floor(myPower), theirs: Math.floor(oppPower), win, t: Date.now() });
    state.arenaHistory = state.arenaHistory.slice(0, 12);
    if (win) Audio.win(); else Audio.lose();
    notify('arena');
    return { win, oppName, myPower: Math.floor(myPower), oppPower: Math.floor(oppPower), rewards };
  }

  /* ---- REWARD APPLY ---- */
  function applyReward(r) {
    if (!r) return;
    switch (r.type) {
      case 'coins':       addCoins(r.amount); break;
      case 'gems':        addGems(r.amount);  break;
      case 'spins':       grantSpin(r.amount); break;
      case 'pack':        ripPack('common'); break;
      case 'rare_pack':   ripPack('rare') || (state.coins += 0); break;
      case 'epic_pack':   ripPack('epic') || (state.coins += 0); break;
      case 'mythic_pack': ripPack('mythic') || (state.coins += 0); break;
      case 'boost':       applyBoost(3, r.amount); break;
      case 'jackpot':     addGems(500); break;
    }
  }

  /* ---- IAP grants ---- */
  function grantStarterPack() {
    if (state.starterClaimed) return false;
    state.starterClaimed = true;
    addGems(500); addCoins(1000000);
    for (let i = 0; i < 3; i++) ripPack('epic');
    applyBoost(3, 24 * 60 * 60);
    Audio.win();
    notify('iap');
    return true;
  }
  function grantVIP() {
    state.vip = true;
    state.vipUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
    addGems(100);
    notify('iap');
  }
  function grantNoAds() {
    state.noAds = true;
    notify('iap');
  }
  function grantGemPack(packId) {
    const p = GEM_PACKS.find(g => g.id === packId); if (!p) return false;
    const total = Math.floor(p.amount * (1 + (p.bonus || 0) / 100));
    addGems(total);
    Audio.coin();
    notify('iap');
    return true;
  }

  /* ---- OFFLINE EARNINGS ---- */
  function computeOfflineEarnings() {
    const last = state.lastSeen || Date.now();
    let dt = (Date.now() - last) / 1000;
    if (dt < 30) return 0;
    dt = Math.min(dt, 24 * 3600); // cap at 24h
    const rps = getRps();
    return Math.floor(rps * dt * state.offlineEarnRate);
  }
  function claimOffline(mult = 1) {
    const v = (state.__offlinePending || 0) * mult;
    if (v > 0) addCoins(v);
    state.__offlinePending = 0;
    notify('offline');
    return v;
  }
  function getOfflinePending() { return state.__offlinePending || 0; }

  /* ---- REFERRAL ---- */
  function applyReferralReward() {
    bumpMetric('invites', 1);
    addGems(250);
    Audio.win();
    notify('social');
  }

  /* ---- TOASTS via UI module ---- */
  function addToast(t) { if (typeof window !== 'undefined' && window.UI && window.UI.toast) window.UI.toast(t); else console.log('TOAST:', t); }

  /* ---- SETTINGS ---- */
  function getSettings() { return settings; }
  function setSetting(k, v) {
    settings[k] = v;
    if (k === 'sound') Audio.setEnabled(v);
    Storage.saveSettings(settings);
    notify('settings');
  }

  /* ---- EXPORT ---- */
  return {
    init, on, get state() { return state; },
    tap, getPerTap, getRps, globalMult,
    addCoins, spendCoins, addGems, spendGems, addXP,
    buyTapUpgrade,
    addCard, levelUpCard, evolveCard, fuseCards, setActiveCard,
    ripPack, ripTen,
    spin, grantSpin,
    applyBoost,
    canClaimDaily, claimDaily,
    rotateDailyQuests, claimQuest,
    claimAchievement,
    bpAddXP, claimBPReward, purchaseBP,
    setArenaDeck, arenaPower, arenaFight,
    grantStarterPack, grantVIP, grantNoAds, grantGemPack,
    getOfflinePending, claimOffline,
    applyReferralReward,
    getSettings, setSetting,
    bumpMetric,
  };
})();

// expose for payments module convenience
window.GameState = () => Game.state;
