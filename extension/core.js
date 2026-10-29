/* Shared, dependency-free helpers. No page scripts are evaluated. */
(() => {
  const SUFFIXES = ['com','de','co.uk','fr','it','es','nl','pl','se','com.be','ie','co.jp','in','com.au','com.br','ca','com.mx','ae','sa','com.tr','sg','eg','co.za'];
  const PAYBACK_URL = 'https://www.payback.de/coupons?from=pb&incid=02_18004_001&partnerId=';
  function couponUrl(partnerId='') { const url=new URL(PAYBACK_URL);url.searchParams.set('partnerId',partnerId);return url.href; }
  function domain(value) {
    if(typeof value!=='string'||/[\s/:?#@]/.test(value.trim()))return null;
    try{const host=new URL(`https://${value.trim().replace(/^\*\./,'')}`).hostname.toLowerCase().replace(/^www\./,'');return host.includes('.')&&/^[a-z0-9.-]+$/.test(host)?host:null;}catch{return null;}
  }
  function storesForHost(stores,hostname) {const host=domain(hostname);return host?stores.filter(s=>s.domains?.some(d=>host===d||host.endsWith(`.${d}`))):[];}
  function httpsUrl(value) {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  function amazonHost(host) { return SUFFIXES.some(s => host === `amazon.${s}` || host.endsWith(`.amazon.${s}`)); }
  function checkpoint(path) { return /\/(?:gp\/(?:cart|buy)|cart|checkout)(?:\/|$)/i.test(path); }
  function tracked(url) {
    try { const u = new URL(url); return u.protocol === 'https:' && amazonHost(u.hostname) && u.searchParams.get('tag') === 'wwwpaybackde-21' && /^[a-zA-Z0-9-]{20,}![^\[\]]+$/.test(u.searchParams.get('ascsubtag') || ''); } catch { return false; }
  }
  function normalize(c,partnerId=null) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(c.id)) || !/^lp\d+$/.test(c.partnerShortName||'') || (partnerId && c.partnerShortName!==partnerId)) return null;
    const button = c.buttonList?.find(b => b.type === 'online');
    const logo=httpsUrl(c.partnerLogoUrl);const safeLogo=logo&&['www.payback.de','assets.payback.de','cdn.payback.cloud'].includes(new URL(logo).hostname)?logo:'';
    return {id:String(c.id),partnerId:c.partnerShortName,partnerName:String(c.partnerName||''),logoUrl:safeLogo,acceptanceType:c.acceptanceType||'', label:String(c.label || ''), multiplier:Number(String(c.label).match(/([\d.,]+)\s*FACH/i)?.[1]?.replace(',','.') || 0), description:String(c.description || ''), validity:String(c.validity || ''), status:c.status === 'activated' ? 'activated' : c.status === 'not_activated' ? 'not_activated' : 'unavailable', template:button?.action === 'deeplink' && httpsUrl(button.action_url) ? String(button.action_url) : '', information:String(c.additionalInformation === '$undefined' ? '' : c.additionalInformation || '')};
  }
  function sort(coupons) { return coupons.sort((a,b) => b.multiplier-a.multiplier || a.description.localeCompare(b.description,'de')); }
  // Extract balanced JSON objects from Next's inert Flight data, never eval/Function.
  function objects(text) {
    const result=[]; const re=/\{\s*"id"\s*:/g; let match;
    while ((match=re.exec(text))) {
      let depth=0, quoted=false, escaped=false;
      for(let i=match.index;i<text.length;i++) {
        const ch=text[i];
        if (quoted) { if(escaped) escaped=false; else if(ch==='\\') escaped=true; else if(ch==='"') quoted=false; }
        else if(ch==='"') quoted=true; else if(ch==='{') depth++; else if(ch==='}' && --depth===0) {
          try { result.push(JSON.parse(text.slice(match.index,i+1))); } catch { /* Ignore non-JSON Flight references. */ }
          re.lastIndex=i+1; break;
        }
      }
    }
    return result;
  }
  function parseDocument(doc,partnerId=null) {
    const scripts=[...doc.querySelectorAll('script')]; let flight='';
    for(const script of scripts) {
      const raw=script.textContent || '';
      const re=/self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?/g; let m;
      while((m=re.exec(raw))) { try { const part=JSON.parse(m[1]); if(part[0]===1 && typeof part[1]==='string') flight+=part[1]; } catch {} }
    }
    const coupons=new Map();
    for(const obj of objects(flight)) { const c=normalize(obj,partnerId); if(c) coupons.set(`${c.partnerId}:${c.id}`,c); }
    // The rendered cards are authoritative for activation, and work if Flight changes.
    for(const card of doc.querySelectorAll('[data-testid]')) {
      const id=card.getAttribute('data-testid').match(/^coupon-(\d+|dm_\d+)$/)?.[1];
      const logo=card.querySelector('img[alt="Coupon Partner Logo"]')||card.querySelector('img[src*="/lp"]');
      const cardPartner=logo?.getAttribute('src')?.match(/\/(lp\d+)\//)?.[1];
      if(!id || !cardPartner || (partnerId&&cardPartner!==partnerId)) continue;
      const active=!!card.querySelector(`[data-testid="coupon-button-${id}-online"], [data-testid="coupon-activation-checkmark-${id}"]`);
      const label=[...card.querySelectorAll(`[data-testid^="coupon-label-part-${id}-"]`)].map(e=>e.textContent).join('');
      const key=`${cardPartner}:${id}`,previous=coupons.get(key);
      const c=normalize({id,partnerShortName:cardPartner,partnerName:previous?.partnerName,partnerLogoUrl:logo.src,label,description:card.querySelector(`[data-testid="coupon-headline-description-${id}"]`)?.textContent,validity:card.querySelector(`[data-testid="coupon-validity-${id}"]`)?.textContent,status:active?'activated':card.querySelector(`[data-testid="coupon-button-${id}-not_activated"]`)?'not_activated':'unavailable'},partnerId);
      coupons.set(key,{...previous,...c,acceptanceType:previous?.acceptanceType||'',template:previous?.template || ''});
    }
    const loggedIn=!!doc.querySelector('a[href*="/reach/api/logout"]');
    const loginRedirect=[...doc.querySelectorAll('meta[http-equiv="refresh"],template[data-dgst]')].some(el=>{
      const value=el.getAttribute('content') || el.getAttribute('data-dgst') || '';
      return /(?:url\s*=\s*|NEXT_REDIRECT;[^;]*;)(?:https:\/\/www\.payback\.de)?\/login(?:[/?;]|$)/i.test(value);
    });
    const login=loginRedirect || !!doc.querySelector('a[href*="/login"],form[action*="login"]') || /Bitte (?:einloggen|anmelden)|Jetzt einloggen/i.test(doc.body?.textContent || '');
    const hasSections=!!doc.querySelector('[data-testid="not-activated-coupons-section"], [data-testid="activated-coupons-section"], [data-testid="coupons-partner-filter-select"]');
    const status=loggedIn ? (coupons.size || hasSections ? 'ready' : 'error') : login ? 'login' : 'error';
    return {status,coupons:status==='ready'?sort([...coupons.values()]):[],checkedAt:Date.now()};
  }
  const api={SUFFIXES,PAYBACK_URL,couponUrl,domain,storesForHost,httpsUrl,amazonHost,checkpoint,tracked,normalize,sort,objects,parseDocument};
  if(typeof module!=='undefined') module.exports=api;
  else globalThis.PayBonCore=api;
})();
