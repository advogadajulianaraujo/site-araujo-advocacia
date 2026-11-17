// 8.39: ponte do WhatsApp (Meta → painel) DENTRO do Supabase — substitui a Cloudflare (chatbot/worker.js fica só de reserva).
// 1) responde a verificação do Meta (GET com hub.challenge); 2) confere a assinatura X-Hub-Signature-256 com o App Secret;
// 3) responde 200 na hora e entrega a mensagem ao painel (Apps Script, rota whats.webhook) em segundo plano.
// Os segredos vêm do cofre do Supabase (painel_whats_info, só a chave secreta do próprio Supabase lê). Nada fica guardado aqui.
// Publicar: igual à função "painel" (publicar-edge.mjs com FUNCAO=whatsapp), verify_jwt = false (o Meta não manda login).
const URL_BANCO = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE = Deno.env.get('PAINEL_CHAVE') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
let info: Record<string, string> | null = null, infoEm = 0;
async function segredos(): Promise<Record<string, string>> {
  if (info && Date.now() - infoEm < 60000) return info;
  const h: Record<string, string> = { apikey: CHAVE, 'Content-Type': 'application/json' };
  if (CHAVE.startsWith('eyJ')) h.Authorization = 'Bearer ' + CHAVE;
  const r = await fetch(`${URL_BANCO}/rest/v1/rpc/painel_whats_info`, { method: 'POST', headers: h, body: '{}' });
  info = r.ok ? ((await r.json()) || {}) : {};
  infoEm = Date.now();
  return info!;
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const s = await segredos().catch(() => ({} as Record<string, string>));
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && s.verify && iguais(url.searchParams.get('hub.verify_token') || '', s.verify)) {
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return new Response(s.ponte ? 'Ponte do WhatsApp do painel: no ar.' : 'Ponte do WhatsApp: ainda não ligada no painel.', { status: 200 });
  }
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
  const corpo = await req.text();
  if (corpo.length > 900000) return new Response('grande demais', { status: 413 });
  if (!s.secret || !s.ponte || !s.url) return new Response('ponte não configurada', { status: 503 });
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(s.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)));
  const esperado = 'sha256=' + [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!iguais(esperado, req.headers.get('x-hub-signature-256') || '')) { info = null; return new Response('assinatura inválida', { status: 401 }); }
  let json: any;
  try { json = JSON.parse(corpo); } catch { return new Response('ok', { status: 200 }); }
  // só o que interessa: mensagens, ecos do celular (coexistência) e falhas de entrega
  const util = (json.entry || []).some((en: any) => (en.changes || []).some((ch: any) => {
    const v = ch.value || {};
    return (v.messages && v.messages.length) || (v.message_echoes && v.message_echoes.length) || (v.statuses || []).some((x: any) => x.status === 'failed');
  }));
  if (util) {
    const envio = fetch(s.url, { method: 'POST', redirect: 'follow', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao: 'whats.webhook', dados: { chave: s.ponte, corpo: json } }) }).catch(() => {});
    // @ts-ignore EdgeRuntime existe no Supabase: termina de entregar depois de responder ao Meta
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(envio); else await envio;
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
});
