// Gera supabase/functions/painel/motor.js: o Code.gs INTEIRO para rodar na Edge Function "painel" do Supabase (8.32, Etapa C).
// Só a parte de dados é trocada: as abas vêm do banco (carregadas antes, por servidor.js), as gravações viram uma lista de mudanças
// que o servidor.js manda numa transação (painel_aplicar_pedido). Gmail, Drive, Agenda, IA, Propriedades… param a conta e o pedido
// volta para o Apps Script ({ voltar: true }). Não edite motor.js à mão: mudou o Code.gs? node .github/motor/gerar-edge.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fonte = readFileSync(path.join(raiz, 'painel-backend/Code.gs'), 'utf8');
const versao = /^var VERSAO = '([^']+)'/m.exec(fonte)[1];
const SERVICOS = ['SpreadsheetApp', 'DriveApp', 'CalendarApp', 'GmailApp', 'MailApp', 'UrlFetchApp', 'DocumentApp', 'LockService', 'ScriptApp',
  'PropertiesService', 'ContentService', 'HtmlService', 'Drive', 'Calendar', 'XmlService', 'Charts', 'Session', 'Utilities', 'CacheService', 'Logger'];
const saida = `/* GERADO por .github/motor/gerar-edge.mjs a partir de painel-backend/Code.gs ${versao} — NÃO EDITE À MÃO. */
export const VERSAO_MOTOR = '${versao}';
export function criarMotor(base) {
var AMB = null;
function foraDoNavegador_(o) { var e = new Error('fora do Supabase: ' + o); e.motor = true; if (AMB) AMB.parar(o); throw e; }
function servico_(nome, ok) { return new Proxy({}, { get: function (_, p) { if (ok && ok[p] !== undefined) return ok[p]; return foraDoNavegador_(nome + '.' + String(p)); } }); }
var CACHE_ = {};
function bytes_(b) { return Array.prototype.map.call(b, function (x) { return x > 127 ? x - 256 : x; }); }
function sem_(b) { return Uint8Array.from(b.map(function (x) { return x & 255; })); }
var UTIL_ = {
  formatDate: function (d, tz, fmt) { return formatarData_(d, tz, fmt); },
  getUuid: function () { return base.randomUUID(); }, sleep: function () {},
  DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256', SHA_1: 'sha1' }, Charset: { UTF_8: 'utf8' }, MacAlgorithm: { HMAC_SHA_256: 'sha256' },
  computeDigest: function (a, s) { return bytes_(base.createHash(a).update(typeof s === 'string' ? s : sem_(s)).digest()); },
  computeHmacSha256Signature: function (s, k) { return bytes_(base.createHmac('sha256', typeof k === 'string' ? k : sem_(k)).update(typeof s === 'string' ? s : sem_(s)).digest()); },
  computeHmacSignature: function (a, s, k) { return bytes_(base.createHmac(a, typeof k === 'string' ? k : sem_(k)).update(typeof s === 'string' ? s : sem_(s)).digest()); },
  base64Encode: function (b) { return base.b64(typeof b === 'string' ? new TextEncoder().encode(b) : sem_(b), false); },
  base64EncodeWebSafe: function (b) { return base.b64(typeof b === 'string' ? new TextEncoder().encode(b) : sem_(b), true); },
  newBlob: function (b) { return { getDataAsString: function () { return new TextDecoder().decode(typeof b === 'string' ? new TextEncoder().encode(b) : sem_(b)); } }; }
};
var SpreadsheetApp = servico_('SpreadsheetApp'), DriveApp = servico_('DriveApp'), CalendarApp = servico_('CalendarApp'), GmailApp = servico_('GmailApp'),
  MailApp = servico_('MailApp'), UrlFetchApp = servico_('UrlFetchApp'), DocumentApp = servico_('DocumentApp'), LockService = servico_('LockService'),
  ScriptApp = servico_('ScriptApp'), PropertiesService = servico_('PropertiesService'), ContentService = servico_('ContentService'), HtmlService = servico_('HtmlService'),
  Drive = servico_('Drive'), Calendar = servico_('Calendar'), XmlService = servico_('XmlService'), Charts = servico_('Charts'),
  Session = servico_('Session', { getScriptTimeZone: function () { return 'America/Sao_Paulo'; } }),
  Utilities = servico_('Utilities', UTIL_), Logger = servico_('Logger', { log: function () {} }),
  CacheService = servico_('CacheService', { getScriptCache: function () { return { get: function (k) { return CACHE_[k] === undefined ? null : CACHE_[k]; }, put: function (k, v) { CACHE_[k] = String(v); },
    putAll: function (o) { Object.keys(o).forEach(function (k) { CACHE_[k] = String(o[k]); }); }, getAll: function (ks) { var r = {}; ks.forEach(function (k) { if (CACHE_[k] !== undefined) r[k] = CACHE_[k]; }); return r; },
    remove: function (k) { delete CACHE_[k]; }, removeAll: function (ks) { ks.forEach(function (k) { delete CACHE_[k]; }); } }; } });
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
// ===================== Code.gs =====================
${fonte}
// ===================== trocas para o Supabase =====================
function sbPrimeiro_() { return true; }
function sbLogin_() { return true; }
function sbLigado_() { return false; }
function sbPrincipal_() { return false; }
function sbPrecarregar_(nomes) { (nomes || []).forEach(function (n) { if (!SB_EXEC[n]) { if (AMB.raw[n]) SB_EXEC[n] = AMB.raw[n]; else { AMB.parar('falta:' + n); var e = new Error('falta ' + n); e.motor = true; throw e; } } }); }
function sbpAplicar_() { /* no Supabase tudo vai junto no fim (servidor.js) */ }
function sbEnviarSujas_() {} function sbLogAplicar_() {} function sbGravarJa_() {}
function sbAntesDaRota_() {} function sbDepoisDaRota_() {}
function comTrava_(fn) { return fn(); }
function comMemoria_(acao, u, dados, fn) { return fn(); }
function marcarMudanca_() {}
function asaasChave_() { return AMB.asaas ? 'ligado' : ''; }
function ultimasLinhasLog_(n) { return tabela_('Log').linhas.slice(-n).map(function (l) { return [l.quando, l.usuario, l.acao, l.detalhe]; }); }
function montarOps_() {
  var ops = [];
  Object.keys(SB_PEND).forEach(function (a) {
    var p = SB_PEND[a], cab = ESQUEMA[a], fora = sbFora_(a) || [];
    var del = Object.keys(p.del), upd = Object.keys(p.upd).filter(function (k) { return Object.keys(p.upd[k]).length; });
    if (!p.ins.length && !del.length && !upd.length) return;
    ops.push({ t: sbTabela_(a), del: del,
      upd: upd.map(function (k) { var x = { k: k, cols: p.upd[k] }, v = AMB.versao(a, k); if (v !== undefined) x.v = v; return x; }),
      ins: p.ins.map(function (o) { var r = {}; cab.forEach(function (c) { if (fora.indexOf(c) < 0) r[c] = o[c] === null || o[c] === undefined ? '' : String(o[c]); }); return r; }) });
  });
  if (SB_LOG.length) ops.push({ t: 'log', del: [], upd: [], ins: SB_LOG.slice() });
  return ops;
}
return {
  rotas: ROTAS, perfis: PERFIS, esquema: ESQUEMA, leituras: LEITURAS_RAPIDAS, tabelaDe: sbTabela_,
  /** Roda a rota como o rotear_ do Apps Script (sem a sessão: a pessoa já foi conferida no banco). */
  rodar: function (acao, dados, u, amb) {
    var rota = ROTAS[acao];
    AMB = amb; SB_PEND = {}; SB_EXEC = {}; SB_LOG = []; SB_TMP_ = 0; SB_LEITURAS = {}; SB_USADAS = {}; SB_ESCRITAS = {}; CACHE_ = {};
    MEMO_LEITURA = LEITURAS_RAPIDAS[acao] ? {} : null;
    try {
      if (rota.permissao && !PERFIS[u.perfil][rota.permissao]) { registrar_(u.usuario, 'acesso negado', acao); throw falha_('Seu perfil não tem acesso a esta área.'); }
      var res = rota.fn(dados || {}, u, '');
      if (PERFIS[u.perfil] && PERFIS[u.perfil].ocultarValores) res = valoresDoPerfil_(acao, res, u.perfil);
      return { res: res, ops: montarOps_() };
    } catch (e) { e.ops = e.publico ? montarOps_().filter(function (o) { return o.t === 'log'; }) : []; throw e; }
    finally { MEMO_LEITURA = null; AMB = null; }
  }
};
}
`;
writeFileSync(path.join(raiz, 'supabase/functions/painel/motor.js'), saida);
console.log('supabase/functions/painel/motor.js:', (saida.length / 1024).toFixed(0), 'KB (Code.gs ' + versao + ')');
