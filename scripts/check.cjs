const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const dir=path.join(__dirname,'../extension');const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
if(m.manifest_version!==3)throw Error('Manifest V3 required');
const stores=JSON.parse(fs.readFileSync(path.join(dir,'stores.json'),'utf8'));
if(!stores.length || stores.some(s=>!/^lp\d+$/.test(s.partnerId)||!s.name||!s.domains?.length))throw Error('Invalid bundled store mapping');
for(const script of fs.readdirSync(dir).filter(f=>f.endsWith('.js')))cp.execFileSync(process.execPath,['--check',path.join(dir,script)]);
for(const content of m.content_scripts)for(const f of [...content.js,...(content.css||[])])if(!fs.existsSync(path.join(dir,f)))throw Error(`Missing ${f}`);
for(const f of [m.options_ui?.page,m.action.default_popup].filter(Boolean)){
 if(!fs.existsSync(path.join(dir,f)))throw Error(`Missing ${f}`);
 const html=fs.readFileSync(path.join(dir,f),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!fs.existsSync(path.join(dir,match[1])))throw Error(`Missing page asset ${match[1]}`);
}
for(const f of [...Object.values(m.icons||{}),...Object.values(m.action.default_icon||{}),...m.web_accessible_resources.flatMap(r=>r.resources)])if(!fs.existsSync(path.join(dir,f)))throw Error(`Missing asset ${f}`);
console.log('Manifest and JavaScript syntax checks passed.');
