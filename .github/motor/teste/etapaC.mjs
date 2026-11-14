// 8.32 Etapa C: o motor do painel no Supabase (supabase/functions/painel/servidor.js + motor.js) contra o banco de teste.
import { createRequire } from 'node:module'; import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const { criarServidor } = await import('../../../supabase/functions/painel/servidor.js');
const P = C.PropertiesService.getScriptProperties();
const esc = S.sql('select id from escritorios limit 1');
// rpc com a chave secreta (como dentro do Supabase); gancho para simular "outra pessoa gravando no meio"
let antesDeAplicar = null;
async function rpc(nome, args) {
  if (nome === 'painel_aplicar_pedido' && antesDeAplicar) { const f = antesDeAplicar; antesDeAplicar = null; f(); }
  const x = S.postgrest('https://x.supabase.test/rest/v1/rpc/' + nome, { method: 'POST', payload: JSON.stringify(args) }, null);
  let j = null; try { j = x.txt ? JSON.parse(x.txt) : null; } catch (e) {}
  if (x.status >= 300) { const e = new Error(j && j.message || 'erro'); e.codigo = /conflito/.test(j && j.message || '') ? '40001' : (j && j.code); throw e; }
  return j;
}
let inicioUuid = 0, uuidLocal = 0;
const base = { createHash: crypto.createHash, createHmac: crypto.createHmac, b64: (u, w) => Buffer.from(u).toString(w ? 'base64url' : 'base64'),
  randomUUID: () => (String(++uuidLocal).padStart(8, '0') + 'aa').slice(0, 8) + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa', antesDeRodar: () => { uuidLocal = inicioUuid; } };
const SV = criarServidor({ rpc, base });
// mundo A (planilha, como sempre) — cópia antes de ligar
const GA = S.criarGoogle(); const CA = GA.ctx;
for (const [nome, sh] of G.abas) { const d = GA.aba(nome); d._d.length = 0; sh._d.forEach(l => d._d.push(l.slice())); }
const tokA = (() => { const t = crypto.randomBytes(48).toString('hex'); CA.CacheService.getScriptCache().put('sessao_' + t, 'U1|0|' + Date.now()); return t; })();
const rodarA = (acao, dados) => JSON.parse(CA.doPost({ postData: { contents: JSON.stringify({ acao, token: tokA, dados: dados || {} }) } }).getContent());
// mundo B: tudo no banco + motor do Supabase ligado
const tok = logar('U1', '0');
let r = rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência');
rodarServidor('banco.conferir', tok, { principal: true }); rodarServidor('banco.conferir', tok, { grava: 'supabase' });
r = rodarServidor('banco.conferir', tok, { login: 'supabase' }); assert(r.ok && r.dados.login === 'supabase', 'Etapas A e B ligadas');
C.sbEstado_('edge', 'sim'); C.sbEstado_('asaas', 'nao'); P.setProperty('BANCO_EDGE', 'sim'); // (no Supabase de verdade o botão confere a função antes)
const sessao = uid => { const t = logar(uid, uid === 'U3' ? '2' : '0'); return rodarServidor('banco.sessao', t, {}).dados; };
const SES = { U1: sessao('U1'), U2: sessao('U2'), U3: sessao('U3'), U4: sessao('U4') };
assert(SES.U1 && /functions\/v1\/painel$/.test(SES.U1.edge), 'a sessão do banco traz o endereço do motor do Supabase');
assert((await SV.atender({ ping: true })).versao === C.VERSAO, 'a função responde com a mesma versão do Code.gs (' + C.VERSAO + ')');
const limpar = Gx => { for (const k of [...Gx.cache.keys()]) if (!k.startsWith('sessao_') && !k.startsWith('usr_')) Gx.cache.delete(k); };
// 1) leituras: motor do Supabase × Apps Script, 4 perfis
const ROTAS = [['clientes.listar', {}], ['clientes.obter', { id: 'C6' }], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }],
  ['tarefas.listar', {}], ['eu.painel', {}], ['documentos.assinaturas', {}], ['fin.resumo', {}], ['fin.honorarios', {}], ['fin.areceber', {}], ['relatorio.geral', {}],
  ['trabalho.aguardando', {}], ['equipe.listar', {}], ['fin.caixa', {}], ['relatorio.semana', {}], ['indicadores.mes', {}]];
