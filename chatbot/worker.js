/*
 * Ponte do WhatsApp → painel (Cloudflare Workers, plano gratuito).
 * Por que existe: o Meta exige resposta rápida e assinada; o programa do Google (Apps Script) não lê cabeçalhos nem responde rápido.
 * A ponte: 1) responde a verificação do Meta (GET com hub.challenge); 2) confere a assinatura X-Hub-Signature-256 com o APP_SECRET;
 * 3) responde 200 na hora e entrega a mensagem ao painel em segundo plano, com a chave secreta da ponte.
 * Variáveis (Cloudflare › Workers › Settings › Variables, todas como "Secret"): VERIFY_TOKEN, APP_SECRET, PAINEL_URL, PAINEL_CHAVE.
 * Nenhum dado fica guardado aqui.
 */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && env.VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN) {
        return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
      }
      return new Response('Ponte do WhatsApp do painel: no ar.', { status: 200 });
    }
    if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
    const corpo = await req.text();
    if (corpo.length > 900000) return new Response('grande demais', { status: 413 });
    const assinatura = req.headers.get('x-hub-signature-256') || '';
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)));
    const esperado = 'sha256=' + [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
    if (!env.APP_SECRET || !iguais(esperado, assinatura)) return new Response('assinatura inválida', { status: 401 });
    let json;
    try { json = JSON.parse(corpo); } catch (e) { return new Response('ok', { status: 200 }); }
    // só manda ao painel o que interessa: mensagens, ecos do celular e falhas de entrega (os "lido/entregue" ficam de fora)
    const util = (json.entry || []).some(en => (en.changes || []).some(ch => {
      const v = ch.value || {};
      return (v.messages && v.messages.length) || (v.message_echoes && v.message_echoes.length) || (v.statuses || []).some(s => s.status === 'failed');
    }));
    if (util) {
      ctx.waitUntil(fetch(env.PAINEL_URL, {
        method: 'POST', redirect: 'follow', headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao: 'whats.webhook', dados: { chave: env.PAINEL_CHAVE, corpo: json } })
      }).catch(() => {}));
    }
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
};
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
