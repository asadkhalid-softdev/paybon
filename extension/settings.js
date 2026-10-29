(() => {
  const toggle=document.getElementById('auto-activate'),status=document.getElementById('save-status'),list=document.getElementById('activity-list');
  let saving=false;
  function message(text,error=false){status.textContent=text;status.toggleAttribute('data-error',error);}
  function element(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
  function renderJobs(jobs){
    list.replaceChildren();document.getElementById('activity-empty').hidden=jobs.length>0;
    for(const job of jobs){
      const item=element('li'),heading=element('div',null,'job-header');
      const labels={running:'Activating',complete:'Complete',stopped:'Stopped',error:'Paused',login:'Sign-in required'};
      heading.append(element('strong',job.store.name),element('span',labels[job.status]||job.status,'job-status'));item.append(heading);
      item.append(element('p',`${job.completed} of ${job.total} coupons confirmed active`,'job-detail'));
      if(job.error)item.append(element('p',job.error,'job-detail'));
      if(job.status==='running'){const progress=element('progress');progress.max=job.total||1;progress.value=job.completed;progress.setAttribute('aria-label',`Activation progress for ${job.store.name}`);item.append(progress);}
      if(['error','login','stopped'].includes(job.status)&&toggle.checked){
        const retry=element('button','Retry remaining coupons','quiet retry');retry.type='button';retry.addEventListener('click',async()=>{retry.disabled=true;try{const r=await chrome.runtime.sendMessage({type:'auto:retry',partnerId:job.store.partnerId});if(!r.ok)throw Error(r.error);await refresh();}catch(e){message(e.message||'Could not restart activation.',true);}finally{retry.disabled=false;}});item.append(retry);
      }
      list.append(item);
    }
  }
  async function refresh(){
    try{const result=await chrome.runtime.sendMessage({type:'settings:get'});if(!result?.ok)throw Error(result?.error||'Could not load settings.');if(!saving){toggle.checked=result.settings.autoActivate;toggle.disabled=false;message(toggle.checked?'Auto-Aktivierung is on. Visit a store to start.':'Auto-Aktivierung is off.');}renderJobs(result.jobs||[]);}
    catch(e){toggle.disabled=true;message(e.message||'Reload this settings page to reconnect to PayBon.',true);}
  }
  toggle.addEventListener('change',async()=>{
    saving=true;toggle.disabled=true;const enabled=toggle.checked;
    try{const result=await chrome.runtime.sendMessage({type:'settings:update',autoActivate:enabled});if(!result?.ok)throw Error(result?.error||'Could not save your preference.');message(enabled?'Saved. Auto-Aktivierung is on. Visit a store to start.':'Saved. Auto-Aktivierung is off. Any request already in progress will finish.');}
    catch(e){toggle.checked=!enabled;message(e.message||'Could not save your preference.',true);}
    finally{saving=false;toggle.disabled=false;}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if((area==='session'&&Object.keys(changes).some(k=>k.startsWith('autoJob:')))||(area==='local'&&changes.preferences))refresh();});
  document.getElementById('refresh-activity').addEventListener('click',refresh);
  document.getElementById('open-payback').addEventListener('click',()=>chrome.tabs.create({url:'https://www.payback.de/coupons'}));
  document.getElementById('version').textContent=`PayBon ${chrome.runtime.getManifest().version}`;
  refresh();
})();
