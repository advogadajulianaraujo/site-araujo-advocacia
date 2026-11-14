process.env.N = process.env.N || '300';
const T = require('./teste.js'); const { S, C, logar } = T;
const { chromium } = require('playwright');
C.PropertiesService.getScriptProperties().setProperty('SUPABASE_URL', 'https://teste.supabase.co');
C.PropertiesService.getScriptProperties().deleteProperty('SUPABASE_ESCRITORIO');
S.sql('delete from painel_sessoes'); 
C.copiarParaSupabase_(240000, true);
(async () => {
  const tok = logar('U1', '0');
  const u = C.publicoUsuario_(C.tabela_('Usuarios').linhas.find(x => x.id === 'U1'));
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const google = [], banco = [], erros = [];
  pg.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', e => erros.push(String(e)));
  await pg.route('https://script.google.com/**', async r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const corpo = r.request().postData(); const j = JSON.parse(corpo);
    google.push(j.acao === 'lote' ? 'lote[' + j.dados.pedidos.map(p => p.acao).join(',') + ']' : j.acao);
    await new Promise(x => setTimeout(x, 1500)); // o Apps Script de verdade leva 2 a 9 s
    const out = C.doPost({ postData: { contents: corpo } }).getContent();
    r.fulfill({ status: 200, contentType: 'application/json', body: out, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await pg.route('https://teste.supabase.co/**', async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } });
    banco.push(r.request().url().replace(/.*rest\/v1\//, ''));
    const x = S.postgrest(r.request().url(), { method: r.request().method(), body: r.request().postData() }, 'anon');
    r.fulfill({ status: x.status, contentType: 'application/json', body: x.txt, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await pg.addInitScript(([s]) => { if (!sessionStorage.getItem('painel_sessao')) sessionStorage.setItem('painel_sessao', s); }, [JSON.stringify({ token: tok, usuario: u })]);
  await pg.goto('http://localhost:8099/painel/#/inicio');
  await pg.waitForTimeout(9000);
  const g0 = google.length, b0 = banco.length;
  for (const tela of ['#/clientes', '#/processos', '#/prazos', '#/tarefas', '#/financeiro']) {
    const g1 = google.slice(); const t = Date.now();
    await pg.evaluate(h => { location.hash = h; }, tela);
    await pg.waitForFunction(() => !document.querySelector('.carregando'), null, { timeout: 30000 }).catch(() => {});
    const ms = Date.now() - t;
    await pg.waitForTimeout(2500);
    console.log(tela.padEnd(14), 'abriu em', ms, 'ms · pedidos ao Google nesta tela:', google.slice(g1.length).join(' ') || 'nenhum');
  }
  await pg.screenshot({ path: require('os').tmpdir() + '/painel-clientes.png' });
  await pg.evaluate(() => { location.hash = '#/usuarios'; });
  await pg.waitForSelector('text=Velocidade: banco novo', { timeout: 30000 });
  await pg.click('text=Medir agora');
  await pg.waitForSelector('text=Medir de novo', { timeout: 120000 });
  const tab = await pg.$$eval('.banco-caixa table', ts => ts.map(t => t.innerText).join('\n---\n'));
  console.log('\nCaixa do banco novo:\n' + tab);
  await pg.locator('.banco-caixa').screenshot({ path: require('os').tmpdir() + '/painel-caixa-banco.png' });
  console.log('\nidas ao banco:', banco.length, '· erros no console:', erros.filter(e => !/favicon/.test(e)).slice(0, 5));
  await b.close();
})().catch(e => { console.log('ERRO', e); process.exit(1); });
