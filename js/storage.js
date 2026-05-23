/* ============================================================
   STORAGE — save/load with versioning, autosave throttling
   ============================================================ */

const SAVE_KEY = 'hoc.save.v1';
const SETTINGS_KEY = 'hoc.settings.v1';

const Storage = (function () {
  let dirty = false;
  let lastSave = 0;
  let saveTimer = null;

  function defaultSave() {
    return {
      version: 1,
      createdAt: Date.now(),
      lastSeen: Date.now(),

      // Identity
      playerId: cryptoRandomId(),
      name: 'Collector',

      // Resources
      coins: 1000,
      gems: 100,
      spins: 1,

      // Per-tap power
      tapUpgrades: {},        // { upgradeId: level }
      baseTapValue: 1,

      // Cards (replaces beasts/workers)
      cards: {},              // { cardId: { level: 1, count: 1, evolved: false } }
      activeCard: null,       // currently featured card id

      // Player progression
      level: 1,
      xp: 0,

      // Streak & daily
      streak: 0,
      lastClaimDate: null,    // yyyy-mm-dd
      maxStreak: 0,

      // Quests
      dailyQuests: [],        // [{id, target, metric, reward, claimed}]
      dailyQuestsDate: null,
      questClaims: {},
      metrics: {},            // counters

      // Achievements
      achClaimed: {},

      // Battle pass
      bp: { season: 1, xp: 0, tier: 0, premium: false, claimedFree: {}, claimedPremium: {} },

      // Boosts
      boost: { mult: 1, until: 0 },

      // VIP / IAP
      vip: false,
      vipUntil: 0,
      noAds: false,
      starterClaimed: false,
      starterOfferUntil: Date.now() + 24 * 60 * 60 * 1000,

      // Pity counter for gacha
      pity: 0,

      // Arena
      arenaDeck: [],          // [cardId, cardId, cardId]
      arenaHistory: [],
      arenaTier: 1,

      // Social
      referralCode: makeReferralCode(),
      referredBy: null,
      invites: 0,
      offlineEarnRate: 0.5,   // 50% of online rate by default

      // Misc
      seenOffline: 0,
    };
  }

  function cryptoRandomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  }
  function makeReferralCode() {
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const s = JSON.parse(raw);
      // shallow-merge against defaults so new fields show up
      const d = defaultSave();
      const merged = { ...d, ...s };
      // For nested objects, do a one-level merge so we don't lose new keys
      for (const k of ['boost', 'bp', 'metrics', 'tapUpgrades', 'cards', 'questClaims', 'achClaimed']) {
        merged[k] = { ...(d[k] || {}), ...(s[k] || {}) };
      }
      merged.bp = { ...d.bp, ...(s.bp || {}) };
      return merged;
    } catch (e) {
      console.error('save load failed', e);
      return defaultSave();
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { sound: true, haptic: true, notify: false, particles: true };
      return { sound: true, haptic: true, notify: false, particles: true, ...JSON.parse(raw) };
    } catch { return { sound: true, haptic: true, notify: false, particles: true }; }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  }

  function persist(state) {
    try {
      state.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      lastSave = Date.now();
      dirty = false;
    } catch (e) { console.error('save failed', e); }
  }

  function markDirty(state) {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) persist(state);
    }, 1500);
  }

  function reset() {
    localStorage.removeItem(SAVE_KEY);
  }

  function exportJSON(state) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  }

  function importJSON(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const parsed = JSON.parse(json);
      if (typeof parsed !== 'object') throw new Error('bad save');
      localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
      return true;
    } catch (e) { console.error('import failed', e); return false; }
  }

  return { load, loadSettings, saveSettings, persist, markDirty, reset, exportJSON, importJSON };
})();
