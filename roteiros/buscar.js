const fs = require('fs');
const path = require('path');
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '../catalogo/pages.json'), 'utf8'));
const TOKEN = process.env.FB_ACCESS_TOKEN;
async function buscar(pageId){
  const url = `https://graph.facebook.com/v20.0/${pageId}/videos?fields=id,title,permalink_url,thumbnails&limit=10&access_token=${TOKEN}`;
  const r = await fetch(url); const j = await r.json(); return j.data||[];
}
async function main(){
  let catalogo=[];
  for(const cat in pages){for(const pageId of pages[cat]){const vids=await buscar(pageId);vids.forEach(v=>catalogo.push({id:v.id,titulo:v.title||'Sem titulo',categoria:cat,url:v.permalink_url}));}}
  fs.writeFileSync('catalog.json', JSON.stringify(catalogo, null, 2));
}
main();
