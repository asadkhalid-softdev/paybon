// PAYBACK's public directory provides the domain list used by its browser extension.
const fs = require('node:fs/promises');
const path = require('node:path');
const ENDPOINT = 'https://www.payback.de/onsflows/api/digital-shops';
const ROOT = path.resolve(__dirname, '..');

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase().replace(/^\*\./, '').replace(/^www\./, '');
  if (!host || /[\s/:?#@]/.test(host)) return null;
  try {
    const normalized = new URL(`https://${host}`).hostname;
    return normalized.includes('.') && /^[a-z0-9.-]+$/.test(normalized) ? normalized : null;
  } catch { return null; }
}

function buildMapping(shops, couponPartners = [], overrides = []) {
  const stores = new Map();
  for (const shop of shops) {
    const partnerId = shop.partner?.partnerShortName;
    if (!partnerId) continue;
    const entry = stores.get(partnerId) || { partnerId, name: shop.partner.partnerDisplayName, aliases: [], domains: [], sources: [] };
    if (!entry.aliases.includes(shop.partner.partnerDisplayName)) entry.aliases.push(shop.partner.partnerDisplayName);
    for (const info of shop.browserExtensionInfoListItem || []) {
      for (const raw of info.domainNameListItem || []) {
        const domain = normalizeDomain(raw);
        if (domain && !entry.domains.includes(domain)) entry.domains.push(domain);
      }
    }
    if (!entry.sources.includes(ENDPOINT)) entry.sources.push(ENDPOINT);
    if (shop.partnerVanityName) entry.paybackShopUrl = `https://www.payback.de/shop/${encodeURIComponent(shop.partnerVanityName)}`;
    stores.set(partnerId, entry);
  }
  for (const partner of couponPartners) {
    const entry = stores.get(partner.partnerId) || { partnerId: partner.partnerId, name: partner.name, aliases: [], domains: [], sources: [] };
    if (!entry.aliases.includes(partner.name)) entry.aliases.push(partner.name);
    entry.couponInventory = { total: partner.couponCount, active: partner.activeCouponCount, inactive: partner.inactiveCouponCount, acceptanceTypes: partner.acceptanceTypes };
    // Coupon buttons may point to PAYBACK or redirect services, not merchant websites.
    // Keep those as evidence only; never silently treat them as store domains.
    entry.couponLinkDomains = partner.directDomains;
    stores.set(partner.partnerId, entry);
  }
  for (const override of overrides) {
    const entry = stores.get(override.partnerId) || (override.name ? { partnerId: override.partnerId, name: override.name, aliases: [override.name], domains: [], sources: [] } : null);
    if (!entry) continue;
    for (const raw of override.domains || []) {
      const domain = normalizeDomain(raw);
      if (!domain) throw new Error(`Invalid verified domain for ${override.partnerId}`);
      if (!entry.domains.includes(domain)) entry.domains.push(domain);
    }
    entry.sources.push(override.source);
    entry.verifiedDomainEvidence = override.evidence;
    stores.set(override.partnerId, entry);
  }
  return [...stores.values()].map(entry => ({ ...entry, domains: entry.domains.sort(), baseUrls: entry.domains.sort().map(domain => `https://${domain}/`), status: entry.domains.length ? 'mapped' : 'unresolved' })).sort((a, b) => a.name.localeCompare(b.name, 'de') || a.partnerId.localeCompare(b.partnerId));
}

function findStoresByHostname(stores, hostname) {
  const host = normalizeDomain(hostname);
  return host ? stores.filter(store => store.domains.some(domain => host === domain || host.endsWith(`.${domain}`))) : [];
}

async function downloadShops(fetcher = fetch) {
  const shops = [];
  let total;
  for (let offset = 0; total === undefined || offset < total; offset += 200) {
    const response = await fetcher(`${ENDPOINT}?pageSize=200&pageOffset=${offset}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`PAYBACK directory returned HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page.digitalShopListItem) || !Number.isSafeInteger(page.totalResultSize) || page.totalResultSize < 0) throw new Error('Unrecognized PAYBACK directory response');
    total = page.totalResultSize;
    if (!page.digitalShopListItem.length && offset < total) throw new Error(`Incomplete directory at offset ${offset}`);
    shops.push(...page.digitalShopListItem);
  }
  if (new Set(shops.map(s => s.partner?.partnerShortName)).size !== total) throw new Error('Directory pagination was inconsistent; retry the export');
  return shops;
}

async function main() {
  const shops = await downloadShops();
  let couponSnapshot;
  try { couponSnapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'data/coupon-partners.snapshot.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const overrides = JSON.parse(await fs.readFile(path.join(ROOT, 'data/store-domain-overrides.json'), 'utf8'));
  const stores = buildMapping(shops, couponSnapshot?.partners, overrides);
  const output = { schemaVersion: 1, generatedAt: new Date().toISOString(), source: ENDPOINT, directoryStoreCount: shops.length, couponSnapshotAt: couponSnapshot?.capturedAt || null, notes: ['Domains come from PAYBACK browserExtensionInfoListItem, matched by partnerShortName; explicitly reviewed coupon destinations supplement missing domains.', 'HTTPS base URLs are constructed from domains; redirects and homepage availability are not verified.', 'Unresolved means no verified domain was available; names are never used to guess a website.', 'Coupon inventory is a point-in-time account snapshot, not the entire PAYBACK coupon catalog.'], stores };
  await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'data/store-mapping.json'), JSON.stringify(output, null, 2) + '\n');
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['partner_id', 'store_name', 'domains', 'base_urls', 'status', 'coupon_count'], ...stores.map(s => [s.partnerId, s.name, s.domains.join(';'), s.baseUrls.join(';'), s.status, s.couponInventory?.total || 0])];
  await fs.writeFile(path.join(ROOT, 'data/store-mapping.csv'), '\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n');
  console.log(JSON.stringify({ directoryStores: shops.length, totalPartners: stores.length, mapped: stores.filter(s => s.status === 'mapped').length, unresolved: stores.filter(s => s.status === 'unresolved').length, couponPartners: stores.filter(s => s.couponInventory).length, mappedCouponPartners: stores.filter(s => s.couponInventory && s.status === 'mapped').length }));
}

module.exports = { normalizeDomain, buildMapping, findStoresByHostname, downloadShops };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
