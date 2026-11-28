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
// 8.62 etapa 2: tentativa de acordo, A IA explica (guardada), números por pessoa
const pAc = C.tabela_('Processos').linhas.find(p => p.id === 'P862a');
assert(C.marcarTentativaAcordo_(pAc) === true && C.tabela_('Processos').linhas.find(p => p.id === 'P862a').acordo_tent === 'pendente', 'processo trabalhista protocolado entra na "Tentativa de acordo"');
assert(C.acordoCabe_({ area: 'Previdenciário' }) === false && C.acordoCabe_({ area: 'Família' }) === false, 'previdenciário e família não entram');
C.acordoTentativa_({ id: 'P862a', situacao: 'feito' }, admin);
assert(C.tabela_('Processos').linhas.find(p => p.id === 'P862a').acordo_tent === 'feito', '"✓ Feito" tira do quadro');
assert(/\[NÚMERO\]/.test(C.acordoMsg_({}, admin).texto), 'mensagem padrão com as marcas');
C.chaveIA_ = () => 'x'; let chamadas = 0;
C.geminiTexto_ = () => { chamadas++; return { texto: '**Onde está:** aguardando sentença.\n**O que esperar:** o juiz está com o processo para decidir: aguardar.' }; };
const s1 = C.situacaoProcessoIA_('P862a', false, admin), s2 = C.situacaoProcessoIA_('P862a', false, admin);
assert(/Onde está/.test(s1.texto) && s2.igual && chamadas === 1 && C.situacaoGuardada_('P862a').velho === false, 'A IA explica: guardada; sem novidade não chama a IA de novo');
const rel = C.relatorioSemana_({ periodo: 'mes' });
assert(rel.pessoas.every(p => p.metricas && typeof p.metricas.intimacoes === 'number'), 'relatório: cada pessoa com os números do próprio trabalho');
console.log('fim 862b');

// 8.62 Edifício Future: mudou de apartamento, não chegou a entrar, trocar o morador (dados inventados)
add('FutUnidades', [{ id: 'AP 904', tipo: 'apartamento', aluguel: '1750.00', taxas: '140.00', situacao: 'alugado', locatario: 'MORADORA TESTE', telefone: '48 90000-0001', entrada: '2026-09-14', saida: '2027-09-14', caucao: '3600.00' },
  { id: 'AP 903', tipo: 'apartamento', aluguel: '1750.00', situacao: 'disponivel', locatario: '' },
  { id: 'AP 907', tipo: 'apartamento', aluguel: '1750.00', situacao: 'alugado', locatario: 'FUNCIONARIO A', pagador: 'Empresa Fictícia (HC)', saida: '2026-12-31' }]);
add('FutPessoas', [{ id: 'FP1', nome: 'MORADORA TESTE', unidade: 'AP 904', entrada: '2026-09-14', saida: '2027-09-14', caucao: '3600.00', situacao: 'atual' },
  { id: 'FP2', nome: 'NOVA QUE NAO ENTROU', unidade: 'AP 903', entrada: '2026-11-06', caucao: '1750.00', situacao: 'atual' },
  { id: 'FP3', nome: 'FUNCIONARIO A', unidade: 'AP 907', situacao: 'atual' }]);
add('FutCobrancas', [{ id: 'FC1', unidade: 'AP 904', pessoa: 'MORADORA TESTE', competencia: '2099-01', vencimento: '2099-01-10', total: '1890.00', situacao: 'aberta' },
  { id: 'FC2', unidade: 'AP 903', pessoa: 'NOVA QUE NAO ENTROU', competencia: '2099-01', vencimento: '2099-01-10', total: '1598.33', situacao: 'aberta' },
  { id: 'FC3', unidade: 'AP 907', pessoa: 'FUNCIONARIO A', competencia: '2099-01', vencimento: '2099-01-10', total: '1890.00', situacao: 'aberta' }]);
const luiz = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };

let erroMv = ''; try { C.futureMoverPessoa_({ id: 'FP1', acao: 'mudou', unidade_nova: 'AP 907' }, luiz); } catch (e) { erroMv = e.message; }
assert(/alugado para FUNCIONARIO A/.test(erroMv), 'não deixa mudar para apartamento alugado a outra pessoa');
const rM = C.futureMoverPessoa_({ id: 'FP2', acao: 'nao_entrou', devolver_caucao: 'sim' }, luiz);
const u903 = C.tabela_('FutUnidades').linhas.find(x => x.id === 'AP 903');
assert(rM.canceladas === 1 && u903.situacao === 'disponivel' && C.tabela_('FutPessoas').linhas.find(x => x.id === 'FP2').situacao === 'saiu' && C.tabela_('FutLanc').linhas.some(l => l.chave === 'naoentrou:FP2'), 'não chegou a entrar: sai, cobrança cancelada, caução devolvida no caixa');
const rM2 = C.futureMoverPessoa_({ id: 'FP1', acao: 'mudou', unidade_nova: '903', motivo: 'reforma', temporaria: 'sim', antigo: 'reforma' }, luiz);
const a903 = C.tabela_('FutUnidades').linhas.find(x => x.id === 'AP 903'), a904 = C.tabela_('FutUnidades').linhas.find(x => x.id === 'AP 904');
assert(rM2.para === 'AP 903' && a903.locatario === 'MORADORA TESTE' && a903.caucao === '3600.00' && a904.situacao === 'reforma' && C.tabela_('FutCobrancas').linhas.find(c => c.id === 'FC1').unidade === 'AP 903', 'mudou de apartamento: mesmo contrato, o antigo em reforma, a cobrança vai junto');
C.futureMoverPessoa_({ id: 'FP3', acao: 'trocar_morador', nome_novo: 'FUNCIONARIO B' }, luiz);
const a907 = C.tabela_('FutUnidades').linhas.find(x => x.id === 'AP 907');
assert(a907.locatario === 'FUNCIONARIO B' && a907.situacao === 'alugado' && C.tabela_('FutCobrancas').linhas.find(c => c.id === 'FC3').pessoa === 'FUNCIONARIO B' && C.tabela_('FutPessoas').linhas.some(p => p.nome === 'FUNCIONARIO B' && p.situacao === 'atual'), 'empresa paga: troca só o morador; a cobrança continua');
console.log('fim future');
// 8.63.1: tribunais com processo ativo sem leitura direta (dados inventados)
add('Processos', [{ id: 'P863rs1', numero: '5000001-11.2026.8.21.0001', status: 'ativo', fase: 'andamento' }, { id: 'P863rs2', numero: '5000002-11.2026.8.21.0001', status: 'ativo', fase: 'andamento' },
  { id: 'P863rs3', numero: '5000003-11.2026.8.21.0001', status: 'arquivado', fase: 'extinto' }, { id: 'P863pr', numero: '0000004-11.2026.8.16.0001', status: 'ativo', fase: 'andamento' }]);
const falt = C.faltamPortais_({ TJSC: 1, TRT12: 1 });
assert(falt.some(f => f.t === 'TJRS' && f.n === 2) && falt.some(f => f.t === 'TJPR' && f.n === 1) && !falt.some(f => f.t === 'TJSC' || f.t === 'TRT12'), 'faltam acessos: TJRS (2 ativos; o arquivado não conta) e TJPR; os lidos ficam de fora');
console.log('fim 863.1');
