// 8.58: Processos em 3 abas (petição protocolada no INSS vira pedido do INSS) + IA jurídica (Gemini simulado). Dados inventados.
const T = require('./teste.js'); const { C, assert } = T;
const admin = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };
// petição sem número → protocolada no INSS
const cli = C.tabela_('Clientes').linhas.find(c => c.nome && c.nome.split(' ').length >= 2);
const pr = C.salvarProcesso_({ processo: { cliente_id: cli.id, area: 'Previdenciário', tipo_acao: 'Aposentadoria por idade', fase: 'contratado' } }, admin);
const pid = pr.id || (pr.processo && pr.processo.id);
assert(C.tabela_('Processos').linhas.some(p => p.id === pid && !p.numero), 'petição previdenciária sem número criada');
let erro = ''; try { C.protocolarNoInss_({ id: pid, protocolo: '' }, admin); } catch (e) { erro = e.message; }
assert(/protocolo/.test(erro), 'sem o nº do protocolo não protocola no INSS');
const r = C.protocolarNoInss_({ id: pid, protocolo: '123456789', der: C.hojeSP_() }, admin);
const ped = C.tabela_('Inss').linhas.find(x => x.id === r.id);
assert(ped && ped.etapa === 'protocolado' && ped.protocolo === '123456789' && ped.der === C.hojeSP_(), 'vira pedido do INSS em "Pedido feito no INSS" com protocolo e DER');
const pAp = C.tabela_('Processos').linhas.find(p => p.id === pid);
assert(!pAp || pAp.status === 'arquivado' || pAp.apagado || !pAp.cliente_id || /apagad/i.test(JSON.stringify(pAp)), 'a petição sai de Processos');
assert(C.tabela_('Tarefas').linhas.some(t => String(t.descricao || '').includes('[inss:' + r.id + ']') && /Meu INSS/.test(t.titulo) && C.abertaT_(t)), 'tarefa de acompanhar no Meu INSS criada');
// IA jurídica: regras reconhecem pergunta de Direito; com Gemini simulado devolve Markdown e usa o caso anonimizado
assert(C.planoRegrasIA_('quais os requisitos do vinculo de emprego?').ferramenta === 'juridico', 'pergunta de Direito vai para a IA jurídica (sem a chave)');
assert(C.planoRegrasIA_('audiências desta semana').ferramenta === 'agenda', 'pergunta do painel continua no painel');
let pedido = null;
C.chaveIA_ = () => 'x';
C.geminiTexto_ = (parts, opc) => { pedido = { txt: parts[0].text, sis: opc.sistema }; return { texto: '**Em resumo:** são pessoalidade, onerosidade, não eventualidade e subordinação.\n## Fundamento legal\n- arts. 2º e 3º da CLT\n_A IA auxilia; a decisão é sempre da advogada responsável._' }; };
const proc = C.tabela_('Processos').linhas.find(p => p.numero && p.cliente_id);
const out = C.assistenteIA_({ pergunta: 'quais os requisitos do vínculo no processo ' + proc.numero + '?', modo: 'juridico' }, admin);
assert(out.juridico && out.md && /Fundamento legal/.test(out.texto), 'modo jurídico responde em Markdown organizado');
assert(pedido && /CASO \[PROCESSO1\]/.test(pedido.txt) && !pedido.txt.includes(proc.numero), 'o caso vai à IA sem o número do processo');
assert(/nunca invente número de processo/i.test(pedido.sis), 'regra: nunca inventar julgado');
assert(out.caso && out.caso.link === '#/processo/' + proc.id, 'a resposta mostra qual caso foi usado');
const out2 = C.assistenteIA_({ pergunta: 'crie uma tarefa para eu ligar para o cliente amanhã', modo: 'juridico' }, admin);
assert(!out2.juridico, 'no modo jurídico, pedido de tarefa continua virando tarefa');


const out3 = C.assistenteIA_({ pergunta: 'e se ele era MEI?', modo: 'juridico', conversa: [{ p: 'requisitos do vínculo', r: 'Em resumo: são cinco requisitos.' }] }, admin);
assert(out3.juridico && /CONVERSA ATÉ AGORA/.test(pedido.txt) && /cinco requisitos/.test(pedido.txt), 'a IA recebe a conversa anterior (memória)');

const out4 = C.assistenteIA_({ pergunta: 'o que é litispendência?', modo: 'auto' }, admin);
assert(out4.juridico, 'caixa única (auto): pergunta de Direito vai para a IA jurídica');
