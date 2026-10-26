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

  async function api(acao, dados) {
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

  function carregando() { app.replaceChildren(h('p', { class: 'carregando' }, 'Carregando…')); }

  /* ---------- sessão ---------- */

  function sair(expirou) {
    const token = sessao && sessao.token;
    sessao = null;
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
    ['agenda', 'Agenda', 'etapa 2'],
    ['prazos', 'Prazos', 'etapa 2'],
    ['financeiro', 'Financeiro', 'etapa 3', 'financeiro'],
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
      app.replaceChildren(h('div', { class: 'entrar' }, h('h1', {}, 'Painel interno'),
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
    app.replaceChildren(form);
    form.querySelector('input').focus();
    aoEnviar(form, async fd => {
      const r = await api('login', { usuario: fd.get('usuario'), senha: fd.get('senha') });
      sessao = r;
      document.getElementById('aviso').hidden = true;
      guardar('painel_sessao', r);
      montarTopo();
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
    app.replaceChildren(form);
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
    const r = await api('resumo');
    const t = r.totais;
    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, `${saudacao()}, ${primeiroNome(r.usuario.nome)}`), h('p', {}, hojeExtenso()))),
      h('div', { class: 'nota' }, 'Etapa 1 no ar: clientes e processos. A contagem de prazos (com a etiqueta "calculado pelo robô") e a agenda do Google entram na etapa 2.'),
      h('div', { class: 'numeros' },
        h('a', { class: 'numero', href: '#/clientes' }, h('b', {}, t.clientes), h('span', {}, 'clientes')),
        h('a', { class: 'numero', href: '#/processos' }, h('b', {}, t.processos), h('span', {}, 'processos ativos')),
        h('a', { class: 'numero', href: '#/clientes?conferir=1' }, h('b', {}, t.clientesConferir), h('span', {}, 'cadastros a conferir')),
        h('a', { class: 'numero', href: '#/processos?semcliente=1' }, h('b', {}, t.processosSemCliente), h('span', {}, 'processos sem cliente'))),
      h('h2', {}, 'Próximos 14 dias'),
      h('p', { class: 'peq' }, 'Audiências e atos marcados nos processos.'),
      tabela(['Data', 'Ato', 'Cliente', 'Processo', 'Órgão'], r.proximos, p => [
        h('td', { class: 'num', 'data-r': 'Data' }, dataBR(p.proximo_ato_data), ' ', etiquetaDias(p.proximo_ato_data)),
        h('td', { 'data-r': 'Ato' }, p.proximo_ato),
        h('td', { 'data-r': 'Cliente' }, p.cliente || h('span', { class: 'tag atencao' }, 'a identificar')),
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero, h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Órgão' }, p.orgao)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nada marcado para os próximos 14 dias.'));
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
    let lista = await api('clientes.listar', { busca });
    if (soConferir) lista = lista.filter(c => c.situacao !== 'completo');
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar por nome, CPF, telefone ou cidade', 'aria-label': 'Buscar clientes' }),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'conferir', checked: soConferir }), 'Só a conferir'),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const q = new URLSearchParams();
      if (form.busca.value.trim()) q.set('busca', form.busca.value.trim());
      if (form.conferir.checked) q.set('conferir', '1');
      location.hash = '#/clientes' + (q.toString() ? '?' + q : '');
    });
    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Clientes'), h('p', {}, `${lista.length} encontrado${lista.length === 1 ? '' : 's'}`)),
        botao('Novo cliente', () => { location.hash = '#/cliente/novo'; })),
      form,
      tabela(['Nome', 'CPF/CNPJ', 'Telefone', 'Área', 'Processos', 'Cadastro'], lista, c => [
        h('td', { 'data-r': 'Nome' }, h('strong', {}, c.nome), c.cidade ? h('div', { class: 'peq' }, c.cidade) : null),
        h('td', { class: 'num', 'data-r': 'CPF/CNPJ' }, c.cpf_cnpj),
        h('td', { class: 'num', 'data-r': 'Telefone' }, c.telefone),
        h('td', { 'data-r': 'Área' }, c.area),
        h('td', { 'data-r': 'Processos' }, String(c.processos)),
        h('td', { 'data-r': 'Cadastro' }, etiquetaSituacao(c.situacao), c.pasta_url ? null : h('div', { class: 'peq' }, 'sem pasta'))
      ], c => { location.hash = '#/cliente/' + c.id; }, 'Nenhum cliente encontrado.'));
  }

  const ESTADO_CIVIL = [['', '—'], ['solteiro(a)', 'Solteiro(a)'], ['casado(a)', 'Casado(a)'], ['união estável', 'União estável'],
    ['divorciado(a)', 'Divorciado(a)'], ['separado(a)', 'Separado(a)'], ['viúvo(a)', 'Viúvo(a)']];
  const AREAS = ['', 'Trabalhista', 'Previdenciário', 'Cível', 'Consumidor', 'Família', 'Criminal', 'Empresarial', 'Federal', 'Cobrança de honorários'].map(a => [a, a || '—']);

  async function telaCliente(id) {
    carregando();
    const novo = id === 'novo';
    const r = novo ? { cliente: { tipo: 'PF', situacao: 'completo' }, processos: [] } : await api('clientes.obter', { id });
    const c = r.cliente;
    const pf = (c.tipo || 'PF') === 'PF';
    const form = h('form', { class: 'caixa', novalidate: true },
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
          campo('area', 'Área', c.area, { opcoes: AREAS.some(a => a[0] === (c.area || '')) ? AREAS : AREAS.concat([[c.area, c.area]]) }),
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
      else avisar(novo ? (res.pasta && res.pasta.existente ? 'Cliente cadastrado e ligado à pasta que já existia.' : 'Cliente cadastrado e pasta criada no Drive.') : 'Alterações salvas.');
      if (novo) location.hash = '#/cliente/' + res.id; else telaCliente(c.id);
    });

    const pasta = novo ? null : h('div', { class: 'caixa' }, h('h3', {}, 'Pasta no Drive'),
      c.pasta_url
        ? h('p', {}, h('a', { href: c.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir pasta do cliente em 02. CLIENTES'))
        : h('div', {}, h('p', { class: 'peq' }, 'Este cliente ainda não tem pasta ligada.'),
          botao('Criar ou ligar pasta', async ev => {
            ev.target.disabled = true;
            try {
              const p = await api('clientes.criarPasta', { id: c.id });
              avisar(p.existente ? 'Pasta existente ligada ao cliente.' : 'Pasta criada no Drive.');
              telaCliente(c.id);
            } catch (e) { avisar(e.message, true); ev.target.disabled = false; }
          }, 'sec')),
      h('p', { class: 'peq' }, 'Procuração e contrato de honorários serão gerados aqui na etapa 4, a partir deste cadastro.'));

    const procs = novo ? null : h('div', {},
      h('div', { class: 'cab' }, h('h2', {}, 'Processos'), botao('Novo processo', () => { location.hash = '#/processo/novo?cliente=' + encodeURIComponent(c.id); }, 'sec')),
      tabela(['Processo', 'Tribunal', 'Órgão', 'Parte contrária', 'Próximo ato'], r.processos, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero))),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Parte contrária' }, p.parte_contraria),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato, p.proximo_ato_data ? h('div', {}, etiquetaDias(p.proximo_ato_data)) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo ligado a este cliente.'));

    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, novo ? 'Novo cliente' : c.nome),
        novo ? h('p', {}, 'Ao cadastrar, o painel cria a pasta do cliente em 02. CLIENTES (ou liga a que já existir com o mesmo nome).')
          : h('p', {}, etiquetaSituacao(c.situacao), c.origem ? ` · origem: ${c.origem}` : ''))),
      c.situacao && c.situacao !== 'completo' && !novo ? h('div', { class: 'nota alerta' }, 'Cadastro importado: complete CPF, RG, endereço e contato antes de gerar procuração ou contrato. Ao terminar, mude "Cadastro" para Completo.') : null,
      form, pasta, procs);
  }

  /* ---------- processos ---------- */

  async function telaProcessos(params) {
    carregando();
    const busca = params.get('busca') || '';
    const semCliente = params.get('semcliente') === '1';
    const lista = await api('processos.listar', { busca, semCliente });
    const form = h('form', { class: 'barra', role: 'search' },
      h('input', { type: 'search', name: 'busca', value: busca, placeholder: 'Buscar por número, cliente, parte contrária ou vara', 'aria-label': 'Buscar processos' }),
      h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'semcliente', checked: semCliente }), 'Só sem cliente'),
      h('button', { type: 'submit', class: 'btn sec' }, 'Buscar'));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const q = new URLSearchParams();
      if (form.busca.value.trim()) q.set('busca', form.busca.value.trim());
      if (form.semcliente.checked) q.set('semcliente', '1');
      location.hash = '#/processos' + (q.toString() ? '?' + q : '');
    });
    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Processos'), h('p', {}, `${lista.length} encontrado${lista.length === 1 ? '' : 's'}`)),
        botao('Novo processo', () => { location.hash = '#/processo/novo'; })),
      form,
      tabela(['Processo', 'Cliente', 'Tribunal', 'Órgão', 'Próximo ato'], lista, p => [
        h('td', { class: 'num', 'data-r': 'Processo' }, p.numero || '(sem número)', h('div', {}, acessoTribunal(p.numero)), p.status === 'arquivado' ? h('div', {}, h('span', { class: 'tag' }, 'arquivado')) : null),
        h('td', { 'data-r': 'Cliente' }, p.cliente_id ? p.cliente_nome : h('span', { class: 'tag atencao' }, 'a identificar')),
        h('td', { 'data-r': 'Tribunal' }, p.tribunal, p.sistema ? h('div', { class: 'peq' }, p.sistema) : null),
        h('td', { 'data-r': 'Órgão' }, p.orgao),
        h('td', { 'data-r': 'Próximo ato' }, p.proximo_ato, p.proximo_ato_data ? h('div', {}, dataBR(p.proximo_ato_data), ' ', etiquetaDias(p.proximo_ato_data)) : null)
      ], p => { location.hash = '#/processo/' + p.id; }, 'Nenhum processo encontrado.'));
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
    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, novo ? 'Novo processo' : (p.numero || 'Processo sem número')),
        novo ? null : h('p', {}, p.cliente_id ? p.cliente_nome : 'Cliente a identificar', p.origem ? ` · origem: ${p.origem}` : '', ' · ', acessoTribunal(p.numero)))),
      form);
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
    app.replaceChildren(
      h('div', { class: 'cab' }, h('div', {}, h('h1', {}, 'Usuários'), h('p', {}, 'Quem pode entrar no painel e o que cada um vê.'))),
      tabela(['Nome', 'Usuário', 'Perfil', 'Situação', 'Último acesso'], lista, u => [
        h('td', { 'data-r': 'Nome' }, u.nome),
        h('td', { 'data-r': 'Usuário' }, u.usuario),
        h('td', { 'data-r': 'Perfil' }, (PERFIS.find(p => p[0] === u.perfil) || [0, u.perfil])[1].split(' (')[0]),
        h('td', { 'data-r': 'Situação' }, u.ativo === 'sim' ? h('span', { class: 'tag ok' }, 'ativo') : h('span', { class: 'tag' }, 'desativado'), u.bloqueado ? h('span', { class: 'tag urgente' }, 'bloqueado') : null),
        h('td', { 'data-r': 'Último acesso' }, u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—')
      ], u => editarUsuario(u), 'Nenhum usuário.'),
      h('div', { id: 'editar-usuario' }),
      form);
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
    app.replaceChildren(form);
  }

  function telaEmBreve(nome, etapa, texto) {
    app.replaceChildren(h('div', { class: 'cab' }, h('h1', {}, nome)), h('div', { class: 'nota' }, `Entra na ${etapa}. ${texto}`));
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
    const aba = { cliente: 'clientes', processo: 'processos' }[tela] || tela || 'inicio';
    marcarAba(aba);
    window.scrollTo(0, 0);
    try {
      switch (tela) {
        case 'clientes': await telaClientes(params); break;
        case 'cliente': await telaCliente(id); break;
        case 'processos': await telaProcessos(params); break;
        case 'processo': await telaProcesso(id, params); break;
        case 'usuarios': await telaUsuarios(); break;
        case 'senha': telaSenha(); break;
        case 'agenda': telaEmBreve('Agenda', 'etapa 2', 'Vai mostrar dia, semana e mês a partir das agendas ATENDIMENTOS, AUDIÊNCIA CONCILIAÇÃO e AUDIÊNCIA INSTRUÇÃO, junto com os prazos fatais.'); break;
        case 'prazos': telaEmBreve('Prazos', 'etapa 2', 'O robô vai ler o DJEN (OAB/SC 54832) e os avisos do eproc e do PJe no Gmail, todo dia às 6h, e mostrar "Fatal: dd/mm · faltam X dias", com a etiqueta "calculado pelo robô" até a advogada conferir.'); break;
        case 'financeiro': telaEmBreve('Financeiro', 'etapa 3', 'Honorários, parcelas, vencimentos e atrasos, importados do GEA e conferidos com as planilhas de honorários.'); break;
        default: await telaInicio();
      }
    } catch (e) {
      if (sessao) app.replaceChildren(h('div', { class: 'nota alerta' }, e.message));
    }
  }

  window.addEventListener('hashchange', rota);

  sessao = ler('painel_sessao');
  if (sessao) montarTopo();
  rota();
})();
