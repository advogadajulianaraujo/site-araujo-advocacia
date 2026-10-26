/**
 * Painel interno — Araújo Advocacia
 * Programa do Google (Apps Script) que fica dentro da planilha "PAINEL — BANCO DE DADOS".
 *
 * O que ele faz:
 *  - confere usuário e senha e decide o que cada perfil pode ver;
 *  - lê e grava clientes e processos na planilha;
 *  - cria (ou reaproveita) a pasta do cliente em "02. CLIENTES" no Drive;
 *  - robô de 6 em 6 horas: lê intimações (Gmail e DJEN) e calcula prazos;
 *  - agenda: lê e grava nas agendas ATENDIMENTOS, AUDIÊNCIA CONCILIAÇÃO e AUDIÊNCIA INSTRUÇÃO.
 *
 * Os dados ficam só na planilha, que não é compartilhada com ninguém.
 * A equipe acessa pelo painel do site; o programa roda com a conta dona da planilha.
 *
 * Como instalar: veja painel-backend/INSTALAR.md no repositório do site.
 */

var VERSAO = '2.0.0';

var PERFIS = {
  administrador: { nome: 'Administrador', financeiro: true, usuarios: true, conferePrazos: true },
  advogada: { nome: 'Advogada', financeiro: false, usuarios: false, conferePrazos: true },
  secretario: { nome: 'Secretário', financeiro: false, usuarios: false, conferePrazos: false },
  estagiario: { nome: 'Estagiário', financeiro: false, usuarios: false, conferePrazos: false }
};

// Ordem das colunas de cada aba. Não mude a ordem depois de ter dados.
var ESQUEMA = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'usuario', 'nome', 'perfil', 'hash', 'salt', 'ativo', 'tentativas', 'bloqueado_ate', 'criado_em', 'ultimo_acesso'],
  Clientes: ['id', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
    'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'pasta_id', 'pasta_url',
    'observacoes', 'situacao', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Processos: ['id', 'cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
    'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'origem', 'criado_em',
    'atualizado_em', 'atualizado_por'],
  Intimacoes: ['id', 'chave', 'fonte', 'recebido_em', 'numero', 'tribunal', 'movimento', 'evento', 'texto',
    'partes_cliente', 'processo_id', 'prazo_id', 'criado_em'],
  Prazos: ['id', 'processo_id', 'numero', 'intimacao_id', 'descricao', 'dias', 'contagem', 'ciencia', 'ciencia_tipo',
    'fatal', 'situacao', 'conferido_por', 'conferido_em', 'origem', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Feriados: ['data', 'descricao', 'abrangencia'],
  Log: ['quando', 'usuario', 'acao', 'detalhe']
};

var TENTATIVAS_MAX = 5;
var BLOQUEIO_MIN = 15;
var SESSAO_SEG = 6 * 60 * 60; // 6 horas (limite do Google)
var ITERACOES_HASH = 1000;

/* ------------------------------------------------------------------ */
/* Menu da planilha                                                    */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Painel')
    .addItem('1. Configurar planilha', 'configurar')
    .addItem('2. Vincular pastas existentes dos clientes', 'vincularPastasExistentes')
    .addItem('3. Ligar o robô de prazos (de 6 em 6 horas)', 'instalarRobo')
    .addItem('Rodar o robô agora', 'rodarRoboMenu')
    .addItem('Gerar novo código de primeiro acesso', 'gerarCodigoPrimeiroAcesso')
    .addToUi();
}

