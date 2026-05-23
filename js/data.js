/* ============================================================
   HOUSE OF CARDS: Booster Tycoon — GAME DATA
   All card characters, names, and lore are original IP for
   this app. House of Cards is the publishing brand.
   ============================================================ */

const GAME_TITLE = 'HOUSE OF CARDS';
const GAME_SUBTITLE = 'Booster Tycoon';

/* ---- COLORS / BRAND ---- */
const BRAND = {
  yellow: '#f5c518',
  yellowLight: '#ffe066',
  blue: '#1a4a8a',
  blueDark: '#0e2a5c',
  cream: '#f0e6d2',
  red: '#e63946',
};

/* ---- ELEMENTS / SUITS ---- */
const ELEMENTS = {
  fire:    { icon: '🔥', name: 'Fire',    color: '#ff5a3d' },
  water:   { icon: '💧', name: 'Water',   color: '#3da8ff' },
  nature:  { icon: '🌿', name: 'Nature',  color: '#5ad14a' },
  electric:{ icon: '⚡', name: 'Volt',    color: '#ffd83d' },
  shadow:  { icon: '🌑', name: 'Shadow',  color: '#a06bff' },
  crypto:  { icon: '💎', name: 'Crypto',  color: '#5ae3ff' },
};

/* ---- RARITIES ---- (mapped to TCG-style tiers) */
const TIERS = [
  { tier: 1, name: 'Common',     star: '●',          color: '#c7c7c7', glow: 'rgba(199,199,199,0.4)',  baseRps: 2,     baseAtk: 10,   baseHp: 50,    odds: 0.62,   foil: false },
  { tier: 2, name: 'Uncommon',   star: '◆',          color: '#5ad14a', glow: 'rgba(90,209,74,0.5)',    baseRps: 18,    baseAtk: 30,   baseHp: 180,   odds: 0.25,   foil: false },
  { tier: 3, name: 'Rare',       star: '★',          color: '#3da8ff', glow: 'rgba(61,168,255,0.6)',   baseRps: 130,   baseAtk: 80,   baseHp: 650,   odds: 0.10,   foil: false },
  { tier: 4, name: 'Holo Rare',  star: '★★',         color: '#a06bff', glow: 'rgba(160,107,255,0.65)', baseRps: 900,   baseAtk: 220,  baseHp: 2200,  odds: 0.025,  foil: true  },
  { tier: 5, name: 'Ultra Rare', star: '★★★',        color: '#ffd83d', glow: 'rgba(255,216,61,0.75)',  baseRps: 6500,  baseAtk: 600,  baseHp: 7500,  odds: 0.0045, foil: true  },
  { tier: 6, name: 'Secret Rare',star: '✦✦✦',        color: '#ff3d6e', glow: 'rgba(255,61,110,0.9)',   baseRps: 50000, baseAtk: 1800, baseHp: 25000, odds: 0.0005, foil: true  },
];

