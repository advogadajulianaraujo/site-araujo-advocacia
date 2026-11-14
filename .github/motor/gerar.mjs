// Gera painel/motor.js: as funções de LEITURA do painel-backend/Code.gs, para o navegador fazer as mesmas contas com os dados
// lidos do Supabase (8.28). Não edite painel/motor.js à mão: mudou o Code.gs? Rode  node .github/motor/gerar.mjs
// O navegador nunca grava: qualquer gravação, serviço do Google ou tabela não liberada faz a tela voltar para o Apps Script.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fonte = readFileSync(path.join(raiz, 'painel-backend/Code.gs'), 'utf8');
const linhas = fonte.split('\n');

// 1) declarações do topo (o Code.gs começa cada uma na coluna 0: "function nome(" ou "var NOME")
const decl = new Map(); let atual = null;
linhas.forEach((l, i) => {
  const m = /^function ([A-Za-z_$][\w$]*)\s*\(/.exec(l) || /^var ([A-Za-z_$][\w$]*)\b/.exec(l);
  if (m) { atual = { nome: m[1], ini: i, fim: i, tipo: l.startsWith('function') ? 'f' : 'v' }; decl.set(m[1], atual); }
  else if (atual) atual.fim = i;
});
const texto = d => linhas.slice(d.ini, d.fim + 1).join('\n');

// 2) rotas de leitura que o navegador pode fazer (as outras sempre vão ao Apps Script)
const ROTAS_MOTOR = ['resumo', 'clientes.listar', 'clientes.obter', 'processos.listar', 'prazos.listar', 'intimacoes.listar', 'tarefas.listar',
  'feriados.listar', 'equipe.listar', 'trabalho.aguardando', 'inicio.acoes', 'audiencias.listar', 'eu.painel', 'documentos.assinaturas',
  'fluxos.processo', 'prazos.memoria', 'fin.resumo', 'fin.honorarios', 'fin.honorario', 'fin.areceber', 'fin.pix', 'fin.acaoCobranca',
  'fin.conferencia', 'indicadores.mes', 'relatorio.semana', 'relatorio.cumpridos'];
const blocoRotas = texto(decl.get('ROTAS'));
const rotas = {};
for (const r of ROTAS_MOTOR) {
  const m = new RegExp("^\\s*'" + r.replace(/\./g, '\\.') + "': (\\{.*\\}),?\\s*$", 'm').exec(blocoRotas);
  if (!m) throw new Error('Rota não encontrada no Code.gs: ' + r);
  rotas[r] = m[1];
}

// 3) o que o navegador troca por versões próprias (leitura do Supabase; gravar = volta ao Apps Script)
const TROCADAS = new Set(['tabela_', 'lerTabela_', 'aba_', 'inserirLinha_', 'atualizarLinha_', 'apagarLinha_', 'gravarLote_', 'regravarMudadas_',
  'gravarVarias_', 'setConfig_', 'config_', 'registrar_', 'comTrava_', 'marcarMudanca_', 'comMemoria_', 'versaoDados_', 'rotear_', 'rotearLote_',
  'doPost', 'doGet', 'json_', 'usuarioDaSessao_', 'sbMarcar_', 'sbApagar_', 'sbLigado_', 'sbEnviarSujas_', 'asaasChave_']);
const SERVICOS = ['SpreadsheetApp', 'DriveApp', 'CalendarApp', 'GmailApp', 'MailApp', 'UrlFetchApp', 'DocumentApp', 'LockService', 'ScriptApp',
  'PropertiesService', 'CacheService', 'Utilities', 'Session', 'ContentService', 'HtmlService', 'Logger', 'Drive', 'Calendar', 'XmlService', 'Charts'];

// identificadores usados (fora de comentários de linha; o excesso só aumenta o arquivo, nunca muda o resultado)
const ids = s => new Set((s.replace(/\/\/[^\n]*/g, '').match(/[A-Za-z_$][\w$]*/g) || []));
const usados = new Map();
const deps = nome => { if (!usados.has(nome)) usados.set(nome, ids(texto(decl.get(nome)))); return usados.get(nome); };

const fecho = new Set(), servicos = {}, porRota = {};
function visitar(raizes) {
  const vistos = new Set(), fila = [...raizes];
  while (fila.length) {
    const n = fila.pop();
    if (vistos.has(n) || !decl.has(n) || TROCADAS.has(n)) continue;
    vistos.add(n);
    for (const x of deps(n)) if (decl.has(x) && !vistos.has(x)) fila.push(x);
  }
  return vistos;
}
// PERFIS e helpers sempre entram
const base = ['PERFIS', 'ESQUEMA', 'valoresDoPerfil_', 'semValores_', 'CAMPOS_VALOR', 'limpar_', 'falha_', 'usuarios_'];
for (const [r, obj] of Object.entries(rotas)) {
  const raizes = [...ids(obj)].filter(x => decl.has(x));
  const v = visitar(raizes.concat(base));
  v.forEach(x => fecho.add(x));
  const tabs = new Set(), servs = new Set();
  for (const n of v) {
    const t = texto(decl.get(n));
    for (const m of t.matchAll(/(?:tabela_|lerTabela_|aba_)\('([A-Za-z]+)'\)/g)) tabs.add(m[1]);
    for (const s of SERVICOS) if (new RegExp('\\b' + s + '\\.').test(t)) servs.add(s);
  }
  porRota[r] = { tabelas: [...tabs].sort(), servicos: [...servs].sort(), funcoes: v.size };
}
visitar(base).forEach(x => fecho.add(x));

// chaves de Config lidas pelas funções do fecho (só essas podem ir ao navegador, e nunca as que parecem segredo)
const chavesConfig = new Set();
for (const n of fecho) for (const m of texto(decl.get(n)).matchAll(/config_\('([A-Z0-9_]+)'\)/g)) chavesConfig.add(m[1]);
const SEGREDO = /(^|_)(CHAVE|KEY|TOKEN|SENHA|SECRET|SECRETO|HASH|PAGAMENTO|CONTAS?|CODIGO|TXT|URL)(_|$)/; // nunca sai uma chave, código, Pix ou conta
const configLivre = [...chavesConfig].filter(k => !SEGREDO.test(k)).sort();

const versao = /^var VERSAO = '([^']+)'/m.exec(fonte)[1];
const ordem = [...fecho].sort((a, b) => decl.get(a).ini - decl.get(b).ini);
const corpo = ordem.map(n => texto(decl.get(n))).join('\n');

