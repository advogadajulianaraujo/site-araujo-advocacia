// 8.32: a função "painel" rodando no DENO (o mesmo programa do Supabase), com o banco de teste atrás de um servidor local.
import { createRequire } from 'node:module'; import http from 'node:http'; import { spawn } from 'node:child_process'; import path from 'node:path';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, assert, logar, rodarServidor } = T;
const P = C.PropertiesService.getScriptProperties();
const tok = logar('U1', '0');
rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); rodarServidor('banco.conferir', tok, { principal: true });
rodarServidor('banco.conferir', tok, { grava: 'supabase' }); rodarServidor('banco.conferir', tok, { login: 'supabase' });
C.sbEstado_('edge', 'sim'); P.setProperty('BANCO_EDGE', 'sim');
const ses = rodarServidor('banco.sessao', logar('U1', '0'), {}).dados;
// "Supabase" local: só a API REST (rpc) com a chave secreta
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  if (req.headers.apikey !== 'sb_secret_teste_local') { res.writeHead(401); return res.end('{}'); }
  const x = S.postgrest('https://x.supabase.test' + req.url, { method: req.method, payload: b }, null); res.writeHead(x.status, { 'Content-Type': 'application/json' }); res.end(x.txt || '');
}); }).listen(8787);
const deno = process.env.DENO || 'deno';
const proc = spawn(deno, ['run', '--allow-net', '--allow-env', 'supabase/functions/painel/index.ts'], { env: Object.assign({}, process.env, { SUPABASE_URL: 'http://127.0.0.1:8787', PAINEL_CHAVE: 'sb_secret_teste_local', TZ: 'UTC', DENO_NO_UPDATE_CHECK: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; proc.stdout.on('data', d => log += d); proc.stderr.on('data', d => log += d);
const chamar = async b => (await fetch('http://127.0.0.1:8000', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x' }, body: JSON.stringify(b) })).json();
for (let i = 0; i < 60 && !/Listening|http:\/\//.test(log); i++) await new Promise(r => setTimeout(r, 500));
try {
  const p = await chamar({ ping: true }); assert(p.ok && p.versao === C.VERSAO, 'Deno: a função responde (versão ' + p.versao + ')');
  let t0 = Date.now(); const l = await chamar({ token: ses.token, acao: 'clientes.listar', dados: {}, versao: C.VERSAO });
  const g = rodarServidor('clientes.listar', logar('U1', '0'), {});
  assert(l.ok && JSON.stringify(l.dados) === JSON.stringify(g.dados), `Deno (relógio em Greenwich): lista de clientes igual ao Apps Script (${Date.now() - t0} ms)`);
  const pr = await chamar({ token: ses.token, acao: 'prazos.listar', dados: {}, versao: C.VERSAO }); const gp = rodarServidor('prazos.listar', logar('U1', '0'), {});
  assert(pr.ok && JSON.stringify(pr.dados) === JSON.stringify(gp.dados), 'Deno: intimações e prazos iguais ao Apps Script');
  t0 = Date.now(); const w = await chamar({ token: ses.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'Gravada pelo Deno', responsavel: 'admin' } }, pedido: 'deno-1', versao: C.VERSAO });
  assert(w.ok && w.gravou && S.sql("select count(*) from tarefas where titulo='Gravada pelo Deno'") === '1', `Deno: gravação no banco (${Date.now() - t0} ms)`);
  const ag = await chamar({ token: ses.token, acao: 'agenda.listar', dados: { inicio: T.dia(0), fim: T.dia(7) }, versao: C.VERSAO });
  assert(ag.voltar, 'Deno: agenda volta para o Google');
} catch (e) { console.log('✗ FALHOU', e.message, '\n', log.slice(-800)); process.exitCode = 1; }
proc.kill(); srv.close();
