const fs = require('fs');
const path = require('path');
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '../catalogo/pages.json'), 'utf8'));
const TOKEN = process.env.FB_ACCESS_TOKEN;

async function buscar(pageId){
  const url = `https://graph.facebook.com/v20.0/${pageId}/videos?fields=id,title,permalink_url&limit=5&access_token=${TOKEN}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if(j.error){ console.log('Erro FB', pageId, j.error.message); return []; }
    return j.data||[];
  } catch(e){ console.log('Erro', e.message); return []; }
}

async function main(){
  let catalogo=[];
  for(const cat in pages){
    for(const pageId of pages[cat]){
      const vids=await buscar(pageId);
      vids.forEach(v=>catalogo.push({id:v.id,titulo:v.title||'Video',categoria:cat,url:v.permalink_url}));
    }
  }
  if(catalogo.length===0){ console.log('Nenhum video veio, criando vazio para nao falhar'); catalogo=[]; }
  fs.writeFileSync('catalog.json', JSON.stringify(catalogo, null, 2));
  console.log('Salvo '+catalogo.length);
}
main();
