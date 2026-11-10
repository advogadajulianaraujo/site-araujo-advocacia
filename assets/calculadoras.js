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

  // ---------- 2) Estimativa de verbas rescisórias ----------
  const fr = $('#calc-rescisao');
  if (fr) {
    const mostraAviso = () => { const m = fr.motivo.value; fr.querySelector('.campo-aviso').hidden = !(m === 'sem_justa' || m === 'pedido'); };
    fr.motivo.addEventListener('change', mostraAviso); mostraAviso();
    fr.addEventListener('submit', ev => {
      ev.preventDefault();
      const out = $('#res-rescisao');
      const sal = parseFloat(String(fr.salario.value).replace(/\./g, '').replace(',', '.'));
      const adm = lerData(fr.admissao.value), saida = lerData(fr.saida.value), motivo = fr.motivo.value;
      if (!(sal > 0) || !adm || !saida || saida < adm) { out.innerHTML = '<p class="calc-erro">Confira o salário e as datas de admissão e de saída.</p>'; out.hidden = false; return; }
      const anos = anosCompletos(adm, saida);
      const indenizado = (motivo === 'sem_justa' && fr.aviso.value === 'indenizado') || motivo === 'acordo';
      let diasAv = 0;
      if (motivo === 'sem_justa' && fr.aviso.value === 'indenizado') diasAv = diasAviso(anos);
      if (motivo === 'acordo') diasAv = Math.floor(diasAviso(anos) / 2); // CLT, art. 484-A, I, "a"
      const fimProj = indenizado ? somaDias(saida, diasAv) : saida;
      const dia = s => s.getUTCDate();
      const itens = [];
      // saldo de salário
      // mensalista: o mês vale 30 dias. Saiu no último dia do mês (31/10, 28/02) = salário cheio; nunca mais de 30 dias
      const ultimo = new Date(Date.UTC(saida.getUTCFullYear(), saida.getUTCMonth() + 1, 0)).getUTCDate();
      const mesmoMes = adm.getUTCFullYear() === saida.getUTCFullYear() && adm.getUTCMonth() === saida.getUTCMonth();
      let diasSaldo = dia(saida) === ultimo ? 30 : Math.min(30, dia(saida));
      if (mesmoMes) diasSaldo = Math.min(diasSaldo, dia(saida) === ultimo && dia(adm) === 1 ? 30 : dia(saida) - dia(adm) + 1);
      itens.push(['Saldo de salário (' + diasSaldo + ' dias do mês da saída)', sal / 30 * diasSaldo]);
      if (diasAv) itens.push(['Aviso prévio indenizado (' + diasAv + ' dias)', sal / 30 * diasAv]);
      // meses que contam (fração de 15 dias ou mais conta como mês)
      // avos: cada mês contado a partir do início vale 1/12; a fração final conta se tiver 15 dias ou mais
      const somaMes = (d, n) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + n); return x; };
      const mesesEntre = (ini, fim) => { let n = 0, a = ini;
        while (n < 12) { const b = somaMes(a, 1); if (somaDias(b, -1) <= fim) { n++; a = b; } else { if ((fim - a) / 86400000 + 1 >= 15) n++; break; } }
        return Math.min(12, n); };
      let v13 = 0, v13sem = 0;
      if (motivo !== 'justa') {
        const iniAno = new Date(Date.UTC(fimProj.getUTCFullYear(), 0, 1));
        const m13 = mesesEntre(adm > iniAno ? adm : iniAno, fimProj);
        v13 = sal / 12 * m13;
        itens.push(['13º salário proporcional (' + m13 + '/12)', v13]);
        const iniAno2 = new Date(Date.UTC(saida.getUTCFullYear(), 0, 1));
        v13sem = sal / 12 * mesesEntre(adm > iniAno2 ? adm : iniAno2, saida);
        let aniv = new Date(Date.UTC(fimProj.getUTCFullYear(), adm.getUTCMonth(), adm.getUTCDate()));
        if (aniv > fimProj) aniv = somaAnos(aniv, -1);
        if (aniv < adm) aniv = adm;
        const mf = mesesEntre(aniv, fimProj);
        itens.push(['Férias proporcionais + 1/3 (' + mf + '/12)', sal / 12 * mf * 4 / 3]);
      }
      const venc = parseInt(fr.vencidas.value, 10) || 0;
      if (venc) itens.push(['Férias integrais (vencidas, não tiradas) + 1/3 (' + venc + ' período' + (venc > 1 ? 's' : '') + ')', sal * venc * 4 / 3]);
      const total = itens.reduce((s, x) => s + x[1], 0);
      // INSS 2026 (Portaria MPS/MF nº 13/2026), separado no saldo de salário e no 13º; não incide no aviso indenizado nem nas férias indenizadas
      const inss = v => { let t = 0, ant = 0; for (const [lim, a] of [[1621.00, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]) { if (v > ant) t += (Math.min(v, lim) - ant) * a; ant = lim; } return Math.round(t * 100) / 100; };
      const saldoSal = itens[0][1], vAviso = diasAv ? sal / 30 * diasAv : 0;
      const inssSaldo = inss(saldoSal), inss13 = inss(v13), liquido = total - inssSaldo - inss13;
      // FGTS: depositado na conta, não é pago no termo de rescisão
      const mesesSem = Math.max(1, Math.round((saida - adm) / (30.4375 * 86400000)));
      const saldoInf = parseFloat(String(fr.fgts.value || '').replace(/\./g, '').replace(',', '.'));
      const saldoFgts = saldoInf > 0 ? saldoInf : sal * 0.08 * mesesSem;
      const fgtsMes = 0.08 * (saldoSal + v13), fgtsAviso = 0.08 * vAviso;
      const multa = motivo === 'sem_justa' ? 0.4 : motivo === 'acordo' ? 0.2 : 0;
      // Tema 255 do TST: a multa não inclui o FGTS da projeção do aviso indenizado
      const baseMulta = saldoFgts + 0.08 * (saldoSal + v13sem), vMulta = baseMulta * multa;
      const sec = t => `<tr class="calc-sec"><th scope="rowgroup" colspan="2">${t}</th></tr>`;
      const saque = motivo === 'sem_justa'
        ? 'pode sacar o saldo da conta e a multa (saque-rescisão). Atenção: quem aderiu ao saque-aniversário, pela regra geral, saca só a multa de 40%; o saldo fica bloqueado'
        : motivo === 'acordo' ? 'pode sacar até 80% do saldo e a multa de 20% (quem aderiu ao saque-aniversário, pela regra geral, saca só a multa)'
        : 'não saca o FGTS (salvo exceções)';
      out.innerHTML = `<table class="calc-tab"><tbody>${sec('Pago no acerto (termo de rescisão)')}${itens.map(x => linha(x[0], reais(x[1]))).join('')}${linha('<b>Total bruto</b>', '<b>' + reais(total) + '</b>', 'calc-total')}
        ${linha('(−) INSS sobre o saldo de salário', '− ' + reais(inssSaldo))}${inss13 ? linha('(−) INSS sobre o 13º', '− ' + reais(inss13)) : ''}${linha('<b>Líquido estimado a receber</b>', '<b>' + reais(liquido) + '</b>', 'calc-total')}
        ${sec('FGTS — vai para a conta do FGTS (não entra no líquido)')}${linha('Saldo da conta ' + (saldoInf > 0 ? '(informado)' : '(estimado: 8% do salário por mês)'), reais(saldoFgts))}
        ${linha('FGTS do mês da rescisão (8% do saldo de salário e do 13º)', reais(fgtsMes))}${fgtsAviso ? linha('FGTS sobre o aviso prévio indenizado (8%)', reais(fgtsAviso)) : ''}
        ${multa ? linha('Multa de ' + (multa * 100) + '% do FGTS (sobre ' + reais(baseMulta) + ', sem a projeção do aviso)', reais(vMulta)) : ''}</tbody></table>
        <p>FGTS: o trabalhador ${saque}.${motivo === 'sem_justa' ? ' Na dispensa sem justa causa também pode haver direito ao seguro-desemprego.' : ''} Confira o saldo no app FGTS.</p>
        <p class="calc-nota">Estimativa informativa. Desconto de INSS pela tabela de 2026; imposto de renda não calculado. Sem médias de horas extras, comissões, adicionais ou diferenças que o caso possa ter. Férias vencidas fora do prazo de concessão podem ser devidas em dobro (CLT, art. 137). A multa do FGTS é calculada sem o FGTS da projeção do aviso indenizado (Tema 255 do TST). Base: CLT arts. 137, 477, 484-A e 487; Lei 12.506/2011 (aviso proporcional); Lei 8.036/1990 (FGTS); Súmulas 171, 261 e 305 do TST. Para saber o valor certo, é preciso analisar os documentos.</p>
        <p><a class="btn" href="${zap('Olá, Dra. Júlian. Fiz a estimativa de rescisão no site e gostaria de conferir se os valores do meu acerto estão corretos.')}" target="_blank" rel="noopener noreferrer" data-contact="calculadora-rescisao">Conferir minha rescisão no WhatsApp</a></p>`;
      out.hidden = false; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
})();
