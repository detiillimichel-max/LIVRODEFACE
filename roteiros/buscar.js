const fs = require('node:fs');
const path = require('node:path');

const PAGES_FILE = path.join(__dirname, '../catalogo/pages.json');
const CATALOG_FILE = path.join(__dirname, '../catalog.json');
const OEMBED_ENDPOINT = 'https://www.facebook.com/plugins/video/oembed.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isFacebookVideoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' ||
       url.hostname.endsWith('.facebook.com') ||
       url.hostname === 'fb.watch') &&
      !url.pathname.includes('/plugins/');
  } catch {
    return false;
  }
}

async function buscarOembed(videoUrl, categoria) {
  const endpoint = new URL(OEMBED_ENDPOINT);
  endpoint.searchParams.set('url', videoUrl);

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`oEmbed recusou a URL (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object' || !data.html) {
    throw new Error('A resposta oEmbed não confirmou um conteúdo incorporável.');
  }

  return {
    id: videoUrl,
    titulo: typeof data.title === 'string' && data.title.trim()
      ? data.title.trim().slice(0, 180)
      : 'Vídeo público do Facebook',
    categoria,
    url: videoUrl,
    thumb: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : ''
  };
}

async function main() {
  const pages = readJson(PAGES_FILE);
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    throw new Error('catalogo/pages.json precisa ser um objeto JSON com listas por categoria.');
  }

  const oldCatalog = fs.existsSync(CATALOG_FILE) ? readJson(CATALOG_FILE) : [];
  if (!Array.isArray(oldCatalog)) {
    throw new Error('catalog.json não contém uma lista válida. O arquivo foi preservado.');
  }

  const validUrls = [];
  for (const [categoria, urls] of Object.entries(pages)) {
    if (!Array.isArray(urls)) {
      throw new Error(`A categoria "${categoria}" precisa conter uma lista de URLs.`);
    }
    for (const url of urls) {
      if (!isFacebookVideoUrl(url)) {
        throw new Error(`URL inválida na categoria "${categoria}". Use o link completo de um vídeo público do Facebook.`);
      }
      validUrls.push({ url, categoria });
    }
  }

  if (validUrls.length === 0) {
    throw new Error('Nenhuma URL foi configurada em catalogo/pages.json. catalog.json não será alterado.');
  }

  const validated = [];
  const failures = [];
  for (const item of validUrls) {
    try {
      const video = await buscarOembed(item.url, item.categoria);
      validated.push(video);
      console.log(`oEmbed validado: ${item.url}`);
    } catch (error) {
      failures.push(`${item.url}: ${error.message}`);
      console.error(`oEmbed falhou para ${item.url}: ${error.message}`);
    }
  }

  if (validated.length === 0) {
    throw new Error('Nenhum vídeo foi validado pelo oEmbed. catalog.json existente foi preservado.');
  }

  // Mantém itens antigos e atualiza/adiciona somente URLs validadas pelo oEmbed.
  const merged = new Map();
  for (const item of oldCatalog) {
    if (item && isFacebookVideoUrl(item.url)) merged.set(item.url, item);
  }
  for (const item of validated) {
    merged.set(item.url, { ...(merged.get(item.url) || {}), ...item });
  }

  fs.writeFileSync(CATALOG_FILE, JSON.stringify([...merged.values()], null, 2) + '\n', 'utf8');
  console.log(`Salvo ${validated.length} vídeo(s) validados; catálogo total: ${merged.size}.`);

  if (failures.length) {
    console.warn(`${failures.length} URL(s) falharam e foram ignoradas; o catálogo anterior foi mantido.`);
  }
}

main().catch((error) => {
  console.error(`FALHA NA ATUALIZAÇÃO: ${error.message}`);
  process.exitCode = 1;
});
