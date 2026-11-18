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
console.log("fim");
