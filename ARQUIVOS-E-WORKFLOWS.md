# LIVRODEFACE — guia de arquivos e automações

Este documento explica o papel dos arquivos do repositório, com atenção especial aos GitHub Actions (workflows).

## Resumo: o caminho dos dados

1. **`salvos.json`** — exportação de itens salvos do Facebook enviada ao repositório.
2. **`roteiros/importar-salvos.js`** — lê o JSON, encontra links de Reels/vídeos do Facebook, remove duplicados e gera `catalogo/candidatos.json`.
3. **`catalogo/candidatos.json`** — catálogo de candidatos que o aplicativo pode exibir, mesmo quando a incorporação não é confirmada.
4. **`roteiros/buscar.js`** — tenta validar a incorporação pelo endpoint oEmbed da Meta usando os links de `catalogo/pages.json`; quando consegue, atualiza `catalog.json`. Se não valida nenhum, preserva o catálogo existente.
5. **`index.html`** — carrega `catalog.json` e `catalogo/candidatos.json`, elimina URLs repetidas e desenha carrosséis horizontais. Cada cartão tenta exibir o player do Facebook e também oferece **Abrir no Facebook**.
6. **`.github/workflows/facebook.yml`** — executa a importação, tenta a validação e publica o site no GitHub Pages.

## Arquivos da raiz

### `salvos.json`
Arquivo de entrada exportado pelo Facebook. O importador procura URLs do Facebook nos campos estruturados do JSON. Deve estar na raiz, exatamente com esse nome. Não é o arquivo que o navegador lê diretamente.

### `index.html`
Página principal do PWA. Contém HTML, CSS e JavaScript do aplicativo:
- carrega `catalog.json` e `catalogo/candidatos.json`;
- junta os dois catálogos e remove links duplicados;
- agrupa os cartões pela propriedade `categoria`;
- cria faixas horizontais com rolagem;
- tenta incorporar cada link em um iframe do plugin de vídeo do Facebook;
- mostra o botão **Abrir no Facebook** como alternativa;
- apresenta quantos links conseguiu carregar.

**Importante:** carregar um link no carrossel não significa que o Facebook permitirá tocar o vídeo dentro do iframe. Isso depende das permissões, disponibilidade e regras de incorporação do vídeo.

### `catalog.json`
Catálogo usado para os vídeos que o processo de validação conseguiu registrar. O formato esperado é uma lista de objetos com campos como `id`, `titulo`, `categoria`, `url` e `thumb`. O roteiro de validação preserva itens antigos quando a Meta não confirma novos vídeos.

### `manifest.json`
Configuração de instalação do PWA: nome, nome curto, ícone, cores, orientação e endereço inicial.

### `service-worker.js`
Ajuda o PWA a abrir a estrutura básica quando está offline, mantendo em cache os arquivos principais da interface. O catálogo e os players do Facebook dependem de rede para conteúdo atualizado e reprodução.

### `icon.svg`
Ícone vetorial do LIVRODEFACE, usado pelo site e pelo PWA.

### `README.md`
Apresentação curta do repositório. Este guia detalhado fica em `ARQUIVOS-E-WORKFLOWS.md`.

## Pasta `catalogo/`

### `catalogo/candidatos.json`
Lista de links extraídos de `salvos.json). É a fonte ampla de candidatos do app; um candidato pode aparecer mesmo sem validação de incorporação. Cada item normalmente tem:
- `id`: identificador (neste projeto, a URL);
- `url`: link do Facebook;
- `titulo`: título disponível ou texto genérico;
- `categoria`: por exemplo, `Reels do Facebook` ou `Vídeos do Facebook`;
- `fonte`: origem da informação.

### `catalogo/pages.json`
Mapa manual de categorias e URLs usado por `roteiros/buscar.js` para tentar validar vídeos pela API oEmbed. **Não é a lista automática completa de todos os itens salvos.** Para que o validador teste todos os candidatos, o código precisa ser adaptado para ler `catalogo/candidatos.json` em vez de depender apenas deste arquivo. Não confundir validação oEmbed com prova absoluta de que todo vídeo tocará em todos os dispositivos.

## Pasta `roteiros/`

### `roteiros/importar-salvos.js`
Automação de importação:
- verifica se `salvos.json` existe e contém JSON válido;
- percorre a estrutura recursivamente;
- reconhece links de Facebook/Reels/vídeos;
- normaliza URLs e elimina duplicados;
- separa Reels de outros vídeos;
- grava `catalogo/candidatos.json` por arquivo temporário e troca atômica;
- interrompe com erro se não encontrar links, para não substituir o catálogo por uma lista vazia.

### `roteiros/buscar.js`
Validador oEmbed:
- lê `catalogo/pages.json`;
- consulta `https://graph.facebook.com/v26.0/oembed_video`;
- considera candidato validado quando a resposta contém HTML de iframe;
- limita as consultas a 900 por execução e aplica timeout por pedido;
- mescla os itens confirmados em `catalog.json`;
- se não conseguir validar nenhum, mantém o catálogo anterior.

