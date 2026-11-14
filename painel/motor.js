/* GERADO por .github/motor/gerar.mjs a partir de painel-backend/Code.gs 8.28.0 — NÃO EDITE À MÃO.
   O navegador faz as mesmas contas do Apps Script com os dados lidos do Supabase. Gravar, serviços do Google ou tabela não
   liberada param a conta e a tela volta a ser pedida ao Apps Script (painel/banco.js). */
(function () {
var MOTOR_VERSAO = '8.28.0';
var AMB = null; // ambiente da vez (banco.js): { tabela(nome), config(chave), parar(motivo) }
function foraDoNavegador_(o) { var e = new Error('fora do navegador: ' + o); e.motor = true; if (AMB) AMB.parar(o); throw e; }
function servico_(nome) { return new Proxy({}, { get: function (_, p) { if (nome === 'Utilities' && UTIL_[p]) return UTIL_[p]; if (nome === 'Logger') return function () {}; return foraDoNavegador_(nome + '.' + String(p)); } }); }
var UTIL_ = {
  formatDate: function (d, tz, fmt) { return formatarData_(d, tz, fmt); },
  DigestAlgorithm: {}, Charset: {}
};
var SpreadsheetApp = servico_('SpreadsheetApp');
var DriveApp = servico_('DriveApp');
var CalendarApp = servico_('CalendarApp');
var GmailApp = servico_('GmailApp');
var MailApp = servico_('MailApp');
var UrlFetchApp = servico_('UrlFetchApp');
var DocumentApp = servico_('DocumentApp');
var LockService = servico_('LockService');
var ScriptApp = servico_('ScriptApp');
var PropertiesService = servico_('PropertiesService');
var CacheService = servico_('CacheService');
var Utilities = servico_('Utilities');
var Session = servico_('Session');
var ContentService = servico_('ContentService');
var HtmlService = servico_('HtmlService');
var Logger = servico_('Logger');
var Drive = servico_('Drive');
var Calendar = servico_('Calendar');
var XmlService = servico_('XmlService');
var Charts = servico_('Charts');
var DIAS_SEMANA_ = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
var MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function formatarData_(d, tz, fmt) {
  d = d instanceof Date ? d : new Date(d);
  var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
  var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return String(fmt).replace(/'([^']*)'|yyyy|yy|MMMM|MM|M|dd|d|HH|H|mm|ss|EEEE|EEE|E|u|Z|X+/g, function (t, lit) {
    if (lit !== undefined) return lit;
    switch (t) {
      case 'yyyy': return p.year; case 'yy': return p.year.slice(2); case 'MMMM': return MESES_[+p.month - 1]; case 'MM': return p.month; case 'M': return String(+p.month);
      case 'dd': return p.day; case 'd': return String(+p.day); case 'HH': return p.hour; case 'H': return String(+p.hour); case 'mm': return p.minute; case 'ss': return p.second;
      case 'EEEE': return DIAS_SEMANA_[dow]; case 'EEE': case 'E': return DIAS_SEMANA_[dow].slice(0, 3); case 'u': return String(dow === 0 ? 7 : dow);
      default: return foraDoNavegador_('formato de data ' + t);
    }
  });
}
// leitura (Supabase, via banco.js) e gravação (proibida aqui)
function tabela_(nome) { return AMB.tabela(nome); }
function lerTabela_(nome) { return AMB.tabela(nome); }
// leitura direta de uma aba (ex.: o Log no relatório da semana): planilha "de mentira" montada com as linhas do banco, só para ler
function aba_(nome) {
  var t = AMB.tabela(nome), porN = {}, ult = 1;
  t.linhas.forEach(function (l) { porN[l._linha] = l; if (l._linha > ult) ult = l._linha; });
  var soLer = function (o, nomeObj) { return new Proxy(o, { get: function (x, p) { return p in x ? x[p] : foraDoNavegador_(nomeObj + '.' + String(p)); } }); };
  return soLer({
    getName: function () { return nome; }, getLastRow: function () { return ult; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      var ler = function () { var o = []; for (var i = 0; i < nr; i++) { var l = porN[r + i], x = []; for (var j = 0; j < nc; j++) { var k = t.cab[c - 1 + j]; x.push(r + i === 1 ? (k || '') : l && k ? l[k] : ''); } o.push(x); } return o; };
      return soLer({ getDisplayValues: ler, getValues: ler }, 'planilha');
    }
  }, 'planilha');
}
function config_(chave) { return AMB.config(chave); }
function inserirLinha_() { return foraDoNavegador_('gravar'); }
function atualizarLinha_(tab, linha, mud) { if (linha && linha._novo) return; return foraDoNavegador_('gravar'); }
function apagarLinha_() { return foraDoNavegador_('gravar'); }
function gravarLote_() { return foraDoNavegador_('gravar'); }
function regravarMudadas_() { return foraDoNavegador_('gravar'); }
function gravarVarias_() { return foraDoNavegador_('gravar'); }
function setConfig_() { return foraDoNavegador_('gravar'); }
function marcarMudanca_() { return foraDoNavegador_('gravar'); }
function comTrava_(fn) { return fn(); } // só leitura passa; se a função tentar gravar, os helpers acima param a conta
function registrar_() { /* o registro é só do servidor */ }
function asaasChave_() { return AMB.asaas ? 'ligado' : ''; }
var MEMO_LEITURA = null;
var VERSAO = '8.28.0';

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
  if (acao === 'fin.resumo') { var o = Object.assign({}, res); o.totais = semValores_(res.totais); o.faixas = semValores_(res.faixas); o.mes = null; o.agenda = (res.agenda || []).map(function (a) { return { dia: a.dia, qtd: a.qtd, valor: null }; }); return o; }
  return res;
}
var ESQUEMA = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'usuario', 'nome', 'perfil', 'hash', 'salt', 'ativo', 'tentativas', 'bloqueado_ate', 'criado_em', 'ultimo_acesso', 'sessao_versao', 'email', 'resumo_email'],
  ObsArquivo: ['id', 'cliente_id', 'texto', 'arquivado_em'],
  Clientes: ['id', 'tipo', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'estado_civil', 'profissao', 'representante',
    'cep', 'endereco', 'cidade', 'uf', 'telefone', 'email', 'origem', 'area', 'pasta_id', 'pasta_url',
    'observacoes', 'situacao', 'criado_em', 'atualizado_em', 'atualizado_por', 'tipo_acao', 'resumo_caso', 'providencias', 'genero',
    'acesso_hash', 'acesso_criado_em', 'como_conheceu', 'asaas_id'],
  Processos: ['id', 'cliente_id', 'cliente_nome', 'numero', 'tribunal', 'sistema', 'orgao', 'area', 'polo',
    'parte_contraria', 'proximo_ato', 'proximo_ato_data', 'status', 'observacoes', 'origem', 'criado_em',
    'atualizado_em', 'atualizado_por', 'ultimo_movimento', 'ultimo_movimento_em', 'classe', 'andamentos', 'datajud_em', 'fase', 'fase_auto', 'responsavel', 'avisado_mov_em', 'fluxo_fase'],
  Intimacoes: ['id', 'chave', 'fonte', 'recebido_em', 'numero', 'tribunal', 'movimento', 'evento', 'texto',
    'partes_cliente', 'processo_id', 'prazo_id', 'criado_em', 'resumo_ia', 'terminada_por', 'terminada_em', 'ok_por', 'ok_em'],
  Prazos: ['id', 'processo_id', 'numero', 'intimacao_id', 'descricao', 'dias', 'contagem', 'ciencia', 'ciencia_tipo',
    'fatal', 'situacao', 'conferido_por', 'conferido_em', 'origem', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por',
    'cumprido_por', 'cumprido_em', 'responsavel', 'etapa', 'resumo_ia', 'ok_por', 'ok_em', 'agenda_id', 'agenda_data', 'conferido_fonte'],
  Honorarios: ['id', 'cliente_id', 'processo_id', 'tipo', 'descricao', 'valor_total', 'percentual', 'valor_mensal',
    'dia_vencimento', 'inicio', 'situacao', 'observacoes', 'origem', 'criado_em', 'atualizado_em', 'atualizado_por'],
  Parcelas: ['id', 'honorario_id', 'cliente_id', 'numero', 'vencimento', 'valor', 'pago_em', 'valor_pago', 'forma',
    'cobranca', 'mensagem_em', 'acao_processo_id', 'observacoes', 'criado_em', 'atualizado_em', 'atualizado_por', 'recibo_url', 'asaas_id', 'asaas_link', 'asaas_status'],
  Recebimentos: ['id', 'honorario_id', 'processo_id', 'data', 'valor_bruto', 'percentual', 'honorarios', 'repasse_cliente',
    'repassado_em', 'observacoes', 'criado_em', 'criado_por'],
  Audiencias: ['chave', 'numero', 'data', 'hora', 'tipo', 'modo', 'link', 'testemunhas', 'obs', 'ciente_em', 'ciente_por', 'aviso_semana_em', 'aviso_semana_por',
    'aviso_vespera_em', 'aviso_vespera_por', 'aviso_dia_em', 'aviso_dia_por', 'criado_em', 'atualizado_em', 'atualizado_por'],
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
  Avisos: ['chave', 'tipo', 'ref', 'em', 'por'],
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

