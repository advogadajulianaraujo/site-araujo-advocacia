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
  function esquecerTudo() { memoria.clear(); geracao++; }

  async function api(acao, dados) {
    if (!LEITURAS.has(acao)) {
      try { return await chamar(acao, dados); } finally { if (acao !== 'situacao') esquecerTudo(); }
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
      if (g === geracao) memoria.set(k, { t: Date.now(), txt: JSON.stringify(v) }); else memoria.delete(k);
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
      if (mudou) pedirRedesenho();
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
    const lista = [['resumo'], ['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}]];
    if (pode.financeiro) lista.push(['fin.resumo'], ['fin.honorarios', {}]);
    lista.forEach(([a, d]) => api(a, d).catch(() => {}));
  }

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
    guardar('painel_sessao', null);
    if (token && !expirou) fetch(API, { method: 'POST', body: JSON.stringify({ acao: 'logout', token }) }).catch(() => {});
    abasEl.hidden = true;
    quemEl.hidden = true;
    if (expirou) avisar('Sua sessão terminou. Entre de novo.', true);
    history.replaceState(null, '', location.pathname); // limpa o endereço sem desenhar a tela duas vezes
    telaLogin();
  }

  document.getElementById('btn-sair').addEventListener('click', () => sair(false));
  document.getElementById('btn-senha').addEventListener('click', () => { location.hash = '#/senha'; });

  const ABAS = [
    ['inicio', 'Início'],
    ['clientes', 'Clientes'],
    ['processos', 'Processos'],
    ['prazos', 'Intimações'],
    ['agenda', 'Agenda'],
    ['modelos', 'Modelos'],
    ['financeiro', 'Financeiro', null, 'financeiro'],
    ['usuarios', 'Usuários', null, 'usuarios']
  ];

  function montarTopo() {
    const pode = sessao.usuario.pode;
    abasEl.replaceChildren(...ABAS.filter(a => !a[3] || pode[a[3]]).map(([id, nome, breve]) =>
      h('a', { href: '#/' + id, 'data-aba': id }, nome, breve ? h('span', { class: 'breve' }, breve) : null)));
    document.getElementById('quem-nome').textContent = `${sessao.usuario.nome} · ${sessao.usuario.perfilNome}`;
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
    const form = h('form', { class: 'entrar', novalidate: true },
      h('h1', {}, 'Entrar'),
      h('p', {}, 'Acesso restrito à equipe da Araújo Advocacia.'),
      h('div', { class: 'campo' }, h('label', { for: 'l-u' }, 'Usuário'), h('input', { id: 'l-u', name: 'usuario', autocomplete: 'username', required: true, autocapitalize: 'none' })),
      h('div', { class: 'campo' }, h('label', { for: 'l-s' }, 'Senha'), h('input', { id: 'l-s', name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
      h('button', { type: 'submit', class: 'btn' }, 'Entrar'),
      h('p', { class: 'erro' }),
      h('div', { class: 'rodape', id: 'primeiro' }));
    mostrar(form);
    form.querySelector('input').focus();
    aoEnviar(form, async fd => {
      const r = await api('login', { usuario: fd.get('usuario'), senha: fd.get('senha') });
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
    const iniSem = isoSoma(hoje, -((diaSem(hoje) + 6) % 7));
    const [r, ag] = await Promise.all([api('resumo'), api('agenda.listar', { inicio: iniSem, fim: isoSoma(iniSem, 6) }).catch(() => null)]);
    const t = r.totais;
    r.prazos = r.prazos || { vencendo: 0, aDefinir: 0, aConferir: 0, vencidos: 0, proximos: [] };
    const semana = [];
    if (ag) for (let d = iniSem; d <= isoSoma(iniSem, 6); d = isoSoma(d, 1)) itensDoDia(ag, d).forEach(it => semana.push({ ...it, dia: d }));
    const blocoSemana = h('section', { class: 'painel-bloco' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, 'Agenda da semana'), h('a', { href: '#/agenda?visao=semana' }, 'abrir agenda →')),
      semana.length
        ? h('table', { class: 'mini-tab' }, h('tbody', {}, semana.slice(0, 12).map(it => h('tr', { class: it.dia === hoje ? 'hoje' : '', onclick: () => { location.hash = it.id ? '#/prazo/' + it.id : '#/agenda?visao=dia&data=' + it.dia; } },
            h('td', { class: 'num' }, nomeDia(it.dia).replace('.', '')), h('td', { class: 'num' }, it.hora),
            h('td', {}, h('span', { class: 'chip ' + it.cls }, it.rotulo)), h('td', {}, it.titulo)))))
        : h('p', { class: 'peq' }, ag ? 'Nada marcado nesta semana.' : 'Agenda indisponível no momento.'),
      semana.length > 12 ? h('p', { class: 'peq' }, `+ ${semana.length - 12} compromissos na semana`) : null);
    const blocoPrazos = h('section', { class: 'painel-bloco' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, 'Prazos que vão vencer'), h('a', { href: '#/prazos' }, 'ver intimações →')),
      r.prazos.proximos.filter(z => z.fatal).length
        ? h('table', { class: 'mini-tab' }, h('tbody', {}, r.prazos.proximos.filter(z => z.fatal).slice(0, 8).map(z => h('tr', { onclick: () => { location.hash = '#/prazo/' + z.id; } },
            h('td', { class: 'num' }, dataBR(z.fatal).slice(0, 5)), h('td', {}, etiquetaContagem(z.fatal)),
            h('td', {}, h('div', {}, z.descricao), h('div', { class: 'peq' }, (z.cliente || 'cliente a identificar') + ' · ' + z.numero))))))
        : h('p', { class: 'peq' }, 'Nenhum prazo com data fatal à frente.'),
      r.prazos.aDefinir ? h('p', {}, h('a', { class: 'tag urgente', href: '#/prazos' }, `${r.prazos.aDefinir} intimação(ões) com prazo a definir`)) : null);
    const novos = r.clientesNovos || [];
    const blocoClientes = h('section', { class: 'painel-bloco' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, 'Clientes novos'), h('a', { href: '#/cliente/novo' }, '+ novo cliente')),
      novos.length
        ? h('ul', { class: 'lista-simples' }, novos.map(c => h('li', { onclick: () => { location.hash = '#/cliente/' + c.id; } },
            h('strong', {}, c.nome), h('span', { class: 'peq' }, ` · ${c.area || 'área a definir'} · ${new Date(c.criado_em).toLocaleDateString('pt-BR')}`))))
        : h('p', { class: 'peq' }, 'Nenhum cliente cadastrado nos últimos 30 dias.'));
    const blocoAtos = h('section', { class: 'painel-bloco' },
      h('div', { class: 'bloco-cab' }, h('h2', {}, 'Audiências e atos (14 dias)'), h('a', { href: '#/processos' }, 'processos →')),
      r.proximos.length
        ? h('table', { class: 'mini-tab' }, h('tbody', {}, r.proximos.slice(0, 8).map(p => h('tr', { onclick: () => { location.hash = '#/processo/' + p.id; } },
            h('td', { class: 'num' }, dataBR(p.proximo_ato_data).slice(0, 5)), h('td', {}, etiquetaDias(p.proximo_ato_data)),
            h('td', {}, h('div', {}, p.proximo_ato), h('div', { class: 'peq' }, p.cliente || 'cliente a identificar'))))))
        : h('p', { class: 'peq' }, 'Nada marcado para os próximos 14 dias.'));
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, `${saudacao()}, ${primeiroNome(r.usuario.nome)}`), h('p', { class: 'cap' }, hojeExtenso()))),
      h('div', { class: 'numeros' },
        h('a', { class: 'numero' + (r.prazos.vencendo ? ' destaque' : ''), href: '#/prazos' }, h('b', {}, r.prazos.vencendo), h('span', {}, 'prazos vencem em até 5 dias')),
        h('a', { class: 'numero' + (r.prazos.aDefinir ? ' destaque' : ''), href: '#/prazos' }, h('b', {}, r.prazos.aDefinir), h('span', {}, 'intimações com prazo a definir')),
        h('a', { class: 'numero', href: '#/clientes' }, h('b', {}, t.clientes), h('span', {}, 'clientes')),
        h('a', { class: 'numero', href: '#/processos' }, h('b', {}, t.processos), h('span', {}, 'processos ativos'))),
      h('div', { class: 'grade-inicio' }, blocoSemana, blocoPrazos, blocoAtos, blocoClientes),
      h('p', { class: 'peq mt' }, linhaRobo(r.robo)));
  }

  function saudacao() { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; }
  function primeiroNome(n) { return String(n || '').split(' ')[0]; }
  function hojeExtenso() {
    return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function tabela(cabecalho, itens, linha, clique, vazio) {
    const corpo = itens.length
      ? itens.map(it => h('tr', { tabindex: 0, onclick: () => clique(it), onkeydown: e => { if (e.key === 'Enter') clique(it); } }, linha(it)))
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
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Clientes'), h('p', {}, `${todos.length} clientes · ${comProc} com processo · ${procs.length} processos no total`)),
        botao('Novo cliente', () => { location.hash = '#/cliente/novo'; })),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('b', {}, todos.length), h('span', {}, 'clientes cadastrados')),
        h('div', { class: 'numero' }, h('b', {}, comProc), h('span', {}, 'com processo ativo')),
        h('div', { class: 'numero' }, h('b', {}, procs.length), h('span', {}, 'processos')),
        h('a', { class: 'numero' + (aConferir ? ' destaque' : ''), href: '#/clientes?conferir=1' }, h('b', {}, aConferir), h('span', {}, 'cadastros a completar'))),
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

  /** Caixa de documentos: mostra se a pasta tem procuração e contrato e gera os que faltam. */
  function caixaDocumentos(c, destacar) {
    const caixa = h('section', { class: 'caixa' + (destacar ? ' destaque-caixa' : '') }, h('h3', {}, 'Documentos e pasta no Drive'), h('p', { class: 'peq' }, 'Verificando a pasta…'));
    const pode = sessao.usuario.pode;
    (async () => {
      let d;
      try { d = await api('clientes.documentos', { id: c.id }); } catch (e) { caixa.lastChild.textContent = e.message; return; }
      const linha = (rotulo, itens) => h('div', { class: 'doc-linha' },
        itens.length ? h('span', { class: 'tag ok' }, '✓ ' + rotulo) : h('span', { class: 'tag urgente' }, '✗ ' + rotulo + ' não encontrada'),
        itens.slice(0, 4).map(f => h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', class: 'peq' }, f.nome)));
      const gerar = h('form', { class: 'barra gerar', novalidate: true },
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'procuracao', checked: true }), 'Procuração'),
        pode.financeiro ? h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'contrato', checked: true }), 'Contrato de honorários') : null,
        h('input', { name: 'objeto', value: c.tipo_acao || '', placeholder: 'Finalidade / objeto (ex.: reclamatória trabalhista contra Empresa X)', 'aria-label': 'Finalidade' }),
        h('button', { type: 'submit', class: 'btn' }, 'Gerar em PDF'), h('p', { class: 'erro' }));
      aoEnviar(gerar, async fd => {
        const modelos = ['procuracao', 'contrato'].filter(k => fd.get(k));
        const r = await api('documentos.gerar', { cliente_id: c.id, modelos, objeto: fd.get('objeto') });
        avisar('Documentos gerados na pasta do cliente.' + (r.faltando.length ? ' Faltou no cadastro: ' + r.faltando.join(', ') + '.' : ''), !!r.faltando.length);
        telaCliente(c.id);
      });
      caixa.replaceChildren(h('h3', {}, 'Documentos e pasta no Drive'),
        d.pasta_url ? h('p', {}, h('a', { class: 'btn sec', href: d.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir pasta no Google Drive'), h('span', { class: 'peq' }, `  ${d.outros} outro(s) arquivo(s)`)) : null,
        linha('Procuração', d.procuracao), linha('Contrato de honorários', d.contrato),
        h('h4', {}, 'Gerar a partir dos modelos'),
        h('p', { class: 'peq' }, 'Preenche com os dados deste cadastro e salva na pasta do cliente em Google Docs e PDF. Os modelos podem ser editados na aba Modelos.'),
        gerar);
    })();
    return caixa;
  }

  async function telaCliente(id, params) {
    carregando();
    params = params || new URLSearchParams();
    const novo = id === 'novo';
    const r = novo ? { cliente: { tipo: 'PF', situacao: 'completo' }, processos: [] } : await api('clientes.obter', { id });
    const c = r.cliente;
    const pf = (c.tipo || 'PF') === 'PF';
    const form = h('form', { class: 'caixa', novalidate: true },
      h('fieldset', {}, h('legend', {}, 'O caso'),
        h('div', { class: 'campos' },
          campo('tipo_acao', 'Tipo de ação', c.tipo_acao, { max: 200, dica: 'Ex.: Reclamatória trabalhista, Aposentadoria, Divórcio' }),
          campo('area', 'Área', c.area, { opcoes: AREAS.some(a => a[0] === (c.area || '')) ? AREAS : AREAS.concat([[c.area, c.area]]) }),
          campo('resumo_caso', 'Descrição do caso', c.resumo_caso, { area: true, largo: true }),
          campo('providencias', 'O que tem que fazer (próximas providências)', c.providencias, { area: true, largo: true }))),
      h('fieldset', {}, h('legend', {}, 'Identificação'),
        h('div', { class: 'campos' },
          campo('tipo', 'Tipo', c.tipo || 'PF', { opcoes: [['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']] }),
          campo('nome', pf ? 'Nome completo' : 'Razão social', c.nome, { obrigatorio: true, largo: false, max: 200 }),
          campo('cpf_cnpj', 'CPF ou CNPJ', c.cpf_cnpj, { modo: 'numeric', max: 18 }),
          campo('rg', 'RG', c.rg, { max: 30 }),
          campo('nascimento', 'Data de nascimento', c.nascimento, { tipo: 'date' }),
          campo('estado_civil', 'Estado civil', c.estado_civil, { opcoes: ESTADO_CIVIL }),
          campo('profissao', 'Profissão', c.profissao, { max: 100 }),
          campo('representante', 'Representante legal (PJ)', c.representante, { max: 200 }))),
      h('fieldset', {}, h('legend', {}, 'Contato e endereço'),
        h('div', { class: 'campos' },
          campo('telefone', 'Telefone / WhatsApp', c.telefone, { tipo: 'tel', max: 30 }),
          campo('email', 'E-mail', c.email, { tipo: 'email', max: 120 }),
          campo('cep', 'CEP', c.cep, { modo: 'numeric', max: 9 }),
          campo('endereco', 'Endereço (rua, número, bairro)', c.endereco, { max: 200 }),
          campo('cidade', 'Cidade', c.cidade, { max: 80 }),
          campo('uf', 'UF', c.uf, { max: 2 }))),
      h('fieldset', {}, h('legend', {}, 'Escritório'),
        h('div', { class: 'campos' },
          campo('origem', 'Como chegou ao escritório', c.origem, { max: 120, dica: 'Indicação, Instagram, site…' }),
          campo('situacao', 'Cadastro', c.situacao, { opcoes: [['completo', 'Completo'], ['importado — conferir', 'Importado — conferir'], ['incompleto', 'Incompleto']] }),
          campo('observacoes', 'Observações', c.observacoes, { area: true, largo: true }))),
      h('div', { class: 'acoes' },
        h('button', { type: 'submit', class: 'btn' }, novo ? 'Cadastrar e criar pasta' : 'Salvar'),
        h('a', { class: 'btn sec', href: '#/clientes' }, 'Voltar')),
      h('p', { class: 'erro' }));

    aoEnviar(form, async fd => {
      const dados = Object.fromEntries(fd.entries());
      if (!novo) dados.id = c.id;
      const res = await api('clientes.salvar', { cliente: dados });
      if (res.avisoPasta) avisar(res.avisoPasta, true);
      else avisar(novo ? 'Cliente cadastrado. Agora você pode gerar a procuração e o contrato.' : 'Alterações salvas.');
      if (novo) location.hash = '#/cliente/' + res.id + '?gerar=1'; else telaCliente(c.id);
    });

    const resumo = novo ? null : h('section', { class: 'caixa resumo-caso' },
      h('div', { class: 'linha-info' },
        h('div', {}, h('div', { class: 'peq' }, 'Tipo de ação'), h('strong', {}, c.tipo_acao || '—')),
        h('div', {}, h('div', { class: 'peq' }, 'Área'), h('strong', {}, c.area || '—')),
        h('div', {}, h('div', { class: 'peq' }, 'Processos'), h('strong', {}, String(r.processos.length))),
        h('div', {}, h('div', { class: 'peq' }, 'Telefone'), h('strong', {}, c.telefone || '—'))),
      c.resumo_caso ? h('p', {}, h('span', { class: 'peq' }, 'Descrição: '), c.resumo_caso) : null,
      c.providencias ? h('p', { class: 'providencias' }, h('strong', {}, 'O que fazer: '), c.providencias) : h('p', { class: 'peq' }, 'Sem providências anotadas. Preencha "O que tem que fazer" abaixo.'));

    const procs = novo ? null : h('div', {},
      h('div', { class: 'cab' }, h('h2', {}, 'Processos'), botao('Novo processo', () => { location.hash = '#/processo/novo?cliente=' + encodeURIComponent(c.id); }, 'sec')),
      tabela(['Processo', 'Tribunal', 'Órgão', 'Parte contrária', 'Próximo ato'], r.processos, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Parte contrária' }, p.parte_contraria),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato, p.proximo_ato_data ? h('div', {}, etiquetaDias(p.proximo_ato_data)) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo ligado a este cliente.'));

    let honsCli = null;
    if (!novo && sessao.usuario.pode.financeiro) {
      const hs = await api('fin.honorarios', { cliente_id: c.id }).catch(() => []);
      honsCli = h('div', {}, h('div', { class: 'cab mt' }, h('h2', {}, 'Honorários'), botao('Novo honorário', () => { location.hash = '#/honorario/novo?cliente=' + c.id; }, 'sec')),
        tabela(['Tipo', 'Descrição', 'Recebido', 'Em atraso', 'Situação'], hs, x => [
          h('td', {}, TIPOS_HON[x.tipo] || x.tipo), h('td', {}, x.descricao), h('td', { class: 'num' }, reais(x.resumo.pago)),
          h('td', { class: 'num' }, x.resumo.atrasado ? h('span', { class: 'tag urgente' }, reais(x.resumo.atrasado)) : '—'), h('td', {}, x.situacao)
        ], x => { location.hash = '#/honorario/' + x.id; }, 'Nenhum honorário cadastrado.'));
    }
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, novo ? 'Novo cliente' : c.nome),
        novo ? h('p', {}, 'Ao cadastrar, o painel cria a pasta do cliente em 02. CLIENTES (ou liga a que já existir com o mesmo nome). Depois você gera a procuração e o contrato.')
          : h('p', {}, etiquetaSituacao(c.situacao), c.origem ? ` · origem: ${c.origem}` : ''))),
      c.situacao && c.situacao !== 'completo' && !novo ? h('div', { class: 'nota alerta' }, 'Cadastro incompleto: preencha CPF, RG, endereço e contato antes de gerar procuração ou contrato. Ao terminar, mude "Cadastro" para Completo.') : null,
      resumo, novo ? null : caixaDocumentos(c, params.get('gerar') === '1'), procs, honsCli, form);
  }

  /* ---------- processos ---------- */

  async function telaProcessos(params) {
    carregando();
    const busca = params.get('busca') || '';
    const semCliente = params.get('semcliente') === '1';
    const area = params.get('area') || '';
    const todos = await api('processos.listar', { busca, semCliente });
    const nomeArea = p => p.area || 'Sem área';
    const lista = area ? todos.filter(p => nomeArea(p) === area) : todos;
    const porArea = {}, porTrib = {};
    todos.forEach(p => { porArea[nomeArea(p)] = (porArea[nomeArea(p)] || 0) + 1; const t = p.tribunal || '—'; porTrib[t] = (porTrib[t] || 0) + 1; });
    const ordemAreas = ['Trabalhista', 'Cível', 'Previdenciário', 'Federal', 'Empresarial', 'Família', 'Criminal', 'Consumidor', 'Cobrança de honorários'];
    const areas = Object.keys(porArea).sort((a, b) => ((ordemAreas.indexOf(a) + 1) || 99) - ((ordemAreas.indexOf(b) + 1) || 99));
    const ir = mud => {
      const q = new URLSearchParams({ busca, area, semcliente: semCliente ? '1' : '', ...mud });
      [...q.keys()].forEach(k => { if (!q.get(k)) q.delete(k); });
      location.hash = '#/processos' + (q.toString() ? '?' + q : '');
    };
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar por número, cliente, parte contrária ou vara', 'aria-label': 'Buscar processos' }),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'semcliente', checked: semCliente }), 'Só sem cliente'),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ busca: form.busca.value.trim(), semcliente: form.semcliente.checked ? '1' : '' }); });
    const relatorio = h('aside', { class: 'caixa relatorio' },
      h('h3', {}, 'Quantas ações por área'),
      h('table', { class: 'mini-tab' }, h('tbody', {}, areas.map(a => h('tr', { onclick: () => ir({ area: a }) },
        h('td', {}, a), h('td', { class: 'num' }, h('strong', {}, String(porArea[a]))),
        h('td', { class: 'barra-cel' }, h('span', { class: 'barrinha', 'data-w': Math.round(porArea[a] / todos.length * 100) })))))),
      h('h3', { class: 'mt' }, 'Por tribunal'),
      h('table', { class: 'mini-tab' }, h('tbody', {}, Object.keys(porTrib).sort((a, b) => porTrib[b] - porTrib[a]).map(t => h('tr', {}, h('td', {}, t), h('td', { class: 'num' }, String(porTrib[t])))))));
    const principal = h('div', { class: 'col-principal' },
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip-filtro' + (!area ? ' ativo' : ''), onclick: () => ir({ area: '' }) }, `Todos (${todos.length})`),
        areas.map(a => h('button', { type: 'button', class: 'chip-filtro' + (area === a ? ' ativo' : ''), onclick: () => ir({ area: a }) }, `${a} (${porArea[a]})`))),
      form,
      tabela(['Processo', 'Cliente', 'Tribunal', 'Órgão', 'Próximo ato'], lista, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero)), p.status === 'arquivado' ? h('div', {}, h('span', { class: 'tag' }, 'arquivado')) : null),
        h('td', { 'data-r': 'Cliente' }, p.cliente_id ? p.cliente_nome : h('span', { class: 'tag atencao' }, p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome + ' (sem cadastro)' : 'a identificar')),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal, p.sistema ? h('div', { class: 'peq' }, p.sistema) : null),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato, p.proximo_ato_data ? h('div', {}, dataBR(p.proximo_ato_data), ' ', etiquetaDias(p.proximo_ato_data)) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo encontrado.'));
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, area || 'Processos'), h('p', {}, `${lista.length} processo${lista.length === 1 ? '' : 's'}${area ? ' nesta área' : ''}`)),
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
      prazosProc, form);
  }

  /* ---------- usuários ---------- */

  const PERFIS = [['secretario', 'Secretário (tudo, menos financeiro)'], ['advogada', 'Advogada (tudo, menos financeiro; confere prazos)'], ['estagiario', 'Estagiário (tudo, menos financeiro)'], ['administrador', 'Administrador (tudo)']];

  async function telaUsuarios() {
    carregando();
    const lista = await api('usuarios.listar');
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
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Usuários'), h('p', {}, 'Quem pode entrar no painel e o que cada um vê.'))),
      tabela(['Nome', 'Usuário', 'Perfil', 'Situação', 'Último acesso'], lista, u => [
        h('td', { 'data-r': 'Nome' }, u.nome),
        h('td', { 'data-r': 'Usuário' }, u.usuario),
        h('td', { 'data-r': 'Perfil' }, (PERFIS.find(p => p[0] === u.perfil) || [0, u.perfil])[1].split(' (')[0]),
        h('td', { 'data-r': 'Situação' }, u.ativo === 'sim' ? h('span', { class: 'tag ok' }, 'ativo') : h('span', { class: 'tag' }, 'desativado'), u.bloqueado ? h('span', { class: 'tag urgente' }, 'bloqueado') : null),
        h('td', { 'data-r': 'Último acesso' }, u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—')
      ], u => editarUsuario(u), 'Nenhum usuário.'),
      h('div', { id: 'editar-usuario' }),
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
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), botao('Cancelar', () => alvo.replaceChildren(), 'sec')),
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
      await api('senha.trocar', { atual: fd.get('atual'), nova: fd.get('nova') });
      avisar('Senha trocada.');
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
    if (z.situacao === 'calculado') return h('span', { class: 'tag atencao' }, z.origem === 'robô' ? 'calculado pelo robô' : 'lançado · a conferir');
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
    const parar = fn => ev => { ev.stopPropagation(); fn().catch(e => avisar(e.message, true)); };
    return h('div', { class: 'mini-acoes' },
      pode.conferePrazos && z.situacao === 'calculado'
        ? h('button', { type: 'button', class: 'btn mini', onclick: parar(() => acaoPrazo('prazos.conferir', { id: z.id }, 'Prazo conferido.')) }, 'Conferir') : null,
      SITUACOES_ABERTAS.includes(z.situacao)
        ? h('button', { type: 'button', class: 'btn mini sec', onclick: parar(() => acaoPrazo('prazos.situacao', { id: z.id, situacao: 'cumprido' }, 'Prazo marcado como cumprido.')) }, 'Cumprido')
        : h('button', { type: 'button', class: 'btn mini sec', onclick: parar(() => acaoPrazo('prazos.situacao', { id: z.id, situacao: 'reabrir' }, 'Prazo reaberto.')) }, 'Reabrir'));
  }
  const SITUACOES_ABERTAS = ['a definir', 'calculado', 'conferido'];

  function tabelaPrazos(lista, vazio, ordem) {
    const cabFatal = ordem
      ? h('button', { type: 'button', class: 'ordenar', title: 'Ordenar pela data fatal', onclick: () => ordem.mudar(ordem.dir === 'asc' ? 'desc' : 'asc') }, 'Fatal ', ordem.dir === 'asc' ? '▼' : '▲')
      : 'Fatal';
    return tabela([cabFatal, 'Processo', 'Cliente', 'Prazo', 'Situação', ''], lista, z => [
      h('td', { class: 'num', 'data-r': 'Fatal' }, z.fatal ? h('strong', {}, dataBR(z.fatal)) : '—', h('div', {}, etiquetaContagem(z.fatal))),
      h('td', { class: 'num', 'data-r': 'Processo' }, z.numero, h('div', {}, acessoTribunal(z.numero))),
      h('td', { 'data-r': 'Cliente' }, z.cliente || h('span', { class: 'tag atencao' }, 'a identificar')),
      h('td', { 'data-r': 'Prazo' }, z.descricao, h('div', { class: 'peq' }, textoDias(z), z.ciencia ? ` · ciência ${dataBR(z.ciencia)}` : ''),
        z.ciencia_tipo ? h('div', { class: 'peq' }, z.ciencia_tipo) : null),
      h('td', { 'data-r': 'Situação' }, etiquetaPrazo(z)),
      h('td', {}, botoesPrazo(z))
    ], z => { location.hash = '#/prazo/' + z.id; }, vazio);
  }

  function linhaRobo(robo) {
    if (!robo || !robo.ultima) return 'O robô ainda não rodou. Ele lê o DJEN e os avisos do eproc e do PJe no Gmail de 6 em 6 horas.';
    return `Última leitura do robô: ${new Date(robo.ultima).toLocaleString('pt-BR')}. ${robo.resultado ? robo.resultado.replace(/^Robô em [^:]+: /, '') : ''}`;
  }

  async function telaPrazos(params) {
    carregando();
    const encerrados = params.get('encerrados') === '1';
    const [lista, resumo] = await Promise.all([api('prazos.listar', { encerrados }), api('resumo')]);
    const dir = params.get('ordem') === 'desc' ? 'desc' : 'asc';
    const aDefinir = lista.filter(z => z.situacao === 'a definir');
    // ▼ (asc): vencidos, hoje, 1 dia, 2 dias… ▲ (desc): o mais distante primeiro
    const comData = lista.filter(z => z.situacao !== 'a definir')
      .sort((a, b) => { const x = a.fatal || '9999', y = b.fatal || '9999'; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'asc' ? 1 : -1); });
    const ordem = { dir, mudar: d => { const q = new URLSearchParams(params); q.set('ordem', d); location.hash = '#/prazos?' + q; } };
    const btnRobo = botao('Atualizar agora', async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Lendo intimações…';
      try { const r = await api('robo.rodar'); avisar(r.resumo.replace(/^Robô em [^:]+: /, '')); rota(); }
      catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Atualizar agora'; }
    }, 'sec');
    const filtro = h('label', { class: 'marcar' }, h('input', { type: 'checkbox', checked: encerrados, onchange: e => { const q = new URLSearchParams(params); if (e.target.checked) q.set('encerrados', '1'); else q.delete('encerrados'); location.hash = '#/prazos?' + q; } }), 'Mostrar cumpridos e cancelados (30 dias)');
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Intimações e prazos'), h('p', {}, linhaRobo(resumo.robo))),
        h('div', { class: 'barra' }, btnRobo, botao('Novo prazo', () => { location.hash = '#/prazo/novo'; }))),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('b', {}, resumo.prazos.vencendo), h('span', {}, 'vencem em até 5 dias')),
        h('div', { class: 'numero' }, h('b', {}, resumo.prazos.aDefinir), h('span', {}, 'prazos a definir')),
        h('div', { class: 'numero' }, h('b', {}, resumo.prazos.aConferir), h('span', {}, 'a conferir')),
        h('div', { class: 'numero' }, h('b', {}, resumo.prazos.vencidos), h('span', {}, 'vencidos sem baixa'))),
      h('div', { class: 'nota' }, 'O robô calcula a data fatal a partir da ciência: confirmada no dia em que a intimação é aberta, ou tácita 10 dias após a expedição; no DJEN, no dia útil seguinte à disponibilização. Conta dias úteis com feriados e o recesso de 20/12 a 20/01. Todo prazo do robô precisa ser conferido pela advogada no eproc ou no PJe.'),
      aDefinir.length ? h('div', {}, h('h2', {}, 'A definir'), h('p', { class: 'peq' }, 'Intimações recebidas em que o robô não sabe quantos dias tem o prazo. Abra no sistema do tribunal, veja o prazo e preencha.'), tabelaPrazos(aDefinir, '')) : null,
      h('div', { class: 'cab mt' }, h('h2', {}, 'Por data fatal'), filtro),
      tabelaPrazos(comData, 'Nenhum prazo com data fatal.', ordem),
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
    dra: { nome: 'Dra. Júlian', agendas: ['ATENDIMENTOS', 'AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO'], prazos: true },
    clientes: { nome: 'Clientes (audiências e perícias)', agendas: ['AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO', 'PERÍCIAS'], prazos: false },
    audiencias: { nome: 'Só audiências', agendas: ['AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO'], prazos: false }
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
    const titulo = visao === 'dia' ? nomeDia(data, true) : visao === 'semana' ? `Semana de ${dataBR(ini)} a ${dataBR(fim)}`
      : new Date(data + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    const barra = h('div', { class: 'barra agenda-barra' },
      h('div', { class: 'grupo' }, botao('◀', () => mover(-1), 'sec'), botao('Hoje', () => ir(visao, hojeISO()), 'sec'), botao('▶', () => mover(1), 'sec')),
      h('div', { class: 'grupo' }, ['dia', 'semana', 'mes'].map(v => h('button', { type: 'button', class: 'btn ' + (v === visao ? '' : 'sec'), onclick: () => ir(v, data) }, { dia: 'Dia', semana: 'Semana', mes: 'Mês' }[v]))),
      botao('Novo compromisso', () => { location.hash = '#/compromisso/novo?data=' + data; }));
    const filtros = h('div', { class: 'chips' }, Object.keys(FILTROS_AGENDA).map(k => h('button', { type: 'button', class: 'chip-filtro' + (k === ver ? ' ativo' : ''), onclick: () => ir(visao, data, k) }, FILTROS_AGENDA[k].nome)));
    const legenda = h('div', { class: 'legenda' }, Object.keys(CORES_AGENDA).map(n => h('span', { class: 'chip ' + CORES_AGENDA[n] }, NOME_CURTO[n])), h('span', { class: 'chip ag-prazo' }, 'Prazo fatal'));
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
      const linhas = [];
      dias.forEach(d => {
        const itens = itensDoDia(dados, d);
        if (!itens.length && visao === 'semana') {
          linhas.push(h('tr', { class: 'dia-vazio' }, h('th', { scope: 'row' }, nomeDia(d, true)), h('td', { colspan: 4, class: 'peq' }, 'Sem compromissos')));
          return;
        }
        itens.forEach((it, i) => linhas.push(h('tr', { class: it.tipo === 'prazo' ? 'tr-prazo' : '', onclick: it.id ? () => { location.hash = '#/prazo/' + it.id; } : null },
          i === 0 ? h('th', { scope: 'row', rowspan: itens.length, class: d === hojeISO() ? 'hoje' : '' }, nomeDia(d, true)) : null,
          h('td', { class: 'num', 'data-r': 'Hora' }, it.hora),
          h('td', { 'data-r': 'Agenda' }, h('span', { class: 'chip ' + it.cls }, it.rotulo)),
          h('td', { 'data-r': 'Compromisso' }, it.titulo, it.desc ? h('div', { class: 'peq' }, it.desc) : null),
          h('td', { 'data-r': 'Local' }, it.local || ''))));
      });
      if (!linhas.length) linhas.push(h('tr', {}, h('td', { colspan: 5, class: 'vazio' }, 'Nada marcado neste dia.')));
      corpo = h('table', { class: 'tabela agenda' },
        h('thead', {}, h('tr', {}, ['Dia', 'Hora', 'Agenda', 'Compromisso', 'Local'].map(c => h('th', { scope: 'col' }, c)))), h('tbody', {}, linhas));
    }
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Agenda'), h('p', { class: 'cap' }, titulo))),
      barra, filtros, legenda,
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
        campo('inicio', 'Início', '09:00', { tipo: 'time', obrigatorio: true }),
        campo('fim', 'Fim', '10:00', { tipo: 'time' }),
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

  function linkWhats(p) {
    let tel = String(p.telefone || '').replace(/\D/g, '');
    if (!tel) return null;
    if (tel.length <= 11) tel = '55' + tel;
    const nome = String(p.cliente || '').split(' ')[0];
    const msg = `Olá, ${nome}! Aqui é do escritório Araújo Advocacia. Consta em aberto a parcela ${p.numero} dos honorários, no valor de ${reais(p.saldo || p.valor)}, com vencimento em ${dataBR(p.vencimento)}. Se já pagou, por favor nos envie o comprovante. Qualquer dúvida, estamos à disposição.`;
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
    if (p.situacao === 'atrasada') {
      caixa.append(wa
        ? h('a', { class: 'btn mini sec', href: wa, target: '_blank', rel: 'noopener noreferrer', onclick: ev => { ev.stopPropagation(); api('fin.parcela.cobranca', { id: p.id, etapa: 'mensagem' }).then(depois).catch(() => {}); } }, 'WhatsApp')
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
    const [mods, clientes] = await Promise.all([api('modelos.listar'), api('clientes.listar', {})]);
    const pode = sessao.usuario.pode;
    const form = h('form', { class: 'caixa', novalidate: true },
      h('h2', {}, 'Gerar para um cliente'),
      h('div', { class: 'campos' },
        campo('cliente_id', 'Cliente', params.get('cliente') || '', { opcoes: [['', '— escolha o cliente —']].concat(clientes.map(c => [c.id, c.nome + (c.situacao !== 'completo' ? ' (cadastro a completar)' : '')])), largo: true }),
        campo('objeto', 'Finalidade / objeto', '', { max: 300, largo: true, dica: 'Ex.: propor reclamatória trabalhista contra Empresa X (se vazio, usa o "tipo de ação" do cadastro)' })),
      h('div', { class: 'barra' },
        h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'procuracao', checked: true }), 'Procuração'),
        pode.financeiro ? h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'contrato', checked: true }), 'Contrato de honorários') : null),
      h('div', { class: 'acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar em PDF')),
      h('p', { class: 'erro' }), h('div', { id: 'gerados' }));
    aoEnviar(form, async fd => {
      if (!fd.get('cliente_id')) throw new Error('Escolha o cliente.');
      const modelos = ['procuracao', 'contrato'].filter(k => fd.get(k));
      const r = await api('documentos.gerar', { cliente_id: fd.get('cliente_id'), modelos, objeto: fd.get('objeto') });
      document.getElementById('gerados').replaceChildren(
        r.faltando.length ? h('div', { class: 'nota alerta' }, 'Atenção, faltou no cadastro: ' + r.faltando.join(', ') + '. Os campos saíram em branco; complete o cadastro e gere de novo.') : null,
        h('ul', { class: 'lista-int' }, r.gerados.map(g => h('li', {}, h('strong', {}, g.modelo), ' · ',
          h('a', { href: g.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'abrir PDF'), ' · ',
          h('a', { href: g.doc, target: '_blank', rel: 'noopener noreferrer' }, 'editar no Google Docs')))),
        h('p', {}, h('a', { class: 'btn sec', href: r.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir pasta do cliente')));
      avisar('Documentos gerados na pasta do cliente.');
    });
    mostrar(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Modelos'), h('p', {}, 'Procuração e contrato de honorários preenchidos com o cadastro do cliente, salvos na pasta dele em Google Docs e PDF.'))),
      h('section', { class: 'caixa' }, h('h2', {}, 'Modelos do escritório'),
        h('p', { class: 'peq' }, 'Para mudar o texto, abra o modelo no Google Docs e edite. Mantenha os campos entre chaves duplas — {{qualificacao}}, {{nome}}, {{objeto}}, {{clausula_honorarios}}, {{data_extenso}} — que o painel preenche sozinho.'),
        h('ul', { class: 'lista-int' }, mods.map(m => h('li', {}, h('strong', {}, m.nome), ' · ', h('a', { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, 'abrir e editar no Google Docs'))))),
      form,
      h('div', { class: 'nota' }, 'Os modelos iniciais foram redigidos pelo Claude como ponto de partida. A Dra. Júlian deve revisar o texto antes do primeiro uso.'));
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

  sessao = ler('painel_sessao');
  if (sessao) montarTopo();
  rota().then(() => { if (sessao) preaquecer(); });
})();
