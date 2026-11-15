// Edge Function "painel" (Supabase) — 8.32 Etapa C. Publicar: supabase functions deploy painel --no-verify-jwt
// (ou pelo .github/motor/publicar-edge.mjs). A chave secreta fica só aqui dentro (variável do próprio Supabase).
import { criarServidor } from './servidor.js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

const URL_BANCO = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE = Deno.env.get('PAINEL_CHAVE') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function rpc(nome: string, args: unknown) {
  const h: Record<string, string> = { apikey: CHAVE, 'Content-Type': 'application/json' };
  if (CHAVE.startsWith('eyJ')) h.Authorization = 'Bearer ' + CHAVE;
  const r = await fetch(`${URL_BANCO}/rest/v1/rpc/${nome}`, { method: 'POST', headers: h, body: JSON.stringify(args) });
  const t = await r.text();
  let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* não é JSON */ }
  if (!r.ok) { const e: any = new Error((j && (j.message || j.hint)) || ('erro ' + r.status)); e.codigo = j && j.code; throw e; }
  return j;
}

const S = criarServidor({ rpc, base: { url: URL_BANCO, createHash, createHmac, randomUUID, b64: (u: Uint8Array, w: boolean) => Buffer.from(u).toString(w ? 'base64url' : 'base64') } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let b: any = {};
  try { b = await req.json(); } catch { /* corpo vazio */ }
  let r: unknown;
  try { r = await S.atender(b); } catch (e) { r = { voltar: true, motivo: 'erro interno: ' + String((e as Error)?.message ?? e).slice(0, 200) }; }
  return new Response(JSON.stringify(r), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
