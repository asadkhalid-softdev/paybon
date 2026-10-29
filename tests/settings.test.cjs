const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,15));
async function settings(){
 const dom=new JSDOM(fs.readFileSync('extension/settings.html','utf8'),{url:'https://settings.example/',runScripts:'outside-only'});const w=dom.window;let enabled=false,changed;const messages=[];
 let jobs=[];
 w.chrome={runtime:{getManifest:()=>({version:'1.3.0'}),sendMessage:async msg=>{messages.push(msg);if(msg.type==='settings:update'){enabled=msg.autoActivate;return {ok:true};}if(msg.type==='settings:get')return {ok:true,settings:{autoActivate:enabled},jobs};return {ok:true};}},storage:{onChanged:{addListener:f=>changed=f}},tabs:{create:async()=>{}}};
 w.eval(fs.readFileSync('extension/settings.js','utf8'));await tick();
 return {dom,w,messages,jobs:value=>{jobs=value;changed({'autoJob:lp54':{}},'session');}};
}
test('settings toggle loads off, saves on/off and shows batch progress and retry',async()=>{
 const t=await settings();try{
  const toggle=t.w.document.getElementById('auto-activate');assert(!toggle.checked);assert(!toggle.disabled);
  toggle.click();await tick();assert(t.messages.some(m=>m.type==='settings:update'&&m.autoActivate===true));assert(t.w.document.getElementById('save-status').textContent.includes('Saved'));
  t.jobs([{store:{partnerId:'lp54',name:'dm'},status:'running',total:50,completed:12}]);await tick();assert.equal(t.w.document.querySelector('progress').max,50);assert.equal(t.w.document.querySelector('progress').value,12);
  t.jobs([{store:{partnerId:'lp54',name:'dm'},status:'error',total:50,completed:12,error:'Sign in to PAYBACK.'}]);await tick();t.w.document.querySelector('.retry').click();await tick();assert(t.messages.some(m=>m.type==='auto:retry'&&m.partnerId==='lp54'));
  toggle.click();await tick();assert(t.messages.some(m=>m.type==='settings:update'&&m.autoActivate===false));
 }finally{t.dom.window.close();}
});
test('toolbar popup exposes both requested actions and reports unavailable sidebar',async()=>{
 const dom=new JSDOM(fs.readFileSync('extension/popup.html','utf8'),{url:'https://popup.example/',runScripts:'outside-only'});const w=dom.window;let opened=0,closed=0;const messages=[];
 w.close=()=>{closed++;};w.chrome={tabs:{query:async()=>[{id:42}]},runtime:{openOptionsPage:async()=>{opened++;},sendMessage:async msg=>{messages.push(msg);return {ok:false,error:'Refresh this website.'};}}};
 try{w.eval(fs.readFileSync('extension/popup.js','utf8'));assert.equal(w.document.querySelectorAll('nav button').length,2);w.document.getElementById('open-sidebar').click();await tick();assert.equal(messages[0].type,'toolbar:open');assert.equal(messages[0].tabId,42);assert.equal(w.document.getElementById('popup-status').textContent,'Refresh this website.');assert(!w.document.getElementById('popup-status').hidden);w.document.getElementById('open-settings').click();await tick();assert.equal(opened,1);assert.equal(closed,1);}finally{dom.window.close();}
});

test('a failed preference save rolls back the switch instead of claiming opt-in succeeded',async()=>{
 const t=await settings();try{t.w.chrome.runtime.sendMessage=async()=>({ok:false,error:'Preference could not be saved.'});const toggle=t.w.document.getElementById('auto-activate');toggle.click();await tick();assert(!toggle.checked);assert(!toggle.disabled);assert(t.w.document.getElementById('save-status').hasAttribute('data-error'));assert(t.w.document.getElementById('save-status').textContent.includes('could not be saved'));}finally{t.dom.window.close();}
});
