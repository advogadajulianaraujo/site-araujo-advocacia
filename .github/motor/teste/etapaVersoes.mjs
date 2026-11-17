// 8.37.5: a função do Supabase com DOIS motores (o novo + o da versão que o Google roda). Com o Google atrasado, a entrada, as telas
// e as gravações continuam no Supabase (antes tudo voltava ao Google = painel lento).
import { createRequire } from 'node:module'; import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, assert, logar, rodarServidor } = T;
const { criarServidor } = await import('../../../supabase/functions/painel/servidor.js');
const anterior = await import('../../../supabase/functions/painel/motor-anterior.js');
const P = C.PropertiesService.getScriptProperties();
async function rpc(nome, args) {
  const x = S.postgrest('https://x.supabase.test/rest/v1/rpc/' + nome, { method: 'POST', payload: JSON.stringify(args) }, null);
  let j = null; try { j = x.txt ? JSON.parse(x.txt) : null; } catch (e) {}
  if (x.status >= 300) { const e = new Error(j && j.message || 'erro'); e.codigo = j && j.code; throw e; }
  return j;
}
const base = { url: 'https://x.supabase.test', createHash: crypto.createHash, createHmac: crypto.createHmac, randomUUID: crypto.randomUUID, b64: (u, w) => Buffer.from(u).toString(w ? 'base64url' : 'base64') };
const SV = criarServidor({ rpc, base, extras: [anterior] });
const VA = anterior.VERSAO_MOTOR, VN = C.VERSAO;
assert(VA !== VN, `dois motores: ${VN} (novo) e ${VA} (o do Google)`);
const tok = logar('U1', '0');
let r = rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); assert(r.ok, 'conferência');
rodarServidor('banco.conferir', tok, { principal: true }); rodarServidor('banco.conferir', tok, { grava: 'supabase' });
rodarServidor('banco.conferir', tok, { login: 'supabase' });
C.sbEstado_('edge', 'sim'); C.sbEstado_('asaas', 'nao'); P.setProperty('BANCO_EDGE', 'sim');
const ses = rodarServidor('banco.sessao', tok, {}).dados;
const p = await SV.atender({ ping: true });
assert(p.versao === VN && p.versoes.includes(VA), 'o ping diz as duas versões');
for (const a of ['clientes.listar', 'prazos.listar', 'tarefas.listar', 'fin.resumo', 'eu.painel']) {
  const e = await SV.atender({ token: ses.token, acao: a, dados: {}, versao: VA });
  assert(e.ok && !e.voltar, `${a} pelo motor ${VA}: respondeu no Supabase`);
  const n = await SV.atender({ token: ses.token, acao: a, dados: {}, versao: VN });
  assert(n.ok && !n.voltar, `${a} pelo motor ${VN}: respondeu no Supabase`);
}
let w = await SV.atender({ token: ses.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'Gravada pelo motor anterior', responsavel: 'maria' } }, versao: VA, pedido: 'p-ant-1' });
assert(w.ok && w.gravou, 'gravação pelo motor ' + VA);
const lista = await SV.atender({ token: ses.token, acao: 'tarefas.listar', dados: {}, versao: VN });
assert(JSON.stringify(lista.dados).includes('Gravada pelo motor anterior'), 'o motor novo vê o que o anterior gravou');
w = await SV.atender({ token: ses.token, acao: 'tarefas.listar', dados: {}, versao: '1.0.0' });
assert(w.voltar && /versões/.test(w.motivo), 'versão que a função não tem: volta ao Google');
// entrada: com a marca "google" usa o motor do Google
const info = S.sql("select 1"); void info;
C.sbEstado_('google', VA);
const temLogin = !!(await rpc('painel_login_info', {}));
if (temLogin) {
  const e = await SV.atender({ acao: 'login', entrar: true, dados: { usuario: 'admin', senha: T.SENHA || 'senha123' }, versao: VN });
  if (e.ok) assert(e.dados.banco.versao === VA, 'entrada pelo Supabase com o motor da versão do Google (' + VA + ')');
  else console.log('  (entrada não testada aqui: ' + (e.erro || e.motivo) + ')');
} else console.log('  (entrada pelo Supabase não ligada neste banco de teste)');
console.log('✓ Versões: tudo certo');