function falha_(msg, sessao) {
  var e = new Error(msg);
  e.publico = true;
  e.sessao = !!sessao;
  return e;
}

function publicoUsuario_(u) {
  var p = PERFIS[u.perfil];
  return { id: u.id, usuario: u.usuario, nome: u.nome, perfil: u.perfil, perfilNome: p.nome, pode: { financeiro: p.financeiro, usuarios: p.usuarios, conferePrazos: p.conferePrazos, ocultarValores: !!p.ocultarValores, future: podeFuture_(u) } };
}

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
  // 8.28: os andamentos do DataJud não vão na ficha (a tela do processo busca pela rota processos.andamentos)
  return { cliente: cli, processos: procs.map(function (p) { var x = limpar_(p); delete x.andamentos; return x; }), parcelas: parcelasAbertasCliente_(c.id), lead: lead, jornada: j, jornada_nome: JORNADA[j] };
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

function limpar_(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') r[k] = o[k]; });
  return r;
}

function usuarios_() {
  try { return tabela_('Usuarios').linhas; } catch (e) { return []; }
}

function novoId_(prefixo) {
  return prefixo + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function normalizar_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

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

function cienciaEfetiva_(iso, tribunal, feriados, corridos) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso;
  var d = iso;
  for (var i = 0; i < 60 && !ehUtil_(d, tribunal, feriados, !!corridos); i++) d = somarDias_(d, 1);
  return d;
}
function nomesFeriados_() {
  var nomes = {}, ano = +hojeSP_().slice(0, 4);
  var rot = ['Confraternização Universal', 'Carnaval', 'Carnaval', 'Quarta-feira Santa (Lei 5.010/66)', 'Quinta-feira Santa', 'Sexta-feira da Paixão', 'Tiradentes', 'Dia do Trabalho', 'Corpus Christi',
    'Fundação dos cursos jurídicos (Lei 5.010/66)', 'Independência', 'Nossa Senhora Aparecida', 'Finados', 'Proclamação da República', 'Consciência Negra', 'Dia da Justiça (Lei 5.010/66)', 'Natal'];
  [ano - 1, ano, ano + 1, ano + 2].forEach(function (a) { feriadosDoAno_(a).forEach(function (f, i) { nomes[f[0]] = rot[i] || 'feriado'; }); });
  try { tabela_('Feriados').linhas.forEach(function (f) { if (f.data) nomes[f.data] = f.descricao || 'feriado'; }); } catch (e) { /* segue */ }
  return nomes;
}
function motivoSemExpediente_(iso, nomes) {
  var w = new Date(iso + 'T12:00:00Z').getUTCDay();
  return nomes[iso] || (w === 0 ? 'domingo' : w === 6 ? 'sábado' : (iso.slice(5) >= '12-20' || iso.slice(5) <= '01-20') ? 'recesso forense (20/12 a 20/01)' : 'sem expediente');
}
/** Memória de cálculo de um prazo: passo a passo, como no PJe. */
function memoriaPrazo_(d) {
  var z = d.id ? tabela_('Prazos').linhas.filter(function (x) { return x.id === d.id; })[0] : null;
  var p = z ? (tabela_('Processos').linhas.filter(function (x) { return x.id === z.processo_id; })[0] || {}) : {};
  var ciencia = z ? z.ciencia : d.ciencia, dias = parseInt(z ? z.dias : d.dias, 10), cont = (z ? z.contagem : d.contagem) === 'corridos' ? 'corridos' : 'uteis';
  var trib = (z ? (p.tribunal || tribunalDoNumero_(z.numero)) : d.tribunal) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ciencia || '') || !(dias > 0)) return { passos: [{ t: 'Sem data de ciência ou sem número de dias: o prazo precisa ser conferido no sistema do tribunal.' }] };
  var fer = mapaFeriados_(), nomes = nomesFeriados_(), passos = [], corr = cont === 'corridos';
  if (z && z.ciencia_tipo) passos.push({ t: 'Como a intimação chegou: ' + z.ciencia_tipo + '.' });
  var ef = cienciaEfetiva_(ciencia, trib, fer, corr);
  passos.push({ t: 'Ciência: ' + dataBR_(ciencia) + (ef !== ciencia ? ' — ' + motivoSemExpediente_(ciencia, nomes) + ', vale o 1º dia útil seguinte: ' + dataBR_(ef) : '') + '.' });
  var dia = ef, n = 0, contados = [], pulados = [];
  if (corr) {
    var fim = somarDias_(ef, dias);
    passos.push({ t: dias + ' dias corridos a partir do dia seguinte (' + dataBR_(somarDias_(ef, 1)) + '): termina em ' + dataBR_(fim) + '.' });
    if (!ehUtil_(fim, trib, fer, true)) { var fu = cienciaEfetiva_(fim, trib, fer, true); passos.push({ t: dataBR_(fim) + ' é ' + motivoSemExpediente_(fim, nomes) + ': vai para o próximo dia útil, ' + dataBR_(fu) + '.' }); fim = fu; }
    return { fatal: fim, calculado: fim, gravado: z ? z.fatal : '', confere: !z || z.fatal === fim, passos: passos, tribunal: trib };
  }
  while (n < dias && contados.length < 400) {
    dia = somarDias_(dia, 1);
    if (ehUtil_(dia, trib, fer, false)) { n++; contados.push(dia); } else pulados.push({ data: dia, motivo: motivoSemExpediente_(dia, nomes) });
  }
  passos.push({ t: 'Começa a contar no dia útil seguinte: ' + dataBR_(contados[0]) + ' (dia 1).' });
  var feriadosPulados = pulados.filter(function (x) { return !/sábado|domingo/.test(x.motivo); });
  if (feriadosPulados.length) passos.push({ t: 'Dias sem expediente pulados (fora sábados e domingos): ' + feriadosPulados.map(function (x) { return dataBR_(x.data) + ' (' + x.motivo + ')'; }).join('; ') + '.' });
  passos.push({ t: 'Dia ' + dias + ' (último): ' + dataBR_(dia) + '.' });
  return { fatal: dia, calculado: dia, gravado: z ? z.fatal : '', confere: !z || z.fatal === dia, passos: passos, tribunal: trib,
    dias: contados.map(function (x, i) { return { n: i + 1, data: x }; }), pulados: pulados };
}

/**
 * 8.23 Revisão dos prazos (pedido da usuária: "tem prazos que não fazem sentido; os vencidos que já foram feitos, dê baixa").
 * Categorias: repetidos (mesmo processo/intimação, mesma descrição e data), Vista ao Ministério Público (não é prazo do escritório),
 * intimação de audiência quando a audiência já está na agenda (fica com o controle de Audiências e os 3 avisos), data diferente do
 * motor novo (recalcula) e vencidos ainda abertos (baixa como feito, com marca — dá para reabrir).
 */
var FASES = { contratado: 'Petição inicial (a ajuizar)', ajuizado: 'Ajuizado (citação)', conciliacao: 'Audiência de conciliação',
  andamento: 'Em andamento (defesa e réplica)', pericia: 'Perícia', instrucao: 'Audiência de instrução', sentenca: 'Sentença',
  acordo: 'Acordo', homologacao: 'Homologação', recurso: 'Recurso', execucao: 'Execução / cumprimento', extinto: 'Encerrado / arquivado' };
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

function diffDias_(a, b) {
  return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
}

/* ---------- Leitura do Gmail (eproc TJSC/JFSC e PJe TRT) ---------- */

var RE_CNJ = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/;

/** Confere o dígito verificador do número CNJ (módulo 97). Número com dígito errado não é achado no PJe/eproc nem no DataJud. */
function dataBR_(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }

/* ---------- Prazos: leitura e edição pelo painel ---------- */