/** Cria as abas que faltam, fixa formato de texto e gera o código de primeiro acesso. */
function configurar() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(ESQUEMA).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cab = ESQUEMA[nome];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cab.length).setValues([cab]);
    }
    sh.setFrozenRows(1);
    // Texto puro: impede o Sheets de transformar datas, CPFs e telefones.
    sh.getRange(1, 1, sh.getMaxRows(), cab.length).setNumberFormat('@');
  });
  if (!config_('PASTA_CLIENTES_ID')) {
    setConfig_('PASTA_CLIENTES_ID', '', 'ID da pasta "02. CLIENTES" no Drive');
  }
  setConfig_('VERSAO', VERSAO, 'Versão do programa do painel');
  // Apaga a aba vazia que o Google cria junto com a planilha.
  ss.getSheets().forEach(function (sh) {
    if (!ESQUEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  var importados = importarCargaInicial_();
  var feriados = semearFeriados_();
  if (feriados) importados = (importados ? importados + ' ' : '') + feriados;
  var codigo = config_('CODIGO_PRIMEIRO_ACESSO');
  if (!usuarios_().length && !codigo) codigo = gerarCodigoPrimeiroAcesso_();
  aviso_('Planilha configurada.' + (importados ? ' ' + importados : '') +
    (codigo ? '\n\nCódigo de primeiro acesso: ' + codigo + ' (também está na aba Config).' : ''));
}

/**
 * Lê "carga-inicial.json" da mesma pasta da planilha e preenche Clientes e Processos.
 * Só roda com as abas vazias. Depois renomeia o arquivo para não importar duas vezes.
 */
function importarCargaInicial_() {
  var ss = SpreadsheetApp.getActive();
  if (tabela_('Clientes').linhas.length || tabela_('Processos').linhas.length) return '';
  var pais = DriveApp.getFileById(ss.getId()).getParents();
  if (!pais.hasNext()) return '';
  var arquivos = pais.next().getFilesByName('carga-inicial.json');
  if (!arquivos.hasNext()) return '';
  var arq = arquivos.next();
  var carga = JSON.parse(arq.getBlob().getDataAsString('UTF-8'));
  if (carga.clientes.length !== carga.totalClientes || carga.processos.length !== carga.totalProcessos) {
    throw new Error('Carga inicial incompleta: contagem não confere. Nada foi importado.');
  }
  var agora = new Date().toISOString();
  var base = { origem: carga.origem, criado_em: agora, atualizado_em: agora, atualizado_por: 'importacao' };
  var ids = [];
  var clientes = carga.clientes.map(function (c) {
    var id = novoId_('C');
    ids.push(id);
    return Object.assign({ id: id, tipo: c[0], nome: c[1], area: c[2], observacoes: c[3], situacao: 'importado — conferir' }, base);
  });
  var aviso = 'Veio dos avisos de e-mail de out/2026. Identificar o cliente.';
  var processos = carga.processos.map(function (p) {
    return Object.assign({
      id: novoId_('P'), cliente_id: p[0] >= 0 ? ids[p[0]] : '', cliente_nome: p[0] >= 0 ? '' : 'a identificar',
      numero: p[1], tribunal: p[2], sistema: p[3], orgao: p[4], area: p[5], polo: p[6], parte_contraria: p[7],
      proximo_ato: p[8], proximo_ato_data: p[9], status: 'ativo', observacoes: p[10] === '#AVISO' ? aviso : p[10]
    }, base);
  });
  gravarVarias_('Clientes', clientes);
  gravarVarias_('Processos', processos);
  if (carga.pastaClientesId && !config_('PASTA_CLIENTES_ID')) {
    setConfig_('PASTA_CLIENTES_ID', carga.pastaClientesId, 'ID da pasta "02. CLIENTES" no Drive');
  }
  arq.setName('carga-inicial (importada ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd-MM-yyyy') + ').json');
  registrar_('sistema', 'carga inicial', clientes.length + ' clientes, ' + processos.length + ' processos');
  var vinculadas = 0;
  try { vinculadas = vincularPastas_(); } catch (e) { /* pasta ainda não configurada */ }
  return 'Importados ' + clientes.length + ' clientes e ' + processos.length + ' processos; ' +
    vinculadas + ' clientes ligados às pastas que já existiam em 02. CLIENTES.';
}

function gravarLote_(tab) {
  if (!tab.buffer || !tab.buffer.length) { tab.buffer = null; return; }
  var linhas = tab.buffer.map(function (o) { delete o._novo; return tab.cab.map(function (k) { return seguro_(o[k]); }); });
  tab.aba.getRange(tab.buffer[0]._linha, 1, linhas.length, tab.cab.length).setNumberFormat('@').setValues(linhas);
  tab.buffer = null;
  tab.base = 0;
}

function gravarVarias_(nome, objs) {
  if (!objs.length) return;
  var tab = tabela_(nome);
  var linhas = objs.map(function (o) { return tab.cab.map(function (k) { return seguro_(o[k]); }); });
  var r = tab.aba.getLastRow() + 1;
  tab.aba.getRange(r, 1, linhas.length, tab.cab.length).setNumberFormat('@').setValues(linhas);
}

/** Código que permite criar o primeiro administrador pelo painel. Só quem abre a planilha vê. */
function gerarCodigoPrimeiroAcesso() {
  if (usuarios_().length) {
    aviso_('Já existe administrador. Para um novo acesso, crie o usuário pelo painel (menu Usuários).');
    return '';
  }
  aviso_('Código de primeiro acesso: ' + gerarCodigoPrimeiroAcesso_());
}

function gerarCodigoPrimeiroAcesso_() {
  var codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  setConfig_('CODIGO_PRIMEIRO_ACESSO', codigo, 'Use no painel para criar o primeiro administrador. Some depois do uso.');
  return codigo;
}

function aviso_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/* ------------------------------------------------------------------ */
/* Entrada do site                                                     */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, servico: 'painel-araujo', versao: VERSAO });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, erro: 'Pedido inválido.' });
  }
  try {
    return json_({ ok: true, dados: rotear_(req.acao, req.token, req.dados || {}) });
  } catch (err) {
    var msg = err && err.publico ? err.message : 'Erro interno. Tente de novo.';
    if (!(err && err.publico)) registrar_('?', 'erro', String(err && err.stack || err));
    return json_({ ok: false, erro: msg, sessao: !!(err && err.sessao) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function falha_(msg, sessao) {
  var e = new Error(msg);
  e.publico = true;
  e.sessao = !!sessao;
  return e;
}

var ROTAS = {
  'situacao': { publica: true, fn: function () { return { precisaPrimeiroAcesso: usuarios_().length === 0 }; } },
  'primeiroAcesso': { publica: true, fn: primeiroAcesso_ },
  'login': { publica: true, fn: login_ },
  'logout': { fn: logout_ },
  'sessao': { fn: function (d, u) { return publicoUsuario_(u); } },
  'resumo': { fn: resumo_ },
  'clientes.listar': { fn: listarClientes_ },
  'clientes.obter': { fn: obterCliente_ },
  'clientes.salvar': { fn: salvarCliente_ },
  'clientes.criarPasta': { fn: criarPastaCliente_ },
  'processos.listar': { fn: listarProcessos_ },
  'processos.salvar': { fn: salvarProcesso_ },
  'prazos.listar': { fn: listarPrazos_ },
  'prazos.salvar': { fn: salvarPrazo_ },
  'prazos.conferir': { permissao: 'conferePrazos', fn: conferirPrazo_ },
  'prazos.situacao': { fn: mudarSituacaoPrazo_ },
  'intimacoes.listar': { fn: listarIntimacoes_ },
  'robo.rodar': { fn: function (d, u) { return rodarRobo_(u.usuario); } },
  'agenda.listar': { fn: listarAgenda_ },
  'agenda.criar': { fn: criarCompromisso_ },
  'feriados.listar': { fn: function () { return tabela_('Feriados').linhas.map(limpar_); } },
  'feriados.salvar': { permissao: 'usuarios', fn: salvarFeriado_ },
  'usuarios.listar': { permissao: 'usuarios', fn: listarUsuarios_ },
  'usuarios.salvar': { permissao: 'usuarios', fn: salvarUsuario_ },
  'senha.trocar': { fn: trocarSenha_ }
};

function rotear_(acao, token, dados) {
  var rota = ROTAS[acao];
  if (!rota) throw falha_('Ação desconhecida.');
  if (rota.publica) return rota.fn(dados, null);
  var u = usuarioDaSessao_(token);
  if (rota.permissao && !PERFIS[u.perfil][rota.permissao]) throw falha_('Seu perfil não tem acesso a esta área.');
  return rota.fn(dados, u, token);
}

/* ------------------------------------------------------------------ */
/* Login, senhas e sessões                                             */
/* ------------------------------------------------------------------ */

function validarSenha_(senha) {
  senha = String(senha || '');
  if (!senha.trim()) throw falha_('Informe uma senha.');
  return senha;
}

function validarUsuarioNome_(usuario) {
  usuario = String(usuario || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) {
    throw falha_('O usuário deve ter de 3 a 30 caracteres, sem espaços nem acentos (ex.: Estagiario, Drajulian).');
  }
  return usuario;
}

function hashSenha_(senha, salt) {
  var h = salt + '|' + senha;
  for (var i = 0; i < ITERACOES_HASH; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function iguais_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function primeiroAcesso_(d) {
  return comTrava_(function () {
    if (usuarios_().length) throw falha_('O primeiro acesso já foi feito. Entre com usuário e senha.');
    var codigo = config_('CODIGO_PRIMEIRO_ACESSO');
    if (!codigo || !iguais_(String(d.codigo || '').trim().toUpperCase(), codigo)) {
      throw falha_('Código de primeiro acesso incorreto. Ele está na aba Config da planilha.');
    }
    var novo = criarUsuario_({ usuario: d.usuario, nome: d.nome, perfil: 'administrador', senha: d.senha });
    setConfig_('CODIGO_PRIMEIRO_ACESSO', '', 'Já utilizado.');
    registrar_(novo.usuario, 'primeiro acesso', 'administrador criado');
    return { criado: true };
  });
}

function login_(d) {
  var usuario = String(d.usuario || '').trim().toLowerCase();
  var senha = String(d.senha || '');
  return comTrava_(function () {
    var tab = tabela_('Usuarios');
    var linha = tab.linhas.filter(function (r) { return String(r.usuario).toLowerCase() === usuario; })[0];
    var generico = 'Usuário ou senha incorretos.';
    if (!linha || linha.ativo !== 'sim') {
      registrar_(usuario, 'login recusado', 'usuário inexistente ou inativo');
      throw falha_(generico);
    }
    var agora = new Date();
    if (linha.bloqueado_ate && new Date(linha.bloqueado_ate) > agora) {
      throw falha_('Muitas tentativas erradas. Tente de novo depois das ' + horaCurta_(new Date(linha.bloqueado_ate)) + '.');
    }
    if (!iguais_(hashSenha_(senha, linha.salt), linha.hash)) {
      var t = (parseInt(linha.tentativas, 10) || 0) + 1;
      var mudanca = { tentativas: String(t) };
      if (t >= TENTATIVAS_MAX) {
        mudanca.tentativas = '0';
        mudanca.bloqueado_ate = new Date(agora.getTime() + BLOQUEIO_MIN * 60000).toISOString();
      }
      atualizarLinha_(tab, linha, mudanca);
      registrar_(linha.usuario, 'login recusado', 'senha errada (' + t + ')');
      throw falha_(t >= TENTATIVAS_MAX ? 'Muitas tentativas erradas. Usuário bloqueado por ' + BLOQUEIO_MIN + ' minutos.' : generico);
    }
    atualizarLinha_(tab, linha, { tentativas: '0', bloqueado_ate: '', ultimo_acesso: agora.toISOString() });
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('sessao_' + token, linha.id, SESSAO_SEG);
    registrar_(linha.usuario, 'login', '');
    return { token: token, usuario: publicoUsuario_(linha) };
  });
}

function logout_(d, u, token) {
  CacheService.getScriptCache().remove('sessao_' + token);
  registrar_(u.usuario, 'logout', '');
  return { saiu: true };
}

function usuarioDaSessao_(token) {
  if (!token || typeof token !== 'string') throw falha_('Sua sessão terminou. Entre de novo.', true);
  var cache = CacheService.getScriptCache();
  var id = cache.get('sessao_' + token);
  if (!id) throw falha_('Sua sessão terminou. Entre de novo.', true);
  var u = tabela_('Usuarios').linhas.filter(function (r) { return r.id === id; })[0];
  if (!u || u.ativo !== 'sim' || !PERFIS[u.perfil]) {
    cache.remove('sessao_' + token);
    throw falha_('Seu acesso foi desativado.', true);
  }
  cache.put('sessao_' + token, id, SESSAO_SEG); // renova enquanto estiver em uso
  return u;
}

function publicoUsuario_(u) {
  var p = PERFIS[u.perfil];
  return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.perfil, perfilNome: p.nome, pode: { financeiro: p.financeiro, usuarios: p.usuarios, conferePrazos: p.conferePrazos } };
}

function criarUsuario_(d) {
  var usuario = validarUsuarioNome_(d.usuario);
  var nome = String(d.nome || '').trim();
  if (!nome) throw falha_('Informe o nome da pessoa.');
  if (!PERFIS[d.perfil]) throw falha_('Perfil inválido.');
  var senha = validarSenha_(d.senha, usuario);
  var tab = tabela_('Usuarios');
  if (tab.linhas.some(function (r) { return String(r.usuario).toLowerCase() === usuario.toLowerCase(); })) {
    throw falha_('Já existe um usuário com esse nome.');
  }
  var salt = Utilities.getUuid();
  var linha = {
    id: novoId_('U'), usuario: usuario, nome: nome, perfil: d.perfil, hash: hashSenha_(senha, salt), salt: salt,
    ativo: 'sim', tentativas: '0', bloqueado_ate: '', criado_em: new Date().toISOString(), ultimo_acesso: ''
  };
  inserirLinha_(tab, linha);
  return linha;
}

function listarUsuarios_() {
  return tabela_('Usuarios').linhas.map(function (r) {
    return { id: r.id, usuario: r.usuario, nome: r.nome, perfil: r.perfil, ativo: r.ativo, ultimo_acesso: r.ultimo_acesso,
      bloqueado: !!(r.bloqueado_ate && new Date(r.bloqueado_ate) > new Date()) };
  });
}

function salvarUsuario_(d, u) {
  return comTrava_(function () {
    if (!d.id) {
      var novo = criarUsuario_(d);
      registrar_(u.usuario, 'usuário criado', novo.usuario + ' (' + novo.perfil + ')');
      return { id: novo.id };
    }
    var tab = tabela_('Usuarios');
    var linha = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!linha) throw falha_('Usuário não encontrado.');
    var m = {};
    if (d.nome !== undefined) m.nome = String(d.nome).trim() || linha.nome;
    if (d.perfil !== undefined) {
      if (!PERFIS[d.perfil]) throw falha_('Perfil inválido.');
      m.perfil = d.perfil;
    }
    if (d.ativo !== undefined) m.ativo = d.ativo === 'sim' ? 'sim' : 'nao';
    var perdeAdmin = linha.perfil === 'administrador' && ((m.perfil && m.perfil !== 'administrador') || m.ativo === 'nao');
    if (perdeAdmin) {
      var admins = tab.linhas.filter(function (r) { return r.perfil === 'administrador' && r.ativo === 'sim'; });
      if (admins.length <= 1) throw falha_('É preciso manter pelo menos um administrador ativo.');
    }
    if (d.senha) {
      var salt = Utilities.getUuid();
      m.salt = salt;
      m.hash = hashSenha_(validarSenha_(d.senha, linha.usuario), salt);
      m.tentativas = '0';
      m.bloqueado_ate = '';
    }
    atualizarLinha_(tab, linha, m);
    registrar_(u.usuario, 'usuário alterado', linha.usuario + ' ' + Object.keys(m).filter(function (k) { return k !== 'hash' && k !== 'salt'; }).join(','));
    return { id: linha.id };
  });
}

function trocarSenha_(d, u) {
  return comTrava_(function () {
    if (!iguais_(hashSenha_(String(d.atual || ''), u.salt), u.hash)) throw falha_('A senha atual não confere.');
    var tab = tabela_('Usuarios');
    var linha = tab.linhas.filter(function (r) { return r.id === u.id; })[0];
    var salt = Utilities.getUuid();
    atualizarLinha_(tab, linha, { salt: salt, hash: hashSenha_(validarSenha_(d.nova, u.usuario), salt) });
    registrar_(u.usuario, 'senha trocada', '');
    return { trocada: true };
  });
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

var CAMPOS_CLIENTE = ['tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
  'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'observacoes', 'situacao'];

function listarClientes_(d) {
  var busca = normalizar_(d.busca || '');
  var procs = tabela_('Processos').linhas;
  var porCliente = {};
  procs.forEach(function (p) { if (p.cliente_id) porCliente[p.cliente_id] = (porCliente[p.cliente_id] || 0) + 1; });
  return tabela_('Clientes').linhas
    .filter(function (c) {
      if (!busca) return true;
      return normalizar_([c.nome, c.cpf_cnpj, c.telefone, c.email, c.cidade].join(' ')).indexOf(busca) >= 0 ||
        (c.cpf_cnpj && busca.replace(/\D/g, '') && String(c.cpf_cnpj).replace(/\D/g, '').indexOf(busca.replace(/\D/g, '')) >= 0);
    })
    .map(function (c) {
      return { id: c.id, tipo: c.tipo, nome: c.nome, cpf_cnpj: c.cpf_cnpj, telefone: c.telefone, cidade: c.cidade,
        area: c.area, situacao: c.situacao, pasta_url: c.pasta_url, processos: porCliente[c.id] || 0 };
    })
    .sort(function (a, b) { return normalizar_(a.nome) < normalizar_(b.nome) ? -1 : 1; });
}

function obterCliente_(d) {
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  var procs = tabela_('Processos').linhas.filter(function (p) { return p.cliente_id === c.id; });
  return { cliente: limpar_(c), processos: procs.map(limpar_) };
}

function salvarCliente_(d, u) {
  var resultado = comTrava_(function () {
    var c = d.cliente || {};
    var nome = String(c.nome || '').trim();
    if (!nome) throw falha_('Informe o nome do cliente.');
    if (c.tipo && c.tipo !== 'PF' && c.tipo !== 'PJ') throw falha_('Tipo deve ser PF ou PJ.');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email).trim())) throw falha_('E-mail inválido.');
    var doc = String(c.cpf_cnpj || '').replace(/\D/g, '');
    if (doc && doc.length !== 11 && doc.length !== 14) throw falha_('CPF deve ter 11 dígitos e CNPJ 14.');
    var tab = tabela_('Clientes');
    if (doc) {
      var repetido = tab.linhas.filter(function (r) { return r.id !== c.id && String(r.cpf_cnpj).replace(/\D/g, '') === doc; })[0];
      if (repetido) throw falha_('Já existe cliente com esse CPF/CNPJ: ' + repetido.nome + '.');
    }
    var agora = new Date().toISOString();
    var dados = {};
    CAMPOS_CLIENTE.forEach(function (k) { if (c[k] !== undefined) dados[k] = String(c[k]).trim(); });
    dados.nome = nome;
    dados.atualizado_em = agora;
    dados.atualizado_por = u.usuario;
    if (c.id) {
      var linha = tab.linhas.filter(function (r) { return r.id === c.id; })[0];
      if (!linha) throw falha_('Cliente não encontrado.');
      atualizarLinha_(tab, linha, dados);
      registrar_(u.usuario, 'cliente alterado', linha.id + ' ' + nome);
      return { id: linha.id, novo: false };
    }
    dados.id = novoId_('C');
    dados.tipo = dados.tipo || 'PF';
    dados.situacao = dados.situacao || 'completo';
    dados.criado_em = agora;
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'cliente criado', dados.id + ' ' + nome);
    return { id: dados.id, novo: true };
  });
  if (resultado.novo) {
    try { resultado.pasta = criarPastaCliente_({ id: resultado.id }, u); }
    catch (e) { resultado.avisoPasta = e.publico ? e.message : 'Cliente salvo, mas a pasta no Drive não foi criada. Use "Criar pasta" na ficha.'; }
  }
  return resultado;
}

/** Liga o cliente à pasta que já existe em 02. CLIENTES ou cria uma nova, com a ficha dentro. */
function criarPastaCliente_(d, u) {
  var tab = tabela_('Clientes');
  var c = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  if (c.pasta_id) return { pasta_url: c.pasta_url, existente: true };
  var raiz = pastaClientes_();
  var nomePasta = nomePasta_(c.nome);
  var pasta = acharPasta_(raiz, c.nome);
  var existente = !!pasta;
  if (!pasta) pasta = raiz.createFolder(nomePasta);
  if (!existente) criarFicha_(pasta, c);
  comTrava_(function () {
    var atual = tabela_('Clientes');
    var linha = atual.linhas.filter(function (r) { return r.id === c.id; })[0];
    atualizarLinha_(atual, linha, { pasta_id: pasta.getId(), pasta_url: pasta.getUrl() });
  });
  registrar_(u ? u.usuario : 'sistema', existente ? 'pasta vinculada' : 'pasta criada', c.id + ' ' + nomePasta);
  return { pasta_url: pasta.getUrl(), existente: existente };
}

function criarFicha_(pasta, c) {
  var doc = DocumentApp.create('FICHA DO CLIENTE — ' + nomePasta_(c.nome));
  var corpo = doc.getBody();
  corpo.appendParagraph('Ficha do cliente').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  var rotulos = [['Nome', c.nome], ['Tipo', c.tipo === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'], ['CPF/CNPJ', c.cpf_cnpj],
    ['RG', c.rg], ['Nascimento', c.nascimento], ['Estado civil', c.estado_civil], ['Profissão', c.profissao],
    ['Representante legal', c.representante], ['Endereço', [c.endereco, c.cidade, c.uf, c.cep].filter(String).join(' · ')],
    ['Telefone', c.telefone], ['E-mail', c.email], ['Área', c.area], ['Origem', c.origem], ['Observações', c.observacoes]];
  rotulos.forEach(function (r) { if (r[1]) corpo.appendParagraph(r[0] + ': ' + r[1]); });
  corpo.appendParagraph('Gerada pelo painel em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + '. Os dados oficiais ficam no painel.');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(pasta);
}

/** Menu da planilha: liga cada cliente sem pasta à pasta de mesmo nome em 02. CLIENTES. Não cria nada. */
function vincularPastasExistentes() {
  var n = vincularPastas_();
  aviso_(n + ' clientes ligados às pastas que já existiam.');
  return n;
}

function vincularPastas_() {
  var raiz = pastaClientes_();
  var mapa = {};
  var it = raiz.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    mapa[normalizar_(f.getName())] = f;
  }
  var n = 0;
  comTrava_(function () {
    var tab = tabela_('Clientes');
    tab.linhas.forEach(function (c) {
      if (c.pasta_id) return;
      var f = mapa[normalizar_(c.nome)];
      if (f) { atualizarLinha_(tab, c, { pasta_id: f.getId(), pasta_url: f.getUrl() }); n++; }
    });
  });
  registrar_('sistema', 'pastas vinculadas', n + ' clientes');
  return n;
}

function pastaClientes_() {
  var id = config_('PASTA_CLIENTES_ID');
  if (!id) throw falha_('Falta configurar a pasta 02. CLIENTES (aba Config, PASTA_CLIENTES_ID).');
  return DriveApp.getFolderById(id);
}

function acharPasta_(raiz, nome) {
  var alvo = normalizar_(nome);
  var it = raiz.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (normalizar_(f.getName()) === alvo) return f;
  }
  return null;
}

function nomePasta_(nome) {
  return String(nome).trim().replace(/\s+/g, ' ').replace(/[\/\\]/g, '-').toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Processos                                                           */
/* ------------------------------------------------------------------ */

var CAMPOS_PROCESSO = ['cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
  'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes'];

function listarProcessos_(d) {
  var busca = normalizar_(d.busca || '');
  var nomes = {};
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  return tabela_('Processos').linhas
    .map(function (p) { var x = limpar_(p); x.cliente_nome = nomes[p.cliente_id] || p.cliente_nome || ''; return x; })
    .filter(function (p) {
      if (d.semCliente && p.cliente_id) return false;
      if (!busca) return true;
      return normalizar_([p.numero, p.cliente_nome, p.parte_contraria, p.orgao, p.tribunal, p.area].join(' ')).indexOf(busca) >= 0;
    })
    .sort(function (a, b) {
      var x = a.proximo_ato_data || '9999', y = b.proximo_ato_data || '9999';
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

function salvarProcesso_(d, u) {
  return comTrava_(function () {
    var p = d.processo || {};
    var numero = String(p.numero || '').trim();
    if (numero && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(numero)) {
      throw falha_('Número do processo fora do padrão CNJ (0000000-00.0000.0.00.0000).');
    }
    if (p.proximo_ato_data && !/^\d{4}-\d{2}-\d{2}$/.test(p.proximo_ato_data)) throw falha_('Data do próximo ato inválida.');
    if (p.cliente_id && !tabela_('Clientes').linhas.some(function (c) { return c.id === p.cliente_id; })) {
      throw falha_('Cliente não encontrado.');
    }
    var tab = tabela_('Processos');
    if (numero) {
      var rep = tab.linhas.filter(function (r) { return r.id !== p.id && r.numero === numero; })[0];
      if (rep) throw falha_('Esse processo já está cadastrado.');
    }
    var agora = new Date().toISOString();
    var dados = {};
    CAMPOS_PROCESSO.forEach(function (k) { if (p[k] !== undefined) dados[k] = String(p[k]).trim(); });
    if (numero && !dados.tribunal) dados.tribunal = tribunalDoNumero_(numero);
    dados.atualizado_em = agora;
    dados.atualizado_por = u.usuario;
    if (p.id) {
      var linha = tab.linhas.filter(function (r) { return r.id === p.id; })[0];
      if (!linha) throw falha_('Processo não encontrado.');
      atualizarLinha_(tab, linha, dados);
      registrar_(u.usuario, 'processo alterado', linha.id + ' ' + (numero || linha.numero));
      return { id: linha.id };
    }
    dados.id = novoId_('P');
    dados.status = dados.status || 'ativo';
    dados.origem = 'painel';
    dados.criado_em = agora;
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'processo criado', dados.id + ' ' + numero);
    return { id: dados.id };
  });
}

function tribunalDoNumero_(n) {
  var m = /\.(\d)\.(\d{2})\.\d{4}$/.exec(n);
  if (!m) return '';
  var j = m[1], tr = m[2];
  if (j === '5') return 'TRT' + parseInt(tr, 10);
  if (j === '8' && tr === '24') return 'TJSC';
  if (j === '4') return 'TRF' + parseInt(tr, 10);
  return '';
}

/* ------------------------------------------------------------------ */
/* Início                                                              */
/* ------------------------------------------------------------------ */

function resumo_(d, u) {
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var limite = Utilities.formatDate(new Date(Date.now() + 14 * 86400000), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var clientes = tabela_('Clientes').linhas;
  var nomes = {};
  clientes.forEach(function (c) { nomes[c.id] = c.nome; });
  var procs = tabela_('Processos').linhas;
  var proximos = procs
    .filter(function (p) { return p.status !== 'arquivado' && p.proximo_ato_data && p.proximo_ato_data >= hoje && p.proximo_ato_data <= limite; })
    .sort(function (a, b) { return a.proximo_ato_data < b.proximo_ato_data ? -1 : 1; })
    .map(function (p) {
      return { id: p.id, numero: p.numero, cliente: nomes[p.cliente_id] || p.cliente_nome || '', orgao: p.orgao,
        proximo_ato: p.proximo_ato, proximo_ato_data: p.proximo_ato_data, cliente_id: p.cliente_id };
    });
  return {
    hoje: hoje,
    usuario: publicoUsuario_(u),
    totais: {
      clientes: clientes.length,
      processos: procs.filter(function (p) { return p.status !== 'arquivado'; }).length,
      clientesConferir: clientes.filter(function (c) { return c.situacao !== 'completo'; }).length,
      processosSemCliente: procs.filter(function (p) { return !p.cliente_id; }).length
    },
    proximos: proximos,
    prazos: resumoPrazos_(),
    robo: { ultima: config_('ROBO_ULTIMA_EXECUCAO'), resultado: config_('ROBO_ULTIMO_RESULTADO') }
  };
}

/* ------------------------------------------------------------------ */
/* Planilha: leitura e escrita                                         */
/* ------------------------------------------------------------------ */

function aba_(nome) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!sh) throw falha_('A planilha não está configurada. Abra-a e use o menu Painel → Configurar planilha.');
  return sh;
}

function tabela_(nome) {
  var sh = aba_(nome);
  var cab = ESQUEMA[nome];
  var n = sh.getLastRow() - 1;
  var valores = n > 0 ? sh.getRange(2, 1, n, cab.length).getDisplayValues() : [];
  var linhas = [];
  valores.forEach(function (v, i) {
    if (!v.join('')) return;
    var o = { _linha: i + 2 };
    cab.forEach(function (k, j) { o[k] = v[j]; });
    linhas.push(o);
  });
  return { aba: sh, cab: cab, linhas: linhas };
}

function seguro_(v) {
  v = v === null || v === undefined ? '' : String(v);
  if (v.length > 5000) v = v.slice(0, 5000);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; // impede que um texto vire fórmula
}

function inserirLinha_(tab, obj) {
  if (tab.buffer) { // modo lote (robô): grava tudo de uma vez no fim
    if (!tab.base) tab.base = tab.aba.getLastRow() + 1;
    obj._linha = tab.base + tab.buffer.length;
    obj._novo = true;
    tab.buffer.push(obj);
    tab.linhas.push(obj);
    return;
  }
  var linha = tab.cab.map(function (k) { return seguro_(obj[k]); });
  var r = tab.aba.getLastRow() + 1;
  tab.aba.getRange(r, 1, 1, tab.cab.length).setNumberFormat('@').setValues([linha]);
  obj._linha = r;
  tab.linhas.push(obj);
}

function atualizarLinha_(tab, linhaObj, mudancas) {
  Object.keys(mudancas).forEach(function (k) {
    if (tab.cab.indexOf(k) < 0) return;
    linhaObj[k] = mudancas[k] === null || mudancas[k] === undefined ? '' : String(mudancas[k]);
  });
  if (linhaObj._novo) return; // ainda no lote: vai gravado no fim
  var valores = tab.cab.map(function (k) { return seguro_(linhaObj[k]); });
  tab.aba.getRange(linhaObj._linha, 1, 1, tab.cab.length).setValues([valores]);
}

function limpar_(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') r[k] = o[k]; });
  return r;
}

function usuarios_() {
  try { return tabela_('Usuarios').linhas; } catch (e) { return []; }
}

function config_(chave) {
  try {
    var l = tabela_('Config').linhas.filter(function (r) { return r.chave === chave; })[0];
    return l ? l.valor : '';
  } catch (e) { return ''; }
}

function setConfig_(chave, valor, descricao) {
  var tab = tabela_('Config');
  var l = tab.linhas.filter(function (r) { return r.chave === chave; })[0];
  if (l) atualizarLinha_(tab, l, { valor: valor, descricao: descricao || l.descricao });
  else inserirLinha_(tab, { chave: chave, valor: valor, descricao: descricao || '' });
}

function registrar_(usuario, acao, detalhe) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName('Log');
    if (sh) sh.appendRow([new Date().toISOString(), seguro_(usuario), seguro_(acao), seguro_(String(detalhe || '').slice(0, 500))]);
  } catch (e) { /* o registro nunca derruba a operação */ }
}

function comTrava_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw falha_('O sistema está ocupado. Tente de novo em alguns segundos.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function novoId_(prefixo) {
  return prefixo + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function normalizar_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function horaCurta_(d) {
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'HH:mm');
}

/* ================================================================== */
/* ETAPA 2 — Robô de intimações, prazos, feriados e agenda             */
/* ================================================================== */

var OAB_NUMERO = '54832';
var OAB_UF = 'SC';
var NOMES_AGENDAS = ['ATENDIMENTOS', 'AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO'];
var SITUACOES_ABERTAS = ['a definir', 'calculado', 'conferido'];
var TZ = 'America/Sao_Paulo';

/* ---------- Datas (sempre texto aaaa-mm-dd, fuso de Brasília) ---------- */

function hojeSP_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function dataSP_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

function somarDias_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.toISOString().slice(0, 10);
}

