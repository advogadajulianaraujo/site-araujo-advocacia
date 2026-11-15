// Robô do DJEN na nuvem (8.23): lê as comunicações do DJEN (CNJ) para as OABs do escritório e manda para o painel,
// de 2 em 2 horas, mesmo com o painel fechado. Segredos do repositório: PAINEL_URL (endereço /exec do Apps Script) e DJEN_ROBO_CHAVE
// (gerada no painel: Intimações e prazos › Robô do DJEN na nuvem). Nenhum dado de cliente fica no repositório: tudo vai direto ao painel.
// 8.34: não precisa mais de segredo. O endereço vem do próprio site (painel/config.js) e o robô se identifica com a identidade
// assinada pelo GitHub (OIDC: só este robô, deste repositório, no main, consegue uma). Os segredos antigos, se existirem, são limpos
// (espaços, aspas, quebra de linha) e usados só como reserva.
import { readFileSync } from 'node:fs';
const limpar = v => String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
let URL_PAINEL = limpar(process.env.PAINEL_URL);
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(URL_PAINEL)) {
  const m = /PAINEL_API_URL\s*=\s*'([^']+)'/.exec(readFileSync(new URL('../../painel/config.js', import.meta.url), 'utf8'));
  URL_PAINEL = m ? m[1] : '';
}
const CHAVE = limpar(process.env.DJEN_ROBO_CHAVE);
const DJEN = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
if (!URL_PAINEL) { console.log('Robô do DJEN: não achei o endereço do painel em painel/config.js.'); process.exit(1); }
async function identidade() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) return '';
  try { const r = await fetch(u + '&audience=painel-araujo-djen', { headers: { Authorization: 'Bearer ' + t } }); return (await r.json()).value || ''; } catch (e) { return ''; }
}
const espera = ms => new Promise(r => setTimeout(r, ms));
const somaDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
async function painel(dados) {
  const r = await fetch(URL_PAINEL, { method: 'POST', body: JSON.stringify({ acao: 'djen.robo', dados: Object.assign({ chave: CHAVE, oidc: await identidade() }, dados) }), redirect: 'follow' });
  const j = await r.json().catch(() => ({ ok: false, erro: 'resposta inválida do painel (' + r.status + ')' }));
  if (!j.ok) throw new Error('painel: ' + j.erro);
  return j.dados;
}
async function djen(url) {
  let ultimo;
  for (let t = 0; t < 4; t++) {
    if (t) await espera([0, 3000, 8000, 15000][t]);
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (painel do escritório)' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      ultimo = new Error('o CNJ respondeu ' + r.status);
      if (!(r.status === 429 || r.status >= 500)) throw ultimo;
    } catch (e) { ultimo = e; if (/respondeu 4(?!29)/.test(e.message)) throw e; }
  }
  throw ultimo;
}
(async () => {
  let novas = 0, prazos = 0, total = 0;
  try {
    const cfg = await painel({ acao: 'config' });
    const janelas = [];
    for (let ini = cfg.desde; ini <= cfg.hoje; ini = somaDias(ini, 7)) janelas.push([ini, somaDias(ini, 6) > cfg.hoje ? cfg.hoje : somaDias(ini, 6)]);
    let lote = [], tam = 0;
    const enviar = async fim => { if (!lote.length && !fim) return; const r = await painel({ itens: lote, fim }); novas += r.novas || 0; prazos += r.prazos || 0; lote = []; tam = 0; };
    for (const o of cfg.oabs) for (const [ini, fim] of janelas) for (let pg = 1; pg <= 20; pg++) {
      const j = await djen(`${DJEN}?numeroOab=${encodeURIComponent(o.numero)}&ufOab=${encodeURIComponent(o.uf)}&dataDisponibilizacaoInicio=${ini}&dataDisponibilizacaoFim=${fim}&pagina=${pg}&itensPorPagina=100`);
      const lista = j.items || j.itens || [];
      for (const it of lista) {
        const x = { id: it.id, hash: it.hash, numeroprocessocommascara: it.numeroprocessocommascara, numero_processo: it.numero_processo,
          data_disponibilizacao: it.data_disponibilizacao || it.dataDisponibilizacao, siglaTribunal: it.siglaTribunal, tipoComunicacao: it.tipoComunicacao,
          nomeOrgao: it.nomeOrgao, texto: String(it.texto || '').slice(0, 20000) };
        const t = JSON.stringify(x).length;
        if (lote.length && (tam + t > 140000 || lote.length >= 150)) await enviar(false);
        lote.push(x); tam += t; total++;
      }
      if (lista.length < 100) break;
      await espera(600);
    }
    await enviar(true);
    console.log(`DJEN lido: ${total} comunicação(ões), ${novas} nova(s), ${prazos} prazo(s) novo(s).`);
  } catch (e) {
    console.log('Falhou: ' + e.message);
    try { await painel({ erro: e.message }); } catch (e2) { /* sem painel */ }
    process.exitCode = 1;
  }
})();
