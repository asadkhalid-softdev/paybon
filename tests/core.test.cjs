const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');const C=require('../extension/core.js');
test('all supported Amazon marketplaces, without lookalike hosts',()=>{
 for(const suffix of C.SUFFIXES){assert(C.amazonHost(`www.amazon.${suffix}`));assert(C.amazonHost(`amazon.${suffix}`));}
 for(const host of ['amazon.de.evil.org','evilamazon.de','payback.de','amazon.com.evil','amazon.invalid'])assert(!C.amazonHost(host));
 for(const p of ['/-/en/gp/cart/view.html','/checkout/p/123/spc','/gp/buy/spc/handlers/display.html','/cart'])assert(C.checkpoint(p));
 assert(!C.checkpoint('/gp/product/B123'));assert(!C.checkpoint('/orders'));
});
test('tracking requires a resolved HTTPS PAYBACK Amazon link',()=>{
 assert(C.tracked('https://www.amazon.de/b?tag=wwwpaybackde-21&ascsubtag=00000000-0000-4000-8000-000000000000!0!02_18004_001!0'));
 for(const u of ['javascript:alert(1)','http://www.amazon.de/b?tag=wwwpaybackde-21','https://amazon.de.evil.org/?tag=wwwpaybackde-21','https://amazon.de/?tag=wwwpaybackde-21&ascsubtag=[shopping.context]![category]'])assert(!C.tracked(u));
});
test('representative nine-coupon markup parses and sorts accurately',()=>{
 const html=fs.readFileSync('tests/fixtures/coupons.html','utf8');const doc=new JSDOM('<a href="/reach/api/logout">Abmelden</a>'+html).window.document;
 const data=C.parseDocument(doc,'lp717463');assert.equal(data.status,'ready');assert.equal(data.coupons.length,9);
 assert.deepEqual(data.coupons.map(c=>c.multiplier),[10,8,8,8,7,5,4,3,3]);
 assert.equal(data.coupons[0].id,'900002');assert.equal(data.coupons[0].status,'activated');assert.equal(data.coupons.filter(c=>c.status==='not_activated').length,8);
});
test('inert Flight JSON recovers redemption template without executing scripts',()=>{
 const obj={id:'123',partnerShortName:'lp717463',status:'activated',label:'10FACH °P',description:'Haushalt',buttonList:[{type:'online',action:'deeplink',action_url:'https://www.amazon.de/b?ascsubtag=[shopping.context]![category]'}]};
 const ignored={...obj,id:'456',partnerShortName:'lp54'};
 const flight='1:'+JSON.stringify({coupons:[obj,ignored]});
 const html='<a href="/reach/api/logout">Logout</a><script>self.__next_f.push('+JSON.stringify([1,flight])+')</script>';
 const data=C.parseDocument(new JSDOM(html).window.document,'lp717463');assert.equal(data.coupons.length,1);assert.equal(data.coupons[0].template,obj.buttonList[0].action_url);
});
test('login, unknown HTML and a recognized empty state are distinguished',()=>{
 const parse=html=>C.parseDocument(new JSDOM(html).window.document);
 assert.equal(parse('<a href="/login">Login</a>').status,'login');assert.equal(parse('<h1>Access denied</h1>').status,'error');
 assert.equal(parse('<a href="/reach/api/logout">Logout</a><div data-testid="coupons-partner-filter-select"></div>').status,'ready');
 assert.equal(parse('<a href="/reach/api/logout">Logout</a>').status,'error');
});
test('anonymous PAYBACK Next.js login redirects are recognized without executing scripts',()=>{
 for(const html of ['<meta http-equiv="refresh" content="1;url=https://www.payback.de/login?redirectUrl=coupons">','<template data-dgst="NEXT_REDIRECT;replace;https://www.payback.de/login?redirectUrl=coupons;307;"></template>'])assert.equal(C.parseDocument(new JSDOM(html).window.document).status,'login');
 assert.equal(C.parseDocument(new JSDOM('<meta http-equiv="refresh" content="1;url=https://evil.org/login">').window.document).status,'error');
});

test('representative multi-store data filters active/inactive coupons by partner ID, including dm IDs',()=>{
 const records=JSON.parse(fs.readFileSync('tests/fixtures/multi-store-coupons.json','utf8'));
 const flight='1:'+JSON.stringify({coupons:records});
 const html='<a href="/reach/api/logout">Logout</a><script>self.__next_f.push('+JSON.stringify([1,flight])+')</script>';
 for(const partner of ['lp717463','lp604887','lp54']){
  const d=new JSDOM(html);try{const parsed=C.parseDocument(d.window.document,partner);assert.equal(parsed.status,'ready');assert.equal(parsed.coupons.length,records.filter(c=>c.partnerShortName===partner).length);assert(parsed.coupons.every(c=>c.partnerId===partner));if(partner==='lp54')assert(parsed.coupons.some(c=>c.id.startsWith('dm_')));}finally{d.window.close();}
 }
 assert(C.couponUrl('lp54').includes('partnerId=lp54'));
 const d=new JSDOM(html);try{assert.equal(C.parseDocument(d.window.document,'lp999').coupons.length,0);}finally{d.window.close();}
});

test('all six representative Alnatura coupons are retained even though redemption is in-store only',()=>{
 const records=JSON.parse(fs.readFileSync('tests/fixtures/alnatura-coupons.json','utf8'));
 const html='<a href="/reach/api/logout">Logout</a><script>self.__next_f.push('+JSON.stringify([1,'1:'+JSON.stringify({coupons:records})])+')</script>';
 const d=new JSDOM(html);try{const result=C.parseDocument(d.window.document,'lp387');assert.equal(result.status,'ready');assert.equal(result.coupons.length,6);assert(result.coupons.every(c=>c.partnerId==='lp387'&&c.status==='not_activated'&&c.acceptanceType==='offline'));assert.deepEqual(result.coupons.map(c=>c.multiplier),[20,15,12,10,10,8]);}finally{d.window.close();}
});
