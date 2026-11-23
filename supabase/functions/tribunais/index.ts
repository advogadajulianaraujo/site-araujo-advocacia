// Edge Function "tribunais" (Supabase) — 8.56. Lê as intimações PENDENTES direto do eproc pelo serviço oficial dos tribunais
// (MNI 2.2.2, operação consultarAvisosPendentes), com o usuário e a senha do eproc guardados no COFRE do Supabase.
// REGRA DE OURO: só consultarAvisosPendentes (lista o que está pendente, SEM dar ciência). NUNCA chamar consultarTeorComunicacao
// (abrir o teor = intimação considerada feita) nem confirmarRecebimento.
// O PJe recusa servidores de nuvem (403 antes do login): o PJe é lido pelo Chrome do escritório (extensão).
// Publicar: FUNCAO=tribunais node .github/motor/publicar-edge.mjs (verify_jwt = false: a pessoa é conferida pelo código da sessão do banco).
const URL_BANCO = Deno.env.get('SUPABASE_URL') ?? '';
const CHAVE = Deno.env.get('PAINEL_CHAVE') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const cab = (): Record<string, string> => { const h: Record<string, string> = { apikey: CHAVE, 'Content-Type': 'application/json' }; if (CHAVE.startsWith('eyJ')) h.Authorization = 'Bearer ' + CHAVE; return h; };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Um login por tribunal; cada tribunal tem um ou mais endereços do eproc (1º e 2º grau).
export const TRIBUNAIS: Record<string, { nome: string; dica: string; bases: Record<string, string> }> = {
  tjsc: { nome: 'TJSC (Justiça Estadual de SC)', dica: 'o usuário com que a Dra. entra no eproc do TJSC', bases: { 'TJSC 1º grau': 'https://eproc1g.tjsc.jus.br/eproc/', 'TJSC 2º grau': 'https://eproc2g.tjsc.jus.br/eproc/' } },
  trf4: { nome: 'Justiça Federal (JFSC e TRF4)', dica: 'o usuário com que a Dra. entra no eproc da Justiça Federal', bases: { 'JFSC': 'https://eproc.jfsc.jus.br/eprocV2/', 'TRF4': 'https://eproc.trf4.jus.br/eproc2trf4/' } },
  // TJRS: o eproc do TJRS recusa servidores (403, testado em 23/11/2026) — fica para a extensão do Chrome.
};

