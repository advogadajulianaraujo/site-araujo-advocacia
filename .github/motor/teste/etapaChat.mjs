// 8.39: chat da equipe — Apps Script e função do Supabase gravam e listam igual; conversa a dois só para os dois; não lidas;
// consulta pequena do navegador (painel_chat_ping) com a sessão do banco.
import { createRequire } from 'node:module'; import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, assert, logar, rodarServidor } = T;
const { criarServidor } = await import('../../../supabase/functions/painel/servidor.js');
const P = C.PropertiesService.getScriptProperties();
async function rpc(nome, args) {
  const x = S.postgrest('https://x.supabase.test/rest/v1/rpc/' + nome, { method: 'POST', payload: JSON.stringify(args) }, null);
  let j = null; try { j = x.txt ? JSON.parse(x.txt) : null; } catch (e) {}
  if (x.status >= 300) { const e = new Error(j && j.message || 'erro'); e.codigo = j && j.code; throw e; }
  return j;
}
const base = { url: 'https://x.supabase.test', createHash: crypto.createHash, createHmac: crypto.createHmac, randomUUID: crypto.randomUUID, b64: (u, w) => Buffer.from(u).toString(w ? 'base64url' : 'base64') };
const SV = criarServidor({ rpc, base });
const tA = logar('U1', '0'), tM = logar('U2', '0'), tR = logar('U3', '2'), tN = logar('U4', '0');
// 1) pelo Apps Script
let r = rodarServidor('chat.enviar', tA, { sala: 'geral', texto: 'Bom dia, equipe!' }); assert(r.ok, 'admin manda na sala geral');
r = rodarServidor('chat.enviar', tM, { sala: 'dm:admin|maria', texto: 'Admin, pode olhar o prazo do C3?' }); assert(r.ok, 'maria manda para o admin');
r = rodarServidor('chat.enviar', tM, { sala: 'dm:ana|rh', texto: 'intrusa' }); assert(!r.ok && /não encontrada/.test(r.erro), 'ninguém escreve em conversa dos outros');
r = rodarServidor('chat.enviar', tM, { sala: 'geral', texto: '   ' }); assert(!r.ok, 'mensagem vazia é recusada');
let lA = rodarServidor('chat.listar', tA, { sala: 'dm:admin|maria' }).dados;
assert(lA.mensagens.length === 1 && lA.mensagens[0].texto.includes('prazo do C3'), 'admin vê a mensagem da maria');
const salaM = lA.salas.find(x => x.sala === 'dm:admin|maria'); assert(salaM && salaM.naoLidas === 1 && salaM.nome === 'Maria Teste', 'conversa com a maria: 1 não lida');
assert(lA.salas[0].sala === 'geral', 'Equipe toda vem primeiro');
let lN = rodarServidor('chat.listar', tN, { sala: 'dm:admin|maria' }).dados;
assert(!lN.mensagens.length && !lN.sala && !lN.salas.some(x => x.sala === 'dm:admin|maria'), 'a Ana NÃO vê a conversa da maria com o admin');
assert(lN.salas.find(x => x.sala === 'geral').naoLidas === 1, 'a Ana tem 1 não lida na geral');
rodarServidor('chat.lido', tA, { sala: 'dm:admin|maria', em: lA.mensagens[0].em });
lA = rodarServidor('chat.listar', tA, {}).dados;
assert(lA.salas.find(x => x.sala === 'dm:admin|maria').naoLidas === 0, 'depois de ler: 0 não lidas');
// 2) pelo motor do Supabase (mesmo resultado)
rodarServidor('banco.conferir', tA, { conferir: true, consertar: true }); rodarServidor('banco.conferir', tA, { principal: true }); rodarServidor('banco.conferir', tA, { grava: 'supabase' });
rodarServidor('banco.conferir', tA, { login: 'supabase' });
C.sbEstado_('edge', 'sim'); P.setProperty('BANCO_EDGE', 'sim');
const sesN = rodarServidor('banco.sessao', tN, {}).dados, sesA = rodarServidor('banco.sessao', tA, {}).dados;
const e1 = await SV.atender({ token: sesN.token, acao: 'chat.enviar', dados: { sala: 'dm:admin|ana', texto: 'Doutor, mensagem pelo Supabase' }, versao: C.VERSAO, pedido: 'chat-1' });
assert(e1.ok && !e1.voltar, 'mandar pelo motor do Supabase (sem o Google)');
const e2 = await SV.atender({ token: sesA.token, acao: 'chat.listar', dados: { sala: 'dm:admin|ana' }, versao: C.VERSAO });
assert(e2.ok && e2.dados.mensagens.some(m => /pelo Supabase/.test(m.texto)), 'listar pelo motor do Supabase vê a mensagem');
const g = rodarServidor('chat.listar', tA, { sala: 'dm:admin|ana' }).dados;
assert(JSON.stringify(g.mensagens.map(m => m.texto)) === JSON.stringify(e2.dados.mensagens.map(m => m.texto)), 'Apps Script e Supabase listam igual');
// 3) a consulta pequena do navegador (chave pública + sessão do banco)
const ping = t => JSON.parse(S.postgrest('https://x.supabase.test/rest/v1/rpc/painel_chat_ping', { method: 'POST', body: JSON.stringify({ p_token: t }) }, 'anon').txt);
const pA = ping(sesA.token); assert(pA.naoLidas === 1 && pA.ultima && pA.ultima.de === 'ana', 'admin: 1 não lida (da Ana) e a última mensagem');
const pN = ping(sesN.token); assert(pN.naoLidas === 1 && pN.ultima.sala !== 'dm:admin|maria', 'Ana: a última que ela pode ver (nunca a conversa dos outros)');
const pX = S.postgrest('https://x.supabase.test/rest/v1/rpc/painel_chat_ping', { method: 'POST', body: JSON.stringify({ p_token: 'falso' }) }, 'anon');
assert(pX.status >= 400, 'sem sessão válida a consulta é recusada');
const em = S.sql("select count(*) from chat"); assert(+em === 3, 'banco com as 3 mensagens');
// 4) apagar
const id = rodarServidor('chat.listar', tA, { sala: 'geral' }).dados.mensagens[0].id;
assert(!rodarServidor('chat.apagar', tM, { id }).ok, 'só quem escreveu apaga');
assert(rodarServidor('chat.apagar', tA, { id }).ok, 'quem escreveu apaga');
console.log(process.exitCode ? '✗ CHAT COM FALHAS' : '✓ Chat da equipe: tudo certo');
