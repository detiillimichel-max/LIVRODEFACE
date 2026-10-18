const fs = require('node:fs');
const path = require('node:path');

const INPUT = path.join(__dirname, '../salvos.json');
const OUTPUT = path.join(__dirname, '../catalogo/candidatos.json');
const FB_HOSTS = new Set(['facebook.com', 'fb.watch']);
function isFacebookUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' &&
      (FB_HOSTS.has(u.hostname.toLowerCase()) || u.hostname.toLowerCase().endsWith('.facebook.com'));
  } catch { return false; }
}
function cleanUrl(value) {
  if (!isFacebookUrl(value)) return '';
  try {
    const u = new URL(value.trim());
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}
function fields(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const item of (Array.isArray(obj.label_values) ? obj.label_values : [])) {
    const label = String(item?.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (label === 'url' || label.includes('link')) out.url = cleanUrl(item?.value || item?.href || '');
    if (label.includes('titulo') || label === 'title' || label === 'nome') out.titulo = String(item?.value || '').trim();
  }
  if (typeof obj.title === 'string' && obj.title.trim()) out.titulo ||= obj.title.trim();
  if (typeof obj.href === 'string') out.url ||= cleanUrl(obj.href);
  if (typeof obj.url === 'string') out.url ||= cleanUrl(obj.url);
  return out;
}
function main() {
  if (!fs.existsSync(INPUT)) throw new Error('salvos.json não encontrado na raiz. Não alterei o catálogo.');
  const raw = fs.readFileSync(INPUT, 'utf8');
  if (!raw.trim()) throw new Error('salvos.json está vazio ou não foi enviado corretamente.');
  let root;
  try { root = JSON.parse(raw); } catch (e) { throw new Error('salvos.json não é JSON válido: ' + e.message); }

  const found = new Map();
  const seen = new WeakSet();
  function walk(node, category = 'Meus vídeos salvos') {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    let nextCategory = category;
    if (typeof node.title === 'string' && node.title.trim()) nextCategory = node.title.trim();
    const f = fields(node);
    if (f.url) {
      const url = f.url;
      const videoLike = /\/(reel|videos?)\//i.test(new URL(url).pathname) || /fb\.watch/i.test(url);
      if (videoLike && !found.has(url)) found.set(url, {
        id: url, url, titulo: f.titulo || nextCategory || 'Vídeo salvo do Facebook',
        categoria: nextCategory || 'Meus vídeos salvos', fonte: 'salvos.json'
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'title' && typeof value === 'string') continue;
      if (Array.isArray(value)) for (const child of value) walk(child, nextCategory);
      else if (value && typeof value === 'object') walk(value, nextCategory);
      else if ((key === 'href' || key === 'url' || key === 'value') && typeof value === 'string') {
        const url = cleanUrl(value);
        if (url && /\/(reel|videos?)\//i.test(new URL(url).pathname) && !found.has(url)) {
          found.set(url, { id: url, url, titulo: nextCategory, categoria: nextCategory, fonte: 'salvos.json' });
        }
      }
    }
  }
  walk(root);
  const videos = [...found.values()];
  if (!videos.length) throw new Error('Nenhum link de vídeo reconhecido em salvos.json. Catálogo anterior preservado.');
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT + '.tmp', JSON.stringify(videos, null, 2) + '\n');
  fs.renameSync(OUTPUT + '.tmp', OUTPUT);
  console.log('Links únicos de vídeo extraídos: ' + videos.length);
}
main();
