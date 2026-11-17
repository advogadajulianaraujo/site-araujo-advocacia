// 8.35: a Agenda do Google copiada para o banco (AgendaEventos). Agenda, Audiências e os blocos do Início calculados no navegador e
// na função do Supabase a partir da cópia devem dar EXATAMENTE o que o Apps Script dá lendo o Google. Google Agenda simulado; dados INVENTADOS.
import { createRequire } from 'node:module'; import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, G, assert, logar, rodarServidor } = T;
const { criarServidor } = await import('../../../supabase/functions/painel/servidor.js');
const P = C.PropertiesService.getScriptProperties();
// ---------- Google Agenda de mentira ----------
const IDS = { 'ATENDIMENTOS': 'cal-at', 'AUDIÊNCIA CONCILIAÇÃO': 'cal-con', 'AUDIÊNCIA INSTRUÇÃO': 'cal-ins', 'PERÍCIAS': 'cal-per' };
const hora = (n, h, m) => new Date(T.dia(n) + 'T' + String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ':00-03:00');
const proc = C.tabela_('Processos').linhas;
let evs = [];
const novo = (cal, id, titulo, ini, fim, extra) => evs.push(Object.assign({ cal, id, titulo, ini, fim, desc: '', local: '', diaTodo: false }, extra || {}));
novo('cal-con', 'e1', 'Audiência de conciliação ' + proc[1].numero, hora(2, 14, 30), hora(2, 15, 30), { local: 'Sala 3', desc: '<b>Online</b> pelo link' });
novo('cal-ins', 'e2', 'Instrução — ' + proc[2].numero, hora(9, 9), hora(9, 11));
novo('cal-per', 'e3', 'Perícia médica', new Date(T.dia(5) + 'T00:00:00-03:00'), new Date(T.dia(6) + 'T00:00:00-03:00'), { diaTodo: true, desc: 'Processo ' + proc[4].numero });
novo('cal-con', 'e4', 'Conciliação sem número', hora(40, 10), hora(40, 11));
novo('cal-at', 'e5', 'Atendimento Cliente Novo', hora(1, 16), hora(1, 17));
novo('cal-at', 'e6', 'Viagem (atravessa o mês)', hora(-3, 8), hora(45, 18));
novo('cal-per', 'e7', 'Perícia passada', hora(-20, 8), hora(-20, 9));
novo('cal-ins', 'e8', 'Instrução daqui a 80 dias ' + proc[5].numero, hora(80, 13), hora(80, 15));
const embrulho = e => ({ getId: () => e.id, getTitle: () => e.titulo, getLocation: () => e.local, getDescription: () => e.desc, isAllDayEvent: () => e.diaTodo,
  getStartTime: () => e.ini, getEndTime: () => e.fim, getAllDayStartDate: () => e.ini });
const cal = id => ({ getId: () => id, getTimeZone: () => 'America/Sao_Paulo',
  getEvents: (a, b) => evs.filter(e => e.cal === id && e.fim > a && e.ini < b).sort((x, y) => x.ini - y.ini).map(embrulho) });
let leiturasGoogle = 0;
C.CalendarApp = { getCalendarById: id => { leiturasGoogle++; return cal(id); }, getCalendarsByName: n => IDS[n] ? [cal(IDS[n])] : [], Color: {} };
C.setConfig_('AGENDAS', JSON.stringify(IDS), 'teste');
const limpar = () => { for (const k of [...G.cache.keys()]) if (!k.startsWith('sessao_') && !k.startsWith('usr_')) G.cache.delete(k); };
const copiar = () => { limpar(); C.aquecerAgenda_(); C.sbEnviarSujas_(); };
// ---------- 1) cópia ----------
copiar();
const nCopia = +S.sql('select count(*) from agenda_eventos');
assert(nCopia === 8, 'cópia no banco: 8 eventos do mês passado até 3 meses à frente, sem repetir o que atravessa o mês (' + nCopia + ')');
const marca = JSON.parse(C.config_('AGENDA_COPIA'));
assert(marca.meses.length === 5 && !!marca.em, 'marca da cópia com os 5 meses (' + marca.meses.join(', ') + ')');
// ---------- 2) navegador (motor) × Apps Script (Google) ----------
const difs = (a, b) => JSON.stringify(a) === JSON.stringify(b) ? '' : JSON.stringify(a).slice(0, 300) + '\n   ≠ ' + JSON.stringify(b).slice(0, 300);
const ROTAS = [['agenda.listar', { inicio: T.dia(-5), fim: T.dia(30) }], ['agenda.listar', { inicio: T.dia(20), fim: T.dia(50) }], ['audiencias.listar', { dias: 90 }],
  ['audiencias.listar', {}], ['inicio.acoes', {}], ['inicio.extras', { dia: T.dia(0) }]];
