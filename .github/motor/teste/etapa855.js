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

// ---------- INSS (administrativo) ----------
{
  const cli = C.tabela_('Clientes').linhas.find(c => c.id && c.nome);
  let r = C.inssSalvar_({ cliente_id: cli.id, beneficio: 'Aposentadoria por idade' }, admin);
  const N = () => C.tabela_('Inss').linhas.find(x => x.id === r.id);
  const tarN = () => C.tabela_('Tarefas').linhas.filter(t => String(t.descricao || '').includes('[inss:' + r.id + ']'));
  assert(N() && N().etapa === 'assinado' && tarN().length === 2, 'INSS: pedido criado em "Contrato assinado" com as tarefas (pedir documentos, fazer o pedido no Meu INSS)');
  let erro = ''; try { C.inssEtapa_({ id: r.id, etapa: 'deferido' }, admin); } catch (e) { erro = e.message; }
  assert(/não dá para ir direto/.test(erro), 'INSS: não pula etapas sem sentido (assinado → aprovado)');
  C.inssEtapa_({ id: r.id, etapa: 'protocolado', protocolo: '123456789', der: hoje }, admin);
  assert(N().etapa === 'protocolado' && N().protocolo === '123456789' && N().der === hoje, 'INSS: pedido feito no INSS com protocolo e DER');
  C.inssEtapa_({ id: r.id, etapa: 'exigencia', exigencia: 'CNIS atualizado e laudo médico', ciencia: hoje }, admin);
  assert(N().exigencia_prazo === C.somarDias_(hoje, 30) && tarN().some(t => /Cumprir a exigência/.test(t.titulo) && t.prioridade === 'urgente' && t.vence_em < N().exigencia_prazo), 'INSS: exigência com prazo de 30 dias e tarefa urgente antes do fim');
  const per = C.somarDias_(hoje, 12);
  C.inssEtapa_({ id: r.id, etapa: 'pericia', pericia_data: per, pericia_hora: '09:30', pericia_local: 'Agência Tubarão' }, admin);
  assert(N().etapa === 'pericia' && tarN().some(t => /Avisar o cliente da perícia do INSS/.test(t.titulo) && !t.concluida_em), 'INSS: perícia marcada avisa a secretaria');
  assert(tarN().filter(t => /Cumprir a exigência/.test(t.titulo))[0].concluida_em, 'INSS: tarefas da etapa anterior fecham sozinhas');
  C.inssEtapa_({ id: r.id, etapa: 'indeferido', motivo: 'falta de qualidade de segurado', ciencia: hoje }, admin);
  assert(N().recurso_prazo === C.somarDias_(hoje, 30) && tarN().some(t => /Recurso ao INSS: prazo final/.test(t.titulo)), 'INSS: indeferido → prazo do recurso (30 dias) e tarefa');
  C.inssEtapa_({ id: r.id, etapa: 'recurso' }, admin);
  const nh = C.tabela_('Honorarios').linhas.length;
  C.inssEtapa_({ id: r.id, etapa: 'deferido', nb: '1234567890', valor_beneficio: '1.621,00', honorario: { valor_total: '3.242,00', parcelas: 2, primeiro: C.somarDias_(hoje, 30), regra: '2 benefícios' } }, admin);
  const hon = C.tabela_('Honorarios').linhas.slice(nh)[0];
  assert(N().etapa === 'deferido' && N().honorario_id === hon.id && Math.abs(C.dinheiro_(hon.valor_total) - 3242) < 0.01 && C.tabela_('Parcelas').linhas.filter(x => x.honorario_id === hon.id).length === 2, 'INSS: APROVADO lança o honorário (2 parcelas) no Financeiro');
  assert(JSON.parse(N().historico).length >= 7, 'INSS: linha do tempo guarda cada etapa');
  const r2 = C.inssSalvar_({ cliente_id: cli.id, beneficio: 'BPC/LOAS — idoso' }, admin);
  C.inssEtapa_({ id: r2.id, etapa: 'protocolado' }, admin); C.inssEtapa_({ id: r2.id, etapa: 'indeferido', ciencia: hoje }, admin);
  const np = C.tabela_('Processos').linhas.length; const rj = C.inssEtapa_({ id: r2.id, etapa: 'judicial' }, admin);
  assert(rj.processo_id && C.tabela_('Processos').linhas.length === np + 1 && C.tabela_('Processos').linhas.find(p => p.id === rj.processo_id).area === 'Previdenciário', 'INSS: "levar para a Justiça" abre a petição inicial previdenciária em Processos');
  const lst = C.inssListar_({}, admin);
  assert(lst.lista.length >= 2 && lst.etapas.length === 13, 'INSS: lista do quadro por etapa');
}
// ---------- comissão de indicação ----------
{
  const cli = C.tabela_('Clientes').linhas.find(c => c.id && C.tabela_('Parcelas').linhas.some(p => p.cliente_id === c.id && !p.pago_em && C.tabela_('Honorarios').linhas.some(h => h.id === p.honorario_id && h.tipo === 'exito')));
  C.salvarCliente_({ cliente: { id: cli.id, nome: cli.nome, indicado_por: 'Fulano Indicador', indicacao_pct: '10', indicacao_base: 'exito' } }, admin);
  const c2 = C.tabela_('Clientes').linhas.find(c => c.id === cli.id);
  assert(c2.indicado_por === 'Fulano Indicador' && c2.indicacao_pct === '10' && c2.indicacao_em, 'comissão: cadastro guarda quem indicou, % e desde quando');
  const parc = C.tabela_('Parcelas').linhas.find(p => p.cliente_id === cli.id && !p.pago_em && C.tabela_('Honorarios').linhas.some(h => h.id === p.honorario_id && h.tipo === 'exito'));
  C.registrarPagamento_({ id: parc.id, valor: '1000' }, admin);
  let cm = C.tabela_('Comissoes').linhas.filter(x => x.parcela_id === parc.id);
  assert(cm.length === 1 && cm[0].valor === '100.00' && cm[0].situacao === 'a pagar', 'comissão: parcela de êxito paga → 10% "a pagar" para quem indicou');
  C.gerarComissoes_(); assert(C.tabela_('Comissoes').linhas.filter(x => x.parcela_id === parc.id).length === 1, 'comissão: não repete');
  const nd = C.tabela_('Despesas').linhas.length;
  C.comissoesPagar_({ ids: [cm[0].id] }, admin);
  cm = C.tabela_('Comissoes').linhas.filter(x => x.parcela_id === parc.id);
  assert(cm[0].situacao === 'paga' && C.tabela_('Despesas').linhas.length === nd + 1 && C.tabela_('Despesas').linhas.slice(-1)[0].categoria === 'Comissão de indicação', '"Paguei" lança a despesa no Caixa');
  const l = C.comissoesListar_({}, admin); assert(l.indicadores.some(o => o.indicador === 'Fulano Indicador' && o.pago === 100), 'comissão: total por indicador');
}
// ---------- horas e fatura ----------
{
  const cli = C.tabela_('Clientes').linhas.find(c => c.id);
  C.horasIniciar_({ descricao: 'Réplica', cliente_id: cli.id }, maria);
  let h = C.horasListar_({}, maria); assert(h.rodando && h.rodando.descricao === 'Réplica', 'horas: cronômetro ligado aparece como rodando');
  C.horasIniciar_({ descricao: 'Outra coisa' }, maria);
  assert(C.tabela_('Horas').linhas.filter(x => x.usuario === 'maria' && x.inicio && !x.fim).length === 1, 'horas: só um cronômetro rodando por pessoa');
  C.horasParar_({}, maria);
  C.horasSalvar_({ dia: hoje, descricao: 'Audiência', cliente_id: cli.id, duracao: '1h30' }, maria);
  h = C.horasListar_({}, maria); assert(!h.rodando && h.lista.some(x => x.minutos === 90 && x.descricao === 'Audiência'), 'horas: lançar à mão (1h30 = 90 min)');
  const f = C.faturaPrevia_({ cliente_id: cli.id, valor_hora: '200' }, admin);
  assert(f.horas.some(x => x.minutos === 90 && Math.abs(x.valor - 300) < 0.01) && Math.abs(f.totais.total - (f.totais.honorarios + f.totais.horas + f.totais.despesas)) < 0.01, 'fatura: junta honorários + horas (1h30 × R$ 200 = R$ 300) + despesas');
  let er = ''; try { C.horasSalvar_({ id: h.lista[0].id, apagar: 1 }, { usuario: 'ana', nome: 'Ana', perfil: 'advogada' }); } catch (e) { er = e.message; }
  assert(/própria pessoa/.test(er), 'horas: só a própria pessoa (ou a administração) apaga');
}
// ---------- lista de expedientes do PJe ----------
{
  const tZ2 = C.tabela_('Prazos'), p = C.tabela_('Processos').linhas.find(x => x.numero && x.status !== 'arquivado');
  const cien = C.somarDias_(hoje, -3);
  C.inserirLinha_(tZ2, { id: 'ZPJE1', processo_id: p.id, numero: p.numero, descricao: 'Intimação sem prazo fixado no texto: 5 dias (art. 218, § 3º, CPC)', dias: '5', contagem: 'uteis', ciencia: cien, fatal: C.somarDias_(hoje, 2), situacao: 'calculado', origem: 'robô', criado_em: agora });
  const br = d => d.split('-').reverse().join('/');
  const prazoPje = C.somarDias_(hoje, 6);
  const texto = 'Expedientes\nATOrd ' + p.numero + '\nFULANO x EMPRESA LTDA\n2TRO ' + br(C.somarDias_(hoje, -5)) + ' - ' + br(cien) + ' ' + br(prazoPje) + '\nATSum 0009999-11.2026.5.12.0041\nX x Y\n1TRO 01/11/2026 - 03/11/2026 ' + br(C.somarDias_(hoje, 4));
  const itens = C.linhasListaPje_(texto);
  assert(itens.length === 2 && itens[0].prazo === prazoPje && itens[0].ciencia === cien, 'lista do PJe: lê nº do processo, ciência e prazo de cada linha');
  let r = C.importarListaPje_({ texto, ver: 1 }, admin);
  assert(r.ajustados.length === 1 && tZ2.linhas.find(z => z.id === 'ZPJE1').fatal !== prazoPje, 'lista do PJe: a prévia não muda nada');
  r = C.importarListaPje_({ texto }, admin);
  const z = C.tabela_('Prazos').linhas.find(z => z.id === 'ZPJE1');
  assert(z.fatal === prazoPje && z.situacao === 'conferido' && /vinculado ao PJe/.test(z.origem) && r.sem_processo.length === 1, 'lista do PJe: prazo do painel fica IGUAL ao do PJe (conferido, vinculado)');
}
// ---------- CRM recebe os dados do cadastro ----------
{
  const cli = C.tabela_('Clientes').linhas.find(c => c.id && C.tabela_('Leads').linhas.some(l => l.cliente_id === c.id));
  const tL = C.tabela_('Leads'); C.atualizarLinha_(tL, tL.linhas.find(x => x.cliente_id === cli.id), { canal: '', email: '' }); // cartão criado pelo cadastro: sem canal
  C.salvarCliente_({ cliente: { id: cli.id, nome: cli.nome, area: 'Família', como_conheceu: 'Instagram / Facebook', email: 'teste@exemplo.com' } }, admin);
  C.crmDadosCliente_(cli.id);
  const l = C.tabela_('Leads').linhas.find(x => x.cliente_id === cli.id);
  assert(l.area === 'Família' && l.canal === 'Instagram / Facebook' && l.email === 'teste@exemplo.com', 'CRM: área, e-mail e canal ("Como nos conheceu?") vêm do cadastro do cliente');
}
// ---------- audiência/perícia sem data: cobrança ----------
{
  const tT = C.tabela_('Tarefas'), p = C.tabela_('Processos').linhas.find(x => x.numero);
  C.inserirLinha_(tT, { id: 'TSD1', titulo: 'Perícia designada — abrir o processo e lançar na agenda (' + p.numero + ')', numero: p.numero, responsavel: 'maria', vence_em: C.somarDias_(hoje, -20), etapa: 'afazer', situacao: 'ativa', prioridade: 'alta', criado_em: C.somarDias_(hoje, -20) + 'T10:00:00Z' });
  C.cobrarAtosSemData_();
  assert(C.tabela_('Tarefas').linhas.find(t => t.id === 'TSD1').prioridade === 'urgente', 'ato sem data parado vira URGENTE');
  const ac = C.inicioAcoes_({}, admin);
  assert(ac.itens.some(x => x.tipo === 'semdata' && x.nivel === 'risco' && /há 20 dias/.test(x.titulo)), 'ato sem data aparece em vermelho no "Precisa de ação agora" com há quantos dias');
}
// ---------- ficha completa e audiência híbrida ----------
{
  const cli = C.tabela_('Clientes').linhas.find(c => c.id);
  C.salvarCliente_({ cliente: { id: cli.id, nome: cli.nome, ctps: '1234567 série 001', pis: '12345678901', nome_mae: 'Maria Teste', banco: 'Banco X', pix: 'cpf', falecido: 'sim', obito_em: '2026-01-02' } }, admin);
  const c = C.tabela_('Clientes').linhas.find(x => x.id === cli.id);
  assert(c.ctps === '1234567 série 001' && c.pis === '12345678901' && c.nome_mae === 'Maria Teste' && c.falecido === 'sim', 'ficha do cliente: CTPS, PIS, mãe, banco/Pix, falecido');
  const p = C.tabela_('Processos').linhas.find(x => x.numero);
  C.salvarFichaAto_({ lembrete: 'aud855', numero: p.numero, data: C.somarDias_(hoje, 5), tipo: 'instrucao', modo: 'Híbrida', forum: 'Fórum de Tubarão', sala: '2' }, admin);
  const f = C.tabela_('Audiencias').linhas.find(x => x.chave === 'aud855');
  assert(f.modo === 'hibrido' && f.forum === 'Fórum de Tubarão' && f.sala === '2', 'audiência: híbrida, com fórum e sala');
}
console.log('fim 855');
