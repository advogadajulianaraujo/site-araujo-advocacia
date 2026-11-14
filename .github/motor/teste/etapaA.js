// 8.30 Etapa A: o Supabase GRAVA PRIMEIRO. As mesmas gravações em dois escritórios iguais (A = planilha, como hoje; B = Supabase
// primeiro + cópia para a planilha) têm de deixar as planilhas IGUAIS. Dados inventados.
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const P = C.PropertiesService.getScriptProperties();
// mundo A: cópia exata das planilhas de B antes de qualquer gravação, sem Supabase
const GA = S.criarGoogle(); const CA = GA.ctx;
for (const [nome, sh] of G.abas) { const d = GA.aba(nome) || GA.ctx.SpreadsheetApp.getActive().insertSheet(nome); d._d.length = 0; sh._d.forEach(l => d._d.push(l.slice())); }
const tokA = (() => { const t = require('crypto').randomBytes(48).toString('hex'); CA.CacheService.getScriptCache().put('sessao_' + t, 'U1|0|' + Date.now()); return t; })();
const rodarA = (acao, dados) => JSON.parse(CA.doPost({ postData: { contents: JSON.stringify({ acao, token: tokA, dados: dados || {} }) } }).getContent());
const tok = logar('U1', '0'), tokM = logar('U2', '0');
// liga B: conferência, principal, grava primeiro
let r = rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência antes de ligar');
r = rodarServidor('banco.conferir', tok, { principal: true }); assert(r.ok, 'banco principal ligado');
r = rodarServidor('banco.conferir', tok, { grava: 'supabase' }); assert(r.ok && r.dados.grava === 'supabase', 'Supabase grava primeiro: ligado ' + (r.erro || ''));
// leituras iguais antes de gravar
const limpar = Gx => { for (const k of [...Gx.cache.keys()]) if (!k.startsWith('sessao_') && !k.startsWith('usr_')) Gx.cache.delete(k); };
for (const a of ['clientes.listar', 'processos.listar', 'prazos.listar', 'tarefas.listar', 'fin.resumo', 'eu.painel']) {
  limpar(G); limpar(GA); const x = rodarServidor(a, tok, {}), y = rodarA(a, {});
  assert(JSON.stringify(x.dados) === JSON.stringify(y.dados), a + ': igual lendo do banco (grava primeiro) e da planilha');
}
// a MESMA sequência de gravações nos dois mundos (ids iguais: uuid em sequência nos dois)
const seq = [
  ['clientes.salvar', { cliente: { id: 'C5', nome: 'Nome Etapa A', tipo: 'PF', cidade: 'Tubarão' } }],
  ['clientes.salvar', { cliente: { nome: 'Cliente Novo Inventado', tipo: 'PF', cpf_cnpj: '52998224725', profissao: 'Teste', endereco: 'Rua Inventada, 1', telefone: '48 90000-0000' } }],
  ['tarefas.salvar', { tarefa: { titulo: 'Tarefa A1', responsavel: 'maria', vence_em: T.dia(2) } }],
  ['tarefas.salvar', { tarefa: { id: 'T2', titulo: 'T2 editada', responsavel: 'ana', checklist: [{ t: 'item 1' }, { t: 'item 2', ok: true }] } }],
  ['tarefas.salvar', { tarefa: { id: 'T3', cancelar: true, titulo: 'x' } }],
  ['tarefas.mover', { id: 'T4', etapa: 'fazendo' }],
  ['prazos.situacao', { id: 'Z1', situacao: 'cumprido' }],
  ['trabalho.conferir', { tipo: 'prazo', id: 'Z5', quem: 'maria' }],
  ['clientes.nota', { id: 'C2', texto: 'Anotação inventada da etapa A' }],
  ['feriados.salvar', { data: T.dia(40), descricao: 'Feriado inventado' }],
  ['clientes.salvar', { cliente: { nome: 'Sem CPF', tipo: 'PF' } }] // erro de validação: nada pode ser gravado
];
const ws = [];
G.ctx.Utilities.__uuid = 0; GA.ctx.Utilities.__uuid = 0; // os dois mundos geram os mesmos ids
for (const [a, d] of seq) {
  const rb = rodarServidor(a, tok, d), ra = rodarA(a, d);
  if (rb.ok !== ra.ok || (!rb.ok && rb.erro !== ra.erro)) { console.log('✗ FALHOU', a, 'B:', rb.ok ? 'ok' : rb.erro, '| A:', ra.ok ? 'ok' : ra.erro); process.exitCode = 1; }
  else ws.push(a + (rb.ok ? '' : ' (erro igual)'));
}
console.log('   gravações feitas nos dois:', ws.length + '/' + seq.length);
// B: nada foi para a planilha ainda (só o banco); cópia banco → planilha
const shB = G.aba('Clientes')._d.find(x => x[0] === 'C5')[2];
assert(shB !== 'Nome Etapa A' && S.sql("select nome from clientes where id='C5'") === 'Nome Etapa A', 'B gravou no banco primeiro (a planilha ainda tem o nome antigo)');
const esp = C.sbEspelhar_(240000, true); assert(!esp.erros.length, 'cópia banco → planilha sem erro');
// comparação: planilhas iguais (horários e carimbos trocados por "H")
const norm = v => String(v).replace(/^'/, '').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, 'H').replace(/\d\d\/\d\d(\/\d{4})? \d\d:\d\d/g, 'H');
let difs = 0;
for (const nome of Object.keys(C.ESQUEMA)) {
  if (C.SB_SO_PLANILHA[nome]) continue;
  const a = GA.aba(nome)._d.slice(1).filter(l => l.join('')), b = G.aba(nome)._d.slice(1).filter(l => l.join(''));
  const ta = a.map(l => l.map(norm).join('|')).join('\n'), tb = b.map(l => l.map(norm).join('|')).join('\n');
  if (ta !== tb) { difs++; const la = ta.split('\n'), lb = tb.split('\n'); const i = la.findIndex((x, k) => x !== lb[k]); console.log('✗ FALHOU planilha', nome, a.length, 'x', b.length, '\n   A:', (la[i] || '').slice(0, 220), '\n   B:', (lb[i] || '').slice(0, 220)); process.exitCode = 1; }
}
assert(!difs, 'as planilhas dos dois escritórios ficaram IGUAIS depois das mesmas gravações');
// tudo ou nada: erro no meio de um trecho travado não grava nada
const antes = S.sql('select count(*) from tarefas');
try { C.comTrava_(() => { const t = C.tabela_('Tarefas'); C.inserirLinha_(t, { id: 'TERRO', titulo: 'não pode ficar' }); throw new Error('erro no meio'); }); } catch (e) { }
assert(S.sql('select count(*) from tarefas') === antes, 'erro no meio do trecho: nada foi gravado no banco');
// banco fora do ar: gravar dá erro claro e nada muda; ler usa a cópia da planilha
S.foraDoAr(true); limpar(G);
r = rodarServidor('tarefas.salvar', tok, { tarefa: { titulo: 'Com o banco fora' } });
assert(!r.ok && /banco/i.test(r.erro), 'banco fora: gravação recusada com aviso (' + r.erro + ')');
r = rodarServidor('clientes.listar', tok, {});
assert(r.ok && r.dados.length > 40, 'banco fora: a lista de clientes vem da cópia da planilha');
S.foraDoAr(false); P.setProperty('SB_FALHOU_EM', '0');
// o navegador (leitura direta) vê na hora o que foi gravado
(async () => {
  const B = S.criarNavegador().PAINEL_BANCO;
  B.configurar(async (a, d) => { const x = rodarServidor(a, tok, d); if (!x.ok) throw new Error(x.erro); return x.dados; });
  await B.iniciar(); await B.ler('tarefas.listar', {});
  rodarServidor('tarefas.salvar', tok, { tarefa: { titulo: 'Vista na hora pelo navegador', responsavel: 'admin' } });
  await new Promise(x => setTimeout(x, 1600));
  const l = await B.ler('tarefas.listar', {});
  assert(l.itens.some(x => x.titulo === 'Vista na hora pelo navegador'), 'o navegador vê na hora a tarefa gravada só no banco');
  // robô (lote) no modo grava primeiro
  const tabI = C.tabela_('Intimacoes'); tabI.buffer = [];
  for (let k = 0; k < 3; k++) C.inserirLinha_(tabI, { id: 'IROBO' + k, chave: 'robo' + k, fonte: 'Gmail', numero: 'x', criado_em: new Date().toISOString() });
  C.gravarLote_(tabI); C.sbEnviarSujas_();
  assert(S.sql("select count(*) from intimacoes where id like 'IROBO%'") === '3', 'robô: intimações novas gravadas no banco no fim da rodada');
  assert(S.sql("select count(distinct _n) from intimacoes") === S.sql("select count(*) from intimacoes"), 'cada linha com o seu número (sem repetir)');
  // voltar à planilha: copia tudo do banco e troca
  r = rodarServidor('banco.conferir', tok, { grava: 'planilha' });
  assert(r.ok && r.dados.grava === 'planilha', 'voltar para a planilha gravando primeiro');
  assert(G.aba('Intimacoes')._d.some(x => x[0] === 'IROBO2'), 'ao voltar, a planilha recebeu tudo do banco');
  r = rodarServidor('tarefas.salvar', tok, { tarefa: { titulo: 'Depois de voltar', responsavel: 'admin' } });
  r = rodarServidor('banco.conferir', tok, { conferir: true });
  assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'depois de voltar: planilha = banco em todas as abas (' + (r.ok ? r.dados.abas.filter(x => !x.ok).map(x => x.aba + ': ' + (x.erro || x.exemplos.join('; '))).join(' | ') : r.erro) + ')');
})();