const saida = `/* GERADO por .github/motor/gerar.mjs a partir de painel-backend/Code.gs ${versao} — NÃO EDITE À MÃO.
   O navegador faz as mesmas contas do Apps Script com os dados lidos do Supabase. Gravar, serviços do Google ou tabela não
   liberada param a conta e a tela volta a ser pedida ao Apps Script (painel/banco.js). */
(function () {
var MOTOR_VERSAO = '${versao}';
var AMB = null; // ambiente da vez (banco.js): { tabela(nome), config(chave), parar(motivo) }
function foraDoNavegador_(o) { var e = new Error('fora do navegador: ' + o); e.motor = true; if (AMB) AMB.parar(o); throw e; }
function servico_(nome) { return new Proxy({}, { get: function (_, p) { if (nome === 'Utilities' && UTIL_[p]) return UTIL_[p]; if (nome === 'Logger') return function () {}; return foraDoNavegador_(nome + '.' + String(p)); } }); }
var UTIL_ = {
  formatDate: function (d, tz, fmt) { return formatarData_(d, tz, fmt); },
  DigestAlgorithm: {}, Charset: {}
};
${SERVICOS.map(s => `var ${s} = servico_('${s}');`).join('\n')}
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
${corpo}
var ROTAS_MOTOR = {
${Object.entries(rotas).map(([r, o]) => `  '${r}': ${o}`).join(',\n')}
};
window.PAINEL_MOTOR = {
  versao: MOTOR_VERSAO,
  esquema: ESQUEMA,
  configLivre: ${JSON.stringify(configLivre)},
  tabelasDaRota: ${JSON.stringify(Object.fromEntries(Object.entries(porRota).map(([r, x]) => [r, x.tabelas])))},
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
`;
writeFileSync(path.join(raiz, 'painel/motor.js'), saida);
// a mesma lista no Code.gs (o servidor só libera estas chaves de Config ao navegador)
const marca = /\/\*SB_CONFIG_LIVRE\*\/[^\n]*?\/\*FIM\*\//;
if (!marca.test(fonte)) throw new Error('Marca SB_CONFIG_LIVRE não encontrada no Code.gs');
const novaFonte = fonte.replace(marca, '/*SB_CONFIG_LIVRE*/' + JSON.stringify(configLivre).replace(/","/g, "', '").replace(/^\["/, "['").replace(/"\]$/, "']") + '/*FIM*/');
if (novaFonte !== fonte) { writeFileSync(path.join(raiz, 'painel-backend/Code.gs'), novaFonte); console.log('Code.gs: SB_CONFIG_LIVRE atualizada.'); }
writeFileSync(path.join(raiz, '.github/motor/relatorio.json'), JSON.stringify({ versao, configLivre, rotas: porRota, funcoes: fecho.size }, null, 1) + '\n');
console.log('painel/motor.js:', (saida.length / 1024).toFixed(0), 'KB,', fecho.size, 'funções. Config liberada:', configLivre.length, 'chaves.');
for (const [r, x] of Object.entries(porRota)) console.log(r.padEnd(22), 'tabelas:', x.tabelas.join(','), '| serviços:', x.servicos.join(','));