for (const [uid, s] of Object.entries(SES)) {
  const tokAS = logar(uid, uid === 'U3' ? '2' : '0'); let iguais = 0, voltou = 0;
  for (const [a, d] of ROTAS) {
    limpar(G); const e = await SV.atender({ token: s.token, acao: a, dados: d, versao: C.VERSAO }); const g = rodarServidor(a, tokAS, d);
    if (e.voltar) { voltou++; continue; }
    if (e.ok !== g.ok || JSON.stringify(e.ok ? e.dados : e.erro) !== JSON.stringify(g.ok ? g.dados : g.erro)) { console.log('✗ FALHOU', uid, a, e.ok ? '' : e.erro, '|', g.ok ? '' : g.erro); process.exitCode = 1; } else iguais++;
  }
  assert(iguais + voltou === ROTAS.length, `${uid}: ${iguais} telas iguais pelo Supabase, ${voltou} voltaram ao Google`);
}
// 2) gravações: as mesmas nos dois mundos (o navegador manda ao Supabase; se ele devolver, ao Apps Script)
G.ctx.Utilities.__uuid = 0; GA.ctx.Utilities.__uuid = 0;
const seq = [
  ['clientes.salvar', { cliente: { id: 'C5', nome: 'Nome Etapa C', tipo: 'PF', cidade: 'Laguna' } }],
  ['clientes.salvar', { cliente: { nome: 'Cliente Novo C', tipo: 'PF', cpf_cnpj: '52998224725', profissao: 'Teste', endereco: 'Rua Inventada, 2', telefone: '48 90000-0001' } }],
  ['tarefas.salvar', { tarefa: { titulo: 'Tarefa C1', responsavel: 'maria', vence_em: T.dia(3) } }],
  ['tarefas.salvar', { tarefa: { id: 'T2', titulo: 'T2 pelo Supabase', responsavel: 'ana', checklist: [{ t: 'a' }, { t: 'b', ok: true }] } }],
  ['tarefas.mover', { id: 'T4', etapa: 'fazendo' }],
  ['prazos.situacao', { id: 'Z1', situacao: 'cumprido' }],
  ['trabalho.conferir', { tipo: 'prazo', id: 'Z5', quem: 'maria' }],
  ['clientes.nota', { id: 'C2', texto: 'Anotação pelo Supabase' }],
  ['feriados.salvar', { data: T.dia(41), descricao: 'Feriado C' }],
  ['clientes.salvar', { cliente: { nome: 'Sem CPF', tipo: 'PF' } }]];
