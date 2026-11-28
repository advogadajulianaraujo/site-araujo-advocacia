// Edge Function "tribunais" (Supabase) — 8.56. Lê as intimações PENDENTES direto do eproc pelo serviço oficial dos tribunais
// (MNI 2.2.2, operação consultarAvisosPendentes), com o usuário e a senha do eproc guardados no COFRE do Supabase.
// REGRA DE OURO: só consultarAvisosPendentes (lista o que está pendente, SEM dar ciência). NUNCA chamar consultarTeorComunicacao
// (abrir o teor = intimação considerada feita) nem confirmarRecebimento.
// 8.59: o PJe ACEITA servidores de São Paulo (sa-east-1): o painel e o robô chamam esta função com o cabeçalho x-region: sa-east-1.
// Publicar: FUNCAO=tribunais node .github/motor/publicar-edge.mjs (verify_jwt = false: a pessoa é conferida pelo código da sessão do banco).
import forge from 'npm:node-forge@1.3.1';
const URL_BANCO = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE = Deno.env.get('PAINEL_CHAVE') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const cab = (): Record<string, string> => { const h: Record<string, string> = { apikey: CHAVE, 'Content-Type': 'application/json' }; if (CHAVE.startsWith('eyJ')) h.Authorization = 'Bearer ' + CHAVE; return h; };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Um login por tribunal; cada tribunal tem um ou mais endereços do eproc (1º e 2º grau).
export const TRIBUNAIS: Record<string, { nome: string; dica: string; bases: Record<string, string> }> = {
  tjsc: { nome: 'TJSC (Justiça Estadual de SC)', dica: 'o usuário com que a Dra. entra no eproc do TJSC', bases: { 'TJSC 1º grau': 'https://eproc1g.tjsc.jus.br/eproc/', 'TJSC 2º grau': 'https://eproc2g.tjsc.jus.br/eproc/' } },
  trf4: { nome: 'Justiça Federal (JFSC e TRF4)', dica: 'o usuário com que a Dra. entra no eproc da Justiça Federal', bases: { 'JFSC': 'https://eproc.jfsc.jus.br/eprocV2/', 'TRF4': 'https://eproc.trf4.jus.br/eproc2trf4/' } },
  // TJRS: o eproc do TJRS recusa servidores (403, testado em 23/11/2026) — fica para a extensão do Chrome.
};

async function post(caminho: string, corpo: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(URL_BANCO + caminho, { method: 'POST', headers: { ...cab(), ...extra }, body: JSON.stringify(corpo) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* não é JSON */ }
  if (!r.ok) { const e: any = new Error((j && (j.message || j.msg || j.error || j.hint)) || ('erro ' + r.status)); e.status = r.status; throw e; }
  return j;
}
async function estado(esc: string): Promise<Record<string, any>> {
  const r = await fetch(`${URL_BANCO}/rest/v1/painel_estado?escritorio_id=eq.${esc}&chave=eq.tribunais&select=valor`, { headers: cab() });
  const j = r.ok ? await r.json() : []; try { return JSON.parse((j[0] && j[0].valor) || '{}') || {}; } catch { return {}; }
}
async function gravarEstado(esc: string, v: Record<string, any>) {
  await post('/rest/v1/painel_estado?on_conflict=escritorio_id,chave', [{ escritorio_id: esc, chave: 'tribunais', valor: JSON.stringify(v), em: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
}
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desc = (s: string) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const atr = (tag: string, nome: string) => (new RegExp('\\b' + nome + '="([^"]*)"').exec(tag) || [])[1] || '';

/** Lista as intimações pendentes de UM endereço do eproc (sem dar ciência). */
async function avisosPendentes(base: string, usuario: string, senha: string) {
  const t0 = Date.now();
  let loc = base + 'ws/controlador_ws.php?srv=intercomunicacao2.2';
  try {
    const w = await (await fetch(base + 'wsdl.php?srv=intercomunicacao2.2', { signal: AbortSignal.timeout(10000) })).text();
    loc = (w.match(/soap:address location="([^"]+)"/) || [])[1] || loc;
  } catch { /* usa o endereço padrão */ }
  const corpo = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ser="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">' +
    '<soapenv:Header/><soapenv:Body><ser:consultarAvisosPendentes><tip:idConsultante>' + esc(usuario) + '</tip:idConsultante><tip:senhaConsultante>' +
    esc(senha) + '</tip:senhaConsultante></ser:consultarAvisosPendentes></soapenv:Body></soapenv:Envelope>';
  const r = await fetch(loc, { method: 'POST', body: corpo, headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'consultarAvisosPendentes' }, signal: AbortSignal.timeout(35000) });
  const x = await r.text();
  const sucesso = /<[\w:]*sucesso>\s*true/i.test(x);
  const mensagem = desc((/<[\w:]*mensagem>([\s\S]*?)<\/[\w:]*mensagem>/.exec(x) || [])[1] || '').replace(/^-+>/, '').trim();
  const avisos: any[] = [];
  const re = /<([\w]+:)?aviso\b([^>]*)>([\s\S]*?)<\/\1?aviso>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(x)) && avisos.length < 500) {
    const ab = m[2], dentro = m[3];
    const dados = (/<[\w:]*(?:processo|dadosBasicos)\b[^>]*>/.exec(dentro) || [''])[0];
    const numero = atr(dados, 'numero') || ((/numero="(\d{20})"/.exec(dentro) || [])[1] || '');
    const orgao = desc(atr((/<[\w:]*orgaoJulgador\b[^>]*>/.exec(dentro) || [''])[0], 'nomeOrgao'));
    const dest = desc(atr((/<[\w:]*pessoa\b[^>]*>/.exec(dentro) || [''])[0], 'nome'));
    const disp = (/<[\w:]*dataDisponibilizacao>([^<]+)</.exec(dentro) || [])[1] || atr(ab, 'dataDisponibilizacao');
    avisos.push({ id: atr(ab, 'idAviso'), tipo: atr(ab, 'tipoComunicacao'), numero, orgao, destinatario: dest, disponibilizado: disp, classe: atr(dados, 'classeProcessual') });
  }
  if (!sucesso && !avisos.length) return { ok: false, http: r.status, mensagem: mensagem || ('o tribunal respondeu ' + r.status), ms: Date.now() - t0, avisos: [] };
  return { ok: true, http: r.status, mensagem, ms: Date.now() - t0, avisos };
}

async function lerTribunal(trib: string, cred: { usuario: string; senha: string }) {
  const t = TRIBUNAIS[trib]; const partes: any[] = [];
  await Promise.all(Object.entries(t.bases).map(async ([nome, base]) => {
    try { const r = await avisosPendentes(base, cred.usuario, cred.senha); partes.push({ nome, ...r }); }
    catch (e) { partes.push({ nome, ok: false, mensagem: /timed out|Timeout/i.test(String(e)) ? 'o tribunal não respondeu a tempo' : 'não consegui falar com o tribunal: ' + String((e as Error).message || e).slice(0, 120), avisos: [] }); }
  }));
  return partes.sort((a, b) => Object.keys(t.bases).indexOf(a.nome) - Object.keys(t.bases).indexOf(b.nome));
}


/* =====================================================================================================================
   8.59 INTIMAÇÕES ELETRÔNICAS DO PJe (pedido da usuária, 24/11/2026: "igual ao Astrea: login, senha e 2FA Seed").
   Desde 03/11/2025 o PJe pede, além do CPF e da senha, o código de 6 dígitos do aplicativo autenticador. A "2FA Seed" é a CHAVE que fica
   dentro do QR Code do autenticador: com ela o robô gera o mesmo código do celular (TOTP, RFC 6238) e entra sozinho no PJe.
   Caminho (conferido em 24/11 a partir de São Paulo — o PJe recusa servidores dos EUA): <base>/authenticateSSO.seam → login nacional
   (sso.cloud.pje.jus.br, PDPJ) → CPF + senha → código de 6 dígitos → volta ao PJe com a sessão. REGRA DE OURO: o robô só LISTA; nunca abre
   expediente nem documento (abrir = ciência).
   ===================================================================================================================== */
export const PJE: Record<string, { nome: string; graus: Record<string, string> }> = {
  trt12: { nome: 'TRT 12 — Santa Catarina', graus: { '1g': 'https://pje.trt12.jus.br/primeirograu/', '2g': 'https://pje.trt12.jus.br/segundograu/' } },
  trt2: { nome: 'TRT 2 — São Paulo (capital)', graus: { '1g': 'https://pje.trt2.jus.br/primeirograu/', '2g': 'https://pje.trt2.jus.br/segundograu/' } },
  trt20: { nome: 'TRT 20 — Sergipe', graus: { '1g': 'https://pje.trt20.jus.br/primeirograu/', '2g': 'https://pje.trt20.jus.br/segundograu/' } },
  trt6: { nome: 'TRT 6 — Pernambuco', graus: { '1g': 'https://pje.trt6.jus.br/primeirograu/', '2g': 'https://pje.trt6.jus.br/segundograu/' } },
  trt23: { nome: 'TRT 23 — Mato Grosso', graus: { '1g': 'https://pje.trt23.jus.br/primeirograu/', '2g': 'https://pje.trt23.jus.br/segundograu/' } },
  trt4: { nome: 'TRT 4 — Rio Grande do Sul', graus: { '1g': 'https://pje.trt4.jus.br/primeirograu/', '2g': 'https://pje.trt4.jus.br/segundograu/' } },
  trt9: { nome: 'TRT 9 — Paraná', graus: { '1g': 'https://pje.trt9.jus.br/primeirograu/', '2g': 'https://pje.trt9.jus.br/segundograu/' } },
  trt16: { nome: 'TRT 16 — Maranhão', graus: { '1g': 'https://pje.trt16.jus.br/primeirograu/', '2g': 'https://pje.trt16.jus.br/segundograu/' } },
  tst: { nome: 'TST', graus: { '3g': 'https://pje.tst.jus.br/tst/' } },
};
export const GRAU_NOME: Record<string, string> = { '1g': 'Intimação Eletrônica PJe Primeiro Grau', '2g': 'Intimação Eletrônica PJe Segundo Grau', '3g': 'Intimação Eletrônica PJe TST' };

/** A seed pode vir solta (base32, com espaços) ou inteira (otpauth://totp/...?secret=X&period=30&digits=6&algorithm=SHA1). */
export function lerSeed(txt: string) {
  const t = String(txt || '').trim(); let secret = t, period = 30, digits = 6, algo = 'SHA-1';
  if (/^otpauth:/i.test(t)) { try { const u = new URL(t); secret = u.searchParams.get('secret') || ''; period = +(u.searchParams.get('period') || 30) || 30;
    digits = +(u.searchParams.get('digits') || 6) || 6; const a = String(u.searchParams.get('algorithm') || 'SHA1').toUpperCase(); algo = a === 'SHA256' ? 'SHA-256' : a === 'SHA512' ? 'SHA-512' : 'SHA-1'; } catch { secret = ''; } }
  secret = secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) return null;
  return { secret, period, digits, algo };
}
function base32(s: string) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, val = 0; const out: number[] = [];
  for (const c of s) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
