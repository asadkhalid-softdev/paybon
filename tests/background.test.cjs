const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const C=require('../extension/core.js');
const seeds=[{partnerId:'lp717463',name:'Amazon',domains:['amazon.de'],verifiedFallback:true},{partnerId:'lp604887',name:'eBay',domains:['ebay.de']},{partnerId:'lp54',name:'dm',domains:['dm.de'],verifiedFallback:true}];
function worker({stores=seeds,cachedStores=stores,freshDirectory=true,remoteFails=false,fastAuto=false,noPaybackTab=false}={}){
 const store={},local={};let listener,updated;let clock=1000000;let result=msg=>({status:'ready',coupons:[{id:'123',partnerId:msg.partnerId,status:'not_activated',multiplier:3}]});
 if(freshDirectory)local.storeDirectory={until:clock+86400000,stores:cachedStores};
 const tabs=new Map(noPaybackTab?[]:[[99,{id:99,url:C.PAYBACK_URL,status:'complete'}]]),requests=[],badges=[],broadcasts=[],navigations=[],fetches=[],created=[],removed=[];
 const storage=data=>({get:async k=>k===null?{...data}:{[k]:data[k]},set:async v=>Object.assign(data,v),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete data[k];}});
 const chrome={runtime:{id:'self',getURL:f=>'chrome-extension://self/'+f,onMessage:{addListener:f=>listener=f}},storage:{session:storage(store),local:storage(local)},tabs:{query:async q=>typeof q.url==='string'?[...tabs.values()].filter(t=>t.url?.startsWith('https://www.payback.de/')):[...tabs.values()],get:async id=>tabs.get(id),sendMessage:async(id,msg)=>{if(id===99||created.includes(id)){requests.push(msg);const response=await (typeof result==='function'?result(msg):result);return {...response,coupons:response.coupons?.map(c=>({description:'Coupon',multiplier:0,...c}))};}broadcasts.push([id,msg]);},update:async(id,v)=>navigations.push([id,v]),onUpdated:{addListener:f=>updated=f},create:async({url})=>{const id=100+created.length;created.push(id);const tab={id,url,status:'complete'};tabs.set(id,tab);return tab;},remove:async id=>{removed.push(id);tabs.delete(id);}},scripting:{executeScript:async()=>{}},action:{setBadgeText:async v=>badges.push(v),setBadgeBackgroundColor:async()=>{},setBadgeTextColor:async()=>{},setTitle:async()=>{},onClicked:{addListener:()=>{}}}};
 const fetcher=async url=>{fetches.push(url);if(url.startsWith('chrome-extension:'))return {json:async()=>stores};if(remoteFails)throw Error('offline');return {ok:true,json:async()=>({totalResultSize:1,digitalShopListItem:[{partner:{partnerShortName:'lp999',partnerDisplayName:'New store'},browserExtensionInfoListItem:[{domainNameListItem:['new-store.de']}]}]})};};
 const context=vm.createContext({importScripts:()=>{},PayBonCore:C,chrome,URL,setTimeout:fastAuto?(fn=>setTimeout(fn,0)):setTimeout,fetch:fetcher,AbortSignal,Date:class extends Date{static now(){return clock;}}});vm.runInContext(fs.readFileSync('extension/background.js','utf8'),context);
 const send=(msg,tab=1,url='https://www.amazon.de/gp/cart/view.html',overrides={})=>{tabs.set(tab,{id:tab,url,status:'complete'});return new Promise(resolve=>listener(msg,{id:'self',tab:{id:tab,url},url,frameId:0,...overrides},resolve));};
 const ui=(msg,page='settings.html')=>new Promise(resolve=>listener(msg,{id:'self',url:'chrome-extension://self/'+page},resolve));
 return {send,ui,drain:()=>vm.runInContext('Promise.all([...autoRuns.values()])',context),store,local,requests,badges,broadcasts,navigations,fetches,created,removed,directory:()=>vm.runInContext('directory()',context),advance:()=>clock+=31*60*1000,result:r=>result=r,navigate:(id,url)=>{tabs.set(id,{id,url,status:'complete'});updated(id,{status:'loading',url});}};
}
test('domain lookup isolates partner coupon caches and skips unknown/lookalike sites',async()=>{
 const w=worker();const amazon=await w.send({type:'list'});assert.equal(amazon.store.partnerId,'lp717463');
 const ebay=await w.send({type:'list'},2,'https://checkout.ebay.de/');assert.equal(ebay.store.partnerId,'lp604887');assert.equal(ebay.coupons[0].partnerId,'lp604887');
 await w.send({type:'list'},3);assert.equal(w.requests.length,2);assert(w.store['coupons:lp717463']);assert(w.store['coupons:lp604887']);
 for(const host of ['amazon.de.evil.org','example.org'])assert.equal((await w.send({type:'list'},4,`https://${host}/`)).status,'unsupported');
 assert.equal(w.requests.length,2);await w.send({type:'list',force:true});assert.equal(w.requests.length,3);w.advance();await w.send({type:'list'});assert.equal(w.requests.length,4);
});
test('multiple partner IDs on one domain are combined and foreign coupons discarded',async()=>{
 const w=worker({stores:[{partnerId:'lp1',name:'First',domains:['shared.de']},{partnerId:'lp2',name:'Second',domains:['shared.de']}]});
 w.result(msg=>({status:'ready',coupons:[{id:'same',partnerId:msg.partnerId,multiplier:msg.partnerId==='lp2'?10:2},{id:'foreign',partnerId:'lp999'}]}));
 const r=await w.send({type:'list'},1,'https://shared.de/');assert.deepEqual(Array.from(r.coupons,c=>c.partnerId),['lp2','lp1']);assert.equal(r.stores.length,2);
});
test('actions reject foreign partners, malformed IDs, other extensions and subframes',async()=>{
 const w=worker();for(const sender of [{id:'other'},{frameId:2}])assert.equal((await w.send({type:'list'},1,undefined,sender)).status,'error');
 assert.equal((await w.send({type:'activate',id:'123',partnerId:'lp604887'})).status,'error');assert.equal((await w.send({type:'activate',id:'../evil',partnerId:'lp717463'})).status,'error');assert.equal((await w.send({type:'unknown'})).status,'error');assert.equal((await w.send({type:'list'},1,'https://www.payback.de/')).status,'error');
 assert.equal(w.requests.length,0);
});
test('zero badge is hidden; login/failure are distinct; navigation clears badge',async()=>{
 const w=worker();for(const [status,text]of [['ready',''],['login','!'],['error','?']]){w.result({status,coupons:[]});await w.send({type:'list',force:true});assert.equal(w.badges.at(-1).text,text);}
 w.navigate(1,'https://example.org/');assert.equal(w.badges.at(-1).text,'');
});
test('activation publishes only to tabs for the same partner and preserves other caches',async()=>{
 const w=worker();await w.send({type:'list'},2);await w.send({type:'list'},3,'https://ebay.de/');
 w.result(msg=>({status:'ready',coupons:[{id:'123',partnerId:msg.partnerId,status:'activated'}]}));
 const result=await w.send({type:'activate',id:'123',partnerId:'lp717463'});assert.equal(result.coupons[0].status,'activated');
 assert(w.broadcasts.some(([id])=>id===2));assert(!w.broadcasts.some(([id])=>id===3));assert.equal(w.store['coupons:lp604887'].result.coupons[0].status,'not_activated');
});
test('directory refresh uses official domains, retains reviewed fallbacks and caches for a day',async()=>{
 const w=worker({freshDirectory:false});const stores=await w.directory();assert(stores.some(s=>s.partnerId==='lp999'));assert(stores.some(s=>s.partnerId==='lp717463'));assert(!stores.some(s=>s.partnerId==='lp604887'));
 const calls=w.fetches.length;await w.directory();assert.equal(w.fetches.length,calls);assert.equal(w.local.storeDirectory.until,1000000+86400000);
});
test('directory failure uses bundled mappings and backs off instead of hiding known stores',async()=>{
 const w=worker({freshDirectory:false,remoteFails:true});const stores=await w.directory();assert.equal(stores.length,seeds.length);assert.equal(w.local.storeDirectory.until,1000000+900000);
});
test('redemption follows only HTTPS returned destinations',async()=>{
 const w=worker();w.result({status:'redirect',url:'javascript:alert(1)'});assert.equal((await w.send({type:'redeem',id:'123',partnerId:'lp717463'})).status,'error');assert.equal(w.navigations.length,0);
 w.result({status:'redirect',url:'https://tracking.example.org/approved'});assert.equal((await w.send({type:'redeem',id:'123',partnerId:'lp717463'})).status,'redirect');assert.equal(w.navigations.length,1);
});

