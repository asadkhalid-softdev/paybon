const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,30));
async function setup(html,url='https://www.amazon.de/-/en/gp/cart/view.html',init=false,couponData={status:'login',coupons:[]}){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const messages=[];const listeners=[];
 w.CSS={escape:s=>s};w.chrome={runtime:{id:'test',getURL:f=>'chrome-extension://test/'+f,onMessage:{addListener:f=>listeners.push(f)},sendMessage:async msg=>{messages.push(msg);if(msg.type==='init')return{approved:init};if(msg.type==='approve')return{approved:true};if(msg.type==='reset')return{approved:false};return {store:{partnerId:"lp717463",name:"Amazon",domains:["amazon.de"]},...couponData};}}};
 // Capture the closed shadow root only in the test harness.
 const attach=w.Element.prototype.attachShadow;let shadow;w.Element.prototype.attachShadow=function(o){const result=attach.call(this,o);if(this.id==='paybon-root')shadow=result;return result;};
 w.eval(fs.readFileSync('extension/core.js','utf8'));w.eval(fs.readFileSync('extension/mascot.js','utf8'));w.eval(fs.readFileSync('extension/amazon.js','utf8'));await tick();
 const originalClose=dom.window.close.bind(dom.window);dom.window.close=()=>{w.dispatchEvent(new w.Event('pagehide'));originalClose();};
 return {dom,w,messages,listeners,shadow:()=>shadow};
}
test('purchase buttons and native disabled states remain untouched, including replacement controls',async()=>{
 const t=await setup('<input name="proceedToRetailCheckout" type="submit" value="Proceed to checkout"><button id="buy-now-button">Buy now</button><button id="native-disabled" disabled tabindex="2" aria-disabled="true">Unavailable</button>');
 try{
  const checkout=t.w.document.querySelector('input');assert(!checkout.disabled);assert(!checkout.hasAttribute('aria-disabled'));assert(!checkout.hasAttribute('tabindex'));
  assert(!t.w.document.querySelector('#buy-now-button').disabled);assert(t.w.document.querySelector('#native-disabled').disabled);assert.equal(t.w.document.querySelector('#native-disabled').getAttribute('tabindex'),'2');
  assert.equal(t.w.document.querySelectorAll('[data-paybon-blocked], [data-paybon-blocked-surface], [data-paybon-locked]').length,0);
  assert(!t.shadow().querySelector('[data-focus="approve"]'));assert(t.shadow().querySelector('aside').hidden);
  const replacement=t.w.document.createElement('button');replacement.id='placeOrder';replacement.textContent='Zahlungspflichtig bestellen';t.w.document.body.append(replacement);await tick();assert(!replacement.disabled);
  // Synthetic inert controls verify propagation without touching an actual Amazon purchase.
  const key=new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});assert(checkout.dispatchEvent(key));
  assert(!t.messages.some(m=>['init','approve','reset'].includes(m.type)));
 }finally{t.dom.window.close();}
});

