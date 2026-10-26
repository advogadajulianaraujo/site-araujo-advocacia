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

var VERSAO = '4.2.0';

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
    'observacoes', 'situacao', 'criado_em', 'atualizado_em', 'atualizado_por', 'tipo_acao', 'resumo_caso', 'providencias'],
  Processos: ['id', 'cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
    'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'origem', 'criado_em',
    'atualizado_em', 'atualizado_por'],
  Intimacoes: ['id', 'chave', 'fonte', 'recebido_em', 'numero', 'tribunal', 'movimento', 'evento', 'texto',
    'partes_cliente', 'processo_id', 'prazo_id', 'criado_em'],
  Prazos: ['id', 'processo_id', 'numero', 'intimacao_id', 'descricao', 'dias', 'contagem', 'ciencia', 'ciencia_tipo',
    'fatal', 'situacao', 'conferido_por', 'conferido_em', 'origem', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por',
    'cumprido_por', 'cumprido_em'],
  Honorarios: ['id', 'cliente_id', 'processo_id', 'tipo', 'descricao', 'valor_total', 'percentual', 'valor_mensal',
    'dia_vencimento', 'inicio', 'situacao', 'observacoes', 'origem', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Parcelas: ['id', 'honorario_id', 'cliente_id', 'numero', 'vencimento', 'valor', 'pago_em', 'valor_pago', 'forma',
    'cobranca', 'mensagem_em', 'acao_processo_id', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Recebimentos: ['id', 'honorario_id', 'processo_id', 'data', 'valor_bruto', 'percentual', 'honorarios', 'repasse_cliente',
    'repassado_em', 'observacoes', 'criado_em', 'criado_por'],
  Eventos: ['chave', 'tipo', 'numero', 'data', 'hora', 'agenda', 'evento_id', 'prazo_id', 'criado_em'],
  Feriados: ['data', 'descricao', 'abrangencia'],
  Log: ['quando', 'usuario', 'acao', 'detalhe'],
  PastasConferir: ['pasta', 'pasta_url', 'motivo', 'clientes_possiveis']
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
    .addItem('4. Importar tudo do GEA (clientes e financeiro)', 'importarGEA')
    .addItem('Gerar novo código de primeiro acesso', 'gerarCodigoPrimeiroAcesso')
    .addToUi();
}

/** Cria as abas que faltam, fixa formato de texto e gera o código de primeiro acesso. */
function configurar() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(ESQUEMA).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cab = ESQUEMA[nome];
    // Escreve o cabeçalho completo; colunas novas entram sempre no fim, sem mexer nos dados.
    sh.getRange(1, 1, 1, cab.length).setValues([cab]);
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
  var gea = importarGEASeguro_(false);
  try { var lig = vincularPastas_(); if (lig) gea = (gea ? gea + '\n' : '') + lig + ' clientes ligados às pastas do Drive (veja a aba PastasConferir).'; } catch (e) { /* pasta 02. CLIENTES não configurada */ }
  var nomes = corrigirNomesMaiusculos_();
  if (nomes) gea = (gea ? gea + '\n' : '') + nomes + ' nomes do GEA passaram de MAIÚSCULAS para o formato normal.';
  if (gea) importados = (importados ? importados + '\n\n' : '') + gea;
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

/** Grava numa só chamada as linhas alteradas com tab.adiar = true. */
function regravarMudadas_(tab) {
  tab.adiar = false;
  var mud = tab.linhas.filter(function (o) { return o._mudou && !o._novo; });
  if (!mud.length) return 0;
  var min = Infinity, max = 0;
  mud.forEach(function (o) { min = Math.min(min, o._linha); max = Math.max(max, o._linha); });
  var faixa = tab.aba.getRange(min, 1, max - min + 1, tab.cab.length);
  var vals = faixa.getDisplayValues().map(function (l) { return l.map(seguro_); });
  mud.forEach(function (o) { vals[o._linha - min] = tab.cab.map(function (k) { return seguro_(o[k]); }); delete o._mudou; });
  faixa.setNumberFormat('@').setValues(vals);
  return mud.length;
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

/** Aviso que não trava: aparece no canto da planilha e no Registro de execução do Apps Script.
 *  (Uma janela com OK deixava o programa esperando um clique e o Google o derrubava depois de 6 minutos.) */
function aviso_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getActive().toast(String(msg).slice(0, 600), 'Painel', 60); } catch (e) { /* sem planilha aberta */ }
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
  'relatorio.cumpridos': { permissao: 'usuarios', fn: relatorioCumpridos_ },
  'clientes.documentos': { fn: documentosCliente_ },
  'modelos.listar': { fn: listarModelos_ },
  'documentos.gerar': { fn: gerarDocumentos_ },
  'feriados.listar': { fn: function () { return tabela_('Feriados').linhas.map(limpar_); } },
  'feriados.salvar': { permissao: 'usuarios', fn: salvarFeriado_ },
  'fin.resumo': { permissao: 'financeiro', fn: resumoFinanceiro_ },
  'fin.honorarios': { permissao: 'financeiro', fn: listarHonorarios_ },
  'fin.honorario': { permissao: 'financeiro', fn: obterHonorario_ },
  'fin.honorario.salvar': { permissao: 'financeiro', fn: salvarHonorario_ },
  'fin.parcela.salvar': { permissao: 'financeiro', fn: salvarParcela_ },
  'fin.parcela.pagar': { permissao: 'financeiro', fn: pagarParcela_ },
  'fin.parcela.cobranca': { permissao: 'financeiro', fn: cobrancaParcela_ },
  'fin.recebimento.salvar': { permissao: 'financeiro', fn: salvarRecebimento_ },
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

var CAMPOS_CLIENTE = ['tipo_acao', 'resumo_caso', 'providencias', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
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
    if (c.id && c.pasta_link !== undefined) {
      var link = String(c.pasta_link || '').trim();
      var atualLinha = tab.linhas.filter(function (r) { return r.id === c.id; })[0];
      if (link && (!atualLinha || link !== atualLinha.pasta_url)) {
        var mid = /folders\/([A-Za-z0-9_-]+)/.exec(link) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(link) || /^([A-Za-z0-9_-]{20,})$/.exec(link);
        if (!mid) throw falha_('Link da pasta inválido. Abra a pasta no Google Drive e copie o endereço da barra do navegador.');
        var pastaNova;
        try { pastaNova = DriveApp.getFolderById(mid[1]); pastaNova.getName(); }
        catch (e) { throw falha_('Não encontrei essa pasta no Drive da conta do escritório.'); }
        dados.pasta_id = pastaNova.getId();
        dados.pasta_url = pastaNova.getUrl();
      }
    }
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
  aviso_(n + ' clientes ligados às pastas que já existiam. As pastas sem cliente estão na aba PastasConferir.');
  return n;
}

function vincularPastas_() {
  var raiz = pastaClientes_();
  var pastas = [];
  var it = raiz.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    pastas.push({ id: f.getId(), nome: f.getName() });
  }
  var porNome = {};
  pastas.forEach(function (p) { p.url = 'https://drive.google.com/drive/folders/' + p.id; porNome[normalizar_(p.nome)] = p; });
  var n = 0, aprox = 0, duvidas = [];
  comTrava_(function () {
    var tab = tabela_('Clientes');
    tab.adiar = true;
    // 1) nome igual
    tab.linhas.forEach(function (c) {
      if (c.pasta_id) return;
      var p = porNome[normalizar_(c.nome)];
      if (!p) return;
      atualizarLinha_(tab, c, { pasta_id: p.id, pasta_url: p.url }); n++;
    });
    // 2) nome parecido (erros de digitação, nome incompleto, complementos)
    var r = casarPastas_(pastas, tab.linhas);
    r.ligar.forEach(function (x) { atualizarLinha_(tab, x.cliente, { pasta_id: x.pasta.id, pasta_url: x.pasta.url }); aprox++; });
    duvidas = r.duvidas;
    regravarMudadas_(tab);
    // 3) relatório: pastas que não ficaram com nenhum cliente
    var usadas = {};
    tab.linhas.forEach(function (c) { if (c.pasta_id) usadas[c.pasta_id] = true; });
    var mapaDuv = {};
    duvidas.forEach(function (d) { mapaDuv[d.pasta.id] = d.candidatos.join(' | '); });
    var linhas = pastas.filter(function (p) { return !usadas[p.id]; })
      .sort(function (a, b) { return a.nome < b.nome ? -1 : 1; })
      .map(function (p) { return [seguro_(p.nome), p.url, mapaDuv[p.id] ? 'mais de um cliente possível' : 'nenhum cliente com esse nome', seguro_(mapaDuv[p.id] || '')]; });
    var sh = aba_('PastasConferir');
    var cab = ESQUEMA.PastasConferir;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).clearContent();
    if (linhas.length) sh.getRange(2, 1, linhas.length, cab.length).setNumberFormat('@').setValues(linhas);
  });
  registrar_('sistema', 'pastas vinculadas', n + ' pelo nome igual, ' + aprox + ' pelo nome parecido, ' + duvidas.length + ' em dúvida');
  return n + aprox;
}

/* ---------- Casamento aproximado de pastas com clientes ----------
   As pastas em 02. CLIENTES foram criadas à mão ao longo dos anos: há erros de digitação
   ("ADELMOS"), nomes incompletos ("ZENO MORERA"), "de/da" faltando, complementos
   ("- IMBITUBA", "(DATIVA)") e pastas com duas pessoas ("FULANO e BELTRANA").
   Só liga quando há um único cliente possível; o resto vai para a aba PastasConferir. */
