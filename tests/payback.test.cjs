const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
function bridge({postStatus=200,token=true,partnerId='lp717463',template='https://www.amazon.de/b?tag=wwwpaybackde-21&ascsubtag=[shopping.context]![category]',destination='https://www.amazon.de/b?tag=wwwpaybackde-21&ascsubtag=00000000-0000-4000-8000-000000000000!0!02_18004_001!0'}={}) {
 const dom=new JSDOM('',{url:'https://www.payback.de/coupons',runScripts:'outside-only'});const w=dom.window;let listener,activated=false;const calls=[];
 const fixture=fs.readFileSync('tests/fixtures/coupons.html','utf8');
 const coupon={id:'900002',partnerShortName:partnerId,label:'10FACH °P',status:'activated',buttonList:[{type:'online',action:'deeplink',action_url:template}]};
 w.AbortSignal=AbortSignal;w.chrome={runtime:{id:'self',onMessage:{addListener:f=>listener=f}}};
 w.fetch=async(url,options)=>{
  calls.push({url,options});
  if(options.method==='GET') {
   let html=fixture;if(activated)html=html.replace('coupon-button-900005-not_activated','coupon-button-900005-online');
   return new Response('<meta name="rcid" content="test-page-id">'+(token?'<meta name="csrf_token" content="test-csrf-token">':'')+'<a href="/reach/api/logout">Logout</a>'+html+'<script>self.__next_f.push('+JSON.stringify([1,'1:'+JSON.stringify({coupons:[coupon]})])+')</script>');
  }
  if(postStatus!==200)return new Response('{}',{status:postStatus});
  if(url.includes('coupon-activation')){activated=true;return Response.json({couponId:'900005',activationInformation:'Aktiviert am: 29.10.2026'});}
  return Response.json({clickOutUrl:destination});
 };
 w.eval(fs.readFileSync('extension/core.js','utf8'));w.eval(fs.readFileSync('extension/payback.js','utf8'));
 return {calls,close:()=>w.close(),send:msg=>new Promise(resolve=>listener({partnerId,...msg,target:'payback'},{id:'self'},resolve))};
}
test('activation uses PAYBACK CSRF metadata and confirms updated state',async()=>{
 const b=bridge();try{const result=await b.send({type:'activate',id:'900005'});assert.equal(result.status,'ready');assert.equal(result.coupons.find(c=>c.id==='900005').status,'activated');const post=b.calls.find(c=>c.options.method==='POST');assert.equal(post.options.headers['X-Xsrf-Token'],'test-csrf-token');assert.equal(post.options.headers['X-Page-Load-Rcid'],'test-page-id');assert.equal(post.options.credentials,'include');assert.deepEqual(JSON.parse(post.options.body),{couponId:'900005'});}finally{b.close();}
});
test('redemption uses a fresh CSRF token and the actual coupon template',async()=>{
 const b=bridge();try{const result=await b.send({type:'redeem',id:'900002'});assert.equal(result.status,'redirect');assert(result.url.includes('00000000'));const post=b.calls.find(c=>c.options.method==='POST');assert.equal(post.options.headers['X-Xsrf-Token'],'test-csrf-token');assert.equal(JSON.parse(post.options.body).shortname,'lp717463');assert(JSON.parse(post.options.body).couponJumpToShopUrlTemplate.includes('[shopping.context]'));}finally{b.close();}
});
test('403 rejection is an actionable error, while 401 requests login',async()=>{
 for(const [code,status]of [[403,'error'],[401,'login']]){const b=bridge({postStatus:code});try{assert.equal((await b.send({type:'activate',id:'900005'})).status,status);}finally{b.close();}}
});
test('missing CSRF metadata prevents a mutation and does not claim activation',async()=>{
 const b=bridge({token:false});try{const result=await b.send({type:'activate',id:'900005'});assert.equal(result.status,'error');assert(result.error.includes('security token'));assert(!b.calls.some(c=>c.options.method==='POST'));}finally{b.close();}
});

test('non-Amazon redemption uses the selected partner and supports PAYBACK redirect services',async()=>{
 const b=bridge({partnerId:'lp604887',template:'https://www.ebay.de/?ref=[shopping.context]',destination:'https://tracking.example.org/redirect?ref=resolved'});
 try{const r=await b.send({type:'redeem',id:'900002'});assert.equal(r.status,'redirect');assert.equal(r.url,'https://tracking.example.org/redirect?ref=resolved');const post=b.calls.find(c=>c.options.method==='POST');assert.equal(JSON.parse(post.options.body).shortname,'lp604887');assert(b.calls[0].url.includes('partnerId=lp604887'));}finally{b.close();}
});

test('bridge rejects unsafe destinations and coupons belonging to a different partner',async()=>{
 const b=bridge({destination:'javascript:alert(1)'});try{assert.equal((await b.send({type:'redeem',id:'900002'})).status,'error');}finally{b.close();}
 const other=bridge();try{assert.equal((await other.send({type:'redeem',id:'900002',partnerId:'lp604887'})).status,'error');assert(!other.calls.some(c=>c.options.method==='POST'));}finally{other.close();}
});
