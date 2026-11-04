/*
 * Imagem pronta para o Instagram (1080×1080) e legenda de cada texto do blog.
 * Gera blog/<slug>/instagram.png e blog/<slug>/instagram.txt para os textos que ainda não têm.
 * Roda no GitHub Actions depois do robô (precisa de @resvg/resvg-js, instalado no workflow).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerPosts, AREAS } from './gerar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://araujoadvocaciasc.com.br';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HASH = { trabalhista: '#direitodotrabalho #trabalhador #direitos', previdenciario: '#inss #aposentadoria #previdencia', familia: '#direitodefamilia #familia #direitos',
  civil: '#direitodoconsumidor #consumidor #direitos', criminal: '#direitopenal #direitos', empresarial: '#empresas #direitoempresarial' };

/** Quebra o título em linhas de até `max` caracteres. */
function linhas(t, max) {
  const out = []; let l = '';
  for (const w of String(t).split(/\s+/)) { if ((l + ' ' + w).trim().length > max && l) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); }
  if (l) out.push(l);
  return out;
}

function svgDo(p, logo) {
  // largura útil 880 px; letra serifada ≈ 0,6 do tamanho
  const maxDe = t => Math.floor(880 / (t * 0.6));
  let tam = 72, ls = linhas(p.titulo, maxDe(tam));
  while (ls.length > 6 && tam > 48) { tam -= 6; ls = linhas(p.titulo, maxDe(tam)); }
  if (ls.length > 7) { ls = ls.slice(0, 7); ls[6] = ls[6].replace(/\s*\S*$/, '') + '…'; }
  const alt = tam * 1.18, y0 = 540 - (ls.length * alt) / 2 + tam * 0.35;
  const area = (AREAS[p.area] || {}).nome || 'Direito';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#0f0e0c"/>
  <rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#b08d4f" stroke-width="2"/>
  ${logo ? `<image href="data:image/png;base64,${logo}" x="90" y="88" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <text x="990" y="140" text-anchor="end" font-family="DejaVu Sans" font-size="26" letter-spacing="5" fill="#b08d4f">${esc(area.toUpperCase())}</text>
  <rect x="90" y="${y0 - tam - 30}" width="90" height="4" fill="#b08d4f"/>
  ${ls.map((l, i) => `<text x="90" y="${(y0 + i * alt).toFixed(0)}" font-family="DejaVu Serif" font-size="${tam}" fill="#ffffff">${esc(l)}</text>`).join('\n  ')}
  <text x="90" y="930" font-family="DejaVu Sans" font-size="30" fill="#d9c7a0">Leia o texto completo no blog</text>
  <text x="90" y="978" font-family="DejaVu Sans" font-size="28" fill="#ffffff" opacity="0.8">araujoadvocaciasc.com.br/blog · Tubarão/SC</text>
</svg>`;
}

export async function gerarImagens() {
  let Resvg;
  try { ({ Resvg } = await import('@resvg/resvg-js')); } catch (e) { console.log('[instagram] @resvg/resvg-js não instalado: sem imagens.'); return 0; }
  const logoArq = path.join(RAIZ, 'assets', 'logo-araujo.png');
  const logo = fs.existsSync(logoArq) ? fs.readFileSync(logoArq).toString('base64') : '';
  let n = 0;
  for (const p of lerPosts().filter(x => !x.oculto)) {
    const dir = path.join(RAIZ, 'blog', p.slug);
    if (!fs.existsSync(dir)) continue;
    const png = path.join(dir, 'instagram.png');
    if (!fs.existsSync(png)) {
      const img = new Resvg(svgDo(p, logo), { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng();
      fs.writeFileSync(png, img); n++;
    }
    const txt = path.join(dir, 'instagram.txt');
    if (!fs.existsSync(txt)) fs.writeFileSync(txt, `${p.titulo}\n\n${p.resumo}\n\nLeia o texto completo no blog (link na bio): ${SITE}/blog/${p.slug}/\n\nConteúdo informativo. Cada caso precisa de análise individual.\n\n${HASH[p.area] || '#direitos'} #tubarao #santacatarina\n`);
  }
  console.log('[instagram]', n, 'imagem(ns) nova(s).');
  return n;
}

if (process.argv[1] && process.argv[1].endsWith('instagram.mjs')) gerarImagens();
