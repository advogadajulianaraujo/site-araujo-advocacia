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

  /* ---------- sessão do banco ---------- */
  async function iniciar() {
    if (pronto()) return S;
    if (pedindo || !chamarApps) return pedindo;
    if (!M()) { motivoOff = 'motor não carregou'; return null; }
    if (!fusoOk()) { motivoOff = 'o relógio do computador não está no horário de Brasília'; return null; }
    const salvo = lerS('painel_banco');
    if (salvo && salvo.token && Date.parse(salvo.expira) > Date.now() && salvo.versao === M().versao) { S = salvo; return S; }
    pedindo = (async () => {
      try {
        const r = await chamarApps('banco.sessao', {});
        if (!r || !r.ligado) { motivoOff = (r && r.motivo) || 'desligado'; return null; }
        if (r.versao !== M().versao) { motivoOff = 'o Code.gs (' + r.versao + ') e o painel (' + M().versao + ') são de versões diferentes'; return null; }
        S = r; motivoOff = ''; guardar('painel_banco', r); return S;
      } catch (e) { motivoOff = String(e.message || e); return null; } finally { pedindo = null; }
    })();
    return pedindo;
  }
  function sair() { S = null; cache.clear(); emVoo.clear(); rotaFora.clear(); guardar('painel_banco', null); }

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
      if (m && !/gravar/.test(m)) rotaFora.set(acao, m);
      throw erro || new Error('motor: ' + m);
    }
    throw new Error('motor: tabelas demais');
  }

  /* ---------- porta de entrada usada pelo painel.js ---------- */
  function pode(acao) { return !!(M() && M().tem(acao) && !rotaFora.has(acao) && Date.now() >= desligadoAte && (pronto() || chamarApps)); }
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
    const t0 = performance.now(), r = await planilha();
    medir(acao, 'google', performance.now() - t0);
    return r;
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
      tabelas: [...cache.entries()].filter(([, c]) => c.pronto).map(([t, c]) => [t, c.linhas.size]), medidas: medidas.slice() };
  }

  window.PAINEL_BANCO = { configurar: f => { chamarApps = f; }, iniciar, sair, pode, lerOuPlanilha, ler, comparar, estado, medir };
})();
