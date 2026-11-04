(() => {
  'use strict';
  const menu = document.querySelector('.menu');
  const nav = document.querySelector('.nav');
  function setMenu(open) {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    menu.textContent = open ? 'Fechar' : 'Menu';
  }
  menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // Marketing (8.6): de onde a pessoa veio — anúncio do Google (gclid/utm cpc), Google sem anúncio, redes ou direto.
  // Fica só nesta aba do navegador; nenhum dado pessoal é guardado ou enviado.
  const origemVisita = (() => {
    try {
      const salvo = sessionStorage.getItem('aa_origem');
      const q = new URLSearchParams(location.search), ref = document.referrer || '';
      const ads = q.get('gclid') || q.get('gbraid') || q.get('wbraid') || /cpc|ppc|paid|ads/i.test(q.get('utm_medium') || '');
      let o = ads ? 'ads' : /google\./.test(ref) ? 'google' : /instagram|facebook|fb\.|t\.co|linkedin/.test(ref) ? 'social' : ref && !ref.includes(location.host) ? 'outro' : '';
      const camp = (q.get('utm_campaign') || '').slice(0, 60);
      if (o && (!salvo || o === 'ads')) { sessionStorage.setItem('aa_origem', o); if (camp) sessionStorage.setItem('aa_camp', camp); }
      return { origem: sessionStorage.getItem('aa_origem') || 'direto', campanha: sessionStorage.getItem('aa_camp') || '' };
    } catch (e) { return { origem: 'direto', campanha: '' }; }
  })();
  let apiPainel = '';
  const lerApi = () => new Promise(res => {
    if (window.PAINEL_API_URL) return res(window.PAINEL_API_URL);
    const sc = document.createElement('script'); sc.src = '/painel/config.js'; sc.onload = () => res(window.PAINEL_API_URL || ''); sc.onerror = () => res('');
    document.head.append(sc);
  });
  if (document.body.dataset.area !== 'acompanhe') lerApi().then(u => { apiPainel = u; });
  // cada clique no WhatsApp ou no telefone conta no Marketing do painel (página, área e se veio de anúncio)
  document.addEventListener('click', ev => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || !apiPainel || document.body.dataset.area === 'acompanhe') return;
    const canal = /wa\.me|whatsapp/.test(a.href) ? 'whatsapp' : /^tel:/.test(a.href) ? 'telefone' : '';
    if (!canal) return;
    const corpo = JSON.stringify({ acao: 'site.clique', dados: { pagina: location.pathname, area: document.body.dataset.area || '', origem: origemVisita.origem, campanha: origemVisita.campanha, canal } });
    try { if (!navigator.sendBeacon || !navigator.sendBeacon(apiPainel, corpo)) fetch(apiPainel, { method: 'POST', body: corpo, credentials: 'omit', keepalive: true, mode: 'no-cors' }); } catch (e) { /* não atrapalha o clique */ }
  }, true);

  // Onde o clique no WhatsApp aconteceu (sem texto da mensagem nem dados do caso).
  document.querySelectorAll('[data-contact]').forEach(a => a.addEventListener('click', () => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'contact_click', contact_channel: 'whatsapp', contact_location: a.dataset.contact, practice_area: document.body.dataset.area || 'geral' });
  }));

  // Botão flutuante do WhatsApp e "Prefere que a gente ligue?" (em todas as páginas, menos no painel).
  const WA = 'https://wa.me/5548996126491?text=' + encodeURIComponent('Olá, Dra. Júlian. Gostaria de informações sobre o atendimento.');
  const area = document.body.dataset.area || 'geral';
  if (area !== 'acompanhe') {
    const flut = document.createElement('div');
    flut.className = 'flutuante';
    flut.innerHTML = '<a class="flut-wa" href="' + WA + '" target="_blank" rel="noopener noreferrer" data-contact="flutuante" aria-label="Falar no WhatsApp">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>' +
      '<span>WhatsApp</span></a>' +
      '<button type="button" class="flut-liga" aria-haspopup="dialog">Prefere que a gente ligue?</button>';
    if (document.querySelector('a.float')) flut.classList.add('tem-float'); // no computador já existe o "Fale conosco"
    document.body.append(flut);
    const rolou = () => flut.classList.toggle('rolou', scrollY > 500 || document.body.dataset.area === 'contato'); rolou(); addEventListener('scroll', rolou, { passive: true });
    flut.querySelector('[data-contact]').addEventListener('click', () => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'contact_click', contact_channel: 'whatsapp', contact_location: 'flutuante', practice_area: area });
    });
    let caixa = null;
    const carregarApi = () => new Promise(res => {
      if (window.PAINEL_API_URL) return res(window.PAINEL_API_URL);
      const sc = document.createElement('script'); sc.src = '/painel/config.js'; sc.onload = () => res(window.PAINEL_API_URL || ''); sc.onerror = () => res('');
      document.head.append(sc);
    });
    document.querySelectorAll('[data-abrir-ligue]').forEach(b => b.addEventListener('click', () => flut.querySelector('.flut-liga').click()));
    flut.querySelector('.flut-liga').addEventListener('click', () => {
      if (!caixa) {
        caixa = document.createElement('dialog');
        caixa.className = 'liga-caixa';
        caixa.innerHTML = '<form method="dialog" class="liga-form" novalidate>' +
          '<button type="button" class="liga-fechar" aria-label="Fechar">×</button>' +
          '<h2>Prefere que a gente ligue?</h2><p>Deixe seu nome e telefone. A equipe retorna em horário comercial. Não precisa contar o caso agora.</p>' +
          '<label>Seu nome<input name="nome" autocomplete="name" required maxlength="80"></label>' +
          '<label>Telefone com DDD<input name="telefone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(48) 99999-9999"></label>' +
          '<label>Assunto<select name="assunto"><option>Trabalhista</option><option>Empresa / assessoria</option><option>Previdenciário (INSS)</option><option>Banco, compra ou contrato</option><option>Família</option><option>Criminal</option><option>Outro assunto</option></select></label>' +
          '<label>Melhor horário<select name="horario"><option value="qualquer">Qualquer horário</option><option value="manha">Manhã</option><option value="tarde">Tarde</option></select></label>' +
          '<input name="empresa_site" tabindex="-1" autocomplete="off" class="liga-mel" aria-hidden="true">' +
          '<label class="liga-aceite"><input type="checkbox" name="aceite"><span>Autorizo o escritório a entrar em contato pelo telefone informado (<a href="/privacidade/">privacidade</a>).</span></label>' +
          '<button class="btn" type="submit">Pedir retorno</button><p class="liga-msg" role="status"></p></form>';
        document.body.append(caixa);
        const f = caixa.querySelector('form'), msg = caixa.querySelector('.liga-msg');
        caixa.querySelector('.liga-fechar').addEventListener('click', () => caixa.close());
        f.addEventListener('submit', async ev => {
          ev.preventDefault();
          msg.textContent = ''; msg.className = 'liga-msg';
          const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Enviando…';
          try {
            const api = await carregarApi();
            if (!api) throw new Error('Não foi possível enviar agora. Chame no WhatsApp, por favor.');
            const dados = { nome: f.nome.value, telefone: f.telefone.value, assunto: f.assunto.value, horario: f.horario.value, aceite: f.aceite.checked, empresa_site: f.empresa_site.value, pagina: location.pathname, origem: origemVisita.origem, campanha: origemVisita.campanha };
            const r = await fetch(api, { method: 'POST', body: JSON.stringify({ acao: 'site.contato', dados }), redirect: 'follow', credentials: 'omit' }).then(x => x.json());
            if (!r.ok) throw new Error(r.erro || 'Não foi possível enviar.');
            f.querySelectorAll('label, .btn').forEach(e => { e.hidden = true; });
            msg.className = 'liga-msg ok'; msg.textContent = 'Recebido! Vamos ligar para você em breve, em horário comercial. Se for urgente, chame no WhatsApp.';
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'contact_click', contact_channel: 'formulario', contact_location: 'ligamos', practice_area: area });
          } catch (e) { msg.className = 'liga-msg erro'; msg.textContent = e.message; }
          btn.disabled = false; btn.textContent = 'Pedir retorno';
        });
      }
      caixa.showModal();
      caixa.querySelector('input[name=nome]').focus();
    });
  }

  // Blog: filtro por área na lista de textos.
  const filtro = document.querySelector('.post-filtro');
  if (filtro) filtro.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filtro.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('.post-grid.lista .post-card, .post-destaque').forEach(c => { c.hidden = !!b.dataset.area && c.dataset.area !== b.dataset.area; });
  });
  // Blog: copiar o link do texto
  document.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Link copiado ✓'; } catch (e) { prompt('Copie o link:', b.dataset.copiar); }
  }));

  // Entrada suave dos blocos ao rolar a página.
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
})();