function diaSemana_(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }

function noRecesso_(iso) {
  var md = iso.slice(5);
  return md >= '12-20' || md <= '01-20'; // CPC art. 220 e CLT art. 775-A
}

function mapaFeriados_() {
  var m = {};
  tabela_('Feriados').linhas.forEach(function (f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return;
    (m[f.data] = m[f.data] || []).push(f.abrangencia || 'todos');
  });
  return m;
}

function feriadoVale_(abr, tribunal) {
  if (!abr || abr === 'todos') return true;
  if (abr === 'JF/JT') return /^(TRT|TRF)/.test(tribunal || '');
  return String(tribunal || '').indexOf(abr) === 0;
}

function ehUtil_(iso, tribunal, feriados, ignorarRecesso) {
  var ds = diaSemana_(iso);
  if (ds === 0 || ds === 6) return false;
  if (!ignorarRecesso && noRecesso_(iso)) return false;
  var f = feriados[iso];
  return !(f && f.some(function (a) { return feriadoVale_(a, tribunal); }));
}

function proximoUtil_(iso, tribunal, feriados, ignorarRecesso) {
  var d = iso;
  for (var i = 0; i < 400; i++) {
    d = somarDias_(d, 1);
    if (ehUtil_(d, tribunal, feriados, ignorarRecesso)) return d;
  }
  throw new Error('Não achei dia útil depois de ' + iso);
}

