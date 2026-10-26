/**
 * Painel interno — Araújo Advocacia
 * Programa do Google (Apps Script) que fica dentro da planilha "PAINEL — BANCO DE DADOS".
 *
 * O que ele faz:
 *  - confere usuário e senha e decide o que cada perfil pode ver;
 *  - lê e grava clientes e processos na planilha;
 *  - cria (ou reaproveita) a pasta do cliente em "02. CLIENTES" no Drive.
 *
 * Os dados ficam só na planilha, que não é compartilhada com ninguém.
 * A equipe acessa pelo painel do site; o programa roda com a conta dona da planilha.
 *
 * Como instalar: veja painel-backend/INSTALAR.md no repositório do site.
 */

var VERSAO = '1.0.0';

var PERFIS = {
  administrador: { nome: 'Administrador', financeiro: true, usuarios: true },
  secretario: { nome: 'Secretário', financeiro: false, usuarios: false },
  estagiario: { nome: 'Estagiário', financeiro: false, usuarios: false }
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
  Feriados: ['data', 'descricao', 'abrangencia'],
  Log: ['quando', 'usuario', 'acao', 'detalhe']
};

var SENHA_MIN = 10;
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

// Trechos que tornam a senha fácil de adivinhar (inclui a senha que já esteve exposta no PDF do GEA).
var SENHAS_FRACAS = ['123456', '654321', 'senha', 'password', 'qwerty', 'abc123', 'estagio', 'estagiario', 'araujo',
  'advocacia', 'advogad', 'julian', 'tubarao', 'admin', 'painel'];

function validarSenha_(senha, usuario) {
  senha = String(senha || '');
  if (senha.length < SENHA_MIN || !/[A-Za-zÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
    throw falha_('A senha precisa ter pelo menos ' + SENHA_MIN + ' caracteres, com letras e números.');
  }
  var s = normalizar_(senha).replace(/\s/g, '');
  var u = normalizar_(usuario || '');
  if ((u.length >= 3 && s.indexOf(u) >= 0) || SENHAS_FRACAS.some(function (f) { return s.indexOf(f) >= 0; }) || /^(.)\1+$/.test(s)) {
    throw falha_('Senha fácil de adivinhar. Evite o nome do usuário, do escritório, "senha" e sequências como 123456.');
  }
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
  return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.perfil, perfilNome: p.nome, pode: { financeiro: p.financeiro, usuarios: p.usuarios } };
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
    proximos: proximos
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
