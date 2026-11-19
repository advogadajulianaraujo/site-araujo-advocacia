// Edge Function "chat" (Supabase) — 8.53. Arquivos do chat da equipe (áudio, foto, documento) no cesto PRIVADO "chat" do Storage.
// Publicar: FUNCAO=chat node .github/motor/publicar-edge.mjs (verify_jwt = false: a pessoa é conferida pelo código da sessão do banco).
// Nada é público: o navegador recebe um link de ENVIO de uso único (para um nome novo que o banco escolhe) ou links de BAIXA de 1 hora,
// só para arquivos de mensagens que a pessoa pode ver (painel_chat_arquivo_ confere sessão, conversa e se a mensagem foi apagada).
const URL_BANCO = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE = Deno.env.get('PAINEL_CHAVE') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const cab = (): Record<string, string> => { const h: Record<string, string> = { apikey: CHAVE, 'Content-Type': 'application/json' }; if (CHAVE.startsWith('eyJ')) h.Authorization = 'Bearer ' + CHAVE; return h; }; // chave nova sb_secret_ vai só no apikey

async function post(caminho: string, corpo: unknown) {
  const r = await fetch(URL_BANCO + caminho, { method: 'POST', headers: cab(), body: JSON.stringify(corpo) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* não é JSON */ }
  if (!r.ok) { const e: any = new Error((j && (j.message || j.msg || j.error || j.hint)) || ('erro ' + r.status)); e.status = r.status; throw e; }
  return j;
}
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let b: any = {};
  try { b = await req.json(); } catch { /* corpo vazio */ }
  try {
    if (b.acao === 'ping') return resp({ ok: true });
    if (b.acao === 'enviar') {
      const r = await post('/rest/v1/rpc/painel_chat_arquivo_', { p_token: String(b.token || ''), p_acao: 'enviar', p_sala: String(b.sala || ''), p_paths: null });
      const s = await post('/storage/v1/object/upload/sign/chat/' + r.path, {});
      return resp({ ok: true, path: r.path, url: URL_BANCO + '/storage/v1' + s.url });
    }
    if (b.acao === 'baixar') {
      const pedidos = (Array.isArray(b.paths) ? b.paths : []).map(String).slice(0, 200);
      const r = await post('/rest/v1/rpc/painel_chat_arquivo_', { p_token: String(b.token || ''), p_acao: 'baixar', p_sala: null, p_paths: pedidos });
      const ok: string[] = r.paths || [];
      if (!ok.length) return resp({ ok: true, links: {} });
      const s = await post('/storage/v1/object/sign/chat', { expiresIn: 3600, paths: ok });
      const links: Record<string, string> = {};
      (s || []).forEach((x: any) => { if (x && x.signedURL && x.path) links[x.path] = URL_BANCO + '/storage/v1' + x.signedURL; });
      return resp({ ok: true, links });
    }
    return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return resp({ ok: false, erro: /sessão/i.test(m) ? 'Sessão expirada: entre de novo no painel.' : m.slice(0, 200) }, /sessão/i.test(m) ? 401 : 400);
  }
});
