/*
 * Robô do blog (roda toda segunda-feira pelo GitHub Actions, .github/workflows/blog-semanal.yml).
 *
 * 1) Pede ao Gemini, com a Busca do Google ligada, decisões recentes e interessantes publicadas nos SITES OFICIAIS
 *    dos tribunais (TST, TRTs, STJ, STF, TRF4, TJSC, CNJ…), com prioridade para a Justiça do Trabalho.
 * 2) Confere cada link: tem de ser de site oficial (.jus.br / .gov.br) e abrir de verdade (ou ter vindo da própria busca).
 * 3) Lê a notícia oficial e pede ao Gemini um texto NOVO, informativo, só com o que está na notícia
 *    (sem nome de pessoa, sem promessa de resultado, sem preço — Provimento 205/2021 da OAB).
 * 4) Confere o texto (tamanho, palavras proibidas, área) e grava em posts.json; depois monta as páginas (gerar.mjs).
 *
 * Chave: segredo GEMINI_API_KEY do repositório (a mesma chave do painel). Sem a chave, o robô só avisa e não publica nada.
 * Opções (variáveis do repositório): BLOG_POSTS_SEMANA (padrão 3), GEMINI_MODELO.
 */
import { gerar, lerPosts, salvarPosts, slugDe, AREAS } from './gerar.mjs';

const CHAVE = String(process.env.GEMINI_API_KEY || '').replace(/^[\s"']+|[\s"']+$/g, '');
const QUANTOS = Math.max(1, Math.min(6, parseInt(process.env.BLOG_POSTS_SEMANA || '3', 10) || 3));
const MODELOS = [...new Set([process.env.GEMINI_MODELO, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
const HOJE = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // dia de Brasília
const SECO = process.argv.includes('--seco'); // testa sem gravar

const OFICIAL = /(^|\.)(jus\.br|gov\.br|mpt\.mp\.br|mp\.br)$/i;
const PROIBIDO = /\b(garant(o|imos)\b|resultado garantido|garantia de (resultado|vit[oó]ria)|100\s?%|ganhe|ganhar a causa|melhor(es)? (advogad|escrit)|consulta gr[aá]tis|gratuit[ao] a consulta|sem custo|imperd[ií]vel|n[aã]o perca|ligue j[aá]|honor[aá]rios de r\$)/i;
const espera = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[blog]', ...a);

async function http(url, op = {}, ms = 25000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...op, signal: c.signal }); } finally { clearTimeout(t); }
}

/* Gemini com nova tentativa no 429/500/503 e troca de modelo quando o Google aposenta um.
   Se a Busca do Google for recusada para esta chave, tenta sem ela (os links continuam sendo conferidos um a um). */
let semBusca = false;
async function gemini(corpo, lista) {
  const modelos = (lista || MODELOS).slice(), erros = [];
  for (let i = 0; i < modelos.length; i++) {
    const m = modelos[i];
    for (let tent = 0; tent < 3; tent++) {
      const c = semBusca && corpo.tools ? { ...corpo, tools: undefined } : corpo;
      let r;
      try {
        r = await http(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE }, body: JSON.stringify(c)
        }, 120000);
      } catch (e) { erros.push(`${m}: sem conexão (${e.message || e})`); await espera(5000 * (tent + 1)); continue; }
      const txt = await r.text();
      if (r.ok) return JSON.parse(txt);
      let msg = txt;
      try { const j = JSON.parse(txt); msg = (j.error && (j.error.message || j.error.status)) || txt; } catch (e) { /* texto puro */ }
      msg = String(msg).replace(/\s+/g, ' ').slice(0, 300);
      erros.push(`${m}: ${r.status} ${msg}`);
      log('Gemini', m, r.status, msg);
      if (/API key not valid|API_KEY_INVALID|API key expired|invalid api key/i.test(msg)) {
        throw new Error('A chave do Gemini no GitHub (segredo GEMINI_API_KEY) não foi aceita pelo Google. Copie de novo a chave inteira, sem espaços nem aspas, e salve o segredo outra vez. Resposta do Google: ' + msg);
      }
      const temBusca = !!(c.tools && c.tools.some(t => t.google_search));
      if (temBusca && !semBusca && (r.status === 400 || (r.status === 429 && /quota/i.test(msg)))) { semBusca = true; log('A Busca do Google foi recusada para esta chave (sem cota); seguindo sem ela.'); throw new Error('Busca do Google indisponível para esta chave.'); }
      if ([429, 500, 503].includes(r.status)) { await espera(8000 * (tent + 1)); continue; }
      const sug = /use (?:models\/)?([a-z0-9.\-]+)/i.exec(msg);
      if (r.status === 404 && sug && !modelos.includes(sug[1])) modelos.splice(i + 1, 0, sug[1]);
      break; // outro modelo
    }
  }
  throw new Error('Gemini não respondeu. ' + erros.join(' | '));
}
const textoDe = r => ((r.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
function jsonDe(t) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t); const s = (m ? m[1] : t).trim();
  const i = Math.min(...['[', '{'].map(c => (s.indexOf(c) < 0 ? Infinity : s.indexOf(c))));
  return JSON.parse(s.slice(i));
}

