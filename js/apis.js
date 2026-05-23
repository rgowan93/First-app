/* ============================================================
   APIs — unified card search + pricing across multiple providers.

   Live sources (no API key required, called directly from browser):
   - Pokemon TCG API (api.pokemontcg.io) — Pokemon cards + TCGplayer prices
   - Scryfall (api.scryfall.com) — Magic: The Gathering, full pricing
   - YGOPRODeck (db.ygoprodeck.com) — Yu-Gi-Oh + prices

   Deep-link / opt-in:
   - eBay sold listings — deep link to ebay.com/sch + LH_Sold=1 (legal, opens in new tab)
   - eBay Browse API — supported via app token (user provides in Settings)
   - TCGplayer direct — deep link to product page
   - Alt — deep link to graded estimator
   - PriceCharting — deep link

   All providers normalize to a `Card` shape:
   { id, tcg, name, set, number, image, rarity, types, releaseDate,
     prices: { tcgplayer: {...}, cardmarket: {...}, ebay: {...} },
     externalLinks: { tcgplayer, ebay_sold, ebay_active, alt, pricecharting } }
   ============================================================ */

const APIs = (function () {

  // ---- Helpers ----
  const J = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return r.json();
  };

  // Normalize a search term for URL params
  const enc = (s) => encodeURIComponent(s || '');

  // Condition multipliers used when grader/grade not relevant
  const CONDITION_MULT = { NM: 1.00, LP: 0.85, MP: 0.70, HP: 0.50, DMG: 0.30 };

  // Rough grader/grade multipliers vs. NM raw — calibrated against typical sold-comp ratios.
  // PSA/CGC tend to command similar multipliers; SGC/BGS very close; TAG/ACE slightly less liquid.
  const GRADER_BASE = { PSA: 1.0, CGC: 0.95, BGS: 0.95, SGC: 0.92, TAG: 0.80, ACE: 0.78 };
  const GRADE_MULT = {
    '10': 8.0, '9.5': 4.5, '9': 2.5, '8.5': 1.8, '8': 1.5,
    '7':  1.1, '6':  0.95, '5':  0.85, '4': 0.75, '3': 0.65, '2': 0.55, '1': 0.45,
  };

  // -------------------------------------------------------------
  // POKEMON TCG API
  // -------------------------------------------------------------
  async function searchPokemon(query, page = 1) {
    if (!query) return [];
    // Build a fuzzy name query — accept "Charizard Base Set" by tokenising
    const tokens = query.trim().split(/\s+/);
    let q = `name:"${tokens[0]}*"`;
    // Try common patterns: "Charizard" + extra → add as set name
    if (tokens.length > 1) {
      const rest = tokens.slice(1).join(' ');
      q += ` (set.name:"${rest}*" OR number:"${rest}")`;
    }
    const url = `https://api.pokemontcg.io/v2/cards?q=${enc(q)}&pageSize=20&page=${page}&orderBy=-set.releaseDate`;
    let data;
    try { data = await J(url); }
    catch (e) {
      // Fallback to simpler name-only search
      const url2 = `https://api.pokemontcg.io/v2/cards?q=name:"${enc(tokens[0])}*"&pageSize=20`;
      data = await J(url2);
    }
    return (data.data || []).map(normalizePokemon);
  }

  async function getPokemon(id) {
    const data = await J(`https://api.pokemontcg.io/v2/cards/${enc(id)}`);
    return normalizePokemon(data.data);
  }

  function normalizePokemon(c) {
    const tcg = c?.tcgplayer?.prices || {};
    const cm  = c?.cardmarket?.prices || {};
    const t = (k) => tcg[k] || null;
    const tcgPlayer = {
      normal: t('normal')?.market ?? t('normal')?.mid ?? null,
      holofoil: t('holofoil')?.market ?? null,
      reverseHolofoil: t('reverseHolofoil')?.market ?? null,
      foil: t('1stEditionHolofoil')?.market ?? null,
      lastUpdated: c?.tcgplayer?.updatedAt || null,
      productUrl: c?.tcgplayer?.url || null,
    };
    const cardMarket = {
      trend: cm.trendPrice ?? null,
      avg7:  cm.avg7 ?? null,
      avg30: cm.avg30 ?? null,
      lastUpdated: c?.cardmarket?.updatedAt || null,
      productUrl: c?.cardmarket?.url || null,
    };
    return {
      id: `pokemon:${c.id}`,
      tcg: 'pokemon',
      name: c.name,
      set: c.set?.name || '',
      setId: c.set?.id || '',
      number: c.number ? `${c.number}/${c.set?.printedTotal || c.set?.total || '?'}` : '',
      image: c.images?.small || c.images?.large,
      imageLarge: c.images?.large || c.images?.small,
      rarity: c.rarity || '',
      types: c.types || [],
      releaseDate: c.set?.releaseDate || '',
      prices: {
        tcgplayer: tcgPlayer,
        cardmarket: cardMarket,
        ebay: null,
      },
      externalLinks: {
        tcgplayer: tcgPlayer.productUrl,
        cardmarket: cardMarket.productUrl,
        ebay_sold: ebaySoldUrl(`${c.name} ${c.set?.name || ''} ${c.number || ''}`.trim()),
        ebay_active: ebayActiveUrl(`${c.name} ${c.set?.name || ''} ${c.number || ''}`.trim()),
        alt: altUrl(`${c.name} ${c.set?.name || ''}`),
        pricecharting: pcUrl(`${c.name} ${c.set?.name || ''}`),
      },
    };
  }

  // -------------------------------------------------------------
  // SCRYFALL (Magic)
  // -------------------------------------------------------------
  async function searchMTG(query) {
    if (!query) return [];
    const url = `https://api.scryfall.com/cards/search?q=${enc(query)}&order=released&dir=desc&unique=prints`;
    let data;
    try { data = await J(url); }
    catch { return []; }
    return (data.data || []).slice(0, 20).map(normalizeMTG);
  }
  async function getMTG(id) {
    const data = await J(`https://api.scryfall.com/cards/${enc(id)}`);
    return normalizeMTG(data);
  }
  function normalizeMTG(c) {
    const p = c.prices || {};
    return {
      id: `mtg:${c.id}`,
      tcg: 'mtg',
      name: c.name,
      set: c.set_name || '',
      setId: c.set || '',
      number: c.collector_number ? `${c.collector_number}` : '',
      image: c.image_uris?.small || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.small,
      imageLarge: c.image_uris?.large || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.large,
      rarity: c.rarity || '',
      types: c.type_line ? [c.type_line] : [],
      releaseDate: c.released_at || '',
      prices: {
        tcgplayer: {
          normal: p.usd ? parseFloat(p.usd) : null,
          holofoil: p.usd_foil ? parseFloat(p.usd_foil) : null,
          reverseHolofoil: null,
          foil: p.usd_etched ? parseFloat(p.usd_etched) : null,
          lastUpdated: null,
          productUrl: c.purchase_uris?.tcgplayer || null,
        },
        cardmarket: { trend: p.eur ? parseFloat(p.eur) : null, avg7: null, avg30: null, productUrl: c.purchase_uris?.cardmarket || null },
        ebay: null,
      },
      externalLinks: {
        tcgplayer: c.purchase_uris?.tcgplayer,
        cardmarket: c.purchase_uris?.cardmarket,
        ebay_sold: ebaySoldUrl(`${c.name} ${c.set_name} mtg magic`),
        ebay_active: ebayActiveUrl(`${c.name} ${c.set_name} mtg magic`),
        alt: altUrl(`${c.name} ${c.set_name}`),
        pricecharting: pcUrl(`${c.name} mtg`),
      },
    };
  }

  // -------------------------------------------------------------
  // YGOPRODeck (Yu-Gi-Oh)
  // -------------------------------------------------------------
  async function searchYGO(query) {
    if (!query) return [];
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${enc(query)}&num=20&offset=0`;
    let data;
    try { data = await J(url); }
    catch { return []; }
    return (data.data || []).slice(0, 20).map(normalizeYGO);
  }
  function normalizeYGO(c) {
    const sets = c.card_sets || [];
    const set = sets[0] || {};
    const prices = c.card_prices?.[0] || {};
    const market = prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) : null;
    return {
      id: `ygo:${c.id}`,
      tcg: 'ygo',
      name: c.name,
      set: set.set_name || '',
      setId: set.set_code || '',
      number: set.set_code || '',
      image: c.card_images?.[0]?.image_url_small,
      imageLarge: c.card_images?.[0]?.image_url,
      rarity: set.set_rarity || c.rarity || '',
      types: c.type ? [c.type] : [],
      releaseDate: '',
      prices: {
        tcgplayer: {
          normal: market,
          holofoil: null, reverseHolofoil: null, foil: null,
          lastUpdated: null,
          productUrl: prices.tcgplayer_price ? `https://www.tcgplayer.com/search/yugioh/product?q=${enc(c.name)}` : null,
        },
        cardmarket: { trend: prices.cardmarket_price ? parseFloat(prices.cardmarket_price) : null, avg7: null, avg30: null, productUrl: null },
        ebay: prices.ebay_price ? { recent: parseFloat(prices.ebay_price) } : null,
      },
      externalLinks: {
        tcgplayer: `https://www.tcgplayer.com/search/yugioh/product?q=${enc(c.name)}`,
        ebay_sold: ebaySoldUrl(`${c.name} yugioh`),
        ebay_active: ebayActiveUrl(`${c.name} yugioh`),
        alt: altUrl(`${c.name} yugioh`),
        pricecharting: pcUrl(`${c.name} yugioh`),
      },
    };
  }

  // -------------------------------------------------------------
  // SEALED PRODUCT (via Pokemon TCG products endpoint isn't great;
  // we use a known-pattern eBay search + TCGplayer link)
  // -------------------------------------------------------------
  async function searchSealed(query) {
    if (!query) return [];
    // Try Pokemon TCG API for set lookup; if it returns a set, use it.
    const cleaned = query.trim();
    // We'll synthesise "sealed product" cards as deep-link cards
    const productTypes = [
      { suffix: 'Booster Box', emoji: '📦' },
      { suffix: 'Elite Trainer Box', emoji: '🎁' },
      { suffix: 'Booster Bundle', emoji: '🥡' },
      { suffix: 'Collection Box', emoji: '📚' },
    ];
    return productTypes.map((p, i) => ({
      id: `sealed:${enc(cleaned)}:${i}`,
      tcg: 'sealed',
      name: `${cleaned} ${p.suffix}`,
      set: cleaned,
      number: '',
      image: null,
      imageEmoji: p.emoji,
      rarity: 'Sealed Product',
      types: ['Sealed'],
      releaseDate: '',
      prices: { tcgplayer: null, cardmarket: null, ebay: null },
      externalLinks: {
        tcgplayer: `https://www.tcgplayer.com/search/all/product?q=${enc(cleaned + ' ' + p.suffix)}`,
        ebay_sold: ebaySoldUrl(`${cleaned} ${p.suffix} sealed`),
        ebay_active: ebayActiveUrl(`${cleaned} ${p.suffix} sealed`),
        pricecharting: pcUrl(`${cleaned} ${p.suffix}`),
      },
    }));
  }

  // -------------------------------------------------------------
  // EBAY — deep links (always works) + Browse API (opt-in via key)
  // -------------------------------------------------------------
  function ebaySoldUrl(query) {
    // _sacat=2536 = Trading Card Games. LH_Sold=1 + LH_Complete=1 = sold completed listings.
    return `https://www.ebay.com/sch/i.html?_nkw=${enc(query)}&_sacat=2536&LH_Sold=1&LH_Complete=1&_sop=13`;
  }
  function ebayActiveUrl(query) {
    return `https://www.ebay.com/sch/i.html?_nkw=${enc(query)}&_sacat=2536&_sop=15`;
  }
  function altUrl(query) {
    return `https://www.alt.xyz/search?query=${enc(query)}`;
  }
  function pcUrl(query) {
    return `https://www.pricecharting.com/search-products?type=prices&q=${enc(query)}`;
  }
  function tcgPlayerSearch(query) {
    return `https://www.tcgplayer.com/search/all/product?q=${enc(query)}`;
  }

  // eBay Browse API (live active listings) — needs OAuth app token.
  // User pastes app credential in Settings; we encode and call Browse endpoint.
  async function fetchEbayActive(query, appToken) {
    if (!appToken) return null;
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${enc(query)}&category_ids=2536&limit=20&sort=newlyListed`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${appToken}` } });
      if (!r.ok) return null;
      const data = await r.json();
      return (data.itemSummaries || []).map(i => ({
        title: i.title,
        price: parseFloat(i.price?.value) || 0,
        currency: i.price?.currency || 'USD',
        url: i.itemWebUrl,
        image: i.image?.imageUrl,
        condition: i.condition || '',
        soldDate: null,
      }));
    } catch { return null; }
  }

  // -------------------------------------------------------------
  // PRICING ENGINE — combine all sources into a "best estimate"
  // -------------------------------------------------------------
  function rawConditionAdjust(basePrice, condition) {
    if (!basePrice) return null;
    const m = CONDITION_MULT[condition] ?? 1;
    return basePrice * m;
  }
  function gradedAdjust(basePrice, grader, grade) {
    if (!basePrice || !grader || !grade) return null;
    const g = GRADER_BASE[grader] ?? 0.85;
    const m = GRADE_MULT[grade]   ?? 1.0;
    return basePrice * g * m;
  }

  /* For a card + condition input, return { best, sources[], verdict } */
  function computePricing(card, cond) {
    const sources = [];
    const tcg = card.prices?.tcgplayer || {};
    const cm  = card.prices?.cardmarket || {};
    const ebay = card.prices?.ebay || {};
    const basePrices = [tcg.normal, tcg.holofoil, tcg.reverseHolofoil, tcg.foil].filter(v => v != null);
    const baseMarket = basePrices.length ? Math.max(...basePrices) : (cm.trend || cm.avg7 || cm.avg30 || ebay.recent || null);

    // TCGplayer
    if (tcg.normal != null || tcg.holofoil != null || tcg.reverseHolofoil != null) {
      const p = tcg.holofoil ?? tcg.normal ?? tcg.reverseHolofoil;
      sources.push({
        kind: 'live',
        name: 'TCGplayer',
        emoji: '🏷️',
        meta: `Market price · ${tcg.lastUpdated || 'recent'}`,
        price: cond.kind === 'raw' ? rawConditionAdjust(p, cond.value)
              : cond.kind === 'graded' ? gradedAdjust(p, cond.grader, cond.grade)
              : p,
        link: tcg.productUrl || card.externalLinks?.tcgplayer,
        linkLabel: 'View on TCGplayer',
      });
    }
    // Cardmarket
    if (cm.trend || cm.avg7 || cm.avg30) {
      const p = cm.trend || cm.avg7 || cm.avg30;
      sources.push({
        kind: 'live',
        name: 'Cardmarket (EU)',
        emoji: '🇪🇺',
        meta: cm.avg7 ? `7d avg · €${cm.avg7.toFixed(2)}` : 'Trend price',
        price: cond.kind === 'raw' ? rawConditionAdjust(p, cond.value)
              : cond.kind === 'graded' ? gradedAdjust(p, cond.grader, cond.grade)
              : p,
        link: cm.productUrl,
        linkLabel: 'View on Cardmarket',
        currency: '€',
      });
    }
    // YGOPRODeck baked-in eBay price
    if (ebay.recent) {
      sources.push({
        kind: 'live',
        name: 'eBay (cached)',
        emoji: '🟦',
        meta: 'Last sale (cached)',
        price: cond.kind === 'raw' ? rawConditionAdjust(ebay.recent, cond.value)
              : cond.kind === 'graded' ? gradedAdjust(ebay.recent, cond.grader, cond.grade)
              : ebay.recent,
      });
    }

    // ALT estimate for graded
    if (cond.kind === 'graded' && baseMarket != null) {
      const estimate = gradedAdjust(baseMarket, cond.grader, cond.grade);
      sources.push({
        kind: 'estimate',
        name: 'Estimated Graded Value',
        emoji: '📐',
        meta: `${cond.grader} ${cond.grade} · estimated from raw market`,
        price: estimate,
        link: card.externalLinks?.alt,
        linkLabel: 'Compare on Alt',
      });
    }

    // Deep-link sources (always present)
    sources.push({
      kind: 'deeplink',
      name: 'eBay — Last Sold',
      emoji: '🟦',
      meta: 'Tap to view real sold listings on eBay',
      price: null,
      link: card.externalLinks?.ebay_sold,
      linkLabel: 'Last Sold ↗',
      action: 'link',
    });
    sources.push({
      kind: 'deeplink',
      name: 'eBay — Active Listings',
      emoji: '🟦',
      meta: 'Tap to view current asks',
      price: null,
      link: card.externalLinks?.ebay_active,
      linkLabel: 'Active ↗',
      action: 'link',
    });
    if (cond.kind === 'graded') {
      sources.push({
        kind: 'deeplink', name: 'Alt — Pro estimator', emoji: '🅰️',
        meta: 'Tap for Alt\'s in-house graded estimate', price: null,
        link: card.externalLinks?.alt, linkLabel: 'Open Alt ↗', action: 'link',
      });
    }
    sources.push({
      kind: 'deeplink', name: 'PriceCharting', emoji: '📊',
      meta: 'Tap for historical price chart', price: null,
      link: card.externalLinks?.pricecharting, linkLabel: 'PriceCharting ↗', action: 'link',
    });

    // "Best" price — weighted average of live sources
    const liveWithPrice = sources.filter(s => s.kind === 'live' && s.price != null && s.price > 0);
    let best = null;
    if (liveWithPrice.length) {
      // TCGplayer weighted 2× over Cardmarket
      const weights = liveWithPrice.map(s => s.name.startsWith('TCG') ? 2 : 1);
      const sum = liveWithPrice.reduce((a, s, i) => a + s.price * weights[i], 0);
      const denom = weights.reduce((a, w) => a + w, 0);
      best = sum / denom;
    } else if (cond.kind === 'graded') {
      const estimateSrc = sources.find(s => s.kind === 'estimate' && s.price);
      if (estimateSrc) best = estimateSrc.price;
    }

    // Verdict heuristic: if input has purchasePrice in cond.compareTo, compare
    let verdict = null;
    if (best != null && cond.compareTo != null && cond.compareTo > 0) {
      const ratio = cond.compareTo / best;
      if (ratio <= 0.75) verdict = { tag: 'good', label: `GREAT BUY · ${Math.round((1-ratio)*100)}% below market` };
      else if (ratio <= 0.95) verdict = { tag: 'good', label: `Good buy · ${Math.round((1-ratio)*100)}% under` };
      else if (ratio <= 1.10) verdict = { tag: 'fair', label: 'Fair price' };
      else verdict = { tag: 'bad', label: `Overpriced · ${Math.round((ratio-1)*100)}% above market` };
    }

    return { best, sources, verdict };
  }

  // -------------------------------------------------------------
  // ROUTER — call the right provider based on TCG
  // -------------------------------------------------------------
  async function searchAll(query, tcg) {
    switch (tcg) {
      case 'pokemon': return searchPokemon(query);
      case 'mtg':     return searchMTG(query);
      case 'ygo':     return searchYGO(query);
      case 'sealed':  return searchSealed(query);
      default: {
        // Best effort: try all in parallel
        const [pk, mtg, ygo] = await Promise.all([
          searchPokemon(query).catch(() => []),
          searchMTG(query).catch(() => []),
          searchYGO(query).catch(() => []),
        ]);
        return [...pk, ...mtg, ...ygo].slice(0, 30);
      }
    }
  }

  async function getById(id) {
    const [tcg, rid] = (id || '').split(':');
    if (tcg === 'pokemon') return getPokemon(rid);
    if (tcg === 'mtg')     return getMTG(rid);
    if (tcg === 'ygo') {
      // YGO doesn't have a single-card endpoint; refetch by name
      const all = await searchYGO(rid);
      return all.find(c => c.id === id) || all[0];
    }
    return null;
  }

  /* Re-fetch a card and return new best estimated value for a condition */
  async function refreshValue(cardId, cond) {
    try {
      const card = await getById(cardId);
      if (!card) return null;
      const res = computePricing(card, cond);
      return { value: res.best, card };
    } catch { return null; }
  }

  /* Best price as plain number for a card (ignores condition multipliers) */
  function quickBest(card) {
    const tcg = card.prices?.tcgplayer || {};
    const cm  = card.prices?.cardmarket || {};
    return tcg.holofoil ?? tcg.normal ?? tcg.reverseHolofoil ?? tcg.foil ?? cm.trend ?? cm.avg7 ?? null;
  }

  return {
    searchAll, getById,
    searchPokemon, searchMTG, searchYGO, searchSealed,
    computePricing,
    refreshValue, quickBest,
    fetchEbayActive,
    ebaySoldUrl, ebayActiveUrl, altUrl, pcUrl, tcgPlayerSearch,
    CONDITION_MULT, GRADER_BASE, GRADE_MULT,
  };
})();