test('automatic activation is off by default and only extension pages may change it',async()=>{
 const w=worker({fastAuto:true});assert.equal((await w.ui({type:'settings:get'})).settings.autoActivate,false);
 assert.equal((await w.send({type:'settings:update',autoActivate:true})).status,'error');
 assert.equal((await w.ui({type:'settings:update',autoActivate:'yes'})).status,'error');
 await w.send({type:'list'});await w.drain();assert(w.requests.every(m=>m.type==='list'));assert.equal(w.navigations.length,0);
 await w.ui({type:'settings:update',autoActivate:true});assert.equal((await w.ui({type:'settings:get'})).settings.autoActivate,true);
});

test('visiting dm activates all 50 inactive coupons once across multiple tabs, without redemption',async()=>{
 const w=worker({fastAuto:true});await w.ui({type:'settings:update',autoActivate:true});
 const states=Array.from({length:51},(_,i)=>({id:`dm_${i}`,partnerId:'lp54',status:i===50?'activated':'not_activated'}));const activated=[];let inFlight=0,maxInFlight=0;
 w.result(async msg=>{if(msg.type==='activate'){inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);activated.push(msg.id);await new Promise(r=>setTimeout(r,1));states.find(c=>c.id===msg.id).status='activated';inFlight--;}return {status:'ready',coupons:states.map(c=>({...c}))};});
 await Promise.all([w.send({type:'list'},1,'https://dm.de/'),w.send({type:'list'},2,'https://www.dm.de/')]);await w.drain();
 assert.equal(activated.length,50);assert.equal(new Set(activated).size,50);assert.equal(maxInFlight,1);assert(states.every(c=>c.status==='activated'));
 assert.equal(w.store['autoJob:lp54'].status,'complete');assert.equal(w.store['autoJob:lp54'].completed,50);assert.equal(w.store['autoJob:lp54'].total,50);
 assert(w.requests.every(m=>m.partnerId==='lp54'&&['list','activate'].includes(m.type)));assert.equal(w.navigations.length,0);
 assert(w.broadcasts.some(([,msg])=>msg.result.autoJobs?.some(j=>j.status==='running')));
 await w.send({type:'list'},1,'https://dm.de/');await w.drain();assert.equal(activated.length,50);
});