const normal = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return String(u).toLowerCase(); } };

function textoDaPagina(html) {
  return html.replace(/<(script|style|noscript|nav|header|footer|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
const palavras = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]{5,}/g) || [];
function parecidos(a, b) {
  const A = new Set(palavras(a)), B = new Set(palavras(b)); if (!A.size || !B.size) return 0;
  let c = 0; A.forEach(x => { if (B.has(x)) c++; }); return c / Math.min(A.size, B.size);
}

const MODELOS_LEITURA = [...new Set(['gemini-3.5-flash-lite'].concat(MODELOS))];
const slugTST = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function dataISO(d) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(d || ''));
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const x = new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10);
}

/* O Google abre a página (os sites dos tribunais às vezes recusam o GitHub) e devolve o que está nela. */
async function lerComGoogle(url, pedido) {
  const r = await gemini({ contents: [{ role: 'user', parts: [{ text: pedido + '\n\nPágina: ' + url }] }], tools: [{ url_context: {} }],
    generationConfig: { temperature: 0 } }, MODELOS_LEITURA);
  const meta = r.candidates?.[0]?.urlContextMetadata?.urlMetadata || [];
  if (!meta.some(m => /SUCCESS/.test(m.urlRetrievalStatus || ''))) return '';
  const t = textoDe(r);
  return /NAO ABRIU|NÃO ABRIU/i.test(t.slice(0, 40)) ? '' : t;
}

/* Fonte principal: notícias do TST (Justiça do Trabalho). O endereço de cada notícia é tst.jus.br/-/<título>. */
async function noticiasTST() {
  try {
    const t = await lerComGoogle('https://www.tst.jus.br/noticias',
      'Liste TODAS as notícias que aparecem nesta página (até 25), na ordem. Responda só um bloco ```json com a lista [{"titulo":"título exatamente como está","data":"dd/mm/aaaa se aparecer"}]. Não invente nada.');
    const l = t ? jsonDe(t) : [];
    const itens = (Array.isArray(l) ? l : []).filter(x => x && x.titulo && x.titulo.length > 20)
      .map(x => ({ titulo: String(x.titulo).trim(), data: dataISO(x.data), tribunal: 'TST', url: 'https://www.tst.jus.br/-/' + slugTST(x.titulo) }));
    log('TST:', itens.length, 'notícias na página');
    return itens;
  } catch (e) { log('TST não respondeu:', e.message); return []; }
}