/** Código de 6 dígitos (TOTP, RFC 6238) — o mesmo do aplicativo autenticador. */
export async function totp(seed: { secret: string; period: number; digits: number; algo: string }, quando = Date.now()) {
  const k = await crypto.subtle.importKey('raw', base32(seed.secret), { name: 'HMAC', hash: seed.algo }, false, ['sign']);
  let c = Math.floor(quando / 1000 / seed.period); const msg = new Uint8Array(8); for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)); const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** seed.digits).padStart(seed.digits, '0');
}

const UA_PJE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** Navegador mínimo: guarda os cookies por site e segue os redirecionamentos. */
class Nav {
  jar: Record<string, Record<string, string>> = {};
  cookie(u: string) { const h = new URL(u).host; return Object.entries(this.jar[h] || {}).map(([k, v]) => k + '=' + v).join('; '); }
  guardar(u: string, r: Response) { const h = new URL(u).host; const sc = (r.headers as any).getSetCookie ? (r.headers as any).getSetCookie() : [];
    sc.forEach((c: string) => { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) { (this.jar[h] = this.jar[h] || {})[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }); }
  async ir(u: string, init: RequestInit = {}, max = 10) {
    let url = u, opts: RequestInit = init;
    for (let i = 0; i <= max; i++) {
      const r = await fetch(url, { ...opts, redirect: 'manual', headers: { 'User-Agent': UA_PJE, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9', ...(opts.headers || {}), cookie: this.cookie(url) }, signal: AbortSignal.timeout(25000) });
      this.guardar(url, r);
      const loc = r.headers.get('location');
      if (loc && r.status >= 300 && r.status < 400) { url = new URL(loc, url).toString(); opts = {}; await r.body?.cancel(); continue; }
      const ct = r.headers.get('content-type') || '', buf = new Uint8Array(await r.arrayBuffer());
      return { url, status: r.status, html: new TextDecoder(/8859-1|latin1|windows-1252/i.test(ct) ? 'iso-8859-1' : 'utf-8').decode(buf) };
    }
    throw new Error('redirecionamentos demais');
  }
}
const deHtml = (s: string) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function formulario(html: string) {
  const f = /<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i.exec(html); if (!f) return null;
  const campos: Record<string, string> = {}; const re = /<input[^>]*>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(f[2]))) { const n = atr(m[0], 'name'); if (n && !/type="(submit|button|checkbox)"/i.test(m[0])) campos[n] = deHtml(atr(m[0], 'value')); }
  return { action: deHtml(f[1]), campos, html: f[2] };
}
const msgErro = (html: string) => {
  const bruto = (/<span[^>]*(?:kc-feedback-text|input-error|alert-error)[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i.exec(html) || /<span[^>]*(?:kc-feedback-text|input-error)[^>]*>([\s\S]*?)<\/span>/i.exec(html) || [])[1] || '';
  // o PDPJ mostra a recusa do CPF/senha como uma página "HTTP Status 401" embutida (conferido em 24/11/2026)
  if (/HTTP Status 401|requires HTTP authentication/i.test(bruto)) return 'O PJe recusou o CPF ou a senha';
  return deHtml(bruto.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 160);
};
const titulo = (html: string) => deHtml((/<title>([^<]*)/i.exec(html) || [])[1] || '').trim();
const ehSso = (u: string) => /sso\.cloud\.pje\.jus\.br|\/auth\/realms\//.test(u);

/** Entra no PJe (CPF + senha + código do autenticador). Devolve o navegador já logado ou o motivo exato. */
export async function entrarPje(base: string, cred: { login: string; senha: string; seed: string; period?: number }, navJa?: Nav) {
  const seed = lerSeed(cred.seed || ''); const nav = navJa || new Nav();
  if (cred.seed && !seed) return { ok: false, etapa: 'seed', mensagem: 'A 2FA Seed não parece uma chave do autenticador (letras A–Z e números 2–7).' };
  if (seed && cred.period) seed.period = cred.period;
  let p = await nav.ir(base + 'authenticateSSO.seam');
  if (p.status === 403) return { ok: false, etapa: 'bloqueio', mensagem: 'O PJe recusou o servidor (403). Tente de novo mais tarde.' };
  // 8.62: o login nacional (PDPJ) já está aberto neste navegador → o PJe do outro tribunal entra sem pedir senha nem código de novo
  if (!ehSso(p.url) && navJa && p.status < 400 && (nav.jar[new URL(base).host] || {}).access_token) return { ok: true, nav, url: p.url, titulo: titulo(p.html), html: p.html, reuso: true };
  if (!ehSso(p.url)) return { ok: false, etapa: 'sso', mensagem: 'O PJe não abriu a tela de login nacional (' + p.status + ').' };
  let f = formulario(p.html); if (!f || !('username' in f.campos)) return { ok: false, etapa: 'login', mensagem: 'A tela de login do PJe mudou (' + titulo(p.html) + ').' };
  const corpo = new URLSearchParams({ ...f.campos, username: String(cred.login).replace(/\D/g, '') || cred.login, password: cred.senha, credentialId: '' });
  p = await nav.ir(new URL(f.action, p.url).toString(), { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  for (let passo = 0; passo < 3 && ehSso(p.url); passo++) {
    f = formulario(p.html);
    const campoOtp = f && Object.keys(f.campos).find(k => /^(otp|totp|code|codigo|token)$/i.test(k));
    if (f && 'password' in f.campos && !campoOtp) return { ok: false, etapa: 'senha', mensagem: msgErro(p.html) || 'O PJe recusou o CPF ou a senha.' };
    if (!campoOtp) return { ok: false, etapa: 'desconhecida', mensagem: 'Depois da senha o PJe mostrou uma tela que o robô não conhece: "' + titulo(p.html) + '"' + (msgErro(p.html) ? ' — ' + msgErro(p.html) : '') + '.', campos: f ? Object.keys(f.campos) : [] };
    if (!seed) return { ok: false, etapa: 'seed', mensagem: 'O PJe pediu o código do autenticador: preencha a 2FA Seed.' };
    const cod = await totp(seed);
    p = await nav.ir(new URL(f!.action, p.url).toString(), { method: 'POST', body: new URLSearchParams({ ...f!.campos, [campoOtp]: cod }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (ehSso(p.url) && formulario(p.html) && Object.keys(formulario(p.html)!.campos).some(k => k === campoOtp))
      return { ok: false, etapa: 'codigo', mensagem: (msgErro(p.html) || 'O código do autenticador não foi aceito') + ' — confira a 2FA Seed e se é a do mesmo PJe.' };
  }
  if (ehSso(p.url)) return { ok: false, etapa: 'sso', mensagem: 'O login nacional não devolveu ao PJe: ' + (msgErro(p.html) || titulo(p.html)) };
  if (p.status >= 400) return { ok: false, etapa: 'pje', mensagem: 'O PJe respondeu ' + p.status + ' depois do login.' };
  return { ok: true, nav, url: p.url, titulo: titulo(p.html), html: p.html };
}

/* =====================================================================================================================
   8.61 PJe pelo PAINEL DO ADVOGADO (API do próprio PJe, a mesma que a tela usa) — pedido da usuária (25/11/2026, TRT6).
   Depois do login (CPF + senha + 2FA) o robô lê, SÓ LISTANDO: o acervo do advogado (/paineladvogado/{id}/processos), os expedientes de
   cada processo (/processos/id/{id}/expedientes: tipo, meio, dias, ciência e a DATA FINAL do PJe, aberto/fechado, destinatário) e as
   audiências (/processos/id/{id}/audiencias: data, hora, tipo, situação, sala). NUNCA chama darCiencia (PUT), documentos nem o teor.
   O TRT12 (e outros) bloqueiam essa API para servidores ("Request blocked" do CloudFront): aí o robô avisa e o resto continua.
   ===================================================================================================================== */
const PJE_MAX_PROC = 150, PJE_TEMPO = 100000;
export async function lerPainelPje(cred: any, navJa?: Nav) {
  const t0 = Date.now(), base = PJE[cred.trib] && PJE[cred.trib].graus[cred.grau];
  if (!base) return { ok: false, etapa: 'tribunal', mensagem: 'Tribunal/grau desconhecido.' };
  let r: any = await entrarPje(base, cred, navJa);
  let period = 0;
  // código recusado: pode ser o MESMO código já usado há segundos (o login nacional não aceita repetido) → espera o próximo e tenta 1 vez
  if (!r.ok && r.etapa === 'codigo') { const per = (cred.period || 30) * 1000; await new Promise(ok => setTimeout(ok, per - (Date.now() % per) + 1500)); r = await entrarPje(base, cred); }
  if (!r.ok && r.etapa === 'codigo' && !cred.period) { const r2: any = await entrarPje(base, { ...cred, period: 60 }); if (r2.ok) { r = r2; period = 60; } }
  if (!r.ok) return { ok: false, etapa: r.etapa, mensagem: r.mensagem };
  const nav: Nav = r.nav, u0 = new URL(base), jar = nav.jar[u0.host] || {}, origem = u0.origin;
  let id = '';
  try { const tok = decodeURIComponent(jar.access_token || ''); id = String(JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); } catch { /* sem token */ }
  if (!/^\d+$/.test(id)) return { ok: false, period, etapa: 'token', mensagem: 'Entrou no PJe, mas o PJe não devolveu a identificação do advogado.' };
  const api = origem + '/pje-comum-api/api', instancia = cred.grau === '2g' ? '2' : cred.grau === '3g' ? '3' : '1';
  const H = { Accept: 'application/json, text/plain, */*', Referer: origem + '/pjekz/', 'X-XSRF-TOKEN': decodeURIComponent(jar['Xsrf-Token'] || '') };
  const jget = async (caminho: string) => {
    const x = await nav.ir(api + caminho, { headers: H });
    if (x.status === 403 && /Request blocked|cloudfront/i.test(x.html)) throw new Error('BLOQUEIO');
    let j: any = null; try { j = JSON.parse(x.html); } catch { /* não é json */ }
    if (x.status >= 400 || j === null) throw new Error('O PJe respondeu ' + x.status + ' em ' + caminho.split('?')[0].replace(/\d{3,}/g, '{id}'));
    return j;
  };
  const sigla = cred.trib.toUpperCase(), grauNome = cred.grau === '2g' ? '2º grau' : cred.grau === '3g' ? 'TST' : '1º grau';
  const out: any = { ok: true, sigla, sistema: 'PJe', grau: grauNome, contagens: {}, prazos: [], pendentes: [], pauta: [], audiencias: [], avisos: [], processos: 0, outros_destinos: 0 };
  try {
    const tots = await jget('/paineladvogado/' + id + '/totalizadores');
    const c: any = {}; (Array.isArray(tots) ? tots : []).forEach((t: any) => { c[String(t.nomeAgrupamentoTarefa || t.idAgrupamentoProcessoTarefa)] = +t.quantidadeProcessos || 0; });
    out.contagens[grauNome] = c;
    const procs: any[] = [];
    for (let pg = 1; pg <= 10 && procs.length < PJE_MAX_PROC; pg++) {
      const j = await jget('/paineladvogado/' + id + '/processos?pagina=' + pg + '&tamanhoPagina=100');
      const arr = (j && j.resultado) || []; procs.push(...arr);
      if (arr.length < 100 || procs.length >= (+j.totalRegistros || 0)) break;
    }
    if (procs.length > PJE_MAX_PROC) out.avisos.push('O acervo tem ' + procs.length + ' processos: li os ' + PJE_MAX_PROC + ' primeiros nesta rodada.');
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const fila = procs.slice(0, PJE_MAX_PROC);
    const um = async (p: any) => {
      const numero = String(p.numeroProcesso || ''), vara = String(p.descricaoOrgaoJulgador || '');
      const partes = [p.nomeParteAutora ? p.nomeParteAutora + (p.qtdeParteAutora > 1 ? ' e outros' : '') : '', p.nomeParteRe ? p.nomeParteRe + (p.qtdeParteRe > 1 ? ' e outros' : '') : ''].filter(Boolean).join(' × ');
      const base0 = { numero, grau: grauNome, classe: String(p.classeJudicial || ''), vara, partes, sigilo: !!p.segredoDeJustica };
      const ex = await jget('/processos/id/' + p.id + '/expedientes?pagina=1&tamanhoPagina=100&instancia=' + instancia);
      ((ex && ex.resultado) || (Array.isArray(ex) ? ex : [])).forEach((e: any) => {
        if (e.fechado || !e.fimDoPrazoLegal) return;
        const dest = String(e.nomePessoaParte || ''), polo = dest && dest === p.nomeParteAutora ? 'ativo' : dest && dest === p.nomeParteRe ? 'passivo' : 'outro';
        out.prazos.push({ ...base0, evento: String(e.tipoExpediente || 'Intimação') + (e.meioExpediente ? ' (' + e.meioExpediente + ')' : ''), dias: +e.prazoLegal || 0,
          corridos: /CORRID/i.test(String(e.tipoPrazoEnum || e.tipoPrazo || '')), envio: String(e.dataCriacao || '').slice(0, 16), inicio: String(e.dataCiencia || '').slice(0, 10),
          fim: String(e.fimDoPrazoLegal).slice(0, 10), destinatario: dest, polo, expediente: e.id, vencido: !!e.prazoVencido });
      });
      const au = await jget('/processos/id/' + p.id + '/audiencias?canceladas=true');
      (Array.isArray(au) ? au : []).forEach((a: any) => {
        const ini = String(a.dataInicio || ''), st = String(a.status || '');
        if (!/^\d{4}-\d{2}-\d{2}T/.test(ini) || ini.slice(0, 10) < new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10)) return; // 8.65: as passadas trazem o resultado
        out.audiencias.push({ ...base0, evento: String((a.tipo && (a.tipo.descricao || a.tipo)) || 'Audiência') + (/designad/i.test(st) ? '' : ' — ' + st), situacao: st,
          data: ini.slice(0, 10), hora: ini.slice(11, 16), sala: String((a.salaFisica && a.salaFisica.nome) || ''), obs: '' });
      });
    };
    for (let i = 0; i < fila.length; i += 4) {
      if (Date.now() - t0 > PJE_TEMPO) { out.avisos.push('Tempo esgotado: li ' + i + ' de ' + fila.length + ' processos; o resto na próxima rodada.'); break; }
      await Promise.all(fila.slice(i, i + 4).map(p => um(p).catch((e: Error) => { if (e.message === 'BLOQUEIO') throw e; out.avisos.push(String(p.numeroProcesso) + ': ' + String(e.message).slice(0, 100)); })));
    }
    out.processos = fila.length;
  } catch (e) {
    const m = String((e as Error).message || e);
    if (m === 'BLOQUEIO') return { ok: false, period, etapa: 'bloqueio', mensagem: 'o ' + sigla + ' bloqueia a lista do painel do advogado para servidores (proteção do tribunal). Os avisos dele continuam chegando pelo e-mail e pelo DJEN.' };
    return { ok: false, period, etapa: 'lista', mensagem: m.slice(0, 200) };
  }
  out.ms = Date.now() - t0; if (period) out.period = period; out.nav = nav;
  return out;
}

/* =====================================================================================================================
   8.60 eproc pelo LOGIN NOVO (SSO + 2FA), como a pessoa entra — pedido da usuária (25/11/2026: "coloque os prazos certos, calculados
   certos, porque dá para ver pelo eproc, e as audiências corretas"). O TJSC passou o login para sso.tjsc.jus.br: o webservice antigo
   (MNI) recusa a senha de tela; com usuário + senha + 2FA Seed o robô entra no PAINEL DO ADVOGADO e LÊ as listas:
   prazos em aberto (com a data FINAL do eproc), intimações aguardando abertura (com os dias), pauta e audiências futuras.
   REGRA DE OURO: só listas. Nunca "Abrir Prazo" (preparar_processo_citado), nunca "Visualizar"/confirmar — abrir = ciência.
   ===================================================================================================================== */
export const SSO_EPROC: Record<string, { nome: string; sigla: string; auth?: string; client?: string; redirect?: string; inicio?: string; base: string; graus: Record<string, string> }> = {
  ssotjsc: { nome: 'TJSC — eproc (1º e 2º grau)', sigla: 'TJSC', auth: 'https://sso.tjsc.jus.br/realms/eproc/protocol/openid-connect/auth', client: 'eproc-tjsc-1g',
    redirect: 'https://eproc1g.tjsc.jus.br/eproc/externo_controlador.php?acao=SSO/callback', base: 'https://eproc1g.tjsc.jus.br/eproc/', graus: { SC: '1º grau', TJSC: '2º grau' } },
  // 8.60.1 Justiça Federal: eproc da JFSC → login nacional (sso.cloud.pje.jus.br, kc_idp_hint=trf4) → login do TRF4 (eproc-sso.trf4.jus.br) + 2FA do TRF4
  ssotrf4: { nome: 'Justiça Federal — eproc (JFSC e TRF4)', sigla: 'JFSC', inicio: 'https://eproc.jfsc.jus.br/eprocV2/', base: 'https://eproc.jfsc.jus.br/eprocV2/',
    graus: { SC: 'JFSC (1º grau)', JFSC: 'JFSC (1º grau)', TRF4: 'TRF4 (2º grau)', RS: 'JFRS', PR: 'JFPR' } },
  // 8.63.1 TJRS: eproc do RS → login nacional (sso.cloud.pje.jus.br, kc_idp_hint=tjrs) → login do TJRS (respondeu do Supabase de São Paulo em 28/11)
  ssotjrs: { nome: 'TJRS — eproc (1º e 2º grau)', sigla: 'TJRS', inicio: 'https://eproc1g.tjrs.jus.br/eproc/', base: 'https://eproc1g.tjrs.jus.br/eproc/',
    graus: { RS: '1º grau', TJRS: '2º grau' } },
};
const NUNCA_ABRIR = /preparar_processo_citado|confirma|ciencia|abrir_prazo|marcar_visualiz/i;
const reCnj = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const textoH = (h: string) => deHtml(String(h || '').replace(/<br\s*\/?>/gi, ' | ').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();
const datasH = (s: string) => [...String(s).matchAll(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/g)].map(m => ({ d: m[3] + '-' + m[2] + '-' + m[1], h: m[4] ? m[4] + ':' + m[5] : '' }));
const linhasH = (html: string) => [...String(html).matchAll(/<tr class="infraTr(?:Clara|Escura)"[\s\S]*?<\/tr>/gi)].map(m => m[0]);
const celulasH = (tr: string) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)(?=<td[\s>]|<\/tr>)/gi)].map(m => m[1]);
const registros = (html: string) => +((/\((\d+)\s+registros?\)/i.exec(html) || [])[1] || 0);
/** 8.60.1: partes (Autor × Réu, com o papel), vara e o resto do que a linha mostra — sem CPF/CNPJ. */
function partesDaCelula(cel: string) {
  let h = String(cel || ''); const k = h.search(/Cadastrar Lembrete/i); if (k >= 0) h = h.slice(k).replace(/^[^<]*<\/a>/, '');
  const t = textoH(h).replace(/\(\s*[\d.\-\/]{8,}\s*\)/g, ' ').replace(/Ju[ií]zo:\s*\S+/i, ' ').replace(/Cadastrar Lembrete/gi, ' ');
  return t.replace(/\s*\|\s*/g, ' ').replace(/\s+X\s+/g, ' × ').replace(/\s+/g, ' ').replace(/^\(?[^()]*(?:Vara|Juizado|Turma|C[aâ]mara|Comarca|Gabinete)[^()]*\)?\s*/i, '').trim().slice(0, 300);
}
function basicoLinha(tr: string) {
  const cel = celulasH(tr).find(c => reCnj.test(c)) || '';
  return { numero: (reCnj.exec(tr) || [''])[0], cliente: deHtml((/id="lblAtencao">([^<]+)</.exec(tr) || [])[1] || '').trim(), juizo: deHtml((/Ju[ií]zo:\s*<\/b>\s*([^<]+)/i.exec(tr) || [])[1] || '').trim(),
    vara: deHtml((/\(([^()<]*(?:Vara|Juizado|Turma|C[aâ]mara|Comarca|Gabinete|Ju[ií]zo)[^()<]*)\)/i.exec(tr) || [])[1] || '').trim(), partes: partesDaCelula(cel) };
}
/** "Processos com prazo em aberto": [chk, processo, classe, assunto, "evento | N dias", envio, início, fim]. */
function lerPrazosAbertos(html: string, grau: string) {
  return linhasH(html).map(tr => { const c = celulasH(tr), i = c.findIndex(x => /\d+\s*dias?/i.test(textoH(x))); if (i < 0) return null;
    const ev = textoH(c[i]), ds = datasH(c.slice(i + 1).join(' '));
    return { ...basicoLinha(tr), grau, classe: textoH(c[i - 2] || ''), assunto: textoH(c[i - 1] || ''), evento: ev.replace(/\s*\|?\s*\d+\s*dias?.*$/i, '').trim(), dias: +((/(\d+)\s*dias?/i.exec(ev) || [])[1] || 0),
      corridos: /corrid/i.test(ev), envio: ds[0] ? ds[0].d + (ds[0].h ? ' ' + ds[0].h : '') : '', inicio: (ds[1] || {}).d || '', fim: (ds[2] || {}).d || '' }; }).filter(x => x && x.numero);
}
/** "Aguardando abertura" (pendentes de ciência): [chk, processo, classe, assunto, "evento | N dias", envio, (Abrir Prazo — NUNCA), início]. */
function lerPendentes(html: string, grau: string) {
  return linhasH(html).map(tr => { const c = celulasH(tr), i = c.findIndex(x => /\d+\s*dias?|intima|cita/i.test(textoH(x)) && !reCnj.test(x)); if (i < 0) return null;
    const ev = textoH(c[i]), ds = datasH(c.slice(i + 1).join(' '));
    return { ...basicoLinha(tr), grau, classe: textoH(c[i - 2] || ''), assunto: textoH(c[i - 1] || ''), evento: ev.replace(/\s*\|?\s*\d+\s*dias?.*$/i, '').trim(), dias: +((/(\d+)\s*dias?/i.exec(ev) || [])[1] || 0),
      corridos: /corrid/i.test(ev), envio: ds[0] ? ds[0].d + (ds[0].h ? ' ' + ds[0].h : '') : '' }; }).filter(x => x && x.numero);
}
/** "Intimações de pauta": [processo, assunto, "Intimação... Sessão virtual... período", período, sequencial, julgadores, (Visualizar — NUNCA)]. */
function lerPauta(html: string, grau: string) {
  return linhasH(html).map(tr => { const c = celulasH(tr), ev = textoH(c[2] || '');
    const per = datasH((/Per[ií]odo da sess[aã]o:?([\s\S]*?)(?:Sequencial|\(|$)/i.exec(ev) || [])[1] || textoH(c[3] || '')), env = datasH((/\((\d{2}\/\d{2}\/\d{4}[^)]*)\)/.exec(ev) || [])[1] || '')[0];
    return { ...basicoLinha(tr), grau, assunto: textoH(c[1] || ''), evento: ev.replace(/\s*\(\d{2}\/\d{2}\/\d{4}[^)]*\)\s*/, ' ').slice(0, 220).trim(), ini: (per[0] || {}).d || '', fim: (per[1] || per[0] || {}).d || '',
      envio: env ? env.d + (env.h ? ' ' + env.h : '') : '' }; }).filter(x => x.numero);
}
/** "Audiências futuras": [processo, evento, "Sala … Início dd/mm/aaaa hh:mm … Previsão Término …", observação]. */
function lerAudiencias(html: string) {
  return linhasH(html).map(tr => { const c = celulasH(tr), local = c[2] || '', ini = datasH(((/In[ií]cio([\s\S]*?)(?:Previs|$)/i.exec(local) || [])[1]) || local)[0];
    return { ...basicoLinha(tr), evento: textoH(c[1] || ''), sala: textoH(((/Sala<\/b>:?([\s\S]*?)<p/i.exec(local) || [])[1]) || '').replace(/^\|\s*/, ''), data: ini ? ini.d : '', hora: ini ? ini.h : '', obs: textoH(c[3] || '') }; })
    .filter(x => x.numero && x.data);
}
/** Entra no eproc pelo login novo: usuário + senha + código do autenticador (TOTP da 2FA Seed). */
export async function entrarEprocSso(cfg: typeof SSO_EPROC[string], cred: { login: string; senha: string; seed: string }) {
  const seed = lerSeed(cred.seed || ''), nav = new Nav();
  if (cred.seed && !seed) return { ok: false, etapa: 'seed', mensagem: 'A 2FA Seed não parece uma chave do autenticador (letras A–Z e números 2–7).' };
  let p = await nav.ir(cfg.inicio || (cfg.auth + '?response_type=code&redirect_uri=' + encodeURIComponent(cfg.redirect!) + '&client_id=' + cfg.client + '&scope=profile+openid'));
  if (p.status === 403) return { ok: false, etapa: 'bloqueio', mensagem: 'O eproc recusou o servidor (403). Tente de novo mais tarde.' };
  let f = formulario(p.html);
  if (!f || !('username' in f.campos)) return { ok: false, etapa: 'login', mensagem: 'A tela de login do eproc mudou (' + titulo(p.html) + ').' };
  p = await nav.ir(new URL(f.action, p.url).toString(), { method: 'POST', body: new URLSearchParams({ ...f.campos, username: String(cred.login).trim(), password: cred.senha }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  let senhaEnviada = 1;
  for (let passo = 0; passo < 4 && /\/realms\//.test(p.url); passo++) {
    f = formulario(p.html);
    const otp = f && Object.keys(f.campos).find(k => /^(otp|totp|code|codigo|token)$/i.test(k));
    if (f && 'password' in f.campos && !otp) {
      if (senhaEnviada >= 2) return { ok: false, etapa: 'senha', mensagem: (msgErro(p.html) || 'O eproc recusou o usuário ou a senha').replace(/PJe/g, 'eproc') + '.' };
      // 2º Keycloak no caminho (ex.: PDPJ → TRF4): ainda não recebeu a senha — envia uma vez
      if (msgErro(p.html)) return { ok: false, etapa: 'senha', mensagem: msgErro(p.html).replace(/PJe/g, 'eproc') + '.' };
      senhaEnviada++;
      p = await nav.ir(new URL(f.action, p.url).toString(), { method: 'POST', body: new URLSearchParams({ ...f.campos, username: String(cred.login).trim(), password: cred.senha }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      continue;
    }
    if (!otp) return { ok: false, etapa: 'desconhecida', mensagem: 'Depois da senha o eproc mostrou uma tela que o robô não conhece: "' + titulo(p.html) + '".' };
    if (!seed) return { ok: false, etapa: 'seed', mensagem: 'O eproc pediu o código do autenticador: preencha a 2FA Seed.' };
    p = await nav.ir(new URL(f!.action, p.url).toString(), { method: 'POST', body: new URLSearchParams({ ...f!.campos, [otp]: await totp(seed) }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const f2 = /\/realms\//.test(p.url) && formulario(p.html);
    if (f2 && otp in f2.campos) return { ok: false, etapa: 'codigo', mensagem: (msgErro(p.html) || 'O código do autenticador não foi aceito') + ' — confira a 2FA Seed (a do eproc, não a do PJe).' };
  }
  if (/\/realms\//.test(p.url)) return { ok: false, etapa: 'sso', mensagem: 'O login do eproc não voltou ao sistema: ' + (msgErro(p.html) || titulo(p.html)) };
  // 8.60.1: quem tem mais de um perfil (ex.: Justiça Federal: ADVOGADO e ADVOGADO-TITULAR) cai na "Seleção de perfil" — entra no de advogado
  let perfis: { id: string; nome: string }[] = [], perfil = '';
  if (/Sele..o de perfil/i.test(titulo(p.html))) {
    perfis = [...p.html.matchAll(/acaoLogar\('(\d+)'\);"\s*data-descricao="([^"]*)"/g)].map(m => ({ id: m[1], nome: deHtml(m[2]) }));
    const esc = perfis.find(x => /^ADVOGADO$/i.test(x.nome)) || perfis.find(x => /ADVOG/i.test(x.nome)) || perfis[0];
    if (!esc) return { ok: false, etapa: 'perfil', mensagem: 'O eproc pediu para escolher o perfil, mas o robô não achou as opções.' };
    perfil = esc.nome;
    const fm = /<form[^>]*id="frmEscolherUsuario"[^>]*>([\s\S]*?)<\/form>/i.exec(p.html), campos: Record<string, string> = {};
    if (fm) for (const m of fm[1].matchAll(/<input[^>]*>/gi)) { const n = atr(m[0], 'name'); if (n) campos[n] = deHtml(atr(m[0], 'value')); }
    p = await nav.ir(new URL('controlador.php?acao=pessoa_usuario_logar&acao_origem=entrar_sso&id_usuario=' + esc.id, p.url).toString(),
      { method: 'POST', body: new URLSearchParams(campos), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }
  if (!/Painel do Advogado/i.test(titulo(p.html))) return { ok: false, etapa: 'eproc', mensagem: 'Entrou no eproc, mas não abriu o Painel do Advogado (' + titulo(p.html) + ').' };
  return { ok: true, nav, html: p.html, url: p.url, perfil, perfis: perfis.map(x => x.nome) };
}
/** Lê o Painel do Advogado: contagens + as listas (1º e 2º grau) + audiências futuras. Nunca abre intimação. */
export async function lerPainelEproc(cfg: typeof SSO_EPROC[string], cred: { login: string; senha: string; seed: string }) {
  const t0 = Date.now(), e: any = await entrarEprocSso(cfg, cred);
  if (!e.ok) return { ...e, ms: Date.now() - t0 };
  const nav: Nav = e.nav, painel: string = e.html, base = cfg.base;
  const ir = async (u: string, init: RequestInit = {}) => { if (NUNCA_ABRIR.test(u)) throw new Error('endereço proibido (daria ciência)'); let ult: unknown;
    for (let t = 0; t < 3; t++) { try { return await nav.ir(u, init); } catch (x) { ult = x; await new Promise(r => setTimeout(r, 1500)); } } throw ult; };
  const out: any = { ok: true, prazos: [], pendentes: [], pauta: [], audiencias: [], contagens: {}, avisos: [], perfil: e.perfil || '', perfis: e.perfis || [] };
  // 8.65: mapa do painel (só os NOMES das listas e o texto do link — nada é aberto), para saber o que mais o eproc mostra
  out.mapa = [...painel.matchAll(/<a[^>]*href="(controlador\.php\?acao=([a-z_]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ acao: m[2], texto: textoH(m[3]).slice(0, 80) }))
    .filter((x, i, a) => x.texto && !NUNCA_ABRIR.test(x.acao) && a.findIndex(y => y.acao === x.acao && y.texto === x.texto) === i).slice(0, 120);
  const ajax = [...painel.matchAll(/controlador_ajax\.php\?acao_ajax=retornar_citacao_intimacao_estado[^"'\s]*/gi)].map(m => deHtml(m[0])).filter((x, i, a) => a.indexOf(x) === i);
  for (const u of ajax) {
    try {
      const r = await ir(base + u, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }); const j = JSON.parse(r.html);
      const us = (j.usuarios || [])[0]; if (!us) continue;
      const uf = String((j.requestInfo || {}).uf || ''), grau = cfg.graus[uf] || uf, R = us.resultados || {}, L = us.links || {};
      out.mapaAjax = out.mapaAjax || {}; out.mapaAjax[grau] = { resultados: R, links: Object.keys(L) };
      out.contagens[grau] = { aguardando_abertura: +R.numCitacaoIntimacaoPendente || 0, prazos_em_aberto: +R.numCitacaoIntimacaoAberto || 0, pauta: +R.numCitacaoIntimacaoPauta || 0, decurso: +R.numDecursoPrazo || 0 };
      const lista = async (k: string, fn: (h: string, g: string) => any[], chave: string) => {
        if (!L[k]) return; try { const q = await ir(base + L[k]); const itens = fn(q.html, grau); out[chave].push(...itens);
          const n = registros(q.html); if (n > itens.length) out.avisos.push(grau + ': ' + k + ' mostrou ' + itens.length + ' de ' + n + ' (o resto fica para a próxima leitura)'); }
        catch (x) { out.avisos.push(grau + ': não consegui ler ' + k + ' — ' + String((x as Error).message || x).slice(0, 80)); } };
      if (out.contagens[grau].prazos_em_aberto) await lista('intimacaoAberto', lerPrazosAbertos, 'prazos');
      if (out.contagens[grau].aguardando_abertura) await lista('intimacaoPendente', lerPendentes, 'pendentes');
      if (out.contagens[grau].pauta) await lista('intimacaoPauta', lerPauta, 'pauta');
    } catch (x) { out.avisos.push('contagens: ' + String((x as Error).message || x).slice(0, 80)); }
  }
  const ua = /href="(controlador\.php\?acao=audiencia_futura_listar&(?:amp;)?acao_origem[^"]*)"/.exec(painel);
  if (ua) { try { const q = await ir(base + deHtml(ua[1])); out.audiencias = lerAudiencias(q.html); } catch (x) { out.avisos.push('audiências: ' + String((x as Error).message || x).slice(0, 80)); } }
  // 8.65: audiências realizadas / não realizadas (só a LISTA — nada é aberto) para anotar o resultado no painel
  out.audHist = {};
  for (const ac of ['audiencia_realizada_listar', 'audiencia_nao_realizada_listar', 'audiencia_realizada_conciliacao_listar', 'audiencia_nao_realizada_conciliacao_listar']) {
    const m = new RegExp('href="(controlador\\.php\\?acao=' + ac + '[^"]*)"').exec(painel); if (!m) continue;
    try { const q = await ir(base + deHtml(m[1]));
      const desde = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10);
      out.audHist[ac] = linhasH(q.html).map(tr => { const cel = celulasH(tr).map(c => textoH(c).slice(0, 200)), dt = datasH(cel[2] || '')[0] || { d: '', h: '' };
        return { numero: (reCnj.exec(tr) || [''])[0], situacao: cel[1] || '', data: dt.d, hora: dt.h, sala: ((cel[2] || '').match(/Sala \| ([^|]+)/) || [])[1] || '', obs: cel[3] || '' }; })
        .filter(x => x.data >= desde).slice(-150);
    } catch (x) { out.avisos.push(ac + ': ' + String((x as Error).message || x).slice(0, 80)); }
  }
  out.ms = Date.now() - t0;
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let b: any = {};
  try { b = await req.json(); } catch { /* corpo vazio */ }
  try {
    if (b.acao === 'ping') return resp({ ok: true });
    // Robô do painel (Apps Script): prova que tem a chave secreta do banco usando-a para ler o cofre; devolve as pendentes de todos os logins.
    if (b.acao === 'avisos') {
      const k = String(req.headers.get('x-painel-chave') || ''), escId = String(b.escritorio || '');
      if (!k || !/^[0-9a-f-]{36}$/.test(escId)) return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
      const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
      const rr = await fetch(URL_BANCO + '/rest/v1/rpc/painel_trib_info', { method: 'POST', headers: h, body: JSON.stringify({ p_escritorio: escId }) });
      if (!rr.ok) return resp({ ok: false, erro: 'Chave do banco recusada.' }, 403);
      const cr: Record<string, any> = (await rr.json()) || {};
      const ids = Object.keys(cr).filter(t => TRIBUNAIS[t] && cr[t] && cr[t].usuario);
      if (!ids.length) return resp({ ok: true, ligado: false, avisos: [] });
      const st = await estado(escId), todos: any[] = [], partes: any[] = [];
      for (const t of ids) {
        const ps = await lerTribunal(t, cr[t]);
        ps.forEach(p => { partes.push({ nome: p.nome, ok: p.ok, n: (p.avisos || []).length, mensagem: p.ok ? '' : p.mensagem }); (p.avisos || []).forEach((a: any) => todos.push({ ...a, sistema: p.nome })); });
        st[t] = { em: new Date().toISOString(), por: 'robô', ok: ps.some(p => p.ok), n: ps.reduce((a, p) => a + (p.avisos || []).length, 0), partes: ps.map(p => ({ nome: p.nome, ok: p.ok, n: (p.avisos || []).length, mensagem: p.ok ? '' : p.mensagem })) };
      }
      await gravarEstado(escId, st);
      return resp({ ok: true, ligado: true, avisos: todos, partes });
    }
    // 8.60 robô do painel: entra no eproc pelo login novo (SSO + 2FA) e devolve as listas do Painel do Advogado
    if (b.acao === 'painel_eproc') {
      const k = String(req.headers.get('x-painel-chave') || ''), escId = String(b.escritorio || '');
      if (!k || !/^[0-9a-f-]{36}$/.test(escId)) return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
      const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
      const rr = await fetch(URL_BANCO + '/rest/v1/rpc/painel_trib_info', { method: 'POST', headers: h, body: JSON.stringify({ p_escritorio: escId }) });
      if (!rr.ok) return resp({ ok: false, erro: 'Chave do banco recusada.' }, 403);
      const cr: Record<string, any> = (await rr.json()) || {};
      const ids = Object.keys(cr).filter(t => SSO_EPROC[t] && cr[t] && cr[t].login && (!b.so || t === b.so));
      if (!ids.length) return resp({ ok: true, ligado: false, contas: [] });
      const st = await estado(escId), contas: any[] = [];
      for (const t of ids) {
        let c: any; try { c = await lerPainelEproc(SSO_EPROC[t], cr[t]); } catch (x) { c = { ok: false, etapa: 'erro', mensagem: String((x as Error).message || x).slice(0, 200) }; }
        st[t] = { em: new Date().toISOString(), por: 'robô', ok: !!c.ok, etapa: c.etapa || '', ms: c.ms || 0, contagens: c.contagens || {},
          mensagem: c.ok ? (c.prazos.length + ' prazo(s) em aberto, ' + c.pendentes.length + ' aguardando abertura, ' + c.audiencias.length + ' audiência(s)') : c.mensagem };
        contas.push({ chave: t, sigla: SSO_EPROC[t].sigla, ...c, nav: undefined, html: undefined });
      }
      await gravarEstado(escId, st);
      return resp({ ok: true, ligado: true, contas });
    }
    // 8.64: o TRT12 bloqueia a lista para servidores da Amazon. Esta ação SÓ abre a sessão (login + 2FA, a senha não sai do cofre) e devolve os
    // cookies da sessão para o robô do Google pedir a lista de lá. Só para quem tem a chave do banco (o robô).
    if (b.acao === 'pje_sessao') {
      const k = String(req.headers.get('x-painel-chave') || ''), escId = String(b.escritorio || ''), ch = String(b.chave || 'pjetrt121g');
      if (!k || !/^[0-9a-f-]{36}$/.test(escId) || !/^pje[a-z0-9]+$/.test(ch)) return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
      const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
      const rr = await fetch(URL_BANCO + '/rest/v1/rpc/painel_trib_info', { method: 'POST', headers: h, body: JSON.stringify({ p_escritorio: escId }) });
      if (!rr.ok) return resp({ ok: false, erro: 'Chave do banco recusada.' }, 403);
      const cr: Record<string, any> = (await rr.json()) || {}, cred = cr[ch];
      if (!cred || !cred.login || !PJE[cred.trib]) return resp({ ok: false, erro: 'Acesso não guardado.' });
      const base = PJE[cred.trib].graus[cred.grau]; let e: any = await entrarPje(base, cred);
      if (!e.ok && e.etapa === 'codigo') { await new Promise(ok => setTimeout(ok, 30000 - (Date.now() % 30000) + 1500)); e = await entrarPje(base, cred); }
      if (!e.ok) return resp({ ok: false, erro: e.mensagem, etapa: e.etapa });
      const u0 = new URL(base), jar = e.nav.jar[u0.host] || {}; let id = '';
      try { const tok = decodeURIComponent(jar.access_token || ''); id = String(JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); } catch { /* sem token */ }
      return resp({ ok: true, origem: u0.origin, id, cookie: e.nav.cookie(base), xsrf: decodeURIComponent(jar['Xsrf-Token'] || ''), ua: UA_PJE });
    }
    // 8.61 robô do painel: PJe (login + senha + 2FA) pelo painel do advogado — só lista
    if (b.acao === 'painel_pje') {
      const k = String(req.headers.get('x-painel-chave') || ''), escId = String(b.escritorio || '');
      if (!k || !/^[0-9a-f-]{36}$/.test(escId)) return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
      const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
      const rr = await fetch(URL_BANCO + '/rest/v1/rpc/painel_trib_info', { method: 'POST', headers: h, body: JSON.stringify({ p_escritorio: escId }) });
      if (!rr.ok) return resp({ ok: false, erro: 'Chave do banco recusada.' }, 403);
      const cr: Record<string, any> = (await rr.json()) || {};
      const ids = Object.keys(cr).filter(t => /^pje/.test(t) && cr[t] && cr[t].login && PJE[cr[t].trib]);
      if (!ids.length) return resp({ ok: true, ligado: false, contas: [] });
      const st = await estado(escId), contas: any[] = [];
      const navs: Record<string, Nav> = {}, t0p = Date.now();
      // TRT12 1º grau por último (bloqueia a lista para servidores); o resto em ordem
      ids.sort((x, y) => (x === 'pjetrt121g' ? 1 : 0) - (y === 'pjetrt121g' ? 1 : 0) || x.localeCompare(y));
      for (const t of ids) {
        if (Date.now() - t0p > 115000) { contas.push({ chave: t, ok: false, etapa: 'tempo', mensagem: 'fica para a próxima rodada (tempo da rodada esgotado)', sigla: String(cr[t].trib || '').toUpperCase(), sistema: 'PJe' }); continue; }
        const chaveNav = String(cr[t].login).replace(/\D/g, '');
        let c: any; try { c = await lerPainelPje(cr[t], navs[chaveNav]); } catch (x) { c = { ok: false, etapa: 'erro', mensagem: String((x as Error).message || x).slice(0, 200) }; }
        if (c.nav) { navs[chaveNav] = c.nav; delete c.nav; }
        st[t] = { ...(st[t] || {}), em: new Date().toISOString(), por: 'robô', ok: !!c.ok, etapa: c.etapa || '', ms: c.ms || 0, contagens: c.contagens || {},
          mensagem: c.ok ? (c.processos + ' processo(s), ' + c.prazos.length + ' expediente(s) com prazo em aberto, ' + c.audiencias.length + ' audiência(s) marcada(s)') : /bloqueio|lista|token/.test(c.etapa || '') ? 'entrou no PJe, mas ' + c.mensagem : c.mensagem };
        contas.push({ chave: t, ...c, sigla: c.sigla || String(cr[t].trib || '').toUpperCase(), sistema: 'PJe' });
      }
      await gravarEstado(escId, st);
      return resp({ ok: true, ligado: true, contas });
    }
    // Só a administração mexe nos logins dos tribunais.
    const quem = await post('/rest/v1/rpc/painel_quem', { p_token: String(b.token || '') });
    if (!quem || !quem.usuario || quem.usuario.perfil !== 'administrador') return resp({ ok: false, erro: 'Só a administração pode ver e mudar os logins dos tribunais.' }, 403);
    const escId = String(quem.escritorio_id), por = String(quem.usuario.nome || quem.usuario.usuario || '');
    const creds: Record<string, any> = (await post('/rest/v1/rpc/painel_trib_info', { p_escritorio: escId })) || {};
    const st = await estado(escId);
    const lista = () => Object.entries(TRIBUNAIS).map(([id, t]) => ({ id, nome: t.nome, dica: t.dica, sistemas: Object.keys(t.bases),
      ligado: !!(creds[id] && creds[id].usuario), usuario: creds[id] && creds[id].usuario ? String(creds[id].usuario).replace(/^(.{2}).*(.{2})$/, '$1•••$2') : '',
      guardado_em: creds[id] && creds[id].em || '', guardado_por: creds[id] && creds[id].por || '', teste: st[id] || null }));
    // 8.57: certificado digital A1 (pedido da usuária, "igual ao Astrea"): termo aceito → arquivo .pfx/.p12 + senha conferidos aqui (abre com a
    // senha? de quem é? vale até quando?) e guardados no COFRE (segredo trib_cert_<escritório>). Nunca volta ao navegador.
    const certInfo = () => { const c = creds.cert; return c && c.titular ? { nome: c.nome, titular: c.titular, validade: c.validade, uf: c.uf, oab: c.oab, em: c.em, por: c.por, aceito_em: c.aceito_em } : null; };
    if (b.acao === 'status') return resp({ ok: true, tribunais: lista(), certificado: certInfo() });
    if (b.acao === 'certificado') {
      if (!b.aceito) return resp({ ok: false, erro: 'É preciso ler e aceitar o termo antes.' }, 400);
      const nome = String(b.nome || '').trim().slice(0, 80), senha = String(b.senha || ''), uf = String(b.uf || '').toUpperCase().slice(0, 2), oab = String(b.oab || '').replace(/\D/g, '').slice(0, 8);
      const arq = String(b.arquivo || '').replace(/^data:[^,]*,/, '');
      if (!arq || !nome || !senha || !/^[A-Z]{2}$/.test(uf) || !oab) return resp({ ok: false, erro: 'Preencha o arquivo, o nome, a senha, a UF e o número da OAB.' }, 400);
      if (arq.length > 200000) return resp({ ok: false, erro: 'Arquivo grande demais para um certificado A1.' }, 400);
      let titular = '', validade = '', emissor = '';
      try {
        const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(arq)), false, senha);
        const bags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((x: any) => x.cert).filter(Boolean);
        const keys = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []);
        if (!bags.length || !keys.length) throw new Error('sem chave');
        const c = bags.find((x: any) => !(x.extensions || []).some((e: any) => e.name === 'basicConstraints' && e.cA)) || bags[0];
        const cn = (c.subject.getField('CN') || {}).value || ''; titular = String(cn).split(':')[0];
        validade = c.validity.notAfter.toISOString().slice(0, 10); emissor = String((c.issuer.getField('CN') || {}).value || '').slice(0, 80);
      } catch (e) {
        const m = String((e as Error).message || e);
        return resp({ ok: false, erro: /password|mac|Invalid password|decrypt/i.test(m) ? 'A senha do certificado não confere. Nada foi guardado.' : 'Este arquivo não é um certificado A1 (.pfx ou .p12) válido. Nada foi guardado.' }, 400);
      }
      if (validade && validade < new Date().toISOString().slice(0, 10)) return resp({ ok: false, erro: 'Este certificado venceu em ' + validade.split('-').reverse().join('/') + '. Nada foi guardado.' }, 400);
      const agora = new Date().toISOString();
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: 'cert', p_valor: JSON.stringify({ nome, uf, oab, titular, validade, emissor, pfx: arq, senha, em: agora, por, aceito_em: agora, aceito_por: por }) });
      creds.cert = { nome, uf, oab, titular, validade, em: agora, por, aceito_em: agora };
      return resp({ ok: true, certificado: certInfo() });
    }
    if (b.acao === 'cert_apagar') {
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: 'cert', p_valor: '' }); delete creds.cert;
      return resp({ ok: true, certificado: null });
    }
    // ---------- 8.59 PJe: login + senha + 2FA Seed (um acesso por tribunal e grau) ----------
    const chavePje = (t: string, g: string) => 'pje' + t + g;          // ex.: pjetrt121g (o cofre aceita só letras/números, até 12)
    const acessosPje = () => Object.entries(creds).filter(([k, v]) => /^pje/.test(k) && v && v.login).map(([k, v]: [string, any]) => ({
      chave: k, tribunal: v.trib, grau: v.grau, tribunal_nome: (PJE[v.trib] || { nome: v.trib }).nome, consulta: GRAU_NOME[v.grau] || v.grau, nome: v.nome || '',
      login: String(v.login).replace(/^(.{3}).*(.{2})$/, '$1•••••$2'), com_seed: !!v.seed, guardado_em: v.em || '', guardado_por: v.por || '', teste: st[k] || null }));
    const opcoesPje = () => Object.entries(PJE).map(([id, t]) => ({ id, nome: t.nome, graus: Object.keys(t.graus).map(g => ({ id: g, nome: GRAU_NOME[g] })) }));
    // 8.60 eproc pelo login novo (SSO + 2FA)
    const acessosSso = () => Object.entries(SSO_EPROC).map(([k, t]) => ({ chave: k, nome: t.nome, ligado: !!(creds[k] && creds[k].login),
      login: creds[k] && creds[k].login ? String(creds[k].login).replace(/^(.{3}).*(.{2})$/, '$1•••$2') : '', com_seed: !!(creds[k] && creds[k].seed),
      guardado_em: (creds[k] && creds[k].em) || '', guardado_por: (creds[k] && creds[k].por) || '', teste: st[k] || null }));
    if (b.acao === 'sso_status') return resp({ ok: true, sso: acessosSso() });
    if (b.acao === 'sso_apagar') {
      const k = String(b.chave || ''); if (!SSO_EPROC[k]) return resp({ ok: false, erro: 'Acesso inválido.' }, 400);
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: k, p_valor: '' }); delete creds[k]; delete st[k]; await gravarEstado(escId, st);
      return resp({ ok: true, sso: acessosSso() });
    }
    if (b.acao === 'sso_guardar' || b.acao === 'sso_testar') {
      const k = String(b.chave || ''); if (!SSO_EPROC[k]) return resp({ ok: false, erro: 'Escolha o tribunal.' }, 400);
      let cred: any = creds[k];
      if (b.acao === 'sso_guardar') {
        const login = String(b.login || '').trim().slice(0, 40), senha = String(b.senha || '').slice(0, 200), seed = String(b.seed || '').trim().slice(0, 400);
        if (!login || !senha) return resp({ ok: false, erro: 'Preencha o usuário e a senha do eproc.' }, 400);
        if (seed && !lerSeed(seed)) return resp({ ok: false, erro: 'A 2FA Seed não parece uma chave do autenticador: são letras de A a Z e números de 2 a 7.' }, 400);
        cred = { login, senha, seed };
      }
      if (!cred || !cred.login) return resp({ ok: false, erro: 'Este acesso não está guardado.' }, 400);
      const c: any = await lerPainelEproc(SSO_EPROC[k], cred);
      st[k] = { em: new Date().toISOString(), por, ok: !!c.ok, etapa: c.etapa || '', ms: c.ms || 0, contagens: c.contagens || {},
        mensagem: c.ok ? (c.prazos.length + ' prazo(s) em aberto, ' + c.pendentes.length + ' aguardando abertura, ' + c.audiencias.length + ' audiência(s)') : c.mensagem };
      await gravarEstado(escId, st);
      if (!c.ok) return resp({ ok: false, erro: c.mensagem + (b.acao === 'sso_guardar' ? ' Nada foi guardado.' : ''), etapa: c.etapa, sso: acessosSso() });
      if (b.acao === 'sso_guardar') {
        await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: k, p_valor: JSON.stringify({ ...cred, em: new Date().toISOString(), por }) });
        creds[k] = { ...cred, em: new Date().toISOString(), por };
      }
      return resp({ ok: true, mensagem: 'Entrou no eproc (' + SSO_EPROC[k].nome + '): ' + st[k].mensagem + '.', contagens: c.contagens, avisos: c.avisos, sso: acessosSso() });
    }
    if (b.acao === 'pje_status') return resp({ ok: true, acessos: acessosPje(), tribunais: opcoesPje() });
    if (b.acao === 'pje_apagar') {
      const k = String(b.chave || ''); if (!/^pje[a-z0-9]{2,9}$/.test(k)) return resp({ ok: false, erro: 'Acesso inválido.' }, 400);
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: k, p_valor: '' }); delete creds[k]; delete st[k]; await gravarEstado(escId, st);
      return resp({ ok: true, acessos: acessosPje() });
    }
    if (b.acao === 'pje_guardar' || b.acao === 'pje_testar') {
      let cred: any;
      if (b.acao === 'pje_guardar') {
        const t = String(b.tribunal || ''), g = String(b.grau || '');
        if (!PJE[t] || !PJE[t].graus[g]) return resp({ ok: false, erro: 'Escolha o tribunal e a consulta.' }, 400);
        const login = String(b.login || '').trim().slice(0, 40), senha = String(b.senha || '').slice(0, 200), seed = String(b.seed || '').trim().slice(0, 400);
        if (!login || !senha) return resp({ ok: false, erro: 'Preencha o login (CPF) e a senha do PJe.' }, 400);
        if (seed && !lerSeed(seed)) return resp({ ok: false, erro: 'A 2FA Seed não parece uma chave do autenticador: são letras de A a Z e números de 2 a 7 (às vezes em grupos com espaço).' }, 400);
        cred = { trib: t, grau: g, nome: String(b.nome || '').trim().slice(0, 80), login, senha, seed };
      } else { cred = creds[String(b.chave || '')]; if (!cred || !cred.login) return resp({ ok: false, erro: 'Este acesso não está guardado.' }, 400); }
      const t0 = Date.now();
      // 8.61: o teste já lê o painel do advogado (o mesmo que o robô); lista bloqueada pelo tribunal = o login vale e é guardado
      const c: any = await lerPainelPje(cred); delete c.nav;
      const entrou = !!c.ok || c.etapa === 'bloqueio' || c.etapa === 'lista' || c.etapa === 'token';
      const r: any = entrou ? { ok: true } : { ok: false, etapa: c.etapa, mensagem: c.mensagem };
      if (c.period) cred.period = c.period;
      const k = chavePje(cred.trib, cred.grau);
      st[k] = { em: new Date().toISOString(), por, ok: !!c.ok, etapa: c.etapa || '', contagens: c.contagens || {}, ms: Date.now() - t0,
        mensagem: c.ok ? (c.processos + ' processo(s), ' + c.prazos.length + ' expediente(s) com prazo em aberto, ' + c.audiencias.length + ' audiência(s) marcada(s)') : entrou ? 'entrou no PJe, mas ' + c.mensagem : c.mensagem };
      await gravarEstado(escId, st);
      if (!r.ok) return resp({ ok: false, erro: r.mensagem + (b.acao === 'pje_guardar' ? ' Nada foi guardado.' : ''), etapa: r.etapa, acessos: acessosPje() });
      if (b.acao === 'pje_guardar') {
        await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: k, p_valor: JSON.stringify({ ...cred, em: new Date().toISOString(), por }) });
        creds[k] = { ...cred, em: new Date().toISOString(), por };
      }
      return resp({ ok: true, mensagem: 'Entrou no PJe (' + PJE[cred.trib].nome + ', ' + (GRAU_NOME[cred.grau] || cred.grau) + '): ' + st[k].mensagem + '.', acessos: acessosPje() });
    }
    const trib = String(b.tribunal || '');
    if (!TRIBUNAIS[trib]) return resp({ ok: false, erro: 'Escolha o tribunal.' }, 400);
    if (b.acao === 'apagar') {
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: trib, p_valor: '' });
      delete creds[trib]; delete st[trib]; await gravarEstado(escId, st);
      return resp({ ok: true, tribunais: lista() });
    }
    if (b.acao === 'guardar' || b.acao === 'testar') {
      let cred = creds[trib];
      if (b.acao === 'guardar') {
        const usuario = String(b.usuario || '').trim().slice(0, 80), senha = String(b.senha || '').slice(0, 200);
        if (!usuario || !senha) return resp({ ok: false, erro: 'Preencha o usuário e a senha do eproc.' }, 400);
        cred = { usuario, senha };
      }
      if (!cred || !cred.usuario) return resp({ ok: false, erro: 'Este tribunal ainda não tem login guardado.' }, 400);
      const partes = await lerTribunal(trib, cred);
      const algumOk = partes.some(p => p.ok), senhaErrada = partes.some(p => /autentica|senha|usu[aá]rio/i.test(p.mensagem || '') && !p.ok);
      // Só guarda no cofre se o tribunal aceitou o login (senha errada nunca fica guardada).
      if (b.acao === 'guardar') {
        if (!algumOk) return resp({ ok: false, erro: senhaErrada ? 'O eproc recusou o usuário ou a senha. Nada foi guardado.' : 'Não consegui falar com o eproc agora. Nada foi guardado.', partes: partes.map(p => ({ nome: p.nome, ok: p.ok, mensagem: p.mensagem })) });
        await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: trib, p_valor: JSON.stringify({ usuario: cred.usuario, senha: cred.senha, em: new Date().toISOString(), por }) });
        creds[trib] = { usuario: cred.usuario, em: new Date().toISOString(), por };
      }
      const avisos = partes.flatMap(p => (p.avisos || []).map((a: any) => ({ ...a, sistema: p.nome })));
      st[trib] = { em: new Date().toISOString(), por, ok: algumOk, n: avisos.length, partes: partes.map(p => ({ nome: p.nome, ok: p.ok, n: (p.avisos || []).length, mensagem: p.ok ? '' : p.mensagem })) };
      await gravarEstado(escId, st);
      return resp({ ok: algumOk, erro: algumOk ? '' : (senhaErrada ? 'O eproc recusou o usuário ou a senha.' : 'O eproc não respondeu agora.'), avisos: avisos.slice(0, 300), partes: st[trib].partes, tribunais: lista() });
    }
    return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return resp({ ok: false, erro: /sessão/i.test(m) ? 'Sessão expirada: entre de novo no painel.' : m.slice(0, 200) }, /sessão/i.test(m) ? 401 : 400);
  }
});