test('turning off auto activation stops before the next coupon',async()=>{
 const w=worker({fastAuto:true});await w.ui({type:'settings:update',autoActivate:true});let activated=0;
 const states=[{id:'1',partnerId:'lp54',status:'not_activated'},{id:'2',partnerId:'lp54',status:'not_activated'}];
 w.result(async msg=>{if(msg.type==='activate'){activated++;states[0].status='activated';await w.ui({type:'settings:update',autoActivate:false});}return {status:'ready',coupons:states.map(c=>({...c}))};});
 await w.send({type:'list'},1,'https://dm.de/');await w.drain();assert.equal(activated,1);assert.equal(w.store['autoJob:lp54'].status,'stopped');assert.equal(w.store['autoJob:lp54'].remaining.length,1);
});

test('rejected activation pauses the queue, backs off, and retries only remaining coupons',async()=>{
 const w=worker({fastAuto:true});await w.ui({type:'settings:update',autoActivate:true});const attempts=[];let reject=true;
 const states=[{id:'1',partnerId:'lp54',status:'not_activated'},{id:'2',partnerId:'lp54',status:'not_activated'},{id:'3',partnerId:'lp54',status:'not_activated'}];
 w.result(msg=>{if(msg.type==='activate'){attempts.push(msg.id);if(msg.id==='2'&&reject)return {status:'error',error:'PAYBACK rejected this request (HTTP 403).'};states.find(c=>c.id===msg.id).status='activated';}return {status:'ready',coupons:states.map(c=>({...c}))};});
 await w.send({type:'list'},1,'https://dm.de/');await w.drain();assert.equal(w.store['autoJob:lp54'].status,'error');assert.equal(w.store['autoJob:lp54'].completed,1);assert.equal(attempts.length,2);
 await w.send({type:'list'},1,'https://dm.de/');await w.drain();assert.equal(attempts.length,2);
 reject=false;assert.equal((await w.ui({type:'auto:retry',partnerId:'lp54'})).ok,true);await w.drain();assert(states.every(c=>c.status==='activated'));assert.equal(attempts.filter(id=>id==='1').length,1);assert.equal(w.store['autoJob:lp54'].status,'complete');
});

