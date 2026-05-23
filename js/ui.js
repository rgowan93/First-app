/* ============================================================
   UI — DOM rendering, screen logic, modals.
   Listens to Game state changes and re-renders affected views.
   ============================================================ */

const UI = (function () {
  const $ = (id) => document.getElementById(id);
  const create = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  };

  /* ---- NUMBER FORMATTING ---- */
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii'];
  function fmt(n) {
    if (n == null || isNaN(n)) return '0';
    n = Math.floor(n);
    if (n < 1000) return n.toString();
    let i = 0;
    while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
    return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + SUFFIX[i];
  }
  function fmtTime(secs) {
    if (secs <= 0) return '—';
    if (secs < 60) return `${Math.ceil(secs)}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  }

  /* ---- TOAST ---- */
  let toastT = null;
  function toast(msg, ms = 1800) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---- HAPTICS ---- */
  function haptic(ms = 8) {
    if (Game.getSettings().haptic && navigator.vibrate) navigator.vibrate(ms);
  }

  /* ---- CONFETTI ---- */
  const confetti = (function () {
    const canvas = $('confetti-canvas');
    let ctx; const pieces = [];
    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
    addEventListener('resize', resize); resize();
    function burst(x = innerWidth / 2, y = innerHeight / 2, n = 60, colors = ['#f5c518', '#ffe066', '#1a4a8a', '#e63946', '#4cd964']) {
      if (!Game.getSettings().particles) return;
      ctx = canvas.getContext('2d');
      for (let i = 0; i < n; i++) {
        pieces.push({
          x, y,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 1) * 12 - 4,
          g: 0.35 + Math.random() * 0.3,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 5 + Math.random() * 7,
          life: 100,
          rot: Math.random() * Math.PI,
          rv: (Math.random() - 0.5) * 0.3,
        });
      }
      if (pieces.length === n) requestAnimationFrame(tick);
    }
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.rv; p.life -= 1;
        if (p.life < 0 || p.y > canvas.height + 100) { pieces.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / 100);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      if (pieces.length) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return { burst };
  })();

  /* ---- TAP PARTICLES ---- */
  function spawnFloatNum(parent, text, x, y) {
    const f = create('div', 'float-num', text);
    f.style.left = x + 'px'; f.style.top = y + 'px';
    parent.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  function spawnParticles(parent, x, y) {
    if (!Game.getSettings().particles) return;
    for (let i = 0; i < 8; i++) {
      const p = create('div', 'particle');
      const ang = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      const dx = Math.cos(ang) * speed;
      const dy = Math.sin(ang) * speed;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.transition = `transform 0.6s cubic-bezier(.1,.7,.3,1), opacity 0.6s`;
      parent.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${dx}px, ${dy}px)`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), 700);
    }
  }

  /* ---- SCREENS ---- */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
    if (id === 'hatch-screen')  renderHatch();
    if (id === 'beasts-screen') renderBeasts();
    if (id === 'quests-screen') renderQuestsTab();
    if (id === 'shop-screen')   renderShop();
  }

  /* ---- TOPBAR ---- */
  function renderTop() {
    const s = Game.state;
    $('coins').textContent = fmt(s.coins);
    $('gems').textContent  = fmt(s.gems);
    $('rps').textContent   = fmt(Game.getRps());
    $('per-tap').textContent = fmt(Game.getPerTap());
    $('rps2').textContent  = fmt(Game.getRps());
    $('streak-days').textContent = s.streak || 0;

    // XP bar
    const xpNeeded = xpForLevel(s.level);
    const pct = Math.min(100, (s.xp / xpNeeded) * 100);
    $('xp-fill').style.width = pct + '%';
    $('xp-text').textContent = `${s.xp} / ${xpNeeded}`;
    $('player-level').textContent = s.level;
    $('player-title').textContent = titleForLevel(s.level);
    $('player-name').textContent  = s.name;

    // VIP badge
    if (s.vip) $('vip-badge').classList.remove('hidden');
    else $('vip-badge').classList.add('hidden');

    // Boost badge
    const boostActive = s.boost.until > Date.now();
    if (boostActive) {
      $('boost-badge').classList.remove('hidden');
      $('boost-mult').textContent = s.boost.mult;
      $('boost-time').textContent = fmtTime((s.boost.until - Date.now()) / 1000);
    } else {
      $('boost-badge').classList.add('hidden');
    }

    // Active card bar
    const ac = s.activeCard;
    if (ac && CARD_BY_ID[ac]) {
      const def = CARD_BY_ID[ac];
      const cs = s.cards[ac];
      const stats = cardStats(ac, cs.level, cs.evolved);
      $('ab-name').textContent  = def.name;
      $('ab-tier').textContent  = TIERS[def.tier - 1].star;
      $('ab-rps').textContent   = fmt(stats.rps);
      $('ab-level').textContent = cs.level;

      const beast = $('beast');
      beast.className = `beast tier-${def.tier}`;
      beast.setAttribute('data-number', def.number || '');
      $('beast-emoji').textContent = def.emoji;
    }

    // Quick action badges
    $('spin-badge').textContent = s.spins;
    const qcount = (s.dailyQuests || []).filter(q => !q.claimed && (s.metrics[q.metric] || 0) >= q.target).length;
    $('quest-badge').textContent = qcount;
    $('quest-badge').style.display = qcount > 0 ? '' : 'none';
    $('spin-badge').style.display = s.spins > 0 ? '' : 'none';

    // Notification dots
    $('shop-dot').classList.toggle('hide', s.starterClaimed);
    $('quest-dot').classList.toggle('hide', qcount === 0);
    $('hatch-dot').classList.toggle('hide', s.coins < 500);

    // Starter countdown
    if ($('starter-countdown')) {
      const left = s.starterOfferUntil - Date.now();
      $('starter-countdown').textContent = `Ends in ${fmtTime(left / 1000)}`;
    }
  }

  /* ---- HATCH (PACKS) ---- */
  function renderHatch() {
    const s = Game.state;
    const list = $('egg-list');
    list.innerHTML = '';
    for (const p of PACKS) {
      const row = create('div', 'egg-card');
      const cost = p.costType === 'coins' ? `💰 ${fmt(p.cost)}` : `💎 ${p.cost}`;
      const tenCost = p.costType === 'coins' ? `💰 ${fmt(p.cost * 10)}` : `💎 ${p.cost * 10}`;
      row.innerHTML = `
        <div class="egg-emoji">${p.emoji}</div>
        <div class="egg-info">
          <div class="egg-name">${p.name}</div>
          <div class="egg-sub">${p.label}</div>
        </div>
        <div class="egg-btns">
          <button class="egg-btn" data-pack="${p.id}" data-mode="1">${cost}</button>
          <button class="egg-btn ten" data-pack="${p.id}" data-mode="10">10× ${tenCost}</button>
        </div>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('.egg-btn').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.pack; const mode = b.dataset.mode;
      doRip(id, mode === '10');
    }));

    // Pity bar
    const fill = Math.min(100, ((s.pity || 0) / PITY_MYTHIC_THRESHOLD) * 100);
    $('pity-fill').style.width = fill + '%';
    $('pity-text').textContent = `${Math.floor(s.pity || 0)} / ${PITY_MYTHIC_THRESHOLD}`;
    $('dex-progress').textContent = `${Object.keys(s.cards).length}/${TOTAL_CARDS}`;
  }

  function doRip(packId, ten) {
    const before = Game.state.coins;
    let res = ten ? Game.ripTen(packId) : Game.ripPack(packId);
    if (!res || (Array.isArray(res) && res.length === 0)) {
      const pack = PACKS.find(p => p.id === packId);
      const need = (pack.costType === 'coins' ? '💰' : '💎') + ' ' + (ten ? pack.cost * 10 : pack.cost);
      toast(`Not enough ${pack.costType}. Need ${need}`);
      return;
    }
    Audio.rip();
    if (!Array.isArray(res)) res = [res];
    showHatchReveal(res);
    haptic(30);
  }

  function showHatchReveal(results) {
    const m = $('hatch-modal');
    const stage = $('hatch-stage');
    const cont = $('hatch-continue');
    m.classList.remove('hidden');
    cont.classList.add('hidden');
    stage.innerHTML = '';

    // Phase 1: show pack 3D
    const pack = create('div', 'pack-3d');
    pack.innerHTML = `<div class="pname">HOUSE OF CARDS</div><div class="pemoji">📦</div><div class="ptap">Tap to open</div>`;
    stage.appendChild(pack);
    pack.addEventListener('click', () => { revealResults(stage, results, cont); }, { once: true });
  }

  function revealResults(stage, results, contBtn) {
    stage.innerHTML = '';
    if (results.length === 1) {
      stage.appendChild(makeRevealCard(results[0]));
      maybeConfettiForTier(results[0].card.tier);
    } else {
      const grid = create('div', 'reveal-grid');
      results.forEach((r, i) => {
        setTimeout(() => {
          grid.appendChild(makeRevealCard(r));
          maybeConfettiForTier(r.card.tier);
        }, i * 90);
      });
      stage.appendChild(grid);
    }
    contBtn.classList.remove('hidden');
    contBtn.onclick = () => {
      $('hatch-modal').classList.add('hidden');
      renderHatch();
      renderTop();
    };
  }

  function makeRevealCard(result) {
    const c = result.card;
    const t = TIERS[c.tier - 1];
    const card = create('div', `reveal-card tier-${c.tier}`);
    card.innerHTML = `
      ${result.isNew ? '<div class="rc-new">NEW!</div>' : '<div class="rc-dup">+1</div>'}
      <div class="rc-stars">${t.star}</div>
      <div class="rc-banner">HOUSE OF CARDS</div>
      <div class="rc-art">${c.emoji}</div>
      <div class="rc-name">${c.name}</div>
      <div class="rc-tier" style="background:${t.color};color:${c.tier >= 5 ? '#1a1300' : 'white'}">${t.name}</div>
    `;
    return card;
  }

  function maybeConfettiForTier(tier) {
    if (tier >= 4) {
      confetti.burst(innerWidth / 2, innerHeight / 2, tier >= 6 ? 200 : tier >= 5 ? 120 : 60);
      haptic(tier >= 5 ? 80 : 30);
    }
  }

  /* ---- BINDER (CARDS) ---- */
  let beastsTab = 'all';
  function renderBeasts() {
    const s = Game.state;
    const pane = $('beasts-pane');
    const tapPane = $('tap-upgrades-pane');

    document.querySelectorAll('[data-btab]').forEach(b => b.classList.toggle('active', b.dataset.btab === beastsTab));

    if (beastsTab === 'taps') {
      pane.classList.add('hidden'); tapPane.classList.remove('hidden');
      renderTapUpgrades(tapPane);
      return;
    }
    tapPane.classList.add('hidden'); pane.classList.remove('hidden');

    pane.innerHTML = '';
    const list = beastsTab === 'owned' ? CARDS.filter(c => s.cards[c.id]) : CARDS;
    for (const c of list) {
      const owned = s.cards[c.id];
      const t = TIERS[c.tier - 1];
      const cell = create('div', `card-cell tier-${c.tier}${owned ? '' : ' locked'}${s.activeCard === c.id ? ' is-active' : ''}`);
      cell.innerHTML = `
        <div class="cc-banner">HOUSE OF CARDS</div>
        <div class="cc-art"><span class="cc-emoji">${c.emoji}</span></div>
        <div class="cc-stars" style="color:${t.color}">${t.star}</div>
        <div class="cc-name">${owned ? c.name : '???'}</div>
        <div class="cc-meta"><span>${c.number}</span><span>Lv${owned ? owned.level : '—'}</span></div>
        ${owned && owned.count > 1 ? `<div class="count-badge">×${owned.count}</div>` : ''}
      `;
      cell.addEventListener('click', () => owned ? openBeastDetail(c.id) : toast('Locked — rip packs to discover'));
      pane.appendChild(cell);
    }
  }

  function renderTapUpgrades(parent) {
    const s = Game.state;
    parent.innerHTML = '';
    for (const u of TAP_UPGRADES) {
      const owned = s.tapUpgrades[u.id] || 0;
      const cost = nextCost(u, owned);
      const canBuy = s.coins >= cost;
      const prev = u === TAP_UPGRADES[0] ? true : (s.tapUpgrades[TAP_UPGRADES[TAP_UPGRADES.indexOf(u) - 1].id] || 0) >= 5 || owned > 0;
      const row = create('div', `upgrade-card ${prev ? '' : 'locked'} ${canBuy && prev ? 'affordable' : ''}`);
      row.innerHTML = `
        <div class="ucard-icon">${u.icon}</div>
        <div class="ucard-info">
          <div class="ucard-name">${u.name}</div>
          <div class="ucard-desc">${u.desc}</div>
          <div class="ucard-stats">Owned ×${owned} · current bonus +${fmt(u.add * owned)}/tap</div>
        </div>
        <button class="ucard-btn" data-upg="${u.id}">
          <span class="price">💰 ${fmt(cost)}</span>
          <span class="level">Lv ${owned + 1}</span>
        </button>
      `;
      parent.appendChild(row);
    }
    parent.querySelectorAll('[data-upg]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.upg;
      if (Game.buyTapUpgrade(id)) { toast(`Upgraded ${TAP_UPGRADES.find(u => u.id === id).name}`); haptic(); renderTapUpgrades(parent); renderTop(); }
      else toast('Need more 💰 coins');
    }));
  }

  function openBeastDetail(id) {
    const s = Game.state;
    const owned = s.cards[id]; if (!owned) return;
    const def = CARD_BY_ID[id];
    const t = TIERS[def.tier - 1];
    const stats = cardStats(id, owned.level, owned.evolved);
    const lvCost = cardLevelCost(id, owned.level);
    const canEvolve = !owned.evolved && owned.level >= 10 && owned.count >= 2 && def.evolvesTo;
    const m = $('beast-detail-modal');
    const body = $('beast-detail');
    body.innerHTML = `
      <h2>${def.name} ${owned.evolved ? '✨' : ''}</h2>
      <div class="bd-card-wrap">
        <div class="bd-card tier-${def.tier}">
          <div class="cc-banner">HOUSE OF CARDS</div>
          <div class="cc-art" style="flex:1;display:flex;align-items:center;justify-content:center;font-size:80px;background:rgba(255,255,255,0.4);border-radius:6px;margin:6px 0;">${def.emoji}</div>
          <div class="cc-name" style="font-weight:900;text-align:center">${def.name}</div>
          <div class="cc-meta" style="display:flex;justify-content:space-between;font-size:9px"><span>${def.number}</span><span>${t.name}</span></div>
        </div>
      </div>
      <div class="bd-stats">
        <div><div class="stat-label">RPS</div><div class="stat-val">+${fmt(stats.rps)}</div></div>
        <div><div class="stat-label">ATK</div><div class="stat-val">${fmt(stats.atk)}</div></div>
        <div><div class="stat-label">HP</div><div class="stat-val">${fmt(stats.hp)}</div></div>
      </div>
      <p style="font-size:12px;color:var(--text-dim)">${def.passive || ELEMENTS[def.element].icon + ' ' + ELEMENTS[def.element].name + ' card · Lv ' + owned.level + ' · ×' + owned.count + ' owned'}</p>
      <div class="bd-actions">
        <button class="btn btn-primary" id="bd-levelup">Level up · 💰 ${fmt(lvCost)}</button>
        <button class="btn ${canEvolve ? 'btn-cta' : ''}" id="bd-evolve" ${canEvolve ? '' : 'disabled style="opacity:.5"'}>${owned.evolved ? 'Evolved ✨' : canEvolve ? 'Evolve!' : 'Evolve (Lv10, ×2)'}</button>
        <button class="btn" id="bd-active">${s.activeCard === id ? 'Featured ✓' : 'Set as Featured'}</button>
        <button class="btn ghost" id="bd-close">Close</button>
      </div>
    `;
    m.classList.remove('hidden');
    body.querySelector('#bd-levelup').onclick = () => {
      if (Game.levelUpCard(id)) { toast('Leveled up!'); openBeastDetail(id); renderTop(); }
      else toast('Need more 💰 coins');
    };
    body.querySelector('#bd-evolve').onclick = () => {
      if (!canEvolve) return;
      if (Game.evolveCard(id)) { toast(`${def.name} evolved! ✨`); confetti.burst(innerWidth/2, innerHeight/2, 80); openBeastDetail(id); renderTop(); }
    };
    body.querySelector('#bd-active').onclick = () => {
      Game.setActiveCard(id); toast(`${def.name} now featured`); m.classList.add('hidden'); renderTop(); renderBeasts();
    };
    body.querySelector('#bd-close').onclick = () => m.classList.add('hidden');
  }

  /* ---- QUESTS / ARENA / BP ---- */
  let qtab = 'arena';
  function renderQuestsTab() {
    document.querySelectorAll('[data-qtab]').forEach(b => b.classList.toggle('active', b.dataset.qtab === qtab));
    document.querySelectorAll('.quest-pane').forEach(p => p.classList.remove('active'));
    if (qtab === 'arena') { $('arena-pane').classList.add('active'); renderArena(); }
    if (qtab === 'daily') { $('daily-quests').classList.add('active'); renderDailyQuests(); }
    if (qtab === 'achievements') { $('achievements-list').classList.add('active'); renderAchievements(); }
    if (qtab === 'battlepass') { $('battlepass-pane').classList.add('active'); renderBattlepass(); }
  }

  function renderDailyQuests() {
    const s = Game.state;
    const pane = $('daily-quests');
    pane.innerHTML = '';
    if (!s.dailyQuests.length) {
      pane.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px">No quests right now — check back tomorrow.</div>';
      return;
    }
    for (const q of s.dailyQuests) {
      const prog = Math.min(q.target, s.metrics[q.metric] || 0);
      const pct = Math.min(100, (prog / q.target) * 100);
      const done = prog >= q.target;
      const card = create('div', `quest-card ${done && !q.claimed ? 'ready' : ''} ${q.claimed ? 'done' : ''}`);
      card.innerHTML = `
        <div class="quest-icon">${q.icon}</div>
        <div class="quest-info">
          <div class="quest-name">${q.name}</div>
          <div class="quest-progress">${fmt(prog)} / ${fmt(q.target)} ${rewardLabel(q.reward)}</div>
          <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="quest-reward ${q.claimed ? 'done' : done ? '' : 'locked'}" data-quest="${q.id}" ${done && !q.claimed ? '' : 'disabled'}>
          ${q.claimed ? '✓' : done ? 'Claim' : 'Locked'}
        </button>
      `;
      pane.appendChild(card);
    }
    pane.querySelectorAll('[data-quest]').forEach(b => b.addEventListener('click', () => {
      if (Game.claimQuest(b.dataset.quest)) { toast('Quest claimed!'); confetti.burst(innerWidth/2, innerHeight/2, 30); renderDailyQuests(); renderTop(); }
    }));
  }

  function rewardLabel(r) {
    switch (r.type) {
      case 'coins': return `· 💰 ${fmt(r.amount)}`;
      case 'gems':  return `· 💎 ${r.amount}`;
      case 'spins': return `· 🎰 ${r.amount}`;
      default: return '';
    }
  }

  function renderAchievements() {
    const s = Game.state;
    const pane = $('achievements-list');
    pane.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const prog = Math.min(a.target, s.metrics[a.metric] || 0);
      const pct = Math.min(100, (prog / a.target) * 100);
      const done = prog >= a.target;
      const claimed = !!s.achClaimed[a.id];
      const card = create('div', `quest-card ${claimed ? 'done' : ''}`);
      card.innerHTML = `
        <div class="quest-icon">${a.icon}</div>
        <div class="quest-info">
          <div class="quest-name">${a.name}</div>
          <div class="quest-progress">${fmt(prog)} / ${fmt(a.target)} ${rewardLabel(a.reward)}</div>
          <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="quest-reward ${claimed ? 'done' : done ? '' : 'locked'}" data-ach="${a.id}" ${done && !claimed ? '' : 'disabled'}>
          ${claimed ? '✓' : done ? 'Claim' : 'Locked'}
        </button>
      `;
      pane.appendChild(card);
    }
    pane.querySelectorAll('[data-ach]').forEach(b => b.addEventListener('click', () => {
      if (Game.claimAchievement(b.dataset.ach)) { toast('Trophy claimed!'); confetti.burst(innerWidth/2, innerHeight/2, 40); renderAchievements(); renderTop(); }
    }));
  }

  function renderBattlepass() {
    const s = Game.state;
    const bp = s.bp;
    const pane = $('battlepass-pane');
    pane.innerHTML = '';
    const head = create('div', 'battlepass-head');
    const xpPct = (bp.xp / BATTLEPASS_XP_PER_TIER) * 100;
    head.innerHTML = `
      <div class="bp-title">SEASON ${bp.season} · CRYPTO BEASTS</div>
      <div class="bp-tier">Tier ${bp.tier} / ${BATTLEPASS_TIERS.length}</div>
      <div class="bp-progress-bar"><div class="bp-progress-fill" style="width:${xpPct}%"></div></div>
      <div style="font-size:11px;color:var(--text-dim)">${bp.xp} / ${BATTLEPASS_XP_PER_TIER} XP to next tier</div>
      ${bp.premium ? '' : `<button class="bp-upgrade-btn" id="bp-buy">Unlock Premium Pass · ${BATTLEPASS_PRICE}</button>`}
    `;
    pane.appendChild(head);

    const grid = create('div', 'bp-rewards');
    BATTLEPASS_TIERS.forEach((tier, i) => {
      const unlocked = bp.tier >= tier.tier;
      const claimedF = !!bp.claimedFree[tier.tier];
      const claimedP = !!bp.claimedPremium[tier.tier];
      // free
      const f = create('div', `bp-reward ${unlocked && !claimedF ? 'unlocked' : ''} ${claimedF ? 'claimed' : ''}`);
      f.innerHTML = `<span class="icon">${tier.free.icon}</span><div class="qty">${fmt(tier.free.amount)}</div><div class="tier-label">T${tier.tier} Free</div>`;
      if (unlocked && !claimedF) f.onclick = () => { if (Game.claimBPReward(tier.tier, false)) { toast('Claimed!'); renderBattlepass(); renderTop(); } };
      grid.appendChild(f);
      // premium
      const p = create('div', `bp-reward premium ${bp.premium && unlocked && !claimedP ? 'unlocked' : ''} ${claimedP ? 'claimed' : ''}`);
      p.innerHTML = `<span class="icon">${tier.premium.icon}</span><div class="qty">${fmt(tier.premium.amount)}</div><div class="tier-label">T${tier.tier} ⭐</div>`;
      if (bp.premium && unlocked && !claimedP) p.onclick = () => { if (Game.claimBPReward(tier.tier, true)) { toast('Claimed!'); renderBattlepass(); renderTop(); } };
      grid.appendChild(p);
    });
    pane.appendChild(grid);

    pane.querySelector('#bp-buy')?.addEventListener('click', async () => {
      const r = await Payments.purchase('starter'); // reuse a flow
      if (r.ok) { Game.purchaseBP(); toast('Battle Pass unlocked!'); confetti.burst(innerWidth/2, innerHeight/2, 80); renderBattlepass(); }
    });
  }

  function renderArena() {
    const s = Game.state;
    const pane = $('arena-pane');
    const deck = s.arenaDeck.slice(0, 3);
    while (deck.length < 3) deck.push(null);
    let html = `
      <div class="arena-deck-row" id="arena-deck">
        ${deck.map(id => {
          if (!id) return `<div class="arena-slot">+</div>`;
          const def = CARD_BY_ID[id];
          return `<div class="arena-slot filled tier-${def.tier}" data-deckcard="${id}">
            <span class="cc-emoji">${def.emoji}</span><span class="name">${def.name}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="arena-power">Deck Power: <span>${fmt(Game.arenaPower(s.arenaDeck))}</span> · Tier ${s.arenaTier}</div>
      <button class="arena-fight-btn" id="arena-fight">⚔️ FIGHT</button>
      <div class="arena-pick"><h4>YOUR CARDS — TAP TO ADD</h4></div>
      <div class="beasts-pane" id="arena-pick-grid"></div>
      <div class="arena-history" id="arena-history"></div>
    `;
    pane.innerHTML = html;
    // pick grid
    const pickGrid = $('arena-pick-grid');
    pickGrid.innerHTML = '';
    const owned = CARDS.filter(c => s.cards[c.id]);
    for (const c of owned) {
      const t = TIERS[c.tier - 1];
      const inDeck = s.arenaDeck.includes(c.id);
      const cell = create('div', `card-cell tier-${c.tier}${inDeck ? ' is-active' : ''}`);
      cell.innerHTML = `
        <div class="cc-banner">HOUSE OF CARDS</div>
        <div class="cc-art"><span class="cc-emoji">${c.emoji}</span></div>
        <div class="cc-stars" style="color:${t.color}">${t.star}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-meta"><span>${c.number}</span><span>Lv${s.cards[c.id].level}</span></div>
      `;
      cell.addEventListener('click', () => {
        if (inDeck) {
          Game.setArenaDeck(s.arenaDeck.filter(x => x !== c.id));
        } else if (s.arenaDeck.length < 3) {
          Game.setArenaDeck([...s.arenaDeck, c.id]);
        } else {
          toast('Deck full — tap a card to remove first');
          return;
        }
        renderArena();
      });
      pickGrid.appendChild(cell);
    }
    // history
    const hist = $('arena-history');
    if (s.arenaHistory.length) {
      hist.innerHTML = '<h4 style="font-size:12px;color:var(--gold);margin:14px 0 6px;letter-spacing:1px">RECENT BATTLES</h4>' +
        s.arenaHistory.slice(0, 5).map(h => `
          <div class="arena-history-row ${h.win ? 'win' : 'loss'}">
            <span>${h.win ? '✓' : '✕'} vs ${h.opp}</span>
            <span>${fmt(h.mine)} vs ${fmt(h.theirs)}</span>
          </div>`).join('');
    }
    $('arena-fight').onclick = () => {
      const res = Game.arenaFight();
      if (res.error) return toast(res.error);
      showArenaResult(res);
    };
  }

  function showArenaResult(res) {
    const m = $('arena-result-modal');
    const body = $('arena-result');
    body.innerHTML = `
      <div class="arena-result-content">
        <h3 class="${res.win ? 'win' : 'lose'}">${res.win ? 'VICTORY!' : 'DEFEAT'}</h3>
        <p>vs ${res.oppName}</p>
        <div class="vsbar">
          <div><div style="font-size:12px;opacity:.7">You</div><div style="font-weight:900;font-size:20px;color:var(--gold)">${fmt(res.myPower)}</div></div>
          <div style="font-weight:900;font-size:18px">vs</div>
          <div><div style="font-size:12px;opacity:.7">${res.oppName}</div><div style="font-weight:900;font-size:20px">${fmt(res.oppPower)}</div></div>
        </div>
        <div class="arena-rewards">
          <span>+💰 ${fmt(res.rewards.coins)}</span>
          <span>+💎 ${res.rewards.gems}</span>
        </div>
        <button class="btn btn-primary big" id="arena-ok">Continue</button>
      </div>
    `;
    m.classList.remove('hidden');
    if (res.win) confetti.burst(innerWidth/2, innerHeight/2, 80);
    body.querySelector('#arena-ok').onclick = () => { m.classList.add('hidden'); renderArena(); renderTop(); };
  }

  /* ---- SHOP ---- */
  function renderShop() {
    const s = Game.state;
    const grid = $('gem-grid');
    grid.innerHTML = '';
    for (const g of GEM_PACKS) {
      const cell = create('div', 'gem-pack' + (g.best ? ' best' : ''));
      cell.innerHTML = `
        <div class="gem-icon">${g.icon}</div>
        <div class="gem-amt">${fmt(g.amount)} 💎</div>
        <div class="gem-bonus">${g.bonus ? '+' + g.bonus + '%' : ' '}</div>
        <button class="gem-price" data-iap="${g.id}">${g.price}</button>
      `;
      grid.appendChild(cell);
    }
    // VIP toggle text
    if (s.vip) {
      document.querySelector('[data-iap="vip"]').textContent = '✓ VIP Active';
      document.querySelector('[data-iap="vip"]').classList.add('active');
    }
    // No ads
    if (s.noAds) {
      document.querySelector('[data-iap="noads"]').textContent = '✓ Owned';
      document.querySelector('[data-iap="noads"]').setAttribute('disabled', 'true');
    }
    // Starter pack
    if (s.starterClaimed) {
      const btn = document.querySelector('[data-iap="starter"]');
      btn.textContent = '✓ Claimed';
      btn.setAttribute('disabled', 'true');
      document.getElementById('starter-pack').style.opacity = 0.5;
    }
    // HoC store link
    const link = $('hoc-store-link');
    if (link) link.href = HOC_STORE_URL;

    // Wire IAP buttons (one-shot bind via dataset flag)
    document.querySelectorAll('[data-iap]').forEach(b => {
      if (b.dataset.boundIap) return;
      b.dataset.boundIap = '1';
      b.addEventListener('click', async () => {
        const sku = b.dataset.iap;
        const r = await Payments.purchase(sku);
        if (!r.ok) return;
        if (sku === 'starter') Game.grantStarterPack();
        else if (sku === 'vip') Game.grantVIP();
        else if (sku === 'noads') Game.grantNoAds();
        else if (sku.startsWith('gem_')) Game.grantGemPack(sku);
        toast('Purchase complete!'); confetti.burst(innerWidth/2, innerHeight/2, 80);
        renderShop(); renderTop();
      });
    });
  }

  /* ---- DAILY LOGIN ---- */
  function maybeShowDaily() {
    if (!Game.canClaimDaily()) return;
    const m = $('dailylogin-modal');
    const grid = $('streak-grid');
    grid.innerHTML = '';
    const todayIdx = (Game.state.streak) % 7; // 0 = next will be day 1, etc.
    STREAK_REWARDS.forEach((r, i) => {
      const isToday = i === todayIdx;
      const cell = create('div', `streak-day ${i < todayIdx ? 'claimed' : ''} ${isToday ? 'today' : ''}`);
      cell.innerHTML = `<div class="icon">${r.icon}</div><div class="amt">${typeof r.amount === 'number' ? fmt(r.amount) : r.amount}</div><div class="label">D${r.day}</div>`;
      grid.appendChild(cell);
    });
    $('claim-day').textContent = todayIdx + 1;
    m.classList.remove('hidden');
    $('claim-daily').onclick = () => {
      const r = Game.claimDaily();
      m.classList.add('hidden');
      if (r) {
        toast(`Day ${r.streak} claimed: ${r.reward.label}`);
        confetti.burst(innerWidth/2, innerHeight/2, 60);
        renderTop();
      }
    };
  }

  /* ---- OFFLINE EARNINGS ---- */
  function maybeShowOffline() {
    const v = Game.getOfflinePending();
    if (v <= 0) return;
    $('offline-earnings').textContent = '💰 ' + fmt(v);
    $('offline-modal').classList.remove('hidden');
    $('offline-claim').onclick = () => { Game.claimOffline(1); $('offline-modal').classList.add('hidden'); renderTop(); };
    $('offline-claim2x').onclick = () => {
      showAd().then(ok => {
        if (ok) { Game.claimOffline(2); toast('×2 claimed!'); }
        else Game.claimOffline(1);
        $('offline-modal').classList.add('hidden'); renderTop();
      });
    };
  }

  /* ---- SPIN WHEEL ---- */
  let wheelBuilt = false;
  function buildWheel() {
    if (wheelBuilt) return;
    const wheel = $('wheel');
    wheel.innerHTML = '';
    const seg = 360 / WHEEL.length;
    WHEEL.forEach((w, i) => {
      const div = create('div', 'wheel-segment');
      div.style.transform = `rotate(${i * seg}deg) skewY(${seg - 90}deg)`;
      div.style.background = w.color;
      div.innerHTML = `<div style="transform:skewY(${90 - seg}deg);text-align:center"><span>${w.icon}</span><div style="font-size:11px">${w.label}</div></div>`;
      wheel.appendChild(div);
    });
    wheelBuilt = true;
  }
  function openSpin() {
    buildWheel();
    $('spin-modal').classList.remove('hidden');
    $('spin-avail').textContent = Game.state.spins;
  }
  function doSpin() {
    if (Game.state.spins <= 0) return toast('No spins left — watch ad for more');
    const wheel = $('wheel');
    const seg = 360 / WHEEL.length;
    const idx = Game.spin();
    if (idx == null) return;
    // Rotate wheel so segment idx lands at top (pointer at 0deg)
    const target = 360 * 5 - (idx * seg) - seg / 2;
    wheel.style.transform = `rotate(${target}deg)`;
    setTimeout(() => {
      const r = WHEEL[idx];
      toast(`+${r.icon} ${r.label}`);
      if (r.type === 'jackpot') { confetti.burst(innerWidth/2, innerHeight/2, 200); Audio.legendary(); }
      else { confetti.burst(innerWidth/2, innerHeight/2, 40); }
      $('spin-avail').textContent = Game.state.spins;
      renderTop();
      // reset wheel transform without animation
      setTimeout(() => { wheel.style.transition = 'none'; wheel.style.transform = `rotate(${target % 360}deg)`; setTimeout(() => wheel.style.transition = '', 50); }, 1000);
    }, 4600);
  }

  /* ---- AD MOCK ---- */
  function showAd() {
    return new Promise(resolve => {
      if (Game.state.noAds) return resolve(true);
      const m = $('ad-modal');
      const ads = [
        '🎴 Real cards at House of Cards — visit our shop!',
        '🥤 Drink water. Hydrate to dominate.',
        '🚀 The next Mythic is one pack away…',
        '⭐ VIP gets 2× earnings. Forever.',
        '💎 Limited gem pack — 80% off!',
      ];
      $('fake-ad-content').textContent = ads[Math.floor(Math.random() * ads.length)];
      m.classList.remove('hidden');
      let c = 5;
      const counter = $('ad-counter'); counter.textContent = c;
      const close = $('ad-close'); close.setAttribute('disabled', 'true'); close.textContent = `Skip (${c})`;
      const id = setInterval(() => {
        c -= 1; counter.textContent = c;
        close.textContent = c > 0 ? `Skip (${c})` : 'Claim reward';
        if (c <= 0) {
          clearInterval(id);
          close.removeAttribute('disabled');
          close.onclick = () => { m.classList.add('hidden'); resolve(true); };
        }
      }, 1000);
    });
  }

  /* ---- ONBOARDING ---- */
  let obSlide = 0;
  function startOnboarding() {
    $('onboarding').classList.remove('hidden');
    obSlide = 0;
    updateOb();
    $('ob-next').onclick = () => {
      obSlide = Math.min(4, obSlide + 1);
      updateOb();
    };
    $('ob-start').onclick = () => {
      const n = $('ob-name').value.trim().slice(0, 16) || 'Collector';
      Game.state.name = n;
      $('onboarding').classList.add('hidden');
      toast(`Welcome, ${n}! Open your first pack 🎁`);
      // Grant a free starter rip
      setTimeout(() => doRip('common', false), 300);
      renderTop();
    };
  }
  function updateOb() {
    document.querySelectorAll('.ob-slide').forEach((el, i) => el.classList.toggle('active', i === obSlide));
    document.querySelectorAll('.ob-dots .dot').forEach((el, i) => el.classList.toggle('active', i === obSlide));
    $('ob-next').style.display = obSlide === 4 ? 'none' : '';
  }

  /* ---- WIRE UP ---- */
  function wire() {
    // Nav
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => { showScreen(b.dataset.screen); Audio.click(); }));
    // Tabs in Binder
    document.querySelectorAll('[data-btab]').forEach(b => b.addEventListener('click', () => { beastsTab = b.dataset.btab; renderBeasts(); }));
    // Tabs in Quests
    document.querySelectorAll('[data-qtab]').forEach(b => b.addEventListener('click', () => { qtab = b.dataset.qtab; renderQuestsTab(); }));
    // Coin tap
    const stage = $('beast-stage');
    const layer = $('floating-layer');
    function onTap(e) {
      const gain = Game.tap();
      let x, y;
      const rect = stage.getBoundingClientRect();
      if (e.touches && e.touches[0]) { x = e.touches[0].clientX - rect.left + rect.width / 2; y = e.touches[0].clientY - rect.top; }
      else { x = e.offsetX || rect.width / 2; y = e.offsetY || rect.height / 2; }
      // floating num inside the layer (anchored to tap area)
      const tapRect = layer.getBoundingClientRect();
      const px = (e.touches?.[0]?.clientX ?? e.clientX) - tapRect.left;
      const py = (e.touches?.[0]?.clientY ?? e.clientY) - tapRect.top;
      spawnFloatNum(layer, '+' + fmt(gain), px, py);
      spawnParticles(layer, px, py);
      haptic(4);
    }
    stage.addEventListener('click', onTap);
    // Quick actions
    document.querySelectorAll('.qa').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.action;
      if (a === 'spin') openSpin();
      else if (a === 'boost') $('boost-modal').classList.remove('hidden');
      else if (a === 'quests') showScreen('quests-screen');
      else if (a === 'invite') openInvite();
    }));
    // Change active card
    $('change-beast').addEventListener('click', () => { showScreen('beasts-screen'); beastsTab = 'owned'; renderBeasts(); });

    // Boost options
    document.querySelectorAll('.boost-opt').forEach(b => b.addEventListener('click', async () => {
      const [mult, sec, gemCost] = b.dataset.boost.split(',').map(Number);
      if (gemCost > 0) {
        if (!Game.spendGems(gemCost)) return toast('Need more 💎 gems');
        Game.applyBoost(mult, sec);
        toast(`×${mult} boost active!`);
      } else {
        const ok = await showAd();
        if (ok) { Game.applyBoost(mult, sec); toast(`×${mult} boost active!`); }
      }
      $('boost-modal').classList.add('hidden');
      renderTop();
    }));
    $('close-boost').onclick = () => $('boost-modal').classList.add('hidden');

    // Spin
    $('do-spin').onclick = doSpin;
    $('spin-ad').onclick = async () => { const ok = await showAd(); if (ok) { Game.grantSpin(1); toast('+1 spin'); $('spin-avail').textContent = Game.state.spins; renderTop(); } };
    $('close-spin').onclick = () => $('spin-modal').classList.add('hidden');

    // Invite
    $('invite-share').onclick = async () => {
      const r = await Social.share(Game.state);
      if (r.ok) {
        toast(r.method === 'native' ? 'Shared!' : 'Link copied!');
        // For demo purposes, treat each share as a successful invite (counts toward achievement)
        Game.applyReferralReward();
        renderTop();
      }
    };
    $('copy-code').onclick = async () => { if (await Social.copyText(Game.state.referralCode)) toast('Code copied!'); };
    $('close-invite').onclick = () => $('invite-modal').classList.add('hidden');

    // Settings
    $('settings-btn').onclick = openSettings;
    $('close-settings').onclick = () => $('settings-modal').classList.add('hidden');
    $('set-sound').onchange = e => Game.setSetting('sound', e.target.checked);
    $('set-haptic').onchange = e => Game.setSetting('haptic', e.target.checked);
    $('set-particles').onchange = e => Game.setSetting('particles', e.target.checked);
    $('set-notify').onchange = async e => {
      if (e.target.checked) {
        const p = await Notify.requestPermission();
        if (p !== 'granted') { e.target.checked = false; return toast('Notification permission denied'); }
        Notify.scheduleDaily(Game.state, true);
        toast('Daily reminders on');
      } else {
        Notify.clear();
      }
      Game.setSetting('notify', e.target.checked);
    };
    $('reset-save').onclick = () => {
      if (confirm('Reset all progress? This cannot be undone.')) {
        Storage.reset(); location.reload();
      }
    };
    $('export-save').onclick = async () => {
      const code = Storage.exportJSON(Game.state);
      const ok = await Social.copyText(code);
      toast(ok ? 'Save copied to clipboard' : 'Copy failed');
    };
    $('import-save').onclick = () => {
      const code = prompt('Paste save code:');
      if (!code) return;
      if (Storage.importJSON(code.trim())) { toast('Imported! Reloading…'); setTimeout(() => location.reload(), 600); }
      else toast('Invalid save code');
    };
    $('install-pwa').onclick = () => {
      if (window.__deferredInstall) { window.__deferredInstall.prompt(); }
      else toast('Use your browser menu → Add to Home Screen');
    };
    // Gems button -> shop
    $('gems-button').onclick = () => showScreen('shop-screen');
  }

  function openInvite() {
    $('invite-modal').classList.remove('hidden');
    $('referral-code').textContent = Game.state.referralCode;
  }

  function openSettings() {
    const m = $('settings-modal');
    m.classList.remove('hidden');
    const s = Game.getSettings();
    $('set-sound').checked = s.sound;
    $('set-haptic').checked = s.haptic;
    $('set-particles').checked = s.particles;
    $('set-notify').checked = s.notify;
    $('player-id').textContent = Game.state.playerId;
  }

  /* ---- BOOT ---- */
  function boot() {
    wire();
    Game.on((ev) => {
      renderTop();
      if (ev === 'cards' || ev === 'active') renderBeasts();
      if (ev === 'quests' || ev === 'streak') { renderQuestsTab(); }
      if (ev === 'iap') { renderShop(); }
    });
    showScreen('tap-screen');
    renderTop();
    if (Game.state.metrics.total_taps == null || (Game.state.metrics.total_taps || 0) === 0) {
      startOnboarding();
    } else {
      setTimeout(maybeShowOffline, 300);
      setTimeout(maybeShowDaily, 700);
    }
  }

  return { boot, toast, showScreen, fmt };
})();

window.UI = UI;