const caminho = [];
for (const [a, d] of seq) {
  inicioUuid = G.ctx.Utilities.__uuid; uuidLocal = inicioUuid;
  let rb = await SV.atender({ token: SES.U1.token, acao: a, dados: d, pedido: 'ped-' + caminho.length, versao: C.VERSAO });
  if (rb.voltar) { caminho.push(a + '→Google'); rb = rodarServidor(a, tok, d); } else { caminho.push(a + '→Supabase'); G.ctx.Utilities.__uuid = uuidLocal; }
  const ra = rodarA(a, d);
  if (rb.ok !== ra.ok || (!rb.ok && rb.erro !== ra.erro)) { console.log('✗ FALHOU', a, 'B:', rb.ok ? 'ok' : rb.erro, '| A:', ra.ok ? 'ok' : ra.erro); process.exitCode = 1; }
}
console.log('   caminhos:', caminho.join(', '));
assert(caminho.filter(x => /Supabase/.test(x)).length >= 7, 'a maioria das gravações foi feita no Supabase, sem o Google');
C.sbEspelhar_(240000, true);
const norm = v => String(v).replace(/^'/, '').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, 'H').replace(/\d\d\/\d\d(\/\d{4})? \d\d:\d\d/g, 'H');
let difs = 0;
for (const nome of Object.keys(C.ESQUEMA)) {
  if (['Log', 'LogArquivo', 'Usuarios', 'PastasConferir', 'SiteCliques'].includes(nome)) continue;
  const a = GA.aba(nome)._d.slice(1).filter(l => l.join('')).map(l => l.map(norm).join('|')), b = G.aba(nome)._d.slice(1).filter(l => l.join('')).map(l => l.map(norm).join('|'));
  if (JSON.stringify(a) !== JSON.stringify(b)) { difs++; const i = a.findIndex((x, k) => x !== b[k]); console.log('✗ FALHOU', nome, a.length, 'x', b.length, '\n   A:', (a[i] || '').slice(0, 200), '\n   B:', (b[i] || '').slice(0, 200)); process.exitCode = 1; }
}
assert(!difs, 'as planilhas dos dois escritórios ficaram IGUAIS (gravações pelo motor do Supabase)');
// 3) o mesmo pedido mandado de novo não grava duas vezes
const nT = S.sql('select count(*) from tarefas');
const p1 = await SV.atender({ token: SES.U1.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'Uma vez só' } }, pedido: 'repete-1', versao: C.VERSAO });
const p2 = await SV.atender({ token: SES.U1.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'Uma vez só' } }, pedido: 'repete-1', versao: C.VERSAO });
assert(p1.ok && p2.ok && JSON.stringify(p1.dados) === JSON.stringify(p2.dados) && S.sql('select count(*) from tarefas') === String(+nT + 1), 'pedido repetido (internet caiu e o painel mandou de novo) grava uma vez só');
// 4) duas pessoas mudando a mesma linha: a segunda lê de novo e refaz (nada se perde)
antesDeAplicar = () => S.sql(`select painel_aplicar('${esc}', '[{"t":"clientes","upd":[{"k":"C9","cols":{"cidade":"Mudou no meio"}}]}]')`);
const cf = await SV.atender({ token: SES.U1.token, acao: 'clientes.salvar', dados: { cliente: { id: 'C9', nome: 'Nome C9 novo', tipo: 'PF' } }, pedido: 'conf-1', versao: C.VERSAO });
assert(cf.ok && S.sql("select nome || '|' || cidade from clientes where id='C9'") === 'Nome C9 novo|Mudou no meio', 'linha mudada no meio: refez a conta e ficaram as DUAS mudanças');
// 5) o que precisa do Google volta; desligar vale na hora; sessão inválida volta
const g1 = await SV.atender({ token: SES.U1.token, acao: 'agenda.listar', dados: { inicio: T.dia(0), fim: T.dia(7) }, versao: C.VERSAO });
assert(g1.voltar, 'agenda (Google Agenda) volta para o Apps Script: ' + g1.motivo);
const g2 = await SV.atender({ token: SES.U1.token, acao: 'login', dados: { usuario: 'admin', senha: 'x' } });
assert(g2.voltar, 'login fica no Apps Script');
const g3 = await SV.atender({ token: 'x'.repeat(64), acao: 'clientes.listar', dados: {}, versao: C.VERSAO });
assert(g3.voltar && g3.sessao, 'código de sessão inválido: volta (e o painel pede outro)');
const g4 = await SV.atender({ token: SES.U2.token, acao: 'fin.resumo', dados: {}, versao: C.VERSAO });
assert(g4.ok === false && /não tem acesso/.test(g4.erro), 'estagiário pedindo o financeiro: recusado igual ao Apps Script');
const g5 = await SV.atender({ token: SES.U1.token, acao: 'clientes.listar', dados: {}, versao: '0.0.0' });
assert(g5.voltar, 'navegador de outra versão: volta');
C.sbEstado_('edge', 'nao');
const g6 = await SV.atender({ token: SES.U1.token, acao: 'tarefas.salvar', dados: { tarefa: { titulo: 'não pode' } }, pedido: 'off-1', versao: C.VERSAO });
assert(g6.voltar && S.sql("select count(*) from tarefas where titulo='não pode'") === '0', 'desligado no painel: volta na hora e não grava nada');
C.sbEstado_('edge', 'sim');
// 6) o registro de atividades: "login recusado" e "acesso negado" ficam mesmo com erro
assert(+S.sql("select count(*) from log where acao='acesso negado' and detalhe='fin.resumo'") >= 1, 'acesso negado pelo motor do Supabase fica no registro');
const fim = rodarServidor('banco.conferir', logar('U1', '0'), { conferir: true });
assert(fim.ok && fim.dados.resumo.iguais === fim.dados.resumo.abas, 'no fim: planilha = banco em todas as abas (' + (fim.ok ? fim.dados.resumo.diferentes.join(',') : fim.erro) + ')');