test('a persisted batch resumes after worker restart and handles sign-in loss',async()=>{
 const w=worker({fastAuto:true});await w.ui({type:'settings:update',autoActivate:true});const states=[{id:'1',partnerId:'lp54',status:'activated'},{id:'2',partnerId:'lp54',status:'not_activated'}];
 w.store['autoJob:lp54']={store:seeds[2],status:'running',total:2,completed:1,remaining:['2'],startedAt:1};
 w.result(msg=>msg.type==='activate'?{status:'login',coupons:[]}:{status:'ready',coupons:states});await w.send({type:'list'},1,'https://dm.de/');await w.drain();assert.equal(w.store['autoJob:lp54'].status,'login');assert.equal(w.store['autoJob:lp54'].completed,1);
 assert.equal(w.navigations.length,0);
});

test('a batch reuses one temporary PAYBACK tab and closes only its owned tab',async()=>{
 const w=worker({fastAuto:true,noPaybackTab:true});await w.ui({type:'settings:update',autoActivate:true});
 const states=[{id:'dm_1',partnerId:'lp54',status:'not_activated'},{id:'dm_2',partnerId:'lp54',status:'not_activated'}];
 w.result(msg=>{if(msg.type==='activate')states.find(c=>c.id===msg.id).status='activated';return {status:'ready',coupons:states.map(c=>({...c}))};});
 await w.send({type:'list'},1,'https://dm.de/');await w.drain();
 // Initial listing uses a short-lived tab; the batch then leases one tab for both activations.
 assert.equal(w.created.length,2);assert.deepEqual(w.removed,w.created);assert(!w.store['autoJob:lp54'].bridgeTabId);assert.equal(w.store['autoJob:lp54'].status,'complete');
});

test('automatic activation does not claim success without confirmed coupon state',async()=>{
 const w=worker({fastAuto:true});await w.ui({type:'settings:update',autoActivate:true});
 w.result({status:'ready',coupons:[{id:'1',partnerId:'lp54',status:'not_activated'}]});await w.send({type:'list'},1,'https://dm.de/');await w.drain();
 assert.equal(w.store['autoJob:lp54'].status,'error');assert.equal(w.store['autoJob:lp54'].completed,0);assert.equal(w.requests.filter(m=>m.type==='activate').length,1);
});

test('an upgrade adds Alnatura to an unexpired directory cache and detects all six in-store coupons',async()=>{
 const alnatura=JSON.parse(fs.readFileSync('extension/stores.json','utf8')).find(s=>s.partnerId==='lp387');assert(alnatura?.verifiedFallback);
 const w=worker({stores:[...seeds,alnatura],cachedStores:seeds});
 const coupons=JSON.parse(fs.readFileSync('tests/fixtures/alnatura-coupons.json','utf8')).map(c=>C.normalize(c,'lp387'));
 w.result({status:'ready',coupons});
 const result=await w.send({type:'list'},1,'https://www.alnatura.de/');
 assert.equal(result.store.name,'Alnatura');assert.equal(result.store.partnerId,'lp387');assert.equal(result.coupons.length,6);assert(result.coupons.every(c=>c.acceptanceType==='offline'));
 assert.equal(w.badges.at(-1).text,'6');assert.equal(w.requests[0].partnerId,'lp387');assert(w.requests.every(m=>m.type==='list'));
 assert(!w.fetches.some(url=>url.startsWith('https://')));assert.equal((await w.send({type:'list'},2,'https://alnatura.de.evil.org/')).status,'unsupported');
});