test('PAYBACK-style cards preserve full offer copy and route German action buttons correctly',async()=>{
 const data={status:'ready',checkedAt:Date.now(),coupons:[{id:'123',label:'10FACH °P',description:'auf Produkte in der Kategorie Haushalt!*',validity:'Gültig bis 01.11.2026',status:'activated'},{id:'456',label:'8FACH °P',description:'auf Produkte in der Kategorie Küche!*',validity:'Gültig bis 01.11.2026',status:'not_activated'}]};
 const t=await setup('<button id="buy-now-button">Buy now</button>',undefined,false,data);
 try{const cards=[...t.shadow().querySelectorAll('.coupon')];assert.equal(cards.length,2);assert.equal(cards[0].querySelector('.coupon-description').textContent,data.coupons[0].description);assert.equal(cards[0].querySelector('img').getAttribute('src'),'chrome-extension://test/amazon-payback.png');assert(cards[0].querySelector('.coupon-check'));assert(!cards[1].querySelector('.coupon-check'));assert.equal(cards[1].querySelector('.coupon-action').textContent,'Jetzt aktivieren');cards[1].querySelector('.coupon-action').click();await tick();assert(t.messages.some(m=>m.type==='activate'&&m.id==='456'));assert(!t.w.document.querySelector('#buy-now-button').disabled);}finally{t.dom.window.close();}
});
test('sidebar reserves page space, releases it on minimize and reserves it again on reopen',async()=>{
 const t=await setup('<button id="buy-now-button">Buy now</button>');
 try{const html=t.w.document.documentElement;assert(!html.hasAttribute('data-paybon-sidebar-open'));t.shadow().querySelector('.launcher').click();assert(html.hasAttribute('data-paybon-sidebar-open'));t.shadow().querySelector('[aria-label="Minimize coupon panel"]').click();assert(!html.hasAttribute('data-paybon-sidebar-open'));assert(!t.w.document.querySelector('button').disabled);t.shadow().querySelector('.launcher').click();assert(html.hasAttribute('data-paybon-sidebar-open'));}finally{t.dom.window.close();}
});
test('fox billboard shows the detected count on normal pages and opens the sidebar',async()=>{
 const t=await setup('<p>Product listing</p>','https://www.amazon.de/s?k=coffee',false,{status:'ready',coupons:[{id:'1',label:'3FACH',description:'Offer',status:'not_activated',validity:''}],checkedAt:Date.now()});
 try{const b=t.shadow().querySelector('.paybon-mascot');assert(!b.hidden);assert.equal(b.querySelector('.paybon-count').firstChild.textContent,'1');assert(t.shadow().querySelector('aside').hidden);b.click();assert(!t.shadow().querySelector('aside').hidden);assert.equal(t.shadow().querySelector('.brand strong').textContent,'PayBon');assert(t.shadow().querySelector('.brand img').src.endsWith('/icon-48.png'));}finally{t.dom.window.close();}
});
test('mascot updates sign-in, zero and error states from background updates without affecting purchase controls',async()=>{
 const t=await setup('<button id="buy-now-button">Buy now</button>');
 try{for(const [state,text]of [[{status:'ready',coupons:[]},'0'],[{status:'login'},'!'],[{status:'error'},'?']]){for(const l of t.listeners)l({type:'couponsUpdated',result:state});assert.equal(t.shadow().querySelector('.paybon-count').firstChild.textContent,text);assert.equal(t.shadow().querySelector('.launcher').hidden,state.status==='ready');assert(!t.w.document.querySelector('#buy-now-button').disabled);}}finally{t.dom.window.close();}
});
test('extension reload is handled without an uncaught error or altering purchase controls',async()=>{
 const t=await setup('<button id="buy-now-button">Buy now</button>');
 try{t.w.chrome.runtime.sendMessage=()=>{throw new Error('Extension context invalidated.');};t.w.chrome.runtime.getURL=()=>{throw new Error('Extension context invalidated.');};t.shadow().querySelector('[data-focus="refresh"]').click();await tick();assert(t.shadow().textContent.includes('Refresh this page to reconnect'));assert(!t.w.document.querySelector('#buy-now-button').disabled);assert(!t.shadow().querySelector('aside').hidden);assert.equal(t.shadow().querySelector('[data-focus="refresh"]').textContent,'Reload page');assert(!t.w.document.querySelector('#buy-now-button').disabled);}finally{t.dom.window.close();}
});
test('a missing runtime ID is detected before touching invalidated Chrome API bindings',async()=>{
 const t=await setup('<button id="buy-now-button">Buy now</button>');let calls=0;
 try{delete t.w.chrome.runtime.id;t.w.chrome.runtime.sendMessage=()=>{calls++;throw new Error('Extension context invalidated.');};t.shadow().querySelector('[data-focus="refresh"]').click();await tick();assert.equal(calls,0);assert(t.shadow().textContent.includes('PayBon needs a page refresh'));assert.equal(t.shadow().querySelector('[data-focus="refresh"]').textContent,'Reload page');assert(!t.shadow().querySelector('[data-focus="approve"]'));assert(!t.w.document.querySelector('#buy-now-button').disabled);assert.equal(t.w.document.getElementById('paybon-root').dataset.paybonVersion,'1.3.1');}finally{t.dom.window.close();}
});

for(const [name,html,url]of [
 ['checkout','<span class="a-button"><input type="submit" name="proceedToRetailCheckout" value="Proceed to checkout"></span>','https://www.amazon.de/gp/cart/view.html'],
 ['Buy now','<span class="a-button"><button id="buy-now-button">Buy now</button></span>','https://www.amazon.de/dp/B123']
])test('mascot stays below '+name+' without changing purchase controls',async()=>{
 const t=await setup(html,url);
 try{
  const surface=t.w.document.querySelector('.a-button');surface.getBoundingClientRect=()=>({width:260,height:32});
  // Coupon updates trigger layout synchronization; no native purchase control is clicked.
  for(const listener of t.listeners)listener({type:'couponsUpdated',result:{status:'ready',coupons:[{id:'1',partnerId:'lp717463',label:'3FACH',status:'activated'}],checkedAt:Date.now()}});
  const host=surface.nextElementSibling;assert(host?.hasAttribute('data-paybon-mascot-host'));assert(t.shadow().querySelector('.launcher').hidden);
  const control=surface.querySelector('button,input');assert(!control.disabled);assert(!control.hasAttribute('aria-disabled'));assert(!control.hasAttribute('data-paybon-blocked'));
  host._paybonButton.click();assert(!t.shadow().querySelector('aside').hidden);assert.equal(surface.nextElementSibling,host);
  surface.remove();for(const listener of t.listeners)listener({type:'couponsUpdated',result:{status:'ready',coupons:[{id:'1',label:'3FACH',status:'activated'}]}});assert(!host.isConnected);assert(!t.shadow().querySelector('.launcher').hidden);
 }finally{t.dom.window.close();}
});

