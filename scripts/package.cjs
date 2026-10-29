const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
cp.execFileSync(process.execPath,['scripts/check.cjs'],{stdio:'inherit'});
const out=path.resolve('dist');fs.mkdirSync(out,{recursive:true});
const version=JSON.parse(fs.readFileSync('extension/manifest.json')).version;
// Copy only the runtime assets; tests, fixtures and account data are never shipped.
const unpacked=path.join(out,'paybon');fs.mkdirSync(unpacked,{recursive:true});
for(const file of fs.readdirSync('extension')){if(!/\.(?:html|js|json|css|png|woff2?)$/.test(file))continue;fs.copyFileSync(path.join('extension',file),path.join(unpacked,file));}
// Include end-user setup instructions; development links apply to the source project only.
fs.writeFileSync(path.join(unpacked,'README.md'),fs.readFileSync('README.md','utf8').split(/\r?\n## Development\r?\n/)[0].trim()+'\n');
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(file,path.join(unpacked,file));
fs.cpSync('licenses',path.join(unpacked,'licenses'),{recursive:true});
cp.execFileSync('powershell.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath 'dist/paybon' -DestinationPath 'dist/paybon-${version}.zip' -Force`],{stdio:'inherit'});
console.log(`Created dist/paybon and dist/paybon-${version}.zip`);
