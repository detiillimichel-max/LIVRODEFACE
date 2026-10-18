const fs = require('node:fs');
const path = require('node:path');

const PAGES_FILE = path.join(__dirname, '../catalogo/pages.json');
const CATALOG_FILE = path.join(__dirname, '../catalog.json');
const API_VERSION = 'v26.0';
const TOKEN = process.env.FB_ACCESS_TOKEN;

function lerJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`JSON inválido em ${path.relative(process.cwd(), file)}: ${error.message}`);
  }
}

function urlFacebookValida(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' ||
       url.hostname.endsWith('.facebook.com') ||
       url.hostname === 'fb.watch');
  } catch {
    return false;
  }
}

function pareceVideo(post) {
  const anexos = post.attachments && Array.isArray(post.attachments.data)
    ? post.attachments.data
    : [];
  const temVideo = anexos.some((anexo) =>
    anexo.media_type === 'video' ||
    anexo.type === 'video' ||
    anexo.type === 'native_video'
  );
  const link = typeof post.permalink_url === 'string' ? post.permalink_url : '';
  return temVideo || /\/(reel|videos|watch)\//i.test(link) || /\/watch\?v=/i.test(link);
}

async function buscar(pageId, categoria) {
  const endpoint = new URL(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(pageId)}/posts`);
  endpoint.searchParams.set('fields', 'id,message,permalink_url,created_time,attachments{media_type,type,url,target}');
  endpoint.searchParams.set('limit', '25');

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Meta respondeu algo que não é JSON para o identificador ${pageId} (HTTP ${response.status}).`);
  }

  if (!response.ok || payload.error) {
    const metaError = payload.error || {};
    const code = metaError.code ? ` código ${metaError.code}` : '';
    throw new Error(`Meta rejeitou ${pageId} (HTTP ${response.status}${code}): ${metaError.message || 'resposta sem detalhes'}`);
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(`Resposta inesperada da Meta para ${pageId}: campo data ausente.`);
  }

  return payload.data
    .filter((post) => post && post.id && urlFacebookValida(post.permalink_url) && pareceVideo(post))
    .map((post) => ({
      id: String(post.id),
      titulo: String(post.message || 'Vídeo do Facebook').trim().slice(0, 180) || 'Vídeo do Facebook',
      categoria,
      url: post.permalink_url,
      ...(post.created_time ? { data: post.created_time } : {})
    }));
}

async function main() {
  if (!TOKEN || !TOKEN.trim()) {
    throw new Error('O segredo FB_ACCESS_TOKEN não está configurado no GitHub Actions.');
  }

  const pages = lerJson(PAGES_FILE, null);
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    throw new Error('catalogo/pages.json precisa conter um objeto JSON com categorias e IDs de Páginas.');
  }

  const antigo = lerJson(CATALOG_FILE, []);
  if (!Array.isArray(antigo)) {
    throw new Error('catalog.json precisa conter uma lista JSON; o arquivo existente foi preservado.');
  }

  const encontrados = [];
  const falhas = [];
  let consultasBemSucedidas = 0;

  for (const [categoria, ids] of Object.entries(pages)) {
    if (!Array.isArray(ids)) {
      falhas.push(`Categoria "${categoria}" não contém uma lista de IDs.`);
      continue;
    }

    for (const pageId of ids) {
      if (typeof pageId !== 'string' && typeof pageId !== 'number') {
        falhas.push(`ID inválido na categoria "${categoria}".`);
        continue;
      }

      try {
        const videos = await buscar(String(pageId), categoria);
        consultasBemSucedidas += 1;
        encontrados.push(...videos);
        console.log(`Fonte ${pageId}: ${videos.length} vídeo(s) reconhecido(s).`);
      } catch (error) {
        falhas.push(error.message);
        console.error(error.message);
      }
    }
  }

  if (consultasBemSucedidas === 0) {
    throw new Error('Nenhuma fonte pôde ser consultada. catalog.json não será alterado.');
  }

  if (encontrados.length === 0) {
    if (falhas.length > 0) {
      throw new Error(`Nenhum vídeo novo foi encontrado e ${falhas.length} consulta(s) falharam. catalog.json foi preservado.`);
    }
    console.warn('As fontes responderam, mas nenhum vídeo público foi identificado. catalog.json existente foi preservado.');
    return;
  }

  const porUrl = new Map();
  for (const item of [...antigo, ...encontrados]) {
    if (item && urlFacebookValida(item.url)) {
      const chave = item.url;
      if (!porUrl.has(chave)) porUrl.set(chave, item);
      else porUrl.set(chave, { ...porUrl.get(chave), ...item });
    }
  }

  const catalogo = [...porUrl.values()];
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalogo, null, 2) + '\n', 'utf8');
  console.log(`Catálogo salvo com ${catalogo.length} item(ns), incluindo ${encontrados.length} resultado(s) da busca.`);

  if (falhas.length > 0) {
    console.warn(`Atenção: ${falhas.length} consulta(s) falharam. O catálogo anterior foi mesclado para evitar perda de itens.`);
  }
}

main().catch((error) => {
  console.error(`FALHA NA ATUALIZAÇÃO: ${error.message}`);
  process.exitCode = 1;
});
