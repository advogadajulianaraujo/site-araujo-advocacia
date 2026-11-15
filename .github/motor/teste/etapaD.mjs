// 8.33 Etapa D: entrar no painel pelo Supabase (função "painel"), sem o Google. Dados INVENTADOS.
// Compara com o login do Apps Script (mesmas respostas e travas), confere a sessão do banco e a do Google criadas juntas,
// o "Sair", o desligar e que hash/salt e a chave das senhas nunca saem do servidor.
import { createRequire } from 'node:module'; import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const { criarServidor } = await import('../../../supabase/functions/painel/servidor.js');
const P = C.PropertiesService.getScriptProperties();
async function rpc(nome, args) {
  const x = S.postgrest('https://x.supabase.test/rest/v1/rpc/' + nome, { method: 'POST', payload: JSON.stringify(args) }, null);
  let j = null; try { j = x.txt ? JSON.parse(x.txt) : null; } catch (e) {}
  if (x.status >= 300) { const e = new Error(j && j.message || 'erro'); e.codigo = /conflito/.test(j && j.message || '') ? '40001' : (j && j.code); throw e; }
  return j;
}
const base = { url: 'https://x.supabase.test', createHash: crypto.createHash, createHmac: crypto.createHmac, randomUUID: crypto.randomUUID,
  b64: (u, w) => Buffer.from(u).toString(w ? 'base64url' : 'base64') };
const SV = criarServidor({ rpc, base });
S.sql("delete from vault.secrets where name like 'painel_senhas_%'; delete from painel_estado where chave in ('login_edge', 'login_falhas')"); // (sobras de rodadas anteriores)
// senhas inventadas
const tabU = C.tabela_('Usuarios');
for (const [id, senha] of [['U1', 'senha-admin-1'], ['U2', 'senha-maria-2']]) { const l = tabU.linhas.find(x => x.id === id); const salt = 'sal-' + id; C.atualizarLinha_(tabU, l, { salt, hash: C.hashSenha_(senha, salt) }); }
C.copiarParaSupabase_(240000, true);
// mundo A: o login de sempre (Apps Script + planilha), mesma chave secreta
const GA = S.criarGoogle(); const CA = GA.ctx;
for (const [nome, sh] of G.abas) { const d = GA.aba(nome); d._d.length = 0; sh._d.forEach(l => d._d.push(l.slice())); }
CA.PropertiesService.getScriptProperties().setProperty('CHAVE_SENHAS', P.getProperty('CHAVE_SENHAS'));
const rodarA = (acao, dados) => JSON.parse(CA.doPost({ postData: { contents: JSON.stringify({ acao, token: null, dados: dados || {} }) } }).getContent());
// mundo B: etapas A, B e C ligadas
const tok = logar('U1', '0');
let r = rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência');
rodarServidor('banco.conferir', tok, { principal: true }); rodarServidor('banco.conferir', tok, { grava: 'supabase' });
r = rodarServidor('banco.conferir', tok, { login: 'supabase' }); assert(r.ok && r.dados.login === 'supabase', 'Etapas A e B ligadas');
C.sbEstado_('asaas', 'nao'); P.setProperty('BANCO_EDGE', 'sim'); C.sbEstado_('edge', 'sim');
P.setProperty('SUPABASE_PUBLICA', P.getProperty('SUPABASE_PUBLICA') || 'sb_publishable_teste');
// (no Supabase de verdade o botão chama a função; aqui a resposta dela vem do mesmo banco)
C.sbEdgePing_ = () => ({ ok: true, versao: C.VERSAO, entrar: S.sql('select painel_login_info() is not null') === 't' });
assert((await SV.atender({ acao: 'login', entrar: true, dados: { usuario: 'admin', senha: 'senha-admin-1' } })).voltar, 'antes de ligar: o login vai ao Google');
r = rodarServidor('banco.conferir', tok, { entrar: 'sim' });
assert(r.ok && r.dados.entrar === 'sim', 'Etapa D ligada pelo botão ' + (r.erro || ''));
assert(S.sql("select count(*) from vault.secrets where name like 'painel_senhas_%'") === '1', 'a chave das senhas foi para o cofre (Vault)');
assert(S.sql("select count(*) from config where chave ilike '%senha%'") === '0', 'a chave das senhas não está em nenhuma tabela comum');
// mesmas entradas nos dois mundos
for (const x of [G, GA]) for (const k of [...x.cache.keys()]) if (/login_falhas/.test(k)) x.cache.delete(k);
const passos = [{ usuario: 'admin', senha: 'senha-admin-1' }];
for (let i = 0; i < 5; i++) passos.push({ usuario: 'maria', senha: 'errada' + i });
passos.push({ usuario: 'maria', senha: 'senha-maria-2' }, { usuario: 'ninguem', senha: 'x' }, { usuario: 'ADMIN', senha: 'senha-admin-1' });
const resB = [], resA = [];
for (const d of passos) { resB.push(await SV.atender({ acao: 'login', entrar: true, dados: d, versao: C.VERSAO })); resA.push(rodarA('login', d)); }
assert(resB.every(x => !x.voltar), 'todas as entradas foram respondidas pelo Supabase');
assert(resB.every((x, i) => x.ok === resA[i].ok && (x.ok || x.erro === resA[i].erro)),
  'certo, 5 erradas, bloqueio, inexistente e maiúsculas: mesmas respostas do Google (' + resB.map(x => x.ok ? 'ok' : x.erro.slice(0, 22)).join(' | ') + ')');
