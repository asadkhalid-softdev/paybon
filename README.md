# PayBon

**PAYBACK coupons for the store you are visiting.**

PayBon is a Chrome extension that finds a store's PAYBACK coupons and displays them in a sidebar. The fox shows how many coupons are available. You can activate offers individually or enable optional automatic activation.

**Automatic activation is off by default.** PayBon never clicks checkout buttons or places an order.

## Requirements

- Google Chrome 120 or later on a desktop computer.
- A PAYBACK Germany account.
- PAYBACK sign-in in the same Chrome profile where PayBon is installed.

## Installation

1. Extract the supplied ZIP into a permanent folder. If you are using the source project, keep its `extension` folder in a permanent location.
2. Open `chrome://extensions` in your preferred Chrome profile.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**. Select the extracted `paybon` folder, or the source project's `extension` folder. The selected folder must contain `manifest.json`.
5. Check that **PayBon — PAYBACK coupon scout** is enabled. Open **Details → Site access** and select **On all sites** so PayBon can recognize supported stores automatically.
6. Open [PAYBACK coupons](https://www.payback.de/coupons) and sign in using the same Chrome profile.
7. Refresh shopping tabs that were already open. To keep PayBon visible in the toolbar, open Chrome's extensions menu and pin it.

No build tools or terminal commands are required to install the extension.

## Required and optional settings

| Setting | Recommended configuration |
| --- | --- |
| PayBon enable switch | **On** |
| Site access | **On all sites** for automatic store detection |
| PAYBACK account | Signed in within the same Chrome profile |
| Auto-Aktivierung | **Off by default**; enable only if you want automatic activation |
| Pin to toolbar | Optional, for quick access and the coupon count |

File access and notifications are not required. Incognito mode is not supported.

## Find and use coupons

Visit a supported store's website. When coupons are available, the fox and toolbar badge show the total number of active and inactive offers.

- Click the **fox** to open the sidebar.
- Alternatively, click PayBon's **toolbar icon → Open side bar**.
- Choose **Jetzt aktivieren** to activate a coupon.
- Choose **Online einlösen**, when available, to continue through PAYBACK's redemption link.
- Choose **Auf PAYBACK ansehen** for offers that need PAYBACK's own redemption flow.

Offers are sorted by their FACH multiplier. Some are valid only in physical stores or an app; always check the coupon's conditions. Following a link does not confirm that a purchase qualifies for points.

The sidebar reserves space beside the website. Close it with **×**. Purchase buttons keep their normal behavior.

### When no coupons are found

The fox stays hidden when there are no available coupons or the website is not recognized. You can still open the sidebar from the toolbar menu. It stays open and explains whether PAYBACK returned no offers or PayBon could not identify the store.

A sign-in prompt means PayBon needs your PAYBACK session. A connection error means the check failed; it is not confirmation that the store has no coupons. Use **Refresh** after signing in or reconnecting.

## Optional automatic activation

Open **toolbar icon → Settings**, or click the **gear icon** in the sidebar.

**Auto-Aktivierung is off on a new installation.** To use it, turn the switch on, then visit or refresh a supported store. PayBon activates that store's inactive coupons one at a time, including in-store offers, and skips coupons that are already active.

Progress appears in the sidebar and under **Recent activation** in Settings. Multiple tabs for the same store share one batch. You can continue browsing while it runs.

Turn the switch off to stop further activation requests. A request already in progress will finish; coupons already activated stay active. If PAYBACK rejects a request or requires sign-in, the batch pauses with an explanation and a **Retry remaining coupons** option. Special offers may require activation on PAYBACK itself.

Automatic activation never redeems coupons, redirects you to a store, or makes a purchase. Your saved preference is preserved when you update PayBon.

## Update PayBon

1. Replace the extension files with the new version, keeping them in the same folder.
2. Open `chrome://extensions` and click PayBon's circular **Reload** icon.
3. Refresh open shopping tabs. If Chrome asks you to review changed site permissions, review them before re-enabling PayBon.

The current release is **1.3.1**. Reloading the extension does not automatically refresh existing website tabs.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| No fox appears | Open the sidebar manually. The store may have no offers or may not be recognized. Check PayBon's site access and PAYBACK sign-in. |
| PAYBACK asks you to sign in again | Sign in within the Chrome profile running PayBon, then refresh the sidebar. |
| “Extension context invalidated” or “Reload page” | Refresh the shopping page after reloading or updating PayBon. |
| A coupon will not activate | Read the error, check your PAYBACK session and try the offer directly on PAYBACK if necessary. |
| The page layout looks unusual | Close the sidebar with **×** to restore the full website width. |

PayBon runs on HTTPS websites. It cannot add its sidebar to Chrome settings, the Chrome Web Store, local files or other restricted browser pages. Store coverage depends on verified PAYBACK partner mappings; not every website is supported.

## Privacy

PayBon has no analytics or account backend. It uses your existing PAYBACK sign-in and stores preferences, store mappings and temporary coupon data locally in Chrome. It does not store your password or read payment fields. Store-page URLs, basket contents and page text are not sent to a PayBon server.

Site access lets PayBon display its UI across supported websites and contact PAYBACK. A temporary inactive PAYBACK tab may appear while checking or activating coupons; PayBon closes only tabs it created for that purpose.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for source layout, tests, packaging and mapping maintenance. Mapping sources and coverage are documented in [data/README.md](data/README.md).

## License

PayBon's original code and documentation are available under the [MIT License](LICENSE), allowing commercial use, modification and redistribution while retaining the license notice. Bundled third-party assets are subject to separate rights; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
