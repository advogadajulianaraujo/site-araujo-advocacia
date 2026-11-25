// 8.60: eproc pelo Painel do Advogado — prazos em aberto (data final do eproc), aguardando abertura (dias do eproc), audiências e pauta.
// Dados INVENTADOS (o repositório é público).
const T = require('./teste.js'); const { C, assert, add, dia } = T;
const N = k => '50000' + k + '0-11.2026.8.24.0075';
add('Processos', ['a', 'b', 'c', 'd'].map((k, i) => ({ id: 'P860' + k, numero: N(i + 1), tribunal: 'TJSC', sistema: 'eproc', status: 'ativo', area: 'Cível', responsavel: 'ana', criado_em: new Date().toISOString() })));
add('Prazos', [
  { id: 'Z860a', processo_id: 'P860a', numero: N(1), descricao: 'ATO NÃO IDENTIFICADO (PROVISÓRIO): Expedida/certificada a intimação eletrônica', dias: '5', contagem: 'uteis', ciencia: dia(-5), fatal: dia(2), situacao: 'calculado', origem: 'robô', observacoes: 'eproc TJSC: aviso', criado_em: new Date().toISOString() },
  { id: 'Z860b', processo_id: 'P860b', numero: N(2), descricao: 'Manifestação', dias: '15', contagem: 'uteis', ciencia: dia(-20), fatal: dia(1), situacao: 'cumprido', origem: 'robô', observacoes: 'feito', criado_em: new Date().toISOString() },
  { id: 'Z860d', processo_id: 'P860d', numero: N(4), intimacao_id: 'I860d', descricao: 'ATO NÃO IDENTIFICADO (PROVISÓRIO): intimação', dias: '5', contagem: 'uteis', ciencia: dia(9), fatal: dia(16), situacao: 'calculado', origem: 'robô', observacoes: 'eproc TJSC: aviso', criado_em: new Date().toISOString() }]);
add('Intimacoes', [{ id: 'I860d', chave: 'mail860d', fonte: 'eproc TJSC', recebido_em: dia(-1) + 'T15:00:00.000Z', numero: N(4), movimento: 'Expedida/certificada a intimação eletrônica', processo_id: 'P860d', prazo_id: 'Z860d', criado_em: new Date().toISOString() }]);

const conta = { chave: 'ssotjsc', sigla: 'TJSC', ok: true, contagens: {},
  prazos: [
    { numero: N(1), grau: '1º grau', evento: 'Expedida/certificada a intimação eletrônica - Despacho/Decisão', dias: 30, corridos: false, envio: dia(-9) + ' 16:31', inicio: dia(-6), fim: dia(20), cliente: '' },
    { numero: N(2), grau: '1º grau', evento: 'Expedida/certificada a intimação eletrônica', dias: 15, corridos: false, envio: dia(-22) + ' 10:00', inicio: dia(-19), fim: dia(1), cliente: '' },
    { numero: N(3), grau: '2º grau', evento: 'Expedida/certificada a intimação eletrônica - Acórdão', dias: 15, corridos: false, envio: dia(-4) + ' 09:00', inicio: dia(-2), fim: dia(18), cliente: '' }],
  pendentes: [
    { numero: N(4), grau: '1º grau', evento: 'Expedida/certificada a intimação eletrônica - Sentença', dias: 15, corridos: false, envio: dia(-1) + ' 13:19', cliente: '' },
    { numero: N(4), grau: '1º grau', evento: 'Expedida/certificada a intimação eletrônica - Sentença', dias: 15, corridos: false, envio: dia(-1) + ' 13:19', cliente: '' },
    { numero: N(5), grau: '1º grau', evento: 'Expedida/certificada a intimação eletrônica - Sentença', dias: 15, corridos: false, envio: dia(0) + ' 18:16', cliente: 'Fulano Inventado',
      classe: 'Procedimento Comum Cível', assunto: 'Indenização por Dano Moral', partes: 'Autor FULANO INVENTADO × Réu EMPRESA FICTÍCIA LTDA', vara: '1ª Vara Cível da Comarca de Teste' }],
  pauta: [{ numero: N(3), grau: '2º grau', evento: 'Intimação Eletrônica - Pauta | Sessão Virtual', ini: dia(3), fim: dia(10), envio: dia(-5) + ' 15:14' }],
  audiencias: [{ numero: N(3), evento: 'Audiência de instrução - designada', sala: 'Sala 1', data: dia(8), hora: '14:30', obs: '' },
    { numero: N(1), evento: 'Audiência de mediação - designada', sala: 'CEJUSC virtual', data: dia(12), hora: '10:00', obs: 'meet.google.com/abc-defg-hij', partes: 'Autor CICLANO TESTE × Réu BELTRANO TESTE', vara: 'Vara da Família da Comarca de Teste' }] };

