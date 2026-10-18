const fs = require('node:fs');
const path = require('node:path');

const PAGES_FILE = path.join(__dirname, '../catalogo/pages.json');
const CATALOG_FILE = path.join(__dirname, '../catalog.json');
const OEMBED_ENDPOINT = 'https://graph.facebook.com/v26.0/oembed_video';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REQUESTS_PER_RUN = 900;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isFacebookVideoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch');
  } catch {
    return false;
  }
}

async function validarOembed(videoUrl, categoria) {
  const endpoint = new URL(OEMBED_ENDPOINT);
  endpoint.searchParams.set('url', videoUrl);
  endpoint.searchParams.set('omitscript', 'true');
  endpoint.searchParams.set('useiframe', 'true');

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.warn(`REPROVADO/PENDENTE HTTP ${response.status}: ${videoUrl}`);
      return null;
    }

    const data = await response.json();

    // Uma resposta HTTP 200 sozinha não basta: exigimos HTML de incorporação.
    if (typeof data.html !== 'string' || !data.html.includes('<iframe')) {
      console.warn(`PENDENTE: resposta sem iframe de incorporação: ${videoUrl}`);
      return null;
    }

    return {
      id: videoUrl,
      titulo: 'Vídeo público do Facebook',
      categoria,
      url: videoUrl,
      thumb: '',
      validacao: 'oembed_ok',
      validadoEm: new Date().toISOString()
    };
  } catch (error) {
    console.warn(`PENDENTE erro de rede/oEmbed: ${videoUrl} — ${error.message}`);
    return null;
  }
}

async function main() {
  const pages = readJson(PAGES_FILE);
  const oldCatalog = readJson(CATALOG_FILE);

  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    throw new Error('catalogo/pages.json ausente ou inválido. Catálogo atual preservado.');
  }

  const lista = [];
  const vistos = new Set();

  for (const [categoria, urls] of Object.entries(pages)) {
    if (!Array.isArray(urls)) continue;
    for (const url of urls) {
      if (!isFacebookVideoUrl(url)) {
        console.warn(`Ignorando URL inválida em ${categoria}: ${url}`);
        continue;
      }
      if (vistos.has(url)) continue;
      vistos.add(url);
      lista.push({ url, categoria });
    }
  }

  if (lista.length === 0) {
    console.log('Nenhuma URL candidata. Catálogo anterior preservado.');
    return;
  }

  const candidatos = lista.slice(0, MAX_REQUESTS_PER_RUN);
  if (lista.length > MAX_REQUESTS_PER_RUN) {
    console.warn(`Lote limitado a ${MAX_REQUESTS_PER_RUN}; ${lista.length - MAX_REQUESTS_PER_RUN} URLs ficam para a próxima execução.`);
  }

  const validados = [];
  for (const item of candidatos) {
    const video = await validarOembed(item.url, item.categoria);
    if (video) {
      validados.push(video);
      console.log(`oEmbed OK: ${item.url}`);
    }
  }

  // Não apaga nem substitui um catálogo funcional se a API falhar ou não validar nenhum item.
  if (validados.length === 0) {
    console.warn('Nenhum vídeo foi validado nesta execução. Catálogo anterior preservado.');
    return;
  }

  const merged = new Map();
  for (const item of Array.isArray(oldCatalog) ? oldCatalog : []) {
    if (item && isFacebookVideoUrl(item.url)) merged.set(item.url, item);
  }
  for (const item of validados) {
    merged.set(item.url, { ...merged.get(item.url), ...item });
  }

  const tempFile = CATALOG_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify([...merged.values()], null, 2) + '\n');
  fs.renameSync(tempFile, CATALOG_FILE);
  console.log(`Validados nesta execução: ${validados.length}. Total no catálogo preservado/atualizado: ${merged.size}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
