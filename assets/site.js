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
            const dados = { nome: f.nome.value, telefone: f.telefone.value, assunto: f.assunto.value, horario: f.horario.value, aceite: f.aceite.checked, empresa_site: f.empresa_site.value, pagina: location.pathname };
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

  // Entrada suave dos blocos ao rolar a página.
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
})();
