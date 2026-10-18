const fs = require('node:fs');
const path = require('node:path');
const PAGES_FILE = path.join(__dirname, '../catalogo/pages.json');
const CATALOG_FILE = path.join(__dirname, '../catalog.json');
const OEMBED_ENDPOINT = 'https://www.facebook.com/plugins/video/oembed.json';

function readJson(f){ try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return null} }
function isFacebookVideoUrl(v){
  if(typeof v!=='string'||!v.trim()) return false;
  try{ const u=new URL(v); return u.protocol==='https:' && (u.hostname==='facebook.com'||u.hostname.endsWith('.facebook.com')||u.hostname==='fb.watch'); }catch{return false}
}
async function buscarOembed(videoUrl, categoria){
  try{
    const endpoint = new URL(OEMBED_ENDPOINT);
    endpoint.searchParams.set('url', videoUrl);
    const r = await fetch(endpoint, {headers:{Accept:'application/json'}, signal: AbortSignal.timeout(15000)});
    if(!r.ok){
      console.warn(`oEmbed ${r.status} para ${videoUrl} - usando fallback`);
      return {id:videoUrl, titulo:'Vídeo público do Facebook', categoria, url:videoUrl, thumb:''};
    }
    const data = await r.json();
    return {id:videoUrl, titulo:(data.title||'Vídeo público do Facebook').slice(0,180), categoria, url:videoUrl, thumb:data.thumbnail_url||''};
  }catch(e){
    console.warn(`oEmbed falhou ${videoUrl}: ${e.message} - fallback`);
    return {id:videoUrl, titulo:'Vídeo público do Facebook', categoria, url:videoUrl, thumb:''};
  }
}
async function main(){
  const pages = readJson(PAGES_FILE) || {};
  const oldCatalog = readJson(CATALOG_FILE) || [];
  const lista=[];
  for(const cat in pages){ if(!Array.isArray(pages[cat])) continue; for(const u of pages[cat]){ if(isFacebookVideoUrl(u)) lista.push({url:u,categoria:cat}); else console.warn(`Pulando invalida em ${cat}: ${u}`); } }
  if(lista.length===0){ console.log('Nenhuma URL valida ainda, criando catalog vazio'); if(!fs.existsSync(CATALOG_FILE)) fs.writeFileSync(CATALOG_FILE,'[]\n'); return; }
  const validados=[];
  for(const item of lista){ const v=await buscarOembed(item.url,item.categoria); validados.push(v); console.log(`OK: ${item.url}`); }
  const merged=new Map();
  for(const i of Array.isArray(oldCatalog)?oldCatalog:[]){ if(i?.url) merged.set(i.url,i); }
  for(const i of validados) merged.set(i.url,{...merged.get(i.url)||{},...i});
  fs.writeFileSync(CATALOG_FILE, JSON.stringify([...merged.values()], null, 2)+'\n');
  console.log(`Salvo ${validados.length}, total ${merged.size}`);
}
main();
