// 8.55: intimações recebidas (para resolver / resolvidas / descartadas), sugestão do painel (prazo + tarefas), 👍/👎 que ensinam,
// resolver de vários jeitos, andamentos importantes e avisos por pessoa. Dados inventados.
const T = require('./teste.js'); const { C, assert } = T;
const admin = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' }, maria = { usuario: 'maria', nome: 'Maria Teste', perfil: 'estagiario' };
const hoje = C.hojeSP_(), agora = new Date().toISOString();
const proc = C.tabela_('Processos').linhas.find(p => p.numero && p.cliente_id && p.status !== 'arquivado');
const tI = C.tabela_('Intimacoes'), tZ = C.tabela_('Prazos');
const texto = 'PODER JUDICIÁRIO JUSTIÇA DO TRABALHO RECLAMANTE: FULANO FICTÍCIO RECLAMADO: EMPRESA EXEMPLO LTDA. Fica V. Sa. intimado(a) para tomar ciência da sentença ID 77 proferida nos autos, cujo dispositivo: julgo parcialmente procedentes os pedidos. ' + 'texto '.repeat(40);
C.inserirLinha_(tI, { id: 'I855a', chave: 'I855a', fonte: 'DJEN', recebido_em: agora, numero: proc.numero, processo_id: proc.id, tribunal: 'TRT12', movimento: 'Intimação', texto, criado_em: agora });
const fat = C.somarDias_(hoje, 12);
C.inserirLinha_(tZ, { id: 'Z855a', processo_id: proc.id, numero: proc.numero, intimacao_id: 'I855a', descricao: 'Sentença: recurso ordinário (8 dias)', dias: '8', contagem: 'uteis', ciencia: hoje, fatal: fat, situacao: 'calculado', origem: 'robô', responsavel: 'maria', observacoes: 'DJEN: x', criado_em: agora });
C.atualizarLinha_(tI, tI.linhas.find(x => x.id === 'I855a'), { prazo_id: 'Z855a' });
// movimentação pura e aviso de outro dia
C.inserirLinha_(tI, { id: 'I855m', chave: 'I855m', fonte: 'PJe TRT12', recebido_em: agora, numero: proc.numero, movimento: 'Conclusos os autos para despacho', texto: '', criado_em: agora });

let cx = C.caixaIntimacoes_({ status: 'nao' }, admin);
const it = cx.lista.find(x => x.id === 'I855a');
assert(it && it.status === 'nao' && it.sug.ato === 'sentenca' && it.sug.n_tarefas >= 4, 'intimação nova aparece em "Para resolver" com o ato (sentença) e as tarefas sugeridas');
assert(!cx.lista.some(x => x.id === 'I855m'), 'movimentação comum (conclusos) não entra nas intimações recebidas');
assert(cx.placar.nao_hoje >= 1 && cx.semana.length === 7 && cx.semana[6].dia === hoje && cx.semana[6].recebidas >= 1, 'placar do dia e gráfico dos 7 dias');
const ob = C.intimacaoObter_({ id: 'I855a' }, admin);
assert(ob.sugestao.prazo && ob.sugestao.prazo.id === 'Z855a' && ob.sugestao.tarefas.every(t => t.vence_em && t.vence_em <= fat && t.vence_em >= hoje), 'tela: prazo do robô + tarefas com data entre hoje e a data final');
assert(ob.sugestao.tarefas.some(t => t.responsavel === 'maria'), 'tarefa do advogado fica com quem cuida do prazo');
assert(ob.intimacao.texto.length > 200 && ob.processo.numero === proc.numero && Array.isArray(ob.pendentes) && ob.pendentes.some(p => p.id === 'Z855a'), 'tela mostra o texto inteiro, o processo e o que está em aberto');

