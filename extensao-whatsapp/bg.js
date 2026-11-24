/* Assistente do WhatsApp Web — fala com o painel do escritório (programa do Google). A chave do aparelho fica só neste Chrome. */
const API = 'https://script.google.com/macros/s/AKfycbwMffQm4vsbVo7fiTygLC8uxalR7ipQeZdK4y_0ieg2iPqMO4X981nrE9kll8BBrNl4/exec';
async function chamar(acao, dados) {
  const { token } = await chrome.storage.local.get('token');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ acao, token: token || '', dados: dados || {} }), redirect: 'follow', signal: ctl.signal });
    const j = await r.json();
    if (j && j.sessao) await chrome.storage.local.remove(['token', 'usuario']);
    return j;
  } catch (e) { return { ok: false, erro: e.name === 'AbortError' ? 'O painel demorou demais para responder.' : 'Sem conexão com o painel.' }; }
  finally { clearTimeout(t); }
}
chrome.runtime.onMessage.addListener((msg, _de, responder) => {
  (async () => {
    if (msg.tipo === 'api') return responder(await chamar(msg.acao, msg.dados));
    if (msg.tipo === 'abrirWhats') { // 1.2.0: abre a conversa na aba do WhatsApp Web que já está aberta (ou numa nova, se não houver)
      const url = 'https://web.whatsapp.com/send?phone=' + msg.tel + (msg.texto ? '&text=' + encodeURIComponent(msg.texto) : '');
      const abas = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (abas.length) { await chrome.tabs.update(abas[0].id, { url, active: true }); try { await chrome.windows.update(abas[0].windowId, { focused: true }); } catch (e) { /* ok */ } }
      else await chrome.tabs.create({ url });
      return responder({ ok: true });
    }
    if (msg.tipo === 'ativar') {
      const r = await chamar('ext.ativar', { codigo: msg.codigo, nome: msg.nome || 'Chrome' });
      if (r.ok) await chrome.storage.local.set({ token: r.dados.token, usuario: r.dados.usuario });
      return responder(r);
    }
    if (msg.tipo === 'djenAgora') return; // (respondido pelo ouvinte do DJEN)
    responder({ ok: false, erro: 'Pedido desconhecido.' });
  })();
  return true;
});

/* ---------- 1.3.0: DJEN lido pela extensão (Chrome aberto basta; o painel pode estar fechado) ----------
   O CNJ recusa os servidores (Google, GitHub, Supabase): só aceita a internet do escritório. Com o Chrome aberto, a extensão lê as
   comunicações das OABs do escritório de 2 em 2 horas e manda ao painel (rotas ext.djenConfig / ext.djenImportar). Se o painel aberto
   em algum computador já leu há menos de 2 horas, ela não lê de novo. Liga/desliga no popup ("Ler o DJEN deste computador"). */
const DJEN_API = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const espera = ms => new Promise(r => setTimeout(r, ms));
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function buscarDjen(url) {
  let ultimo = null;
  for (let t = 0; t < 4; t++) {
    if (t) await espera([0, 3000, 8000, 15000][t]);
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal: ctl.signal });
      if (r.ok) return await r.json();
      ultimo = new Error('o CNJ respondeu com o código ' + r.status);
      if (!(r.status === 429 || r.status >= 500)) throw ultimo;
    } catch (e) {
      if (e === ultimo && !/código (429|5\d\d)/.test(e.message)) throw e;
      ultimo = e.name === 'AbortError' ? new Error('o CNJ demorou demais para responder') : e;
    } finally { clearTimeout(timer); }
  }
  throw ultimo || new Error('falha ao ler o DJEN');
}
let djenRodando = false;
async function lerDjen(forcar) {
  const st = await chrome.storage.local.get(['token', 'djen', 'djen_ultimo']);
  if (!st.token || st.djen === false || djenRodando) return { ok: false, erro: st.token ? 'desligado' : 'extensão não ligada' };
  if (!forcar && Date.now() - (+st.djen_ultimo || 0) < 2 * 3600e3) return { ok: true, pulou: true };
  djenRodando = true;
  const falhas = []; let novas = 0, prazos = 0, total = 0;
  try {
    const c = await chamar('ext.djenConfig', {});
    if (!c.ok) throw new Error(c.erro || 'o painel não respondeu');
    const cfg = c.dados;
    if (!forcar && cfg.ultima && Date.now() - Date.parse(cfg.ultima) < 2 * 3600e3) { await chrome.storage.local.set({ djen_ultimo: Date.parse(cfg.ultima) }); return { ok: true, pulou: true }; }
    const janelas = [];
    for (let ini = cfg.desde; ini <= cfg.hoje; ini = somaDias(ini, 7)) janelas.push([ini, somaDias(ini, 6) > cfg.hoje ? cfg.hoje : somaDias(ini, 6)]);
    let lote = [], tam = 0;
    const enviar = async fim => {
      if (!lote.length && !fim) return;
      const r = await chamar('ext.djenImportar', { itens: lote, fim });
      if (!r.ok) throw new Error(r.erro || 'o painel não gravou');
      novas += r.dados.novas || 0; prazos += r.dados.prazos || 0; lote = []; tam = 0;
    };
    for (const o of cfg.oabs) {
      for (const [ini, fim] of janelas) {
        try {
          for (let pg = 1; pg <= 20; pg++) {
            const j = await buscarDjen(`${DJEN_API}?numeroOab=${encodeURIComponent(o.numero)}&ufOab=${encodeURIComponent(o.uf)}&dataDisponibilizacaoInicio=${ini}&dataDisponibilizacaoFim=${fim}&pagina=${pg}&itensPorPagina=100`);
            const lista = j.items || j.itens || [];
            for (const it of lista) {
              const x = { id: it.id, hash: it.hash, numeroprocessocommascara: it.numeroprocessocommascara, numero_processo: it.numero_processo,
                data_disponibilizacao: it.data_disponibilizacao || it.dataDisponibilizacao, siglaTribunal: it.siglaTribunal,
                tipoComunicacao: it.tipoComunicacao, nomeOrgao: it.nomeOrgao, texto: String(it.texto || '').slice(0, 20000) };
              const t = JSON.stringify(x).length;
              if (lote.length && (tam + t > 140000 || lote.length >= 150)) await enviar(false);
              lote.push(x); tam += t; total++;
            }
            if (lista.length < 100) break;
            await espera(500);
          }
        } catch (e) { falhas.push(`OAB ${o.numero}/${o.uf} ${ini}–${fim}: ${e.message}`); }
        await espera(300);
      }
    }
    await enviar(!falhas.length); // "lido até hoje" só quando tudo deu certo
    if (falhas.length) throw new Error(falhas.length + ' consulta(s) falharam (o resto foi lido): ' + falhas[0]);
    await chrome.storage.local.set({ djen_ultimo: Date.now(), djen_msg: `Lido em ${new Date().toLocaleString('pt-BR')}: ${total} publicação(ões), ${novas} nova(s), ${prazos} prazo(s) novo(s).` });
    return { ok: true, total, novas, prazos };
  } catch (e) {
    const msg = e.message || String(e);
    chamar('ext.djenImportar', { erro: msg }).catch(() => {});
    await chrome.storage.local.set({ djen_ultimo: Date.now() - 1.75 * 3600e3, djen_msg: 'Problema em ' + new Date().toLocaleString('pt-BR') + ': ' + msg }); // tenta de novo em 15 min
    return { ok: false, erro: msg };
  } finally { djenRodando = false; }
}
chrome.alarms.create('djen', { periodInMinutes: 15, delayInMinutes: 1 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'djen') lerDjen(false); });
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('djen', { periodInMinutes: 15, delayInMinutes: 1 }));
chrome.runtime.onMessage.addListener((msg, _de, responder) => {
  if (msg.tipo !== 'djenAgora') return false;
  lerDjen(true).then(responder);
  return true;
});