async function post(caminho: string, corpo: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(URL_BANCO + caminho, { method: 'POST', headers: { ...cab(), ...extra }, body: JSON.stringify(corpo) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* não é JSON */ }
  if (!r.ok) { const e: any = new Error((j && (j.message || j.msg || j.error || j.hint)) || ('erro ' + r.status)); e.status = r.status; throw e; }
  return j;
}
async function estado(esc: string): Promise<Record<string, any>> {
  const r = await fetch(`${URL_BANCO}/rest/v1/painel_estado?escritorio_id=eq.${esc}&chave=eq.tribunais&select=valor`, { headers: cab() });
  const j = r.ok ? await r.json() : []; try { return JSON.parse((j[0] && j[0].valor) || '{}') || {}; } catch { return {}; }
}
async function gravarEstado(esc: string, v: Record<string, any>) {
  await post('/rest/v1/painel_estado?on_conflict=escritorio_id,chave', [{ escritorio_id: esc, chave: 'tribunais', valor: JSON.stringify(v), em: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
}
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desc = (s: string) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const atr = (tag: string, nome: string) => (new RegExp('\\b' + nome + '="([^"]*)"').exec(tag) || [])[1] || '';

/** Lista as intimações pendentes de UM endereço do eproc (sem dar ciência). */
async function avisosPendentes(base: string, usuario: string, senha: string) {
  const t0 = Date.now();
  let loc = base + 'ws/controlador_ws.php?srv=intercomunicacao2.2';
  try {
    const w = await (await fetch(base + 'wsdl.php?srv=intercomunicacao2.2', { signal: AbortSignal.timeout(15000) })).text();
    loc = (w.match(/soap:address location="([^"]+)"/) || [])[1] || loc;
  } catch { /* usa o endereço padrão */ }
  const corpo = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ser="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">' +
    '<soapenv:Header/><soapenv:Body><ser:consultarAvisosPendentes><tip:idConsultante>' + esc(usuario) + '</tip:idConsultante><tip:senhaConsultante>' +
    esc(senha) + '</tip:senhaConsultante></ser:consultarAvisosPendentes></soapenv:Body></soapenv:Envelope>';
  const r = await fetch(loc, { method: 'POST', body: corpo, headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: 'consultarAvisosPendentes' }, signal: AbortSignal.timeout(45000) });
  const x = await r.text();
  const sucesso = /<[\w:]*sucesso>\s*true/i.test(x);
  const mensagem = desc((/<[\w:]*mensagem>([\s\S]*?)<\/[\w:]*mensagem>/.exec(x) || [])[1] || '').replace(/^-+>/, '').trim();
  const avisos: any[] = [];
  const re = /<([\w]+:)?aviso\b([^>]*)>([\s\S]*?)<\/\1?aviso>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(x)) && avisos.length < 500) {
    const ab = m[2], dentro = m[3];
    const dados = (/<[\w:]*(?:processo|dadosBasicos)\b[^>]*>/.exec(dentro) || [''])[0];
    const numero = atr(dados, 'numero') || ((/numero="(\d{20})"/.exec(dentro) || [])[1] || '');
    const orgao = desc(atr((/<[\w:]*orgaoJulgador\b[^>]*>/.exec(dentro) || [''])[0], 'nomeOrgao'));
    const dest = desc(atr((/<[\w:]*pessoa\b[^>]*>/.exec(dentro) || [''])[0], 'nome'));
    const disp = (/<[\w:]*dataDisponibilizacao>([^<]+)</.exec(dentro) || [])[1] || atr(ab, 'dataDisponibilizacao');
    avisos.push({ id: atr(ab, 'idAviso'), tipo: atr(ab, 'tipoComunicacao'), numero, orgao, destinatario: dest, disponibilizado: disp, classe: atr(dados, 'classeProcessual') });
  }
  if (!sucesso && !avisos.length) return { ok: false, http: r.status, mensagem: mensagem || ('o tribunal respondeu ' + r.status), ms: Date.now() - t0, avisos: [] };
  return { ok: true, http: r.status, mensagem, ms: Date.now() - t0, avisos };
}

async function lerTribunal(trib: string, cred: { usuario: string; senha: string }) {
  const t = TRIBUNAIS[trib]; const partes: any[] = [];
  for (const [nome, base] of Object.entries(t.bases)) {
    try { const r = await avisosPendentes(base, cred.usuario, cred.senha); partes.push({ nome, ...r }); }
    catch (e) { partes.push({ nome, ok: false, mensagem: /timed out|Timeout/i.test(String(e)) ? 'o tribunal não respondeu a tempo' : 'não consegui falar com o tribunal: ' + String((e as Error).message || e).slice(0, 120), avisos: [] }); }
  }
  return partes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let b: any = {};
  try { b = await req.json(); } catch { /* corpo vazio */ }
  try {
    if (b.acao === 'ping') return resp({ ok: true });
    // Só a administração mexe nos logins dos tribunais.
    const quem = await post('/rest/v1/rpc/painel_quem', { p_token: String(b.token || '') });
    if (!quem || !quem.usuario || quem.usuario.perfil !== 'administrador') return resp({ ok: false, erro: 'Só a administração pode ver e mudar os logins dos tribunais.' }, 403);
    const escId = String(quem.escritorio_id), por = String(quem.usuario.nome || quem.usuario.usuario || '');
    const creds: Record<string, any> = (await post('/rest/v1/rpc/painel_trib_info', { p_escritorio: escId })) || {};
    const st = await estado(escId);
    const lista = () => Object.entries(TRIBUNAIS).map(([id, t]) => ({ id, nome: t.nome, dica: t.dica, sistemas: Object.keys(t.bases),
      ligado: !!(creds[id] && creds[id].usuario), usuario: creds[id] && creds[id].usuario ? String(creds[id].usuario).replace(/^(.{2}).*(.{2})$/, '$1•••$2') : '',
      guardado_em: creds[id] && creds[id].em || '', guardado_por: creds[id] && creds[id].por || '', teste: st[id] || null }));
    if (b.acao === 'status') return resp({ ok: true, tribunais: lista() });
    const trib = String(b.tribunal || '');
    if (!TRIBUNAIS[trib]) return resp({ ok: false, erro: 'Escolha o tribunal.' }, 400);
    if (b.acao === 'apagar') {
      await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: trib, p_valor: '' });
      delete creds[trib]; delete st[trib]; await gravarEstado(escId, st);
      return resp({ ok: true, tribunais: lista() });
    }
    if (b.acao === 'guardar' || b.acao === 'testar') {
      let cred = creds[trib];
      if (b.acao === 'guardar') {
        const usuario = String(b.usuario || '').trim().slice(0, 80), senha = String(b.senha || '').slice(0, 200);
        if (!usuario || !senha) return resp({ ok: false, erro: 'Preencha o usuário e a senha do eproc.' }, 400);
        cred = { usuario, senha };
      }
      if (!cred || !cred.usuario) return resp({ ok: false, erro: 'Este tribunal ainda não tem login guardado.' }, 400);
      const partes = await lerTribunal(trib, cred);
      const algumOk = partes.some(p => p.ok), senhaErrada = partes.some(p => /autentica|senha|usu[aá]rio/i.test(p.mensagem || '') && !p.ok);
      // Só guarda no cofre se o tribunal aceitou o login (senha errada nunca fica guardada).
      if (b.acao === 'guardar') {
        if (!algumOk) return resp({ ok: false, erro: senhaErrada ? 'O eproc recusou o usuário ou a senha. Nada foi guardado.' : 'Não consegui falar com o eproc agora. Nada foi guardado.', partes: partes.map(p => ({ nome: p.nome, ok: p.ok, mensagem: p.mensagem })) });
        await post('/rest/v1/rpc/painel_trib_gravar', { p_escritorio: escId, p_trib: trib, p_valor: JSON.stringify({ usuario: cred.usuario, senha: cred.senha, em: new Date().toISOString(), por }) });
        creds[trib] = { usuario: cred.usuario, em: new Date().toISOString(), por };
      }
      const avisos = partes.flatMap(p => (p.avisos || []).map((a: any) => ({ ...a, sistema: p.nome })));
      st[trib] = { em: new Date().toISOString(), por, ok: algumOk, n: avisos.length, partes: partes.map(p => ({ nome: p.nome, ok: p.ok, n: (p.avisos || []).length, mensagem: p.ok ? '' : p.mensagem })) };
      await gravarEstado(escId, st);
      return resp({ ok: algumOk, erro: algumOk ? '' : (senhaErrada ? 'O eproc recusou o usuário ou a senha.' : 'O eproc não respondeu agora.'), avisos: avisos.slice(0, 300), partes: st[trib].partes, tribunais: lista() });
    }
    return resp({ ok: false, erro: 'Pedido inválido.' }, 400);
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return resp({ ok: false, erro: /sessão/i.test(m) ? 'Sessão expirada: entre de novo no painel.' : m.slice(0, 200) }, /sessão/i.test(m) ? 401 : 400);
  }
});