/**
 * Data fatal a partir da ciência (o prazo começa no primeiro dia útil seguinte).
 * Dias úteis: pula fins de semana, feriados e o recesso de 20/12 a 20/01.
 * Dias corridos (ex.: criminal): soma os dias e, se cair em dia sem expediente, vai para o próximo útil.
 */
function calcularFatal_(ciencia, dias, contagem, tribunal, feriados) {
  dias = parseInt(dias, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ciencia || '') || !(dias > 0)) return '';
  feriados = feriados || mapaFeriados_();
  if (contagem === 'corridos') {
    var f = somarDias_(ciencia, dias);
    return ehUtil_(f, tribunal, feriados, true) ? f : proximoUtil_(f, tribunal, feriados, true);
  }
  var d = ciencia;
  for (var i = 0; i < dias; i++) d = proximoUtil_(d, tribunal, feriados, false);
  return d;
}

/* ---------- Feriados forenses ---------- */

var FERIADOS_BASE = [
  ['2026-01-01', 'Confraternização Universal', 'todos'], ['2026-02-16', 'Carnaval', 'todos'],
  ['2026-02-17', 'Carnaval', 'todos'], ['2026-04-01', 'Quarta-feira Santa (Lei 5.010/66)', 'JF/JT'],
  ['2026-04-02', 'Quinta-feira Santa', 'todos'], ['2026-04-03', 'Sexta-feira da Paixão', 'todos'],
  ['2026-04-21', 'Tiradentes', 'todos'], ['2026-05-01', 'Dia do Trabalho', 'todos'],
  ['2026-06-04', 'Corpus Christi', 'todos'], ['2026-08-11', 'Fundação dos cursos jurídicos (Lei 5.010/66)', 'JF/JT'],
  ['2026-09-07', 'Independência', 'todos'], ['2026-10-12', 'Nossa Senhora Aparecida', 'todos'],
  ['2026-11-02', 'Finados', 'todos'], ['2026-11-20', 'Consciência Negra', 'todos'],
  ['2026-12-08', 'Nossa Senhora da Conceição (Lei 5.010/66)', 'JF/JT'], ['2026-12-25', 'Natal', 'todos'],
  ['2027-01-01', 'Confraternização Universal', 'todos'], ['2027-02-08', 'Carnaval', 'todos'],
  ['2027-02-09', 'Carnaval', 'todos'], ['2027-03-24', 'Quarta-feira Santa (Lei 5.010/66)', 'JF/JT'],
  ['2027-03-25', 'Quinta-feira Santa', 'todos'], ['2027-03-26', 'Sexta-feira da Paixão', 'todos'],
  ['2027-04-21', 'Tiradentes', 'todos'], ['2027-05-27', 'Corpus Christi', 'todos'],
  ['2027-08-11', 'Fundação dos cursos jurídicos (Lei 5.010/66)', 'JF/JT'], ['2027-09-07', 'Independência', 'todos'],
  ['2027-10-12', 'Nossa Senhora Aparecida', 'todos'], ['2027-11-01', 'Todos os Santos (Lei 5.010/66)', 'JF/JT'],
  ['2027-11-02', 'Finados', 'todos'], ['2027-11-15', 'Proclamação da República', 'todos'],
  ['2027-12-08', 'Nossa Senhora da Conceição (Lei 5.010/66)', 'JF/JT'], ['2027-12-24', 'Véspera de Natal (sem expediente)', 'todos'],
  ['2027-12-31', 'Véspera de Ano-Novo (sem expediente)', 'todos']
];

