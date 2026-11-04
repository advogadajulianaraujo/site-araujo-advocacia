/* "Ainda dá tempo?" rápido da página inicial: tudo no aparelho, nada é enviado. */
(function () {
  const f = document.getElementById('tempo-rapido'); if (!f) return;
  const out = document.getElementById('tr-res');
  const br = d => String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  const zap = m => 'https://wa.me/5548996126491?text=' + encodeURIComponent(m);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.saida.value || '');
    out.replaceChildren();
    if (!m) { out.append(el('p', 'tempo-erro', 'Informe a data do último dia de trabalho.')); return; }
    const saida = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const hoje = new Date(); const h = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    if (saida > h) { out.append(el('p', 'tempo-erro', 'A data está no futuro. Confira o dia em que o contrato terminou.')); return; }
    const lim = new Date(Date.UTC(saida.getUTCFullYear() + 2, saida.getUTCMonth(), saida.getUTCDate()));
    const dias = Math.round((lim - h) / 86400000);
    const box = el('div', dias >= 0 ? 'tempo-ok' : 'tempo-alerta');
    if (dias >= 0) {
      box.append(el('b', '', 'Ainda dá tempo.'), el('span', '', ` Pela regra geral, você pode entrar com a ação até ${br(lim)}: faltam cerca de ${dias} dias.`));
      if (dias < 120) box.append(el('span', 'tempo-urg', ' O prazo está perto do fim: procure orientação logo.'));
    } else {
      box.append(el('b', '', 'Pela regra geral, o prazo terminou em ' + br(lim) + '.'), el('span', '', ' Algumas situações mudam a contagem (aviso prévio, menor de idade, ação anterior). Vale conferir com a advogada.'));
    }
    const a = el('a', 'btn', 'Falar com a advogada no WhatsApp');
    a.href = zap('Olá, Dra. Júlian. Usei a calculadora do site: saí da empresa em ' + br(saida) + ' e gostaria de uma orientação sobre o meu caso trabalhista.');
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.contact = 'calculadora-inicio';
    out.append(box, a);
  });
})();
