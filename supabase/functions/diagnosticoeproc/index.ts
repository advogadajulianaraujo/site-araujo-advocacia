// Diagnóstico temporário, manual e sem gravação. Nunca recebe seed de autenticador.
const ORIGIN = 'https://araujoadvocaciasc.com.br';
const DB = Deno.env.get('SUPABASE_URL') || '';
const KEY = Deno.env.get('PAINEL_CHAVE') || Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EXPIRES = Date.parse('2026-11-26T03:00:00Z');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const allowed = new Set(['eproc1g.tjsc.jus.br', 'sso.tjsc.jus.br']);
const recent = new Map<string, number>();
const headers = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'content-type, apikey, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
export const decode = (s: string) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
export const text = (s: string) => decode(s.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function attr(tag: string, name: string) { const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return decode(m ? m[1] ?? m[2] ?? m[3] ?? '' : ''); }
export function forms(html: string) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(m => {
    const fields: Record<string, string> = {};
    for (const [input] of m[2].matchAll(/<input\b[^>]*>/gi)) { const n = attr(input, 'name'); if (n && !/^(submit|button|checkbox|radio|file)$/i.test(attr(input, 'type'))) fields[n] = attr(input, 'value'); }
    return { action: attr(m[1], 'action'), fields };
  });
}
const title = (html: string) => text((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').slice(0, 180);
function feedback(html: string) { return [...html.matchAll(/<(?:span|div)[^>]*(?:kc-feedback-text|input-error|alert-error|alert-danger)[^>]*>([\s\S]*?)<\/(?:span|div)>/gi)].map(m => text(m[1])).filter(Boolean).join(' | ').slice(0, 500); }
function assertUrl(raw: string) { const u = new URL(raw); if (u.protocol !== 'https:' || !allowed.has(u.hostname) || u.username || u.password) throw new Error('DESTINO_NAO_PERMITIDO'); const action = u.searchParams.get('acao') || ''; if (/(?:intima|comunica|aviso).*(?:teor|abrir|visualizar|ciencia|confirmar|receber)|(?:teor|abrir|visualizar|ciencia|confirmar|receber).*(?:intima|comunica|aviso)/i.test(action)) throw new Error('LEITURA_POTENCIALMENTE_COM_CIENCIA'); return u; }
type Page = { url: string; status: number; html: string };
class Nav {
  cookies: { name: string; value: string; domain: string; path: string; expires: number; hostOnly: boolean }[] = [];
  steps: { host: string; caminho: string; acao: string; http: number }[] = [];
  async go(raw: string, init: RequestInit = {}): Promise<Page> {
    let url = assertUrl(raw), opts = init;
    for (let hop = 0; hop < 12; hop++) {
      const cookie = this.cookies.filter(c => c.expires > Date.now() && (c.hostOnly ? url.hostname === c.domain : url.hostname === c.domain || url.hostname.endsWith('.' + c.domain)) && (url.pathname === c.path || url.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/'))).map(c => c.name + '=' + c.value).join('; ');
      const response = await fetch(url, { ...opts, redirect: 'manual', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9', ...opts.headers, Cookie: cookie } });
      this.steps.push({ host: url.hostname, caminho: url.pathname, acao: url.searchParams.get('acao') || '', http: response.status });
      for (const sc of response.headers.getSetCookie()) {
        const parts = sc.split(';'), first = parts.shift() || '', i = first.indexOf('='); if (i < 1) continue;
        const c = { name: first.slice(0, i).trim(), value: first.slice(i + 1).trim(), domain: url.hostname, path: url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) || '/', expires: Infinity, hostOnly: true };
        for (const p of parts) { const j = p.indexOf('='), k = (j < 0 ? p : p.slice(0, j)).trim().toLowerCase(), v = j < 0 ? '' : p.slice(j + 1).trim(); if (k === 'domain') { c.domain = v.replace(/^\./, '').toLowerCase(); c.hostOnly = false; } if (k === 'path' && v.startsWith('/')) c.path = v; if (k === 'max-age') c.expires = Date.now() + Number(v) * 1000; else if (k === 'expires' && c.expires === Infinity) c.expires = Date.parse(v); }
        if (!(url.hostname === c.domain || url.hostname.endsWith('.' + c.domain))) continue;
        this.cookies = this.cookies.filter(x => !(x.name === c.name && x.domain === c.domain && x.path === c.path)); this.cookies.push(c);
      }
      const loc = response.headers.get('location');
      if (loc && [301, 302, 303, 307, 308].includes(response.status)) {
        const next = assertUrl(new URL(loc, url).href); if ([301, 302, 303].includes(response.status)) opts = {};
        url = next; await response.body?.cancel(); continue;
      }
      const html = await response.text(); if (html.length > 2500000) throw new Error('RESPOSTA_GRANDE');
      return { url: url.href, status: response.status, html };
    }
    throw new Error('REDIRECIONAMENTOS_EXCEDIDOS');
  }
  clear() { for (const c of this.cookies) c.value = ''; this.cookies = []; }
}
export function links(p: Page) {
  const result: { nome: string; acao: string; href: string }[] = [];
  for (const m of p.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const name = text(m[2]) || attr(m[1], 'title'); if (!/audi[eê]ncia|intima|pendente|cita[cç][aã]o|j[aá] lid|ci[eê]ncia|prazo/i.test(name)) continue;
    try { const u = assertUrl(new URL(attr(m[1], 'href'), p.url).href); if (u.hostname !== 'eproc1g.tjsc.jus.br') continue; result.push({ nome: name.slice(0, 180), acao: u.searchParams.get('acao') || '', href: u.href }); } catch { /* ignora links externos ou scripts */ }
  }
  return result.slice(0, 60);
}
// Apenas ações de LISTAGEM já presentes na página. Nenhum detalhe, documento ou abertura de comunicação.
export function safeList(l: { acao: string; nome: string; href: string }) {
  if (/teor|abrir|ciencia|ciência|confirmar|receber|registrar|documento|evento|processo|detalh|consultar_comunicacao/i.test(l.acao)) return false;
  const u = new URL(l.href);
  if ([...u.searchParams.keys()].some(k => /^(?:id|num|numero)_?(?:intimacao|comunicacao|processo|documento|evento)$/i.test(k))) return false;
  return /^(?:audiencia_listar|intimacao_listar|intimacao_eletronica_listar|aviso_listar|prazo_listar|comunicacao_listar)$/.test(l.acao);
}
function summary(p: Page) {
  const heads = [...p.html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1])).filter(Boolean).slice(0, 100);
  const labels = [...p.html.matchAll(/<(?:label|legend)\b[^>]*>([\s\S]*?)<\/(?:label|legend)>/gi)].map(m => text(m[1])).filter(Boolean).slice(0, 70);
  const rows = [...p.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 45).map(m => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]).slice(0, 600))).filter(r => r.length);
  return { titulo: title(p.html), http: p.status, campos: heads, filtros: labels, linhas: rows, avisos: feedback(p.html), links: links(p).map(({ nome, acao }) => ({ nome, acao })) };
}
export async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ ok: false, etapa: 'metodo' }, 405);
  if (req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return reply({ ok: false, etapa: 'origem' }, 403);
  if (Date.now() > EXPIRES) return reply({ ok: false, etapa: 'expirado', mensagem: 'Diagnóstico temporário encerrado.' }, 410);
  if (Number(req.headers.get('content-length') || 0) > 6000) return reply({ ok: false, etapa: 'corpo' }, 413);
  let b: any; try { const raw = await req.text(); if (raw.length > 6000) return reply({ ok: false, etapa: 'corpo' }, 413); b = JSON.parse(raw); } catch { return reply({ ok: false, etapa: 'corpo' }, 400); }
  const token = typeof b.token === 'string' ? b.token : '';
  if (!token || token.length > 1024) return reply({ ok: false, etapa: 'sessao', mensagem: 'Entre no painel como administrador.' }, 401);
  try {
    const h: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' }; if (KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + KEY;
    const r = await fetch(DB + '/rest/v1/rpc/painel_quem', { method: 'POST', headers: h, body: JSON.stringify({ p_token: token }), signal: AbortSignal.timeout(10000) });
    const who = r.ok ? await r.json() : null;
    if (!who?.usuario || who.usuario.perfil !== 'administrador') return reply({ ok: false, etapa: 'sessao', mensagem: 'Sessão inválida ou sem perfil de administrador.' }, 403);
  } catch { return reply({ ok: false, etapa: 'sessao', mensagem: 'Não foi possível validar a sessão do painel.' }, 503); }
  const region = Deno.env.get('DENO_REGION') || 'desconhecida';
  if (b.acao === 'validar') return reply({ ok: true, etapa: 'sessao_validada', regiao: region, expira: new Date(EXPIRES).toISOString() });
  if (region !== 'sa-east-1') return reply({ ok: false, etapa: 'regiao', regiao: region, mensagem: 'Não enviadas credenciais: execução fora de São Paulo.' }, 409);
  if (!['conexao', 'login'].includes(b.acao)) return reply({ ok: false, etapa: 'acao' }, 400);
  if (b.seed !== undefined) return reply({ ok: false, etapa: 'entrada', mensagem: 'Chaves permanentes não são aceitas.' }, 400);
  if (b.acao === 'login' && (!/^sc\d{5,8}$/i.test(b.login || '') || typeof b.senha !== 'string' || !b.senha || b.senha.length > 200 || !/^\d{6}$/.test(b.codigo || ''))) return reply({ ok: false, etapa: 'entrada', mensagem: 'Informe login, senha e código temporário de seis dígitos.' }, 400);
  const now = Date.now(); for (const [k, v] of recent) if (now - v > 60000) recent.delete(k);
  if (b.acao === 'login' && recent.has(token)) return reply({ ok: false, etapa: 'limite', mensagem: 'Aguarde um minuto antes de outra tentativa.' }, 429);
  if (b.acao === 'login') recent.set(token, now);
  const nav = new Nav(); let stage = 'conexao';
  const result: any = { ok: false, regiao: region, instante: new Date().toISOString(), passos: nav.steps, listas: [] };
  try {
    let p = await nav.go('https://eproc1g.tjsc.jus.br/eproc/');
    const blocked = (x: Page) => x.status === 403 || /Access Denied|Request blocked|could not be satisfied|Forbidden/i.test(title(x.html));
    if (blocked(p)) return reply({ ...result, etapa: 'bloqueio_servidor', http: p.status, mensagem: title(p.html) });
    let f = forms(p.html).find(x => 'username' in x.fields && 'password' in x.fields);
    // Segue somente o link SSO fornecido pelo próprio eproc.
    if (!f && new URL(p.url).hostname === 'eproc1g.tjsc.jus.br') {
      const hrefs = [...p.html.matchAll(/(?:href|action)\s*=\s*["']([^"']+)["']/gi)].map(m => decode(m[1]));
      const sso = hrefs.map(h => { try { return new URL(h, p.url); } catch { return null; } }).find(u => u && (u.hostname === 'sso.tjsc.jus.br' || u.hostname === 'eproc1g.tjsc.jus.br' && /SSO\/(?:login|autenticar)/i.test(u.searchParams.get('acao') || '')));
      if (sso) { p = await nav.go(sso.href); f = forms(p.html).find(x => 'username' in x.fields && 'password' in x.fields); }
    }
    if (!f) return reply({ ...result, etapa: 'formulario_login', pagina: summary(p), mensagem: 'Formulário SSO não localizado. Nenhuma credencial foi enviada.' });
    if (b.acao === 'conexao') return reply({ ...result, ok: true, etapa: 'tela_login', pagina: { titulo: title(p.html), http: p.status, campos: Object.keys(f.fields) } });
    stage = 'senha';
    let target = assertUrl(new URL(f.action, p.url).href); if (target.hostname !== 'sso.tjsc.jus.br') throw new Error('FORMULARIO_FORA_SSO');
    p = await nav.go(target.href, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...f.fields, username: b.login, password: b.senha }) });
    b.senha = '';
    if (blocked(p)) return reply({ ...result, etapa: 'bloqueio_servidor', http: p.status, mensagem: title(p.html) });
    if (new URL(p.url).hostname === 'sso.tjsc.jus.br') {
      const all = forms(p.html); const otpForm = all.find(x => Object.keys(x.fields).some(k => /^(otp|totp|code|codigo|token)$/i.test(k)));
      if (!otpForm) return reply({ ...result, etapa: all.some(x => 'password' in x.fields) ? 'login_recusado' : 'sso_inesperado', mensagem: feedback(p.html) || title(p.html), campos: all.flatMap(x => Object.keys(x.fields)) });
      stage = 'codigo'; target = assertUrl(new URL(otpForm.action, p.url).href); if (target.hostname !== 'sso.tjsc.jus.br') throw new Error('FORMULARIO_FORA_SSO');
      const otp = Object.keys(otpForm.fields).find(k => /^(otp|totp|code|codigo|token)$/i.test(k))!;
      p = await nav.go(target.href, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...otpForm.fields, [otp]: b.codigo }) }); b.codigo = '';
      if (blocked(p)) return reply({ ...result, etapa: 'bloqueio_servidor', http: p.status, mensagem: title(p.html) });
      if (new URL(p.url).hostname === 'sso.tjsc.jus.br') return reply({ ...result, etapa: forms(p.html).some(x => Object.keys(x.fields).some(k => /^(otp|totp|code|codigo|token)$/i.test(k))) ? 'codigo_recusado' : 'retorno_sso', mensagem: feedback(p.html) || title(p.html) });
    }
    stage = 'retorno_eproc';
    if (p.status >= 400 || new URL(p.url).hostname !== 'eproc1g.tjsc.jus.br' || forms(p.html).some(x => 'password' in x.fields) || !/sair|logout|encerrar sess[aã]o/i.test(p.html)) return reply({ ...result, etapa: 'login_nao_confirmado', pagina: summary(p) });
    result.ok = true; result.etapa = 'entrou_eproc'; result.pagina = summary(p);
    stage = 'localizar_listas';
    const candidates = links(p).filter(safeList); const seen = new Set<string>();
    for (const link of candidates) { if (seen.has(link.acao)) continue; seen.add(link.acao); if (seen.size > 4) break; const list = await nav.go(link.href); result.listas.push({ nome: link.nome, acao: link.acao, ...summary(list) }); }
    result.etapa = result.listas.length ? 'listas_consultadas' : 'listas_nao_localizadas_com_seguranca';
    return reply(result);
  } catch (e) { return reply({ ...result, etapa: stage, erro: /Timeout|timed out|abort/i.test(String(e)) ? 'TEMPO_LIMITE' : ['DESTINO_NAO_PERMITIDO', 'FORMULARIO_FORA_SSO', 'REDIRECIONAMENTOS_EXCEDIDOS', 'RESPOSTA_GRANDE', 'LEITURA_POTENCIALMENTE_COM_CIENCIA'].includes((e as Error).message) ? (e as Error).message : 'FALHA_DE_TRANSPORTE', mensagem: 'A etapa indicada não foi concluída; nenhuma importação foi realizada.' }); }
  finally { b.senha = ''; b.codigo = ''; b.token = ''; nav.clear(); }
}
Deno.serve(handler);
