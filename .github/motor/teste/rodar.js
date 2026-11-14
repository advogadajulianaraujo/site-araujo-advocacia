const T = require('./teste.js'); const { S, C, assert, logar, rodarServidor } = T;
const ROTAS = [['clientes.listar', {}], ['clientes.listar', { busca: 'ana' }], ['clientes.obter', { id: 'C6' }], ['clientes.obter', { id: 'C3' }], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }], ['intimacoes.listar', {}],
  ['tarefas.listar', {}], ['feriados.listar', {}], ['equipe.listar', {}], ['trabalho.aguardando', {}], ['inicio.acoes', {}], ['audiencias.listar', {}], ['eu.painel', {}], ['documentos.assinaturas', {}], ['documentos.assinaturas', { todas: true }],
  ['fluxos.processo', { id: 'P3' }], ['prazos.memoria', { id: 'Z1' }], ['fin.resumo', {}], ['fin.honorarios', {}], ['fin.honorario', { id: 'H1' }], ['fin.areceber', {}], ['fin.pix', {}], ['fin.acaoCobranca', {}],
  ['fin.conferencia', {}], ['indicadores.mes', {}], ['relatorio.semana', {}], ['relatorio.cumpridos', {}], ['resumo', {}]];
function difs(a, b, cam, acc) {
  if (acc.length > 6 || a === b) return acc;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { acc.push((cam || 'raiz') + ': ' + JSON.stringify(a).slice(0, 60) + ' ≠ ' + JSON.stringify(b).slice(0, 60)); return acc; }
  if (Array.isArray(a) && a.length !== b.length) { acc.push(cam + ': ' + a.length + ' ≠ ' + b.length); return acc; }
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => difs(a[k], b[k], cam ? cam + '.' + k : k, acc)); return acc;
}
(async () => {
  for (const [uid, ver, nome] of [['U1', '0', 'administrador'], ['U2', '0', 'estagiário'], ['U3', '2', 'RH'], ['U4', '0', 'advogada']]) {
    console.log('\n===== perfil', nome, '=====');
    const tok = logar(uid, ver);
    const B = S.criarNavegador();
    B.PAINEL_BANCO.configurar(async (a, d) => { const r = rodarServidor(a, tok, d); if (!r.ok) throw new Error(r.erro); return r.dados; });
    const ses = await B.PAINEL_BANCO.iniciar();
    assert(ses && ses.ligado, 'sessão do banco criada (' + (ses ? '' : B.PAINEL_BANCO.estado().motivo) + ')');
    let iguais = 0, voltou = 0, diferentes = 0;
    for (const [acao, dados] of ROTAS) {
      const srv = rodarServidor(acao, tok, dados);
      let nav, erro = null;
      try { nav = await B.PAINEL_BANCO.ler(acao, dados); } catch (e) { erro = e; }
      if (erro) { voltou++; console.log('   ↩', acao.padEnd(22), 'volta p/ planilha:', String(erro.message).slice(0, 90), srv.ok ? '' : '(servidor: ' + srv.erro + ')'); continue; }
      if (!srv.ok) { diferentes++; console.log('✗ FALHOU', acao, 'navegador respondeu mas o servidor deu erro:', srv.erro); process.exitCode = 1; continue; }
      const d = difs(nav, srv.dados, '', []);
      if (d.length) { diferentes++; process.exitCode = 1; console.log('✗ FALHOU', acao, JSON.stringify(dados), d.join(' | ')); } else iguais++;
    }
    console.log(`   resultado: ${iguais} iguais ao Apps Script, ${voltou} voltam para a planilha, ${diferentes} diferentes`);
    T['nav_' + uid] = { B, tok };
  }
  // vazamentos: o que cada perfil recebeu do banco
  const tm = await T.nav_U2.B.PAINEL_BANCO.estado().tabelas;
  console.log('\nTabelas na memória do estagiário:', JSON.stringify(tm));
  assert(!tm.some(([t]) => ['log', 'pix', 'despesas', 'recebimentos'].includes(t)), 'estagiário não recebe log/pix/despesas/recebimentos');
  const cru = JSON.parse(S.postgrest('https://x.supabase.test/rest/v1/rpc/painel_ler', { method: 'POST', body: JSON.stringify({ p_token: (await T.nav_U2.B.PAINEL_BANCO.iniciar()).token, p_pedidos: [{ t: 'clientes' }, { t: 'tarefas' }, { t: 'config' }, { t: 'honorarios' }, { t: 'leads' }] }) }, 'anon').txt);
  assert(!JSON.stringify(cru).includes('HASHSECRETO'), 'acesso_hash nunca chega ao navegador');
  assert(!JSON.stringify(cru).includes('segredo-nao-pode-sair'), 'chave secreta de Config não chega ao navegador');
  assert(!JSON.stringify(cru).includes('PIXSECRETO'), 'texto do Pix não chega ao navegador');
  assert(!JSON.stringify(cru.tabelas.tarefas).includes('Texto privado da tarefa 1 '), 'texto das tarefas dos colegas não chega');
  assert(!JSON.stringify(cru).includes('TOKENSECRETO'), 'cadastro_token não chega ao estagiário');
  assert(cru.tabelas.tarefas.linhas.every(t => t._meu === (t.responsavel === 'maria' || (!t.responsavel && t.criado_por === 'maria')) && (t._meu || !t.titulo)), 'estagiário: tarefas dos colegas sem título (' + cru.tabelas.tarefas.linhas.filter(x => x._meu).length + ' dele)');
  assert(!('descricao' in cru.tabelas.honorarios.linhas[0]) && !('valor_total' in cru.tabelas.honorarios.linhas[0]), 'estagiário: honorários só com colunas mínimas');
  module.exports = T;
  await require('./gravacao.js')(T);
})().catch(e => { console.log('ERRO', e); process.exitCode = 1; });
