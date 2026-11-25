// Diagnóstico isolado TRT12: autenticação e UMA consulta de contadores; sem importação ou ciência.
const URL_BANCO=Deno.env.get('SUPABASE_URL')||'';
const CHAVE=Deno.env.get('PAINEL_CHAVE')||Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const CORS={'Access-Control-Allow-Origin':'https://araujoadvocaciasc.com.br','Access-Control-Allow-Headers':'content-type,apikey,x-region','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:CORS});
const atr=(tag:string,nome:string)=>(new RegExp('\\b'+nome+'="([^"]*)"').exec(tag)||[])[1]||'';
let fase='login';
const calls=new Map<string,number>();
async function rpc(name:string,data:any){const h:any={apikey:CHAVE,'Content-Type':'application/json'};if(CHAVE.startsWith('eyJ'))h.Authorization='Bearer '+CHAVE;const r=await fetch(URL_BANCO+'/rest/v1/rpc/'+name,{method:'POST',headers:h,body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('SESSAO_OU_COFRE_INDISPONIVEL');return r.json();}
export const PJE: Record<string, { nome: string; graus: Record<string, string> }> = {
  trt12: { nome: 'TRT 12 — Santa Catarina', graus: { '1g': 'https://pje.trt12.jus.br/primeirograu/', '2g': 'https://pje.trt12.jus.br/segundograu/' } },
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
  constructor(public trace: any[] = []) {}
  jar: Record<string, Record<string, string>> = {};
  cookie(u: string) { const h = new URL(u).host; return Object.entries(this.jar[h] || {}).map(([k, v]) => k + '=' + v).join('; '); }
  guardar(u: string, r: Response) { const h = new URL(u).host; const sc = (r.headers as any).getSetCookie ? (r.headers as any).getSetCookie() : [];
    sc.forEach((c: string) => { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) { (this.jar[h] = this.jar[h] || {})[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }); }
  async ir(u: string, init: RequestInit = {}, max = 10) {
    let url = u, opts: RequestInit = init;
    for (let i = 0; i <= max; i++) {
      const dest = new URL(url);
      if (dest.protocol === 'http:' && dest.hostname === 'pje.trt12.jus.br' && dest.pathname === '/pjekz/') { this.trace.push({ etapa: fase, ajuste: 'redirecionamento_para_http_normalizado_para_https', host: dest.hostname, caminho: dest.pathname }); dest.protocol = 'https:'; url = dest.href; }
      if (dest.protocol !== 'https:' || !/(^|\.)jus\.br$/.test(dest.hostname)) throw new Error('DESTINO_FORA_TRIBUNAL: '+dest.protocol+'//'+dest.hostname+dest.pathname);
      const r = await fetch(url, { ...opts, redirect: 'manual', headers: { 'User-Agent': UA_PJE, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9', ...(opts.headers || {}), cookie: this.cookie(url) }, signal: AbortSignal.timeout(25000) });
      this.trace.push({ etapa: fase, instante: new Date().toISOString(), host: new URL(url).hostname, caminho: new URL(url).pathname.replace(/\/paineladvogado\/\d+/g, '/paineladvogado/{advogado}'), http: r.status, resposta: Object.fromEntries(['date','server','content-type','x-cache','x-amz-cf-id','x-amz-cf-pop','x-amzn-requestid'].map(k=>[k,r.headers.get(k)]).filter(x=>x[1])) });
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
export async function entrarPje(base: string, cred: { login: string; senha: string; seed: string; period?: number }, trace: any[] = []) {
  const seed = lerSeed(cred.seed || ''); const nav = new Nav(trace);
  if (cred.seed && !seed) return { ok: false, etapa: 'seed', mensagem: 'A 2FA Seed não parece uma chave do autenticador (letras A–Z e números 2–7).' };
  if (seed && cred.period) seed.period = cred.period;
  let p = await nav.ir(base + 'authenticateSSO.seam');
  if (p.status === 403) return { ok: false, etapa: 'bloqueio', mensagem: 'O PJe recusou o servidor (403). Tente de novo mais tarde.' };
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


Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(req.method!=='POST')return reply({ok:false,etapa:'metodo'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://araujoadvocaciasc.com.br')return reply({ok:false,etapa:'origem'},403);
 if(Date.now()>Date.parse('2026-11-27T03:00:00Z'))return reply({ok:false,etapa:'expirado'},410);
 let b:any;try{const t=await req.text();if(t.length>3000)return reply({ok:false},413);b=JSON.parse(t);}catch{return reply({ok:false,etapa:'corpo'},400);}
 if(!b.token||typeof b.token!=='string'||Object.keys(b).some(k=>!['token','acao'].includes(k)))return reply({ok:false,etapa:'sessao'},401);
 let who:any;try{who=await rpc('painel_quem',{p_token:b.token});}catch{return reply({ok:false,etapa:'sessao'},401);}
 if(who?.usuario?.perfil!=='administrador')return reply({ok:false,etapa:'sessao'},403);
 const regiao=Deno.env.get('DENO_REGION')||'desconhecida';
 if(b.acao==='validar')return reply({ok:true,etapa:'sessao_validada',regiao});
 if(b.acao!=='diagnosticar')return reply({ok:false,etapa:'acao'},400);
 if(regiao!=='sa-east-1')return reply({ok:false,etapa:'regiao',regiao},409);
 const now=Date.now();for(const[k,v]of calls)if(now-v>60000)calls.delete(k);
 if(calls.has(b.token))return reply({ok:false,etapa:'limite'},429);calls.set(b.token,now);
 let cred:any,nav:any;const trace:any[]=[];const result:any={regiao,inicio:new Date().toISOString(),ok:false};
 try{
  const all=await rpc('painel_trib_info',{p_escritorio:who.escritorio_id});cred=all.pjetrt121g;
  if(!cred?.login||!cred?.senha)return reply({...result,etapa:'acesso_nao_guardado'});
  fase='login';const r:any=await entrarPje(PJE.trt12.graus['1g'],cred,trace);
  if(!r.ok)return reply({...result,etapa:'login_'+r.etapa,mensagem:r.mensagem});
  nav=r.nav;result.autenticacao_aceita=true;
  const jar=nav.jar['pje.trt12.jus.br']||{};let id='';
  try{const t=decodeURIComponent(jar.access_token||'');id=String(JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).id||'');}catch{}
  if(!/^\d+$/.test(id))return reply({...result,etapa:'identificacao_advogado',requisicoes:nav.trace});
  fase='contadores';
  const x=await nav.ir('https://pje.trt12.jus.br/pje-comum-api/api/paineladvogado/'+id+'/totalizadores',{headers:{Accept:'application/json, text/plain, */*',Referer:'https://pje.trt12.jus.br/pjekz/','X-XSRF-TOKEN':decodeURIComponent(jar['Xsrf-Token']||'')}});
  result.http=x.status;result.etapa=x.status===403?'bloqueio_contadores':x.status===200?'contadores_acessiveis':'resposta_contadores';
  result.cloudfront=/Request blocked|cloudfront/i.test(x.html);result.requisicoes=nav.trace;result.primeiro403=nav.trace.find((x:any)=>x.http===403)||null;
  result.ok=x.status===200;
  if(x.status===403 && jar.access_token){
    fase='contadores_autorizacao_explicita';
    const y=await nav.ir('https://pje.trt12.jus.br/pje-comum-api/api/paineladvogado/'+id+'/totalizadores',{headers:{Accept:'application/json, text/plain, */*',Referer:'https://pje.trt12.jus.br/pjekz/',Origin:'https://pje.trt12.jus.br',Authorization:'Bearer '+decodeURIComponent(jar.access_token),'X-XSRF-TOKEN':decodeURIComponent(jar['Xsrf-Token']||'')}});
    result.comparacao_autorizacao_explicita={http:y.status,cloudfront:/Request blocked|cloudfront/i.test(y.html)};
  }
  return reply(result);
 }catch(e){return reply({...result,etapa:fase,erro:(e as Error).name==='TimeoutError'?'TEMPO_LIMITE':'FALHA_TECNICA',detalhe:String((e as Error).message||'').startsWith('DESTINO_FORA_TRIBUNAL:')?String((e as Error).message).split('?')[0].slice(0,200):(e as Error).name,requisicoes:trace});}
 finally{if(cred){cred.senha='';cred.seed='';}if(nav)nav.jar={};b.token='';}
});
