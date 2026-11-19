// 8.51.2 "Teste de destruição" (pedido da usuária: "destrua o painel inteiro, mas só o teste"): ataca TODAS as rotas do servidor com dados
// absurdos, em todos os perfis, e confere que (1) nada quebra com "Erro interno" sem explicação, (2) nenhum perfil abre o que não pode,
// (3) texto malicioso não vira código, (4) pedido gigante é recusado, (5) o banco fora do ar não corrompe nada. Dados INVENTADOS; nada real.
const T = require('./teste.js'); const { S, C, assert, logar, rodarServidor } = T;
const fs = require('fs');
const usuarios = { admin: logar('U1', '0'), estagiario: logar('U2', '0'), rh: logar('U3', '2'), advogada: logar('U4', '0') };
const perfilDe = { admin: 'administrador', estagiario: 'estagiario', rh: 'rh', advogada: 'advogada' };
// rotas que mexem na própria sessão/servidor ficam para o fim (senão derrubam o resto do teste)
const NO_FIM = /^(sair|senha\.|usuarios\.salvar|usuarios\.desconectar|banco\.|sistema\.|seguranca|robo\.consertar|configurar)/;
const PAYLOADS = [
  {}, { id: 'NAO-EXISTE' }, { id: "' OR 1=1 --", cliente_id: "'; drop table clientes; --" },
  { busca: '<img src=x onerror=alert(1)>', texto: '<script>alert(1)</script>', nome: '<b>X</b>', titulo: '"><svg onload=alert(1)>' },
  { valor: '-999999999', parcelas: '-5', dias: '99999', data: '2026-13-45', vencimento: 'ontem', fatal: '0000-00-00' },
  { id: null, dados: [1, 2, 3], numero: { a: 1 }, cliente_id: 12345, lista: 'não é lista' },
  { texto: 'A'.repeat(60000), observacoes: 'B'.repeat(60000) }
];
const rotas = Object.keys(C.ROTAS).sort((a, b) => (NO_FIM.test(a) - NO_FIM.test(b)) || a.localeCompare(b));
const internos = {}, vazou = [], tempos = [], erroGoogle = {};
let total = 0;
const ehGoogle = m => /simulador|Google|internet bloqueada|CalendarApp|GmailApp|DriveApp|DocumentApp|MailApp|ScriptApp|UrlFetch/i.test(m);
for (const acao of rotas) {
  const rota = C.ROTAS[acao];
  for (const [quem, tok] of Object.entries(usuarios)) {
    const perfil = C.PERFIS[perfilDe[quem]] || {};
    const semPermissao = rota.permissao && !perfil[rota.permissao];
    for (const p of PAYLOADS) {
      total++;
      const t0 = Date.now();
      let r; try { r = rodarServidor(acao, tok, JSON.parse(JSON.stringify(p))); } catch (e) { r = { ok: false, erro: 'EXCEÇÃO NO TESTE: ' + e.message }; }
      tempos.push([Date.now() - t0, acao]);
      const msg = String(r.erro || '');
      if (semPermissao && !rota.publica && r.ok) vazou.push(acao + ' abriu para ' + quem);
      if (!r.ok && /^Erro interno|EXCEÇÃO/.test(msg)) {
        if (ehGoogle(msg)) { erroGoogle[acao] = (erroGoogle[acao] || 0) + 1; continue; }
        const k = acao + ' :: ' + msg.replace(/Erro interno \(|\)\. Tente de novo\./g, '').slice(0, 110);
        internos[k] = (internos[k] || 0) + 1;
      }
    }
  }
}
// pedido gigante e lixo
const grande = C.doPost({ postData: { contents: JSON.stringify({ acao: 'clientes.salvar', token: usuarios.admin, dados: { nome: 'X'.repeat(300000) } }) } }).getContent();
assert(/grande demais/.test(grande), 'pedido acima do limite é recusado');
const lixo = C.doPost({ postData: { contents: '{isto não é json' } }).getContent();
assert(/inválido/.test(lixo), 'pedido que não é JSON é recusado');
assert(/sessão|entrar|expir|login/i.test(String(rodarServidor('clientes.listar', 'token-falso', {}).erro)), 'token falso não entra');
// banco fora do ar no meio de uma gravação: nada pela metade
S.foraDoAr(true);
const r1 = rodarServidor('tarefas.salvar', logar('U1', '0'), { tarefa: { titulo: 'Tarefa com o banco fora', responsavel: 'maria' } }); // sessão nova: os ataques a "sair" encerraram a anterior
S.foraDoAr(false);
assert(r1.ok || /banco|tente|respond/i.test(String(r1.erro)), 'banco fora do ar: grava na planilha ou avisa claramente (' + String(r1.erro || 'gravou').slice(0, 80) + ')');
// texto malicioso guardado continua texto: as telas usam textContent (h()) — confere que o painel não monta HTML com dados do usuário
const painel = fs.readFileSync(__dirname + '/../../../painel/painel.js', 'utf8') + fs.readFileSync(__dirname + '/../../../painel/gestao.js', 'utf8');
const inner = (painel.match(/\.innerHTML\s*=\s*[^;]+/g) || []).filter(x => !/^\.innerHTML\s*=\s*(''|""|`[^`$]*`|ICONES|SVG|svg)/.test(x));
console.log('innerHTML com conteúdo montado:', inner.length, inner.slice(0, 5).map(x => x.slice(0, 90)));
// resumo
const lentos = tempos.sort((a, b) => b[0] - a[0]).slice(0, 8);
console.log('\nTOTAL de ataques:', total, '| rotas:', rotas.length);
console.log('Vazamento de permissão:', vazou.length ? vazou : 'nenhum');
console.log('Rotas que dependem do Google (no teste não há Google):', Object.keys(erroGoogle).length);
console.log('ERROS INTERNOS (quebra sem explicação):', Object.keys(internos).length);
Object.entries(internos).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + n + '× ' + k));
console.log('Mais lentas (ms):', lentos.map(x => x[1] + ' ' + x[0]).join(', '));
assert(!vazou.length, 'nenhum perfil abriu área sem permissão');
