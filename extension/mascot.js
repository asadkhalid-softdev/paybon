/* The count stays accessible DOM text; the sprite artwork never contains a baked-in count. */
(() => {
  const styles=`
    .paybon-mascot{all:unset;position:relative;display:block;width:144px;height:160px;box-sizing:border-box;cursor:pointer;font:600 12px/1.2 "Segoe UI",Arial,sans-serif;color:#142b4b;border-radius:14px;pointer-events:auto}
    .paybon-mascot:focus-visible{outline:3px solid #1744b5;outline-offset:3px}.paybon-mascot:hover{background:#1744b508}
    .paybon-sprite{position:absolute;inset:0;display:block;width:144px;height:144px;background-image:var(--paybon-sprite);background-size:200% 200%;background-position:0 0;background-repeat:no-repeat;clip-path:inset(30% 0 0 0);animation:paybon-idle 5s step-end infinite;pointer-events:none}
    /* Mask the atlas's slightly drifting billboard. Board and text share one fixed box. */
    .paybon-count{position:absolute;top:10px;left:38px;width:68px;height:33px;box-sizing:border-box;padding:2px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;color:#142b4b;background:#fff;border:2px solid #1744b5;border-radius:3px;font-size:15px;font-weight:800;line-height:15px;white-space:nowrap}
    .paybon-count small{display:block;flex:none;font-size:8px;line-height:9px;font-weight:650}
    .launcher.paybon-mascot{position:fixed;right:18px;bottom:16px;background:transparent;box-shadow:none;padding:0;border:0}.launcher.paybon-mascot[data-panel-open]{right:calc(min(390px,45vw) + 18px)}
    @keyframes paybon-idle{0%,39%,47%,100%{background-position:0 0}40%,43%{background-position:100% 0}44%,46%{background-position:0 100%}75%,85%{background-position:100% 100%}}
    @media(prefers-reduced-motion:reduce){.paybon-sprite{animation:none}}
  `;
  class Mascot {
    constructor(root,show,spriteUrl) {
      this.show=show;this.anchors=new Map();this.state={status:'loading'};this.spriteUrl=spriteUrl || chrome.runtime.getURL('fox-sprites.png');
      const style=document.createElement('style');style.textContent=styles;root.append(style);this.style=style;
      this.floating=this.makeButton(true);root.append(this.floating);
    }
    makeButton(floating=false) {
      const b=document.createElement('button');b.type='button';b.className=`paybon-mascot${floating?' launcher':''}`;
      b.style.setProperty('--paybon-sprite',`url("${this.spriteUrl}")`);
      const sprite=document.createElement('span');sprite.className='paybon-sprite';sprite.setAttribute('aria-hidden','true');
      const count=document.createElement('span');count.className='paybon-count';count.setAttribute('aria-hidden','true');
      b.append(sprite,count);b.addEventListener('click',this.show);this.paint(b);return b;
    }
    paint(button) {
      const state=this.state;
      const count=state.status==='ready'?String(state.coupons?.length || 0):state.status==='loading'?'…':state.status==='login'?'!':'?';
      const name=state.store?.name||state.coupons?.[0]?.partnerName||'store';
      const label=state.status==='ready'?`${count} ${name} coupon${count==='1'?'':'s'} detected`:state.status==='login'?'Login to PAYBACK required':state.status==='loading'?'Checking coupons':'Coupon check unavailable';
      const key=`${state.status}:${count}:${name}`;if(button.dataset.paybonState===key)return;button.dataset.paybonState=key;
      const text=button.querySelector('.paybon-count');text.replaceChildren(document.createTextNode(count));
      const small=document.createElement('small');small.textContent=state.status==='ready'?'coupons':state.status==='login'?'sign in':state.status==='loading'?'checking':'retry';text.append(small);
      button.setAttribute('aria-label',`PayBon: ${label}. Open coupon sidebar`);button.title=`${label} — open PayBon`;
    }
    sync(state,panelOpen,surfaces=new Set()) {
      this.state=state;this.paint(this.floating);
      this.floating.toggleAttribute('data-panel-open',panelOpen);
      const show=state.status==='ready'?(state.coupons?.length||0)>0:['login','error'].includes(state.status);
      const visible=show?[...surfaces].filter(el=>el.isConnected&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0):[];
      const targets=visible.filter(el=>!visible.some(other=>other!==el&&other.contains(el)));
      for(const [surface,host]of this.anchors)if(!targets.includes(surface)||!host.isConnected){host.remove();this.anchors.delete(surface);}
      for(const surface of targets){
        let host=this.anchors.get(surface);
        if(!host){
          host=document.createElement('div');host.setAttribute('data-paybon-mascot-host','');
          host.style.cssText='all:initial;display:block!important;position:relative!important;width:144px!important;height:160px!important;margin:12px auto!important;pointer-events:auto!important;';
          const shadow=host.attachShadow({mode:'closed'});const style=document.createElement('style');style.textContent=styles;
          const button=this.makeButton();shadow.append(style,button);host._paybonButton=button;
          surface.insertAdjacentElement('afterend',host);this.anchors.set(surface,host);
        }
        this.paint(host._paybonButton);
      }
      this.floating.hidden=!show||targets.length>0;
      this.floating.style.display=!show||targets.length?'none':'';
    }
    destroy(){for(const host of this.anchors.values())host.remove();this.anchors.clear();this.floating.remove();this.style.remove();}
  }
  globalThis.PayBonMascot=Mascot;
})();
