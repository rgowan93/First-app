/* ============================================================
   MARKETPLACE — Buy It Now + Make Offer, with PayPal G&S handoff.

   WORKFLOW (no money touches this app; PayPal handles the transaction):

   1. Seller lists with BIN price (and optionally "Accept Offers")
      → must have a PayPal.me handle and a shipping address on file.
   2. Buyer either:
        a. clicks "Buy It Now"  → creates a SALE, locks the listing
        b. clicks "Make Offer"  → adds an OFFER to the listing
   3. For offers: seller can Accept / Decline / Counter
        - Accept  → creates a SALE
        - Counter → updates the offer with sellerCounterCents
        - Decline → marks offer closed
   4. SALE STATE MACHINE (visible to both parties in "My Sales"):
        - pending_payment    : buyer sees seller's PayPal handle + deeplink
                               buyer pays via PayPal Goods & Services
        - pending_shipping   : (after seller marks "Payment Received")
                               seller now sees buyer's shipping address
        - shipped            : seller adds tracking; buyer sees tracking
        - completed          : buyer (or auto-time) marks delivered
   5. Either party can flag a dispute → PayPal G&S buyer protection
      handles the actual claim outside the app.

   This means we never need a Stripe/PayPal merchant API to ship —
   every dollar moves through PayPal G&S which already provides
   buyer + seller protection.
   ============================================================ */

