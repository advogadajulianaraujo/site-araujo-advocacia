// 8.42: Central de Prazos — fila da IA (429, tentativas, sem perder nada), sem baixa em lote, comprovante no Conferido, chat sem duplicar,
// relatório do dia, "esperando há muito tempo" e testemunhas nas anotações do cliente.
const T = require('./teste.js'); const { C, assert, logar, rodarServidor } = T;
const tok = logar('U1', '0');
const P = C.PropertiesService.getScriptProperties();
P.setProperty('GEMINI_CHAVE', 'chave-de-teste-123456789012345');
// 1) fila da IA: 1ª rodada o Google responde 429 → nada é dado como lido, tentativa contada, próxima tentativa no futuro, pausa
const tabI = C.tabela_('Intimacoes'); const alvo = tabI.linhas[0];
C.atualizarLinha_(tabI, alvo, { texto: 'Intimação: fica a parte autora intimada para, no prazo de 15 dias úteis, manifestar-se sobre o laudo pericial. '.repeat(3), recebido_em: new Date().toISOString(), resumo_ia: '', ia_tentativas: '', ia_erro: '', ia_proxima: '' });
const fa = C.UrlFetchApp.fetchAll, f1 = C.UrlFetchApp.fetch; let modoGoogle = 429;
const falso = q => ({ getResponseCode: () => modoGoogle, getContentText: () => modoGoogle === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ resumo: 'Intimação para manifestar sobre o laudo.', ato: 'intimação', providencia: 'Manifestação sobre o laudo', existe_prazo: 'sim', prazo_dias: 15, contagem: 'uteis', pericia: 'manifestar_laudo', trecho: 'no prazo de 15 dias úteis, manifestar-se sobre o laudo pericial', confiabilidade: 'alta', conferir: true, insuficiente: false }) }] } }] }) : JSON.stringify({ error: { message: 'Resource exhausted' } }) });
C.UrlFetchApp.fetchAll = reqs => reqs.map(q => /generativelanguage/.test(q.url) ? falso(q) : fa([q])[0]);
C.UrlFetchApp.fetch = (u, o) => /generativelanguage/.test(u) ? falso(o) : f1(u, o);
C.setConfig_('IA_PAUSA_ATE', '', 'x');
let r = C.resumirIntimacoes_(30000, 5);
let a2 = C.tabela_('Intimacoes').linhas.find(x => x.id === alvo.id);
assert(!a2.resumo_ia && +a2.ia_tentativas === 1 && a2.ia_proxima > new Date().toISOString(), 'com 429: NÃO marcou como lida, contou 1 tentativa e marcou a próxima (' + a2.ia_tentativas + ' · ' + a2.ia_proxima + ')');
assert(+C.config_('IA_PAUSA_ATE') > Date.now(), 'com 429: a IA pausa a rodada (cota do Google)');
// a próxima rodada antes da hora não tenta de novo
modoGoogle = 200; r = C.resumirIntimacoes_(30000, 5);
assert(r.motivo === 'cota do Google em pausa', 'durante a pausa nada é enviado ao Google');
C.setConfig_('IA_PAUSA_ATE', '', 'x'); C.atualizarLinha_(C.tabela_('Intimacoes'), C.tabela_('Intimacoes').linhas.find(x => x.id === alvo.id), { ia_proxima: new Date(Date.now() - 1000).toISOString() });
r = C.resumirIntimacoes_(30000, 5);
a2 = C.tabela_('Intimacoes').linhas.find(x => x.id === alvo.id);
assert(/laudo/.test(a2.resumo_ia) && JSON.parse(a2.ia_dados).pericia === 'manifestar_laudo' && !a2.ia_erro, 'depois da espera: lida, com os dados estruturados (perícia, trecho) e sem erro');
assert(C.tabela_('Chat').linhas.some(m => m.de === 'robô' && /perícia/.test(m.texto)), 'a leitura com perícia avisou a equipe no chat');
C.UrlFetchApp.fetchAll = fa; C.UrlFetchApp.fetch = f1;
// 2) sem baixa em lote dos vencidos
const tabZ = C.tabela_('Prazos'); const zv = tabZ.linhas.find(z => ['calculado', 'a definir'].includes(z.situacao));
C.atualizarLinha_(tabZ, zv, { fatal: '2020-01-10', situacao: 'calculado' });
r = rodarServidor('prazos.revisao', tok, { aplicar: true, categorias: ['vencidos'] });
assert(r.ok, 'revisão roda');
assert(C.tabela_('Prazos').linhas.find(z => z.id === zv.id).situacao === 'calculado', 'vencido NÃO é baixado em lote (continua aberto, na fila de urgência)');
// 3) Conferido com comprovante
r = rodarServidor('trabalho.conferir', tok, { tipo: 'prazo', id: zv.id, por: 'admin', comprovante: 'protocolo 123456 no eproc' });
const zc = C.tabela_('Prazos').linhas.find(z => z.id === zv.id);
assert(r.ok && zc.situacao === 'cumprido' && /comprovante: protocolo 123456/.test(zc.observacoes), 'Conferido guarda o comprovante do protocolo');
// 4) chat: a mesma mensagem 2 vezes = 1 só
const m1 = rodarServidor('chat.enviar', tok, { sala: 'geral', texto: 'teste duplicado 842' }), m2 = rodarServidor('chat.enviar', tok, { sala: 'geral', texto: 'teste duplicado 842' });
assert(m1.ok && m2.ok && m2.dados.repetida && C.tabela_('Chat').linhas.filter(m => m.texto === 'teste duplicado 842').length === 1, 'chat: clique duplo não grava duas vezes');
// 5) relatório do dia
r = rodarServidor('relatorio.semana', tok, { periodo: 'dia' });
assert(r.ok && r.dados.periodo === 'dia' && r.dados.inicio === r.dados.fim, 'relatório do DIA (início = fim)');
// 6) esperando há muito tempo
const tabA = C.tabela_('Assinaturas'), cli = C.tabela_('Clientes').linhas[3];
C.inserirLinha_(tabA, { id: 'ASteste842', cliente_id: cli.id, cliente_nome: cli.nome, documentos: 'Procuração e contrato', tipo_acao: '', parte_contraria: '', gerado_em: new Date(Date.now() - 12 * 86400000).toISOString(), gerado_por: 'admin', situacao: 'aguardando', assinado_em: '', assinado_por: '', processo_id: '', lembretes: '0', lembrete_em: '', pasta_url: '' });
r = rodarServidor('inicio.extras', tok, { dia: C.hojeSP_() });
assert(r.ok && r.dados.esperando.assinatura.some(x => x.cliente_id === cli.id && x.dias >= 12), 'Início: "ainda não assinaram" com 12 dias aparece');
// 7) testemunhas → anotação do cliente
const t7 = C.textoTestemunhas_({ data: '2026-12-10', hora: '14:00', numero: '0000001-00.2026.5.12.0001', testemunhas: [] });
assert(/nenhuma cadastrada ainda/.test(t7) && /nome completo, CPF e telefone/.test(t7), 'texto das testemunhas sem ninguém cadastrado pede nome, CPF e telefone');
const t8 = C.textoTestemunhas_({ data: '2026-12-10', numero: 'x', testemunhas: [{ nome: 'Fulano', telefone: '48 9999-0000', cpf: '', confirmou: 'sim' }] });
assert(/Fulano, tel\. 48 9999-0000, falta CPF, confirmou presença/.test(t8), 'texto com a testemunha cadastrada');
console.log('fim');
