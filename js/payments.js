/* ============================================================
   PAYMENTS — production-ready handler interface.

   DEMO MODE: confirms via modal, no real charge.

   TO ENABLE REAL PAYMENTS:
   1. Sign up for Stripe (or RevenueCat for mobile)
   2. Create products + prices in your dashboard, copy price IDs
   3. Deploy a /api/checkout endpoint that creates a Stripe
      Checkout session and returns { url }
   4. Replace mockPurchase() with realPurchase() below

   The rest of the game doesn't care — it just calls
   Payments.purchase(sku) and awaits a success/cancel result.
   ============================================================ */

const Payments = (function () {
  const STRIPE_PRICE_IDS = {
    starter:    'price_starter_499',
    vip:        'price_vip_999_monthly',
    noads:      'price_noads_299',
    gem_pile:   'price_gem_pile_099',
    gem_bag:    'price_gem_bag_499',
    gem_box:    'price_gem_box_999',
    gem_chest:  'price_gem_chest_1999',
    gem_vault:  'price_gem_vault_4999',
    gem_galaxy: 'price_gem_galaxy_9999',
  };

  const SKU_TABLE = {
    starter:    { title: 'STARTER MEGA PACK', desc: '500💎 + 1M coins + 3 Elite Packs + 24h boost', price: '$4.99' },
    vip:        { title: 'VIP ELITE',         desc: '×2 earnings forever, +5 daily packs, exclusive cards', price: '$9.99 / mo' },
    noads:      { title: 'Remove Ads',        desc: 'No ads, ever',                                price: '$2.99' },
  };

  async function purchase(sku) {
    // Production: redirect to Stripe Checkout
    if (window.__USE_REAL_PAYMENTS__) return realPurchase(sku);
    return mockPurchase(sku);
  }

  async function realPurchase(sku) {
    const priceId = STRIPE_PRICE_IDS[sku];
    if (!priceId) return { ok: false, reason: 'unknown sku' };
    try {
      const resp = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, sku, playerId: window.GameState?.playerId }),
      });
      const { url } = await resp.json();
      // Open Stripe Checkout
      window.location.href = url;
      return { ok: true, redirected: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  function mockPurchase(sku) {
    return new Promise((resolve) => {
      const def = SKU_TABLE[sku] || gemPackInfo(sku);
      if (!def) return resolve({ ok: false, reason: 'unknown' });

      const m = document.getElementById('purchase-modal');
      document.getElementById('purchase-title').textContent = def.title;
      document.getElementById('purchase-desc').textContent = def.desc;
      document.getElementById('purchase-price').textContent = def.price;
      m.classList.remove('hidden');

      const confirm = document.getElementById('confirm-purchase');
      const cancel = document.getElementById('cancel-purchase');
      const onConfirm = () => { cleanup(); m.classList.add('hidden'); resolve({ ok: true }); };
      const onCancel  = () => { cleanup(); m.classList.add('hidden'); resolve({ ok: false, reason: 'cancelled' }); };
      function cleanup() {
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
      }
      confirm.addEventListener('click', onConfirm);
      cancel.addEventListener('click', onCancel);
    });
  }

  function gemPackInfo(sku) {
    const p = GEM_PACKS.find(g => g.id === sku);
    if (!p) return null;
    const bonus = p.bonus ? ` (+${p.bonus}% bonus)` : '';
    return { title: 'Gem Pack', desc: `${p.amount.toLocaleString()} 💎${bonus}`, price: p.price };
  }

  return { purchase, SKU_TABLE };
})();
