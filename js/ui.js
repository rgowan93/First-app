/* ============================================================
   UI — DOM rendering + screen routing for Cardboard Hunters.
   ============================================================ */

const UI = (function () {
  const $ = (id) => document.getElementById(id);
  const create = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html !== undefined) el.innerHTML = html; return el; };

  // ---- App state (UI-level) ----
  let currentUser = null;
  let currentCard = null;
  let currentCondition = null;
  let currentResults = [];
  let backStack = [];
  let portfolioTab = 'grid';
  let marketTab = 'browse';

  const USD = (v) => v == null || isNaN(v) ? '—' : '$' + Number(v).toFixed(2);
  const SHORT_DATE = (ts) => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; };

  /* ---- TOAST ---- */
  let toastT = null;
  function toast(msg, ms = 2000) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---- SCREEN ROUTING ---- */
  function showScreen(id, push = true) {
    if (push && currentScreen() && currentScreen() !== id) backStack.push(currentScreen());
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
    if (id === 'portfolio-screen') renderPortfolio();
    if (id === 'buylist-screen') renderBuyList();
    if (id === 'marketplace-screen') renderMarketplace();
    if (id === 'trends-screen') renderTrends();
    if (id === 'scan-screen') { renderRecents(); updateBulkBar(); }
  }
  function currentScreen() {
    const a = document.querySelector('.screen.active');
    return a?.id || null;
  }
  function goBack() {
    if (backStack.length === 0) { showScreen('scan-screen', false); return; }
    const prev = backStack.pop();
    showScreen(prev, false);
  }

  /* ============================================================
     AUTH
     ============================================================ */
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
      const u = $('signup-user').value.trim();
      const e = $('signup-email').value.trim();
      const p = $('signup-pass').value;
      const r = await Auth.signUp(u, p, e);
      if (r.ok) { currentUser = r.user; toast('Account created'); enterApp(); }
      else toast(r.reason);
    };
    $('continue-guest').onclick = async () => {
      const r = await Auth.continueAsGuest();
      currentUser = r.user; toast('Welcome'); enterApp();
    };
  }

  function enterApp() {
    $('auth-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('topbar').classList.remove('hidden');
    $('bottom-nav').classList.remove('hidden');
    Marketplace.seedDemo();
    renderRecents();
    renderBuyBadge();
    showScreen('scan-screen', false);
  }

  /* ============================================================
     SCAN HOME
     ============================================================ */
  function renderRecents() {
    const wrap = $('recent-scans');
    const u = Storage.loadUser(currentUser.username);
    if (!u.recents.length) {
      wrap.innerHTML = `<div class="empty-state">No scans yet — tap "Snap a Card" or "Search by Name" to get started.</div>`;
      return;
    }
    wrap.innerHTML = '';
    u.recents.forEach(r => {
      const cell = create('div', 'recent-card');
      const imgSrc = r.image || (r.imageEmoji ? null : null);
      cell.innerHTML = `
        ${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : `<div style="width:100%;aspect-ratio:0.72;display:flex;align-items:center;justify-content:center;background:#0a0e1a;border-radius:6px;font-size:38px">${r.imageEmoji || '🃏'}</div>`}
        <div class="rc-name">${r.name}</div>
        ${r.value != null ? `<div class="rc-val">${USD(r.value)}</div>` : ''}
      `;
      cell.addEventListener('click', () => openCardById(r.id));
      wrap.appendChild(cell);
    });
  }

  /* ============================================================
     SCAN (photo)
     ============================================================ */
  let bulkMode = false;
  function wireScan() {
    $('scan-photo').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      await runScan(file);
      e.target.value = ''; // reset so picking same file again works
    });
    $('cancel-scan').onclick = () => { $('scan-modal').classList.add('hidden'); };
    $('bulk-toggle').addEventListener('change', (e) => {
      bulkMode = e.target.checked;
      $('bulk-bar').classList.toggle('hidden', !bulkMode);
      updateBulkBar();
    });
    $('bulk-done').onclick = () => { bulkMode = false; $('bulk-toggle').checked = false; $('bulk-bar').classList.add('hidden'); showScreen('buylist-screen'); };
  }
  function updateBulkBar() {
    if (!bulkMode) return;
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    $('bulk-total').textContent = USD(tots.market) + ` · ${tots.count} item${tots.count !== 1 ? 's' : ''}`;
  }

  async function runScan(file) {
    const m = $('scan-modal'); m.classList.remove('hidden');
    const url = URL.createObjectURL(file);
    $('scan-preview').src = url;
    $('scan-status').textContent = 'Loading OCR engine…';
    try {
      const { lines } = await OCR.recognize(file, (p) => {
        if (p.status === 'recognizing text' && p.progress != null) {
          $('scan-status').textContent = `Reading card… ${Math.round(p.progress * 100)}%`;
        } else if (p.status) {
          $('scan-status').textContent = p.status;
        }
      });
      const candidates = OCR.extractCandidates(lines);
      if (!candidates.length) {
        toast('Could not read text — try Search by Name');
        m.classList.add('hidden');
        URL.revokeObjectURL(url);
        return openManual('');
      }
      // Search top candidate across Pokemon → MTG → YGO
      $('scan-status').textContent = `Searching "${candidates[0]}"…`;
      let results = await APIs.searchAll(candidates[0]);
      // If nothing found, try next candidate
      let cIdx = 1;
      while (!results.length && cIdx < candidates.length) {
        $('scan-status').textContent = `Searching "${candidates[cIdx]}"…`;
        results = await APIs.searchAll(candidates[cIdx]);
        cIdx++;
      }
      m.classList.add('hidden');
      URL.revokeObjectURL(url);
      if (!results.length) {
        toast('No matches — refine the name');
        return openManual(candidates[0]);
      }
      currentResults = results;
      // BULK MODE: auto-pick best result, add NM to buy list, prompt to scan again
      if (bulkMode && results[0]) {
        const card = results[0];
        const cond = { kind: 'raw', value: 'NM' };
        const r = APIs.computePricing(card, cond);
        PortfolioMod.addToBuyList(currentUser.username, card, cond, r.best || 0);
        Storage.pushRecent(currentUser.username, { id: card.id, name: card.name, set: card.set, image: card.image, value: r.best });
        renderBuyBadge();
        renderRecents();
        updateBulkBar();
        toast(`Added: ${card.name} · ${USD(r.best || 0)}`);
        return;
      }
      $('results-search').value = candidates[0];
      showScreen('results-screen');
      renderResults(results, `OCR read: "${candidates[0]}" · ${results.length} matches`);
    } catch (err) {
      console.error(err);
      m.classList.add('hidden');
      URL.revokeObjectURL(url);
      toast('Scan failed — try Search by Name');
      openManual('');
    }
  }

  /* ============================================================
     MANUAL SEARCH
     ============================================================ */
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
    } catch (e) {
      renderResults([], `Search failed: ${e.message}`);
    }
  }

  /* ============================================================
     RESULTS
     ============================================================ */
  function renderResults(results, statusMsg = '') {
    $('results-status').textContent = statusMsg;
    const list = $('results-list');
    list.innerHTML = '';
    if (!results.length) {
      list.appendChild(create('div', 'empty-state', 'No matches — refine your search or pick a different TCG.'));
      return;
    }
    for (const c of results) {
      const row = create('div', 'result-card');
      const price = bestPriceFor(c);
      const imgSrc = c.image;
      row.innerHTML = `
        ${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy" />` : `<div style="width:70px;aspect-ratio:0.72;background:#0a0e1a;display:flex;align-items:center;justify-content:center;font-size:32px;border-radius:8px">${c.imageEmoji || '🃏'}</div>`}
        <div class="rc-info">
          <div class="rc-name">${c.name}</div>
          <div class="rc-set">${c.set}</div>
          <div class="rc-num">${c.number || ''} ${c.rarity ? '· ' + c.rarity : ''}</div>
        </div>
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

  function bestPriceFor(c) {
    const tcg = c.prices?.tcgplayer || {};
    const cm = c.prices?.cardmarket || {};
    return tcg.holofoil ?? tcg.normal ?? tcg.reverseHolofoil ?? cm.trend ?? cm.avg7 ?? null;
  }
  function tcgLabel(t) { return ({ pokemon: 'Pokémon', mtg: 'Magic', ygo: 'YGO', sealed: 'Sealed' })[t] || t; }

  /* ============================================================
     CARD DETAIL
     ============================================================ */
  async function openCardById(id) {
    showScreen('card-screen');
    $('card-detail').innerHTML = `<div class="empty-state"><div class="spinner" style="margin:30px auto"></div>Loading card…</div>`;
    try {
      const card = await APIs.getById(id);
      if (!card) throw new Error('not found');
      openCard(card);
    } catch (e) {
      $('card-detail').innerHTML = `<div class="empty-state">Couldn't reload that card. Search again from the home screen.</div>`;
    }
  }

  function openCard(card) {
    currentCard = card;
    currentCondition = currentCondition || { kind: 'raw', value: 'NM' };
    Storage.pushRecent(currentUser.username, {
      id: card.id, name: card.name, set: card.set, image: card.image, imageEmoji: card.imageEmoji,
      value: bestPriceFor(card),
    });
    showScreen('card-screen');
    renderCardDetail();
  }

  function renderCardDetail() {
    const card = currentCard;
    const cond = currentCondition;
    const result = APIs.computePricing(card, cond);
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
        <div class="best-rec">
          ${result.best != null ? `Avg of <strong>${result.sources.filter(s => s.kind === 'live').length}</strong> live source(s)` : 'No live price data — use deep links below'}
        </div>
        ${result.verdict ? `<div class="verdict ${result.verdict.tag}">${result.verdict.label}</div>` : ''}
      </div>

      <div class="cd-actions">
        <button class="btn btn-primary" id="add-portfolio">+ Portfolio</button>
        <button class="btn btn-cta" id="add-buylist">+ Buy List</button>
      </div>

      <div class="cd-section">
        <h3>Live prices</h3>
        <div id="live-sources"></div>
      </div>
      <div class="cd-section">
        <h3>External lookups</h3>
        <div id="deeplink-sources"></div>
      </div>
      <div class="cd-section" id="ebay-live-section" style="display:none">
        <h3>eBay — active listings</h3>
        <div id="ebay-live-list"></div>
      </div>
      <div class="cd-section">
        <h3>List on marketplace</h3>
        <button class="btn btn-primary" id="list-for-sale">Create listing → PayPal G&amp;S</button>
      </div>
      <div class="disclaimer">
        Prices aggregated from public APIs (Pokemon TCG API, Scryfall, YGOPRODeck) plus deep links to eBay sold/active,
        TCGplayer, Alt and PriceCharting. Graded-card estimates derive from raw market × grader/grade multipliers
        calibrated against typical sold ratios — refine with the deep-link sources for ground-truth.
      </div>
    `;

    const live = $('live-sources');
    result.sources.filter(s => s.kind === 'live' || s.kind === 'estimate').forEach(s => {
      live.appendChild(makeSourceRow(s));
    });
    if (!live.children.length) live.innerHTML = `<div class="empty-state" style="padding:12px">No live API prices for this card. Use the deep links below.</div>`;

    const deep = $('deeplink-sources');
    result.sources.filter(s => s.kind === 'deeplink').forEach(s => {
      deep.appendChild(makeSourceRow(s));
    });

    $('cd-img-wrap').onclick = () => openImageZoom(card.imageLarge || card.image);
    $('change-cond').onclick = () => openConditionPicker();
    $('add-portfolio').onclick = () => openAddToPortfolio(card, cond, result.best);
    $('add-buylist').onclick = () => {
      PortfolioMod.addToBuyList(currentUser.username, card, cond, result.best || 0);
      renderBuyBadge();
      toast(`Added to Buy List · ${USD(result.best)}`);
    };
    $('list-for-sale').onclick = () => openCreateListing(card, cond, result.best);

    // Optional: try live eBay Browse API if user has an app token
    const u = Storage.loadUser(currentUser.username);
    const tok = u.keys?.ebayAppId;
    if (tok) {
      APIs.fetchEbayActive(card.name + ' ' + card.set, tok).then((items) => {
        if (!items || !items.length) return;
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
    row.innerHTML = `
      <div class="src-logo">${s.emoji || '🔗'}</div>
      <div class="src-info">
        <div class="src-name">${s.name}</div>
        <div class="src-meta">${s.meta || ''}</div>
      </div>
      ${priceHTML}
    `;
    if (s.link && s.price != null) row.style.cursor = 'pointer';
    if (s.link && s.price != null) row.onclick = () => window.open(s.link, '_blank');
    return row;
  }

  function openImageZoom(src) {
    if (!src) return;
    $('image-modal').classList.remove('hidden');
    $('image-modal-body').innerHTML = `<img src="${src}" alt="" /><button class="btn ghost" id="img-close">Close</button>`;
    $('img-close').onclick = () => $('image-modal').classList.add('hidden');
  }

  /* ============================================================
     CONDITION PICKER
     ============================================================ */
  function openConditionPicker() {
    $('condition-modal').classList.remove('hidden');
    document.querySelectorAll('[data-cond]').forEach(b => {
      b.onclick = () => {
        currentCondition = { kind: 'raw', value: b.dataset.cond };
        $('condition-modal').classList.add('hidden');
        renderCardDetail();
      };
    });
    $('apply-graded').onclick = () => {
      const co = $('grader-co').value; const gr = $('grader-grade').value;
      if (!co || !gr) return toast('Pick grader + grade');
      currentCondition = { kind: 'graded', grader: co, grade: gr };
      $('condition-modal').classList.add('hidden');
      renderCardDetail();
    };
    // Close on background tap
    $('condition-modal').addEventListener('click', (e) => {
      if (e.target === $('condition-modal')) $('condition-modal').classList.add('hidden');
    }, { once: true });
  }

  /* ============================================================
     ADD TO PORTFOLIO
     ============================================================ */
  function openAddToPortfolio(card, cond, marketValue) {
    const m = $('add-modal');
    $('add-modal-body').innerHTML = `
      <h2>Add to Portfolio</h2>
      <p>${card.name} · ${card.set}</p>
      <div class="setting-row"><strong>Condition</strong><span>${cond.kind === 'graded' ? `${cond.grader} ${cond.grade}` : cond.value}</span></div>
      <div class="setting-row"><strong>Market value</strong><span>${USD(marketValue)}</span></div>
      <label style="font-size:12px;color:var(--text-dim);margin-top:6px">Your purchase price (optional)</label>
      <input id="ap-purchase" type="number" min="0" step="0.01" placeholder="e.g. 24.99" />
      <button class="btn btn-primary big" id="ap-confirm">Add</button>
      <button class="btn ghost" id="ap-cancel">Cancel</button>
    `;
    m.classList.remove('hidden');
    $('ap-confirm').onclick = () => {
      const pp = parseFloat($('ap-purchase').value) || 0;
      PortfolioMod.addToPortfolio(currentUser.username, card, cond, marketValue || 0, pp);
      toast('Added to portfolio');
      m.classList.add('hidden');
    };
    $('ap-cancel').onclick = () => m.classList.add('hidden');
  }

  /* ============================================================
     BUY LIST
     ============================================================ */
  function renderBuyBadge() {
    const u = Storage.loadUser(currentUser.username);
    const n = (u.buyList || []).length;
    const b = $('buylist-badge');
    b.textContent = n;
    b.classList.toggle('zero', n === 0);
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
    $('bl-clear').onclick = () => {
      if (!confirm('Clear the buy list?')) return;
      PortfolioMod.clearBuyList(currentUser.username);
      renderBuyList(); renderBuyBadge();
    };
    $('bl-show-customer').onclick = () => openCustomerView();
    $('bl-portfolio').onclick = () => {
      const tots = PortfolioMod.buyListTotals(currentUser.username);
      if (!confirm(`Move all ${tots.count} buy-list items to your Portfolio (cost basis = cash offer)?`)) return;
      PortfolioMod.moveBuyListToPortfolio(currentUser.username);
      renderBuyList(); renderBuyBadge();
      toast('Moved to portfolio');
    };
    $('cust-close').onclick = () => $('customer-modal').classList.add('hidden');
    $('cash-pct').addEventListener('input', updateCustomerLive);
    $('trade-pct').addEventListener('input', updateCustomerLive);
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
    u.offerCash = Math.max(10, Math.min(100, parseInt($('cash-pct').value) || 70));
    u.offerTrade = Math.max(10, Math.min(100, parseInt($('trade-pct').value) || 80));
    Storage.saveUser(currentUser.username, u);
    const tots = PortfolioMod.buyListTotals(currentUser.username);
    $('cust-count').textContent = tots.count;
    $('cust-market').textContent = USD(tots.market);
    $('cust-cash').textContent = USD(tots.cash);
    $('cust-trade').textContent = USD(tots.trade);
  }

  /* ============================================================
     PORTFOLIO
     ============================================================ */
  function renderPortfolio() {
    const sum = PortfolioMod.portfolioSummary(currentUser.username);
    $('portfolio-summary').innerHTML = `
      <div class="ps-label">Total portfolio value</div>
      <div class="ps-value">${USD(sum.value)}</div>
      <div class="ps-grid">
        <div class="ps-stat"><div class="v">${sum.count}</div><div class="l">Items</div></div>
        <div class="ps-stat"><div class="v">${USD(sum.cost)}</div><div class="l">Cost basis</div></div>
        <div class="ps-stat"><div class="v ${sum.pl >= 0 ? 'gain' : 'loss'}">${sum.pl >= 0 ? '+' : ''}${USD(sum.pl)} ${sum.cost > 0 ? '(' + sum.plPct.toFixed(0) + '%)' : ''}</div><div class="l">P/L</div></div>
      </div>
    `;
    document.querySelectorAll('[data-ptab]').forEach(b => {
      b.classList.toggle('active', b.dataset.ptab === portfolioTab);
      b.onclick = () => { portfolioTab = b.dataset.ptab; renderPortfolio(); };
    });
    const body = $('portfolio-body');
    body.innerHTML = '';
    const u = Storage.loadUser(currentUser.username);
    let items = [...u.portfolio];
    const q = $('portfolio-search').value.toLowerCase();
    if (q) items = items.filter(e => `${e.name} ${e.set} ${e.condition.value || ''} ${e.condition.grader || ''}`.toLowerCase().includes(q));
    const sort = $('portfolio-sort').value;
    items.sort((a, b) => {
      if (sort === 'value-desc') return (b.currentValue || 0) - (a.currentValue || 0);
      if (sort === 'value-asc')  return (a.currentValue || 0) - (b.currentValue || 0);
      if (sort === 'recent')     return (b.addedAt || 0) - (a.addedAt || 0);
      if (sort === 'pl')         return ((b.currentValue || 0) - (b.purchasePrice || 0)) - ((a.currentValue || 0) - (a.purchasePrice || 0));
      if (sort === 'name')       return a.name.localeCompare(b.name);
      return 0;
    });

    if (!items.length) { body.appendChild(create('div', 'empty-state', 'Your portfolio is empty. Scan a card and tap "+ Portfolio".')); return; }

    if (portfolioTab === 'grid') {
      const g = create('div', 'pf-grid');
      items.forEach(e => g.appendChild(makePortfolioCell(e)));
      body.appendChild(g);
    } else if (portfolioTab === 'list') {
      const l = create('div', 'pf-list');
      items.forEach(e => l.appendChild(makePortfolioRow(e)));
      body.appendChild(l);
    } else if (portfolioTab === 'sets') {
      const setMap = Object.entries(items.reduce((m, e) => { (m[e.set || 'Unknown'] = m[e.set || 'Unknown'] || []).push(e); return m; }, {})).sort((a, b) => b[1].reduce((s, e) => s + (e.currentValue || 0), 0) - a[1].reduce((s, e) => s + (e.currentValue || 0), 0));
      const sets = create('div');
      setMap.forEach(([set, arr]) => {
        const v = arr.reduce((s, e) => s + (e.currentValue || 0), 0);
        const pill = create('div', 'set-pill');
        pill.innerHTML = `<div><div class="sn">${set}</div><div class="ct">${arr.length} card${arr.length !== 1 ? 's' : ''}</div></div><div class="sv">${USD(v)}</div>`;
        sets.appendChild(pill);
      });
      body.appendChild(sets);
    } else if (portfolioTab === 'movers') {
      const movers = items.filter(e => e.history && e.history.length >= 2).map(e => {
        const first = e.history[0].v || 0;
        const last = e.history[e.history.length - 1].v || 0;
        return { ...e, change: last - first, changePct: first > 0 ? ((last - first) / first) * 100 : 0 };
      }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      if (!movers.length) { body.appendChild(create('div', 'empty-state', 'No price history yet — values update each time you re-open a card.')); return; }
      const l = create('div', 'pf-list');
      movers.forEach(m => l.appendChild(makePortfolioRow(m)));
      body.appendChild(l);
    }
  }
  function makePortfolioCell(e) {
    const cell = create('div', 'pf-cell');
    const pl = (e.currentValue || 0) - (e.purchasePrice || 0);
    const cond = e.condition.kind === 'graded' ? `${e.condition.grader} ${e.condition.grade}` : e.condition.value;
    cell.innerHTML = `
      ${e.image ? `<img src="${e.image}" alt="" loading="lazy" />` : `<div style="width:100%;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
      <div class="pf-name">${e.name}</div>
      <div class="pf-cond">${cond}</div>
      <div class="pf-val">${USD(e.currentValue)}</div>
      ${e.purchasePrice > 0 ? `<div class="pf-pl ${pl >= 0 ? 'gain' : 'loss'}">${pl >= 0 ? '+' : ''}${USD(pl)}</div>` : ''}
    `;
    cell.onclick = () => openCardById(e.cardId);
    return cell;
  }
  function makePortfolioRow(e) {
    const row = create('div', 'pf-row');
    const pl = (e.currentValue || 0) - (e.purchasePrice || 0);
    const cond = e.condition.kind === 'graded' ? `${e.condition.grader} ${e.condition.grade}` : e.condition.value;
    row.innerHTML = `
      ${e.image ? `<img src="${e.image}" alt="" loading="lazy" />` : `<div style="width:50px;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
      <div class="info"><div class="n">${e.name}</div><div class="s">${e.set} · ${cond}</div></div>
      <div class="price"><div class="v">${USD(e.currentValue)}</div>${e.purchasePrice > 0 ? `<div class="p ${pl >= 0 ? 'gain' : 'loss'}">${pl >= 0 ? '+' : ''}${USD(pl)}</div>` : ''}</div>
    `;
    row.onclick = () => openCardById(e.cardId);
    return row;
  }

  /* ============================================================
     MARKETPLACE
     ============================================================ */
  function renderMarketplace() {
    document.querySelectorAll('[data-mtab]').forEach(b => {
      b.classList.toggle('active', b.dataset.mtab === marketTab);
      b.onclick = () => { marketTab = b.dataset.mtab; renderMarketplace(); };
    });
    const body = $('marketplace-body');
    body.innerHTML = '';

    // sales-needs-attention badge
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

    if (!listings.length) {
      body.appendChild(create('div', 'empty-state', marketTab === 'mine' ? "You haven't listed anything yet. Tap 'Sell' above." : 'No listings match your filter.'));
      return;
    }
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
        <div class="listing-price">
          <div class="lp">${USD(l.priceCents / 100)}</div>
          <div class="lt bin">BIN</div>
          <div class="lp-paypal">PayPal G&amp;S</div>
        </div>
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
      <div class="paypal-notice">
        🛡️ All sales settled via <strong>PayPal Goods &amp; Services</strong>. Buyer + seller protected by PayPal's claim policy. No other payment methods.
        ${hasProfile ? '' : '<br><br>⚠️ Set your PayPal.me handle + ship-from address in <strong>Settings</strong> before listing.'}
      </div>
      <input id="sell-name" placeholder="Card name (e.g. Charizard)" />
      <input id="sell-set" placeholder="Set / version" />
      <div class="form-row">
        <input id="sell-cond" placeholder="Condition (e.g. NM, PSA 9)" />
        <input id="sell-price" type="number" min="0.50" step="0.01" placeholder="Price ($)" />
      </div>
      <label class="toggle-label" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);padding:6px 0">
        <input type="checkbox" id="sell-offers" checked /> Accept best offers
      </label>
      <textarea id="sell-desc" placeholder="Description: photos, shipping policy, condition notes…"></textarea>
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
      const condObj = /[a-z]+\s*\d/i.test(cond)
        ? { kind: 'graded', grader: cond.split(/\s+/)[0].toUpperCase(), grade: cond.split(/\s+/)[1] }
        : { kind: 'raw', value: (cond || 'NM').toUpperCase() };
      Marketplace.createListing(currentUser.username, {
        name, set, condition: condObj, priceCents,
        acceptOffers, description: desc,
        sellerPaypal: u.paypalHandle,
      });
      toast('Listed!');
      marketTab = 'mine';
      renderMarketplace();
    };
  }

  function renderSales(body) {
    const sales = Marketplace.getMySales(currentUser.username);
    if (!sales.length) { body.appendChild(create('div', 'empty-state', 'No sales yet. Sold listings + your purchases will show here.')); return; }
    sales.forEach(s => body.appendChild(makeSaleCard(s)));
  }

  function makeSaleCard(s) {
    const isSeller = s.seller === currentUser.username;
    const cond = s.condition.kind === 'graded' ? `${s.condition.grader} ${s.condition.grade}` : s.condition.value;
    const card = create('div', 'sale-card');
    const statusLabel = ({
      pending_payment: 'Awaiting payment',
      pending_shipping: 'Awaiting ship',
      shipped: 'Shipped',
      completed: 'Completed',
    })[s.status] || s.status;

    let actions = '';
    let flow = '';

    if (s.status === 'pending_payment') {
      if (isSeller) {
        flow = `
          <div class="sale-flow-step"><strong>Step 1 · Waiting on buyer</strong>
          Buyer (@${s.buyer}) was given your PayPal handle. Tap <em>Mark Payment Received</em> as soon as you confirm the PayPal G&amp;S payment.</div>`;
        actions = `<button class="btn btn-primary" data-act="mark-paid" data-id="${s.id}">✓ Mark Payment Received</button>`;
      } else {
        // Buyer view
        const payUrl = Marketplace.buildPayPalUrl(s.sellerPaypal, s.agreedCents, `${s.cardName} (${s.cardSet})`);
        const hasShip = !!s.shippingAddress;
        flow = `
          <div class="sale-flow-step"><strong>Step 1 · Pay via PayPal G&amp;S</strong>
          Send <strong>${USD(s.agreedCents / 100)}</strong> to <strong>@${s.sellerPaypal}</strong> as Goods &amp; Services (NOT Friends &amp; Family — you lose protection).</div>
          ${hasShip ? '' : `<div class="sale-flow-step"><strong>Step 2 · Add your shipping address</strong>
          The seller only sees this <em>after</em> they confirm payment.</div>`}
        `;
        actions = `
          ${payUrl ? `<a class="btn btn-cta" href="${payUrl}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">💰 Pay ${USD(s.agreedCents / 100)} via PayPal G&amp;S ↗</a>` : ''}
          ${!hasShip ? `<button class="btn btn-primary" data-act="add-ship" data-id="${s.id}">+ Add Shipping Address</button>` : ''}
        `;
      }
    } else if (s.status === 'pending_shipping') {
      if (isSeller) {
        flow = `
          <div class="sale-flow-step"><strong>Step 2 · Ship the card</strong>
          Buyer's address:<br>
          <code style="display:block;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;margin-top:4px;white-space:pre-wrap">${s.shippingAddress || '(buyer has not added shipping yet)'}</code></div>`;
        actions = s.shippingAddress
          ? `<input class="ship-tracking" id="track-${s.id}" placeholder="Tracking # (optional)" />
             <button class="btn btn-primary" data-act="mark-shipped" data-id="${s.id}">📦 Mark Shipped</button>`
          : `<div style="font-size:12px;color:var(--warn);text-align:center">Waiting on buyer to add shipping address.</div>`;
      } else {
        flow = `<div class="sale-flow-step"><strong>Step 2 · Seller will ship</strong>
          Payment confirmed by seller. They'll mark shipped + add tracking next.</div>`;
      }
    } else if (s.status === 'shipped') {
      flow = `<div class="sale-flow-step"><strong>Shipped${s.tracking ? ` · #${s.tracking}` : ''}</strong>
        ${isSeller ? 'Buyer will mark delivered once received.' : 'Card is on its way.'}</div>`;
      if (!isSeller) actions = `<button class="btn btn-primary" data-act="mark-delivered" data-id="${s.id}">✓ Mark Delivered</button>`;
    } else if (s.status === 'completed') {
      flow = `<div class="sale-flow-step"><strong>Completed ${new Date(s.deliveredAt || s.shippingMarkedAt).toLocaleDateString()}</strong>
        Thanks for trading on House of Cards Marketplace.</div>`;
    }

    card.innerHTML = `
      <div class="sale-head">
        ${s.image ? `<img src="${s.image}" alt="" />` : `<div style="width:56px;aspect-ratio:0.72;background:#0a0e1a;border-radius:6px"></div>`}
        <div class="si">
          <div class="sn">${s.cardName} ${isSeller ? '· SOLD' : '· BOUGHT'}</div>
          <div class="ss">${s.cardSet} · ${cond} · ${isSeller ? '@' + s.buyer : '@' + s.seller}</div>
        </div>
        <div style="text-align:right">
          <div class="sp">${USD(s.agreedCents / 100)}</div>
          <div class="sale-status ${s.status}">${statusLabel}</div>
        </div>
      </div>
      ${flow}
      <div class="sale-actions">${actions}</div>
    `;
    card.querySelectorAll('[data-act]').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const act = btn.dataset.act; const id = btn.dataset.id;
      if (act === 'mark-paid')      { if (Marketplace.markPaymentReceived(id, currentUser.username)) { toast('Payment confirmed — buyer can now reveal shipping'); renderMarketplace(); } else toast('Could not update'); }
      if (act === 'mark-shipped')   {
        const tr = ($('track-' + id)?.value || '').trim();
        if (Marketplace.markShipped(id, currentUser.username, tr)) { toast('Marked shipped'); renderMarketplace(); }
        else toast('Could not update');
      }
      if (act === 'mark-delivered') { if (Marketplace.markDelivered(id, currentUser.username)) { toast('Marked delivered — sale complete'); renderMarketplace(); } else toast('Could not update'); }
      if (act === 'add-ship') {
        const cur = s.shippingAddress || '';
        const addr = prompt('Shipping address (revealed to seller AFTER they confirm payment):', cur);
        if (addr && Marketplace.attachBuyerShipping(id, currentUser.username, addr.trim())) { toast('Shipping saved'); renderMarketplace(); }
      }
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
      ${l.acceptOffers && !myOffer ? `
        <input id="ld-offer" type="number" min="1" step="0.50" placeholder="Your offer ($)" />
        <button class="btn btn-primary" data-act="offer">Send Offer</button>` : ''}
      ${myOffer ? `<div class="offer-row ${myOffer.status}">
        <span class="offer-by">Your offer · ${myOffer.status}${myOffer.sellerCounterCents ? ` · counter ${USD(myOffer.sellerCounterCents / 100)}` : ''}</span>
        <span class="offer-amt">${USD(myOffer.amountCents / 100)}</span>
        ${myOffer.status === 'countered' ? `<button class="btn btn-primary" data-act="accept-counter" data-oid="${myOffer.id}">Accept Counter</button>` : ''}
      </div>` : ''}
    `;

    const sellerActions = !isMine ? '' : `
      <button class="btn danger" data-act="delete">Delete listing</button>
    `;

    const sellerOffersUI = (!isMine || !openOffers.length) ? '' : `
      <div class="cd-section"><h3>Open offers (${openOffers.length})</h3>
        ${openOffers.map(o => `
          <div class="offer-row ${o.status}" data-oid="${o.id}">
            <span class="offer-by">@${o.buyer}${o.status === 'countered' ? ` · countered ${USD(o.sellerCounterCents/100)}` : ''}</span>
            <span class="offer-amt">${USD(o.amountCents / 100)}</span>
            <div class="offer-acts">
              <button class="ok" data-aoffer="${o.id}">✓</button>
              <button class="no" data-doffer="${o.id}">✕</button>
              <button class="ct" data-coffer="${o.id}">↺</button>
            </div>
          </div>`).join('')}
      </div>
    `;

    $('add-modal-body').innerHTML = `
      <h2>${l.name}</h2>
      <p>${l.set} · ${cond}</p>
      ${l.image ? `<div style="text-align:center"><img src="${l.image}" style="max-height:220px;border-radius:10px;margin:8px auto;border:2px solid var(--gold)" alt="" /></div>` : ''}
      <div class="setting-row"><strong>Price</strong><span>${USD(l.priceCents / 100)} BIN</span></div>
      <div class="setting-row"><strong>Seller</strong><span>@${l.seller}</span></div>
      ${l.acceptOffers ? `<div class="setting-row"><strong>Offers</strong><span>Accepted</span></div>` : ''}
      <p style="font-size:12px;color:var(--text-dim);text-align:left;margin:6px 0">${l.description || ''}</p>
      <div class="paypal-notice">🛡️ PayPal Goods &amp; Services only. Seller's PayPal handle is revealed to you only <strong>after</strong> they accept your purchase or offer.</div>
      ${buyerActions}
      ${sellerActions}
      ${sellerOffersUI}
      <button class="btn ghost" id="ld-close">Close</button>
    `;
    m.classList.remove('hidden');
    $('ld-close').onclick = () => m.classList.add('hidden');

    $('add-modal-body').querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === 'bin') {
        const sale = Marketplace.buyItNow(l.id, currentUser.username, Storage.loadUser(currentUser.username).paypalHandle);
        if (sale) { m.classList.add('hidden'); marketTab = 'sales'; renderMarketplace(); toast('Purchased — pay via PayPal G&S to complete'); }
        else toast('Could not buy');
      }
      if (act === 'offer') {
        const v = parseFloat($('ld-offer').value);
        if (!v) return toast('Enter an offer amount');
        const cents = Math.round(v * 100);
        const o = Marketplace.makeOffer(l.id, currentUser.username, cents, Storage.loadUser(currentUser.username).paypalHandle);
        if (o) { toast('Offer sent'); m.classList.add('hidden'); renderMarketplace(); }
        else toast('Could not send offer');
      }
      if (act === 'delete') {
        if (!confirm('Delete this listing?')) return;
        Marketplace.deleteListing(currentUser.username, l.id);
        m.classList.add('hidden'); renderMarketplace();
      }
    });
    $('add-modal-body').querySelectorAll('[data-aoffer]').forEach(btn => btn.onclick = () => {
      if (!confirm('Accept this offer? Buyer will be shown your PayPal handle.')) return;
      const sale = Marketplace.acceptOffer(currentUser.username, l.id, btn.dataset.aoffer);
      if (sale) { m.classList.add('hidden'); marketTab = 'sales'; renderMarketplace(); toast('Offer accepted — sale created'); }
    });
    $('add-modal-body').querySelectorAll('[data-doffer]').forEach(btn => btn.onclick = () => {
      Marketplace.declineOffer(currentUser.username, l.id, btn.dataset.doffer);
      toast('Offer declined'); openListingDetail(Marketplace.getListing(l.id));
    });
    $('add-modal-body').querySelectorAll('[data-coffer]').forEach(btn => btn.onclick = () => {
      const v = prompt('Counter at how much ($)?');
      const cents = Math.round((parseFloat(v) || 0) * 100);
      if (!cents) return;
      Marketplace.counterOffer(currentUser.username, l.id, btn.dataset.coffer, cents);
      toast('Countered'); openListingDetail(Marketplace.getListing(l.id));
    });
  }

  function openCreateListing(card, cond, marketValue) {
    marketTab = 'sell';
    showScreen('marketplace-screen');
    setTimeout(() => {
      $('sell-name').value = card.name;
      $('sell-set').value = card.set;
      $('sell-cond').value = cond.kind === 'graded' ? `${cond.grader} ${cond.grade}` : cond.value;
      $('sell-price').value = marketValue ? marketValue.toFixed(2) : '';
    }, 100);
  }

  /* ============================================================
     TRENDS
     ============================================================ */
  function renderTrends() {
    const body = $('trends-body');
    const sum = PortfolioMod.portfolioSummary(currentUser.username);
    const u = Storage.loadUser(currentUser.username);
    body.innerHTML = `
      <div class="portfolio-summary">
        <div class="ps-label">Portfolio</div>
        <div class="ps-value">${USD(sum.value)}</div>
        <div class="ps-grid">
          <div class="ps-stat"><div class="v">${sum.count}</div><div class="l">Cards</div></div>
          <div class="ps-stat"><div class="v ${sum.pl >= 0 ? 'gain' : 'loss'}">${sum.pl >= 0 ? '+' : ''}${USD(sum.pl)}</div><div class="l">P/L</div></div>
          <div class="ps-stat"><div class="v">${USD(sum.cost)}</div><div class="l">Invested</div></div>
        </div>
      </div>
      <div class="cd-section"><h3>Top holdings</h3></div>
    `;
    const top = [...u.portfolio].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0)).slice(0, 8);
    if (!top.length) { body.appendChild(create('div', 'empty-state', 'Add cards to your Portfolio to see trends here.')); return; }
    const l = create('div', 'pf-list');
    top.forEach(e => l.appendChild(makePortfolioRow(e)));
    body.appendChild(l);

    // Set breakdown
    body.appendChild(create('div', 'cd-section', '<h3>Sets you collect</h3>'));
    const setMap = u.portfolio.reduce((m, e) => { (m[e.set || 'Unknown'] = m[e.set || 'Unknown'] || []).push(e); return m; }, {});
    const sortedSets = Object.entries(setMap).sort((a, b) => b[1].reduce((s, e) => s + (e.currentValue || 0), 0) - a[1].reduce((s, e) => s + (e.currentValue || 0), 0)).slice(0, 10);
    sortedSets.forEach(([set, arr]) => {
      const v = arr.reduce((s, e) => s + (e.currentValue || 0), 0);
      const pill = create('div', 'set-pill');
      pill.innerHTML = `<div><div class="sn">${set}</div><div class="ct">${arr.length} card${arr.length !== 1 ? 's' : ''}</div></div><div class="sv">${USD(v)}</div>`;
      body.appendChild(pill);
    });
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function openSettings() {
    const m = $('settings-modal');
    const u = Storage.loadUser(currentUser.username);
    $('set-username').textContent = currentUser.username + (currentUser.isAdmin ? ' (admin)' : '');
    $('set-cash-pct').value = u.offerCash;
    $('set-trade-pct').value = u.offerTrade;
    $('set-ebay-key').value = u.keys?.ebayAppId || '';
    $('set-tcg-key').value = u.keys?.tcgKey || '';
    $('set-pp-key').value = u.keys?.paypalClientId || '';
    $('set-paypal-handle').value = u.paypalHandle || '';
    $('set-shipping').value = u.shippingAddress || '';
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
      u.keys = {
        ebayAppId: $('set-ebay-key').value.trim(),
        tcgKey: $('set-tcg-key').value.trim(),
        paypalClientId: $('set-pp-key').value.trim(),
      };
      Storage.saveUser(currentUser.username, u);
      toast('Saved');
    };
    $('signout-btn').onclick = () => {
      Auth.signOut(); currentUser = null; location.reload();
    };
    $('reset-all').onclick = () => {
      if (!confirm('Wipe ALL local data (accounts, portfolio, listings)?')) return;
      Storage.wipeAll(); location.reload();
    };
    $('export-data').onclick = async () => {
      const code = Storage.exportAll();
      try { await navigator.clipboard.writeText(code); toast('Backup copied to clipboard'); }
      catch { prompt('Copy this backup code:', code); }
    };
    $('import-data').onclick = () => {
      const code = prompt('Paste backup code:'); if (!code) return;
      if (Storage.importAll(code.trim())) { toast('Imported — reloading'); setTimeout(() => location.reload(), 500); }
      else toast('Invalid backup code');
    };
    $('install-pwa').onclick = () => {
      if (window.__deferredInstall) window.__deferredInstall.prompt();
      else toast('Use your browser menu → Add to Home Screen');
    };
  }

  /* ============================================================
     PORTFOLIO SEARCH WIRING
     ============================================================ */
  function wirePortfolio() {
    $('portfolio-search').addEventListener('input', () => renderPortfolio());
    $('portfolio-sort').addEventListener('change', () => renderPortfolio());
  }

  /* ============================================================
     NAV / BOOT
     ============================================================ */
  function wire() {
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen, false)));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
    document.querySelectorAll('[data-screen].quick-link').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen, true)));
    wireScan();
    wireManual();
    wireBuyList();
    wirePortfolio();
    wireMarketplace();
    wireSettings();
  }

  function boot() {
    wire();
    const me = Auth.getCurrentUser();
    if (me) { currentUser = me; enterApp(); }
    else renderAuth();
  }

  return { boot, toast, showScreen };
})();

window.UI = UI;
