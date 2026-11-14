process.env.TZ = 'America/Sao_Paulo';
const S = require('./sim.js');
const assert = (c, m) => { if (!c) { console.log('✗ FALHOU:', m); process.exitCode = 1; } else console.log('✓', m); };
// banco limpo
S.sql(`do $$ declare t text; begin for t in select table_name from information_schema.columns where table_schema='public' and column_name='escritorio_id' and table_name not like 'painel\\_%' loop execute format('truncate %I', t); end loop; end $$; delete from painel_sessoes; delete from painel_estado; delete from escritorios;`);
const G = S.criarGoogle(), C = G.ctx;
const P = C.PropertiesService.getScriptProperties();
P.setProperty('SUPABASE_URL', 'https://x.supabase.test'); P.setProperty('SUPABASE_CHAVE', 'sb_secret_' + 'x'.repeat(40)); P.setProperty('SUPABASE_PUBLICA', 'sb_publishable_' + 'y'.repeat(30));
// ---------- dados INVENTADOS ----------
const hoje = new Date(), dia = n => new Date(hoje.getTime() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10), iso = n => new Date(hoje.getTime() + n * 86400000).toISOString();
const add = (aba, objs) => { const cab = C.ESQUEMA[aba], sh = G.aba(aba); objs.forEach(o => sh._d.push(cab.map(k => o[k] === undefined ? '' : String(o[k])))); };
const nomes = ['Ana Teste', 'Bruno Exemplo', 'Carla Fictícia', 'Davi Modelo', 'Eva Simulada', 'Fábio Demo', 'Gina Amostra', 'Hugo Provisório'];
add('Usuarios', [
  { id: 'U1', usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador', ativo: 'sim', sessao_versao: '' },
  { id: 'U2', usuario: 'maria', nome: 'Maria Teste', perfil: 'estagiario', ativo: 'sim', sessao_versao: '' },
  { id: 'U3', usuario: 'rh', nome: 'RH Teste', perfil: 'rh', ativo: 'sim', sessao_versao: '2' },
  { id: 'U4', usuario: 'ana', nome: 'Ana Adv', perfil: 'advogada', ativo: 'sim', sessao_versao: '' }]);
add('Config', [{ chave: 'RESP_PJE', valor: 'maria' }, { chave: 'RESP_EPROC', valor: 'ana' }, { chave: 'MARKETING_ADS_CHAVE', valor: 'segredo-nao-pode-sair' }, { chave: 'LINK_AVALIACAO', valor: 'https://exemplo.test/avaliar' }, { chave: 'ASSIN_ANTIGAS', valor: '2026-11-01' }, { chave: 'WHATS_PIX_TXT', valor: 'PIXSECRETO' }]);
add('Feriados', [{ data: dia(10), descricao: 'Feriado de teste', abrangencia: 'nacional' }]);
const cli = [], proc = [], inti = [], praz = [], tar = [], hon = [], parc = [], ass = [], lea = [], eve = [], aud = [];
const NC = +process.env.N || 40;
for (let i = 0; i < NC; i++) {
  cli.push({ id: 'C' + i, tipo: 'PF', nome: nomes[i % 8] + ' ' + i, cpf_cnpj: String(10000000000 + i * 7), telefone: '48 9' + String(8000000 + i), cidade: 'Cidade ' + (i % 3), area: ['Trabalhista', 'Previdenciário', 'Família'][i % 3],
    situacao: i % 5 ? 'completo' : 'importado — conferir', observacoes: i % 4 ? `14/11/2026 10:00 admin: anotação ${i} ` + 'texto de observação '.repeat(i % 40) + '\nlinha 2' : '', criado_em: iso(-i * 3), acesso_hash: i % 6 ? '' : 'HASHSECRETO' + i, origem: 'painel', jornada: '' });
  const pid = 'P' + i;
  proc.push({ id: pid, cliente_id: i % 9 ? 'C' + i : '', cliente_nome: i % 9 ? '' : 'Parte Sem Cadastro ' + i, numero: `00${String(10000 + i)}-1${i % 10}.2026.5.12.00${String(10 + (i % 50)).padStart(2, '0')}`, tribunal: 'TRT12', sistema: 'PJe',
    orgao: 'Vara ' + (i % 4), area: ['Trabalhista', 'Previdenciário', 'Família'][i % 3], status: i % 7 ? 'ativo' : 'arquivado', fase: ['contratado', 'ajuizado', 'andamento', 'sentenca', 'extinto'][i % 5], proximo_ato: i % 3 ? 'Audiência' : '', proximo_ato_data: i % 3 ? dia(i - 10) : '',
    ultimo_movimento: 'Movimento ' + i, ultimo_movimento_em: dia(-i), criado_em: iso(-i), responsavel: i % 2 ? 'maria' : 'ana', andamentos: i % 3 ? '[{"data":"2026-11-01","nome":"Juntada"}]' : (i % 2 ? '-' : '') });
  inti.push({ id: 'I' + i, chave: 'k' + i, fonte: i % 2 ? 'Gmail' : 'DJEN', recebido_em: iso(-i), numero: proc[i].numero, tribunal: 'TRT12', movimento: 'Intimação ' + i, evento: 'Ev', texto: 'Texto de teste ' + i, processo_id: pid, prazo_id: 'Z' + i, criado_em: iso(-i), terminada_por: i % 4 === 0 ? 'maria' : '', ok_por: i % 8 === 0 ? 'admin' : '' });
  praz.push({ id: 'Z' + i, processo_id: pid, numero: proc[i].numero, intimacao_id: 'I' + i, descricao: i % 3 ? 'Manifestação' : 'PROVISÓRIO — conferir', dias: '5', contagem: 'uteis', ciencia: dia(-i % 10), fatal: dia(i % 15 - 5),
    situacao: ['aberto', 'conferido', 'cumprido', 'a definir'][i % 4], responsavel: i % 3 ? 'maria' : '', criado_em: iso(-i), origem: 'robô', cumprido_em: i % 4 === 2 ? iso(-1) : '' });
  if (i < NC * 0.6) tar.push({ id: 'T' + i, titulo: 'Tarefa ' + i, responsavel: ['maria', 'ana', '', 'admin'][i % 4], criado_por: ['admin', 'maria', 'maria', 'ana'][i % 4], vence_em: dia(i - 8), etapa: ['afazer', 'fazendo', 'revisar', 'protocolado'][i % 4],
    peso: '2', situacao: i % 9 ? '' : 'cancelada', prioridade: 'normal', cliente_id: 'C' + i, processo_id: pid, criado_em: iso(-i), descricao: i % 5 ? (i % 2 ? 'Texto privado da tarefa ' + i + ' [fluxo:P' + i + '|andamento]' : '') : 'Ligar para o cliente [intim:I' + i + ']', concluida_em: i % 4 === 3 ? iso(-2) : '' });
  if (i < NC * 0.5) {
    hon.push({ id: 'H' + i, cliente_id: 'C' + i, processo_id: pid, tipo: i % 2 ? 'fixo' : 'exito', descricao: 'Honorário ' + i, valor_total: String(1000 + i * 100), percentual: i % 2 ? '' : '30', situacao: i % 7 ? 'ativo' : 'cancelado', criado_em: iso(-30) });
    for (let k = 1; k <= 3; k++) parc.push({ id: 'Q' + i + '_' + k, honorario_id: 'H' + i, cliente_id: 'C' + i, numero: String(k), vencimento: dia((k - 2) * 30 + i), valor: String(300 + i), pago_em: k === 1 && i % 2 ? dia(-20) : '', valor_pago: k === 1 && i % 2 ? String(300 + i) : '', forma: k === 1 && i % 2 ? 'PIX' : '' });
  }
  if (i < 10) ass.push({ id: 'A' + i, cliente_id: 'C' + i, cliente_nome: cli[i].nome, documentos: 'procuração, contrato', tipo_acao: 'Trabalhista', gerado_em: iso(-i), gerado_por: 'admin', situacao: ['aguardando', 'assinado', 'desistiu'][i % 3] });
  if (i < 12) lea.push({ id: 'L' + i, criado_em: iso(-i), nome: 'Lead ' + i, telefone: '48 99' + i, etapa: ['novo', 'contato', 'atendido', 'ganho', 'perdido'][i % 5], cliente_id: i % 2 ? 'C' + i : '', canal: 'site', cadastro_token: i % 3 ? '' : 'TOKENSECRETO' });
  if (i < 8) { eve.push({ chave: 'e' + i, tipo: 'audiência de conciliação', numero: proc[i].numero, data: dia(i), hora: '14:00', agenda: 'AUDIÊNCIA CONCILIAÇÃO', criado_em: iso(-1) }); aud.push({ chave: 'e' + i, numero: proc[i].numero, data: dia(i), hora: '14:00', tipo: 'conciliação', modo: 'online' }); }
}
if (process.env.N) { const extra = []; inti.forEach((x, k) => { for (let r = 1; r < 3; r++) extra.push(Object.assign({}, x, { id: x.id + 'r' + r, chave: x.chave + 'r' + r, texto: 'Texto longo da intimação '.repeat(20) })); }); inti.push(...extra); }
add('Clientes', cli); add('Processos', proc); add('Intimacoes', inti); add('Prazos', praz); add('Tarefas', tar); add('Honorarios', hon); add('Parcelas', parc); add('Assinaturas', ass); add('Leads', lea); add('Eventos', eve); add('Audiencias', aud);
add('Log', [{ quando: iso(-1), usuario: 'maria', acao: 'prazo cumprido', detalhe: 'Z2' }, { quando: iso(0), usuario: 'admin', acao: 'login', detalhe: '' }]);

// ---------- 1) cópia completa ----------
let t = Date.now(); const cp = C.copiarParaSupabase_(240000, true);
assert(cp.erros.length === 0, 'cópia completa sem erros (' + cp.copiadas.length + ' abas, ' + (Date.now() - t) + ' ms) ' + (cp.erros[0] || ''));
assert(S.sql("select count(*) from clientes") === String(NC), NC + ' clientes no banco');
assert(S.sql("select count(*) from clientes where acesso_hash = 'HASHSECRETO0'") === '1', 'acesso_hash copiado (só o servidor lê)');
assert(S.sql("select count(*) from information_schema.columns where table_name='usuarios' and column_name in ('hash','salt')") === '0', 'usuarios sem hash/salt');

// ---------- sessões ----------
function logar(id, versao) { const tok = require('crypto').randomBytes(48).toString('hex'); C.CacheService.getScriptCache().put('sessao_' + tok, [id, versao || '0', Date.now()].join('|')); return tok; }
const rodarServidor = (acao, tok, dados) => { const r = JSON.parse(C.doPost({ postData: { contents: JSON.stringify({ acao, token: tok, dados: dados || {} }) } }).getContent()); return r; };
module.exports = { S, G, C, assert, logar, rodarServidor, iso, dia, add };