/** 8.19: prazos do robô no PJe lançados pela regra antiga (ciência tácita 10 dias depois da expedição) passam a contar da publicação
 *  no DJEN (dia útil seguinte à expedição, ou a data exata se o DJEN do mesmo processo já chegou). Não mexe em conferido, vinculado
 *  nem em audiência/perícia. Roda uma vez sozinho (Config FIX_PRAZOS_819) e pelo botão em Intimações e prazos (prévia + aplicar). */
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
  // 8.21: os três avisos (1 semana, véspera útil, no dia) — o que está na hora e ninguém fez aparece aqui
  audienciasLista_(7).forEach(function (e) {
    var quem = nomeDe(sec), sub = (e.cliente ? e.cliente + ' · ' : '') + (e.numero || e.titulo || '');
    var tit = e.nome.charAt(0).toUpperCase() + e.nome.slice(1) + ' em ' + dataBR_(e.data) + (e.hora ? ' às ' + e.hora : '');
    if (!e.hora) itens.push({ tipo: 'semhora', nivel: 'aviso', ordem: 3, titulo: tit + ' — sem horário', sub: sub, quem: quem, quem_us: sec || '', acao: 'Abrir o processo e lançar o horário na agenda', link: '#/audiencias', fatal: e.data });
    if (e.devido) itens.push({ tipo: 'aviso', nivel: e.devido === 'semana' ? 'aviso' : 'risco', ordem: e.devido === 'semana' ? 4 : 1, titulo: tit + ' — falta o aviso ' + NOME_AVISO_ATO[e.devido], sub: sub, quem: quem, quem_us: sec || '', acao: 'Avisar o cliente no WhatsApp (Audiências)', link: '#/audiencias', fatal: e.data });
    if (e.tipo === 'instrucao' && !e.testemunhas.length) itens.push({ tipo: 'testemunhas', nivel: 'aviso', ordem: 4, titulo: tit + ' — testemunhas não anotadas', sub: sub, quem: quem, quem_us: sec || '', acao: 'Perguntar ao cliente e anotar nome, CPF e telefone (Audiências)', link: '#/audiencias', fatal: e.data });
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
  x.avisar_cliente = avisoClienteDe_(z, (prazoPublico_.intims || {})[z.intimacao_id]);
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
  var intims = {}; try { tabela_('Intimacoes').linhas.forEach(function (i) { intims[i.id] = { movimento: i.movimento, texto: String(i.texto || '').slice(0, 1500) }; }); } catch (e) { /* segue */ }
  prazoPublico_.intims = intims;
  var limiteFechados = somarDias_(hojeSP_(), -30);
  return tabela_('Prazos').linhas
    .filter(function (z) {
      if (d.processo_id && z.processo_id !== d.processo_id) return false;
      return SITUACOES_ABERTAS.indexOf(z.situacao) >= 0 || (d.encerrados && (z.atualizado_em || '').slice(0, 10) >= limiteFechados);
    })
    .map(function (z) { return prazoPublico_(z, procs, nomes); })
    .sort(function (a, b) { return (a.fatal || '0000') < (b.fatal || '0000') ? -1 : 1; });
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

/* 8.25 (pedido da usuária: "a agenda trava muito"): os eventos do Google ficam guardados por MÊS na memória do servidor (10 min);
   o aquecedor deixa prontos o mês passado, o atual e o próximo. Mudança feita pelo painel (compromisso, ato, prazo, WhatsApp) troca a
   versão (`mudouAgenda_`) e a próxima leitura vai ao Google; mudança feita direto no Google aparece em até 10 min. */
function mudouAgenda_() { try { CacheService.getScriptCache().put('versao_agenda', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); } catch (e) { /* segue */ } }
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

/* ================================================================== */
/* 8.22 Cobrança automática com boleto e Pix (Asaas) — pedido da usuária ("igual ao Asaas")
 * A chave da API fica SÓ nas Propriedades do script (ASAAS_CHAVE), nunca na planilha nem no repositório.
 * Gera a cobrança (boleto + Pix + cartão: o cliente escolhe) de cada parcela, manda o link pelo WhatsApp e, quando o cliente paga,
 * o robô dá baixa sozinho na parcela (com recibo). O Asaas também manda os lembretes por e-mail/SMS que estiverem ligados na conta.
 * ================================================================== */
var HON_FORA = /^(retirado|cancelado)/;
/** "Retirar honorário": sai da cobrança SEM virar saldo. As parcelas NÃO pagas somem; as pagas ficam como histórico. Só administração e RH. */
function acaoCobranca_(d) {
  var hoje = hojeSP_(), clientes = mapaClientes_(), hons = {}, porCli = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var ignorados = {}; String(config_('ACAO_COB_IGNORADOS') || '').split(',').forEach(function (x) { if (x) ignorados[x] = 1; });
  tabela_('Parcelas').linhas.forEach(function (p) {
    var h = hons[p.honorario_id] || {};
    if (HON_FORA.test(h.situacao || '') || /encerrado/.test(h.situacao || '')) return;
    if (situacaoParcela_(p, hoje) !== 'atrasada') return;
    var dias = diffDias_(hoje, p.vencimento);
    var g = porCli[p.cliente_id] = porCli[p.cliente_id] || { cliente_id: p.cliente_id, parcelas: [], total: 0, mais_antiga: '', ultimo_aviso: '', marcado_acao: false, honorarios: {}, promissoria: false };
    var saldo = dinheiro_(p.valor) - dinheiro_(p.valor_pago);
    g.parcelas.push({ id: p.id, numero: p.numero, vencimento: p.vencimento, valor: saldo, dias: dias, cobranca: p.cobranca || '', mensagem_em: p.mensagem_em || '' });
    g.total += saldo;
    if (!g.mais_antiga || p.vencimento < g.mais_antiga) g.mais_antiga = p.vencimento;
    if ((p.mensagem_em || '') > g.ultimo_aviso) g.ultimo_aviso = p.mensagem_em;
    if (p.cobranca === 'acao') g.marcado_acao = true;
    g.honorarios[h.id] = h.descricao || TIPOS_HONORARIO[h.tipo] || '';
    if (/promiss/i.test((h.observacoes || '') + ' ' + (h.descricao || '') + ' ' + (p.observacoes || ''))) g.promissoria = true;
  });
  var lista = Object.keys(porCli).map(function (k) {
    var g = porCli[k], c = clientes[k] || {}, dias = diffDias_(hoje, g.mais_antiga);
    var prescreve = somarDias_(g.mais_antiga, 0).replace(/^(\d{4})/, function (a) { return String(+a + 5); });
    g.cliente = c.nome || ''; g.telefone = c.telefone || ''; g.cpf = c.cpf_cnpj ? 'sim' : ''; g.endereco = c.endereco ? 'sim' : '';
    g.dias = dias; g.total = Math.round(g.total * 100) / 100; g.prescreve_em = prescreve; g.dias_prescricao = diffDias_(prescreve, hoje);
    g.honorarios = Object.keys(g.honorarios).map(function (id) { return { id: id, descricao: g.honorarios[id] }; });
    g.etapa = g.marcado_acao ? 'acao' : !g.ultimo_aviso ? 'whatsapp' : diffDias_(hoje, g.ultimo_aviso) >= 15 ? (dias >= 90 ? 'notificacao' : 'whatsapp') : 'aguardando';
    g.ignorado = !!ignorados[k];
    return g;
  }).filter(function (g) { return g.marcado_acao || g.dias > 60; })
    .sort(function (a, b) { return (b.marcado_acao - a.marcado_acao) || (a.dias_prescricao - b.dias_prescricao) || (b.total - a.total); });
  return { hoje: hoje, lista: lista.filter(function (g) { return !g.ignorado || d.todos; }), ignorados: lista.filter(function (g) { return g.ignorado; }).length };
}
function conferenciaCobrancas_() {
  var hoje = hojeSP_(), clientes = mapaClientes_(), hons = {}, porHon = {}, itens = [];
  var add = function (tipo, nivel, titulo, sub, link, cliente_id) { itens.push({ tipo: tipo, nivel: nivel, titulo: titulo, sub: sub || '', link: link || '', cliente: (clientes[cliente_id] || {}).nome || '', cliente_id: cliente_id || '' }); };
  var honsL = tabela_('Honorarios').linhas;
  honsL.forEach(function (h) { hons[h.id] = h; porHon[h.id] = []; });
  var parcs = tabela_('Parcelas').linhas.filter(function (p) { return p.id; });
  parcs.forEach(function (p) {
    if (!hons[p.honorario_id]) { add('orfa', 'erro', 'Parcela sem honorário', 'parcela ' + (p.numero || '') + ' · venc. ' + dataBR_(p.vencimento) + ' · ' + reaisTxt_(dinheiro_(p.valor)), '#/cliente/' + p.cliente_id, p.cliente_id); return; }
    porHon[p.honorario_id].push(p);
    if (!(dinheiro_(p.valor) > 0)) add('semvalor', 'erro', 'Parcela sem valor', 'parcela ' + (p.numero || '') + ' · venc. ' + dataBR_(p.vencimento), '#/honorario/' + p.honorario_id, p.cliente_id);
    if (!p.vencimento) add('semvenc', 'erro', 'Parcela sem vencimento', 'parcela ' + (p.numero || ''), '#/honorario/' + p.honorario_id, p.cliente_id);
    if (p.pago_em && p.pago_em.slice(0, 10) > hoje) add('futuro', 'aviso', 'Pagamento com data no futuro', 'pago em ' + dataBR_(p.pago_em.slice(0, 10)), '#/honorario/' + p.honorario_id, p.cliente_id);
    if (!p.pago_em && p.vencimento && diffDias_(hoje, p.vencimento) > 5 * 365 && !HON_FORA.test(hons[p.honorario_id].situacao || ''))
      add('prescrita', 'aviso', 'Dívida com mais de 5 anos (pode ter prescrito — art. 25 do EAOAB)', 'venc. ' + dataBR_(p.vencimento) + ' · ' + reaisTxt_(dinheiro_(p.valor)) + ' · decidir: cobrar (se houve interrupção) ou retirar', '#/honorario/' + p.honorario_id, p.cliente_id);
    if (p.pago_em && p.cliente_id && hons[p.honorario_id].cliente_id && p.cliente_id !== hons[p.honorario_id].cliente_id) add('cliente', 'erro', 'Parcela ligada a outro cliente que não o do honorário', '', '#/honorario/' + p.honorario_id, p.cliente_id);
  });
  // parcelas repetidas no mesmo honorário (mesmo vencimento e valor, as duas em aberto)
  Object.keys(porHon).forEach(function (hid) {
    var vistos = {};
    porHon[hid].forEach(function (p) {
      if (p.pago_em) return;
      var k = p.vencimento + '|' + dinheiro_(p.valor);
      if (vistos[k]) add('dupparc', 'erro', 'Parcela repetida no mesmo honorário', 'venc. ' + dataBR_(p.vencimento) + ' · ' + reaisTxt_(dinheiro_(p.valor)) + ' (2 vezes em aberto)', '#/honorario/' + hid, p.cliente_id);
      vistos[k] = 1;
    });
  });
  // honorários repetidos (mesmo cliente, tipo, valor/percentual; os dois ativos) e honorário sem parcelas
  var chH = {};
  honsL.forEach(function (h) {
    if (!h.id || HON_FORA.test(h.situacao || '') || /encerrado/.test(h.situacao || '')) return;
    var k = h.cliente_id + '|' + h.tipo + '|' + dinheiro_(h.valor_total) + '|' + dinheiro_(h.percentual) + '|' + dinheiro_(h.valor_mensal);
    if (chH[k]) add('duphon', 'erro', 'Honorário em duplicidade', (TIPOS_HONORARIO[h.tipo] || h.tipo) + (h.valor_total ? ' · ' + reaisTxt_(dinheiro_(h.valor_total)) : '') + (h.percentual ? ' · ' + h.percentual + '%' : '') + ' — confira e use "Retirar honorário" no repetido', '#/honorario/' + h.id, h.cliente_id);
    chH[k] = 1;
    if ((h.tipo === 'parcelado' || h.tipo === 'mensal') && !porHon[h.id].length) add('semparc', 'aviso', 'Honorário ' + (TIPOS_HONORARIO[h.tipo] || h.tipo).toLowerCase() + ' sem nenhuma parcela', h.descricao || '', '#/honorario/' + h.id, h.cliente_id);
    if (h.tipo === 'parcelado' && porHon[h.id].length && dinheiro_(h.valor_total) > 0) {
      var soma = porHon[h.id].reduce(function (t, p) { return t + dinheiro_(p.valor); }, 0);
      if (Math.abs(soma - dinheiro_(h.valor_total)) > 1) add('soma', 'aviso', 'Soma das parcelas diferente do valor do contrato', 'contrato ' + reaisTxt_(dinheiro_(h.valor_total)) + ' · parcelas ' + reaisTxt_(soma) + ' (renegociação ou desconto? confira)', '#/honorario/' + h.id, h.cliente_id);
    }
    if (h.situacao === 'importado — conferir') add('importado', 'info', 'Honorário importado ainda não conferido', (TIPOS_HONORARIO[h.tipo] || h.tipo) + (h.descricao ? ' · ' + h.descricao : ''), '#/honorario/' + h.id, h.cliente_id);
  });
  // cliente com processo ativo e SEM honorário nenhum (pode ter ficado de fora)
  var comHon = {}; honsL.forEach(function (h) { if (h.cliente_id) comHon[h.cliente_id] = 1; });
  var semHon = {};
  tabela_('Processos').linhas.forEach(function (p) {
    if (!p.cliente_id || comHon[p.cliente_id] || semHon[p.cliente_id]) return;
    if (/arquiv|baixad|encerr/i.test(p.status || '') || p.fase === 'extinto') return;
    semHon[p.cliente_id] = 1;
    add('semhon', 'info', 'Cliente com processo ativo e sem honorário no painel', (p.numero || 'sem número') + (p.area ? ' · ' + p.area : '') + ' — lance o honorário ou confira no GEA/contrato', '#/cliente/' + p.cliente_id, p.cliente_id);
  });
  var ordem = { erro: 0, aviso: 1, info: 2 };
  itens.sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel] || (a.cliente < b.cliente ? -1 : 1); });
  var cont = {}; itens.forEach(function (x) { cont[x.tipo] = (cont[x.tipo] || 0) + 1; });
  return { itens: itens.slice(0, 600), total: itens.length, contagem: cont, parcelas: parcs.length, honorarios: honsL.length };
}

