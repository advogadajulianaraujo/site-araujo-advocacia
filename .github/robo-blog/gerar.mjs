/*
 * Monta o blog do site a partir de posts.json (páginas estáticas, boas para o Google):
 *   /blog/                    lista de todos os textos
 *   /blog/<slug>/             cada texto
 *   /blog/feed.xml            RSS
 *   sitemap.xml               entre <!--BLOG:INICIO--> e <!--BLOG:FIM-->
 *   index.html e páginas de área: bloco "Do blog" entre <!--BLOG:INICIO--> e <!--BLOG:FIM-->
 * Cabeçalho e rodapé vêm de contato/index.html, para o blog ficar sempre igual ao resto do site.
 * Uso: node .github/robo-blog/gerar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..', '..');
export const ARQ_POSTS = path.join(AQUI, 'posts.json');
const SITE = 'https://araujoadvocaciasc.com.br';
const SETA = '<svg class="arrow" viewBox="0 0 30 14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0 7h28M22 1l6 6-6 6"/></svg>';
const WA = 'https://wa.me/5548996126491?text=';

export const AREAS = {
  trabalhista: { nome: 'Direito do Trabalho', pagina: '/trabalhista/' },
  previdenciario: { nome: 'Direito Previdenciário', pagina: '/previdenciario/' },
  familia: { nome: 'Direito de Família', pagina: '/familia/' },
  civil: { nome: 'Civil e Consumidor', pagina: '/civil/' },
  criminal: { nome: 'Direito Penal', pagina: '/criminal/' },
  empresarial: { nome: 'Direito Empresarial', pagina: '/empresarial/' }
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function lerPosts() {
  try { return JSON.parse(fs.readFileSync(ARQ_POSTS, 'utf8')); } catch (e) { return []; }
}
export function salvarPosts(posts) {
  fs.writeFileSync(ARQ_POSTS, JSON.stringify(posts, null, 2) + '\n');
}

export const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function slugDe(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(.{0,70})(-.*)?$/, (m, a, b) => (b ? a : m)).slice(0, 80);
}
const dataBR = d => { const [a, m, dd] = d.split('-'); return `${+dd} ${MESES[+m - 1]} ${a}`; };
const dataLonga = d => { const [a, m, dd] = d.split('-'); return `${dd}/${m}/${a}`; };

/* Texto do post: "## título", "- item" e parágrafos; **negrito** permitido. */
function corpoHtml(blocos) {
  const out = []; let lista = null;
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const b of blocos) {
    const t = String(b).trim(); if (!t) continue;
    if (/^- /.test(t)) { (lista = lista || []).push(`<li>${inl(t.slice(2))}</li>`); continue; }
    if (lista) { out.push(`<ul>${lista.join('')}</ul>`); lista = null; }
    if (/^## /.test(t)) out.push(`<h2>${inl(t.slice(3))}</h2>`);
    else out.push(`<p>${inl(t)}</p>`);
  }
  if (lista) out.push(`<ul>${lista.join('')}</ul>`);
  return out.join('\n');
}

function casca() {
  const html = fs.readFileSync(path.join(RAIZ, 'contato', 'index.html'), 'utf8');
  const i = html.indexOf('<main id="principal">'), j = html.indexOf('</main>');
  if (i < 0 || j < 0) throw new Error('contato/index.html sem <main id="principal">');
  return { topo: html.slice(0, i), fim: html.slice(j + '</main>'.length) };
}

function pagina({ titulo, descricao, url, tipo, ldExtra, conteudo }) {
  const { topo, fim } = casca();
  let t = topo
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descricao)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${tipo}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titulo)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(descricao)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/ aria-current="page"/g, '')
    .replace('<a href="/blog/">', '<a href="/blog/" aria-current="page">')
    .replace(/<body data-area="[^"]*">/, '<body data-area="blog">');
  t = t.replace('</head>', `<link rel="alternate" type="application/rss+xml" title="Blog da Araújo Advocacia" href="${SITE}/blog/feed.xml">\n` +
    (ldExtra ? `<script type="application/ld+json">${JSON.stringify(ldExtra).replace(/</g, '\\u003c')}</script>\n` : '') + '</head>');
  return t + '<main id="principal">\n' + conteudo + '\n</main>' + fim;
}

