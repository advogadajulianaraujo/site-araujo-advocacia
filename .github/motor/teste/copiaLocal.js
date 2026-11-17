// 8.38: cópia das tabelas guardada no computador (IndexedDB criptografado). Abre o painel 2 vezes no MESMO perfil do navegador
// (como fechar e abrir o Chrome): na 2ª entrada só deve vir o que mudou, e o que mudou entre uma e outra tem que aparecer.
// Precisa de um servidor da pasta do site em http://localhost:8099 (python3 -m http.server 8099).
process.env.N = process.env.N || '300';
const T = require('./teste.js'); const { S, C, logar, assert } = T;
const { chromium } = require('playwright');
const os = require('os'), fs = require('fs'), path = require('path');
C.PropertiesService.getScriptProperties().setProperty('SUPABASE_URL', 'https://teste.supabase.co');
C.PropertiesService.getScriptProperties().deleteProperty('SUPABASE_ESCRITORIO');
S.sql('delete from painel_sessoes'); S.sql('delete from painel_cache_chaves');
C.copiarParaSupabase_(240000, true);
// como no banco de verdade: as linhas mudaram há tempo (a cópia acabou de gravar todas agora)
S.sql("set session_replication_role = replica; do $$ declare t text; begin for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = '_em' loop execute format('update %I set _em = now() - interval ''1 day''', t); end loop; end $$; set session_replication_role = origin");
let VERSAO_U1 = '0';
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil-'));
async function abrir(rotulo) {
  const tok = logar('U1', VERSAO_U1);
  const u = C.publicoUsuario_(C.tabela_('Usuarios').linhas.find(x => x.id === 'U1'));
  const ctx = await chromium.launchPersistentContext(perfil, { viewport: { width: 1300, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  const pg = ctx.pages()[0] || await ctx.newPage();
  const med = { bytes: 0, ler: 0, erros: [] };
  pg.on('pageerror', e => med.erros.push(String(e)));
  await pg.route('https://script.google.com/**', async r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const corpo = r.request().postData();
    await new Promise(x => setTimeout(x, 800));
    r.fulfill({ status: 200, contentType: 'application/json', body: C.doPost({ postData: { contents: corpo } }).getContent(), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await pg.route('https://teste.supabase.co/**', async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } });
    const x = S.postgrest(r.request().url(), { method: r.request().method(), body: r.request().postData() }, 'anon');
    if (/painel_ler/.test(r.request().url())) { med.ler++; med.bytes += x.txt.length; }
    r.fulfill({ status: x.status, contentType: 'application/json', body: x.txt, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await pg.addInitScript(([s]) => { if (!sessionStorage.getItem('painel_sessao')) sessionStorage.setItem('painel_sessao', s); }, [JSON.stringify({ token: tok, usuario: u })]);
  const t0 = Date.now();
  await pg.goto('http://localhost:8099/painel/#/tarefas');
  await pg.waitForFunction(() => document.querySelector('main, #app') && !document.querySelector('.carregando') && document.body.innerText.length > 500, null, { timeout: 60000 });
  med.ms = Date.now() - t0;
  await pg.waitForTimeout(6000); // a cópia é guardada uns segundos depois
  med.texto = await pg.evaluate(() => document.body.innerText);
  med.tabelas = await pg.evaluate(() => window.PAINEL_BANCO.estado().medidas.filter(m => m.acao === 'copia-local'));
  await ctx.close();
  console.log(`  ${rotulo}: tela em ${med.ms} ms · ${med.ler} leituras ao banco · ${(med.bytes / 1024).toFixed(0)} KB · cópia: ${JSON.stringify(med.tabelas)}`);
  return med;
}
(async () => {
  const a = await abrir('1ª entrada (sem cópia)');
  assert(!a.erros.length, '1ª entrada sem erro na página ' + a.erros.join(' | '));
  // muda uma tarefa e cria outra entre uma entrada e outra (como a equipe faz durante a noite)
  const tokA = logar('U1', VERSAO_U1);
  const r = JSON.parse(C.doPost({ postData: { contents: JSON.stringify({ acao: 'tarefas.salvar', token: tokA, dados: { tarefa: { titulo: 'Criada enquanto o navegador estava fechado', responsavel: 'admin' } } }) } }).getContent());
  assert(r.ok, 'tarefa criada fora do navegador');
  const b = await abrir('2ª entrada (com cópia)');
  assert(!b.erros.length, '2ª entrada sem erro na página ' + b.erros.join(' | '));
  assert(b.tabelas.some(m => m.fonte === 'computador'), 'a 2ª entrada leu a cópia guardada no computador');
  assert(b.bytes < a.bytes / 3, `a 2ª entrada baixou bem menos (${(b.bytes / 1024).toFixed(0)} KB × ${(a.bytes / 1024).toFixed(0)} KB)`);
  assert(b.texto.includes('Criada enquanto o navegador estava fechado'), 'o que mudou com o navegador fechado aparece');
  // senha trocada (sessao_versao sobe): a cópia antiga não abre e é baixado tudo de novo
  const tU = C.tabela_('Usuarios'), lin = tU.linhas.find(x => x.id === 'U1');
  VERSAO_U1 = String((+lin.sessao_versao || 0) + 1);
  C.atualizarLinha_(tU, lin, { sessao_versao: VERSAO_U1 }); C.sbEnviarSujas_();
  const c = await abrir('depois de trocar a senha');
  assert(!c.tabelas.some(m => m.fonte === 'computador'), 'com a senha trocada a cópia antiga não é usada');
  const chaves = S.sql("select count(*) n from painel_cache_chaves where usuario_id = 'U1'");
  console.log('  chaves guardadas para U1:', JSON.stringify(chaves));
  console.log('✓ Cópia local: tudo certo');
})().catch(e => { console.log('ERRO', e); process.exit(1); });