const b1 = resB[0].dados;
assert(JSON.stringify(b1.usuario) === JSON.stringify(resA[0].dados.usuario), 'os dados da pessoa são os mesmos do login do Google');
assert(/^[0-9a-f]{96}$/.test(b1.token) && b1.banco && b1.banco.token && b1.banco.edge === 'https://x.supabase.test/functions/v1/painel' && b1.banco.versao === C.VERSAO,
  'devolve as duas sessões (Google e banco) e o endereço do motor');
const txt = JSON.stringify(resB);
assert(!/sal-U1|v2\$/.test(txt) && !txt.includes(P.getProperty('CHAVE_SENHAS')), 'hash, salt e a chave das senhas nunca saem do servidor');
assert(S.sql("select tentativas || '|' || (bloqueado_ate <> '') from usuarios where id = 'U2'") === '0|true', 'maria ficou bloqueada no banco (5 erros)');
assert(+S.sql("select count(*) from log where acao = 'login recusado'") >= 6, 'as entradas recusadas ficaram no registro');
assert(S.sql("select split_part(valor, '|', 1) from painel_estado where chave = 'login_falhas'") === '6', 'contador geral de erros (trava de 15 min) conta no banco');
// a sessão do banco funciona no motor do Supabase
r = await SV.atender({ token: b1.banco.token, acao: 'clientes.listar', dados: {}, versao: C.VERSAO });
assert(r.ok && r.dados.length > 5, 'com a sessão do login, as telas abrem pelo Supabase');
// a sessão do Google vale também (documentos, Drive, Agenda… continuam no Apps Script)
for (const k of [...G.cache.keys()]) if (k.startsWith('sessao_') || k.startsWith('usr_')) G.cache.delete(k);
r = rodarServidor('sessao', b1.token, {}); assert(r.ok && r.dados.usuario === 'admin', 'o Google aceita a sessão criada pelo Supabase ' + (r.erro || ''));
r = rodarServidor('sessao', crypto.randomBytes(48).toString('hex'), {}); assert(!r.ok && /sessão terminou/i.test(r.erro), 'código inventado continua recusado');
// trocou a senha / o acesso → as duas sessões caem
S.sql("update usuarios set sessao_versao = '7' where id = 'U1'");
for (const k of [...G.cache.keys()]) if (k.startsWith('sessao_') || k.startsWith('usr_') || k.startsWith('sb')) G.cache.delete(k);
r = rodarServidor('sessao', b1.token, {}); assert(!r.ok, 'acesso mudou: o Google recusa (' + (r.erro || '').slice(0, 40) + ')');
r = await SV.atender({ token: b1.banco.token, acao: 'clientes.listar', dados: {}, versao: C.VERSAO }); assert(r.voltar && r.sessao, 'acesso mudou: o Supabase recusa');
S.sql("update usuarios set sessao_versao = '0' where id = 'U1'");
for (const k of [...G.cache.keys()]) if (k.startsWith('usr_') || k.startsWith('sb')) G.cache.delete(k); // (mudança feita direto no banco, fora do painel)
// com a planilha fora do ar: entra, lê e grava
S.planilhaFora(true);
const b2 = (await SV.atender({ acao: 'login', entrar: true, dados: { usuario: 'admin', senha: 'senha-admin-1' }, versao: C.VERSAO })).dados;
r = await SV.atender({ token: b2.banco.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'Tarefa da Etapa D', responsavel: 'admin' } }, pedido: 'pd1', versao: C.VERSAO });
assert(b2 && r.ok && S.sql("select count(*) from tarefas where titulo = 'Tarefa da Etapa D'") === '1', 'sem o Google e sem a planilha: entra e grava');
S.planilhaFora(false);
// Sair
await SV.atender({ acao: 'logout', sair: true, token: b2.banco.token });
r = await SV.atender({ token: b2.banco.token, acao: 'clientes.listar', dados: {}, versao: C.VERSAO }); assert(r.voltar && r.sessao, 'Sair apaga a sessão do banco');
// outra versão do painel → Google
assert((await SV.atender({ acao: 'login', entrar: true, dados: passos[0], versao: '0.0.1' })).voltar, 'painel de outra versão: entra pelo Google');
// desligar
r = rodarServidor('banco.conferir', logar('U1', '0'), { entrar: 'nao' }); assert(r.ok && r.dados.entrar === 'nao', 'desligado pelo botão ' + (r.erro || ''));
assert(S.sql("select count(*) from vault.secrets where name like 'painel_senhas_%'") === '0', 'ao desligar, a chave sai do cofre');
assert((await SV.atender({ acao: 'login', entrar: true, dados: passos[0], versao: C.VERSAO })).voltar, 'desligado: o login volta para o Google');
r = rodarServidor('banco.conferir', logar('U1', '0'), { entrar: 'sim' }); rodarServidor('banco.conferir', logar('U1', '0'), { edge: 'nao' });
assert(S.sql("select valor from painel_estado where chave = 'login_edge'") === 'nao' && P.getProperty('BANCO_ENTRAR') === 'nao', 'desligar o motor desliga também a entrada pelo Supabase');
console.log(process.exitCode ? '✗ HOUVE FALHAS' : '✓ Etapa D: tudo certo');