function cartao(p, nivel = 'h3') {
  const a = AREAS[p.area] || { nome: 'Direito' };
  return `<a class="post-card" href="/blog/${p.slug}/"><span class="post-meta">${esc(a.nome)} · <time datetime="${p.data}">${dataBR(p.data)}</time></span>` +
    `<${nivel}>${esc(p.titulo)}</${nivel}><p>${esc(p.resumo)}</p><span class="more">Ler o texto ${SETA}</span></a>`;
}

function paginaPost(p, todos) {
  const a = AREAS[p.area] || { nome: 'Direito', pagina: '/atuacao/' };
  const url = `${SITE}/blog/${p.slug}/`;
  const rel = todos.filter(x => x.slug !== p.slug && x.area === p.area).slice(0, 3);
  const mais = rel.length < 3 ? todos.filter(x => x.slug !== p.slug && x.area !== p.area).slice(0, 3 - rel.length) : [];
  const fonte = p.fonte && p.fonte.url
    ? `<div class="post-fonte"><b>Fonte</b><p>${esc(p.fonte.nome || 'Notícia oficial')}${p.fonte.data ? ', publicada em ' + dataLonga(p.fonte.data) : ''}. ` +
      `<a href="${esc(p.fonte.url)}" target="_blank" rel="noopener noreferrer nofollow">Ler a notícia original</a></p></div>` : '';
  const aviso = p.origem === 'robo'
    ? 'Texto informativo, preparado a partir da notícia oficial indicada acima e revisado pelas regras do escritório. Não é orientação para um caso concreto: cada situação depende de análise individual.'
    : 'Texto informativo. Não é orientação para um caso concreto: cada situação depende de análise individual.';
  const ld = [{
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.titulo, description: p.resumo,
    datePublished: p.data, dateModified: p.atualizado || p.data, inLanguage: 'pt-BR', mainEntityOfPage: url,
    articleSection: a.nome, image: `${SITE}/assets/julian-luis-dsc07648.webp`,
    author: { '@type': 'Organization', name: 'Araújo Advocacia', url: SITE + '/' },
    publisher: { '@type': 'Organization', name: 'Araújo Advocacia', logo: { '@type': 'ImageObject', url: `${SITE}/assets/logo-araujo.png` } }
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' },
      { '@type': 'ListItem', position: 3, name: p.titulo, item: url }]
  }];
  const conteudo = `<section class="dark page-top"><div class="wrap">
<div class="crumbs"><a href="/">Início</a> / <a href="/blog/">Blog</a> / ${esc(a.nome)}</div>
<span class="kicker">${esc(a.nome)} · <time datetime="${p.data}">${dataBR(p.data)}</time></span>
<h1 class="post-titulo">${esc(p.titulo)}</h1>
<p class="lead">${esc(p.resumo)}</p>
</div></section>
<section class="sec"><div class="wrap">
<article class="artigo">
${corpoHtml(p.corpo)}
${fonte}
<p class="post-aviso">${aviso}</p>
<div class="post-cta"><div><b>Ficou com dúvida sobre a sua situação?</b><p>Conte o caso em poucas palavras. A equipe agenda o atendimento presencial, em Tubarão, ou por videoconferência.</p></div>
<a class="btn" href="${WA}${encodeURIComponent('Olá, Dra. Júlian. Li o texto "' + p.titulo + '" no site e gostaria de uma orientação.')}" target="_blank" rel="noopener noreferrer" data-contact="blog">Falar no WhatsApp</a></div>
<div class="post-partilha"><span>Compartilhe com quem precisa saber disso:</span>
<a class="btn line sm" href="https://wa.me/?text=${encodeURIComponent(p.titulo + ' — ' + url)}" target="_blank" rel="noopener noreferrer" data-contact="blog-compartilhar">WhatsApp</a>
<a class="btn line sm" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">Facebook</a>
<a class="btn line sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
<button type="button" class="btn line sm" data-copiar="${url}">Copiar link</button></div>
<p class="post-voltar"><a class="more" href="${a.pagina}">Conheça a atuação em ${esc(a.nome)} ${SETA}</a></p>
</article>
</div></section>
${rel.concat(mais).length ? `<section class="sec ivory" style="padding:clamp(64px,7vw,100px) 0"><div class="wrap">
<span class="kicker">Continue lendo</span>
<div class="post-grid">${rel.concat(mais).map(x => cartao(x)).join('')}</div>
<p style="margin-top:36px"><a class="more" href="/blog/">Ver todos os textos ${SETA}</a></p>
</div></section>` : ''}`;
  return pagina({ titulo: `${p.titulo} | Blog Araújo Advocacia`, descricao: p.resumo, url, tipo: 'article', ldExtra: ld, conteudo });
}