/* ---- CARD ROSTER ---- (30 original characters across rarities)
   "Card" terminology now: each entry is a printable card.
   evolvesTo: id of next-form card (consumes a duplicate, +50% stats)
   passive: optional global bonus when this card is the featured tap card
*/
const CARDS = [
  /* TIER 1 — COMMON (6) */
  { id: 'bitsy',     name: 'Bitsy',     emoji: '🟠',  element: 'crypto',   tier: 1, number: '001/030', evolvesTo: 'bitsyx',  passive: '+5% tap power' },
  { id: 'pebbo',     name: 'Pebbo',     emoji: '🪨',  element: 'shadow',   tier: 1, number: '002/030' },
  { id: 'sprout',    name: 'Sprout',    emoji: '🌱',  element: 'nature',   tier: 1, number: '003/030', evolvesTo: 'sprig' },
  { id: 'sparko',    name: 'Sparko',    emoji: '✨',  element: 'electric', tier: 1, number: '004/030' },
  { id: 'drippy',    name: 'Drippy',    emoji: '💧',  element: 'water',    tier: 1, number: '005/030', evolvesTo: 'splosh' },
  { id: 'embee',     name: 'Embee',     emoji: '🐝',  element: 'fire',     tier: 1, number: '006/030' },

  /* TIER 2 — UNCOMMON (6) */
  { id: 'bitsyx',    name: 'Bitsyx',    emoji: '🟡',  element: 'crypto',   tier: 2, number: '007/030', passive: '+10% tap power' },
  { id: 'sprig',     name: 'Sprig',     emoji: '🌳',  element: 'nature',   tier: 2, number: '008/030' },
  { id: 'splosh',    name: 'Splosh',    emoji: '🌊',  element: 'water',    tier: 2, number: '009/030' },
  { id: 'coingoblin',name: 'Coingoblin',emoji: '👹',  element: 'shadow',   tier: 2, number: '010/030' },
  { id: 'foxchain',  name: 'Foxchain',  emoji: '🦊',  element: 'electric', tier: 2, number: '011/030', evolvesTo: 'voltfox' },
  { id: 'bullcoin',  name: 'Bullcoin',  emoji: '🐂',  element: 'fire',     tier: 2, number: '012/030' },

  /* TIER 3 — RARE (6) */
  { id: 'voltfox',   name: 'Voltfox',   emoji: '🦊',  element: 'electric', tier: 3, number: '013/030', passive: '+15% all earnings' },
  { id: 'whaleton',  name: 'Whaleton',  emoji: '🐋',  element: 'water',    tier: 3, number: '014/030', evolvesTo: 'whalord' },
  { id: 'stakephant',name: 'Stakephant',emoji: '🐘',  element: 'nature',   tier: 3, number: '015/030' },
  { id: 'hodlcrab',  name: 'Hodlcrab',  emoji: '🦀',  element: 'water',    tier: 3, number: '016/030' },
  { id: 'pyrofang',  name: 'Pyrofang',  emoji: '🐊',  element: 'fire',     tier: 3, number: '017/030' },
  { id: 'shadowl',   name: 'Shadowl',   emoji: '🦉',  element: 'shadow',   tier: 3, number: '018/030' },

  /* TIER 4 — HOLO RARE (6) */
  { id: 'whalord',   name: 'Whalord',   emoji: '🐳',  element: 'water',    tier: 4, number: '019/030', passive: '+25% offline earnings' },
  { id: 'kraka',     name: 'Kraka',     emoji: '🦑',  element: 'shadow',   tier: 4, number: '020/030' },
  { id: 'pyrex',     name: 'Pyrex',     emoji: '🐉',  element: 'fire',     tier: 4, number: '021/030', evolvesTo: 'goldwyrm' },
  { id: 'voltbeast', name: 'Voltbeast', emoji: '🦅',  element: 'electric', tier: 4, number: '022/030' },
  { id: 'moonox',    name: 'Moonox',    emoji: '🚀',  element: 'crypto',   tier: 4, number: '023/030' },
  { id: 'rhinoblock',name: 'Rhinoblock',emoji: '🦏',  element: 'nature',   tier: 4, number: '024/030' },

  /* TIER 5 — ULTRA RARE (4) */
  { id: 'goldwyrm',  name: 'Goldwyrm',  emoji: '🐲',  element: 'fire',     tier: 5, number: '025/030', passive: '+50% earnings, +20% tap', evolvesTo: 'phoenico' },
  { id: 'cryptolord',name: 'Cryptolord',emoji: '👑',  element: 'crypto',   tier: 5, number: '026/030' },
  { id: 'whalking',  name: 'Whaleking', emoji: '🐳',  element: 'water',    tier: 5, number: '027/030' },
  { id: 'shadowking',name: 'Shadowking',emoji: '👻',  element: 'shadow',   tier: 5, number: '028/030' },

  /* TIER 6 — SECRET RARE (2) */
  { id: 'phoenico',  name: 'Phoenico',  emoji: '🔥',  element: 'fire',     tier: 6, number: '029/030', passive: '×2 ALL earnings & ×2 tap' },
  { id: 'genesis',   name: 'Genesis',   emoji: '🌌',  element: 'crypto',   tier: 6, number: '030/030', passive: '×3 ALL earnings' },
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const CARDS_BY_TIER = (() => {
  const m = {};
  for (const c of CARDS) (m[c.tier] = m[c.tier] || []).push(c);
  return m;
})();
const TOTAL_CARDS = CARDS.length;

/* Card stats at a given level */
function cardStats(cardId, level, evolved = false) {
  const c = CARD_BY_ID[cardId];
  const t = TIERS[c.tier - 1];
  const evoMult = evolved ? 1.5 : 1;
  const lvMult = 1 + (level - 1) * 0.12;
  return {
    rps: Math.floor(t.baseRps * lvMult * evoMult),
    atk: Math.floor(t.baseAtk * lvMult * evoMult),
    hp:  Math.floor(t.baseHp  * lvMult * evoMult),
  };
}

/* Cost (coins) to level up a card */
function cardLevelCost(cardId, currentLevel) {
  const c = CARD_BY_ID[cardId];
  const tierMult = Math.pow(5, c.tier - 1);
  return Math.ceil(50 * tierMult * Math.pow(1.18, currentLevel - 1));
}

/* ---- TAP UPGRADES ---- */
const TAP_UPGRADES = [
  { id: 'tap1',  icon: '👆', name: 'Sharper Tap',     desc: '+1 per tap',     baseCost: 25,            costMult: 1.18, add: 1 },
  { id: 'tap2',  icon: '✊', name: 'Iron Fist',       desc: '+5 per tap',     baseCost: 250,           costMult: 1.20, add: 5 },
  { id: 'tap3',  icon: '⚡', name: 'Electric Touch',  desc: '+25 per tap',    baseCost: 3000,          costMult: 1.22, add: 25 },
  { id: 'tap4',  icon: '💥', name: 'Mega Punch',      desc: '+150 per tap',   baseCost: 40000,         costMult: 1.24, add: 150 },
  { id: 'tap5',  icon: '🌟', name: 'Golden Touch',    desc: '+1K per tap',    baseCost: 500000,        costMult: 1.26, add: 1000 },
  { id: 'tap6',  icon: '🌪', name: 'Storm Strike',    desc: '+10K per tap',   baseCost: 8000000,       costMult: 1.28, add: 10000 },
  { id: 'tap7',  icon: '☄️', name: 'Cosmic Tap',      desc: '+100K per tap',  baseCost: 120000000,     costMult: 1.30, add: 100000 },
  { id: 'tap8',  icon: '🌌', name: 'Big Bang Click',  desc: '+1M per tap',    baseCost: 2000000000,    costMult: 1.32, add: 1000000 },
];

/* ---- BOOSTER PACKS ---- (replaces eggs) */
const PACKS = [
  { id: 'common',  name: 'Booster Pack',    emoji: '📦', costType: 'coins', cost: 500,   ratesMult: 1.0, label: 'Basic mix · 1 card' },
  { id: 'rare',    name: 'Premium Pack',    emoji: '🟦', costType: 'gems',  cost: 100,   ratesMult: 1.8, label: '+ Rare odds · 1 card' },
  { id: 'epic',    name: 'Elite Pack',      emoji: '🟪', costType: 'gems',  cost: 350,   ratesMult: 3.5, label: '+ Holo odds · 1 card' },
  { id: 'mythic',  name: 'Mythic Pack',     emoji: '🟧', costType: 'gems',  cost: 1200,  ratesMult: 8.0, label: 'Ultra+ guaranteed at 10× · 1 card' },
];
const PITY_MYTHIC_THRESHOLD = 80;

/* ---- GEM PACKS (real money) ---- */
const GEM_PACKS = [
  { id: 'gem_pile',   icon: '💎',   amount: 100,   bonus: 0,  price: '$0.99',  priceCents: 99 },
  { id: 'gem_bag',    icon: '💎💎', amount: 550,   bonus: 10, price: '$4.99',  priceCents: 499 },
  { id: 'gem_box',    icon: '📦💎', amount: 1200,  bonus: 20, price: '$9.99',  priceCents: 999, best: true },
  { id: 'gem_chest',  icon: '🎁💎', amount: 2800,  bonus: 40, price: '$19.99', priceCents: 1999 },
  { id: 'gem_vault',  icon: '🏦💎', amount: 7500,  bonus: 50, price: '$49.99', priceCents: 4999 },
  { id: 'gem_galaxy', icon: '🌌💎', amount: 18000, bonus: 80, price: '$99.99', priceCents: 9999 },
];

/* ---- SLOT WHEEL ---- 8 segments */
const WHEEL = [
  { type: 'coins',  amount: 1000,  icon: '💰', label: '1K',     color: '#f5c518' },
  { type: 'gems',   amount: 10,    icon: '💎', label: '10',     color: '#5ae3ff' },
  { type: 'coins',  amount: 50000, icon: '💰', label: '50K',    color: '#ff8a00' },
  { type: 'pack',   amount: 1,     icon: '📦', label: 'PACK',   color: '#4cd964' },
  { type: 'coins',  amount: 10000, icon: '💰', label: '10K',    color: '#f5c518' },
  { type: 'gems',   amount: 50,    icon: '💎', label: '50',     color: '#5ae3ff' },
  { type: 'jackpot',amount: 0,     icon: '🎰', label: 'JACKPOT',color: '#e63946' },
  { type: 'coins',  amount: 5000,  icon: '💰', label: '5K',     color: '#ff8a00' },
];

/* ---- RANK TITLES ---- */
const TITLES = [
  { lv: 1,   name: 'Rookie Collector' },
  { lv: 5,   name: 'Card Curious' },
  { lv: 10,  name: 'Pack Ripper' },
  { lv: 20,  name: 'Holo Hunter' },
  { lv: 35,  name: 'Binder Boss' },
  { lv: 50,  name: 'Set Completionist' },
  { lv: 75,  name: 'Shop Owner' },
  { lv: 100, name: 'Card Mogul' },
  { lv: 150, name: 'Grand Master' },
  { lv: 250, name: 'House of Cards Legend' },
];

/* ---- DAILY STREAK REWARDS ---- */
const STREAK_REWARDS = [
  { day: 1, type: 'coins', amount: 1000,   icon: '💰', label: '1K' },
  { day: 2, type: 'gems',  amount: 20,     icon: '💎', label: '20' },
  { day: 3, type: 'pack',  amount: 1,      icon: '📦', label: 'Pack' },
  { day: 4, type: 'spins', amount: 3,      icon: '🎰', label: '3 spins' },
  { day: 5, type: 'gems',  amount: 100,    icon: '💎', label: '100' },
  { day: 6, type: 'boost', amount: 3600,   icon: '⚡', label: '1h ×3' },
  { day: 7, type: 'mythic_pack', amount: 1,icon: '🟧', label: 'Mythic Pack' },
];

/* ---- DAILY QUESTS POOL ---- */
const DAILY_QUEST_POOL = [
  { id: 'tap_100',     icon: '👆', name: 'Tap 100 times',           target: 100,    metric: 'taps_today',    reward: { type: 'coins', amount: 5000 } },
  { id: 'tap_500',     icon: '✋', name: 'Tap 500 times',           target: 500,    metric: 'taps_today',    reward: { type: 'gems',  amount: 30 } },
  { id: 'rip_1',       icon: '📦', name: 'Rip a pack',              target: 1,      metric: 'hatched_today', reward: { type: 'gems',  amount: 20 } },
  { id: 'rip_3',       icon: '📦', name: 'Rip 3 packs',             target: 3,      metric: 'hatched_today', reward: { type: 'gems',  amount: 75 } },
  { id: 'level_card',  icon: '📈', name: 'Level up any card 5×',    target: 5,      metric: 'levelups_today',reward: { type: 'gems',  amount: 25 } },
  { id: 'arena_win',   icon: '⚔️', name: 'Win an arena battle',     target: 1,      metric: 'arena_wins_today', reward: { type: 'gems', amount: 30 } },
  { id: 'spin_once',   icon: '🎰', name: 'Use a lucky spin',        target: 1,      metric: 'spins_today',   reward: { type: 'coins', amount: 20000 } },
  { id: 'earn_100k',   icon: '💰', name: 'Earn 100K coins',         target: 100000, metric: 'earned_today',  reward: { type: 'spins', amount: 2 } },
];

/* ---- ACHIEVEMENTS ---- */
const ACHIEVEMENTS = [
  { id: 'first_tap',     icon: '👆', name: 'First Tap',            target: 1,         metric: 'total_taps',       reward: { type: 'coins', amount: 100 } },
  { id: 'tap_1k',        icon: '✋', name: '1,000 Taps',           target: 1000,      metric: 'total_taps',       reward: { type: 'gems',  amount: 25 } },
  { id: 'tap_10k',       icon: '🖐', name: '10,000 Taps',          target: 10000,     metric: 'total_taps',       reward: { type: 'gems',  amount: 100 } },
  { id: 'tap_100k',      icon: '🤚', name: '100,000 Taps',         target: 100000,    metric: 'total_taps',       reward: { type: 'gems',  amount: 500 } },
  { id: 'rip_first',     icon: '📦', name: 'First Pack Ripped',    target: 1,         metric: 'total_hatches',    reward: { type: 'gems',  amount: 25 } },
  { id: 'rip_50',        icon: '📦', name: 'Rip 50 packs',         target: 50,        metric: 'total_hatches',    reward: { type: 'gems',  amount: 200 } },
  { id: 'collect_10',    icon: '📒', name: 'Collect 10 cards',     target: 10,        metric: 'unique_beasts',    reward: { type: 'gems',  amount: 100 } },
  { id: 'collect_20',    icon: '📕', name: 'Collect 20 cards',     target: 20,        metric: 'unique_beasts',    reward: { type: 'gems',  amount: 300 } },
  { id: 'collect_all',   icon: '🏆', name: 'Complete the Set',     target: 30,        metric: 'unique_beasts',    reward: { type: 'gems',  amount: 2000 } },
  { id: 'rare_first',    icon: '🔵', name: 'Pull a Rare',          target: 1,         metric: 'rare_hatched',     reward: { type: 'gems',  amount: 50 } },
  { id: 'holo_first',    icon: '🟣', name: 'Pull a Holo Rare',     target: 1,         metric: 'epic_hatched',     reward: { type: 'gems',  amount: 150 } },
  { id: 'ultra_first',   icon: '🟡', name: 'Pull an Ultra Rare',   target: 1,         metric: 'legendary_hatched',reward: { type: 'gems',  amount: 500 } },
  { id: 'secret_first',  icon: '🔴', name: 'Pull a Secret Rare',   target: 1,         metric: 'mythic_hatched',   reward: { type: 'gems',  amount: 2000 } },
  { id: 'arena_10',      icon: '⚔️', name: '10 Arena Wins',        target: 10,        metric: 'total_arena_wins', reward: { type: 'gems',  amount: 100 } },
  { id: 'arena_100',     icon: '🛡', name: '100 Arena Wins',       target: 100,       metric: 'total_arena_wins', reward: { type: 'gems',  amount: 500 } },
  { id: 'evolve_first',  icon: '🌟', name: 'First Evolution',      target: 1,         metric: 'evolutions',       reward: { type: 'gems',  amount: 100 } },
  { id: 'fuse_first',    icon: '🔮', name: 'First Fusion',         target: 1,         metric: 'fusions',          reward: { type: 'gems',  amount: 100 } },
  { id: 'earn_1m',       icon: '💵', name: 'Earn 1M total',        target: 1000000,   metric: 'total_earned',     reward: { type: 'gems',  amount: 50 } },
  { id: 'earn_1b',       icon: '🏦', name: 'Earn 1B total',        target: 1000000000,metric: 'total_earned',     reward: { type: 'gems',  amount: 1000 } },
  { id: 'invite_1',      icon: '🤝', name: 'Invite a friend',      target: 1,         metric: 'invites',          reward: { type: 'gems',  amount: 100 } },
  { id: 'invite_5',      icon: '🎉', name: 'Invite 5 friends',     target: 5,         metric: 'invites',          reward: { type: 'gems',  amount: 500 } },
  { id: 'streak_7',      icon: '🔥', name: '7-day streak',         target: 7,         metric: 'max_streak',       reward: { type: 'gems',  amount: 150 } },
  { id: 'streak_30',     icon: '🔥', name: '30-day streak',        target: 30,        metric: 'max_streak',       reward: { type: 'gems',  amount: 1000 } },
];

/* ---- BATTLE PASS ---- 30 tiers */
const BATTLEPASS_TIERS = (function () {
  const tiers = [];
  for (let i = 1; i <= 30; i++) {
    const milestone = i % 5 === 0;
    tiers.push({
      tier: i,
      free: milestone
        ? { type: 'gems',  amount: 50 * i, icon: '💎' }
        : (i % 3 === 0
            ? { type: 'spins', amount: 1, icon: '🎰' }
            : { type: 'coins', amount: 10000 * i * i, icon: '💰' }),
      premium: milestone
        ? (i === 30 ? { type: 'mythic_pack', amount: 1, icon: '🟧' }
          : i === 20 ? { type: 'epic_pack',  amount: 1, icon: '🟪' }
          : { type: 'rare_pack',  amount: 1, icon: '🟦' })
        : { type: 'gems', amount: 25 * i, icon: '💎' },
    });
  }
  return tiers;
})();

const BATTLEPASS_XP_PER_TIER = 1000;
const BATTLEPASS_PRICE = '$4.99';

/* ---- LEADERBOARD NAMES ---- */
const FAKE_LEADERS = [
  'CardKing88', 'HoloChaser', 'PackRipper', 'AlphaCollector', 'HodlBinder',
  'ShinyHunter', 'SecretRareJr', 'BinderBoss', 'GemMintGod', 'CardMogul',
  'AlphaBets', 'NFTQueen', 'DegenLord', 'BullRun24', 'TradeBaron',
  'ToTheMoon', 'GradeMint10', 'NinjaPuller', 'BlockBuster', 'GoldenCard',
];

/* ---- HELPERS ---- */
function titleForLevel(lv) {
  let cur = TITLES[0].name;
  for (const t of TITLES) if (lv >= t.lv) cur = t.name;
  return cur;
}
function xpForLevel(n) { return Math.floor(100 * Math.pow(1.15, n - 1)); }
function nextCost(def, owned) { return Math.ceil(def.baseCost * Math.pow(def.costMult, owned)); }

function pickCardFromTier(tier) {
  const arr = CARDS_BY_TIER[tier] || CARDS_BY_TIER[1];
  return arr[Math.floor(Math.random() * arr.length)];
}

/* Tier roll for a pack — biased by pack multiplier */
function rollTier(packMult) {
  const weights = TIERS.map(t => t.odds * (t.tier === 1 ? 1 : Math.pow(packMult, t.tier - 1) / 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return TIERS[i].tier;
  }
  return 1;
}

/* ---- HOUSE OF CARDS shop deep-link (optional, set to vendor URL) ---- */
const HOC_STORE_URL = 'https://example.com/house-of-cards'; // ← replace with real shop URL