// confirmar: 2 tarefas, 1 recusada (👎), prazo 👍
const t0 = ob.sugestao.tarefas;
const nT = C.tabela_('Tarefas').linhas.length;
let r = C.tratarIntimacao_({ id: 'I855a', acao: 'confirmar', prazo: 'ok', tarefas: [t0[1], Object.assign({}, t0[2], { titulo: 'Analisar a sentença com calma (editado)' })], rejeitadas: [t0[0].titulo] }, admin);
const novas = C.tabela_('Tarefas').linhas.slice(nT);
assert(r.ok && r.tarefas.length === 2 && novas.length === 2 && novas.every(t => /\[prep:I855a\]/.test(t.descricao) && t.vence_em), 'Confirmar cria as tarefas escolhidas, com data e a marca da intimação');
assert(novas.some(t => t.titulo === 'Analisar a sentença com calma (editado)'), 'tarefa editada (✏️) entra com o texto novo');
assert(C.tabela_('Intimacoes').linhas.find(x => x.id === 'I855a').tratamento === 'ia' && C.statusCaixa_(C.tabela_('Intimacoes').linhas.find(x => x.id === 'I855a')) === 'tratada', 'intimação fica "Resolvida" (sugestão confirmada)');
cx = C.caixaIntimacoes_({ status: 'tratadas_hoje' }, admin);
assert(cx.lista.some(x => x.id === 'I855a') && cx.placar.tratadas_hoje >= 1, 'aparece em "Resolvidas hoje"');
r = C.tratarIntimacao_({ id: 'I855a', acao: 'confirmar', tarefas: [t0[1]] }, admin);
assert(r.repetido && C.tabela_('Tarefas').linhas.length === nT + 2, 'clicar Confirmar duas vezes não cria tarefas repetidas');
const apr = C.tabela_('IaAprendizado').linhas;
assert(apr.some(a => a.ato === 'sentenca' && a.titulo === t0[0].titulo && a.rejeitadas === '1') && apr.some(a => a.titulo === '__prazo__' && a.aceitas === '1'), '👎 e 👍 ficam guardados para aprender');

// 👎 duas vezes na mesma tarefa → deixa de ser sugerida
C.inserirLinha_(tI, { id: 'I855b', chave: 'I855b', fonte: 'DJEN', recebido_em: agora, numero: proc.numero, processo_id: proc.id, tribunal: 'TRT12', movimento: 'Intimação', texto, criado_em: agora });
C.tratarIntimacao_({ id: 'I855b', acao: 'confirmar', tarefas: [], rejeitadas: [t0[0].titulo] }, admin);
C.inserirLinha_(tI, { id: 'I855c', chave: 'I855c', fonte: 'DJEN', recebido_em: agora, numero: proc.numero, processo_id: proc.id, tribunal: 'TRT12', movimento: 'Intimação', texto, criado_em: agora });
const ob3 = C.intimacaoObter_({ id: 'I855c' }, admin);
assert(!ob3.sugestao.tarefas.some(t => t.titulo === t0[0].titulo) && ob3.sugestao.tarefas.length >= 3, 'tarefa recusada 2 vezes deixa de ser sugerida (o painel aprendeu)');

// descartar com o prazo do robô → prazo cancelado; reabrir volta
C.inserirLinha_(tZ, { id: 'Z855c', processo_id: proc.id, numero: proc.numero, intimacao_id: 'I855c', descricao: 'Prazo de 5 dias', dias: '5', contagem: 'uteis', ciencia: hoje, fatal: C.somarDias_(hoje, 7), situacao: 'calculado', origem: 'robô', criado_em: agora });
C.atualizarLinha_(tI, tI.linhas.find(x => x.id === 'I855c'), { prazo_id: 'Z855c' });
C.tratarIntimacao_({ id: 'I855c', acao: 'descartar', cancelar_prazo: 1, motivo: 'É para a outra parte' }, maria);
const ic = () => C.tabela_('Intimacoes').linhas.find(x => x.id === 'I855c');
assert(C.statusCaixa_(ic()) === 'descartada' && C.tabela_('Prazos').linhas.find(x => x.id === 'Z855c').situacao === 'cancelado', 'Descartar tira a intimação e cancela o prazo do robô (quando marcado)');
assert(C.caixaIntimacoes_({ status: 'descartadas_hoje' }, admin).lista.some(x => x.id === 'I855c'), 'aparece em "Descartadas hoje"');
C.tratarIntimacao_({ id: 'I855c', acao: 'reabrir' }, admin);
assert(C.statusCaixa_(ic()) === 'nao' && !ic().terminada_por, 'Reabrir volta para "Para resolver"');