/* Fontes extras lidas direto (quando o site do tribunal aceita o GitHub): RSS ou lista de notícias. */
const FONTES_DIRETAS = [
  { tribunal: 'TST', url: 'https://www.tst.jus.br/noticias' },
  { tribunal: 'TRT-SC', url: 'https://portal.trt12.jus.br/noticias' },
  { tribunal: 'STF', url: 'https://noticias.stf.jus.br/feed/' },
  { tribunal: 'STJ', url: 'https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Ultimas-noticias.aspx' },
  { tribunal: 'CNJ', url: 'https://www.cnj.jus.br/feed/' }
];
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' };
const semTags = h => textoDaPagina(String(h).replace(/<!\[CDATA\[|\]\]>/g, ''));
async function noticiasDiretas() {
  const todas = [];
  await Promise.all(FONTES_DIRETAS.map(async f => {
    try {
      const r = await http(f.url, { headers: UA }, 20000); if (!r.ok) { log(f.tribunal, 'direto:', r.status); return; }
      const html = await r.text(), base = new URL(f.url), achadas = [];
      if (/<item[\s>]/i.test(html)) {
        for (const m of html.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
          const it = m[0], g = re => (re.exec(it) || [])[1] || '';
          achadas.push({ titulo: semTags(g(/<title>([\s\S]*?)<\/title>/i)), url: semTags(g(/<link>([\s\S]*?)<\/link>/i)), data: dataISO(semTags(g(/<pubDate>([\s\S]*?)<\/pubDate>/i))) });
        }
      } else {
        for (const m of html.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
          const tit = semTags(m[2]).replace(/\s+/g, ' ').trim();
          if (tit.length < 35 || tit.length > 220) continue;
          let u; try { u = new URL(m[1], base); } catch (e) { continue; }
          if (u.hostname !== base.hostname || u.pathname.replace(/\/+$/, '') === base.pathname.replace(/\/+$/, '')) continue;
          achadas.push({ titulo: tit, url: u.href, data: '' });
        }
      }
      const vistos = new Set();
      achadas.filter(x => x.titulo && x.url && !vistos.has(x.url) && vistos.add(x.url)).slice(0, 25)
        .forEach(x => todas.push({ ...x, tribunal: f.tribunal }));
      log(f.tribunal, 'direto:', achadas.length, 'notícias');
    } catch (e) { log(f.tribunal, 'direto: não abriu (' + (e.message || e) + ')'); }
  }));
  return todas;
}