function resumoFinanceiro_() {
  comTrava_(estenderMensais_);
  var hoje = hojeSP_();
  var clientes = mapaClientes_();
  var hons = {};
  tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var parcelas = tabela_('Parcelas').linhas.filter(function (p) { return !HON_FORA.test((hons[p.honorario_id] || {}).situacao || ''); }).map(function (p) { return parcelaPublica_(p, hoje, clientes, hons); });
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
    proximas: proximas.slice(0, 100), asaas: !!asaasChave_(),
    // 8.23 layout novo: meta do mês (tudo que vence no mês) × recebido, agenda dos próximos 14 dias e os recebidos do mês
    mes: (function () {
      var previsto = parcelas.filter(function (q) { return (q.vencimento || '').slice(0, 7) === mes; });
      var prev = soma(previsto, function (q) { return dinheiro_(q.valor); }), receb = soma(recebMes, function (q) { return dinheiro_(q.valor_pago) || dinheiro_(q.valor); });
      return { mes: mes, previsto: prev, recebido: receb, falta: soma(previsto.filter(function (q) { return q.situacao !== 'paga'; }), function (q) { return q.saldo; }), qtd: previsto.length, pagas: previsto.filter(function (q) { return q.situacao === 'paga'; }).length };
    })(),
    agenda: (function () {
      var r = [];
      for (var i = 0; i < 14; i++) {
        var dia = somarDias_(hoje, i), doDia = parcelas.filter(function (q) { return q.vencimento === dia && q.situacao !== 'paga'; });
        r.push({ dia: dia, valor: soma(doDia, function (q) { return q.saldo; }), qtd: doDia.length });
      }
      return r;
    })(),
    recebidas: parcelas.filter(function (q) { return (q.pago_em || '').slice(0, 7) === mes; }).sort(function (a, b) { return a.pago_em < b.pago_em ? 1 : -1; }).slice(0, 100),
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
    asaas: !!asaasChave_(), recebimentos: tabela_('Recebimentos').linhas.filter(function (r) { return r.honorario_id === h.id; }).map(limpar_)
  };
}

/**
 * Cria ou altera um honorário. Ao criar um parcelado, gera as parcelas (n, primeiro vencimento);
 * ao criar um mensal, gera as mensalidades até 2 meses à frente.
 */
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
function diaDoEvento_(ev, cal) {
  if (ev.isAllDayEvent()) {
    var fuso = TZ; try { fuso = (cal && cal.getTimeZone()) || TZ; } catch (e) { /* fuso padrão */ }
    return Utilities.formatDate(ev.getAllDayStartDate(), fuso, 'yyyy-MM-dd');
  }
  return Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd');
}

/* ---------- Robô: lembrete de audiência e perícia (2 dias úteis antes) ---------- */

function tipoAtoDe_(t) { t = normalizar_(t); return /peri/.test(t) ? 'pericia' : /instru/.test(t) ? 'instrucao' : 'conciliacao'; }

/** Dia em que o lembrete aparece: 2 dias úteis antes do ato. */
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

/* ---------- 8.21 Audiências: TRÊS avisos ao cliente + ficha (pedido da usuária: "NUNCA deixe de avisar") ----------
 * 1 semana antes (se o dia cair em sábado, domingo ou feriado → o dia útil ANTERIOR), na véspera útil (audiência na segunda → avisa
 * na sexta) e NO DIA. Cada aviso vira tarefa da secretaria com o WhatsApp pronto; a tela Audiências (#/audiencias) mostra os três
 * checks, a ciência da equipe, se é online ou presencial e as testemunhas (nome, CPF, telefone) da instrução. */