function paginaLista(posts) {
  const areas = Object.keys(AREAS).filter(k => posts.some(p => p.area === k));
  const conteudo = `<section class="dark page-top"><div class="wrap">
<div class="crumbs"><a href="/">Início</a> / Blog</div>
<span class="kicker">Blog</span>
<h1>Decisões e direitos, <em>em linguagem simples.</em></h1>
<p class="lead">Toda semana, decisões recentes da Justiça do Trabalho e dos tribunais superiores explicadas de forma clara, com o link da notícia oficial. Conteúdo informativo.</p>
</div></section>
<section class="sec"><div class="wrap">
${areas.length > 1 ? `<nav class="post-filtro" aria-label="Filtrar por área"><button type="button" data-area="" aria-pressed="true">Todos</button>${areas.map(k => `<button type="button" data-area="${k}" aria-pressed="false">${esc(AREAS[k].nome)}</button>`).join('')}</nav>` : ''}
${posts[0] ? `<a class="post-destaque" href="/blog/${posts[0].slug}/" data-area="${posts[0].area}"><span class="post-meta">Mais recente · ${esc((AREAS[posts[0].area] || {}).nome || '')} · <time datetime="${posts[0].data}">${dataBR(posts[0].data)}</time></span><h2>${esc(posts[0].titulo)}</h2><p>${esc(posts[0].resumo)}</p><span class="more">Ler o texto ${SETA}</span></a>` : ''}
<div class="post-grid lista">${posts.slice(1).map(p => cartao(p, 'h2').replace('<a class="post-card"', `<a class="post-card" data-area="${p.area}"`)).join('\n')}</div>
${posts.length ? '' : '<p class="muted">Os primeiros textos chegam nesta semana.</p>'}
</div></section>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog da Araújo Advocacia', url: SITE + '/blog/', inLanguage: 'pt-BR',
    blogPost: posts.slice(0, 20).map(p => ({ '@type': 'BlogPosting', headline: p.titulo, datePublished: p.data, url: `${SITE}/blog/${p.slug}/` })) };
  return pagina({ titulo: 'Blog | Araújo Advocacia — decisões e direitos explicados', descricao: 'Decisões recentes da Justiça do Trabalho, do INSS, de família e do consumidor explicadas em linguagem simples, com o link da notícia oficial.', url: SITE + '/blog/', tipo: 'website', ldExtra: ld, conteudo });
}

function feed(posts) {
  const itens = posts.slice(0, 30).map(p => `<item><title>${esc(p.titulo)}</title><link>${SITE}/blog/${p.slug}/</link><guid>${SITE}/blog/${p.slug}/</guid>` +
    `<pubDate>${new Date(p.data + 'T12:00:00-03:00').toUTCString()}</pubDate><category>${esc((AREAS[p.area] || {}).nome || '')}</category><description>${esc(p.resumo)}</description></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Blog da Araújo Advocacia</title><link>${SITE}/blog/</link>` +
    `<description>Decisões e direitos explicados em linguagem simples.</description><language>pt-BR</language>\n${itens}\n</channel></rss>\n`;
}

function blocoDoBlog(lista, titulo) {
  if (!lista.length) return '';
  return `<section class="sec" style="padding:clamp(64px,8vw,120px) 0"><div class="wrap">
<div class="sec-head reveal"><div><span class="kicker">Blog</span><h2>${titulo}</h2></div><p class="lead muted">Decisões recentes explicadas em linguagem simples, com o link da notícia oficial. Novos textos toda semana.</p></div>
<div class="post-grid reveal">${lista.map(p => cartao(p)).join('')}</div>
<p style="margin-top:40px" class="reveal"><a class="more" href="/blog/">Ver todos os textos ${SETA}</a></p>
</div></section>`;
}

function trocarEntreMarcas(arq, novo, marca = 'BLOG') {
  const f = path.join(RAIZ, arq);
  if (!fs.existsSync(f)) return false;
  const s = fs.readFileSync(f, 'utf8');
  const re = new RegExp(`(<!--${marca}:INICIO-->)[\\s\\S]*?(<!--${marca}:FIM-->)`);
  if (!re.test(s)) return false;
  const t = s.replace(re, `$1\n${novo}\n$2`);
  if (t !== s) fs.writeFileSync(f, t);
  return true;
}

export function gerar() {
  const posts = lerPosts().filter(p => !p.oculto).sort((a, b) => (b.data + b.slug).localeCompare(a.data + a.slug));
  const dirBlog = path.join(RAIZ, 'blog');
  fs.mkdirSync(dirBlog, { recursive: true });
  // apaga páginas de posts que saíram do posts.json
  const vivos = new Set(posts.map(p => p.slug));
  for (const d of fs.readdirSync(dirBlog, { withFileTypes: true })) {
    if (d.isDirectory() && !vivos.has(d.name)) fs.rmSync(path.join(dirBlog, d.name), { recursive: true, force: true });
  }
  for (const p of posts) {
    fs.mkdirSync(path.join(dirBlog, p.slug), { recursive: true });
    fs.writeFileSync(path.join(dirBlog, p.slug, 'index.html'), paginaPost(p, posts));
  }
  fs.writeFileSync(path.join(dirBlog, 'index.html'), paginaLista(posts));
  fs.writeFileSync(path.join(dirBlog, 'feed.xml'), feed(posts));
  // sitemap
  const sm = path.join(RAIZ, 'sitemap.xml');
  let s = fs.readFileSync(sm, 'utf8');
  const urls = [`<url><loc>${SITE}/blog/</loc><lastmod>${posts[0] ? posts[0].data : '2026-11-01'}</lastmod></url>`]
    .concat(posts.map(p => `<url><loc>${SITE}/blog/${p.slug}/</loc><lastmod>${p.atualizado || p.data}</lastmod></url>`)).join('\n');
  if (!/<!--BLOG:INICIO-->/.test(s)) s = s.replace('</urlset>', '<!--BLOG:INICIO-->\n<!--BLOG:FIM-->\n</urlset>');
  s = s.replace(/(<!--BLOG:INICIO-->)[\s\S]*?(<!--BLOG:FIM-->)/, `$1\n${urls}\n$2`);
  fs.writeFileSync(sm, s);
  // Início e páginas de área
  trocarEntreMarcas('index.html', blocoDoBlog(posts.slice(0, 3), 'Decisões que <em>importam.</em>'));
  if (posts[0]) trocarEntreMarcas('index.html', `<a class="blog-faixa" href="/blog/${posts[0].slug}/"><div class="wrap"><span class="blog-faixa-tag">Novo no blog</span><span class="blog-faixa-tit">${esc(posts[0].titulo)}</span><span class="blog-faixa-ler">Ler ${SETA}</span></div></a>`, 'BLOGFAIXA');
  for (const [k, a] of Object.entries(AREAS)) {
    const daArea = posts.filter(p => p.area === k).slice(0, 3);
    trocarEntreMarcas(a.pagina.replace(/^\/|\/$/g, '') + '/index.html', blocoDoBlog(daArea, `Do blog: <em>${esc(a.nome.replace(/^Direito (do |de |)/, '').toLowerCase())}.</em>`));
  }
  return posts.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Blog montado:', gerar(), 'textos.');
}