test('unknown websites and initial zero-coupon results render no mascot',async()=>{
 for(const data of [{status:'unsupported',coupons:[]},{status:'ready',coupons:[],store:{partnerId:'lp604887',name:'eBay'}}]){
  const t=await setup('<h1>Shop</h1>','https://ebay.de/',false,data);
  try{assert(!t.shadow()?.querySelector('.paybon-mascot')||t.shadow().querySelector('.paybon-mascot').hidden);assert.equal(t.w.document.querySelectorAll('[data-paybon-mascot-host]').length,0);assert(!t.w.document.documentElement.hasAttribute('data-paybon-sidebar-open'));}finally{t.dom.window.close();}
 }
});

test('non-Amazon sites display their own store identity and route the selected partner ID',async()=>{
 const data={status:'ready',store:{partnerId:'lp604887',name:'eBay'},checkedAt:Date.now(),coupons:[{id:'900003',partnerId:'lp604887',partnerName:'eBay',logoUrl:'https://assets.payback.de/static/mam/partner-logo/lp604887_43.png',label:'3FACH',description:'Online-Einkauf',status:'not_activated',validity:''}]};
 const t=await setup('<h1>Shop</h1>','https://www.ebay.de/',false,data);
 try{assert(t.shadow().textContent.includes('eBay coupons'));assert(t.shadow().querySelector('.paybon-mascot').getAttribute('aria-label').includes('eBay'));assert.equal(t.shadow().querySelector('.coupon-logo').alt,'eBay');t.shadow().querySelector('.coupon-action').click();await tick();assert(t.messages.some(m=>m.type==='activate'&&m.partnerId==='lp604887'&&m.id==='900003'));}finally{t.dom.window.close();}
});

test('back-forward cache restores mapped and unknown pages without errors or duplicate mascots',async()=>{
 for(const data of [{status:'unsupported',coupons:[]},{status:'ready',store:{name:'eBay',partnerId:'lp604887'},coupons:[{id:'1',partnerId:'lp604887',label:'3FACH',status:'activated'}]}]){
  const t=await setup('<p>Shop</p>','https://ebay.de/',false,data);const errors=[];t.w.addEventListener('error',e=>errors.push(e.error));
  try{for(let i=0;i<2;i++){t.w.dispatchEvent(new t.w.Event('pagehide'));t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();}assert.equal(errors.length,0);if(data.status==='ready')assert.equal(t.shadow().querySelectorAll('.launcher').length,1);else assert(!t.shadow());}finally{t.dom.window.close();}
 }
});

test('sidebar settings icon opens extension settings and displays automatic activation progress',async()=>{
 const t=await setup('<p>Store</p>');try{const settings=t.shadow().querySelector('[aria-label="Settings"]');assert(settings);settings.click();await tick();assert(t.messages.some(m=>m.type==='openSettings'));
 for(const listener of t.listeners)listener({type:'couponsUpdated',result:{status:'ready',coupons:[],autoJobs:[{store:{partnerId:'lp54',name:'dm'},status:'running',completed:12,total:50}]}});
 assert.equal(t.shadow().querySelector('progress').value,12);assert(t.shadow().querySelector('.auto-progress').textContent.includes('12 of 50'));
 }finally{t.dom.window.close();}
});

test('manually opened sidebar remains visible for unknown stores and zero-coupon results',async()=>{
 for(const data of [{status:'unsupported',coupons:[]},{status:'ready',store:{partnerId:'lp1',name:'Example'},coupons:[]}]){
  const t=await setup('<p>Store</p>','https://example.org/',false,data);
  try{
   for(const listener of t.listeners)listener({type:'show'});await tick();
   const panel=t.shadow().querySelector('aside');assert(!panel.hidden);assert(t.w.document.documentElement.hasAttribute('data-paybon-sidebar-open'));
   assert(t.shadow().querySelector('h1').textContent.includes('No coupons found for this store'));assert(t.shadow().querySelector('.launcher').hidden);
   if(data.status==='unsupported')assert(t.shadow().querySelector('.empty-state').textContent.includes('could not match'));
   t.shadow().querySelector('[data-focus="refresh"]').click();await tick();assert(!panel.hidden);
   for(const listener of t.listeners)listener({type:'couponsUpdated',result:data});assert(!panel.hidden);
   t.shadow().querySelector('[aria-label="Minimize coupon panel"]').click();assert(panel.hidden);
  }finally{t.dom.window.close();}
 }
});

test('Alnatura sidebar shows all six offers and identifies their in-store use',async()=>{
 const C=require('../extension/core.js');const coupons=C.sort(JSON.parse(fs.readFileSync('tests/fixtures/alnatura-coupons.json','utf8')).map(c=>C.normalize(c,'lp387')));
 const t=await setup('<p>Alnatura</p>','https://www.alnatura.de/',false,{status:'ready',store:{name:'Alnatura',partnerId:'lp387'},checkedAt:Date.now(),coupons});
 try{assert.equal(t.shadow().querySelectorAll('.coupon').length,6);assert.equal(t.shadow().querySelector('.paybon-count').firstChild.textContent,'6');assert(t.shadow().querySelector('.intro').textContent.includes('shopping in store'));assert.equal(t.shadow().querySelector('.coupon-logo').alt,'Alnatura');}finally{t.dom.window.close();}
});
