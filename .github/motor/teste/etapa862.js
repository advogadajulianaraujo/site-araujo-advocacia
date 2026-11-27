// 8.62: IA acha cliente por parte do nome e entende "contra"; inicial protocolada fecha sozinha; "Intimado em audiência" não é audiência
// nova; indicações pendentes; resultado das audiências no Início; horários dos portais. Dados INVENTADOS (o repositório é público).
const T = require('./teste.js'); const { C, assert, add } = T;
const admin = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };
const agora = new Date().toISOString();
add('Clientes', [
  { id: 'C862a', nome: 'Janaína Fictícia Souza', telefone: '48 91111-2222', criado_em: agora },
  { id: 'C862b', nome: 'Janaina Inventada Prado', telefone: '48 93333-4444', criado_em: agora },
  { id: 'C862c', nome: 'JANAINA TESTE ROCHA', telefone: '', criado_em: agora },
  { id: 'C862d', nome: 'Rogério Exemplo Lima', telefone: '48 95555-6666', criado_em: agora }]);
const N = k => '000' + k + '862-11.2026.5.12.0041';
add('Processos', [
  { id: 'P862a', numero: N(1), cliente_id: 'C862a', area: 'Trabalhista', fase: 'andamento', status: 'ativo', parte_contraria: 'Mercado Imaginário Ltda', criado_em: agora },
  { id: 'P862b', numero: N(2), cliente_id: 'C862b', area: 'Trabalhista', fase: 'andamento', status: 'ativo', parte_contraria: 'Transportes Faz de Conta SA', criado_em: agora }]);
C.chaveIA_ = () => ''; // sem IA: o painel resolve sozinho
let r = C.assistenteIA_({ pergunta: 'janaina', modo: 'auto' }, admin);
assert(r.linhas && r.linhas.length === 3 && /3 clientes/.test(r.texto) && /2 têm processo/.test(r.texto), '"janaina" (minúsculo, sem acento, só o 1º nome) lista as 3 Janaínas e diz quais têm processo');
r = C.assistenteIA_({ pergunta: 'como está o processo da janaina contra o mercado imaginário?', modo: 'auto' }, admin);
assert(/Processo 0001862/.test(r.texto || '') || (r.abrir || '').indexOf('P862a') >= 0, '"processo da janaina contra o mercado" acha a Janaína certa pelo nome da empresa');
r = C.assistenteIA_({ pergunta: 'processos contra transportes faz de conta', modo: 'auto' }, admin);
assert((r.abrir || '').indexOf('P862b') >= 0 || (r.linhas || []).some(l => /0002862/.test(l.c.join(' '))), 'só "contra a empresa" (sem nome do cliente) acha o processo');
// inicial sem número + e-mail "Processo protocolado (peticionamento eletrônico)" → a inicial fecha sozinha
add('Processos', [{ id: 'P862i', numero: '', cliente_id: 'C862d', area: 'Trabalhista', fase: 'contratado', status: 'ativo', responsavel: 'ana', inicial_feita_em: agora, criado_em: '2026-01-02T12:00:00.000Z' },
  { id: 'P862n', numero: '5000862-11.2026.8.24.0075', cliente_id: 'C862d', area: 'Cível', fase: 'andamento', status: 'ativo', criado_em: agora }]);
add('Tarefas', [{ id: 'T862i', titulo: 'Petição inicial — Rogério', descricao: 'fazer\n[inicial:P862i]', responsavel: 'ana', situacao: 'ativa', etapa: 'afazer', criado_em: agora }]);
add('Intimacoes', [{ id: 'I862p', chave: 'prot862', numero: '5000862-11.2026.8.24.0075', fonte: 'e-mail TJSC', movimento: 'Processo protocolado (peticionamento eletrônico)', recebido_em: C.hojeSP_() + 'T12:00:00.000Z', criado_em: agora }]);
assert(C.iniciaisProtocoladas862_() === 1, 'o robô reconhece que a inicial foi protocolada');
const pi = C.tabela_('Processos').linhas.find(p => p.id === 'P862i'), pn = C.tabela_('Processos').linhas.find(p => p.id === 'P862n');
assert(pi.status === 'arquivado' && /protocolada como 5000862/.test(pi.observacoes) && pn.responsavel === 'ana', 'a inicial sai do quadro, anotada; o processo com número fica com o responsável');
assert(C.tabela_('Tarefas').linhas.find(t => t.id === 'T862i').concluida_em && C.tabela_('Tarefas').linhas.some(t => /\[protocolo:P862n\]/.test(t.descricao || '')), 'a tarefa da inicial fecha e nasce o "Avisar o cliente: processo protocolado"');
assert(C.iniciaisProtocoladas862_() === 0, 'a 2ª rodada não mexe de novo');
// "Intimado em audiência": não é audiência nova
assert(C.acharAto_('Intimação eletrônica do eproc. Ato: Intimado em audiência. Prazo: 15 dias úteis, de 26/11/2026 até 17/12/2099 (data final mostrada pelo eproc).') === null, '"Intimado em audiência" não vira audiência nova');
assert(C.acharAto_('Fica designada audiência de instrução para o dia 10/03/2099 às 14h30.') !== null, 'audiência designada continua sendo lida');
// indicações pendentes: cliente novo com o telefone da lista ganha a indicação
C.setConfig_('INDICACOES_PENDENTES', JSON.stringify([{ tel: '48955556666', nome: 'Rogério', indicadora: 'Dra. Indicadora Teste', pct: '30', base: 'todos' }, { tel: '48900000000', nome: 'Outro' }]), 'teste');
assert(C.indicacoesPendentes862_() === 1, 'telefone da lista → indicação marcada');
const rog = C.tabela_('Clientes').linhas.find(c => c.id === 'C862d');
assert(rog.indicado_por === 'Dra. Indicadora Teste' && rog.indicacao_pct === '30' && rog.indicacao_base === 'todos' && JSON.parse(C.config_('INDICACOES_PENDENTES')).length === 1, 'cliente marcado e sai da lista (o outro número fica)');
C.atualizarLinha_(C.tabela_('Processos'), pn, { fase: 'acordo' });
const _f1 = C.indicacaoFimProcesso862_(), _f2 = C.indicacaoFimProcesso862_(); assert(_f1 >= 1 && _f2 === 0, 'processo de cliente indicado que fechou acordo → tarefa "Dividir honorários" (uma vez)');
// horários dos portais (7h30 e 13h30)
assert(C.horaDosPortais_(0) === true && C.horaDosPortais_(Date.now()) === false, 'portais: lê se passou um horário desde a última leitura; não relê logo em seguida');
// resultado das audiências no Início
const hoje = C.hojeSP_();
add('Eventos', [{ chave: 'E:' + N(1) + ':' + hoje + ':conciliacao', tipo: 'audiência de conciliação', numero: N(1), data: hoje, hora: '09:00', agenda: 'AUDIÊNCIA CONCILIAÇÃO', evento_id: 'x', criado_em: agora }]);
const res = C.audienciasResultados_(hoje, 14, { C862a: { id: 'C862a', nome: 'Janaína Fictícia Souza' } }, { [N(1)]: { id: 'P862a', cliente_id: 'C862a', parte_contraria: 'Mercado Imaginário Ltda' } });
const r0 = res.find(a => a.numero === N(1));
assert(r0 && r0.resultado === '' && r0.cliente === 'Janaína Fictícia Souza', 'Início: audiência de hoje aparece com "falta anotar o resultado"');
console.log('fim 862');
