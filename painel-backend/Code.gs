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

var VERSAO = '8.16.0';

var PERFIS = {
  administrador: { nome: 'Administrador', financeiro: true, usuarios: true, conferePrazos: true },
  advogada: { nome: 'Advogada', financeiro: false, usuarios: false, conferePrazos: true },
  secretario: { nome: 'Secretário', financeiro: false, usuarios: false, conferePrazos: false },
  estagiario: { nome: 'Estagiário', financeiro: false, usuarios: false, conferePrazos: false },
  // RH: vê tudo, menos Usuários; entra no Financeiro, mas os valores chegam apagados (o servidor nem envia)
  // RH (8.4.6, pedido da usuária): usa tudo, inclusive o Financeiro (lança, dá baixa, PIX, despesas, contratos); não vê Relatórios,
  // Usuários nem os TOTAIS "a receber" (os números do topo do Financeiro e a tela "A receber por cliente").
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
/** O que o RH não vê: só os totais a receber. Cada parcela, honorário, PIX e despesa continua visível para ele trabalhar. */
function valoresDoPerfil_(acao, res, perfil) {
  if (!PERFIS[perfil] || !PERFIS[perfil].ocultarValores || !res || typeof res !== 'object') return res;
  if (acao === 'fin.areceber' || acao === 'fin.painel') return semValores_(res);
  if (acao === 'fin.resumo') { var o = Object.assign({}, res); o.totais = semValores_(res.totais); o.faixas = semValores_(res.faixas); return o; }
  return res;
}
var ROTAS_VALOR_BLOQUEADAS = { 'fin.renegociar': 1, 'fin.honorario.salvar': 1, 'fin.parcela.salvar': 1, 'fin.recebimento.salvar': 1, 'fin.despesa.salvar': 1, 'fin.pixBaixar': 1, 'fin.pixIgnorar': 1, 'fin.pixConfig': 1, 'fin.parcela.pagar': 1 };

// Ordem das colunas de cada aba. Não mude a ordem depois de ter dados.
var ESQUEMA = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'usuario', 'nome', 'perfil', 'hash', 'salt', 'ativo', 'tentativas', 'bloqueado_ate', 'criado_em', 'ultimo_acesso', 'sessao_versao', 'email', 'resumo_email'],
  ObsArquivo: ['id', 'cliente_id', 'texto', 'arquivado_em'],
  Clientes: ['id', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
    'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'pasta_id', 'pasta_url',
    'observacoes', 'situacao', 'criado_em', 'atualizado_em', 'atualizado_por', 'tipo_acao', 'resumo_caso', 'providencias', 'genero',
    'acesso_hash', 'acesso_criado_em', 'como_conheceu'],
  Processos: ['id', 'cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
    'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'origem', 'criado_em',
    'atualizado_em', 'atualizado_por', 'ultimo_movimento', 'ultimo_movimento_em', 'classe', 'andamentos', 'datajud_em', 'fase', 'fase_auto', 'responsavel', 'avisado_mov_em'],
  Intimacoes: ['id', 'chave', 'fonte', 'recebido_em', 'numero', 'tribunal', 'movimento', 'evento', 'texto',
    'partes_cliente', 'processo_id', 'prazo_id', 'criado_em', 'resumo_ia', 'terminada_por', 'terminada_em', 'ok_por', 'ok_em'],
  Prazos: ['id', 'processo_id', 'numero', 'intimacao_id', 'descricao', 'dias', 'contagem', 'ciencia', 'ciencia_tipo',
    'fatal', 'situacao', 'conferido_por', 'conferido_em', 'origem', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por',
    'cumprido_por', 'cumprido_em', 'responsavel', 'etapa', 'resumo_ia', 'ok_por', 'ok_em', 'agenda_id', 'agenda_data', 'conferido_fonte'],
  Honorarios: ['id', 'cliente_id', 'processo_id', 'tipo', 'descricao', 'valor_total', 'percentual', 'valor_mensal',
    'dia_vencimento', 'inicio', 'situacao', 'observacoes', 'origem', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Parcelas: ['id', 'honorario_id', 'cliente_id', 'numero', 'vencimento', 'valor', 'pago_em', 'valor_pago', 'forma',
    'cobranca', 'mensagem_em', 'acao_processo_id', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por', 'recibo_url'],
  Recebimentos: ['id', 'honorario_id', 'processo_id', 'data', 'valor_bruto', 'percentual', 'honorarios', 'repasse_cliente',
    'repassado_em', 'observacoes', 'criado_em', 'criado_por'],
  Eventos: ['chave', 'tipo', 'numero', 'data', 'hora', 'agenda', 'evento_id', 'prazo_id', 'criado_em', 'avisado_em', 'avisado_por', 'avisado_dia_em', 'avisado_dia_por'],
  Feriados: ['data', 'descricao', 'abrangencia'],
  Log: ['quando', 'usuario', 'acao', 'detalhe'],
  LogArquivo: ['quando', 'usuario', 'acao', 'detalhe'],
  Leads: ['id', 'criado_em', 'nome', 'telefone', 'email', 'area', 'assunto', 'canal', 'etapa', 'valor_estimado', 'responsavel', 'proxima_acao', 'proxima_data',
    'temperatura', 'consulta_em', 'indicado_por', 'observacoes', 'motivo_perda', 'cliente_id', 'contato_id', 'proposta_url', 'historico', 'primeiro_contato_em',
    'ganho_em', 'perdido_em', 'criado_por', 'atualizado_em', 'atualizado_por', 'cadastro_token', 'cadastro_ate', 'cadastro_em'],
  Transcricoes: ['id', 'criado_em', 'criado_por', 'tipo', 'titulo', 'cliente_id', 'processo_id', 'data_ato', 'fonte', 'doc_url', 'resumo_cliente', 'resumo_equipe',
    'documentos', 'publicado', 'publicado_em'],
  Padroes: ['id', 'grupo', 'titulo', 'texto', 'ordem', 'atualizado_em', 'atualizado_por'],
  Conversas: ['id', 'telefone', 'nome', 'cliente_id', 'lead_id', 'estado', 'ultima_em', 'ultima_msg', 'nao_lidas', 'atendente', 'pausado_ate', 'criado_em', 'resumo', 'dados', 'ultima_cliente_em'],
  Mensagens: ['id', 'conversa_id', 'quando', 'direcao', 'tipo', 'texto', 'wa_id', 'autor'],
  Assinaturas: ['id', 'cliente_id', 'cliente_nome', 'documentos', 'tipo_acao', 'parte_contraria', 'gerado_em', 'gerado_por', 'situacao', 'assinado_em', 'assinado_por',
    'processo_id', 'lembretes', 'lembrete_em', 'pasta_url', 'honorarios', 'honorarios_lancados'],
  PastasConferir: ['pasta', 'pasta_url', 'motivo', 'clientes_possiveis'],
  Advogados: ['id', 'nome', 'oab', 'uf', 'tratamento', 'email', 'telefone', 'ativo', 'padrao', 'criado_em'],
  Tarefas: ['id', 'titulo', 'descricao', 'responsavel', 'processo_id', 'numero', 'cliente_id', 'vence_em', 'etapa', 'peso', 'situacao',
    'concluida_por', 'concluida_em', 'historico', 'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por',
    'prioridade', 'checklist', 'repetir', 'ok_por', 'ok_em'],
  Contatos: ['id', 'criado_em', 'nome', 'telefone', 'assunto', 'horario', 'pagina', 'situacao', 'tarefa_id', 'observacoes', 'origem', 'campanha'],
  Marketing: ['id', 'mes', 'canal', 'campanha', 'area', 'investimento', 'cliques', 'impressoes', 'conversoes', 'obs', 'criado_em', 'criado_por'],
  SiteCliques: ['quando', 'pagina', 'area', 'origem', 'campanha', 'canal'],
  MktFunil: ['mes', 'pagina', 'conversas', 'consultas', 'atualizado_em', 'atualizado_por'],
  Pix: ['id', 'recebido_em', 'valor', 'pagador', 'situacao', 'cliente_id', 'parcela_id', 'motivo', 'criado_em', 'atualizado_em', 'atualizado_por', 'recibo', 'sugestao', 'categoria'],
  FutUnidades: ['id', 'tipo', 'andar', 'ordem', 'aluguel', 'taxas', 'situacao', 'locatario', 'telefone', 'entrada', 'saida', 'garantia', 'caucao',
    'energia_resp', 'kit', 'uc', 'medidor', 'uc_antiga', 'obs', 'atualizado_em', 'atualizado_por', 'pagador', 'pasta_url', 'cobra_energia', 'moeda', 'modalidade', 'conta_receb'],
  FutPessoas: ['id', 'nome', 'telefone', 'cpf', 'unidade', 'entrada', 'saida', 'garantia', 'caucao', 'situacao', 'obs', 'origem', 'criado_em', 'pasta_url', 'arquivos', 'contrato_url', 'rg', 'qualificacao', 'genero', 'laudo_url', 'email'],
  FutLanc: ['id', 'data', 'competencia', 'tipo', 'categoria', 'unidade', 'pessoa', 'valor', 'forma', 'responsavel', 'descricao', 'origem', 'chave', 'criado_em', 'criado_por'],
  FutCobrancas: ['id', 'unidade', 'pessoa', 'competencia', 'vencimento', 'aluguel', 'taxas', 'energia', 'outros', 'total', 'pago_em', 'valor_pago', 'forma', 'lanc_id',
    'situacao', 'obs', 'criado_em', 'atualizado_em', 'atualizado_por', 'pagador', 'enviado_em', 'enviado_por', 'detalhe', 'lavanderia', 'lembrete5_em', 'lembrete10_em'],
  FutContratos: ['id', 'criado_em', 'criado_por', 'unidade', 'pessoa_id', 'nome', 'cpf', 'telefone', 'prazo_meses', 'inicio', 'fim', 'aluguel', 'garantia', 'caucao',
    'doc_url', 'pdf_url', 'laudo_doc', 'laudo_pdf', 'pasta_url', 'situacao', 'tipo', 'dias', 'valor_total', 'email', 'video_url', 'enviado_em', 'enviado_por'],
  FutEnergia: ['id', 'competencia', 'unidade', 'valor', 'kwh', 'origem', 'criado_em'],
  FutLavagens: ['id', 'data', 'competencia', 'unidade', 'pessoa', 'quantidade', 'valor', 'obs', 'criado_em', 'criado_por', 'situacao', 'tipo', 'chave'],
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
    .addItem('Fazer a cópia semanal agora', 'backupSemanal')
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
  try { if (!config_('BACKUP_SEMANAL_ULTIMO')) backupSemanal(); } catch (e) { /* sai na sexta */ }
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
  // 8.12: pedaços de áudio da transcrição (3 MB em base64) podem ser maiores; o resto continua limitado
  var limite = bruto.slice(0, 40).indexOf('"acao":"ia.audioParte"') >= 0 ? 4400000 : PEDIDO_MAX;
  if (bruto.length > limite) return json_({ ok: false, erro: 'Pedido grande demais.' });
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
  'clientes.notaEditar': { fn: editarNotaCliente_ },
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
  'ia.resumirProcesso': { fn: resumirProcessoIA_ },
  'processos.linhaTempo': { fn: linhaDoTempo_ },
  'robo.consertar': { permissao: 'usuarios', fn: consertarRobo_ },
  'clientes.abrirAcao': { fn: abrirAcaoCliente_ },
  'registro.whatsapp': { fn: registrarWhatsapp_ },
  'relatorio.semana': { permissao: 'usuarios', fn: relatorioSemana_ },
  'relatorio.cumpridos': { permissao: 'usuarios', fn: relatorioCumpridos_ },
  'clientes.documentos': { fn: documentosCliente_ },
  'modelos.listar': { fn: listarModelos_ },
  'modelos.liberarEdicao': { permissao: 'usuarios', fn: liberarEdicaoModelos_ },
  'advogados.salvar': { permissao: 'usuarios', fn: salvarAdvogado_ },
  'documentos.gerar': { fn: gerarDocumentos_ },
  'documentos.assinaturas': { fn: listarAssinaturas_ },
  'documentos.assinatura': { fn: marcarAssinatura_ },
  'processos.naoFechou': { fn: naoFechou_ },
  'fin.levantamento': { permissao: 'financeiro', fn: levantamentoHonorarios_ },
  'feriados.listar': { fn: function () { return tabela_('Feriados').linhas.map(limpar_); } },
  'feriados.salvar': { permissao: 'usuarios', fn: salvarFeriado_ },
  'fin.resumo': { permissao: 'financeiro', fn: resumoFinanceiro_ },
  'fin.areceber': { permissao: 'financeiro', fn: aReceber_ },
  'fin.honorarios': { permissao: 'financeiro', fn: listarHonorarios_ },
  'fin.honorario': { permissao: 'financeiro', fn: obterHonorario_ },
  'fin.honorario.salvar': { permissao: 'financeiro', fn: salvarHonorario_ },
  'fin.renegociar': { permissao: 'financeiro', fn: renegociarHonorario_ },
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
  'inicio.acoes': { fn: inicioAcoes_ },
  'agenda.avisado': { fn: marcarAvisado_ },
  'processos.fase': { fn: mudarFaseProcesso_ },
  'fin.alevantar': { permissao: 'financeiro', fn: aLevantar_ },
  'future.resumo': { future: true, fn: futureResumo_ },
  'future.unidade': { future: true, fn: futureUnidade_ },
  'future.unidade.salvar': { future: true, fn: futureSalvarUnidade_ },
  'future.pessoas': { future: true, fn: futurePessoas_ },
  'future.pessoa.salvar': { future: true, fn: futureSalvarPessoa_ },
  'future.cobrancas': { future: true, fn: futureCobrancas_ },
  'future.cobranca.pagar': { future: true, fn: futurePagarCobranca_ },
  'future.cobranca.pagarGrupo': { future: true, fn: futurePagarGrupo_ },
  'future.lancamentos': { future: true, fn: futureLancamentos_ },
  'future.lancamento.salvar': { future: true, fn: futureSalvarLancamento_ },
  'future.energia.salvar': { future: true, fn: futureSalvarEnergia_ },
  'future.relatorio': { future: true, fn: futureRelatorio_ },
  'future.config': { future: true, fn: futureConfig_ },
  'future.importar': { future: true, fn: futureImportar_ },
  'future.cobranca.enviada': { future: true, fn: futureCobrancaEnviada_ },
  'future.cobranca.lembrete': { future: true, fn: futureCobrancaLembrete_ },
  'future.energia.colar': { future: true, fn: futureEnergiaColar_ },
  'future.pessoa.pasta': { future: true, fn: futurePastaPessoa_ },
  'future.contratos': { future: true, fn: futureContratos_ },
  'future.lavanderia': { future: true, fn: futureLavanderia_ },
  'future.lavanderia.salvar': { future: true, fn: futureSalvarLavagem_ },
  'future.lavanderia.colar': { future: true, fn: futureColarLavanderia_ },
  'future.energia': { future: true, fn: futureEnergiaGrade_ },
  'future.lancamento.lote': { future: true, fn: futureLancamentosLote_ },
  'future.importarPasta': { future: true, fn: function (d, u) { return comTrava_(function () { return futureImportarPasta_(u); }); } },
  'future.contrato.gerar': { future: true, fn: futureGerarContrato_ },
  'future.contrato.distrato': { future: true, fn: futureDistrato_ },
  'future.vistoria.enviar': { future: true, fn: futureEnviarVistoria_ },
  'future.contrato.aditivo': { future: true, fn: futureAditivo_ },
  'future.drive': { future: true, fn: function () { return comTrava_(function () { return futureSincronizarDrive_(true) || { unidades: 0, pessoas: 0, novas: 0 }; }); } },
  'revisao.geral': { permissao: 'usuarios', fn: revisaoGeral_ },
  'fin.caixa': { permissao: 'financeiro', fn: caixa_ },
  'fin.pix': { permissao: 'financeiro', fn: listarPix_ },
  'fin.pixBaixar': { permissao: 'financeiro', fn: baixarPix_ },
  'fin.pixIgnorar': { permissao: 'financeiro', fn: ignorarPix_ },
  'fin.pixLer': { permissao: 'financeiro', fn: lerPixAgora_ },
  'fin.pixConfig': { permissao: 'usuarios', fn: configPix_ },
  'fin.despesa.categoria': { permissao: 'financeiro', fn: categoriaDespesa_ },
  'organizar.listar': { fn: organizarListar_ },
  'organizar.ligar': { fn: organizarLigar_ },
  'fin.despesa.salvar': { permissao: 'financeiro', fn: salvarDespesa_ },
  'fin.despesa.acao': { permissao: 'financeiro', fn: acaoDespesa_ },
  'relatorio.geral': { permissao: 'usuarios', fn: relatorioGeral_ },
  'marketing.resumo': { permissao: 'usuarios', fn: marketingResumo_ },
  'marketing.salvar': { permissao: 'usuarios', fn: marketingSalvar_ },
  'site.clique': { publica: true, fn: cliqueSite_ },
  'marketing.ads': { publica: true, fn: receberGoogleAds_ },
  'marketing.adsConfig': { permissao: 'usuarios', fn: configGoogleAds_ },
  'marketing.funil': { permissao: 'usuarios', fn: marketingFunil_ },
  'marketing.gbp': { permissao: 'usuarios', fn: marketingGbp_ },
  'resumo.email.testar': { fn: testarResumoEmail_ },
  'ia.config': { permissao: 'usuarios', fn: configIA_ },
  'ia.resumirPrazo': { fn: resumirPrazoIA_ },
  'processos.andamentos': { fn: andamentosProcesso_ },
  // 8.12: gestão
  // 8.12.2 (pedido da usuária): CRM / Funil só para a administração
  'crm.listar': { permissao: 'usuarios', fn: crmListar_ },
  'crm.salvar': { permissao: 'usuarios', fn: crmSalvar_ },
  'crm.etapa': { permissao: 'usuarios', fn: crmEtapa_ },
  'crm.anotar': { permissao: 'usuarios', fn: crmAnotar_ },
  'crm.converter': { permissao: 'usuarios', fn: crmConverter_ },
  'crm.consulta': { permissao: 'usuarios', fn: crmAgendarConsulta_ },
  // 8.13: chatbot do WhatsApp (a ponte chama a rota pública com a chave secreta; o resto é só da administração)
  'whats.webhook': { publica: true, fn: whatsWebhook_ },
  // 8.14: cadastro online (público, pelo link) e extensão do WhatsApp Web (chave própria do aparelho, só as rotas ext.*)
  'crm.linkCadastro': { permissao: 'usuarios', fn: crmLinkCadastro_ },
  'site.cadastroInfo': { publica: true, fn: cadastroInfo_ },
  'site.cadastro': { publica: true, fn: cadastroEnviar_ },
  'ext.parear': { permissao: 'usuarios', fn: extParear_ },
  'ext.ativar': { publica: true, fn: extAtivar_ },
  'ext.dispositivos': { permissao: 'usuarios', fn: extDispositivos_ },
  'ext.contatos': { ext: true, permissao: 'usuarios', fn: extContatos_ },
  'ext.contato': { ext: true, permissao: 'usuarios', fn: extContato_ },
  'ext.adicionar': { ext: true, permissao: 'usuarios', fn: extAdicionar_ },
  'ext.etapa': { ext: true, permissao: 'usuarios', fn: function (d, u) { if (d.etapa === 'perdido' && !d.motivo) d.motivo = 'Outro'; return crmEtapa_(d, u); } },
  'ext.anotar': { ext: true, permissao: 'usuarios', fn: function (d, u) { return d.cliente_id && !d.id ? anotarCliente_({ id: d.cliente_id, texto: d.texto }, u) : crmAnotar_(d, u); } },
  'ext.linkCadastro': { ext: true, permissao: 'usuarios', fn: crmLinkCadastro_ },
  'ext.evento': { ext: true, permissao: 'usuarios', fn: extEvento_ },
  'ext.analisar': { ext: true, permissao: 'usuarios', fn: extAnalisar_ },
  'whats.conversas': { permissao: 'usuarios', fn: whatsConversas_ },
  'whats.acao': { permissao: 'usuarios', fn: whatsAcao_ },
  'whats.config': { permissao: 'usuarios', fn: whatsConfig_ },
  'crm.proposta': { fn: gerarProposta_ },
  'padroes.listar': { fn: padroesListar_ },
  'padroes.salvar': { fn: padroesSalvar_ },
  'padroes.guia': { fn: padroesGuia_ },
  'ia.audioInicio': { fn: audioInicio_ },
  'ia.audioParte': { fn: audioParte_ },
  'ia.transcrever': { fn: transcrever_ },
  'ia.transcricaoResumo': { fn: transcricaoResumo_ },
  'ia.transcricoes': { fn: transcricoesListar_ },
  'ia.transcricaoPublicar': { fn: transcricaoPublicar_ },
  'ia.transcricao': { fn: transcricaoObter_ },
  'ia.organizarNota': { fn: organizarNotaIA_ },
  'ia.transcricaoTarefa': { fn: transcricaoTarefa_ },
  'fin.painel': { permissao: 'financeiro', fn: painelFinanceiro_ },
  'fin.recibos': { permissao: 'financeiro', fn: recibosListar_ },
  'fin.recibo.gerar': { permissao: 'financeiro', fn: reciboGerar_ },
  'calc.prazo': { fn: calcPrazo_ },
  'calc.indices': { fn: calcIndices_ }
};

var MEMO_LEITURA = null;
var LEITURAS_RAPIDAS = { 'inicio.acoes': 1, 'processos.linhaTempo': 1, 'organizar.listar': 1, 'resumo': 1, 'fin.alevantar': 1, 'inicio.extras': 1, 'equipe.listar': 1, 'eu.painel': 1, 'trabalho.aguardando': 1, 'fin.pix': 1, 'relatorio.semana': 1, 'clientes.listar': 1, 'clientes.obter': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1,
  'feriados.listar': 1, 'ia.transcricoes': 1, 'ia.transcricao': 1, 'fin.recibos': 1, 'usuarios.listar': 1, 'relatorio.cumpridos': 1, 'agenda.listar': 1, 'fin.honorarios': 1, 'fin.honorario': 1, 'clientes.documentos': 1, 'fin.areceber': 1, 'tarefas.listar': 1, 'relatorio.geral': 1 };

function rotear_(acao, token, dados) {
  var rota = ROTAS[acao];
  if (!rota) throw falha_('Ação desconhecida.');
  if (rota.publica) return rota.fn(dados, null);
  // a chave do aparelho da extensão (ext_…) só abre as rotas marcadas ext; o resto exige a sessão normal
  var u = rota.ext && /^ext_/.test(String(token || '')) ? usuarioDoDispositivo_(token) : usuarioDaSessao_(token);
  if (rota.future && !podeFuture_(u)) { registrar_(u.usuario, 'acesso negado', acao); throw falha_('Você não tem acesso ao painel do Edifício Future.'); }
  if (rota.permissao && !PERFIS[u.perfil][rota.permissao]) {
    registrar_(u.usuario, 'acesso negado', acao);
    throw falha_('Seu perfil não tem acesso a esta área.');
  }
  var oculta = !!PERFIS[u.perfil].ocultarValores;
  // Rotas só de leitura: cada aba da planilha é lida uma vez só por pedido (mais rápido)
  MEMO_LEITURA = LEITURAS_RAPIDAS[acao] ? {} : null;
  try {
    var res = ROTAS_GUARDADAS[acao] ? comMemoria_(acao, u, dados, function () { return rota.fn(dados, u, token); }) : rota.fn(dados, u, token);
    return oculta ? valoresDoPerfil_(acao, res, u.perfil) : res;
  } finally { MEMO_LEITURA = null; }
}

/*
 * Memória do servidor para as listas grandes: a resposta fica guardada por até 10 minutos e é jogada fora
 * na hora em que qualquer coisa é gravada na planilha (pelo painel, pelo robô ou pelo configurar).
 */
var ROTAS_GUARDADAS = { 'inicio.extras': 1, 'eu.painel': 1, 'clientes.listar': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1, 'fin.honorarios': 1, 'tarefas.listar': 1, 'relatorio.geral': 1 };
function versaoDados_() {
  var c = CacheService.getScriptCache(), v = c.get('versao_dados');
  if (!v) { v = String(Date.now()); c.put('versao_dados', v, 21600); }
  return v;
}
function marcarMudanca_() {
  try { CacheService.getScriptCache().put('versao_dados', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); } catch (e) { /* segue sem memória */ }
}
var MEMORIA_POR_PERFIL = { 'inicio.extras': 1, 'clientes.listar': 1, 'processos.listar': 1, 'prazos.listar': 1, 'intimacoes.listar': 1, 'relatorio.geral': 1, 'fin.honorarios': 1 };
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

/** Senha nova (cadastro e troca): 8 caracteres ou mais, com letra e número, diferente do usuário. O login aceita as antigas. */
function validarSenha_(senha, usuario) {
  senha = String(senha || '');
  if (!senha.trim()) throw falha_('Informe uma senha.');
  if (senha.length < 8) throw falha_('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) throw falha_('A senha precisa ter letras e números.');
  if (usuario && senha.toLowerCase().indexOf(String(usuario).toLowerCase()) >= 0) throw falha_('A senha não pode conter o nome de usuário.');
  if (/^(12345678|password|senha123|abc12345|araujo123)/i.test(senha)) throw falha_('Essa senha é fácil demais. Escolha outra.');
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
  return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.perfil, perfilNome: p.nome, pode: { financeiro: p.financeiro, usuarios: p.usuarios, conferePrazos: p.conferePrazos, ocultarValores: !!p.ocultarValores, future: podeFuture_(u) } };
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
  'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'observacoes', 'situacao', 'genero', 'como_conheceu'];

function listarClientes_(d) {
  var busca = normalizar_(d.busca || '');
  var procs = tabela_('Processos').linhas;
  var porCliente = {};
  procs.forEach(function (p) { if (p.cliente_id) porCliente[p.cliente_id] = (porCliente[p.cliente_id] || 0) + 1; });
  // 8.11.1: parcelas que faltam pagar por cliente (etiqueta vermelha no cartão)
  var canc = {}, parc = {}, hojeL = hojeSP_();
  tabela_('Honorarios').linhas.forEach(function (h) { if (/cancelad|encerrad/.test(h.situacao || '')) canc[h.id] = 1; });
  tabela_('Parcelas').linhas.forEach(function (p) {
    if (p.pago_em || canc[p.honorario_id] || !p.cliente_id) return;
    var x = parc[p.cliente_id] = parc[p.cliente_id] || [0, 0]; x[0]++; if (p.vencimento && p.vencimento < hojeL) x[1]++;
  });
  var jor = jornadasClientes_();
  return tabela_('Clientes').linhas
    .filter(function (c) {
      if (!busca) return true;
      return normalizar_([c.nome, c.cpf_cnpj, c.telefone, c.email, c.cidade].join(' ')).indexOf(busca) >= 0 ||
        (c.cpf_cnpj && busca.replace(/\D/g, '') && String(c.cpf_cnpj).replace(/\D/g, '').indexOf(busca.replace(/\D/g, '')) >= 0);
    })
    .map(function (c) {
      return { id: c.id, tipo: c.tipo, nome: c.nome, cpf_cnpj: c.cpf_cnpj, telefone: c.telefone, cidade: c.cidade,
        area: c.area, situacao: c.situacao, pasta_url: c.pasta_url, processos: porCliente[c.id] || 0,
        obs: String(c.observacoes || '').split('\n')[0].slice(0, 160), n_obs: c.observacoes ? String(c.observacoes).split('\n').length : 0,
        parc_abertas: parc[c.id] ? parc[c.id][0] : 0, parc_atrasadas: parc[c.id] ? parc[c.id][1] : 0, jornada: jor[c.id] || 'sem' };
    })
    .sort(function (a, b) { return normalizar_(a.nome) < normalizar_(b.nome) ? -1 : 1; });
}

function obterCliente_(d, u) {
  var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!c) throw falha_('Cliente não encontrado.');
  var procs = tabela_('Processos').linhas.filter(function (p) { return p.cliente_id === c.id; });
  var cli = limpar_(c); cli.acesso_ativo = !!c.acesso_hash; delete cli.acesso_hash;
  try { // 8.11.1: observações antigas que passaram do tamanho da célula (a mais nova primeiro)
    cli.obs_antigas = tabela_('ObsArquivo').linhas.filter(function (x) { return x.cliente_id === c.id; }).map(function (x) { return x.texto; }).reverse().join('\n');
  } catch (e) { cli.obs_antigas = ''; }
  var lead = null;
  if (u && PERFIS[u.perfil] && PERFIS[u.perfil].usuarios) try { var l = tabela_('Leads').linhas.filter(function (x) { return x.cliente_id === c.id; }).pop(); if (l) lead = { id: l.id, etapa: l.etapa, canal: l.canal, proposta_url: l.proposta_url, criado_em: l.criado_em }; } catch (e) { /* aba nova */ }
  var j = jornadasClientes_()[c.id] || 'sem';
  return { cliente: cli, processos: procs.map(limpar_), parcelas: parcelasAbertasCliente_(c.id), lead: lead, jornada: j, jornada_nome: JORNADA[j] };
}

/** 8.11.1 (pedido da usuária): quantas parcelas o cliente ainda deve (em vermelho na ficha e no cartão). Ignora honorário cancelado/encerrado. */
function parcelasAbertasCliente_(cid, parcelas, hons) {
  var hoje = hojeSP_(), canc = {};
  (hons || tabela_('Honorarios').linhas).forEach(function (h) { if (/cancelad|encerrad/.test(h.situacao || '')) canc[h.id] = 1; });
  var ab = (parcelas || tabela_('Parcelas').linhas).filter(function (p) { return p.cliente_id === cid && !p.pago_em && !canc[p.honorario_id]; })
    .sort(function (a, b) { return (a.vencimento || '') < (b.vencimento || '') ? -1 : 1; });
  var atras = ab.filter(function (p) { return p.vencimento && p.vencimento < hoje; });
  var soma = function (l) { return Math.round(l.reduce(function (t, p) { return t + (dinheiro_(p.valor) - dinheiro_(p.valor_pago)); }, 0) * 100) / 100; };
  return { abertas: ab.length, atrasadas: atras.length, valor: soma(ab), valor_atrasado: soma(atras), proxima: ab[0] ? { vencimento: ab[0].vencimento, valor: dinheiro_(ab[0].valor) } : null };
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
    return { id: dados.id, novo: true, _crm: true };
  });
  // 8.5.0 (pedido da usuária): a pasta nova só nasce quando algum documento é gerado.
  // No cadastro, só liga à pasta que já existe no Drive com o mesmo nome.
  if (resultado._crm) { delete resultado._crm; try { crmSincronizar_(); } catch (eC) { /* entra no funil na próxima rodada do robô */ } }
  if (resultado.novo) {
    try { resultado.pasta = criarPastaCliente_({ id: resultado.id, soVincular: true }, u); }
    catch (e) { /* sem pasta por enquanto: será criada ao gerar documento */ }
  }
  return resultado;
}

/** 8.11.1: observações sem limite. A célula da planilha guarda até ~45 mil letras; o que passar disso (as anotações mais ANTIGAS)
 *  vai inteiro para a aba ObsArquivo e continua aparecendo na ficha ("observações antigas"). Nada se perde. */
function guardarObsCliente_(c, obs) {
  if (obs.length <= 45000) return obs;
  var linhas = obs.split('\n'), fica = [], tam = 0, i = 0;
  for (; i < linhas.length; i++) { if (tam + linhas[i].length + 1 > 45000 && fica.length) break; fica.push(linhas[i]); tam += linhas[i].length + 1; }
  var tabA = tabela_('ObsArquivo'), agora = new Date().toISOString();
  linhas.slice(i).reverse().forEach(function (l) { // a mais antiga primeiro
    for (var k = 0; k < l.length; k += 45000) inserirLinha_(tabA, { id: novoId_('OA'), cliente_id: c.id, texto: l.slice(k, k + 45000), arquivado_em: agora });
  });
  return fica.join('\n');
}

/**
 * Acrescenta uma observação ao cliente, com data, hora e quem escreveu (a mais nova fica em cima).
 * Formato guardado: "[27/10/2026 14:05 — Julian] texto", uma por linha.
 */
function anotarCliente_(d, u) {
  var texto = String(d.texto || '').replace(/\s+/g, ' ').trim();
  if (!texto) throw falha_('Escreva a observação.');
  // 8.11.1 (pedido da usuária): observação sem limite de tamanho
  return comTrava_(function () {
    var tab = tabela_('Clientes');
    var c = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    var carimbo = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    var nova = '[' + carimbo + ' — ' + (u.nome || u.usuario) + '] ' + texto;
    var obs = guardarObsCliente_(c, nova + (c.observacoes ? '\n' + c.observacoes : ''));
    atualizarLinha_(tab, c, { observacoes: obs, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, 'observação no cliente', c.id);
    return { observacoes: obs };
  });
}

/** 8.10 (pedido da usuária: "poder editar as observações"): corrige ou apaga UMA anotação (linha n), mantendo data e autor
    e marcando "(editado em … por …)". Texto vazio = apagar. Tudo fica no Log. */
function editarNotaCliente_(d, u) {
  var texto = String(d.texto || '').replace(/\s+/g, ' ').trim();
  return comTrava_(function () {
    var tab = tabela_('Clientes');
    var c = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    var linhas = String(c.observacoes || '').split('\n'), i = parseInt(d.indice, 10);
    if (!(i >= 0 && i < linhas.length)) throw falha_('Observação não encontrada (a ficha mudou). Atualize a tela.');
    if (d.original !== undefined && String(d.original).trim() !== linhas[i].trim()) throw falha_('Alguém mudou esta observação agora há pouco. Atualize a tela e tente de novo.');
    var antes = linhas[i], m = /^(\[[^\]]+\])\s*(.*)$/.exec(antes);
    var carimbo = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
    if (!texto) linhas.splice(i, 1);
    else linhas[i] = (m ? m[1] + ' ' : '') + texto.replace(/\s*\(editado em [^)]*\)\s*$/, '') + ' (editado em ' + carimbo + ' por ' + (u.nome || u.usuario) + ')';
    var obs = guardarObsCliente_(c, linhas.filter(function (l) { return l.trim(); }).join('\n'));
    atualizarLinha_(tab, c, { observacoes: obs, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, texto ? 'observação editada' : 'observação apagada', c.id + ' · antes: ' + antes.slice(0, 300));
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
  if (!pasta && d.soVincular) return { pasta_url: '', existente: false, adiada: true };
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
  var hoje = hojeSP_(), publicados = {}, gerais = [];
  try {
    tabela_('Transcricoes').linhas.filter(function (x) { return x.publicado === 'sim' && x.resumo_cliente && (x.cliente_id === cli.id || x.processo_id); }).forEach(function (x) {
      var item = { data: x.data_ato || String(x.publicado_em).slice(0, 10), titulo: String(x.titulo || '').slice(0, 120), texto: String(x.resumo_cliente).slice(0, 2500) };
      if (x.processo_id) (publicados[x.processo_id] = publicados[x.processo_id] || []).push(item); else if (x.cliente_id === cli.id) gerais.push(item);
    });
  } catch (e) { /* aba nova */ }
  var procs = tabela_('Processos').linhas.filter(function (p) { return p.cliente_id === cli.id && (p.numero || faseDe_(p) === 'contratado'); }).map(function (p) {
    var ato = p.proximo_ato_data && p.proximo_ato_data >= hoje ? { ato: String(p.proximo_ato || '').slice(0, 120), data: p.proximo_ato_data } : null;
    var fase = faseDe_(p), andam = [];
    try { andam = p.andamentos && p.andamentos !== '-' ? JSON.parse(p.andamentos).slice(0, 6).map(function (m) { return { d: String(m.d).slice(0, 10), n: String(m.n).slice(0, 140) }; }) : []; } catch (e) { andam = []; }
    return {
      numero: p.numero || '', area: p.area || '', tribunal: p.tribunal || tribunalDoNumero_(p.numero), orgao: p.orgao || '',
      situacao: p.status === 'arquivado' || fase === 'extinto' ? 'Arquivado / baixado' : !p.numero ? 'Em preparação' : 'Em andamento', proximo: ato,
      fase: fase, fase_nome: FASES[fase], andamentos: andam,
      movimentacao: p.ultimo_movimento_em ? String(p.ultimo_movimento_em).slice(0, 10) : '',
      ultimo: String(p.ultimo_movimento || '').replace(/\s+/g, ' ').slice(0, 160),
      resumos: publicados[p.id] || []
    };
  }).sort(function (a, b) {
    if (a.situacao !== b.situacao) return a.situacao === 'Arquivado / baixado' ? 1 : b.situacao === 'Arquivado / baixado' ? -1 : 0;
    return a.movimentacao < b.movimentacao ? 1 : a.movimentacao > b.movimentacao ? -1 : 0;
  });
  cache.remove(kCpf);
  registrar_('site', 'consulta do cliente', cli.id + ' (' + procs.length + ' processo(s))');
  return { nome: nomeProprio_(String(cli.nome || '').split(' ')[0]), processos: procs, comunicados: gerais.slice(-5).reverse(), atualizado: config_('ROBO_ULTIMA_EXECUCAO') || '' };
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
    if (numero && !cnjValido_(numero)) throw falha_('O número ' + numero + ' tem o dígito verificador errado (os 2 números depois do traço): o PJe/eproc não vai achar. Confira no processo e digite de novo.');
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
      return Object.assign({ id: linha.id }, protocolou ? aoProtocolar_(linha, u) : {});
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
/** 8.11: a inicial foi protocolada (o processo ganhou número). Gera sozinho o código do "Acompanhe seu processo" para o cliente
 *  que ainda não tem (precisa de CPF) e já tenta ler os andamentos no DataJud. O código volta UMA vez para a tela pôr na mensagem
 *  do WhatsApp; fica guardado embaralhado. Quem já tinha código continua com o mesmo (o painel não sabe qual é). */
function aoProtocolar_(p, u) {
  var r = { protocolado: true };
  try {
    var c = p.cliente_id ? tabela_('Clientes').linhas.filter(function (x) { return x.id === p.cliente_id; })[0] : null;
    if (c && !c.acesso_hash && String(c.cpf_cnpj || '').replace(/\D/g, '').length >= 11) {
      var g = acessoCliente_({ id: c.id, acao: 'gerar' }, u);
      r.codigo = g.codigo; r.codigo_novo = true;
    } else if (c && c.acesso_hash) r.ja_tinha_codigo = true;
    else if (c) r.sem_cpf = true;
  } catch (e) { r.erro_codigo = e.publico ? e.message : 'não consegui gerar o código agora'; }
  try { if (aliasDatajud_(p.numero)) { var a = andamentosProcesso_({ id: p.id, atualizar: true }, u); r.andamentos = (a.lista || []).length; } } catch (e2) { /* o robô lê de 4 em 4 h */ }
  return r;
}
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
  if (v.length > 49000) v = v.slice(0, 49000); // limite da célula do Google Planilhas (50 mil); antes era 5 mil e cortava observações
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
  // 8.5.0: "conclusão para julgamento", pauta, audiência "de instrução e julgamento", "a depender do julgamento" NÃO são sentença
  var semJulg = /conclus|para julgamento|pauta|diligencia|a depender|instrucao e julgamento|de julgamento \(/.test(t);
  if (/extincao da execucao|extinta a execucao|extinto o cumprimento|arquivad|arquivamento|baixa definitiva|remetidos? os autos .*arquivo/.test(t) || (/\bextint[oa]\b/.test(t) && !/execucao|cumprimento/.test(t))) return 'extinto';
  if (/juiz leigo/.test(t)) return 'sentenca';
  if (/homologa/.test(t)) return 'homologacao';
  if (/\bacordo\b/.test(t) && !/acordao/.test(t)) return 'acordo';
  if (/cumprimento de sentenca|execucao|penhora|sisbajud|bacenjud|renajud|alvara|requisicao de pequeno valor|\brpv\b|precatorio/.test(t)) return 'execucao';
  if (/\brecursos?\b|apelac|agravo|acordao|embargos de declaracao|contrarraz|remetidos? os autos .*(tribunal|instancia|turma|tst|stj)|remessa \(em grau|2o grau|\(2º grau\)/.test(t) && !/^conclus|sobrestamento|suspens|anulac/.test(t)) return 'recurso';
  if (/audiencia/.test(t) && /instrucao/.test(t) && !/realizada|cancelad/.test(t)) return 'instrucao';
  if (/(pericia|perito|pericial)/.test(t) && /(designad|nomead|agendad|marcad|data)/.test(t)) return 'pericia';
  if ((/audiencia/.test(t) && /(conciliacao|mediacao|inicial|\buna\b)/.test(t) || /cejusc/.test(t)) && /(designad|redesignad|marcad|agendad|pauta)/.test(t)) return 'conciliacao';
  if (!semJulg && /sentenca|julgad[oa] (im)?procedente|procedencia|improcedencia|julgamento/.test(t)) return 'sentenca';
  if (/distribuid|peticionamento|protocolad|\bcitacao|citad[oa]\b|mandado de citacao/.test(t)) return 'ajuizado';
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
  if (m.fase === 'extinto' && Date.parse(quando) > Date.now() - 30 * 86400000) { try { pedirAvaliacao_(proc, 'robô'); } catch (eV) { /* segue */ } }
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
  if (nomes.indexOf('backupSemanalGatilho') < 0) {
    try {
      ScriptApp.newTrigger('backupSemanalGatilho').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).inTimezone(TZ).create();
      registrar_('sistema', 'cópia semanal ligada', 'toda sexta-feira por volta das 18h (guarda 1 ano)');
    } catch (eS) { /* tenta no próximo login */ }
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
  r.semanal = config_('BACKUP_SEMANAL_ULTIMO') || ''; r.semanalErro = config_('BACKUP_SEMANAL_ERRO') || '';
  r.semanalRecente = !!r.semanal && !semanalAtrasado_();
  if (config_('PASTA_BACKUPS_SEMANAIS_ID')) r.semanalUrl = 'https://drive.google.com/drive/folders/' + config_('PASTA_BACKUPS_SEMANAIS_ID');
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
  try { if (config_('BACKUP_SEMANAL_ULTIMO') && semanalAtrasado_()) backupSemanal(); } catch (eS) { /* tenta de novo amanhã */ }
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

/* ---------- Cópia semanal (toda sexta-feira) ----------
   Além da diária (30 dias), toda sexta à tarde guarda uma cópia da semana numa pasta à parte, por 1 ano (52 semanas):
   a planilha inteira (abre no Google) e um arquivo Excel (.xlsx), que abre em qualquer computador mesmo sem o Google.
   Se a sexta falhar (Google fora do ar), a cópia diária das 3h faz a da semana no dia seguinte. */
var BACKUPS_SEMANAIS_MANTER = 52; // semanas

function pastaBackupsSemanais_() {
  var id = config_('PASTA_BACKUPS_SEMANAIS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  var pasta = pastaBackups_().createFolder('CÓPIAS SEMANAIS — SEXTA-FEIRA (guarda 1 ano)');
  setConfig_('PASTA_BACKUPS_SEMANAIS_ID', pasta.getId(), 'Pasta das cópias semanais (sexta-feira) da planilha');
  return pasta;
}

function backupSemanalGatilho() {
  try { backupSemanal(); } catch (e) {
    setConfig_('BACKUP_SEMANAL_ERRO', String(e && e.message || e).slice(0, 300), 'Erro da última cópia semanal');
    registrar_('sistema', 'cópia semanal falhou', String(e && e.message || e).slice(0, 300));
  }
}

function backupSemanal() {
  var hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var pasta = pastaBackupsSemanais_();
  var nome = 'BACKUP SEMANAL ' + hoje;
  if (pasta.getFilesByName(nome).hasNext()) return 'Já existe a cópia desta semana.';
  var id = SpreadsheetApp.getActive().getId();
  DriveApp.getFileById(id).makeCopy(nome, pasta);
  var excel = false;
  try {
    var r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) { pasta.createFile(r.getBlob().setName(nome + '.xlsx')); excel = true; }
  } catch (eX) { /* fica só a cópia do Google */ }
  var limite = Date.now() - BACKUPS_SEMANAIS_MANTER * 7 * 86400000, apagadas = 0;
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^BACKUP SEMANAL \d{4}-\d{2}-\d{2}(\.xlsx)?$/.test(f.getName()) && f.getDateCreated().getTime() < limite) { f.setTrashed(true); apagadas++; }
  }
  setConfig_('BACKUP_SEMANAL_ULTIMO', new Date().toISOString(), 'Última cópia semanal (sexta-feira) da planilha');
  setConfig_('BACKUP_SEMANAL_ERRO', '', 'Erro da última cópia semanal');
  registrar_('sistema', 'cópia semanal', nome + (excel ? ' + Excel' : '') + (apagadas ? ' (' + apagadas + ' antigas na lixeira)' : ''));
  return nome + (excel ? ' (planilha + Excel)' : '');
}

/** A cópia semanal ficou para trás (mais de 7 dias e meio)? */
function semanalAtrasado_() {
  var u = config_('BACKUP_SEMANAL_ULTIMO');
  return !u || Date.now() - Date.parse(u) > 7.5 * 86400000;
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
  try { var ex = estadoExtras_(); r.datajud = ex.datajud; r.ia = ex.ia; r.email = ex.email; r.alertas = ex.alertas; r.versao = ex.versao; r.agenda = ex.agenda; } catch (e) { /* segue */ }
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
  var ctx, erros = [], novas = 0, prazosNovos = 0, solta = false, t0Robo = Date.now();
  TRAVA_NIVEL_ = 1; // o robô já segura a trava: o que ele chama (baixa do PIX, recibo) não trava de novo
  try {
    ctx = contextoRobo_();
    try { var g = lerGmail_(ctx); novas += g.intimacoes; prazosNovos += g.prazos; setConfig_('ROBO_GMAIL_OK', new Date().toISOString(), 'Última leitura do Gmail sem erro'); }
    catch (e) { erros.push(gmailEsgotado_(e) ? 'Gmail: o Google limitou as leituras de hoje; os avisos que faltaram entram na próxima rodada' : 'Gmail: ' + (e.message || e)); }
    var djenNav = config_('DJEN_NAVEGADOR_ULTIMA');
    var navRecente = djenNav && (Date.now() - new Date(djenNav).getTime()) < 36 * 3600000;
    try { if (!ctx.gmailParcial && !navRecente) { var j = lerDjen_(ctx); novas += j.intimacoes; prazosNovos += j.prazos; } }
    catch (e2) { erros.push('DJEN pelo servidor: ' + (e2.message || e2) + ' — abra o painel no computador do escritório para ler o DJEN'); }
    try { limparAtosImpossiveis_(ctx); } catch (eLA) { erros.push('Agenda (limpeza): ' + (eLA.message || eLA)); }
    try { var ag = varrerAgenda_(ctx, 60000); if (ag.marcados) prazosNovos += ag.marcados; } catch (eA) { erros.push('Agenda: ' + (eA.message || eA)); }
    try { lembrarAudiencias_(ctx); } catch (eL) { erros.push('Lembretes de audiência: ' + (eL.message || eL)); }
    try { robosEscritorio_(ctx); } catch (eR) { erros.push('Robôs do escritório: ' + (eR.message || eR)); }
    try { sincronizarAgenda_(ctx, 45000); } catch (eS) { erros.push('Agenda do Google: ' + (eS.message || eS)); }
    definirPendentes_(ctx);
    recalcularPrazosAbertos_(ctx);
    try { ctx.intim.adiar = true; arquivarMovimentos_(ctx.intim, ctx.prazos, true); regravarMudadas_(ctx.intim); } catch (eM) { ctx.intim.adiar = false; }
    try { ctx.prazos.adiar = true; atribuirResponsaveis_(ctx.prazos, ctx.procs); regravarMudadas_(ctx.prazos); } catch (e3) { ctx.prazos.adiar = false; }
    [ctx.procs, ctx.intim, ctx.prazos].forEach(gravarLote_);
    // 8.12: as partes que não usam as listas lidas acima (prédio e PIX) rodam em trava própria; entre uma e outra a equipe consegue salvar
    TRAVA_NIVEL_ = 0; lock.releaseLock(); solta = true;
    try { comTrava_(function () { futureRobo_(); }); } catch (eF) { erros.push('Edifício Future: ' + (eF.message || eF)); }
    try { if (!ctx.gmailParcial && Date.now() - ctx.inicio < 200000) comTrava_(function () { lerPix_(Math.min(90000, 260000 - (Date.now() - ctx.inicio))); }); } catch (eX) { erros.push('Robô do PIX: ' + (eX.message || eX)); }
    try { if (!ctx.gmailParcial && Date.now() - ctx.inicio < 220000) comTrava_(function () { reprocessarPixPendentes_(30000); lerPixSaida_(30000); }); } catch (eX2) { erros.push('Robô do PIX (despesas): ' + (eX2.message || eX2)); }
    if (ctx.gmailParcial) erros.push('Gmail: leitura parcial por causa do limite de tempo do Google; o resto vem na próxima rodada (ou clique em Atualizar agora).');
    var agora = new Date();
    var resumo = 'Robô em ' + Utilities.formatDate(agora, TZ, 'dd/MM/yyyy HH:mm') + ': ' + novas +
      ' intimação(ões) nova(s), ' + prazosNovos + ' prazo(s) novo(s).' + (erros.length ? ' Avisos: ' + erros.join(' | ') : '');
    setConfig_('ROBO_ULTIMA_EXECUCAO', agora.toISOString(), 'Última vez que o robô rodou');
    setConfig_('ROBO_ULTIMO_RESULTADO', resumo, 'Resultado da última execução');
    registrar_(quem || 'robô', 'robô', resumo);
    return { resumo: resumo, intimacoes: novas, prazos: prazosNovos, erros: erros };
  } finally {
    if (!solta) { TRAVA_NIVEL_ = 0; lock.releaseLock(); }
    contarTempoRobo_(Date.now() - t0Robo);
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

/** Confere o dígito verificador do número CNJ (módulo 97). Número com dígito errado não é achado no PJe/eproc nem no DataJud. */
function cnjValido_(n) {
  var m = /^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/.exec(String(n || '').trim());
  if (!m) return false;
  var resto = 0, dig = m[1] + m[3] + m[4] + m[5] + m[6] + '00';
  for (var i = 0; i < dig.length; i++) resto = (resto * 10 + +dig[i]) % 97;
  return +m[2] === 98 - resto;
}

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

/** 8.10: "Precisa de ação agora" no topo do Início — só o que pede uma atitude, cada linha com quem cuida e a próxima ação.
    nivel: 'risco' (vermelho: prazo confirmado/calculado em risco), 'conferir' (âmbar: conferir no tribunal), 'aviso' (azul: avisar/organizar). */
function inicioAcoes_(d, u) {
  var hoje = hojeSP_(), em3 = somarDias_(hoje, 3), em7 = somarDias_(hoje, 7), itens = [];
  var procs = {}, nomes = {};
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  tabela_('Clientes').linhas.forEach(function (c) { nomes[c.id] = c.nome; });
  var usuarios = {}; usuarios_().forEach(function (x) { usuarios[x.usuario] = x.nome || x.usuario; });
  var nomeDe = function (us) { return us ? (usuarios[us] || us) : ''; };
  var cli = function (z) { var p = procs[z.processo_id] || {}; return nomes[p.cliente_id] || p.cliente_nome || 'cliente a identificar'; };
  var prazos = tabela_('Prazos').linhas, porId = {};
  prazos.forEach(function (z) {
    porId[z.id] = z;
    var fila = filaPrazo_(z); if (!fila) return;
    var base = { id: z.id, link: '#/prazo/' + z.id, fatal: z.fatal || '', quem: nomeDe(z.responsavel), quem_us: z.responsavel || '', sub: cli(z) + ' · ' + z.numero };
    if (fila === 'conferir' && /⚠ ATENÇÃO/.test(z.resumo_ia || ''))
      itens.push(Object.assign(base, { tipo: 'divergencia', nivel: 'conferir', ordem: 1, titulo: 'A IA achou outro prazo: ' + (z.descricao || 'prazo').slice(0, 90), acao: 'Abrir no tribunal, conferir os dias e confirmar a data' }));
    else if (fila === 'conferir' && (!z.fatal || z.fatal <= em3))
      itens.push(Object.assign(base, { tipo: 'provisorio', nivel: 'conferir', ordem: 2, titulo: (z.fatal ? 'Provisório vence ' + dataBR_(z.fatal) : 'Prazo sem data') + ': ' + (z.descricao || '').replace(/PROVISÓRIO:?\s*/i, '').slice(0, 80), acao: 'Conferir no tribunal hoje' }));
    else if (fila !== 'conferir' && z.fatal && z.fatal <= somarDias_(hoje, 2) && !z.responsavel)
      itens.push(Object.assign(base, { tipo: 'semresp', nivel: 'risco', ordem: 0, titulo: 'Vence ' + (z.fatal === hoje ? 'HOJE' : dataBR_(z.fatal)) + ' e ninguém assumiu: ' + (z.descricao || '').replace(/PROVISÓRIO:?\s*/i, '').slice(0, 80), acao: 'Definir quem faz ("Eu faço" / "Passar para")' }));
  });
  // intimações a fazer sem ninguém cuidando (só a conta: a lista completa fica em Intimações e prazos)
  var comTarefa = {};
  tabela_('Tarefas').linhas.forEach(function (t) { var m = /\[intim:([^\]]+)\]/.exec(t.descricao || ''); if (m && t.situacao !== 'cancelada') comTarefa[m[1]] = 1; });
  var semResp = 0, semRespRecentes = 0, limite30 = somarDias_(hoje, -30);
  tabela_('Intimacoes').linhas.forEach(function (i) {
    if (i.terminada_por) return;
    var z = porId[i.prazo_id];
    if (z && (z.situacao === 'cumprido' || z.situacao === 'cancelado')) return;
    if ((z && z.responsavel) || comTarefa[i.id]) return;
    semResp++; if (String(i.recebido_em || '').slice(0, 10) >= limite30) semRespRecentes++;
  });
  // audiências e perícias dos próximos 7 dias: sem horário ou cliente ainda não avisado
  var sec = respSecretaria_(), porNumero = {};
  Object.keys(procs).forEach(function (k) { if (procs[k].numero) porNumero[procs[k].numero] = procs[k]; });
  tabela_('Eventos').linhas.forEach(function (e) {
    if (!e.data || e.data < hoje || e.data > em7 || !/audi|per[ií]cia/i.test(e.tipo || '')) return;
    var proc = porNumero[e.numero] || null;
    var quem = nomeDe(sec), sub = (proc ? (nomes[proc.cliente_id] || proc.cliente_nome || '') + ' · ' : '') + e.numero;
    var tit = (e.tipo || 'Ato') + ' em ' + dataBR_(e.data) + (e.hora ? ' às ' + e.hora : '');
    if (!e.hora) itens.push({ tipo: 'semhora', nivel: 'aviso', ordem: 3, titulo: tit + ' — sem horário', sub: sub, quem: quem, quem_us: sec || '', acao: 'Abrir o processo e lançar o horário na agenda', link: '#/agenda?visao=dia&data=' + e.data, fatal: e.data });
    else if (!e.avisado_em) itens.push({ tipo: 'aviso', nivel: 'aviso', ordem: 4, titulo: tit + ' — cliente ainda não avisado', sub: sub, quem: quem, quem_us: sec || '', acao: 'Avisar o cliente no WhatsApp (Início › Próximos 7 dias)', link: '#/agenda?visao=dia&data=' + e.data, fatal: e.data });
  });
  itens.sort(function (a, b) { return (a.ordem - b.ordem) || ((a.fatal || '9') < (b.fatal || '9') ? -1 : (a.fatal || '9') > (b.fatal || '9') ? 1 : 0); });
  return { itens: itens.slice(0, 40), total: itens.length, intimSemResp: semResp, intimSemRespRecentes: semRespRecentes };
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
  x.fila = filaPrazo_(z);
  x.divergencia = SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && z.situacao !== 'conferido' && /⚠ ATENÇÃO/.test(z.resumo_ia || '');
  return x;
}
/** 8.10: fila do prazo — 'conferir' (provisório, a definir ou IA divergente: abrir no tribunal), 'calculado' (robô calculou, falta
    confirmar a data), 'confirmado' (alguém conferiu). Fechados = ''. */
function filaPrazo_(z) {
  if (SITUACOES_ABERTAS.indexOf(z.situacao) < 0) return '';
  if (z.situacao === 'conferido') return 'confirmado';
  if (z.situacao === 'a definir' || /PROVISÓRIO/i.test(z.descricao || '') || /⚠ ATENÇÃO/.test(z.resumo_ia || '')) return 'conferir';
  return 'calculado';
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
    var fonte = String(d.fonte || '').trim().slice(0, 160);
    if (filaPrazo_(z) === 'conferir' && !fonte) throw falha_('Diga onde conferiu (sistema do tribunal, DJEN…) antes de confirmar um prazo provisório ou com divergência.');
    atualizarLinha_(tab, z, { situacao: 'conferido', conferido_por: u.nome || u.usuario, conferido_em: new Date().toISOString(), conferido_fonte: fonte,
      atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    registrar_(u.usuario, 'prazo conferido', z.id + ' ' + z.numero + ' fatal ' + z.fatal + (fonte ? ' · fonte: ' + fonte : ''));
    return { ok: true };
  });
}

function mudarSituacaoPrazo_(d, u) {
  return comTrava_(function () {
    var nova = { cumprido: 'cumprido', cancelado: 'cancelado', reabrir: 'calculado', semprazo: 'cancelado' }[d.situacao];
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
    if (d.situacao === 'semprazo') { // 8.6.0: "Não há prazo" — conferido por alguém da equipe; a intimação também sai das abertas
      atualizarLinha_(tab, z, { observacoes: (z.observacoes || '') + ' | sem prazo para o escritório (conferido por ' + (u.nome || u.usuario) + ' em ' + dataBR_(hojeSP_()) + ')' });
      var tabI = tabela_('Intimacoes');
      intimacoesDoPrazo_(tabI, z).forEach(function (i) { if (!i.terminada_por) atualizarLinha_(tabI, i, { terminada_por: u.nome || u.usuario, terminada_em: agoraIso, ok_por: 'sem prazo', ok_em: agoraIso }); });
    }
    registrar_(u.usuario, d.situacao === 'semprazo' ? 'prazo conferido: sem prazo' : 'prazo ' + nova, z.id + ' ' + z.numero);
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

/** 8.11.2: RENEGOCIAR — junta o que falta pagar do honorário (parcelas em aberto + o resto das pagas em parte) e divide em novas
 *  parcelas. As abertas antigas saem; a paga em parte fica com o valor que foi pago. Pode somar juros/multa combinados (acrescimo). */
function renegociarHonorario_(d, u) {
  return comTrava_(function () {
    var tabH = tabela_('Honorarios'), h = tabH.linhas.filter(function (x) { return x.id === d.honorario_id; })[0];
    if (!h) throw falha_('Honorário não encontrado.');
    var n = parseInt(d.parcelas, 10); if (!(n >= 1 && n <= 120)) throw falha_('Informe em quantas parcelas.');
    var venc = /^\d{4}-\d{2}-\d{2}$/.test(d.primeiro_vencimento || '') ? d.primeiro_vencimento : '';
    if (!venc) throw falha_('Informe o vencimento da 1ª parcela nova.');
    var tabP = tabela_('Parcelas'), agora = new Date().toISOString(), saldo = 0, saem = [], parciais = 0;
    tabP.linhas.filter(function (p) { return p.honorario_id === h.id; }).forEach(function (p) {
      var v = dinheiro_(p.valor), pg = dinheiro_(p.valor_pago);
      if (!p.pago_em) { saldo += v; saem.push(p); }
      else if (pg && pg < v) { saldo += v - pg; parciais++; atualizarLinha_(tabP, p, { valor: txtDinheiro_(pg), observacoes: (p.observacoes ? p.observacoes + ' ' : '') + 'Resto (' + reaisTxt_(v - pg) + ') foi para a renegociação de ' + dataBR_(hojeSP_()) + '.', atualizado_em: agora, atualizado_por: u.usuario }); }
    });
    saldo = Math.round((saldo + (dinheiro_(d.acrescimo) || 0) - (dinheiro_(d.desconto) || 0)) * 100) / 100;
    if (!(saldo > 0)) throw falha_('Não há valor em aberto para renegociar.');
    saem.forEach(function (p) { apagarLinha_(tabP, p); });
    var ult = tabP.linhas.filter(function (p) { return p.honorario_id === h.id; }).reduce(function (m, p) { return Math.max(m, parseInt(p.numero, 10) || 0); }, 0);
    var base = Math.floor(saldo / n * 100) / 100, dia = Math.min(31, parseInt(d.dia_demais, 10) || +venc.slice(8, 10));
    for (var i = 1; i <= n; i++) {
      var valor = i === n ? Math.round((saldo - base * (n - 1)) * 100) / 100 : base;
      var nova = novaParcela_(h, ult + i, venc, valor, u.usuario); nova.observacoes = 'Renegociação de ' + dataBR_(hojeSP_());
      inserirLinha_(tabP, nova); venc = mesSeguinte_(venc, dia);
    }
    atualizarLinha_(tabH, h, { observacoes: (h.observacoes ? h.observacoes + ' | ' : '') + 'Renegociado em ' + dataBR_(hojeSP_()) + ' por ' + (u.nome || u.usuario) + ': ' + reaisTxt_(saldo) + ' em ' + n + 'x' + (d.motivo ? ' (' + String(d.motivo).slice(0, 200) + ')' : ''), atualizado_em: agora, atualizado_por: u.usuario });
    registrar_(u.usuario, 'honorário renegociado', h.id + ' ' + reaisTxt_(saldo) + ' em ' + n + 'x');
    return { ok: true, saldo: saldo, parcelas: n, removidas: saem.length, parciais: parciais };
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
    try { res.recibo = reciboDaParcela_(res, u); guardarRecibo_(d.id, res.recibo.pdf || res.recibo.doc); } catch (e) { res.recibo_erro = String(e.message || e); }
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
    try { fecharValoresLancados_(h, u); } catch (eF) { /* segue */ }
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
  var ehPericia = /pericia|perito/.test(t) && /(designad|designo|marcad|agendad|realizar|realizacao|comparecer|data|dia|local)/.test(t);
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
  // 8.6.0: números de processo ("…2026.5.12.0041") e de documentos não são data (o robô tinha lido 05/12/2041)
  var trecho = t.slice(Math.max(0, pos), pos + 600).replace(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g, ' [processo] ');
  var hoje = hojeSP_(), achada = null, anoMax = +hoje.slice(0, 4) + 3;
  var re = /(?<![\d.\/-])(\d{1,2})\s*(?:\/|\.|-)\s*(\d{1,2})\s*(?:\/|\.|-)\s*(\d{4}|\d{2})(?!\d)|(\d{1,2})(?:º|o)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/g, m;
  while ((m = re.exec(trecho))) {
    var dia = +(m[1] || m[4]), mes = m[2] ? +m[2] : MESES_ATO[m[5]], ano = +(m[3] || m[6]);
    if (ano < 100) ano += 2000;
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= anoMax)) continue;
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
  // 8.6.0: confere também a data ORIGINAL guardada na chave ("ato|nº|tipo|data|hora"): se alguém mudou o dia no Google Agenda,
  // o robô não marca de novo a data antiga (era o que criava dezenas de cópias).
  return ctx.eventos.linhas.some(function (e) {
    var dataChave = String(e.chave || '').split('|')[3] || '';
    return e.numero === numero && (e.data === data || dataChave === data) && (/per[ií]cia/.test(e.tipo) === !!ehPericia);
  });
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
  if (parecidos.length === 1) return { cliente: parecidos[0], certeza: false };
  // o banco às vezes encurta o nome do meio ("Ana P Souza"): primeiro e último nome iguais
  var pal2 = pal.filter(function (w) { return w.length > 1; });
  if (pal2.length >= 2) {
    var pe = clientes.filter(function (c) { var cn = nomeComparavel_(c.nome).split(' '); return cn.length >= 2 && cn[0] === pal2[0] && cn[cn.length - 1] === pal2[pal2.length - 1]; });
    if (pe.length === 1) return { cliente: pe[0], certeza: false };
  }
  return null;
}

/** Sobrenome em comum (pai, mãe, cônjuge pagando pelo cliente). Ignora sobrenomes muito comuns sozinhos. */
function sobrenomeComum_(a, b) {
  var comuns = ['silva', 'santos', 'souza', 'oliveira', 'pereira', 'lima', 'costa', 'ferreira', 'rodrigues', 'almeida', 'alves', 'nascimento', 'carvalho', 'araujo', 'ribeiro'];
  var x = nomeComparavel_(a).split(' ').slice(1), y = nomeComparavel_(b).split(' ').slice(1);
  var iguais = x.filter(function (w) { return w.length > 2 && y.indexOf(w) >= 0; });
  return iguais.filter(function (w) { return comuns.indexOf(w) < 0; }).length >= 1 || iguais.length >= 2;
}

/** PIX sem cliente pelo nome: procura a ÚNICA parcela em aberto (de qualquer cliente) com o mesmo valor e vencimento perto do dia do PIX. */
function parcelaPeloValorEData_(tabParc, valor, diaPix, pagasPeloPix) {
  var v = Math.round(valor * 100);
  var c = tabParc.linhas.filter(function (p) {
    return !p.pago_em && !pagasPeloPix[p.id] && p.vencimento && Math.round(dinheiro_(p.valor) * 100) === v &&
      p.vencimento >= somarDias_(diaPix, -10) && p.vencimento <= somarDias_(diaPix, 5);
  });
  return c.length === 1 ? c[0] : null;
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
  var k = { clientes: clientes, tabParc: tabParc, apelidos: apelidos, pagasPeloPix: pagasPeloPix, tol: tol, categorias: categoriasPix_(tabPix) };
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
    if (classificarPix_(linha, dados, quando, k)) r.baixados++; else r.conferir++;
    inserirLinha_(tabPix, linha);
  }
  if (ate > desde) setConfig_('PIX_GMAIL_DESDE', String(ate - 60000), 'Até onde o robô do PIX já leu o Gmail');
  setConfig_('PIX_ULTIMA', new Date().toISOString() + ' · ' + r.lidos + ' PIX lido(s), ' + r.baixados + ' baixa(s), ' + r.conferir + ' a conferir', 'Última leitura do robô do PIX');
  if (r.lidos) registrar_('robô', 'robô do PIX', r.lidos + ' lido(s), ' + r.baixados + ' baixa(s) automática(s), ' + r.conferir + ' a conferir');
  return r;
}


/**
 * Decide o que fazer com um PIX recebido (novo ou ainda "a conferir"). Devolve true se deu baixa.
 * 8.7.0: nome com 2 partes iguais (primeiro nome + outro), parcela ANTERIOR à importação (o GEA só trouxe as próximas: o PIX do
 * mês passado do mesmo valor vira uma parcela paga "avulsa"), e "não é honorário" aprendido pelo pagador (categoria).
 */
function classificarPix_(linha, dados, quando, k) {
  var baixou = false;
  var catAntes = k.categorias[nomeComparavel_(dados.pagador)];
  if (catAntes) { linha.situacao = 'ignorado'; linha.categoria = catAntes; linha.motivo = 'Não é honorário (' + catAntes + '): o mesmo pagador já foi marcado assim antes.'; return false; }
    var achou = clienteDoPagador_(dados.pagador, k.clientes) || clientePor2Nomes_(dados.pagador, k.clientes);
    if (!achou || !achou.certeza) { // já pagou antes por este cliente (baixa feita à mão uma vez) → reconhece
      var cidA = k.apelidos[nomeComparavel_(dados.pagador)];
      var cA = cidA && k.clientes.filter(function (c) { return c.id === cidA; })[0];
      if (cA) achou = { cliente: cA, certeza: true, apelido: true };
    }
    var diaPix0 = diaSP_(quando);
    if (!achou) {
      // sem cliente pelo nome: cruza VALOR + DATA (a única parcela aberta com esse valor vencendo perto do dia do PIX)
      var porValor = parcelaPeloValorEData_(k.tabParc, dados.valor, diaPix0, k.pagasPeloPix);
      var cliV = porValor && k.clientes.filter(function (c) { return c.id === porValor.cliente_id; })[0];
      if (cliV && sobrenomeComum_(dados.pagador, cliV.nome)) {
        achou = { cliente: cliV, certeza: true, familia: true }; // mesmo sobrenome + valor e data batendo: é da família pagando
      } else {
        if (cliV) { linha.cliente_id = cliV.id; linha.sugestao = porValor.id; linha.motivo = 'Provável: ' + cliV.nome + ' — ' + (porValor.numero ? porValor.numero + 'ª parcela' : 'parcela') + ' de mesmo valor vencendo em ' + dataBR_(porValor.vencimento) + '. Confira e confirme.'; }
        else linha.motivo = 'Nenhum cliente com este nome nem parcela de mesmo valor vencendo nestes dias (pode ser outro recebimento). Ao dar baixa à mão, o robô aprende para a próxima vez.';
        return false;
      }
    }
    linha.cliente_id = achou.cliente.id;
    var abertas = parcelasAbertasDe_(achou.cliente.id, k.tabParc);
    var diaPix = diaSP_(quando);
    var plano = planoDeBaixa_(abertas, dados.valor, diaPix, k.tol);
    // esse pagamento já foi lançado à mão? (parcela igual paga perto da data do PIX) → não baixa outra
    var jaLancado = k.tabParc.linhas.some(function (p) { return p.cliente_id === achou.cliente.id && p.pago_em && !k.pagasPeloPix[p.id] && Math.abs(dinheiro_(p.valor_pago || p.valor) - dados.valor) < 0.01 && Math.abs(diffDias_(p.pago_em, diaPix)) <= 7; });
    if (!achou.certeza && plano && plano.tipo === 'igual' && plano.itens[0].p.vencimento && Math.abs(diffDias_(plano.itens[0].p.vencimento, diaPix)) <= 20) achou.certeza = true; // nome parecido + valor + data
    if (!achou.certeza) { linha.motivo = 'Nome parecido com o do cliente (' + achou.cliente.nome + '): confira. Ao dar baixa, o robô aprende.'; if (plano && plano.itens.length === 1) linha.sugestao = plano.itens[0].p.id; }
    else if (!abertas.length) linha.motivo = 'O cliente não tem parcela em aberto.';
    else if (jaLancado) linha.motivo = 'Parece já lançado: há uma parcela de mesmo valor paga perto desta data. Confira antes de dar baixa.';
    else if (!plano) linha.motivo = 'O valor não bate com nenhuma parcela (nem soma de parcelas, nem parcela vencida com até ' + k.tol + '% de juros). Pode ter pago parte ou adiantado.';
    if (achou.certeza && plano && !jaLancado) {
      try {
        var ids = [], recibos = [];
        plano.itens.forEach(function (it) {
          var res = pagarParcela_({ id: it.p.id, data: diaPix, valor: txtDinheiro_(it.valor), forma: 'PIX (Inter)' }, U_ROBO_PIX);
          ids.push(it.p.id); if (res.recibo && res.recibo.pdf) recibos.push(res.recibo.pdf);
        });
        linha.situacao = 'baixado'; linha.parcela_id = ids.join(','); linha.recibo = recibos.join(' ');
        ids.forEach(function (id) { k.pagasPeloPix[id] = 1; });
        linha.motivo = (achou.apelido ? 'Pagador já conhecido deste cliente. ' : achou.familia ? 'Pago por familiar (mesmo sobrenome, valor e data batendo). ' : '') +
          (plano.tipo === 'soma' ? 'Baixa automática de ' + ids.length + ' parcelas (o PIX é a soma delas).'
            : plano.tipo === 'juros' ? 'Baixa automática da parcela vencida, paga com ' + reaisTxt_(dados.valor - dinheiro_(plano.itens[0].p.valor)) + ' a mais (multa/juros).'
            : 'Baixa automática' + (plano.iguais > 1 ? ' na parcela mais antiga (havia ' + plano.iguais + ' do mesmo valor)' : '') + '.');
        k.tabParc = tabela_('Parcelas'); baixou = true;
      } catch (eP) { linha.motivo = 'Não consegui dar baixa: ' + (eP.message || eP); }
    }
    if (!baixou && achou && linha.situacao !== 'baixado') {
      var av = parcelaAnteriorImportacao_(achou.cliente.id, dados.valor, diaSP_(quando), k);
      if (av) { linha.situacao = 'baixado'; linha.parcela_id = av.id; linha.cliente_id = achou.cliente.id; baixou = true;
        linha.motivo = 'Honorário de ' + achou.cliente.nome + ' de um mês anterior à importação (o painel só tinha as próximas parcelas): lançado como parcela paga em ' + dataBR_(diaSP_(quando)) + '.'; }
    }
    return baixou;
}

/** Cliente pelo pagador: primeiro nome igual + mais uma parte do nome igual (sobrenome), e só um cliente assim. */
function clientePor2Nomes_(pagador, clientes) {
  var p = nomeComparavel_(pagador).split(' ').filter(function (w) { return w.length > 1; });
  if (p.length < 2) return null;
  var c = clientes.filter(function (x) { var n = nomeComparavel_(x.nome).split(' '); return n[0] === p[0] && p.slice(1).some(function (w) { return w.length > 2 && n.indexOf(w) >= 0; }); });
  return c.length === 1 ? { cliente: c[0], certeza: false, dois: true } : null;
}

/**
 * PIX de um cliente com o MESMO valor das parcelas dele, mas a parcela em aberto desse valor só vence bem depois (> 20 dias):
 * é a parcela do mês anterior que não veio na importação. Lança uma parcela paga "avulsa" no honorário (sem recibo novo).
 */
function parcelaAnteriorImportacao_(clienteId, valor, dia, k) {
  var v = Math.round(valor * 100);
  var doCli = k.tabParc.linhas.filter(function (q) { return q.cliente_id === clienteId; });
  var mesmas = doCli.filter(function (q) { return Math.round(dinheiro_(q.valor) * 100) === v; });
  if (!mesmas.length) return null;
  if (mesmas.some(function (q) { return !q.pago_em && q.vencimento && q.vencimento <= somarDias_(dia, 20); })) return null; // há parcela perto: é a baixa normal
  if (doCli.some(function (q) { return q.pago_em && Math.abs(diffDias_(q.pago_em, dia)) <= 10 && Math.round(dinheiro_(q.valor_pago || q.valor) * 100) === v; })) return null; // já lançado
  var hon = mesmas[0].honorario_id, agora = new Date().toISOString();
  var nova = { id: novoId_('Q'), honorario_id: hon, cliente_id: clienteId, numero: 'avulsa', vencimento: dia, valor: txtDinheiro_(valor), pago_em: dia, valor_pago: txtDinheiro_(valor),
    forma: 'PIX (Inter)', cobranca: '', mensagem_em: '', acao_processo_id: '', observacoes: 'Parcela paga antes da importação do GEA (PIX de ' + dataBR_(dia) + ').', criado_em: agora, atualizado_em: agora, atualizado_por: 'robô do PIX' };
  inserirLinha_(k.tabParc, nova);
  k.pagasPeloPix[nova.id] = 1;
  return nova;
}

/** "Não é honorário" já marcado antes, por pagador (com a categoria escolhida). */
function categoriasPix_(tabPix) {
  var m = {};
  tabPix.linhas.forEach(function (x) { if (x.situacao === 'ignorado' && x.categoria) m[nomeComparavel_(x.pagador)] = x.categoria; });
  return m;
}

/** Robô: confere de novo os PIX "a conferir" com as regras atuais (roda em toda rodada e no botão "Conferir de novo"). */
function reprocessarPixPendentes_(limiteMs) {
  var t0 = Date.now(), tabPix = tabela_('Pix'), r = { baixados: 0, ignorados: 0 };
  var pend = tabPix.linhas.filter(function (x) { return x.situacao === 'a conferir' && x.valor; });
  if (!pend.length) return r;
  var pagasPeloPix = {};
  tabPix.linhas.forEach(function (x) { String(x.parcela_id || '').split(',').forEach(function (id) { if (id) pagasPeloPix[id] = 1; }); });
  var tolCfg = config_('PIX_TOLERANCIA_JUROS');
  var k = { clientes: tabela_('Clientes').linhas, tabParc: tabela_('Parcelas'), apelidos: apelidosPix_(tabPix), pagasPeloPix: pagasPeloPix,
    tol: tolCfg === '' || tolCfg == null ? 10 : Math.max(0, Math.min(30, parseFloat(String(tolCfg).replace(',', '.')) || 0)), categorias: categoriasPix_(tabPix) };
  pend.forEach(function (x) {
    if (Date.now() - t0 > (limiteMs || 60000)) return;
    var linha = { situacao: 'a conferir', cliente_id: '', parcela_id: '', motivo: '', sugestao: '', recibo: '', categoria: '' };
    var ok = classificarPix_(linha, { valor: dinheiro_(x.valor), pagador: x.pagador }, x.recebido_em, k);
    if (linha.situacao === 'a conferir' && linha.motivo === x.motivo) return;
    linha.atualizado_em = new Date().toISOString(); linha.atualizado_por = 'robô';
    atualizarLinha_(tabPix, x, linha);
    if (ok) r.baixados++; else if (linha.situacao === 'ignorado') r.ignorados++;
  });
  if (r.baixados || r.ignorados) registrar_('robô', 'robô do PIX', 'conferiu de novo: ' + r.baixados + ' baixa(s), ' + r.ignorados + ' "não é honorário"');
  return r;
}

/* ---------- PIX ENVIADOS (8.7.0): cada "Pagamento Pix realizado" do Inter vira despesa paga no Financeiro ---------- */
var BUSCA_PIX_SAIDA = 'from:no-reply@inter.co subject:("Pagamento Pix realizado")';
function lerEmailPixSaida_(corpo) {
  var t = String(corpo || '').replace(/\s+/g, ' ');
  var m = /no valor de R\$\s*([\d.]+,\d{2})\. Os dados de destino s[aã]o: Banco: (.+?) Nome: (.+?) CPF\/CNPJ/i.exec(t);
  if (!m) return null;
  var d = /Data: (\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return { valor: dinheiro_(m[1]), banco: m[2].trim().slice(0, 60), nome: m[3].trim().slice(0, 100), dia: d ? d[3] + '-' + d[2] + '-' + d[1] : '' };
}
function lerPixSaida_(limiteMs) {
  var t0 = Date.now(), desde = parseInt(config_('PIX_SAIDA_DESDE'), 10) || (Date.now() - 60 * 86400000);
  var threads;
  try { threads = GmailApp.search(BUSCA_PIX_SAIDA + ' after:' + Math.floor(desde / 1000), 0, 100); }
  catch (e) { if (gmailEsgotado_(e)) return { lidos: 0 }; throw e; }
  var tab = tabela_('Despesas'), ja = {}, catPorNome = {};
  tab.linhas.forEach(function (x) {
    var m = /\[pix:([^\]]+)\]/.exec(x.observacoes || ''); if (m) ja[m[1]] = 1;
    var n = /^PIX para (.+)$/.exec(x.descricao || ''); if (n && x.categoria && x.categoria !== 'A classificar') catPorNome[nomeComparavel_(n[1])] = x.categoria;
  });
  var msgs = [];
  threads.forEach(function (th) { th.getMessages().forEach(function (m) { if (m.getDate().getTime() > desde && !ja[m.getId()] && /Pix realizado/i.test(m.getSubject())) msgs.push(m); }); });
  msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
  var r = { lidos: 0, novas: 0, quitadas: 0 }, ate = desde;
  for (var i = 0; i < msgs.length; i++) {
    if (Date.now() - t0 > (limiteMs || 60000)) break;
    var m = msgs[i], dd = lerEmailPixSaida_(m.getPlainBody());
    ate = Math.max(ate, m.getDate().getTime()); r.lidos++;
    if (!dd) continue;
    var dia = dd.dia || diaSP_(m.getDate().toISOString()), agora = new Date().toISOString(), marca = '[pix:' + m.getId() + ']';
    // despesa fixa já prevista (mesmo valor, ±10 dias, ainda não paga) → só dá baixa nela
    var prev = tab.linhas.filter(function (x) { return !x.pago_em && x.situacao !== 'cancelada' && Math.abs(dinheiro_(x.valor) - dd.valor) < 0.01 && x.vencimento && Math.abs(diffDias_(x.vencimento, dia)) <= 10; })[0];
    if (prev) {
      atualizarLinha_(tab, prev, { pago_em: dia, valor_pago: txtDinheiro_(dd.valor), forma: 'PIX (Inter)', observacoes: ((prev.observacoes || '') + ' Pago por PIX para ' + dd.nome + '. ' + marca).trim(), atualizado_em: agora, atualizado_por: 'robô do PIX' });
      r.quitadas++; continue;
    }
    inserirLinha_(tab, { id: novoId_('D'), descricao: 'PIX para ' + dd.nome, categoria: catPorNome[nomeComparavel_(dd.nome)] || 'A classificar', valor: txtDinheiro_(dd.valor), vencimento: dia,
      pago_em: dia, valor_pago: txtDinheiro_(dd.valor), forma: 'PIX (Inter)', cliente_id: '', processo_id: '', reembolsavel: 'nao', reembolsado_em: '', recorrente: '', serie_id: '',
      situacao: 'ativa', observacoes: 'Lançado pelo robô do PIX (banco ' + dd.banco + '). ' + marca, criado_em: agora, atualizado_em: agora, atualizado_por: 'robô do PIX' });
    r.novas++;
  }
  if (ate > desde) setConfig_('PIX_SAIDA_DESDE', String(ate - 60000), 'Até onde o robô leu os PIX enviados (despesas)');
  if (r.novas || r.quitadas) registrar_('robô', 'robô do PIX', 'PIX enviados: ' + r.novas + ' despesa(s) nova(s), ' + r.quitadas + ' despesa(s) prevista(s) paga(s)');
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

function lerPixAgora_() { return comTrava_(function () { var r = lerPix_(90000); var r2 = reprocessarPixPendentes_(60000); var r3 = lerPixSaida_(60000); r.baixados += r2.baixados; r.despesas = r3.novas + r3.quitadas; return r; }); }

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
      var sg = x.situacao === 'a conferir' && parc[x.sugestao];
      if (sg) o.sugestao = { id: sg.id, numero: sg.numero, vencimento: sg.vencimento, valor: sg.valor, cliente: (clientes[sg.cliente_id] || {}).nome || '' };
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
    var cat = String(d.categoria || 'Outro').slice(0, 60);
    atualizarLinha_(tab, x, { situacao: d.voltar ? 'a conferir' : 'ignorado', categoria: d.voltar ? '' : cat, motivo: d.voltar ? x.motivo : 'Não é honorário — ' + cat + ' (marcado por ' + (u.nome || u.usuario) + '). PIX deste pagador vão direto para cá.', atualizado_em: new Date().toISOString(), atualizado_por: u.usuario });
    return { ok: true };
  });
}

/* ---------- Robô da Agenda: painel e Google Agenda sempre ligados ---------- */

/** Agenda do Google só dos prazos fatais (aparece no celular). Criada uma vez; o id fica no Config. */
function agendaPrazos_() {
  var id = config_('AGENDA_PRAZOS'), cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.getCalendarsByName('PRAZOS FATAIS')[0];
    if (!cal) { try { cal = CalendarApp.createCalendar('PRAZOS FATAIS', { color: CalendarApp.Color.RED }); } catch (e) { cal = CalendarApp.createCalendar('PRAZOS FATAIS'); } }
    setConfig_('AGENDA_PRAZOS', cal.getId(), 'Agenda do Google com os prazos fatais (robô da Agenda)');
    cal = CalendarApp.getCalendarById(cal.getId()) || cal;
  }
  return cal;
}

/**
 * Toda rodada do robô:
 * 1) prazos abertos com data fatal (de hoje até 90 dias) ficam como evento de dia inteiro na agenda "PRAZOS FATAIS";
 *    mudou a data → move o evento; cumprido/cancelado → apaga o evento;
 * 2) audiência/perícia que alguém mudou de dia ou hora no Google Agenda → atualiza o painel (lembrete, processo, Eventos);
 *    evento apagado no Google → o lembrete do ato é cancelado (dá para reabrir).
 */
function sincronizarAgenda_(ctx, limiteMs) {
  var t0 = Date.now(), hoje = hojeSP_(), ate = somarDias_(hoje, 90), r = { criados: 0, movidos: 0, apagados: 0, atos: 0 };
  var cal = agendaPrazos_();
  var procs = {}, clis = {};
  ctx.procs.linhas.forEach(function (p) { procs[p.id] = p; });
  ctx.clientes.linhas.forEach(function (c) { clis[c.id] = c.nome; });
  ctx.prazos.linhas.forEach(function (z) {
    if (Date.now() - t0 > (limiteMs || 45000)) return;
    if (/^ato:/.test(z.observacoes || '')) return; // audiência/perícia já está na agenda própria
    var aberto = SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 && z.fatal && z.fatal >= hoje && z.fatal <= ate;
    try {
      if (!aberto) {
        if (z.agenda_id) { var ev0 = cal.getEventById(z.agenda_id); if (ev0) ev0.deleteEvent(); atualizarLinha_(ctx.prazos, z, { agenda_id: '', agenda_data: '' }); r.apagados++; }
        return;
      }
      var p = procs[z.processo_id] || {}, cli = clis[p.cliente_id] || (p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '';
      // 8.10: provisório / divergente = "⚠ CONFERIR" em amarelo; confirmado ou calculado = "⏱" em vermelho (marca "|c" em agenda_data)
      var conferir = filaPrazo_(z) === 'conferir', chave = z.fatal + (conferir ? '|c' : '');
      var titulo = (conferir ? '⚠ CONFERIR NO TRIBUNAL — ' : '⏱ ') + String(z.descricao || 'Prazo').replace(/PROVISÓRIO:?\s*/i, '').slice(0, 70) + (cli ? ' — ' + cli : '') + ' — ' + z.numero;
      var cor = function (e) { try { e.setColor(conferir ? CalendarApp.EventColor.YELLOW : CalendarApp.EventColor.RED); } catch (er) { /* sem cor */ } };
      var dia = new Date(z.fatal + 'T12:00:00-03:00');
      if (z.agenda_id) {
        var ev = cal.getEventById(z.agenda_id);
        if (ev && z.agenda_data === chave) return;
        if (ev) { ev.setAllDayDate(dia); ev.setTitle(titulo); cor(ev); atualizarLinha_(ctx.prazos, z, { agenda_data: chave }); r.movidos++; return; }
      }
      var novo = cal.createAllDayEvent(titulo, dia, { description: (conferir ? 'PRAZO PROVISÓRIO: abra o processo no tribunal, confira o ato e confirme no painel (Intimações e prazos › Conferir no tribunal). ' : 'Prazo fatal lançado pelo painel. ') + 'Responsável: ' + (z.responsavel || '—') + '. Ao cumprir no painel, este evento some sozinho.' });
      cor(novo);
      atualizarLinha_(ctx.prazos, z, { agenda_id: novo.getId(), agenda_data: chave }); r.criados++;
    } catch (e) { /* um evento com problema não para os outros */ }
  });
  // audiências e perícias mudadas no Google Agenda voltam para o painel
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  var ids = {};
  try { ids = agendas_(); } catch (e) { ids = {}; }
  ctx.eventos.linhas.forEach(function (e) {
    if (Date.now() - t0 > (limiteMs || 45000)) return;
    if (!e.evento_id || /^(erro|apagado)/.test(e.evento_id) || !e.data || e.data < somarDias_(hoje, -1)) return;
    try {
      var c = ids[e.agenda] && CalendarApp.getCalendarById(ids[e.agenda]);
      if (!c) return;
      var ev = c.getEventById(e.evento_id);
      var z = e.prazo_id ? ctx.prazos.linhas.filter(function (x) { return x.id === e.prazo_id; })[0] : null;
      if (!ev) { // apagado no Google: cancela o lembrete do ato
        if (z && SITUACOES_ABERTAS.indexOf(z.situacao) >= 0) atualizarLinha_(ctx.prazos, z, { situacao: 'cancelado', observacoes: (z.observacoes || '') + ' | evento apagado no Google Agenda em ' + dataBR_(hoje), atualizado_em: new Date().toISOString(), atualizado_por: 'robô' });
        atualizarLinha_(ctx.eventos, e, { evento_id: 'apagado no Google' }); r.atos++;
        return;
      }
      var ini = ev.getStartTime(), data = diaDoEvento_(ev, c), hora = ev.isAllDayEvent() ? '' : Utilities.formatDate(ini, TZ, 'HH:mm');
      if (data === e.data && (hora === (e.hora || '') || (!e.hora && ev.isAllDayEvent()))) return;
      atualizarLinha_(ctx.eventos, e, { data: data, hora: hora });
      if (z) atualizarLinha_(ctx.prazos, z, { fatal: data, descricao: String(z.descricao || '').replace(/\d{2}\/\d{2}\/\d{4}( às \d{2}:\d{2})?/, dataBR_(data) + (hora ? ' às ' + hora : '')),
        observacoes: (z.observacoes || '') + ' | data mudada no Google Agenda', atualizado_em: new Date().toISOString(), atualizado_por: 'robô' });
      var p2 = ctx.porNumero && ctx.porNumero[e.numero];
      if (p2 && (!p2.proximo_ato_data || p2.proximo_ato_data === e.data || p2.proximo_ato_data < hoje)) atualizarLinha_(ctx.procs, p2, { proximo_ato_data: data, proximo_ato: (e.tipo.charAt(0).toUpperCase() + e.tipo.slice(1)) + (hora ? ' ' + hora : '') });
      r.atos++;
    } catch (e2) { /* segue */ }
  });
  if (r.criados || r.movidos || r.apagados || r.atos) registrar_('robô', 'agenda do Google', JSON.stringify(r));
  setConfig_('AGENDA_SINC', new Date().toISOString() + ' · ' + r.criados + ' prazo(s) novo(s), ' + r.movidos + ' movido(s), ' + r.apagados + ' tirado(s), ' + r.atos + ' audiência(s) atualizada(s)', 'Última sincronização com o Google Agenda');
  return r;
}

/**
 * 8.6.0, uma vez (Config FIX_ATOS_86): apaga as audiências/perícias com ano impossível (o robô leu "5.12.0041" de um número de
 * processo como 05/12/2041 e, com o dia mudando no Google Agenda, recriou a cada hora). Tira o evento do Google e cancela o lembrete.
 */
function limparAtosImpossiveis_(ctx) {
  if (config_('FIX_ATOS_86')) return 0;
  var anoMax = +hojeSP_().slice(0, 4) + 3, ids = {}, n = 0, agora = new Date().toISOString();
  try { ids = agendas_(); } catch (e) { ids = {}; }
  ctx.eventos = ctx.eventos || tabela_('Eventos');
  var prazosPorId = {};
  ctx.prazos.linhas.forEach(function (z) { prazosPorId[z.id] = z; });
  ctx.eventos.linhas.forEach(function (e) {
    var dataChave = String(e.chave || '').split('|')[3] || '';
    if (+String(e.data || '').slice(0, 4) <= anoMax && +dataChave.slice(0, 4) <= anoMax) return;
    if (e.evento_id && !/^(erro|apagado)/.test(e.evento_id)) {
      try { var cal = ids[e.agenda] && CalendarApp.getCalendarById(ids[e.agenda]); var ev = cal && cal.getEventById(e.evento_id); if (ev) ev.deleteEvent(); } catch (eC) { /* segue */ }
    }
    atualizarLinha_(ctx.eventos, e, { evento_id: 'apagado (data impossível)', data: '' });
    var z = prazosPorId[e.prazo_id];
    if (z && SITUACOES_ABERTAS.indexOf(z.situacao) >= 0) atualizarLinha_(ctx.prazos, z, { situacao: 'cancelado', observacoes: (z.observacoes || '') + ' | cancelado: data lida errada (número de processo)', atualizado_em: agora, atualizado_por: 'robô' });
    n++;
  });
  ctx.prazos.linhas.forEach(function (z) {
    if (/^ato:/.test(z.observacoes || '') && +String(z.fatal || '').slice(0, 4) > anoMax && SITUACOES_ABERTAS.indexOf(z.situacao) >= 0) {
      atualizarLinha_(ctx.prazos, z, { situacao: 'cancelado', observacoes: (z.observacoes || '') + ' | cancelado: data lida errada (número de processo)', atualizado_em: agora, atualizado_por: 'robô' }); n++;
    }
  });
  setConfig_('FIX_ATOS_86', new Date().toISOString() + ' · ' + n, 'Limpeza das audiências/perícias com ano impossível (8.6.0)');
  if (n) registrar_('robô', 'agenda: limpeza de datas impossíveis', n + ' item(ns)');
  return n;
}

/** Dia do evento do Google Agenda. Evento de dia inteiro: no fuso da AGENDA (lido no fuso de Brasília voltava um dia). */
function diaDoEvento_(ev, cal) {
  if (ev.isAllDayEvent()) {
    var fuso = TZ; try { fuso = (cal && cal.getTimeZone()) || TZ; } catch (e) { /* fuso padrão */ }
    return Utilities.formatDate(ev.getAllDayStartDate(), fuso, 'yyyy-MM-dd');
  }
  return Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd');
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
/**
 * Audiências e perícias de hoje até "ate": aba Eventos + as lançadas direto no Google Agenda (AUDIÊNCIA CONCILIAÇÃO / INSTRUÇÃO / PERÍCIAS).
 * Cada uma: { chave, tipo, nome, data, hora, numero, local, titulo, ev (linha de Eventos, quando houver) }.
 */
function atosDaAgenda_(hoje, ate, eventos) {
  var atos = [];
  eventos.linhas.forEach(function (e) {
    if (!e.data || e.data < hoje || e.data > ate || /^apagado/.test(e.evento_id || '')) return;
    atos.push({ chave: 'E:' + e.numero + ':' + e.data + ':' + tipoAtoDe_(e.tipo), tipo: tipoAtoDe_(e.tipo), nome: e.tipo, data: e.data, hora: e.hora || '', numero: e.numero, local: '', ev: e });
  });
  try {
    var ids = agendas_(), fim = new Date(somarDias_(ate, 1) + 'T00:00:00-03:00');
    ['AUDIÊNCIA CONCILIAÇÃO', 'AUDIÊNCIA INSTRUÇÃO', 'PERÍCIAS'].forEach(function (ag) {
      var cal = ids[ag] && CalendarApp.getCalendarById(ids[ag]);
      if (!cal) return;
      cal.getEvents(new Date(hoje + 'T00:00:00-03:00'), fim).forEach(function (ev) {
        var txt = ev.getTitle() + ' ' + (ev.getDescription() || '');
        var num = (RE_CNJ.exec(txt) || [])[1] || '';
        var ini = ev.getStartTime(), data = diaDoEvento_(ev, cal);
        if (data < hoje || data > ate) return;
        var tipo = ag === 'PERÍCIAS' ? 'pericia' : ag === 'AUDIÊNCIA INSTRUÇÃO' ? 'instrucao' : 'conciliacao';
        var evId = ev.getId();
        if (atos.some(function (a) { return (a.ev && a.ev.evento_id === evId) || (num && a.numero === num && a.data === data && a.tipo === tipo); })) return;
        atos.push({ chave: 'G:' + evId.slice(0, 40) + ':' + data, tipo: tipo, nome: tipo === 'pericia' ? 'perícia' : tipo === 'instrucao' ? 'audiência de instrução' : 'audiência de conciliação',
          data: data, hora: ev.isAllDayEvent() ? '' : Utilities.formatDate(ini, TZ, 'HH:mm'), numero: num, local: ev.getLocation ? (ev.getLocation() || '') : '', titulo: ev.getTitle() });
      });
    });
  } catch (e) { /* sem acesso à agenda: segue com a aba Eventos */ }
  return atos.sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; });
}

/**
 * 8.6.0 (pedido da usuária: "não podemos perder audiência"): DOIS avisos ao cliente para cada audiência/perícia —
 * 1 semana antes (ou assim que o robô souber, se faltar menos) e NO DIA. Cada aviso vira uma tarefa com o WhatsApp pronto.
 */
function lembrarAudiencias_(ctx) {
  var hoje = hojeSP_();
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var ja = {};
  tabT.linhas.forEach(function (t) { var re = /\[lembrete:([^\]]+)\]/g, m; while ((m = re.exec(t.descricao || ''))) ja[m[1]] = 1; });
  var porNumero = {};
  ctx.procs.linhas.forEach(function (p) { if (p.numero) porNumero[p.numero] = p; });
  var atos = atosDaAgenda_(hoje, somarDias_(hoje, 7), ctx.eventos || tabela_('Eventos'));
  var feitos = 0, agora = new Date().toISOString();
  atos.forEach(function (a) {
    var noDia = a.data === hoje;
    // aviso da semana: a antiga marca [lembrete:chave] (2 dias úteis) vale como aviso da semana
    var chave = noDia ? a.chave + '|dia' : a.chave;
    if (ja[chave] || (!noDia && (ja[a.chave + '|dia']))) return;
    if (noDia && a.ev && a.ev.avisado_dia_em) return;
    if (!noDia && a.ev && a.ev.avisado_em) return;
    ja[chave] = 1;
    var p = porNumero[a.numero] || {};
    var cli = p.cliente_id ? (ctx.clientes.linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {}) : {};
    var nomeCli = cli.nome || (p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '';
    var quando = dataBR_(a.data) + (a.hora ? ' às ' + a.hora : '');
    var nomeAto = a.nome.charAt(0).toUpperCase() + a.nome.slice(1);
    inserirLinha_(tabT, { id: novoId_('T'),
      titulo: (noDia ? '⚖ HOJE — lembrar o cliente: ' : 'Avisar o cliente (1 semana antes): ') + a.nome + ' em ' + quando + (nomeCli ? ' — ' + nomeCli : ''),
      descricao: nomeAto + ' ' + quando + (a.local ? ' · ' + a.local : '') + (a.numero ? ' · processo ' + a.numero : '') + (a.titulo && !a.numero ? ' · ' + a.titulo : '') +
        '.\n' + (noDia ? 'É HOJE: mande a mensagem de lembrete pelo botão de WhatsApp desta tarefa e confirme que o cliente vai.' : 'Avise o cliente pelo botão de WhatsApp desta tarefa e confira o checklist.') +
        ' Depois aperte "✓ Conferido".\n' +
        '[ato:' + a.tipo + '|' + a.data + '|' + (a.hora || '') + '|' + String(a.local || '').replace(/[\]|]/g, ' ').slice(0, 80) + ']\n[lembrete:' + chave + ']' + (noDia ? '\n[avisodia]' : ''),
      responsavel: respSecretaria_() || p.responsavel || responsavelPadrao_(p, a.numero) || '', processo_id: p.id || '', numero: a.numero || '', cliente_id: p.cliente_id || '',
      vence_em: hoje, etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '',
      historico: historicoMais_('', { nome: 'robô' }, (noDia ? 'lembrete do dia: ' : 'aviso de 1 semana: ') + a.nome), criado_em: agora, criado_por: 'robô', atualizado_em: agora, atualizado_por: 'robô',
      prioridade: noDia || diffDias_(a.data, hoje) <= 1 ? 'urgente' : 'alta', checklist: noDia ? '' : JSON.stringify((CHECK_ATO[a.tipo] || CHECK_ATO.conciliacao).map(function (t) { return { t: t, ok: false }; })),
      repetir: '', ok_por: '', ok_em: '' });
    feitos++;
  });
  if (feitos) registrar_('robô', 'lembretes de audiência', feitos + ' tarefa(s) "lembrar o cliente"');
  return feitos;
}

/* ---------- Robôs do escritório (7.7.0) ----------
 * 1) Alvará / RPV / precatório nas intimações → tarefa "levantar o valor" + lista "A levantar" no Financeiro
 * 2) Processo parado há 60 dias → tarefa "verificar andamento / pedir impulso" (até 10 por dia)
 * 3) Cliente em atendimento há 7 dias sem contrato → tarefa "retomar contato" com WhatsApp pronto (secretaria)
 * 4) Documentos para assinar ainda na pasta 1 dia depois → tarefa "cobrar assinatura" (secretaria); some sozinha quando a pasta esvazia
 * 5) Processo encerrado → tarefa "pedir avaliação no Google" com WhatsApp pronto (secretaria)
 */
var RE_VALOR_LEVANTAR = /alvar[aá]|requisi[cç][aã]o de pequeno valor|\bRPV\b|precat[oó]rio|levantamento d[eo]s? (valor|dep[oó]sito|quantia|cr[eé]dito)|libera[cç][aã]o d[eo]s? (valor|cr[eé]dito|dep[oó]sito)|transfer[eê]ncia d[eo]s? valor/i;
var LINK_AVALIACAO_PADRAO = 'https://www.google.com/maps/search/?api=1&query=Ara%C3%BAjo%20Advocacia%2C%20Rua%20Silvino%20Moreira%20Lima%20Sobrinho%2C%20888%2C%20Tubar%C3%A3o%20-%20SC';

/** Quem cuida da secretaria (assinaturas, retomar contato, avaliação): Config RESP_SECRETARIA ou a primeira pessoa com perfil secretaria. */
function respSecretaria_() {
  var r = config_('RESP_SECRETARIA');
  if (r) return r;
  var s = usuarios_().filter(function (x) { return x.ativo === 'sim' && x.perfil === 'secretario'; })[0];
  return s ? s.usuario : (config_('RESP_PADRAO') || '');
}

function novaTarefaRobo_(tab, t) {
  var agora = new Date().toISOString();
  var base = { id: novoId_('T'), titulo: '', descricao: '', responsavel: '', processo_id: '', numero: '', cliente_id: '', vence_em: hojeSP_(),
    etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '', historico: '', criado_em: agora, criado_por: 'robô',
    atualizado_em: agora, atualizado_por: 'robô', prioridade: 'normal', checklist: '', repetir: '', ok_por: '', ok_em: '' };
  Object.keys(t).forEach(function (k) { base[k] = t[k]; });
  if (Array.isArray(base.checklist)) base.checklist = JSON.stringify(base.checklist.map(function (x) { return { t: x, ok: false }; }));
  base.historico = historicoMais_('', { nome: 'robô' }, t._motivo || 'criada pelo robô');
  delete base._motivo;
  inserirLinha_(tab, base);
  return base;
}
function marcasDe_(tab, nome) {
  var r = {}, re = new RegExp('\\[' + nome + ':([^\\]]+)\\]');
  tab.linhas.forEach(function (t) { var m = re.exec(t.descricao || ''); if (m) (r[m[1]] = r[m[1]] || []).push(t); });
  return r;
}
var abertaT_ = function (t) { return !t.concluida_em && t.situacao !== 'cancelada' && !/protocolado|concluido/.test(t.etapa || ''); };
function nomeClienteDe_(ctx, p) {
  var c = p && p.cliente_id ? ctx.clientes.linhas.filter(function (x) { return x.id === p.cliente_id; })[0] : null;
  return c ? c.nome : (p && p.cliente_nome && p.cliente_nome !== 'a identificar' ? p.cliente_nome : '');
}

function robosEscritorio_(ctx) {
  var r = {}, erros = [];
  [['valores', valoresALevantar_], ['parados', processosParados_], ['retomar', retomarAtendimentos_], ['assinaturas', lembrarAssinaturas_], ['google', postagemGoogle_], ['privacidade', limparContatosAntigos_], ['log', arquivarLog_], ['crm', crmSincronizar_], ['audios', function () { apagarTemporarios_(''); }], ['emails', avisarMovimentoClientes_], ['levantamento', lancarExitosLevantamento_], ['whats', whatsCutucar_]].forEach(function (x) {
    try { r[x[0]] = x[1](ctx); } catch (e) { erros.push(x[0] + ': ' + (e.message || e)); }
  });
  var feitas = Object.keys(r).reduce(function (a, k) { return a + (+r[k] || 0); }, 0);
  if (feitas) registrar_('robô', 'robôs do escritório', JSON.stringify(r));
  if (erros.length) throw new Error(erros.join(' | '));
  return r;
}

/* 8.11.2 (pedido da usuária: "fazer isso"): UMA vez, lança sozinho os honorários de ÊXITO do levantamento (contrato com percentual) dos
   clientes com processo ATIVO e sem honorário no painel — situação "importado — conferir", sem parcelas. Parcelados, promissórias e
   cobranças continuam em Financeiro › "📥 Antigos para lançar" (datas e valores vieram da leitura dos PDFs). */
function lancarExitosLevantamento_() {
  if (config_('LEVANT_AUTO_812')) return 0;
  var robo = { usuario: 'robô', nome: 'robô (levantamento)', perfil: 'administrador' };
  var r = levantamentoHonorarios_({}, robo), itens = [];
  r.lista.forEach(function (x) {
    if (!x.ativo || x.ignorado) return;
    var f = x.fontes.filter(function (y) { return y.aba === 'Contrato' && y.percentual > 0 && y.percentual <= 60; })[0];
    if (f) itens.push({ cliente_id: x.cliente_id, processo_id: x.processo_id, percentual: f.percentual, fonte: f.link || '' });
  });
  // aos poucos (60 por rodada, para não estourar o tempo do robô); quem já ganhou honorário sai da lista na rodada seguinte
  var res = itens.length ? levantamentoHonorarios_({ acao: 'lancar_exito', itens: itens.slice(0, 60) }, robo) : { feitos: 0 };
  if (itens.length > 60 && res.feitos) return res.feitos;
  setConfig_('LEVANT_AUTO_812', new Date().toISOString() + ' · ' + res.feitos + ' êxito(s) lançado(s)', 'Honorários de êxito do levantamento lançados pelo robô (uma vez)');
  return res.feitos;
}

/* 8.9.2: política de privacidade do site — pedidos de retorno ("Prefere que a gente ligue?") guardam nome e telefone por 12 meses.
   Depois disso o robô apaga nome, telefone, assunto e horário e mantém só data, página e origem (números do Marketing). 1 vez por dia. */
function limparContatosAntigos_() {
  var hoje = hojeSP_(); if (config_('CONTATOS_LIMPOS_DIA') === hoje) return 0;
  setConfig_('CONTATOS_LIMPOS_DIA', hoje, 'Último dia em que o robô apagou dados pessoais dos pedidos de retorno com mais de 12 meses');
  var t = tabela_('Contatos'), limite = new Date(Date.now() - 365 * 86400000).toISOString(), mud = [];
  t.linhas.forEach(function (c) {
    if (!c.criado_em || c.criado_em >= limite || (!c.nome && !c.telefone && !c.assunto)) return;
    c.nome = ''; c.telefone = ''; c.assunto = ''; c.horario = ''; c.observacoes = 'dados pessoais apagados após 12 meses (política de privacidade)'; c._mudou = true; mud.push(c);
  });
  if (mud.length) regravarMudadas_(t);
  return mud.length;
}

/* 1) Alvará, RPV, precatório */
function tipoValor_(t) {
  if (/pequeno valor|\bRPV\b/i.test(t)) return 'RPV';
  if (/precat[oó]rio/i.test(t)) return 'precatório';
  if (/alvar[aá]/i.test(t)) return 'alvará';
  return 'levantamento de valores';
}
function valoresALevantar_(ctx) {
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var desde = new Date(Date.now() - 30 * 86400000).toISOString();
  var porIntim = {}, abertasProc = {};
  tabT.linhas.forEach(function (t) {
    var m = /\[valor:([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/.exec(t.descricao || '');
    if (!m) return;
    porIntim[m[3]] = 1;
    if (abertaT_(t)) abertasProc[m[1] + '|' + m[2]] = 1;
  });
  var porNumero = {}, porId = {};
  ctx.procs.linhas.forEach(function (p) { porId[p.id] = p; if (p.numero) porNumero[p.numero] = p; });
  var feitas = 0, hoje = hojeSP_();
  ctx.intim.linhas.concat(ctx.intim.buffer || []).forEach(function (i) {
    if (feitas >= 15 || porIntim[i.id] || (i.recebido_em || '') < desde) return;
    var txt = [i.movimento, i.evento, i.texto].filter(Boolean).join(' \n ');
    var m = RE_VALOR_LEVANTAR.exec(txt);
    if (!m || /alvar[aá] de soltura|mandado de pris/i.test(txt)) return;
    var p = porId[i.processo_id] || porNumero[i.numero] || {};
    var tipo = tipoValor_(txt);
    porIntim[i.id] = 1;
    if (abertasProc[(p.id || i.numero) + '|' + tipo]) return;
    abertasProc[(p.id || i.numero) + '|' + tipo] = 1;
    var ini = Math.max(0, m.index - 120), trecho = txt.slice(ini, m.index + 220).replace(/\s+/g, ' ').trim();
    var mv = /R\$\s?([\d.]+,\d{2})/.exec(txt.slice(m.index, m.index + 500)) || /R\$\s?([\d.]+,\d{2})/.exec(txt);
    var nome = nomeClienteDe_(ctx, p);
    novaTarefaRobo_(tabT, { _motivo: tipo + ' encontrado na intimação',
      titulo: '💰 ' + tipo.charAt(0).toUpperCase() + tipo.slice(1) + ': levantar o valor' + (nome ? ' — ' + nome : ''),
      descricao: 'O robô achou ' + tipo + ' na intimação de ' + dataBR_(diaSP_(i.recebido_em)) + (i.numero ? ' (processo ' + i.numero + ')' : '') + ':\n«' + trecho + '»' +
        (mv ? '\nValor citado no texto: R$ ' + mv[1] + ' (conferir).' : '') +
        '\nConfira no processo, faça o levantamento e lance em Financeiro › honorário do cliente › "Lançar alvará ou depósito" (a tarefa fecha sozinha).' +
        '\n[valor:' + (p.id || '') + '|' + tipo + '|' + i.id + ']' + (p.cliente_id ? '\n[wa:valor]' : ''),
      responsavel: p.responsavel || responsavelPadrao_(p, i.numero) || '', processo_id: p.id || '', numero: i.numero || '', cliente_id: p.cliente_id || '',
      vence_em: somarDias_(hoje, 3), prioridade: 'alta', peso: '2',
      checklist: ['Conferir o valor e a conta no processo', 'Levantar / transferir o valor', 'Lançar no Financeiro (honorários e repasse)', 'Repassar ao cliente e mandar o recibo'] });
    feitas++;
  });
  return feitas;
}
/** Lista "A levantar" do Financeiro: tarefas de alvará/RPV abertas, com o honorário de êxito do cliente e a previsão. */
function aLevantar_(d, u) {
  var tabT = tabela_('Tarefas'), hons = tabela_('Honorarios').linhas, nomes = nomesUsuarios_(), cli = {};
  tabela_('Clientes').linhas.forEach(function (c) { cli[c.id] = c; });
  var lista = [];
  tabT.linhas.forEach(function (t) {
    var m = /\[valor:([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/.exec(t.descricao || '');
    if (!m || !abertaT_(t)) return;
    var mv = /Valor citado no texto: R\$ ([\d.]+,\d{2})/.exec(t.descricao || '');
    var valor = mv ? dinheiro_(mv[1]) : 0;
    var h = hons.filter(function (x) { return x.cliente_id === t.cliente_id && x.tipo === 'exito' && x.situacao !== 'encerrado' && (!m[1] || !x.processo_id || x.processo_id === m[1]); })
      .sort(function (a, b) { return (b.processo_id === m[1]) - (a.processo_id === m[1]); })[0];
    var pct = h ? dinheiro_(h.percentual) : 0;
    lista.push({ tarefa_id: t.id, tipo: m[2], cliente: (cli[t.cliente_id] || {}).nome || '', cliente_id: t.cliente_id || '', telefone: (cli[t.cliente_id] || {}).telefone || '',
      numero: t.numero || '', processo_id: t.processo_id || '', responsavel: nomes[t.responsavel] || t.responsavel || '', criado_em: t.criado_em, vence_em: t.vence_em,
      valor: valor || null, honorario_id: h ? h.id : '', percentual: pct || null, valor_previsto: valor && pct ? Math.round(valor * pct) / 100 : null });
  });
  lista.sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; });
  return lista;
}
/** Lançou o alvará no honorário: fecha a tarefa "levantar o valor" daquele cliente/processo. */
function fecharValoresLancados_(h, u) {
  var tab = tabela_('Tarefas'), agora = new Date().toISOString(), n = 0;
  tab.linhas.forEach(function (t) {
    var m = /\[valor:([^|\]]*)\|/.exec(t.descricao || '');
    if (!m || !abertaT_(t) || t.cliente_id !== h.cliente_id || (h.processo_id && m[1] && m[1] !== h.processo_id)) return;
    atualizarLinha_(tab, t, { etapa: 'protocolado', concluida_em: agora, concluida_por: t.responsavel || u.usuario,
      historico: historicoMais_(t.historico, u, 'valor lançado no Financeiro'), atualizado_em: agora, atualizado_por: u.usuario });
    n++;
  });
  return n;
}

/* 2) Processo parado */
function processosParados_(ctx) {
  var hoje = hojeSP_();
  if (config_('PARADOS_DIA') === hoje) return 0;
  var dias = parseInt(config_('PARADO_DIAS'), 10) || 60, max = parseInt(config_('PARADOS_POR_DIA'), 10) || 10;
  var limite = somarDias_(hoje, -dias);
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var marcas = marcasDe_(tabT, 'parado');
  var ultIntim = {};
  ctx.intim.linhas.forEach(function (i) { if (i.numero && (i.recebido_em || '') > (ultIntim[i.numero] || '')) ultIntim[i.numero] = i.recebido_em; });
  var cands = [];
  ctx.procs.linhas.forEach(function (p) {
    if (!p.numero || p.status === 'arquivado' || /^(extinto|contratado)$/.test(faseDe_(p))) return;
    var ult = [p.ultimo_movimento_em, ultIntim[p.numero]].filter(Boolean).sort().pop();
    if (!ult || diaSP_(ult) >= limite) return;
    if (/suspens|sobrest|arquiv|baixa definitiva|remetidos? ao arquivo/.test(normalizar_(p.ultimo_movimento || ''))) return;
    var ja = (marcas[p.id] || []).some(function (t) { return abertaT_(t) || diaSP_(t.criado_em) >= limite; });
    if (!ja) cands.push({ p: p, ult: diaSP_(ult) });
  });
  cands.sort(function (a, b) { return a.ult < b.ult ? -1 : 1; });
  cands.slice(0, max).forEach(function (c) {
    var p = c.p, nome = nomeClienteDe_(ctx, p), n = diffDias_(hoje, c.ult);
    novaTarefaRobo_(tabT, { _motivo: 'processo parado há ' + n + ' dias',
      titulo: 'Processo parado há ' + n + ' dias — verificar andamento' + (nome ? ' — ' + nome : ''),
      descricao: 'Última movimentação em ' + dataBR_(c.ult) + (p.ultimo_movimento ? ': «' + String(p.ultimo_movimento).slice(0, 160) + '»' : '') + '.\n' +
        'Abra o processo no sistema do tribunal. Se estiver parado sem motivo, peça o andamento (petição de impulso). Se estiver suspenso ou esperando algo, anote nos detalhes e conclua.\n[parado:' + p.id + ']',
      responsavel: p.responsavel || responsavelPadrao_(p, p.numero) || '', processo_id: p.id, numero: p.numero, cliente_id: p.cliente_id || '',
      vence_em: somarDias_(hoje, 5), checklist: ['Conferir no sistema do tribunal', 'Petição de impulso, se for o caso', 'Anotar a situação'] });
  });
  setConfig_('PARADOS_DIA', hoje, 'Último dia em que o robô procurou processos parados');
  return Math.min(cands.length, max);
}

/* 3) Cliente em atendimento que não fechou */
function retomarAtendimentos_(ctx) {
  var hoje = hojeSP_();
  if (config_('RETOMAR_DIA') === hoje) return 0;
  var dias = parseInt(config_('RETOMAR_DIAS'), 10) || 7;
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var marcas = marcasDe_(tabT, 'retomar'), comAcao = {}, comHon = {};
  ctx.procs.linhas.forEach(function (p) { if (p.cliente_id) comAcao[p.cliente_id] = 1; });
  try { tabela_('Honorarios').linhas.forEach(function (h) { comHon[h.cliente_id] = 1; }); } catch (e) { /* sem aba */ }
  var resp = respSecretaria_(), feitas = 0;
  ctx.clientes.linhas.forEach(function (c) {
    if (feitas >= 10 || comAcao[c.id] || comHon[c.id] || marcas[c.id] || !c.criado_em) return;
    if (/gea|import|revis|hist|processo|djen|gmail/i.test(c.origem || '') || /inativ/i.test(c.situacao || '')) return;
    var d = diaSP_(c.criado_em), n = diffDias_(hoje, d);
    if (n < dias || n > 45) return;
    novaTarefaRobo_(tabT, { _motivo: 'em atendimento há ' + n + ' dias',
      titulo: 'Retomar contato — ' + c.nome + ' (atendido há ' + n + ' dias, sem contrato)',
      descricao: 'O cliente foi atendido em ' + dataBR_(d) + ' e ainda não contratou. Mande a mensagem pelo botão de WhatsApp desta tarefa.\n' +
        'Se contratou: abra a ficha e use "Cliente contratou: abrir ação". Se não tiver interesse: anote nas observações do cliente e conclua.\n[retomar:' + c.id + ']\n[wa:retomar]',
      responsavel: resp, cliente_id: c.id, vence_em: somarDias_(hoje, 1) });
    feitas++;
  });
  setConfig_('RETOMAR_DIA', hoje, 'Último dia em que o robô procurou clientes em atendimento para retomar');
  return feitas;
}

/* 4) Documentos para assinar */
function cobrarAssinaturas_(ctx) {
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var marcas = marcasDe_(tabT, 'assinar'), resp = respSecretaria_(), agora = Date.now(), feitas = 0, olhadas = 0;
  var cli = {};
  ctx.clientes.linhas.forEach(function (c) { cli[c.id] = c; });
  var arquivosPara = function (c) {
    if (!c || !c.pasta_id) return -1;
    try {
      var sub = acharPasta_(DriveApp.getFolderById(c.pasta_id), PASTA_PARA_ASSINAR);
      if (!sub) return 0;
      var it = sub.getFiles(), n = 0;
      while (it.hasNext() && n < 50) { var f = it.next(); if (!/^IMPRIMIR/i.test(f.getName()) && !/\.pdf$/i.test(f.getName())) n++; }
      return n;
    } catch (e) { return -1; }
  };
  // tarefas abertas: pasta esvaziou → fecha sozinha
  Object.keys(marcas).forEach(function (k) {
    marcas[k].forEach(function (t) {
      if (!abertaT_(t) || olhadas >= 20) return;
      olhadas++;
      if (arquivosPara(cli[t.cliente_id]) === 0) {
        var ag = new Date().toISOString();
        atualizarLinha_(tabT, t, { etapa: 'protocolado', concluida_em: ag, concluida_por: t.responsavel || 'robô',
          historico: historicoMais_(t.historico, { nome: 'robô' }, 'a pasta DOCUMENTOS PARA ASSINAR esvaziou'), atualizado_em: ag, atualizado_por: 'robô' });
      }
    });
  });
  // documentos gerados entre 1 e 14 dias atrás
  var ultimo = {};
  tabela_('Log').linhas.forEach(function (l) {
    if (l.acao !== 'documentos gerados') return;
    var t = Date.parse(l.quando); if (!(t < agora - 86400000 && t > agora - 14 * 86400000)) return;
    var partes = String(l.detalhe || '').split(' '), cid = partes[0], quais = (partes[1] || '').split(',');
    if (!cli[cid] || !quais.some(function (k) { return MODELOS[k] && MODELOS[k].assinaCliente; })) return;
    if (!ultimo[cid] || ultimo[cid] < l.quando) ultimo[cid] = l.quando;
  });
  Object.keys(ultimo).forEach(function (cid) {
    if (feitas >= 10 || olhadas >= 40) return;
    var dia = diaSP_(ultimo[cid]), chave = cid + '|' + dia;
    if (marcas[chave] || (marcas[cid] || []).length) return;
    if (Object.keys(marcas).some(function (k) { return k.indexOf(cid + '|') === 0 && k >= chave; })) return;
    olhadas++;
    var n = arquivosPara(cli[cid]);
    if (n <= 0) return;
    marcas[chave] = [1];
    novaTarefaRobo_(tabT, { _motivo: n + ' documento(s) esperando assinatura',
      titulo: 'Cobrar assinatura — ' + cli[cid].nome + ' (' + n + ' documento(s) desde ' + dataBR_(dia) + ')',
      descricao: 'Os documentos gerados em ' + dataBR_(dia) + ' ainda estão na pasta "DOCUMENTOS PARA ASSINAR" do cliente. Combine a assinatura pelo botão de WhatsApp.\n' +
        'Quando o cliente assinar, guarde o documento assinado na pasta do cliente e tire os rascunhos da pasta "DOCUMENTOS PARA ASSINAR": a tarefa fecha sozinha.\n[assinar:' + chave + ']\n[wa:assinar]',
      responsavel: resp, cliente_id: cid, vence_em: hojeSP_(), prioridade: 'alta' });
    feitas++;
  });
  return feitas;
}

/* ---------- Assinatura de procuração e contrato (8.4.1) ---------- */
/** Cria o processo "Petição inicial (a ajuizar)" + tarefa para quem faz as iniciais (antes era na hora de gerar). */
function abrirPeticaoInicial_(c, tipoChave, contra, docs, u) {
  var tipo = TIPOS_ACAO[tipoChave] || null;
  return comTrava_(function () {
    var tabP = tabela_('Processos');
    var ja = tabP.linhas.filter(function (x) { return x.cliente_id === c.id && (!x.numero || x.fase === 'contratado') && x.status !== 'arquivado'; })[0];
    if (ja) return ja.id;
    var agora = new Date().toISOString();
    var novo = { id: novoId_('P'), cliente_id: c.id, cliente_nome: '', numero: '', tribunal: '', sistema: '', orgao: '', area: (tipo && tipo.area) || c.area || '',
      polo: 'ativo', parte_contraria: contra || '', proximo_ato: 'Ajuizar a ação', proximo_ato_data: '', status: 'ativo',
      observacoes: (tipo ? tipo.nome + '. ' : '') + 'Documentos assinados (' + docs + ') em ' + dataBR_(hojeSP_()) + '. Coloque o número quando ajuizar.',
      origem: 'documentos', criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario, fase: 'contratado', fase_auto: '', responsavel: config_('RESP_INICIAL') || '' };
    inserirLinha_(tabP, novo);
    tarefaPeticaoInicial_(novo, u, tipo ? tipo.nome : '');
    return novo.id;
  });
}
/** Uma vez: procuração/contrato gerados ANTES do controle de assinatura abriram direto a "Petição inicial (a ajuizar)".
 *  Esses casos (sem número, criados pelo gerador) entram como "aguardando assinatura", ligados ao processo; o 1º lembrete vem em 7 dias. */
function assinaturasAntigas_() {
  if (config_('ASSIN_ANTIGAS')) return;
  var tabA = tabela_('Assinaturas'), tem = {}, agora = new Date().toISOString(), cli = {};
  tabA.linhas.forEach(function (a) { tem[a.cliente_id] = 1; });
  tabela_('Clientes').linhas.forEach(function (c) { cli[c.id] = c; });
  tabela_('Processos').linhas.forEach(function (p) {
    if (p.fase !== 'contratado' || p.numero || p.status === 'arquivado' || p.origem !== 'documentos' || !p.cliente_id || tem[p.cliente_id] || !cli[p.cliente_id]) return;
    tem[p.cliente_id] = 1;
    inserirLinha_(tabA, { id: novoId_('AS'), cliente_id: p.cliente_id, cliente_nome: cli[p.cliente_id].nome, documentos: 'Procuração e contrato (gerados antes do controle de assinatura)',
      tipo_acao: '', parte_contraria: p.parte_contraria || '', gerado_em: p.criado_em || agora, gerado_por: '', situacao: 'aguardando', assinado_em: '', assinado_por: '',
      processo_id: p.id, lembretes: '0', lembrete_em: agora, pasta_url: cli[p.cliente_id].pasta_url || '' });
  });
  setConfig_('ASSIN_ANTIGAS', agora, 'Petições iniciais antigas entraram em "aguardando assinatura"');
}
function listarAssinaturas_(d) {
  try { assinaturasAntigas_(); } catch (e) { /* segue */ }
  var hoje = hojeSP_();
  return tabela_('Assinaturas').linhas.filter(function (a) { return d.todas ? true : a.situacao === 'aguardando'; })
    .filter(function (a) { return !d.cliente_id || a.cliente_id === d.cliente_id; })
    .sort(function (a, b) { return a.gerado_em < b.gerado_em ? -1 : 1; })
    .map(function (a) { return { id: a.id, cliente_id: a.cliente_id, cliente: a.cliente_nome, documentos: a.documentos, tipo_acao: (TIPOS_ACAO[a.tipo_acao] || {}).nome || '', gerado_em: a.gerado_em,
      gerado_por: a.gerado_por, situacao: a.situacao, dias: diffDias_(hoje, diaSP_(a.gerado_em)), assinado_em: a.assinado_em, processo_id: a.processo_id,
      honorario: a.honorarios && !a.honorarios_lancados ? (function () { try { return JSON.parse(a.honorarios).resumo || 'honorário combinado'; } catch (e) { return 'honorário combinado'; } })() : '',
      tem_honorarios: !!a.honorarios, honorarios_lancados: a.honorarios_lancados || '' }; });
}
/** "✓ Assinado" (abre a petição inicial), "Não vai assinar" (arquiva) ou "Voltar a aguardar". */
function marcarAssinatura_(d, u) {
  if (d.acao === 'criar') { // marcado à mão na ficha (documentos feitos fora do painel)
    return comTrava_(function () {
      var tabA0 = tabela_('Assinaturas'), c0 = tabela_('Clientes').linhas.filter(function (x) { return x.id === d.cliente_id; })[0];
      if (!c0) throw falha_('Cliente não encontrado.');
      if (tabA0.linhas.some(function (x) { return x.cliente_id === c0.id && x.situacao === 'aguardando'; })) return { ok: true };
      inserirLinha_(tabA0, { id: novoId_('AS'), cliente_id: c0.id, cliente_nome: c0.nome, documentos: String(d.documentos || 'Procuração e contrato').slice(0, 200), tipo_acao: c0.tipo_acao || '',
        parte_contraria: '', gerado_em: new Date().toISOString(), gerado_por: u.usuario, situacao: 'aguardando', assinado_em: '', assinado_por: '', processo_id: '', lembretes: '0', lembrete_em: '', pasta_url: c0.pasta_url || '' });
      return { ok: true };
    });
  }
  var tabA = tabela_('Assinaturas'), a = tabA.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!a) throw falha_('Registro de assinatura não encontrado.');
  var agora = new Date().toISOString(), proc = '', resLanc = null;
  if (d.acao === 'assinado') {
    var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === a.cliente_id; })[0];
    if (!c) throw falha_('Cliente não encontrado.');
    proc = a.processo_id && tabela_('Processos').linhas.some(function (p) { return p.id === a.processo_id && p.status !== 'arquivado'; }) ? a.processo_id : abrirPeticaoInicial_(c, a.tipo_acao, a.parte_contraria, a.documentos, u);
    // honorário combinado ao gerar o contrato: só agora vai para o Financeiro (8.5.0)
    var lanc = [];
    if (a.honorarios && !a.honorarios_lancados) {
      try { var hp = JSON.parse(a.honorarios); lanc = lancarHonorariosForm_(hp.f || {}, c, hp.descricao || 'Honorários', u); }
      catch (eH) { throw falha_('Não consegui lançar o honorário no Financeiro: ' + (eH.publico ? eH.message : 'confira os valores do contrato') + '. Tente de novo.'); }
    }
    atualizarLinha_(tabA, a, { situacao: 'assinado', assinado_em: agora, assinado_por: u.nome || u.usuario, processo_id: proc, honorarios_lancados: a.honorarios ? agora + (lanc.length ? '|' + lanc.join(',') : '') : '' });
    registrar_(u.usuario, 'documentos assinados', a.cliente_id + ' · ' + a.documentos + (lanc.length ? ' + financeiro' : ''));
    resLanc = { lancados: lanc.length, ja_lancados: lanc.repetidos || 0 };
  } else if (d.acao === 'desistiu') {
    // 8.11: vale também para quem foi marcado "Assinado" por engano: arquiva a petição inicial sem número e tira do Financeiro o
    // honorário lançado ao assinar (parcelas ainda não pagas)
    desfazerFechamento_(a, a.processo_id, u, agora, 'cliente não assinou');
    registrar_(u.usuario, 'documentos não assinados', a.cliente_id + ' · ' + a.documentos);
  } else if (d.acao === 'reabrir') atualizarLinha_(tabA, a, { situacao: 'aguardando', assinado_em: '', assinado_por: '' });
  else throw falha_('Ação inválida.');
  // fecha os lembretes abertos deste registro
  if (d.acao !== 'reabrir') {
    var tabT = tabela_('Tarefas');
    tabT.linhas.filter(function (t) { return String(t.descricao || '').indexOf('[assinatura:' + a.id + ']') >= 0 && abertaT_(t); }).forEach(function (t) {
      atualizarLinha_(tabT, t, { etapa: 'protocolado', concluida_em: agora, concluida_por: u.usuario, historico: historicoMais_(t.historico, u, d.acao === 'assinado' ? 'documentos assinados' : 'cliente não vai assinar'), atualizado_em: agora, atualizado_por: u.usuario });
    });
  }
  return Object.assign({ ok: true, processo_id: proc }, resLanc || {});
}
/** Apaga de vez uma linha (fica em branco; a leitura ignora linhas vazias). Só para o que nunca deveria ter existido. */
function apagarLinha_(tab, obj) {
  var vazio = tab.cab.map(function () { return ''; });
  tab.aba.getRange(obj._linha, 1, 1, tab.cab.length).setValues([vazio]); marcarMudanca_();
  tab.linhas = tab.linhas.filter(function (x) { return x !== obj; });
}
/** 8.11: o cliente NÃO vai fechar (não assinou, ou foi marcado "Assinado" por engano). Arquiva a petição inicial sem número,
 *  cancela a tarefa da inicial e os lembretes, e cancela o honorário lançado ao assinar (só parcelas NÃO pagas somem). */
function desfazerFechamento_(a, procId, u, agora, motivo) {
  var res = { processo: '', honorarios: 0, parcelas: 0 };
  if (a) atualizarLinha_(tabela_('Assinaturas'), a, { situacao: 'não assinou', assinado_em: agora, assinado_por: u.nome || u.usuario });
  var tabP = tabela_('Processos'), pr = procId ? tabP.linhas.filter(function (p) { return p.id === procId; })[0] : null;
  if (!pr && a) pr = tabP.linhas.filter(function (p) { return p.cliente_id === a.cliente_id && !p.numero && p.fase === 'contratado' && p.status !== 'arquivado'; })[0];
  if (pr && !pr.numero && pr.status !== 'arquivado') {
    atualizarLinha_(tabP, pr, { status: 'arquivado', fase: 'extinto', fase_auto: 'nao', proximo_ato: '', proximo_ato_data: '',
      observacoes: (pr.observacoes ? pr.observacoes + ' ' : '') + 'Não fechou: ' + motivo + ' (' + dataBR_(hojeSP_()) + ', ' + (u.nome || u.usuario) + ').', atualizado_em: agora, atualizado_por: u.usuario });
    res.processo = pr.id;
    var tabT0 = tabela_('Tarefas');
    tabT0.linhas.filter(function (t) { return String(t.descricao || '').indexOf('[inicial:' + pr.id + ']') >= 0 && abertaT_(t); })
      .forEach(function (t) { atualizarLinha_(tabT0, t, { situacao: 'cancelada', historico: historicoMais_(t.historico, u, motivo), atualizado_em: agora, atualizado_por: u.usuario }); });
  }
  if (a && a.honorarios_lancados) {
    var ids = String(a.honorarios_lancados).split('|')[1];
    var tabH = tabela_('Honorarios'), tabPa = tabela_('Parcelas');
    var alvo = tabH.linhas.filter(function (h) {
      if (h.cliente_id !== a.cliente_id || h.situacao === 'cancelado') return false;
      if (ids) return ids.split(',').indexOf(h.id) >= 0;
      // registro antigo sem os ids: os lançados pelo gerador depois de gerar os documentos
      return /Lançado ao gerar o contrato/.test(h.observacoes || '') && (h.criado_em || '') >= String(a.gerado_em || '').slice(0, 10);
    });
    alvo.forEach(function (h) {
      var ps = tabPa.linhas.filter(function (p) { return p.honorario_id === h.id; });
      if (ps.some(function (p) { return p.pago_em; })) return; // já recebeu algo: não mexe, a equipe decide no Financeiro
      ps.forEach(function (p) { apagarLinha_(tabPa, p); res.parcelas++; });
      atualizarLinha_(tabH, h, { situacao: 'cancelado', observacoes: (h.observacoes ? h.observacoes + ' ' : '') + 'Cancelado: ' + motivo + ' (' + dataBR_(hojeSP_()) + ').', atualizado_em: agora, atualizado_por: u.usuario });
      res.honorarios++;
    });
    if (res.honorarios) atualizarLinha_(tabela_('Assinaturas'), a, { honorarios_lancados: '' });
  }
  if (a) {
    var tabT = tabela_('Tarefas');
    tabT.linhas.filter(function (t) { return String(t.descricao || '').indexOf('[assinatura:' + a.id + ']') >= 0 && abertaT_(t); }).forEach(function (t) {
      atualizarLinha_(tabT, t, { situacao: 'cancelada', historico: historicoMais_(t.historico, u, motivo), atualizado_em: agora, atualizado_por: u.usuario });
    });
  }
  return res;
}
/** Botão "Não vai fechar" na petição inicial (processo sem número). */
function naoFechou_(d, u) {
  return comTrava_(function () {
    var pr = tabela_('Processos').linhas.filter(function (p) { return p.id === d.id; })[0];
    if (!pr) throw falha_('Processo não encontrado.');
    if (pr.numero) throw falha_('Este processo já tem número: para encerrar, mude a etapa para Encerrado.');
    var a = tabela_('Assinaturas').linhas.filter(function (x) { return x.cliente_id === pr.cliente_id && x.situacao !== 'não assinou'; })
      .sort(function (x, y) { return (x.gerado_em || '') < (y.gerado_em || '') ? 1 : -1; })[0] || null;
    var r = desfazerFechamento_(a, pr.id, u, new Date().toISOString(), String(d.motivo || 'cliente não vai fechar').slice(0, 200));
    registrar_(u.usuario, 'cliente não fechou', pr.cliente_id + ' · ' + pr.id + (r.honorarios ? ' · ' + r.honorarios + ' honorário(s) cancelado(s)' : ''));
    return Object.assign({ ok: true }, r);
  });
}
/** Robô: procuração/contrato sem assinatura há 7 dias → tarefa "lembrar o cliente" (de novo a cada 7 dias, até 3 vezes). */
function lembrarAssinaturas_(ctx) {
  try { assinaturasAntigas_(); } catch (e) { /* segue */ }
  var tabA = tabela_('Assinaturas'), tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas'), hoje = hojeSP_(), feitas = 0, resp = respSecretaria_();
  tabA.linhas.forEach(function (a) {
    if (a.situacao !== 'aguardando' || feitas >= 15) return;
    var n = +a.lembretes || 0, base = diaSP_(a.lembrete_em || a.gerado_em);
    if (n >= 3 || diffDias_(hoje, base) < 7) return;
    var dias = diffDias_(hoje, diaSP_(a.gerado_em));
    novaTarefaRobo_(tabT, { _motivo: 'documentos sem assinatura há ' + dias + ' dias',
      titulo: 'Assinatura pendente — ' + a.cliente_nome + ' (' + dias + ' dias)',
      descricao: 'Gerado(s) em ' + dataBR_(diaSP_(a.gerado_em)) + ': ' + a.documentos + '. O cliente ainda não assinou.\n' +
        'Fale com o cliente pelo WhatsApp. Quando assinar, aperte "✓ Assinado" na ficha do cliente (ou em Modelos › Aguardando assinatura): o caso vai para Petição inicial. ' +
        'Se desistiu, aperte "Não vai assinar".\n[assinatura:' + a.id + ']\n[wa:assinar]',
      responsavel: a.gerado_por && usuarios_().some(function (x) { return x.usuario === a.gerado_por && x.ativo === 'sim'; }) ? a.gerado_por : resp,
      cliente_id: a.cliente_id, vence_em: hoje, prioridade: n ? 'urgente' : 'alta' });
    atualizarLinha_(tabA, a, { lembretes: String(n + 1), lembrete_em: new Date().toISOString() });
    feitas++;
  });
  return feitas;
}

/* 6) Toda segunda: o texto novo do blog vira uma tarefa "Postar no perfil do Google", com o texto pronto e o link. */
function postagemGoogle_(ctx) {
  var hoje = hojeSP_(), d = new Date(hoje + 'T12:00:00-03:00');
  if (d.getDay() !== 1 || config_('GOOGLE_POST_DIA') === hoje) return 0;
  var xml;
  try {
    var r = UrlFetchApp.fetch('https://araujoadvocaciasc.com.br/blog/feed.xml?' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return 0;
    xml = r.getContentText();
  } catch (e) { return 0; }
  var desc = function (t) { return String(t || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); };
  var itens = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map(function (it) {
    var g = function (tag) { var m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(it); return m ? desc(m[1]) : ''; };
    return { titulo: g('title'), link: g('link'), resumo: g('description'), cat: g('category') };
  });
  var ja = config_('GOOGLE_POST_LINKS') || '';
  var it = itens.filter(function (x) { return x.link && ja.indexOf(x.link) < 0; })[0];
  setConfig_('GOOGLE_POST_DIA', hoje, 'Último dia em que o robô preparou a postagem do Google');
  if (!it) return 0;
  var texto = it.titulo + '\n\n' + it.resumo + '\n\nLeia a explicação completa no site da Araújo Advocacia.';
  var tabT = ctx.tarefas = ctx.tarefas || tabela_('Tarefas');
  var zap = config_('GBP_ZAPIER') === 'sim'; // 8.9.1: o Zapier já posta o blog no perfil (lê o feed do site)
  var auto = !zap && gbpLigado_() ? gbpPostar_(it) : null; // 8.9.0: postagem automática no perfil do Google (quando o Google aprovar a API)
  if (zap || (auto && auto.ok)) {
    setConfig_('GOOGLE_POST_LINKS', (it.link + ' ' + ja).slice(0, 4000), 'Textos do blog já mandados para o perfil do Google');
    novaTarefaRobo_(tabT, { _motivo: 'texto novo do blog para o Instagram',
      titulo: 'Postar no Instagram: ' + it.titulo.slice(0, 80),
      descricao: (zap ? 'O texto desta semana vai SOZINHO para o perfil do Google pelo Zapier (confira no perfil se apareceu).' : 'O texto desta semana JÁ FOI POSTADO SOZINHO no perfil do Google.') + ' Falta só o Instagram:\nIMAGEM: ' + it.link.replace(/\/?$/, '/') + 'instagram.png\nLEGENDA PRONTA: ' + it.link.replace(/\/?$/, '/') + 'instagram.txt\n[google:' + it.link.replace(/[\[\]]/g, '') + ']',
      responsavel: respSecretaria_(), vence_em: hoje, prioridade: 'normal', checklist: ['Postar a imagem pronta no Instagram com a legenda'] });
    return 1;
  }
  novaTarefaRobo_(tabT, { _motivo: 'texto novo do blog para o Google',
    titulo: 'Postar no Google e no Instagram: ' + it.titulo.slice(0, 80),
    descricao: (auto && !auto.ok ? '⚠ A postagem automática no Google falhou (' + auto.erro + '). Poste à mão desta vez:\n\n' : '') +
      'Toda semana o blog ganha textos novos. Poste o desta semana no perfil do Google (mantém o perfil ativo e traz clientes):\n' +
      '1) Abra https://business.google.com → "Adicionar atualização".\n2) Escolha uma foto do escritório ou da Dra. Júlian.\n3) Cole o texto abaixo.\n4) Botão "Saiba mais" com o link.\n\n' +
      'TEXTO:\n' + texto + '\n\nLINK:\n' + it.link +
      '\n\nINSTAGRAM (8.7.0): a imagem quadrada já está pronta — abra no celular, salve e poste com a legenda:\nIMAGEM: ' + it.link.replace(/\/?$/, '/') + 'instagram.png\nLEGENDA PRONTA: ' + it.link.replace(/\/?$/, '/') + 'instagram.txt' +
      '\n[google:' + it.link.replace(/[\[\]]/g, '') + ']',
    responsavel: respSecretaria_(), vence_em: hoje, prioridade: 'normal',
    checklist: ['Abrir o perfil do Google', 'Adicionar atualização com foto', 'Colar o texto e o link (botão "Saiba mais")', 'Postar a imagem pronta no Instagram com a legenda'] });
  setConfig_('GOOGLE_POST_LINKS', (it.link + ' ' + ja).slice(0, 4000), 'Textos do blog já mandados para o perfil do Google');
  return 1;
}

/* ---------- 8.9.0: blog no perfil do Google sozinho (API do Perfil da Empresa) ----------
   Precisa: o Google aprovar o "Basic API Access" do projeto do Cloud, o Apps Script ligado a esse projeto e a permissão
   business.manage no appsscript.json. Enquanto não houver tudo isso, o robô continua criando a tarefa para a secretaria. */
function gbpLigado_() { return config_('GBP_AUTO') === 'sim' && /^accounts\/[^/]+\/locations\/[^/]+$/.test(config_('GBP_LOCAL') || ''); }
function gbpFetch_(url, metodo, corpo) {
  var op = { method: metodo || 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (corpo) { op.contentType = 'application/json'; op.payload = JSON.stringify(corpo); }
  var r = UrlFetchApp.fetch(url, op), cod = r.getResponseCode(), j = {};
  try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) { j = {}; }
  return { cod: cod, j: j, msg: (j.error && j.error.message) || '' };
}
/** Traduz o erro do Google para o que a pessoa precisa fazer. */
function gbpErro_(r) {
  var m = String(r.msg || ''), cod = r.cod;
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(m))
    return 'falta a permissão do Perfil da Empresa no Apps Script (passo 4: appsscript.json com business.manage, depois rodar "configurar" e autorizar)';
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(m)) {
    var api = /(mybusiness[a-z]*\.googleapis\.com)/i.exec(m);
    return 'a API ' + (api ? api[1] : 'do Perfil da Empresa') + ' não está ativada no projeto do Google Cloud (passo 3)';
  }
  if (cod === 429 || /quota|RATE_LIMIT|Quota exceeded/i.test(m))
    return 'o Google ainda não aprovou o acesso (cota 0) ou a cota acabou. Se o e-mail de aprovação já chegou, confira se o Apps Script está ligado ao projeto aprovado (passo 2)';
  if (cod === 401) return 'a autorização expirou: abra o Apps Script, rode "configurar" e autorize de novo';
  if (cod === 403) return 'o Google recusou (' + m.slice(0, 160) + ')';
  return 'erro ' + cod + (m ? ': ' + m.slice(0, 160) : '');
}
/** Acha a conta e o perfil (local) do escritório. */
function gbpConectar_() {
  var a = gbpFetch_('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  if (a.cod !== 200) return { ok: false, erro: gbpErro_(a) };
  var contas = a.j.accounts || [], achados = [];
  for (var i = 0; i < contas.length; i++) {
    var l = gbpFetch_('https://mybusinessbusinessinformation.googleapis.com/v1/' + contas[i].name + '/locations?readMask=name,title,websiteUri&pageSize=100');
    if (l.cod !== 200) return { ok: false, erro: gbpErro_(l) };
    (l.j.locations || []).forEach(function (x) { achados.push({ local: contas[i].name + '/' + x.name, titulo: x.title || '', site: x.websiteUri || '' }); });
  }
  if (!achados.length) return { ok: false, erro: 'nenhum perfil de empresa nesta conta do Google (entre no Apps Script com a conta dona do perfil)' };
  var esc = achados.filter(function (x) { return /ara[uú]jo/i.test(x.titulo) || /araujoadvocacia/i.test(x.site); })[0] || achados[0];
  setConfig_('GBP_LOCAL', esc.local, 'Perfil do Google (Perfil da Empresa) onde o blog é postado');
  setConfig_('GBP_LOCAL_NOME', esc.titulo, 'Nome do perfil do Google ligado ao painel');
  return { ok: true, local: esc.local, titulo: esc.titulo, perfis: achados.length };
}
/** Posta um texto do blog como "atualização" do perfil, com a imagem quadrada do Instagram e o botão "Saiba mais". */
function gbpPostar_(it) {
  var local = config_('GBP_LOCAL'); if (!local) return { ok: false, erro: 'perfil não ligado' };
  var resumo = (it.titulo + '\n\n' + (it.resumo || '')).slice(0, 1400);
  var corpo = { languageCode: 'pt-BR', topicType: 'STANDARD', summary: resumo, callToAction: { actionType: 'LEARN_MORE', url: it.link } };
  if (it.link) corpo.media = [{ mediaFormat: 'PHOTO', sourceUrl: it.link.replace(/\/?$/, '/') + 'instagram.png' }];
  var r;
  try { r = gbpFetch_('https://mybusiness.googleapis.com/v4/' + local + '/localPosts', 'post', corpo); }
  catch (e) { return { ok: false, erro: String(e.message || e).slice(0, 160) }; }
  if (r.cod === 400 && corpo.media) { delete corpo.media; r = gbpFetch_('https://mybusiness.googleapis.com/v4/' + local + '/localPosts', 'post', corpo); } // imagem recusada → posta só o texto
  var res = r.cod === 200 ? { ok: true, url: r.j.searchUrl || '' } : { ok: false, erro: gbpErro_(r) };
  setConfig_('GBP_ULTIMO', new Date().toISOString() + ' · ' + (res.ok ? 'postado: ' + it.titulo.slice(0, 80) : 'falhou: ' + res.erro), 'Última tentativa de postar o blog no perfil do Google');
  return res;
}
/** Último texto do blog (para "Postar agora"). */
function gbpUltimoDoBlog_() {
  var r = UrlFetchApp.fetch('https://araujoadvocaciasc.com.br/blog/feed.xml?' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw falha_('Não consegui ler o blog do site agora. Tente de novo em instantes.');
  var it = (r.getContentText().match(/<item>[\s\S]*?<\/item>/) || [''])[0];
  var g = function (tag) { var m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(it); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : ''; };
  if (!g('link')) throw falha_('O blog ainda não tem textos.');
  return { titulo: g('title'), link: g('link'), resumo: g('description') };
}
/** Tela Marketing › "Blog no perfil do Google": status, ligar ao perfil, ligar/desligar e postar agora. */
function marketingGbp_(d, u) {
  var acao = d.acao || 'status', extra = {};
  if (acao === 'conectar') extra = gbpConectar_();
  else if (acao === 'ligar' || acao === 'desligar') {
    if (acao === 'ligar' && !config_('GBP_LOCAL')) { extra = gbpConectar_(); if (!extra.ok) return Object.assign(gbpStatus_(), { resultado: extra }); }
    setConfig_('GBP_AUTO', acao === 'ligar' ? 'sim' : 'nao', 'Postar o blog sozinho no perfil do Google (sim/nao)');
    registrar_(u.usuario, 'marketing: blog no Google', acao === 'ligar' ? 'ligou a postagem automática' : 'desligou a postagem automática');
    extra = { ok: true };
  } else if (acao === 'zapier' || acao === 'semzapier') {
    setConfig_('GBP_ZAPIER', acao === 'zapier' ? 'sim' : 'nao', 'O Zapier posta o blog no perfil do Google (sim/nao): a secretaria recebe só a tarefa do Instagram');
    registrar_(u.usuario, 'marketing: blog no Google', acao === 'zapier' ? 'marcou que o Zapier posta o blog' : 'desmarcou o Zapier');
    extra = { ok: true };
  } else if (acao === 'postar') {
    if (!config_('GBP_LOCAL')) { extra = gbpConectar_(); if (!extra.ok) return Object.assign(gbpStatus_(), { resultado: extra }); }
    var it = gbpUltimoDoBlog_();
    extra = gbpPostar_(it); extra.titulo = it.titulo;
    if (extra.ok) { var ja = config_('GOOGLE_POST_LINKS') || ''; if (ja.indexOf(it.link) < 0) setConfig_('GOOGLE_POST_LINKS', (it.link + ' ' + ja).slice(0, 4000), 'Textos do blog já mandados para o perfil do Google'); }
    registrar_(u.usuario, 'marketing: blog no Google', (extra.ok ? 'postou: ' : 'tentou postar: ') + it.titulo.slice(0, 80));
  }
  return Object.assign(gbpStatus_(), { resultado: acao === 'status' ? null : extra });
}
function gbpStatus_() {
  return { zapier: config_('GBP_ZAPIER') === 'sim', auto: config_('GBP_AUTO') === 'sim', local: config_('GBP_LOCAL') || '', nome: config_('GBP_LOCAL_NOME') || '', ultimo: config_('GBP_ULTIMO') || '' };
}

/** 8.10: funil por página do site — cliques no WhatsApp/telefone (o site conta sozinho) → conversas iniciadas → consultas agendadas
    (a equipe lança os TOTAIS do mês por página, sem nome nem detalhe do caso). Mostra quais páginas/temas trazem atendimento de verdade. */
function marketingFunil_(d, u) {
  var mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : hojeSP_().slice(0, 7);
  var tf = tabela_('MktFunil');
  if (d.salvar) {
    return comTrava_(function () {
      (d.linhas || []).slice(0, 80).forEach(function (l) {
        var pag = String(l.pagina || '').replace(/[^\w\/-]/g, '').slice(0, 60) || '/';
        var conv = Math.max(0, parseInt(l.conversas, 10) || 0), cons = Math.max(0, parseInt(l.consultas, 10) || 0);
        var r = tf.linhas.filter(function (x) { return x.mes === mes && x.pagina === pag; })[0];
        var dados = { mes: mes, pagina: pag, conversas: String(conv), consultas: String(cons), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario };
        if (r) { if (String(r.conversas) !== dados.conversas || String(r.consultas) !== dados.consultas) atualizarLinha_(tf, r, dados); }
        else if (conv || cons) inserirLinha_(tf, dados);
      });
      registrar_(u.usuario, 'marketing: funil por página', mes);
      return marketingFunil_({ mes: mes }, u);
    });
  }
  var porPag = {};
  var pg = function (p) { return (porPag[p] = porPag[p] || { pagina: p, whatsapp: 0, telefone: 0, anuncio: 0, conversas: 0, consultas: 0 }); };
  tabela_('SiteCliques').linhas.forEach(function (c) {
    if (String(c.quando || '').slice(0, 7) !== mes) return;
    var x = pg(c.pagina || '/');
    if (c.canal === 'telefone') x.telefone++; else x.whatsapp++;
    if (c.origem === 'ads') x.anuncio++;
  });
  tf.linhas.forEach(function (r) { if (r.mes === mes) { var x = pg(r.pagina); x.conversas = +r.conversas || 0; x.consultas = +r.consultas || 0; } });
  var lista = Object.keys(porPag).map(function (k) { return porPag[k]; })
    .sort(function (a, b) { return (b.consultas - a.consultas) || ((b.whatsapp + b.telefone) - (a.whatsapp + a.telefone)); });
  return { mes: mes, paginas: lista };
}

/* 7) Processo andou → e-mail curto ao cliente (só quem tem acesso ao "Acompanhe seu processo" e e-mail no cadastro). */
function avisarMovimentoClientes_(ctx) {
  if (config_('MOV_AVISO') === 'nao') return 0;
  var agora = new Date(), hoje = hojeSP_();
  var desde = config_('MOV_AVISO_DESDE');
  if (!desde) { setConfig_('MOV_AVISO_DESDE', agora.toISOString(), 'E-mail ao cliente quando o processo anda: vale para movimentações depois desta data'); return 0; }
  var cont = JSON.parse(config_('MOV_AVISO_CONTA') || '{}'); if (cont.dia !== hoje) cont = { dia: hoje, n: 0 };
  if (cont.n >= 80) return 0; // cota do Gmail
  var cli = {}; ctx.clientes.linhas.forEach(function (c) { cli[c.id] = c; });
  var limite = new Date(agora.getTime() - 7 * 86400000).toISOString(), feitos = 0, porCliente = {};
  ctx.procs.linhas.forEach(function (p) {
    var c = cli[p.cliente_id]; if (!c || !c.acesso_hash || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(c.email || '').trim())) return;
    var mov = p.ultimo_movimento_em || ''; if (!mov || mov < desde || mov < limite || (p.avisado_mov_em && p.avisado_mov_em >= mov)) return;
    (porCliente[c.id] = porCliente[c.id] || []).push(p);
  });
  Object.keys(porCliente).forEach(function (cid) {
    if (cont.n >= 80 || feitos >= 40) return;
    var c = cli[cid], ps = porCliente[cid], nome = String(c.nome || '').split(' ')[0];
    nome = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
    var lista = ps.map(function (p) { return '• Processo nº ' + (p.numero || '(a ajuizar)') + ' — movimentação em ' + dataBR_(diaSP_(p.ultimo_movimento_em)); }).join('\n');
    var corpo = 'Olá, ' + nome + '.\n\nHouve uma nova movimentação no seu processo:\n' + lista + '\n\n' +
      'Para ver a explicação em linguagem simples, acesse https://araujoadvocaciasc.com.br/acompanhe/ com o seu CPF e o código de acesso.\n' +
      'Se precisar, fale com a gente pelo WhatsApp (48) 99612-6491.\n\nAraújo Advocacia\n\n(Aviso automático. Não é preciso responder.)';
    try {
      GmailApp.sendEmail(String(c.email).trim(), 'Seu processo teve uma nova movimentação — Araújo Advocacia', corpo, { name: 'Araújo Advocacia', replyTo: config_('CONTATO_EMAIL') || Session.getEffectiveUser().getEmail() });
      ps.forEach(function (p) { atualizarLinha_(ctx.procs, p, { avisado_mov_em: p.ultimo_movimento_em > agora.toISOString() ? p.ultimo_movimento_em : agora.toISOString() }); });
      registrar_('robô', 'e-mail de movimentação ao cliente', c.id + ' ' + ps.length + ' processo(s)');
      feitos++; cont.n++;
    } catch (e) { cont.n = 80; } // cota acabou: tenta amanhã
  });
  setConfig_('MOV_AVISO_CONTA', JSON.stringify(cont), 'E-mails de movimentação mandados hoje');
  return feitos;
}

/* 5) Processo encerrado → pedir avaliação no Google (uma vez por cliente) */
function pedirAvaliacao_(p, quem) {
  if (!p || !p.cliente_id) return false;
  var tabT = tabela_('Tarefas');
  if (tabT.linhas.some(function (t) { return (t.descricao || '').indexOf('[avaliacao:' + p.cliente_id + ']') >= 0; })) return false;
  var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === p.cliente_id; })[0];
  if (!c) return false;
  novaTarefaRobo_(tabT, { _motivo: 'processo encerrado' + (quem ? ' (' + quem + ')' : ''),
    titulo: 'Pedir avaliação no Google — ' + c.nome + ' (processo encerrado)',
    descricao: 'O processo ' + (p.numero || '') + ' foi encerrado. Se o cliente ficou satisfeito com o atendimento, mande a mensagem pelo botão de WhatsApp pedindo a avaliação no Google. Se não for o caso, apenas conclua a tarefa.\n[avaliacao:' + c.id + ']\n[wa:avaliacao]',
    responsavel: respSecretaria_(), processo_id: p.id, numero: p.numero || '', cliente_id: c.id, vence_em: somarDias_(hojeSP_(), 2), prioridade: 'baixa' });
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
  ciencia: { nome: 'Petição genérica — ciência e prosseguimento', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_CIENCIA_ID' },
  dilacao: { nome: 'Petição genérica — pedido de mais prazo (dilação)', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_DILACAO_ID' },
  impulso: { nome: 'Petição genérica — pedido de andamento (processo parado)', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_IMPULSO_ID' },
  laudo: { nome: 'Petição genérica — manifestação sobre o laudo pericial', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_LAUDO_ID' },
  calculos: { nome: 'Petição genérica — concordância com os cálculos', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_CALCULOS_ID' },
  alvara: { nome: 'Petição genérica — expedição de alvará / levantamento de valores', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_ALVARA_ID' },
  endereco: { nome: 'Petição genérica — informa novo endereço / telefone da parte', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_ENDERECO_ID' },
  testemunhas: { nome: 'Petição genérica — rol de testemunhas', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_TESTEMUNHAS_ID' },
  video: { nome: 'Petição genérica — participação na audiência por videoconferência', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_VIDEO_ID' },
  manifestacao: { nome: 'Petição genérica — manifestação (texto livre)', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO9_MANIFESTACAO_ID' },
  substabelecimento: { nome: 'Substabelecimento com reserva de poderes', grupo: 'Petições (precisam do nº do processo)', processo: true, config: 'MODELO6_SUBSTABELECIMENTO_ID', antigo: ['MODELO5_SUBSTABELECIMENTO_ID', 'MODELO4_SUBSTABELECIMENTO_ID', 'MODELO3_SUBSTABELECIMENTO_ID'] },
  contrato: { assinaCliente: true, nome: 'Contrato de honorários advocatícios', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, umaFolha: 'mini', config: 'MODELO10_CONTRATO_ID', antigo: ['MODELO9_CONTRATO_ID', 'MODELO8_CONTRATO_ID', 'MODELO7_CONTRATO_ID', 'MODELO6_CONTRATO_ID', 'MODELO5_CONTRATO_ID', 'MODELO4_CONTRATO_ID', 'MODELO3_CONTRATO_ID', 'MODELO2_CONTRATO_ID', 'MODELO_CONTRATO_ID'] },
  prestacao: { assinaCliente: true, nome: 'Contrato de prestação de serviços advocatícios (extrajudicial)', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, config: 'MODELO9_PRESTACAO_ID', antigo: ['MODELO8_PRESTACAO_ID', 'MODELO6_PRESTACAO_ID', 'MODELO5_PRESTACAO_ID', 'MODELO4_PRESTACAO_ID', 'MODELO3_PRESTACAO_ID', 'MODELO2_PRESTACAO_ID'] },
  assessoria: { assinaCliente: true, nome: 'Contrato de assessoria jurídica (mensal)', grupo: 'Contratos, recibos e cobrança', financeiro: true, mensal: true, config: 'MODELO9_ASSESSORIA_ID', antigo: ['MODELO8_ASSESSORIA_ID', 'MODELO6_ASSESSORIA_ID', 'MODELO5_ASSESSORIA_ID', 'MODELO4_ASSESSORIA_ID', 'MODELO3_ASSESSORIA_ID', 'MODELO2_ASSESSORIA_ID'] },
  recibo: { nome: 'Recibo de honorários', grupo: 'Contratos, recibos e cobrança', financeiro: true, recibo: true, config: 'MODELO6_RECIBO_ID', antigo: ['MODELO5_RECIBO_ID', 'MODELO4_RECIBO_ID', 'MODELO3_RECIBO_ID', 'MODELO2_RECIBO_ID'] },
  cobranca: { nome: 'Notificação de cobrança de honorários em atraso', grupo: 'Contratos, recibos e cobrança', financeiro: true, cobranca: true, config: 'MODELO6_COBRANCA_ID', antigo: ['MODELO5_COBRANCA_ID', 'MODELO4_COBRANCA_ID', 'MODELO3_COBRANCA_ID'] },
  promissoria: { assinaCliente: true, nome: 'Notas promissórias das parcelas', grupo: 'Contratos, recibos e cobrança', financeiro: true, honorarios: true, gerado: true },
  procuracao_inventario: { assinaCliente: true, nome: 'Procuração para inventário e partilha (judicial ou em cartório)', grupo: 'Procuração e declarações', umaFolha: true, config: 'MODELO7_PROC_INVENTARIO_ID' },
  isencao_irpf: { assinaCliente: true, nome: 'Requerimento de isenção do imposto de renda (doença grave)', grupo: 'Procuração e declarações', config: 'MODELO7_ISENCAO_IRPF_ID' },
  comparecimento: { nome: 'Declaração de comparecimento ao escritório', grupo: 'Procuração e declarações', umaFolha: true, config: 'MODELO7_COMPARECIMENTO_ID' },
  notificacao: { nome: 'Notificação extrajudicial (em nome do cliente)', grupo: 'Petições e notificações', config: 'MODELO7_NOTIFICACAO_ID' },
  contrato_previdenciario: { assinaCliente: true, nome: 'Contrato de honorários previdenciário (INSS — 30% / benefícios)', grupo: 'Contratos, recibos e cobrança', financeiro: true, config: 'MODELO10_CONTRATO_PREV_ID', antigo: ['MODELO9_CONTRATO_PREV_ID', 'MODELO8_CONTRATO_PREV_ID', 'MODELO7_CONTRATO_PREV_ID'] }
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
  ciencia: CABECALHO_PETICAO.concat([
    ['t', 'MANIFESTAÇÃO'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência manifestar **CIÊNCIA** {{detalhes_ou_ato}} e requerer o regular prosseguimento do feito.'],
    ['p', 'Nada mais havendo a requerer neste momento, aguarda as próximas determinações deste Juízo.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  dilacao: CABECALHO_PETICAO.concat([
    ['t', 'PEDIDO DE DILAÇÃO DE PRAZO'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência requerer a **DILAÇÃO DO PRAZO** concedido, pelos motivos a seguir expostos.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'O pedido é feito de boa-fé, dentro do prazo em curso, e não traz prejuízo à parte contrária nem ao andamento do processo (art. 139, VI, do Código de Processo Civil).'],
    ['p', 'Diante do exposto, requer a prorrogação do prazo por mais [COMPLETAR: número] dias, contados do fim do prazo atual.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  impulso: CABECALHO_PETICAO.concat([
    ['t', 'PEDIDO DE ANDAMENTO'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência expor e requerer o que segue.'],
    ['p', 'O processo encontra-se sem movimentação relevante desde [COMPLETAR: data da última movimentação], sem que haja providência pendente a cargo da parte.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Em atenção ao princípio da duração razoável do processo (art. 5º, LXXVIII, da Constituição Federal, e art. 4º do Código de Processo Civil), requer o regular impulso do feito, com a adoção das providências cabíveis para o seu prosseguimento.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  laudo: CABECALHO_PETICAO.concat([
    ['t', 'MANIFESTAÇÃO SOBRE O LAUDO PERICIAL'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência manifestar-se sobre o **LAUDO PERICIAL** juntado aos autos, nos termos a seguir.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Diante do exposto, requer:'],
    ['p', 'a) o recebimento da presente manifestação;'],
    ['p', 'b) [COMPLETAR: a homologação do laudo / a intimação do(a) perito(a) para responder aos quesitos complementares / a realização de nova perícia];'],
    ['p', 'c) o regular prosseguimento do feito.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  calculos: CABECALHO_PETICAO.concat([
    ['t', 'MANIFESTAÇÃO SOBRE OS CÁLCULOS'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência manifestar **CONCORDÂNCIA** com os cálculos apresentados {{detalhes_ou_calculos}}.'],
    ['p', 'Diante do exposto, requer a homologação dos cálculos e o prosseguimento da execução, com a expedição do alvará ou da requisição de pagamento em favor da parte autora, depois de cumpridas as formalidades legais.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  alvara: CABECALHO_PETICAO.concat([
    ['t', 'PEDIDO DE EXPEDIÇÃO DE ALVARÁ'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência requerer a **EXPEDIÇÃO DE ALVARÁ** para o levantamento dos valores depositados nos autos.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Requer que o alvará seja expedido em favor de **{{nome}}** e/ou de {{adv:seu|sua}} {{adv:procurador|procuradora}}, **{{advogado_nome}}**, {{advogado_oab}}, que tem poderes para receber e dar quitação, com transferência para a conta: [COMPLETAR: banco, agência, conta e titular].'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  endereco: CABECALHO_PETICAO.concat([
    ['t', 'INFORMAÇÃO DE NOVO ENDEREÇO'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência informar que a parte passou a ter o seguinte endereço e contato, para fins de intimação: {{endereco_atual}}{{telefone_atual}}.'],
    ['p', 'Requer a atualização dos dados nos autos e no sistema, para que as próximas comunicações sejam feitas no endereço informado.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  testemunhas: CABECALHO_PETICAO.concat([
    ['t', 'ROL DE TESTEMUNHAS'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência apresentar o **ROL DE TESTEMUNHAS**, que comparecerão à audiência [COMPLETAR: independentemente de intimação / mediante intimação]:'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Requer a juntada do presente rol e, sendo o caso, a intimação das testemunhas nos endereços indicados.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  video: CABECALHO_PETICAO.concat([
    ['t', 'REQUERIMENTO DE PARTICIPAÇÃO POR VIDEOCONFERÊNCIA'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência requerer que a parte e {{adv:seu|sua}} {{adv:procurador|procuradora}} participem da audiência designada **POR VIDEOCONFERÊNCIA**.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Requer, para tanto, o envio do link de acesso aos endereços eletrônicos cadastrados nos autos ou a indicação da sala virtual.'],
    ['c', 'Nestes termos, pede deferimento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['adv']
  ]),
  manifestacao: CABECALHO_PETICAO.concat([
    ['t', 'MANIFESTAÇÃO'],
    ['p', '**{{nome}}**, já qualificad{{c:o|a}} nos autos do processo em epígrafe, por {{adv:seu|sua}} {{adv:procurador|procuradora}} que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência manifestar-se nos seguintes termos.'],
    ['p', '{{detalhes_peticao}}'],
    ['p', 'Diante do exposto, requer o recebimento da presente manifestação e o regular prosseguimento do feito.'],
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
  contrato: [ // 8.10: mesmas 11 cláusulas, texto enxuto para caber em UMA folha (pedido da usuária)
    ['t', 'CONTRATO DE HONORÁRIOS ADVOCATÍCIOS'],
    ['p', '**CONTRATANTE:** **{{nome}}**, {{qualificacao_resto}}.'],
    ['p', '**CONTRATADA:** **{{escritorio}}**, {{escritorio_qualificacao}}, representada por **{{advogado_nome}}**, {{advogado_oab_qualif}}.'],
    ['p', '**CLÁUSULA 1ª – OBJETO.** A CONTRATADA prestará {{c:ao|à}} CONTRATANTE os serviços advocatícios de: {{objeto}}. Não estão incluídos outros processos, incidentes autônomos, ações rescisórias, sustentação oral, nem recursos ou contrarrazões à TNU, aos Tribunais Superiores e ao STF, que dependerão de ajuste próprio.'],
    ['p', '**CLÁUSULA 2ª – HONORÁRIOS.** {{clausula_honorarios}} § 1º O pagamento será feito por PIX ou depósito ({{escritorio_pix}}), valendo o comprovante como recibo. § 2º Os honorários de sucumbência pertencem integralmente à CONTRATADA (arts. 22 e 23 da Lei nº 8.906/1994). § 3º Havendo alvará, RPV, precatório, acordo ou depósito judicial, a CONTRATADA poderá reter os seus honorários, repassando o saldo {{c:ao|à}} CONTRATANTE com prestação de contas.'],
    ['p', '{{clausula_promissoria_contrato}}'],
    ['p', '**CLÁUSULA 3ª – DESPESAS.** Custas, perícias, emolumentos, cópias, certidões, diligências fora da comarca e deslocamentos acima de 100 km da sede da CONTRATADA não estão incluídos nos honorários e correm por conta d{{c:o|a}} CONTRATANTE.'],
    ['p', '**CLÁUSULA 4ª – OBRIGAÇÕES D{{c:O|A}} CONTRATANTE.** Entregar os documentos e as informações pedidos, de forma verdadeira e completa; avisar mudança de telefone, endereço ou e-mail; e comparecer às audiências, perícias e atos para os quais for intimad{{c:o|a}} ou convocad{{c:o|a}}. A CONTRATADA não responde por prejuízo causado pela falta ou inexatidão dessas informações.'],
    ['p', '**CLÁUSULA 5ª – ACORDOS.** É vedado {{c:ao|à}} CONTRATANTE fazer acordo ou receber valores do litígio sem a anuência da CONTRATADA; se o fizer, os honorários serão devidos integralmente.'],
    ['p', '**CLÁUSULA 6ª – OBRIGAÇÃO DE MEIO.** A CONTRATADA empregará todo o zelo e a técnica profissional na defesa d{{c:o|a}} CONTRATANTE, sem garantir o resultado.'],
    ['p', '**CLÁUSULA 7ª – ATRASO.** A parcela em atraso terá multa de 2%, juros de 1% ao mês e correção pelo INPC. O atraso superior a 30 dias antecipa o vencimento das demais parcelas e autoriza a CONTRATADA a suspender os serviços não urgentes e, persistindo, a renunciar ao mandato com aviso de 10 dias (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do CPC), sem prejuízo dos honorários vencidos e dos proporcionais ao trabalho realizado.'],
    ['p', '**CLÁUSULA 8ª – DESISTÊNCIA E AUSÊNCIA.** {{c:O|A}} CONTRATANTE pagará multa de 2 (dois) salários mínimos se desistir da ação ou da contratação ou se faltar sem justificativa a audiência ou perícia para a qual tenha sido intimad{{c:o|a}} ou avisad{{c:o|a}}, vencível em 10 dias, sem prejuízo dos honorários vencidos, dos proporcionais e do êxito obtido com o trabalho da CONTRATADA.'],
    ['p', '**CLÁUSULA 9ª – DESCUMPRIMENTO.** A parte que descumprir este contrato pagará multa de 5% sobre o seu valor total, além das perdas e danos.'],
    ['p', '**CLÁUSULA 10ª – SIGILO E DADOS.** A CONTRATADA manterá sigilo e usará os dados d{{c:o|a}} CONTRATANTE apenas para executar este contrato e cumprir a lei (Estatuto da Advocacia e Lei nº 13.709/2018 – LGPD).'],
    ['p', '**CLÁUSULA 11ª – TÍTULO EXECUTIVO E FORO.** Este contrato é título executivo extrajudicial (art. 24 da Lei nº 8.906/1994 e art. 784, XII, do CPC). Fica eleito o foro da Comarca de {{foro}}.'],
    ['p', 'E, por estar de acordo, {{c:o|a}} CONTRATANTE assina o presente instrumento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE']
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
    ['p', 'E, por estar de acordo, {{c:o|a}} CONTRATANTE assina o presente instrumento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE']
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
    ['p', 'E, por estar de acordo, {{c:o|a}} CONTRATANTE assina o presente instrumento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE']
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
    ['p', 'a) Nas CONCESSÕES, {{c:o|a}} CONTRATANTE pagará {{prev_concessao}};'],
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
    ['p', '{{c:O|A}} CONTRATANTE pagará à CONTRATADA multa equivalente a 2 (dois) salários mínimos vigentes à época do pagamento: a) em caso de desistência; b) em caso de não comparecimento injustificado a perícia, avaliação social ou audiência para a qual tenha sido convocad{{c:o|a}} ou avisad{{c:o|a}} pela CONTRATADA. As multas são devidas sem prejuízo dos honorários e podem ser cobradas judicialmente, valendo este contrato como título executivo extrajudicial (art. 24 da Lei nº 8.906/1994 e art. 784, XII, do Código de Processo Civil).'],
    ['p', 'Parágrafo único. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a CONTRATADA, independentemente de outras medidas, a suspender a prestação dos serviços não urgentes até a regularização e, persistindo a inadimplência, a renunciar ao mandato, mediante notificação {{c:ao|à}} CONTRATANTE com 10 (dez) dias de antecedência, período em que continuará a representá-l{{c:o|a}} para evitar prejuízo (art. 5º, § 3º, da Lei nº 8.906/1994 e art. 112 do Código de Processo Civil), cabendo {{c:ao|à}} CONTRATANTE constituir novo advogado. A suspensão ou a renúncia não afasta o dever de pagar os honorários vencidos e os proporcionais ao trabalho já realizado.'],
    ['h', 'CLÁUSULA 6ª – DO FALECIMENTO E DA HABILITAÇÃO DE HERDEIROS'],
    ['p', 'Em caso de falecimento d{{c:o|a}} CONTRATANTE, os sucessores obrigam-se a cumprir integralmente o presente contrato, sendo devidos honorários adicionais de 5% (cinco por cento) pela habilitação dos herdeiros.'],
    ['h', 'CLÁUSULA 7ª – DA NATUREZA DA OBRIGAÇÃO E DO SIGILO'],
    ['p', 'A obrigação da CONTRATADA é de meio, e não de resultado. A CONTRATADA manterá sigilo sobre as informações recebidas e tratará os dados pessoais d{{c:o|a}} CONTRATANTE apenas para a execução deste contrato (Lei nº 13.709/2018 — LGPD).'],
    ['h', 'CLÁUSULA 8ª – DO FORO'],
    ['p', 'Fica eleito o foro da Comarca de {{foro}} para dirimir quaisquer dúvidas oriundas deste contrato.'],
    ['p', 'E, por estar de acordo, {{c:o|a}} CONTRATANTE assina o presente instrumento.'],
    ['c', '{{cidade_assinatura}}, {{data_extenso}}.'],
    ['a', '{{nome}}|CONTRATANTE']
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
  var mini = compacto === 'mini'; // 8.10: contrato de honorários em UMA folha (fonte 10,5, espaço simples), sem perder o padrão visual
  if (mini) corpo.setMarginTop(20).setMarginBottom(20).setMarginLeft(62).setMarginRight(48);
  else if (compacto) corpo.setMarginTop(28).setMarginBottom(28).setMarginLeft(71).setMarginRight(50);
  else corpo.setMarginTop(42).setMarginBottom(42).setMarginLeft(85).setMarginRight(57);
  var fonte = function (el, tam) { var t = el.editAsText(); if (t.getText().length) t.setFontFamily('EB Garamond').setFontSize(tam || (mini ? 10.5 : 12)); return el; };
  // cabeçalho: logo + linha
  var cab = doc.getHeader() || doc.addHeader();
  var pLogo = cab.getParagraphs()[0] || cab.appendParagraph('');
  pLogo.setAlignment(A.CENTER);
  var blob = null;
  LOGO_DOCUMENTOS.some(function (url) {
    try { var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); if (r.getResponseCode() === 200) blob = r.getBlob(); } catch (e) { /* tenta o próximo */ }
    return !!blob;
  });
  if (blob) pLogo.appendInlineImage(blob).setWidth(mini ? 62 : compacto ? 80 : 105).setHeight(mini ? 49 : compacto ? 63 : 83);
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
    p.setAlignment(alin).setSpacingAfter(mini ? Math.min(dep, 3) : compacto ? Math.min(dep, 6) : dep).setSpacingBefore(mini ? Math.min(antes || 0, 4) : compacto ? Math.min(antes || 0, 8) : (antes || 0)).setLineSpacing(mini ? 1.0 : compacto ? 1.1 : 1.5);
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
      par('', A.CENTER, 0, mini ? 10 : 18);
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

/** 8.11.2: contrato de honorários no PADRÃO do escritório (em vez de uma folha): EB Garamond 12, entrelinha 1,5, 8 pt depois,
 *  recuo de 1 cm no texto corrido, margens normais e logo do tamanho normal. */
function padraoContrato_(doc, corpo) {
  var A = DocumentApp.HorizontalAlignment;
  corpo.setMarginTop(42).setMarginBottom(42).setMarginLeft(85).setMarginRight(57);
  corpo.getParagraphs().forEach(function (p) {
    var pai = p.getParent(); if (pai && pai.getType() === DocumentApp.ElementType.TABLE_CELL) return;
    var t = p.getText();
    if (t.length) p.editAsText().setFontFamily('EB Garamond').setFontSize(12);
    p.setLineSpacing(1.5).setSpacingAfter(t.trim() ? 8 : 0);
    if (p.getAlignment() === A.JUSTIFY && t.length > 120) p.setIndentFirstLine(28.35);
  });
  try { var cab = doc.getHeader(); if (cab) cab.getImages().forEach(function (im) { im.setWidth(105).setHeight(83); }); } catch (e) { /* segue */ }
}

/** 8.11: PADRÃO DE PETIÇÕES do escritório (docs/PADRAO-PETICOES.md), aplicado na cópia gerada (o modelo editado pela equipe fica como está):
 *  EB Garamond 12, justificado, entrelinha 1,5, 8 pt depois do parágrafo, recuo de 1 cm na 1ª linha; títulos (parágrafo todo em negrito,
 *  alinhado à esquerda) em MAIÚSCULAS; artigo citado (parágrafo que começa com "Art." ou entre aspas) em fonte 10 com recuo de 6 cm. */
function padraoPeticao_(corpo) {
  var A = DocumentApp.HorizontalAlignment, CM = 28.35;
  corpo.getParagraphs().forEach(function (p) {
    var pai = p.getParent(); if (pai && pai.getType() === DocumentApp.ElementType.TABLE_CELL) return;
    var t = p.getText(); if (!t.trim()) { p.setSpacingAfter(0); return; }
    var al = p.getAlignment(), ed = p.editAsText();
    var todoNegrito = ed.isBold(0) && ed.isBold(t.length - 1) && ed.isBold(Math.floor(t.length / 2));
    if (al === A.CENTER || al === A.RIGHT) return;
    if (todoNegrito && t.length < 140) { // título de tópico
      if (t !== t.toUpperCase()) { p.setText(t.toUpperCase()); p.editAsText().setBold(true).setFontFamily('EB Garamond').setFontSize(12); }
      p.setIndentFirstLine(0).setIndentStart(0).setLineSpacing(1.5).setSpacingAfter(8).setSpacingBefore(8);
      return;
    }
    if (/^\s*(Art\.|Artigo\s+\d|§|“|")/.test(t) && t.length < 1500) { // dispositivo legal citado
      p.setAlignment(A.JUSTIFY).setIndentStart(6 * CM).setIndentFirstLine(6 * CM).setLineSpacing(1.0).setSpacingAfter(8);
      p.editAsText().setFontSize(10);
      return;
    }
    if (al === A.JUSTIFY || al === A.LEFT && t.length > 160) p.setAlignment(A.JUSTIFY).setIndentFirstLine((p.getIndentStart() || 0) + CM).setLineSpacing(1.5).setSpacingAfter(8);
  });
}

/* ---------- 8.11: honorários do levantamento (GEA + contratos/promissórias do Drive) que ainda não estão no painel ---------- */
/** Lê a planilha "Honorários Araújo — levantamento e conciliação" (abas Contratos, Mensalistas, Cobranças, Promissórias) e devolve,
 *  por cliente do painel SEM honorário, o que foi achado. Nada é lançado sozinho: a equipe confere e aperta "Lançar" (ou "Não lançar"). */
function levantamentoHonorarios_(d, u) {
  var ign = {}; try { ign = JSON.parse(config_('LEVANT_IGNORADOS') || '{}'); } catch (e) { ign = {}; }
  if (d.acao === 'ignorar' || d.acao === 'voltar') {
    if (d.acao === 'ignorar') ign[d.cliente_id] = (u.nome || u.usuario) + ' ' + hojeSP_(); else delete ign[d.cliente_id];
    setConfig_('LEVANT_IGNORADOS', JSON.stringify(ign), 'Clientes do levantamento de honorários marcados "não lançar"');
    return { ok: true };
  }
  if (d.acao === 'lancar_exito') {
    var ids = (d.itens || []).slice(0, 150), feitos = 0;
    ids.forEach(function (it) {
      try {
        salvarHonorario_({ honorario: { cliente_id: it.cliente_id, processo_id: it.processo_id || '', tipo: 'exito', percentual: String(it.percentual),
          descricao: 'Êxito (contrato antigo)', situacao: 'importado — conferir', observacoes: 'Do levantamento de contratos (GEA/Drive). ' + String(it.fonte || '').slice(0, 300) } }, u);
        feitos++;
      } catch (e) { /* segue com os outros */ }
    });
    registrar_(u.usuario, 'honorários do levantamento lançados', feitos + ' de êxito');
    return { ok: true, feitos: feitos };
  }
  var id = config_('LEVANTAMENTO_ID');
  if (!id) {
    var it = DriveApp.searchFiles("title contains 'Honorários Araújo — levantamento' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    if (!it.hasNext()) throw falha_('Não achei a planilha "Honorários Araújo — levantamento e conciliação" no Drive.');
    id = it.next().getId(); setConfig_('LEVANTAMENTO_ID', id, 'Planilha do levantamento de honorários (GEA + contratos)');
  }
  var ss = SpreadsheetApp.openById(id);
  var semAc = function (t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/PASTA:|—.*$| - .*$|QUALIFICA.*$/g, '').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim(); };
  var clientes = tabela_('Clientes').linhas, porNome = {}, porPontas = {};
  clientes.forEach(function (c) { var k = semAc(c.nome); porNome[k] = c; var p = k.split(' '); if (p.length > 1) { var kk = p[0] + '|' + p[p.length - 1]; porPontas[kk] = porPontas[kk] === undefined ? c : null; } });
  var acha = function (n) { var k = semAc(n); if (porNome[k]) return porNome[k]; var p = k.split(' '); return p.length > 1 ? porPontas[p[0] + '|' + p[p.length - 1]] || null : null; };
  var temHon = {}, canc = {}; tabela_('Honorarios').linhas.forEach(function (h) { if (h.situacao !== 'cancelado') temHon[h.cliente_id] = 1; else canc[h.id] = 1; });
  // 8.11.2: dívida do sistema antigo (cobranças, agenda do GEA) vale para quem NÃO tem parcela em aberto no painel, mesmo com honorário
  var temAberto = {}; tabela_('Parcelas').linhas.forEach(function (p) { if (!p.pago_em && !canc[p.honorario_id]) temAberto[p.cliente_id] = 1; });
  var procAtivo = {}; tabela_('Processos').linhas.forEach(function (p) { if (p.cliente_id && p.status !== 'arquivado' && p.numero) procAtivo[p.cliente_id] = procAtivo[p.cliente_id] || p.id; });
  var MES = { janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
  var dataExt = function (t) { var m = /(\d{1,2}) de ([a-zçã]+) de (\d{4})/i.exec(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()); return m && MES[m[2]] ? m[3] + '-' + MES[m[2]] + '-' + ('0' + m[1]).slice(-2) : ''; };
  var por = {};
  var add = function (n, f) {
    var c = acha(n); if (!c) return;
    if (/^(Cobrança|Agenda GEA)$/.test(f.aba) ? temAberto[c.id] : temHon[c.id]) return;
    var x = por[c.id] = por[c.id] || { cliente_id: c.id, nome: c.nome, telefone: c.telefone || '', processo_id: procAtivo[c.id] || '', ativo: !!procAtivo[c.id], ignorado: ign[c.id] || '', fontes: [] };
    if (x.fontes.length < 6) x.fontes.push(f);
  };
  var aba = function (nome, cab, fn) {
    var sh = ss.getSheetByName(nome); if (!sh) return;
    var v = sh.getDataRange().getValues(), i = 0;
    while (i < v.length && !v[i].some(function (c) { return cab.test(String(c)); })) i++;
    for (var r = i + 1; r < v.length; r++) if (v[r][0]) fn(v[r]);
  };
  aba('Contratos', /^Contratante/, function (r) {
    var pct = +r[3] || 0, val = +r[2] || 0, parc = +r[4] || 0;
    add(r[0], { aba: 'Contrato', modalidade: String(r[1] || ''), percentual: pct ? Math.round(pct * (pct <= 1 ? 100 : 1) * 100) / 100 : 0, valor: val, parcelas: parc,
      assinatura: String(r[5] || ''), trecho: String(r[6] || '').slice(0, 220), link: String(r[8] || '') });
  });
  aba('Mensalistas', /^Cliente/, function (r) { add(r[0], { aba: 'Mensalista', mensal: +r[1] || 0, parcelas: +r[2] || 0, inicio: r[3] instanceof Date ? Utilities.formatDate(r[3], 'America/Sao_Paulo', 'yyyy-MM-dd') : '', obs: String(r[5] || '').slice(0, 200), link: String(r[6] || '') }); });
  aba('Cobranças', /^Cliente/, function (r) { if (/quitad|parcela paga|pago/i.test(String(r[3] || ''))) return; add(r[0], { aba: 'Cobrança', situacao: String(r[1] || '') + ' · ' + String(r[3] || ''), valor: +r[2] || 0, obs: String(r[5] || '').slice(0, 200), link: /^https?:/.test(String(r[6] || '')) ? String(r[6]) : '' }); });
  aba('Promissórias', /^Emitente/, function (r) {
    var venc = String(r[3] || ''), n = venc ? venc.split('/').length : 0;
    add(r[0], { aba: 'Promissórias', valor: +String(r[2] || '').replace(/[^\d,.]/g, '').replace(',', '.') || 0, parcelas: n, primeiro: dataExt(venc), vencimentos: venc.slice(0, 160), link: String(r[5] || '') });
  });
  // 8.11.2: parcelas que estavam só na AGENDA do GEA ("verificar pagamento R$ 400,00 referente parcela 3/5"), anotadas desde 2026
  (function () {
    var sh = ss.getSheetByName('Histórico GEA'); if (!sh) return;
    var v = sh.getDataRange().getValues(), ult = {};
    v.forEach(function (r) {
      var t = String(r[4] || ''), m = /parcela[s]?\s*(?:n[°º]?\s*)?(\d+)\s*\/\s*(\d+)/i.exec(t), val = /R\$\s*([\d.]+,\d{2})/.exec(t);
      if (!r[0] || !m || !val || !(r[1] instanceof Date)) return;
      var dia = Utilities.formatDate(r[1], 'America/Sao_Paulo', 'yyyy-MM-dd'); if (dia < '2026-01-01') return;
      var k = String(r[0]); if (!ult[k] || ult[k].dia < dia) ult[k] = { dia: dia, x: +m[1], y: +m[2], valor: dinheiro_(val[1]), texto: t.slice(0, 160), link: String(r[5] || '') };
    });
    Object.keys(ult).forEach(function (k) {
      var u2 = ult[k], resta = Math.max(1, u2.y - u2.x + 1);
      add(k, { aba: 'Agenda GEA', valor: u2.valor, parcelas: resta, primeiro: u2.dia, obs: 'parcela ' + u2.x + '/' + u2.y + ' anotada em ' + dataBR_(u2.dia) + ': ' + u2.texto, link: u2.link });
    });
  })();
  var lista = Object.keys(por).map(function (k) { return por[k]; })
    .sort(function (a, b) { return (b.ativo - a.ativo) || (!!a.ignorado - !!b.ignorado) || (a.nome < b.nome ? -1 : 1); });
  return { lista: lista, total: lista.length, ativos: lista.filter(function (x) { return x.ativo && !x.ignorado; }).length };
}

/** 8.10 (pedido da usuária: "deixe todo mundo mexer nos modelos"): dá permissão de EDIÇÃO nos modelos (Google Docs do painel e a pasta
    de modelos do escritório) para os e-mails Google da equipe (coluna email de Usuários) e para os e-mails digitados. Não toca em pasta de cliente. */
function liberarEdicaoModelos_(d, u) {
  var extras = String(d.emails || '').split(/[\s,;]+/).map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e); });
  var equipe = usuarios_().filter(function (x) { return x.ativo === 'sim'; });
  var semEmail = equipe.filter(function (x) { return !/@/.test(x.email || ''); }).map(function (x) { return x.nome || x.usuario; });
  var emails = equipe.map(function (x) { return String(x.email || '').trim().toLowerCase(); }).filter(function (e) { return /@/.test(e); }).concat(extras)
    .filter(function (e, i, a) { return a.indexOf(e) === i; });
  if (!emails.length) throw falha_('Ninguém da equipe tem e-mail Google cadastrado. Cadastre em Usuários (campo E-mail) ou digite os e-mails aqui.');
  var alvos = [], erros = [];
  try { alvos.push({ nome: 'pasta de modelos do escritório', obj: DriveApp.getFolderById(config_('MODELOS_ESCRITORIO_PASTA') || PASTA_MODELOS_ESCRITORIO) }); } catch (e) { erros.push('pasta de modelos: ' + (e.message || e)); }
  Object.keys(MODELOS).forEach(function (k) {
    if (MODELOS[k].gerado) return;
    try { alvos.push({ nome: MODELOS[k].nome, obj: DriveApp.getFileById(modeloId_(k)) }); } catch (e) { erros.push(MODELOS[k].nome + ': ' + (e.message || e)); }
  });
  var feitos = 0;
  alvos.forEach(function (a) {
    var ja = {}; try { a.obj.getEditors().forEach(function (x) { ja[String(x.getEmail()).toLowerCase()] = 1; }); } catch (e) { /* segue */ }
    var novos = emails.filter(function (e) { return !ja[e]; });
    if (!novos.length) return;
    try { a.obj.addEditors(novos); feitos++; } catch (e) { erros.push(a.nome + ': ' + String(e.message || e).slice(0, 120)); }
  });
  registrar_(u.usuario, 'modelos: edição liberada', emails.join(', '));
  return { emails: emails, semEmail: semEmail, arquivos: alvos.length, atualizados: feitos, erros: erros.slice(0, 10) };
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
    modelos: [].concat(Object.keys(MODELOS).map(function (k) { // todos os perfis geram todos os documentos (pedido da usuária, 8.3.2)
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

/** Contrato previdenciário — o que se paga nas concessões (escolha no gerador, pedido da usuária). */
function textoPrevConcessao_(p) {
  var pc = Math.round(dinheiro_(p.percentual) || 30), pcTxt = pc + '% (' + extenso_(pc).replace(/\s+(?:real|reais)$/, '') + ' por cento)';
  if (p.forma === 'duas_retro') return 'o equivalente às 2 (duas) primeiras parcelas do benefício concedido, acrescido de ' + pcTxt + ' dos valores retroativos (atrasados) recebidos judicial e/ou administrativamente até a data da efetiva implantação do benefício';
  if (p.forma === 'duas') return 'o equivalente às 2 (duas) primeiras parcelas do benefício concedido, sem incidência de percentual sobre os valores retroativos (atrasados)';
  return 'o equivalente a 2 (dois) benefícios ou ' + pcTxt + ' dos valores brutos recebidos judicial e/ou administrativamente até a data da efetiva implantação do benefício, o que for maior, não podendo esta quantia ser inferior a 3 (três) vezes o valor do benefício, ainda que opte por não recebê-lo';
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

/** Texto curto do honorário combinado no formulário ("Parcelado: R$ 3.000,00 em 3x"). */
function resumoHonForm_(f) {
  var v = function (x) { return 'R$ ' + (dinheiro_(x) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  if (f.forma === 'avista') return 'À vista: ' + v(f.valor_total);
  if (f.forma === 'parcelado') return 'Parcelado: ' + v(f.valor_total) + ' em ' + (parseInt(f.parcelas, 10) || 1) + 'x';
  if (f.forma === 'percentual') return 'Êxito: ' + f.percentual + '%';
  if (f.forma === 'misto') return v(f.valor_total) + ' em ' + (parseInt(f.parcelas, 10) || 1) + 'x + ' + f.percentual + '% no êxito';
  if (f.forma === 'mensal') return 'Mensal: ' + v(f.valor_mensal);
  return '';
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
    '{{prev_concessao}}': textoPrevConcessao_(d.prev || {}),
    '{{detalhes_peticao}}': detalhes || '[COMPLETAR: descreva aqui os fatos e o pedido específico deste caso]',
    '{{detalhes_ou_ato}}': detalhes ? 'de ' + detalhes : 'do(a) [COMPLETAR: despacho / decisão / documento] de [COMPLETAR: data/ID]',
    '{{detalhes_ou_calculos}}': detalhes ? '(' + detalhes + ')' : 'pelo [COMPLETAR: contador do Juízo / perito / parte contrária], no valor de R$ [COMPLETAR]',
    '{{endereco_atual}}': c.endereco ? [c.endereco, c.cidade && c.uf ? c.cidade + '/' + c.uf : c.cidade, c.cep ? 'CEP ' + c.cep : ''].filter(Boolean).join(', ') : '[COMPLETAR: endereço]',
    '{{telefone_atual}}': c.telefone ? ', telefone ' + c.telefone : '',
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
  valores['{{clausula_promissoria_contrato}}'] = temParcelasFixas ? valores['{{clausula_promissoria}}'].replace('Parágrafo segundo. O pagamento das parcelas é garantido', '§ 4º As parcelas são garantidas').replace('as quais perderão a validade e serão devolvidas à medida que as parcelas forem quitadas', 'devolvidas à medida que forem quitadas') : REMOVER;
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
    if (modeloDrivePrecisaProcesso_(m.nome) || /peti[cç][aã]o|apela[cç]|reclama[cç]|recurso|contesta/i.test(nomeModeloDrive_(m.nome))) padraoPeticao_(doc.getBody());
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
    if (MODELOS[k].processo && k !== 'substabelecimento') padraoPeticao_(corpo);
    if (d.formato_contrato === 'padrao' && MODELOS[k].umaFolha === 'mini') padraoContrato_(doc, corpo); // 8.11.2: contrato no padrão do escritório
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
  // 8.5.0 (pedido da usuária): o honorário só entra no Financeiro DEPOIS que o cliente assina a procuração e o contrato.
  // Ao gerar, o que foi combinado fica guardado no registro "aguardando assinatura" e é lançado no "✓ Assinado".
  var lancados = [], honPendente = '';
  var assinaveis = quais.filter(function (k) { return /^procuracao|^contrato|^prestacao|^assessoria/.test(k); });
  if (f.lancar && f.forma && f.forma !== 'cadastrado' && quais.some(function (k) { return M(k).honorarios || M(k).mensal; })) {
    var descHon = (tipo ? tipo.nome : 'Honorários') + (contra ? ' — ' + contra : '');
    honPendente = JSON.stringify({ f: { forma: f.forma, valor_total: f.valor_total, parcelas: f.parcelas, primeiro_vencimento: f.primeiro_vencimento, dia_demais: f.dia_demais,
      percentual: f.percentual, valor_mensal: f.valor_mensal, dia_vencimento: f.dia_vencimento }, descricao: descHon, resumo: resumoHonForm_(f) });
    if (!assinaveis.length) { lancados = lancarHonorariosForm_(f, c, descHon, u); honPendente = ''; }
  }
  registrar_(u.usuario, 'documentos gerados', c.id + ' ' + quais.join(',') + (lancados.length ? ' + financeiro' : ''));
  // Procuração/contrato: nem todo documento gerado é assinado (pedido da usuária). Fica "aguardando assinatura"; só quando alguém
  // aperta "✓ Assinado" o cliente entra em Processos como "Petição inicial (a ajuizar)" com a tarefa. Sem assinatura em 7 dias, o robô lembra.
  var aAjuizar = null, assinatura = null;
  if (assinaveis.length) {
    try {
      assinatura = comTrava_(function () {
        var tabA = tabela_('Assinaturas'), agora = new Date().toISOString();
        var nomes = assinaveis.map(function (k) { return (MODELOS[k] || {}).nome || k; });
        var ja = tabA.linhas.filter(function (x) { return x.cliente_id === c.id && x.situacao === 'aguardando'; })[0];
        if (ja) { atualizarLinha_(tabA, ja, { documentos: nomes.join(' · '), gerado_em: agora, gerado_por: u.usuario, tipo_acao: d.tipo_acao || ja.tipo_acao, parte_contraria: contra || ja.parte_contraria, lembretes: '0', lembrete_em: '', honorarios: honPendente || ja.honorarios || '' }); return ja.id; }
        var a = { id: novoId_('AS'), cliente_id: c.id, cliente_nome: c.nome, documentos: nomes.join(' · '), tipo_acao: d.tipo_acao || '', parte_contraria: contra || '', gerado_em: agora,
          gerado_por: u.usuario, situacao: 'aguardando', assinado_em: '', assinado_por: '', processo_id: '', lembretes: '0', lembrete_em: '', pasta_url: c.pasta_url || '', honorarios: honPendente, honorarios_lancados: '' };
        inserirLinha_(tabA, a);
        return a.id;
      });
    } catch (eA) { /* os documentos já foram gerados */ }
  }
  return { honorario_pendente: !!(honPendente && assinatura), a_ajuizar: aAjuizar, assinatura: assinatura, assinatura_docs: assinaveis.length, gerados: gerados, pasta_url: c.pasta_url || ('https://drive.google.com/drive/folders/' + c.pasta_id), pasta_assinar: pastaAssinar ? pastaAssinar.getUrl() : '', imprimir_tudo: impressao, faltando: faltando, lancados: lancados.length, ja_lancados: lancados.repetidos || 0 };
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
var ETAPAS_TAREFA = ['afazer', 'fazendo', 'aguardando', 'revisar', 'protocolado', 'concluido']; // 8.11.2: "Aguardando cliente" (documento, assinatura, resposta)
var NOMES_ETAPA = { afazer: 'A fazer', fazendo: 'Fazendo', aguardando: 'Aguardando cliente', revisar: 'Pronto para revisar', protocolado: 'Feito / protocolado', concluido: 'OK da administração' };
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
    inicial: /\[inicial:/.test(t.descricao || ''), ato: atoDaTarefa_(t.descricao), telefone: (telCli || {})[t.cliente_id] || '',
    wa: ((/\[wa:([a-z]+)\]/.exec(t.descricao || '') || [])[1]) || '' };
}
function atoDaTarefa_(desc) {
  var m = /\[ato:([a-z]+)\|(\d{4}-\d{2}-\d{2})\|([^|\]]*)\|([^\]]*)\]/.exec(desc || '');
  return m ? { tipo: m[1], data: m[2], hora: m[3], local: m[4].trim(), hoje: /\[avisodia\]/.test(desc || '') } : null;
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
    responsaveis: { pje: config_('RESP_PJE') || '', eproc: config_('RESP_EPROC') || '', padrao: config_('RESP_PADRAO') || '', inicial: config_('RESP_INICIAL') || '',
      secretaria: config_('RESP_SECRETARIA') || '', secretaria_auto: respSecretaria_(), avaliacao: config_('LINK_AVALIACAO') || '' },
    link_avaliacao: config_('LINK_AVALIACAO') || LINK_AVALIACAO_PADRAO
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
        var marcas = (String(l.descricao || '').match(/\[(inicial|rep|intim|ato|lembrete|agenda|valor|parado|retomar|assinar|avaliacao|wa|google):[^\]]*\]/g) || []).filter(function (m) { return dados.descricao.indexOf(m) < 0; });
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
      if (d.secretaria !== undefined) setConfig_('RESP_SECRETARIA', validarResponsavel_(d.secretaria), 'Secretaria: cobrar assinaturas, retomar contato e pedir avaliação');
      if (d.avaliacao !== undefined) setConfig_('LINK_AVALIACAO', /^https:\/\/[^\s]+$/.test(String(d.avaliacao).trim()) ? String(d.avaliacao).trim() : '', 'Link "Pedir avaliações" do perfil do Google');
      registrar_(u.usuario, 'responsáveis automáticos', 'PJe ' + (d.pje || '—') + ', eproc ' + (d.eproc || '—') + ', inicial ' + (d.inicial || '—') + '; ' + n + ' prazos distribuídos');
      return { distribuidos: n };
    }
    return { pje: config_('RESP_PJE'), eproc: config_('RESP_EPROC'), padrao: config_('RESP_PADRAO'), inicial: config_('RESP_INICIAL') };
  });
}

/* ---------- Contas a pagar e fluxo de caixa ---------- */

var CATEGORIAS_DESPESA = ['Aluguel e condomínio', 'Salários e pró-labore', 'Impostos e taxas', 'Contador', 'Sistemas, internet e telefone',
  'Energia e água', 'Material de escritório', 'Marketing', 'OAB e anuidades', 'Custas processuais (adiantadas)', 'Perícias e diligências',
  'Deslocamento', 'Retirada / transferência para conta própria', 'A classificar', 'Outros'];

/* ---------- Organizar cadastros (8.7.0): processos sem cliente e cadastros para completar ---------- */
function organizarListar_(d) {
  var clientes = tabela_('Clientes').linhas, procs = tabela_('Processos').linhas, porNome = {};
  clientes.forEach(function (c) { var k = nomeComparavel_(c.nome); (porNome[k] = porNome[k] || []).push(c); });
  var partes = {};
  tabela_('Intimacoes').linhas.forEach(function (i) { if (i.partes_cliente && i.numero) (partes[i.numero] = partes[i.numero] || {})[i.partes_cliente.split(';')[0].trim()] = 1; });
  var sugestoesDe = function (nome) {
    var k = nomeComparavel_(nome), out = [], vistos = {};
    (porNome[k] || []).forEach(function (c) { if (!vistos[c.id]) { vistos[c.id] = 1; out.push({ id: c.id, nome: c.nome, motivo: 'mesmo nome' }); } });
    var p = k.split(' ').filter(function (w) { return w.length > 2; });
    if (p.length >= 2 && out.length < 3) clientes.forEach(function (c) {
      if (vistos[c.id] || out.length >= 4) return;
      var n = nomeComparavel_(c.nome).split(' ');
      var iguais = p.filter(function (w) { return n.indexOf(w) >= 0; }).length;
      if (n[0] === p[0] && iguais >= 2) { vistos[c.id] = 1; out.push({ id: c.id, nome: c.nome, motivo: 'nome parecido' }); }
    });
    return out;
  };
  var semCliente = procs.filter(function (p) { return !p.cliente_id && p.status !== 'arquivado'; }).map(function (p) {
    var nome = p.cliente_nome && !/a identificar|sigil|segredo/i.test(p.cliente_nome) ? p.cliente_nome : (Object.keys(partes[p.numero] || {})[0] || '');
    return { id: p.id, numero: p.numero, orgao: p.orgao || '', area: p.area || '', contra: p.parte_contraria || '', nome: nome, sigilo: /sigil|segredo/i.test(p.cliente_nome || ''),
      sugestoes: nome ? sugestoesDe(nome) : [] };
  }).sort(function (a, b) { return (b.sugestoes.length ? 1 : 0) - (a.sugestoes.length ? 1 : 0) || (b.nome ? 1 : 0) - (a.nome ? 1 : 0); });
  var ativos = {};
  procs.forEach(function (p) { if (p.cliente_id && p.status !== 'arquivado') ativos[p.cliente_id] = (ativos[p.cliente_id] || 0) + 1; });
  var CAMPOS = [['telefone', 'telefone'], ['cpf_cnpj', 'CPF'], ['endereco', 'endereço'], ['nascimento', 'data de nascimento'], ['email', 'e-mail']];
  var incompletos = clientes.filter(function (c) { return ativos[c.id] || /painel/.test(c.origem || ''); }).map(function (c) {
    var falta = CAMPOS.filter(function (f) { return !String(c[f[0]] || '').trim() && !(c.tipo === 'PJ' && f[0] === 'nascimento'); }).map(function (f) { return f[1]; });
    return falta.length ? { id: c.id, nome: c.nome, telefone: c.telefone || '', falta: falta, processos: ativos[c.id] || 0 } : null;
  }).filter(Boolean).sort(function (a, b) { return (a.telefone ? 1 : 0) - (b.telefone ? 1 : 0) || b.falta.length - a.falta.length || b.processos - a.processos; });
  return { semCliente: semCliente.slice(0, 400), totalSemCliente: semCliente.length, incompletos: incompletos.slice(0, 600), totalIncompletos: incompletos.length };
}

/** Liga o processo a um cliente (existente ou novo com o nome que veio do tribunal, sem pasta nova). */
function organizarLigar_(d, u) {
  return comTrava_(function () {
    var tabP = tabela_('Processos'), p = tabP.linhas.filter(function (x) { return x.id === d.processo_id; })[0];
    if (!p) throw falha_('Processo não encontrado.');
    var tabC = tabela_('Clientes'), c = d.cliente_id ? tabC.linhas.filter(function (x) { return x.id === d.cliente_id; })[0] : null, agora = new Date().toISOString();
    if (!c && d.criar) {
      var nome = String(d.nome || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      if (nome.length < 3) throw falha_('Escreva o nome do cliente.');
      c = { id: novoId_('C'), tipo: /\b(ltda|eireli|s\/?a|me|epp)\b/i.test(nome) ? 'PJ' : 'PF', nome: nome, origem: 'processo (organizar cadastros)', situacao: 'completo', area: p.area || '',
        criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario };
      inserirLinha_(tabC, c);
    }
    if (!c) throw falha_('Escolha o cliente.');
    atualizarLinha_(tabP, p, { cliente_id: c.id, cliente_nome: '', atualizado_em: agora, atualizado_por: u.usuario });
    registrar_(u.usuario, 'processo ligado ao cliente', p.numero + ' → ' + c.nome);
    return { ok: true, cliente_id: c.id };
  });
}

/** Classifica a despesa (PIX enviado "A classificar"); as outras do mesmo destinatário ainda sem categoria vão junto. */
function categoriaDespesa_(d, u) {
  if (CATEGORIAS_DESPESA.indexOf(d.categoria) < 0) throw falha_('Categoria inválida.');
  return comTrava_(function () {
    var tab = tabela_('Despesas'), x = tab.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!x) throw falha_('Despesa não encontrada.');
    var n = 0, agora = new Date().toISOString();
    tab.linhas.forEach(function (y) {
      if (y.id === x.id || (/^PIX para /.test(x.descricao) && y.descricao === x.descricao && y.categoria === 'A classificar')) { atualizarLinha_(tab, y, { categoria: d.categoria, atualizado_em: agora, atualizado_por: u.usuario }); n++; }
    });
    registrar_(u.usuario, 'despesa classificada', x.descricao + ' → ' + d.categoria + (n > 1 ? ' (' + n + ')' : ''));
    return { ok: true, n: n };
  });
}

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
      processo_id: String(x.processo_id || ''), reembolsavel: reemb, observacoes: String(x.observacoes || '').trim(),
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
  // 8.6.0 (pedido da usuária): o que fechamos (contrato assinado), clientes novos e processos finalizados — por mês e o do mês escolhido
  var mesSel = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : hoje.slice(0, 7);
  var nomes = {}, contratosFechados = serie(), processosFinalizados = serie(), doMes = { mes: mesSel, contratos: [], clientes: [], finalizados: [] };
  tabela_('Clientes').linhas.forEach(function (c) {
    nomes[c.id] = c.nome;
    if ((c.criado_em || '').slice(0, 7) === mesSel && !importado.test(c.origem || '') && !importado.test(c.atualizado_por || '') && !/revisão geral|processo \(/.test(c.origem || ''))
      doMes.clientes.push({ id: c.id, nome: c.nome, quando: diaSP_(c.criado_em), area: c.area || '', origem: c.origem || '' });
  });
  tabela_('Assinaturas').linhas.forEach(function (a) {
    if (a.situacao !== 'assinado' || !a.assinado_em) return;
    var k = diaSP_(a.assinado_em).slice(0, 7);
    if (idx[k] !== undefined) contratosFechados[idx[k]]++;
    if (k === mesSel) doMes.contratos.push({ cliente_id: a.cliente_id, nome: a.cliente_nome, quando: diaSP_(a.assinado_em), documentos: a.documentos, tipo_acao: (TIPOS_ACAO[a.tipo_acao] || {}).nome || '', por: a.assinado_por || '', processo_id: a.processo_id || '' });
  });
  tabela_('Processos').linhas.forEach(function (p) {
    if (p.status !== 'arquivado' && p.fase !== 'extinto') return;
    var q = diaSP_(p.ultimo_movimento_em || p.atualizado_em || ''), k = q.slice(0, 7);
    if (idx[k] !== undefined) processosFinalizados[idx[k]]++;
    if (k === mesSel) doMes.finalizados.push({ id: p.id, numero: p.numero, cliente: nomes[p.cliente_id] || (p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '', area: p.area || '', quando: q, motivo: String(p.ultimo_movimento || '').slice(0, 80) });
  });
  ['contratos', 'clientes', 'finalizados'].forEach(function (k) { doMes[k].sort(function (a, b) { return a.quando < b.quando ? 1 : -1; }); });
  var ent = prazosEntregues.reduce(function (a, b) { return a + b; }, 0), np = prazosNoPrazo.reduce(function (a, b) { return a + b; }, 0);
  var t = listarTarefas_({ dias: Math.min(parseInt(d.dias, 10) || 90, 365) }, { usuario: '' });
  var fluxo = fluxoMensal_(meses);
  return {
    hoje: hoje, meses: meses, clientesNovos: clientesNovos, processosNovos: processosNovos, intimacoes: intimacoes,
    contratosFechados: contratosFechados, processosFinalizados: processosFinalizados, doMes: doMes,
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
    if (d.fase === 'extinto') { try { pedirAvaliacao_(p, u.usuario); } catch (eV) { /* segue */ } }
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
/**
 * 8.5.0: intimação que não pede nada (só movimentação, sem prazo) ou cujo prazo já foi cumprido/baixado sai da lista "abertas".
 * Nada é apagado: continua em "Todas" e na ficha do processo. Fica marcada como vista pelo robô (não vai para "Aguardando o seu OK").
 */
function arquivarMovimentos_(tabI, tabZ, aplicar) {
  var prazos = {}, comTarefa = {}, n = { movimento: 0, prazoBaixado: 0 };
  tabZ.linhas.forEach(function (z) { prazos[z.id] = z; });
  tabela_('Tarefas').linhas.forEach(function (t) { var m = /\[intim:([^\]]+)\]/.exec(t.descricao || ''); if (m && abertaT_(t)) comTarefa[m[1]] = 1; });
  var limite = new Date(Date.now() - 7 * 86400000).toISOString(), agora = new Date().toISOString();
  tabI.linhas.forEach(function (i) {
    if (i.terminada_por || comTarefa[i.id]) return;
    var z = prazos[i.prazo_id], motivo = '';
    if (z && (z.situacao === 'cumprido' || z.situacao === 'cancelado')) motivo = 'prazoBaixado';
    else if (!i.prazo_id && (i.recebido_em || '') < limite) motivo = 'movimento';
    if (!motivo) return;
    n[motivo]++;
    if (aplicar) atualizarLinha_(tabI, i, { terminada_por: motivo === 'movimento' ? 'robô (só movimentação)' : 'robô (prazo baixado)', terminada_em: agora, ok_por: 'robô', ok_em: agora });
  });
  return n;
}

/** Movimentações do processo em ordem (DataJud + avisos do tribunal), para refazer a etapa. */
function movimentosDoProcesso_(p, intimPorNumero) {
  var movs = [];
  try { var a = JSON.parse(p.andamentos || '[]'); if (Array.isArray(a)) a.forEach(function (x) { if (x && x.n) movs.push({ d: String(x.d || ''), n: String(x.n) }); }); } catch (e) { /* "-" */ }
  (intimPorNumero[p.numero] || []).forEach(function (i) {
    var dia = /^PJe/.test(i.fonte || '') ? (String(i.chave || '').split('|')[2] || i.recebido_em) : i.recebido_em;
    movs.push({ d: String(dia || ''), n: String(i.movimento || '').replace(/ — .*$/, '') });
  });
  return movs.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
}

/** Etapa que a história do processo indica (só para a frente, como o robô) e se está mesmo encerrado. */
function faseDaHistoria_(p, movs) {
  var f = p.numero ? 'ajuizado' : 'contratado', iExt = -1;
  movs.forEach(function (m, k) {
    var nf = faseDoMovimento_(m.n);
    if (nf && (avancaFase_(f, nf) || (f === 'extinto' && /desarquiv/i.test(normalizar_(m.n))))) f = nf;
    if (nf === 'extinto') iExt = k;
  });
  var encerrado = false;
  if (f === 'extinto') {
    // depois da baixa/extinção só publicação, decurso, "Definitivo", certidão…? Então está encerrado de verdade.
    encerrado = !movs.slice(iExt + 1).some(function (m) {
      return /conclus|despacho|decisao|redistribu|audiencia|peticao|recurso|desarquiv|iniciada|penhora|sisbajud|alvara|calculo|liquidacao|citacao/.test(normalizar_(m.n));
    });
    if (!encerrado) f = '';
  }
  return { fase: f, encerrado: encerrado };
}

function revisaoGeral_(d, u) {
  var aplicar = !!d.aplicar, r = { fase: 0, encerrados: 0, tribunal: 0, area: 0, clienteLigado: 0, clientesCriados: 0, cadastros: 0, semNumero: [], semCliente: 0, prazosDefinidos: 0, faltando: {},
    etapas: 0, etapasPor: {}, arquivados: 0, numerosErrados: [], intimMovimento: 0, intimPrazoBaixado: 0, prazosVencidos: 0 };
  comTrava_(function () {
    var tabP = tabela_('Processos'), tabC = tabela_('Clientes');
    var intimPorNumero = {};
    tabela_('Intimacoes').linhas.forEach(function (i) { if (i.numero) (intimPorNumero[i.numero] = intimPorNumero[i.numero] || []).push(i); });
    var porNome = {};
    tabC.linhas.forEach(function (c) { var k = normalizar_(c.nome); (porNome[k] = porNome[k] || []).push(c); });
    tabP.adiar = true; tabC.adiar = true; tabC.buffer = [];
    tabP.linhas.forEach(function (p) {
      var m = {};
      if (!p.fase || !FASES[p.fase]) { m.fase = faseDe_(p); r.fase++; }
      if (p.status === 'arquivado' && (m.fase || p.fase) !== 'extinto' && p.fase_auto !== 'nao') { m.fase = 'extinto'; r.encerrados++; }
      // 8.5.0: etapa conferida com TODA a história do processo (DataJud + avisos), com as regras corrigidas
      if (p.fase_auto !== 'nao' && p.numero && p.status !== 'arquivado') {
        var atual = m.fase || faseDe_(p), hist = faseDaHistoria_(p, movimentosDoProcesso_(p, intimPorNumero)), nova = '';
        var ult = normalizar_(p.ultimo_movimento || '');
        // etapa gravada pela regra antiga errada: "conclusão para julgamento" ≠ sentença; "decurso" ≠ recurso; "solicitação de habilitação" ≠ citação
        var errada = (atual === 'sentenca' && /conclus|para julgamento/.test(ult)) || (atual === 'recurso' && /decurso/.test(ult) && !/grau/.test(ult)) ||
          (atual === 'ajuizado' && /habilitacao/.test(ult));
        if (hist.fase && (avancaFase_(atual, hist.fase) || (errada && hist.fase !== atual))) nova = hist.fase;
        else if (errada) nova = 'andamento';
        if (nova && nova !== atual) { m.fase = nova; r.etapas++; r.etapasPor[nova] = (r.etapasPor[nova] || 0) + 1; }
        if (hist.encerrado) { m.status = 'arquivado'; m.fase = 'extinto'; r.arquivados++; }
      }
      if (p.numero && !cnjValido_(p.numero)) r.numerosErrados.push({ id: p.id, numero: p.numero, cliente: p.cliente_nome || '', cliente_id: p.cliente_id || '' });
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
    // intimações: só movimentação (sem prazo) há mais de 7 dias e as de prazo já baixado saem das "abertas"
    var tabI = tabela_('Intimacoes'), tabZ = tabela_('Prazos');
    tabI.adiar = true;
    var ni = arquivarMovimentos_(tabI, tabZ, aplicar);
    if (aplicar) regravarMudadas_(tabI);
    r.intimMovimento = ni.movimento; r.intimPrazoBaixado = ni.prazoBaixado;
    var hojeR = hojeSP_();
    r.prazosVencidos = tabZ.linhas.filter(function (z) { return (z.situacao === 'calculado' || z.situacao === 'a definir') && z.fatal && z.fatal < hojeR; }).length;
  });
  var nomesCli = {};
  if (r.numerosErrados.length) tabela_('Clientes').linhas.forEach(function (c) { nomesCli[c.id] = c.nome; });
  r.numerosErrados.forEach(function (x) { x.cliente = nomesCli[x.cliente_id] || x.cliente; });
  if (aplicar) {
    try { var ctx = contextoRobo_(); var antes = ctx.prazos.linhas.filter(function (z) { return z.situacao === 'a definir'; }).length;
      definirPendentes_(ctx); [ctx.procs, ctx.intim, ctx.prazos].forEach(gravarLote_);
      r.prazosDefinidos = antes - ctx.prazos.linhas.filter(function (z) { return z.situacao === 'a definir'; }).length; } catch (e) { r.erroPrazos = String(e.message || e); }
    setConfig_('ROBO_GMAIL_DESDE', String(Date.now() - 10 * 86400000), 'Desde quando o robô lê o Gmail (a revisão geral manda reler 10 dias)');
    registrar_(u.usuario, 'revisão geral', JSON.stringify({ fase: r.fase, etapas: r.etapas, arquivados: r.arquivados, encerrados: r.encerrados, area: r.area, clientes: r.clienteLigado, cadastros: r.cadastros, intimacoes: r.intimMovimento + r.intimPrazoBaixado }));
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
  var pedidos = [['inicio.extras', { dia: hojeSP_() }], ['clientes.listar', {}], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }], ['relatorio.geral', {}], ['fin.honorarios', {}]];
  var n = 0;
  Object.keys(perfis).forEach(function (pf) {
    var u = perfis[pf];
    pedidos.forEach(function (pd) {
      if (Date.now() - t0 > 240000) return;
      var rota = ROTAS[pd[0]];
      if (!rota || (rota.permissao && !PERFIS[pf][rota.permissao])) return;
      try {
        comMemoria_(pd[0], u, pd[1], function () { var x = rota.fn(pd[1], u, ''); return valoresDoPerfil_(pd[0], x, pf); });
        n++;
      } catch (e) { /* segue */ }
    });
  });
  return n;
}
/** 8.12: só no horário do escritório (seg–sex 7h–19h, sáb 8h–13h): fora dele ninguém abre o painel e o Google conta cada minuto de robô. */
function aquecerGatilho() {
  var agora = new Date(), hora = +Utilities.formatDate(agora, TZ, 'H'), dsem = +Utilities.formatDate(agora, TZ, 'u'); // 1 = segunda … 7 = domingo
  var util = (dsem <= 5 && hora >= 7 && hora < 19) || (dsem === 6 && hora >= 8 && hora < 13);
  if (!util) return;
  var t0 = Date.now();
  try { aquecerMemoria_(); } catch (e) { /* segue */ }
  contarTempoRobo_(Date.now() - t0);
}

/* 8.12: conta quanto tempo os robôs usaram hoje. Conta gratuita do Google: 90 min por dia de gatilhos; passou disso, o Google
   para os robôs até o dia seguinte sem avisar. O vigia e o cartão do robô mostram quando passar de 70 min. */
function contarTempoRobo_(ms) {
  try {
    var pr = PropertiesService.getScriptProperties(), hoje = hojeSP_(), j = {};
    try { j = JSON.parse(pr.getProperty('TEMPO_ROBO') || '{}'); } catch (e) { j = {}; }
    if (j.dia !== hoje) j = { dia: hoje, ms: 0, n: 0, ontem: j.dia ? Math.round((j.ms || 0) / 60000) : null };
    j.ms += Math.max(0, ms || 0); j.n++;
    pr.setProperty('TEMPO_ROBO', JSON.stringify(j));
  } catch (e) { /* nunca derruba o robô */ }
}
function tempoRoboHoje_() {
  try { var j = JSON.parse(PropertiesService.getScriptProperties().getProperty('TEMPO_ROBO') || '{}'); return j.dia === hojeSP_() ? { min: Math.round(j.ms / 60000), vezes: j.n, ontem: j.ontem } : { min: 0, vezes: 0, ontem: j.dia ? Math.round((j.ms || 0) / 60000) : null }; }
  catch (e) { return { min: 0, vezes: 0 }; }
}

/* 8.12: a aba Log guarda os últimos 180 dias; o resto vai para LogArquivo (nada se perde; a linha do tempo do processo lê as duas).
   Uma vez por dia, só quando o Log passa de 4.000 linhas. Assim os Relatórios não ficam lentos com o tempo. */
function arquivarLog_() {
  var hoje = hojeSP_(); if (config_('LOG_ARQUIVADO_DIA') === hoje) return 0;
  setConfig_('LOG_ARQUIVADO_DIA', hoje, 'Último dia em que o robô passou o Log antigo (mais de 180 dias) para LogArquivo');
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Log');
  if (!sh || sh.getLastRow() < 4000) return 0;
  var limite = new Date(Date.now() - 180 * 86400000).toISOString();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues();
  var n = 0; while (n < vals.length && String(vals[n][0]) < limite) n++;
  if (!n) return 0;
  tabela_('LogArquivo'); // cria a aba se faltar
  var arq = ss.getSheetByName('LogArquivo');
  arq.getRange(arq.getLastRow() + 1, 1, n, 4).setNumberFormat('@').setValues(vals.slice(0, n));
  sh.deleteRows(2, n);
  marcarMudanca_();
  return n;
}

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
  // audiências e perícias de hoje e dos próximos 7 dias (Eventos + Google Agenda): aviso de 1 semana e aviso do dia
  var tarefasAviso = {};
  tabela_('Tarefas').linhas.forEach(function (t) {
    var re = /\[lembrete:([^\]]+)\]/g, m;
    while ((m = re.exec(t.descricao || ''))) tarefasAviso[m[1]] = { feita: !abertaT_(t) && t.situacao !== 'cancelada', por: t.concluida_por || '', em: t.concluida_em || '' };
  });
  var audiencias = atosDaAgenda_(hoje, ate, tabela_('Eventos')).slice(0, 40).map(function (a) {
    var p = procs[a.numero] || {}, c = clis[p.cliente_id] || {}, e = a.ev || {};
    var tSem = tarefasAviso[a.chave] || {}, tDia = tarefasAviso[a.chave + '|dia'] || {};
    return { chave: e.chave || a.chave, lembrete: a.chave, tipo: a.tipo, nome: a.nome, data: a.data, hora: a.hora || '', numero: a.numero, local: a.local || p.orgao || '',
      titulo: a.titulo || '', cliente: c.nome || (p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '', telefone: c.telefone || '', processo_id: p.id || '',
      avisado_em: e.avisado_em || (tSem.feita ? tSem.em : ''), avisado_por: e.avisado_por || tSem.por || '',
      avisado_dia_em: e.avisado_dia_em || (tDia.feita ? tDia.em : ''), avisado_dia_por: e.avisado_dia_por || tDia.por || '' };
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
    var verValor = !!pf.financeiro;
    cobrancas = tabela_('Parcelas').linhas.filter(function (q) { return !q.pago_em && q.vencimento && q.vencimento <= hoje; })
      .sort(function (a, b) { return a.vencimento < b.vencimento ? 1 : -1; })
      .map(function (q) { var c = clis[q.cliente_id] || {}, h = hons[q.honorario_id] || {};
        return { id: q.id, cliente_id: q.cliente_id, cliente: c.nome || '', telefone: c.telefone || '', vencimento: q.vencimento, numero: q.numero, honorario: h.descricao || '',
          dias: diffDias_(hoje, q.vencimento), valor: verValor ? q.valor : null, mensagem_em: q.mensagem_em || '' }; })
      .filter(function (x) { return x.cliente && x.dias <= 90; })
      .sort(function (a, b) { return (a.dias === 0 ? -1 : 0) - (b.dias === 0 ? -1 : 0) || a.dias - b.dias; }).slice(0, 30);
  }
  return { audiencias: audiencias, aniversarios: aniversarios, cobrancas: cobrancas, hoje: hoje };
}

/** "Avisei o cliente" da audiência: fica marcado para a equipe não avisar duas vezes. */
function marcarAvisado_(d, u) {
  var dia = d.quando === 'dia', agora = new Date().toISOString(), quem = u.nome || u.usuario;
  return comTrava_(function () {
    var tab = tabela_('Eventos'), e = tab.linhas.filter(function (x) { return x.chave === d.chave; })[0];
    if (e) atualizarLinha_(tab, e, dia ? { avisado_dia_em: agora, avisado_dia_por: quem } : { avisado_em: agora, avisado_por: quem });
    // fecha a tarefa do aviso (1 semana ou do dia) que o robô criou
    var lembrete = (d.lembrete || '') + (dia ? '|dia' : ''), tabT = tabela_('Tarefas'), n = 0;
    if (d.lembrete) tabT.linhas.filter(function (t) { return String(t.descricao || '').indexOf('[lembrete:' + lembrete + ']') >= 0 && abertaT_(t); }).forEach(function (t) {
      atualizarLinha_(tabT, t, { etapa: 'protocolado', concluida_em: agora, concluida_por: u.usuario, historico: historicoMais_(t.historico, u, 'cliente avisado pelo WhatsApp'), atualizado_em: agora, atualizado_por: u.usuario }); n++;
    });
    if (!e && !n) throw falha_('Audiência não encontrada.');
    registrar_(u.usuario, 'whatsapp ao cliente', (d.numero || (e && e.numero) || '') + ' · aviso ' + (dia ? 'do dia' : 'de 1 semana') + (e ? ' de ' + e.tipo + ' em ' + dataBR_(e.data) : ''));
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
      return Object.assign({ ok: true, por: quem.nome, fase: m.fase }, numero ? aoProtocolar_(p, u) : {});
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

/**
 * 8.7.0: linha do tempo do processo — andamentos do DataJud, intimações, prazos, audiências/perícias, documentos e tarefas, numa lista só.
 */
function linhaDoTempo_(d, u) {
  var p = tabela_('Processos').linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!p) throw falha_('Processo não encontrado.');
  var itens = [], add = function (quando, tipo, titulo, detalhe, link) { if (quando) itens.push({ quando: String(quando), tipo: tipo, titulo: String(titulo || '').slice(0, 200), detalhe: String(detalhe || '').slice(0, 300), link: link || '' }); };
  try { (JSON.parse(p.andamentos || '[]') || []).forEach(function (a) { add(a.d, 'andamento', a.n, a.c || '', ''); }); } catch (e) { /* "-" */ }
  tabela_('Intimacoes').linhas.forEach(function (i) {
    if (i.processo_id !== p.id && (!p.numero || i.numero !== p.numero)) return;
    add(i.recebido_em, 'intimacao', i.movimento, i.resumo_ia || '', '#/prazos#intimacoes');
  });
  tabela_('Prazos').linhas.forEach(function (z) {
    if (z.processo_id !== p.id && (!p.numero || z.numero !== p.numero)) return;
    var ato = /^ato:/.test(z.observacoes || '');
    add(ato ? z.fatal + 'T12:00:00.000Z' : z.criado_em, ato ? 'ato' : 'prazo', z.descricao, (ato ? '' : 'fatal ' + dataBR_(z.fatal) + ' · ') + z.situacao + (z.cumprido_por ? ' por ' + z.cumprido_por : ''), '#/prazo/' + z.id);
  });
  tabela_('Tarefas').linhas.forEach(function (t) {
    if (t.processo_id !== p.id) return;
    add(t.concluida_em || t.criado_em, 'tarefa', t.titulo, t.concluida_em ? 'feita' + (t.concluida_por ? ' por ' + t.concluida_por : '') : 'em aberto', '#/tarefas');
  });
  if (p.cliente_id) tabela_('Log').linhas.concat(tabela_('LogArquivo').linhas).forEach(function (l) {
    if (/documentos gerados|documentos assinados|whatsapp ao cliente/.test(l.acao) && String(l.detalhe || '').indexOf(p.cliente_id) >= 0) add(l.quando, 'documento', l.acao, String(l.detalhe || '').replace(p.cliente_id, '').trim(), '');
  });
  itens.sort(function (a, b) { return a.quando < b.quando ? 1 : -1; });
  return { itens: itens.slice(0, 200), total: itens.length };
}

/** 8.7.0: "Resumir o processo com IA" — como está o caso, em linguagem simples (para o cliente) e o que fazer (para a equipe). Nunca muda prazo. */
function resumirProcessoIA_(d, u) {
  var chave = chaveIA_();
  if (!chave) throw falha_('A IA não está ligada. A administração cadastra a chave em Usuários › Resumo das intimações por IA.');
  var p = tabela_('Processos').linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!p) throw falha_('Processo não encontrado.');
  var cli = p.cliente_id ? (tabela_('Clientes').linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {}) : {};
  var lt = linhaDoTempo_({ id: p.id }, u).itens.slice(0, 40).reverse();
  if (!lt.length) throw falha_('Ainda não há movimentações deste processo para a IA ler.');
  var nomes = [cli.nome, p.cliente_nome, p.parte_contraria].filter(Boolean);
  var hist = lt.map(function (x) { return x.quando.slice(0, 10) + ' — ' + x.tipo + ': ' + x.titulo + (x.detalhe ? ' (' + x.detalhe + ')' : ''); }).join('\n');
  var prompt = 'Você ajuda um escritório de advocacia brasileiro. Abaixo está o histórico de um processo (' + (p.classe || p.area || 'processo') + ', ' + (p.tribunal || '') +
    ', etapa atual no painel: ' + ((FASES[faseDe_(p)] || {}).nome || FASES[faseDe_(p)] || faseDe_(p)) + '). Responda SOMENTE em JSON com as chaves "cliente" (explicação para o CLIENTE, em português bem simples, ' +
    'até 90 palavras: o que já aconteceu, em que fase está e qual o próximo passo; sem prometer resultado, sem valores, sem prazos internos, sem termos técnicos) e "equipe" ' +
    '(para a advogada, até 60 palavras: situação e o que parece pendente). Não invente nada que não esteja no histórico; se faltar informação, diga que é preciso conferir no sistema do tribunal.\n\nHISTÓRICO:\n' + anonimizar_(hist, nomes);
  var resp = chamarGemini_(prompt, chave, '', true), code = resp.getResponseCode(), j = {};
  try { j = JSON.parse(resp.getContentText()); } catch (e) { /* segue */ }
  if (code !== 200) throw falha_('A IA não respondeu agora (código ' + code + '). Tente de novo em alguns minutos.');
  var txt = ((((j.candidates || [])[0] || {}).content || {}).parts || [{}])[0].text || '', o = {};
  try { o = JSON.parse(String(txt).replace(/^```(json)?|```$/g, '').trim()); } catch (e) { o = { cliente: String(txt).slice(0, 700) }; }
  registrar_(u.usuario, 'resumo por IA', 'processo ' + p.numero);
  return { cliente: String(o.cliente || '').trim(), equipe: String(o.equipe || '').trim(), telefone: cli.telefone || '', nome: cli.nome || '' };
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
  // 8.11.2: ninguém com e-mail cadastrado → vai para a conta dona do painel (a administração), em nome do 1º administrador ativo
  if (!n && !erros.length) {
    try {
      var dono = Session.getEffectiveUser().getEmail(), adm = usuarios_().filter(function (x) { return x.ativo === 'sim' && x.perfil === 'administrador'; })[0];
      if (dono && adm && !usuarios_().some(function (x) { return x.ativo === 'sim' && x.email; })) { if (enviarResumo_(Object.assign({}, adm, { email: dono }), base)) n++; }
    } catch (eD) { erros.push('conta dona: ' + (eD.message || eD)); }
  }
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
function chamarGemini_(texto, chave, contexto, livre) {
  var modelo = modeloIA_();
  var ped = pedidoGemini_(texto, chave, modelo, contexto, livre);
  var resp = UrlFetchApp.fetch(ped.url, ped);
  var novo = modeloSugerido_(resp);
  if (novo) { modelo = novo; ped = pedidoGemini_(texto, chave, novo, contexto, livre); resp = UrlFetchApp.fetch(ped.url, ped); }
  // Google ocupado (503) ou "muitos pedidos" (429): espera e tenta de novo; persistindo, usa o outro modelo só nesta vez
  var ocupado = function (r) { var c = r.getResponseCode(); return c === 503 || c === 429 || c === 500; };
  for (var t = 1; t <= 2 && ocupado(resp); t++) { Utilities.sleep(2500 * t); resp = UrlFetchApp.fetch(ped.url, ped); }
  if (ocupado(resp)) {
    var reserva = /lite/.test(modelo) ? modelo.replace(/-lite$/, '') : modelo + '-lite';
    if (/^gemini-[a-z0-9.\-]{3,50}$/.test(reserva)) { var ped2 = pedidoGemini_(texto, chave, reserva, contexto, livre); var r2 = UrlFetchApp.fetch(ped2.url, ped2); if (r2.getResponseCode() === 200) return r2; }
  }
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

function pedidoGemini_(texto, chave, modelo, contexto, livre) {
  var prompt = livre ? String(texto).slice(0, 12000) : 'Você ajuda um escritório de advocacia brasileiro a nunca perder prazo. Leia a intimação/publicação abaixo e responda SOMENTE em JSON com as chaves: ' +
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
      generationConfig: { temperature: 0.1, maxOutputTokens: livre ? 900 : 400, responseMimeType: 'application/json' } })
  };
}

function lerRespostaGemini_(resp, z) {
  var code = resp.getResponseCode();
  var j = {};
  try { j = JSON.parse(resp.getContentText()); } catch (e) { /* resposta estranha */ }
  if (code !== 200) throw new Error('Gemini respondeu ' + code + (j.error && j.error.message ? ': ' + String(j.error.message).slice(0, 160) : ''));
  var txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  txt = txt && txt[0] && txt[0].text || '';
  var o, corte = ((j.candidates || [])[0] || {}).finishReason === 'MAX_TOKENS';
  var bruto = String(txt).replace(/```(json)?/gi, '').trim();
  try { o = JSON.parse(bruto); } catch (e) {
    // 8.11: resposta cortada ou fora do formato → nunca mostra pedaço de código; tenta achar o "resumo" e limpa o resto
    var m = /"resumo"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(bruto);
    o = { resumo: (m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : bruto.replace(/[{}\[\]"]+/g, ' ').replace(/\b(resumo|providencia|prazo_dias|fundamento|data_ato)\s*:/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 300) };
    corte = true;
  }
  var limpa = function (t, cortado) { // tira restos de código; se a resposta veio cortada, termina numa frase inteira
    t = String(t || '').replace(/[`{}<>]|\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cortado && t && !/[.!?)]$/.test(t)) { var k = Math.max(t.lastIndexOf('. '), t.lastIndexOf('; ')); t = k > 40 ? t.slice(0, k + 1) : t + '…'; }
    return t;
  };
  o.resumo = limpa(o.resumo, corte); if (o.providencia) o.providencia = limpa(o.providencia, false);
  if (!o.resumo) throw new Error('A IA respondeu sem resumo. Tente de novo.');
  var partes = [String(o.resumo || '').trim() + (corte ? ' (resposta da IA incompleta — confira no texto do ato)' : '')];
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
  var chave = chaveDatajud_(false), renovou = false, lidos = 0, achados = 0, erro = '', aviso = '', pausa = 1200, LOTE = 4, instaveis = 0;
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
      if (code >= 500) { instaveis++; continue; } // 502/504: o CNJ ficou lento; fica na fila para a próxima rodada
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
  if (instaveis && !aviso) aviso = instaveis + ' consulta(s) sem resposta do CNJ (lento); ficam na fila para a próxima rodada';
  if (lidos && erro && /respondeu/.test(erro)) erro = ''; // leu parte: não é falha geral
  if (lidos) setConfig_('DATAJUD_OK', new Date().toISOString(), 'Última leitura do DataJud que trouxe andamentos');
  setConfig_('DATAJUD_ULTIMA', new Date().toISOString() + ' · ' + lidos + ' consultado(s), ' + achados + ' com andamentos' + (faltam ? ' · ' + faltam + ' na fila' : '') + (aviso ? ' · ' + aviso : ''), 'Última leitura do DataJud');
  setConfig_('DATAJUD_ERRO', erro, 'Último problema do DataJud');
  return { lidos: lidos, achados: achados, erro: erro, aviso: aviso };
}

function andamentosGatilho() {
  var t0 = Date.now();
  try { atualizarAndamentos_(270000, 300); } catch (e) { setConfig_('DATAJUD_ERRO', String(e.message || e), 'Último problema do DataJud'); }
  contarTempoRobo_(Date.now() - t0);
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
  return { tempoRobo: (function () { try { return tempoRoboHoje_(); } catch (e) { return null; } })(), alertas: (function () { try { return vigiaRobo_(false); } catch (e) { return []; } })(), datajud: { ultima: config_('DATAJUD_ULTIMA'), erro: config_('DATAJUD_ERRO'), ok: config_('DATAJUD_OK') || '' },
    ia: { ligada: !!chaveIA_() && config_('IA_LIGADA') !== 'nao', ultima: config_('IA_ULTIMA'), erro: config_('IA_ERRO') },
    email: { ultimo: config_('RESUMO_EMAIL_DIA') }, versao: VERSAO, agenda: config_('AGENDA_SINC') || '' };
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
      situacao: 'novo', tarefa_id: tid, observacoes: '', origem: origemSite_(d.origem), campanha: String(d.campanha || '').replace(/[^\w .-]/g, '').slice(0, 60) });
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


/* ---------- Marketing (8.6.0): site e Google Ads — quanto investimos e o que voltou, por área ---------- */

var AREAS_MKT = ['Trabalhista', 'Previdenciário', 'Família', 'Cível', 'Criminal', 'Empresarial'];
var CANAIS_CONHECEU = ['Google Ads (anúncio)', 'Google (pesquisa ou mapa)', 'Site', 'Instagram / Facebook', 'Indicação', 'Já era cliente', 'Outro'];
function origemSite_(o) { o = String(o || ''); return /^ads$/.test(o) ? 'ads' : /^(organico|google|social|direto|outro)$/.test(o) ? o : 'direto'; }
/** Área de marketing pelo texto (área do cliente, página do site, assunto do contato). */
function areaMkt_(t) {
  t = normalizar_(t || '');
  if (/trabalh/.test(t)) return 'Trabalhista';
  if (/previd|inss|aposent/.test(t)) return 'Previdenciário';
  if (/famil|divorc|pensao|guarda|invent/.test(t)) return 'Família';
  if (/crimin|penal/.test(t)) return 'Criminal';
  if (/empres|assessoria/.test(t)) return 'Empresarial';
  if (/civel|civil|banco|consumidor|contrato|compra/.test(t)) return 'Cível';
  return 'Geral';
}

/** Público (site): um clique no WhatsApp ou no telefone, sem nenhum dado pessoal (página, área e se veio de anúncio). */
function cliqueSite_(d) {
  var cache = CacheService.getScriptCache(), k = 'site_cliques_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
  var n = parseInt(cache.get(k) || '0', 10);
  if (n >= 300) return { ok: true, ignorado: true };
  cache.put(k, String(n + 1), 3700);
  var pagina = String(d.pagina || '/').replace(/[^\w\/-]/g, '').slice(0, 60);
  aba_('SiteCliques').appendRow([new Date().toISOString(), pagina, areaMkt_(d.area || pagina), origemSite_(d.origem),
    String(d.campanha || '').replace(/[^\w .-]/g, '').slice(0, 60), /^(whatsapp|telefone|formulario)$/.test(d.canal || '') ? d.canal : 'whatsapp']);
  return { ok: true };
}

/**
 * 8.7.0: Google Ads → painel. Um script colado em Google Ads › Ferramentas › Scripts roda todo dia e manda, por campanha e mês,
 * custo, cliques, impressões e conversões para esta rota, com a chave secreta (Config MARKETING_ADS_CHAVE). A área vem do nome
 * da campanha ("Trabalhista", "Família"…). Linhas automáticas ficam com obs "auto" e substituem o lançamento à mão daquele mês/área.
 */
function receberGoogleAds_(d) {
  var chave = config_('MARKETING_ADS_CHAVE');
  if (!chave || String(d.chave || '') !== chave) throw falha_('Chave do Google Ads inválida.');
  var cache = CacheService.getScriptCache(), k = 'ads_envios_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
  var n = parseInt(cache.get(k) || '0', 10); if (n > 20) throw falha_('Muitos envios nesta hora.');
  cache.put(k, String(n + 1), 3700);
  var linhas = Array.isArray(d.linhas) ? d.linhas.slice(0, 300) : [];
  return comTrava_(function () {
    var tab = tabela_('Marketing'), agora = new Date().toISOString(), novos = 0, alt = 0;
    linhas.forEach(function (x) {
      var mes = String(x.mes || '').slice(0, 7), camp = String(x.campanha || '').replace(/[^\w À-ÿ.\-|/]/g, '').slice(0, 80);
      if (!/^\d{4}-\d{2}$/.test(mes) || !camp) return;
      var dados = { mes: mes, canal: 'Google Ads', campanha: camp, area: areaMkt_(camp), investimento: (Math.max(0, +x.custo || 0)).toFixed(2),
        cliques: String(parseInt(x.cliques, 10) || 0), impressoes: String(parseInt(x.impressoes, 10) || 0), conversoes: String(Math.round(+x.conversoes || 0)), obs: 'auto' };
      var l = tab.linhas.filter(function (r) { return r.mes === mes && r.campanha === camp && r.obs === 'auto'; })[0];
      if (l) { atualizarLinha_(tab, l, dados); alt++; }
      else { dados.id = novoId_('MK'); dados.criado_em = agora; dados.criado_por = 'Google Ads'; inserirLinha_(tab, dados); novos++; }
    });
    setConfig_('MARKETING_ADS_ULTIMA', agora + ' · ' + linhas.length + ' linha(s)', 'Último envio automático do Google Ads');
    return { ok: true, novos: novos, atualizados: alt };
  });
}
function configGoogleAds_(d, u) {
  var chave = config_('MARKETING_ADS_CHAVE');
  if (!chave || d.nova) {
    chave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    setConfig_('MARKETING_ADS_CHAVE', chave, 'Chave secreta do script do Google Ads (Marketing)');
    registrar_(u.usuario, 'marketing', 'chave do Google Ads ' + (d.nova ? 'trocada' : 'criada'));
  }
  return { chave: chave, ultima: config_('MARKETING_ADS_ULTIMA') || '' };
}

/** Lança (ou apaga) o investimento de um mês numa campanha. */
function marketingSalvar_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('Marketing');
    if (d.excluir) { var x = tab.linhas.filter(function (r) { return r.id === d.excluir; })[0]; if (x) atualizarLinha_(tab, x, { investimento: '0', obs: 'excluído por ' + u.usuario, mes: 'excluido' }); return { ok: true }; }
    var m = d.item || {};
    if (!/^\d{4}-\d{2}$/.test(m.mes || '')) throw falha_('Escolha o mês.');
    var inv = dinheiro_(m.investimento);
    if (!(inv >= 0)) throw falha_('Informe quanto foi investido (R$).');
    var area = AREAS_MKT.indexOf(m.area) >= 0 ? m.area : 'Geral';
    var dados = { mes: m.mes, canal: String(m.canal || 'Google Ads').slice(0, 40), campanha: String(m.campanha || '').slice(0, 80), area: area, investimento: inv.toFixed(2),
      cliques: String(parseInt(m.cliques, 10) || ''), impressoes: String(parseInt(m.impressoes, 10) || ''), conversoes: String(parseInt(m.conversoes, 10) || ''), obs: String(m.obs || '').slice(0, 200) };
    var igual = tab.linhas.filter(function (r) { return r.id === m.id || (!m.id && r.mes === dados.mes && r.canal === dados.canal && r.area === dados.area && r.campanha === dados.campanha); })[0];
    if (igual) { atualizarLinha_(tab, igual, dados); registrar_(u.usuario, 'marketing', 'investimento alterado ' + dados.mes + ' ' + area); return { id: igual.id }; }
    dados.id = novoId_('MK'); dados.criado_em = new Date().toISOString(); dados.criado_por = u.usuario;
    inserirLinha_(tab, dados);
    registrar_(u.usuario, 'marketing', 'investimento ' + dados.mes + ' ' + area + ' R$ ' + dados.investimento);
    return { id: dados.id };
  });
}

/**
 * Resumo do retorno: por área e por mês — investimento, cliques no WhatsApp do site (de anúncio e sem anúncio), pedidos de
 * contato, clientes novos (e quantos disseram que vieram do anúncio/Google/site), contratos assinados e valor contratado/recebido.
 */
function marketingResumo_(d) {
  var hoje = hojeSP_(), nMeses = Math.min(Math.max(parseInt(d.meses, 10) || 6, 1), 24);
  var meses = mesesAtras_(hoje, nMeses), de = meses[0], idx = {};
  meses.forEach(function (m, i) { idx[m] = i; });
  var areas = ['Geral'].concat(AREAS_MKT), vazio = function () {
    return { investimento: 0, cliques_ads: 0, cliques_site: 0, contatos: 0, contatos_ads: 0, clientes: 0, clientes_ads: 0, clientes_google: 0, sem_origem: 0, contratos: 0, contratos_ads: 0, contratado: 0, contratado_ads: 0, recebido: 0, recebido_ads: 0, exito_ads: 0 };
  };
  var porArea = {}, porMes = meses.map(function (m) { var o = vazio(); o.mes = m; return o; }), total = vazio();
  areas.forEach(function (a) { porArea[a] = vazio(); porArea[a].area = a; });
  var soma = function (area, mes, campo, v) { if (idx[mes] === undefined) return; porArea[area][campo] += v; porMes[idx[mes]][campo] += v; total[campo] += v; };
  var campanhas = [], auto = {};
  tabela_('Marketing').linhas.forEach(function (r) { if (r.obs === 'auto') auto[r.mes + '|' + r.area] = 1; });
  tabela_('Marketing').linhas.forEach(function (r) {
    if (idx[r.mes] === undefined) return;
    if (r.obs !== 'auto' && /google ads/i.test(r.canal) && auto[r.mes + '|' + (r.area || 'Geral')]) return; // o automático já trouxe
    var v = +r.investimento || 0; soma(r.area || 'Geral', r.mes, 'investimento', v);
    campanhas.push({ id: r.id, mes: r.mes, canal: r.canal, campanha: r.campanha, area: r.area, investimento: v, cliques: r.cliques, impressoes: r.impressoes, conversoes: r.conversoes, obs: r.obs, auto: r.obs === 'auto' });
  });
  try {
    tabela_('SiteCliques').linhas.forEach(function (c) {
      var mes = diaSP_(c.quando).slice(0, 7);
      soma(areas.indexOf(c.area) >= 0 ? c.area : 'Geral', mes, c.origem === 'ads' ? 'cliques_ads' : 'cliques_site', 1);
    });
  } catch (e) { /* aba nova */ }
  tabela_('Contatos').linhas.forEach(function (c) {
    var mes = diaSP_(c.criado_em).slice(0, 7), a = areaMkt_(c.assunto + ' ' + c.pagina);
    soma(a, mes, 'contatos', 1); if (c.origem === 'ads') soma(a, mes, 'contatos_ads', 1);
  });
  var importado = /hist|GEA|carga|levantamento|planilha|importa|revisão geral|processo \(/i, novos = {};
  tabela_('Clientes').linhas.forEach(function (c) {
    var mes = diaSP_(c.criado_em).slice(0, 7);
    if (idx[mes] === undefined || importado.test(c.origem || '') || importado.test(c.atualizado_por || '')) return;
    var a = areaMkt_(c.area + ' ' + c.tipo_acao), ads = /ads|anuncio|anúncio/i.test(c.como_conheceu || ''), google = /google|site/i.test(c.como_conheceu || '');
    novos[c.id] = { area: a, ads: ads, google: google || ads, mes: mes };
    soma(a, mes, 'clientes', 1); if (ads) soma(a, mes, 'clientes_ads', 1); if (google || ads) soma(a, mes, 'clientes_google', 1);
    if (!String(c.como_conheceu || '').trim()) soma(a, mes, 'sem_origem', 1); // 8.11: sem origem = retorno NÃO MEDIDO
  });
  tabela_('Assinaturas').linhas.forEach(function (x) {
    var n = novos[x.cliente_id]; if (!n || x.situacao !== 'assinado') return;
    var mes = diaSP_(x.assinado_em).slice(0, 7); soma(n.area, idx[mes] === undefined ? n.mes : mes, 'contratos', 1); if (n.ads) soma(n.area, idx[mes] === undefined ? n.mes : mes, 'contratos_ads', 1);
  });
  var honCli = {};
  tabela_('Honorarios').linhas.forEach(function (h) {
    var n = novos[h.cliente_id]; if (!n || /cancelad/.test(h.situacao || '')) return;
    honCli[h.id] = n;
    var v = h.tipo === 'mensal' ? (+h.valor_mensal || 0) * 12 : (+h.valor_total || 0);
    soma(n.area, n.mes, 'contratado', v); if (n.ads) { soma(n.area, n.mes, 'contratado_ads', v); if (h.tipo === 'exito' || +h.percentual) soma(n.area, n.mes, 'exito_ads', 1); }
  });
  tabela_('Parcelas').linhas.forEach(function (q) {
    var n = honCli[q.honorario_id]; if (!n || !q.pago_em) return;
    var v = +q.valor_pago || +q.valor || 0; soma(n.area, n.mes, 'recebido', v); if (n.ads) soma(n.area, n.mes, 'recebido_ads', v);
  });
  return { adsUltima: config_('MARKETING_ADS_ULTIMA') || '', meses: meses, de: de, porArea: areas.map(function (a) { return porArea[a]; }), porMes: porMes, total: total,
    campanhas: campanhas.sort(function (a, b) { return a.mes < b.mes ? 1 : -1; }), areas: AREAS_MKT, canais: CANAIS_CONHECEU,
    semMarcacao: Object.keys(novos).filter(function (k) { var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === k; })[0]; return c && !c.como_conheceu; }).length };
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
  var ultRobo = config_('ROBO_ULTIMA_EXECUCAO');
  if (ultRobo && agora - Date.parse(ultRobo) > 3 * 3600000) alertas.push('O robô não roda desde ' + Utilities.formatDate(new Date(ultRobo), TZ, 'dd/MM HH:mm') + ' (deveria rodar de hora em hora). O Google pode ter parado os robôs pelo limite diário: abra script.google.com › Execuções. Enquanto isso, confira as intimações direto no eproc e no PJe.');
  var tr = tempoRoboHoje_();
  if (tr.min >= 70) alertas.push('Os robôs já usaram ' + tr.min + ' min hoje (o Google para tudo em 90 min por dia na conta gratuita). Se continuar assim, avise para espaçar os robôs.');
  if (diverg.length) alertas.push('A IA encontrou prazo diferente do calculado em ' + diverg.length + ' processo(s): ' + diverg.slice(0, 8).join(', ') + '. Confira no sistema do tribunal.');
  if (avisar && alertas.length) {
    var ult = config_('ALERTA_ROBO_EM');
    if (!ult || agora - Date.parse(ult) > 12 * 3600000) {
      var dest = usuarios_().filter(function (u) { return u.ativo === 'sim' && u.email && (u.perfil === 'administrador' || u.perfil === 'advogada'); });
      if (!dest.length) { try { var dono = Session.getEffectiveUser().getEmail(); if (dono) dest = [{ email: dono }]; } catch (eD) { /* sem e-mail */ } }
      dest.forEach(function (u) {
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

/* ================================================================== */
/* EDIFÍCIO FUTURE (8.0.0) — painel à parte, só para quem tem acesso   */
/* ================================================================== */
/*
 * Dados nas abas Fut* desta planilha (entram nas cópias de segurança). A planilha antiga "EDIFICIO FUTURE CONTROLE"
 * (pasta 05. ED. FUTURE) é só a fonte da importação (futureImportar_).
 * Acesso: Config FUTURE_USUARIOS (usuários separados por vírgula). Vazio = todos os administradores.
 */
var FUT_MESES = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
var FUT_SITUACOES = ['alugado', 'disponivel', 'renovar', 'reforma', 'proprio'];
var FUT_CATEGORIAS = { receita: ['Aluguel', 'Taxas', 'Energia', 'Lavanderia', 'Faxina', 'Caução', 'Outros'],
  despesa: ['Energia', 'Água', 'Internet', 'Elevador', 'Salário', 'Imposto', 'Limpeza', 'Manutenção', 'Compras', 'Outros'] };

function podeFuture_(u) {
  if (!u) return false;
  var lista = String(config_('FUTURE_USUARIOS') || '').split(/[,;\s]+/).filter(String);
  if (lista.length) return lista.indexOf(u.usuario) >= 0;
  return u.perfil === 'administrador'; // pedido do Luiz: todos os administradores veem
}

var futN_ = function (v) { return dinheiro_(v); };
function futComp_(iso) { return String(iso || hojeSP_()).slice(0, 7); }
function futCompMais_(comp, n) { var a = +comp.slice(0, 4), m = +comp.slice(5, 7) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + '-' + ('0' + (m + 1)).slice(-2); }
function futIdUnidade_(v) {
  var t = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
  var m = /^(?:AP\.?\s*)?(\d{3})(?:\.0)?$/.exec(t); if (m) return 'AP ' + m[1];
  m = /^SALA\s*(\d+)/.exec(t); if (m) return 'SALA ' + m[1];
  return '';
}
function futSituacao_(status, nome) {
  var s = normalizar_(status || '');
  if (/propri/.test(s)) return 'proprio';
  if (/renov/.test(s)) return 'renovar';
  if (/reform|manut/.test(s)) return 'reforma';
  if (/alug/.test(s) && String(nome || '').trim()) return 'alugado';
  return String(nome || '').trim() && !/dispon|vag/.test(s) ? 'alugado' : 'disponivel';
}
function futData_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var t = String(v || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
}
function futNome_(t) { return String(t || '').replace(/\s+/g, ' ').replace(/\s*-\s*HC\s*$/i, '').trim(); }
function futCategoriaDespesa_(desc, obs) {
  var t = normalizar_(desc + ' ' + (obs || ''));
  if (/energia|luz|celesc/.test(t)) return 'Energia';
  if (/agua|casan|samae/.test(t)) return 'Água';
  if (/internet/.test(t)) return 'Internet';
  if (/elevador/.test(t)) return 'Elevador';
  if (/salario|funcionari/.test(t)) return 'Salário';
  if (/imposto|iptu|inss|lixo|taxa/.test(t)) return 'Imposto';
  if (/limpeza|latao/.test(t)) return 'Limpeza';
  if (/encanador|reboco|pintur|eletricist|manutenc|conserto|ap \d{3}/.test(t)) return 'Manutenção';
  if (/fogao|compra|controle|geladeira|cama|colchao/.test(t)) return 'Compras';
  return 'Outros';
}

/* ---------- leitura geral ---------- */
function futTabs_() {
  return { un: tabela_('FutUnidades'), pe: tabela_('FutPessoas'), la: tabela_('FutLanc'), co: tabela_('FutCobrancas'), en: tabela_('FutEnergia'), lv: tabela_('FutLavagens') };
}
function futOrdenarUnidades_(a, b) { return (+a.ordem || 999) - (+b.ordem || 999) || (a.id < b.id ? -1 : 1); }

/** Energia de outubro/2026 tirada das mensagens que o Luiz mandou (só unidades; sem nomes). Entra uma vez, se faltar. */
var FUT_ENERGIA_INICIAL = { comp: '2026-10', valores: { 101: 103.53, 102: 173.13, 104: 137.96, 105: 206.36, 106: 74.68, 109: 150, 202: 110.36, 203: 92.5, 204: 92.5, 206: 92.5, 208: 160.96 } };
function futSemearEnergia_(T) {
  if (config_('FUTURE_ENERGIA_SEMEADA') === FUT_ENERGIA_INICIAL.comp) return;
  Object.keys(FUT_ENERGIA_INICIAL.valores).forEach(function (ap) {
    var id = 'AP ' + ap;
    if (!T.un.linhas.some(function (x) { return x.id === id; })) return;
    if (T.en.linhas.some(function (e) { return e.unidade === id && e.competencia === FUT_ENERGIA_INICIAL.comp; })) return;
    futSalvarEnergia_(T, FUT_ENERGIA_INICIAL.comp, id, FUT_ENERGIA_INICIAL.valores[ap], '', 'demonstrativos de ' + FUT_ENERGIA_INICIAL.comp);
  });
  setConfig_('FUTURE_ENERGIA_SEMEADA', FUT_ENERGIA_INICIAL.comp, 'Energia inicial do Edifício Future já lançada');
}
/** Sala comercial paga a própria energia (só aluguel + taxas); apartamento paga a energia do mês anterior. */
/** Total da cobrança: aluguel + taxas + energia + lavanderia + outros. */
function futTotal_(c) { return futN_(c.aluguel) + futN_(c.taxas) + futN_(c.energia) + futN_(c.lavanderia) + futN_(c.outros); }
/** Lavagens do mês de referência por unidade (entram na cobrança do mês seguinte). */
function futLavPorUnidade_(T, ref) {
  var r = {}; T.lv.linhas.forEach(function (l) { if (l.competencia === ref && l.situacao !== 'excluida') { var x = r[l.unidade] = r[l.unidade] || { valor: 0, qtd: 0 }; x.valor += futN_(l.valor); x.qtd += (+l.quantidade || 1); } });
  return r;
}
function futCobraEnergia_(u) { return u.cobra_energia ? u.cobra_energia !== 'nao' : !/^SALA/.test(u.id); }
/** Valores da cobrança do mês "comp" (vence em comp, referente ao mês anterior).
 *  Entrou no meio do mês de referência → aluguel proporcional pela base de 30 dias (ex.: 04/10 a 31/10 = 28 dias). */
function futCalcCobranca_(u, comp, energiaAnt) {
  var ref = futCompMais_(comp, -1), al = futN_(u.aluguel), aluguel = al, detalhe = '';
  if (u.entrada && u.entrada.slice(0, 7) === ref && +u.entrada.slice(8, 10) > 1) {
    var ult = new Date(Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7), 0)).getUTCDate(), dias = ult - (+u.entrada.slice(8, 10)) + 1;
    if (dias < 30) { aluguel = Math.round(al * dias / 30 * 100) / 100; detalhe = 'prop|' + u.entrada + '|' + ref + '-' + ult + '|' + dias; }
  }
  return { aluguel: aluguel, taxas: futN_(u.taxas), energia: futCobraEnergia_(u) ? (energiaAnt[u.id] || 0) : 0, detalhe: detalhe };
}
/** Lançamentos de recebimento: a competência é o MÊS DE REFERÊNCIA (cobrança que vence em novembro = outubro). */
function futRefDaCobranca_(c) { return futCompMais_(c.competencia, -1); } // temporada também: a parcela é cobrada no mês seguinte ao do vencimento
/** Uma vez: recebimentos lançados pelo painel antes da 8.4 ficaram no mês do vencimento → passam para o mês de referência. */
function futMigrarReferencia_(T) {
  if (config_('FUTURE_REF_MIGRADO')) return;
  var porLanc = {}; T.co.linhas.forEach(function (c) { if (c.lanc_id) porLanc[c.lanc_id] = c; });
  T.la.linhas.forEach(function (l) { var c = porLanc[l.id]; if (c && l.origem === 'cobrança' && l.competencia === c.competencia) atualizarLinha_(T.la, l, { competencia: futRefDaCobranca_(c) }); });
  setConfig_('FUTURE_REF_MIGRADO', new Date().toISOString(), 'Recebimentos do prédio no mês de referência (8.4)');
}

/** Cria as cobranças do mês para as unidades alugadas e dá baixa nas que já têm recebimento lançado.
 *  Cobrança do mês = aluguel do mês anterior (pago depois de usar) + taxas + energia do mês anterior; vence no dia FUTURE_DIA_VENC. */
function futureGerarCobrancas_(comp, T) {
  T = T || futTabs_();
  comp = comp || futComp_();
  var desde = config_('FUTURE_COBRAR_DESDE');
  if (desde && comp < desde) return 0; // antes da importação o controle era a planilha antiga
  try { futSemearEnergia_(T); futMigrarReferencia_(T); } catch (eS) { /* segue */ }
  var lavRef = futLavPorUnidade_(T, futCompMais_(comp, -1));
  var dia = Math.min(28, Math.max(1, parseInt(config_('FUTURE_DIA_VENC'), 10) || 10));
  var agora = new Date().toISOString(), feitas = 0, taxaSala = futN_(config_('FUTURE_TAXAS_SALA')) || 107;
  var tem = {}; T.co.linhas.forEach(function (c) { tem[c.unidade + '|' + c.competencia] = c; });
  var energiaAnt = {}; T.en.linhas.forEach(function (e) { if (e.competencia === futCompMais_(comp, -1)) energiaAnt[e.unidade] = futN_(e.valor); });
  var porId = {};
  T.un.linhas.forEach(function (u) {
    porId[u.id] = u;
    if (!/^(alugado|renovar)$/.test(u.situacao) || !(futN_(u.aluguel) > 0) || u.modalidade === 'temporada') return;
    // salas: as taxas pagas são R$ 107 (aluguel 2.000 + 107 = 2.107 nos recebimentos); sem energia
    if (/^SALA/.test(u.id) && !(futN_(u.taxas) > 0)) atualizarLinha_(T.un, u, { taxas: txtDinheiro_(taxaSala) });
    if (tem[u.id + '|' + comp]) return;
    if (u.entrada && u.entrada.slice(0, 7) >= comp) return; // ainda não usou um mês: a 1ª cobrança vem no mês seguinte
    var k = futCalcCobranca_(u, comp, energiaAnt), lv = (lavRef[u.id] || {}).valor || 0;
    var c = { id: novoId_('FC'), unidade: u.id, pessoa: u.locatario || '', competencia: comp, vencimento: comp + '-' + ('0' + dia).slice(-2),
      aluguel: txtDinheiro_(k.aluguel), taxas: txtDinheiro_(k.taxas), energia: k.energia ? txtDinheiro_(k.energia) : '', outros: '', lavanderia: lv ? txtDinheiro_(lv) : '', total: txtDinheiro_(k.aluguel + k.taxas + k.energia + lv),
      pago_em: '', valor_pago: '', forma: '', lanc_id: '', situacao: 'aberta', obs: '', criado_em: agora, atualizado_em: agora, atualizado_por: 'robô', pagador: u.pagador || '', detalhe: k.detalhe };
    inserirLinha_(T.co, c); tem[u.id + '|' + comp] = c; feitas++;
  });
  // cobrança feita pelo robô, ainda não mandada nem paga: acompanha a unidade (proporcional, taxas, energia que chegou)
  T.co.linhas.forEach(function (c) {
    if (c.competencia !== comp || c.pago_em || c.situacao === 'cancelada' || /^temp\|/.test(c.detalhe || '')) return;
    // lavanderia acompanha sempre (mesmo cobrança já mandada ou ajustada à mão)
    var lvC = (lavRef[c.unidade] || {}).valor || 0;
    if (txtDinheiro_(lvC) !== txtDinheiro_(futN_(c.lavanderia))) { c.lavanderia = lvC ? txtDinheiro_(lvC) : ''; atualizarLinha_(T.co, c, { lavanderia: c.lavanderia, total: txtDinheiro_(futTotal_(c)) }); }
    if (c.enviado_em || c.atualizado_por !== 'robô') return;
    var u = porId[c.unidade]; if (!u || !/^(alugado|renovar)$/.test(u.situacao) || !(futN_(u.aluguel) > 0)) return;
    var k = futCalcCobranca_(u, comp, energiaAnt);
    if (!k.energia && futCobraEnergia_(u)) k.energia = futN_(c.energia);
    var tot = k.aluguel + k.taxas + k.energia + futN_(c.outros) + futN_(c.lavanderia);
    if (txtDinheiro_(tot) === txtDinheiro_(futN_(c.total)) && (c.detalhe || '') === k.detalhe && txtDinheiro_(k.aluguel) === txtDinheiro_(futN_(c.aluguel))) return;
    atualizarLinha_(T.co, c, { aluguel: txtDinheiro_(k.aluguel), taxas: txtDinheiro_(k.taxas), energia: k.energia ? txtDinheiro_(k.energia) : '', total: txtDinheiro_(tot), detalhe: k.detalhe });
  });
  // recebimento já lançado (importado ou à mão) → cobrança paga
  T.co.linhas.forEach(function (c) {
    if (c.competencia !== comp || c.pago_em || c.situacao === 'paga fora') return;
    var refC = futRefDaCobranca_(c);
    var pagos = T.la.linhas.filter(function (l) { return l.tipo === 'receita' && l.unidade === c.unidade && l.competencia === refC && /aluguel/i.test(l.categoria) && l.origem !== 'cobrança'; });
    if (!pagos.length) return;
    var soma = pagos.reduce(function (a, l) { return a + futN_(l.valor); }, 0);
    atualizarLinha_(T.co, c, { pago_em: pagos.map(function (l) { return l.data; }).sort().pop() || hojeSP_(), valor_pago: txtDinheiro_(soma),
      lanc_id: pagos[0].id, situacao: soma + 0.01 >= futN_(c.total) ? 'paga' : 'paga em parte', atualizado_em: agora, atualizado_por: 'robô' });
  });
  if (comp === '2026-11') { try { futCorrigirOutubro_(T); } catch (eF) { /* segue */ } }
  return feitas;
}
function futSituacaoCobranca_(c, hoje) {
  if (c.situacao === 'cancelada') return 'cancelada';
  if (c.pago_em) return futN_(c.valor_pago) + 0.01 >= futN_(c.total) ? 'paga' : 'paga em parte';
  return c.vencimento && c.vencimento < hoje ? 'atrasada' : 'aberta';
}

function futureResumo_(d, u) {
  var T = futTabs_(), hoje = hojeSP_(), comp = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_(hoje);
  try { if (comp <= futCompMais_(futComp_(hoje), 1)) futureGerarCobrancas_(comp, T); } catch (e) { /* segue mostrando */ }
  var cobMes = {}; T.co.linhas.forEach(function (c) { if (c.competencia === comp) cobMes[c.unidade] = c; });
  var atual = {}; T.pe.linhas.forEach(function (p) { if (p.situacao === 'atual') atual[p.unidade] = p; });
  var unidades = T.un.linhas.slice().sort(futOrdenarUnidades_).map(function (x) {
    var c = cobMes[x.id], pa = atual[x.id] || {};
    return { id: x.id, tipo: x.tipo, andar: x.andar, situacao: x.situacao, locatario: x.locatario, telefone: x.telefone, entrada: x.entrada, saida: x.saida,
      aluguel: futN_(x.aluguel), taxas: futN_(x.taxas), garantia: x.garantia, caucao: futN_(x.caucao), pagador: x.pagador || '', pasta_url: x.pasta_url || '',
      contrato_url: pa.contrato_url || '', pasta_pessoa: pa.pasta_url || '', obs: x.obs || '', cobranca: c ? futSituacaoCobranca_(c, hoje) : '' };
  });
  var n = function (s) { return unidades.filter(function (x) { return x.situacao === s; }).length; };
  var ref = futCompMais_(comp, -1);
  var noMes = function (tipo) { return T.la.linhas.filter(function (l) { return l.tipo === tipo && l.competencia === ref; }).reduce(function (a, l) { return a + futN_(l.valor); }, 0); };
  var serie = [];
  for (var i = 11; i >= 0; i--) {
    var cp = futCompMais_(comp, -i), r = 0, ds = 0, en = 0;
    T.la.linhas.forEach(function (l) { if (l.competencia !== cp) return; if (l.tipo === 'receita') r += futN_(l.valor); else { ds += futN_(l.valor); if (l.categoria === 'Energia') en += futN_(l.valor); } });
    serie.push({ mes: cp, receitas: r, despesas: ds, energia: en });
  }
  var abertas = T.co.linhas.filter(function (c) { var s = futSituacaoCobranca_(c, hoje); return s === 'aberta' || s === 'atrasada' || s === 'paga em parte'; });
  var atrasadas = abertas.filter(function (c) { return futSituacaoCobranca_(c, hoje) === 'atrasada'; }).map(function (c) {
    var un = T.un.linhas.filter(function (x) { return x.id === c.unidade; })[0] || {};
    return { id: c.id, unidade: c.unidade, pessoa: c.pessoa, competencia: c.competencia, vencimento: c.vencimento, total: futN_(c.total), telefone: un.telefone || '' };
  });
  var limite = somarDias_(hoje, 45);
  var vencendo = unidades.filter(function (x) { return x.saida && x.saida >= somarDias_(hoje, -10) && x.saida <= limite && /^(alugado|renovar)$/.test(x.situacao); })
    .sort(function (a, b) { return a.saida < b.saida ? -1 : 1; });
  return { mes: comp, ref: ref, hoje: hoje, unidades: unidades, total: unidades.length,
    numeros: { alugado: n('alugado'), disponivel: n('disponivel'), renovar: n('renovar'), reforma: n('reforma'), proprio: n('proprio') },
    receitas: noMes('receita'), despesas: noMes('despesa'),
    aReceber: abertas.filter(function (c) { return c.competencia === comp; }).reduce(function (a, c) { return a + futN_(c.total) - futN_(c.valor_pago); }, 0),
    atrasado: atrasadas.reduce(function (a, c) { return a + c.total; }, 0), atrasadas: atrasadas, vencendo: vencendo, serie: serie,
    importado: !!config_('FUTURE_IMPORTADO'), categorias: FUT_CATEGORIAS };
}

function futureUnidade_(d) {
  var T = futTabs_(), x = T.un.linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!x) throw falha_('Unidade não encontrada.');
  var hoje = hojeSP_(), o = {}; T.un.cab.forEach(function (k) { o[k] = x[k]; });
  o.pessoas = T.pe.linhas.filter(function (p) { return p.unidade === x.id; }).sort(function (a, b) { return (b.entrada || '') < (a.entrada || '') ? -1 : 1; })
    .map(function (p) { return { id: p.id, nome: p.nome, telefone: p.telefone, entrada: p.entrada, saida: p.saida, garantia: p.garantia, caucao: p.caucao, situacao: p.situacao, obs: p.obs, pasta_url: p.pasta_url || '', arquivos: +p.arquivos || 0, contrato_url: p.contrato_url || '' }; });
  o.cobrancas = T.co.linhas.filter(function (c) { return c.unidade === x.id; }).sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; })
    .slice(0, 24).map(function (c) { return { id: c.id, competencia: c.competencia, vencimento: c.vencimento, aluguel: futN_(c.aluguel), taxas: futN_(c.taxas), energia: futN_(c.energia), total: futN_(c.total), pago_em: c.pago_em, valor_pago: futN_(c.valor_pago), situacao: futSituacaoCobranca_(c, hoje), pessoa: c.pessoa }; });
  o.energia = T.en.linhas.filter(function (e) { return e.unidade === x.id; }).sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; })
    .slice(0, 24).map(function (e) { return { id: e.id, competencia: e.competencia, valor: futN_(e.valor), kwh: e.kwh }; });
  o.lancamentos = T.la.linhas.filter(function (l) { return l.unidade === x.id; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 40)
    .map(function (l) { return { id: l.id, data: l.data, competencia: l.competencia, tipo: l.tipo, categoria: l.categoria, valor: futN_(l.valor), descricao: l.descricao, pessoa: l.pessoa }; });
  return o;
}

function futureSalvarUnidade_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), x = T.un.linhas.filter(function (r) { return r.id === d.id; })[0], agora = new Date().toISOString(), hoje = hojeSP_();
    if (!x) throw falha_('Unidade não encontrada.');
    var m = {};
    ['aluguel', 'taxas', 'caucao'].forEach(function (k) { if (d[k] !== undefined) m[k] = d[k] === '' ? '' : txtDinheiro_(futN_(d[k])); });
    ['locatario', 'telefone', 'garantia', 'energia_resp', 'kit', 'uc', 'medidor', 'obs', 'pagador', 'cobra_energia', 'moeda', 'conta_receb'].forEach(function (k) { if (d[k] !== undefined) m[k] = k === 'obs' ? String(d[k]).trim() : String(d[k]).trim().slice(0, 300); });
    ['entrada', 'saida'].forEach(function (k) { if (d[k] !== undefined) m[k] = /^\d{4}-\d{2}-\d{2}$/.test(d[k]) ? d[k] : ''; });
    if (d.situacao !== undefined) { if (FUT_SITUACOES.indexOf(d.situacao) < 0) throw falha_('Situação inválida.'); m.situacao = d.situacao; }
    if (m.situacao === 'disponivel') m.locatario = '';
    var antigo = futNome_(x.locatario), novo = m.locatario !== undefined ? futNome_(m.locatario) : antigo;
    if (antigo && normalizar_(antigo) !== normalizar_(novo)) { // locatário saiu
      T.pe.linhas.filter(function (p) { return p.unidade === x.id && p.situacao === 'atual'; }).forEach(function (p) {
        atualizarLinha_(T.pe, p, { situacao: 'saiu', saida: p.saida && p.saida <= hoje ? p.saida : hoje });
      });
    }
    if (novo) {
      var p = T.pe.linhas.filter(function (q) { return q.unidade === x.id && normalizar_(q.nome) === normalizar_(novo); })[0];
      var dadosP = { nome: novo, telefone: m.telefone !== undefined ? m.telefone : x.telefone, entrada: m.entrada !== undefined ? m.entrada : x.entrada,
        saida: m.saida !== undefined ? m.saida : x.saida, garantia: m.garantia !== undefined ? m.garantia : x.garantia, caucao: m.caucao !== undefined ? m.caucao : x.caucao, situacao: 'atual' };
      if (p) atualizarLinha_(T.pe, p, dadosP);
      // a pasta do morador no Drive só nasce com o contrato de locação (página Contratos), pedido do Luiz
      else inserirLinha_(T.pe, Object.assign({ id: novoId_('FP'), unidade: x.id, cpf: '', obs: '', origem: 'painel', criado_em: agora, pasta_url: '', arquivos: '0' }, dadosP));
    }
    m.atualizado_em = agora; m.atualizado_por = u.usuario;
    atualizarLinha_(T.un, x, m);
    registrar_(u.usuario, 'future: unidade', x.id + ' ' + (m.situacao || x.situacao));
    return { ok: true };
  });
}

function futurePessoas_(d) {
  var T = futTabs_();
  return T.pe.linhas.slice().sort(function (a, b) { return (a.situacao === 'atual') === (b.situacao === 'atual') ? ((b.entrada || '') < (a.entrada || '') ? -1 : 1) : (a.situacao === 'atual' ? -1 : 1); })
    .map(function (p) { return { id: p.id, nome: p.nome, telefone: p.telefone, cpf: p.cpf, unidade: p.unidade, entrada: p.entrada, saida: p.saida, garantia: p.garantia, caucao: futN_(p.caucao), situacao: p.situacao, obs: p.obs, pasta_url: p.pasta_url || '', arquivos: +p.arquivos || 0, origem: p.origem, contrato_url: p.contrato_url || '' }; });
}
function futureSalvarPessoa_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), p = d.id ? T.pe.linhas.filter(function (x) { return x.id === d.id; })[0] : null, agora = new Date().toISOString();
    var m = {}; ['nome', 'telefone', 'cpf', 'garantia', 'obs'].forEach(function (k) { if (d[k] !== undefined) m[k] = k === 'obs' ? String(d[k]).trim() : String(d[k]).trim().slice(0, 300); });
    ['entrada', 'saida'].forEach(function (k) { if (d[k] !== undefined) m[k] = /^\d{4}-\d{2}-\d{2}$/.test(d[k]) ? d[k] : ''; });
    if (d.caucao !== undefined) m.caucao = d.caucao === '' ? '' : txtDinheiro_(futN_(d.caucao));
    if (d.unidade !== undefined) m.unidade = futIdUnidade_(d.unidade) || '';
    if (p) atualizarLinha_(T.pe, p, m);
    else { if (!m.nome) throw falha_('Informe o nome.'); inserirLinha_(T.pe, Object.assign({ id: novoId_('FP'), situacao: 'saiu', origem: 'painel', criado_em: agora }, m)); }
    return { ok: true };
  });
}

function futureCobrancas_(d) {
  var T = futTabs_(), hoje = hojeSP_(), comp = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_(hoje);
  if (comp <= futCompMais_(futComp_(hoje), 1)) futureGerarCobrancas_(comp, T);
  var un = {}; T.un.linhas.forEach(function (x) { un[x.id] = x; });
  var lavQ = {}; T.lv.linhas.forEach(function (l) { if (l.situacao !== 'excluida' && l.tipo !== 'faxina') lavQ[l.unidade + '|' + l.competencia] = (lavQ[l.unidade + '|' + l.competencia] || 0) + (+l.quantidade || 1); });
  var servRef = {}, servDe = function (c) { var rf = futRefDaCobranca_(c); if (!servRef[rf]) servRef[rf] = futServicosPorUnidade_(T, rf); var x = servRef[rf][c.unidade] || {}; return Object.keys(x).map(function (k) { return x[k]; }); };
  var lista = T.co.linhas.filter(function (c) { return c.competencia === comp || (!c.pago_em && c.competencia < comp && futSituacaoCobranca_(c, hoje) !== 'cancelada'); })
    .map(function (c) { return { id: c.id, unidade: c.unidade, pessoa: c.pessoa, competencia: c.competencia, vencimento: c.vencimento, aluguel: futN_(c.aluguel), taxas: futN_(c.taxas),
      energia: futN_(c.energia), outros: futN_(c.outros), total: futN_(c.total), pago_em: c.pago_em, valor_pago: futN_(c.valor_pago), forma: c.forma, situacao: futSituacaoCobranca_(c, hoje),
      telefone: (un[c.unidade] || {}).telefone || '', obs: c.obs, pagador: c.pagador || (un[c.unidade] || {}).pagador || '', enviado_em: c.enviado_em || '', enviado_por: c.enviado_por || '',
      lembrete5_em: c.lembrete5_em || '', lembrete10_em: c.lembrete10_em || '', conta: (un[c.unidade] || {}).conta_receb || '', detalhe: c.detalhe || '', lavanderia: futN_(c.lavanderia), servicos: futN_(c.lavanderia) ? servDe(c) : [], lav_qtd: (lavQ[c.unidade + '|' + futRefDaCobranca_(c)] || 0), moeda: (un[c.unidade] || {}).moeda || '', cobra_energia: futCobraEnergia_(un[c.unidade] || { id: c.unidade }), aluguel_cheio: futN_((un[c.unidade] || {}).aluguel) }; })
    .sort(function (a, b) { return a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : (a.unidade < b.unidade ? -1 : 1); });
  return Object.assign({ mes: comp, lista: lista }, futMensagemConfig_());
}
/** O que vai na mensagem de cobrança (tudo editável em Configurações; os dados da conta ficam só na planilha). */
/** Contas para receber (podem mudar; cada apartamento pode usar uma). Ficam só na planilha (Config FUTURE_CONTAS, JSON). */
var FUT_CAMPOS_CONTA = ['id', 'apelido', 'titular', 'banco', 'codigo_banco', 'agencia', 'conta', 'pix_tipo', 'pix'];
function futContas_() {
  var l = []; try { l = JSON.parse(config_('FUTURE_CONTAS') || '[]'); } catch (e) { l = []; }
  return (Array.isArray(l) ? l : []).filter(function (c) { return c && (c.pix || c.conta); });
}
function futSalvarContas_(lista, padrao) {
  var limpa = (lista || []).slice(0, 10).map(function (c, i) {
    var o = {}; FUT_CAMPOS_CONTA.forEach(function (k) { o[k] = String(c[k] || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim().slice(0, 80); });
    o.id = o.id || 'c' + Date.now().toString(36) + i; return o;
  }).filter(function (c) { return c.pix || c.conta; });
  setConfig_('FUTURE_CONTAS', JSON.stringify(limpa), 'Contas para receber os aluguéis do Edifício Future');
  var pd = limpa.some(function (c) { return c.id === padrao; }) ? padrao : (limpa[0] || {}).id || '';
  setConfig_('FUTURE_CONTA_PADRAO', pd, 'Conta padrão das cobranças do Edifício Future');
  return limpa;
}
function futMensagemConfig_() {
  var itens = String(config_('FUTURE_TAXAS_ITENS') || 'Taxa de lixo: 25,00\nInternet: 75,00\nIPTU: 40,00').split(/\r?\n|;/).map(function (l) {
    var m = /^\s*(.+?)\s*[:=]\s*(?:R\$\s*)?([\d.,]+)\s*$/.exec(l); return m ? { nome: m[1], valor: futN_(m[2]) } : null; }).filter(Boolean);
  var pagadores = {};
  String(config_('FUTURE_PAGADORES') || '').split(/\r?\n/).forEach(function (l) {
    var p = l.split('|').map(function (x) { return x.trim(); }); if (p[0]) pagadores[p[0]] = { telefone: p[1] || '', contato: p[2] || '' };
  });
  var pix = config_('FUTURE_PIX') || '';
  var contas = futContas_();
  return { pix: pix, contas: contas, conta_padrao: config_('FUTURE_CONTA_PADRAO') || (contas[0] || {}).id || '', taxas_desc: config_('FUTURE_TAXAS_DESC') || 'IPTU, taxa de lixo e internet', taxas_itens: itens,
    predio: futNomeCerto_(config_('FUTURE_NOME_MSG')) || 'Edifício Future', pagamento: futNomeCerto_(config_('FUTURE_PAGAMENTO')) || (pix ? 'Pix: ' + pix : ''),
    dinheiro: config_('FUTURE_DINHEIRO') === 'nao' ? '' : (futNomeCerto_(config_('FUTURE_DINHEIRO_TXT')) || 'Se preferir, o pagamento também pode ser feito em dinheiro.'),
    cotacao: futN_(config_('FUTURE_COTACAO')) || 5.5, pagadores: pagadores, assinatura: (function () {
      // pedido do Luiz: a mensagem sempre pede o comprovante, mesmo que a frase final seja trocada
      var f = futNomeCerto_(config_('FUTURE_FECHO') || 'Após o pagamento, encaminhe o comprovante identificando o apartamento. Obrigada!').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
      return /comprovante/i.test(f) ? f : f + '\nFavor enviar o comprovante de pagamento.';
    })() };
}
/**
 * 8.7.1 (pedido da usuária): o prédio é o EDIFÍCIO FUTURE — nunca "Edifício Cultura". Qualquer texto salvo nas Configurações
 * com o nome antigo sai certo na mensagem, e a configuração gravada é corrigida uma vez (`futCorrigirNomePredio_`).
 */
function futNomeCerto_(t) {
  return String(t || '').replace(/Edif[íi]cio\s+Cultura/gi, 'Edifício Future').replace(/\bEd\.?\s*Cultura\b/gi, 'Ed. Future').replace(/\bCultura\b/g, 'Future');
}
function futCorrigirNomePredio_() {
  if (config_('FUTURE_FIX_NOME')) return;
  ['FUTURE_NOME_MSG', 'FUTURE_FECHO', 'FUTURE_PAGAMENTO', 'FUTURE_DINHEIRO_TXT', 'FUTURE_TAXAS_DESC'].forEach(function (k) {
    var v = config_(k);
    if (v && /cultura/i.test(v)) setConfig_(k, futNomeCerto_(v), 'Texto do Edifício Future');
  });
  setConfig_('FUTURE_FIX_NOME', new Date().toISOString(), 'Nome do prédio corrigido para Edifício Future');
}

/** Desfaz a baixa: o pagamento feito pelo painel é apagado; o que veio do caixa/planilha (pagamento atrasado do mês anterior que o robô
 *  juntou por engano) vai para o mês de referência anterior, onde ele é de fato — e não volta a baixar esta cobrança. */
function futDesfazerPagamento_(T, c, u) {
  var ref = futRefDaCobranca_(c), agora = new Date().toISOString(), movidos = 0;
  T.la.linhas.filter(function (l) { return l.unidade === c.unidade && l.competencia === ref && l.tipo === 'receita' && /aluguel/i.test(l.categoria) || (l.origem === 'cobrança' && l.unidade === c.unidade && l.competencia === ref && l.tipo === 'receita'); })
    .forEach(function (l) {
      if (l.origem === 'cobrança') atualizarLinha_(T.la, l, { tipo: 'excluido', valor: '0' });
      else { atualizarLinha_(T.la, l, { competencia: futCompMais_(ref, -1), descricao: String(l.descricao || '') + ' (pagamento atrasado do mês anterior)' }); movidos++; }
    });
  atualizarLinha_(T.co, c, { pago_em: '', valor_pago: '', forma: '', lanc_id: '', situacao: 'aberta', atualizado_em: agora, atualizado_por: u.usuario || 'robô' });
  registrar_(u.usuario || 'robô', 'future: pagamento desfeito', c.unidade + ' ' + c.competencia + (movidos ? ' · ' + movidos + ' recebimento(s) para o mês anterior' : ''));
  return movidos;
}
/** Uma vez (pedido do Luiz): em outubro/2026, AP 202 e Sala 2 tinham pagamentos atrasados de setembro que o robô juntou à cobrança de outubro. */
function futCorrigirOutubro_(T) {
  if (config_('FUTURE_FIX_OUT26')) return;
  if (!T.co.linhas.some(function (c) { return c.competencia === '2026-11'; })) return;
  T.co.linhas.filter(function (c) { return c.competencia === '2026-11' && c.pago_em && (c.unidade === 'AP 202' || c.unidade === 'SALA 2'); })
    .forEach(function (c) { futDesfazerPagamento_(T, c, { usuario: 'robô' }); });
  setConfig_('FUTURE_FIX_OUT26', new Date().toISOString(), 'AP 202 e Sala 2: pagamentos de setembro tirados de outubro');
}
function futurePagarCobranca_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), c = T.co.linhas.filter(function (x) { return x.id === d.id; })[0], agora = new Date().toISOString();
    if (!c) throw falha_('Cobrança não encontrada.');
    if (d.desfazer) { futDesfazerPagamento_(T, c, u); return { ok: true }; }
    if (d.ajustar) { // muda valores da cobrança (aluguel, energia, outros); depois disso o robô não recalcula mais
      var en = futN_(d.energia), ou = futN_(d.outros), al = d.aluguel !== undefined && d.aluguel !== '' ? futN_(d.aluguel) : futN_(c.aluguel);
      atualizarLinha_(T.co, c, { aluguel: txtDinheiro_(al), energia: en ? txtDinheiro_(en) : '', outros: ou ? txtDinheiro_(ou) : '', obs: String(d.obs !== undefined ? d.obs : c.obs || ''),
        detalhe: Math.abs(al - futN_(c.aluguel)) > 0.009 ? '' : c.detalhe,
        total: txtDinheiro_(al + futN_(c.taxas) + en + ou + futN_(c.lavanderia)), atualizado_em: agora, atualizado_por: u.usuario });
      return { ok: true };
    }
    var valor = futN_(d.valor) || futN_(c.total) - futN_(c.valor_pago), data = /^\d{4}-\d{2}-\d{2}$/.test(d.data || '') ? d.data : hojeSP_();
    var ref = futRefDaCobranca_(c), lav = futN_(c.lavanderia), jaPago = futN_(c.valor_pago);
    // a lavanderia vai para a categoria dela no caixa quando a cobrança é quitada
    var lavAqui = lav && jaPago + valor + 0.01 >= futN_(c.total) && jaPago + 0.01 < futN_(c.total) - lav ? Math.min(lav, valor) : 0;
    var base = { data: data, competencia: ref, tipo: 'receita', unidade: c.unidade, pessoa: c.pessoa, forma: String(d.forma || 'Pix').slice(0, 40), responsavel: u.nome || u.usuario,
      origem: 'cobrança', chave: '', criado_em: agora, criado_por: u.usuario };
    var l = Object.assign({ id: novoId_('FL'), categoria: 'Aluguel', valor: txtDinheiro_(valor - lavAqui),
      descricao: (/^temp\|/.test(c.detalhe || '') ? 'Temporada ' : 'Aluguel + taxas ') + ref }, base);
    inserirLinha_(T.la, l);
    if (lavAqui) {
      var fx = ((futServicosPorUnidade_(T, ref)[c.unidade] || {}).faxina || {}).valor || 0; fx = Math.min(fx, lavAqui);
      if (lavAqui - fx > 0.009) inserirLinha_(T.la, Object.assign({ id: novoId_('FL'), categoria: 'Lavanderia', valor: txtDinheiro_(lavAqui - fx), descricao: 'Lavanderia ' + ref }, base));
      if (fx > 0.009) inserirLinha_(T.la, Object.assign({ id: novoId_('FL'), categoria: 'Faxina', valor: txtDinheiro_(fx), descricao: 'Faxina ' + ref }, base));
    }
    var pago = futN_(c.valor_pago) + valor;
    atualizarLinha_(T.co, c, { pago_em: data, valor_pago: txtDinheiro_(pago), forma: l.forma, lanc_id: c.lanc_id || l.id, situacao: pago + 0.01 >= futN_(c.total) ? 'paga' : 'paga em parte', atualizado_em: agora, atualizado_por: u.usuario });
    registrar_(u.usuario, 'future: pagamento', c.unidade + ' ' + c.competencia + ' R$ ' + txtDinheiro_(valor));
    return { ok: true };
  });
}

/** Empresa que paga vários apartamentos (ex.: Hercílio Luz): baixa todas as cobranças abertas dela no mês de uma vez. */
function futurePagarGrupo_(d, u) {
  var T = futTabs_(), comp = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_(), pag = String(d.pagador || '');
  if (!pag) throw falha_('Informe quem paga.');
  var un = {}; T.un.linhas.forEach(function (x) { un[x.id] = x; });
  var abertas = T.co.linhas.filter(function (c) { return c.competencia === comp && !c.pago_em && (c.pagador || (un[c.unidade] || {}).pagador) === pag; });
  if (!abertas.length) throw falha_('Nenhuma cobrança aberta de ' + pag + ' em ' + comp + '.');
  abertas.forEach(function (c) { futurePagarCobranca_({ id: c.id, data: d.data, forma: d.forma || 'Pix' }, u); });
  return { ok: true, pagas: abertas.length };
}

/** Cobrança mandada pelo WhatsApp: fica registrado quem mandou e quando. */
/** 8.7.0: lembrete do aluguel no WhatsApp (dia 5 e dia 10): marca que foi mandado, para não lembrar duas vezes. */
function futureCobrancaLembrete_(d, u) {
  return comTrava_(function () {
    var tab = tabela_('FutCobrancas'), c = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!c) throw falha_('Cobrança não encontrada.');
    var campo = d.qual === '10' ? 'lembrete10_em' : 'lembrete5_em', m = {};
    m[campo] = d.desfazer ? '' : new Date().toISOString();
    atualizarLinha_(tab, c, m);
    registrar_(u.usuario, 'future: lembrete de aluguel', c.unidade + ' dia ' + (d.qual === '10' ? '10' : '5'));
    return { ok: true };
  });
}

function futureCobrancaEnviada_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), c = T.co.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!c) throw falha_('Cobrança não encontrada.');
    if (d.desfazer) { atualizarLinha_(T.co, c, { enviado_em: '', enviado_por: '' }); return { ok: true }; }
    atualizarLinha_(T.co, c, { enviado_em: new Date().toISOString(), enviado_por: u.nome || u.usuario });
    registrar_(u.usuario, 'future: cobrança enviada', c.unidade + ' ' + c.competencia + (d.como ? ' (' + String(d.como).slice(0, 30) + ')' : ''));
    return { ok: true };
  });
}

/** Tabela da Celesc colada (cada linha com UC ou apartamento e o valor): lança a energia do mês de cada unidade. */
function futureEnergiaColar_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), comp = /^\d{4}-\d{2}$/.test(d.competencia || '') ? d.competencia : futCompMais_(futComp_(), -1);
    var porUc = {}; T.un.linhas.forEach(function (x) { [x.uc, x.uc_antiga, x.medidor].forEach(function (k) { k = String(k || '').replace(/\D/g, ''); if (k.length >= 6) porUc[k] = x.id; }); });
    var ok = [], nao = [];
    var lancar = function (unidade, valor) {
      futSalvarEnergia_(T, comp, unidade, valor, '', 'tabela colada');
      var c = T.co.linhas.filter(function (x) { return x.unidade === unidade && x.competencia === futCompMais_(comp, 1) && !x.pago_em; })[0];
      if (c) atualizarLinha_(T.co, c, { energia: txtDinheiro_(valor), total: txtDinheiro_(futTotal_(Object.assign({}, c, { energia: valor }))) });
      ok.push(unidade + ' ' + txtDinheiro_(valor));
    };
    var existe = function (id) { return T.un.linhas.some(function (x) { return x.id === id; }); };
    if (/energia\s*:/i.test(d.texto || '')) { // demonstrativos colados (como os do WhatsApp): "apartamento 101" … "Energia: R$ 103,53"
      var atual = '';
      String(d.texto || '').split(/\r?\n/).forEach(function (linha) {
        var a = /\b(?:apartamento|apto?\.?)\s*(\d{3})\b/i.exec(linha), sl = /\bsala\s*(?:comercial\s*)?0?(\d)\b/i.exec(linha);
        if (a) atual = futIdUnidade_(a[1]); else if (sl) atual = 'SALA ' + sl[1];
        var e = /^\s*energia\s*:\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/i.exec(linha);
        if (!e) return;
        if (atual && existe(atual)) { lancar(atual, futN_(e[1])); atual = ''; } else nao.push(linha.trim().slice(0, 120));
      });
      registrar_(u.usuario, 'future: energia colada', comp + ' ' + ok.length + ' unidade(s)');
      return { competencia: comp, lancadas: ok, naoEntendidas: nao };
    }
    String(d.texto || '').split(/\r?\n/).forEach(function (linha) {
      var l = linha.trim(); if (!l) return;
      var unidade = '', digitos = l.match(/\d{6,}/g) || [];
      digitos.some(function (k) { if (porUc[k]) { unidade = porUc[k]; return true; } return false; });
      if (!unidade) { var s2 = /sala\s*0?(\d)\b/i.exec(l); if (s2) unidade = 'SALA ' + s2[1]; }
      if (!unidade) { var m = /\b(?:ap(?:to|artamento)?\.?\s*)?([12]\d{2})\b(?![,.]\d)/i.exec(l.replace(/\d{6,}/g, ' ')); if (m) unidade = futIdUnidade_(m[1]); }
      if (unidade && !T.un.linhas.some(function (x) { return x.id === unidade; })) unidade = '';
      var vals = l.replace(/\d{6,}/g, ' ').match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}\b/g) || [];
      var valor = vals.length ? futN_(vals[vals.length - 1]) : 0;
      if (!unidade || !(valor > 0)) { nao.push(l.slice(0, 120)); return; }
      lancar(unidade, valor);
    });
    registrar_(u.usuario, 'future: energia colada', comp + ' ' + ok.length + ' unidade(s)');
    return { competencia: comp, lancadas: ok, naoEntendidas: nao };
  });
}

/** Pasta do morador no Drive: 05. ED. FUTURE › APARTAMENTOS › AP 101 › NOME (salas: na pasta da sala). Cria o que faltar. */
function futCriarPasta_(unidade, nome) {
  var raiz = futPastaRaiz_(); if (!raiz || !unidade || !nome) return '';
  var achar = function (pai, re, criar) { var it = pai.getFolders(); while (it.hasNext()) { var f = it.next(); if (re.test(String(f.getName()).trim())) return f; } return criar ? pai.createFolder(criar) : null; };
  var base;
  if (/^AP /.test(unidade)) {
    var aps = achar(raiz, /^apartamentos$/i, 'APARTAMENTOS');
    base = achar(aps, new RegExp('^AP\\.?\\s*' + unidade.slice(3) + '$', 'i'), unidade);
  } else base = achar(raiz, new RegExp('SALA\\D*0?' + unidade.replace(/\D/g, '') + '\\b', 'i'), 'SALA COMERCIAL ' + unidade.replace(/\D/g, ''));
  var nomePasta = String(nome).trim().toUpperCase().slice(0, 80);
  var p = achar(base, new RegExp('^' + nomePasta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), nomePasta);
  return p.getUrl();
}
function futurePastaPessoa_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), p = T.pe.linhas.filter(function (x) { return x.id === d.id; })[0];
    if (!p) throw falha_('Pessoa não encontrada.');
    if (!p.unidade) throw falha_('Informe a unidade da pessoa antes de criar a pasta.');
    var url = futCriarPasta_(p.unidade, p.nome);
    if (!url) throw falha_('Não achei a pasta 05. ED. FUTURE no Drive.');
    atualizarLinha_(T.pe, p, { pasta_url: url });
    return { pasta_url: url };
  });
}

/* ---------- Contratos de locação (página Contratos do Edifício Future) ----------
   Modelos (Google Docs) na pasta 05. ED. FUTURE › MODELOS DE CONTRATO, com marcas {{…}}; os dados da locadora ficam só lá.
   O contrato é um só modelo: sem caução, os parágrafos com [[SO_CAUCAO]] saem e as disposições finais viram a cláusula 9ª. */
var FUT_MODELOS = { contrato: ['FUTURE_MODELO_CONTRATO', 'MODELO — CONTRATO DE LOCAÇÃO (painel)'], laudo: ['FUTURE_MODELO_LAUDO', 'MODELO — LAUDO DE VISTORIA (painel)'],
  temporada: ['FUTURE_MODELO_TEMPORADA', 'MODELO — CONTRATO DE TEMPORADA (painel)'],
  distrato: ['FUTURE_MODELO_DISTRATO', 'MODELO — DISTRATO DE LOCAÇÃO (painel)'], aditivo: ['FUTURE_MODELO_ADITIVO', 'MODELO — TERMO ADITIVO DE LOCAÇÃO (painel)'] };
function futModelo_(tipo) {
  var m = FUT_MODELOS[tipo], id = config_(m[0]);
  if (id) { try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) { /* procura pelo nome */ } }
  var it = DriveApp.searchFiles("title = '" + m[1] + "' and trashed = false");
  if (!it.hasNext()) throw falha_('Não achei o modelo "' + m[1] + '" no Drive (pasta 05. ED. FUTURE › MODELOS DE CONTRATO).');
  var g = it.next(); setConfig_(m[0], g.getId(), 'Modelo do Edifício Future: ' + m[1]);
  return g;
}
/** Caução pelo prazo (regra do Luiz): até 11 meses = 1 aluguel; 12 meses ou mais = 2 aluguéis. */
function futCaucaoPadrao_(meses, aluguel) { return (meses >= 12 ? 2 : 1) * futN_(aluguel); }
function futNumExtenso_(n) { return extenso_(n).replace(/\s+(?:real|reais)$/, ''); }
function futMesesTxt_(n) { return n + ' (' + futNumExtenso_(n) + ') ' + (n === 1 ? 'mês' : 'meses'); }
/** Fim do contrato: mesmo dia, n meses depois (04/10/2026 + 12 = 04/10/2027, como nos contratos atuais). */
function futFimContrato_(inicio, meses) { return somarMeses_(inicio, meses); }
function futPapel_(g) {
  var f = g === 'F';
  return { LOCATARIO: f ? 'LOCATÁRIA' : 'LOCATÁRIO', LOCATARIO_TIT: f ? 'Locatária' : 'Locatário', O_LOCATARIO: f ? 'A LOCATÁRIA' : 'O LOCATÁRIO',
    O_LOCATARIO_MIN: f ? 'a LOCATÁRIA' : 'o LOCATÁRIO', DO_LOCATARIO: f ? 'da LOCATÁRIA' : 'do LOCATÁRIO', AO_LOCATARIO: f ? 'à LOCATÁRIA' : 'ao LOCATÁRIO',
    INSCRITO: f ? 'inscrita' : 'inscrito' };
}
/** "brasileiro, solteiro, autônomo, portador do RG nº …, inscrito no CPF sob o nº …, residente e domiciliado na …" */
function futQualificacao_(d, g) {
  if (String(d.qualificacao || '').trim()) return String(d.qualificacao).trim().replace(/[;.]\s*$/, '');
  var x = function (m, f) { return g === 'F' ? f : g === 'M' ? m : m + '(' + f.slice(-1) + ')'; };
  var nac = String(d.nacionalidade || '').trim() || x('brasileiro', 'brasileira');
  var end = String(d.endereco || '').trim();
  if (end && !/^(na|no|em)\s/i.test(end)) end = (/^(rua|avenida|av\.|travessa|rodovia|estrada|servid[aã]o|alameda|pra[cç]a)/i.test(end) ? 'na ' : 'em ') + end;
  return [nac, estadoCivilGenero_(d.estado_civil, g) || String(d.estado_civil || '').trim(), String(d.profissao || '').trim(),
    d.rg ? x('portador', 'portadora') + ' do RG nº ' + String(d.rg).trim() : '',
    d.cpf ? x('inscrito', 'inscrita') + ' no CPF sob o nº ' + String(d.cpf).trim() : '',
    end ? x('residente e domiciliado', 'residente e domiciliada') + ' ' + end : ''].filter(Boolean).join(', ');
}
/** Troca as marcas do modelo, tira os trechos de caução quando não há e acerta o visual (EB Garamond 12, justificado). */
function futPreencherDoc_(doc, campos, manter) {
  var body = doc.getBody();
  if (typeof manter !== 'object') manter = { SO_CAUCAO: !!manter };
  body.getParagraphs().slice().reverse().forEach(function (p) {
    var m = /\[\[(SO_[A-Z]+)\]\]/.exec(p.getText()); if (!m) return;
    if (manter[m[1]]) p.replaceText('\\[\\[' + m[1] + '\\]\\]', '');
    else { try { p.removeFromParent(); } catch (e) { p.setText(''); } }
  });
  Object.keys(campos).forEach(function (k) { body.replaceText('\\{\\{' + k + '\\}\\}', String(campos[k] == null ? '' : campos[k]).replace(/\$/g, '\\$')); });
  var t = body.editAsText(); if (t.getText().length) t.setFontFamily('EB Garamond').setFontSize(12);
  body.getParagraphs().forEach(function (p) {
    var naTabela = p.getParent() && p.getParent().getType() === DocumentApp.ElementType.TABLE_CELL;
    if (!naTabela && p.getAlignment() !== DocumentApp.HorizontalAlignment.CENTER) p.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
    // 8.11: todo contrato segue o padrão do escritório (docs/PADRAO-PETICOES.md): entrelinha 1,5, 8 pt depois e recuo de 1 cm no texto corrido
    if (!naTabela) {
      var tx = p.getText(), titulo = !tx.trim() || /^(CLÁUSULA|\d+\.\s|[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 .ºª–\-]{6,}$)/.test(tx.trim()) || p.getAlignment() === DocumentApp.HorizontalAlignment.CENTER;
      p.setLineSpacing(1.5).setSpacingAfter(tx.trim() ? 8 : 0);
      if (!titulo && tx.length > 80) p.setIndentFirstLine(28.35);
    }
  });
  body.setMarginTop(56).setMarginBottom(56).setMarginLeft(68).setMarginRight(56);
}

function futureContratos_(d) {
  var T = futTabs_(), tc = tabela_('FutContratos'), hoje = hojeSP_();
  var unidades = T.un.linhas.slice().sort(futOrdenarUnidades_).filter(function (x) { return /^AP /.test(x.id) && x.situacao !== 'proprio'; })
    .map(function (x) { return { id: x.id, situacao: x.situacao, locatario: x.locatario, telefone: x.telefone, entrada: x.entrada, saida: x.saida, aluguel: futN_(x.aluguel), kit: x.kit, uc: x.uc, medidor: x.medidor || '', pasta_url: x.pasta_url || '',
      caucao: futN_(x.caucao), garantia: x.garantia || '', modalidade: x.modalidade || '' }; });
  var lista = tc.linhas.filter(function (c) { return c.situacao !== 'excluido'; }).sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; }).slice(0, 60)
    .map(function (c) { return { id: c.id, criado_em: c.criado_em, criado_por: c.criado_por, unidade: c.unidade, nome: c.nome, telefone: c.telefone, prazo_meses: +c.prazo_meses || 0,
      inicio: c.inicio, fim: c.fim, aluguel: futN_(c.aluguel), garantia: c.garantia, caucao: futN_(c.caucao), tipo: c.tipo || 'mensal', situacao: c.situacao || '', dias: +c.dias || 0, valor_total: futN_(c.valor_total), doc_url: c.doc_url, pdf_url: c.pdf_url, laudo_doc: c.laudo_doc, laudo_pdf: c.laudo_pdf, pasta_url: c.pasta_url, email: c.email || '', video_url: c.video_url || '', enviado_em: c.enviado_em || '' }; });
  var vencendo = unidades.filter(function (x) { return /^(alugado|renovar)$/.test(x.situacao) && x.saida && x.saida >= somarDias_(hoje, -15) && x.saida <= somarDias_(hoje, 45); })
    .sort(function (a, b) { return a.saida < b.saida ? -1 : 1; });
  var pessoas = T.pe.linhas.filter(function (p) { return p.situacao === 'atual'; }).map(function (p) { return { id: p.id, nome: p.nome, unidade: p.unidade, cpf: p.cpf, rg: p.rg || '', telefone: p.telefone, qualificacao: p.qualificacao || '', genero: p.genero || '', email: p.email || '' }; });
  return { unidades: unidades, contratos: lista, vencendo: vencendo, pessoas: pessoas, dia_venc: parseInt(config_('FUTURE_DIA_VENC'), 10) || 10, hoje: hoje };
}

function futureGerarContrato_(d, u) {
  if (d.tipo === 'temporada') return futureGerarTemporada_(d, u);
  return comTrava_(function () {
    var T = futTabs_(), tc = tabela_('FutContratos'), agora = new Date().toISOString(), hoje = hojeSP_();
    var un = T.un.linhas.filter(function (x) { return x.id === futIdUnidade_(d.unidade); })[0];
    if (!un) throw falha_('Escolha o apartamento.');
    if (!/^AP /.test(un.id)) throw falha_('O modelo é de locação residencial (apartamentos).');
    var nome = String(d.nome || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (nome.length < 5) throw falha_('Informe o nome completo do(a) locatário(a).');
    var cpf = String(d.cpf || '').trim();
    if (cpf.replace(/\D/g, '').length !== 11) throw falha_('Informe o CPF (11 números).');
    var meses = parseInt(d.prazo_meses, 10);
    if (!(meses >= 1 && meses <= 60)) throw falha_('Escolha o prazo do contrato.');
    var inicio = /^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '') ? d.inicio : '';
    if (!inicio) throw falha_('Informe a data de início.');
    var fim = futFimContrato_(inicio, meses);
    var aluguel = futN_(d.aluguel) || futN_(un.aluguel); if (!(aluguel > 0)) throw falha_('Informe o valor do aluguel.');
    var comCaucao = d.garantia !== 'sem';
    var caucao = comCaucao ? (futN_(d.caucao) || futCaucaoPadrao_(meses, aluguel)) : 0;
    var g = d.genero === 'F' || d.genero === 'M' ? d.genero : generoPeloNome_(nome) || 'M';
    var diaVenc = parseInt(d.dia_venc, 10) || parseInt(config_('FUTURE_DIA_VENC'), 10) || 10;
    var telefone = String(d.telefone || un.telefone || '').trim();
    var vistoria = /^\d{4}-\d{2}-\d{2}$/.test(d.data_vistoria || '') ? d.data_vistoria : inicio;
    var nAlug = Math.round(caucao / aluguel * 100) / 100;
    var campos = Object.assign(futPapel_(g), {
      LOC_NOME: nome, LOC_CPF: cpf, LOC_QUALIFICACAO: futQualificacao_(Object.assign({}, d, { cpf: cpf }), g), LOC_TELEFONE: telefone || 'informado pelo(a) locatário(a)',
      APTO: un.id.replace('AP ', ''), KIT: String(d.kit || un.kit || '—').replace(/\.0$/, ''), UC: String(d.uc || un.uc || '—').replace(/\.0$/, ''),
      PRAZO: futMesesTxt_(meses), INICIO: dataBR_(inicio), FIM: dataBR_(fim), ALUGUEL: valorComExtenso_(aluguel), DIA_VENC: String(diaVenc),
      CAUCAO: comCaucao ? valorComExtenso_(caucao) + (nAlug === 1 ? ', equivalente a 1 (um) aluguel' : nAlug === 2 ? ', equivalente a 2 (dois) aluguéis' : '') : '',
      GARANTIA_ROTULO: comCaucao ? 'CAUÇÃO' : 'GARANTIA', GARANTIA_TEXTO: comCaucao ? valorComExtenso_(caucao) : 'sem caução',
      TITULO_GARANTIA: comCaucao ? 'COM CAUÇÃO' : 'SEM CAUÇÃO', TITULO_GARANTIA_TEXTO: comCaucao ? ' COM CAUÇÃO' : '',
      CAUCAO_ATO: comCaucao ? 'No ato da assinatura deste contrato, ' + (g === 'F' ? 'A LOCATÁRIA' : 'O LOCATÁRIO') + ' efetuará o pagamento de ' + valorComExtenso_(caucao) + ', a título de caução, nos termos da Cláusula 9ª. ' : '',
      N_FINAL: comCaucao ? '10ª' : '9ª', DATA_ASSINATURA: porExtensoData_(/^\d{4}-\d{2}-\d{2}$/.test(d.data_assinatura || '') ? d.data_assinatura : hoje),
      DATA_VISTORIA: dataBR_(vistoria), VIDEO_DURACAO: String(d.video_duracao || '').trim() || '___ minutos',
      // 8.11: UC + medidor (relógio) no contrato e no laudo; e-mail para mandar o laudo e o vídeo; prazo para apontar divergências
      MEDIDOR: String(d.medidor || un.medidor || '—').replace(/\.0$/, ''), LOC_EMAIL: String(d.email || '').trim() || 'informado pelo(a) locatário(a)',
      PRAZO_LAUDO: futPrazoLaudo_(), CHAVES: String(d.chaves || '').trim() || 'conforme registrado no vídeo da vistoria',
      LEITURA: String(d.leitura || '').trim() || '________', OBS_VISTORIA: String(d.obs_vistoria || '').trim() || 'Nenhuma ressalva além do desgaste natural.'
    });
    try { futAtualizarModelos811_(); } catch (eM) { /* segue com o modelo como está */ }
    // pasta do morador: APARTAMENTOS › AP x › NOME (só agora, com o contrato)
    var pastaUrl = futCriarPasta_(un.id, nome);
    if (!pastaUrl) throw falha_('Não achei a pasta 05. ED. FUTURE no Drive.');
    var pasta = DriveApp.getFolderById(/folders\/([\w-]+)/.exec(pastaUrl)[1]);
    var gerar = function (tipo, titulo) {
      var arq = titulo + ' — ' + un.id + ' — ' + nome;
      var copia = futModelo_(tipo).makeCopy(arq, pasta), doc = DocumentApp.openById(copia.getId());
      futPreencherDoc_(doc, campos, comCaucao); doc.saveAndClose();
      var pdf = pasta.createFile(copia.getAs('application/pdf')).setName(arq + '.pdf');
      return { doc: copia.getUrl(), pdf: pdf.getUrl() };
    };
    var ct = gerar('contrato', 'CONTRATO DE LOCAÇÃO'), la = gerar('laudo', 'LAUDO DE VISTORIA');
    // unidade e locatário atualizados
    var mudaUnidade = d.atualizar_unidade !== 'nao' && d.atualizar_unidade !== false;
    var pessoa = T.pe.linhas.filter(function (p) { return p.unidade === un.id && (futMesmaPessoa_(p.nome, nome) || (p.cpf && p.cpf.replace(/\D/g, '') === cpf.replace(/\D/g, ''))); })[0];
    var dadosP = { nome: nome, telefone: telefone, cpf: cpf, rg: String(d.rg || '').trim(), qualificacao: String(d.qualificacao || '').trim() || campos.LOC_QUALIFICACAO, genero: g,
      entrada: pessoa && pessoa.entrada && pessoa.entrada < inicio ? pessoa.entrada : inicio, saida: fim, garantia: comCaucao ? 'Caução' : 'Sem caução', caucao: comCaucao ? txtDinheiro_(caucao) : '',
      pasta_url: pastaUrl, contrato_url: ct.pdf, laudo_url: la.pdf, email: futEmailOk_(d.email) };
    if (mudaUnidade) {
      T.pe.linhas.filter(function (p) { return p.unidade === un.id && p.situacao === 'atual' && p !== pessoa; }).forEach(function (p) {
        atualizarLinha_(T.pe, p, { situacao: 'saiu', saida: p.saida && p.saida <= inicio ? p.saida : inicio });
      });
      dadosP.situacao = 'atual';
    }
    if (pessoa) atualizarLinha_(T.pe, pessoa, dadosP);
    else { pessoa = Object.assign({ id: novoId_('FP'), unidade: un.id, obs: '', origem: 'contrato', criado_em: agora, arquivos: '4', situacao: mudaUnidade ? 'atual' : 'futuro' }, dadosP); inserirLinha_(T.pe, pessoa); }
    if (mudaUnidade) atualizarLinha_(T.un, un, { modalidade: 'mensal', situacao: 'alugado', locatario: nome, telefone: telefone, entrada: dadosP.entrada, saida: fim, aluguel: txtDinheiro_(aluguel),
      garantia: dadosP.garantia, caucao: dadosP.caucao, pagador: d.pagador !== undefined ? String(d.pagador).trim() : un.pagador, atualizado_em: agora, atualizado_por: u.usuario });
    if (comCaucao && d.lancar_caucao === 'sim') {
      inserirLinha_(T.la, { id: novoId_('FL'), data: hoje, competencia: futComp_(hoje), tipo: 'receita', categoria: 'Caução', unidade: un.id, pessoa: nome, valor: txtDinheiro_(caucao),
        forma: String(d.forma_caucao || 'Pix').slice(0, 40), responsavel: u.nome || u.usuario, descricao: 'Caução do contrato ' + dataBR_(inicio) + ' a ' + dataBR_(fim), origem: 'contrato', chave: '', criado_em: agora, criado_por: u.usuario });
    }
    var reg = { id: novoId_('FK'), criado_em: agora, criado_por: u.nome || u.usuario, unidade: un.id, pessoa_id: pessoa.id, nome: nome, cpf: cpf, telefone: telefone,
      prazo_meses: String(meses), inicio: inicio, fim: fim, aluguel: txtDinheiro_(aluguel), garantia: comCaucao ? 'caução' : 'sem caução', caucao: comCaucao ? txtDinheiro_(caucao) : '',
      doc_url: ct.doc, pdf_url: ct.pdf, laudo_doc: la.doc, laudo_pdf: la.pdf, pasta_url: pastaUrl, situacao: 'gerado', tipo: 'mensal', dias: '', valor_total: '', email: futEmailOk_(d.email), video_url: '', enviado_em: '', enviado_por: '' };
    inserirLinha_(tc, reg);
    registrar_(u.usuario, 'future: contrato gerado', un.id + ' ' + nome + ' ' + meses + ' meses ' + (comCaucao ? 'com caução' : 'sem caução'));
    return { ok: true, id: reg.id, contrato: ct, laudo: la, pasta_url: pastaUrl, fim: fim, caucao: caucao, unidade: un.id, nome: nome, telefone: telefone, email: reg.email };
  });
}

/* ---------- 8.11: laudo completo, UC + medidor, prazo do laudo, envio por e-mail ---------- */
/** Prazo para o locatário apontar divergências no laudo. A Lei 8.245/91 não fixa prazo (art. 22, V, e 23, III): é contratual.
 *  Padrão 5 dias corridos da entrega das chaves (Config FUTURE_PRAZO_LAUDO_DIAS). */
function futPrazoLaudo_() {
  var n = parseInt(config_('FUTURE_PRAZO_LAUDO_DIAS'), 10); if (!(n >= 1 && n <= 30)) n = 5;
  return n + ' (' + futNumExtenso_(n) + ') ' + (n === 1 ? 'dia' : 'dias') + ' corridos';
}
function futEmailOk_(e) { e = String(e || '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) ? e : ''; }
/** Uma vez (Config FUTURE_MODELOS_811): acrescenta nos modelos do Drive (contrato e laudo) UC + medidor, o prazo do laudo, o envio por
 *  WhatsApp ou e-mail, a responsabilidade de devolver tudo como no laudo, a caução como garantia e o quadro "itens conferidos". */
function futAtualizarModelos811_() {
  if (config_('FUTURE_MODELOS_811')) return;
  var achar = function (body, re) { var ps = body.getParagraphs(); for (var i = 0; i < ps.length; i++) if (re.test(ps[i].getText())) return ps[i]; return null; };
  var depois = function (body, p, txt, negritoAte) {
    var np = body.insertParagraph(body.getChildIndex(p) + 1, txt);
    np.setHeading(DocumentApp.ParagraphHeading.NORMAL).editAsText().setBold(false);
    if (negritoAte) np.editAsText().setBold(0, negritoAte - 1, true);
    return np;
  };
  // ----- contrato -----
  var dc = DocumentApp.openById(futModelo_('contrato').getId()), bc = dc.getBody();
  bc.replaceText('conforme projeto da unidade consumidora do condomínio nº \\{\\{UC\\}\\}', 'unidade consumidora (UC) nº {{UC}} e medidor de energia (relógio) nº {{MEDIDOR}}');
  bc.replaceText('encaminhado por WhatsApp ao número \\{\\{LOC_TELEFONE\\}\\}\\.', 'encaminhado por WhatsApp ao número {{LOC_TELEFONE}} ou por e-mail para {{LOC_EMAIL}}.');
  bc.replaceText('48 \\(quarenta e oito\\) horas', '{{PRAZO_LAUDO}}');
  var pu = achar(bc, /^PARÁGRAFO ÚNICO\. O imóvel possui as características descritas no auto de vistoria/);
  if (pu && !achar(bc, /A VISTORIA É PARTE DESTE CONTRATO/)) {
    var a1 = depois(bc, pu, 'A VISTORIA É PARTE DESTE CONTRATO. A vistoria é feita antes da entrega das chaves, junto com a assinatura deste contrato, e registra em laudo e em vídeo cada cômodo, as luzes, tomadas, interruptores, móveis, eletrodomésticos, utensílios, louças, esquadrias, chaves e a leitura do medidor de energia. O laudo e o vídeo são enviados {{AO_LOCATARIO}} por WhatsApp ou e-mail e integram este contrato.', 'A VISTORIA É PARTE DESTE CONTRATO.'.length);
    depois(bc, a1, 'RESPONSABILIDADE PELO QUE FOI ENTREGUE. {{O_LOCATARIO}} é responsável por conservar e devolver o imóvel e todos os itens descritos no laudo nas mesmas condições em que os recebeu, ressalvado o desgaste natural do uso regular. O que estiver danificado, faltando ou sem funcionar na vistoria final, em comparação com o laudo e o vídeo da vistoria inicial, será reparado ou reposto à sua custa, podendo o valor ser descontado da caução.', 'RESPONSABILIDADE PELO QUE FOI ENTREGUE.'.length);
  }
  var cau = achar(bc, /PARÁGRAFO SEGUNDO\. A LOCADORA obriga-se a devolver o valor pago a título de caução/);
  if (cau && !achar(bc, /A caução é garantia da LOCADORA/)) {
    depois(bc, cau, '[[SO_CAUCAO]]PARÁGRAFO TERCEIRO. A caução é garantia da LOCADORA e não poderá ser usada {{AO_LOCATARIO}} para pagar aluguéis, nem o último mês da locação. Só será devolvida depois da vistoria final, da entrega das chaves e da quitação dos aluguéis, da energia e dos demais encargos, podendo a LOCADORA reter o necessário para cobrir os danos e as faltas constatados em comparação com o laudo de vistoria inicial.', '[[SO_CAUCAO]]PARÁGRAFO TERCEIRO.'.length);
  }
  dc.saveAndClose();
  // ----- laudo -----
  var dl = DocumentApp.openById(futModelo_('laudo').getId()), bl = dl.getBody();
  bl.replaceText('quadro de medição kit \\{\\{KIT\\}\\}, Bairro', 'quadro de medição kit {{KIT}}, unidade consumidora (UC) nº {{UC}}, medidor de energia (relógio) nº {{MEDIDOR}}, Bairro');
  bl.replaceText('48 \\(quarenta e oito\\) horas', '{{PRAZO_LAUDO}}');
  bl.replaceText('será encaminhado por e-mail ou WhatsApp', 'é encaminhado por WhatsApp ({{LOC_TELEFONE}}) ou por e-mail ({{LOC_EMAIL}})');
  var concl = achar(bl, /^5\. CONCLUSÃO/);
  if (concl && !achar(bl, /ITENS CONFERIDOS NA ENTREGA/)) {
    var idx = bl.getChildIndex(concl);
    var tit = bl.insertParagraph(idx, '4.1 ITENS CONFERIDOS NA ENTREGA'); tit.editAsText().setBold(true);
    var linhas = [
      ['Energia', 'UC nº {{UC}} · medidor (relógio) nº {{MEDIDOR}} · leitura na entrega das chaves: {{LEITURA}} kWh.'],
      ['Iluminação', 'Todos os pontos de luz, lâmpadas, luminárias e luminárias de leitura da sala/cozinha, do quarto e do banheiro acesos e funcionando.'],
      ['Tomadas e interruptores', 'Todas as tomadas e todos os interruptores de cada cômodo testados e funcionando, com espelhos inteiros.'],
      ['Chuveiro e água quente', 'Chuveiro elétrico, registros e torneiras funcionando, sem vazamentos.'],
      ['Ar-condicionado', 'Ar-condicionado split ligando, resfriando e com controle remoto entregue.'],
      ['Chaves e controles', '{{CHAVES}}'],
      ['Ressalvas da vistoria', '{{OBS_VISTORIA}}']];
    var tb = bl.insertTable(idx + 1, linhas);
    for (var r = 0; r < tb.getNumRows(); r++) tb.getCell(r, 0).editAsText().setBold(true);
    bl.insertParagraph(idx + 2, 'O vídeo mostra, cômodo por cômodo, todos os itens listados neste laudo, inclusive as luzes acesas, e vale junto com ele.');
  }
  dl.saveAndClose();
  setConfig_('FUTURE_MODELOS_811', new Date().toISOString(), 'Modelos do Edifício Future atualizados (UC, medidor, vistoria, caução)');
}
/** Manda o contrato e o laudo (PDF anexo) e o link do vídeo da vistoria por e-mail; o vídeo fica compartilhado só com esse e-mail. */
function futureEnviarVistoria_(d, u) {
  var tc = tabela_('FutContratos'), c = tc.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!c) throw falha_('Contrato não encontrado.');
  var email = futEmailOk_(d.email || c.email);
  if (!email) throw falha_('Informe um e-mail válido do(a) locatário(a).');
  var video = String(d.video_url || c.video_url || '').trim();
  var idDe = function (url) { var m = /\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/.exec(url || ''); return m ? (m[1] || m[2]) : ''; };
  var anexos = [];
  [c.pdf_url, c.laudo_pdf].forEach(function (url) { var id = idDe(url); if (id) try { anexos.push(DriveApp.getFileById(id).getBlob()); } catch (e) { /* segue sem */ } });
  if (video && idDe(video)) { try { DriveApp.getFileById(idDe(video)).addViewer(email); } catch (e) { /* conta sem Google: o link pede acesso */ } }
  var nome = String(c.nome || '').split(' ')[0];
  nome = nome ? nome.charAt(0) + nome.slice(1).toLowerCase() : '';
  var apto = String(c.unidade || '').replace('AP ', 'apartamento ');
  var corpo = 'Olá, ' + nome + '!\n\nSeguem em anexo o contrato de locação e o laudo de vistoria do ' + apto + ' do Edifício Future.' +
    (video ? '\n\nVídeo da vistoria (faz parte do laudo): ' + video : '') +
    '\n\nConfira o laudo e o vídeo. Se encontrar alguma divergência, avise por escrito em até ' + futPrazoLaudo_() + ' da entrega das chaves; depois desse prazo, vale o estado descrito no laudo.' +
    '\n\nA devolução do apartamento deve ser feita nas mesmas condições registradas na vistoria. A caução é a garantia da locação e só é devolvida depois da vistoria final.\n\nQualquer dúvida, estamos à disposição.\n\nAdministração do ' + (config_('FUTURE_NOME_MSG') || 'Edifício Future');
  GmailApp.sendEmail(email, 'Contrato e laudo de vistoria — ' + apto + ' — Edifício Future', corpo, { attachments: anexos, name: config_('FUTURE_NOME_MSG') || 'Edifício Future' });
  comTrava_(function () {
    atualizarLinha_(tc, c, { email: email, video_url: video, enviado_em: new Date().toISOString(), enviado_por: u.nome || u.usuario });
    var T = futTabs_(), p = T.pe.linhas.filter(function (x) { return x.id === c.pessoa_id; })[0];
    if (p && !p.email) atualizarLinha_(T.pe, p, { email: email });
  });
  registrar_(u.usuario, 'future: laudo enviado por e-mail', c.unidade + ' ' + c.nome);
  return { ok: true, email: email, anexos: anexos.length };
}

/* ---------- 8.8.0: DISTRATO (encerrar a locação) e TERMO ADITIVO (prorrogar, reajustar, trocar de apartamento, outra cláusula) ---------- */

/** O contrato vigente de um apartamento: último registro "gerado" em FutContratos ou, para os antigos, os dados da unidade e do locatário. */
function futContratoVigente_(T, d) {
  var tc = tabela_('FutContratos');
  var reg = d.contrato_id ? tc.linhas.filter(function (c) { return c.id === d.contrato_id; })[0] : null;
  var unId = reg ? reg.unidade : futIdUnidade_(d.unidade);
  var un = T.un.linhas.filter(function (x) { return x.id === unId; })[0];
  if (!un) throw falha_('Escolha o apartamento.');
  if (!reg) reg = tc.linhas.filter(function (c) { return c.unidade === un.id && c.situacao === 'gerado' && (c.tipo || 'mensal') === 'mensal'; })
    .sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; })[0] || null;
  var pessoa = T.pe.linhas.filter(function (p) { return p.unidade === un.id && p.situacao === 'atual'; })[0] ||
    (reg ? T.pe.linhas.filter(function (p) { return p.id === reg.pessoa_id; })[0] : null);
  if (!pessoa && !un.locatario) throw falha_('Este apartamento não tem locatário atual.');
  var nome = String((pessoa && pessoa.nome) || un.locatario || '').toUpperCase();
  var g = (pessoa && (pessoa.genero === 'F' || pessoa.genero === 'M')) ? pessoa.genero : generoPeloNome_(nome) || 'M';
  return { tc: tc, reg: reg, un: un, pessoa: pessoa, nome: nome, genero: g, cpf: (pessoa && pessoa.cpf) || (reg && reg.cpf) || '',
    inicio: (reg && reg.inicio) || (pessoa && pessoa.entrada) || un.entrada || '', fim: (reg && reg.fim) || un.saida || (pessoa && pessoa.saida) || '',
    aluguel: futN_((reg && reg.aluguel) || un.aluguel), caucao: futN_((reg && reg.caucao) || un.caucao || (pessoa && pessoa.caucao)),
    telefone: (pessoa && pessoa.telefone) || un.telefone || '', pasta_url: (pessoa && pessoa.pasta_url) || (reg && reg.pasta_url) || '' };
}
function futQualifDe_(v, d) {
  var q = String(d.qualificacao || (v.pessoa && v.pessoa.qualificacao) || '').trim();
  if (q) return q.replace(/[;.]\s*$/, '');
  return futQualificacao_({ cpf: v.cpf, rg: d.rg || (v.pessoa && v.pessoa.rg) || '', profissao: d.profissao, estado_civil: d.estado_civil, endereco: d.endereco }, v.genero) ||
    (v.cpf ? (v.genero === 'F' ? 'inscrita' : 'inscrito') + ' no CPF sob o nº ' + v.cpf : 'já qualificad' + (v.genero === 'F' ? 'a' : 'o') + ' no contrato de locação');
}
/** Gera o Doc + PDF a partir do modelo, na pasta do morador (ou na do apartamento). Negrita o começo "CLÁUSULA …." de cada alteração. */
function futGerarDoc_(tipo, titulo, v, campos, manter) {
  var pastaUrl = v.pasta_url || futCriarPasta_(v.un.id, v.nome);
  var mId = /folders\/([\w-]+)/.exec(pastaUrl || '');
  if (!mId) throw falha_('Não achei a pasta do apartamento no Drive.');
  var pasta = DriveApp.getFolderById(mId[1]), arq = titulo + ' — ' + v.un.id + ' — ' + v.nome + ' — ' + dataBR_(hojeSP_()).replace(/\//g, '-');
  var copia = futModelo_(tipo).makeCopy(arq, pasta), doc = DocumentApp.openById(copia.getId());
  futPreencherDoc_(doc, campos, manter || {});
  doc.getBody().getParagraphs().forEach(function (p) {
    var m = /^(CLÁUSULA [^–\-]+[–\-][^.]+\.)/.exec(p.getText());
    if (m) p.editAsText().setBold(0, m[1].length - 1, true);
  });
  doc.saveAndClose();
  var pdf = pasta.createFile(copia.getAs('application/pdf')).setName(arq + '.pdf');
  return { doc: copia.getUrl(), pdf: pdf.getUrl(), pasta_url: pastaUrl };
}

/**
 * Distrato: encerra a locação. Motivo (fim do prazo / pedido do locatário antes do prazo / comum acordo / pedido da locadora),
 * vistoria final, valores pendentes (aluguel proporcional, energia, outros), multa (cláusula 8ª: 40% dos aluguéis que faltam — cobrar ou
 * dispensar) e caução (devolver, descontar ou não houve). Libera o apartamento, marca a saída do locatário e pode criar a cobrança final.
 */
function futureDistrato_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), v = futContratoVigente_(T, d), hoje = hojeSP_(), agora = new Date().toISOString();
    var enc = /^\d{4}-\d{2}-\d{2}$/.test(d.data_encerramento || '') ? d.data_encerramento : hoje;
    var chaves = /^\d{4}-\d{2}-\d{2}$/.test(d.data_chaves || '') ? d.data_chaves : enc;
    var papel = futPapel_(v.genero), motivo = d.motivo || 'acordo';
    var MOT = {
      fim: 'O encerramento decorre do término do prazo contratual.',
      locatario: 'O encerramento se dá a pedido ' + papel.DO_LOCATARIO + ', antes do término do prazo contratual.',
      acordo: 'O encerramento se dá por comum acordo entre as partes.',
      locadora: 'O encerramento se dá a pedido da LOCADORA, com a comunicação prevista no contrato.'
    };
    var aluguelProp = futN_(d.aluguel_proporcional), energia = futN_(d.energia), outros = futN_(d.outros), outrosDesc = String(d.outros_desc || '').trim().slice(0, 200);
    var pend = [];
    if (aluguelProp > 0) pend.push('aluguel proporcional até a entrega das chaves: ' + valorComExtenso_(aluguelProp));
    if (energia > 0) pend.push('energia elétrica do período: ' + valorComExtenso_(energia));
    if (outros > 0) pend.push((outrosDesc || 'outros valores') + ': ' + valorComExtenso_(outros));
    var totalPend = aluguelProp + energia + outros;
    var PEND = d.pendencias === 'quitado' || !pend.length
      ? 'As partes declaram que os aluguéis e encargos do período da locação estão quitados até a data de encerramento.'
      : papel.O_LOCATARIO + ' pagará à LOCADORA os seguintes valores referentes ao período da locação: ' + pend.join('; ') + ', totalizando ' + valorComExtenso_(totalPend) +
        ', até ' + dataBR_(/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento || '') ? d.vencimento : chaves) + '.';
    var multa = futN_(d.multa_valor), MULTA, multaCob = (motivo === 'locatario' && d.multa === 'cobrar' && multa > 0) ? multa : 0;
    if (motivo === 'locatario' && d.multa === 'cobrar' && multa > 0) MULTA = 'Por se tratar de devolução antecipada, ' + papel.O_LOCATARIO_MIN + ' pagará a multa prevista no contrato (Cláusula 8ª, Parágrafo Primeiro), no valor de ' + valorComExtenso_(multa) + ', juntamente com os valores acima.';
    else if (motivo === 'locatario') MULTA = 'Embora se trate de devolução antecipada, a LOCADORA dispensa, por liberalidade, a multa contratual prevista para esta hipótese.';
    else MULTA = 'Não há multa a ser paga por qualquer das partes em razão deste encerramento.';
    var cau = v.caucao, desconto = futN_(d.caucao_desconto), devolver = Math.max(0, cau - desconto), CAU;
    if (!(cau > 0) || d.caucao === 'nao_houve') CAU = 'O contrato não previa caução, nada havendo a devolver a esse título.';
    else if (desconto > 0) CAU = 'Do valor de ' + valorComExtenso_(cau) + ' pago a título de caução, a LOCADORA retém ' + valorComExtenso_(desconto) +
      (d.caucao_motivo ? ', referente a ' + String(d.caucao_motivo).trim().slice(0, 160) : ', para abater os valores devidos') + (devolver > 0 ? ', e devolve ' + papel.AO_LOCATARIO + ' o saldo de ' + valorComExtenso_(devolver) + '.' : ', nada restando a devolver.');
    else CAU = 'A LOCADORA devolve ' + papel.AO_LOCATARIO + ' o valor de ' + valorComExtenso_(cau) + ', pago a título de caução, por não haver valores a descontar.';
    var VIST = d.vistoria === 'ressalvas'
      ? 'Na vistoria final foram constatadas as seguintes ressalvas em relação à vistoria inicial: ' + String(d.vistoria_obs || '[COMPLETAR]').trim().slice(0, 600) + '.'
      : 'Na vistoria final, o imóvel foi encontrado nas mesmas condições da vistoria inicial, ressalvado o desgaste natural decorrente do uso regular.';
    var campos = Object.assign(papel, { LOC_NOME: v.nome, LOC_QUALIFICACAO: futQualifDe_(v, d), APTO: v.un.id.replace('AP ', ''),
      DATA_CONTRATO: v.inicio ? dataBR_(v.inicio) : '[data do contrato]', FIM_ORIGINAL: v.fim ? dataBR_(v.fim) : '[data]', DATA_ENCERRAMENTO: dataBR_(enc),
      DATA_CHAVES: dataBR_(chaves), MOTIVO_TEXTO: MOT[motivo] || MOT.acordo, VISTORIA_TEXTO: VIST, PENDENCIAS_TEXTO: PEND, MULTA_TEXTO: MULTA, CAUCAO_TEXTO: CAU,
      DATA_ASSINATURA: porExtensoData_(/^\d{4}-\d{2}-\d{2}$/.test(d.data_assinatura || '') ? d.data_assinatura : hoje) });
    // 8.11: distrato feito à mão (fora do painel) → só libera o apartamento e registra a saída, sem gerar documento
    var arq = d.sem_documento === 'sim' ? { doc: '', pdf: '', pasta_url: v.pasta_url || '' } : futGerarDoc_('distrato', 'DISTRATO DE LOCAÇÃO', v, campos);
    // apartamento livre e locatário com saída
    atualizarLinha_(T.un, v.un, { situacao: 'vago', locatario: '', telefone: '', saida: enc, caucao: '', garantia: '', atualizado_em: agora, atualizado_por: u.usuario });
    if (v.pessoa) atualizarLinha_(T.pe, v.pessoa, { situacao: 'saiu', saida: enc });
    if (v.reg) atualizarLinha_(v.tc, v.reg, { situacao: 'encerrado' });
    // cobrança final (fica de fora do recálculo do robô)
    var cobranca = null;
    if (d.cobranca_final === 'sim' && totalPend + multaCob > 0) {
      var venc = /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento || '') ? d.vencimento : chaves, tot = totalPend + multaCob;
      cobranca = { id: novoId_('FC'), unidade: v.un.id, pessoa: v.nome, competencia: futComp_(venc), vencimento: venc, aluguel: txtDinheiro_(aluguelProp), taxas: '', energia: energia ? txtDinheiro_(energia) : '',
        outros: txtDinheiro_(outros + multaCob), total: txtDinheiro_(tot), pago_em: '', valor_pago: '', forma: '', lanc_id: '', situacao: 'aberta',
        obs: 'Acerto final do distrato' + (outrosDesc ? ' — ' + outrosDesc : '') + (multaCob ? ' — multa ' + reaisTxt_(multaCob) : ''), criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario,
        pagador: '', enviado_em: '', enviado_por: '', detalhe: 'distrato', lavanderia: '' };
      inserirLinha_(T.co, cobranca);
    }
    if (d.lancar_caucao === 'sim' && cau > 0 && devolver > 0) {
      inserirLinha_(T.la, { id: novoId_('FL'), data: chaves, competencia: futComp_(chaves), tipo: 'despesa', categoria: 'Devolução de caução', unidade: v.un.id, pessoa: v.nome, valor: txtDinheiro_(devolver),
        forma: String(d.forma_caucao || 'Pix').slice(0, 40), responsavel: u.nome || u.usuario, descricao: 'Devolução da caução (distrato)', origem: 'distrato', chave: '', criado_em: agora, criado_por: u.usuario });
    }
    inserirLinha_(v.tc, { id: novoId_('FK'), criado_em: agora, criado_por: u.nome || u.usuario, unidade: v.un.id, pessoa_id: v.pessoa ? v.pessoa.id : '', nome: v.nome, cpf: v.cpf, telefone: v.telefone,
      prazo_meses: '', inicio: v.inicio, fim: enc, aluguel: txtDinheiro_(v.aluguel), garantia: '', caucao: cau ? txtDinheiro_(cau) : '', doc_url: arq.doc, pdf_url: arq.pdf, laudo_doc: '', laudo_pdf: '',
      pasta_url: arq.pasta_url, situacao: 'distrato', tipo: 'distrato', dias: '', valor_total: txtDinheiro_(totalPend) });
    registrar_(u.usuario, 'future: distrato', v.un.id + ' ' + v.nome + ' encerrado em ' + dataBR_(enc) + ' (' + motivo + ')');
    return { ok: true, documento: arq, unidade: v.un.id, nome: v.nome, telefone: v.telefone, cobranca: cobranca ? { id: cobranca.id, total: futN_(cobranca.total), vencimento: cobranca.vencimento } : null, devolver: devolver };
  });
}

/**
 * Termo aditivo: prorrogar o prazo, reajustar o aluguel, trocar de apartamento e/ou uma cláusula escrita à mão.
 * Atualiza o fim/aluguel do apartamento e do registro do contrato (a cobrança do mês seguinte já sai com o valor novo).
 */
function futureAditivo_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), v = futContratoVigente_(T, d), hoje = hojeSP_(), agora = new Date().toISOString(), papel = futPapel_(v.genero);
    var alts = [], n = 1, mudaUn = {}, mudaReg = {};
    var cl = function (titulo, txt) { alts.push('CLÁUSULA ' + n + 'ª – ' + titulo + '. ' + txt); n++; };
    if (d.prorrogar === 'sim') {
      var meses = parseInt(d.meses, 10), novoFim = /^\d{4}-\d{2}-\d{2}$/.test(d.novo_fim || '') ? d.novo_fim : (meses > 0 && v.fim ? futFimContrato_(v.fim, meses) : '');
      if (!novoFim) throw falha_('Informe por quantos meses prorrogar (ou a nova data de término).');
      cl('DA PRORROGAÇÃO DO PRAZO', 'O prazo da locação, que terminaria em ' + (v.fim ? dataBR_(v.fim) : '[data]') + ', fica prorrogado até ' + dataBR_(novoFim) +
        (meses > 0 ? ', ou seja, por mais ' + futMesesTxt_(meses) : '') + ', mantidas as demais condições do contrato, salvo o que for alterado neste termo.');
      mudaUn.saida = novoFim; mudaReg.fim = novoFim;
    }
    if (d.reajustar === 'sim') {
      var novo = futN_(d.novo_aluguel), desde = /^\d{4}-\d{2}-\d{2}$/.test(d.reajuste_desde || '') ? d.reajuste_desde : hoje;
      if (!(novo > 0)) throw falha_('Informe o novo valor do aluguel.');
      cl('DO NOVO VALOR DO ALUGUEL', 'A partir de ' + dataBR_(desde) + ', o aluguel mensal passa de ' + valorComExtenso_(v.aluguel) + ' para ' + valorComExtenso_(novo) +
        (d.indice ? ', conforme ' + String(d.indice).trim().slice(0, 120) : '') + ', mantidos o dia de vencimento e a forma de pagamento.');
      mudaUn.aluguel = txtDinheiro_(novo); mudaReg.aluguel = txtDinheiro_(novo);
    }
    var novaUn = null;
    if (d.trocar === 'sim') {
      novaUn = T.un.linhas.filter(function (x) { return x.id === futIdUnidade_(d.nova_unidade); })[0];
      if (!novaUn || novaUn.id === v.un.id) throw falha_('Escolha o novo apartamento.');
      if (/^(alugado|renovar)$/.test(novaUn.situacao)) throw falha_('O ' + novaUn.id + ' está alugado.');
      var dt = /^\d{4}-\d{2}-\d{2}$/.test(d.troca_data || '') ? d.troca_data : hoje;
      cl('DA TROCA DE UNIDADE', 'A partir de ' + dataBR_(dt) + ', o objeto da locação passa a ser o apartamento ' + novaUn.id.replace('AP ', '') + ' do mesmo edifício, em substituição ao apartamento ' +
        v.un.id.replace('AP ', '') + ', que ' + papel.O_LOCATARIO_MIN + ' devolve nas condições da vistoria. Será feito novo laudo de vistoria do apartamento ' + novaUn.id.replace('AP ', '') + ', que integra este termo.');
    }
    if (String(d.texto_livre || '').trim()) cl(String(d.titulo_livre || 'DA ALTERAÇÃO').trim().toUpperCase().slice(0, 60), String(d.texto_livre).trim().slice(0, 1500));
    if (!alts.length) throw falha_('Escolha pelo menos uma alteração (prorrogar, reajustar, trocar de apartamento ou escrever uma cláusula).');
    var ja = v.tc.linhas.filter(function (c) { return c.unidade === v.un.id && c.tipo === 'aditivo' && c.pessoa_id === (v.pessoa ? v.pessoa.id : '') && (!v.inicio || c.inicio === v.inicio); }).length;
    var ORD = ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO', 'SEXTO', 'SÉTIMO', 'OITAVO', 'NONO', 'DÉCIMO'];
    var campos = Object.assign(papel, { N_ADITIVO: ORD[ja] || (ja + 1) + 'º', LOC_NOME: v.nome, LOC_QUALIFICACAO: futQualifDe_(v, d), APTO: v.un.id.replace('AP ', ''),
      DATA_CONTRATO: v.inicio ? dataBR_(v.inicio) : '[data do contrato]', ALTERACAO_1: alts[0], ALTERACAO_2: alts[1] || '', ALTERACAO_3: alts[2] || '', ALTERACAO_4: alts[3] || '',
      CLAUSULA_RATIFICACAO: 'CLÁUSULA ' + n + 'ª – DA RATIFICAÇÃO E DO FORO.', DATA_ASSINATURA: porExtensoData_(/^\d{4}-\d{2}-\d{2}$/.test(d.data_assinatura || '') ? d.data_assinatura : hoje) });
    var arq = futGerarDoc_('aditivo', (ORD[ja] || '') + ' TERMO ADITIVO', v, campos, { SO_DOIS: alts.length > 1, SO_TRES: alts.length > 2, SO_QUATRO: alts.length > 3 });
    if (Object.keys(mudaUn).length) { mudaUn.situacao = v.un.situacao === 'renovar' ? 'alugado' : v.un.situacao; mudaUn.atualizado_em = agora; mudaUn.atualizado_por = u.usuario; atualizarLinha_(T.un, v.un, mudaUn); }
    if (v.pessoa && mudaUn.saida) atualizarLinha_(T.pe, v.pessoa, { saida: mudaUn.saida });
    if (v.reg && Object.keys(mudaReg).length) atualizarLinha_(v.tc, v.reg, mudaReg);
    if (novaUn) { // troca de apartamento: o locatário vai para o novo, o antigo fica vago
      var dtt = /^\d{4}-\d{2}-\d{2}$/.test(d.troca_data || '') ? d.troca_data : hoje;
      atualizarLinha_(T.un, novaUn, { situacao: 'alugado', locatario: v.nome, telefone: v.telefone, entrada: dtt, saida: mudaUn.saida || v.fim || '', aluguel: mudaUn.aluguel || txtDinheiro_(v.aluguel),
        caucao: v.caucao ? txtDinheiro_(v.caucao) : '', garantia: v.un.garantia || '', modalidade: 'mensal', atualizado_em: agora, atualizado_por: u.usuario });
      atualizarLinha_(T.un, v.un, { situacao: 'vago', locatario: '', telefone: '', saida: dtt, caucao: '', garantia: '', atualizado_em: agora, atualizado_por: u.usuario });
      if (v.pessoa) atualizarLinha_(T.pe, v.pessoa, { unidade: novaUn.id });
      if (v.reg) atualizarLinha_(v.tc, v.reg, { unidade: novaUn.id });
    }
    inserirLinha_(v.tc, { id: novoId_('FK'), criado_em: agora, criado_por: u.nome || u.usuario, unidade: (novaUn || v.un).id, pessoa_id: v.pessoa ? v.pessoa.id : '', nome: v.nome, cpf: v.cpf, telefone: v.telefone,
      prazo_meses: '', inicio: v.inicio, fim: mudaUn.saida || v.fim, aluguel: mudaUn.aluguel || txtDinheiro_(v.aluguel), garantia: '', caucao: '', doc_url: arq.doc, pdf_url: arq.pdf, laudo_doc: '', laudo_pdf: '',
      pasta_url: arq.pasta_url, situacao: 'aditivo', tipo: 'aditivo', dias: '', valor_total: '' });
    registrar_(u.usuario, 'future: termo aditivo', v.un.id + ' ' + v.nome + ' (' + alts.length + ' alteração(ões))');
    return { ok: true, documento: arq, unidade: (novaUn || v.un).id, nome: v.nome, telefone: v.telefone, novo_fim: mudaUn.saida || '', novo_aluguel: mudaUn.aluguel ? futN_(mudaUn.aluguel) : 0 };
  });
}

/* ---------- Lavanderia (8.4): cada lavagem entra na cobrança da pessoa no mês seguinte ---------- */
function futPrecoLav_() { return futN_(config_('FUTURE_LAV_PRECO')) || 25; }
/** Serviços cobrados à parte (pedido do Luiz): lavar R$ 25, secar R$ 25, lavar e secar = os dois, faxina do apartamento R$ 120. */
var FUT_SERVICOS = { lavar: 'Lavar', secar: 'Secar', lavar_secar: 'Lavar e secar', faxina: 'Faxina' };
function futPrecoServico_(tipo) {
  var lav = futPrecoLav_(), sec = futN_(config_('FUTURE_SECAR_PRECO')) || 25;
  return tipo === 'secar' ? sec : tipo === 'lavar_secar' ? lav + sec : tipo === 'faxina' ? (futN_(config_('FUTURE_FAXINA_PRECO')) || 120) : lav;
}
function futTipoServico_(t) {
  var n = normalizar_(t || '');
  if (/faxin|limpez/.test(n)) return 'faxina';
  if (/lav/.test(n) && /sec/.test(n)) return 'lavar_secar';
  if (/sec/.test(n)) return 'secar';
  return 'lavar';
}
/** Serviços do mês por unidade, agrupados por tipo (para a mensagem e o caixa). */
function futServicosPorUnidade_(T, ref) {
  var r = {};
  T.lv.linhas.forEach(function (l) {
    if (l.competencia !== ref || l.situacao === 'excluida') return;
    var tp = l.tipo || 'lavar', x = (r[l.unidade] = r[l.unidade] || {});
    x[tp] = x[tp] || { tipo: tp, nome: FUT_SERVICOS[tp] || tp, qtd: 0, valor: 0 };
    x[tp].qtd += (+l.quantidade || 1); x[tp].valor += futN_(l.valor);
  });
  return r;
}
function futAtualizarCobrancaRef_(T, ref) {
  var comp = futCompMais_(ref, 1);
  if (comp <= futCompMais_(futComp_(), 1)) futureGerarCobrancas_(comp, T);
}
function futureLavanderia_(d) {
  var T = futTabs_(), ref = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futCompMais_(futComp_(), -1);
  var lista = T.lv.linhas.filter(function (l) { return l.competencia === ref && l.situacao !== 'excluida'; }).sort(function (a, b) { return (a.data + a.unidade) < (b.data + b.unidade) ? -1 : 1; })
    .map(function (l) { return { id: l.id, data: l.data, unidade: l.unidade, pessoa: l.pessoa, quantidade: +l.quantidade || 1, valor: futN_(l.valor), obs: l.obs, tipo: l.tipo || 'lavar' }; });
  var cob = {}; T.co.linhas.forEach(function (c) { if (c.competencia === futCompMais_(ref, 1)) cob[c.unidade] = futSituacaoCobranca_(c, hojeSP_()); });
  var unidades = T.un.linhas.slice().sort(futOrdenarUnidades_).filter(function (x) { return x.situacao !== 'proprio' || /^AP/.test(x.id); })
    .map(function (x) { return { id: x.id, locatario: futNome_(x.locatario), situacao: x.situacao }; });
  var antigas = T.la.linhas.filter(function (l) { return l.competencia === ref && l.categoria === 'Lavanderia' && l.tipo === 'receita' && l.origem !== 'cobrança'; }).length;
  return { mes: ref, lista: lista, preco: futPrecoLav_(), precos: { lavar: futPrecoServico_('lavar'), secar: futPrecoServico_('secar'), lavar_secar: futPrecoServico_('lavar_secar'), faxina: futPrecoServico_('faxina') },
    servicos: FUT_SERVICOS, unidades: unidades, cobrancas: cob, antigas: antigas };
}
function futNovaLavagem_(T, ref, unidade, qtd, valor, data, pessoa, obs, u, tipo, chave) {
  var un = T.un.linhas.filter(function (x) { return x.id === unidade; })[0];
  if (!un) throw falha_('Unidade não encontrada: ' + unidade);
  qtd = Math.max(1, Math.min(60, parseInt(qtd, 10) || 1));
  tipo = FUT_SERVICOS[tipo] ? tipo : 'lavar';
  var total = futN_(valor) || qtd * futPrecoServico_(tipo);
  var dt = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : ref + '-' + (ref === futComp_() ? hojeSP_().slice(8) : '28');
  var l = { id: novoId_('FW'), data: dt, competencia: ref, unidade: unidade, pessoa: String(pessoa || futNome_(un.locatario) || '').slice(0, 120), quantidade: String(qtd),
    valor: txtDinheiro_(total), obs: String(obs || '').slice(0, 200), criado_em: new Date().toISOString(), criado_por: u.usuario, situacao: 'lançada', tipo: tipo, chave: chave || '' };
  inserirLinha_(T.lv, l);
  return l;
}
function futureSalvarLavagem_(d, u) {
  return comTrava_(function () {
    var T = futTabs_();
    if (d.preco !== undefined && futN_(d.preco) > 0) setConfig_('FUTURE_LAV_PRECO', txtDinheiro_(futN_(d.preco)), 'Preço de uma lavagem (Edifício Future)');
    if (d.preco_secar !== undefined && futN_(d.preco_secar) > 0) setConfig_('FUTURE_SECAR_PRECO', txtDinheiro_(futN_(d.preco_secar)), 'Preço de uma secagem (Edifício Future)');
    if (d.preco_faxina !== undefined && futN_(d.preco_faxina) > 0) setConfig_('FUTURE_FAXINA_PRECO', txtDinheiro_(futN_(d.preco_faxina)), 'Preço da faxina do apartamento (Edifício Future)');
    if (d.mudar && d.id) { // trocar o serviço de um lançamento (ex.: era faxina, não lavagem)
      var y = T.lv.linhas.filter(function (l) { return l.id === d.id; })[0];
      if (!y) throw falha_('Lançamento não encontrado.');
      var tp = FUT_SERVICOS[d.tipo] ? d.tipo : 'lavar', q = Math.max(1, parseInt(d.quantidade || y.quantidade, 10) || 1);
      atualizarLinha_(T.lv, y, { tipo: tp, quantidade: String(q), valor: txtDinheiro_(futN_(d.valor) || q * futPrecoServico_(tp)) });
      futAtualizarCobrancaRef_(T, y.competencia);
      return { ok: true };
    }
    if (d.so_preco) return { ok: true };
    if (d.excluir) {
      var x = T.lv.linhas.filter(function (l) { return l.id === d.id; })[0];
      if (!x) throw falha_('Lavagem não encontrada.');
      atualizarLinha_(T.lv, x, { situacao: 'excluida' });
      futAtualizarCobrancaRef_(T, x.competencia);
      return { ok: true };
    }
    var ref = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_(d.data);
    var l = futNovaLavagem_(T, ref, futIdUnidade_(d.unidade), d.quantidade, d.valor, d.data, d.pessoa, d.obs, u, d.tipo);
    futAtualizarCobrancaRef_(T, ref);
    registrar_(u.usuario, 'future: lavanderia', l.unidade + ' ' + l.quantidade + 'x ' + l.valor);
    return { ok: true, id: l.id };
  });
}
/** Tabela da lavanderia colada: "AP 101 2" · "101 - 2 lavagens - 50,00" · "Sala 2 1 30,00" · "12/10 204 25,00". */
function futureColarLavanderia_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), ref = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futCompMais_(futComp_(), -1), ok = [], nao = [], preco = futPrecoLav_();
    String(d.texto || '').split(/\r?\n/).forEach(function (linha) {
      var l = linha.trim(); if (!l) return;
      var data = '', md = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(l);
      if (md) { var ano = md[3] ? (md[3].length === 2 ? '20' + md[3] : md[3]) : ref.slice(0, 4); data = ano + '-' + ('0' + md[2]).slice(-2) + '-' + ('0' + md[1]).slice(-2); l = l.replace(md[0], ' '); }
      var unidade = '', sl = /\bsala\s*0?(\d)\b/i.exec(l);
      if (sl) { unidade = 'SALA ' + sl[1]; l = l.replace(sl[0], ' '); }
      else { var ap = /\b(?:ap(?:to|artamento)?\.?\s*)?([12]\d{2})\b(?![,.]\d)/i.exec(l); if (ap) { unidade = futIdUnidade_(ap[1]); l = l.replace(ap[0], ' '); } }
      if (!unidade || !T.un.linhas.some(function (x) { return x.id === unidade; })) { nao.push(linha.trim().slice(0, 100)); return; }
      var vals = l.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}\b/g) || [], valor = vals.length ? futN_(vals[vals.length - 1]) : 0;
      l = l.replace(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}\b/g, ' ');
      var mq = /\b(\d{1,2})\s*(?:x|lav|vez|máq|maq|sec|fax)/i.exec(l) || /\b(\d{1,2})\b/.exec(l);
      preco = futPrecoServico_(futTipoServico_(linha));
      var qtd = mq ? +mq[1] : (valor ? Math.max(1, Math.round(valor / preco)) : 1);
      if (!valor && qtd >= 15) { valor = qtd; qtd = Math.max(1, Math.round(valor / preco)); } // "101 25" = R$ 25, não 25 lavagens
      var x = futNovaLavagem_(T, ref, unidade, qtd, valor, data, '', 'tabela colada', u, futTipoServico_(linha));
      ok.push(unidade + ' ' + x.quantidade + 'x R$ ' + x.valor.replace('.', ','));
    });
    if (ok.length) futAtualizarCobrancaRef_(T, ref);
    registrar_(u.usuario, 'future: lavanderia colada', ref + ' ' + ok.length);
    return { mes: ref, lancadas: ok, naoEntendidas: nao };
  });
}

/* ---------- Pasta "PARA IMPORTAR" (05. ED. FUTURE): listas deixadas no Drive entram sozinhas no painel ----------
   Arquivo "DESPESAS …" — linhas "dd/mm/aaaa | categoria | descrição | valor" (a 1ª linha pode ser "MES: 2026-10").
   Arquivo "LAVANDERIA …" — linhas "dd/mm/aaaa | AP 106 | lavar/secar/lavar e secar/faxina | quantidade"; "SUBSTITUIR" troca o mês inteiro.
   Depois de lido, o arquivo ganha o nome "IMPORTADO … — nome" (não lê de novo). Os dados ficam só no Drive e na planilha. */
function futPastaImportar_() {
  var raiz = futPastaRaiz_(); if (!raiz) return null;
  var it = raiz.getFoldersByName ? raiz.getFoldersByName('PARA IMPORTAR') : null;
  if (it && it.hasNext()) return it.next();
  var f = raiz.getFolders(); while (f.hasNext()) { var x = f.next(); if (/^para importar$/i.test(String(x.getName()).trim())) return x; }
  return null;
}
function futTextoArquivo_(f) {
  try { if (String(f.getMimeType()) === 'application/vnd.google-apps.document') return DocumentApp.openById(f.getId()).getBody().getText(); } catch (e) { /* tenta como texto */ }
  try { return f.getBlob().getDataAsString('UTF-8'); } catch (e2) { return ''; }
}
function futDataLinha_(t, ref) {
  var m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(String(t || '').trim()); if (!m) return '';
  var ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : ref.slice(0, 4);
  return ano + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
function futureImportarPasta_(u) {
  u = u || { usuario: 'robô', nome: 'robô' };
  var pasta = futPastaImportar_(); if (!pasta) return { arquivos: 0, despesas: 0, lavanderia: 0, erros: [] };
  var T = futTabs_(), agora = new Date().toISOString(), r = { arquivos: 0, despesas: 0, lavanderia: 0, erros: [] }, refsLav = {};
  var jaChave = {}; T.la.linhas.forEach(function (l) { if (l.chave) jaChave[l.chave] = 1; }); T.lv.linhas.forEach(function (l) { if (l.chave) jaChave[l.chave] = 1; });
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next(), nome = String(f.getName());
    if (/^IMPORTADO/i.test(nome) || !/^(DESPESAS|LAVANDERIA|CONTA|PAGAMENTO)/i.test(nome)) continue;
    if (/^(CONTA|PAGAMENTO)/i.test(nome)) { // "titular: …", "banco: …", "chave pix: …" — vira uma conta para receber
      var c0 = {}, pad = false;
      futTextoArquivo_(f).split(/\r?\n/).forEach(function (l) {
        var m = /^\s*([^:#]+?)\s*:\s*(.+)$/.exec(l); if (!m) return;
        var k = normalizar_(m[1]), v = m[2].trim();
        if (/apelido|nome da conta/.test(k)) c0.apelido = v; else if (/titular|favorecid/.test(k)) c0.titular = v;
        else if (/codigo|cod\.? do banco|numero do banco/.test(k)) c0.codigo_banco = v; else if (/banco/.test(k)) c0.banco = v;
        else if (/agencia/.test(k)) c0.agencia = v; else if (/^conta/.test(k)) c0.conta = v;
        else if (/tipo/.test(k)) c0.pix_tipo = v; else if (/pix|chave/.test(k)) c0.pix = v; else if (/padrao/.test(k)) pad = /sim|s\b/i.test(v);
      });
      if (c0.pix || c0.conta) {
        var cs = futContas_(), ja = cs.filter(function (x) { return (c0.pix && x.pix === c0.pix) || (c0.conta && x.conta === c0.conta); })[0];
        if (ja) Object.assign(ja, c0); else { c0.id = 'c' + Date.now().toString(36); cs.push(c0); }
        futSalvarContas_(cs, pad || !config_('FUTURE_CONTA_PADRAO') ? (ja || c0).id : config_('FUTURE_CONTA_PADRAO'));
        r.contas = (r.contas || 0) + 1;
      } else r.erros.push(nome + ': não achei a chave Pix nem a conta');
      try { f.setName('IMPORTADO ' + dataBR_(hojeSP_()) + ' — ' + nome); } catch (eN) { /* segue */ }
      r.arquivos++; continue;
    }
    var lavanderia = /^LAVANDERIA/i.test(nome), linhas = futTextoArquivo_(f).split(/\r?\n/), ref = futCompMais_(futComp_(), -1), substituir = false, n = 0;
    linhas.forEach(function (bruta, i) {
      var t = bruta.trim(); if (!t || /^#/.test(t)) return;
      var mm = /^m[eê]s\s*[:=]\s*(\d{4}-\d{2})/i.exec(t); if (mm) { ref = mm[1]; return; }
      if (/^substituir/i.test(t)) { substituir = true; return; }
      var p = t.split('|').map(function (x) { return x.trim(); });
      var chave = 'pasta:' + f.getId() + ':' + i; if (jaChave[chave]) return;
      try {
        if (lavanderia) {
          if (p.length < 3) throw new Error('faltam colunas');
          var un = futIdUnidade_(String(p[1]).replace(/^ap(to|artamento)?\.?\s*/i, '')) || (/sala/i.test(p[1]) ? futIdUnidade_(p[1]) : '');
          if (!un) throw new Error('unidade?');
          if (substituir && !refsLav[ref]) { refsLav[ref] = 1; T.lv.linhas.forEach(function (l) { if (l.competencia === ref && l.situacao !== 'excluida' && !/^pasta:/.test(l.chave || '')) atualizarLinha_(T.lv, l, { situacao: 'excluida' }); }); }
          futNovaLavagem_(T, ref, un, p[3] || 1, p[4] || '', futDataLinha_(p[0], ref), '', 'pasta PARA IMPORTAR', u, futTipoServico_(p[2]), chave);
          refsLav[ref] = 1; r.lavanderia++; n++;
        } else {
          var valor = futN_(p[3] || p[p.length - 1]); if (!(valor > 0)) throw new Error('sem valor');
          var desc = p.length >= 4 ? p[2] : p[1], cat = p.length >= 4 ? p[1] : futCategoriaDespesa_(desc, '');
          inserirLinha_(T.la, { id: novoId_('FL'), data: futDataLinha_(p[0], ref) || ref + '-28', competencia: ref, tipo: 'despesa', categoria: String(cat || 'Outros').slice(0, 40),
            unidade: '', pessoa: '', valor: txtDinheiro_(valor), forma: 'Pix', responsavel: u.nome || u.usuario, descricao: String(desc || '').slice(0, 300), origem: 'pasta do Drive',
            chave: chave, criado_em: agora, criado_por: u.usuario });
          r.despesas++; n++;
        }
        jaChave[chave] = 1;
      } catch (e) { r.erros.push(nome + ' linha ' + (i + 1) + ': ' + e.message); }
    });
    try { f.setName('IMPORTADO ' + dataBR_(hojeSP_()) + ' — ' + nome); } catch (e3) { /* sem permissão para renomear: as chaves evitam duplicar */ }
    r.arquivos++;
    registrar_(u.usuario, 'future: pasta PARA IMPORTAR', nome + ' · ' + n + ' linha(s)');
  }
  Object.keys(refsLav).forEach(function (rf) { futAtualizarCobrancaRef_(T, rf); });
  return r;
}

/* ---------- Energia: titular de cada conta e a planilha dos 12 meses ---------- */
function futureEnergiaGrade_(d) {
  var T = futTabs_(), ref = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futCompMais_(futComp_(), -1);
  var meses = []; for (var i = 11; i >= 0; i--) meses.push(futCompMais_(ref, -i));
  var valores = {}; T.en.linhas.forEach(function (e) { if (meses.indexOf(e.competencia) >= 0) (valores[e.unidade] = valores[e.unidade] || {})[e.competencia] = futN_(e.valor); });
  var unidades = T.un.linhas.slice().sort(futOrdenarUnidades_).filter(function (x) { return futCobraEnergia_(x); })
    .map(function (x) { var dg = function (v) { return String(v || '').replace(/\.0$/, ''); };
      return { id: x.id, situacao: x.situacao, locatario: futNome_(x.locatario), titular: x.energia_resp || '', kit: dg(x.kit), medidor: dg(x.medidor), uc: dg(x.uc), uc_antiga: dg(x.uc_antiga) }; });
  return { mes: ref, meses: meses, unidades: unidades, valores: valores };
}

/* ---------- Despesas do mês em lote (como uma planilha) ---------- */
function futureLancamentosLote_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), agora = new Date().toISOString(), comp = /^\d{4}-\d{2}$/.test(d.competencia || '') ? d.competencia : futComp_(), n = 0;
    (d.itens || []).slice(0, 80).forEach(function (it) {
      var valor = futN_(it.valor); if (!(valor > 0)) return;
      var tipo = it.tipo === 'receita' ? 'receita' : 'despesa';
      var data = /^\d{4}-\d{2}-\d{2}$/.test(it.data || '') ? it.data : comp + '-' + (comp === futComp_() ? hojeSP_().slice(8) : '28');
      var desc = String(it.descricao || '').trim().slice(0, 300);
      var cat = String(it.categoria || '').trim() || (tipo === 'despesa' ? futCategoriaDespesa_(desc, '') : 'Outros');
      var l = { id: novoId_('FL'), data: data, competencia: comp, tipo: tipo, categoria: cat.slice(0, 40), unidade: futIdUnidade_(it.unidade) || '', pessoa: String(it.pessoa || '').slice(0, 120),
        valor: txtDinheiro_(valor), forma: String(it.forma || '').slice(0, 40), responsavel: u.nome || u.usuario, descricao: desc, origem: 'painel', chave: '', criado_em: agora, criado_por: u.usuario };
      inserirLinha_(T.la, l); n++;
      if (tipo === 'despesa' && l.categoria === 'Energia' && l.unidade) futSalvarEnergia_(T, comp, l.unidade, valor, '', 'despesa');
    });
    if (!n) throw falha_('Preencha pelo menos uma linha com valor.');
    registrar_(u.usuario, 'future: lançamentos em lote', comp + ' ' + n);
    return { ok: true, lancados: n };
  });
}

/** Locação por temporada (pedido do Luiz: quem fica alguns dias ou um mês paga um valor fechado, com energia e taxas inclusas).
 *  Modelo tirado do contrato "AMANDA 10 DIAS": valor total, reserva na assinatura + restante na saída (ou à vista), sem caução,
 *  lavanderia à parte. Gera contrato + laudo na pasta do morador e as cobranças das parcelas; o robô não cobra aluguel mensal. */
function futureGerarTemporada_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), tc = tabela_('FutContratos'), agora = new Date().toISOString(), hoje = hojeSP_();
    var un = T.un.linhas.filter(function (x) { return x.id === futIdUnidade_(d.unidade); })[0];
    if (!un || !/^AP /.test(un.id)) throw falha_('Escolha o apartamento.');
    var nome = String(d.nome || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (nome.length < 5) throw falha_('Informe o nome completo do(a) locatário(a).');
    var cpf = String(d.cpf || '').trim();
    if (cpf.replace(/\D/g, '').length !== 11) throw falha_('Informe o CPF (11 números).');
    var inicio = /^\d{4}-\d{2}-\d{2}$/.test(d.inicio || '') ? d.inicio : ''; if (!inicio) throw falha_('Informe a data de entrada.');
    var porMes = d.unidade_prazo === 'mes', n = parseInt(porMes ? d.meses : d.dias, 10);
    if (!(n >= 1 && n <= (porMes ? 11 : 120))) throw falha_(porMes ? 'Informe quantos meses (1 a 11).' : 'Informe quantos dias (1 a 120).');
    var fim = porMes ? somarMeses_(inicio, n) : somarDias_(inicio, n);
    var dias = Math.round((Date.parse(fim + 'T12:00:00Z') - Date.parse(inicio + 'T12:00:00Z')) / 86400000);
    var total = futN_(d.valor_total); if (!(total > 0)) throw falha_('Informe o valor total da temporada.');
    var duas = d.pagamento !== 'uma';
    var assinatura = /^\d{4}-\d{2}-\d{2}$/.test(d.data_assinatura || '') ? d.data_assinatura : hoje;
    var reserva = /^\d{4}-\d{2}-\d{2}$/.test(d.data_reserva || '') ? d.data_reserva : assinatura;
    var p1 = duas ? Math.round(total / 2 * 100) / 100 : total, p2 = Math.round((total - p1) * 100) / 100;
    var g = d.genero === 'F' || d.genero === 'M' ? d.genero : generoPeloNome_(nome) || 'M';
    var telefone = String(d.telefone || '').trim();
    var vistoria = /^\d{4}-\d{2}-\d{2}$/.test(d.data_vistoria || '') ? d.data_vistoria : inicio;
    var prazoTxt = porMes ? futMesesTxt_(n) : n + ' (' + futNumExtenso_(n) + ') ' + (n === 1 ? 'dia' : 'dias');
    var campos = Object.assign(futPapel_(g), {
      LOC_NOME: nome, LOC_CPF: cpf, LOC_QUALIFICACAO: futQualificacao_(Object.assign({}, d, { cpf: cpf }), g), LOC_TELEFONE: telefone || 'informado pelo(a) locatário(a)',
      APTO: un.id.replace('AP ', ''), KIT: String(d.kit || un.kit || '—').replace(/\.0$/, ''), UC: String(un.uc || '—').replace(/\.0$/, ''),
      PRAZO: prazoTxt, INICIO: dataBR_(inicio), FIM: dataBR_(fim), INICIO_EXT: porExtensoData_(inicio), FIM_EXT: porExtensoData_(fim),
      VALOR_TOTAL: valorComExtenso_(total),
      PARCELA_A: duas ? 'a) ' + valorComExtenso_(p1) + ', a ser pago em ' + porExtensoData_(reserva) + ', no ato da assinatura do presente contrato, a título de reserva do imóvel;'
        : 'Pagamento único de ' + valorComExtenso_(total) + ', em ' + porExtensoData_(reserva) + ', no ato da assinatura do presente contrato.',
      PARCELA_B: duas ? 'b) ' + valorComExtenso_(p2) + ', a ser pago em ' + porExtensoData_(fim) + ', no ato da saída e devolução das chaves.' : '',
      DATA_ASSINATURA: porExtensoData_(assinatura), DATA_VISTORIA: dataBR_(vistoria), VIDEO_DURACAO: String(d.video_duracao || '').trim() || '___ minutos'
    });
    var pastaUrl = futCriarPasta_(un.id, nome);
    if (!pastaUrl) throw falha_('Não achei a pasta 05. ED. FUTURE no Drive.');
    var pasta = DriveApp.getFolderById(/folders\/([\w-]+)/.exec(pastaUrl)[1]);
    var gerar = function (tipo, titulo) {
      var arq = titulo + ' — ' + un.id + ' — ' + nome;
      var copia = futModelo_(tipo).makeCopy(arq, pasta), doc = DocumentApp.openById(copia.getId());
      futPreencherDoc_(doc, campos, { SO_DUAS: duas, SO_CAUCAO: false }); doc.saveAndClose();
      var pdf = pasta.createFile(copia.getAs('application/pdf')).setName(arq + '.pdf');
      return { doc: copia.getUrl(), pdf: pdf.getUrl() };
    };
    var ct = gerar('temporada', 'CONTRATO DE TEMPORADA'), la = gerar('laudo', 'LAUDO DE VISTORIA');
    var mudaUnidade = d.atualizar_unidade !== 'nao';
    var pessoa = T.pe.linhas.filter(function (p) { return p.unidade === un.id && (futMesmaPessoa_(p.nome, nome) || (p.cpf && p.cpf.replace(/\D/g, '') === cpf.replace(/\D/g, ''))); })[0];
    var dadosP = { nome: nome, telefone: telefone, cpf: cpf, rg: String(d.rg || '').trim(), qualificacao: String(d.qualificacao || '').trim() || campos.LOC_QUALIFICACAO, genero: g,
      entrada: inicio, saida: fim, garantia: 'Temporada (sem caução)', caucao: '', pasta_url: pastaUrl, contrato_url: ct.pdf, laudo_url: la.pdf,
      obs: 'Temporada de ' + prazoTxt + ' · ' + reaisTxt_(total) };
    if (mudaUnidade) {
      T.pe.linhas.filter(function (p) { return p.unidade === un.id && p.situacao === 'atual' && p !== pessoa; }).forEach(function (p) { atualizarLinha_(T.pe, p, { situacao: 'saiu', saida: p.saida && p.saida <= inicio ? p.saida : inicio }); });
      dadosP.situacao = 'atual';
    }
    if (pessoa) atualizarLinha_(T.pe, pessoa, dadosP);
    else { pessoa = Object.assign({ id: novoId_('FP'), unidade: un.id, origem: 'contrato', criado_em: agora, arquivos: '4', situacao: mudaUnidade ? 'atual' : 'futuro' }, dadosP); inserirLinha_(T.pe, pessoa); }
    if (mudaUnidade) atualizarLinha_(T.un, un, { modalidade: 'temporada', situacao: 'alugado', locatario: nome, telefone: telefone, entrada: inicio, saida: fim, garantia: 'Temporada', caucao: '',
      atualizado_em: agora, atualizado_por: u.usuario });
    // cobranças das parcelas (aparecem em Cobranças no mês de referência do vencimento)
    var parcelas = duas ? [[p1, reserva, 'reserva'], [p2, fim, 'saída']] : [[total, reserva, 'à vista']];
    parcelas.forEach(function (pc, i) {
      inserirLinha_(T.co, { id: novoId_('FC'), unidade: un.id, pessoa: nome, competencia: futCompMais_(pc[1].slice(0, 7), 1), vencimento: pc[1], aluguel: txtDinheiro_(pc[0]), taxas: '', energia: '',
        outros: '', lavanderia: '', total: txtDinheiro_(pc[0]), pago_em: '', valor_pago: '', forma: '', lanc_id: '', situacao: 'aberta', obs: 'Temporada — ' + pc[2], criado_em: agora,
        atualizado_em: agora, atualizado_por: u.usuario, pagador: '', detalhe: ['temp', i + 1, parcelas.length, dias, inicio, fim, pc[2]].join('|') });
    });
    inserirLinha_(tc, { id: novoId_('FK'), criado_em: agora, criado_por: u.nome || u.usuario, unidade: un.id, pessoa_id: pessoa.id, nome: nome, cpf: cpf, telefone: telefone,
      prazo_meses: porMes ? String(n) : '', inicio: inicio, fim: fim, aluguel: '', garantia: 'temporada', caucao: '', doc_url: ct.doc, pdf_url: ct.pdf, laudo_doc: la.doc, laudo_pdf: la.pdf,
      pasta_url: pastaUrl, situacao: 'gerado', tipo: 'temporada', dias: String(dias), valor_total: txtDinheiro_(total) });
    registrar_(u.usuario, 'future: contrato de temporada', un.id + ' ' + nome + ' ' + prazoTxt + ' ' + reaisTxt_(total));
    return { ok: true, contrato: ct, laudo: la, pasta_url: pastaUrl, fim: fim, caucao: 0, unidade: un.id, nome: nome, telefone: telefone, temporada: true, parcelas: parcelas.length, total: total };
  });
}

function futureLancamentos_(d) {
  var T = futTabs_(), comp = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_();
  return { mes: comp, lista: T.la.linhas.filter(function (l) { return l.competencia === comp && l.tipo !== 'excluido'; })
    .sort(function (a, b) { return (a.data || '') < (b.data || '') ? 1 : -1; })
    .map(function (l) { return { id: l.id, data: l.data, tipo: l.tipo, categoria: l.categoria, unidade: l.unidade, pessoa: l.pessoa, valor: futN_(l.valor), forma: l.forma, responsavel: l.responsavel, descricao: l.descricao, origem: l.origem }; }),
    categorias: FUT_CATEGORIAS };
}
function futureSalvarLancamento_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), agora = new Date().toISOString();
    if (d.excluir) {
      var x = T.la.linhas.filter(function (l) { return l.id === d.id; })[0];
      if (!x) throw falha_('Lançamento não encontrado.');
      atualizarLinha_(T.la, x, { tipo: 'excluido' });
      registrar_(u.usuario, 'future: lançamento excluído', x.id + ' ' + x.descricao);
      return { ok: true };
    }
    if (['receita', 'despesa'].indexOf(d.tipo) < 0) throw falha_('Escolha receita ou despesa.');
    var valor = futN_(d.valor); if (!(valor > 0)) throw falha_('Informe o valor.');
    var data = /^\d{4}-\d{2}-\d{2}$/.test(d.data || '') ? d.data : hojeSP_();
    var l = { id: novoId_('FL'), data: data, competencia: /^\d{4}-\d{2}$/.test(d.competencia || '') ? d.competencia : futComp_(data), tipo: d.tipo,
      categoria: String(d.categoria || 'Outros').slice(0, 40), unidade: futIdUnidade_(d.unidade) || '', pessoa: String(d.pessoa || '').slice(0, 120), valor: txtDinheiro_(valor),
      forma: String(d.forma || '').slice(0, 40), responsavel: u.nome || u.usuario, descricao: String(d.descricao || '').slice(0, 300), origem: 'painel', chave: '', criado_em: agora, criado_por: u.usuario };
    inserirLinha_(T.la, l);
    if (l.tipo === 'despesa' && l.categoria === 'Energia' && l.unidade) futSalvarEnergia_(T, l.competencia, l.unidade, valor, '', 'despesa');
    if (l.tipo === 'receita' && l.unidade && /aluguel/i.test(l.categoria)) futureGerarCobrancas_(l.competencia, T);
    return { ok: true, id: l.id };
  });
}
function futSalvarEnergia_(T, comp, unidade, valor, kwh, origem) {
  var e = T.en.linhas.filter(function (x) { return x.competencia === comp && x.unidade === unidade; })[0];
  if (e) atualizarLinha_(T.en, e, { valor: txtDinheiro_(valor), kwh: kwh || e.kwh, origem: origem || e.origem });
  else inserirLinha_(T.en, { id: novoId_('FE'), competencia: comp, unidade: unidade, valor: txtDinheiro_(valor), kwh: kwh || '', origem: origem || 'painel', criado_em: new Date().toISOString() });
}
function futureSalvarEnergia_(d, u) {
  return comTrava_(function () {
    var T = futTabs_(), un = futIdUnidade_(d.unidade);
    if (!un || !/^\d{4}-\d{2}$/.test(d.competencia || '')) throw falha_('Informe a unidade e o mês.');
    var valor = futN_(d.valor); if (!(valor >= 0)) throw falha_('Valor inválido.');
    futSalvarEnergia_(T, d.competencia, un, valor, String(d.kwh || '').slice(0, 12), 'painel');
    // a energia do mês entra na cobrança do mês seguinte (se ainda não paga)
    var c = T.co.linhas.filter(function (x) { return x.unidade === un && x.competencia === futCompMais_(d.competencia, 1) && !x.pago_em; })[0];
    if (c) atualizarLinha_(T.co, c, { energia: txtDinheiro_(valor), total: txtDinheiro_(futTotal_(Object.assign({}, c, { energia: valor }))) });
    return { ok: true };
  });
}

/** Relatório do mês: o que entrou, o que saiu, energia, ocupação e pendências, com o mês anterior para comparar. */
function futureRelatorio_(d) {
  var T = futTabs_(), hoje = hojeSP_(), comp = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : futComp_(hoje), ant = futCompMais_(comp, -1);
  var doMes = function (cp) { return T.la.linhas.filter(function (l) { return l.competencia === cp && l.tipo !== 'excluido'; }); };
  var soma = function (ls, tipo) { return ls.filter(function (l) { return l.tipo === tipo; }).reduce(function (a, l) { return a + futN_(l.valor); }, 0); };
  var porCat = function (ls, tipo) { var r = {}; ls.forEach(function (l) { if (l.tipo === tipo) r[l.categoria || 'Outros'] = (r[l.categoria || 'Outros'] || 0) + futN_(l.valor); });
    return Object.keys(r).map(function (k) { return { categoria: k, valor: r[k] }; }).sort(function (a, b) { return b.valor - a.valor; }); };
  var L = doMes(comp), LA = doMes(ant);
  var porUnidade = {}; L.forEach(function (l) { if (l.tipo === 'receita' && l.unidade) porUnidade[l.unidade] = (porUnidade[l.unidade] || 0) + futN_(l.valor); });
  var cob = T.co.linhas.filter(function (c) { return futRefDaCobranca_(c) === comp && c.situacao !== 'cancelada'; }).map(function (c) { return { unidade: c.unidade, pessoa: c.pessoa, total: futN_(c.total), pago: futN_(c.valor_pago), situacao: futSituacaoCobranca_(c, hoje), vencimento: c.vencimento, aluguel: futN_(c.aluguel), taxas: futN_(c.taxas), energia: futN_(c.energia), lavanderia: futN_(c.lavanderia), outros: futN_(c.outros), temporada: /^temp\|/.test(c.detalhe || '') }; })
    .sort(function (a, b) { return a.unidade < b.unidade ? -1 : 1; });
  var energia = T.en.linhas.filter(function (e) { return e.competencia === comp; }).map(function (e) { return { unidade: e.unidade, valor: futN_(e.valor), kwh: e.kwh }; }).sort(function (a, b) { return a.unidade < b.unidade ? -1 : 1; });
  var energiaAnt = T.en.linhas.filter(function (e) { return e.competencia === ant; }).reduce(function (a, e) { return a + futN_(e.valor); }, 0);
  var un = T.un.linhas; var oc = un.filter(function (x) { return /^(alugado|renovar)$/.test(x.situacao); }).length, alugaveis = un.filter(function (x) { return x.situacao !== 'proprio'; }).length;
  return { mes: comp, anterior: ant,
    receitas: soma(L, 'receita'), despesas: soma(L, 'despesa'), receitasAnt: soma(LA, 'receita'), despesasAnt: soma(LA, 'despesa'),
    receitasCat: porCat(L, 'receita'), despesasCat: porCat(L, 'despesa'),
    lancamentos: L.sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; }).map(function (l) { return { data: l.data, tipo: l.tipo, categoria: l.categoria, unidade: l.unidade, pessoa: l.pessoa, valor: futN_(l.valor), descricao: l.descricao, forma: l.forma }; }),
    porUnidade: Object.keys(porUnidade).sort().map(function (k) { return { unidade: k, valor: porUnidade[k] }; }),
    cobrancas: cob, energia: energia, energiaTotal: energia.reduce(function (a, e) { return a + e.valor; }, 0), energiaAnt: energiaAnt,
    energiaDespesa: L.filter(function (l) { return l.tipo === 'despesa' && l.categoria === 'Energia'; }).reduce(function (a, l) { return a + futN_(l.valor); }, 0),
    ocupacao: { ocupadas: oc, alugaveis: alugaveis, disponiveis: un.filter(function (x) { return x.situacao === 'disponivel'; }).map(function (x) { return x.id; }) },
    entraram: T.pe.linhas.filter(function (p) { return (p.entrada || '').slice(0, 7) === comp; }).map(function (p) { return { nome: p.nome, unidade: p.unidade, data: p.entrada }; }),
    lavagens: T.lv.linhas.filter(function (l) { return l.competencia === comp && l.situacao !== 'excluida'; }).map(function (l) { return { data: l.data, unidade: l.unidade, pessoa: l.pessoa, quantidade: +l.quantidade || 1, valor: futN_(l.valor) }; }),
    vencimentoCobranca: futCompMais_(comp, 1) + '-' + ('0' + (parseInt(config_('FUTURE_DIA_VENC'), 10) || 10)).slice(-2),
    sairam: T.pe.linhas.filter(function (p) { return (p.saida || '').slice(0, 7) === comp && p.situacao !== 'atual'; }).map(function (p) { return { nome: p.nome, unidade: p.unidade, data: p.saida }; }) };
}

function futureConfig_(d, u) {
  if (d.salvar) {
    var us = (d.usuarios || []).filter(function (x) { return usuarios_().some(function (y) { return y.usuario === x; }); });
    if (us.indexOf(u.usuario) < 0) us.push(u.usuario); // ninguém tira o próprio acesso sem querer
    setConfig_('FUTURE_USUARIOS', us.join(','), 'Quem vê o painel do Edifício Future');
    var dia = parseInt(d.dia_venc, 10); if (dia >= 1 && dia <= 28) setConfig_('FUTURE_DIA_VENC', String(dia), 'Dia de vencimento do aluguel no Edifício Future');
    if (d.pix !== undefined) setConfig_('FUTURE_PIX', String(d.pix).trim().slice(0, 120), 'Chave PIX para os aluguéis do Edifício Future');
    if (d.taxas_desc !== undefined) setConfig_('FUTURE_TAXAS_DESC', String(d.taxas_desc).trim().slice(0, 120) || 'IPTU, taxa de lixo e internet', 'O que entra nas taxas do Edifício Future');
    var txt = function (k, chave, desc, max) { if (d[k] !== undefined) setConfig_(chave, String(d[k]).replace(/\r/g, '').trim().slice(0, max || 600), desc); };
    txt('predio', 'FUTURE_NOME_MSG', 'Nome do prédio na mensagem de cobrança', 80);
    txt('pagamento', 'FUTURE_PAGAMENTO', 'Dados de pagamento na mensagem de cobrança do Edifício Future');
    txt('taxas_itens', 'FUTURE_TAXAS_ITENS', 'Taxas do apartamento, uma por linha (Nome: valor)');
    txt('pagadores', 'FUTURE_PAGADORES', 'Empresas que pagam apartamentos: Nome | telefone | contato');
    txt('fecho', 'FUTURE_FECHO', 'Última frase da mensagem de cobrança', 200);
    if (Array.isArray(d.contas)) futSalvarContas_(d.contas, d.conta_padrao);
    if (d.dinheiro !== undefined) setConfig_('FUTURE_DINHEIRO', d.dinheiro === 'nao' ? 'nao' : 'sim', 'Mensagem de cobrança avisa que aceita dinheiro');
    txt('dinheiro_txt', 'FUTURE_DINHEIRO_TXT', 'Frase do pagamento em dinheiro', 160);
    if (d.cotacao !== undefined && futN_(d.cotacao) > 0) setConfig_('FUTURE_COTACAO', String(futN_(d.cotacao)), 'Cotação do dólar usada na cobrança');
    if (d.taxas_sala !== undefined && futN_(d.taxas_sala) > 0) setConfig_('FUTURE_TAXAS_SALA', txtDinheiro_(futN_(d.taxas_sala)), 'Taxas das salas comerciais (sem energia)');
    registrar_(u.usuario, 'future: configuração', us.join(','));
  }
  return { usuarios: usuarios_().filter(function (x) { return x.ativo === 'sim'; }).map(function (x) { return { usuario: x.usuario, nome: x.nome, acesso: podeFuture_(x) }; }),
    dia_venc: parseInt(config_('FUTURE_DIA_VENC'), 10) || 10, importado: config_('FUTURE_IMPORTADO') || '',
    pix: config_('FUTURE_PIX') || '', taxas_desc: config_('FUTURE_TAXAS_DESC') || 'IPTU, taxa de lixo e internet',
    predio: futNomeCerto_(config_('FUTURE_NOME_MSG')) || 'Edifício Future', pagamento: config_('FUTURE_PAGAMENTO') || '',
    taxas_itens: config_('FUTURE_TAXAS_ITENS') || 'Taxa de lixo: 25,00\nInternet: 75,00\nIPTU: 40,00', pagadores: config_('FUTURE_PAGADORES') || '',
    cotacao: futN_(config_('FUTURE_COTACAO')) || 5.5, taxas_sala: futN_(config_('FUTURE_TAXAS_SALA')) || 107,
    fecho: config_('FUTURE_FECHO') || 'Após o pagamento, encaminhe o comprovante identificando o apartamento. Obrigada!',
    contas: futContas_(), conta_padrao: config_('FUTURE_CONTA_PADRAO') || '',
    dinheiro: config_('FUTURE_DINHEIRO') === 'nao' ? 'nao' : 'sim', dinheiro_txt: config_('FUTURE_DINHEIRO_TXT') || 'Se preferir, o pagamento também pode ser feito em dinheiro.' };
}

/* ---------- Importação da planilha "EDIFICIO FUTURE CONTROLE" ---------- */
function futFonte_() {
  var id = config_('FUTURE_FONTE_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* procura de novo */ } }
  var it = DriveApp.searchFiles("title contains 'EDIFICIO FUTURE CONTROLE' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  if (!it.hasNext()) throw falha_('Não achei a planilha "EDIFICIO FUTURE CONTROLE" no Drive.');
  var f = it.next(); setConfig_('FUTURE_FONTE_ID', f.getId(), 'Planilha antiga do Edifício Future (fonte da importação)');
  return SpreadsheetApp.openById(f.getId());
}
/** Ano de cada bloco "MÊS": começa no ano informado e vira o ano quando o mês volta (dezembro → janeiro). */
function futAnoSeq_(inicio) { var ano = inicio, ult = 0; return function (mes) { if (ult && mes < ult) ano++; ult = mes; return ano + '-' + ('0' + mes).slice(-2); }; }
function futMesDoTexto_(t) { var n = normalizar_(t).toUpperCase(); var k = Object.keys(FUT_MESES).filter(function (m) { return n.indexOf(m) >= 0; })[0]; return k ? FUT_MESES[k] : 0; }

function futureImportar_(d, u) {
  return comTrava_(function () {
    var ss = futFonte_(), T = futTabs_(), agora = new Date().toISOString(), r = { unidades: 0, pessoas: 0, receitas: 0, despesas: 0, energia: 0, lavanderia: 0 };
    var anoIni = parseInt(d.ano, 10) || 2026;
    var chaves = {}; T.la.linhas.forEach(function (l) { if (l.chave) chaves[l.chave] = 1; });
    var unPorId = {}; T.un.linhas.forEach(function (x) { unPorId[x.id] = x; });
    var pesKey = {}; T.pe.linhas.forEach(function (p) { pesKey[p.unidade + '|' + normalizar_(p.nome)] = p; });
    var addPessoa = function (unidade, nome, ent, sai, gar, cau, atual) {
      nome = futNome_(nome); if (!nome || /^x+$/i.test(nome) || /propri/i.test(nome)) return;
      var k = unidade + '|' + normalizar_(nome), p = pesKey[k];
      if (p) { if (atual && p.situacao !== 'atual') atualizarLinha_(T.pe, p, { situacao: 'atual' }); return; }
      p = { id: novoId_('FP'), nome: nome, telefone: '', cpf: '', unidade: unidade, entrada: ent || '', saida: sai || '', garantia: gar || '', caucao: cau ? txtDinheiro_(futN_(cau)) : '',
        situacao: atual ? 'atual' : 'saiu', obs: '', origem: 'planilha antiga', criado_em: agora };
      inserirLinha_(T.pe, p); pesKey[k] = p; r.pessoas++;
    };
    T.un.adiar = T.pe.adiar = T.la.adiar = T.en.adiar = false;
    // 1) Controle: unidades e locatários atuais
    var sh = ss.getSheets().filter(function (s) { return /CONTROLE/i.test(s.getName()); })[0];
    if (sh) {
      sh.getDataRange().getValues().slice(1).forEach(function (v, i) {
        var id = futIdUnidade_(v[1]); if (!id) return;
        var nome = futNome_(v[5]), sit = futSituacao_(v[4], nome), hc = /-\s*HC\s*$/i.test(String(v[5] || '').trim());
        var dados = { tipo: /^SALA/.test(id) ? 'sala' : 'apartamento', andar: /^SALA/.test(id) ? 'Salas' : (id.slice(3, 4) + 'º andar'), ordem: String(i + 1),
          aluguel: typeof v[2] === 'number' ? txtDinheiro_(v[2]) : '', taxas: typeof v[3] === 'number' ? txtDinheiro_(v[3]) : '', situacao: sit,
          locatario: sit === 'proprio' ? nome : (sit === 'disponivel' ? '' : nome), entrada: futData_(v[6]), saida: futData_(v[7]), garantia: String(v[8] || '').replace(/^x+$/i, '').trim(),
          caucao: typeof v[9] === 'number' ? txtDinheiro_(v[9]) : '', energia_resp: String(v[10] || '').trim(), kit: v[12] ? String(v[12]).replace(/\.0$/, '') : '',
          uc: v[13] ? String(typeof v[13] === 'number' ? v[13].toFixed(0) : v[13]) : '', medidor: v[14] ? String(typeof v[14] === 'number' ? v[14].toFixed(0) : v[14]) : '',
          uc_antiga: v[15] && v[15] !== '-' ? String(typeof v[15] === 'number' ? v[15].toFixed(0) : v[15]) : '', pagador: hc ? 'Hercílio Luz (HC)' : '' };
        var x = unPorId[id];
        if (!x) { x = Object.assign({ id: id, telefone: '', obs: '', atualizado_em: agora, atualizado_por: 'importação' }, dados); inserirLinha_(T.un, x); unPorId[id] = x; r.unidades++; }
        else if (d.substituir) atualizarLinha_(T.un, x, dados);
        if (sit !== 'proprio') addPessoa(id, nome, dados.entrada, dados.saida, dados.garantia, dados.caucao, sit !== 'disponivel');
      });
    }
    // 2) Abas "AP 101"…: locatários anteriores e energia (R$ CELESC) mês a mês
    ss.getSheets().forEach(function (s) {
      var id = futIdUnidade_(s.getName().replace(/^AP\s*/i, '')); if (!id || !/^AP/.test(id)) return;
      var vals = s.getDataRange().getValues(), seq = futAnoSeq_(anoIni), comp = '', cab = null;
      vals.forEach(function (v) {
        var a = String(v[0] || '');
        var mes = /REFERENTE/i.test(a) ? futMesDoTexto_(a) : 0;
        if (mes) { comp = seq(mes); return; }
        if (/IMOVEL/i.test(a)) { cab = v.map(function (c) { return normalizar_(String(c || '')).toUpperCase(); }); return; }
        if (!cab || !futIdUnidade_(v[0])) return;
        var col = function (re) { for (var j = 0; j < cab.length; j++) if (re.test(cab[j])) return j; return -1; };
        var iN = col(/LOCATARIO/), iE = col(/ENTRADA/), iS = col(/SAIDA/), iC = col(/R\$ CELESC|VALOR CELESC/), iG = col(/^CAUCAO$|CONTRATO/), iV = col(/VALOR DO CA/);
        if (iN >= 0) addPessoa(id, v[iN], futData_(v[iE]), futData_(v[iS]), iG >= 0 ? String(v[iG] || '') : '', iV >= 0 ? v[iV] : '', false);
        if (comp && iC >= 0 && typeof v[iC] === 'number' && v[iC] > 0 && !T.en.linhas.some(function (e) { return e.unidade === id && e.competencia === comp; })) {
          inserirLinha_(T.en, { id: novoId_('FE'), competencia: comp, unidade: id, valor: txtDinheiro_(v[iC]), kwh: '', origem: 'planilha antiga', criado_em: agora }); r.energia++;
        }
      });
    });
    // marca como "atual" quem está hoje na unidade
    T.un.linhas.forEach(function (x) { if (x.locatario && x.situacao !== 'proprio') addPessoa(x.id, x.locatario, x.entrada, x.saida, x.garantia, x.caucao, true); });
    // 3) Receita e 4) Despesas: blocos "DESCRIMINAÇÕES DE <MÊS>"
    var blocos = function (nomeAba, fn) {
      var s = ss.getSheets().filter(function (x) { return normalizar_(x.getName()).trim() === nomeAba; })[0]; if (!s) return;
      var seq = futAnoSeq_(anoIni), comp = '';
      s.getDataRange().getValues().forEach(function (v, i) {
        var a = String(v[0] || '');
        if (/DESCRIMINA|DISCRIMINA/i.test(a)) { var m = futMesDoTexto_(a); if (m) comp = seq(m); return; }
        if (!comp || /DATA DE/i.test(a)) return;
        fn(v, comp, nomeAba + ':' + (i + 1));
      });
    };
    blocos('receita', function (v, comp, k) {
      if (typeof v[4] !== 'number' || !(v[4] > 0) || chaves['imp:' + k]) return;
      inserirLinha_(T.la, { id: novoId_('FL'), data: futData_(v[0]) || comp + '-01', competencia: comp, tipo: 'receita', categoria: String(v[3] || '').trim() || 'Outros',
        unidade: futIdUnidade_(String(v[1] || '').replace(/^AP\s*/i, '')) || '', pessoa: futNome_(v[2]), valor: txtDinheiro_(v[4]), forma: String(v[6] || '').trim(),
        responsavel: String(v[7] || '').trim(), descricao: String(v[5] || '').trim().slice(0, 200), origem: 'planilha antiga', chave: 'imp:' + k, criado_em: agora, criado_por: u.usuario });
      r.receitas++;
    });
    blocos('despesas', function (v, comp, k) {
      if (typeof v[2] !== 'number' || !(v[2] > 0) || chaves['imp:' + k]) return;
      var desc = String(v[1] || '').trim(), obs = String(v[4] || '').trim();
      var l = { id: novoId_('FL'), data: futData_(v[0]) || comp + '-01', competencia: comp, tipo: 'despesa', categoria: futCategoriaDespesa_(desc, obs),
        unidade: futIdUnidade_(desc.replace(/^AP\s*/i, '')) || '', pessoa: '', valor: txtDinheiro_(v[2]), forma: String(v[3] || '').trim(), responsavel: '',
        descricao: [desc, obs].filter(function (x) { return x && x !== '.' && x !== '-'; }).join(' — ').slice(0, 200), origem: 'planilha antiga', chave: 'imp:' + k, criado_em: agora, criado_por: u.usuario };
      inserirLinha_(T.la, l); r.despesas++;
    });
    // 5) Lavanderia: um bloco de 5 colunas por mês
    var lav = ss.getSheets().filter(function (x) { return /lavanderia/i.test(x.getName()); })[0];
    if (lav) {
      var vals = lav.getDataRange().getValues();
      for (var c0 = 0; c0 < (vals[0] || []).length; c0 += 5) {
        var m = futMesDoTexto_(String(vals[0][c0] || '')); if (!m) continue;
        var comp = (anoIni + (m < 7 ? 1 : 0)) + '-' + ('0' + m).slice(-2);
        vals.slice(2).forEach(function (v, i) {
          var val = v[c0 + 3], k = 'imp:lav:' + c0 + ':' + (i + 3);
          if (typeof val !== 'number' || !(val > 0) || chaves[k]) return;
          inserirLinha_(T.la, { id: novoId_('FL'), data: futData_(v[c0 + 2]) || comp + '-01', competencia: comp, tipo: 'receita', categoria: 'Lavanderia',
            unidade: futIdUnidade_(v[c0 + 1]) || '', pessoa: futNome_(v[c0]), valor: txtDinheiro_(val), forma: '', responsavel: '', descricao: 'Lavanderia',
            origem: 'planilha antiga', chave: k, criado_em: agora, criado_por: u.usuario });
          r.lavanderia++;
        });
      }
    }
    if (!config_('FUTURE_COBRAR_DESDE')) { // o mês que já passou do vencimento fica com a planilha antiga; as cobranças começam no próximo
      var hj = hojeSP_(), diaV = parseInt(config_('FUTURE_DIA_VENC'), 10) || 10;
      setConfig_('FUTURE_COBRAR_DESDE', +hj.slice(8, 10) > diaV ? futCompMais_(futComp_(hj), 1) : futComp_(hj), 'Primeiro mês das cobranças do Edifício Future no painel');
    }
    try { var dr = futureSincronizarDrive_(true); if (dr) { r.pastas = dr.unidades; r.pessoas += dr.novas; } } catch (eD) { r.drive = String(eD.message || eD).slice(0, 120); }
    setConfig_('FUTURE_IMPORTADO', agora + ' ' + JSON.stringify(r), 'Importação da planilha antiga do Edifício Future');
    registrar_(u.usuario, 'future: importação', JSON.stringify(r));
    return r;
  });
}

/* ---------- Pastas do Drive (05. ED. FUTURE › APARTAMENTOS › AP 101 › <pessoa>; SALA COMERCIAL 2…) ---------- */
function futPastaRaiz_() {
  var id = config_('FUTURE_PASTA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* procura de novo */ } }
  var it = DriveApp.searchFolders("title contains 'ED. FUTURE'");
  if (!it.hasNext()) it = DriveApp.searchFolders("title contains 'FUTURE'");
  if (!it.hasNext()) return null;
  var f = it.next(); setConfig_('FUTURE_PASTA_ID', f.getId(), 'Pasta do Edifício Future no Drive');
  return f;
}
var futNorm_ = function (t) { return normalizar_(String(t || '')).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); };
/** Mesma pessoa? Igual, ou um nome começa com o outro (com pelo menos 2 palavras em comum). */
function futMesmaPessoa_(a, b) {
  a = futNorm_(a); b = futNorm_(b); if (!a || !b) return false; if (a === b) return true;
  var pa = a.split(' '), pb = b.split(' '), n = Math.min(pa.length, pb.length);
  if (n < 2) return pa[0] === pb[0] && (pa.length === 1 || pb.length === 1) && pa[0].length > 3;
  for (var i = 0; i < n; i++) if (pa[i] !== pb[i]) return false;
  return true;
}
function futureSincronizarDrive_(forcar) {
  var hoje = hojeSP_();
  if (!forcar && config_('FUTURE_DRIVE_DIA') === hoje) return null;
  var raiz = futPastaRaiz_(); if (!raiz) return null;
  var T = futTabs_(), agora = new Date().toISOString(), r = { unidades: 0, pessoas: 0, novas: 0 };
  var un = {}; T.un.linhas.forEach(function (x) { un[x.id] = x; });
  var tratarUnidade = function (pasta, id) {
    var x = un[id]; if (!x) return;
    if (x.pasta_url !== pasta.getUrl()) { atualizarLinha_(T.un, x, { pasta_url: pasta.getUrl() }); r.unidades++; }
    var subs = pasta.getFolders();
    while (subs.hasNext()) {
      var f = subs.next(), bruto = String(f.getName() || '').trim();
      if (!bruto || /^(contratos?|documentos?|fotos?|vistoria)$/i.test(bruto)) continue;
      var n = 0, contrato = '', distrato = null, fi = f.getFiles();
      while (fi.hasNext() && n < 99) {
        var arq = fi.next(), nArq = normalizar_(arq.getName ? arq.getName() : ''); n++;
        if (/distrato|rescis/i.test(nArq)) { var dt = arq.getDateCreated(); if (!distrato || dt > distrato.data) distrato = { data: dt, url: arq.getUrl() }; continue; }
        if (!contrato && /contrato|locac/i.test(nArq)) contrato = arq.getUrl ? arq.getUrl() : '';
      }
      if (/hercilio\s*luz/i.test(futNorm_(bruto))) { // a empresa que paga os apartamentos HC
        if (!x.pagador) atualizarLinha_(T.un, x, { pagador: 'Hercílio Luz (HC)' });
        continue;
      }
      var obs = (/(\d+)\s*dias?/i.exec(bruto) || [])[0] || '';
      var nome = futNome_(bruto.replace(/\s*\d+\s*dias?\s*$/i, '')).split(' ').map(function (w) { return /^(de|da|do|dos|das|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
      var p = T.pe.linhas.filter(function (q) { return q.unidade === id && futMesmaPessoa_(q.nome, nome); })[0]
        || T.pe.linhas.filter(function (q) { return futMesmaPessoa_(q.nome, nome) && futNorm_(nome).split(' ').length >= 2; })[0];
      if (p) {
        if (p.pasta_url !== f.getUrl() || String(p.arquivos) !== String(n) || (contrato && p.contrato_url !== contrato)) atualizarLinha_(T.pe, p, { pasta_url: f.getUrl(), arquivos: String(n), contrato_url: contrato || p.contrato_url || '' });
        // 8.11.2 (pedido do Luís): distrato feito à mão e salvo na pasta do morador ATUAL → o painel tira o locatário e deixa o apto disponível
        if (distrato && p.situacao === 'atual' && /^(alugado|renovar)$/.test(x.situacao || '') && futMesmaPessoa_(x.locatario, p.nome)) {
          var dDis = Utilities.formatDate(distrato.data, TZ, 'yyyy-MM-dd');
          if (!p.entrada || dDis >= p.entrada) { futLiberarPorDistrato_(T, x, p, dDis, distrato.url, agora); r.liberados = (r.liberados || 0) + 1; }
        }
      } else {
        inserirLinha_(T.pe, { id: novoId_('FP'), nome: nome, telefone: '', cpf: '', unidade: id, entrada: '', saida: '', garantia: '', caucao: '',
          situacao: futMesmaPessoa_(x.locatario, nome) ? 'atual' : 'saiu', obs: obs ? 'Estadia de ' + obs.toLowerCase() : '', origem: 'pasta do Drive',
          criado_em: Utilities.formatDate(f.getDateCreated(), TZ, "yyyy-MM-dd'T'HH:mm:ss"), pasta_url: f.getUrl(), arquivos: String(n), contrato_url: contrato });
        r.novas++;
      }
      r.pessoas++;
    }
  };
  var visitar = function (pasta, nivel) {
    var it = pasta.getFolders();
    while (it.hasNext()) {
      var f = it.next(), nome = String(f.getName() || '').toUpperCase();
      var m = /^AP\.?\s*(\d{3})$/.exec(nome.trim()), s2 = /SALA\D*0?(\d)\b/.exec(nome);
      if (m) tratarUnidade(f, 'AP ' + m[1]);
      else if (s2) tratarUnidade(f, 'SALA ' + s2[1]);
      else if (nivel < 1) visitar(f, nivel + 1); // ex.: a pasta APARTAMENTOS
    }
  };
  visitar(raiz, 0);
  setConfig_('FUTURE_DRIVE_DIA', hoje, 'Último dia em que o painel leu as pastas do Edifício Future no Drive');
  if (r.novas) registrar_('robô', 'future: pastas do Drive', JSON.stringify(r));
  return r;
}

/** 8.11.2: libera o apartamento quando o distrato foi feito fora do painel (arquivo "DISTRATO…" na pasta do morador). */
function futLiberarPorDistrato_(T, un, pessoa, data, url, agora) {
  var tc = tabela_('FutContratos');
  if (tc.linhas.some(function (c) { return c.unidade === un.id && c.tipo === 'distrato' && (c.pessoa_id === pessoa.id || futMesmaPessoa_(c.nome, pessoa.nome)); })) return;
  atualizarLinha_(T.un, un, { situacao: 'vago', locatario: '', telefone: '', saida: data, caucao: '', garantia: '', atualizado_em: agora, atualizado_por: 'robô (distrato no Drive)' });
  atualizarLinha_(T.pe, pessoa, { situacao: 'saiu', saida: data });
  tc.linhas.filter(function (c) { return c.unidade === un.id && c.situacao === 'gerado' && (c.tipo || 'mensal') === 'mensal'; }).forEach(function (c) { atualizarLinha_(tc, c, { situacao: 'encerrado' }); });
  inserirLinha_(tc, { id: novoId_('FK'), criado_em: agora, criado_por: 'robô (distrato no Drive)', unidade: un.id, pessoa_id: pessoa.id, nome: pessoa.nome, cpf: pessoa.cpf || '', telefone: pessoa.telefone || '',
    prazo_meses: '', inicio: pessoa.entrada || '', fim: data, aluguel: un.aluguel || '', garantia: '', caucao: '', doc_url: url, pdf_url: url, laudo_doc: '', laudo_pdf: '',
    pasta_url: pessoa.pasta_url || '', situacao: 'distrato', tipo: 'distrato', dias: '', valor_total: '' });
  registrar_('robô', 'future: distrato achado no Drive — apartamento liberado', un.id + ' ' + pessoa.nome + ' (' + dataBR_(data) + ')');
}

/** Robô (de hora em hora): cobranças do mês e, perto do fim do mês, as do mês seguinte. */
function futureRobo_() {
  if (!config_('FUTURE_IMPORTADO')) return 0;
  try { futCorrigirNomePredio_(); } catch (eN) { /* segue */ }
  try { futureImportarPasta_(); } catch (eI) { /* tenta na próxima hora */ }
  try { futureSincronizarDrive_(!config_('FUTURE_DISTRATO_812')); setConfig_('FUTURE_DISTRATO_812', hojeSP_(), 'Primeira leitura dos distratos no Drive (8.11.2)'); } catch (e) { /* tenta amanhã */ }
  try { futAtualizarModelos811_(); } catch (eM) { /* tenta na próxima hora */ } // modelos de contrato/laudo prontos antes do 1º contrato
  var hoje = hojeSP_(), n = futureGerarCobrancas_(futComp_(hoje));
  if (+hoje.slice(8, 10) >= 25) n += futureGerarCobrancas_(futCompMais_(futComp_(hoje), 1));
  return n;
}


/* ================================================================== */
/* 8.12 — Gestão: CRM (funil), propostas, transcrição, peças com IA,   */
/* padrões operacionais, recibos, painel financeiro e calculadoras     */
/* ================================================================== */

/* ---------- Pastas do Drive para o que o painel gera fora da pasta do cliente ---------- */
function pastaPainel_(chave, nome) {
  var id = config_(chave);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* apagada: cria de novo */ } }
  var mae;
  try { var it = pastaClientes_().getParents(); mae = it.hasNext() ? it.next() : DriveApp.getRootFolder(); } catch (e2) { mae = DriveApp.getRootFolder(); }
  var f = mae.createFolder(nome);
  setConfig_(chave, f.getId(), 'Pasta do Drive: ' + nome);
  return f;
}
function pastaDoClienteOu_(cliId, chave, nome) {
  if (cliId) {
    var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === cliId; })[0];
    if (c && c.pasta_id) { try { return DriveApp.getFolderById(c.pasta_id); } catch (e) { /* segue */ } }
  }
  return pastaPainel_(chave, nome);
}

/* ---------- Gemini para textos longos e áudio (o chamarGemini_ antigo corta em 12 mil caracteres) ---------- */
function geminiTexto_(parts, opc) {
  opc = opc || {};
  var chave = chaveIA_();
  if (!chave) throw falha_('A IA não está ligada. A administração cadastra a chave do Gemini em Usuários › Resumo por IA.');
  var principal = modeloIA_(), modelo = opc.modelo || principal;
  var corpo = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: opc.temp === undefined ? 0.2 : opc.temp, maxOutputTokens: opc.max || 8192 } };
  if (opc.sistema) corpo.systemInstruction = { parts: [{ text: opc.sistema }] };
  if (opc.json) corpo.generationConfig.responseMimeType = 'application/json';
  var pedir = function (m) {
    return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent',
      { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': chave }, payload: JSON.stringify(corpo) });
  };
  var resp = pedir(modelo);
  if ((resp.getResponseCode() === 404 || resp.getResponseCode() === 400) && /not found|not supported|no longer/i.test(resp.getContentText())) {
    if (modelo !== principal) { modelo = principal; resp = pedir(modelo); }
    else { var novo = modeloSugerido_(resp); if (novo) { modelo = novo; resp = pedir(modelo); } }
  }
  var ocupado = function (r) { var c = r.getResponseCode(); return c === 503 || c === 429 || c === 500; };
  for (var t = 1; t <= 3 && ocupado(resp); t++) { Utilities.sleep(3000 * t); resp = pedir(modelo); }
  if (ocupado(resp)) {
    var reserva = /lite/.test(modelo) ? modelo.replace(/-lite$/, '') : modelo + '-lite';
    var r2 = pedir(reserva); if (r2.getResponseCode() === 200) resp = r2;
  }
  var code = resp.getResponseCode(), j = {};
  try { j = JSON.parse(resp.getContentText()); } catch (e) { /* segue */ }
  if (code !== 200) {
    var msg = j.error && j.error.message ? String(j.error.message).slice(0, 180) : '';
    if (code === 429) throw falha_('O Google está limitando a IA agora (muitos pedidos). Tente de novo em alguns minutos.');
    if (code === 413 || /too large|exceeds/i.test(msg)) throw falha_('O material é grande demais para a IA de uma vez. Divida em partes.');
    throw falha_('A IA não respondeu agora (código ' + code + (msg ? ': ' + msg : '') + '). Tente de novo.');
  }
  var c0 = (j.candidates || [])[0] || {};
  if (!c0.content && c0.finishReason) throw falha_('A IA recusou o pedido (' + c0.finishReason + '). Reescreva o pedido ou tire trechos sensíveis.');
  var txt = ((c0.content || {}).parts || []).map(function (p) { return p.text || ''; }).join('');
  return { texto: String(txt).trim(), cortado: c0.finishReason === 'MAX_TOKENS', modelo: modelo };
}
function jsonDaIA_(txt) {
  var b = String(txt || '').replace(/^```(json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(b); } catch (e) { var m = b.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* segue */ } } }
  return null;
}

/** Regra do escritório para a IA (as palavras da Dra. Júlian: "a IA está aqui para nos auxiliar, nunca para nos substituir"). */
var IA_SISTEMA_JURIDICO = 'Você é um assistente jurídico de um escritório de advocacia brasileiro (Tubarão/SC). Você AUXILIA a advogada: ajuda a organizar, ' +
  'enxergar pontos e escrever melhor, mas a decisão e a revisão são sempre dela. Regras: 1) Nunca invente fatos, provas, nomes, datas, valores, artigos de lei, ' +
  'súmulas ou julgados. 2) Use SOMENTE o material fornecido; quando faltar informação, escreva "[NÃO CONSTA NO MATERIAL — conferir]". 3) Pode citar artigos de lei ' +
  'que tenha certeza (CPC, CLT, CC, CF, CDC, Lei 8.213/91 etc.), sempre com "[conferir]" ao lado; NÃO cite números de processos/julgados. 4) Prazos processuais: ' +
  'nunca afirme datas fatais; diga "conferir no sistema do tribunal". 5) Nomes foram trocados por [PARTE] e dados pessoais por marcas; mantenha as marcas. ' +
  '6) Escreva em português do Brasil, linguagem técnica e clara, organizada em Markdown (## títulos, listas com "-", tabelas com "|" quando pedido). ' +
  '7) Sem promessas de resultado. 8) Termine com a seção "## Pontos para a advogada conferir".';

/* ---------- Documento Google com o padrão visual do escritório a partir de Markdown ---------- */
function docMarkdown_(titulo, md, pasta, subtitulo) {
  var doc = DocumentApp.create(String(titulo).slice(0, 180));
  montarPadraoVisual_(doc, [['t', String(titulo).toUpperCase()]].concat(subtitulo ? [['c', subtitulo]] : []));
  var corpo = doc.getBody(), A = DocumentApp.HorizontalAlignment;
  var fonte = function (el, tam) { var t = el.editAsText(); if (t.getText().length) t.setFontFamily('EB Garamond').setFontSize(tam || 12); return el; };
  var negrito = function (el, txt) {
    var t = trechosNegrito_(String(txt).replace(/__([^_]+)__/g, '**$1**'));
    el.setText(t.texto); var ed = el.editAsText();
    t.negritos.forEach(function (r) { if (r[1] >= r[0]) ed.setBold(r[0], r[1], true); });
    return el;
  };
  var linhas = String(md || '').replace(/\r/g, '').split('\n'), i = 0;
  while (i < linhas.length) {
    var l = linhas[i], s = l.trim();
    if (!s) { i++; continue; }
    if (/^\|/.test(s)) { // tabela
      var rows = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) {
        var cel = linhas[i].trim().replace(/^\||\|$/g, '').split('|').map(function (x) { return x.trim().replace(/\*\*/g, ''); });
        if (!cel.every(function (x) { return /^:?-{2,}:?$/.test(x) || !x; })) rows.push(cel);
        i++;
      }
      if (rows.length) {
        var n = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        rows = rows.map(function (r) { while (r.length < n) r.push(''); return r; });
        var tab = corpo.appendTable(rows);
        tab.setBorderColor('#B58D52');
        for (var a = 0; a < tab.getNumRows(); a++) {
          var row = tab.getRow(a);
          for (var b = 0; b < row.getNumCells(); b++) {
            var cell = row.getCell(b); cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(4).setPaddingRight(4);
            cell.editAsText().setFontFamily('EB Garamond').setFontSize(10);
            if (a === 0) { cell.setBackgroundColor('#F3EDE2'); cell.editAsText().setBold(true); }
          }
        }
        corpo.appendParagraph('');
      }
      continue;
    }
    var m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(s))) {
      var p = corpo.appendParagraph('');
      negrito(p, '**' + m[2].replace(/\*\*/g, '') + '**');
      p.setAlignment(A.LEFT).setSpacingBefore(m[1].length <= 2 ? 12 : 8).setSpacingAfter(4).setLineSpacing(1.15);
      fonte(p, m[1].length <= 2 ? 13 : 12);
      if (m[1].length <= 2) p.editAsText().setForegroundColor('#3A2F22');
    } else if ((m = /^[-*•]\s+(.*)$/.exec(s))) {
      var li = corpo.appendListItem(''); negrito(li, m[1]);
      li.setGlyphType(DocumentApp.GlyphType.BULLET).setSpacingAfter(3).setLineSpacing(1.15); fonte(li, 12);
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(s))) {
      var ln = corpo.appendListItem(''); negrito(ln, m[1]);
      ln.setGlyphType(DocumentApp.GlyphType.NUMBER).setSpacingAfter(3).setLineSpacing(1.15); fonte(ln, 12);
    } else if ((m = /^>\s?(.*)$/.exec(s))) {
      var q = corpo.appendParagraph(''); negrito(q, m[1]);
      q.setIndentStart(36).setAlignment(A.JUSTIFY).setSpacingAfter(6); fonte(q, 11); q.editAsText().setItalic(true);
    } else if (/^---+$/.test(s)) {
      corpo.appendHorizontalRule();
    } else {
      var pp = corpo.appendParagraph(''); negrito(pp, s);
      pp.setAlignment(A.JUSTIFY).setSpacingAfter(8).setLineSpacing(1.5); fonte(pp, 12);
    }
    i++;
  }
  doc.saveAndClose();
  var arq = DriveApp.getFileById(doc.getId());
  if (pasta) arq.moveTo(pasta);
  return { id: doc.getId(), url: doc.getUrl() };
}
function pdfDoDoc_(docId, pasta) {
  var pdf = DriveApp.getFileById(docId).getAs('application/pdf');
  var f = (pasta || DriveApp.getRootFolder()).createFile(pdf);
  return f.getUrl();
}

/* ================================================================== */
/* CRM / Funil de atendimento                                          */
/* ================================================================== */
// 8.14 (pedido da usuária): as etapas seguem o caminho do escritório — contato → conversa → cadastro enviado → cadastro preenchido (vira
// cliente) → em atendimento → procuração e contrato enviados → contrato assinado. "consulta" e "negociação" saíram (migração em crmSincronizar_).
var ETAPAS_CRM = [['novo', 'Novo contato'], ['contato', 'Em conversa'], ['cadastro', 'Cadastro enviado'], ['cliente', 'Cadastro preenchido'],
  ['atendido', 'Consulta feita'], ['proposta', 'Procuração e contrato enviados'], ['ganho', 'Contrato assinado'], ['perdido', 'Não fechou']];

/** 8.15 (pedido da usuária: "qualifique todos os clientes"): em que ponto CADA cliente está, inclusive os antigos. Calculado na hora
 *  com o funil, a assinatura e os processos, então muda sozinho em tudo: assinou → "Em atendimento". */
var JORNADA = { contato: 'Em conversa', cadastro: 'Cadastro enviado', cliente: 'Cadastro preenchido', atendido: 'Consulta feita',
  proposta: 'Procuração e contrato enviados', inicial: 'Em atendimento · petição inicial', andamento: 'Em atendimento · processo em andamento',
  encerrado: 'Caso encerrado', perdido: 'Não fechou', sem: 'Sem caso aberto' };
function jornadasClientes_() {
  var procs = {}, ass = {}, leads = {}, r = {};
  tabela_('Processos').linhas.forEach(function (p) {
    if (!p.cliente_id) return;
    var f = faseDe_(p), x = procs[p.cliente_id] = procs[p.cliente_id] || { and: 0, ini: 0, fim: 0 };
    if (p.status === 'arquivado' || f === 'extinto') x.fim++; else if (f === 'contratado' || !p.numero) x.ini++; else x.and++;
  });
  try { tabela_('Assinaturas').linhas.forEach(function (a) { if (a.cliente_id) ass[a.cliente_id] = a; }); } catch (e) { /* aba nova */ }
  try { tabela_('Leads').linhas.forEach(function (l) { if (l.cliente_id) leads[l.cliente_id] = l; }); } catch (e) { /* aba nova */ }
  tabela_('Clientes').linhas.forEach(function (c) {
    var p = procs[c.id] || {}, a = ass[c.id], l = leads[c.id], e;
    if (p.and) e = 'andamento';
    else if (p.ini) e = 'inicial';
    else if (a && a.situacao === 'aguardando') e = 'proposta';
    else if ((a && a.situacao === 'assinado') || (l && l.etapa === 'ganho')) e = 'inicial';
    else if (l && ['novo', 'contato', 'cadastro', 'cliente', 'atendido', 'proposta'].indexOf(l.etapa) >= 0) e = l.etapa === 'novo' ? 'contato' : l.etapa;
    else if (p.fim) e = 'encerrado';
    else if ((a && a.situacao === 'desistiu') || (l && l.etapa === 'perdido')) e = 'perdido';
    else e = 'sem';
    r[c.id] = e;
  });
  return r;
}
var ORDEM_CRM = { novo: 1, contato: 2, cadastro: 3, cliente: 4, atendido: 5, proposta: 6, ganho: 7, perdido: 7 };
/** Só anda para a frente (e nunca mexe em quem já fechou ou desistiu). */
function etapaAFrente_(atual, nova) {
  if (atual === 'ganho' || atual === 'perdido') return atual;
  return (ORDEM_CRM[nova] || 0) > (ORDEM_CRM[atual] || 0) ? nova : atual;
}
var CANAIS_CRM = ['Site (formulário)', 'WhatsApp', 'Telefone', 'Indicação', 'Google Ads (anúncio)', 'Google (pesquisa ou mapa)', 'Instagram / Facebook', 'Presencial', 'Já era cliente', 'Outro'];
var MOTIVOS_PERDA = ['Preço / honorários', 'Escolheu outro escritório', 'Não tinha direito / caso inviável', 'Desistiu / sem interesse', 'Não respondeu', 'Fora da área ou da região', 'Outro'];
var CAMPOS_LEAD = ['nome', 'telefone', 'email', 'area', 'assunto', 'canal', 'valor_estimado', 'responsavel', 'proxima_acao', 'proxima_data', 'temperatura', 'consulta_em', 'indicado_por', 'observacoes'];

function etapaCrmOk_(e) { return ETAPAS_CRM.some(function (x) { return x[0] === e; }); }
function canalDoContato_(o) { return { ads: 'Google Ads (anúncio)', organico: 'Google (pesquisa ou mapa)', google: 'Google (pesquisa ou mapa)', social: 'Instagram / Facebook' }[o] || 'Site (formulário)'; }
function linhaHist_(u, txt) { return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + ' · ' + (u ? (u.nome || u.usuario) : 'sistema') + ': ' + txt; }

/** Contatos do site que ainda não viraram lead e leads cujo contrato foi assinado (ou desistido) no painel. Só grava se mudou. */
function crmSincronizar_() {
  if (!config_('CRM_ETAPAS_814')) comTrava_(function () {
    var tm = tabela_('Leads'); tm.adiar = true;
    tm.linhas.forEach(function (l) { var n = { consulta: 'contato', negociacao: 'proposta' }[l.etapa]; if (n) atualizarLinha_(tm, l, { etapa: n }); });
    regravarMudadas_(tm); setConfig_('CRM_ETAPAS_814', new Date().toISOString(), 'Etapas antigas do funil (consulta, negociação) passadas para as novas');
  });
  var tabL = tabela_('Leads'), porContato = {}, mud = false;
  tabL.linhas.forEach(function (l) { if (l.contato_id) porContato[l.contato_id] = l; });
  var desde = new Date(Date.now() - 120 * 86400000).toISOString(), agora = new Date().toISOString();
  var novos = tabela_('Contatos').linhas.filter(function (c) { return c.nome && c.criado_em >= desde && !porContato[c.id]; });
  var assin = {};
  tabela_('Assinaturas').linhas.forEach(function (a) { if (a.cliente_id) assin[a.cliente_id] = a; });
  var fechar = tabL.linhas.filter(function (l) {
    var a = l.cliente_id && assin[l.cliente_id];
    return a && ['ganho', 'perdido'].indexOf(l.etapa) < 0 && (a.situacao === 'assinado' || a.situacao === 'desistiu' || (a.situacao === 'aguardando' && etapaAFrente_(l.etapa, 'proposta') !== l.etapa));
  });
  // 8.12.1 (pedido da usuária): todo cliente NOVO cadastrado pelo painel entra no funil (os importados do GEA, do histórico e da revisão, não)
  var dig8 = function (t) { var x = String(t || '').replace(/\D/g, ''); return x.length >= 8 ? x.slice(-8) : ''; };
  var porCli = {}, porTel = {};
  tabL.linhas.forEach(function (l) { if (l.cliente_id) porCli[l.cliente_id] = l; var k = dig8(l.telefone); if (k && !l.cliente_id) porTel[k] = l; });
  var desdeCli = config_('CRM_CLIENTES_DESDE');
  if (!desdeCli) { desdeCli = new Date(Date.now() - 60 * 86400000).toISOString(); setConfig_('CRM_CLIENTES_DESDE', desdeCli, 'Clientes cadastrados pelo painel a partir desta data entram sozinhos no CRM / Funil'); }
  var importado = /hist|GEA|carga|levantamento|planilha|importa|processo|revis|organizar|rob[oô]|funil|djen|gmail/i;
  var clientesNovos = tabela_('Clientes').linhas.filter(function (c) {
    return c.nome && c.criado_em >= desdeCli && !porCli[c.id] && !importado.test(c.origem || '') && !/importa/i.test(c.atualizado_por || '') && c.situacao !== 'importado — conferir';
  });
  if (!novos.length && !fechar.length && !clientesNovos.length) return 0;
  comTrava_(function () {
    var t = tabela_('Leads');
    novos.forEach(function (c) {
      var nl = { id: novoId_('L'), criado_em: c.criado_em || agora, nome: c.nome, telefone: c.telefone, email: '', area: areaMkt_(c.assunto + ' ' + c.pagina) === 'Geral' ? '' : areaMkt_(c.assunto + ' ' + c.pagina),
        assunto: c.assunto, canal: canalDoContato_(c.origem), etapa: c.situacao && c.situacao !== 'novo' ? 'contato' : 'novo', valor_estimado: '', responsavel: config_('RESP_SITE') || '',
        proxima_acao: 'Ligar / chamar no WhatsApp (pediu retorno pelo site · ' + (c.horario || 'qualquer horário') + ')', proxima_data: String(c.criado_em || agora).slice(0, 10),
        temperatura: 'morno', contato_id: c.id, historico: linhaHist_(null, 'pedido de retorno pelo site (' + (c.pagina || '') + ')'), criado_por: 'site', atualizado_em: agora, atualizado_por: 'site' };
      inserirLinha_(t, nl);
      var kn = dig8(nl.telefone); if (kn && !porTel[kn]) porTel[kn] = nl; // o cliente cadastrado com o mesmo telefone liga a este cartão
    });
    var mapaCanal = { 'Site': 'Site (formulário)' };
    clientesNovos.forEach(function (c) {
      var k = dig8(c.telefone), l = k && porTel[k];
      if (l) { // o contato já estava no funil (ex.: veio pelo site): só liga ao cadastro
        atualizarLinha_(t, l, { cliente_id: c.id, etapa: etapaAFrente_(l.etapa, 'cliente'), primeiro_contato_em: l.primeiro_contato_em || agora, historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(null, 'cadastro de cliente criado no painel'), atualizado_em: agora, atualizado_por: 'robô' });
        delete porTel[k]; return;
      }
      var a = assin[c.id], etapa = a && a.situacao === 'assinado' ? 'ganho' : a && a.situacao === 'desistiu' ? 'perdido' : a ? 'proposta' : 'cliente';
      inserirLinha_(t, { id: novoId_('L'), criado_em: c.criado_em || agora, nome: c.nome, telefone: c.telefone || '', email: c.email || '', area: c.area || areaMkt_(c.tipo_acao || '').replace('Geral', ''),
        assunto: String(c.tipo_acao || c.resumo_caso || '').slice(0, 200), canal: mapaCanal[c.como_conheceu] || c.como_conheceu || '', etapa: etapa, valor_estimado: '',
        responsavel: c.atualizado_por || '', proxima_acao: etapa === 'cliente' ? 'Marcar o atendimento' : '', proxima_data: etapa === 'cliente' ? somarDias_(hojeSP_(), 2) : '',
        temperatura: 'morno', cliente_id: c.id, ganho_em: etapa === 'ganho' ? (a.assinado_em || agora) : '', perdido_em: etapa === 'perdido' ? agora : '', motivo_perda: etapa === 'perdido' ? 'Desistiu / sem interesse' : '',
        historico: linhaHist_(null, 'entrou no funil pelo cadastro de cliente no painel'), criado_por: 'painel', atualizado_em: agora, atualizado_por: 'robô' });
    });
    t.linhas.forEach(function (l) {
      var a = l.cliente_id && assin[l.cliente_id];
      if (!a || ['ganho', 'perdido'].indexOf(l.etapa) >= 0) return;
      if (a.situacao === 'aguardando') { if (etapaAFrente_(l.etapa, 'proposta') !== l.etapa) atualizarLinha_(t, l, { etapa: 'proposta', historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(null, 'contrato e procuração gerados: aguardando assinatura'), atualizado_em: agora, atualizado_por: 'robô' }); return; }
      if (a.situacao === 'assinado') atualizarLinha_(t, l, { etapa: 'ganho', ganho_em: a.assinado_em || agora, historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(null, 'contrato assinado (Clientes › Aguardando assinatura)'), atualizado_em: agora, atualizado_por: 'robô' });
      else if (a.situacao === 'desistiu') atualizarLinha_(t, l, { etapa: 'perdido', perdido_em: agora, motivo_perda: 'Desistiu / sem interesse', historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(null, 'marcado "Não vai assinar"'), atualizado_em: agora, atualizado_por: 'robô' });
    });
  });
  return novos.length + fechar.length + clientesNovos.length;
}

function crmListar_(d, u) {
  try { crmSincronizar_(); } catch (e) { /* a lista abre mesmo assim */ }
  var hoje = hojeSP_(), agora = Date.now();
  var leads = tabela_('Leads').linhas.map(function (l) {
    var o = limpar_(l);
    o.dias_parado = Math.floor((agora - Date.parse(l.atualizado_em || l.criado_em || new Date().toISOString())) / 86400000);
    o.atrasado = !!(l.proxima_data && l.proxima_data < hoje && ['ganho', 'perdido'].indexOf(l.etapa) < 0);
    return o;
  }).sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; });
  var dentro = function (iso, dias) { return iso && agora - Date.parse(iso) <= dias * 86400000; };
  var abertos = leads.filter(function (l) { return ['ganho', 'perdido'].indexOf(l.etapa) < 0; });
  var porEtapa = {}; ETAPAS_CRM.forEach(function (e) { porEtapa[e[0]] = { n: 0, valor: 0 }; });
  leads.forEach(function (l) { var p = porEtapa[l.etapa] || porEtapa.novo; p.n++; p.valor += dinheiro_(l.valor_estimado); });
  var recentes = leads.filter(function (l) { return dentro(l.criado_em, 180); });
  var fechados = recentes.filter(function (l) { return l.etapa === 'ganho' || l.etapa === 'perdido'; });
  var ganhos = recentes.filter(function (l) { return l.etapa === 'ganho'; });
  var porCanal = {};
  recentes.forEach(function (l) { var k = l.canal || 'Não informado'; var c = porCanal[k] = porCanal[k] || { canal: k, leads: 0, ganhos: 0, perdidos: 0 }; c.leads++; if (l.etapa === 'ganho') c.ganhos++; if (l.etapa === 'perdido') c.perdidos++; });
  var motivos = {};
  recentes.forEach(function (l) { if (l.etapa === 'perdido') motivos[l.motivo_perda || 'Não informado'] = (motivos[l.motivo_perda || 'Não informado'] || 0) + 1; });
  var tempos = ganhos.filter(function (l) { return l.ganho_em; }).map(function (l) { return (Date.parse(l.ganho_em) - Date.parse(l.criado_em)) / 86400000; });
  var resp = recentes.filter(function (l) { return l.primeiro_contato_em; }).map(function (l) { return (Date.parse(l.primeiro_contato_em) - Date.parse(l.criado_em)) / 3600000; }).sort(function (a, b) { return a - b; });
  var mes = hoje.slice(0, 7);
  return {
    etapas: ETAPAS_CRM, canais: CANAIS_CRM, motivos: MOTIVOS_PERDA, areas: AREAS_MKT, leads: leads,
    metricas: {
      abertos: abertos.length, valorAberto: Math.round(abertos.reduce(function (t, l) { return t + dinheiro_(l.valor_estimado); }, 0) * 100) / 100,
      novosMes: leads.filter(function (l) { return String(l.criado_em).slice(0, 7) === mes; }).length,
      ganhosMes: leads.filter(function (l) { return l.etapa === 'ganho' && String(l.ganho_em).slice(0, 7) === mes; }).length,
      conversao: fechados.length ? Math.round(ganhos.length / fechados.length * 100) : null,
      diasParaFechar: tempos.length ? Math.round(tempos.reduce(function (a, b) { return a + b; }, 0) / tempos.length) : null,
      respostaHoras: resp.length ? Math.round(resp[Math.floor(resp.length / 2)] * 10) / 10 : null,
      atrasados: abertos.filter(function (l) { return l.atrasado; }).length,
      parados: abertos.filter(function (l) { return l.dias_parado >= 7; }).length,
      porEtapa: porEtapa,
      porCanal: Object.keys(porCanal).map(function (k) { var c = porCanal[k]; c.taxa = c.ganhos + c.perdidos ? Math.round(c.ganhos / (c.ganhos + c.perdidos) * 100) : null; return c; }).sort(function (a, b) { return b.leads - a.leads; }),
      motivos: Object.keys(motivos).map(function (k) { return { motivo: k, n: motivos[k] }; }).sort(function (a, b) { return b.n - a.n; })
    }
  };
}

function crmSalvar_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Leads'), x = d.lead || {}, agora = new Date().toISOString(), dados = {};
    CAMPOS_LEAD.forEach(function (k) { if (x[k] !== undefined) dados[k] = String(x[k] || '').trim().slice(0, k === 'observacoes' ? 20000 : 300); });
    if (dados.telefone) dados.telefone = dados.telefone.replace(/[^\d()+\s\-\/]/g, '');
    if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) throw falha_('E-mail inválido.');
    if (dados.valor_estimado) dados.valor_estimado = txtDinheiro_(dinheiro_(dados.valor_estimado));
    dados.atualizado_em = agora; dados.atualizado_por = u.usuario;
    if (x.id) {
      var l = t.linhas.filter(function (r) { return r.id === x.id; })[0];
      if (!l) throw falha_('Contato não encontrado.');
      atualizarLinha_(t, l, dados);
      registrar_(u.usuario, 'crm: contato alterado', l.id + ' ' + (dados.nome || l.nome));
      return { id: l.id };
    }
    if (!dados.nome) throw falha_('Informe o nome.');
    if (!dados.telefone && !dados.email) throw falha_('Informe o telefone ou o e-mail.');
    var dig = String(dados.telefone || '').replace(/\D/g, '').slice(-8);
    var rep = dig.length === 8 && t.linhas.filter(function (r) { return String(r.telefone || '').replace(/\D/g, '').slice(-8) === dig && ['ganho', 'perdido'].indexOf(r.etapa) < 0; })[0];
    if (rep && !d.mesmoAssim) throw falha_('Já existe um contato em aberto com esse telefone: ' + rep.nome + '. Abra o cartão dele no funil.');
    var etapa = etapaCrmOk_(x.etapa) ? x.etapa : 'novo';
    var novo = Object.assign({ id: novoId_('L'), criado_em: agora, etapa: etapa, criado_por: u.usuario, temperatura: dados.temperatura || 'morno',
      historico: linhaHist_(u, 'contato cadastrado' + (dados.canal ? ' (' + dados.canal + ')' : '')) }, dados);
    if (etapa !== 'novo') novo.primeiro_contato_em = agora;
    if (!novo.responsavel) novo.responsavel = u.usuario;
    inserirLinha_(t, novo);
    registrar_(u.usuario, 'crm: contato novo', novo.id + ' ' + novo.nome);
    return { id: novo.id };
  });
}

function crmEtapa_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Leads'), l = t.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!l) throw falha_('Contato não encontrado.');
    if (!etapaCrmOk_(d.etapa)) throw falha_('Etapa inválida.');
    if (d.etapa === 'perdido' && !d.motivo) throw falha_('Diga o motivo de não ter fechado (é o que mostra onde melhorar).');
    var agora = new Date().toISOString(), nomeE = {};
    ETAPAS_CRM.forEach(function (e) { nomeE[e[0]] = e[1]; });
    var m = { etapa: d.etapa, atualizado_em: agora, atualizado_por: u.usuario,
      historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(u, (nomeE[l.etapa] || l.etapa) + ' → ' + nomeE[d.etapa] + (d.motivo ? ' (' + d.motivo + ')' : '') + (d.nota ? ' · ' + String(d.nota).slice(0, 300) : '')) };
    if (l.etapa === 'novo' && d.etapa !== 'novo' && !l.primeiro_contato_em) m.primeiro_contato_em = agora;
    if (d.etapa === 'ganho') m.ganho_em = agora;
    if (d.etapa === 'perdido') { m.perdido_em = agora; m.motivo_perda = String(d.motivo).slice(0, 80); }
    if (d.etapa !== 'perdido' && l.etapa === 'perdido') { m.perdido_em = ''; m.motivo_perda = ''; }
    if (d.consulta_em) m.consulta_em = String(d.consulta_em).slice(0, 16);
    atualizarLinha_(t, l, m);
    registrar_(u.usuario, 'crm: etapa', l.id + ' ' + l.nome + ' → ' + d.etapa);
    return { ok: true };
  });
}

function crmAnotar_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Leads'), l = t.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!l) throw falha_('Contato não encontrado.');
    var txt = String(d.texto || '').trim(); if (!txt) throw falha_('Escreva a anotação.');
    var m = { historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(u, txt.slice(0, 2000)), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario };
    if (l.etapa === 'novo' && d.contato && !l.primeiro_contato_em) { m.primeiro_contato_em = m.atualizado_em; m.etapa = 'contato'; }
    if (d.proxima_acao !== undefined) m.proxima_acao = String(d.proxima_acao).slice(0, 300);
    if (d.proxima_data !== undefined) m.proxima_data = String(d.proxima_data).slice(0, 10);
    atualizarLinha_(t, l, m);
    return { ok: true };
  });
}

/** "Virou cliente": cria o cadastro (só com o que o funil tem; a ficha mostra o que falta) e liga ao contato. */
function crmConverter_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Leads'), l = t.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!l) throw falha_('Contato não encontrado.');
    if (l.cliente_id) return { cliente_id: l.cliente_id, existente: true };
    var tc = tabela_('Clientes'), dig = String(l.telefone || '').replace(/\D/g, '').slice(-8);
    var ja = tc.linhas.filter(function (c) { return (dig.length === 8 && String(c.telefone || '').replace(/\D/g, '').indexOf(dig) >= 0) || normalizar_(c.nome) === normalizar_(l.nome); })[0];
    var agora = new Date().toISOString(), cid;
    if (ja && !d.novo) cid = ja.id;
    else {
      cid = novoId_('C');
      inserirLinha_(tc, { id: cid, tipo: 'PF', nome: nomeProprio_(l.nome), telefone: l.telefone, email: l.email, area: l.area, origem: 'funil (CRM)', situacao: 'completo',
        observacoes: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + ' — ' + (u.nome || u.usuario) + ': veio do funil (' + (l.canal || 'canal não informado') + '). ' + (l.assunto || ''),
        como_conheceu: CANAIS_CONHECEU.indexOf(l.canal) >= 0 ? l.canal : (/Site/.test(l.canal) ? 'Site' : /Indica/.test(l.canal) ? 'Indicação' : 'Outro'),
        criado_em: agora, atualizado_em: agora, atualizado_por: u.usuario });
    }
    atualizarLinha_(t, l, { cliente_id: cid, historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(u, ja && !d.novo ? 'ligado ao cadastro já existente de ' + ja.nome : 'cadastro de cliente criado'), atualizado_em: agora, atualizado_por: u.usuario });
    registrar_(u.usuario, 'crm: virou cliente', l.id + ' → ' + cid);
    return { cliente_id: cid, existente: !!(ja && !d.novo), nome_existente: ja && !d.novo ? ja.nome : '' };
  });
}

/* ---------- Proposta de honorários (Google Docs + PDF no padrão do escritório) ---------- */
var INCLUI_AREA = {
  'Trabalhista': ['Análise dos documentos e do contrato de trabalho, com cálculo estimado dos direitos', 'Petição inicial (ou defesa) e todas as manifestações em primeiro grau', 'Audiências de conciliação e de instrução', 'Recurso Ordinário ao TRT, se necessário', 'Cálculos e execução até o levantamento dos valores (alvará)'],
  'Previdenciário': ['Análise do CNIS, carteira de trabalho e documentos médicos', 'Pedido administrativo no INSS e acompanhamento', 'Ação judicial na Justiça Federal, se o INSS negar', 'Perícias e audiências', 'Acompanhamento até a implantação do benefício e o pagamento dos atrasados'],
  'Família': ['Orientação sobre direitos e caminhos possíveis (acordo ou ação)', 'Petição inicial ou defesa e manifestações em primeiro grau', 'Audiências de conciliação/mediação e de instrução', 'Acompanhamento até a sentença ou homologação do acordo'],
  'Cível': ['Análise de contratos, provas e documentos', 'Notificação extrajudicial, quando for o caso', 'Petição inicial ou defesa e manifestações em primeiro grau', 'Audiências e acompanhamento até a sentença'],
  'Criminal': ['Análise do inquérito ou do processo', 'Defesa técnica em primeiro grau (resposta à acusação, audiências, alegações finais)', 'Pedidos de liberdade, quando cabíveis', 'Acompanhamento até a sentença'],
  'Empresarial': ['Análise da demanda e dos documentos da empresa', 'Pareceres e orientações por escrito', 'Elaboração e revisão de contratos', 'Atuação em processos judiciais e administrativos conforme o escopo combinado']
};
function textoHonorariosProposta_(h) {
  h = h || {};
  var v = dinheiro_(h.valor), n = parseInt(h.parcelas, 10) || 1, pct = String(h.percentual || '').replace(',', '.'), ent = dinheiro_(h.entrada), men = dinheiro_(h.mensal);
  var linhas = [];
  if (h.forma === 'exito' || h.forma === 'misto') linhas.push('**' + pct + '%** (' + pct + ' por cento) sobre o proveito econômico obtido pelo(a) cliente (valores recebidos por acordo ou condenação), pagos somente quando houver recebimento.');
  if (h.forma === 'fixo' || h.forma === 'misto') {
    if (v) linhas.push('**' + valorComExtenso_(v) + '**' + (n > 1 ? (ent ? ', sendo entrada de ' + valorComExtenso_(ent) + ' e o saldo em ' + (n - 1) + ' parcela(s) mensais de ' + valorComExtenso_((v - ent) / Math.max(1, n - 1)) : ', em ' + n + ' parcelas mensais de ' + valorComExtenso_(v / n)) : ', à vista') + '.');
  }
  if (h.forma === 'mensal' && men) linhas.push('**' + valorComExtenso_(men) + ' por mês**, com vencimento todo dia ' + (h.dia || '10') + ', pelo prazo combinado no contrato.');
  if (!linhas.length) linhas.push('[COMPLETAR: forma e valor dos honorários]');
  return linhas;
}
function gerarProposta_(d, u) {
  var l = d.lead_id ? tabela_('Leads').linhas.filter(function (r) { return r.id === d.lead_id; })[0] : null;
  var nome = String((l && l.nome) || d.nome || '').trim();
  if (!nome) throw falha_('Informe para quem é a proposta.');
  var area = d.area || (l && l.area) || '', esc = escritorio_();
  var adv = advogados_().filter(function (a) { return a.padrao === 'sim'; })[0] || advogados_()[0];
  var validade = Math.max(3, Math.min(60, parseInt(d.validade, 10) || 15));
  var inclui = String(d.inclui || '').trim() ? String(d.inclui).split('\n').map(function (x) { return x.replace(/^[-•*]\s*/, '').trim(); }).filter(Boolean) : (INCLUI_AREA[area] || INCLUI_AREA['Cível']);
  var md = [];
  md.push('Tubarão/SC, ' + porExtensoData_(hojeSP_()) + '.');
  md.push('À/Ao **' + nomeProprio_(nome) + '**');
  md.push('Agradecemos a confiança em nos procurar. Conforme conversamos, apresentamos a proposta de honorários para o seu caso. Ela resume o que faremos, o que está incluído e as condições de pagamento.');
  md.push('## 1. Objeto');
  md.push(String(d.objeto || (l && l.assunto) || '[COMPLETAR: descrever o serviço]').trim());
  md.push('## 2. O que está incluído');
  inclui.forEach(function (x) { md.push('- ' + x); });
  md.push('## 3. O que não está incluído');
  ['Recursos aos tribunais superiores (STJ, STF, TST, TNU) e sustentação oral, que serão combinados à parte, se necessários', 'Custas, perícias, taxas e diligências fora da comarca (deslocamento acima de 100 km), que ficam por conta do(a) cliente', 'Outras ações ou procedimentos diferentes do objeto acima'].forEach(function (x) { md.push('- ' + x); });
  md.push('## 4. Honorários');
  textoHonorariosProposta_(d.honorarios).forEach(function (x) { md.push(x); });
  md.push('Os honorários de sucumbência, se houver, pertencem ao escritório (art. 23 da Lei 8.906/94). Os valores observam a Tabela de Honorários da OAB/SC.');
  md.push('## 5. Forma de pagamento');
  md.push('PIX ou transferência para a conta do escritório (' + esc.pix + '). Enviamos o recibo de cada pagamento.');
  md.push('## 6. Como trabalhamos');
  ['O seu caso é conduzido pessoalmente pela Dra. ' + (adv.nome || 'Júlian Marcelino Araújo') + ' (' + oabTexto_(adv) + ').', 'Antes de protocolar a ação, você recebe a petição para conferir e aprovar.',
    'Você acompanha o processo pelo nosso site (araujoadvocaciasc.com.br/acompanhe), com CPF e código de acesso, e recebe avisos pelo WhatsApp a cada etapa importante.',
    'Avisamos as audiências e perícias com uma semana de antecedência e no próprio dia.', 'Atendimento de segunda a sexta, das 8h às 12h e das 13h30 às 18h, presencial ou por vídeo.'].forEach(function (x) { md.push('- ' + x); });
  md.push('## 7. Importante');
  md.push('A advocacia é uma atividade de meio: trabalhamos com dedicação e técnica, mas nenhum resultado pode ser garantido, porque a decisão é do Judiciário. O tempo do processo também depende do Judiciário.');
  if (String(d.obs || '').trim()) { md.push('## 8. Observações'); md.push(String(d.obs).trim()); }
  md.push('## ' + (String(d.obs || '').trim() ? '9' : '8') + '. Validade e próximos passos');
  md.push('Esta proposta vale por **' + validade + ' dias**. Se estiver de acordo, basta responder pelo WhatsApp: preparamos o contrato de honorários e a procuração para assinatura e informamos os documentos necessários.');
  md.push('Ficamos à disposição para qualquer dúvida.');
  md.push('');
  md.push('**' + nomeAssinatura_(adv.nome || 'Júlian Marcelino Araújo') + '**');
  md.push(oabTexto_(adv));
  var pasta = pastaDoClienteOu_(l && l.cliente_id, 'PASTA_PROPOSTAS_ID', 'PAINEL — PROPOSTAS DE HONORÁRIOS');
  var titulo = 'Proposta de honorários — ' + nomeProprio_(nome) + ' — ' + Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy');
  var g = docMarkdown_('Proposta de honorários advocatícios', md.join('\n'), pasta);
  DriveApp.getFileById(g.id).setName(titulo);
  // as duas últimas linhas (assinatura) ficam centralizadas
  try {
    var doc = DocumentApp.openById(g.id), ps = doc.getBody().getParagraphs();
    for (var k = ps.length - 1, c = 0; k >= 0 && c < 2; k--) { if (ps[k].getText().trim()) { ps[k].setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(0); c++; } }
    doc.saveAndClose();
  } catch (e) { /* segue */ }
  var pdf = pdfDoDoc_(g.id, pasta);
  if (l) comTrava_(function () {
    var t = tabela_('Leads'), x = t.linhas.filter(function (r) { return r.id === l.id; })[0];
    var vEst = dinheiro_((d.honorarios || {}).valor) || dinheiro_((d.honorarios || {}).mensal) * 12 || dinheiro_(x.valor_estimado);
    atualizarLinha_(t, x, { etapa: etapaAFrente_(x.etapa, 'atendido'), proposta_url: g.url, valor_estimado: vEst ? txtDinheiro_(vEst) : x.valor_estimado,
      proxima_acao: 'Confirmar se recebeu e se ficou alguma dúvida sobre a proposta', proxima_data: somarDias_(hojeSP_(), 2),
      historico: (x.historico ? x.historico + '\n' : '') + linhaHist_(u, 'proposta gerada (vale ' + validade + ' dias)'), atualizado_em: new Date().toISOString(), atualizado_por: u.usuario,
      primeiro_contato_em: x.primeiro_contato_em || new Date().toISOString() });
  });
  registrar_(u.usuario, 'proposta gerada', (l ? l.id + ' ' : '') + nome);
  var tel = l ? l.telefone : '';
  return { doc: g.url, pdf: pdf, nome: nomeProprio_(nome), telefone: tel,
    mensagem: 'Olá, ' + primeiroNomeTxt_(nome) + '! Tudo bem? Conforme conversamos, segue a proposta de honorários para o seu caso. Ela explica o que está incluído, os valores e como trabalhamos. Qualquer dúvida, é só me chamar por aqui. Dra. Júlian — Araújo Advocacia' };
}
function primeiroNomeTxt_(n) { return nomeProprio_(String(n || '').trim().split(/\s+/)[0] || ''); }

/* ================================================================== */
/* Padrões operacionais (guia do cliente e procedimentos da equipe)    */
/* ================================================================== */
var PADROES_INICIAIS = [
  ['cliente', 'Bem-vindo(a) ao escritório', 'Obrigado pela confiança. Este guia explica, de forma simples, como trabalhamos e o que esperar em cada etapa do seu caso. Guarde-o: ele responde às dúvidas mais comuns.'],
  ['cliente', 'Quem cuida do seu caso', 'O seu caso é conduzido pessoalmente pela Dra. Júlian Marcelino Araújo (OAB/SC 54.832), doutora em Direito, com o apoio de Luís Fernando, do escritório. Você fala direto com quem conhece o seu processo.'],
  ['cliente', 'Horário e canais de atendimento', '- Segunda a sexta, das 8h às 12h e das 13h30 às 18h.\n- WhatsApp: (48) 99612-6491 · Telefone: (48) 3626-2556.\n- Endereço: Rua Silvino Moreira Lima Sobrinho, nº 888, Sala 04, Humaitá, Tubarão/SC (em frente à nova rodoviária).\n- Atendimento presencial ou por vídeo, sempre com horário marcado.\n- Mensagens fora do horário são respondidas no próximo dia útil.'],
  ['cliente', 'As etapas do seu caso', '1. Conversa inicial e análise dos documentos.\n2. Proposta de honorários, contrato e procuração para assinatura.\n3. Envio dos documentos que faltarem.\n4. Preparação da petição: antes de protocolar, você recebe o texto para conferir e aprovar.\n5. Protocolo da ação: você recebe o número do processo e o código para acompanhar pelo site.\n6. Andamento: citação, defesa da outra parte, audiências e perícias, quando houver.\n7. Sentença e, se for o caso, recursos.\n8. Recebimento dos valores (alvará, RPV ou precatório) e prestação de contas.\n9. Encerramento do caso.'],
  ['cliente', 'Acompanhe pelo site', 'Em araujoadvocaciasc.com.br/acompanhe você vê a etapa do seu processo e as últimas movimentações, com o seu CPF e o código de 8 caracteres que enviamos. Também avisamos pelo WhatsApp a cada novidade importante.'],
  ['cliente', 'Audiências e perícias', 'Avisamos com uma semana de antecedência e de novo no dia. A sua presença é obrigatória: faltar sem justificativa pode prejudicar o processo. Chegue com 15 minutos de antecedência, leve documento com foto e, na perícia médica, todos os exames e laudos.'],
  ['cliente', 'Honorários e pagamentos', 'Os valores e as datas seguem o contrato. O pagamento é por PIX na conta do escritório, e enviamos o recibo de cada parcela. Se tiver dificuldade para pagar, fale conosco antes do vencimento: sempre buscamos uma solução.'],
  ['cliente', 'O tempo da Justiça', 'O tempo do processo depende do Judiciário, não do escritório. Há fases em que o processo fica parado aguardando o juiz ou a outra parte: isso é normal. A advocacia é uma atividade de meio: trabalhamos com dedicação, mas nenhum resultado pode ser garantido.'],
  ['cliente', 'O que pedimos a você', '- Conte tudo, inclusive o que parecer desfavorável: é assim que conseguimos defender bem.\n- Avise se mudar de telefone ou de endereço.\n- Responda às nossas mensagens e mande os documentos pedidos.\n- Não faça acordo nem converse sobre o processo com a outra parte sem falar conosco antes.'],
  ['cliente', 'Sigilo e proteção de dados', 'Tudo o que você nos conta é protegido pelo sigilo profissional. Os seus dados são usados só para o seu caso, conforme a Lei Geral de Proteção de Dados (LGPD).'],
  ['equipe', 'POP 1 · Primeiro contato (funil)', '- Todo contato novo (WhatsApp, telefone, site, indicação) entra em Relacionamento › CRM / Funil no mesmo dia.\n- Responder em até 15 minutos no horário de atendimento. Quem demora perde o cliente.\n- Registrar área, assunto e canal. Definir a próxima ação com data.\n- Pedido de retorno pelo site já entra sozinho no funil.'],
  ['equipe', 'POP 2 · Atendimento inicial', '- Agendar a consulta e mover o cartão para "Consulta agendada".\n- Na conversa: pedir autorização para gravar e usar "Transcrição e resumos" (atendimento).\n- Ao final: resumo para o cliente e lista de documentos pelo WhatsApp.\n- Mover para "Atendido" e anotar a avaliação do caso.'],
  ['equipe', 'POP 3 · Proposta e fechamento', '- Gerar a proposta pelo cartão do funil ("Gerar proposta"). O cartão vai para "Proposta enviada".\n- Retorno em 2 dias úteis. Negociação: anotar cada conversa.\n- Aceitou: "Virou cliente" → completar o cadastro → Documentos e propostas (contrato e procuração).\n- Não fechou: marcar o motivo. É o que mostra onde melhorar.'],
  ['equipe', 'POP 4 · Petição inicial', '- Fazer a inicial no prazo da tarefa.\n- Mandar ao cliente pelo WhatsApp para aprovar.\n- Aprovada e protocolada: "Conferido" com o número.\n- O painel gera o código do Acompanhe: enviar a mensagem pronta ao cliente.'],
  ['equipe', 'POP 5 · Intimações e prazos', '- Olhar a fila "Conferir no tribunal" todos os dias, começando pelos provisórios e pelos avisos da IA.\n- Confirmar a data fatal com a fonte. Fazer até 2 dias úteis antes do fatal.\n- "Conferido" ao cumprir. A administração dá o OK.\n- Na dúvida entre dois prazos, sempre o mais curto.'],
  ['equipe', 'POP 6 · Audiências', '- Confirmar o horário e o local (ou o link) e avisar o cliente uma semana antes e no dia.\n- Uma semana antes: gerar o Dossiê da audiência (mapa da prova e roteiro de perguntas) e revisar.\n- Preparar o cliente e as testemunhas.\n- Depois: transcrição ou ata, resumo para o cliente e próximos passos no painel.'],
  ['equipe', 'POP 7 · Financeiro', '- Honorário só entra no Financeiro depois do contrato assinado.\n- Conferir os PIX todos os dias.\n- Parcela paga: o recibo sai sozinho; mandar pelo WhatsApp.\n- Lembrar antes do vencimento e cobrar com educação depois. Dificuldade: renegociar pelo painel.'],
  ['equipe', 'POP 8 · Encerramento', '- Valor liberado: levantar o alvará, fazer a prestação de contas e o repasse.\n- Processo encerrado: avisar o cliente e pedir a avaliação no Google (só depois do processo pronto).\n- Arquivar no painel.'],
  ['equipe', 'POP 9 · Uso de IA no escritório', 'A IA está aqui para nos auxiliar, nunca para nos substituir: ela aprimora a escrita e ajuda a enxergar o que às vezes não vemos no processo. Ela faz os bons profissionais parecerem melhores, e os descuidados, piores.\n- Tudo o que a IA escreve é RASCUNHO: conferir fatos, artigos e datas no processo.\n- Nunca usar julgado citado pela IA sem achar o inteiro teor.\n- Não colar CPF, endereço ou dados de saúde sem necessidade (o painel já tira os dados pessoais).\n- Gravar conversa só com autorização das pessoas.']
];
function padroesListar_() {
  var t = tabela_('Padroes');
  if (!t.linhas.length && !config_('PADROES_SEMEADOS')) {
    comTrava_(function () {
      var tt = tabela_('Padroes'), agora = new Date().toISOString();
      if (tt.linhas.length) return;
      PADROES_INICIAIS.forEach(function (p, i) { inserirLinha_(tt, { id: novoId_('S'), grupo: p[0], titulo: p[1], texto: p[2], ordem: String(i + 1), atualizado_em: agora, atualizado_por: 'painel' }); });
      setConfig_('PADROES_SEMEADOS', agora, 'Padrões operacionais iniciais já criados');
    });
    t = tabela_('Padroes');
  }
  return { itens: t.linhas.map(limpar_).sort(function (a, b) { return (+a.ordem || 0) - (+b.ordem || 0); }) };
}
function podeEditarPadroes_(u) { return u.perfil === 'administrador' || u.perfil === 'advogada'; }
function padroesSalvar_(d, u) {
  if (!podeEditarPadroes_(u)) throw falha_('Só a administração e a advogada editam os padrões.');
  return comTrava_(function () {
    var t = tabela_('Padroes'), agora = new Date().toISOString(), x = d.item || {};
    if (d.apagar) { var a = t.linhas.filter(function (r) { return r.id === d.apagar; })[0]; if (a) apagarLinha_(t, a); return { ok: true }; }
    var grupo = x.grupo === 'equipe' ? 'equipe' : 'cliente';
    var titulo = String(x.titulo || '').trim().slice(0, 120), texto = String(x.texto || '').trim().slice(0, 20000);
    if (!titulo || !texto) throw falha_('Preencha o título e o texto.');
    if (x.id) {
      var l = t.linhas.filter(function (r) { return r.id === x.id; })[0];
      if (!l) throw falha_('Item não encontrado.');
      atualizarLinha_(t, l, { grupo: grupo, titulo: titulo, texto: texto, ordem: x.ordem !== undefined ? String(x.ordem) : l.ordem, atualizado_em: agora, atualizado_por: u.usuario });
      return { id: l.id };
    }
    var max = t.linhas.reduce(function (m, r) { return Math.max(m, +r.ordem || 0); }, 0);
    var id = novoId_('S');
    inserirLinha_(t, { id: id, grupo: grupo, titulo: titulo, texto: texto, ordem: String(max + 1), atualizado_em: agora, atualizado_por: u.usuario });
    return { id: id };
  });
}
/** Guia do cliente em PDF (Google Docs no padrão do escritório) para mandar a quem acabou de contratar. */
function padroesGuia_(d, u) {
  var itens = padroesListar_().itens.filter(function (x) { return x.grupo === (d.grupo === 'equipe' ? 'equipe' : 'cliente'); });
  var md = [];
  itens.forEach(function (x) { md.push('## ' + x.titulo); md.push(x.texto); });
  var titulo = d.grupo === 'equipe' ? 'Padrões operacionais do escritório' : 'Como funciona o escritório — guia do cliente';
  var pasta = pastaPainel_('PASTA_GUIAS_ID', 'PAINEL — GUIAS E PADRÕES');
  var g = docMarkdown_(titulo, md.join('\n'), pasta, 'Atualizado em ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'));
  var pdf = pdfDoDoc_(g.id, pasta);
  registrar_(u.usuario, 'guia gerado', titulo);
  return { doc: g.url, pdf: pdf };
}

/* ================================================================== */
/* Transcrição de audiências e atendimentos (Gemini)                   */
/* ================================================================== */
/* O navegador manda o áudio em pedaços de 3 MB (múltiplos de 3 e de 256 KiB: o texto em base64 de cada pedaço emenda sem quebra e
   o envio ao Google pode ser feito pedaço a pedaço). Os pedaços ficam numa pasta temporária do Drive e são apagados no fim. */
var AUDIO_MAX_MB = 45;
function audioInicio_(d, u) {
  var mb = (+d.tamanho || 0) / 1048576;
  if (!(mb > 0)) throw falha_('Arquivo vazio.');
  if (mb > AUDIO_MAX_MB) throw falha_('O arquivo tem ' + Math.round(mb) + ' MB. O limite é ' + AUDIO_MAX_MB + ' MB: grave só o áudio (o painel grava em formato leve) ou divida a gravação.');
  var mime = String(d.mime || '').toLowerCase();
  if (!/^(audio|video)\//.test(mime)) throw falha_('Envie um arquivo de áudio ou vídeo.');
  if (!chaveIA_()) throw falha_('A IA não está ligada. A administração cadastra a chave do Gemini em Usuários › Resumo por IA.');
  var id = novoId_('A');
  CacheService.getScriptCache().put('aud_' + id, JSON.stringify({ u: u.id, partes: +d.partes || 1, mime: mime.replace(/;.*$/, ''), tamanho: +d.tamanho, nome: String(d.nome || '').slice(0, 100) }), 21600);
  return { id: id };
}
function audioMeta_(id, u) {
  if (!/^A[0-9a-f]{10}$/.test(String(id || ''))) throw falha_('Envio inválido.');
  var m = CacheService.getScriptCache().get('aud_' + id);
  if (!m) throw falha_('O envio expirou. Mande o arquivo de novo.');
  m = JSON.parse(m);
  if (m.u !== u.id) throw falha_('Envio de outra pessoa.');
  return m;
}
function audioParte_(d, u) {
  var m = audioMeta_(d.id, u), n = parseInt(d.n, 10);
  if (!(n >= 0 && n < m.partes)) throw falha_('Pedaço inválido.');
  var b64 = String(d.b64 || '');
  if (!/^[A-Za-z0-9+\/=]+$/.test(b64)) throw falha_('Pedaço corrompido. Tente de novo.');
  var pasta = pastaPainel_('PASTA_AUDIO_TEMP_ID', 'PAINEL — ÁUDIOS TEMPORÁRIOS (apagados sozinhos)');
  var nome = d.id + '_' + ('00' + n).slice(-3);
  var ja = pasta.getFilesByName(nome); while (ja.hasNext()) ja.next().setTrashed(true);
  pasta.createFile(nome, b64, MimeType.PLAIN_TEXT);
  return { ok: true, n: n };
}
function audioPartes_(id, m) {
  var pasta = pastaPainel_('PASTA_AUDIO_TEMP_ID', 'PAINEL — ÁUDIOS TEMPORÁRIOS (apagados sozinhos)'), arqs = [];
  for (var i = 0; i < m.partes; i++) {
    var it = pasta.getFilesByName(id + '_' + ('00' + i).slice(-3));
    if (!it.hasNext()) throw falha_('Faltou o pedaço ' + (i + 1) + ' de ' + m.partes + ' do áudio. Mande o arquivo de novo.');
    arqs.push(it.next());
  }
  return arqs;
}
function apagarTemporarios_(id) {
  try {
    var pasta = pastaPainel_('PASTA_AUDIO_TEMP_ID', 'PAINEL — ÁUDIOS TEMPORÁRIOS (apagados sozinhos)'), it = pasta.getFiles(), velho = Date.now() - 2 * 86400000;
    while (it.hasNext()) { var f = it.next(); if ((id && f.getName().indexOf(id) === 0) || f.getDateCreated().getTime() < velho) f.setTrashed(true); }
  } catch (e) { /* segue */ }
}
/** Sobe o áudio para a API de arquivos do Gemini em pedaços (upload "resumable") e espera ficar pronto. */
function subirAudioGemini_(arqs, m) {
  var chave = chaveIA_();
  var ini = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': chave, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(m.tamanho), 'X-Goog-Upload-Header-Content-Type': m.mime },
    payload: JSON.stringify({ file: { display_name: 'painel-' + Date.now() } }) });
  var hd = ini.getAllHeaders(), url = hd['x-goog-upload-url'] || hd['X-Goog-Upload-URL'] || hd['X-Goog-Upload-Url'];
  if (ini.getResponseCode() !== 200 || !url) throw falha_('O Google não aceitou o envio do áudio (código ' + ini.getResponseCode() + ').');
  var off = 0, resp;
  for (var i = 0; i < arqs.length; i++) {
    var bytes = Utilities.base64Decode(arqs[i].getBlob().getDataAsString());
    var ult = i === arqs.length - 1;
    resp = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: m.mime,
      headers: { 'X-Goog-Upload-Offset': String(off), 'X-Goog-Upload-Command': ult ? 'upload, finalize' : 'upload' }, payload: bytes });
    if (resp.getResponseCode() !== 200) throw falha_('O envio do áudio ao Google parou no pedaço ' + (i + 1) + ' (código ' + resp.getResponseCode() + '). Tente de novo.');
    off += bytes.length;
  }
  var f = (JSON.parse(resp.getContentText()) || {}).file || {};
  for (var t = 0; t < 40 && f.state && f.state !== 'ACTIVE'; t++) {
    if (f.state === 'FAILED') throw falha_('O Google não conseguiu ler esse arquivo de áudio. Tente outro formato (mp3, m4a, ogg, webm).');
    Utilities.sleep(3000);
    var g = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/' + f.name, { muteHttpExceptions: true, headers: { 'x-goog-api-key': chave } });
    if (g.getResponseCode() === 200) f = JSON.parse(g.getContentText());
  }
  if (f.state && f.state !== 'ACTIVE') throw falha_('O Google ainda está processando o áudio. Tente "Transcrever" de novo em 1 minuto.');
  return f;
}
function apagarArquivoGemini_(nome) {
  try { UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/' + nome, { method: 'delete', muteHttpExceptions: true, headers: { 'x-goog-api-key': chaveIA_() } }); } catch (e) { /* o Google apaga sozinho em 48 h */ }
}
function promptTranscricao_(tipo, contexto) {
  var quem = tipo === 'audiencia'
    ? 'Juiz(a), Advogado(a) da parte autora, Advogado(a) da parte ré, Autor(a), Réu/Preposto, Testemunha 1, Testemunha 2, Perito(a)'
    : 'Advogado(a), Cliente, Acompanhante';
  return 'Transcreva INTEGRALMENTE, em português do Brasil, esta gravação de ' + (tipo === 'audiencia' ? 'uma audiência judicial' : 'um atendimento de escritório de advocacia') + '. ' +
    'Identifique quem fala pelo papel (' + quem + '); use o nome informado no contexto só quando tiver certeza de quem é. ' +
    'Cada fala começa numa nova linha, no formato "[mm:ss] Papel: texto". Não resuma, não corrija o conteúdo, não invente; trecho que não dá para entender = [inaudível]. ' +
    'Mantenha números, datas e valores exatamente como ditos.' + (contexto ? '\n\nCONTEXTO INFORMADO PELA EQUIPE (nomes e papéis): ' + String(contexto).slice(0, 1500) : '');
}
function transcrever_(d, u) {
  var m = audioMeta_(d.id, u);
  var arqs = audioPartes_(d.id, m);
  var f = subirAudioGemini_(arqs, m);
  var tipo = d.tipo === 'audiencia' ? 'audiencia' : 'atendimento';
  var r;
  try {
    var modelo = config_('TRANSCRICAO_MODELO') || modeloIA_().replace(/-lite$/, '');
    r = geminiTexto_([{ file_data: { mime_type: f.mimeType || m.mime, file_uri: f.uri } }, { text: promptTranscricao_(tipo, d.contexto) }], { modelo: modelo, max: 65000, temp: 0 });
  } finally { apagarArquivoGemini_(f.name); }
  if (!r.texto) throw falha_('A IA não devolveu texto. O áudio tem fala? Tente de novo.');
  var pasta = pastaPainel_('PASTA_AUDIO_TEMP_ID', 'PAINEL — ÁUDIOS TEMPORÁRIOS (apagados sozinhos)');
  pasta.createFile(d.id + '_texto', r.texto, MimeType.PLAIN_TEXT);
  arqs.forEach(function (a) { a.setTrashed(true); });
  registrar_(u.usuario, 'transcrição', tipo + ' · ' + Math.round(m.tamanho / 1048576) + ' MB');
  return { id: d.id, texto: r.texto, cortado: r.cortado };
}
function contextoProcesso_(p, u, limite) {
  var cli = p.cliente_id ? (tabela_('Clientes').linhas.filter(function (c) { return c.id === p.cliente_id; })[0] || {}) : {};
  var nomes = [cli.nome, p.cliente_nome, p.parte_contraria].concat(String(p.parte_contraria || '').split(';')).filter(Boolean);
  var lt = [];
  try { lt = linhaDoTempo_({ id: p.id }, u).itens.slice(0, limite || 60).reverse(); } catch (e) { lt = []; }
  var intims = tabela_('Intimacoes').linhas.filter(function (i) { return i.numero === p.numero && String(i.texto || '').length > 80; })
    .sort(function (a, b) { return a.recebido_em < b.recebido_em ? 1 : -1; }).slice(0, 8).reverse();
  var tr = tabela_('Transcricoes').linhas.filter(function (x) { return x.processo_id === p.id && x.resumo_equipe; }).slice(-3);
  var partes = [
    'PROCESSO: ' + [p.classe, p.area, p.orgao, p.tribunal].filter(Boolean).join(' · ') + ' · etapa no painel: ' + (FASES[faseDe_(p)] || faseDe_(p)) + ' · nosso cliente é ' + (p.polo || 'parte (polo não informado)'),
    p.proximo_ato ? 'PRÓXIMO ATO: ' + p.proximo_ato + (p.proximo_ato_data ? ' em ' + dataBR_(p.proximo_ato_data) : '') : '',
    cli.resumo_caso ? 'RESUMO DO CASO (ficha do cliente): ' + String(cli.resumo_caso).slice(0, 3000) : '',
    lt.length ? 'HISTÓRICO (mais antigo primeiro):\n' + lt.map(function (x) { return String(x.quando).slice(0, 10) + ' — ' + x.tipo + ': ' + x.titulo + (x.detalhe ? ' (' + String(x.detalhe).slice(0, 200) + ')' : ''); }).join('\n') : '',
    intims.length ? 'TEXTOS DAS INTIMAÇÕES/PUBLICAÇÕES:\n' + intims.map(function (i) { return '[' + String(i.recebido_em).slice(0, 10) + '] ' + String(i.movimento || '') + '\n' + String(i.texto).slice(0, 2500); }).join('\n\n') : '',
    tr.length ? 'RESUMOS DE AUDIÊNCIAS/ATENDIMENTOS JÁ FEITOS:\n' + tr.map(function (x) { return '[' + x.data_ato + '] ' + x.titulo + '\n' + String(x.resumo_equipe).slice(0, 4000); }).join('\n\n') : ''
  ].filter(Boolean).join('\n\n');
  return { texto: anonimizar_(partes, nomes), nomes: nomes, cliente: cli };
}
function transcricaoResumo_(d, u) {
  var tipo = d.tipo === 'audiencia' ? 'audiencia' : 'atendimento';
  var texto = String(d.texto || '');
  if (!texto && d.id) {
    var pasta = pastaPainel_('PASTA_AUDIO_TEMP_ID', 'PAINEL — ÁUDIOS TEMPORÁRIOS (apagados sozinhos)'), it = pasta.getFilesByName(String(d.id) + '_texto');
    if (it.hasNext()) texto = it.next().getBlob().getDataAsString();
  }
  texto = texto.trim();
  if (texto.length < 80) throw falha_('A transcrição está vazia ou curta demais para resumir.');
  var p = d.processo_id ? tabela_('Processos').linhas.filter(function (x) { return x.id === d.processo_id; })[0] : null;
  var cli = d.cliente_id ? tabela_('Clientes').linhas.filter(function (x) { return x.id === d.cliente_id; })[0] : (p && p.cliente_id ? tabela_('Clientes').linhas.filter(function (x) { return x.id === p.cliente_id; })[0] : null);
  var nomes = [cli && cli.nome, p && p.cliente_nome, p && p.parte_contraria].filter(Boolean);
  var ctx = p ? contextoProcesso_(p, u, 30).texto : '';
  var pedido = tipo === 'audiencia'
    ? 'Esta é a transcrição de uma AUDIÊNCIA. Responda SOMENTE em JSON com as chaves: "titulo" (curto), "cliente" (texto para o CLIENTE, em português bem simples, ' +
      'até 180 palavras: o que aconteceu na audiência, sem termos técnicos, sem prometer resultado, sem prazos internos; trate o cliente por "você"), ' +
      '"equipe" (Markdown para a advogada com: ## Síntese; ## Depoimentos (um ### por depoente, com os pontos principais e o minuto [mm:ss]); ' +
      '## Pontos favoráveis; ## Pontos desfavoráveis e contradições; ## Fatos confessados ou incontroversos; ## Provas pendentes / determinações do juiz; ' +
      '## Próximos passos sugeridos (sem datas fatais: "conferir no tribunal"); ## Pontos para a advogada conferir).'
    : 'Esta é a transcrição de um ATENDIMENTO a cliente. Responda SOMENTE em JSON com as chaves: "titulo" (curto), "cliente" (texto para o CLIENTE, em português bem simples, ' +
      'até 180 palavras: o que conversamos, os próximos passos e os documentos que ele precisa mandar; sem prometer resultado; trate por "você"), ' +
      '"equipe" (Markdown para a advogada com: ## Relato do cliente (fatos em ordem cronológica, com datas e valores citados); ## Pedidos e direitos possíveis (com [conferir]); ' +
      '## Provas e documentos (os que o cliente tem e os que faltam); ## Testemunhas citadas; ## Riscos e pontos fracos; ## Prescrição e prazos a verificar; ' +
      '## Perguntas que ficaram sem resposta; ## Próximos passos; ## Pontos para a advogada conferir), "documentos" (lista de documentos para pedir ao cliente).';
  var r = geminiTexto_([{ text: pedido + (ctx ? '\n\nCONTEXTO DO PROCESSO:\n' + ctx : '') + '\n\nTRANSCRIÇÃO:\n' + anonimizar_(texto, nomes).slice(0, 400000) }],
    { sistema: IA_SISTEMA_JURIDICO + ' Os nomes do cliente e da outra parte aparecem como [PARTE]: no texto para o cliente, chame-o de "você" e a outra parte de "a outra parte".', max: 12000, json: true, temp: 0.2 });
  var o = jsonDaIA_(r.texto) || { cliente: '', equipe: r.texto };
  var titulo = String(d.titulo || o.titulo || (tipo === 'audiencia' ? 'Audiência' : 'Atendimento')).slice(0, 140);
  var docs = Array.isArray(o.documentos) ? o.documentos.map(String) : [];
  var md = ['**Tipo:** ' + (tipo === 'audiencia' ? 'audiência' : 'atendimento') + ' · **Data:** ' + dataBR_(d.data_ato || hojeSP_()) + (p ? ' · **Processo:** ' + p.numero : '') + (cli ? ' · **Cliente:** ' + cli.nome : ''),
    '> Rascunho feito com IA a partir da gravação. Conferir com a gravação/ata oficial antes de usar.',
    '## Resumo para o cliente', String(o.cliente || ''), docs.length ? '## Documentos para pedir\n' + docs.map(function (x) { return '- ' + x; }).join('\n') : '',
    '---', '# Análise para a equipe', String(o.equipe || ''), '---', '# Transcrição completa', texto].filter(Boolean).join('\n\n');
  var pastaDoc = pastaDoClienteOu_(cli && cli.id, 'PASTA_IA_ID', 'PAINEL — DOCUMENTOS DA IA');
  var g = docMarkdown_((tipo === 'audiencia' ? 'Audiência — ' : 'Atendimento — ') + titulo, md, pastaDoc, Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'));
  var id = novoId_('R'), agora = new Date().toISOString();
  comTrava_(function () {
    inserirLinha_(tabela_('Transcricoes'), { id: id, criado_em: agora, criado_por: u.usuario, tipo: tipo, titulo: titulo, cliente_id: cli ? cli.id : '', processo_id: p ? p.id : '',
      data_ato: d.data_ato || hojeSP_(), fonte: d.id ? 'áudio' : 'ao vivo', doc_url: g.url, resumo_cliente: String(o.cliente || '').slice(0, 8000),
      resumo_equipe: String(o.equipe || '').slice(0, 45000), documentos: docs.join('\n').slice(0, 3000), publicado: '', publicado_em: '' });
  });
  if (d.id) apagarTemporarios_(d.id);
  // 8.13.1 (pedido da usuária): com cliente escolhido, vai para as OBSERVAÇÕES do cliente: "AUDIÊNCIA"/"ATENDIMENTO" e a transcrição embaixo
  if (cli) {
    try {
      var linhasTr = texto.replace(/\r/g, '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean), corpoTr = linhasTr.join(' ⏎ ');
      if (corpoTr.length > 38000) corpoTr = corpoTr.slice(0, 38000) + ' ⏎ (a transcrição continua no documento completo)';
      anotarCliente_({ id: cli.id, texto: (tipo === 'audiencia' ? 'AUDIÊNCIA' : 'ATENDIMENTO') + ' — ' + titulo + ' (' + dataBR_(d.data_ato || hojeSP_()) + ')' + (p ? ' · processo ' + p.numero : '') +
        (o.cliente ? ' ⏎ Resumo: ' + String(o.cliente).replace(/\s+/g, ' ').slice(0, 1500) : '') + ' ⏎ Transcrição: ⏎ ' + corpoTr + ' ⏎ Documento completo: ' + g.url }, u);
    } catch (eObs) { registrar_(u.usuario, 'erro', 'transcrição nas observações: ' + (eObs.message || eObs)); }
  }
  registrar_(u.usuario, 'resumo de ' + tipo, (cli ? cli.id + ' ' : '') + titulo);
  return { id: id, doc: g.url, cliente: o.cliente || '', equipe: o.equipe || '', documentos: docs, telefone: cli ? cli.telefone : '', nome: cli ? cli.nome : '', titulo: titulo };
}
function transcricoesListar_(d) {
  var cli = {}; tabela_('Clientes').linhas.forEach(function (c) { cli[c.id] = c.nome; });
  var proc = {}; tabela_('Processos').linhas.forEach(function (p) { proc[p.id] = p.numero; });
  return { itens: tabela_('Transcricoes').linhas.filter(function (x) { return (!d.cliente_id || x.cliente_id === d.cliente_id) && (!d.processo_id || x.processo_id === d.processo_id); })
    .map(function (x) { var o = limpar_(x); o.cliente = cli[x.cliente_id] || ''; o.numero = proc[x.processo_id] || ''; delete o.resumo_equipe; return o; })
    .sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; }).slice(0, 200) };
}
/** Publicar (ou tirar) o resumo no Acompanhe do cliente. O texto pode ser corrigido antes. */
function transcricaoPublicar_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Transcricoes'), x = t.linhas.filter(function (r) { return r.id === d.id; })[0];
    if (!x) throw falha_('Resumo não encontrado.');
    if (!x.cliente_id && !x.processo_id) throw falha_('Ligue o resumo a um cliente ou processo antes de publicar.');
    var m = {};
    if (d.texto !== undefined) m.resumo_cliente = String(d.texto).trim().slice(0, 8000);
    if (d.publicar !== undefined) { m.publicado = d.publicar ? 'sim' : ''; m.publicado_em = d.publicar ? new Date().toISOString() : ''; }
    atualizarLinha_(t, x, m);
    registrar_(u.usuario, d.publicar ? 'resumo publicado no Acompanhe' : 'resumo alterado', x.id);
    return { ok: true };
  });
}

/* 8.12.2: "Peças com IA" e "Biblioteca de prompts" saíram a pedido da usuária (ficou só Transcrição e resumos). */

/** 8.12.3: observação DITADA no cadastro do cliente → a IA só arruma pontuação, parágrafos e listas (nunca acrescenta nada). */
function organizarNotaIA_(d, u) {
  var texto = String(d.texto || '').trim();
  if (texto.length < 15) throw falha_('Fale ou escreva a observação primeiro.');
  var c = d.cliente_id ? tabela_('Clientes').linhas.filter(function (x) { return x.id === d.cliente_id; })[0] : null;
  var nome = c ? String(c.nome || '').trim() : '';
  var r = geminiTexto_([{ text: 'Abaixo está uma observação DITADA por voz por uma advogada sobre um cliente (o reconhecimento de voz erra pontuação e às vezes palavras). ' +
    'Reescreva SÓ corrigindo pontuação, maiúsculas, palavras claramente trocadas pelo reconhecimento de voz e organizando em frases curtas ou em itens com "-" quando houver uma lista ' +
    '(documentos, valores, datas, combinados). NÃO acrescente nada, NÃO resuma, NÃO tire informação, NÃO dê opinião jurídica, mantenha números, datas e valores exatamente. ' +
    'Responda só com o texto final, sem título e sem comentários.\n\nOBSERVAÇÃO:\n' + anonimizar_(texto.slice(0, 20000), nome ? [nome] : []) }], { max: 4000, temp: 0.1 });
  var out = String(r.texto || '').replace(/^```\w*|```$/g, '').trim();
  if (nome) out = out.replace(/\[PARTE\]/g, nomeProprio_(nome));
  if (!out) throw falha_('A IA não respondeu agora. O texto ditado continua na caixa: pode salvar assim.');
  registrar_(u.usuario, 'observação arrumada pela IA', d.cliente_id || '');
  return { texto: out };
}

/** Um resumo inteiro (com a análise da equipe) para abrir no painel. */
function transcricaoObter_(d, u) {
  var x = tabela_('Transcricoes').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!x) throw falha_('Resumo não encontrado.');
  var o = limpar_(x), c = x.cliente_id ? tabela_('Clientes').linhas.filter(function (r) { return r.id === x.cliente_id; })[0] : null;
  var p = x.processo_id ? tabela_('Processos').linhas.filter(function (r) { return r.id === x.processo_id; })[0] : null;
  if (!c && p && p.cliente_id) c = tabela_('Clientes').linhas.filter(function (r) { return r.id === p.cliente_id; })[0];
  o.nome = c ? c.nome : ''; o.telefone = c ? c.telefone : ''; o.numero = p ? p.numero : '';
  o.documentos = String(x.documentos || '').split('\n').filter(Boolean);
  o.cliente = o.resumo_cliente; o.equipe = o.resumo_equipe; o.doc = o.doc_url;
  return o;
}
/** "Criar tarefa com os próximos passos": vira tarefa de quem pediu (pedir documentos, próximos passos do resumo). */
function transcricaoTarefa_(d, u) {
  var x = transcricaoObter_({ id: d.id }, u);
  var passos = String(x.resumo_equipe || '').split('\n'), dentro = false, lista = [];
  passos.forEach(function (l) { if (/^##\s/.test(l)) dentro = /pr[oó]ximos passos|provid[eê]ncias|provas pendentes/i.test(l); else if (dentro && /^\s*([-*•]|\d+[.)])\s+/.test(l)) lista.push(l.replace(/^\s*([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '')); });
  var docs = x.documentos || [];
  var desc = (docs.length ? 'Documentos para pedir ao cliente:\n' + docs.map(function (z) { return '- ' + z; }).join('\n') + '\n\n' : '') +
    (lista.length ? 'Próximos passos (do resumo):\n' + lista.slice(0, 12).map(function (z) { return '- ' + z; }).join('\n') + '\n\n' : '') + 'Resumo completo: ' + (x.doc_url || '');
  var agora = new Date().toISOString(), id = novoId_('T');
  comTrava_(function () {
    inserirLinha_(tabela_('Tarefas'), { id: id, titulo: (x.tipo === 'audiencia' ? 'Depois da audiência — ' : 'Depois do atendimento — ') + (x.nome || x.titulo), descricao: desc.slice(0, 20000),
      responsavel: d.responsavel || u.usuario, processo_id: x.processo_id || '', numero: x.numero || '', cliente_id: x.cliente_id || '', vence_em: somarDias_(hojeSP_(), 2), etapa: 'afazer',
      peso: '2', situacao: 'ativa', concluida_por: '', concluida_em: '', historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' ' + (u.nome || u.usuario) + ': criada pelo resumo',
      criado_em: agora, criado_por: u.usuario, atualizado_em: agora, atualizado_por: u.usuario, prioridade: 'alta',
      checklist: JSON.stringify(docs.slice(0, 15).map(function (z) { return { t: 'Pedir: ' + z, ok: false }; }).concat(lista.slice(0, 10).map(function (z) { return { t: z, ok: false }; }))) });
  });
  registrar_(u.usuario, 'tarefa do resumo', x.id);
  return { id: id };
}

/** CRM: "Agendar consulta" marca na agenda ATENDIMENTOS do Google e passa o cartão para "Consulta agendada". */
function crmAgendarConsulta_(d, u) {
  var l = tabela_('Leads').linhas.filter(function (r) { return r.id === d.id; })[0];
  if (!l) throw falha_('Contato não encontrado.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '') || !/^\d{2}:\d{2}$/.test(d.hora || '')) throw falha_('Informe o dia e a hora da consulta.');
  var video = d.modo === 'video';
  var ev = null, erroAg = '';
  try {
    ev = criarCompromisso_({ agenda: 'ATENDIMENTOS', titulo: 'Consulta — ' + l.nome + (l.area ? ' (' + l.area + ')' : ''), data: d.data, inicio: d.hora, fim: d.fim || '',
      local: video ? 'Por vídeo' : 'Escritório', descricao: [l.assunto, l.telefone ? 'Telefone: ' + l.telefone : '', 'Veio por: ' + (l.canal || '—')].filter(Boolean).join('\n') }, u);
  } catch (e) { erroAg = String(e.message || e); }
  crmEtapa_({ id: l.id, etapa: etapaAFrente_(l.etapa, 'contato'), consulta_em: d.data + 'T' + d.hora, nota: (video ? 'por vídeo' : 'no escritório') + (erroAg ? ' (não entrou no Google Agenda: ' + erroAg + ')' : '') }, u);
  comTrava_(function () {
    var t = tabela_('Leads'), x = t.linhas.filter(function (r) { return r.id === l.id; })[0];
    atualizarLinha_(t, x, { proxima_acao: 'Confirmar a consulta na véspera', proxima_data: somarDias_(d.data, -1) < hojeSP_() ? hojeSP_() : somarDias_(d.data, -1) });
  });
  return { ok: true, agenda: !!ev, erro: erroAg };
}

/* ================================================================== */
/* Recibos e painel financeiro                                         */
/* ================================================================== */
function recibosListar_(d) {
  var cli = mapaClientes_(), hons = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var busca = normalizar_(d.busca || ''), mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : '';
  var itens = tabela_('Parcelas').linhas.filter(function (p) { return p.pago_em && (!mes || p.pago_em.slice(0, 7) === mes); }).map(function (p) {
    var c = cli[p.cliente_id] || {};
    return { id: p.id, cliente_id: p.cliente_id, cliente: c.nome || '', telefone: c.telefone || '', numero: p.numero, pago_em: p.pago_em.slice(0, 10),
      valor: dinheiro_(p.valor_pago) || dinheiro_(p.valor), forma: p.forma || '', honorario: (hons[p.honorario_id] || {}).descricao || '', recibo_url: p.recibo_url || '' };
  }).filter(function (x) { return !busca || normalizar_(x.cliente + ' ' + x.honorario).indexOf(busca) >= 0; })
    .sort(function (a, b) { return a.pago_em < b.pago_em ? 1 : -1; });
  return { itens: itens.slice(0, 400), total: itens.length, soma: Math.round(itens.reduce(function (t, x) { return t + x.valor; }, 0) * 100) / 100 };
}
function reciboGerar_(d, u) {
  var tab = tabela_('Parcelas'), p = tab.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!p || !p.pago_em) throw falha_('Parcela paga não encontrada.');
  var r = reciboDaParcela_({ honorario_id: p.honorario_id, cliente_id: p.cliente_id, numero: p.numero, data: p.pago_em.slice(0, 10), forma: p.forma, valor: dinheiro_(p.valor_pago) || dinheiro_(p.valor) }, u);
  guardarRecibo_(p.id, r.pdf || r.doc);
  return r;
}
function guardarRecibo_(parcelaId, url) {
  if (!url) return;
  try { comTrava_(function () { var t = tabela_('Parcelas'), x = t.linhas.filter(function (r) { return r.id === parcelaId; })[0]; if (x) atualizarLinha_(t, x, { recibo_url: url }); }); } catch (e) { /* segue */ }
}
function painelFinanceiro_(d) {
  var hoje = hojeSP_(), mes = hoje.slice(0, 7), meses = mesesAtras_(hoje, 12);
  var fluxo = fluxoMensal_(meses), r2 = function (v) { return Math.round(v * 100) / 100; };
  var hons = {}, procs = {}, clis = mapaClientes_();
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  tabela_('Processos').linhas.forEach(function (p) { procs[p.id] = p; });
  var porArea = {}, venc90 = 0, pago90 = 0, devedores = {}, aberto = 0, previsto = {};
  var em90 = somarDias_(hoje, -90), fut = mesesAFrente_(hoje, 3);
  fut.forEach(function (m) { previsto[m] = 0; });
  tabela_('Parcelas').linhas.forEach(function (p) {
    var h = hons[p.honorario_id] || {};
    if (['cancelado'].indexOf(h.situacao) >= 0) return;
    var v = dinheiro_(p.valor), pg = dinheiro_(p.valor_pago);
    if (p.pago_em && p.pago_em.slice(0, 10) >= somarDias_(hoje, -365)) {
      var area = (procs[h.processo_id] || {}).area || (clis[p.cliente_id] || {}).area || 'Sem área';
      porArea[area] = r2((porArea[area] || 0) + (pg || v));
    }
    if (p.vencimento >= em90 && p.vencimento < hoje) { venc90 += v; if (p.pago_em) pago90 += Math.min(v, pg || v); }
    if (!p.pago_em && ['encerrado', 'quitado'].indexOf(h.situacao) < 0) {
      var saldo = v - pg; aberto += saldo;
      if (p.vencimento < hoje) { var dv = devedores[p.cliente_id] = devedores[p.cliente_id] || { cliente_id: p.cliente_id, cliente: (clis[p.cliente_id] || {}).nome || '', valor: 0, parcelas: 0, desde: p.vencimento }; dv.valor = r2(dv.valor + saldo); dv.parcelas++; if (p.vencimento < dv.desde) dv.desde = p.vencimento; }
      var k = (p.vencimento || '').slice(0, 7); if (previsto[k] !== undefined) previsto[k] = r2(previsto[k] + saldo);
    }
  });
  var atual = fluxo.filter(function (f) { return f.mes === mes; })[0] || { entradas: 0, saidas: 0 };
  var anterior = fluxo[fluxo.length - 2] || { entradas: 0 };
  var ult3 = fluxo.slice(-4, -1), media3 = ult3.length ? r2(ult3.reduce(function (t, f) { return t + f.entradas; }, 0) / ult3.length) : 0;
  var resumo = resumoFinanceiro_();
  var contratosMes = tabela_('Assinaturas').linhas.filter(function (a) { return a.situacao === 'assinado' && String(a.assinado_em).slice(0, 7) === mes; }).length;
  var exitos = tabela_('Honorarios').linhas.filter(function (h) { return h.tipo === 'exito' && ['cancelado', 'encerrado', 'quitado'].indexOf(h.situacao) < 0; }).length;
  return {
    hoje: hoje, mes: mes, fluxo: fluxo,
    kpis: { recebidoMes: atual.entradas, recebidoAnterior: anterior.entradas, media3: media3, despesasMes: atual.saidas, saldoMes: r2(atual.entradas - atual.saidas),
      aReceber30: resumo.totais.aReceber30, atrasado: resumo.totais.atrasado, clientesAtrasados: resumo.totais.clientesAtrasados, totalAberto: r2(aberto),
      inadimplencia: venc90 ? Math.max(0, Math.min(100, Math.round((1 - pago90 / venc90) * 100))) : 0, contratosMes: contratosMes, exitosAbertos: exitos },
    previsao: fut.map(function (m) { return { mes: m, valor: previsto[m] }; }),
    porArea: Object.keys(porArea).map(function (k) { return { area: k, valor: porArea[k] }; }).sort(function (a, b) { return b.valor - a.valor; }),
    devedores: Object.keys(devedores).map(function (k) { return devedores[k]; }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 8),
    faixas: resumo.faixas
  };
}

/* ================================================================== */
/* Calculadoras (servidor: prazo com feriados e índices do Banco Central) */
/* ================================================================== */
function calcPrazo_(d) {
  var ini = String(d.inicio || ''), dias = parseInt(d.dias, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !(dias > 0 && dias <= 3650)) throw falha_('Informe a data da intimação/ciência e o número de dias.');
  var fer = mapaFeriados_(), trib = String(d.tribunal || '');
  var fatal = calcularFatal_(ini, dias, d.contagem === 'corridos' ? 'corridos' : 'uteis', trib, fer);
  var pulados = [], dia = ini;
  while (dia < fatal && pulados.length < 60) { dia = somarDias_(dia, 1); if (!ehUtil_(dia, trib, fer, d.contagem === 'corridos')) pulados.push(dia); }
  var nomes = {};
  try { tabela_('Feriados').linhas.forEach(function (f) { nomes[f.data] = f.descricao; }); } catch (e) { /* segue */ }
  FERIADOS_BASE.forEach(function (f) { nomes[f[0]] = nomes[f[0]] || f[1]; });
  return { fatal: fatal, pulados: pulados.map(function (x) { var w = new Date(x + 'T12:00:00Z').getUTCDay(); return { data: x, motivo: nomes[x] || (w === 0 ? 'domingo' : w === 6 ? 'sábado' : (x.slice(5) >= '12-20' || x.slice(5) <= '01-20' ? 'recesso forense (20/12 a 20/01)' : 'sem expediente')) }; }) };
}
var SERIES_BCB = { ipca: 433, inpc: 188, ipcae: 10764, selic: 4390, igpm: 189 };
function calcIndices_(d) {
  var serie = SERIES_BCB[d.serie];
  if (!serie) throw falha_('Índice inválido.');
  var de = String(d.de || ''), ate = String(d.ate || '');
  if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate) || de > ate) throw falha_('Informe o mês inicial e o final.');
  var k = 'bcb_' + serie + '_' + de + '_' + ate, cache = CacheService.getScriptCache(), c = cache.get(k);
  if (c) return JSON.parse(c);
  var url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + serie + '/dados?formato=json&dataInicial=01/' + de.slice(5) + '/' + de.slice(0, 4) + '&dataFinal=28/' + ate.slice(5) + '/' + ate.slice(0, 4);
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  if (r.getResponseCode() !== 200) throw falha_('O Banco Central não respondeu agora (código ' + r.getResponseCode() + '). Tente de novo em alguns minutos.');
  var lista = [];
  try { lista = JSON.parse(r.getContentText()).map(function (x) { var p = String(x.data).split('/'); return { mes: p[2] + '-' + p[1], valor: parseFloat(String(x.valor).replace(',', '.')) }; }); } catch (e) { throw falha_('Resposta estranha do Banco Central.'); }
  var res = { serie: d.serie, itens: lista };
  try { cache.put(k, JSON.stringify(res), 21600); } catch (e2) { /* segue */ }
  return res;
}


/* ================================================================== */
/* 8.13 — Chatbot do WhatsApp (API oficial do Meta / WhatsApp Cloud)   */
/* ================================================================== */
/*
 * Caminho de uma mensagem: cliente → WhatsApp (Meta) → "ponte" na Cloudflare (chatbot/worker.js: confere a assinatura do Meta e
 * responde 200 na hora) → rota pública whats.webhook (confere a chave da ponte) → aqui. A resposta sai pela API do Meta (UrlFetchApp).
 * Tudo fica nas abas Conversas e Mensagens; o contato entra no CRM / Funil. O robô NUNCA dá parecer, preço de causa nem prazo:
 * informa, faz a triagem, marca a consulta (a equipe confirma) e passa para uma pessoa quando é urgente ou quando pedem.
 * Chaves só nas Propriedades do script: WHATS_TOKEN (token do Meta) e WHATS_PONTE_CHAVE (segredo entre a ponte e o painel).
 */
var WHATS_API = 'https://graph.facebook.com/';
function whatsVersao_() { return config_('WHATS_API_VERSAO') || 'v21.0'; }
function whatsToken_() { return PropertiesService.getScriptProperties().getProperty('WHATS_TOKEN') || ''; }
function whatsLigado_() { return config_('WHATS_BOT') === 'sim' && !!whatsToken_() && !!config_('WHATS_PHONE_ID'); }
var URGENTE_WHATS = /\b(pres[oa]|pris[aã]o|flagrante|delegacia|algemad|mandado de pris|pol[ií]cia (me|o|a) lev|audi[eê]ncia (hoje|amanh[aã])|per[ií]cia (hoje|amanh[aã])|prazo (vence|acaba|termina) (hoje|amanh[aã])|liminar|despejo|bloqueio de conta|penhora|oficial de justi[cç]a (aqui|est[aá])|urgente|urg[eê]ncia|socorro)\b/i;
var PEDE_HUMANO = /\b(falar com (a |o )?(dra|doutora|advogad|atendente|algu[eé]m|pessoa|humano)|quero (uma )?pessoa|n[aã]o quero (falar com )?rob[oô]|atendente humano)\b/i;
var PEDE_PROCESSO = /\b(meu processo|andamento|como (est[aá]|anda|ficou) (o|meu) (processo|caso|a[cç][aã]o)|novidade(s)? (do|no) (processo|caso)|acompanhar (o )?processo|n[uú]mero do processo)\b/i;

function horarioEscritorio_(d) {
  d = d || new Date();
  var hora = +Utilities.formatDate(d, TZ, 'H'), min = +Utilities.formatDate(d, TZ, 'm'), dsem = +Utilities.formatDate(d, TZ, 'u');
  var hm = hora * 60 + min, dia = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  var feriado = false; try { feriado = !!mapaFeriados_()[dia]; } catch (e) { /* segue */ }
  return dsem <= 5 && !feriado && ((hm >= 480 && hm < 720) || (hm >= 810 && hm < 1080));
}

/* ---------- Envio pela API do Meta ---------- */
function whatsEnviar_(para, texto) {
  var resp = UrlFetchApp.fetch(WHATS_API + whatsVersao_() + '/' + config_('WHATS_PHONE_ID') + '/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + whatsToken_() },
    payload: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(para).replace(/\D/g, ''), type: 'text', text: { preview_url: true, body: String(texto).slice(0, 4000) } })
  });
  var j = {}; try { j = JSON.parse(resp.getContentText()); } catch (e) { /* segue */ }
  if (resp.getResponseCode() !== 200) {
    var msg = j.error ? (j.error.message || '') + (j.error.code ? ' (código ' + j.error.code + ')' : '') : 'código ' + resp.getResponseCode();
    setConfig_('WHATS_ERRO', new Date().toISOString() + ' ' + msg.slice(0, 300), 'Último problema ao mandar mensagem pelo WhatsApp');
    if (j.error && (j.error.code === 131047 || /24 hours|re-engagement/i.test(j.error.message || ''))) throw falha_('Passaram mais de 24 horas da última mensagem do cliente: o WhatsApp só deixa responder com um modelo aprovado. Mande pelo seu WhatsApp ou peça para o cliente escrever de novo.');
    throw falha_('O WhatsApp não aceitou a mensagem: ' + msg.slice(0, 200));
  }
  return ((j.messages || [])[0] || {}).id || '';
}
function whatsMarcarLida_(waId) {
  try { UrlFetchApp.fetch(WHATS_API + whatsVersao_() + '/' + config_('WHATS_PHONE_ID') + '/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + whatsToken_() }, payload: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waId }) }); } catch (e) { /* tanto faz */ }
}
/** Áudio do cliente: baixa do Meta e transcreve com o Gemini (mensagem de voz é o mais comum no WhatsApp). */
function whatsTranscreverAudio_(mediaId, mime) {
  var t = whatsToken_();
  var info = UrlFetchApp.fetch(WHATS_API + whatsVersao_() + '/' + mediaId, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + t } });
  if (info.getResponseCode() !== 200) return '';
  var url = (JSON.parse(info.getContentText()) || {}).url; if (!url) return '';
  var arq = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + t } });
  if (arq.getResponseCode() !== 200) return '';
  var bytes = arq.getContent(); if (bytes.length > 15 * 1048576) return '';
  var r = geminiTexto_([{ inline_data: { mime_type: String(mime || 'audio/ogg').replace(/;.*$/, ''), data: Utilities.base64Encode(bytes) } },
    { text: 'Transcreva em português do Brasil, palavra por palavra, este áudio de WhatsApp de uma pessoa falando com um escritório de advocacia. Responda só com o texto falado.' }], { max: 3000, temp: 0 });
  return String(r.texto || '').trim();
}

/* ---------- Conversas e mensagens ---------- */
function conversaDoTelefone_(tel, nomePerfil) {
  var t = tabela_('Conversas'), c = t.linhas.filter(function (x) { return x.telefone === tel; })[0], agora = new Date().toISOString();
  if (c) return c;
  var dig = tel.replace(/\D/g, '').slice(-8);
  var cli = tabela_('Clientes').linhas.filter(function (x) { var d = String(x.telefone || '').replace(/\D/g, ''); return d.length >= 8 && d.indexOf(dig) >= 0; })[0];
  c = { id: novoId_('W'), telefone: tel, nome: nomeProprio_(String(nomePerfil || '').slice(0, 80)), cliente_id: cli ? cli.id : '', lead_id: '', estado: 'robo', ultima_em: agora, ultima_msg: '',
    nao_lidas: '0', atendente: '', pausado_ate: '', criado_em: agora, resumo: '', dados: '{}', ultima_cliente_em: '' };
  inserirLinha_(t, c);
  return c;
}
/** Grava mudanças na conversa relendo a linha na hora (o objeto antigo apagaria o que outra parte acabou de gravar, ex.: a pausa do robô). */
function atualizarConversa_(id, m) {
  return comTrava_(function () { var t = tabela_('Conversas'), x = t.linhas.filter(function (r) { return r.id === id; })[0]; if (x) atualizarLinha_(t, x, m); return x; });
}
function registrarMsg_(conversa, direcao, tipo, texto, waId, autor) {
  inserirLinha_(tabela_('Mensagens'), { id: novoId_('M'), conversa_id: conversa.id, quando: new Date().toISOString(), direcao: direcao, tipo: tipo || 'texto',
    texto: String(texto || '').slice(0, 20000), wa_id: waId || '', autor: autor || '' });
}
function historicoConversa_(convId, n) {
  return tabela_('Mensagens').linhas.filter(function (m) { return m.conversa_id === convId; }).slice(-(n || 14))
    .map(function (m) { return (m.direcao === 'entrada' ? 'Cliente' : 'Escritório') + ': ' + String(m.texto || '').slice(0, 800); }).join('\n');
}

/* ---------- Webhook (chamado pela ponte) ---------- */
function whatsWebhook_(d) {
  var chave = PropertiesService.getScriptProperties().getProperty('WHATS_PONTE_CHAVE') || '';
  if (!chave || !iguais_(String(d.chave || ''), chave)) throw falha_('Não autorizado.');
  var corpo = d.corpo || {}, feitos = 0;
  (corpo.entry || []).forEach(function (en) {
    (en.changes || []).forEach(function (ch) {
      var v = ch.value || {};
      if (v.metadata && config_('WHATS_PHONE_ID') && String(v.metadata.phone_number_id) !== String(config_('WHATS_PHONE_ID'))) return;
      var nomes = {}; (v.contacts || []).forEach(function (c) { nomes[c.wa_id] = (c.profile || {}).name || ''; });
      (v.messages || []).forEach(function (m) { try { whatsReceber_(m, nomes[m.from] || ''); feitos++; } catch (e) { registrar_('whatsapp', 'erro no robô', String(e && e.message || e).slice(0, 300)); } });
      // número usado também no aplicativo do celular (coexistência): a resposta dada pelo celular entra na conversa e pausa o robô por 3 h
      (v.message_echoes || []).forEach(function (m) { try { whatsEcoCelular_(m); } catch (e) { /* segue */ } });
      (v.statuses || []).forEach(function (s) { if (s.status === 'failed') setConfig_('WHATS_ERRO', new Date().toISOString() + ' entrega falhou: ' + JSON.stringify((s.errors || [])[0] || {}).slice(0, 250), 'Último problema ao mandar mensagem pelo WhatsApp'); });
    });
  });
  setConfig_('WHATS_ULTIMA', new Date().toISOString(), 'Última mensagem recebida pelo robô do WhatsApp');
  return { ok: true, feitos: feitos };
}
function whatsEcoCelular_(m) {
  comTrava_(function () {
    var tel = String(m.to || '').replace(/\D/g, ''); if (!tel) return;
    var c = conversaDoTelefone_(tel, '');
    if (tabela_('Mensagens').linhas.some(function (x) { return x.wa_id && x.wa_id === m.id; })) return;
    registrarMsg_(c, 'saida', m.type || 'texto', (m.text || {}).body || '[' + (m.type || 'mensagem') + ' enviada pelo celular]', m.id, 'celular');
    atualizarConversa_(c.id, { estado: 'humano', pausado_ate: new Date(Date.now() + 3 * 3600000).toISOString(), ultima_em: new Date().toISOString() });
  });
}

/** Uma mensagem do cliente: guarda, entende e responde (ou deixa para a equipe). */
function whatsReceber_(m, nomePerfil) {
  var tel = String(m.from || '').replace(/\D/g, '');
  if (!tel || m.type === 'reaction' || m.type === 'system' || m.type === 'unsupported') return;
  var texto = '', tipo = m.type || 'text';
  if (tipo === 'text') texto = (m.text || {}).body || '';
  else if (tipo === 'button') texto = (m.button || {}).text || '';
  else if (tipo === 'interactive') texto = ((m.interactive || {}).button_reply || (m.interactive || {}).list_reply || {}).title || '';
  else if (tipo === 'audio') { try { texto = whatsTranscreverAudio_((m.audio || {}).id, (m.audio || {}).mime_type); } catch (e) { texto = ''; } texto = texto ? '🎤 ' + texto : '[áudio que não consegui ouvir]'; }
  else if (/image|document|video|sticker|location|contacts/.test(tipo)) texto = '[' + ({ image: 'foto', document: 'documento', video: 'vídeo', sticker: 'figurinha', location: 'localização', contacts: 'contato' }[tipo] || tipo) + ' enviado(a)]' + ((m[tipo] || {}).caption ? ' ' + m[tipo].caption : '') + ((m.document || {}).filename ? ' ' + m.document.filename : '');
  var conv, novo = false;
  var ja = comTrava_(function () {
    if (tabela_('Mensagens').linhas.some(function (x) { return x.wa_id && x.wa_id === m.id; })) return true; // o Meta reenviou
    var t = tabela_('Conversas');
    novo = !t.linhas.some(function (x) { return x.telefone === tel; });
    conv = conversaDoTelefone_(tel, nomePerfil);
    registrarMsg_(conv, 'entrada', tipo, texto, m.id, 'cliente');
    conv = atualizarConversa_(conv.id, { ultima_em: new Date().toISOString(), ultima_cliente_em: new Date().toISOString(), ultima_msg: texto.slice(0, 200),
      nao_lidas: String((+conv.nao_lidas || 0) + 1), nome: conv.nome || nomeProprio_(String(nomePerfil || '').slice(0, 80)) }) || conv;
    return false;
  });
  if (ja) return;
  whatsMarcarLida_(m.id);
  if (config_('WHATS_BOT') !== 'sim') return; // robô desligado: só guarda para a equipe responder pelo painel
  var pausa = conv.pausado_ate && conv.pausado_ate > new Date().toISOString();
  if (conv.estado === 'humano' && (pausa || !conv.pausado_ate)) { whatsAvisarEquipe_(conv, texto, false); return; }
  // freio: no máximo 25 respostas do robô por hora para o mesmo número (evita conversa infinita com outro robô)
  var cache = CacheService.getScriptCache(), kq = 'wq_' + tel, q = +(cache.get(kq) || 0);
  if (q >= 25) return; cache.put(kq, String(q + 1), 3600);
  var resposta = whatsCerebro_(conv, texto, tipo, novo);
  if (!resposta) return;
  var waId = whatsEnviar_(tel, resposta);
  comTrava_(function () { registrarMsg_(conv, 'saida', 'texto', resposta, waId, 'robô'); atualizarConversa_(conv.id, { ultima_em: new Date().toISOString(), ultima_msg: resposta.slice(0, 200) }); });
}

/** Avisa a equipe (tarefa + e-mail, no máximo 1 a cada 30 min por conversa). */
function whatsAvisarEquipe_(conv, texto, urgente) {
  var cache = CacheService.getScriptCache(), k = 'wav_' + conv.id;
  if (cache.get(k) && !urgente) return; cache.put(k, '1', 1800);
  var resp = config_('WHATS_RESP') || config_('RESP_SITE') || respSecretaria_() || '';
  var agora = new Date().toISOString();
  comTrava_(function () {
    inserirLinha_(tabela_('Tarefas'), { id: novoId_('T'), titulo: (urgente ? '🚨 URGENTE no WhatsApp — ' : '💬 Responder no WhatsApp — ') + (conv.nome || conv.telefone),
      descricao: 'Mensagem: ' + String(texto).slice(0, 600) + '\n\nAbrir: Relacionamento › Conversas do WhatsApp (o robô está pausado nesta conversa).', responsavel: resp, processo_id: '', numero: '', cliente_id: conv.cliente_id || '',
      vence_em: hojeSP_(), etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '', historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' robô do WhatsApp',
      criado_em: agora, criado_por: 'whatsapp', atualizado_em: agora, atualizado_por: 'whatsapp', prioridade: urgente ? 'urgente' : 'alta' });
  });
  if (urgente) try { GmailApp.sendEmail(config_('CONTATO_EMAIL') || Session.getEffectiveUser().getEmail(), '🚨 WhatsApp urgente: ' + (conv.nome || conv.telefone),
    'O robô do WhatsApp passou para a equipe uma mensagem URGENTE:\n\n' + String(texto).slice(0, 1500) + '\n\nTelefone: ' + conv.telefone + '\nResponder: https://araujoadvocaciasc.com.br/painel/#/conversas', { name: 'Robô do WhatsApp — Araújo Advocacia' }); } catch (e) { /* segue */ }
}

/** Base do que o robô pode dizer: só fatos do escritório (o guia do cliente dos Padrões operacionais + dados fixos). */
function baseConhecimentoWhats_() {
  var c = CacheService.getScriptCache(), k = 'whats_base_' + versaoDados_().slice(-6), b = c.get(k);
  if (b) return b;
  var esc = escritorio_(), guia = '';
  try { guia = padroesListar_().itens.filter(function (x) { return x.grupo === 'cliente'; }).map(function (x) { return '### ' + x.titulo + '\n' + x.texto; }).join('\n\n'); } catch (e) { guia = ''; }
  b = ['ESCRITÓRIO: Araújo Advocacia (' + esc.nome + '), Tubarão/SC. Advogada responsável: Dra. Júlian Marcelino Araújo, OAB/SC 54.832, doutora em Direito. Atende com Luís Fernando.',
    'ENDEREÇO: ' + esc.endereco + ' (em frente à nova rodoviária). TELEFONE: ' + esc.telefone + '. SITE: araujoadvocaciasc.com.br',
    'HORÁRIO: segunda a sexta, das 8h às 12h e das 13h30 às 18h. Atendimento presencial ou por vídeo, com horário marcado.',
    'ÁREAS: trabalhista, previdenciário (INSS), família (divórcio, pensão, guarda, inventário), cível e consumidor (bancos, contratos, indenizações), empresarial (assessoria a empresas) e criminal.',
    'ACOMPANHE: o cliente com processo vê a etapa e as movimentações em araujoadvocaciasc.com.br/acompanhe com CPF e código de 8 caracteres enviado pelo escritório.',
    'CALCULADORAS GRATUITAS: araujoadvocaciasc.com.br/calculadoras (prazo para ação trabalhista e estimativa de rescisão).',
    'HONORÁRIOS: combinados por escrito depois da conversa inicial, conforme a Tabela de Honorários da OAB/SC. O robô NÃO informa valores.',
    guia ? 'GUIA DO CLIENTE:\n' + guia.slice(0, 9000) : ''].filter(Boolean).join('\n');
  try { c.put(k, b, 21600); } catch (e) { /* segue */ }
  return b;
}

/* ---------- 8.16: primeiro atendimento completo (pedido da usuária) ----------
 * Fluxo: saudação → entender o caso (2–3 perguntas) → dizer em termos GERAIS como o escritório ajuda → oferecer horários LIVRES da
 * agenda → marcar sozinho na agenda ATENDIMENTOS → mandar o link do cadastro → passar para a equipe (tarefa). O resto é com a equipe.
 * Fases em Conversas.dados.fase: triagem → oferta (dados.slots) → agendado (dados.agendado). Remarcar/cancelar, financeiro, urgência,
 * cliente antigo, fornecedor/currículo e parte contrária têm caminho próprio. Nunca dá parecer, valores nem prazos (Provimento 205). */
var SAUDACAO_WHATS = /^[\s,!.?]*(?:(?:oi+e?|ol[aá]+|opa|e a[ií]|bom dia|boa tarde|boa noite|tudo (?:bem|bom|certo|joia)|td (?:bem|bom)|blz|beleza|al[oô]+|hello|hi|como vai|doutora|dra\.?|pessoal|gente|boa)[\s,!.?😊🙂👋🙏]*)+$/i;
var REMARCAR_WHATS = /\b(remarcar|reagendar|mudar (o )?hor[aá]rio|trocar (o )?hor[aá]rio|outro hor[aá]rio|outro dia|n[aã]o (vou|vai|irei) (poder|dar|conseguir)|n[aã]o consigo (ir|nesse|neste)|imprevisto)\b/i;
var CANCELAR_WHATS = /\b(desmarcar|cancelar|cancela|n[aã]o (preciso|quero) mais|desisti)\b/i;
var FINANCEIRO_WHATS = /\b(boleto|parcela|pagamento|paguei|pagar a|comprovante|segunda via|2a via|recibo|nota fiscal|em atraso)\b/i;
var ROBO_WHATS = { usuario: 'whatsapp', nome: 'Robô do WhatsApp', perfil: 'administrador' };
var DIAS_CURTO = ['', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

function quemAtende_() { return config_('WHATS_QUEM') || 'a Dra. Júlian'; }
function duracaoAtendimento_() { var n = +(config_('WHATS_DURACAO') || 30); return n >= 15 && n <= 120 ? n : 30; }
function hhmm_(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
function msSlot_(dia, hora) { return Date.parse(dia + 'T' + hora + ':00-03:00'); }

/** Agendas que contam como "ocupado": as do escritório + a principal da conta (compromissos da Dra.). */
function agendasOcupacao_() {
  var cals = [], vistos = {};
  var junta = function (c) { try { if (c && !vistos[c.getId()]) { vistos[c.getId()] = 1; cals.push(c); } } catch (e) { /* segue */ } };
  try { var ids = agendas_(); Object.keys(ids).forEach(function (k) { try { junta(CalendarApp.getCalendarById(ids[k])); } catch (e) { /* segue */ } }); } catch (e) { /* segue */ }
  try { junta(CalendarApp.getDefaultCalendar()); } catch (e) { /* segue */ }
  return cals;
}
function ocupacao_(ini, fim) {
  var oc = [];
  agendasOcupacao_().forEach(function (c) {
    try { c.getEvents(new Date(ini), new Date(fim)).forEach(function (ev) { if (ev.isAllDayEvent && ev.isAllDayEvent()) return; oc.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]); }); } catch (e) { /* segue */ }
  });
  return oc;
}
/** Horários livres para o atendimento: dias úteis, 8h–12h e 13h30–18h, sem bater com nada das agendas, com antecedência mínima.
 *  opc: { qtd, desde (ms), dia ('aaaa-mm-dd'), periodo ('manha'|'tarde') } */
function horariosLivres_(opc) {
  opc = opc || {};
  var qtd = opc.qtd || 4, dur = duracaoAtendimento_(), passo = 30, ante = +(config_('WHATS_ANTECEDENCIA_MIN') || 60);
  var inicio = Math.max(Date.now() + ante * 60000, opc.desde || 0), diasMax = +(config_('WHATS_DIAS_AGENDA') || 10);
  var oc = ocupacao_(inicio, inicio + (diasMax + 4) * 86400000), feriados = {};
  try { feriados = mapaFeriados_(); } catch (e) { /* segue */ }
  var janelas = [[480, 720], [810, 1080]], todos = [];
  for (var i = 0; i < diasMax + 4 && todos.length < 60; i++) {
    var dd = new Date(inicio + i * 86400000), dia = Utilities.formatDate(dd, TZ, 'yyyy-MM-dd'), dsem = +Utilities.formatDate(dd, TZ, 'u');
    if (dsem > 5 || feriados[dia] || (opc.dia && dia !== opc.dia)) continue;
    janelas.forEach(function (j, ji) {
      if (opc.periodo === 'manha' && ji) return; if (opc.periodo === 'tarde' && !ji) return;
      for (var m = j[0]; m + dur <= j[1]; m += passo) {
        var t = msSlot_(dia, hhmm_(m)), f = t + dur * 60000;
        if (t < inicio || oc.some(function (o) { return o[0] < f && o[1] > t; })) continue;
        todos.push({ dia: dia, hora: hhmm_(m), dsem: dsem });
      }
    });
  }
  // variedade: os 2 mais cedo e depois o primeiro de cada período (manhã/tarde) seguinte
  if (opc.dia || opc.periodo) return todos.slice(0, qtd);
  var esc = [], vistos = {};
  todos.forEach(function (s) { if (esc.length >= qtd) return; var per = s.dia + (s.hora < '12:30' ? 'm' : 't'); if (esc.length < 2 || !vistos[per]) { esc.push(s); vistos[per] = 1; } });
  return esc;
}
function slotLivre_(dia, hora) {
  var t = msSlot_(dia, hora), f = t + duracaoAtendimento_() * 60000;
  return !ocupacao_(t - 60000, f + 60000).some(function (o) { return o[0] < f && o[1] > t; });
}
function rotuloSlot_(s) {
  var hoje = hojeSP_(), amanha = somarDias_(hoje, 1), h = s.hora.replace(/^0/, '').replace(':00', 'h').replace(/^(\d+):(\d+)$/, '$1h$2');
  if (s.dia === hoje) return 'hoje, às ' + h;
  if (s.dia === amanha) return 'amanhã (' + DIAS_CURTO[s.dsem || +Utilities.formatDate(new Date(msSlot_(s.dia, s.hora)), TZ, 'u')] + '), às ' + h;
  return DIAS_CURTO[s.dsem || +Utilities.formatDate(new Date(msSlot_(s.dia, s.hora)), TZ, 'u')] + ' ' + s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7) + ', às ' + h;
}
function textoSlots_(slots, nome1) {
  return 'Tenho estes horários para você conversar com ' + quemAtende_() + ':\n' + slots.map(function (s, i) { return (i + 1) + ') ' + rotuloSlot_(s); }).join('\n') +
    '\n\nÉ só responder com o número. Pode ser por ligação, por vídeo ou aqui no escritório: me diga qual prefere. Se nenhum servir, me diga o melhor dia e período.';
}
function modoDoTexto_(t) {
  t = normalizar_(t);
  if (/video|chamada de video|videochamada|meet|zoom/.test(t)) return 'video';
  if (/presencial|pessoalmente|no escritorio|ir ai|ir até|ir ate|vou ai|ai no escritorio/.test(t)) return 'presencial';
  if (/ligac|liga(r|m)? pra mim|me liga|telefone|por chamada|ligacao/.test(t)) return 'ligacao';
  return '';
}
var NOME_MODO = { ligacao: 'por ligação', video: 'por vídeo', presencial: 'no escritório' };
/** Lê a escolha da pessoa entre os horários oferecidos ("2", "a segunda", "14h30", "amanhã às 9"). */
function escolhaDoSlot_(texto, slots) {
  if (!slots || !slots.length) return null;
  var t = normalizar_(texto);
  // só o número (com "por vídeo"/"no escritório" ao lado) ou "opção 2": "daqui 3 dias" NÃO é escolha
  var m = t.match(/^\s*(?:(?:a|o|pode ser (?:a|o)|quero (?:a|o)|opcao|numero|horario)\s*)?(?:n[ºo.]?\s*)?([1-6])\s*[).]?\s*(?:[,e-]\s*)?(?:(?:por|pelo|pela|no|na|de)\s*)?(?:video|ligacao|telefone|escritorio|presencial|chamada|pessoalmente|whats(?:app)?)?\s*(?:por favor|pfv|pf|obrigad[oa])?[\s.!]*$/) ||
    t.match(/\b(?:opcao|numero|horario)\s*(?:n[ºo.]?\s*)?([1-6])\b/);
  if (m && slots[+m[1] - 1]) return slots[+m[1] - 1];
  var ord = [['primeir', 1], ['segund', 2], ['terceir', 3], ['quart', 4]];
  for (var i = 0; i < ord.length; i++) if (new RegExp('\\b(o|a|pode ser o|pode ser a|quero o|quero a)?\\s*' + ord[i][0] + '[oa]\\b').test(t) && slots[ord[i][1] - 1] && !/primeira vez|segunda[- ]feira|quarta[- ]feira/.test(t)) return slots[ord[i][1] - 1];
  var hm = t.match(/\b(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/) || t.match(/\bas (\d{1,2})\b/);
  if (hm) {
    var hh = +hm[1]; if (hh >= 1 && hh <= 6) hh += 12;
    var hora = ('0' + hh).slice(-2) + ':' + (hm[2] || '00');
    var cand = slots.filter(function (s) { return s.hora === hora; });
    if (/\bhoje\b/.test(t)) cand = cand.filter(function (s) { return s.dia === hojeSP_(); });
    if (/\bamanha\b/.test(t)) cand = cand.filter(function (s) { return s.dia === somarDias_(hojeSP_(), 1); });
    if (cand.length === 1) return cand[0];
  }
  return null;
}

/** Marca o atendimento: confere de novo se o horário está livre, cria o evento, atualiza o funil, gera o cadastro e avisa a equipe. */
function whatsMarcar_(conv, slot, modo, dados, sim) {
  var modoTxt = NOME_MODO[modo] || 'por ligação', nome = conv.nome || ('WhatsApp ' + String(conv.telefone).slice(-4));
  if (sim) { sim.acoes.push('marcaria na agenda ATENDIMENTOS: ' + rotuloSlot_(slot) + ' (' + modoTxt + ')', 'mandaria o link do cadastro', 'criaria a tarefa "📅 Atendimento marcado" para a equipe'); return { ok: true, url: SITE_URL + '/cadastro/?c=EXEMPLO-DA-SIMULACAO', cadastro: !conv.cliente_id }; }
  if (msSlot_(slot.dia, slot.hora) < Date.now() + 15 * 60000 || !slotLivre_(slot.dia, slot.hora)) return { ok: false, ocupado: true };
  var ids = agendas_(), cal = ids.ATENDIMENTOS ? CalendarApp.getCalendarById(ids.ATENDIMENTOS) : null;
  if (!cal) return { ok: false, erro: 'agenda ATENDIMENTOS não encontrada' };
  var ini = new Date(msSlot_(slot.dia, slot.hora)), fim = new Date(ini.getTime() + duracaoAtendimento_() * 60000);
  var ev = cal.createEvent('Atendimento ' + modoTxt + ' — ' + nome + (dados.area ? ' (' + dados.area + ')' : ''), ini, fim, {
    location: modo === 'presencial' ? (escritorio_().endereco || 'Escritório') : modo === 'video' ? 'Por vídeo (mandar o link)' : 'Ligar para +' + conv.telefone,
    description: [dados.resumo ? 'Caso: ' + dados.resumo : '', dados.cidade ? 'Cidade: ' + dados.cidade : '', 'Telefone: +' + conv.telefone, 'Marcado pelo robô do WhatsApp em ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + '.'].filter(Boolean).join('\n') });
  // funil: garante o cartão, liga a conversa e grava a consulta
  crmDoWhats_(conv, { resumo: dados.resumo, area: dados.area, cidade: dados.cidade, intencao: 'novo_caso' });
  var c2 = tabela_('Conversas').linhas.filter(function (x) { return x.id === conv.id; })[0] || conv, url = '', leadId = c2.lead_id;
  var precisaCadastro = !c2.cliente_id || (function () { var cl = tabela_('Clientes').linhas.filter(function (x) { return x.id === c2.cliente_id; })[0]; return !cl || !cl.cpf_cnpj || !cl.endereco; })();
  var lAtual = leadId ? tabela_('Leads').linhas.filter(function (x) { return x.id === leadId; })[0] : null;
  var linkValendo = lAtual && lAtual.cadastro_token && lAtual.cadastro_ate > new Date().toISOString() && !lAtual.cadastro_em;
  if (leadId && precisaCadastro && !linkValendo) { try { url = crmLinkCadastro_({ id: leadId }, ROBO_WHATS).url; } catch (e) { url = ''; } }
  if (leadId) comTrava_(function () {
    var t = tabela_('Leads'), l = t.linhas.filter(function (x) { return x.id === leadId; })[0]; if (!l) return;
    atualizarLinha_(t, l, { consulta_em: slot.dia + 'T' + slot.hora, temperatura: 'quente', proxima_acao: '📅 Atendimento ' + modoTxt + ' em ' + dataBR_(slot.dia).slice(0, 5) + ' às ' + slot.hora, proxima_data: slot.dia,
      atualizado_em: new Date().toISOString(), atualizado_por: 'robô', historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(null, 'WhatsApp (robô): atendimento marcado para ' + dataBR_(slot.dia) + ' ' + slot.hora + ' ' + modoTxt + (url ? ' + link do cadastro' : '')) });
  });
  var resp = config_('WHATS_RESP') || config_('RESP_SITE') || respSecretaria_() || '', agora = new Date().toISOString();
  comTrava_(function () {
    inserirLinha_(tabela_('Tarefas'), { id: novoId_('T'), titulo: '📅 Atendimento ' + modoTxt + ' — ' + nome + ' — ' + dataBR_(slot.dia).slice(0, 5) + ' ' + slot.hora,
      descricao: 'Marcado pelo robô do WhatsApp.\n' + (dados.resumo ? 'Caso: ' + dados.resumo + '\n' : '') + (dados.area ? 'Área: ' + dados.area + '\n' : '') + 'Telefone: +' + conv.telefone +
        (modo === 'video' ? '\nMandar o link da chamada de vídeo um pouco antes.' : modo === 'ligacao' || !modo ? '\nLigar para a pessoa no horário.' : '') + (url ? '\nO link do cadastro já foi mandado.' : ''),
      responsavel: resp, processo_id: '', numero: '', cliente_id: c2.cliente_id || '', vence_em: slot.dia, etapa: 'afazer', peso: '1', situacao: 'ativa', concluida_por: '', concluida_em: '',
      historico: Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' robô do WhatsApp', criado_em: agora, criado_por: 'whatsapp', atualizado_em: agora, atualizado_por: 'whatsapp', prioridade: 'alta' });
  });
  registrar_('whatsapp', 'atendimento marcado', (c2.cliente_id || c2.telefone) + ' ' + slot.dia + ' ' + slot.hora + ' ' + modoTxt);
  return { ok: true, evento: ev.getId(), url: url, cadastro: !!url, cadastroJa: !url && !!linkValendo };
}
function whatsDesmarcar_(dados, sim) {
  if (sim || !dados.agendado || !dados.agendado.evento) return;
  try { var ids = agendas_(); var ev = CalendarApp.getCalendarById(ids.ATENDIMENTOS).getEventById(dados.agendado.evento); if (ev) ev.deleteEvent(); } catch (e) { /* segue */ }
}
function confirmacaoAtendimento_(slot, modo, r, nome1) {
  var esc = escritorio_();
  var como = modo === 'video' ? 'por vídeo: mandamos o link um pouco antes' : modo === 'presencial' ? 'aqui no escritório (' + (esc.endereco || 'Tubarão/SC') + ', em frente à nova rodoviária)' : 'por ligação: ' + quemAtende_() + ' liga para este número';
  return 'Pronto' + (nome1 ? ', ' + nome1 : '') + '! Seu atendimento ficou marcado para ' + rotuloSlot_(slot) + ', ' + como + '.' +
    (r.cadastro && r.url ? '\n\nPara adiantar, preencha o seu cadastro neste link (leva uns 3 minutos e é seguro):\n' + r.url : r.cadastroJa ? '\n\nSe ainda não preencheu o cadastro, o link que mandei continua valendo.' : '') +
    '\n\nSe precisar remarcar, é só me avisar por aqui.';
}

var WHATS_SISTEMA = 'Você é a assistente virtual do escritório Araújo Advocacia (Tubarão/SC) e faz o PRIMEIRO ATENDIMENTO no WhatsApp, como a recepção de um escritório de advocacia experiente. ' +
  'OBJETIVO: acolher, entender o caso em poucas perguntas, mostrar em termos gerais como o escritório pode ajudar e levar a pessoa a marcar um atendimento com a advogada. Análise, parecer e contrato são da equipe. ' +
  'ESTILO: português do Brasil, cordial, seguro e profissional; frases curtas; no máximo 3 frases (até ~450 caracteres); UMA pergunta por vez; chame pelo primeiro nome quando souber; no máximo 1 emoji; sem juridiquês e sem listas. ' +
  'COMO CONDUZIR: 1) Entender: o que aconteceu, desde quando e a cidade, com no máximo 2 ou 3 perguntas no total; não pergunte de novo o que a pessoa já contou. ' +
  '2) Quando entender o essencial (caso_entendido=true), diga em termos GERAIS e no condicional o que o escritório costuma verificar nesse tipo de situação (ex.: "Nesses casos, a Dra. costuma conferir as verbas da rescisão, o FGTS e as horas extras"), sem afirmar que a pessoa tem direito, e convide para um atendimento com a advogada por ligação, vídeo ou no escritório. ' +
  '3) Se a pessoa aceitar ou pedir para marcar, quer_atendimento=true e a resposta é UMA frase curta de transição (os horários livres são mandados pelo sistema logo depois; não invente horários). ' +
  '4) Se HORÁRIOS OFERECIDOS aparecerem abaixo e a pessoa escolher um, informe o número em "escolha"; se pedir outro dia/horário, use "dia_preferido" (aaaa-mm-dd), "periodo" (manha|tarde) e/ou "outro_horario" (aaaa-mm-ddTHH:MM), convertendo "amanhã", "quinta" etc. a partir de HOJE. ' +
  '5) Valores: honorários são combinados por escrito depois do atendimento, conforme a tabela da OAB/SC; nunca diga números. ' +
  'NUNCA: dar parecer, dizer se tem ou não direito, prometer resultado, falar valores (de causa, indenização ou honorários), informar prazos processuais ou de prescrição, pedir CPF/RG/senha/dados bancários, fingir ser a advogada ou uma pessoa, julgar a pessoa ou comentar outros advogados. Para essas perguntas, diga que a Dra. responde com segurança no atendimento. ' +
  'CASOS ESPECIAIS: parte contrária de um cliente do escritório ou reclamação contra o escritório → conflito=true e chamar_equipe=true, sem discutir o caso. Fornecedor, propaganda, currículo, engano → intencao "outro". Cliente que já tem processo e pergunta do caso → intencao "caso_cliente". Pagamento, boleto, parcela → intencao "financeiro". ' +
  'Outra cidade ou estado → o atendimento pode ser por vídeo ou ligação. Mensagem agressiva → responda com calma e ofereça a equipe. Pessoa que não quer agora → respeite (nao_quer_agora=true) e diga que fica à disposição. Use SÓ as informações da BASE; o que não estiver nela, diga que confirma com a equipe. ' +
  'Responda SOMENTE em JSON: {"resposta": texto, "intencao": "novo_caso"|"agendar"|"processo"|"caso_cliente"|"financeiro"|"duvida"|"humano"|"outro", "nome": se disse, "cidade": se disse, ' +
  '"area": "Trabalhista"|"Previdenciário"|"Família"|"Cível"|"Consumidor"|"Criminal"|"Empresarial"|"", "resumo": o caso em até 2 frases (só o que a pessoa contou), "caso_entendido": true/false, "quer_atendimento": true/false, ' +
  '"nao_quer_agora": true/false, "modo": "ligacao"|"video"|"presencial"|"", "escolha": número ou null, "dia_preferido": "" , "periodo": "", "outro_horario": "", "chamar_equipe": true/false, "conflito": true/false}.';

function saudacaoHora_() { var h = +Utilities.formatDate(new Date(), TZ, 'H'); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function hojeExtenso_() { return ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'][+Utilities.formatDate(new Date(), TZ, 'u')] + ', ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + ' (data ISO ' + hojeSP_() + ')'; }

/** Decide a resposta. sim = { hist: [linhas], acoes: [] } no "Testar o robô" (nada é gravado, marcado nem enviado). */
function whatsCerebro_(conv, texto, tipo, novo, sim) {
  var nome1 = primeiroNomeTxt_(conv.nome), fora = !horarioEscritorio_();
  var dados = {}; try { dados = JSON.parse(conv.dados || '{}') || {}; } catch (e) { dados = {}; }
  var salvar = function (m) { if (m.dados && typeof m.dados !== 'string') m.dados = JSON.stringify(m.dados); if (sim) Object.assign(conv, m); else Object.assign(conv, atualizarConversa_(conv.id, m) || m); };
  var avisar = function (txt, urg) { if (sim) sim.acoes.push((urg ? '🚨 avisaria a equipe como URGENTE (tarefa + e-mail): ' : 'avisaria a equipe (tarefa): ') + String(txt).slice(0, 120)); else whatsAvisarEquipe_(conv, txt, urg); };
  var crm = function (info) { if (sim) { if (info.intencao !== 'outro') sim.acoes.push('atualizaria o cartão no CRM (' + (info.area || 'área a definir') + ')'); } else crmDoWhats_(conv, info); };
  var paraEquipe = function (msg, txtEquipe, urg) { salvar({ estado: 'humano', pausado_ate: '' }); avisar(txtEquipe || texto, urg); return msg; };
  var quando = fora ? ' no próximo horário de atendimento (seg. a sex., 8h–12h e 13h30–18h)' : ' em instantes';
  var t = String(texto || '').trim(), tn = normalizar_(t);

  // 1) urgência e pedido de pessoa: direto para a equipe
  if (URGENTE_WHATS.test(t) || PEDE_HUMANO.test(t)) {
    var urg = URGENTE_WHATS.test(t);
    crm({ resumo: t.slice(0, 200), intencao: urg ? 'urgente' : 'humano' });
    return paraEquipe((urg ? 'Entendi, é urgente. ' : '') + 'Já avisei a equipe' + (urg ? ' agora mesmo' : '') + ' e uma pessoa fala com você por aqui' + quando + '.' +
      (urg ? ' Se puder, mande numa mensagem o que aconteceu e onde você está.' : ''), t, urg);
  }
  // 2) consulta do processo: CPF + código (mesmas travas do Acompanhe)
  var cpf = (t.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) || [])[0], cod = (t.toUpperCase().match(/\b[A-Z0-9]{4}-?[A-Z0-9]{4}\b/) || [])[0];
  if (dados.aguarda_cpf && cpf && cod) {
    dados.aguarda_cpf = false; salvar({ dados: dados });
    if (sim) return '(consultaria o processo com o CPF e o código, como no Acompanhe)';
    try {
      var r = consultaCliente_({ cpf: cpf, codigo: cod });
      if (!r.processos.length) return 'Encontrei o seu cadastro, ' + r.nome + ', mas ainda não há processo em andamento no seu nome. Se tiver dúvida, me conte que eu chamo a equipe.';
      var linhas = r.processos.slice(0, 4).map(function (p) {
        return '• ' + (p.area || 'Processo') + (p.numero ? ' nº ' + p.numero : ' (em preparação)') + ': ' + (p.fase_nome || p.situacao) + (p.proximo ? '. Próximo compromisso: ' + p.proximo.ato + ' em ' + dataBR_(p.proximo.data) : '') +
          (p.movimentacao ? '. Última movimentação em ' + dataBR_(p.movimentacao) : '');
      });
      return 'Olá, ' + r.nome + '! Seus processos:\n' + linhas.join('\n') + '\n\nOs detalhes estão em araujoadvocaciasc.com.br/acompanhe. Quer que a Dra. Júlian explique algo? É só dizer.';
    } catch (e) { return 'Não consegui conferir com esses dados (' + String(e.message || '').replace(/\.$/, '') + '). Confira o CPF e o código de 8 caracteres que enviamos, ou peça para falar com a equipe.'; }
  }
  if (PEDE_PROCESSO.test(t) && !(cpf && cod)) {
    dados.aguarda_cpf = true; salvar({ dados: dados });
    return 'Claro' + (nome1 ? ', ' + nome1 : '') + '! Para eu consultar com segurança, me mande o seu CPF e o código de acesso de 8 caracteres que o escritório enviou (o mesmo do site araujoadvocaciasc.com.br/acompanhe). Se não tiver o código, me avise que eu peço para a equipe.';
  }
  // 3) financeiro: a equipe responde
  if (FINANCEIRO_WHATS.test(t) && (conv.cliente_id || /paguei|comprovante|boleto|segunda via|2a via|recibo/.test(tn))) {
    return paraEquipe('Certo' + (nome1 ? ', ' + nome1 : '') + '! Assuntos de pagamento a equipe confere com cuidado. Já passei para eles e te respondem por aqui' + quando + '.', '💰 Financeiro: ' + t, false);
  }
  // 4) atendimento já marcado: remarcar, cancelar ou só tirar dúvida
  if (dados.fase === 'agendado' && dados.agendado) {
    var ag = dados.agendado;
    if (CANCELAR_WHATS.test(t) && !REMARCAR_WHATS.test(t)) {
      whatsDesmarcar_(dados, sim); dados.fase = 'triagem'; dados.agendado = null; salvar({ dados: dados });
      avisar('Cancelou o atendimento de ' + dataBR_(ag.dia) + ' ' + ag.hora, false);
      return 'Tudo bem' + (nome1 ? ', ' + nome1 : '') + ', cancelei o atendimento de ' + rotuloSlot_(ag) + '. Quando quiser marcar de novo, é só me chamar por aqui.';
    }
    if (REMARCAR_WHATS.test(t)) {
      whatsDesmarcar_(dados, sim);
      var novos = horariosLivres_({ qtd: 4 });
      dados.fase = 'oferta'; dados.slots = novos; dados.agendado = null; salvar({ dados: dados });
      avisar('Pediu para remarcar o atendimento de ' + dataBR_(ag.dia) + ' ' + ag.hora, false);
      return novos.length ? 'Sem problema' + (nome1 ? ', ' + nome1 : '') + '! Desmarquei o horário de ' + rotuloSlot_(ag) + '. ' + textoSlots_(novos, nome1)
        : paraEquipe('Sem problema! Desmarquei o horário e a equipe vai te passar uma nova data por aqui' + quando + '.', 'Remarcar atendimento (sem horário livre na agenda)', false);
    }
  }
  if (dados.fase === 'oferta' && CANCELAR_WHATS.test(t) && !REMARCAR_WHATS.test(t)) {
    dados.fase = 'triagem'; dados.slots = []; salvar({ dados: dados });
    return 'Tudo bem' + (nome1 ? ', ' + nome1 : '') + '! Quando quiser marcar, é só me chamar por aqui.';
  }
  // 5) saudação sozinha ("oi", "bom dia, tudo bem?")
  var jaFalou = sim ? sim.hist.some(function (x) { return /^Escritório:/.test(x); }) : !novo;
  if (SAUDACAO_WHATS.test(t) && t.length <= 60) {
    if (dados.fase === 'agendado' && dados.agendado) return 'Olá' + (nome1 ? ', ' + nome1 : '') + '! Seu atendimento está marcado para ' + rotuloSlot_(dados.agendado) + '. Posso ajudar em mais alguma coisa?';
    if (dados.fase === 'oferta' && dados.slots && dados.slots.length) return 'Olá' + (nome1 ? ', ' + nome1 : '') + '! ' + textoSlots_(dados.slots, nome1);
    if (!dados.saudou) { dados.saudou = true; dados.fase = dados.fase || 'triagem'; salvar({ dados: dados });
      return saudacaoHora_() + (conv.cliente_id && nome1 ? ', ' + nome1 : '') + '! Aqui é a assistente virtual do escritório Araújo Advocacia. ' +
        (conv.cliente_id ? 'Como posso te ajudar hoje?' : 'Eu organizo o primeiro atendimento com ' + quemAtende_() + '. Como posso te ajudar?'); }
    if (jaFalou) return 'Olá' + (nome1 ? ', ' + nome1 : '') + '! Em que posso ajudar?';
  }
  // 6) escolha de horário sem precisar da IA ("2", "a primeira", "14h30")
  var modo = modoDoTexto_(t) || dados.modo || '';
  if (dados.fase === 'oferta' && dados.slots && dados.slots.length) {
    var esc = escolhaDoSlot_(t, dados.slots);
    if (esc) return marcarOuOferecer_(esc, modo);
  }
  // 7) IA: entende o caso e conduz
  var hist = sim ? sim.hist.join('\n') : historicoConversa_(conv.id, 16);
  var pedido = 'BASE DO ESCRITÓRIO:\n' + baseConhecimentoWhats_() + '\n\nHOJE: ' + hojeExtenso_() + '.\nSITUAÇÃO: ' + (jaFalou ? '' : 'conversa NOVA (primeira resposta: apresente-se como assistente virtual do escritório e diga que os dados são usados só para o atendimento, LGPD). ') +
    (conv.cliente_id ? 'Esta pessoa JÁ É CLIENTE do escritório. ' : 'Pessoa ainda não é cliente. ') + (fora ? 'Agora está FORA do horário da equipe, mas você pode marcar o atendimento normalmente. ' : '') +
    (conv.nome ? 'Nome no WhatsApp: ' + conv.nome + '. ' : '') + (dados.resumo ? 'O que já se sabe do caso: ' + dados.resumo + '. ' : '') +
    (dados.fase === 'oferta' && dados.slots && dados.slots.length ? '\nHORÁRIOS OFERECIDOS: ' + dados.slots.map(function (s, i) { return (i + 1) + ') ' + s.dia + ' ' + s.hora; }).join('; ') + '.' : '') +
    (dados.fase === 'agendado' && dados.agendado ? '\nJÁ TEM ATENDIMENTO MARCADO para ' + dados.agendado.dia + ' ' + dados.agendado.hora + ' (' + (NOME_MODO[dados.agendado.modo] || 'por ligação') + '): só tire dúvidas simples; o que for sobre o caso, diga que anotou para a Dra. ver no atendimento.' : '') +
    '\n\nCONVERSA (mais antiga primeiro):\n' + anonimizar_(String(hist).slice(-6000), []);
  var o;
  try { o = jsonDaIA_(geminiTexto_([{ text: pedido }], { sistema: WHATS_SISTEMA, json: true, max: 1200, temp: 0.3 }).texto); } catch (e) { o = null; }
  if (!o || (!o.resposta && !o.quer_atendimento && !o.escolha)) {
    if (sim) return '(a IA não respondeu: passaria para a equipe)';
    avisar(t, false);
    return jaFalou ? '' : 'Olá! Aqui é a assistente virtual do escritório Araújo Advocacia. Recebi a sua mensagem e já passei para a equipe, que responde por aqui' + quando + '.';
  }
  var resposta = String(o.resposta || '').replace(/\*\*/g, '*').slice(0, 1200);
  if (/R\$\s?\d|\b\d+\s?%|\bvoc[eê] (tem|ter[aá]) direito\b|\bvai ganhar\b|\bprazo (é|de) \d|\bprescreve em\b/i.test(resposta))
    resposta = 'Essa é uma pergunta importante, e ' + quemAtende_() + ' responde com segurança no atendimento, depois de entender o seu caso. Quer que eu veja um horário para vocês conversarem?';
  if (o.nome && !conv.nome) salvar({ nome: nomeProprio_(String(o.nome).slice(0, 80)) });
  nome1 = primeiroNomeTxt_(conv.nome);
  ['cidade', 'area', 'resumo'].forEach(function (k) { if (o[k]) dados[k] = String(o[k]).slice(0, 400); });
  if (o.modo && NOME_MODO[o.modo]) dados.modo = o.modo;
  modo = modoDoTexto_(t) || dados.modo || '';
  salvar({ dados: dados, resumo: String(dados.resumo || conv.resumo || '').slice(0, 400) });
  if (o.intencao !== 'outro') crm({ resumo: dados.resumo, area: dados.area, cidade: dados.cidade, intencao: o.intencao });
  if (o.conflito) return paraEquipe('Obrigada por avisar. Para esse assunto, a própria equipe do escritório vai falar com você por aqui' + quando + '.', '⚠ Possível conflito (parte contrária ou reclamação): ' + t, false);
  if (o.intencao === 'financeiro') return paraEquipe(resposta || 'Já passei para a equipe, que confere e te responde por aqui' + quando + '.', '💰 Financeiro: ' + t, false);
  if (o.intencao === 'outro') { avisar('Mensagem que não é caso (fornecedor/currículo/outro): ' + t, false); return resposta; }
  if (o.intencao === 'caso_cliente' || o.chamar_equipe) { avisar(t, false); if (o.chamar_equipe) salvar({ estado: 'humano', pausado_ate: '' }); return resposta; }
  if (o.nao_quer_agora) { dados.fase = 'triagem'; salvar({ dados: dados }); return resposta; }
  // escolheu um dos horários / pediu outro / aceitou marcar
  if (dados.fase === 'oferta' && dados.slots && o.escolha && dados.slots[+o.escolha - 1]) return marcarOuOferecer_(dados.slots[+o.escolha - 1], modo, resposta);
  var querOutro = (o.outro_horario && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.outro_horario)) || o.quer_atendimento || o.dia_preferido || o.periodo || o.intencao === 'agendar';
  if (querOutro && dados.fase === 'agendado' && dados.agendado) { // já tinha horário e pediu outro: desmarca o antigo antes
    avisar('Pediu outro horário no lugar de ' + dataBR_(dados.agendado.dia) + ' ' + dados.agendado.hora, false);
    whatsDesmarcar_(dados, sim); dados.agendado = null; dados.fase = 'triagem'; salvar({ dados: dados });
  }
  if (o.outro_horario && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.outro_horario)) {
    var pd = o.outro_horario.slice(0, 10), ph = o.outro_horario.slice(11, 16), pm = +ph.slice(0, 2) * 60 + +ph.slice(3, 5), dsem = +Utilities.formatDate(new Date(msSlot_(pd, ph)), TZ, 'u');
    var dentro = dsem <= 5 && ((pm >= 480 && pm + duracaoAtendimento_() <= 720) || (pm >= 810 && pm + duracaoAtendimento_() <= 1080));
    if (dentro && msSlot_(pd, ph) > Date.now() + 30 * 60000 && slotLivre_(pd, ph)) return marcarOuOferecer_({ dia: pd, hora: ph, dsem: dsem }, modo);
    var perto = horariosLivres_({ qtd: 4, desde: Math.max(Date.now(), msSlot_(pd, '00:00')) });
    dados.fase = 'oferta'; dados.slots = perto; salvar({ dados: dados });
    return perto.length ? (dentro ? 'Esse horário já está ocupado. ' : 'Nesse horário a equipe não atende (seg. a sex., 8h–12h e 13h30–18h). ') + textoSlots_(perto, nome1)
      : paraEquipe('Vou pedir para a equipe te passar um horário por aqui' + quando + '.', '📅 Quer marcar atendimento: ' + o.outro_horario, false);
  }
  if (o.quer_atendimento || o.dia_preferido || o.periodo || o.intencao === 'agendar') {
    var opc = { qtd: 4 };
    if (/^\d{4}-\d{2}-\d{2}$/.test(o.dia_preferido || '')) opc.dia = o.dia_preferido;
    if (o.periodo === 'manha' || o.periodo === 'tarde') opc.periodo = o.periodo;
    var sl = horariosLivres_(opc);
    if (!sl.length && (opc.dia || opc.periodo)) sl = horariosLivres_({ qtd: 4 });
    if (!sl.length) { crm({ resumo: dados.resumo, area: dados.area, intencao: 'agendar', agendar: true }); return paraEquipe((resposta ? resposta + ' ' : '') + 'Vou pedir para a equipe confirmar um horário com você por aqui' + quando + '.', '📅 Pediu atendimento (agenda sem horário livre)', false); }
    dados.fase = 'oferta'; dados.slots = sl; salvar({ dados: dados });
    var trans = resposta && resposta.length < 160 && !/\?\s*$/.test(resposta) ? resposta + '\n\n' : '';
    return trans + (opc.dia && sl[0].dia !== opc.dia ? 'Nesse dia não tenho horário livre. ' : '') + textoSlots_(sl, nome1);
  }
  if (o.caso_entendido && dados.fase !== 'oferta') { dados.fase = 'triagem'; salvar({ dados: dados }); }
  return resposta;

  function marcarOuOferecer_(slot, modoX, prefixo) {
    var r = whatsMarcar_(conv, slot, modoX, dados, sim);
    if (r.ok) {
      dados.fase = 'agendado'; dados.agendado = { dia: slot.dia, hora: slot.hora, dsem: slot.dsem, modo: modoX || 'ligacao', evento: r.evento || '' }; dados.slots = [];
      salvar({ dados: dados });
      return confirmacaoAtendimento_(slot, modoX, r, nome1);
    }
    if (r.ocupado) {
      var outros = horariosLivres_({ qtd: 4 }); dados.fase = 'oferta'; dados.slots = outros; salvar({ dados: dados });
      return outros.length ? 'Esse horário acabou de ser ocupado. ' + textoSlots_(outros, nome1) : paraEquipe('Vou pedir para a equipe te passar um horário por aqui' + quando + '.', '📅 Atendimento: sem horário livre', false);
    }
    crm({ resumo: dados.resumo, area: dados.area, intencao: 'agendar', agendar: true, preferencia: rotuloSlot_(slot) });
    return paraEquipe((prefixo ? prefixo + ' ' : '') + 'Anotei ' + rotuloSlot_(slot) + '. A equipe confirma com você por aqui' + quando + '.', '📅 Confirmar atendimento ' + rotuloSlot_(slot) + ' (não entrou na agenda: ' + (r.erro || '') + ')', false);
  }
}

/** 8.16: um lembrete gentil (uma vez) quando a pessoa parou no meio — só dentro da janela de 24 h do WhatsApp e no horário do escritório. */
function whatsCutucar_() {
  if (!whatsLigado_() || !horarioEscritorio_()) return 0;
  var agora = Date.now(), n = 0;
  tabela_('Conversas').linhas.forEach(function (c) {
    if (n >= 15 || c.estado === 'humano' || !c.ultima_cliente_em) return;
    var dados = {}; try { dados = JSON.parse(c.dados || '{}') || {}; } catch (e) { return; }
    if (dados.cutucado || ['triagem', 'oferta'].indexOf(dados.fase) < 0) return;
    var ultCli = Date.parse(c.ultima_cliente_em), ult = Date.parse(c.ultima_em || c.ultima_cliente_em);
    if (!(ult > ultCli) || agora - ult < 3 * 3600000 || agora - ultCli > 21 * 3600000) return;
    var nome1 = primeiroNomeTxt_(c.nome), msg;
    if (dados.fase === 'oferta') {
      var sl = horariosLivres_({ qtd: 4 }); if (!sl.length) return;
      dados.slots = sl; msg = 'Oi' + (nome1 ? ', ' + nome1 : '') + '! Conseguiu ver os horários? Separei estes, que ainda estão livres:\n' + sl.map(function (s, i) { return (i + 1) + ') ' + rotuloSlot_(s); }).join('\n') + '\n\nÉ só responder com o número.';
    } else {
      if (!dados.resumo) return;
      msg = 'Oi' + (nome1 ? ', ' + nome1 : '') + '! Ainda posso te ajudar? Se quiser, já vejo um horário para você conversar com ' + quemAtende_() + '.';
    }
    dados.cutucado = new Date().toISOString();
    try { var waId = whatsEnviar_(c.telefone, msg); comTrava_(function () { registrarMsg_(c, 'saida', 'texto', msg, waId, 'robô'); atualizarConversa_(c.id, { dados: JSON.stringify(dados), ultima_em: new Date().toISOString(), ultima_msg: msg.slice(0, 200) }); }); n++; } catch (e) { /* tenta outro dia */ }
  });
  return n;
}

/** Leva a conversa para o CRM: cria o contato (canal WhatsApp) ou atualiza; pedido de consulta vira próxima ação para a equipe. */
function crmDoWhats_(conv, info) {
  if (conv.cliente_id && !info.agendar && info.intencao !== 'novo_caso') return; // cliente antigo com dúvida: não vira contato novo
  comTrava_(function () {
    var t = tabela_('Leads'), agora = new Date().toISOString(), dig = String(conv.telefone).slice(-8);
    var l = t.linhas.filter(function (x) { return x.id === conv.lead_id; })[0] ||
      t.linhas.filter(function (x) { return String(x.telefone || '').replace(/\D/g, '').slice(-8) === dig && ['ganho', 'perdido'].indexOf(x.etapa) < 0; })[0];
    var hist = linhaHist_(null, 'WhatsApp (robô): ' + (info.resumo || info.intencao || 'mensagem'));
    if (!l) {
      l = { id: novoId_('L'), criado_em: agora, nome: conv.nome || ('WhatsApp ' + conv.telefone.slice(-4)), telefone: conv.telefone, email: '', area: info.area || '', assunto: String(info.resumo || '').slice(0, 300),
        canal: 'WhatsApp', etapa: 'contato', valor_estimado: '', responsavel: config_('WHATS_RESP') || config_('RESP_SITE') || '', proxima_acao: 'Ver a conversa do WhatsApp e responder', proxima_data: hojeSP_(),
        temperatura: 'morno', cliente_id: conv.cliente_id || '', historico: hist, criado_por: 'whatsapp', atualizado_em: agora, atualizado_por: 'robô', primeiro_contato_em: agora };
      inserirLinha_(t, l);
    } else {
      var m = { atualizado_em: agora, atualizado_por: 'robô' };
      if (info.area && !l.area) m.area = info.area;
      if (info.resumo && (!l.assunto || l.assunto.length < 20)) m.assunto = String(info.resumo).slice(0, 300);
      if (conv.nome && /^WhatsApp \d/.test(l.nome)) m.nome = conv.nome;
      if (String(l.historico || '').split('\n').slice(-1)[0].indexOf(String(info.resumo || '').slice(0, 40)) < 0) m.historico = (l.historico ? l.historico + '\n' : '') + hist;
      atualizarLinha_(t, l, m);
    }
    if (info.agendar) atualizarLinha_(t, l, { proxima_acao: '📅 Marcar a consulta pedida no WhatsApp' + (info.preferencia ? ': ' + String(info.preferencia).slice(0, 120) : ''), proxima_data: hojeSP_(), temperatura: 'quente' });
    if (!conv.lead_id || conv.lead_id !== l.id) { var tc = tabela_('Conversas'), x = tc.linhas.filter(function (r) { return r.id === conv.id; })[0]; if (x) atualizarLinha_(tc, x, { lead_id: l.id }); }
  });
  if (info.agendar) whatsAvisarEquipe_(conv, '📅 Pediu para marcar a conversa inicial' + (info.preferencia ? ' (' + info.preferencia + ')' : '') + '. ' + (info.resumo || ''), false);
}

/* ---------- Painel: Conversas do WhatsApp (administração) ---------- */
function whatsConversas_(d) {
  var msgs = tabela_('Mensagens').linhas;
  var itens = tabela_('Conversas').linhas.map(function (c) { var o = limpar_(c); delete o.dados; return o; }).sort(function (a, b) { return a.ultima_em < b.ultima_em ? 1 : -1; }).slice(0, 300);
  var r = { itens: itens, ligado: config_('WHATS_BOT') === 'sim', configurado: !!whatsToken_() && !!config_('WHATS_PHONE_ID'), ultima: config_('WHATS_ULTIMA') || '', erro: config_('WHATS_ERRO') || '' };
  if (d.id) {
    r.mensagens = msgs.filter(function (m) { return m.conversa_id === d.id; }).slice(-200).map(limpar_);
    var c = tabela_('Conversas').linhas.filter(function (x) { return x.id === d.id; })[0];
    if (c) { var dd = {}; try { dd = JSON.parse(c.dados || '{}'); } catch (e) { dd = {}; } r.conversa = limpar_(c); r.conversa.dados = dd; delete dd.aguarda_cpf;
      r.janela = c.ultima_cliente_em ? (Date.now() - Date.parse(c.ultima_cliente_em)) < 23.5 * 3600000 : false; }
  }
  return r;
}
function whatsAcao_(d, u) {
  var t = tabela_('Conversas'), c = t.linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!c) throw falha_('Conversa não encontrada.');
  if (d.acao === 'lida') return comTrava_(function () { atualizarLinha_(tabela_('Conversas'), tabela_('Conversas').linhas.filter(function (x) { return x.id === c.id; })[0], { nao_lidas: '0' }); return { ok: true }; });
  if (d.acao === 'assumir') return comTrava_(function () { atualizarLinha_(tabela_('Conversas'), tabela_('Conversas').linhas.filter(function (x) { return x.id === c.id; })[0], { estado: 'humano', atendente: u.usuario, pausado_ate: '' }); return { ok: true }; });
  if (d.acao === 'robo') return comTrava_(function () { atualizarLinha_(tabela_('Conversas'), tabela_('Conversas').linhas.filter(function (x) { return x.id === c.id; })[0], { estado: 'robo', atendente: '', pausado_ate: '' }); return { ok: true }; });
  if (d.acao === 'enviar') {
    var texto = String(d.texto || '').trim();
    if (!texto) throw falha_('Escreva a mensagem.');
    var waId = whatsEnviar_(c.telefone, texto);
    comTrava_(function () {
      registrarMsg_(c, 'saida', 'texto', texto, waId, u.nome || u.usuario);
      atualizarLinha_(tabela_('Conversas'), tabela_('Conversas').linhas.filter(function (x) { return x.id === c.id; })[0], { estado: 'humano', atendente: u.usuario, ultima_em: new Date().toISOString(), ultima_msg: texto.slice(0, 200), nao_lidas: '0' });
    });
    registrar_(u.usuario, 'whatsapp ao cliente', (c.cliente_id || c.telefone) + ' (conversa)');
    return { ok: true };
  }
  throw falha_('Ação desconhecida.');
}
/** Configuração (só administração): token e número do Meta, liga/desliga, chave da ponte e teste. */
function whatsConfig_(d, u) {
  var props = PropertiesService.getScriptProperties();
  if (d.token !== undefined) {
    var k = String(d.token || '').replace(/[\s"'`<>]/g, '');
    if (k && k.length < 40) throw falha_('O token parece incompleto. Copie o token permanente inteiro do Meta (começa com EAA…).');
    if (k) props.setProperty('WHATS_TOKEN', k); else props.deleteProperty('WHATS_TOKEN');
    registrar_(u.usuario, 'whatsapp: token', k ? 'cadastrado' : 'apagado');
  }
  if (d.phone_id !== undefined) { if (d.phone_id && !/^\d{8,20}$/.test(String(d.phone_id).trim())) throw falha_('O "Phone number ID" é só de números (fica em WhatsApp › Configuração da API no Meta).'); setConfig_('WHATS_PHONE_ID', String(d.phone_id).trim(), 'ID do número do WhatsApp na API do Meta'); }
  if (d.resp !== undefined) setConfig_('WHATS_RESP', String(d.resp).slice(0, 40), 'Quem recebe as tarefas do WhatsApp');
  if (d.ligado !== undefined) setConfig_('WHATS_BOT', d.ligado ? 'sim' : 'nao', 'Robô do WhatsApp respondendo sozinho?');
  if (d.novaChave || !props.getProperty('WHATS_PONTE_CHAVE')) props.setProperty('WHATS_PONTE_CHAVE', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  var r = { temToken: !!whatsToken_(), phone_id: config_('WHATS_PHONE_ID') || '', ligado: config_('WHATS_BOT') === 'sim', resp: config_('WHATS_RESP') || '',
    chavePonte: props.getProperty('WHATS_PONTE_CHAVE'), urlPainel: (function () { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } })(), ultima: config_('WHATS_ULTIMA') || '', erro: config_('WHATS_ERRO') || '', iaLigada: !!chaveIA_() };
  if (d.testar) {
    var tel = String(d.testar).replace(/\D/g, ''); if (tel.length < 12) throw falha_('Informe o seu número com DDI e DDD (ex.: 5548999998888).');
    whatsEnviar_(tel, 'Teste do painel Araújo Advocacia: o WhatsApp está ligado. ✓'); r.teste = true; setConfig_('WHATS_ERRO', '', 'Último problema ao mandar mensagem pelo WhatsApp'); r.erro = '';
  }
  if (d.simular !== undefined || d.reiniciar) r.simulacao = whatsSimular_({ texto: d.simular, reiniciar: d.reiniciar }, u);
  return r;
}
/** "Testar o robô" no painel: conversa de mentira com o robô (guardada 1 h na memória do servidor). Nada é gravado, marcado nem enviado. */
function whatsSimular_(d, u) {
  var cache = CacheService.getScriptCache(), k = 'wsim_' + u.usuario, st = null;
  if (d.reiniciar) cache.remove(k); else try { st = JSON.parse(cache.get(k) || 'null'); } catch (e) { st = null; }
  var texto = String(d.texto || '').trim().slice(0, 2000);
  if (!texto) return { reiniciado: true };
  st = st || { conv: { id: 'SIMULACAO', telefone: '5548900000000', nome: '', cliente_id: '', dados: '{}', estado: 'robo' }, hist: [] };
  st.hist.push('Cliente: ' + texto);
  var sim = { hist: st.hist, acoes: [] };
  var resp = st.conv.estado === 'humano' ? '(o robô ficou quieto: a equipe assumiu esta conversa. Clique em "Recomeçar" para testar de novo)' : whatsCerebro_(st.conv, texto, 'text', st.hist.length === 1, sim);
  if (resp && !/^\(/.test(resp)) st.hist.push('Escritório: ' + resp);
  st.hist = st.hist.slice(-30);
  try { cache.put(k, JSON.stringify(st), 3600); } catch (e) { /* segue */ }
  var dd = {}; try { dd = JSON.parse(st.conv.dados || '{}') || {}; } catch (e) { dd = {}; }
  return { resposta: resp || '(sem resposta: passaria para a equipe)', acoes: sim.acoes, fase: dd.fase || 'triagem', resumo: dd.resumo || '', area: dd.area || '', pausado: st.conv.estado === 'humano' };
}


/* ================================================================== */
/* 8.14 — Cadastro online (o cliente preenche pelo link) e extensão    */
/* do WhatsApp Web (assistente ao lado das conversas)                  */
/* ================================================================== */

/* ---------- Link do cadastro ---------- */
var SITE_URL = 'https://araujoadvocaciasc.com.br';
function hashTxt_(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
/** Gera (ou renova) o link do cadastro de um contato do funil. Guarda só o "resumo" do código (hash): o link vale 15 dias e uma vez. */
function crmLinkCadastro_(d, u) {
  return comTrava_(function () {
    var t = tabela_('Leads'), l = d.id ? t.linhas.filter(function (r) { return r.id === d.id; })[0] : null, agora = new Date().toISOString();
    if (!l && d.cliente_id) { // cliente sem cartão no funil (ex.: aberto pela ficha): cria o cartão
      var c = tabela_('Clientes').linhas.filter(function (r) { return r.id === d.cliente_id; })[0];
      if (!c) throw falha_('Cliente não encontrado.');
      l = { id: novoId_('L'), criado_em: agora, nome: c.nome, telefone: c.telefone || '', email: c.email || '', area: c.area || '', assunto: '', canal: c.como_conheceu || '', etapa: 'contato',
        temperatura: 'morno', cliente_id: c.id, historico: linhaHist_(u, 'cartão criado para mandar o cadastro'), criado_por: u.usuario, atualizado_em: agora, atualizado_por: u.usuario, responsavel: u.usuario };
      inserirLinha_(t, l);
    }
    if (!l) throw falha_('Contato não encontrado.');
    var codigo = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    var ate = new Date(Date.now() + 15 * 86400000).toISOString();
    atualizarLinha_(t, l, { cadastro_token: hashTxt_(codigo), cadastro_ate: ate, etapa: etapaAFrente_(l.etapa, 'cadastro'), atualizado_em: agora, atualizado_por: u.usuario,
      proxima_acao: 'Conferir se preencheu o cadastro', proxima_data: somarDias_(hojeSP_(), 2), primeiro_contato_em: l.primeiro_contato_em || agora,
      historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(u, 'link do cadastro gerado (vale 15 dias)') });
    registrar_(u.usuario, 'crm: link do cadastro', l.id);
    var url = SITE_URL + '/cadastro/?c=' + codigo, n = primeiroNomeTxt_(l.nome);
    return { lead_id: l.id, url: url, telefone: l.telefone || '', ate: ate,
      mensagem: 'Olá' + (n ? ', ' + n : '') + '! Para darmos andamento ao seu atendimento, preencha o seu cadastro neste link (leva uns 3 minutos e é seguro):\n' + url +
        '\n\nOs dados são usados só para o seu atendimento e para os documentos (LGPD). Qualquer dúvida, é só me chamar por aqui.' };
  });
}
function leadDoCodigo_(codigo) {
  codigo = String(codigo || '').replace(/[^a-f0-9]/gi, '');
  if (codigo.length < 32) return null;
  var h = hashTxt_(codigo);
  return tabela_('Leads').linhas.filter(function (l) { return l.cadastro_token && iguais_(l.cadastro_token, h); })[0] || null;
}
function travaCadastro_(codigo) {
  var cache = CacheService.getScriptCache(), k = 'cad_' + String(codigo).slice(0, 12), n = +(cache.get(k) || 0), g = +(cache.get('cad_total') || 0);
  if (n >= 15 || g >= 120) throw falha_('Muitas tentativas agora. Tente de novo em alguns minutos ou fale com o escritório pelo WhatsApp.');
  cache.put(k, String(n + 1), 3600); cache.put('cad_total', String(g + 1), 3600);
}
/** Público: o site pergunta se o link vale (e o primeiro nome, para cumprimentar). */
function cadastroInfo_(d) {
  travaCadastro_(d.c);
  var l = leadDoCodigo_(d.c);
  if (!l || !l.cadastro_ate || l.cadastro_ate < new Date().toISOString()) return { ok: false };
  var cli = l.cliente_id ? tabela_('Clientes').linhas.filter(function (c) { return c.id === l.cliente_id; })[0] : null;
  return { ok: true, nome: primeiroNomeTxt_(l.nome), telefone: String(l.telefone || '').replace(/\D/g, '').slice(-11), area: l.area || '', jaCliente: !!cli };
}
function cpfValido_(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  var dv = function (n) { var s = 0; for (var i = 0; i < n; i++) s += +cpf[i] * (n + 1 - i); var r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +cpf[9] && dv(10) === +cpf[10];
}
var ESTADOS_CIVIS_CAD = ['solteiro(a)', 'casado(a)', 'união estável', 'divorciado(a)', 'separado(a)', 'viúvo(a)'];
/** Público: o cliente mandou o cadastro. Cria (ou completa) o cadastro, liga ao funil e avisa a equipe. */
function cadastroEnviar_(d) {
  travaCadastro_(d.c);
  if (d.empresa_site) return { ok: true }; // campo-isca contra robôs
  var l = leadDoCodigo_(d.c);
  if (!l || !l.cadastro_ate || l.cadastro_ate < new Date().toISOString()) throw falha_('Este link de cadastro expirou ou já foi usado. Peça um novo pelo WhatsApp do escritório.');
  var x = d.dados || {}, limpa = function (v, n) { return String(v || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 200); };
  var nome = limpa(x.nome, 120), cpf = String(x.cpf || '').replace(/\D/g, ''), nasc = String(x.nascimento || ''), tel = String(x.telefone || '').replace(/\D/g, '');
  var falta = [];
  if (nome.split(' ').length < 2) falta.push('nome completo');
  if (!cpfValido_(cpf)) falta.push('CPF válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || nasc > hojeSP_() || nasc < '1900-01-01') falta.push('data de nascimento');
  if (tel.length < 10 || tel.length > 11) falta.push('telefone com DDD');
  if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email).trim())) falta.push('e-mail válido (ou deixe em branco)');
  if (ESTADOS_CIVIS_CAD.indexOf(x.estado_civil) < 0) falta.push('estado civil');
  if (!limpa(x.profissao)) falta.push('profissão');
  if (String(x.cep || '').replace(/\D/g, '').length !== 8) falta.push('CEP');
  if (!limpa(x.rua) || !limpa(x.numero, 20) || !limpa(x.bairro) || !limpa(x.cidade) || !/^[A-Za-z]{2}$/.test(String(x.uf || ''))) falta.push('endereço completo (rua, número, bairro, cidade e UF)');
  if (!x.aceite) falta.push('a autorização de uso dos dados (LGPD)');
  if (falta.length) throw falha_('Confira: ' + falta.join(', ') + '.');
  var endereco = limpa(x.rua) + ', nº ' + limpa(x.numero, 20) + (limpa(x.complemento, 60) ? ', ' + limpa(x.complemento, 60) : '') + ', ' + limpa(x.bairro);
  var fone = '(' + tel.slice(0, 2) + ') ' + tel.slice(2, tel.length - 4) + '-' + tel.slice(-4);
  var cpfFmt = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'), cepFmt = String(x.cep).replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');
  var agora = new Date().toISOString(), carimbo = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');
  var res = comTrava_(function () {
    var tc = tabela_('Clientes');
    var c = (l.cliente_id && tc.linhas.filter(function (r) { return r.id === l.cliente_id; })[0]) || tc.linhas.filter(function (r) { return String(r.cpf_cnpj || '').replace(/\D/g, '') === cpf; })[0];
    var dados = { tipo: 'PF', nome: nomeProprio_(nome), cpf_cnpj: cpfFmt, rg: limpa(x.rg, 30), nascimento: nasc, estado_civil: x.estado_civil, profissao: limpa(x.profissao, 80),
      cep: cepFmt, endereco: endereco, cidade: limpa(x.cidade, 80), uf: String(x.uf).toUpperCase(), telefone: fone, email: limpa(x.email, 120), genero: /^(feminino|masculino)$/.test(x.genero) ? x.genero : '' };
    var novo = !c;
    if (c) { // já tinha cadastro: completa e atualiza o que veio (o cliente acabou de conferir os próprios dados)
      var m = { atualizado_em: agora, atualizado_por: 'cadastro online' };
      Object.keys(dados).forEach(function (k) { if (dados[k]) m[k] = dados[k]; });
      m.observacoes = guardarObsCliente_(c, '[' + carimbo + ' — site] Cadastro conferido e atualizado pelo próprio cliente (link do WhatsApp).' + (c.observacoes ? '\n' + c.observacoes : ''));
      if (c.situacao === 'importado — conferir') m.situacao = 'completo';
      atualizarLinha_(tc, c, m);
    } else {
      c = Object.assign({ id: novoId_('C'), origem: 'cadastro online (CRM)', situacao: 'completo', area: l.area || '', como_conheceu: CANAIS_CONHECEU.indexOf(l.canal) >= 0 ? l.canal : (/WhatsApp/.test(l.canal) ? 'Outro' : (/Site/.test(l.canal || '') ? 'Site' : '')),
        observacoes: '[' + carimbo + ' — site] Cadastro preenchido pelo próprio cliente pelo link (veio do funil' + (l.canal ? ', ' + l.canal : '') + ').' + (l.assunto ? ' Caso: ' + l.assunto : ''),
        criado_em: agora, atualizado_em: agora, atualizado_por: 'cadastro online' }, dados);
      inserirLinha_(tc, c);
    }
    var tl = tabela_('Leads'), ll = tl.linhas.filter(function (r) { return r.id === l.id; })[0];
    atualizarLinha_(tl, ll, { cliente_id: c.id, nome: dados.nome, telefone: ll.telefone || fone, email: dados.email || ll.email, etapa: etapaAFrente_(ll.etapa, 'cliente'), cadastro_token: '', cadastro_em: agora,
      proxima_acao: 'Conferir o cadastro e marcar o atendimento', proxima_data: hojeSP_(), atualizado_em: agora, atualizado_por: 'cadastro online',
      historico: (ll.historico ? ll.historico + '\n' : '') + linhaHist_(null, 'cadastro preenchido pelo cliente' + (novo ? ' (cliente novo)' : ' (cadastro atualizado)')) });
    inserirLinha_(tabela_('Tarefas'), { id: novoId_('T'), titulo: '📝 Cadastro preenchido — ' + dados.nome + ': conferir e marcar o atendimento', descricao: 'O cliente preencheu o cadastro pelo link.\nAbrir: Clientes › ' + dados.nome,
      responsavel: ll.responsavel || config_('WHATS_RESP') || config_('RESP_SITE') || '', processo_id: '', numero: '', cliente_id: c.id, vence_em: hojeSP_(), etapa: 'afazer', peso: '1', situacao: 'ativa',
      concluida_por: '', concluida_em: '', historico: carimbo + ' cadastro online', criado_em: agora, criado_por: 'site', atualizado_em: agora, atualizado_por: 'site', prioridade: 'alta' });
    return { novo: novo, id: c.id };
  });
  registrar_('site', 'cadastro online', res.id + (res.novo ? ' (novo)' : ' (atualizado)'));
  return { ok: true };
}

/* ---------- Extensão do WhatsApp Web: pareamento seguro ---------- */
/* A extensão não usa a senha: a administração gera no painel um código de 6 letras (vale 10 min); a extensão troca o código por uma
   chave própria do aparelho (guardada aqui só como hash), que só abre as rotas ext.* e pode ser desligada em Gerenciar acessos. */
function dispositivos_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('EXT_DISPOSITIVOS') || '[]'); } catch (e) { return []; } }
function gravarDispositivos_(l) { PropertiesService.getScriptProperties().setProperty('EXT_DISPOSITIVOS', JSON.stringify(l.slice(-20))); }
function extParear_(d, u) {
  var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', cod = '';
  for (var i = 0; i < 6; i++) cod += letras.charAt(Math.floor(Math.random() * letras.length));
  CacheService.getScriptCache().put('extpar_' + cod, u.id, 600);
  registrar_(u.usuario, 'extensão: código de pareamento', '');
  return { codigo: cod, validade_min: 10 };
}
function extAtivar_(d) {
  var cache = CacheService.getScriptCache(), cod = String(d.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var tent = +(cache.get('extpar_tent') || 0); if (tent >= 30) throw falha_('Muitas tentativas. Gere outro código daqui a 15 minutos.');
  var uid = cod.length === 6 ? cache.get('extpar_' + cod) : null;
  if (!uid) { cache.put('extpar_tent', String(tent + 1), 900); throw falha_('Código inválido ou vencido. Gere outro no painel (Gerenciar acessos › Extensão do WhatsApp Web).'); }
  cache.remove('extpar_' + cod);
  var u = tabela_('Usuarios').linhas.filter(function (r) { return r.id === uid; })[0];
  if (!u || u.ativo !== 'sim') throw falha_('Usuário desativado.');
  var token = 'ext_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var lista = dispositivos_();
  lista.push({ id: novoId_('X'), hash: hashTxt_(token), u: uid, nome: String(d.nome || 'Chrome').slice(0, 60), criado: new Date().toISOString(), ultimo: new Date().toISOString() });
  gravarDispositivos_(lista);
  registrar_(u.usuario, 'extensão: aparelho ligado', String(d.nome || ''));
  return { token: token, usuario: u.nome || u.usuario };
}
function usuarioDoDispositivo_(token) {
  if (!/^ext_[0-9a-f]{64}$/.test(String(token || ''))) throw falha_('A extensão precisa ser ligada de novo (código no painel).', true);
  var h = hashTxt_(token), lista = dispositivos_(), x = lista.filter(function (z) { return iguais_(z.hash, h); })[0];
  if (!x) throw falha_('Este aparelho foi desligado. Gere um código novo no painel.', true);
  var u = tabela_('Usuarios').linhas.filter(function (r) { return r.id === x.u; })[0];
  if (!u || u.ativo !== 'sim' || !PERFIS[u.perfil]) throw falha_('Acesso desativado.', true);
  var cache = CacheService.getScriptCache(); if (!cache.get('extuso_' + x.id)) { cache.put('extuso_' + x.id, '1', 3600); x.ultimo = new Date().toISOString(); gravarDispositivos_(lista); }
  return u;
}
function extDispositivos_(d, u) {
  var lista = dispositivos_();
  if (d.revogar) { lista = lista.filter(function (z) { return z.id !== d.revogar; }); gravarDispositivos_(lista); registrar_(u.usuario, 'extensão: aparelho desligado', d.revogar); }
  var nomes = {}; tabela_('Usuarios').linhas.forEach(function (r) { nomes[r.id] = r.nome || r.usuario; });
  return { itens: lista.map(function (z) { return { id: z.id, nome: z.nome, usuario: nomes[z.u] || '', criado: z.criado, ultimo: z.ultimo }; }) };
}

/* ---------- Extensão: quem é esta conversa ---------- */
function digitosTel_(t) { var d = String(t || '').replace(/\D/g, ''); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2); return d; }
function mapaContatos_() {
  var porTel = {}, porNome = {};
  var junta = function (k, obj) { if (k && !porTel[k]) porTel[k] = obj; };
  tabela_('Clientes').linhas.forEach(function (c) {
    String(c.telefone || '').split(/[\/;,|]|\bou\b/).forEach(function (t) { var d = digitosTel_(t); if (d.length >= 10) junta(d.slice(-8), { tipo: 'cliente', id: c.id, nome: c.nome }); });
    var n = normalizar_(c.nome); if (n && !porNome[n]) porNome[n] = { tipo: 'cliente', id: c.id, nome: c.nome };
  });
  var ultimoDoCliente = {};
  tabela_('Leads').linhas.forEach(function (l) {
    if (l.cliente_id) ultimoDoCliente[l.cliente_id] = { id: l.id, etapa: l.etapa };
    var d = digitosTel_(l.telefone), k = d.length >= 10 ? d.slice(-8) : '';
    var o = { tipo: 'lead', id: l.id, nome: l.nome, etapa: l.etapa, cliente_id: l.cliente_id };
    if (k) { var atual = porTel[k]; if (!atual) porTel[k] = o; else if (atual.tipo === 'cliente' && (!atual.lead || ['ganho', 'perdido'].indexOf(l.etapa) < 0)) atual.lead = o; }
    var n = normalizar_(l.nome); if (n) { var a2 = porNome[n]; if (!a2) porNome[n] = o; else if (a2.tipo === 'cliente' && !a2.lead) a2.lead = o; }
  });
  // cliente com cartão no funil: a etiqueta mostra a etapa do cartão
  [porTel, porNome].forEach(function (m) { Object.keys(m).forEach(function (k) { var o = m[k]; if (o.tipo === 'cliente' && ultimoDoCliente[o.id]) o.lead = ultimoDoCliente[o.id]; }); });
  return { porTel: porTel, porNome: porNome };
}
function acharContato_(mapa, titulo, telefone) {
  var d = digitosTel_(telefone || (/^\+?[\d\s()\-]{10,}$/.test(String(titulo || '')) ? titulo : ''));
  if (d.length >= 10 && mapa.porTel[d.slice(-8)]) return mapa.porTel[d.slice(-8)];
  var n = normalizar_(String(titulo || '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' '));
  return (n && mapa.porNome[n]) || null;
}
/** Etiquetas da lista de conversas: para cada título visível, se é cliente/contato e a etapa. */
function extContatos_(d) {
  var mapa = mapaContatos_(), r = {}, jor = null;
  (d.itens || []).slice(0, 80).forEach(function (it) {
    var o = acharContato_(mapa, it.titulo, it.telefone); if (!o) return;
    var cid = o.tipo === 'cliente' ? o.id : o.cliente_id;
    if (cid) { jor = jor || jornadasClientes_(); r[it.chave || it.titulo] = { tipo: 'cliente', etapa: 'j_' + (jor[cid] || 'sem') }; }
    else r[it.chave || it.titulo] = { tipo: o.tipo, etapa: o.etapa };
  });
  return { itens: r, etapas: ETAPAS_CRM, jornada: JORNADA };
}
/** Painel ao lado da conversa aberta. */
function extContato_(d, u) {
  var mapa = mapaContatos_(), o = acharContato_(mapa, d.titulo, d.telefone);
  if (!o) return { achou: false, etapas: ETAPAS_CRM };
  var r = { achou: true, etapas: ETAPAS_CRM, tipo: o.tipo };
  var leadId = o.tipo === 'lead' ? o.id : (o.lead && o.lead.id);
  var cliId = o.tipo === 'cliente' ? o.id : o.cliente_id;
  if (leadId) {
    var l = tabela_('Leads').linhas.filter(function (x) { return x.id === leadId; })[0];
    if (l) r.lead = { id: l.id, nome: l.nome, etapa: l.etapa, area: l.area, assunto: l.assunto, canal: l.canal, proxima_acao: l.proxima_acao, proxima_data: l.proxima_data,
      consulta_em: l.consulta_em, cadastro_pendente: !!l.cadastro_token && l.cadastro_ate > new Date().toISOString(), historico: String(l.historico || '').split('\n').slice(-5).reverse() };
    if (!cliId && l) cliId = l.cliente_id;
  }
  if (cliId) {
    var c = tabela_('Clientes').linhas.filter(function (x) { return x.id === cliId; })[0];
    if (c) {
      var faltam = []; if (!c.cpf_cnpj) faltam.push('CPF'); if (!c.endereco) faltam.push('endereço'); if (!c.estado_civil) faltam.push('estado civil'); if (!c.profissao) faltam.push('profissão');
      r.cliente = { id: c.id, nome: c.nome, telefone: c.telefone, faltam: faltam,
        observacoes: String(c.observacoes || '').split('\n').filter(Boolean).slice(0, 3).map(function (x) { return x.replace(/\s*⏎.*$/, '').slice(0, 220); }),
        processos: tabela_('Processos').linhas.filter(function (p) { return p.cliente_id === c.id && p.status !== 'arquivado'; }).slice(0, 5).map(function (p) { return { numero: p.numero || 'a ajuizar', area: p.area, fase: FASES[faseDe_(p)] || '', proximo: p.proximo_ato ? p.proximo_ato + (p.proximo_ato_data ? ' ' + dataBR_(p.proximo_ato_data) : '') : '' }; }),
        parcelas: parcelasAbertasCliente_(c.id),
        assinatura: (tabela_('Assinaturas').linhas.filter(function (a) { return a.cliente_id === c.id; }).pop() || {}).situacao || '' };
      r.cliente.jornada = jornadasClientes_()[c.id] || 'sem'; r.cliente.jornada_nome = JORNADA[r.cliente.jornada];
      if (PERFIS[u.perfil] && PERFIS[u.perfil].ocultarValores && r.cliente.parcelas) { r.cliente.parcelas.valor_atrasado = null; r.cliente.parcelas.valor_aberto = null; }
    }
  }
  return r;
}
function extAdicionar_(d, u) {
  var tel = digitosTel_(d.telefone || d.titulo);
  var tituloEhTel = /\d{8}/.test(String(d.titulo || '').replace(/\D/g, ''));
  var nome = String((tituloEhTel ? d.nome : d.titulo) || d.nome || '').replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
  var ja = acharContato_(mapaContatos_(), d.titulo, d.telefone);
  if (ja && (ja.tipo === 'lead' || ja.lead)) return { id: ja.tipo === 'lead' ? ja.id : ja.lead.id, ja: true };
  var r = crmSalvar_({ lead: { nome: nomeProprio_(nome || 'WhatsApp ' + tel.slice(-4)), telefone: tel.length >= 10 ? '(' + tel.slice(0, 2) + ') ' + tel.slice(2, tel.length - 4) + '-' + tel.slice(-4) : '',
    canal: 'WhatsApp', area: d.area || '', assunto: String(d.resumo || '').slice(0, 300), etapa: d.etapa === 'novo' ? 'novo' : 'contato', proxima_acao: d.proxima_acao || 'Responder e entender o caso', proxima_data: hojeSP_(), temperatura: 'morno' }, mesmoAssim: true }, u);
  if (ja && ja.tipo === 'cliente') comTrava_(function () { var t = tabela_('Leads'), l = t.linhas.filter(function (x) { return x.id === r.id; })[0]; if (l) atualizarLinha_(t, l, { cliente_id: ja.id, etapa: 'cliente' }); });
  return { id: r.id };
}
/** O que a extensão viu acontecer na conversa (link do cadastro mandado, procuração/contrato enviados). */
function extEvento_(d, u) {
  var mapa = mapaContatos_(), o = acharContato_(mapa, d.titulo, d.telefone);
  var leadId = o ? (o.tipo === 'lead' ? o.id : (o.lead && o.lead.id)) : '';
  if (!leadId) return { ok: false };
  var alvo = { link_cadastro: 'cadastro', documentos: 'proposta' }[d.tipo];
  if (!alvo) return { ok: false };
  return comTrava_(function () {
    var t = tabela_('Leads'), l = t.linhas.filter(function (x) { return x.id === leadId; })[0];
    var nova = etapaAFrente_(l.etapa, alvo);
    if (nova === l.etapa) return { ok: true, igual: true };
    atualizarLinha_(t, l, { etapa: nova, atualizado_em: new Date().toISOString(), atualizado_por: u.usuario,
      historico: (l.historico ? l.historico + '\n' : '') + linhaHist_(u, d.tipo === 'documentos' ? 'WhatsApp: enviou ' + String(d.arquivo || 'procuração/contrato').slice(0, 80) : 'WhatsApp: mandou o link do cadastro') });
    return { ok: true, etapa: nova };
  });
}
/** IA olhando a conversa aberta: é cliente novo? qual a área? e uma sugestão de resposta em tom humano (a equipe confere e manda). */
function extAnalisar_(d, u) {
  var msgs = (d.mensagens || []).slice(-20).map(function (m) { return (m.dir === 'out' ? 'Escritório' : 'Pessoa') + ': ' + String(m.texto || '').slice(0, 600); }).join('\n');
  if (msgs.length < 10) throw falha_('Abra uma conversa com mensagens.');
  var pedido = 'Abaixo está o fim de uma conversa de WhatsApp entre um escritório de advocacia (Araújo Advocacia, Tubarão/SC) e uma pessoa. Responda SOMENTE em JSON: ' +
    '{"novo_cliente": true se a pessoa está procurando o escritório por um problema jurídico próprio (quer orientação, consulta, contratar) e false se é conversa pessoal, fornecedor, propaganda, ou já é assunto resolvido, ' +
    '"area": "Trabalhista"|"Previdenciário"|"Família"|"Cível"|"Criminal"|"Empresarial"|"", "resumo": o caso em até 2 frases (só o que a pessoa contou), "nome": o nome da pessoa se aparecer, ' +
    '"proximo_passo": o que a equipe deve fazer agora (curto), "sugestao": uma resposta para a equipe mandar, escrita como uma pessoa da equipe escreveria no WhatsApp: natural, gentil, curta (até 3 frases), ' +
    'em português do Brasil, sem parecer robô, sem dizer que é IA, sem dar parecer jurídico, sem prometer resultado e sem falar valores}.' + (d.objetivo ? ' Objetivo da resposta: ' + String(d.objetivo).slice(0, 200) + '.' : '') +
    '\n\nBASE DO ESCRITÓRIO (use só isto para informações):\n' + baseConhecimentoWhats_().slice(0, 4000) +
    (d.contexto ? '\n\nCONTEXTO DO PAINEL (só para orientar a resposta; não cite número de processo, valores nem prazos):\n' + anonimizar_(String(d.contexto).slice(0, 1200), []) : '') +
    '\n\nCONVERSA:\n' + anonimizar_(msgs, []);
  var o = jsonDaIA_(geminiTexto_([{ text: pedido }], { json: true, max: 900, temp: 0.4 }).texto) || {};
  var sug = String(o.sugestao || '');
  if (/R\$\s?\d|\b\d+\s?%|\bvoc[eê] (tem|ter[aá]) direito\b|\bvai ganhar\b/i.test(sug)) sug = '';
  return { novo_cliente: !!o.novo_cliente, area: o.area || '', resumo: o.resumo || '', nome: o.nome || '', proximo_passo: o.proximo_passo || '', sugestao: sug };
}
