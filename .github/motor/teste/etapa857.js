// 8.57: assistente (IA embutida) — sem a chave do Gemini usa as regras; dados inventados. Caixa "Para resolver": vencida vira "Não foi feita" na hora.
const T = require('./teste.js'); const { C, assert } = T;
const admin = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' }, maria = { usuario: 'maria', nome: 'Maria Teste', perfil: 'estagiario' };
const hoje = C.hojeSP_();
let r = C.assistenteIA_({ pergunta: 'quais as audiências desta semana?' }, admin);
assert(r.plano.ferramenta === 'agenda' && Array.isArray(r.linhas) && /audiência|Nenhuma/.test(r.texto), 'pergunta de audiências vira consulta da agenda');
r = C.assistenteIA_({ pergunta: 'prazos vencidos' }, admin);
assert(r.plano.ferramenta === 'prazos' && r.colunas[0] === 'Data final' && r.linhas.every(x => /^#\/prazo\//.test(x.link)), 'prazos vencidos com link para cada prazo');
r = C.assistenteIA_({ pergunta: 'minhas tarefas' }, maria);
assert(r.plano.ferramenta === 'tarefas' && r.linhas.every(x => x.c[3] === 'Maria' || x.c[3] === 'maria'), 'colaboradora vê só as próprias tarefas');
r = C.assistenteIA_({ pergunta: 'honorários atrasados' }, maria);
assert(/não vê o financeiro/.test(r.texto), 'quem não tem financeiro não vê cobranças');
r = C.assistenteIA_({ pergunta: 'honorários atrasados' }, admin);
assert(r.plano.ferramenta === 'cobrancas' && r.colunas.length === 4, 'administração vê as cobranças');
const cli = C.tabela_('Clientes').linhas.find(c => c.nome && c.nome.split(' ').length >= 2);
const ent = C.entidadesIA_('o que tem do cliente ' + cli.nome + '?');
assert(ent.mapa['[CLIENTE1]'] && ent.mapa['[CLIENTE1]'].ids.includes(cli.id) && !C.normalizar_(ent.paraIA).includes(C.normalizar_(cli.nome.split(' ')[1])), 'nome do cliente é trocado por [CLIENTE1] antes de ir à IA');
const p = C.tabela_('Processos').linhas.find(x => x.numero);
const ent2 = C.entidadesIA_('como está o ' + p.numero);
assert(ent2.mapa['[PROCESSO1]'] && ent2.mapa['[PROCESSO1]'].numero === p.numero && !ent2.paraIA.includes(p.numero), 'número do processo é trocado por [PROCESSO1]');
r = C.executarIA_({ ferramenta: 'cliente', alvo: '[CLIENTE1]' }, { '[CLIENTE1]': { tipo: 'cliente', ids: [cli.id] } }, admin, hoje);
assert(r.texto.startsWith(cli.nome) && r.abrir === '#/cliente/' + cli.id, 'resumo do cliente com link para a ficha');
r = C.executarIA_({ ferramenta: 'cliente', alvo: '[CLIENTE1]' }, { '[CLIENTE1]': { tipo: 'cliente', ids: [cli.id, 'C1'] } }, admin, hoje);
assert(r.opcoes && r.opcoes.length === 2, 'dois clientes com o mesmo nome: pergunta qual');
r = C.executarIA_({ ferramenta: 'criar_tarefa', titulo: 'Ligar para [CLIENTE1]', pessoa: 'maria', data: hoje }, { '[CLIENTE1]': { tipo: 'cliente', ids: [cli.id] } }, admin, hoje);
const n0 = C.tabela_('Tarefas').linhas.length;
assert(r.acao && r.acao.tarefa.titulo === 'Ligar para ' + cli.nome && r.acao.tarefa.responsavel === 'maria' && C.tabela_('Tarefas').linhas.length === n0, 'criar tarefa só PROPÕE (nada gravado sem confirmar)');
r = C.executarIA_({ ferramenta: 'processo', alvo: '[PROCESSO1]' }, ent2.mapa, admin, hoje);
assert(r.texto.includes(p.numero) && r.abrir === '#/processo/' + p.id, 'situação do processo');
// caixa: prazo vencido = "nao_feita" na hora
const z = C.tabela_('Prazos').linhas.find(x => x.fatal && x.fatal < hoje && !/^ato:/.test(x.observacoes || ''));
if (z) { const i = { prazo_id: z.id, recebido_em: hoje }; const m = {}; m[z.id] = Object.assign({}, z, { situacao: 'calculado' }); assert(C.statusCaixa_(i, m) === 'nao_feita', 'intimação com prazo vencido sai de "Para resolver" na hora (Não foi feita)'); }
