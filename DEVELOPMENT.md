# Developing PayBon

The installable extension is in `extension/`. It runs without a build step or runtime npm dependencies. Node.js and npm are needed only for development checks, asset exports and packaging.

## Commands

Run these commands from the project root:

```powershell
npm install
npm test
npm run check
npm run package
```

Packaging uses Windows PowerShell's `Compress-Archive` and creates `dist/paybon-<version>.zip`. Load `extension/` for development or the extracted `paybon/` folder for a packaged installation. After changing runtime files, reload the extension in Chrome and refresh affected website tabs.

## Source layout

Before committing, stage only intended public files and run `npm run audit:staged`. It checks staged bytes for common credential patterns and accidentally tracked ignored files. Review its results; it is not a substitute for checking account data and test fixtures. Local account inventories, generated research exports, verification notes and screenshots must remain ignored.

| File | Responsibility |
| --- | --- |
| `extension/core.js` | Hostname matching and partner-filtered coupon parsing |
| `extension/background.js` | Store directory, per-partner coupon caches, activation queues and tab coordination |
| `extension/amazon.js` | Website-independent sidebar; retains its original filename |
| `extension/mascot.js` | Fox, coupon billboard and placement |
| `extension/payback.js` | PAYBACK requests using the current signed-in browser session |
| `extension/popup.*` | Toolbar menu |
| `extension/settings.*` | Preference UI and activation activity |
| `extension/stores.json` | Bundled startup mappings |

## Store mappings

The public PAYBACK digital-shop directory supplies partner IDs and browser-extension domains. It does not cover every in-store partner or expose every store's domain. Supplement missing domains only after verifying them against an official PAYBACK partner page or coupon destination. Record the source and evidence in `data/store-domain-overrides.json`.

```powershell
node scripts/store-mapping.cjs
node scripts/bundle-stores.cjs
```

The first command refreshes the public directory and rebuilds local JSON/CSV exports. It works without an account inventory; an optional private inventory can supplement a local research run. Generated exports and private inventories are ignored by Git. The second command bundles mapped store identities and domains only. Neither command activates coupons.

Runtime directory data is cached locally for 24 hours. Verified bundled fallbacks are merged into an unexpired cache so a release can add partners such as Alnatura immediately. Failed directory refreshes retain saved/bundled data and retry after 15 minutes. Coupons are cached separately by partner for two minutes in session storage; the sidebar's Refresh bypasses that cache.

PAYBACK can embed other partners' coupons in a response even when the URL contains a partner filter. Always filter parsed coupons by partner ID. Do not infer domains from display names, treat tracking-service domains as stores, or discard in-store coupons merely because the user is visiting a website.

## Automatic activation

The preference is enabled only when `preferences.autoActivate === true`; absent settings default to off. Updates preserve an explicit saved choice. Only trusted extension pages may change preferences.

Batches run sequentially and are deduplicated by partner. Their progress is checkpointed in session storage. Each activation checks current coupon state and requires confirmation before advancing. Disabling stops before the next request. A failure pauses the batch, with a 15-minute automatic retry delay and an explicit retry option in Settings. Recent activity is session-only.

Tests use anonymized fixtures and mocked account actions, including a 50-inactive-coupon dm scenario. Coupon identifiers and referral examples are synthetic. Do not enable the real account preference or perform real activations merely to run the automated suite. Never click a purchase control during verification.

## Visual fixtures

```powershell
node scripts/preview.cjs
```

Open `http://127.0.0.1:8787/?scenario=ebay`. Other scenarios include `amazon`, `alnatura`, `zero` and `unknown`. Settings and popup previews are under `/extension/settings.html` and `/extension/popup.html`. These fixtures use saved data and mocked Chrome messages; they perform no account actions.

`node scripts/brand-assets.cjs` exports toolbar/sidebar icons from `assets/extension-logo.png`. Mascot asset details are in `design/mascot.md`. Keep local verification notes and screenshots in ignored files; they can contain personal account information.