/* Último recurso: Busca do Google (só funciona se a chave tiver cota para isso). */
async function noticiasPelaBusca(jaTem) {
  const desde = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
  const pedido = `Use a Busca do Google. Encontre ${QUANTOS * 3} notícias publicadas desde ${desde} nos sites oficiais dos tribunais (.jus.br),
com prioridade para a Justiça do Trabalho (tst.jus.br e TRTs), sobre decisões judiciais interessantes para o público. Não repita: ${jaTem.slice(0, 30).join('; ') || 'nenhum'}.
Responda só um bloco \`\`\`json com a lista [{"titulo":"título como está no site","url":"endereço exato","tribunal":"sigla","data":"AAAA-MM-DD"}]`;
  try {
    const r = await gemini({ contents: [{ role: 'user', parts: [{ text: pedido }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } });
    const l = jsonDe(textoDe(r));
    return (Array.isArray(l) ? l : []).filter(x => x && x.url && x.titulo);
  } catch (e) { log('busca do Google:', e.message); return []; }
}

/* O Gemini escolhe as melhores para o público (decisões, não eventos), com a Justiça do Trabalho primeiro. */
async function escolher(cands) {
  if (cands.length <= 1) return cands.map(c => ({ ...c, area: c.area || 'trabalhista' }));
  const pedido = `Você ajuda um escritório de advocacia de Tubarão/SC a escolher notícias para o blog. Da lista abaixo, escolha até ${QUANTOS * 3}
que sejam DECISÕES JUDICIAIS interessantes e úteis para trabalhadores, aposentados, famílias, consumidores ou pequenas empresas.
Fora: eventos, homenagens, posses, sessões, campanhas, estatísticas, notícias institucionais e assuntos penais de grande repercussão política.
Prioridade: Justiça do Trabalho (pelo menos metade, se houver). Ordene da mais interessante para a menos.
Responda JSON: [{"n": número da lista, "area": "${Object.keys(AREAS).join('|')}"}]

${cands.map((c, i) => `${i}. [${c.tribunal}] ${c.titulo}`).join('\n')}`;
  try {
    const r = await gemini({ contents: [{ role: 'user', parts: [{ text: pedido }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }, MODELOS_LEITURA);
    const l = jsonDe(textoDe(r));
    const out = [];
    for (const x of Array.isArray(l) ? l : []) { const c = cands[+x.n]; if (c && !out.includes(c)) out.push({ ...c, area: AREAS[x.area] ? x.area : 'trabalhista' }); }
    return out;
  } catch (e) { log('escolha:', e.message); return cands.map(c => ({ ...c, area: 'trabalhista' })); }
}

/* Lê a notícia inteira: direto do site; se o site recusar, pelo Google. Confere que é a notícia certa. */
async function conferirCandidata(c) {
  if (!c || !c.url || !c.titulo) return null;
  let host = '';
  try { host = new URL(c.url).hostname; } catch (e) { return null; }
  if (!OFICIAL.test(host)) { log('fora (não é site oficial):', c.url); return null; }
  if (!AREAS[c.area]) c.area = 'trabalhista';
  let texto = '', como = '';
  try {
    const r = await http(c.url, { headers: UA });
    if (r.ok) { texto = textoDaPagina(await r.text()); como = 'página'; }
  } catch (e) { /* o site recusou o GitHub */ }
  if (!texto || parecidos(c.titulo, texto) < 0.5) {
    try {
      texto = await lerComGoogle(c.url, 'Copie o texto COMPLETO da notícia desta página (título, data e todos os parágrafos), exatamente como está, sem resumir e sem comentar. Se a página não abrir ou não for uma notícia, responda só: NAO ABRIU.');
      como = 'página (lida pelo Google)';
    } catch (e) { texto = ''; }
  }
  if (texto && parecidos(c.titulo, texto) >= 0.5 && palavras(texto).length > 60) {
    const ini = Math.max(0, texto.indexOf(palavras(c.titulo)[0] || '') - 200);
    return { ...c, base: texto.slice(ini, ini + 9000), confirmada: como };
  }
  log('fora (notícia não abriu):', c.url);
  return null;
}

async function escrever(c) {
  const pedido = `Escreva um texto para o blog de um escritório de advocacia (Araújo Advocacia, Tubarão/SC), em português do Brasil,
explicando a decisão abaixo para o público leigo. REGRAS (Provimento 205/2021 da OAB — obrigatórias):
- Use SOMENTE os fatos da NOTÍCIA OFICIAL abaixo. Não invente números, valores, artigos de lei, datas ou detalhes que não estejam nela.
- Não cite nomes de pessoas nem de empresas (diga "uma empresa de telefonia", "uma trabalhadora"). Valores de condenação podem ser citados se estiverem na notícia.
- Tom informativo e sóbrio. Sem promessas ("garantimos", "você vai ganhar"), sem preço, sem comparação com outros escritórios, sem sensacionalismo.
- Diga claramente que cada caso depende de análise individual e que a decisão pode ser objeto de recurso, quando a notícia indicar.
- Título novo, claro e útil (até 90 caracteres), sem ponto de exclamação. Resumo de 110 a 160 caracteres.
- Corpo com 350 a 650 palavras, em blocos: parágrafos curtos; subtítulos começando com "## " (2 a 4, ex.: "## O que foi decidido",
  "## O que isso significa na prática", "## Pontos de atenção"); listas com "- " quando ajudar.
- Não use "nós", "nosso escritório" nem chamada para contratar; o site já mostra o contato.
Responda em JSON: {"titulo":"…","resumo":"…","area":"${Object.keys(AREAS).join('|')}","corpo":["parágrafo ou ## subtítulo ou - item", "..."]}

NOTÍCIA OFICIAL (${c.tribunal || ''}, ${c.url}):
${c.base}`;
  const r = await gemini({ contents: [{ role: 'user', parts: [{ text: pedido }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } });
  return jsonDe(textoDe(r));
}

function conferirTexto(t) {
  const erros = [];
  if (!t || typeof t !== 'object') return ['sem texto'];
  const corpo = Array.isArray(t.corpo) ? t.corpo.map(String) : [];
  const tudo = [t.titulo, t.resumo].concat(corpo).join('\n');
  const n = (tudo.match(/\S+/g) || []).length;
  if (!t.titulo || t.titulo.length < 20 || t.titulo.length > 110) erros.push('título');
  if (!t.resumo || t.resumo.length < 60 || t.resumo.length > 200) erros.push('resumo');
  if (corpo.length < 5 || n < 300 || n > 1000) erros.push('tamanho ' + n);
  if (PROIBIDO.test(tudo)) erros.push('palavra proibida: ' + PROIBIDO.exec(tudo)[0]);
  if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(tudo)) erros.push('CPF');
  if (!AREAS[t.area]) erros.push('área');
  return erros;
}

async function principal() {
  if (!CHAVE) {
    console.log('::warning::Falta o segredo GEMINI_API_KEY no repositório (Settings › Secrets and variables › Actions). Nada publicado.');
    gerar(); return;
  }
  const posts = lerPosts();
  const jaUrls = new Set(posts.map(p => p.fonte && normal(p.fonte.url)).filter(Boolean));
  const jaTitulos = posts.map(p => p.fonte?.titulo || p.titulo);
  const jaVisto = c => jaUrls.has(normal(c.url)) || jaTitulos.some(t => parecidos(t, c.titulo) >= 0.7);
  let cands = (await noticiasTST()).concat(await noticiasDiretas());
  const vistos = new Set();
  cands = cands.filter(c => { const k = normal(c.url); if (vistos.has(k) || jaVisto(c)) return false; vistos.add(k); return true; });
  if (!cands.length) cands = (await noticiasPelaBusca(jaTitulos)).filter(c => !jaVisto(c));
  log('candidatas:', cands.length);
  const lista = await escolher(cands.slice(0, 60));
  const novos = []; let falhas = 0;
  for (const c of lista) {
    if (novos.length >= QUANTOS) break;
    if (!c || !c.url || jaUrls.has(normal(c.url))) continue;
    if (jaTitulos.concat(novos.map(p => p.fonte.titulo)).some(t => parecidos(t, c.titulo) >= 0.7)) continue;
    try {
      const ok = await conferirCandidata(c); if (!ok) continue;
      let texto = await escrever(ok), erros = conferirTexto(texto);
      if (erros.length) { log('refazendo (', erros.join(', '), '):', c.titulo); texto = await escrever(ok); erros = conferirTexto(texto); }
      if (erros.length) { log('descartada (', erros.join(', '), '):', c.titulo); falhas++; continue; }
      let slug = slugDe(texto.titulo), k = 2;
      while (posts.concat(novos).some(p => p.slug === slug)) slug = slugDe(texto.titulo) + '-' + k++;
      const dataFonte = /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : '';
      novos.push({ slug, titulo: texto.titulo.trim(), resumo: texto.resumo.trim(), area: texto.area, data: HOJE, origem: 'robo',
        fonte: { nome: `Notícia oficial — ${{ TST: 'Tribunal Superior do Trabalho (TST)', STF: 'Supremo Tribunal Federal (STF)', STJ: 'Superior Tribunal de Justiça (STJ)', 'TRT-SC': 'TRT da 12ª Região (SC)', CNJ: 'Conselho Nacional de Justiça (CNJ)' }[c.tribunal] || c.tribunal || new URL(c.url).hostname}`, url: c.url, titulo: c.titulo, data: dataFonte, conferida: ok.confirmada },
        corpo: texto.corpo.map(s => String(s).trim()).filter(Boolean) });
      jaUrls.add(normal(c.url));
      log('novo texto:', texto.titulo);
    } catch (e) { falhas++; log('erro em', c.url, '-', e.message); }
  }
  if (SECO) { console.log(JSON.stringify(novos, null, 2)); return; }
  if (novos.length) { salvarPosts(novos.concat(posts)); }
  const total = gerar();
  log(`publicados ${novos.length} novos (total ${total}).`);
  if (!novos.length && (falhas || !lista.length)) {
    console.log('::error::O robô do blog não conseguiu publicar nada nesta semana. Veja o registro acima.');
    process.exitCode = 1; // o GitHub manda e-mail avisando
  }
}

principal().catch(e => { console.log('::error::' + (e.message || e)); process.exitCode = 1; try { gerar(); } catch (e2) { /* segue */ } });
