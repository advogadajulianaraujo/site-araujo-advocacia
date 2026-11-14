const T = require('./teste.js'); const { S, C, logar, rodarServidor } = T;
const ROTAS = [['clientes.listar', {}], ['clientes.obter', { id: 'C6' }], ['processos.listar', {}], ['prazos.listar', {}], ['intimacoes.listar', { limite: 30, abertas: true }], ['tarefas.listar', {}], ['eu.painel', {}], ['fin.resumo', {}], ['fin.honorarios', {}], ['documentos.assinaturas', {}]];
(async () => {
  const tok = logar('U1', '0'), B = S.criarNavegador().PAINEL_BANCO;
  let bytes = 0; const f0 = B.constructor; 
  B.configurar(async (a, d) => { const r = rodarServidor(a, tok, d); if (!r.ok) throw new Error(r.erro); return r.dados; });
  await B.iniciar();
  const ses = await B.iniciar();
  const tamanho = p => Buffer.byteLength(S.postgrest('https://x.supabase.test/rest/v1/rpc/painel_ler', { method: 'POST', body: JSON.stringify({ p_token: ses.token, p_pedidos: p }) }, 'anon').txt);
  const tabs = ['clientes', 'processos', 'intimacoes', 'prazos', 'tarefas', 'parcelas', 'honorarios', 'usuarios', 'config', 'assinaturas', 'leads'];
  console.log('Tamanho da 1ª leitura (tudo):', (tamanho(tabs.map(t => ({ t }))) / 1024).toFixed(0), 'KB (o Supabase manda compactado: ~1/6 disso)');
  console.log('Tamanho de uma conferência sem mudanças:', (tamanho(tabs.map(t => ({ t, desde: new Date(Date.now() - 1000).toISOString() }))) / 1024).toFixed(1), 'KB');
  console.log('\nTela'.padEnd(26), '1ª vez (busca+conta)', ' depois (só a conta + conferência)', '  só a conta no navegador');
  for (const [a, d] of ROTAS) {
    let t = performance.now(); try { await B.ler(a, d); } catch (e) { console.log(a, 'volta:', e.message); continue; } const t1 = performance.now() - t;
    await new Promise(r => setTimeout(r, 1600));
    t = performance.now(); await B.ler(a, d); const t2 = performance.now() - t;
    t = performance.now(); await B.ler(a, d); const t3 = performance.now() - t; // dentro de 1,5 s: sem ida ao banco = só a conta
    // só a conta, sem banco: roda o motor puro várias vezes
    console.log(a.padEnd(26), (t1.toFixed(0) + ' ms').padStart(10), (t2.toFixed(0) + ' ms').padStart(24), (t3.toFixed(0) + ' ms').padStart(18));
  }
})();
