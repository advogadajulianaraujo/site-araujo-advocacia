/* 1.4.0 (pedido da usuária, 23/11/2026: "não podemos perder audiência, perícia, intimação"): com a tela de EXPEDIENTES do PJe aberta neste
   Chrome, a extensão manda a lista (nº do processo + datas) ao painel, que deixa o prazo igual ao do PJe e cria o que faltar.
   Não guarda senha, não clica em nada e não abre o expediente (ler a lista não dá ciência). Manda no máximo a cada 20 min por página. */
(function () {
  const RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
  let ultimo = '', enviando = false;
  const temLista = t => /pje/i.test(location.hostname + location.pathname) && /expedientes/i.test(t) && (t.match(RE) || []).length >= 1 && /\d{2}\/\d{2}\/\d{4}/.test(t) && /expediente|prazo|ci[eê]ncia/i.test(t);
  function botao(n, estado) {
    let b = document.getElementById('araujo-pje');
    if (!b) { b = document.createElement('button'); b.id = 'araujo-pje'; b.type = 'button';
      b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1C1A17;color:#F4F0E8;border:0;border-radius:10px;padding:10px 14px;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);cursor:pointer';
      b.addEventListener('click', () => mandar(true)); document.body.appendChild(b); }
    b.textContent = estado || ('📥 Mandar ' + n + ' processo(s) ao painel Araújo');
  }
  function mandar(forcar) {
    const t = document.body ? document.body.innerText : '';
    if (!temLista(t) || enviando) return;
    const chave = (t.match(RE) || []).join(',') + '|' + (t.match(/\d{2}\/\d{2}\/\d{4}/g) || []).join(',');
    const n = new Set(t.match(RE) || []).size;
    let guardado = {}; try { guardado = JSON.parse(sessionStorage.getItem('araujo_pje') || '{}'); } catch (e) { /* ok */ }
    if (!forcar && (chave === ultimo || (guardado.chave === chave && Date.now() - guardado.em < 20 * 60000))) { botao(n, '✓ Painel Araújo em dia (' + n + ')'); return; }
    enviando = true; botao(n, '⏳ Mandando ao painel…');
    chrome.runtime.sendMessage({ tipo: 'api', acao: 'ext.pjeLista', dados: { texto: t.slice(0, 400000) } }, r => {
      enviando = false;
      if (r && r.ok) { ultimo = chave; try { sessionStorage.setItem('araujo_pje', JSON.stringify({ chave, em: Date.now() })); } catch (e) { /* ok */ }
        const d = r.dados || {}; botao(n, '✓ Painel: ' + (d.ajustados ? d.ajustados.length : 0) + ' ajustado(s), ' + (d.novos ? d.novos.length : 0) + ' novo(s)'); }
      else botao(n, '⚠ ' + ((r && r.erro) || 'não deu para mandar') + ' — clique para tentar');
    });
  }
  // 1.5.0: avisa o fundo da extensão que esta é uma tela de Expedientes (para reabrir sozinha de 2 em 2 h) ou que o PJe pediu para entrar de novo
  function relatar() {
    const t = document.body ? document.body.innerText : '';
    if (temLista(t)) chrome.runtime.sendMessage({ tipo: 'pjeUrl', url: location.href, host: location.hostname, n: new Set(t.match(RE) || []).size });
    else if (/sso\.cloud\.pje|login/i.test(location.href) || /certificado digital|PJeOffice|entrar com certificado/i.test(t)) chrome.runtime.sendMessage({ tipo: 'pjeLogin', host: location.hostname, url: location.href });
  }
  setTimeout(relatar, 8000);
  let timer = null;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => mandar(false), 2500); }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => mandar(false), 3000);
})();
