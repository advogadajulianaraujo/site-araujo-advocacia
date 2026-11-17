// Publica a Edge Function "painel" no Supabase pela API de administração (sem precisar do supabase CLI).
// Uso: SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJETO=<ref do projeto> node .github/motor/publicar-edge.mjs
// O token precisa de permissão para Edge Functions. Na nuvem do GitHub ele vem do segredo do repositório (workflow publicar-edge.yml).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJETO;
if (!token || !ref) { console.error('Faltam SUPABASE_ACCESS_TOKEN e SUPABASE_PROJETO.'); process.exit(1); }
// 8.39: FUNCAO=whatsapp publica a ponte do WhatsApp (padrão: painel)
const FUNCAO = process.env.FUNCAO || 'painel';
const pasta = path.join(raiz, 'supabase/functions/' + FUNCAO);
const fd = new FormData();
fd.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: FUNCAO, verify_jwt: false }));
import { existsSync } from 'node:fs';
for (const f of ['index.ts', 'servidor.js', 'motor.js', 'motor-anterior.js'].filter(f => existsSync(path.join(pasta, f)))) fd.append('file', new Blob([readFileSync(path.join(pasta, f))], { type: f.endsWith('.ts') ? 'application/typescript' : 'application/javascript' }), f);
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${FUNCAO}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
const txt = await r.text();
console.log(r.status, txt.slice(0, 400));
if (!r.ok) process.exit(1);