A variável secreta `FB_ACCESS_TOKEN` é passada pelo workflow, mas a versão atual do roteiro não a utiliza na requisição. Se o endpoint da Meta exigir autenticação no ambiente de execução, a validação pode falhar; isso não impede a página de exibir os candidatos e oferecer o link externo.

## Pasta `.github/workflows/`

### `.github/workflows/facebook.yml` — workflow principal
É a automação que conecta os passos. É acionada:
- automaticamente quando há um push nas branches `main` ou `principal`;
- manualmente pelo botão **Run workflow** na aba Actions.

Passos definidos:
1. baixa o repositório com `actions/checkout`;
2. configura Node.js 22;
3. executa `node roteiros/importar-salvos.js`;
4. tenta executar `node roteiros/buscar.js`, mas deixa a publicação continuar se a validação falhar;
5. salva `catalogo/candidatos.json` e `catalog.json` em um commit se houver mudanças e se a importação tiver sido bem-sucedida;
6. configura o GitHub Pages;
7. empacota o repositório como site;
8. publica o site;
9. avisa nos logs se a validação Meta falhou.

A opção `continue-on-error: true` no passo de validação é intencional: falhar a tentativa de oEmbed não deve impedir a publicação dos links candidatos. Os passos de publicação usam `if: always()`, portanto podem ser tentados mesmo depois de uma falha anterior; se a importação falhar, os arquivos anteriores devem ser preservados e os logs precisam ser consultados.

### `pages-build-deployment`
O GitHub Pages também pode mostrar execuções de implantação identificadas como **pages build and deployment**. Essas execuções representam a etapa/integração de publicação do Pages e não substituem o workflow principal que importa `salvos.json`. Para verificar a importação, procure primeiro **Facebook - Importa, Organiza e Publica** e abra os passos do job.

## Como testar o app agora

1. Abra: https://detiillimichel-max.github.io/LIVRODEFACE/
2. Aguarde a mensagem de carregamento.
3. Confirme se aparece uma contagem de links e se os carrosséis **Reels do Facebook** e **Vídeos do Facebook** aparecem.
4. Arraste os carrosséis horizontalmente.
5. Teste primeiro o botão **Abrir no Facebook** de um cartão. Depois observe se o player incorporado também carrega.
6. Se a página antiga aparecer, atualize a página; se necessário, feche e reabra o navegador.

## Como diagnosticar um problema

- **Nenhum link / fonte indisponível:** confira se `catalogo/candidatos.json` está publicado e se o arquivo JSON é válido.
- **Links aparecem, mas o player fica preto ou dá erro:** abra o mesmo link pelo botão externo. O problema pode ser uma restrição de incorporação do Facebook, não da importação.
- **O catálogo não atualiza após trocar `salvos.json`:** abra Actions → **Facebook - Importa, Organiza e Publica** → execução mais recente → confira os logs dos passos de importação e publicação.
- **A validação Meta falha, mas os candidatos aparecem:** a importação e a interface podem continuar funcionando; a validação de incorporação é uma etapa separada.
- **A importação falha com JSON inválido ou arquivo ausente:** confira se o arquivo está na raiz e se o upload terminou corretamente.

## Limites conhecidos nesta versão

1. `index.html` lê candidatos e catálogo e já os organiza em carrosséis horizontais.
2. A importação automática depende de `salvos.json` estar presente na raiz do repositório.
3. O validador ainda usa `catalogo/pages.json`, que contém uma pequena lista manual, em vez de testar automaticamente toda a lista de `catalogo/candidatos.json`.
4. Um iframe não consegue forçar o Facebook a liberar um vídeo privado, removido, restrito por idade/região ou não incorporável.
5. A existência do link no catálogo é diferente de confirmação de reprodução dentro do aplicativo.