for (const [uid, ver, nome] of [['U1', '0', 'administrador'], ['U2', '0', 'estagiário'], ['U3', '2', 'RH'], ['U4', '0', 'advogada']]) {
  const tok = logar(uid, ver), B = S.criarNavegador();
  B.PAINEL_BANCO.configurar(async (a, d) => { const r = rodarServidor(a, tok, d); if (!r.ok) throw new Error(r.erro); return r.dados; });
  await B.PAINEL_BANCO.iniciar();
  let iguais = 0;
  for (const [a, d] of ROTAS) {
    limpar(); const g = rodarServidor(a, tok, d);
    let n, erro = null; try { n = await B.PAINEL_BANCO.ler(a, d); } catch (e) { erro = e; }
    if (!g.ok) { if (erro) iguais++; else console.log('   ', a, 'servidor recusou:', g.erro); continue; } // rota que o perfil não pode: os dois recusam
    if (erro) { console.log('✗ FALHOU', nome, a, 'navegador voltou ao Google:', erro.message); process.exitCode = 1; continue; }
    const x = difs(n, g.dados); if (x) { console.log('✗ FALHOU', nome, a, JSON.stringify(d), '\n  ', x); process.exitCode = 1; } else iguais++;
  }
  assert(iguais === ROTAS.length, `${nome}: Agenda, Audiências e Início pelo navegador iguais ao Google (${iguais}/${ROTAS.length})`);
}
const tokA = logar('U1', '0'), B = S.criarNavegador();
B.PAINEL_BANCO.configurar(async (a, d) => { const r = rodarServidor(a, tokA, d); if (!r.ok) throw new Error(r.erro); return r.dados; });
await B.PAINEL_BANCO.iniciar();
const espera = () => new Promise(ok => setTimeout(ok, 1700)); // o navegador reconfere uma tabela lida há mais de 1,5 s
const lerN = async (a, d) => { await espera(); try { if (B.PAINEL_BANCO.envelhecer) B.PAINEL_BANCO.envelhecer(); return await B.PAINEL_BANCO.ler(a, d); } catch (e) { return { voltou: e.message }; } };
let r = await lerN('agenda.listar', { inicio: T.dia(0), fim: T.dia(10) });
assert(r.eventos && r.eventos.some(e => e.id === 'e3' && e.diaTodo && e.dia === T.dia(5)), 'perícia de dia inteiro aparece no dia certo');
r = await lerN('audiencias.listar', { dias: 90 });
assert(r.lista && r.lista.some(a => a.numero === proc[1].numero && a.hora === '14:30' && a.tipo === 'conciliacao') && r.lista.some(a => a.tipo === 'instrucao' && a.data === T.dia(80)),
  'audiências: conciliação 14h30 com o nº do processo e instrução daqui a 80 dias');
// ---------- 3) mudanças ----------
r = await lerN('agenda.listar', { inicio: T.dia(0), fim: T.dia(10), atualizar: true });
assert(r.voltou, '"↻" (atualizar) vai ao Google na hora');
C.mudouAgenda_(); C.sbEnviarSujas_();
r = await lerN('agenda.listar', { inicio: T.dia(0), fim: T.dia(10) });
assert(r.voltou, 'mudança feita pelo painel: até refazer a cópia, a Agenda vem do Google (nunca mostra agenda velha)');
evs = evs.filter(e => e.id !== 'e5'); evs.find(e => e.id === 'e1').ini = hora(2, 16); evs.find(e => e.id === 'e1').fim = hora(2, 17);
novo('cal-ins', 'e9', 'Instrução nova ' + proc[7].numero, hora(12, 9), hora(12, 10));
copiar();
r = await lerN('agenda.listar', { inicio: T.dia(-1), fim: T.dia(20) });
assert(r.eventos && !r.eventos.some(e => e.id === 'e5') && r.eventos.find(e => e.id === 'e1').inicio.endsWith('16:00') && r.eventos.some(e => e.id === 'e9'),
  'depois da cópia: evento apagado some, horário mudado e evento novo aparecem');
assert(+S.sql('select count(*) from agenda_eventos') === 8, 'a cópia apaga o que saiu do Google');
const m = JSON.parse(C.config_('AGENDA_COPIA')); m.em = new Date(Date.now() - 4 * 3600000).toISOString();
C.setConfig_('AGENDA_COPIA', JSON.stringify(m), 'teste'); C.sbEnviarSujas_();
r = await lerN('agenda.listar', { inicio: T.dia(0), fim: T.dia(10) });
assert(r.voltou, 'cópia com mais de 3 h (robô parado): a Agenda vem do Google');
copiar();
r = await lerN('agenda.listar', { inicio: T.dia(150), fim: T.dia(160) });
assert(r.voltou, 'mês que não está na cópia (daqui a 5 meses): vem do Google');
// o robô continua lendo o Google na hora (não a memória de 10 min)
limpar(); C.eventosDoMes_(T.dia(0).slice(0, 7)); leiturasGoogle = 0;
C.atosDaAgenda_(T.dia(0), T.dia(10), C.tabela_('Eventos'), true);
assert(leiturasGoogle > 0, 'o robô dos avisos de audiência lê o Google na hora');
// ---------- 4) a função do Supabase também lê a cópia ----------
async function rpc(nome, args) {
  const x = S.postgrest('https://x.supabase.test/rest/v1/rpc/' + nome, { method: 'POST', payload: JSON.stringify(args) }, null);
  let j = null; try { j = x.txt ? JSON.parse(x.txt) : null; } catch (e) {}
  if (x.status >= 300) { const e = new Error(j && j.message || 'erro'); e.codigo = j && j.code; throw e; }
  return j;
}
const SV = criarServidor({ rpc, base: { url: 'https://x.supabase.test', createHash: crypto.createHash, createHmac: crypto.createHmac, randomUUID: crypto.randomUUID, b64: (u, w) => Buffer.from(u).toString(w ? 'base64url' : 'base64') } });
C.sbEstado_('edge', 'sim'); C.sbEstado_('asaas', 'nao');
const ses = rodarServidor('banco.sessao', logar('U1', '0'), {}).dados;
for (const [a, d] of ROTAS) {
  limpar(); const g = rodarServidor(a, tokA, d), e = await SV.atender({ token: ses.token, acao: a, dados: d, versao: C.VERSAO });
  const x = e.voltar ? 'voltou: ' + e.motivo : difs(e.dados, g.dados);
  assert(!x, 'função do Supabase: ' + a + ' ' + JSON.stringify(d) + ' igual ao Google ' + (x ? '\n   ' + x : ''));
}
console.log(process.exitCode ? '✗ HOUVE FALHAS' : '✓ Agenda no banco: tudo certo');