// histórico e prazo
C.tratarIntimacao_({ id: 'I855c', acao: 'historico', texto: 'Só ciência da juntada do laudo; nada a fazer.' }, admin);
assert(/nada a fazer/.test(C.tabela_('Processos').linhas.find(p => p.id === proc.id).observacoes) && ic().tratamento === 'historico', '"Só anotar no histórico" grava no processo e resolve');
C.inserirLinha_(tI, { id: 'I855d', chave: 'I855d', fonte: 'PJe TRT12', recebido_em: agora, numero: proc.numero, processo_id: proc.id, movimento: 'Expedido(a) intimação', texto: '', criado_em: agora });
r = C.tratarIntimacao_({ id: 'I855d', acao: 'prazo', prazo: { descricao: 'Contrarrazões', dias: '8', contagem: 'uteis', ciencia: hoje, alerta_dias: '3', etiqueta: 'recurso', responsavel: 'maria' } }, admin);
const zd = C.tabela_('Prazos').linhas.find(x => x.id === r.prazo_id);
assert(zd && zd.alerta_dias === '3' && zd.etiqueta === 'recurso' && zd.responsavel === 'maria' && zd.intimacao_id === 'I855d' && zd.fatal > hoje, 'Lançar prazo pela intimação: com "avisar 3 dias antes", etiqueta e responsável');
assert(C.tabela_('Intimacoes').linhas.find(x => x.id === 'I855d').prazo_id === r.prazo_id, 'a intimação fica ligada ao prazo novo');
C.inserirLinha_(tI, { id: 'I855e', chave: 'I855e', fonte: 'PJe TRT12', recebido_em: agora, numero: proc.numero, processo_id: proc.id, movimento: 'Expedido(a) intimação', texto: '', criado_em: agora });
r = C.tratarIntimacao_({ id: 'I855e', acao: 'tarefa', tarefa: { titulo: 'Ligar para o cliente', responsavel: 'maria', vence_em: hoje, categoria: 'cliente' } }, admin);
assert(r.tarefa_id && C.tabela_('Tarefas').linhas.find(t => t.id === r.tarefa_id).responsavel === 'maria' && C.statusCaixa_(C.tabela_('Intimacoes').linhas.find(x => x.id === 'I855e')) === 'tratada', 'Criar tarefa pela intimação resolve');
let erro = ''; try { C.tratarIntimacao_({ id: 'I855e', acao: 'evento' }, admin); } catch (e) { erro = e.message; }
assert(/agendar/.test(erro), 'audiência/evento vão por outra rota (Google Agenda), nunca pela rota rápida');

// andamentos importantes
C.inserirLinha_(tI, { id: 'I855s', chave: 'I855s', fonte: 'PJe TRT12', recebido_em: agora, numero: proc.numero, movimento: 'Proferida sentença de procedência em parte', texto: '', criado_em: agora });
C.inserirLinha_(tI, { id: 'I855j', chave: 'I855j', fonte: 'PJe TRT12', recebido_em: agora, numero: proc.numero, movimento: 'Juntada de petição de manifestação', texto: '', criado_em: agora });
let imp = C.andamentosImportantes_({ dias: 7 }, admin);
const s1 = imp.lista.find(x => x.numero === proc.numero && /sentença/i.test(x.texto));
assert(s1 && s1.rotulo === 'Sentença' && !imp.lista.some(x => /Juntada de petição/.test(x.texto)), 'andamentos importantes: sentença entra, juntada comum não');
C.andamentoVisto_({ chaves: [s1.chave] }, admin);
imp = C.andamentosImportantes_({ dias: 7 }, admin);
assert(imp.lista.find(x => x.chave === s1.chave).visto_em && imp.nao_vistos === imp.lista.filter(x => !x.visto_em).length, '✓ Visto fica gravado (com quem viu)');

// avisos por pessoa
C.salvarMeusAvisos_({ off: ['pix', 'chat', 'invalido'] }, maria);
const um = C.tabela_('Usuarios').linhas.find(x => x.usuario === 'maria');
assert(um.avisos === 'pix,chat' && C.publicoUsuario_(um).avisos_off === 'pix,chat', 'cada pessoa escolhe os avisos (guardado no cadastro e entregue no login)');
console.log('fim 855');
