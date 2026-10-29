const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMapping, findStoresByHostname, downloadShops } = require('../scripts/store-mapping.cjs');

test('store mapping joins by partner ID across coupon states and keeps missing domains unresolved', () => {
  const shops = [{ partner: { partnerShortName: 'lp1', partnerDisplayName: 'Shop' }, browserExtensionInfoListItem: [{ domainNameListItem: ['WWW.Example.de', 'checkout.example.de'] }, { domainNameListItem: ['example.de'] }] }];
  const coupons = [{ partnerId: 'lp1', name: 'Different display name', couponCount: 3, activeCouponCount: 1, inactiveCouponCount: 2, acceptanceTypes: ['online'], directDomains: [] }, { partnerId: 'lp2', name: 'Shop', couponCount: 1, directDomains: ['tracking.example.org'] }];
  const stores = buildMapping(shops, coupons);
  const mapped = stores.find(s => s.partnerId === 'lp1');
  assert.deepEqual(mapped.domains, ['checkout.example.de', 'example.de']);
  assert.deepEqual(mapped.couponInventory, { total: 3, active: 1, inactive: 2, acceptanceTypes: ['online'] });
  assert.equal(stores.find(s => s.partnerId === 'lp2').status, 'unresolved');
  assert.equal(findStoresByHostname(stores, 'www.example.de')[0].partnerId, 'lp1');
  assert.equal(findStoresByHostname(stores, 'secure.example.de')[0].partnerId, 'lp1');
  for (const host of ['example.de.evil.org', 'fakeexample.de', 'https://example.de/', 'example.de@evil.org']) assert.equal(findStoresByHostname(stores, host).length, 0);
});

test('only reviewed overrides supplement missing domains', () => {
  const stores = buildMapping([], [{ partnerId: 'lp1', name: 'Shop', directDomains: ['redirect.example.org'] }], [{ partnerId: 'lp1', domains: ['example.de'], source: 'https://www.payback.de/coupons', evidence: 'Reviewed destination' }]);
  assert.deepEqual(stores[0].baseUrls, ['https://example.de/']);
  assert.equal(stores[0].status, 'mapped');
  assert.equal(stores[0].verifiedDomainEvidence, 'Reviewed destination');
});

test('reviewed in-store partners can be rebuilt from public sources without an account snapshot',()=>{
  const stores=buildMapping([],[],[{partnerId:'lp387',name:'Alnatura',domains:['alnatura.de'],source:'https://www.payback.de/partner/alnatura',evidence:'Official partner website link'}]);
  assert.equal(stores.length,1);assert.equal(stores[0].status,'mapped');assert.equal(stores[0].partnerId,'lp387');assert.deepEqual(stores[0].domains,['alnatura.de']);
});

test('directory export follows pagination and rejects duplicate or incomplete results', async () => {
  const urls = [];
  const fetcher = async url => { urls.push(url); const second = url.includes('pageOffset=200'); return { ok: true, json: async () => ({ totalResultSize: 201, digitalShopListItem: Array.from({ length: second ? 1 : 200 }, (_, i) => ({ partner: { partnerShortName: `lp${second ? 200 : i}` } })) }) }; };
  assert.equal((await downloadShops(fetcher)).length, 201);
  assert.equal(urls.length, 2);
  await assert.rejects(downloadShops(async () => ({ ok: true, json: async () => ({ totalResultSize: 1, digitalShopListItem: [] }) })), /Incomplete/);
  await assert.rejects(downloadShops(async () => ({ ok: true, json: async () => ({ totalResultSize: 2, digitalShopListItem: [{ partner: { partnerShortName: 'lp1' } }, { partner: { partnerShortName: 'lp1' } }] }) })), /inconsistent/);
});
