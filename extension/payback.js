(() => {
  if(globalThis.__paybonBridge) return;
  globalThis.__paybonBridge=true;
  const {couponUrl,parseDocument}=PayBonCore;
  let csrfToken='',pageLoadRcid='';
  async function request(path,body) {
    const headers={};
    if(body) {
      // Match PAYBACK's own client: tokens come from its freshly fetched page.
      if(!csrfToken) throw new Error('PAYBACK’s security token could not be read. Open PAYBACK and refresh the coupons.');
      headers['Content-Type']='application/json';headers['X-Xsrf-Token']=csrfToken;
      if(pageLoadRcid)headers['X-Page-Load-Rcid']=pageLoadRcid;
    }
    const r=await fetch(path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});
    if(r.status===401) return {authRequired:true};
    if(r.status===403)throw new Error('PAYBACK rejected this request (HTTP 403). Open PAYBACK, refresh your session, then try again.');
    if(!r.ok) throw new Error(`PAYBACK returned HTTP ${r.status}. Open PAYBACK and try again.`);
    return r;
  }
  async function list(partnerId) {
    const r=await request(couponUrl(partnerId));
    if(r.authRequired) return {status:'login',coupons:[],checkedAt:Date.now()};
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');
    csrfToken=doc.querySelector('meta[name="csrf_token"]')?.content || '';
    pageLoadRcid=doc.querySelector('meta[name="rcid"]')?.content || '';
    return parseDocument(doc,partnerId);
  }
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(sender.id!==chrome.runtime.id || msg.target!=='payback') return;
    (async()=>{
      if(!/^lp\d+$/.test(msg.partnerId||''))throw new Error('Invalid PAYBACK partner.');
      if(msg.type==='list') return list(msg.partnerId);
      const current=await list(msg.partnerId);
      if(current.status!=='ready') return current;
      const coupon=current.coupons.find(c=>c.id===msg.id);
      if(!coupon) throw new Error('This coupon is no longer available for this store. Refresh the list.');
      if(msg.type==='activate') {
        if(coupon.status==='activated') return current;
        if(coupon.status!=='not_activated') throw new Error('This coupon cannot be activated.');
        const r=await request('/couponing/api/coupon-activation',{couponId:coupon.id});
        if(r.authRequired) return {status:'login',coupons:[]};
        const data=await r.json();
        if(String(data.couponId)!==coupon.id || !data.activationInformation) throw new Error('PAYBACK did not confirm activation. Check the coupon on PAYBACK.');
        return list(msg.partnerId);
      }
      if(msg.type==='redeem') {
        if(coupon.status!=='activated' || !coupon.template) throw new Error('Open this coupon on PAYBACK to redeem it.');
        const u=new URL(coupon.template);
        if(!PayBonCore.httpsUrl(u.href)) throw new Error('Unsupported coupon destination.');
        const r=await request('/onsflows/api/jumptoshop',{shortname:msg.partnerId,jumpOutLocation:'COUPON',couponJumpToShopUrlTemplate:coupon.template});
        if(r.authRequired) return {status:'login',coupons:[]};
        const data=await r.json();
        if(!PayBonCore.httpsUrl(data.clickOutUrl) || /\[(?:shopping\.|pb_camp|category)/.test(data.clickOutUrl)) throw new Error('PAYBACK did not return a valid redemption link. Open PAYBACK to redeem.');
        return {status:'redirect',url:data.clickOutUrl};
      }
      throw new Error('Unsupported PAYBACK action.');
    })().then(reply).catch(e=>reply({status:'error',error:e.message,coupons:[]}));
    return true;
  });
})();
