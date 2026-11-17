/* Painel — leitura rápida pelo banco novo (Supabase), 8.28.
   As telas de leitura (clientes, processos, prazos, intimações, tarefas, cobranças…) pegam as linhas no Supabase e fazem a conta
   AQUI, com as mesmas funções do Code.gs (painel/motor.js, gerado). Gravar continua sempre pelo Apps Script, que manda a mudança
   ao Supabase antes de responder.
   Segurança: o navegador só tem a chave PÚBLICA do projeto e um código de sessão do banco dado pelo Apps Script no login; quem
   decide o que cada perfil lê é o Supabase (função painel_ler). 8.38: o que já foi lido fica guardado neste computador CRIPTOGRAFADO
   (IndexedDB, AES-GCM; a chave só vem do Supabase depois do login) — sem entrar, ninguém lê.
   Volta sozinho para a planilha (Apps Script) quando: o banco não respondeu a tempo, deu erro, alguma mudança ainda não chegou
   ("pendente"), a conta precisou de algo que só o Google tem (agenda, Gmail…), ou o motor é de outra versão. */
(() => {
  'use strict';
  const M = () => window.PAINEL_MOTOR;
  let S = null;            // sessão do banco: { url, chave, token, expira, u, permissoes, asaas, versao, tarefasFiltradasOk }
  let pedindo = null;      // pedido da sessão em andamento
  let chamarApps = null;   // (acao, dados) → Promise, do painel.js
  let falhasSeguidas = 0, desligadoAte = 0, motivoOff = '', ultimaFalha = 0;
  const rotaFora = new Map();  // rota → motivo (esta aba vai sempre ao Apps Script para ela)
  /* 8.33 velocidade: o que cada tela precisa do Google fica lembrado NESTE computador por 12 h (por perfil e versão), para não
     tentar o caminho que não dá a cada F5 ou aba nova (antes: navegador → função do Supabase → Google, um depois do outro).
     Guarda só nomes de telas; nenhum dado. */
  const FORA_MS = 12 * 3600e3;
  function chaveFora() { return 'banco_fora_' + ((S && S.u && S.u.perfil) || '') + '_' + (M() ? M().versao : ''); }
  function lerFora() { try { return JSON.parse(localStorage.getItem(chaveFora()) || '{}'); } catch (e) { return {}; } }
  function lembrarFora(tipo, acao) { try { const x = lerFora(); x[tipo + ':' + acao] = Date.now(); localStorage.setItem(chaveFora(), JSON.stringify(x)); } catch (e) { /* privado */ } }
  try { Object.keys(localStorage).filter(k => /^banco_fora_/.test(k)).forEach(k => { const o = JSON.parse(localStorage.getItem(k) || '{}'); let mud = false; ['m:agenda.listar', 'm:inicio.extras', 'm:inicio.acoes', 'm:audiencias.listar'].forEach(c => { if (c in o) { delete o[c]; mud = true; } }); if (mud) localStorage.setItem(k, JSON.stringify(o)); }); } catch (e) { /* ok */ }
  function foraLembrado(tipo, acao) { const t = lerFora()[tipo + ':' + acao]; return !!t && Date.now() - t < FORA_MS; }
  // motivos que passam sozinhos (não vale lembrar): mudança chegando, desligado, versão, sessão, erro de momento
  const PASSAGEIRO = /^(há mudança|motor do Supabase desligado|versões|abas demais|erro|sessão|entrar)/;
  const cache = new Map();     // tabela → { linhas: Map(chave → linha), desde, pronto, n, em }
  const emVoo = new Map();     // sincronizações em andamento (várias telas pedem a mesma tabela juntas)
  const medidas = [];          // { acao, fonte: 'banco'|'google', ms, quando, obs }
  const FRESCO_MS = 180000;   // 8.38: até 3 min a tela abre com o que já tem e confere por trás
  const NO_LOTE_MS = 20000;    // 8.35.8: tabela lida há menos disso não é pedida de novo (antes 1,5 s: cada tela relia tudo). Gravou → envelhecer()
  const TEMPO_PRIMEIRA = 30000, TEMPO_DEPOIS = 8000; // passou disso → planilha (8.35.8: a 1ª carga real leva ~10 s; o Google leva 10–80 s)

  const guardar = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privado */ } };
  const lerS = k => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const snake = a => a.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const aprendidas = (() => { try { return JSON.parse(localStorage.getItem('banco_tabelas') || '{}'); } catch (e) { return {}; } })();

  function medir(acao, fonte, ms, obs) {
    medidas.push({ acao, fonte, ms: Math.round(ms), quando: Date.now(), obs: obs || '' });
    if (medidas.length > 400) medidas.splice(0, medidas.length - 400);
  }
  /** O fuso do computador precisa ser o de Brasília (as contas de data do Code.gs usam o horário local). */
  function fusoOk() {
    const agora = new Date(), jan = new Date(agora.getFullYear(), 0, 1), jul = new Date(agora.getFullYear(), 6, 1);
    return agora.getTimezoneOffset() === 180 && jan.getTimezoneOffset() === 180 && jul.getTimezoneOffset() === 180;
  }
  function pronto() {
    if (!S || !M()) return false;
    if (Date.now() < desligadoAte) return false;
    if (S.expira && Date.parse(S.expira) < Date.now()) { S = null; guardar('painel_banco', null); return false; }
    return true;
  }

  /* 8.37 (painel travando, 16/11): o painel publicado pode estar uma versão À FRENTE do Code.gs (a atualização do Google demora ou falha).
     Antes isso desligava o banco e CADA tela ia duas vezes ao Google (banco.sessao recusada + a tela). Agora o painel carrega o motor da
     MESMA versão do servidor (/painel/motor-<versão>.js, guardado ao publicar uma versão nova) e segue rápido; sem esse arquivo, o banco
     fica desligado por 10 min sem perguntar de novo (uma ida ao Google por tela, como na planilha). */
  const motoresPedidos = {}, motores = {};
  if (M()) motores[M().versao] = M(); // o motor publicado (motor.js) fica guardado: dá para voltar a ele quando o Google se atualizar
  function carregarMotor(ver) {
    if (!/^\d+\.\d+\.\d+$/.test(ver || '')) return Promise.resolve(false);
    if (M() && M().versao === ver) return Promise.resolve(true);
    if (motores[ver]) { window.PAINEL_MOTOR = motores[ver]; return Promise.resolve(true); }
    if (motoresPedidos[ver]) return motoresPedidos[ver];
    const anterior = M();
    return (motoresPedidos[ver] = new Promise(ok => {
      const s = document.createElement('script'); s.src = '/painel/motor-' + ver + '.js'; s.async = true;
      s.onload = () => { const m = M(); if (m && m.versao === ver) { motores[ver] = m; ok(true); } else { window.PAINEL_MOTOR = anterior; ok(false); } };
      s.onerror = () => { delete motoresPedidos[ver]; window.PAINEL_MOTOR = anterior; ok(false); };
      document.head.append(s);
    }));
  }
  const versaoPublicada = () => Object.keys(motores)[0] || '';
  // versão do servidor lembrada neste computador: o motor certo já vem carregado antes da entrada
  const VER_SERV = 'painel_versao_servidor';
  function lembrarVersao(v) { try { if (v) localStorage.setItem(VER_SERV, v); } catch (e) { /* privado */ } }
  try { const v0 = localStorage.getItem(VER_SERV); if (v0 && M() && v0 !== M().versao) carregarMotor(v0); } catch (e) { /* privado */ }
  function desligarPor(min, motivo) { motivoOff = motivo; desligadoAte = Date.now() + min * 60000; return null; }

  /* ---------- 8.38: cópia das tabelas guardada NESTE computador, criptografada ----------
     Antes, cada entrada baixava de novo todas as tabelas (~7 MB: intimações, processos, clientes…) e só depois mostrava o Início
     (7 a 11 s), e fechar o navegador jogava tudo fora. Agora o que já foi lido fica no IndexedDB criptografado (AES-GCM) com uma chave
     que só sai do Supabase com uma sessão válida (painel_cache_chave: uma por pessoa; muda ao trocar senha/perfil, desativar ou
     "Desconectar agora" — aí a cópia antiga fica ilegível e é apagada). Na entrada seguinte só vem o que MUDOU desde a última vez. */
  let guardadoP = null, guardarTimer = null, chaveCache = null, copiaSuja = false;
  const IDB_NOME = 'painel_cache';
  function idb() {
    return new Promise((ok, nao) => {
      try { const r = indexedDB.open(IDB_NOME, 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => ok(r.result); r.onerror = () => nao(r.error); }
      catch (e) { nao(e); }
    });
  }
  async function idbFazer(modo, fn) {
    const db = await idb();
    try { return await new Promise((ok, nao) => { const tx = db.transaction('c', modo), st = tx.objectStore('c'), r = fn(st); tx.oncomplete = () => ok(r && r.result); tx.onerror = () => nao(tx.error); tx.onabort = () => nao(tx.error); }); }
    finally { db.close(); }
  }
  const hexBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
  function assinaturaCache() { return JSON.stringify([S.versao, S.u && S.u.id, S.u && S.u.perfil, S.permissoes || {}, S.tarefasFiltradasOk || []]); }
  async function pegarChave() {
    const cab = { apikey: S.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(S.chave)) cab.Authorization = 'Bearer ' + S.chave;
    const r = await fetch(S.url + '/rest/v1/rpc/painel_cache_chave', { method: 'POST', headers: cab, body: JSON.stringify({ p_token: S.token }), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!r.ok) throw new Error('chave da cópia: ' + r.status);
    const j = await r.json();
    const k = await crypto.subtle.importKey('raw', hexBytes(j.chave), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { k, nome: 'c_' + j.nome };
  }
  async function carregarGuardado() {
    if (!window.indexedDB || !window.crypto || !crypto.subtle) return;
    const t0 = performance.now();
    chaveCache = await pegarChave();
    // as cópias de outras pessoas/sessões antigas neste computador: só a desta pessoa e desta chave fica
    const nomes = await idbFazer('readonly', st => st.getAllKeys());
    const velhas = (nomes || []).filter(n => n !== chaveCache.nome && /^c_/.test(n));
    const reg = await idbFazer('readonly', st => st.get(chaveCache.nome));
    if (velhas.length) idbFazer('readwrite', st => { velhas.forEach(n => st.delete(n)); }).catch(() => {});
    if (!reg || !reg.d) return;
    let txt;
    try { txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: reg.iv }, chaveCache.k, reg.d)); }
    catch (e) { idbFazer('readwrite', st => st.delete(chaveCache.nome)).catch(() => {}); return; }
    const g = JSON.parse(txt);
    if (g.assinatura !== assinaturaCache() || Date.now() - g.em > 20 * 86400e3) return; // outra versão/permissão ou muito velha: baixa tudo de novo
    let n = 0;
    Object.keys(g.tabelas).forEach(t => {
      const x = g.tabelas[t], ja = cache.get(t);
      if (ja && ja.pronto) return;
      const c = { linhas: new Map(), cols: new Set(x.cols), desde: x.desde, n: x.n, em: 0, pronto: true, lista: null }; // em = 0: a 1ª leitura busca o que mudou
      x.linhas.forEach(o => c.linhas.set(chaveDaLinha(c, o), o));
      cache.set(t, c); n++;
    });
    medir('copia-local', 'computador', performance.now() - t0, n + ' tabelas');
  }
  function aoTerSessao() {
    if (guardadoP) return;
    // até 4 s: se a cópia demorar (computador lento), segue baixando do banco como antes
    guardadoP = Promise.race([carregarGuardado().catch(e => medir('copia-local', 'falhou', 0, String(e && e.message || e).slice(0, 100))),
      new Promise(ok => setTimeout(ok, 4000))]);
  }
  function guardarDepois() {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(() => { guardarAgora().catch(() => {}); }, 4000);
  }
  async function guardarAgora() {
    if (!S || !chaveCache) return;
    copiaSuja = false;
    const tabelas = {};
    cache.forEach((c, t) => { if (c && c.pronto && c.linhas) tabelas[t] = { cols: [...c.cols], desde: c.desde, n: c.n, linhas: [...c.linhas.values()] }; });
    const iv = crypto.getRandomValues(new Uint8Array(12)), chave = chaveCache;
    const d = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave.k, new TextEncoder().encode(JSON.stringify({ assinatura: assinaturaCache(), em: Date.now(), tabelas })));
    if (chaveCache !== chave) return; // saiu ou trocou de pessoa no meio
    await idbFazer('readwrite', st => st.put({ iv, d }, chave.nome));
  }
  if (window.addEventListener) window.addEventListener('pagehide', () => { if (guardarTimer) { clearTimeout(guardarTimer); guardarAgora().catch(() => {}); } });

  /* ---------- sessão do banco ---------- */
  async function iniciar() {
    if (pronto()) return S;
    if (pedindo || !chamarApps) return pedindo;
    if (Date.now() < desligadoAte) return null;
    if (!M()) { motivoOff = 'motor não carregou'; return null; }
    if (!fusoOk()) return desligarPor(60, 'o relógio do computador não está no horário de Brasília');
    const salvo = lerS('painel_banco');
    // 8.37.5: a sessão guardada vale também quando é da versão que o Google roda (lembrada): antes, com o Google atrasado, CADA F5
    // pedia a sessão de novo ao Google (4 a 10 s com a tela parada)
    let vServ = ''; try { vServ = localStorage.getItem(VER_SERV) || ''; } catch (e) { /* privado */ }
    if (salvo && salvo.token && Date.parse(salvo.expira) > Date.now() && (salvo.versao === versaoPublicada() || salvo.versao === vServ) && await carregarMotor(salvo.versao)) { S = salvo; lembrarEdge(S); aoTerSessao(); return S; }
    pedindo = (async () => {
      try {
        const r = await chamarApps('banco.sessao', {});
        if (!r || !r.ligado) return desligarPor(10, (r && r.motivo) || 'desligado');
        if (r.versao !== M().versao && !(await carregarMotor(r.versao))) return desligarPor(10, 'o Code.gs (' + r.versao + ') e o painel (' + M().versao + ') são de versões diferentes');
        S = r; motivoOff = ''; lembrarVersao(r.versao); guardar('painel_banco', r); lembrarEdge(r); acordar(); aoTerSessao(); return S;
      } catch (e) { return desligarPor(2, String(e.message || e)); } finally { pedindo = null; }
    })();
    return pedindo;
  }
  /** saindo = a pessoa apertou Sair: a sessão do banco é apagada também no Supabase (funciona mesmo com o Google fora do ar). */
  function sair(saindo) {
    if (saindo && S && S.edge && S.token) {
      const cab = { apikey: S.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(S.chave)) cab.Authorization = 'Bearer ' + S.chave;
      try { fetch(S.edge, { method: 'POST', headers: cab, credentials: 'omit', keepalive: true, body: JSON.stringify({ acao: 'logout', sair: true, token: S.token }) }).catch(() => {}); } catch (e) { /* expira sozinha */ }
    }
    clearTimeout(guardarTimer); guardarTimer = null; guardadoP = null; chaveCache = null;
    S = null; cache.clear(); emVoo.clear(); rotaFora.clear(); edgeFora.clear(); guardar('painel_banco', null);
  }
  /* 8.33 Etapa D: entrar no painel pelo Supabase. O endereço da função e a chave PÚBLICA (nada secreto) ficam lembrados neste
     computador depois da primeira entrada; o Supabase só aceita se o escritório ligou "Entrar pelo Supabase". */
  function lembrarEdge(s) { try { if (s && s.edge && s.chave) localStorage.setItem('painel_edge', JSON.stringify({ edge: s.edge, chave: s.chave })); } catch (e) { /* privado */ } }
  /** Acorda a função do Supabase (a primeira chamada depois de um tempo parada demora mais): ao abrir e de 4 em 4 min. */
  function acordar() {
    const c = S && S.edge ? { edge: S.edge, chave: S.chave } : cfgEdge();
    if (!c) return;
    const cab = { apikey: c.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(c.chave)) cab.Authorization = 'Bearer ' + c.chave;
    try { fetch(c.edge, { method: 'POST', headers: cab, credentials: 'omit', cache: 'no-store', body: '{"ping":true}' }).catch(() => {}); } catch (e) { /* tanto faz */ }
  }
  function cfgEdge() {
    try { const c = JSON.parse(localStorage.getItem('painel_edge') || 'null'); if (c && c.edge && c.chave) return c; } catch (e) { /* privado */ }
    const f = window.PAINEL_EDGE; return f && f.edge && f.chave ? f : null; // 8.36.3: já vem no config.js (primeiro acesso também entra pelo Supabase)
  }
  /** Devolve { token, usuario } (como o login do Apps Script) ou null = entrar pelo Google. Senha errada etc. = erro com a mensagem. */
  async function entrarViaEdge(dados) {
    try { const v0 = localStorage.getItem(VER_SERV); if (v0 && motoresPedidos[v0]) await motoresPedidos[v0]; } catch (e) { /* segue */ }
    const c = cfgEdge();
    if (!c || !M() || !fusoOk() || Date.now() < edgeOffAte) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000), t0 = performance.now();
    const cab = { apikey: c.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(c.chave)) cab.Authorization = 'Bearer ' + c.chave;
    let r;
    try {
      const x = await fetch(c.edge, { method: 'POST', headers: cab, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal,
        body: JSON.stringify({ acao: 'login', entrar: true, dados, versao: M().versao }) });
      if (!x.ok) return null;
      r = await x.json();
    } catch (e) { edgeOffAte = Date.now() + 3 * 60000; return null; } finally { clearTimeout(timer); }
    if (!r || r.voltar) return null;
    if (!r.ok) throw new Error(r.erro || 'Não foi possível entrar.');
    const d = r.dados, b = d.banco; delete d.banco;
    if (b && b.token && (b.versao === M().versao || await carregarMotor(b.versao))) { S = b; motivoOff = ''; desligadoAte = 0; lembrarVersao(b.versao); guardar('painel_banco', b); lembrarEdge(b); aoTerSessao(); }
    medir('login', 'supabase', performance.now() - t0);
    return d;
  }

  /* ---------- leitura das tabelas ---------- */
  async function rpc(pedidos, limiteMs) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), limiteMs);
    const cab = { apikey: S.chave, 'Content-Type': 'application/json', Accept: 'application/json' };
    if (/^eyJ/.test(S.chave)) cab.Authorization = 'Bearer ' + S.chave; // chave "anon" antiga
    try {
      const r = await fetch(S.url + '/rest/v1/rpc/painel_ler', { method: 'POST', headers: cab, body: JSON.stringify({ p_token: S.token, p_pedidos: pedidos }),
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { /* não é JSON */ }
      if (!r.ok) {
        const msg = (j && (j.message || j.hint)) || ('erro ' + r.status);
        if (/sessão do banco/i.test(msg)) { S = null; guardar('painel_banco', null); }
        throw new Error('Supabase: ' + msg);
      }
      return j;
    } finally { clearTimeout(timer); }
  }
  function chaveDaLinha(t, o) { return t.cols.has('id') ? String(o.id) : String(o._n); }
  /** Busca só o que mudou desde a última vez (e confere se alguma linha sumiu). */
  // 8.35.8: no máximo 3 leituras ao banco ao mesmo tempo (com 10+ juntas o Supabase cortava por tempo: "statement timeout")
  let ativos = 0; const filaRpc = [];
  function naFila(fn) {
    return new Promise((ok, nao) => {
      const vai = () => { ativos++; fn().then(ok, nao).finally(() => { ativos--; const prox = filaRpc.shift(); if (prox) prox(); }); };
      if (ativos < 6) vai(); else filaRpc.push(vai); // 8.36.3: 6 (o limite de tempo do Supabase subiu para 15 s)
    });
  }
  async function sincronizar(tabelas, limiteMs) {
    if (guardadoP) await guardadoP; // 8.38: primeiro a cópia guardada no computador (aí só vem o que mudou)
    const agora = Date.now(), pedir = [], esperar = [];
    tabelas.forEach(t => {
      const c = cache.get(t);
      if (emVoo.has(t)) esperar.push(emVoo.get(t));
      else if (!c || !c.pronto || agora - c.em > NO_LOTE_MS) pedir.push(t);
    });
    if (pedir.length) {
      // 8.35.8: em PARTES. Uma consulta só com todas as tabelas (milhares de linhas) passava do tempo-limite do banco ("canceling statement
      // due to statement timeout") e tudo caía no Google. Agora: tabela grande sozinha, as pequenas de 4 em 4, todas em paralelo;
      // a parte que estourar o tempo é pedida de novo uma vez.
      const GRANDES = new Set(['intimacoes', 'log', 'clientes', 'processos', 'prazos', 'tarefas', 'honorarios', 'parcelas', 'eventos', 'leads']);
      const grupos = [], miudas = [];
      pedir.forEach(t => { const c = cache.get(t); if (GRANDES.has(t) && !(c && c.pronto)) grupos.push([t]); else miudas.push(t); });
      for (let k = 0; k < miudas.length; k += 4) grupos.push(miudas.slice(k, k + 4));
      const umGrupo = async (g, tentativa) => {
        let j;
        try { j = await rpc(g.map(t => { const c = cache.get(t); return { t, desde: c && c.pronto ? c.desde : null }; }), limiteMs); }
        catch (e) { if (!tentativa && /statement timeout|demor|abort/i.test(String(e && e.message || e))) return umGrupo(g, 1); throw e; }
        if (j.pendente) throw Object.assign(new Error('alguma mudança ainda está chegando ao banco'), { pendente: true });
        const servidor = Date.parse(j.agora), recheck = [];
        g.forEach(t => {
          const x = j.tabelas[t];
          if (!x || x.negado) { cache.set(t, { negada: true, pronto: false }); return; }
          let c = cache.get(t);
          if (!c || !c.pronto) { c = { linhas: new Map(), pronto: false, cols: new Set() }; copiaSuja = true; }
          x.linhas.forEach(o => { Object.keys(o).forEach(k => c.cols.add(k)); });
          x.linhas.forEach(o => c.linhas.set(chaveDaLinha(c, o), o));
          if (x.linhas.length) copiaSuja = true;
          c.desde = new Date(servidor - 120000).toISOString(); // 2 min de folga: nenhuma gravação em andamento fica para trás
          c.em = Date.now(); c.n = x.n; c.pronto = true; if (x.linhas.length || c.lista === undefined) c.lista = null; // nada novo = mantém a lista já ordenada
          cache.set(t, c);
          if (c.linhas.size !== x.n) recheck.push(t);
        });
        if (recheck.length) { // alguma linha saiu da planilha: pega a lista de chaves e tira as que sumiram
          const k = await rpc(recheck.map(t => ({ t, desde: new Date(servidor).toISOString(), chaves: true })), limiteMs);
          recheck.forEach(t => {
            const c = cache.get(t), x = k.tabelas[t];
            if (!x || !x.chaves) return;
            const ok = new Set(x.chaves.map(String));
            for (const ch of [...c.linhas.keys()]) if (!ok.has(ch)) { c.linhas.delete(ch); copiaSuja = true; }
            c.lista = null;
          });
        }
      };
      const ps = grupos.map(g => { const p = naFila(() => umGrupo(g, 0)); g.forEach(t => emVoo.set(t, p)); return [g, p]; });
      try { await Promise.all(ps.map(x => x[1])); if (copiaSuja) guardarDepois(); }
      finally { ps.forEach(([g, p]) => g.forEach(t => { if (emVoo.get(t) === p) emVoo.delete(t); })); }
    }
    if (esperar.length) await Promise.all(esperar);
  }
  function linhasDe(t) {
    const c = cache.get(t);
    if (!c.lista) c.lista = [...c.linhas.values()].sort((a, b) => a._n - b._n);
    return c.lista;
  }

  /* ---------- a conta (motor) ---------- */
  function ambiente(acao, usadas) {
    const memo = {}, perm = S.permissoes || {}, esq = M().esquema;
    const amb = {
      motivo: '', asaas: !!S.asaas,
      parar(m) { if (!amb.motivo) amb.motivo = m; },
      tabela(nome) {
        if (memo[nome]) return memo[nome];
        const t = snake(nome), g = perm[t];
        usadas.add(t);
        const erro = m => { amb.parar(m); const e = new Error('motor: ' + m); e.motor = true; throw e; };
        if (!g || !esq[nome]) erro('negada:' + t);
        if (g.filtro && !(S.tarefasFiltradasOk || []).includes(acao)) erro('filtrada:' + t);
        const c = cache.get(t);
        if (!c || !c.pronto) erro(c && c.negada ? 'negada:' + t : 'falta:' + t);
        const cab = esq[nome], cabSet = new Set(cab);
        // g.outros: linhas de outras pessoas vêm resumidas; as rotas que só usam as da pessoa recebem só as dela
        const soMinhas = g.outros && (S.tarefasFiltradasOk || []).includes(acao);
        const okOutros = g.outros ? new Set((g.outros.cols || []).concat([g.outros.marcas])) : null;
        const okCols = g.cols ? new Set(g.cols) : null;
        const linhas = linhasDe(t).filter(o => !soMinhas || o._meu).map(o => {
          const x = { _linha: o._n };
          cab.forEach(k => { const v = o[k]; x[k] = v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v); });
          const ok = okCols || (g.outros && !o._meu ? okOutros : null);
          if (!ok) return x;
          // tabela com colunas limitadas para este perfil: ler coluna escondida ou listar tudo = volta para a planilha
          return new Proxy(x, {
            get(o2, p) { if (typeof p === 'string' && cabSet.has(p) && !ok.has(p)) erro('coluna:' + t + '.' + p); return o2[p]; },
            ownKeys() { return erro('listar:' + t); }
          });
        });
        const abaFalsa = new Proxy({}, { get(_, p) { return erro('planilha.' + String(p)); } });
        return (memo[nome] = { nome, cab, linhas, aba: abaFalsa });
      },
      config(chave) {
        if (!(M().configLivre || []).includes(chave)) return amb.parar('config:' + chave), (() => { const e = new Error('motor: config'); e.motor = true; throw e; })();
        const c = cache.get('config');
        if (!c || !c.pronto) { amb.parar('falta:config'); const e = new Error('motor: falta config'); e.motor = true; throw e; }
        const l = linhasDe('config').find(x => x.chave === chave);
        return l ? String(l.valor || '') : '';
      }
    };
    return amb;
  }
  /** Lê uma tela pelo banco. Erro = a tela vai ao Apps Script (painel.js faz isso). */
  async function ler(acao, dados) {
    const t0 = performance.now();
    if (!pronto()) await iniciar();
    if (!pronto()) throw new Error('banco desligado: ' + motivoOff);
    const perm = S.permissoes || {};
    const base = (aprendidas[acao] || (M().tabelasDaRota[acao] || []).map(snake)).filter(t => perm[t]);
    let precisa = [...new Set(['config', 'usuarios'].concat(base))];
    for (let volta = 0; volta < 5; volta++) {
      // 8.38: tudo o que a tela usa foi conferido há menos de 3 min (e ninguém gravou desde então: gravar zera o "em") → abre NA HORA
      // e confere o que mudou por trás (a próxima tela já vem com isso). Senão espera (só o que mudou: rápido).
      const agoraL = Date.now(), fresco = precisa.every(t => { const c = cache.get(t); return c && c.pronto && c.em > 0 && agoraL - c.em < FRESCO_MS; });
      if (fresco) sincronizar(precisa, 60000).catch(() => {});
      else await sincronizar(precisa, 60000); // quem espera pouco é o lerOuPlanilha; a carga continua por trás e serve para a próxima tela
      const usadas = new Set(['config']), amb = ambiente(acao, usadas);
      let res, erro = null;
      try { res = M().rodar(acao, dados, S.u, amb); } catch (e) { erro = e; }
      // um valor escondido ("•") apareceu na resposta: esta conta precisa do valor de verdade → planilha
      if (!amb.motivo && !erro && /"\u2022"/.test(JSON.stringify(res === undefined ? null : res))) amb.parar('mascarado');
      if (!amb.motivo && !erro) {
        aprendidas[acao] = [...usadas]; try { localStorage.setItem('banco_tabelas', JSON.stringify(aprendidas)); } catch (e) { /* ok */ }
        medir(acao, 'banco', performance.now() - t0);
        return JSON.parse(JSON.stringify(res)); // igual ao que viria pela internet (datas viram texto, undefined some)
      }
      const m = amb.motivo || '';
      if (m.startsWith('falta:')) { precisa = [...new Set(precisa.concat([m.slice(6)], [...usadas]))]; continue; }
      // precisa de algo que só o Google tem (agenda, Gmail…), de gravar, ou de algo que este perfil não lê: esta rota vai sempre ao Apps Script
      // (precisar gravar é de vez em quando: o Apps Script grava agora e na próxima vez a conta já roda aqui)
      // 8.35.8: agenda sem cópia boa no momento (CalendarApp) é passageiro: tenta o banco de novo em 5 min (antes ficava 12 h no Google, 60 s por tela)
      if (m && /CalendarApp|Calendar/.test(m)) { rotaFora.set(acao, m); setTimeout(() => { if (rotaFora.get(acao) === m) rotaFora.delete(acao); }, 5 * 60000); }
      else if (m && !/gravar/.test(m)) { rotaFora.set(acao, m); lembrarFora('m', acao); }
      throw erro || new Error('motor: ' + m);
    }
    throw new Error('motor: tabelas demais');
  }

  /* ---------- 8.32 Etapa C: o motor do painel no Supabase (Edge Function "painel") ---------- */
  const edgeFora = new Set(); // rotas que a função devolveu ("precisa do Google"): nesta aba vão direto ao Apps Script
  let edgeOffAte = 0; // 8.37: o motor do Supabase não respondeu → 3 min sem tentar (antes cada tela esperava até 10 s)
  function edgeLigada() { return !!(pronto() && S.edge && M() && Date.now() >= edgeOffAte); }
  async function chamarEdge(acao, dados, pedido, limiteMs) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), limiteMs);
    const cab = { apikey: S.chave, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(S.chave)) cab.Authorization = 'Bearer ' + S.chave;
    try {
      const r = await fetch(S.edge, { method: 'POST', headers: cab, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal,
        body: JSON.stringify({ token: S.token, acao, dados: dados || {}, pedido: pedido || null, versao: M().versao }) });
      if (!r.ok) throw Object.assign(new Error('motor do Supabase: código ' + r.status), { rede: true });
      return await r.json();
    } catch (e) { if (e && e.name === 'AbortError') throw Object.assign(new Error('o motor do Supabase demorou'), { rede: true }); throw Object.assign(e, { rede: true }); }
    finally { clearTimeout(timer); }
  }
  function tratarVoltar(acao, r) {
    // 8.35.8: o escritório desligou o motor do Supabase → não pergunta mais a ele por 30 min (cada pergunta custava ~1 s por tela)
    if (/motor do Supabase desligado|desligad/i.test(String(r.motivo || ''))) edgeOffAte = Date.now() + 30 * 60000;
    if (r.sessao) { S = null; guardar('painel_banco', null); }
    else if (!PASSAGEIRO.test(String(r.motivo || ''))) { edgeFora.add(acao); lembrarFora('e', acao); }
    medir(acao, 'supabase-voltou', 0, String(r.motivo || '').slice(0, 120));
  }
  /** Leitura que o navegador não calcula: tenta o motor do Supabase; precisa do Google → Apps Script. */
  async function lerViaEdge(acao, dados, google) {
    if (edgeLigada() && !edgeFora.has(acao) && !foraLembrado('e', acao)) {
      // 8.36.3: corrida — o Supabase tem até 25 s; se passar de 6 s sem resposta, pede TAMBÉM ao Google e vale o que chegar primeiro.
      // Demorar não desliga mais o Supabase (antes, uma tela lenta mandava TUDO ao Google por 3 min = painel "travado").
      const t0 = performance.now();
      const pEdge = chamarEdge(acao, dados, null, 25000).then(r => {
        if (r && r.voltar) { tratarVoltar(acao, r); return { ir: true }; }
        if (r && r.ok) { medir(acao, 'supabase', performance.now() - t0); return { ok: true, dados: r.dados }; }
        if (r && r.erro) return { erro: new Error(r.erro) };
        return { ir: true };
      }, e => {
        if (!e.rede) return { erro: e };
        if (!/demorou/.test(String(e.message))) edgeOffAte = Date.now() + 60000; // sem internet / função fora: 1 min
        medir(acao, 'supabase-falhou', 0, String(e.message || e).slice(0, 120));
        return { ir: true };
      });
      let pGoogle = null;
      const doGoogle = () => (pGoogle = pGoogle || google().then(d => ({ ok: true, dados: d, g: true }), e => ({ erro: e, g: true })));
      const r1 = await Promise.race([pEdge, new Promise(ok => setTimeout(() => ok({ espera: true }), 6000))]);
      let r = r1;
      if (r1.espera) {
        // os dois correm; o primeiro que der certo vale
        r = await new Promise(fim => {
          let pend = 2, ultimo = null;
          const um = x => { if (x.ok) return fim(x); ultimo = x.erro ? x : (ultimo || x); if (--pend === 0) fim(ultimo); };
          pEdge.then(x => x.ir ? doGoogle().then(um) : um(x)); doGoogle().then(um);
        });
        if (r && r.ir) r = await doGoogle();
      }
      if (r.ok) { if (r.g) medir(acao, 'google', performance.now() - t0); return r.dados; }
      if (r.erro && !r.g) throw r.erro;
      if (r.erro && r.g) throw r.erro;
    }
    const t0 = performance.now(), r = await google();
    medir(acao, 'google', performance.now() - t0);
    return r;
  }
  /** Gravação: no motor do Supabase (tudo ou nada; o mesmo pedido nunca grava duas vezes). Sem resposta = tenta de novo com o MESMO
   *  pedido (se já gravou, ele só devolve a resposta); nunca manda ao Apps Script depois de uma falta de resposta (gravaria duas vezes). */
  async function gravarViaEdge(acao, dados, google) {
    if (!edgeLigada() || edgeFora.has(acao) || foraLembrado('e', acao)) return google();
    const pedido = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), t0 = performance.now();
    let r = null, ultimo = null;
    // 8.36.3: 3 tentativas com o MESMO pedido (se a 1ª já gravou, as outras só devolvem a resposta guardada: nunca grava duas vezes)
    for (let vez = 0; vez < 3 && !r; vez++) {
      if (vez) await new Promise(ok => setTimeout(ok, 1500 * vez));
      try { r = await chamarEdge(acao, dados, pedido, vez < 2 ? 25000 : 60000); } catch (e) { ultimo = e; }
    }
    if (!r) edgeOffAte = Date.now() + 3 * 60000;
    if (!r) throw new Error('O banco de dados não respondeu em 2 minutos (' + (ultimo && ultimo.message || '') + '). Pode ser a internet: atualize a tela e confira se ficou gravado antes de repetir.');
    if (r.voltar) { tratarVoltar(acao, r); return google(); } // nada foi gravado no Supabase: o Apps Script faz
    medir(acao, 'supabase', performance.now() - t0);
    if (!r.ok) throw new Error(r.erro || 'Erro.');
    return r.dados;
  }

  /* ---------- porta de entrada usada pelo painel.js ---------- */
  function pode(acao) { return !!(M() && M().tem(acao) && !rotaFora.has(acao) && !foraLembrado('m', acao) && Date.now() >= desligadoAte && (pronto() || chamarApps)); }
  /** Tenta o banco; se falhar ou demorar, faz o pedido normal ao Apps Script (sem a pessoa perceber). */
  async function lerOuPlanilha(acao, dados, planilha) {
    if (pode(acao)) {
      const limite = cache.size ? TEMPO_DEPOIS : TEMPO_PRIMEIRA;
      let timer;
      try {
        const lendo = ler(acao, dados); lendo.catch(() => {}); // se a planilha responder antes, o erro tardio do banco não aparece no console
        const r = await Promise.race([lendo, new Promise((_, nao) => { timer = setTimeout(() => nao(Object.assign(new Error('o banco demorou mais de ' + limite / 1000 + ' s'), { demorou: true })), limite); })]);
        falhasSeguidas = 0; return r;
      }
      catch (e) {
        // 8.35.8: DEMORAR não é falhar (a carga continua por trás e serve a próxima tela); várias telas esperando a mesma carga contam UMA vez
        const agoraF = Date.now();
        if (!(e && e.motor) && !(e && e.demorou) && !/banco desligado/.test(e.message || '') && agoraF - ultimaFalha > 3000) {
          ultimaFalha = agoraF;
          falhasSeguidas++;
          if (e && e.pendente) desligadoAte = Date.now() + 20000; // espera a mudança chegar
          else if (falhasSeguidas >= 3) { desligadoAte = Date.now() + 5 * 60000; motivoOff = 'o banco falhou 3 vezes seguidas (' + (e.message || e) + '); volta a tentar em 5 min'; falhasSeguidas = 0; }
        }
        medir(acao, 'banco-falhou', 0, String(e && e.message || e).slice(0, 120));
      } finally { clearTimeout(timer); }
    }
    return planilha(); // (o tempo é medido lá: motor do Supabase ou Google)
  }
  /** Para a tela "Banco novo": a mesma leitura pelos dois caminhos, com tempo e se o resultado bateu. */
  async function comparar(lista, planilha) {
    const out = [];
    for (const [acao, dados] of lista) {
      const linha = { acao, banco: null, google: null, igual: null, obs: '' };
      try { const t = performance.now(); const b = await ler(acao, dados); linha.banco = performance.now() - t; linha._b = b; } catch (e) { linha.obs = 'banco: ' + (e.message || e); }
      try { const t = performance.now(); const g = await planilha(acao, dados); linha.google = performance.now() - t; linha._g = g; } catch (e) { linha.obs += (linha.obs ? ' · ' : '') + 'planilha: ' + (e.message || e); }
      if (linha._b !== undefined && linha._g !== undefined) {
        const d = diferencas(linha._b, linha._g, '', []);
        linha.igual = !d.length; if (d.length) linha.obs += (linha.obs ? ' · ' : '') + d.length + ' diferença(s): ' + d.slice(0, 3).join('; ');
      }
      delete linha._b; delete linha._g;
      out.push(linha);
    }
    return out;
  }
  function diferencas(a, b, cam, acc) {
    if (acc.length > 20) return acc;
    if (a === b) return acc;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { acc.push((cam || 'raiz') + ': ' + JSON.stringify(a).slice(0, 40) + ' ≠ ' + JSON.stringify(b).slice(0, 40)); return acc; }
    if (Array.isArray(a) !== Array.isArray(b)) { acc.push(cam + ': tipo'); return acc; }
    if (Array.isArray(a) && a.length !== b.length) { acc.push(cam + ': ' + a.length + ' ≠ ' + b.length + ' itens'); return acc; }
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => diferencas(a[k], b[k], cam ? cam + '.' + k : k, acc));
    return acc;
  }
  function estado() {
    return { ligado: pronto(), motivo: motivoOff, ate: desligadoAte > Date.now() ? desligadoAte : 0, fora: [...rotaFora.entries()],
      tabelas: [...cache.entries()].filter(([, c]) => c.pronto).map(([t, c]) => [t, c.linhas.size]), medidas: medidas.slice(), edge: edgeLigada(), edgeFora: [...edgeFora] };
  }

  /** 8.39: chat da equipe — pergunta pequena ao banco (não lidas + última mensagem). null = sem o banco agora. */
  async function chatPing() {
    if (!pronto()) await iniciar();
    if (!pronto()) return null;
    const cab = { apikey: S.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(S.chave)) cab.Authorization = 'Bearer ' + S.chave;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(S.url + '/rest/v1/rpc/painel_chat_ping', { method: 'POST', headers: cab, body: JSON.stringify({ p_token: S.token }),
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  /** Depois de qualquer gravação: a próxima leitura busca o que mudou (incremental, rápido). */
  function envelhecer() { cache.forEach(c => { if (c) c.em = 0; }); }
  window.PAINEL_BANCO = { chatPing, envelhecer, configurar: f => { chamarApps = f; }, iniciar, sair, pode, lerOuPlanilha, ler, comparar, estado, medir, lerViaEdge, gravarViaEdge, edgeLigada, entrarViaEdge, acordar, temEdge: () => !!cfgEdge() };
})();
