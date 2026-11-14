// Simulador (8.28): Apps Script (Code.gs) + Supabase (PostgreSQL local via psql) + navegador (motor.js + banco.js). Dados INVENTADOS.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), { execFileSync } = require('child_process');
const REPO = require('path').resolve(__dirname, '..', '..', '..');
// PostgreSQL de teste (vazio, só para isto): PGHOST/PGPORT/PGUSER como no psql
const PSQL = ['-h', process.env.PGHOST || '/var/tmp/pgteste', '-p', process.env.PGPORT || '5499', '-U', process.env.PGUSER || 'postgres', '-qtAX', '-v', 'ON_ERROR_STOP=1'];
function sql(q, papel) {
  const pre = papel ? `set role ${papel};\n` : '';
  try { return execFileSync('psql', PSQL, { input: pre + q + ';', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).trim(); }
  catch (e) { const m = /ERROR:\s+([^\n]*)/.exec(String(e.stderr)); throw Object.assign(new Error(m ? m[1] : String(e.stderr)), { pg: true }); }
}
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
let contaFetch = 0, foraDoAr = false;
// ---------- mini PostgREST (só o que o Code.gs e o banco.js usam) ----------
function postgrest(url, op, papel) {
  contaFetch++;
  const u = new URL(url), cam = u.pathname.replace(/^\/rest\/v1\//, ''), metodo = (op.method || 'get').toUpperCase();
  const corpo = op.payload !== undefined ? op.payload : op.body;
  try {
    if (cam.startsWith('rpc/')) {
      const fn = cam.slice(4), args = JSON.parse(corpo || '{}');
      const lista = Object.entries(args).map(([k, v]) => `${k} := ${v === null ? 'null' : typeof v === 'object' ? lit(JSON.stringify(v)) + '::jsonb' : lit(v)}`);
      const r = sql(`select to_jsonb(${fn}(${lista.join(', ')}))`, papel);
      return { status: 200, txt: r };
    }
    const filtros = [...u.searchParams.entries()].filter(([k]) => !['on_conflict', 'select', 'limit'].includes(k)).map(([k, v]) => {
      const m = /^(eq|lt|in)\.(.*)$/.exec(v);
      if (m[1] === 'in') return `${k}::text in (${m[2].replace(/^\(|\)$/g, '').split(',').map(x => lit(decodeURIComponent(x))).join(',')})`;
      return `${k} ${m[1] === 'eq' ? '=' : '<'} ${lit(m[2])}`;
    });
    if (metodo === 'GET') return { status: 200, txt: sql(`select coalesce(jsonb_agg(x),'[]') from (select ${u.searchParams.get('select') || '*'} from ${cam} ${filtros.length ? 'where ' + filtros.join(' and ') : ''} limit ${u.searchParams.get('limit') || 1000}) x`) };
    if (metodo === 'DELETE') { sql(`delete from ${cam} where ${filtros.join(' and ') || 'true'}`); return { status: 204, txt: '' }; }
    if (metodo === 'POST') {
      const linhas = JSON.parse(corpo); const arr = Array.isArray(linhas) ? linhas : [linhas];
      const oc = u.searchParams.get('on_conflict');
      const cols = sql(`select string_agg(quote_ident(column_name), ',') from information_schema.columns where table_schema='public' and table_name=${lit(cam)} and column_name in (select jsonb_object_keys(x) from jsonb_array_elements(${lit(JSON.stringify(arr))}::jsonb) x)`);
      let q = `insert into ${cam} (${cols}) select ${cols} from jsonb_populate_recordset(null::${cam}, ${lit(JSON.stringify(arr))}::jsonb)`;
      if (oc) q += ` on conflict (${oc}) do update set ` + cols.split(',').map(c => `${c} = excluded.${c}`).join(',');
      const ret = /representation/.test((op.headers || {}).Prefer || '');
      const r = sql(ret ? `with i as (${q} returning *) select coalesce(jsonb_agg(i),'[]') from i` : q);
      return { status: 201, txt: ret ? r : '' };
    }
  } catch (e) { return { status: /sessão do banco/.test(e.message) ? 403 : 400, txt: JSON.stringify({ message: e.message, code: 'X' }) }; }
  throw new Error('postgrest: não sei ' + metodo + ' ' + cam);
}
// ---------- Google falso ----------
function criarGoogle() {
  const abas = new Map(), cache = new Map(), props = new Map();
  function aba(nome) {
    const dados = [];
    const sh = {
      _d: dados, getName: () => nome, getLastRow: () => dados.length, getMaxRows: () => Math.max(dados.length, 1000), setFrozenRows() {},
      appendRow(v) { dados.push(v.map(x => String(x))); },
      deleteRows(r, n) { dados.splice(r - 1, n); },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        const rg = {
          getDisplayValues() { const o = []; for (let i = 0; i < nr; i++) { const l = dados[r - 1 + i] || []; const x = []; for (let j = 0; j < nc; j++) x.push(l[c - 1 + j] === undefined ? '' : String(l[c - 1 + j]).replace(/^'/, '')); o.push(x); } return o; },
          getValues() { return rg.getDisplayValues(); },
          setValues(v) { v.forEach((l, i) => { while (dados.length < r + i) dados.push([]); const d = dados[r - 1 + i]; l.forEach((x, j) => { d[c - 1 + j] = String(x); }); }); return rg; },
          setValue(x) { return rg.setValues([[x]]); },
          setNumberFormat() { return rg; }, clearContent() { for (let i = 0; i < nr; i++) if (dados[r - 1 + i]) dados[r - 1 + i] = dados[r - 1 + i].map(() => ''); return rg; },
          setFontWeight() { return rg; }, setBackground() { return rg; }, protect() { return { setWarningOnly() {} }; }
        };
        return rg;
      },
      protect() { return { setWarningOnly() {} }; }, getProtections() { return []; }
    };
    abas.set(nome, sh); return sh;
  }
  const ss = { getSheetByName: n => abas.get(n) || null, insertSheet: n => aba(n), toast() {}, getId: () => 'planilha', getSheets: () => [...abas.values()] };
  const fmt = (d, tz, f) => { // implementação independente da do motor: Brasília = UTC−3 fixo
    d = new Date(d); const b = new Date(d.getTime() - 3 * 3600000), p = n => String(n).padStart(2, '0');
    const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return f.replace(/'([^']*)'|yyyy|yy|MMMM|MM|M|dd|d|HH|H|mm|ss|EEEE|EEE|E|u/g, (t, l) => l !== undefined ? l : ({
      yyyy: b.getUTCFullYear(), yy: String(b.getUTCFullYear()).slice(2), MMMM: meses[b.getUTCMonth()], MM: p(b.getUTCMonth() + 1), M: b.getUTCMonth() + 1, dd: p(b.getUTCDate()), d: b.getUTCDate(),
      HH: p(b.getUTCHours()), H: b.getUTCHours(), mm: p(b.getUTCMinutes()), ss: p(b.getUTCSeconds()), EEEE: dias[b.getUTCDay()], EEE: dias[b.getUTCDay()].slice(0, 3), E: dias[b.getUTCDay()].slice(0, 3), u: b.getUTCDay() || 7 })[t]);
  };
  const bytes = b => [...b].map(x => x > 127 ? x - 256 : x);
  const semGoogle = nome => new Proxy({}, { get: (_, p) => () => { throw new Error(nome + '.' + String(p) + ' não existe no simulador'); } });
  const g = {
    SpreadsheetApp: { getActive: () => ss, getActiveSpreadsheet: () => ss, openById: () => ss, flush() {} },
    CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, String(v)), putAll: o => Object.entries(o).forEach(([k, v]) => cache.set(k, String(v))),
      getAll: ks => Object.fromEntries(ks.filter(k => cache.has(k)).map(k => [k, cache.get(k)])), remove: k => cache.delete(k), removeAll: ks => ks.forEach(k => cache.delete(k)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props), getKeys: () => [...props.keys()] }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {}, hasLock: () => true }) },
    Utilities: { formatDate: fmt, getUuid: () => crypto.randomUUID(), sleep() {},
      DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, MacAlgorithm: { HMAC_SHA_256: 'sha256' },
      computeDigest: (a, s) => bytes(crypto.createHash(a).update(String(s), 'utf8').digest()),
      computeHmacSha256Signature: (s, k) => bytes(crypto.createHmac('sha256', k).update(s).digest()),
      computeHmacSignature: (a, s, k) => bytes(crypto.createHmac('sha256', k).update(s).digest()),
      base64Encode: b => Buffer.from(typeof b === 'string' ? b : b.map(x => x & 255)).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(typeof b === 'string' ? b : b.map(x => x & 255)).toString('base64url'),
      base64DecodeWebSafe: s => bytes(Buffer.from(s, 'base64url')), newBlob: b => ({ getDataAsString: () => Buffer.from(b.map(x => x & 255)).toString('utf8') }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.test' }), getActiveUser: () => ({ getEmail: () => '' }) },
    UrlFetchApp: { fetch: (url, op) => { if (foraDoAr) throw new Error('Supabase fora do ar (simulado)'); if (!/supabase\.(test|co)/.test(url)) throw new Error('internet bloqueada no simulador: ' + url); const r = postgrest(url, op || {}, null); return { getResponseCode: () => r.status, getContentText: () => r.txt }; } },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, getContent: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log() {} }, console,
    CalendarApp: semGoogle('CalendarApp'), GmailApp: semGoogle('GmailApp'), DriveApp: semGoogle('DriveApp'), MailApp: semGoogle('MailApp'), DocumentApp: semGoogle('DocumentApp'), ScriptApp: semGoogle('ScriptApp'), HtmlService: semGoogle('HtmlService')
  };
  const ctx = vm.createContext(Object.assign({}, g));
  vm.runInContext(fs.readFileSync(REPO + '/painel-backend/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });
  Object.keys(ctx.ESQUEMA).forEach(n => { const sh = aba(n); sh._d.push(ctx.ESQUEMA[n].slice()); });
  return { ctx, abas, cache, props, aba: n => abas.get(n) };
}
// ---------- navegador falso ----------
function criarNavegador() {
  const ss = new Map(), ls = new Map();
  const w = { console, Intl, Date, JSON, Math, Map, Set, Proxy, Promise, setTimeout, clearTimeout, AbortController, performance,
    sessionStorage: { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, String(v)), removeItem: k => ss.delete(k) },
    localStorage: { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    fetch: async (url, op) => { const r = postgrest(url, op, 'anon'); return { ok: r.status < 300, status: r.status, text: async () => r.txt }; } };
  w.window = w;
  const ctx = vm.createContext(w);
  vm.runInContext(fs.readFileSync(REPO + '/painel/motor.js', 'utf8'), ctx, { filename: 'motor.js' });
  vm.runInContext(fs.readFileSync(REPO + '/painel/banco.js', 'utf8'), ctx, { filename: 'banco.js' });
  return ctx;
}
module.exports = { foraDoAr: v => { foraDoAr = v; }, criarGoogle, criarNavegador, sql, postgrest, contas: () => contaFetch };
