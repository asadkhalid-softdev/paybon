(() => {
  const status=document.getElementById('popup-status');
  function error(message){status.hidden=false;status.textContent=message;}
  document.getElementById('open-settings').addEventListener('click',async()=>{
    try{await chrome.runtime.openOptionsPage();window.close();}catch{error('Could not open settings. Reload PayBon and try again.');}
  });
  document.getElementById('open-sidebar').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      const result=await chrome.runtime.sendMessage({type:'toolbar:open',tabId:tab?.id});
      if(!result?.ok)throw Error(result?.error||'Refresh this website, then open the side bar again.');
      window.close();
    }catch(e){error(e.message);}finally{button.disabled=false;}
  });
})();
