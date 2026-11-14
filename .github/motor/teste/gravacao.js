module.exports = async T => {
  const { S, C, G, assert, rodarServidor, logar } = T;
  console.log('\n===== gravações =====');
  const adm = T.nav_U1, est = T.nav_U2;
  const lerNav = (nav, a, d) => nav.B.PAINEL_BANCO.ler(a, d || {});
  const espera = ms => new Promise(r => setTimeout(r, ms));
  await lerNav(adm, 'clientes.listar'); await espera(1600);
  // 1) editar cliente pelo painel → aparece na hora no banco
  let r = rodarServidor('clientes.salvar', adm.tok, { cliente: { id: 'C5', nome: 'Nome Novo Teste', tipo: 'PF' } });
  assert(r.ok, 'clientes.salvar ok ' + (r.erro || ''));
  let l = await lerNav(adm, 'clientes.listar');
  assert(l.some(c => c.id === 'C5' && c.nome === 'Nome Novo Teste'), 'nome novo aparece pelo banco logo depois de gravar');
  assert(S.sql("select _n from clientes where id='C5'") === String(G.aba('Clientes')._d.findIndex(x => x[0] === 'C5') + 1), 'linha certa (_n = linha da planilha)');
  // 2) tarefa nova para a maria → aparece para ela
  r = rodarServidor('tarefas.salvar', adm.tok, { tarefa: { titulo: 'Tarefa nova da Maria', responsavel: 'maria', vence_em: T.dia(1) } });
  assert(r.ok, 'tarefas.salvar ok ' + (r.erro || ''));
  await espera(1600);
  l = await lerNav(est, 'tarefas.listar');
  const srv = rodarServidor('tarefas.listar', est.tok, {});
  assert(l.itens.some(x => x.titulo === 'Tarefa nova da Maria'), 'tarefa nova aparece para a Maria pelo banco');
  assert(JSON.stringify(l) === JSON.stringify(srv.dados), 'tarefas da Maria: banco = Apps Script depois da gravação');
  // 3) apagar linha (apagarLinha_) → some do banco
  C.MEMO_LEITURA = null;
  const tabT = C.tabela_('Tarefas'); const alvo = tabT.linhas.find(x => x.id === 'T1');
  C.apagarLinha_(tabT, alvo); C.sbEnviarSujas_();
  assert(S.sql("select count(*) from tarefas where id='T1'") === '0', 'tarefa apagada saiu do banco');
  await espera(1600);
  l = await lerNav(adm, 'tarefas.listar');
  assert(!l.itens.some(x => x.id === 'T1'), 'tarefa apagada some da tela (conferência de chaves)');
  // 4) robô em lote (buffer) + regravarMudadas_
  const tabI = C.tabela_('Intimacoes'); tabI.buffer = [];
  for (let k = 0; k < 5; k++) C.inserirLinha_(tabI, { id: 'INOVA' + k, chave: 'nova' + k, fonte: 'Gmail', recebido_em: new Date().toISOString(), numero: '0000001-00.2026.5.12.0001', movimento: 'Nova ' + k, criado_em: new Date().toISOString() });
  C.gravarLote_(tabI);
  const tabZ = C.tabela_('Prazos'); tabZ.adiar = true; tabZ.linhas.slice(0, 3).forEach(z => C.atualizarLinha_(tabZ, z, { observacoes: 'mudou em lote' })); C.regravarMudadas_(tabZ);
  C.sbEnviarSujas_();
  assert(S.sql("select count(*) from intimacoes where id like 'INOVA%'") === '5', 'robô: 5 intimações novas no banco');
  assert(S.sql("select count(*) from prazos where observacoes = 'mudou em lote'") === '3', 'robô: 3 prazos mudados no banco');
  // 5) cópia velha não passa por cima de mudança nova
  const linhaVelha = { escritorio_id: S.sql('select id from escritorios'), _n: 7, _sinc: '2000-01-01T00:00:00.000Z' };
  C.ESQUEMA.Clientes.forEach((k, j) => { if (k !== 'acesso_hash') linhaVelha[k] = G.aba('Clientes')._d[6][j]; }); linhaVelha.nome = 'NOME VELHO';
  C.sbGravar_('Clientes', [linhaVelha]);
  assert(S.sql("select nome from clientes where _n=7") !== 'NOME VELHO', 'cópia atrasada não sobrescreve o banco');
  // 6) Supabase fora do ar na gravação → fica pendente; volta → envia e limpa
  S.foraDoAr(true);
  r = rodarServidor('clientes.salvar', adm.tok, { cliente: { id: 'C8', nome: 'Gravado com banco fora', tipo: 'PF' } });
  assert(r.ok, 'gravar com o Supabase fora do ar continua funcionando (planilha é a reserva)');
  assert(!!C.PropertiesService.getScriptProperties().getProperty('SB_PENDENTES'), 'mudança ficou pendente');
  S.foraDoAr(false);
  rodarServidor('clientes.listar', adm.tok, {});
  assert(!!C.PropertiesService.getScriptProperties().getProperty('SB_PENDENTES'), 'nos 2 min seguintes nem tenta (não trava o painel)');
  C.PropertiesService.getScriptProperties().setProperty('SB_FALHOU_EM', String(Date.now() - 130000)); // passaram 2 min
  S.sql(`insert into painel_estado(escritorio_id, chave, valor) select id, 'pendente', 'teste' from escritorios`); // o que o servidor marcaria se conseguisse
  await espera(1600);
  let erroPend = null; try { await lerNav(adm, 'clientes.listar'); } catch (e) { erroPend = e; }
  assert(erroPend && erroPend.pendente, 'navegador vê "pendente" e volta para a planilha');
  r = rodarServidor('tarefas.salvar', adm.tok, { tarefa: { titulo: 'Qualquer', responsavel: 'admin' } });
  assert(!C.PropertiesService.getScriptProperties().getProperty('SB_PENDENTES'), 'próximo pedido enviou a pendência');
  assert(S.sql("select nome from clientes where id='C8'") === 'Gravado com banco fora', 'pendência chegou ao banco');
  assert(S.sql("select count(*) from painel_estado where chave='pendente'") === '0', 'marca "pendente" apagada');
  // 7) lerOuPlanilha: banco com erro → resposta veio da planilha
  const B = adm.B.PAINEL_BANCO; const tok0 = (await B.iniciar()).token;
  S.sql(`update painel_sessoes set expira_em = now() - interval '1 minute'`);
  const via = await B.lerOuPlanilha('processos.listar', {}, async () => 'PLANILHA');
  assert(via === 'PLANILHA', 'sessão do banco vencida → a tela vem da planilha');
  S.sql(`delete from painel_sessoes`);
  // 8) trocar senha derruba a sessão do banco
  const tokM = logar('U2', '0'); const B2 = require('./sim.js').criarNavegador().PAINEL_BANCO;
  B2.configurar(async (a, d) => { const x = rodarServidor(a, tokM, d); if (!x.ok) throw new Error(x.erro); return x.dados; });
  await B2.iniciar(); await B2.ler('processos.listar', {});
  const tabU = C.tabela_('Usuarios'); C.atualizarLinha_(tabU, tabU.linhas.find(x => x.id === 'U2'), { sessao_versao: '5' }); C.sbEnviarSujas_();
  let caiu = null; try { await espera(1600); await B2.ler('processos.listar', {}); } catch (e) { caiu = e; }
  assert(caiu && /sessão|desligado/.test(caiu.message), 'trocar senha/perfil derruba a leitura pelo banco (' + (caiu && caiu.message) + ')');
  // 9) sair apaga a sessão do banco
  const tokA = logar('U1', '0'); rodarServidor('banco.sessao', tokA, {});
  assert(S.sql("select count(*) from painel_sessoes where usuario_id='U1'") === '1', 'sessão do banco criada no login');
  rodarServidor('logout', tokA, {});
  assert(S.sql("select count(*) from painel_sessoes where usuario_id='U1'") === '0', 'Sair apaga a sessão do banco');
  // 10) cópia completa de novo: tudo igual (nada some, nada duplica)
  const cp = C.copiarParaSupabase_(240000, true);
  assert(!cp.erros.length, 'cópia completa depois das gravações sem erro');
  for (const aba of ['Clientes', 'Tarefas', 'Intimacoes', 'Prazos']) {
    const naPlanilha = G.aba(aba)._d.slice(1).filter(x => x.join('') && x[0]).length;
    assert(S.sql(`select count(*) from ${aba.toLowerCase()}`) === String(naPlanilha), `${aba}: banco = planilha (${naPlanilha})`);
  }
  // 11) Log arquivado (linhas do meio apagadas) → banco igual à planilha
  const shL = G.aba('Log'); for (let k = 0; k < 4100; k++) shL._d.push([new Date(Date.now() - (k < 50 ? 400 : 1) * 86400000).toISOString(), 'robo', 'teste', 'x' + k]);
  shL._d.splice(1, shL._d.length - 1, ...shL._d.slice(1).sort((a, b) => a[0] < b[0] ? -1 : 1));
  C.copiarParaSupabase_(240000, true);
  C.PropertiesService.getScriptProperties().deleteProperty('SB_FALHOU_EM'); C.setConfig_('LOG_ARQUIVADO_DIA', '2000-01-01');
  const arq = C.arquivarLog_(); C.sbEnviarSujas_();
  assert(arq > 0, 'Log antigo arquivado (' + arq + ' linhas)');
  const naPl = shL._d.slice(1).filter(x => x.join('')).map(x => x[3]).join('|');
  assert(S.sql("select string_agg(detalhe, '|' order by _n) from log") === naPl, 'Log: banco igual à planilha linha a linha depois de apagar do meio');
  console.log('chamadas ao "Supabase" no teste:', S.contas());
};
