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

var VERSAO = '7.3.0';

var PERFIS = {
  administrador: { nome: 'Administrador', financeiro: true, usuarios: true, conferePrazos: true },
  advogada: { nome: 'Advogada', financeiro: false, usuarios: false, conferePrazos: true },
  secretario: { nome: 'Secretário', financeiro: false, usuarios: false, conferePrazos: false },
  estagiario: { nome: 'Estagiário', financeiro: false, usuarios: false, conferePrazos: false },
  // RH: vê tudo, menos Usuários; entra no Financeiro, mas os valores chegam apagados (o servidor nem envia)
  rh: { nome: 'RH', financeiro: true, usuarios: false, conferePrazos: false, ocultarValores: true }
};

/* Campos de dinheiro que o perfil RH não recebe. */
var CAMPOS_VALOR = /^(valor|valor_[a-z_]+|total|totais_valor|recebido|saldo|atrasado|honorarios|repasse_cliente|valor_bruto|aReceber30|recebidoMes|entradas|saidas|saldo_previsto|mesEntradas|mesSaidas|proximos30|pago|percentual)$/;
function semValores_(x) {
  if (Array.isArray(x)) return x.map(semValores_);
  if (x && typeof x === 'object') {
    var o = {};
    Object.keys(x).forEach(function (k) {
      if (CAMPOS_VALOR.test(k) && (typeof x[k] === 'number' || typeof x[k] === 'string' || x[k] === null)) o[k] = null;
      else if ((k === 'entradas' || k === 'saidas') && Array.isArray(x[k])) o[k] = x[k].map(function () { return null; });
      else o[k] = semValores_(x[k]);
    });
    return o;
  }
  return x;
}
var ROTAS_VALOR_BLOQUEADAS = { 'fin.honorario.salvar': 1, 'fin.parcela.salvar': 1, 'fin.recebimento.salvar': 1, 'fin.despesa.salvar': 1, 'fin.pixBaixar': 1, 'fin.pixIgnorar': 1, 'fin.pixConfig': 1, 'fin.parcela.pagar': 1 };

// Ordem das colunas de cada aba. Não mude a ordem depois de ter dados.
var ESQUEMA = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'usuario', 'nome', 'perfil', 'hash', 'salt', 'ativo', 'tentativas', 'bloqueado_ate', 'criado_em', 'ultimo_acesso', 'sessao_versao', 'email', 'resumo_email'],
  Clientes: ['id', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
    'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'pasta_id', 'pasta_url',
    'observacoes', 'situacao', 'criado_em', 'atualizado_em', 'atualizado_por', 'tipo_acao', 'resumo_caso', 'providencias', 'genero',
    'acesso_hash', 'acesso_criado_em'],
  Processos: ['id', 'cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
    'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'origem', 'criado_em',
    'atualizado_em', 'atualizado_por', 'ultimo_movimento', 'ultimo_movimento_em', 'classe', 'andamentos', 'datajud_em', 'fase', 'fase_auto', 'responsavel'],
  Intimacoes: ['id', 'chave', 'fonte', 'recebido_em', 'numero', 'tribunal', 'movimento', 'evento', 'texto',
    'partes_cliente', 'processo_id', 'prazo_id', 'criado_em', 'resumo_ia', 'terminada_por', 'terminada_em', 'ok_por', 'ok_em'],
  Prazos: ['id', 'processo_id', 'numero', 'intimacao_id', 'descricao', 'dias', 'contagem', 'ciencia', 'ciencia_tipo',
    'fatal', 'situacao', 'conferido_por', 'conferido_em', 'origem', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por',
    'cumprido_por', 'cumprido_em', 'responsavel', 'etapa', 'resumo_ia', 'ok_por', 'ok_em'],
  Honorarios: ['id', 'cliente_id', 'processo_id', 'tipo', 'descricao', 'valor_total', 'percentual', 'valor_mensal',
    'dia_vencimento', 'inicio', 'situacao', 'observacoes', 'origem', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Parcelas: ['id', 'honorario_id', 'cliente_id', 'numero', 'vencimento', 'valor', 'pago_em', 'valor_pago', 'forma',
    'cobranca', 'mensagem_em', 'acao_processo_id', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Recebimentos: ['id', 'honorario_id', 'processo_id', 'data', 'valor_bruto', 'percentual', 'honorarios', 'repasse_cliente',
    'repassado_em', 'observacoes', 'criado_em', 'criado_por'],
  Eventos: ['chave', 'tipo', 'numero', 'data', 'hora', 'agenda', 'evento_id', 'prazo_id', 'criado_em', 'avisado_em', 'avisado_por'],
  Feriados: ['data', 'descricao', 'abrangencia'],
  Log: ['quando', 'usuario', 'acao', 'detalhe'],
  PastasConferir: ['pasta', 'pasta_url', 'motivo', 'clientes_possiveis'],
  Advogados: ['id', 'nome', 'oab', 'uf', 'tratamento', 'email', 'telefone', 'ativo', 'padrao', 'criado_em'],
  Tarefas: ['id', 'titulo', 'descricao', 'responsavel', 'processo_id', 'numero', 'cliente_id', 'vence_em', 'etapa', 'peso', 'situacao',
    'concluida_por', 'concluida_em', 'historico', 'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por',
    'prioridade', 'checklist', 'repetir', 'ok_por', 'ok_em'],
  Contatos: ['id', 'criado_em', 'nome', 'telefone', 'assunto', 'horario', 'pagina', 'situacao', 'tarefa_id', 'observacoes'],
  Pix: ['id', 'recebido_em', 'valor', 'pagador', 'situacao', 'cliente_id', 'parcela_id', 'motivo', 'criado_em', 'atualizado_em', 'atualizado_por', 'recibo'],
  Despesas: ['id', 'descricao', 'categoria', 'valor', 'vencimento', 'pago_em', 'valor_pago', 'forma', 'cliente_id', 'processo_id',
    'reembolsavel', 'reembolsado_em', 'recorrente', 'serie_id', 'situacao', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por']
};

var TENTATIVAS_MAX = 5;
var BLOQUEIO_MIN = 15;
var SESSAO_SEG = 6 * 60 * 60; // 6 horas sem uso derrubam a sessão (limite do Google)
var SESSAO_MAX_MS = 12 * 60 * 60 * 1000; // e nenhuma sessão passa de 12 horas, mesmo em uso
var LOGIN_FALHAS_GLOBAL = 30; // mais que isso em 15 minutos (qualquer usuário) trava todos os logins por 15 minutos
var PEDIDO_MAX = 200000; // tamanho máximo de um pedido (caracteres)
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
    .addItem('5. Buscar processos antigos e arquivados no Gmail', 'buscarProcessosAntigos')
    .addItem('Fazer cópia de segurança agora', 'backupDiario')
    .addItem('Gerar novo código de primeiro acesso', 'gerarCodigoPrimeiroAcesso')
    .addToUi();
}

/** Cria as abas que faltam, fixa formato de texto e gera o código de primeiro acesso. */
function configurar() {
  var inicioConfig = Date.now();
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
  try { semearAdvogados_(); } catch (e) { /* aba nova */ }
  try { garantirGatilho_(); } catch (e) { /* sem permissão de gatilho ainda */ }
  try { protegerAbas_(); } catch (e) { /* segue */ }
  try { if (!config_('BACKUP_ULTIMO')) backupDiario(); } catch (e) { /* tenta no gatilho */ }
  var gea = importarGEASeguro_(false);
  try { var lig = vincularPastas_(); if (lig) gea = (gea ? gea + '\n' : '') + lig + ' clientes ligados às pastas do Drive (veja a aba PastasConferir).'; } catch (e) { /* pasta 02. CLIENTES não configurada */ }
  try { var areas = classificarAreas_(Math.max(0, 300000 - (Date.now() - inicioConfig))); if (areas) gea = (gea ? gea + '\n' : '') + areas + ' processos ganharam área (conferir).'; } catch (e) { /* sem Gmail */ }
  try { var def = definirPendentes_(); if (def) gea = (gea ? gea + '\n' : '') + def + ' prazos sem data foram definidos (conferir).'; } catch (e) { /* segue */ }
  try {
    var resto = 330000 - (Date.now() - inicioConfig);
    if (resto > 40000) { var hist = importarHistoricoGmail_(resto - 30000); if (hist.novos) gea = (gea ? gea + '\n' : '') + hist.novos + ' processos antigos encontrados no Gmail.'; }
  } catch (e) { /* continua no robô */ }
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
  tab.aba.getRange(tab.buffer[0]._linha, 1, linhas.length, tab.cab.length).setNumberFormat('@').setValues(linhas); marcarMudanca_();
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
  faixa.setNumberFormat('@').setValues(vals); marcarMudanca_();
  return mud.length;
}

function gravarVarias_(nome, objs) {
  if (!objs.length) return;
  var tab = tabela_(nome);
  var linhas = objs.map(function (o) { return tab.cab.map(function (k) { return seguro_(o[k]); }); });
  var r = tab.aba.getLastRow() + 1;
  tab.aba.getRange(r, 1, linhas.length, tab.cab.length).setNumberFormat('@').setValues(linhas); marcarMudanca_();
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
  var bruto = (e && e.postData && e.postData.contents) || '{}';
  if (bruto.length > PEDIDO_MAX) return json_({ ok: false, erro: 'Pedido grande demais.' });
  try {
    req = JSON.parse(bruto);
    if (!req || typeof req !== 'object' || typeof req.acao !== 'string') throw new Error('formato');
  } catch (err) {
    return json_({ ok: false, erro: 'Pedido inválido.' });
  }
  if (req.acao === 'lote') return json_({ ok: true, dados: rotearLote_(req.token, req.dados || {}) });
  try {
    return json_({ ok: true, dados: rotear_(req.acao, req.token, req.dados || {}) });
  } catch (err) {
    var msg = err && err.publico ? err.message : 'Erro interno. Tente de novo.';
    if (!(err && err.publico)) registrar_('?', 'erro', String(err && err.stack || err));
    return json_({ ok: false, erro: msg, sessao: !!(err && err.sessao) });
  }
}

/** Velocidade: até 12 LEITURAS numa ida só ao servidor (o painel junta os pedidos da mesma tela). Gravações nunca vêm em lote. */
function rotearLote_(token, d) {
  var pedidos = (d.pedidos || []).slice(0, 12);
  return pedidos.map(function (pd) {
    try {
      if (!pd || typeof pd.acao !== 'string' || !LEITURAS_RAPIDAS[pd.acao]) throw falha_('Só leituras podem vir em lote.');
      return { ok: true, dados: rotear_(pd.acao, token, pd.dados || {}) };
    } catch (err) {
      return { ok: false, erro: err && err.publico ? err.message : 'Erro interno. Tente de novo.', sessao: !!(err && err.sessao) };
    }
  });
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
  'clientes.whatsapp': { fn: whatsappCliente_ },
  'clientes.acesso': { fn: acessoCliente_ },
  'consulta.processos': { publica: true, fn: consultaCliente_ },
  'site.contato': { publica: true, fn: contatoSite_ },
  'whatsapp.entrada': { fn: function () { var e = pastaEntradaWhats_(); return { url: e.getUrl(), pendentes: config_('WHATSAPP_SEM_CLIENTE') || '' }; } },
  'clientes.criarPasta': { fn: criarPastaCliente_ },
  'clientes.nota': { fn: anotarCliente_ },
  'processos.listar': { fn: listarProcessos_ },
  'processos.salvar': { fn: salvarProcesso_ },
  'prazos.listar': { fn: listarPrazos_ },
  'prazos.salvar': { fn: salvarPrazo_ },
  'prazos.conferir': { permissao: 'conferePrazos', fn: conferirPrazo_ },
  'prazos.situacao': { fn: mudarSituacaoPrazo_ },
  'prazos.baixarVencidos': { permissao: 'usuarios', fn: baixarVencidos_ },
  'intimacoes.listar': { fn: listarIntimacoes_ },
  'robo.rodar': { fn: function (d, u) { return rodarRobo_(u.usuario); } },
  'djen.config': { fn: djenConfig_ },
  'djen.importar': { fn: djenImportar_ },
  'djen.historico': { fn: djenHistorico_ },
  'agenda.listar': { fn: listarAgenda_ },
  'agenda.criar': { fn: criarCompromisso_ },
  'agenda.marcarAto': { fn: marcarAtoPainel_ },
  'intimacoes.terminar': { fn: terminarIntimacao_ },
  'equipe.listar': { fn: listarEquipe_ },
  'trabalho.conferir': { fn: conferirTrabalho_ },
  'trabalho.aguardando': { permissao: 'usuarios', fn: aguardandoOk_ },
  'trabalho.ok': { permissao: 'usuarios', fn: darOk_ },
  'trabalho.devolver': { permissao: 'usuarios', fn: devolverTrabalho_ },
  'ia.resumirIntimacao': { fn: resumirIntimacaoIA_ },
  'robo.consertar': { permissao: 'usuarios', fn: consertarRobo_ },
  'clientes.abrirAcao': { fn: abrirAcaoCliente_ },
  'registro.whatsapp': { fn: registrarWhatsapp_ },
  'relatorio.semana': { permissao: 'usuarios', fn: relatorioSemana_ },
  'relatorio.cumpridos': { permissao: 'usuarios', fn: relatorioCumpridos_ },
  'clientes.documentos': { fn: documentosCliente_ },
  'modelos.listar': { fn: listarModelos_ },
  'advogados.salvar': { permissao: 'usuarios', fn: salvarAdvogado_ },
  'documentos.gerar': { fn: gerarDocumentos_ },
  'feriados.listar': { fn: function () { return tabela_('Feriados').linhas.map(limpar_); } },
  'feriados.salvar': { permissao: 'usuarios', fn: salvarFeriado_ },
  'fin.resumo': { permissao: 'financeiro', fn: resumoFinanceiro_ },
  'fin.areceber': { permissao: 'financeiro', fn: aReceber_ },
  'fin.honorarios': { permissao: 'financeiro', fn: listarHonorarios_ },
  'fin.honorario': { permissao: 'financeiro', fn: obterHonorario_ },
  'fin.honorario.salvar': { permissao: 'financeiro', fn: salvarHonorario_ },
  'fin.parcela.salvar': { permissao: 'financeiro', fn: salvarParcela_ },
  'fin.parcela.pagar': { permissao: 'financeiro', fn: pagarParcela_ },
  'fin.parcela.cobranca': { permissao: 'financeiro', fn: cobrancaParcela_ },
  'fin.recebimento.salvar': { permissao: 'financeiro', fn: salvarRecebimento_ },
  'usuarios.listar': { permissao: 'usuarios', fn: listarUsuarios_ },
  'usuarios.salvar': { permissao: 'usuarios', fn: salvarUsuario_ },
  'senha.trocar': { fn: trocarSenha_ },
  'seguranca': { permissao: 'usuarios', fn: estadoSeguranca_ },
  'tarefas.listar': { fn: listarTarefas_ },
  'tarefas.salvar': { fn: salvarTarefa_ },
  'tarefas.mover': { fn: moverTarefa_ },
  'tarefas.atribuir': { fn: atribuirTarefa_ },
  'tarefas.config': { permissao: 'usuarios', fn: configTarefas_ },
  'tarefas.check': { fn: marcarItemTarefa_ },
  'tarefas.comentar': { fn: comentarTarefa_ },
  'eu.painel': { fn: meuPainel_ },
  'trabalho.assumir': { fn: assumirTrabalho_ },
  'inicio.extras': { fn: inicioExtras_ },
  'agenda.avisado': { fn: marcarAvisado_ },
  'processos.fase': { fn: mudarFaseProcesso_ },
  'revisao.geral': { permissao: 'usuarios', fn: revisaoGeral_ },
  'fin.caixa': { permissao: 'financeiro', fn: caixa_ },
  'fin.pix': { permissao: 'financeiro', fn: listarPix_ },
  'fin.pixBaixar': { permissao: 'financeiro', fn: baixarPix_ },
  'fin.pixIgnorar': { permissao: 'financeiro', fn: ignorarPix_ },
  'fin.pixLer': { permissao: 'financeiro', fn: lerPixAgora_ },
  'fin.pixConfig': { permissao: 'usuarios', fn: configPix_ },
  'fin.despesa.salvar': { permissao: 'financeiro', fn: salvarDespesa_ },
  'fin.despesa.acao': { permissao: 'financeiro', fn: acaoDespesa_ },
  'relatorio.geral': { permissao: 'usuarios', fn: relatorioGeral_ },
  'resumo.email.testar': { fn: testarResumoEmail_ },
  'ia.config': { permissao: 'usuarios', fn: configIA_ },
  'ia.resumirPrazo': { fn: resumirPrazoIA_ },
  'processos.andamentos': { fn: andamentosProcesso_ }
};

var MEMO_LEITURA = null;
var LEITURAS_RAPIDAS = { 'resumo': 1, 'inicio.extras': 1, 'equipe.listar': 1, 'eu.painel': 1, 'trabalho.aguardando': 1, 'fin.pix': 1, 'relatorio.semana': 1, 'clientes.listar': 1, 'clientes.obter': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1,
  'feriados.listar': 1, 'usuarios.listar': 1, 'relatorio.cumpridos': 1, 'agenda.listar': 1, 'fin.honorarios': 1, 'fin.honorario': 1, 'clientes.documentos': 1, 'fin.areceber': 1, 'tarefas.listar': 1, 'relatorio.geral': 1 };

function rotear_(acao, token, dados) {
  var rota = ROTAS[acao];
  if (!rota) throw falha_('Ação desconhecida.');
  if (rota.publica) return rota.fn(dados, null);
  var u = usuarioDaSessao_(token);
  if (rota.permissao && !PERFIS[u.perfil][rota.permissao]) {
    registrar_(u.usuario, 'acesso negado', acao);
    throw falha_('Seu perfil não tem acesso a esta área.');
  }
  var oculta = !!PERFIS[u.perfil].ocultarValores;
  if (oculta && ROTAS_VALOR_BLOQUEADAS[acao]) throw falha_('O perfil RH não altera valores do financeiro.');
  // Rotas só de leitura: cada aba da planilha é lida uma vez só por pedido (mais rápido)
  MEMO_LEITURA = LEITURAS_RAPIDAS[acao] ? {} : null;
  try {
    var res = ROTAS_GUARDADAS[acao] ? comMemoria_(acao, u, dados, function () { return rota.fn(dados, u, token); }) : rota.fn(dados, u, token);
    return oculta && /^(fin\.|relatorio\.|documentos\.gerar|clientes\.documentos)/.test(acao) ? semValores_(res) : res;
  } finally { MEMO_LEITURA = null; }
}

/*
 * Memória do servidor para as listas grandes: a resposta fica guardada por até 10 minutos e é jogada fora
 * na hora em que qualquer coisa é gravada na planilha (pelo painel, pelo robô ou pelo configurar).
 */
var ROTAS_GUARDADAS = { 'eu.painel': 1, 'clientes.listar': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1, 'fin.honorarios': 1, 'tarefas.listar': 1, 'relatorio.geral': 1 };
function versaoDados_() {
  var c = CacheService.getScriptCache(), v = c.get('versao_dados');
  if (!v) { v = String(Date.now()); c.put('versao_dados', v, 21600); }
  return v;
}
function marcarMudanca_() {
  try { CacheService.getScriptCache().put('versao_dados', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); } catch (e) { /* segue sem memória */ }
}
var MEMORIA_POR_PERFIL = { 'clientes.listar': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1, 'relatorio.geral': 1, 'fin.honorarios': 1 };
function comMemoria_(acao, u, dados, fn) {
  var cache = CacheService.getScriptCache();
  var limpo = {};
  Object.keys(dados || {}).sort().forEach(function (k) { var v = dados[k]; if (v !== '' && v !== false && v !== null && v !== undefined) limpo[k] = v; });
  // listas iguais para todos do mesmo perfil ficam guardadas uma vez só (o robô da velocidade já deixa prontas)
  var quem = MEMORIA_POR_PERFIL[acao] ? 'perfil' : u.id;
  var dig = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, acao + '|' + quem + '|' + u.perfil + '|' + JSON.stringify(limpo), Utilities.Charset.UTF_8)).slice(0, 32);
  var k = 'r' + versaoDados_().slice(-10) + dig;
  try {
    var n = cache.get(k + ':n');
    if (n) {
      var partes = [], tudo = cache.getAll(Array.apply(null, Array(+n)).map(function (_, i) { return k + ':' + i; }));
      for (var i = 0; i < +n; i++) { if (tudo[k + ':' + i] === undefined || tudo[k + ':' + i] === null) { partes = null; break; } partes.push(tudo[k + ':' + i]); }
      if (partes) return JSON.parse(partes.join(''));
    }
  } catch (e) { /* lê de novo */ }
  var r = fn();
  try {
    var txt = JSON.stringify(r), TAM = 90000, obj = {}, q = Math.ceil(txt.length / TAM);
    if (q <= 40) {
      for (var j = 0; j < q; j++) obj[k + ':' + j] = txt.slice(j * TAM, (j + 1) * TAM);
      obj[k + ':n'] = String(q);
      cache.putAll(obj, 600);
    }
  } catch (e2) { /* grande demais: segue sem guardar */ }
  return r;
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

/** Versão antiga (sem a chave secreta). Só para conferir senhas criadas antes da versão 6. */
function hashSenhaV1_(senha, salt) {
  var h = salt + '|' + senha;
  for (var i = 0; i < ITERACOES_HASH; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

/**
 * Chave secreta ("pepper") das senhas. Fica nas Propriedades do script, que não aparecem na planilha:
 * mesmo quem abrir a aba Usuarios não consegue testar senhas fora do painel.
 */
function chaveSecreta_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('CHAVE_SENHAS');
  if (!k) {
    k = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('CHAVE_SENHAS', k);
  }
  return k;
}

/** Senha → "v2$" + HMAC-SHA256 com a chave secreta, repetido 1.000 vezes com o salt do usuário. */
function hashSenha_(senha, salt) {
  var chave = chaveSecreta_();
  var h = salt + '|' + senha;
  for (var i = 0; i < ITERACOES_HASH; i++) {
    h = Utilities.base64Encode(Utilities.computeHmacSha256Signature(h + '|' + salt, chave, Utilities.Charset.UTF_8));
  }
  return 'v2$' + h;
}

function senhaConfere_(senha, linha) {
  var guardado = String(linha.hash || '');
  if (/^v2\$/.test(guardado)) return iguais_(hashSenha_(senha, linha.salt), guardado);
  return iguais_(hashSenhaV1_(senha, linha.salt), guardado);
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
  var usuario = String(d.usuario || '').trim().toLowerCase().slice(0, 40);
  var senha = String(d.senha || '').slice(0, 200);
  var cache = CacheService.getScriptCache();
  var falhas = parseInt(cache.get('login_falhas') || '0', 10);
  if (falhas >= LOGIN_FALHAS_GLOBAL) {
    registrar_(usuario, 'login recusado', 'trava geral: muitas tentativas erradas no painel');
    throw falha_('Muitas tentativas de entrada erradas no painel. Por segurança, o login está travado por 15 minutos.');
  }
  var contarFalha = function () { cache.put('login_falhas', String(falhas + 1), 15 * 60); };
  return comTrava_(function () {
    var tab = tabela_('Usuarios');
    var linha = tab.linhas.filter(function (r) { return String(r.usuario).toLowerCase() === usuario; })[0];
    var generico = 'Usuário ou senha incorretos.';
    if (!linha || linha.ativo !== 'sim') {
      contarFalha();
      registrar_(usuario, 'login recusado', 'usuário inexistente ou inativo');
      throw falha_(generico);
    }
    var agora = new Date();
    if (linha.bloqueado_ate && new Date(linha.bloqueado_ate) > agora) {
      throw falha_('Muitas tentativas erradas. Tente de novo depois das ' + horaCurta_(new Date(linha.bloqueado_ate)) + '.');
    }
    if (!senhaConfere_(senha, linha)) {
      contarFalha();
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
    var mud = { tentativas: '0', bloqueado_ate: '', ultimo_acesso: agora.toISOString() };
    if (!/^v2\$/.test(linha.hash)) { var salt2 = Utilities.getUuid(); mud.salt = salt2; mud.hash = hashSenha_(senha, salt2); } // atualiza senhas antigas
    atualizarLinha_(tab, linha, mud);
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    cache.put('sessao_' + token, [linha.id, linha.sessao_versao || '0', Date.now()].join('|'), SESSAO_SEG);
    registrar_(linha.usuario, 'login', '');
    try { garantirGatilho_(); } catch (e) { /* o login não depende do robô */ }
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
  if (!/^[0-9a-f]{96}$/.test(token)) throw falha_('Sua sessão terminou. Entre de novo.', true);
  var valor = cache.get('sessao_' + token);
  if (!valor) throw falha_('Sua sessão terminou. Entre de novo.', true);
  var partes = valor.split('|');
  var id = partes[0], versao = partes[1], criada = +partes[2] || 0;
  if (Date.now() - criada > SESSAO_MAX_MS) { cache.remove('sessao_' + token); throw falha_('Sua sessão terminou (12 horas). Entre de novo.', true); }
  // dados do usuário ficam na memória do servidor: o pedido que já tem resposta pronta nem abre a planilha.
  // A memória vale até a próxima gravação (desativar, trocar senha ou perfil grava e derruba na hora).
  var ku = 'usr_' + id + '_' + versaoDados_().slice(-10), u = null;
  try { var uc = cache.get(ku); if (uc) u = JSON.parse(uc); } catch (eU) { u = null; }
  if (!u) {
    u = tabela_('Usuarios').linhas.filter(function (r) { return r.id === id; })[0];
    if (u) { try { var cp = {}; Object.keys(u).forEach(function (k) { if (k !== 'hash' && k !== 'salt' && k.charAt(0) !== '_') cp[k] = u[k]; }); cache.put(ku, JSON.stringify(cp), 300); } catch (eP) { /* segue */ } }
  }
  if (!u || u.ativo !== 'sim' || !PERFIS[u.perfil]) {
    cache.remove('sessao_' + token);
    throw falha_('Seu acesso foi desativado.', true);
  }
  if ((u.sessao_versao || '0') !== versao) { cache.remove('sessao_' + token); throw falha_('Sua senha ou seu acesso mudou. Entre de novo.', true); }
  cache.put('sessao_' + token, valor, SESSAO_SEG); // renova enquanto estiver em uso (até 12 horas no total)
  return u;
}

function publicoUsuario_(u) {
  var p = PERFIS[u.perfil];
  return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.perfil, perfilNome: p.nome, pode: { financeiro: p.financeiro, usuarios: p.usuarios, conferePrazos: p.conferePrazos, ocultarValores: !!p.ocultarValores } };
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
    ativo: 'sim', tentativas: '0', bloqueado_ate: '', criado_em: new Date().toISOString(), ultimo_acesso: '',
    email: validarEmail_(d.email), resumo_email: 'sim'
  };
  inserirLinha_(tab, linha);
  return linha;
}

function listarUsuarios_() {
  return tabela_('Usuarios').linhas.map(function (r) {
    return { id: r.id, usuario: r.usuario, nome: r.nome, perfil: r.perfil, ativo: r.ativo, ultimo_acesso: r.ultimo_acesso, email: r.email || '', resumo_email: r.resumo_email || '',
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
    if (d.email !== undefined) m.email = validarEmail_(d.email);
    if (d.resumo_email !== undefined) m.resumo_email = d.resumo_email === 'nao' ? 'nao' : 'sim';
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
    if (d.desbloquear) { m.tentativas = '0'; m.bloqueado_ate = ''; }
    // senha nova, perfil novo, desativação ou "desconectar agora": derruba as sessões abertas dessa pessoa
    if (m.hash || (m.perfil && m.perfil !== linha.perfil) || m.ativo === 'nao' || d.desconectar) m.sessao_versao = String((parseInt(linha.sessao_versao, 10) || 0) + 1);
    atualizarLinha_(tab, linha, m);
    registrar_(u.usuario, d.desconectar ? 'usuário desconectado' : 'usuário alterado', linha.usuario + ' ' + Object.keys(m).filter(function (k) { return k !== 'hash' && k !== 'salt'; }).join(','));
    return { id: linha.id };
  });
}

function validarEmail_(e) {
  e = String(e || '').trim().toLowerCase();
  if (e && !/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(e)) throw falha_('E-mail inválido.');
  return e;
}

function trocarSenha_(d, u) {
  return comTrava_(function () {
    if (!senhaConfere_(String(d.atual || ''), u)) throw falha_('A senha atual não confere.');
    var tab = tabela_('Usuarios');
    var linha = tab.linhas.filter(function (r) { return r.id === u.id; })[0];
    var salt = Utilities.getUuid();
    var versao = String((parseInt(linha.sessao_versao, 10) || 0) + 1);
    atualizarLinha_(tab, linha, { salt: salt, hash: hashSenha_(validarSenha_(d.nova, u.usuario), salt), sessao_versao: versao });
    registrar_(u.usuario, 'senha trocada', 'outras sessões encerradas');
    // nova sessão para quem trocou (as outras caem)
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('sessao_' + token, [linha.id, versao, Date.now()].join('|'), SESSAO_SEG);
    return { trocada: true, token: token };
  });
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

var CAMPOS_CLIENTE = ['tipo_acao', 'resumo_caso', 'providencias', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
  'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'observacoes', 'situacao', 'genero'];

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
  var cli = limpar_(c); cli.acesso_ativo = !!c.acesso_hash; delete cli.acesso_hash;
  return { cliente: cli, processos: procs.map(limpar_) };
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
    if (!c.id) {
      var falta = [];
      if (!doc) falta.push(c.tipo === 'PJ' ? 'CNPJ' : 'CPF');
      if (c.tipo !== 'PJ' && !String(c.rg || '').trim()) falta.push('RG');
      if (c.tipo !== 'PJ' && !String(c.profissao || '').trim()) falta.push('profissão');
      if (!String(c.endereco || '').trim()) falta.push('endereço');
      if (falta.length) throw falha_('Para cadastrar, preencha: ' + falta.join(', ') + '.');
    }
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

/**
 * Acrescenta uma observação ao cliente, com data, hora e quem escreveu (a mais nova fica em cima).
 * Formato guardado: "[27/10/2026 14:05 — Julian] texto", uma por linha.
 */
function anotarCliente_(d, u) {
  var texto = String(d.texto || '').replace(/\s+/g, ' ').trim();
  if (!texto) throw falha_('Escreva a observação.');
  if (texto.length > 2000) throw falha_('Observação longa demais (até 2.000 letras).');
  return comTrava_(function () {
    var tab = tabela_('Clientes');
    var c = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    var carimbo = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    var nova = '[' + carimbo + ' — ' + (u.nome || u.usuario) + '] ' + texto;
    var obs = (nova + (c.observacoes ? '\n' + c.observacoes : '')).slice(0, 45000);
    atualizarLinha_(tab, c, { observacoes: obs, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, 'observação no cliente', c.id);
    return { observacoes: obs };
  });
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
    var umaPal = [];
    r.ligar.forEach(function (x) {
      atualizarLinha_(tab, x.cliente, { pasta_id: x.pasta.id, pasta_url: x.pasta.url }); aprox++;
      if (x.umaPalavra) umaPal.push([seguro_(x.pasta.nome), x.pasta.url, 'ligada pelo primeiro nome da pasta — conferir', seguro_(x.cliente.nome)]);
    });
    duvidas = r.duvidas;
    // 3) quem ainda está sem pasta: procura no Drive inteiro (outras pastas, subpastas, compartilhadas)
    var fora = [];
    try {
      var semPasta = tab.linhas.filter(function (c) { return !c.pasta_id; });
      if (semPasta.length) {
        var dentro = {};
        pastas.forEach(function (p) { dentro[p.id] = true; });
        var excluir = {};
        excluir[raiz.getId()] = true;
        try { excluir[DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents().next().getId()] = true; } catch (e) { /* sem pasta */ }
        var todas = todasPastasDrive_().filter(function (p) {
          return !dentro[p.id] && !excluir[p.id] && !(p.pais || []).some(function (x) { return excluir[x] && x !== raiz.getId(); });
        });
        var r3 = casarPastas_(todas, tab.linhas);
        r3.ligar.forEach(function (x) {
          atualizarLinha_(tab, x.cliente, { pasta_id: x.pasta.id, pasta_url: x.pasta.url });
          fora.push([seguro_(x.pasta.nome), x.pasta.url, 'ligada fora de 02. CLIENTES — conferir', seguro_(x.cliente.nome)]);
        });
      }
    } catch (e) {
      fora.push(['(busca no Drive inteiro falhou)', '', seguro_(String(e && e.message || e).slice(0, 300)), '']);
    }
    aprox += fora.filter(function (l) { return l[1]; }).length;
    regravarMudadas_(tab);
    // 3) relatório: pastas que não ficaram com nenhum cliente
    var usadas = {};
    tab.linhas.forEach(function (c) { if (c.pasta_id) usadas[c.pasta_id] = true; });
    var mapaDuv = {};
    duvidas.forEach(function (d) { mapaDuv[d.pasta.id] = d.candidatos.join(' | '); });
    var linhas = pastas.filter(function (p) { return !usadas[p.id]; })
      .sort(function (a, b) { return a.nome < b.nome ? -1 : 1; })
      .map(function (p) { return [seguro_(p.nome), p.url, mapaDuv[p.id] ? 'mais de um cliente possível' : 'nenhum cliente com esse nome', seguro_(mapaDuv[p.id] || '')]; });
    linhas = fora.concat(umaPal, linhas);
    var sh = aba_('PastasConferir');
    var cab = ESQUEMA.PastasConferir;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).clearContent(); marcarMudanca_();
    if (linhas.length) sh.getRange(2, 1, linhas.length, cab.length).setNumberFormat('@').setValues(linhas); marcarMudanca_();
  });
  registrar_('sistema', 'pastas vinculadas', n + ' pelo nome igual, ' + aprox + ' pelo nome parecido, ' + duvidas.length + ' em dúvida');
  return n + aprox;
}

/** Todas as pastas que a conta enxerga e onde pode gravar (Drive REST: 1000 por página, bem mais rápido que DriveApp). */
function todasPastasDrive_() {
  var lista = [], pagina = '', voltas = 0;
  var q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  do {
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&pageSize=1000&corpora=allDrives&includeItemsFromAllDrives=true' +
      '&supportsAllDrives=true&fields=' + encodeURIComponent('nextPageToken,files(id,name,parents,capabilities/canAddChildren)') +
      (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('Drive respondeu ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
    var j = JSON.parse(resp.getContentText());
    (j.files || []).forEach(function (f) {
      if (f.capabilities && f.capabilities.canAddChildren === false) return; // só pastas onde o escritório pode gravar
      lista.push({ id: f.id, nome: f.name, pais: f.parents || [], url: 'https://drive.google.com/drive/folders/' + f.id });
    });
    pagina = j.nextPageToken || '';
  } while (pagina && ++voltas < 50);
  return lista;
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
  var pedacos = t.split(/\s+[-–]\s+|\s+x\s+|,|\s+e\s+|\.\s/i);
  pedacos.forEach(function (p, i) {
    var tk = tokensNome_(p, true);
    // "Oditur - Fiscal - Dano Moral": a primeira palavra sozinha vale se só um cliente começa com ela
    if (tk.length === 1 && i === 0 && pedacos.length > 1 && tk[0].length >= 5) tk.umaPalavra = true;
    partes.push(tk);
  });
  return partes.filter(function (tk) { return tk.length >= 2 || tk.umaPalavra; });
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
  var ligar = [], duvidas = [], jaLigado = {}, memoPrimeira = {};
  pastas.forEach(function (p) {
    if (usadas[p.id]) return;
    partesPasta_(p.nome).forEach(function (parte) {
      if (parte.umaPalavra) {
        var so = (porPrimeira[parte[0]] || []);
        if (so.length === 1 && !so[0].pasta_id && !jaLigado[so[0].id]) { jaLigado[so[0].id] = true; ligar.push({ cliente: so[0], pasta: p, umaPalavra: true }); }
        return;
      }
      var cand = [];
      var parecidas = memoPrimeira[parte[0]] || (memoPrimeira[parte[0]] = primeiras.filter(function (w) { return palavraParecida_(parte[0], w); }));
      parecidas.forEach(function (w) {
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
/* "Acompanhe seu processo" (site): o cliente vê os próprios processos  */
/* ------------------------------------------------------------------ */
/*
 * O escritório gera na ficha um código de 8 letras/números para o cliente (mostrado uma vez só, guardado embaralhado
 * como as senhas). No site, com CPF + código, o cliente vê seus processos: situação, vara, próximo ato e a data da
 * última movimentação. Nada de prazos internos, valores ou dados de outros clientes. Erros são limitados.
 */
var LETRAS_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function acessoCliente_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Clientes');
    var c = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    if (d.acao === 'revogar') {
      atualizarLinha_(tab, c, { acesso_hash: '', acesso_criado_em: '' });
      registrar_(u.usuario, 'acesso do cliente desativado', c.id);
      return { ok: true };
    }
    if (String(c.cpf_cnpj || '').replace(/\D/g, '').length < 11) throw falha_('Cadastre o CPF do cliente antes de gerar o código.');
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid(), Utilities.Charset.UTF_8);
    var codigo = '';
    for (var i = 0; i < 8; i++) codigo += LETRAS_CODIGO.charAt((bytes[i] & 255) % LETRAS_CODIGO.length);
    atualizarLinha_(tab, c, { acesso_hash: hashSenha_(codigo, 'acesso|' + c.id), acesso_criado_em: new Date().toISOString() });
    registrar_(u.usuario, 'código de acesso do cliente gerado', c.id);
    return { codigo: codigo, link: 'https://araujoadvocaciasc.com.br/acompanhe/' };
  });
}

function consultaCliente_(d) {
  var cache = CacheService.getScriptCache();
  var cpf = String(d.cpf || '').replace(/\D/g, '');
  var codigo = String(d.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var erro = 'CPF ou código incorretos. Confira e tente de novo, ou fale com o escritório.';
  if ((parseInt(cache.get('cons_falhas'), 10) || 0) >= 100) throw falha_('Muitas tentativas no momento. Tente de novo em 15 minutos.');
  if (cpf.length !== 11 && cpf.length !== 14) throw falha_(erro);
  var kCpf = 'cons_cpf_' + cpf;
  if ((parseInt(cache.get(kCpf), 10) || 0) >= 5) throw falha_('Muitas tentativas para este CPF. Tente de novo em 15 minutos ou fale com o escritório.');
  var falhou = function () {
    cache.put(kCpf, String((parseInt(cache.get(kCpf), 10) || 0) + 1), 900);
    cache.put('cons_falhas', String((parseInt(cache.get('cons_falhas'), 10) || 0) + 1), 900);
    throw falha_(erro);
  };
  if (codigo.length !== 8) falhou();
  var cli = tabela_('Clientes').linhas.filter(function (c) {
    return c.acesso_hash && String(c.cpf_cnpj || '').replace(/\D/g, '') === cpf && iguais_(hashSenha_(codigo, 'acesso|' + c.id), c.acesso_hash);
  })[0];
  if (!cli) falhou();
  var hoje = hojeSP_();
  var procs = tabela_('Processos').linhas.filter(function (p) { return p.cliente_id === cli.id && (p.numero || faseDe_(p) === 'contratado'); }).map(function (p) {
    var ato = p.proximo_ato_data && p.proximo_ato_data >= hoje ? { ato: String(p.proximo_ato || '').slice(0, 120), data: p.proximo_ato_data } : null;
    var fase = faseDe_(p), andam = [];
    try { andam = p.andamentos && p.andamentos !== '-' ? JSON.parse(p.andamentos).slice(0, 6).map(function (m) { return { d: String(m.d).slice(0, 10), n: String(m.n).slice(0, 140) }; }) : []; } catch (e) { andam = []; }
    return {
      numero: p.numero || '', area: p.area || '', tribunal: p.tribunal || tribunalDoNumero_(p.numero), orgao: p.orgao || '',
      situacao: p.status === 'arquivado' || fase === 'extinto' ? 'Arquivado / baixado' : !p.numero ? 'Em preparação' : 'Em andamento', proximo: ato,
      fase: fase, fase_nome: FASES[fase], andamentos: andam,
      movimentacao: p.ultimo_movimento_em ? String(p.ultimo_movimento_em).slice(0, 10) : '',
      ultimo: String(p.ultimo_movimento || '').replace(/\s+/g, ' ').slice(0, 160)
    };
  }).sort(function (a, b) {
    if (a.situacao !== b.situacao) return a.situacao === 'Arquivado / baixado' ? 1 : b.situacao === 'Arquivado / baixado' ? -1 : 0;
    return a.movimentacao < b.movimentacao ? 1 : a.movimentacao > b.movimentacao ? -1 : 0;
  });
  cache.remove(kCpf);
  registrar_('site', 'consulta do cliente', cli.id + ' (' + procs.length + ' processo(s))');
  return { nome: nomeProprio_(String(cli.nome || '').split(' ')[0]), processos: procs, atualizado: config_('ROBO_ULTIMA_EXECUCAO') || '' };
}

/* ------------------------------------------------------------------ */
/* WhatsApp: conversa exportada → PDF de fotos na pasta do cliente      */
/* ------------------------------------------------------------------ */
/*
 * O WhatsApp não deixa programas lerem as conversas. O caminho oficial é "Exportar conversa" (com mídia) para o
 * Google Drive, na pasta "ENTRADA DO WHATSAPP". O robô (ou o botão na ficha do cliente) abre o .zip, descobre o
 * cliente pelo nome ou telefone do arquivo, junta as fotos num PDF (uma por página, com data), salva vídeos e
 * áudios numa subpasta e guarda a conversa em PDF, tudo na pasta do cliente. Também aceita uma subpasta da entrada
 * com o nome do cliente e as fotos soltas dentro.
 */
var WHATS_IMAGEM = /\.(jpe?g|png|gif|bmp)$/i;
var WHATS_MIDIA = /\.(mp4|3gp|mov|m4v|avi|opus|ogg|m4a|mp3|aac|amr|wav|webp|heic|pdf|docx?|xlsx?|vcf)$/i;
var WHATS_FOTOS_POR_PDF = 60;

function pastaEntradaWhats_() {
  var id = config_('PASTA_WHATSAPP_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recria */ } }
  var pasta = DriveApp.getRootFolder().createFolder('ENTRADA DO WHATSAPP (exportar conversas aqui)');
  setConfig_('PASTA_WHATSAPP_ID', pasta.getId(), 'Pasta onde o celular salva as conversas exportadas do WhatsApp');
  return pasta;
}

/** "Conversa do WhatsApp com Gabriel Lima Nandi.zip" → "Gabriel Lima Nandi". */
function nomeDaConversa_(arquivo) {
  return String(arquivo).replace(/\.zip$/i, '').replace(/^\s*(\[[^\]]*\]\s*)?/, '')
    .replace(/^(conversa (do|no) whatsapp com|whatsapp chat (with|com|-)|chat do whatsapp com|whatsapp\s*-?)\s*/i, '').trim();
}

/** Acha o cliente pelo nome do arquivo (nome completo, todas as palavras ou telefone). Só devolve se for um só. */
function clienteDaConversa_(nome, clientes) {
  var alvo = normalizar_(nome);
  if (!alvo) return null;
  var digitos = String(nome).replace(/\D/g, '');
  var um = function (l) { return l.length === 1 ? l[0] : null; };
  var exato = clientes.filter(function (c) { return normalizar_(c.nome) === alvo; });
  if (exato.length) return exato[0];
  if (digitos.length >= 8) {
    var fim = digitos.slice(-8);
    var tel = um(clientes.filter(function (c) { return String(c.telefone || '').replace(/\D/g, '').slice(-8) === fim; }));
    if (tel) return tel;
  }
  var palavras = alvo.split(' ').filter(function (p) { return p.length > 2; });
  if (palavras.length < 2) return null;
  return um(clientes.filter(function (c) {
    var n = ' ' + normalizar_(c.nome) + ' ';
    return palavras.every(function (p) { return n.indexOf(' ' + p + ' ') >= 0; });
  }));
}

/** "IMG-20240512-WA0003.jpg" / "00000012-PHOTO-2024-05-12-10-31-22.jpg" → "12/05/2024". */
function dataDaMidia_(nome) {
  var m = /(20\d{2})-?(\d{2})-?(\d{2})/.exec(nome);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

/** Junta as fotos num PDF (várias partes se forem muitas). Devolve os PDFs criados. */
function fotosEmPdf_(fotos, cliente, destino, rotulo) {
  var pdfs = [];
  var hoje = dataBR_(hojeSP_()).replace(/\//g, '-');
  for (var i = 0; i < fotos.length; i += WHATS_FOTOS_POR_PDF) {
    var lote = fotos.slice(i, i + WHATS_FOTOS_POR_PDF);
    var parte = fotos.length > WHATS_FOTOS_POR_PDF ? ' (PARTE ' + (i / WHATS_FOTOS_POR_PDF + 1) + ')' : '';
    var nome = 'FOTOS DO WHATSAPP — ' + nomePasta_(cliente.nome) + ' — ' + hoje + parte;
    var doc = DocumentApp.create(nome);
    var corpo = doc.getBody();
    corpo.setMarginTop(36).setMarginBottom(36).setMarginLeft(42).setMarginRight(42);
    var ps0 = corpo.getParagraphs(), tit = ps0.length ? ps0[0] : corpo.appendParagraph('');
    tit.setText('FOTOS RECEBIDAS PELO WHATSAPP' + parte).setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setBold(true).setFontSize(13);
    corpo.appendParagraph(String(cliente.nome).toUpperCase() + (rotulo ? ' — ' + rotulo : '') + ' — ' + lote.length + ' foto(s)')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(10);
    lote.forEach(function (b, j) {
      if (j > 0) corpo.appendPageBreak();
      var leg = corpo.appendParagraph((i + j + 1) + '. ' + b.getName() + (dataDaMidia_(b.getName()) ? ' — ' + dataDaMidia_(b.getName()) : ''));
      leg.setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(9).setBold(false);
      try {
        var p = corpo.appendParagraph('');
        p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        var img = p.appendInlineImage(b);
        var w = img.getWidth(), h = img.getHeight(), maxW = 510, maxH = 640;
        var k = Math.min(1, maxW / w, maxH / h);
        img.setWidth(Math.round(w * k)).setHeight(Math.round(h * k));
      } catch (e) {
        corpo.appendParagraph('(não foi possível colocar esta imagem no PDF; o arquivo original está na pasta)').editAsText().setItalic(true);
      }
    });
    doc.saveAndClose();
    var arq = DriveApp.getFileById(doc.getId());
    var pdf = destino.createFile(arq.getAs('application/pdf')).setName(nome + '.pdf');
    arq.setTrashed(true);
    pdfs.push(pdf);
  }
  return pdfs;
}

/** Conversa (.txt) em PDF, com a lista dos vídeos e áudios no fim. */
function conversaEmPdf_(texto, cliente, destino, outros) {
  var nome = 'CONVERSA DO WHATSAPP — ' + nomePasta_(cliente.nome) + ' — ' + dataBR_(hojeSP_()).replace(/\//g, '-');
  var doc = DocumentApp.create(nome);
  var corpo = doc.getBody();
  var ps0 = corpo.getParagraphs();
  (ps0.length ? ps0[0] : corpo.appendParagraph('')).setText('CONVERSA DO WHATSAPP — ' + String(cliente.nome).toUpperCase())
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setBold(true).setFontSize(13);
  String(texto || '').split(/\r?\n/).slice(0, 8000).forEach(function (l) { corpo.appendParagraph(l).editAsText().setFontSize(9).setBold(false); });
  if (outros.length) {
    corpo.appendParagraph('Vídeos, áudios e outros arquivos (estão na pasta):').editAsText().setBold(true).setFontSize(10);
    outros.forEach(function (o) { corpo.appendParagraph('• ' + o).editAsText().setBold(false).setFontSize(9); });
  }
  doc.saveAndClose();
  var arq = DriveApp.getFileById(doc.getId());
  var pdf = destino.createFile(arq.getAs('application/pdf')).setName(nome + '.pdf');
  arq.setTrashed(true);
  return pdf;
}

/** Abre um .zip exportado (ou uma lista de arquivos soltos) e salva tudo na pasta do cliente. */
function converterWhats_(blobs, cliente, rotulo) {
  if (!cliente.pasta_id) throw falha_('O cliente ' + cliente.nome + ' não tem pasta no Drive. Ligue a pasta na ficha antes.');
  var pasta = DriveApp.getFolderById(cliente.pasta_id);
  var sub = pasta.createFolder('WHATSAPP — ' + dataBR_(hojeSP_()).replace(/\//g, '-') + (rotulo ? ' — ' + rotulo : ''));
  var fotos = [], outros = [], texto = '';
  blobs.forEach(function (b) {
    var n = b.getName() || '';
    if (/(^|\/)__MACOSX\//.test(n) || /(^|\/)\./.test(n)) return;
    b.setName(n.split('/').pop());
    if (/\.txt$/i.test(n)) { texto += (texto ? '\n' : '') + b.getDataAsString('UTF-8'); return; }
    if (WHATS_IMAGEM.test(n)) { fotos.push(b); sub.createFile(b); return; }
    sub.createFile(b);
    outros.push(b.getName());
  });
  fotos.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var pdfs = fotos.length ? fotosEmPdf_(fotos, cliente, pasta, rotulo) : [];
  var conversa = texto || outros.length ? conversaEmPdf_(texto, cliente, pasta, outros) : null;
  return { fotos: fotos.length, outros: outros.length, pdfs: pdfs.map(function (p) { return p.getUrl(); }),
    conversa: conversa ? conversa.getUrl() : '', pasta: sub.getUrl() };
}

/**
 * Lê a pasta de entrada do WhatsApp. Com cliente_id, só converte o que for daquele cliente; sem, converte tudo
 * o que conseguir identificar (usado pelo robô). Os .zip convertidos vão para a subpasta do cliente.
 */
function processarWhatsapp_(clienteId, limiteMs) {
  var t0 = Date.now(), limite = limiteMs || 240000;
  var entrada = pastaEntradaWhats_();
  var clientes = tabela_('Clientes').linhas;
  var feitos = [], semCliente = [], erros = [];
  var alvo = clienteId ? clientes.filter(function (c) { return c.id === clienteId; })[0] : null;
  var trata = function (nome, cliente, pegarBlobs, depois) {
    if (Date.now() - t0 > limite) return;
    if (!cliente) { semCliente.push(nome); return; }
    if (alvo && cliente.id !== alvo.id) return;
    try {
      var r = converterWhats_(pegarBlobs(), cliente, '');
      r.cliente = cliente.nome; r.cliente_id = cliente.id; r.arquivo = nome;
      feitos.push(r);
      depois(cliente);
      registrar_('robô', 'whatsapp convertido', cliente.id + ' ' + r.fotos + ' foto(s)');
    } catch (e) { erros.push(nome + ': ' + (e.message || e)); }
  };
  var zips = entrada.getFiles();
  while (zips.hasNext()) {
    var z = zips.next();
    if (!/\.zip$/i.test(z.getName()) && z.getMimeType() !== MimeType.ZIP) continue;
    (function (z) {
      var nome = nomeDaConversa_(z.getName());
      trata(z.getName(), alvo && !clienteDaConversa_(nome, clientes) && entradaSoDeUm_(entrada) ? alvo : clienteDaConversa_(nome, clientes), function () {
        if (z.getSize() > 48 * 1024 * 1024) throw falha_('arquivo maior que 48 MB; exporte de novo "sem mídia" ou mande as fotos numa pasta com o nome do cliente');
        return Utilities.unzip(z.getBlob().setContentType('application/zip'));
      }, function (c) { z.moveTo(DriveApp.getFolderById(c.pasta_id)); z.setName('[convertido] ' + z.getName()); });
    })(z);
  }
  var subs = entrada.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    (function (s) {
      trata(s.getName(), clienteDaConversa_(nomeDaConversa_(s.getName()), clientes), function () {
        var l = [], it = s.getFiles();
        while (it.hasNext()) l.push(it.next().getBlob());
        if (!l.length) throw falha_('pasta vazia');
        return l;
      }, function () { s.setTrashed(true); });
    })(s);
  }
  if (semCliente.length) setConfig_('WHATSAPP_SEM_CLIENTE', semCliente.join(' | ').slice(0, 2000), 'Conversas do WhatsApp sem cliente identificado');
  return { feitos: feitos, semCliente: semCliente, erros: erros, entrada: entrada.getUrl() };
}

/** Se a entrada tiver um único .zip, o botão da ficha usa esse arquivo para o cliente aberto. */
function entradaSoDeUm_(entrada) {
  var n = 0, it = entrada.getFiles();
  while (it.hasNext()) { if (/\.zip$/i.test(it.next().getName())) n++; if (n > 1) return false; }
  return n === 1;
}

function whatsappCliente_(d, u) {
  if (!d.id) throw falha_('Cliente não informado.');
  var r = processarWhatsapp_(d.id, 270000);
  registrar_(u.usuario, 'whatsapp → pdf', d.id + ' ' + r.feitos.length + ' conversa(s)');
  return r;
}

/* ------------------------------------------------------------------ */
/* Processos                                                           */
/* ------------------------------------------------------------------ */

var CAMPOS_PROCESSO = ['cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
  'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'responsavel'];

function listarProcessos_(d) {
  var busca = normalizar_(d.busca || '');
  var nomes = {};
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  return tabela_('Processos').linhas
    .map(function (p) { var x = limpar_(p); x.cliente_nome = nomes[p.cliente_id] || p.cliente_nome || ''; x.tem_andamentos = !!p.andamentos && p.andamentos !== '-'; delete x.andamentos; x.fase = faseDe_(p); return x; })
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
    if (p.fase !== undefined) {
      if (p.fase && !FASES[p.fase]) throw falha_('Fase inválida.');
      dados.fase = p.fase || ''; dados.fase_auto = p.fase ? 'nao' : '';
    }
    dados.atualizado_em = agora;
    dados.atualizado_por = u.usuario;
    if (p.id) {
      var linha = tab.linhas.filter(function (r) { return r.id === p.id; })[0];
      if (!linha) throw falha_('Processo não encontrado.');
      if (dados.fase !== undefined && dados.fase === linha.fase) delete dados.fase_auto; // não mexeu na fase: segue automática
      var protocolou = !linha.numero && numero;
      if (protocolou && (dados.fase || linha.fase) === 'contratado' && linha.fase_auto !== 'nao') { dados.fase = 'andamento'; dados.fase_auto = ''; if ((dados.proximo_ato === undefined || dados.proximo_ato === 'Ajuizar a ação') && linha.proximo_ato === 'Ajuizar a ação') dados.proximo_ato = ''; }
      if (dados.responsavel !== undefined && dados.responsavel) validarResponsavel_(dados.responsavel);
      atualizarLinha_(tab, linha, dados);
      if (protocolou) concluirPeticaoInicial_(linha, u);
      else if (dados.responsavel !== undefined) passarPeticaoInicial_(linha, dados.responsavel, u);
      registrar_(u.usuario, 'processo alterado', linha.id + ' ' + (numero || linha.numero));
      return { id: linha.id };
    }
    dados.id = novoId_('P');
    dados.status = dados.status || 'ativo';
    if (!dados.fase) { dados.fase = numero ? 'ajuizado' : 'contratado'; dados.fase_auto = ''; }
    dados.origem = 'painel';
    dados.criado_em = agora;
    if (!numero && dados.fase === 'contratado' && !dados.responsavel) dados.responsavel = config_('RESP_INICIAL') || '';
    if (!numero && !dados.proximo_ato) dados.proximo_ato = 'Ajuizar a ação';
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'processo criado', dados.id + ' ' + numero);
    if (!numero && dados.fase === 'contratado') tarefaPeticaoInicial_(dados, u);
    return { id: dados.id };
  });
}

/* ---------- Cliente com ação: Petição inicial → Em andamento ---------- */

/** Tarefa "Petição inicial" para quem faz as iniciais (Config RESP_INICIAL). Uma só por processo. */
function tarefaPeticaoInicial_(proc, u, tipoNome) {
  var tab = tabela_('Tarefas'), marca = '[inicial:' + proc.id + ']';
  if (tab.linhas.some(function (x) { return (x.descricao || '').indexOf(marca) >= 0; })) return null;
  var cli = proc.cliente_id ? tabela_('Clientes').linhas.filter(function (c) { return c.id === proc.cliente_id; })[0] : null;
  var nome = cli ? cli.nome : (proc.cliente_nome || 'cliente');
  var agora = new Date().toISOString(), hoje = hojeSP_();
  var prazo = parseInt(config_('PRAZO_INICIAL_DIAS'), 10) || 7;
  var t = { id: novoId_('T'), titulo: 'Petição inicial — ' + nome + (tipoNome || proc.area ? ' (' + (tipoNome || proc.area) + ')' : ''),
    descricao: 'Cliente contratou. Fazer e protocolar a petição inicial' + (proc.parte_contraria ? ' contra ' + proc.parte_contraria : '') +
      '. Quando protocolar, coloque o número no processo (Processos › abrir) e ele passa sozinho para "Em andamento".\n' + marca,
    responsavel: proc.responsavel || config_('RESP_INICIAL') || '', processo_id: proc.id, numero: '', cliente_id: proc.cliente_id || '',
    vence_em: somarDias_(hoje, prazo), etapa: 'afazer', peso: '3', situacao: 'ativa', concluida_por: '', concluida_em: '',
    historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' ' + ((u && (u.nome || u.usuario)) || 'painel') + ': cliente com ação, petição inicial a fazer',
    criado_em: agora, criado_por: (u && u.usuario) || 'painel', atualizado_em: agora, atualizado_por: (u && u.usuario) || 'painel' };
  inserirLinha_(tab, t);
  return t.id;
}

/** Protocolou (o número entrou no processo): a tarefa da petição inicial vai para "Protocolado". */
function concluirPeticaoInicial_(proc, u) {
  var tab = tabela_('Tarefas'), marca = '[inicial:' + proc.id + ']', agora = new Date().toISOString();
  tab.linhas.forEach(function (x) {
    if ((x.descricao || '').indexOf(marca) < 0 || x.concluida_em) return;
    atualizarLinha_(tab, x, { etapa: 'protocolado', concluida_em: agora, concluida_por: x.responsavel || u.usuario, numero: proc.numero || x.numero,
      historico: historicoMais_(x.historico, u, 'protocolou: ' + (proc.numero || '')), atualizado_em: agora, atualizado_por: u.usuario });
    registrar_(u.usuario, 'tarefa: Protocolado', x.titulo);
  });
}

/** Trocou o responsável do processo "a ajuizar": a tarefa da inicial vai junto. */
function passarPeticaoInicial_(proc, resp, u) {
  var tab = tabela_('Tarefas'), marca = '[inicial:' + proc.id + ']';
  tab.linhas.forEach(function (x) {
    if ((x.descricao || '').indexOf(marca) < 0 || x.concluida_em || x.responsavel === resp) return;
    atualizarLinha_(tab, x, { responsavel: resp, historico: historicoMais_(x.historico, u, resp ? 'passou para ' + resp : 'tirou o responsável'), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
  });
}

/** "Cliente contratou": o cliente em atendimento ganha a ação (Processos › Petição inicial) e a tarefa vai para o responsável. */
function abrirAcaoCliente_(d, u) {
  return comTrava_(function () {
    var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    var tabP = tabela_('Processos');
    var ja = tabP.linhas.filter(function (x) { return x.cliente_id === c.id && !x.numero && x.status !== 'arquivado'; })[0];
    if (ja) return { id: ja.id, ja: true };
    var tipo = d.tipo_acao ? TIPOS_ACAO[d.tipo_acao] : null;
    if (d.responsavel) validarResponsavel_(d.responsavel);
    var agora = new Date().toISOString();
    var novo = { id: novoId_('P'), cliente_id: c.id, cliente_nome: '', numero: '', tribunal: '', sistema: '', orgao: '', area: (tipo && tipo.area) || d.area || c.area || '',
      polo: 'ativo', parte_contraria: String(d.parte_contraria || '').trim().slice(0, 200), proximo_ato: 'Ajuizar a ação', proximo_ato_data: '', status: 'ativo',
      observacoes: (tipo ? tipo.nome + '. ' : '') + 'Cliente contratou em ' + dataBR_(hojeSP_()) + '. Coloque o número quando ajuizar.',
      origem: 'painel', criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario, fase: 'contratado', fase_auto: '',
      responsavel: d.responsavel || config_('RESP_INICIAL') || '' };
    inserirLinha_(tabP, novo);
    tarefaPeticaoInicial_(novo, u, tipo ? tipo.nome : '');
    registrar_(u.usuario, 'processo criado', novo.id + ' (petição inicial) ' + c.nome);
    return { id: novo.id, responsavel: novo.responsavel };
  });
}

function tribunalDoNumero_(n) {
  var m = /\.(\d)\.(\d{2})\.\d{4}$/.exec(n);
  if (!m) return '';
  var j = m[1], tr = m[2];
  if (j === '5') return +tr === 0 ? 'TST' : 'TRT' + parseInt(tr, 10);
  if (j === '8') return (ESTADUAIS_DATAJUD[+tr] || 'TJ').toUpperCase();
  if (j === '4') return 'TRF' + parseInt(tr, 10);
  if (j === '3') return 'STJ';
  return '';
}

/* Todos os tribunais: o robô lê qualquer aviso de um endereço ".jus.br". */
var BUSCA_TRIBUNAIS = 'from:jus.br';
/** Aviso de outro formato (Projudi, e-SAJ, peticionamento, e-mail de vara): só cadastra o processo, sem prazo. */
function lerAvisoGenerico_(msg) {
  var corpo = msg.getSubject() + '\n' + (msg.getPlainBody() || '');
  var vistos = {}, itens = [], data = dataSP_(msg.getDate());
  var re = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g, m;
  var mov = /peticionamento/i.test(msg.getSubject()) ? 'Processo protocolado (peticionamento eletrônico)' : String(msg.getSubject()).replace(/\s+/g, ' ').slice(0, 120);
  while ((m = re.exec(corpo)) && itens.length < 40) {
    if (vistos[m[1]]) continue; vistos[m[1]] = 1;
    itens.push({ fonte: 'e-mail ' + (tribunalDoNumero_(m[1]) || 'tribunal'), chave: 'gen|' + m[1] + '|' + data + '|' + mov.slice(0, 40),
      recebido_em: msg.getDate().toISOString(), numero: m[1], tribunal: tribunalDoNumero_(m[1]), sistema: '', movimento: mov, evento: '', texto: '', nomes: [], tipo: '' });
  }
  return itens;
}
/** Escolhe o leitor pelo formato do e-mail. */
function lerAvisoTribunal_(msg) {
  var assunto = msg.getSubject() || '';
  if (/\[PUSH\]/.test(assunto)) return lerAvisoPje_(msg);
  if (/Movimenta.*Processua.*EPROC/i.test(assunto)) { var e = lerAvisoEproc_(msg); if (e.length) return e; }
  return lerAvisoGenerico_(msg);
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
    robo: estadoRobo_(),
    tarefas: minhasTarefas_(u)
  };
}

/* ------------------------------------------------------------------ */
/* Planilha: leitura e escrita                                         */
/* ------------------------------------------------------------------ */

function aba_(nome) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(nome);
  if (!sh && ESQUEMA[nome] && ss.getSheetByName('Config')) { // aba nova de uma versão nova: cria sozinha
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, ESQUEMA[nome].length).setValues([ESQUEMA[nome]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), ESQUEMA[nome].length).setNumberFormat('@');
  }
  if (!sh) throw falha_('A planilha não está configurada. Abra-a e use o menu Painel → Configurar planilha.');
  return sh;
}

function tabela_(nome) {
  if (MEMO_LEITURA && MEMO_LEITURA[nome]) return MEMO_LEITURA[nome];
  var t = lerTabela_(nome);
  if (MEMO_LEITURA) MEMO_LEITURA[nome] = t;
  return t;
}

function lerTabela_(nome) {
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
  tab.aba.getRange(r, 1, 1, tab.cab.length).setNumberFormat('@').setValues([linha]); marcarMudanca_();
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
  tab.aba.getRange(linhaObj._linha, 1, 1, tab.cab.length).setValues([valores]); marcarMudanca_();
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

var TRAVA_NIVEL_ = 0; // trava dentro de trava (uma rota chamando outra) não solta a de fora antes da hora
function comTrava_(fn) {
  if (TRAVA_NIVEL_ > 0) { TRAVA_NIVEL_++; try { return fn(); } finally { TRAVA_NIVEL_--; } }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw falha_('O sistema está ocupado. Tente de novo em alguns segundos.');
  TRAVA_NIVEL_ = 1;
  try { return fn(); } finally { TRAVA_NIVEL_ = 0; lock.releaseLock(); }
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

/** Dia (aaaa-mm-dd) no horário de Brasília de uma data ISO gravada em UTC (entrega às 22h de Brasília continua no mesmo dia). */
function diaSP_(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  var d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 10) : Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
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

/** Feriados nacionais e forenses calculados para qualquer ano (Páscoa pelo algoritmo de Meeus): nunca falta o ano que vem. */
function feriadosDoAno_(ano) {
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  var pascoa = ano + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
  var fixo = function (md) { return ano + '-' + md; };
  return [[fixo('01-01'), 'todos'], [somarDias_(pascoa, -48), 'todos'], [somarDias_(pascoa, -47), 'todos'], [somarDias_(pascoa, -4), 'JF/JT'],
    [somarDias_(pascoa, -3), 'todos'], [somarDias_(pascoa, -2), 'todos'], [fixo('04-21'), 'todos'], [fixo('05-01'), 'todos'], [somarDias_(pascoa, 60), 'todos'],
    [fixo('08-11'), 'JF/JT'], [fixo('09-07'), 'todos'], [fixo('10-12'), 'todos'], [fixo('11-02'), 'todos'], [fixo('11-15'), 'todos'],
    [fixo('11-20'), 'todos'], [fixo('12-08'), 'JF/JT'], [fixo('12-25'), 'todos']];
}

function mapaFeriados_() {
  var m = {}, anoAtual = +hojeSP_().slice(0, 4);
  [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2].forEach(function (ano) {
    feriadosDoAno_(ano).forEach(function (fe) { var l = m[fe[0]] = m[fe[0]] || []; if (l.indexOf(fe[1]) < 0) l.push(fe[1]); });
  });
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

/**
 * Prazo pelo tipo de ato. Regra do escritório: prazo NUNCA fica sem data.
 * Quando o aviso não diz o ato (no PJe vem "documento sigiloso"), usa o prazo provisório de 5 dias
 * (o mínimo do art. 218, § 3º, do CPC; corridos no criminal), sempre marcado para a advogada conferir.
 * Na dúvida, o robô escolhe o prazo MAIS CURTO possível, para nunca perder prazo.
 */
function sugerirPrazo_(texto, proc, tribunal, segundoGrauAviso) {
  var t = normalizar_(texto || '');
  var criminal = proc && proc.area === 'Criminal';
  var trab = /^TRT/.test(tribunal || '');
  var contagem = contagemPadrao_(proc);
  var m = /prazo\s+(?:comum\s+)?(?:de\s+)?(\d{1,3})\s*(?:\([^)]*\)\s*)?(dias?|horas?)(\s+(?:uteis|corridos))?/.exec(t);
  if (m) {
    if (/hora/.test(m[2])) return { dias: Math.max(1, Math.ceil(+m[1] / 24)), contagem: 'corridos', descricao: 'Prazo de ' + m[1] + ' horas indicado na intimação' };
    return { dias: +m[1], contagem: /corridos/.test(m[3] || '') ? 'corridos' : contagem, descricao: 'Prazo indicado na intimação' };
  }
  var segundoGrau = segundoGrauAviso || /\.0000$/.test((proc && proc.numero) || '') || /2º grau/i.test((proc && proc.orgao) || '') || /2o grau|2º grau/.test(t);
  var juizado = /juizado|jec|jef/i.test((proc && proc.orgao) || '') || /\.4\.04\.72/.test((proc && proc.numero) || '');
  if (/julgamento|sentenca|acordao/.test(t)) {
    if (segundoGrau) {
      if (criminal) return { dias: 2, contagem: 'corridos', descricao: 'Acórdão: embargos de declaração criminais (2 dias) — conferir se cabe recurso especial (15 dias)' };
      return { dias: 5, contagem: 'uteis', descricao: 'Acórdão: embargos de declaração (5 dias) — conferir se cabe recurso especial/revista (8 a 15 dias)' };
    }
    if (trab) return { dias: 8, contagem: 'uteis', descricao: 'Sentença: recurso ordinário (8 dias) — embargos de declaração em 5 dias' };
    if (criminal) return { dias: 5, contagem: 'corridos', descricao: 'Sentença: apelação criminal (5 dias)' };
    if (juizado) return { dias: 10, contagem: 'uteis', descricao: 'Sentença: recurso inominado (10 dias) — embargos de declaração em 5 dias' };
    return { dias: 15, contagem: 'uteis', descricao: 'Sentença: apelação (15 dias) — embargos de declaração em 5 dias' };
  }
  if (/contrarraz/.test(t)) {
    if (trab) return { dias: 8, contagem: 'uteis', descricao: 'Contrarrazões (8 dias)' };
    if (criminal) return { dias: 8, contagem: 'corridos', descricao: 'Contrarrazões criminais (8 dias)' };
    if (juizado) return { dias: 10, contagem: 'uteis', descricao: 'Contrarrazões ao recurso inominado (10 dias)' };
    return { dias: 15, contagem: 'uteis', descricao: 'Contrarrazões (15 dias)' };
  }
  if (/vista ao mp|ministerio publico para parecer/.test(t)) return { dias: 5, contagem: contagem, descricao: 'Vista ao Ministério Público (em regra sem prazo para o escritório) — PROVISÓRIO: conferir', provisorio: true };
  if (/audiencia/.test(t)) return { dias: 5, contagem: contagem, descricao: 'Intimação de audiência — PROVISÓRIO: conferir data, testemunhas e providências', provisorio: true };
  if (/requisicao|rpv|precatorio/.test(t)) return { dias: 5, contagem: contagem, descricao: 'Requisição de pagamento (RPV/precatório): manifestar em 5 dias — conferir' };
  if (/laudo|pericia/.test(t)) return { dias: trab ? 5 : 15, contagem: contagem, descricao: trab ? 'Manifestação sobre o laudo (5 dias) — conferir' : 'Manifestação sobre o laudo pericial (15 dias) — conferir' };
  if (/despacho|decisao/.test(t)) return { dias: 5, contagem: contagem, descricao: 'Despacho/decisão — PROVISÓRIO: 5 dias (art. 218, § 3º, CPC), conferir no sistema', provisorio: true };
  return { dias: 5, contagem: contagem, descricao: 'PROVISÓRIO: 5 dias (prazo mínimo) — o aviso não informa o ato; abrir no sistema e conferir', provisorio: true };
}

/** Situação de arquivo pela movimentação. */
function statusPeloMovimento_(mov) {
  var t = normalizar_(mov || '');
  if (/desarquiv/.test(t)) return 'ativo';
  if (/arquivad|arquivamento definitivo|baixa definitiva|remetidos? os autos .*arquivo|autos arquivados/.test(t)) return 'arquivado';
  return '';
}

/** Guarda a última movimentação do processo e ajusta ativo/arquivado. */
/* Fase do processo (aba Processos). A fase muda sozinha pela última movimentação, até alguém escolher à mão. */
// Etapas do processo, na ordem em que acontecem (o quadro de Processos segue esta ordem)
var FASES = { contratado: 'Petição inicial (a ajuizar)', ajuizado: 'Ajuizado (citação)', conciliacao: 'Audiência de conciliação',
  andamento: 'Em andamento (defesa e réplica)', pericia: 'Perícia', instrucao: 'Audiência de instrução', sentenca: 'Sentença',
  acordo: 'Acordo', homologacao: 'Homologação', recurso: 'Recurso', execucao: 'Execução / cumprimento', extinto: 'Encerrado / arquivado' };
var ORDEM_FASE = { contratado: 1, ajuizado: 2, conciliacao: 3, andamento: 4, pericia: 5, instrucao: 6, sentenca: 7, acordo: 7, homologacao: 8, recurso: 8, execucao: 9, extinto: 10 };
/** A etapa nova vale? Só para a frente (acordo, execução e encerramento podem vir a qualquer hora). */
function avancaFase_(atual, nova) {
  if (!nova || nova === atual) return false;
  if (!atual || !ORDEM_FASE[atual]) return true;
  if (/^(acordo|homologacao|execucao|extinto)$/.test(nova)) return true;
  if (atual === 'extinto') return false; // reabrir arquivado só com "desarquivamento" (atualizarMovimento_)
  if (nova === 'conciliacao') return ORDEM_FASE[atual] <= ORDEM_FASE.andamento; // audiência marcada no meio do andamento: volta a ser a etapa atual
  return ORDEM_FASE[nova] > ORDEM_FASE[atual];
}
/** Fase guardada ou, nos processos antigos sem fase, a calculada pela situação e pela última movimentação. */
function faseDe_(p) {
  if (p.fase && FASES[p.fase]) return p.fase;
  if (p.status === 'arquivado') return 'extinto';
  if (!p.numero) return 'contratado';
  return faseDoMovimento_(p.ultimo_movimento) || 'andamento';
}
function faseDoMovimento_(mov) {
  var t = normalizar_(mov || '');
  if (!t) return '';
  if (/desarquiv/.test(t)) return 'andamento';
  if (/arquivad|arquivamento|baixa definitiva|extint|remetidos? os autos .*arquivo/.test(t)) return 'extinto';
  if (/homologa/.test(t)) return 'homologacao';
  if (/acordo/.test(t) && !/acordao/.test(t)) return 'acordo';
  if (/cumprimento de sentenca|execucao|penhora|sisbajud|bacenjud|renajud|alvara|requisicao de pequeno valor|\brpv\b|precatorio/.test(t)) return 'execucao';
  if (/recurso|apelac|agravo|acordao|embargos de declaracao|contrarraz|remetidos? os autos .*(tribunal|instancia|turma|tst|stj)|2o grau|\(2º grau\)/.test(t)) return 'recurso';
  if (/audiencia/.test(t) && /instrucao/.test(t) && !/realizada|cancelad/.test(t)) return 'instrucao';
  if (/(pericia|perito|pericial)/.test(t) && /(designad|nomead|agendad|marcad|data)/.test(t)) return 'pericia';
  if ((/audiencia/.test(t) && /(conciliacao|mediacao|inicial|\buna\b)/.test(t) || /cejusc/.test(t)) && /(designad|redesignad|marcad|agendad|pauta)/.test(t)) return 'conciliacao';
  if (/sentenca|julgad[oa] (im)?procedente|procedencia|improcedencia|julgamento/.test(t)) return 'sentenca';
  if (/distribuid|peticionamento|protocolad|citacao|citad[oa]|mandado de citacao/.test(t)) return 'ajuizado';
  return 'andamento';
}

function atualizarMovimento_(tab, proc, mov, quando) {
  if (!mov || !quando) return;
  if (proc.ultimo_movimento_em && quando < proc.ultimo_movimento_em) return;
  var m = { ultimo_movimento: String(mov).slice(0, 200), ultimo_movimento_em: quando };
  if (proc.fase_auto !== 'nao') {
    var f = faseDoMovimento_(mov);
    // a etapa só anda para a frente: "juntada", "conclusão" etc. não tiram o processo de uma etapa mais adiantada
    if (f && (avancaFase_(proc.fase, f) || (proc.fase === 'extinto' && /desarquiv/.test(normalizar_(mov))))) m.fase = f;
  }
  var st = statusPeloMovimento_(mov);
  if (st === 'arquivado' && proc.status !== 'arquivado') m.status = 'arquivado';
  else if (proc.status === 'arquivado' && st !== 'arquivado' && !/decorrid|certid|juntad|baixa|transit/.test(normalizar_(mov))) m.status = 'ativo';
  atualizarLinha_(tab, proc, m);
}

/**
 * Prazos que ficaram "a definir" (versões antigas do robô): define agora pelo tipo de ato.
 * Roda no configurar e em toda execução do robô.
 */
function definirPendentes_(ctx) {
  var tabZ = ctx ? ctx.prazos : tabela_('Prazos');
  var intims = {};
  (ctx ? ctx.intim : tabela_('Intimacoes')).linhas.forEach(function (i) { intims[i.id] = i; });
  var procs = {};
  (ctx ? ctx.procs : tabela_('Processos')).linhas.forEach(function (p) { procs[p.id] = p; });
  var feriados = ctx ? ctx.feriados : mapaFeriados_();
  var n = 0;
  tabZ.linhas.forEach(function (z) {
    if (z.situacao !== 'a definir' || +z.dias || /^ato:/.test(z.observacoes || '')) return;
    var i = intims[z.intimacao_id] || {};
    var proc = procs[z.processo_id] || { numero: z.numero };
    var tribunal = proc.tribunal || tribunalDoNumero_(z.numero);
    var sug = sugerirPrazo_([i.movimento, i.texto, z.observacoes].join(' '), proc, tribunal, /2º grau/.test(i.movimento || ''));
    var fatal = calcularFatal_(z.ciencia || hojeSP_(), sug.dias, sug.contagem, tribunal, feriados);
    atualizarLinha_(tabZ, z, { dias: String(sug.dias), contagem: sug.contagem, descricao: sug.descricao, situacao: 'calculado', fatal: fatal,
      observacoes: (z.observacoes ? z.observacoes + ' | ' : '') + 'Prazo definido automaticamente em ' + dataBR_(hojeSP_()) + ' pelo tipo de ato: conferir.',
      atualizado_em: new Date().toISOString(), atualizado_por: 'robô' });
    n++;
  });
  if (!ctx && n) registrar_('sistema', 'prazos definidos', n + ' prazos que estavam sem data');
  return n;
}

/* ---------- Histórico do Gmail: processos antigos, arquivados e baixados ---------- */

/**
 * Lê os avisos antigos do eproc e do PJe (do mais novo para o mais antigo) e cadastra os processos
 * que ainda não estão no painel, com a última movimentação e a situação (ativo ou arquivado).
 * Continua de onde parou em cada execução até chegar ao começo da caixa de entrada.
 */
/*
 * Cota do Gmail: o Google limita quantas vezes por dia o script lê o Gmail. A leitura dos avisos NOVOS (robô)
 * tem prioridade; o histórico antigo e a classificação de áreas usam no máximo GMAIL_EXTRA_DIA leituras por dia
 * e param no dia em que o Google avisar "chamado muitas vezes".
 */
var GMAIL_EXTRA_DIA = 250;
function gmailExtraRestante_() {
  var hoje = hojeSP_();
  if (config_('GMAIL_ESGOTADO_EM') === hoje) return 0;
  var p = String(config_('GMAIL_EXTRA_USO') || '').split('|');
  return Math.max(0, GMAIL_EXTRA_DIA - (p[0] === hoje ? parseInt(p[1], 10) || 0 : 0));
}
function gmailExtraUsar_(n) {
  if (!n) return;
  var hoje = hojeSP_(), p = String(config_('GMAIL_EXTRA_USO') || '').split('|');
  setConfig_('GMAIL_EXTRA_USO', hoje + '|' + ((p[0] === hoje ? parseInt(p[1], 10) || 0 : 0) + n), 'Leituras extras do Gmail hoje (histórico e áreas)');
}
/** Se o erro for de cota do Gmail, anota para as leituras extras pararem hoje. */
function gmailEsgotado_(e) {
  if (!/muitas vezes|too many times|limit exceeded/i.test(String((e && e.message) || e))) return false;
  setConfig_('GMAIL_ESGOTADO_EM', hojeSP_(), 'Dia em que o Google avisou que a cota do Gmail acabou');
  return true;
}

// Antes de continuar o histórico geral, lê do começo ao fim os avisos dos tribunais que o robô não lia (TJRS, TRT2/4/9, TRF3, TJSP…).
var BUSCA_OUTROS_TRIBUNAIS = 'from:jus.br -from:(tjsc.jus.br OR jfsc.jus.br OR trf4.jus.br OR trt12.jus.br OR trt6.jus.br OR trt16.jus.br)';
function importarHistoricoGmail_(limiteMs) {
  var fase2 = config_('HIST2_GMAIL_FIM') !== 'sim';
  var chaveAte = fase2 ? 'HIST2_GMAIL_ATE' : 'HIST_GMAIL_ATE', chaveFim = fase2 ? 'HIST2_GMAIL_FIM' : 'HIST_GMAIL_FIM';
  if (!fase2 && config_('HIST_GMAIL_FIM') === 'sim') return { novos: 0, fim: true };
  var cota = gmailExtraRestante_();
  if (!cota) return { novos: 0, lidas: 0, fim: false, cota: true };
  var t0 = Date.now();
  if (limiteMs === undefined) limiteMs = 200000;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { novos: 0 };
  var ctx, novos = 0, lidas = 0, cursor = parseInt(config_(chaveAte), 10) || Date.now(), fim = false;
  try {
    ctx = contextoRobo_();
    ctx.procs.adiar = true;
    var antes = Object.keys(ctx.porNumero).length;
    try {
    while (Date.now() - t0 < limiteMs && lidas < cota) {
      var q = (fase2 ? BUSCA_OUTROS_TRIBUNAIS : BUSCA_TRIBUNAIS) + ' before:' + Math.floor(cursor / 1000);
      var threads = GmailApp.search(q, 0, 50);
      if (!threads.length) { fim = true; break; }
      var msgs = [];
      threads.forEach(function (th) { th.getMessages().forEach(function (m) { if (m.getDate().getTime() < cursor) msgs.push(m); }); });
      msgs.sort(function (a, b) { return b.getDate().getTime() - a.getDate().getTime(); });
      if (!msgs.length) { cursor -= 1000; continue; }
      for (var i = 0; i < msgs.length && Date.now() - t0 < limiteMs && lidas < cota; i++) {
        var msg = msgs[i];
        var itens = lerAvisoTribunal_(msg);
        itens.forEach(function (it) {
          var existia = !!ctx.porNumero[it.numero];
          var proc = processoDoNumero_(ctx, it.numero, it.tribunal, it.sistema, it.nomes, it.partes);
          if (!existia) {
            proc.origem = 'histórico Gmail';
            proc.observacoes = 'Encontrado no histórico de avisos do Gmail (' + dataBR_(dataSP_(msg.getDate())) + '). Conferir.';
          }
          atualizarMovimento_(ctx.procs, proc, it.movimento, it.recebido_em);
        });
        lidas++;
        cursor = msg.getDate().getTime();
      }
    }
    } catch (eG) { if (!gmailEsgotado_(eG)) throw eG; }
    gmailExtraUsar_(lidas + 1);
    regravarMudadas_(ctx.procs);
    gravarLote_(ctx.procs);
    novos = Object.keys(ctx.porNumero).length - antes;
    setConfig_(chaveAte, String(cursor), 'Histórico do Gmail lido até esta data (ms), do mais novo para o mais antigo' + (fase2 ? ' (outros tribunais)' : ''));
    if (fim) setConfig_(chaveFim, 'sim', 'Histórico do Gmail lido por completo' + (fase2 ? ' (outros tribunais)' : ''));
    registrar_('sistema', 'histórico do Gmail', lidas + ' avisos lidos, ' + novos + ' processos novos' + (fim ? ' (fim do histórico)' : ' (continua na próxima rodada)'));
  } finally {
    lock.releaseLock();
  }
  return { novos: novos, lidas: lidas, fim: fim };
}

/** Menu: continua a busca de processos antigos no Gmail. */
function buscarProcessosAntigos() {
  var r = importarHistoricoGmail_(300000);
  aviso_(r.fim ? 'Histórico do Gmail lido até o fim. ' + r.novos + ' processos novos nesta rodada.' : r.lidas + ' avisos lidos, ' + r.novos + ' processos novos. Rode de novo para continuar (o robô também continua sozinho).');
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

/** Confere se os gatilhos (robô de 6 em 6 horas e cópia de segurança diária) existem; se sumiram, recria. */
function garantirGatilho_() {
  var nomes = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var faltava = false;
  if (nomes.indexOf('rodarRoboGatilho') < 0) {
    ScriptApp.newTrigger('rodarRoboGatilho').timeBased().everyHours(6).create();
    registrar_('sistema', 'robô religado', 'o gatilho de 6 em 6 horas não existia e foi criado de novo');
    faltava = true;
  }
  if (nomes.indexOf('backupDiario') < 0) {
    ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
    registrar_('sistema', 'cópia de segurança ligada', 'todo dia por volta das 3h');
  }
  if (nomes.indexOf('roboRapidoGatilho') < 0) {
    ScriptApp.newTrigger('roboRapidoGatilho').timeBased().everyHours(1).create();
    registrar_('sistema', 'robô de hora em hora ligado', 'lê os avisos novos do Gmail a cada hora');
  }
  if (nomes.indexOf('resumoDiarioGatilho') < 0) {
    ScriptApp.newTrigger('resumoDiarioGatilho').timeBased().everyDays(1).atHour(7).inTimezone(TZ).create();
    registrar_('sistema', 'resumo por e-mail ligado', 'dias úteis, por volta das 7h');
  }
  if (nomes.indexOf('andamentosGatilho') < 0) {
    ScriptApp.newTrigger('andamentosGatilho').timeBased().everyHours(4).create();
    registrar_('sistema', 'andamentos (DataJud) ligado', 'de 4 em 4 horas');
  }
  if (nomes.indexOf('aquecerGatilho') < 0) {
    try {
      ScriptApp.newTrigger('aquecerGatilho').timeBased().everyMinutes(10).create();
      registrar_('sistema', 'robô da velocidade ligado', 'deixa as listas prontas de 10 em 10 minutos');
    } catch (eQ) { /* sem permissão agora: tenta no próximo login */ }
  }
  return faltava;
}

/** Quadro "Segurança dos dados" (só administrador). */
function estadoSeguranca_() {
  var r = { backup: config_('BACKUP_ULTIMO'), backupUrl: '', backupRecente: false, planilhaPrivada: true, compartilhadaCom: [], falhasRecentes: 0 };
  r.backupRecente = !!r.backup && Date.now() - Date.parse(r.backup) < 2 * 86400000;
  if (config_('PASTA_BACKUPS_ID')) r.backupUrl = 'https://drive.google.com/drive/folders/' + config_('PASTA_BACKUPS_ID');
  try {
    var f = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
    var dono = Session.getEffectiveUser().getEmail();
    f.getEditors().concat(f.getViewers()).forEach(function (p) { var e = p.getEmail(); if (e && e !== dono) r.compartilhadaCom.push(e); });
    if (f.getSharingAccess() !== DriveApp.Access.PRIVATE) r.compartilhadaCom.push('qualquer pessoa com o link');
    r.planilhaPrivada = !r.compartilhadaCom.length;
  } catch (e) { /* sem como conferir */ }
  var desde = new Date(Date.now() - 7 * 86400000).toISOString();
  try {
    r.falhasRecentes = tabela_('Log').linhas.filter(function (l) { return l.acao === 'login recusado' && l.quando >= desde; }).length;
  } catch (e) { /* sem log */ }
  return r;
}

/* ---------- Cópia de segurança ---------- */

var BACKUPS_MANTER = 30; // dias de cópias guardadas

function pastaBackups_() {
  var id = config_('PASTA_BACKUPS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  var pai = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  var base = pai.hasNext() ? pai.next() : DriveApp.getRootFolder();
  var pasta = base.createFolder('BACKUPS DO PAINEL (não compartilhar)');
  setConfig_('PASTA_BACKUPS_ID', pasta.getId(), 'Pasta das cópias de segurança diárias da planilha');
  return pasta;
}

/**
 * Gatilho diário: copia a planilha inteira para a pasta de backups e apaga as cópias com mais de 30 dias.
 * Se algo der errado no painel, basta abrir a cópia do dia anterior.
 */
function backupDiario() {
  var hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var pasta = pastaBackups_();
  var nome = 'BACKUP PAINEL ' + hoje;
  if (pasta.getFilesByName(nome).hasNext()) return 'Já existe a cópia de hoje.';
  DriveApp.getFileById(SpreadsheetApp.getActive().getId()).makeCopy(nome, pasta);
  var limite = Date.now() - BACKUPS_MANTER * 86400000, apagadas = 0;
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^BACKUP PAINEL \d{4}-\d{2}-\d{2}$/.test(f.getName()) && f.getDateCreated().getTime() < limite) { f.setTrashed(true); apagadas++; }
  }
  setConfig_('BACKUP_ULTIMO', new Date().toISOString(), 'Última cópia de segurança da planilha');
  registrar_('sistema', 'cópia de segurança', nome + (apagadas ? ' (' + apagadas + ' antigas na lixeira)' : ''));
  return nome;
}

/**
 * Protege as abas contra edição acidental direto na planilha: quem tentar editar recebe um aviso.
 * O painel continua gravando normalmente (o programa roda como dona da planilha).
 */
function protegerAbas_() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(ESQUEMA).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) return;
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
    sh.protect().setDescription('Dados do painel: edite pelo painel, não direto aqui').setWarningOnly(true);
  });
}

/** Última e próxima leitura do robô e se ele está atrasado. */
function estadoRobo_() {
  var ultima = config_('ROBO_ULTIMA_EXECUCAO');
  var r = { ultima: ultima, resultado: config_('ROBO_ULTIMO_RESULTADO'), proxima: '', atrasado: false,
    djen: { ultima: config_('DJEN_NAVEGADOR_ULTIMA') || '', erro: config_('DJEN_NAVEGADOR_ERRO') || '' } };
  try { var ex = estadoExtras_(); r.datajud = ex.datajud; r.ia = ex.ia; r.email = ex.email; r.alertas = ex.alertas; r.versao = ex.versao; } catch (e) { /* segue */ }
  if (ultima) {
    var t = Date.parse(ultima);
    r.proxima = new Date(t + 3600000).toISOString();
    r.atrasado = Date.now() - t > 2.5 * 3600000;
  }
  return r;
}

function rodarRoboGatilho() {
  // Se o código novo foi colado mas a importação do GEA ainda não rodou, ela roda aqui sozinha.
  var t0 = Date.now();
  importarGEASeguro_(false);
  if (Date.now() - t0 > 90 * 1000) return; // a importação demorou; o robô lê os avisos na próxima rodada
  rodarRobo_('robô (6 em 6 h)');
  // processos ainda sem área: classifica pelos avisos do Gmail no tempo que sobrar
  var resta = 300000 - (Date.now() - t0);
  if (resta > 60000) { try { classificarAreas_(Math.min(resta - 30000, 120000)); } catch (e) { /* tenta na próxima */ } }
  resta = 300000 - (Date.now() - t0);
  if (resta > 60000) { try { importarHistoricoGmail_(resta - 30000); } catch (e) { /* tenta na próxima */ } }
  resta = 300000 - (Date.now() - t0);
  if (resta > 45000) { try { resumirIntimacoes_(Math.min(resta - 30000, 90000), 30); } catch (e) { setConfig_('IA_ERRO', String(e.message || e), 'Último problema do resumo por IA'); } }
  resta = 300000 - (Date.now() - t0);
  if (resta > 40000) { try { resumirProvisoriosIA_(Math.min(resta - 25000, 60000), 10); } catch (e) { setConfig_('IA_ERRO', String(e.message || e), 'Último problema do resumo por IA'); } }
}
function rodarRoboMenu() { aviso_(rodarRobo_('menu').resumo); }

function rodarRobo_(quem) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw falha_('O robô já está rodando. Tente de novo em 1 minuto.');
  var ctx, erros = [], novas = 0, prazosNovos = 0;
  TRAVA_NIVEL_ = 1; // o robô já segura a trava: o que ele chama (baixa do PIX, recibo) não trava de novo
  try {
    ctx = contextoRobo_();
    try { var g = lerGmail_(ctx); novas += g.intimacoes; prazosNovos += g.prazos; setConfig_('ROBO_GMAIL_OK', new Date().toISOString(), 'Última leitura do Gmail sem erro'); }
    catch (e) { erros.push(gmailEsgotado_(e) ? 'Gmail: o Google limitou as leituras de hoje; os avisos que faltaram entram na próxima rodada' : 'Gmail: ' + (e.message || e)); }
    var djenNav = config_('DJEN_NAVEGADOR_ULTIMA');
    var navRecente = djenNav && (Date.now() - new Date(djenNav).getTime()) < 36 * 3600000;
    try { if (!ctx.gmailParcial && !navRecente) { var j = lerDjen_(ctx); novas += j.intimacoes; prazosNovos += j.prazos; } }
    catch (e2) { erros.push('DJEN pelo servidor: ' + (e2.message || e2) + ' — abra o painel no computador do escritório para ler o DJEN'); }
    try { var ag = varrerAgenda_(ctx, 60000); if (ag.marcados) prazosNovos += ag.marcados; } catch (eA) { erros.push('Agenda: ' + (eA.message || eA)); }
    try { lembrarAudiencias_(ctx); } catch (eL) { erros.push('Lembretes de audiência: ' + (eL.message || eL)); }
    try { if (!ctx.gmailParcial && Date.now() - ctx.inicio < 200000) lerPix_(Math.min(90000, 260000 - (Date.now() - ctx.inicio))); } catch (eX) { erros.push('Robô do PIX: ' + (eX.message || eX)); }
    definirPendentes_(ctx);
    recalcularPrazosAbertos_(ctx);
    try { ctx.prazos.adiar = true; atribuirResponsaveis_(ctx.prazos, ctx.procs); regravarMudadas_(ctx.prazos); } catch (e3) { ctx.prazos.adiar = false; }
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
    TRAVA_NIVEL_ = 0;
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
function processoDoNumero_(ctx, numero, tribunal, sistema, nomesCliente, partes) {
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
  completarPorPartes_(ctx.procs, p, partes);
  return p;
}

/** Preenche área, polo e parte contrária vazios a partir das partes do aviso. */
function completarPorPartes_(tab, p, partes) {
  if (!partes) return false;
  var m = {};
  if (!p.area) { var a = inferirArea_(p.numero, p.tribunal, partes); if (a) m.area = a; }
  if (!p.parte_contraria && partes.outros.length) m.parte_contraria = partes.outros.slice(0, 3).join('; ').slice(0, 200);
  if (!p.polo && partes.nossoPapel) m.polo = partes.nossoPapel.toLowerCase();
  if (!Object.keys(m).length) return false;
  if (m.area) m.observacoes = (p.observacoes ? p.observacoes + ' | ' : '') + 'Área definida pelo sistema pelas partes do aviso: conferir.';
  m.atualizado_em = new Date().toISOString(); m.atualizado_por = 'robô';
  atualizarLinha_(tab, p, m);
  return !!m.area;
}

/**
 * Lê no Gmail o último aviso de cada processo sem área e classifica (uma vez; depois o robô faz sozinho).
 * Limite de 3 minutos; o que sobrar fica para a próxima execução.
 */
/** Área pelo nome da vara/câmara ("1ª Vara Criminal", "6ª Câmara de Direito Civil", "Vara da Família"…). */
function areaPeloOrgao_(t) {
  t = normalizar_(t);
  if (!t.trim()) return '';
  if (/criminal|crime|penal|juri|violencia domestica/.test(t)) return 'Criminal';
  if (/familia|sucess|orfaos/.test(t)) return 'Família';
  if (/fazenda|execucao fiscal/.test(t)) return 'Cível';
  if (/trabalho/.test(t)) return 'Trabalhista';
  if (/federal|jef\b|previdenci/.test(t)) return 'Federal';
  if (/civel|civeis|direito civil|juizado especial|jec\b/.test(t)) return 'Cível';
  return '';
}

function classificarAreas_(limiteMs) {
  var t0 = Date.now();
  if (limiteMs === undefined) limiteMs = 180000;
  var tab = tabela_('Processos');
  tab.adiar = true;
  var feitos = 0, olhados = 0, cota = gmailExtraRestante_(), parou = false;
  // nome da vara nos avisos já lidos (sem gastar Gmail)
  var orgaos = {};
  try { tabela_('Intimacoes').linhas.forEach(function (i) { orgaos[i.numero] = (orgaos[i.numero] || '') + ' ' + (i.movimento || ''); }); } catch (e) { /* sem aba */ }
  tab.linhas.forEach(function (p) {
    if (Date.now() - t0 > limiteMs || parou) return;
    if (p.area || !p.numero) return;
    var tribunal = p.tribunal || tribunalDoNumero_(p.numero);
    if (/^(TRT|TST)/.test(tribunal) || /\.5\.\d{2}\.\d{4}$/.test(p.numero)) { atualizarLinha_(tab, p, { area: 'Trabalhista' }); feitos++; return; }
    var pelaVara = areaPeloOrgao_((p.orgao || '') + ' ' + (orgaos[p.numero] || ''));
    if (pelaVara) { atualizarLinha_(tab, p, { area: pelaVara }); feitos++; return; }
    if (/^TRF/.test(tribunal)) { atualizarLinha_(tab, p, { area: 'Federal' }); feitos++; return; }
    if (olhados >= cota) return;
    olhados++;
    var th;
    try { th = GmailApp.search('"' + p.numero + '" from:(tjsc.jus.br OR jfsc.jus.br OR trf4.jus.br)', 0, 3); }
    catch (eG) { if (gmailEsgotado_(eG)) { parou = true; return; } throw eG; }
    var info = null;
    th.some(function (t) {
      return t.getMessages().reverse().some(function (msg) {
        var corpo = msg.getPlainBody() || '';
        return corpo.split(/-{10,}/).some(function (b) {
          if (b.indexOf(p.numero) < 0 || !/Partes:/i.test(b)) return false;
          info = partesEproc_(b); return true;
        });
      });
    });
    if (!info && /^TRF/.test(tribunal)) info = { papeis: [], nossos: [], outros: [], outrasPartes: [] };
    if (info && completarPorPartes_(tab, p, info)) feitos++;
  });
  regravarMudadas_(tab);
  gmailExtraUsar_(olhados);
  if (feitos) registrar_('sistema', 'áreas classificadas', feitos + ' processos (' + olhados + ' avisos consultados no Gmail)');
  return feitos;
}

/**
 * Registra uma intimação e, se ela abre prazo, cria ou atualiza o prazo.
 * dados: { fonte, chave, recebido_em, numero, tribunal, sistema, movimento, evento, texto, nomes, tipo, ciencia, ciencia_tipo }
 */
function registrarIntimacao_(ctx, d) {
  if (ctx.chaves[d.chave]) return { nova: false, prazo: false };
  ctx.chaves[d.chave] = true;
  var proc = processoDoNumero_(ctx, d.numero, d.tribunal, d.sistema, d.nomes, d.partes);
  var agora = new Date().toISOString();
  var intim = {
    id: novoId_('I'), chave: d.chave, fonte: d.fonte, recebido_em: d.recebido_em, numero: d.numero, tribunal: proc.tribunal,
    movimento: d.movimento, evento: d.evento || '', texto: String(d.texto || '').slice(0, 4000),
    partes_cliente: (d.nomes || []).join('; '), processo_id: proc.id, prazo_id: '', criado_em: agora
  };
  inserirLinha_(ctx.intim, intim);
  atualizarMovimento_(ctx.procs, proc, d.movimento, d.recebido_em);
  var marcado = detectarAudienciaPericia_(ctx, d, proc, intim);
  if (!d.tipo) return { nova: true, prazo: marcado };

  // Confirmação de uma intimação já lançada como tácita: antecipa a ciência.
  var aberto = ctx.prazos.linhas.filter(function (z) {
    return z.numero === d.numero && z.origem === 'robô' && z.situacao !== 'conferido' && !/^ato:/.test(z.observacoes || '') &&
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
    fatal: '', situacao: 'calculado', conferido_por: '', conferido_em: '', origem: 'robô',
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
  // in:anywhere -in:trash: também lê aviso que caiu no SPAM; e lê TODAS as páginas (antes, só as 300 conversas mais novas)
  var q = BUSCA_TRIBUNAIS + ' in:anywhere -in:trash after:' + Math.floor(desde / 1000);
  var threads = [];
  for (var ini = 0; ini < 3000; ini += 100) {
    var pagina = GmailApp.search(q, ini, 100);
    threads = threads.concat(pagina);
    if (pagina.length < 100) break;
  }
  var msgs = [];
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) { if (msg.getDate().getTime() > desde) msgs.push(msg); });
  });
  msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
  var ate = desde, intimacoes = 0, prazos = 0;
  for (var i = 0; i < msgs.length; i++) {
    if (Date.now() - ctx.inicio > 240000) { ctx.gmailParcial = true; break; } // 4 min: para com folga antes dos 6 do Google
    var msg = msgs[i];
    var itens = lerAvisoTribunal_(msg);
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
  var fonte = /jfsc|trf4/i.test(msg.getFrom()) ? 'eproc JFSC' : /tjrs/i.test(msg.getFrom()) ? 'eproc TJRS' : /jfrs|jfpr/i.test(msg.getFrom()) ? 'eproc JF' : 'eproc TJSC';
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
      numero: mN[1], tribunal: tribunalDoNumero_(mN[1]) || (fonte === 'eproc JFSC' ? 'TRF4' : fonte === 'eproc TJRS' ? 'TJRS' : 'TJSC'), sistema: 'eproc',
      movimento: mov + (segundoGrau ? ' (2º grau)' : ''), evento: evento, texto: '', nomes: nomesDoCliente_(bloco), tipo: tipo, segundoGrau: segundoGrau,
      partes: partesEproc_(bloco),
      ciencia: tipo === 'expedida' ? somarDias_(data, 10) : data,
      ciencia_tipo: tipo === 'expedida' ? 'tácita: 10 dias após a expedição (' + dataBR_(data) + ')' : 'confirmada em ' + dataBR_(data)
    });
  });
  return itens;
}

/* ---------- Área do processo pelas partes do aviso ---------- */

var PAPEIS_CRIMINAIS = /^(INDICIADO|ACUSADO|DENUNCIADO|AUTOR FATO|AUTOR DO FATO|AUTORID\.? POL\.?|AUTORIDADE POLICIAL|QUERELANTE|QUERELADO|VITIMA|REU PRESO|CONDENADO|APENADO|SENTENCIADO|AVERIGUADO|FLAGRANTEADO|INVESTIGADO|CUSTODIADO|PRESO|PACIENTE)$/;
var PAPEIS_FAMILIA = /^(ALIMENTANDO|ALIMENTANTE|INVENTARIANTE|INVENTARIADO|HERDEIRO|CURATELADO|INTERDITANDO|INTERDITADO|CURADOR|DIVORCIANDO|GENITOR|GENITORA)$/;

/** Lê o bloco "Partes:" do aviso do eproc: papéis, nossos clientes e a parte contrária. */
function partesEproc_(bloco) {
  var linhas = bloco.split(/\n|\|/).map(function (s) { return s.replace(/\*/g, '').trim(); }).filter(String);
  var ini = -1;
  linhas.forEach(function (l, i) { if (ini < 0 && /^Partes:?$/i.test(l)) ini = i; });
  var r = { papeis: [], nossos: [], outros: [], outrasPartes: [], nossoPapel: '' };
  if (ini < 0) return r;
  var lado = 0, papel = '', grupo = [], grupos = [[], []], papeisLado = ['', ''];
  for (var i = ini + 1; i < linhas.length; i++) {
    var l = linhas[i];
    if (/^ATEN[ÇC][ÃA]O/i.test(l)) break;
    var n = normalizar_(l).toUpperCase();
    if (n === 'X') { lado = 1; continue; }
    if (n === 'OUTRAS PARTES') { lado = 2; continue; }
    if (/^ADVOGAD/.test(n)) {
      if (/54832/.test(l) && lado < 2) grupos[lado].nosso = true;
      continue;
    }
    if (lado < 2 && /^[A-Z. ]{3,30}$/.test(n) && n === n.toUpperCase() && !/\s{2}/.test(n) && n.split(' ').length <= 3 &&
        (PAPEIS_CRIMINAIS.test(n) || PAPEIS_FAMILIA.test(n) || /^(AUTOR|AUTORA|REU|RE|REQUERENTE|REQUERIDO|REQUERIDA|EXEQUENTE|EXECUTADO|EXECUTADA|APELANTE|APELADO|APELADA|AGRAVANTE|AGRAVADO|AGRAVADA|EMBARGANTE|EMBARGADO|RECORRENTE|RECORRIDO|RECLAMANTE|RECLAMADO|IMPETRANTE|IMPETRADO|INTERESSADO|EXCIPIENTE|EXCEPTO|DEPRECANTE|DEPRECADO|TERCEIRO)$/.test(n))) {
      if (r.papeis.indexOf(n) < 0) r.papeis.push(n);
      if (!papeisLado[lado]) papeisLado[lado] = n;
      continue;
    }
    if (lado === 2) r.outrasPartes.push(l); else grupos[lado].push(l);
  }
  var nosso = grupos[1].nosso && !grupos[0].nosso ? 1 : 0;
  r.nossos = grupos[nosso]; r.outros = grupos[1 - nosso]; r.nossoPapel = papeisLado[nosso];
  return r;
}

function sobrenomes_(nome) {
  var t = tokensNome_(nome, false);
  return t.length > 1 ? t.slice(1).filter(function (w) { return w.length > 3 && ['silva', 'souza', 'sousa', 'santos', 'oliveira', 'pereira', 'junior', 'neto', 'filho'].indexOf(w) < 0; }) : [];
}

/** Área do processo a partir do tribunal e das partes. Devolve '' quando não dá para saber. */
function inferirArea_(numero, tribunal, info) {
  tribunal = tribunal || tribunalDoNumero_(numero);
  if (/^TRT/.test(tribunal)) return 'Trabalhista';
  info = info || { papeis: [], nossos: [], outros: [], outrasPartes: [] };
  var todas = normalizar_(info.nossos.concat(info.outros, info.outrasPartes).join(' ')).toUpperCase();
  if (info.papeis.some(function (p) { return PAPEIS_CRIMINAIS.test(p); }) || /POLICIA (CIVIL|MILITAR|FEDERAL)|PRESIDIO|PENITENCIARI/.test(todas)) return 'Criminal';
  if (/INSTITUTO NACIONAL DO SEGURO SOCIAL|\bINSS\b/.test(todas)) return 'Previdenciário';
  if (/^TRF/.test(tribunal)) return 'Federal';
  if (!info.papeis.length && !info.nossos.length) return '';
  if (info.papeis.some(function (p) { return PAPEIS_FAMILIA.test(p); })) return 'Família';
  // mesmo sobrenome dos dois lados (alimentos, divórcio, guarda) ou Ministério Público como fiscal
  var nossosS = {}, comum = false;
  info.nossos.forEach(function (n) { sobrenomes_(n).forEach(function (w) { nossosS[w] = true; }); });
  info.outros.forEach(function (n) { sobrenomes_(n).forEach(function (w) { if (nossosS[w]) comum = true; }); });
  var pj = /\b(LTDA|S\.?A\.?|BANCO|EIRELI|MUNICIPIO|ESTADO DE|UNIAO|SEGURADORA|ASSOCIACAO|COOPERATIVA|FUNDO)\b/;
  var outroPJ = info.outros.some(function (n) { return pj.test(normalizar_(n).toUpperCase()); });
  if (!outroPJ && (comum || info.outrasPartes.some(function (n) { return /MINISTERIO PUBLICO/.test(normalizar_(n).toUpperCase()); }))) return 'Família';
  if (outroPJ && /BANCO|S\.?A\.?|SEGURADORA|FINANCI|CARTAO|TELECOM|ENERGIA|CELESC|CASAN/.test(normalizar_(info.outros.join(' ')).toUpperCase()) &&
      /^(AUTOR|AUTORA|REQUERENTE|EXEQUENTE|RE|REU|EXECUTADO)$/.test(info.nossoPapel)) return 'Consumidor';
  return 'Cível';
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
    if (/^:\d/.test(mov)) continue;
    if (/documento sigiloso/i.test(mov)) { // registra a movimentação (sem prazo): fica visível e atualiza o processo
      itens.push({ fonte: 'PJe ' + tribunal, chave: 'pje|' + numero + '|' + data + '|' + mov + '|' + mE.index, recebido_em: msg.getDate().toISOString(),
        numero: numero, tribunal: tribunal, sistema: 'PJe', movimento: 'Documento sigiloso (ver no PJe)' + (orgao ? ' — ' + orgao : ''), evento: '',
        texto: '', nomes: nomes, tipo: '', ciencia: data, ciencia_tipo: '' });
      continue;
    }
    var intimacao = /intima[çc][ãa]o/i.test(mov) && /expedid/i.test(mov);
    var paraNos = !nomes.length || nomes.some(function (n) { return normalizar_(mov).indexOf(normalizar_(n)) >= 0; });
    itens.push({
      fonte: 'PJe ' + tribunal, chave: 'pje|' + numero + '|' + data + '|' + mov, recebido_em: msg.getDate().toISOString(),
      numero: numero, tribunal: tribunal, sistema: 'PJe', movimento: mov + (orgao ? ' — ' + orgao : ''), evento: '',
      texto: '', nomes: nomes, tipo: intimacao && paraNos ? 'expedida' : '',
      ciencia: somarDias_(data, 10), ciencia_tipo: 'tácita: 10 dias após a expedição (' + dataBR_(data) + ')'
    });
  }
  // "Notificação de Documento Anexado": o PJe manda o documento em PDF (muitas vezes a notificação inicial ou a citação).
  // Sem lista de eventos: entra como intimação com prazo PROVISÓRIO (regra do escritório: na dúvida, o mais curto).
  if (!itens.length && /documento anexado/i.test(msg.getSubject() + ' ' + corpo)) {
    var dia = diaSP_(msg.getDate().toISOString());
    itens.push({ fonte: 'PJe ' + tribunal, chave: 'pje-anexo|' + numero + '|' + msg.getId(), recebido_em: msg.getDate().toISOString(),
      numero: numero, tribunal: tribunal, sistema: 'PJe', movimento: 'Notificação com documento anexado (PDF no e-mail: pode ser notificação inicial ou citação)' + (orgao ? ' — ' + orgao : ''),
      evento: '', texto: 'O PJe enviou o documento em PDF anexo ao e-mail. Abra o PDF no Gmail ou o processo no PJe para ver o ato e o prazo.', nomes: nomes,
      tipo: 'expedida', ciencia: dia, ciencia_tipo: 'notificação recebida por e-mail em ' + dataBR_(dia) + ' (conferir no PJe)' });
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
      var r = registrarItemDjen_(ctx, it, hoje);
      if (r && r.nova) intimacoes++;
      if (r && r.prazo) prazos++;
    });
    if (itens.length < 100) break;
  }
  setConfig_('ROBO_DJEN_DESDE', somarDias_(hoje, -2), 'Data a partir da qual o robô consulta o DJEN');
  return { intimacoes: intimacoes, prazos: prazos };
}

/** Registra uma comunicação do DJEN (vinda do servidor ou do navegador do escritório). */
function registrarItemDjen_(ctx, it, hoje) {
  var numero = it.numeroprocessocommascara || mascaraCnj_(it.numero_processo || it.numeroProcesso || '');
  if (!RE_CNJ.test(numero || '')) return null;
  var disp = String(it.data_disponibilizacao || it.dataDisponibilizacao || hoje).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(disp)) disp = hoje;
  var trib = String(it.siglaTribunal || '').slice(0, 20) || tribunalDoNumero_(numero);
  var publicacao = proximoUtil_(disp, trib, ctx.feriados, true);
  return registrarIntimacao_(ctx, {
    fonte: 'DJEN', chave: 'djen|' + String(it.id || it.hash || (numero + '|' + disp + '|' + String(it.texto || '').slice(0, 40))).slice(0, 120),
    recebido_em: disp + 'T12:00:00.000Z', numero: numero, tribunal: trib, sistema: '',
    movimento: String(it.tipoComunicacao || 'Comunicação').slice(0, 80) + (it.nomeOrgao ? ' — ' + String(it.nomeOrgao).slice(0, 160) : ''),
    texto: String(it.texto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000), nomes: [],
    tipo: /intima/i.test(it.tipoComunicacao || 'intimação') ? 'publicacao' : '',
    ciencia: publicacao, ciencia_tipo: 'publicação no DJEN em ' + dataBR_(publicacao) + ' (disponibilizada ' + dataBR_(disp) + ')'
  });
}

/*
 * DJEN pelo navegador do escritório. A consulta pública do CNJ recusa os servidores do Google (código 403),
 * então o painel aberto no computador do escritório (internet do Brasil) busca as comunicações das OABs
 * cadastradas e manda para cá. O robô do servidor continua tentando a cada 6 h.
 */
function djenConfig_() {
  var hoje = hojeSP_();
  var oabs = advogados_().map(function (a) { return { numero: String(a.oab || '').replace(/\D/g, ''), uf: String(a.uf || 'SC').toUpperCase() }; })
    .filter(function (o) { return o.numero; });
  if (!oabs.length) oabs = [{ numero: OAB_NUMERO, uf: OAB_UF }];
  var vistos = {};
  oabs = oabs.filter(function (o) { var k = o.numero + o.uf; if (vistos[k]) return false; vistos[k] = 1; return true; });
  return { oabs: oabs, desde: config_('DJEN_NAVEGADOR_DESDE') || somarDias_(hoje, -30), hoje: hoje,
    hist: { ate: config_('DJEN_HIST_ATE') || somarDias_(hoje, -30), fim: config_('DJEN_HIST_FIM') === 'sim', limite: DJEN_HIST_LIMITE } };
}

/*
 * Histórico do DJEN: o navegador do escritório volta no tempo, 30 dias por vez, até 2020, e manda só os números dos processos
 * (com vara, partes e a data). Aqui só cadastra o processo que faltar e atualiza a última movimentação: NÃO cria intimação nem prazo.
 */
var DJEN_HIST_LIMITE = '2020-01-01';
function djenHistorico_(d, u) {
  var itens = Array.isArray(d.itens) ? d.itens.slice(0, 600) : [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw falha_('O robô está gravando agora. Tente de novo em 1 minuto.');
  var novos = 0;
  try {
    if (itens.length) {
      var ctx = contextoRobo_();
      ctx.procs.adiar = true;
      var meus = /JULIAN MARCELINO/i;
      itens.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        var numero = String(it.numero || '');
        if (!RE_CNJ.test(numero)) numero = mascaraCnj_(numero);
        if (!numero) return;
        var data = /^\d{4}-\d{2}-\d{2}/.test(it.data || '') ? String(it.data).slice(0, 10) : '';
        var nomes = (Array.isArray(it.nomes) ? it.nomes : []).map(String).filter(function (n) { return n && !meus.test(n); }).slice(0, 6);
        var existia = !!ctx.porNumero[numero];
        var proc = processoDoNumero_(ctx, numero, String(it.tribunal || '').slice(0, 20) || tribunalDoNumero_(numero), '', nomes, null);
        if (!existia) {
          novos++;
          atualizarLinha_(ctx.procs, proc, { origem: 'histórico DJEN', observacoes: 'Encontrado nas publicações antigas do DJEN (' + dataBR_(data) + '). Conferir.' });
        }
        if (!proc.orgao && it.orgao) atualizarLinha_(ctx.procs, proc, { orgao: String(it.orgao).slice(0, 160) });
        if (data) atualizarMovimento_(ctx.procs, proc, String(it.tipo || 'Publicação no DJEN').slice(0, 80) + ' (DJEN)', data + 'T12:00:00.000Z');
      });
      regravarMudadas_(ctx.procs);
      gravarLote_(ctx.procs);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.ate || '')) setConfig_('DJEN_HIST_ATE', d.ate, 'Histórico do DJEN lido até esta data (voltando no tempo)');
    if (d.fim) setConfig_('DJEN_HIST_FIM', 'sim', 'Histórico do DJEN lido até ' + DJEN_HIST_LIMITE);
    if (novos) registrar_(u.usuario, 'histórico do DJEN', novos + ' processo(s) antigo(s) cadastrado(s)');
    return { novos: novos };
  } finally { lock.releaseLock(); }
}

function djenImportar_(d, u) {
  var itens = Array.isArray(d.itens) ? d.itens.slice(0, 300) : [];
  if (d.erro) {
    setConfig_('DJEN_NAVEGADOR_ERRO', String(d.erro).slice(0, 300) + ' (' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ')', 'Último erro do DJEN no navegador');
    return { ok: true };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw falha_('O robô está gravando agora. Tente de novo em 1 minuto.');
  var novas = 0, prazos = 0, hoje = hojeSP_();
  try {
    if (itens.length) {
      var ctx = contextoRobo_();
      itens.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        var limpo = {};
        ['id', 'hash', 'numeroprocessocommascara', 'numero_processo', 'numeroProcesso', 'data_disponibilizacao', 'dataDisponibilizacao',
          'siglaTribunal', 'tipoComunicacao', 'nomeOrgao', 'texto'].forEach(function (k) { if (it[k] !== undefined && it[k] !== null) limpo[k] = String(it[k]); });
        var r = registrarItemDjen_(ctx, limpo, hoje);
        if (r && r.nova) novas++;
        if (r && r.prazo) prazos++;
      });
      definirPendentes_(ctx);
      recalcularPrazosAbertos_(ctx);
      [ctx.procs, ctx.intim, ctx.prazos].forEach(gravarLote_);
    }
    if (d.fim) {
      setConfig_('DJEN_NAVEGADOR_DESDE', somarDias_(hoje, -3), 'Data a partir da qual o navegador consulta o DJEN');
      setConfig_('DJEN_NAVEGADOR_ULTIMA', new Date().toISOString(), 'Última leitura do DJEN pelo navegador do escritório');
      setConfig_('DJEN_NAVEGADOR_ERRO', '', 'Último erro do DJEN no navegador');
    }
    if (novas) registrar_(u.usuario, 'DJEN (navegador)', novas + ' comunicação(ões) nova(s), ' + prazos + ' prazo(s) novo(s)');
    return { novas: novas, prazos: prazos };
  } finally { lock.releaseLock(); }
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
  x.telefone = (prazoPublico_.tel || {})[p.cliente_id] || '';
  x.tribunal = p.tribunal || tribunalDoNumero_(z.numero);
  x.orgao = p.orgao || '';
  x.sistema = p.sistema || '';
  return x;
}

function listarPrazos_(d) {
  var procs = {}, nomes = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  var tel = {};
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; tel[c.id] = c.telefone; });
  prazoPublico_.tel = tel;
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
    if (z.situacao === 'conferido') return { ok: true, repetido: true };
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
    if (z.situacao === nova) return { ok: true, repetido: true };
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
  var lim = Math.min(parseInt(d.limite, 10) || 50, 300);
  var q = normalizar_(d.busca || '');
  var prazos = {}, atos = {};
  tabela_('Prazos').linhas.forEach(function (z) {
    prazos[z.id] = z;
    if (/^ato:/.test(z.observacoes || '') && z.intimacao_id) atos[z.intimacao_id] = { tipo: String(z.observacoes).slice(4).split(' | ')[0], data: z.fatal, prazo_id: z.id };
  });
  var procs = {}, clis = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { clis[c.id] = c; });
  var respIntim = {};
  tabela_('Tarefas').linhas.forEach(function (t) { var m = /\[intim:([^\]]+)\]/.exec(t.descricao || ''); if (m && t.situacao !== 'cancelada') respIntim[m[1]] = t.responsavel; });
  var lista = tabela_('Intimacoes').linhas;
  if (d.abertas) lista = lista.filter(function (i) {
    if (i.terminada_por) return false;
    var z = prazos[i.prazo_id];
    return !(z && (z.situacao === 'cumprido' || z.situacao === 'cancelado'));
  });
  if (q) lista = lista.filter(function (i) { return normalizar_([i.numero, i.movimento, i.partes_cliente, i.fonte, i.texto].join(' ')).indexOf(q) >= 0; });
  var total = lista.length;
  return { total: total, lista: lista.slice()
    .sort(function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; })
    .slice(0, lim)
    .map(function (i) {
      var x = limpar_(i); x.texto = String(x.texto || '').slice(0, 600);
      var z = prazos[i.prazo_id];
      if (z) x.prazo = { id: z.id, fatal: z.fatal, situacao: z.situacao, descricao: String(z.descricao || '').slice(0, 120), responsavel: z.responsavel || '' };
      x.responsavel = (z && z.responsavel) || respIntim[i.id] || '';
      if (atos[i.id]) x.ato = atos[i.id];
      var c = clis[(procs[i.processo_id] || {}).cliente_id];
      if (c) { x.cliente = c.nome; x.telefone = c.telefone || ''; }
      return x;
    }) };
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
    atrasados: lista.filter(function (z) { return z.fatal && z.fatal < hoje; }).slice(0, 6),
    proximos: lista.filter(function (z) { return z.fatal && z.fatal >= hoje; }).slice(0, 25)
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

/**
 * Lista "A receber": por cliente e honorário, quantas parcelas, quantas pagas, valor total, recebido,
 * quanto falta, quanto está atrasado e a próxima parcela. Só quem ainda deve alguma coisa.
 */
function aReceber_() {
  var hoje = hojeSP_(), clientes = mapaClientes_(), hons = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var grupos = {};
  tabela_('Parcelas').linhas.forEach(function (p) {
    var h = hons[p.honorario_id] || {};
    if (['cancelado', 'encerrado', 'quitado'].indexOf(h.situacao) >= 0) return;
    var x = parcelaPublica_(p, hoje, clientes, hons);
    var g = grupos[p.honorario_id];
    if (!g) g = grupos[p.honorario_id] = { honorario_id: p.honorario_id, cliente_id: p.cliente_id, cliente: x.cliente, telefone: x.telefone,
      descricao: x.honorario, tipo: h.tipo || '', total: 0, recebido: 0, saldo: 0, parcelas: 0, pagas: 0, atrasadas: 0, atrasado: 0, proxima: null, ultima: '' };
    var valor = dinheiro_(p.valor);
    g.parcelas++; g.total += valor; g.recebido += dinheiro_(p.valor_pago);
    if (p.vencimento > g.ultima) g.ultima = p.vencimento;
    if (x.situacao === 'paga') { g.pagas++; return; }
    g.saldo += x.saldo;
    if (x.situacao === 'atrasada') { g.atrasadas++; g.atrasado += x.saldo; if (!g.desde || p.vencimento < g.desde) g.desde = p.vencimento; }
    else if (!g.proxima || p.vencimento < g.proxima.vencimento) g.proxima = { vencimento: p.vencimento, valor: x.saldo, numero: p.numero };
  });
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var lista = Object.keys(grupos).map(function (k) { return grupos[k]; }).filter(function (g) { return g.saldo > 0.005; })
    .map(function (g) { g.total = r2(g.total); g.recebido = r2(g.recebido); g.saldo = r2(g.saldo); g.atrasado = r2(g.atrasado); g.dias_atraso = g.desde ? diffDias_(hoje, g.desde) : 0; return g; })
    .sort(function (a, b) { return (b.atrasado > 0) - (a.atrasado > 0) || b.atrasado - a.atrasado || b.saldo - a.saldo; });
  var soma = function (f) { return r2(lista.reduce(function (t, g) { return t + g[f]; }, 0)); };
  var clientesSet = {};
  lista.forEach(function (g) { clientesSet[g.cliente_id] = 1; });
  return { lista: lista, totais: { saldo: soma('saldo'), atrasado: soma('atrasado'), recebido: soma('recebido'), total: soma('total'),
    clientes: Object.keys(clientesSet).length, devendo: lista.filter(function (g) { return g.atrasado > 0; }).length }, hoje: hoje };
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
      var dia = Math.min(31, parseInt(h.dia_demais, 10) || +venc.slice(8, 10));
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
  var res = registrarPagamento_(d, u);
  // recibo automático (fora da trava, porque gera documento no Drive)
  if (!d.estornar && d.recibo !== false) {
    try { res.recibo = reciboDaParcela_(res, u); } catch (e) { res.recibo_erro = String(e.message || e); }
  }
  return res;
}

/** Gera o recibo da parcela paga na pasta do cliente (modelo "Recibo de honorários"). */
function reciboDaParcela_(pg, u) {
  var h = tabela_('Honorarios').linhas.filter(function (x) { return x.id === pg.honorario_id; })[0] || {};
  var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === pg.cliente_id; })[0];
  if (!c) throw falha_('Cliente da parcela não encontrado.');
  var referente = (pg.numero ? pg.numero + 'ª parcela dos ' : '') + 'honorários advocatícios' + (h.descricao ? ' (' + h.descricao + ')' : '') +
    ', paga em ' + dataBR_(pg.data) + (pg.forma ? ' por ' + pg.forma : '');
  var g = gerarDocumentos_({ cliente_id: c.id, modelos: ['recibo'], recibo: { valor: pg.valor, referente: referente } }, u);
  var doc = g.gerados[0] || {};
  return { pdf: doc.pdf, doc: doc.doc, cliente: c.nome, telefone: c.telefone || '', valor: pg.valor, numero: pg.numero, data: pg.data, honorario: h.descricao || '' };
}

function registrarPagamento_(d, u) {
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
    return { ok: true, cliente_id: r.p.cliente_id, honorario_id: r.p.honorario_id, numero: r.p.numero, valor: valor, data: data, forma: String(d.forma || '') };
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
 * Se achar a data, marca na agenda certa e cria um prazo-lembrete com a data do ato. O prazo "para fazer"
 * da intimação continua existindo (é criado à parte em registrarIntimacao_). Sem data no texto, cria uma
 * tarefa "lançar na agenda" para a equipe abrir o processo e marcar pelo painel.
 */
function detectarAudienciaPericia_(ctx, d, proc, intim, semTarefa) {
  var ato = acharAto_([d.movimento, d.texto].join(' '));
  if (!ato) return false;
  var info = { numero: d.numero, fonte: d.fonte, movimento: d.movimento, ciencia: d.ciencia, intimacao_id: intim ? intim.id : '' };
  if (ato.semData) { if (!semTarefa) tarefaAtoSemData_(ctx, ato, info, proc, intim ? 'I:' + intim.id : ''); return false; }
  return marcarAto_(ctx, ato, info, proc);
}

var MESES_ATO = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

/** Lê o texto e devolve { ehPericia, tipo, agenda, data, hora } ou { semData: true, ... } (designado, mas sem a data no texto) ou null. */
function acharAto_(texto) {
  var t = normalizar_(texto);
  if (!t) return null;
  var ehPericia = /pericia|perito/.test(t) && /(designad|marcad|agendad|realizar|realizacao|comparecer|data|dia|local)/.test(t);
  var ehAudiencia = /audiencia|sessao de (conciliacao|mediacao)|cejusc/.test(t) &&
    /(designad|redesignad|marcad|agendad|pauta|comparecer|comparecimento|para o dia|realizar|realizacao|intimad|intimacao)/.test(t);
  if (!ehPericia && !ehAudiencia) return null;
  if (ehPericia && ehAudiencia) ehPericia = t.search(/pericia|perito/) < t.search(/audiencia|sessao de|cejusc/);
  if (/cancelad|retirad[ao] d[ae] pauta|nao realizada|adiada sem|audiencia realizada|pericia realizada|termo de audiencia|ata de audiencia/.test(t) && !/redesignad|designo|designad[ao] (para|o dia|a data)/.test(t)) return null;
  var tipo = ehPericia ? 'perícia'
    : /instrucao|instrucao e julgamento/.test(t) ? 'audiência de instrução'
    : /\bmediacao\b/.test(t) ? 'audiência de mediação'
    : /inicial|\buna\b/.test(t) ? 'audiência inicial' : 'audiência de conciliação';
  var agenda = ehPericia ? 'PERÍCIAS' : /instrucao/.test(t) ? 'AUDIÊNCIA INSTRUÇÃO' : 'AUDIÊNCIA CONCILIAÇÃO';
  var pos = t.search(ehPericia ? /pericia|perito/ : /audiencia|sessao de|cejusc/);
  var trecho = t.slice(Math.max(0, pos), pos + 600);
  var hoje = hojeSP_(), achada = null;
  var re = /(\d{1,2})\s*(?:\/|\.|-)\s*(\d{1,2})\s*(?:\/|\.|-)\s*(\d{4}|\d{2})(?!\d)|(\d{1,2})(?:º|o)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/g, m;
  while ((m = re.exec(trecho))) {
    var dia = +(m[1] || m[4]), mes = m[2] ? +m[2] : MESES_ATO[m[5]], ano = +(m[3] || m[6]);
    if (ano < 100) ano += 2000;
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100)) continue;
    var data = ano + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
    if (data < hoje) continue;
    var depois = trecho.slice(m.index + m[0].length, m.index + m[0].length + 45);
    var hm = /^[^\d]{0,30}?(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?/.exec(depois);
    var hora = hm && +hm[1] <= 23 && (!hm[2] || +hm[2] <= 59) ? ('0' + hm[1]).slice(-2) + ':' + (hm[2] || '00') : '';
    achada = { data: data, hora: hora };
    break;
  }
  var r = { ehPericia: ehPericia, tipo: tipo, agenda: agenda };
  if (achada) { r.data = achada.data; r.hora = achada.hora; return r; }
  if (/designad|redesignad|designo|marcad|agendad|incluid[ao] em pauta/.test(t)) { r.semData = true; return r; }
  return null;
}

/** Cria o evento no Google Agenda. Devolve o id do evento ou "erro: …". */
function criarEventoAto_(agenda, titulo, data, hora, descricao) {
  try {
    var ids = agendas_();
    var cal = ids[agenda] && CalendarApp.getCalendarById(ids[agenda]);
    if (!cal) return 'erro: agenda ' + agenda + ' não encontrada';
    var ev = hora
      ? cal.createEvent(titulo, new Date(data + 'T' + hora + ':00-03:00'), new Date(new Date(data + 'T' + hora + ':00-03:00').getTime() + 60 * 60000), { description: descricao })
      : cal.createAllDayEvent(titulo + ' (conferir horário)', new Date(data + 'T12:00:00-03:00'), { description: descricao + ' Horário não encontrado: conferir no processo.' });
    return ev.getId();
  } catch (e) { return 'erro: ' + (e.message || e); }
}

function tituloAto_(ctx, tipo, numero, proc) {
  var cliente = proc && proc.cliente_id ? ((ctx.clientes.linhas.filter(function (c) { return c.id === proc.cliente_id; })[0] || {}).nome) : ((proc && proc.cliente_nome) || '');
  if (cliente === 'a identificar') cliente = '';
  return (tipo.charAt(0).toUpperCase() + tipo.slice(1)) + (cliente ? ' — ' + cliente : '') + ' — ' + numero;
}

/** Já existe na agenda este ato (mesmo processo, mesma data e mesmo tipo: audiência ou perícia)? */
function atoJaMarcado_(ctx, numero, data, ehPericia) {
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  return ctx.eventos.linhas.some(function (e) { return e.numero === numero && e.data === data && (/per[ií]cia/.test(e.tipo) === !!ehPericia); });
}

/** Marca o ato na agenda e cria o lembrete com a data do ato (nunca apaga nem muda o prazo da intimação). */
function marcarAto_(ctx, ato, info, proc) {
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  if (atoJaMarcado_(ctx, info.numero, ato.data, ato.ehPericia)) return false;
  var titulo = tituloAto_(ctx, ato.tipo, info.numero, proc);
  var evId = criarEventoAto_(ato.agenda, titulo, ato.data, ato.hora, 'Marcado ' + (info.por ? 'por ' + info.por : 'pelo robô') + ' a partir de: ' + info.fonte + '. ' + String(info.movimento || '').slice(0, 300));
  var agora = new Date().toISOString();
  var prazo = {
    id: novoId_('Z'), processo_id: proc.id, numero: info.numero, intimacao_id: info.intimacao_id || '',
    descricao: (ato.ehPericia ? 'Perícia' : 'Audiência') + ' em ' + dataBR_(ato.data) + (ato.hora ? ' às ' + ato.hora : '') + ': ' +
      (ato.ehPericia ? 'avisar o cliente e preparar quesitos/documentos' : 'preparar audiência, cliente e testemunhas'),
    dias: '', contagem: 'corridos', ciencia: info.ciencia || hojeSP_(), ciencia_tipo: 'data do ato marcada pelo juízo', fatal: ato.data,
    situacao: info.por ? 'conferido' : 'calculado', conferido_por: info.por || '', conferido_em: info.por ? agora : '',
    origem: info.por ? 'painel' : 'robô', observacoes: 'ato:' + ato.tipo + ' | ' + info.fonte,
    criado_em: agora, atualizado_em: agora, atualizado_por: info.por || 'robô', cumprido_por: '', cumprido_em: ''
  };
  inserirLinha_(ctx.prazos, prazo);
  inserirLinha_(ctx.eventos, { chave: 'ato|' + info.numero + '|' + ato.tipo + '|' + ato.data + '|' + (ato.hora || ''), tipo: ato.tipo, numero: info.numero,
    data: ato.data, hora: ato.hora || '', agenda: ato.agenda, evento_id: evId, prazo_id: prazo.id, criado_em: agora });
  if (!proc.proximo_ato_data || proc.proximo_ato_data < hojeSP_() || ato.data < proc.proximo_ato_data) {
    atualizarLinha_(ctx.procs, proc, { proximo_ato: ato.tipo.charAt(0).toUpperCase() + ato.tipo.slice(1) + (ato.hora ? ' ' + ato.hora : ''), proximo_ato_data: ato.data });
  }
  // audiência ou perícia marcada: o processo vai para essa etapa
  var faseAto = ato.ehPericia ? 'pericia' : /instru/.test(ato.tipo) ? 'instrucao' : 'conciliacao';
  if (proc.fase_auto !== 'nao' && avancaFase_(proc.fase, faseAto)) atualizarLinha_(ctx.procs, proc, { fase: faseAto });
  return true;
}

/** Ato designado sem a data no texto (PJe "documento sigiloso", DataJud): tarefa para abrir o processo e lançar na agenda. */
function tarefaAtoSemData_(ctx, ato, info, proc, ref) {
  ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var marca = '[agenda:' + info.numero + ':' + (ref || '') + ']';
  var hoje = hojeSP_();
  // já tem ato futuro do mesmo tipo na agenda, ou tarefa igual aberta/recente: não repete
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  if (ctx.eventos.linhas.some(function (e) { return e.numero === info.numero && e.data >= hoje && /per[ií]cia/.test(e.tipo) === !!ato.ehPericia; })) return false;
  var desde = new Date(Date.now() - 20 * 86400000).toISOString();
  if (ctx.tarefas.linhas.some(function (x) {
    return x.numero === info.numero && /lançar na agenda/.test(x.titulo || '') &&
      ((x.descricao || '').indexOf(marca) >= 0 || (x.situacao === 'ativa' && !x.concluida_em) || (x.criado_em || '') >= desde);
  })) return false;
  var agora = new Date().toISOString();
  inserirLinha_(ctx.tarefas, { id: novoId_('T'),
    titulo: (ato.ehPericia ? 'Perícia' : 'Audiência') + ' designada — abrir o processo e lançar na agenda (' + info.numero + ')',
    descricao: 'O ' + (info.fonte || 'aviso') + ' indica ' + ato.tipo + ' designada, mas sem a data no texto. Abra o processo no sistema do tribunal, ' +
      'veja a data e o horário e use "Marcar na agenda" em Intimações e prazos. O prazo da intimação continua na lista.\n' +
      'Movimento: ' + String(info.movimento || '').slice(0, 200) + '\n' + marca,
    responsavel: responsavelPadrao_(proc, info.numero), processo_id: proc.id, numero: info.numero, cliente_id: proc.cliente_id || '',
    vence_em: hoje, etapa: 'afazer', peso: '2', situacao: 'ativa', concluida_por: '', concluida_em: '',
    historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' robô: ato designado sem data', criado_em: agora, criado_por: 'robô', atualizado_em: agora, atualizado_por: 'robô' });
  return true;
}

/**
 * Agenda sempre em dia (toda rodada do robô): relê as intimações dos últimos 180 dias e as movimentações do DataJud
 * à procura de audiência ou perícia ainda não marcada, e refaz no Google Agenda o que tinha falhado.
 */
function varrerAgenda_(ctx, limiteMs) {
  var t0 = Date.now(), hoje = hojeSP_(), marcados = 0, tarefas = 0, refeitos = 0;
  var desde = new Date(Date.now() - 180 * 86400000).toISOString();
  var recente = new Date(Date.now() - 15 * 86400000).toISOString();
  var porId = {};
  ctx.procs.linhas.forEach(function (p) { porId[p.id] = p; });
  var nT = (ctx.tarefas || tabela_('Tarefas')).linhas.length;
  ctx.intim.linhas.forEach(function (i) {
    if (Date.now() - t0 > (limiteMs || 60000) || (i.recebido_em || '') < desde) return;
    var p = porId[i.processo_id] || ctx.porNumero[i.numero];
    if (!p) return;
    if (detectarAudienciaPericia_(ctx, { numero: i.numero, fonte: i.fonte, movimento: i.movimento, texto: i.texto, ciencia: (i.recebido_em || '').slice(0, 10) }, p, i, (i.recebido_em || '') < recente)) marcados++;
  });
  ctx.procs.linhas.forEach(function (p) {
    if (Date.now() - t0 > (limiteMs || 60000) || !p.andamentos || p.andamentos === '-' || p.status === 'arquivado') return;
    var movs; try { movs = JSON.parse(p.andamentos); } catch (e) { return; }
    (movs || []).forEach(function (mv) {
      if (!mv || !mv.n || (mv.d || '') < desde.slice(0, 10)) return;
      var ato = acharAto_(mv.n);
      if (!ato) return;
      var info = { numero: p.numero, fonte: 'DataJud (movimentação de ' + dataBR_(String(mv.d).slice(0, 10)) + ')', movimento: mv.n, ciencia: String(mv.d).slice(0, 10) };
      if (ato.semData) { if ((mv.d || '') >= recente.slice(0, 10) && tarefaAtoSemData_(ctx, ato, info, p, 'D:' + String(mv.d).slice(0, 10))) tarefas++; }
      else if (marcarAto_(ctx, ato, info, p)) marcados++;
    });
  });
  // passou a audiência de conciliação (e não há outra marcada): segue para "Em andamento (defesa e réplica)"
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  ctx.procs.linhas.forEach(function (p) {
    if (p.fase !== 'conciliacao' || p.fase_auto === 'nao') return;
    var ev = ctx.eventos.linhas.filter(function (e) { return e.numero === p.numero && !/per[ií]cia|instru/.test(e.tipo); });
    if (ev.length && !ev.some(function (e) { return e.data >= hoje; })) atualizarLinha_(ctx.procs, p, { fase: 'andamento' });
  });
  // eventos que não foram para o Google Agenda (agenda sem acesso, erro do Google): tenta de novo
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  ctx.eventos.linhas.filter(function (e) { return e.data >= hoje && (!e.evento_id || /^erro/.test(e.evento_id)); }).slice(0, 15).forEach(function (e) {
    if (Date.now() - t0 > (limiteMs || 60000)) return;
    var p = ctx.porNumero[e.numero];
    var id = criarEventoAto_(e.agenda, tituloAto_(ctx, e.tipo, e.numero, p), e.data, e.hora, 'Marcado pelo robô (nova tentativa).');
    if (!/^erro/.test(id)) { atualizarLinha_(ctx.eventos, e, { evento_id: id }); refeitos++; }
  });
  tarefas += (ctx.tarefas ? ctx.tarefas.linhas.length : nT) - nT;
  if (marcados || tarefas || refeitos) registrar_('robô', 'agenda', marcados + ' ato(s) marcado(s), ' + tarefas + ' tarefa(s) "lançar na agenda", ' + refeitos + ' evento(s) refeito(s)');
  return { marcados: marcados, tarefas: tarefas, refeitos: refeitos };
}

/** Painel: "Marcar na agenda" a partir de uma intimação, de um prazo ou de um processo. O prazo da intimação continua. */
function marcarAtoPainel_(d, u) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) throw falha_('Informe a data do ato.');
  if (d.hora && !/^\d{2}:\d{2}$/.test(d.hora)) throw falha_('Hora inválida (use 14:30).');
  if (d.data < hojeSP_()) throw falha_('A data do ato já passou.');
  var TIPOS = { conciliacao: ['audiência de conciliação', 'AUDIÊNCIA CONCILIAÇÃO'], instrucao: ['audiência de instrução', 'AUDIÊNCIA INSTRUÇÃO'],
    inicial: ['audiência inicial', 'AUDIÊNCIA CONCILIAÇÃO'], mediacao: ['audiência de mediação', 'AUDIÊNCIA CONCILIAÇÃO'], pericia: ['perícia', 'PERÍCIAS'] };
  var tp = TIPOS[d.tipo];
  if (!tp) throw falha_('Escolha o tipo do ato.');
  return comTrava_(function () {
    var ctx = { prazos: tabela_('Prazos'), procs: tabela_('Processos'), clientes: tabela_('Clientes'), eventos: tabela_('Eventos'), tarefas: tabela_('Tarefas') };
    var intim = d.intimacao_id ? tabela_('Intimacoes').linhas.filter(function (i) { return i.id === d.intimacao_id; })[0] : null;
    var proc = ctx.procs.linhas.filter(function (p) { return p.id === (d.processo_id || (intim && intim.processo_id)); })[0];
    if (!proc && intim) proc = ctx.procs.linhas.filter(function (p) { return p.numero === intim.numero; })[0];
    if (!proc) throw falha_('Processo não encontrado.');
    var ato = { ehPericia: d.tipo === 'pericia', tipo: tp[0], agenda: tp[1], data: d.data, hora: d.hora || '' };
    if (atoJaMarcado_(ctx, proc.numero, d.data, ato.ehPericia)) throw falha_('Este ato já está na agenda (mesmo processo e mesma data).');
    var ok = marcarAto_(ctx, ato, { numero: proc.numero, fonte: intim ? intim.fonte + ' (lançado por ' + (u.nome || u.usuario) + ')' : 'painel', movimento: intim ? intim.movimento : '',
      ciencia: hojeSP_(), intimacao_id: intim ? intim.id : '', por: u.usuario }, proc);
    // tarefa "lançar na agenda" deste processo: concluída
    ctx.tarefas.linhas.forEach(function (x) {
      if (x.numero === proc.numero && x.situacao === 'ativa' && !x.concluida_em && /lançar na agenda/.test(x.titulo || '') && /per[ií]cia/i.test(x.titulo) === ato.ehPericia) {
        atualizarLinha_(ctx.tarefas, x, { etapa: 'concluido', historico: historicoMais_(x.historico, u, 'lançou na agenda'), concluida_por: u.usuario, concluida_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
      }
    });
    var ev = ctx.eventos.linhas[ctx.eventos.linhas.length - 1] || {};
    registrar_(u.usuario, 'ato na agenda', proc.numero + ' ' + ato.tipo + ' ' + d.data + ' ' + (d.hora || ''));
    return { ok: ok, erro_agenda: /^erro/.test(ev.evento_id || '') ? ev.evento_id : '' };
  });
}

/* ---------- Robô do PIX (Banco Inter): baixa automática das parcelas ---------- */

var BUSCA_PIX = 'from:no-reply@inter.co subject:(Pix recebido)';
var U_ROBO_PIX = { usuario: 'robô', nome: 'Robô do PIX', perfil: 'administrador' };

/** Lê o e-mail do Inter: "Você recebeu um Pix no valor de R$ 500,00 de NOME, na conta …". */
function lerEmailPix_(corpo) {
  var t = String(corpo || '').replace(/\s+/g, ' ');
  var m = /recebeu um Pix no valor de R\$\s*([\d.]+,\d{2}) de (.+?), na conta/i.exec(t);
  return m ? { valor: dinheiro_(m[1]), pagador: m[2].trim().slice(0, 120) } : null;
}

/** Nome comparável: sem acento, sem "ltda/me/eireli/sa", sem "de/da/do/dos/das/e". */
function nomeComparavel_(n) {
  return normalizar_(n).replace(/[^a-z0-9 ]/g, ' ').split(' ')
    .filter(function (w) { return w && ['de', 'da', 'do', 'dos', 'das', 'e', 'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a'].indexOf(w) < 0; }).join(' ');
}

/** Acha o cliente pelo nome de quem pagou. Só aceita nome igual (o mesmo nome completo) ou um único cliente com as mesmas palavras. */
function clienteDoPagador_(pagador, clientes) {
  var alvo = nomeComparavel_(pagador);
  if (!alvo) return null;
  var iguais = clientes.filter(function (c) { return nomeComparavel_(c.nome) === alvo; });
  if (iguais.length === 1) return { cliente: iguais[0], certeza: true };
  if (iguais.length > 1) return null;
  var pal = alvo.split(' ');
  var parecidos = clientes.filter(function (c) { var cn = nomeComparavel_(c.nome).split(' '); return pal.length >= 2 && pal.every(function (w) { return cn.indexOf(w) >= 0; }); });
  return parecidos.length === 1 ? { cliente: parecidos[0], certeza: false } : null;
}

/** Quem já pagou por qual cliente (aprendido dos PIX já baixados, inclusive os feitos à mão). Nome que apontou para 2 clientes é ignorado. */
function apelidosPix_(tabPix) {
  var m = {}, conflito = {};
  tabPix.linhas.forEach(function (x) {
    if (x.situacao !== 'baixado' || !x.cliente_id) return;
    var k = nomeComparavel_(x.pagador);
    if (!k) return;
    if (m[k] && m[k] !== x.cliente_id) conflito[k] = 1;
    m[k] = x.cliente_id;
  });
  Object.keys(conflito).forEach(function (k) { delete m[k]; });
  return m;
}

/**
 * Qual parcela (ou quais) o PIX paga:
 * 1) uma parcela do mesmo valor, já vencida ou a vencer em até 15 dias (a mais antiga);
 * 2) a soma das parcelas em aberto mais antigas (2 a 6) dá exatamente o valor;
 * 3) parcela vencida paga com um pouco a mais (multa/juros), até PIX_TOLERANCIA_JUROS % (padrão 10).
 */
function planoDeBaixa_(abertas, valor, diaPix, tolPct) {
  var v = Math.round(valor * 100);
  var cent = function (p) { return Math.round(dinheiro_(p.valor) * 100); };
  var eleg = abertas.filter(function (p) { return !p.vencimento || p.vencimento <= somarDias_(diaPix, 15); });
  var igual = eleg.filter(function (p) { return cent(p) === v; });
  if (igual.length) return { tipo: 'igual', itens: [{ p: igual[0], valor: valor }], iguais: igual.length };
  var soma = 0, lista = [];
  for (var i = 0; i < abertas.length && i < 6; i++) {
    if (abertas[i].vencimento && abertas[i].vencimento > somarDias_(diaPix, 45)) break;
    soma += cent(abertas[i]); lista.push(abertas[i]);
    if (soma === v && lista.length >= 2) return { tipo: 'soma', itens: lista.map(function (p) { return { p: p, valor: dinheiro_(p.valor) }; }) };
    if (soma > v) break;
  }
  if (tolPct > 0) {
    var venc = abertas.filter(function (p) { return p.vencimento && p.vencimento < diaPix && v > cent(p) && v <= Math.round(cent(p) * (1 + tolPct / 100)); });
    if (venc.length) return { tipo: 'juros', itens: [{ p: venc[0], valor: valor }] };
  }
  return null;
}

function parcelasAbertasDe_(clienteId, tabParc) {
  return tabParc.linhas.filter(function (p) { return p.cliente_id === clienteId && !p.pago_em; })
    .sort(function (a, b) { return (a.vencimento || '9999') < (b.vencimento || '9999') ? -1 : 1; });
}

/**
 * Robô (toda rodada): lê os PIX recebidos no Gmail. Cliente com o mesmo nome + parcela em aberto com o MESMO valor →
 * dá baixa sozinho (com recibo). Qualquer dúvida (outro nome, outro valor, duas parcelas iguais) fica "a conferir" no Financeiro.
 */
function lerPix_(limiteMs) {
  var t0 = Date.now();
  var desde = parseInt(config_('PIX_GMAIL_DESDE'), 10) || (Date.now() - 45 * 86400000);
  var threads;
  try { threads = GmailApp.search(BUSCA_PIX + ' after:' + Math.floor(desde / 1000), 0, 100); }
  catch (e) { if (gmailEsgotado_(e)) return { lidos: 0, baixados: 0, conferir: 0, parou: true }; throw e; }
  var tabPix = tabela_('Pix'), ja = {};
  tabPix.linhas.forEach(function (x) { ja[x.id] = 1; });
  var clientes = tabela_('Clientes').linhas, tabParc = tabela_('Parcelas');
  var apelidos = apelidosPix_(tabPix);
  var pagasPeloPix = {}; // parcelas já ligadas a um PIX (não contam como "lançado à mão")
  tabPix.linhas.forEach(function (x) { String(x.parcela_id || '').split(',').forEach(function (id) { if (id) pagasPeloPix[id] = 1; }); });
  var tolCfg = config_('PIX_TOLERANCIA_JUROS'), tol = tolCfg === '' || tolCfg === null || tolCfg === undefined ? 10 : Math.max(0, Math.min(30, parseFloat(String(tolCfg).replace(',', '.')) || 0));
  var msgs = [];
  threads.forEach(function (th) { th.getMessages().forEach(function (m) { if (m.getDate().getTime() > desde && !ja['pix:' + m.getId()]) msgs.push(m); }); });
  msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
  var r = { lidos: 0, baixados: 0, conferir: 0 }, ate = desde;
  for (var i = 0; i < msgs.length; i++) {
    if (Date.now() - t0 > (limiteMs || 90000)) break;
    var m = msgs[i], dados = lerEmailPix_(m.getPlainBody());
    var agora = new Date().toISOString(), quando = m.getDate().toISOString();
    ate = Math.max(ate, m.getDate().getTime());
    var linha = { id: 'pix:' + m.getId(), recebido_em: quando, valor: dados ? txtDinheiro_(dados.valor) : '', pagador: dados ? dados.pagador : '(não entendi o e-mail)',
      situacao: 'a conferir', cliente_id: '', parcela_id: '', motivo: '', criado_em: agora, atualizado_em: agora, atualizado_por: 'robô' };
    r.lidos++;
    if (!dados) { linha.motivo = 'Não consegui ler o valor e o nome no e-mail do Inter.'; inserirLinha_(tabPix, linha); r.conferir++; continue; }
    var achou = clienteDoPagador_(dados.pagador, clientes);
    if (!achou || !achou.certeza) { // já pagou antes por este cliente (baixa feita à mão uma vez) → reconhece
      var cidA = apelidos[nomeComparavel_(dados.pagador)];
      var cA = cidA && clientes.filter(function (c) { return c.id === cidA; })[0];
      if (cA) achou = { cliente: cA, certeza: true, apelido: true };
    }
    if (!achou) { linha.motivo = 'Nenhum cliente com este nome (pode ser um parente pagando ou outro recebimento). Ao dar baixa à mão, o robô aprende para a próxima vez.'; inserirLinha_(tabPix, linha); r.conferir++; continue; }
    linha.cliente_id = achou.cliente.id;
    var abertas = parcelasAbertasDe_(achou.cliente.id, tabParc);
    var diaPix = diaSP_(quando);
    var plano = planoDeBaixa_(abertas, dados.valor, diaPix, tol);
    // esse pagamento já foi lançado à mão? (parcela igual paga perto da data do PIX) → não baixa outra
    var jaLancado = tabParc.linhas.some(function (p) { return p.cliente_id === achou.cliente.id && p.pago_em && !pagasPeloPix[p.id] && Math.abs(dinheiro_(p.valor_pago || p.valor) - dados.valor) < 0.01 && Math.abs(diffDias_(p.pago_em, diaPix)) <= 7; });
    if (!achou.certeza) linha.motivo = 'Nome parecido com o do cliente (' + achou.cliente.nome + '): confira. Ao dar baixa, o robô aprende.';
    else if (!abertas.length) linha.motivo = 'O cliente não tem parcela em aberto.';
    else if (jaLancado) linha.motivo = 'Parece já lançado: há uma parcela de mesmo valor paga perto desta data. Confira antes de dar baixa.';
    else if (!plano) linha.motivo = 'O valor não bate com nenhuma parcela (nem soma de parcelas, nem parcela vencida com até ' + tol + '% de juros). Pode ter pago parte ou adiantado.';
    if (achou.certeza && plano && !jaLancado) {
      try {
        var ids = [], recibos = [];
        plano.itens.forEach(function (it) {
          var res = pagarParcela_({ id: it.p.id, data: diaPix, valor: txtDinheiro_(it.valor), forma: 'PIX (Inter)' }, U_ROBO_PIX);
          ids.push(it.p.id); if (res.recibo && res.recibo.pdf) recibos.push(res.recibo.pdf);
        });
        linha.situacao = 'baixado'; linha.parcela_id = ids.join(','); linha.recibo = recibos.join(' ');
        ids.forEach(function (id) { pagasPeloPix[id] = 1; });
        linha.motivo = (achou.apelido ? 'Pagador já conhecido deste cliente. ' : '') +
          (plano.tipo === 'soma' ? 'Baixa automática de ' + ids.length + ' parcelas (o PIX é a soma delas).'
            : plano.tipo === 'juros' ? 'Baixa automática da parcela vencida, paga com ' + reaisTxt_(dados.valor - dinheiro_(plano.itens[0].p.valor)) + ' a mais (multa/juros).'
            : 'Baixa automática' + (plano.iguais > 1 ? ' na parcela mais antiga (havia ' + plano.iguais + ' do mesmo valor)' : '') + '.');
        r.baixados++;
        tabParc = tabela_('Parcelas');
      } catch (eP) { linha.motivo = 'Não consegui dar baixa: ' + (eP.message || eP); r.conferir++; }
    } else r.conferir++;
    inserirLinha_(tabPix, linha);
  }
  if (ate > desde) setConfig_('PIX_GMAIL_DESDE', String(ate - 60000), 'Até onde o robô do PIX já leu o Gmail');
  setConfig_('PIX_ULTIMA', new Date().toISOString() + ' · ' + r.lidos + ' PIX lido(s), ' + r.baixados + ' baixa(s), ' + r.conferir + ' a conferir', 'Última leitura do robô do PIX');
  if (r.lidos) registrar_('robô', 'robô do PIX', r.lidos + ' lido(s), ' + r.baixados + ' baixa(s) automática(s), ' + r.conferir + ' a conferir');
  return r;
}

/** Limite de multa/juros aceito na baixa automática (parcela vencida paga com um pouco a mais). */
function configPix_(d, u) {
  var v = parseFloat(String(d.tolerancia).replace(',', '.'));
  if (!(v >= 0 && v <= 30)) throw falha_('Use um número de 0 a 30 (%).');
  setConfig_('PIX_TOLERANCIA_JUROS', String(v), 'Robô do PIX: até quantos % acima da parcela vencida aceita como multa/juros');
  registrar_(u.usuario, 'robô do PIX', 'tolerância de juros ' + v + '%');
  return { tolerancia: v };
}

function reaisTxt_(n) { return 'R$ ' + txtDinheiro_(n).replace('.', ','); }

function lerPixAgora_() { return comTrava_(function () { return lerPix_(120000); }); }

/** Financeiro: PIX recebidos dos últimos 60 dias, com as parcelas em aberto de cada cliente para dar baixa à mão. */
function listarPix_(d) {
  var dias = Math.min(parseInt(d.dias, 10) || 60, 365), desde = new Date(Date.now() - dias * 86400000).toISOString();
  var clientes = {}, tabParc = tabela_('Parcelas'), parc = {};
  tabela_('Clientes').linhas.forEach(function (c) { clientes[c.id] = c; });
  tabParc.linhas.forEach(function (p) { parc[p.id] = p; });
  var abertasPor = {};
  tabParc.linhas.forEach(function (p) { if (!p.pago_em) (abertasPor[p.cliente_id] = abertasPor[p.cliente_id] || []).push(p); });
  var lista = tabela_('Pix').linhas.filter(function (x) { return (x.recebido_em || '') >= desde; })
    .sort(function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; })
    .map(function (x) {
      var o = limpar_(x), c = clientes[x.cliente_id];
      var ps = String(x.parcela_id || '').split(',').map(function (id) { return parc[id]; }).filter(Boolean);
      o.cliente = c ? c.nome : ''; o.telefone = c ? (c.telefone || '') : '';
      o.recibos = String(x.recibo || '').split(' ').filter(String);
      if (ps.length) { o.parcela = { numero: ps[0].numero, vencimento: ps[0].vencimento, valor: ps[0].valor }; o.parcelas = ps.map(function (q) { return { numero: q.numero, vencimento: q.vencimento, valor: q.valor_pago || q.valor }; }); }
      if (x.situacao === 'a conferir' && c) o.abertas = (abertasPor[c.id] || []).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; }).slice(0, 12)
        .map(function (q) { return { id: q.id, numero: q.numero, vencimento: q.vencimento, valor: q.valor }; });
      return o;
    });
  var abertas = {};
  Object.keys(abertasPor).forEach(function (k) { abertas[k] = abertasPor[k].sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; }).slice(0, 12).map(function (q) { return { id: q.id, numero: q.numero, vencimento: q.vencimento, valor: q.valor }; }); });
  var tc = config_('PIX_TOLERANCIA_JUROS');
  return { lista: lista, abertas: abertas, ultima: config_('PIX_ULTIMA') || '', tolerancia: tc === '' || tc == null ? 10 : +tc, conferir: lista.filter(function (x) { return x.situacao === 'a conferir'; }).length,
    clientes: Object.keys(abertasPor).map(function (k) { return clientes[k] ? { id: k, nome: clientes[k].nome } : null; }).filter(Boolean).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }) };
}

/** Dar baixa à mão de um PIX "a conferir" numa parcela escolhida (gera o recibo). */
function baixarPix_(d, u) {
  var tab = tabela_('Pix'), x = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!x) throw falha_('PIX não encontrado.');
  if (x.situacao === 'baixado') throw falha_('Este PIX já deu baixa.');
  if (!d.parcela_id) throw falha_('Escolha a parcela.');
  var res = pagarParcela_({ id: d.parcela_id, data: diaSP_(x.recebido_em), valor: d.valor || x.valor, forma: 'PIX (Inter)' }, u);
  var p = parcelaPorId_(d.parcela_id).p;
  comTrava_(function () { atualizarLinha_(tab, x, { situacao: 'baixado', parcela_id: d.parcela_id, cliente_id: p.cliente_id, recibo: res.recibo && res.recibo.pdf ? res.recibo.pdf : '',
    motivo: 'Baixa feita por ' + (u.nome || u.usuario) + '. Da próxima vez, PIX de "' + x.pagador + '" vai direto para este cliente.', atualizado_em: new Date().toISOString(), atualizado_por: u.usuario }); });
  return { ok: true, recibo: res.recibo || null };
}

function ignorarPix_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Pix'), x = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!x) throw falha_('PIX não encontrado.');
    atualizarLinha_(tab, x, { situacao: d.voltar ? 'a conferir' : 'ignorado', motivo: d.voltar ? x.motivo : 'Não é honorário (marcado por ' + (u.nome || u.usuario) + ').', atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    return { ok: true };
  });
}

/* ---------- Robô: lembrete de audiência e perícia (2 dias úteis antes) ---------- */

var CHECK_ATO = {
  conciliacao: ['Avisar o cliente pelo WhatsApp (data, hora e local)', 'Confirmar se é presencial ou por vídeo (mandar o link)', 'Pedir documento com foto', 'Conversar com o cliente sobre proposta de acordo'],
  instrucao: ['Avisar o cliente pelo WhatsApp (data, hora e local)', 'Confirmar as testemunhas (nome, telefone e se vão comparecer)', 'Separar documentos e rol de testemunhas', 'Preparar as perguntas'],
  pericia: ['Avisar o cliente pelo WhatsApp (data, hora e local)', 'Pedir exames, laudos, receitas e atestados', 'Confirmar endereço e horário com o perito', 'Conferir quesitos e assistente técnico']
};
function tipoAtoDe_(t) { t = normalizar_(t); return /peri/.test(t) ? 'pericia' : /instru/.test(t) ? 'instrucao' : 'conciliacao'; }

/** Dia em que o lembrete aparece: 2 dias úteis antes do ato. */
function diaDoLembrete_(data, feriados) {
  var d = data, n = 0;
  for (var i = 0; i < 20 && n < 2; i++) { d = somarDias_(d, -1); if (ehUtil_(d, 'todos', feriados, true)) n++; }
  return d;
}

/**
 * Para cada audiência ou perícia (aba Eventos e agendas do Google de audiências e perícias) que acontece daqui a até 2 dias úteis,
 * cria UMA tarefa "Lembrar o cliente" para o responsável, com checklist e a mensagem de WhatsApp pronta no painel.
 */
function lembrarAudiencias_(ctx) {
  var hoje = hojeSP_(), feriados = ctx.feriados || mapaFeriados_();
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var ja = {};
  tabT.linhas.forEach(function (t) { var m = /\[lembrete:([^\]]+)\]/.exec(t.descricao || ''); if (m) ja[m[1]] = 1; });
  var porNumero = {};
  ctx.procs.linhas.forEach(function (p) { if (p.numero) porNumero[p.numero] = p; });
  var atos = [];
  (ctx.eventos || tabela_('Eventos')).linhas.forEach(function (e) {
    if (!e.data || e.data < hoje) return;
    atos.push({ chave: 'E:' + e.numero + ':' + e.data + ':' + tipoAtoDe_(e.tipo), tipo: tipoAtoDe_(e.tipo), nome: e.tipo, data: e.data, hora: e.hora || '', numero: e.numero, local: '' });
  });
  // audiências lançadas direto no Google Agenda (sem passar pelo robô)
  try {
    var ids = agendas_(), fim = new Date(somarDias_(hoje, 8) + 'T23:59:00-03:00');
    ['AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO', 'PERÍCIAS'].forEach(function (ag) {
      var cal = ids[ag] && CalendarApp.getCalendarById(ids[ag]);
      if (!cal) return;
      cal.getEvents(new Date(hoje + 'T00:00:00-03:00'), fim).forEach(function (ev) {
        var txt = ev.getTitle() + ' ' + (ev.getDescription() || '');
        var num = (RE_CNJ.exec(txt) || [])[1] || '';
        var ini = ev.getStartTime(), data = Utilities.formatDate(ini, TZ, 'yyyy-MM-dd');
        var tipo = ag === 'PERÍCIAS' ? 'pericia' : ag === 'AUDIÊNCIA INSTRUÇÃO' ? 'instrucao' : 'conciliacao';
        if (num && atos.some(function (a) { return a.numero === num && a.data === data && a.tipo === tipo; })) return;
        atos.push({ chave: 'G:' + ev.getId().slice(0, 40) + ':' + data, tipo: tipo, nome: tipo === 'pericia' ? 'perícia' : tipo === 'instrucao' ? 'audiência de instrução' : 'audiência de conciliação',
          data: data, hora: ev.isAllDayEvent() ? '' : Utilities.formatDate(ini, TZ, 'HH:mm'), numero: num, local: ev.getLocation ? (ev.getLocation() || '') : '', titulo: ev.getTitle() });
      });
    });
  } catch (e) { /* sem acesso à agenda: segue com a aba Eventos */ }
  var feitos = 0, agora = new Date().toISOString();
  atos.forEach(function (a) {
    if (ja[a.chave] || hoje < diaDoLembrete_(a.data, feriados)) return;
    ja[a.chave] = 1;
    var p = porNumero[a.numero] || {};
    var cli = p.cliente_id ? (ctx.clientes.linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {}) : {};
    var nomeCli = cli.nome || (p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '';
    var quando = dataBR_(a.data) + (a.hora ? ' às ' + a.hora : '');
    var nomeAto = a.nome.charAt(0).toUpperCase() + a.nome.slice(1);
    inserirLinha_(tabT, { id: novoId_('T'),
      titulo: 'Lembrar o cliente: ' + a.nome + ' em ' + quando + (nomeCli ? ' — ' + nomeCli : ''),
      descricao: nomeAto + ' ' + quando + (a.local ? ' · ' + a.local : '') + (a.numero ? ' · processo ' + a.numero : '') + (a.titulo && !a.numero ? ' · ' + a.titulo : '') +
        '.\nAvise o cliente pelo botão de WhatsApp desta tarefa e confira o checklist. Depois aperte "✓ Conferido".\n' +
        '[ato:' + a.tipo + '|' + a.data + '|' + (a.hora || '') + '|' + String(a.local || '').replace(/[\]|]/g, ' ').slice(0, 80) + ']\n[lembrete:' + a.chave + ']',
      responsavel: p.responsavel || responsavelPadrao_(p, a.numero) || '', processo_id: p.id || '', numero: a.numero || '', cliente_id: p.cliente_id || '',
      vence_em: a.data > hoje ? somarDias_(a.data, -1) : hoje, etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '',
      historico: historicoMais_('', { nome: 'robô' }, 'lembrete de ' + a.nome), criado_em: agora, criado_por: 'robô', atualizado_em: agora, atualizado_por: 'robô',
      prioridade: diffDias_(a.data, hoje) <= 1 ? 'urgente' : 'alta', checklist: JSON.stringify((CHECK_ATO[a.tipo] || CHECK_ATO.conciliacao).map(function (t) { return { t: t, ok: false }; })),
      repetir: '', ok_por: '', ok_em: '' });
    feitos++;
  });
  if (feitos) registrar_('robô', 'lembretes de audiência', feitos + ' tarefa(s) "lembrar o cliente"');
  return feitos;
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
        noPrazo: !z.fatal || diaSP_(z.cumprido_em || z.atualizado_em) <= z.fatal };
    })
    .sort(function (a, b) { return a.quando < b.quando ? 1 : -1; });
  var porPessoa = {};
  lista.forEach(function (x) { var r = porPessoa[x.quem] = porPessoa[x.quem] || { quem: x.quem, total: 0, noPrazo: 0 }; r.total++; if (x.noPrazo) r.noPrazo++; });
  return { dias: dias, lista: lista, porPessoa: Object.keys(porPessoa).map(function (k) { return porPessoa[k]; }) };
}

/* ---------- Documentos na pasta do cliente ---------- */

function documentosCliente_(d, u) {
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  var r = { pasta_url: c.pasta_url, procuracao: [], contrato: [], declaracao: [], recibo: [], outros: 0, total: 0, honorarios: null };
  if (u && PERFIS[u.perfil].financeiro) {
    var hs = tabela_('Honorarios').linhas.filter(function (h) { return h.cliente_id === c.id; });
    r.honorarios = { total: hs.length, ativos: hs.filter(function (h) { return h.situacao === 'ativo'; }).length };
  }
  if (!c.pasta_id) return r;
  var pasta;
  try { pasta = DriveApp.getFolderById(c.pasta_id); } catch (e) { r.erroPasta = 'A pasta ligada a este cliente não foi encontrada no Drive.'; return r; }
  // também olha dentro de "DOCUMENTOS PARA ASSINAR" (marcados como "a assinar")
  var fontes = [[pasta, false]], sub = acharPasta_(pasta, PASTA_PARA_ASSINAR);
  if (sub) { fontes.push([sub, true]); r.pasta_assinar = sub.getUrl(); r.para_assinar = 0; }
  fontes.forEach(function (fonte) {
  var it = fonte[0].getFiles();
  while (it.hasNext() && r.total < 400) {
    var f = it.next(); r.total++;
    if (fonte[1]) r.para_assinar++;
    var nome = normalizar_(f.getName());
    var item = { nome: f.getName(), url: f.getUrl(), data: f.getLastUpdated().toISOString(), assinar: fonte[1] };
    if (/procura/.test(nome)) r.procuracao.push(item);
    else if (/recibo/.test(nome)) r.recibo.push(item);
    else if (/contrato|honorar/.test(nome)) r.contrato.push(item);
    else if (/declara|hipossufic|residencia|termo/.test(nome)) r.declaracao.push(item);
    else r.outros++;
  }
  });
  ['procuracao', 'contrato', 'declaracao', 'recibo'].forEach(function (k) { r[k].sort(function (a, b) { return a.data < b.data ? 1 : -1; }); });
  return r;
}

/* ---------- Modelos de documentos ---------- */

/*
 * Cada modelo é um Google Docs na pasta "MODELOS (editáveis)". O painel copia o modelo para a pasta
 * do cliente, troca os campos entre chaves duplas e salva também em PDF.
 * Para mudar o texto, edite o Google Docs (os campos {{...}} continuam funcionando).
 * Os textos abaixo são só a primeira versão de cada modelo.
 */

var ESCRITORIO_PADRAO = {
  nome: 'ARAÚJO SOCIEDADE INDIVIDUAL DE ADVOCACIA',
  endereco: 'Rua Silvino Moreira Lima Sobrinho, nº 888, Sala 04, Humaitá, Tubarão/SC, CEP 88704-225',
  email: 'advogadajulianaraujo@gmail.com',
  telefone: '(48) 3626-2556',
  cidade: 'Tubarão/SC',
  foro: 'Tubarão/SC',
  cnpj: '46.000.441/0001-94',
  oab: '7551',
  pix: 'PIX CNPJ 46.000.441/0001-94 — Banco Inter (077), agência 0001, conta 21184914-6',
  rodape: ['Rua Silvino Moreira Lima, nº 888, Humaitá, Tubarão/SC.', 'Fone: (48) 36262556', 'CNPJ nº 46.000.441/0001-94', 'OAB/SC nº 7551']
};
var LOGO_DOCUMENTOS = ['https://araujoadvocaciasc.com.br/assets/logo-documentos.png',
  'https://raw.githubusercontent.com/advogadajulianaraujo/site-araujo-advocacia/main/assets/logo-documentos.png'];

function escritorio_() {
  return {
    nome: config_('ESCRITORIO_NOME') || ESCRITORIO_PADRAO.nome,
    endereco: config_('ESCRITORIO_ENDERECO') || ESCRITORIO_PADRAO.endereco,
    email: config_('ESCRITORIO_EMAIL') || ESCRITORIO_PADRAO.email,
    telefone: config_('ESCRITORIO_TELEFONE') || ESCRITORIO_PADRAO.telefone,
    cidade: config_('ESCRITORIO_CIDADE') || ESCRITORIO_PADRAO.cidade,
    foro: config_('ESCRITORIO_FORO') || ESCRITORIO_PADRAO.foro,
    cnpj: config_('ESCRITORIO_CNPJ') || ESCRITORIO_PADRAO.cnpj,
    oab: config_('ESCRITORIO_OAB') || ESCRITORIO_PADRAO.oab,
    pix: config_('ESCRITORIO_PIX') || ESCRITORIO_PADRAO.pix,
    rodape: ESCRITORIO_PADRAO.rodape
  };
}

/** Tipos de ação: preenchem a finalidade da procuração e os poderes específicos. {{contra}} vira " em face de Fulano". */
var TIPOS_ACAO = {
  trabalhista: { nome: 'Ação trabalhista (reclamatória)', area: 'Trabalhista', ambito: 'perante a Justiça do Trabalho (Varas do Trabalho, Tribunais Regionais do Trabalho e Tribunal Superior do Trabalho), as Comissões de Conciliação Prévia, o Ministério do Trabalho e Emprego e o Ministério Público do Trabalho',
    objeto: 'propor e acompanhar reclamatória trabalhista{{contra}}, em todas as fases, inclusive execução e recursos',
    poderes: 'Poderes especiais para firmar acordos perante a Justiça do Trabalho e as Comissões de Conciliação Prévia e para receber e dar quitação de valores, levantar depósitos recursais e alvarás, e requerer a habilitação de créditos.' },
  defesa_trabalhista: { nome: 'Defesa trabalhista (empresa reclamada)', area: 'Trabalhista', ambito: 'perante a Justiça do Trabalho (Varas do Trabalho, Tribunais Regionais do Trabalho e Tribunal Superior do Trabalho), o Ministério do Trabalho e Emprego e o Ministério Público do Trabalho',
    objeto: 'apresentar defesa e acompanhar reclamatória trabalhista{{contra}}, em todas as fases, inclusive execução e recursos',
    poderes: 'Poderes especiais para firmar acordos, indicar preposto, oferecer bens à penhora e efetuar depósitos recursais.' },
  previdenciaria: { nome: 'Previdenciária / INSS (benefícios)', area: 'Previdenciário', ambito: 'perante o Instituto Nacional do Seguro Social (INSS), o Conselho de Recursos da Previdência Social, a Justiça Federal e os Juizados Especiais Federais e, na competência delegada, a Justiça Estadual',
    objeto: 'requerer, acompanhar e recorrer de benefícios previdenciários e assistenciais perante o Instituto Nacional do Seguro Social – INSS e propor as ações judiciais cabíveis{{contra}}',
    poderes: 'Poderes especiais para representar {{c:o|a}} OUTORGANTE perante o INSS em qualquer de suas agências e no Meu INSS, requerer benefícios, agendar e acompanhar perícias, cumprir exigências, ter vista e obter cópias de processos administrativos, requerer certidões e extratos (CNIS), recorrer ao Conselho de Recursos da Previdência Social e receber valores atrasados.' },
  civel: { nome: 'Ação cível (indenização, obrigação, cobrança)', area: 'Cível', ambito: 'perante a Justiça Estadual, os Juizados Especiais Cíveis e os Tribunais',
    objeto: 'propor e acompanhar ação cível{{contra}}, em todas as fases e instâncias',
    poderes: 'Poderes especiais para firmar acordos, receber e dar quitação, levantar alvarás e depósitos judiciais, indicar bens à penhora e requerer o cumprimento de sentença.' },
  defesa_civel: { nome: 'Defesa cível (cliente é o réu)', area: 'Cível', ambito: 'perante a Justiça Estadual, os Juizados Especiais Cíveis e os Tribunais',
    objeto: 'apresentar defesa, reconvenção e recursos e acompanhar a ação cível movida{{contra_por}} contra {{c:o|a}} OUTORGANTE, em todas as fases e instâncias',
    poderes: 'Poderes especiais para firmar acordos, oferecer bens à penhora, efetuar depósitos judiciais, receber citação e dar quitação.' },
  consumidor: { nome: 'Direito do consumidor', area: 'Consumidor', ambito: 'perante a Justiça Estadual, os Juizados Especiais Cíveis, o PROCON, o Banco Central (Registrato), a plataforma consumidor.gov.br e as instituições financeiras e fornecedores',
    objeto: 'propor e acompanhar ação de natureza consumerista{{contra}}, inclusive perante o PROCON e os Juizados Especiais',
    poderes: 'Poderes especiais para registrar reclamações no PROCON e no consumidor.gov.br, solicitar extratos, contratos e gravações a bancos e fornecedores, firmar acordos, receber e dar quitação e levantar alvarás.' },
  alimentos: { nome: 'Pensão alimentícia (alimentos, revisão, execução)', area: 'Família', ambito: 'perante as Varas de Família, os Centros Judiciários de Solução de Conflitos (CEJUSC), o Ministério Público e os empregadores e fontes pagadoras',
    objeto: 'propor e acompanhar ação de alimentos, revisional, de exoneração ou de execução de alimentos{{contra}}',
    poderes: 'Poderes especiais para requerer a prisão civil do devedor de alimentos, o desconto em folha de pagamento, a penhora de bens e valores e o protesto do título judicial.' },
  divorcio: { nome: 'Divórcio / união estável', area: 'Família', ambito: 'perante as Varas de Família, os CEJUSCs, os tabelionatos de notas e os registros civis e de imóveis',
    objeto: 'propor e acompanhar ação de divórcio ou de reconhecimento e dissolução de união estável{{contra}}, consensual ou litigiosa, com partilha de bens, guarda, convivência e alimentos',
    poderes: 'Poderes especiais para concordar com a partilha de bens, transigir sobre guarda, convivência e alimentos e assinar escritura pública de divórcio ou de dissolução de união estável perante tabelionato de notas.' },
  guarda: { nome: 'Guarda, convivência e visitas', area: 'Família', ambito: 'perante as Varas de Família e da Infância e Juventude, os CEJUSCs, o Conselho Tutelar e o Ministério Público',
    objeto: 'propor e acompanhar ação de guarda, regulamentação de convivência ou modificação de guarda{{contra}}',
    poderes: 'Poderes especiais para transigir sobre guarda, convivência e alimentos.' },
  inventario: { nome: 'Inventário e partilha', area: 'Família', ambito: 'perante as Varas de Família e Sucessões, os tabelionatos de notas, os registros de imóveis, a Receita Federal e as Fazendas Estadual e Municipal',
    objeto: 'requerer a abertura e acompanhar inventário, arrolamento e partilha, judicial ou extrajudicial, dos bens deixados pelo autor da herança{{contra_de}}',
    poderes: 'Poderes especiais para prestar compromisso de inventariante, apresentar primeiras e últimas declarações, concordar com avaliações, cálculos e partilha, requerer alvarás, receber e dar quitação e assinar escritura pública de inventário e partilha.' },
  criminal: { nome: 'Defesa criminal', area: 'Criminal', criminal: true,
    objeto: 'promover a defesa d{{c:o|a}} OUTORGANTE em inquérito policial, termo circunstanciado, ação penal e execução penal{{contra}}, em qualquer juízo ou tribunal',
    poderes: 'Poderes para requerer liberdade provisória, relaxamento de prisão e revogação de medidas cautelares, impetrar habeas corpus, apresentar resposta à acusação, alegações finais e recursos, propor e aceitar transação penal, suspensão condicional do processo e acordo de não persecução penal, e acompanhar audiências de custódia.' },
  queixa: { nome: 'Queixa-crime (ofendido)', area: 'Criminal', criminal: true,
    objeto: 'oferecer e acompanhar queixa-crime{{contra}} pelos fatos de ________ (descreva o fato e o crime, art. 44 do Código de Processo Penal)',
    poderes: 'Poderes especiais para oferecer queixa-crime, nos termos do art. 44 do Código de Processo Penal, representar criminalmente, habilitar-se como assistente de acusação e aceitar ou recusar retratação e perdão.' },
  execucao: { nome: 'Execução / cobrança de dívida', area: 'Cível', ambito: 'perante a Justiça Estadual, os Juizados Especiais Cíveis, os cartórios de protesto e os registros de imóveis e de veículos',
    objeto: 'propor e acompanhar ação de execução, monitória ou de cobrança{{contra}}',
    poderes: 'Poderes especiais para indicar bens à penhora, requerer adjudicação, arrematar, receber e dar quitação.' },
  imovel: { nome: 'Imóveis (usucapião, despejo, posse)', area: 'Cível', ambito: 'perante a Justiça Estadual, os registros de imóveis, os tabelionatos de notas e as prefeituras',
    objeto: 'propor e acompanhar ação de usucapião, despejo, possessória ou outra relativa a imóvel{{contra}}',
    poderes: 'Poderes especiais para representar {{c:o|a}} OUTORGANTE perante cartórios de registro de imóveis e tabelionatos, inclusive em usucapião extrajudicial.' },
  administrativo: { nome: 'Órgãos públicos / procedimento administrativo', area: 'Cível', ambito: 'perante órgãos e repartições públicas federais, estaduais e municipais, autarquias, concessionárias e instituições financeiras',
    objeto: 'representar {{c:o|a}} OUTORGANTE perante órgãos e repartições públicas federais, estaduais e municipais, autarquias, concessionárias e instituições financeiras{{contra}}',
    poderes: 'Poderes para protocolar requerimentos, recursos e defesas administrativas, ter vista de processos e obter cópias e certidões.' },
  outro: { nome: 'Outro (descreva em "Detalhes")', area: '', ambito: '', objeto: '', poderes: '' }
};

/**
 * Poderes gerais da procuração conforme a área: na esfera criminal, com base no CPP (sem os poderes de transigir/confessar
 * do art. 105 do CPC); nas demais, o foro em geral do art. 105 do CPC com o âmbito de atuação da área.
 */
function poderesGeraisProcuracao_(tipo, menor) {
  var quem = menor ? 'a parte OUTORGANTE' : '{{c:o|a}} OUTORGANTE', la = menor ? 'la' : 'l{{c:o|a}}';
  if (tipo && tipo.criminal) {
    return 'pelo presente instrumento, ' + quem + ' confere {{adv:ao|à}} OUTORGAD{{adv:O|A}} amplos poderes para o foro em geral, com a cláusula ad judicia et extra, para representá-' + la +
      ' perante delegacias de polícia, o Ministério Público, os juízos e tribunais criminais, os juizados especiais criminais e as varas de execução penal, podendo acompanhar inquéritos e termos circunstanciados, ter vista e extrair cópias de autos, requerer diligências e perícias, apresentar defesas, memoriais, recursos e revisão criminal, impetrar habeas corpus e mandado de segurança e substabelecer, com ou sem reserva de poderes (arts. 266 e seguintes do Código de Processo Penal e art. 5º da Lei nº 8.906/1994).';
  }
  var onde = tipo && tipo.ambito ? tipo.ambito + ', bem como em qualquer outro juízo, instância ou tribunal' : 'em qualquer juízo, instância ou tribunal e perante órgãos públicos, autarquias e instituições financeiras';
  return 'pelo presente instrumento, ' + quem + ' confere {{adv:ao|à}} OUTORGAD{{adv:O|A}} amplos poderes para o foro em geral, com a cláusula ad judicia et extra, para representá-' + la + ' ' + onde +
    ', podendo propor as ações competentes, defendê-' + la + ' nas contrárias e interpor recursos, com poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, receber e dar quitação, firmar compromisso, levantar alvarás e valores, requerer a gratuidade da justiça, firmar declaração de hipossuficiência e substabelecer, com ou sem reserva de poderes (art. 105 do Código de Processo Civil).';
}

/*
 * Linhas dos modelos:  ['t', título centralizado em negrito]  ['h', subtítulo em negrito]  ['p', parágrafo justificado]
 * ['c', parágrafo centralizado]  ['l', linha à esquerda sem recuo (cabeçalho de petição)]  ['a', assinatura do cliente]
 * ['adv'] assinatura do(a) advogado(a): nome em negrito e OAB embaixo.
 * Trechos entre **asteriscos** saem em negrito (o painel tira os asteriscos ao criar o modelo).
 * Padrão visual do escritório (modelo de juntada): EB Garamond 12, justificado, espaço depois do parágrafo,
 * logo no topo com linha e rodapé com endereço, telefone, CNPJ e OAB da sociedade.
 */
var MODELOS = {
  procuracao: { assinaCliente: true, nome: 'Procuração ad judicia et extra', grupo: 'Procuração e declarações', config: 'MODELO8_PROCURACAO_ID', antigo: ['MODELO6_PROCURACAO_ID', 'MODELO5_PROCURACAO_ID', 'MODELO4_PROCURACAO_ID', 'MODELO3_PROCURACAO_ID', 'MODELO2_PROCURACAO_ID', 'MODELO_PROCURACAO_ID'], umaFolha: true },
  procuracao_menor: { assinaCliente: true, nome: 'Procuração de filhos menores (representados pelo pai ou pela mãe)', grupo: 'Procuração e declarações', menores: true, umaFolha: true, config: 'MODELO8_PROCURACAO_MENOR_ID', antigo: ['MODELO6_PROCURACAO_MENOR_ID', 'MODELO5_PROCURACAO_MENOR_ID'] },
  hipossuficiencia: { assinaCliente: true, nome: 'Declaração de hipossuficiência (justiça gratuita)', grupo: 'Procuração e declarações', config: 'MODELO6_HIPOSSUFICIENCIA_ID', antigo: ['MODELO5_HIPOSSUFICIENCIA_ID', 'MODELO4_HIPOSSUFICIENCIA_ID', 'MODELO3_HIPOSSUFICIENCIA_ID', 'MODELO2_HIPOSSUFICIENCIA_ID'], umaFolha: true },
  residencia: { assinaCliente: true, nome: 'Declaração de residência', grupo: 'Procuração e declarações', config: 'MODELO6_RESIDENCIA_ID', antigo: ['MODELO5_RESIDENCIA_ID', 'MODELO4_RESIDENCIA_ID', 'MODELO3_RESIDENCIA_ID', 'MODELO2_RESIDENCIA_ID'], umaFolha: true },
  lgpd: { assinaCliente: true, nome: 'Termo de consentimento – dados pessoais (LGPD)', grupo: 'Procuração e declarações', config: 'MODELO6_LGPD_ID', antigo: ['MODELO5_LGPD_ID', 'MODELO4_LGPD_ID', 'MODELO3_LGPD_ID', 'MODELO2_LGPD_ID'] },
  juntada: { nome: 'Petição de juntada de documentos', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO6_JUNTADA_ID', antigo: ['MODELO5_JUNTADA_ID', 'MODELO4_JUNTADA_ID', 'MODELO3_JUNTADA_ID'] },
  habilitacao: { nome: 'Petição de juntada de procuração (habilitação)', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO6_HABILITACAO_ID', antigo: ['MODELO5_HABILITACAO_ID', 'MODELO4_HABILITACAO_ID', 'MODELO3_HABILITACAO_ID'] },
  substabelecimento: { nome: 'Substabelecimento com reserva de poderes', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO6_SUBSTABELECIMENTO_ID', antigo: ['MODELO5_SUBSTABELECIMENTO_ID', 'MODELO4_SUBSTABELECIMENTO_ID', 'MODELO3_SUBSTABELECIMENTO_ID'] },
  contrato: { assinaCliente: true, nome: 'Contrato de honorários advocatícios', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, config: 'MODELO8_CONTRATO_ID', antigo: ['MODELO7_CONTRATO_ID', 'MODELO6_CONTRATO_ID', 'MODELO5_CONTRATO_ID', 'MODELO4_CONTRATO_ID', 'MODELO3_CONTRATO_ID', 'MODELO2_CONTRATO_ID', 'MODELO_CONTRATO_ID'] },
  prestacao: { assinaCliente: true, nome: 'Contrato de prestação de serviços advocatícios (extrajudicial)', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, config: 'MODELO8_PRESTACAO_ID', antigo: ['MODELO6_PRESTACAO_ID', 'MODELO5_PRESTACAO_ID', 'MODELO4_PRESTACAO_ID', 'MODELO3_PRESTACAO_ID', 'MODELO2_PRESTACAO_ID'] },
  assessoria: { assinaCliente: true, nome: 'Contrato de assessoria jurídica (mensal)', grupo: 'Contratos, recibos e cobrança', financeiro: true, mensal: true, config: 'MODELO8_ASSESSORIA_ID', antigo: ['MODELO6_ASSESSORIA_ID', 'MODELO5_ASSESSORIA_ID', 'MODELO4_ASSESSORIA_ID', 'MODELO3_ASSESSORIA_ID', 'MODELO2_ASSESSORIA_ID'] },
  recibo: { nome: 'Recibo de honorários', grupo: 'Contratos, recibos e cobrança', financeiro: true, recibo: true, config: 'MODELO6_RECIBO_ID', antigo: ['MODELO5_RECIBO_ID', 'MODELO4_RECIBO_ID', 'MODELO3_RECIBO_ID', 'MODELO2_RECIBO_ID'] },
  cobranca: { nome: 'Notificação de cobrança de honorários em atraso', grupo: 'Contratos, recibos e cobrança', financeiro: true, cobranca: true, config: 'MODELO6_COBRANCA_ID', antigo: ['MODELO5_COBRANCA_ID', 'MODELO4_COBRANCA_ID', 'MODELO3_COBRANCA_ID'] },
  promissoria: { assinaCliente: true, nome: 'Notas promissórias das parcelas', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, gerado: true },
  procuracao_inventario: { assinaCliente: true, nome: 'Procuração para inventário e partilha (judicial ou em cartório)', grupo: 'Procuração e declarações', umaFolha: true, config: 'MODELO7_PROC_INVENTARIO_ID' },
  isencao_irpf: { assinaCliente: true, nome: 'Requerimento de isenção do imposto de renda (doença grave)', grupo: 'Procuração e declarações', config: 'MODELO7_ISENCAO_IRPF_ID' },
  comparecimento: { nome: 'Declaração de comparecimento ao escritório', grupo: 'Procuração e declarações', umaFolha: true, config: 'MODELO7_COMPARECIMENTO_ID' },
  notificacao: { nome: 'Notificação extrajudicial (em nome do cliente)', grupo: 'Petições e notificações', config: 'MODELO7_NOTIFICACAO_ID' },
  contrato_previdenciario: { assinaCliente: true, nome: 'Contrato de honorários previdenciário (INSS — 30% / benefícios)', grupo: 'Contratos, recibos e cobrança', financeiro: true, config: 'MODELO8_CONTRATO_PREV_ID', antigo: ['MODELO7_CONTRATO_PREV_ID'] }
};

var CABECALHO_PETICAO = [
  ['t', '{{juizo}}'],
  ['l', 'Processo nº {{numero_processo}}'],
  ['l', '{{rotulo_ativo}}: {{parte_ativa}}'],
  ['l', '{{rotulo_passivo}}: {{parte_passiva}}']
];

var TEXTO_MODELOS = {
  procuracao: [
    ['t', 'PROCURAÇÃO AD JUDICIA ET EXTRA'],
    ['p', '**OUTORGANTE:** **{{nome}}**, {{qualificacao_curta}}.'],
    ['p', '**OUTORGAD{{adv:O|A}}:** **{{advogado_nome}}**, {{advogado_qualificacao}}.'],
    ['p', '**FINALIDADE:** {{objeto}}.'],
    ['p', '**PODERES:** {{poderes_gerais}}'],
    ['p', '**PODERES ESPECÍFICOS DESTA ÁREA:** {{poderes_especificos}}'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  procuracao_menor: [
    ['t', 'PROCURAÇÃO AD JUDICIA ET EXTRA'],
    ['p', '**{{rotulo_outorgantes}}:** {{menores_qualificacao}}, {{menores_representacao}} **{{nome}}**, {{qualificacao_curta}}.'],
    ['p', '**OUTORGAD{{adv:O|A}}:** **{{advogado_nome}}**, {{advogado_qualificacao}}.'],
    ['p', '**FINALIDADE:** {{objeto}}.'],
    ['p', '**PODERES:** {{poderes_gerais_menor}}'],
    ['p', '**PODERES ESPECÍFICOS DESTA ÁREA:** {{poderes_especificos}}'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}'],
    ['c', '{{menores_assinatura}}']
  ],
  hipossuficiencia: [
    ['t', 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA'],
    ['p', '**{{nome}}**, {{qualificacao_curta}}, **DECLARA**, sob as penas da lei e para os fins dos arts. 98 e 99, § 3º, do Código de Processo Civil e do art. 5º, LXXIV, da Constituição Federal, que não possui condições de arcar com as custas e despesas processuais e com os honorários advocatícios sem prejuízo do próprio sustento e do de sua família, razão pela qual requer a concessão dos benefícios da gratuidade da justiça.'],
    ['p', 'Declara, ainda, estar ciente de que a falsidade desta declaração sujeita {{c:o|a}} declarante às sanções civis, administrativas e criminais cabíveis, inclusive ao pagamento de multa de até o décuplo das despesas processuais (art. 100, parágrafo único, do Código de Processo Civil).'],
    ['p', 'Por ser expressão da verdade, firma a presente declaração.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  residencia: [
    ['t', 'DECLARAÇÃO DE RESIDÊNCIA'],
    ['p', '**{{nome}}**, {{qualificacao_resto_sem_endereco}}, **DECLARA**, para os devidos fins de direito e sob as penas da lei (art. 299 do Código Penal), que reside e é domiciliad{{c:o|a}} {{endereco_com_prep}}.'],
    ['p', 'Por ser expressão da verdade, firma a presente declaração.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  lgpd: [
    ['t', 'TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS'],
    ['p', '**{{nome}}**, {{qualificacao_resto}}, na qualidade de TITULAR dos dados, autoriza **{{escritorio}}**, {{escritorio_qualificacao}}, a tratar os seus dados pessoais, inclusive dados pessoais sensíveis (como dados de saúde, quando necessários à causa), nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais).'],
    ['h', '1. Finalidade'],
    ['p', 'Os dados serão utilizados exclusivamente para a prestação dos serviços advocatícios contratados, incluindo a elaboração de documentos, o ajuizamento e o acompanhamento de processos judiciais e administrativos, o contato com {{c:o|a}} TITULAR e o cumprimento de obrigações legais e regulatórias.'],
    ['h', '2. Compartilhamento'],
    ['p', 'Os dados poderão ser compartilhados com o Poder Judiciário, órgãos públicos, peritos, cartórios e demais entidades quando necessário à defesa dos interesses d{{c:o|a}} TITULAR, sendo vedado o seu uso para quaisquer outras finalidades.'],
    ['h', '3. Guarda e segurança'],
    ['p', 'Os dados serão armazenados com medidas de segurança adequadas pelo tempo necessário à prestação dos serviços e ao cumprimento dos prazos legais, inclusive de guarda de documentos profissionais.'],
    ['h', '4. Direitos do titular dos dados'],
    ['p', '{{c:O|A}} TITULAR poderá, a qualquer tempo, solicitar o acesso, a correção, a portabilidade ou a eliminação dos dados e revogar este consentimento pelo e-mail {{escritorio_email}}, ressalvadas as hipóteses legais de conservação.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  juntada: CABECALHO_PETICAO.concat([
    ['t', 'JUNTADA DE DOCUMENTOS'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência requerer a **JUNTADA DOS DOCUMENTOS** anexos, para que passem a integrar os autos e sejam apreciados por este Juízo.'],
    ['p', 'Diante do exposto, requer:'],
    ['p', 'a) o recebimento da presente manifestação e a juntada aos autos dos documentos que a acompanham;'],
    ['p', 'b) a apreciação dos documentos apresentados, com a intimação da parte contrária, quando cabível, em observância ao contraditório;'],
    ['p', 'c) o regular prosseguimento do feito.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  habilitacao: CABECALHO_PETICAO.concat([
    ['t', 'JUNTADA DE PROCURAÇÃO'],
    ['p', '**{{nome}}**, {{qualificacao_resto}}, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência requerer a **JUNTADA DO INSTRUMENTO DE MANDATO** anexo e a habilitação de **{{advogado_nome}}**, {{advogado_oab}}, nos autos do processo em epígrafe.'],
    ['p', 'Requer, ainda, que todas as intimações e publicações relativas ao presente feito sejam realizadas exclusivamente em nome de **{{advogado_nome}}**, {{advogado_oab}}, sob pena de nulidade (art. 272, § 5º, do Código de Processo Civil).'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  substabelecimento: [
    ['t', 'SUBSTABELECIMENTO COM RESERVA DE PODERES'],
    ['p', '**{{substabelecente_nome}}**, {{substabelecente_qualificacao}}, **SUBSTABELECE, COM RESERVA DE IGUAIS PODERES**, em favor de **{{advogado_nome}}**, {{advogado_qualificacao}}, os poderes que lhe foram conferidos por **{{nome}}**, {{qualificacao_resto_sem_endereco}}, para atuar nos autos do processo nº {{numero_processo}}.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['c', '**{{substabelecente_nome}}**'],
    ['c', '{{substabelecente_oab}}']
  ],
  contrato: [
    ['t', 'CONTRATO DE HONORÁRIOS ADVOCATÍCIOS'],
    ['p', 'Contrato de prestação de serviços advocatícios e de honorários que fazem entre si as partes abaixo qualificadas, nas condições a seguir especificadas:'],
    ['p', '**CONTRATANTE:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', '**CONTRATADA:** **{{escritorio}}**, {{escritorio_qualificacao}}, neste ato representada por **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['h', 'CLÁUSULA 1ª – DO OBJETO'],
    ['p', 'A CONTRATADA obriga-se a prestar {{c:ao|à}} CONTRATANTE os serviços advocatícios consistentes em: {{objeto}}.'],
    ['p', 'Parágrafo primeiro. Não estão incluídos neste contrato outros processos, incidentes autônomos, ações rescisórias e medidas não relacionadas ao objeto acima, que dependerão de ajuste próprio.'],
    ['p', 'Parágrafo segundo. Não estão incluídos neste contrato as despesas e os honorários para a realização de sustentação oral nas Turmas Recursais dos Juizados Especiais e/ou nos Tribunais, nem a interposição de recursos e/ou a apresentação de contrarrazões à Turma Nacional de Uniformização, aos Tribunais Superiores e ao Supremo Tribunal Federal, os quais dependerão de prévio acordo com {{c:o|a}} CONTRATANTE.'],
    ['h', 'CLÁUSULA 2ª – DOS HONORÁRIOS E DO PAGAMENTO'],
    ['p', '{{clausula_honorarios}}'],
    ['p', 'Parágrafo primeiro. Os pagamentos serão feitos por PIX ou depósito em favor da CONTRATADA ({{escritorio_pix}}), valendo o comprovante como recibo.'],
    ['p', 'Parágrafo segundo. Os valores contratados não excluem o direito da CONTRATADA ao recebimento integral dos honorários de sucumbência fixados em decisão judicial, que lhe pertencem com exclusividade (arts. 22 e 23 da Lei nº 8.906/1994).'],
    ['p', 'Parágrafo terceiro. Havendo recebimento de valores por meio de alvará, RPV, precatório, acordo ou depósito judicial, fica a CONTRATADA autorizada a reter o valor dos honorários contratados, repassando o saldo {{c:ao|à}} CONTRATANTE com a devida prestação de contas.'],
    ['p', '{{clausula_promissoria_contrato}}'],
    ['h', 'CLÁUSULA 3ª – DAS DESPESAS'],
    ['p', 'Não estão incluídas nos honorários as despesas com perícias, custas judiciais e/ou administrativas, emolumentos, cópias, certidões e diligências fora da Comarca de ajuizamento da ação, as quais correrão por conta d{{c:o|a}} CONTRATANTE.'],
    ['p', 'Parágrafo único. {{c:O|A}} CONTRATANTE arcará, ainda, com as despesas de deslocamento superiores a 100 km (cem quilômetros) da sede da CONTRATADA, quando a viagem se destinar a tratar de assuntos de seu interesse.'],
    ['h', 'CLÁUSULA 4ª – DAS OBRIGAÇÕES D{{c:O|A}} CONTRATANTE'],
    ['p', '{{c:O|A}} CONTRATANTE obriga-se a: a) providenciar e entregar à CONTRATADA todos os documentos e informações por ela solicitados, de forma verdadeira e completa; b) informar imediatamente qualquer mudança de telefone, endereço ou e-mail; c) comparecer às audiências, perícias e demais atos para os quais for intimad{{c:o|a}} ou convocad{{c:o|a}}.'],
    ['p', 'Parágrafo único. A CONTRATADA não se responsabiliza por prejuízos decorrentes da omissão ou da inexatidão de informações e documentos de responsabilidade d{{c:o|a}} CONTRATANTE.'],
    ['h', 'CLÁUSULA 5ª – DOS ACORDOS E DO RECEBIMENTO DE VALORES'],
    ['p', 'Fica expressamente vedado {{c:ao|à}} CONTRATANTE firmar qualquer acordo ou transação, bem como receber quaisquer importâncias referentes ao litígio objeto do presente contrato, sem a expressa anuência da CONTRATADA, hipótese em que os honorários serão devidos integralmente.'],
    ['h', 'CLÁUSULA 6ª – DA NATUREZA DA OBRIGAÇÃO'],
    ['p', 'A obrigação assumida pela CONTRATADA é de meio, e não de resultado, não se obrigando a garantir o resultado eventualmente esperado pel{{c:o|a}} CONTRATANTE, mas a empregar todo o zelo e a técnica profissional na defesa de seus interesses.'],
    ['h', 'CLÁUSULA 7ª – DO ATRASO E DA SUSPENSÃO DOS SERVIÇOS'],
    ['p', 'O atraso no pagamento de qualquer parcela sujeitará {{c:o|a}} CONTRATANTE à multa de 2% (dois por cento), a juros de 1% (um por cento) ao mês e à correção monetária pelo INPC, e o atraso superior a 30 (trinta) dias acarretará o vencimento antecipado das parcelas restantes, podendo a CONTRATADA promover a cobrança judicial, inclusive pela execução das notas promissórias e deste contrato, que vale como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994).'],
    ['p', 'Parágrafo único. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a CONTRATADA, independentemente de outras medidas, a suspender a prestação dos serviços não urgentes até a regularização e, persistindo a inadimplência, a renunciar ao mandato, mediante notificação {{c:ao|à}} CONTRATANTE com 10 (dez) dias de antecedência, período em que continuará a representá-l{{c:o|a}} para evitar prejuízo (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do Código de Processo Civil), cabendo {{c:ao|à}} CONTRATANTE constituir novo advogado. A suspensão ou a renúncia não afasta o dever de pagar os honorários vencidos e os proporcionais ao trabalho já realizado.'],
    ['h', 'CLÁUSULA 8ª – DAS MULTAS POR DESISTÊNCIA E POR AUSÊNCIA EM AUDIÊNCIA'],
    ['p', '{{c:O|A}} CONTRATANTE pagará à CONTRATADA multa equivalente a 2 (dois) salários mínimos vigentes à época do pagamento: a) em caso de desistência da ação ou da contratação; b) em caso de não comparecimento injustificado a audiência ou perícia para a qual tenha sido intimad{{c:o|a}} ou avisad{{c:o|a}} pela CONTRATADA.'],
    ['p', 'Parágrafo primeiro. As multas desta cláusula são devidas sem prejuízo dos honorários contratados e das consequências processuais da desistência ou da ausência, vencem na data do fato e, não pagas em 10 (dez) dias, podem ser cobradas judicialmente pela CONTRATADA, valendo este contrato como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994 e art. 784, III, do Código de Processo Civil).'],
    ['p', 'Parágrafo segundo. A desistência ou a revogação do mandato não desobriga {{c:o|a}} CONTRATANTE do pagamento dos honorários vencidos e dos proporcionais ao trabalho já realizado, nem dos honorários de êxito, caso o proveito econômico venha a ser obtido em razão dos atos praticados pela CONTRATADA.'],
    ['h', 'CLÁUSULA 9ª – DO DESCUMPRIMENTO'],
    ['p', 'Em caso de descumprimento de qualquer cláusula do presente contrato, a parte infratora pagará multa de 5% (cinco por cento) sobre o valor total do contrato, além de indenizar a parte prejudicada pelos danos e pelas despesas adicionais causados pelo descumprimento.'],
    ['h', 'CLÁUSULA 10ª – DO SIGILO E DOS DADOS PESSOAIS'],
    ['p', 'A CONTRATADA manterá sigilo sobre as informações recebidas e tratará os dados pessoais d{{c:o|a}} CONTRATANTE apenas para a execução deste contrato e o cumprimento de obrigações legais, nos termos do Estatuto da Advocacia e da Lei nº 13.709/2018 (LGPD).'],
    ['h', 'CLÁUSULA 11ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE'],
    ['a', '{{escritorio}}|CONTRATADA — {{advogado_assinatura}}, {{advogado_oab}}'],
    ['h', 'TESTEMUNHAS'],
    ['a', 'Testemunha 1|Nome: ____________________________   CPF: ________________'],
    ['a', 'Testemunha 2|Nome: ____________________________   CPF: ________________']
  ],
  prestacao: [
    ['t', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'],
    ['p', 'Contrato de prestação de serviços advocatícios de natureza extrajudicial que fazem entre si as partes abaixo qualificadas, nas condições a seguir especificadas:'],
    ['p', '**CONTRATANTE:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', '**CONTRATADA:** **{{escritorio}}**, {{escritorio_qualificacao}}, neste ato representada por **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['h', 'CLÁUSULA 1ª – DO OBJETO'],
    ['p', 'A CONTRATADA obriga-se a prestar {{c:ao|à}} CONTRATANTE os seguintes serviços advocatícios de natureza extrajudicial e consultiva: {{objeto}}.'],
    ['p', 'Parágrafo único. Caso seja necessária a propositura de ação judicial ou a defesa em processo judicial, as partes firmarão contrato próprio.'],
    ['h', 'CLÁUSULA 2ª – DO PRAZO'],
    ['p', 'Os serviços serão prestados a partir da assinatura deste instrumento e se encerrarão com a conclusão do objeto descrito na cláusula 1ª.'],
    ['h', 'CLÁUSULA 3ª – DOS HONORÁRIOS E DO PAGAMENTO'],
    ['p', '{{clausula_honorarios}}'],
    ['p', 'Parágrafo primeiro. Os pagamentos serão feitos por PIX ou depósito em favor da CONTRATADA ({{escritorio_pix}}), valendo o comprovante como recibo.'],
    ['p', '{{clausula_promissoria}}'],
    ['h', 'CLÁUSULA 4ª – DAS DESPESAS'],
    ['p', 'Taxas, emolumentos, certidões, deslocamentos e demais despesas necessárias à execução dos serviços correrão por conta d{{c:o|a}} CONTRATANTE, mediante prévia comunicação.'],
    ['h', 'CLÁUSULA 5ª – DAS OBRIGAÇÕES D{{c:O|A}} CONTRATANTE'],
    ['p', '{{c:O|A}} CONTRATANTE obriga-se a providenciar todos os documentos e informações solicitados pela CONTRATADA, de forma verdadeira e completa, e a informar qualquer mudança de telefone, endereço ou e-mail, não se responsabilizando a CONTRATADA por prejuízos decorrentes da omissão ou da inexatidão dessas informações.'],
    ['h', 'CLÁUSULA 6ª – DA NATUREZA DA OBRIGAÇÃO'],
    ['p', 'A obrigação assumida pela CONTRATADA é de meio, e não de resultado, não se obrigando a garantir o resultado eventualmente esperado pel{{c:o|a}} CONTRATANTE.'],
    ['h', 'CLÁUSULA 7ª – DO ATRASO, DA SUSPENSÃO DOS SERVIÇOS E DA DESISTÊNCIA'],
    ['p', 'O atraso no pagamento sujeitará {{c:o|a}} CONTRATANTE à multa de 2% (dois por cento), a juros de 1% (um por cento) ao mês e à correção monetária, servindo este instrumento como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994).'],
    ['p', 'Parágrafo primeiro. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a CONTRATADA, independentemente de outras medidas, a suspender a prestação dos serviços não urgentes até a regularização e, persistindo a inadimplência, a renunciar ao mandato, mediante notificação {{c:ao|à}} CONTRATANTE com 10 (dez) dias de antecedência, período em que continuará a representá-l{{c:o|a}} para evitar prejuízo (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do Código de Processo Civil), cabendo {{c:ao|à}} CONTRATANTE constituir novo advogado. A suspensão ou a renúncia não afasta o dever de pagar os honorários vencidos e os proporcionais ao trabalho já realizado.'],
    ['p', 'Parágrafo segundo. Em caso de desistência, {{c:o|a}} CONTRATANTE pagará à CONTRATADA multa equivalente a 2 (dois) salários mínimos vigentes, além dos honorários proporcionais ao trabalho já realizado, podendo a multa ser cobrada judicialmente com base neste contrato.'],
    ['h', 'CLÁUSULA 8ª – DO SIGILO E DOS DADOS PESSOAIS'],
    ['p', 'A CONTRATADA manterá sigilo sobre as informações recebidas e tratará os dados pessoais d{{c:o|a}} CONTRATANTE apenas para a execução deste contrato, nos termos do Estatuto da Advocacia e da Lei nº 13.709/2018 (LGPD).'],
    ['h', 'CLÁUSULA 9ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE'],
    ['a', '{{escritorio}}|CONTRATADA — {{advogado_assinatura}}, {{advogado_oab}}'],
    ['h', 'TESTEMUNHAS'],
    ['a', 'Testemunha 1|Nome: ____________________________   CPF: ________________'],
    ['a', 'Testemunha 2|Nome: ____________________________   CPF: ________________']
  ],
  assessoria: [
    ['t', 'CONTRATO DE ASSESSORIA JURÍDICA'],
    ['p', '**CONTRATANTE:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', '**CONTRATADA:** **{{escritorio}}**, {{escritorio_qualificacao}}, neste ato representada por **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['p', 'As partes acima identificadas têm entre si justo e contratado o presente contrato de assessoria jurídica, que se regerá pelas cláusulas seguintes e pela Lei nº 8.906/1994 (Estatuto da Advocacia e da OAB).'],
    ['h', 'CLÁUSULA 1ª – DO OBJETO'],
    ['p', 'A CONTRATADA prestará {{c:ao|à}} CONTRATANTE assessoria jurídica contínua, compreendendo: consultas e orientações verbais e por escrito; análise e elaboração de contratos, notificações e documentos; acompanhamento de questões administrativas; e participação em reuniões, quando solicitada.'],
    ['p', 'Parágrafo único. Ações judiciais, defesas em processos já existentes e procedimentos complexos não estão incluídos na mensalidade e serão objeto de contrato próprio, com condições diferenciadas {{c:ao|à}} CONTRATANTE.'],
    ['h', 'CLÁUSULA 2ª – DOS HONORÁRIOS'],
    ['p', '{{clausula_honorarios}}'],
    ['p', 'Parágrafo primeiro. Os pagamentos serão feitos por PIX ou depósito em favor da CONTRATADA ({{escritorio_pix}}), valendo o comprovante como recibo.'],
    ['p', 'Parágrafo segundo. O valor da mensalidade será reajustado anualmente pelo INPC ou, na sua falta, por outro índice oficial que o substitua.'],
    ['h', 'CLÁUSULA 3ª – DAS OBRIGAÇÕES D{{c:O|A}} CONTRATANTE'],
    ['p', '{{c:O|A}} CONTRATANTE obriga-se a providenciar todos os documentos e informações solicitados pela CONTRATADA, de forma verdadeira e completa, e a informar qualquer mudança de telefone, endereço ou e-mail.'],
    ['h', 'CLÁUSULA 4ª – DO PRAZO E DA RESCISÃO'],
    ['p', 'O presente contrato vigorará por 12 (doze) meses a contar da sua assinatura, renovando-se automaticamente por iguais períodos, e poderá ser rescindido por qualquer das partes mediante aviso prévio, por escrito, de 30 (trinta) dias, sem multa.'],
    ['h', 'CLÁUSULA 5ª – DO ATRASO'],
    ['p', 'O atraso no pagamento sujeitará {{c:o|a}} CONTRATANTE à multa de 2% (dois por cento), a juros de 1% (um por cento) ao mês e à correção monetária, valendo este contrato como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994).'],
    ['p', 'Parágrafo único. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a CONTRATADA, independentemente de outras medidas, a suspender a prestação dos serviços não urgentes até a regularização e, persistindo a inadimplência, a renunciar ao mandato, mediante notificação {{c:ao|à}} CONTRATANTE com 10 (dez) dias de antecedência, período em que continuará a representá-l{{c:o|a}} para evitar prejuízo (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do Código de Processo Civil), cabendo {{c:ao|à}} CONTRATANTE constituir novo advogado. A suspensão ou a renúncia não afasta o dever de pagar os honorários vencidos e os proporcionais ao trabalho já realizado.'],
    ['h', 'CLÁUSULA 6ª – DO SIGILO'],
    ['p', 'A CONTRATADA manterá sigilo sobre todas as informações recebidas em razão deste contrato, nos termos do Estatuto da Advocacia e da Lei Geral de Proteção de Dados Pessoais.'],
    ['h', 'CLÁUSULA 7ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE'],
    ['a', '{{escritorio}}|CONTRATADA — {{advogado_assinatura}}, {{advogado_oab}}'],
    ['h', 'TESTEMUNHAS'],
    ['a', 'Testemunha 1|Nome: ____________________________   CPF: ________________'],
    ['a', 'Testemunha 2|Nome: ____________________________   CPF: ________________']
  ],
  recibo: [
    ['t', 'RECIBO DE HONORÁRIOS ADVOCATÍCIOS'],
    ['t', '{{valor}}'],
    ['p', '**{{escritorio}}**, {{escritorio_qualificacao}}, declara que **RECEBEU** de **{{nome}}**, {{qualificacao_resto}}, a importância de **{{valor}}** ({{valor_extenso}}), referente a {{referente}}.'],
    ['p', 'Pelo que dá plena, geral e irrevogável quitação do valor acima.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ],
  procuracao_inventario: [
    ['t', 'PROCURAÇÃO — INVENTÁRIO E PARTILHA'],
    ['p', '**OUTORGANTE:** **{{nome}}**, {{qualificacao_curta}}.'],
    ['p', '**OUTORGAD{{adv:O|A}}:** **{{advogado_nome}}**, {{advogado_qualificacao}}.'],
    ['p', '**PODERES:** pelo presente instrumento, {{c:o|a}} OUTORGANTE confere {{adv:ao|à}} OUTORGAD{{adv:O|A}} poderes para representá-l{{c:o|a}} no inventário e na partilha dos bens deixados por [NOME DO(A) FALECIDO(A)], falecid{{c:o|a}} em [DATA DO ÓBITO], pela via judicial ou extrajudicial (escritura pública, art. 610 do Código de Processo Civil), podendo requerer a abertura do inventário ou do arrolamento, requerer e aceitar a nomeação de inventariante, prestar compromisso, primeiras e últimas declarações, apresentar e concordar com o plano de partilha, assinar a escritura pública de inventário e partilha e demais documentos perante tabelionatos e registros de imóveis, representar {{c:o|a}} OUTORGANTE perante a Receita Federal, as Fazendas Estadual e Municipal (inclusive para declarar e recolher o ITCMD), prefeituras, DETRAN, bancos e demais instituições, requerer certidões e alvarás, levantar valores, receber e dar quitação, com os poderes da cláusula ad judicia et extra para o foro em geral e os especiais do art. 105 do Código de Processo Civil, inclusive para transigir, desistir e substabelecer, com ou sem reserva de poderes.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  isencao_irpf: [
    ['t', 'REQUERIMENTO DE ISENÇÃO DO IMPOSTO DE RENDA'],
    ['l', 'À fonte pagadora: [INSS / ÓRGÃO OU ENTIDADE PAGADORA]'],
    ['l', 'Benefício / matrícula nº [NÚMERO]'],
    ['p', '**{{nome}}**, {{qualificacao_curta}}, vem, respeitosamente, **REQUERER** a isenção do imposto de renda sobre os proventos de aposentadoria, reforma ou pensão que recebe, com fundamento no art. 6º, inciso XIV, da Lei nº 7.713/1988, por ser portador{{c:|a}} de [DOENÇA] (CID [CID]), conforme laudo pericial emitido por serviço médico oficial, nos termos do art. 30 da Lei nº 9.250/1995.'],
    ['p', 'Requer, ainda, que a isenção seja aplicada a partir da data do diagnóstico indicada no laudo, com a cessação imediata da retenção na fonte e a restituição dos valores indevidamente retidos.'],
    ['p', 'Junta: laudo pericial oficial, documento de identidade, CPF e comprovante do benefício.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}']
  ],
  comparecimento: [
    ['t', 'DECLARAÇÃO DE COMPARECIMENTO'],
    ['p', '**{{escritorio}}**, {{escritorio_qualificacao}}, **DECLARA**, para os devidos fins, que **{{nome}}**, {{qualificacao_curta}}, compareceu a este escritório em {{data_extenso}}, das [HH:MM] às [HH:MM], para atendimento jurídico.'],
    ['p', 'Por ser verdade, firma a presente declaração.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ],
  notificacao: [
    ['t', 'NOTIFICAÇÃO EXTRAJUDICIAL'],
    ['p', '**NOTIFICANTE:** **{{nome}}**, {{qualificacao_resto}}, por {{adv:seu|sua}} advogad{{adv:o|a}} **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['p', '**NOTIFICADO(A):** [NOME DO(A) NOTIFICADO(A)], [QUALIFICAÇÃO E ENDEREÇO].'],
    ['p', 'Pela presente, fica Vossa Senhoria **NOTIFICADA** do seguinte: [DESCREVER OS FATOS].'],
    ['p', 'Diante disso, solicita-se que, no prazo de [PRAZO] dias contados do recebimento desta notificação, Vossa Senhoria [DESCREVER O QUE SE PEDE], ou entre em contato com o escritório para uma solução amigável.'],
    ['p', 'O não atendimento no prazo indicado autoriza a adoção das medidas judiciais cabíveis, servindo esta notificação como prova da tentativa de solução extrajudicial e para os fins dos arts. 397 e 405 do Código Civil.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ],
  contrato_previdenciario: [
    ['t', 'CONTRATO DE HONORÁRIOS ADVOCATÍCIOS — PREVIDENCIÁRIO'],
    ['p', 'Contrato de honorários advocatícios que fazem entre si as partes abaixo qualificadas, em conformidade com a tabela de honorários da OAB/SC, nas condições a seguir especificadas:'],
    ['p', '**CONTRATANTE:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', '**CONTRATADA:** **{{escritorio}}**, {{escritorio_qualificacao}}, neste ato representada por **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['h', 'CLÁUSULA 1ª – DO OBJETO'],
    ['p', 'A CONTRATADA obriga-se a atuar em favor d{{c:o|a}} CONTRATANTE em processo administrativo e/ou judicial contra o Instituto Nacional do Seguro Social (INSS){{objeto_prev}}.'],
    ['h', 'CLÁUSULA 2ª – DOS HONORÁRIOS (SOMENTE EM CASO DE ÊXITO)'],
    ['p', 'a) Nas CONCESSÕES, {{c:o|a}} CONTRATANTE pagará o equivalente a 2 (dois) benefícios ou 30% (trinta por cento) dos valores brutos recebidos judicial e/ou administrativamente até a data da efetiva implantação do benefício, o que for maior, não podendo esta quantia ser inferior a 3 (três) vezes o valor do benefício, ainda que {{c:o|a}} CONTRATANTE opte por não recebê-lo;'],
    ['p', 'b) Nas REVISÕES, {{c:o|a}} CONTRATANTE pagará 30% (trinta por cento) dos valores brutos recebidos judicial e/ou administrativamente até a data da efetiva implantação da revisão, não inferiores ao mínimo da tabela da OAB/SC vigente na data do pagamento.'],
    ['p', 'Parágrafo primeiro. Havendo implantação do direito por tutela antecipada, medida cautelar ou de ofício, o percentual de 30% (trinta por cento) incidirá também sobre o período de manutenção da medida.'],
    ['p', 'Parágrafo segundo. Valores recebidos administrativamente ou descontados do benefício durante o processo judicial não serão abatidos dos atrasados para o cálculo do percentual.'],
    ['p', 'Parágrafo terceiro. Havendo procedência parcial do pedido, será devido, no mínimo, o valor previsto na tabela de honorários da OAB/SC.'],
    ['p', 'Parágrafo quarto. Os valores contratados não excluem o direito da CONTRATADA ao recebimento integral dos honorários de sucumbência (arts. 22 e 23 da Lei nº 8.906/1994). Havendo pagamento por RPV, precatório ou alvará, fica a CONTRATADA autorizada a reter os honorários, repassando o saldo com a devida prestação de contas.'],
    ['p', 'Parágrafo quinto. Os pagamentos serão feitos por PIX ou depósito em favor da CONTRATADA ({{escritorio_pix}}), valendo o comprovante como recibo.'],
    ['h', 'CLÁUSULA 3ª – DAS DESPESAS'],
    ['p', 'Correrão por conta d{{c:o|a}} CONTRATANTE as despesas com perícias, custas, certidões e diligências, bem como os honorários para sustentação oral e para recursos aos Tribunais Superiores, que dependerão de ajuste próprio.'],
    ['h', 'CLÁUSULA 4ª – DAS OBRIGAÇÕES D{{c:O|A}} CONTRATANTE'],
    ['p', '{{c:O|A}} CONTRATANTE obriga-se a entregar os documentos solicitados, informar mudanças de telefone e endereço e comparecer às perícias médicas, avaliações sociais e audiências para as quais for convocad{{c:o|a}}.'],
    ['h', 'CLÁUSULA 5ª – DAS MULTAS, DO ATRASO E DA SUSPENSÃO DOS SERVIÇOS'],
    ['p', '{{c:O|A}} CONTRATANTE pagará à CONTRATADA multa equivalente a 2 (dois) salários mínimos vigentes à época do pagamento: a) em caso de desistência; b) em caso de não comparecimento injustificado a perícia, avaliação social ou audiência para a qual tenha sido convocad{{c:o|a}} ou avisad{{c:o|a}} pela CONTRATADA. As multas são devidas sem prejuízo dos honorários e podem ser cobradas judicialmente, valendo este contrato como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994 e art. 784, III, do Código de Processo Civil).'],
    ['p', 'Parágrafo único. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a CONTRATADA, independentemente de outras medidas, a suspender a prestação dos serviços não urgentes até a regularização e, persistindo a inadimplência, a renunciar ao mandato, mediante notificação {{c:ao|à}} CONTRATANTE com 10 (dez) dias de antecedência, período em que continuará a representá-l{{c:o|a}} para evitar prejuízo (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do Código de Processo Civil), cabendo {{c:ao|à}} CONTRATANTE constituir novo advogado. A suspensão ou a renúncia não afasta o dever de pagar os honorários vencidos e os proporcionais ao trabalho já realizado.'],
    ['h', 'CLÁUSULA 6ª – DO FALECIMENTO E DA HABILITAÇÃO DE HERDEIROS'],
    ['p', 'Em caso de falecimento d{{c:o|a}} CONTRATANTE, os sucessores obrigam-se a cumprir integralmente o presente contrato, sendo devidos honorários adicionais de 5% (cinco por cento) pela habilitação dos herdeiros.'],
    ['h', 'CLÁUSULA 7ª – DA NATUREZA DA OBRIGAÇÃO E DO SIGILO'],
    ['p', 'A obrigação da CONTRATADA é de meio, e não de resultado. A CONTRATADA manterá sigilo sobre as informações recebidas e tratará os dados pessoais d{{c:o|a}} CONTRATANTE apenas para a execução deste contrato (Lei nº 13.709/2018 — LGPD).'],
    ['h', 'CLÁUSULA 8ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE'],
    ['a', '{{escritorio}}|CONTRATADA — {{advogado_assinatura}}, {{advogado_oab}}'],
    ['h', 'TESTEMUNHAS'],
    ['a', 'Testemunha 1|Nome: ____________________________   CPF: ________________'],
    ['a', 'Testemunha 2|Nome: ____________________________   CPF: ________________']
  ],
  cobranca: [
    ['t', 'NOTIFICAÇÃO EXTRAJUDICIAL'],
    ['t', 'COBRANÇA DE HONORÁRIOS ADVOCATÍCIOS'],
    ['p', '**NOTIFICANTE:** **{{escritorio}}**, {{escritorio_qualificacao}}.'],
    ['p', '**NOTIFICAD{{c:O|A}}:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', 'Prezad{{c:o|a}} cliente, consta em aberto, referente aos honorários advocatícios contratados{{referente_processo}}, o pagamento das seguintes parcelas:'],
    ['p', '{{parcelas_atrasadas}}'],
    ['p', 'O valor total em atraso é de **{{total_atraso}}** ({{total_atraso_extenso}}), sem prejuízo da multa, dos juros e da correção monetária previstos no contrato.'],
    ['p', 'Fica Vossa Senhoria **NOTIFICAD{{c:O|A}}** a efetuar o pagamento no prazo de **5 (cinco) dias**, contados do recebimento desta notificação, por PIX, depósito ou diretamente no escritório, ou a entrar em contato para negociar o débito.'],
    ['p', 'Decorrido o prazo sem pagamento ou acordo, o escritório adotará as medidas cabíveis para a cobrança, inclusive judicial, valendo o contrato de honorários como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994).'],
    ['p', 'Caso o pagamento já tenha sido efetuado, por favor desconsidere esta notificação e nos envie o comprovante.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]
};

/* ---------- Advogados (outorgados) ---------- */

function advogados_() {
  var lista = [];
  try { lista = tabela_('Advogados').linhas.filter(function (a) { return a.ativo !== 'não'; }).map(limpar_); } catch (e) { /* aba nova */ }
  if (!lista.length) lista = [{ id: 'A-julian', nome: 'Júlian Marcelino Araújo', oab: '54.832', uf: 'SC', tratamento: 'advogada', email: ESCRITORIO_PADRAO.email, telefone: ESCRITORIO_PADRAO.telefone, ativo: 'sim', padrao: 'sim' }];
  return lista;
}

function semearAdvogados_() {
  var tab = tabela_('Advogados');
  if (tab.linhas.length) return;
  inserirLinha_(tab, { id: novoId_('A'), nome: 'Júlian Marcelino Araújo', oab: '54.832', uf: 'SC', tratamento: 'advogada',
    email: ESCRITORIO_PADRAO.email, telefone: ESCRITORIO_PADRAO.telefone, ativo: 'sim', padrao: 'sim', criado_em: new Date().toISOString() });
}

function salvarAdvogado_(d, u) {
  return comTrava_(function () {
    var a = d.advogado || {};
    var nome = String(a.nome || '').trim();
    if (!nome) throw falha_('Informe o nome do(a) advogado(a).');
    var oab = String(a.oab || '').trim();
    if (!/\d/.test(oab)) throw falha_('Informe o número da OAB.');
    var uf = String(a.uf || 'SC').trim().toUpperCase().slice(0, 2);
    var tab = tabela_('Advogados');
    var dados = { nome: nome, oab: oab, uf: uf, tratamento: a.tratamento === 'advogado' ? 'advogado' : 'advogada',
      email: String(a.email || '').trim(), telefone: String(a.telefone || '').trim(), ativo: a.ativo === 'não' ? 'não' : 'sim',
      padrao: a.padrao === 'sim' ? 'sim' : 'não' };
    if (dados.padrao === 'sim') tab.linhas.forEach(function (x) { if (x.padrao === 'sim' && x.id !== a.id) atualizarLinha_(tab, x, { padrao: 'não' }); });
    if (a.id) {
      var linha = tab.linhas.filter(function (x) { return x.id === a.id; })[0];
      if (!linha) throw falha_('Advogado(a) não encontrado(a).');
      atualizarLinha_(tab, linha, dados);
      registrar_(u.usuario, 'advogado alterado', nome);
      return { id: linha.id };
    }
    dados.id = novoId_('A'); dados.criado_em = new Date().toISOString();
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'advogado cadastrado', nome);
    return { id: dados.id };
  });
}

/** Qualificação do(a) advogado(a) sem o nome (o nome vai em negrito no modelo). */
function qualificacaoAdvogadoResto_(a) {
  return qualificacaoAdvogado_(a).replace(/^[^,]+,\s*/, '');
}

/** "54.832" + "SC" → "OAB/SC 54.832". */
function oabTexto_(a) { return 'OAB/' + (a.uf || 'SC') + ' ' + a.oab; }

/** Nome como a pessoa escreve: "Júlian Marcelino Araújo". */
function nomeAssinatura_(nome) { return nomeProprio_(String(nome || '').toUpperCase()); }

/** Juízo para o cabeçalho da petição, a partir do órgão cadastrado no processo. */
function juizoDoProcesso_(p, numero) {
  var tribunal = (p && p.tribunal) || tribunalDoNumero_(numero);
  var orgao = String((p && p.orgao) || '').trim();
  if (/\.0000$/.test(numero || '') || /2º grau/i.test(orgao)) return 'EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) RELATOR(A)';
  if (orgao) {
    var o = orgao.replace(/\bVT\b/i, 'VARA DO TRABALHO DE').replace(/\bJEC\b/i, 'JUIZADO ESPECIAL CÍVEL DE').replace(/\bJEF\b/i, 'JUIZADO ESPECIAL FEDERAL DE');
    return 'AO JUÍZO DA ' + o.toUpperCase() + (/\/[A-Z]{2}$/.test(o) ? '' : '/SC');
  }
  if (/^TRT/.test(tribunal)) return 'AO JUÍZO DA ___ VARA DO TRABALHO DE __________/SC';
  if (/^TRF/.test(tribunal)) return 'AO JUÍZO DA ___ VARA FEDERAL DE __________/SC';
  return 'AO JUÍZO DA ___ VARA DA COMARCA DE __________/SC';
}

/** Juízo do cabeçalho: usa vara e comarca do formulário (ou do cadastro do processo). */
function juizoTexto_(j, p, numero) {
  if (!j || (!j.vara && !j.comarca)) return juizoDoProcesso_(p, numero);
  if (/\.0000$/.test(numero || '')) return juizoDoProcesso_(p, numero);
  var vara = String(j.vara || '___ VARA').toUpperCase(), com = String(j.comarca || '__________/SC').toUpperCase();
  if (/TRABALHO|FEDERAL|CEJUSC/.test(vara)) return 'AO JUÍZO DA ' + vara + ' DE ' + com;
  return 'AO JUÍZO DA ' + vara + ' DA COMARCA DE ' + com;
}

function qualificacaoAdvogado_(a) {
  var esc = escritorio_();
  var nac = a.tratamento === 'advogado' ? 'brasileiro, advogado inscrito' : 'brasileira, advogada inscrita';
  var txt = String(a.nome).toUpperCase() + ', ' + nac + ' na OAB/' + (a.uf || 'SC') + ' sob o nº ' + a.oab +
    ', com escritório profissional na ' + esc.endereco;
  if (a.email) txt += ', e-mail ' + a.email;
  if (a.telefone) txt += ', telefone ' + a.telefone;
  return txt;
}

/* ---------- Modelos do escritório na pasta do Drive ---------- */

// Pasta com os modelos-base do escritório ("01. Declaração de residência", "05. Emenda à petição inicial"...).
// Todo Google Docs colocado nela aparece sozinho na aba Modelos.
var PASTA_MODELOS_ESCRITORIO = '1BYDfDiNV6WHKLHZXwOyjY8BripbcbYt0';

/** Modelos da pasta do Drive que a usuária pediu para não aparecer no painel (o painel já tem os seus). */
var MODELOS_DRIVE_OCULTOS = [/^apela[cç][aã]o criminal/i, /^cumprimento de senten[cç]a/i, /^reclama[cç][aã]o trabalhista/i,
  /^peti[cç][aã]o inicial/i, /^r[eé]plica/i, /^juntada de documentos/i, /^declara[cç][aã]o de resid[eê]ncia/i, /^cobran[cç]a de honor[aá]rios/i];

/** Modelos do Drive que são petições dentro de um processo (exigem o nº do processo). */
function modeloDrivePrecisaProcesso_(nome) {
  return /pesquisa de endere|emenda|juntada|manifesta|contrarraz|impugna|embargos|recurso|r[eé]plica|alega[cç]|habilita/i.test(nomeModeloDrive_(nome));
}

function modelosDrive_() {
  return modelosDriveTodos_().filter(function (m) {
    var n = nomeModeloDrive_(m.nome);
    return !MODELOS_DRIVE_OCULTOS.some(function (re) { return re.test(n); });
  });
}

function modelosDriveTodos_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('modelos_drive');
  if (guardado) return JSON.parse(guardado);
  var lista = [];
  try {
    var pasta = DriveApp.getFolderById(config_('MODELOS_ESCRITORIO_PASTA') || PASTA_MODELOS_ESCRITORIO);
    var it = pasta.getFilesByType(MimeType.GOOGLE_DOCS);
    while (it.hasNext()) { var f = it.next(); lista.push({ id: f.getId(), nome: f.getName() }); }
  } catch (e) { /* pasta inacessível: segue só com os modelos do painel */ }
  lista.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  cache.put('modelos_drive', JSON.stringify(lista), 600);
  return lista;
}

/** "05. Emenda à petição inicial — Cível — Araújo Advocacia" → "Emenda à petição inicial — Cível". */
function nomeModeloDrive_(nome) {
  return String(nome).replace(/^\d+\s*[.)-]\s*/, '').replace(/\s*[—-]\s*Araújo Advocacia\s*$/i, '').trim();
}

/** "2ª VT Tubarão" → { numero: '2ª', vara: '2ª Vara do Trabalho', cidade: 'Tubarão/SC' }. */
function orgaoPartes_(orgao) {
  var o = String(orgao || '').trim();
  if (!o) return { numero: '', vara: '', cidade: '' };
  var num = (/(\d+)\s*[ªaº]?/.exec(o) || [])[1];
  var numero = num ? num + 'ª' : '';
  var tipo = /\bVT\b|trabalho/i.test(o) ? 'Vara do Trabalho' : /federal|JEF/i.test(o) ? 'Vara Federal' : /JEC|juizado/i.test(o) ? 'Juizado Especial Cível'
    : /fam[ií]lia/i.test(o) ? 'Vara da Família' : /criminal/i.test(o) ? 'Vara Criminal' : /c[ií]vel/i.test(o) ? 'Vara Cível' : /CEJUSC/i.test(o) ? 'CEJUSC' : 'Vara';
  var cidade = o.replace(/\d+\s*[ªaº]?/, '').replace(/\b(VT|Vara|Varas|do|da|de|dos|Trabalho|C[ií]vel|Federal|Criminal|Fam[ií]lia|JEC|JEF|Juizado|Especial|CEJUSC|Unidade|Regional|Única|Unica|-|JT)\b/gi, ' ')
    .replace(/[\/-]\s*[A-Z]{2}\s*$/, '').replace(/\s+/g, ' ').trim();
  return { numero: numero, vara: (numero ? numero + ' ' : '') + tipo, cidade: cidade ? cidade + '/SC' : '' };
}

/**
 * Preenche os campos entre colchetes dos modelos do escritório, olhando o contexto de cada parágrafo:
 * "AO JUÍZO DA [VARA] DA COMARCA DE [CIDADE/UF]", "Processo nº [NÚMERO]", "Reclamante: [NOME]",
 * "[NOME DA PARTE]", CPF, RG, endereço e a linha "[CIDADE/UF], [DATA]". O resto fica para a advogada.
 */
function preencherColchetes_(corpo, x) {
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var todas = function (par, alvo, valor) { if (valor) par.editAsText().replaceText(esc(alvo), String(valor).replace(/\$/g, '\\$')); };
  var primeira = function (par, alvo, valor) {
    if (!valor) return;
    var r = par.findText(esc(alvo));
    if (!r) return;
    var el = r.getElement().asText();
    el.deleteText(r.getStartOffset(), r.getEndOffsetInclusive());
    el.insertText(r.getStartOffset(), String(valor));
  };
  var RE_NOME_CLIENTE = /\[NOME (COMPLETO )?(DA PARTE( RECLAMANTE| AUTORA| REQUERENTE| EXEQUENTE)?|DO\(A\) (RECLAMANTE|DECLARANTE|RESIDENTE|TITULAR DO CRÉDITO|AUTOR\(A\)|REQUERENTE|EXEQUENTE|CLIENTE|OUTORGANTE|CONTRATANTE|APELANTE))\]/g;
  var n = 0;
  corpo.getParagraphs().forEach(function (par) {
    var t = par.getText();
    if (t.indexOf('[') < 0) return;
    var nt = normalizar_(t);
    if (/ao juizo|excelentissim|egregio/.test(nt)) {
      todas(par, '[VARA CÍVEL]', x.vara); todas(par, '[VARA]', x.vara); todas(par, '[NÚMERO]', x.varaNumero); todas(par, '[CIDADE/UF]', x.comarca);
      n++; return;
    }
    if (/^processo n/.test(nt)) { todas(par, '[NÚMERO]', x.numero); n++; return; }
    if (/^(autor|reclamante|requerente|exequente|apelante|agravante|embargante|impetrante|recorrente|querelante)/.test(nt)) { todas(par, '[NOME]', x.ativo); todas(par, '[NOME(S)]', x.ativo); n++; return; }
    if (/^(reu|re\(|reclamad|requerid|executad|apelad|agravad|embargad|impetrad|recorrid|querelad)/.test(nt)) { todas(par, '[NOME]', x.passivo); todas(par, '[NOME(S)]', x.passivo); n++; return; }
    if (/^\[cidade\/uf\], \[(data|dia)\]/.test(nt)) {
      todas(par, '[CIDADE/UF]', x.cidadeAss); todas(par, '[DATA]', x.dataExtenso); todas(par, '[DIA]', x.dia); todas(par, '[MÊS]', x.mes); todas(par, '[ANO]', x.ano);
      n++; return;
    }
    var nomes = t.match(RE_NOME_CLIENTE) || [];
    var doCliente = nomes.length || /^(cpf:|contato do\(a\) declarante)/.test(nt);
    nomes.forEach(function (m) { todas(par, m, x.nome); });
    if (!doCliente) { todas(par, '[NOME DA PARTE]', x.nome); return; }
    n++;
    primeira(par, '[QUALIFICAÇÃO COMPLETA, CPF/CNPJ, E-MAIL E ENDEREÇO]', x.qualificacao);
    primeira(par, '[QUALIFICAÇÃO COMPLETA]', x.qualificacaoBasica);
    todas(par, '[NACIONALIDADE]', x.nacionalidade || 'brasileiro(a)'); todas(par, '[ESTADO CIVIL]', x.estadoCivil); todas(par, '[PROFISSÃO]', x.profissao);
    todas(par, '[CPF]', x.cpf); todas(par, '[RG/ÓRGÃO EXPEDIDOR]', x.rg); todas(par, '[RG]', x.rg);
    primeira(par, 'CPF nº [NÚMERO]', x.cpf ? 'CPF nº ' + x.cpf : '');
    primeira(par, '[E-MAIL]', x.email); primeira(par, '[ENDEREÇO COMPLETO]', x.endereco);
    todas(par, '[LOGRADOURO, NÚMERO, COMPLEMENTO, BAIRRO, CIDADE/UF E CEP]', x.endereco);
    todas(par, '[TELEFONE OU E-MAIL]', x.telefone || x.email);
  });
  return n;
}

/* ---------- Pasta e Google Docs dos modelos ---------- */

function pastaModelos_() {
  var id = config_('PASTA_MODELOS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  var pai = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  var base = pai.hasNext() ? pai.next() : DriveApp.getRootFolder();
  var pasta = base.createFolder('MODELOS (editáveis)');
  setConfig_('PASTA_MODELOS_ID', pasta.getId(), 'Pasta dos modelos de documentos');
  return pasta;
}

/** Garante que o modelo exista no Google Docs (cria a primeira versão na primeira vez). */
function modeloId_(chave, verificar) {
  var cfg = MODELOS[chave];
  var id = config_(cfg.config);
  if (id && !verificar) return id;
  if (id) { try { DriveApp.getFileById(id).getName(); return id; } catch (e) { /* recria */ } }
  (cfg.antigo || []).forEach(function (k) {
    if (!config_(k)) return;
    try { var velho = DriveApp.getFileById(config_(k)); if (!/^ANTIGO/.test(velho.getName())) velho.setName('ANTIGO — ' + velho.getName()); } catch (e) { /* já apagado */ }
  });
  var doc = DocumentApp.create('MODELO — ' + cfg.nome);
  montarPadraoVisual_(doc, TEXTO_MODELOS[chave], cfg.umaFolha);
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(pastaModelos_());
  setConfig_(cfg.config, doc.getId(), 'Modelo: ' + cfg.nome);
  return doc.getId();
}

/** Texto com **negrito** → texto limpo e trechos em negrito. */
function trechosNegrito_(txt) {
  var limpo = '', negritos = [], partes = String(txt).split('**');
  partes.forEach(function (p, i) {
    if (i % 2 === 1 && p) negritos.push([limpo.length, limpo.length + p.length - 1]);
    limpo += p;
  });
  return { texto: limpo, negritos: negritos };
}

/**
 * Padrão visual do escritório (modelo "Juntada de documentos"): EB Garamond 12, justificado, espaço depois
 * do parágrafo, logo centralizado no topo com linha, rodapé em itálico com endereço, telefone, CNPJ e OAB.
 */
function montarPadraoVisual_(doc, linhas, compacto) {
  var A = DocumentApp.HorizontalAlignment;
  var corpo = doc.getBody();
  corpo.clear();
  if (compacto) corpo.setMarginTop(28).setMarginBottom(28).setMarginLeft(71).setMarginRight(50);
  else corpo.setMarginTop(42).setMarginBottom(42).setMarginLeft(85).setMarginRight(57);
  var fonte = function (el, tam) { var t = el.editAsText(); if (t.getText().length) t.setFontFamily('EB Garamond').setFontSize(tam || 12); return el; };
  // cabeçalho: logo + linha
  var cab = doc.getHeader() || doc.addHeader();
  var pLogo = cab.getParagraphs()[0] || cab.appendParagraph('');
  pLogo.setAlignment(A.CENTER);
  var blob = null;
  LOGO_DOCUMENTOS.some(function (url) {
    try { var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) blob = r.getBlob(); } catch (e) { /* tenta o próximo */ }
    return !!blob;
  });
  if (blob) pLogo.appendInlineImage(blob).setWidth(compacto ? 80 : 105).setHeight(compacto ? 63 : 83);
  else { pLogo.appendText('ARAÚJO ADVOCACIA'); fonte(pLogo, 14); }
  cab.appendParagraph('').appendHorizontalRule();
  // rodapé: linha + dados do escritório
  var rod = doc.getFooter() || doc.addFooter();
  (rod.getParagraphs()[0] || rod.appendParagraph('')).appendHorizontalRule();
  escritorio_().rodape.forEach(function (l) {
    var p = rod.appendParagraph(l).setAlignment(A.CENTER).setSpacingAfter(0).setSpacingBefore(0);
    p.editAsText().setFontFamily('EB Garamond').setFontSize(9).setItalic(true);
  });
  var par = function (txt, alin, depois, antes) {
    var t = trechosNegrito_(txt);
    var p = corpo.appendParagraph(t.texto);
    var dep = depois === undefined ? 10 : depois;
    p.setAlignment(alin).setSpacingAfter(compacto ? Math.min(dep, 6) : dep).setSpacingBefore(compacto ? Math.min(antes || 0, 8) : (antes || 0)).setLineSpacing(compacto ? 1.1 : 1.5);
    fonte(p);
    var ed = p.editAsText();
    t.negritos.forEach(function (r) { if (r[1] >= r[0]) ed.setBold(r[0], r[1], true); });
    return p;
  };
  linhas.forEach(function (l) {
    var tipo = l[0], txt = l[1] || '';
    if (tipo === 'pb') { corpo.appendPageBreak(); return; }
    if (tipo === 't') { par('**' + txt + '**', A.CENTER, 12, 6); return; }
    if (tipo === 'h') { par('**' + txt + '**', A.LEFT, 6, 6); return; }
    if (tipo === 'l') { par(txt, A.LEFT, 2); return; }
    if (tipo === 'c') { par(txt, A.CENTER, 8); return; }
    if (tipo === 'adv') {
      par('**{{advogado_assinatura}}**', A.CENTER, 0, 12);
      par('{{advogado_oab}}', A.CENTER, 10);
      return;
    }
    if (tipo === 'a') {
      var partesA = txt.split('|');
      par('', A.CENTER, 0, 18);
      par('_____________________________________________', A.CENTER, 0);
      if (partesA.length > 1) {
        par('**' + partesA[0] + '**', A.CENTER, 0);
        var sub = par(partesA.slice(1).join(' '), A.CENTER, 10);
        sub.editAsText().setFontSize(10);
      } else par(txt, A.CENTER, 10);
      return;
    }
    par(txt, A.JUSTIFY, 10);
  });
}

function listarModelos_(d, u) {
  var pode = PERFIS[u.perfil];
  var doDrive = modelosDrive_().map(function (m) {
    var precisa = modeloDrivePrecisaProcesso_(m.nome);
    return { chave: 'drive:' + m.id, nome: nomeModeloDrive_(m.nome), grupo: precisa ? 'Petições (precisam do nº do processo)' : 'Modelos do escritório (Drive)', escritorio: true,
      processo: precisa, url: 'https://docs.google.com/document/d/' + m.id + '/edit' };
  });
  return {
    pastaEscritorio: 'https://drive.google.com/drive/folders/' + (config_('MODELOS_ESCRITORIO_PASTA') || PASTA_MODELOS_ESCRITORIO),
    modelos: [].concat(Object.keys(MODELOS).filter(function (k) { return !MODELOS[k].financeiro || pode.financeiro; }).map(function (k) {
      var m = MODELOS[k];
      return { chave: k, nome: m.nome, grupo: m.grupo, honorarios: !!m.honorarios, mensal: !!m.mensal, recibo: !!m.recibo, processo: !!m.processo, cobranca: !!m.cobranca,
        menores: !!m.menores, url: m.gerado ? '' : 'https://docs.google.com/document/d/' + modeloId_(k) + '/edit' };
    }), doDrive),
    tipos: Object.keys(TIPOS_ACAO).map(function (k) { return { chave: k, nome: TIPOS_ACAO[k].nome, area: TIPOS_ACAO[k].area }; }),
    advogados: advogados_()
  };
}

/* ---------- Textos montados com o cadastro ---------- */

function enderecoCompleto_(c) {
  return [c.endereco, c.cidade && c.uf ? c.cidade + '/' + c.uf : c.cidade, c.cep ? 'CEP ' + c.cep : ''].filter(String).join(', ');
}

function qualificacao_(c, semEndereco, semContato) {
  var partes = [];
  var end = enderecoCompleto_(c);
  var g = generoCliente_(c);
  var x = function (m, f) { return g === 'F' ? f : g === 'M' ? m : m + '(' + f.slice(-1) + ')'; };
  if (c.tipo === 'PJ') {
    partes.push(String(c.nome).toUpperCase() + ', pessoa jurídica de direito privado');
    if (c.cpf_cnpj) partes.push('inscrita no CNPJ sob o nº ' + c.cpf_cnpj);
    if (end && !semEndereco) partes.push('com sede ' + comPreposicao_(end));
    if (c.representante) partes.push('neste ato representada por ' + c.representante);
  } else {
    partes.push(String(c.nome).toUpperCase());
    partes.push(x('brasileiro', 'brasileira'));
    if (c.estado_civil) partes.push(estadoCivilGenero_(c.estado_civil, g));
    if (c.profissao) partes.push(String(c.profissao).trim());
    if (c.nascimento) partes.push(x('nascido', 'nascida') + ' em ' + dataBR_(c.nascimento));
    if (c.rg) partes.push(x('portador', 'portadora') + ' da cédula de identidade RG nº ' + c.rg);
    if (c.cpf_cnpj) partes.push(x('inscrito', 'inscrita') + ' no CPF sob o nº ' + c.cpf_cnpj);
    if (end && !semEndereco) partes.push('residente e ' + x('domiciliado', 'domiciliada') + ' ' + comPreposicao_(end));
  }
  if (!semEndereco && !semContato) {
    if (c.telefone) partes.push('telefone ' + c.telefone);
    if (c.email) partes.push('e-mail ' + c.email);
  }
  return partes.join(', ');
}

/** "Rua das Flores, 10" → "na Rua das Flores, 10"; "Loteamento X" → "no Loteamento X"; senão "em ...". */
function comPreposicao_(end) {
  var t = String(end || '').trim();
  if (/^(rua|r\.|avenida|av\.?|travessa|tv\.|rodovia|rod\.|estrada|servid[aã]o|alameda|pra[cç]a|linha|vila|localidade|comunidade|marginal|via)\b/i.test(t)) return 'na ' + t;
  if (/^(loteamento|beco|largo|s[ií]tio|condom[ií]nio|conjunto|bairro|residencial|parque|jardim|caminho)\b/i.test(t)) return 'no ' + t;
  return 'em ' + t;
}

/** "casado(a)" → "casado"/"casada" conforme o gênero; sem gênero fica como está. */
function estadoCivilGenero_(ec, g) {
  var t = String(ec || '').trim();
  if (/^uni[aã]o est[aá]vel$/i.test(t)) return 'convivente em união estável';
  if (!g) return t;
  return t.replace(/(\w+)o\(a\)/gi, function (m, raiz) { return raiz + (g === 'F' ? 'a' : 'o'); });
}

var PASTA_PARA_ASSINAR = 'DOCUMENTOS PARA ASSINAR';

/** Idade em anos completos na data de hoje. */
function idadeEm_(nasc, hoje) {
  var a = +hoje.slice(0, 4) - +nasc.slice(0, 4);
  if (hoje.slice(5) < nasc.slice(5)) a--;
  return a;
}

/**
 * Filhos menores: qualificação de cada um, quem representa (menos de 16 anos) ou assiste (16 e 17 anos)
 * e a linha de baixo da assinatura.
 */
function menoresTexto_(menores, c, gResp, relacao) {
  var hoje = hojeSP_();
  var x = function (g, m, f) { return g === 'F' ? f : g === 'M' ? m : m + '(' + f.slice(-1) + ')'; };
  var reps = 0, assist = 0, femininos = 0;
  var qualif = menores.map(function (m) {
    var g = /^f/i.test(m.genero) ? 'F' : /^m/i.test(m.genero) ? 'M' : generoPeloNome_(m.nome);
    if (g === 'F') femininos++;
    var idade = idadeEm_(m.nascimento, hoje);
    if (idade >= 18) throw falha_(m.nome + ' já tem 18 anos ou mais: use a procuração comum.');
    if (idade >= 16) assist++; else reps++;
    m._cond = idade >= 16 ? x(g, 'assistido', 'assistida') : x(g, 'representado', 'representada');
    return m.nome.toUpperCase() + ', ' + x(g, 'brasileiro', 'brasileira') + ', ' + (idade >= 16 ? 'menor púbere' : 'menor impúbere') + ', ' +
      x(g, 'nascido', 'nascida') + ' em ' + dataBR_(m.nascimento) + (m.cpf ? ', ' + x(g, 'inscrito', 'inscrita') + ' no CPF sob o nº ' + m.cpf : '');
  });
  if (reps && assist) qualif = qualif.map(function (q, i) { return q + ', ' + menores[i]._cond; });
  var lista = qualif.length > 1 ? qualif.slice(0, -1).join('; ') + '; e ' + qualif[qualif.length - 1] : qualif[0];
  var plural = menores.length > 1, todasF = femininos === menores.length;
  var fim = function (base) { return base + (todasF ? 'a' : 'o') + (plural ? 's' : ''); };
  var acao = reps && assist ? '' : assist ? fim('assistid') + ' ' : fim('representad') + ' ';
  var papel = { genitor: x(gResp, 'seu genitor', 'sua genitora'), tutor: x(gResp, 'seu tutor', 'sua tutora'), guardiao: x(gResp, 'seu guardião', 'sua guardiã') }[relacao] || x(gResp, 'seu genitor', 'sua genitora');
  if (plural && relacao === 'genitor') papel = x(gResp, 'seu genitor', 'sua genitora');
  var nomes = menores.map(function (m) { return m.nome.toUpperCase(); });
  return {
    qualificacao: lista,
    representacao: 'neste ato ' + acao + 'por ' + papel,
    assinatura: 'Representante legal de ' + (nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : nomes[0])
  };
}

/** Coloca em negrito cada nome indicado (nome das partes, padrão do escritório). */
function negritar_(corpo, nomes) {
  nomes.forEach(function (n) {
    try {
      var pat = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), r = corpo.findText(pat);
      while (r) { r.getElement().asText().setBold(r.getStartOffset(), r.getEndOffsetInclusive(), true); r = corpo.findText(pat, r); }
    } catch (e) { /* segue sem negrito */ }
  });
}

/**
 * Junta vários documentos gerados num PDF só, para imprimir de uma vez (cada um começa numa folha nova).
 * Copia o conteúdo dos Google Docs para um documento novo com o mesmo cabeçalho e rodapé do escritório.
 */
function juntarParaImprimir_(docIds, pasta, nome) {
  var doc = DocumentApp.create(nome);
  montarPadraoVisual_(doc, [], true);
  var corpo = doc.getBody();
  var T = DocumentApp.ElementType;
  docIds.forEach(function (id, i) {
    var origem = DocumentApp.openById(id).getBody();
    if (i > 0) corpo.appendPageBreak();
    for (var j = 0; j < origem.getNumChildren(); j++) {
      var el = origem.getChild(j).copy(), tipo = el.getType();
      if (tipo === T.PARAGRAPH) corpo.appendParagraph(el);
      else if (tipo === T.LIST_ITEM) corpo.appendListItem(el);
      else if (tipo === T.TABLE) corpo.appendTable(el);
    }
  });
  // tira o parágrafo vazio que todo documento novo tem no começo
  try { var p0 = corpo.getChild(0); if (p0.getType() === T.PARAGRAPH && !p0.asParagraph().getText() && corpo.getNumChildren() > 1) p0.removeFromParent(); } catch (e) { /* ok */ }
  doc.saveAndClose();
  var arq = DriveApp.getFileById(doc.getId());
  var pdf = pasta.createFile(arq.getAs('application/pdf')).setName(nome + '.pdf');
  arq.setTrashed(true);
  return pdf.getUrl();
}

/** Notas promissórias: uma por parcela, duas por folha (Decreto nº 57.663/1966 — Lei Uniforme). */
function linhasPromissorias_(notas, c, esc, tipo, numProc) {
  var nome = String(c.nome).toUpperCase();
  var doc = c.cpf_cnpj ? (c.tipo === 'PJ' ? 'CNPJ' : 'CPF') + ' nº ' + c.cpf_cnpj : 'CPF nº ____________';
  var end = enderecoCompleto_(c);
  var ref = numProc ? ' do processo nº ' + numProc : tipo ? ' (' + tipo.nome.toLowerCase() + ')' : '';
  var linhas = [];
  notas.forEach(function (n, i) {
    if (i > 0 && i % 2 === 0) linhas.push(['pb']);
    linhas.push(['t', 'NOTA PROMISSÓRIA Nº ' + n.numero + '/' + n.total]);
    linhas.push(['c', '**Vencimento:** ' + dataBR_(n.vencimento) + '          **Valor:** ' + reaisTxt_(n.valor)]);
    linhas.push(['p', 'No dia ' + porExtensoData_(n.vencimento) + ', pagarei por esta única via de **NOTA PROMISSÓRIA** a **' + esc.nome + '**, inscrita no CNPJ sob o nº ' + esc.cnpj +
      ', ou à sua ordem, a quantia de **' + reaisTxt_(n.valor) + '** (' + extenso_(n.valor) + '), em moeda corrente nacional, pagável em ' + esc.cidade + '.']);
    linhas.push(['p', '**Emitente:** **' + nome + '**, ' + doc + (end ? ', ' + (c.tipo === 'PJ' ? 'com sede ' : 'residente e domiciliad{{c:o|a}} ') + comPreposicao_(end) : '') +
      '. Referente à ' + n.numero + 'ª parcela dos honorários advocatícios contratados' + ref + '.']);
    linhas.push(['l', 'Local e data da emissão: ' + esc.cidade + ', ' + porExtensoData_(hojeSP_()) + '.']);
    linhas.push(['a', nome + ' — Emitente']);
  });
  return linhas;
}

/** Gênero do cliente: o informado no cadastro; senão, pelo primeiro nome (só quando é bem claro). PJ é feminino ("a empresa"). */
function generoCliente_(c) {
  if (!c) return '';
  if (c.tipo === 'PJ') return 'F';
  var gi = normalizar_(c.genero || '');
  if (/^f/.test(gi)) return 'F';
  if (/^m/.test(gi)) return 'M';
  return generoPeloNome_(c.nome);
}

function generoPeloNome_(nome) {
  var n = normalizar_(String(nome || '').trim().split(/\s+/)[0] || '');
  if (!n) return '';
  var fem = ['raquel', 'isabel', 'beatriz', 'ester', 'esther', 'rute', 'ruth', 'carmen', 'lourdes', 'ines', 'miriam', 'mirian', 'ingrid', 'liz', 'luz',
    'nicole', 'kelly', 'keli', 'shirley', 'sueli', 'suely', 'luci', 'lucy', 'deise', 'joice', 'joyce', 'edite', 'ivete', 'marlene', 'darlene', 'rose',
    'rosane', 'irene', 'alice', 'denise', 'elaine', 'solange', 'ivone', 'yasmin', 'jasmin', 'evelin', 'evelyn', 'thais', 'tais', 'lais', 'maite', 'sarah',
    'ana', 'mel', 'cleo', 'nely', 'neli', 'arlete', 'leonor', 'dulce', 'clarice', 'heloise', 'louise', 'monique', 'janete', 'ires', 'aimee', 'gleice', 'graziele'];
  var masc = ['luca', 'nikita', 'joshua', 'jonatha', 'josue', 'jose', 'henrique', 'jorge', 'felipe', 'filipe', 'andre', 'alexandre', 'guilherme', 'vicente',
    'cleberson', 'davi', 'levi', 'luis', 'luiz', 'cristian', 'christian', 'jean', 'jhonatan', 'william', 'wesley', 'noe', 'moises', 'elias', 'matias', 'lucas', 'thomas', 'tomas',
    'nicolas', 'jonas', 'douglas', 'marcos', 'mateus', 'matheus', 'carlos', 'juliano', 'adriano', 'reinaldo', 'gilmar', 'ademir', 'valmir', 'jaime', 'iure', 'dante', 'cesar'];
  if (fem.indexOf(n) >= 0) return 'F';
  if (masc.indexOf(n) >= 0) return 'M';
  if (/(a|ane|ene|ele|elle|ine|ise|iane|ete|ely|eli)$/.test(n)) return 'F';
  if (/(o|son|el|or|ir|er|ar|ur|os|us|is|an|on|im|um|iz|ael|uel|ilo|ton|ius|ard|ino|io|eu|au)$/.test(n)) return 'M';
  return '';
}

/**
 * Escolhe as palavras pelo gênero: {{c:o|a}} do cliente, {{adv:o|a}} do(a) advogado(a), {{sub:o|a}} de quem substabelece.
 * Sem gênero conhecido sai "o(a)". Um terceiro valor ({{c:ele|ela|ele(a)}}) define o texto quando não se sabe.
 */
function resolverGenero_(corpo, generos) {
  var texto = corpo.getText(), visto = {}, m;
  var re = /\{\{(c|adv|sub):([^|{}]*)\|([^|{}]*)(?:\|([^{}]*))?\}\}/g;
  while ((m = re.exec(texto))) {
    if (visto[m[0]]) continue;
    visto[m[0]] = 1;
    var g = generos[m[1]];
    var v = g === 'M' ? m[2] : g === 'F' ? m[3] : (m[4] !== undefined ? m[4] : m[2] + '(' + m[3] + ')');
    corpo.replaceText(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), v.replace(/\$/g, '\\$'));
  }
}

/** Qualificação sem o nome do cliente (o nome vai em negrito no modelo). */
function qualificacaoResto_(c, semEndereco, semContato) {
  return qualificacao_(c, semEndereco, semContato).replace(/^[^,]+,\s*/, '');
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

/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos". */
function extenso_(valor) {
  var un = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze',
    'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var ct = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  var ate999 = function (n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    var c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(ct[c]);
    if (r) p.push(r < 20 ? un[r] : dz[Math.floor(r / 10)] + (r % 10 ? ' e ' + un[r % 10] : ''));
    return p.join(' e ');
  };
  var inteiro = Math.floor(Math.round(valor * 100) / 100), cent = Math.round((valor - inteiro) * 100);
  var grupos = [], n = inteiro;
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  var nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  var partes = [];
  for (var i = grupos.length - 1; i >= 0; i--) {
    var g = grupos[i];
    if (!g) continue;
    partes.push({ g: g, txt: (i === 1 && g === 1) ? 'mil' : ate999(g) + (i ? ' ' + nomes[i][g === 1 ? 0 : 1] : '') });
  }
  var reais = '';
  partes.forEach(function (p, j) {
    if (!j) { reais = p.txt; return; }
    var ultimo = j === partes.length - 1;
    reais += (ultimo && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ' ') + p.txt;
  });
  if (reais) reais += (inteiro >= 1000000 && grupos[0] === 0 && grupos[1] === 0 ? ' de' : '') + (inteiro === 1 ? ' real' : ' reais');
  var cents = cent ? ate999(cent) + (cent === 1 ? ' centavo' : ' centavos') : '';
  return reais && cents ? reais + ' e ' + cents : reais || cents || 'zero real';
}

function valorComExtenso_(v) { var n = dinheiro_(v); return reaisTxt_(n) + ' (' + extenso_(n) + ')'; }

/** Datas das parcelas mensais a partir da 1ª. */
function datasParcelas_(primeiro, n, diaDemais) {
  var out = [], venc = primeiro, dia = parseInt(diaDemais, 10) || +primeiro.slice(8, 10);
  for (var i = 0; i < n; i++) { out.push(venc); venc = mesSeguinte_(venc, dia); }
  return out;
}

function valoresParcelas_(total, n) {
  var base = Math.floor(total / n * 100) / 100, out = [];
  for (var i = 1; i <= n; i++) out.push(i === n ? Math.round((total - base * (n - 1)) * 100) / 100 : base);
  return out;
}

/**
 * Cláusula de honorários a partir do formulário.
 * forma: percentual | avista | parcelado | misto | mensal | cadastrado
 */
function clausulaHonorariosForm_(f, hCadastrado, parcelasCadastradas) {
  var C = 'Pelos serviços contratados, {{c:o|a}} CONTRATANTE pagará à CONTRATADA ';
  var pct = function () {
    var p = dinheiro_(f.percentual);
    if (!(p > 0)) throw falha_('Informe o percentual dos honorários (ex.: 30).');
    return 'honorários de êxito correspondentes a ' + String(p).replace('.', ',') + '% (' + extenso_(p).replace(/ rea(l|is)( e .*)?$/, '') +
      ' por cento) sobre todo o proveito econômico obtido, inclusive valores recebidos em acordo, alvará, RPV, precatório ou depósito judicial, devidos no momento do recebimento';
  };
  var fixo = function (prefixo) {
    var total = dinheiro_(f.valor_total);
    if (!(total > 0)) throw falha_('Informe o valor dos honorários.');
    var n = Math.max(1, parseInt(f.parcelas, 10) || 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.primeiro_vencimento || '')) throw falha_('Informe a data do (1º) vencimento.');
    if (n === 1) return prefixo + 'valor de ' + valorComExtenso_(total) + ', a ser pago à vista até ' + dataBR_(f.primeiro_vencimento);
    var datas = datasParcelas_(f.primeiro_vencimento, n, f.dia_demais), vals = valoresParcelas_(total, n);
    var diaD = parseInt(f.dia_demais, 10);
    var iguais = vals.every(function (v) { return v === vals[0]; });
    return prefixo + 'valor total de ' + valorComExtenso_(total) + ', dividido em ' + n + ' (' + extenso_(n).replace(/ rea(l|is)$/, '') + ') parcelas mensais' +
      (iguais ? ' de ' + valorComExtenso_(vals[0]) : '') + ', vencendo a primeira em ' + dataBR_(datas[0]) + (diaD && diaD !== +f.primeiro_vencimento.slice(8, 10) ? ' e as demais todo dia ' + diaD + ' dos meses seguintes' : ' e as demais no mesmo dia dos meses seguintes') + ', conforme o quadro: ' +
      datas.map(function (d, i) { return (i + 1) + 'ª parcela – ' + dataBR_(d) + ' – ' + reaisTxt_(vals[i]); }).join('; ');
  };
  switch (f.forma) {
    case 'percentual': return C + pct() + ', ficando a CONTRATADA autorizada a reter o seu percentual quando o valor transitar por sua conta.';
    case 'avista': f.parcelas = 1; return C + fixo('o ') + '.';
    case 'parcelado': return C + fixo('o ') + '.';
    case 'misto': return C + fixo('honorários iniciais fixos no ') + ', e, ainda, ' + pct() + '.';
    case 'mensal': {
      var m = dinheiro_(f.valor_mensal);
      if (!(m > 0)) throw falha_('Informe o valor da mensalidade.');
      var dia = parseInt(f.dia_vencimento, 10) || 10;
      return C + 'honorários mensais de ' + valorComExtenso_(m) + ', com vencimento todo dia ' + dia + ' de cada mês' +
        (f.primeiro_vencimento ? ', a partir de ' + dataBR_(f.primeiro_vencimento) : '') + ', mediante PIX, depósito ou boleto.';
    }
    default: return clausulaHonorarios_(hCadastrado, parcelasCadastradas);
  }
}

function clausulaHonorarios_(h, parcelas) {
  if (!h) return 'Pelos serviços contratados, {{c:o|a}} CONTRATANTE pagará à CONTRATADA honorários de __________________, na forma e nos vencimentos a seguir: __________________.';
  if (h.tipo === 'exito') {
    return 'Pelos serviços contratados, {{c:o|a}} CONTRATANTE pagará à CONTRATADA honorários de êxito correspondentes a ' + h.percentual +
      '% (por cento) sobre todo o proveito econômico obtido, inclusive valores recebidos em acordo, alvará ou depósito judicial, devidos no momento do recebimento, ficando a CONTRATADA autorizada a reter o seu percentual quando o valor transitar por sua conta.';
  }
  if (h.tipo === 'mensal') {
    return 'Pelos serviços contratados, {{c:o|a}} CONTRATANTE pagará à CONTRATADA honorários mensais de ' + reaisTxt_(h.valor_mensal) +
      ', com vencimento todo dia ' + (h.dia_vencimento || '__') + ' de cada mês' + (h.inicio ? ', a partir de ' + dataBR_(h.inicio) : '') + '.';
  }
  var ps = (parcelas || []).slice().sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var txt = 'Pelos serviços contratados, {{c:o|a}} CONTRATANTE pagará à CONTRATADA honorários no valor total de ' + reaisTxt_(h.valor_total);
  if (ps.length > 1) txt += ', em ' + ps.length + ' parcelas, com vencimentos em ' + ps.map(function (p) { return dataBR_(p.vencimento) + ' (' + reaisTxt_(p.valor) + ')'; }).join(', ');
  else if (ps.length === 1) txt += ', com vencimento em ' + dataBR_(ps[0].vencimento);
  return txt + '.';
}

/** Lança no Financeiro o que foi contratado no formulário. */
function lancarHonorariosForm_(f, c, descricao, u) {
  var ids = [];
  // não lança de novo o mesmo honorário (contrato gerado mais de uma vez)
  var num = function (v) { return v === '' || v == null ? 0 : Math.round((dinheiro_(v) || 0) * 100); };
  var existentes = tabela_('Honorarios').linhas.filter(function (h) { return h.cliente_id === c.id && ['cancelado', 'encerrado', 'quitado'].indexOf(h.situacao) < 0; });
  var salvarHonorario = function (dados, usuario) {
    var n = dados.honorario;
    var igual = existentes.filter(function (h) {
      return h.tipo === n.tipo && num(h.percentual) === num(n.percentual) && num(h.valor_total) === num(n.valor_total) &&
        num(h.valor_mensal) === num(n.valor_mensal);
    })[0];
    if (igual) { ids.repetidos = (ids.repetidos || 0) + 1; return { id: null }; }
    return salvarHonorario_(dados, usuario);
  };
  var base = { cliente_id: c.id, descricao: descricao, observacoes: 'Lançado ao gerar o contrato pelo painel.' };
  var fixo = function () {
    var n = f.forma === 'avista' ? 1 : Math.max(1, parseInt(f.parcelas, 10) || 1);
    ids.push(salvarHonorario({ honorario: Object.assign({}, base, { tipo: 'parcelado', valor_total: f.valor_total, parcelas: n, primeiro_vencimento: f.primeiro_vencimento, dia_demais: f.dia_demais }) }, u).id);
  };
  if (f.forma === 'avista' || f.forma === 'parcelado') fixo();
  if (f.forma === 'percentual' || f.forma === 'misto') {
    if (f.forma === 'misto') fixo();
    ids.push(salvarHonorario({ honorario: Object.assign({}, base, { tipo: 'exito', percentual: f.percentual }) }, u).id);
  }
  if (f.forma === 'mensal') {
    ids.push(salvarHonorario({ honorario: Object.assign({}, base, { tipo: 'mensal', valor_mensal: f.valor_mensal, dia_vencimento: f.dia_vencimento || '10', inicio: f.primeiro_vencimento || hojeSP_() }) }, u).id);
  }
  var novos = ids.filter(function (x) { return x; });
  novos.repetidos = ids.repetidos || 0;
  return novos;
}

/**
 * Gera os documentos escolhidos a partir dos modelos, na pasta do cliente, em Google Docs e PDF.
 * d: { cliente_id, modelos: [], advogado_id, tipo_acao, parte_contraria, objeto, honorarios: {...}, recibo: {valor, referente} }
 */
function gerarDocumentos_(d, u) {
  var pode = PERFIS[u.perfil];
  var doDrive = {};
  modelosDrive_().forEach(function (m) { doDrive['drive:' + m.id] = m; });
  var quais = (d.modelos || []).map(function (k) { return k === 'procuracao_antiga' ? 'procuracao' : k; }).filter(function (k) { return MODELOS[k] || doDrive[k]; });
  var M = function (k) { return MODELOS[k] || (doDrive[k] ? { processo: modeloDrivePrecisaProcesso_(doDrive[k].nome) } : {}); };
  if (!quais.length) throw falha_('Escolha pelo menos um documento.');
  if (quais.some(function (k) { return M(k).financeiro; }) && (!pode.financeiro || pode.ocultarValores)) throw falha_('Contratos e recibos só podem ser gerados pela administração.');
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.cliente_id; })[0];
  if (!c) throw falha_('Escolha o cliente.');
  var adv = advogados_().filter(function (a) { return a.id === d.advogado_id; })[0] ||
    advogados_().filter(function (a) { return a.padrao === 'sim'; })[0] || advogados_()[0];
  var tipo = TIPOS_ACAO[d.tipo_acao] || null;
  if ((quais.indexOf('procuracao') >= 0 || quais.indexOf('procuracao_menor') >= 0) && (!tipo || (d.tipo_acao === 'outro' && !String(d.objeto || '').trim()))) {
    throw falha_('Escolha o tipo de ação: a procuração sai com os poderes específicos daquela área (trabalhista, cível, criminal…). Se for "Outro", descreva em "Detalhes".');
  }
  var numProc = String(d.numero_processo || '').trim();
  if (numProc && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(numProc)) throw falha_('Número do processo fora do padrão (0000000-00.0000.0.00.0000).');
  if (!numProc && quais.some(function (k) { return M(k).processo; })) throw falha_('Informe o número do processo: as petições e o substabelecimento precisam dele.');
  var proc = numProc ? tabela_('Processos').linhas.filter(function (x) { return x.numero === numProc; })[0] || { numero: numProc } : null;
  var contra = String(d.parte_contraria || (proc && proc.parte_contraria) || '').trim();
  var detalhes = String(d.objeto || '').trim();
  var objeto = tipo && tipo.objeto ? tipo.objeto.replace('{{contra}}', contra ? ' em face de ' + contra : '').replace('{{contra_de}}', contra ? ' ' + contra : '').replace('{{contra_por}}', contra ? ' por ' + contra : '') : '';
  if (detalhes) objeto = objeto ? objeto + ' — ' + detalhes : detalhes;
  if (numProc && objeto) objeto += ', nos autos do processo nº ' + numProc;
  if (!objeto) objeto = c.tipo_acao || 'atuação em favor d{{c:o|a}} outorgante/contratante em ' + (c.area || 'matéria a definir');

  var faltando = [];
  if (!c.cpf_cnpj) faltando.push('CPF/CNPJ');
  if (!c.endereco) faltando.push('endereço');
  if (c.tipo !== 'PJ' && !c.rg) faltando.push('RG');
  if (c.tipo !== 'PJ' && !c.profissao) faltando.push('profissão');

  var f = d.honorarios || {};
  var clausula = '';
  if (quais.some(function (k) { return M(k).honorarios || M(k).mensal; })) {
    if (quais.indexOf('assessoria') >= 0 && f.forma !== 'mensal' && !quais.some(function (k) { return M(k).honorarios; })) f.forma = 'mensal';
    var h = null, parcelas = [];
    if (!f.forma || f.forma === 'cadastrado') {
      var hons = tabela_('Honorarios').linhas.filter(function (x) { return x.cliente_id === c.id; });
      h = hons.filter(function (x) { return x.id === d.honorario_id; })[0] || hons.filter(function (x) { return x.situacao === 'ativo'; }).pop() || null;
      if (h) parcelas = tabela_('Parcelas').linhas.filter(function (p) { return p.honorario_id === h.id; });
      if (!h) faltando.push('forma dos honorários (a cláusula saiu em branco)');
    }
    clausula = clausulaHonorariosForm_(f, h, parcelas); // valida antes de criar qualquer arquivo
  }
  var temParcelasFixas = ['avista', 'parcelado', 'misto'].indexOf(f.forma) >= 0 || !!(h && h.tipo === 'parcelado');
  var notasP = [];
  if (quais.indexOf('promissoria') >= 0) {
    if (['avista', 'parcelado', 'misto'].indexOf(f.forma) >= 0) {
      var nP = f.forma === 'avista' ? 1 : Math.max(1, parseInt(f.parcelas, 10) || 1);
      var valsP = valoresParcelas_(dinheiro_(f.valor_total), nP);
      notasP = datasParcelas_(f.primeiro_vencimento, nP, f.dia_demais).map(function (dt, i) { return { numero: i + 1, total: nP, vencimento: dt, valor: valsP[i] }; });
    } else if (h && h.tipo === 'parcelado') {
      var abertasP = parcelas.filter(function (q) { return !q.pago_em; }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
      notasP = abertasP.map(function (q) { return { numero: +q.numero || 1, total: parcelas.length, vencimento: q.vencimento, valor: dinheiro_(q.valor) }; });
    }
    if (!notasP.length) throw falha_('As notas promissórias precisam de valor fixo: escolha "Valor fixo à vista", "Valor fixo parcelado" ou "Fixo + percentual" (ou um honorário parcelado já cadastrado com parcelas em aberto).');
  }
  var menores = [];
  if (quais.indexOf('procuracao_menor') >= 0) {
    menores = (d.menores || []).map(function (m) {
      var nasc = String(m.nascimento || '').trim(), br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nasc);
      if (br) nasc = br[3] + '-' + br[2] + '-' + br[1];
      return { nome: String(m.nome || '').trim().replace(/\s+/g, ' '), cpf: String(m.cpf || '').trim(), nascimento: nasc, genero: m.genero || '' };
    }).filter(function (m) { return m.nome; });
    if (!menores.length) throw falha_('Informe o nome e a data de nascimento de cada filho(a) menor.');
    menores.forEach(function (m) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.nascimento)) throw falha_('Informe a data de nascimento de ' + m.nome + ' (para saber se é representado ou assistido).');
    });
  }
  var rec = d.recibo || {};
  if (quais.indexOf('recibo') >= 0 && !(dinheiro_(rec.valor) > 0)) throw falha_('Informe o valor recebido para o recibo.');
  var atrasadas = [], totalAtraso = 0;
  if (quais.indexOf('cobranca') >= 0) {
    var hojeC = hojeSP_();
    atrasadas = tabela_('Parcelas').linhas.filter(function (q) { return q.cliente_id === c.id && !q.pago_em && q.vencimento && q.vencimento < hojeC; })
      .sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
    if (!atrasadas.length) throw falha_('Este cliente não tem parcelas em atraso no Financeiro.');
    atrasadas.forEach(function (q) { totalAtraso += dinheiro_(q.valor); });
  }
  var subst = null;
  if (quais.indexOf('substabelecimento') >= 0) {
    subst = advogados_().filter(function (a) { return a.padrao === 'sim'; })[0] || advogados_()[0];
    if (subst.id === adv.id) throw falha_('No substabelecimento, escolha como advogado(a) quem vai RECEBER os poderes (não pode ser o(a) mesmo(a) advogado(a) padrão).');
  }
  var ativo = !proc || !proc.polo || /ativo|autor|requerente|exequente|reclamante|apelante|agravante|impetrante|embargante|recorrente|querelante/.test(normalizar_(proc.polo));
  var trabalhista = proc && /^TRT/.test(proc.tribunal || tribunalDoNumero_(numProc));

  // pasta: cria se ainda não existir
  if (!c.pasta_id) { criarPastaCliente_({ id: c.id }, u); c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.cliente_id; })[0]; }
  if (tipo && !c.tipo_acao) {
    var tabC = tabela_('Clientes'), linhaC = tabC.linhas.filter(function (r) { return r.id === c.id; })[0];
    var mud = { tipo_acao: tipo.nome };
    if (!linhaC.area && tipo.area) mud.area = tipo.area;
    atualizarLinha_(tabC, linhaC, mud);
  }

  var esc = escritorio_();
  var hoje = hojeSP_();
  var poderes = tipo && tipo.poderes ? tipo.poderes : '';
  var poderesGerais = poderesGeraisProcuracao_(tipo, false), poderesGeraisMenor = poderesGeraisProcuracao_(tipo, true);
  var nomeCli = String(c.nome).toUpperCase();
  var partesOrg = orgaoPartes_(proc && proc.orgao);
  var juizoInfo = { vara: String(d.vara || '').trim() || partesOrg.vara, comarca: String(d.comarca || '').trim() || partesOrg.cidade };
  juizoInfo.numero = (/(\d+)\s*[ªaº]?/.exec(juizoInfo.vara) || [])[1] ? (/(\d+)/.exec(juizoInfo.vara)[1] + 'ª') : '';
  var outra = contra ? contra.split(';')[0].trim().toUpperCase() : '__________';
  var valores = {
    '{{qualificacao_resto}}': qualificacaoResto_(c), '{{qualificacao_curta}}': qualificacaoResto_(c, false, true), '{{qualificacao_resto_sem_endereco}}': qualificacaoResto_(c, true), '{{advogado_qualificacao}}': qualificacaoAdvogadoResto_(adv), '{{advogado_oab_qualif}}': (adv.tratamento === 'advogado' ? 'advogado inscrito' : 'advogada inscrita') + ' na OAB/' + (adv.uf || 'SC') + ' sob o nº ' + adv.oab,
    '{{advogado_assinatura}}': nomeAssinatura_(adv.nome),
    '{{escritorio_qualificacao}}': 'sociedade de advogados inscrita no CNPJ sob o nº ' + esc.cnpj + ' e registrada na OAB/SC sob o nº ' + esc.oab + ', com sede na ' + esc.endereco,
    '{{juizo}}': numProc ? juizoTexto_(juizoInfo, proc, numProc) : '', '{{numero_processo}}': numProc,
    '{{rotulo_ativo}}': trabalhista ? 'Reclamante' : 'Requerente', '{{rotulo_passivo}}': trabalhista ? 'Reclamada' : 'Requerida',
    '{{parte_ativa}}': ativo ? nomeCli : outra, '{{parte_passiva}}': ativo ? outra : nomeCli,
    '{{procurador_tratamento}}': adv.tratamento === 'advogado' ? 'seu procurador' : 'sua procuradora',
    '{{substabelecente_nome}}': subst ? String(subst.nome).toUpperCase() : '', '{{substabelecente_qualificacao}}': subst ? qualificacaoAdvogadoResto_(subst) : '',
    '{{substabelecente_oab}}': subst ? oabTexto_(subst) : '',
    '{{referente_processo}}': numProc ? ' no processo nº ' + numProc : (tipo ? ' (' + tipo.nome.toLowerCase() + ')' : ''),
    '{{parcelas_atrasadas}}': atrasadas.map(function (q) { return (q.numero ? q.numero + 'ª parcela, ' : '') + 'vencida em ' + dataBR_(q.vencimento) + ', no valor de ' + reaisTxt_(q.valor); }).join('; ') + (atrasadas.length ? '.' : ''),
    '{{total_atraso}}': reaisTxt_(totalAtraso), '{{total_atraso_extenso}}': extenso_(totalAtraso),
    '{{qualificacao}}': qualificacao_(c), '{{qualificacao_sem_endereco}}': qualificacao_(c, true), '{{nome}}': String(c.nome).toUpperCase(),
    '{{objeto}}': objeto, '{{objeto_prev}}': detalhes ? ', visando ' + detalhes : (numProc ? ', nos autos do processo nº ' + numProc : ''), '{{objeto_assessoria}}': detalhes ? 'Inclui ainda: ' + detalhes + '.' : '',
    '{{tipo_acao}}': tipo ? tipo.nome : '', '{{parte_contraria}}': contra, '{{poderes_especificos}}': poderes,
    '{{poderes_gerais}}': poderesGerais, '{{poderes_gerais_menor}}': poderesGeraisMenor,
    '{{clausula_honorarios}}': clausula, '{{advogado}}': qualificacaoAdvogado_(adv), '{{advogado_nome}}': String(adv.nome).toUpperCase(),
    '{{advogado_oab}}': oabTexto_(adv), '{{escritorio}}': esc.nome, '{{escritorio_endereco}}': esc.endereco,
    '{{escritorio_email}}': esc.email, '{{escritorio_telefone}}': esc.telefone, '{{foro}}': esc.foro,
    '{{cidade_assinatura}}': esc.cidade, '{{data_extenso}}': porExtensoData_(hoje), '{{endereco_completo}}': enderecoCompleto_(c), '{{endereco_com_prep}}': comPreposicao_(enderecoCompleto_(c)),
    '{{valor}}': rec.valor ? reaisTxt_(rec.valor) : '', '{{valor_extenso}}': rec.valor ? extenso_(dinheiro_(rec.valor)) : '',
    '{{referente}}': String(rec.referente || '').trim() || 'honorários advocatícios',
    '{{cpf_cnpj}}': c.cpf_cnpj || '', '{{rg}}': c.rg || '', '{{endereco}}': c.endereco || '', '{{cidade}}': c.cidade || '', '{{uf}}': c.uf || '',
    '{{cep}}': c.cep || '', '{{telefone}}': c.telefone || '', '{{email}}': c.email || '', '{{estado_civil}}': c.estado_civil || '',
    '{{profissao}}': c.profissao || '', '{{representante}}': c.representante || '', '{{nascimento}}': dataBR_(c.nascimento || '')
  };
  var generos = { c: generoCliente_(c), adv: adv.tratamento === 'advogado' ? 'M' : 'F', sub: subst ? (subst.tratamento === 'advogado' ? 'M' : 'F') : '' };
  if (c.tipo !== 'PJ' && !generos.c) faltando.push('sexo do cliente (os documentos saíram com "o(a)"; informe no cadastro)');
  var REMOVER = '§§REMOVER§§';
  var textoMenores = menores.length ? menoresTexto_(menores, c, generoCliente_(c), String(d.representacao || 'genitor')) : null;
  valores['{{escritorio_pix}}'] = esc.pix;
  valores['{{clausula_promissoria}}'] = temParcelasFixas
    ? 'Parágrafo segundo. O pagamento das parcelas é garantido por nota(s) promissória(s) emitida(s) pel{{c:o|a}} CONTRATANTE em favor da CONTRATADA, no valor e com o vencimento de cada parcela, as quais perderão a validade e serão devolvidas à medida que as parcelas forem quitadas.'
    : REMOVER;
  if (!valores['{{poderes_especificos}}']) valores['{{poderes_especificos}}'] = REMOVER;
  valores['{{clausula_promissoria_contrato}}'] = temParcelasFixas ? valores['{{clausula_promissoria}}'].replace('Parágrafo segundo.', 'Parágrafo quarto.') : REMOVER;
  if (textoMenores) {
    valores['{{rotulo_outorgantes}}'] = menores.length > 1 ? 'OUTORGANTES' : 'OUTORGANTE';
    valores['{{menores_qualificacao}}'] = textoMenores.qualificacao;
    valores['{{menores_representacao}}'] = textoMenores.representacao;
    valores['{{menores_assinatura}}'] = textoMenores.assinatura;
  }
  var NOMES_ARQ = { juntada: 'JUNTADA DE DOCUMENTOS', habilitacao: 'JUNTADA DE PROCURAÇÃO', substabelecimento: 'SUBSTABELECIMENTO', cobranca: 'NOTIFICAÇÃO DE COBRANÇA',
    procuracao: 'PROCURAÇÃO', hipossuficiencia: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA', residencia: 'DECLARAÇÃO DE RESIDÊNCIA',
    lgpd: 'TERMO LGPD', contrato: 'CONTRATO DE HONORÁRIOS', prestacao: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS', assessoria: 'CONTRATO DE ASSESSORIA',
    recibo: 'RECIBO DE HONORÁRIOS', procuracao_menor: 'PROCURAÇÃO (FILHOS MENORES)', promissoria: 'NOTAS PROMISSÓRIAS' };
  var pasta = DriveApp.getFolderById(c.pasta_id);
  var gerados = [];
  var hojeIso = hojeSP_();
  var mesesX = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var ctxColchetes = {
    vara: juizoInfo.vara.toUpperCase(), varaNumero: juizoInfo.numero, comarca: juizoInfo.comarca.toUpperCase(), numero: numProc,
    ativo: ativo ? nomeCli : (contra ? outra : ''), passivo: ativo ? (contra ? outra : '') : nomeCli,
    cidadeAss: esc.cidade, dataExtenso: porExtensoData_(hojeIso), dia: String(+hojeIso.slice(8, 10)), mes: mesesX[+hojeIso.slice(5, 7) - 1], ano: hojeIso.slice(0, 4),
    nome: nomeCli, qualificacao: qualificacaoResto_(c),
    qualificacaoBasica: (function () {
      var g = generoCliente_(c), x = function (m, f) { return g === 'F' ? f : g === 'M' ? m : m + '(' + f.slice(-1) + ')'; };
      return [x('brasileiro', 'brasileira'), estadoCivilGenero_(c.estado_civil, g), c.profissao, c.rg ? x('portador', 'portadora') + ' do RG nº ' + c.rg : ''].filter(String).join(', ');
    })(),
    nacionalidade: (function () { var g = generoCliente_(c); return g === 'F' ? 'brasileira' : g === 'M' ? 'brasileiro' : 'brasileiro(a)'; })(),
    estadoCivil: estadoCivilGenero_(c.estado_civil, generoCliente_(c)) || '', profissao: c.profissao || '', cpf: c.cpf_cnpj || '', rg: c.rg || '', email: c.email || '',
    telefone: c.telefone || '', endereco: enderecoCompleto_(c)
  };
  quais.filter(function (k) { return doDrive[k]; }).forEach(function (k) {
    var m = doDrive[k];
    var nomeArq = nomeModeloDrive_(m.nome).toUpperCase() + ' — ' + nomePasta_(c.nome) + ' — ' + dataBR_(hoje).replace(/\//g, '-');
    var copia = DriveApp.getFileById(m.id).makeCopy(nomeArq, pasta);
    var doc = DocumentApp.openById(copia.getId());
    preencherColchetes_(doc.getBody(), ctxColchetes);
    doc.saveAndClose();
    var pdf = pasta.createFile(copia.getAs('application/pdf')).setName(nomeArq + '.pdf');
    gerados.push({ modelo: nomeModeloDrive_(m.nome), doc: copia.getUrl(), pdf: pdf.getUrl() });
  });
  // documentos que o cliente ainda vai assinar ficam numa subpasta própria, e não soltos na pasta
  var pastaAssinar = null;
  var destino = function (k) {
    if (!(MODELOS[k] && MODELOS[k].assinaCliente)) return pasta;
    if (!pastaAssinar) pastaAssinar = acharPasta_(pasta, PASTA_PARA_ASSINAR) || pasta.createFolder(PASTA_PARA_ASSINAR);
    return pastaAssinar;
  };
  if (notasP.length) {
    var nomeNP = NOMES_ARQ.promissoria + ' — ' + nomePasta_(c.nome) + ' — ' + dataBR_(hoje).replace(/\//g, '-');
    var docNP = DocumentApp.create(nomeNP);
    montarPadraoVisual_(docNP, linhasPromissorias_(notasP, c, esc, tipo, numProc), true);
    resolverGenero_(docNP.getBody(), generos);
    docNP.saveAndClose();
    var arqNP = DriveApp.getFileById(docNP.getId());
    arqNP.moveTo(destino('promissoria'));
    var pdfNP = destino('promissoria').createFile(arqNP.getAs('application/pdf')).setName(nomeNP + '.pdf');
    gerados.push({ modelo: MODELOS.promissoria.nome + ' (' + notasP.length + ')', doc: arqNP.getUrl(), pdf: pdfNP.getUrl(), assinar: true, _docId: arqNP.getId(), _ordem: 99 });
  }
  quais.filter(function (k) { return MODELOS[k] && !MODELOS[k].gerado; }).forEach(function (k) {
    var nomeArq = NOMES_ARQ[k] + (k === 'procuracao' && tipo && d.tipo_acao !== 'outro' ? ' (' + tipo.nome.replace(/\s*\(.*\)$/, '').toUpperCase() + ')' : '') +
      ' — ' + nomePasta_(c.nome) + ' — ' + dataBR_(hoje).replace(/\//g, '-');
    var dest = destino(k);
    var copia = DriveApp.getFileById(modeloId_(k, true)).makeCopy(nomeArq, dest);
    var doc = DocumentApp.openById(copia.getId());
    var corpo = doc.getBody();
    Object.keys(valores).forEach(function (chave) {
      corpo.replaceText(chave.replace(/[{}]/g, '\\$&'), String(valores[chave]).replace(/\$/g, '\\$'));
    });
    resolverGenero_(corpo, generos);
    corpo.getParagraphs().forEach(function (pp) { if (pp.getText().indexOf(REMOVER) >= 0) { try { pp.removeFromParent(); } catch (e) { pp.setText(''); } } });
    if (k === 'procuracao_menor') negritar_(corpo, menores.map(function (m) { return m.nome.toUpperCase(); }));
    doc.saveAndClose();
    var pdf = dest.createFile(copia.getAs('application/pdf')).setName(nomeArq + '.pdf');
    gerados.push({ modelo: MODELOS[k].nome, doc: copia.getUrl(), pdf: pdf.getUrl(), assinar: !!MODELOS[k].assinaCliente, _docId: copia.getId(), _ordem: Object.keys(MODELOS).indexOf(k) });
  });
  // um PDF só com tudo o que o cliente assina, na ordem: procuração, declarações, contrato, promissórias
  var impressao = '';
  var paraAssinar = gerados.filter(function (g) { return g.assinar; }).sort(function (a, b) { return a._ordem - b._ordem; });
  if (paraAssinar.length > 1) {
    try { impressao = juntarParaImprimir_(paraAssinar.map(function (g) { return g._docId; }), destino('procuracao'), 'IMPRIMIR — PARA ASSINAR — ' + nomePasta_(c.nome) + ' — ' + dataBR_(hoje).replace(/\//g, '-')); }
    catch (e) { impressao = ''; }
  }
  gerados.forEach(function (g) { delete g._docId; delete g._ordem; });
  var lancados = [];
  if (f.lancar && pode.financeiro && f.forma && f.forma !== 'cadastrado' && quais.some(function (k) { return M(k).honorarios || M(k).mensal; })) {
    lancados = lancarHonorariosForm_(f, c, (tipo ? tipo.nome : 'Honorários') + (contra ? ' — ' + contra : ''), u);
  }
  registrar_(u.usuario, 'documentos gerados', c.id + ' ' + quais.join(',') + (lancados.length ? ' + financeiro' : ''));
  // Procuração ou contrato para quem ainda não tem processo: entra em Processos como "Petição inicial (a ajuizar)", com tarefa para o responsável
  var aAjuizar = null;
  if (!numProc && quais.some(function (k) { return /^procuracao|^contrato|^prestacao/.test(k); })) {
    try {
      aAjuizar = comTrava_(function () {
        var tabP = tabela_('Processos');
        var ja = tabP.linhas.filter(function (x) { return x.cliente_id === c.id && (!x.numero || x.fase === 'contratado') && x.status !== 'arquivado'; })[0];
        if (ja) return null;
        var agora = new Date().toISOString();
        var novo = { id: novoId_('P'), cliente_id: c.id, cliente_nome: '', numero: '', tribunal: '', sistema: '', orgao: '', area: (tipo && tipo.area) || c.area || '',
          polo: 'ativo', parte_contraria: contra, proximo_ato: 'Ajuizar a ação', proximo_ato_data: '', status: 'ativo',
          observacoes: (tipo ? tipo.nome + '. ' : '') + 'Criado ao gerar ' + quais.filter(function (k) { return /^procuracao|^contrato|^prestacao/.test(k); }).join(', ') + ' em ' + dataBR_(hojeSP_()) + '. Coloque o número quando ajuizar.',
          origem: 'documentos', criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario, fase: 'contratado', fase_auto: '',
          responsavel: config_('RESP_INICIAL') || '' };
        inserirLinha_(tabP, novo);
        tarefaPeticaoInicial_(novo, u, tipo ? tipo.nome : '');
        return novo.id;
      });
    } catch (eA) { /* os documentos já foram gerados; o processo pode ser criado à mão */ }
  }
  return { a_ajuizar: aAjuizar, gerados: gerados, pasta_url: c.pasta_url || ('https://drive.google.com/drive/folders/' + c.pasta_id), pasta_assinar: pastaAssinar ? pastaAssinar.getUrl() : '', imprimir_tudo: impressao, faltando: faltando, lancados: lancados.length, ja_lancados: lancados.repetidos || 0 };
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

/* ================================================================== */
/* ETAPA 5 — Tarefas da equipe, caixa, relatórios, resumo por e-mail,  */
/* resumo das intimações por IA (Gemini) e andamentos (DataJud/CNJ)    */
/* ================================================================== */

/* ---------- Tarefas da equipe (controladoria) ---------- */

// Etapas do quadro. Para prazos processuais: "protocolado" marca o prazo como cumprido.
var ETAPAS_TAREFA = ['afazer', 'fazendo', 'revisar', 'protocolado', 'concluido'];
var NOMES_ETAPA = { afazer: 'A fazer', fazendo: 'Fazendo', revisar: 'Pronto para revisar', protocolado: 'Feito / protocolado', concluido: 'OK da administração' };
var PESO_PRAZO = 3; // pontos de um prazo processual entregue no prazo (tarefa comum vale o peso dela, 1 por padrão)

function etapaDoPrazo_(z) {
  if (z.situacao === 'cumprido') return z.etapa === 'concluido' ? 'concluido' : 'protocolado';
  var e = z.etapa || 'afazer';
  return e === 'protocolado' || e === 'concluido' ? 'afazer' : e; // reaberto volta para "a fazer"
}

function nomesUsuarios_() {
  var m = {};
  usuarios_().forEach(function (u) { m[u.usuario] = u.nome || u.usuario; });
  return m;
}

/** Quem cuida do prazo quando ninguém foi escolhido: PJe (trabalhista) e eproc (cível/federal) têm cada um o seu responsável. */
function responsavelPadrao_(proc, numero) {
  var sis = normalizar_((proc && proc.sistema) || '');
  var trib = (proc && proc.tribunal) || tribunalDoNumero_(numero);
  var pje = /pje/.test(sis) || (!/eproc/.test(sis) && (/^TRT|^TST/.test(trib || '') || /\.5\.\d{2}\.\d{4}$/.test(numero || '')));
  return config_(pje ? 'RESP_PJE' : 'RESP_EPROC') || config_('RESP_PADRAO') || '';
}

function atribuirResponsaveis_(tabZ, tabP) {
  if (!config_('RESP_PJE') && !config_('RESP_EPROC') && !config_('RESP_PADRAO')) return 0;
  var procs = {};
  tabP.linhas.forEach(function (p) { procs[p.id] = p; });
  var n = 0;
  tabZ.linhas.forEach(function (z) {
    if (z.responsavel || SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return;
    var r = responsavelPadrao_(procs[z.processo_id], z.numero);
    if (r) { atualizarLinha_(tabZ, z, { responsavel: r }); n++; }
  });
  return n;
}

function itemPrazo_(z, procs, nomesCli, hoje) {
  var p = procs[z.processo_id] || {};
  var etapa = etapaDoPrazo_(z);
  var fim = /protocolado|concluido/.test(etapa);
  var entregue = diaSP_(z.cumprido_em);
  return { tipo: 'prazo', id: z.id, titulo: z.descricao || 'Prazo', numero: z.numero, processo_id: z.processo_id,
    cliente: nomesCli[p.cliente_id] || p.cliente_nome || '', cliente_id: p.cliente_id || '', responsavel: z.responsavel || '',
    vence_em: z.fatal || '', etapa: etapa, peso: PESO_PRAZO, provisorio: /PROVISÓRIO/i.test(z.descricao || ''),
    atrasada: !fim && !!z.fatal && z.fatal < hoje, concluida_em: z.cumprido_em || '', concluida_por: z.cumprido_por || '',
    no_prazo: fim ? (!z.fatal || !entregue || entregue <= z.fatal) : null, situacao_prazo: z.situacao, resumo_ia: z.resumo_ia || '' };
}

function itemTarefa_(t, nomesCli, hoje, telCli) {
  var fim = /protocolado|concluido/.test(t.etapa);
  var entregue = diaSP_(t.concluida_em);
  return { tipo: 'tarefa', id: t.id, titulo: t.titulo, descricao: t.descricao, numero: t.numero, processo_id: t.processo_id,
    cliente: nomesCli[t.cliente_id] || '', cliente_id: t.cliente_id || '', responsavel: t.responsavel || '', vence_em: t.vence_em || '',
    etapa: t.etapa || 'afazer', peso: parseInt(t.peso, 10) || 1, atrasada: !fim && !!t.vence_em && t.vence_em < hoje,
    concluida_em: t.concluida_em || '', concluida_por: t.concluida_por || '', criado_por: t.criado_por || '',
    no_prazo: fim ? (!t.vence_em || !entregue || entregue <= t.vence_em) : null, historico: t.historico || '',
    prioridade: t.prioridade || 'normal', checklist: lerChecklist_(t.checklist), repetir: t.repetir || '', ok_por: t.ok_por || '',
    inicial: /\[inicial:/.test(t.descricao || ''), ato: atoDaTarefa_(t.descricao), telefone: (telCli || {})[t.cliente_id] || '' };
}
function atoDaTarefa_(desc) {
  var m = /\[ato:([a-z]+)\|(\d{4}-\d{2}-\d{2})\|([^|\]]*)\|([^\]]*)\]/.exec(desc || '');
  return m ? { tipo: m[1], data: m[2], hora: m[3], local: m[4].trim() } : null;
}

function lerChecklist_(txt) {
  try { var a = JSON.parse(txt || '[]'); return Array.isArray(a) ? a.slice(0, 30).map(function (x) { return { t: String(x.t || '').slice(0, 140), ok: !!x.ok }; }) : []; } catch (e) { return []; }
}
var PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];

/** Pontos e entregas por pessoa (tarefas e prazos concluídos no período). */
function pontosPorPessoa_(itens, desde, nomesU) {
  var porNome = {};
  Object.keys(nomesU).forEach(function (k) { porNome[normalizar_(nomesU[k])] = k; });
  var r = {};
  itens.forEach(function (x) {
    if (!x.concluida_em || x.concluida_em.slice(0, 10) < desde) return;
    var quem = x.tipo === 'tarefa' ? (x.concluida_por || x.responsavel) : (x.responsavel || porNome[normalizar_(x.concluida_por)] || x.concluida_por);
    if (!quem) quem = '(sem responsável)';
    var p = r[quem] = r[quem] || { usuario: quem, nome: nomesU[quem] || quem, entregues: 0, no_prazo: 0, atrasadas: 0, pontos: 0, abertas: 0, vencidas: 0 };
    p.entregues++;
    if (x.no_prazo) { p.no_prazo++; p.pontos += x.peso; } else p.atrasadas++;
  });
  itens.forEach(function (x) {
    if (/protocolado|concluido/.test(x.etapa) || !x.responsavel) return;
    var p = r[x.responsavel] = r[x.responsavel] || { usuario: x.responsavel, nome: nomesU[x.responsavel] || x.responsavel, entregues: 0, no_prazo: 0, atrasadas: 0, pontos: 0, abertas: 0, vencidas: 0 };
    p.abertas++; if (x.atrasada) p.vencidas++;
  });
  return Object.keys(r).map(function (k) { return r[k]; }).sort(function (a, b) { return b.pontos - a.pontos || b.entregues - a.entregues; });
}

/** Para o Início: quantas tarefas e prazos estão com a pessoa e quantos atrasaram. */
function minhasTarefas_(u) {
  var hoje = hojeSP_(), r = { abertas: 0, atrasadas: 0 };
  try {
    tabela_('Prazos').linhas.forEach(function (z) {
      if (z.responsavel !== u.usuario || SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return;
      r.abertas++; if (z.fatal && z.fatal < hoje) r.atrasadas++;
    });
    tabela_('Tarefas').linhas.forEach(function (t) {
      if (t.responsavel !== u.usuario || t.situacao === 'cancelada' || /protocolado|concluido/.test(t.etapa)) return;
      r.abertas++; if (t.vence_em && t.vence_em < hoje) r.atrasadas++;
    });
  } catch (e) { /* aba nova ainda não criada */ }
  return r;
}

function listarTarefas_(d, u) {
  var hoje = hojeSP_(), dias = Math.min(parseInt(d.dias, 10) || 30, 365), desde = somarDias_(hoje, -dias);
  var procs = {}, nomesCli = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  var telCli = {};
  tabela_('Clientes').linhas.forEach(function (c) { nomesCli[c.id] = c.nome; telCli[c.id] = c.telefone; });
  var itens = [];
  tabela_('Prazos').linhas.forEach(function (z) {
    if (z.situacao === 'cancelado') return;
    if (z.situacao === 'cumprido' && (z.cumprido_em || z.atualizado_em || '').slice(0, 10) < desde) return;
    if (SITUACOES_ABERTAS.indexOf(z.situacao) < 0 && z.situacao !== 'cumprido') return;
    itens.push(itemPrazo_(z, procs, nomesCli, hoje));
  });
  tabela_('Tarefas').linhas.forEach(function (t) {
    if (t.situacao === 'cancelada') return;
    if (/protocolado|concluido/.test(t.etapa) && (t.concluida_em || '').slice(0, 10) < desde) return;
    itens.push(itemTarefa_(t, nomesCli, hoje, telCli));
  });
  itens.sort(function (a, b) { return (a.vence_em || '9999') < (b.vence_em || '9999') ? -1 : (a.vence_em || '9999') > (b.vence_em || '9999') ? 1 : 0; });
  var todos = !u.usuario || (PERFIS[u.perfil] && PERFIS[u.perfil].usuarios);
  // colaborador vê só o que é dele (o que pegou com "Eu faço" ou o que passaram para ele); a administração vê tudo
  if (!todos) itens = itens.filter(function (x) { return x.responsavel === u.usuario || (x.tipo === 'tarefa' && !x.responsavel && x.criado_por === u.usuario); });
  var nomesU = nomesUsuarios_();
  return {
    hoje: hoje, dias: dias, eu: u.usuario, etapas: ETAPAS_TAREFA.map(function (e) { return { id: e, nome: NOMES_ETAPA[e] }; }),
    usuarios: usuarios_().filter(function (x) { return x.ativo === 'sim'; }).map(function (x) { return { usuario: x.usuario, nome: x.nome }; }),
    itens: itens, todos: todos, pontos: pontosPorPessoa_(itens, desde, nomesU).filter(function (p) { return todos || p.usuario === u.usuario; }),
    responsaveis: { pje: config_('RESP_PJE') || '', eproc: config_('RESP_EPROC') || '', padrao: config_('RESP_PADRAO') || '', inicial: config_('RESP_INICIAL') || '' }
  };
}

function validarResponsavel_(r) {
  r = String(r || '').trim();
  if (!r) return '';
  if (!usuarios_().some(function (x) { return x.usuario === r && x.ativo === 'sim'; })) throw falha_('Responsável não encontrado entre os usuários ativos.');
  return r;
}

function historicoMais_(antes, u, texto) {
  var linha = Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' ' + (u.nome || u.usuario) + ': ' + texto;
  return (linha + (antes ? '\n' + antes : '')).slice(0, 1500);
}

function salvarTarefa_(d, u) {
  return comTrava_(function () {
    var t = d.tarefa || {};
    var titulo = String(t.titulo || '').trim().slice(0, 200);
    if (!titulo) throw falha_('Escreva o que precisa ser feito.');
    if (t.vence_em && !/^\d{4}-\d{2}-\d{2}$/.test(t.vence_em)) throw falha_('Data de entrega inválida.');
    var proc = null;
    if (t.processo_id) proc = tabela_('Processos').linhas.filter(function (p) { return p.id === t.processo_id; })[0] || null;
    if (!proc && t.numero) proc = tabela_('Processos').linhas.filter(function (p) { return p.numero === String(t.numero).trim(); })[0] || null;
    if (t.numero && !proc) throw falha_('Processo ' + t.numero + ' não encontrado no painel.');
    var cliId = proc ? proc.cliente_id : String(t.cliente_id || '');
    if (cliId && !tabela_('Clientes').linhas.some(function (c) { return c.id === cliId; })) cliId = '';
    var agora = new Date().toISOString();
    var dados = { titulo: titulo, descricao: String(t.descricao || '').trim().slice(0, 2000), responsavel: validarResponsavel_(t.responsavel),
      vence_em: t.vence_em || '', peso: String(Math.min(Math.max(parseInt(t.peso, 10) || 1, 1), 5)),
      processo_id: proc ? proc.id : '', numero: proc ? proc.numero : '', cliente_id: cliId,
      prioridade: PRIORIDADES.indexOf(t.prioridade) >= 0 ? t.prioridade : 'normal',
      repetir: ['semanal', 'mensal'].indexOf(t.repetir) >= 0 ? t.repetir : '',
      atualizado_em: agora, atualizado_por: u.usuario };
    if (t.checklist !== undefined) {
      var itensC = (Array.isArray(t.checklist) ? t.checklist : String(t.checklist || '').split('\n').map(function (l) { return { t: l }; }))
        .map(function (x) { return { t: String(x.t || '').replace(/^\s*(\[[ x]\]|[-*•])\s*/i, '').trim().slice(0, 140), ok: !!x.ok }; }).filter(function (x) { return x.t; }).slice(0, 30);
      dados.checklist = JSON.stringify(itensC);
    }
    var tab = tabela_('Tarefas');
    if (t.id) {
      var l = tab.linhas.filter(function (x) { return x.id === t.id; })[0];
      if (!l) throw falha_('Tarefa não encontrada.');
      if (t.cancelar) dados = { situacao: 'cancelada', historico: historicoMais_(l.historico, u, 'cancelou'), atualizado_em: agora, atualizado_por: u.usuario };
      else {
        dados.historico = historicoMais_(l.historico, u, 'editou');
        // marcas internas (ligação com audiência, intimação, petição inicial, repetição) nunca se perdem ao editar
        var marcas = (String(l.descricao || '').match(/\[(inicial|rep|intim|ato|lembrete|agenda):[^\]]*\]/g) || []).filter(function (m) { return dados.descricao.indexOf(m) < 0; });
        if (marcas.length) dados.descricao = (dados.descricao + '\n' + marcas.join('\n')).slice(0, 2400);
      }
      atualizarLinha_(tab, l, dados);
      registrar_(u.usuario, t.cancelar ? 'tarefa cancelada' : 'tarefa alterada', l.id);
      return { id: l.id };
    }
    dados.id = novoId_('T'); dados.etapa = 'afazer'; dados.situacao = 'ativa'; dados.criado_em = agora; dados.criado_por = u.usuario;
    dados.historico = historicoMais_('', u, 'criou' + (dados.responsavel ? ' para ' + dados.responsavel : ''));
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'tarefa criada', dados.id + ' ' + titulo);
    return { id: dados.id };
  });
}

/** Move no quadro (tarefa ou prazo). Conferir e concluir é da controladoria (quem confere prazos). */
function moverTarefa_(d, u) {
  var etapa = String(d.etapa || '');
  if (ETAPAS_TAREFA.indexOf(etapa) < 0) throw falha_('Etapa inválida.');
  if (etapa === 'concluido' && !PERFIS[u.perfil].conferePrazos) throw falha_('Só a advogada ou a administração conferem e concluem.');
  return comTrava_(function () {
    var agora = new Date().toISOString(), fim = /protocolado|concluido/.test(etapa);
    if (d.tipo === 'prazo') {
      var tabZ = tabela_('Prazos');
      var z = tabZ.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!z) throw falha_('Prazo não encontrado.');
      var m = { etapa: etapa, atualizado_em: agora, atualizado_por: u.usuario };
      if (fim && z.situacao !== 'cumprido') { m.situacao = 'cumprido'; m.cumprido_por = u.nome || u.usuario; m.cumprido_em = agora; }
      if (!fim && z.situacao === 'cumprido') { m.situacao = z.fatal ? 'calculado' : 'a definir'; m.cumprido_por = ''; m.cumprido_em = ''; m.conferido_por = ''; m.conferido_em = ''; }
      if (!z.responsavel && !fim) m.responsavel = u.usuario;
      atualizarLinha_(tabZ, z, m);
      registrar_(u.usuario, 'prazo: ' + NOMES_ETAPA[etapa], z.id + ' ' + z.numero);
      return { ok: true };
    }
    var tab = tabela_('Tarefas');
    var t = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!t) throw falha_('Tarefa não encontrada.');
    if (t.etapa === etapa) return { ok: true, repetido: true };
    var mt = { etapa: etapa, atualizado_em: agora, atualizado_por: u.usuario, historico: historicoMais_(t.historico, u, NOMES_ETAPA[etapa]) };
    if (fim && !t.concluida_em) { mt.concluida_em = agora; mt.concluida_por = t.responsavel || u.usuario; }
    if (!fim) { mt.concluida_em = ''; mt.concluida_por = ''; }
    if (!t.responsavel && !fim) mt.responsavel = u.usuario;
    atualizarLinha_(tab, t, mt);
    if (fim) { registrar_(u.usuario, 'tarefa: ' + NOMES_ETAPA[etapa], String(t.titulo || '').slice(0, 140)); repetirTarefa_(tab, t, u); }
    return { ok: true };
  });
}

function atribuirTarefa_(d, u) {
  return comTrava_(function () {
    var resp = validarResponsavel_(d.responsavel);
    var tab = tabela_(d.tipo === 'prazo' ? 'Prazos' : 'Tarefas');
    var l = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!l) throw falha_('Não encontrado.');
    var m = { responsavel: resp, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario };
    if (d.tipo !== 'prazo') m.historico = historicoMais_(l.historico, u, resp ? 'passou para ' + resp : 'tirou o responsável');
    atualizarLinha_(tab, l, m);
    registrar_(u.usuario, 'responsável', l.id + ' → ' + (resp || '—'));
    return { ok: true };
  });
}

/** Responsáveis automáticos dos prazos (PJe / eproc). Ao salvar, distribui os prazos abertos sem responsável. */
function configTarefas_(d, u) {
  return comTrava_(function () {
    if (d.salvar) {
      setConfig_('RESP_PJE', validarResponsavel_(d.pje), 'Quem recebe os prazos novos do PJe (trabalhista)');
      setConfig_('RESP_EPROC', validarResponsavel_(d.eproc), 'Quem recebe os prazos novos do eproc (cível e federal)');
      setConfig_('RESP_PADRAO', validarResponsavel_(d.padrao), 'Responsável pelos prazos quando o sistema não é conhecido');
      var tz = tabela_('Prazos'); tz.adiar = true;
      var n = atribuirResponsaveis_(tz, tabela_('Processos')); regravarMudadas_(tz);
      if (d.inicial !== undefined) setConfig_('RESP_INICIAL', validarResponsavel_(d.inicial), 'Quem faz a petição inicial dos clientes novos com ação');
      registrar_(u.usuario, 'responsáveis automáticos', 'PJe ' + (d.pje || '—') + ', eproc ' + (d.eproc || '—') + ', inicial ' + (d.inicial || '—') + '; ' + n + ' prazos distribuídos');
      return { distribuidos: n };
    }
    return { pje: config_('RESP_PJE'), eproc: config_('RESP_EPROC'), padrao: config_('RESP_PADRAO'), inicial: config_('RESP_INICIAL') };
  });
}

/* ---------- Contas a pagar e fluxo de caixa ---------- */

var CATEGORIAS_DESPESA = ['Aluguel e condomínio', 'Salários e pró-labore', 'Impostos e taxas', 'Contador', 'Sistemas, internet e telefone',
  'Energia e água', 'Material de escritório', 'Marketing', 'OAB e anuidades', 'Custas processuais (adiantadas)', 'Perícias e diligências',
  'Deslocamento', 'Outros'];

function despesaPublica_(x, hoje, clientes) {
  var o = limpar_(x);
  o.valor_num = dinheiro_(x.valor);
  o.situacao_conta = x.situacao === 'cancelada' ? 'cancelada' : x.pago_em ? 'paga' : (x.vencimento && x.vencimento < hoje ? 'atrasada' : 'a pagar');
  o.cliente = (clientes[x.cliente_id] || {}).nome || '';
  return o;
}

/** Despesas mensais fixas: mantém as próximas geradas até 2 meses à frente. */
function estenderDespesas_() {
  var tab = tabela_('Despesas'), limite = somarDias_(hojeSP_(), 62), series = {};
  tab.linhas.forEach(function (x) {
    if (x.recorrente !== 'mensal' || !x.serie_id || x.situacao === 'cancelada') return;
    if (!series[x.serie_id] || x.vencimento > series[x.serie_id].vencimento) series[x.serie_id] = x;
  });
  var n = 0;
  Object.keys(series).forEach(function (k) {
    var ult = series[k], prox = mesSeguinte_(ult.vencimento, +ult.vencimento.slice(8, 10));
    for (var i = 0; i < 24 && prox <= limite; i++) {
      var agora = new Date().toISOString();
      inserirLinha_(tab, { id: novoId_('D'), descricao: ult.descricao, categoria: ult.categoria, valor: ult.valor, vencimento: prox, pago_em: '', valor_pago: '',
        forma: '', cliente_id: '', processo_id: '', reembolsavel: 'nao', reembolsado_em: '', recorrente: 'mensal', serie_id: k, situacao: 'ativa',
        observacoes: '', criado_em: agora, atualizado_em: agora, atualizado_por: 'sistema' });
      prox = mesSeguinte_(prox, +ult.vencimento.slice(8, 10)); n++;
    }
  });
  return n;
}

function salvarDespesa_(d, u) {
  return comTrava_(function () {
    var x = d.despesa || {};
    var descricao = String(x.descricao || '').trim().slice(0, 200);
    if (!descricao) throw falha_('Descreva a despesa.');
    var valor = dinheiro_(x.valor);
    if (!(valor > 0)) throw falha_('Informe o valor.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.vencimento || '')) throw falha_('Informe a data de vencimento.');
    if (x.pago_em && !/^\d{4}-\d{2}-\d{2}$/.test(x.pago_em)) throw falha_('Data do pagamento inválida.');
    var cat = CATEGORIAS_DESPESA.indexOf(x.categoria) >= 0 ? x.categoria : 'Outros';
    var reemb = x.reembolsavel === 'sim' ? 'sim' : 'nao';
    if (reemb === 'sim' && !x.cliente_id) throw falha_('Para cobrar do cliente depois, escolha o cliente.');
    var agora = new Date().toISOString();
    var dados = { descricao: descricao, categoria: cat, valor: txtDinheiro_(valor), vencimento: x.vencimento, cliente_id: String(x.cliente_id || ''),
      processo_id: String(x.processo_id || ''), reembolsavel: reemb, observacoes: String(x.observacoes || '').trim().slice(0, 1000),
      atualizado_em: agora, atualizado_por: u.usuario };
    if (x.pago_em !== undefined) { dados.pago_em = x.pago_em || ''; dados.valor_pago = x.pago_em ? txtDinheiro_(dinheiro_(x.valor_pago) || valor) : ''; dados.forma = String(x.forma || ''); }
    var tab = tabela_('Despesas');
    if (x.id) {
      var l = tab.linhas.filter(function (r) { return r.id === x.id; })[0];
      if (!l) throw falha_('Despesa não encontrada.');
      atualizarLinha_(tab, l, dados);
      registrar_(u.usuario, 'despesa alterada', l.id + ' R$ ' + dados.valor);
      return { id: l.id };
    }
    dados.id = novoId_('D'); dados.situacao = 'ativa'; dados.criado_em = agora; dados.reembolsado_em = '';
    dados.recorrente = x.recorrente === 'mensal' ? 'mensal' : ''; dados.serie_id = dados.recorrente ? dados.id : '';
    inserirLinha_(tab, dados);
    if (dados.recorrente) estenderDespesas_();
    registrar_(u.usuario, 'despesa lançada', dados.id + ' ' + descricao + ' R$ ' + dados.valor);
    return { id: dados.id };
  });
}

/** Pagar / estornar / reembolsado pelo cliente / cancelar (uma ou a série mensal inteira). */
function acaoDespesa_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Despesas');
    var l = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!l) throw falha_('Despesa não encontrada.');
    var agora = new Date().toISOString(), m = { atualizado_em: agora, atualizado_por: u.usuario };
    if (d.acao === 'pagar') {
      var data = d.data || hojeSP_();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw falha_('Data inválida.');
      m.pago_em = data; m.valor_pago = txtDinheiro_(dinheiro_(d.valor) || dinheiro_(l.valor)); m.forma = String(d.forma || '');
    } else if (d.acao === 'estornar') { m.pago_em = ''; m.valor_pago = ''; m.forma = ''; }
    else if (d.acao === 'reembolsado') { m.reembolsado_em = d.data || hojeSP_(); }
    else if (d.acao === 'nao_reembolsado') { m.reembolsado_em = ''; }
    else if (d.acao === 'cancelar') {
      m.situacao = 'cancelada';
      if (d.serie && l.serie_id) {
        tab.linhas.forEach(function (r) {
          if (r.serie_id !== l.serie_id) return;
          if (!r.pago_em && r.vencimento >= l.vencimento) atualizarLinha_(tab, r, { situacao: 'cancelada', recorrente: '', atualizado_em: agora, atualizado_por: u.usuario });
          else if (r.recorrente) atualizarLinha_(tab, r, { recorrente: '' });
        });
        registrar_(u.usuario, 'despesa mensal encerrada', l.serie_id);
        return { ok: true };
      }
    } else throw falha_('Ação inválida.');
    atualizarLinha_(tab, l, m);
    registrar_(u.usuario, 'despesa: ' + d.acao, l.id);
    return { ok: true };
  });
}

function mesesAtras_(hoje, n) {
  var a = +hoje.slice(0, 4), m = +hoje.slice(5, 7), r = [];
  for (var i = n - 1; i >= 0; i--) {
    var mm = m - i, aa = a;
    while (mm < 1) { mm += 12; aa--; }
    r.push(aa + '-' + ('0' + mm).slice(-2));
  }
  return r;
}
function mesesAFrente_(hoje, n) {
  var a = +hoje.slice(0, 4), m = +hoje.slice(5, 7), r = [];
  for (var i = 0; i < n; i++) {
    var mm = m + i, aa = a;
    while (mm > 12) { mm -= 12; aa++; }
    r.push(aa + '-' + ('0' + mm).slice(-2));
  }
  return r;
}

/** Entradas (parcelas recebidas) e saídas (despesas pagas) mês a mês. */
function fluxoMensal_(meses) {
  var r = {};
  meses.forEach(function (m) { r[m] = { mes: m, entradas: 0, saidas: 0, saldo: 0 }; });
  tabela_('Parcelas').linhas.forEach(function (p) {
    var k = (p.pago_em || '').slice(0, 7);
    if (r[k]) r[k].entradas += dinheiro_(p.valor_pago) || dinheiro_(p.valor);
  });
  tabela_('Despesas').linhas.forEach(function (x) {
    var k = (x.pago_em || '').slice(0, 7);
    if (r[k] && x.situacao !== 'cancelada') r[k].saidas += dinheiro_(x.valor_pago) || dinheiro_(x.valor);
  });
  return meses.map(function (m) {
    var o = r[m]; o.entradas = Math.round(o.entradas * 100) / 100; o.saidas = Math.round(o.saidas * 100) / 100;
    o.saldo = Math.round((o.entradas - o.saidas) * 100) / 100; return o;
  });
}

function caixa_(d) {
  comTrava_(function () { estenderDespesas_(); estenderMensais_(); });
  var hoje = hojeSP_(), clientes = mapaClientes_();
  var mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : hoje.slice(0, 7);
  var desp = tabela_('Despesas').linhas.filter(function (x) { return x.situacao !== 'cancelada'; }).map(function (x) { return despesaPublica_(x, hoje, clientes); });
  var em30 = somarDias_(hoje, 30);
  var abertas = desp.filter(function (x) { return !x.pago_em; });
  var futuro = mesesAFrente_(hoje, 3), prev = {};
  futuro.forEach(function (m) { prev[m] = { mes: m, entradas: 0, saidas: 0 }; });
  var hons = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  tabela_('Parcelas').linhas.forEach(function (p) {
    var h = hons[p.honorario_id] || {};
    if (p.pago_em || ['cancelado', 'encerrado', 'quitado'].indexOf(h.situacao) >= 0) return;
    var k = (p.vencimento || '').slice(0, 7);
    if (prev[k]) prev[k].entradas += dinheiro_(p.valor) - dinheiro_(p.valor_pago);
  });
  abertas.forEach(function (x) { var k = x.vencimento.slice(0, 7); if (prev[k]) prev[k].saidas += x.valor_num; });
  var reemb = {};
  desp.forEach(function (x) {
    if (x.reembolsavel !== 'sim' || !x.pago_em || x.reembolsado_em) return;
    var g = reemb[x.cliente_id] = reemb[x.cliente_id] || { cliente_id: x.cliente_id, cliente: x.cliente, total: 0, itens: [] };
    g.total = Math.round((g.total + (dinheiro_(x.valor_pago) || x.valor_num)) * 100) / 100; g.itens.push(x);
  });
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var soma = function (l) { return r2(l.reduce(function (t, x) { return t + x.valor_num; }, 0)); };
  var atrasadas = abertas.filter(function (x) { return x.vencimento < hoje; }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var proximas = abertas.filter(function (x) { return x.vencimento >= hoje && x.vencimento <= em30; }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var doMes = desp.filter(function (x) { return x.vencimento.slice(0, 7) === mes || (x.pago_em || '').slice(0, 7) === mes; })
    .sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; });
  var porCat = {};
  doMes.forEach(function (x) { porCat[x.categoria] = r2((porCat[x.categoria] || 0) + x.valor_num); });
  var fluxo = fluxoMensal_(mesesAtras_(hoje, 12));
  return {
    hoje: hoje, mes: mes, categorias: CATEGORIAS_DESPESA, fluxo: fluxo,
    previsao: futuro.map(function (m) { var o = prev[m]; o.entradas = r2(o.entradas); o.saidas = r2(o.saidas); o.saldo = r2(o.entradas - o.saidas); return o; }),
    atrasadas: atrasadas, proximas: proximas, doMes: doMes,
    porCategoria: Object.keys(porCat).map(function (k) { return { categoria: k, valor: porCat[k] }; }).sort(function (a, b) { return b.valor - a.valor; }),
    reembolsar: Object.keys(reemb).map(function (k) { return reemb[k]; }).sort(function (a, b) { return b.total - a.total; }),
    totais: { atrasado: soma(atrasadas), proximos30: soma(proximas), mesEntradas: (fluxo.filter(function (f) { return f.mes === mes; })[0] || {}).entradas || 0,
      mesSaidas: (fluxo.filter(function (f) { return f.mes === mes; })[0] || {}).saidas || 0 }
  };
}

/* ---------- Relatórios (administração) ---------- */

function relatorioGeral_(d) {
  var hoje = hojeSP_(), meses = mesesAtras_(hoje, 12), idx = {};
  meses.forEach(function (m, i) { idx[m] = i; });
  var serie = function () { return meses.map(function () { return 0; }); };
  var importado = /hist|GEA|carga|levantamento|planilha|importa/i;
  var clientesNovos = serie(), processosNovos = serie(), intimacoes = serie(), prazosEntregues = serie(), prazosNoPrazo = serie();
  var areasNovas = {};
  tabela_('Clientes').linhas.forEach(function (c) {
    var k = (c.criado_em || '').slice(0, 7);
    if (idx[k] !== undefined && !importado.test(c.origem || '') && !importado.test(c.atualizado_por || '')) clientesNovos[idx[k]]++;
  });
  var porArea = {}, porFase = {}, porTribunal = {};
  tabela_('Processos').linhas.forEach(function (p) {
    if (p.status !== 'arquivado') { porFase[p.fase || 'andamento'] = (porFase[p.fase || 'andamento'] || 0) + 1; var tb = p.tribunal || '—'; porTribunal[tb] = (porTribunal[tb] || 0) + 1; }
    var a = p.area || 'Sem área';
    var o = porArea[a] = porArea[a] || { area: a, ativos: 0, arquivados: 0 };
    if (p.status === 'arquivado') o.arquivados++; else o.ativos++;
    var k = (p.criado_em || '').slice(0, 7);
    if (idx[k] !== undefined && !importado.test(p.origem || '')) { processosNovos[idx[k]]++; areasNovas[a] = (areasNovas[a] || 0) + 1; }
  });
  tabela_('Intimacoes').linhas.forEach(function (i) { var k = (i.recebido_em || '').slice(0, 7); if (idx[k] !== undefined) intimacoes[idx[k]]++; });
  var abertosVencidos = 0;
  tabela_('Prazos').linhas.forEach(function (z) {
    if (z.situacao === 'cumprido') {
      var q = diaSP_(z.cumprido_em || z.atualizado_em), k = q.slice(0, 7);
      if (idx[k] !== undefined) { prazosEntregues[idx[k]]++; if (!z.fatal || q <= z.fatal) prazosNoPrazo[idx[k]]++; }
    } else if (SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && z.fatal && z.fatal < hoje) abertosVencidos++;
  });
  var ent = prazosEntregues.reduce(function (a, b) { return a + b; }, 0), np = prazosNoPrazo.reduce(function (a, b) { return a + b; }, 0);
  var t = listarTarefas_({ dias: Math.min(parseInt(d.dias, 10) || 90, 365) }, { usuario: '' });
  var fluxo = fluxoMensal_(meses);
  return {
    hoje: hoje, meses: meses, clientesNovos: clientesNovos, processosNovos: processosNovos, intimacoes: intimacoes,
    prazosEntregues: prazosEntregues, prazosNoPrazo: prazosNoPrazo, percentualNoPrazo: ent ? Math.round(np * 100 / ent) : null, prazosVencidosAbertos: abertosVencidos,
    porArea: Object.keys(porArea).map(function (k) { return porArea[k]; }).sort(function (a, b) { return b.ativos - a.ativos; }),
    porFase: porFase,
    porTribunal: Object.keys(porTribunal).map(function (k) { return { tribunal: k, n: porTribunal[k] }; }).sort(function (a, b) { return b.n - a.n; }),
    areasNovas: Object.keys(areasNovas).map(function (k) { return { area: k, n: areasNovas[k] }; }).sort(function (a, b) { return b.n - a.n; }),
    entradas: fluxo.map(function (f) { return f.entradas; }), saidas: fluxo.map(function (f) { return f.saidas; }),
    produtividade: t.pontos, diasProdutividade: t.dias
  };
}

/** Marca ou desmarca um item do checklist da tarefa. */
function marcarItemTarefa_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Tarefas'), t = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!t) throw falha_('Tarefa não encontrada.');
    var lista = lerChecklist_(t.checklist), i = parseInt(d.i, 10);
    if (!lista[i]) throw falha_('Item não encontrado.');
    lista[i].ok = !!d.ok;
    atualizarLinha_(tab, t, { checklist: JSON.stringify(lista), historico: historicoMais_(t.historico, u, (d.ok ? '☑ ' : '☐ ') + lista[i].t), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    return { checklist: lista };
  });
}

/** Comentário na tarefa (fica no histórico com nome e hora). */
function comentarTarefa_(d, u) {
  var txt = String(d.texto || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!txt) throw falha_('Escreva o comentário.');
  return comTrava_(function () {
    var tab = tabela_('Tarefas'), t = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!t) throw falha_('Tarefa não encontrada.');
    atualizarLinha_(tab, t, { historico: historicoMais_(t.historico, u, '💬 ' + txt), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    return { historico: tab.linhas.filter(function (x) { return x.id === d.id; })[0].historico };
  });
}

/** Tarefa que se repete: ao terminar, cria a próxima (mesmo responsável, checklist zerado). */
function repetirTarefa_(tab, t, u) {
  if (!t.repetir || t.situacao === 'cancelada') return null;
  var marca = '[rep:' + t.id + ']';
  if (tab.linhas.some(function (x) { return (x.descricao || '').indexOf(marca) >= 0; })) return null;
  var base = t.vence_em || hojeSP_();
  var prox = t.repetir === 'mensal' ? somarMeses_(base, 1) : somarDias_(base, 7);
  while (prox < hojeSP_()) prox = t.repetir === 'mensal' ? somarMeses_(prox, 1) : somarDias_(prox, 7);
  var agora = new Date().toISOString();
  var nova = { id: novoId_('T'), titulo: t.titulo, descricao: String(t.descricao || '').replace(/\n?\[rep:[^\]]+\]/g, '') + '\n' + marca, responsavel: t.responsavel, processo_id: t.processo_id,
    numero: t.numero, cliente_id: t.cliente_id, vence_em: prox, etapa: 'afazer', peso: t.peso, situacao: 'ativa', concluida_por: '', concluida_em: '',
    historico: historicoMais_('', u, 'repetição ' + t.repetir + ' (criada ao terminar a anterior)'), criado_em: agora, criado_por: 'robô', atualizado_em: agora, atualizado_por: 'robô',
    prioridade: t.prioridade, checklist: JSON.stringify(lerChecklist_(t.checklist).map(function (x) { return { t: x.t, ok: false }; })), repetir: t.repetir, ok_por: '', ok_em: '' };
  inserirLinha_(tab, nova);
  return nova.id;
}

function somarMeses_(iso, n) {
  var a = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n, d = +iso.slice(8, 10);
  var alvo = new Date(Date.UTC(a, m, 1)), ult = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return Utilities.formatDate(new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ult), 12)), 'UTC', 'yyyy-MM-dd');
}

/** Início de cada pessoa: o que está com ela, o que fez na semana e o que espera o OK. */
function meuPainel_(d, u) {
  var t = listarTarefas_({ dias: 7 }, u), hoje = hojeSP_();
  var minhas = t.itens.filter(function (x) { return x.responsavel === u.usuario && !/protocolado|concluido/.test(x.etapa); });
  var semana = relatorioSemana_({});
  var eu = semana.pessoas.filter(function (p) { return p.usuario === u.usuario; })[0] || { total: 0, grupos: {}, itens: [] };
  var posicao = semana.pessoas.filter(function (p) { return p.total; }).map(function (p) { return p.usuario; }).indexOf(u.usuario) + 1;
  var esperando = 0;
  try { var nomeEu = u.nome || u.usuario; esperando = aguardandoOk_().filter(function (x) { return x.por === nomeEu || x.por === u.usuario; }).length; } catch (e) { /* segue */ }
  var iniciais = tabela_('Processos').linhas.filter(function (p) { return p.fase === 'contratado' && p.status !== 'arquivado' && p.responsavel === u.usuario; }).length;
  return {
    minhas: minhas.slice(0, 40), abertas: minhas.length, atrasadas: minhas.filter(function (x) { return x.atrasada; }).length,
    hoje: minhas.filter(function (x) { return x.vence_em === hoje; }).length, iniciais: iniciais,
    semana: { inicio: semana.inicio, fim: semana.fim, total: eu.total, grupos: eu.grupos, itens: eu.itens.slice(0, 12), posicao: posicao, equipe: semana.pessoas.filter(function (p) { return p.total; }).length },
    categorias: semana.categorias, esperando: esperando
  };
}

/** "Eu faço": a pessoa pega o prazo, a intimação ou a petição inicial; aparece nas Tarefas dela. */
function assumirTrabalho_(d, u) {
  var para = d.para ? pessoaDaEquipe_(d.para, u) : { usuario: u.usuario, nome: u.nome || u.usuario };
  if (para.usuario !== u.usuario && !PERFIS[u.perfil].usuarios && !PERFIS[u.perfil].conferePrazos) throw falha_('Só a administração passa trabalho para outra pessoa.');
  var agora = new Date().toISOString();
  return comTrava_(function () {
    var tabZ = tabela_('Prazos');
    var pegarPrazo = function (z) {
      atualizarLinha_(tabZ, z, { responsavel: para.usuario, etapa: z.etapa === 'afazer' || !z.etapa ? 'fazendo' : z.etapa, atualizado_em: agora, atualizado_por: u.usuario });
      registrar_(u.usuario, 'responsável', 'prazo ' + z.numero + ' → ' + para.usuario);
      return { ok: true, tipo: 'prazo', id: z.id, para: para.nome };
    };
    if (d.tipo === 'prazo') {
      var z = tabZ.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!z) throw falha_('Prazo não encontrado.');
      return pegarPrazo(z);
    }
    if (d.tipo === 'intimacao') {
      var i = tabela_('Intimacoes').linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!i) throw falha_('Intimação não encontrada.');
      var zi = tabZ.linhas.filter(function (x) { return x.id === i.prazo_id && SITUACOES_ABERTAS.indexOf(x.situacao) >= 0; })[0];
      if (zi) return pegarPrazo(zi);
      // sem prazo: vira tarefa da pessoa, ligada à intimação
      var tabT = tabela_('Tarefas'), marca = '[intim:' + i.id + ']';
      var ja = tabT.linhas.filter(function (x) { return (x.descricao || '').indexOf(marca) >= 0 && !x.concluida_em && x.situacao !== 'cancelada'; })[0];
      if (ja) { atualizarLinha_(tabT, ja, { responsavel: para.usuario, historico: historicoMais_(ja.historico, u, 'passou para ' + para.nome), atualizado_em: agora, atualizado_por: u.usuario }); return { ok: true, tipo: 'tarefa', id: ja.id, para: para.nome }; }
      var p = tabela_('Processos').linhas.filter(function (x) { return x.id === i.processo_id || x.numero === i.numero; })[0] || {};
      var t = { id: novoId_('T'), titulo: 'Intimação: ' + String(i.movimento || 'ver o ato').slice(0, 120), descricao: 'Recebida em ' + dataBR_(String(i.recebido_em).slice(0, 10)) + ' (' + (i.fonte || '') + '). Abrir no sistema, ver o que pede e fazer.\n' + marca,
        responsavel: para.usuario, processo_id: p.id || '', numero: i.numero, cliente_id: p.cliente_id || '', vence_em: '', etapa: 'fazendo', peso: '1', situacao: 'ativa',
        concluida_por: '', concluida_em: '', historico: historicoMais_('', u, 'pegou a intimação' + (para.usuario !== u.usuario ? ' para ' + para.nome : '')), criado_em: agora, criado_por: u.usuario,
        atualizado_em: agora, atualizado_por: u.usuario, prioridade: 'normal', checklist: '[]', repetir: '', ok_por: '', ok_em: '' };
      inserirLinha_(tabT, t);
      return { ok: true, tipo: 'tarefa', id: t.id, para: para.nome };
    }
    if (d.tipo === 'inicial') {
      var tabP = tabela_('Processos'), pr = tabP.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!pr) throw falha_('Processo não encontrado.');
      atualizarLinha_(tabP, pr, { responsavel: para.usuario, atualizado_em: agora, atualizado_por: u.usuario });
      if (!tabela_('Tarefas').linhas.some(function (x) { return (x.descricao || '').indexOf('[inicial:' + pr.id + ']') >= 0; })) tarefaPeticaoInicial_(pr, u);
      passarPeticaoInicial_(pr, para.usuario, u);
      tabela_('Tarefas').linhas.forEach(function (x) { if ((x.descricao || '').indexOf('[inicial:' + pr.id + ']') >= 0 && x.etapa === 'afazer') atualizarLinha_(tabela_('Tarefas'), x, { etapa: 'fazendo' }); });
      registrar_(u.usuario, 'responsável', 'petição inicial ' + pr.id + ' → ' + para.usuario);
      return { ok: true, tipo: 'inicial', id: pr.id, para: para.nome };
    }
    throw falha_('Tipo inválido.');
  });
}

/** Quadro de Processos: arrastar para outra etapa (ou "Concluir etapa"). A etapa segue andando sozinha para a frente. */
function mudarFaseProcesso_(d, u) {
  if (!FASES[d.fase]) throw falha_('Etapa inválida.');
  return comTrava_(function () {
    var tab = tabela_('Processos'), p = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!p) throw falha_('Processo não encontrado.');
    if (p.fase === d.fase) return { ok: true, repetido: true };
    if (d.fase !== 'contratado' && !p.numero && ORDEM_FASE[d.fase] > ORDEM_FASE.ajuizado) throw falha_('Coloque o número do processo antes de passar desta etapa (abra o processo).');
    var m = { fase: d.fase, fase_auto: '', atualizado_em: new Date().toISOString(), atualizado_por: u.usuario };
    if (d.fase === 'extinto' && p.status !== 'arquivado') m.status = 'arquivado';
    if (p.status === 'arquivado' && d.fase !== 'extinto') m.status = 'ativo';
    atualizarLinha_(tab, p, m);
    registrar_(u.usuario, 'processo etapa', (p.numero || 'a ajuizar') + ' → ' + FASES[d.fase]);
    return { ok: true, fase: d.fase, nome: FASES[d.fase] };
  });
}

/* ---------- Revisão geral dos dados (botão da administração e, a parte segura, o robô de 6 em 6 h) ---------- */

/**
 * Confere e arruma o que dá para arrumar sozinho:
 *  - etapa (fase) gravada em todos os processos; arquivado = "Encerrado"; tribunal e área pelo número/vara;
 *  - processo sem cliente ligado a um cliente com o MESMO nome (só quando há um único cliente com aquele nome);
 *  - cadastros "importado — conferir" passam a "completo" (os campos que faltam aparecem na ficha);
 *  - prazos "a definir" ganham data (regra do prazo mais curto); Gmail dos últimos 10 dias relido (sem duplicar).
 * d.aplicar = false só conta (prévia).
 */
function revisaoGeral_(d, u) {
  var aplicar = !!d.aplicar, r = { fase: 0, encerrados: 0, tribunal: 0, area: 0, clienteLigado: 0, clientesCriados: 0, cadastros: 0, semNumero: [], semCliente: 0, prazosDefinidos: 0, faltando: {} };
  comTrava_(function () {
    var tabP = tabela_('Processos'), tabC = tabela_('Clientes');
    var porNome = {};
    tabC.linhas.forEach(function (c) { var k = normalizar_(c.nome); (porNome[k] = porNome[k] || []).push(c); });
    tabP.adiar = true; tabC.adiar = true; tabC.buffer = [];
    tabP.linhas.forEach(function (p) {
      var m = {};
      if (!p.fase || !FASES[p.fase]) { m.fase = faseDe_(p); r.fase++; }
      if (p.status === 'arquivado' && (m.fase || p.fase) !== 'extinto' && p.fase_auto !== 'nao') { m.fase = 'extinto'; r.encerrados++; }
      if (p.numero && !p.tribunal) { m.tribunal = tribunalDoNumero_(p.numero); r.tribunal++; }
      if (!p.area) {
        var trib = m.tribunal || p.tribunal || tribunalDoNumero_(p.numero);
        var a = /^(TRT|TST)/.test(trib || '') || /\.5\.\d{2}\.\d{4}$/.test(p.numero || '') ? 'Trabalhista' : areaPeloOrgao_(p.orgao || '') || (/^TRF/.test(trib || '') ? 'Federal' : '');
        if (a) { m.area = a; r.area++; }
      }
      if (!p.cliente_id && p.cliente_nome && p.cliente_nome !== 'a identificar') {
        var kn = normalizar_(p.cliente_nome), cs = porNome[kn] || [];
        if (cs.length === 1) { m.cliente_id = cs[0].id; m.cliente_nome = ''; r.clienteLigado++; }
        else if (!cs.length && kn.length >= 5 && !/sigil|segredo|a identificar|\bltda\b.*\be outros?\b/.test(kn)) {
          // o aviso do tribunal trouxe o nome do nosso cliente, mas ele não tem cadastro: cria (só o nome, sem pasta nova no Drive)
          var agoraC = new Date().toISOString();
          var novoC = { id: novoId_('C'), tipo: /\b(ltda|eireli|s\/?a|me|epp|condominio|associacao|cooperativa|residencial)\b/.test(kn) ? 'PJ' : 'PF', nome: String(p.cliente_nome).trim(),
            origem: 'processo (revisão geral)', situacao: 'completo', area: p.area || '', criado_em: agoraC, atualizado_em: agoraC, atualizado_por: 'revisão geral' };
          if (aplicar) inserirLinha_(tabC, novoC);
          porNome[kn] = [novoC];
          m.cliente_id = novoC.id; m.cliente_nome = ''; r.clientesCriados++; r.clienteLigado++;
        }
      }
      if (!p.cliente_id && !m.cliente_id) r.semCliente++;
      if (!p.numero && (m.fase || p.fase) !== 'contratado') r.semNumero.push({ id: p.id, cliente: p.cliente_nome || '', origem: p.origem || '' });
      if (aplicar && Object.keys(m).length) atualizarLinha_(tabP, p, m);
    });
    tabC.linhas.forEach(function (c) {
      ['cpf_cnpj', 'endereco', 'telefone', 'profissao', 'rg'].forEach(function (k) { if (!c[k] && !(c.tipo === 'PJ' && /rg|profissao/.test(k))) r.faltando[k] = (r.faltando[k] || 0) + 1; });
      if (c.situacao && c.situacao !== 'completo') { r.cadastros++; if (aplicar) atualizarLinha_(tabC, c, { situacao: 'completo' }); }
    });
    if (aplicar) { regravarMudadas_(tabP); regravarMudadas_(tabC); gravarLote_(tabC); }
  });
  if (aplicar) {
    try { var ctx = contextoRobo_(); var antes = ctx.prazos.linhas.filter(function (z) { return z.situacao === 'a definir'; }).length;
      definirPendentes_(ctx); [ctx.procs, ctx.intim, ctx.prazos].forEach(gravarLote_);
      r.prazosDefinidos = antes - ctx.prazos.linhas.filter(function (z) { return z.situacao === 'a definir'; }).length; } catch (e) { r.erroPrazos = String(e.message || e); }
    setConfig_('ROBO_GMAIL_DESDE', String(Date.now() - 10 * 86400000), 'Desde quando o robô lê o Gmail (a revisão geral manda reler 10 dias)');
    registrar_(u.usuario, 'revisão geral', JSON.stringify({ fase: r.fase, encerrados: r.encerrados, area: r.area, clientes: r.clienteLigado, cadastros: r.cadastros }));
  }
  r.semNumero = r.semNumero.slice(0, 30);
  r.aplicado = aplicar;
  return r;
}

/* ---------- Robô da velocidade: deixa as listas prontas na memória do servidor ---------- */

/** As listas que todo mundo abre ficam calculadas antes de alguém pedir (por perfil). Roda de 10 em 10 min e depois do robô. */
function aquecerMemoria_() {
  var t0 = Date.now(), perfis = {};
  usuarios_().forEach(function (x) { if (x.ativo === 'sim' && PERFIS[x.perfil]) perfis[x.perfil] = x; });
  var pedidos = [['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }], ['relatorio.geral', {}], ['fin.honorarios', {}]];
  var n = 0;
  Object.keys(perfis).forEach(function (pf) {
    var u = perfis[pf];
    pedidos.forEach(function (pd) {
      if (Date.now() - t0 > 240000) return;
      var rota = ROTAS[pd[0]];
      if (!rota || (rota.permissao && !PERFIS[pf][rota.permissao])) return;
      try {
        comMemoria_(pd[0], u, pd[1], function () { var x = rota.fn(pd[1], u, ''); return PERFIS[pf].ocultarValores ? semValores_(x) : x; });
        n++;
      } catch (e) { /* segue */ }
    });
  });
  return n;
}
function aquecerGatilho() { try { aquecerMemoria_(); } catch (e) { /* segue */ } }

/* ---------- Início: audiências para avisar, aniversariantes e cobranças do dia ---------- */

/** Dia e mês do nascimento ("1990-05-03" ou "03/05/1990"). */
function diaMesNasc_(v) {
  v = String(v || '').trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (m) return m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(v); if (m) return ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function inicioExtras_(d, u) {
  var hoje = hojeSP_(), ate = somarDias_(hoje, 7), pf = PERFIS[u.perfil];
  var clis = {}, procs = {};
  tabela_('Clientes').linhas.forEach(function (c) { clis[c.id] = c; });
  tabela_('Processos').linhas.forEach(function (p) { if (p.numero) procs[p.numero] = p; });
  // audiências e perícias dos próximos 7 dias (o robô marca; aqui a secretaria avisa o cliente)
  var audiencias = tabela_('Eventos').linhas.filter(function (e) { return e.data >= hoje && e.data <= ate; })
    .sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; }).slice(0, 30)
    .map(function (e) {
      var p = procs[e.numero] || {}, c = clis[p.cliente_id] || {};
      return { chave: e.chave, tipo: tipoAtoDe_(e.tipo), nome: e.tipo, data: e.data, hora: e.hora || '', numero: e.numero, local: p.orgao || '',
        cliente: c.nome || (p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '', telefone: c.telefone || '', processo_id: p.id || '',
        avisado_em: e.avisado_em || '', avisado_por: e.avisado_por || '' };
    });
  // aniversariantes de hoje
  var dm = hoje.slice(5);
  var aniversarios = Object.keys(clis).map(function (k) { return clis[k]; })
    .filter(function (c) { return diaMesNasc_(c.nascimento) === dm; })
    .map(function (c) { var a = /^(\d{4})/.exec(String(c.nascimento)) || /(\d{4})$/.exec(String(c.nascimento)); return { id: c.id, nome: c.nome, telefone: c.telefone || '', idade: a ? (+hoje.slice(0, 4) - +a[1]) : null }; });
  // cobranças do dia: parcelas que vencem hoje e as atrasadas (até 30), para a secretaria cobrar no WhatsApp
  var cobrancas = [];
  if (pf.financeiro || u.perfil === 'secretario') {
    var hons = {};
    tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
    var verValor = pf.financeiro && !pf.ocultarValores;
    cobrancas = tabela_('Parcelas').linhas.filter(function (q) { return !q.pago_em && q.vencimento && q.vencimento <= hoje; })
      .sort(function (a, b) { return a.vencimento < b.vencimento ? 1 : -1; })
      .map(function (q) { var c = clis[q.cliente_id] || {}, h = hons[q.honorario_id] || {};
        return { id: q.id, cliente: c.nome || '', telefone: c.telefone || '', vencimento: q.vencimento, numero: q.numero, honorario: h.descricao || '',
          dias: diffDias_(hoje, q.vencimento), valor: verValor ? q.valor : null, mensagem_em: q.mensagem_em || '' }; })
      .filter(function (x) { return x.cliente && x.dias <= 90; })
      .sort(function (a, b) { return (a.dias === 0 ? -1 : 0) - (b.dias === 0 ? -1 : 0) || a.dias - b.dias; }).slice(0, 30);
  }
  return { audiencias: audiencias, aniversarios: aniversarios, cobrancas: cobrancas, hoje: hoje };
}

/** "Avisei o cliente" da audiência: fica marcado para a equipe não avisar duas vezes. */
function marcarAvisado_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Eventos'), e = tab.linhas.filter(function (x) { return x.chave === d.chave; })[0];
    if (!e) throw falha_('Audiência não encontrada.');
    atualizarLinha_(tab, e, { avisado_em: new Date().toISOString(), avisado_por: u.nome || u.usuario });
    registrar_(u.usuario, 'whatsapp ao cliente', (e.numero || '') + ' · aviso de ' + e.tipo + ' em ' + dataBR_(e.data));
    return { ok: true };
  });
}

/* ---------- Conferido (colaborador) → OK (administração) ---------- */

/** Intimações ligadas ao prazo (pelo prazo ou pela intimação: prazo lançado à mão às vezes só tem um lado). */
function intimacoesDoPrazo_(tabI, z) {
  return tabI.linhas.filter(function (i) { return (z.intimacao_id && i.id === z.intimacao_id) || (i.prazo_id && i.prazo_id === z.id); });
}

/** Quem trabalha no escritório (para escolher quem fez). */
function listarEquipe_() {
  return usuarios_().filter(function (x) { return x.ativo === 'sim'; })
    .map(function (x) { return { usuario: x.usuario, nome: x.nome || x.usuario, perfil: x.perfil }; })
    .sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
}

function pessoaDaEquipe_(usuario, u) {
  var x = usuarios_().filter(function (r) { return r.usuario === (usuario || u.usuario) && r.ativo === 'sim'; })[0];
  if (!x) throw falha_('Escolha quem fez, na lista da equipe.');
  return { usuario: x.usuario, nome: x.nome || x.usuario };
}

/**
 * O colaborador terminou: escolhe quem fez e aperta "Conferido". Some da lista da equipe e fica para a administração dar o OK.
 * tipo: 'prazo' | 'intimacao' | 'inicial' (id do processo; numero opcional: com ele o processo vai para "Em andamento").
 */
function conferirTrabalho_(d, u) {
  var quem = pessoaDaEquipe_(d.por, u), agora = new Date().toISOString();
  return comTrava_(function () {
    var tabZ = tabela_('Prazos'), tabI = tabela_('Intimacoes');
    var cumprirPrazo = function (z) {
      if (!z || SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return false;
      atualizarLinha_(tabZ, z, { situacao: 'cumprido', cumprido_por: quem.nome, cumprido_em: agora, etapa: 'protocolado', ok_por: '', ok_em: '', atualizado_em: agora, atualizado_por: u.usuario });
      return true;
    };
    var terminarIntim = function (i) {
      if (!i || i.terminada_por) return false;
      atualizarLinha_(tabI, i, { terminada_por: quem.nome, terminada_em: agora, ok_por: '', ok_em: '' });
      return true;
    };
    var marcado = u.usuario !== quem.usuario ? ' (marcado por ' + (u.nome || u.usuario) + ')' : '';
    if (d.tipo === 'prazo') {
      var z = tabZ.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!z) throw falha_('Prazo não encontrado.');
      if (!cumprirPrazo(z)) return { ok: true, repetido: true };
      intimacoesDoPrazo_(tabI, z).forEach(terminarIntim);
      if (/^ato:audiência (de conciliação|inicial|de mediação)/.test(z.observacoes || '')) {
        var tabPz = tabela_('Processos'), pz = tabPz.linhas.filter(function (x) { return x.id === z.processo_id; })[0];
        if (pz && pz.fase === 'conciliacao') atualizarLinha_(tabPz, pz, { fase: 'andamento', atualizado_em: agora, atualizado_por: u.usuario });
      }
      registrar_(quem.usuario, 'prazo cumprido', z.numero + ' · ' + String(z.descricao || '').slice(0, 80) + marcado);
      return { ok: true, por: quem.nome };
    }
    if (d.tipo === 'intimacao') {
      var i = tabI.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!i) throw falha_('Intimação não encontrada.');
      if (!terminarIntim(i)) return { ok: true, repetido: true, por: i.terminada_por };
      cumprirPrazo(tabZ.linhas.filter(function (x) { return x.id === i.prazo_id; })[0]);
      var tabTi = tabela_('Tarefas');
      tabTi.linhas.forEach(function (x) {
        if ((x.descricao || '').indexOf('[intim:' + i.id + ']') < 0 || x.concluida_em) return;
        atualizarLinha_(tabTi, x, { etapa: 'protocolado', concluida_em: agora, concluida_por: quem.usuario, ok_por: '', ok_em: '', historico: historicoMais_(x.historico, u, 'conferido: feito por ' + quem.nome), atualizado_em: agora, atualizado_por: u.usuario });
      });
      registrar_(quem.usuario, 'intimação terminada', i.numero + ' · ' + String(i.movimento || '').slice(0, 100) + marcado);
      return { ok: true, por: quem.nome };
    }
    if (d.tipo === 'tarefa') {
      var tabT0 = tabela_('Tarefas'), t0 = tabT0.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!t0) throw falha_('Tarefa não encontrada.');
      if (/\[inicial:([^\]]+)\]/.test(t0.descricao || '') && !t0.concluida_em) return conferirTrabalho_({ tipo: 'inicial', id: /\[inicial:([^\]]+)\]/.exec(t0.descricao)[1], por: quem.usuario }, u);
      if (t0.concluida_em) return { ok: true, repetido: true };
      var mi = /\[intim:([^\]]+)\]/.exec(t0.descricao || '');
      if (mi) { var iT = tabI.linhas.filter(function (x) { return x.id === mi[1]; })[0]; if (iT && !iT.terminada_por) return conferirTrabalho_({ tipo: 'intimacao', id: iT.id, por: quem.usuario }, u); }
      atualizarLinha_(tabT0, t0, { etapa: 'protocolado', concluida_em: agora, concluida_por: quem.usuario, ok_por: '', ok_em: '', historico: historicoMais_(t0.historico, u, 'conferido: feito por ' + quem.nome), atualizado_em: agora, atualizado_por: u.usuario });
      registrar_(quem.usuario, 'tarefa: Feito', String(t0.titulo || '').slice(0, 140) + marcado);
      repetirTarefa_(tabT0, t0, u);
      return { ok: true, por: quem.nome };
    }
    if (d.tipo === 'inicial') {
      var tabP = tabela_('Processos'), p = tabP.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!p) throw falha_('Processo não encontrado.');
      var numero = String(d.numero || '').trim();
      if (numero && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(numero)) throw falha_('Número do processo inválido (use o padrão 0000000-00.0000.0.00.0000) ou deixe em branco.');
      if (numero && tabP.linhas.some(function (x) { return x.id !== p.id && x.numero === numero; })) throw falha_('Esse número já está em outro processo.');
      var m = { atualizado_em: agora, atualizado_por: u.usuario, fase_auto: '' };
      if (numero) { m.numero = numero; m.tribunal = p.tribunal || tribunalDoNumero_(numero); m.fase = 'andamento'; }
      else m.fase = 'ajuizado';
      if (p.proximo_ato === 'Ajuizar a ação') m.proximo_ato = numero ? '' : 'Aguardando o número do processo';
      atualizarLinha_(tabP, p, m);
      var tabT = tabela_('Tarefas'), marca = '[inicial:' + p.id + ']', achou = false;
      tabT.linhas.forEach(function (x) {
        if ((x.descricao || '').indexOf(marca) < 0) return;
        achou = true;
        atualizarLinha_(tabT, x, { etapa: 'protocolado', concluida_em: x.concluida_em || agora, concluida_por: quem.usuario, numero: numero || x.numero,
          historico: historicoMais_(x.historico, u, 'conferido: petição inicial feita por ' + quem.nome), atualizado_em: agora, atualizado_por: u.usuario });
      });
      if (!achou) tarefaPeticaoInicial_(p, u);
      var cli = p.cliente_id ? (tabela_('Clientes').linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {}).nome : '';
      registrar_(quem.usuario, 'petição inicial feita', (cli || 'cliente') + (numero ? ' · ' + numero : '') + marcado);
      return { ok: true, por: quem.nome, fase: m.fase };
    }
    throw falha_('Tipo inválido.');
  });
}

/** O que a equipe já conferiu e espera o OK da administração. */
function aguardandoOk_() {
  var procs = {}, nomes = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  var cliDe = function (pid, numero) { var p = procs[pid] || {}; return nomes[p.cliente_id] || (p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || ''; };
  var desde = new Date(Date.now() - 90 * 86400000).toISOString(), itens = [], prazoAguarda = {};
  tabela_('Prazos').linhas.forEach(function (z) {
    if (z.situacao !== 'cumprido' || z.ok_em || z.etapa === 'concluido' || (z.cumprido_em || '') < desde) return;
    prazoAguarda[z.id] = 1;
    itens.push({ tipo: 'prazo', id: z.id, titulo: z.descricao || 'Prazo', numero: z.numero, cliente: cliDe(z.processo_id), por: z.cumprido_por, em: z.cumprido_em, fatal: z.fatal,
      no_prazo: !z.fatal || diaSP_(z.cumprido_em) <= z.fatal, link: '#/prazo/' + z.id });
  });
  tabela_('Intimacoes').linhas.forEach(function (i) {
    if (!i.terminada_por || i.ok_em || (i.terminada_em || '') < desde || prazoAguarda[i.prazo_id]) return;
    itens.push({ tipo: 'intimacao', id: i.id, titulo: i.movimento || 'Intimação', numero: i.numero, cliente: cliDe(i.processo_id), por: i.terminada_por, em: i.terminada_em, link: '#/prazos#intimacoes' });
  });
  var us = {}; usuarios_().forEach(function (x) { us[x.usuario] = x.nome || x.usuario; });
  tabela_('Tarefas').linhas.forEach(function (t) {
    var m = /\[inicial:([^\]]+)\]/.exec(t.descricao || '');
    if (!m && /\[intim:/.test(t.descricao || '')) return; // conta pela própria intimação
    if (!m && t.concluida_em && t.etapa === 'protocolado' && !t.ok_em && t.situacao !== 'cancelada' && (t.concluida_em || '') >= desde) {
      itens.push({ tipo: 'tarefa', id: t.id, titulo: t.titulo, numero: t.numero || '', cliente: nomes[t.cliente_id] || '', por: us[t.concluida_por] || t.concluida_por, em: t.concluida_em,
        fatal: t.vence_em, no_prazo: !t.vence_em || diaSP_(t.concluida_em) <= t.vence_em, link: '#/tarefas?quem=todos' });
      return;
    }
    if (!m || !t.concluida_em || t.etapa === 'concluido' || (t.concluida_em || '') < desde) return;
    var p = procs[m[1]] || {};
    itens.push({ tipo: 'inicial', id: m[1], tarefa_id: t.id, titulo: t.titulo, numero: p.numero || '', cliente: nomes[p.cliente_id] || '', por: us[t.concluida_por] || t.concluida_por, em: t.concluida_em, link: '#/processo/' + m[1] });
  });
  return itens.sort(function (a, b) { return a.em < b.em ? 1 : -1; });
}

/** OK final da administração. */
function darOk_(d, u) {
  var agora = new Date().toISOString(), nome = u.nome || u.usuario;
  return comTrava_(function () {
    var feitos = 0;
    (d.itens || [{ tipo: d.tipo, id: d.id }]).slice(0, 200).forEach(function (it) {
      if (it.tipo === 'prazo') {
        var tabZ = tabela_('Prazos'), z = tabZ.linhas.filter(function (x) { return x.id === it.id; })[0];
        if (!z || z.ok_em) return;
        atualizarLinha_(tabZ, z, { ok_por: nome, ok_em: agora, etapa: 'concluido', atualizado_em: agora, atualizado_por: u.usuario });
        var tabI = tabela_('Intimacoes');
        intimacoesDoPrazo_(tabI, z).forEach(function (i) { if (!i.ok_em) atualizarLinha_(tabI, i, { ok_por: nome, ok_em: agora }); });
        registrar_(u.usuario, 'ok do administrador', 'prazo ' + z.numero + ' · feito por ' + z.cumprido_por); feitos++;
      } else if (it.tipo === 'intimacao') {
        var tI = tabela_('Intimacoes'), x = tI.linhas.filter(function (r) { return r.id === it.id; })[0];
        if (!x || x.ok_em) return;
        atualizarLinha_(tI, x, { ok_por: nome, ok_em: agora });
        var tTi = tabela_('Tarefas');
        tTi.linhas.forEach(function (t) { if ((t.descricao || '').indexOf('[intim:' + x.id + ']') >= 0 && t.etapa !== 'concluido') atualizarLinha_(tTi, t, { etapa: 'concluido', ok_por: nome, ok_em: agora }); });
        registrar_(u.usuario, 'ok do administrador', 'intimação ' + x.numero + ' · feita por ' + x.terminada_por); feitos++;
      } else if (it.tipo === 'tarefa') {
        var tT0 = tabela_('Tarefas'), t1 = tT0.linhas.filter(function (r) { return r.id === it.id; })[0];
        if (!t1 || t1.ok_em) return;
        atualizarLinha_(tT0, t1, { etapa: 'concluido', ok_por: nome, ok_em: agora, historico: historicoMais_(t1.historico, u, 'OK da administração'), atualizado_em: agora, atualizado_por: u.usuario });
        registrar_(u.usuario, 'ok do administrador', 'tarefa · ' + t1.titulo); feitos++;
      } else if (it.tipo === 'inicial') {
        var tT = tabela_('Tarefas'), marca = '[inicial:' + it.id + ']';
        tT.linhas.forEach(function (t) {
          if ((t.descricao || '').indexOf(marca) < 0 || t.etapa === 'concluido') return;
          atualizarLinha_(tT, t, { etapa: 'concluido', historico: historicoMais_(t.historico, u, 'OK da administração'), atualizado_em: agora, atualizado_por: u.usuario });
          registrar_(u.usuario, 'ok do administrador', 'petição inicial · ' + t.titulo); feitos++;
        });
      }
    });
    return { feitos: feitos };
  });
}

/** A administração devolve: volta para a lista da equipe. */
function devolverTrabalho_(d, u) {
  var agora = new Date().toISOString();
  return comTrava_(function () {
    if (d.tipo === 'prazo') {
      var tabZ = tabela_('Prazos'), z = tabZ.linhas.filter(function (x) { return x.id === d.id; })[0];
      if (!z) throw falha_('Prazo não encontrado.');
      atualizarLinha_(tabZ, z, { situacao: z.fatal ? (z.conferido_por ? 'conferido' : 'calculado') : 'a definir', cumprido_por: '', cumprido_em: '', etapa: 'afazer', ok_por: '', ok_em: '', atualizado_em: agora, atualizado_por: u.usuario });
      var tabI = tabela_('Intimacoes');
      intimacoesDoPrazo_(tabI, z).forEach(function (i) { atualizarLinha_(tabI, i, { terminada_por: '', terminada_em: '', ok_por: '', ok_em: '' }); });
    } else if (d.tipo === 'intimacao') {
      var tI = tabela_('Intimacoes'), x = tI.linhas.filter(function (r) { return r.id === d.id; })[0];
      if (!x) throw falha_('Intimação não encontrada.');
      atualizarLinha_(tI, x, { terminada_por: '', terminada_em: '', ok_por: '', ok_em: '' });
      var tTd = tabela_('Tarefas');
      tTd.linhas.forEach(function (t) { if ((t.descricao || '').indexOf('[intim:' + x.id + ']') >= 0) atualizarLinha_(tTd, t, { etapa: 'fazendo', concluida_em: '', concluida_por: '', ok_por: '', ok_em: '', historico: historicoMais_(t.historico, u, 'devolvida pela administração') }); });
    } else if (d.tipo === 'tarefa') {
      var tT0 = tabela_('Tarefas'), t1 = tT0.linhas.filter(function (r) { return r.id === d.id; })[0];
      if (!t1) throw falha_('Tarefa não encontrada.');
      atualizarLinha_(tT0, t1, { etapa: 'fazendo', concluida_em: '', concluida_por: '', ok_por: '', ok_em: '', historico: historicoMais_(t1.historico, u, 'devolvida pela administração' + (d.motivo ? ': ' + String(d.motivo).slice(0, 120) : '')), atualizado_em: agora, atualizado_por: u.usuario });
    } else if (d.tipo === 'inicial') {
      var tT = tabela_('Tarefas'), marca = '[inicial:' + d.id + ']';
      tT.linhas.forEach(function (t) {
        if ((t.descricao || '').indexOf(marca) < 0) return;
        atualizarLinha_(tT, t, { etapa: 'fazendo', concluida_em: '', concluida_por: '', historico: historicoMais_(t.historico, u, 'devolvida pela administração' + (d.motivo ? ': ' + String(d.motivo).slice(0, 120) : '')), atualizado_em: agora, atualizado_por: u.usuario });
      });
    } else throw falha_('Tipo inválido.');
    registrar_(u.usuario, 'devolvido para a equipe', d.tipo + ' ' + d.id + (d.motivo ? ' · ' + String(d.motivo).slice(0, 120) : ''));
    return { ok: true };
  });
}

/** "Resumir com IA" direto na intimação (com ou sem prazo). Nunca muda prazo. */
function resumirIntimacaoIA_(d, u) {
  var tabI = tabela_('Intimacoes'), i = tabI.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!i) throw falha_('Intimação não encontrada.');
  if (i.prazo_id && tabela_('Prazos').linhas.some(function (z) { return z.id === i.prazo_id; })) {
    var r = resumirPrazoIA_({ id: i.prazo_id }, u);
    comTrava_(function () { atualizarLinha_(tabI, i, { resumo_ia: r.resumo_ia }); });
    return r;
  }
  var chave = chaveIA_();
  if (!chave) throw falha_('A IA não está ligada. A administração cadastra a chave em Usuários › Resumo das intimações por IA.');
  var p = tabela_('Processos').linhas.filter(function (x) { return x.id === i.processo_id || x.numero === i.numero; })[0] || { numero: i.numero };
  var z = { id: '', numero: i.numero, intimacao_id: i.id, ciencia: String(i.recebido_em || '').slice(0, 10), descricao: 'sem prazo lançado', processo_id: p.id || '' };
  var res = resumoPrazoIA_(z, tabI, p, chave);
  if (!res) throw falha_('Ainda não há texto do ato nem movimentações deste processo para a IA ler. Confira no sistema do tribunal.');
  comTrava_(function () { atualizarLinha_(tabI, i, { resumo_ia: res.texto }); });
  registrar_(u.usuario, 'resumo por IA', 'intimação ' + i.numero + ' (' + res.modo + ')');
  return { resumo_ia: res.texto, modo: res.modo };
}

/** Botão "Consertar agora" do cartão do robô: roda já o DataJud e o resumo da IA (e troca o modelo aposentado). */
function consertarRobo_() {
  var r = {};
  try { r.datajud = atualizarAndamentos_(70000, 40); } catch (e) { setConfig_('DATAJUD_ERRO', String(e.message || e), 'Último problema do DataJud'); }
  try {
    if (chaveIA_()) {
      var mod = modeloIA_();
      setConfig_('IA_MODELO', mod, 'Modelo do Gemini');
      r.ia = resumirIntimacoes_(60000, 10);
      if (!r.ia || !r.ia.feitas) { lerRespostaGemini_(chamarGemini_('Teste do painel: responda {"resumo":"ok"}', chaveIA_(), '')); setConfig_('IA_ERRO', '', 'Último problema do resumo por IA'); }
    }
  } catch (e2) { setConfig_('IA_ERRO', String(e2.message || e2), 'Último problema do resumo por IA'); }
  return estadoExtras_();
}

/* ---------- Quem fez o quê (relatório semanal) ---------- */

/** "Terminei": a pessoa marca que terminou a intimação; fica o nome e a hora (e vai para o relatório da semana). */
function terminarIntimacao_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Intimacoes');
    var i = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!i) throw falha_('Intimação não encontrada.');
    if (d.desfazer) {
      if (!i.terminada_por) return { ok: true };
      atualizarLinha_(tab, i, { terminada_por: '', terminada_em: '' });
      registrar_(u.usuario, 'intimação reaberta', i.numero);
      return { ok: true };
    }
    if (i.terminada_por) return { ok: true, terminada_por: i.terminada_por, terminada_em: i.terminada_em, repetido: true };
    var agora = new Date().toISOString(), nome = u.nome || u.usuario;
    atualizarLinha_(tab, i, { terminada_por: nome, terminada_em: agora });
    registrar_(u.usuario, 'intimação terminada', i.numero + ' · ' + String(i.movimento || '').slice(0, 120));
    return { ok: true, terminada_por: nome, terminada_em: agora };
  });
}

/** O painel abriu o WhatsApp para avisar o cliente: fica registrado para o relatório. */
function registrarWhatsapp_(d, u) {
  var o = String(d.motivo || 'aviso').slice(0, 40);
  registrar_(u.usuario, 'whatsapp ao cliente', [String(d.cliente || '').slice(0, 80), String(d.numero || '').slice(0, 30), o].filter(String).join(' · '));
  return { ok: true };
}

var CATEGORIAS_LOG = [
  ['intimacoes', 'Intimações conferidas', /^intimação terminada$/],
  ['prazos', 'Prazos conferidos (feitos)', /^prazo (cumprido)$|^prazo: (Protocolado|Conferido e concluído)/],
  ['conferidos', 'Datas de prazo confirmadas', /^prazo conferido$/],
  ['prazos_novos', 'Prazos lançados ou corrigidos', /^prazo (criado|alterado)$/],
  ['iniciais', 'Petições iniciais feitas', /^petição inicial feita$/],
  ['tarefas', 'Tarefas feitas', /^tarefa: /],
  ['oks', 'OK do administrador', /^ok do administrador$/],
  ['whatsapp', 'Clientes avisados no WhatsApp', /^whatsapp ao cliente$/],
  ['agenda', 'Audiências, perícias e compromissos na agenda', /^(ato na agenda|compromisso criado)$/],
  ['clientes', 'Clientes cadastrados ou atualizados', /^(cliente criado|cliente alterado|observação no cliente)$/],
  ['processos', 'Processos cadastrados, atualizados ou que mudaram de etapa', /^(processo criado|processo alterado|processo etapa)$/],
  ['documentos', 'Documentos gerados', /^documentos gerados$/],
  ['financeiro', 'Financeiro (parcelas, honorários, despesas)', /^(parcela paga|parcela criada|parcela alterada|honorário criado|honorário alterado|despesa lançada|despesa alterada|alvará lançado|cobrança: )/]
];

/** Relatório da semana (segunda a domingo): o que cada usuário fez, pelo registro do painel. */
function relatorioSemana_(d) {
  var hoje = hojeSP_();
  var ref = /^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '') ? d.inicio : hoje;
  var mes = d.periodo === 'mes';
  var dow = new Date(ref + 'T12:00:00Z').getUTCDay();
  var ini = mes ? ref.slice(0, 8) + '01' : somarDias_(ref, -((dow + 6) % 7));
  var fim = mes ? somarDias_(somarDias_(ini, 32).slice(0, 8) + '01', -1) : somarDias_(ini, 6);
  var usuarios = {};
  usuarios_().forEach(function (x) { usuarios[x.usuario] = x; });
  var pessoas = {};
  var sh = aba_('Log'), ult = sh.getLastRow();
  var n = Math.min(Math.max(ult - 1, 0), 30000);
  var vals = n ? sh.getRange(ult - n + 1, 1, n, 4).getDisplayValues() : [];
  vals.forEach(function (v) {
    var dia = diaSP_(v[0]);
    if (!dia || dia < ini || dia > fim) return;
    var quem = v[1], acao = v[2];
    if (!usuarios[quem]) return; // robô, sistema, site
    var cat = null;
    CATEGORIAS_LOG.some(function (c) { if (c[2].test(acao)) { cat = c; return true; } return false; });
    if (!cat) return;
    var pss = pessoas[quem] = pessoas[quem] || { usuario: quem, nome: usuarios[quem].nome || quem, perfil: usuarios[quem].perfil, total: 0, grupos: {}, itens: [] };
    pss.total++;
    pss.grupos[cat[0]] = (pss.grupos[cat[0]] || 0) + 1;
    var det = String(v[3] || '').replace(/\b[A-Z][0-9a-f]{10}\b\s*/g, '').trim();
    if (pss.itens.length < 300) pss.itens.push({ quando: v[0], cat: cat[0], acao: acao, texto: det.slice(0, 160) });
  });
  // quem não fez nada também aparece (ativos)
  Object.keys(usuarios).forEach(function (k) {
    var x = usuarios[k];
    if (x.ativo === 'sim' && !pessoas[k]) pessoas[k] = { usuario: k, nome: x.nome || k, perfil: x.perfil, total: 0, grupos: {}, itens: [] };
  });
  var lista = Object.keys(pessoas).map(function (k) { var x = pessoas[k]; x.itens.sort(function (a, b) { return a.quando < b.quando ? 1 : -1; }); return x; })
    .sort(function (a, b) { return b.total - a.total || (a.nome < b.nome ? -1 : 1); });
  var ant = mes ? somarDias_(ini, -1).slice(0, 8) + '01' : somarDias_(ini, -7), prox = mes ? somarDias_(fim, 1) : somarDias_(ini, 7);
  var aguardando = 0;
  try { aguardando = aguardandoOk_().length; } catch (e) { /* segue */ }
  return { inicio: ini, fim: fim, hoje: hoje, periodo: mes ? 'mes' : 'semana', anterior: ant, proxima: prox <= hoje ? prox : '', aguardando: aguardando,
    categorias: CATEGORIAS_LOG.map(function (c) { return { id: c[0], nome: c[1] }; }), pessoas: lista };
}

/* ---------- Resumo do dia por e-mail (7h) ---------- */

function esc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Monta o e-mail do dia para uma pessoa: prazos de hoje e amanhã, vencidos, audiências e perícias, tarefas dela e (admin) cobranças. */
function montarResumoDia_(u, base) {
  var hoje = base.hoje, amanha = base.amanha;
  var lin = function (z) { return '<li><b>' + esc_(dataBR_(z.fatal)) + '</b> · ' + esc_(z.descricao) + ' · ' + esc_(z.cliente || 'cliente a identificar') + ' · ' + esc_(z.numero) +
    (z.responsavel ? ' · <i>' + esc_(base.nomes[z.responsavel] || z.responsavel) + '</i>' : '') + '</li>'; };
  var bloco = function (titulo, itens, cor) { return itens.length ? '<h3 style="margin:18px 0 6px;font-size:15px;color:' + (cor || '#1f2a44') + '">' + titulo + '</h3><ul style="margin:0;padding-left:18px">' + itens.join('') + '</ul>' : ''; };
  var minhas = base.tarefas.filter(function (x) { return x.responsavel === u.usuario && !/protocolado|concluido/.test(x.etapa) && x.vence_em && x.vence_em <= amanha; });
  var alertasHtml = (base.alertas || []).length && PERFIS[u.perfil] && (PERFIS[u.perfil].conferePrazos || PERFIS[u.perfil].usuarios)
    ? '<div style="background:#fbe9e7;border-left:4px solid #b42318;padding:10px 12px;margin:10px 0"><b>Atenção com o robô:</b><ul style="margin:6px 0 0;padding-left:18px">' + base.alertas.map(function (a) { return '<li>' + esc_(a) + '</li>'; }).join('') + '</ul></div>' : '';
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">' + alertasHtml +
    '<h2 style="margin:0 0 4px;font-size:18px">Bom dia, ' + esc_(String(u.nome || u.usuario).split(' ')[0]) + '!</h2>' +
    '<p style="margin:0 0 10px;color:#555">Resumo do painel para ' + esc_(dataBR_(hoje)) + '.</p>' +
    bloco('Prazos vencidos sem baixa (' + base.vencidos.length + ')', base.vencidos.slice(0, 15).map(lin), '#b42318') +
    bloco('Prazos que vencem HOJE (' + base.fHoje.length + ')', base.fHoje.map(lin), '#b42318') +
    bloco('Prazos que vencem amanhã (' + base.fAmanha.length + ')', base.fAmanha.map(lin), '#b54708') +
    bloco('Audiências, perícias e compromissos de hoje', base.atos.map(function (a) { return '<li><b>' + esc_(a.hora || '') + '</b> ' + esc_(a.titulo) + (a.extra ? ' · ' + esc_(a.extra) : '') + '</li>'; })) +
    bloco('Suas tarefas para hoje e amanhã (' + minhas.length + ')', minhas.map(function (x) { return '<li><b>' + esc_(dataBR_(x.vence_em)) + '</b> · ' + esc_(x.titulo) + (x.cliente ? ' · ' + esc_(x.cliente) : '') + (x.atrasada ? ' <b style="color:#b42318">(atrasada)</b>' : '') + '</li>'; }));
  if (PERFIS[u.perfil] && PERFIS[u.perfil].financeiro && !PERFIS[u.perfil].ocultarValores && base.fin) {
    html += bloco('Financeiro', ['<li>Parcelas vencendo hoje: <b>' + base.fin.hoje + '</b></li>', '<li>Em atraso: <b>R$ ' + esc_(txtDinheiro_(base.fin.atrasado).replace('.', ',')) + '</b> (' + base.fin.qtd + ' parcela(s))</li>',
      base.fin.contas ? '<li>Contas do escritório vencendo hoje ou atrasadas: <b>' + base.fin.contas + '</b></li>' : '']);
  }
  var vazio = !base.vencidos.length && !base.fHoje.length && !base.fAmanha.length && !base.atos.length && !minhas.length;
  if (vazio) html += '<p>Nada urgente para hoje. 🎉</p>';
  html += '<p style="margin-top:20px"><a href="https://araujoadvocaciasc.com.br/painel/" style="background:#1f2a44;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Abrir o painel</a></p>' +
    '<p style="color:#888;font-size:12px">E-mail automático do painel da Araújo Advocacia (dias úteis, por volta das 7h). Para parar de receber, peça à administração (Usuários › Editar).</p></div>';
  var assunto = 'Painel · ' + dataBR_(hoje) + ': ' + (base.fHoje.length ? base.fHoje.length + ' prazo(s) hoje' : 'nenhum prazo hoje') +
    (base.vencidos.length ? ', ' + base.vencidos.length + ' vencido(s)' : '') + (base.atos.length ? ', ' + base.atos.length + ' compromisso(s)' : '');
  return { assunto: assunto, html: html };
}

function baseResumoDia_() {
  var hoje = hojeSP_(), amanha = somarDias_(hoje, 1);
  var dsem = new Date(hoje + 'T12:00:00Z').getUTCDay();
  if (dsem === 5) amanha = somarDias_(hoje, 3); // sexta: "amanhã" = até segunda
  var prazos = listarPrazos_({});
  var base = { hoje: hoje, amanha: amanha, nomes: nomesUsuarios_(),
    vencidos: prazos.filter(function (z) { return z.fatal && z.fatal < hoje; }),
    fHoje: prazos.filter(function (z) { return z.fatal === hoje; }),
    fAmanha: prazos.filter(function (z) { return z.fatal > hoje && z.fatal <= amanha; }), atos: [], tarefas: [] };
  try { base.alertas = vigiaRobo_(false); } catch (e) { base.alertas = []; }
  try {
    var ag = listarAgenda_({ inicio: hoje, fim: hoje });
    base.atos = ag.eventos.sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; })
      .map(function (e) { return { hora: e.diaTodo ? 'dia todo' : e.inicio.slice(11, 16), titulo: e.titulo, extra: NOMES_CURTOS_AGENDA_[e.agenda] || e.agenda }; });
  } catch (e) { /* sem agenda */ }
  var vistos = {};
  base.atos.forEach(function (a) { vistos[normalizar_(a.titulo)] = 1; });
  tabela_('Processos').linhas.forEach(function (p) {
    if (p.proximo_ato_data !== hoje || p.status === 'arquivado') return;
    var t = (p.proximo_ato || 'Ato') + ' · ' + p.numero;
    if (!Object.keys(vistos).some(function (k) { return k.indexOf(p.numero) >= 0; })) base.atos.push({ hora: '', titulo: t, extra: 'processo' });
  });
  try { base.tarefas = listarTarefas_({ dias: 1 }, { usuario: '' }).itens; } catch (e) { /* sem tarefas */ }
  try {
    var hojeP = 0, atr = 0, q = 0;
    tabela_('Parcelas').linhas.forEach(function (p) {
      if (p.pago_em) return;
      if (p.vencimento === hoje) hojeP++;
      else if (p.vencimento && p.vencimento < hoje) { atr += dinheiro_(p.valor) - dinheiro_(p.valor_pago); q++; }
    });
    var contas = tabela_('Despesas').linhas.filter(function (x) { return x.situacao !== 'cancelada' && !x.pago_em && x.vencimento && x.vencimento <= hoje; }).length;
    base.fin = { hoje: hojeP, atrasado: atr, qtd: q, contas: contas };
  } catch (e) { /* sem financeiro */ }
  return base;
}
var NOMES_CURTOS_AGENDA_ = { 'ATENDIMENTOS': 'Atendimento', 'AUDIÊNCIA CONCILIAÇÃO': 'Audiência de conciliação', 'AUDIÊNCIA INSTRUÇÃO': 'Audiência de instrução', 'PERÍCIAS': 'Perícia' };

function enviarResumo_(u, base) {
  if (!u.email) return false;
  var m = montarResumoDia_(u, base);
  GmailApp.sendEmail(u.email, m.assunto, 'Abra este e-mail num programa que mostre HTML, ou entre no painel: https://araujoadvocaciasc.com.br/painel/',
    { htmlBody: m.html, name: 'Painel Araújo Advocacia' });
  return true;
}

/** Gatilho diário (7h): manda o resumo para quem tem e-mail cadastrado. Só em dias úteis. */
function resumoDiarioGatilho() {
  var hoje = hojeSP_();
  var dsem = new Date(hoje + 'T12:00:00Z').getUTCDay();
  if (dsem === 0 || dsem === 6) return 'fim de semana';
  if (config_('RESUMO_EMAIL_DIA') === hoje) return 'já enviado hoje';
  var base = baseResumoDia_(), n = 0, erros = [];
  usuarios_().forEach(function (u) {
    if (u.ativo !== 'sim' || !u.email || u.resumo_email === 'nao') return;
    try { if (enviarResumo_(u, base)) n++; } catch (e) { erros.push(u.usuario + ': ' + (e.message || e)); }
  });
  setConfig_('RESUMO_EMAIL_DIA', hoje, 'Último dia em que o resumo das 7h foi enviado');
  registrar_('sistema', 'resumo do dia por e-mail', n + ' enviado(s)' + (erros.length ? '; erros: ' + erros.join(' | ') : ''));
  return n + ' enviado(s)';
}

function testarResumoEmail_(d, u) {
  var linha = tabela_('Usuarios').linhas.filter(function (r) { return r.id === u.id; })[0];
  if (!linha || !linha.email) throw falha_('Cadastre o seu e-mail em Usuários (Editar) antes de testar.');
  enviarResumo_(linha, baseResumoDia_());
  registrar_(u.usuario, 'resumo por e-mail (teste)', linha.email);
  return { enviado: linha.email };
}

/* ---------- Resumo das intimações por IA (Gemini, do Google) ---------- */

var IA_MODELO_PADRAO = 'gemini-3.5-flash-lite';
/** Modelo em uso. Modelos antigos (1.x/2.x) que o Google desativou viram o padrão novo sozinhos. */
function modeloIA_() {
  var m = config_('IA_MODELO');
  if (!m || /^gemini-(1|2)(\.|-)/.test(m)) return IA_MODELO_PADRAO;
  return m;
}
/** Se o Google disser que o modelo foi aposentado ("use models/X"), guarda o novo e devolve o nome dele. */
function modeloSugerido_(resp) {
  if (!resp || (resp.getResponseCode() !== 404 && resp.getResponseCode() !== 400)) return '';
  var t = String(resp.getContentText() || '');
  if (!/no longer available|not found|is not supported|deprecated/i.test(t)) return '';
  var m = t.match(/models\/(gemini-[a-z0-9.\-]+)/gi) || [];
  var novo = m.map(function (x) { return x.replace(/^models\//i, ''); }).filter(function (x) { return x !== modeloIA_(); }).pop();
  if (!novo || !/^gemini-[a-z0-9.\-]{3,50}$/.test(novo)) novo = IA_MODELO_PADRAO !== modeloIA_() ? IA_MODELO_PADRAO : '';
  if (novo) { setConfig_('IA_MODELO', novo, 'Modelo do Gemini (trocado sozinho: o Google aposentou o anterior)'); registrar_('sistema', 'IA: modelo trocado', novo); }
  return novo;
}
/** Chama o Gemini; se o modelo tiver sido aposentado, troca pelo indicado e tenta de novo uma vez. */
function chamarGemini_(texto, chave, contexto) {
  var ped = pedidoGemini_(texto, chave, modeloIA_(), contexto);
  var resp = UrlFetchApp.fetch(ped.url, ped);
  var novo = modeloSugerido_(resp);
  if (novo) { ped = pedidoGemini_(texto, chave, novo, contexto); resp = UrlFetchApp.fetch(ped.url, ped); }
  return resp;
}

/** Tira CPF, CNPJ, RG, telefones, e-mails, CEP e contas bancárias antes de mandar o texto para a IA. */
function anonimizar_(t, nomes) {
  t = String(t || '');
  // nomes das partes (cliente, parte contrária, nomes do aviso) viram [PARTE]; o número do processo vira [PROCESSO]
  (nomes || []).map(function (n) { return String(n || '').replace(/\s+/g, ' ').trim(); })
    .filter(function (n) { return n.length >= 5 && /\s/.test(n); })
    .sort(function (a, b) { return b.length - a.length; })
    .forEach(function (n) {
      var ac = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' };
      var re = normalizar_(n).split(' ').map(function (p) {
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[aeiouc]/g, function (l) { return ac[l]; });
      }).join('\\s+');
      t = t.replace(new RegExp(re, 'gi'), '[PARTE]');
    });
  return t
    .replace(/\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g, '[PROCESSO]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\bRG\s*(n[º°o.]*\s*)?[\dXx.\-\/]{5,}/gi, 'RG [RG]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[E-MAIL]')
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP]')
    .replace(/\b(ag[êe]ncia|conta|c\/c|pix)\s*(n[º°o.]*)?\s*[:\-]?\s*[\d.\-\/xX]{4,}/gi, '$1 [DADO BANCÁRIO]');
}

/** O que o painel calculou, para a IA comparar com o texto. */
function contextoPrazoIA_(z) {
  if (!z || !z.fatal) return '';
  return 'Para conferência: o sistema do escritório calculou para este ato o prazo de ' + (z.dias || '?') + ' dias ' + (z.contagem === 'corridos' ? 'corridos' : 'úteis') +
    ', com ciência em ' + dataBR_(z.ciencia) + ' e data fatal ' + dataBR_(z.fatal) + '. Responda com base no TEXTO; não repita estes números se o texto não os confirmar.';
}

/** Resumo por IA de um prazo, na hora (botão "Resumir com IA" na tela do prazo). Não muda o prazo. */
/**
 * De onde a IA tira o conteúdo do prazo, nesta ordem:
 *  1) o texto da própria intimação;
 *  2) outra comunicação do mesmo processo com texto (ex.: a publicação do DJEN) em até 20 dias da ciência;
 *  3) sem texto (PJe "documento sigiloso"): o nome do ato no aviso + as últimas movimentações do DataJud (busca na hora se faltar).
 */
function fontePrazoIA_(z, tabI, p) {
  var temTexto = function (i) { var t = String(i && i.texto || '').replace(/\s+/g, ' '); return t.length >= 120 && !/^\W*(documento sigiloso|conteúdo sigiloso)/i.test(t); };
  var propria = tabI.linhas.filter(function (i) { return i.id === z.intimacao_id; })[0];
  if (temTexto(propria)) return { modo: 'texto', intim: propria, texto: [propria.movimento, propria.texto].join('\n') };
  var ref = z.ciencia || hojeSP_();
  var outra = tabI.linhas.filter(function (i) { return i.numero === z.numero && temTexto(i) && Math.abs(diffDias_(String(i.recebido_em).slice(0, 10), ref)) <= 20; })
    .sort(function (a, b) { return Math.abs(diffDias_(String(a.recebido_em).slice(0, 10), ref)) - Math.abs(diffDias_(String(b.recebido_em).slice(0, 10), ref)); })[0];
  if (outra) return { modo: 'texto', intim: outra, texto: [outra.movimento, outra.texto].join('\n'), origem: 'publicação do mesmo processo em ' + dataBR_(String(outra.recebido_em).slice(0, 10)) };
  // sem texto: monta o quadro com o aviso e os andamentos
  var andam = [];
  try { andam = p && p.andamentos && p.andamentos !== '-' ? JSON.parse(p.andamentos) : []; } catch (e) { andam = []; }
  if (!andam.length && p && aliasDatajud_(p.numero)) {
    try {
      var ped = pedidoDatajud_(p.numero, chaveDatajud_(false));
      var resp = UrlFetchApp.fetch(ped.url, ped);
      if (resp.getResponseCode() === 200) { var lido = lerDatajud_(resp.getContentText()); if (lido) { andam = lido.movs.slice(0, 15); comTrava_(function () { guardarAndamentos_(tabela_('Processos'), p, lido); }); } }
    } catch (e) { /* segue com o que tem */ }
  }
  var aviso = propria ? String(propria.movimento || '').trim() : '';
  if (!andam.length && !aviso) return null;
  var linhas = ['AVISO DO TRIBUNAL (o conteúdo do ato não veio): ' + (aviso || '—'),
    'Prazo lançado pelo robô: ' + String(z.descricao || '').slice(0, 120),
    'Processo: ' + [p && p.classe, p && p.area, p && p.orgao, p && p.tribunal].filter(Boolean).join(' · '),
    'ÚLTIMAS MOVIMENTAÇÕES (mais nova primeiro):'].concat(andam.slice(0, 12).map(function (m) { return dataBR_(String(m.d).slice(0, 10)) + ' — ' + m.n; }));
  return { modo: 'movimentos', intim: propria || null, texto: linhas.join('\n') };
}

/** O que a IA deve fazer quando não há o texto do ato. */
var INSTRUCAO_SEM_TEXTO = 'ATENÇÃO: o tribunal NÃO enviou o texto do ato (ex.: PJe "documento sigiloso"). Com base no aviso e nas movimentações, ' +
  'diga qual é o ato MAIS PROVÁVEL que gerou a intimação e a providência provável, deixando claro no resumo que é uma estimativa a confirmar no sistema. ' +
  'Use "prazo_dias": null, a não ser que as movimentações citem o prazo expressamente.';

/** Resumo por IA de um prazo, na hora (botão "Resumir com IA" na tela do prazo). Não muda o prazo. */
function resumirPrazoIA_(d, u) {
  var chave = chaveIA_();
  if (!chave) throw falha_('A IA não está ligada. A administração cadastra a chave em Usuários › Resumo das intimações por IA.');
  var tabZ = tabela_('Prazos'), z = tabZ.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!z) throw falha_('Prazo não encontrado.');
  var tabI = tabela_('Intimacoes');
  var p = tabela_('Processos').linhas.filter(function (x) { return x.id === z.processo_id; })[0] || { numero: z.numero };
  var res = resumoPrazoIA_(z, tabI, p, chave);
  if (!res) throw falha_('Ainda não há texto do ato nem movimentações deste processo para a IA ler. Abra o processo e clique em "Buscar andamentos agora", ou confira direto no sistema do tribunal.');
  comTrava_(function () { atualizarLinha_(tabZ, z, { resumo_ia: res.texto }); if (res.intim) atualizarLinha_(tabI, res.intim, { resumo_ia: res.texto }); });
  registrar_(u.usuario, 'resumo por IA', z.id + ' (' + res.modo + ')');
  return { resumo_ia: res.texto, modo: res.modo };
}

function resumoPrazoIA_(z, tabI, p, chave) {
  var f = fontePrazoIA_(z, tabI, p);
  if (!f) return null;
  var cli = tabela_('Clientes').linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {};
  var nomes = [cli.nome, p.cliente_nome, p.parte_contraria].concat(String(f.intim && f.intim.partes_cliente || '').split(/;\s*/));
  var contexto = (f.modo === 'movimentos' ? INSTRUCAO_SEM_TEXTO + '\n' : '') + contextoPrazoIA_(z);
  var txt = lerRespostaGemini_(chamarGemini_(anonimizar_(f.texto, nomes), chave, contexto), f.modo === 'texto' ? z : null);
  if (f.modo === 'movimentos') txt = txt.replace(/^IA: /, 'IA (sem o texto do ato; estimativa pelas movimentações — confirmar no sistema): ');
  else if (f.origem) txt = txt.replace(/^IA: /, 'IA (pela ' + f.origem + '): ');
  return { texto: txt.slice(0, 900), modo: f.modo, intim: f.intim };
}

/** Robô: prazos PROVISÓRIOS (aviso sem o ato) ganham a estimativa da IA pelas movimentações. Nunca muda o prazo. */
function resumirProvisoriosIA_(limiteMs, max) {
  var chave = chaveIA_();
  if (!chave || config_('IA_LIGADA') === 'nao') return { feitas: 0 };
  var t0 = Date.now(), tabZ = tabela_('Prazos'), tabI = tabela_('Intimacoes'), procs = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  var fila = tabZ.linhas.filter(function (z) { return SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && !z.resumo_ia && /PROVIS/i.test(z.descricao || ''); }).slice(0, max || 10);
  var feitas = 0;
  fila.forEach(function (z) {
    if (Date.now() - t0 > (limiteMs || 60000)) return;
    try {
      var res = resumoPrazoIA_(z, tabI, procs[z.processo_id] || { numero: z.numero }, chave);
      if (res) { comTrava_(function () { atualizarLinha_(tabZ, z, { resumo_ia: res.texto }); }); feitas++; }
    } catch (e) { setConfig_('IA_ERRO', String(e.message || e), 'Último problema do resumo por IA'); }
  });
  return { feitas: feitas };
}

function chaveIA_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_CHAVE') || ''; }

function pedidoGemini_(texto, chave, modelo, contexto) {
  var prompt = 'Você ajuda um escritório de advocacia brasileiro a nunca perder prazo. Leia a intimação/publicação abaixo e responda SOMENTE em JSON com as chaves: ' +
    '"resumo" (até 2 frases, em português simples: o que o juiz/tribunal decidiu ou determinou), "ato" (uma palavra: sentença, acórdão, decisão, despacho, ' +
    'audiência, perícia, citação, intimação, edital ou outro), "providencia" (a peça ou providência que o advogado provavelmente precisa fazer, curto), ' +
    '"prazo_dias" (número de dias do prazo SE estiver escrito no texto; senão null), "fundamento" (artigo de lei do prazo, se o texto citar; senão null) e ' +
    '"data_ato" (data de audiência/perícia no formato AAAA-MM-DD, se houver; senão null). Não invente nada que não esteja no texto.' +
    (contexto ? '\n\n' + contexto : '') + '\n\nTEXTO:\n' + texto.slice(0, 6000);
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelo) + ':generateContent',
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': chave },
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: 'application/json' } })
  };
}

function lerRespostaGemini_(resp, z) {
  var code = resp.getResponseCode();
  var j = {};
  try { j = JSON.parse(resp.getContentText()); } catch (e) { /* resposta estranha */ }
  if (code !== 200) throw new Error('Gemini respondeu ' + code + (j.error && j.error.message ? ': ' + String(j.error.message).slice(0, 160) : ''));
  var txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  txt = txt && txt[0] && txt[0].text || '';
  var o;
  try { o = JSON.parse(String(txt).replace(/^```(json)?|```$/g, '').trim()); } catch (e) { o = { resumo: String(txt).slice(0, 300) }; }
  var partes = [String(o.resumo || '').trim()];
  if (o.providencia) partes.push('Providência: ' + String(o.providencia).trim());
  var dt = parseInt(o.prazo_dias, 10);
  if (dt) partes.push('Prazo citado no texto: ' + dt + ' dias' + (o.fundamento ? ' (' + String(o.fundamento).slice(0, 60) + ')' : ''));
  // Conferência cruzada: o texto fala em prazo diferente do calculado pelo painel? Avisa (a IA nunca muda o prazo).
  if (z && dt && +z.dias && dt !== +z.dias && !/^ato:/.test(z.observacoes || '')) partes.push('⚠ ATENÇÃO: o texto fala em ' + dt + ' dias e o painel calculou ' + z.dias + ' — conferir no sistema');
  if (z && o.data_ato && /^\d{4}-\d{2}-\d{2}$/.test(o.data_ato) && /^ato:/.test(z.observacoes || '') && z.fatal && o.data_ato !== z.fatal) partes.push('⚠ ATENÇÃO: o texto indica a data ' + dataBR_(o.data_ato) + ' e o painel tem ' + dataBR_(z.fatal) + ' — conferir');
  return ('IA: ' + partes.filter(String).join(' · ')).slice(0, 900);
}

/** Resume as intimações novas que têm texto (DJEN e avisos com conteúdo). Nunca muda prazos: só escreve o resumo. */
function resumirIntimacoes_(limiteMs, max) {
  var chave = chaveIA_();
  if (!chave || config_('IA_LIGADA') === 'nao') return { feitas: 0, motivo: 'desligada' };
  var modelo = modeloIA_(), t0 = Date.now();
  var tabI = tabela_('Intimacoes'), tabZ = tabela_('Prazos');
  var desde = new Date(Date.now() - 60 * 86400000).toISOString();
  var fila = tabI.linhas.filter(function (i) {
    if (i.resumo_ia || (i.recebido_em || '') < desde) return false;
    var t = String(i.texto || '').replace(/\s+/g, ' ');
    return t.length >= 120 && !/^\W*(documento sigiloso|conteúdo sigiloso)/i.test(t);
  }).sort(function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; }).slice(0, max || 30);
  if (!fila.length) {
    // nada novo para resumir: se ficou um problema antigo guardado, testa a IA agora e apaga o aviso quando ela responde
    if (config_('IA_ERRO')) {
      try { lerRespostaGemini_(chamarGemini_('Teste do painel: responda {"resumo":"ok"}', chave, '')); setConfig_('IA_ERRO', '', 'Último problema do resumo por IA'); setConfig_('IA_ULTIMA', new Date().toISOString() + ' · em dia (nada novo para resumir)', 'Última rodada do resumo por IA'); }
      catch (eT) { setConfig_('IA_ERRO', String(eT.message || eT), 'Último problema do resumo por IA'); }
    } else setConfig_('IA_ULTIMA', new Date().toISOString() + ' · em dia (nada novo para resumir)', 'Última rodada do resumo por IA');
    return { feitas: 0 };
  }
  var prazos = {}, procs = {}, nomesCli = {};
  tabZ.linhas.forEach(function (z) { prazos[z.id] = z; });
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { nomesCli[c.id] = c.nome; });
  var nomesDa = function (x) {
    var p = procs[x.processo_id] || {};
    return String(x.partes_cliente || '').split(/;\s*/).concat([nomesCli[p.cliente_id], p.cliente_nome, p.parte_contraria]);
  };
  tabI.adiar = true; tabZ.adiar = true;
  var feitas = 0, erro = '';
  for (var i = 0; i < fila.length && Date.now() - t0 < (limiteMs || 60000); i += 5) {
    var lote = fila.slice(i, i + 5);
    var montar = function () { return lote.map(function (x) { return pedidoGemini_(anonimizar_([x.movimento, x.texto].join('\n'), nomesDa(x)), chave, modelo, contextoPrazoIA_(prazos[x.prazo_id])); }); };
    var resps = UrlFetchApp.fetchAll(montar());
    var trocado = modeloSugerido_(resps[0]);
    if (trocado) { modelo = trocado; resps = UrlFetchApp.fetchAll(montar()); }
    if (resps.some(function (x) { return x.getResponseCode() === 429; })) { Utilities.sleep(5000); resps = UrlFetchApp.fetchAll(montar()); }
    for (var k = 0; k < lote.length; k++) {
      try {
        var res = lerRespostaGemini_(resps[k], prazos[lote[k].prazo_id]);
        atualizarLinha_(tabI, lote[k], { resumo_ia: res });
        var z = prazos[lote[k].prazo_id];
        if (z && !z.resumo_ia) atualizarLinha_(tabZ, z, { resumo_ia: res });
        feitas++;
      } catch (e) { erro = String(e.message || e); }
    }
    if (erro && !feitas) break; // chave errada ou sem saldo: não insiste
  }
  regravarMudadas_(tabI); regravarMudadas_(tabZ);
  setConfig_('IA_ULTIMA', new Date().toISOString() + ' · ' + feitas + ' resumo(s)', 'Última rodada do resumo por IA');
  setConfig_('IA_ERRO', erro, 'Último problema do resumo por IA');
  return { feitas: feitas, erro: erro };
}

/** Configuração da IA (só administração). A chave vai para as Propriedades do script, nunca para a planilha. */
function configIA_(d, u) {
  var props = PropertiesService.getScriptProperties();
  if (d.chave !== undefined) {
    var k = String(d.chave || '').replace(/[\s"'`<>]/g, '');
    if (k && (k.length < 20 || k.length > 300 || /\.\.\./.test(k))) throw falha_('A chave parece incompleta. No Google AI Studio, clique no ícone de copiar (dois quadradinhos) na linha da chave e cole aqui.');
    if (k) props.setProperty('GEMINI_CHAVE', k); else props.deleteProperty('GEMINI_CHAVE');
    registrar_(u.usuario, 'chave da IA', k ? 'cadastrada' : 'apagada');
  }
  if (d.modelo !== undefined) setConfig_('IA_MODELO', /^gemini-[a-z0-9.\-]{3,60}$/.test(d.modelo) && !/^gemini-(1|2)(\.|-)/.test(d.modelo) ? d.modelo : IA_MODELO_PADRAO, 'Modelo do Gemini usado nos resumos');
  if (d.ligada !== undefined) setConfig_('IA_LIGADA', d.ligada ? 'sim' : 'nao', 'Resumo das intimações por IA ligado?');
  var r = { temChave: !!chaveIA_(), modelo: modeloIA_(), ligada: config_('IA_LIGADA') !== 'nao',
    ultima: config_('IA_ULTIMA'), erro: config_('IA_ERRO') };
  if (d.testar) {
    if (!r.temChave) throw falha_('Cadastre a chave primeiro.');
    try { r.teste = lerRespostaGemini_(chamarGemini_('Intimação: fica a parte autora intimada para, no prazo de 15 (quinze) dias, apresentar réplica à contestação.', chaveIA_(), '')); r.modelo = modeloIA_(); }
    catch (e) { throw falha_('O teste falhou: ' + (e.message || e)); }
  }
  if (d.rodar) r.rodada = resumirIntimacoes_(120000, 40);
  return r;
}

/* ---------- Andamentos completos pelo DataJud (API pública do CNJ) ---------- */

// Chave pública que o CNJ divulga em https://datajud-wiki.cnj.jus.br/api-publica/acesso (pode mudar; o robô busca a nova sozinho).
var DATAJUD_CHAVE_PADRAO = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
var ESTADUAIS_DATAJUD = ['', 'tjac', 'tjal', 'tjap', 'tjam', 'tjba', 'tjce', 'tjdft', 'tjes', 'tjgo', 'tjma', 'tjmt', 'tjms', 'tjmg', 'tjpa', 'tjpb', 'tjpr',
  'tjpe', 'tjpi', 'tjrj', 'tjrn', 'tjrs', 'tjro', 'tjrr', 'tjsc', 'tjse', 'tjsp', 'tjto'];
var UFS_TRE = ['', 'ac', 'al', 'ap', 'am', 'ba', 'ce', 'dft', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to'];

/** Índice do DataJud pelo número CNJ (J = segmento da Justiça, TR = tribunal). */
function aliasDatajud_(numero) {
  var m = String(numero || '').match(/^\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}$/);
  if (!m) return '';
  var j = m[1], tr = +m[2];
  if (j === '8') return ESTADUAIS_DATAJUD[tr] || '';
  if (j === '5') return tr === 0 ? 'tst' : 'trt' + tr;
  if (j === '4') return tr >= 1 && tr <= 6 ? 'trf' + tr : '';
  if (j === '3') return 'stj';
  if (j === '6') return UFS_TRE[tr] ? 'tre-' + UFS_TRE[tr] : (tr === 0 ? 'tse' : '');
  if (j === '7') return 'stm';
  return '';
}

function chaveDatajud_(renovar, falhou) {
  var manual = config_('DATAJUD_CHAVE');
  if (manual && !renovar) return manual;
  var props = PropertiesService.getScriptProperties();
  var auto = props.getProperty('DATAJUD_CHAVE_AUTO');
  if (auto && !renovar) return auto;
  var wiki = '';
  try {
    var html = UrlFetchApp.fetch('https://datajud-wiki.cnj.jus.br/api-publica/acesso', { muteHttpExceptions: true }).getContentText();
    var m = html.match(/APIKey\s+([A-Za-z0-9+\/=_\-]{20,200})/);
    if (m) wiki = m[1];
  } catch (e) { /* usa a conhecida */ }
  var k = [wiki, DATAJUD_CHAVE_PADRAO, auto].filter(function (x) { return x && x !== falhou; })[0] || DATAJUD_CHAVE_PADRAO;
  props.setProperty('DATAJUD_CHAVE_AUTO', k);
  return k;
}

function pedidoDatajud_(numero, chave) {
  return { url: 'https://api-publica.datajud.cnj.jus.br/api_publica_' + aliasDatajud_(numero) + '/_search', method: 'post',
    contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'APIKey ' + chave },
    payload: JSON.stringify({ query: { match: { numeroProcesso: String(numero).replace(/\D/g, '') } }, size: 10 }) };
}

function dataDatajud_(v) {
  var s = String(v || '');
  if (/^\d{14}$/.test(s)) s = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + 'T' + s.slice(8, 10) + ':' + s.slice(10, 12) + ':' + s.slice(12, 14) + '-03:00';
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Lê a resposta do DataJud: movimentos de todos os graus, do mais novo para o mais antigo. */
function lerDatajud_(texto) {
  var j = JSON.parse(texto || '{}');
  var hits = ((j.hits || {}).hits || []).map(function (h) { return h._source || {}; });
  if (!hits.length) return null;
  var movs = [], vistos = {};
  hits.forEach(function (s) {
    (s.movimentos || []).forEach(function (mv) {
      var quando = dataDatajud_(mv.dataHora);
      var comp = (mv.complementosTabelados || []).map(function (c) { return c.nome || c.descricao || ''; }).filter(String).join(', ');
      var nome = String(mv.nome || '').trim() + (comp ? ' (' + comp + ')' : '');
      var k = quando + '|' + nome;
      if (!quando || !nome || vistos[k]) return;
      vistos[k] = 1;
      movs.push({ d: quando, n: nome.slice(0, 160), g: s.grau || '' });
    });
  });
  movs.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  var principal = hits.filter(function (s) { return s.grau === 'G1'; })[0] || hits[0];
  return { movs: movs, classe: (principal.classe || {}).nome || '', orgao: (principal.orgaoJulgador || {}).nome || '',
    assuntos: (principal.assuntos || []).map(function (a) { return a.nome; }).filter(String).slice(0, 3).join(', '),
    atualizado: dataDatajud_(principal.dataHoraUltimaAtualizacao) };
}

function guardarAndamentos_(tab, p, r) {
  var agora = new Date().toISOString();
  if (!r) { atualizarLinha_(tab, p, { datajud_em: agora, andamentos: p.andamentos && p.andamentos !== '-' ? p.andamentos : '-' }); return false; }
  var lista = r.movs.slice(0, 25), txt = JSON.stringify(lista);
  while (txt.length > 4800 && lista.length > 3) { lista.pop(); txt = JSON.stringify(lista); }
  var m = { datajud_em: agora, andamentos: txt, classe: r.classe || p.classe };
  if (!p.orgao && r.orgao) m.orgao = r.orgao;
  atualizarLinha_(tab, p, m);
  if (lista[0]) atualizarMovimento_(tab, p, lista[0].n, lista[0].d);
  return true;
}

/**
 * Robô dos andamentos: consulta o DataJud em lotes, começando pelos processos que estão há mais tempo sem conferir.
 * Arquivados só de 15 em 15 dias. Processos em segredo de justiça não aparecem no DataJud.
 */
function atualizarAndamentos_(limiteMs, maximo) {
  var t0 = Date.now(), tab = tabela_('Processos'), agora = Date.now();
  var fila = tab.linhas.filter(function (p) {
    if (!aliasDatajud_(p.numero)) return false;
    var ult = p.datajud_em ? Date.parse(p.datajud_em) : 0;
    if (p.status === 'arquivado') return agora - ult > 15 * 86400000;
    return agora - ult > 20 * 3600000;
  }).sort(function (a, b) {
    return (a.status === 'arquivado') - (b.status === 'arquivado') || ((a.datajud_em || '') < (b.datajud_em || '') ? -1 : 1);
  }).slice(0, maximo || 400);
  if (!fila.length) { // fila vazia: tudo em dia; apaga o problema antigo
    setConfig_('DATAJUD_ULTIMA', new Date().toISOString() + ' · em dia (todos os processos consultados nas últimas 20 h)', 'Última leitura do DataJud');
    setConfig_('DATAJUD_ERRO', '', 'Último problema do DataJud');
    return { lidos: 0, achados: 0 };
  }
  tab.adiar = true;
  // O CNJ limita o ritmo (código 429): lotes pequenos, pausa entre eles e, se pedir calma, espera e tenta de novo;
  // persistindo, para por aqui sem marcar erro — os que faltaram ficam para a próxima rodada (de 4 em 4 horas).
  var chave = chaveDatajud_(false), renovou = false, lidos = 0, achados = 0, erro = '', aviso = '', pausa = 1200, LOTE = 4;
  for (var i = 0; i < fila.length && Date.now() - t0 < (limiteMs || 120000); i += LOTE) {
    var lote = fila.slice(i, i + LOTE);
    var resps = UrlFetchApp.fetchAll(lote.map(function (p) { return pedidoDatajud_(p.numero, chave); }));
    var negado = resps.every(function (r) { return r.getResponseCode() === 401 || r.getResponseCode() === 403; });
    if (negado) {
      if (renovou) { erro = 'o CNJ recusou a chave pública (código ' + resps[0].getResponseCode() + ')'; break; }
      chave = chaveDatajud_(true, chave); renovou = true; i -= LOTE; continue;
    }
    var limitados = [];
    for (var k = 0; k < lote.length; k++) {
      var code = resps[k].getResponseCode();
      if (code === 429 || code === 503) { limitados.push(lote[k]); continue; }
      if (code !== 200) { erro = 'DataJud respondeu ' + code + ' (processo ' + lote[k].numero + ')'; continue; }
      try { if (guardarAndamentos_(tab, lote[k], lerDatajud_(resps[k].getContentText()))) achados++; lidos++; }
      catch (e) { erro = String(e.message || e); }
    }
    if (limitados.length) {
      Utilities.sleep(8000); pausa = Math.min(pausa * 2, 6000);
      var de2 = limitados.map(function (p) { return UrlFetchApp.fetch(pedidoDatajud_(p.numero, chave).url, pedidoDatajud_(p.numero, chave)); });
      var aindaLimitado = false;
      de2.forEach(function (resp, n) {
        if (resp.getResponseCode() === 200) { try { if (guardarAndamentos_(tab, limitados[n], lerDatajud_(resp.getContentText()))) achados++; lidos++; } catch (e) { erro = String(e.message || e); } }
        else aindaLimitado = true;
      });
      if (aindaLimitado) { aviso = 'o CNJ pediu uma pausa; os processos que faltaram ficam para a próxima rodada'; break; }
    }
    Utilities.sleep(pausa);
  }
  regravarMudadas_(tab);
  var faltam = Math.max(0, fila.length - lidos);
  setConfig_('DATAJUD_ULTIMA', new Date().toISOString() + ' · ' + lidos + ' consultado(s), ' + achados + ' com andamentos' + (faltam ? ' · ' + faltam + ' na fila' : '') + (aviso ? ' · ' + aviso : ''), 'Última leitura do DataJud');
  setConfig_('DATAJUD_ERRO', erro, 'Último problema do DataJud');
  return { lidos: lidos, achados: achados, erro: erro, aviso: aviso };
}

function andamentosGatilho() {
  try { atualizarAndamentos_(270000, 300); } catch (e) { setConfig_('DATAJUD_ERRO', String(e.message || e), 'Último problema do DataJud'); }
}

/** Andamentos de um processo (e, se pedido, consulta o DataJud agora). */
function andamentosProcesso_(d, u) {
  var tab = tabela_('Processos');
  var p = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!p) throw falha_('Processo não encontrado.');
  var erro = '';
  if (d.atualizar) {
    if (!aliasDatajud_(p.numero)) throw falha_('Este número não é de um tribunal que está no DataJud.');
    var ped = pedidoDatajud_(p.numero, chaveDatajud_(false));
    var resp = UrlFetchApp.fetch(ped.url, ped);
    if (resp.getResponseCode() === 401 || resp.getResponseCode() === 403) { ped = pedidoDatajud_(p.numero, chaveDatajud_(true, ped.headers.Authorization.slice(7))); resp = UrlFetchApp.fetch(ped.url, ped); }
    if (resp.getResponseCode() === 200) comTrava_(function () { guardarAndamentos_(tab, p, lerDatajud_(resp.getContentText())); });
    else erro = 'O DataJud não respondeu agora (código ' + resp.getResponseCode() + '). Tente mais tarde.';
  }
  var lista = [];
  try { lista = p.andamentos && p.andamentos !== '-' ? JSON.parse(p.andamentos) : []; } catch (e) { lista = []; }
  return { lista: lista, em: p.datajud_em || '', classe: p.classe || '', naoEncontrado: p.andamentos === '-', noDatajud: !!aliasDatajud_(p.numero), erro: erro };
}

function estadoExtras_() {
  return { alertas: (function () { try { return vigiaRobo_(false); } catch (e) { return []; } })(), datajud: { ultima: config_('DATAJUD_ULTIMA'), erro: config_('DATAJUD_ERRO') },
    ia: { ligada: !!chaveIA_() && config_('IA_LIGADA') !== 'nao', ultima: config_('IA_ULTIMA'), erro: config_('IA_ERRO') },
    email: { ultimo: config_('RESUMO_EMAIL_DIA') }, versao: VERSAO };
}


/* ---------- Site: "Prefere que a gente ligue?" ---------- */

var ASSUNTOS_SITE = ['Trabalhista', 'Empresa / assessoria', 'Previdenciário (INSS)', 'Banco, compra ou contrato', 'Família', 'Criminal', 'Outro assunto'];
/** Pedido de contato vindo do site público: grava em Contatos, cria tarefa "Ligar para…" e avisa o escritório por e-mail. */
function contatoSite_(d) {
  if (d.empresa_site) return { ok: true }; // campo escondido: robô de spam preenche, gente não
  var nome = String(d.nome || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  var tel = String(d.telefone || '').replace(/\D/g, '');
  if (tel.length > 11 && tel.indexOf('55') === 0) tel = tel.slice(2);
  if (nome.length < 2) throw falha_('Informe seu nome.');
  if (tel.length < 10 || tel.length > 11) throw falha_('Informe o telefone com DDD.');
  if (!d.aceite) throw falha_('Marque a autorização para entrarmos em contato.');
  var assunto = ASSUNTOS_SITE.indexOf(d.assunto) >= 0 ? d.assunto : 'Outro assunto';
  var horario = { manha: 'manhã', tarde: 'tarde', qualquer: 'qualquer horário' }[d.horario] || 'qualquer horário';
  var cache = CacheService.getScriptCache();
  var total = parseInt(cache.get('site_contatos') || '0', 10);
  if (total >= 40) throw falha_('Recebemos muitos pedidos agora. Chame no WhatsApp, por favor.');
  if (cache.get('site_tel_' + tel)) return { ok: true, repetido: true };
  cache.put('site_contatos', String(total + 1), 3600);
  cache.put('site_tel_' + tel, '1', 6 * 3600);
  var fone = '(' + tel.slice(0, 2) + ') ' + tel.slice(2, tel.length - 4) + '-' + tel.slice(-4);
  var agora = new Date().toISOString(), id = novoId_('K');
  comTrava_(function () {
    var resp = config_('RESP_SITE') || config_('RESP_PADRAO') || '';
    var tid = novoId_('T');
    inserirLinha_(tabela_('Tarefas'), { id: tid, titulo: 'Ligar para ' + nome + ' (pedido pelo site · ' + assunto + ')', descricao: 'Telefone: ' + fone + '\nMelhor horário: ' + horario + '\nPágina: ' + String(d.pagina || '').slice(0, 80),
      responsavel: resp, processo_id: '', numero: '', cliente_id: '', vence_em: hojeSP_(), etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '',
      historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' site: pedido de contato', criado_em: agora, criado_por: 'site', atualizado_em: agora, atualizado_por: 'site' });
    inserirLinha_(tabela_('Contatos'), { id: id, criado_em: agora, nome: nome, telefone: fone, assunto: assunto, horario: horario, pagina: String(d.pagina || '').slice(0, 80),
      situacao: 'novo', tarefa_id: tid, observacoes: '' });
  });
  try {
    var para = config_('CONTATO_EMAIL') || Session.getEffectiveUser().getEmail();
    GmailApp.sendEmail(para, 'Site: ' + nome + ' pediu para ligarmos (' + assunto + ')',
      'Pedido de contato pelo site\n\nNome: ' + nome + '\nTelefone: ' + fone + '\nAssunto: ' + assunto + '\nMelhor horário: ' + horario + '\n\nWhatsApp: https://wa.me/55' + tel + '\n\nJá entrou como tarefa no painel (aba Tarefas).',
      { name: 'Site Araújo Advocacia' });
  } catch (e) { /* o contato já ficou gravado */ }
  registrar_('site', 'pedido de contato', id + ' ' + assunto);
  return { ok: true };
}


/* ---------- Robô de hora em hora e vigia (para nunca perder prazo) ---------- */

/** De hora em hora: lê os avisos novos do Gmail (e o DJEN, se o navegador não leu), recalcula prazos e confere se algo está parado. */
function roboRapidoGatilho() {
  try { rodarRobo_('robô (de hora em hora)'); } catch (e) { setConfig_('ROBO_ULTIMO_RESULTADO', 'Erro no robô de hora em hora: ' + (e.message || e), 'Resultado da última execução'); }
  try { aquecerMemoria_(); } catch (eQ) { /* segue */ }
  try { vigiaRobo_(true); } catch (e2) { /* segue */ }
}

/** Problemas que podem fazer perder prazo. Com avisar = true, manda e-mail para a administração (no máximo 1 a cada 12 h). */
function vigiaRobo_(avisar) {
  var agora = Date.now(), alertas = [];
  var gm = config_('ROBO_GMAIL_OK');
  if (!gm || agora - Date.parse(gm) > 6 * 3600000) alertas.push('O robô não consegue ler o Gmail desde ' + (gm ? Utilities.formatDate(new Date(gm), TZ, 'dd/MM HH:mm') : 'a instalação') + '. Abra o painel › Intimações › "Atualizar agora" e veja o aviso; confira as intimações direto no eproc e no PJe.');
  var dj = config_('DJEN_NAVEGADOR_ULTIMA');
  var dsem = new Date(hojeSP_() + 'T12:00:00Z').getUTCDay();
  if (dsem >= 1 && dsem <= 5 && (!dj || agora - Date.parse(dj) > 26 * 3600000)) alertas.push('O DJEN não é lido desde ' + (dj ? Utilities.formatDate(new Date(dj), TZ, 'dd/MM HH:mm') : 'nunca') + '. O CNJ só deixa ler pelo computador do escritório: deixe o painel aberto lá (ele lê de 2 em 2 horas).');
  var pend = 0, diverg = [];
  try {
    tabela_('Prazos').linhas.forEach(function (z) {
      if (SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return;
      if (!z.fatal) pend++;
      if (/⚠/.test(z.resumo_ia || '')) diverg.push(z.numero);
    });
  } catch (e) { /* segue */ }
  if (pend) alertas.push(pend + ' prazo(s) aberto(s) sem data fatal. Abra Intimações › "A definir".');
  if (diverg.length) alertas.push('A IA encontrou prazo diferente do calculado em ' + diverg.length + ' processo(s): ' + diverg.slice(0, 8).join(', ') + '. Confira no sistema do tribunal.');
  if (avisar && alertas.length) {
    var ult = config_('ALERTA_ROBO_EM');
    if (!ult || agora - Date.parse(ult) > 12 * 3600000) {
      usuarios_().filter(function (u) { return u.ativo === 'sim' && u.email && (u.perfil === 'administrador' || u.perfil === 'advogada'); }).forEach(function (u) {
        try { GmailApp.sendEmail(u.email, '⚠ Painel: atenção com os prazos', 'O painel encontrou situações que podem fazer perder prazo:\n\n- ' + alertas.join('\n- ') + '\n\nhttps://araujoadvocaciasc.com.br/painel/', { name: 'Painel Araújo Advocacia' }); } catch (e) { /* segue */ }
      });
      setConfig_('ALERTA_ROBO_EM', new Date().toISOString(), 'Último alerta do vigia do robô');
    }
  }
  return alertas;
}


/**
 * Baixa em lote (feita uma vez, a pedido da administração): todo prazo aberto com data fatal ANTES de hoje vira "cancelado",
 * com a observação da baixa. Prazos de hoje em diante não são tocados. Cada um pode ser reaberto no painel.
 */
function baixarVencidos_(d, u) {
  return comTrava_(function () {
    var hoje = hojeSP_(), tab = tabela_('Prazos'), agora = new Date().toISOString(), n = 0;
    var alvo = tab.linhas.filter(function (z) { return SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && z.fatal && z.fatal < hoje; });
    if (d.contar) return { vencidos: alvo.length };
    tab.adiar = true;
    alvo.forEach(function (z) {
      atualizarLinha_(tab, z, { situacao: 'cancelado', atualizado_em: agora, atualizado_por: u.usuario,
        observacoes: (z.observacoes ? z.observacoes + ' | ' : '') + 'Baixa em lote dos prazos vencidos em ' + dataBR_(hoje) + ' por ' + (u.nome || u.usuario) + '.' });
      n++;
    });
    regravarMudadas_(tab);
    registrar_(u.usuario, 'baixa em lote', n + ' prazo(s) vencido(s) baixado(s)');
    return { baixados: n };
  });
}