var NOME_AVISO_ATO = { semana: '1 semana antes', vespera: 'véspera', dia: 'no dia' };
function utilAteh_(iso, fer) { var d = iso; for (var i = 0; i < 15 && !ehUtil_(d, 'todos', fer, true); i++) d = somarDias_(d, -1); return d; }
function utilAntes_(iso, fer) { return utilAteh_(somarDias_(iso, -1), fer); }
/** Dias em que cada aviso deve sair. */
function diasDosAvisos_(data, fer) {
  var vespera = utilAntes_(data, fer), semana = utilAteh_(somarDias_(data, -7), fer);
  return { semana: semana < vespera ? semana : vespera, vespera: vespera, dia: data };
}
/** Qual aviso está na hora (o mais urgente que ainda falta). */
function avisoDevido_(data, hoje, feitos, fer) {
  var d = diasDosAvisos_(data, fer);
  if (hoje === data) return feitos.dia ? '' : 'dia';
  if (hoje > data) return '';
  if (hoje >= d.vespera) return feitos.vespera ? '' : 'vespera';
  if (hoje >= d.semana) return feitos.semana ? '' : 'semana';
  return '';
}
function fichasAtos_() {
  var r = {}, tab = tabela_('Audiencias');
  tab.linhas.forEach(function (f) { if (f.chave) r[f.chave] = f; });
  return { tab: tab, porChave: r };
}
/** Ficha de um ato (se a audiência mudou de dia, herda testemunhas/modo da ficha anterior do mesmo processo e tipo). */
function fichaDoAto_(fichas, a) {
  var f = fichas.porChave[a.chave];
  if (f) return f;
  var ant = fichas.tab.linhas.filter(function (x) { return a.numero && x.numero === a.numero && x.tipo === a.tipo; }).sort(function (x, y) { return x.data < y.data ? 1 : -1; })[0];
  return ant ? { chave: '', herdada: true, modo: ant.modo, link: ant.link, testemunhas: ant.testemunhas, obs: ant.obs } : null;
}
/** Estado dos três avisos de um ato: Eventos (antigo) + ficha + tarefas do robô concluídas. */
function estadoAvisosAto_(a, tarefasAviso, fichas) {
  var f = fichas.porChave[a.chave] || {}, e = a.ev || {}, r = {};
  var tS = tarefasAviso[a.chave] || {}, tV = tarefasAviso[a.chave + '|vespera'] || {}, tD = tarefasAviso[a.chave + '|dia'] || {};
  r.semana = { em: f.aviso_semana_em || e.avisado_em || (tS.feita ? tS.em : ''), por: f.aviso_semana_por || e.avisado_por || tS.por || '' };
  r.vespera = { em: f.aviso_vespera_em || (tV.feita ? tV.em : ''), por: f.aviso_vespera_por || tV.por || '' };
  r.dia = { em: f.aviso_dia_em || e.avisado_dia_em || (tD.feita ? tD.em : ''), por: f.aviso_dia_por || e.avisado_dia_por || tD.por || '' };
  return r;
}
function tarefasDeAviso_(tabT) {
  var r = {};
  tabT.linhas.forEach(function (t) {
    var re = /\[lembrete:([^\]]+)\]/g, m;
    while ((m = re.exec(t.descricao || ''))) r[m[1]] = { feita: !abertaT_(t) && t.situacao !== 'cancelada', aberta: abertaT_(t), por: t.concluida_por || '', em: t.concluida_em || '', id: t.id };
  });
  return r;
}
function testemunhasDe_(f) { try { var l = JSON.parse((f && f.testemunhas) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }

/** Lista para a tela Audiências e para o Início: atos de hoje até +dias, com cliente, avisos, ficha e o aviso devido agora. */
function audienciasLista_(dias) {
  var hoje = hojeSP_(), ate = somarDias_(hoje, Math.min(120, Math.max(1, +dias || 60))), fer = mapaFeriados_();
  var clis = {}, procs = {};
  tabela_('Clientes').linhas.forEach(function (c) { clis[c.id] = c; });
  tabela_('Processos').linhas.forEach(function (p) { if (p.numero) procs[p.numero] = p; });
  var tAv = tarefasDeAviso_(tabela_('Tarefas')), fichas = fichasAtos_();
  return atosDaAgenda_(hoje, ate, tabela_('Eventos')).slice(0, 150).map(function (a) {
    var p = procs[a.numero] || {}, c = clis[p.cliente_id] || {}, e = a.ev || {}, f = fichaDoAto_(fichas, a) || {};
    var av = estadoAvisosAto_(a, tAv, fichas), feitos = { semana: !!av.semana.em, vespera: !!av.vespera.em, dia: !!av.dia.em };
    return { chave: e.chave || a.chave, lembrete: a.chave, tipo: a.tipo, nome: a.nome, data: a.data, hora: a.hora || '', numero: a.numero, local: a.local || p.orgao || '',
      titulo: a.titulo || '', cliente: c.nome || (p.cliente_nome !== 'a identificar' ? p.cliente_nome : '') || '', cliente_id: c.id || '', telefone: c.telefone || '', processo_id: p.id || '',
      avisos: av, dias_aviso: diasDosAvisos_(a.data, fer), devido: avisoDevido_(a.data, hoje, feitos, fer),
      modo: f.modo || '', link: f.link || '', testemunhas: testemunhasDe_(f), obs: f.obs || '', ciente_em: f.ciente_em || '', ciente_por: f.ciente_por || '',
      // compatibilidade com o Início antigo
      avisado_em: av.semana.em, avisado_por: av.semana.por, avisado_dia_em: av.dia.em, avisado_dia_por: av.dia.por };
  });
}

/** Grava a ficha da audiência (modo, link, testemunhas, observação, ciência). */
var FLUXOS = {
  Trabalhista: {
    contratado: ['Conferir procuração, contrato e declaração de hipossuficiência assinados', 'Reunir CTPS, contracheques, TRCT, extrato do FGTS e registros de ponto',
      'Pedir ao cliente os nomes e telefones de possíveis testemunhas', 'Calcular os pedidos (planilha de cálculos)', 'Redigir a petição inicial',
      'Mandar a inicial ao cliente aprovar', 'Protocolar e lançar o número no painel'],
    ajuizado: ['Mandar ao cliente o código do Acompanhe', 'Conferir a notificação da reclamada', 'Conferir no PJe a data da audiência'],
    conciliacao: ['Combinar com o cliente o valor mínimo para acordo', 'Conferir se a audiência é online ou presencial (Audiências)', 'Preparar proposta e contraproposta',
      'Conferir que os 3 avisos ao cliente saíram (1 semana, véspera, no dia)'],
    andamento: ['Ler a contestação e os documentos da reclamada', 'Fazer a réplica no prazo', 'Avisar o cliente sobre a defesa da empresa', 'Avaliar se precisa de perícia'],
    pericia: ['Indicar assistente técnico e quesitos', 'Avisar o cliente da data, do local e do que levar', 'Manifestar sobre o laudo no prazo'],
    instrucao: ['Anotar as testemunhas (nome, CPF, telefone) em Audiências', 'Preparar o roteiro de perguntas', 'Preparar o cliente para o depoimento',
      'Conferir se o juízo pediu rol de testemunhas'],
    sentenca: ['Ler a sentença e explicar ao cliente', 'Avaliar embargos de declaração (5 dias) e recurso ordinário (8 dias)', 'Lançar no Financeiro o êxito, se houver valor'],
    acordo: ['Conferir o termo do acordo (valores, datas, multa)', 'Lançar as parcelas do acordo e os honorários de êxito no Financeiro', 'Acompanhar cada pagamento e avisar o cliente'],
    recurso: ['Recurso ou contrarrazões no prazo', 'Avisar o cliente', 'Acompanhar a pauta de julgamento'],
    execucao: ['Conferir ou impugnar os cálculos de liquidação', 'Pedir bloqueio (SISBAJUD) se não pagar', 'Lançar o alvará e os honorários quando sair', 'Repassar ao cliente com recibo'],
    extinto: ['Repassar os valores e dar quitação', 'Devolver os documentos originais', 'Arquivar a pasta do cliente']
  },
  'Previdenciário': {
    contratado: ['Conferir procuração, contrato previdenciário e declaração de hipossuficiência assinados', 'Reunir CNIS, carta do INSS (indeferimento), laudos, atestados e PPP',
      'Pegar o acesso ao Meu INSS do cliente', 'Conferir tempo de contribuição e carência', 'Redigir o requerimento ou a petição inicial', 'Protocolar e lançar o número no painel'],
    ajuizado: ['Mandar ao cliente o código do Acompanhe', 'Conferir a citação do INSS'],
    pericia: ['Avisar o cliente da data, do local e dos exames que deve levar', 'Apresentar quesitos', 'Manifestar sobre o laudo no prazo'],
    andamento: ['Ler a contestação do INSS', 'Réplica no prazo', 'Avisar o cliente'],
    sentenca: ['Ler a sentença e explicar ao cliente', 'Avaliar recurso no prazo', 'Acompanhar a implantação do benefício'],
    recurso: ['Recurso ou contrarrazões no prazo', 'Avisar o cliente'],
    execucao: ['Conferir o cálculo dos atrasados', 'Acompanhar RPV/precatório', 'Lançar os honorários (2 primeiras parcelas / percentual) no Financeiro', 'Repassar ao cliente com recibo'],
    extinto: ['Dar quitação ao cliente', 'Arquivar a pasta']
  },
  'Família': {
    contratado: ['Conferir procuração e contrato assinados', 'Reunir certidões (casamento, nascimento), documentos dos filhos e comprovantes de renda',
      'Relacionar os bens (se houver partilha)', 'Redigir a petição inicial', 'Protocolar e lançar o número no painel'],
    conciliacao: ['Combinar com o cliente o que aceita em acordo (pensão, guarda, visitas, bens)', 'Conferir se a audiência é online ou presencial', 'Conferir os 3 avisos ao cliente'],
    andamento: ['Ler a contestação', 'Réplica no prazo', 'Avisar o cliente'],
    sentenca: ['Explicar a sentença ao cliente', 'Avaliar recurso no prazo'],
    acordo: ['Conferir o termo do acordo', 'Explicar ao cliente o que foi combinado'],
    extinto: ['Entregar cópia da sentença/acordo ao cliente', 'Arquivar a pasta']
  },
  'Cível': {
    contratado: ['Conferir procuração e contrato assinados', 'Reunir contratos, comprovantes, conversas e prints', 'Redigir a petição inicial', 'Protocolar e lançar o número no painel'],
    conciliacao: ['Combinar com o cliente o valor mínimo para acordo', 'Conferir se a audiência é online ou presencial', 'Conferir os 3 avisos ao cliente'],
    andamento: ['Ler a contestação', 'Réplica no prazo', 'Especificar provas'],
    sentenca: ['Explicar a sentença ao cliente', 'Avaliar recurso no prazo'],
    execucao: ['Pedir o cumprimento de sentença', 'Lançar o valor e os honorários quando sair', 'Repassar ao cliente com recibo'],
    extinto: ['Dar quitação ao cliente', 'Arquivar a pasta']
  },
  Criminal: {
    contratado: ['Conferir procuração e contrato assinados', 'Pedir cópia do inquérito/processo', 'Conversar com o cliente sobre a versão dos fatos', 'Relacionar testemunhas de defesa'],
    andamento: ['Resposta à acusação no prazo (10 dias)', 'Avisar o cliente'],
    instrucao: ['Anotar as testemunhas de defesa em Audiências', 'Preparar o cliente para o interrogatório', 'Preparar o roteiro de perguntas'],
    sentenca: ['Explicar a sentença ao cliente', 'Avaliar apelação (5 dias)'],
    recurso: ['Razões ou contrarrazões no prazo', 'Avisar o cliente'],
    extinto: ['Arquivar a pasta']
  },
  geral: {
    contratado: ['Conferir procuração e contrato assinados', 'Reunir os documentos do caso', 'Redigir a petição inicial', 'Protocolar e lançar o número no painel'],
    ajuizado: ['Mandar ao cliente o código do Acompanhe'],
    conciliacao: ['Combinar com o cliente o que aceita em acordo', 'Conferir os 3 avisos ao cliente'],
    andamento: ['Ler a defesa da outra parte', 'Réplica no prazo', 'Avisar o cliente'],
    pericia: ['Quesitos e assistente técnico', 'Avisar o cliente', 'Manifestar sobre o laudo'],
    instrucao: ['Anotar as testemunhas em Audiências', 'Preparar o cliente'],
    sentenca: ['Explicar a sentença ao cliente', 'Avaliar recurso no prazo'],
    acordo: ['Conferir o termo do acordo', 'Lançar os valores no Financeiro'],
    recurso: ['Recurso ou contrarrazões no prazo', 'Avisar o cliente'],
    execucao: ['Cumprimento de sentença / cálculos', 'Lançar o valor e os honorários quando sair', 'Repassar ao cliente'],
    extinto: ['Dar quitação ao cliente', 'Arquivar a pasta']
  }
};
function fluxoDe_(area, fase) {
  var a = String(area || '');
  var chave = /trabalh/i.test(a) ? 'Trabalhista' : /previd/i.test(a) ? 'Previdenciário' : /fam[ií]l/i.test(a) ? 'Família' : /c[ií]vel|consum|banc/i.test(a) ? 'Cível' : /crim|penal/i.test(a) ? 'Criminal' : 'geral';
  return { area: chave, itens: (FLUXOS[chave] && FLUXOS[chave][fase]) || FLUXOS.geral[fase] || [] };
}
/** Tela do processo: checklist da etapa atual e a tarefa do fluxo (se já existe). */
function fluxoProcesso_(d) {
  var p = tabela_('Processos').linhas.filter(function (x) { return x.id === d.id; })[0];
  if (!p) throw falha_('Processo não encontrado.');
  var fase = faseDe_(p), f = fluxoDe_(p.area, fase), chave = p.id + '|' + fase;
  var t = tabela_('Tarefas').linhas.filter(function (x) { return String(x.descricao || '').indexOf('[fluxo:' + chave + ']') >= 0; })[0];
  return { fase: fase, fase_nome: FASES[fase] || fase, area: f.area, itens: f.itens, tarefa: t ? { id: t.id, titulo: t.titulo, checklist: lerChecklist_(t.checklist), feita: !abertaT_(t) } : null };
}
function indicadores_(d) {
  var hoje = hojeSP_(), mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : hoje.slice(0, 7);
  var ant = (function () { var a = +mes.slice(0, 4), m = +mes.slice(5, 7) - 1; if (!m) { a--; m = 12; } return a + '-' + ('0' + m).slice(-2); })();
  var nomes = nomesUsuarios_ ? nomesUsuarios_() : {};
  var quem = function (x) { x = String(x || '').trim(); return nomes[x] || x || '(sem nome)'; };
  var dia = function (iso) { return String(iso || '').slice(0, 10); };
  var prazos = tabela_('Prazos').linhas, tarefas = tabela_('Tarefas').linhas, intims = tabela_('Intimacoes').linhas;
  var calc = function (m) {
    var r = { pessoas: {} }, P = function (n) { n = quem(n); return r.pessoas[n] = r.pessoas[n] || { nome: n, prazos: 0, prazos_no_prazo: 0, folga: 0, tarefas: 0, tarefas_no_prazo: 0, intimacoes: 0 }; };
    var cump = prazos.filter(function (z) { return z.situacao === 'cumprido' && dia(z.cumprido_em || z.atualizado_em).slice(0, 7) === m; });
    r.prazos = cump.length; r.prazosNoPrazo = 0; var folgas = [];
    cump.forEach(function (z) { var dc = dia(z.cumprido_em || z.atualizado_em), ok = !z.fatal || dc <= z.fatal, p = P(z.cumprido_por || z.responsavel);
      p.prazos++; if (ok) { p.prazos_no_prazo++; r.prazosNoPrazo++; } if (z.fatal) { var f = diffDias_(z.fatal, dc); folgas.push(f); p.folga += f; } });
    r.folgaMedia = folgas.length ? Math.round(folgas.reduce(function (a, b) { return a + b; }, 0) / folgas.length * 10) / 10 : null;
    var tf = tarefas.filter(function (t) { return t.concluida_em && dia(t.concluida_em).slice(0, 7) === m && t.situacao !== 'cancelada'; });
    r.tarefas = tf.length; r.tarefasNoPrazo = 0;
    tf.forEach(function (t) { var ok = !t.vence_em || dia(t.concluida_em) <= t.vence_em, p = P(t.concluida_por || t.responsavel); p.tarefas++; if (ok) { p.tarefas_no_prazo++; r.tarefasNoPrazo++; } });
    var im = intims.filter(function (i) { return i.terminada_em && dia(i.terminada_em).slice(0, 7) === m && !/^rob/.test(i.terminada_por || ''); });
    r.intimacoesFeitas = im.length; var tempos = [];
    im.forEach(function (i) { P(i.terminada_por).intimacoes++; if (i.recebido_em) tempos.push(diffDias_(dia(i.terminada_em), dia(i.recebido_em))); });
    r.diasIntimacao = tempos.length ? Math.round(tempos.reduce(function (a, b) { return a + b; }, 0) / tempos.length * 10) / 10 : null;
    r.intimacoesRecebidas = intims.filter(function (i) { return dia(i.recebido_em).slice(0, 7) === m; }).length;
    r.clientesNovos = tabela_('Clientes').linhas.filter(function (c) { return dia(c.criado_em).slice(0, 7) === m && !/hist|GEA|carga|levant|importa|revis|organizar|rob|djen|gmail/i.test(c.origem || ''); }).length;
    r.contratos = tabela_('Assinaturas').linhas.filter(function (a) { return a.situacao === 'assinado' && dia(a.assinado_em).slice(0, 7) === m; }).length;
    r.recebido = tabela_('Parcelas').linhas.filter(function (q) { return dia(q.pago_em).slice(0, 7) === m; }).reduce(function (a, q) { return a + (dinheiro_(q.valor_pago) || dinheiro_(q.valor)); }, 0);
    r.pessoas = Object.keys(r.pessoas).map(function (k) { return r.pessoas[k]; }).filter(function (p) { return p.nome !== '(sem nome)' && !/^rob/i.test(p.nome); })
      .sort(function (a, b) { return (b.prazos + b.tarefas + b.intimacoes) - (a.prazos + a.tarefas + a.intimacoes); });
    return r;
  };
  var agora = calc(mes), antes = calc(ant);
  // situação de hoje (não depende do mês)
  var abertos = prazos.filter(function (z) { return SITUACOES_ABERTAS.indexOf(z.situacao) >= 0; });
  var porResp = {};
  tarefas.filter(abertaT_).forEach(function (t) { if (t.vence_em && t.vence_em < hoje) { var n = quem(t.responsavel); porResp[n] = (porResp[n] || 0) + 1; } });
  var procs = tabela_('Processos').linhas.filter(function (p) { return p.status !== 'arquivado' && faseDe_(p) !== 'extinto'; });
  var limiteParado = somarDias_(hoje, -60);
  var hons = {}; tabela_('Honorarios').linhas.forEach(function (h) { hons[h.id] = h; });
  var abertasP = tabela_('Parcelas').linhas.filter(function (q) { var h = hons[q.honorario_id] || {}; return !q.pago_em && !/^(retirado|cancelado)/.test(h.situacao || ''); });
  var vencido = abertasP.filter(function (q) { return q.vencimento && q.vencimento < hoje; }).reduce(function (a, q) { return a + dinheiro_(q.valor) - dinheiro_(q.valor_pago); }, 0);
  var aVencer = abertasP.filter(function (q) { return q.vencimento && q.vencimento >= hoje && q.vencimento <= somarDias_(hoje, 30); }).reduce(function (a, q) { return a + dinheiro_(q.valor) - dinheiro_(q.valor_pago); }, 0);
  var hojeR = {
    prazosVencidos: abertos.filter(function (z) { return z.fatal && z.fatal < hoje; }).length,
    prazosSemResp: abertos.filter(function (z) { return !z.responsavel; }).length,
    prazosConferir: abertos.filter(function (z) { return /PROVIS/i.test(z.descricao || '') || z.situacao === 'a definir'; }).length,
    tarefasAtrasadas: Object.keys(porResp).map(function (k) { return { nome: k, n: porResp[k] }; }).sort(function (a, b) { return b.n - a.n; }),
    processosAtivos: procs.length,
    processosParados: procs.filter(function (p) { return p.numero && (p.ultimo_movimento_em || p.criado_em || '') < limiteParado; }).length,
    inadimplencia: vencido + aVencer > 0 ? Math.round(vencido / (vencido + aVencer) * 100) : 0, vencido: vencido
  };
  return { mes: mes, anterior: ant, agora: agora, antes: antes, hoje: hojeR };
}

/* ---------- Robôs do escritório (7.7.0) ----------
 * 1) Alvará / RPV / precatório nas intimações → tarefa "levantar o valor" + lista "A levantar" no Financeiro
 * 2) Processo parado há 60 dias → tarefa "verificar andamento / pedir impulso" (até 10 por dia)
 * 3) Cliente em atendimento há 7 dias sem contrato → tarefa "retomar contato" com WhatsApp pronto (secretaria)
 * 4) Documentos para assinar ainda na pasta 1 dia depois → tarefa "cobrar assinatura" (secretaria); some sozinha quando a pasta esvazia
 * 5) Processo encerrado → tarefa "pedir avaliação no Google" com WhatsApp pronto (secretaria)
 */
var LINK_AVALIACAO_PADRAO = 'https://www.google.com/maps/search/?api=1&query=Ara%C3%BAjo%20Advocacia%2C%20Rua%20Silvino%20Moreira%20Lima%20Sobrinho%2C%20888%2C%20Tubar%C3%A3o%20-%20SC';

/** Quem cuida da secretaria (assinaturas, retomar contato, avaliação): Config RESP_SECRETARIA ou a primeira pessoa com perfil secretaria. */
function respSecretaria_() {
  var r = config_('RESP_SECRETARIA');
  if (r) return r;
  var s = usuarios_().filter(function (x) { return x.ativo === 'sim' && x.perfil === 'secretario'; })[0];
  return s ? s.usuario : (config_('RESP_PADRAO') || '');
}

var abertaT_ = function (t) { return !t.concluida_em && t.situacao !== 'cancelada' && !/protocolado|concluido/.test(t.etapa || ''); };
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
function reaisTxt_(v) {
  var n = dinheiro_(v);
  var s = n.toFixed(2).split('.');
  return 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
}

/** Contrato previdenciário — o que se paga nas concessões (escolha no gerador, pedido da usuária). */
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
  return m ? { tipo: m[1], data: m[2], hora: m[3], local: m[4].trim(), hoje: /\[avisodia\]/.test(desc || ''),
    quando: /\[avisodia\]/.test(desc || '') ? 'dia' : /\[avisovespera\]/.test(desc || '') ? 'vespera' : 'semana', lembrete: ((/\[lembrete:([^\]|]+)/.exec(desc || '') || [])[1]) || '' } : null;
}

function lerChecklist_(txt) {
  try { var a = JSON.parse(txt || '[]'); return Array.isArray(a) ? a.slice(0, 30).map(function (x) { return { t: String(x.t || '').slice(0, 140), ok: !!x.ok }; }) : []; } catch (e) { return []; }
}
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
  var nomesU = nomesUsuarios_(), avisos = avisosMapa_();
  itens.forEach(function (x) { var av = x.tipo === 'tarefa' && avisos['tarefa:' + x.id]; if (av) { x.avisado_em = av.em; x.avisado_por = av.por; } });
  return {
    hoje: hoje, dias: dias, eu: u.usuario, etapas: ETAPAS_TAREFA.map(function (e) { return { id: e, nome: NOMES_ETAPA[e] }; }),
    usuarios: usuarios_().filter(function (x) { return x.ativo === 'sim'; }).map(function (x) { return { usuario: x.usuario, nome: x.nome }; }),
    itens: itens, todos: todos, pontos: pontosPorPessoa_(itens, desde, nomesU).filter(function (p) { return todos || p.usuario === u.usuario; }),
    responsaveis: { pje: config_('RESP_PJE') || '', eproc: config_('RESP_EPROC') || '', padrao: config_('RESP_PADRAO') || '', inicial: config_('RESP_INICIAL') || '',
      secretaria: config_('RESP_SECRETARIA') || '', secretaria_auto: respSecretaria_(), avaliacao: config_('LINK_AVALIACAO') || '' },
    link_avaliacao: config_('LINK_AVALIACAO') || LINK_AVALIACAO_PADRAO
  };
}

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
function tempoRoboHoje_() {
  try { var j = JSON.parse(PropertiesService.getScriptProperties().getProperty('TEMPO_ROBO') || '{}'); return j.dia === hojeSP_() ? { min: Math.round(j.ms / 60000), vezes: j.n, ontem: j.ontem } : { min: 0, vezes: 0, ontem: j.dia ? Math.round((j.ms || 0) / 60000) : null }; }
  catch (e) { return { min: 0, vezes: 0 }; }
}

