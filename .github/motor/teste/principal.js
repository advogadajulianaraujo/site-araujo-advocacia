// 8.29: com o Supabase como banco PRINCIPAL o servidor lê dele; tudo tem de dar igual ao modo planilha, e nada pode ir para a linha errada.
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const ROTAS = [['clientes.listar', {}], ['clientes.obter', { id: 'C6' }], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }],
  ['tarefas.listar', {}], ['eu.painel', {}], ['documentos.assinaturas', {}], ['fin.resumo', {}], ['fin.honorarios', {}], ['fin.honorario', { id: 'H1' }], ['fin.areceber', {}],
  ['fin.conferencia', {}], ['indicadores.mes', {}], ['relatorio.cumpridos', {}], ['trabalho.aguardando', {}], ['equipe.listar', {}], ['prazos.memoria', { id: 'Z1' }], ['relatorio.geral', {}], ['fin.caixa', {}]];
const P = C.PropertiesService.getScriptProperties();
const limparMemoria = () => { for (const k of [...G.cache.keys()]) if (!k.startsWith('sessao_') && !k.startsWith('usr_')) G.cache.delete(k); };
const modo = m => P.setProperty('BANCO_PRINCIPAL', m);
function difs(a, b, cam, acc) {
  if (acc.length > 5 || a === b) return acc;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { acc.push((cam || 'raiz') + ': ' + JSON.stringify(a).slice(0, 50) + ' ≠ ' + JSON.stringify(b).slice(0, 50)); return acc; }
  if (Array.isArray(a) && a.length !== b.length) { acc.push(cam + ': ' + a.length + ' ≠ ' + b.length); return acc; }
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => difs(a[k], b[k], cam ? cam + '.' + k : k, acc)); return acc;
}
const tok = { U1: logar('U1', '0'), U2: logar('U2', '0'), U3: logar('U3', '2'), U4: logar('U4', '0') };
// 1) conferência + ligar
let r = rodarServidor('banco.conferir', tok.U1, { conferir: true, consertar: true });
assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência: todas as abas iguais (' + (r.ok ? r.dados.resumo.iguais + '/' + r.dados.resumo.abas : r.erro) + ')');
r = rodarServidor('banco.conferir', tok.U1, { principal: true });
assert(r.ok && r.dados.ativo, 'banco principal = Supabase ligado ' + (r.erro || ''));
// 2) leitura: Supabase × planilha, 4 perfis
for (const [u, t] of Object.entries(tok)) {
  let iguais = 0, lidoBanco = 0;
  for (const [a, d] of ROTAS) {
    modo('supabase'); limparMemoria(); const x = rodarServidor(a, t, d); const leu = Object.assign({}, C.SB_LEITURAS);
    modo('planilha'); limparMemoria(); const y = rodarServidor(a, t, d);
    if (Object.values(leu).some(v => v === 'supabase')) lidoBanco++;
    const dd = x.ok === y.ok ? (x.ok ? difs(x.dados, y.dados, '', []) : (x.erro === y.erro ? [] : [x.erro + ' ≠ ' + y.erro])) : ['ok ' + x.ok + ' ≠ ' + y.ok];
    if (dd.length) { console.log('✗ FALHOU', u, a, dd.join(' | '), JSON.stringify(leu)); process.exitCode = 1; } else iguais++;
  }
  assert(iguais === ROTAS.length, `${u}: ${iguais}/${ROTAS.length} telas iguais lendo do Supabase e da planilha (${lidoBanco} leram do banco)`);
}
modo('supabase');
// 3) gravações no modo principal
limparMemoria();
r = rodarServidor('clientes.salvar', tok.U1, { cliente: { id: 'C5', nome: 'Nome Principal', tipo: 'PF' } });
assert(r.ok, 'salvar cliente com o banco principal ' + (r.erro || ''));
assert(C.SB_LEITURAS.Clientes === 'supabase', 'o cliente foi lido do banco antes de gravar');
const linhaC5 = G.aba('Clientes')._d.findIndex(x => x[0] === 'C5') + 1;
assert(G.aba('Clientes')._d[linhaC5 - 1][2] === 'Nome Principal' && S.sql("select nome || '|' || _n from clientes where id='C5'") === 'Nome Principal|' + linhaC5, 'planilha e banco com o nome novo, na mesma linha');
r = rodarServidor('tarefas.salvar', tok.U1, { tarefa: { titulo: 'Nova no principal', responsavel: 'maria' } });
assert(r.ok, 'tarefa nova com o banco principal');
r = rodarServidor('tarefas.salvar', tok.U1, { tarefa: { id: 'T2', titulo: 'Editada no principal', responsavel: 'ana' } });
assert(r.ok && G.aba('Tarefas')._d.find(x => x[0] === 'T2')[1] === 'Editada no principal', 'editar tarefa com o banco principal');
C.setConfig_('RESP_PJE', 'ana'); C.sbEnviarSujas_();
r = rodarServidor('banco.conferir', tok.U1, { conferir: true });
assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'depois das gravações: planilha = banco em todas as abas (' + (r.ok ? r.dados.resumo.diferentes.join(',') : r.erro) + ')');
// 4) alguém mexeu na planilha à mão (linha a mais) → aquela aba volta a ser lida da planilha
const shC = G.aba('Clientes'); shC._d.push(C.ESQUEMA.Clientes.map(k => k === 'id' ? 'CMAO' : k === 'nome' ? 'Digitado à mão' : ''));
limparMemoria(); r = rodarServidor('clientes.listar', tok.U1, {});
assert(/planilha \(linhas diferentes/.test(C.SB_LEITURAS.Clientes || ''), 'linha a mais na planilha → Clientes lido da planilha (' + C.SB_LEITURAS.Clientes + ')');
assert(r.dados.some(c => c.id === 'CMAO'), 'e a tela mostra o cliente digitado à mão');
shC._d.pop();
// 5) linhas trocadas de lugar à mão (mesma quantidade) → gravação recusada, nada na linha errada
limparMemoria();
const iA = shC._d.findIndex(x => x[0] === 'C7'), iB = shC._d.findIndex(x => x[0] === 'C8');
[shC._d[iA], shC._d[iB]] = [shC._d[iB], shC._d[iA]];
const antes = JSON.stringify(shC._d);
r = rodarServidor('clientes.salvar', tok.U1, { cliente: { id: 'C7', nome: 'Não pode ir para a linha errada', tipo: 'PF' } });
assert(!r.ok && /mudou enquanto/.test(r.erro), 'linhas trocadas → gravação recusada (' + (r.erro || 'gravou!') + ')');
assert(JSON.stringify(shC._d) === antes, 'nenhuma linha da planilha foi mudada');
assert(!JSON.parse(P.getProperty('SB_TABELAS_OK')).Clientes, 'Clientes saiu da lista do banco (próximas leituras pela planilha)');
r = rodarServidor('clientes.salvar', tok.U1, { cliente: { id: 'C7', nome: 'Agora sim', tipo: 'PF' } });
assert(r.ok && shC._d.find(x => x[0] === 'C7')[2] === 'Agora sim', 'tentando de novo, grava certo (lido da planilha)');
r = rodarServidor('banco.conferir', tok.U1, { conferir: true, consertar: true });
assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência conserta e Clientes volta para o banco');
// 6) Supabase fora do ar no modo principal → lê e grava pela planilha
S.foraDoAr(true); limparMemoria();
r = rodarServidor('clientes.listar', tok.U1, {});
assert(r.ok && r.dados.length >= 40, 'Supabase fora do ar → Clientes pela planilha');
r = rodarServidor('tarefas.salvar', tok.U1, { tarefa: { titulo: 'Gravada com o banco fora', responsavel: 'admin' } });
assert(r.ok, 'gravar com o banco fora continua funcionando');
S.foraDoAr(false); P.setProperty('SB_FALHOU_EM', String(Date.now() - 130000));
r = rodarServidor('tarefas.listar', tok.U1, {});
assert(!P.getProperty('SB_PENDENTES'), 'pendência enviada quando o banco voltou');
r = rodarServidor('banco.conferir', tok.U1, { conferir: true });
assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'no fim: planilha = banco em todas as abas');
// 7) pré-carga: a 2ª vez a rota busca as abas numa ida só
limparMemoria(); const c0 = S.contas(); rodarServidor('fin.resumo', tok.U1, {}); const c1 = S.contas(); limparMemoria(); rodarServidor('fin.resumo', tok.U1, {}); const c2 = S.contas();
assert(c2 - c1 >= 1, 'a 2ª vez a rota já sabe quais abas buscar (vão juntas, em paralelo)');
