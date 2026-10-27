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
  const LEITURAS = new Set(['resumo', 'agenda.listar', 'clientes.listar', 'clientes.obter', 'clientes.documentos',
    'processos.listar', 'prazos.listar', 'intimacoes.listar', 'feriados.listar', 'usuarios.listar', 'relatorio.cumpridos',
    'fin.resumo', 'fin.honorarios', 'fin.honorario', 'modelos.listar']);
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
    clientes: ['clientes', 'processos', 'resumo', 'modelos'], documentos: ['clientes', 'fin', 'modelos', 'resumo'],
    processos: ['processos', 'clientes', 'resumo', 'prazos', 'intimacoes'], prazos: ['prazos', 'resumo', 'agenda', 'intimacoes', 'relatorio', 'processos'],
    intimacoes: ['intimacoes', 'prazos', 'resumo'], agenda: ['agenda', 'resumo'], fin: ['fin', 'resumo', 'clientes'],
    advogados: ['modelos'], usuarios: ['usuarios'], feriados: ['feriados', 'prazos', 'resumo']
  };
  function esquecerDepois(acao) {
    const lista = AFETA[acao.split('.')[0]];
    if (!lista) { esquecerTudo(); return; }
    geracao++;
    for (const [k, m] of memoria) {
      if (lista.includes(k.split('|')[0].split('.')[0])) memoria.delete(k);
      else if ('txt' in m) m.t = 0; else memoria.delete(k);
    }
    salvarMemoria();
  }

  const GRAVANDO = new Map();
  async function api(acao, dados) {
    if (!LEITURAS.has(acao)) {
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
      if (Date.now() - m.t > FRESCO_MS && !m.promessa) conferir(k, acao, dados, m);
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

  function conferir(k, acao, dados, m) {
    const g = geracao;
    m.promessa = chamar(acao, dados).then(v => {
      if (g !== geracao) return;
      const txt = JSON.stringify(v);
      const mudou = txt !== m.txt;
      memoria.set(k, { t: Date.now(), txt });
      if (mudou) { pedirRedesenho(); salvarMemoria(); }
    }, () => { m.promessa = null; });
  }

  function pedirRedesenho() {
    const hash = location.hash;
    clearTimeout(redesenhoTimer);
    redesenhoTimer = setTimeout(() => {
      // não atrapalha quem está digitando num formulário
      if (!sessao || sujo || location.hash !== hash) return;
      const y = window.scrollY;
      rota().then(() => window.scrollTo(0, y));
    }, 200);
  }
  app.addEventListener('input', () => { sujo = true; });

  /** Depois do login, já busca o que as abas principais usam. */
  function preaquecer() {
    const pode = (sessao && sessao.usuario && sessao.usuario.pode) || {};
    const lista = [['resumo'], ['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}], ['modelos.listar', {}]];
    if (pode.financeiro) lista.push(['fin.resumo'], ['fin.honorarios', {}]);
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
  function lerDjenNavegador(forcar) {
    if (!sessao || djenRodando) return djenRodando;
    let ult = 0;
    try { ult = +localStorage.getItem('djen_ultimo') || 0; } catch (e) { /* sem memória do navegador */ }
    if (!forcar && Date.now() - ult < 2 * 3600e3) return null;
    try { localStorage.setItem('djen_ultimo', String(Date.now())); } catch (e) { /* idem */ }
    djenRodando = (async () => {
      try {
        const cfg = await chamar('djen.config', {});
        const itens = [];
        for (const o of cfg.oabs) {
          let tentativas = 0;
          for (let pg = 1; pg <= 20; pg++) {
            const url = `${DJEN_API}?numeroOab=${encodeURIComponent(o.numero)}&ufOab=${encodeURIComponent(o.uf)}&dataDisponibilizacaoInicio=${cfg.desde}&dataDisponibilizacaoFim=${cfg.hoje}&pagina=${pg}&itensPorPagina=100`;
            const resp = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
            if (resp.status === 429 && tentativas++ < 3) { await espera(4000 * tentativas); pg--; continue; }
            if (!resp.ok) throw new Error('o CNJ respondeu com o código ' + resp.status);
            const j = await resp.json();
            const lista = j.items || j.itens || [];
            lista.forEach(it => itens.push({
              id: it.id, hash: it.hash, numeroprocessocommascara: it.numeroprocessocommascara, numero_processo: it.numero_processo,
              data_disponibilizacao: it.data_disponibilizacao || it.dataDisponibilizacao, siglaTribunal: it.siglaTribunal,
              tipoComunicacao: it.tipoComunicacao, nomeOrgao: it.nomeOrgao, texto: String(it.texto || '').slice(0, 20000)
            }));
            if (lista.length < 100) break;
            await espera(500);
          }
        }
        // manda em lotes (o servidor recusa pedidos muito grandes)
        let novas = 0, prazos = 0, lote = [], tam = 0;
        const enviar = async fim => { const r = await api('djen.importar', { itens: lote, fim }); novas += r.novas || 0; prazos += r.prazos || 0; lote = []; tam = 0; };
        for (const it of itens) {
          const t = JSON.stringify(it).length;
          if (lote.length && (tam + t > 140000 || lote.length >= 150)) await enviar(false);
          lote.push(it); tam += t;
        }
        await enviar(true);
        if (novas) { avisar(`DJEN: ${novas} comunicação(ões) nova(s), ${prazos} prazo(s) novo(s).`); if (/^#\/(inicio|prazos)?$/.test(location.hash.split('?')[0] || '#/')) pedirRedesenho(); }
        return { ok: true, total: itens.length, novas, prazos };
      } catch (e) {
        const msg = e instanceof TypeError ? 'o navegador não conseguiu falar com o site do CNJ (bloqueio de acesso ou internet)' : e.message;
        chamar('djen.importar', { erro: msg }).catch(() => {});
        try { localStorage.setItem('djen_ultimo', String(Date.now() - 1.5 * 3600e3)); } catch (e2) { /* tenta de novo em 30 min */ }
        return { ok: false, erro: msg };
      } finally { djenRodando = null; }
    })();
    return djenRodando;
  }
  setInterval(() => { if (sessao) lerDjenNavegador(false); }, 30 * 60e3);

  /** Ao passar o mouse (ou encostar o dedo) numa aba, já começa a buscar o que ela mostra. */
  const LEITURAS_DA_ABA = {
    inicio: () => [['resumo'], ['agenda.listar', { inicio: hojeISO(), fim: isoSoma(hojeISO(), 14) }]],
    clientes: () => [['clientes.listar', {}], ['processos.listar', {}]],
    processos: () => [['processos.listar', {}]],
    prazos: () => [['prazos.listar', {}], ['resumo']],
    modelos: () => [['modelos.listar', {}], ['clientes.listar', {}]],
    financeiro: () => [['fin.resumo'], ['fin.honorarios', {}]]
  };
  function preBuscar(aba) { const f = LEITURAS_DA_ABA[aba]; if (f && sessao) f().forEach(([a, d]) => api(a, d).catch(() => {})); }

  async function chamar(acao, dados) {
    if (!API) throw new Error('O painel ainda não foi ligado ao Google. Veja painel-backend/INSTALAR.md.');
    let resp;
    try {
      resp = await fetch(API, { method: 'POST', body: JSON.stringify({ acao, token: sessao && sessao.token, dados: dados || {} }), redirect: 'follow' });
    } catch (e) {
      console.error('[painel] falha ao chamar o servidor', e);
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo. (' + (e && e.message || e) + ')');
    }
    let j;
    try { j = await resp.json(); } catch (e) { throw new Error('Resposta inesperada do servidor.'); }
    if (!j.ok) {
      if (j.sessao) { sair(true); }
      if (j.erro === 'Ação desconhecida.') throw new Error('Esta parte precisa da atualização do programa do Google (etapa 2): cole o Code.gs novo no Apps Script e implante uma nova versão.');
      throw new Error(j.erro || 'Erro.');
    }
    return j.dados;
  }

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

  function carregando() { mostrar(h('p', { class: 'carregando' }, 'Carregando…')); }

  /* ---------- sessão ---------- */

  function sair(expirou) {
    const token = sessao && sessao.token;
    sessao = null;
    esquecerTudo();
    try { sessionStorage.removeItem('painel_memoria'); } catch (e) { /* ok */ }
    guardar('painel_sessao', null);
    if (token && !expirou) fetch(API, { method: 'POST', body: JSON.stringify({ acao: 'logout', token }) }).catch(() => {});
    abasEl.hidden = true;
    quemEl.hidden = true;
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

  const ABAS = [
    ['inicio', 'Início'],
    ['clientes', 'Clientes'],
    ['processos', 'Processos'],
    ['prazos', 'Intimações'],
    ['agenda', 'Agenda'],
    ['modelos', 'Modelos'],
    ['financeiro', 'Financeiro', null, 'financeiro']
  ];

  function montarTopo() {
    const pode = sessao.usuario.pode;
    abasEl.replaceChildren(...ABAS.filter(a => !a[3] || pode[a[3]]).map(([id, nome, breve]) =>
      h('a', { href: '#/' + id, 'data-aba': id, onpointerenter: () => preBuscar(id), onfocus: () => preBuscar(id) }, nome, breve ? h('span', { class: 'breve' }, breve) : null)));
    document.getElementById('quem-nome').textContent = `${sessao.usuario.nome} · ${sessao.usuario.perfilNome}`;
    document.getElementById('menu-usuarios').hidden = !pode.usuarios;
    abasEl.hidden = false;
    quemEl.hidden = false;
  }

  function marcarAba(id) {
    abasEl.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.aba === id));
  }

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
      h('div', { class: 'campo' }, campo('senha', 'Senha', '', { obrigatorio: true, tipo: 'password', auto: 'new-password' })),
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
    const [r, ag] = await Promise.all([api('resumo'), api('agenda.listar', { inicio: hoje, fim: isoSoma(hoje, 14) }).catch(() => null)]);
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

    // atalhos para todos os tópicos
    const atalho = (href, nome, numero, legenda, cls) => h('a', { class: 'atalho ' + (cls || ''), href },
      h('span', { class: 'atalho-nome' }, nome), numero !== null ? h('b', {}, String(numero)) : h('b', { class: 'seta' }, '→'), h('span', { class: 'atalho-leg' }, legenda));
    const atalhos = h('nav', { class: 'atalhos', 'aria-label': 'Tópicos do painel' },
      atalho('#/prazos', 'Intimações', pz.vencidos || pz.vencendo, pz.vencidos ? 'prazo(s) vencido(s) — ver já' : 'prazo(s) vencem em até 5 dias', pz.vencidos ? 'alerta' : pz.vencendo ? 'atencao' : ''),
      atalho('#/agenda?visao=dia', 'Agenda', nHoje, nHoje === 1 ? 'compromisso hoje' : 'compromissos hoje'),
      atalho('#/clientes', 'Clientes', t.clientes, (r.clientesNovos || []).length ? `${r.clientesNovos.length} novo(s) em 30 dias` : 'cadastrados'),
      atalho('#/processos', 'Processos', t.processos, 'em andamento'),
      atalho('#/modelos', 'Modelos', null, 'procurações, contratos e petições'),
      pode.financeiro ? atalho('#/financeiro', 'Financeiro', null, 'honorários e parcelas') : null);

    // prazos: vencidos primeiro, depois os próximos pela data fatal
    const listaPrazos = pz.atrasados.concat(pz.proximos.filter(z => z.fatal)).slice(0, 7);
    const blocoPrazos = bloco('Prazos', '#/prazos', 'ver todos →',
      h('div', {},
        listaPrazos.length ? h('ul', { class: 'ini-lista' }, listaPrazos.map(z => item(() => { location.hash = '#/prazo/' + z.id; },
          selo(z.fatal, 'faixa-' + faixaPrazo(z)), z.descricao, (z.cliente || 'cliente a identificar') + ' · ' + z.numero, etiquetaContagem(z.fatal))))
          : vazio('Nenhum prazo em aberto com data fatal.'),
        pz.aDefinir ? h('a', { class: 'ini-alerta', href: '#/prazos' }, `${pz.aDefinir} intimação(ões) com prazo a definir`) : null,
        pz.aConferir ? h('a', { class: 'ini-aviso', href: '#/prazos' }, `${pz.aConferir} prazo(s) calculado(s) pelo robô a conferir`) : null));

    // audiências e perícias dos próximos 14 dias
    const atos = evAtos.map(e => ({ data: e.inicio.slice(0, 10), hora: hora(e), el: item(
      () => { location.hash = '#/agenda?visao=dia&data=' + e.inicio.slice(0, 10); },
      selo(e.inicio.slice(0, 10)), e.titulo, [hora(e), e.local].filter(Boolean).join(' · '),
      h('span', { class: 'chip ' + (CORES_AGENDA[e.agenda] || '') }, NOME_CURTO[e.agenda] || e.agenda)) }))
      .concat((r.proximos || []).filter(p => !jaNaAgenda(p)).map(p => ({ data: p.proximo_ato_data, hora: '', el: item(
        () => { location.hash = '#/processo/' + p.id; },
        selo(p.proximo_ato_data), p.proximo_ato, [p.cliente || 'cliente a identificar', p.orgao || p.numero].filter(Boolean).join(' · '),
        etiquetaDias(p.proximo_ato_data)) })))
      .sort((a, b) => (a.data + a.hora) < (b.data + b.hora) ? -1 : 1).slice(0, 8).map(x => x.el);
    const blocoAtos = bloco('Audiências e perícias', '#/agenda?visao=semana', 'agenda →',
      atos.length ? h('ul', { class: 'ini-lista' }, atos) : vazio('Nenhuma audiência ou perícia nos próximos 14 dias.'));

    // hoje
    const fataisHoje = pz.proximos.filter(z => z.fatal === hoje);
    const hojeItens = fataisHoje.map(z => item(() => { location.hash = '#/prazo/' + z.id; }, h('div', { class: 'ini-hora prazo' }, '23h59'), 'Prazo fatal: ' + z.descricao, (z.cliente || '') + ' · ' + z.numero))
      .concat((r.proximos || []).filter(p => p.proximo_ato_data === hoje && !jaNaAgenda(p)).map(p => item(() => { location.hash = '#/processo/' + p.id; },
        h('div', { class: 'ini-hora' }, (/(\d{1,2})h(\d{2})?|(\d{1,2}):(\d{2})/.exec(p.proximo_ato) || [''])[0] || 'hoje'), p.proximo_ato, [p.cliente || 'cliente a identificar', p.orgao || p.numero].filter(Boolean).join(' · '))))
      .concat(deHoje.map(e => item(() => { location.hash = '#/agenda?visao=dia&data=' + hoje; }, h('div', { class: 'ini-hora' }, hora(e)), e.titulo,
        [NOME_CURTO[e.agenda] || e.agenda, e.local].filter(Boolean).join(' · '))));
    const novos = (r.clientesNovos || []).slice(0, 4);
    const blocoHoje = bloco('Hoje', '#/agenda?visao=dia', 'dia →',
      h('div', {},
        hojeItens.length ? h('ul', { class: 'ini-lista' }, hojeItens) : vazio(ag ? 'Nada marcado para hoje.' : 'Agenda indisponível no momento.'),
        novos.length ? h('div', { class: 'ini-novos' }, h('h3', {}, 'Clientes novos'),
          h('ul', { class: 'lista-simples' }, novos.map(c => h('li', { onclick: () => { location.hash = '#/cliente/' + c.id; } },
            h('strong', {}, c.nome), h('span', { class: 'peq' }, ' · ' + new Date(c.criado_em).toLocaleDateString('pt-BR')))))) : null));

    mostrar(
      h('div', { class: 'ini-topo' },
        h('div', {}, h('p', { class: 'cap' }, hojeExtenso().replace(/^./, c => c.toUpperCase())), h('h1', {}, `${saudacao()}, ${primeiroNome(r.usuario.nome)}`)),
        h('a', { class: 'btn', href: '#/cliente/novo' }, '+ Novo cliente')),
      atalhos,
      h('div', { class: 'ini-grade' }, blocoPrazos, blocoAtos, blocoHoje),
      h('p', { class: 'peq mt ini-robo' }, linhaRobo(r.robo)));
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

  async function telaClientes(params) {
    carregando();
    const busca = params.get('busca') || '';
    const soConferir = params.get('conferir') === '1';
    const area = params.get('area') || '';
    const limite = Math.max(150, parseInt(params.get('mais'), 10) || 150);
    const [todos, procs] = await Promise.all([api('clientes.listar', { busca }), api('processos.listar', {})]);
    let lista = todos;
    if (soConferir) lista = lista.filter(c => c.situacao !== 'completo');
    if (area) lista = lista.filter(c => (c.area || 'Sem área') === area);
    const porArea = {};
    todos.forEach(c => { const a = c.area || 'Sem área'; porArea[a] = (porArea[a] || 0) + 1; });
    const comProc = todos.filter(c => c.processos > 0).length;
    const aConferir = todos.filter(c => c.situacao !== 'completo').length;
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar por nome, CPF, telefone ou cidade', 'aria-label': 'Buscar clientes' }),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'conferir', checked: soConferir }), 'Só a conferir'),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    const ir = (mud) => {
      const q = new URLSearchParams({ busca, area, conferir: soConferir ? '1' : '', mais: '', ...mud });
      [...q.keys()].forEach(k => { if (!q.get(k)) q.delete(k); });
      location.hash = '#/clientes' + (q.toString() ? '?' + q : '');
    };
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ busca: form.busca.value.trim(), conferir: form.conferir.checked ? '1' : '' }); });
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Clientes'), h('p', { class: 'peq' }, `${todos.length} clientes · ${comProc} com processo`, aConferir ? h('span', {}, ' · ', h('a', { href: '#/clientes?conferir=1' }, `${aConferir} cadastros a completar`)) : null)),
        botao('Novo cliente', () => { location.hash = '#/cliente/novo'; })),
      h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip-filtro' + (!area ? ' ativo' : ''), onclick: () => ir({ area: '' }) }, `Todas as áreas (${todos.length})`),
        Object.keys(porArea).sort().map(a => h('button', { type: 'button', class: 'chip-filtro' + (area === a ? ' ativo' : ''), onclick: () => ir({ area: a }) }, `${a} (${porArea[a]})`))),
      form,
      h('p', { class: 'peq' }, lista.length > limite ? `Mostrando ${limite} de ${lista.length}. Use a busca para achar mais rápido.` : `${lista.length} na lista`),
      tabela(['Nome', 'Tipo de ação', 'Telefone', 'Área', 'Processos', 'Cadastro'], lista.slice(0, limite), c => [
        h('td', { 'data-r': 'Nome' }, h('strong', {}, c.nome), c.cpf_cnpj ? h('div', { class: 'peq' }, c.cpf_cnpj) : null),
        h('td', { 'data-r': 'Tipo de ação' }, c.tipo_acao || h('span', { class: 'peq' }, '—')),
        h('td', { class: 'num', 'data-r': 'Telefone' }, c.telefone),
        h('td', { 'data-r': 'Área' }, c.area),
        h('td', { 'data-r': 'Processos' }, String(c.processos)),
        h('td', { 'data-r': 'Cadastro' }, etiquetaSituacao(c.situacao), c.pasta_url ? null : h('div', { class: 'peq' }, 'sem pasta'))
      ], c => { location.hash = '#/cliente/' + c.id; }, 'Nenhum cliente encontrado.'),
      lista.length > limite ? h('div', { class: 'acoes' }, botao(`Mostrar mais ${Math.min(150, lista.length - limite)}`, () => ir({ mais: String(limite + 150) }), 'sec')) : null);
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

  /** Formulário de geração. opc: { cliente } (ficha) ou { clientes, clienteInicial } (aba Modelos). */
  function formGerar(info, opc) {
    const advs = info.advogados || [];
    const padrao = (advs.find(a => a.padrao === 'sim') || advs[0] || {}).id || '';
    const tipoDoCliente = opc.cliente && opc.cliente.tipo_acao ? (info.tipos.find(t => t.nome === opc.cliente.tipo_acao) || {}).chave || '' : '';

    let blocoCliente;
    const idCliente = h('input', { type: 'hidden', name: 'cliente_id', value: opc.cliente ? opc.cliente.id : (opc.clienteInicial || '') });
    if (opc.cliente) blocoCliente = idCliente;
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
        h('datalist', { id: 'dl-clientes' }, opc.clientes.map(c => h('option', { value: rotulo(c) }))), idCliente, aviso);
    }

    // nº do processo: opcional; obrigatório só para petições e substabelecimento
    const dlProc = h('datalist', { id: 'dl-processos' });
    const rotProc = h('label', { for: 'f-numero_processo' }, 'Número do processo (opcional)');
    const avisoProc = h('div', { class: 'peq' }, 'Escolha um processo do cliente ou digite o número. Puxa o juízo e a parte contrária do cadastro do processo.');
    const campoProc = h('div', {}, rotProc, h('input', { id: 'f-numero_processo', name: 'numero_processo', list: 'dl-processos', inputmode: 'numeric', autocomplete: 'off', placeholder: '0000000-00.0000.0.00.0000', maxlength: 25 }), dlProc, avisoProc);
    const orgaos = {};
    const campoVara = campo('vara', 'Vara / juízo (opcional)', '', { max: 120, dica: 'Ex.: 2ª Vara Cível, 1ª Vara do Trabalho' });
    const campoComarca = campo('comarca', 'Comarca (cidade/UF)', '', { max: 80, dica: 'Ex.: Tubarão/SC' });
    const carregarProcessos = async id => {
      dlProc.replaceChildren();
      if (!id) return;
      try {
        const r = await api('clientes.obter', { id });
        r.processos.forEach(p => { orgaos[p.numero] = p.orgao || ''; });
        dlProc.replaceChildren(...r.processos.filter(p => p.numero).map(p => h('option', { value: p.numero }, [p.area, p.orgao, p.parte_contraria].filter(Boolean).join(' · '))));
        avisoProc.textContent = r.processos.length ? `${r.processos.length} processo(s) deste cliente na lista.` : 'Este cliente não tem processo cadastrado; digite o número, se houver.';
      } catch (e) { /* digita à mão */ }
    };
    if (opc.cliente) carregarProcessos(opc.cliente.id);
    else if (opc.clienteInicial) carregarProcessos(opc.clienteInicial);

    const grupos = {};
    info.modelos.forEach(m => { (grupos[m.grupo] = grupos[m.grupo] || []).push(m); });
    const marcados = opc.marcar || ['procuracao', 'contrato'];
    const ORDEM_GRUPOS = ['Procuração e declarações', 'Petições (precisam do nº do processo)', 'Contratos, recibos e cobrança', 'Modelos do escritório (Drive)'];
    const posGrupo = g => { const i = ORDEM_GRUPOS.indexOf(g); return i < 0 ? 99 : i; };
    const docs = h('div', { class: 'docs-escolha' }, Object.keys(grupos).sort((a, b) => posGrupo(a) - posGrupo(b)).map(g => h('div', { class: 'grupo-docs' },
      h('div', { class: 'grupo-tit' }, g),
      grupos[g].map(m => h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'doc', value: m.chave, checked: marcados.includes(m.chave) }), m.nome)))));

    const campoF = (nome, rotulo, valor, extra, formas) => { const el = campo(nome, rotulo, valor, extra); el.dataset.formas = formas.join(' '); return el; };
    const lancar = h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'lancar', checked: true }), 'Lançar também no Financeiro (cria o honorário e as parcelas)');
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
      lancar);
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
        campo('tipo_acao', 'Tipo de ação', tipoDoCliente, { opcoes: [['', '— escolha —']].concat(info.tipos.map(t => [t.chave, t.nome])) }),
        campoProc, campoVara, campoComarca),
      h('h4', {}, 'Quais documentos'), docs, notaCobranca, menoresBox, hon, rec,
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar em PDF')),
      h('p', { class: 'erro' }), h('div', { class: 'gerados' }));

    const atualizar = () => {
      const escolhidos = [...form.querySelectorAll('input[name=doc]:checked')].map(i => info.modelos.find(m => m.chave === i.value));
      const comHon = escolhidos.some(m => m && (m.honorarios || m.mensal));
      hon.hidden = !comHon;
      rec.hidden = !escolhidos.some(m => m && m.recibo);
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
    form.addEventListener('change', ev => { if (ev.target.name === 'forma') form.dataset.mexeu = '1'; atualizar(); });
    // ao escolher o processo, mostra a vara cadastrada (o painel completa o que ficar vazio)
    form.numero_processo.addEventListener('input', () => {
      const o = orgaos[form.numero_processo.value.trim()];
      form.vara.placeholder = o ? 'do processo: ' + o : 'Ex.: 2ª Vara Cível, 1ª Vara do Trabalho';
      form.comarca.placeholder = o ? 'do processo (deixe vazio para usar)' : 'Ex.: Tubarão/SC';
    });
    atualizar();

    aoEnviar(form, async fd => {
      if (!fd.get('cliente_id')) throw new Error('Escolha o cliente na lista.');
      const modelos = fd.getAll('doc');
      if (!modelos.length) throw new Error('Marque pelo menos um documento.');
      if (!(fd.get('numero_processo') || '').trim() && modelos.some(k => (info.modelos.find(m => m.chave === k) || {}).processo)) throw new Error('Informe o número do processo: as petições e o substabelecimento precisam dele.');
      const dados = {
        cliente_id: fd.get('cliente_id'), modelos, advogado_id: fd.get('advogado_id'), tipo_acao: fd.get('tipo_acao'),
        numero_processo: (fd.get('numero_processo') || '').trim(), vara: fd.get('vara'), comarca: fd.get('comarca'),
        honorarios: hon.hidden ? null : { forma: fd.get('forma'), percentual: fd.get('percentual'), valor_total: fd.get('valor_total'),
          parcelas: fd.get('parcelas'), primeiro_vencimento: fd.get('primeiro_vencimento'), dia_demais: fd.get('dia_demais'), valor_mensal: fd.get('valor_mensal'),
          dia_vencimento: fd.get('dia_vencimento'), lancar: !!fd.get('lancar') },
        recibo: rec.hidden ? null : { valor: fd.get('recibo_valor'), referente: fd.get('recibo_referente') },
        representacao: fd.get('representacao'),
        menores: menoresBox.hidden ? [] : fd.getAll('menor_nome').map((nome, i) => ({ nome: nome.trim(), cpf: fd.getAll('menor_cpf')[i], nascimento: fd.getAll('menor_nasc')[i], genero: fd.getAll('menor_sexo')[i] })).filter(m => m.nome)
      };
      const r = await api('documentos.gerar', dados);
      form.querySelector('.gerados').replaceChildren(...[
        r.faltando.length ? h('div', { class: 'nota alerta' }, 'Atenção, faltou no cadastro: ' + r.faltando.join(', ') + '. Esses campos saíram em branco; complete o cadastro e gere de novo.') : null,
        h('div', { class: 'nota ok' }, h('strong', {}, `${r.gerados.length} documento${r.gerados.length === 1 ? '' : 's'} gerado${r.gerados.length === 1 ? '' : 's'} na pasta do cliente.`),
          r.pasta_assinar ? h('span', {}, ' Os que o cliente assina estão em ', h('a', { href: r.pasta_assinar, target: '_blank', rel: 'noopener noreferrer' }, 'DOCUMENTOS PARA ASSINAR'), '.') : '',
          r.lancados ? ` ${r.lancados} honorário(s) lançado(s) no Financeiro.` : '', r.ja_lancados ? ` ${r.ja_lancados} honorário(s) igual(is) já estava(m) no Financeiro e não foi(ram) lançado(s) de novo.` : ''),
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
            : botao('Criar pasta no Drive', async ev => { ev.target.disabled = true; try { await api('clientes.criarPasta', { id: c.id }); avisar('Pasta criada.'); rota(); } catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'sec')),
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
          soPF(campo('rg', 'RG', c.rg, { max: 30, obrigatorio: novo })),
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
          campo('origem', 'Como chegou ao escritório', c.origem, { max: 120, dica: 'Indicação, Instagram, site…' }))),
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
        if (dados.tipo !== 'PJ' && !dados.rg.trim()) falta.push('RG');
        if (dados.tipo !== 'PJ' && !dados.profissao.trim()) falta.push('profissão');
        if (!dados.endereco.trim()) falta.push('endereço');
        if (falta.length) throw new Error('Para cadastrar, preencha: ' + falta.join(', ') + '.');
      } else dados.id = c.id;
      const res = await api('clientes.salvar', { cliente: dados });
      if (res.avisoPasta) avisar(res.avisoPasta, true);
      else avisar(novo ? 'Cliente cadastrado e pasta criada.' : 'Alterações salvas.');
      if (novo) location.hash = '#/modelos?cliente=' + encodeURIComponent(res.id) + '&novo=1'; else telaCliente(c.id);
    });
    return form;
  }

  /** Seção que abre e fecha pela seta (como "Editar cadastro"). Carrega o conteúdo só ao abrir. */
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
        const linhas = String(obs || '').split('\n').map(l => l.trim()).filter(Boolean)
          .flatMap(l => /^\[\d{2}\/\d{2}\/\d{4}/.test(l) ? [l] : l.split(' | '));
        lista.replaceChildren(...(linhas.length ? linhas.map(l => {
          const m = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) — ([^\]]+)\] (.*)$/.exec(l);
          return m ? h('li', {}, h('div', { class: 'nota-cab' }, h('strong', {}, m[2]), ' · ', m[1]), h('div', {}, m[3]))
            : h('li', { class: 'antiga' }, h('div', { class: 'nota-cab' }, 'registro antigo'), h('div', {}, l));
        }) : [h('li', { class: 'vazia' }, 'Nenhuma observação ainda.')]));
      };
      desenhar(c.observacoes);
      const f = h('form', { class: 'nota-form', novalidate: true },
        h('textarea', { name: 'texto', rows: 3, maxlength: 2000, placeholder: 'Escreva uma observação sobre o cliente (atendimento, combinado, pendência…)', 'aria-label': 'Nova observação' }),
        h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar observação')), h('p', { class: 'erro' }));
      aoEnviar(f, async fd => {
        const r = await api('clientes.nota', { id: c.id, texto: fd.get('texto') });
        c.observacoes = r.observacoes; f.reset(); desenhar(r.observacoes); avisar('Observação salva.');
      });
      return h('div', {}, f, lista);
    };

    const procs = () => h('div', {},
      h('div', { class: 'acoes-sec' }, botao('Novo processo', () => { location.hash = '#/processo/novo?cliente=' + encodeURIComponent(c.id); }, 'sec')),
      tabela(['Processo', 'Área', 'Órgão', 'Parte contrária', 'Situação'], r.processos, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Área' }, p.area || '—', h('div', { class: 'peq' }, p.tribunal)),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Parte contrária' }, p.parte_contraria),
        h('td', { 'data-r': 'Situação' }, p.status === 'arquivado' ? h('span', { class: 'tag' }, 'arquivado') : h('span', { class: 'tag ok' }, 'em andamento'),
          p.proximo_ato ? h('div', { class: 'peq' }, p.proximo_ato) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo ligado a este cliente.'));

    const hons = () => {
      const caixa = h('div', {}, h('p', { class: 'peq' }, 'Carregando…'));
      api('fin.honorarios', { cliente_id: c.id }).catch(() => []).then(hs => caixa.replaceChildren(
        h('div', { class: 'acoes-sec' }, botao('Novo honorário', () => { location.hash = '#/honorario/novo?cliente=' + c.id; }, 'sec')),
        tabela(['Tipo', 'Descrição', 'Recebido', 'Em atraso', 'Situação'], hs, x => [
          h('td', {}, TIPOS_HON[x.tipo] || x.tipo), h('td', {}, x.descricao), h('td', { class: 'num' }, reais(x.resumo.pago)),
          h('td', { class: 'num' }, x.resumo.atrasado ? h('span', { class: 'tag urgente' }, reais(x.resumo.atrasado)) : '—'), h('td', {}, x.situacao)
        ], x => { location.hash = '#/honorario/' + x.id; }, 'Nenhum honorário cadastrado.')));
      return caixa;
    };

    const pasta = () => { const d = caixaDocumentos(c); d.className = 'docs-pasta'; return d; };
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, c.nome),
        h('p', {}, etiquetaSituacao(c.situacao), r.processos.length ? ` · ${r.processos.length} processo${r.processos.length === 1 ? '' : 's'}` : '')),
        h('a', { class: 'btn', href: '#/modelos?cliente=' + encodeURIComponent(c.id) }, 'Gerar documentos')),
      incompleto ? h('div', { class: 'nota alerta' }, 'Cadastro incompleto: confira CPF, RG, profissão e endereço antes de gerar procuração ou contrato. Ao terminar, mude "Cadastro" para Completo.') : null,
      descricao,
      secao('Observações', notas, true),
      secao('Pasta do cliente', pasta, false),
      secao('Fotos e conversas do WhatsApp', () => caixaWhats(c), false),
      secao(`Processos (${r.processos.length})`, procs, false),
      sessao.usuario.pode.financeiro ? secao('Honorários', hons, false) : null,
      h('details', { class: 'caixa secao editar-cad', open: incompleto }, h('summary', {}, 'Editar cadastro'), formCliente(c, false)));
  }

  /* ---------- processos ---------- */

  async function telaProcessos(params) {
    carregando();
    const busca = params.get('busca') || '';
    const semCliente = params.get('semcliente') === '1';
    const area = params.get('area') || '';
    const sit = params.get('sit') || 'todos';
    const trib = params.get('trib') || '';
    const cli = params.get('cli') || '';
    const ato = params.get('ato') === '1';
    const todosSit = await api('processos.listar', { busca, semCliente });
    const nAtivos = todosSit.filter(p => p.status !== 'arquivado').length, nArq = todosSit.length - nAtivos;
    const tribunais = [...new Set(todosSit.map(p => p.tribunal || '—'))].sort();
    const todos = todosSit
      .filter(p => sit === 'todos' || (p.status === 'arquivado') === (sit === 'arquivado'))
      .filter(p => !trib || (p.tribunal || '—') === trib)
      .filter(p => !cli || (cli === 'com' ? !!p.cliente_id : !p.cliente_id))
      .filter(p => !ato || (p.proximo_ato_data && p.proximo_ato_data >= hojeISO()));
    const nomeArea = p => p.area || 'Sem área';
    const lista = area ? todos.filter(p => nomeArea(p) === area) : todos;
    const porArea = {}, porTrib = {};
    todos.forEach(p => { porArea[nomeArea(p)] = (porArea[nomeArea(p)] || 0) + 1; const t = p.tribunal || '—'; porTrib[t] = (porTrib[t] || 0) + 1; });
    const ordemAreas = ['Trabalhista', 'Cível', 'Previdenciário', 'Federal', 'Empresarial', 'Família', 'Criminal', 'Consumidor', 'Cobrança de honorários'];
    const areas = Object.keys(porArea).sort((a, b) => ((ordemAreas.indexOf(a) + 1) || 99) - ((ordemAreas.indexOf(b) + 1) || 99));
    const ir = mud => {
      const q = new URLSearchParams({ busca, area, sit: sit === 'todos' ? '' : sit, trib, cli, ato: ato ? '1' : '', semcliente: semCliente ? '1' : '', ...mud });
      [...q.keys()].forEach(k => { if (!q.get(k)) q.delete(k); });
      location.hash = '#/processos' + (q.toString() ? '?' + q : '');
    };
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar por número, cliente, parte contrária ou vara', 'aria-label': 'Buscar processos' }),

      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ busca: form.busca.value.trim() }); });
    const relatorio = h('aside', { class: 'caixa relatorio' },
      h('h3', {}, 'Quantas ações por área'),
      h('table', { class: 'mini-tab' }, h('tbody', {}, areas.map(a => h('tr', { onclick: () => ir({ area: a }) },
        h('td', {}, a), h('td', { class: 'num' }, h('strong', {}, String(porArea[a]))),
        h('td', { class: 'barra-cel' }, h('span', { class: 'barrinha', 'data-w': Math.round(porArea[a] / todos.length * 100) })))))),
      h('h3', { class: 'mt' }, 'Por tribunal'),
      h('table', { class: 'mini-tab' }, h('tbody', {}, Object.keys(porTrib).sort((a, b) => porTrib[b] - porTrib[a]).map(t => h('tr', {}, h('td', {}, t), h('td', { class: 'num' }, String(porTrib[t])))))));
    const principal = h('div', { class: 'col-principal' },
      h('div', { class: 'filtros-proc' },
        h('label', {}, 'Situação', h('select', { onchange: e => ir({ sit: e.target.value === 'todos' ? '' : e.target.value, area: '' }) },
          [['todos', `Todos (${todosSit.length})`], ['ativo', `Em andamento (${nAtivos})`], ['arquivado', `Arquivados / baixados (${nArq})`]].map(([v, t]) => h('option', { value: v, selected: sit === v }, t)))),
        h('label', {}, 'Área', h('select', { onchange: e => ir({ area: e.target.value }) },
          h('option', { value: '' }, `Todas (${todos.length})`), areas.map(a => h('option', { value: a, selected: area === a }, `${a} (${porArea[a]})`)))),
        h('label', {}, 'Tribunal', h('select', { onchange: e => ir({ trib: e.target.value, area: '' }) },
          h('option', { value: '' }, 'Todos'), tribunais.map(t => h('option', { value: t, selected: trib === t }, t)))),
        h('label', {}, 'Cliente', h('select', { onchange: e => ir({ cli: e.target.value }) },
          [['', 'Todos'], ['com', 'Com cliente cadastrado'], ['sem', 'Sem cliente (a identificar)']].map(([v, t]) => h('option', { value: v, selected: cli === v }, t)))),
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: ato, onchange: e => ir({ ato: e.target.checked ? '1' : '' }) }), 'Só com audiência/ato marcado'),
        (sit !== 'todos' || trib || cli || ato || area || busca) ? h('button', { type: 'button', class: 'link escuro', onclick: () => { location.hash = '#/processos'; } }, 'Limpar filtros') : null),
      form,
      compacta(tabela(['Processo', 'Cliente', 'Tribunal', 'Órgão', 'Próximo ato'], lista, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', p.status === 'arquivado' ? h('span', { class: 'tag mini-tag' }, 'arquivado') : null, h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Cliente' }, p.cliente_id ? p.cliente_nome : h('span', { class: 'tag atencao' }, p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome + ' (sem cadastro)' : 'a identificar')),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal, p.sistema ? h('span', { class: 'peq' }, ' · ' + p.sistema) : null),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato
          ? h('div', { class: 'ato-linha' }, h('span', {}, atoComData(p.proximo_ato, p.proximo_ato_data)), p.proximo_ato_data ? etiquetaDias(p.proximo_ato_data) : null)
          : h('span', { class: 'peq' }, p.ultimo_movimento_em ? 'últ. mov. ' + new Date(p.ultimo_movimento_em).toLocaleDateString('pt-BR') : '—'))
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo encontrado.')));
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, area || 'Processos'), h('p', {}, `${lista.length} processo${lista.length === 1 ? '' : 's'}${area ? ' nesta área' : ''} · ${sit === 'arquivado' ? 'arquivados ou baixados' : sit === 'todos' ? 'em andamento e arquivados' : 'em andamento'}${trib ? ' · ' + trib : ''}`)),
        botao('Novo processo', () => { location.hash = '#/processo/novo'; })),
      h('div', { class: 'duas-colunas' }, principal, relatorio));
    document.querySelectorAll('.barrinha').forEach(el => { el.style.setProperty('--w', el.dataset.w + '%'); });
  }

  async function telaProcesso(id, params) {
    carregando();
    const novo = id === 'novo';
    const [clientes, lista] = await Promise.all([api('clientes.listar', {}), novo ? Promise.resolve([]) : api('processos.listar', {})]);
    const p = novo ? { cliente_id: params.get('cliente') || '', status: 'ativo' } : lista.find(x => x.id === id);
    if (!p) throw new Error('Processo não encontrado.');
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
      avisar(novo ? 'Processo cadastrado.' : 'Alterações salvas.');
      location.hash = '#/processo/' + res.id;
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
      !novo && (p.proximo_ato || p.ultimo_movimento) ? h('section', { class: 'caixa resumo-proc' },
        p.proximo_ato ? h('p', {}, h('strong', {}, 'Próximo ato: '), atoComData(p.proximo_ato, p.proximo_ato_data), ' ', p.proximo_ato_data ? etiquetaDias(p.proximo_ato_data) : '') : null,
        p.ultimo_movimento ? h('p', {}, h('strong', {}, 'Última movimentação'), p.ultimo_movimento_em ? ` (${new Date(p.ultimo_movimento_em).toLocaleDateString('pt-BR')})` : '', ': ', p.ultimo_movimento) : null) : null,
      prazosProc, form);
  }

  /* ---------- usuários ---------- */

  const PERFIS = [['secretario', 'Secretário (tudo, menos financeiro)'], ['advogada', 'Advogada (tudo, menos financeiro; confere prazos)'], ['estagiario', 'Estagiário (tudo, menos financeiro)'], ['administrador', 'Administrador (tudo)']];

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
        campo('senha', 'Senha inicial', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' })),
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
        h('li', { class: seg.planilhaPrivada ? 'ok' : 'alerta' }, h('strong', {}, 'Planilha de dados: '), seg.planilhaPrivada ? 'privada, só a conta do escritório acessa' : 'ATENÇÃO: compartilhada com ' + seg.compartilhadaCom.join(', ')),
        h('li', { class: 'ok' }, h('strong', {}, 'Senhas: '), 'guardadas embaralhadas com chave secreta; ninguém consegue ler, nem na planilha'),
        h('li', { class: 'ok' }, h('strong', {}, 'Sessões: '), 'caem após 30 minutos parado no painel, 6 horas sem uso ou 12 horas no total; trocar a senha derruba as outras'),
        h('li', { class: seg.falhasRecentes ? 'alerta' : 'ok' }, h('strong', {}, 'Tentativas de entrada erradas (7 dias): '), String(seg.falhasRecentes)),
        h('li', { class: 'ok' }, h('strong', {}, 'Registro: '), 'todo login, alteração e acesso negado fica na aba Log da planilha'))) : null;
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Usuários'), h('p', {}, 'Quem pode entrar no painel e o que cada um vê.'))),
      caixaSeg,
      tabela(['Nome', 'Usuário', 'Perfil', 'Situação', 'Último acesso'], lista, u => [
        h('td', { 'data-r': 'Nome' }, u.nome),
        h('td', { 'data-r': 'Usuário' }, u.usuario),
        h('td', { 'data-r': 'Perfil' }, (PERFIS.find(p => p[0] === u.perfil) || [0, u.perfil])[1].split(' (')[0]),
        h('td', { 'data-r': 'Situação' }, u.ativo === 'sim' ? h('span', { class: 'tag ok' }, 'ativo') : h('span', { class: 'tag' }, 'desativado'), u.bloqueado ? h('span', { class: 'tag urgente' }, 'bloqueado') : null),
        h('td', { 'data-r': 'Último acesso' }, u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—')
      ], u => editarUsuario(u), 'Nenhum usuário.'),
      h('div', { id: 'editar-usuario' }),
      h('section', { class: 'caixa' }, h('h2', {}, 'Quem pode ver o quê'),
        h('table', { class: 'mini-tab permissoes' }, h('thead', {}, h('tr', {}, ['Perfil', 'Clientes, processos, intimações, agenda e modelos', 'Conferir prazos', 'Financeiro e contratos', 'Usuários'].map(x => h('th', {}, x)))),
          h('tbody', {}, [['Administrador', '✓', '✓', '✓', '✓'], ['Advogada', '✓', '✓', '—', '—'], ['Secretário', '✓', '—', '—', '—'], ['Estagiário', '✓', '—', '—', '—']]
            .map(l => h('tr', {}, l.map((x, i) => h(i ? 'td' : 'th', { scope: i ? null : 'row' }, x))))))),
      form,
      await relatorioCumpridos());
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
        campo('senha', 'Nova senha (deixe em branco para manter)', '', { tipo: 'password', auto: 'new-password' })),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
        botao('Desconectar agora', async ev => {
          ev.target.disabled = true;
          try { await api('usuarios.salvar', { id: u.id, desconectar: true }); avisar(`${u.nome} foi desconectado(a) de todos os aparelhos.`); }
          catch (e) { avisar(e.message, true); } ev.target.disabled = false;
        }, 'sec'),
        u.bloqueado ? botao('Desbloquear', async () => { await api('usuarios.salvar', { id: u.id, desbloquear: true }); avisar('Usuário desbloqueado.'); telaUsuarios(); }, 'sec') : null,
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
      h('div', { class: 'campo' }, campo('nova', 'Nova senha', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' })),
      h('div', { class: 'campo' }, campo('nova2', 'Repita a nova senha', '', { tipo: 'password', obrigatorio: true, auto: 'new-password' })),
      h('button', { type: 'submit', class: 'btn' }, 'Trocar senha'),
      h('p', { class: 'erro' }));
    aoEnviar(form, async fd => {
      if (fd.get('nova') !== fd.get('nova2')) throw new Error('As senhas novas não conferem.');
      const r = await api('senha.trocar', { atual: fd.get('atual'), nova: fd.get('nova') });
      if (r && r.token) { sessao.token = r.token; guardar('painel_sessao', sessao); } // as outras sessões abertas caem
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
      const d = Math.floor(-ms / 86400000);
      return { cls: 'tag', texto: d === 0 ? 'venceu hoje' : `venceu há ${d} dia${d === 1 ? '' : 's'}`, vencido: true };
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
    if (z.situacao === 'conferido') return h('span', { class: 'tag ok', title: z.conferido_em ? new Date(z.conferido_em).toLocaleString('pt-BR') : '' }, 'conferido' + (z.conferido_por ? ' por ' + z.conferido_por : ''));
    if (z.situacao === 'calculado') return h('span', {},
      /PROVISÓRIO/i.test(z.descricao || '') ? h('span', { class: 'tag urgente', title: 'O aviso não diz qual é o ato. O robô usou o prazo mais curto: confira no sistema do tribunal.' }, 'provisório · conferir') : null,
      ' ', h('span', { class: 'tag atencao' }, z.origem === 'robô' ? 'calculado pelo robô' : 'lançado · a conferir'));
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

  function botoesPrazo(z) {
    const pode = sessao.usuario.pode;
    const parar = fn => ev => { ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; fn().catch(e => { b.disabled = false; avisar(e.message, true); }); };
    return h('div', { class: 'mini-acoes' },
      pode.conferePrazos && z.situacao === 'calculado'
        ? h('button', { type: 'button', class: 'btn mini', onclick: parar(() => acaoPrazo('prazos.conferir', { id: z.id }, 'Prazo conferido.')) }, 'Conferir') : null,
      SITUACOES_ABERTAS.includes(z.situacao)
        ? h('button', { type: 'button', class: 'btn mini sec', onclick: parar(() => acaoPrazo('prazos.situacao', { id: z.id, situacao: 'cumprido' }, 'Prazo marcado como cumprido.')) }, 'Cumprido')
        : h('button', { type: 'button', class: 'btn mini sec', onclick: parar(() => acaoPrazo('prazos.situacao', { id: z.id, situacao: 'reabrir' }, 'Prazo reaberto.')) }, 'Reabrir'));
  }
  const SITUACOES_ABERTAS = ['a definir', 'calculado', 'conferido'];

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
      h('td', { class: 'num col-fatal', 'data-r': 'Fatal' }, z.fatal ? h('strong', { class: 'data-fatal' }, dataBR(z.fatal)) : '—', h('div', {}, etiquetaContagem(z.fatal))),
      h('td', { class: 'num', 'data-r': 'Processo' }, z.numero, h('div', {}, acessoTribunal(z.numero))),
      h('td', { 'data-r': 'Cliente' }, z.cliente || h('span', { class: 'tag atencao' }, 'a identificar')),
      h('td', { 'data-r': 'O que fazer' }, h('div', { class: 'desc-prazo', title: z.descricao }, z.descricao), h('div', { class: 'peq' }, textoDias(z), z.ciencia ? ` · ciência ${dataBR(z.ciencia)}` : '')),
      h('td', { 'data-r': 'Situação' }, etiquetaPrazo(z)),
      h('td', {}, botoesPrazo(z))
    ], z => { location.hash = '#/prazo/' + z.id; }, vazio, z => 'linha-' + faixaPrazo(z)));
  }

  function linhaRobo(robo) {
    if (!robo || !robo.ultima) return 'O robô ainda não rodou. Ele lê o DJEN e os avisos do eproc e do PJe no Gmail de 6 em 6 horas.';
    return `Última leitura do robô: ${new Date(robo.ultima).toLocaleString('pt-BR')}. ${robo.resultado ? robo.resultado.replace(/^Robô em [^:]+: /, '') : ''}`;
  }

  const quando = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  /** Cartão do robô: última e próxima leitura; se estiver atrasado, roda sozinho ao abrir a tela. */
  function cartaoRobo(robo) {
    const atrasado = !robo || !robo.ultima || robo.atrasado;
    const status = h('div', { class: 'robo-txt' },
      h('strong', {}, atrasado ? 'Robô atrasado: atualizando agora…' : 'Robô ligado · lê o Gmail de 6 em 6 horas e o DJEN de 2 em 2 horas'),
      h('div', { class: 'peq' }, robo && robo.ultima ? `Última leitura: ${quando(robo.ultima)}` + (robo.proxima ? ` · próxima: ${quando(robo.proxima)}` : '') : 'Ainda não houve leitura.'),
      robo && robo.resultado ? h('div', { class: 'peq' }, robo.resultado.replace(/^Robô em [^:]+: /, '')) : null);
    const rodar = async btn => {
      if (btn) { btn.disabled = true; btn.textContent = 'Lendo intimações…'; }
      try { const r = await api('robo.rodar'); avisar(r.resumo.replace(/^Robô em [^:]+: /, '')); rota(); }
      catch (e) { avisar(e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Atualizar agora'; } }
    };
    const btn = botao('Atualizar agora', ev => rodar(ev.target), 'sec');
    const dj = (robo && robo.djen) || {};
    const hojeD = hojeISO();
    const linkDjen = djenLinkPublico('54832', 'SC', isoSoma(hojeD, -7), hojeD);
    const linhaDjen = h('div', { class: 'peq djen-linha' + (dj.erro ? ' erro' : '') },
      h('strong', {}, 'DJEN: '),
      dj.ultima ? `lido pelo computador do escritório em ${quando(dj.ultima)} (de 2 em 2 horas com o painel aberto)` : 'ainda não foi lido pelo navegador',
      dj.erro ? h('span', {}, ' · último problema: ' + dj.erro) : null,
      ' · ', h('button', { type: 'button', class: 'link escuro', onclick: async ev => {
        ev.target.disabled = true; ev.target.textContent = 'lendo o DJEN…';
        const r = await lerDjenNavegador(true);
        if (r && r.ok) { avisar(`DJEN lido: ${r.total} comunicação(ões) no período, ${r.novas} nova(s).`); rota(); }
        else { avisar('Não consegui ler o DJEN: ' + ((r && r.erro) || 'tente de novo') + '. Use o link "ver no site do DJEN".', true); ev.target.disabled = false; ev.target.textContent = 'ler o DJEN agora'; }
      } }, 'ler o DJEN agora'),
      ' · ', h('a', { href: linkDjen, target: '_blank', rel: 'noopener noreferrer' }, 'ver no site do DJEN'));
    status.append(linhaDjen);
    const cartao = h('div', { class: 'robo-cartao ' + (atrasado ? 'parado' : 'ligado') }, h('span', { class: 'ponto', 'aria-hidden': 'true' }), status, btn);
    if (atrasado && !ler('robo_auto')) { guardar('robo_auto', Date.now()); setTimeout(() => rodar(btn), 300); }
    return cartao;
  }

  async function telaPrazos(params) {
    carregando();
    const encerrados = params.get('encerrados') === '1';
    const ver = params.get('ver') || 'todos';
    const [lista, resumo] = await Promise.all([api('prazos.listar', { encerrados }), api('resumo')]);
    const dir = params.get('ordem') === 'desc' ? 'desc' : 'asc';
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/prazos' + (q.toString() ? '?' + q : ''); };
    const ordem = { dir, mudar: d => ir({ ordem: d === 'asc' ? '' : d }) };

    const abertos = lista.filter(z => SITUACOES_ABERTAS.includes(z.situacao));
    const conta = f => lista.filter(z => faixaPrazo(z) === f).length;
    const FILTROS = [
      ['todos', 'Todos', null],
      ['vencido', 'Vencidos', 'vencido'], ['urgente', 'Até 2 dias', 'urgente'], ['atencao', '3 a 5 dias', 'atencao'],
      ['definir', 'A definir', 'definir'], ['conferir', 'A conferir', null]];
    const passa = z => ver === 'todos' ? true : ver === 'conferir' ? z.situacao === 'calculado' : faixaPrazo(z) === ver;
    const nConferir = lista.filter(z => z.situacao === 'calculado').length;

    // Uma tabela só: sem data fatal vai sempre no topo (é o mais perigoso); o resto pela data fatal
    const todosOrdenados = lista.filter(passa)
      .sort((a, b) => {
        if (!a.fatal !== !b.fatal) return a.fatal ? 1 : -1;
        const x = a.fatal || '', y = b.fatal || ''; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'asc' ? 1 : -1);
      });
    const nProv = lista.filter(z => SITUACOES_ABERTAS.includes(z.situacao) && /PROVISÓRIO/i.test(z.descricao || '')).length;

    const kpi = (n, rotulo, cls, f) => h('button', { type: 'button', class: 'kpi ' + cls + (ver === f ? ' ativo' : ''), onclick: () => ir({ ver: ver === f ? '' : f }) },
      h('b', {}, String(n)), h('span', {}, rotulo));
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Intimações e prazos'),
        h('p', {}, `${abertos.length} prazo${abertos.length === 1 ? '' : 's'} em aberto · contagem até 23h59 do dia fatal`)),
        h('div', { class: 'barra' }, botao('Novo prazo', () => { location.hash = '#/prazo/novo'; }))),
      cartaoRobo(resumo.robo),
      h('div', { class: 'kpis' },
        kpi(conta('vencido'), 'vencidos sem baixa', 'k-vencido', 'vencido'),
        kpi(conta('urgente'), 'vencem em até 2 dias', 'k-urgente', 'urgente'),
        kpi(conta('atencao'), 'vencem em 3 a 5 dias', 'k-atencao', 'atencao'),
        kpi(conta('definir'), 'prazos a definir', 'k-definir', 'definir'),
        kpi(nConferir, 'calculados pelo robô a conferir', 'k-conferir', 'conferir')),
      h('div', { class: 'barra-filtros' },
        h('div', { class: 'chips' }, FILTROS.map(([f, rot]) => h('button', { type: 'button', class: 'chip-filtro' + (ver === f ? ' ativo' : ''), onclick: () => ir({ ver: f === 'todos' ? '' : f }) }, rot))),
        h('div', { class: 'barra' },
          h('button', { type: 'button', class: 'chip-filtro ordem', onclick: () => ordem.mudar(dir === 'asc' ? 'desc' : 'asc') }, dir === 'asc' ? '▼ Mais urgentes primeiro' : '▲ Mais distantes primeiro'),
          h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: encerrados, onchange: e => ir({ encerrados: e.target.checked ? '1' : '' }) }), 'Mostrar cumpridos (30 dias)'))),
      nProv ? h('div', { class: 'nota alerta' }, h('strong', {}, `${nProv} prazo${nProv === 1 ? '' : 's'} provisório${nProv === 1 ? '' : 's'}.`),
        ' O aviso do tribunal não informa o ato (no PJe vem "documento sigiloso"), então o robô usou o prazo mais curto (5 dias). Abra no sistema, confira o ato e clique em Conferir ou corrija os dias.') : null,
      h('section', { class: 'bloco-prazos' }, h('h2', {}, `Prazos (${todosOrdenados.length})`),
        h('div', { class: 'legenda-prazos peq' }, h('span', { class: 'lg vencido' }, 'vencido'), h('span', { class: 'lg urgente' }, 'até 2 dias'), h('span', { class: 'lg atencao' }, '3 a 5 dias'), h('span', { class: 'lg tranquilo' }, 'mais de 5 dias')),
        tabelaPrazos(todosOrdenados, ver === 'todos' ? 'Nenhum prazo em aberto.' : 'Nenhum prazo neste filtro.', ordem)),
      h('details', { class: 'caixa' }, h('summary', {}, 'Como o robô calcula os prazos'),
        h('p', {}, 'A ciência é a data em que a intimação é aberta (confirmada) ou, se ninguém abrir, a tácita: 10 dias após a expedição. No DJEN, é o dia útil seguinte à disponibilização. A contagem usa dias úteis, os feriados cadastrados e o recesso de 20/12 a 20/01, até as 23h59 do dia fatal.'),
        h('p', {}, 'O robô roda sozinho de 6 em 6 horas (0h, 6h, 12h, 18h, aproximadamente) e recalcula os prazos em aberto. Todo prazo calculado pelo robô fica marcado até a advogada conferir no eproc ou no PJe.')),
      blocoIntimacoes(),
      sessao.usuario.pode.usuarios ? blocoFeriados() : null);
  }

  function blocoIntimacoes() {
    const det = h('details', { class: 'caixa' }, h('summary', {}, 'Últimas intimações lidas pelo robô'));
    det.addEventListener('toggle', async () => {
      if (!det.open || det.dataset.ok) return;
      det.dataset.ok = '1';
      try {
        const lista = await api('intimacoes.listar', { limite: 40 });
        det.append(lista.length ? h('ul', { class: 'lista-int' }, lista.map(i => h('li', {},
          h('strong', {}, new Date(i.recebido_em).toLocaleDateString('pt-BR')), ' · ', i.fonte, ' · ', h('span', { class: 'num' }, i.numero), ' · ', i.movimento,
          i.partes_cliente ? h('div', { class: 'peq' }, 'Cliente no aviso: ' + i.partes_cliente) : null,
          i.texto ? h('div', { class: 'peq' }, i.texto) : null))) : h('p', { class: 'peq' }, 'Nenhuma intimação lida ainda.'));
      } catch (e) { det.append(h('p', { class: 'erro' }, e.message)); }
    });
    return det;
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
    const z = novo ? { processo_id: params.get('processo') || '', contagem: 'uteis', ciencia: hojeISO() } : lista.find(x => x.id === id);
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
      h('p', { class: 'peq' }, 'Origem: ' + z.origem + (z.observacoes ? ' · ' + z.observacoes : '')));
    mostrar(h('div', { class: 'cab' }, h('h1', {}, novo ? 'Novo prazo' : (z.descricao || 'Prazo'))), info, form);
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
      .map(z => ({ tipo: 'prazo', hora: '23h59', cls: 'ag-prazo', rotulo: 'Prazo fatal', titulo: `${z.descricao} · ${z.numero}${z.cliente ? ' · ' + z.cliente : ''}`, id: z.id }));
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
        onclick: () => detalheEvento({ ...it, quando: dataBR(d) + (it.tipo === 'prazo' ? ' · até 23h59' : ' · dia todo') }) }, it.tipo === 'prazo' ? '⚑ ' + it.titulo : it.titulo)));
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

  async function telaAgenda(params) {
    carregando();
    const visao = ['dia', 'semana', 'mes'].includes(params.get('visao')) ? params.get('visao') : 'semana';
    const data = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') || '') ? params.get('data') : hojeISO();
    const [ini, fim] = periodo(visao, data);
    const ver = FILTROS_AGENDA[params.get('ver')] ? params.get('ver') : 'tudo';
    const dados = filtrarAgenda(await api('agenda.listar', { inicio: ini, fim }), ver);
    const ir = (v, d, f) => { location.hash = `#/agenda?visao=${v}&data=${d}&ver=${f || ver}`; };
    const passo = visao === 'dia' ? 1 : visao === 'semana' ? 7 : 0;
    const mover = n => passo ? ir(visao, isoSoma(data, n * passo)) : ir(visao, isoSoma(data.slice(0, 8) + '15', n * 30).slice(0, 8) + '01');
    const titulo = visao === 'dia' ? nomeDia(data, true) : visao === 'semana' ? `${dataBR(ini).slice(0, 5)} a ${dataBR(fim)}`
      : new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    const barra = h('div', { class: 'ag-topo' },
      h('div', { class: 'grupo' }, botao('Hoje', () => ir(visao, hojeISO()), 'sec'),
        h('button', { type: 'button', class: 'seta-nav', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
        h('button', { type: 'button', class: 'seta-nav', 'aria-label': 'Próximo', onclick: () => mover(1) }, '›'),
        h('h2', { class: 'ag-titulo cap' }, titulo)),
      h('div', { class: 'grupo' },
        h('div', { class: 'segmentado' }, ['dia', 'semana', 'mes'].map(v => h('button', { type: 'button', class: v === visao ? 'ativo' : '', onclick: () => ir(v, data) }, { dia: 'Dia', semana: 'Semana', mes: 'Mês' }[v]))),
        botao('+ Novo compromisso', () => { location.hash = '#/compromisso/novo?data=' + data; })));
    const filtros = h('div', { class: 'chips ag-filtros' }, Object.keys(FILTROS_AGENDA).map(k => h('button', { type: 'button', class: 'chip-filtro' + (k === ver ? ' ativo' : ''), onclick: () => ir(visao, data, k) },
      k === 'tudo' || k === 'dra' ? FILTROS_AGENDA[k].nome : h('span', { class: 'bolinha ' + (k === 'prazos' ? 'ag-prazo' : CORES_AGENDA[FILTROS_AGENDA[k].agendas[0]]) }), k === 'tudo' || k === 'dra' ? null : FILTROS_AGENDA[k].nome)));
    let corpo;
    if (visao === 'mes') {
      const dias = [];
      for (let d = ini; d <= fim; d = isoSoma(d, 1)) dias.push(d);
      corpo = h('div', { class: 'mes' },
        ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(n => h('div', { class: 'mes-cab' }, n)),
        dias.map(d => {
          const itens = itensDoDia(dados, d);
          return h('div', { class: 'mes-dia' + (d.slice(0, 7) !== data.slice(0, 7) ? ' fora' : '') + (d === hojeISO() ? ' hoje' : '') + (itens.length ? '' : ' vazio'), onclick: () => ir('dia', d) },
            h('div', { class: 'mes-num' }, h('span', { class: 'so-cel' }, nomeDia(d)), h('span', { class: 'so-pc' }, String(+d.slice(8)))),
            itens.slice(0, 4).map(it => h('div', { class: 'mes-item ' + it.cls, title: it.titulo }, it.tipo === 'prazo' ? '⚑ ' : it.hora + ' ', it.titulo)),
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
      corpo);
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
  const reais = v => BRL.format(+v || 0);
  const TIPOS_HON = { parcelado: 'Parcelado', exito: 'Êxito', mensal: 'Mensal (assessoria)' };

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
    let tel = String(p.telefone || '').replace(/\D/g, '');
    if (!tel) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = nomeProprioJS(String(p.cliente || '').split(' ')[0]);
    const valor = reais(p.saldo || p.valor), venc = dataBR(p.vencimento);
    const ref = p.honorario ? ` (${p.honorario})` : '';
    const msg = p.vencimento >= hojeISO()
      ? `Olá, ${nome}! Tudo bem? Aqui é do escritório Araújo Advocacia. Passando para lembrar que a ${p.numero}ª parcela dos honorários${ref}, no valor de ${valor}, vence em ${venc}. Você pode pagar por PIX ou no escritório. Se já tiver pago, por favor nos envie o comprovante. Obrigado!`
      : `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Consta em aberto a ${p.numero}ª parcela dos honorários${ref}, no valor de ${valor}, vencida em ${venc}. Pedimos, por gentileza, que regularize o pagamento por PIX ou no escritório, ou entre em contato para combinarmos a melhor forma. Se já pagou, por favor nos envie o comprovante. Obrigado!`;
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  }

  function acoesParcela(p, depois) {
    const parar = fn => ev => { ev.stopPropagation(); fn(ev).catch(e => avisar(e.message, true)); };
    const caixa = h('div', { class: 'mini-acoes' });
    const wa = linkWhats(p);
    const pagar = h('button', { type: 'button', class: 'btn mini', onclick: parar(async () => {
      const f = h('form', { class: 'pagar', novalidate: true, onclick: e => e.stopPropagation() },
        h('input', { type: 'date', name: 'data', value: hojeISO(), 'aria-label': 'Data do pagamento' }),
        h('input', { name: 'valor', value: String(p.saldo || p.valor).replace('.', ','), inputmode: 'decimal', 'aria-label': 'Valor pago' }),
        h('select', { name: 'forma', 'aria-label': 'Forma' }, ['Pix', 'Dinheiro', 'Transferência', 'Boleto', 'Cartão', 'Alvará'].map(x => h('option', {}, x))),
        h('button', { type: 'submit', class: 'btn mini' }, 'Confirmar'), h('p', { class: 'erro' }));
      aoEnviar(f, async fd => { await api('fin.parcela.pagar', { id: p.id, ...Object.fromEntries(fd.entries()) }); avisar('Pagamento registrado.'); depois(); });
      caixa.replaceChildren(f);
    }) }, 'Pago');
    if (p.situacao === 'paga' || p.situacao === 'paga em parte') {
      caixa.append(h('button', { type: 'button', class: 'btn mini sec', onclick: parar(async () => { await api('fin.parcela.pagar', { id: p.id, estornar: true }); avisar('Pagamento desfeito.'); depois(); }) }, 'Desfazer pagamento'));
      return caixa;
    }
    caixa.append(pagar);
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

  async function telaFinanceiro(params) {
    carregando();
    const busca = params.get('busca') || '';
    const [r, hons] = await Promise.all([api('fin.resumo'), api('fin.honorarios', { busca })]);
    const t = r.totais;
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar honorários por cliente', 'aria-label': 'Buscar honorários' }),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); location.hash = '#/financeiro' + (form.busca.value.trim() ? '?busca=' + encodeURIComponent(form.busca.value.trim()) : ''); });
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Financeiro'), h('p', {}, 'Honorários, parcelas e cobranças. Só a administração vê esta área.')),
        botao('Novo honorário', () => { location.hash = '#/honorario/novo'; })),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' + (t.atrasado ? ' destaque' : '') }, h('b', {}, reais(t.atrasado)), h('span', {}, `em atraso · ${t.parcelasAtrasadas} parcela(s) · ${t.clientesAtrasados} cliente(s)`)),
        h('div', { class: 'numero' }, h('b', {}, reais(t.aReceber30)), h('span', {}, 'a receber nos próximos 30 dias')),
        h('div', { class: 'numero' }, h('b', {}, reais(t.recebidoMes)), h('span', {}, 'recebido neste mês')),
        h('div', { class: 'numero' }, h('b', {}, r.aConferir), h('span', {}, 'honorários importados a conferir'))),
      h('div', { class: 'faixas' }, r.faixas.map(f => h('div', { class: 'faixa' }, h('span', { class: 'peq' }, 'Atraso ' + f.nome), h('strong', {}, reais(f.valor)), h('span', { class: 'peq' }, f.qtd + ' parcela(s)')))),
      h('h2', { class: 'mt' }, 'Em atraso'),
      h('p', { class: 'peq' }, 'Fluxo: parcela atrasou → mensagem pelo WhatsApp (o painel já escreve o texto) → se não pagar, marque "Ação" e entre com a cobrança.'),
      tabelaParcelas(r.atrasadas, () => telaFinanceiro(params), 'Nenhuma parcela em atraso. 🎉', true),
      h('h2', { class: 'mt' }, 'Vencem nos próximos 30 dias'),
      tabelaParcelas(r.proximas, () => telaFinanceiro(params), 'Nada vencendo nos próximos 30 dias.', true),
      h('div', { class: 'cab mt' }, h('h2', {}, 'Honorários'), form),
      tabela(['Cliente', 'Tipo', 'Contratado', 'Recebido', 'Em atraso', 'Situação'], hons, x => [
        h('td', { 'data-r': 'Cliente' }, h('strong', {}, x.cliente), x.descricao ? h('div', { class: 'peq' }, x.descricao) : null),
        h('td', { 'data-r': 'Tipo' }, TIPOS_HON[x.tipo] || x.tipo, x.tipo === 'exito' && x.percentual ? ` · ${x.percentual}%` : '', x.tipo === 'mensal' && x.valor_mensal ? ` · ${reais(x.valor_mensal)}/mês` : ''),
        h('td', { class: 'num', 'data-r': 'Contratado' }, x.valor_total ? reais(x.valor_total) : reais(x.resumo.total)),
        h('td', { class: 'num', 'data-r': 'Recebido' }, reais(x.resumo.pago)),
        h('td', { class: 'num', 'data-r': 'Em atraso' }, x.resumo.atrasado ? h('span', { class: 'tag urgente' }, reais(x.resumo.atrasado)) : '—'),
        h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (x.situacao === 'ativo' ? 'ok' : x.situacao === 'encerrado' ? '' : 'atencao') }, x.situacao))
      ], x => { location.hash = '#/honorario/' + x.id; }, 'Nenhum honorário cadastrado.'));
  }

  async function telaHonorario(id, params) {
    carregando();
    const novo = id === 'novo';
    const [clientes, procs, dados] = await Promise.all([api('clientes.listar', {}), api('processos.listar', {}), novo ? null : api('fin.honorario', { id })]);
    const x = novo ? { cliente_id: params.get('cliente') || '', tipo: 'parcelado', situacao: 'ativo' } : dados.honorario;
    const recarregar = () => telaHonorario(id, params);
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
        novo ? so('parcelado', campo('parcelas', 'Número de parcelas', '1', { modo: 'numeric', max: 3 })) : null,
        novo ? so('parcelado', campo('primeiro_vencimento', '1º vencimento', hojeISO(), { tipo: 'date' })) : null,
        novo ? so('parcelado', campo('dia_demais', 'Demais parcelas: todo dia', '', { modo: 'numeric', max: 2, dica: 'Vazio = mesmo dia da 1ª' })) : null,
        so('exito', campo('percentual', 'Percentual do êxito (%)', x.percentual, { modo: 'decimal', max: 6 })),
        so('mensal', campo('valor_mensal', 'Mensalidade (R$)', x.valor_mensal ? String(x.valor_mensal).replace('.', ',') : '', { modo: 'decimal' })),
        so('mensal', campo('dia_vencimento', 'Dia do vencimento', x.dia_vencimento, { modo: 'numeric', max: 2 })),
        so('mensal', campo('inicio', 'Início da assessoria', x.inicio || hojeISO(), { tipo: 'date' })),
        campo('situacao', 'Situação', x.situacao, { opcoes: [['ativo', 'Ativo'], ['encerrado', 'Encerrado'], ['importado — conferir', 'Importado — conferir']] }),
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
    carregando();
    const [info, clientes] = await Promise.all([carregarModelos(), api('clientes.listar', {})]);
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
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Modelos'),
        h('p', {}, 'Escolha o cliente, o(a) advogado(a), o tipo de ação e os documentos. O painel preenche com o cadastro e salva na pasta do cliente em PDF e Google Docs.'))),
      novoCli ? h('div', { class: 'passo-ok' }, h('strong', {}, `✓ ${novoCli.nome} cadastrado(a) e pasta criada.`), ' Agora escolha o tipo de ação e gere a procuração e o contrato.') : null,
      h('section', { class: 'caixa' + (novoCli ? ' destaque-caixa' : '') }, h('h2', {}, 'Gerar para um cliente'),
        formGerar(info, { clientes, clienteInicial: params.get('cliente') || '' })),
      secao('Modelos do escritório', () => h('div', {},
        info.pastaEscritorio ? h('p', {}, h('a', { class: 'btn sec', href: info.pastaEscritorio, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir a pasta de modelos no Drive'),
          h('span', { class: 'peq' }, '  Todo Google Docs colocado nessa pasta aparece sozinho aqui. Campos entre colchetes, como [NOME DA PARTE], [VARA] e [CIDADE/UF], são preenchidos.')) : null,
        h('p', { class: 'peq' }, 'Para mudar o texto, abra o modelo no Google Docs e edite. Mantenha os campos entre chaves duplas, como {{nome}}, {{qualificacao_resto}}, {{advogado_nome}}, {{numero_processo}}, {{objeto}} e {{clausula_honorarios}}; o painel preenche sozinho. Padrão visual: EB Garamond 12, justificado, logo no topo e rodapé do escritório.'),
        h('div', { class: 'modelos-grade' }, Object.keys(grupos).map(g => h('div', {}, h('h4', {}, g),
          h('ul', { class: 'lista-int' }, grupos[g].map(m => h('li', {}, m.nome, ' · ', h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, 'editar no Google Docs')))))))), false),
      secao('Tipos de ação', () => h('div', {},
        h('p', { class: 'peq' }, 'Cada tipo preenche a finalidade da procuração e acrescenta os poderes específicos daquela ação (por exemplo, perícias e Meu INSS na previdenciária, prisão civil na pensão alimentícia, art. 44 do CPP na queixa-crime).'),
        h('div', { class: 'chips' }, info.tipos.map(t => h('span', { class: 'chip-filtro' }, t.nome)))), false),
      secao('Advogados (outorgados)', advs, false),
      h('p', { class: 'peq' }, 'Os textos iniciais foram redigidos pelo Claude a partir do modelo de juntada do escritório. A Dra. Júlian deve revisá-los antes do primeiro uso.'));
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
    const aba = { cliente: 'clientes', processo: 'processos', prazo: 'prazos', compromisso: 'agenda', honorario: 'financeiro' }[tela] || tela || 'inicio';
    marcarAba(aba);
    sujo = false;
    const detAg = document.getElementById('ag-detalhe'); if (detAg) detAg.hidden = true;
    window.scrollTo(0, 0);
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
        case 'compromisso': await telaCompromisso(params); break;
        case 'prazos': await telaPrazos(params); break;
        case 'prazo': await telaPrazo(id, params); break;
        case 'financeiro': await telaFinanceiro(params); break;
        case 'honorario': await telaHonorario(id, params); break;
        default: await telaInicio();
      }
    } catch (e) {
      if (sessao) mostrar(h('div', { class: 'nota alerta' }, e.message));
    }
  }

  window.addEventListener('hashchange', rota);

  // Segurança: o painel nunca abre dentro de outro site (evita golpe de "clique escondido")
  if (window.top !== window.self) { document.body.replaceChildren(); window.top.location = window.self.location.href; }

  // Segurança: 30 minutos sem mexer no painel encerram a sessão
  const INATIVO_MS = 30 * 60 * 1000;
  let ultimoUso = Date.now();
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (sessao && Date.now() - ultimoUso > INATIVO_MS) { sair(false); avisar('Você ficou 30 minutos sem usar o painel. Por segurança, entre de novo.', true); }
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
  if (sessao) montarTopo();
  rota().then(() => { if (sessao) preaquecer(); });
})();