/* 8.12: a aba Log guarda os últimos 180 dias; o resto vai para LogArquivo (nada se perde; a linha do tempo do processo lê as duas).
   Uma vez por dia, só quando o Log passa de 4.000 linhas. Assim os Relatórios não ficam lentos com o tempo. */
function listarEquipe_() {
  return usuarios_().filter(function (x) { return x.ativo === 'sim'; })
    .map(function (x) { return { usuario: x.usuario, nome: x.nome || x.usuario, perfil: x.perfil }; })
    .sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
}

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
function avisosMapa_() {
  var m = {};
  tabela_('Avisos').linhas.forEach(function (r) { if (r.chave) m[r.chave] = { em: r.em, por: r.por }; });
  return m;
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

var AVISAR_CLIENTE = [
  ['perícia', /per[ií]cia|laudo|perito/i], ['contestação', /contesta[çc][ãa]o|r[ée]plica/i],
  ['audiência', /audi[êe]ncia|designo .{0,40}(dia|data)/i], ['sentença', /senten[çc]a|ac[óo]rd[ãa]o|julg(o|ou) (im)?procedente|julgamento/i],
  ['acordo', /acordo|homolog/i]];
function avisoClienteDe_(z, intim) {
  var t = [z.descricao, z.observacoes, z.resumo_ia, intim && intim.movimento, intim && String(intim.texto || '').slice(0, 3000)].join(' ');
  if (/^ato:/.test(z.observacoes || '')) return /per[ií]cia/i.test(t) ? 'perícia' : 'audiência';
  for (var i = 0; i < AVISAR_CLIENTE.length; i++) if (AVISAR_CLIENTE[i][1].test(t)) return AVISAR_CLIENTE[i][0];
  return '';
}
function chaveIA_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_CHAVE') || ''; }

var ESTADUAIS_DATAJUD = ['', 'tjac', 'tjal', 'tjap', 'tjam', 'tjba', 'tjce', 'tjdft', 'tjes', 'tjgo', 'tjma', 'tjmt', 'tjms', 'tjmg', 'tjpa', 'tjpb', 'tjpr',
  'tjpe', 'tjpi', 'tjrj', 'tjrn', 'tjrs', 'tjro', 'tjrr', 'tjsc', 'tjse', 'tjsp', 'tjto'];
function estadoExtras_() {
  return { tempoRobo: (function () { try { return tempoRoboHoje_(); } catch (e) { return null; } })(), alertas: (function () { try { return vigiaRobo_(false); } catch (e) { return []; } })(), datajud: { ultima: config_('DATAJUD_ULTIMA'), erro: config_('DATAJUD_ERRO'), ok: config_('DATAJUD_OK') || '' },
    ia: { ligada: !!chaveIA_() && config_('IA_LIGADA') !== 'nao', ultima: config_('IA_ULTIMA'), erro: config_('IA_ERRO') },
    email: { ultimo: config_('RESUMO_EMAIL_DIA') }, versao: VERSAO, agenda: config_('AGENDA_SINC') || '' };
}


/* ---------- Site: "Prefere que a gente ligue?" ---------- */

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
function podeFuture_(u) {
  if (!u) return false;
  var lista = String(config_('FUTURE_USUARIOS') || '').split(/[,;\s]+/).filter(String);
  if (lista.length) return lista.indexOf(u.usuario) >= 0;
  return u.perfil === 'administrador'; // pedido do Luiz: todos os administradores veem
}

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
var ROTAS_MOTOR = {
  'resumo': { fn: resumo_ },
  'clientes.listar': { fn: listarClientes_ },
  'clientes.obter': { fn: obterCliente_ },
  'processos.listar': { fn: listarProcessos_ },
  'prazos.listar': { fn: listarPrazos_ },
  'intimacoes.listar': { fn: listarIntimacoes_ },
  'tarefas.listar': { fn: listarTarefas_ },
  'feriados.listar': { fn: function () { return tabela_('Feriados').linhas.map(limpar_); } },
  'equipe.listar': { fn: listarEquipe_ },
  'trabalho.aguardando': { permissao: 'usuarios', fn: aguardandoOk_ },
  'inicio.acoes': { fn: inicioAcoes_ },
  'audiencias.listar': { fn: function (d) { return { lista: audienciasLista_(d.dias || 60), hoje: hojeSP_() }; } },
  'eu.painel': { fn: meuPainel_ },
  'documentos.assinaturas': { fn: listarAssinaturas_ },
  'fluxos.processo': { fn: fluxoProcesso_ },
  'prazos.memoria': { fn: memoriaPrazo_ },
  'fin.resumo': { permissao: 'financeiro', fn: resumoFinanceiro_ },
  'fin.honorarios': { permissao: 'financeiro', fn: listarHonorarios_ },
  'fin.honorario': { permissao: 'financeiro', fn: obterHonorario_ },
  'fin.areceber': { permissao: 'financeiro', fn: aReceber_ },
  'fin.pix': { permissao: 'financeiro', fn: listarPix_ },
  'fin.acaoCobranca': { permissao: 'financeiro', fn: acaoCobranca_ },
  'fin.conferencia': { permissao: 'financeiro', fn: conferenciaCobrancas_ },
  'indicadores.mes': { permissao: 'usuarios', fn: indicadores_ },
  'relatorio.semana': { permissao: 'usuarios', fn: relatorioSemana_ },
  'relatorio.cumpridos': { permissao: 'usuarios', fn: relatorioCumpridos_ }
};
window.PAINEL_MOTOR = {
  versao: MOTOR_VERSAO,
  esquema: ESQUEMA,
  configLivre: ["ACAO_COB_IGNORADOS","AGENDAS","AGENDA_SINC","ALERTA_ROBO_EM","ASSIN_ANTIGAS","DATAJUD_ERRO","DATAJUD_OK","DATAJUD_ULTIMA","DJEN_NAVEGADOR_ERRO","DJEN_NAVEGADOR_ULTIMA","FUTURE_USUARIOS","IA_ERRO","IA_LIGADA","IA_ULTIMA","LINK_AVALIACAO","PIX_TOLERANCIA_JUROS","PIX_ULTIMA","RESP_EPROC","RESP_INICIAL","RESP_PADRAO","RESP_PJE","RESP_SECRETARIA","RESUMO_EMAIL_DIA","ROBO_GMAIL_OK","ROBO_ULTIMA_EXECUCAO","ROBO_ULTIMO_RESULTADO"],
  tabelasDaRota: {"resumo":["Clientes","Intimacoes","Prazos","Processos","Tarefas","Usuarios"],"clientes.listar":["Assinaturas","Clientes","Honorarios","Leads","Parcelas","Processos","Usuarios"],"clientes.obter":["Assinaturas","Clientes","Honorarios","Leads","ObsArquivo","Parcelas","Processos","Usuarios"],"processos.listar":["Clientes","Processos","Usuarios"],"prazos.listar":["Clientes","Intimacoes","Prazos","Processos","Usuarios"],"intimacoes.listar":["Clientes","Intimacoes","Prazos","Processos","Tarefas","Usuarios"],"tarefas.listar":["Avisos","Clientes","Prazos","Processos","Tarefas","Usuarios"],"feriados.listar":["Usuarios"],"equipe.listar":["Usuarios"],"trabalho.aguardando":["Clientes","Intimacoes","Prazos","Processos","Tarefas","Usuarios"],"inicio.acoes":["Audiencias","Clientes","Eventos","Feriados","Intimacoes","Prazos","Processos","Tarefas","Usuarios"],"audiencias.listar":["Audiencias","Clientes","Eventos","Feriados","Processos","Tarefas","Usuarios"],"eu.painel":["Avisos","Clientes","Intimacoes","Log","Prazos","Processos","Tarefas","Usuarios"],"documentos.assinaturas":["Assinaturas","Clientes","Processos","Usuarios"],"fluxos.processo":["Processos","Tarefas","Usuarios"],"prazos.memoria":["Feriados","Prazos","Processos","Usuarios"],"fin.resumo":["Clientes","Honorarios","Parcelas","Usuarios"],"fin.honorarios":["Clientes","Honorarios","Parcelas","Usuarios"],"fin.honorario":["Clientes","Honorarios","Parcelas","Recebimentos","Usuarios"],"fin.areceber":["Clientes","Honorarios","Parcelas","Usuarios"],"fin.pix":["Clientes","Parcelas","Pix","Usuarios"],"fin.acaoCobranca":["Clientes","Honorarios","Parcelas","Usuarios"],"fin.conferencia":["Clientes","Honorarios","Parcelas","Processos","Usuarios"],"indicadores.mes":["Assinaturas","Clientes","Honorarios","Intimacoes","Parcelas","Prazos","Processos","Tarefas","Usuarios"],"relatorio.semana":["Clientes","Intimacoes","Log","Prazos","Processos","Tarefas","Usuarios"],"relatorio.cumpridos":["Clientes","Prazos","Processos","Usuarios"]},
  tem: function (acao) { return !!ROTAS_MOTOR[acao]; },
  /** Roda a rota como o Apps Script faria (rotear_): permissão do perfil, a conta e os valores escondidos do RH. */
  rodar: function (acao, dados, u, amb) {
    var rota = ROTAS_MOTOR[acao];
    if (!rota) throw new Error('rota fora do motor');
    if (rota.permissao && !(PERFIS[u.perfil] || {})[rota.permissao]) return foraDoNavegador_('permissão');
    AMB = amb; MEMO_LEITURA = {};
    try {
      var res = rota.fn(dados || {}, u, '');
      return PERFIS[u.perfil] && PERFIS[u.perfil].ocultarValores ? valoresDoPerfil_(acao, res, u.perfil) : res;
    } finally { AMB = null; MEMO_LEITURA = null; }
  }
};
})();
