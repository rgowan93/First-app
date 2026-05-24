/* ============================================================
   UI — DOM rendering + screen routing for Cardboard Hunters v0.2
   ============================================================ */

const UI = (function () {
  const $ = (id) => document.getElementById(id);
  const create = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html !== undefined) el.innerHTML = html; return el; };

  // ---- UI state ----
  let currentUser = null;
  let currentCard = null;
  let currentCondition = null;
  let currentResults = [];
  let backStack = [];
  let portfolioTab = 'grid';
  let marketTab = 'browse';
  let viewingPortfolioId = null;   // null = active portfolio; '_all' = combined
  let bulkSelect = false;
  let bulkSelection = new Set();
  let tradeStacks = { A: [], B: [] };

  const USD = (v) => v == null || isNaN(v) ? '—' : '$' + Number(v).toFixed(2);
  const PCT = (v) => (v == null || isNaN(v) ? '0.0%' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
  const SHORT_DATE = (ts) => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; };

  /* ---- TOAST ---- */
  let toastT = null;
  function toast(msg, ms = 2000) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---- ROUTING ---- */
  function showScreen(id, push = true) {
    if (push && currentScreen() && currentScreen() !== id) backStack.push(currentScreen());
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
    if (id === 'scan-screen')        { renderRecents(); updateBulkBar(); }
    if (id === 'portfolio-screen')   { renderPortfolio(); }
    if (id === 'buylist-screen')     { renderBuyList(); }
    if (id === 'marketplace-screen') { renderMarketplace(); }
    if (id === 'movers-screen')      { renderMovers(); }
    if (id === 'trade-screen')       { renderTrade(); }
    if (id === 'watchlist-screen')   { renderWatchlist(); }
    if (id === 'customers-screen')   { renderCustomers(); }
    if (id === 'sealed-screen')      { renderSealed(); }
    if (id === 'trends-screen')      { renderTrends(); }
  }
  function currentScreen() { return document.querySelector('.screen.active')?.id || null; }
  function goBack() {
    if (backStack.length === 0) { showScreen('scan-screen', false); return; }
    const prev = backStack.pop();
    showScreen(prev, false);
  }

  /* ============================================================ AUTH ============ */
  function renderAuth() {
    $('auth-screen').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('topbar').classList.add('hidden');
    $('bottom-nav').classList.add('hidden');

    document.querySelectorAll('[data-auth-tab]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-auth-tab]').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.auth-pane').forEach(p => p.classList.toggle('active', p.id === 'auth-' + b.dataset.authTab));
    }));

    $('do-signin').onclick = async () => {
      const u = $('signin-user').value.trim();
      const p = $('signin-pass').value;
      const r = await Auth.signIn(u, p);
      if (r.ok) { currentUser = r.user; toast('Signed in'); enterApp(); }
      else toast(r.reason);
    };
    $('do-signup').onclick = async () => {
      const r = await Auth.signUp($('signup-user').value.trim(), $('signup-pass').value, $('signup-email').value.trim());
      if (r.ok) { currentUser = r.user; toast('Account created'); enterApp(); }
      else toast(r.reason);
    };
    $('continue-guest').onclick = async () => { const r = await Auth.continueAsGuest(); currentUser = r.user; toast('Welcome'); enterApp(); };
  }

  function enterApp() {
    $('auth-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('topbar').classList.remove('hidden');
    $('bottom-nav').classList.remove('hidden');
    Marketplace.seedDemo();
    renderRecents();
    renderBuyBadge();
    renderWatchBadge();
    Watch.startLoop(currentUser.username, () => { renderWatchBadge(); if (currentScreen() === 'watchlist-screen') renderWatchlist(); });
    showScreen('scan-screen', false);
  }

  /* ============================================================ SCAN ============ */
  let bulkMode = false;
  function wireScan() {
    $('scan-photo').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      await runScan(file);
      e.target.value = '';
    });
    $('cancel-scan').onclick = () => $('scan-modal').classList.add('hidden');
    $('bulk-toggle').addEventListener('change', (e) => {
      bulkMode = e.target.checked;
      $('bulk-bar').classList.toggle('hidden', !bulkMode);
      updateBulkBar();
    });
    $('bulk-done').onclick = () => { bulkMode = false; $('bulk-toggle').checked = false; $('bulk-bar').classList.add('hidden'); showScreen('buylist-screen'); };

    // Viewfinder (cosmetic launcher — actual capture uses native input)
    $('vf-close').onclick = () => goBack();
    $('vf-shutter').addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (f) await runScan(f); e.target.value = ''; });
    $('vf-gallery').addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (f) await runScan(f); e.target.value = ''; });
    $('vf-done').onclick = () => showScreen('buylist-screen');
    $('vf-settings').onclick = openSettings;
  }
  function updateBulkBar() {
    if (!bulkMode) return;
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    $('bulk-total').textContent = USD(tots.market) + ` · ${tots.count} item${tots.count !== 1 ? 's' : ''}`;
    $('vf-total').textContent = `Total: ${USD(tots.market)}`;
  }

  async function runScan(file) {
    const m = $('scan-modal'); m.classList.remove('hidden');
    const url = URL.createObjectURL(file);
    $('scan-preview').src = url;
    $('scan-status').textContent = 'Loading OCR engine…';
    try {
      const { raw, lines } = await OCR.recognize(file, (p) => {
        if (p.status === 'recognizing text' && p.progress != null) $('scan-status').textContent = `Reading card… ${Math.round(p.progress * 100)}%`;
        else if (p.status) $('scan-status').textContent = p.status;
      });
      const candidates = OCR.extractCandidates(lines);
      const tcg = OCR.detectTCG(raw);       // 'pokemon' | 'mtg' | 'ygo' | null
      const num = OCR.extractNumber(raw);   // {number, total} | null
      if (!candidates.length) {
        m.classList.add('hidden'); URL.revokeObjectURL(url);
        toast('Could not read text — try Search by Name');
        return openManual('');
      }
      // Build the best query: top candidate + detected number (huge accuracy bump)
      const buildQuery = (cand) => num ? `${cand} ${num.number}/${num.total}` : cand;
      const tryQuery = async (cand) => {
        const q = buildQuery(cand);
        $('scan-status').textContent = `Searching ${tcg ? tcg.toUpperCase() + ' · ' : ''}"${q}"…`;
        // Search the detected TCG first; only fall back across all if zero
        let r = tcg ? await APIs.searchAll(q, tcg) : await APIs.searchAll(q);
        if (!r.length && tcg) r = await APIs.searchAll(q);
        // If number-augmented search returns nothing, retry without the number
        if (!r.length && num) {
          $('scan-status').textContent = `Retrying "${cand}"…`;
          r = tcg ? await APIs.searchAll(cand, tcg) : await APIs.searchAll(cand);
          if (!r.length && tcg) r = await APIs.searchAll(cand);
        }
        return r;
      };
      let results = await tryQuery(candidates[0]);
      let cIdx = 1;
      while (!results.length && cIdx < candidates.length) { results = await tryQuery(candidates[cIdx]); cIdx++; }
      m.classList.add('hidden'); URL.revokeObjectURL(url);
      if (!results.length) {
        const prefill = num ? `${candidates[0]} ${num.number}/${num.total}` : candidates[0];
        toast(`No matches for "${candidates[0]}" — refine the name`);
        return openManual(prefill);
      }
      currentResults = results;
      if (bulkMode && results[0]) {
        const card = results[0]; const cond = { kind: 'raw', value: 'NM' };
        const r = APIs.computePricing(card, cond);
        PortfolioMod.addToBuyList(currentUser.username, card, cond, r.best || 0);
        Storage.pushRecent(currentUser.username, { id: card.id, name: card.name, set: card.set, image: card.image, value: r.best });
        renderBuyBadge(); renderRecents(); updateBulkBar();
        toast(`Added: ${card.name} · ${USD(r.best || 0)}`);
        return;
      }
      $('results-search').value = candidates[0];
      showScreen('results-screen');
      renderResults(results, `OCR read: "${candidates[0]}" · ${results.length} matches`);
    } catch (err) {
      console.error(err);
      m.classList.add('hidden'); URL.revokeObjectURL(url);
      toast('Scan failed — try Search by Name'); openManual('');
    }
  }

  /* ============================================================ MANUAL SEARCH ============ */
  let manualTcg = 'pokemon';
  function openManual(prefill = '') {
    $('manual-modal').classList.remove('hidden');
    $('manual-input').value = prefill;
    setTimeout(() => $('manual-input').focus(), 50);
    manualTcg = 'pokemon';
    document.querySelectorAll('[data-tcg]').forEach(b => {
      b.classList.toggle('active', b.dataset.tcg === 'pokemon');
      b.onclick = () => {
        document.querySelectorAll('[data-tcg]').forEach(x => x.classList.toggle('active', x === b));
        manualTcg = b.dataset.tcg;
      };
    });
  }
  function wireManual() {
    $('manual-close').onclick = () => $('manual-modal').classList.add('hidden');
    $('manual-search').onclick = () => doManualSearch();
    $('manual-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doManualSearch(); });
    $('search-manual').onclick = () => openManual('');
  }
  async function doManualSearch() {
    const q = $('manual-input').value.trim();
    if (!q) return toast('Type a name first');
    $('manual-modal').classList.add('hidden');
    showScreen('results-screen');
    renderResults([], 'Searching…');
    try {
      const results = await APIs.searchAll(q, manualTcg);
      currentResults = results;
      $('results-search').value = q;
      renderResults(results, `${results.length} matches for "${q}"`);
    } catch (e) { renderResults([], `Search failed: ${e.message}`); }
  }

  /* ============================================================ RESULTS ============ */
  function renderRecents() {
    const wrap = $('recent-scans');
    const u = Storage.loadUser(currentUser.username);
    if (!u.recents.length) {
      wrap.innerHTML = `<div class="empty-state">No scans yet — tap "Snap a Card" or "Search by Name".</div>`;
      return;
    }
    wrap.innerHTML = '';
    u.recents.forEach(r => {
      const cell = create('div', 'recent-card');
      const imgSrc = r.image;
      cell.innerHTML = `
        ${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : `<div style="width:100%;aspect-ratio:0.72;display:flex;align-items:center;justify-content:center;background:#0a0e1a;border-radius:6px;font-size:38px">${r.imageEmoji || '🃏'}</div>`}
        <div class="rc-name">${r.name}</div>
        ${r.value != null ? `<div class="rc-val">${USD(r.value)}</div>` : ''}
      `;
      cell.addEventListener('click', () => openCardById(r.id));
      wrap.appendChild(cell);
    });
  }

  function renderResults(results, statusMsg = '') {
    $('results-status').textContent = statusMsg;
    const list = $('results-list'); list.innerHTML = '';
    if (!results.length) {
      const q = $('results-search').value.trim();
      const helpBox = create('div', 'empty-state');
      helpBox.innerHTML = `
        <div style="font-weight:800;margin-bottom:8px">No matches for "${q}"</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Tips:
          <ul style="text-align:left;margin:6px 0 0;padding-left:18px;line-height:1.6">
            <li>For Pokémon, try just the <strong>name</strong> (e.g. <em>Unfezant</em>) — the number filter is strict.</li>
            <li>Or use <strong>name + number</strong> (e.g. <em>Unfezant 63</em>) — skip the /total.</li>
            <li>Check spelling; OCR sometimes mangles bold fonts.</li>
          </ul>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
          ${q ? `<button class="btn btn-primary" id="r-retry-name">Search just "${(q.match(/^(\S+)/)?.[1] || q)}"</button>` : ''}
          <button class="btn" id="r-open-manual">✏️ Edit search</button>
        </div>`;
      list.appendChild(helpBox);
      const ret = $('r-retry-name');
      if (ret) ret.onclick = async () => {
        const term = (q.match(/^(\S+)/)?.[1] || q);
        $('results-search').value = term;
        renderResults([], `Searching "${term}"…`);
        const r = await APIs.searchAll(term); currentResults = r;
        renderResults(r, `${r.length} matches for "${term}"`);
      };
      $('r-open-manual').onclick = () => openManual(q);
      return;
    }
    for (const c of results) {
      const row = create('div', 'result-card');
      const price = APIs.quickBest(c);
      row.innerHTML = `
        ${c.image ? `<img src="${c.image}" alt="" loading="lazy" />` : `<div style="width:70px;aspect-ratio:0.72;background:#0a0e1a;display:flex;align-items:center;justify-content:center;font-size:32px;border-radius:8px">${c.imageEmoji || '🃏'}</div>`}
        <div class="rc-info"><div class="rc-name">${c.name}</div><div class="rc-set">${c.set}</div><div class="rc-num">${c.number || ''} ${c.rarity ? '· ' + c.rarity : ''}</div></div>
        <div class="rc-price">${price != null ? USD(price) : '↗'}<small>${tcgLabel(c.tcg)}</small></div>
      `;
      row.addEventListener('click', () => openCard(c));
      list.appendChild(row);
    }
  }
  $('results-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = currentResults.filter(c => `${c.name} ${c.set} ${c.number}`.toLowerCase().includes(q));
    renderResults(filtered, `${filtered.length} of ${currentResults.length} matches`);
  });
  function tcgLabel(t) { return ({ pokemon: 'Pokémon', mtg: 'Magic', ygo: 'YGO', sealed: 'Sealed' })[t] || t; }

  /* ============================================================ CARD DETAIL ============ */
  async function openCardById(id) {
    showScreen('card-screen');
    $('card-detail').innerHTML = `<div class="empty-state"><div class="spinner" style="margin:30px auto"></div>Loading…</div>`;
    try {
      const card = await APIs.getById(id);
      if (!card) throw new Error('not found');
      openCard(card);
    } catch (e) { $('card-detail').innerHTML = `<div class="empty-state">Couldn't reload card.</div>`; }
  }

  function openCard(card) {
    currentCard = card;
    currentCondition = currentCondition || { kind: 'raw', value: 'NM' };
    Storage.pushRecent(currentUser.username, { id: card.id, name: card.name, set: card.set, image: card.image, imageEmoji: card.imageEmoji, value: APIs.quickBest(card) });
    showScreen('card-screen');
    renderCardDetail();
  }

  function renderCardDetail() {
    const card = currentCard;
    const cond = currentCondition;
    const result = APIs.computePricing(card, cond);
    const rec = Analytics.recommend({ currentValue: result.best, cardmarket: card.prices?.cardmarket, history: null });
    const root = $('card-detail');
    const condLabel = cond.kind === 'graded' ? `${cond.grader} ${cond.grade}` : cond.value;
    const condTitle = cond.kind === 'graded' ? 'Graded' : 'Raw';

    root.innerHTML = `
      <div class="cd-hero">
        <div class="cd-img-wrap" id="cd-img-wrap">
          ${card.image ? `<img src="${card.imageLarge || card.image}" alt="" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:60px">${card.imageEmoji || '🃏'}</div>`}
        </div>
        <div class="cd-info">
          <div class="cd-name">${card.name}</div>
          <div class="cd-set">${card.set}</div>
          <div class="cd-num">${card.number || ''} ${card.releaseDate ? '· ' + card.releaseDate : ''}</div>
          ${card.rarity ? `<span class="cd-rarity-pill">${card.rarity}</span>` : ''}
        </div>
      </div>

      <div class="cd-cond">
        <span class="pill">${condTitle} · ${condLabel}</span>
        <button id="change-cond">Change</button>
      </div>

      <div class="cd-best">
        <div class="best-label">Best estimated value</div>
        <div class="best-price">${result.best != null ? USD(result.best) : '—'}</div>
        <div class="best-rec">${result.best != null ? `Weighted avg of <strong>${result.sources.filter(s => s.kind === 'live').length}</strong> live source(s)` : 'No live data — use deep links below'}</div>
      </div>

      <div class="cd-rec ${rec.color}">
        <div>
          <div class="rec-label">${rec.action}</div>
          <div class="rec-reason">${rec.reason} · ${rec.confidence} confidence</div>
        </div>
        <div class="rec-pct">${PCT(rec.percent)}</div>
      </div>

      <div class="cd-actions">
        <button class="btn btn-primary" id="add-portfolio">+ Portfolio</button>
        <button class="btn btn-cta" id="add-buylist">+ Buy List</button>
        <button class="btn" id="add-watch">⭐ Watch</button>
        <button class="btn" id="list-for-sale">🏪 List on Market</button>
      </div>

      <div class="cd-section"><h3>Live prices</h3><div id="live-sources"></div></div>
      <div class="cd-section"><h3>External lookups</h3><div id="deeplink-sources"></div></div>
      <div class="cd-section" id="ebay-live-section" style="display:none"><h3>eBay — active listings</h3><div id="ebay-live-list"></div></div>

      <div class="disclaimer">
        Best-estimated value: weighted avg of TCGplayer + Cardmarket. Recommendation compares current to 30-day Cardmarket average when available, else local price history (build it by re-opening this card or running Refresh in your portfolio).
      </div>
    `;

    const live = $('live-sources');
    result.sources.filter(s => s.kind === 'live' || s.kind === 'estimate').forEach(s => live.appendChild(makeSourceRow(s)));
    if (!live.children.length) live.innerHTML = `<div class="empty-state" style="padding:12px">No live API prices. Use the deep links below.</div>`;
    const deep = $('deeplink-sources');
    result.sources.filter(s => s.kind === 'deeplink').forEach(s => deep.appendChild(makeSourceRow(s)));

    $('cd-img-wrap').onclick = () => openImageZoom(card.imageLarge || card.image);
    $('change-cond').onclick = () => openConditionPicker();
    $('add-portfolio').onclick = () => openAddToPortfolio(card, cond, result.best);
    $('add-buylist').onclick = () => {
      PortfolioMod.addToBuyList(currentUser.username, card, cond, result.best || 0);
      renderBuyBadge(); toast(`Added to Buy List · ${USD(result.best)}`);
    };
    $('add-watch').onclick = () => openAddWatch(card, result.best);
    $('list-for-sale').onclick = () => openCreateListing(card, cond, result.best);

    const u = Storage.loadUser(currentUser.username);
    const tok = u.keys?.ebayAppId;
    if (tok) {
      APIs.fetchEbayActive(card.name + ' ' + card.set, tok).then((items) => {
        if (!items?.length) return;
        $('ebay-live-section').style.display = '';
        const list = $('ebay-live-list');
        items.slice(0, 10).forEach(i => {
          const row = create('div', 'sale-row');
          row.innerHTML = `<span class="sale-date">live</span><span class="sale-title">${i.title}</span><span class="sale-price">${USD(i.price)}</span>`;
          row.onclick = () => i.url && window.open(i.url, '_blank');
          list.appendChild(row);
        });
      });
    }
  }

  function makeSourceRow(s) {
    const row = create('div', `price-source ${s.kind}`);
    const priceHTML = s.price != null
      ? `<div class="src-price">${(s.currency || '$') + Number(s.price).toFixed(2)}<small>${s.kind === 'estimate' ? 'estimate' : 'live'}</small></div>`
      : (s.link ? `<a class="src-action" href="${s.link}" target="_blank" rel="noopener">${s.linkLabel || 'Open ↗'}</a>` : '');
    row.innerHTML = `<div class="src-logo">${s.emoji || '🔗'}</div><div class="src-info"><div class="src-name">${s.name}</div><div class="src-meta">${s.meta || ''}</div></div>${priceHTML}`;
    if (s.link && s.price != null) { row.style.cursor = 'pointer'; row.onclick = () => window.open(s.link, '_blank'); }
    return row;
  }
  function openImageZoom(src) {
    if (!src) return;
    $('image-modal').classList.remove('hidden');
    $('image-modal-body').innerHTML = `<img src="${src}" alt="" /><button class="btn ghost" id="img-close">Close</button>`;
    $('img-close').onclick = () => $('image-modal').classList.add('hidden');
  }

  /* ============================================================ CONDITION ============ */
  function openConditionPicker() {
    $('condition-modal').classList.remove('hidden');
    document.querySelectorAll('[data-cond]').forEach(b => {
      b.onclick = () => { currentCondition = { kind: 'raw', value: b.dataset.cond }; $('condition-modal').classList.add('hidden'); renderCardDetail(); };
    });
    $('apply-graded').onclick = () => {
      const co = $('grader-co').value, gr = $('grader-grade').value;
      if (!co || !gr) return toast('Pick grader + grade');
      currentCondition = { kind: 'graded', grader: co, grade: gr };
      $('condition-modal').classList.add('hidden'); renderCardDetail();
    };
  }

  /* ============================================================ ADD TO PORTFOLIO ============ */
  function openAddToPortfolio(card, cond, marketValue) {
    const u = Storage.loadUser(currentUser.username);
    const m = $('add-modal');
    const pfOptions = u.portfolios.map(p => `<option value="${p.id}" ${p.id === u.activePortfolioId ? 'selected' : ''}>${p.icon} ${p.name}</option>`).join('');
    $('add-modal-body').innerHTML = `
      <h2>Add to Portfolio</h2>
      <p>${card.name} · ${card.set}</p>
      <div class="setting-row"><strong>Condition</strong><span>${cond.kind === 'graded' ? `${cond.grader} ${cond.grade}` : cond.value}</span></div>
      <div class="setting-row"><strong>Market value</strong><span>${USD(marketValue)}</span></div>
      <label style="font-size:12px;color:var(--text-dim);margin-top:6px">Portfolio</label>
      <select id="ap-pf">${pfOptions}<option value="__new">+ New portfolio…</option></select>
      <label style="font-size:12px;color:var(--text-dim);margin-top:6px">Your purchase price (optional)</label>
      <input id="ap-purchase" type="number" min="0" step="0.01" placeholder="e.g. 24.99" />
      <button class="btn btn-primary big" id="ap-confirm">Add</button>
      <button class="btn ghost" id="ap-cancel">Cancel</button>
    `;
    m.classList.remove('hidden');
    $('ap-pf').onchange = (e) => {
      if (e.target.value !== '__new') return;
      const name = prompt('New portfolio name:'); if (!name) { e.target.value = u.activePortfolioId; return; }
      const p = Storage.createPortfolio(currentUser.username, name);
      const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.icon} ${p.name}`; opt.selected = true;
      e.target.insertBefore(opt, e.target.querySelector('option[value="__new"]'));
      e.target.value = p.id;
    };
    $('ap-confirm').onclick = () => {
      const pp = parseFloat($('ap-purchase').value) || 0;
      const pfId = $('ap-pf').value === '__new' ? u.activePortfolioId : $('ap-pf').value;
      PortfolioMod.addToPortfolio(currentUser.username, card, cond, marketValue || 0, pp, pfId);
      toast('Added to portfolio');
      m.classList.add('hidden');
    };
    $('ap-cancel').onclick = () => m.classList.add('hidden');
  }

  /* ============================================================ BUY LIST ============ */
  function renderBuyBadge() {
    const u = Storage.loadUser(currentUser.username);
    const n = (u.buyList || []).length;
    const b = $('buylist-badge'); b.textContent = n; b.classList.toggle('zero', n === 0);
  }
  function renderWatchBadge() {
    const u = Storage.loadUser(currentUser.username);
    const n = (u.watchList || []).length;
    const b = $('watch-badge'); b.textContent = n; b.classList.toggle('zero', n === 0);
  }

  function renderBuyList() {
    const body = $('buylist-body');
    const u = Storage.loadUser(currentUser.username);
    body.innerHTML = '';
    if (!u.buyList.length) {
      body.appendChild(create('div', 'empty-state', 'Buy list is empty — scan cards to start adding.'));
    } else {
      const list = create('div', 'bl-list');
      for (const b of u.buyList) {
        const row = create('div', 'bl-row');
        const cond = b.condition.kind === 'graded' ? `${b.condition.grader} ${b.condition.grade}` : b.condition.value;
        row.innerHTML = `
          ${b.image ? `<img src="${b.image}" alt="" loading="lazy" />` : `<div style="width:50px;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
          <div class="bi"><div class="bn">${b.name}</div><div class="bc">${b.set} · ${cond}</div></div>
          <div class="bv"><div class="bvp">${USD(b.marketValue)}</div><button class="bx" data-remove="${b.id}">×</button></div>
        `;
        list.appendChild(row);
      }
      body.appendChild(list);
      list.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = (ev) => {
        ev.stopPropagation();
        PortfolioMod.removeFromBuyList(currentUser.username, btn.dataset.remove);
        renderBuyList(); renderBuyBadge();
      });
    }
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    $('buylist-totals').innerHTML = `
      <div class="bt-row"><span>Items</span><strong>${tots.count}</strong></div>
      <div class="bt-row"><span>Market value</span><strong>${USD(tots.market)}</strong></div>
      <div class="bt-row big cash"><span>💰 Cash offer (${tots.offerCash}%)</span><strong>${USD(tots.cash)}</strong></div>
      <div class="bt-row big trade"><span>🔄 Trade credit (${tots.offerTrade}%)</span><strong>${USD(tots.trade)}</strong></div>
    `;
  }
  function wireBuyList() {
    $('buylist-btn').onclick = () => showScreen('buylist-screen');
    $('bl-clear').onclick = () => { if (!confirm('Clear the buy list?')) return; PortfolioMod.clearBuyList(currentUser.username); renderBuyList(); renderBuyBadge(); };
    $('bl-show-customer').onclick = () => openCustomerView();
    $('bl-receipt').onclick = () => openReceipt();
    $('bl-portfolio').onclick = () => {
      const u = Storage.loadUser(currentUser.username);
      const pfOpts = u.portfolios.map(p => `${p.id}|${p.name}`).join('\n');
      const pf = u.portfolios.length === 1 ? u.portfolios[0].id : prompt(`Which portfolio?\n${pfOpts}\n\nPaste the ID:`, u.activePortfolioId);
      if (!pf) return;
      if (!confirm(`Move all buy-list items to "${u.portfolios.find(p=>p.id===pf)?.name || pf}"? (cost basis = cash offer)`)) return;
      PortfolioMod.moveBuyListToPortfolio(currentUser.username, pf);
      renderBuyList(); renderBuyBadge(); toast('Moved to portfolio');
    };
    $('bl-attach-customer').onclick = () => attachBuyListToCustomer();
    $('cust-close').onclick = () => $('customer-modal').classList.add('hidden');
    $('cash-pct').addEventListener('input', updateCustomerLive);
    $('trade-pct').addEventListener('input', updateCustomerLive);
    $('watch-btn').onclick = () => showScreen('watchlist-screen');
  }
  function openCustomerView() {
    const u = Storage.loadUser(currentUser.username);
    $('cash-pct').value = u.offerCash;
    $('trade-pct').value = u.offerTrade;
    updateCustomerLive();
    $('customer-modal').classList.remove('hidden');
  }
  function updateCustomerLive() {
    const u = Storage.loadUser(currentUser.username);
    u.offerCash  = Math.max(10, Math.min(100, parseInt($('cash-pct').value)  || 70));
    u.offerTrade = Math.max(10, Math.min(100, parseInt($('trade-pct').value) || 80));
    Storage.saveUser(currentUser.username, u);
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    $('cust-count').textContent  = tots.count;
    $('cust-market').textContent = USD(tots.market);
    $('cust-cash').textContent   = USD(tots.cash);
    $('cust-trade').textContent  = USD(tots.trade);
  }

  function openReceipt() {
    const u = Storage.loadUser(currentUser.username);
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    const m = $('receipt-modal');
    const items = u.buyList.map(b => {
      const cond = b.condition.kind === 'graded' ? `${b.condition.grader}${b.condition.grade}` : b.condition.value;
      return `<div class="r"><span>${b.name.slice(0,28)} · ${cond}</span><span>${USD(b.marketValue)}</span></div>`;
    }).join('');
    const date = new Date().toLocaleString();
    $('receipt-body').innerHTML = `
      <h2>Receipt</h2>
      <div class="receipt" id="rcp">
        <div class="h">HOUSE OF CARDS · BUY DESK</div>
        <div class="h" style="font-size:11px;font-weight:normal">${date}</div>
        <hr/>
        ${items || '<div class="r"><span>(no items)</span><span></span></div>'}
        <hr/>
        <div class="r"><span>Items</span><span>${tots.count}</span></div>
        <div class="r"><span>Market value</span><span>${USD(tots.market)}</span></div>
        <hr/>
        <div class="r big-row"><span>CASH OFFER (${tots.offerCash}%)</span><span>${USD(tots.cash)}</span></div>
        <div class="r big-row"><span>TRADE CREDIT (${tots.offerTrade}%)</span><span>${USD(tots.trade)}</span></div>
        <hr/>
        <div class="h" style="font-size:10px;font-weight:normal">Quote valid 24h · prices subject to market</div>
      </div>
      <button class="btn btn-primary" id="rcp-print">🖨 Print / Save PDF</button>
      <button class="btn" id="rcp-share">📤 Share</button>
      <button class="btn ghost" id="rcp-close">Close</button>
    `;
    m.classList.remove('hidden');
    $('rcp-print').onclick = () => window.print();
    $('rcp-share').onclick = async () => {
      const text = `House of Cards Buy Desk · ${date}\nItems: ${tots.count}\nMarket: ${USD(tots.market)}\nCash: ${USD(tots.cash)}\nTrade: ${USD(tots.trade)}`;
      if (navigator.share) { try { await navigator.share({ title: 'House of Cards Receipt', text }); } catch {} }
      else { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch {} }
    };
    $('rcp-close').onclick = () => m.classList.add('hidden');
  }
  function attachBuyListToCustomer() {
    const u = Storage.loadUser(currentUser.username);
    if (!u.buyList.length) return toast('Buy list is empty');
    if (!u.customers.length) return toast('No customers yet — create one in the Customers tab');
    const opts = u.customers.map(c => `${c.id}|${c.name}`).join('\n');
    const id = prompt(`Attach to which customer?\n${opts}\n\nPaste ID:`);
    if (!id) return;
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    const method = prompt('Payment method: "cash" or "trade-credit"?', 'cash');
    const totalCents = Math.round((method === 'trade-credit' ? tots.trade : tots.cash) * 100);
    CustomersMod.addTransaction(currentUser.username, id, {
      type: 'buy', items: u.buyList.map(b => ({ name: b.name, set: b.set, val: b.marketValue })),
      totalCents, paymentMethod: method,
    });
    PortfolioMod.clearBuyList(currentUser.username);
    renderBuyList(); renderBuyBadge();
    toast('Attached to customer + buy list cleared');
  }

  /* ============================================================ PORTFOLIO ============ */
  function renderPortfolio() {
    const u = Storage.loadUser(currentUser.username);
    const pfId = viewingPortfolioId || u.activePortfolioId;
    const isAll = pfId === '_all';

    // Header pills (multi-portfolio switcher)
    const hd = $('portfolio-header'); hd.innerHTML = '';
    u.portfolios.forEach(p => {
      const pill = create('button', 'pf-pill' + ((!isAll && p.id === pfId) ? ' active' : ''));
      pill.innerHTML = `<span class="ic">${p.icon || '📚'}</span>${p.name}`;
      pill.onclick = () => { viewingPortfolioId = p.id; Storage.setActivePortfolio(currentUser.username, p.id); renderPortfolio(); };
      hd.appendChild(pill);
    });
    if (u.portfolios.length > 1) {
      const all = create('button', 'pf-pill' + (isAll ? ' active' : ''));
      all.innerHTML = `<span class="ic">🌐</span>All`;
      all.onclick = () => { viewingPortfolioId = '_all'; renderPortfolio(); };
      hd.appendChild(all);
    }
    const add = create('button', 'pf-pill pf-pill-add');
    add.innerHTML = `+ New`;
    add.onclick = () => {
      const name = prompt('New portfolio name:'); if (!name) return;
      Storage.createPortfolio(currentUser.username, name);
      viewingPortfolioId = null; renderPortfolio();
    };
    hd.appendChild(add);
    const ren = create('button', 'pf-pill');
    ren.innerHTML = `✎ Rename`;
    ren.onclick = () => {
      if (isAll) return toast('Pick a single portfolio to rename');
      const name = prompt('Rename to:', u.portfolios.find(p => p.id === pfId)?.name); if (!name) return;
      Storage.renamePortfolio(currentUser.username, pfId, name); renderPortfolio();
    };
    hd.appendChild(ren);

    // Summary
    const sum = PortfolioMod.portfolioSummary(currentUser.username, pfId);
    const pfName = isAll ? 'All Portfolios' : (u.portfolios.find(p => p.id === pfId)?.name || 'Portfolio');
    $('portfolio-summary').innerHTML = `
      <div class="ps-name">Portfolio: ${pfName}</div>
      <div class="ps-value">${USD(sum.value)}</div>
      <div class="ps-daily ${sum.dailyDelta >= 0 ? 'up' : 'down'}">${sum.dailyDelta >= 0 ? '▲' : '▼'} ${USD(Math.abs(sum.dailyDelta))} today</div>
      <div class="ps-grid">
        <div class="ps-stat"><div class="v">${sum.totalQty}</div><div class="l">Cards</div></div>
        <div class="ps-stat"><div class="v">${USD(sum.cost)}</div><div class="l">Cost</div></div>
        <div class="ps-stat"><div class="v ${sum.pl >= 0 ? 'gain' : 'loss'}">${sum.pl >= 0 ? '+' : ''}${USD(sum.pl)} (${sum.plPct.toFixed(0)}%)</div><div class="l">P/L</div></div>
      </div>
    `;

    // Action icons
    document.querySelectorAll('#ai-bulk').forEach(b => b.classList.toggle('on', bulkSelect));

    // Tabs
    document.querySelectorAll('[data-ptab]').forEach(b => {
      b.classList.toggle('active', b.dataset.ptab === portfolioTab);
      b.onclick = () => { portfolioTab = b.dataset.ptab; renderPortfolio(); };
    });

    // Body
    const body = $('portfolio-body'); body.innerHTML = '';
    let items = isAll ? Storage.allPortfolioCards(u) : ((u.portfolios.find(p => p.id === pfId) || u.portfolios[0]).cards);
    const q = $('portfolio-search').value.toLowerCase();
    if (q) items = items.filter(e => `${e.name} ${e.set} ${e.condition?.value || ''} ${e.condition?.grader || ''}`.toLowerCase().includes(q));
    const sort = $('portfolio-sort').value;
    items = [...items].sort((a, b) => {
      if (sort === 'value-desc') return (b.currentValue || 0) * (b.qty || 1) - (a.currentValue || 0) * (a.qty || 1);
      if (sort === 'value-asc')  return (a.currentValue || 0) * (a.qty || 1) - (b.currentValue || 0) * (b.qty || 1);
      if (sort === 'recent')     return (b.addedAt || 0) - (a.addedAt || 0);
      if (sort === 'pl')         return ((b.currentValue || 0) - (b.purchasePrice || 0)) - ((a.currentValue || 0) - (a.purchasePrice || 0));
      if (sort === 'daily')      return (Analytics.dailyChange(b.currentValue || 0, b.history || []).pct) - (Analytics.dailyChange(a.currentValue || 0, a.history || []).pct);
      if (sort === 'name')       return a.name.localeCompare(b.name);
      return 0;
    });
    if (sort === 'daily') items.reverse();

    if (!items.length) { body.appendChild(create('div', 'empty-state', 'No cards yet. Scan a card and tap "+ Portfolio".')); return; }

    if (portfolioTab === 'grid') {
      const g = create('div', 'pf-grid');
      items.forEach(e => g.appendChild(makePfCell(e)));
      body.appendChild(g);
    } else if (portfolioTab === 'list') {
      const l = create('div', 'pf-list');
      items.forEach(e => l.appendChild(makePfRow(e)));
      body.appendChild(l);
    } else if (portfolioTab === 'sets') {
      const sets = Analytics.setCompletion(items);
      const wrap = create('div');
      sets.forEach(s => {
        const pill = create('div', 'set-pill');
        const pctStr = s.pct != null ? `${s.unique}/${s.totalKnown} (${s.pct.toFixed(0)}%)` : `${s.unique} unique`;
        pill.innerHTML = `<div><div class="sn">${s.name}</div><div class="ct">${pctStr} · ${s.owned} owned</div></div><div class="sv">${USD(s.totalValue)}</div>`;
        wrap.appendChild(pill);
      });
      body.appendChild(wrap);
    } else if (portfolioTab === 'recs') {
      const wrap = create('div');
      const recs = items.map(e => {
        const rec = Analytics.recommend({ currentValue: e.currentValue, cardmarket: e.cardmarket, history: e.history });
        return { ...e, _rec: rec };
      }).filter(e => e._rec.color !== 'grey' && e._rec.action !== 'HOLD').sort((a, b) => Math.abs(b._rec.percent) - Math.abs(a._rec.percent));
      if (!recs.length) { wrap.appendChild(create('div', 'empty-state', 'No buy/sell signals yet. Open cards or refresh prices to build history.')); }
      recs.forEach(e => {
        const row = create('div', 'mover-row');
        row.innerHTML = `
          ${e.image ? `<img src="${e.image}" alt="">` : `<div style="width:38px;aspect-ratio:0.72;background:#0a0e1a;border-radius:5px"></div>`}
          <div class="mi"><div class="mn">${e.name}</div><div class="ms">${e.set} · <span style="color:var(--${e._rec.color === 'green' ? 'good' : e._rec.color === 'red' ? 'bad' : 'warn'})">${e._rec.action}</span></div></div>
          <div style="text-align:right"><div class="mv">${USD(e.currentValue)}</div><div class="md ${e._rec.percent >= 0 ? 'up' : 'down'}">${PCT(e._rec.percent)}</div></div>
        `;
        row.onclick = () => openCardById(e.cardId);
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
    }
  }

  function makePfCell(e) {
    const cell = create('div', 'pf-cell' + (bulkSelect && bulkSelection.has(e.id) ? ' selected' : ''));
    const isGraded = e.condition?.kind === 'graded';
    const cond = isGraded ? `${e.condition.grader} ${e.condition.grade}` : e.condition?.value;
    const finish = e.finish || 'Normal';
    const daily = Analytics.dailyChange(e.currentValue || 0, e.history || []);
    const rec = Analytics.recommend({ currentValue: e.currentValue, cardmarket: e.cardmarket, history: e.history });
    cell.innerHTML = `
      <div class="pf-img-wrap">
        ${isGraded ? `<div class="grade-slab"><span class="left">${e.condition.grader}</span><span class="right">${e.condition.grade}</span></div>` : ''}
        ${e.image ? `<img src="${e.image}" alt="" loading="lazy" />` : `<div style="width:100%;height:100%;background:#0a0e1a;border-radius:8px"></div>`}
        ${(e.qty || 1) > 1 ? `<div class="qty-badge">×${e.qty}</div>` : ''}
        ${rec.color !== 'grey' && rec.action !== 'HOLD' && rec.action !== 'NO DATA' ? `<div class="rec-pill ${rec.color}">${rec.action}</div>` : ''}
      </div>
      <div class="pf-name">${e.name}</div>
      <div class="pf-set">${e.set}</div>
      <div class="pf-rarity">${e.rarity ? `${e.rarity} · ` : ''}${e.number || ''}</div>
      <div class="pf-cond">${cond} · ${finish}</div>
      <div class="pf-qty-line">Qty: ${e.qty || 1}</div>
      <div class="pf-bottom">
        <div class="pf-val">${USD((e.currentValue || 0) * (e.qty || 1))}</div>
        <div class="pf-daily ${daily.dir}">${daily.dir === 'up' ? '▲' : daily.dir === 'down' ? '▼' : '·'} ${USD(Math.abs(daily.abs))}<div class="pf-daily-sub">${PCT(daily.pct)}</div></div>
      </div>
    `;
    cell.onclick = () => {
      if (bulkSelect) {
        if (bulkSelection.has(e.id)) bulkSelection.delete(e.id); else bulkSelection.add(e.id);
        renderPortfolio();
      } else openCardById(e.cardId);
    };
    return cell;
  }
  function makePfRow(e) {
    const row = create('div', 'pf-row');
    const pl = ((e.currentValue || 0) - (e.purchasePrice || 0)) * (e.qty || 1);
    const cond = e.condition?.kind === 'graded' ? `${e.condition.grader} ${e.condition.grade}` : e.condition?.value;
    const daily = Analytics.dailyChange(e.currentValue || 0, e.history || []);
    row.innerHTML = `
      ${e.image ? `<img src="${e.image}" alt="" loading="lazy" />` : `<div style="width:50px;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
      <div class="info"><div class="n">${e.name}${(e.qty||1) > 1 ? ` ×${e.qty}` : ''}</div><div class="s">${e.set} · ${cond}</div></div>
      <div class="price">
        <div class="v">${USD((e.currentValue || 0) * (e.qty || 1))}</div>
        ${e.purchasePrice > 0 ? `<div class="p ${pl >= 0 ? 'gain' : 'loss'}">${pl >= 0 ? '+' : ''}${USD(pl)}</div>` : ''}
        <div class="p ${daily.dir === 'up' ? 'gain' : daily.dir === 'down' ? 'loss' : ''}">${daily.dir === 'up' ? '▲' : daily.dir === 'down' ? '▼' : ''}${PCT(daily.pct)}</div>
      </div>
    `;
    row.onclick = () => openCardById(e.cardId);
    return row;
  }

  function wirePortfolio() {
    $('portfolio-search').addEventListener('input', () => renderPortfolio());
    $('portfolio-sort').addEventListener('change', () => renderPortfolio());
    $('ai-movers').onclick   = () => showScreen('movers-screen');
    $('ai-trade').onclick    = () => showScreen('trade-screen');
    $('ai-bulk').onclick     = () => { bulkSelect = !bulkSelect; if (!bulkSelect) bulkSelection.clear(); renderPortfolio(); if (bulkSelect) toast('Bulk select: tap cards, then…'); };
    $('ai-export').onclick   = () => exportPortfolioCSV();
    $('ai-refresh').onclick  = () => refreshActivePortfolio();
    $('ai-share').onclick    = () => sharePortfolio();
  }

  function exportPortfolioCSV() {
    const u = Storage.loadUser(currentUser.username);
    const pf = u.portfolios.find(p => p.id === u.activePortfolioId);
    if (!pf || !pf.cards.length) return toast('Nothing to export');
    const csv = Share.exportCSV(pf);
    Share.downloadCSV(`${pf.name.replace(/\W+/g,'_')}-${new Date().toISOString().slice(0,10)}.csv`, csv);
    toast('CSV downloaded');
  }
  async function refreshActivePortfolio() {
    const u = Storage.loadUser(currentUser.username);
    const pf = u.portfolios.find(p => p.id === u.activePortfolioId);
    if (!pf || !pf.cards.length) return toast('Nothing to refresh');
    toast(`Refreshing ${pf.cards.length} card${pf.cards.length !== 1 ? 's' : ''}…`, 4000);
    const r = await PortfolioMod.refreshPortfolio(currentUser.username, pf.id, (i, n, e) => {
      // could update a progress UI here
    });
    toast(`✓ Refreshed ${r.updated} / ${r.total} (${r.failed} failed)`);
    renderPortfolio();
  }
  function sharePortfolio() {
    const u = Storage.loadUser(currentUser.username);
    const pf = u.portfolios.find(p => p.id === u.activePortfolioId);
    if (!pf || !pf.cards.length) return toast('Add cards first');
    const url = Share.buildShowcaseUrl(pf, currentUser.username);
    const qr = Share.qrCodeUrl(url, 240);
    $('qr-modal').classList.remove('hidden');
    $('qr-body').innerHTML = `
      <h2>Share "${pf.name}"</h2>
      <p>Read-only showcase URL — anyone can view. Stored in the link itself (no server).</p>
      <div style="text-align:center;padding:14px;background:white;border-radius:10px"><img src="${qr}" alt="QR" style="width:240px;height:240px;display:block;margin:0 auto"/></div>
      <input value="${url}" id="share-url" readonly />
      <button class="btn btn-primary big" id="copy-share">Copy link</button>
      <button class="btn" id="share-native">📤 Share via…</button>
      <button class="btn ghost" id="close-share">Close</button>
    `;
    $('copy-share').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Copied'); } catch { $('share-url').select(); document.execCommand('copy'); toast('Copied'); } };
    $('share-native').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: pf.name, url }); } catch {} } else toast('Use Copy link'); };
    $('close-share').onclick = () => $('qr-modal').classList.add('hidden');
  }

  function openAddWatch(card, currentValue) {
    const m = $('add-modal');
    $('add-modal-body').innerHTML = `
      <h2>Add to Watchlist</h2>
      <p>${card.name} · ${card.set}</p>
      <div class="setting-row"><strong>Current value</strong><span>${USD(currentValue)}</span></div>
      <label style="font-size:12px;color:var(--text-dim)">Alert when price ≤ (buy target)</label>
      <input id="aw-below" type="number" step="0.01" placeholder="e.g. ${(currentValue * 0.85).toFixed(2)}" />
      <label style="font-size:12px;color:var(--text-dim)">Alert when price ≥ (sell target)</label>
      <input id="aw-above" type="number" step="0.01" placeholder="e.g. ${(currentValue * 1.20).toFixed(2)}" />
      <button class="btn btn-primary big" id="aw-confirm">Watch</button>
      <button class="btn ghost" id="aw-cancel">Cancel</button>
    `;
    m.classList.remove('hidden');
    $('aw-confirm').onclick = async () => {
      const below = parseFloat($('aw-below').value) || null;
      const above = parseFloat($('aw-above').value) || null;
      Watch.add(currentUser.username, card, { below, above });
      const perm = await Watch.requestPermission();
      m.classList.add('hidden');
      renderWatchBadge();
      toast(perm === 'granted' ? 'Watching — alerts on' : 'Watching (enable notifications in settings for alerts)');
    };
    $('aw-cancel').onclick = () => m.classList.add('hidden');
  }

  /* ============================================================ MOVERS ============ */
  function renderMovers() {
    const u = Storage.loadUser(currentUser.username);
    const all = Storage.allPortfolioCards(u);
    const { gainers, losers } = Analytics.topMovers(all, 10);
    const body = $('movers-body'); body.innerHTML = '';
    function section(title, arr, dir) {
      const sec = create('div', 'movers-section');
      sec.innerHTML = `<h3>${title}</h3>`;
      if (!arr.length) sec.appendChild(create('div', 'empty-state', 'No moves today.'));
      arr.forEach(e => {
        const row = create('div', 'mover-row');
        row.innerHTML = `
          ${e.image ? `<img src="${e.image}" alt="">` : `<div style="width:38px;aspect-ratio:0.72;background:#0a0e1a;border-radius:5px"></div>`}
          <div class="mi"><div class="mn">${e.name}</div><div class="ms">${e.set}</div></div>
          <div style="text-align:right"><div class="mv">${USD(e.currentValue)}</div><div class="md ${dir}">${dir === 'up' ? '▲' : '▼'} ${USD(Math.abs(e._change.abs))} (${e._change.pct.toFixed(1)}%)</div></div>
        `;
        row.onclick = () => openCardById(e.cardId);
        sec.appendChild(row);
      });
      body.appendChild(sec);
    }
    section('🟢 Top Gainers (today)', gainers, 'up');
    section('🔴 Top Losers (today)',  losers,  'down');

    // Across-portfolio buy/sell recommendations
    const recs = all.map(c => ({ ...c, _rec: Analytics.recommend({ currentValue: c.currentValue, cardmarket: c.cardmarket, history: c.history }) }));
    const buys = recs.filter(c => c._rec.color === 'green' && (c._rec.action === 'BUY' || c._rec.action === 'STRONG BUY')).slice(0, 10);
    const sells = recs.filter(c => c._rec.color === 'red' && (c._rec.action === 'SELL' || c._rec.action === 'STRONG SELL')).slice(0, 10);
    const recSection = (title, arr, color) => {
      const sec = create('div', 'movers-section');
      sec.innerHTML = `<h3>${title}</h3>`;
      if (!arr.length) sec.appendChild(create('div', 'empty-state', `No active signals.`));
      arr.forEach(e => {
        const row = create('div', 'mover-row');
        row.innerHTML = `
          ${e.image ? `<img src="${e.image}" alt="">` : `<div style="width:38px;aspect-ratio:0.72;background:#0a0e1a;border-radius:5px"></div>`}
          <div class="mi"><div class="mn">${e.name}</div><div class="ms">${e.set} · ${e._rec.action}</div></div>
          <div style="text-align:right"><div class="mv">${USD(e.currentValue)}</div><div class="md ${color === 'green' ? 'up' : 'down'}">${PCT(e._rec.percent)}</div></div>
        `;
        row.onclick = () => openCardById(e.cardId);
        sec.appendChild(row);
      });
      body.appendChild(sec);
    };
    recSection('🟢 Buy signals (vs 30d avg)', buys, 'green');
    recSection('🔴 Sell signals (vs 30d avg)', sells, 'red');
  }

  /* ============================================================ TRADE ============ */
  function renderTrade() {
    const body = $('trade-body');
    const u = Storage.loadUser(currentUser.username);
    const owned = Storage.allPortfolioCards(u);
    function side(letter, label) {
      const items = tradeStacks[letter];
      const total = items.reduce((a, c) => a + (c.currentValue || 0) * (c.qty || 1), 0);
      const html = create('div', 'trade-side');
      html.innerHTML = `<h4>${label} <span class="ts-total">${USD(total)}</span></h4>
        <div class="ts-items">${items.length ? items.map((c, idx) => `
          <div class="trade-mini">${c.image ? `<img src="${c.image}" style="width:30px;aspect-ratio:0.72;object-fit:cover;border-radius:3px">` : ''}
            <span>${c.name} · ${c.set}</span><span class="tm-v">${USD((c.currentValue || 0) * (c.qty || 1))}</span>
            <button class="tm-x" data-side="${letter}" data-idx="${idx}">×</button></div>`).join('') : '<div class="empty-state" style="padding:8px;font-size:11px">(empty)</div>'}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn small" data-add-owned="${letter}">+ From Portfolio</button>
          <button class="btn small" data-add-manual="${letter}">+ Search</button>
        </div>`;
      return html;
    }
    body.innerHTML = '';
    body.appendChild(side('A', 'Side A — YOU GIVE'));
    body.appendChild(side('B', 'Side B — YOU GET'));
    const verdict = Analytics.tradeFairness(tradeStacks.A, tradeStacks.B);
    const vbox = create('div', `trade-verdict ${verdict.verdict.tag}`);
    vbox.innerHTML = `${verdict.verdict.label}<br><small style="font-weight:600;opacity:0.85">You give ${USD(verdict.valA)} · You get ${USD(verdict.valB)} · diff ${USD(Math.abs(verdict.diff))}</small>`;
    body.appendChild(vbox);
    body.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { tradeStacks[b.dataset.side].splice(parseInt(b.dataset.idx), 1); renderTrade(); });
    body.querySelectorAll('[data-add-owned]').forEach(b => b.onclick = () => pickFromOwned(b.dataset.addOwned));
    body.querySelectorAll('[data-add-manual]').forEach(b => b.onclick = () => addToTradeViaSearch(b.dataset.addManual));
  }
  function pickFromOwned(side) {
    const u = Storage.loadUser(currentUser.username);
    const owned = Storage.allPortfolioCards(u);
    if (!owned.length) return toast('No portfolio cards yet');
    const m = $('add-modal');
    $('add-modal-body').innerHTML = `
      <h2>Add to Side ${side}</h2>
      <input id="tp-search" placeholder="Search your cards…" />
      <div id="tp-list" style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
      <button class="btn ghost" id="tp-close">Cancel</button>
    `;
    m.classList.remove('hidden');
    function refresh() {
      const q = $('tp-search').value.toLowerCase();
      const list = owned.filter(c => `${c.name} ${c.set}`.toLowerCase().includes(q)).slice(0, 30);
      $('tp-list').innerHTML = list.map(c => `<div class="trade-mini" data-pick="${c.id}">${c.image ? `<img src="${c.image}" style="width:30px;aspect-ratio:0.72;object-fit:cover;border-radius:3px">` : ''}<span>${c.name} · ${c.set}</span><span class="tm-v">${USD(c.currentValue)}</span></div>`).join('');
      $('tp-list').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
        const c = owned.find(x => x.id === b.dataset.pick);
        if (c) { tradeStacks[side].push(c); m.classList.add('hidden'); renderTrade(); }
      });
    }
    $('tp-search').oninput = refresh; $('tp-close').onclick = () => m.classList.add('hidden');
    refresh();
  }
  async function addToTradeViaSearch(side) {
    const q = prompt('Search card name:'); if (!q) return;
    const res = await APIs.searchAll(q);
    if (!res.length) return toast('No matches');
    const c = res[0];
    tradeStacks[side].push({ name: c.name, set: c.set, image: c.image, currentValue: APIs.quickBest(c) || 0, qty: 1, cardId: c.id });
    renderTrade();
  }

  /* ============================================================ WATCHLIST ============ */
  function renderWatchlist() {
    const u = Storage.loadUser(currentUser.username);
    const body = $('watchlist-body'); body.innerHTML = '';
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    $('watch-status').innerHTML = perm === 'granted' ? '🔔 Alerts enabled' :
      perm === 'denied' ? '🔕 Alerts blocked — enable in browser settings' :
      `<button class="btn small" id="ws-enable">🔔 Enable alerts</button>`;
    const enableBtn = $('ws-enable'); if (enableBtn) enableBtn.onclick = async () => { await Watch.requestPermission(); renderWatchlist(); };

    if (!u.watchList.length) {
      body.appendChild(create('div', 'empty-state', 'Watchlist is empty. Open any card → ⭐ Watch to set buy/sell targets.'));
      return;
    }
    for (const w of u.watchList) {
      const row = create('div', 'watch-row');
      const cur = w.lastValue;
      row.innerHTML = `
        ${w.image ? `<img src="${w.image}" alt="">` : `<div style="width:50px;aspect-ratio:0.72;background:#0a0e1a;border-radius:5px"></div>`}
        <div class="wi">
          <div class="wn">${w.name}</div>
          <div class="ws">${w.set || ''}</div>
          <div class="wt">${w.alertBelow ? `▼ buy @ ${USD(w.alertBelow)}` : ''}${w.alertBelow && w.alertAbove ? ' · ' : ''}${w.alertAbove ? `▲ sell @ ${USD(w.alertAbove)}` : ''}</div>
        </div>
        <div class="wv">
          <div class="wvc">${cur != null ? USD(cur) : '—'}</div>
          <button class="wcb" data-remove="${w.id}">Remove</button>
        </div>
      `;
      row.onclick = (e) => { if (!e.target.matches('[data-remove]')) openCardById(w.cardId); };
      body.appendChild(row);
    }
    body.querySelectorAll('[data-remove]').forEach(b => b.onclick = (e) => { e.stopPropagation(); Watch.remove(currentUser.username, b.dataset.remove); renderWatchlist(); renderWatchBadge(); });
  }

  /* ============================================================ CUSTOMERS ============ */
  function renderCustomers() {
    const u = Storage.loadUser(currentUser.username);
    const body = $('customers-body'); body.innerHTML = '';
    if (!u.customers.length) { body.appendChild(create('div', 'empty-state', 'No customers yet. Tap "+ New Customer" to start a ledger.')); return; }
    for (const c of u.customers) {
      const row = create('div', 'customer-row');
      const credit = (c.creditCents || 0) / 100;
      row.innerHTML = `
        <div class="ci"><div class="cn">${c.name}</div><div class="cp">${c.phone || c.email || ''} · ${c.transactions?.length || 0} transaction${(c.transactions?.length || 0) !== 1 ? 's' : ''}</div></div>
        <div class="cc ${credit === 0 ? 'zero' : ''}">${USD(credit)}</div>
      `;
      row.onclick = () => openCustomer(c.id);
      body.appendChild(row);
    }
  }
  function openCustomer(id) {
    const c = CustomersMod.get(currentUser.username, id); if (!c) return;
    const m = $('add-modal');
    const txns = (c.transactions || []).slice(0, 20).map(t => `<div class="r" style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--line)"><span>${new Date(t.ts).toLocaleDateString()} · ${t.type}${t.paymentMethod ? ' (' + t.paymentMethod + ')' : ''}</span><span>${USD(t.totalCents/100)}</span></div>`).join('');
    $('add-modal-body').innerHTML = `
      <h2>${c.name}</h2>
      <div class="setting-row"><strong>Phone</strong><span>${c.phone || '—'}</span></div>
      <div class="setting-row"><strong>Email</strong><span>${c.email || '—'}</span></div>
      <div class="setting-row"><strong>Store credit</strong><span style="color:var(--good);font-weight:900;font-size:18px">${USD(c.creditCents/100)}</span></div>
      <div class="setting-row"><strong>Notes</strong><span>${c.notes || '—'}</span></div>
      <h3>Recent transactions</h3>
      ${txns || '<div class="empty-state" style="padding:8px;font-size:12px">No transactions yet.</div>'}
      <button class="btn btn-primary" id="cu-credit">+ Add Credit</button>
      <button class="btn" id="cu-redeem">− Redeem Credit</button>
      <button class="btn danger" id="cu-delete">Delete customer</button>
      <button class="btn ghost" id="cu-close">Close</button>
    `;
    m.classList.remove('hidden');
    $('cu-credit').onclick = () => { const a = parseFloat(prompt('Credit amount ($):')); if (!a) return; CustomersMod.adjustCredit(currentUser.username, id, Math.round(a*100), 'Manual credit'); toast('Credit added'); openCustomer(id); renderCustomers(); };
    $('cu-redeem').onclick = () => { const a = parseFloat(prompt('Redeem amount ($):')); if (!a) return; CustomersMod.adjustCredit(currentUser.username, id, -Math.round(a*100), 'Credit redeemed'); toast('Credit redeemed'); openCustomer(id); renderCustomers(); };
    $('cu-delete').onclick = () => { if (!confirm('Delete this customer?')) return; CustomersMod.remove(currentUser.username, id); m.classList.add('hidden'); renderCustomers(); };
    $('cu-close').onclick = () => m.classList.add('hidden');
  }
  function wireCustomers() {
    $('cust-new').onclick = () => {
      const name = prompt('Customer name:'); if (!name) return;
      const phone = prompt('Phone (optional):') || '';
      const email = prompt('Email (optional):') || '';
      const notes = prompt('Notes (optional):') || '';
      CustomersMod.create(currentUser.username, { name, phone, email, notes });
      renderCustomers();
      toast('Customer added');
    };
  }

  /* ============================================================ SEALED EV ============ */
  function renderSealed() {
    const body = $('sealed-body');
    body.innerHTML = `
      <div class="sealed-form">
        <label>Set name <input id="se-set" placeholder="e.g. Lost Origin" /></label>
        <label>Box cost ($) <input id="se-cost" type="number" step="0.01" placeholder="125.00" /></label>
        <label>Packs per box <input id="se-packs" type="number" value="36" /></label>
        <label>Cards per pack <input id="se-cards" type="number" value="10" /></label>
        <label>Era
          <select id="se-era"><option value="true">Modern (Sword & Shield onward)</option><option value="false">Vintage (pre-2010)</option></select>
        </label>
        <label>Average chase value ($) <input id="se-chase" type="number" value="80" /></label>
        <label>Chase pull rate (decimal — 0.04 = 4%) <input id="se-rate" type="number" step="0.01" value="0.04" /></label>
        <button class="btn btn-primary big" id="se-calc">Calculate EV</button>
      </div>
      <div id="se-result"></div>
      <p class="disclaimer" style="margin-top:14px">Rough heuristic — replace with real pull-rate data per set once available. Use TCGplayer or Pokemon TCG API to fetch chase values automatically (todo).</p>
    `;
    $('se-calc').onclick = () => {
      const cost = parseFloat($('se-cost').value) || 0;
      const ev = Analytics.sealedEV({
        packsPerBox: parseInt($('se-packs').value) || 36,
        cardsPerPack: parseInt($('se-cards').value) || 10,
        modernEra: $('se-era').value === 'true',
        avgChaseValue: parseFloat($('se-chase').value) || 80,
        chaseRate: parseFloat($('se-rate').value) || 0.04,
      });
      const delta = ev - cost;
      const verdictTag = delta > cost * 0.15 ? 'good' : delta > 0 ? 'fair' : 'bad';
      const verdictLabel = delta > cost * 0.15 ? `🟢 RIP IT (+${USD(delta)})` : delta > 0 ? `🟡 Break-even (+${USD(delta)})` : `🔴 SEAL & HOLD (${USD(delta)})`;
      $('se-result').innerHTML = `<div class="sealed-result"><div class="l">Estimated value</div><div class="v">${USD(ev)}</div>
        ${cost > 0 ? `<div class="l" style="margin-top:8px">vs box cost ${USD(cost)}</div><span class="verdict ${verdictTag}">${verdictLabel}</span>` : ''}</div>`;
    };
  }

  /* ============================================================ TRENDS ============ */
  function renderTrends() {
    const u = Storage.loadUser(currentUser.username);
    const sum = PortfolioMod.portfolioSummary(currentUser.username, '_all');
    const body = $('trends-body');
    body.innerHTML = `
      <div class="portfolio-summary">
        <div class="ps-name">All portfolios</div>
        <div class="ps-value">${USD(sum.value)}</div>
        <div class="ps-daily ${sum.dailyDelta >= 0 ? 'up' : 'down'}">${sum.dailyDelta >= 0 ? '▲' : '▼'} ${USD(Math.abs(sum.dailyDelta))} today</div>
        <div class="ps-grid">
          <div class="ps-stat"><div class="v">${sum.totalQty}</div><div class="l">Cards</div></div>
          <div class="ps-stat"><div class="v ${sum.pl >= 0 ? 'gain' : 'loss'}">${sum.pl >= 0 ? '+' : ''}${USD(sum.pl)}</div><div class="l">P/L</div></div>
          <div class="ps-stat"><div class="v">${u.portfolios.length}</div><div class="l">Portfolios</div></div>
        </div>
      </div>
    `;
    const items = Storage.allPortfolioCards(u);
    const top = [...items].sort((a, b) => (b.currentValue || 0) * (b.qty || 1) - (a.currentValue || 0) * (a.qty || 1)).slice(0, 10);
    body.appendChild(create('div', 'cd-section', '<h3>Top 10 holdings</h3>'));
    const l = create('div', 'pf-list'); top.forEach(e => l.appendChild(makePfRow(e))); body.appendChild(l);

    const sets = Analytics.setCompletion(items).slice(0, 10);
    body.appendChild(create('div', 'cd-section', '<h3>Set completion</h3>'));
    sets.forEach(s => {
      const pill = create('div', 'set-pill');
      const pctStr = s.pct != null ? `${s.unique}/${s.totalKnown} (${s.pct.toFixed(0)}%)` : `${s.unique} unique`;
      pill.innerHTML = `<div><div class="sn">${s.name}</div><div class="ct">${pctStr} · ${s.owned} owned</div></div><div class="sv">${USD(s.totalValue)}</div>`;
      body.appendChild(pill);
    });
  }

  /* ============================================================ MARKETPLACE ============ */
  function renderMarketplace() {
    document.querySelectorAll('[data-mtab]').forEach(b => {
      b.classList.toggle('active', b.dataset.mtab === marketTab);
      b.onclick = () => { marketTab = b.dataset.mtab; renderMarketplace(); };
    });
    const body = $('marketplace-body'); body.innerHTML = '';
    const mySales = Marketplace.getMySales(currentUser.username);
    const needsAttention = mySales.some(s =>
      (s.seller === currentUser.username && (s.status === 'pending_payment' || s.status === 'pending_shipping')) ||
      (s.buyer === currentUser.username && s.status === 'pending_payment')
    );
    $('sales-dot').classList.toggle('hide', !needsAttention);

    if (marketTab === 'sell')  { $('market-search-box').style.display = 'none'; return renderSellForm(body); }
    if (marketTab === 'sales') { $('market-search-box').style.display = 'none'; return renderSales(body); }
    $('market-search-box').style.display = '';

    let listings = marketTab === 'mine' ? Marketplace.listMine(currentUser.username) : Marketplace.listAll();
    const q = $('market-search').value?.toLowerCase() || '';
    const filter = $('market-filter').value;
    if (q) listings = listings.filter(l => `${l.name} ${l.set} ${l.seller}`.toLowerCase().includes(q));
    if (filter === 'offers') listings = listings.filter(l => l.acceptOffers);
    if (!listings.length) { body.appendChild(create('div', 'empty-state', marketTab === 'mine' ? "You haven't listed anything yet." : 'No listings match.')); return; }
    for (const l of listings) {
      const card = create('div', 'listing-card');
      const cond = l.condition.kind === 'graded' ? `${l.condition.grader} ${l.condition.grade}` : l.condition.value;
      const offerCount = (l.offers || []).filter(o => o.status === 'open').length;
      card.innerHTML = `
        ${l.image ? `<img src="${l.image}" loading="lazy" alt="" />` : `<div style="width:80px;aspect-ratio:0.72;background:#0a0e1a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:36px">🃏</div>`}
        <div class="listing-info">
          <div class="listing-name">${l.name}</div>
          <div class="listing-meta">${l.set} · ${cond}</div>
          <div class="listing-seller">@${l.seller}${l.acceptOffers ? ' · accepts offers' : ''}${offerCount && l.seller === currentUser.username ? ` · ${offerCount} new offer${offerCount > 1 ? 's' : ''}` : ''}</div>
        </div>
        <div class="listing-price"><div class="lp">${USD(l.priceCents / 100)}</div><div class="lt bin">BIN</div><div class="lp-paypal">PayPal G&amp;S</div></div>
      `;
      card.onclick = () => openListingDetail(l);
      body.appendChild(card);
    }
  }
  function wireMarketplace() {
    $('market-search')?.addEventListener('input', () => renderMarketplace());
    $('market-filter')?.addEventListener('change', () => renderMarketplace());
  }
  function renderSellForm(body) {
    const u = Storage.loadUser(currentUser.username);
    const hasProfile = u.paypalHandle && u.shippingAddress;
    const form = create('div', 'sell-form');
    form.innerHTML = `
      <div class="paypal-notice">🛡️ All sales settled via <strong>PayPal Goods &amp; Services</strong>. Buyer + seller protected.${hasProfile ? '' : '<br><br>⚠️ Set your PayPal.me handle + ship-from address in <strong>Settings</strong> before listing.'}</div>
      <input id="sell-name" placeholder="Card name" />
      <input id="sell-set" placeholder="Set / version" />
      <div class="form-row"><input id="sell-cond" placeholder="Condition (NM, PSA 9, etc.)" /><input id="sell-price" type="number" min="0.50" step="0.01" placeholder="Price ($)" /></div>
      <label class="toggle-row"><input type="checkbox" id="sell-offers" checked /> Accept best offers</label>
      <textarea id="sell-desc" placeholder="Description, photos, shipping policy…"></textarea>
      <button class="btn btn-primary big" id="do-sell" ${hasProfile ? '' : 'disabled style="opacity:0.5"'}>${hasProfile ? 'List on Marketplace' : 'Add PayPal handle in Settings first'}</button>
    `;
    body.appendChild(form);
    $('do-sell').onclick = () => {
      const name = $('sell-name').value.trim();
      const set = $('sell-set').value.trim();
      const cond = $('sell-cond').value.trim();
      const priceCents = Math.round((parseFloat($('sell-price').value) || 0) * 100);
      const acceptOffers = $('sell-offers').checked;
      const desc = $('sell-desc').value.trim();
      if (!name || !priceCents) return toast('Name and price required');
      if (!u.paypalHandle) return toast('Add PayPal handle in Settings first');
      const condObj = /[a-z]+\s*\d/i.test(cond) ? { kind: 'graded', grader: cond.split(/\s+/)[0].toUpperCase(), grade: cond.split(/\s+/)[1] } : { kind: 'raw', value: (cond || 'NM').toUpperCase() };
      Marketplace.createListing(currentUser.username, { name, set, condition: condObj, priceCents, acceptOffers, description: desc, sellerPaypal: u.paypalHandle });
      toast('Listed!'); marketTab = 'mine'; renderMarketplace();
    };
  }
  function renderSales(body) {
    const sales = Marketplace.getMySales(currentUser.username);
    if (!sales.length) { body.appendChild(create('div', 'empty-state', 'No sales yet.')); return; }
    sales.forEach(s => body.appendChild(makeSaleCard(s)));
  }
  function makeSaleCard(s) {
    const isSeller = s.seller === currentUser.username;
    const cond = s.condition.kind === 'graded' ? `${s.condition.grader} ${s.condition.grade}` : s.condition.value;
    const card = create('div', 'sale-card');
    const statusLabel = ({ pending_payment:'Awaiting payment', pending_shipping:'Awaiting ship', shipped:'Shipped', completed:'Completed' })[s.status] || s.status;
    let actions = ''; let flow = '';
    if (s.status === 'pending_payment') {
      if (isSeller) {
        flow = `<div class="sale-flow-step"><strong>Step 1 · Waiting on buyer</strong>Buyer (@${s.buyer}) sees your PayPal handle. Tap <em>Mark Payment Received</em> as soon as you confirm.</div>`;
        actions = `<button class="btn btn-primary" data-act="mark-paid" data-id="${s.id}">✓ Mark Payment Received</button>`;
      } else {
        const payUrl = Marketplace.buildPayPalUrl(s.sellerPaypal, s.agreedCents, `${s.cardName} (${s.cardSet})`);
        const hasShip = !!s.shippingAddress;
        flow = `<div class="sale-flow-step"><strong>Step 1 · Pay via PayPal G&amp;S</strong>Send <strong>${USD(s.agreedCents / 100)}</strong> to <strong>@${s.sellerPaypal}</strong> as Goods &amp; Services (NOT Friends &amp; Family).</div>
          ${hasShip ? '' : `<div class="sale-flow-step"><strong>Step 2 · Add your shipping address</strong>Seller only sees this after they confirm payment.</div>`}`;
        actions = `${payUrl ? `<a class="btn btn-cta" href="${payUrl}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">💰 Pay ${USD(s.agreedCents/100)} via PayPal G&amp;S ↗</a>` : ''}${!hasShip ? `<button class="btn btn-primary" data-act="add-ship" data-id="${s.id}">+ Add Shipping Address</button>` : ''}`;
      }
    } else if (s.status === 'pending_shipping') {
      if (isSeller) {
        flow = `<div class="sale-flow-step"><strong>Step 2 · Ship the card</strong>Buyer's address:<br><code style="display:block;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;margin-top:4px;white-space:pre-wrap">${s.shippingAddress || '(buyer has not added shipping yet)'}</code></div>`;
        actions = s.shippingAddress ? `<input class="ship-tracking" id="track-${s.id}" placeholder="Tracking # (optional)" /><button class="btn btn-primary" data-act="mark-shipped" data-id="${s.id}">📦 Mark Shipped</button>` : `<div style="font-size:12px;color:var(--warn);text-align:center">Waiting on buyer to add shipping.</div>`;
      } else {
        flow = `<div class="sale-flow-step"><strong>Step 2 · Seller will ship</strong>Payment confirmed. They'll mark shipped + add tracking next.</div>`;
      }
    } else if (s.status === 'shipped') {
      flow = `<div class="sale-flow-step"><strong>Shipped${s.tracking ? ` · #${s.tracking}` : ''}</strong>${isSeller ? 'Buyer will mark delivered when received.' : 'On its way.'}</div>`;
      if (!isSeller) actions = `<button class="btn btn-primary" data-act="mark-delivered" data-id="${s.id}">✓ Mark Delivered</button>`;
    } else {
      flow = `<div class="sale-flow-step"><strong>Completed ${new Date(s.deliveredAt || s.shippingMarkedAt).toLocaleDateString()}</strong></div>`;
    }
    card.innerHTML = `
      <div class="sale-head">
        ${s.image ? `<img src="${s.image}" alt="" />` : `<div style="width:56px;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
        <div class="si"><div class="sn">${s.cardName} ${isSeller ? '· SOLD' : '· BOUGHT'}</div><div class="ss">${s.cardSet} · ${cond} · ${isSeller ? '@' + s.buyer : '@' + s.seller}</div></div>
        <div style="text-align:right"><div class="sp">${USD(s.agreedCents / 100)}</div><div class="sale-status ${s.status}">${statusLabel}</div></div>
      </div>
      ${flow}<div class="sale-actions">${actions}</div>
    `;
    card.querySelectorAll('[data-act]').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const act = btn.dataset.act; const id = btn.dataset.id;
      if (act === 'mark-paid')      { if (Marketplace.markPaymentReceived(id, currentUser.username)) { toast('Payment confirmed'); renderMarketplace(); } }
      if (act === 'mark-shipped')   { const tr = ($('track-' + id)?.value || '').trim(); if (Marketplace.markShipped(id, currentUser.username, tr)) { toast('Marked shipped'); renderMarketplace(); } }
      if (act === 'mark-delivered') { if (Marketplace.markDelivered(id, currentUser.username)) { toast('Sale complete'); renderMarketplace(); } }
      if (act === 'add-ship')       { const addr = prompt('Shipping address (revealed to seller AFTER they confirm payment):', s.shippingAddress || ''); if (addr && Marketplace.attachBuyerShipping(id, currentUser.username, addr.trim())) { toast('Shipping saved'); renderMarketplace(); } }
    });
    return card;
  }
  function openListingDetail(l) {
    const m = $('add-modal');
    const cond = l.condition.kind === 'graded' ? `${l.condition.grader} ${l.condition.grade}` : l.condition.value;
    const isMine = l.seller === currentUser.username;
    const myOffer = Marketplace.myOfferOn(l, currentUser.username);
    const openOffers = (l.offers || []).filter(o => o.status === 'open' || o.status === 'countered');

    const buyerActions = isMine ? '' : `
      <button class="btn btn-cta big" data-act="bin">Buy It Now · ${USD(l.priceCents / 100)}</button>
      ${l.acceptOffers && !myOffer ? `<input id="ld-offer" type="number" min="1" step="0.50" placeholder="Your offer ($)" /><button class="btn btn-primary" data-act="offer">Send Offer</button>` : ''}
      ${myOffer ? `<div class="offer-row ${myOffer.status}"><span class="offer-by">Your offer · ${myOffer.status}${myOffer.sellerCounterCents ? ` · counter ${USD(myOffer.sellerCounterCents / 100)}` : ''}</span><span class="offer-amt">${USD(myOffer.amountCents / 100)}</span></div>` : ''}
    `;
    const sellerActions = !isMine ? '' : `<button class="btn danger" data-act="delete">Delete listing</button>`;
    const sellerOffersUI = (!isMine || !openOffers.length) ? '' : `
      <div class="cd-section"><h3>Open offers (${openOffers.length})</h3>${openOffers.map(o => `<div class="offer-row ${o.status}" data-oid="${o.id}"><span class="offer-by">@${o.buyer}${o.status === 'countered' ? ` · countered ${USD(o.sellerCounterCents/100)}` : ''}</span><span class="offer-amt">${USD(o.amountCents / 100)}</span><div class="offer-acts"><button class="ok" data-aoffer="${o.id}">✓</button><button class="no" data-doffer="${o.id}">✕</button><button class="ct" data-coffer="${o.id}">↺</button></div></div>`).join('')}</div>`;

    $('add-modal-body').innerHTML = `
      <h2>${l.name}</h2><p>${l.set} · ${cond}</p>
      ${l.image ? `<div style="text-align:center"><img src="${l.image}" style="max-height:220px;border-radius:10px;margin:8px auto;border:2px solid var(--gold)" alt="" /></div>` : ''}
      <div class="setting-row"><strong>Price</strong><span>${USD(l.priceCents / 100)} BIN</span></div>
      <div class="setting-row"><strong>Seller</strong><span>@${l.seller}</span></div>
      ${l.acceptOffers ? `<div class="setting-row"><strong>Offers</strong><span>Accepted</span></div>` : ''}
      <p style="font-size:12px;color:var(--text-dim);text-align:left;margin:6px 0">${l.description || ''}</p>
      <div class="paypal-notice">🛡️ PayPal Goods &amp; Services only. Seller's PayPal handle revealed only after they accept.</div>
      ${buyerActions}${sellerActions}${sellerOffersUI}
      <button class="btn ghost" id="ld-close">Close</button>
    `;
    m.classList.remove('hidden');
    $('ld-close').onclick = () => m.classList.add('hidden');
    $('add-modal-body').querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === 'bin')    { const sale = Marketplace.buyItNow(l.id, currentUser.username, Storage.loadUser(currentUser.username).paypalHandle); if (sale) { m.classList.add('hidden'); marketTab='sales'; renderMarketplace(); toast('Purchased — pay via PayPal G&S to complete'); } }
      if (act === 'offer')  { const v = parseFloat($('ld-offer').value); if (!v) return toast('Enter offer amount'); const o = Marketplace.makeOffer(l.id, currentUser.username, Math.round(v*100), Storage.loadUser(currentUser.username).paypalHandle); if (o) { toast('Offer sent'); m.classList.add('hidden'); renderMarketplace(); } }
      if (act === 'delete') { if (!confirm('Delete listing?')) return; Marketplace.deleteListing(currentUser.username, l.id); m.classList.add('hidden'); renderMarketplace(); }
    });
    $('add-modal-body').querySelectorAll('[data-aoffer]').forEach(btn => btn.onclick = () => { if (!confirm('Accept offer? Buyer will be shown your PayPal handle.')) return; const sale = Marketplace.acceptOffer(currentUser.username, l.id, btn.dataset.aoffer); if (sale) { m.classList.add('hidden'); marketTab='sales'; renderMarketplace(); toast('Offer accepted'); } });
    $('add-modal-body').querySelectorAll('[data-doffer]').forEach(btn => btn.onclick = () => { Marketplace.declineOffer(currentUser.username, l.id, btn.dataset.doffer); toast('Offer declined'); openListingDetail(Marketplace.getListing(l.id)); });
    $('add-modal-body').querySelectorAll('[data-coffer]').forEach(btn => btn.onclick = () => { const v = prompt('Counter at how much ($)?'); const cents = Math.round((parseFloat(v) || 0) * 100); if (!cents) return; Marketplace.counterOffer(currentUser.username, l.id, btn.dataset.coffer, cents); toast('Countered'); openListingDetail(Marketplace.getListing(l.id)); });
  }
  function openCreateListing(card, cond, marketValue) {
    marketTab = 'sell'; showScreen('marketplace-screen');
    setTimeout(() => {
      $('sell-name').value = card.name; $('sell-set').value = card.set;
      $('sell-cond').value = cond.kind === 'graded' ? `${cond.grader} ${cond.grade}` : cond.value;
      $('sell-price').value = marketValue ? marketValue.toFixed(2) : '';
    }, 100);
  }

  /* ============================================================ SETTINGS ============ */
  function openSettings() {
    const m = $('settings-modal');
    const u = Storage.loadUser(currentUser.username);
    $('set-username').textContent = currentUser.username + (currentUser.isAdmin ? ' (admin)' : '');
    $('set-cash-pct').value = u.offerCash;
    $('set-trade-pct').value = u.offerTrade;
    $('set-paypal-handle').value = u.paypalHandle || '';
    $('set-shipping').value = u.shippingAddress || '';
    $('set-ebay-key').value = u.keys?.ebayAppId || '';
    $('set-tcg-key').value = u.keys?.tcgKey || '';
    $('set-pp-key').value = u.keys?.paypalClientId || '';
    $('set-vendor').checked = !!u.isVendor;
    m.classList.remove('hidden');
  }
  function wireSettings() {
    $('settings-btn').onclick = openSettings;
    $('close-settings').onclick = () => $('settings-modal').classList.add('hidden');
    $('save-keys').onclick = () => {
      const u = Storage.loadUser(currentUser.username);
      u.offerCash = Math.max(10, Math.min(100, parseInt($('set-cash-pct').value) || 70));
      u.offerTrade = Math.max(10, Math.min(100, parseInt($('set-trade-pct').value) || 80));
      u.paypalHandle = $('set-paypal-handle').value.trim().replace(/^@/, '');
      u.shippingAddress = $('set-shipping').value.trim();
      u.isVendor = $('set-vendor').checked;
      u.keys = { ebayAppId: $('set-ebay-key').value.trim(), tcgKey: $('set-tcg-key').value.trim(), paypalClientId: $('set-pp-key').value.trim() };
      Storage.saveUser(currentUser.username, u); toast('Saved');
    };
    $('signout-btn').onclick = () => { Auth.signOut(); Watch.stopLoop(); currentUser = null; location.reload(); };
    $('reset-all').onclick   = () => { if (!confirm('Wipe ALL local data?')) return; Storage.wipeAll(); location.reload(); };
    $('export-data').onclick = async () => { const code = Storage.exportAll(); try { await navigator.clipboard.writeText(code); toast('Backup copied'); } catch { prompt('Copy backup code:', code); } };
    $('import-data').onclick = () => { const code = prompt('Paste backup code:'); if (!code) return; if (Storage.importAll(code.trim())) { toast('Imported — reloading'); setTimeout(() => location.reload(), 500); } else toast('Invalid'); };
    $('install-pwa').onclick = () => { if (window.__deferredInstall) window.__deferredInstall.prompt(); else toast('Use browser menu → Add to Home Screen'); };
    $('enable-notifications').onclick = async () => { const p = await Watch.requestPermission(); toast(p === 'granted' ? 'Alerts enabled' : 'Permission ' + p); };
  }

  /* ============================================================ SHOWCASE MODE ============ */
  function maybeShowcase() {
    const data = Share.parseShowcase(location.hash);
    if (!data) return false;
    // Hide chrome, show read-only showcase
    $('topbar').classList.add('hidden');
    $('bottom-nav').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('auth-screen').classList.add('hidden');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('showcase-screen').classList.add('active');
    const body = $('showcase-body');
    const value = data.cards.reduce((a, c) => a + (c.v || 0) * (c.q || 1), 0);
    const qty = data.cards.reduce((a, c) => a + (c.q || 1), 0);
    body.innerHTML = `
      <div class="portfolio-summary"><div class="ps-name">@${data.owner}'s ${data.icon || '📚'} ${data.name}</div>
        <div class="ps-value">${USD(value)}</div>
        <div class="ps-grid">
          <div class="ps-stat"><div class="v">${qty}</div><div class="l">Cards</div></div>
          <div class="ps-stat"><div class="v">${data.cards.length}</div><div class="l">Unique</div></div>
          <div class="ps-stat"><div class="v">${USD(value / qty)}</div><div class="l">Avg</div></div>
        </div></div>
      <p style="text-align:center;color:var(--text-dim);font-size:12px;margin:10px 0">Read-only showcase · shared by @${data.owner}</p>
      <div class="pf-grid" id="sc-grid"></div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary big" id="sc-exit">View my own collection →</button>
      </div>
    `;
    const grid = $('sc-grid');
    data.cards.forEach(c => {
      const isGraded = c.c?.kind === 'graded';
      const cond = isGraded ? `${c.c.grader} ${c.c.grade}` : c.c?.value;
      const cell = create('div', 'pf-cell');
      cell.innerHTML = `
        <div class="pf-img-wrap">
          ${isGraded ? `<div class="grade-slab"><span class="left">${c.c.grader}</span><span class="right">${c.c.grade}</span></div>` : ''}
          ${c.i ? `<img src="${c.i}" alt="" loading="lazy">` : `<div style="width:100%;height:100%;background:#0a0e1a;border-radius:8px"></div>`}
          ${(c.q || 1) > 1 ? `<div class="qty-badge">×${c.q}</div>` : ''}
        </div>
        <div class="pf-name">${c.n}</div>
        <div class="pf-set">${c.s || ''}</div>
        <div class="pf-rarity">${c.num || ''}</div>
        <div class="pf-cond">${cond || ''}</div>
        <div class="pf-bottom"><div class="pf-val">${USD((c.v || 0) * (c.q || 1))}</div></div>
      `;
      grid.appendChild(cell);
    });
    $('sc-exit').onclick = () => { Share.clearShowcase(); location.reload(); };
    return true;
  }

  /* ============================================================ WIRE / BOOT ============ */
  function wire() {
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen, false)));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
    document.querySelectorAll('[data-screen].quick-link').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen, true)));
    wireScan(); wireManual(); wireBuyList(); wirePortfolio(); wireMarketplace(); wireCustomers(); wireSettings();
  }
  function boot() {
    wire();
    if (maybeShowcase()) { document.getElementById('loading-screen')?.remove(); return; }
    const me = Auth.getCurrentUser();
    if (me) { currentUser = me; enterApp(); }
    else renderAuth();
  }

  return { boot, toast, showScreen };
})();

window.UI = UI;