function semearFeriados_() {
  if (tabela_('Feriados').linhas.length) return '';
  gravarVarias_('Feriados', FERIADOS_BASE.map(function (f) { return { data: f[0], descricao: f[1], abrangencia: f[2] }; }));
  return FERIADOS_BASE.length + ' feriados forenses de 2026–2027 carregados (o recesso de 20/12 a 20/01 é automático).';
}

function salvarFeriado_(d, u) {
  return comTrava_(function () {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) throw falha_('Data inválida.');
    var tab = tabela_('Feriados');
    var ex = tab.linhas.filter(function (f) { return f.data === d.data && f.abrangencia === (d.abrangencia || 'todos'); })[0];
    if (d.remover) {
      if (ex) atualizarLinha_(tab, ex, { data: '', descricao: '', abrangencia: '' });
      registrar_(u.usuario, 'feriado removido', d.data);
      return { ok: true };
    }
    if (!String(d.descricao || '').trim()) throw falha_('Informe a descrição (ex.: feriado municipal de Tubarão).');
    if (ex) atualizarLinha_(tab, ex, { descricao: d.descricao });
    else inserirLinha_(tab, { data: d.data, descricao: d.descricao, abrangencia: d.abrangencia || 'todos' });
    registrar_(u.usuario, 'feriado salvo', d.data + ' ' + d.descricao);
    recalcularPrazosAbertos_();
    return { ok: true };
  });
}

/* ---------- Regras de sugestão de prazo ---------- */

function contagemPadrao_(proc) {
  return proc && proc.area === 'Criminal' ? 'corridos' : 'uteis';
}

/** Sugestão de dias pelo tipo de ato. Sem sugestão segura, devolve 0 (prazo a definir). */
function sugerirPrazo_(texto, proc, tribunal, segundoGrauAviso) {
  var t = normalizar_(texto || '');
  var m = /prazo\s+(?:comum\s+)?(?:de\s+)?(\d{1,3})\s*(?:\([^)]*\)\s*)?dias?(\s+(?:uteis|corridos))?/.exec(t);
  if (m) {
    return { dias: +m[1], contagem: /corridos/.test(m[2] || '') ? 'corridos' : contagemPadrao_(proc), descricao: 'Prazo indicado na intimação' };
  }
  var segundoGrau = segundoGrauAviso || /\.0000$/.test((proc && proc.numero) || '') || /2º grau/i.test((proc && proc.orgao) || '');
  if (/julgamento|sentenca/.test(t) && !segundoGrau) {
    if (/^TRT/.test(tribunal || '')) return { dias: 8, contagem: 'uteis', descricao: 'Recurso ordinário contra a sentença (sugestão)' };
    if (proc && proc.area === 'Criminal') return { dias: 5, contagem: 'corridos', descricao: 'Apelação criminal contra a sentença (sugestão)' };
    if (/juizado|jec|jef/i.test((proc && proc.orgao) || '') || /\.4\.04\.72/.test((proc && proc.numero) || '')) {
      return { dias: 10, contagem: 'uteis', descricao: 'Recurso inominado contra a sentença (sugestão)' };
    }
    return { dias: 15, contagem: 'uteis', descricao: 'Apelação contra a sentença (sugestão)' };
  }
  return { dias: 0, contagem: contagemPadrao_(proc), descricao: 'Intimação recebida: definir o prazo' };
}

/* ---------- Robô ---------- */

function instalarRobo() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rodarRoboGatilho') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rodarRoboGatilho').timeBased().everyHours(6).create();
  var r = rodarRobo_('instalação');
  aviso_('Robô ligado: roda de 6 em 6 horas.\n\n' + r.resumo);
  return r;
}

function rodarRoboGatilho() { rodarRobo_('robô (6 em 6 h)'); }
function rodarRoboMenu() { aviso_(rodarRobo_('menu').resumo); }

