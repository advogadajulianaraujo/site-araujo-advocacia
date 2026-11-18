// 8.43: sem "prazo provisório" — o painel descobre o ato pelo texto da publicação (DJEN) e pelo DataJud; dados inventados.
const T = require('./teste.js'); const { C, assert } = T;
const proc = { numero: '0000001-11.2026.5.12.0006', tribunal: 'TRT12' };
const pre = 'PODER JUDICIARIO JUSTICA DO TRABALHO 1ª VARA DO TRABALHO RECLAMANTE: FULANO RECLAMADO: EMPRESA X LTDA INTIMAÇÃO ';
let s = C.sugerirPrazo_(pre + 'Fica V. Sa. intimado para tomar ciência do despacho ID abc123 proferido nos autos. Cite-se a parte ré para que apresente defesa no prazo de quinze dias (art. 42). Tubarão.', proc, 'TRT12');
assert(!s.provisorio && s.dias === 5 && /Despacho/.test(s.descricao), 'prazo da OUTRA parte (defesa em 15 dias) não vira o nosso: ciência do despacho = 5 dias (' + s.descricao + ')');
s = C.sugerirPrazo_(pre + 'Fica V. Sa. intimado(a) para manifestar-se, no prazo de dez dias, acerca da contestação e dos documentos juntados pela parte contrária.', proc, 'TRT12');
assert(s.dias === 10 && !s.provisorio, 'prazo por extenso ("dez dias") é lido');
s = C.sugerirPrazo_(pre + 'Fica V. Sa. intimado(a) para em 15 (quinze) dias, manifestar-se acerca das defesas e dos documentos a elas acostados.', proc, 'TRT12');
assert(s.dias === 15, '"para em 15 (quinze) dias" é lido');
s = C.sugerirPrazo_(pre + 'Fica V. Sa. intimado para tomar ciência da sentença ID 99 proferida nos autos, cujo dispositivo: julgo parcialmente procedentes os pedidos. ' + 'x '.repeat(60), proc, 'TRT12');
assert(s.dias === 8 && /Sentença/.test(s.descricao), 'ciência da sentença no TRT = recurso ordinário 8 dias');
s = C.sugerirPrazo_('CUMPRIMENTO DE SENTENÇA Nº 5000001-11.2026.8.24.0075/SC EXEQUENTE: FULANO ADVOGADO(A): JULIAN ATO ORDINATÓRIO Fica a parte intimada para, no prazo de 5 (cinco) dias, informar os dados bancários. ' + 'y '.repeat(60), { numero: '5000001-11.2026.8.24.0075' }, 'TJSC');
assert(s.dias === 5 && !/Sentença/.test(s.descricao), '"cumprimento de sentença" (classe) não vira sentença');
s = C.sugerirPrazo_('AREsp 1/SC RELATOR: MINISTRO PRESIDENTE AGRAVANTE: FULANA ADVOGADOS: JULIAN Processo distribuído pelo sistema automático em 16/11/2026. ' + 'z '.repeat(60), {}, 'STJ');
assert(s.semPrazo, 'aviso de distribuição não abre prazo');
s = C.sugerirPrazo_('Expedida/certificada a intimação eletrônica', {}, 'TJSC');
assert(s.provisorio && /ATO NÃO IDENTIFICADO/.test(s.descricao), 'sem o texto do ato: ATO NÃO IDENTIFICADO (data de segurança)');
// robô que identifica: provisório aberto + publicação com texto no DJEN 2 dias depois → prazo do texto, data recalculada, anotado
const tabZ = C.tabela_('Prazos'), tabI = C.tabela_('Intimacoes');
const num = tabZ.linhas[0].numero, hoje = C.hojeSP_();
const iz = { id: 'I843a', chave: 'teste843a', fonte: 'PJe TRT12', recebido_em: new Date().toISOString(), numero: num, movimento: 'Notificação', texto: '', criado_em: new Date().toISOString() };
C.inserirLinha_(tabI, iz);
const z = { id: 'Z843', processo_id: tabZ.linhas[0].processo_id, numero: num, intimacao_id: 'I843a', descricao: 'PROVISÓRIO: 5 dias (prazo mínimo) — o aviso não informa o ato; abrir no sistema e conferir', dias: '5', contagem: 'uteis', ciencia: hoje, fatal: hoje, situacao: 'calculado', origem: 'robô', observacoes: 'PJe: aviso', criado_em: new Date().toISOString() };
C.inserirLinha_(tabZ, z);
C.inserirLinha_(tabI, { id: 'I843b', chave: 'teste843b', fonte: 'DJEN', recebido_em: new Date().toISOString(), numero: num, movimento: 'Intimação', texto: pre + 'Fica V. Sa. intimado(a) a apresentar manifestação acerca da contestação, no prazo de dez dias contados da ciência. ' + 'w '.repeat(40), criado_em: new Date().toISOString() });
const r = C.identificarProvisorios_();
const z2 = C.tabela_('Prazos').linhas.find(x => x.id === 'Z843');
assert(r.feitos >= 1 && z2.dias === '10' && !/PROVIS/.test(z2.descricao) && z2.fatal > hoje && /identificado pelo texto/.test(z2.observacoes), 'robô identificou o ato pelo DJEN: 10 dias, data nova e anotado (' + z2.descricao.slice(0, 60) + ')');
// 8.44: vencido com petição juntada depois do aviso → cumprido; só ciência → sem prazo; nada → sem comprovação (com marca para reabrir)
const ont = C.somarDias_(C.hojeSP_(), -3), ant = C.somarDias_(C.hojeSP_(), -9);
const tz2 = C.tabela_('Prazos'), ti2 = C.tabela_('Intimacoes');
const nums = tz2.linhas.slice(10, 13).map(z => z.numero);
[['I844a', 'Z844a', nums[0], 'Juntada a petição de Manifestação'], ['I844b', 'Z844b', nums[1], 'Expedido(a) intimação'], ['I844c', 'Z844c', nums[2], 'Expedido(a) intimação']].forEach(([iid, zid, num, mov], k) => {
  C.inserirLinha_(ti2, { id: iid, chave: iid, fonte: 'PJe TRT12', recebido_em: ant + 'T12:00:00Z', numero: num, movimento: 'Expedido(a) intimação', texto: '', criado_em: new Date().toISOString() });
  C.inserirLinha_(tz2, { id: zid, processo_id: '', numero: num, intimacao_id: iid, descricao: k === 1 ? 'Perícia marcada: ciência (5 dias)' : 'Prazo de 5 dias indicado na intimação', dias: '5', contagem: 'uteis', ciencia: ant, fatal: ont, situacao: 'calculado', origem: 'robô', observacoes: 'PJe: aviso', criado_em: new Date().toISOString() });
  if (k === 0) C.inserirLinha_(ti2, { id: 'I844j', chave: 'I844j', fonte: 'PJe TRT12', recebido_em: C.somarDias_(ant, 2) + 'T12:00:00Z', numero: num, movimento: mov, texto: '', criado_em: new Date().toISOString() });
});
const rv = C.baixarVencidos844_(); const zz = id => C.tabela_('Prazos').linhas.find(x => x.id === id);
assert(zz('Z844a').situacao === 'cumprido' && /petição juntada/.test(zz('Z844a').cumprido_por), 'vencido com petição juntada depois do aviso → cumprido (vai para o OK)');
assert(zz('Z844b').situacao === 'cancelado' && /só para ciência/.test(zz('Z844b').observacoes), 'vencido que era só ciência → sem prazo');
assert(zz('Z844c').situacao === 'cumprido' && /sem comprovação/.test(zz('Z844c').cumprido_por) && zz('Z844c').ok_em, 'vencido sem nada → baixa "sem comprovação" (lista para reabrir), fora do OK');
// 8.44.2: reaberto pela equipe NÃO é retirado de novo; o robô de 10 em 10 min só trabalha quando há vencido
C.mudarSituacaoPrazo_({ id: 'Z844c', situacao: 'reabrir' }, { usuario: 'admin', nome: 'Admin' });
assert(zz('Z844c').situacao === 'calculado', 'prazo reaberto volta a ficar aberto');
assert(C.vencidosRapido_() === 0 && zz('Z844c').situacao === 'calculado', 'robô não retira de novo o prazo que a equipe reabriu');
C.inserirLinha_(C.tabela_('Prazos'), { id: 'Z844d', processo_id: '', numero: nums[2], intimacao_id: 'I844c', descricao: 'Prazo de 5 dias indicado na intimação', dias: '5', contagem: 'uteis', ciencia: ant, fatal: ont, situacao: 'calculado', origem: 'robô', observacoes: 'PJe: aviso', criado_em: new Date().toISOString() });
const rr = C.vencidosRapido_();
assert(rr && rr.sem === 1 && zz('Z844d').situacao === 'cumprido', 'robô de 10 em 10 min retira o vencido novo');
// 8.44.3: audiência que já aconteceu sai da lista (não é prazo); a de amanhã continua
C.inserirLinha_(C.tabela_('Prazos'), { id: 'Z844e', processo_id: '', numero: nums[0], intimacao_id: '', descricao: 'Audiência em ontem: preparar audiência', dias: '0', contagem: 'uteis', ciencia: '', fatal: C.somarDias_(C.hojeSP_(), -1), situacao: 'calculado', origem: 'robô', observacoes: 'ato:audiência de instrução | DJEN', criado_em: new Date().toISOString() });
C.inserirLinha_(C.tabela_('Prazos'), { id: 'Z844f', processo_id: '', numero: nums[0], intimacao_id: '', descricao: 'Audiência amanhã', dias: '0', contagem: 'uteis', ciencia: '', fatal: C.somarDias_(C.hojeSP_(), 1), situacao: 'calculado', origem: 'robô', observacoes: 'ato:audiência de conciliação | DJEN', criado_em: new Date().toISOString() });
const ra = C.vencidosRapido_();
assert(ra && ra.atos === 1 && zz('Z844e').situacao === 'cumprido' && zz('Z844e').ok_em, 'audiência de ontem sai da lista (sem ir para o OK)');
assert(zz('Z844f').situacao === 'calculado', 'audiência de amanhã continua');
console.log("fim");
// 8.47: acordo fechado na audiência (R$ 1.000 em 2x, 30%) → honorário no Financeiro; PIX de R$ 500 no dia combinado dá baixa nos R$ 150 e cria o repasse
{
  const proc = C.tabela_('Processos').linhas.find(p => p.numero && p.cliente_id), hoje = C.hojeSP_();
  const admin = { usuario: 'admin', nome: 'Admin', perfil: 'administrador' };
  const r = C.audienciaResultado_({ lembrete: 'E:teste847', numero: proc.numero, data: C.somarDias_(hoje, -1), hora: '14:00', tipo: 'conciliacao', resultado: 'acordo', valor: '1.000,00', pct: '30', parcelas: '2', primeiro: hoje, lancar: true }, admin);
  const hon = C.tabela_('Honorarios').linhas.find(x => x.id === r.honorario_id);
  const parc = C.tabela_('Parcelas').linhas.filter(p => p.honorario_id === r.honorario_id);
  assert(hon && /\[acordo:1000\|2\|30\]/.test(hon.observacoes) && parc.length === 2 && parc.every(p => Math.abs(C.dinheiro_(p.valor) - 150) < 0.01), 'acordo de R$ 1.000 em 2x → honorário de 30% em 2 parcelas de R$ 150');
  const k = { clientes: C.tabela_('Clientes').linhas, tabParc: C.tabela_('Parcelas'), apelidos: {}, pagasPeloPix: {}, tol: 10, categorias: {} };
  const linha = { situacao: 'a conferir', cliente_id: '', parcela_id: '', motivo: '', sugestao: '', recibo: '', categoria: '' };
  const ok = C.classificarPix_(linha, { valor: 500, pagador: 'EMPRESA QUALQUER LTDA' }, new Date(), k);
  const p1 = C.tabela_('Parcelas').linhas.find(p => p.id === linha.parcela_id);
  assert(ok && linha.situacao === 'baixado' && p1 && p1.pago_em && /REPASSAR R\$ 350/.test(linha.motivo), 'PIX de R$ 500 (parcela do acordo) dá baixa sozinho nos R$ 150 e avisa o repasse de R$ 350');
  assert(C.tabela_('Tarefas').linhas.some(t => /\[repasse:/.test(t.descricao || '') && /350/.test(t.titulo)), 'tarefa "Repassar R$ 350 ao cliente" criada');
  const linha2 = { situacao: 'a conferir', cliente_id: '', parcela_id: '', motivo: '', sugestao: '', recibo: '', categoria: '' };
  const k2 = Object.assign({}, k, { tabParc: C.tabela_('Parcelas'), pagasPeloPix: { [linha.parcela_id]: 1 } });
  C.classificarPix_(linha2, { valor: 500, pagador: 'EMPRESA QUALQUER LTDA' }, new Date(), k2);
  assert(linha2.situacao !== 'baixado' || linha2.parcela_id !== linha.parcela_id, 'o mesmo PIX não baixa a mesma parcela duas vezes');
}
console.log("fim 847");
// 8.48: audiência só no "próximo ato" do processo (importada do sistema antigo) entra na agenda + tarefa do horário; não repete
{
  const hoje = C.hojeSP_(), d = C.somarDias_(hoje, 3), d2 = C.somarDias_(hoje, 5);
  const tp = C.tabela_('Processos'), cli = C.tabela_('Clientes').linhas[0];
  C.inserirLinha_(tp, { id: 'P848a', cliente_id: cli.id, numero: '5005562-20.2026.8.24.0075', proximo_ato: 'Instrução', proximo_ato_data: d, area: 'Cível', status: 'ativo', fase: 'andamento', criado_em: new Date().toISOString() });
  C.inserirLinha_(tp, { id: 'P848b', cliente_id: cli.id, numero: '0000999-11.2026.5.12.0041', proximo_ato: 'Conciliação 14h30', proximo_ato_data: d2, area: 'Trabalhista', status: 'ativo', fase: 'andamento', criado_em: new Date().toISOString() });
  const n1 = C.atosDoProximoAto_(400);
  const ev = C.tabela_('Eventos').linhas;
  const ea = ev.find(e => e.numero === '5005562-20.2026.8.24.0075'), eb = ev.find(e => e.numero === '0000999-11.2026.5.12.0041');
  assert(n1 >= 2 && ea && /instru/.test(ea.tipo) && ea.data === d && eb && /concilia/.test(eb.tipo) && eb.hora === '14:30', 'audiências que estavam só no próximo ato entram na agenda (instrução sem hora; conciliação 14:30)');
  assert(C.tabela_('Tarefas').linhas.some(t => /Conferir o HORÁRIO/.test(t.titulo) && (t.descricao || '').indexOf('[horaato:5005562-20.2026.8.24.0075:') >= 0), 'sem horário → tarefa "Conferir o HORÁRIO"');
  assert(!C.tabela_('Tarefas').linhas.some(t => (t.descricao || '').indexOf('[horaato:0000999-11.2026.5.12.0041:') >= 0), 'com horário → sem tarefa de horário');
  const antes = C.tabela_('Eventos').linhas.length;
  assert(C.atosDoProximoAto_(400) === 0 && C.atosDoProximoAtoRapido_() === 0 && C.tabela_('Eventos').linhas.length === antes, 'segunda rodada não repete');
  assert(C.nomeNoTitulo_('Audiência conciliatória — João Maria Ferreira dos Santos', 'JOÃO MARIA FERREIRA DOS SANTOS') && !C.nomeNoTitulo_('Audiência — João Pedro Silva', 'João Maria Ferreira'), 'nome do cliente no título do evento lançado à mão é reconhecido');
}
console.log("fim 848");
// 8.48: aviso do tribunal aberto / apagado no Gmail → marcado na intimação (nunca dá baixa no prazo)
{
  const ti = C.tabela_('Intimacoes'), hoje = C.hojeSP_(), rec = new Date().toISOString();
  C.inserirLinha_(ti, { id: 'IGM1', chave: 'gm1', fonte: 'PJe TRT12', recebido_em: rec, numero: '0000111-11.2026.5.12.0041', movimento: 'x', texto: '', gmail_id: 'MSG1', criado_em: rec });
  C.inserirLinha_(ti, { id: 'IGM2', chave: 'gm2', fonte: 'PJe TRT12', recebido_em: rec, numero: '0000222-22.2026.5.12.0041', movimento: 'x', texto: '', gmail_id: 'MSG2', criado_em: rec });
  C.inserirLinha_(ti, { id: 'IGM3', chave: 'gm3', fonte: 'PJe TRT12', recebido_em: rec, numero: '0000333-33.2026.5.12.0041', movimento: 'x', texto: '', gmail_id: '', criado_em: rec });
  const msg = (id, sub, lido, lixo) => ({ getId: () => id, getSubject: () => sub, getDate: () => new Date(rec), isUnread: () => !lido, isInTrash: () => lixo });
  const antigo = C.GmailApp;
  C.GmailApp = { search: q => /(^|\s)in:trash/.test(q) ? [['t2']] : [['t1']], getMessagesForThreads: th => th.map(t => t[0] === 't2' ? [msg('MSG2', 'x', true, true)] : [msg('MSG1', 'x', true, false), msg('MSGX', '[TRT12] Processo 0000333-33.2026.5.12.0041', true, false)]) };
  let n; try { n = C.gmailSituacao_(); } catch (e) { console.log("erro gmail:", e.message); } finally { C.GmailApp = antigo; }
  const g = id => C.tabela_('Intimacoes').linhas.find(x => x.id === id);
  assert(n === 3 && g('IGM1').gmail_lido_em && !g('IGM1').gmail_apagado_em && g('IGM2').gmail_apagado_em && g('IGM3').gmail_lido_em, 'Gmail: aberto, apagado e o antigo (sem id) achado pelo nº do processo no assunto');
}
console.log("fim gmail");
