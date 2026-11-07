/* Assistente do WhatsApp Web — fala com o painel do escritório (programa do Google). A chave do aparelho fica só neste Chrome. */
const API = 'https://script.google.com/macros/s/AKfycbwMffQm4vsbVo7fiTygLC8uxalR7ipQeZdK4y_0ieg2iPqMO4X981nrE9kll8BBrNl4/exec';
async function chamar(acao, dados) {
  const { token } = await chrome.storage.local.get('token');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ acao, token: token || '', dados: dados || {} }), redirect: 'follow', signal: ctl.signal });
    const j = await r.json();
    if (j && j.sessao) await chrome.storage.local.remove(['token', 'usuario']);
    return j;
  } catch (e) { return { ok: false, erro: e.name === 'AbortError' ? 'O painel demorou demais para responder.' : 'Sem conexão com o painel.' }; }
  finally { clearTimeout(t); }
}
chrome.runtime.onMessage.addListener((msg, _de, responder) => {
  (async () => {
    if (msg.tipo === 'api') return responder(await chamar(msg.acao, msg.dados));
    if (msg.tipo === 'ativar') {
      const r = await chamar('ext.ativar', { codigo: msg.codigo, nome: msg.nome || 'Chrome' });
      if (r.ok) await chrome.storage.local.set({ token: r.dados.token, usuario: r.dados.usuario });
      return responder(r);
    }
    responder({ ok: false, erro: 'Pedido desconhecido.' });
  })();
  return true;
});
