# Store domain mapping

PayBon uses PAYBACK's public digital-shop directory to associate website domains with partner IDs. Missing mappings can be supplemented with links verified on official PAYBACK partner pages or coupon destinations.

## Public source files

- `store-domain-overrides.json` records reviewed fallback domains, store names and supporting sources. These mappings work without any private coupon inventory.
- `../extension/stores.json` is the bundled startup mapping. It contains store identities and domains only, not account coupon counts or activation history.

The directory endpoint is `https://www.payback.de/onsflows/api/digital-shops?pageSize=200&pageOffset=0`. Domains appear in `browserExtensionInfoListItem[].domainNameListItem[]`; partner identity is `partner.partnerShortName`. Match by partner ID, not by display name.

## Generated local files

```powershell
node scripts/store-mapping.cjs
node scripts/bundle-stores.cjs
```

The first command downloads the public directory and creates `store-mapping.json` and `store-mapping.csv`. The second exports mapped records to the bundled startup file. Generated exports are ignored by Git because a local run may also incorporate a private coupon inventory.

`coupon-partners.snapshot.json` is an optional, private development input. It is not required, tracked or bundled. Never commit account inventories, authenticated page captures, browser session data or screenshots.

## Interpreting coverage

The online-shop directory does not include every in-store partner or expose every domain. Unknown records remain unresolved rather than receiving guessed URLs. An official domain association does not imply that every coupon is valid online, for every product or on every subdomain.

Base URLs are constructed using HTTPS; generated exports do not verify homepage availability or redirects. A coupon link may lead to PAYBACK, a tracking service or a gift-card provider, so it is not automatically treated as a merchant domain. Reviewed fallbacks document their evidence explicitly.
