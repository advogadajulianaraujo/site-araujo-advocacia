/* Painel — leitura rápida pelo banco novo (Supabase), 8.28.
   As telas de leitura (clientes, processos, prazos, intimações, tarefas, cobranças…) pegam as linhas no Supabase e fazem a conta
   AQUI, com as mesmas funções do Code.gs (painel/motor.js, gerado). Gravar continua sempre pelo Apps Script, que manda a mudança
   ao Supabase antes de responder.
   Segurança: o navegador só tem a chave PÚBLICA do projeto e um código de sessão do banco dado pelo Apps Script no login; quem
   decide o que cada perfil lê é o Supabase (função painel_ler). Nada fica guardado depois de fechar o navegador.
   Volta sozinho para a planilha (Apps Script) quando: o banco não respondeu a tempo, deu erro, alguma mudança ainda não chegou
   ("pendente"), a conta precisou de algo que só o Google tem (agenda, Gmail…), ou o motor é de outra versão. */
(() => {
  'use strict';
  const M = () => window.PAINEL_MOTOR;
  let S = null;            // sessão do banco: { url, chave, token, expira, u, permissoes, asaas, versao, tarefasFiltradasOk }
  let pedindo = null;      // pedido da sessão em andamento
  let chamarApps = null;   // (acao, dados) → Promise, do painel.js
  let falhasSeguidas = 0, desligadoAte = 0, motivoOff = '';
  const rotaFora = new Map();  // rota → motivo (esta aba vai sempre ao Apps Script para ela)
  /* 8.33 velocidade: o que cada tela precisa do Google fica lembrado NESTE computador por 12 h (por perfil e versão), para não
     tentar o caminho que não dá a cada F5 ou aba nova (antes: navegador → função do Supabase → Google, um depois do outro).
     Guarda só nomes de telas; nenhum dado. */
  const FORA_MS = 12 * 3600e3;
  function chaveFora() { return 'banco_fora_' + ((S && S.u && S.u.perfil) || '') + '_' + (M() ? M().versao : ''); }
  function lerFora() { try { return JSON.parse(localStorage.getItem(chaveFora()) || '{}'); } catch (e) { return {}; } }
  function lembrarFora(tipo, acao) { try { const x = lerFora(); x[tipo + ':' + acao] = Date.now(); localStorage.setItem(chaveFora(), JSON.stringify(x)); } catch (e) { /* privado */ } }
  function foraLembrado(tipo, acao) { const t = lerFora()[tipo + ':' + acao]; return !!t && Date.now() - t < FORA_MS; }
  // motivos que passam sozinhos (não vale lembrar): mudança chegando, desligado, versão, sessão, erro de momento
  const PASSAGEIRO = /^(há mudança|motor do Supabase desligado|versões|abas demais|erro|sessão|entrar)/;
  const cache = new Map();     // tabela → { linhas: Map(chave → linha), desde, pronto, n, em }
  const emVoo = new Map();     // sincronizações em andamento (várias telas pedem a mesma tabela juntas)
  const medidas = [];          // { acao, fonte: 'banco'|'google', ms, quando, obs }
  const NO_LOTE_MS = 1500;     // tabela lida há menos disso não é pedida de novo
  const TEMPO_PRIMEIRA = 9000, TEMPO_DEPOIS = 4500; // passou disso → planilha

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
  const motoresPedidos = {};
  function carregarMotor(ver) {
    if (!/^\d+\.\d+\.\d+$/.test(ver || '')) return Promise.resolve(false);
    if (M() && M().versao === ver) return Promise.resolve(true);
    if (motoresPedidos[ver]) return motoresPedidos[ver];
    return (motoresPedidos[ver] = new Promise(ok => {
      const s = document.createElement('script'); s.src = '/painel/motor-' + ver + '.js'; s.async = true;
      s.onload = () => ok(!!(M() && M().versao === ver)); s.onerror = () => ok(false);
      document.head.append(s);
    }));
  }
  // versão do servidor lembrada neste computador: o motor certo já vem carregado antes da entrada
  const VER_SERV = 'painel_versao_servidor';
  function lembrarVersao(v) { try { if (v) localStorage.setItem(VER_SERV, v); } catch (e) { /* privado */ } }
  try { const v0 = localStorage.getItem(VER_SERV); if (v0 && M() && v0 !== M().versao) carregarMotor(v0); } catch (e) { /* privado */ }
  function desligarPor(min, motivo) { motivoOff = motivo; desligadoAte = Date.now() + min * 60000; return null; }

  /* ---------- sessão do banco ---------- */
  async function iniciar() {
    if (pronto()) return S;
    if (pedindo || !chamarApps) return pedindo;
    if (Date.now() < desligadoAte) return null;
    if (!M()) { motivoOff = 'motor não carregou'; return null; }
    if (!fusoOk()) return desligarPor(60, 'o relógio do computador não está no horário de Brasília');
    const salvo = lerS('painel_banco');
    if (salvo && salvo.token && Date.parse(salvo.expira) > Date.now() && (salvo.versao === M().versao || await carregarMotor(salvo.versao))) { S = salvo; lembrarEdge(S); return S; }
    pedindo = (async () => {
      try {
        const r = await chamarApps('banco.sessao', {});
        if (!r || !r.ligado) return desligarPor(10, (r && r.motivo) || 'desligado');
        if (r.versao !== M().versao && !(await carregarMotor(r.versao))) return desligarPor(10, 'o Code.gs (' + r.versao + ') e o painel (' + M().versao + ') são de versões diferentes');
        S = r; motivoOff = ''; lembrarVersao(r.versao); guardar('painel_banco', r); lembrarEdge(r); acordar(); return S;
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
  function cfgEdge() { try { const c = JSON.parse(localStorage.getItem('painel_edge') || 'null'); return c && c.edge && c.chave ? c : null; } catch (e) { return null; } }
  /** Devolve { token, usuario } (como o login do Apps Script) ou null = entrar pelo Google. Senha errada etc. = erro com a mensagem. */
  async function entrarViaEdge(dados) {
    try { const v0 = localStorage.getItem(VER_SERV); if (v0 && motoresPedidos[v0]) await motoresPedidos[v0]; } catch (e) { /* segue */ }
    const c = cfgEdge();
    if (!c || !M() || !fusoOk()) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000), t0 = performance.now();
    const cab = { apikey: c.chave, 'Content-Type': 'application/json' }; if (/^eyJ/.test(c.chave)) cab.Authorization = 'Bearer ' + c.chave;
    let r;
    try {
      const x = await fetch(c.edge, { method: 'POST', headers: cab, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal,
        body: JSON.stringify({ acao: 'login', entrar: true, dados, versao: M().versao }) });
      if (!x.ok) return null;
      r = await x.json();
    } catch (e) { return null; } finally { clearTimeout(timer); }
    if (!r || r.voltar) return null;
    if (!r.ok) throw new Error(r.erro || 'Não foi possível entrar.');
    const d = r.dados, b = d.banco; delete d.banco;
    if (b && b.token && (b.versao === M().versao || await carregarMotor(b.versao))) { S = b; motivoOff = ''; desligadoAte = 0; lembrarVersao(b.versao); guardar('painel_banco', b); lembrarEdge(b); }
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
  async function sincronizar(tabelas, limiteMs) {
    const agora = Date.now(), pedir = [], esperar = [];
    tabelas.forEach(t => {
      const c = cache.get(t);
      if (emVoo.has(t)) esperar.push(emVoo.get(t));
      else if (!c || !c.pronto || agora - c.em > NO_LOTE_MS) pedir.push(t);
    });
    if (pedir.length) {
      const p = (async () => {
        const j = await rpc(pedir.map(t => { const c = cache.get(t); return { t, desde: c && c.pronto ? c.desde : null }; }), limiteMs);
        if (j.pendente) throw Object.assign(new Error('alguma mudança ainda está chegando ao banco'), { pendente: true });
        const servidor = Date.parse(j.agora), recheck = [];
        pedir.forEach(t => {
          const x = j.tabelas[t];
          if (!x || x.negado) { cache.set(t, { negada: true, pronto: false }); return; }
          let c = cache.get(t);
          if (!c || !c.pronto) c = { linhas: new Map(), pronto: false, cols: new Set() };
          x.linhas.forEach(o => { Object.keys(o).forEach(k => c.cols.add(k)); });
          x.linhas.forEach(o => c.linhas.set(chaveDaLinha(c, o), o));
          c.desde = new Date(servidor - 120000).toISOString(); // 2 min de folga: nenhuma gravação em andamento fica para trás
          c.em = Date.now(); c.n = x.n; c.pronto = true; c.lista = null;
          cache.set(t, c);
          if (c.linhas.size !== x.n) recheck.push(t);
        });
        if (recheck.length) { // alguma linha saiu da planilha: pega a lista de chaves e tira as que sumiram
          const k = await rpc(recheck.map(t => ({ t, desde: new Date(servidor).toISOString(), chaves: true })), limiteMs);
          recheck.forEach(t => {
            const c = cache.get(t), x = k.tabelas[t];
            if (!x || !x.chaves) return;
            const ok = new Set(x.chaves.map(String));
            for (const ch of [...c.linhas.keys()]) if (!ok.has(ch)) c.linhas.delete(ch);
            c.lista = null;
          });
        }
      })();
      pedir.forEach(t => emVoo.set(t, p));
      try { await p; } finally { pedir.forEach(t => { if (emVoo.get(t) === p) emVoo.delete(t); }); }
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
      await sincronizar(precisa, 60000); // quem espera pouco é o lerOuPlanilha; a carga continua por trás e serve para a próxima tela
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
      if (m && !/gravar/.test(m)) { rotaFora.set(acao, m); lembrarFora('m', acao); }
      throw erro || new Error('motor: ' + m);
    }
    throw new Error('motor: tabelas demais');
  }

  /* ---------- 8.32 Etapa C: o motor do painel no Supabase (Edge Function "painel") ---------- */
  const edgeFora = new Set(); // rotas que a função devolveu ("precisa do Google"): nesta aba vão direto ao Apps Script
  function edgeLigada() { return !!(pronto() && S.edge && M()); }
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
    if (r.sessao) { S = null; guardar('painel_banco', null); }
    else if (!PASSAGEIRO.test(String(r.motivo || ''))) { edgeFora.add(acao); lembrarFora('e', acao); }
    medir(acao, 'supabase-voltou', 0, String(r.motivo || '').slice(0, 120));
  }
  /** Leitura que o navegador não calcula: tenta o motor do Supabase; precisa do Google → Apps Script. */
  async function lerViaEdge(acao, dados, google) {
    if (edgeLigada() && !edgeFora.has(acao) && !foraLembrado('e', acao)) {
      const t0 = performance.now();
      try {
        const r = await chamarEdge(acao, dados, null, 10000);
        if (r && r.voltar) tratarVoltar(acao, r);
        else if (r && r.ok) { medir(acao, 'supabase', performance.now() - t0); return r.dados; }
        else if (r && r.erro) throw new Error(r.erro);
      } catch (e) { if (!e.rede) throw e; medir(acao, 'supabase-falhou', 0, String(e.message || e).slice(0, 120)); }
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
    for (let vez = 0; vez < 2 && !r; vez++) {
      try { r = await chamarEdge(acao, dados, pedido, 30000); } catch (e) { ultimo = e; }
    }
    if (!r) throw new Error('Sem resposta do banco de dados ao gravar (' + (ultimo && ultimo.message || '') + '). Atualize a tela e confira se ficou gravado antes de repetir.');
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
        const r = await Promise.race([lendo, new Promise((_, nao) => { timer = setTimeout(() => nao(new Error('o banco demorou mais de ' + limite / 1000 + ' s')), limite); })]);
        falhasSeguidas = 0; return r;
      }
      catch (e) {
        if (!(e && e.motor) && !/banco desligado/.test(e.message || '')) {
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

  window.PAINEL_BANCO = { configurar: f => { chamarApps = f; }, iniciar, sair, pode, lerOuPlanilha, ler, comparar, estado, medir, lerViaEdge, gravarViaEdge, edgeLigada, entrarViaEdge, acordar, temEdge: () => !!cfgEdge() };
})();
