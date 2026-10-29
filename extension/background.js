importScripts('core.js');
const C=PayBonCore;
const DIRECTORY_URL='https://www.payback.de/onsflows/api/digital-shops';
const DIRECTORY_TTL=24*60*60*1000;
let directoryRequest,bundledRequest,bridgeQueue=Promise.resolve();
const couponRequests=new Map(),queues=new Map();
const autoRuns=new Map();
async function preferences(){return {autoActivate:(await chrome.storage.local.get('preferences')).preferences?.autoActivate===true};}
async function jobsFor(stores){
  const all=await chrome.storage.session.get(null);
  return Object.entries(all).filter(([key,job])=>key.startsWith('autoJob:')&&(!stores||stores.some(s=>s.partnerId===job.store?.partnerId))).map(([,job])=>job).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20);
}
async function cacheCoupons(partnerId,result){
  await couponRequests.get(partnerId)?.catch(()=>{});
  await chrome.storage.session.remove(`coupons:${partnerId}`);
  if(['ready','login','error'].includes(result.status))await chrome.storage.session.set({[`coupons:${partnerId}`]:{until:Date.now()+(result.status==='ready'?120000:15000),result}});
}
function startAutoActivation(store,initial,{retry=false}={}){
  if(autoRuns.has(store.partnerId))return;
  const task=(async()=>{
    if(!(await preferences()).autoActivate)return;
    const key=`autoJob:${store.partnerId}`;
    const previous=(await chrome.storage.session.get(key))[key];
    if(!retry&&previous?.status==='error'&&previous.retryAfter>Date.now())return;
    const inactive=initial.filter(c=>c.partnerId===store.partnerId&&c.status==='not_activated');
    if(!inactive.length){
      if(previous?.status==='running'){
        const confirmed=previous.remaining.every(id=>initial.some(c=>c.id===id&&c.partnerId===store.partnerId&&c.status==='activated'));
        await chrome.storage.session.set({[key]:{...previous,status:confirmed?'complete':'error',completed:confirmed?previous.total:previous.completed,remaining:confirmed?[]:previous.remaining,error:confirmed?'':'The remaining coupons could not be confirmed. Open PAYBACK to check their status.',retryAfter:Date.now()+15*60*1000,updatedAt:Date.now()}});await publish(store.partnerId);
      }
      return;
    }
    const job=previous?.status==='running'?{...previous,store}:{store,status:'running',total:inactive.length,completed:0,remaining:inactive.map(c=>c.id),startedAt:Date.now()};
    job.status='running';job.error='';
    const save=async()=>{job.updatedAt=Date.now();await chrome.storage.session.set({[key]:{...job,remaining:[...job.remaining]}});};
    const lease={onCreate:async tabId=>{job.bridgeTabId=tabId;await save();}};
    if(job.bridgeTabId){const tab=await chrome.tabs.get(job.bridgeTabId).catch(()=>null);if(tab?.url?.startsWith('https://www.payback.de/coupons')){lease.tab=tab;lease.owned=true;}}
    try{
      await save();await publish(store.partnerId);
      while(job.remaining.length){
        if(!(await preferences()).autoActivate){job.status='stopped';break;}
        const id=job.remaining[0];
        // The bridge checks fresh coupon status before every mutation, including after restart.
        const result=await bridge({type:'activate',partnerId:store.partnerId,id},lease);
        if(result.status!=='ready'){
          await cacheCoupons(store.partnerId,result);
          job.status=result.status==='login'?'login':'error';job.error=result.error||(job.status==='login'?'Sign in to PAYBACK, then retry the remaining coupons.':'PAYBACK could not activate this coupon. Open PAYBACK or retry later.');job.retryAfter=Date.now()+15*60*1000;break;
        }
        await cacheCoupons(store.partnerId,result);
        if(!result.coupons?.some(c=>c.id===id&&c.partnerId===store.partnerId&&c.status==='activated')){
          job.status='error';job.error='PAYBACK did not confirm that the coupon is active. Open PAYBACK or retry later.';job.retryAfter=Date.now()+15*60*1000;break;
        }
        job.remaining.shift();job.completed++;
        await save();await publish(store.partnerId);
        if(job.remaining.length)await new Promise(resolve=>setTimeout(resolve,400));
      }
      if(!job.remaining.length)job.status='complete';
    }catch(e){job.status='error';job.error=e.message||'Automatic activation was interrupted. Retry the remaining coupons.';job.retryAfter=Date.now()+15*60*1000;}
    finally{
      if(lease.owned&&lease.tab){const tab=await chrome.tabs.get(lease.tab.id).catch(()=>null);if(tab?.url?.startsWith('https://www.payback.de/coupons'))await chrome.tabs.remove(tab.id).catch(()=>{});}
      delete job.bridgeTabId;await save();await publish(store.partnerId);
    }
  })();
  autoRuns.set(store.partnerId,task);
  task.catch(()=>{}).finally(()=>{if(autoRuns.get(store.partnerId)===task)autoRuns.delete(store.partnerId);});
}
function extensionPage(sender){
  try{const url=new URL(sender.url);return sender.id===chrome.runtime.id&&url.protocol==='chrome-extension:'&&url.hostname===chrome.runtime.id&&['/settings.html','/popup.html'].includes(url.pathname);}catch{return false;}
}
async function handleExtensionPage(msg){
  if(msg.type==='settings:get')return {ok:true,settings:await preferences(),jobs:await jobsFor()};
  if(msg.type==='settings:update'){
    if(typeof msg.autoActivate!=='boolean')throw Error('Invalid preference.');
    await chrome.storage.local.set({preferences:{autoActivate:msg.autoActivate}});return {ok:true};
  }
  if(msg.type==='auto:retry'){
    if(!(await preferences()).autoActivate)throw Error('Turn on Auto-Aktivierung first.');
    const store=(await directory()).find(s=>s.partnerId===msg.partnerId);if(!store)throw Error('This store is no longer mapped.');
    const result=await coupons(store.partnerId,true);if(result.status!=='ready')throw Error(result.error||'Sign in to PAYBACK before retrying.');
    startAutoActivation(store,result.coupons,{retry:true});return {ok:true};
  }
  if(msg.type==='toolbar:open'){
    if(!Number.isInteger(msg.tabId))throw Error('Open a shopping website first.');
    const tab=await chrome.tabs.get(msg.tabId);
    if(!tab?.url?.startsWith('https:'))throw Error('Open an HTTPS shopping website to view its coupons.');
    try{await chrome.tabs.sendMessage(tab.id,{type:'show'});}catch{throw Error('Refresh this website, then open the side bar again.');}
    return {ok:true};
  }
  throw Error('Unsupported settings action.');
}
async function directory(){
  if(directoryRequest)return directoryRequest;
  directoryRequest=(async()=>{
    const saved=(await chrome.storage.local.get('storeDirectory')).storeDirectory;
    if(!bundledRequest)bundledRequest=fetch(chrome.runtime.getURL('stores.json')).then(r=>r.json()).catch(error=>{bundledRequest=null;throw error;});
    const seed=await bundledRequest;
    // A release may add verified in-store partners absent from the online directory.
    // Overlay them even when an older cached directory has not expired yet.
    const byCachedId=new Map((Array.isArray(saved?.stores)?saved.stores:seed).map(s=>[s.partnerId,s]));
    for(const store of seed.filter(s=>s.verifiedFallback)){
      const existing=byCachedId.get(store.partnerId);
      byCachedId.set(store.partnerId,{...store,...existing,domains:[...new Set([...(existing?.domains||[]),...store.domains])],verifiedFallback:true});
    }
    const fallback=[...byCachedId.values()];
    if(saved?.until>Date.now()&&Array.isArray(saved.stores))return fallback;
    try{
      const byId=new Map(seed.map(s=>[s.partnerId,{...s,domains:[...s.domains]}]));
      let total,seen=new Set();
      for(let offset=0;total===undefined||offset<total;offset+=200){
        const r=await fetch(`${DIRECTORY_URL}?pageSize=200&pageOffset=${offset}`,{signal:AbortSignal.timeout(15000),credentials:'omit'});
        if(!r.ok)throw Error('Directory unavailable');
        const page=await r.json();
        if(!Array.isArray(page.digitalShopListItem)||!Number.isSafeInteger(page.totalResultSize)||page.totalResultSize<0||page.totalResultSize>10000)throw Error('Invalid directory response');
        total=page.totalResultSize;
        if(!page.digitalShopListItem.length&&offset<total)throw Error('Incomplete directory');
        for(const shop of page.digitalShopListItem){
          const id=shop.partner?.partnerShortName;if(!/^lp\d+$/.test(id||''))continue;seen.add(id);
          const domains=[...new Set((shop.browserExtensionInfoListItem||[]).flatMap(i=>i.domainNameListItem||[]).map(C.domain).filter(Boolean))];
          const previous=byId.get(id);
          if(previous?.verifiedFallback)domains.push(...previous.domains);
          if(domains.length)byId.set(id,{partnerId:id,name:shop.partner.partnerDisplayName||id,domains:[...new Set(domains)],logoUrl:shop.imageUrl||'',verifiedFallback:previous?.verifiedFallback||false});
          else byId.delete(id);
        }
      }
      if(seen.size!==total)throw Error('Inconsistent directory pagination');
      for(const [id,store]of byId)if(!seen.has(id)&&!store.verifiedFallback)byId.delete(id);
      const stores=[...byId.values()];
      await chrome.storage.local.set({storeDirectory:{until:Date.now()+DIRECTORY_TTL,stores}});return stores;
    }catch{
      await chrome.storage.local.set({storeDirectory:{until:Date.now()+15*60*1000,stores:fallback}});return fallback;
    }
  })();
  try{return await directoryRequest;}finally{directoryRequest=null;}
}
async function badge(tabId,result){
  const tab=await chrome.tabs.get(tabId).catch(()=>null);if(!tab?.url)return;
  if(result.hostname&&new URL(tab.url).hostname!==result.hostname)return;
  const count=result.coupons?.length||0,ready=result.status==='ready';
  const text=result.status==='unsupported'?'':ready?(count?count>99?'99+':String(count):''):result.status==='login'?'!':result.status==='loading'?'…':'?';
  await Promise.all([chrome.action.setBadgeText({tabId,text}),chrome.action.setBadgeBackgroundColor({tabId,color:ready?'#1744b5':'#925600'}),chrome.action.setBadgeTextColor({tabId,color:'#ffffff'}),chrome.action.setTitle({tabId,title:ready?`PayBon — ${count} ${result.store?.name||'store'} coupon${count===1?'':'s'} detected`:result.status==='login'?'PayBon — login to PAYBACK required':result.status==='unsupported'?'PayBon — no mapped PAYBACK store':'PayBon — coupon check unavailable; click to retry'})]);
}
async function coupons(partnerId,force=false){
  if(couponRequests.has(partnerId))return couponRequests.get(partnerId);
  const job=(async()=>{
    const key=`coupons:${partnerId}`;
    if(!force){const cached=(await chrome.storage.session.get(key))[key];if(cached?.until>Date.now())return cached.result;}
    let result;try{result=await bridge({type:'list',partnerId});}catch(error){result={status:'error',coupons:[],error:error.message};}
    result ||= {status:'error',coupons:[],error:'PAYBACK did not respond. Open PAYBACK and retry.'};
    await chrome.storage.session.set({[key]:{until:Date.now()+(result.status==='ready'?120000:15000),result}});return result;
  })();
  couponRequests.set(partnerId,job);try{return await job;}finally{couponRequests.delete(partnerId);}
}
async function forWebsite(url,force=false){
  const stores=C.storesForHost(await directory(),url.hostname);
  if(!stores.length)return {status:'unsupported',coupons:[],hostname:url.hostname};
  const results=await Promise.all(stores.map(async store=>({store,result:await coupons(store.partnerId,force)})));
  const offers=results.flatMap(({store,result})=>(result.coupons||[]).filter(c=>c.partnerId===store.partnerId).map(c=>({...c,partnerName:c.partnerName||store.name,logoUrl:c.logoUrl||store.logoUrl||''})));
  const failed=results.find(r=>r.result.status!=='ready');
  return {status:offers.length?'ready':failed?.result.status||'ready',coupons:C.sort(offers),store:stores[0],stores,hostname:url.hostname,autoJobs:await jobsFor(stores),checkedAt:Date.now(),error:failed?.result.error,warning:offers.length&&failed?'Some offers could not be checked. Open PAYBACK for the full list.':''};
}
async function publish(partnerId){
  const stores=await directory(),tabs=await chrome.tabs.query({url:['https://*/*']});
  await Promise.allSettled(tabs.map(async tab=>{
    const url=new URL(tab.url);if(!C.storesForHost(stores,url.hostname).some(s=>s.partnerId===partnerId))return;
    const result=await forWebsite(url);await badge(tab.id,result);await chrome.tabs.sendMessage(tab.id,{type:'couponsUpdated',result}).catch(()=>{});
  }));
}
async function bridge(message,lease){
  const job=bridgeQueue.catch(()=>{}).then(async()=>{
    let owned=false;
    let tab=lease?.tab?await chrome.tabs.get(lease.tab.id).catch(()=>null):null;
    if(tab&&!tab.url?.startsWith('https://www.payback.de/coupons'))tab=null;
    if(!tab)tab=(await chrome.tabs.query({url:'https://www.payback.de/*'})).find(t=>t.url?.startsWith('https://www.payback.de/coupons'));
    if(!tab){tab=await chrome.tabs.create({url:C.couponUrl(message.partnerId),active:false});owned=true;}
    if(lease){if(lease.tab?.id!==tab.id)lease.owned=false;lease.tab=tab;if(owned){lease.owned=true;await lease.onCreate?.(tab.id);}}
    try{
      const deadline=Date.now()+22000;
      while((await chrome.tabs.get(tab.id)).status!=='complete'){if(Date.now()>deadline)throw Error('PAYBACK is taking too long. Open PAYBACK and retry.');await new Promise(r=>setTimeout(r,200));}
      if(new URL((await chrome.tabs.get(tab.id)).url).origin!=='https://www.payback.de')return {status:'login',coupons:[]};
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['core.js','payback.js']});
      return await chrome.tabs.sendMessage(tab.id,{...message,target:'payback'});
    }finally{if(owned&&!lease)await chrome.tabs.remove(tab.id).catch(()=>{});}
  });bridgeQueue=job;return job;
}
async function handle(msg,sender){
  if(extensionPage(sender))return handleExtensionPage(msg);
  if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!==0)throw Error('Unsupported sender.');
  const url=new URL(sender.url||sender.tab.url);
  if(url.protocol!=='https:'||url.hostname==='payback.de'||url.hostname.endsWith('.payback.de'))throw Error('Store page required.');
  if(!['list','openPayback','openSettings','activate','redeem'].includes(msg.type))throw Error('Unknown action.');
  const tabId=sender.tab.id;
  if(msg.type==='openSettings'){await chrome.runtime.openOptionsPage();return {ok:true};}
  if(msg.type==='list'){
    const result=await forWebsite(url,!!msg.force);
    if(result.status==='ready'&&(await preferences()).autoActivate)for(const store of result.stores||[])startAutoActivation(store,result.coupons);
    await badge(tabId,result);return result;
  }
  const stores=C.storesForHost(await directory(),url.hostname);
  if(msg.type==='openPayback'){await chrome.tabs.create({url:C.couponUrl(stores.find(s=>s.partnerId===msg.partnerId)?.partnerId||stores[0]?.partnerId||'')});return {ok:true};}
  if(!stores.some(s=>s.partnerId===msg.partnerId)||!/^[a-zA-Z0-9_-]{1,100}$/.test(msg.id||''))throw Error('Invalid coupon or partner for this website.');
  const result=await bridge({type:msg.type,id:msg.id,partnerId:msg.partnerId});
  if(msg.type==='activate'){
    await cacheCoupons(msg.partnerId,result);
    await publish(msg.partnerId);
    return result.status==='ready'?forWebsite(url):{...result,store:stores[0],stores,hostname:url.hostname};
  }
  if(result.status==='redirect'){
    if(!C.httpsUrl(result.url))throw Error('Invalid PAYBACK destination.');
    const current=await chrome.tabs.get(tabId);
    if(new URL(current.url).hostname!==url.hostname)throw Error('The store tab changed. Return to the store and try again.');
    await chrome.tabs.update(tabId,{url:result.url});
  }
  return result;
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  const id=sender.tab?.id;const job=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(()=>handle(msg,sender));queues.set(id,job);
  job.then(reply).catch(e=>reply({status:'error',error:e.message,coupons:[]})).finally(()=>{if(queues.get(id)===job)queues.delete(id);});return true;
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading'||change.url){chrome.action.setBadgeText({tabId,text:''}).catch(()=>{});chrome.action.setTitle({tabId,title:'PayBon — PAYBACK coupons'}).catch(()=>{});}});
