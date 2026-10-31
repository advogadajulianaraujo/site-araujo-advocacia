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
async function gemini(corpo) {
  const modelos = MODELOS.slice(), erros = [];
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
      if (r.status === 400 && c.tools && !semBusca) { semBusca = true; log('A Busca do Google foi recusada para esta chave; seguindo sem ela.'); tent--; continue; }
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

/* Link de redirecionamento da busca → endereço de verdade. */
async function resolver(uri) {
  try {
    const r = await http(uri, { redirect: 'manual' }, 15000);
    return r.headers.get('location') || uri;
  } catch (e) { return uri; }
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

async function buscarCandidatas(jaTem) {
  const desde = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
  const pedido = `Você é pesquisador jurídico de um escritório de advocacia de Tubarão/SC. Use a Busca do Google.
Encontre ${QUANTOS * 3} NOTÍCIAS publicadas desde ${desde} (até ${HOJE}) nos SITES OFICIAIS dos tribunais brasileiros sobre decisões
judiciais interessantes para trabalhadores, aposentados, famílias, consumidores e pequenas empresas.
Prioridade: Justiça do Trabalho (tst.jus.br, trt12.jus.br e outros TRTs) — pelo menos metade. Depois: STJ (stj.jus.br), STF (portal.stf.jus.br),
TRF4 (trf4.jus.br), TJSC (tjsc.jus.br), CNJ (cnj.jus.br), TNU/CJF (cjf.jus.br).
Só notícias de sites terminados em .jus.br. Nada de blogs, jornais ou escritórios. Não repita estes assuntos: ${jaTem.slice(0, 40).map(t => '"' + t + '"').join('; ') || 'nenhum'}.
Responda SÓ com um bloco \`\`\`json contendo uma lista, cada item:
{"titulo":"título da notícia como está no site","url":"endereço exato da notícia no site oficial","tribunal":"sigla","data":"AAAA-MM-DD",
 "area":"trabalhista|previdenciario|familia|civil|criminal|empresarial","fatos":"o que a notícia diz, fiel, 80 a 160 palavras, sem nome de pessoa física"}`;
  const r = await gemini({ contents: [{ role: 'user', parts: [{ text: pedido }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } });
  let lista = [];
  try { lista = jsonDe(textoDe(r)); } catch (e) { log('resposta da busca sem JSON:', textoDe(r).slice(0, 300)); }
  if (!Array.isArray(lista)) lista = [];
  // endereços que vieram de verdade da busca
  const chunks = ((r.candidates || [])[0]?.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean);
  const reais = [];
  for (const w of chunks.slice(0, 30)) reais.push({ url: await resolver(w.uri), titulo: w.title || '' });
  log('busca:', lista.length, 'notícias sugeridas,', reais.length, 'links da busca');
  return { lista, reais };
}

async function conferirCandidata(c, reais) {
  if (!c || !c.url || !c.titulo) return null;
  let host = '';
  try { host = new URL(c.url).hostname; } catch (e) { return null; }
  if (!OFICIAL.test(host)) { log('fora (não é site oficial):', c.url); return null; }
  if (!AREAS[c.area]) c.area = 'trabalhista';
  const daBusca = reais.some(x => normal(x.url) === normal(c.url));
  let texto = '';
  try {
    const r = await http(c.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AraujoAdvocaciaBlog/1.0)', 'Accept-Language': 'pt-BR' } });
    if (r.ok) texto = textoDaPagina(await r.text());
  } catch (e) { /* site fora do ar */ }
  if (texto && parecidos(c.titulo, texto) >= 0.5) {
    // recorta o trecho da notícia (perto do título)
    const ini = Math.max(0, texto.indexOf(palavras(c.titulo)[0] || '') - 200);
    return { ...c, base: texto.slice(ini, ini + 9000), confirmada: 'página' };
  }
  if (daBusca && c.fatos && palavras(c.fatos).length > 25) return { ...c, base: c.fatos, confirmada: 'busca' };
  log('fora (link não confirmado):', c.url);
  return null;
}

async function escrever(c) {
  const pedido = `Escreva um texto para o blog de um escritório de advocacia (Araújo Advocacia, Tubarão/SC), em português do Brasil,
explicando a decisão abaixo para o público leigo. REGRAS (Provimento 205/2021 da OAB — obrigatórias):
- Use SOMENTE os fatos da NOTÍCIA OFICIAL abaixo. Não invente números, valores, artigos de lei, datas ou detalhes que não estejam nela.
- Não cite nome de pessoa física (trabalhador, autor, réu, vítima). Empresa só se a notícia citar e for necessário.
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
  const { lista, reais } = await buscarCandidatas(jaTitulos);
  // Justiça do Trabalho primeiro, mais novas primeiro
  lista.sort((a, b) => ((b.area === 'trabalhista') - (a.area === 'trabalhista')) || String(b.data).localeCompare(String(a.data)));
  const novos = []; let falhas = 0;
  for (const c of lista) {
    if (novos.length >= QUANTOS) break;
    if (!c || !c.url || jaUrls.has(normal(c.url))) continue;
    if (jaTitulos.concat(novos.map(p => p.fonte.titulo)).some(t => parecidos(t, c.titulo) >= 0.7)) continue;
    try {
      const ok = await conferirCandidata(c, reais); if (!ok) continue;
      let texto = await escrever(ok), erros = conferirTexto(texto);
      if (erros.length) { log('refazendo (', erros.join(', '), '):', c.titulo); texto = await escrever(ok); erros = conferirTexto(texto); }
      if (erros.length) { log('descartada (', erros.join(', '), '):', c.titulo); falhas++; continue; }
      let slug = slugDe(texto.titulo), k = 2;
      while (posts.concat(novos).some(p => p.slug === slug)) slug = slugDe(texto.titulo) + '-' + k++;
      const dataFonte = /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : '';
      novos.push({ slug, titulo: texto.titulo.trim(), resumo: texto.resumo.trim(), area: texto.area, data: HOJE, origem: 'robo',
        fonte: { nome: `Notícia oficial — ${c.tribunal || new URL(c.url).hostname}`, url: c.url, titulo: c.titulo, data: dataFonte, conferida: ok.confirmada },
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
