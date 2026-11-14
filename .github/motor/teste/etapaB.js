// 8.31 Etapa B: login, senhas e Log no Supabase. As mesmas ações em dois escritórios (A = planilha; B = tudo no banco) dão o mesmo
// resultado e as mesmas planilhas; e com a PLANILHA FORA DO AR o escritório B continua entrando, lendo e gravando. Dados inventados.
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const P = C.PropertiesService.getScriptProperties();
// senhas inventadas para U1 e U2 (mesma chave secreta nos dois mundos)
const tabU = C.tabela_('Usuarios');
for (const [id, senha] of [['U1', 'senha-admin-1'], ['U2', 'senha-maria-2']]) { const l = tabU.linhas.find(x => x.id === id); const salt = 'sal-' + id; C.atualizarLinha_(tabU, l, { salt, hash: C.hashSenha_(senha, salt) }); }
C.copiarParaSupabase_(240000, true);
const GA = S.criarGoogle(); const CA = GA.ctx;
for (const [nome, sh] of G.abas) { const d = GA.aba(nome); d._d.length = 0; sh._d.forEach(l => d._d.push(l.slice())); }
CA.PropertiesService.getScriptProperties().setProperty('CHAVE_SENHAS', P.getProperty('CHAVE_SENHAS'));
const rodarA = (acao, dados, tok) => JSON.parse(CA.doPost({ postData: { contents: JSON.stringify({ acao, token: tok, dados: dados || {} }) } }).getContent());
const tok = logar('U1', '0');
let r = rodarServidor('banco.conferir', tok, { conferir: true, consertar: true }); assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'conferência');
rodarServidor('banco.conferir', tok, { principal: true });
r = rodarServidor('banco.conferir', tok, { grava: 'supabase' }); assert(r.ok, 'grava primeiro ligado');
r = rodarServidor('banco.conferir', tok, { login: 'supabase' }); assert(r.ok && r.dados.login === 'supabase', 'Etapa B ligada: login e Log no banco ' + (r.erro || ''));
assert(S.sql("select count(*) from usuarios where coalesce(hash, '') <> ''") === '2', 'as senhas embaralhadas foram para o banco');
// mesmas ações nos dois (ids/tokens em sequência)
G.ctx.Utilities.__uuid = 0; GA.ctx.Utilities.__uuid = 0;
for (const x of [G, GA]) for (const k of [...x.cache.keys()]) if (/login_falhas/.test(k)) x.cache.delete(k);
const passos = [['login', { usuario: 'admin', senha: 'senha-admin-1' }]];
for (let i = 0; i < 5; i++) passos.push(['login', { usuario: 'maria', senha: 'errada' + i }]);
passos.push(['login', { usuario: 'maria', senha: 'senha-maria-2' }]); // bloqueada
passos.push(['login', { usuario: 'ninguem', senha: 'x' }]);
const logA0 = GA.aba('Log')._d.filter(l => l.join('')).length;
const resB = [], resA = [];
for (const [a, d] of passos) { resB.push(rodarServidor(a, null, d)); resA.push(rodarA(a, d, null)); }
const iguais = resB.every((x, i) => x.ok === resA[i].ok && (x.ok || x.erro === resA[i].erro));
assert(iguais, 'login certo, 5 senhas erradas e bloqueio: mesmas respostas nos dois (' + resB.map(x => x.ok ? 'ok' : x.erro.slice(0, 18)).join(' | ') + ')');
assert(/bloqueado|Tente de novo depois/.test(resB[6].erro || ''), 'depois de 5 erros a pessoa fica bloqueada (com o banco gravando primeiro)');
const tB = resB[0].dados.token, tA = resA[0].dados.token;
const acoes = [['usuarios.salvar', { nome: 'Pessoa Inventada', usuario: 'inventada', perfil: 'estagiario', senha: 'abcd1234' }],
  ['tarefas.salvar', { tarefa: { titulo: 'Tarefa depois do login', responsavel: 'admin' } }],
  ['senha.trocar', { atual: 'senha-admin-1', nova: 'senha-nova-9' }]];