var PARTICULAS_NOME = { da: 1, de: 1, do: 1, das: 1, dos: 1, e: 1, d: 1, di: 1, du: 1 };
var RUIDO_PASTA = { documentos: 1, documento: 1, dativa: 1, dativo: 1, docs: 1, mae: 1, pai: 1, filho: 1, filha: 1, caso: 1,
  criminal: 1, trabalhista: 1, previdenciario: 1, civel: 1, inventario: 1, acao: 1, processo: 1, processos: 1, ltda: 1, me: 1,
  epp: 1, eireli: 1, novo: 1, nova: 1, antigo: 1, antiga: 1, imbituba: 1, tubarao: 1, laguna: 1, criciuma: 1, garopaba: 1,
  argentina: 1, r: 1 };

function tokensNome_(s, ruido) {
  return normalizar_(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(function (w) {
    return w && !PARTICULAS_NOME[w] && !(ruido && RUIDO_PASTA[w]) && !/^\d+$/.test(w);
  });
}

function distancia_(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var ant = [], i, j;
  for (j = 0; j <= b.length; j++) ant[j] = j;
  for (i = 1; i <= a.length; i++) {
    var cur = [i], menor = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      if (cur[j] < menor) menor = cur[j];
    }
    if (menor > max) return max + 1;
    ant = cur;
  }
  return ant[b.length];
}

function palavraParecida_(a, b) {
  if (a === b) return true;
  var max = Math.min(a.length, b.length) >= 8 ? 2 : Math.min(a.length, b.length) >= 4 ? 1 : 0;
  return max > 0 && distancia_(a, b, max) <= max;
}

/** Todas as palavras de "poucas" aparecem (iguais ou parecidas) em "muitas", e a primeira bate com a primeira. */
function contidoEm_(poucas, muitas) {
  if (poucas.length < 2 || poucas.length > muitas.length) return false;
  if (!palavraParecida_(poucas[0], muitas[0])) return false;
  var usadas = { 0: true };
  for (var i = 1; i < poucas.length; i++) {
    var achou = false;
    for (var j = 1; j < muitas.length; j++) {
      if (usadas[j]) continue;
      if (palavraParecida_(poucas[i], muitas[j])) { usadas[j] = true; achou = true; break; }
    }
    if (!achou) return false;
  }
  return true;
}

/** Partes do nome da pasta: "A e B", "A, B", "A (B)", "A - complemento", "A x Empresa". */
function partesPasta_(nome) {
  var t = String(nome || '');
  var partes = [];
  // nome entre parênteses só vale se bater por inteiro (pode ser outra pessoa: "LIANA (KELLY CRISTINA)")
  t.replace(/\(([^)]*)\)/g, function (m, dentro) { var tk = tokensNome_(dentro, true); tk.soInteiro = true; partes.push(tk); return ''; });
  t = t.replace(/\([^)]*\)/g, ' ');
  t.split(/\s+[-–]\s+|\s+x\s+|,|\s+e\s+|\.\s/i).forEach(function (p) { partes.push(tokensNome_(p, true)); });
  return partes.filter(function (tk) { return tk.length >= 2; });
}

/**
 * pastas: [{id, url, nome}]; clientes: [{id, nome, pasta_id}].
 * Devolve { ligar: [{cliente, pasta}], duvidas: [{pasta, candidatos: [nomes]}] }.
 */
function casarPastas_(pastas, clientes) {
  var usadas = {};
  clientes.forEach(function (c) { if (c.pasta_id) usadas[c.pasta_id] = true; });
  var porPrimeira = {};
  var tk = clientes.map(function (c) {
    var t = tokensNome_(c.nome, false);
    if (t.length) (porPrimeira[t[0]] = porPrimeira[t[0]] || []).push(c);
    return t;
  });
  var tokDe = {};
  clientes.forEach(function (c, i) { tokDe[c.id] = tk[i]; });
  var primeiras = Object.keys(porPrimeira);
  var ligar = [], duvidas = [], jaLigado = {};
  pastas.forEach(function (p) {
    if (usadas[p.id]) return;
    partesPasta_(p.nome).forEach(function (parte) {
      var cand = [];
      primeiras.forEach(function (w) {
        if (!palavraParecida_(parte[0], w)) return;
        porPrimeira[w].forEach(function (c) {
          var ct = tokDe[c.id];
          var inteiro = parte.length === ct.length && contidoEm_(parte, ct);
          if (inteiro || (!parte.soInteiro && (contidoEm_(parte, ct) || (ct.length >= 3 && contidoEm_(ct, parte))))) cand.push({ c: c, inteiro: inteiro });
        });
      });
      if (!cand.length) return;
      var inteiros = cand.filter(function (x) { return x.inteiro; });
      var mesmoNome = cand.every(function (x) { return normalizar_(x.c.nome) === normalizar_(cand[0].c.nome); });
      // cadastros repetidos da mesma pessoa ficam todos com a pasta
      var escolhidos = mesmoNome ? cand.map(function (x) { return x.c; }) : cand.length === 1 ? [cand[0].c] : inteiros.length === 1 ? [inteiros[0].c] : null;
      if (!escolhidos) {
        duvidas.push({ pasta: p, candidatos: cand.map(function (x) { return x.c.nome; }).slice(0, 6) });
        return;
      }
      escolhidos.forEach(function (escolhido) {
        if (escolhido.pasta_id || jaLigado[escolhido.id]) return;
        jaLigado[escolhido.id] = true;
        ligar.push({ cliente: escolhido, pasta: p });
      });
    });
  });
  return { ligar: ligar, duvidas: duvidas };
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
    clientesNovos: clientes.filter(function (c) { return (c.criado_em || '').slice(0, 10) >= somarDias_(hoje, -30) && !/levantamento|planilha|GEA/.test(c.origem || ''); })
      .sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; }).slice(0, 8)
      .map(function (c) { return { id: c.id, nome: c.nome, area: c.area, criado_em: c.criado_em, situacao: c.situacao }; }),
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
  if (tab.adiar) { linhaObj._mudou = true; return; } // gravado de uma vez por regravarMudadas_
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
var NOMES_AGENDAS = ['ATENDIMENTOS', 'AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO', 'PERÍCIAS'];
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

function rodarRoboGatilho() {
  // Se o código novo foi colado mas a importação do GEA ainda não rodou, ela roda aqui sozinha.
  var t0 = Date.now();
  importarGEASeguro_(false);
  if (Date.now() - t0 > 90 * 1000) return; // a importação demorou; o robô lê os avisos na próxima rodada
  rodarRobo_('robô (6 em 6 h)');
}
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
  var marcado = detectarAudienciaPericia_(ctx, d, proc, intim);
  if (!d.tipo) return { nova: true, prazo: marcado };

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
    if (/^ato:/.test(z.observacoes || '')) return; // audiência/perícia: a data é a do ato
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
    var agoraIso = new Date().toISOString();
    atualizarLinha_(tab, z, { situacao: nova, atualizado_em: agoraIso, atualizado_por: u.usuario,
      conferido_por: nova === 'calculado' ? '' : z.conferido_por, conferido_em: nova === 'calculado' ? '' : z.conferido_em,
      cumprido_por: nova === 'cumprido' ? (u.nome || u.usuario) : (nova === 'cancelado' ? z.cumprido_por : ''),
      cumprido_em: nova === 'cumprido' ? agoraIso : (nova === 'cancelado' ? z.cumprido_em : '') });
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
    if (!c && n === 'PERÍCIAS') { try { c = CalendarApp.createCalendar('PERÍCIAS', { color: CalendarApp.Color.PURPLE }); } catch (e) { c = CalendarApp.createCalendar('PERÍCIAS'); } }
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

/* ================================================================== */
/* ETAPA 3 — Financeiro: honorários, parcelas, atrasos e alvarás       */
/* ================================================================== */

var TIPOS_HONORARIO = { parcelado: 'Parcelado', exito: 'Êxito', mensal: 'Mensal (assessoria)' };

