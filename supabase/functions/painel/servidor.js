// Edge Function "painel" (8.32 Etapa C; 8.33 Etapa D: também o login) — a parte que não depende do Deno (testada também no Node: .github/motor/teste/etapaC.js).
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

  function abasDe(raw) { const porAba = {}; Object.keys(M.esquema).forEach(aba => { const t = M.tabelaDe(aba); if (raw[t]) porAba[aba] = raw[t]; }); return porAba; }
  function criarAmb(porAba, extra) {
    const versoes = {};
    const amb = Object.assign({
      motivo: '', raw: porAba,
      parar(m) { if (!amb.motivo) amb.motivo = m; },
      versao(aba, k) { // _sinc que a linha tinha quando foi lida (a gravação confere que ninguém mudou no meio)
        if (!versoes[aba]) {
          const x = porAba[aba], ic = x.cols.indexOf(M.esquema[aba].indexOf('id') >= 0 ? 'id' : '_n'), iv = x.cols.indexOf('_sinc'), m = {};
          x.linhas.forEach(l => { m[String(l[ic])] = l[iv]; });
          versoes[aba] = m;
        }
        return versoes[aba][String(k)];
      }
    }, extra || {});
    return amb;
  }
  /* 8.33 velocidade: as tabelas ficam na memória da função entre um pedido e outro. A cada pedido, uma consulta pequena
     (painel_assinaturas: linhas + última mudança + maior _n) diz quais mudaram, e só essas são buscadas de novo.
     (O código do painel só LÊ essas linhas: cada pedido monta objetos novos a partir delas.) */
  const memoria = new Map(); // escritório → Map(tabela → { sig, dados })
  let semAssinatura = false;
  async function carregar(esc, tabelas, forcar) {
    let m = memoria.get(esc); if (!m) { m = new Map(); memoria.set(esc, m); }
    let sigs = null;
    if (!semAssinatura) {
      try { sigs = await rpc('painel_assinaturas', { p_escritorio: esc, p_tabelas: tabelas }); }
      catch (e) { if (/painel_assinaturas|does not exist|schema cache/i.test(String(e.message))) semAssinatura = true; sigs = null; }
    }
    const buscar = tabelas.filter(t => forcar || !sigs || !m.has(t) || m.get(t).sig !== sigs[t]);
    if (buscar.length) {
      const raw = await rpc('painel_tabelas', { p_escritorio: esc, p_tabelas: buscar });
      buscar.forEach(t => { if (raw[t]) m.set(t, { sig: sigs ? sigs[t] : null, dados: raw[t] }); else m.delete(t); });
    }
    const r = {}; tabelas.forEach(t => { if (m.has(t)) r[t] = m.get(t).dados; });
    return r;
  }
  const hex = n => { let t = ''; while (t.length < n) t += base.randomUUID().replace(/-/g, ''); return t.slice(0, n); };
  const sha = t => base.createHash('sha256').update(String(t), 'utf8').digest('hex');

  /* 8.33 Etapa D: entrar no painel sem o Google (o mesmo login_ do Code.gs; a chave das senhas vem do cofre do Supabase).
     Devolve o que o Apps Script devolveria ({ token, usuario }) + a sessão do banco pronta (o que banco.sessao daria). */
  async function entrar(b) {
    if (b.versao && b.versao !== VERSAO_MOTOR) return { voltar: true, motivo: 'versões diferentes (' + b.versao + ' × ' + VERSAO_MOTOR + ')' };
    let info;
    try { info = await rpc('painel_login_info', {}); } catch (e) { return { voltar: true, motivo: 'entrar: ' + String(e.message || e).slice(0, 120) }; }
    if (!info || !info.segredo) return { voltar: true, motivo: 'entrar pelo Supabase está desligado' };
    const est = info.estado || {}, esc = info.escritorio_id;
    if (est.edge !== 'sim') return { voltar: true, motivo: 'motor do Supabase desligado' };
    if (est.pendente) return { voltar: true, motivo: 'há mudança chegando ao banco' };
    for (let vez = 0; vez < 3; vez++) {
      const raw = await carregar(esc, ['config', 'usuarios'], vez > 0);
      const amb = criarAmb(abasDe(raw), { segredo: info.segredo, falhas: +info.falhas || 0, asaas: est.asaas === 'sim' });
      let r = null, erro = null;
      if (base.antesDeRodar) base.antesDeRodar();
      try { r = M.entrar(b.dados, amb); } catch (e) { erro = e; }
      if (amb.motivo) return { voltar: true, motivo: amb.motivo };
      if (erro && !erro.publico) return { voltar: true, motivo: 'erro: ' + String(erro.message || erro).slice(0, 200) };
      const x = erro || r;
      if (x.falhou) { try { await rpc('painel_login_falha', { p_escritorio: esc }); } catch (e) { /* o bloqueio por pessoa já vai nas mudanças */ } }
      try { if (x.ops.length) await rpc('painel_aplicar_pedido', { p_escritorio: esc, p_pedido: null, p_ops: x.ops, p_resposta: null }); }
      catch (e) {
        if (e.codigo === '40001') continue; // a linha da pessoa mudou no meio: confere de novo
        return { ok: false, erro: 'Não consegui entrar agora (banco de dados: ' + String(e.message || e).slice(0, 120) + '). Tente de novo.' };
      }
      if (erro) return { ok: false, erro: erro.message };
      const codigo = hex(64), expira = new Date(Date.now() + r.maxMs).toISOString(), u = r.u;
      await rpc('painel_sessao_nova', { p_escritorio: esc, p_token_hash: sha(codigo), p_usuario_id: u.id, p_usuario: u.usuario, p_perfil: u.perfil,
        p_permissoes: r.perm, p_expira: expira, p_versao: r.versao, p_sessao: sha(r.res.token) });
      const dados = JSON.parse(JSON.stringify(r.res));
      dados.banco = { ligado: true, url: base.url, chave: est.publica || '', token: codigo, expira, versao: VERSAO_MOTOR, u, asaas: est.asaas === 'sim',
        permissoes: r.perm, tarefasFiltradasOk: r.tarefasOk, edge: base.url + '/functions/v1/painel' };
      return { ok: true, dados };
    }
    return { ok: false, erro: 'Não consegui entrar agora. Tente de novo.' };
  }

  async function atender(b) {
    b = b || {};
    if (b.ping) {
      const p = { ok: true, versao: VERSAO_MOTOR };
      if (b.entrar) { try { const i = await rpc('painel_login_info', {}); p.entrar = !!(i && i.segredo); } catch (e) { p.entrar = false; p.erro = String(e.message || e).slice(0, 120); } }
      return p;
    }
    if (b.acao === 'login' && b.entrar) return entrar(b);
    if (b.acao === 'logout' && b.sair) { try { await rpc('painel_sessao_sair', { p_token: String(b.token || '') }); } catch (e) { /* expira sozinha */ } return { ok: true }; }
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
    let raw = {}, conflitos = 0, forcar = false;
    for (let volta = 0; volta < 25; volta++) { // cada volta pode descobrir uma tabela que a tela usa (a próxima vez já busca todas juntas)
      const faltam = [...precisa].filter(t => !raw[t]);
      if (faltam.length) Object.assign(raw, await carregar(esc, faltam, forcar));
      const amb = criarAmb(abasDe(raw), { asaas: est.asaas === 'sim' });
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
          if (e.codigo === '40001' && conflitos++ < 2) { raw = {}; forcar = true; continue; } // alguém mudou a mesma linha no meio: lê de novo e refaz
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
