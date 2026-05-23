# CARDBOARD HUNTERS

The intelligent TCG pricing & portfolio platform. A House of Cards product.

Snap any TCG card or sealed product → get every price on every major platform →
add to one of your portfolios → make 70/80% cash & trade offers → list on a
PayPal-G&S-protected marketplace → track customers, set targets, hunt deals.

## Run it

Any static HTTP server:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Or deploy GitHub Pages / Netlify / Vercel (drag-drop the folder).

## What's live (v0.2)

### Core
- **Multi-TCG search**: Pokémon (Pokemon TCG API), Magic (Scryfall), Yu-Gi-Oh
  (YGOPRODeck). Free, no key.
- **OCR scan** via Tesseract.js (lazy-loaded; ~30MB only when you tap Snap).
- **Manual search** with TCG filter + Sealed Product mode.
- **Condition picker**: NM / LP / MP / HP / DMG raw, or PSA / CGC / BGS / SGC /
  TAG / ACE × 1-10 graded.
- **Best estimated value**: weighted avg of TCGplayer + Cardmarket + grader/grade
  multipliers for slabs.
- **Live external links** that always work (legal, no scraping): eBay sold,
  eBay active, Alt, PriceCharting, TCGplayer, Cardmarket.

### Buy/Sell Intelligence
- **Recommendation engine** — every card gets a label and **% delta**:
  - `STRONG BUY` at ≤ -20% vs 30-day Cardmarket avg
  - `BUY` at ≤ -10%
  - `HOLD` within ±10%
  - `SELL` at ≥ +12%
  - `STRONG SELL` at ≥ +25%
- **Recommendation pill** on every portfolio card cell (color-coded).
- **Recs tab** in portfolio: sorted-by-strength list of active buy/sell signals.
- **Market Movers screen**: top 10 gainers, top 10 losers (today), plus
  buy-signal and sell-signal sections across all your portfolios.

### Portfolio (Collectr-grade)
- **Multiple named portfolios** with color + icon (Main Collection, BIG PAPPA,
  Investment Pile, etc.) — switch with header pills, view "All" combined.
- **Card grid** layout matches Collectr: image, name, set, rarity • number,
  condition • finish, qty, daily change ▲/▼ with $/%, total value.
- **Graded cards** rendered with PSA-style slab overlay.
- **Quantity stacking** — same card+condition stacks with ×N badge and weighted
  cost basis.
- **4 views**: Grid, List, Sets (with completion %), Recs (buy/sell signals).
- **6 action icons**: Movers · Trade · Bulk · Export (CSV) · Refresh (live
  prices) · Share (showcase URL + QR).
- **Sort**: value, recent, P/L, daily change %, name.
- **Filter** by name / set / condition.

### Trade Analyzer
- Build two stacks (your cards + their cards).
- Add from your portfolio or via card search.
- **Fairness verdict** with % delta: FAIR / SLIGHTLY IN YOUR FAVOR / LOPSIDED.

### Watchlist + Price Alerts
- Add any card → set buy target (alert when price drops to X) + sell target
  (alert when it rises to Y).
- App polls watched cards every ~5 min while open.
- **Browser notification** fires the moment a threshold is crossed.
- (For background alerts when app is closed: needs a push server.)

### Buy List (vendor buy-desk)
- Bulk-scan mode: each scan auto-adds NM to list with running total.
- Configurable cash (70% default) + trade (80% default) offer %.
- **Show Customer** modal: pass the phone to the customer.
- **Receipt** printable / shareable.
- **Move to Portfolio** with cost basis = cash offer.
- **Attach to Customer** to record the transaction in their ledger.

### Customers (vendor ledger)
- Add customer profiles (name, phone, email, notes).
- Track **store credit** balance in cents.
- Full **transaction history** per customer.
- Attach buy-list intakes to a customer with cash or trade-credit method.

### Marketplace (BIN + Offer, PayPal G&S handoff)
- List with Buy-It-Now + optional "Accept Offers".
- Buyers can BIN or send offer.
- Sellers Accept / Decline / Counter offers.
- **Sale state machine** (visible to both parties):
  - `pending_payment` → buyer sees seller's PayPal handle + deep-link to pay
  - Buyer attaches shipping address (hidden until seller marks paid)
  - Seller marks Payment Received → reveals shipping
  - `pending_shipping` → seller ships, adds tracking
  - `shipped` → buyer marks Delivered → `completed`
- **No money inside the app.** Every dollar settled via PayPal Goods &
  Services — buyer + seller protected by PayPal's own claims policy.

### Sealed EV
- Quick "is this booster box worth opening?" calculator.
- Inputs: packs/box, cards/pack, era, avg chase value, chase pull rate.
- Verdict vs box cost: 🟢 RIP / 🟡 break-even / 🔴 SEAL & HOLD.

### Public Showcase URLs (no backend)
- Tap **Share** in Portfolio → generates URL with the portfolio data encoded
  in the URL fragment.
- Includes a **QR code** for in-store display.
- Anyone opens the URL → sees a read-only showcase of your collection.
- Works with no server. Limited to ~250 cards/URL (URL fragment size).

### Other
- Local accounts with hashed passwords.
- **Admin bootstrapped** for `rgowan93` / `TESTER1` (change this in Settings).
- PWA installable, offline shell.
- CSV export of any portfolio.
- Full backup/restore via Settings.
- Bulk select cards in portfolio.

## Default login

- Username: `rgowan93`
- Password: `TESTER1`  (change immediately — see Settings)
- Or tap **Continue as guest**.

## API keys you can unlock later (in Settings)

| Feature | Key needed | Where |
|---|---|---|
| Live eBay active listings inside card detail | eBay OAuth app token | developer.ebay.com |
| Live eBay sold sales (last 90d) | eBay Marketplace Insights API approval | developer.ebay.com (apply) |
| TCGplayer API direct | TCGplayer partner key | tcgplayer.com → developers |

## What we can't do (genuine limits)

- **Alt.xyz proprietary graded predictions** — no public API. We deep-link to
  Alt and locally estimate using grader/grade multipliers.
- **Real cross-device sync** — accounts are local-only until a backend exists.
  Backup/restore JSON via Settings.
- **Background price alerts when app is closed** — needs a VAPID push server.
- **App Store / Play Store distribution** — needs developer accounts in your
  name. PWA can be wrapped via Capacitor / TWA.

## File layout

```
index.html              # markup + script tags
manifest.webmanifest    # PWA install
sw.js                   # service worker (offline shell)
assets/icon.svg
css/style.css           # all styling
js/
  storage.js            # multi-portfolio local persistence
  auth.js               # hashed-password local accounts
  apis.js               # Pokemon TCG / Scryfall / YGOPRODeck / eBay / pricing
  ocr.js                # Tesseract.js lazy-loader
  analytics.js          # recommendation engine, movers, sets, trade, EV
  portfolio.js          # multi-portfolio + buy-list ops
  marketplace.js        # BIN/Offer + sale state machine
  watchlist.js          # watched cards + browser-notif alerts
  customers.js          # vendor customer ledger
  share.js              # showcase URLs (fragment-encoded), QR, CSV
  ui.js                 # all DOM rendering + screen routing
  main.js               # bootstrap, service worker, install prompt
```
