// Local visual fixtures. Requests and purchase controls never reach real stores.
const fs=require('node:fs');const http=require('node:http');const path=require('node:path');const C=require('../extension/core.js');
const base=path.resolve(__dirname,'..');
const samples=[...JSON.parse(fs.readFileSync(path.join(base,'tests/fixtures/multi-store-coupons.json'),'utf8')),...JSON.parse(fs.readFileSync(path.join(base,'tests/fixtures/alnatura-coupons.json'),'utf8'))];
const uiMock=`<script>const demoJobs=location.search.includes('running')?[{store:{partnerId:'lp54',name:'dm'},status:'running',total:50,completed:12}]:[];let demoEnabled=localStorage.getItem('paybon-preview-auto')==='true';window.chrome={runtime:{id:'preview',getManifest:()=>({version:'1.3.1 preview'}),openOptionsPage:async()=>{location.href='/extension/settings.html';},sendMessage:async m=>{if(m.type==='settings:update'){demoEnabled=m.autoActivate;localStorage.setItem('paybon-preview-auto',String(demoEnabled));return {ok:true};}if(m.type==='settings:get')return {ok:true,settings:{autoActivate:demoEnabled},jobs:demoJobs};return {ok:true};}},storage:{onChanged:{addListener(){}}},tabs:{query:async()=>[{id:1}],create:async()=>{}}};</script>`;
const page=`<!doctype html><html><head><meta charset="utf-8"><title>PayBon visual test</title><link rel="stylesheet" href="/extension/guard.css"><style>body{margin:0;background:#f5f6f8;color:#172743;font:16px Arial}nav{background:#172743;color:white;padding:24px}main{padding:48px}article{background:white;padding:24px;max-width:320px}.a-button{display:block;background:#ffd814;border-radius:20px;text-align:center}.a-button button{background:transparent;border:0;padding:12px;cursor:pointer}</style></head><body><nav>PayBon · Local visual fixture · No real account actions</nav><main><h1>Store preview</h1><p>Coupon data is a saved fixture. No purchases or activations are performed.</p><article><span class="a-button"><button id="buy-now-button" type="button">Buy now (inert fixture)</button></span></article></main><script src="/extension/core.js"></script><script src="/bootstrap.js"></script><script src="/extension/mascot.js"></script><script src="/extension/amazon.js"></script></body></html>`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/bootstrap.js'){
  const scenario=url.searchParams.get('scenario')||'ebay';const partner=scenario==='amazon'?'lp717463':scenario==='alnatura'?'lp387':'lp604887';
  const store={partnerId:partner,name:partner==='lp717463'?'Amazon':partner==='lp387'?'Alnatura':'eBay'};
  const data={status:scenario==='unknown'?'unsupported':'ready',...(scenario==='unknown'?{}:{store}),checkedAt:Date.now(),coupons:['zero','unknown'].includes(scenario)?[]:C.sort(samples.filter(c=>c.partnerShortName===partner).map(c=>C.normalize(c,partner)))};
  res.setHeader('Content-Type','text/javascript');res.end(`const data=${JSON.stringify(data)};const demoListeners=[];window.chrome={runtime:{id:'preview',getURL:f=>'/extension/'+f,onMessage:{addListener(fn){demoListeners.push(fn);}},sendMessage:async msg=>{if(msg.type==='openSettings'){location.href='/extension/settings.html';return {ok:true};}return data;}}};if(${JSON.stringify(scenario)}!=='amazon')document.querySelector('article').remove();document.querySelector('h1').textContent=${JSON.stringify(scenario)}+' preview';const open=document.createElement('button');open.type='button';open.textContent='Open coupon sidebar';open.addEventListener('click',()=>demoListeners.forEach(fn=>fn({type:'show'})));document.querySelector('main').append(open);`);return;
 }
 if(!url.pathname.startsWith('/extension/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page.replace('/bootstrap.js',`/bootstrap.js?scenario=${encodeURIComponent(url.searchParams.get('scenario')||'ebay')}`));return;}
 const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(path.join(base,'extension')+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,buffer)=>{
  if(error){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  if(file.endsWith('settings.html'))buffer=Buffer.from(buffer.toString().replace('<script src="settings.js">',uiMock+'<script src="settings.js">'));
  if(file.endsWith('popup.html'))buffer=Buffer.from(buffer.toString().replace('<script src="popup.js">',uiMock+'<script src="popup.js">'));
  // Allow the loopback HTTP fixture only in this server response, never in the packaged extension.
  if(file.endsWith('amazon.js'))buffer=Buffer.from(buffer.toString().replace("location.protocol!=='https:'","(location.protocol!=='https:'&&location.protocol!=='http:')"));
  res.end(buffer);
 });
}).listen(8787,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8787/?scenario=ebay (also amazon, zero, unknown)'));
