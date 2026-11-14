// Edge Function "painel" (8.32, Etapa C) — a parte que não depende do Deno (testada também no Node: .github/motor/teste/etapaC.js).
// Recebe { token (código da sessão do banco), acao, dados, pedido, versao }, confere a pessoa no banco (painel_quem), carrega as abas,
// roda a rota com o MESMO Code.gs (motor.js) e grava tudo numa transação (painel_aplicar_pedido: tudo ou nada; o mesmo pedido não grava
// duas vezes; linha mudada por outro lado no meio = lê de novo e refaz). Precisa do Google (Gmail, Drive, Agenda, IA…), da senha
// ou de algo desligado → { voltar: true } e o navegador manda o mesmo pedido ao Apps Script (nada foi gravado aqui).
import { criarMotor, VERSAO_MOTOR } from './motor.js';

// nunca aqui: login/sessão e senhas (Apps Script), configuração do banco, rotas públicas e de outros caminhos
const NUNCA = /^(login|logout|sessao|primeiroAcesso|situacao|lote|banco\.|usuarios\.|senha\.|ext\.|future\.|consulta\.|site\.|djen\.robo|whats\.webhook|marketing\.ads)$|^(banco|usuarios|senha|ext|future|consulta|site)\./;

export function criarServidor({ rpc, base }) {
  const M = criarMotor(base);
  const aprendidas = new Map(); // rota → abas que ela usou (a próxima vez busca tudo numa ida só)

  async function atender(b) {
    b = b || {};
    if (b.ping) return { ok: true, versao: VERSAO_MOTOR };
    const acao = String(b.acao || ''), rota = M.rotas[acao];
    if (!rota || rota.publica || rota.ext || rota.future || NUNCA.test(acao)) return { voltar: true, motivo: 'esta rota fica no Google' };
    if (b.versao && b.versao !== VERSAO_MOTOR) return { voltar: true, motivo: 'versões diferentes (' + b.versao + ' × ' + VERSAO_MOTOR + ')' };
    let quem;
    try { quem = await rpc('painel_quem', { p_token: String(b.token || '') }); }
    catch (e) { return { voltar: true, sessao: true, motivo: 'sessão do banco: ' + e.message }; }
    const est = quem.estado || {};
    if (est.edge !== 'sim') return { voltar: true, motivo: 'motor do Supabase desligado' };
    if (est.pendente) return { voltar: true, motivo: 'há mudança chegando ao banco' };
    const esc = quem.escritorio_id, u = quem.usuario;
    const precisa = new Set(['config', 'usuarios'].concat(aprendidas.get(acao) || []));
    let raw = {}, conflitos = 0;
    for (let volta = 0; volta < 10; volta++) {
      const faltam = [...precisa].filter(t => !raw[t]);
      if (faltam.length) Object.assign(raw, await rpc('painel_tabelas', { p_escritorio: esc, p_tabelas: faltam }));
      const porAba = {}, versoes = {};
      Object.keys(M.esquema).forEach(aba => { const t = M.tabelaDe(aba); if (raw[t]) porAba[aba] = raw[t]; });
      const amb = {
        motivo: '', asaas: est.asaas === 'sim', raw: porAba,
        parar(m) { if (!amb.motivo) amb.motivo = m; },
        versao(aba, k) { // _sinc que a linha tinha quando foi lida (a gravação confere que ninguém mudou no meio)
          if (!versoes[aba]) {
            const x = porAba[aba], ic = x.cols.indexOf(M.esquema[aba].indexOf('id') >= 0 ? 'id' : '_n'), iv = x.cols.indexOf('_sinc'), m = {};
            x.linhas.forEach(l => { m[String(l[ic])] = l[iv]; });
            versoes[aba] = m;
          }
          return versoes[aba][String(k)];
        }
      };
      let r = null, erro = null;
      if (base.antesDeRodar) base.antesDeRodar(); // (só nos testes: códigos novos em sequência a cada tentativa)
      try { r = M.rodar(acao, b.dados, u, amb); } catch (e) { erro = e; }
      if (amb.motivo.startsWith('falta:')) { precisa.add(M.tabelaDe(amb.motivo.slice(6))); continue; }
      if (amb.motivo) return { voltar: true, motivo: amb.motivo };
      if (erro && !erro.publico) return { voltar: true, motivo: 'erro: ' + String(erro.message || erro).slice(0, 200) };
      aprendidas.set(acao, [...precisa]);
      const resposta = erro ? { ok: false, erro: erro.message } : { ok: true, dados: r.res === undefined ? null : JSON.parse(JSON.stringify(r.res)) };
      const ops = erro ? (erro.ops || []) : r.ops;
      if (ops.length) {
        try {
          const x = await rpc('painel_aplicar_pedido', { p_escritorio: esc, p_pedido: b.pedido ? String(b.pedido).slice(0, 80) : null, p_ops: ops, p_resposta: resposta });
          if (x && x.repetido) return x.resposta; // o mesmo pedido já tinha sido gravado: devolve a mesma resposta, sem gravar de novo
        } catch (e) {
          if (e.codigo === '40001' && conflitos++ < 2) { raw = {}; continue; } // alguém mudou a mesma linha no meio: lê de novo e refaz
          return { ok: false, erro: 'Não consegui gravar no banco de dados (' + String(e.message || e).slice(0, 160) + '). Nada foi gravado: tente de novo.' };
        }
        if (!erro) resposta.gravou = ops.some(o => o.t !== 'log');
      }
      return resposta;
    }
    return { voltar: true, motivo: 'abas demais' };
  }
  return { atender, versao: VERSAO_MOTOR };
}
