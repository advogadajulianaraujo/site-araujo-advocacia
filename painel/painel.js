/* Painel interno — Araújo Advocacia.
   Página estática: todo dado vem do programa do Google (painel-backend/Code.gs),
   que confere a senha e o perfil antes de responder. */
(() => {
  'use strict';

  const API = window.PAINEL_API_URL || '';
  const app = document.getElementById('app');
  const abasEl = document.getElementById('abas');
  const quemEl = document.getElementById('quem');
  let sessao = null; // { token, usuario }

  /* ---------- utilidades ---------- */

  // 8.24: replaceChildren/append/prepend nunca escrevem "null"/"undefined" na tela (filhos opcionais com ? … : null)
  ['replaceChildren', 'append', 'prepend'].forEach(nome => {
    [Element.prototype, DocumentFragment.prototype].forEach(P => {
      const orig = P[nome];
      if (!orig || orig.__limpo) return;
      const novo = function (...f) { return orig.apply(this, f.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false)); };
      novo.__limpo = true; P[nome] = novo;
    });
  });

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  function guardar(chave, valor) {
    try { valor === null ? sessionStorage.removeItem(chave) : sessionStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* navegação privada */ }
  }
  function ler(chave) {
    try { return JSON.parse(sessionStorage.getItem(chave) || 'null'); } catch (e) { return null; }
  }

  let avisoTimer;
  function avisar(msg, ruim) {
    const el = document.getElementById('aviso');
    el.textContent = msg;
    el.className = 'aviso' + (ruim ? ' ruim' : '');
    el.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.hidden = true; }, ruim ? 7000 : 3500);
  }

  /* ---------- memória das telas ----------
     O Google demora 1 a 3 s por pedido. O painel guarda na memória desta aba o que já leu,
     mostra na hora e confere por trás; se algo mudou, redesenha. Qualquer gravação limpa a memória. */
  const LEITURAS = new Set(['indicadores.mes', 'fluxos.processo', 'clientes.portal', 'fin.conferencia', 'audiencias.listar', 'fin.acaoCobranca', 'whats.conversas', 'crm.listar', 'padroes.listar', 'prompts.listar', 'ia.transcricoes', 'fin.recibos', 'fin.painel', 'calc.prazo', 'calc.indices', 'inicio.acoes', 'processos.linhaTempo', 'organizar.listar', 'resumo', 'agenda.listar', 'clientes.listar', 'clientes.obter', 'clientes.documentos',
    'processos.listar', 'prazos.listar', 'intimacoes.listar', 'feriados.listar', 'usuarios.listar', 'relatorio.cumpridos',
    'fin.resumo', 'fin.honorarios', 'fin.honorario', 'fin.areceber', 'modelos.listar', 'tarefas.listar', 'fin.caixa', 'relatorio.geral', 'eu.painel', 'equipe.listar', 'trabalho.aguardando', 'fin.pix', 'relatorio.semana', 'inicio.extras', 'marketing.resumo', 'fin.alevantar', 'future.resumo', 'future.unidade', 'future.pessoas', 'future.cobrancas', 'future.lancamentos', 'future.relatorio', 'future.contratos', 'future.lavanderia', 'future.energia', 'documentos.assinaturas']);
  const FRESCO_MS = 15000; // dentro disso nem confere de novo
  const memoria = new Map(); // chave → { t, txt (JSON), promessa }; guarda texto para cada tela receber sua própria cópia
  let geracao = 0, sujo = false, redesenhoTimer = null;

  function chaveDe(acao, dados) {
    const d = {};
    Object.keys(dados || {}).sort().forEach(k => { const v = dados[k]; if (v !== '' && v !== null && v !== undefined && v !== false) d[k] = v; });
    return acao + '|' + JSON.stringify(d);
  }
  function esquecerTudo() { memoria.clear(); geracao++; salvarMemoria(); }
  /* A memória sobrevive ao F5 (só nesta aba; some ao sair ou fechar o navegador): as telas abrem na hora e são conferidas por trás. */
  let salvarTimer = null;
  function salvarMemoria() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => {
      try {
        if (!sessao) { sessionStorage.removeItem('painel_memoria'); return; }
        const obj = {};
        for (const [k, m] of memoria) if ('txt' in m && m.txt.length < 1500000) obj[k] = m.txt;
        sessionStorage.setItem('painel_memoria', JSON.stringify(obj));
      } catch (e) { try { sessionStorage.removeItem('painel_memoria'); } catch (e2) { /* sem espaço */ } }
    }, 800);
  }
  function recuperarMemoria() {
    try {
      const obj = JSON.parse(sessionStorage.getItem('painel_memoria') || '{}');
      Object.entries(obj).forEach(([k, txt]) => { if (!memoria.has(k)) memoria.set(k, { t: 0, txt }); });
    } catch (e) { /* começa vazia */ }
  }
  /* Depois de gravar, apaga só o que a gravação pode ter mudado; o resto continua na tela na hora e é conferido por trás. */
  const AFETA = {
    clientes: ['eu', 'clientes', 'processos', 'resumo', 'modelos', 'tarefas', 'organizar'], organizar: ['organizar', 'clientes', 'processos', 'resumo', 'eu', 'inicio'], documentos: ['clientes', 'fin', 'modelos', 'resumo', 'processos', 'tarefas', 'eu', 'documentos'],
    processos: ['eu', 'trabalho', 'processos', 'clientes', 'resumo', 'prazos', 'intimacoes', 'tarefas'], prazos: ['eu', 'trabalho', 'prazos', 'resumo', 'agenda', 'intimacoes', 'relatorio', 'processos', 'tarefas'],
    intimacoes: ['eu', 'trabalho', 'intimacoes', 'prazos', 'resumo', 'relatorio'], registro: ['eu', 'relatorio'], trabalho: ['eu', 'trabalho', 'prazos', 'intimacoes', 'resumo', 'relatorio', 'processos', 'tarefas', 'clientes'], robo: ['resumo', 'intimacoes', 'prazos', 'processos', 'eu', 'trabalho', 'tarefas', 'agenda'], agenda: ['agenda', 'inicio', 'resumo', 'prazos', 'intimacoes', 'processos', 'tarefas'], fin: ['fin', 'inicio', 'resumo', 'clientes', 'relatorio'],
    tarefas: ['eu', 'trabalho', 'tarefas', 'prazos', 'resumo', 'relatorio', 'processos', 'agenda'], ia: ['intimacoes', 'prazos', 'tarefas', 'resumo'], resumo: [],
    advogados: ['modelos'], marketing: ['marketing'], usuarios: ['usuarios', 'equipe', 'eu'], feriados: ['feriados', 'prazos', 'resumo'], future: ['future']
  };
  function esquecerDepois(acao) {
    const lista = AFETA[acao.split('.')[0]];
    if (!lista) { esquecerTudo(); return; }
    geracao++;
    // tudo que a gravação pode ter mudado fica "velho": a tela abre na hora com o que já tinha e se redesenha
    // sozinha quando o Google responde (normalmente em 1 a 2 segundos)
    for (const [k, m] of memoria) {
      if ('txt' in m) { m.t = 0; m.velho = lista.includes(k.split('|')[0].split('.')[0]); m.promessa = null; } else memoria.delete(k);
    }
    salvarMemoria();
  }

  /* Tela velha não desenha por cima da nova: as leituras pedidas ao abrir uma tela ficam marcadas com a "vez" da rota;
     se a pessoa já foi para outra tela quando a resposta chega, a tela velha para ali. */
  let rotaN = 0, vezAtual = 0;
  function api(acao, dados) {
    const v = vezAtual, pr = apiBase(acao, dados);
    if (!v || !LEITURAS.has(acao)) return pr;
    return pr.then(x => { if (v !== rotaN) throw Object.assign(new Error('tela trocada'), { obsoleto: true }); return x; });
  }
  const GRAVANDO = new Map();
  async function apiBase(acao, dados) {
    if (!LEITURAS.has(acao) && !(acao === 'processos.andamentos' && !(dados && dados.atualizar))) {
      // clique duplo: o mesmo pedido de gravação em andamento não é enviado de novo
      const kg = chaveDe(acao, dados);
      if (GRAVANDO.has(kg)) return GRAVANDO.get(kg);
      const p = (async () => {
        try { return await chamar(acao, dados); } finally { GRAVANDO.delete(kg); if (acao !== 'situacao') esquecerDepois(acao); }
      })();
      GRAVANDO.set(kg, p);
      return p;
    }
    const k = chaveDe(acao, dados);
    const m = memoria.get(k);
    if (m && 'txt' in m) {
      if ((m.velho || Date.now() - m.t > FRESCO_MS) && !m.promessa) conferir(k, acao, dados, m);
      return JSON.parse(m.txt);
    }
    if (m && m.promessa) return m.promessa.then(v => JSON.parse(JSON.stringify(v)));
    const g = geracao;
    const promessa = chamar(acao, dados).then(v => {
      if (g === geracao) { memoria.set(k, { t: Date.now(), txt: JSON.stringify(v) }); salvarMemoria(); } else memoria.delete(k);
      return JSON.parse(JSON.stringify(v));
    }, e => { memoria.delete(k); throw e; });
    memoria.set(k, { promessa });
    return promessa;
  }

  /** Busca direto no Google, sem usar o que está guardado (para um item recém-criado). */
  function apiFresco(acao, dados) { memoria.delete(chaveDe(acao, dados)); return api(acao, dados); }

  /* Faixa dourada no topo enquanto alguma tela velha é conferida no Google. */
  let conferindo = 0;
  function fimConferir() { conferindo = Math.max(0, conferindo - 1); if (!conferindo) document.body.classList.remove('atualizando'); }
  function conferir(k, acao, dados, m) {
    const g = geracao, velho = !!m.velho;
    if (velho) { conferindo++; document.body.classList.add('atualizando'); }
    m.promessa = chamar(acao, dados).then(v => {
      if (g !== geracao) {
        // houve outra gravação no meio: confere de novo, para não ficar com a tela velha
        const atual = memoria.get(k);
        if (atual && 'txt' in atual && atual.velho && !atual.promessa) conferir(k, acao, dados, atual);
        if (velho) fimConferir();
        return;
      }
      const txt = JSON.stringify(v);
      const mudou = txt !== m.txt;
      memoria.set(k, { t: Date.now(), txt });
      if (velho) fimConferir();
      if (mudou) { pedirRedesenho(); salvarMemoria(); }
    }, () => { m.promessa = null; if (velho) fimConferir(); });
  }

  function pedirRedesenho() {
    const hash = location.hash;
    clearTimeout(redesenhoTimer);
    redesenhoTimer = setTimeout(() => {
      // não atrapalha quem está digitando num formulário
      if (!sessao || sujo || location.hash !== hash || document.querySelector('dialog[open]')) return;
      const y = window.scrollY;
      rota().then(() => window.scrollTo(0, y));
    }, 200);
  }
  app.addEventListener('input', () => { sujo = true; });
  // quem abriu uma parte da tela (ex.: "+ Nova tarefa") não perde o que abriu com o redesenho
  app.addEventListener('toggle', ev => { if (ev.target.open && ev.target.tagName === 'DETAILS' && ev.isTrusted) sujo = true; }, true);

  // acorda o programa do Google logo que a página abre: a primeira resposta de verdade vem bem mais rápida
  try { if (window.PAINEL_API_URL) setTimeout(() => fetch(window.PAINEL_API_URL, { method: 'GET', credentials: 'omit', cache: 'no-store' }).catch(() => {}), 50); } catch (e) { /* sem problema */ }

  /** Depois do login, já busca o que as abas principais usam. */
  function preaquecer() {
    const pode = (sessao && sessao.usuario && sessao.usuario.pode) || {};
    const lista = [['resumo'], ['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}], ['modelos.listar', {}]];
    if (pode.financeiro) lista.push(['fin.resumo'], ['fin.honorarios', {}]);
    if (BANCO) BANCO.iniciar();
    lista.forEach(([a, d]) => api(a, d).catch(() => {}));
    setTimeout(() => lerDjenNavegador(false), 4000);
  }
  /* ---------- DJEN pelo navegador do escritório ----------
     O CNJ recusa os servidores do Google (403). Daqui, com a internet do escritório, o painel busca as
     comunicações das OABs cadastradas a cada 2 horas enquanto estiver aberto e manda para a planilha. */
  const DJEN_API = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
  const espera = ms => new Promise(r => setTimeout(r, ms));
  let djenRodando = null;
  function djenLinkPublico(oab, uf, ini, fim) {
    return `https://comunica.pje.jus.br/consulta?numeroOab=${encodeURIComponent(oab)}&ufOab=${encodeURIComponent(uf)}&dataDisponibilizacaoInicio=${ini}&dataDisponibilizacaoFim=${fim}`;
  }
  /** Um pedido ao DJEN que não desiste fácil: até 4 tentativas (internet caiu, CNJ lento, "muitos pedidos", erro 5xx), 25 s cada. */
  async function buscarDjen(url) {
    let ultimo = null;
    for (let t = 0; t < 4; t++) {
      if (t) await espera([0, 3000, 8000, 15000][t]);
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
      try {
        const resp = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        if (resp.ok) return await resp.json();
        ultimo = new Error('o CNJ respondeu com o código ' + resp.status);
        if (!(resp.status === 429 || resp.status >= 500)) throw ultimo; // 4xx (fora o 429): não adianta repetir
      } catch (e) {
        if (e === ultimo && !(/código (429|5\d\d)/.test(e.message))) throw e;
        ultimo = e.name === 'AbortError' ? new Error('o CNJ demorou demais para responder') : e instanceof TypeError ? new Error('sem conexão com o site do CNJ (internet ou bloqueio)') : e;
      } finally { if (timer) clearTimeout(timer); }
    }
    throw ultimo || new Error('falha ao ler o DJEN');
  }
  function lerDjenNavegador(forcar) {
    if (!sessao || djenRodando) return djenRodando;
    let ult = 0;
    try { ult = +localStorage.getItem('djen_ultimo') || 0; } catch (e) { /* sem memória do navegador */ }
    if (!forcar && Date.now() - ult < 2 * 3600e3) return null;
    try { localStorage.setItem('djen_ultimo', String(Date.now())); } catch (e) { /* idem */ }
    djenRodando = (async () => {
      const falhas = [];
      let novas = 0, prazos = 0, total = 0;
      try {
        const cfg = await chamar('djen.config', {});
        // janelas de 7 dias: pedidos menores respondem mais rápido e caem menos
        const janelas = [];
        for (let ini = cfg.desde; ini <= cfg.hoje; ini = isoSoma(ini, 7)) { const fim = isoSoma(ini, 6) > cfg.hoje ? cfg.hoje : isoSoma(ini, 6); janelas.push([ini, fim]); }
        let lote = [], tam = 0;
        const enviar = async fim => { if (!lote.length && !fim) return; const r = await api('djen.importar', { itens: lote, fim }); novas += r.novas || 0; prazos += r.prazos || 0; lote = []; tam = 0; };
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
                  if (lote.length && (tam + t > 140000 || lote.length >= 150)) await enviar(false); // manda aos poucos: nada se perde se algo cair depois
                  lote.push(x); tam += t; total++;
                }
                if (lista.length < 100) break;
                await espera(500);
              }
            } catch (e) { falhas.push(`OAB ${o.numero}/${o.uf} ${dataBR(ini)}–${dataBR(fim)}: ${e.message}`); }
            await espera(300);
          }
        }
        // só marca "lido até hoje" quando TUDO deu certo; senão a próxima rodada volta a buscar o mesmo período
        await enviar(!falhas.length);
        if (falhas.length) throw new Error(`${falhas.length} consulta(s) falharam (o resto foi lido): ${falhas[0]}`);
        historicoDjen(cfg).catch(() => {}); // por trás: completa os processos antigos (até 2020)
        if (novas) { avisar(`DJEN: ${novas} comunicação(ões) nova(s), ${prazos} prazo(s) novo(s).`); if (/^#\/(inicio|prazos)?$/.test(location.hash.split('?')[0] || '#/')) pedirRedesenho(); }
        return { ok: true, total, novas, prazos };
      } catch (e) {
        const msg = e.message || String(e);
        chamar('djen.importar', { erro: msg }).catch(() => {});
        try { localStorage.setItem('djen_ultimo', String(Date.now() - 1.75 * 3600e3)); } catch (e2) { /* tenta de novo em 15 min */ }
        return { ok: false, erro: msg, total, novas };
      } finally { djenRodando = null; }
    })();
    return djenRodando;
  }
  setInterval(() => { if (sessao) lerDjenNavegador(false); }, 15 * 60e3);

  /** Volta no DJEN, 30 dias por vez, até 2020, e manda só os números dos processos (o servidor cadastra os que faltarem). */
  let histDjenRodando = false;
  async function historicoDjen(cfg, tempoMax) {
    if (histDjenRodando || !cfg.hist || cfg.hist.fim) return { fim: true };
    histDjenRodando = true;
    const t0 = Date.now();
    let ate = cfg.hist.ate, novos = 0;
    try {
      while (Date.now() - t0 < (tempoMax || 120e3)) {
        const ini = isoSoma(ate, -30) < cfg.hist.limite ? cfg.hist.limite : isoSoma(ate, -30);
        const itens = [];
        for (const o of cfg.oabs) {
          for (let pg = 1, tent = 0; pg <= 30; pg++) {
            const url = `${DJEN_API}?numeroOab=${encodeURIComponent(o.numero)}&ufOab=${encodeURIComponent(o.uf)}&dataDisponibilizacaoInicio=${ini}&dataDisponibilizacaoFim=${ate}&pagina=${pg}&itensPorPagina=100`;
            const resp = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
            if (resp.status === 429 && tent++ < 3) { await espera(5000 * tent); pg--; continue; }
            if (!resp.ok) throw new Error('DJEN ' + resp.status);
            const j = await resp.json();
            const lista = j.items || j.itens || [];
            lista.forEach(it => itens.push({ numero: it.numeroprocessocommascara || it.numero_processo, data: it.data_disponibilizacao || it.dataDisponibilizacao,
              tribunal: it.siglaTribunal, orgao: it.nomeOrgao, tipo: it.tipoComunicacao, nomes: (it.destinatarios || []).map(x => x && x.nome).filter(Boolean).slice(0, 6) }));
            if (lista.length < 100) break;
            await espera(600);
          }
        }
        // um item por processo (o mais novo da janela) basta para cadastrar
        const porNum = new Map();
        itens.forEach(x => { const k = String(x.numero || ''); if (!porNum.has(k) || String(x.data) > String(porNum.get(k).data)) porNum.set(k, x); });
        const unicos = [...porNum.values()];
        const proximo = isoSoma(ini, -1), fim = ini <= cfg.hist.limite;
        for (let i = 0; i < unicos.length || i === 0; i += 300) {
          const ultimo = i + 300 >= unicos.length;
          const r = await chamar('djen.historico', { itens: unicos.slice(i, i + 300), ate: ultimo ? proximo : undefined, fim: ultimo && fim });
          novos += r.novos || 0;
          if (!unicos.length) break;
        }
        ate = proximo;
        if (fim) { cfg.hist.fim = true; break; }
      }
      if (novos) avisar(`DJEN antigo: ${novos} processo(s) que faltavam foram cadastrados.`);
      return { novos, ate, fim: !!cfg.hist.fim };
    } finally { histDjenRodando = false; }
  }

  /** Ao passar o mouse (ou encostar o dedo) numa aba, já começa a buscar o que ela mostra. */
  const LEITURAS_DA_ABA = {
    inicio: () => [['resumo'], ['agenda.listar', { inicio: hojeISO(), fim: isoSoma(hojeISO(), 14) }]],
    clientes: () => [['clientes.listar', {}], ['processos.listar', {}]],
    processos: () => [['processos.listar', {}], ['clientes.listar', {}]],
    prazos: () => [['prazos.listar', {}], ['resumo']],
    tarefas: () => [['tarefas.listar', {}]],
    modelos: () => [['modelos.listar', {}], ['clientes.listar', {}]],
    financeiro: () => [['fin.resumo'], ['fin.honorarios', {}]]
  };
  function preBuscar(aba) { const f = LEITURAS_DA_ABA[aba]; if (f && sessao) f().forEach(([a, d]) => api(a, d).catch(() => {})); }

  /* Velocidade: as leituras pedidas juntas (a mesma tela, a busca por trás) vão numa ida só ao Google ("lote"). */
  const EM_LOTE = new Set(['audiencias.listar', 'fin.acaoCobranca', 'ia.transcricoes', 'prompts.listar', 'fin.recibos', 'fin.alevantar', 'resumo', 'agenda.listar', 'clientes.listar', 'clientes.obter', 'clientes.documentos', 'processos.listar', 'prazos.listar',
    'intimacoes.listar', 'feriados.listar', 'usuarios.listar', 'relatorio.cumpridos', 'fin.honorarios', 'fin.honorario', 'fin.areceber', 'tarefas.listar',
    'relatorio.geral', 'eu.painel', 'equipe.listar', 'trabalho.aguardando', 'fin.pix', 'relatorio.semana']);
  let filaLote = [], loteTimer = null, loteDesligado = false;
  /* 8.27: leitura pelo banco novo (Supabase) quando dá; se ele falhar ou demorar, a mesma leitura vai ao Google (painel/banco.js). */
  const BANCO = window.PAINEL_BANCO || null;
  let ultimoGoogle = Date.now();
  if (BANCO) BANCO.configurar((a, d) => chamarUm(a, d));
  function chamar(acao, dados) {
    if (BANCO && sessao && LEITURAS.has(acao) && BANCO.pode(acao)) return BANCO.lerOuPlanilha(acao, dados, () => chamarGoogle(acao, dados));
    return chamarGoogle(acao, dados);
  }
  // a sessão do Google cai com 6 h sem uso: com as telas vindo do banco, um "oi" leve de vez em quando mantém a sessão viva
  setInterval(() => { if (sessao && !document.hidden && Date.now() - ultimoGoogle > 20 * 60000) chamarUm('sessao', {}).catch(() => {}); }, 5 * 60000);
  function chamarGoogle(acao, dados) {
    if (!EM_LOTE.has(acao) || loteDesligado || !sessao) return chamarUm(acao, dados);
    return new Promise((ok, falhou) => {
      filaLote.push({ acao, dados: dados || {}, ok, falhou });
      if (filaLote.length >= 12) { clearTimeout(loteTimer); enviarLote(); }
      else if (!loteTimer) loteTimer = setTimeout(enviarLote, 25);
    });
  }
  async function enviarLote() {
    const fila = filaLote; filaLote = []; loteTimer = null;
    if (!fila.length) return;
    ultimoGoogle = Date.now();
    if (fila.length === 1) { const x = fila[0]; chamarUm(x.acao, x.dados).then(x.ok, x.falhou); return; }
    let j;
    try {
      const resp = await comLimite(API, { method: 'POST', body: JSON.stringify({ acao: 'lote', token: sessao && sessao.token, dados: { pedidos: fila.map(x => ({ acao: x.acao, dados: x.dados })) } }), redirect: 'follow' }, 60000);
      j = await resp.json();
    } catch (e) { fila.forEach(x => chamarUm(x.acao, x.dados).then(x.ok, x.falhou)); return; }
    if (!j || !j.ok || !Array.isArray(j.dados)) { // programa do Google antigo (sem "lote"): volta a pedir um por um
      if (j && /desconhecida|inválido/i.test(j.erro || '')) loteDesligado = true;
      fila.forEach(x => chamarUm(x.acao, x.dados).then(x.ok, x.falhou)); return;
    }
    let caiu = false;
    fila.forEach((x, i) => {
      const r = j.dados[i] || { ok: false, erro: 'Resposta incompleta.' };
      if (r.ok) x.ok(r.dados);
      else { if (r.sessao) caiu = true; x.falhou(new Error(r.erro || 'Erro.')); }
    });
    if (caiu) sair(true);
  }
  /** fetch com tempo limite: o painel nunca fica "carregando" para sempre se o Google travar. */
  async function comLimite(url, op, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    try { return await fetch(url, Object.assign({}, op, ctl ? { signal: ctl.signal } : {})); } finally { if (timer) clearTimeout(timer); }
  }
  async function chamarUm(acao, dados, tentativa) {
    if (!API) throw new Error('O painel ainda não foi ligado ao Google. Veja painel-backend/INSTALAR.md.');
    ultimoGoogle = Date.now();
    let resp;
    try {
      resp = await comLimite(API, { method: 'POST', body: JSON.stringify({ acao, token: sessao && sessao.token, dados: dados || {} }), redirect: 'follow' }, LEITURAS.has(acao) ? 90000 : 340000);
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('O Google demorou demais para responder. Tente de novo em instantes.');
      console.error('[painel] falha ao chamar o servidor', e);
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo. (' + (e && e.message || e) + ')');
    }
    let j;
    try { j = await resp.json(); } catch (e) { throw new Error('Resposta inesperada do servidor.'); }
    if (!j.ok && /sistema está ocupado/i.test(j.erro || '') && !LEITURAS.has(acao) && (tentativa || 0) < 18) {
      // 8.12: o robô está gravando; o pedido nem começou no servidor. Espera e manda de novo (até ~3 min), sem a pessoa perder o que digitou.
      if (!tentativa) avisar('O robô está gravando na planilha agora. Seu pedido será salvo em instantes, não feche esta tela…');
      await new Promise(r => setTimeout(r, 8000));
      return chamarUm(acao, dados, (tentativa || 0) + 1);
    }
    if (!j.ok) {
      if (j.sessao) { sair(true); }
      if (j.erro === 'Ação desconhecida.') throw new Error('Esta parte precisa da atualização do programa do Google (etapa 2): cole o Code.gs novo no Apps Script e implante uma nova versão.');
      throw new Error(j.erro || 'Erro.');
    }
    return j.dados;
  }

  /** Dia (aaaa-mm-dd) de Brasília de uma data ISO com hora. */
  function diaLocal(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return String(iso).slice(0, 10); return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10); }
  function hojeISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function dataBR(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
  function diasAte(iso) {
    if (!iso) return null;
    const um = Date.UTC(...iso.split('-').map((n, i) => i === 1 ? n - 1 : +n));
    const dois = Date.UTC(...hojeISO().split('-').map((n, i) => i === 1 ? n - 1 : +n));
    return Math.round((um - dois) / 86400000);
  }
  function etiquetaDias(iso) {
    const d = diasAte(iso);
    if (d === null) return '';
    if (d < 0) return h('span', { class: 'tag' }, `há ${-d} dia${d === -1 ? '' : 's'}`);
    if (d === 0) return h('span', { class: 'tag urgente' }, 'HOJE');
    const cls = d <= 2 ? 'urgente' : d <= 5 ? 'atencao' : 'ok';
    return h('span', { class: 'tag ' + cls }, `faltam ${d} dia${d === 1 ? '' : 's'}`);
  }
  /** "Audiência 26/10" + 2026-10-26 → "Audiência 26/10/2026"; sem data no texto, acrescenta a data. */
  function atoComData(ato, iso) {
    const t = String(ato || '').trim();
    if (!iso) return t;
    const [a, m, d] = iso.split('-');
    const re = new RegExp('\\b0?' + (+d) + '/0?' + (+m) + '(?!/\\d)\\b');
    return re.test(t) ? t.replace(re, `${d}/${m}/${a}`) : `${t} ${d}/${m}/${a}`;
  }
  /** Tabela mais junta (menos espaço entre as linhas). */
  function compacta(t) { t.classList.add('compacta'); return t; }
  function etiquetaSituacao(s) {
    if (s === 'completo') return h('span', { class: 'tag ok' }, 'completo');
    return h('span', { class: 'tag atencao' }, s || 'a conferir');
  }
  function botao(texto, onclick, cls) {
    return h('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), onclick }, texto);
  }

  /** Endereço do sistema do tribunal para o processo (PJe abre o processo; eproc abre o login). */
  function linkTribunal(numero) {
    const m = /^(\d{7}-\d{2}\.\d{4})\.(\d)\.(\d{2})\.(\d{4})$/.exec(numero || '');
    if (!m) return null;
    const [, , j, tr, orig] = m;
    if (j === '5') return { nome: 'PJe', url: `https://pje.trt${+tr}.jus.br/consultaprocessual/detalhe-processo/${numero}` };
    if (j === '8' && tr === '24') return { nome: 'eproc', url: orig === '0000' ? 'https://eproc2g.tjsc.jus.br/eproc/' : 'https://eproc1g.tjsc.jus.br/eproc/' };
    if (j === '4' && tr === '04') return { nome: 'eproc', url: orig === '0000' ? 'https://eproc.trf4.jus.br/eproc2trf4/' : 'https://eproc.jfsc.jus.br/eprocV2/' };
    return null;
  }
  function acessoTribunal(numero) {
    const l = linkTribunal(numero);
    if (!numero) return null;
    const copiar = h('button', { type: 'button', class: 'link escuro', onclick: async ev => {
      ev.stopPropagation();
      try { await navigator.clipboard.writeText(numero); avisar('Número copiado: ' + numero); } catch (e) { avisar('Não deu para copiar. Selecione o número e copie.', true); }
    } }, 'copiar nº');
    return h('span', { class: 'acesso' },
      l ? h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, 'abrir no ' + l.nome) : null,
      copiar);
  }

  /** Envia um formulário com o botão travado e mostra o erro embaixo. */
  function aoEnviar(form, fn) {
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const erro = form.querySelector('.erro');
      if (erro) erro.textContent = '';
      if (btn) btn.disabled = true;
      try { await fn(new FormData(form)); }
      catch (e) { if (erro) erro.textContent = e.message; else avisar(e.message, true); }
      finally { if (btn) btn.disabled = false; }
    });
  }

  function campo(nome, rotulo, valor, extra) {
    extra = extra || {};
    const id = 'f-' + nome;
    let input;
    if (extra.opcoes) {
      input = h('select', { id, name: nome }, extra.opcoes.map(([v, t]) => h('option', { value: v, selected: v === (valor || '') }, t)));
    } else if (extra.area) {
      input = h('textarea', { id, name: nome }, valor || '');
    } else {
      input = h('input', { id, name: nome, type: extra.tipo || 'text', value: valor || '', autocomplete: extra.auto || 'off',
        required: extra.obrigatorio, inputmode: extra.modo, maxlength: extra.max || 300, placeholder: extra.dica });
    }
    return h('div', { class: extra.largo ? 'largo' : '' }, h('label', { for: id }, rotulo + (extra.obrigatorio ? ' *' : '')), input);
  }

  /** Troca o conteúdo da tela, ignorando partes vazias (null). */
  function mostrar(...itens) { app.replaceChildren(...itens.filter(x => x !== null && x !== undefined && x !== false)); }

  function carregando() {
    const el = h('p', { class: 'carregando' }, 'Carregando…');
    mostrar(el);
    // 8.10: nada fica "Carregando…" sem explicação — depois de 20 s aparece o aviso e o "Tentar de novo"
    setTimeout(() => { if (el.isConnected) el.replaceChildren('Carregando… o Google está demorando para responder. ', h('button', { type: 'button', class: 'btn mini sec', onclick: () => rota() }, 'Tentar de novo')); }, 20000);
  }

  /* ---------- sessão ---------- */

  function sair(expirou) {
    const token = sessao && sessao.token;
    sessao = null;
    if (BANCO) BANCO.sair();
    esquecerTudo();
    try { sessionStorage.removeItem('painel_memoria'); } catch (e) { /* ok */ }
    guardar('painel_sessao', null);
    if (token && !expirou) fetch(API, { method: 'POST', body: JSON.stringify({ acao: 'logout', token }) }).catch(() => {});
    abasEl.hidden = true;
    quemEl.hidden = true;
    document.body.classList.add('sem-sessao');
    if (expirou) avisar('Sua sessão terminou. Entre de novo.', true);
    history.replaceState(null, '', location.pathname); // limpa o endereço sem desenhar a tela duas vezes
    telaLogin();
  }

  const quemBtn = document.getElementById('quem-btn'), quemMenu = document.getElementById('quem-menu');
  const menuQuem = abrir => { quemMenu.hidden = !abrir; quemBtn.setAttribute('aria-expanded', String(abrir)); };
  quemBtn.addEventListener('click', ev => { ev.stopPropagation(); menuQuem(quemMenu.hidden); });
  document.addEventListener('click', ev => { if (!quemMenu.hidden && !quemMenu.contains(ev.target)) menuQuem(false); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !quemMenu.hidden) { menuQuem(false); quemBtn.focus(); } });
  quemMenu.addEventListener('click', () => menuQuem(false));
  document.getElementById('btn-sair').addEventListener('click', () => sair(false));
  document.getElementById('btn-senha').addEventListener('click', () => { location.hash = '#/senha'; });

  /* ---------- WhatsApp: sempre na MESMA aba (ou no aplicativo do computador) ----------
     Todo link wa.me do painel é ajustado na hora do clique: no computador abre o WhatsApp Web numa aba com nome fixo
     ("whatsapp_painel"), então o 2º clique em diante cai na aba que já está aberta, em vez de abrir outra. Quem usa o
     aplicativo do WhatsApp no computador escolhe "WhatsApp: no aplicativo" no menu do nome (fica guardado neste computador).
     No celular continua o wa.me, que abre o aplicativo. O telefone é conferido (2 números juntos, 0 na frente, sem DDI). */
  const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  /* 8.12.3 (pedido da usuária: "não quero apertar esses botões"): modo AUTOMÁTICO. No 1º envio o painel tenta o APLICATIVO do
     WhatsApp do computador (já aberto e logado); se o aplicativo abriu, guarda "app" e todos os próximos vão direto para ele.
     Se não abriu, pergunta uma vez só e passa a usar o WhatsApp Web, sempre na MESMA aba (whatsapp_painel), que fica logada.
     A escolha fica neste computador (localStorage whats_modo = auto|app|web e whats_aprendido = app|web). */
  const lerLS = (k, pad) => { try { return localStorage.getItem(k) || pad; } catch (e) { return pad; } };
  const gravarLS = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sem memória */ } };
  const modoWhats = () => { const m = lerLS('whats_modo', 'auto'); return m === 'auto' ? lerLS('whats_aprendido', 'auto') : m; };
  const btnWhats = document.getElementById('btn-whats');
  const rotuloWhats = () => {
    if (!btnWhats) return;
    const m = lerLS('whats_modo', 'auto'), ap = lerLS('whats_aprendido', '');
    btnWhats.textContent = 'WhatsApp: ' + (m === 'app' ? 'aplicativo' : m === 'web' ? 'WhatsApp Web' : 'automático' + (ap === 'app' ? ' (aplicativo)' : ap === 'web' ? ' (Web)' : ''));
  };
  const btnWhatsAbrir = document.getElementById('btn-whats-abrir');
  if (btnWhatsAbrir) btnWhatsAbrir.hidden = true; // a aba do WhatsApp Web abre sozinha no 1º envio
  if (btnWhats) {
    if (celular) btnWhats.hidden = true;
    rotuloWhats();
    btnWhats.addEventListener('click', () => {
      const caixa = h('dialog', { class: 'dialogo whats-modo' },
        h('h2', {}, 'Para onde vão as mensagens de WhatsApp'),
        h('p', { class: 'peq' }, 'Neste computador. No automático o painel descobre sozinho e não pergunta mais.'),
        ...[['auto', 'Automático (recomendado)', 'Usa o aplicativo se ele estiver instalado; senão, o WhatsApp Web sempre na mesma aba.'],
          ['app', 'Sempre o aplicativo do WhatsApp', 'O aplicativo do computador já fica aberto e logado: a mensagem cai direto nele.'],
          ['web', 'Sempre o WhatsApp Web', 'Abre numa aba do Chrome que o painel reaproveita em todos os envios.']].map(([v, t, d]) =>
          h('button', { type: 'button', class: 'whats-op' + (lerLS('whats_modo', 'auto') === v ? ' ativo' : ''), onclick: () => {
            gravarLS('whats_modo', v); if (v === 'auto') gravarLS('whats_aprendido', null); rotuloWhats(); caixa.close(); avisar('Pronto: ' + t.replace(' (recomendado)', '') + '.');
          } }, h('strong', {}, t), h('span', {}, d))),
        h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'btn sec', onclick: () => caixa.close() }, 'Fechar')));
      caixa.addEventListener('close', () => caixa.remove()); document.body.append(caixa); caixa.showModal();
    });
  }
  const urlApp = (tel, enc) => 'whatsapp://send?phone=' + tel + (enc ? '&text=' + enc : '');
  const urlWeb = (tel, enc) => 'https://web.whatsapp.com/send?phone=' + tel + (enc ? '&text=' + enc : '');
  /** 1º envio no modo automático: tenta o aplicativo; se o Chrome perder o foco (o app abriu), aprende "app". Senão pergunta UMA vez. */
  function descobrirWhats(tel, enc) {
    let abriu = false;
    const viu = () => { if (abriu) return; abriu = true; gravarLS('whats_aprendido', 'app'); rotuloWhats(); if (caixa.open) caixa.close(); };
    const caixa = h('dialog', { class: 'dialogo whats-modo' },
      h('h2', {}, 'O WhatsApp abriu no aplicativo?'),
      h('p', { class: 'peq' }, 'Pergunto só desta vez: depois o painel manda sempre para o mesmo lugar, sem perguntar.'),
      h('div', { class: 'acoes' },
        h('button', { type: 'button', class: 'btn', onclick: () => { gravarLS('whats_aprendido', 'app'); rotuloWhats(); caixa.close(); avisar('Combinado: as mensagens vão sempre para o aplicativo do WhatsApp deste computador.'); } }, 'Sim, abriu no aplicativo'),
        h('button', { type: 'button', class: 'btn sec', onclick: () => {
          gravarLS('whats_aprendido', 'web'); rotuloWhats(); caixa.close();
          const w = window.open(urlWeb(tel, enc), 'whatsapp_painel');
          if (w) avisar('Combinado: as mensagens vão para o WhatsApp Web, sempre nesta mesma aba (ela fica logada).');
        } }, 'Não, usar o WhatsApp Web')));
    caixa.addEventListener('close', () => { caixa.remove(); removeEventListener('blur', viu); document.removeEventListener('visibilitychange', vis); });
    const vis = () => { if (document.hidden) viu(); };
    addEventListener('blur', viu); document.addEventListener('visibilitychange', vis);
    document.body.append(caixa); caixa.showModal();
    location.href = urlApp(tel, enc); // se o aplicativo existe, o Chrome entrega a mensagem para ele (na 1ª vez pede "Abrir WhatsApp?")
  }
  function telefoneWhats(bruto) {
    // 8.11: cadastro com dois telefones ("48 99999-0000 / 48 3626-0000", "… ou …") → só o primeiro, ANTES de juntar os dígitos
    const partes = String(bruto || '').split(/\s*(?:[\/;,|]|\bou\b|\be\b)\s*/i).filter(x => x.replace(/\D/g, '').length >= 10);
    let t = String(partes[0] || bruto || '').replace(/\D/g, '');
    if (t.startsWith('55') && t.length > 13) t = t.slice(2);
    if (!t.startsWith('55') || t.length < 12) {
      t = t.replace(/^0+/, '');
      if (t.length > 11) t = t.slice(0, t[2] === '9' ? 11 : 10); // dois telefones juntos no cadastro: fica o primeiro
      if (t.length < 10) return '';
      t = '55' + t;
    }
    return t.length >= 12 && t.length <= 13 ? t : '';
  }
  document.addEventListener('click', ev => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    const m = /^https:\/\/(?:wa\.me\/(\d*)|api\.whatsapp\.com\/send\/?|web\.whatsapp\.com\/send\/?)(?:\?(.*))?$/.exec(a.href);
    if (!m) return;
    const q = new URLSearchParams(m[2] || '');
    const tel = telefoneWhats(m[1] || q.get('phone') || '');
    const texto = q.get('text') || '';
    if (!tel) { ev.preventDefault(); avisar('Telefone incompleto ou inválido no cadastro: confira o número (com DDD) e tente de novo.', true); return; }
    const enc = encodeURIComponent(texto);
    if (celular) { a.href = 'https://wa.me/' + tel + (texto ? '?text=' + enc : ''); return; }
    const modo = modoWhats();
    if (modo === 'auto') { ev.preventDefault(); descobrirWhats(tel, enc); return; }
    if (modo === 'app') { a.href = urlApp(tel, enc); a.removeAttribute('target'); return; }
    a.href = urlWeb(tel, enc);
    a.target = 'whatsapp_painel'; // aba com nome: todo clique cai na mesma aba, que continua logada
    a.rel = ''; a.referrerPolicy = 'no-referrer'; // "noopener" impediria reaproveitar a aba
  }, true);

  /* Menu lateral: [id, nome, grupo, permissão, ícone (traços SVG 24×24)] */
  const ICONES = {
    inicio: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-6h3v6h5V10',
    clientes: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c1.8.8 3 2.7 3 5.7',
    processos: 'M7 3.5h7l4 4V20.5H7zM14 3.5V8h4M9.5 12h6M9.5 15.5h6',
    prazos: 'M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 8v5l3 2',
    tarefas: 'M4 5.5h4v4H4zM4 14.5h4v4H4zM11 7.5h9M11 16.5h9',
    agenda: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
    modelos: 'M6 3.5h12v17H6zM9 8h6M9 11.5h6M9 15h4',
    financeiro: 'M3.5 7h17v11h-17zM3.5 10.5h17M7 14.5h3',
    relatorios: 'M4.5 19.5h15M7 16V11M11.5 16V7M16 16v-6',
    marketing: 'M4 10v4h3l6 4V6L7 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
    audiencias: 'M12 3.5v3M7 8.5h10l-1.5 4h-7zM5 20.5h14M12 12.5v8M8.5 20.5l3.5-3 3.5 3',
    usuarios: 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5'
  };
  const CANAIS_CONHECEU = ['Google Ads (anúncio)', 'Google (pesquisa ou mapa)', 'Site', 'Instagram / Facebook', 'Indicação', 'Já era cliente', 'Outro'];
  // 8.12 (pedido da usuária): Relacionamento (CRM e Marketing), Documentos (com calculadoras e padrões), Inteligência (IA) e Gestão
  Object.assign(ICONES, {
    crm: 'M3.5 5h17l-6.5 7.5V18l-4 2.5v-8z',
    conversas: 'M4 5.5h16v10H9l-5 4zM8 9.5h8M8 12.5h5',
    calculadoras: 'M6 3.5h12v17H6zM8.5 6.5h7v3h-7zM8.5 13h2M13.5 13h2M8.5 16.5h2M13.5 16.5h2',
    padroes: 'M12 3.5l7 3v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9v-5zM9 12l2 2 4-4',
    transcricao: 'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3ZM6 11.5a6 6 0 0 0 12 0M12 17.5v3M9 20.5h6',
    pecas: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z',
    prompts: 'M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z',
    recibos: 'M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5zM9 8h6M9 11.5h6M9 15h3'
  });
  // 8.24 (pedido da usuária, layout "C"): menu lateral CLARO com poucos itens; o resto virou sub-aba no topo (SUBABAS)
  const ABAS = [ // 8.25.1 (pedido da usuária): exatamente estes 7 itens
    ['inicio', 'Início'],
    ['clientes', 'Clientes'],
    ['prazos', 'Processos e prazos', null, 'processos'],
    ['agenda', 'Agenda'],
    ['financeiro', 'Cobranças', 'financeiro', 'cobranca'],
    ['modelos', 'Documentos'],
    ['crm', 'Atendimento', 'usuarios', 'conversas']
    // Relatórios, Equipe e Gerenciar acessos ficam no menu do nome (clicar no usuário, embaixo)
  ];
  // sub-abas da barra do topo: [rota, nome, permissão]
  const SUBABAS = {
    prazos: [['prazos', 'Intimações e prazos'], ['processos', 'Processos'], ['tarefas', 'Tarefas']],
    agenda: [['agenda', 'Calendário'], ['audiencias', 'Audiências e perícias']],
    modelos: [['modelos', 'Gerar documentos'], ['calculadoras', 'Calculadoras'], ['transcricao', 'Gravar e resumir conversa']],
    crm: [['crm', 'Funil de atendimento', 'usuarios'], ['conversas', 'Chatbot do WhatsApp', 'usuarios'], ['marketing', 'Marketing', 'usuarios']],
    relatorios: [['relatorios', 'Resumo do mês', 'usuarios'], ['relatorios?ver=equipe', 'Equipe', 'usuarios']]
  };
  const SECAO_DA_TELA = { audiencias: 'agenda', compromisso: 'agenda', calculadoras: 'modelos', transcricao: 'modelos', conversas: 'crm', marketing: 'crm',
    processos: 'prazos', processo: 'prazos', tarefas: 'prazos', cliente: 'clientes', organizar: 'clientes', honorario: 'financeiro', prazo: 'prazos' };
  ICONES.predio = 'M5 20.5V4.5h9v16M14 9.5h5v11M8 8h3M8 11.5h3M8 15h3M3.5 20.5h17';
  ICONES.trocar = 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5';
  ICONES.cobranca = 'M4 6.5h16v11H4zM4 10h16M8 14h4';
  ICONES.energia = 'M13 3 6 13.5h5.5L10.5 21 18 10h-5.5z';
  ICONES.pessoas = ICONES.clientes;
  const ABAS_FUTURE = [ // 8.4: menos abas e na ordem do mês (pedido do Luiz: "está confuso")
    ['future', 'Visão geral', 'Dia a dia', 'predio'],
    ['future/cobrancas', 'Cobranças', 'Dia a dia', 'cobranca'],
    ['future/energia', 'Energia', 'Dia a dia', 'energia'],
    ['future/lavanderia', 'Lavanderia e faxina', 'Dia a dia', 'tarefas'],
    ['future/caixa', 'Despesas', 'Dia a dia', 'financeiro'],
    ['future/unidades', 'Apartamentos e salas', 'Cadastro', 'inicio'],
    ['future/pessoas', 'Locatários', 'Cadastro', 'pessoas'],
    ['future/contratos', 'Contratos', 'Cadastro', 'modelos'],
    ['future/relatorio', 'Relatório do mês', 'Fechamento', 'relatorios'],
    ['future/config', 'Configurações', 'Fechamento', 'usuarios']
  ];
  const modoFuture = () => /^#\/future(\/|\?|$)/.test(location.hash || '');
  const icone = id => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'ico');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONES[id] || ''); svg.append(p); return svg; };

  function montarTopo() {
    const pode = sessao.usuario.pode;
    const itens = [];
    let grupo = '';
    const fut = !!pode.future && modoFuture();
    montarTopo.modo = fut;
    document.body.classList.toggle('modo-future', fut);
    const marca = document.querySelector('.lateral .marca span'); if (marca) marca.textContent = fut ? 'Edifício Future' : 'Araújo Advocacia';
    if (fut) ABAS_FUTURE.forEach(([id, nome, g, ic]) => {
      if (g !== grupo) { grupo = g; itens.push(h('span', { class: 'abas-grupo' }, g)); }
      itens.push(h('a', { href: '#/' + id, 'data-aba': id, onclick: () => abrirLateral(false) }, icone(ic), h('span', {}, nome)));
    });
    else ABAS.filter(a => !a[2] || pode[a[2]]).forEach(([id, nome, , ic]) => {
      itens.push(h('a', { href: '#/' + id, 'data-aba': id, onpointerenter: () => preBuscar(id), onfocus: () => preBuscar(id), onclick: () => abrirLateral(false) }, icone(ic || id), h('span', {}, nome)));
    });
    // botão de trocar de painel (só para quem tem acesso ao Edifício Future)
    if (pode.future) itens.push(h('a', { class: 'trocar-painel', href: fut ? '#/inicio' : '#/future', onclick: () => abrirLateral(false) },
      icone(fut ? 'trocar' : 'predio'), h('span', {}, fut ? 'Voltar ao escritório' : 'Painel Edifício Future')));
    abasEl.replaceChildren(...itens);
    const nome = sessao.usuario.nome || sessao.usuario.usuario;
    document.getElementById('quem-nome').textContent = nome;
    document.getElementById('quem-perfil').textContent = sessao.usuario.perfilNome;
    document.getElementById('quem-avatar').textContent = String(nome).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const mUs = document.getElementById('menu-usuarios'); mUs.textContent = 'Gerenciar acessos'; mUs.hidden = !pode.usuarios;
    const mRel = document.getElementById('menu-relatorios'); mRel.hidden = !pode.usuarios;
    const mEq = document.getElementById('menu-equipe'); if (mEq) mEq.hidden = !pode.usuarios;
    document.body.classList.remove('sem-sessao');
    abasEl.hidden = false;
    quemEl.hidden = false;
  }

  // celular: o menu lateral abre por cima da tela
  const lateralEl = document.getElementById('lateral'), fundoEl = document.getElementById('lateral-fundo'), menuCel = document.getElementById('menu-cel');
  function abrirLateral(abrir) {
    document.body.classList.toggle('lateral-aberta', !!abrir);
    fundoEl.hidden = !abrir;
    menuCel.setAttribute('aria-expanded', String(!!abrir));
  }
  menuCel.addEventListener('click', () => abrirLateral(!document.body.classList.contains('lateral-aberta')));
  fundoEl.addEventListener('click', () => abrirLateral(false));
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') abrirLateral(false); });
  if (!lateralEl) console.warn('menu lateral ausente');

  function marcarAba(id) {
    if (modoFuture()) { const c = (location.hash.slice(2).split('?')[0]).replace(/^future\/unidade\/.*/, 'future/unidades'); abasEl.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.aba === c)); desenharSubabas(''); return; }
    const tela = id;
    id = SECAO_DA_TELA[id] || id;
    abasEl.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.aba === id));
    desenharSubabas(id, tela);
  }
  /** 8.24: barra do topo — busca única + sub-abas da seção (Agenda › Audiências, Documentos › Calculadoras, Atendimento › Chatbot…). */
  function desenharSubabas(secao, tela) {
    const nav = document.getElementById('subabas'); if (!nav) return;
    const pode = (sessao && sessao.usuario.pode) || {};
    const lista = (SUBABAS[secao] || []).filter(x => !x[2] || pode[x[2]]);
    const hashAgora = location.hash.slice(2);
    const atual = lista.find(x => x[0] === hashAgora) || lista.find(x => x[0] === tela && !/\?/.test(x[0]) && !/[?&]ver=equipe/.test(hashAgora)) || lista.find(x => x[0].split('?')[0] === tela);
    nav.replaceChildren(...(lista.length > 1 ? lista.map(x => h('a', { href: '#/' + x[0], 'aria-current': x === atual ? 'page' : null }, x[1])) : []));
    nav.hidden = lista.length < 2;
  }
  (function montarBuscaTopo() {
    const form = document.getElementById('busca-topo'); if (!form) return;
    form.addEventListener('submit', ev => { ev.preventDefault(); const v = form.q.value.trim(); if (!v) return; location.hash = '#/clientes?busca=' + encodeURIComponent(v); form.q.blur(); });
    document.addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); form.q.focus(); form.q.select(); } });
  })();

  /* ---------- login ---------- */

  async function telaLogin() {
    if (!API) {
      mostrar(h('div', { class: 'entrar' }, h('h1', {}, 'Painel interno'),
        h('p', {}, 'O painel ainda não foi ligado ao Google. Siga o passo a passo em painel-backend/INSTALAR.md e cole o endereço em painel/config.js.')));
      return;
    }
    let lembrado = '';
    try { lembrado = localStorage.getItem('painel_usuario') || ''; } catch (e) { /* navegação privada */ }
    const form = h('form', { class: 'entrar', novalidate: true },
      h('h1', {}, 'Entrar'),
      h('p', {}, 'Acesso restrito à equipe da Araújo Advocacia.'),
      h('div', { class: 'campo' }, h('label', { for: 'l-u' }, 'Usuário'), h('input', { id: 'l-u', name: 'usuario', autocomplete: 'username', required: true, autocapitalize: 'none' })),
      h('div', { class: 'campo' }, h('label', { for: 'l-s' }, 'Senha'), h('input', { id: 'l-s', name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
      h('label', { class: 'marcar lembrar' }, h('input', { type: 'checkbox', name: 'lembrar', checked: true }), 'Lembrar meu usuário neste computador'),
      h('button', { type: 'submit', class: 'btn' }, 'Entrar'),
      h('p', { class: 'peq dica-senha' }, 'Para não digitar a senha toda vez, aceite quando o navegador perguntar "Salvar senha?". Use só no computador do escritório.'),
      h('p', { class: 'erro' }),
      h('div', { class: 'rodape', id: 'primeiro' }));
    mostrar(form);
    if (lembrado) { form.usuario.value = lembrado; form.senha.focus(); } else form.querySelector('input').focus();
    aoEnviar(form, async fd => {
      const r = await api('login', { usuario: fd.get('usuario'), senha: fd.get('senha') });
      try { if (fd.get('lembrar')) localStorage.setItem('painel_usuario', fd.get('usuario')); else localStorage.removeItem('painel_usuario'); } catch (e) { /* navegação privada */ }
      // pede ao navegador para guardar usuário e senha no gerenciador de senhas (Chrome/Edge)
      try { if (window.PasswordCredential && navigator.credentials) await navigator.credentials.store(new PasswordCredential({ id: fd.get('usuario'), password: fd.get('senha'), name: r.usuario.nome })); } catch (e) { /* o navegador recusou */ }
      sessao = r;
      document.getElementById('aviso').hidden = true;
      guardar('painel_sessao', r);
      montarTopo();
      preaquecer();
      location.hash = '#/inicio';
      rota();
    });
    try {
      const s = await api('situacao');
      if (s.precisaPrimeiroAcesso) {
        document.getElementById('primeiro').replaceChildren(
          h('a', { href: '#/primeiro-acesso' }, 'Primeiro acesso: criar o administrador'));
      }
    } catch (e) {
      document.getElementById('primeiro').replaceChildren(
        h('p', { class: 'erro' }, e.message),
        h('a', { href: '#/primeiro-acesso' }, 'Primeiro acesso: criar o administrador'));
    }
  }

  function telaPrimeiroAcesso() {
    const form = h('form', { class: 'entrar' },
      h('h1', {}, 'Primeiro acesso'),
      h('p', {}, 'Crie o primeiro administrador. O código está na aba Config da planilha "PAINEL — BANCO DE DADOS", no Drive.'),
      h('div', { class: 'campo' }, campo('codigo', 'Código de primeiro acesso', '', { obrigatorio: true })),
      h('div', { class: 'campo' }, campo('nome', 'Seu nome', '', { obrigatorio: true })),
      h('div', { class: 'campo' }, campo('usuario', 'Usuário (sem espaços)', '', { obrigatorio: true, auto: 'username' })),
      h('div', { class: 'campo' }, campo('senha', 'Senha', '', { obrigatorio: true, tipo: 'password', auto: 'new-password' , dica: 'mínimo 4 caracteres (pode ser só números)' })),
      h('div', { class: 'campo' }, campo('senha2', 'Repita a senha', '', { obrigatorio: true, tipo: 'password', auto: 'new-password' })),
      h('button', { type: 'submit', class: 'btn' }, 'Criar administrador'),
      h('p', { class: 'erro' }),
      h('div', { class: 'rodape' }, h('a', { href: '#' }, 'Voltar ao login')));
    mostrar(form);
    aoEnviar(form, async fd => {
      if (fd.get('senha') !== fd.get('senha2')) throw new Error('As senhas não conferem.');
      await api('primeiroAcesso', { codigo: fd.get('codigo'), nome: fd.get('nome'), usuario: fd.get('usuario'), senha: fd.get('senha') });
      avisar('Administrador criado. Agora entre com o usuário e a senha.');
      location.hash = '';
    });
  }

  /* ---------- início ---------- */

  async function telaInicio() {
    carregando();
    const hoje = hojeISO();
    const secretaria = ['secretario', 'rh'].includes(sessao.usuario.perfil);
    // o que não é essencial tem 25 s: se o Google demorar, o Início abre sem aquele bloco em vez de ficar carregando
    let pExtras = null;
    const ate = (p, vazio) => Promise.race([p.catch(() => vazio), new Promise(ok => setTimeout(() => ok(vazio), 25000))]);
    const [r, ag, meu, aguarda, extras] = await Promise.all([api('resumo'), ate(api('agenda.listar', { inicio: hoje, fim: isoSoma(hoje, 14) }), null),
      ate(api('eu.painel'), null), sessao.usuario.pode.usuarios ? ate(api('trabalho.aguardando'), []) : Promise.resolve([]),
      secretaria || sessao.usuario.pode.usuarios ? ate(pExtras = api('inicio.extras', { dia: hoje }), null) : Promise.resolve(null)]);
    // o Google demorou mais que 25 s: abre sem os blocos e redesenha sozinho quando chegarem (antes ficavam vazios)
    if (!extras && pExtras) { const n0 = rotaN; pExtras.then(x => { if (x && n0 === rotaN && /^#?\/?$/.test(location.hash.replace('#', '')) ) rota(); }).catch(() => {}); }
    const procsIni = [];
    const t = r.totais, pode = sessao.usuario.pode;
    const pz = Object.assign({ vencendo: 0, aDefinir: 0, aConferir: 0, vencidos: 0, proximos: [], atrasados: [] }, r.prazos);
    const eventos = ag ? ag.eventos.slice().sort((a, b) => a.inicio < b.inicio ? -1 : 1) : [];
    const deHoje = eventos.filter(e => e.inicio.slice(0, 10) === hoje);
    const hora = e => e.diaTodo ? 'dia todo' : e.inicio.slice(11, 16);
    const mes = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short' }).replace('.', '');
    const selo = (iso, cls) => h('div', { class: 'selo-data ' + (cls || '') }, h('b', {}, iso.slice(8, 10)), h('span', {}, mes(iso)));
    const vazio = txt => h('p', { class: 'ini-vazio' }, txt);
    const item = (onclick, lado, titulo, sub, extra) => h('li', { tabindex: 0, onclick, onkeydown: e => { if (e.key === 'Enter') onclick(); } },
      lado, h('div', { class: 'ini-txt' }, h('div', { class: 'ini-tit' }, titulo), sub ? h('div', { class: 'peq' }, sub) : null), extra || null);
    const bloco = (titulo, link, rotuloLink, corpo) => h('section', { class: 'ini-bloco' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, titulo), link ? h('a', { href: link }, rotuloLink) : null), corpo);

    const semAcento = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const evAtos = eventos.filter(e => e.agenda !== 'ATENDIMENTOS');
    const jaNaAgenda = p => evAtos.some(e => e.inicio.slice(0, 10) === p.proximo_ato_data &&
      (semAcento(e.titulo + ' ' + e.descricao).includes(semAcento(p.numero)) || (p.cliente && semAcento(e.titulo).includes(semAcento(primeiroNome(p.cliente))))));
    const nHoje = deHoje.length + (r.proximos || []).filter(p => p.proximo_ato_data === hoje && !jaNaAgenda(p)).length;

    // números principais (4)
    const ICO_ATALHO = { '#/prazos': 'prazos', '#/tarefas': 'tarefas', '#/agenda?visao=dia': 'agenda', '#/agenda?visao=semana': 'agenda', '#/processos': 'processos', '#/clientes': 'clientes', '#/': 'financeiro' };
    const atalho = (href, nome, numero, legenda, cls) => h('a', { class: 'atalho ' + (cls || ''), href },
      h('span', { class: 'atalho-ico' }, icone(ICO_ATALHO[href] || 'inicio')),
      h('span', { class: 'atalho-corpo' }, h('b', {}, String(numero)), h('span', { class: 'atalho-nome' }, nome), h('span', { class: 'atalho-leg' }, legenda)));
    const tar = r.tarefas || {};
    const atalhos = h('nav', { class: 'atalhos ini-numeros', 'aria-label': 'Resumo' },
      atalho('#/prazos', 'Prazos', pz.vencidos || pz.vencendo, pz.vencidos ? 'vencido(s) sem baixa' : 'vencem em até 5 dias', pz.vencidos ? 'alerta' : pz.vencendo ? 'atencao' : ''),
      atalho('#/agenda?visao=dia', 'Hoje', nHoje, nHoje === 1 ? 'compromisso' : 'compromissos'),
      atalho('#/tarefas', 'Tarefas', tar.abertas || 0, tar.atrasadas ? `${tar.atrasadas} atrasada(s)` : 'com você', tar.atrasadas ? 'alerta' : ''),
      atalho('#/processos', 'Processos', t.processos, `${t.clientes} clientes`));

    // prazos: vencidos primeiro, depois os próximos pela data fatal
    const sisIni = sistemaPreferido();
    const listaPrazos = pz.atrasados.concat(pz.proximos.filter(z => z.fatal)).filter(z => sisIni === 'todos' || sistemaDoPrazo(z) === sisIni).slice(0, 6);
    const blocoPrazos = bloco(NOME_SIS[sisIni], '#/prazos', 'ver todos',
      h('div', {},
        listaPrazos.length ? h('ul', { class: 'ini-lista' }, listaPrazos.map(z => item(() => { location.hash = '#/prazo/' + z.id; },
          selo(z.fatal, filaDe(z) === 'conferir' ? 'faixa-conferir' : 'faixa-' + faixaPrazo(z)), filaDe(z) === 'conferir' ? '⚠ ' + String(z.descricao || '').replace(/PROVISÓRIO:?\s*/i, 'Conferir no tribunal: ') : z.descricao, (z.cliente || 'cliente a identificar') + ' · ' + z.numero, etiquetaContagem(z.fatal))))
          : vazio('Nenhum prazo em aberto com data fatal.'),
        pz.aConferir ? h('a', { class: 'ini-aviso', href: '#/prazos?ver=conferir' }, `${pz.aConferir} prazo(s) calculado(s) pelo robô para conferir`) : null));

    // agenda: hoje (prazos fatais, atendimentos, audiências) e os próximos dias, numa lista só
    const fataisHoje = pz.proximos.filter(z => z.fatal === hoje);
    const agenda = eventos.map(e => ({ data: e.inicio.slice(0, 10), hora: hora(e), ir: () => { location.hash = '#/agenda?visao=dia&data=' + e.inicio.slice(0, 10); },
      tit: e.titulo, sub: [hora(e), NOME_CURTO[e.agenda] || e.agenda, e.local].filter(Boolean).join(' · ') }))
      .concat((r.proximos || []).filter(p => !jaNaAgenda(p)).map(p => ({ data: p.proximo_ato_data, hora: '', ir: () => { location.hash = '#/processo/' + p.id; },
        tit: p.proximo_ato, sub: [p.cliente || 'cliente a identificar', p.orgao || p.numero].filter(Boolean).join(' · ') })))
      .filter(x => x.data && x.data >= hoje)
      .sort((a, b) => (a.data + a.hora) < (b.data + b.hora) ? -1 : 1).slice(0, 6)
      .map(x => item(x.ir, selo(x.data, x.data === hoje ? 'faixa-hoje' : ''), x.tit, x.sub, x.data === hoje ? h('span', { class: 'tag urgente' }, 'hoje') : etiquetaDias(x.data)));
    const blocoAgenda = bloco('Agenda', '#/agenda?visao=semana', 'ver semana',
      agenda.length ? h('ul', { class: 'ini-lista' }, agenda) : vazio(ag ? 'Nada marcado para os próximos 14 dias.' : 'Agenda indisponível no momento.'));

    // dois gráficos redondos: prazos em aberto e processos por área
    const ativosIni = (procsIni || []).filter(p => p.status !== 'arquivado' && p.fase !== 'extinto');
    const porAreaIni = {};
    ativosIni.forEach(p => { const a = p.area || 'Sem área'; porAreaIni[a] = (porAreaIni[a] || 0) + 1; });
    const areasOrd = Object.keys(porAreaIni).sort((a, b) => porAreaIni[b] - porAreaIni[a]);
    const areasTop = areasOrd.slice(0, 5).map(a => ({ nome: a, valor: porAreaIni[a], ir: () => { location.hash = '#/processos?area=' + encodeURIComponent(a); } }));
    const outras = areasOrd.slice(5).reduce((n, a) => n + porAreaIni[a], 0);
    if (outras) areasTop.push({ nome: 'Outras áreas', valor: outras, cor: '#9aa0aa', ir: () => { location.hash = '#/processos'; } });
    const maisDe5 = Math.max(0, (pz.abertos || 0) - (pz.vencidos || 0) - (pz.vencendo || 0) - (pz.aDefinir || 0));
    const blocoVisao = ativosIni.length || pz.abertos ? h('section', { class: 'ini-visao' },
      h('div', { class: 'ini-roscas dois' },
        h('div', { class: 'ini-rosca' }, h('h3', {}, 'Prazos em aberto'), grafRosca([
          { nome: 'Vencidos', valor: pz.vencidos || 0, cor: '#8f1d14', ir: () => { location.hash = '#/prazos?ver=vencido'; } },
          { nome: 'Até 5 dias', valor: pz.vencendo || 0, cor: '#e0a23a', ir: () => { location.hash = '#/prazos?ver=urgente'; } },
          { nome: 'Mais de 5 dias', valor: maisDe5, cor: '#1f8a4c', ir: () => { location.hash = '#/prazos'; } },
          { nome: 'A definir', valor: pz.aDefinir || 0, cor: '#7a4fc0', ir: () => { location.hash = '#/prazos?ver=definir'; } }], { rotulo: 'prazos', titulo: 'Prazos em aberto', vazio: 'Nenhum prazo em aberto.' })),
        h('div', { class: 'ini-rosca' }, h('h3', {}, 'Processos ativos por área'), grafRosca(areasTop, { rotulo: 'ativos', titulo: 'Processos por área' })))) : null;

    const nTar = meu ? meu.abertas : (tar.abertas || 0);

    // ----- o que é de cada um: minhas tarefas e prazos, e o que fiz na semana -----
    const PRI = { urgente: 'Urgente', alta: 'Alta' };
    const blocoMinhas = meu ? bloco('Minhas tarefas e prazos', '#/tarefas?quem=eu', 'abrir quadro',
      meu.minhas.length ? h('ul', { class: 'ini-lista' }, meu.minhas.slice(0, 7).map(x => item(
        () => { if (x.tipo === 'prazo') location.hash = '#/prazo/' + x.id; else location.hash = '#/tarefas?quem=eu'; },
        x.vence_em ? selo(x.vence_em, x.atrasada ? 'faixa-vencido' : x.vence_em === hoje ? 'faixa-hoje' : '') : h('div', { class: 'selo-data' }, h('b', {}, '—'), h('span', {}, 'sem data')),
        h('span', {}, x.titulo, x.prioridade && PRI[x.prioridade] ? h('span', { class: 'tag mini-tag pri-' + x.prioridade }, PRI[x.prioridade]) : null),
        [x.tipo === 'prazo' ? 'prazo' : x.inicial ? 'petição inicial' : 'tarefa', x.cliente, x.numero].filter(Boolean).join(' · '),
        botaoConferido(x.tipo === 'prazo' ? 'prazo' : 'tarefa', x.id, 'Quem fez?', null, '✓'))))
        : vazio('Nada com você agora. 🎉'),
      meu.esperando ? h('p', { class: 'ini-aviso ok' }, `${meu.esperando} item(ns) que você conferiu esperam o OK da administração.`) : null) : null;
    const blocoMinhaSemana = meu ? (() => {
      const cats = meu.categorias.filter(c => meu.semana.grupos[c.id]);
      const el = bloco('O que eu fiz nesta semana', null, null,
        h('div', {},
          h('div', { class: 'minha-semana-topo' }, h('b', {}, String(meu.semana.total)), h('span', {}, meu.semana.total === 1 ? 'ação registrada' : 'ações registradas'),
            meu.semana.posicao ? h('span', { class: 'tag mini-tag ok' }, `${meu.semana.posicao}º da equipe`) : null),
          cats.length ? h('div', { class: 'eq-tiles mini' }, cats.map(c => h('div', { class: 'eq-tile', 'data-cor': corCat(c.id) }, h('span', { class: 'eq-tile-ico' }, icoCat(c.id)), h('b', {}, String(meu.semana.grupos[c.id])), h('span', {}, c.nome))))
            : vazio('Ainda nada nesta semana. Use "✓ Conferido" quando terminar algo: conta aqui e no relatório.'),
          meu.semana.itens.length ? h('ul', { class: 'minha-linha' }, meu.semana.itens.slice(0, 6).map(x => h('li', {},
            h('span', { class: 'eq-ponto', 'data-cor': corCat(x.cat) }), h('time', {}, new Date(x.quando).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })), ' ', x.texto || x.acao))) : null));
      el.querySelectorAll('[data-cor]').forEach(x => x.style.setProperty('--c', x.dataset.cor));
      return el;
    })() : null;
    const admin = !!pode.usuarios;
    const robo = r.robo || {};
    const ext = extras || { audiencias: [], aniversarios: [], cobrancas: [] };

    // ----- audiências e perícias: HOJE (lembrete do dia) e próximos 7 dias (aviso de 1 semana), com WhatsApp pronto -----
    const NOME_A = { conciliacao: 'Conciliação', instrucao: 'Instrução', pericia: 'Perícia' };
    const audHoje = ext.audiencias.filter(a => a.data === hoje), audSemana = ext.audiencias.filter(a => a.data > hoje);
    const linhaAud = (a, dia) => item(() => { location.hash = '#/audiencias'; },
        selo(a.data, dia ? 'faixa-hoje' : ''), `${NOME_A[a.tipo] || a.nome}${a.hora ? ' · ' + a.hora : ''} — ${a.cliente || a.titulo || 'cliente a identificar'}`,
        [a.numero, a.local, a.tipo === 'instrucao' ? (a.testemunhas && a.testemunhas.length ? a.testemunhas.length + ' testemunha(s)' : '⚠ testemunhas não anotadas') : ''].filter(Boolean).join(' · '),
        h('div', { onclick: ev => ev.stopPropagation() }, a.avisos ? chipsAvisosAto(a) : null));
    const blocoAudHoje = bloco('⚖ Audiências e perícias de HOJE', '#/audiencias', 'todas as audiências',
      audHoje.length ? h('ul', { class: 'ini-lista' }, audHoje.map(a => linhaAud(a, true))) : vazio('Nenhuma audiência ou perícia hoje.'));
    const blocoAudiencias = bloco('📅 Próximos 7 dias — avisar o cliente (1 semana, véspera e no dia)', '#/audiencias', 'audiências',
      audSemana.length ? h('ul', { class: 'ini-lista' }, audSemana.slice(0, 12).map(a => linhaAud(a, false))) : vazio('Nenhuma audiência ou perícia nos próximos 7 dias.'));

    // ----- aniversariantes de hoje -----
    const parabens = c => { let tel = telefoneWhats(c.telefone || ''); if (!tel) return null; if (tel.length <= 11) tel = '55' + tel;
      return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(`Olá, ${nomeProprioJS(String(c.nome).split(' ')[0])}! Aqui é do escritório Araújo Advocacia. Hoje é o seu dia e não podíamos deixar passar: feliz aniversário! Desejamos muita saúde, paz e conquistas. Conte sempre com a gente. 🎉`); };
    const blocoAniversarios = bloco('🎂 Aniversariantes de hoje', null, null,
      ext.aniversarios.length ? h('ul', { class: 'ini-lista' }, ext.aniversarios.map(c => item(() => { location.hash = '#/cliente/' + c.id; },
        h('div', { class: 'selo-data niver' }, h('b', {}, '🎉')), c.nome, c.idade ? c.idade + ' anos' : '',
        parabens(c) ? botaoAvisar(parabens(c), 'Parabéns', c.avisado_em ? { em: c.avisado_em, por: c.avisado_por } : null, () => registrarWhats({ cliente: c.nome }, 'aniversário', c.chave)) : h('span', { class: 'peq' }, 'sem telefone'))))
        : vazio('Ninguém faz aniversário hoje.'));

    // ----- cobranças do dia (parcelas que vencem hoje e atrasadas) -----
    const cobrar = x => { let tel = telefoneWhats(x.telefone || ''); if (!tel) return null; if (tel.length <= 11) tel = '55' + tel;
      const nome = nomeProprioJS(String(x.cliente).split(' ')[0]), parc = x.numero ? `a ${x.numero}ª parcela` : 'uma parcela';
      const valor = x.valor !== null && x.valor !== undefined ? `, no valor de ${reais(+x.valor)},` : '';
      const msg = x.dias === 0 ? `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Passando para lembrar que ${parc} dos honorários${valor} vence hoje. O pagamento pode ser feito por PIX. Se já pagou, desconsidere. Obrigado!`
        : `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Consta em aberto ${parc} dos honorários${valor} vencida em ${dataBR(x.vencimento)}. Pedimos, por gentileza, que regularize o pagamento por PIX ou entre em contato para combinarmos. Se já pagou, por favor nos envie o comprovante. Obrigado!`;
      return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg); };
    const linhaCob = x => item(() => { if (x.cliente_id) location.hash = '#/cliente/' + x.cliente_id; },
        h('div', { class: 'selo-data ' + (x.dias === 0 ? 'faixa-hoje' : 'faixa-vencido') }, h('b', {}, x.dias === 0 ? 'hoje' : String(x.dias)), h('span', {}, x.dias === 0 ? '' : 'dias')),
        x.cliente, [x.numero ? x.numero + 'ª parcela' : 'parcela', 'venc. ' + dataBR(x.vencimento), x.valor !== null && x.valor !== undefined ? reais(+x.valor) : ''].filter(Boolean).join(' · '),
        cobrar(x) ? botaoAvisar(cobrar(x), x.dias === 0 ? 'Lembrar' : 'Cobrar', x.avisado_em ? { em: x.avisado_em, por: x.avisado_por } : null, () => registrarWhats({ cliente: x.cliente }, 'cobrança', x.chave)) : h('span', { class: 'peq' }, 'sem telefone'));
    const cobHoje = ext.cobrancas.filter(x => x.dias === 0), naoPagos = ext.cobrancas.filter(x => x.dias > 0);
    const blocoCobHoje = bloco('💬 Vencem hoje — lembrar', pode.financeiro ? '#/financeiro' : null, 'financeiro',
      cobHoje.length ? h('ul', { class: 'ini-lista' }, cobHoje.map(linhaCob)) : vazio('Nenhuma parcela vence hoje.'));
    const blocoNaoPagos = bloco('⚠ Não pagos — cobrar', pode.financeiro ? '#/financeiro?ver=atraso' : null, 'em atraso',
      naoPagos.length ? h('ul', { class: 'ini-lista' }, naoPagos.slice(0, 10).map(linhaCob), naoPagos.length > 10 ? h('li', { class: 'peq ini-mais' }, `+ ${naoPagos.length - 10} parcela(s) em atraso`) : null)
        : vazio('Nenhuma parcela em atraso. 👏'));
    const blocoCobrancas = bloco('💬 Cobranças do dia', pode.financeiro ? '#/financeiro/receber' : null, 'a receber',
      ext.cobrancas.length ? h('ul', { class: 'ini-lista' }, ext.cobrancas.slice(0, 8).map(x => item(() => {},
        h('div', { class: 'selo-data ' + (x.dias === 0 ? 'faixa-hoje' : 'faixa-vencido') }, h('b', {}, x.dias === 0 ? 'hoje' : String(x.dias)), h('span', {}, x.dias === 0 ? '' : 'dias')),
        x.cliente, [x.numero ? x.numero + 'ª parcela' : 'parcela', 'venc. ' + dataBR(x.vencimento), x.valor !== null && x.valor !== undefined ? reais(+x.valor) : ''].filter(Boolean).join(' · '),
        cobrar(x) ? botaoAvisar(cobrar(x), x.dias === 0 ? 'Lembrar' : 'Cobrar', x.avisado_em ? { em: x.avisado_em, por: x.avisado_por } : null, () => registrarWhats({ cliente: x.cliente }, 'cobrança', x.chave)) : h('span', { class: 'peq' }, 'sem telefone'))),
        ext.cobrancas.length > 8 ? h('li', { class: 'peq ini-mais' }, `+ ${ext.cobrancas.length - 8} parcela(s) em aberto`) : null)
        : vazio('Nenhuma parcela vencendo hoje ou em atraso. 👏'));

    const naoAvisadas = ext.audiencias.filter(a => a.devido).length; // 8.21: aviso na hora (semana, véspera ou dia) que ninguém mandou
    const vencemHoje = ext.cobrancas.filter(x => x.dias === 0).length;
    const frase = secretaria
      ? [`${audHoje.length} audiência(s)/perícia(s) hoje`, `${audSemana.length} nos próximos 7 dias`, naoAvisadas ? `${naoAvisadas} para avisar` : 'todos avisados', `${ext.cobrancas.length} cobrança(s)`, ext.aniversarios.length ? `${ext.aniversarios.length} aniversariante(s) 🎂` : ''].filter(Boolean).join(' · ')
      : admin
        ? [pz.vencidos ? `${pz.vencidos} prazo(s) vencido(s)` : 'nenhum prazo vencido', fataisHoje.length ? `${fataisHoje.length} fatal(is) hoje` : 'nenhum fatal hoje', `${ext.audiencias.length} audiência(s) na semana`].join(' · ')
        : [nTar ? `${nTar} tarefa${nTar > 1 ? 's' : ''} com você` : 'nada pendente com você', meu && meu.atrasadas ? `${meu.atrasadas} atrasada(s)` : '', nHoje ? `${nHoje} compromisso(s) hoje` : 'agenda livre'].filter(Boolean).join(' · ');

    const hero = h('section', { class: 'ini-hero simples' },
      h('div', { class: 'ini-hero-txt' },
        h('p', { class: 'cap' }, hojeExtenso().replace(/^./, c => c.toUpperCase())),
        h('h1', {}, `${saudacao()}, ${primeiroNome(r.usuario.nome)}`),
        h('p', { class: 'ini-frase' }, frase)),
      h('div', { class: 'ini-hero-acoes' },
        admin && pz.vencidos ? h('a', { class: 'ini-hero-alerta', href: '#/prazos?ver=vencido' }, `${pz.vencidos} prazo(s) vencido(s) — ver`) : null,
        admin && aguarda && aguarda.length ? h('a', { class: 'ini-hero-alerta ok', href: '#/prazos' }, `✓ ${aguarda.length} esperando o seu OK`) : null,
        h('a', { class: 'btn dourado', href: '#/cliente/novo' }, '+ Novo cliente'),
        secretaria ? h('a', { class: 'btn contorno-claro', href: '#/compromisso' }, 'Novo compromisso') : h('a', { class: 'btn contorno-claro', href: '#/prazo/novo' }, 'Novo prazo')));
    const pill = h('p', { class: 'ini-robo ' + (robo.atrasado ? 'parado' : 'ligado') }, h('span', { class: 'ponto' }), linhaRobo(r.robo));

    const acoes = blocoAcoesAgora(admin, secretaria);
    const agMini = blocoAgendaMini();
    if (secretaria) {
      mostrar(hero, agMini, acoes,
        h('nav', { class: 'atalhos ini-numeros', 'aria-label': 'Resumo' },
          atalho('#/audiencias', 'Audiências hoje', audHoje.length, audHoje.length ? 'lembrar o cliente hoje' : 'nenhuma hoje', audHoje.some(a => a.devido === 'dia') ? 'alerta' : ''),
          atalho('#/audiencias?ver=avisar', 'Para avisar', naoAvisadas, naoAvisadas ? 'clientes sem aviso' : 'todos avisados 👏', naoAvisadas ? 'atencao' : ''),
          atalho('#/', 'Cobranças', ext.cobrancas.length, `${vencemHoje} vencem hoje · ${naoPagos.length} em atraso`, naoPagos.length ? 'alerta' : ''),
          atalho('#/clientes', 'Aniversários', ext.aniversarios.length, 'hoje')),
        extras ? null : h('p', { class: 'nota' }, 'O Google está demorando para responder: os blocos abaixo aparecem sozinhos assim que chegarem.'),
        h('div', { class: 'ini-duas' }, blocoAudHoje, blocoAudiencias),
        h('div', { class: 'ini-duas' }, blocoCobHoje, blocoNaoPagos),
        h('div', { class: 'ini-duas' }, blocoAniversarios, blocoMinhas || blocoAgenda),
        pill);
      return;
    }
    if (!admin) {
      mostrar(hero, agMini, acoes,
        h('nav', { class: 'atalhos ini-numeros', 'aria-label': 'Meu resumo' },
          atalho('#/tarefas', 'Minhas tarefas', meu ? meu.abertas : 0, meu && meu.hoje ? `${meu.hoje} para hoje` : 'tarefas e prazos'),
          atalho('#/tarefas', 'Atrasadas', meu ? meu.atrasadas : 0, meu && meu.atrasadas ? 'resolva primeiro' : 'nenhuma 👏', meu && meu.atrasadas ? 'alerta' : ''),
          atalho('#/prazos', 'Prazos', pz.abertos || 0, pz.vencendo ? `${pz.vencendo} vencem em 5 dias` : 'em aberto no escritório', pz.vencidos ? 'atencao' : ''),
          atalho('#/processos', 'Processos', t.processos, `${t.clientes} clientes`)),
        h('div', { class: 'ini-duas' }, blocoMinhas, blocoAgenda),
        pill);
      return;
    }
    // administração: o essencial
    mostrar(hero, agMini, acoes,
      h('nav', { class: 'atalhos ini-numeros', 'aria-label': 'Resumo' },
        atalho('#/prazos', 'Prazos', pz.vencidos || pz.vencendo, pz.vencidos ? 'vencido(s) sem baixa' : 'vencem em até 5 dias', pz.vencidos ? 'alerta' : pz.vencendo ? 'atencao' : ''),
        atalho('#/prazos', 'Seu OK', aguarda ? aguarda.length : 0, 'esperando aprovação', aguarda && aguarda.length ? 'atencao' : ''),
        atalho('#/agenda?visao=dia', 'Hoje', nHoje, nHoje === 1 ? 'compromisso' : 'compromissos'),
        atalho('#/processos', 'Processos', t.processos, `${t.clientes} clientes`)),
      h('div', { class: 'ini-duas' }, blocoPrazos, audHoje.length ? h('div', {}, blocoAudHoje, blocoAudiencias) : blocoAudiencias),
      ext.aniversarios.length || ext.cobrancas.length ? h('div', { class: 'ini-duas' }, blocoCobrancas, blocoAniversarios) : null,
      pill);
  }

  /** 8.25 (pedido da usuária): agenda PEQUENA no Início, em tabela (hoje · amanhã · 7 dias), que dá para minimizar (lembra a escolha). */
  function blocoAgendaMini() {
    let aberta = true; try { aberta = localStorage.getItem('inicio_agenda') !== 'fechada'; } catch (e) { /* ok */ }
    const resumo = h('span', { class: 'agm-resumo' }, 'carregando…');
    const corpo = h('div', { class: 'agm-corpo' }, h('p', { class: 'peq' }, 'Carregando a agenda…'));
    const det = h('details', { class: 'agm', open: aberta }, h('summary', {}, h('span', { class: 'agm-tit' }, '📅 Agenda'), resumo, h('a', { class: 'agm-link', href: '#/agenda', onclick: e => e.stopPropagation() }, 'abrir a agenda')), corpo);
    det.addEventListener('toggle', () => { try { localStorage.setItem('inicio_agenda', det.open ? 'aberta' : 'fechada'); } catch (e) { /* ok */ } });
    const hoje = hojeISO(), fim = isoSoma(hoje, 6), amanha = isoSoma(hoje, 1);
    api('agenda.listar', { inicio: hoje, fim }).then(dados => {
      const linhas = [];
      for (let d = hoje; d <= fim; d = isoSoma(d, 1)) itensDoDia({ eventos: dados.eventos || [], prazos: [] }, d).forEach(it => linhas.push({ d, it }));
      const nHoje = linhas.filter(x => x.d === hoje).length, nAm = linhas.filter(x => x.d === amanha).length;
      resumo.textContent = `hoje ${nHoje} · amanhã ${nAm} · 7 dias ${linhas.length}`;
      const quando = d => d === hoje ? 'Hoje' : d === amanha ? 'Amanhã' : nomeDia(d);
      corpo.replaceChildren(linhas.length ? h('div', { class: 'rolar' }, h('table', { class: 'agm-tab' },
        h('thead', {}, h('tr', {}, ['Quando', 'Hora', 'O quê', 'Agenda'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, linhas.slice(0, 12).map(({ d, it }) => h('tr', { class: d === hoje ? 'hoje' : '', tabindex: 0, onclick: () => detalheEvento({ ...it, quando: dataBR(d) + ' · ' + it.hora }) },
          h('td', {}, quando(d), h('small', {}, dataBR(d).slice(0, 5))), h('td', { class: 'num' }, it.hora),
          h('td', {}, h('span', { class: 'bolinha ' + it.cls }), it.titulo, it.local ? h('small', {}, it.local) : null), h('td', { class: 'peq' }, it.rotulo))))),
        linhas.length > 12 ? h('a', { class: 'peq', href: '#/agenda' }, `+ ${linhas.length - 12} na agenda`) : null)
        : h('p', { class: 'peq' }, 'Nada marcado nos próximos 7 dias.'));
    }).catch(() => { resumo.textContent = ''; corpo.replaceChildren(h('p', { class: 'peq' }, 'A agenda não respondeu agora. ', h('a', { href: '#/agenda' }, 'Abrir a agenda'))); });
    return det;
  }

  /** 8.10: "Precisa de ação agora" — fila curta no topo do Início: divergência de prazo, provisório vencendo, prazo sem ninguém,
      audiência sem horário ou sem aviso ao cliente. Cada linha diz quem cuida e a próxima ação. Carrega sozinho (não segura o Início). */
  function blocoAcoesAgora(admin, secretaria) {
    const caixa = h('section', { class: 'acoes-agora', hidden: true });
    const eu = sessao.usuario.usuario;
    const NIV = { risco: 'Prazo em risco', conferir: 'Conferir no tribunal', aviso: 'Avisar / organizar' };
    api('inicio.acoes', {}).then(r => {
      let itens = r.itens || [];
      if (!admin) itens = itens.filter(x => x.quem_us === eu || (x.tipo === 'semresp') || (secretaria && (x.tipo === 'aviso' || x.tipo === 'semhora' || x.tipo === 'testemunhas')));
      const nIntim = admin ? r.intimSemResp : 0;
      if (!itens.length && !nIntim) return;
      const linha = x => h('li', { class: 'acao-' + x.nivel, tabindex: 0, onclick: () => { location.hash = x.link; }, onkeydown: e => { if (e.key === 'Enter') location.hash = x.link; } },
        h('span', { class: 'acao-nivel' }, x.tipo === 'aviso' && x.nivel === 'risco' ? 'Audiência — avisar já' : x.tipo === 'testemunhas' ? 'Testemunhas' : (NIV[x.nivel] || '')),
        h('div', { class: 'acao-txt' }, h('b', {}, x.titulo), h('div', { class: 'peq' }, x.sub)),
        h('div', { class: 'acao-prox' }, h('span', { class: 'peq' }, 'Próxima ação'), h('div', {}, x.acao)),
        h('div', { class: 'acao-quem' }, h('span', { class: 'peq' }, 'Quem cuida'), h('div', {}, x.quem || h('em', {}, 'ninguém ainda'))));
      caixa.replaceChildren(
        h('div', { class: 'bloco-cab' }, h('h2', {}, `Precisa de ação agora (${r.total + (nIntim ? 1 : 0)})`), h('a', { href: '#/prazos?fila=conferir' }, 'fila de conferência')),
        h('ul', { class: 'acoes-lista' }, itens.slice(0, 8).map(linha),
          nIntim ? h('li', { class: 'acao-aviso', tabindex: 0, onclick: () => { location.hash = '#/prazos'; } },
            h('span', { class: 'acao-nivel' }, 'Intimações'),
            h('div', { class: 'acao-txt' }, h('b', {}, `${nIntim} intimação(ões) a fazer sem responsável`), h('div', { class: 'peq' }, `${r.intimSemRespRecentes} delas chegaram nos últimos 30 dias`)),
            h('div', { class: 'acao-prox' }, h('span', { class: 'peq' }, 'Próxima ação'), h('div', {}, 'Distribuir com "Eu faço" / "Passar para", ou "Conferido" nas que já foram resolvidas')),
            h('div', { class: 'acao-quem' }, h('span', { class: 'peq' }, 'Quem cuida'), h('div', {}, 'administração'))) : null),
        itens.length > 8 ? h('p', { class: 'peq' }, `+ ${itens.length - 8} na fila. Veja em Intimações e prazos › Conferir no tribunal.`) : null);
      caixa.hidden = false;
    }).catch(() => { /* Code.gs antigo: o Início segue sem o bloco */ });
    return caixa;
  }

  /* ---------- Assinatura de procuração/contrato (8.4.1): só depois de "✓ Assinado" o caso vai para Petição inicial ---------- */
  function cartaoAssinatura(a, depois) {
    const quando = a.gerado_em ? dataBR(a.gerado_em.slice(0, 10)) : '';
    const el = h('div', { class: 'assin-card' + (a.dias >= 7 ? ' atrasada' : '') },
      h('div', { class: 'assin-txt' }, h('strong', {}, a.cliente), h('div', { class: 'peq' }, a.documentos + (a.tipo_acao ? ' · ' + a.tipo_acao : '')),
        a.honorario ? h('div', { class: 'peq' }, '💰 ' + a.honorario + ' — entra no Financeiro ao assinar') : null,
        h('div', { class: 'peq' }, `gerado em ${quando}` + (a.dias ? ` · há ${a.dias} dia(s)` : ' · hoje') + (a.dias >= 7 ? ' · ⚠ lembrar o cliente' : ''))),
      h('div', { class: 'assin-acoes' },
        botao('✓ Assinado', async ev => {
          ev.target.disabled = true;
          try { const x = await api('documentos.assinatura', { id: a.id, acao: 'assinado' }); avisar(`${a.cliente}: assinado. O caso foi para Processos › Petição inicial.` + (x.lancados ? ` ${x.lancados} honorário(s) lançado(s) no Financeiro.` : ''));
            el.replaceChildren(h('span', {}, '✓ Assinado — ', h('a', { href: '#/processo/' + x.processo_id + '?avisar=1' }, 'abrir a petição inicial e avisar o cliente'))); if (depois) depois(); }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; }
        }, 'mini'),
        botao('Não vai assinar', async ev => {
          ev.stopPropagation();
          if (!confirm(`${a.cliente} não vai assinar? O registro sai da lista (os arquivos continuam na pasta).`)) return;
          ev.target.disabled = true;
          try { await api('documentos.assinatura', { id: a.id, acao: 'desistiu' }); el.replaceChildren(h('span', { class: 'peq' }, 'Marcado: não vai assinar.')); avisar(`${a.cliente}: não vai assinar. Saiu da lista de aguardando.`); if (depois) depois(); else setTimeout(rota, 400); }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; }
        }, 'mini sec')));
    return el;
  }
  function blocoAssinaturas(lista, titulo) {
    if (!lista || !lista.length) return null;
    return h('section', { class: 'caixa assin-bloco' }, h('h2', {}, titulo || `✍ Aguardando assinatura (${lista.length})`),
      h('p', { class: 'peq' }, 'Procurações e contratos gerados que o cliente ainda não assinou. Quando assinar, aperte "✓ Assinado": o caso vai para Processos › Petição inicial. Sem assinatura em 7 dias, o robô cria um lembrete.'),
      h('div', { class: 'assin-lista' }, lista.map(a => cartaoAssinatura(a))));
  }

  function saudacao() { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; }
  function primeiroNome(n) { return String(n || '').split(' ')[0]; }
  function hojeExtenso() {
    return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function tabela(cabecalho, itens, linha, clique, vazio, classe) {
    const corpo = itens.length
      ? itens.map(it => h('tr', { tabindex: 0, class: classe ? classe(it) : null, onclick: () => clique(it), onkeydown: e => { if (e.key === 'Enter') clique(it); } }, linha(it)))
      : [h('tr', {}, h('td', { class: 'vazio', colspan: cabecalho.length }, vazio))];
    return h('table', { class: 'tabela' }, h('thead', {}, h('tr', {}, cabecalho.map(c => h('th', { scope: 'col' }, c)))), h('tbody', {}, corpo));
  }

  /* ---------- clientes ---------- */

  /** Quadro largo (colunas de etapas): setas ◀ ▶ para andar para o lado, sem precisar da barra de rolagem. */
  function comSetas(quadro) {
    const passo = dir => () => quadro.scrollBy({ left: dir * Math.max(240, quadro.clientWidth * 0.8), behavior: 'smooth' });
    const esq = h('button', { type: 'button', class: 'seta-quadro esq', 'aria-label': 'Ver etapas anteriores', onclick: passo(-1) }, '‹');
    const dir = h('button', { type: 'button', class: 'seta-quadro dir', 'aria-label': 'Ver próximas etapas', onclick: passo(1) }, '›');
    const atualizar = () => { esq.hidden = quadro.scrollLeft <= 4; dir.hidden = quadro.scrollLeft + quadro.clientWidth >= quadro.scrollWidth - 4; };
    quadro.addEventListener('scroll', atualizar, { passive: true });
    setTimeout(atualizar, 50); window.addEventListener('resize', atualizar);
    return h('div', { class: 'quadro-com-setas' }, esq, quadro, dir);
  }

  /* ---------- Clientes e processos (uma aba, duas visões) ---------- */

  const semAcentoG = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /** 8.10 (pedido da usuária): "toni" acha TONI e TONINHO, mas não ANTÔNIO nem quem só tem essas letras no meio.
      Cada palavra digitada precisa ser o COMEÇO de uma palavra do texto. Com números, compara os dígitos (CPF, telefone, nº do processo). */
  const palavrasComecam = (texto, busca) => {
    const ws = semAcentoG(busca).split(/[^a-z0-9]+/).filter(Boolean);
    if (!ws.length) return true;
    const ps = semAcentoG(texto).split(/[^a-z0-9]+/).filter(Boolean);
    return ws.every(w => ps.some(p => p.startsWith(w)));
  };
  const bateBusca = (texto, busca) => {
    const qd = String(busca || '').replace(/\D/g, '');
    if (qd.length >= 3 && /^[\d\s.\-/()]+$/.test(String(busca).trim())) return String(texto || '').replace(/\D/g, '').includes(qd);
    return palavrasComecam(texto, busca);
  };
  // caixas com lista (datalist): o navegador mostraria tudo que CONTÉM as letras; aqui a lista vira só quem começa com a palavra digitada
  const LISTAS_ORIG = new WeakMap();
  document.addEventListener('input', ev => {
    const inp = ev.target; const dl = inp && inp.list; if (!dl || inp.tagName !== 'INPUT') return;
    if (!LISTAS_ORIG.has(dl)) LISTAS_ORIG.set(dl, [...dl.options].map(o => [o.value, o.textContent]));
    const todas = LISTAS_ORIG.get(dl), q = inp.value.trim();
    const ok = q ? todas.filter(([v, t]) => v === inp.value || bateBusca(v + ' ' + (t || ''), q)).slice(0, 40) : todas.slice(0, 200);
    dl.replaceChildren(...ok.map(([v, t]) => { const o = document.createElement('option'); o.value = v; if (t) o.textContent = t; return o; }));
  }, true);
  function lembrarVisao(v) { try { localStorage.setItem('carteira_visao', v); } catch (e) { /* ok */ } }

  /** Cabeçalho comum: título, números, troca de visão (por cliente / por processo), botões e a busca única. */
  function cabCarteira(visao, o) {
    const ir = v => { lembrarVisao(v); location.hash = '#/' + v + (o.busca ? '?busca=' + encodeURIComponent(o.busca) : ''); };
    const form = h('form', { class: 'busca-grande', role: 'search' },
      h('span', { class: 'busca-ico', 'aria-hidden': 'true' }, '⌕'),
      h('input', { type: 'search', name: 'busca', value: o.busca || '', placeholder: visao === 'clientes' ? 'Buscar cliente por nome, CPF, telefone ou nº do processo' : 'Buscar processo por número, cliente, parte contrária ou vara', 'aria-label': visao === 'clientes' ? 'Buscar clientes' : 'Buscar processos' }),
      h('button', { type: 'submit', class: 'btn' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); o.ir({ busca: form.busca.value.trim() }); });
    void ir;
    return [
      h('header', { class: 'carteira-topo' },
        h('div', { class: 'carteira-tit' },
          h('span', { class: 'carteira-kicker' }, visao === 'clientes' ? 'Carteira do escritório' : 'Processos e prazos'),
          h('h1', {}, visao === 'clientes' ? 'Clientes' : 'Processos'),
          h('p', {}, `${o.nCli} cliente${o.nCli === 1 ? '' : 's'} · ${o.nProc} processo${o.nProc === 1 ? '' : 's'}${o.nAjuizar ? ` · ${o.nAjuizar} petição(ões) inicial(is) a fazer` : ''}`)),
        h('div', { class: 'carteira-acoes' },
          visao === 'clientes' ? h('button', { type: 'button', class: 'btn dourado', onclick: () => { location.hash = '#/cliente/novo'; } }, '+ Novo cliente') : null,
          h('button', { type: 'button', class: visao === 'clientes' ? 'btn sec' : 'btn dourado', onclick: () => { location.hash = '#/processo/novo'; } }, '+ Novo processo'),
          h('button', { type: 'button', class: 'btn sec', title: 'Processos sem cliente e cadastros para completar', onclick: () => { location.hash = '#/organizar'; } }, '🔧 Organizar cadastros'))),
      h('section', { class: 'painel-busca carteira-busca' },
        form, o.filtros || null),
      faixaAssinaturas()
    ];
  }
  /** 8.6.0 (pedido da usuária): as observações do cliente aparecem onde se olha o cliente (processo, prazo, tarefa). */
  /** 8.13.1: anotação com várias linhas (ex.: transcrição de audiência/atendimento, separadas por " ⏎ "): 1ª linha à vista, o resto em "ver tudo". */
  function corpoNota(corpo) {
    const partes = String(corpo || '').split(/\s*⏎\s*/).filter((x, i) => x || i === 0);
    if (partes.length < 2) return corpo;
    return [h('div', { class: 'nota-l1' }, partes[0]), h('details', { class: 'nota-mais' }, h('summary', {}, /transcri/i.test(corpo) ? 'ver o resumo e a transcrição' : 'ver tudo'),
      partes.slice(1).map(p => h('div', { class: /^Transcrição:/.test(p) ? 'nota-rot' : '' }, p)))];
  }
  function notasDoCliente(clienteId) {
    const el = h('div');
    if (!clienteId) return el;
    api('clientes.obter', { id: clienteId }).then(r => {
      const obs = String((r && r.cliente && r.cliente.observacoes) || '').split('\n').filter(Boolean);
      if (!obs.length) return;
      el.replaceChildren(h('section', { class: 'caixa notas-cli' },
        h('div', { class: 'bloco-cab' }, h('h2', {}, '📝 Observações do cliente — ' + r.cliente.nome), h('a', { href: '#/cliente/' + clienteId }, 'abrir ficha')),
        h('ul', {}, obs.slice(0, 4).map(o => { const m = /^\[([^\]]+)\]\s*(.*)$/.exec(o); const t = (m ? m[2] : o).split(/\s*⏎\s*/)[0]; return h('li', {}, m ? [h('span', { class: 'peq' }, m[1] + ' '), t] : t); })),
        obs.length > 4 ? h('a', { class: 'peq', href: '#/cliente/' + clienteId }, `+ ${obs.length - 4} anotação(ões) na ficha`) : null));
    }).catch(() => {});
    return el;
  }
  /** Faixa em Clientes e Processos: procurações/contratos gerados que o cliente ainda não assinou. */
  function faixaAssinaturas() {
    const el = h('div');
    api('documentos.assinaturas', {}).then(l => {
      if (!l || !l.length) return;
      const velhas = l.filter(a => a.dias >= 7).length;
      el.replaceChildren(h('a', { class: 'faixa-assin' + (velhas ? ' atrasada' : ''), href: '#/clientes?grupo=assinatura' },
        h('strong', {}, `✍ ${l.length} cliente(s) com procuração/contrato aguardando assinatura`),
        h('span', {}, velhas ? ` · ${velhas} há mais de 7 dias — lembrar o cliente` : ' · ver e marcar "✓ Assinado"')));
    }).catch(() => {});
    return el;
  }

  /** 8.15: etapa de cada cliente (calculada no servidor: funil, assinatura e processos; muda sozinha). */
  const JORNADA = [['contato', 'Em conversa', '#5b6ee1'], ['cadastro', 'Cadastro enviado', '#7a4fc0'], ['cliente', 'Cadastro preenchido', '#a04fb0'],
    ['atendido', 'Consulta feita', '#1d8a8a'], ['proposta', 'Procuração e contrato enviados', '#c98a12'], ['inicial', 'Em atendimento · petição inicial', '#1f8a4c'],
    ['andamento', 'Em atendimento · processo em andamento', '#17693a'], ['encerrado', 'Caso encerrado', '#6f6f76'], ['perdido', 'Não fechou', '#9aa0aa'], ['sem', 'Sem caso aberto', '#b9b4aa']];
  const NOME_JORNADA = Object.fromEntries(JORNADA.map(j => [j[0], j[1]])), COR_JORNADA = Object.fromEntries(JORNADA.map(j => [j[0], j[2]]));
  function seloJornada(j, mini) {
    if (!j) return null;
    const el = h('span', { class: 'selo-jornada' + (mini ? ' mini' : ''), title: 'Etapa do cliente (muda sozinha)' }, NOME_JORNADA[j] || j);
    el.style.setProperty('--cor', COR_JORNADA[j] || '#888'); return el;
  }
  async function telaClientes(params) {
    carregando();
    const busca = params.get('busca') || '';
    const soConferir = params.get('conferir') === '1';
    const area = params.get('area') || '';
    const grupo = ['assinatura'].includes(params.get('grupo')) ? params.get('grupo') : '';
    const etapa = NOME_JORNADA[params.get('etapa')] ? params.get('etapa') : '';
    const limite = Math.max(100, parseInt(params.get('mais'), 10) || 100);
    lembrarVisao('clientes');
    const [todos, procs, assins] = await Promise.all([api('clientes.listar', {}), api('processos.listar', {}).catch(() => []), api('documentos.assinaturas', {}).catch(() => [])]);
    const aguarda = {}; (assins || []).forEach(a => { aguarda[a.cliente_id] = a; });
    const porCli = {};
    procs.forEach(p => { if (p.cliente_id) (porCli[p.cliente_id] = porCli[p.cliente_id] || []).push(p); });
    // busca única: dados do cliente ou de qualquer processo dele
    const q = semAcentoG(busca.trim()), qd = busca.replace(/\D/g, '');
    // 8.10: primeiro pelo NOME (cada palavra digitada = começo de uma palavra do nome); só se nenhum nome bater, procura em
    // cidade, área, parte contrária, vara e nº do processo — assim "toni" não traz gente que nada tem a ver com o nome
    const soDigitos = qd.length >= 3 && /^[\d\s.\-/()]+$/.test(busca.trim());
    const procBate = p => q && (soDigitos ? String(p.numero || '').replace(/\D/g, '').includes(qd) : palavrasComecam([p.parte_contraria, p.orgao, p.tribunal].join(' '), busca));
    const porNome = q && !soDigitos ? todos.filter(c => palavrasComecam(c.nome, busca)) : [];
    const cliBate = c => !q || (soDigitos
      ? (String(c.cpf_cnpj || '').replace(/\D/g, '').includes(qd) || String(c.telefone || '').replace(/\D/g, '').includes(qd) || (porCli[c.id] || []).some(procBate))
      : palavrasComecam([c.nome, c.cidade, c.area, c.tipo_acao].join(' '), busca) || (porCli[c.id] || []).some(procBate));
    let base = porNome.length ? porNome : todos.filter(cliBate);
    if (soConferir) base = base.filter(c => c.situacao !== 'completo');
    if (area) base = base.filter(c => (c.area || 'Sem área') === area);
    const temAcao = c => (porCli[c.id] || []).length > 0 || c.processos > 0;
    const contaEtapa = {}; base.forEach(c => { contaEtapa[c.jornada || 'sem'] = (contaEtapa[c.jornada || 'sem'] || 0) + 1; });
    const lista = (grupo === 'assinatura' ? base.filter(c => aguarda[c.id]) : base).filter(c => !etapa || (c.jornada || 'sem') === etapa);
    const nAssin = base.filter(c => aguarda[c.id]).length;
    const areas = [...new Set(todos.map(c => c.area || 'Sem área'))].sort();
    const aConferir = todos.filter(c => c.situacao !== 'completo').length;
    const ir = (mud) => {
      const qs = new URLSearchParams({ busca, area, grupo, etapa, conferir: soConferir ? '1' : '', mais: '', ...mud });
      [...qs.keys()].forEach(k => { if (!qs.get(k)) qs.delete(k); });
      location.hash = '#/clientes' + (qs.toString() ? '?' + qs : '');
    };
    const filtros = h('div', { class: 'filtros-linha' },
      h('label', { class: 'filtro-sel' }, 'Área', h('select', { onchange: e => ir({ area: e.target.value }) },
        h('option', { value: '' }, `Todas (${todos.length})`), areas.map(a => h('option', { value: a, selected: area === a }, a)))),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: soConferir, onchange: e => ir({ conferir: e.target.checked ? '1' : '' }) }), `Só cadastros a completar (${aConferir})`),
      (busca || area || soConferir || grupo || etapa) ? h('button', { type: 'button', class: 'link escuro', onclick: () => { location.hash = '#/clientes'; } }, 'Limpar filtros') : null);

    const ORD = { contratado: 0, ajuizado: 1, andamento: 2, sentenca: 3, acordo: 3, homologacao: 3, recurso: 4, execucao: 5, extinto: 9 };
    const chipProc = p => {
      const el = h('a', { class: 'proc-chip' + (procBate(p) ? ' bate' : '') + (p.status === 'arquivado' ? ' arq' : ''), href: '#/processo/' + p.id, title: [FASES[p.fase] || '', p.orgao, p.parte_contraria ? 'contra ' + p.parte_contraria : ''].filter(Boolean).join(' · '),
        onclick: ev => ev.stopPropagation() },
        h('span', { class: 'proc-ponto', 'data-cor': CORES_FASE[p.fase] || '#9aa0aa' }),
        h('span', { class: 'num' }, p.numero ? p.numero.slice(0, 15) + '…' : 'a ajuizar'),
        h('span', { class: 'proc-fase' }, FASES[p.fase] || 'Em andamento'));
      const pt = el.querySelector('.proc-ponto'); pt.style.background = pt.dataset.cor;
      return el;
    };
    const cartao = c => {
      const ps = (porCli[c.id] || []).slice().sort((x, y) => (ORD[x.fase] ?? 2) - (ORD[y.fase] ?? 2));
      const acao = temAcao(c);
      const prox = ps.filter(p => p.proximo_ato_data && p.proximo_ato_data >= hojeISO()).sort((x, y) => x.proximo_ato_data < y.proximo_ato_data ? -1 : 1)[0];
      return h('li', { class: 'cli-card ' + (acao ? 'com-acao' : 'atendimento'), tabindex: '0', role: 'link',
        onclick: () => { location.hash = '#/cliente/' + c.id; }, onkeydown: ev => { if (ev.key === 'Enter') location.hash = '#/cliente/' + c.id; } },
        h('span', { class: 'cli-ini' }, String(c.nome || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()),
        h('div', { class: 'cli-card-info' },
          h('div', { class: 'cli-card-nome' }, h('strong', {}, c.nome), seloJornada(c.jornada, true),
            aguarda[c.id] ? h('span', { class: 'tag ' + (aguarda[c.id].dias >= 7 ? 'urgente' : 'atencao') }, '✍ aguardando assinatura' + (aguarda[c.id].dias ? ` · ${aguarda[c.id].dias}d` : '')) : null,
            c.situacao && c.situacao !== 'completo' ? h('span', { class: 'tag atencao mini-tag' }, 'cadastro a completar') : null),
          h('div', { class: 'peq' }, [c.cpf_cnpj, c.telefone, c.cidade, c.area].filter(Boolean).join(' · ') || '—'),
          c.parc_abertas ? h('div', { class: 'cli-parc' + (c.parc_atrasadas ? ' atrasado' : '') }, `💰 faltam ${c.parc_abertas} parcela${c.parc_abertas === 1 ? '' : 's'}` + (c.parc_atrasadas ? ` · ${c.parc_atrasadas} atrasada${c.parc_atrasadas === 1 ? '' : 's'}` : '')) : null,
          c.obs ? h('div', { class: 'cli-obs', title: c.n_obs > 1 ? `${c.n_obs} anotações — abra a ficha para ver todas` : '' }, '📝 ' + c.obs.replace(/^\[[^\]]+\]\s*/, '') + (c.n_obs > 1 ? ` (+${c.n_obs - 1})` : '')) : null,
          ps.length ? h('div', { class: 'proc-chips' }, ps.slice(0, 4).map(chipProc), ps.length > 4 ? h('span', { class: 'peq' }, `+${ps.length - 4}`) : null) : null),
        h('div', { class: 'cli-card-lado' },
          prox ? h('div', { class: 'cli-prox' }, h('span', { class: 'peq' }, 'Próximo ato'), h('strong', {}, atoComData(prox.proximo_ato || 'Ato', prox.proximo_ato_data))) : null,
          h('span', { class: 'cli-seta', 'aria-hidden': 'true' }, '›')));
    };
    const nAjuizar = procs.filter(p => p.fase === 'contratado' && p.status !== 'arquivado').length;
    mostrar(
      ...cabCarteira('clientes', { busca, ir, filtros, nCli: todos.length, nProc: procs.length, nAjuizar }),
      h('div', { class: 'grupos-cli', role: 'group', 'aria-label': 'Grupo' },
        [['', 'Todos', base.length, 'Todos os clientes'],
          ['assinatura', '✍ Aguardando assinatura', nAssin, 'Procuração/contrato gerados, ainda não assinados']].map(([v, nome, n, dica]) =>
          h('button', { type: 'button', class: 'grupo-card g-' + (v || 'todos') + (grupo === v ? ' ativo' : ''), 'aria-pressed': String(grupo === v), onclick: () => ir({ grupo: v }) },
            h('b', {}, String(n)), h('span', { class: 'grupo-nome' }, nome), h('span', { class: 'peq' }, dica)))),
      h('div', { class: 'etapas-cli', role: 'group', 'aria-label': 'Etapa do cliente' }, h('span', { class: 'peq' }, 'Etapa:'),
        h('button', { type: 'button', class: 'etapa-cli' + (!etapa ? ' ativo' : ''), 'aria-pressed': String(!etapa), onclick: () => ir({ etapa: '' }) }, 'Todas'),
        JORNADA.filter(([id]) => contaEtapa[id]).map(([id, nome, corJ]) => { const b = h('button', { type: 'button', class: 'etapa-cli' + (etapa === id ? ' ativo' : ''), 'aria-pressed': String(etapa === id), onclick: () => ir({ etapa: etapa === id ? '' : id }) }, h('i', { 'aria-hidden': 'true' }), nome, h('b', {}, String(contaEtapa[id]))); b.style.setProperty('--cor', corJ); return b; })),
      grupo === 'assinatura' ? blocoAssinaturas((assins || []).filter(a => base.some(c => c.id === a.cliente_id)), '✍ Aguardando assinatura — marque quando o cliente assinar') : null,
      h('p', { class: 'peq contagem-lista' }, lista.length > limite ? `Mostrando ${limite} de ${lista.length}. Use a busca para achar mais rápido.` : `${lista.length} cliente${lista.length === 1 ? '' : 's'} na lista${busca ? ' para "' + busca + '"' : ''}`),
      lista.length ? h('ul', { class: 'lista-cli' }, lista.slice(0, limite).map(cartao)) : h('div', { class: 'caixa vazio-t' }, 'Nenhum cliente encontrado. ', busca ? h('a', { href: '#/processos?busca=' + encodeURIComponent(busca) }, 'Procurar nos processos') : null),
      lista.length > limite ? h('div', { class: 'acoes' }, botao(`Mostrar mais ${Math.min(100, lista.length - limite)}`, () => ir({ mais: String(limite + 100) }), 'sec')) : null);
  }

  const ESTADO_CIVIL = [['', '—'], ['solteiro(a)', 'Solteiro(a)'], ['casado(a)', 'Casado(a)'], ['união estável', 'União estável'],
    ['divorciado(a)', 'Divorciado(a)'], ['separado(a)', 'Separado(a)'], ['viúvo(a)', 'Viúvo(a)']];
  const AREAS = ['', 'Trabalhista', 'Previdenciário', 'Cível', 'Consumidor', 'Família', 'Criminal', 'Empresarial', 'Federal', 'Cobrança de honorários'].map(a => [a, a || '—']);

  /* ---------- gerar documentos (aba Modelos e ficha do cliente) ---------- */

  async function carregarModelos() {
    const r = await api('modelos.listar');
    if (Array.isArray(r)) throw new Error('Os modelos novos precisam da atualização do programa do Google: cole o Code.gs novo no Apps Script, rode "configurar" e implante uma nova versão.');
    return r;
  }

  const FORMAS_HON = [['percentual', 'Percentual (êxito)'], ['avista', 'Valor fixo à vista'], ['parcelado', 'Valor fixo parcelado'],
    ['misto', 'Fixo + percentual'], ['mensal', 'Mensal (assessoria)'], ['cadastrado', 'Usar honorário já cadastrado']];

  /* Escolha dos documentos: um botão abre a janela com categorias e busca. */
  const CATEGORIAS_DOC = [
    { id: 'procuracoes', nome: 'Procurações', ico: '⚖', desc: 'Ad judicia, filhos menores, inventário', tem: m => /^procuracao/.test(m.chave) },
    { id: 'contratos', nome: 'Contratos de honorários', ico: '✍', desc: 'Êxito, extrajudicial, mensal, INSS', tem: m => ['contrato', 'prestacao', 'assessoria', 'contrato_previdenciario'].includes(m.chave) },
    { id: 'declaracoes', nome: 'Declarações e termos', ico: '📝', desc: 'Justiça gratuita, residência, LGPD…', tem: m => ['hipossuficiencia', 'residencia', 'lgpd', 'comparecimento', 'isencao_irpf'].includes(m.chave) },
    { id: 'financeiro', nome: 'Recibos e cobrança', ico: '💰', desc: 'Recibo, promissórias, cobrança', tem: m => ['recibo', 'cobranca', 'promissoria'].includes(m.chave) },
    { id: 'peticoes', nome: 'Petições', ico: '📄', desc: 'Precisam do nº do processo', tem: m => m.processo || /^Petições \(precisam/.test(m.grupo || '') },
    { id: 'outros', nome: 'Notificações e outros', ico: '✉', desc: 'Notificação e modelos do Drive', tem: () => true }
  ];

  function seletorDocumentos(modelos, marcados) {
    const semAcento = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const catDe = m => CATEGORIAS_DOC.find(c => c.tem(m)).id;
    const itens = modelos.map(m => {
      const cx = h('input', { type: 'checkbox', name: 'doc', value: m.chave, checked: marcados.includes(m.chave) });
      const el = h('label', { class: 'doc-op', 'data-cat': catDe(m) }, cx, h('span', { class: 'doc-op-txt' }, h('strong', {}, m.nome),
        h('span', { class: 'doc-op-tags' }, m.processo ? h('span', { class: 'tag mini-tag' }, 'precisa do nº') : null,
          m.escritorio ? h('span', { class: 'tag mini-tag' }, 'modelo do Drive') : null)));
      return { m, cx, el, cat: catDe(m), busca: semAcento(m.nome) };
    });
    const cats = CATEGORIAS_DOC.filter(c => itens.some(i => i.cat === c.id));
    let catAtual = cats[0] ? cats[0].id : '';

    const chips = h('div', { class: 'doc-chips' });
    const btAbrir = h('button', { type: 'button', class: 'btn doc-abrir' });
    const busca = h('input', { type: 'search', class: 'doc-busca', placeholder: 'Buscar documento… (ex.: procuração, recibo)', 'aria-label': 'Buscar documento' });
    const abas = h('div', { class: 'doc-abas', role: 'tablist' });
    const lista = h('div', { class: 'doc-lista' }, itens.map(i => i.el));
    const contador = h('span', { class: 'doc-conta' });
    const marcar = (chaves, so) => {
      itens.forEach(i => { if (so) i.cx.checked = chaves.includes(i.m.chave); else if (chaves.includes(i.m.chave)) i.cx.checked = true; });
      itens[0] && itens[0].cx.dispatchEvent(new Event('change', { bubbles: true }));
      resumo();
    };
    const janela = h('dialog', { class: 'dialogo doc-janela', 'aria-label': 'Escolher documentos' },
      h('div', { class: 'doc-jan-topo' }, h('h2', {}, 'Escolher documentos'), h('button', { type: 'button', class: 'doc-fechar', 'aria-label': 'Fechar', onclick: () => janela.close() }, '×')),
      busca,
      h('div', { class: 'doc-corpo' }, abas, lista),
      h('div', { class: 'doc-rodape' }, contador,
        h('button', { type: 'button', class: 'btn sec mini', onclick: () => marcar([], true) }, 'Limpar'),
        h('button', { type: 'button', class: 'btn', onclick: () => janela.close() }, 'Pronto')));

    function filtrar() {
      const q = semAcento(busca.value.trim());
      itens.forEach(i => { i.el.hidden = q ? !i.busca.includes(q) : i.cat !== catAtual; });
      abas.querySelectorAll('.doc-aba').forEach(b => { const on = !q && b.dataset.cat === catAtual; b.classList.toggle('ativa', on); b.setAttribute('aria-selected', on); });
    }
    function resumo() {
      const esc = itens.filter(i => i.cx.checked);
      btAbrir.replaceChildren(h('span', { 'aria-hidden': 'true' }, '📂 '), esc.length ? `Escolher documentos (${esc.length})` : 'Escolher documentos');
      contador.textContent = esc.length ? `${esc.length} selecionado${esc.length === 1 ? '' : 's'}` : 'Nenhum selecionado';
      chips.replaceChildren(...(esc.length ? esc.map(i => h('span', { class: 'doc-chip' }, h('span', { class: 'doc-chip-ico', 'aria-hidden': 'true' }, CATEGORIAS_DOC.find(c => c.id === i.cat).ico), i.m.nome,
        h('button', { type: 'button', 'aria-label': 'Tirar ' + i.m.nome, onclick: () => { i.cx.checked = false; i.cx.dispatchEvent(new Event('change', { bubbles: true })); resumo(); } }, '×')))
        : [h('span', { class: 'peq' }, 'Nenhum documento escolhido ainda.')]));
      abas.replaceChildren(...cats.map(c => {
        const n = itens.filter(i => i.cat === c.id && i.cx.checked).length;
        return h('button', { type: 'button', role: 'tab', class: 'doc-aba', 'data-cat': c.id, onclick: () => { catAtual = c.id; busca.value = ''; filtrar(); } },
          h('span', { class: 'doc-aba-ico', 'aria-hidden': 'true' }, c.ico),
          h('span', { class: 'doc-aba-txt' }, h('strong', {}, c.nome), h('span', {}, c.desc)),
          n ? h('span', { class: 'doc-aba-n' }, String(n)) : null);
      }));
      filtrar();
    }
    busca.addEventListener('input', filtrar);
    btAbrir.addEventListener('click', () => { busca.value = ''; filtrar(); janela.showModal(); });
    janela.addEventListener('change', resumo);
    resumo();
    return { el: h('div', { class: 'doc-escolha' }, h('div', { class: 'doc-linha' }, btAbrir, chips), janela), resumo, marcar,
      abrirEm: cat => { if (cats.some(c => c.id === cat)) catAtual = cat; busca.value = ''; filtrar(); janela.showModal(); } };
  }

  /** Formulário de geração. opc: { cliente } (ficha) ou { clientes, clienteInicial } (aba Modelos). */
  function formGerar(info, opc) {
    const advs = info.advogados || [];
    const padrao = (advs.find(a => a.padrao === 'sim') || advs[0] || {}).id || '';
    const tipoDoCliente = opc.cliente && opc.cliente.tipo_acao ? (info.tipos.find(t => t.nome === opc.cliente.tipo_acao) || {}).chave || '' : '';

    let blocoCliente;
    const idCliente = h('input', { type: 'hidden', name: 'cliente_id', value: opc.cliente ? opc.cliente.id : (opc.clienteInicial || '') });
    // 8.11.2: prévia — o que vai entrar no documento e o que está faltando (em vermelho), antes de gerar
    const previa = h('div', { class: 'previa-doc', 'aria-live': 'polite' });
    const desenharPrevia = c => {
      if (!c) { previa.replaceChildren(); return; }
      const pj = c.tipo === 'PJ';
      const itens = [[pj ? 'CNPJ' : 'CPF', c.cpf_cnpj], pj ? ['Representante', c.representante] : ['RG', c.rg], pj ? null : ['Estado civil', c.estado_civil], pj ? null : ['Profissão', c.profissao],
        ['Endereço', [c.endereco, c.cidade && c.uf ? c.cidade + '/' + c.uf : c.cidade].filter(Boolean).join(', ')], ['Telefone', c.telefone]].filter(Boolean);
      const faltam = itens.filter(x => !String(x[1] || '').trim()).map(x => x[0]);
      previa.replaceChildren(h('div', { class: 'previa-cab' }, h('strong', {}, 'Vai no documento: '), c.nome),
        h('div', { class: 'previa-itens' }, itens.map(([r, v]) => h('span', { class: v ? 'ok' : 'falta' }, r + ': ' + (v || 'FALTA')))),
        faltam.length ? h('div', { class: 'previa-falta' }, `Falta ${faltam.join(', ')}. O documento sai com "[COMPLETAR]" nesses pontos — `, h('a', { href: '#/cliente/' + c.id }, 'completar o cadastro')) : h('div', { class: 'peq' }, '✓ Cadastro completo para a procuração e o contrato.'));
    };
    if (opc.cliente) blocoCliente = h('div', { class: 'largo' }, idCliente, previa);
    else {
      const rotulo = c => c.nome + (c.cpf_cnpj ? ' · ' + c.cpf_cnpj : '');
      const porRotulo = new Map(opc.clientes.map(c => [rotulo(c), c]));
      const inicial = opc.clientes.find(c => c.id === opc.clienteInicial);
      const busca = h('input', { id: 'f-cliente-busca', list: 'dl-clientes', placeholder: 'Digite o nome ou o CPF e escolha na lista', autocomplete: 'off', value: inicial ? rotulo(inicial) : '' });
      const aviso = h('div', { class: 'peq' }, inicial ? (inicial.situacao !== 'completo' ? 'Cadastro a completar: confira CPF, RG, profissão e endereço.' : '') : '');
      busca.addEventListener('input', () => {
        const c = porRotulo.get(busca.value);
        idCliente.value = c ? c.id : '';
        carregarProcessos(idCliente.value);
        aviso.textContent = c ? (c.situacao !== 'completo' ? 'Cadastro a completar: confira CPF, RG, profissão e endereço antes de gerar.' : '✓ Cliente escolhido') : '';
      });
      blocoCliente = h('div', { class: 'largo' }, h('label', { for: 'f-cliente-busca' }, 'Cliente *'), busca,
        h('datalist', { id: 'dl-clientes' }, opc.clientes.map(c => h('option', { value: rotulo(c) }))), idCliente, aviso, previa);
    }

    // nº do processo: opcional; obrigatório só para petições e substabelecimento
    const dlProc = h('datalist', { id: 'dl-processos' });
    const rotProc = h('label', { for: 'f-numero_processo' }, 'Número do processo (opcional)');
    const avisoProc = h('div', { class: 'peq' }, 'Escolha um processo do cliente ou digite o número. Puxa o juízo e a parte contrária do cadastro do processo.');
    const campoProc = h('div', {}, rotProc, h('input', { id: 'f-numero_processo', name: 'numero_processo', list: 'dl-processos', inputmode: 'numeric', autocomplete: 'off', placeholder: '0000000-00.0000.0.00.0000', maxlength: 25 }), dlProc, avisoProc);
    const orgaos = {};
    const campoVara = campo('vara', 'Vara / juízo (opcional)', '', { max: 120, dica: 'Ex.: 2ª Vara Cível, 1ª Vara do Trabalho' });
    const campoComarca = campo('comarca', 'Comarca (cidade/UF)', '', { max: 80, dica: 'Ex.: Tubarão/SC' });
    // 8.21 (pedido da usuária): a linha "Cidade, data" em cima da assinatura usa a cidade do CLIENTE (onde mora; no trabalhista, onde trabalhou)
    const campoCidadeAss = campo('cidade_assinatura', 'Cidade da assinatura (linha "Cidade, data" dos documentos)', '', { max: 80, dica: 'Vem a cidade onde o cliente mora. Trabalhista: troque pela cidade onde trabalhou, se for outra.' });
    campoCidadeAss.querySelector('input').addEventListener('input', ev => { ev.target.dataset.mexeu = '1'; });
    const carregarProcessos = async id => {
      dlProc.replaceChildren();
      const cc = (opc.clientes || []).find(x => x.id === id) || opc.cliente || null;
      const inCid = campoCidadeAss.querySelector('input');
      if (cc && cc.cidade && inCid && !inCid.dataset.mexeu) inCid.value = cc.cidade + (cc.uf ? '/' + cc.uf : '');
      if (!id) { desenharPrevia(null); return; }
      try {
        const r = await api('clientes.obter', { id });
        desenharPrevia(r.cliente);
        r.processos.forEach(p => { orgaos[p.numero] = p.orgao || ''; });
        dlProc.replaceChildren(...r.processos.filter(p => p.numero).map(p => h('option', { value: p.numero }, [p.area, p.orgao, p.parte_contraria].filter(Boolean).join(' · '))));
        avisoProc.textContent = r.processos.length ? `${r.processos.length} processo(s) deste cliente na lista.` : 'Este cliente não tem processo cadastrado; digite o número, se houver.';
      } catch (e) { /* digita à mão */ }
    };
    if (opc.cliente) carregarProcessos(opc.cliente.id);
    else if (opc.clienteInicial) carregarProcessos(opc.clienteInicial);

    // 8.21: área previdenciária já vem com a procuração + o contrato PREVIDENCIÁRIO (pedido da usuária: "puxe o que estiver ligado")
    const docsDaArea = area => area === 'Previdenciário' ? ['procuracao', 'contrato_previdenciario'] : ['procuracao', 'contrato'];
    const areaInicial = tipoDoCliente ? ((info.tipos.find(t => t.chave === tipoDoCliente) || {}).area || '') : '';
    const marcados = opc.marcar || (opc.docs ? opc.docs.split(',') : docsDaArea(areaInicial));
    const seletor = seletorDocumentos(info.modelos, marcados);
    if (opc.abrirCat) setTimeout(() => { if (seletor.el.isConnected) seletor.abrirEm(opc.abrirCat); }, 250);
    const docs = seletor.el;

    const campoF = (nome, rotulo, valor, extra, formas) => { const el = campo(nome, rotulo, valor, extra); el.dataset.formas = formas.join(' '); return el; };
    const lancar = h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'lancar', checked: true }), 'Lançar no Financeiro quando o cliente assinar (cria o honorário e as parcelas no "✓ Assinado")');
    const hon = h('fieldset', { class: 'caixa-int' }, h('legend', {}, 'Honorários do contrato'),
      h('div', { class: 'formas' }, FORMAS_HON.map(([v, t]) => h('label', { class: 'opcao' }, h('input', { type: 'radio', name: 'forma', value: v, checked: v === 'percentual' }), h('span', {}, t)))),
      h('div', { class: 'campos' },
        campoF('percentual', 'Percentual (%)', '30', { modo: 'decimal', max: 6 }, ['percentual', 'misto']),
        campoF('valor_total', 'Valor total (R$)', '', { modo: 'decimal', max: 20, dica: 'Ex.: 3.000,00' }, ['avista', 'parcelado', 'misto']),
        campoF('parcelas', 'Nº de parcelas', '', { modo: 'numeric', max: 3, dica: 'Ex.: 10' }, ['parcelado', 'misto']),
        campoF('primeiro_vencimento', 'Vencimento (1ª parcela / à vista)', '', { tipo: 'date' }, ['avista', 'parcelado', 'misto', 'mensal']),
        campoF('dia_demais', 'Demais parcelas: todo dia', '', { modo: 'numeric', max: 2, dica: 'Vazio = mesmo dia da 1ª' }, ['parcelado', 'misto']),
        campoF('valor_mensal', 'Mensalidade (R$)', '', { modo: 'decimal', max: 20 }, ['mensal']),
        campoF('dia_vencimento', 'Dia do vencimento', '10', { modo: 'numeric', max: 2 }, ['mensal'])),
      h('p', { class: 'peq', 'data-formas': 'cadastrado' }, 'A cláusula usa o honorário ativo deste cliente na aba Financeiro.'),
      // 8.11.2: formato do contrato — uma folha (compacto) ou o padrão do escritório (EB Garamond 12, entrelinha 1,5, recuo de 1 cm)
      h('div', { class: 'formas formato-contrato' }, h('span', { class: 'peq' }, 'Formato do contrato: '),
        [['umafolha', 'Uma folha (compacto)'], ['padrao', 'Padrão do escritório (entrelinha 1,5)']].map(([v, t]) => h('label', { class: 'opcao' },
          h('input', { type: 'radio', name: 'formato_contrato', value: v, checked: (() => { try { return (localStorage.getItem('formato_contrato') || 'umafolha') === v; } catch (e) { return v === 'umafolha'; } })(),
            onchange: () => { try { localStorage.setItem('formato_contrato', v); } catch (e) { /* ok */ } } }), h('span', {}, t)))),
      lancar);
    const prev = h('fieldset', { class: 'caixa-int' }, h('legend', {}, 'Honorários do contrato previdenciário (concessão)'),
      h('div', { class: 'formas' }, [['padrao', '2 benefícios ou 30% dos atrasados (o que for maior)'], ['duas_retro', '2 primeiras parcelas do benefício + retroativos'], ['duas', 'Apenas as 2 primeiras parcelas do benefício']]
        .map(([v, t]) => h('label', { class: 'opcao' }, h('input', { type: 'radio', name: 'prev_forma', value: v, checked: v === 'padrao' }), h('span', {}, t)))),
      h('div', { class: 'campos' }, campo('prev_percentual', 'Percentual sobre os retroativos/atrasados (%)', '30', { modo: 'decimal', max: 5 })),
      h('p', { class: 'peq' }, 'Revisões continuam com 30% dos valores recebidos.'));
    const rec = h('fieldset', { class: 'caixa-int' }, h('legend', {}, 'Recibo'),
      h('div', { class: 'campos' }, campo('recibo_valor', 'Valor recebido (R$)', '', { modo: 'decimal', max: 20 }),
        campo('recibo_referente', 'Referente a', '', { max: 200, dica: 'Ex.: 1ª parcela dos honorários da reclamatória trabalhista' })));

    const linhaMenor = () => h('div', { class: 'linha-menor' },
      h('input', { name: 'menor_nome', placeholder: 'Nome completo do(a) filho(a)', 'aria-label': 'Nome do(a) filho(a)', maxlength: 160 }),
      h('input', { name: 'menor_cpf', placeholder: 'CPF (se tiver)', inputmode: 'numeric', 'aria-label': 'CPF', maxlength: 14 }),
      h('input', { name: 'menor_nasc', type: 'date', 'aria-label': 'Data de nascimento' }),
      h('select', { name: 'menor_sexo', 'aria-label': 'Sexo' }, h('option', { value: '' }, '— pelo nome —'), h('option', { value: 'feminino' }, 'Feminino'), h('option', { value: 'masculino' }, 'Masculino')));
    const listaMenores = h('div', { class: 'lista-menores' }, linhaMenor());
    const menoresBox = h('fieldset', { class: 'caixa-int' }, h('legend', {}, 'Filhos menores (outorgantes)'),
      h('p', { class: 'peq' }, 'O cliente escolhido acima é quem representa (pai, mãe, tutor ou guardião). Até 15 anos sai "representado"; de 16 e 17 anos, "assistido".'),
      campo('representacao', 'O cliente é', 'genitor', { opcoes: [['genitor', 'Pai / mãe'], ['tutor', 'Tutor(a)'], ['guardiao', 'Guardião / guardiã']] }),
      listaMenores,
      botao('+ outro filho(a)', () => listaMenores.append(linhaMenor()), 'sec mini'));
    const notaCobranca = h('div', { class: 'nota' }, 'A notificação de cobrança lista sozinha as parcelas em atraso deste cliente na aba Financeiro e dá 5 dias para pagar.');
    const form = h('form', { class: 'gerador', novalidate: true },
      h('div', { class: 'campos' },
        blocoCliente,
        campo('advogado_id', 'Advogado(a) outorgado(a)', padrao, { opcoes: advs.map(a => [a.id, `${a.nome} — OAB/${a.uf} ${a.oab}`]) }),
        campo('tipo_acao', 'Tipo de ação (obrigatório na procuração: define a área e os poderes)', tipoDoCliente, { opcoes: [['', '— escolha —']].concat(info.tipos.map(t => [t.chave, t.nome])) }),
        campoProc, campoVara, campoComarca, campoCidadeAss),
      h('h4', {}, 'Quais documentos'), docs, notaCobranca, menoresBox, hon, prev, rec,
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar em PDF')),
      h('p', { class: 'erro' }), h('div', { class: 'gerados' }));

    const atualizar = () => {
      const escolhidos = [...form.querySelectorAll('input[name=doc]:checked')].map(i => info.modelos.find(m => m.chave === i.value));
      const comHon = escolhidos.some(m => m && (m.honorarios || m.mensal));
      hon.hidden = !comHon;
      rec.hidden = !escolhidos.some(m => m && m.recibo);
      prev.hidden = !escolhidos.some(m => m && m.chave === 'contrato_previdenciario');
      const pf = (form.querySelector('input[name=prev_forma]:checked') || {}).value;
      form.querySelector('[name=prev_percentual]').parentElement.hidden = pf === 'duas';
      menoresBox.hidden = !escolhidos.some(m => m && m.menores);
      if (comHon && !escolhidos.some(m => m.honorarios) && escolhidos.some(m => m.mensal)) {
        const r = form.querySelector('input[name=forma][value=mensal]'); if (r && !r.checked && form.dataset.mexeu !== '1') r.checked = true;
      }
      const forma = (form.querySelector('input[name=forma]:checked') || {}).value;
      hon.querySelectorAll('[data-formas]').forEach(el => { el.hidden = !el.dataset.formas.split(' ').includes(forma); });
      lancar.hidden = forma === 'cadastrado';
      const precisaProc = escolhidos.some(m => m && m.processo);
      rotProc.textContent = precisaProc ? 'Número do processo *' : 'Número do processo (opcional)';
      notaCobranca.hidden = !escolhidos.some(m => m && m.cobranca);
    };
    form.addEventListener('change', ev => {
      if (ev.target.name === 'forma') form.dataset.mexeu = '1';
      if (ev.target.name === 'doc') { seletor.resumo(); form.dataset.docsMexeu = '1'; }
      // 8.21: trocou o tipo de ação → troca o contrato pelo da área (previdenciário ↔ comum), mantendo o resto que foi escolhido
      if (ev.target.name === 'tipo_acao') {
        const area = (info.tipos.find(t => t.chave === ev.target.value) || {}).area || '';
        const marc = [...form.querySelectorAll('input[name=doc]:checked')].map(i => i.value);
        const temContrato = marc.includes('contrato') || marc.includes('contrato_previdenciario');
        if (area === 'Previdenciário' && (temContrato || form.dataset.docsMexeu !== '1')) seletor.marcar(marc.filter(x => x !== 'contrato').concat(['procuracao', 'contrato_previdenciario']), true);
        else if (area && area !== 'Previdenciário' && marc.includes('contrato_previdenciario')) seletor.marcar(marc.filter(x => x !== 'contrato_previdenciario').concat(['contrato']), true);
        if (area === 'Previdenciário') avisar('Área previdenciária: escolhi a procuração e o contrato previdenciário.');
      }
      atualizar();
    });
    // ao escolher o processo, mostra a vara cadastrada (o painel completa o que ficar vazio)
    form.numero_processo.addEventListener('input', () => {
      const o = orgaos[form.numero_processo.value.trim()];
      form.vara.placeholder = o ? 'do processo: ' + o : 'Ex.: 2ª Vara Cível, 1ª Vara do Trabalho';
      form.comarca.placeholder = o ? 'do processo (deixe vazio para usar)' : 'Ex.: Tubarão/SC';
    });
    if (opc.honorario) { const r = form.querySelector('input[name=forma][value=cadastrado]'); if (r) { r.checked = true; form.dataset.mexeu = '1'; } }
    atualizar();

    aoEnviar(form, async fd => {
      if (!fd.get('cliente_id')) throw new Error('Escolha o cliente na lista.');
      const modelos = fd.getAll('doc');
      if (!modelos.length) throw new Error('Marque pelo menos um documento.');
      if (!(fd.get('numero_processo') || '').trim() && modelos.some(k => (info.modelos.find(m => m.chave === k) || {}).processo)) throw new Error('Informe o número do processo: as petições e o substabelecimento precisam dele.');
      const dados = {
        cliente_id: fd.get('cliente_id'), modelos, advogado_id: fd.get('advogado_id'), tipo_acao: fd.get('tipo_acao'), honorario_id: opc.honorario || '',
        numero_processo: (fd.get('numero_processo') || '').trim(), vara: fd.get('vara'), comarca: fd.get('comarca'), cidade_assinatura: (fd.get('cidade_assinatura') || '').trim(),
        honorarios: hon.hidden ? null : { forma: fd.get('forma'), percentual: fd.get('percentual'), valor_total: fd.get('valor_total'),
          parcelas: fd.get('parcelas'), primeiro_vencimento: fd.get('primeiro_vencimento'), dia_demais: fd.get('dia_demais'), valor_mensal: fd.get('valor_mensal'),
          dia_vencimento: fd.get('dia_vencimento'), lancar: !!fd.get('lancar') },
        recibo: rec.hidden ? null : { valor: fd.get('recibo_valor'), referente: fd.get('recibo_referente') },
        prev: prev.hidden ? null : { forma: fd.get('prev_forma'), percentual: fd.get('prev_percentual') },
        representacao: fd.get('representacao'), formato_contrato: fd.get('formato_contrato') || 'umafolha',
        menores: menoresBox.hidden ? [] : fd.getAll('menor_nome').map((nome, i) => ({ nome: nome.trim(), cpf: fd.getAll('menor_cpf')[i], nascimento: fd.getAll('menor_nasc')[i], genero: fd.getAll('menor_sexo')[i] })).filter(m => m.nome)
      };
      const r = await api('documentos.gerar', dados);
      form.querySelector('.gerados').replaceChildren(...[
        r.faltando.length ? h('div', { class: 'nota alerta' }, 'Atenção, faltou no cadastro: ' + r.faltando.join(', ') + '. Esses campos saíram em branco; complete o cadastro e gere de novo.') : null,
        h('div', { class: 'nota ok' }, h('strong', {}, `${r.gerados.length} documento${r.gerados.length === 1 ? '' : 's'} gerado${r.gerados.length === 1 ? '' : 's'} na pasta do cliente.`),
          r.pasta_assinar ? h('span', {}, ' Os que o cliente assina estão em ', h('a', { href: r.pasta_assinar, target: '_blank', rel: 'noopener noreferrer' }, 'DOCUMENTOS PARA ASSINAR'), '.') : '',
          r.lancados ? ` ${r.lancados} honorário(s) lançado(s) no Financeiro.` : '', r.honorario_pendente ? ' O honorário vai para o Financeiro só quando apertar "✓ Assinado".' : '', r.ja_lancados ? ` ${r.ja_lancados} honorário(s) igual(is) já estava(m) no Financeiro e não foi(ram) lançado(s) de novo.` : ''),
        r.assinatura ? h('div', { class: 'nota assin-nota' }, h('div', {}, h('strong', {}, '✍ Aguardando assinatura. '),
            'Quando o cliente assinar, aperte "✓ Assinado": aí o caso vai para Processos › Petição inicial, com a tarefa para quem faz as iniciais. Se não assinar em 7 dias, o painel lembra vocês.'),
          cartaoAssinatura({ id: r.assinatura, cliente: (form.querySelector('[name=cliente_id] option:checked') || {}).textContent || (opc.cliente && opc.cliente.nome) || 'Cliente', documentos: 'procuração/contrato gerados agora', dias: 0, gerado_em: new Date().toISOString() })) : null,
        r.a_ajuizar ? h('div', { class: 'nota' }, 'O cliente entrou em Processos na fase ', h('strong', {}, 'Petição inicial (a ajuizar)'), ', com tarefa para quem faz as iniciais. ',
          h('a', { href: '#/processo/' + r.a_ajuizar + '?avisar=1' }, 'Abrir e avisar o cliente no WhatsApp'), '. Quando protocolar, coloque o número lá.') : null,
        r.gerados.some(g => g.assinar) ? h('div', { class: 'imprimir-caixa' },
          h('div', {}, h('strong', {}, '🖨 Documentos para o cliente assinar'),
            h('div', { class: 'peq' }, 'Abre o PDF; clique no ícone da impressora (ou Ctrl+P) para imprimir. Eles também estão na pasta "DOCUMENTOS PARA ASSINAR".')),
          r.imprimir_tudo ? h('a', { class: 'btn', href: r.imprimir_tudo, target: '_blank', rel: 'noopener noreferrer' }, `Imprimir tudo (${r.gerados.filter(g => g.assinar).length} documentos)`) : null) : null,
        h('ul', { class: 'lista-int lista-gerados' }, r.gerados.map(g => h('li', {}, h('strong', {}, g.modelo),
          g.assinar ? h('span', { class: 'tag atencao mini-tag' }, 'assinar') : null, ' · ',
          g.assinar ? h('a', { class: 'btn mini', href: g.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'Imprimir') : h('a', { href: g.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'abrir PDF'), ' · ',
          h('a', { href: g.doc, target: '_blank', rel: 'noopener noreferrer' }, 'editar no Google Docs')))),
        h('p', {}, h('a', { class: 'btn sec', href: r.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir pasta do cliente'))].filter(Boolean));
      avisar('Documentos gerados na pasta do cliente.');
      if (opc.aoGerar) opc.aoGerar(r);
    });
    return form;
  }

  /** O que tem na pasta do cliente: procuração, contrato, honorário, declarações e quantos outros arquivos. */
  function caixaDocumentos(c) {
    const caixa = h('section', { class: 'caixa' }, h('p', { class: 'peq' }, 'Verificando a pasta no Drive…'));
    (async () => {
      let d;
      try { d = await api('clientes.documentos', { id: c.id }); } catch (e) { caixa.lastChild.textContent = e.message; return; }
      const docItem = (rotulo, lista, falta) => h('div', { class: 'doc-item ' + (lista.length ? 'tem' : 'falta') },
        h('span', { class: 'doc-ico', 'aria-hidden': 'true' }, lista.length ? '✓' : '✗'),
        h('div', {}, h('strong', {}, rotulo),
          lista.length ? h('div', { class: 'doc-arqs' }, lista.slice(0, 3).map(f => h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.nome, f.assinar ? h('span', { class: 'tag atencao mini-tag' }, 'a assinar') : null)),
            lista.length > 3 ? h('span', { class: 'peq' }, `e mais ${lista.length - 3}`) : null)
            : h('div', { class: 'peq' }, falta)));
      const hon = d.honorarios
        ? h('div', { class: 'doc-item ' + (d.honorarios.total ? 'tem' : 'falta') },
          h('span', { class: 'doc-ico', 'aria-hidden': 'true' }, d.honorarios.total ? '✓' : '✗'),
          h('div', {}, h('strong', {}, 'Honorário no Financeiro'),
            h('div', { class: 'peq' }, d.honorarios.total ? `${d.honorarios.total} lançado(s), ${d.honorarios.ativos} ativo(s)` : 'nenhum honorário lançado',
              ' · ', h('a', { href: '#/honorario/novo?cliente=' + c.id }, 'novo honorário'))))
        : null;
      caixa.replaceChildren(...[
        h('div', { class: 'acoes-sec' },
          d.pasta_url ? h('a', { class: 'btn sec', href: d.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir pasta no Google Drive')
            : h('span', { class: 'peq' }, '📁 Sem pasta ainda: ela é criada sozinha quando gerar o primeiro documento (procuração, contrato…). ', h('a', { href: '#/modelos?cliente=' + c.id }, 'Gerar documentos'))),
        d.erroPasta ? h('div', { class: 'nota alerta' }, d.erroPasta) : null,
        d.para_assinar ? h('div', { class: 'nota' }, h('strong', {}, `${d.para_assinar} arquivo(s) esperando assinatura`), ' na subpasta "DOCUMENTOS PARA ASSINAR". ',
          h('a', { href: d.pasta_assinar, target: '_blank', rel: 'noopener noreferrer' }, 'abrir'), '. Depois de assinados, salve os escaneados na pasta principal.') : null,
        h('div', { class: 'docs-grade' },
          docItem('Procuração', d.procuracao, 'não encontrada na pasta'),
          docItem('Contrato de honorários', d.contrato, 'não encontrado na pasta'),
          hon,
          docItem('Declarações e termos', d.declaracao, 'nenhuma declaração na pasta'),
          d.recibo.length ? docItem('Recibos', d.recibo, '') : null),
        d.pasta_url ? h('p', { class: 'peq mt-p' }, d.outros ? `Mais ${d.outros} documento${d.outros === 1 ? '' : 's'} na pasta (${d.total} arquivo${d.total === 1 ? '' : 's'} ao todo).` : 'Nenhum outro documento na pasta.') : null].filter(Boolean));
    })();
    return caixa;
  }

  /** Cliente em atendimento contratou: cria o processo "Petição inicial (a ajuizar)" e a tarefa para o responsável. */
  async function caixaAbrirAcao(c, nova) {
    const [info, t] = await Promise.all([carregarModelos().catch(() => ({ tipos: [] })), api('tarefas.listar', {}).catch(() => ({ usuarios: [], responsaveis: {} }))]);
    const tipoAtual = nova ? '' : (info.tipos.find(x => x.nome === c.tipo_acao) || {}).chave || '';
    const caixa = h('dialog', { class: 'dialogo' });
    const form = h('form', { class: 'campos', novalidate: true },
      h('h2', { class: 'largo' }, nova ? 'Nova ação para este cliente' : 'Cliente contratou'),
      nova ? h('p', { class: 'largo nota' }, 'O mesmo cadastro serve para todas as ações. Cada ação vira um processo separado, com a sua etapa, prazos e honorário.') : null,
      h('p', { class: 'largo peq' }, h('strong', {}, c.nome), ' vai para Processos › Petição inicial. Quando protocolar, coloque o número no processo e ele passa sozinho para "Em andamento".'),
      campo('tipo_acao', 'Tipo de ação', tipoAtual, { opcoes: [['', '— escolha —']].concat((info.tipos || []).map(x => [x.chave, x.nome])) }),
      campo('parte_contraria', 'Contra quem (parte contrária)', '', { max: 200 }),
      campo('responsavel', 'Quem faz a petição inicial', (t.responsaveis || {}).inicial || '', { opcoes: [['', '— ninguém —']].concat((t.usuarios || []).map(u => [u.usuario, u.nome])) }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Abrir ação'), botao('Cancelar', () => caixa.close(), 'sec')),
      h('p', { class: 'erro largo' }));
    aoEnviar(form, async fd => {
      if (nova && !fd.get('tipo_acao')) throw new Error('Escolha o tipo da nova ação.');
      const r = await api('clientes.abrirAcao', { id: c.id, tipo_acao: fd.get('tipo_acao'), parte_contraria: fd.get('parte_contraria'), responsavel: fd.get('responsavel'), nova: !!nova });
      caixa.close();
      avisar(r.ja ? 'Este cliente já tinha uma ação a ajuizar.' : 'Ação aberta: o cliente está em Processos › Petição inicial.');
      location.hash = '#/processo/' + r.id;
    });
    caixa.append(form);
    caixa.addEventListener('close', () => caixa.remove());
    document.body.append(caixa);
    caixa.showModal();
  }

  /** Cadastro: o essencial para a procuração e o contrato. */
  function formCliente(c, novo) {
    const pf = (c.tipo || 'PF') === 'PF';
    const soPF = el => { el.dataset.so = 'PF'; return el; };
    const soPJ = el => { el.dataset.so = 'PJ'; return el; };
    const form = h('form', { class: 'caixa form-cliente', novalidate: true },
      h('fieldset', {}, h('legend', {}, 'Identificação'),
        h('div', { class: 'campos' },
          campo('tipo', 'Pessoa', c.tipo || 'PF', { opcoes: [['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']] }),
          campo('nome', pf ? 'Nome completo' : 'Razão social', c.nome, { obrigatorio: true, max: 200 }),
          campo('cpf_cnpj', pf ? 'CPF' : 'CNPJ', c.cpf_cnpj, { modo: 'numeric', max: 18, obrigatorio: novo }),
          soPF(campo('rg', 'RG', c.rg, { max: 30 })),
          soPF(campo('genero', 'Sexo (para os documentos)', c.genero || '', { opcoes: [['', '— pelo nome —'], ['feminino', 'Feminino'], ['masculino', 'Masculino']], dica: 'Sai "brasileira, casada" ou "brasileiro, casado" nos documentos' })),
          soPF(campo('nascimento', 'Data de nascimento', c.nascimento, { tipo: 'date' })),
          soPF(campo('estado_civil', 'Estado civil', c.estado_civil, { opcoes: ESTADO_CIVIL })),
          soPF(campo('profissao', 'Profissão', c.profissao, { max: 100, obrigatorio: novo })),
          soPJ(campo('representante', 'Representante legal (nome e CPF)', c.representante, { max: 200 })))),
      h('fieldset', {}, h('legend', {}, 'Endereço e contato'),
        h('div', { class: 'campos' },
          campo('cep', 'CEP', c.cep, { modo: 'numeric', max: 9, dica: 'Preenche rua e cidade sozinho' }),
          campo('endereco', 'Endereço (rua, número, bairro)', c.endereco, { max: 200, obrigatorio: novo }),
          campo('cidade', 'Cidade', c.cidade, { max: 80 }),
          campo('uf', 'UF', c.uf, { max: 2 }),
          campo('telefone', 'Telefone / WhatsApp', c.telefone, { tipo: 'tel', max: 30 }),
          campo('email', 'E-mail', c.email, { tipo: 'email', max: 120 }),
          campo('como_conheceu', 'Como nos conheceu?', c.como_conheceu || '', { opcoes: [['', '— perguntar ao cliente —']].concat(CANAIS_CONHECEU.map(x => [x, x])), dica: 'Conta no Marketing: mostra se o anúncio do Google traz cliente.' }),
          campo('origem', 'Detalhe (quem indicou, qual anúncio…)', c.origem, { max: 120 }))),
      novo ? null : h('fieldset', {}, h('legend', {}, 'Escritório'),
        h('div', { class: 'campos' },
          campo('tipo_acao', 'Tipo de ação', c.tipo_acao, { max: 200 }),
          campo('area', 'Área', c.area, { opcoes: AREAS.some(a => a[0] === (c.area || '')) ? AREAS : AREAS.concat([[c.area, c.area]]) }),
          campo('situacao', 'Cadastro', c.situacao, { opcoes: [['completo', 'Completo'], ['importado — conferir', 'Importado — conferir'], ['incompleto', 'Incompleto']] }),
          campo('pasta_link', 'Pasta no Google Drive (link)', c.pasta_url, { max: 300, largo: true, dica: 'Se a pasta estiver errada ou faltando, abra a pasta certa no Drive, copie o endereço e cole aqui.' }))),
      h('div', { class: 'acoes' },
        h('button', { type: 'submit', class: 'btn' }, novo ? 'Cadastrar e criar pasta' : 'Salvar alterações'),
        h('a', { class: 'btn sec', href: '#/clientes' }, 'Voltar')),
      h('p', { class: 'erro' }));

    const ajustarTipo = () => {
      const t = form.tipo.value;
      form.querySelectorAll('[data-so]').forEach(el => { el.hidden = el.dataset.so !== t; });
      form.querySelector('label[for=f-nome]').textContent = (t === 'PJ' ? 'Razão social' : 'Nome completo') + ' *';
      form.querySelector('label[for=f-cpf_cnpj]').textContent = (t === 'PJ' ? 'CNPJ' : 'CPF') + (novo ? ' *' : '');
    };
    form.tipo.addEventListener('change', ajustarTipo);
    ajustarTipo();

    // CEP → rua, bairro, cidade e UF (ViaCEP, só o número do CEP sai do navegador)
    form.cep.addEventListener('change', async () => {
      const cep = form.cep.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(x => x.json());
        if (r.erro) return;
        form.cep.value = cep.slice(0, 5) + '-' + cep.slice(5);
        if (!form.endereco.value) form.endereco.value = [r.logradouro, r.bairro].filter(Boolean).join(', ') + (r.logradouro ? ', nº ' : '');
        if (!form.cidade.value) form.cidade.value = r.localidade || '';
        if (!form.uf.value) form.uf.value = r.uf || '';
        form.endereco.focus();
      } catch (e) { /* sem internet ou CEP inexistente: preenche à mão */ }
    });

    aoEnviar(form, async fd => {
      const dados = Object.fromEntries(fd.entries());
      if (dados.tipo === 'PJ') { delete dados.rg; delete dados.nascimento; delete dados.estado_civil; delete dados.profissao; delete dados.genero; }
      if (novo) {
        const falta = [];
        if (!dados.nome.trim()) falta.push(dados.tipo === 'PJ' ? 'razão social' : 'nome completo');
        if (!dados.cpf_cnpj.trim()) falta.push(dados.tipo === 'PJ' ? 'CNPJ' : 'CPF');
        if (dados.tipo !== 'PJ' && !dados.profissao.trim()) falta.push('profissão');
        if (!dados.endereco.trim()) falta.push('endereço');
        if (falta.length) throw new Error('Para cadastrar, preencha: ' + falta.join(', ') + '.');
      } else dados.id = c.id;
      const res = await api('clientes.salvar', { cliente: dados });
      if (res.avisoPasta) avisar(res.avisoPasta, true);
      else avisar(novo ? (res.pasta && res.pasta.pasta_url ? 'Cliente cadastrado e ligado à pasta que já existia no Drive.' : 'Cliente cadastrado. A pasta no Drive será criada quando gerar o primeiro documento.') : 'Alterações salvas.');
      if (novo) location.hash = '#/modelos?cliente=' + encodeURIComponent(res.id) + '&novo=1'; else telaCliente(c.id);
    });
    return form;
  }

  /** Seção que abre e fecha pela seta (como "Editar cadastro"). Carrega o conteúdo só ao abrir. */
  /** Código para o cliente acompanhar os processos no site (araujoadvocaciasc.com.br/acompanhe). */
  function caixaAcesso(c) {
    const saida = h('div', {});
    const estado = h('p', {}, c.acesso_ativo
      ? h('span', {}, h('span', { class: 'tag ok' }, 'acesso ativo'), c.acesso_criado_em ? ` desde ${new Date(c.acesso_criado_em).toLocaleDateString('pt-BR')}` : '')
      : h('span', { class: 'tag' }, 'sem acesso'));
    const gerar = botao(c.acesso_ativo ? 'Gerar código novo' : 'Gerar código de acesso', async ev => {
      if (c.acesso_ativo && !confirm('O código antigo deixa de funcionar. Gerar um novo?')) return;
      ev.target.disabled = true;
      try {
        const r = await api('clientes.acesso', { id: c.id, acao: 'gerar' });
        let tel = telefoneWhats(c.telefone || ''); if (tel && tel.length <= 11) tel = '55' + tel;
        const nome = nomeProprioJS(String(c.nome || '').split(' ')[0]);
        const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Agora você pode acompanhar seu processo pelo nosso site: ${r.link}\nDigite seu CPF e este código: ${r.codigo}\nGuarde o código e não o compartilhe. Qualquer dúvida, estamos à disposição.`;
        saida.replaceChildren(h('div', { class: 'nota ok' },
          h('p', {}, 'Código do cliente: ', h('strong', { class: 'codigo-acesso' }, r.codigo)),
          h('p', { class: 'peq' }, 'Ele aparece só agora. Mande para o cliente; se perder, gere um novo (o antigo deixa de valer).'),
          tel ? h('a', { class: 'btn sec wa', href: 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener noreferrer' }, 'Mandar no WhatsApp') : h('p', { class: 'peq' }, 'Cliente sem telefone: copie o código e o link ' + r.link)));
        estado.replaceChildren(h('span', { class: 'tag ok' }, 'acesso ativo'), ' desde hoje');
        c.acesso_ativo = true;
      } catch (e) { avisar(e.message, true); }
      ev.target.disabled = false;
    });
    const revogar = botao('Desativar acesso', async () => {
      if (!confirm('O cliente não vai mais conseguir consultar pelo site. Desativar?')) return;
      try { await api('clientes.acesso', { id: c.id, acao: 'revogar' }); c.acesso_ativo = false; estado.replaceChildren(h('span', { class: 'tag' }, 'sem acesso')); saida.replaceChildren(); avisar('Acesso desativado.'); }
      catch (e) { avisar(e.message, true); }
    }, 'sec');
    return h('div', {},
      h('p', {}, 'Com o CPF e um código, o cliente vê no site a situação dos processos dele, a vara, a próxima audiência e a data da última movimentação. Ele não vê prazos internos, valores nem observações do escritório.'),
      estado, h('div', { class: 'acoes' }, gerar, revogar), saida);
  }

  /** WhatsApp → PDF: instruções, pasta de entrada e botão para converter agora. */
  function caixaWhats(c) {
    const saida = h('div', {});
    const btn = h('button', { type: 'button', class: 'btn' }, 'Converter agora');
    const linkEntrada = h('a', { class: 'btn sec', target: '_blank', rel: 'noopener noreferrer', href: '#' }, 'Abrir a pasta de entrada no Drive');
    api('whatsapp.entrada', {}).then(r => { linkEntrada.href = r.url; }).catch(() => { linkEntrada.hidden = true; });
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Convertendo… (pode levar alguns minutos)';
      try {
        const r = await api('clientes.whatsapp', { id: c.id });
        const meus = r.feitos.filter(f => f.cliente_id === c.id);
        saida.replaceChildren(...[
          meus.length ? h('div', { class: 'nota ok' }, h('strong', {}, `${meus.length} conversa(s) convertida(s).`),
            h('ul', { class: 'lista-int' }, meus.map(f => h('li', {}, `${f.fotos} foto(s), ${f.outros} vídeo(s)/áudio(s)/outros · `,
              ...f.pdfs.map((u, i) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, f.pdfs.length > 1 ? ` PDF das fotos ${i + 1} ` : 'PDF das fotos')),
              f.conversa ? [' · ', h('a', { href: f.conversa, target: '_blank', rel: 'noopener noreferrer' }, 'conversa em PDF')] : '',
              ' · ', h('a', { href: f.pasta, target: '_blank', rel: 'noopener noreferrer' }, 'pasta com os arquivos'))))) :
            h('div', { class: 'nota alerta' }, 'Não achei nenhuma conversa deste cliente na pasta de entrada. Confira se o arquivo exportado terminou de subir para o Drive.'),
          r.erros.length ? h('div', { class: 'nota alerta' }, 'Problemas: ' + r.erros.join(' · ')) : null].filter(Boolean));
      } catch (e) { saida.replaceChildren(h('div', { class: 'nota alerta' }, e.message)); }
      btn.disabled = false; btn.textContent = 'Converter agora';
    });
    return h('div', {},
      h('p', {}, 'O WhatsApp não deixa nenhum sistema ler as conversas direto do celular. O jeito é exportar a conversa para o Drive; o painel faz o resto sozinho: junta as fotos num PDF (uma por página, com a data), guarda a conversa em PDF e salva vídeos e áudios numa subpasta, tudo na pasta deste cliente.'),
      h('ol', { class: 'passos' },
        h('li', {}, 'No celular, abra a conversa com o cliente no WhatsApp.'),
        h('li', {}, 'Toque nos ⋮ (Android) ou no nome do contato (iPhone) › Mais › ', h('strong', {}, 'Exportar conversa'), ' › ', h('strong', {}, 'Anexar mídia'), '.'),
        h('li', {}, 'Escolha ', h('strong', {}, 'Drive'), ' e salve na pasta ', h('strong', {}, 'ENTRADA DO WHATSAPP'), '.'),
        h('li', {}, 'Pronto: o robô converte nas próximas horas, ou aperte "Converter agora".')),
      h('p', { class: 'peq' }, 'Se o contato estiver salvo com outro nome, o painel também reconhece pelo telefone. Arquivos acima de 48 MB não abrem: nesse caso, selecione as fotos no celular, compartilhe para o Drive numa pasta com o nome do cliente dentro da ENTRADA DO WHATSAPP.'),
      h('div', { class: 'acoes' }, btn, linkEntrada), saida);
  }

  function secao(titulo, conteudo, aberto) {
    const det = h('details', { class: 'caixa secao', open: !!aberto }, h('summary', {}, titulo));
    const carregar = () => { if (det.dataset.ok) return; det.dataset.ok = '1'; det.append(typeof conteudo === 'function' ? conteudo() : conteudo); };
    if (aberto) carregar();
    det.addEventListener('toggle', () => { if (det.open) carregar(); });
    return det;
  }

  /** 8.11.1 (pedido da usuária): quantas parcelas faltam pagar — em vermelho na ficha (e no cartão da lista). */
  /** 8.12.3 (pedido da usuária): DITAR a observação pelo microfone, direto no cadastro do cliente. O texto aparece na caixa enquanto
      a pessoa fala (reconhecimento de voz do Chrome, em português) e dá para corrigir antes de salvar. "✨ Arrumar o texto" pede ao
      Gemini só pontuação e organização (sem inventar nada). Nada de áudio fica guardado: só o texto que for salvo. */
  function ditado(ta, clienteId) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = h('span', { class: 'ditado-status', 'aria-live': 'polite' });
    const bt = h('button', { type: 'button', class: 'btn sec ditado-bt', title: 'Falar a observação em vez de digitar' }, '🎙 Ditar');
    const arrumar = h('button', { type: 'button', class: 'btn sec', title: 'A IA só corrige a pontuação e organiza o que foi dito' }, '✨ Arrumar o texto');
    let rec = null, ligado = false;
    const parar = () => { ligado = false; try { rec && rec.stop(); } catch (e) { /* ok */ } bt.textContent = '🎙 Ditar'; bt.classList.remove('gravando'); status.textContent = ''; };
    bt.addEventListener('click', () => {
      if (!Rec) { avisar('Este navegador não faz ditado. Use o Google Chrome (no computador ou no celular).', true); return; }
      if (ligado) { parar(); return; }
      rec = new Rec(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
      const base = () => (ta.value && !/\s$/.test(ta.value) ? ta.value + ' ' : ta.value);
      rec.onresult = ev => {
        let parcial = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript.trim();
          if (ev.results[i].isFinal) { ta.value = base() + t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.'); ta.dispatchEvent(new Event('input')); }
          else parcial += t + ' ';
        }
        status.textContent = parcial ? '… ' + parcial.trim() : 'ouvindo…';
      };
      rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { avisar('O navegador não liberou o microfone: clique no cadeado ao lado do endereço e permita o microfone.', true); parar(); } };
      rec.onend = () => { if (ligado) { try { rec.start(); } catch (e) { parar(); } } };
      try { rec.start(); ligado = true; bt.textContent = '■ Parar'; bt.classList.add('gravando'); status.textContent = 'ouvindo…'; ta.focus(); } catch (e) { avisar('Não consegui ligar o microfone.', true); }
    });
    arrumar.addEventListener('click', async () => {
      if (ta.value.trim().length < 15) { avisar('Fale ou escreva a observação primeiro.', true); return; }
      if (ligado) parar();
      arrumar.disabled = true; const antes = arrumar.textContent; arrumar.textContent = 'Arrumando…';
      try { const r = await api('ia.organizarNota', { texto: ta.value, cliente_id: clienteId || '' }); if (r.texto) { ta.value = r.texto; avisar('Texto arrumado. Confira antes de salvar.'); } }
      catch (e) { avisar(e.message, true); }
      finally { arrumar.disabled = false; arrumar.textContent = antes; }
    });
    const caixa = h('span', { class: 'ditado' }, bt, arrumar, status);
    // saiu da tela com o microfone ligado: desliga
    const obs = new MutationObserver(() => { if (!caixa.isConnected) { parar(); obs.disconnect(); } }); setTimeout(() => obs.observe(document.body, { childList: true, subtree: true }), 0);
    return caixa;
  }

  /** 8.12.1: em que ponto do CRM / Funil o cliente está (clicar abre o funil já filtrado pelo nome). */
  const NOME_ETAPA_CRM = { novo: 'Novo contato', contato: 'Em conversa', cadastro: 'Cadastro enviado', cliente: 'Cadastro preenchido', atendido: 'Consulta feita', proposta: 'Procuração e contrato enviados', ganho: 'Contrato assinado', perdido: 'Não fechou' };
  function seloFunil(l, c) {
    if (!l) return null;
    return h('a', { class: 'selo-funil etapa-' + l.etapa, href: '#/crm?ver=lista&q=' + encodeURIComponent(c.nome), title: 'Abrir no CRM / Funil' },
      h('strong', {}, '📈 Funil: ' + (NOME_ETAPA_CRM[l.etapa] || l.etapa)), l.canal ? h('span', {}, ' · veio por ' + l.canal) : null);
  }
  function seloParcelas(p, cid) {
    if (!p || !p.abertas) return null;
    const rh = sessao.usuario.pode.ocultarValores;
    return h('a', { class: 'selo-parcelas' + (p.atrasadas ? ' atrasado' : ''), href: '#/cliente/' + cid, title: 'Ver os honorários deste cliente', onclick: ev => { ev.preventDefault(); const alvo = document.querySelector('.fin-cliente'); if (alvo) alvo.scrollIntoView({ behavior: 'smooth' }); else location.hash = '#/financeiro?ver=honorarios'; } },
      h('strong', {}, `💰 Faltam ${p.abertas} parcela${p.abertas === 1 ? '' : 's'}`),
      p.atrasadas ? h('span', {}, ` · ${p.atrasadas} atrasada${p.atrasadas === 1 ? '' : 's'}` + (rh ? '' : ` (${reais(p.valor_atrasado)})`)) : null,
      rh ? null : h('span', {}, ` · total em aberto ${reais(p.valor)}`),
      p.proxima ? h('span', {}, ` · próxima ${dataBR(p.proxima.vencimento)}`) : null);
  }

  async function telaCliente(id, params) {
    carregando();
    params = params || new URLSearchParams();
    const novo = id === 'novo';
    if (novo) {
      mostrar(
        h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Novo cliente'),
          h('p', {}, 'Só o necessário para a procuração e o contrato. Ao cadastrar, o painel cria a pasta do cliente em 02. CLIENTES e abre a aba Modelos para gerar os documentos.'))),
        formCliente({ tipo: 'PF', situacao: 'completo' }, true));
      document.getElementById('f-nome').focus();
      return;
    }
    const r = await api('clientes.obter', { id });
    const c = r.cliente;
    const incompleto = c.situacao && c.situacao !== 'completo';
    const pfFalta = c.tipo !== 'PJ';
    const faltam = [['cpf_cnpj', pfFalta ? 'CPF' : 'CNPJ'], ['profissao', 'profissão'], ['endereco', 'endereço'], ['telefone', 'telefone']]
      .filter(([k]) => !c[k] && !(!pfFalta && /rg|profissao/.test(k))).map(x => x[1]);
    const pf = c.tipo !== 'PJ';

    // Descrição do cliente: os dados num cartão, lado a lado
    const item = (rot, val, largo) => h('div', { class: 'desc-item' + (largo ? ' largo' : '') }, h('span', { class: 'desc-rot' }, rot), h('span', { class: 'desc-val' + (val ? '' : ' vazio') }, val || '—'));
    const endereco = [c.endereco, c.cidade && c.uf ? c.cidade + '/' + c.uf : c.cidade, c.cep ? 'CEP ' + c.cep : ''].filter(Boolean).join(' · ');
    const descricao = h('section', { class: 'caixa descricao-cliente' },
      h('div', { class: 'desc-grade' },
        item(pf ? 'CPF' : 'CNPJ', c.cpf_cnpj),
        pf ? item('RG', c.rg) : item('Representante legal', c.representante),
        pf ? item('Nascimento', c.nascimento ? dataBR(c.nascimento) : '') : null,
        pf ? item('Estado civil', c.estado_civil) : null,
        pf ? item('Profissão', c.profissao) : null,
        item('Telefone', c.telefone),
        item('E-mail', c.email),
        item('Como chegou', c.origem),
        item('Tipo de ação', c.tipo_acao),
        item('Área', c.area),
        item('Endereço', endereco, true)));

    // Observações: escreve aqui e vê depois, com data e quem escreveu
    const notas = () => {
      const lista = h('ul', { class: 'notas' });
      const desenhar = obs => {
        // 8.10: cada anotação tem "Editar" (corrige ou apaga; fica registrado quem editou)
        const brutas = String(obs || '').split('\n');
        const itens = brutas.map((l, i) => ({ l: l.trim(), i })).filter(x => x.l);
        const editar = (li, x, textoAtual) => {
          const ta = h('textarea', { rows: Math.min(14, Math.max(3, Math.ceil(textoAtual.length / 90))) }, textoAtual);
          const salvar = async apagar => {
            if (apagar && !confirm('Apagar esta observação? Fica registrado no histórico quem apagou.')) return;
            try { const r = await api('clientes.notaEditar', { id: c.id, indice: x.i, original: x.l, texto: apagar ? '' : ta.value }); c.observacoes = r.observacoes; desenhar(r.observacoes); avisar(apagar ? 'Observação apagada.' : 'Observação corrigida.'); }
            catch (e) { avisar(e.message, true); }
          };
          li.replaceChildren(ta, h('div', { class: 'acoes' }, botao('Salvar correção', () => salvar(false)), botao('Apagar', () => salvar(true), 'sec'), botao('Cancelar', () => desenhar(c.observacoes), 'sec')));
          ta.focus();
        };
        lista.replaceChildren(...(itens.length ? itens.map(x => {
          const m = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) — ([^\]]+)\] (.*)$/.exec(x.l);
          const corpo = m ? m[3] : x.l.split(' | ').join('\n');
          const li = h('li', m ? {} : { class: 'antiga' },
            h('div', { class: 'nota-cab' }, m ? [h('strong', {}, m[2]), ' · ', m[1]] : 'registro antigo',
              h('button', { type: 'button', class: 'link nota-editar', title: 'Corrigir ou apagar esta observação', onclick: () => editar(li, x, corpo.replace(/\s*\(editado em [^)]*\)\s*$/, '')) }, '✎ editar')),
            h('div', { class: 'nota-texto' }, corpoNota(corpo)));
          return li;
        }) : [h('li', { class: 'vazia' }, 'Nenhuma observação ainda.')]));
      };
      desenhar(c.observacoes);
      const taNota = h('textarea', { name: 'texto', rows: 3, placeholder: 'Escreva ou dite (🎙) uma observação sobre o cliente (atendimento, combinado, pendência…) — sem limite de tamanho', 'aria-label': 'Nova observação' });
      const f = h('form', { class: 'nota-form', novalidate: true }, taNota,
        h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar observação'), ditado(taNota, c.id),
          h('a', { class: 'btn sec', href: '#/transcricao?cliente=' + encodeURIComponent(c.id), title: 'Grava a conversa (presencial, Meet ou WhatsApp no computador); a IA transcreve, resume e guarda aqui nas observações' }, '🎙 Gravar atendimento')), h('p', { class: 'erro' }));
      aoEnviar(f, async fd => {
        const r = await api('clientes.nota', { id: c.id, texto: fd.get('texto') });
        c.observacoes = r.observacoes; f.reset(); desenhar(r.observacoes); avisar('Observação salva.');
      });
      const antigas = String(c.obs_antigas || '').split('\n').filter(x => x.trim());
      return h('div', {}, f, lista, antigas.length ? h('details', { class: 'notas-antigas' }, h('summary', {}, `Observações antigas (${antigas.length})`),
        h('ul', { class: 'notas' }, antigas.map(l => { const m = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) — ([^\]]+)\] (.*)$/.exec(l);
          return h('li', {}, h('div', { class: 'nota-cab' }, m ? [h('strong', {}, m[2]), ' · ', m[1]] : 'registro antigo'), h('div', { class: 'nota-texto' }, m ? m[3] : l)); }))) : null);
    };

    const procs = () => h('div', {},
      h('div', { class: 'acoes-sec' }, botao('Novo processo', () => { location.hash = '#/processo/novo?cliente=' + encodeURIComponent(c.id); }, 'sec')),
      r.processos.length > 1 ? h('p', { class: 'nota' }, `${c.nome.split(' ')[0]} tem ${r.processos.length} processos. Cada um anda sozinho, com a sua etapa, prazos e honorário.`) : null,
      tabela(['Processo', 'Etapa', 'Área', 'Órgão', 'Parte contrária', 'Situação'], r.processos, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Etapa' }, (() => { const e = h('span', { class: 'tag etapa-tag' }, FASES[p.fase] || p.fase || '—'); if (CORES_FASE[p.fase]) { e.style.setProperty('background', CORES_FASE[p.fase]); e.style.setProperty('color', '#fff'); } return e; })()),
        h('td', { 'data-r': 'Área' }, p.area || '—', h('div', { class: 'peq' }, p.tribunal)),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Parte contrária' }, p.parte_contraria),
        h('td', { 'data-r': 'Situação' }, p.status === 'arquivado' ? h('span', { class: 'tag' }, 'arquivado') : h('span', { class: 'tag ok' }, 'em andamento'),
          p.proximo_ato ? h('div', { class: 'peq' }, p.proximo_ato) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo ligado a este cliente.'));

    const hons = () => {
      const caixa = h('div', { class: 'fin-cliente' }, h('p', { class: 'peq' }, 'Carregando…'));
      api('fin.honorarios', { cliente_id: c.id }).catch(() => []).then(hs => caixa.replaceChildren(
        h('div', { class: 'acoes-sec' }, botao('Novo honorário', () => { location.hash = '#/honorario/novo?cliente=' + c.id; }, 'sec')),
        tabela(['Tipo', 'Descrição', 'Recebido', 'Em atraso', 'Situação'], hs, x => [
          h('td', {}, TIPOS_HON[x.tipo] || x.tipo), h('td', {}, x.descricao), h('td', { class: 'num' }, reais(x.resumo.pago)),
          h('td', { class: 'num' }, x.resumo.atrasado ? h('span', { class: 'tag urgente' }, reais(x.resumo.atrasado)) : '—'), h('td', {}, x.situacao)
        ], x => { location.hash = '#/honorario/' + x.id; }, 'Nenhum honorário cadastrado.')));
      return caixa;
    };

    const pasta = () => { const d = caixaDocumentos(c); d.className = 'docs-pasta'; return d; };
    // 8.22: portal do cliente — o que está na pasta "PORTAL — O CLIENTE VÊ" aparece para baixar no /acompanhe/; o que ele envia cai em "ENVIADOS PELO CLIENTE"
    const portal = () => {
      const box = h('div', { class: 'portal-cli' }, h('p', { class: 'peq' }, 'Carregando…'));
      const desenhar = r => box.replaceChildren(
        r.semPasta ? h('p', { class: 'peq' }, 'O cliente ainda não tem pasta no Drive: ela nasce ao gerar o primeiro documento. Depois, os documentos do portal ficam numa subpasta dela.')
          : h('div', {},
            h('p', {}, r.url ? `${r.arquivos} documento(s) visíveis para o cliente no site (Acompanhe). Ponha na pasta só o que ele pode ver: contrato assinado, decisões, recibos.`
              : 'Crie a pasta do portal e ponha nela os documentos que o cliente pode baixar pelo site.'),
            h('div', { class: 'acoes-sec' },
              r.url ? h('a', { class: 'btn sec', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, '📤 Abrir a pasta do portal (o cliente vê)')
                : botao('📤 Criar a pasta do portal', async () => desenhar(await api('clientes.portal', { id: c.id, criar: true })), 'sec'),
              r.recebidos_url ? h('a', { class: 'btn sec', href: r.recebidos_url, target: '_blank', rel: 'noopener noreferrer' }, '📥 Documentos enviados pelo cliente') : null),
            r.tem_acesso ? null : h('p', { class: 'nota' }, 'O cliente ainda não tem código de acesso ao site: gere em "Acesso do cliente ao site".')));
      api('clientes.portal', { id: c.id }).then(desenhar).catch(e => box.replaceChildren(h('p', { class: 'erro' }, e.message)));
      return box;
    };
    const assinBox = h('div');
    // 8.10: onde o atendimento parou — documento gerado → assinatura → assinado → financeiro (uma linha só)
    const jornada = h('div');
    api('documentos.assinaturas', { cliente_id: c.id, todas: true }).then(l => {
      const a = (l || []).slice().sort((x, y) => (x.gerado_em || '') < (y.gerado_em || '') ? 1 : -1)[0];
      if (!a) return;
      const passo = (rot, sub, est) => h('li', { class: 'jor-' + est }, h('span', { class: 'jor-bola' }, est === 'ok' ? '✓' : est === 'agora' ? '•' : ''), h('b', {}, rot), sub ? h('span', { class: 'peq' }, sub) : null);
      const ass = a.situacao === 'assinado', desist = a.situacao === 'não assinou';
      const fin = !a.tem_honorarios ? ['Financeiro', ass ? 'sem honorário no contrato gerado' : '', ass ? 'ok' : 'falta']
        : a.honorarios_lancados ? ['Financeiro lançado', /^\d{4}-\d{2}-\d{2}/.test(a.honorarios_lancados) ? dataBR(a.honorarios_lancados.slice(0, 10)) : '', 'ok']
        : ['Financeiro', ass ? 'falta lançar o honorário' : 'entra ao assinar', ass ? 'agora' : 'falta'];
      jornada.replaceChildren(h('section', { class: 'caixa jornada' }, h('h2', {}, 'Onde o atendimento está'),
        h('ol', { class: 'jor-linha' },
          passo('Documentos gerados', (a.gerado_em ? dataBR(a.gerado_em.slice(0, 10)) : '') + (a.documentos ? ' · ' + String(a.documentos).slice(0, 60) : ''), 'ok'),
          passo(desist ? 'Não vai assinar' : 'Assinatura', desist ? '' : ass ? '' : `aguardando há ${a.dias || 0} dia(s)`, desist ? 'parou' : ass ? 'ok' : 'agora'),
          passo('Assinado', ass && a.assinado_em ? dataBR(String(a.assinado_em).slice(0, 10)) : '', ass ? 'ok' : 'falta'),
          passo(fin[0], fin[1], desist ? 'falta' : fin[2])),
        ass ? h('p', { class: 'peq' }, 'Marcou "Assinado" por engano ou o cliente desistiu? ', botao('Não vai fechar', async ev => {
          if (!confirm(`${c.nome} não vai fechar? A petição inicial sem número é arquivada e o honorário lançado ao assinar sai do Financeiro (parcelas pagas ficam).`)) return;
          ev.target.disabled = true;
          try { const r = await api('documentos.assinatura', { id: a.id, acao: 'desistiu' }); avisar('Pronto: não fechou.' + (r && r.honorarios ? '' : '')); rota(); } catch (e) { avisar(e.message, true); ev.target.disabled = false; }
        }, 'mini sec')) : null));
    }).catch(() => {});
    api('documentos.assinaturas', { cliente_id: c.id }).then(l => {
      const b = blocoAssinaturas(l, '✍ Documentos aguardando assinatura');
      if (b) assinBox.replaceChildren(b);
      else assinBox.replaceChildren(h('p', { class: 'peq acoes-sec' }, 'Fez procuração ou contrato fora do painel e o cliente ainda não assinou? ',
        botao('Marcar "aguardando assinatura"', async ev => { ev.target.disabled = true; try { await api('documentos.assinatura', { acao: 'criar', cliente_id: c.id }); avisar('Marcado. Em 7 dias sem assinatura o painel lembra.'); rota(); } catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'mini sec')));
    }).catch(() => {});
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, c.nome),
        h('p', {}, etiquetaSituacao(c.situacao), r.processos.length ? ` · ${r.processos.length} processo${r.processos.length === 1 ? '' : 's'}` : ''),
        seloJornada(r.jornada), seloParcelas(r.parcelas, c.id), seloFunil(r.lead, c)),
        h('div', { class: 'barra' }, sessao.usuario.pode.usuarios && (incompleto || faltam.length) && window.GESTAO && window.GESTAO.mandarLinkCadastro
            ? h('button', { type: 'button', class: 'btn sec', title: 'O cliente preenche o cadastro pelo celular', onclick: () => window.GESTAO.mandarLinkCadastro(r.lead ? { id: r.lead.id } : { cliente_id: c.id }, () => apiFresco('clientes.obter', { id: c.id }).catch(() => {})) }, '📝 Pedir o cadastro ao cliente') : null,
          h('button', { type: 'button', class: 'btn sec', onclick: () => { if (fichaEmAbas.abrir) fichaEmAbas.abrir('cadastro'); const d = document.querySelector('.ficha-abas'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, '✎ Editar cadastro'),
          r.processos.length ? h('button', { type: 'button', class: 'btn sec', title: 'O mesmo cliente pode ter várias ações: abre outra Petição inicial sem novo cadastro', onclick: () => caixaAbrirAcao(c, true) }, '＋ Nova ação') : null,
          h('a', { class: 'btn', href: '#/modelos?cliente=' + encodeURIComponent(c.id) }, 'Gerar documentos'))),
      incompleto ? h('div', { class: 'nota alerta' }, 'Cadastro incompleto: confira CPF, RG, profissão e endereço antes de gerar procuração ou contrato. Ao terminar, mude "Cadastro" para Completo.')
        : faltam.length ? h('div', { class: 'nota' }, 'Falta no cadastro: ', h('strong', {}, faltam.join(', ')), '. Complete em "Editar cadastro" antes de gerar procuração ou contrato.') : null,
      r.processos.length ? null : h('div', { class: 'nota faixa-atend' },
        h('div', {}, 'Este cliente ainda não tem processo. ',
          'Quando contratar, ele vai para Processos › ', h('strong', {}, 'Petição inicial'), ' e a tarefa vai para quem faz as iniciais.'),
        botao('Cliente contratou: abrir ação', () => caixaAbrirAcao(c), '')),
      // 8.25 (pedido da usuária: ficha comprida demais): FICHA EM ABAS — Resumo · Processos · Cobranças · Anotações · Documentos · Cadastro
      fichaEmAbas(c.id, [
        ['resumo', 'Resumo', () => h('div', {}, jornada, assinBox, descricao)],
        ['processos', `Processos (${r.processos.length})`, procs],
        sessao.usuario.pode.financeiro ? ['cobrancas', 'Cobranças', hons] : null,
        ['anotacoes', 'Anotações', notas],
        ['documentos', 'Documentos e portal', () => h('div', {}, secao('Pasta do cliente', pasta, true), secao('Portal do cliente (documentos no site)', portal, false), secao('Acesso do cliente ao site (acompanhar processo)', () => caixaAcesso(c), false))],
        ['cadastro', 'Cadastro', () => h('div', { class: 'caixa editar-cad' }, formCliente(c, false))]
      ], incompleto ? 'cadastro' : ''));
  }

  /** 8.25: abas da ficha do cliente. Cada aba só monta o conteúdo quando é aberta; lembra a última aba na sessão (por cliente). */
  function fichaEmAbas(id, abas, inicial) {
    abas = abas.filter(Boolean);
    let salva = ''; try { salva = sessionStorage.getItem('ficha_aba_' + id) || ''; } catch (e) { /* ok */ }
    let atual = inicial || (abas.some(a => a[0] === salva) ? salva : 'resumo');
    const corpo = h('div', { class: 'ficha-corpo', role: 'tabpanel' });
    const feitos = {};
    const barra = h('div', { class: 'ficha-abas', role: 'tablist' });
    const abrir = qual => {
      atual = qual; try { sessionStorage.setItem('ficha_aba_' + id, qual); } catch (e) { /* ok */ }
      barra.querySelectorAll('button').forEach(b => { const on = b.dataset.aba === qual; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      const a = abas.find(x => x[0] === qual) || abas[0];
      if (!feitos[a[0]]) feitos[a[0]] = typeof a[2] === 'function' ? a[2]() : a[2];
      corpo.replaceChildren(feitos[a[0]]);
    };
    barra.append(...abas.map(a => h('button', { type: 'button', role: 'tab', 'data-aba': a[0], onclick: () => abrir(a[0]) }, a[1])));
    fichaEmAbas.abrir = abrir;
    const el = h('div', { class: 'ficha-abas-caixa' }, barra, corpo);
    abrir(atual);
    return el;
  }

  /* ---------- processos ---------- */

  // Etapas do processo, na ordem em que acontecem
  const FASES = { contratado: 'Petição inicial', ajuizado: 'Ajuizado (citação)', conciliacao: 'Audiência de conciliação', andamento: 'Em andamento (defesa e réplica)',
    pericia: 'Perícia', instrucao: 'Audiência de instrução', sentenca: 'Sentença', acordo: 'Acordo', homologacao: 'Homologação', recurso: 'Recurso',
    execucao: 'Execução / cumprimento', extinto: 'Encerrado / arquivado' };
  // colunas do quadro (Acordo e Homologação ficam juntos)
  const COLUNAS_PROC = [['contratado', ['contratado']], ['ajuizado', ['ajuizado']], ['conciliacao', ['conciliacao']], ['andamento', ['andamento']],
    ['pericia', ['pericia']], ['instrucao', ['instrucao']], ['sentenca', ['sentenca']], ['acordo', ['acordo', 'homologacao']], ['recurso', ['recurso']],
    ['execucao', ['execucao']], ['extinto', ['extinto']]];
  const NOME_COLUNA = { acordo: 'Acordo / homologação' };
  function etiquetaFase(f) { return f ? h('span', { class: 'tag fase fase-' + f }, FASES[f] || f) : '—'; }

  /** Mensagem pronta para avisar o cliente do processo (opcional: com um código novo de acesso ao site). */
  function whatsProcesso(p, cliente, codigo, jaTem) {
    let tel = telefoneWhats((cliente && cliente.telefone) || '');
    if (!tel) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String((cliente && cliente.nome) || '').split(' ')[0]);
    const site = 'https://araujoadvocaciasc.com.br/acompanhe/';
    const corpo = p.numero
      ? `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Informamos que sua ação foi protocolada na Justiça: processo nº ${p.numero}${p.orgao ? ' (' + p.orgao + ')' : ''}. Vamos acompanhar cada passo e avisar você das novidades.`
      : `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Recebemos sua procuração e o contrato. Já estamos preparando a sua ação e avisaremos assim que ela for protocolada.`;
    const acomp = codigo ? `\n\nVocê também pode acompanhar pelo nosso site: ${site}\nDigite seu CPF e este código: ${codigo} (guarde e não compartilhe).`
      : jaTem ? `\n\nVocê também pode acompanhar pelo nosso site: ${site} com o seu CPF e o código de acesso que já enviamos (se perdeu, é só pedir).`
      : `\n\nVocê também pode acompanhar pelo nosso site: ${site} (se ainda não tem o código de acesso, é só pedir para nós).`;
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(corpo + acomp);
  }
  /** Campo do número do processo na janela "Quem fez a petição inicial?". */
  function campoNumeroInicial() {
    const inp = h('input', { id: 'f-num-inicial', inputmode: 'numeric', maxlength: 25, placeholder: '0000000-00.0000.0.00.0000 (deixe vazio se ainda não saiu)' });
    const el = h('div', { class: 'campo-inicial' }, h('label', { for: 'f-num-inicial' }, 'Número do processo (se já protocolou)'), inp,
      h('p', { class: 'peq' }, 'Com o número, o processo vai para "Em andamento". Sem ele, vai para "Ajuizado" até o número sair.'));
    el.valor = () => inp.value.trim();
    return el;
  }

  /** 8.11: "Não vai fechar" — o cliente desistiu (mesmo se alguém marcou "Assinado" por engano). Arquiva a inicial sem número,
   *  cancela a tarefa e tira do Financeiro o honorário lançado ao assinar (só parcelas não pagas). */
  function botaoNaoFechou(p, cls) {
    return h('button', { type: 'button', class: 'btn mini ' + (cls || 'sec'), title: 'O cliente não vai fechar: arquiva esta petição inicial e cancela o honorário lançado', onclick: async ev => {
      ev.stopPropagation();
      const motivo = prompt(`${p.cliente_nome || 'Cliente'} não vai fechar?\n\nA petição inicial é arquivada, a tarefa da inicial é cancelada e o honorário lançado ao assinar sai do Financeiro (parcelas já pagas não são mexidas).\n\nMotivo (opcional):`, 'cliente desistiu');
      if (motivo === null) return;
      ev.target.disabled = true;
      try {
        const r = await api('processos.naoFechou', { id: p.id, motivo });
        avisar('Pronto: não fechou.' + (r.honorarios ? ` ${r.honorarios} honorário(s) e ${r.parcelas} parcela(s) saíram do Financeiro.` : ''));
        if (location.hash.startsWith('#/processo/')) location.hash = '#/processos'; else rota();
      } catch (e) { avisar(e.message, true); ev.target.disabled = false; }
    } }, 'Não vai fechar');
  }

  /** Processo "a ajuizar": 1) avisar o cliente no WhatsApp; 2) Conferido (quem fez a inicial e, se já tiver, o número). */
  function caixaPeticaoInicial(p, cliente) {
    // 8.11.2 (pedido da usuária): primeiro a petição inicial vai para o CLIENTE ler e aprovar; depois de mandar no WhatsApp,
    // o "✓ Conferido" aparece junto, no mesmo passo (quem fez a inicial e, se já protocolou, o número)
    const msgFeita = (() => {
      const tel = telefoneWhats(cliente && cliente.telefone); if (!tel) return null;
      const nome = nomeProprioJS(String(cliente.nome || '').split(' ')[0]);
      return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(`Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Sua petição inicial ficou pronta e vou te enviar o arquivo logo abaixo para você ler com calma. ` +
        `Veja se está tudo certo, se ficou alguma informação de fora ou se você quer mudar alguma coisa. Assim que você aprovar, damos entrada no processo e te mandamos o número para acompanhar pelo site: https://araujoadvocaciasc.com.br/acompanhe/`);
    })();
    const conferido = botaoConferido('inicial', p.id, 'Quem fez a petição inicial?', campoNumeroInicial, '✓ Conferido');
    let enviado = false; try { enviado = sessionStorage.getItem('inicial_wa_' + p.id) === '1'; } catch (e) { /* segue */ }
    const lugarConf = h('span', { class: 'inicial-conf' }, enviado || !msgFeita ? conferido : null);
    const wa = msgFeita ? h('a', { class: 'btn mini wa', href: msgFeita, target: '_blank', rel: 'noopener noreferrer', onclick: () => {
      registrarWhats({ numero: p.numero, cliente: cliente && cliente.nome }, 'petição inicial para o cliente aprovar');
      try { sessionStorage.setItem('inicial_wa_' + p.id, '1'); } catch (e) { /* segue */ }
      setTimeout(() => { lugarConf.replaceChildren(conferido); lugarConf.classList.add('aparece'); }, 300);
    } }, 'WhatsApp: mandar a inicial ao cliente') : h('span', { class: 'peq' }, 'Cliente sem telefone');
    return h('section', { class: 'caixa inicial-caixa destaque-caixa' },
      h('div', { class: 'inicial-cab' }, h('span', { class: 'inicial-ico', 'aria-hidden': 'true' }, '⚖'),
        h('div', { class: 'inicial-tit' }, h('h2', {}, 'Petição inicial'), h('p', { class: 'peq' }, p.responsavel ? 'Responsável: ' + (p.responsavel === sessao.usuario.usuario ? 'você' : p.responsavel) + ' · está nas Tarefas dessa pessoa' : 'Ninguém pegou ainda. Aperte "Eu faço" para ir para as suas Tarefas.')),
        h('div', { class: 'barra' }, botoesEuFaco('inicial', p.id, ''), botaoNaoFechou(p))),
      h('ol', { class: 'passos-inicial' },
        h('li', {}, h('span', { class: 'passo-n' }, '1'),
          h('div', {}, h('strong', {}, 'Mande a inicial para o cliente aprovar'), h('div', { class: 'peq' }, 'A mensagem diz que a petição está pronta e pede para ver se está certa ou se quer mudar algo. Anexe o arquivo no WhatsApp. Depois de mandar, o "✓ Conferido" aparece aqui do lado.')),
          h('div', { class: 'barra inicial-acoes' }, wa, lugarConf))));
  }

  /** 8.11: o código do Acompanhe gerado ao protocolar só existe nesta aba (o servidor guarda embaralhado). */
  const PROTOCOLOS = {};
  function guardarProtocolo(id, r) { PROTOCOLOS[id] = r; }
  function caixaAvisarCliente(p, cliente, novo) {
    const saida = h('div', { class: 'barra' });
    const prot = PROTOCOLOS[p.id] || null;
    const desenhar = cod => { const l = whatsProcesso(p, cliente, cod, prot && prot.ja_tinha_codigo); saida.replaceChildren(l ? h('a', { class: 'btn wa', href: l, target: '_blank', rel: 'noopener noreferrer', onclick: () => registrarWhats({ numero: p.numero, cliente: cliente && cliente.nome }, 'processo protocolado') }, 'Informar o cliente no WhatsApp') : h('span', { class: 'peq' }, 'Cliente sem telefone no cadastro.')); };
    desenhar(prot && prot.codigo || '');
    const notaProt = prot ? h('div', { class: 'nota' }, prot.codigo ? h('span', {}, 'Código do "Acompanhe seu processo" gerado agora: ', h('strong', { class: 'num' }, prot.codigo), ' — já está na mensagem. Ele não aparece de novo.')
      : prot.ja_tinha_codigo ? 'O cliente já tinha código de acesso ao site: a mensagem pede para usar o mesmo (se perdeu, marque "Incluir código" para gerar outro).'
      : prot.sem_cpf ? 'Sem CPF no cadastro: o código do site não foi gerado. Complete o CPF e marque "Incluir código de acesso ao site".' : prot.erro_codigo ? 'Código não gerado: ' + prot.erro_codigo : null,
      prot.andamentos ? h('div', { class: 'peq' }, `Andamentos lidos no DataJud: ${prot.andamentos}.`) : h('div', { class: 'peq' }, 'Processo novo costuma levar alguns dias para aparecer no DataJud; o robô confere de 4 em 4 horas.')) : null;
    const comCodigo = cliente && cliente.telefone ? h('label', { class: 'marcar' }, h('input', { type: 'checkbox', onchange: async ev => {
      if (!ev.target.checked) { desenhar(''); return; }
      if (!confirm('Gerar um código novo de acesso ao site? Se o cliente já tinha um, o antigo deixa de valer.')) { ev.target.checked = false; return; }
      try { const r = await api('clientes.acesso', { id: cliente.id, acao: 'gerar' }); desenhar(r.codigo); avisar('Código gerado e colocado na mensagem.'); }
      catch (e) { ev.target.checked = false; avisar(e.message, true); }
    } }), 'Incluir código de acesso ao site') : null;
    return h('section', { class: 'caixa avisar-cliente' + (novo ? ' destaque-caixa' : '') },
      h('h2', {}, novo ? '✓ Processo salvo. Avise o cliente' : 'Avisar o cliente'),
      h('p', { class: 'peq' }, 'Abre o WhatsApp com a mensagem pronta, com o número do processo e o link do "Acompanhe seu processo".'),
      notaProt, saida, prot && prot.codigo ? null : comCodigo);
  }

  async function telaProcessos(params) {
    carregando();
    const busca = params.get('busca') || '';
    const semCliente = params.get('semcliente') === '1';
    const area = params.get('area') || '';
    // 8.11.2 (pedido da usuária: "tirar os que desistiram"): abre só com os processos EM ANDAMENTO; arquivados, "não fechou" e
    // desistências ficam em Situação › Arquivados / Todos
    const sit = params.get('sit') || 'ativo';
    const trib = params.get('trib') || '';
    const cli = params.get('cli') || '';
    const ato = params.get('ato') === '1';
    const fase = params.get('fase') || '';
    const visao = params.get('visao') === 'lista' ? 'lista' : params.get('visao') === 'quadro' ? 'quadro' : params.get('fase') ? 'lista' : (localStorageGet('proc_visao') || 'quadro');
    lembrarVisao('processos');
    const [todosSit, nClientes] = await Promise.all([api('processos.listar', { busca, semCliente }), api('clientes.listar', {}).then(l => l.length).catch(() => 0)]);
    const totalProc = busca || semCliente ? (await api('processos.listar', {}).catch(() => todosSit)).length : todosSit.length;
    const nAtivos = todosSit.filter(p => p.status !== 'arquivado').length, nArq = todosSit.length - nAtivos;
    const tribunais = [...new Set(todosSit.map(p => p.tribunal || '—'))].sort();
    const todos = todosSit
      .filter(p => sit === 'todos' || (p.status === 'arquivado') === (sit === 'arquivado'))
      .filter(p => !trib || (p.tribunal || '—') === trib)
      .filter(p => !cli || (cli === 'com' ? !!p.cliente_id : !p.cliente_id))
      .filter(p => !ato || (p.proximo_ato_data && p.proximo_ato_data >= hojeISO()));
    const nomeArea = p => p.area || 'Sem área';
    const porFase = {};
    todos.forEach(p => { porFase[p.fase] = (porFase[p.fase] || 0) + 1; });
    const lista = (area ? todos.filter(p => nomeArea(p) === area) : todos).filter(p => !fase || p.fase === fase);
    const porFaseArea = {};
    todos.filter(p => !area || nomeArea(p) === area).forEach(p => { porFaseArea[p.fase] = (porFaseArea[p.fase] || 0) + 1; });
    const porArea = {}, porTrib = {};
    todos.forEach(p => { porArea[nomeArea(p)] = (porArea[nomeArea(p)] || 0) + 1; const t = p.tribunal || '—'; porTrib[t] = (porTrib[t] || 0) + 1; });
    const ordemAreas = ['Trabalhista', 'Cível', 'Previdenciário', 'Federal', 'Empresarial', 'Família', 'Criminal', 'Consumidor', 'Cobrança de honorários'];
    const areas = Object.keys(porArea).sort((a, b) => ((ordemAreas.indexOf(a) + 1) || 99) - ((ordemAreas.indexOf(b) + 1) || 99));
    const ir = mud => {
      const q = new URLSearchParams({ busca, area, fase, visao, sit: sit === 'ativo' ? '' : sit, trib, cli, ato: ato ? '1' : '', semcliente: semCliente ? '1' : '', ...mud });
      [...q.keys()].forEach(k => { if (!q.get(k)) q.delete(k); });
      location.hash = '#/processos' + (q.toString() ? '?' + q : '');
    };
    const corEt = el => { if (el.dataset.cor) el.style.setProperty('--cor-et', el.dataset.cor); return el; };
    const etapasProc = h('div', {},
      h('div', { class: 'secao-tit' }, h('h2', {}, 'Etapas'), h('span', { class: 'peq' }, visao === 'quadro' ? 'Arraste entre as etapas' : 'Clique numa etapa para filtrar'),
        h('div', { class: 'alternar', role: 'group', 'aria-label': 'Ver como' },
          h('button', { type: 'button', class: visao === 'quadro' ? 'ativo' : '', 'aria-pressed': String(visao === 'quadro'), onclick: () => { localStorageSet('proc_visao', 'quadro'); ir({ visao: 'quadro', fase: '' }); } }, 'Quadro por etapa'),
          h('button', { type: 'button', class: visao === 'lista' ? 'ativo' : '', 'aria-pressed': String(visao === 'lista'), onclick: () => { localStorageSet('proc_visao', 'lista'); ir({ visao: 'lista' }); } }, 'Lista'))),
      visao === 'quadro' ? h('p', { class: 'peq quadro-dica' }, 'Arraste o cartão para a próxima etapa (ou use a seta →). Audiência e perícia marcadas pelo robô, petição inicial conferida e audiência de conciliação concluída mudam a etapa sozinhas.') : null,
      visao === 'quadro' ? null :
      h('div', { class: 'etapas-cli etapas-proc', role: 'group', 'aria-label': 'Etapas' },
        h('button', { type: 'button', class: 'etapa-card todas' + (!fase ? ' ativo' : ''), onclick: () => ir({ fase: '' }) },
          h('span', { class: 'etapa-n' }, String(todos.filter(p => !area || nomeArea(p) === area).length)), h('span', { class: 'etapa-nome' }, 'Todas')),
        Object.keys(FASES).map(f => corEt(h('button', { type: 'button', 'data-cor': CORES_FASE[f] || '', class: 'etapa-card' + (fase === f ? ' ativo' : ''), onclick: () => ir({ fase: fase === f ? '' : f }) },
          h('span', { class: 'etapa-n' }, String(porFaseArea[f] || 0)), h('span', { class: 'etapa-nome' }, FASES[f]))))));
    const moverFase = async (p, f, el) => {
      if (el) el.classList.add('movendo');
      try { const r2 = await api('processos.fase', { id: p.id, fase: f }); avisar('Etapa: ' + (r2.nome || FASES[f])); rota(); }
      catch (e) { avisar(e.message, true); if (el) el.classList.remove('movendo'); }
    };
    const ordemCol = COLUNAS_PROC.map(c => c[0]);
    const colDe = f => (COLUNAS_PROC.find(c => c[1].includes(f)) || ['andamento'])[0];
    const quadroProc = h('div', { class: 'quadro-cli quadro-proc' }, COLUNAS_PROC.map(([col, fasesCol]) => {
      const daFase = lista.filter(p => fasesCol.includes(p.fase || 'andamento'))
        .sort((a, b) => ((a.proximo_ato_data || '9999') < (b.proximo_ato_data || '9999') ? -1 : 1));
      const sec = corEt(h('section', { class: 'coluna-cli', 'data-cor': CORES_FASE[col] || '', 'data-fase': col,
        ondragover: ev => { ev.preventDefault(); sec.classList.add('sobre'); }, ondragleave: () => sec.classList.remove('sobre'),
        ondrop: ev => { ev.preventDefault(); sec.classList.remove('sobre'); const id = ev.dataTransfer.getData('text/plain'); const p = lista.find(x => x.id === id); if (p && colDe(p.fase) !== col) moverFase(p, col); } },
        h('h2', {}, h('span', {}, NOME_COLUNA[col] || FASES[col]), h('span', { class: 'seg-n' }, String(daFase.length))),
        daFase.slice(0, 40).map(p => {
          const i = ordemCol.indexOf(col);
          const card = h('article', { class: 'cartao-cli cartao-proc', draggable: 'true', tabindex: 0,
            ondragstart: ev => { ev.dataTransfer.setData('text/plain', p.id); card.classList.add('arrastando'); }, ondragend: () => card.classList.remove('arrastando'),
            onclick: () => { location.hash = '#/processo/' + p.id; }, onkeydown: ev => { if (ev.key === 'Enter') card.click(); } },
            h('strong', {}, p.cliente_id ? p.cliente_nome : (p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome : 'Cliente a identificar')),
            h('span', { class: 'peq num' }, p.numero || '(a ajuizar)'),
            h('span', { class: 'peq' }, [p.area, p.tribunal].filter(Boolean).join(' · ') || '—'),
            p.responsavel ? h('span', { class: 'peq' }, '👤 ' + p.responsavel) : null,
            p.proximo_ato_data && p.proximo_ato_data >= hojeISO() ? h('span', { class: 'cartao-ato' }, atoComData(p.proximo_ato || 'Próximo ato', p.proximo_ato_data), ' ', etiquetaDias(p.proximo_ato_data)) : null,
            h('div', { class: 'cartao-proc-pe', onclick: ev => ev.stopPropagation() },
              i > 0 ? h('button', { type: 'button', class: 'btn mini sec', title: 'Voltar para ' + (NOME_COLUNA[ordemCol[i - 1]] || FASES[ordemCol[i - 1]]), onclick: () => moverFase(p, ordemCol[i - 1], card) }, '←') : h('span'),
              col === 'contratado' ? h('span', { class: 'barra' }, botaoNaoFechou(p), botaoConferido('inicial', p.id, 'Quem fez a petição inicial?', campoNumeroInicial, 'Inicial feita →'))
                : i < ordemCol.length - 1 ? h('button', { type: 'button', class: 'btn mini', title: 'Concluir etapa e passar para ' + (NOME_COLUNA[ordemCol[i + 1]] || FASES[ordemCol[i + 1]]), onclick: () => moverFase(p, ordemCol[i + 1], card) }, 'Concluir etapa →') : null));
          return card;
        }),
        daFase.length > 40 ? h('a', { class: 'peq', href: '#/processos?visao=lista&fase=' + col }, `+ ${daFase.length - 40} — ver na lista`) : null,
        !daFase.length ? h('p', { class: 'peq vazio-t' }, 'Arraste um processo para cá.') : null));
      return sec;
    }));
    const filtrosProc = h('div', { class: 'filtros-proc' },
        h('label', {}, 'Situação', h('select', { onchange: e => ir({ sit: e.target.value === 'ativo' ? '' : e.target.value, area: '' }) },
          [['todos', `Todos (${todosSit.length})`], ['ativo', `Em andamento (${nAtivos})`], ['arquivado', `Arquivados / baixados (${nArq})`]].map(([v, t]) => h('option', { value: v, selected: sit === v }, t)))),
        h('label', {}, 'Área', h('select', { onchange: e => ir({ area: e.target.value }) },
          h('option', { value: '' }, `Todas (${todos.length})`), areas.map(a => h('option', { value: a, selected: area === a }, `${a} (${porArea[a]})`)))),
        h('label', {}, 'Tribunal', h('select', { onchange: e => ir({ trib: e.target.value, area: '' }) },
          h('option', { value: '' }, 'Todos'), tribunais.map(t => h('option', { value: t, selected: trib === t }, t)))),
        h('label', {}, 'Cliente', h('select', { onchange: e => ir({ cli: e.target.value }) },
          [['', 'Todos'], ['com', 'Com cliente cadastrado'], ['sem', 'Sem cliente (a identificar)']].map(([v, t]) => h('option', { value: v, selected: cli === v }, t)))),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: ato, onchange: e => ir({ ato: e.target.checked ? '1' : '' }) }), 'Só com audiência/ato marcado'),
        (sit !== 'todos' || trib || cli || ato || area || busca || fase) ? h('button', { type: 'button', class: 'link escuro', onclick: () => { location.hash = '#/processos'; } }, 'Limpar filtros') : null);
    const principal = h('div', { class: 'col-principal' },
      etapasProc,
      visao === 'quadro' ? comSetas(quadroProc) : compacta(tabela(['Processo', 'Fase', 'Cliente', 'Tribunal', 'Órgão', 'Próximo ato'], lista, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(a ajuizar)', p.status === 'arquivado' ? h('span', { class: 'tag mini-tag' }, 'arquivado') : null, h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Fase' }, etiquetaFase(p.fase), p.responsavel ? h('div', { class: 'peq' }, '👤 ' + p.responsavel) : null),
        h('td', { 'data-r': 'Cliente' }, p.cliente_id ? p.cliente_nome : h('span', { class: 'tag atencao' }, p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome + ' (sem cadastro)' : 'a identificar')),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal, p.sistema ? h('span', { class: 'peq' }, ' · ' + p.sistema) : null),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato
          ? h('div', { class: 'ato-linha' }, h('span', {}, atoComData(p.proximo_ato, p.proximo_ato_data)), p.proximo_ato_data ? etiquetaDias(p.proximo_ato_data) : null)
          : h('span', { class: 'peq' }, p.ultimo_movimento_em ? 'últ. mov. ' + new Date(p.ultimo_movimento_em).toLocaleDateString('pt-BR') : '—'))
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo encontrado.')));
    mostrar(
      ...cabCarteira('processos', { busca, ir, filtros: filtrosProc, nCli: nClientes, nProc: totalProc, nAjuizar: todosSit.filter(p => p.fase === 'contratado' && p.status !== 'arquivado').length }),
      h('p', { class: 'peq contagem-lista' }, `${lista.length} processo${lista.length === 1 ? '' : 's'}${area ? ' em ' + area : ''} · ${sit === 'arquivado' ? 'arquivados ou baixados' : sit === 'todos' ? 'em andamento e arquivados' : 'em andamento'}${trib ? ' · ' + trib : ''}${busca ? ' · busca "' + busca + '"' : ''}`),
      principal);
    document.querySelectorAll('.barrinha').forEach(el => { el.style.setProperty('--w', el.dataset.w + '%'); });
  }

  async function telaProcesso(id, params) {
    carregando();
    const novo = id === 'novo';
    const [clientes, lista, equipe] = await Promise.all([api('clientes.listar', {}), novo ? Promise.resolve([]) : api('processos.listar', {}), api('tarefas.listar', {}).then(t => t.usuarios || []).catch(() => [])]);
    let p = novo ? { cliente_id: params.get('cliente') || '', status: 'ativo' } : lista.find(x => x.id === id);
    if (!p) p = (await apiFresco('processos.listar', {})).find(x => x.id === id); // recém-criado: ainda não estava na memória
    if (!p) throw new Error('Processo não encontrado.');
    // cliente cadastrado agora (por outra pessoa ou noutra aba) ainda fora da lista guardada: busca na hora
    if (p.cliente_id && !clientes.some(c => c.id === p.cliente_id)) {
      const r = await api('clientes.obter', { id: p.cliente_id }).catch(() => null);
      if (r && r.cliente) clientes.push(r.cliente);
    }
    const opcoesCliente = [['', '— cliente a identificar —']].concat(clientes.map(c => [c.id, c.nome + (c.cpf_cnpj ? ' · ' + c.cpf_cnpj : '')]));
    const form = h('form', { class: 'caixa', novalidate: true },
      h('div', { class: 'campos' },
        campo('cliente_id', 'Cliente', p.cliente_id, { opcoes: opcoesCliente, largo: true }),
        campo('numero', 'Número (padrão CNJ)', p.numero, { dica: '0000000-00.0000.0.00.0000', max: 25 }),
        campo('tribunal', 'Tribunal', p.tribunal, { dica: 'preenchido pelo número', max: 40 }),
        campo('sistema', 'Sistema', p.sistema, { opcoes: [['', '—'], ['PJe', 'PJe'], ['eproc', 'eproc'], ['outro', 'Outro']] }),
        campo('orgao', 'Vara / juízo', p.orgao, { max: 120 }),
        campo('area', 'Área', p.area, { opcoes: AREAS.some(a => a[0] === (p.area || '')) ? AREAS : AREAS.concat([[p.area, p.area]]) }),
        campo('polo', 'Nosso cliente é', p.polo, { opcoes: [['', '—'], ['ativo', 'Autor / reclamante'], ['passivo', 'Réu / reclamado']] }),
        campo('parte_contraria', 'Parte contrária', p.parte_contraria, { max: 200 }),
        campo('proximo_ato', 'Próximo ato', p.proximo_ato, { max: 200, dica: 'Ex.: Audiência de instrução 10h' }),
        campo('proximo_ato_data', 'Data do próximo ato', p.proximo_ato_data, { tipo: 'date' }),
        campo('status', 'Situação', p.status || 'ativo', { opcoes: [['ativo', 'Ativo'], ['suspenso', 'Suspenso'], ['arquivado', 'Arquivado']] }),
        campo('responsavel', p.fase === 'contratado' || (novo && !p.numero) ? 'Responsável (quem faz a petição inicial)' : 'Responsável', p.responsavel || '', { opcoes: [['', '— ninguém —']].concat(equipe.map(u => [u.usuario, u.nome])).concat(p.responsavel && !equipe.some(u => u.usuario === p.responsavel) ? [[p.responsavel, p.responsavel]] : []) }),
        campo('fase', 'Fase' + (p.fase_auto === 'nao' ? ' (escolhida à mão)' : ' (muda sozinha com as movimentações)'), p.fase || (novo ? '' : 'andamento'), { opcoes: [['', novo ? 'Automática (ajuizado se tiver número)' : '—']].concat(Object.entries(FASES)) }),
        campo('observacoes', 'Observações', p.observacoes, { area: true, largo: true })),
      h('div', { class: 'acoes' },
        h('button', { type: 'submit', class: 'btn' }, novo ? 'Cadastrar processo' : 'Salvar'),
        h('a', { class: 'btn sec', href: p.cliente_id ? '#/cliente/' + p.cliente_id : '#/processos' }, 'Voltar')),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      const dados = Object.fromEntries(fd.entries());
      if (!novo) dados.id = p.id;
      dados.cliente_nome = dados.cliente_id ? '' : 'a identificar';
      const res = await api('processos.salvar', { processo: dados });
      if (res.protocolado) guardarProtocolo(res.id, res);
      avisar(novo ? 'Processo cadastrado.' : 'Alterações salvas.');
      location.hash = '#/processo/' + res.id + (novo || (!p.numero && dados.numero) ? '?avisar=1' : '');
      if (!novo) telaProcesso(res.id, new URLSearchParams());
    });
    let prazosProc = null;
    if (!novo) {
      const lp = await api('prazos.listar', { processo_id: p.id, encerrados: true });
      prazosProc = h('div', {}, h('div', { class: 'cab' }, h('h2', {}, 'Prazos deste processo'), botao('Novo prazo', () => { location.hash = '#/prazo/novo?processo=' + p.id; }, 'sec')),
        tabelaPrazos(lp, 'Nenhum prazo lançado.'));
    }
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, novo ? 'Novo processo' : (p.numero || 'Processo sem número')),
        novo ? null : h('p', {}, p.cliente_id ? p.cliente_nome : 'Cliente a identificar', p.origem ? ` · origem: ${p.origem}` : '', ' · ', acessoTribunal(p.numero)))),
      !novo && p.cliente_id ? notasDoCliente(p.cliente_id) : null,
      !novo && p.numero && !cnjValido(p.numero) ? h('div', { class: 'nota alerta' }, h('strong', {}, '⚠ Número com o dígito verificador errado. '),
        'Os 2 números depois do traço não batem com o resto: o PJe/eproc e o DataJud não acham este processo. Confira o número certo no tribunal e corrija em "Editar".') : null,
      !novo && (p.proximo_ato || p.ultimo_movimento) ? h('section', { class: 'caixa resumo-proc' },
        p.proximo_ato ? h('p', {}, h('strong', {}, 'Próximo ato: '), atoComData(p.proximo_ato, p.proximo_ato_data), ' ', p.proximo_ato_data ? etiquetaDias(p.proximo_ato_data) : '') : null,
        p.ultimo_movimento ? h('p', {}, h('strong', {}, 'Última movimentação'), p.ultimo_movimento_em ? ` (${new Date(p.ultimo_movimento_em).toLocaleDateString('pt-BR')})` : '', ': ', p.ultimo_movimento) : null) : null,
      !novo && p.fase === 'contratado' ? caixaPeticaoInicial(p, clientes.find(c => c.id === p.cliente_id)) : null,
      !novo && p.cliente_id && p.fase !== 'contratado' ? caixaAvisarCliente(p, clientes.find(c => c.id === p.cliente_id), params.get('avisar') === '1') : null,
      novo ? null : blocoFluxo(p), novo ? null : blocoResumoIA(p), novo ? null : blocoAndamentos(p), novo ? null : blocoLinhaTempo(p), prazosProc, form);
  }
  /** 8.22: checklist da etapa atual (fluxo por tipo de ação). Marcar aqui marca na tarefa do fluxo. */
  function blocoFluxo(p) {
    const box = h('section', { class: 'caixa fluxo-caixa', hidden: true });
    api('fluxos.processo', { id: p.id }).then(r => {
      if (!r.itens.length) return;
      box.hidden = false;
      const ck = r.tarefa ? r.tarefa.checklist : r.itens.map(t => ({ t, ok: false }));
      const feitos = ck.filter(x => x.ok).length;
      box.replaceChildren(h('h2', {}, `📋 Checklist da etapa: ${r.fase_nome}`),
        h('p', { class: 'peq' }, (r.area === 'geral' ? 'Fluxo geral' : 'Fluxo ' + r.area) + ` · ${feitos} de ${ck.length} feitos` + (r.tarefa ? '' : ' · a tarefa com este checklist é criada pelo robô na próxima rodada')),
        h('ul', { class: 'fluxo-lista' }, ck.map((x, i) => h('li', {}, h('label', {}, h('input', { type: 'checkbox', checked: !!x.ok, disabled: !r.tarefa,
          onchange: async ev => { try { await api('tarefas.check', { id: r.tarefa.id, i, ok: ev.target.checked }); } catch (e) { ev.target.checked = !ev.target.checked; avisar(e.message, true); } } }), ' ', x.t)))),
        r.tarefa ? h('a', { class: 'more', href: '#/tarefas?q=' + encodeURIComponent(r.tarefa.titulo) }, 'Abrir a tarefa') : null);
    }).catch(() => {});
    return box;
  }

  /* ---------- usuários ---------- */

  const PERFIS = [['rh', 'RH (usa tudo, inclusive o financeiro; não vê Relatórios, Usuários nem os totais a receber)'], ['secretario', 'Secretário (tudo, menos financeiro)'], ['advogada', 'Advogada (tudo, menos financeiro; confere prazos)'], ['estagiario', 'Estagiário (tudo, menos financeiro)'], ['administrador', 'Administrador (tudo)']];

  /** 8.14: assistente do WhatsApp Web (extensão do Chrome): baixar, instalar, ligar com código e desligar aparelhos. */
  /** 8.26: Banco novo (Supabase) — ligar com o endereço e a chave "service_role" (vão só para as Propriedades do Google), testar, copiar agora. */
  function caixaBancoNovo() {
    const caixa = h('section', { class: 'caixa banco-caixa' }, h('h2', {}, '🗄 Banco novo (Supabase)'), h('p', { class: 'peq' }, 'Carregando…'));
    const SQL = n => h('a', { href: 'https://raw.githubusercontent.com/advogadajulianaraujo/site-araujo-advocacia/main/supabase/' + n, target: '_blank', rel: 'noopener noreferrer' }, n);
    const seg = ms => ms === null || ms === undefined ? '—' : (ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
    const NOMES = { 'clientes.listar': 'Clientes', 'processos.listar': 'Processos', 'prazos.listar': 'Intimações e prazos', 'intimacoes.listar': 'Intimações (lista)', 'tarefas.listar': 'Tarefas',
      'eu.painel': 'Início (minha parte)', 'fin.resumo': 'Cobranças', 'fin.honorarios': 'Honorários', 'documentos.assinaturas': 'Aguardando assinatura', 'equipe.listar': 'Equipe', 'clientes.obter': 'Ficha do cliente',
      'trabalho.aguardando': 'Aguardando o seu OK', 'resumo': 'Cartão do robô', 'inicio.acoes': 'Precisa de ação agora', 'inicio.extras': 'Início (audiências, aniversários)', 'fin.pix': 'PIX recebidos',
      'relatorio.cumpridos': 'Prazos cumpridos', 'audiencias.listar': 'Audiências', 'fin.areceber': 'A receber', 'indicadores.mes': 'Indicadores', 'relatorio.semana': 'Semana da equipe',
      'fluxos.processo': 'Checklist da etapa', 'prazos.memoria': 'Conta do prazo', 'feriados.listar': 'Feriados', 'fin.honorario': 'Honorário', 'fin.acaoCobranca': 'Ação de cobrança', 'fin.conferencia': 'Conferir cobranças',
      'agenda.listar': 'Agenda', 'modelos.listar': 'Documentos', 'crm.listar': 'Funil' };
    const porque = m => /CalendarApp/.test(m) ? 'usa o Google Agenda' : /Gmail|Properties|Session|UrlFetch/.test(m) ? 'usa dados do robô no Google' : /gravar/.test(m) ? 'precisou gravar algo' : /negada|coluna|listar:|filtrada|permiss/.test(m) ? 'precisa de dados que este perfil não recebe' : 'precisa do Google';
    const medidor = h('div', {});
    const resumoMedidas = () => {
      const est = BANCO ? BANCO.estado() : null;
      if (!est) return h('p', { class: 'peq' }, 'Este painel não carregou a leitura rápida.');
      const por = {};
      est.medidas.forEach(m => { const x = por[m.acao] = por[m.acao] || { banco: [], google: [], falhou: 0 }; if (m.fonte === 'banco') x.banco.push(m.ms); else if (m.fonte === 'google') x.google.push(m.ms); else x.falhou++; });
      const med = l => l.length ? l.slice().sort((a, b) => a - b)[Math.floor(l.length / 2)] : null;
      const linhas = Object.entries(por).sort((a, b) => (b[1].banco.length + b[1].google.length) - (a[1].banco.length + a[1].google.length)).slice(0, 14);
      return h('div', {},
        h('p', { class: 'nota' }, est.ligado ? h('strong', {}, '⚡ Leitura rápida ligada neste computador') : h('strong', {}, 'Leitura rápida desligada neste computador'),
          est.motivo ? ' · ' + est.motivo : '', est.tabelas.length ? ` · ${est.tabelas.length} tabela(s) na memória desta aba` : ''),
        linhas.length ? h('table', { class: 'tabela compacta mini-tab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tela (desde que abriu o painel)'), h('th', {}, 'Banco novo'), h('th', {}, 'Planilha (Google)'), h('th', {}, 'Voltou p/ planilha'))),
          h('tbody', {}, linhas.map(([a, x]) => h('tr', {}, h('td', {}, NOMES[a] || a), h('td', {}, x.banco.length ? `${seg(med(x.banco))} (${x.banco.length}×)` : '—'),
            h('td', {}, x.google.length ? `${seg(med(x.google))} (${x.google.length}×)` : '—'), h('td', {}, x.falhou ? String(x.falhou) + '×' : '—'))))) : h('p', { class: 'peq' }, 'Ainda sem medidas: use o painel um pouco e volte aqui.'),
        est.fora.length ? h('p', { class: 'peq' }, 'Sempre pela planilha (precisam do Google ou de algo que este perfil não lê): ' + est.fora.map(([a, m]) => (NOMES[a] || a) + ' (' + porque(m) + ')').join(', ')) : null);
    };
    const testar = async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Medindo… (até 2 min)';
      const pode = (sessao.usuario && sessao.usuario.pode) || {};
      const lista = [['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }], ['tarefas.listar', {}], ['eu.painel', {}], ['documentos.assinaturas', {}]];
      if (pode.financeiro) lista.push(['fin.resumo', undefined], ['fin.honorarios', {}]);
      try {
        const r = await BANCO.comparar(lista, (a, d) => chamarUm(a, d));
        medidor.replaceChildren(h('table', { class: 'tabela compacta mini-tab' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Tela'), h('th', {}, 'Banco novo'), h('th', {}, 'Planilha (Google)'), h('th', {}, 'Mais rápido'), h('th', {}, 'Resultado igual?'))),
          h('tbody', {}, r.map(x => h('tr', {}, h('td', {}, NOMES[x.acao] || x.acao), h('td', {}, seg(x.banco)), h('td', {}, seg(x.google)),
            h('td', {}, x.banco && x.google ? (x.google / x.banco).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '×' : '—'),
            h('td', {}, x.igual === true ? h('span', { class: 'tag ok' }, 'igual') : x.igual === false ? h('span', { class: 'tag atencao', title: x.obs }, 'diferente') : '—', x.obs ? h('div', { class: 'peq' }, x.obs) : null))))),
          h('p', { class: 'peq' }, 'A primeira leitura do banco traz as tabelas inteiras; as seguintes só o que mudou. "Diferente" logo depois de uma gravação ou de um minuto virar pode ser só o tempo entre as duas leituras: meça de novo.'));
      } catch (e) { medidor.replaceChildren(h('p', { class: 'erro' }, e.message)); }
      ev.target.disabled = false; ev.target.textContent = '⏱ Medir de novo';
    };
    const desenhar = r => {
      const u = r.ultima;
      const status = r.ligado
        ? h('p', { class: 'nota ' + (u && u.erro ? 'alerta' : '') }, h('strong', {}, '✓ Ligado'), ` · ${r.url}`, u ? ` · última cópia completa ${quando(u.em)}: ${u.copiadas} aba(s) copiada(s), ${u.iguais} sem mudança${u.faltam ? `, ${u.faltam} na próxima rodada` : ''}` : ' · ainda não copiou', u && u.erro ? h('div', {}, '⚠ ' + u.erro) : null,
          r.pendente ? h('div', {}, '⚠ Alguma mudança ainda não chegou ao banco (o painel lê da planilha até chegar): ' + r.pendente) : null)
        : h('p', { class: 'nota' }, 'Desligado. A planilha continua sendo o banco do painel. Ligando aqui, o painel passa a copiar a planilha para o Supabase de 30 em 30 minutos (só o que mudou). A senha dos usuários nunca sai do Google.');
      const passo2 = !r.ligado ? null : h('div', { class: 'nota' }, h('strong', {}, 'Leitura rápida: '),
        !r.rpc ? h('span', {}, 'falta rodar o arquivo ', SQL('leitura-rapida.sql'), ' no Supabase › SQL Editor › New query › colar › Run (uma vez).')
          : !r.publica ? 'falta colar a chave pública (publishable/anon) aqui embaixo.'
            : r.leitura ? h('span', {}, '✓ ligada: as telas leem direto do Supabase; se ele falhar ou demorar, voltam sozinhas para a planilha. ', botao('Desligar a leitura rápida', async () => { desenhar(await api('banco.config', { leitura: false })); if (BANCO) BANCO.sair(); avisar('Leitura rápida desligada: tudo volta a vir da planilha.'); }, 'mini sec'))
              : h('span', {}, 'desligada. ', botao('Ligar a leitura rápida', async () => { desenhar(await api('banco.config', { leitura: true })); if (BANCO) { BANCO.sair(); BANCO.iniciar(); } avisar('Leitura rápida ligada.'); }, 'mini')));
      const f = h('form', { class: 'campos', novalidate: true },
        campo('url', 'Endereço do projeto (Project URL)', r.url || '', { dica: 'Supabase › Project Settings › API · parecido com https://abcdefgh.supabase.co', max: 120 }),
        campo('chave', r.ligado ? 'Chave secreta (já cadastrada: deixe vazio para manter)' : 'Chave secreta (secret / service_role)', '', { tipo: 'password', max: 400, dica: 'Supabase › Project Settings › API Keys › Secret keys (sb_secret_…). Fica só no Google; nunca vai ao navegador.' }),
        campo('publica', r.publica ? 'Chave pública (já cadastrada: deixe vazio para manter)' : 'Chave pública (publishable / anon)', '', { max: 400, dica: 'Supabase › Project Settings › API Keys › Publishable key (sb_publishable_…). É pública por natureza: sozinha não lê nada.' }),
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, r.ligado ? 'Salvar e testar' : 'Ligar e testar'),
          r.ligado ? botao('Copiar agora', async ev => { ev.target.disabled = true; ev.target.textContent = 'Copiando (até 4 min)…'; try { const x = await api('banco.config', { copiar: true }); avisar(`Cópia feita: ${x.copia.copiadas.length} aba(s)` + (x.copia.erros.length ? ` · ${x.copia.erros.length} com erro` : '') + '.', !!x.copia.erros.length); desenhar(x); } catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Copiar agora'; } }, 'sec') : null,
          r.ligado ? botao('Copiar tudo de novo', async ev => { ev.target.disabled = true; try { const x = await api('banco.config', { copiar: true, tudo: true }); avisar(`Cópia completa: ${x.copia.copiadas.length} aba(s).`); desenhar(x); } catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'sec') : null,
          r.ligado ? botao('Desligar', async () => { if (!confirm('Desligar o banco novo? O painel volta a ler só da planilha. Os dados que já estão no Supabase continuam lá.')) return; desenhar(await api('banco.config', { desligar: true })); if (BANCO) BANCO.sair(); avisar('Banco novo desligado.'); }, 'sec') : null),
        h('p', { class: 'erro largo' }));
      aoEnviar(f, async fd => {
        const d = Object.fromEntries(fd.entries()); if (!d.chave) delete d.chave; if (!d.publica) delete d.publica;
        const x = await api('banco.config', Object.assign(d, { testar: true }));
        if (BANCO && d.publica) { BANCO.sair(); BANCO.iniciar(); }
        avisar(x.teste || 'Salvo.', /⚠/.test(x.teste || '')); desenhar(x);
      });
      caixa.replaceChildren(h('h2', {}, '🗄 Banco novo (Supabase)'), status, passo2, r.teste ? h('p', { class: /⚠/.test(r.teste) ? 'erro' : 'peq' }, r.teste) : null,
        r.ligado && r.rpc && r.publica && r.leitura ? h('details', { class: 'sub', open: true }, h('summary', {}, '⏱ Velocidade: banco novo × planilha'),
          resumoMedidas(), h('div', { class: 'acoes' }, botao('⏱ Medir agora (as mesmas telas pelos dois caminhos)', testar, 'sec')), medidor) : null,
        h('details', { class: 'sub', open: !r.ligado }, h('summary', {}, r.ligado ? 'Trocar o endereço ou as chaves' : 'Como ligar (5 minutos)'),
          r.ligado ? null : h('ol', { class: 'peq' },
            h('li', {}, 'Crie a conta grátis em supabase.com e um projeto novo na região São Paulo (sa-east-1). Guarde a senha do banco num lugar seguro.'),
            h('li', {}, 'No projeto: SQL Editor › New query › cole todo o arquivo ', SQL('esquema.sql'), ' › Run. Depois, numa query nova, ', SQL('leitura-rapida.sql'), ' › Run.'),
            h('li', {}, 'Project Settings › API Keys: copie o Project URL, a chave secreta e a chave pública para os campos abaixo e aperte "Ligar e testar".'),
            h('li', {}, 'Depois aperte "Copiar agora". A partir daí o painel copia sozinho de 30 em 30 minutos e as telas leem direto do banco.')),
          f));
    };
    api('banco.config', {}).then(desenhar).catch(e => caixa.replaceChildren(h('h2', {}, '🗄 Banco novo (Supabase)'), h('p', { class: 'peq' }, /desconhec|não existe|rota/i.test(e.message) ? 'Cole o Code.gs novo (8.27) no Google para ligar o banco novo.' : e.message)));
    return caixa;
  }
  function caixaExtensao() {
    const lista = h('div', {}, h('p', { class: 'peq' }, 'Carregando os computadores ligados…'));
    const codigoBox = h('div', { class: 'ext-codigo', 'aria-live': 'polite' });
    const desenharLista = r => {
      lista.replaceChildren(r.itens.length ? h('ul', { class: 'ext-lista' }, r.itens.map(z => h('li', {},
        h('strong', {}, z.nome || 'Computador'), h('span', { class: 'peq' }, ` · ${z.usuario || ''} · ligado em ${z.criado ? new Date(z.criado).toLocaleDateString('pt-BR') : '—'}` + (z.ultimo ? ` · último uso ${new Date(z.ultimo).toLocaleString('pt-BR')}` : '')),
        botao('Desligar', async ev => { if (!confirm('Desligar o assistente neste computador? Ele para de funcionar na hora.')) return; ev.target.disabled = true; try { desenharLista(await api('ext.dispositivos', { revogar: z.id })); avisar('Computador desligado.'); } catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'mini sec'))))
        : h('p', { class: 'peq' }, 'Nenhum computador ligado ainda.'));
    };
    api('ext.dispositivos', {}).then(desenharLista).catch(e => lista.replaceChildren(h('p', { class: 'peq erro' }, e.message.includes('não existe') || e.message.includes('desconhecida') ? 'Atualize o programa do Google (Code.gs) para usar o assistente.' : e.message)));
    return h('section', { class: 'caixa ext-caixa' }, h('h2', {}, '🟢 Assistente do WhatsApp Web (extensão do Chrome)'),
      h('p', {}, 'Ao lado de cada conversa do WhatsApp Web mostra quem é a pessoa no painel (cliente, processos, etapa do funil), põe no funil quem chega falando de um caso, prepara o link do cadastro e as mensagens e anda a etapa sozinho quando o link do cadastro ou a procuração e o contrato são mandados. Nunca envia nada sozinho: só coloca o texto na caixa.'),
      h('ol', { class: 'ext-passos' },
        h('li', {}, h('a', { class: 'btn mini', href: 'extensao-whatsapp.zip', download: 'extensao-whatsapp.zip' }, '⬇ Baixar a extensão'), ' e descompacte (botão direito › Extrair tudo).'),
        h('li', {}, 'No Chrome, abra ', h('code', {}, 'chrome://extensions'), ', ligue o "Modo do desenvolvedor" (canto de cima, à direita) e clique em "Carregar sem compactação". Escolha a pasta extraída.'),
        h('li', {}, 'Abra o WhatsApp Web: o painel do escritório aparece à direita. Clique em "Gerar código" aqui e digite o código lá.')),
      h('div', { class: 'acoes' }, botao('Gerar código', async ev => {
        ev.target.disabled = true;
        try { const r = await api('ext.parear', {}); codigoBox.replaceChildren(h('p', {}, 'Digite no WhatsApp Web: ', h('strong', { class: 'ext-cod' }, r.codigo), h('span', { class: 'peq' }, ` (vale ${r.validade_min} minutos e uma vez só)`))); setTimeout(() => api('ext.dispositivos', {}).then(desenharLista).catch(() => {}), 60000); }
        catch (e) { avisar(e.message, true); } finally { ev.target.disabled = false; }
      }), botao('Atualizar a lista', async () => desenharLista(await api('ext.dispositivos', {})), 'sec')),
      codigoBox, h('h3', {}, 'Computadores ligados'), lista,
      h('p', { class: 'peq' }, 'A chave de cada computador fica guardada embaralhada no painel e só abre as funções do assistente. Perdeu o computador ou a pessoa saiu? Clique em Desligar.'));
  }

  async function telaUsuarios() {
    carregando();
    const [lista, seg] = await Promise.all([api('usuarios.listar'), api('seguranca').catch(() => null)]);
    const form = h('form', { class: 'caixa', novalidate: true },
      h('h2', {}, 'Novo usuário'),
      h('p', { class: 'peq' }, 'Depois de 5 senhas erradas seguidas, o usuário fica bloqueado por 15 minutos.'),
      h('div', { class: 'campos' },
        campo('nome', 'Nome da pessoa', '', { obrigatorio: true }),
        campo('usuario', 'Usuário (ex.: Estagiario)', '', { obrigatorio: true }),
        campo('perfil', 'Perfil', 'secretario', { opcoes: PERFIS }),
        campo('senha', 'Senha inicial', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' , dica: 'mínimo 4 caracteres (pode ser só números)' }),
        campo('email', 'E-mail Google (resumo das 7h e edição dos modelos)', '', { tipo: 'email', auto: 'off' })),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Criar usuário')),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      await api('usuarios.salvar', Object.fromEntries(fd.entries()));
      avisar('Usuário criado.');
      telaUsuarios();
    });
    const caixaSeg = seg ? h('section', { class: 'caixa seguranca' }, h('h2', {}, 'Segurança dos dados'),
      h('ul', { class: 'lista-seg' },
        h('li', { class: seg.backup && seg.backupRecente ? 'ok' : 'alerta' }, h('strong', {}, 'Cópia de segurança diária: '),
          seg.backup ? `última em ${new Date(seg.backup).toLocaleString('pt-BR')} (guarda os últimos 30 dias)` : 'ainda não foi feita',
          seg.backupUrl ? h('span', {}, ' · ', h('a', { href: seg.backupUrl, target: '_blank', rel: 'noopener noreferrer' }, 'abrir pasta das cópias')) : null),
        h('li', { class: seg.semanal && seg.semanalRecente ? 'ok' : 'alerta' }, h('strong', {}, 'Cópia semanal (toda sexta-feira): '),
          seg.semanal ? `última em ${new Date(seg.semanal).toLocaleString('pt-BR')} (planilha + Excel, guarda 1 ano)` : 'a primeira sai na próxima sexta-feira, por volta das 18h',
          seg.semanalErro ? h('span', { class: 'erro' }, ' · problema: ' + seg.semanalErro) : null,
          seg.semanalUrl ? h('span', {}, ' · ', h('a', { href: seg.semanalUrl, target: '_blank', rel: 'noopener noreferrer' }, 'abrir cópias semanais')) : null),
        h('li', { class: seg.planilhaPrivada ? 'ok' : 'alerta' }, h('strong', {}, 'Planilha de dados: '), seg.planilhaPrivada ? 'privada, só a conta do escritório acessa' : 'ATENÇÃO: compartilhada com ' + seg.compartilhadaCom.join(', ')),
        h('li', { class: 'ok' }, h('strong', {}, 'Senhas: '), 'guardadas embaralhadas com chave secreta; ninguém consegue ler, nem na planilha'),
        h('li', { class: 'ok' }, h('strong', {}, 'Sessões: '), 'caem após 1 hora parado no painel, 6 horas sem uso ou 12 horas no total; trocar a senha derruba as outras'),
        h('li', { class: seg.falhasRecentes ? 'alerta' : 'ok' }, h('strong', {}, 'Tentativas de entrada erradas (7 dias): '), String(seg.falhasRecentes)),
        h('li', { class: 'ok' }, h('strong', {}, 'Registro: '), 'todo login, alteração e acesso negado fica na aba Log da planilha'))) : null;
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Gerenciar acessos'), h('p', {}, 'Quem pode entrar no painel, o que cada perfil vê, senhas, bloqueios e a segurança dos dados.'))),
      caixaSeg,
      caixaExtensao(),
      caixaBancoNovo(),
      tabela(['Nome', 'Usuário', 'Perfil', 'Situação', 'Último acesso'], lista, u => [
        h('td', { 'data-r': 'Nome' }, u.nome),
        h('td', { 'data-r': 'Usuário' }, u.usuario, u.email ? h('div', { class: 'peq' }, u.email + (u.resumo_email === 'nao' ? ' (sem resumo)' : '')) : null),
        h('td', { 'data-r': 'Perfil' }, (PERFIS.find(p => p[0] === u.perfil) || [0, u.perfil])[1].split(' (')[0]),
        h('td', { 'data-r': 'Situação' }, u.ativo === 'sim' ? h('span', { class: 'tag ok' }, 'ativo') : h('span', { class: 'tag' }, 'desativado'), u.bloqueado ? h('span', { class: 'tag urgente' }, 'bloqueado') : null),
        h('td', { 'data-r': 'Último acesso' }, u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—')
      ], u => editarUsuario(u), 'Nenhum usuário.'),
      h('div', { id: 'editar-usuario' }),
      h('section', { class: 'caixa' }, h('h2', {}, 'Quem pode ver o quê'),
        h('table', { class: 'mini-tab permissoes' }, h('thead', {}, h('tr', {}, ['Perfil', 'Clientes, processos, intimações, agenda, documentos, calculadoras e transcrição', 'Tarefas', 'Conferir prazos', 'Painel financeiro', 'CRM, Marketing, Relatórios e acessos'].map(x => h('th', {}, x)))),
          h('tbody', {}, [['Administrador', '✓', 'todas', '✓', '✓', '✓'], ['Advogada', '✓', 'só as dela', '✓', '—', '—'], ['RH', '✓', 'só as dela', '—', '✓ (sem totais)', '—'], ['Secretário', '✓', 'só as dele', '—', '—', '—'], ['Estagiário', '✓', 'só as dele', '—', '—', '—']]
            .map(l => h('tr', {}, l.map((x, i) => h(i ? 'td' : 'th', { scope: i ? null : 'row' }, x))))))),
      caixaRevisao(),
      form,
      caixaEmailDiario(lista),
      caixaIA(),
      await relatorioCumpridos());
  }

  /** Confere o dígito verificador do número CNJ (módulo 97), como o servidor (cnjValido_). */
  function cnjValido(n) {
    const m = /^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/.exec(String(n || '').trim());
    if (!m) return false;
    let resto = 0; for (const c of m[1] + m[3] + m[4] + m[5] + m[6] + '00') resto = (resto * 10 + +c) % 97;
    return +m[2] === 98 - resto;
  }

  /** Revisão geral dos dados: prévia e "Corrigir agora" (etapas, encerrados, área, cliente ligado, cadastros, prazos sem data, releitura do Gmail). */
  function caixaRevisao() {
    const corpo = h('div', {});
    const desenhar = r => {
      const f = r.faltando || {};
      corpo.replaceChildren(h('ul', { class: 'revisao-lista' },
        h('li', {}, h('b', {}, String(r.fase)), ' processo(s) sem etapa gravada → recebem a etapa certa'),
        h('li', {}, h('b', {}, String(r.encerrados)), ' arquivado(s) → vão para "Encerrado / arquivado"'),
        h('li', {}, h('b', {}, String(r.etapas || 0)), ' processo(s) em etapa errada → etapa conferida com toda a história do processo (DataJud e avisos)',
          Object.keys(r.etapasPor || {}).length ? h('span', { class: 'peq' }, ' (' + Object.entries(r.etapasPor).map(([f, n]) => `${FASES[f] || f}: ${n}`).join(' · ') + ')') : ''),
        h('li', {}, h('b', {}, String(r.arquivados || 0)), ' processo(s) com baixa definitiva / execução extinta e nada depois → "Encerrado / arquivado"'),
        h('li', {}, h('b', {}, String((r.intimMovimento || 0) + (r.intimPrazoBaixado || 0))), ' intimação(ões) saem da lista de abertas ',
          h('span', { class: 'peq' }, `(${r.intimMovimento || 0} só movimentação, sem prazo, há mais de 7 dias · ${r.intimPrazoBaixado || 0} com o prazo já cumprido ou baixado). Continuam em "Todas".`)),
        h('li', {}, r.prazosVencidos ? [h('b', {}, String(r.prazosVencidos)), ' prazo(s) aberto(s) com a data fatal já passada: confira em Intimações e prazos.'] : '✓ Nenhum prazo aberto com a data fatal vencida.'),
        (r.numerosErrados || []).length ? h('li', { class: 'alerta-txt' }, h('b', {}, String(r.numerosErrados.length)), ' processo(s) com o NÚMERO ERRADO (dígito verificador não bate: o PJe/eproc não acha). Abra e corrija o número: ',
          r.numerosErrados.map((x, i) => [i ? ', ' : '', h('a', { href: '#/processo/' + x.id }, x.numero + (x.cliente ? ' (' + x.cliente + ')' : ''))])) : h('li', {}, '✓ Todos os números de processo conferem (dígito verificador).'),
        h('li', {}, h('b', {}, String(r.area)), ' sem área → área pelo tribunal ou pela vara', r.tribunal ? ` · ${r.tribunal} sem tribunal` : ''),
        h('li', {}, h('b', {}, String(r.clienteLigado)), ' processo(s) ligados ao cliente', r.clientesCriados ? ` (${r.clientesCriados} cadastro(s) novo(s) criado(s) com o nome que veio do tribunal, sem pasta nova)` : '', ' · ', h('span', { class: 'peq' }, `${r.semCliente} continuam "a identificar" (o aviso não trouxe o nome ou é sigiloso)`)),
        h('li', {}, h('b', {}, String(r.cadastros)), ' cadastro(s) "importado — conferir" → concluídos ', h('span', { class: 'peq' }, `(na ficha aparece o que falta: sem CPF ${f.cpf_cnpj || 0}, sem endereço ${f.endereco || 0}, sem telefone ${f.telefone || 0}, sem RG ${f.rg || 0}, sem profissão ${f.profissao || 0})`)),
        r.aplicado ? h('li', {}, h('b', {}, String(r.prazosDefinidos || 0)), ' prazo(s) "a definir" ganharam data · Gmail dos últimos 10 dias será relido na próxima rodada do robô') : h('li', {}, 'Prazos "a definir" ganham data (prazo mais curto) e o Gmail dos últimos 10 dias é relido.'),
        r.semNumero.length ? h('li', {}, h('b', {}, String(r.semNumero.length)), ' processo(s) sem número (não estão em "Petição inicial"): ',
          r.semNumero.map((x, i) => [i ? ', ' : '', h('a', { href: '#/processo/' + x.id }, x.cliente || 'sem cliente')])) : h('li', {}, '✓ Todos os processos têm número (fora os de "Petição inicial").')),
        r.aplicado ? h('p', { class: 'nota ok' }, '✓ Correções feitas.') : null);
    };
    const bPrevia = botao('Ver o que será corrigido', async ev => { ev.target.disabled = true; try { desenhar(await api('revisao.geral', { aplicar: false })); } catch (e) { avisar(e.message, true); } ev.target.disabled = false; }, 'sec');
    const bAplicar = botao('Corrigir agora', async ev => {
      if (!confirm('Fazer a revisão geral agora? Uma cópia de segurança da planilha é feita todo dia às 3h.')) return;
      ev.target.disabled = true; ev.target.textContent = 'Corrigindo… (até 2 min)';
      try { desenhar(await api('revisao.geral', { aplicar: true })); avisar('Revisão geral feita.'); } catch (e) { avisar(e.message, true); }
      ev.target.disabled = false; ev.target.textContent = 'Corrigir agora';
    });
    return h('section', { class: 'caixa' }, h('h2', {}, 'Revisão geral dos dados'),
      h('p', { class: 'peq' }, 'Confere processos, clientes e prazos e arruma o que dá para arrumar sozinho. Não apaga nada.'),
      h('div', { class: 'barra' }, bPrevia, bAplicar), corpo);
  }

  async function relatorioCumpridos() {
    const r = await api('relatorio.cumpridos', { dias: 30 }).catch(e => ({ erro: e.message, lista: [], porPessoa: [] }));
    return h('section', { class: 'mt' },
      h('h2', {}, 'Prazos cumpridos — últimos 30 dias'),
      r.erro ? h('p', { class: 'erro' }, r.erro) : null,
      h('div', { class: 'numeros' }, r.porPessoa.length ? r.porPessoa.map(x => h('div', { class: 'numero' }, h('b', {}, x.total),
        h('span', {}, `${x.quem} · ${x.noPrazo} no prazo${x.total - x.noPrazo ? ' · ' + (x.total - x.noPrazo) + ' depois do fatal' : ''}`))) : h('p', { class: 'peq' }, 'Ninguém marcou prazo como cumprido nos últimos 30 dias.')),
      tabela(['Quando', 'Quem cumpriu', 'Processo', 'Cliente', 'Prazo', 'Fatal'], r.lista, x => [
        h('td', { class: 'num', 'data-r': 'Quando' }, new Date(x.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
        h('td', { 'data-r': 'Quem cumpriu' }, h('strong', {}, x.quem)),
        h('td', { class: 'num', 'data-r': 'Processo' }, x.numero),
        h('td', { 'data-r': 'Cliente' }, x.cliente),
        h('td', { 'data-r': 'Prazo' }, x.descricao),
        h('td', { 'data-r': 'Fatal' }, x.fatal ? dataBR(x.fatal) : '—', ' ', x.noPrazo ? h('span', { class: 'tag ok' }, 'no prazo') : h('span', { class: 'tag urgente' }, 'depois do fatal'))
      ], x => { location.hash = '#/prazo/' + x.id; }, 'Sem registros.'));
  }

  function editarUsuario(u) {
    const alvo = document.getElementById('editar-usuario');
    const form = h('form', { class: 'caixa', novalidate: true },
      h('h2', {}, 'Editar ' + u.usuario),
      h('div', { class: 'campos' },
        campo('nome', 'Nome', u.nome, { obrigatorio: true }),
        campo('perfil', 'Perfil', u.perfil, { opcoes: PERFIS }),
        campo('ativo', 'Situação', u.ativo, { opcoes: [['sim', 'Ativo'], ['nao', 'Desativado']] }),
        campo('email', 'E-mail Google (resumo das 7h e edição dos modelos)', u.email, { tipo: 'email', auto: 'off' }),
        campo('resumo_email', 'Resumo das 7h por e-mail', u.resumo_email === 'nao' ? 'nao' : 'sim', { opcoes: [['sim', 'Receber'], ['nao', 'Não receber']] }),
        campo('senha', 'Nova senha (deixe em branco para manter; mínimo 4 caracteres)', '', { tipo: 'password', auto: 'new-password' })),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
        botao('Desconectar agora', async ev => {
          ev.target.disabled = true;
          try { await api('usuarios.salvar', { id: u.id, desconectar: true }); avisar(`${u.nome} foi desconectado(a) de todos os aparelhos.`); }
          catch (e) { avisar(e.message, true); } ev.target.disabled = false;
        }, 'sec'),
        u.bloqueado ? botao('Desbloquear', async () => { await api('usuarios.salvar', { id: u.id, desbloquear: true }); avisar('Usuário desbloqueado.'); telaUsuarios(); }, 'sec') : null,
        u.usuario !== sessao.usuario.usuario ? botao('🗑 Excluir pessoa', async ev => {
          if (!confirm(`Excluir ${u.nome} do painel? A pessoa não entra mais e some das listas (o que ela fez continua registrado).`)) return;
          ev.target.disabled = true;
          try { await api('usuarios.salvar', { id: u.id, excluir: true }); avisar(`${u.nome} foi excluído(a) do painel.`); telaUsuarios(); } catch (e) { avisar(e.message, true); ev.target.disabled = false; }
        }, 'perigo') : null,
        botao('Cancelar', () => alvo.replaceChildren(), 'sec')),
      h('p', { class: 'peq' }, '"Desconectar agora" tira a pessoa do painel em todos os computadores e celulares; ela precisa entrar de novo com a senha. Para impedir a entrada de vez, mude a Situação para Desativado.'),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      d.id = u.id;
      if (!d.senha) delete d.senha;
      await api('usuarios.salvar', d);
      avisar('Usuário atualizado.');
      telaUsuarios();
    });
    alvo.replaceChildren(form);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function telaSenha() {
    const form = h('form', { class: 'entrar' },
      h('h1', {}, 'Trocar senha'),
      h('div', { class: 'campo' }, campo('atual', 'Senha atual', '', { tipo: 'password', obrigatorio: true, auto: 'current-password' })),
      h('div', { class: 'campo' }, campo('nova', 'Nova senha', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' , dica: 'mínimo 4 caracteres (pode ser só números)' })),
      h('div', { class: 'campo' }, campo('nova2', 'Repita a nova senha', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' })),
      h('button', { type: 'submit', class: 'btn' }, 'Trocar senha'),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      if (fd.get('nova') !== fd.get('nova2')) throw new Error('As senhas novas não conferem.');
      const r = await api('senha.trocar', { atual: fd.get('atual'), nova: fd.get('nova') });
      if (r && r.token) { sessao.token = r.token; guardar('painel_sessao', sessao); if (BANCO) { BANCO.sair(); BANCO.iniciar(); } } // as outras sessões abertas caem
      avisar('Senha trocada. Se você estava logado em outro computador, entre de novo lá.');
      location.hash = '#/inicio';
    });
    mostrar(form);
  }

  function telaEmBreve(nome, etapa, texto) {
    mostrar(h('div', { class: 'cab' }, h('h1', {}, nome)), h('div', { class: 'nota' }, `Entra na ${etapa}. ${texto}`));
  }

  /* ---------- prazos ---------- */

  /** Quanto falta até 23h59 do dia fatal (horário de Brasília). */
  function contagem(fatal) {
    if (!fatal) return null;
    const fim = new Date(fatal + 'T23:59:59-03:00').getTime();
    const ms = fim - Date.now();
    if (ms < 0) {
      // 8.11: conta em DIAS DO CALENDÁRIO (fatal 04/11 visto em 05/11 = "venceu ontem", não "venceu hoje")
      const d = Math.max(1, -(diasAte(fatal) || 0));
      return { cls: 'tag', texto: d === 1 ? 'venceu ontem' : `venceu há ${d} dias`, vencido: true };
    }
    const d = Math.floor(ms / 86400000);
    const hrs = Math.floor((ms % 86400000) / 3600000);
    const cls = d <= 2 ? 'urgente' : d <= 5 ? 'atencao' : 'ok';
    if (d === 0) return { cls: 'tag urgente', texto: `VENCE HOJE · faltam ${hrs} h` };
    return { cls: 'tag ' + cls, texto: `faltam ${d} dia${d === 1 ? '' : 's'} e ${hrs} h` };
  }
  function etiquetaContagem(fatal) {
    const c = contagem(fatal);
    if (!c) return h('span', { class: 'tag urgente' }, 'prazo a definir');
    return h('span', { class: c.cls, 'data-fatal': fatal }, c.texto);
  }
  setInterval(() => {
    document.querySelectorAll('[data-fatal]').forEach(el => {
      const c = contagem(el.dataset.fatal);
      if (c) { el.className = c.cls; el.textContent = c.texto; }
    });
  }, 60000);

  function etiquetaPrazo(z) {
    if (z.situacao === 'a definir') return h('span', { class: 'tag urgente' }, 'prazo a definir');
    if (z.situacao === 'conferido') return h('span', { class: 'tag ok', title: (z.conferido_em ? new Date(z.conferido_em).toLocaleString('pt-BR') : '') + (z.conferido_fonte ? ' · ' + z.conferido_fonte : '') }, '✓ confirmado' + (z.conferido_por ? ' por ' + z.conferido_por : '') + (z.conferido_fonte ? ' · ' + z.conferido_fonte.split(' — ')[0].replace(/^Conferi no sistema do tribunal.*$/, 'no tribunal').replace(/^Publicação no DJEN$/, 'DJEN') : ''));
    if (divergente(z)) return h('span', { class: 'tag conferir', title: z.resumo_ia }, '⚠ divergência · conferir no tribunal');
    if (z.situacao === 'calculado') return h('span', {},
      /PROVISÓRIO/i.test(z.descricao || '') ? h('span', { class: 'tag conferir', title: 'O aviso não diz qual é o ato. O robô usou o prazo mais curto: confira no sistema do tribunal.' }, 'provisório · conferir no tribunal') : null,
      ' ', h('span', { class: 'tag atencao' }, z.origem === 'robô' ? 'calculado pelo robô' : 'lançado · a conferir'));
    if (z.situacao === 'cumprido') return h('span', { class: 'tag cumprido' }, '✓ cumprido' + (z.cumprido_por ? ' por ' + z.cumprido_por : ''));
    return h('span', { class: 'tag' }, z.situacao);
  }
  function textoDias(z) {
    if (!(+z.dias)) return 'dias a definir';
    return `${z.dias} dia${+z.dias === 1 ? '' : 's'} ${z.contagem === 'corridos' ? 'corridos' : 'úteis'}`;
  }

  async function acaoPrazo(acao, dados, msg) {
    await api(acao, dados);
    avisar(msg);
    rota();
  }

  /** WhatsApp para o cliente: avisa que chegou intimação e que o escritório já está cuidando do prazo. */
  /* ---------- Conferido (equipe) → OK (administração) ---------- */

  const iniciais = n => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  /** Janela com a equipe: a pessoa aperta o nome de quem fez. Devolve o usuário escolhido (ou null). */
  async function escolherQuem(titulo, extra) {
    const equipe = await api('equipe.listar').catch(() => [{ usuario: sessao.usuario.usuario, nome: sessao.usuario.nome }]);
    const eu = sessao.usuario.usuario;
    const lista = equipe.slice().sort((a, b) => (b.usuario === eu) - (a.usuario === eu));
    return new Promise(resolve => {
      const caixa = h('dialog', { class: 'dialogo quem-fez' });
      let feito = false;
      const fim = v => { if (feito) return; feito = true; caixa.close(); resolve(v); };
      const campoExtra = extra ? extra() : null;
      caixa.append(...[
        h('h2', {}, titulo || 'Quem fez?'),
        h('p', { class: 'peq' }, /Passar/.test(titulo || '') ? 'Aperte o nome: vai para as Tarefas dessa pessoa.' : 'Aperte o nome de quem fez. Some da lista da equipe e vai para o OK da administração e para o relatório.'),
        campoExtra,
        h('div', { class: 'quem-grade' }, lista.map(x => h('button', { type: 'button', class: 'quem-bt' + (x.usuario === eu ? ' eu' : ''), onclick: () => fim({ usuario: x.usuario, nome: x.nome, extra: campoExtra && campoExtra.valor ? campoExtra.valor() : '' }) },
          h('span', { class: 'quem-ini' }, iniciais(x.nome)), h('span', { class: 'quem-nome' }, x.nome, x.usuario === eu ? h('small', {}, ' (você)') : null)))),
        h('div', { class: 'acoes' }, botao('Cancelar', () => fim(null), 'sec'))].filter(Boolean));
      caixa.addEventListener('close', () => { caixa.remove(); if (!feito) { feito = true; resolve(null); } });
      document.body.append(caixa);
      caixa.showModal();
    });
  }
  /** O cartão/linha clicado some na hora (o Google confirma por trás; se der erro, volta). */
  function sumirNaHora(el) { const alvo = el && el.closest('li, tr, article, .aguarda-item'); if (alvo) alvo.classList.add('saindo'); return alvo; }
  async function conferirTrabalho(tipo, id, titulo, extra, origem) {
    const q = await escolherQuem(titulo, extra);
    if (!q) return false;
    const alvo = sumirNaHora(origem);
    let r;
    try { r = await api('trabalho.conferir', { tipo, id, por: q.usuario, numero: q.extra || '' }); }
    catch (e) { if (alvo) alvo.classList.remove('saindo'); throw e; }
    avisar(r.repetido ? 'Já estava conferido' + (r.por ? ' por ' + r.por : '') + '.' : `✓ Conferido: feito por ${r.por}. Agora aguarda o OK da administração.`);
    // 8.11: inicial protocolada → abre o processo com a mensagem do WhatsApp pronta (com o código do Acompanhe gerado sozinho)
    if (tipo === 'inicial' && r.protocolado) { guardarProtocolo(id, r); location.hash = '#/processo/' + id + '?avisar=1'; return true; }
    if (/^#\/prazo\//.test(location.hash)) { location.hash = '#/prazos'; return true; } // 8.19: conferiu dentro do prazo → fecha a tela do prazo
    rota();
    return true;
  }
  /** Botão verde "Conferido" (vem depois do WhatsApp). */
  function botaoConferido(tipo, id, titulo, extra, rotulo) {
    return h('button', { type: 'button', class: 'btn mini terminei', onclick: async ev => {
      ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true;
      try { if (!(await conferirTrabalho(tipo, id, titulo, extra, b))) b.disabled = false; } catch (e) { b.disabled = false; avisar(e.message, true); }
    } }, rotulo || '✓ Conferido');
  }
  /** "🙋 Eu faço" (pega para si; vai para as Tarefas da pessoa) e, para a administração, "Passar para…". */
  function botoesEuFaco(tipo, id, responsavel) {
    const eu = sessao.usuario.usuario, pode = sessao.usuario.pode;
    const pegar = async (para, b) => {
      b.disabled = true;
      try { const r = await api('trabalho.assumir', { tipo, id, para }); avisar(para && para !== eu ? `Passado para ${r.para}: já está nas Tarefas dessa pessoa.` : 'É seu: já está nas suas Tarefas.'); rota(); }
      catch (e) { b.disabled = false; avisar(e.message, true); }
    };
    return [
      responsavel ? h('span', { class: 'tag mini-tag resp-tag', title: 'Responsável' }, '👤 ' + (responsavel === eu ? 'você' : responsavel)) : null,
      responsavel !== eu ? h('button', { type: 'button', class: 'btn mini sec eu-faco', onclick: ev => { ev.stopPropagation(); pegar('', ev.currentTarget); } }, '🙋 Eu faço') : null,
      pode.usuarios || pode.conferePrazos ? h('button', { type: 'button', class: 'btn mini sec', onclick: async ev => {
        ev.stopPropagation(); const b = ev.currentTarget;
        const q = await escolherQuem('Passar para quem?'); if (q) pegar(q.usuario, b);
      } }, 'Passar para…') : null];
  }

  /** Para a administração: OK final ou devolver para a equipe. */
  function botoesOk(tipo, id) {
    const parar = fn => async ev => { ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; try { await fn(b); } catch (e) { b.disabled = false; avisar(e.message, true); } };
    return [
      h('button', { type: 'button', class: 'btn mini ok-bt', onclick: parar(async b => { const alvo = sumirNaHora(b); try { await api('trabalho.ok', { tipo, id }); } catch (e) { if (alvo) alvo.classList.remove('saindo'); throw e; } avisar('OK dado.'); rota(); }) }, '✓ OK'),
      h('button', { type: 'button', class: 'btn mini sec', onclick: parar(async () => { const m = prompt('Devolver para a equipe. Motivo (opcional):', ''); if (m === null) throw new Error('Cancelado.'); await api('trabalho.devolver', { tipo, id, motivo: m }); avisar('Devolvido: voltou para a lista da equipe.'); rota(); }) }, 'Devolver')];
  }

  /** Painel da administração: o que a equipe conferiu e espera o OK. */
  function blocoAguardandoOk() {
    const caixa = h('section', { class: 'caixa aguarda-ok' });
    if (!sessao.usuario.pode.usuarios) return null;
    (async () => {
      let itens;
      try { itens = await api('trabalho.aguardando'); } catch (e) { caixa.remove(); return; }
      if (!itens.length) { caixa.replaceChildren(h('div', { class: 'aguarda-vazio' }, '✓ Nada esperando o seu OK. Tudo o que a equipe conferiu já foi aprovado.')); return; }
      const ICO = { prazo: '⏱', intimacao: '📨', inicial: '⚖' }, NOME = { prazo: 'Prazo', intimacao: 'Intimação', inicial: 'Petição inicial' };
      // 8.11 (pedido da usuária): uma linha só, com um botão pequeno de OK; a lista inteira só abre no "ver a lista"
      let aberta = false; try { aberta = localStorage.getItem('aguarda_aberta') === '1'; } catch (e) { /* segue fechada */ }
      const lista = h('ul', { class: 'aguarda-lista', hidden: !aberta });
      const verBt = h('button', { type: 'button', class: 'btn mini sec', 'aria-expanded': String(aberta), onclick: () => {
        aberta = !aberta; lista.hidden = !aberta; verBt.textContent = aberta ? 'esconder a lista' : 'ver a lista'; verBt.setAttribute('aria-expanded', String(aberta));
        try { localStorage.setItem('aguarda_aberta', aberta ? '1' : '0'); } catch (e) { /* ok */ }
      } }, aberta ? 'esconder a lista' : 'ver a lista');
      const PLURAL = { prazo: ['prazo', 'prazos'], intimacao: ['intimação', 'intimações'], inicial: ['petição inicial', 'petições iniciais'] };
      const porTipo = ['prazo', 'intimacao', 'inicial'].map(t => [t, itens.filter(x => x.tipo === t).length]).filter(x => x[1]).map(([t, n]) => `${n} ${PLURAL[t][n === 1 ? 0 : 1]}`).join(' · ');
      caixa.replaceChildren(
        h('div', { class: 'aguarda-cab aguarda-compacta' }, h('div', {}, h('strong', {}, `Aguardando o seu OK: ${itens.length}`), h('span', { class: 'peq' }, ' · ' + porTipo)),
          h('div', { class: 'barra' },
            botao('✓ OK', async ev => {
              if (!confirm(`Dar OK nos ${itens.length} itens que a equipe conferiu?`)) return;
              ev.target.disabled = true; const r = await api('trabalho.ok', { itens: itens.map(x => ({ tipo: x.tipo, id: x.id })) }); avisar(`${r.feitos} OK dado(s).`); rota();
            }, 'mini ok-bt'),
            verBt)),
        lista);
      lista.append(...itens.map(x => h('li', { class: 'aguarda-item t-' + x.tipo },
          h('span', { class: 'aguarda-ico', 'aria-hidden': 'true' }, ICO[x.tipo]),
          h('div', { class: 'aguarda-txt' },
            h('div', {}, h('span', { class: 'tag mini-tag' }, NOME[x.tipo]), ' ', h('a', { href: x.link }, h('strong', {}, String(x.titulo || '').slice(0, 90)))),
            h('div', { class: 'peq' }, [x.cliente, x.numero].filter(Boolean).join(' · ') || '—'),
            h('div', { class: 'peq aguarda-quem' }, h('span', { class: 'quem-ini mini' }, iniciais(x.por)), ' feito por ', h('strong', {}, x.por || '—'),
              x.em ? ' · ' + new Date(x.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '',
              x.tipo === 'prazo' && x.fatal ? h('span', { class: 'tag mini-tag ' + (x.no_prazo ? 'ok' : 'urgente') }, x.no_prazo ? 'no prazo' : 'depois do fatal') : null)),
          h('div', { class: 'aguarda-bts' }, botoesOk(x.tipo, x.id)))));
    })();
    caixa.append(h('p', { class: 'peq' }, 'Carregando o que espera o seu OK…'));
    return caixa;
  }

  /** Guarda no relatório que o cliente foi avisado pelo WhatsApp (não atrapalha se falhar). */
  /** 8.19 (pedido da usuária): só estes atos pedem avisar o cliente; o resto (síntese, manifestar, ciência…) não tem WhatsApp. */
  const AVISAR_CLIENTE = [['perícia', /per[ií]cia|laudo|perito/i], ['contestação', /contesta[çc][ãa]o|r[ée]plica/i], ['audiência', /audi[êe]ncia|designo .{0,40}(dia|data)/i],
    ['sentença', /senten[çc]a|ac[óo]rd[ãa]o|julg(o|ou) (im)?procedente|julgamento/i], ['acordo', /acordo|homolog/i]];
  function avisoCliente(...textos) {
    const t = textos.filter(Boolean).join(' ');
    if (!t) return '';
    const x = AVISAR_CLIENTE.find(([, re]) => re.test(t));
    return x ? x[0] : '';
  }
  /** "✨ Avisar o cliente": a IA escreve o que aconteceu (curto, simples) e a pessoa confere antes de mandar. */
  async function dialogoAvisoCliente(prazoId, ctx) {
    let tel = telefoneWhats(ctx.telefone || '');
    if (tel && tel.length <= 11) tel = '55' + tel;
    const ta = h('textarea', { rows: 7, class: 'aviso-texto' }, 'A IA está escrevendo…');
    const ir = h('a', { class: 'btn wa', target: '_blank', rel: 'noopener noreferrer', hidden: !tel, onclick: () => registrarWhats(ctx, 'aviso ao cliente: ' + (ctx.tipo || 'andamento')) }, 'Mandar no WhatsApp');
    const atualizar = () => { if (tel) ir.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(ta.value); };
    ta.addEventListener('input', atualizar);
    const caixa = h('dialog', { class: 'dialogo' }, h('h2', {}, '✨ Avisar o cliente' + (ctx.tipo ? ' — ' + ctx.tipo : '')),
      h('p', { class: 'peq' }, `${ctx.cliente || 'Cliente'} · ${ctx.numero || ''}. Texto feito pela IA a partir do ato: confira e ajuste antes de mandar. Ela não informa prazos internos nem promete resultado.`),
      ta, tel ? null : h('p', { class: 'nota alerta' }, 'O cliente está sem telefone no cadastro: copie o texto.'),
      h('div', { class: 'acoes' }, ir, botao('Copiar o texto', () => copiar(ta.value, 'Texto copiado.'), 'sec'), botao('Fechar', () => { caixa.close(); caixa.remove(); }, 'sec')));
    document.body.append(caixa); caixa.showModal();
    try { const r = await api('ia.textoCliente', { id: prazoId }); ta.value = r.texto; }
    catch (e) { ta.value = `Olá! Passando para avisar que houve uma novidade no seu processo nº ${ctx.numero}. A Dra. Júlian já está cuidando de tudo. Qualquer dúvida, é só nos chamar.`; avisar(e.message, true); }
    atualizar();
  }
  /** 📌 A data final que aparece no PJe/eproc vira a do painel (o robô não recalcula mais). */
  function dialogoDataSistema(z) {
    return new Promise(ok => {
      const data = h('input', { type: 'date', value: z.fatal || '', required: true, 'aria-label': 'Data final' });
      const sis = h('select', { 'aria-label': 'Sistema' }, ['PJe', 'eproc'].map(x => h('option', { value: x, selected: (/eproc/i.test(z.sistema || z.observacoes || '') ? 'eproc' : 'PJe') === x }, x)));
      const desc = h('input', { type: 'text', maxlength: 200, value: String(z.descricao || '').replace(/^PROVISÓRIO:?\s*/i, ''), placeholder: 'O que fazer (ex.: Réplica)' });
      const caixa = h('dialog', { class: 'dialogo' }, h('h2', {}, '📌 Data final igual à do sistema'),
        h('p', { class: 'peq' }, `${z.numero}. Abra o processo no PJe ou no eproc, veja a data final do prazo (expedientes / intimações) e digite aqui: o painel fica igual ao sistema e o robô não muda mais.`),
        h('label', { class: 'campo' }, h('span', {}, 'Sistema'), sis), h('label', { class: 'campo' }, h('span', {}, 'Data final no sistema'), data), h('label', { class: 'campo' }, h('span', {}, 'O que fazer'), desc),
        h('div', { class: 'acoes' }, botao('Salvar a data', async () => {
          if (!data.value) { avisar('Informe a data final.', true); return; }
          try { const r = await api('prazos.vincular', { id: z.id, fatal: data.value, sistema: sis.value, descricao: desc.value });
            avisar(r.antes && r.antes !== r.fatal ? `Prazo igual ao ${sis.value}: ${dataBR(r.fatal)} (o painel tinha ${dataBR(r.antes)}).` : `Prazo confirmado igual ao ${sis.value}: ${dataBR(r.fatal)}.`);
            caixa.close(); caixa.remove(); ok(true); } catch (e) { avisar(e.message, true); }
        }), botao('Cancelar', () => { caixa.close(); caixa.remove(); ok(false); }, 'sec')));
      document.body.append(caixa); caixa.showModal();
    });
  }
  function registrarWhats(z, motivo, chave) { api('registro.whatsapp', { numero: z.numero || '', cliente: z.cliente || '', motivo, chave: chave || '' }).catch(() => {}); }
  // 8.20 (pedido da usuária): botão de aviso no WhatsApp que, ao clicar, vira "✓ Já avisado" na hora e fica assim (pode clicar de novo)
  function quandoAvisado(em, por) { if (!em) return ''; const d = new Date(em); return 'Avisado' + (por ? ' por ' + por : '') + (isNaN(d) ? '' : ' em ' + d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + ' · clique para mandar de novo'; }
  function botaoAvisar(link, texto, feito, aoClicar, cls, textoFeito) {
    const marcar = el => { el.textContent = textoFeito || '✓ Já avisado'; el.classList.add('feito'); };
    const a = h('a', { class: 'btn mini wa' + (cls ? ' ' + cls : ''), href: link, target: '_blank', rel: 'noopener noreferrer', title: feito ? quandoAvisado(feito.em, feito.por) : '',
      onclick: ev => { ev.stopPropagation(); marcar(a); a.title = quandoAvisado(new Date().toISOString(), sessao && sessao.usuario ? sessao.usuario.nome : ''); try { aoClicar && aoClicar(); } catch (e) { } } }, texto);
    if (feito && feito.em) marcar(a);
    return a;
  }
  function whatsPrazo(z) {
    let tel = telefoneWhats(z.telefone || '');
    if (!tel || !z.cliente) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String(z.cliente).split(' ')[0]);
    const ato = /PROVIS|a definir|conferir/i.test(z.descricao || '') ? '' : ` (${String(z.descricao || '').split(/[—:(]/)[0].trim().toLowerCase()})`;
    const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Passando para informar que hoje recebemos uma intimação no seu processo nº ${z.numero}${ato}. Nossa equipe já está cuidando do prazo e tomará as providências necessárias. Se precisarmos de algum documento ou informação, entraremos em contato.\n\nVocê pode acompanhar seu processo pelo site: https://araujoadvocaciasc.com.br/acompanhe/`;
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  }
  /** Meta interna: 2 dias úteis antes do fatal (sábado e domingo não contam). */
  function metaInterna(fatal) {
    if (!fatal) return '';
    let d = fatal, n = 0;
    while (n < 2) { d = isoSoma(d, -1); const w = diaSem(d); if (w !== 0 && w !== 6) n++; }
    return d;
  }

  function botoesPrazo(z) {
    const pode = sessao.usuario.pode;
    const tipoAviso = z.avisar_cliente || avisoCliente(z.descricao, z.observacoes, z.resumo_ia);
    const parar = fn => ev => { ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; fn().catch(e => { b.disabled = false; avisar(e.message, true); }); };
    const aberto = SITUACOES_ABERTAS.includes(z.situacao);
    return h('div', { class: 'mini-acoes' },
      SITUACOES_ABERTAS.includes(z.situacao) && tipoAviso ? h('button', { type: 'button', class: 'btn mini wa', title: 'A IA escreve o que aconteceu para mandar ao cliente', onclick: ev => { ev.stopPropagation(); dialogoAvisoCliente(z.id, { ...z, tipo: tipoAviso }); } }, '✨ Avisar o cliente') : null,
      aberto && z.situacao !== 'conferido' && !/^ato:/.test(z.observacoes || '') ? h('button', { type: 'button', class: 'btn mini sec', title: 'Digite a data final que aparece no PJe/eproc: o painel fica igual', onclick: parar(async () => { if (await dialogoDataSistema(z)) rota(); else throw new Error('Cancelado.'); }) }, '📌 Data do PJe/eproc') : null,
      aberto ? botaoConferido('prazo', z.id, 'Quem fez este prazo?') : null,
      aberto ? botoesEuFaco('prazo', z.id, z.responsavel) : null,
      aberto && /PROVIS|Vista ao|Prazo indicado|conferir/i.test(z.descricao || '') && !/^ato:/.test(z.observacoes || '')
        ? h('button', { type: 'button', class: 'btn mini sec', title: 'Abriu o processo e o ato não pede nada do escritório (ex.: vista ao MP, só ciência)',
            onclick: parar(async () => { if (!confirm('Confirma que este aviso NÃO tem prazo para o escritório? O prazo sai da lista (fica registrado quem conferiu).')) throw new Error('Cancelado.');
              await acaoPrazo('prazos.situacao', { id: z.id, situacao: 'semprazo' }, 'Marcado: sem prazo para o escritório.'); }) }, 'Não há prazo') : null,
      pode.conferePrazos && z.situacao === 'calculado'
        ? (filaDe(z) === 'conferir'
          ? h('button', { type: 'button', class: 'btn mini conferir', title: 'Abriu o processo no tribunal? Confirme dizendo onde conferiu', onclick: parar(async () => { await confirmarPrazoComFonte(z); avisar('Prazo confirmado.'); rota(); }) }, 'Conferi no tribunal')
          : h('button', { type: 'button', class: 'btn mini sec', title: 'Confirmar a data fatal calculada pelo robô', onclick: parar(() => acaoPrazo('prazos.conferir', { id: z.id }, 'Data do prazo confirmada.')) }, 'Confirmar data')) : null,
      z.situacao === 'cumprido' && !z.ok_em
        ? (pode.usuarios ? botoesOk('prazo', z.id) : h('span', { class: 'tag mini-tag atencao' }, 'feito por ' + (z.cumprido_por || '—') + ' · aguarda OK'))
        : null,
      z.situacao === 'cumprido' && z.ok_em ? h('span', { class: 'tag mini-tag ok' }, '✓ OK de ' + z.ok_por) : null,
      z.situacao === 'cancelado' && pode.usuarios
        ? h('button', { type: 'button', class: 'btn mini sec', onclick: parar(() => acaoPrazo('prazos.situacao', { id: z.id, situacao: 'reabrir' }, 'Prazo reaberto.')) }, 'Reabrir') : null);
  }
  const SITUACOES_ABERTAS = ['a definir', 'calculado', 'conferido'];
  /** 8.10: fila do prazo (igual ao servidor): conferir no tribunal / calculado pelo robô / confirmado. */
  const filaDe = z => z.fila !== undefined && z.fila !== null && z.fila !== '' ? z.fila
    : !SITUACOES_ABERTAS.includes(z.situacao) ? '' : z.situacao === 'conferido' ? 'confirmado'
    : (z.situacao === 'a definir' || /PROVISÓRIO/i.test(z.descricao || '') || /⚠ ATENÇÃO/.test(z.resumo_ia || '')) ? 'conferir' : 'calculado';
  const divergente = z => filaDe(z) === 'conferir' && /⚠ ATENÇÃO/.test(z.resumo_ia || '');
  const FONTES_CONF = ['Conferi no sistema do tribunal (PJe / eproc)', 'Publicação no DJEN', 'E-mail / intimação do tribunal', 'Outra fonte'];
  async function confirmarPrazoComFonte(z) {
    return new Promise((ok, falhou) => {
      const sel = h('select', {}, FONTES_CONF.map(f => h('option', { value: f }, f)));
      const obs = h('input', { type: 'text', maxlength: 100, placeholder: 'Detalhe (opcional): ex. "despacho de 03/11, 5 dias"' });
      const caixa = h('dialog', { class: 'dialogo' },
        h('h2', {}, 'Confirmar o prazo'),
        h('p', {}, `${z.descricao || 'Prazo'} · ${z.numero}`), h('p', { class: 'peq' }, `Data fatal: ${z.fatal ? dataBR(z.fatal) : '—'} (${textoDias(z)}). Se o ato pede outro prazo, feche e corrija os dias antes.`),
        divergente(z) ? h('p', { class: 'nota alerta' }, z.resumo_ia) : null,
        h('label', { class: 'campo' }, h('span', {}, 'Onde você conferiu?'), sel), h('label', { class: 'campo' }, h('span', {}, 'Detalhe'), obs),
        h('div', { class: 'acoes' },
          botao('✓ Confirmar a data', async () => { try { await api('prazos.conferir', { id: z.id, fonte: sel.value + (obs.value.trim() ? ' — ' + obs.value.trim() : '') }); caixa.close(); caixa.remove(); ok(); } catch (e) { avisar(e.message, true); } }),
          botao('Cancelar', () => { caixa.close(); caixa.remove(); falhou(new Error('Cancelado.')); }, 'sec')));
      document.body.append(caixa); caixa.showModal();
    });
  }
  const VERSAO_PAINEL = '8.28.0';

  /** Faixa de urgência do prazo (para a cor da linha). */
  function faixaPrazo(z) {
    if (!SITUACOES_ABERTAS.includes(z.situacao)) return 'encerrado';
    if (z.situacao === 'a definir' || !z.fatal) return 'definir';
    const d = diasAte(z.fatal);
    return d < 0 ? 'vencido' : d <= 2 ? 'urgente' : d <= 5 ? 'atencao' : 'tranquilo';
  }

  function tabelaPrazos(lista, vazio, ordem) {
    const cabFatal = ordem
      ? h('button', { type: 'button', class: 'ordenar', title: ordem.dir === 'asc' ? 'Mais urgentes primeiro. Clique para inverter.' : 'Mais distantes primeiro. Clique para inverter.', onclick: () => ordem.mudar(ordem.dir === 'asc' ? 'desc' : 'asc') },
        'Fatal ', h('span', { class: 'seta' }, ordem.dir === 'asc' ? '▼' : '▲'))
      : 'Fatal';
    return compacta(tabela([cabFatal, 'Processo', 'Cliente', 'O que fazer', 'Situação', ''], lista, z => [
      h('td', { class: 'num col-fatal', 'data-r': 'Fatal' }, z.fatal ? h('strong', { class: 'data-fatal' }, dataBR(z.fatal)) : '—', h('div', {}, etiquetaContagem(z.fatal)),
        z.fatal && SITUACOES_ABERTAS.includes(z.situacao) && metaInterna(z.fatal) >= hojeISO() ? h('div', { class: 'peq meta-int', title: 'Meta do escritório: 2 dias úteis antes do fatal' }, 'fazer até ' + dataBR(metaInterna(z.fatal))) : null),
      h('td', { class: 'num', 'data-r': 'Processo' }, z.numero, h('div', {}, acessoTribunal(z.numero))),
      h('td', { 'data-r': 'Cliente' }, z.cliente || h('span', { class: 'tag atencao' }, 'a identificar')),
      h('td', { 'data-r': 'O que fazer' }, h('div', { class: 'desc-prazo', title: z.descricao }, z.descricao), h('div', { class: 'peq' }, textoDias(z), z.ciencia ? ` · ciência ${dataBR(z.ciencia)}` : '', z.responsavel ? ` · com ${z.responsavel}` : ''),
        z.resumo_ia ? h('div', { class: 'peq ia-txt' + (/⚠/.test(z.resumo_ia) ? ' ia-alerta' : ''), title: z.resumo_ia }, z.resumo_ia) : null),
      h('td', { 'data-r': 'Situação' }, etiquetaPrazo(z)),
      h('td', {}, botoesPrazo(z))
    ], z => { location.hash = '#/prazo/' + z.id; }, vazio, z => filaDe(z) === 'conferir' ? 'linha-conferir' : 'linha-' + faixaPrazo(z)));
  }

  function linhaRobo(robo) {
    if (!robo || !robo.ultima) return 'O robô ainda não rodou. Ele lê o DJEN e os avisos do eproc e do PJe no Gmail de 6 em 6 horas.';
    return `Última leitura do robô: ${new Date(robo.ultima).toLocaleString('pt-BR')}. ${robo.resultado ? robo.resultado.replace(/^Robô em [^:]+: /, '') : ''}`;
  }

  const quando = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  /** Cartão do robô: última e próxima leitura; se estiver atrasado, roda sozinho ao abrir a tela. */
  /** 8.25: semáforo do robô — uma linha (verde/âmbar/vermelho) com o que falta para rodar 100%; os detalhes abrem embaixo. */
  function semaforoRobo(robo) {
    const faltas = [];
    const vServ = (robo && robo.versao) || '';
    if (!robo || !robo.ultima || robo.atrasado) faltas.push(['vermelho', 'o robô do Gmail não leu nas últimas horas']);
    if (sessao.usuario.pode.usuarios && (!vServ || vServ.localeCompare(VERSAO_PAINEL, undefined, { numeric: true }) < 0)) faltas.push(['amarelo', 'colar o Code.gs novo no Google (versão ' + VERSAO_PAINEL + ')']);
    const dj = (robo && robo.djen) || {};
    if (!dj.ultima || Date.now() - Date.parse(dj.ultima) > 26 * 3600e3) faltas.push(['amarelo', 'DJEN sem leitura há mais de 1 dia: ligue o "☁ Robô do DJEN" ou deixe o painel aberto no computador do escritório']);
    (robo && robo.alertas || []).forEach(a => faltas.push(['vermelho', a]));
    const nivel = faltas.some(f => f[0] === 'vermelho') ? 'vermelho' : faltas.length ? 'amarelo' : 'verde';
    const det = h('details', { class: 'semaforo s-' + nivel },
      h('summary', {}, h('span', { class: 'sem-ponto' }),
        h('span', {}, nivel === 'verde' ? 'Tudo funcionando · ' + (robo && robo.ultima ? 'última leitura ' + quando(robo.ultima) : '') : `Falta${faltas.length > 1 ? 'm' : ''} ${faltas.length} coisa${faltas.length > 1 ? 's' : ''} para rodar 100%: ` + faltas.map(f => f[1]).join(' · ')),
        h('span', { class: 'sem-ver' }, 'detalhes')),
      cartaoRobo(robo));
    return det;
  }
  function cartaoRobo(robo) {
    const atrasado = !robo || !robo.ultima || robo.atrasado;
    const status = h('div', { class: 'robo-txt' },
      h('strong', {}, atrasado ? 'Robô atrasado: atualizando agora…' : 'Robô ligado · lê o Gmail de hora em hora (todos os tribunais, inclusive o spam) e o DJEN de 2 em 2 horas'),
      h('div', { class: 'peq' }, robo && robo.ultima ? `Última leitura: ${quando(robo.ultima)}` + (robo.proxima ? ` · próxima: ${quando(robo.proxima)}` : '') : 'Ainda não houve leitura.'),
      robo && robo.resultado ? h('div', { class: 'peq' }, robo.resultado.replace(/^Robô em [^:]+: /, '')) : null);
    const rodar = async btn => {
      if (btn) { btn.disabled = true; btn.textContent = 'Lendo intimações…'; }
      const aqui = location.hash;
      try { const r = await api('robo.rodar'); avisar(r.resumo.replace(/^Robô em [^:]+: /, '')); if (location.hash === aqui) rota(); }
      catch (e) { avisar(e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Atualizar agora'; } }
    };
    const btn = botao('Atualizar agora', ev => rodar(ev.target), 'sec');
    const dj = (robo && robo.djen) || {};
    const hojeD = hojeISO();
    const linkDjen = djenLinkPublico('54832', 'SC', isoSoma(hojeD, -7), hojeD);
    const djVelho = !dj.ultima || Date.now() - Date.parse(dj.ultima) > 6 * 3600e3;
    const linhaDjen = h('div', { class: 'peq djen-linha' + (dj.erro && djVelho ? ' erro' : '') },
      h('strong', {}, 'DJEN: '),
      dj.ultima ? `última leitura boa: ${quando(dj.ultima)} · lido de 2 em 2 horas enquanto o painel estiver aberto em algum computador (o CNJ bloqueia os servidores do Google, então não dá para ler com o painel fechado)` : 'ainda não foi lido pelo navegador',
      dj.erro ? h('span', {}, djVelho ? ' · problema: ' + dj.erro : ' · a última tentativa falhou, mas o painel tenta de novo sozinho em 15 min') : null,
      ' · ', h('button', { type: 'button', class: 'link escuro', onclick: async ev => {
        ev.target.disabled = true; ev.target.textContent = 'lendo o DJEN…';
        const r = await lerDjenNavegador(true);
        if (r && r.ok) { avisar(`DJEN lido: ${r.total} comunicação(ões) no período, ${r.novas} nova(s).`); rota(); }
        else { avisar('Não consegui ler o DJEN: ' + ((r && r.erro) || 'tente de novo') + '. Use o link "ver no site do DJEN".', true); ev.target.disabled = false; ev.target.textContent = 'ler o DJEN agora'; }
      } }, 'ler o DJEN agora'),
      ' · ', h('a', { href: linkDjen, target: '_blank', rel: 'noopener noreferrer' }, 'ver no site do DJEN'));
    status.append(linhaDjen);
    (robo && robo.alertas || []).forEach(a => status.append(h('div', { class: 'robo-alerta' }, '⚠ ' + a)));
    const dj2 = (robo && robo.datajud) || {}, ia = (robo && robo.ia) || {};
    if (dj2.ultima || dj2.erro) {
      const iniDj = (dj2.ultima || '').split(' ')[0], prox = iniDj && !isNaN(Date.parse(iniDj)) ? new Date(Date.parse(iniDj) + 4 * 3600e3).toISOString() : '';
      status.append(h('div', { class: 'peq' + (dj2.erro ? ' erro' : '') }, h('strong', {}, 'Andamentos (DataJud/CNJ): '),
        dj2.ultima ? dj2.ultima.replace(/^(\S+)/, iso => quando(iso)) : '',
        dj2.ok ? ' · última leitura boa: ' + quando(dj2.ok) : '',
        prox ? ' · próxima tentativa: ' + quando(prox) : '',
        dj2.erro ? ' · problema: ' + dj2.erro : ''));
    }
    const tr = robo && robo.tempoRobo;
    if (tr && sessao.usuario.pode.usuarios) status.append(h('div', { class: 'peq' + (tr.min >= 70 ? ' erro' : '') }, h('strong', {}, 'Tempo de robô hoje: '),
      `${tr.min} de 90 min do Google`, tr.ontem != null ? ` · ontem: ${tr.ontem} min` : '', tr.min >= 70 ? ' · perto do limite: o Google para os robôs ao chegar em 90' : ''));
    if (robo && robo.agenda) status.append(h('div', { class: 'peq' }, h('strong', {}, 'Google Agenda: '), robo.agenda.replace(/^(\S+)/, iso => quando(iso)), ' · prazos fatais na agenda "PRAZOS FATAIS" do celular'));
    const iaPassageiro = /\b(503|429|500)\b|high demand|overloaded|try again later/i.test(ia.erro || '');
    if (ia.ligada || ia.erro) status.append(h('div', { class: 'peq' + (ia.erro && !iaPassageiro ? ' erro' : '') }, h('strong', {}, 'Resumo por IA: '),
      ia.ultima ? ia.ultima.replace(/^(\S+)/, iso => quando(iso)) : 'ligado',
      ia.erro ? (iaPassageiro ? ' · o Google estava ocupado na última vez; o robô tenta de novo sozinho (e usa o outro modelo se precisar)' : ' · problema: ' + ia.erro) : ''));
    // o programa do Google ainda é o antigo? (os avisos de 429 e do modelo aposentado só somem com o Code.gs novo)
    const vServ = (robo && robo.versao) || '';
    const velho = !vServ || vServ.localeCompare(VERSAO_PAINEL, undefined, { numeric: true }) < 0;
    if (velho && robo && sessao.usuario.pode.usuarios) status.append(h('div', { class: 'robo-alerta' }, '⚠ O programa do Google está ', vServ ? 'na versão ' + vServ : 'desatualizado',
      ' e o painel é da ' + VERSAO_PAINEL + '. Cole o Code.gs novo no Apps Script e publique uma Nova versão: ',
      h('a', { href: 'https://raw.githubusercontent.com/advogadajulianaraujo/site-araujo-advocacia/main/painel-backend/Code.gs', target: '_blank', rel: 'noopener noreferrer' }, 'abrir o Code.gs')));
    if ((dj2.erro || (ia.erro && !iaPassageiro)) && !velho && sessao.usuario.pode.usuarios) status.append(h('div', {}, h('button', { type: 'button', class: 'btn mini', onclick: async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Consertando (até 2 min)…';
      try { const r = await api('robo.consertar'); const ok = !(r.datajud && r.datajud.erro) && !(r.ia && r.ia.erro); avisar(ok ? 'Pronto: DataJud e IA funcionando.' : 'Ainda há problema: ' + [(r.datajud || {}).erro, (r.ia || {}).erro].filter(Boolean).join(' · '), !ok); rota(); }
      catch (e) { avisar(e.message, true); b.disabled = false; b.textContent = 'Consertar agora'; }
    } }, 'Consertar agora'), h('span', { class: 'peq' }, ' roda o DataJud e testa a IA na hora; o aviso some quando funcionar.')));
    const cartao = h('div', { class: 'robo-cartao ' + (atrasado ? 'parado' : 'ligado') }, h('span', { class: 'ponto', 'aria-hidden': 'true' }), status, btn);
    if (atrasado && !ler('robo_auto')) { guardar('robo_auto', Date.now()); const h0 = location.hash; setTimeout(() => { if (location.hash === h0 && !btn.disabled) rodar(btn); }, 300); }
    return cartao;
  }

  /* eproc (TJSC e Justiça Federal: cível, família, federal…) ou PJe (Justiça do Trabalho). Cada pessoa escolhe uma vez. */
  const SISTEMAS = [['todos', 'Todos'], ['civel', 'eproc · Cível'], ['federal', 'eproc · Federal'], ['pje', 'PJe · Trabalhista']];
  const NOME_SIS = { todos: 'Prazos', civel: 'Prazos · eproc Cível', federal: 'Prazos · eproc Federal', pje: 'Prazos · PJe' };
  function sistemaDoPrazo(z) {
    const s = String(z.sistema || '').toLowerCase(), t = String(z.tribunal || ''), n = String(z.numero || '');
    if (/pje/.test(s) && !/\.4\.\d{2}\.\d{4}$/.test(n)) return 'pje';
    if (/^(TRT|TST)/i.test(t) || /\.5\.\d{2}\.\d{4}$/.test(n)) return 'pje';
    if (/^(TRF|JF)/i.test(t) || /\.4\.\d{2}\.\d{4}$/.test(n)) return 'federal';
    return 'civel';
  }
  function sistemaPreferido() { try { const v = localStorage.getItem('prazos_sistema') || 'todos'; return NOME_SIS[v] ? v : 'todos'; } catch (e) { return 'todos'; } }

  async function telaPrazos(params) {
    carregando();
    const encerrados = params.get('encerrados') === '1';
    const ver = params.get('ver') || 'todos';
    const sis = NOME_SIS[params.get('sis')] ? params.get('sis') : sistemaPreferido();
    const [listaToda, resumo] = await Promise.all([api('prazos.listar', { encerrados }), api('resumo')]);
    const porSis = { todos: listaToda.length, civel: 0, federal: 0, pje: 0 };
    listaToda.forEach(z => { if (SITUACOES_ABERTAS.includes(z.situacao) || encerrados) porSis[sistemaDoPrazo(z)]++; });
    const listaSis = sis === 'todos' ? listaToda : listaToda.filter(z => sistemaDoPrazo(z) === sis);
    // 8.10: filas separadas — conferir no tribunal (âmbar) × calculados × confirmados (o vermelho fica só para prazo confirmado em risco)
    const fila = ['conferir', 'calculado', 'confirmado'].includes(params.get('fila')) ? params.get('fila') : '';
    const nFila = { conferir: 0, calculado: 0, confirmado: 0, div: 0 };
    listaSis.forEach(z => { const f = filaDe(z); if (nFila[f] !== undefined) nFila[f]++; if (divergente(z)) nFila.div++; });
    const lista = fila ? listaSis.filter(z => filaDe(z) === fila) : listaSis;
    const mudarSis = v => { try { localStorage.setItem('prazos_sistema', v); } catch (e) { /* ok */ } ir({ sis: v === 'todos' ? '' : v }); };
    const dir = params.get('ordem') === 'desc' ? 'desc' : 'asc';
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/prazos' + (q.toString() ? '?' + q : ''); };
    const ordem = { dir, mudar: d => ir({ ordem: d === 'asc' ? '' : d }) };

    const abertos = lista.filter(z => SITUACOES_ABERTAS.includes(z.situacao));
    const conta = f => lista.filter(z => faixaPrazo(z) === f).length;
    const FILTROS = [
      ['todos', 'Todos', null],
      ['vencido', 'Vencidos', 'vencido'], ['urgente', 'Até 2 dias', 'urgente'], ['atencao', '3 a 5 dias', 'atencao'],
      ['definir', 'A definir', 'definir'], ['conferir', 'A conferir', null], ['hoje', 'Vencem hoje', null], ['meus', 'Meus prazos', null]];
    const passa = z => ver === 'todos' ? true : ver === 'conferir' ? z.situacao === 'calculado' : ver === 'hoje' ? z.fatal === hojeISO() && SITUACOES_ABERTAS.includes(z.situacao)
      : ver === 'meus' ? z.responsavel === sessao.usuario.usuario : faixaPrazo(z) === ver;
    const nConferir = lista.filter(z => z.situacao === 'calculado').length;

    // Uma tabela só: sem data fatal vai sempre no topo (é o mais perigoso); o resto pela data fatal
    const todosOrdenados = lista.filter(passa)
      .sort((a, b) => {
        if (divergente(a) !== divergente(b)) return divergente(a) ? -1 : 1; // divergência da IA sempre no topo
        if (!a.fatal !== !b.fatal) return a.fatal ? 1 : -1;
        const x = a.fatal || '', y = b.fatal || ''; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'asc' ? 1 : -1);
      });
    const nProv = lista.filter(z => SITUACOES_ABERTAS.includes(z.situacao) && /PROVISÓRIO/i.test(z.descricao || '')).length;

    const kpi = (n, rotulo, cls, f) => h('button', { type: 'button', class: 'kpi ' + cls + (ver === f ? ' ativo' : ''), onclick: () => ir({ ver: ver === f ? '' : f }) },
      h('b', {}, String(n)), h('span', {}, rotulo));
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Intimações e prazos'),
        h('p', {}, `${abertos.length} prazo${abertos.length === 1 ? '' : 's'} em aberto${sis === 'todos' ? '' : { pje: ' no PJe (trabalhista)', civel: ' no eproc cível', federal: ' no eproc federal' }[sis]} · contagem até 23h59 do dia fatal`)),
        h('div', { class: 'barra' }, sessao.usuario.pode.usuarios ? botao('☁ Robô do DJEN', () => dialogoRoboDjen(), 'sec') : null, sessao.usuario.pode.usuarios ? botao('🔧 Revisar prazos', () => dialogoRevisaoPrazos(), 'sec') : null, botao('Novo prazo', () => { location.hash = '#/prazo/novo'; }))),
      semaforoRobo(resumo.robo),
      blocoAguardandoOk(),
      h('div', { class: 'filas-prazo', role: 'group', 'aria-label': 'Filas de prazos' },
        [['conferir', '⚠ Conferir no tribunal', 'provisórios, sem data ou com divergência da IA: abrir o processo e confirmar'],
         ['calculado', 'Calculados pelo robô', 'o ato veio no aviso: só confirmar a data'],
         ['confirmado', '✓ Prazo confirmado', 'alguém conferiu: agora é fazer']].map(([f, rot, dica]) =>
          h('button', { type: 'button', class: 'fila-bt fila-' + f + (fila === f ? ' ativo' : ''), 'aria-pressed': String(fila === f), title: dica, onclick: () => ir({ fila: fila === f ? '' : f }) },
            h('b', {}, String(nFila[f])), h('span', {}, rot), f === 'conferir' && nFila.div ? h('small', {}, `${nFila.div} com divergência da IA`) : h('small', {}, dica))),
        fila ? h('button', { type: 'button', class: 'link', onclick: () => ir({ fila: '' }) }, 'ver todas') : null),
      h('div', { class: 'seg-sistema', role: 'group', 'aria-label': 'Sistema' },
        SISTEMAS.map(([v, rot]) => h('button', { type: 'button', class: 'seg' + (sis === v ? ' ativo' : ''), 'aria-pressed': String(sis === v), onclick: () => mudarSis(v) },
          rot, v !== 'todos' ? h('span', { class: 'seg-n' }, String(porSis[v])) : null)),
        h('span', { class: 'peq seg-dica' }, 'Fica guardado neste computador.')),
      h('div', { class: 'barra-filtros' },
        h('div', { class: 'chips' }, FILTROS.map(([f, rot, cat]) => { const n = cat ? conta(cat) : f === 'conferir' ? nConferir : null;
          return h('button', { type: 'button', class: 'chip-filtro' + (ver === f ? ' ativo' : '') + (n && (f === 'vencido' || f === 'urgente') ? ' chip-alerta' : ''), onclick: () => ir({ ver: f === 'todos' ? '' : f }) }, rot, n ? h('span', { class: 'cb-n' }, String(n)) : null); })),
        h('div', { class: 'barra' },
          h('button', { type: 'button', class: 'chip-filtro ordem', onclick: () => ordem.mudar(dir === 'asc' ? 'desc' : 'asc') }, dir === 'asc' ? '▼ Mais urgentes primeiro' : '▲ Mais distantes primeiro'),
          h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: encerrados, onchange: e => ir({ encerrados: e.target.checked ? '1' : '' }) }), 'Mostrar cumpridos (30 dias)'))),
      sessao.usuario.pode.usuarios && conta('vencido') ? h('div', { class: 'nota alerta baixa-lote' },
        h('strong', {}, `${conta('vencido')} prazo(s) vencido(s) sem baixa${sis === 'todos' ? '' : ' neste sistema'}.`),
        ' Se já foram resolvidos, dê baixa em todos de uma vez (eles saem da lista; dá para reabrir em "Mostrar cumpridos"). ',
        botao('Dar baixa em todos os vencidos', async ev => {
          const b = ev.target;
          try {
            const c = await api('prazos.baixarVencidos', { contar: true });
            if (!confirm(`Dar baixa em ${c.vencidos} prazo(s) com data fatal antes de hoje, de todos os sistemas? Os de hoje em diante continuam.`)) return;
            b.disabled = true; b.textContent = 'Dando baixa…';
            const r = await api('prazos.baixarVencidos', {});
            avisar(`${r.baixados} prazo(s) vencido(s) baixado(s).`); rota();
          } catch (e) { avisar(e.message, true); b.disabled = false; b.textContent = 'Dar baixa em todos os vencidos'; }
        }, 'sec mini')) : null,
      nProv ? h('div', { class: 'nota conferir' }, h('strong', {}, `${nProv} prazo${nProv === 1 ? '' : 's'} provisório${nProv === 1 ? '' : 's'}.`),
        ' O aviso do tribunal não informa o ato (no PJe vem "documento sigiloso"), então o robô usou o prazo mais curto (5 dias). Abra no sistema do tribunal, confira o ato e aperte "Conferi no tribunal" (diz onde conferiu) ou corrija os dias. Eles ficam na fila âmbar "Conferir no tribunal" e, na agenda, aparecem como "⚠ CONFERIR".') : null,
      h('section', { class: 'bloco-prazos' }, h('h2', {}, `Prazos (${todosOrdenados.length})`),
        h('div', { class: 'legenda-prazos peq' }, h('span', { class: 'lg vencido' }, 'vencido'), h('span', { class: 'lg urgente' }, 'até 2 dias'), h('span', { class: 'lg atencao' }, '3 a 5 dias'), h('span', { class: 'lg tranquilo' }, 'mais de 5 dias')),
        tabelaPrazos(todosOrdenados, ver === 'todos' ? 'Nenhum prazo em aberto.' : 'Nenhum prazo neste filtro.', ordem)),
      blocoIntimacoes(sis),
      h('details', { class: 'caixa' }, h('summary', {}, 'Como o robô calcula os prazos'),
        h('p', {}, 'A ciência é a data em que a intimação é aberta (confirmada) ou, se ninguém abrir, a tácita: 10 dias após a expedição. No DJEN, é o dia útil seguinte à disponibilização. A contagem usa dias úteis, os feriados cadastrados e o recesso de 20/12 a 20/01, até as 23h59 do dia fatal.'),
        h('p', {}, 'O robô roda sozinho de 6 em 6 horas (0h, 6h, 12h, 18h, aproximadamente) e recalcula os prazos em aberto. Todo prazo calculado pelo robô fica marcado até a advogada conferir no eproc ou no PJe.')),
      sessao.usuario.pode.usuarios ? blocoFeriados() : null);
  }

  /** Lista das intimações, sempre aberta na tela: busca, filtro do sistema, prazo de cada uma e "Marcar na agenda". */
  function blocoIntimacoes(sis) {
    const caixa = h('section', { class: 'caixa bloco-intim', id: 'intimacoes' });
    let limite = 30, busca = '', todas = false;
    const campoBusca = h('input', { type: 'search', placeholder: 'Buscar intimação por número, cliente ou texto', 'aria-label': 'Buscar intimação' });
    const corpo = h('div', {}, h('p', { class: 'peq' }, 'Carregando as intimações…'));
    const titulo = h('h2', {}, 'Intimações recebidas');
    const carregar = async () => {
      try {
        let r = await api('intimacoes.listar', { limite: sis === 'todos' ? limite : limite * 3, busca, abertas: !todas });
        if (Array.isArray(r)) r = { total: r.length, lista: r };
        const lista = r.lista.filter(i => sis === 'todos' || sistemaDoPrazo({ sistema: i.fonte, tribunal: i.tribunal, numero: i.numero }) === sis).slice(0, limite);
        titulo.textContent = todas ? `Intimações recebidas (${r.total})` : `Intimações a fazer (${r.total})`;
        corpo.replaceChildren(...[lista.length ? h('ul', { class: 'lista-intim' }, lista.map(itemIntimacao)) : h('p', { class: 'peq' }, busca ? 'Nenhuma intimação com essa busca.' : todas ? 'Nenhuma intimação lida ainda.' : '✓ Nenhuma intimação esperando. Tudo conferido.'),
          r.total > limite ? h('div', { class: 'acoes' }, botao('Mostrar mais 30', () => { limite += 30; carregar(); }, 'sec')) : null].filter(Boolean));
      } catch (e) { corpo.replaceChildren(h('p', { class: 'erro' }, e.message)); }
    };
    let t;
    campoBusca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { busca = campoBusca.value.trim(); limite = 30; carregar(); }, 350); });
    const chkTodas = h('label', { class: 'marcar' }, h('input', { type: 'checkbox', onchange: ev => { todas = ev.target.checked; limite = 30; carregar(); } }), 'Mostrar também as já conferidas');
    caixa.append(h('div', { class: 'cab-intim' }, titulo, h('div', { class: 'barra' }, chkTodas, campoBusca)),
      h('p', { class: 'peq' }, 'O que o robô leu (Gmail do eproc e do PJe, DJEN), da mais nova para a mais antiga. Avise o cliente no WhatsApp e aperte "Conferido" quando terminar: sai da lista e vai para o OK da administração. Nada é apagado.'), corpo);
    carregar();
    return caixa;
  }

  function itemIntimacao(i) {
    const z = i.prazo;
    const tipoAviso = avisoCliente(z && z.descricao, i.movimento, i.texto && i.texto.slice(0, 2000), i.resumo_ia);
    const ia = h('div', { class: 'peq ia-txt' + (/⚠/.test(i.resumo_ia || '') ? ' ia-alerta' : /estimativa/.test(i.resumo_ia || '') ? ' ia-estimativa' : '') }, i.resumo_ia || '');
    if (!i.resumo_ia) ia.hidden = true;
    const btIA = h('button', { type: 'button', class: 'btn mini ia-bt', onclick: async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Lendo…';
      try { const r = await api('ia.resumirIntimacao', { id: i.id }); ia.textContent = r.resumo_ia; ia.hidden = false; ia.className = 'peq ia-txt' + (/⚠/.test(r.resumo_ia) ? ' ia-alerta' : /estimativa/.test(r.resumo_ia) ? ' ia-estimativa' : ''); b.textContent = '✨ Resumir de novo'; }
      catch (e) { avisar(e.message, true); b.textContent = '✨ Resumir com IA'; }
      b.disabled = false;
    } }, i.resumo_ia ? '✨ Resumir de novo' : '✨ Resumir com IA');
    const pode = sessao.usuario.pode;
    return h('li', { class: 'item-intim' + (i.terminada_por ? ' terminada' : '') },
      h('div', { class: 'intim-topo' },
        h('strong', {}, new Date(i.recebido_em).toLocaleDateString('pt-BR')), h('span', { class: 'tag mini-tag' }, i.fonte || '—'),
        i.processo_id ? h('a', { class: 'num', href: '#/processo/' + i.processo_id }, i.numero) : h('span', { class: 'num' }, i.numero),
        i.cliente ? h('span', { class: 'peq' }, '· ' + i.cliente) : null,
        acessoTribunal(i.numero)),
      h('div', { class: 'intim-mov' }, i.movimento || '—'),
      i.partes_cliente && !i.cliente ? h('div', { class: 'peq' }, 'Cliente no aviso: ' + i.partes_cliente) : null,
      ia,
      i.texto ? h('details', { class: 'intim-texto' }, h('summary', {}, 'Ver o texto'), h('div', { class: 'peq' }, i.texto)) : null,
      h('div', { class: 'intim-acoes' },
        z ? h('a', { class: 'chip-filtro', href: '#/prazo/' + z.id }, z.fatal ? `Prazo: ${z.descricao ? z.descricao.slice(0, 40) + ' · ' : ''}fatal ${dataBR(z.fatal)}` : 'Prazo: a definir', ['cumprido', 'cancelado'].includes(z.situacao) ? ' (feito)' : '') : h('span', { class: 'peq' }, 'Sem prazo aberto'),
        i.ato ? h('a', { class: 'tag ok', href: '#/agenda?data=' + i.ato.data }, '📅 Na agenda: ' + i.ato.tipo + ' ' + dataBR(i.ato.data))
          : botao('📅 Marcar na agenda', () => caixaMarcarAto({ intimacao_id: i.id, processo_id: i.processo_id, numero: i.numero, texto: [i.movimento, i.texto].join(' ') }), 'sec mini'),
        btIA),
      h('div', { class: 'intim-final' },
        tipoAviso && z ? h('button', { type: 'button', class: 'btn mini wa', title: 'A IA escreve o que aconteceu para mandar ao cliente', onclick: () => dialogoAvisoCliente(z.id, { telefone: i.telefone, cliente: i.cliente, numero: i.numero, tipo: tipoAviso }) }, '1 · ✨ Avisar o cliente')
          : h('span', { class: 'peq', title: 'Só perícia, contestação (réplica), audiência, sentença e acordo pedem aviso ao cliente' }, 'Não precisa avisar o cliente'),
        i.terminada_por
          ? h('span', { class: 'terminada-tag' }, '✓ Conferida por ', h('strong', {}, i.terminada_por), i.terminada_em ? ' · ' + new Date(i.terminada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '',
            i.ok_por ? ' · OK de ' + i.ok_por : ' · aguarda OK')
          : h('span', { class: 'passo2' }, botaoConferido('intimacao', i.id, 'Quem fez esta intimação?', null, '2 · ✓ Conferido')),
        i.terminada_por ? null : botoesEuFaco('intimacao', i.id, i.responsavel),
        i.terminada_por && !i.ok_por && pode.usuarios ? botoesOk('intimacao', i.id) : null));
  }

  /** Janela para lançar audiência ou perícia na agenda. O prazo da intimação continua na lista. */
  function caixaMarcarAto(o) {
    const t = String(o.texto || '').toLowerCase();
    const tipoSug = /per[ií]cia|perito/.test(t) ? 'pericia' : /instru/.test(t) ? 'instrucao' : /media[cç][aã]o/.test(t) ? 'mediacao' : /inicial|\buna\b/.test(t) ? 'inicial' : 'conciliacao';
    const caixa = h('dialog', { class: 'dialogo' });
    const form = h('form', { class: 'campos', novalidate: true },
      h('h2', { class: 'largo' }, 'Marcar na agenda'),
      h('p', { class: 'largo peq' }, 'Processo ', h('span', { class: 'num' }, o.numero || ''), '. Abra o processo no sistema do tribunal, confira a data e o horário e lance aqui. Vai para o Google Agenda certo e vira um lembrete na lista de prazos; o prazo da intimação continua lá.'),
      campo('tipo', 'O que é', tipoSug, { opcoes: [['conciliacao', 'Audiência de conciliação'], ['instrucao', 'Audiência de instrução'], ['inicial', 'Audiência inicial / una'], ['mediacao', 'Audiência de mediação (CEJUSC)'], ['pericia', 'Perícia']] }),
      campo('data', 'Data', '', { tipo: 'date', obrigatorio: true }),
      campo('hora', 'Horário', '', { tipo: 'time' }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Marcar na agenda'), botao('Cancelar', () => caixa.close(), 'sec')),
      h('p', { class: 'erro largo' }));
    aoEnviar(form, async fd => {
      const r = await api('agenda.marcarAto', { intimacao_id: o.intimacao_id || '', processo_id: o.processo_id || '', tipo: fd.get('tipo'), data: fd.get('data'), hora: fd.get('hora') });
      caixa.close();
      avisar(r.erro_agenda ? 'Lembrete criado, mas o Google Agenda recusou (' + r.erro_agenda + '). O robô tenta de novo sozinho.' : 'Marcado na agenda.', !!r.erro_agenda);
      rota();
    });
    caixa.append(form);
    caixa.addEventListener('close', () => caixa.remove());
    document.body.append(caixa);
    caixa.showModal();
  }

  function blocoFeriados() {
    const det = h('details', { class: 'caixa' }, h('summary', {}, 'Feriados e suspensões de prazo'));
    det.addEventListener('toggle', async () => {
      if (!det.open || det.dataset.ok) return;
      det.dataset.ok = '1';
      const lista = await api('feriados.listar').catch(() => []);
      const form = h('form', { class: 'barra', novalidate: true },
        h('input', { type: 'date', name: 'data', required: true, 'aria-label': 'Data' }),
        h('input', { name: 'descricao', placeholder: 'Ex.: feriado municipal de Tubarão / sistema fora do ar', 'aria-label': 'Descrição' }),
        h('select', { name: 'abrangencia', 'aria-label': 'Vale para' }, h('option', { value: 'todos' }, 'Todos os tribunais'), h('option', { value: 'TJSC' }, 'Só TJSC'), h('option', { value: 'TRT12' }, 'Só TRT12'), h('option', { value: 'JF/JT' }, 'Justiça Federal e do Trabalho')),
        h('button', { type: 'submit', class: 'btn sec' }, 'Acrescentar'), h('p', { class: 'erro' }));
      aoEnviar(form, async fd => {
        await api('feriados.salvar', Object.fromEntries(fd.entries()));
        avisar('Feriado salvo. Os prazos do robô foram recalculados.');
        rota();
      });
      det.append(h('p', { class: 'peq' }, 'O recesso de 20/12 a 20/01 é automático. Acrescente feriados municipais das comarcas e dias em que o tribunal suspender os prazos.'),
        form, h('ul', { class: 'lista-int' }, lista.filter(f => f.data >= hojeISO()).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 30)
          .map(f => h('li', {}, h('strong', {}, dataBR(f.data)), ' · ', f.descricao, ' · ', h('span', { class: 'peq' }, f.abrangencia)))));
    });
    return det;
  }

  async function telaPrazo(id, params) {
    carregando();
    const novo = id === 'novo';
    const [procs, lista] = await Promise.all([api('processos.listar', {}), novo ? Promise.resolve([]) : api('prazos.listar', { encerrados: true })]);
    let z = novo ? { processo_id: params.get('processo') || '', contagem: 'uteis', ciencia: hojeISO() } : lista.find(x => x.id === id);
    if (!z) z = (await apiFresco('prazos.listar', { encerrados: true })).find(x => x.id === id);
    if (!z) throw new Error('Prazo não encontrado.');
    const opcoes = [['', '— escolha o processo —']].concat(procs.filter(p => p.numero).map(p => [p.id, p.numero + ' · ' + (p.cliente_nome || 'cliente a identificar')]));
    const form = h('form', { class: 'caixa', novalidate: true },
      h('div', { class: 'campos' },
        campo('processo_id', 'Processo', z.processo_id, { opcoes, largo: true }),
        campo('descricao', 'O que fazer', z.descricao, { max: 200, dica: 'Ex.: Contestação, Recurso ordinário, Manifestação' }),
        campo('dias', 'Dias do prazo', z.dias, { modo: 'numeric', max: 3 }),
        campo('contagem', 'Contagem', z.contagem, { opcoes: [['uteis', 'Dias úteis'], ['corridos', 'Dias corridos (ex.: criminal)']] }),
        campo('ciencia', 'Data da ciência / publicação', z.ciencia, { tipo: 'date' }),
        campo('fatal', 'Data fatal (só se quiser digitar à mão)', '', { tipo: 'date' }),
        campo('observacoes', 'Observações', z.observacoes, { area: true, largo: true })),
      h('p', { class: 'peq' }, 'Deixe a data fatal em branco para o painel calcular a partir da ciência, contando dias úteis, feriados e o recesso.'),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, novo ? 'Lançar prazo' : 'Salvar'), h('a', { class: 'btn sec', href: '#/prazos' }, 'Voltar')),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      if (!novo) d.id = z.id;
      if (!d.fatal) delete d.fatal;
      const r = await api('prazos.salvar', { prazo: d });
      avisar(r.fatal ? 'Prazo salvo. Data fatal: ' + dataBR(r.fatal) + '.' : 'Prazo salvo, ainda sem data fatal (faltam os dias ou a ciência).');
      location.hash = '#/prazo/' + r.id;
      if (!novo) telaPrazo(r.id, new URLSearchParams());
    });
    const info = novo ? null : h('div', { class: 'caixa' },
      h('div', { class: 'linha-info' }, h('div', {}, h('div', { class: 'peq' }, 'Data fatal'), h('strong', { class: 'grande' }, z.fatal ? dataBR(z.fatal) : '—'), ' ', etiquetaContagem(z.fatal)),
        h('div', {}, etiquetaPrazo(z)), botoesPrazo(z)),
      h('p', {}, h('span', { class: 'num' }, z.numero), ' · ', z.cliente || 'cliente a identificar', ' · ', acessoTribunal(z.numero)),
      z.ciencia_tipo ? h('p', { class: 'peq' }, 'Ciência: ' + z.ciencia_tipo) : null,
      z.responsavel ? h('p', { class: 'peq' }, 'Responsável: ' + z.responsavel + ' · ', h('a', { href: '#/tarefas?quem=todos' }, 'ver no quadro de tarefas')) : null,
      h('div', { class: 'ia-caixa' + (/⚠/.test(z.resumo_ia || '') ? ' ia-alerta' : /estimativa/.test(z.resumo_ia || '') ? ' ia-estimativa' : '') },
        z.resumo_ia ? h('p', {}, z.resumo_ia, h('span', { class: 'peq' }, ' — resumo automático; confira no processo antes de agir.')) : h('p', { class: 'peq' }, 'Sem resumo da IA ainda. Se o aviso não trouxer o texto do ato, a IA estima pelo nome do ato e pelas movimentações do processo.'),
        botao(z.resumo_ia ? 'Resumir de novo com IA' : 'Resumir com IA', async ev => {
          ev.target.disabled = true; ev.target.textContent = 'Lendo a intimação…';
          try { await api('ia.resumirPrazo', { id: z.id }); avisar('Resumo da IA pronto.'); telaPrazo(z.id, new URLSearchParams()); }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Resumir com IA'; }
        }, 'sec mini')),
      /^ato:/.test(z.observacoes || '') ? null : h('div', { class: 'acoes-sec' }, botao('📅 Marcar audiência ou perícia na agenda', () => caixaMarcarAto({ intimacao_id: z.intimacao_id || '', processo_id: z.processo_id, numero: z.numero, texto: [z.descricao, z.observacoes, z.resumo_ia].join(' ') }), 'sec mini'),
        h('span', { class: 'peq' }, ' Este prazo continua na lista.')),
      h('p', { class: 'peq' }, 'Origem: ' + z.origem + (z.observacoes ? ' · ' + z.observacoes : '')));
    const procZ = procs.find(p => p.id === z.processo_id);
    mostrar(h('div', { class: 'cab' }, h('h1', {}, novo ? 'Novo prazo' : (z.descricao || 'Prazo'))), info, novo ? null : blocoMemoriaPrazo(z), novo ? null : notasDoCliente(procZ && procZ.cliente_id), form);
  }
  /** 8.23: a conta do prazo, passo a passo (como o PJe faz), para conferir com o sistema do tribunal. */
  function blocoMemoriaPrazo(z) {
    const det = h('details', { class: 'caixa memoria-prazo' }, h('summary', {}, '🧮 Como o painel contou este prazo'), h('p', { class: 'peq' }, 'Calculando…'));
    det.addEventListener('toggle', () => {
      if (!det.open || det.dataset.ok) return; det.dataset.ok = '1';
      api('prazos.memoria', { id: z.id }).then(r => {
        det.lastChild.replaceWith(h('div', {},
          h('ol', { class: 'memoria-passos' }, r.passos.map(p => h('li', {}, p.t))),
          r.fatal ? h('p', {}, h('strong', {}, 'Data final pela conta: ' + dataBR(r.fatal)), r.confere ? ' ✓ igual à gravada' : h('span', { class: 'tag conferir' }, ' a gravada é ' + dataBR(r.gravado) + ' (o robô acerta na próxima rodada, se o prazo for dele)')) : null,
          r.dias && r.dias.length <= 30 ? h('p', { class: 'peq memoria-dias' }, r.dias.map(x => `${x.n}º ${dataBR(x.data).slice(0, 5)}`).join(' · ')) : null,
          h('p', { class: 'peq' }, 'Regras: ciência em dia sem expediente vale no 1º dia útil seguinte (Lei 11.419/2006); conta a partir do dia útil seguinte (CPC arts. 219 e 224; CLT art. 775); recesso de 20/12 a 20/01 suspende (CPC art. 220; CLT art. 775-A); criminal em dias corridos (CPP art. 798). Feriado local que falte: cadastre em Calculadoras › Prazo processual › feriados.')));
      }).catch(e => det.lastChild.replaceWith(h('p', { class: 'erro' }, e.message)));
    });
    return det;
  }
  /** 8.23: robô do DJEN na nuvem (GitHub), que lê o DJEN de 2 em 2 horas mesmo com o painel fechado. */
  async function dialogoRoboDjen() {
    const d = h('dialog', { class: 'dialogo dlg-largo' }, h('p', {}, 'Carregando…'));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    const desenhar = (r, chave) => d.replaceChildren(h('h2', {}, '☁ Robô do DJEN na nuvem'),
      h('p', {}, 'O CNJ bloqueia o servidor do Google, por isso o DJEN só era lido com o painel aberto. Este robô roda no GitHub (o mesmo do blog), lê o DJEN de 2 em 2 horas, dia e noite, e manda as intimações para o painel — que calcula os prazos com a conta nova.'),
      h('div', { class: 'nota' + (r.ligado ? ' ok' : '') }, r.ligado ? 'Chave criada.' : 'Ainda não ligado.', r.ultima ? ' Última leitura boa: ' + new Date(r.ultima).toLocaleString('pt-BR') + '.' : '', r.erro ? h('div', { class: 'erro' }, 'Último erro: ' + r.erro) : null),
      chave ? h('div', { class: 'nota alerta' }, h('strong', {}, 'Copie agora (aparece só uma vez): '), h('code', {}, chave), ' ', botao('Copiar', () => navigator.clipboard.writeText(chave).then(() => avisar('Copiada.')), 'mini sec')) : null,
      h('ol', {}, h('li', {}, 'Clique em "Gerar chave" e copie.'),
        h('li', {}, 'No GitHub do site: Settings › Secrets and variables › Actions › New repository secret — crie DOIS: ', h('code', {}, 'DJEN_ROBO_CHAVE'), ' = a chave; e ',
          h('code', {}, 'PAINEL_URL'), ' = ', h('code', { class: 'quebra' }, window.PAINEL_API_URL || ''), ' ', botao('Copiar endereço', () => navigator.clipboard.writeText(window.PAINEL_API_URL || '').then(() => avisar('Copiado.')), 'mini sec')),
        h('li', {}, 'Actions › "Robô do DJEN" › Run workflow, para testar. Depois ele roda sozinho.')),
      h('div', { class: 'acoes' }, botao(r.ligado ? 'Gerar chave nova' : 'Gerar chave', async () => { const x = await api('djen.roboChave', { gerar: true }); desenhar(x, x.chave); }),
        r.ligado ? botao('Desligar', async () => desenhar(await api('djen.roboChave', { desligar: true })), 'sec') : null, botao('Fechar', () => d.close(), 'sec')));
    try { desenhar(await api('djen.roboChave', {})); } catch (e) { d.replaceChildren(h('p', { class: 'erro' }, e.message), botao('Fechar', () => d.close(), 'sec')); }
  }
  /** 8.23: revisão dos prazos — repetidos, vista ao MP, intimação de audiência já na agenda, data pela conta nova e vencidos (baixa em lote). */
  async function dialogoRevisaoPrazos() {
    const d = h('dialog', { class: 'dialogo dlg-largo' }, h('p', {}, 'Conferindo todos os prazos abertos…'));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    const desenhar = r => {
      const CATS = [['repetidos', 'Repetidos (mesmo processo, descrição e data)', 'cancelar'], ['mp', 'Vista ao Ministério Público (não é prazo do escritório)', 'cancelar'],
        ['audiencia', 'Intimação de audiência com a audiência já na agenda (fica em Audiências, com os 3 avisos)', 'cancelar'],
        ['recalcular', 'Data final diferente da conta nova (ciência em fim de semana/feriado)', 'corrigir a data'], ['vencidos', 'Vencidos ainda abertos (já feitos)', 'dar baixa como feito']];
      const marc = new Set(['repetidos', 'mp', 'audiencia', 'recalcular']);
      d.replaceChildren(h('h2', {}, '🔧 Revisão dos prazos'),
        h('p', { class: 'peq' }, 'O robô já faz sozinho, a cada hora, as 4 primeiras. Aqui dá para ver o que ele achou e dar baixa nos vencidos que já foram feitos.'),
        ...CATS.map(([k, rot, acao]) => h('details', { class: 'rev-cat' }, h('summary', {},
          h('label', { onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked: marc.has(k), disabled: !r[k].length, onchange: e => { if (e.target.checked) marc.add(k); else marc.delete(k); } }), ` ${rot}: `, h('strong', {}, String(r[k].length)), h('span', { class: 'peq' }, ' → ' + acao))),
          h('ul', { class: 'rev-lista' }, r[k].slice(0, 80).map(x => h('li', {}, h('a', { href: '#/prazo/' + x.id, onclick: () => d.close() }, `${x.numero} · ${x.descricao}`), ` · fatal ${dataBR(x.fatal)}`, x.novo ? ` → ${dataBR(x.novo)}` : ''))))),
        r.baixados && r.baixados.length ? h('details', { class: 'rev-cat' }, h('summary', {}, `Baixados em lote (${r.baixados.length}) — algum NÃO foi feito? Reabra:`),
          h('ul', { class: 'rev-lista' }, r.baixados.map(x => h('li', {}, `${x.numero} · ${x.descricao} · fatal ${dataBR(x.fatal)} `, botao('Reabrir', async ev => { ev.target.disabled = true; await api('prazos.situacao', { id: x.id, situacao: 'reabrir' }); ev.target.textContent = 'reaberto ✓'; }, 'mini sec'))))) : null,
        h('div', { class: 'acoes' }, botao('Aplicar o marcado', async ev => { ev.target.disabled = true; const x = await api('prazos.revisao', { aplicar: true, categorias: [...marc] }); avisar('Revisão aplicada.'); desenhar(x); }), botao('Fechar', () => { d.close(); rota(); }, 'sec')));
    };
    try { desenhar(await api('prazos.revisao', { aplicar: false })); } catch (e) { d.replaceChildren(h('p', { class: 'erro' }, e.message), botao('Fechar', () => d.close(), 'sec')); }
  }

  /* ---------- agenda ---------- */

  const CORES_AGENDA = { 'ATENDIMENTOS': 'ag-atend', 'AUDIÊNCIA CONCILIAÇÃO': 'ag-conc', 'AUDIÊNCIA INSTRUÇÃO': 'ag-instr', 'PERÍCIAS': 'ag-peri' };
  const NOME_CURTO = { 'ATENDIMENTOS': 'Atendimento', 'AUDIÊNCIA CONCILIAÇÃO': 'Conciliação', 'AUDIÊNCIA INSTRUÇÃO': 'Instrução', 'PERÍCIAS': 'Perícia' };
  // Filtros da agenda: o que cada visão mostra
  const FILTROS_AGENDA = {
    tudo: { nome: 'Tudo', agendas: null, prazos: true },
    dra: { nome: 'Dra. Júlian', agendas: ['ATENDIMENTOS', 'AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO'], prazos: false },
    atendimentos: { nome: 'Atendimentos', agendas: ['ATENDIMENTOS'], prazos: false },
    conciliacao: { nome: 'Audiências de conciliação', agendas: ['AUDIÊNCIA CONCILIAÇÃO'], prazos: false },
    instrucao: { nome: 'Audiências de instrução', agendas: ['AUDIÊNCIA INSTRUÇÃO'], prazos: false },
    pericias: { nome: 'Perícias', agendas: ['PERÍCIAS'], prazos: false },
    prazos: { nome: 'Prazos fatais', agendas: [], prazos: true }
  };
  function filtrarAgenda(dados, ver) {
    const f = FILTROS_AGENDA[ver] || FILTROS_AGENDA.tudo;
    return { ...dados, eventos: dados.eventos.filter(e => !f.agendas || f.agendas.includes(e.agenda)), prazos: f.prazos ? dados.prazos : [] };
  }

  function isoSoma(iso, n) { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); }
  function diaSem(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
  function nomeDia(iso, longo) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: longo ? 'long' : 'short', day: '2-digit', month: '2-digit' });
  }

  function periodo(visao, data) {
    if (visao === 'dia') return [data, data];
    if (visao === 'semana') { const ini = isoSoma(data, -((diaSem(data) + 6) % 7)); return [ini, isoSoma(ini, 6)]; }
    const primeiro = data.slice(0, 8) + '01';
    const ultimo = isoSoma(isoSoma(primeiro, 32).slice(0, 8) + '01', -1);
    const ini = isoSoma(primeiro, -((diaSem(primeiro) + 6) % 7));
    const fim = isoSoma(ultimo, (7 - diaSem(ultimo)) % 7);
    return [ini, fim];
  }

  function itensDoDia(dados, iso) {
    const ev = dados.eventos.filter(e => e.inicio.slice(0, 10) === iso).sort((a, b) => a.inicio < b.inicio ? -1 : 1)
      .map(e => ({ tipo: 'evento', hora: e.diaTodo ? 'dia todo' : e.inicio.slice(11, 16), cls: CORES_AGENDA[e.agenda] || '', rotulo: NOME_CURTO[e.agenda] || e.agenda, titulo: e.titulo, local: e.local, desc: e.descricao }));
    const pz = dados.prazos.filter(z => z.fatal === iso)
      .map(z => filaDe(z) === 'conferir'
        ? ({ tipo: 'prazo', marca: '⚠ ', hora: '23h59', cls: 'ag-conferir', rotulo: 'Prazo provisório · conferir no tribunal', titulo: `CONFERIR: ${String(z.descricao || '').replace(/PROVISÓRIO:?\s*/i, '')} · ${z.numero}${z.cliente ? ' · ' + z.cliente : ''}`, id: z.id })
        : ({ tipo: 'prazo', marca: '⚑ ', hora: '23h59', cls: 'ag-prazo', rotulo: z.situacao === 'conferido' ? 'Prazo fatal confirmado' : 'Prazo fatal', titulo: `${z.descricao} · ${z.numero}${z.cliente ? ' · ' + z.cliente : ''}`, id: z.id }));
    return pz.concat(ev);
  }

  /* Grade de horários no estilo do Google Agenda (visões dia e semana) */
  const H_INI = 7, H_FIM = 21, PX_HORA = 52;
  const minutos = hhmm => { const [hh, mm] = hhmm.split(':').map(Number); return hh * 60 + mm; };
  const nomeSem = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '');

  function detalheEvento(it) {
    const caixa = document.getElementById('ag-detalhe') || document.body.appendChild(h('div', { id: 'ag-detalhe', class: 'ag-detalhe', role: 'dialog', 'aria-modal': 'false' }));
    caixa.replaceChildren(
      h('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar', onclick: () => { caixa.hidden = true; } }, '×'),
      h('span', { class: 'chip ' + it.cls }, it.rotulo),
      h('h3', {}, it.titulo),
      h('p', { class: 'peq' }, it.quando),
      it.local ? h('p', {}, '📍 ', it.local) : null,
      it.desc ? h('p', { class: 'peq' }, it.desc) : null,
      it.id ? h('a', { class: 'btn mini', href: '#/prazo/' + it.id, onclick: () => { caixa.hidden = true; } }, 'Abrir prazo') : null);
    caixa.hidden = false;
  }

  /** Lado a lado quando dois compromissos se sobrepõem. */
  function faixas(evs) {
    evs.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
    let grupo = [], fimGrupo = -1;
    const fechar = () => { const n = Math.max(...grupo.map(e => e.faixa)) + 1; grupo.forEach(e => { e.total = n; }); grupo = []; };
    evs.forEach(e => {
      if (grupo.length && e.ini >= fimGrupo) fechar();
      const usadas = grupo.filter(g => g.fim > e.ini).map(g => g.faixa);
      e.faixa = 0; while (usadas.includes(e.faixa)) e.faixa++;
      grupo.push(e); fimGrupo = Math.max(fimGrupo, e.fim);
    });
    if (grupo.length) fechar();
    return evs;
  }

  function gradeAgenda(dias, dados, ir) {
    const hoje = hojeISO();
    const n = dias.length;
    const linhaCols = cls => { const el = h('div', { class: cls }); el.style.setProperty('--n', n); return el; };
    const cab = linhaCols('gc-cab');
    cab.append(h('div', { class: 'gc-canto' }), ...dias.map(d => h('button', { type: 'button', class: 'gc-dia-cab' + (d === hoje ? ' hoje' : ''), onclick: () => ir('dia', d) },
      h('span', { class: 'gc-sem' }, nomeSem(d)), h('span', { class: 'gc-num' }, String(+d.slice(8))))));
    const todo = linhaCols('gc-todo');
    todo.append(h('div', { class: 'gc-canto peq' }, 'dia todo'), ...dias.map(d => {
      const itens = itensDoDia(dados, d).filter(it => it.tipo === 'prazo' || it.hora === 'dia todo');
      return h('div', { class: 'gc-todo-dia' }, itens.map(it => h('button', { type: 'button', class: 'gc-chip ' + it.cls, title: it.titulo,
        onclick: () => detalheEvento({ ...it, quando: dataBR(d) + (it.tipo === 'prazo' ? ' · até 23h59' : ' · dia todo') }) }, it.tipo === 'prazo' ? (it.marca || '⚑ ') + it.titulo : it.titulo)));
    }));
    const horas = h('div', { class: 'gc-horas' });
    for (let hh = H_INI; hh < H_FIM; hh++) horas.append(h('div', { class: 'gc-hora' }, String(hh).padStart(2, '0') + ':00'));
    const cols = linhaCols('gc-cols');
    dias.forEach(d => {
      const col = h('div', { class: 'gc-col' + (d === hoje ? ' hoje' : '') });
      col.style.setProperty('height', (H_FIM - H_INI) * PX_HORA + 'px');
      col.addEventListener('click', ev => {
        if (ev.target !== col) return;
        const min = H_INI * 60 + Math.floor(ev.offsetY / PX_HORA * 2) * 30;
        const hhmm = String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
        location.hash = '#/compromisso/novo?data=' + d + '&hora=' + hhmm;
      });
      const evs = dados.eventos.filter(e => !e.diaTodo && e.inicio.slice(0, 10) === d).map(e => {
        const ini = minutos(e.inicio.slice(11, 16));
        const fim = e.fim && e.fim.slice(0, 10) === d ? Math.max(minutos(e.fim.slice(11, 16)), ini + 20) : ini + 60;
        return { e, ini, fim };
      });
      faixas(evs).forEach(x => {
        const top = Math.max(0, (x.ini - H_INI * 60) / 60 * PX_HORA);
        const alt = Math.max(22, (Math.min(x.fim, H_FIM * 60) - Math.max(x.ini, H_INI * 60)) / 60 * PX_HORA - 2);
        const cls = CORES_AGENDA[x.e.agenda] || '';
        const bloco = h('button', { type: 'button', class: 'gc-ev ' + cls, title: x.e.titulo,
          onclick: () => detalheEvento({ cls, rotulo: NOME_CURTO[x.e.agenda] || x.e.agenda, titulo: x.e.titulo, local: x.e.local, desc: x.e.descricao,
            quando: dataBR(d) + ' · ' + x.e.inicio.slice(11, 16) + (x.e.fim ? '–' + x.e.fim.slice(11, 16) : '') }) },
          h('strong', {}, x.e.titulo), h('span', {}, x.e.inicio.slice(11, 16) + (x.e.local ? ' · ' + x.e.local : '')));
        bloco.style.top = top + 'px';
        bloco.style.height = alt + 'px';
        bloco.style.left = (x.faixa / x.total * 100) + '%';
        bloco.style.width = 'calc(' + (100 / x.total) + '% - 4px)';
        col.append(bloco);
      });
      if (d === hoje) {
        const agora = new Date(); const min = agora.getHours() * 60 + agora.getMinutes();
        if (min >= H_INI * 60 && min <= H_FIM * 60) { const ln = h('div', { class: 'gc-agora' }); ln.style.top = ((min - H_INI * 60) / 60 * PX_HORA) + 'px'; col.append(ln); }
      }
      cols.append(col);
    });
    const corpo = h('div', { class: 'gc-corpo' }, horas, cols);
    const grade = h('div', { class: 'gc' + (n === 1 ? ' gc-um' : '') }, cab, todo, corpo);
    setTimeout(() => { const alvo = Math.max(0, (8 - H_INI) * PX_HORA); corpo.scrollTop = alvo; }, 0);
    return h('div', { class: 'gc-rolagem' }, grade);
  }


  /* ===== 8.21 Audiências: os três avisos (1 semana, véspera útil, no dia), ciência, online/presencial e testemunhas ===== */
  const ROT_AVISO = { semana: '1 semana antes', vespera: 'Véspera', dia: 'No dia' };
  /** Três botões de aviso de uma audiência: feito (✓, clica de novo), na hora (verde) ou ainda não (cinza com a data). */
  function chipsAvisosAto(a, aoMudar) {
    const hoje = hojeISO();
    return h('div', { class: 'aud-avisos' }, ['semana', 'vespera', 'dia'].map(q => {
      const feito = a.avisos && a.avisos[q] && a.avisos[q].em ? a.avisos[q] : null;
      const dia = (a.dias_aviso || {})[q] || a.data;
      const link = whatsAto({ telefone: a.telefone, cliente: a.cliente, numero: a.numero, quando: q, modo: a.modo, link: a.link, ato: { tipo: a.tipo, data: a.data, hora: a.hora, local: a.local } });
      const marcar = () => api('agenda.avisado', { chave: a.chave, lembrete: a.lembrete, quando: q, numero: a.numero, data: a.data, hora: a.hora, tipo: a.tipo })
        .then(() => { a.avisos[q] = { em: new Date().toISOString(), por: sessao.usuario.nome }; if (aoMudar) aoMudar(); }).catch(e => avisar(e.message, true));
      const rot = ROT_AVISO[q];
      if (!link) return h('span', { class: 'aud-chip ' + (feito ? 'ok' : 'sem'), title: feito ? quandoAvisado(feito.em, feito.por) : 'Cliente sem telefone no cadastro' }, (feito ? '✓ ' : '') + rot + (feito ? '' : ' · sem telefone'));
      if (feito || a.devido === q || dia <= hoje) return botaoAvisar(link, (a.devido === q ? '📲 Avisar agora · ' : '') + rot, feito, marcar, a.devido === q && !feito ? 'aud-devido' : 'aud-chip-btn', '✓ ' + rot + ' · avisado');
      return h('span', { class: 'aud-chip futuro', title: 'Este aviso sai em ' + dataBR(dia) }, rot + ' · ' + dataBR(dia).slice(0, 5));
    }));
  }
  async function telaAudiencias(params) {
    carregando();
    const ver = ['avisar', 'instrucao', 'todas'].includes(params.get('ver')) ? params.get('ver') : 'todas';
    const r = await api('audiencias.listar', { dias: 90 });
    const lista = r.lista || [];
    const nAvisar = lista.filter(a => a.devido).length, nTest = lista.filter(a => a.tipo === 'instrucao' && !a.testemunhas.length).length;
    const nCiente = lista.filter(a => !a.ciente_em).length;
    const filtrada = lista.filter(a => ver === 'avisar' ? !!a.devido : ver === 'instrucao' ? a.tipo === 'instrucao' : true);
    const topo = h('header', { class: 'carteira-topo' },
      h('div', { class: 'carteira-tit' }, h('span', { class: 'carteira-kicker' }, 'Escritório'), h('h1', {}, 'Audiências e perícias'),
        h('p', {}, 'Três avisos ao cliente: 1 semana antes, na véspera e no dia.')),
      h('div', { class: 'carteira-acoes' }, botao('Ver na agenda', () => { location.hash = '#/agenda?visao=semana'; }, 'sec')));
    const numeros = nAvisar || nTest ? h('p', { class: 'aud-alerta-linha' },
      nAvisar ? h('a', { href: '#/audiencias?ver=avisar' }, `📲 ${nAvisar} aviso(s) para mandar agora`) : null,
      nAvisar && nTest ? ' · ' : null,
      nTest ? h('a', { href: '#/audiencias?ver=instrucao' }, `${nTest} instrução(ões) sem testemunhas`) : null) : null;
    void nCiente;
    const filtros = h('div', { class: 'chips' }, [['todas', 'Todas'], ['avisar', 'Precisa de aviso'], ['instrucao', 'Instrução']].map(([k, t]) =>
      h('a', { class: 'chip-filtro' + (k === ver ? ' ativo' : ''), href: '#/audiencias' + (k === 'todas' ? '' : '?ver=' + k) }, t)));
    const cartao = a => {
      const sec = h('article', { class: 'aud-cartao aud-' + a.tipo + (a.devido ? ' aud-tem-aviso' : '') });
      const desenhar = () => {
        const salvar = (m, msg) => api('audiencias.salvar', Object.assign({ lembrete: a.lembrete, numero: a.numero, data: a.data, hora: a.hora, tipo: a.tipo }, m)).then(() => { if (msg) avisar(msg); }).catch(e => avisar(e.message, true));
        const modo = h('select', { 'aria-label': 'Online ou presencial', onchange: ev => { a.modo = ev.target.value; salvar({ modo: a.modo }, 'Anotado.'); desenhar(); } },
          [['', 'Online ou presencial?'], ['presencial', 'Presencial'], ['online', 'Online (vídeo)']].map(([v, t]) => h('option', { value: v, selected: a.modo === v }, t)));
        const link = a.modo === 'online' ? h('input', { type: 'url', placeholder: 'Link da sala de vídeo (opcional)', value: a.link || '', onchange: ev => { a.link = ev.target.value; salvar({ link: a.link }, 'Link guardado.'); } }) : null;
        const ciente = a.ciente_em ? h('button', { type: 'button', class: 'btn mini sec feito-ciente', title: quandoAvisado(a.ciente_em, a.ciente_por).replace('Avisado', 'Ciente').replace(' · clique para mandar de novo', ''), onclick: () => { a.ciente_em = ''; salvar({ ciente: 'desfazer' }); desenhar(); } }, '✓ Equipe ciente')
          : h('button', { type: 'button', class: 'btn mini', onclick: () => { a.ciente_em = new Date().toISOString(); a.ciente_por = sessao.usuario.nome; salvar({ ciente: 'sim' }, 'Marcado: equipe ciente.'); desenhar(); } }, 'Dar ciência');
        // testemunhas (sempre na instrução; nas outras, só se já houver ou se pedir)
        const tl = a.testemunhas;
        if (a.tipo === 'instrucao' && !tl.length) tl.push({ nome: '', cpf: '', telefone: '', obs: '' }); // instrução: já abre uma linha para anotar
        const linhaT = (t, i) => h('div', { class: 'aud-test' },
          ['nome', 'cpf', 'telefone', 'obs'].map(k => h('input', { type: 'text', value: t[k] || '', placeholder: { nome: 'Nome completo', cpf: 'CPF', telefone: 'Telefone', obs: 'Observação (ex.: vai sozinha)' }[k],
            'aria-label': k, inputmode: k === 'cpf' || k === 'telefone' ? 'numeric' : 'text', oninput: ev => { t[k] = ev.target.value; } })),
          h('label', { class: 'aud-conf' }, h('input', { type: 'checkbox', checked: !!t.confirmou, onchange: ev => { t.confirmou = ev.target.checked; } }), 'confirmou'),
          h('button', { type: 'button', class: 'btn mini sec', 'aria-label': 'Tirar', onclick: () => { tl.splice(i, 1); desenhar(); } }, '×'));
        const mostraTest = a.tipo === 'instrucao' || tl.length || a._verTest;
        const blocoTest = mostraTest ? h('div', { class: 'aud-testemunhas' },
          h('div', { class: 'aud-sub' }, h('b', {}, 'Testemunhas'), a.tipo === 'instrucao' && !tl.some(t => t.nome) ? h('span', { class: 'tag conferir' }, 'perguntar ao cliente: nome, CPF e telefone') : h('span', { class: 'peq' }, tl.length + ' anotada(s)')),
          tl.map(linhaT),
          h('div', { class: 'g-acoes' }, botao('+ Testemunha', () => { tl.push({ nome: '', cpf: '', telefone: '', obs: '' }); desenhar(); }, 'sec mini'),
            botao('Salvar testemunhas', () => salvar({ testemunhas: tl }, 'Testemunhas salvas.'), 'mini'))) :
          h('button', { type: 'button', class: 'link-btn', onclick: () => { a._verTest = true; desenhar(); } }, '+ anotar testemunhas');
        const obs = h('textarea', { rows: 2, placeholder: 'Anotações (o que levar, combinado com o cliente…)', value: a.obs || '', onchange: ev => { a.obs = ev.target.value; salvar({ obs: a.obs }, 'Anotação salva.'); } });
        obs.value = a.obs || '';
        const nomeA = (NOME_ATO[a.tipo] || a.nome);
        sec.replaceChildren(
          h('div', { class: 'aud-cab' },
            h('div', { class: 'selo-data' + (a.data === hojeISO() ? ' faixa-hoje' : '') }, h('b', {}, a.data.slice(8, 10)), h('span', {}, new Date(a.data + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short' }).replace('.', ''))),
            h('div', { class: 'aud-tit' }, h('strong', {}, nomeA + (a.hora ? ' · ' + a.hora : ' · sem horário')),
              h('span', {}, a.cliente || a.titulo || 'cliente a identificar'),
              h('span', { class: 'peq' }, [nomeDia(a.data, true), a.numero, a.local].filter(Boolean).join(' · '))),
            h('div', { class: 'aud-cab-dir' }, ciente, a.processo_id ? h('a', { class: 'btn mini sec', href: '#/processo/' + a.processo_id }, 'Processo') : null)),
          chipsAvisosAto(a, desenhar),
          h('div', { class: 'aud-linha' }, a.tipo !== 'pericia' ? modo : null, link),
          blocoTest, obs);
      };
      desenhar();
      return sec;
    };
    // 8.25 (pedido da usuária: "muita informação; só as pessoas e as datas; clicar abre para editar na mesma aba"): LISTA simples —
    // data, hora, cliente, tipo e as 3 bolinhas dos avisos; clicar abre a ficha logo abaixo da linha (uma por vez).
    const bolinhas = a => h('span', { class: 'aud-bols', 'aria-label': 'Avisos ao cliente' }, ['semana', 'vespera', 'dia'].map(q => {
      const feito = a.avisos && a.avisos[q] && a.avisos[q].em;
      const cls = feito ? 'ok' : a.devido === q ? 'devido' : '';
      return h('i', { class: 'aud-bol ' + cls, title: ROT_AVISO[q] + (feito ? ': avisado' : a.devido === q ? ': AVISAR AGORA' : ': ainda não') });
    }));
    let aberta = null;
    const linha = a => {
      const caixa = h('div', { class: 'aud-ficha', hidden: true });
      const tipo = NOME_ATO[a.tipo] || a.nome || 'Audiência';
      const li = h('li', { class: 'aud-item' + (a.devido ? ' devido' : '') + (a.data === hojeISO() ? ' hoje' : '') });
      const btn = h('button', { type: 'button', class: 'aud-linha-bt', 'aria-expanded': 'false', onclick: () => {
        const abrir = caixa.hidden;
        if (aberta && aberta !== li) { aberta.querySelector('.aud-ficha').hidden = true; aberta.classList.remove('aberta'); aberta.querySelector('.aud-linha-bt').setAttribute('aria-expanded', 'false'); }
        if (abrir && !caixa.firstChild) caixa.append(cartao(a));
        caixa.hidden = !abrir; li.classList.toggle('aberta', abrir); btn.setAttribute('aria-expanded', String(abrir)); aberta = abrir ? li : null;
      } },
        h('span', { class: 'aud-l-data' }, h('b', {}, dataBR(a.data).slice(0, 5)), h('small', {}, nomeDia(a.data))),
        h('span', { class: 'aud-l-hora num' }, a.hora || '—'),
        h('span', { class: 'aud-l-quem' }, h('b', {}, a.cliente || a.titulo || 'cliente a identificar'), a.tipo === 'instrucao' && !(a.testemunhas || []).some(t => t.nome) ? h('small', { class: 'aud-l-alerta' }, 'sem testemunhas') : null),
        h('span', { class: 'aud-l-tipo aud-t-' + a.tipo }, tipo),
        bolinhas(a),
        h('span', { class: 'aud-l-seta', 'aria-hidden': 'true' }, '▾'));
      li.append(btn, caixa);
      return li;
    };
    mostrar(topo, numeros, filtros,
      filtrada.length ? h('ul', { class: 'aud-lista2' }, filtrada.slice().sort((x, y) => (x.data + (x.hora || '')) < (y.data + (y.hora || '')) ? -1 : 1).map(linha))
        : h('p', { class: 'vazio' }, ver === 'avisar' ? 'Nenhum aviso para mandar agora. 👏' : 'Nenhuma audiência ou perícia nos próximos 90 dias.'),
      h('p', { class: 'peq aud-legenda' }, h('i', { class: 'aud-bol ok' }), ' avisado  ', h('i', { class: 'aud-bol devido' }), ' avisar agora  ', h('i', { class: 'aud-bol' }), ' ainda não — as três bolinhas são: 1 semana antes · véspera · no dia. Clique na linha para avisar, anotar testemunhas e o modo.'));
  }

  async function telaAgenda(params) {
    carregando();
    // 8.25 (pedido da usuária): abre na LISTA da semana (leve e fácil de ler); dia/semana em grade e mês continuam
    let visaoSalva = ''; try { visaoSalva = localStorage.getItem('agenda_visao') || ''; } catch (e) { /* ok */ }
    const visao = ['lista', 'dia', 'semana', 'mes'].includes(params.get('visao')) ? params.get('visao') : (['lista', 'dia', 'semana', 'mes'].includes(visaoSalva) ? visaoSalva : 'lista');
    try { localStorage.setItem('agenda_visao', visao); } catch (e) { /* ok */ }
    const data = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') || '') ? params.get('data') : hojeISO();
    const [ini, fim] = periodo(visao === 'lista' ? 'semana' : visao, data);
    const ver = FILTROS_AGENDA[params.get('ver')] ? params.get('ver') : 'tudo';
    const dados = filtrarAgenda(await api('agenda.listar', params.get('atualizar') ? { inicio: ini, fim, atualizar: true } : { inicio: ini, fim }), ver);
    const ir = (v, d, f) => { location.hash = `#/agenda?visao=${v}&data=${d}&ver=${f || ver}`; };
    const passo = visao === 'dia' ? 1 : visao === 'semana' || visao === 'lista' ? 7 : 0;
    const mover = n => passo ? ir(visao, isoSoma(data, n * passo)) : ir(visao, isoSoma(data.slice(0, 8) + '15', n * 30).slice(0, 8) + '01');
    const titulo = visao === 'dia' ? nomeDia(data, true) : visao === 'semana' || visao === 'lista' ? `${dataBR(ini).slice(0, 5)} a ${dataBR(fim)}`
      : new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    const barra = h('div', { class: 'ag-topo' },
      h('div', { class: 'grupo' }, botao('Hoje', () => ir(visao, hojeISO()), 'sec'),
        h('button', { type: 'button', class: 'seta-nav', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
        h('button', { type: 'button', class: 'seta-nav', 'aria-label': 'Próximo', onclick: () => mover(1) }, '›'),
        h('h2', { class: 'ag-titulo cap' }, titulo)),
      h('div', { class: 'grupo' },
        h('div', { class: 'segmentado' }, ['lista', 'dia', 'semana', 'mes'].map(v => h('button', { type: 'button', class: v === visao ? 'ativo' : '', onclick: () => ir(v, data) }, { lista: 'Lista', dia: 'Dia', semana: 'Semana', mes: 'Mês' }[v]))),
        h('button', { type: 'button', class: 'seta-nav', title: 'Buscar de novo no Google Agenda (o painel guarda por 10 min)', 'aria-label': 'Atualizar do Google Agenda', onclick: () => { location.hash = `#/agenda?visao=${visao}&data=${data}&ver=${ver}&atualizar=1`; } }, '↻'),
        botao('+ Novo compromisso', () => { location.hash = '#/compromisso/novo?data=' + data; })));
    const filtros = h('div', { class: 'chips ag-filtros' }, Object.keys(FILTROS_AGENDA).map(k => h('button', { type: 'button', class: 'chip-filtro' + (k === ver ? ' ativo' : ''), onclick: () => ir(visao, data, k) },
      k === 'tudo' || k === 'dra' ? FILTROS_AGENDA[k].nome : h('span', { class: 'bolinha ' + (k === 'prazos' ? 'ag-prazo' : CORES_AGENDA[FILTROS_AGENDA[k].agendas[0]]) }), k === 'tudo' || k === 'dra' ? null : FILTROS_AGENDA[k].nome)));
    let corpo;
    if (visao === 'lista') {
      const dias = [];
      for (let d = ini; d <= fim; d = isoSoma(d, 1)) dias.push(d);
      const comItens = dias.map(d => [d, itensDoDia(dados, d)]).filter(([d, it]) => it.length || d === hojeISO());
      corpo = comItens.length ? h('div', { class: 'ag-lista' }, comItens.map(([d, itens]) => h('section', { class: 'ag-lista-dia' + (d === hojeISO() ? ' hoje' : '') },
        h('h3', {}, d === hojeISO() ? 'Hoje · ' + nomeDia(d, true) : nomeDia(d, true)),
        itens.length ? h('ul', {}, itens.map(it => h('li', { tabindex: 0, class: it.cls, onclick: () => detalheEvento({ ...it, quando: dataBR(d) + ' · ' + it.hora }), onkeydown: e => { if (e.key === 'Enter') detalheEvento({ ...it, quando: dataBR(d) + ' · ' + it.hora }); } },
          h('span', { class: 'ag-l-hora' }, it.tipo === 'prazo' ? 'prazo' : it.hora),
          h('span', { class: 'bolinha ' + it.cls }),
          h('span', { class: 'ag-l-tit' }, it.tipo === 'prazo' ? (it.marca || '⚑ ') + it.titulo : it.titulo, it.local ? h('small', {}, it.local) : null),
          h('span', { class: 'ag-l-tipo' }, it.rotulo)))) : h('p', { class: 'peq' }, 'Nada marcado.'))))
        : h('p', { class: 'cb-vazio' }, 'Nada nesta semana.');
    } else if (visao === 'mes') {
      const dias = [];
      for (let d = ini; d <= fim; d = isoSoma(d, 1)) dias.push(d);
      corpo = h('div', { class: 'mes' },
        ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(n => h('div', { class: 'mes-cab' }, n)),
        dias.map(d => {
          const itens = itensDoDia(dados, d);
          return h('div', { class: 'mes-dia' + (d.slice(0, 7) !== data.slice(0, 7) ? ' fora' : '') + (d === hojeISO() ? ' hoje' : '') + (itens.length ? '' : ' vazio'), onclick: () => ir('dia', d) },
            h('div', { class: 'mes-num' }, h('span', { class: 'so-cel' }, nomeDia(d)), h('span', { class: 'so-pc' }, String(+d.slice(8)))),
            itens.slice(0, 4).map(it => h('div', { class: 'mes-item ' + it.cls, title: it.titulo }, it.tipo === 'prazo' ? (it.marca || '⚑ ') : it.hora + ' ', it.titulo)),
            itens.length > 4 ? h('div', { class: 'peq' }, `+${itens.length - 4}`) : null);
        }));
    } else {
      const dias = [];
      for (let d = ini; d <= fim; d = isoSoma(d, 1)) dias.push(d);
      corpo = gradeAgenda(dias, dados, ir);
    }
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Agenda'))),
      barra, filtros,
      dados.avisos.length ? h('div', { class: 'nota alerta' }, dados.avisos.join(' ')) : null,
      conflitosAgenda(dados.eventos),
      corpo);
  }

  /** 8.11.2: dois compromissos com hora ao mesmo tempo (audiência × perícia × atendimento) → aviso no topo da Agenda. */
  function conflitosAgenda(eventos) {
    const comHora = (eventos || []).filter(e => !e.diaTodo && e.inicio && e.inicio.length > 10)
      .map(e => ({ e, ini: e.inicio, fim: e.fim && e.fim > e.inicio ? e.fim : e.inicio.slice(0, 11) + String(Math.min(23, +e.inicio.slice(11, 13) + 1)).padStart(2, '0') + e.inicio.slice(13, 16) }))
      .sort((a, b) => a.ini < b.ini ? -1 : 1);
    const pares = [];
    for (let i = 0; i < comHora.length; i++) for (let j = i + 1; j < comHora.length && comHora[j].ini.slice(0, 10) === comHora[i].ini.slice(0, 10); j++)
      if (comHora[j].ini < comHora[i].fim) pares.push([comHora[i].e, comHora[j].e]);
    if (!pares.length) return null;
    return h('div', { class: 'nota alerta ag-conflitos' }, h('strong', {}, `⚠ ${pares.length} conflito(s) de horário: `),
      h('ul', {}, pares.slice(0, 8).map(([a, b]) => h('li', {}, `${dataBR(a.inicio.slice(0, 10))} ${a.inicio.slice(11, 16)} — ${a.titulo} × ${b.inicio.slice(11, 16)} ${b.titulo}`))),
      h('span', { class: 'peq' }, 'Remarque um deles no Google Agenda: o painel acompanha a mudança e atualiza o aviso ao cliente.'));
  }

  async function telaCompromisso(params) {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') || '') ? params.get('data') : hojeISO();
    const form = h('form', { class: 'caixa', novalidate: true },
      h('div', { class: 'campos' },
        campo('agenda', 'Agenda', 'ATENDIMENTOS', { opcoes: Object.keys(CORES_AGENDA).map(n => [n, n]) }),
        campo('titulo', 'Título', '', { obrigatorio: true, max: 200, dica: 'Ex.: Atendimento — Maria da Silva (trabalhista)' }),
        campo('data', 'Data', data, { tipo: 'date', obrigatorio: true }),
        campo('inicio', 'Início', /^\d{2}:\d{2}$/.test(params.get('hora') || '') ? params.get('hora') : '09:00', { tipo: 'time', obrigatorio: true }),
        campo('fim', 'Fim', /^\d{2}:\d{2}$/.test(params.get('hora') || '') ? String(+params.get('hora').slice(0, 2) + 1).padStart(2, '0') + params.get('hora').slice(2) : '10:00', { tipo: 'time' }),
        campo('local', 'Local / link', '', { max: 300, dica: 'Escritório, Zoom, vara…' }),
        campo('descricao', 'Observações', '', { area: true, largo: true })),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Marcar na agenda'), h('a', { class: 'btn sec', href: '#/agenda?data=' + data }, 'Voltar')),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      await api('agenda.criar', d);
      avisar('Compromisso marcado no Google Agenda.');
      location.hash = `#/agenda?visao=dia&data=${d.data}`;
    });
    mostrar(h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Novo compromisso'), h('p', {}, 'Vai direto para a agenda escolhida no Google Agenda do escritório.'))), form);
  }

  /* ---------- financeiro ---------- */

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const reais = v => v === null ? '•••••' : BRL.format(+v || 0); // null = valor escondido (perfil RH)
  const TIPOS_HON = { parcelado: 'Parcelado', exito: 'Êxito', mensal: 'Mensal (assessoria)' };

  /* ===== 8.23 Financeiro com layout novo (inspirado no Asaas, ADVBOX e Astrea): resumo do mês com meta, régua de cobrança,
     agenda de recebimentos e cobranças em cartões ===== */
  const iniciaisCb = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  function chipVenc(p) {
    if (p.situacao === 'paga') return h('span', { class: 'cb-chip ok' }, 'recebida ' + dataBR(p.pago_em).slice(0, 5));
    const d = Math.round((new Date(p.vencimento + 'T12:00:00Z') - new Date(hojeISO() + 'T12:00:00Z')) / 864e5);
    if (d < 0) return h('span', { class: 'cb-chip atraso' + (d < -30 ? ' grave' : '') }, `${-d} dia${d === -1 ? '' : 's'} em atraso`);
    if (d === 0) return h('span', { class: 'cb-chip hoje' }, 'vence hoje');
    return h('span', { class: 'cb-chip' }, d === 1 ? 'vence amanhã' : `vence em ${d} dias`);
  }
  function listaCobrancas(lista, depois, vazio) {
    if (!lista.length) return h('div', { class: 'cb-vazio' }, vazio);
    const rh = sessao.usuario.pode.ocultarValores;
    return h('ul', { class: 'cb-lista' }, lista.map(p => h('li', { class: 'cb-item ' + (p.situacao === 'atrasada' ? 'atrasada' : p.situacao === 'paga' ? 'paga' : ''), tabindex: 0,
        onclick: () => { location.hash = '#/honorario/' + p.honorario_id; }, onkeydown: e => { if (e.key === 'Enter') location.hash = '#/honorario/' + p.honorario_id; } },
      h('span', { class: 'cb-av', 'aria-hidden': 'true' }, iniciaisCb(p.cliente)),
      h('div', { class: 'cb-quem' }, h('strong', {}, p.cliente || '—'), h('span', {}, [p.numero ? p.numero + 'ª parcela' : 'parcela', p.honorario, p.asaas_link && !/CANCEL/i.test(p.asaas_status || '') ? '⚡ boleto/Pix gerado' : ''].filter(Boolean).join(' · ')),
        h('div', { class: 'cb-tags' }, chipVenc(p), etiquetaCobranca(p))),
      h('div', { class: 'cb-valor' }, h('b', {}, rh && p.valor === null ? '•••' : reais(p.situacao === 'paga' ? (p.valor_pago || p.valor) : (p.saldo || p.valor))), h('span', {}, 'venc. ' + dataBR(p.vencimento))),
      h('div', { class: 'cb-acoes', onclick: e => e.stopPropagation() }, acoesParcela(p, depois)))));
  }
  function heroFinanceiro(r, nPix, rh) {
    const t = r.totais, m = r.mes || {}, nomeMes = new Date(hojeISO() + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long' });
    const pct = m.previsto ? Math.min(100, Math.round(m.recebido * 100 / m.previsto)) : 0;
    const barra = h('div', { class: 'fh-barra' }, h('span', { class: 'fh-feito' })); barra.firstChild.style.setProperty('width', pct + '%');
    return h('section', { class: 'fh' },
      h('div', { class: 'fh-mes' }, h('span', { class: 'fh-rot' }, 'Recebido em ' + nomeMes),
        h('b', { class: 'fh-grande' }, rh ? '—' : reais(t.recebidoMes)),
        rh ? h('span', { class: 'fh-sub' }, 'totais só para a administração') : h('div', {}, barra,
          h('span', { class: 'fh-sub' }, m.previsto ? `${pct}% de ${reais(m.previsto)} previstos para o mês · ${m.pagas} de ${m.qtd} parcelas pagas · faltam ${reais(m.falta)}` : 'Nenhuma parcela prevista para este mês.'))),
      h('div', { class: 'fh-cards' },
        h('a', { class: 'fh-card vermelho', href: '#/financeiro?ver=atraso' }, h('span', { class: 'fh-rot' }, 'Em atraso'), h('b', {}, rh ? String(t.parcelasAtrasadas) : reais(t.atrasado)), h('span', { class: 'fh-sub' }, `${t.parcelasAtrasadas} parcela(s) · ${t.clientesAtrasados} cliente(s)`)),
        h('a', { class: 'fh-card dourado', href: '#/financeiro?ver=proximas' }, h('span', { class: 'fh-rot' }, 'A receber · 30 dias'), h('b', {}, rh ? String(r.proximas.length) : reais(t.aReceber30)), h('span', { class: 'fh-sub' }, `${r.proximas.length} parcela(s)`)),
        h('a', { class: 'fh-card azul' + (nPix ? ' alerta' : ''), href: '#/financeiro?ver=pix' }, h('span', { class: 'fh-rot' }, 'PIX para conferir'), h('b', {}, String(nPix)), h('span', { class: 'fh-sub' }, nPix ? 'o robô não teve certeza' : 'tudo conciliado')),
        h('a', { class: 'fh-card verde' + (r.asaas ? '' : ' apagado'), href: '#/financeiro?ver=' + (sessao.usuario.pode.usuarios ? 'asaas' : 'proximas') }, h('span', { class: 'fh-rot' }, 'Boleto/Pix automático'), h('b', {}, r.asaas ? 'ligado' : 'desligado'), h('span', { class: 'fh-sub' }, r.asaas ? 'baixa sozinha quando pagam' : 'ligar com o Asaas'))));
  }
  function reguaCobranca(r, rh) {
    const em7 = r.proximas.filter(p => p.vencimento <= isoSoma(hojeISO(), 7));
    const segs = [['Vence em 7 dias', em7.length, em7.reduce((a, p) => a + (p.saldo || 0), 0), 'r-azul', 'proximas'],
      ...r.faixas.map((f, i) => [f.nome.replace('até 30 dias', 'Atraso até 30 dias').replace('31 a 90 dias', 'Atraso 31 a 90').replace('mais de 90 dias', 'Atraso +90'), f.qtd, f.valor, ['r-amarelo', 'r-laranja', 'r-vermelho'][i], i === 2 ? 'acao' : 'atraso'])];
    const total = segs.reduce((a, x) => a + (rh ? x[1] : (x[2] || 0)), 0) || 1;
    const barra = h('div', { class: 'regua' }, segs.filter(x => x[1]).map(x => { const el = h('a', { class: 'regua-seg ' + x[3], href: '#/financeiro?ver=' + x[4], title: `${x[0]}: ${x[1]}` }); el.style.setProperty('flex-grow', String(Math.max(0.06, (rh ? x[1] : (x[2] || 0)) / total))); return el; }));
    return h('section', { class: 'caixa regua-caixa' }, h('div', { class: 'regua-cab' }, h('h2', {}, 'Régua de cobrança'), h('span', { class: 'peq' }, 'do que vence agora ao que precisa de ação')),
      barra, h('div', { class: 'regua-leg' }, segs.map(x => h('a', { class: 'regua-it', href: '#/financeiro?ver=' + x[4] }, h('span', { class: 'regua-dot ' + x[3] }), h('span', {}, x[0]), h('b', {}, rh ? String(x[1]) : reais(x[2] || 0)), h('span', { class: 'peq' }, `${x[1]} parcela(s)`)))));
  }
  function agendaRecebimentos(agenda, rh) {
    if (!agenda || !agenda.length) return null;
    const max = Math.max(1, ...agenda.map(a => rh ? a.qtd : a.valor));
    return h('section', { class: 'caixa agr-caixa' }, h('div', { class: 'regua-cab' }, h('h2', {}, 'Agenda de recebimentos'), h('span', { class: 'peq' }, 'próximos 14 dias')),
      h('div', { class: 'agr' }, agenda.map((a, i) => {
        const dt = new Date(a.dia + 'T12:00:00Z'), fds = [0, 6].includes(dt.getUTCDay());
        const col = h('div', { class: 'agr-dia' + (i === 0 ? ' hoje' : '') + (fds ? ' fds' : '') + (a.qtd ? '' : ' vazio'), title: a.qtd ? `${a.qtd} parcela(s)` : 'nada vence' },
          h('span', { class: 'agr-sem' }, dt.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')), h('span', { class: 'agr-num' }, dt.getUTCDate()),
          h('div', { class: 'agr-trilho' }, h('span', { class: 'agr-barra' })), h('span', { class: 'agr-val' }, a.qtd ? (rh ? a.qtd + 'x' : reais(a.valor).replace(',00', '')) : '—'));
        col.querySelector('.agr-barra').style.setProperty('height', Math.round(((rh ? a.qtd : a.valor) / max) * 100) + '%');
        return col;
      })));
  }
  function etiquetaParcela(p) {
    const cls = { 'paga': 'ok', 'paga em parte': 'atencao', 'atrasada': 'urgente', 'a vencer': 'info' }[p.situacao] || '';
    const extra = p.situacao === 'atrasada' ? ` há ${p.dias_atraso} dia${p.dias_atraso === 1 ? '' : 's'}` : '';
    return h('span', { class: 'tag ' + cls }, p.situacao + extra);
  }
  function etiquetaCobranca(p) {
    if (p.cobranca === 'acao') return h('span', { class: 'tag urgente' }, 'ação de cobrança');
    if (p.cobranca === 'mensagem') return h('span', { class: 'tag atencao' }, 'mensagem enviada ' + dataBR(p.mensagem_em).slice(0, 5));
    return p.situacao === 'atrasada' ? h('span', { class: 'tag' }, 'sem contato') : null;
  }

  const nomeProprioJS = n => n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
  function linkWhats(p) {
    let tel = telefoneWhats(p.telefone || '');
    if (!tel) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String(p.cliente || '').split(' ')[0]);
    const semValor = p.saldo === null || p.valor === null;
    const valor = semValor ? '' : reais(p.saldo || p.valor), venc = dataBR(p.vencimento);
    const ref = p.honorario ? ` (${p.honorario})` : '';
    const linkPg = p.asaas_link && !/CANCEL/i.test(p.asaas_status || '') ? `\n\nPara pagar por boleto ou Pix: ${p.asaas_link}` : ''; // 8.22
    if (p.qtdAtrasadas > 1) {
      const msgV = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Constam em aberto ${p.qtdAtrasadas} parcelas dos honorários${ref}${semValor ? '' : ', somando ' + valor}, a primeira vencida em ${venc}. Pedimos, por gentileza, que regularize o pagamento por PIX ou no escritório, ou entre em contato para combinarmos a melhor forma. Se já pagou, por favor nos envie o comprovante. Obrigado!`;
      return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msgV + linkPg);
    }
    const msg = p.vencimento >= hojeISO()
      ? `Olá, ${nome}! Tudo bem? Aqui é do escritório Araújo Advocacia. Passando para lembrar que ${p.numero ? 'a ' + p.numero + 'ª parcela' : 'a parcela'} dos honorários${ref}${semValor ? '' : ', no valor de ' + valor}, vence em ${venc}. Você pode pagar por PIX ou no escritório. Se já tiver pago, por favor nos envie o comprovante. Obrigado!`
      : `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Consta em aberto ${p.numero ? 'a ' + p.numero + 'ª parcela' : 'uma parcela'} dos honorários${ref}${semValor ? '' : ', no valor de ' + valor}, vencida em ${venc}. Pedimos, por gentileza, que regularize o pagamento por PIX ou no escritório, ou entre em contato para combinarmos a melhor forma. Se já pagou, por favor nos envie o comprovante. Obrigado!`;
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg + linkPg);
  }

  /** Caixa com o recibo recém-gerado: abrir/imprimir o PDF e mandar ao cliente pelo WhatsApp. */
  function mostrarRecibo(rec) {
    const caixa = document.getElementById('recibo-pronto') || document.body.appendChild(h('div', { id: 'recibo-pronto', class: 'ag-detalhe recibo-pronto', role: 'dialog', 'aria-modal': 'false' }));
    let tel = telefoneWhats(rec.telefone || ''); if (tel && tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String(rec.cliente || '').split(' ')[0]);
    const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Recebemos o pagamento ${rec.numero ? 'da ' + rec.numero + 'ª parcela ' : ''}dos honorários${rec.honorario ? ' (' + rec.honorario + ')' : ''}, no valor de ${reais(rec.valor)}, em ${dataBR(rec.data)}. Segue o recibo. Obrigado!`;
    caixa.replaceChildren(
      h('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar', onclick: () => { caixa.hidden = true; } }, '×'),
      h('span', { class: 'chip ag-conc' }, 'Recibo pronto'),
      h('h3', {}, `${rec.cliente} · ${reais(rec.valor)}`),
      h('p', { class: 'peq' }, 'Salvo em PDF na pasta do cliente. Para mandar no WhatsApp: baixe o PDF, abra a conversa pelo botão abaixo e anexe o arquivo.'),
      h('div', { class: 'acoes' },
        h('a', { class: 'btn', href: rec.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir / imprimir recibo'),
        tel ? h('a', { class: 'btn sec wa', href: 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener noreferrer' }, 'Mandar no WhatsApp') : h('span', { class: 'peq' }, 'Cliente sem telefone no cadastro.')));
    caixa.hidden = false;
  }

  function acoesParcela(p, depois, semWhats) {
    const parar = fn => ev => { ev.stopPropagation(); fn(ev).catch(e => avisar(e.message, true)); };
    const caixa = h('div', { class: 'mini-acoes' });
    const wa = linkWhats(p);
    const pagar = h('button', { type: 'button', class: 'btn mini', onclick: parar(async () => {
      const f = h('form', { class: 'pagar', novalidate: true, onclick: e => e.stopPropagation() },
        h('input', { type: 'date', name: 'data', value: hojeISO(), 'aria-label': 'Data do pagamento' }),
        h('input', { name: 'valor', value: String(p.saldo || p.valor).replace('.', ','), inputmode: 'decimal', 'aria-label': 'Valor pago' }),
        h('select', { name: 'forma', 'aria-label': 'Forma' }, ['Pix', 'Dinheiro', 'Transferência', 'Boleto', 'Cartão', 'Alvará'].map(x => h('option', {}, x))),
        h('button', { type: 'submit', class: 'btn mini' }, 'Confirmar'), h('p', { class: 'erro' }));
      aoEnviar(f, async fd => {
        const btnC = f.querySelector('button[type=submit]'); if (btnC) btnC.textContent = 'Registrando e gerando recibo…';
        const r = await api('fin.parcela.pagar', { id: p.id, ...Object.fromEntries(fd.entries()) });
        avisar(r.recibo ? 'Pagamento registrado e recibo gerado.' : 'Pagamento registrado.' + (r.recibo_erro ? ' (O recibo não saiu: ' + r.recibo_erro + ')' : ''), !!r.recibo_erro);
        await depois();
        if (r.recibo) mostrarRecibo(r.recibo);
      });
      caixa.replaceChildren(f);
    }) }, 'Pago');
    if (p.situacao === 'paga' || p.situacao === 'paga em parte') {
      caixa.append(h('button', { type: 'button', class: 'btn mini sec', onclick: parar(async () => { await api('fin.parcela.pagar', { id: p.id, estornar: true }); avisar('Pagamento desfeito.'); depois(); }) }, 'Desfazer pagamento'));
      return caixa;
    }
    caixa.append(pagar);
    // 8.22 cobrança automática (Asaas): link do boleto/Pix ou "Gerar boleto/Pix"
    if (p.asaas_link && !/CANCEL/i.test(p.asaas_status || '')) {
      caixa.append(h('a', { class: 'btn mini sec', href: p.asaas_link, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation(), title: 'Página de pagamento do cliente (boleto, Pix ou cartão)' }, '🔗 Boleto/Pix'),
        h('button', { type: 'button', class: 'btn mini sec', title: 'Cancela a cobrança no Asaas', onclick: parar(async () => { if (!confirm('Cancelar o boleto/Pix desta parcela no Asaas?')) return; await api('fin.asaas.cancelar', { id: p.id }); avisar('Cobrança cancelada no Asaas.'); depois(); }) }, '✕'));
    } else if (ASAAS_LIGADO) {
      caixa.append(h('button', { type: 'button', class: 'btn mini sec', title: 'Gera boleto + Pix no Asaas; o link vai junto na mensagem do WhatsApp', onclick: parar(async ev => {
        ev.target.disabled = true; ev.target.textContent = 'Gerando…';
        try { const r = await api('fin.asaas.gerar', { id: p.id }); avisar('Boleto/Pix gerado' + (r.vencimento ? ' (vence ' + dataBR(r.vencimento) + ')' : '') + '. O link já vai na mensagem do WhatsApp.'); depois(); }
        catch (e) { ev.target.disabled = false; ev.target.textContent = 'Gerar boleto/Pix'; throw e; }
      }) }, 'Gerar boleto/Pix'));
    }
    if (semWhats) { if (p.situacao === 'atrasada' && p.cobranca !== 'acao') caixa.append(h('button', { type: 'button', class: 'btn mini sec', onclick: parar(async () => { await api('fin.parcela.cobranca', { id: p.id, etapa: 'acao' }); avisar('Marcado: ação de cobrança.'); depois(); }) }, 'Mandar para ação de cobrança')); return caixa; }
    if (p.situacao !== 'atrasada' && p.vencimento >= hojeISO()) {
      caixa.append(wa
        ? h('a', { class: 'btn mini sec wa', href: wa, target: '_blank', rel: 'noopener noreferrer', title: 'Abre o WhatsApp com um lembrete pronto', onclick: ev => ev.stopPropagation() }, 'Lembrar no WhatsApp')
        : h('span', { class: 'peq' }, 'sem telefone'));
    }
    if (p.situacao === 'atrasada') {
      caixa.append(wa
        ? h('a', { class: 'btn mini sec wa', href: wa, target: '_blank', rel: 'noopener noreferrer', title: 'Abre o WhatsApp com a cobrança pronta', onclick: ev => { ev.stopPropagation(); api('fin.parcela.cobranca', { id: p.id, etapa: 'mensagem' }).then(depois).catch(() => {}); } }, 'Cobrar no WhatsApp')
        : h('span', { class: 'peq' }, 'sem telefone'));
      if (p.cobranca !== 'acao') caixa.append(h('button', { type: 'button', class: 'btn mini sec', onclick: parar(async () => { await api('fin.parcela.cobranca', { id: p.id, etapa: 'acao' }); avisar('Marcado: ação de cobrança.'); depois(); }) }, 'Ação'));
    }
    return caixa;
  }

  let ASAAS_LIGADO = false; // 8.22: vem do fin.resumo / fin.honorario
  function tabelaParcelas(lista, depois, vazio, comCliente) {
    return tabela(comCliente ? ['Vencimento', 'Cliente', 'Parcela', 'Valor', 'Situação', ''] : ['Vencimento', 'Parcela', 'Valor', 'Situação', ''], lista, p => [
      h('td', { class: 'num', 'data-r': 'Vencimento' }, dataBR(p.vencimento)),
      comCliente ? h('td', { 'data-r': 'Cliente' }, p.cliente, p.telefone ? h('div', { class: 'peq' }, p.telefone) : h('div', { class: 'peq' }, 'sem telefone')) : null,
      h('td', { 'data-r': 'Parcela' }, `${p.numero}ª`, p.honorario ? h('div', { class: 'peq' }, p.honorario) : null, p.observacoes ? h('div', { class: 'peq' }, p.observacoes) : null),
      h('td', { class: 'num', 'data-r': 'Valor' }, reais(p.valor), p.pago_em ? h('div', { class: 'peq' }, `pago ${reais(p.valor_pago)} em ${dataBR(p.pago_em)}${p.forma ? ' · ' + p.forma : ''}`) : null),
      h('td', { 'data-r': 'Situação' }, etiquetaParcela(p), h('div', {}, etiquetaCobranca(p))),
      h('td', {}, acoesParcela(p, depois))
    ], p => { location.hash = '#/honorario/' + p.honorario_id; }, vazio);
  }

  /** Agradecimento com o recibo no WhatsApp (o PDF é anexado à mão: não deixamos o arquivo público). */
  function botaoReciboWhats(x) {
    let tel = telefoneWhats(x.telefone || '');
    if (!tel) return h('span', { class: 'peq' }, 'Cliente sem telefone');
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String(x.cliente || '').split(' ')[0]);
    const ps = x.parcelas || [];
    const ref = ps.length > 1 ? `das parcelas ${ps.map(q => q.numero ? q.numero + 'ª' : '').filter(Boolean).join(', ')} dos honorários` : ps[0] && ps[0].numero ? `da ${ps[0].numero}ª parcela dos honorários` : 'dos honorários';
    const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Recebemos o seu PIX de ${reais(+x.valor)} em ${new Date(x.recebido_em).toLocaleDateString('pt-BR')}, referente ${ref}. Muito obrigado! Segue o recibo.`;
    return h('a', { class: 'btn mini wa', href: 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener noreferrer', title: 'Abre o WhatsApp com o agradecimento; anexe o PDF do recibo',
      onclick: () => registrarWhats({ numero: '', cliente: x.cliente }, 'recibo do PIX') }, 'Mandar recibo no WhatsApp');
  }

  /** Robô do PIX (Inter): o que deu baixa sozinho e o que ficou para conferir. */
  function blocoPix() {
    const caixa = h('section', { class: 'caixa pix-caixa' }, h('p', { class: 'peq' }, 'Carregando os PIX recebidos…'));
    const rh = false; // 8.4.6: o RH também confere e dá baixa nos PIX
    const desenhar = r => {
      const conferir = r.lista.filter(x => x.situacao === 'a conferir'), baixados = r.lista.filter(x => x.situacao === 'baixado');
      const dt = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const valorTxt = v => v === null || v === undefined ? '•••••' : reais(+v);
      const linhaConferir = x => {
        const sel = h('select', { 'aria-label': 'Parcela' }, h('option', { value: '' }, x.abertas && x.abertas.length ? '— escolha a parcela —' : '— cliente sem parcela aberta —'),
          (x.abertas || []).map(q => h('option', { value: q.id }, `${q.numero ? q.numero + 'ª · ' : ''}venc. ${dataBR(q.vencimento)} · ${valorTxt(q.valor)}`)));
        const selCli = x.cliente_id ? null : h('select', { 'aria-label': 'Cliente', onchange: ev => {
          const ab = (r.abertas || {})[ev.target.value] || [];
          sel.replaceChildren(h('option', { value: '' }, ab.length ? '— escolha a parcela —' : '— sem parcela aberta —'), ab.map(q => h('option', { value: q.id }, `${q.numero ? q.numero + 'ª · ' : ''}venc. ${dataBR(q.vencimento)} · ${valorTxt(q.valor)}`)));
        } }, h('option', { value: '' }, 'De qual cliente é?'), r.clientes.map(c => h('option', { value: c.id }, c.nome)));
        const sg = x.sugestao;
        const confirmar = sg && !rh ? h('div', { class: 'pix-sugestao' }, h('span', {}, '💡 ', h('strong', {}, sg.cliente), ` — ${sg.numero ? sg.numero + 'ª parcela' : 'parcela'} · venc. ${dataBR(sg.vencimento)} · ${valorTxt(sg.valor)}`),
          botao('✓ Confirmar', async ev => {
            ev.target.disabled = true;
            try { const res = await api('fin.pixBaixar', { id: x.id, parcela_id: sg.id }); avisar('Baixa feita' + (res.recibo ? ' e recibo gerado.' : '.')); if (res.recibo) mostrarRecibo(res.recibo); rota(); }
            catch (e) { ev.target.disabled = false; avisar(e.message, true); }
          }, 'mini ok-bt')) : null;
        return h('li', { class: 'pix-item conferir' },
          h('div', { class: 'pix-valor' }, valorTxt(x.valor)),
          h('div', { class: 'pix-txt' }, h('strong', {}, x.pagador), h('div', { class: 'peq' }, dt(x.recebido_em), x.cliente ? ' · cliente: ' + x.cliente : ''), h('div', { class: 'peq pix-motivo' }, x.motivo), confirmar),
          rh ? null : h('div', { class: 'pix-acoes' }, selCli, sel,
            botao('Dar baixa', async ev => {
              if (!sel.value) { avisar('Escolha a parcela.', true); return; }
              ev.target.disabled = true;
              try { const res = await api('fin.pixBaixar', { id: x.id, parcela_id: sel.value }); avisar('Baixa feita' + (res.recibo ? ' e recibo gerado.' : '.')); if (res.recibo) mostrarRecibo(res.recibo); rota(); }
              catch (e) { ev.target.disabled = false; avisar(e.message, true); }
            }, 'mini'),
            (() => { // 8.7.0: "não é honorário" com o motivo; o robô aprende o pagador
              const cat = h('select', { 'aria-label': 'O que é este PIX', class: 'mini' }, h('option', { value: '' }, 'Não é honorário: o que é?'),
                ['Reembolso de custas/despesa do cliente', 'Transferência entre contas do escritório', 'Pessoal', 'Aluguel/Edifício Future', 'Outro'].map(c => h('option', { value: c }, c)));
              cat.addEventListener('change', async () => { if (!cat.value) return; cat.disabled = true;
                try { await api('fin.pixIgnorar', { id: x.id, categoria: cat.value }); avisar('Marcado: ' + cat.value + '. PIX deste pagador vão direto para cá.'); rota(); } catch (e) { cat.disabled = false; avisar(e.message, true); } });
              return cat; })()));
      };
      caixa.replaceChildren(...[
        h('div', { class: 'pix-cab' }, h('div', {}, h('h2', {}, '⚡ PIX recebidos (Banco Inter)'),
          h('p', { class: 'peq' }, 'O robô lê os e-mails do Inter de hora em hora. Mesmo nome do cliente + parcela em aberto com o mesmo valor = baixa sozinho, com recibo. O resto fica aqui para conferir.',
            r.ultima ? ' Última leitura: ' + r.ultima.replace(/^(\S+)/, iso => quando(iso)) + '.' : '')),
          rh ? null : botao('Ler o Gmail agora', async ev => {
            ev.target.disabled = true; ev.target.textContent = 'Lendo…';
            try { const x = await api('fin.pixLer'); avisar(`${x.lidos} PIX novo(s): ${x.baixados} baixa(s) automática(s), ${x.conferir} para conferir.`); rota(); }
            catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Ler o Gmail agora'; }
          }, 'sec mini')),
        conferir.length ? h('div', {}, h('h3', { class: 'pix-sub' }, `Para conferir (${conferir.length})`), h('ul', { class: 'pix-lista' }, conferir.map(linhaConferir)))
          : h('p', { class: 'pix-ok' }, '✓ Nenhum PIX para conferir.'),
        baixados.length ? h('details', { class: 'pix-feitos', open: baixados.some(x => Date.now() - Date.parse(x.atualizado_em || x.recebido_em) < 86400000) },
          h('summary', {}, `Baixas automáticas e feitas (${baixados.length})`),
          h('ul', { class: 'pix-lista' }, baixados.map(x => h('li', { class: 'pix-item ok' }, h('div', { class: 'pix-valor' }, valorTxt(x.valor)),
            h('div', { class: 'pix-txt' }, h('strong', {}, x.cliente || x.pagador), x.cliente && x.pagador && semAcentoG(x.pagador) !== semAcentoG(x.cliente) ? h('span', { class: 'peq' }, ' · pago por ' + x.pagador) : null,
              h('div', { class: 'peq' }, dt(x.recebido_em), (x.parcelas || []).length ? ' · ' + x.parcelas.map(q => `${q.numero ? q.numero + 'ª' : 'parcela'} (venc. ${dataBR(q.vencimento)})`).join(', ') : '', ' · ', x.motivo)),
            rh ? null : h('div', { class: 'pix-acoes' }, botaoReciboWhats(x), ...(x.recibos || []).map((u, i) => h('a', { class: 'btn mini sec', href: u, target: '_blank', rel: 'noopener noreferrer' }, x.recibos.length > 1 ? 'Recibo ' + (i + 1) : 'Abrir recibo'))))))) : null,
        rh || !sessao.usuario.pode.usuarios ? null : (() => {
          const inp = h('input', { type: 'number', min: 0, max: 30, step: 1, value: String(r.tolerancia), 'aria-label': 'Tolerância de juros (%)' });
          return h('details', { class: 'pix-cfg' }, h('summary', {}, `Ajustes do robô · aceita até ${r.tolerancia}% a mais em parcela vencida (multa/juros)`),
            h('div', { class: 'barra' }, h('label', {}, 'Parcela vencida paga com até ', inp, ' % a mais dá baixa sozinha (0 = desliga).'),
              botao('Salvar', async () => { try { await api('fin.pixConfig', { tolerancia: inp.value }); avisar('Salvo.'); rota(); } catch (e) { avisar(e.message, true); } }, 'sec mini')),
            h('p', { class: 'peq' }, 'O robô também dá baixa quando o PIX é a soma de parcelas em aberto (ex.: pagou duas de uma vez) e reconhece quem já pagou por um cliente antes (depois de uma baixa feita à mão).'));
        })()].filter(Boolean));
    };
    api('fin.pix', {}).then(desenhar, e => caixa.replaceChildren(h('p', { class: 'peq' }, /Ação desconhecida|desconhecid/.test(e.message) ? 'O robô do PIX precisa do Code.gs novo no Google.' : e.message)));
    return caixa;
  }

  /* 8.24 (pedido da usuária: "cobrança poluída, sem base de nada"): COBRANÇAS no modelo dos bancos digitais e do Asaas —
     3 números, uma lista com 4 abas e UM botão por linha (o resto no ⋯); clicar na linha abre a cobrança na lateral.
     Ferramentas (honorários, ação de cobrança, PIX, alvarás, recibos, conferir, sistema antigo, boleto/Pix, entradas e saídas)
     ficam no botão "Ferramentas"; cada uma abre com "← Cobranças". */
  const FERRAMENTAS_FIN = [['honorarios', 'Honorários (todos os contratos)'], ['pix', 'PIX recebidos'], ['acao', 'Ação de cobrança'], ['levantar', 'Alvarás e RPV a levantar'],
    ['recibos', 'Recibos'], ['conferir', 'Conferir cobranças'], ['antigos', 'Do sistema antigo'], ['asaas', 'Boleto/Pix automático (Asaas)', 'usuarios'], ['painel', 'Entradas e saídas do mês', 'usuarios']];
  async function telaFinanceiro(params) {
    carregando();
    const busca = params.get('busca') || '';
    const ver0 = params.get('ver') || '';
    const ver = { atraso: 'atrasadas', proximas: 'mes' }[ver0] || ver0 || '';
    const ehFerramenta = FERRAMENTAS_FIN.some(f => f[0] === ver);
    const [r, hons, px, lev] = await Promise.all([api('fin.resumo'), ver === 'honorarios' ? api('fin.honorarios', { busca }) : Promise.resolve([]), api('fin.pix', {}).catch(() => null), ver === 'levantar' ? api('fin.alevantar', {}).catch(() => []) : Promise.resolve([])]);
    const t = r.totais, rh = sessao.usuario.pode.ocultarValores, admin = sessao.usuario.pode.usuarios;
    ASAAS_LIGADO = !!r.asaas;
    const nPix = px ? px.conferir : 0;
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/financeiro' + (q.toString() ? '?' + q : ''); };
    const recarregar = () => telaFinanceiro(params);
    const form = h('form', { class: 'busca-grande', role: 'search' },
      h('span', { class: 'busca-ico', 'aria-hidden': 'true' }, '⌕'),
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar honorário por cliente', 'aria-label': 'Buscar honorários' }),
      h('button', { type: 'submit', class: 'btn' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ busca: form.busca.value.trim(), ver: 'honorarios' }); });
    const ferramenta = () => ver === 'acao' ? blocoAcaoCobranca()
      : ver === 'conferir' ? blocoConferencia()
      : ver === 'asaas' ? blocoAsaas()
      : ver === 'pix' ? blocoPix()
      : ver === 'antigos' ? blocoLevantamento()
      : ver === 'recibos' ? (() => { const box = h('div', {}, h('p', { class: 'peq' }, 'Carregando os recibos…')); G().blocoRecibos(params).then(el => box.replaceChildren(el)).catch(e => box.replaceChildren(h('p', { class: 'erro' }, e.message))); return box; })()
      : ver === 'levantar' ? h('div', {}, h('p', { class: 'peq fin-dica' }, 'O robô acha alvará, RPV e precatório nas intimações e cria a tarefa para quem cuida do processo. Depois de levantar, abra o honorário e use "Lançar alvará ou depósito": a tarefa fecha sozinha.'),
        tabela(['Cliente', 'Processo', 'Tipo', 'Valor citado', 'Honorário previsto', 'Com quem', ''], lev, x => [
          h('td', { 'data-r': 'Cliente' }, h('strong', {}, x.cliente || '—')),
          h('td', { 'data-r': 'Processo' }, x.numero || '—'),
          h('td', { 'data-r': 'Tipo' }, h('span', { class: 'tag atencao' }, x.tipo)),
          h('td', { class: 'num', 'data-r': 'Valor citado' }, x.valor ? reais(x.valor) : h('span', { class: 'peq' }, 'conferir no processo')),
          h('td', { class: 'num', 'data-r': 'Honorário previsto' }, x.valor_previsto ? h('strong', {}, reais(x.valor_previsto)) : x.honorario_id ? h('span', { class: 'peq' }, x.percentual ? x.percentual + '% do valor' : '—') : h('span', { class: 'peq' }, 'sem honorário de êxito')),
          h('td', { 'data-r': 'Com quem' }, x.responsavel || '—'),
          h('td', {}, x.honorario_id ? h('a', { class: 'btn mini', href: '#/honorario/' + x.honorario_id, onclick: ev => ev.stopPropagation() }, 'Lançar') : h('a', { class: 'btn mini sec', href: '#/honorario/novo', onclick: ev => ev.stopPropagation() }, 'Criar honorário'))
        ], x => { location.hash = '#/tarefas?q=' + encodeURIComponent(x.cliente || x.numero || ''); }, 'Nenhum alvará ou RPV esperando levantamento.'))
      : ver === 'painel' ? (() => { const box = h('div', {}, h('p', { class: 'peq' }, 'Montando…')); if (window.GESTAO) window.GESTAO.blocoPainelFinanceiro().then(el => box.replaceChildren(el || h('p', { class: 'peq' }, 'Sem dados.'))).catch(e => box.replaceChildren(h('p', { class: 'erro' }, e.message))); return box; })()
      : h('div', {}, r.aConferir ? h('p', { class: 'nota' }, `${r.aConferir} honorário(s) importado(s) do GEA para conferir.`) : null, form,
        tabela(['Cliente', 'Tipo', 'Contratado', 'Recebido', 'Em atraso', 'Situação'], hons, x => [
          h('td', { 'data-r': 'Cliente' }, h('strong', {}, x.cliente), x.descricao ? h('div', { class: 'peq' }, x.descricao) : null),
          h('td', { 'data-r': 'Tipo' }, TIPOS_HON[x.tipo] || x.tipo, x.tipo === 'exito' && x.percentual ? ` · ${x.percentual}%` : '', x.tipo === 'mensal' && x.valor_mensal ? ` · ${reais(x.valor_mensal)}/mês` : ''),
          h('td', { class: 'num', 'data-r': 'Contratado' }, x.valor_total ? reais(x.valor_total) : reais(x.resumo.total)),
          h('td', { class: 'num', 'data-r': 'Recebido' }, reais(x.resumo.pago)),
          h('td', { class: 'num', 'data-r': 'Em atraso' }, x.resumo.atrasado ? h('span', { class: 'tag urgente' }, reais(x.resumo.atrasado)) : '—'),
          h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (x.situacao === 'ativo' ? 'ok' : x.situacao === 'encerrado' ? '' : 'atencao') }, x.situacao))
        ], x => { location.hash = '#/honorario/' + x.id; }, 'Nenhum honorário cadastrado.'));

    // menu "Ferramentas"
    const menuF = h('details', { class: 'cb-ferr' }, h('summary', { class: 'btn sec' }, 'Ferramentas ▾'),
      h('div', { class: 'cb-ferr-menu', role: 'menu' },
        FERRAMENTAS_FIN.filter(f => !f[2] || sessao.usuario.pode[f[2]]).filter(f => !(rh && f[0] === 'painel')).map(f => h('a', { href: '#/financeiro?ver=' + f[0], role: 'menuitem' }, f[1], f[0] === 'pix' && nPix ? h('span', { class: 'cb-n' }, String(nPix)) : null)),
        h('hr'),
        rh ? null : h('a', { href: '#/financeiro/receber', role: 'menuitem' }, 'A receber por cliente'),
        h('a', { href: '#/financeiro/caixa', role: 'menuitem' }, 'Caixa e contas a pagar')));
    const cab = h('header', { class: 'cb-cab' },
      h('div', {}, h('h1', {}, ehFerramenta ? (FERRAMENTAS_FIN.find(f => f[0] === ver) || [])[1] : 'Cobranças'),
        ehFerramenta ? h('a', { class: 'cb-voltar', href: '#/financeiro' }, '← Cobranças') : h('p', {}, rh ? 'Você lança, dá baixa e cobra. Os totais ficam com a administração.' : 'Quem pagou, quem falta pagar e quem está atrasado.')),
      h('div', { class: 'cb-cab-acoes' }, menuF, h('a', { class: 'btn', href: '#/honorario/novo' }, '+ Novo honorário')));
    if (ehFerramenta) { mostrar(cab, h('section', { class: 'caixa cb-ferr-corpo' }, ferramenta())); return; }

    // as 4 listas
    const hoje = hojeISO(), fimMes = hoje.slice(0, 8) + String(new Date(+hoje.slice(0, 4), +hoje.slice(5, 7), 0).getDate()).padStart(2, '0');
    const listas = { atrasadas: r.atrasadas, mes: r.proximas.filter(p => p.vencimento <= fimMes), proximas: r.proximas.filter(p => p.vencimento > fimMes), pagas: r.recebidas || [] };
    const aba = ver && listas[ver] ? ver : (listas.atrasadas.length ? 'atrasadas' : 'mes');
    const nomeMes = new Date(hoje + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long' });
    const m = r.mes || {};
    const numero = (rot, valor, cls, alvo) => h('a', { class: 'cb-num ' + (cls || ''), href: '#/financeiro?ver=' + alvo }, h('small', {}, rot), h('b', {}, valor));
    const numeros = h('section', { class: 'cb-nums' },
      numero('Recebido em ' + nomeMes, rh ? `${listas.pagas.length} parcela(s)` : reais(t.recebidoMes), 'ok', 'pagas'),
      numero('Falta receber em ' + nomeMes, rh ? `${listas.mes.length} parcela(s)` : reais(m.falta != null ? m.falta : listas.mes.reduce((a, p) => a + (+p.saldo || +p.valor || 0), 0)), '', 'mes'),
      numero('Em atraso', rh ? `${t.parcelasAtrasadas} parcela(s)` : reais(t.atrasado), t.atrasado || t.parcelasAtrasadas ? 'ruim' : '', 'atrasadas'));
    const avisoPix = nPix ? h('a', { class: 'cb-aviso', href: '#/financeiro?ver=pix' }, `${nPix} PIX ${nPix > 1 ? 'chegaram e precisam' : 'chegou e precisa'} de você · conferir →`) : null;
    const abas = h('div', { class: 'cb-abas', role: 'tablist' }, [['atrasadas', 'Atrasadas'], ['mes', 'Este mês'], ['proximas', 'Próximas'], ['pagas', 'Pagas no mês']].map(([id, rot]) =>
      h('button', { type: 'button', role: 'tab', class: 'cb-aba' + (aba === id ? ' on' : ''), 'aria-selected': String(aba === id), onclick: () => ir({ ver: id }) }, rot, listas[id].length ? h('span', { class: 'cb-n' }, String(listas[id].length)) : null)));
    const VAZIO = { atrasadas: 'Ninguém atrasado. 🎉', mes: 'Nada mais vence neste mês.', proximas: 'Nada vencendo nos próximos 30 dias.', pagas: 'Nada recebido neste mês ainda.' };
    mostrar(cab, numeros, avisoPix, h('section', { class: 'cb-corpo' }, abas, linhasCobranca(listas[aba], recarregar, VAZIO[aba])));
  }

  /** 8.24: uma linha por parcela — nome, parcela, vencimento, situação, valor, UM botão e o ⋯. */
  function linhasCobranca(lista, depois, vazio) {
    if (!lista.length) return h('div', { class: 'cb-vazio' }, vazio);
    const rh = sessao.usuario.pode.ocultarValores;
    return h('ul', { class: 'cb-linhas' }, lista.map(p => {
      const paga = p.situacao === 'paga', wa = linkWhats(p);
      const principal = paga
        ? (p.recibo_url ? h('a', { class: 'btn mini sec', href: p.recibo_url, target: '_blank', rel: 'noopener noreferrer' }, 'Recibo') : null)
        : wa ? h('a', { class: 'btn mini wa', href: wa, target: '_blank', rel: 'noopener noreferrer', title: 'Abre o WhatsApp com a mensagem pronta' + (p.asaas_link ? ' (com o link do boleto/Pix)' : ''),
            onclick: () => { if (p.situacao === 'atrasada') api('fin.parcela.cobranca', { id: p.id, etapa: 'mensagem' }).catch(() => {}); } }, p.situacao === 'atrasada' ? 'Cobrar' : 'Lembrar')
          : h('span', { class: 'peq cb-semtel', title: 'Sem telefone no cadastro' }, 'sem telefone');
      const mais = h('details', { class: 'cb-mais' }, h('summary', { 'aria-label': 'Mais ações desta parcela', title: 'Pago, boleto/Pix, ação de cobrança…' }, '⋯'),
        h('div', { class: 'cb-mais-menu' }, acoesParcela(p, depois, true), h('a', { class: 'btn mini sec', href: '#/honorario/' + p.honorario_id }, 'Abrir o honorário')));
      const li = h('li', { class: 'cb-linha' + (p.situacao === 'atrasada' ? ' atrasada' : paga ? ' paga' : ''), tabindex: 0 },
        h('div', { class: 'cb-quem' }, h('b', {}, p.cliente || '—'),
          h('span', { class: 'peq' }, [p.numero ? p.numero + 'ª parcela' : 'parcela', p.honorario, p.qtdAtrasadas > 1 ? p.qtdAtrasadas + ' em atraso' : ''].filter(Boolean).join(' · '))),
        h('span', { class: 'cb-data num' }, dataBR(paga ? p.pago_em : p.vencimento).slice(0, 5)),
        h('span', { class: 'cb-sit' }, chipVenc(p)),
        h('b', { class: 'cb-val num' }, rh && p.valor === null ? '•••' : reais(paga ? (p.valor_pago || p.valor) : (p.saldo || p.valor))),
        h('span', { class: 'cb-bts' }, principal, mais));
      const abrir = ev => { if (ev.target.closest('a,button,details,input,select,form')) return; gavetaCobranca(p, depois); };
      li.addEventListener('click', abrir); li.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target === li) gavetaCobranca(p, depois); });
      return li;
    }));
  }

  /** 8.24: a cobrança aberta na LATERAL (sem trocar de tela): situação, contato, todas as parcelas do honorário. */
  async function gavetaCobranca(p, depois) {
    let g = document.getElementById('cb-gaveta');
    if (!g) { g = h('aside', { id: 'cb-gaveta', class: 'cb-gaveta', role: 'dialog', 'aria-label': 'Cobrança' }); document.body.append(g, h('div', { id: 'cb-gaveta-fundo', class: 'cb-gaveta-fundo', onclick: () => fecharGaveta() })); }
    const fundo = document.getElementById('cb-gaveta-fundo');
    const fechar = h('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar', onclick: () => fecharGaveta() }, '×');
    const rh = sessao.usuario.pode.ocultarValores;
    g.replaceChildren(fechar, h('span', { class: 'carteira-kicker' }, 'Cobrança'), h('h2', {}, p.cliente || '—'), h('p', { class: 'peq' }, p.honorario || ''),
      h('div', { class: 'cb-g-linha' }, chipVenc(p), etiquetaCobranca(p)),
      h('dl', { class: 'cb-g-dados' },
        h('dt', {}, 'Parcela'), h('dd', {}, p.numero ? p.numero + 'ª' : '—'),
        h('dt', {}, 'Vencimento'), h('dd', {}, dataBR(p.vencimento)),
        h('dt', {}, 'Valor'), h('dd', {}, rh && p.valor === null ? '•••' : reais(p.saldo || p.valor)),
        h('dt', {}, 'Telefone'), h('dd', {}, p.telefone || 'sem telefone'),
        p.asaas_link ? [h('dt', {}, 'Boleto/Pix'), h('dd', {}, h('a', { href: p.asaas_link, target: '_blank', rel: 'noopener noreferrer' }, 'abrir a página de pagamento'))] : null),
      h('div', { class: 'cb-g-acoes' }, acoesParcela(p, async () => { await depois(); fecharGaveta(); })),
      h('h3', {}, 'Todas as parcelas deste honorário'), h('div', { class: 'cb-g-parc' }, h('p', { class: 'peq' }, 'Carregando…')),
      h('a', { class: 'btn sec', href: '#/honorario/' + p.honorario_id, onclick: () => fecharGaveta() }, 'Abrir o honorário completo'));
    g.classList.add('aberta'); fundo.hidden = false; document.body.classList.add('gaveta-aberta');
    fechar.focus();
    try {
      const d = await api('fin.honorario', { id: p.honorario_id });
      const caixa = g.querySelector('.cb-g-parc'); if (!caixa) return;
      caixa.replaceChildren(h('ul', { class: 'cb-g-lista' }, (d.parcelas || []).map(q => h('li', { class: q.pago_em ? 'paga' : q.vencimento < hojeISO() ? 'atrasada' : '' },
        h('span', {}, (q.numero ? q.numero + 'ª' : '—') + ' · ' + dataBR(q.vencimento)),
        h('span', { class: 'num' }, rh && q.valor === null ? '•••' : reais(q.valor)),
        h('span', { class: 'peq' }, q.pago_em ? 'paga ' + dataBR(q.pago_em).slice(0, 5) : q.vencimento < hojeISO() ? 'atrasada' : 'a vencer')))));
    } catch (e) { const caixa = g.querySelector('.cb-g-parc'); if (caixa) caixa.replaceChildren(h('p', { class: 'erro' }, e.message)); }
  }
  function fecharGaveta() {
    const g = document.getElementById('cb-gaveta'), f = document.getElementById('cb-gaveta-fundo');
    if (g) g.classList.remove('aberta'); if (f) f.hidden = true; document.body.classList.remove('gaveta-aberta');
  }
  window.addEventListener('hashchange', () => fecharGaveta());
  // menus ⋯ e Ferramentas: um clique fora fecha
  document.addEventListener('click', ev => { document.querySelectorAll('details.cb-mais[open],details.cb-ferr[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; }); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharGaveta(); });

  /** 8.22: cobrança automática com boleto e Pix (Asaas). A chave vai só para as Propriedades do servidor. */
  function blocoAsaas() {
    const caixa = h('div', {}, h('p', { class: 'peq' }, 'Carregando…'));
    const desenhar = r => {
      const f = h('form', { class: 'caixa', novalidate: true },
        h('div', { class: 'campos' },
          campo('chave', r.ligado ? 'Chave da API (já cadastrada — deixe vazio para manter)' : 'Chave da API do Asaas', '', { tipo: 'password', dica: 'começa com $aact_ · Asaas › Integrações › Chave de API' }),
          campo('ambiente', 'Conta', r.ambiente, { opcoes: [['producao', 'Produção (cobranças de verdade)'], ['sandbox', 'Teste (sandbox)']] }),
          campo('auto', 'Gerar sozinho', r.auto ? 'sim' : 'nao', { opcoes: [['nao', 'Não — só quando eu apertar "Gerar boleto/Pix"'], ['sim', 'Sim — o robô gera antes do vencimento']] }),
          campo('dias', 'Quantos dias antes do vencimento', String(r.dias), { modo: 'numeric' }),
          campo('multa', 'Multa por atraso (%)', String(r.multa), { modo: 'decimal' }),
          campo('juros', 'Juros ao mês (%)', String(r.juros), { modo: 'decimal' })),
        h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
          botao('Testar a conexão', async () => desenhar(await api('fin.asaas.config', { testar: true })), 'sec'),
          r.ligado ? botao('Conferir pagamentos agora', async () => { const x = await api('fin.asaas.config', { sincronizar: true }); avisar(`${x.sincronizados || 0} ação(ões) feitas (baixas e cobranças geradas).`); desenhar(x); }, 'sec') : null),
        h('p', { class: 'erro' }));
      aoEnviar(f, async fd => {
        const d = Object.fromEntries(fd.entries()); if (!d.chave) delete d.chave;
        desenhar(await api('fin.asaas.config', Object.assign(d, { testar: true }))); avisar('Configuração salva.');
      });
      caixa.replaceChildren(
        h('div', { class: 'nota' + (r.ligado ? ' ok' : '') }, h('strong', {}, r.ligado ? `Ligado (${r.ambiente === 'sandbox' ? 'conta de teste' : 'produção'})` : 'Desligado'),
          r.teste ? ' · ' + r.teste : '', r.ultima ? h('div', { class: 'peq' }, 'Última conferência: ' + new Date(r.ultima.split(' · ')[0]).toLocaleString('pt-BR') + ' · ' + (r.ultima.split(' · ')[1] || '')) : null),
        h('p', { class: 'peq fin-dica' }, 'Como funciona: cada parcela ganha uma página de pagamento (boleto, Pix ou cartão — o cliente escolhe). O link vai junto na mensagem de cobrança do WhatsApp e aparece no Acompanhe do cliente. Quando o cliente paga, o robô dá baixa sozinho na parcela (de hora em hora) e o recibo sai. Com "Gerar sozinho", o robô cria as cobranças das parcelas que vencem nos próximos dias (clientes com CPF; atrasadas só pelo botão). Lembretes por e-mail/SMS ficam a cargo do Asaas (Configurações › Notificações de lá).'),
        h('details', { class: 'reneg' }, h('summary', {}, 'Passo a passo para ligar'),
          h('ol', {}, h('li', {}, 'Crie a conta no Asaas (asaas.com) com o CNPJ do escritório e conclua a validação.'),
            h('li', {}, 'No Asaas: Integrações › Chave de API › Gerar chave. Copie (começa com $aact_).'),
            h('li', {}, 'Cole aqui em "Chave da API", escolha "Produção" e Salvar. Deve aparecer "Conectado".'),
            h('li', {}, 'Teste numa parcela: "Gerar boleto/Pix" → abra o link. Depois ligue "Gerar sozinho", se quiser.'),
            h('li', {}, 'As taxas do Asaas (por boleto/Pix pago) são cobradas pelo próprio Asaas, conforme o plano da conta.'))),
        f);
    };
    api('fin.asaas.config', {}).then(desenhar).catch(e => caixa.replaceChildren(h('p', { class: 'erro' }, e.message)));
    return caixa;
  }
  /** 8.21: conferência das cobranças — o que pode estar errado ou faltando (só aponta; o conserto é no honorário). */
  function blocoConferencia() {
    const caixa = h('div', {}, h('p', { class: 'peq' }, 'Conferindo todos os honorários e parcelas…'));
    apiFresco('fin.conferencia', {}).then(r => {
      const NIV = { erro: ['Corrigir', 'urgente'], aviso: ['Conferir', 'conferir'], info: ['Ver', ''] };
      let filtro = '';
      const tipos = [...new Set(r.itens.map(x => x.titulo))];
      const desenhar = () => caixa.replaceChildren(
        h('p', { class: 'peq fin-dica' }, `Conferi ${r.honorarios} honorário(s) e ${r.parcelas} parcela(s). ${r.total ? r.total + ' ponto(s) para olhar' : 'Nada fora do lugar. 👏'}. Nada é mudado sozinho: abra cada item e corrija (Retirar honorário, editar a parcela, lançar o que falta).`),
        h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip-filtro' + (!filtro ? ' ativo' : ''), onclick: () => { filtro = ''; desenhar(); } }, 'Todos ' + r.total),
          tipos.map(t => h('button', { type: 'button', class: 'chip-filtro' + (filtro === t ? ' ativo' : ''), onclick: () => { filtro = t; desenhar(); } }, t + ' · ' + r.itens.filter(x => x.titulo === t).length))),
        h('ul', { class: 'acoes-lista' }, r.itens.filter(x => !filtro || x.titulo === filtro).map(x => h('li', { class: 'acao-' + (x.nivel === 'erro' ? 'risco' : x.nivel === 'aviso' ? 'conferir' : 'aviso'), tabindex: 0, onclick: () => { location.hash = x.link; } },
          h('span', { class: 'acao-nivel' }, NIV[x.nivel][0]), h('strong', {}, x.cliente || '(sem cliente)'), ' — ', x.titulo, x.sub ? h('div', { class: 'peq' }, x.sub) : null))));
      desenhar();
    }).catch(e => caixa.replaceChildren(h('p', { class: 'erro' }, e.message)));
    return caixa;
  }
  /** 8.21 (pedido da usuária): quem deve há mais de 60 dias (ou marcado "Ação"), por cliente, com a etapa sugerida e a prescrição. */
  function blocoAcaoCobranca() {
    const caixa = h('div', {}, h('p', { class: 'peq' }, 'Montando a lista…'));
    const rh = sessao.usuario.pode.ocultarValores;
    const ETAPA = { whatsapp: ['1 · Cobrar no WhatsApp', 'atencao'], aguardando: ['Avisado — aguardando resposta', ''], notificacao: ['2 · Notificação extrajudicial', 'conferir'], acao: ['3 · Entrar com a ação', 'urgente'] };
    const desenhar = async (todos) => {
      const r = await apiFresco('fin.acaoCobranca', { todos: !!todos });
      const marcar = (g, acao, msg) => api('fin.acaoCobranca.marcar', { cliente_id: g.cliente_id, acao }).then(() => { avisar(msg); desenhar(todos); }).catch(e => avisar(e.message, true));
      const msgCob = g => { const nome = nomeProprioJS(String(g.cliente).split(' ')[0]);
        return `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Consta em aberto ${g.parcelas.length === 1 ? 'uma parcela' : g.parcelas.length + ' parcelas'} dos honorários${rh ? '' : ', no total de ' + reais(g.total)}, a mais antiga vencida em ${dataBR(g.mais_antiga)}. Precisamos regularizar: podemos combinar o pagamento ou um parcelamento. Se já pagou, por favor nos envie o comprovante. Obrigado!`; };
      const linha = g => {
        const tel = telefoneWhats(g.telefone || ''), [rot, cls] = ETAPA[g.etapa] || ['', ''];
        return h('article', { class: 'cob-cartao' + (g.marcado_acao ? ' cob-acao' : '') },
          h('div', { class: 'cob-cab' },
            h('div', {}, h('a', { href: '#/cliente/' + g.cliente_id }, h('strong', {}, g.cliente || 'cliente sem nome')),
              h('div', { class: 'peq' }, `${g.parcelas.length} parcela(s) atrasada(s) · a mais antiga em ${dataBR(g.mais_antiga)} (${g.dias} dias)` + (g.ultimo_aviso ? ` · último aviso ${dataBR(g.ultimo_aviso)}` : ' · nunca avisado'))),
            h('div', { class: 'cob-dir' }, rh ? null : h('b', { class: 'cob-total' }, reais(g.total)), h('span', { class: 'tag ' + cls }, rot))),
          h('div', { class: 'peq' }, g.honorarios.map(x => x.descricao).filter(Boolean).join(' · '), g.promissoria ? ' · tem nota promissória' : '',
            ' · prescreve em ', h('b', { class: g.dias_prescricao < 180 ? 'txt-vermelho' : '' }, dataBR(g.prescreve_em)), g.dias_prescricao < 180 ? ' (faltam ' + g.dias_prescricao + ' dias!)' : '',
            !g.cpf || !g.endereco ? h('span', { class: 'tag conferir' }, 'falta ' + [!g.cpf ? 'CPF' : '', !g.endereco ? 'endereço' : ''].filter(Boolean).join(' e ') + ' para a ação') : null),
          h('div', { class: 'g-acoes' },
            tel ? botaoAvisar('https://wa.me/' + (tel.length <= 11 ? '55' + tel : tel) + '?text=' + encodeURIComponent(msgCob(g)), 'Cobrar no WhatsApp', g.ultimo_aviso === hojeISO() ? { em: new Date().toISOString() } : null,
              () => api('fin.acaoCobranca.marcar', { cliente_id: g.cliente_id, acao: 'avisado' }).catch(() => {})) : h('span', { class: 'peq' }, 'sem telefone'),
            h('a', { class: 'btn mini sec', href: '#/modelos?cliente=' + g.cliente_id + '&docs=cobranca' }, '📄 Notificação de cobrança'),
            g.marcado_acao ? botao('Tirar de "entrar com a ação"', () => marcar(g, 'limpar', 'Desmarcado.'), 'mini sec') : botao('⚖ Marcar: entrar com a ação', () => marcar(g, 'acao', 'Marcado para a ação de cobrança.'), 'mini'),
            g.honorarios[0] ? h('a', { class: 'btn mini sec', href: '#/honorario/' + g.honorarios[0].id }, 'Abrir honorário') : null,
            g.ignorado ? botao('Voltar para a lista', () => marcar(g, 'voltar', 'Voltou para a lista.'), 'mini sec') : botao('Não cobrar (tirar da lista)', () => { if (confirm('Tirar ' + g.cliente + ' da lista de ação de cobrança? (as parcelas continuam em atraso; para tirar o honorário use "Retirar honorário")')) marcar(g, 'ignorar', 'Tirado da lista.'); }, 'mini sec')));
      };
      const n = k => r.lista.filter(g => g.etapa === k).length;
      caixa.replaceChildren(
        h('p', { class: 'peq fin-dica' }, 'Quem deve há mais de 60 dias. Caminho: 1) cobrar no WhatsApp → 2) sem resposta em 15 dias e mais de 90 dias de atraso: notificação extrajudicial → 3) entrar com a ação (honorários do contrato assinado são título executivo: art. 24 do EAOAB). Prescreve em 5 anos do vencimento (art. 25 do EAOAB).'),
        h('div', { class: 'chips' }, h('span', { class: 'chip-filtro' }, `${r.lista.length} cliente(s)`), h('span', { class: 'chip-filtro' }, `${n('acao')} para entrar com a ação`), h('span', { class: 'chip-filtro' }, `${n('notificacao')} para notificar`), h('span', { class: 'chip-filtro' }, `${n('whatsapp')} para cobrar`),
          r.ignorados ? h('button', { type: 'button', class: 'chip-filtro', onclick: () => desenhar(!todos) }, todos ? 'esconder os tirados' : `ver os ${r.ignorados} tirado(s) da lista`) : null),
        r.lista.length ? h('div', { class: 'cob-lista' }, r.lista.map(linha)) : h('p', { class: 'vazio' }, 'Ninguém com mais de 60 dias de atraso. 👏'));
    };
    desenhar(false).catch(e => caixa.replaceChildren(h('p', { class: 'erro' }, e.message)));
    return caixa;
  }

  /** 8.11: honorários que estão nos contratos/promissórias/GEA (planilha do levantamento) e ainda não estão no painel. Nada é lançado sozinho. */
  function blocoLevantamento() {
    const caixa = h('div', {}, h('p', { class: 'peq' }, 'Lendo a planilha do levantamento (contratos, promissórias, GEA)…'));
    let mostrarTodos = false;
    const desenhar = r => {
      const pend = r.lista.filter(x => !x.ignorado), ign = r.lista.filter(x => x.ignorado);
      const exitoAtivos = pend.filter(x => x.ativo && x.fontes.some(f => f.percentual > 0));
      const resumoF = f => f.aba === 'Contrato' ? `Contrato: ${f.percentual ? f.percentual + '% de êxito' : ''}${f.valor ? ' ' + reais(f.valor) : ''}${f.parcelas ? ' em ' + f.parcelas + 'x' : ''}${!f.percentual && !f.valor ? (f.modalidade || 'condição a conferir') : ''}${/não verificada/i.test(f.assinatura || '') ? ' (assinatura não conferida)' : ''}`
        : f.aba === 'Mensalista' ? `Mensalista: ${reais(f.mensal)}/mês${f.parcelas ? ' · ' + f.parcelas + ' meses' : ''}`
        : f.aba === 'Cobrança' ? `Cobrança do sistema antigo (nada em aberto no painel): ${f.valor ? reais(f.valor) + ' · ' : ''}${f.situacao}`
        : f.aba === 'Agenda GEA' ? `Agenda do GEA (nada em aberto no painel): faltariam ${f.parcelas} × ${reais(f.valor)} — ${f.obs}`
        : `Promissórias: ${f.parcelas || '?'} × ${f.valor ? reais(f.valor) : '?'}${f.primeiro ? ' desde ' + dataBR(f.primeiro) : ''}`;
      const linkNovo = (x, f) => {
        const q = new URLSearchParams({ cliente: x.cliente_id });
        if (f.aba === 'Mensalista') { q.set('tipo', 'mensal'); q.set('mensal', String(f.mensal)); if (f.inicio) q.set('inicio', f.inicio); }
        else if (f.percentual && !f.valor) { q.set('tipo', 'exito'); q.set('pct', String(f.percentual)); }
        else { q.set('tipo', 'parcelado'); const n = f.parcelas || 1; if ((f.aba === 'Promissórias' || f.aba === 'Agenda GEA') && f.valor) q.set('valor', String(Math.round(f.valor * n * 100) / 100)); else if (f.valor) q.set('valor', String(f.valor)); q.set('parcelas', String(n)); if (f.primeiro) q.set('venc', f.primeiro); }
        q.set('obs', 'Do levantamento (' + f.aba + ')' + (f.link ? ': ' + f.link : ''));
        return '#/honorario/novo?' + q;
      };
      const linha = x => h('li', { class: 'lev-item' + (x.ativo ? ' ativo' : '') },
        h('div', { class: 'lev-txt' }, h('a', { href: '#/cliente/' + x.cliente_id }, h('strong', {}, x.nome)), x.ativo ? h('span', { class: 'tag ok' }, 'processo ativo') : h('span', { class: 'tag' }, 'sem processo ativo'),
          h('ul', { class: 'lev-fontes' }, x.fontes.map(f => h('li', {}, resumoF(f), ' ', f.link ? h('a', { href: f.link, target: '_blank', rel: 'noopener noreferrer' }, 'ver') : null, ' ',
            h('a', { class: 'btn mini', href: linkNovo(x, f) }, 'Lançar'))))),
        h('div', { class: 'lev-bts' }, x.ignorado ? botao('Voltar para a lista', async ev => { ev.target.disabled = true; await api('fin.levantamento', { acao: 'voltar', cliente_id: x.cliente_id }); carregar(); }, 'mini sec')
          : botao('Não lançar', async ev => { ev.target.disabled = true; await api('fin.levantamento', { acao: 'ignorar', cliente_id: x.cliente_id }); ev.target.closest('li').remove(); }, 'mini sec')));
      const visiveis = mostrarTodos ? pend : pend.slice(0, 60);
      caixa.replaceChildren(
        h('p', { class: 'peq fin-dica' }, `${pend.length} cliente(s) têm honorário ou dívida nos contratos, promissórias, planilhas de cobrança ou agenda do GEA e isso não está no painel. Os dados vieram da leitura dos PDFs: confira antes de lançar. "Lançar" abre o honorário já preenchido.`),
        exitoAtivos.length ? h('div', { class: 'nota' }, `${exitoAtivos.length} são de êxito (percentual) com processo ativo. `,
          botao(`Lançar os ${exitoAtivos.length} de êxito (ficam "Importado — conferir")`, async ev => {
            if (!confirm(`Lançar ${exitoAtivos.length} honorários de êxito, cada um com o percentual do contrato, como "Importado — conferir"? Não cria parcelas.`)) return;
            ev.target.disabled = true;
            const itens = exitoAtivos.map(x => { const f = x.fontes.find(f => f.percentual > 0); return { cliente_id: x.cliente_id, processo_id: x.processo_id, percentual: f.percentual, fonte: f.link || '' }; });
            const r2 = await api('fin.levantamento', { acao: 'lancar_exito', itens }); avisar(`${r2.feitos} honorário(s) de êxito lançado(s).`); carregar();
          }, 'mini')) : null,
        h('ul', { class: 'lev-lista' }, visiveis.map(linha)),
        pend.length > visiveis.length ? botao(`Mostrar todos (${pend.length})`, () => { mostrarTodos = true; desenhar(r); }, 'sec') : null,
        ign.length ? h('details', {}, h('summary', {}, `Marcados "não lançar" (${ign.length})`), h('ul', { class: 'lev-lista' }, ign.map(linha))) : null);
    };
    const carregar = () => api('fin.levantamento', {}).then(desenhar).catch(e => caixa.replaceChildren(h('p', { class: 'erro' }, e.message)));
    carregar();
    return caixa;
  }

  /** A receber: quem deve ao escritório, por cliente e honorário (para conferir, cobrar e imprimir). */
  async function telaAReceber(params) {
    carregando();
    const r = await api('fin.areceber', {});
    const ver = params.get('ver') || 'todos';
    const busca = (params.get('busca') || '').trim();
    const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/financeiro/receber' + (q.toString() ? '?' + q : ''); };
    let lista = r.lista;
    if (ver === 'atraso') lista = lista.filter(g => g.atrasado > 0);
    if (ver === 'dia') lista = lista.filter(g => !g.atrasado);
    if (busca) lista = lista.filter(g => norm(g.cliente + ' ' + g.descricao).includes(norm(busca)));
    const t = r.totais;
    const somaSaldo = lista.reduce((a, g) => a + g.saldo, 0), somaAtraso = lista.reduce((a, g) => a + g.atrasado, 0);
    const form = h('form', { class: 'barra nao-imprimir', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar cliente', 'aria-label': 'Buscar cliente' }),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ busca: form.busca.value.trim() }); });
    const wa = g => linkWhats({ telefone: g.telefone, cliente: g.cliente, honorario: g.descricao, qtdAtrasadas: g.atrasadas,
      numero: g.atrasado ? '' : (g.proxima ? g.proxima.numero : ''), saldo: g.atrasado || (g.proxima ? g.proxima.valor : g.saldo),
      vencimento: g.atrasado ? g.desde : (g.proxima ? g.proxima.vencimento : hojeISO()) });
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'A receber'),
        h('p', {}, `${t.clientes} cliente(s) com valores a receber · ${t.devendo} com parcela atrasada · posição em ${dataBR(r.hoje)}`)),
        h('div', { class: 'barra nao-imprimir' }, h('a', { class: 'btn sec', href: '#/financeiro' }, '← Financeiro'), botao('Imprimir lista', () => window.print()))),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('b', {}, reais(t.saldo)), h('span', {}, 'falta receber (todas as parcelas em aberto)')),
        h('div', { class: 'numero' + (t.atrasado ? ' destaque' : '') }, h('b', {}, reais(t.atrasado)), h('span', {}, 'já vencido e não pago')),
        h('div', { class: 'numero' }, h('b', {}, reais(t.recebido)), h('span', {}, 'já recebido desses contratos')),
        h('div', { class: 'numero' }, h('b', {}, reais(t.total)), h('span', {}, 'valor total contratado'))),
      h('div', { class: 'barra-filtros nao-imprimir' },
        h('div', { class: 'chips' }, [['todos', 'Todos'], ['atraso', 'Com parcela atrasada'], ['dia', 'Em dia']].map(([v, rot]) =>
          h('button', { type: 'button', class: 'chip-filtro' + (ver === v ? ' ativo' : ''), onclick: () => ir({ ver: v === 'todos' ? '' : v }) }, rot))),
        form),
      compacta(tabela(['Cliente', 'Honorário', 'Parcelas', 'Valor total', 'Recebido', 'Falta receber', 'Atrasado', 'Próxima parcela', ''], lista, g => [
        h('td', { 'data-r': 'Cliente' }, h('strong', {}, g.cliente || '(sem cliente)'), g.telefone ? h('div', { class: 'peq' }, g.telefone) : null),
        h('td', { 'data-r': 'Honorário' }, g.descricao || '—', g.tipo === 'mensal' ? h('div', { class: 'peq' }, 'mensalidade') : null),
        h('td', { class: 'num', 'data-r': 'Parcelas' }, `${g.pagas} de ${g.parcelas} pagas`, h('div', { class: 'peq' }, `faltam ${g.parcelas - g.pagas}` + (g.ultima ? ` · última ${dataBR(g.ultima)}` : ''))),
        h('td', { class: 'num', 'data-r': 'Valor total' }, reais(g.total)),
        h('td', { class: 'num', 'data-r': 'Recebido' }, reais(g.recebido)),
        h('td', { class: 'num', 'data-r': 'Falta receber' }, h('strong', {}, reais(g.saldo))),
        h('td', { class: 'num', 'data-r': 'Atrasado' }, g.atrasado ? h('div', {}, h('span', { class: 'tag urgente' }, reais(g.atrasado)), h('div', { class: 'peq' }, `${g.atrasadas} parcela(s) · ${g.dias_atraso} dia(s)`)) : h('span', { class: 'tag ok' }, 'em dia')),
        h('td', { class: 'num', 'data-r': 'Próxima' }, g.proxima ? h('div', {}, dataBR(g.proxima.vencimento), h('div', { class: 'peq' }, `${g.proxima.numero}ª · ${reais(g.proxima.valor)}`)) : '—'),
        h('td', { class: 'nao-imprimir' }, wa(g) ? h('a', { class: 'btn mini sec wa', href: wa(g), target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, g.atrasado ? 'Cobrar' : 'Lembrar') : h('span', { class: 'peq' }, 'sem telefone'))
      ], g => { location.hash = '#/honorario/' + g.honorario_id; }, busca || ver !== 'todos' ? 'Ninguém neste filtro.' : 'Ninguém devendo ao escritório. 🎉')),
      lista.length ? h('p', { class: 'total-lista' }, h('strong', {}, `Total desta lista: ${reais(somaSaldo)} a receber`), somaAtraso ? ` · ${reais(somaAtraso)} em atraso` : '') : null);
  }

  async function telaHonorario(id, params) {
    carregando();
    const novo = id === 'novo';
    const [clientes, procs, dados] = await Promise.all([api('clientes.listar', {}), api('processos.listar', {}), novo ? null : api('fin.honorario', { id })]);
    // 8.11: "Lançar" do levantamento chega com os dados no endereço (tipo, valor, parcelas, vencimento, %, mensalidade, observação)
    const x = novo ? { cliente_id: params.get('cliente') || '', tipo: ['parcelado', 'exito', 'mensal'].includes(params.get('tipo')) ? params.get('tipo') : 'parcelado', situacao: params.get('obs') ? 'importado — conferir' : 'ativo',
      valor_total: params.get('valor') || '', percentual: params.get('pct') || '', valor_mensal: params.get('mensal') || '', inicio: params.get('inicio') || '', observacoes: params.get('obs') || '' } : dados.honorario;
    const recarregar = () => telaHonorario(id, params);
    if (dados) ASAAS_LIGADO = !!dados.asaas;
    const opCli = [['', '— escolha o cliente —']].concat(clientes.map(c => [c.id, c.nome]));
    const opProc = [['', '— sem processo —']].concat(procs.filter(p => p.numero).map(p => [p.id, p.numero + ' · ' + (p.cliente_nome || '')]));
    const so = (tipos, el) => { el.dataset.tipos = tipos; return el; };
    const form = h('form', { class: 'caixa', novalidate: true },
      h('div', { class: 'campos' },
        campo('cliente_id', 'Cliente', x.cliente_id, { opcoes: opCli }),
        campo('processo_id', 'Processo (opcional)', x.processo_id, { opcoes: opProc }),
        campo('tipo', 'Tipo', x.tipo, { opcoes: Object.entries(TIPOS_HON) }),
        campo('descricao', 'Descrição', x.descricao, { max: 200, dica: 'Ex.: Ação trabalhista, Divórcio, Assessoria mensal' }),
        so('parcelado', campo('valor_total', 'Valor total (R$)', x.valor_total ? String(x.valor_total).replace('.', ',') : '', { modo: 'decimal' })),
        novo ? so('parcelado', campo('parcelas', 'Número de parcelas', params.get('parcelas') || '1', { modo: 'numeric', max: 3 })) : null,
        novo ? so('parcelado', campo('primeiro_vencimento', '1º vencimento', params.get('venc') || hojeISO(), { tipo: 'date' })) : null,
        novo ? so('parcelado', campo('dia_demais', 'Demais parcelas: todo dia', '', { modo: 'numeric', max: 2, dica: 'Vazio = mesmo dia da 1ª' })) : null,
        so('exito', campo('percentual', 'Percentual do êxito (%)', x.percentual, { modo: 'decimal', max: 6 })),
        so('mensal', campo('valor_mensal', 'Mensalidade (R$)', x.valor_mensal ? String(x.valor_mensal).replace('.', ',') : '', { modo: 'decimal' })),
        so('mensal', campo('dia_vencimento', 'Dia do vencimento', x.dia_vencimento, { modo: 'numeric', max: 2 })),
        so('mensal', campo('inicio', 'Início da assessoria', x.inicio || hojeISO(), { tipo: 'date' })),
        campo('situacao', 'Situação', x.situacao, { opcoes: [['ativo', 'Ativo'], ['encerrado', 'Encerrado'], ['importado — conferir', 'Importado — conferir']].concat(/^(retirado|cancelado)/.test(x.situacao || '') ? [[x.situacao, x.situacao.charAt(0).toUpperCase() + x.situacao.slice(1)]] : []) }),
        campo('observacoes', 'Observações', x.observacoes, { area: true, largo: true })),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, novo ? 'Cadastrar honorário' : 'Salvar'), h('a', { class: 'btn sec', href: '#/financeiro' }, 'Voltar')),
      h('p', { class: 'erro' }));
    const ajustar = () => form.querySelectorAll('[data-tipos]').forEach(el => { el.hidden = !el.dataset.tipos.split(',').includes(form.tipo.value); });
    form.tipo.addEventListener('change', ajustar); ajustar();
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      if (!novo) d.id = x.id;
      const r = await api('fin.honorario.salvar', { honorario: d });
      avisar(novo ? 'Honorário cadastrado.' : 'Alterações salvas.');
      if (novo) location.hash = '#/honorario/' + r.id; else recarregar();
    });
    let extras = [];
    if (!novo) {
      const nova = h('form', { class: 'barra', novalidate: true },
        h('input', { type: 'date', name: 'vencimento', value: hojeISO(), 'aria-label': 'Vencimento' }),
        h('input', { name: 'valor', placeholder: 'Valor (R$)', inputmode: 'decimal', 'aria-label': 'Valor' }),
        h('button', { type: 'submit', class: 'btn sec' }, 'Acrescentar parcela'), h('p', { class: 'erro' }));
      aoEnviar(nova, async fd => { await api('fin.parcela.salvar', { parcela: { honorario_id: x.id, ...Object.fromEntries(fd.entries()) } }); avisar('Parcela acrescentada.'); recarregar(); });
      extras.push(h('h2', { class: 'mt' }, 'Parcelas'), tabelaParcelas(dados.parcelas.map(p => ({ ...p, telefone: x.telefone, cliente: x.cliente })), recarregar, 'Nenhuma parcela.', false), nova);
      // 8.21 (pedido da usuária): mudar o dia de pagamento de todas as parcelas em aberto e retirar o honorário (só administração e RH)
      const abertasH = dados.parcelas.filter(p => !p.pago_em);
      if (abertasH.length) {
        const fDia = h('form', { class: 'barra', novalidate: true },
          h('label', {}, 'Mudar o dia de pagamento para todo dia ', h('input', { name: 'dia', inputmode: 'numeric', maxlength: 2, size: 3, 'aria-label': 'Dia', value: (abertasH[0].vencimento || '').slice(8, 10) })),
          h('label', {}, ' a partir de ', h('input', { type: 'date', name: 'desde', value: abertasH.map(p => p.vencimento).sort()[0] || hojeISO(), 'aria-label': 'A partir de' })),
          h('button', { type: 'submit', class: 'btn sec' }, 'Mudar o dia'), h('p', { class: 'erro' }));
        aoEnviar(fDia, async fd => { const r = await api('fin.honorario.dia', { id: x.id, dia: fd.get('dia'), desde: fd.get('desde') }); avisar(`${r.parcelas} parcela(s) passaram para o dia ${fd.get('dia')}.`); recarregar(); });
        extras.push(h('div', { class: 'caixa' }, h('h3', {}, '📝 Notas promissórias'), h('p', { class: 'peq' }, `Gera uma nota por parcela em aberto (${abertasH.length}), duas por folha, para o cliente assinar. Vão para a pasta do cliente › DOCUMENTOS PARA ASSINAR.`),
          h('a', { class: 'btn sec', href: '#/modelos?cliente=' + x.cliente_id + '&docs=promissoria&honorario=' + x.id }, 'Gerar as notas promissórias')));
        extras.push(h('div', { class: 'caixa' }, h('h3', {}, '📅 Dia de pagamento'), h('p', { class: 'peq' }, `${abertasH.length} parcela(s) em aberto. Mês sem o dia (ex.: 31 em fevereiro) fica no último dia do mês.`), fDia));
      }
      if (!/^(retirado|cancelado)/.test(x.situacao || '')) extras.push(h('details', { class: 'reneg' }, h('summary', {}, '🗑 Retirar este honorário da cobrança'),
        (() => { const f = h('form', { class: 'caixa', novalidate: true },
          h('p', { class: 'peq' }, `O honorário sai das cobranças e NÃO vira saldo devedor: as ${abertasH.length} parcela(s) em aberto são apagadas; as pagas ficam como histórico. Use para lançamento errado, em duplicidade, quitado por acordo ou que não deve ser cobrado.`),
          campo('motivo', 'Motivo (obrigatório)', '', { largo: true, max: 300 }),
          h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn perigo' }, 'Retirar honorário')), h('p', { class: 'erro' }));
          aoEnviar(f, async fd => { if (!confirm('Retirar este honorário? As parcelas em aberto serão apagadas.')) return; const r = await api('fin.honorario.retirar', { id: x.id, motivo: fd.get('motivo') }); avisar(`Honorário retirado (${r.parcelas} parcela(s) em aberto apagadas).`); recarregar(); });
          return f; })()));
      // 8.11.2: renegociar — o que falta pagar (abertas + resto das pagas em parte) vira novas parcelas
      const emAberto = dados.parcelas.filter(p => !p.pago_em || (p.valor_pago && +p.valor_pago < +p.valor));
      if (emAberto.length && !sessao.usuario.pode.ocultarValores) {
        const saldo = emAberto.reduce((t, p) => t + (+p.valor || 0) - (p.pago_em ? (+p.valor_pago || 0) : 0), 0);
        const reneg = h('form', { class: 'caixa', novalidate: true },
          h('h3', {}, `Renegociar (em aberto: ${reais(saldo)} em ${emAberto.length} parcela${emAberto.length === 1 ? '' : 's'})`),
          h('p', { class: 'peq' }, 'As parcelas em aberto saem e o saldo vira parcelas novas. Pagamento parcial: a parcela fica com o que foi pago e o resto entra na renegociação.'),
          h('div', { class: 'campos' },
            campo('parcelas', 'Em quantas parcelas', '1', { modo: 'numeric', max: 3 }),
            campo('primeiro_vencimento', '1º vencimento', hojeISO(), { tipo: 'date' }),
            campo('dia_demais', 'Demais: todo dia', '', { modo: 'numeric', max: 2, dica: 'vazio = mesmo dia' }),
            campo('acrescimo', 'Juros/multa combinados (R$)', '', { modo: 'decimal' }),
            campo('desconto', 'Desconto (R$)', '', { modo: 'decimal' }),
            campo('motivo', 'Motivo / combinado', '', { largo: true, max: 200 })),
          h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Renegociar')), h('p', { class: 'erro' }));
        aoEnviar(reneg, async fd => {
          if (!confirm(`Renegociar ${reais(saldo)} em ${fd.get('parcelas')} parcela(s)?`)) return;
          const r = await api('fin.renegociar', { honorario_id: x.id, ...Object.fromEntries(fd.entries()) });
          avisar(`Renegociado: ${reais(r.saldo)} em ${r.parcelas}x.`); recarregar();
        });
        extras.push(h('details', { class: 'reneg' }, h('summary', {}, '↻ Renegociar a dívida'), reneg));
      }
      if (x.tipo === 'exito') {
        const alv = h('form', { class: 'caixa', novalidate: true },
          h('h3', {}, 'Lançar alvará ou depósito'),
          h('div', { class: 'campos' },
            campo('valor_bruto', 'Valor recebido no processo (R$)', '', { modo: 'decimal' }),
            campo('percentual', 'Percentual (%)', x.percentual, { modo: 'decimal' }),
            campo('data', 'Data', hojeISO(), { tipo: 'date' })),
          h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular e lançar')), h('p', { class: 'erro' }));
        aoEnviar(alv, async fd => {
          const r = await api('fin.recebimento.salvar', { honorario_id: x.id, ...Object.fromEntries(fd.entries()) });
          avisar(`Honorários ${reais(r.honorarios)} · repasse ao cliente ${reais(r.repasse_cliente)}.`); recarregar();
        });
        extras.push(alv, dados.recebimentos.length ? tabela(['Data', 'Recebido no processo', '%', 'Escritório', 'Repasse ao cliente'], dados.recebimentos, r => [
          h('td', { class: 'num' }, dataBR(r.data)), h('td', { class: 'num' }, reais(r.valor_bruto)), h('td', {}, r.percentual + '%'),
          h('td', { class: 'num' }, reais(r.honorarios)), h('td', { class: 'num' }, h('strong', {}, reais(r.repasse_cliente)))], () => {}, '') : null);
      }
    }
    mostrar(h('div', { class: 'cab' }, h('div', {}, h('h1', {}, novo ? 'Novo honorário' : (x.cliente || 'Honorário')),
      novo ? null : h('p', {}, (TIPOS_HON[x.tipo] || x.tipo) + (x.origem ? ' · origem: ' + x.origem : '')))),
      x.situacao === 'importado — conferir' ? h('div', { class: 'nota alerta' }, 'Importado da planilha de levantamento. Confira valores e vencimentos com os comprovantes e mude a situação para Ativo ou Encerrado.') : null,
      form, ...extras);
  }

  /* ---------- modelos ---------- */

  async function telaModelos(params) {
    // 8.25 (pedido da usuária: "muita informação logo de cara"): a tela abre com 3 escolhas grandes; o formulário vem depois
    if (![...params.keys()].length) {
      const escolha = (ico, tit, txt, acao) => h(typeof acao === 'string' ? 'a' : 'button', Object.assign({ class: 'doc-escolha-cartao' }, typeof acao === 'string' ? { href: acao } : { type: 'button', onclick: acao }),
        h('span', { class: 'doc-esc-ico', 'aria-hidden': 'true' }, ico), h('b', {}, tit), h('span', {}, txt));
      mostrar(h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Documentos'), h('p', {}, 'O que você quer fazer agora?'))),
        h('div', { class: 'doc-escolhas' },
          escolha('✍', 'Documentos para um cliente', 'Procuração, contrato de honorários, declarações, notas promissórias. Sai preenchido com o cadastro.', '#/modelos?passo=gerar'),
          escolha('💼', 'Proposta de honorários', 'Para quem ainda está decidindo: o que inclui, valores e como trabalhamos, em PDF.', () => G().dialogoProposta(null, null)),
          escolha('⚖', 'Petição simples', 'Ciência, dilação de prazo, impulso, juntada, novo endereço, rol de testemunhas… precisa do nº do processo.', '#/modelos?passo=gerar&abrir=peticoes')),
        h('p', { class: 'peq doc-escolhas-rodape' }, 'Calcular rescisão, prazo ou correção? ', h('a', { href: '#/calculadoras' }, 'Calculadoras'), ' · Gravar uma conversa com o cliente? ', h('a', { href: '#/transcricao' }, 'Gravar e resumir')));
      return;
    }
    carregando();
    let [info, clientes] = await Promise.all([carregarModelos(), api('clientes.listar', {})]);
    if (params.get('cliente') && !clientes.some(c => c.id === params.get('cliente'))) clientes = await apiFresco('clientes.listar', {}); // cliente recém-cadastrado
    const pode = sessao.usuario.pode;
    const grupos = {};
    info.modelos.forEach(m => { (grupos[m.grupo] = grupos[m.grupo] || []).push(m); });

    const advs = h('div', {},
      h('p', { class: 'peq' }, 'Quem aparece como outorgado(a) na procuração e como responsável nos contratos. O(a) marcado(a) como padrão vem escolhido primeiro.'),
      h('ul', { class: 'lista-int' }, info.advogados.map(a => h('li', {}, h('strong', {}, a.nome), ` — OAB/${a.uf} ${a.oab}`, a.padrao === 'sim' ? h('span', { class: 'tag info' }, 'padrão') : null,
        a.email ? h('div', { class: 'peq' }, [a.email, a.telefone].filter(Boolean).join(' · ')) : null))));
    if (pode.usuarios) {
      const f = h('form', { class: 'campos mt-p', novalidate: true },
        campo('nome', 'Nome completo', '', { max: 120 }),
        campo('oab', 'Nº da OAB', '', { max: 12, dica: 'Ex.: 54.832' }),
        campo('uf', 'UF da OAB', 'SC', { max: 2 }),
        campo('tratamento', 'Tratamento', 'advogada', { opcoes: [['advogada', 'Advogada'], ['advogado', 'Advogado']] }),
        campo('email', 'E-mail', '', { tipo: 'email', max: 120 }),
        campo('telefone', 'Telefone', '', { tipo: 'tel', max: 30 }),
        h('label', { class: 'marcar largo' }, h('input', { type: 'checkbox', name: 'padrao', value: 'sim' }), 'Usar como padrão'),
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn sec' }, 'Cadastrar advogado(a)')),
        h('p', { class: 'erro largo' }));
      aoEnviar(f, async fd => {
        await api('advogados.salvar', { advogado: Object.fromEntries(fd.entries()) });
        avisar('Advogado(a) cadastrado(a).');
        rota();
      });
      advs.append(h('details', { class: 'sub' }, h('summary', {}, 'Cadastrar outro(a) advogado(a)'), f));
    }

    const novoCli = params.get('novo') === '1' && clientes.find(c => c.id === params.get('cliente'));
    const assinTopo = h('div');
    // 8.6.0 (pedido da usuária): "Aguardando assinatura" fica só em Clientes; em Modelos não aparece mais
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Documentos e propostas'),
        h('p', {}, 'Escolha o cliente, o(a) advogado(a), o tipo de ação e os documentos. O painel preenche com o cadastro e salva na pasta do cliente em PDF e Google Docs.')),
        h('div', { class: 'barra' }, botao('📄 Proposta de honorários', () => G().dialogoProposta(null, null), 'dourado'), h('a', { class: 'btn sec', href: '#/calculadoras' }, 'Calculadoras'), botao('📋 Copiar o padrão de petições (para IA)', async ev => {
          // 8.11: o comando do escritório para qualquer IA (formatação, estrutura, artigos, jurisprudência, cálculos, pedidos)
          try {
            const t = await (await fetch('/painel/padrao-peticoes.md?v=' + VERSAO_PAINEL, { cache: 'no-cache' })).text();
            const corpo = t.split(/\n---\n/).slice(1).join('\n---\n').replace(/^#+\s*/gm, '').trim();
            await navigator.clipboard.writeText(corpo);
            avisar('Padrão copiado. Cole na IA e acrescente o relato do caso e os documentos (de preferência com o PDF de referência).');
          } catch (e) { avisar('Não consegui copiar. Abra docs/PADRAO-PETICOES.md no repositório.', true); }
        }, 'sec'))),
      assinTopo,
      novoCli ? h('div', { class: 'passo-ok' }, h('strong', {}, `✓ ${novoCli.nome} cadastrado(a).`), ' Agora escolha o tipo de ação e gere a procuração e o contrato.') : null,
      h('section', { class: 'caixa' + (novoCli ? ' destaque-caixa' : '') }, h('h2', {}, 'Gerar para um cliente'),
        formGerar(info, { clientes, clienteInicial: params.get('cliente') || '', docs: params.get('docs') || '', honorario: params.get('honorario') || '', abrirCat: params.get('abrir') || '' })),
      secao('Modelos do escritório', () => h('div', {},
        info.pastaEscritorio ? h('p', {}, h('a', { class: 'btn sec', href: info.pastaEscritorio, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir a pasta de modelos no Drive'),
          h('span', { class: 'peq' }, '  Todo Google Docs colocado nessa pasta aparece sozinho aqui. Campos entre colchetes, como [NOME DA PARTE], [VARA] e [CIDADE/UF], são preenchidos.')) : null,
        blocoLiberarModelos(),
        h('p', { class: 'peq' }, 'Para mudar o texto, abra o modelo no Google Docs e edite. Mantenha os campos entre chaves duplas, como {{nome}}, {{qualificacao_resto}}, {{advogado_nome}}, {{numero_processo}}, {{objeto}} e {{clausula_honorarios}}; o painel preenche sozinho. Padrão visual: EB Garamond 12, justificado, logo no topo e rodapé do escritório.'),
        h('div', { class: 'modelos-grade' }, Object.keys(grupos).map(g => h('div', {}, h('h4', {}, g),
          h('ul', { class: 'lista-int' }, grupos[g].map(m => h('li', {}, m.nome, ' · ', m.url ? h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, 'editar no Google Docs') : h('span', { class: 'peq' }, 'montado pelo painel a partir das parcelas (não tem modelo para editar)')))))))), false),
      secao('Tipos de ação', () => h('div', {},
        h('p', { class: 'peq' }, 'Cada tipo preenche a finalidade da procuração e acrescenta os poderes específicos daquela ação (por exemplo, perícias e Meu INSS na previdenciária, prisão civil na pensão alimentícia, art. 44 do CPP na queixa-crime).'),
        h('div', { class: 'chips' }, info.tipos.map(t => h('span', { class: 'chip-filtro' }, t.nome)))), false),
      secao('Advogados (outorgados)', advs, false),
      h('p', { class: 'peq' }, 'Os textos iniciais foram redigidos pelo Claude a partir do modelo de juntada do escritório. A Dra. Júlian deve revisá-los antes do primeiro uso.'));
  }

  /** 8.10: liberar a EDIÇÃO dos modelos (Google Docs) para a equipe — sem isso o Google pede "solicitar acesso" a quem não é a dona. */
  function blocoLiberarModelos() {
    if (!sessao.usuario.pode.usuarios) return h('p', { class: 'nota' }, 'Ao abrir um modelo, o Google pediu "Solicitar acesso"? Peça à administração para apertar "Liberar a edição dos modelos para a equipe" aqui em Modelos (é preciso ter o seu e-mail Google cadastrado em Usuários).');
    const campoEm = h('input', { type: 'text', placeholder: 'outros e-mails Google, separados por vírgula (opcional)', 'aria-label': 'Outros e-mails' });
    const saida = h('div', { class: 'peq' });
    return h('div', { class: 'nota liberar-modelos' },
      h('p', {}, h('strong', {}, 'A equipe toda pode editar os modelos. '), 'O painel dá permissão de edição nos modelos (e na pasta de modelos do escritório) para o e-mail Google de cada pessoa cadastrada em Usuários. Pastas de clientes não são tocadas.'),
      h('div', { class: 'barra' }, campoEm, botao('Liberar a edição dos modelos para a equipe', async ev => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Liberando…';
        try {
          const r = await api('modelos.liberarEdicao', { emails: campoEm.value });
          saida.replaceChildren(h('p', {}, `✓ Edição liberada para: ${r.emails.join(', ')} (${r.arquivos} modelo(s)/pasta).`),
            r.semEmail.length ? h('p', {}, `Sem e-mail Google em Usuários: ${r.semEmail.join(', ')} — cadastre o e-mail e aperte de novo.`) : null,
            r.erros.length ? h('p', { class: 'erro' }, 'Não deu em: ' + r.erros.join(' · ')) : null);
        } catch (e) { avisar(e.message, true); }
        b.disabled = false; b.textContent = 'Liberar a edição dos modelos para a equipe';
      }, 'sec')), saida);
  }

  /* ---------- gráficos (SVG feito aqui mesmo: a segurança do painel não deixa carregar bibliotecas de fora) ---------- */

  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...filhos) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
    for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    return el;
  }
  const MES_CURTO = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  const curto = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : String(Math.round(v));
  /** Colunas por mês. series: [{ nome, valores, cor }]. */
  function grafColunas(meses, series, opc) {
    opc = opc || {};
    const L = 480, A = 220, mE = 44, mB = 26, mT = 14, larg = L - mE - 8, alt = A - mB - mT;
    const max = Math.max(1, ...series.flatMap(x => x.valores));
    const passo = larg / meses.length, barra = Math.max(4, Math.min(22, (passo - 8) / series.length));
    const y = v => mT + alt - (v / max) * alt;
    const marcas = max >= 4 || opc.dinheiro ? [0, 0.5, 1] : [0, 1];
    const linhas = marcas.map(f => s('g', {}, s('line', { x1: mE, x2: L - 8, y1: y(max * f), y2: y(max * f), class: 'gf-grade' }),
      s('text', { x: mE - 6, y: y(max * f) + 4, 'text-anchor': 'end', class: 'gf-eixo' }, opc.dinheiro ? curto(max * f) : Math.round(max * f))));
    const barras = meses.map((m, i) => {
      const x0 = mE + i * passo + (passo - barra * series.length) / 2;
      return s('g', {}, series.map((sr, j) => {
        const v = sr.valores[i] || 0;
        return s('rect', { x: x0 + j * barra, y: y(v), width: barra - 1, height: Math.max(0, mT + alt - y(v)), rx: 2, class: 'gf-barra ' + (sr.cor || '') },
          s('title', {}, `${sr.nome} · ${MES_CURTO(m)}/${m.slice(2, 4)}: ${opc.dinheiro ? reais(v) : v}`));
      }), s('text', { x: mE + i * passo + passo / 2, y: A - 8, 'text-anchor': 'middle', class: 'gf-eixo' }, MES_CURTO(m)));
    });
    return h('figure', { class: 'grafico' },
      s('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': opc.titulo || 'gráfico' }, linhas, barras),
      series.length > 1 ? h('figcaption', { class: 'gf-legenda' }, series.map(sr => h('span', {}, h('i', { class: 'gf-ponto ' + (sr.cor || '') }), sr.nome))) : null);
  }
  /** Barras deitadas (ex.: processos por área). */
  /** Gráfico de rosca (redondo) com legenda clicável. itens: [{ nome, valor, cor?, ir? }] */
  const CORES_FASE = { contratado: '#7a4fc0', ajuizado: '#2f6fd0', conciliacao: '#2a9fd6', andamento: '#1d8a8a', pericia: '#8a6a37', instrucao: '#1d5fa8',
    sentenca: '#c98a12', acordo: '#e0a23a', homologacao: '#b08d57', recurso: '#d0602d', execucao: '#1f8a4c', extinto: '#9aa0aa' };
  const CORES_GRAF = ['#2b2d33', '#b08d57', '#2f6fd0', '#1d8a8a', '#7a4fc0', '#d0602d', '#1f8a4c', '#c98a12', '#5b6ee1', '#9aa0aa'];
  function grafRosca(itens, opc) {
    opc = opc || {};
    const lista = itens.filter(x => x.valor > 0);
    const total = lista.reduce((t, x) => t + x.valor, 0);
    const R = 62, C = 2 * Math.PI * R;
    let acum = 0;
    const segs = lista.map((x, i) => {
      const cor = x.cor || CORES_GRAF[i % CORES_GRAF.length];
      const parte = total ? x.valor / total * C : 0;
      const seg = s('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: cor, 'stroke-width': 22, 'stroke-dasharray': `${Math.max(0, parte - (lista.length > 1 ? 2 : 0))} ${C}`,
        'stroke-dashoffset': String(-acum), transform: 'rotate(-90 80 80)', class: 'rosca-seg' + (x.ir ? ' clicavel' : '') },
        s('title', {}, `${x.nome}: ${opc.dinheiro ? reais(x.valor) : x.valor} (${total ? Math.round(x.valor * 100 / total) : 0}%)`));
      if (x.ir) seg.addEventListener('click', x.ir);
      acum += parte; x._cor = cor; return seg;
    });
    const centro = opc.centro !== undefined ? opc.centro : (opc.dinheiro ? reais(total) : String(total));
    return h('figure', { class: 'rosca' },
      s('svg', { viewBox: '0 0 160 160', role: 'img', 'aria-label': opc.titulo || 'gráfico' },
        s('circle', { cx: 80, cy: 80, r: R, fill: 'none', class: 'rosca-fundo', 'stroke-width': 22 }), segs,
        s('text', { x: 80, y: 78, 'text-anchor': 'middle', class: 'rosca-num' + (String(centro).length > 7 ? ' longo' : '') }, centro),
        s('text', { x: 80, y: 98, 'text-anchor': 'middle', class: 'rosca-rot' }, opc.rotulo || 'total')),
      lista.length ? h('ul', { class: 'rosca-leg' }, lista.map(x => h('li', { class: x.ir ? 'clicavel' : '', onclick: x.ir || null, tabindex: x.ir ? 0 : null, onkeydown: x.ir ? (e => { if (e.key === 'Enter') x.ir(); }) : null },
        (() => { const i = h('i', {}); i.style.background = x._cor; return i; })(), h('span', { class: 'rosca-nome' }, x.nome),
        h('b', {}, opc.dinheiro ? reais(x.valor) : String(x.valor)), h('small', {}, total ? Math.round(x.valor * 100 / total) + '%' : '')))) : h('p', { class: 'peq' }, opc.vazio || 'Sem dados ainda.'));
  }

  function grafBarras(itens, opc) {
    opc = opc || {};
    const max = Math.max(1, ...itens.map(x => x.valor));
    return h('ul', { class: 'gf-deitado' }, itens.map(x => h('li', {},
      h('span', { class: 'gf-rot' }, x.nome),
      h('span', { class: 'gf-trilho' }, (() => { const e = h('span', { class: 'gf-enche ' + (x.cor || '') }); e.style.width = Math.max(2, x.valor * 100 / max) + '%'; return e; })()),
      h('b', {}, opc.dinheiro ? reais(x.valor) : String(x.valor)), x.extra ? h('span', { class: 'peq' }, x.extra) : null)));
  }

  /* ---------- tarefas da equipe (quadro) ---------- */

  const NOME_ATO = { conciliacao: 'Audiência de conciliação', instrucao: 'Audiência de instrução', pericia: 'Perícia' };
  /** Mensagem pronta para lembrar o cliente da audiência ou perícia (tarefa criada pelo robô 2 dias úteis antes). */
  /** 8.21: mensagem do aviso de audiência/perícia conforme o momento (semana | vespera | dia), o tipo e se é online ou presencial.
      Conciliação explica que é uma tentativa de acordo; instrução pede as testemunhas (nome completo, CPF e telefone). */
  function textoAvisoAto(x) {
    const nome = nomeProprioJS(String(x.cliente || '').split(' ')[0]) || 'tudo bem';
    const ato = x.ato || {}, tipo = ato.tipo || 'conciliacao';
    const quando = x.quando || ato.quando || (ato.hoje || x.hoje ? 'dia' : 'semana');
    const dt = new Date(ato.data + 'T12:00:00Z');
    const diaSem = dt.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long' }), dm = dt.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
    const hora = ato.hora ? ', às ' + ato.hora : '';
    const proc = x.numero ? ' do processo nº ' + x.numero : '';
    const nomeAto = (NOME_ATO[tipo] || 'audiência').toLowerCase();
    const sua = tipo === 'pericia' ? 'sua perícia' : 'sua ' + nomeAto;
    const modo = x.modo || '';
    const onde = modo === 'online' ? (x.link ? ` Será por vídeo, neste link: ${x.link}` : ' Será por vídeo: mandaremos o link antes.')
      : ato.local ? ` Local: ${ato.local}.` : modo === 'presencial' ? ' Será presencial: confirmaremos o endereço.' : '';
    const perguntaModo = !modo && tipo !== 'pericia' ? '\n\nAinda estamos confirmando se será por vídeo ou presencial; avisaremos você. Se for por vídeo, você vai precisar de celular ou computador com internet e câmera.' : '';
    const explica = {
      conciliacao: 'A audiência de conciliação é uma TENTATIVA DE ACORDO entre você e a outra parte, com a ajuda de um conciliador. Ainda não é o julgamento. Se surgir uma proposta, vamos conversar antes de você decidir.',
      instrucao: 'A audiência de instrução é a fase das PROVAS: o juiz ouve você, a outra parte e as testemunhas. É muito importante comparecer.',
      pericia: 'A perícia é o exame feito por um perito nomeado pelo juiz. Leve documento com foto e todos os exames, laudos, receitas e atestados que tiver.'
    }[tipo] || '';
    const testem = tipo === 'instrucao' ? '\n\nVocê tem TESTEMUNHAS? Se tiver, mande para nós, de cada uma: nome completo, CPF e telefone. Combine com elas a data: precisam ir com documento com foto.' : '';
    const levar = tipo === 'pericia' ? '' : ' Leve documento com foto e chegue (ou entre no link) 30 minutos antes.';
    let msg;
    if (quando === 'dia') msg = `Bom dia, ${nome}! Aqui é do escritório Araújo Advocacia. Lembrete: HOJE é a ${sua}${proc}${hora}.${onde}${levar}${tipo === 'instrucao' ? ' Confirme com as suas testemunhas.' : ''}\n\nPor favor, responda confirmando que vai. Qualquer imprevisto, avise a gente na hora.`;
    else if (quando === 'vespera') {
      const amanha = (dt - new Date(hojeISO() + 'T12:00:00Z')) / 86400000 === 1 ? 'amanhã (' + diaSem + ', ' + dm + ')' : 'na ' + diaSem + ' (' + dm + ')';
      msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Passando para lembrar: ${amanha}${hora} é a ${sua}${proc}.${onde}\n\n${explica}${levar}${testem}\n\nPor favor, confirme respondendo esta mensagem. No dia, mandamos outro lembrete.`;
    } else msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Passando para avisar com antecedência: a ${sua}${proc} está marcada para ${diaSem}, ${dm}${hora}.${onde}\n\n${explica}${levar}${perguntaModo}${testem}\n\nPor favor, confirme que recebeu respondendo esta mensagem. Vamos lembrar você de novo na véspera e no dia.`;
    return msg;
  }
  function whatsAto(x) {
    let tel = telefoneWhats(x.telefone || '');
    if (!tel || !x.ato) return null;
    if (tel.length <= 11) tel = '55' + tel;
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(textoAvisoAto(x));
  }
  /* Tarefas dos robôs do escritório: mensagem pronta conforme o tipo ([wa:tipo] na tarefa). */
  let LINK_AVAL = 'https://www.google.com/maps/search/?api=1&query=Ara%C3%BAjo%20Advocacia%2C%20Tubar%C3%A3o%20-%20SC';
  const MOTIVO_WA = { retomar: 'retomar contato', assinar: 'cobrar assinatura', avaliacao: 'pedido de avaliação', valor: 'aviso de alvará/RPV' };
  function whatsTarefa(x) {
    let tel = telefoneWhats(x.telefone || '');
    if (!tel || !x.wa) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(primeiroNome(x.cliente)) || 'tudo bem';
    const ola = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia.`;
    const msg = {
      retomar: `${ola} Passando para saber se ficou alguma dúvida depois do nosso atendimento e se podemos ajudar no próximo passo do seu caso. Estamos à disposição!`,
      assinar: `${ola} Os documentos do seu caso já estão prontos e aguardam a sua assinatura. Qual o melhor dia e horário para você passar no escritório para assinar? Se preferir, combinamos outro jeito.`,
      avaliacao: `${ola} Foi uma satisfação acompanhar o seu processo. Se puder, deixe a sua avaliação sobre o nosso atendimento no Google — leva menos de um minuto e ajuda outras pessoas a nos encontrarem:\n${LINK_AVAL}\n\nMuito obrigada pela confiança!`,
      valor: `${ola} Houve uma movimentação sobre a liberação de valores no seu processo${x.numero ? ' nº ' + x.numero : ''}. Já estamos conferindo e, em breve, entramos em contato com os detalhes.`
    }[x.wa];
    return msg ? 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg) : null;
  }
  function botaoWhatsTarefa(x) {
    if (!x.wa || !MOTIVO_WA[x.wa]) return null;
    const l = whatsTarefa(x);
    return l ? botaoAvisar(l, x.wa === 'avaliacao' ? '⭐ Pedir avaliação' : x.wa === 'assinar' ? 'Cobrar assinatura' : 'WhatsApp ao cliente', x.avisado_em ? { em: x.avisado_em, por: x.avisado_por } : null,
      () => { registrarWhats({ numero: x.numero, cliente: x.cliente }, MOTIVO_WA[x.wa], x.id ? 'tarefa:' + x.id : ''); if (x.id) x.avisado_em = new Date().toISOString(); })
      : h('span', { class: 'peq' }, 'Cliente sem telefone');
  }
  function botaoWhatsAto(x) {
    const l = whatsAto(x);
    return l ? botaoAvisar(l, 'WhatsApp ao cliente', x.avisado_em ? { em: x.avisado_em, por: x.avisado_por } : null,
      () => { registrarWhats({ numero: x.numero, cliente: x.cliente }, 'lembrete de audiência', x.id && x.tipo === 'tarefa' ? 'tarefa:' + x.id : ''); if (x.id) x.avisado_em = new Date().toISOString();
        if (x.ato && x.ato.lembrete) api('agenda.avisado', { lembrete: x.ato.lembrete, quando: x.ato.quando, numero: x.numero, data: x.ato.data, hora: x.ato.hora, tipo: x.ato.tipo }).catch(() => {}); })
      : h('span', { class: 'peq' }, 'Cliente sem telefone');
  }

  const PRIORIDADES = [['urgente', 'Urgente'], ['alta', 'Alta'], ['normal', 'Normal'], ['baixa', 'Baixa']];
  const NOME_PRI = Object.fromEntries(PRIORIDADES);
  const ORD_PRI = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

  async function telaTarefas(params) {
    carregando();
    const r = await api('tarefas.listar', {});
    if (r.link_avaliacao) LINK_AVAL = r.link_avaliacao;
    const eu = sessao.usuario.usuario, pode = sessao.usuario.pode;
    const quem = r.todos === false ? 'todos' : (params.get('quem') || (localStorageGet('tarefas_quem') || 'eu'));
    const tipo = params.get('tipo') || '';
    const so = params.get('so') || '';
    const pri = params.get('pri') || '';
    const busca = params.get('q') || '';
    const visao = ['lista', 'quadro', 'dia'].includes(params.get('ver')) ? params.get('ver') : (localStorageGet('tarefas_visao86') || 'dia');
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/tarefas' + (q.toString() ? '?' + q : ''); };
    const nomeDe = u => (r.usuarios.find(x => x.usuario === u) || {}).nome || u;
    const qn = semAcentoG(busca);
    const hoje = r.hoje;
    const passa = x => (quem === 'todos' || (quem === 'eu' ? x.responsavel === eu : quem === 'ninguem' ? !x.responsavel : x.responsavel === quem)) &&
      (!tipo || x.tipo === tipo) && (so !== 'atrasadas' || x.atrasada) && (so !== 'hoje' || x.vence_em === hoje) &&
      (so !== 'semana' || (x.vence_em && x.vence_em <= isoSoma(hoje, 7))) &&
      (!pri || (x.prioridade || 'normal') === pri) && (!qn || semAcentoG([x.titulo, x.cliente, x.numero, x.descricao].join(' ')).includes(qn));
    const itens = r.itens.filter(passa);
    const abertos = itens.filter(x => !/protocolado|concluido/.test(x.etapa));
    const atrasadas = abertos.filter(x => x.atrasada).length;
    const mudarQuem = v => { localStorageSet('tarefas_quem', v); ir({ quem: v }); };
    const mover = async (x, etapa, alvo) => {
      if (alvo) alvo.classList.add('movendo');
      try { await api('tarefas.mover', { tipo: x.tipo, id: x.id, etapa }); avisar(x.tipo === 'prazo' && /protocolado/.test(etapa) ? 'Prazo feito e marcado como cumprido.' : 'Movido para "' + r.etapas.find(e => e.id === etapa).nome + '".'); rota(); }
      catch (e) { avisar(e.message, true); if (alvo) alvo.classList.remove('movendo'); }
    };
    const idx = e => r.etapas.findIndex(x => x.id === e);
    const progresso = x => { const c = x.checklist || []; if (!c.length) return null; const f = c.filter(i => i.ok).length;
      const el = h('span', { class: 'ct-check' + (f === c.length ? ' completo' : '') }, h('span', { class: 'ct-check-barra' }, h('span', { 'data-w': String(Math.round(f * 100 / c.length)) })), `${f}/${c.length}`);
      el.querySelector('[data-w]').style.width = el.querySelector('[data-w]').dataset.w + '%'; return el; };
    const nComent = x => (String(x.historico || '').match(/💬/g) || []).length;
    const abrir = x => { if (x.tipo === 'prazo') location.hash = '#/prazo/' + x.id; else editarTarefa(x, r); };
    const acoesItem = x => {
      const fim = /protocolado|concluido/.test(x.etapa);
      if (!fim) return botaoConferido(x.tipo === 'prazo' ? 'prazo' : 'tarefa', x.id, 'Quem fez?');
      if (x.etapa === 'concluido') return h('span', { class: 'tag mini-tag ok' }, '✓ OK' + (x.ok_por ? ' de ' + x.ok_por : ''));
      return pode.usuarios ? h('span', { class: 'ct-ok' }, botoesOk(x.tipo === 'prazo' ? 'prazo' : (x.inicial ? 'tarefa' : 'tarefa'), x.id)) : h('span', { class: 'tag mini-tag atencao' }, 'aguarda OK');
    };
    const cartao = x => {
      const i = idx(x.etapa);
      const sel = h('select', { class: 'resp-sel', 'aria-label': 'Responsável', onclick: ev => ev.stopPropagation(), onchange: async ev => {
        try { await api('tarefas.atribuir', { tipo: x.tipo, id: x.id, responsavel: ev.target.value }); avisar('Responsável: ' + (ev.target.value ? nomeDe(ev.target.value) : 'ninguém')); rota(); } catch (e) { avisar(e.message, true); }
      } }, h('option', { value: '' }, '— sem responsável —'), r.usuarios.map(u => h('option', { value: u.usuario, selected: u.usuario === x.responsavel }, u.nome)));
      const el = h('article', { class: 'cartao-t pri-borda-' + (x.prioridade || 'normal') + (x.atrasada ? ' atrasada' : '') + (x.tipo === 'prazo' ? ' de-prazo' : ''), draggable: 'true', tabindex: 0,
        ondragstart: ev => { ev.dataTransfer.setData('text/plain', x.tipo + '|' + x.id); el.classList.add('arrastando'); },
        ondragend: () => el.classList.remove('arrastando'),
        onclick: () => abrir(x), onkeydown: ev => { if (ev.key === 'Enter') el.click(); } },
        h('div', { class: 'ct-topo' }, h('span', { class: 'tag ' + (x.tipo === 'prazo' ? 'info' : '') }, x.tipo === 'prazo' ? 'prazo' : x.inicial ? 'inicial' : 'tarefa'),
          x.prioridade && x.prioridade !== 'normal' ? h('span', { class: 'tag mini-tag pri-' + x.prioridade }, NOME_PRI[x.prioridade]) : null,
          x.provisorio ? h('span', { class: 'tag atencao' }, 'provisório') : null,
          x.repetir ? h('span', { class: 'tag mini-tag', title: 'Repete ' + x.repetir }, '↻ ' + x.repetir) : null,
          x.vence_em ? h('span', { class: 'ct-data' }, dataBR(x.vence_em), ' ', /protocolado|concluido/.test(x.etapa) ? (x.no_prazo ? h('span', { class: 'tag ok' }, 'no prazo') : h('span', { class: 'tag urgente' }, 'atrasou')) : etiquetaContagem(x.vence_em)) : null),
        h('div', { class: 'ct-tit' }, x.titulo),
        x.cliente || x.numero ? h('div', { class: 'peq' }, [x.cliente, x.numero].filter(Boolean).join(' · ')) : null,
        x.resumo_ia ? h('div', { class: 'peq ia-txt', title: x.resumo_ia }, x.resumo_ia) : null,
        x.ato ? h('div', { class: 'ct-ato', onclick: ev => ev.stopPropagation() }, h('span', {}, (x.ato.tipo === 'pericia' ? '🩺 ' : '⚖ ') + dataBR(x.ato.data) + (x.ato.hora ? ' ' + x.ato.hora : '')), botaoWhatsAto(x)) : null,
        x.wa && MOTIVO_WA[x.wa] ? h('div', { class: 'ct-ato', onclick: ev => ev.stopPropagation() }, botaoWhatsTarefa(x)) : null,
        x.tipo === 'tarefa' && (x.checklist || []).length || nComent(x) ? h('div', { class: 'ct-meta' }, progresso(x), nComent(x) ? h('span', { class: 'peq' }, '💬 ' + nComent(x)) : null) : null,
        h('div', { class: 'ct-pe' }, sel,
          h('span', { class: 'ct-mover' },
            i > 0 && !/concluido/.test(x.etapa) ? h('button', { type: 'button', class: 'btn mini sec', title: 'Voltar para ' + r.etapas[i - 1].nome, onclick: ev => { ev.stopPropagation(); mover(x, r.etapas[i - 1].id, el); } }, '←') : null,
            i < idx('revisar') ? h('button', { type: 'button', class: 'btn mini sec', title: 'Passar para ' + r.etapas[i + 1].nome, onclick: ev => { ev.stopPropagation(); mover(x, r.etapas[i + 1].id, el); } }, '→') : null)),
        h('div', { class: 'ct-final', onclick: ev => ev.stopPropagation() }, acoesItem(x)));
      return el;
    };
    const ordenar = l => l.slice().sort((a, b) => (b.atrasada - a.atrasada) || (ORD_PRI[a.prioridade || 'normal'] - ORD_PRI[b.prioridade || 'normal']) || ((a.vence_em || '9999') < (b.vence_em || '9999') ? -1 : 1));
    const colunas = r.etapas.map(e => {
      const daEtapa = itens.filter(x => x.etapa === e.id);
      const fim = /protocolado|concluido/.test(e.id);
      const lista = fim ? daEtapa.slice().sort((a, b) => a.concluida_em < b.concluida_em ? 1 : -1) : ordenar(daEtapa);
      const mostra = lista.slice(0, fim ? 20 : 80);
      const col = h('section', { class: 'coluna-t', 'data-etapa': e.id,
        ondragover: ev => { ev.preventDefault(); col.classList.add('sobre'); }, ondragleave: () => col.classList.remove('sobre'),
        ondrop: ev => { ev.preventDefault(); col.classList.remove('sobre'); const [tp, id] = (ev.dataTransfer.getData('text/plain') || '').split('|'); const x = r.itens.find(y => y.id === id && y.tipo === tp); if (x && x.etapa !== e.id) mover(x, e.id); } },
        h('h2', {}, e.nome, h('span', { class: 'seg-n' }, String(daEtapa.length))),
        mostra.length ? mostra.map(cartao) : h('p', { class: 'peq vazio-t' }, fim ? 'Nada nos últimos 30 dias.' : 'Nada aqui.'),
        lista.length > mostra.length ? h('p', { class: 'peq' }, `+ ${lista.length - mostra.length} mais antigas`) : null);
      return col;
    });
    const tabelaLista = () => {
      const l = ordenar(abertos).concat(itens.filter(x => /protocolado|concluido/.test(x.etapa)).sort((a, b) => a.concluida_em < b.concluida_em ? 1 : -1).slice(0, 30));
      return l.length ? h('div', { class: 'rolar' }, h('table', { class: 'tabela tab-tarefas' },
        h('thead', {}, h('tr', {}, ['', 'Tarefa', 'Cliente / processo', 'Responsável', 'Entregar até', 'Etapa', ''].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, l.map(x => h('tr', { class: (x.atrasada ? 'atrasada ' : '') + 'pri-linha-' + (x.prioridade || 'normal'), onclick: () => abrir(x) },
          h('td', { 'data-r': 'Prioridade' }, h('span', { class: 'pri-ponto pri-' + (x.prioridade || 'normal'), title: NOME_PRI[x.prioridade || 'normal'] })),
          h('td', { 'data-r': 'Tarefa' }, h('strong', {}, x.titulo), h('div', { class: 'peq' }, x.tipo === 'prazo' ? 'prazo processual' : x.inicial ? 'petição inicial' : 'tarefa', x.repetir ? ' · ↻ ' + x.repetir : ''), progresso(x)),
          h('td', { 'data-r': 'Cliente' }, [x.cliente, x.numero].filter(Boolean).join(' · ') || '—'),
          h('td', { 'data-r': 'Responsável' }, x.responsavel ? nomeDe(x.responsavel) : h('span', { class: 'peq' }, 'ninguém')),
          h('td', { 'data-r': 'Entregar até' }, x.vence_em ? dataBR(x.vence_em) : '—', ' ', x.vence_em && !/protocolado|concluido/.test(x.etapa) ? etiquetaContagem(x.vence_em) : null),
          h('td', { 'data-r': 'Etapa' }, h('span', { class: 'tag mini-tag' }, (r.etapas.find(e => e.id === x.etapa) || {}).nome || x.etapa)),
          h('td', { onclick: ev => ev.stopPropagation() }, acoesItem(x))))))) : h('p', { class: 'caixa peq' }, 'Nenhuma tarefa neste filtro.');
    };
    // ----- 8.6.0 (pedido da usuária: "quase não usamos"): LISTA DO DIA, simples como um caderno -----
    const listaDia = () => {
      const amanha = isoSoma(hoje, 1), semana = isoSoma(hoje, 7);
      const grupos = [
        ['⚠ Atrasadas', x => x.vence_em && x.vence_em < hoje, 'td-atras'],
        ['Hoje', x => x.vence_em === hoje, 'td-hoje'],
        ['Amanhã', x => x.vence_em === amanha, ''],
        ['Próximos 7 dias', x => x.vence_em > amanha && x.vence_em <= semana, ''],
        ['Depois', x => x.vence_em > semana, ''],
        ['Sem data', x => !x.vence_em, '']];
      const feitoRapido = async (x, el) => {
        if (x.tipo === 'prazo') return; // prazo usa o "✓ Conferido" (pergunta quem fez)
        el.classList.add('movendo');
        try { await api('tarefas.mover', { tipo: x.tipo, id: x.id, etapa: 'protocolado' }); el.classList.add('feita'); avisar('Feito! ✓'); await apiFresco('tarefas.listar', {}).catch(() => null); rota(); }
        catch (e) { el.classList.remove('movendo'); avisar(e.message, true); }
      };
      const linha = x => {
        const el = h('li', { class: 'td-item pri-borda-' + (x.prioridade || 'normal') + (x.atrasada ? ' atrasada' : ''), tabindex: 0, onclick: () => abrir(x), onkeydown: ev => { if (ev.key === 'Enter') abrir(x); } });
        const check = x.tipo === 'prazo' ? h('span', { class: 'td-check-wrap', onclick: ev => ev.stopPropagation() }, botaoConferido('prazo', x.id, 'Quem fez este prazo?', null, '✓'))
          : h('button', { type: 'button', class: 'td-check', title: 'Marcar como feito', 'aria-label': 'Marcar como feito: ' + x.titulo, onclick: ev => { ev.stopPropagation(); feitoRapido(x, el); } }, '');
        el.append(check,
          h('div', { class: 'td-txt' },
            h('div', { class: 'td-tit' }, x.titulo, x.prioridade === 'urgente' ? h('span', { class: 'tag mini-tag pri-urgente' }, 'Urgente') : null, x.tipo === 'prazo' ? h('span', { class: 'tag mini-tag info' }, 'prazo') : null),
            h('div', { class: 'peq' }, [x.cliente, x.numero, quem !== 'eu' && x.responsavel ? '👤 ' + nomeDe(x.responsavel) : '', (x.checklist || []).length ? `☑ ${(x.checklist || []).filter(i => i.ok).length}/${x.checklist.length}` : ''].filter(Boolean).join(' · '))),
          h('div', { class: 'td-lado', onclick: ev => ev.stopPropagation() },
            x.ato ? botaoWhatsAto(x) : x.wa && MOTIVO_WA[x.wa] ? botaoWhatsTarefa(x) : null,
            x.vence_em ? h('span', { class: 'td-data' }, x.vence_em === hoje ? 'hoje' : dataBR(x.vence_em).slice(0, 5)) : null));
        return el;
      };
      // anotar rápido: o que, para quem, quando
      const fAdd = h('form', { class: 'td-add', novalidate: true },
        h('input', { name: 'titulo', placeholder: 'O que precisa ser feito? (ex.: ligar para a Maria sobre os documentos)', maxlength: 200, 'aria-label': 'Nova tarefa', required: true }),
        h('select', { name: 'responsavel', 'aria-label': 'Para quem' }, r.usuarios.map(u => h('option', { value: u.usuario, selected: u.usuario === (quem !== 'eu' && quem !== 'todos' && quem !== 'ninguem' ? quem : eu) }, u.usuario === eu ? 'Para mim' : 'Para ' + u.nome))),
        h('select', { name: 'quando', 'aria-label': 'Quando' }, [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['', 'Sem data']].map(([v, t]) => h('option', { value: v }, t))),
        h('button', { type: 'submit', class: 'btn' }, '+ Anotar'));
      fAdd.addEventListener('submit', async ev => {
        ev.preventDefault();
        const titulo = fAdd.titulo.value.trim(); if (!titulo) { fAdd.titulo.focus(); return; }
        const q = fAdd.quando.value, vence = q === 'hoje' ? hoje : q === 'amanha' ? amanha : q === 'semana' ? isoSoma(hoje, 4) : '';
        fAdd.querySelector('button').disabled = true;
        try { await api('tarefas.salvar', { tarefa: { titulo, responsavel: fAdd.responsavel.value, vence_em: vence, prioridade: 'normal', peso: 1 } }); avisar('Anotado ✓'); await apiFresco('tarefas.listar', {}).catch(() => null); rota(); }
        catch (e) { avisar(e.message, true); fAdd.querySelector('button').disabled = false; }
      });
      const blocos = grupos.map(([nome, f, cls]) => {
        const l = ordenar(abertos.filter(f));
        if (!l.length) return null;
        return h('section', { class: 'td-grupo ' + cls }, h('h2', {}, nome, h('span', { class: 'seg-n' }, String(l.length))), h('ul', { class: 'td-lista' }, l.slice(0, 60).map(linha)));
      }).filter(Boolean);
      const feitasHoje = itens.filter(x => /protocolado|concluido/.test(x.etapa) && diaLocal(x.concluida_em) === hoje);
      return h('div', { class: 'td-dia' }, h('section', { class: 'caixa' }, fAdd),
        blocos.length ? blocos : h('div', { class: 'caixa vazio-t' }, 'Nada pendente aqui. 🎉 Use o campo acima para anotar o que precisa ser feito.'),
        feitasHoje.length ? h('details', { class: 'td-feitas' }, h('summary', {}, `✓ ${feitasHoje.length} feita(s) hoje`), h('ul', { class: 'td-lista' }, feitasHoje.map(x => h('li', { class: 'td-item feita' }, h('span', { class: 'td-check marcado' }, '✓'), h('div', { class: 'td-txt' }, h('div', { class: 'td-tit' }, x.titulo), h('div', { class: 'peq' }, x.concluida_por ? 'feito por ' + nomeDe(x.concluida_por) : '')))))) : null);
    };
    const placar = h('section', { class: 'caixa' }, h('h2', {}, r.todos === false ? 'Meus pontos · últimos 30 dias' : 'Placar da equipe · últimos 30 dias'),
      h('p', { class: 'peq' }, `Cada tarefa entregue no prazo vale os pontos dela; um prazo processual feito até o dia fatal vale ${3}. Entregue atrasada não pontua.`),
      r.pontos.length ? h('div', { class: 'rolar' }, h('table', { class: 'mini-tab placar' }, h('thead', {}, h('tr', {}, ['Pessoa', 'Pontos', 'Entregues', 'No prazo', 'Atrasadas', 'Em aberto', 'Vencidas agora'].map(t => h('th', {}, t)))),
        h('tbody', {}, r.pontos.map(p => h('tr', { onclick: () => mudarQuem(p.usuario) }, h('th', { scope: 'row' }, p.nome), h('td', {}, h('b', {}, String(p.pontos))),
          h('td', {}, String(p.entregues)), h('td', {}, String(p.no_prazo)), h('td', {}, p.atrasadas ? h('span', { class: 'tag urgente' }, String(p.atrasadas)) : '0'),
          h('td', {}, String(p.abertas)), h('td', {}, p.vencidas ? h('span', { class: 'tag urgente' }, String(p.vencidas)) : '0')))))) : h('p', { class: 'peq' }, 'Ainda não há entregas no período.'));
    let cfg = null;
    if (pode.usuarios) {
      const f = h('form', { class: 'campos', novalidate: true },
        campo('pje', 'Prazos novos do PJe (trabalhista) vão para', r.responsaveis.pje, { opcoes: [['', '— ninguém —']].concat(r.usuarios.map(u => [u.usuario, u.nome])) }),
        campo('eproc', 'Prazos novos do eproc (cível e federal) vão para', r.responsaveis.eproc, { opcoes: [['', '— ninguém —']].concat(r.usuarios.map(u => [u.usuario, u.nome])) }),
        campo('inicial', 'Petições iniciais (cliente novo com ação) vão para', r.responsaveis.inicial || '', { opcoes: [['', '— ninguém —']].concat(r.usuarios.map(u => [u.usuario, u.nome])) }),
        campo('secretaria', 'Secretaria (cobrar assinaturas, retomar contato, pedir avaliação)', r.responsaveis.secretaria || '', { opcoes: [['', '— automático: ' + ((r.usuarios.find(u => u.usuario === r.responsaveis.secretaria_auto) || {}).nome || 'ninguém') + ' —']].concat(r.usuarios.map(u => [u.usuario, u.nome])) }),
        campo('avaliacao', 'Link "Pedir avaliações" do perfil do Google', r.responsaveis.avaliacao || '', { tipo: 'url', largo: true, dica: 'No perfil do Google, clique em "Pedir avaliações" e cole aqui o link (g.page/r/…). Sem ele, a mensagem leva o link do mapa.' }),
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn sec' }, 'Salvar e distribuir os prazos sem responsável')), h('p', { class: 'erro largo' }));
      aoEnviar(f, async fd => { const x = await api('tarefas.config', { salvar: true, pje: fd.get('pje'), eproc: fd.get('eproc'), inicial: fd.get('inicial'), secretaria: fd.get('secretaria'), avaliacao: fd.get('avaliacao'), padrao: '' }); avisar(`Salvo. ${x.distribuidos} prazo(s) ganharam responsável.`); rota(); });
      cfg = secao('Responsáveis automáticos', () => h('div', {}, h('p', { class: 'peq' }, 'Quando o robô lê uma intimação nova, o prazo já entra no quadro de quem cuida daquele sistema. Cliente que contrata vai para Processos › Petição inicial e a tarefa vai para quem faz as iniciais.'), f), !r.responsaveis.pje && !r.responsaveis.eproc);
    }
    const opQuem = [['eu', 'Minhas'], ['todos', 'Toda a equipe'], ['ninguem', 'Sem responsável']].concat(r.usuarios.filter(u => u.usuario !== eu).map(u => [u.usuario, u.nome]));
    const buscaF = h('form', { class: 'busca-tarefas', role: 'search' }, h('input', { type: 'search', name: 'q', value: busca, placeholder: 'Buscar tarefa, cliente ou nº', 'aria-label': 'Buscar tarefa' }));
    buscaF.addEventListener('submit', ev => { ev.preventDefault(); ir({ q: buscaF.q.value.trim() }); });
    const nHoje = abertos.filter(x => x.vence_em === hoje).length;
    mostrar(
      h('header', { class: 'carteira-topo tarefas-topo' },
        h('div', { class: 'carteira-tit' }, h('span', { class: 'carteira-kicker' }, r.todos === false ? 'Meu quadro' : 'Quadro da equipe'), h('h1', {}, r.todos === false ? 'Minhas tarefas' : 'Tarefas'),
          h('p', {}, `${abertos.length} em aberto`, atrasadas ? ` · ${atrasadas} atrasada(s)` : '', nHoje ? ` · ${nHoje} para hoje` : '', visao === 'dia' ? ' · anote, faça e marque ✓' : ' · arraste o cartão ou use "✓ Conferido" quando terminar')),
        h('div', { class: 'carteira-acoes' }, h('button', { type: 'button', class: 'btn dourado', onclick: () => editarTarefa({ id: '', titulo: '', responsavel: quem === 'eu' || quem === 'todos' || quem === 'ninguem' ? eu : quem, peso: 1, prioridade: 'normal', checklist: [] }, r) }, '+ Nova tarefa'))),
      h('section', { class: 'painel-busca tarefas-filtros' },
        h('div', { class: 'tf-linha' },
          h('div', { class: 'visoes', role: 'tablist' },
            [['dia', 'Lista do dia'], ['quadro', 'Quadro'], ['lista', 'Tabela']].map(([v, rot]) => h('button', { type: 'button', class: 'visao-bt' + (visao === v ? ' ativo' : ''), onclick: () => { localStorageSet('tarefas_visao86', v); ir({ ver: v }); } }, rot))),
          r.todos === false ? h('span', { class: 'peq' }, 'Aqui ficam só as suas: o que você pegou ("Eu faço") e o que passaram para você.') : h('div', { class: 'seg-sistema', role: 'group', 'aria-label': 'De quem' },
            opQuem.slice(0, 3).map(([v, rot]) => h('button', { type: 'button', class: 'seg' + (quem === v ? ' ativo' : ''), 'aria-pressed': String(quem === v), onclick: () => mudarQuem(v) }, rot)),
            opQuem.length > 3 ? h('select', { 'aria-label': 'Pessoa', class: 'seg-sel', onchange: ev => mudarQuem(ev.target.value || 'todos') },
              h('option', { value: '' }, 'Pessoa…'), opQuem.slice(3).map(([v, rot]) => h('option', { value: v, selected: quem === v }, rot))) : null),
          buscaF),
        h('div', { class: 'chips' },
          [['', 'Tudo'], ['prazo', 'Só prazos'], ['tarefa', 'Só tarefas']].map(([v, rot]) => h('button', { type: 'button', class: 'chip-filtro' + (tipo === v ? ' ativo' : ''), onclick: () => ir({ tipo: v }) }, rot)),
          [['atrasadas', 'Atrasadas'], ['hoje', 'Para hoje'], ['semana', 'Próximos 7 dias']].map(([v, rot]) => h('button', { type: 'button', class: 'chip-filtro' + (so === v ? ' ativo' : ''), onclick: () => ir({ so: so === v ? '' : v }) }, rot)),
          PRIORIDADES.slice(0, 2).map(([v, rot]) => h('button', { type: 'button', class: 'chip-filtro pri-chip-' + v + (pri === v ? ' ativo' : ''), onclick: () => ir({ pri: pri === v ? '' : v }) }, '⚑ ' + rot)))),
      visao === 'dia' ? listaDia() : visao === 'lista' ? tabelaLista() : comSetas(h('div', { class: 'quadro-t' }, colunas)),
      visao === 'dia' ? null : placar, cfg);
  }
  function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* navegação privada */ } }

  async function editarTarefa(x, r) {
    const novo = !x.id;
    const [clientes, procs] = await Promise.all([api('clientes.listar', {}).catch(() => []), api('processos.listar', {}).catch(() => [])]);
    const caixa = h('dialog', { class: 'dialogo dialogo-tarefa' });
    const rotCli = c => c.nome + (c.cpf_cnpj ? ' · ' + c.cpf_cnpj : '');
    const cliAtual = clientes.find(c => c.id === x.cliente_id);
    const inCli = h('input', { id: 'f-t-cliente', list: 'dl-t-clientes', autocomplete: 'off', placeholder: 'Digite o nome e escolha', value: cliAtual ? rotCli(cliAtual) : '' });
    const inProc = h('input', { id: 'f-t-numero', name: 'numero', list: 'dl-t-procs', autocomplete: 'off', inputmode: 'numeric', placeholder: '0000000-00.0000.0.00.0000', value: x.numero || '' });
    const listaChk = (x.checklist || []).slice();
    const chkLista = h('ul', { class: 'chk-lista' });
    const desenharChk = () => chkLista.replaceChildren(...listaChk.map((c, i) => h('li', { class: c.ok ? 'feito' : '' },
      h('label', {}, h('input', { type: 'checkbox', checked: c.ok, onchange: async ev => {
        c.ok = ev.target.checked; desenharChk();
        if (!novo) { try { await api('tarefas.check', { id: x.id, i, ok: c.ok }); } catch (e) { avisar(e.message, true); } }
      } }), h('span', {}, c.t)),
      h('button', { type: 'button', class: 'link', 'aria-label': 'Tirar item', onclick: () => { listaChk.splice(i, 1); desenharChk(); } }, '×'))));
    desenharChk();
    const inChk = h('input', { placeholder: '+ acrescentar item do checklist (Enter)', 'aria-label': 'Novo item do checklist', maxlength: 140,
      onkeydown: ev => { if (ev.key === 'Enter') { ev.preventDefault(); const t = ev.target.value.trim(); if (t) { listaChk.push({ t, ok: false }); ev.target.value = ''; desenharChk(); } } } });
    const historico = h('pre', {}, x.historico || '');
    const inComent = h('input', { placeholder: 'Escreva um comentário para a equipe…', 'aria-label': 'Comentário', maxlength: 600 });
    const form = h('form', { class: 'campos', novalidate: true },
      h('h2', { class: 'largo' }, novo ? 'Nova tarefa' : 'Tarefa'),
      campo('titulo', 'O que precisa ser feito', x.titulo, { obrigatorio: true, largo: true, dica: 'Ex.: Pedir documentos para a cliente, protocolar juntada…' }),
      campo('responsavel', 'Responsável', x.responsavel, { opcoes: [['', '— ninguém —']].concat(r.usuarios.map(u => [u.usuario, u.nome])) }),
      campo('vence_em', 'Entregar até', x.vence_em, { tipo: 'date' }),
      campo('prioridade', 'Prioridade', x.prioridade || 'normal', { opcoes: PRIORIDADES }),
      campo('repetir', 'Repetir', x.repetir || '', { opcoes: [['', 'Não repete'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']] }),
      h('div', {}, h('label', { for: 'f-t-cliente' }, 'Cliente (opcional)'), inCli, h('datalist', { id: 'dl-t-clientes' }, clientes.map(c => h('option', { value: rotCli(c) })))),
      h('div', {}, h('label', { for: 'f-t-numero' }, 'Processo (opcional)'), inProc, h('datalist', { id: 'dl-t-procs' }, procs.filter(p => p.numero).map(p => h('option', { value: p.numero }, p.cliente_nome || '')))),
      campo('peso', 'Pontos', String(x.peso || 1), { opcoes: [['1', '1 (simples)'], ['2', '2'], ['3', '3 (como um prazo)'], ['5', '5 (peça grande)']] }),
      x.ato ? h('div', { class: 'largo ato-caixa' }, h('span', { class: 'ato-ico' }, x.ato.tipo === 'pericia' ? '🩺' : '⚖'),
        h('div', {}, h('strong', {}, (NOME_ATO[x.ato.tipo] || 'Audiência') + ' em ' + dataBR(x.ato.data) + (x.ato.hora ? ' às ' + x.ato.hora : '')),
          h('div', { class: 'peq' }, [x.cliente, x.numero, x.ato.local].filter(Boolean).join(' · '))),
        botaoWhatsAto(x)) : null,
      x.wa && MOTIVO_WA[x.wa] ? h('div', { class: 'largo' }, botaoWhatsTarefa(x)) : null,
      campo('descricao', 'Detalhes', String(x.descricao || '').replace(/\n?\[(rep|inicial|intim|ato|lembrete|agenda|valor|parado|retomar|assinar|avaliacao|wa|google):[^\]]*\]/g, '').trim(), { area: true, largo: true }),
      h('div', { class: 'largo chk-caixa' }, h('label', {}, 'Checklist'), chkLista, inChk),
      novo ? null : h('div', { class: 'largo coment-caixa' }, h('label', {}, 'Comentários e histórico'),
        h('div', { class: 'barra' }, inComent, botao('Comentar', async () => {
          if (!inComent.value.trim()) return;
          try { const rr = await api('tarefas.comentar', { id: x.id, texto: inComent.value }); historico.textContent = rr.historico; inComent.value = ''; }
          catch (e) { avisar(e.message, true); }
        }, 'sec mini')), historico),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, novo ? 'Criar tarefa' : 'Salvar'),
        !novo && !/protocolado|concluido/.test(x.etapa) ? botaoConferido('tarefa', x.id, 'Quem fez esta tarefa?') : null,
        !novo ? botao('Cancelar a tarefa', async () => { if (!confirm('Cancelar esta tarefa?')) return; await api('tarefas.salvar', { tarefa: { id: x.id, titulo: x.titulo, cancelar: true } }); caixa.close(); avisar('Tarefa cancelada.'); rota(); }, 'sec') : null,
        botao('Fechar', () => caixa.close(), 'sec')),
      h('p', { class: 'erro largo' }));
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      const c = clientes.find(c => rotCli(c) === inCli.value);
      d.id = x.id; d.cliente_id = c ? c.id : ''; d.checklist = listaChk;
      if (inChk.value.trim()) d.checklist = listaChk.concat([{ t: inChk.value.trim(), ok: false }]);
      await api('tarefas.salvar', { tarefa: d }); caixa.close(); avisar(novo ? 'Tarefa criada.' : 'Tarefa salva.'); rota();
    });
    caixa.append(form);
    caixa.addEventListener('close', () => caixa.remove());
    document.body.append(caixa);
    caixa.showModal();
  }


  /* ---------- caixa e contas a pagar ---------- */

  async function telaCaixa(params) {
    carregando();
    const mes = params.get('mes') || '';
    const r = await api('fin.caixa', { mes });
    const clientes = await api('clientes.listar', {}).catch(() => []);
    const t = r.totais;
    const ir = m => { location.hash = '#/financeiro/caixa' + (m ? '?mes=' + m : ''); };
    const mudaMes = n => { const [a, m] = r.mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 15)); ir(d.toISOString().slice(0, 7)); };
    const acao = async (d, msg) => { try { await api('fin.despesa.acao', d); avisar(msg); rota(); } catch (e) { avisar(e.message, true); } };
    const SIT = { paga: 'ok', atrasada: 'urgente', 'a pagar': 'atencao' };
    const tabDesp = (lista, vazio) => compacta(tabela(['Vencimento', 'Despesa', 'Categoria', 'Valor', 'Situação', ''], lista, x => [
      h('td', { class: 'num', 'data-r': 'Vencimento' }, dataBR(x.vencimento)),
      h('td', { 'data-r': 'Despesa' }, h('strong', {}, x.descricao), x.recorrente ? h('span', { class: 'tag info' }, 'mensal') : null,
        x.cliente ? h('div', { class: 'peq' }, (x.reembolsavel === 'sim' ? 'cobrar de ' : '') + x.cliente + (x.reembolsado_em ? ' · reembolsado em ' + dataBR(x.reembolsado_em) : '')) : null),
      h('td', { 'data-r': 'Categoria' }, x.categoria === 'A classificar'
        ? (() => { const sc = h('select', { class: 'mini', 'aria-label': 'Categoria', onclick: ev => ev.stopPropagation() }, h('option', { value: '' }, '⚠ classificar…'), r.categorias.filter(c => c !== 'A classificar').map(c => h('option', { value: c }, c)));
            sc.addEventListener('change', async () => { if (!sc.value) return; sc.disabled = true; try { await api('fin.despesa.categoria', { id: x.id, categoria: sc.value }); avisar('Categoria salva. Os próximos PIX para o mesmo nome já entram nela.'); rota(); } catch (e) { sc.disabled = false; avisar(e.message, true); } });
            return sc; })()
        : x.categoria),
      h('td', { class: 'num', 'data-r': 'Valor' }, reais(x.valor_pago || x.valor)),
      h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (SIT[x.situacao_conta] || '') }, x.situacao_conta), x.pago_em ? h('div', { class: 'peq' }, 'paga em ' + dataBR(x.pago_em)) : null),
      h('td', {}, h('div', { class: 'mini-acoes' },
        !x.pago_em ? h('button', { type: 'button', class: 'btn mini', onclick: ev => { ev.stopPropagation(); acao({ id: x.id, acao: 'pagar' }, 'Despesa paga hoje.'); } }, 'Paguei hoje')
          : h('button', { type: 'button', class: 'btn mini sec', onclick: ev => { ev.stopPropagation(); acao({ id: x.id, acao: 'estornar' }, 'Pagamento desfeito.'); } }, 'Desfazer'),
        x.recorrente && !x.pago_em ? h('button', { type: 'button', class: 'btn mini sec', title: 'Para de lançar esta despesa todo mês', onclick: ev => { ev.stopPropagation(); if (confirm('Encerrar esta despesa mensal (as próximas não pagas somem)?')) acao({ id: x.id, acao: 'cancelar', serie: true }, 'Despesa mensal encerrada.'); } }, 'Encerrar mensal')
          : !x.pago_em ? h('button', { type: 'button', class: 'btn mini sec', onclick: ev => { ev.stopPropagation(); if (confirm('Cancelar esta despesa?')) acao({ id: x.id, acao: 'cancelar' }, 'Despesa cancelada.'); } }, 'Cancelar') : null))
    ], x => editarDespesa(x, r, clientes), vazio));
    const ult = r.fluxo[r.fluxo.length - 1];
    const saldo12 = r.fluxo.reduce((a, f) => a + f.saldo, 0);
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Caixa e contas a pagar'), h('p', {}, 'Entradas (parcelas recebidas) e saídas (despesas pagas) do escritório.')),
        h('div', { class: 'barra' }, h('a', { class: 'btn sec', href: '#/financeiro' }, '← Financeiro'), botao('+ Nova despesa', () => editarDespesa({}, r, clientes)))),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('b', {}, reais(ult.entradas)), h('span', {}, 'entrou neste mês')),
        h('div', { class: 'numero' }, h('b', {}, reais(ult.saidas)), h('span', {}, 'saiu neste mês')),
        h('div', { class: 'numero' + (ult.saldo < 0 ? ' destaque' : '') }, h('b', {}, reais(ult.saldo)), h('span', {}, 'saldo do mês')),
        h('div', { class: 'numero' + (t.atrasado ? ' destaque' : '') }, h('b', {}, reais(t.atrasado)), h('span', {}, `contas atrasadas (${r.atrasadas.length})`)),
        h('div', { class: 'numero' }, h('b', {}, reais(t.proximos30)), h('span', {}, 'contas a pagar em 30 dias'))),
      h('section', { class: 'caixa' }, h('h2', {}, 'Últimos 12 meses'), h('p', { class: 'peq' }, `Saldo somado no período: ${reais(saldo12)}.`),
        grafColunas(r.fluxo.map(f => f.mes), [{ nome: 'Entradas', valores: r.fluxo.map(f => f.entradas), cor: 'c-verde' }, { nome: 'Saídas', valores: r.fluxo.map(f => f.saidas), cor: 'c-vermelho' }], { dinheiro: true, titulo: 'Entradas e saídas por mês' }),
        h('h3', { class: 'mt' }, 'Previsão dos próximos 3 meses'),
        h('table', { class: 'mini-tab' }, h('thead', {}, h('tr', {}, ['Mês', 'A receber (parcelas)', 'A pagar (contas)', 'Saldo previsto'].map(x => h('th', {}, x)))),
          h('tbody', {}, r.previsao.map(p => h('tr', {}, h('th', { scope: 'row' }, MES_CURTO(p.mes) + '/' + p.mes.slice(0, 4)), h('td', {}, reais(p.entradas)), h('td', {}, reais(p.saidas)),
            h('td', {}, h('b', { class: p.saldo < 0 ? 'txt-vermelho' : '' }, reais(p.saldo)))))))),
      r.atrasadas.length ? h('div', {}, h('h2', { class: 'mt' }, 'Contas atrasadas'), tabDesp(r.atrasadas, '')) : null,
      h('h2', { class: 'mt' }, 'A pagar nos próximos 30 dias'), tabDesp(r.proximas, 'Nenhuma conta a pagar nos próximos 30 dias.'),
      h('div', { class: 'cab mt' }, h('h2', {}, `Despesas de ${MES_CURTO(r.mes)}/${r.mes.slice(0, 4)}`),
        h('div', { class: 'barra' }, botao('← mês anterior', () => mudaMes(-1), 'sec mini'), botao('próximo mês →', () => mudaMes(1), 'sec mini'))),
      r.porCategoria.length ? grafBarras(r.porCategoria.map(c => ({ nome: c.categoria, valor: c.valor })), { dinheiro: true }) : null,
      tabDesp(r.doMes, 'Nenhuma despesa neste mês.'),
      h('section', { class: 'caixa mt' }, h('h2', {}, 'Custas adiantadas a cobrar dos clientes'),
        h('p', { class: 'peq' }, 'Despesas pagas pelo escritório marcadas "cobrar do cliente" (custas, perícias, diligências) que ainda não voltaram.'),
        r.reembolsar.length ? h('table', { class: 'mini-tab' }, h('tbody', {}, r.reembolsar.map(g => h('tr', {},
          h('th', { scope: 'row' }, g.cliente || 'cliente'), h('td', {}, reais(g.total)), h('td', { class: 'peq' }, g.itens.map(x => x.descricao + ' (' + dataBR(x.pago_em) + ')').join('; ')),
          h('td', {}, h('button', { type: 'button', class: 'btn mini sec', onclick: async () => { for (const x of g.itens) await api('fin.despesa.acao', { id: x.id, acao: 'reembolsado' }); avisar('Marcado como reembolsado.'); rota(); } }, 'Cliente devolveu')))))) : h('p', { class: 'peq' }, 'Nada a cobrar de clientes.')));
  }

  function editarDespesa(x, r, clientes) {
    const novo = !x.id;
    const caixa = h('dialog', { class: 'dialogo' });
    const form = h('form', { class: 'campos', novalidate: true },
      h('h2', { class: 'largo' }, novo ? 'Nova despesa' : 'Despesa'),
      campo('descricao', 'Descrição', x.descricao, { obrigatorio: true, largo: true, dica: 'Ex.: Aluguel da sala, custas iniciais, contador' }),
      campo('categoria', 'Categoria', x.categoria || 'Outros', { opcoes: r.categorias.map(c => [c, c]) }),
      campo('valor', 'Valor (R$)', x.valor ? String(x.valor).replace('.', ',') : '', { obrigatorio: true, modo: 'decimal' }),
      campo('vencimento', 'Vencimento', x.vencimento || hojeISO(), { tipo: 'date', obrigatorio: true }),
      novo ? campo('recorrente', 'Repete', '', { opcoes: [['', 'Só esta vez'], ['mensal', 'Todo mês (despesa fixa)']] }) : null,
      campo('pago_em', 'Paga em (deixe vazio se ainda não pagou)', x.pago_em || '', { tipo: 'date' }),
      campo('forma', 'Forma de pagamento', x.forma || '', { opcoes: [['', '—'], ['Pix', 'Pix'], ['Boleto', 'Boleto'], ['Cartão', 'Cartão'], ['Débito automático', 'Débito automático'], ['Dinheiro', 'Dinheiro'], ['Transferência', 'Transferência']] }),
      campo('reembolsavel', 'Cobrar do cliente depois?', x.reembolsavel || 'nao', { opcoes: [['nao', 'Não, é do escritório'], ['sim', 'Sim (custas/perícia adiantadas)']] }),
      campo('cliente_id', 'Cliente', x.cliente_id || '', { opcoes: [['', '—']].concat(clientes.map(c => [c.id, c.nome])), largo: true }),
      campo('observacoes', 'Observações', x.observacoes, { area: true, largo: true }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, novo ? 'Lançar despesa' : 'Salvar'), botao('Fechar', () => caixa.close(), 'sec')),
      h('p', { class: 'erro largo' }));
    aoEnviar(form, async fd => {
      const d = Object.fromEntries(fd.entries());
      if (!novo) d.id = x.id;
      await api('fin.despesa.salvar', { despesa: d }); caixa.close(); avisar(novo ? 'Despesa lançada.' : 'Despesa salva.'); rota();
    });
    caixa.append(form);
    caixa.addEventListener('close', () => caixa.remove());
    document.body.append(caixa);
    caixa.showModal();
  }

  /* ---------- relatórios (administração) ---------- */

  /* Cores e ícones de cada tipo de trabalho no relatório da equipe */
  const CAT_EQUIPE = {
    intimacoes: ['📨', '#2f6fd0'], prazos: ['⏱', '#1f8a4c'], iniciais: ['⚖', '#7a4fc0'], whatsapp: ['💬', '#25a35a'],
    tarefas: ['✓', '#c98a12'], conferidos: ['📅', '#1d8a8a'], prazos_novos: ['✎', '#8a8f99'], agenda: ['🗓', '#d0602d'],
    clientes: ['👤', '#b08d57'], processos: ['📁', '#2e5f8a'], documentos: ['📄', '#8a6a37'], financeiro: ['💰', '#4a7a2a'], oks: ['✔', '#16171a']
  };
  const corCat = id => (CAT_EQUIPE[id] || ['•', '#9aa0aa'])[1];
  const icoCat = id => (CAT_EQUIPE[id] || ['•'])[0];
  const CORES_PESSOA = ['#7a4fc0', '#2f6fd0', '#1d8a8a', '#c98a12', '#d0602d', '#1f8a4c', '#b0457a', '#2e5f8a'];

  /** Painel da equipe: o que cada colaborador fez na semana ou no mês. */
  function blocoSemana(sem, per) {
    const caixa = h('section', { class: 'equipe-painel' });
    caixa.append(h('p', { class: 'peq' }, 'Carregando o painel da equipe…'));
    (async () => {
      let r;
      try { r = await api('relatorio.semana', { inicio: sem || '', periodo: per }); }
      catch (e) { caixa.replaceChildren(h('p', { class: 'erro' }, e.message)); return; }
      const nomeCat = Object.fromEntries(r.categorias.map(c => [c.id, c.nome]));
      const ir = mud => { const q = new URLSearchParams({ semana: sem || '', per: per || '', ...mud }); [...q.keys()].forEach(k => { if (!q.get(k)) q.delete(k); }); location.hash = '#/relatorios' + (q.toString() ? '?' + q : ''); };
      const mes = r.periodo === 'mes';
      const titPer = mes ? new Date(r.inicio + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }) : `${dataBR(r.inicio)} a ${dataBR(r.fim)}`;
      const soma = id => r.pessoas.reduce((t, p) => t + (p.grupos[id] || 0), 0);
      const total = r.pessoas.reduce((t, p) => t + p.total, 0);
      const maior = Math.max(1, ...r.pessoas.map(p => p.total));
      const catsUsadas = r.categorias.filter(c => soma(c.id));
      const kpi = (id, rot) => h('div', { class: 'eq-kpi' }, h('span', { class: 'eq-kpi-ico', 'data-cor': corCat(id) }, icoCat(id)), h('b', {}, String(soma(id))), h('span', {}, rot));
      const pinta = el => { el.querySelectorAll('[data-cor]').forEach(x => { x.style.setProperty('--c', x.dataset.cor); }); el.querySelectorAll('[data-w]').forEach(x => { x.style.width = x.dataset.w + '%'; }); return el; };
      const barra = p => h('div', { class: 'eq-barra' }, r.categorias.filter(c => p.grupos[c.id]).map(c => h('span', { class: 'eq-seg', 'data-cor': corCat(c.id), 'data-w': String(p.grupos[c.id] * 100 / maior), title: `${c.nome}: ${p.grupos[c.id]}` })));
      const ranking = h('div', { class: 'eq-ranking' }, r.pessoas.map((p, i) => h('div', { class: 'eq-rank-linha' },
        h('span', { class: 'eq-pos' }, p.total ? String(i + 1) + 'º' : '—'),
        h('span', { class: 'eq-av', 'data-cor': CORES_PESSOA[i % CORES_PESSOA.length] }, iniciais(p.nome)),
        h('span', { class: 'eq-rank-nome' }, p.nome),
        barra(p), h('b', { class: 'eq-rank-n' }, String(p.total)))));
      const porDia = itens => { const g = {}; itens.forEach(x => { const d = new Date(x.quando).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); (g[d] = g[d] || []).push(x); }); return Object.entries(g); };
      const cartao = (p, i) => h('article', { class: 'eq-card' + (p.total ? '' : ' parado') },
        h('header', { class: 'eq-card-cab', 'data-cor': CORES_PESSOA[i % CORES_PESSOA.length] },
          h('span', { class: 'eq-av grande', 'data-cor': CORES_PESSOA[i % CORES_PESSOA.length] }, iniciais(p.nome)),
          h('div', {}, h('strong', {}, p.nome), h('div', { class: 'peq' }, p.perfil || '')),
          h('div', { class: 'eq-card-total' }, h('b', {}, String(p.total)), h('span', {}, 'ações'))),
        p.total ? h('div', { class: 'eq-tiles' }, r.categorias.filter(c => p.grupos[c.id]).map(c => h('div', { class: 'eq-tile', 'data-cor': corCat(c.id) },
          h('span', { class: 'eq-tile-ico' }, icoCat(c.id)), h('b', {}, String(p.grupos[c.id])), h('span', {}, c.nome))))
          : h('p', { class: 'peq eq-nada' }, 'Nada registrado neste período.'),
        p.itens.length ? h('details', { class: 'eq-linha-tempo' }, h('summary', {}, `Ver tudo o que fez (${p.itens.length})`),
          porDia(p.itens).map(([dia, xs]) => h('div', { class: 'eq-dia' }, h('div', { class: 'eq-dia-tit' }, dia),
            h('ul', {}, xs.map(x => h('li', {}, h('time', {}, new Date(x.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
              h('span', { class: 'eq-ponto', 'data-cor': corCat(x.cat) }), h('span', { class: 'eq-item-cat' }, nomeCat[x.cat] || x.acao), h('span', { class: 'eq-item-txt' }, x.texto))))))) : null);
      caixa.replaceChildren(pinta(h('div', {},
        h('div', { class: 'eq-topo' },
          h('div', {}, h('span', { class: 'carteira-kicker' }, 'Equipe'), h('h2', {}, 'O que cada colaborador fez'), h('p', {}, titPer + ' · tudo o que foi conferido, avisado e cadastrado no painel')),
          h('div', { class: 'eq-controles' },
            h('div', { class: 'visoes' }, h('button', { type: 'button', class: 'visao-bt' + (!mes ? ' ativo' : ''), onclick: () => ir({ per: '', semana: '' }) }, 'Semana'),
              h('button', { type: 'button', class: 'visao-bt' + (mes ? ' ativo' : ''), onclick: () => ir({ per: 'mes', semana: '' }) }, 'Mês')),
            h('div', { class: 'barra' }, botao('◀', () => ir({ semana: r.anterior }), 'sec mini'), r.proxima ? botao('▶', () => ir({ semana: r.proxima }), 'sec mini') : null,
              sem ? botao(mes ? 'Este mês' : 'Esta semana', () => ir({ semana: '' }), 'sec mini') : null))),
        h('div', { class: 'eq-kpis' },
          h('div', { class: 'eq-kpi total' }, h('b', {}, String(total)), h('span', {}, 'ações da equipe')),
          kpi('intimacoes', 'intimações conferidas'), kpi('prazos', 'prazos feitos'), kpi('iniciais', 'petições iniciais'), kpi('whatsapp', 'clientes avisados'),
          r.aguardando ? h('a', { class: 'eq-kpi alerta', href: '#/prazos' }, h('b', {}, String(r.aguardando)), h('span', {}, 'esperando o seu OK')) : null),
        total ? h('div', { class: 'eq-bloco' }, h('h3', {}, 'Ranking do período'), ranking,
          h('div', { class: 'eq-legenda' }, catsUsadas.map(c => h('span', {}, h('span', { class: 'eq-ponto', 'data-cor': corCat(c.id) }), c.nome)))) : null,
        h('div', { class: 'eq-cards' }, r.pessoas.map(cartao)))));
    })();
    return caixa;
  }

  /** 8.22: indicadores de produtividade — mês × mês anterior, escritório e por pessoa, e a situação de hoje. */
  function blocoIndicadores(mesSel) {
    const box = h('section', { class: 'caixa ind-caixa' }, h('p', { class: 'peq' }, 'Calculando os indicadores…'));
    api('indicadores.mes', mesSel ? { mes: mesSel } : {}).then(r => {
      const a = r.agora, b = r.antes, hj = r.hoje;
      const pc = (x, t) => t ? Math.round(x * 100 / t) : null;
      const seta = (v, w, melhorMaior = true) => { if (v === null || w === null || v === w) return h('span', { class: 'ind-var' }, '='); const sobe = v > w; return h('span', { class: 'ind-var ' + (sobe === melhorMaior ? 'bom' : 'ruim') }, (sobe ? '▲ ' : '▼ ') + Math.abs(Math.round((v - w) * 10) / 10)); };
      const kpi = (rot, v, w, suf, melhorMaior, dica) => h('div', { class: 'ind-kpi', title: dica || '' }, h('span', { class: 'ind-rot' }, rot), h('b', {}, v === null ? '—' : v + (suf || '')), seta(v, w, melhorMaior), h('span', { class: 'ind-ant' }, 'mês anterior: ' + (w === null ? '—' : w + (suf || ''))));
      const nomeMes = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      box.replaceChildren(
        h('h2', {}, '📊 Indicadores de ' + nomeMes(r.mes)),
        h('div', { class: 'ind-grade' },
          kpi('Prazos cumpridos', a.prazos, b.prazos, '', true),
          kpi('Prazos no prazo', pc(a.prazosNoPrazo, a.prazos), pc(b.prazosNoPrazo, b.prazos), '%', true, 'Cumpridos até a data fatal'),
          kpi('Folga média antes do fatal', a.folgaMedia, b.folgaMedia, ' dias', true),
          kpi('Tarefas feitas', a.tarefas, b.tarefas, '', true),
          kpi('Tarefas no prazo', pc(a.tarefasNoPrazo, a.tarefas), pc(b.tarefasNoPrazo, b.tarefas), '%', true),
          kpi('Intimações tratadas', a.intimacoesFeitas, b.intimacoesFeitas, '', true),
          kpi('Dias até tratar a intimação', a.diasIntimacao, b.diasIntimacao, '', false, 'Do recebimento ao "Conferido"'),
          kpi('Clientes novos', a.clientesNovos, b.clientesNovos, '', true),
          kpi('Contratos assinados', a.contratos, b.contratos, '', true),
          sessao.usuario.pode.ocultarValores ? null : kpi('Recebido', Math.round(a.recebido), Math.round(b.recebido), '', true)),
        h('h3', {}, 'Agora'),
        h('div', { class: 'ind-grade ind-hoje' },
          h('a', { class: 'ind-kpi' + (hj.prazosVencidos ? ' alerta' : ''), href: '#/prazos' }, h('span', { class: 'ind-rot' }, 'Prazos vencidos em aberto'), h('b', {}, String(hj.prazosVencidos))),
          h('a', { class: 'ind-kpi' + (hj.prazosSemResp ? ' alerta' : ''), href: '#/prazos' }, h('span', { class: 'ind-rot' }, 'Prazos sem responsável'), h('b', {}, String(hj.prazosSemResp))),
          h('a', { class: 'ind-kpi' + (hj.prazosConferir ? ' alerta' : ''), href: '#/prazos?fila=conferir' }, h('span', { class: 'ind-rot' }, 'Prazos para conferir no tribunal'), h('b', {}, String(hj.prazosConferir))),
          h('a', { class: 'ind-kpi', href: '#/processos' }, h('span', { class: 'ind-rot' }, 'Processos ativos'), h('b', {}, String(hj.processosAtivos)), h('span', { class: 'ind-ant' }, hj.processosParados + ' parados há 60+ dias')),
          sessao.usuario.pode.ocultarValores ? null : h('a', { class: 'ind-kpi' + (hj.inadimplencia > 20 ? ' alerta' : ''), href: '#/financeiro?ver=atraso' }, h('span', { class: 'ind-rot' }, 'Inadimplência'), h('b', {}, hj.inadimplencia + '%'), h('span', { class: 'ind-ant' }, 'vencido ÷ (vencido + 30 dias)'))),
        a.pessoas.length ? h('div', {}, h('h3', {}, 'Por pessoa'), tabela(['Pessoa', 'Prazos', 'No prazo', 'Tarefas', 'No prazo', 'Intimações', 'Tarefas atrasadas agora'], a.pessoas, p => {
          const atr = (hj.tarefasAtrasadas.find(x => x.nome === p.nome) || {}).n || 0;
          return [h('td', {}, h('strong', {}, p.nome)), h('td', { class: 'num' }, String(p.prazos)), h('td', { class: 'num' }, p.prazos ? pc(p.prazos_no_prazo, p.prazos) + '%' : '—'),
            h('td', { class: 'num' }, String(p.tarefas)), h('td', { class: 'num' }, p.tarefas ? pc(p.tarefas_no_prazo, p.tarefas) + '%' : '—'), h('td', { class: 'num' }, String(p.intimacoes)),
            h('td', { class: 'num' }, atr ? h('span', { class: 'tag urgente' }, String(atr)) : '0')];
        }, () => {}, '')) : null);
    }).catch(e => box.replaceChildren(h('p', { class: 'erro' }, e.message)));
    return box;
  }
  async function telaRelatorios(params) {
    carregando();
    const mesSel = params && /^\d{4}-\d{2}$/.test(params.get('mes') || '') ? params.get('mes') : '';
    const r = await api('relatorio.geral', mesSel ? { mes: mesSel } : {});
    const sem = params && /^\d{4}-\d{2}-\d{2}$/.test(params.get('semana') || '') ? params.get('semana') : '';
    const per = params && params.get('per') === 'mes' ? 'mes' : '';
    const soma = a => a.reduce((x, y) => x + y, 0);
    const pct = r.percentualNoPrazo;
    const cartaoG = (titulo, sub, corpo) => h('section', { class: 'caixa rel-cartao' }, h('h2', {}, titulo), sub ? h('p', { class: 'peq' }, sub) : null, corpo);
    const pctMes = r.prazosEntregues.map((n, i) => n ? Math.round(r.prazosNoPrazo[i] * 100 / n) : 0);
    const produtividade = () => h('section', { class: 'caixa' }, h('h2', {}, `Produtividade por pessoa · últimos ${r.diasProdutividade} dias`),
        r.produtividade.length ? h('div', { class: 'rolar' }, h('table', { class: 'mini-tab placar' }, h('thead', {}, h('tr', {}, ['Pessoa', 'Pontos', 'Entregues', 'No prazo', 'Atrasadas', 'Em aberto', 'Vencidas agora'].map(t => h('th', {}, t)))),
          h('tbody', {}, r.produtividade.map(p => h('tr', {}, h('th', { scope: 'row' }, p.nome), h('td', {}, h('b', {}, String(p.pontos))), h('td', {}, String(p.entregues)),
            h('td', {}, String(p.no_prazo) + (p.entregues ? ` (${Math.round(p.no_prazo * 100 / p.entregues)}%)` : '')), h('td', {}, String(p.atrasadas)), h('td', {}, String(p.abertas)), h('td', {}, String(p.vencidas)))))))
          : h('p', { class: 'peq' }, 'Ainda não há tarefas ou prazos entregues no período.'));
    // 8.24 (pedido da usuária: "relatório com muita informação"): EQUIPE fica numa página própria (menu do nome › Equipe)
    if (params && params.get('ver') === 'equipe') {
      mostrar(h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Equipe'), h('p', {}, 'O que cada pessoa fez: conferidos, prazos, tarefas, avisos ao cliente, documentos.'))),
        blocoSemana(sem, per), produtividade());
      return;
    }
    const iMes = mesSel && r.meses.includes(mesSel) ? r.meses.indexOf(mesSel) : r.meses.length - 1;
    const mesRef = r.meses[iMes], nomeMes0 = new Date(mesRef + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), nomeMes = nomeMes0.charAt(0).toUpperCase() + nomeMes0.slice(1);
    const irMes = d => { const i = iMes + d; if (i < 0 || i >= r.meses.length) return null; return '#/relatorios?mes=' + r.meses[i]; };
    const ativos = soma(r.porArea.map(a => a.ativos || 0));
    const resultado = (r.entradas[iMes] || 0) - (r.saidas[iMes] || 0);
    const n = (rot, valor, sub, cls) => h('div', { class: 'rel-n ' + (cls || '') }, h('small', {}, rot), h('b', {}, valor), sub ? h('span', {}, sub) : null);
    const ant = i => (i > 0 ? i - 1 : null);
    const comp = (arr, fmt) => ant(iMes) === null ? '' : 'mês anterior: ' + (fmt ? fmt(arr[iMes - 1] || 0) : String(arr[iMes - 1] || 0));
    const detalhes = h('details', { class: 'caixa rel-detalhes' }, h('summary', {}, 'Ver todos os gráficos e indicadores'),
      blocoIndicadores(mesSel), blocoResultados(r),
      h('div', { class: 'rel-grade' },
        r.contratosFechados ? cartaoG('Contratos fechados (assinados) por mês', 'Procuração/contrato marcados "✓ Assinado".', grafColunas(r.meses, [{ nome: 'Contratos fechados', valores: r.contratosFechados, cor: 'c-verde' }])) : null,
        r.processosFinalizados ? cartaoG('Processos finalizados por mês', 'Arquivados / encerrados (pela última movimentação).', grafColunas(r.meses, [{ nome: 'Finalizados', valores: r.processosFinalizados, cor: 'c-tinta' }])) : null,
        cartaoG('Clientes novos por mês', null, grafColunas(r.meses, [{ nome: 'Clientes novos', valores: r.clientesNovos, cor: 'c-azul' }])),
        cartaoG('Processos novos por mês', r.areasNovas.length ? 'Por área: ' + r.areasNovas.map(a => `${a.area} ${a.n}`).join(' · ') : null, grafColunas(r.meses, [{ nome: 'Processos novos', valores: r.processosNovos, cor: 'c-tinta' }])),
        cartaoG('Receita × despesas', 'Parcelas recebidas e despesas pagas.', grafColunas(r.meses, [{ nome: 'Entradas', valores: r.entradas, cor: 'c-verde' }, { nome: 'Saídas', valores: r.saidas, cor: 'c-vermelho' }], { dinheiro: true })),
        cartaoG('Prazos entregues e % no prazo', pctMes.some(Boolean) ? '% no prazo por mês: ' + r.meses.map((m, i) => r.prazosEntregues[i] ? `${MES_CURTO(m)} ${pctMes[i]}%` : null).filter(Boolean).join(' · ') : null,
          grafColunas(r.meses, [{ nome: 'Entregues', valores: r.prazosEntregues, cor: 'c-tinta' }, { nome: 'No prazo', valores: r.prazosNoPrazo, cor: 'c-verde' }])),
        cartaoG('Intimações recebidas por mês', null, grafColunas(r.meses, [{ nome: 'Intimações', valores: r.intimacoes, cor: 'c-azul' }])),
        cartaoG('Processos por área', 'Processos ativos; passe o mouse para ver a porcentagem.', grafRosca(r.porArea.slice(0, 10).map(a => ({ nome: a.area, valor: a.ativos })), { rotulo: 'ativos', titulo: 'Processos por área' })),
        r.porFase ? cartaoG('Processos por fase', 'Ativos. Clique para abrir em Processos.', grafRosca(Object.keys(FASES).map(f => ({ nome: FASES[f], valor: r.porFase[f] || 0, cor: CORES_FASE[f], ir: () => { location.hash = '#/processos?fase=' + f; } })), { rotulo: 'ativos', titulo: 'Processos por fase' })) : null,
        r.porTribunal ? cartaoG('Processos por tribunal', 'Ativos.', grafRosca(r.porTribunal.slice(0, 8).map(t => ({ nome: t.tribunal, valor: t.n, ir: () => { location.hash = '#/processos?trib=' + encodeURIComponent(t.tribunal); } })), { rotulo: 'ativos', titulo: 'Processos por tribunal' })) : null,
        cartaoG('Arquivados por área', null, grafRosca(r.porArea.slice(0, 10).map(a => ({ nome: a.area, valor: a.arquivados })), { rotulo: 'arquivados', titulo: 'Arquivados por área', vazio: 'Nenhum arquivado.' }))));
    mostrar(
      h('div', { class: 'cab rel-cab' }, h('div', {}, h('h1', {}, 'Relatórios'), h('p', {}, 'Clientes e processos importados (GEA, Gmail antigo) não contam como novos.')),
        h('div', { class: 'rel-mes' }, irMes(-1) ? h('a', { class: 'btn sec mini', href: irMes(-1), 'aria-label': 'Mês anterior' }, '‹') : null, h('b', {}, nomeMes), irMes(1) ? h('a', { class: 'btn sec mini', href: irMes(1), 'aria-label': 'Próximo mês' }, '›') : null)),
      h('section', { class: 'rel-nums' },
        n('Recebido', reais(r.entradas[iMes] || 0), comp(r.entradas, reais), 'ok'),
        n('Resultado (entradas − saídas)', reais(resultado), 'saídas: ' + reais(r.saidas[iMes] || 0), resultado < 0 ? 'ruim' : ''),
        n('Clientes novos', String(r.clientesNovos[iMes] || 0), comp(r.clientesNovos)),
        n('Contratos fechados', String((r.contratosFechados || [])[iMes] || 0), r.contratosFechados ? comp(r.contratosFechados) : ''),
        n('Prazos cumpridos no prazo', r.prazosEntregues[iMes] ? pctMes[iMes] + '%' : '—', `${r.prazosEntregues[iMes] || 0} entregue(s)` + (r.prazosVencidosAbertos ? ` · ${r.prazosVencidosAbertos} vencido(s) sem baixa` : ''), r.prazosEntregues[iMes] && pctMes[iMes] < 90 ? 'ruim' : ''),
        n('Processos ativos', String(ativos), `${soma(r.processosNovos)} novos em 12 meses`)),
      h('div', { class: 'rel-grade rel-dois' },
        cartaoG('Entradas × saídas', 'Últimos 12 meses.', grafColunas(r.meses, [{ nome: 'Entradas', valores: r.entradas, cor: 'c-verde' }, { nome: 'Saídas', valores: r.saidas, cor: 'c-vermelho' }], { dinheiro: true })),
        cartaoG('Clientes novos e contratos fechados', 'Últimos 12 meses.', grafColunas(r.meses, [{ nome: 'Clientes novos', valores: r.clientesNovos, cor: 'c-azul' }].concat(r.contratosFechados ? [{ nome: 'Contratos fechados', valores: r.contratosFechados, cor: 'c-verde' }] : [])))),
      detalhes);
  }

  /* ---------- Organizar cadastros (8.7.0): processos sem cliente e cadastros para completar ---------- */
  async function telaOrganizar(params) {
    carregando();
    const ver = params.get('ver') === 'cadastros' ? 'cadastros' : 'processos';
    const q = semAcentoG(params.get('q') || '');
    const [r, clis] = await Promise.all([api('organizar.listar', {}), api('clientes.listar', {})]);
    const ir = mud => { const u = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) u.set(k, v); else u.delete(k); }); location.hash = '#/organizar?' + u; };
    const ligar = async (el, dados, msg) => { el.querySelectorAll('button,select,input').forEach(b => { b.disabled = true; });
      try { await api('organizar.ligar', dados); el.classList.add('feita'); el.replaceChildren(h('span', { class: 'tag ok' }, '✓ ' + msg)); } catch (e) { avisar(e.message, true); el.querySelectorAll('button,select,input').forEach(b => { b.disabled = false; }); } };
    const linhaProc = x => {
      const el = h('li', { class: 'org-item' });
      const busca = h('input', { type: 'search', placeholder: 'Procurar outro cliente…', list: 'org-clis', 'aria-label': 'Procurar cliente' });
      el.append(h('div', { class: 'org-txt' }, h('a', { href: '#/processo/' + x.id }, h('strong', {}, x.numero)), h('div', { class: 'peq' }, [x.area, x.orgao, x.contra ? 'contra ' + x.contra : ''].filter(Boolean).join(' · ')),
          x.nome ? h('div', {}, 'Nome no aviso do tribunal: ', h('b', {}, x.nome)) : h('div', { class: 'peq' }, x.sigilo ? 'Processo em sigilo: abra no tribunal para ver o nome.' : 'O aviso não trouxe o nome do cliente.')),
        h('div', { class: 'org-acoes' },
          x.sugestoes.map(c => h('button', { type: 'button', class: 'btn mini', title: c.motivo, onclick: () => ligar(el, { processo_id: x.id, cliente_id: c.id }, 'ligado a ' + c.nome) }, 'Ligar a ' + c.nome + (c.motivo === 'nome parecido' ? ' (parecido)' : ''))),
          x.nome && !x.sugestoes.some(c => c.motivo === 'mesmo nome') ? h('button', { type: 'button', class: 'btn mini sec', onclick: () => ligar(el, { processo_id: x.id, criar: true, nome: x.nome }, 'cadastro criado: ' + x.nome) }, '+ Criar cadastro "' + x.nome + '"') : null,
          h('span', { class: 'org-busca' }, busca, h('button', { type: 'button', class: 'btn mini sec', onclick: () => { const c = clis.find(y => y.nome === busca.value); if (!c) { avisar('Escolha um cliente da lista.', true); return; } ligar(el, { processo_id: x.id, cliente_id: c.id }, 'ligado a ' + c.nome); } }, 'Ligar'))));
      return el;
    };
    const pedirDados = x => { let tel = telefoneWhats(x.telefone || ''); if (!tel) return null; if (tel.length <= 11) tel = '55' + tel;
      const nome = nomeProprioJS(primeiroNome(x.nome));
      const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Estamos atualizando os cadastros para manter você sempre informado(a) sobre o seu processo. Pode nos enviar, por favor: ${x.falta.filter(f => f !== 'telefone').join(', ')}? Obrigado!`;
      return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg); };
    const linhaCad = x => h('li', { class: 'org-item' },
      h('div', { class: 'org-txt' }, h('a', { href: '#/cliente/' + x.id }, h('strong', {}, x.nome)), h('div', { class: 'peq' }, 'Falta: ' + x.falta.join(', ') + (x.processos ? ` · ${x.processos} processo(s) ativo(s)` : ''))),
      h('div', { class: 'org-acoes' }, pedirDados(x) && x.falta.some(f => f !== 'telefone') ? h('a', { class: 'btn mini wa', href: pedirDados(x), target: '_blank', rel: 'noopener noreferrer', onclick: () => registrarWhats({ cliente: x.nome }, 'pedir dados do cadastro') }, 'Pedir no WhatsApp')
        : !x.telefone ? h('span', { class: 'tag atencao' }, 'sem telefone: procure no processo ou na pasta') : null,
        h('a', { class: 'btn mini sec', href: '#/cliente/' + x.id }, 'Completar')));
    const procs = r.semCliente.filter(x => !q || semAcentoG([x.numero, x.nome, x.contra, x.orgao].join(' ')).includes(q));
    const cads = r.incompletos.filter(x => !q || semAcentoG([x.nome, x.falta.join(' ')].join(' ')).includes(q));
    const bq = h('form', { class: 'busca-tarefas', role: 'search' }, h('input', { type: 'search', name: 'q', value: params.get('q') || '', placeholder: 'Buscar nome ou nº', 'aria-label': 'Buscar' }));
    bq.addEventListener('submit', ev => { ev.preventDefault(); ir({ q: bq.q.value.trim() }); });
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, '🔧 Organizar cadastros'), h('p', {}, 'Processo sem cliente não recebe aviso de audiência nem WhatsApp. Cadastro completo evita retrabalho.')),
        h('a', { class: 'btn sec', href: '#/clientes' }, 'Voltar')),
      h('div', { class: 'tf-linha' }, h('div', { class: 'visoes', role: 'tablist' },
        h('button', { type: 'button', class: 'visao-bt' + (ver === 'processos' ? ' ativo' : ''), onclick: () => ir({ ver: '' }) }, `Processos sem cliente (${r.totalSemCliente})`),
        h('button', { type: 'button', class: 'visao-bt' + (ver === 'cadastros' ? ' ativo' : ''), onclick: () => ir({ ver: 'cadastros' }) }, `Cadastros para completar (${r.totalIncompletos})`)), bq),
      h('datalist', { id: 'org-clis' }, clis.slice(0, 3000).map(c => h('option', { value: c.nome }))),
      ver === 'processos'
        ? h('section', { class: 'caixa' }, h('p', { class: 'peq' }, 'Primeiro os que têm sugestão: confira o nome e aperte "Ligar". Se o cliente não tem cadastro, "Criar cadastro" usa o nome que veio do tribunal (sem pasta nova). Dica: Usuários › Revisão geral faz isso em lote para os nomes iguais.'),
            procs.length ? h('ul', { class: 'org-lista' }, procs.slice(0, 150).map(linhaProc)) : h('p', {}, 'Nenhum processo ativo sem cliente. 👏'), procs.length > 150 ? h('p', { class: 'peq' }, `Mostrando 150 de ${procs.length}. Use a busca.`) : null)
        : h('section', { class: 'caixa' }, h('p', { class: 'peq' }, 'Clientes com processo ativo. Primeiro os sem telefone (sem telefone não há aviso de audiência). "Pedir no WhatsApp" manda a mensagem pedindo só o que falta.'),
            cads.length ? h('ul', { class: 'org-lista' }, cads.slice(0, 200).map(linhaCad)) : h('p', {}, 'Todos os cadastros estão completos. 👏'), cads.length > 200 ? h('p', { class: 'peq' }, `Mostrando 200 de ${cads.length}. Use a busca.`) : null));
  }

  /* ---------- Marketing (8.6.0): o site e o Google Ads dão retorno? Por área, bem explícito ---------- */
  async function telaMarketing(params) {
    carregando();
    const nMeses = ['3', '6', '12'].includes(params.get('meses')) ? params.get('meses') : '6';
    const r = await api('marketing.resumo', { meses: nMeses });
    const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
    const veredito = a => {
      const inv = a.investimento, volta = Math.max(a.contratado_ads, a.recebido_ads);
      if (!inv) return a.cliques_ads || a.clientes_ads ? { cls: 'neutro', txt: 'Lance quanto foi investido nesta área para o painel calcular o retorno.' } : null;
      if (!a.clientes_ads && a.sem_origem) return { cls: 'neutro', txt: `RETORNO NÃO MEDIDO: investimos ${reais(inv)}, mas ${a.sem_origem} cliente(s) novo(s) estão sem "Como nos conheceu?". Preencha nos cadastros (Clientes › Editar cadastro) para o painel dizer se o anúncio se paga.` };
      if (!a.clientes_ads) return { cls: 'ruim', txt: `Investimos ${reais(inv)} e nenhum cliente disse que veio do anúncio${a.cliques_ads ? ` (houve ${a.cliques_ads} clique(s) no WhatsApp vindos do anúncio)` : ''}. Hoje NÃO está dando retorno — ou falta marcar "Como nos conheceu?" nos clientes novos.` };
      const x = volta / inv;
      const custo = inv / a.clientes_ads;
      return x >= 1
        ? { cls: 'bom', txt: `DÁ RETORNO: cada R$ 1,00 investido trouxe ${reais(x)} em honorários contratados. Custo de ${reais(custo)} por cliente vindo do anúncio (${a.clientes_ads} cliente(s), ${a.contratos_ads} contrato(s) assinado(s)).` }
        : { cls: 'ruim', txt: `AINDA NÃO SE PAGOU: cada R$ 1,00 investido voltou ${reais(x)} em honorários contratados. Custo de ${reais(custo)} por cliente (${a.clientes_ads} cliente(s)). ${a.exito_ads ? a.exito_ads + ' contrato(s) de êxito ainda podem render no fim do processo.' : ''}` };
    };
    const t = r.total, vt = veredito(t);
    const cartaoArea = a => {
      const v = veredito(a);
      if (!a.investimento && !a.cliques_ads && !a.cliques_site && !a.contatos && !a.clientes) return null;
      return h('section', { class: 'caixa mkt-area ' + (v ? v.cls : '') },
        h('h2', {}, a.area === 'Geral' ? 'Geral / sem área' : a.area),
        v ? h('p', { class: 'mkt-veredito' }, v.txt) : null,
        h('dl', { class: 'mkt-num' },
          h('div', {}, h('dt', {}, 'Investido'), h('dd', {}, reais(a.investimento))),
          h('div', {}, h('dt', {}, 'Cliques no WhatsApp do site'), h('dd', {}, `${a.cliques_ads} do anúncio · ${a.cliques_site} sem anúncio`)),
          h('div', {}, h('dt', {}, 'Pedidos "ligue para mim"'), h('dd', {}, `${a.contatos} (${a.contatos_ads} do anúncio)`)),
          h('div', {}, h('dt', {}, 'Clientes novos'), h('dd', {}, `${a.clientes} · ${a.clientes_ads} vieram do anúncio · ${a.clientes_google} do Google/site`)),
          h('div', {}, h('dt', {}, 'Contratos assinados'), h('dd', {}, `${a.contratos} (${a.contratos_ads} do anúncio)`)),
          h('div', {}, h('dt', {}, 'Honorários contratados'), h('dd', {}, `${reais(a.contratado)} (${reais(a.contratado_ads)} do anúncio)`)),
          h('div', {}, h('dt', {}, 'Já recebido'), h('dd', {}, `${reais(a.recebido)} (${reais(a.recebido_ads)} do anúncio)`)),
          a.investimento && a.cliques_ads ? h('div', {}, h('dt', {}, 'Custo por clique no WhatsApp'), h('dd', {}, reais(a.investimento / a.cliques_ads))) : null));
    };
    // lançar investimento do mês
    const mesAtual = hojeISO().slice(0, 7);
    const f = h('form', { class: 'campos', novalidate: true },
      campo('mes', 'Mês', mesAtual, { tipo: 'month' }),
      campo('canal', 'Onde', 'Google Ads', { opcoes: [['Google Ads', 'Google Ads'], ['Instagram/Facebook', 'Instagram / Facebook'], ['Site (manutenção)', 'Site (manutenção)'], ['Outro', 'Outro']] }),
      campo('area', 'Área da campanha', 'Trabalhista', { opcoes: r.areas.map(a => [a, a]).concat([['Geral', 'Geral / várias áreas']]) }),
      campo('campanha', 'Nome da campanha (opcional)', '', { max: 80 }),
      campo('investimento', 'Investido no mês (R$)', '', { modo: 'decimal', max: 15 }),
      campo('cliques', 'Cliques no anúncio (opcional)', '', { modo: 'numeric', max: 7 }),
      campo('impressoes', 'Impressões (opcional)', '', { modo: 'numeric', max: 9 }),
      campo('conversoes', 'Conversões no Google (opcional)', '', { modo: 'numeric', max: 6 }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Lançar investimento')), h('p', { class: 'erro largo' }));
    aoEnviar(f, async fd => { await api('marketing.salvar', { item: Object.fromEntries(fd.entries()) }); avisar('Investimento lançado.'); await apiFresco('marketing.resumo', { meses: nMeses }).catch(() => null); rota(); });
    const tabMes = h('div', { class: 'rolar' }, h('table', { class: 'mini-tab' },
      h('thead', {}, h('tr', {}, ['Mês', 'Investido', 'Cliques (anúncio)', 'Cliques (sem anúncio)', 'Pedidos de contato', 'Clientes novos', 'Do anúncio', 'Contratos', 'Contratado (anúncio)'].map(x => h('th', {}, x)))),
      h('tbody', {}, r.porMes.slice().reverse().map(m => h('tr', {}, h('th', { scope: 'row' }, MES_CURTO(m.mes) + '/' + m.mes.slice(2, 4)), h('td', {}, reais(m.investimento)), h('td', {}, String(m.cliques_ads)), h('td', {}, String(m.cliques_site)),
        h('td', {}, String(m.contatos)), h('td', {}, String(m.clientes)), h('td', {}, String(m.clientes_ads)), h('td', {}, String(m.contratos)), h('td', {}, reais(m.contratado_ads)))))));
    const tabCamp = r.campanhas.length ? h('div', { class: 'rolar' }, h('table', { class: 'mini-tab' },
      h('thead', {}, h('tr', {}, ['Mês', 'Onde', 'Área', 'Campanha', 'Investido', 'Cliques', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, r.campanhas.map(c => h('tr', {}, h('td', {}, c.mes), h('td', {}, c.canal + (c.auto ? ' ⚡' : '')), h('td', {}, c.area), h('td', {}, c.campanha || '—'), h('td', {}, reais(c.investimento)), h('td', {}, c.cliques || '—'),
        h('td', {}, h('button', { type: 'button', class: 'btn mini sec', onclick: async () => { if (!confirm('Apagar este lançamento?')) return; await api('marketing.salvar', { excluir: c.id }); await apiFresco('marketing.resumo', { meses: nMeses }).catch(() => null); rota(); } }, 'Apagar'))))))) : h('p', { class: 'peq' }, 'Nenhum investimento lançado ainda.');
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Marketing: o site e o Google dão retorno?'),
        h('p', {}, `Últimos ${nMeses} meses. Junta o que foi investido, os cliques no WhatsApp do site, os pedidos de contato, os clientes novos ("Como nos conheceu?") e o que foi contratado.`)),
        h('div', { class: 'seg-sistema' }, ['3', '6', '12'].map(n => h('button', { type: 'button', class: 'seg' + (n === nMeses ? ' ativo' : ''), onclick: () => { location.hash = '#/marketing?meses=' + n; } }, n + ' meses')))),
      vt ? h('div', { class: 'nota mkt-geral ' + vt.cls }, h('strong', {}, 'No total: '), vt.txt) : h('div', { class: 'nota' }, 'Lance abaixo quanto foi investido por mês no Google Ads (e em qual área) para o painel mostrar se está dando retorno.'),
      r.semMarcacao ? h('div', { class: 'nota alerta' }, `${r.semMarcacao} cliente(s) novo(s) sem "Como nos conheceu?". Sem isso o painel não sabe se veio do anúncio: pergunte ao cliente e marque no cadastro.`) : null,
      h('div', { class: 'mkt-grade' }, r.porArea.map(cartaoArea).filter(Boolean).length ? r.porArea.map(cartaoArea).filter(Boolean) : h('p', { class: 'caixa peq' }, 'Ainda não há dados no período.')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Mês a mês'), tabMes),
      caixaGoogleAds(r),
      caixaFunilPaginas(),
      caixaBlogGoogle(),
      h('section', { class: 'caixa' }, h('h2', {}, 'Lançar o investimento do mês (à mão)'),
        h('p', { class: 'peq' }, 'No Google Ads: Campanhas › escolha o mês › copie o "Custo" de cada campanha (uma por área). Faça uma vez por mês. Para outras áreas, crie uma campanha por área: assim o painel compara cada uma.'), f),
      h('section', { class: 'caixa' }, h('h2', {}, 'Investimentos lançados'), tabCamp),
      h('p', { class: 'peq' }, 'Como o painel sabe: o site marca cada clique no WhatsApp (sem dado pessoal) e se a pessoa chegou por um anúncio do Google. O cliente novo conta como "do anúncio" quando o cadastro diz "Como nos conheceu? → Google Ads". Honorários de êxito só entram quando houver valor.'));
  }

  /** 8.10: funil por página — cliques (automático) → conversas iniciadas → consultas agendadas (a equipe lança os totais do mês). */
  function caixaFunilPaginas() {
    const corpo = h('div', {}, h('p', { class: 'peq' }, 'Carregando…'));
    const NOME = p => ({ '/': 'Início', '/trabalhista/': 'Trabalhista', '/previdenciario/': 'Previdenciário', '/familia/': 'Família', '/civil/': 'Civil e consumidor',
      '/empresarial/': 'Empresarial', '/criminal/': 'Criminal', '/contato/': 'Contato', '/escritorio/': 'O escritório', '/calculadoras/': 'Calculadoras', '/blog/': 'Blog', '/atuacao/': 'Atuação' }[p] || (/^\/blog\//.test(p) ? 'Blog: ' + p.split('/')[2].replace(/-/g, ' ').slice(0, 40) : p));
    const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
    const montar = async (mes, salvar) => {
      try {
        const r = await api('marketing.funil', salvar ? { mes, salvar: true, linhas: salvar } : { mes });
        const inputs = [];
        const linhas = r.paginas.length ? r.paginas : [{ pagina: '/', whatsapp: 0, telefone: 0, anuncio: 0, conversas: 0, consultas: 0 }];
        const tab = h('table', { class: 'tabela funil-tab' },
          h('thead', {}, h('tr', {}, ['Página do site', 'Cliques (WhatsApp / telefone)', 'Conversas iniciadas', 'Consultas agendadas', 'De clique a consulta'].map(t => h('th', {}, t)))),
          h('tbody', {}, linhas.map(x => {
            const ic = h('input', { type: 'number', min: 0, value: x.conversas || '', class: 'num-mini', 'aria-label': 'Conversas ' + NOME(x.pagina) });
            const iq = h('input', { type: 'number', min: 0, value: x.consultas || '', class: 'num-mini', 'aria-label': 'Consultas ' + NOME(x.pagina) });
            inputs.push({ pagina: x.pagina, ic, iq });
            const cliques = x.whatsapp + x.telefone;
            return h('tr', {}, h('td', {}, NOME(x.pagina), h('div', { class: 'peq' }, x.pagina)),
              h('td', {}, String(cliques), h('div', { class: 'peq' }, `${x.whatsapp} WhatsApp · ${x.telefone} telefone${x.anuncio ? ' · ' + x.anuncio + ' do anúncio' : ''}`)),
              h('td', {}, ic), h('td', {}, iq), h('td', {}, pct(x.consultas, cliques)));
          })));
        const [a, m] = r.mes.split('-').map(Number), outro = d => new Date(Date.UTC(a, m - 1 + d, 15)).toISOString().slice(0, 7);
        corpo.replaceChildren(
          h('div', { class: 'barra' }, h('button', { type: 'button', class: 'link', onclick: () => montar(outro(-1)) }, '‹ mês anterior'),
            h('strong', {}, new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })),
            h('button', { type: 'button', class: 'link', onclick: () => montar(outro(1)) }, 'próximo mês ›')),
          h('div', { class: 'tabela-rolagem' }, tab),
          h('div', { class: 'acoes' }, botao('Salvar os totais do mês', async ev => { ev.target.disabled = true; await montar(r.mes, inputs.map(i => ({ pagina: i.pagina, conversas: i.ic.value, consultas: i.iq.value }))); avisar('Totais salvos.'); }, '')),
          h('p', { class: 'peq' }, 'Os cliques o site conta sozinho, sem identificar ninguém. Conversas iniciadas e consultas agendadas: a equipe lança só os TOTAIS do mês por página (sem nome nem detalhe do caso). Assim dá para ver quais temas trazem atendimento de verdade e onde vale investir no Google Ads.'));
      } catch (e) { corpo.replaceChildren(h('p', { class: 'erro' }, e.message), botao('Tentar de novo', () => montar(mes), 'sec')); }
    };
    montar(new Date().toISOString().slice(0, 7));
    return h('section', { class: 'caixa' }, h('h2', {}, '📊 Quais páginas trazem consultas (funil por página)'), corpo);
  }

  /** 8.9.0: blog no perfil do Google sozinho — passo a passo, testar e ligar (API do Perfil da Empresa). */
  function caixaBlogGoogle() {
    const raw = 'https://raw.githubusercontent.com/advogadajulianaraujo/site-araujo-advocacia/main/painel-backend/appsscript.json';
    const corpo = h('div', {}, h('p', { class: 'peq' }, 'Carregando…'));
    const quando = t => { const d = new Date(String(t).split(' · ')[0]); return isNaN(d) ? '' : d.toLocaleString('pt-BR'); };
    const desenhar = st => {
      const res = st.resultado;
      const msg = res ? (res.ok
        ? h('p', { class: 'gbp-ok' }, res.titulo ? `✓ Postado no perfil do Google: "${res.titulo}".` : res.local ? `✓ Ligação OK: perfil "${res.titulo || res.local}".` : '✓ Feito.')
        : h('p', { class: 'gbp-erro' }, '✗ Ainda não deu: ' + res.erro + '.')) : null;
      const acao = (rot, a, cls, conf) => botao(rot, async ev => {
        if (conf && !confirm(conf)) return;
        ev.target.disabled = true; ev.target.textContent = 'Aguarde…';
        try { desenhar(await api('marketing.gbp', { acao: a })); } catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = rot; }
      }, cls);
      corpo.replaceChildren(
        h('div', { class: 'gbp-zap' },
          h('p', {}, st.zapier
            ? ['✓ ', h('b', {}, 'O Zapier está postando o blog no perfil.'), ' A secretaria recebe só a tarefa do Instagram.']
            : ['Jeito mais rápido (sem esperar o Google): o Zapier lê o blog e posta sozinho. Feed do blog para colar no Zapier: ', h('code', {}, 'https://araujoadvocaciasc.com.br/blog/feed.xml')]),
          st.zapier ? acao('O Zapier parou (voltar a tarefa da secretaria)', 'semzapier', 'sec') : acao('✓ Já liguei o Zapier', 'zapier', 'sec')),
        h('p', {}, st.auto
          ? ['✓ ', h('b', {}, 'Ligado.'), ` Toda segunda-feira o texto novo do blog vai sozinho para o perfil "${st.nome || 'do escritório'}", com a imagem e o botão "Saiba mais". A secretaria recebe só a tarefa do Instagram.`]
          : 'Desligado. Enquanto estiver assim, toda segunda a secretaria recebe a tarefa "Postar no Google e no Instagram" com o texto pronto (como hoje).'),
        st.ultimo ? h('p', { class: 'peq' }, 'Última tentativa: ' + quando(st.ultimo) + ' — ' + (st.ultimo.split(' · ')[1] || '')) : null,
        msg,
        h('div', { class: 'acoes' },
          acao('1. Testar a ligação com o Google', 'conectar', 'sec'),
          st.auto ? acao('Desligar', 'desligar', 'sec') : acao('2. Ligar a postagem automática', 'ligar'),
          acao('Postar agora o texto mais recente', 'postar', 'sec', 'Postar agora no perfil do Google o texto mais recente do blog?')),
        h('details', { class: 'gbp-passos', open: !st.local },
          h('summary', {}, 'Passo a passo (uma vez só, depois que o Google aprovar)'),
          h('ol', {},
            h('li', {}, h('b', {}, 'Aprovação: '), 'espere o e-mail do Google aprovando o "Basic API Access". Para conferir: console.cloud.google.com › projeto "Araujo Advocacia Painel" › APIs e serviços › ', h('b', {}, 'Cotas'), ' — com "0 por minuto" ainda não foi aprovado.'),
            h('li', {}, h('b', {}, 'Ligar o painel ao projeto: '), 'no Google Cloud, menu ☰ › APIs e serviços › ', h('b', {}, 'Tela de consentimento OAuth'), ' › Externo › nome "Painel Araújo", seu e-mail › salvar e, no fim, ', h('b', {}, 'Publicar o app'), ' ("Em produção"). Depois, no Apps Script do painel › ⚙ Configurações do projeto › ', h('b', {}, 'Projeto do Google Cloud'), ' › Alterar projeto › cole o NÚMERO do projeto.'),
            h('li', {}, h('b', {}, 'Ativar 3 APIs: '), 'no Google Cloud › APIs e serviços › ', h('b', {}, 'Biblioteca'), ', procure e clique em Ativar: "My Business Account Management API", "My Business Business Information API" e "Google My Business API".'),
            h('li', {}, h('b', {}, 'Permissão no Apps Script: '), '⚙ Configurações do projeto › marque "Mostrar o arquivo appsscript.json". Abra o arquivo appsscript.json, apague tudo e cole o deste link: ', h('a', { href: raw, target: '_blank', rel: 'noopener' }, 'appsscript.json'), '. Salve, escolha a função ', h('b', {}, 'configurar'), ' e clique em Executar → Autorizar (se aparecer "app não verificado": Avançado › Acessar). Por fim, Implantar › Gerenciar implantações › lápis › Nova versão.'),
            h('li', {}, h('b', {}, 'Aqui no painel: '), 'aperte "1. Testar a ligação". Deu ✓ → aperte "2. Ligar a postagem automática". Se der ✗, a mensagem diz qual passo falta.'))));
    };
    api('marketing.gbp', {}).then(desenhar).catch(e => corpo.replaceChildren(h('p', { class: 'peq' }, 'Atualize o Code.gs do Google para usar este quadro (' + e.message + ').')));
    return h('section', { class: 'caixa' }, h('h2', {}, '📣 Blog no perfil do Google (automático)'), h('p', { class: 'peq' }, 'Abaixo: Zapier (funciona hoje) ou a ligação direta (depois da aprovação do Google). Use só um dos dois.'), corpo);
  }

  /** 8.7.0: Google Ads automático — script pronto (com a chave secreta) para colar em Google Ads › Ferramentas › Scripts. */
  function caixaGoogleAds(r) {
    const corpo = h('div', {});
    const montar = async nova => {
      const c = await api('marketing.adsConfig', nova ? { nova: true } : {});
      const script = `// Araújo Advocacia — manda ao painel o custo do Google Ads (roda todo dia)
// Não mexa nestas duas linhas:
var PAINEL = '${window.PAINEL_API_URL}';
var CHAVE = '${c.chave}';

function main() {
  var fuso = AdsApp.currentAccount().getTimeZone();
  var hoje = new Date(), ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  var de = Utilities.formatDate(ini, fuso, 'yyyy-MM-dd'), ate = Utilities.formatDate(hoje, fuso, 'yyyy-MM-dd');
  var q = 'SELECT campaign.name, segments.month, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions ' +
          'FROM campaign WHERE segments.date BETWEEN "' + de + '" AND "' + ate + '"';
  var linhas = [], it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next();
    linhas.push({ mes: String(r.segments.month).slice(0, 7), campanha: r.campaign.name, custo: Number(r.metrics.costMicros || 0) / 1000000,
      cliques: Number(r.metrics.clicks || 0), impressoes: Number(r.metrics.impressions || 0), conversoes: Number(r.metrics.conversions || 0) });
  }
  var resp = UrlFetchApp.fetch(PAINEL, { method: 'post', contentType: 'text/plain', muteHttpExceptions: true,
    payload: JSON.stringify({ acao: 'marketing.ads', dados: { chave: CHAVE, linhas: linhas } }) });
  Logger.log(linhas.length + ' linha(s) enviada(s). Resposta do painel: ' + resp.getContentText().slice(0, 200));
}`;
      const ta = h('textarea', { class: 'ads-script', readonly: true, rows: 12, 'aria-label': 'Script do Google Ads' }, script);
      corpo.replaceChildren(
        h('ol', { class: 'ads-passos' },
          h('li', {}, 'Entre no Google Ads › ', h('b', {}, 'Ferramentas'), ' (ícone de chave) › ', h('b', {}, 'Ações em massa'), ' › ', h('b', {}, 'Scripts'), ' › botão ', h('b', {}, '+'), '.'),
          h('li', {}, 'Apague o que vier escrito, cole o texto abaixo e dê o nome "Painel Araújo".'),
          h('li', {}, 'Clique em ', h('b', {}, 'Autorizar'), ' (o Google pede permissão para ler as campanhas e enviar ao painel) e depois em ', h('b', {}, 'Visualizar'), ' para testar.'),
          h('li', {}, 'Volte à lista de scripts e, em ', h('b', {}, 'Frequência'), ', escolha ', h('b', {}, 'Diariamente'), '. Pronto: o investimento entra sozinho aqui.'),
          h('li', {}, 'Dica: coloque a ÁREA no nome de cada campanha (ex.: "Trabalhista — Tubarão", "Família", "Previdenciário"), para o painel separar o retorno por área.')),
        ta,
        h('div', { class: 'acoes' }, botao('Copiar o script', async () => { try { await navigator.clipboard.writeText(script); avisar('Script copiado.'); } catch (e) { ta.select(); document.execCommand('copy'); avisar('Script copiado.'); } }),
          botao('Trocar a chave secreta', async () => { if (!confirm('Trocar a chave? O script antigo para de funcionar até você colar o novo no Google Ads.')) return; await montar(true); avisar('Chave trocada: cole o script novo no Google Ads.'); }, 'sec')),
        h('p', { class: 'peq' }, 'A chave secreta só serve para o Google Ads mandar os números de investimento; ela não dá acesso a nada do painel. Não mande este texto para outras pessoas.'));
    };
    return h('section', { class: 'caixa' }, h('h2', {}, '⚡ Ligar o Google Ads (automático)'),
      h('p', {}, r.adsUltima ? ['✓ Ligado. Último envio: ', h('b', {}, new Date(r.adsUltima.split(' · ')[0]).toLocaleString('pt-BR')), ' (' + (r.adsUltima.split(' · ')[1] || '') + ').'] : 'Ainda não ligado. Com o script, o custo, os cliques e as conversões de cada campanha entram aqui todos os dias, sem digitar nada.'),
      corpo.childNodes.length ? corpo : h('div', {}, botao(r.adsUltima ? 'Ver o script de novo' : 'Mostrar o script e o passo a passo', async ev => { ev.target.remove(); try { await montar(false); } catch (e) { avisar(e.message, true); } }, r.adsUltima ? 'sec' : ''), corpo));
  }

  /** 8.6.0: resultados do mês — contratos fechados, clientes novos e processos finalizados, com os nomes. */
  function blocoResultados(r) {
    const dm = r.doMes; if (!dm) return null;
    const [ano, m] = dm.mes.split('-').map(Number);
    const mesNome = new Date(Date.UTC(ano, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const outro = d => { const x = new Date(Date.UTC(ano, m - 1 + d, 15)); return x.toISOString().slice(0, 7); };
    const lista = (itens, linha, vazio) => itens.length ? h('ul', { class: 'res-lista' }, itens.slice(0, 40).map(linha), itens.length > 40 ? h('li', { class: 'peq' }, `+ ${itens.length - 40}`) : null) : h('p', { class: 'peq' }, vazio);
    const col = (ico, titulo, n, corpo) => h('div', { class: 'res-col' }, h('div', { class: 'res-num' }, h('span', {}, ico), h('b', {}, String(n)), h('span', {}, titulo)), corpo);
    return h('section', { class: 'caixa res-mes' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, 'Resultados de ' + mesNome),
        h('div', {}, h('a', { href: '#/relatorios?mes=' + outro(-1) }, '‹ mês anterior'), dm.mes < r.hoje.slice(0, 7) ? [' · ', h('a', { href: '#/relatorios?mes=' + outro(1) }, 'próximo mês ›')] : null)),
      h('div', { class: 'res-grade' },
        col('✍', 'contratos fechados', dm.contratos.length, lista(dm.contratos, x => h('li', {}, h('a', { href: '#/cliente/' + x.cliente_id }, x.nome), h('span', { class: 'peq' }, ` · ${dataBR(x.quando).slice(0, 5)}${x.tipo_acao ? ' · ' + x.tipo_acao : ''}${x.por ? ' · marcou ' + x.por : ''}`)), 'Nenhum contrato marcado como assinado neste mês.')),
        col('🙋', 'clientes novos', dm.clientes.length, lista(dm.clientes, x => h('li', {}, h('a', { href: '#/cliente/' + x.id }, x.nome), h('span', { class: 'peq' }, ` · ${dataBR(x.quando).slice(0, 5)}${x.area ? ' · ' + x.area : ''}`)), 'Nenhum cliente cadastrado neste mês.')),
        col('🏁', 'processos finalizados', dm.finalizados.length, lista(dm.finalizados, x => h('li', {}, h('a', { href: '#/processo/' + x.id }, x.cliente || x.numero), h('span', { class: 'peq' }, ` · ${dataBR(x.quando).slice(0, 5)}${x.area ? ' · ' + x.area : ''}`)), 'Nenhum processo finalizado neste mês.'))));
  }

  /* ---------- andamentos do processo (DataJud) ---------- */

  /** 8.7.0: "Resumir o processo com IA" — texto simples para o cliente (com WhatsApp) e nota para a equipe. */
  function blocoResumoIA(p) {
    const corpo = h('div', {});
    const bt = botao('✨ Resumir o processo com IA', async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Lendo o processo…';
      try {
        const r = await api('ia.resumirProcesso', { id: p.id });
        let tel = telefoneWhats(r.telefone || ''); if (tel && tel.length <= 11) tel = '55' + tel;
        const msg = `Olá, ${nomeProprioJS(primeiroNome(r.nome)) || 'tudo bem'}! Aqui é do escritório Araújo Advocacia. Atualização do seu processo:\n\n${r.cliente}\n\nQualquer dúvida, estamos à disposição.`;
        corpo.replaceChildren(
          h('div', { class: 'ia-caixa' }, h('p', {}, h('strong', {}, 'Para o cliente: '), r.cliente || '—'),
            tel && r.cliente ? h('a', { class: 'btn mini wa', href: 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener noreferrer', onclick: () => registrarWhats({ numero: p.numero, cliente: r.nome }, 'atualização do processo') }, 'Mandar ao cliente no WhatsApp') : null),
          r.equipe ? h('div', { class: 'ia-caixa ia-estimativa' }, h('p', {}, h('strong', {}, 'Para a equipe: '), r.equipe)) : '',
          h('p', { class: 'peq' }, 'Resumo automático (Gemini, sem nomes nem documentos). Confira antes de mandar; a IA não muda prazo.'));
        ev.target.textContent = 'Resumir de novo';
      } catch (e) { avisar(e.message, true); ev.target.textContent = '✨ Resumir o processo com IA'; }
      ev.target.disabled = false;
    }, 'sec');
    const atalhos = h('div', { class: 'ia-atalhos' },
      h('a', { class: 'btn mini sec', href: '#/transcricao?tipo=audiencia&processo=' + p.id }, '🎙 Transcrever / resumir audiência'));
    return h('section', { class: 'caixa' }, h('div', { class: 'bloco-cab' }, h('h2', {}, 'Como está o processo?'), bt), atalhos, corpo);
  }
  /** 8.7.0: linha do tempo — andamentos, intimações, prazos, audiências, tarefas e documentos numa lista só. */
  function blocoLinhaTempo(p) {
    const ICO = { andamento: '📄', intimacao: '📨', prazo: '⏱', ato: '⚖', tarefa: '☑', documento: '🖋' };
    const NOME = { andamento: 'Andamento', intimacao: 'Intimação', prazo: 'Prazo', ato: 'Audiência/perícia', tarefa: 'Tarefa', documento: 'Documento/WhatsApp' };
    const lista = h('div', {}, h('p', { class: 'peq' }, 'Abra para ver tudo o que aconteceu neste processo.'));
    let carregou = false;
    const det = h('details', { class: 'caixa linha-tempo', ontoggle: async () => {
      if (!det.open || carregou) return; carregou = true;
      lista.replaceChildren(h('p', { class: 'peq' }, 'Carregando…'));
      try {
        const r = await api('processos.linhaTempo', { id: p.id });
        lista.replaceChildren(r.itens.length ? h('ol', { class: 'lt-lista' }, r.itens.map(x => h('li', { class: 'lt-' + x.tipo },
          h('span', { class: 'lt-ico', title: NOME[x.tipo] }, ICO[x.tipo] || '•'),
          h('div', {}, h('div', { class: 'peq' }, new Date(x.quando).toLocaleDateString('pt-BR') + ' · ' + (NOME[x.tipo] || x.tipo)),
            x.link ? h('a', { href: x.link }, x.titulo) : h('strong', {}, x.titulo), x.detalhe ? h('div', { class: 'peq' }, x.detalhe) : null)))) : h('p', {}, 'Nada registrado ainda.'),
          r.total > r.itens.length ? h('p', { class: 'peq' }, `Mostrando os ${r.itens.length} mais recentes de ${r.total}.`) : '');
      } catch (e) { lista.replaceChildren(h('p', { class: 'erro' }, e.message)); carregou = false; }
    } }, h('summary', {}, h('strong', {}, '🕑 Linha do tempo do processo')), lista);
    return det;
  }

  function blocoAndamentos(p) {
    const caixa = h('section', { class: 'caixa andamentos' }, h('div', { class: 'cab' }, h('h2', {}, 'Andamentos'),
      h('span', { class: 'peq' }, 'Base pública do CNJ (DataJud). Atualiza sozinho; pode atrasar alguns dias e não mostra processos em segredo de justiça.')));
    const corpo = h('div', {}, h('p', { class: 'peq' }, 'Carregando andamentos…'));
    caixa.append(corpo);
    const desenhar = (r, btn) => {
      const lista = r.lista || [];
      corpo.replaceChildren(...[
        r.erro ? h('p', { class: 'erro' }, r.erro) : null,
        !r.noDatajud ? h('p', { class: 'peq' }, 'Este tribunal não está no DataJud. Veja os andamentos no sistema do tribunal.')
          : r.naoEncontrado ? h('p', { class: 'peq' }, 'O DataJud não tem este processo (pode estar em segredo de justiça ou ainda não ter sido enviado ao CNJ).')
          : !lista.length ? h('p', { class: 'peq' }, r.em ? 'Sem andamentos no DataJud.' : 'Ainda não consultado. Clique em "Buscar andamentos agora".') : null,
        lista.length ? h('ol', { class: 'linha-tempo' }, lista.map(m => h('li', {}, h('time', {}, new Date(m.d).toLocaleDateString('pt-BR')), ' ', m.n, m.g && m.g !== 'G1' ? h('span', { class: 'tag' }, m.g === 'G2' ? '2º grau' : m.g) : null))) : null,
        h('div', { class: 'barra mt' }, r.classe ? h('span', { class: 'peq' }, 'Classe: ' + r.classe) : null,
          r.em ? h('span', { class: 'peq' }, 'Consultado em ' + new Date(r.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) : null,
          r.noDatajud ? btn : null)].filter(Boolean));
    };
    const btn = botao('Buscar andamentos agora', async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Consultando o CNJ…';
      try { desenhar(await api('processos.andamentos', { id: p.id, atualizar: true }), btn); avisar('Andamentos atualizados.'); }
      catch (e) { avisar(e.message, true); }
      btn.disabled = false; btn.textContent = 'Buscar andamentos agora';
    }, 'sec mini');
    api('processos.andamentos', { id: p.id }).then(r => desenhar(r, btn), e => corpo.replaceChildren(h('p', { class: 'erro' }, e.message)));
    return caixa;
  }

  /* ---------- integrações: IA (Gemini) e resumo por e-mail ---------- */

  function caixaIA() {
    const corpo = h('div', {});
    const desenhar = c => {
      const f = h('form', { class: 'campos', novalidate: true },
        campo('chave', c.temChave ? 'Chave do Gemini (já cadastrada; cole outra para trocar)' : 'Chave do Gemini (Google AI Studio)', '', { tipo: 'password', auto: 'off', dica: c.temChave ? '••••••••' : 'cole a chave copiada' }),
        campo('modelo', 'Modelo', c.modelo, { opcoes: [['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite (mais barato)'], ['gemini-3.5-flash', 'gemini-3.5-flash (melhor)']].concat(/^gemini-3\.5-flash(-lite)?$/.test(c.modelo) ? [] : [[c.modelo, c.modelo + ' (escolhido sozinho)']]) }),
        campo('ligada', 'Situação', c.ligada ? 'sim' : 'nao', { opcoes: [['sim', 'Ligada (resume no robô de 6 em 6 h)'], ['nao', 'Desligada']] }),
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn sec' }, 'Salvar'),
          c.temChave ? botao('Testar', async ev => { ev.target.disabled = true; try { const x = await api('ia.config', { testar: true }); avisar('Funcionou: ' + x.teste); } catch (e) { avisar(e.message, true); } ev.target.disabled = false; }, 'sec') : null,
          c.temChave ? botao('Resumir agora', async ev => { ev.target.disabled = true; ev.target.textContent = 'Resumindo…'; try { const x = await api('ia.config', { rodar: true }); avisar(`${x.rodada.feitas || 0} intimação(ões) resumida(s).` + (x.rodada.erro ? ' Problema: ' + x.rodada.erro : '')); desenhar(x); } catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'sec') : null,
          c.temChave ? botao('Apagar a chave', async () => { if (!confirm('Apagar a chave e desligar a IA?')) return; desenhar(await api('ia.config', { chave: '' })); avisar('Chave apagada.'); }, 'sec') : null),
        h('p', { class: 'erro largo' }));
      aoEnviar(f, async fd => {
        const d = { modelo: fd.get('modelo'), ligada: fd.get('ligada') === 'sim' };
        if (fd.get('chave')) d.chave = fd.get('chave');
        desenhar(await api('ia.config', d)); avisar('Configuração da IA salva.');
      });
      corpo.replaceChildren(
        h('p', {}, 'O robô manda o texto das intimações novas (principalmente as do DJEN, que vêm com o teor) para o Gemini, do Google, e guarda um resumo de 2 frases com a providência. ',
          h('strong', {}, 'A IA nunca muda prazos: '), 'o resumo aparece ao lado do prazo para a advogada conferir.'),
        h('p', { class: 'peq' }, 'Antes de enviar, o painel troca o nome das partes por [PARTE] e o número por [PROCESSO], e tira CPF, CNPJ, RG, telefones, e-mails, CEP e dados bancários. Funciona no plano gratuito (o Google pode usar os textos, já sem nomes); no plano pago ele não usa. Avisos do PJe que dizem só "documento sigiloso" não têm o que resumir.'),
        h('ul', { class: 'lista-seg' },
          h('li', { class: c.temChave && c.ligada ? 'ok' : 'alerta' }, h('strong', {}, 'Situação: '), c.temChave ? (c.ligada ? 'ligada' : 'desligada') : 'sem chave cadastrada'),
          c.ultima ? h('li', { class: 'ok' }, h('strong', {}, 'Última rodada: '), c.ultima.replace(/^(\S+)/, iso => new Date(iso).toLocaleString('pt-BR'))) : null,
          c.erro ? h('li', { class: 'alerta' }, h('strong', {}, 'Último problema: '), c.erro) : null),
        f);
    };
    const det = secao('Resumo das intimações por IA (Gemini)', () => { api('ia.config', {}).then(desenhar, e => corpo.replaceChildren(h('p', { class: 'erro' }, e.message))); return corpo; }, false);
    return det;
  }

  function caixaEmailDiario(lista) {
    const comEmail = lista.filter(u => u.ativo === 'sim' && u.email && u.resumo_email !== 'nao');
    return h('section', { class: 'caixa' }, h('h2', {}, 'Resumo do dia por e-mail'),
      h('p', {}, 'Em todo dia útil, por volta das 7h, cada pessoa com e-mail cadastrado recebe: prazos vencidos, prazos de hoje e de amanhã, audiências e perícias do dia e as tarefas dela. A administração recebe também as parcelas e contas do dia.'),
      h('p', { class: 'peq' }, comEmail.length ? 'Recebem hoje: ' + comEmail.map(u => `${u.nome} (${u.email})`).join(', ') + '.' : 'Ninguém recebe ainda: clique num usuário abaixo e preencha o e-mail.'),
      h('div', { class: 'barra' }, botao('Mandar um teste para mim agora', async ev => {
        ev.target.disabled = true;
        try { const r = await api('resumo.email.testar', {}); avisar('Enviado para ' + r.enviado + '. Confira a caixa de entrada.'); } catch (e) { avisar(e.message, true); }
        ev.target.disabled = false;
      }, 'sec')));
  }

  /* ---------- rotas ---------- */

  async function rota() {
    const [caminho, qs] = (location.hash.slice(2) || '').replace(/[.,;\s]+$/, '').split('?');
    const params = new URLSearchParams(qs || '');
    const [tela, id] = caminho.split('/');
    if (!sessao) {
      if (tela === 'primeiro-acesso') telaPrimeiroAcesso(); else telaLogin();
      return;
    }
    if (!!montarTopo.modo !== (!!sessao.usuario.pode.future && modoFuture())) montarTopo();
    const aba = { cliente: 'clientes', processo: 'processos', prazo: 'prazos', compromisso: 'agenda', honorario: 'financeiro' }[tela] || tela || 'inicio';
    marcarAba(aba);
    if (!rota.adiantou) { rota.adiantou = true; setTimeout(() => ['inicio', 'clientes', 'prazos', 'tarefas'].forEach(preBuscar), 1200); }
    sujo = false;
    const detAg = document.getElementById('ag-detalhe'); if (detAg) detAg.hidden = true;
    document.querySelectorAll('dialog.g-dialogo[open]').forEach(d => d.close()); // 8.12: janela aberta não fica por cima da tela nova
    window.scrollTo(0, 0);
    const n = ++rotaN;
    vezAtual = n;
    queueMicrotask(() => { if (vezAtual === n) vezAtual = 0; });
    try {
      switch (tela) {
        case 'clientes': await telaClientes(params); break;
        case 'cliente': await telaCliente(id, params); break;
        case 'modelos': await telaModelos(params); break;
        case 'processos': await telaProcessos(params); break;
        case 'processo': await telaProcesso(id, params); break;
        case 'usuarios': await telaUsuarios(); break;
        case 'senha': telaSenha(); break;
        case 'agenda': await telaAgenda(params); break;
        case 'audiencias': await telaAudiencias(params); break;
        case 'compromisso': await telaCompromisso(params); break;
        case 'prazos': await telaPrazos(params); break;
        case 'prazo': await telaPrazo(id, params); break;
        case 'financeiro': if (id === 'receber') await telaAReceber(params); else if (id === 'caixa') await telaCaixa(params); else await telaFinanceiro(params); break;
        case 'tarefas': await telaTarefas(params); break;
        case 'relatorios': await telaRelatorios(params); break;
        case 'marketing': await telaMarketing(params); break;
        case 'organizar': await telaOrganizar(params); break;
        case 'crm': if (!sessao.usuario.pode.usuarios) { mostrar(h('div', { class: 'nota alerta' }, 'O CRM / Funil é só da administração.')); break; } await G().telaCrm(params); break;
        case 'conversas': if (!sessao.usuario.pode.usuarios) { mostrar(h('div', { class: 'nota alerta' }, 'As conversas do WhatsApp são só da administração.')); break; } await G().telaConversas(params); break;
        case 'calculadoras': await G().telaCalculadoras(params); break;
        case 'transcricao': await G().telaTranscricao(params); break;
        case 'padroes': await G().telaPadroes(params); break;
        case 'recibos': location.replace('#/financeiro?ver=recibos'); return;
        case 'pecas': case 'prompts': location.replace('#/transcricao'); return;
        case 'honorario': await telaHonorario(id, params); break;
        case 'future':
          if (!sessao.usuario.pode.future) { mostrar(h('div', { class: 'nota alerta' }, 'Você não tem acesso ao painel do Edifício Future.')); break; }
          if (!window.FUTURE) { mostrar(h('div', { class: 'nota alerta' }, 'Atualize a página (F5) para abrir o painel do Edifício Future.')); break; }
          await window.FUTURE.tela(caminho.split('/').slice(1).map(decodeURIComponent), params); break;
        default: await telaInicio(); extrasDoInicio(n);
      }
    } catch (e) {
      if (e && e.obsoleto) return;
      if (sessao) mostrar(h('div', { class: 'nota alerta' }, h('p', {}, e.message), botao('Tentar de novo', () => rota())));
    }
  }

  /* 8.12.2: depois do Início: aviso do funil (só administração) e, bem discreto no fim, o guia para quem chegou agora. */
  function extrasDoInicio(n) {
    if (n !== rotaN || !sessao) return;
    const fim = h('p', { class: 'ini-guia' }, h('a', { href: '#/padroes' }, '📘 Chegou agora no escritório? Veja os padrões operacionais (como trabalhamos)'));
    app.append(fim);
    if (sessao.usuario.pode.usuarios && window.GESTAO) api('whats.conversas', {}).then(r => {
      if (n !== rotaN || !r || !r.itens) return;
      const esperando = r.itens.filter(c => +c.nao_lidas && c.estado === 'humano');
      if (!esperando.length) return;
      const faixa = h('a', { class: 'ini-crm ini-wz', href: '#/conversas' }, h('strong', {}, `💬 WhatsApp: ${esperando.length} conversa${esperando.length === 1 ? '' : 's'} esperando a equipe`),
        h('span', {}, ' · ' + esperando.slice(0, 3).map(c => (c.nome || c.telefone).split(' ')[0]).join(', ')));
      const topo = app.querySelector('.ini-topo'); if (topo) topo.after(faixa); else app.prepend(faixa);
    }).catch(() => {});
    if (sessao.usuario.pode.usuarios && window.GESTAO) api('crm.listar', {}).then(r => {
      if (n !== rotaN) return;
      const hoje = hojeISO();
      const abertos = r.leads.filter(l => !['ganho', 'perdido'].includes(l.etapa));
      const responder = abertos.filter(l => l.etapa === 'novo' || (l.proxima_data && l.proxima_data <= hoje));
      if (!responder.length) return;
      const faixa = h('a', { class: 'ini-crm', href: '#/crm' }, h('strong', {}, `📈 Funil: ${responder.length} contato${responder.length === 1 ? '' : 's'} para responder hoje`),
        h('span', {}, ' · ' + responder.slice(0, 3).map(l => l.nome.split(' ')[0]).join(', ') + (responder.length > 3 ? '…' : '') + ' — abrir o CRM'));
      const topo = app.querySelector('.ini-topo'); if (topo) topo.after(faixa); else app.prepend(faixa);
    }).catch(() => {});
  }

  /* 8.12.2 (pedido da usuária): ao entrar numa aba o menu da esquerda recolhe (só os ícones) e a tela fica maior.
     Passar o mouse no menu abre por cima; o botão ☰ do topo do menu fixa aberto/fechado. */
  // 8.13.1 (pedido da usuária: "não quero que abra e feche sozinho"): só o botão ☰ do topo abre/fecha; a escolha fica no computador
  (() => {
    const lat = document.getElementById('lateral'); if (!lat) return;
    let rec = false; try { rec = localStorage.getItem('menu_recolhido') === '1'; } catch (e) { /* ok */ }
    document.body.classList.toggle('menu-recolhido', rec);
    const bt = h('button', { type: 'button', class: 'menu-alternar', 'aria-label': 'Abrir ou fechar o menu', title: 'Abrir / fechar o menu', onclick: () => {
      const r = document.body.classList.toggle('menu-recolhido'); try { localStorage.setItem('menu_recolhido', r ? '1' : '0'); } catch (e) { /* ok */ }
    } }, h('span'), h('span'), h('span'));
    lat.prepend(bt);
  })();

  /* 8.12: telas de gestão (gestao.js). Sem o arquivo (cache velho), pede para atualizar. */
  function G() { if (!window.GESTAO) throw new Error('Atualize a página (F5) para abrir esta tela.'); return window.GESTAO; }
  /* Ferramentas do painel para o módulo do Edifício Future (future.js) e as telas de gestão (gestao.js) */
  window.PAINEL_KIT = { ditado, h, s, api, apiFresco, mostrar, avisar, carregando, campo, aoEnviar, botao, tabela, reais, dataBR, hojeISO, secao, telefoneWhats, grafRosca, grafBarras, comSetas,
    nomeProprioJS, primeiroNome, icone, get sessao() { return sessao; }, rota: () => rota() };

  window.addEventListener('hashchange', rota);

  // Segurança: o painel nunca abre dentro de outro site (evita golpe de "clique escondido")
  if (window.top !== window.self) { document.body.replaceChildren(); window.top.location = window.self.location.href; }

  // Segurança: 1 hora sem mexer no painel encerra a sessão
  const INATIVO_MS = 60 * 60 * 1000; // 8.21 (pedido da usuária): 1 hora parado
  let ultimoUso = Date.now();
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (sessao && Date.now() - ultimoUso > INATIVO_MS) { sair(false); avisar('Você ficou 1 hora sem usar o painel. Por segurança, entre de novo.', true); }
  }, 60 * 1000);

  // Início e Intimações se atualizam sozinhos a cada 10 minutos (o robô lê de 6 em 6 horas)
  setInterval(() => {
    if (!sessao || sujo || document.hidden) return;
    if (!/^#\/(prazos|inicio)?(\?|$)/.test(location.hash || '#/')) return;
    const y = window.scrollY;
    rota().then(() => window.scrollTo(0, y));
  }, 10 * 60 * 1000);

  sessao = ler('painel_sessao');
  if (sessao) recuperarMemoria();
  if (sessao) montarTopo(); else document.body.classList.add('sem-sessao');
  rota().then(() => { if (sessao) preaquecer(); });
})();
