(() => {
  if(globalThis.__paybonAmazon) return;
  globalThis.__paybonAmazon=true;
  const C=PayBonCore;
  if(location.protocol!=='https:' || location.hostname==='payback.de' || location.hostname.endsWith('.payback.de')) return;
  // Old content scripts survive an extension reload, but their runtime ID disappears.
  function runtimeAvailable(){try{return !!chrome.runtime?.id;}catch{return false;}}
  if(!runtimeAvailable())return;
  const assetUrls=Object.fromEntries(['icon-48.png','amazon-payback.png','fox-sprites.png'].map(file=>[file,chrome.runtime.getURL(file)]));
  let disposed=false, host, root, panel, mascot, loading=false, state={status:'loading',coupons:[]}, busyId=null,lastChecked=0,disconnected=false,poll;
  async function send(msg){
    if(disposed)return state;
    if(!runtimeAvailable()){disconnect();return state;}
    try{return await chrome.runtime.sendMessage(msg);}
    catch(error){if(/extension context invalidated|context invalidated/i.test(error.message||'')){disconnect();return state;}throw error;}
  }
  function disconnect(){
    if(disposed)return;
    disconnected=true;disposed=true;clearInterval(poll);
    state={status:'error',coupons:[],error:'PayBon was reloaded. Refresh this page to reconnect.'};
    if(root){setPanelOpen(true);render();}
  }
  function setPanelOpen(open) {
    if(!panel)return;
    panel.hidden=!open;
    document.documentElement.toggleAttribute('data-paybon-sidebar-open',open);
    syncMascot();
  }
  function syncMascot(){
    if(!mascot)return;
    const controls=document.querySelectorAll('#buy-now-button, #buyNow, #placeOrder, #placeYourOrder, #placeYourOrder1, #submitOrderButtonId, [name="proceedToRetailCheckout"], [name="proceedToCheckout"][type="submit"], [name="placeYourOrder1"], [name="submit.buy-now"], [data-feature-id="proceed-to-checkout-action"]');
    const surfaces=new Set([...controls].filter(el=>el.getAttribute('type')!=='hidden').map(el=>el.closest('.a-button')||el));
    mascot.sync(state,!!panel&&!panel.hidden,surfaces);
  }
  function storeName(){return state.store?.name||state.coupons?.[0]?.partnerName||location.hostname;}
  function element(tag,text,cls) {const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
  function button(text,action,cls='secondary') { const el=element('button',text,cls);el.type='button';el.addEventListener('click',action);return el; }
  function couponIcon(path,cls) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class',cls);svg.setAttribute('aria-hidden','true');
    const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',path);svg.append(shape);return svg;
  }
  async function load(force=false) {
    if(loading)return; loading=true; render();
    try { state=await send({type:'list',force}); } catch { state={status:'error',error:'PayBon was reloaded or disconnected. Refresh this page to reconnect.'}; }
    lastChecked=Date.now();loading=false;
    if(!root && state.status!=='unsupported' && (state.store || state.coupons?.length))mount();
    render();
  }
  function show() { if(!root)mount(); if(!root)return; setPanelOpen(true);if(state.status==='loading'&&!loading)load(); }
  async function action(type,id,partnerId) {
    if(busyId)return;busyId=`${partnerId}:${id}`;render();
    try {const result=await send({type,id,partnerId});if(result.status!=='redirect')state=result;}catch{state={...state,status:'error',error:'Could not reach PAYBACK. Open PAYBACK and retry.',coupons:[]};}
    busyId=null;render();
  }
  function render() {
    if(!panel)return;
    const focusId=root.activeElement?.dataset.focus;
    const scrollTop=root.querySelector('.scroll')?.scrollTop || 0;
    panel.replaceChildren();
    const header=element('header');
    const brand=element('div',null,'brand');const appIcon=element('img',null,'mark');appIcon.src=assetUrls['icon-48.png'];appIcon.alt='';appIcon.width=34;appIcon.height=34;brand.append(appIcon,element('strong','PayBon'));header.append(brand);
    const headerActions=element('div',null,'header-actions');
    const settings=button('',()=>send({type:'openSettings'}),'icon settings');settings.setAttribute('aria-label','Settings');settings.title='Settings';settings.disabled=disconnected;
    settings.append(couponIcon('M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98L14.48 2.42a.49.49 0 0 0-.49-.42h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.18.59-1.69.98l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65a7.7 7.7 0 0 0 0 1.96l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.13.23.4.32.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .45-.18.49-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.22.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7','settings-icon'));
    const close=button('×',()=>setPanelOpen(false),'icon');close.setAttribute('aria-label','Minimize coupon panel');headerActions.append(settings,close);header.append(headerActions);panel.append(header);
    const scroll=element('div',null,'scroll');
    const empty=state.status==='unsupported'||(state.status==='ready'&&!state.coupons?.length);
    const inStoreOnly=state.status==='ready'&&state.coupons?.length&&state.coupons.every(c=>c.acceptanceType==='offline');
    scroll.append(element('div','Your coupon scout','eyebrow'),element('h1',empty?'No coupons found for this store':'Discover your PAYBACK offers'));
    scroll.append(element('p',empty?'You can refresh this check or view offers directly on PAYBACK.':inStoreOnly?'These coupons are for shopping in store. Activate the offers and check their conditions on PAYBACK.':'Activate a coupon, then use Online einlösen when available to start shopping through PAYBACK.','intro'));
    for(const job of state.autoJobs||[]){
      const notice=element('div',null,'auto-progress');notice.setAttribute('role','status');
      notice.append(element('strong',job.status==='running'?`Auto-Aktivierung · ${job.store.name}`:job.status==='complete'?`Auto-Aktivierung complete · ${job.store.name}`:`Auto-Aktivierung paused · ${job.store.name}`));
      notice.append(element('p',`${job.completed} of ${job.total} coupons confirmed active.`,'small'));
      if(job.error)notice.append(element('p',job.error,'small'));
      if(job.status==='running'){const progress=element('progress');progress.max=job.total||1;progress.value=job.completed;progress.setAttribute('aria-label','Automatic coupon activation progress');notice.append(progress);}
      if(['error','login','stopped'].includes(job.status))notice.append(button('Manage in settings',()=>send({type:'openSettings'}),'text'));
      scroll.append(notice);
    }
    const section=element('div',null,'section-title');section.append(element('h2',`${storeName()} coupons`));
    const refresh=button(disconnected?'Reload page':'Refresh',()=>disconnected?location.reload():load(true),'text'); refresh.disabled=!disconnected&&(loading||!!busyId);refresh.dataset.focus='refresh';section.append(refresh);scroll.append(section);
    const results=element('div');results.setAttribute('aria-live','polite');results.setAttribute('aria-busy',String(loading||!!busyId));
    if(state.warning)results.append(element('p',state.warning,'notice'));
    if(state.status==='loading') results.append(element('p','Checking your PAYBACK account…','notice'));
    else if(state.status==='login') { results.append(element('h3','Please login to PAYBACK'),element('p','Sign in on PAYBACK, then return here and refresh.','muted'),button('Login to PAYBACK',()=>send({type:'openPayback'}),'primary')); }
    else if(state.status==='error') {results.append(element('h3',disconnected?'PayBon needs a page refresh':'Couldn’t check your coupons'),element('p',state.error||'PAYBACK’s page could not be read. Open PAYBACK, check your session, then refresh.','muted'),disconnected?button('Reload page',()=>location.reload(),'primary'):button('Open PAYBACK',()=>send({type:'openPayback'})));}
    else if(state.status==='unsupported'){
      const empty=element('div',null,'notice empty-state');empty.append(element('h3','Store not recognized'),element('p',`PayBon could not match ${location.hostname} to a PAYBACK partner. Coupons may still be available on PAYBACK.`,'muted small'));results.append(empty);
    }
    else if(state.status==='ready' && !state.coupons?.length){
      const empty=element('div',null,'notice empty-state');empty.append(element('h3','No current offers'),element('p',`PAYBACK currently lists no available ${storeName()} coupons for your account. You can refresh or check again later.`,'muted small'));results.append(empty);
    }
    else if(state.status==='ready') {
      results.append(element('p',`${state.coupons.length} offers · Highest multiplier first`,'muted small'));
      for(const c of state.coupons) {
        const card=element('article',null,'coupon');card.dataset.couponId=c.id;
        card.setAttribute('aria-label',`${c.label} ${c.description} — ${c.status==='activated'?'Aktiviert':c.status==='not_activated'?'Nicht aktiviert':'Nicht verfügbar'}`);
        const content=element('div',null,'coupon-content');
        const upper=element('div',null,'coupon-upper');
        const top=element('div',null,'coupon-top');
        const logoUrl=c.logoUrl||(C.amazonHost(location.hostname)?assetUrls['amazon-payback.png']:'');
        const logo=logoUrl?element('img',null,'coupon-logo'):element('span',c.partnerName||storeName(),'coupon-logo');
        if(logoUrl){logo.src=logoUrl;logo.alt=c.partnerName||storeName();logo.width=84;logo.height=38;}
        const icons=element('div',null,'coupon-icons');
        if(c.status==='activated') {
          const check=couponIcon('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z','coupon-check');icons.append(check);
        }
        const info=button('',()=>send({type:'openPayback',partnerId:c.partnerId}),'coupon-info');info.setAttribute('aria-label',`Coupon-Informationen auf PAYBACK: ${c.description}`);
        info.append(couponIcon('M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8','coupon-info-icon'));
        icons.append(info);top.append(logo,icons);
        const headline=element('div',null,'coupon-headline');const label=element('div',null,'coupon-label');
        const parts=c.label.match(/^([\d.,]+)\s*(.*)$/);
        if(parts)label.append(element('span',parts[1],'coupon-number'),element('span',parts[2],'coupon-unit'));else label.textContent=c.label;
        headline.append(label,element('p',c.description,'coupon-description'));upper.append(top,headline);
        const lower=element('div',null,'coupon-lower');lower.append(element('p',c.validity,'coupon-validity'));
        const canRedeem=c.status==='activated'&&!!c.template;
        const a=button(busyId===`${c.partnerId}:${c.id}`?'Bitte warten…':c.status==='activated'?(canRedeem?'Online einlösen':'Auf PAYBACK ansehen'):c.status==='not_activated'?'Jetzt aktivieren':'Nicht verfügbar',()=>c.status==='activated'&&!canRedeem?send({type:'openPayback',partnerId:c.partnerId}):action(canRedeem?'redeem':'activate',c.id,c.partnerId),c.status==='activated'?'coupon-action redeem':'coupon-action activate');
        const autoRunning=(state.autoJobs||[]).some(job=>job.store.partnerId===c.partnerId&&job.status==='running');
        a.disabled=!!busyId||c.status==='unavailable'||(autoRunning&&c.status==='not_activated');if(autoRunning&&c.status==='not_activated')a.title='Auto-Aktivierung is activating this store’s coupons.';
        a.dataset.focus=`${c.partnerId}:${c.id}`;lower.append(a);content.append(upper,lower);card.append(content);results.append(card);
      }
      results.append(element('p',`Checked ${new Date(state.checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Offers apply to eligible products under PAYBACK’s terms.`,'muted small'));
    }
    scroll.append(results,button('View offers and terms on PAYBACK',()=>send({type:'openPayback'}),'text'));panel.append(scroll);
    if(focusId)root.querySelector(`[data-focus="${CSS.escape(focusId)}"]`)?.focus();
    scroll.scrollTop=scrollTop;syncMascot();
  }
  function mount() {
    if(root || !document.body)return;
    host=element('div');host.id='paybon-root';host.dataset.paybonVersion='1.3.1';
    host.style.cssText='all:initial;font:14px/1.5 "Segoe UI",Arial,sans-serif;color:#172743;color-scheme:light;position:fixed;inset:0 0 0 auto;z-index:2147483647;pointer-events:none;';
    root=host.attachShadow({mode:'closed'});
    const style=element('style');style.textContent=`
      :host{font-family:"Segoe UI",Arial,sans-serif;color:#172743;font-size:14px;line-height:1.5;color-scheme:light}*{box-sizing:border-box} [hidden]{display:none!important}
      .panel{pointer-events:auto;width:min(390px,45vw);height:100dvh;background:#fff;display:flex;flex-direction:column;border-left:1px solid #d7dfeb;box-shadow:-4px 0 16px #162d4f14}
      header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #e2e8f0}.brand{display:flex;align-items:center;gap:10px;font-size:21px;letter-spacing:-.6px}.mark{display:block;flex:0 0 34px;width:34px;height:34px;object-fit:contain;background:transparent;border-radius:0}
      button{font:inherit;cursor:pointer;border-radius:8px;padding:11px 15px;font-weight:600;transition:background .15s;border:1px solid #c6d2e4;background:#fff;color:#183c80}button:hover{background:#eef3fc}button:focus-visible{outline:3px solid #799ff2;outline-offset:3px}button:disabled{cursor:wait;opacity:.55}.primary{background:#1744b5;border-color:#1744b5;color:white}.primary:hover{background:#12378f}.icon{border:0;padding:0 7px;font-size:27px;line-height:1.2;color:#5c6a80}.text{border:0;background:transparent;padding:6px 0;font-size:13px;text-decoration:underline;text-underline-offset:3px}.scroll{padding:24px;overflow:auto;flex:1;overscroll-behavior:contain}.eyebrow{color:#496080;font-size:13px;margin-bottom:10px}h1{font-size:25px;line-height:1.22;letter-spacing:-.65px;margin:0 0 14px;font-weight:700}h2{font-size:16px;margin:0}h3{font-size:16px;line-height:1.4;margin:9px 0;font-weight:650}p{margin:8px 0 14px}.intro{color:#52617a;font-size:14px}.section-title{display:flex;align-items:center;justify-content:space-between;margin-top:25px;padding-top:18px;border-top:1px solid #e0e6ef}.muted{color:#5c6a80}.small{font-size:12px;line-height:1.5}.coupon{padding:17px 0 19px;border-bottom:1px solid #e0e6ef}.coupon-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.multiplier{font-size:23px;letter-spacing:-.7px;color:#1744b5}.status{font-size:11px;background:#f0f3f8;color:#53627a;border-radius:20px;padding:4px 9px;white-space:nowrap}.active{background:#e7f5ee;color:#14633e}.coupon button{width:100%;margin-top:2px}.notice{padding:18px;background:#f2f5fb;border-radius:8px}.launcher{pointer-events:auto;position:fixed;right:18px;bottom:20px;background:#1744b5;color:#fff;box-shadow:0 3px 16px #16316430}@media(prefers-reduced-motion:reduce){button{transition:none}}
    `;
    style.textContent+=`
      .header-actions{display:flex;align-items:center;gap:10px}.settings{display:flex;align-items:center;justify-content:center;min-width:30px;min-height:32px}.settings-icon{width:20px;height:20px;fill:currentColor}.auto-progress{padding:14px;margin-top:18px;border:1px solid #c6d2e4;border-radius:8px;background:#f2f5fb}.auto-progress p{margin:6px 0 0}.auto-progress progress{width:100%;height:7px;accent-color:#1744b5;margin-top:10px}
      .coupon{font-family:PayBonRoboto,Arial,sans-serif;font-weight:380;color:#1c1d1e;width:300px;max-width:100%;height:236px;background:#fff;border:0;border-radius:8px;padding:0;margin:16px auto;box-shadow:0 3px 3px -2px #0003,0 3px 4px #00000024,0 1px 8px #0000001f;overflow:hidden}
      .coupon-content{display:flex;flex-direction:column;justify-content:space-between;height:100%;padding:12px}
      .coupon-upper{display:flex;flex-direction:column;gap:8px}.coupon-top{display:flex;justify-content:space-between;align-items:flex-start;gap:0;height:38px}.coupon-logo{display:block;width:84px;height:38px;object-fit:contain;object-position:left center}
      .coupon-icons{display:flex;align-items:center;gap:4px}.coupon-icons svg{display:block;width:24px;height:24px;fill:currentColor}.coupon-check{color:#3d8627}
      .coupon .coupon-info{display:block;width:24px;height:24px;padding:0;margin:0;border:0;border-radius:0;background:transparent;color:#003eb0}.coupon .coupon-info:hover{background:#eef3fc;border-radius:50%}
      .coupon-headline{width:77.4174%;line-height:8px}.coupon-label{display:inline-block;font-family:PayBonDisplay,Arial,sans-serif;font-weight:300;color:#003eb0;white-space:nowrap}.coupon-number{font-size:32px;line-height:40px}.coupon-unit{font-size:20px;line-height:32px}
      .coupon .coupon-description{font-size:12px;line-height:14px;font-weight:380;margin:0}.coupon .coupon-validity{font-size:11px;line-height:14px;font-weight:380;margin:0 0 8px}
      .coupon .coupon-action{display:flex;align-items:center;justify-content:center;width:100%;height:36px;min-height:36px;margin:0;padding:0;border:0;border-radius:12px;font-family:PayBonRoboto,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:550;color:#fff}.coupon .activate{background:#003eb0}.coupon .activate:hover{background:#00338f}.coupon .redeem{background:#c80a0a}.coupon .redeem:hover{background:#a60808}.coupon .coupon-action:disabled{cursor:default}
    `;
    panel=element('aside',null,'panel');panel.setAttribute('aria-label','PayBon PAYBACK coupons');
    root.append(style,panel);mascot=new PayBonMascot(root,show,assetUrls['fox-sprites.png']);document.body.append(host);render();
    setPanelOpen(false);
  }
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='show'){show();if(!loading)load(true);}else if(msg.type==='couponsUpdated'&&msg.result){state=msg.result;lastChecked=Date.now();render();}});
  function start(){load();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  function startPolling(){clearInterval(poll);poll=setInterval(()=>{
    if(!runtimeAvailable()){disconnect();return;}
    syncMascot();
    if(!loading&&!busyId&&document.visibilityState==='visible'&&Date.now()-lastChecked>120000)load();
  },750);}
  startPolling();
  window.addEventListener('pagehide',()=>{disposed=true;clearInterval(poll);mascot?.destroy();mascot=null;});
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    disposed=false;
    if(!runtimeAvailable()){disconnect();return;}
    if(root){mascot=new PayBonMascot(root,show,assetUrls['fox-sprites.png']);syncMascot();}
    startPolling();load();
  });
})();
