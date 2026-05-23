# CARDBOARD HUNTERS

The intelligent TCG pricing & portfolio platform. A House of Cards product.

Snap any TCG card or sealed product → get every price on every major platform →
add to portfolio or buy-list → make 70%/80% cash & trade offers → list on a
PayPal-G&S-protected marketplace.

## Run it

Any static HTTP server works:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Or deploy as a static site (GitHub Pages, Netlify, Vercel — drag-drop).

## Default admin login

- Username: `rgowan93`
- Password: `TESTER1`  (change in Settings → Sign out → create fresh account, or rewrite `js/auth.js` `ADMIN_USERNAME` / hash)
- Or tap "Continue as guest" to skip auth.

## What it does today (live)

- **Multi-TCG search**: Pokémon (Pokemon TCG API), Magic (Scryfall), Yu-Gi-Oh (YGOPRODeck). All free, no key needed.
- **OCR card scan**: tap "Snap a Card" → Tesseract.js extracts the card name from your photo → searches across providers → pick the match.
- **Manual search**: by name, with TCG filter, including sealed product.
- **Condition selector**: NM / LP / MP / HP / DMG raw, or PSA / CGC / BGS / SGC / TAG / ACE graded.
- **Best-estimated value**: weighted average of TCGplayer + Cardmarket + (graded estimate) per condition.
- **Live external links** that always work (legal, no scraping):
  - eBay sold listings (filtered to TCG category + completed sold)
  - eBay active listings
  - Alt (graded estimator)
  - PriceCharting (historical charts)
  - TCGplayer product page
- **Portfolio**: add cards, track current value vs purchase price, grid/list/sets/movers views, sort & filter.
- **Buy list**: add cards while scanning a customer's stack → totals screen shows market value + cash offer (70% default) + trade credit (80% default) — pass the phone to the customer.
- **Marketplace**: browse / sell / my-listings, Buy-It-Now or 7-day auctions, all checkout via PayPal Goods & Services deep links (buyer + seller protected).
- **PWA**: install to home screen, works offline (cached shell), web-share for referrals.
- **Local accounts**: hashed passwords, per-user data. Admin bootstrapped for `rgowan93`.

## What still needs your action

These are unlocked by pasting an API key into Settings → API keys:

| Feature | What's needed | How to get |
|---|---|---|
| **Live eBay active listings inside the card detail** | eBay OAuth app token | developer.ebay.com → register app → use Browse API |
| **Live eBay sold sales (last 90d)** | eBay Marketplace Insights API approval | developer.ebay.com → apply (1-2 weeks; granted to high-volume sellers) |
| **TCGplayer API direct** | TCGplayer partner key | tcgplayer.com → developers → request access |
| **Real PayPal checkout instead of paypal.me link** | PayPal Partner API + Business merchant account | developer.paypal.com |

Once you have any of these, paste the key in **Settings → API keys** and the app will start using them automatically. No code changes needed.

## What we cannot do (genuine constraints, no workaround)

- **Alt.xyz proprietary graded predictions** — Alt has no public API. We deep-link to their site instead and estimate locally using grader/grade multipliers calibrated against typical sold ratios.
- **App Store / Play Store distribution** — requires Apple ($99/yr) / Google ($25 once) developer accounts in your name. PWA can be wrapped via Capacitor or TWA when you're ready.
- **Multi-device sync** — accounts are local-only until a backend exists. Backups via Settings → Export/Import.

## File layout

```
index.html              # markup + script tags
manifest.webmanifest    # PWA install manifest
sw.js                   # service worker (offline shell)
assets/
  icon.svg              # app icon
css/style.css           # all styling (dark theme, navy + gold)
js/
  storage.js            # local persistence (per-user namespaced)
  auth.js               # hashed-password local accounts
  apis.js               # Pokemon TCG / Scryfall / YGOPRODeck / eBay / pricing engine
  ocr.js                # Tesseract.js lazy-loader for card photo scan
  portfolio.js          # portfolio + buy-list logic
  marketplace.js        # marketplace listings + PayPal G&S deep links
  ui.js                 # DOM rendering + screen routing
  main.js               # bootstrap, service worker, PWA install
```

## Roadmap

1. Backend (Postgres + Node/Edge functions) so accounts sync across devices.
2. Real-time price refresh job (cron) so portfolio values auto-update overnight.
3. eBay Marketplace Insights → live "last 20 sales" panel on card detail.
4. PayPal Partner API integration → in-app checkout, automatic escrow release.
5. ML card identifier (replace OCR — match cards visually like Collectr does).
6. Price alerts (push notifications when a watched card crosses a threshold).
7. Bulk scan mode (rapid-fire scans for buy-list intake).
8. Profit/loss tax export.
9. Multi-user trade calculator (compare two stacks fairly).
10. Sealed product investment dashboard with cost-per-pack analysis.

— Built for House of Cards.
