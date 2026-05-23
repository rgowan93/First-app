# HOUSE OF CARDS: Booster Tycoon

A free-to-play PWA card-collecting tycoon game. Rip packs, collect 30 original
cards across 6 rarities, level/evolve/fuse, battle the arena, climb the
leaderboard.

A **House of Cards** game — original IP, no third-party trademarks used.

## Run it

It's a static site. Any HTTP server works:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Then open `http://localhost:8000`. On mobile, open in Safari/Chrome and
"Add to Home Screen" — it installs as a PWA and plays offline.

## What's in the box

- **Tap-to-earn** loop with 8 tiers of tap-power upgrades
- **30 original cards** across 6 rarities (Common → Secret Rare)
- **Pack-ripping gacha** (4 pack tiers) with **pity counter**
- **Level up / evolve / fuse** cards
- **Auto-battle Arena** with leaderboard tiering
- **Daily quests**, **achievements**, **30-tier battle pass**
- **Lucky-spin wheel** (daily free spin + rewarded-ad spins)
- **Daily login streak** (7-day cycle)
- **Offline earnings** with ×2 watch-ad option
- **Boost system** (×2/×3/×5/×10 multipliers)
- **VIP subscription** ($9.99/mo) — ×2 earnings forever
- **Starter Pack** ($4.99) — high-conversion offer
- **Gem packs** ($0.99 → $99.99) with bonus tiers
- **No-ads** one-time purchase ($2.99)
- **Referral system** with shareable links + clipboard fallback
- **PWA install** — add to home screen, plays offline
- **Daily reminder notifications** (browser Notification API)
- **Procedural sound effects** (Web Audio API, no asset bloat)
- **Save / export / import / reset** progress

## Monetization plug-in points

Everything in the game treats Stripe (or RevenueCat for mobile) as a
black-box payment provider. To enable real payments:

1. Set up Stripe → Dashboard → Products. Copy the `price_xxx` IDs.
2. Plug the IDs into `js/payments.js → STRIPE_PRICE_IDS`.
3. Deploy a `/api/checkout` endpoint that creates a Stripe Checkout
   Session (see Stripe docs).
4. Set `window.__USE_REAL_PAYMENTS__ = true` in `index.html`.
5. Done — every `data-iap="xxx"` button in the UI now charges real cards.

## What I can't do for you (no backdoor exists)

- **Real payment processing** — requires a Stripe / Apple / Google merchant
  account in your name with banking details.
- **App-store distribution** — Apple ($99/yr) and Google Play ($25 one-time)
  developer accounts; identity-verified.
- **Real push notifications when the app is closed** — needs a VAPID push
  server. (In-session reminders work via Notification API.)
- **Real ads (AdMob / Unity Ads)** — ad-network account + SDK; iOS/Android
  for full revenue.
- **A real backend leaderboard** — needs a server. The current leaderboard
  is procedural, scaled around the player's progress.

## Self-advertising mechanisms baked in

- Sharable referral codes (clipboard + native Web Share API)
- "Invite for 250 💎" daily quest hook
- OpenGraph share metadata pre-filled
- Achievement screenshots auto-share-able via system share sheet
- Daily-reminder browser notifications drive return visits
- Battle Pass + streak design optimized for D7 retention
- Deep-link to your real House of Cards storefront on the Shop screen
  (`HOC_STORE_URL` in `js/data.js`)

## File layout

```
index.html              # markup + script tags
manifest.webmanifest    # PWA install manifest
sw.js                   # service worker (offline cache)
assets/
  icon.svg              # app icon
  logo-wordmark.svg     # House of Cards text logo
css/style.css           # all styling
js/
  storage.js            # save / load / export
  audio.js              # procedural sound effects
  data.js               # game balance + content
  payments.js           # Stripe-ready IAP handler (demo mode by default)
  social.js             # referrals / sharing / leaderboard
  notifications.js      # daily reminders
  game.js               # core game logic + state
  ui.js                 # DOM rendering + screens
  main.js               # bootstrap
```

## Customising your House of Cards branding

- `js/data.js` → `HOC_STORE_URL` — point to your real online store.
- `index.html` → splash screen / topbar wordmark — already uses the HoC
  text logo.
- `assets/icon.svg` — replace with your final icon once you have a
  Pokémon-Ball-free version of your full logo.

## Roadmap to $10K MRR

Read this section as a starting plan, not a guarantee.

1. **Soft launch** as PWA at a memorable URL (e.g. `play.houseofcards.shop`).
2. **Wire Stripe** in `js/payments.js`. Test with Stripe test cards.
3. **Hook AdMob/Unity Ads** for the rewarded-ad slots (boost, ×2 offline,
   +1 spin). Replace `showAd()` in `js/ui.js`.
4. **Submit to App Store / Play Store** via Capacitor/TWA wrappers
   (the PWA already supports this — wrap & sign for store distribution).
5. **Iterate on retention**: D1 / D7 / D30. Add seasonal events monthly.
6. **Drive installs**: leverage your existing House of Cards customer
   base (email, IG, TikTok). One referral conversion per active player
   gets you to viral growth.

At industry-standard mobile economics:
- ~3-5% paying-user conversion
- ~$15-30 LTV per paying user
- $10K MRR ≈ 600-1500 paying users
  ≈ 12,000-50,000 monthly active users
  ≈ several hundred installs/day sustained.