function dinheiro_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  var t = String(v).replace(/[R$\s]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56
  var n = parseFloat(t);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
function txtDinheiro_(n) { return (Math.round(n * 100) / 100).toFixed(2); }

/** Situação da parcela no dia de hoje. */
function situacaoParcela_(p, hoje) {
  if (p.pago_em) return dinheiro_(p.valor_pago) && dinheiro_(p.valor_pago) < dinheiro_(p.valor) ? 'paga em parte' : 'paga';
  if (p.vencimento && p.vencimento < hoje) return 'atrasada';
  return 'a vencer';
}

function mapaClientes_() {
  var m = {};
  tabela_('Clientes').linhas.forEach(function (c) { m[c.id] = c; });
  return m;
}

function parcelaPublica_(p, hoje, clientes, hons) {
  var x = limpar_(p);
  var c = clientes[p.cliente_id] || {};
  var h = hons[p.honorario_id] || {};
  x.situacao = situacaoParcela_(p, hoje);
  x.dias_atraso = x.situacao === 'atrasada' ? diffDias_(hoje, p.vencimento) : 0;
  x.cliente = c.nome || '';
  x.telefone = c.telefone || '';
  x.honorario = h.descricao || TIPOS_HONORARIO[h.tipo] || '';
  x.saldo = x.situacao === 'paga' ? 0 : dinheiro_(p.valor) - dinheiro_(p.valor_pago);
  return x;
}

/** Mensalistas: mantém as mensalidades geradas até 2 meses à frente. */
function estenderMensais_() {
  var hons = tabela_('Honorarios').linhas.filter(function (h) { return h.tipo === 'mensal' && h.situacao === 'ativo' && dinheiro_(h.valor_mensal); });
  if (!hons.length) return;
  var tab = tabela_('Parcelas');
  var limite = somarDias_(hojeSP_(), 62);
  hons.forEach(function (h) {
    var ps = tab.linhas.filter(function (p) { return p.honorario_id === h.id; });
    var ultimo = ps.reduce(function (m, p) { return p.vencimento > m ? p.vencimento : m; }, '');
    var prox = ultimo ? mesSeguinte_(ultimo, h.dia_vencimento) : primeiroVencimento_(h.inicio || hojeSP_(), h.dia_vencimento);
    var n = ps.length;
    for (var i = 0; i < 24 && prox <= limite; i++) {
      n++;
      inserirLinha_(tab, novaParcela_(h, n, prox, dinheiro_(h.valor_mensal), 'sistema'));
      prox = mesSeguinte_(prox, h.dia_vencimento);
    }
  });
}

function diaValido_(ano, mes, dia) {
  var ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Math.min(dia, ultimo);
}
function mesSeguinte_(iso, dia) {
  var a = +iso.slice(0, 4), m = +iso.slice(5, 7) + 1;
  if (m > 12) { m = 1; a++; }
  var d = diaValido_(a, m, parseInt(dia, 10) || +iso.slice(8, 10));
  return a + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
function primeiroVencimento_(inicio, dia) {
  dia = parseInt(dia, 10) || +inicio.slice(8, 10);
  var a = +inicio.slice(0, 4), m = +inicio.slice(5, 7);
  var v = a + '-' + ('0' + m).slice(-2) + '-' + ('0' + diaValido_(a, m, dia)).slice(-2);
  return v >= inicio ? v : mesSeguinte_(v, dia);
}

function novaParcela_(h, numero, vencimento, valor, quem) {
  var agora = new Date().toISOString();
  return { id: novoId_('Q'), honorario_id: h.id, cliente_id: h.cliente_id, numero: String(numero), vencimento: vencimento,
    valor: txtDinheiro_(valor), pago_em: '', valor_pago: '', forma: '', cobranca: '', mensagem_em: '', acao_processo_id: '',
    observacoes: '', criado_em: agora, atualizado_em: agora, atualizado_por: quem };
}

function resumoFinanceiro_() {
  comTrava_(estenderMensais_);
  var hoje = hojeSP_();
  var clientes = mapaClientes_();
  var hons = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var parcelas = tabela_('Parcelas').linhas.map(function (p) { return parcelaPublica_(p, hoje, clientes, hons); });
  var atrasadas = parcelas.filter(function (p) { return p.situacao === 'atrasada'; })
    .sort(function (a, b) { return b.dias_atraso - a.dias_atraso; });
  var em30 = somarDias_(hoje, 30);
  var proximas = parcelas.filter(function (p) { return p.situacao === 'a vencer' && p.vencimento <= em30; })
    .sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var mes = hoje.slice(0, 7);
  var soma = function (l, f) { return Math.round(l.reduce(function (t, p) { return t + f(p); }, 0) * 100) / 100; };
  var faixa = function (min, max) { return atrasadas.filter(function (p) { return p.dias_atraso >= min && p.dias_atraso <= max; }); };
  var recebMes = tabela_('Parcelas').linhas.filter(function (p) { return (p.pago_em || '').slice(0, 7) === mes; });
  return {
    hoje: hoje,
    totais: {
      atrasado: soma(atrasadas, function (p) { return p.saldo; }), parcelasAtrasadas: atrasadas.length,
      clientesAtrasados: Object.keys(atrasadas.reduce(function (m, p) { m[p.cliente_id] = 1; return m; }, {})).length,
      aReceber30: soma(proximas, function (p) { return p.saldo; }),
      recebidoMes: soma(recebMes, function (p) { return dinheiro_(p.valor_pago) || dinheiro_(p.valor); })
    },
    faixas: [
      { nome: 'até 30 dias', valor: soma(faixa(1, 30), function (p) { return p.saldo; }), qtd: faixa(1, 30).length },
      { nome: '31 a 90 dias', valor: soma(faixa(31, 90), function (p) { return p.saldo; }), qtd: faixa(31, 90).length },
      { nome: 'mais de 90 dias', valor: soma(faixa(91, 100000), function (p) { return p.saldo; }), qtd: faixa(91, 100000).length }
    ],
    atrasadas: atrasadas.slice(0, 200),
    proximas: proximas.slice(0, 100),
    aConferir: tabela_('Honorarios').linhas.filter(function (h) { return h.situacao === 'importado — conferir'; }).length
  };
}

function listarHonorarios_(d) {
  var hoje = hojeSP_();
  var clientes = mapaClientes_();
  var busca = normalizar_(d.busca || '');
  var porHon = {};
  tabela_('Parcelas').linhas.forEach(function (p) {
    var r = porHon[p.honorario_id] = porHon[p.honorario_id] || { total: 0, pago: 0, atrasado: 0, parcelas: 0 };
    var sit = situacaoParcela_(p, hoje);
    r.parcelas++;
    r.total += dinheiro_(p.valor);
    if (p.pago_em) r.pago += dinheiro_(p.valor_pago) || dinheiro_(p.valor);
    if (sit === 'atrasada') r.atrasado += dinheiro_(p.valor) - dinheiro_(p.valor_pago);
  });
  return tabela_('Honorarios').linhas
    .filter(function (h) { return !d.cliente_id || h.cliente_id === d.cliente_id; })
    .map(function (h) {
      var x = limpar_(h);
      var c = clientes[h.cliente_id] || {};
      x.cliente = c.nome || '';
      x.resumo = porHon[h.id] || { total: 0, pago: 0, atrasado: 0, parcelas: 0 };
      return x;
    })
    .filter(function (h) { return !busca || normalizar_(h.cliente + ' ' + h.descricao + ' ' + h.observacoes).indexOf(busca) >= 0; })
    .sort(function (a, b) { return b.resumo.atrasado - a.resumo.atrasado || (normalizar_(a.cliente) < normalizar_(b.cliente) ? -1 : 1); });
}

function obterHonorario_(d) {
  var h = tabela_('Honorarios').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!h) throw falha_('Honorário não encontrado.');
  var hoje = hojeSP_();
  var clientes = mapaClientes_();
  var hons = {}; hons[h.id] = h;
  var x = limpar_(h);
  x.cliente = (clientes[h.cliente_id] || {}).nome || '';
  x.telefone = (clientes[h.cliente_id] || {}).telefone || '';
  return {
    honorario: x,
    parcelas: tabela_('Parcelas').linhas.filter(function (p) { return p.honorario_id === h.id; })
      .map(function (p) { return parcelaPublica_(p, hoje, clientes, hons); })
      .sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; }),
    recebimentos: tabela_('Recebimentos').linhas.filter(function (r) { return r.honorario_id === h.id; }).map(limpar_)
  };
}

/**
 * Cria ou altera um honorário. Ao criar um parcelado, gera as parcelas (n, primeiro vencimento);
 * ao criar um mensal, gera as mensalidades até 2 meses à frente.
 */