const Marketplace = (function () {
  const MK_KEY    = 'cbh.market.v2';
  const SALES_KEY = 'cbh.sales.v1';

  function _readListings() { try { return JSON.parse(localStorage.getItem(MK_KEY)    || '[]'); } catch { return []; } }
  function _writeListings(a){ try { localStorage.setItem(MK_KEY,    JSON.stringify(a)); } catch {} }
  function _readSales()    { try { return JSON.parse(localStorage.getItem(SALES_KEY) || '[]'); } catch { return []; } }
  function _writeSales(a)  { try { localStorage.setItem(SALES_KEY, JSON.stringify(a)); } catch {} }

  function _rid(prefix = 'l') { return prefix + Math.random().toString(36).slice(2, 10); }

  /* Bootstrap demo listings the first run so browse isn't empty */
  function seedDemo() {
    if (_readListings().length > 0) return;
    const now = Date.now();
    const demos = [
      { name: 'Charizard',         set: 'Base Set Shadowless', tcg: 'pokemon', condition: { kind: 'graded', grader: 'PSA', grade: '9' },  priceCents: 850000, image: 'https://images.pokemontcg.io/base1/4.png',  seller: 'HouseOfCardsOfficial', sellerPaypal: 'houseofcardsofficial' },
      { name: 'Pikachu',           set: 'Base Set 1st Edition',tcg: 'pokemon', condition: { kind: 'raw',    value: 'NM' },                priceCents: 28000,  image: 'https://images.pokemontcg.io/base1/58.png', seller: 'HouseOfCardsOfficial', sellerPaypal: 'houseofcardsofficial' },
      { name: 'Umbreon V (Full Art)', set: 'Evolving Skies', tcg: 'pokemon', condition: { kind: 'raw',    value: 'NM' },                priceCents: 5600,   image: 'https://images.pokemontcg.io/swsh7/215.png', seller: 'TraderJake',           sellerPaypal: 'traderjake' },
      { name: 'Umbreon VMAX (Alt)',   set: 'Evolving Skies', tcg: 'pokemon', condition: { kind: 'graded', grader: 'CGC', grade: '10' },  priceCents: 95000,  image: 'https://images.pokemontcg.io/swsh7/215.png', seller: 'PullKingPSA',          sellerPaypal: 'pullkingpsa' },
      { name: 'Dark Magician',     set: 'LOB 1st Ed',         tcg: 'ygo',     condition: { kind: 'raw',    value: 'LP' },                priceCents: 12000,  image: null, seller: 'TraderJake', sellerPaypal: 'traderjake' },
    ];
    const seeded = demos.map((d, i) => ({
      id: 'demo' + i,
      ...d,
      cardId: null,
      description: 'Pack-fresh, stored in toploader since pull. Same-day shipping via USPS Ground Advantage. PayPal Goods & Services only — buyer protection on every order.',
      acceptOffers: true,
      status: 'active',
      createdAt: now - i * 86400000,
      offers: [],
    }));
    _writeListings(seeded);
  }

  /* ---- LISTINGS ---- */
  function listAll()              { return _readListings().filter(l => l.status !== 'sold'); }
  function listMine(username)     { return _readListings().filter(l => l.seller === username); }
  function getListing(id)         { return _readListings().find(l => l.id === id); }

  function createListing(seller, payload) {
    const all = _readListings();
    const entry = {
      id: _rid('l'),
      seller,
      sellerPaypal: payload.sellerPaypal || '',
      cardId: payload.cardId || null,
      tcg: payload.tcg || 'pokemon',
      name: payload.name,
      set: payload.set,
      condition: payload.condition,
      priceCents: payload.priceCents,
      image: payload.image || null,
      description: payload.description || '',
      acceptOffers: payload.acceptOffers !== false,
      status: 'active',
      createdAt: Date.now(),
      offers: [],
    };
    all.unshift(entry);
    _writeListings(all);
    return entry;
  }

  function deleteListing(seller, id) {
    const all = _readListings().filter(l => !(l.id === id && l.seller === seller && l.status !== 'sold'));
    _writeListings(all);
  }

  /* ---- OFFERS ---- */
  function makeOffer(listingId, buyer, amountCents, buyerPaypal) {
    const all = _readListings();
    const l = all.find(x => x.id === listingId);
    if (!l || l.status !== 'active' || !l.acceptOffers) return null;
    if (amountCents <= 0) return null;
    const offer = {
      id: _rid('o'),
      buyer, buyerPaypal: buyerPaypal || '',
      amountCents,
      sellerCounterCents: null,
      status: 'open',          // open / accepted / declined / countered / withdrawn
      createdAt: Date.now(),
    };
    l.offers = l.offers || [];
    l.offers.unshift(offer);
    _writeListings(all);
    return offer;
  }

  function acceptOffer(seller, listingId, offerId, buyerShipping) {
    const all = _readListings();
    const l = all.find(x => x.id === listingId);
    if (!l || l.seller !== seller || l.status !== 'active') return null;
    const o = (l.offers || []).find(x => x.id === offerId);
    if (!o || o.status !== 'open' && o.status !== 'countered') return null;
    o.status = 'accepted';
    // Decline siblings
    for (const other of l.offers) if (other !== o && other.status === 'open') other.status = 'declined';
    l.status = 'sold';
    _writeListings(all);
    return _createSale({
      listing: l, buyer: o.buyer, buyerPaypal: o.buyerPaypal,
      agreedCents: o.sellerCounterCents || o.amountCents,
    });
  }

  function declineOffer(seller, listingId, offerId) {
    const all = _readListings();
    const l = all.find(x => x.id === listingId);
    if (!l || l.seller !== seller) return false;
    const o = (l.offers || []).find(x => x.id === offerId);
    if (!o) return false;
    o.status = 'declined';
    _writeListings(all);
    return true;
  }

  function counterOffer(seller, listingId, offerId, counterCents) {
    const all = _readListings();
    const l = all.find(x => x.id === listingId);
    if (!l || l.seller !== seller) return false;
    const o = (l.offers || []).find(x => x.id === offerId);
    if (!o) return false;
    o.sellerCounterCents = counterCents;
    o.status = 'countered';
    _writeListings(all);
    return true;
  }

  /* ---- BUY IT NOW ---- */
  function buyItNow(listingId, buyer, buyerPaypal) {
    const all = _readListings();
    const l = all.find(x => x.id === listingId);
    if (!l || l.status !== 'active') return null;
    if (l.seller === buyer) return null;
    l.status = 'sold';
    _writeListings(all);
    return _createSale({
      listing: l, buyer, buyerPaypal,
      agreedCents: l.priceCents,
    });
  }

  /* ---- SALES ---- */
  function _createSale({ listing, buyer, buyerPaypal, agreedCents }) {
    const sales = _readSales();
    const sale = {
      id: _rid('s'),
      listingId: listing.id,
      seller: listing.seller,
      sellerPaypal: listing.sellerPaypal,
      buyer,
      buyerPaypal: buyerPaypal || '',
      cardName: listing.name,
      cardSet: listing.set,
      condition: listing.condition,
      image: listing.image,
      agreedCents,
      // workflow flags
      status: 'pending_payment',  // pending_payment → pending_shipping → shipped → completed
      paymentMarkedAt: null,
      shippingAddress: null,   // revealed to seller only after payment marked
      shippingMarkedAt: null,
      tracking: null,
      deliveredAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sales.unshift(sale);
    _writeSales(sales);
    return sale;
  }

  function getSale(id) { return _readSales().find(s => s.id === id); }
  function getMySales(username) {
    return _readSales().filter(s => s.seller === username || s.buyer === username);
  }

  function attachBuyerShipping(saleId, buyer, address) {
    // Buyer attaches shipping address. Stored encrypted-by-trust (no real encryption client-side)
    // and only revealed to seller once payment is marked.
    const sales = _readSales();
    const s = sales.find(x => x.id === saleId);
    if (!s || s.buyer !== buyer) return false;
    s.shippingAddress = address;
    s.updatedAt = Date.now();
    _writeSales(sales);
    return true;
  }

  function markPaymentReceived(saleId, seller) {
    const sales = _readSales();
    const s = sales.find(x => x.id === saleId);
    if (!s || s.seller !== seller || s.status !== 'pending_payment') return false;
    s.status = 'pending_shipping';
    s.paymentMarkedAt = Date.now();
    s.updatedAt = Date.now();
    _writeSales(sales);
    return true;
  }

  function markShipped(saleId, seller, tracking) {
    const sales = _readSales();
    const s = sales.find(x => x.id === saleId);
    if (!s || s.seller !== seller || s.status !== 'pending_shipping') return false;
    s.status = 'shipped';
    s.shippingMarkedAt = Date.now();
    s.tracking = tracking || '';
    s.updatedAt = Date.now();
    _writeSales(sales);
    return true;
  }

  function markDelivered(saleId, buyer) {
    const sales = _readSales();
    const s = sales.find(x => x.id === saleId);
    if (!s || s.buyer !== buyer || s.status !== 'shipped') return false;
    s.status = 'completed';
    s.deliveredAt = Date.now();
    s.updatedAt = Date.now();
    _writeSales(sales);
    return true;
  }

  /* ---- PAYPAL ---- */
  function buildPayPalUrl(handle, cents, note) {
    const amt = (cents / 100).toFixed(2);
    const username = (handle || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!username) return null;
    const noteParam = note ? `&note=${encodeURIComponent(note)}` : '';
    return `https://www.paypal.com/paypalme/${username}/${amt}USD${noteParam}`;
  }

  /* ---- BEST OFFER STATUS for a buyer on a listing ---- */
  function myOfferOn(listing, buyer) {
    return (listing.offers || []).find(o => o.buyer === buyer && (o.status === 'open' || o.status === 'countered' || o.status === 'accepted'));
  }

  return {
    seedDemo, listAll, listMine, getListing, createListing, deleteListing,
    makeOffer, acceptOffer, declineOffer, counterOffer,
    buyItNow,
    getSale, getMySales, attachBuyerShipping, markPaymentReceived, markShipped, markDelivered,
    buildPayPalUrl, myOfferOn,
  };
})();