const ctx = C.contextoRobo_(), res = { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, nov = [];
const a = C.aplicarPainelEproc_(ctx, conta, res, nov);
const Z = id => ctx.prazos.linhas.find(z => z.id === id);
const za = Z('Z860a');
assert(za.fatal === dia(20) && za.situacao === 'conferido' && /vinculado ao eproc/.test(za.origem) && /^Prazo do eproc/.test(za.descricao) && za.dias === '30' && /\[eprocp:/.test(za.observacoes),
  'provisório vira a data FINAL do eproc (30 dias, ' + za.fatal + '), conferido e marcado');
const zb = Z('Z860b');
assert(zb.situacao === 'cumprido' && /ainda mostra o prazo aberto/.test(zb.observacoes) && a.ja_feitos === 1, 'prazo que a equipe já cumpriu NÃO é reaberto (só anotado)');
const zc = ctx.prazos.linhas.find(z => z.numero === N(3) && /Prazo do eproc/.test(z.descricao || ''));
const ic = zc && ctx.intim.linhas.find(i => i.id === zc.intimacao_id);
assert(zc && zc.fatal === dia(18) && ic && ic.prazo_id === zc.id, 'prazo do eproc que não existia no painel é criado, ligado ao processo e a uma intimação');
const zd = Z('Z860d');
assert(zd.dias === '15' && zd.fatal > dia(16) && /Sentença/.test(zd.descricao) && ctx.intim.linhas.filter(i => i.numero === N(4)).length === 1,
  'aguardando abertura que já veio pelo e-mail: não repete a intimação e o provisório ganha os 15 dias do eproc (' + zd.fatal + ')');
const ie = ctx.intim.linhas.find(i => i.numero === N(5));
const ze = ie && ctx.prazos.linhas.find(z => z.id === ie.prazo_id);
assert(ie && ze && ze.ciencia === dia(10), 'aguardando abertura nova vira intimação + prazo com ciência tácita (envio + 10 dias)');
assert(a.audiencias === 2 && ctx.eventos.linhas.some(e => e.numero === N(3) && e.data === dia(8) && /instru/.test(e.tipo)) && ctx.eventos.linhas.some(e => e.numero === N(1) && /concilia/.test(e.tipo)),
  'audiências futuras vão para a agenda (instrução e mediação → conciliação)');
assert(ctx.intim.linhas.some(i => i.numero === N(3) && /Intimação de pauta/.test(i.movimento) && !i.prazo_id), 'pauta vira intimação sem prazo');
// 2ª leitura: nada duplica
const nZ = ctx.prazos.linhas.length, nI = ctx.intim.linhas.length, nE = ctx.eventos.linhas.length;
const a2 = C.aplicarPainelEproc_(ctx, conta, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
assert(ctx.prazos.linhas.length === nZ && ctx.intim.linhas.length === nI && ctx.eventos.linhas.length === nE && a2.novos === 0 && a2.ajustados === 0 && a2.iguais >= 2,
  'a 2ª leitura do eproc não duplica prazo, intimação nem audiência');
// data mudou no eproc (prorrogação): o prazo vinculado acompanha
conta.prazos[0].fim = dia(22);
C.aplicarPainelEproc_(ctx, conta, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
assert(Z('Z860a').fatal === dia(22), 'prazo vinculado acompanha a data nova do eproc');
// remarcada: a data velha sai da agenda
conta.audiencias[0] = { numero: N(3), evento: 'Audiência de instrução - redesignada', sala: 'Sala 1', data: dia(15), hora: '09:00', obs: '' };
const a3 = C.aplicarPainelEproc_(ctx, conta, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
const ev = C.tabela_('Eventos').linhas.filter(e => e.numero === N(3));
assert(a3.remarcadas === 1 && ev.some(e => e.data === dia(8) && /apagado/.test(e.evento_id)) && ctx.eventos.linhas.some(e => e.numero === N(3) && e.data === dia(15)), 'audiência redesignada: entra a data nova e a velha sai da agenda');

// 8.60.1: tudo o que o eproc mostra vai para o painel; intimação nova já com checklist; audiência com ficha completa
const ie2 = ctx.intim.linhas.find(i => i.numero === N(5));
assert(/Ato: intimação eletrônica - Sentença/.test(ie2.texto) && /Partes: Autor FULANO INVENTADO × Réu EMPRESA FICTÍCIA LTDA/.test(ie2.texto) && /assunto: Indenização/.test(ie2.texto) && /Juízo: 1ª Vara Cível/.test(ie2.texto) && ie2.texto.length >= 120,
  'intimação nova traz o texto completo do eproc (ato, prazo, partes, classe, assunto, juízo) — entra na fila do resumo da IA');
assert(ctx.intim.linhas.find(i => i.id === 'I860d').texto.length > 120, 'intimação que veio pelo e-mail sem texto ganha o texto do eproc');
const tN = C.tabela_('Tarefas').linhas.filter(t => (t.descricao || '').indexOf('[prep:' + ie2.id + ']') >= 0);
assert(tN.length >= 2 && tN.every(t => t.responsavel && t.responsavel !== 'robô'), 'intimação nova (sentença) já nasce com o checklist (' + tN.length + ' tarefas, cada uma com responsável)');
assert(C.tabela_('Tarefas').linhas.filter(t => (t.descricao || '').indexOf('[prep:I860d]') >= 0).length === 0, 'intimação que já existia (veio pelo e-mail) não ganha checklist automático');
const sg = C.sugestaoTratamento_(ie2, ctx.prazos.linhas.find(z => z.id === ie2.prazo_id), ctx.porNumero[N(5)], {});
assert(sg.checklist_criado === tN.length && sg.tarefas.length === 0, 'a tela da intimação mostra "checklist já criado" e não sugere de novo');
const fic = C.tabela_('Audiencias').linhas.find(f => f.numero === N(1));
assert(fic && fic.forum === 'Vara da Família da Comarca de Teste' && /meet\.google\.com\/abc-defg-hij/.test(fic.link) && fic.modo === 'online' && /BELTRANO/.test(fic.obs) && fic.sala === 'CEJUSC virtual',
  'audiência do eproc: ficha com vara, sala, link do Meet, modo online e as partes');
const tA = C.tabela_('Tarefas').linhas.filter(t => /\[prepato:E:/.test(t.descricao || ''));
assert(tA.length >= 3 && !tA.some(t => /^Avisar o cliente/.test(t.titulo)), 'audiência nova ganha o checklist do tipo (sem repetir o "avisar o cliente", que já tem os 4 avisos)');
const nT = C.tabela_('Tarefas').linhas.length;
C.aplicarPainelEproc_(ctx, conta, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
assert(C.tabela_('Tarefas').linhas.length === nT, 'nova leitura não repete checklist');

// 8.61: PJe pelo painel do advogado — só os expedientes para o nosso cliente; data final do PJe; audiência marcada
const M = k => '0000' + k + '99-11.2026.5.06.0171';
add('Clientes', [{ id: 'C861', nome: 'Maria Inventada da Silva', criado_em: new Date().toISOString() }]);
add('Processos', [{ id: 'P861a', numero: M(1), tribunal: 'TRT6', sistema: 'PJe', status: 'ativo', area: 'Trabalhista', cliente_id: 'C861', responsavel: 'ana', criado_em: new Date().toISOString() },
  { id: 'P861b', numero: M(2), tribunal: 'TRT6', sistema: 'PJe', status: 'ativo', area: 'Trabalhista', polo: 'reclamante', responsavel: 'ana', criado_em: new Date().toISOString() }]);
add('Prazos', [{ id: 'Z861a', processo_id: 'P861a', numero: M(1), descricao: 'Prazo indicado na intimação', dias: '8', contagem: 'uteis', ciencia: dia(-6), fatal: dia(3), situacao: 'calculado', origem: 'robô', observacoes: 'DJEN', criado_em: new Date().toISOString() }]);
const ctxP = C.contextoRobo_();
const contaP = { chave: 'pjetrt61g', sigla: 'TRT6', sistema: 'PJe', ok: true, contagens: {}, pendentes: [], pauta: [],
  prazos: [
    { numero: M(1), grau: '1º grau', classe: 'ATOrd', vara: '1ª Vara do Trabalho Inventada', partes: 'MARIA INVENTADA DA SILVA × EMPRESA FICTÍCIA LTDA', evento: 'Intimação (Diário Eletrônico)', dias: 8, corridos: false, envio: dia(-8) + 'T16:00', inicio: dia(-6), fim: dia(2), destinatario: 'MARIA INVENTADA DA SILVA', polo: 'ativo', expediente: 111 },
    { numero: M(1), grau: '1º grau', classe: 'ATOrd', vara: '1ª Vara do Trabalho Inventada', partes: 'MARIA INVENTADA DA SILVA × EMPRESA FICTÍCIA LTDA', evento: 'Intimação (Diário Eletrônico)', dias: 8, corridos: false, envio: dia(-8) + 'T16:00', inicio: dia(-6), fim: dia(2), destinatario: 'EMPRESA FICTÍCIA LTDA', polo: 'passivo', expediente: 112 },
    { numero: M(2), grau: '1º grau', classe: 'ATOrd', vara: '1ª Vara do Trabalho Inventada', partes: 'JOSE TESTE × OUTRA EMPRESA SA', evento: 'Alvará (Em Mãos)', dias: 15, corridos: true, envio: dia(-20) + 'T08:05', inicio: dia(-10), fim: dia(5), destinatario: 'JOSE TESTE', polo: 'ativo', expediente: 113 }],
  audiencias: [{ numero: M(2), grau: '1º grau', classe: 'ATOrd', vara: '1ª Vara do Trabalho Inventada', partes: 'JOSE TESTE × OUTRA EMPRESA SA', evento: 'Instrução por videoconferência', situacao: 'Designada', data: dia(9), hora: '10:00', sala: 'Sala_Titular', obs: '' }] };
const aP = C.aplicarPainelEproc_(ctxP, contaP, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
const zP = ctxP.prazos.linhas.find(z => z.id === 'Z861a');
assert(zP.fatal === dia(2) && /vinculado ao PJe/.test(zP.origem) && zP.situacao === 'conferido' && /\[pjep:/.test(zP.observacoes) && /o painel tinha/.test(zP.observacoes),
  'PJe: o prazo do DJEN ganha a data final do PJe (' + zP.fatal + '), conferido e marcado');
assert(aP.outra_parte === 1 && !ctxP.prazos.linhas.some(z => (z.observacoes || '').indexOf('|112]') >= 0), 'PJe: expediente para a EMPRESA (outra parte) não vira prazo nosso');
const zAlv = ctxP.prazos.linhas.find(z => z.numero === M(2) && /Prazo do PJe: Alvará/.test(z.descricao || ''));
const iAlv = zAlv && ctxP.intim.linhas.find(i => i.id === zAlv.intimacao_id);
assert(zAlv && zAlv.fatal === dia(5) && zAlv.contagem === 'corridos' && iAlv && /Expediente do PJe TRT6/.test(iAlv.texto) && /Destinatário: JOSE TESTE \(polo ativo\)/.test(iAlv.texto),
  'PJe sem cliente cadastrado: expediente do polo ativo (o processo é nosso, reclamante) vira prazo + intimação com o texto do PJe');
assert(aP.audiencias === 1 && ctxP.eventos.linhas.some(e => e.numero === M(2) && e.data === dia(9) && /instru/.test(e.tipo)), 'PJe: audiência designada vai para a agenda');
const fP = C.tabela_('Audiencias').linhas.find(f => f.numero === M(2));
assert(fP && fP.modo === 'online' && /Do PJe:/.test(fP.obs) && fP.forum === '1ª Vara do Trabalho Inventada', 'PJe: ficha da audiência com vara, modo online e "Do PJe"');
const nP = ctxP.prazos.linhas.length;
const aP2 = C.aplicarPainelEproc_(ctxP, contaP, { intimacoes: 0, prazos: 0, ajustados: 0, audiencias: 0 }, []);
assert(ctxP.prazos.linhas.length === nP && aP2.novos === 0 && aP2.audiencias === 0, 'PJe: a 2ª leitura não duplica nada');
console.log('resumo', JSON.stringify(a), 'novidades', nov.length);
