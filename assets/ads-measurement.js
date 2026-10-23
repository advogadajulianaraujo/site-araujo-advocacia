/* Google Ads: measure only an intentional WhatsApp link click, after consent.
   Destination copied from this account's existing conversion action snippet. */
(() => {
  'use strict';
  const tagId = 'AW-699489508';
  const destination = 'AW-699489508/CvipCNm-rKIdEOS5xc0C';
  const storageKey = 'araujo_ads_measurement_v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  let allowed = false;
  let loaded = false;
  let lastClick = 0;
  let banner;

  function savedChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && ['granted', 'denied'].includes(saved.value) &&
          Number.isFinite(saved.at) && Date.now() - saved.at < lifetime) return saved.value;
    } catch (_) { /* Navigation and contact remain available without storage. */ }
    return null;
  }

  function loadTag() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      ad_storage: 'granted', ad_user_data: 'granted',
      ad_personalization: 'denied', analytics_storage: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', tagId, { allow_ad_personalization_signals: false });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + tagId;
    document.head.append(script);
  }

  function choose(value) {
    allowed = value === 'granted';
    try { localStorage.setItem(storageKey, JSON.stringify({ value, at: Date.now() })); } catch (_) {}
    if (allowed) {
      if (loaded) window.gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' });
      else loadTag();
    } else if (loaded) {
      window.gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied' });
    }
    banner.hidden = true;
  }

  function showPreferences() {
    banner.hidden = false;
    banner.querySelector('button').focus();
  }

  banner = document.createElement('section');
  banner.className = 'measurement-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Preferências de medição de anúncios');
  banner.innerHTML = '<strong>Medição de anúncios</strong>' +
    '<p>Podemos usar cookies do Google Ads para medir visitas vindas dos anúncios e cliques no WhatsApp? Você pode continuar sem permitir. <a href="/privacidade/">Saiba mais</a>.</p>' +
    '<div class="measurement-actions"><button type="button" data-choice="granted">Permitir</button>' +
    '<button type="button" data-choice="denied">Continuar sem permitir</button></div>';
  document.body.append(banner);
  banner.querySelectorAll('[data-choice]').forEach(button => {
    button.addEventListener('click', () => choose(button.dataset.choice));
  });
  const preferences = document.createElement('button');
  preferences.type = 'button';
  preferences.className = 'measurement-preferences';
  preferences.textContent = 'Preferências de cookies';
  preferences.addEventListener('click', showPreferences);
  (document.querySelector('.footer-nav') || document.body).append(preferences);

  const saved = savedChoice();
  banner.hidden = saved !== null;
  allowed = saved === 'granted';
  if (allowed) loadTag();

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-contact]');
    if (!allowed || !link || event.defaultPrevented) return;
    let url;
    try { url = new URL(link.href); } catch (_) { return; }
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me') return;
    const now = Date.now();
    if (now - lastClick < 1500) return;
    lastClick = now;
    // Do not transmit message text, telephone number, contact location, or legal matter.
    window.gtag('event', 'conversion', { send_to: destination });
  });
})();
