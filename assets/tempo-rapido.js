/* "Ainda dá tempo?" rápido da página inicial: tudo no aparelho, nada é enviado.
   Mesma regra da calculadora completa: 2 anos depois do fim do contrato, com o aviso prévio indenizado projetado (OJ 83 SDI-1 TST). */
(function () {
  const f = document.getElementById('tempo-rapido'); if (!f) return;
  const out = document.getElementById('tr-res');
  const ler = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  const br = d => String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  const somaDias = (d, n) => new Date(d.getTime() + n * 86400000);
  const somaAnos = (d, n) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
  const anos = (a, b) => { let n = b.getUTCFullYear() - a.getUTCFullYear(); if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--; return Math.max(0, n); };
  const zap = m => 'https://wa.me/5548996126491?text=' + encodeURIComponent(m);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    out.replaceChildren();
    const saida = ler(f.saida.value), adm = ler(f.admissao.value), aviso = f.aviso.value;
    if (!saida) { out.append(el('p', 'tempo-erro', 'Informe a data do último dia de trabalho.')); return; }
    const t = new Date(), h = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
    if (saida > h) { out.append(el('p', 'tempo-erro', 'A data está no futuro. Confira o dia em que o contrato terminou.')); return; }
    if (adm && adm >= saida) { out.append(el('p', 'tempo-erro', 'A data de admissão precisa ser antes da saída.')); return; }
    let fim = saida, obs = '';
    if (aviso !== 'trabalhado') {
      const dias = Math.min(90, 30 + 3 * (adm ? anos(adm, saida) : 0)); // Lei 12.506/2011
      fim = somaDias(saida, dias);
      obs = aviso === 'naosei'
        ? ` Contamos ${dias} dias de aviso prévio indenizado${adm ? '' : ' (o mínimo; com mais tempo de casa pode chegar a 90)'}, caso você não tenha trabalhado o aviso.`
        : ` Já contamos ${dias} dias de aviso prévio indenizado${adm ? '' : ' (o mínimo; com mais tempo de casa pode chegar a 90)'}.`;
    }
    const lim = somaAnos(fim, 2), dias = Math.round((lim - h) / 86400000);
    const box = el('div', dias >= 0 ? 'tempo-ok' : 'tempo-alerta');
    if (dias >= 0) {
      box.append(el('b', '', 'Ainda dá tempo.'), el('span', '', ` Pela regra geral, você pode entrar com a ação até ${br(lim)}: faltam cerca de ${dias} dias.` + obs));
      if (dias < 120) box.append(el('span', 'tempo-urg', ' O prazo está perto do fim: procure orientação logo.'));
    } else {
      box.append(el('b', '', `Pela regra geral, o prazo pode ter terminado em ${br(lim)}.`), el('span', '', obs + ' Não desista sem conversar com a advogada: há situações que mudam a contagem (menor de idade, uma ação ou protesto anterior, entre outras).'));
    }
    const a = el('a', 'btn', 'Falar com a advogada no WhatsApp');
    a.href = zap('Olá, Dra. Júlian. Usei a calculadora do site: saí da empresa em ' + br(saida) + ' e gostaria de uma orientação sobre o meu caso trabalhista.');
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.contact = 'calculadora-inicio';
    out.append(box, a);
  });
})();