function rodarRobo_(quem) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw falha_('O robô já está rodando. Tente de novo em 1 minuto.');
  var ctx, erros = [], novas = 0, prazosNovos = 0;
  try {
    ctx = contextoRobo_();
    try { var g = lerGmail_(ctx); novas += g.intimacoes; prazosNovos += g.prazos; }
    catch (e) { erros.push('Gmail: ' + (e.message || e)); }
    try { if (!ctx.gmailParcial) { var j = lerDjen_(ctx); novas += j.intimacoes; prazosNovos += j.prazos; } }
    catch (e2) { erros.push('DJEN: ' + (e2.message || e2)); }
    recalcularPrazosAbertos_(ctx);
    [ctx.procs, ctx.intim, ctx.prazos].forEach(gravarLote_);
    if (ctx.gmailParcial) erros.push('Gmail: leitura parcial por causa do limite de tempo do Google; o resto vem na próxima rodada (ou clique em Atualizar agora).');
    var agora = new Date();
    var resumo = 'Robô em ' + Utilities.formatDate(agora, TZ, 'dd/MM/yyyy HH:mm') + ': ' + novas +
      ' intimação(ões) nova(s), ' + prazosNovos + ' prazo(s) novo(s).' + (erros.length ? ' Avisos: ' + erros.join(' | ') : '');
    setConfig_('ROBO_ULTIMA_EXECUCAO', agora.toISOString(), 'Última vez que o robô rodou');
    setConfig_('ROBO_ULTIMO_RESULTADO', resumo, 'Resultado da última execução');
    registrar_(quem || 'robô', 'robô', resumo);
    return { resumo: resumo, intimacoes: novas, prazos: prazosNovos, erros: erros };
  } finally {
    lock.releaseLock();
  }
}

function contextoRobo_() {
  var ctx = {
    intim: tabela_('Intimacoes'), prazos: tabela_('Prazos'), procs: tabela_('Processos'), clientes: tabela_('Clientes'),
    feriados: mapaFeriados_(), chaves: {}, porNumero: {}, porNomeCliente: {}
  };
  ctx.inicio = Date.now();
  ctx.intim.buffer = []; ctx.prazos.buffer = []; ctx.procs.buffer = [];
  ctx.intim.linhas.forEach(function (i) { ctx.chaves[i.chave] = true; });
  ctx.procs.linhas.forEach(function (p) { if (p.numero) ctx.porNumero[p.numero] = p; });
  ctx.clientes.linhas.forEach(function (c) { ctx.porNomeCliente[normalizar_(c.nome)] = c; });
  return ctx;
}

/** Acha o processo pelo número; se não existir, cria (com o cliente, quando o nome bate com um cadastro). */
function processoDoNumero_(ctx, numero, tribunal, sistema, nomesCliente) {
  var p = ctx.porNumero[numero];
  var cli = null;
  (nomesCliente || []).some(function (n) { cli = ctx.porNomeCliente[normalizar_(n)] || null; return !!cli; });
  var agora = new Date().toISOString();
  if (!p) {
    p = {
      id: novoId_('P'), cliente_id: cli ? cli.id : '', cliente_nome: cli ? '' : ((nomesCliente || [])[0] || 'a identificar'),
      numero: numero, tribunal: tribunal || tribunalDoNumero_(numero), sistema: sistema || '', orgao: /\.0000$/.test(numero) ? '2º grau' : '',
      area: /^TRT/.test(tribunal || tribunalDoNumero_(numero)) ? 'Trabalhista' : '', polo: '', parte_contraria: '', proximo_ato: '',
      proximo_ato_data: '', status: 'ativo', observacoes: 'Criado pelo robô a partir de uma intimação. Conferir.', origem: 'robô',
      criado_em: agora, atualizado_em: agora, atualizado_por: 'robô'
    };
    inserirLinha_(ctx.procs, p);
    ctx.porNumero[numero] = p;
  } else if (!p.cliente_id && (cli || (nomesCliente || [])[0])) {
    atualizarLinha_(ctx.procs, p, cli ? { cliente_id: cli.id, cliente_nome: '' } : { cliente_nome: nomesCliente[0] });
  }
  return p;
}

/**
 * Registra uma intimação e, se ela abre prazo, cria ou atualiza o prazo.
 * dados: { fonte, chave, recebido_em, numero, tribunal, sistema, movimento, evento, texto, nomes, tipo, ciencia, ciencia_tipo }
 */
function registrarIntimacao_(ctx, d) {
  if (ctx.chaves[d.chave]) return { nova: false, prazo: false };
  ctx.chaves[d.chave] = true;
  var proc = processoDoNumero_(ctx, d.numero, d.tribunal, d.sistema, d.nomes);
  var agora = new Date().toISOString();
  var intim = {
    id: novoId_('I'), chave: d.chave, fonte: d.fonte, recebido_em: d.recebido_em, numero: d.numero, tribunal: proc.tribunal,
    movimento: d.movimento, evento: d.evento || '', texto: String(d.texto || '').slice(0, 4000),
    partes_cliente: (d.nomes || []).join('; '), processo_id: proc.id, prazo_id: '', criado_em: agora
  };
  inserirLinha_(ctx.intim, intim);
  if (!d.tipo) return { nova: true, prazo: false };

  // Confirmação de uma intimação já lançada como tácita: antecipa a ciência.
  var aberto = ctx.prazos.linhas.filter(function (z) {
    return z.numero === d.numero && z.origem === 'robô' && z.situacao !== 'conferido' &&
      SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && z.ciencia && Math.abs(diffDias_(z.ciencia, d.ciencia)) <= 12;
  })[0];
  var sug = sugerirPrazo_([d.movimento, d.texto].join(' '), proc, proc.tribunal, d.segundoGrau);
  if (aberto) {
    var m = { observacoes: (aberto.observacoes ? aberto.observacoes + ' | ' : '') + d.fonte + ': ' + d.movimento };
    if (d.ciencia < aberto.ciencia) { m.ciencia = d.ciencia; m.ciencia_tipo = d.ciencia_tipo; }
    if (!(+aberto.dias) && sug.dias) { m.dias = String(sug.dias); m.contagem = sug.contagem; m.descricao = sug.descricao; }
    m.atualizado_em = agora; m.atualizado_por = 'robô';
    atualizarLinha_(ctx.prazos, aberto, m);
    atualizarLinha_(ctx.intim, intim, { prazo_id: aberto.id });
    return { nova: true, prazo: false };
  }
  var prazo = {
    id: novoId_('Z'), processo_id: proc.id, numero: d.numero, intimacao_id: intim.id, descricao: sug.descricao,
    dias: sug.dias ? String(sug.dias) : '', contagem: sug.contagem, ciencia: d.ciencia, ciencia_tipo: d.ciencia_tipo,
    fatal: '', situacao: sug.dias ? 'calculado' : 'a definir', conferido_por: '', conferido_em: '', origem: 'robô',
    observacoes: d.fonte + ': ' + d.movimento, criado_em: agora, atualizado_em: agora, atualizado_por: 'robô'
  };
  prazo.fatal = calcularFatal_(prazo.ciencia, prazo.dias, prazo.contagem, proc.tribunal, ctx.feriados);
  inserirLinha_(ctx.prazos, prazo);
  atualizarLinha_(ctx.intim, intim, { prazo_id: prazo.id });
  return { nova: true, prazo: true };
}

function diffDias_(a, b) {
  return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
}

/* ---------- Leitura do Gmail (eproc TJSC/JFSC e PJe TRT) ---------- */

var RE_CNJ = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/;

function lerGmail_(ctx) {
  var desde = parseInt(config_('ROBO_GMAIL_DESDE'), 10) || (Date.now() - 30 * 86400000);
  var q = 'from:(tjsc.jus.br OR jfsc.jus.br OR trf4.jus.br OR trt12.jus.br OR trt6.jus.br OR trt16.jus.br) after:' + Math.floor(desde / 1000);
  var threads = GmailApp.search(q, 0, 300);
  var msgs = [];
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) { if (msg.getDate().getTime() > desde) msgs.push(msg); });
  });
  msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
  var ate = desde, intimacoes = 0, prazos = 0;
  for (var i = 0; i < msgs.length; i++) {
    if (Date.now() - ctx.inicio > 240000) { ctx.gmailParcial = true; break; } // 4 min: para com folga antes dos 6 do Google
    var msg = msgs[i];
    var itens = /\[PUSH\]/.test(msg.getSubject()) ? lerAvisoPje_(msg) : lerAvisoEproc_(msg);
    itens.forEach(function (it) {
      var r = registrarIntimacao_(ctx, it);
      if (r.nova) intimacoes++;
      if (r.prazo) prazos++;
    });
    ate = msg.getDate().getTime();
  }
  setConfig_('ROBO_GMAIL_DESDE', String(ate), 'Data (ms) do último aviso de tribunal lido no Gmail');
  return { intimacoes: intimacoes, prazos: prazos };
}