function salvarHonorario_(d, u) {
  return comTrava_(function () {
    var h = d.honorario || {};
    var clientes = mapaClientes_();
    if (!clientes[h.cliente_id]) throw falha_('Escolha o cliente.');
    if (!TIPOS_HONORARIO[h.tipo]) throw falha_('Escolha o tipo de honorário.');
    var tab = tabela_('Honorarios');
    var agora = new Date().toISOString();
    var dados = {
      cliente_id: h.cliente_id, processo_id: h.processo_id || '', tipo: h.tipo, descricao: String(h.descricao || '').trim(),
      valor_total: h.valor_total ? txtDinheiro_(dinheiro_(h.valor_total)) : '', percentual: h.percentual ? String(dinheiro_(h.percentual)) : '',
      valor_mensal: h.valor_mensal ? txtDinheiro_(dinheiro_(h.valor_mensal)) : '', dia_vencimento: String(h.dia_vencimento || '').replace(/\D/g, ''),
      inicio: h.inicio || '', situacao: h.situacao || 'ativo', observacoes: String(h.observacoes || '').trim(),
      atualizado_em: agora, atualizado_por: u.usuario
    };
    if (dados.tipo === 'exito' && !(dinheiro_(dados.percentual) > 0)) throw falha_('Informe o percentual do êxito.');
    if (dados.tipo === 'mensal' && !(dinheiro_(dados.valor_mensal) > 0)) throw falha_('Informe o valor da mensalidade.');
    if (h.id) {
      var linha = tab.linhas.filter(function (r) { return r.id === h.id; })[0];
      if (!linha) throw falha_('Honorário não encontrado.');
      atualizarLinha_(tab, linha, dados);
      registrar_(u.usuario, 'honorário alterado', linha.id);
      return { id: linha.id };
    }
    var n = parseInt(h.parcelas, 10) || 1;
    var total = dinheiro_(dados.valor_total);
    if (dados.tipo === 'parcelado') {
      if (!(total > 0)) throw falha_('Informe o valor total.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h.primeiro_vencimento || '')) throw falha_('Informe o vencimento da 1ª parcela.');
      if (n < 1 || n > 120) throw falha_('Número de parcelas inválido.');
    }
    dados.id = novoId_('H');
    dados.origem = 'painel';
    dados.criado_em = agora;
    inserirLinha_(tab, dados);
    var parc = tabela_('Parcelas');
    if (dados.tipo === 'parcelado') {
      var base = Math.floor(total / n * 100) / 100;
      var venc = h.primeiro_vencimento;
      var dia = +venc.slice(8, 10);
      for (var i = 1; i <= n; i++) {
        var valor = i === n ? Math.round((total - base * (n - 1)) * 100) / 100 : base; // centavos na última
        inserirLinha_(parc, novaParcela_(dados, i, venc, valor, u.usuario));
        venc = mesSeguinte_(venc, dia);
      }
    }
    registrar_(u.usuario, 'honorário criado', dados.id + ' ' + dados.tipo);
    if (dados.tipo === 'mensal') estenderMensais_();
    return { id: dados.id };
  });
}

function parcelaPorId_(id) {
  var tab = tabela_('Parcelas');
  var p = tab.linhas.filter(function (r) { return r.id === id; })[0];
  if (!p) throw falha_('Parcela não encontrada.');
  return { tab: tab, p: p };
}

function salvarParcela_(d, u) {
  return comTrava_(function () {
    var x = d.parcela || {};
    var agora = new Date().toISOString();
    if (x.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(x.vencimento)) throw falha_('Vencimento inválido.');
    if (!x.id) {
      var h = tabela_('Honorarios').linhas.filter(function (r) { return r.id === x.honorario_id; })[0];
      if (!h) throw falha_('Honorário não encontrado.');
      if (!x.vencimento || !(dinheiro_(x.valor) > 0)) throw falha_('Informe vencimento e valor.');
      var parc = tabela_('Parcelas');
      var n = parc.linhas.filter(function (p) { return p.honorario_id === h.id; }).length + 1;
      var nova = novaParcela_(h, n, x.vencimento, dinheiro_(x.valor), u.usuario);
      nova.observacoes = String(x.observacoes || '');
      inserirLinha_(parc, nova);
      registrar_(u.usuario, 'parcela criada', nova.id);
      return { id: nova.id };
    }
    var r = parcelaPorId_(x.id);
    var m = { atualizado_em: agora, atualizado_por: u.usuario };
    if (x.vencimento) m.vencimento = x.vencimento;
    if (x.valor !== undefined && x.valor !== '') m.valor = txtDinheiro_(dinheiro_(x.valor));
    if (x.observacoes !== undefined) m.observacoes = String(x.observacoes);
    atualizarLinha_(r.tab, r.p, m);
    registrar_(u.usuario, 'parcela alterada', x.id);
    return { id: x.id };
  });
}

function pagarParcela_(d, u) {
  return comTrava_(function () {
    var r = parcelaPorId_(d.id);
    if (d.estornar) {
      atualizarLinha_(r.tab, r.p, { pago_em: '', valor_pago: '', forma: '', atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
      registrar_(u.usuario, 'pagamento estornado', d.id);
      return { ok: true };
    }
    var data = d.data || hojeSP_();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw falha_('Data do pagamento inválida.');
    var valor = d.valor ? dinheiro_(d.valor) : dinheiro_(r.p.valor);
    if (!(valor > 0)) throw falha_('Valor pago inválido.');
    atualizarLinha_(r.tab, r.p, { pago_em: data, valor_pago: txtDinheiro_(valor), forma: String(d.forma || ''),
      atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, 'parcela paga', d.id + ' R$ ' + txtDinheiro_(valor));
    return { ok: true };
  });
}

/** Etapas da cobrança: mensagem enviada ao cliente; ação de cobrança ajuizada. */
function cobrancaParcela_(d, u) {
  return comTrava_(function () {
    var r = parcelaPorId_(d.id);
    var m = { atualizado_em: new Date().toISOString(), atualizado_por: u.usuario };
    if (d.etapa === 'mensagem') { m.cobranca = r.p.cobranca === 'acao' ? 'acao' : 'mensagem'; m.mensagem_em = hojeSP_(); }
    else if (d.etapa === 'acao') { m.cobranca = 'acao'; m.acao_processo_id = d.processo_id || ''; }
    else if (d.etapa === 'limpar') { m.cobranca = ''; m.mensagem_em = ''; m.acao_processo_id = ''; }
    else throw falha_('Etapa inválida.');
    atualizarLinha_(r.tab, r.p, m);
    registrar_(u.usuario, 'cobrança: ' + d.etapa, d.id);
    return { ok: true };
  });
}

/** Alvará/depósito em processo com êxito: calcula honorários e repasse ao cliente e lança como parcela paga. */
function salvarRecebimento_(d, u) {
  return comTrava_(function () {
    var h = tabela_('Honorarios').linhas.filter(function (r) { return r.id === d.honorario_id; })[0];
    if (!h) throw falha_('Honorário não encontrado.');
    var bruto = dinheiro_(d.valor_bruto);
    if (!(bruto > 0)) throw falha_('Informe o valor recebido no processo.');
    var pct = dinheiro_(d.percentual || h.percentual);
    if (!(pct > 0 && pct <= 100)) throw falha_('Percentual inválido.');
    var data = d.data || hojeSP_();
    var hon = Math.round(bruto * pct) / 100;
    var rec = { id: novoId_('R'), honorario_id: h.id, processo_id: h.processo_id, data: data, valor_bruto: txtDinheiro_(bruto),
      percentual: String(pct), honorarios: txtDinheiro_(hon), repasse_cliente: txtDinheiro_(bruto - hon), repassado_em: '',
      observacoes: String(d.observacoes || ''), criado_em: new Date().toISOString(), criado_por: u.usuario };
    inserirLinha_(tabela_('Recebimentos'), rec);
    var parc = tabela_('Parcelas');
    var n = parc.linhas.filter(function (p) { return p.honorario_id === h.id; }).length + 1;
    var p = novaParcela_(h, n, data, hon, u.usuario);
    p.pago_em = data; p.valor_pago = txtDinheiro_(hon); p.forma = 'alvará'; p.observacoes = 'Êxito ' + pct + '% sobre R$ ' + txtDinheiro_(bruto);
    inserirLinha_(parc, p);
    registrar_(u.usuario, 'alvará lançado', h.id + ' bruto ' + txtDinheiro_(bruto));
    return rec;
  });
}

/* ---------- Importação da planilha "Honorários Araújo — levantamento e conciliação" ---------- */

/**
 * Lê as abas Cobranças e Mensalistas da planilha de levantamento (tirada do GEA) e cria honorários
 * "importado — conferir". Não apaga nada; não importa duas vezes a mesma linha.
 */
function importarHonorariosPlanilha() {
  var arqs = DriveApp.searchFiles("title contains 'Honorários Araújo' and mimeType = 'application/vnd.google-apps.spreadsheet'");
  if (!arqs.hasNext()) { aviso_('Não achei a planilha "Honorários Araújo — levantamento e conciliação" no Drive.'); return; }
  var origem = SpreadsheetApp.openById(arqs.next().getId());
  var r = importarHonorarios_(origem);
  aviso_(r);
  return r;
}

function importarHonorarios_(origem) {
  var jaImportadas = {};
  tabela_('Honorarios').linhas.forEach(function (h) { var m = /\[imp:([^\]]+)\]/.exec(h.observacoes); if (m) jaImportadas[m[1]] = true; });
  var clientesTab = tabela_('Clientes');
  var porNome = {};
  clientesTab.linhas.forEach(function (c) { porNome[normalizar_(c.nome)] = c; });
  var honTab = tabela_('Honorarios'), parcTab = tabela_('Parcelas');
  var agora = new Date().toISOString();
  var cont = { honorarios: 0, parcelas: 0, clientesNovos: 0 };
  [['Cobranças', 'parcelado'], ['Mensalistas', 'mensal'], ['Parcelas GEA', 'parcelado']].forEach(function (cfg) {
    var sh = origem.getSheetByName(cfg[0]);
    if (!sh) return;
    var vals = sh.getDataRange().getDisplayValues();
    var ih = -1, col = {};
    for (var i = 0; i < Math.min(vals.length, 15); i++) {
      var linha = vals[i].map(function (v) { return normalizar_(v); });
      if (linha.filter(String).length >= 3 && linha.some(function (v) { return /^(cliente|nome|referencia|devedor)/.test(v); })) { ih = i; break; }
    }
    if (ih < 0) return;
    vals[ih].forEach(function (v, j) {
      var n = normalizar_(v);
      if (col.cliente === undefined && /^(cliente|nome|referencia|devedor)/.test(n)) col.cliente = j;
      else if (col.venc === undefined && /venc/.test(n)) col.venc = j;
      else if (col.valor === undefined && /(valor|saldo|mensal)/.test(n)) col.valor = j;
      else if (col.sit === undefined && /(situa|status)/.test(n)) col.sit = j;
      else if (col.proc === undefined && /processo/.test(n)) col.proc = j;
    });
    if (col.cliente === undefined) return;
    for (var k = ih + 1; k < vals.length; k++) {
      var row = vals[k];
      var nome = String(row[col.cliente] || '').trim();
      if (!nome || /^(total|araujo advocacia)/i.test(normalizar_(nome))) continue;
      var chave = cfg[0] + ':' + k;
      if (jaImportadas[chave]) continue;
      var cli = porNome[normalizar_(nome)];
      if (!cli) {
        cli = { id: novoId_('C'), tipo: 'PF', nome: nome, origem: 'planilha de honorários', situacao: 'importado — conferir',
          criado_em: agora, atualizado_em: agora, atualizado_por: 'importacao' };
        inserirLinha_(clientesTab, cli); porNome[normalizar_(nome)] = cli; cont.clientesNovos++;
      }
      var valor = col.valor !== undefined ? dinheiro_(row[col.valor]) : 0;
      var venc = col.venc !== undefined ? dataPlanilha_(row[col.venc]) : '';
      var h = { id: novoId_('H'), cliente_id: cli.id, processo_id: '', tipo: cfg[1], descricao: 'Importado de ' + cfg[0],
        valor_total: cfg[1] === 'parcelado' && valor ? txtDinheiro_(valor) : '', percentual: '',
        valor_mensal: cfg[1] === 'mensal' && valor ? txtDinheiro_(valor) : '', dia_vencimento: venc ? String(+venc.slice(8)) : '',
        inicio: '', situacao: 'importado — conferir',
        observacoes: row.filter(String).join(' | ').slice(0, 1500) + ' [imp:' + chave + ']',
        origem: 'planilha Honorários Araújo', criado_em: agora, atualizado_em: agora, atualizado_por: 'importacao' };
      inserirLinha_(honTab, h); cont.honorarios++;
      if (valor && cfg[1] === 'parcelado') {
        var p = novaParcela_(h, 1, venc || hojeSP_(), valor, 'importacao');
        var sit = col.sit !== undefined ? normalizar_(row[col.sit]) : '';
        if (/pago|quitad|recebid/.test(sit) && !/parcial|nao/.test(sit)) { p.pago_em = venc || hojeSP_(); p.valor_pago = txtDinheiro_(valor); }
        p.observacoes = 'Importado: conferir valor e vencimento.';
        inserirLinha_(parcTab, p); cont.parcelas++;
      }
    }
  });
  registrar_('sistema', 'importação de honorários', JSON.stringify(cont));
  return 'Importados ' + cont.honorarios + ' honorários e ' + cont.parcelas + ' parcelas' +
    (cont.clientesNovos ? '; ' + cont.clientesNovos + ' clientes novos criados para conferir' : '') +
    '. Tudo fica como "importado — conferir" no Financeiro.';
}

function dataPlanilha_(v) {
  v = String(v || '').trim();
  var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? m[0] : '';
}

/* ================================================================== */
/* ETAPA 4 — Audiências e perícias, relatórios, documentos e modelos   */
/* ================================================================== */

/**
 * Procura audiência ou perícia marcada no texto da intimação (DJEN, eproc ou PJe).
 * Se achar data, marca na agenda certa e cria um prazo-lembrete com a data do ato.
 */
function detectarAudienciaPericia_(ctx, d, proc, intim) {
  var texto = [d.movimento, d.texto].join(' ');
  var t = normalizar_(texto);
  var ehPericia = /per[ií]cia|pericial|perito/.test(t) && /(designad|marcad|agendad|realizar|comparecer|data)/.test(t);
  var ehAudiencia = /audiencia/.test(t) && /(designad|redesignad|marcad|agendad|pauta|comparecer|para o dia|realizar)/.test(t);
  if (!ehPericia && !ehAudiencia) return false;
  if (/cancelad|retirad[ao] de pauta|realizada|nao realizada|adiada sem/.test(t) && !/redesignad/.test(t)) return false;
  var palavra = ehPericia ? /per[ií]cia|perito/i : /audi[eê]ncia/i;
  var pos = texto.search(palavra);
  var trecho = texto.slice(Math.max(0, pos), pos + 400);
  var m = /(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]{1,25}(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?/.exec(trecho);
  if (!m) return false;
  var data = m[3] + '-' + m[2] + '-' + m[1];
  var hora = m[4] ? ('0' + m[4]).slice(-2) + ':' + (m[5] || '00') : '';
  if (data < hojeSP_()) return false;
  var tipo = ehPericia ? 'perícia' : /instru/.test(t) ? 'audiência de instrução' : /inicial|una/.test(t) ? 'audiência inicial' : 'audiência de conciliação';
  var agenda = ehPericia ? 'PERÍCIAS' : /instru/.test(t) ? 'AUDIÊNCIA INSTRUÇÃO' : 'AUDIÊNCIA CONCILIAÇÃO';
  var chave = 'ato|' + d.numero + '|' + tipo + '|' + data + '|' + hora;
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  if (ctx.eventos.linhas.some(function (e) { return e.chave === chave; })) return false;
  var cliente = proc.cliente_id ? ((ctx.clientes.linhas.filter(function (c) { return c.id === proc.cliente_id; })[0] || {}).nome) : (proc.cliente_nome || '');
  var titulo = (tipo.charAt(0).toUpperCase() + tipo.slice(1)) + (cliente ? ' — ' + cliente : '') + ' — ' + d.numero;
  var evId = '';
  try {
    var ids = agendas_();
    var cal = ids[agenda] && CalendarApp.getCalendarById(ids[agenda]);
    if (cal) {
      var ev = hora
        ? cal.createEvent(titulo, new Date(data + 'T' + hora + ':00-03:00'), new Date(new Date(data + 'T' + hora + ':00-03:00').getTime() + 60 * 60000), { description: 'Marcado pelo robô a partir de: ' + d.fonte + '. ' + String(d.movimento || '').slice(0, 300) })
        : cal.createAllDayEvent(titulo + ' (conferir horário)', new Date(data + 'T12:00:00-03:00'), { description: 'Horário não encontrado na intimação. Fonte: ' + d.fonte });
      evId = ev.getId();
    }
  } catch (e) { evId = 'erro: ' + (e.message || e); }
  var agora = new Date().toISOString();
  var prazo = {
    id: novoId_('Z'), processo_id: proc.id, numero: d.numero, intimacao_id: intim.id,
    descricao: (ehPericia ? 'Perícia' : 'Audiência') + ' em ' + dataBR_(data) + (hora ? ' às ' + hora : '') + ': ' +
      (ehPericia ? 'avisar o cliente e preparar quesitos/documentos' : 'preparar audiência, cliente e testemunhas'),
    dias: '', contagem: 'corridos', ciencia: d.ciencia || '', ciencia_tipo: 'data do ato marcada pelo juízo', fatal: data,
    situacao: 'calculado', conferido_por: '', conferido_em: '', origem: 'robô', observacoes: 'ato:' + tipo + ' | ' + d.fonte,
    criado_em: agora, atualizado_em: agora, atualizado_por: 'robô', cumprido_por: '', cumprido_em: ''
  };
  inserirLinha_(ctx.prazos, prazo);
  inserirLinha_(ctx.eventos, { chave: chave, tipo: tipo, numero: d.numero, data: data, hora: hora, agenda: agenda,
    evento_id: evId, prazo_id: prazo.id, criado_em: agora });
  if (!proc.proximo_ato_data || proc.proximo_ato_data < hojeSP_() || data < proc.proximo_ato_data) {
    atualizarLinha_(ctx.procs, proc, { proximo_ato: tipo.charAt(0).toUpperCase() + tipo.slice(1) + (hora ? ' ' + hora : ''), proximo_ato_data: data });
  }
  return true;
}

/* ---------- Relatório de prazos cumpridos (aba Usuários) ---------- */

function relatorioCumpridos_(d) {
  var dias = Math.min(parseInt(d.dias, 10) || 30, 365);
  var desde = somarDias_(hojeSP_(), -dias);
  var procs = {}, nomes = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  var lista = tabela_('Prazos').linhas
    .filter(function (z) { return z.situacao === 'cumprido' && (z.cumprido_em || z.atualizado_em || '').slice(0, 10) >= desde; })
    .map(function (z) {
      var p = procs[z.processo_id] || {};
      return { id: z.id, numero: z.numero, descricao: z.descricao, fatal: z.fatal, cliente: nomes[p.cliente_id] || p.cliente_nome || '',
        quem: z.cumprido_por || z.atualizado_por || '', quando: z.cumprido_em || z.atualizado_em || '',
        noPrazo: !z.fatal || (z.cumprido_em || z.atualizado_em || '').slice(0, 10) <= z.fatal };
    })
    .sort(function (a, b) { return a.quando < b.quando ? 1 : -1; });
  var porPessoa = {};
  lista.forEach(function (x) { var r = porPessoa[x.quem] = porPessoa[x.quem] || { quem: x.quem, total: 0, noPrazo: 0 }; r.total++; if (x.noPrazo) r.noPrazo++; });
  return { dias: dias, lista: lista, porPessoa: Object.keys(porPessoa).map(function (k) { return porPessoa[k]; }) };
}

/* ---------- Documentos na pasta do cliente ---------- */

function documentosCliente_(d) {
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  if (!c.pasta_id) return { pasta_url: '', procuracao: [], contrato: [], outros: 0 };
  var pasta = DriveApp.getFolderById(c.pasta_id);
  var proc = [], cont = [], outros = 0;
  var it = pasta.getFiles();
  var n = 0;
  while (it.hasNext() && n < 300) {
    var f = it.next(); n++;
    var nome = normalizar_(f.getName());
    var item = { nome: f.getName(), url: f.getUrl(), data: f.getLastUpdated().toISOString() };
    if (/procura/.test(nome)) proc.push(item);
    else if (/contrato|honorar/.test(nome)) cont.push(item);
    else outros++;
  }
  return { pasta_url: c.pasta_url, procuracao: proc, contrato: cont, outros: outros };
}

/* ---------- Modelos de procuração e contrato ---------- */

var MODELOS = {
  procuracao: { nome: 'Procuração ad judicia et extra', config: 'MODELO_PROCURACAO_ID' },
  contrato: { nome: 'Contrato de honorários advocatícios', config: 'MODELO_CONTRATO_ID' }
};

var TEXTO_MODELOS = {
  procuracao: [
    ['t', 'PROCURAÇÃO AD JUDICIA ET EXTRA'],
    ['p', 'OUTORGANTE: {{qualificacao}}.'],
    ['p', 'OUTORGADA: JÚLIAN MARCELINO ARAÚJO, advogada inscrita na OAB/SC sob o nº 54.832, integrante da Araújo Sociedade Individual de Advocacia, com escritório na Rua Silvino Moreira Lima Sobrinho, nº 888, Sala 04, Humaitá, Tubarão/SC, CEP 88704-225, e-mail advogadajulianaraujo@gmail.com, telefone (48) 3626-2556.'],
    ['p', 'PODERES: pelo presente instrumento, o(a) OUTORGANTE nomeia e constitui sua bastante procuradora a OUTORGADA, a quem confere amplos poderes para o foro em geral, com a cláusula ad judicia et extra, em qualquer juízo, instância ou tribunal, podendo propor contra quem de direito as ações competentes e defendê-lo(a) nas contrárias, seguindo umas e outras até final decisão, usando dos recursos legais e acompanhando-os, conferindo-lhe ainda poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, receber, dar quitação, firmar compromisso, levantar alvarás e valores, requerer a gratuidade da justiça e assinar declaração de hipossuficiência econômica, representá-lo(a) perante repartições públicas federais, estaduais e municipais, autarquias, INSS e instituições financeiras, podendo ainda substabelecer esta a outrem, com ou sem reserva de iguais poderes (art. 105 do Código de Processo Civil).'],
    ['p', 'FINALIDADE ESPECÍFICA: {{objeto}}.'],
    ['p', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  contrato: [
    ['t', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS'],
    ['p', 'CONTRATANTE: {{qualificacao}}.'],
    ['p', 'CONTRATADA: ARAÚJO SOCIEDADE INDIVIDUAL DE ADVOCACIA, neste ato representada por JÚLIAN MARCELINO ARAÚJO, advogada inscrita na OAB/SC sob o nº 54.832, com escritório na Rua Silvino Moreira Lima Sobrinho, nº 888, Sala 04, Humaitá, Tubarão/SC, CEP 88704-225.'],
    ['p', 'As partes acima identificadas têm entre si justo e contratado o presente contrato de prestação de serviços advocatícios, que se regerá pelas cláusulas seguintes e pelo Estatuto da Advocacia (Lei nº 8.906/1994) e pelo Código de Ética e Disciplina da OAB.'],
    ['h', 'CLÁUSULA 1ª – DO OBJETO'],
    ['p', 'A CONTRATADA prestará ao(à) CONTRATANTE serviços advocatícios consistentes em: {{objeto}}.'],
    ['h', 'CLÁUSULA 2ª – DOS HONORÁRIOS'],
    ['p', '{{clausula_honorarios}}'],
    ['p', 'Os honorários de sucumbência eventualmente fixados pertencem exclusivamente à CONTRATADA (art. 23 da Lei nº 8.906/1994), sem prejuízo dos honorários aqui contratados.'],
    ['h', 'CLÁUSULA 3ª – DAS DESPESAS'],
    ['p', 'Custas processuais, emolumentos, perícias, diligências, cópias, deslocamentos e demais despesas necessárias ao andamento do serviço correm por conta do(a) CONTRATANTE, mediante prévia comunicação.'],
    ['h', 'CLÁUSULA 4ª – DO ATRASO'],
    ['p', 'O atraso no pagamento de qualquer parcela sujeitará o(a) CONTRATANTE a multa de 2% (dois por cento), juros de 1% (um por cento) ao mês e correção monetária, podendo a CONTRATADA promover a cobrança judicial dos valores devidos, servindo este instrumento como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994).'],
    ['h', 'CLÁUSULA 5ª – DA RESCISÃO'],
    ['p', 'A revogação do mandato ou a desistência pelo(a) CONTRATANTE não o(a) desobriga do pagamento dos honorários vencidos e dos proporcionais ao trabalho já realizado, nem dos honorários de êxito caso o proveito econômico venha a ser obtido em razão dos atos praticados pela CONTRATADA.'],
    ['h', 'CLÁUSULA 6ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de Tubarão/SC para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estarem justas e contratadas, as partes assinam o presente em duas vias de igual teor, na presença de duas testemunhas.'],
    ['p', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}} — CONTRATANTE'],
    ['a', 'ARAÚJO SOCIEDADE INDIVIDUAL DE ADVOCACIA — CONTRATADA'],
    ['p', 'Testemunhas:'],
    ['a', 'Nome: ______________________  CPF: ______________'],
    ['a', 'Nome: ______________________  CPF: ______________']
  ]
};

function pastaModelos_() {
  var id = config_('PASTA_MODELOS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  var pai = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  var base = pai.hasNext() ? pai.next() : DriveApp.getRootFolder();
  var pasta = base.createFolder('MODELOS (editáveis)');
  setConfig_('PASTA_MODELOS_ID', pasta.getId(), 'Pasta dos modelos de documentos');
  return pasta;
}

/** Garante que os modelos existam no Google Docs (cria a versão-base na primeira vez). */
function modeloId_(chave) {
  var cfg = MODELOS[chave];
  var id = config_(cfg.config);
  if (id) { try { DriveApp.getFileById(id); return id; } catch (e) { /* recria */ } }
  var doc = DocumentApp.create('MODELO — ' + cfg.nome);
  var corpo = doc.getBody();
  corpo.clear();
  TEXTO_MODELOS[chave].forEach(function (l) {
    if (l[0] === 'a') {
      corpo.appendParagraph('');
      corpo.appendParagraph('_____________________________________________').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      corpo.appendParagraph(l[1]).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      return;
    }
    var par = corpo.appendParagraph(l[1]);
    if (l[0] === 't') par.setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    else if (l[0] === 'h') par.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    else par.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
  });
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(pastaModelos_());
  setConfig_(cfg.config, doc.getId(), 'Modelo: ' + cfg.nome);
  return doc.getId();
}

function listarModelos_() {
  return Object.keys(MODELOS).map(function (k) {
    var id = modeloId_(k);
    return { chave: k, nome: MODELOS[k].nome, url: DriveApp.getFileById(id).getUrl() };
  });
}

function qualificacao_(c) {
  var partes = [];
  var end = [c.endereco, c.cidade && c.uf ? c.cidade + '/' + c.uf : c.cidade, c.cep ? 'CEP ' + c.cep : ''].filter(String).join(', ');
  if (c.tipo === 'PJ') {
    partes.push(String(c.nome).toUpperCase() + ', pessoa jurídica de direito privado');
    if (c.cpf_cnpj) partes.push('inscrita no CNPJ sob o nº ' + c.cpf_cnpj);
    if (end) partes.push('com sede em ' + end);
    if (c.representante) partes.push('neste ato representada por ' + c.representante);
  } else {
    partes.push(String(c.nome).toUpperCase());
    partes.push('brasileiro(a)');
    if (c.estado_civil) partes.push(c.estado_civil);
    if (c.profissao) partes.push(c.profissao);
    if (c.rg) partes.push('portador(a) do RG nº ' + c.rg);
    if (c.cpf_cnpj) partes.push('inscrito(a) no CPF sob o nº ' + c.cpf_cnpj);
    if (end) partes.push('residente e domiciliado(a) em ' + end);
  }
  if (c.telefone) partes.push('telefone ' + c.telefone);
  if (c.email) partes.push('e-mail ' + c.email);
  return partes.join(', ');
}

function porExtensoData_(iso) {
  var meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return (+iso.slice(8, 10)) + ' de ' + meses[+iso.slice(5, 7) - 1] + ' de ' + iso.slice(0, 4);
}

function reaisTxt_(v) {
  var n = dinheiro_(v);
  var s = n.toFixed(2).split('.');
  return 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
}

function clausulaHonorarios_(h, parcelas) {
  if (!h) return 'Pelos serviços contratados, o(a) CONTRATANTE pagará à CONTRATADA honorários de __________________, na forma e nos vencimentos a seguir: __________________.';
  if (h.tipo === 'exito') {
    return 'Pelos serviços contratados, o(a) CONTRATANTE pagará à CONTRATADA honorários de êxito correspondentes a ' + h.percentual +
      '% (por cento) sobre todo o proveito econômico obtido, inclusive valores recebidos em acordo, alvará ou depósito judicial, devidos no momento do recebimento, ficando a CONTRATADA autorizada a reter o seu percentual quando o valor transitar por sua conta.';
  }
  if (h.tipo === 'mensal') {
    return 'Pelos serviços contratados, o(a) CONTRATANTE pagará à CONTRATADA honorários mensais de ' + reaisTxt_(h.valor_mensal) +
      ', com vencimento todo dia ' + (h.dia_vencimento || '__') + ' de cada mês' + (h.inicio ? ', a partir de ' + dataBR_(h.inicio) : '') + '.';
  }
  var ps = (parcelas || []).slice().sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var txt = 'Pelos serviços contratados, o(a) CONTRATANTE pagará à CONTRATADA honorários no valor total de ' + reaisTxt_(h.valor_total);
  if (ps.length > 1) txt += ', em ' + ps.length + ' parcelas, com vencimentos em ' + ps.map(function (p) { return dataBR_(p.vencimento) + ' (' + reaisTxt_(p.valor) + ')'; }).join(', ');
  else if (ps.length === 1) txt += ', com vencimento em ' + dataBR_(ps[0].vencimento);
  return txt + '.';
}

/**
 * Gera procuração e/ou contrato a partir dos modelos, na pasta do cliente, em Google Docs e PDF.
 * Contrato só para quem vê o financeiro (traz valores de honorários).
 */
function gerarDocumentos_(d, u) {
  var quais = (d.modelos || []).filter(function (k) { return MODELOS[k]; });
  if (!quais.length) throw falha_('Escolha procuração e/ou contrato.');
  if (quais.indexOf('contrato') >= 0 && !PERFIS[u.perfil].financeiro) throw falha_('Só a administração gera contrato de honorários.');
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.cliente_id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  if (!c.pasta_id) { criarPastaCliente_({ id: c.id }, u); c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.cliente_id; })[0]; }
  var faltando = [];
  if (!c.cpf_cnpj) faltando.push('CPF/CNPJ');
  if (!c.endereco) faltando.push('endereço');
  if (c.tipo !== 'PJ' && !c.rg) faltando.push('RG');
  var h = null, parcelas = [];
  if (quais.indexOf('contrato') >= 0) {
    var hons = tabela_('Honorarios').linhas.filter(function (x) { return x.cliente_id === c.id; });
    h = hons.filter(function (x) { return x.id === d.honorario_id; })[0] || hons.filter(function (x) { return x.situacao === 'ativo'; }).pop() || null;
    if (h) parcelas = tabela_('Parcelas').linhas.filter(function (p) { return p.honorario_id === h.id; });
    if (!h) faltando.push('honorário cadastrado (a cláusula sai em branco)');
  }
  var objeto = String(d.objeto || '').trim() || c.tipo_acao || (h && h.descricao) || 'atuação em favor do(a) outorgante/contratante em ' + (c.area || 'matéria a definir');
  var hoje = hojeSP_();
  var valores = {
    '{{qualificacao}}': qualificacao_(c), '{{nome}}': String(c.nome).toUpperCase(), '{{objeto}}': objeto,
    '{{clausula_honorarios}}': clausulaHonorarios_(h, parcelas), '{{cidade_assinatura}}': 'Tubarão/SC', '{{data_extenso}}': porExtensoData_(hoje),
    '{{cpf_cnpj}}': c.cpf_cnpj || '', '{{rg}}': c.rg || '', '{{endereco}}': c.endereco || '', '{{cidade}}': c.cidade || '', '{{uf}}': c.uf || '',
    '{{cep}}': c.cep || '', '{{telefone}}': c.telefone || '', '{{email}}': c.email || '', '{{estado_civil}}': c.estado_civil || '',
    '{{profissao}}': c.profissao || '', '{{representante}}': c.representante || ''
  };
  var pasta = DriveApp.getFolderById(c.pasta_id);
  var gerados = [];
  quais.forEach(function (k) {
    var nomeArq = (k === 'procuracao' ? 'PROCURAÇÃO' : 'CONTRATO DE HONORÁRIOS') + ' — ' + nomePasta_(c.nome) + ' — ' + dataBR_(hoje).replace(/\//g, '-');
    var copia = DriveApp.getFileById(modeloId_(k)).makeCopy(nomeArq, pasta);
    var doc = DocumentApp.openById(copia.getId());
    var corpo = doc.getBody();
    Object.keys(valores).forEach(function (chave) {
      corpo.replaceText(chave.replace(/[{}]/g, '\\$&'), String(valores[chave]).replace(/\$/g, '\\$'));
    });
    doc.saveAndClose();
    var pdf = pasta.createFile(copia.getAs('application/pdf')).setName(nomeArq + '.pdf');
    gerados.push({ modelo: MODELOS[k].nome, doc: copia.getUrl(), pdf: pdf.getUrl() });
  });
  registrar_(u.usuario, 'documentos gerados', c.id + ' ' + quais.join(','));
  return { gerados: gerados, pasta_url: c.pasta_url, faltando: faltando };
}

/* ================================================================== */
/* IMPORTAÇÃO DO GEA — planilhas "GEA — clientes" e "GEA — financeiro" */
/* ================================================================== */

var ESTADOS_CIVIS_GEA = { 'casado': 'casado(a)', 'solteiro': 'solteiro(a)', 'uniao est': 'união estável', 'uniao estavel': 'união estável',
  'divorciado': 'divorciado(a)', 'separado': 'separado(a)', 'viuvo': 'viúvo(a)' };

/** Menu/editor: importa clientes e honorários exportados do GEA. Pode rodar de novo sem duplicar. */
function importarGEA() {
  var r = importarGEASeguro_(true);
  aviso_(r);
  return r;
}

/**
 * Importa o GEA e grava o resultado (ou o erro) na aba Config.
 * Roda sozinha no "configurar" e no robô enquanto GEA_IMPORTADO estiver vazio.
 */
function importarGEASeguro_(forcar) {
  if (!forcar && config_('GEA_IMPORTADO')) return '';
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return 'Outra tarefa está rodando; a importação do GEA fica para a próxima vez.';
  try {
    var pai = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents().next();
    var achar = function (nome) { var it = pai.getFilesByName(nome); return it.hasNext() ? SpreadsheetApp.openById(it.next().getId()) : null; };
    var cli = achar('GEA — clientes'), fin = achar('GEA — financeiro');
    if (!cli && !fin) throw new Error('Não achei as planilhas "GEA — clientes" e "GEA — financeiro" na pasta do painel.');
    var linhas = function (ss) { return ss ? ss.getSheets()[0].getDataRange().getDisplayValues() : []; };
    var r = importarGEADados_(linhas(cli), linhas(fin));
    setConfig_('GEA_IMPORTADO', new Date().toISOString() + ' — ' + r, 'Resultado da importação do GEA (apague para importar de novo)');
    setConfig_('GEA_ERRO', '', 'Último erro da importação do GEA');
    return r;
  } catch (e) {
    var msg = 'Erro na importação do GEA: ' + (e && e.message) + (e && e.stack ? ' | ' + String(e.stack).slice(0, 800) : '');
    try { setConfig_('GEA_ERRO', new Date().toISOString() + ' — ' + msg, 'Último erro da importação do GEA'); registrar_('sistema', 'erro importação GEA', msg.slice(0, 1000)); } catch (e2) { /* sem planilha */ }
    return msg;
  } finally {
    trava.releaseLock();
  }
}

/** Clientes vindos do GEA com o nome todo em MAIÚSCULAS passam para "Maria da Silva". */
function corrigirNomesMaiusculos_() {
  var tab = tabela_('Clientes');
  tab.adiar = true;
  tab.linhas.forEach(function (c) {
    if (!/^GEA/.test(c.origem || '')) return;
    var novo = nomeProprio_(c.nome);
    if (novo !== c.nome) atualizarLinha_(tab, c, { nome: novo });
  });
  return regravarMudadas_(tab);
}

/** "MARIA DA SILVA LTDA" → "Maria da Silva LTDA". */
var SIGLAS_NOME = { ltda: 'LTDA', me: 'ME', epp: 'EPP', eireli: 'EIRELI', 'sa': 'SA', 's/a': 'S/A', 'mei': 'MEI', 'cia': 'Cia' };
var MINUSCULAS_NOME = { da: 1, de: 1, do: 1, das: 1, dos: 1, e: 1, di: 1, du: 1 };
function nomeProprio_(nome) {
  var t = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!t || t !== t.toUpperCase()) return t; // já veio com maiúsculas e minúsculas
  return t.toLowerCase().split(' ').map(function (w, i) {
    if (SIGLAS_NOME[w]) return SIGLAS_NOME[w];
    if (i > 0 && MINUSCULAS_NOME[w]) return w;
    return w.replace(/(^|[-'])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }).join(' ');
}

function cabecalhoIdx_(cab, padroes) {
  var idx = {};
  cab.forEach(function (c, j) {
    var n = normalizar_(c);
    Object.keys(padroes).forEach(function (k) { if (idx[k] === undefined && padroes[k].test(n)) idx[k] = j; });
  });
  return idx;
}

/** "Rua X, 10 – Bairro – Cidade/UF – CEP 88700000" → partes do endereço. */
function partirEndereco_(txt) {
  var partes = String(txt || '').replace(/\.\.\.$/, '').split(/\s+[–-]\s+/).map(function (s) { return s.trim(); }).filter(String);
  var r = { endereco: '', cidade: '', uf: '', cep: '' };
  var resto = [];
  partes.forEach(function (p) {
    var mc = /CEP\s*([\d.\-]{5,10})/i.exec(p);
    if (mc) { var d = mc[1].replace(/\D/g, ''); r.cep = d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : mc[1]; return; }
    var mu = /^(.+?)\s*\/\s*([A-Z]{2})$/.exec(p);
    if (mu) { r.cidade = mu[1]; r.uf = mu[2]; return; }
    if (/^[A-Z]{2}$/.test(p)) { r.uf = p; return; }
    resto.push(p);
  });
  r.endereco = resto.join(', ');
  return r;
}

function dataBRparaISO_(v) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
  if (!m || +m[3] < 1900 || +m[3] > 2100 || +m[2] > 12 || +m[1] > 31) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}

function importarGEADados_(rowsCli, rowsFin) {
  var agora = new Date().toISOString();
  var hoje = hojeSP_();
  var tabC = tabela_('Clientes'), tabP = tabela_('Processos'), tabH = tabela_('Honorarios'), tabQ = tabela_('Parcelas');
  var porNome = {}, porDoc = {};
  var indexar = function (c) {
    porNome[normalizar_(c.nome)] = c;
    var d = String(c.cpf_cnpj || '').replace(/\D/g, '');
    if (d.length === 11 || d.length === 14) porDoc[d] = c;
  };
  tabC.linhas.forEach(indexar);
  tabC.adiar = true; tabP.adiar = true; tabH.adiar = true; tabQ.adiar = true;
  var cont = { novos: 0, completados: 0, honorarios: 0, parcelas: 0, processosLigados: 0, processosNovos: 0, substituidos: 0 };
  tabC.buffer = [];

  /* ----- clientes ----- */
  if (rowsCli.length > 1) {
    var ic = cabecalhoIdx_(rowsCli[0], { nome: /^nome/, doc: /^cpf|cnpj/, rg: /^rg$/, nasc: /nascimento/, ec: /estado civil/,
      prof: /profiss/, end: /endereco/, tel: /telefone/, email: /e-?mail/, obs: /observa/ });
    for (var i = 1; i < rowsCli.length; i++) {
      var row = rowsCli[i];
      var nome = nomeProprio_(row[ic.nome]);
      if (!nome) continue;
      var doc = String(row[ic.doc] || '').trim();
      var dig = doc.replace(/\D/g, '');
      var end = partirEndereco_(row[ic.end]);
      var ecTxt = normalizar_(row[ic.ec]).replace(/\.$/, '');
      var dados = {
        tipo: dig.length === 14 ? 'PJ' : 'PF', cpf_cnpj: doc, rg: String(row[ic.rg] || '').trim(),
        nascimento: dataBRparaISO_(row[ic.nasc]), estado_civil: ESTADOS_CIVIS_GEA[ecTxt] || '',
        profissao: String(row[ic.prof] || '').trim().toLowerCase(), endereco: end.endereco, cidade: end.cidade, uf: end.uf, cep: end.cep,
        telefone: String(row[ic.tel] || '').trim(), email: String(row[ic.email] || '').trim().toLowerCase()
      };
      if (dados.tipo === 'PJ') dados.estado_civil = '';
      var obsGea = String(row[ic.obs] || '').trim();
      var existente = (dig && porDoc[dig]) || porNome[normalizar_(nome)];
      if (existente) {
        var m = {};
        Object.keys(dados).forEach(function (k) { if (dados[k] && !existente[k]) m[k] = dados[k]; });
        if (obsGea && String(existente.observacoes || '').indexOf(obsGea) < 0) m.observacoes = (existente.observacoes ? existente.observacoes + ' | ' : '') + 'GEA: ' + obsGea;
        if (Object.keys(m).length) {
          m.atualizado_em = agora; m.atualizado_por = 'importação GEA';
          atualizarLinha_(tabC, existente, m);
          if (!existente._contado) { cont.completados++; existente._contado = true; }
        }
        indexar(existente);
        continue;
      }
      var novo = { id: novoId_('C'), nome: nome, origem: 'GEA', area: '', situacao: 'importado — conferir',
        observacoes: obsGea ? 'GEA: ' + obsGea : '', criado_em: agora, atualizado_em: agora, atualizado_por: 'importação GEA' };
      Object.keys(dados).forEach(function (k) { novo[k] = dados[k]; });
      inserirLinha_(tabC, novo);
      indexar(novo);
      cont.novos++;
    }
  }
  gravarLote_(tabC);

  /* ----- processos "a identificar" com nome de cliente ----- */
  tabP.linhas.forEach(function (p) {
    if (p.cliente_id || !p.cliente_nome || p.cliente_nome === 'a identificar') return;
    var c = porNome[normalizar_(p.cliente_nome)];
    if (c) { atualizarLinha_(tabP, p, { cliente_id: c.id, cliente_nome: '' }); cont.processosLigados++; }
  });

  /* ----- financeiro ----- */
  if (rowsFin.length > 1) {
    // A importação provisória da planilha de levantamento é substituída pelos dados do GEA.
    var provisorios = tabH.linhas.filter(function (h) { return h.origem === 'planilha Honorários Araújo' && h.situacao === 'importado — conferir'; });
    var idsProv = {};
    provisorios.forEach(function (h) { idsProv[h.id] = true; atualizarLinha_(tabH, h, apagado_(tabH.cab)); cont.substituidos++; });
    tabQ.linhas.forEach(function (q) { if (idsProv[q.honorario_id]) atualizarLinha_(tabQ, q, apagado_(tabQ.cab)); });

    var jaGea = {};
    tabH.linhas.forEach(function (h) { var mm = /\[gea:([^\]]+)\]/.exec(h.observacoes || ''); if (mm) jaGea[mm[1]] = true; });
    var procPorNum = {};
    tabP.linhas.forEach(function (p) { if (p.numero) procPorNum[p.numero] = p; });
    var f = cabecalhoIdx_(rowsFin[0], { cliente: /^cliente/, proc: /^processo/, total: /valor total/, num: /parcela$|^n.? parcela/,
      venc: /vencimento/, valor: /valor da parcela/, sit: /situa/, pag: /pagamento/, tipo: /tipo/, desc: /descri/, obs: /observa/ });
    var grupos = {}, ordem = [];
    for (var k = 1; k < rowsFin.length; k++) {
      var r = rowsFin[k];
      var cn = String(r[f.cliente] || '').trim();
      if (!cn) continue;
      var numProc = (RE_CNJ.exec(String(r[f.proc] || '')) || [])[1] || '';
      var chave = normalizar_(cn) + '|' + numProc + '|' + dinheiro_(r[f.total]) + '|' + normalizar_(r[f.tipo]);
      if (!grupos[chave]) { grupos[chave] = { cliente: cn, numero: numProc, total: dinheiro_(r[f.total]), tipo: String(r[f.tipo] || '').trim(), linhas: [] }; ordem.push(chave); }
      grupos[chave].linhas.push(r);
    }
    tabH.buffer = []; tabQ.buffer = []; tabP.buffer = [];
    ordem.forEach(function (chave) {
      var g = grupos[chave];
      var chaveGea = normalizar_(chave).replace(/[\[\]]/g, '');
      if (jaGea[chaveGea]) return;
      var c = porNome[normalizar_(g.cliente)];
      if (!c) {
        c = { id: novoId_('C'), nome: nomeProprio_(g.cliente), origem: 'GEA (financeiro)', situacao: 'importado — conferir', criado_em: agora, atualizado_em: agora, atualizado_por: 'importação GEA' };
        inserirLinha_(tabC, c); indexar(c); cont.novos++;
      }
      var proc = g.numero ? procPorNum[g.numero] : null;
      if (g.numero && !proc) {
        proc = { id: novoId_('P'), cliente_id: c.id, cliente_nome: '', numero: g.numero, tribunal: tribunalDoNumero_(g.numero), sistema: '', orgao: '',
          area: '', polo: '', parte_contraria: '', proximo_ato: '', proximo_ato_data: '', status: 'ativo', observacoes: 'Criado pela importação do financeiro do GEA.',
          origem: 'GEA', criado_em: agora, atualizado_em: agora, atualizado_por: 'importação GEA' };
        inserirLinha_(tabP, proc); procPorNum[g.numero] = proc; cont.processosNovos++;
      } else if (proc && !proc.cliente_id) {
        atualizarLinha_(tabP, proc, { cliente_id: c.id, cliente_nome: '' }); cont.processosLigados++;
      }
      var obsTxt = [];
      g.linhas.forEach(function (r) { var o = String(r[f.obs] || '').trim(); if (o && obsTxt.indexOf(o) < 0) obsTxt.push(o); });
      var desc = String(g.linhas[0][f.desc] || '').trim();
      var h = { id: novoId_('H'), cliente_id: c.id, processo_id: proc ? proc.id : '', tipo: 'parcelado',
        descricao: /consulta/i.test(g.tipo) ? 'Consulta' : 'Honorários contratuais' + (g.numero ? ' — ' + g.numero : ''),
        valor_total: txtDinheiro_(g.total), percentual: '', valor_mensal: '', dia_vencimento: '', inicio: '', situacao: 'ativo',
        observacoes: ['GEA: ' + desc].concat(obsTxt).join(' | ').slice(0, 1400) + ' [gea:' + chaveGea + ']',
        origem: 'GEA', criado_em: agora, atualizado_em: agora, atualizado_por: 'importação GEA' };
      inserirLinha_(tabH, h); cont.honorarios++;
      g.linhas.forEach(function (r) {
        var venc = dataBRparaISO_(r[f.venc]);
        var p = novaParcela_(h, String(r[f.num] || '').split(/\s+de\s+/i)[0] || '', venc || hoje, dinheiro_(r[f.valor]), 'importação GEA');
        var pago = dataBRparaISO_(r[f.pag]);
        if (pago || /^paga/.test(normalizar_(r[f.sit]))) { p.pago_em = pago || venc; p.valor_pago = p.valor; }
        if (!venc) p.observacoes = 'Vencimento não informado no GEA.';
        inserirLinha_(tabQ, p); cont.parcelas++;
      });
    });
    gravarLote_(tabP); gravarLote_(tabH); gravarLote_(tabQ);
  }
  [tabC, tabP, tabH, tabQ].forEach(regravarMudadas_);

  var pastas = 0;
  try { pastas = vincularPastas_(); } catch (e) { /* pasta 02. CLIENTES não configurada */ }
  registrar_('sistema', 'importação GEA', JSON.stringify(cont) + ' pastas:' + pastas);
  return 'GEA importado: ' + cont.novos + ' clientes novos, ' + cont.completados + ' cadastros completados, ' +
    cont.honorarios + ' honorários com ' + cont.parcelas + ' parcelas, ' + cont.processosLigados + ' processos ligados ao cliente, ' +
    cont.processosNovos + ' processos novos, ' + pastas + ' pastas do Drive ligadas' +
    (cont.substituidos ? ' (' + cont.substituidos + ' honorários provisórios da planilha de levantamento foram substituídos)' : '') + '.';
}

function apagado_(cab) {
  var o = {};
  cab.forEach(function (k) { o[k] = ''; });
  return o;
}
