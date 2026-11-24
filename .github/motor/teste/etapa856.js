// 8.56: intimações eletrônicas do eproc lidas direto do tribunal (função "tribunais" simulada). Dados inventados.
const T = require('./teste.js'); const { C, assert } = T;
const hoje = C.hojeSP_();
const proc = C.tabela_('Processos').linhas.find(p => p.numero && p.status !== 'arquivado');
const num20 = proc.numero.replace(/\D/g, ''), disp = C.somarDias_(hoje, -2);
const dg = disp.replace(/-/g, '') + '143000';
// o mesmo processo já tem um aviso do eproc por e-mail de outro dia (longe) — não deve impedir
const tI = C.tabela_('Intimacoes');
let resposta = { ok: true, ligado: true, avisos: [
  { id: 'AV1', tipo: 'INT', numero: num20, orgao: 'Vara Fictícia', destinatario: 'Fulano Fictício', disponibilizado: dg, sistema: 'TJSC 1º grau' },
  { id: 'AV2', tipo: 'INT', numero: '50000011220268240000', orgao: 'Vara X', destinatario: 'Outro Fictício', disponibilizado: dg, sistema: 'TJSC 2º grau' }], partes: [] };
// e-mail do eproc do processo 2, expedido no mesmo dia → o aviso do portal NÃO vira outra intimação
C.inserirLinha_(tI, { id: 'Iem', chave: 'em856', fonte: 'eproc TJSC', recebido_em: disp + 'T15:00:00.000Z', numero: '5000001-12.2026.8.24.0000', movimento: 'Expedida/certificada a intimação eletrônica', texto: '', criado_em: new Date().toISOString() });
const orig = C.UrlFetchApp.fetch; let pedido = null;
C.UrlFetchApp.fetch = (url, op) => { if (/functions\/v1\/tribunais/.test(url)) { pedido = { url, op }; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(resposta) }; } return orig(url, op); };
C.sbLigado_ = () => true;
const P = C.PropertiesService.getScriptProperties();
let ctx = C.contextoRobo_();
let r = C.eprocDireto_(ctx);
assert(pedido && JSON.parse(pedido.op.payload).acao === 'avisos' && pedido.op.headers['x-painel-chave'], 'o robô pede as pendentes à função com a chave secreta do banco (só servidor → servidor)');
const nova = ctx.intim.linhas.find(i => /portal/.test(i.fonte || '') && i.numero === proc.numero);
assert(r.intimacoes === 1 && nova, 'intimação pendente no portal vira intimação no painel');
assert(!ctx.intim.linhas.some(i => /portal/.test(i.fonte || '') && i.numero === '5000001-12.2026.8.24.0000'), 'a que já chegou pelo e-mail do eproc não é repetida');
const z = ctx.prazos.linhas.find(p => p.intimacao_id === nova.id || p.id === nova.prazo_id);
assert(z && z.ciencia === C.somarDias_(disp, 10) && /tácita/.test(z.ciencia_tipo), 'ciência TÁCITA: 10 dias da disponibilização (não abre a intimação)');
assert(z && /PROVIS/i.test(z.descricao) && z.fatal, 'sem o texto do ato: prazo com data de segurança (ato não identificado), trocado quando o DJEN chegar');
const chat = C.tabela_('Chat').linhas.slice(-1)[0];
assert(chat && chat.de === 'robô' && /eproc/.test(chat.texto) && /não demos ciência/.test(chat.texto), 'aviso no chat da equipe');
r = C.eprocDireto_(ctx);
assert(r.intimacoes === 0, 'menos de 50 min depois o robô não pergunta de novo');
P.deleteProperty('EPROC_DIRETO_EM'); r = C.eprocDireto_(ctx);
assert(r.intimacoes === 0, 'na leitura seguinte a mesma pendente não é registrada de novo');
P.deleteProperty('EPROC_DIRETO_EM'); resposta = { ok: true, ligado: false, avisos: [] }; r = C.eprocDireto_(ctx);
assert(r.intimacoes === 0, 'sem login guardado: nada acontece');
P.deleteProperty('EPROC_DIRETO_EM'); resposta = { ok: false, erro: 'Chave do banco recusada.' }; r = C.eprocDireto_(ctx);
assert(r.intimacoes === 0 && /recusada/.test(JSON.parse(C.config_('EPROC_DIRETO')).erro), 'erro fica registrado (Config EPROC_DIRETO), sem quebrar o robô');
// ---- 8.56: intimação "para resolver" antiga vira "Não feita" (baixa automática); a fila fica com hoje e os próximos dias ----
{
  const tI = C.tabela_('Intimacoes'), tZ = C.tabela_('Prazos'), agora = new Date().toISOString();
  const p2 = C.tabela_('Processos').linhas.filter(p => p.numero && p.status !== 'arquivado')[2];
  const ant = C.somarDias_(hoje, -7);
  C.inserirLinha_(tZ, { id: 'Zv856', processo_id: p2.id, numero: p2.numero, intimacao_id: 'Iv856', descricao: 'Manifestação (5 dias)', dias: '5', contagem: 'uteis', ciencia: ant, fatal: C.somarDias_(hoje, -3), situacao: 'calculado', origem: 'robô', criado_em: agora });
  C.inserirLinha_(tI, { id: 'Iv856', chave: 'Iv856', fonte: 'DJEN', recebido_em: ant + 'T12:00:00.000Z', numero: p2.numero, processo_id: p2.id, movimento: 'Intimação', prazo_id: 'Zv856', texto: 'x', criado_em: agora });
  C.inserirLinha_(tZ, { id: 'Zf856', processo_id: p2.id, numero: p2.numero, intimacao_id: 'If856', descricao: 'Contrarrazões', dias: '8', contagem: 'uteis', ciencia: hoje, fatal: C.somarDias_(hoje, 5), situacao: 'calculado', origem: 'robô', criado_em: agora });
  C.inserirLinha_(tI, { id: 'If856', chave: 'If856', fonte: 'DJEN', recebido_em: C.somarDias_(hoje, -1) + 'T12:00:00.000Z', numero: p2.numero, processo_id: p2.id, movimento: 'Intimação', prazo_id: 'Zf856', texto: 'y', criado_em: agora });
  C.inserirLinha_(tI, { id: 'Is856', chave: 'Is856', fonte: 'DJEN', recebido_em: C.somarDias_(hoje, -6) + 'T12:00:00.000Z', numero: p2.numero, processo_id: p2.id, movimento: 'Intimação', texto: 'z', criado_em: agora });
  const admin = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };
  C.baixarCaixaVencida_();
  const iv = C.tabela_('Intimacoes').linhas.find(x => x.id === 'Iv856'), is = C.tabela_('Intimacoes').linhas.find(x => x.id === 'Is856'), iff = C.tabela_('Intimacoes').linhas.find(x => x.id === 'If856');
  assert(iv.tratamento === 'nao_feita' && /prazo venceu/.test(iv.tratada_por), 'prazo vencido e não resolvido → "Não feita" com o motivo');
  assert(is.tratamento === 'nao_feita' && /sem prazo/.test(is.tratada_por), 'sem prazo e recebida há mais de 5 dias → "Não feita"');
  assert(!iff.tratamento, 'prazo que ainda vai vencer continua para resolver');
  assert(C.tabela_('Prazos').linhas.find(z => z.id === 'Zv856').situacao === 'calculado', 'o PRAZO não é mexido (segue a regra dos 10 dias úteis)');
  let cx = C.caixaIntimacoes_({ status: 'nao' }, admin);
  assert(cx.lista.some(x => x.id === 'If856') && !cx.lista.some(x => x.id === 'Iv856'), 'Para resolver: só o que ainda vale');
  cx = C.caixaIntimacoes_({ status: 'nao_feitas' }, admin);
  assert(cx.lista.some(x => x.id === 'Iv856') && cx.placar.nao_feitas >= 2, 'filtro "Não feitas" mostra as baixadas');
  const fat = cx2 => cx2.lista.map(x => (x.sug.prazo || {}).fatal || '9');
  const l = C.caixaIntimacoes_({ status: 'nao' }, admin); const f = fat(l);
  assert(f.every((v, k) => k === 0 || f[k - 1] <= v), 'Para resolver em ordem de data do prazo (hoje primeiro)');
}