/** Aviso do eproc (TJSC e JFSC): um bloco por processo. */
function lerAvisoEproc_(msg) {
  var corpo = msg.getPlainBody() || '';
  var data = dataSP_(msg.getDate());
  var fonte = /jfsc|trf4/i.test(msg.getFrom()) ? 'eproc JFSC' : 'eproc TJSC';
  var segundoGrau = /eproc2g|eproc2trf4/i.test(corpo);
  var itens = [];
  corpo.split(/-{10,}/).forEach(function (bloco) {
    var mN = /Num\.?\s*Processo:?\W*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i.exec(bloco);
    if (!mN) return;
    var mov = ((/Movimenta[çc][ãa]o:?\s*\|?\s*([^\n|]+)/i.exec(bloco) || [])[1] || '').replace(/[\s-]+$/, '').trim();
    var evento = ((/Evento\s+N[úu]mero:?\s*\|?\s*([\d\-\s]+)/i.exec(bloco) || [])[1] || '').trim();
    var tipo = /confirmada a intima/i.test(mov) ? 'confirmada' : /expedida.*intima/i.test(mov) ? 'expedida' : '';
    itens.push({
      fonte: fonte, chave: fonte + '|' + mN[1] + '|' + evento + '|' + mov + '|' + data, recebido_em: msg.getDate().toISOString(),
      numero: mN[1], tribunal: tribunalDoNumero_(mN[1]) || (fonte === 'eproc JFSC' ? 'TRF4' : 'TJSC'), sistema: 'eproc',
      movimento: mov + (segundoGrau ? ' (2º grau)' : ''), evento: evento, texto: '', nomes: nomesDoCliente_(bloco), tipo: tipo, segundoGrau: segundoGrau,
      ciencia: tipo === 'expedida' ? somarDias_(data, 10) : data,
      ciencia_tipo: tipo === 'expedida' ? 'tácita: 10 dias após a expedição (' + dataBR_(data) + ')' : 'confirmada em ' + dataBR_(data)
    });
  });
  return itens;
}

/** Nomes das partes logo antes de "Advogado(s) ... (SC054832)". */
function nomesDoCliente_(bloco) {
  var partes = bloco.split(/\n|\|/).map(function (s) { return s.replace(/\*/g, '').trim(); }).filter(String);
  var nomes = [];
  partes.forEach(function (p, i) {
    if (p.indexOf('0' + OAB_NUMERO) < 0 && p.indexOf(OAB_NUMERO + ')') < 0) return;
    for (var k = i - 1; k >= 0; k--) {
      if (/^Advogad/i.test(partes[k])) continue;
      if (/^(AUTOR|RÉU|REU|APELANTE|APELADO|REQUERENTE|REQUERIDO|X|OUTRAS PARTES|ACUSADO|INDICIADO)$/i.test(partes[k])) break;
      if (nomes.indexOf(partes[k]) < 0) nomes.push(partes[k]);
      break;
    }
  });
  return nomes;
}

/** Aviso "push" do PJe (TRT): uma tabela de eventos de um processo. */
function lerAvisoPje_(msg) {
  var corpo = (msg.getPlainBody() || '').replace(/\*/g, '');
  var mN = RE_CNJ.exec(msg.getSubject()) || RE_CNJ.exec(corpo);
  if (!mN) return [];
  var numero = mN[1];
  var tribunal = tribunalDoNumero_(numero);
  var orgao = ((/Órgão Julgador:\s*([^\n]+)/i.exec(corpo) || [])[1] || '').trim();
  // Qual polo é o nosso: "Advogados do Réu: ... JULIAN ..."
  var nomes = [];
  var reAdv = /Advogados? d[oa]s?\s+([^:\n]+?):\s*([^\n]+)/gi, mA;
  while ((mA = reAdv.exec(corpo))) {
    if (!/JULIAN MARCELINO|54832/i.test(mA[2])) continue;
    var rot = mA[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var mP = new RegExp('(?:^|\\n)\\s*' + rot + ':\\s*([^\\n]+)', 'i').exec(corpo);
    if (mP) nomes.push(mP[1].trim());
  }
  var itens = [];
  var reEv = /(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}\s*\|?\s*([^\n|]+)/g, mE;
  while ((mE = reEv.exec(corpo))) {
    var data = mE[3] + '-' + mE[2] + '-' + mE[1];
    var mov = mE[4].trim();
    if (/documento sigiloso/i.test(mov) || /^:\d/.test(mov)) continue;
    var intimacao = /intima[çc][ãa]o/i.test(mov) && /expedid/i.test(mov);
    var paraNos = !nomes.length || nomes.some(function (n) { return normalizar_(mov).indexOf(normalizar_(n)) >= 0; });
    itens.push({
      fonte: 'PJe ' + tribunal, chave: 'pje|' + numero + '|' + data + '|' + mov, recebido_em: msg.getDate().toISOString(),
      numero: numero, tribunal: tribunal, sistema: 'PJe', movimento: mov + (orgao ? ' — ' + orgao : ''), evento: '',
      texto: '', nomes: nomes, tipo: intimacao && paraNos ? 'expedida' : '',
      ciencia: somarDias_(data, 10), ciencia_tipo: 'tácita: 10 dias após a expedição (' + dataBR_(data) + ')'
    });
  }
  return itens;
}

/* ---------- DJEN (Diário de Justiça Eletrônico Nacional) ---------- */

function lerDjen_(ctx) {
  var hoje = hojeSP_();
  var desde = config_('ROBO_DJEN_DESDE') || somarDias_(hoje, -15);
  var intimacoes = 0, prazos = 0;
  for (var pagina = 1; pagina <= 10; pagina++) {
    var url = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=' + OAB_NUMERO + '&ufOab=' + OAB_UF +
      '&dataDisponibilizacaoInicio=' + desde + '&dataDisponibilizacaoFim=' + hoje + '&pagina=' + pagina + '&itensPorPagina=100';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    if (resp.getResponseCode() !== 200) throw new Error('consulta recusada (código ' + resp.getResponseCode() + ')');
    var j = JSON.parse(resp.getContentText() || '{}');
    var itens = j.items || j.itens || [];
    itens.forEach(function (it) {
      var numero = it.numeroprocessocommascara || mascaraCnj_(it.numero_processo || it.numeroProcesso || '');
      if (!RE_CNJ.test(numero || '')) return;
      var disp = String(it.data_disponibilizacao || it.dataDisponibilizacao || hoje).slice(0, 10);
      var trib = it.siglaTribunal || tribunalDoNumero_(numero);
      var publicacao = proximoUtil_(disp, trib, ctx.feriados, true);
      var r = registrarIntimacao_(ctx, {
        fonte: 'DJEN', chave: 'djen|' + (it.id || it.hash || (numero + '|' + disp + '|' + String(it.texto || '').slice(0, 40))),
        recebido_em: disp + 'T12:00:00.000Z', numero: numero, tribunal: trib, sistema: '',
        movimento: (it.tipoComunicacao || 'Comunicação') + (it.nomeOrgao ? ' — ' + it.nomeOrgao : ''),
        texto: String(it.texto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), nomes: [],
        tipo: /intima/i.test(it.tipoComunicacao || 'intimação') ? 'publicacao' : '',
        ciencia: publicacao, ciencia_tipo: 'publicação no DJEN em ' + dataBR_(publicacao) + ' (disponibilizada ' + dataBR_(disp) + ')'
      });
      if (r.nova) intimacoes++;
      if (r.prazo) prazos++;
    });
    if (itens.length < 100) break;
  }
  setConfig_('ROBO_DJEN_DESDE', somarDias_(hoje, -2), 'Data a partir da qual o robô consulta o DJEN');
  return { intimacoes: intimacoes, prazos: prazos };
}

function mascaraCnj_(n) {
  n = String(n).replace(/\D/g, '');
  if (n.length !== 20) return '';
  return n.slice(0, 7) + '-' + n.slice(7, 9) + '.' + n.slice(9, 13) + '.' + n.slice(13, 14) + '.' + n.slice(14, 16) + '.' + n.slice(16);
}

function dataBR_(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }

/* ---------- Prazos: leitura e edição pelo painel ---------- */

function recalcularPrazosAbertos_(ctx) {
  var tab = ctx ? ctx.prazos : tabela_('Prazos');
  var feriados = ctx ? ctx.feriados : mapaFeriados_();
  var tribs = {};
  (ctx ? ctx.procs : tabela_('Processos')).linhas.forEach(function (p) { tribs[p.id] = p.tribunal; });
  tab.linhas.forEach(function (z) {
    // Só o robô recalcula; prazo conferido ou lançado à mão fica como está.
    if (z.origem !== 'robô' || z.situacao === 'conferido' || SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return;
    var f = calcularFatal_(z.ciencia, z.dias, z.contagem, tribs[z.processo_id] || tribunalDoNumero_(z.numero), feriados);
    if (f !== z.fatal) atualizarLinha_(tab, z, { fatal: f });
  });
}

function prazoPublico_(z, procs, nomes) {
  var p = procs[z.processo_id] || {};
  var x = limpar_(z);
  x.cliente = nomes[p.cliente_id] || p.cliente_nome || '';
  x.cliente_id = p.cliente_id || '';
  x.tribunal = p.tribunal || tribunalDoNumero_(z.numero);
  x.orgao = p.orgao || '';
  return x;
}

function listarPrazos_(d) {
  var procs = {}, nomes = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  var limiteFechados = somarDias_(hojeSP_(), -30);
  return tabela_('Prazos').linhas
    .filter(function (z) {
      if (d.processo_id && z.processo_id !== d.processo_id) return false;
      return SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 || (d.encerrados && (z.atualizado_em || '').slice(0, 10) >= limiteFechados);
    })
    .map(function (z) { return prazoPublico_(z, procs, nomes); })
    .sort(function (a, b) { return (a.fatal || '0000') < (b.fatal || '0000') ? -1 : 1; });
}

function salvarPrazo_(d, u) {
  return comTrava_(function () {
    var z = d.prazo || {};
    var procs = tabela_('Processos');
    var proc = procs.linhas.filter(function (p) { return p.id === z.processo_id; })[0];
    if (!proc && z.numero) proc = procs.linhas.filter(function (p) { return p.numero === String(z.numero).trim(); })[0];
    if (!proc) throw falha_('Escolha o processo do prazo.');
    var dias = String(z.dias || '').trim();
    if (dias && !/^\d{1,3}$/.test(dias)) throw falha_('Dias do prazo: use só números.');
    if (z.ciencia && !/^\d{4}-\d{2}-\d{2}$/.test(z.ciencia)) throw falha_('Data de ciência inválida.');
    if (z.fatal && !/^\d{4}-\d{2}-\d{2}$/.test(z.fatal)) throw falha_('Data fatal inválida.');
    var contagem = z.contagem === 'corridos' ? 'corridos' : 'uteis';
    var fatal = z.fatal || calcularFatal_(z.ciencia, dias, contagem, proc.tribunal);
    var tab = tabela_('Prazos');
    var agora = new Date().toISOString();
    var dados = {
      processo_id: proc.id, numero: proc.numero, descricao: String(z.descricao || '').trim() || 'Prazo',
      dias: dias, contagem: contagem, ciencia: z.ciencia || '', fatal: fatal, observacoes: String(z.observacoes || '').trim(),
      situacao: fatal ? 'calculado' : 'a definir', conferido_por: '', conferido_em: '', atualizado_em: agora, atualizado_por: u.usuario
    };
    if (z.ciencia_tipo !== undefined) dados.ciencia_tipo = z.ciencia_tipo;
    if (z.fatal) dados.origem = 'manual (' + u.usuario + ')'; // data fatal digitada: o robô não mexe mais
    if (z.id) {
      var linha = tab.linhas.filter(function (r) { return r.id === z.id; })[0];
      if (!linha) throw falha_('Prazo não encontrado.');
      if (!dados.ciencia_tipo && dados.ciencia !== linha.ciencia) dados.ciencia_tipo = 'informada por ' + u.usuario;
      atualizarLinha_(tab, linha, dados);
      registrar_(u.usuario, 'prazo alterado', linha.id + ' ' + proc.numero + ' fatal ' + fatal);
      return { id: linha.id, fatal: fatal };
    }
    dados.id = novoId_('Z');
    dados.intimacao_id = '';
    dados.ciencia_tipo = dados.ciencia_tipo || (dados.ciencia ? 'informada por ' + u.usuario : '');
    dados.origem = 'manual (' + u.usuario + ')';
    dados.criado_em = agora;
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'prazo criado', dados.id + ' ' + proc.numero + ' fatal ' + fatal);
    return { id: dados.id, fatal: fatal };
  });
}

function conferirPrazo_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Prazos');
    var z = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!z) throw falha_('Prazo não encontrado.');
    if (!z.fatal) throw falha_('Defina os dias e a data de ciência antes de conferir.');
    atualizarLinha_(tab, z, { situacao: 'conferido', conferido_por: u.nome || u.usuario, conferido_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, 'prazo conferido', z.id + ' ' + z.numero + ' fatal ' + z.fatal);
    return { ok: true };
  });
}