/* ---------- 1.5.0: PJe lido SOZINHO (pedido da usuária: "ler todos os tribunais, entrar nos portais") ----------
   O TRT12, o TST e o TRT23 recusam servidores: só o Chrome do escritório, com o certificado da Dra. instalado, entra. Cada tela de
   Expedientes que alguém abrir uma vez fica guardada (por tribunal). De 2 em 2 horas, nos dias úteis das 7h às 20h, a extensão reabre
   essas telas numa aba em segundo plano, o pje.js lê a lista e manda ao painel (ext.pjeLista), e a aba fecha sozinha em 90 s.
   Não clica em nada, não abre expediente (não dá ciência) e não guarda senha. Se o PJe pedir para entrar de novo, o popup mostra. */
const abasDoRobo = new Set();
async function pjeAnotar(host, dados) {
  const { pje = {} } = await chrome.storage.local.get('pje');
  pje[host] = Object.assign(pje[host] || {}, dados);
  await chrome.storage.local.set({ pje });
}
async function lerPjeSozinho(forcar) {
  const st = await chrome.storage.local.get(['token', 'pje', 'pje_auto', 'pje_ultimo']);
  if (!st.token || st.pje_auto === false) return { ok: false, erro: st.token ? 'desligado' : 'extensão não ligada' };
  const agora = new Date(), h = agora.getHours(), dia = agora.getDay();
  if (!forcar && (dia === 0 || dia === 6 || h < 7 || h >= 20)) return { ok: true, pulou: true };
  if (!forcar && Date.now() - (+st.pje_ultimo || 0) < 2 * 3600e3) return { ok: true, pulou: true };
  const telas = Object.entries(st.pje || {}).filter(([, v]) => v && v.url);
  await chrome.storage.local.set({ pje_ultimo: Date.now() });
  for (const [host, v] of telas) {
    try {
      const aba = await chrome.tabs.create({ url: v.url, active: false });
      abasDoRobo.add(aba.id);
      await pjeAnotar(host, { aberto_em: Date.now() });
      setTimeout(() => { abasDoRobo.delete(aba.id); chrome.tabs.remove(aba.id).catch(() => {}); }, 90000);
      await espera(4000);
    } catch (e) { await pjeAnotar(host, { erro: String(e.message || e).slice(0, 120), erro_em: Date.now() }); }
  }
  return { ok: true, telas: telas.length };
}
chrome.alarms.create('pje', { periodInMinutes: 30, delayInMinutes: 2 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'pje') lerPjeSozinho(false); });
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('pje', { periodInMinutes: 30, delayInMinutes: 2 }));
chrome.runtime.onMessage.addListener((msg, de, responder) => {
  if (msg.tipo === 'pjeUrl') { pjeAnotar(msg.host, { url: msg.url, n: msg.n, lido_em: Date.now(), login_em: 0 }).then(() => responder({ ok: true })); return true; }
  if (msg.tipo === 'pjeLogin') { // só conta como "precisa entrar" quando a aba foi aberta pelo robô
    if (de && de.tab && abasDoRobo.has(de.tab.id)) pjeAnotar(msg.host, { login_em: Date.now() }).then(() => responder({ ok: true }));
    else responder({ ok: true });
    return true;
  }
  if (msg.tipo === 'pjeAgora') { lerPjeSozinho(true).then(responder); return true; }
  return false;
});
