const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mapping=JSON.parse(fs.readFileSync(path.join(root,'data/store-mapping.json'),'utf8'));
const stores=mapping.stores.filter(s=>s.domains.length).map(s=>({partnerId:s.partnerId,name:s.name,domains:s.domains,verifiedFallback:!!s.verifiedDomainEvidence}));
fs.writeFileSync(path.join(root,'extension/stores.json'),JSON.stringify(stores,null,2)+'\n');
console.log(`Bundled ${stores.length} store mappings.`);