function mudarSituacaoPrazo_(d, u) {
  return comTrava_(function () {
    var nova = { cumprido: 'cumprido', cancelado: 'cancelado', reabrir: 'calculado' }[d.situacao];
    if (!nova) throw falha_('Situação inválida.');
    var tab = tabela_('Prazos');
    var z = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!z) throw falha_('Prazo não encontrado.');
    if (nova === 'calculado' && !z.fatal) nova = 'a definir';
    atualizarLinha_(tab, z, { situacao: nova, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario,
      conferido_por: nova === 'calculado' ? '' : z.conferido_por, conferido_em: nova === 'calculado' ? '' : z.conferido_em });
    registrar_(u.usuario, 'prazo ' + nova, z.id + ' ' + z.numero);
    return { ok: true };
  });
}

function listarIntimacoes_(d) {
  var lim = Math.min(parseInt(d.limite, 10) || 50, 200);
  return tabela_('Intimacoes').linhas
    .sort(function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; })
    .slice(0, lim)
    .map(function (i) { var x = limpar_(i); x.texto = String(x.texto || '').slice(0, 600); return x; });
}

function resumoPrazos_() {
  var lista = listarPrazos_({});
  var hoje = hojeSP_();
  var em5 = somarDias_(hoje, 5);
  return {
    abertos: lista.length,
    aDefinir: lista.filter(function (z) { return z.situacao === 'a definir'; }).length,
    aConferir: lista.filter(function (z) { return z.situacao === 'calculado'; }).length,
    vencendo: lista.filter(function (z) { return z.fatal && z.fatal >= hoje && z.fatal <= em5; }).length,
    vencidos: lista.filter(function (z) { return z.fatal && z.fatal < hoje; }).length,
    proximos: lista.filter(function (z) { return z.fatal && z.fatal >= hoje; }).slice(0, 8)
      .concat(lista.filter(function (z) { return z.situacao === 'a definir'; }).slice(0, 4))
  };
}

/* ---------- Agenda (Google Agenda) ---------- */

function agendas_() {
  var ids = {};
  try { ids = JSON.parse(config_('AGENDAS') || '{}'); } catch (e) { ids = {}; }
  var faltou = false;
  NOMES_AGENDAS.forEach(function (n) {
    if (ids[n]) return;
    var c = CalendarApp.getCalendarsByName(n)[0];
    if (c) { ids[n] = c.getId(); faltou = true; }
  });
  if (faltou) setConfig_('AGENDAS', JSON.stringify(ids), 'Agendas do Google usadas pelo painel');
  return ids;
}

function listarAgenda_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(d.fim || '')) throw falha_('Período inválido.');
  if (diffDias_(d.fim, d.inicio) > 45) throw falha_('Período longo demais.');
  var ini = new Date(d.inicio + 'T00:00:00-03:00');
  var fim = new Date(somarDias_(d.fim, 1) + 'T00:00:00-03:00');
  var ids = agendas_();
  var eventos = [];
  var avisos = [];
  NOMES_AGENDAS.forEach(function (nome) {
    if (!ids[nome]) { avisos.push('Agenda "' + nome + '" não encontrada.'); return; }
    var cal = CalendarApp.getCalendarById(ids[nome]);
    if (!cal) { avisos.push('Sem acesso à agenda "' + nome + '".'); return; }
    cal.getEvents(ini, fim).forEach(function (ev) {
      var diaTodo = ev.isAllDayEvent();
      eventos.push({
        id: ev.getId(), agenda: nome, titulo: ev.getTitle(), local: ev.getLocation() || '',
        descricao: String(ev.getDescription() || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
        diaTodo: diaTodo, inicio: dataHora_(ev.getStartTime()), fim: dataHora_(ev.getEndTime())
      });
    });
  });
  var prazos = listarPrazos_({}).filter(function (z) { return z.fatal && z.fatal >= d.inicio && z.fatal <= d.fim; });
  return { eventos: eventos, prazos: prazos, agendas: NOMES_AGENDAS, avisos: avisos };
}

function dataHora_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd') + 'T' + Utilities.formatDate(d, TZ, 'HH:mm');
}

function criarCompromisso_(d, u) {
  var ids = agendas_();
  if (NOMES_AGENDAS.indexOf(d.agenda) < 0 || !ids[d.agenda]) throw falha_('Escolha uma das agendas do escritório.');
  var titulo = String(d.titulo || '').trim();
  if (!titulo) throw falha_('Informe o título do compromisso.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) throw falha_('Data inválida.');
  if (!/^\d{2}:\d{2}$/.test(d.inicio || '')) throw falha_('Hora de início inválida.');
  var fimH = /^\d{2}:\d{2}$/.test(d.fim || '') ? d.fim : null;
  var ini = new Date(d.data + 'T' + d.inicio + ':00-03:00');
  var fim = fimH ? new Date(d.data + 'T' + fimH + ':00-03:00') : new Date(ini.getTime() + 60 * 60000);
  if (fim <= ini) throw falha_('O fim precisa ser depois do início.');
  var ev = CalendarApp.getCalendarById(ids[d.agenda]).createEvent(titulo, ini, fim, {
    location: String(d.local || ''), description: String(d.descricao || '') + '\n\nMarcado pelo painel por ' + (u.nome || u.usuario) + '.'
  });
  registrar_(u.usuario, 'compromisso criado', d.agenda + ' ' + d.data + ' ' + d.inicio + ' ' + titulo);
  return { id: ev.getId() };
}
