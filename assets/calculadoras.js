/* Calculadoras trabalhistas (estimativas informativas; não substituem a análise do caso). */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const reais = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = d => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const lerData = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  const somaDias = (d, n) => new Date(d.getTime() + n * 86400000);
  const somaAnos = (d, n) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
  const anosCompletos = (a, b) => { let n = b.getUTCFullYear() - a.getUTCFullYear(); if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--; return Math.max(0, n); };
  const diasAviso = anos => Math.min(90, 30 + 3 * anos); // Lei 12.506/2011
  const hoje = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
  const linha = (rot, val, cls) => `<tr class="${cls || ''}"><th scope="row">${rot}</th><td>${val}</td></tr>`;
  const zap = msg => 'https://wa.me/5548996126491?text=' + encodeURIComponent(msg);

  // ---------- 1) Ainda dá tempo de entrar com a ação? ----------
  const fp = $('#calc-prazo');
  if (fp) fp.addEventListener('submit', ev => {
    ev.preventDefault();
    const out = $('#res-prazo'), saida = lerData(fp.saida.value), adm = lerData(fp.admissao.value);
    if (!saida) { out.innerHTML = '<p class="calc-erro">Informe a data de saída.</p>'; return; }
    let fim = saida, txtAviso = '';
    if (fp.aviso.value === 'indenizado') {
      const dias = diasAviso(adm ? anosCompletos(adm, saida) : 0);
      fim = somaDias(saida, dias);
      txtAviso = ` (a data de saída foi projetada em ${dias} dias de aviso prévio indenizado, até ${dataBR(fim)})`;
    }
    const limite = somaAnos(fim, 2), h = hoje(), alcance = somaAnos(h, -5);
    const restam = Math.ceil((limite - h) / 86400000);
    out.innerHTML = restam >= 0
      ? `<div class="calc-ok"><p><b>O prazo de 2 anos vai até ${dataBR(limite)}</b>${txtAviso}. Faltam cerca de <b>${restam} dias</b>.</p>
         <p>Se a ação for proposta hoje, ela alcança direitos a partir de <b>${dataBR(alcance > (adm || alcance) ? alcance : adm)}</b> (os 5 anos anteriores à ação).</p>
         ${restam < 120 ? '<p><b>Atenção:</b> o prazo está perto do fim. Procure orientação o quanto antes.</p>' : ''}</div>`
      : `<div class="calc-alerta"><p><b>Pela regra geral, o prazo de 2 anos pode ter terminado em ${dataBR(limite)}</b>${txtAviso}.</p>
         <p><b>Não desista sem conversar com uma advogada:</b> há situações que mudam a contagem (aviso prévio, trabalhador menor de idade, uma ação ou protesto anterior que interrompeu o prazo, entre outras).</p></div>`;
    out.innerHTML += `<p class="calc-nota">Regra: Constituição Federal, art. 7º, XXIX (2 anos após o fim do contrato para entrar com a ação; alcança os 5 anos anteriores). O aviso prévio, mesmo indenizado, conta no tempo de contrato (OJ 83 da SDI-1 do TST). Estimativa informativa: confirme com a análise do seu caso.</p>
      <p><a class="btn" href="${zap('Olá, Dra. Júlian. Usei a calculadora de prazo do site e gostaria de uma orientação sobre o meu caso trabalhista.')}" target="_blank" rel="noopener noreferrer" data-contact="calculadora-prazo">Falar no WhatsApp</a></p>`;
    out.hidden = false; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Valores em reais entram pelos centavos (como maquininha): digitar 250000 mostra 2.500,00
  document.querySelectorAll('.calc input[inputmode="decimal"], form input[inputmode="decimal"]').forEach(el => {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 11);
      el.value = d ? (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    });
    if (!el.placeholder || /Ex\./.test(el.placeholder)) el.placeholder = '0,00';
  });

  // ---------- 2) Estimativa de verbas rescisórias (8.41: motor único assets/rescisao-motor.js, o mesmo do painel) ----------
  const fr = $('#calc-rescisao');
  if (fr) {
    const mostraAviso = () => { const m = fr.motivo.value; fr.querySelector('.campo-aviso').hidden = !(m === 'sem_justa' || m === 'pedido'); };
    fr.motivo.addEventListener('change', mostraAviso); mostraAviso();
    const mostraNP = () => { fr.querySelector('.campo-fgtsnp').hidden = fr.fgts_dep.value !== 'parte'; };
    fr.fgts_dep.addEventListener('change', mostraNP); mostraNP();
    const num = v => parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const atualizarMultas = () => {
      fr.base_m467.closest('label').hidden = !fr.m467.checked;
      fr.base_m467.disabled = !fr.m467.checked;
      fr.base_m467.required = fr.m467.checked;
      const temMultaFgts = ['sem_justa', 'indireta', 'acordo'].includes(fr.motivo.value);
      fr.mfgts.disabled = !temMultaFgts;
      if (!temMultaFgts) fr.mfgts.checked = false;
    };
    const invalidarResultado = () => {
      atualizarMultas();
      const out = $('#res-rescisao');
      if (!out.hidden) out.textContent = 'Dados alterados. Clique em Calcular a estimativa para atualizar o resultado.';
    };
    fr.addEventListener('input', invalidarResultado);
    fr.addEventListener('change', invalidarResultado);
    atualizarMultas();
    fr.addEventListener('submit', ev => {
      ev.preventDefault();
      const out = $('#res-rescisao');
      if (!window.RESCISAO) { out.innerHTML = '<p class="calc-erro">A calculadora não carregou. Recarregue a página.</p>'; out.hidden = false; return; }
      let r;
      try {
        r = window.RESCISAO.calcular({ salario: num(fr.salario.value), medias: num(fr.medias.value), admissao: lerData(fr.admissao.value), ruptura: lerData(fr.saida.value),
          motivo: fr.motivo.value, aviso: fr.aviso.value, saldoPago: num(fr.saldo_pago.value), feriasPendentes: fr.ferias_pend.value, decimoAnoPago: num(fr.decimo_pago.value),
          decimoAnterior: fr.decimo_ant.value, fgtsDep: fr.fgts_dep.value, fgtsMesesNP: fr.meses_np.value, fgtsComprovado: num(fr.fgts.value), fgtsOutroPedido: fr.fgts_outro.checked,
          multaFgts: fr.mfgts.checked, multa477: fr.m477.checked, multa467: fr.m467.checked, baseMulta467: num(fr.base_m467.value) });
      } catch (e) { out.innerHTML = '<p class="calc-erro">' + esc(e.message) + '</p>'; out.hidden = false; return; }
      const sec = t => `<tr class="calc-sec"><th scope="rowgroup" colspan="2">${t}</th></tr>`;
      const lin = (x, cls) => `<tr class="${cls || ''}"><th scope="row">${esc(x.rot)}${x.conta ? `<small class="calc-conta">${esc(x.conta)}</small>` : ''}</th><td>${reais(x.valor)}</td></tr>`;
      const tot = (rot, v) => linha('<b>' + rot + '</b>', '<b>' + reais(v) + '</b>', 'calc-total');
      let h = sec(r.indireta ? 'Verbas da rescisão indireta (as mesmas da dispensa sem justa causa) — valores brutos' : 'Verbas rescisórias — valores brutos') + r.verbas.map(x => lin(x)).join('') + tot('Subtotal das verbas rescisórias', r.subtotal);
      if (r.anteriores.length) h += sec('Parcelas anteriores não pagas (fora do subtotal acima)') + r.anteriores.map(x => lin(x)).join('') + tot('Subtotal das parcelas anteriores', r.subAnt);
      const fgtsMulta = r.fgts.some(x => /^Multa de /.test(x.rot));
      h += sec('FGTS' + (fgtsMulta ? ' e multa selecionada' : '') + ' (bloco separado)') + r.contratual.map(x => lin(x, 'calc-conf')).join('') + r.fgts.map(x => lin(x.fora ? Object.assign({}, x, { rot: x.rot + ' — já calculado em outro pedido (não soma)' }) : x)).join('') + tot('Subtotal do FGTS' + (fgtsMulta ? ' e da multa selecionada' : ''), r.subFgts);
      if (r.multas.length) h += sec('Multas selecionadas') + r.multas.map(x => lin(x)).join('') + tot('Subtotal das multas selecionadas', r.subMultas);
      h += tot('Total estimado', r.total);
      out.innerHTML = (r.indireta ? '<p class="calc-alerta-txt"><b>Rescisão indireta (CLT, art. 483):</b> quando a empresa comete falta grave, o trabalhador pode pedir na Justiça o fim do contrato com os mesmos direitos de quem é dispensado sem justa causa, inclusive o aviso prévio indenizado e a multa de 40% do FGTS. Os valores dependem do reconhecimento pelo juiz.</p>' : '') +
        `<table class="calc-tab"><tbody>${h}</tbody></table>
        <p>Tempo de casa: ${r.anos} ano(s) completo(s)${r.diasAv ? ` · aviso prévio de ${r.diasAv} dias · contrato projetado até <b>${dataBR(r.fim)}</b>` : ''}. ${r.notas.map(esc).join(' ')}</p>
        <p class="calc-nota">Estimativa informativa, em valores brutos (sem descontos de INSS e imposto de renda). Só contam como pagos os valores que você informou. O FGTS mensal do contrato já é depositado pela empresa: aparece em cinza só para conferência (não soma no total) — confira o extrato no app FGTS. Entra no total o FGTS da rescisão: 8% do saldo de salário, do 13º e do aviso indenizado. A multa de 40% é calculada sobre o FGTS do contrato + saldo + 13º, sem o FGTS do aviso indenizado (Tema 255 do TST). Férias de período completo não tiradas depois do prazo de concessão são devidas em dobro (CLT, art. 137). Base: CLT arts. 137, 146, 467, 477, 483, 484-A e 487; Lei 12.506/2011; Lei 8.036/1990; Súmulas 171, 261 e 305 do TST. Para saber o valor certo, é preciso analisar os documentos.</p>
        <p><a class="btn" href="${zap('Olá, Dra. Júlian. Fiz a estimativa de rescisão no site e gostaria de conferir os valores do meu caso.')}" target="_blank" rel="noopener noreferrer" data-contact="calculadora-rescisao">Conferir meu caso no WhatsApp</a></p>`;
      out.hidden = false; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
})();