for (const [a, d] of acoes) { const b = rodarServidor(a, tB, d), x = rodarA(a, d, tA); if (b.ok !== x.ok) { console.log('✗ FALHOU', a, b.erro, x.erro); process.exitCode = 1; } }
const esp = C.sbEspelhar_(240000, true); assert(!esp.erros.length, 'cópia banco → planilha (inclusive Usuarios e Log)');
const norm = v => String(v).replace(/^'/, '').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, 'H').replace(/\d\d\/\d\d(\/\d{4})? \d\d:\d\d/g, 'H').replace(/^\d\d:\d\d$/, 'H');
for (const nome of ['Usuarios', 'Tarefas', 'Log']) {
  const a = GA.aba(nome)._d.slice(1).filter(l => l.join('')).map(l => l.map(norm).join('|')), b = G.aba(nome)._d.slice(1).filter(l => l.join('')).map(l => l.map(norm).join('|'));
  const novos = GA.aba('Log')._d.filter(l => l.join('')).length - logA0; // o que as MESMAS ações registraram
  const ok = nome === 'Log' ? novos > 5 && JSON.stringify(a.slice(-novos)) === JSON.stringify(b.slice(-novos)) : JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { const i = a.findIndex((x, k) => x !== b[k]); console.log('   A:', a[i], '\n   B:', b[i]); }
  assert(ok, nome + ': planilha igual nos dois escritórios');
}
// navegador nunca recebe a senha embaralhada
(async () => {
  const B = S.criarNavegador().PAINEL_BANCO;
  const tokN = rodarServidor('login', null, { usuario: 'admin', senha: 'senha-nova-9' }).dados.token; // a troca de senha derrubou as sessões antigas
  B.configurar(async (a, d) => { const x = rodarServidor(a, tokN, d); if (!x.ok) throw new Error(x.erro); return x.dados; });
  const ses = await B.iniciar();
  const cru = S.postgrest('https://x.supabase.test/rest/v1/rpc/painel_ler', { method: 'POST', body: JSON.stringify({ p_token: ses.token, p_pedidos: [{ t: 'usuarios' }] }) }, 'anon').txt;
  assert(!/"hash"|"salt"|sal-U1/.test(cru), 'o navegador (administração) nunca recebe hash/salt');
  // PLANILHA FORA DO AR: entra, lê e grava
  S.planilhaFora(true);
  r = rodarServidor('login', null, { usuario: 'admin', senha: 'senha-nova-9' });
  assert(r.ok, 'planilha fora: login funciona (' + (r.erro || 'ok') + ')');
  const t2 = r.ok && r.dados.token;
  r = rodarServidor('clientes.listar', t2, {}); assert(r.ok && r.dados.length >= 40, 'planilha fora: lista de clientes');
  r = rodarServidor('tarefas.salvar', t2, { tarefa: { titulo: 'Gravada com a planilha fora', responsavel: 'admin' } });
  assert(r.ok, 'planilha fora: gravar tarefa (' + (r.erro || 'ok') + ')');
  assert(S.sql("select count(*) from tarefas where titulo='Gravada com a planilha fora'") === '1', 'a tarefa está no banco');
  r = rodarServidor('prazos.listar', t2, {}); assert(r.ok, 'planilha fora: intimações e prazos');
  S.planilhaFora(false);
  // desligar a Etapa B: volta tudo para a planilha
  r = rodarServidor('banco.conferir', t2, { login: 'planilha' }); assert(r.ok && r.dados.login === 'planilha', 'Etapa B desligada (copiou do banco)');
  assert(G.aba('Usuarios')._d.some(l => l[1] === 'inventada'), 'a pessoa criada no banco está na planilha depois de desligar');
  r = rodarServidor('login', null, { usuario: 'admin', senha: 'senha-nova-9' }); assert(r.ok, 'depois de desligar, o login lê da planilha e funciona');
  r = rodarServidor('banco.conferir', r.dados.token, { conferir: true }); assert(r.ok && r.dados.resumo.iguais === r.dados.resumo.abas, 'no fim: planilha = banco (' + (r.ok ? r.dados.resumo.diferentes.join(',') : r.erro) + ')');
})();
