/* Motor ÚNICO da conta de rescisão (8.41) — usado pela calculadora do site (assets/calculadoras.js) e pela do painel (painel/gestao.js).
 * Estimativa para conferência: não substitui a análise do caso. Cada parcela é calculada com precisão e arredondada a 2 casas no fim.
 * Rescisão indireta (CLT, art. 483) = mesmas verbas da dispensa sem justa causa, com aviso prévio indenizado (30 + 3 por ano, máx. 90 —
 * Lei 12.506/2011), projeção do contrato para 13º e férias (OJ 82/83 da SDI-1), FGTS mensal já recolhido só para conferência, FGTS rescisório
 * (saldo, 13º com a projeção e aviso) a receber, multa de 40% sobre a base fundiária legal SEM o FGTS do aviso
 * indenizado (Tema 255 do TST). Todas as multas são opcionais e só entram quando explicitamente selecionadas.
 */
(function (raiz) {
  'use strict';
  const DIA = 86400000;
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const data = (a, m, d) => new Date(Date.UTC(a, m, d));
  const somaDias = (d, n) => new Date(d.getTime() + n * DIA);
  const somaAnos = (d, n) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
  const somaMes = (d, n) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + n); return x; };
  const anosCompletos = (a, b) => { let n = b.getUTCFullYear() - a.getUTCFullYear(); if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--; return Math.max(0, n); };
  const diasAviso = anos => Math.min(90, 30 + 3 * anos);
  // avos: cada mês contado a partir do início vale 1/12; a fração final conta com 15 dias ou mais (Lei 4.090/62; CLT art. 146, parág. único)
  const avos = (ini, fim) => { if (fim < ini) return 0; let n = 0, a = ini; while (n < 12) { const b = somaMes(a, 1); if (somaDias(b, -1) <= fim) { n++; a = b; } else { if ((fim - a) / DIA + 1 >= 15) n++; break; } } return Math.min(12, n); };
  const br = d => d.toISOString().slice(0, 10).split('-').reverse().join('/');
  const reais = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /** e = { salario, medias, admissao (Date), ruptura (Date), ultimoTrabalho (Date|null), motivo: sem_justa|indireta|pedido|acordo|justa,
   *  aviso: indenizado|trabalhado, diasSaldo (número ou null = automático), saldoPago (R$ comprovado), feriasGozadas (períodos completos já
   *  gozados e pagos) ou feriasPendentes (quantos períodos completos faltam), decimoAnoPago (R$ do 13º do ano da ruptura já pago), decimoAnterior: pago|nao_pago, fgtsDep: sim|nao|parte|naosei,
   *  fgtsMesesNP, fgtsComprovado (R$), fgtsOutroPedido (bool), multaFgts (bool), multa477 (bool), multa467 (bool), baseMulta467 (R$) } */
  function calcular(e) {
    const sal = +e.salario || 0, med = +e.medias || 0, rem = sal + med;
    const adm = e.admissao, rup = e.ruptura, motivo = e.motivo;
    if (!(sal > 0) || !adm || !rup || rup < adm) throw new Error('Confira o salário e as datas de admissão e de ruptura.');
    const indireta = motivo === 'indireta', semJusta = motivo === 'sem_justa' || indireta, justa = motivo === 'justa';
    const anos = anosCompletos(adm, rup);
    let diasAv = 0;
    if (indireta || (motivo === 'sem_justa' && e.aviso !== 'trabalhado')) diasAv = diasAviso(anos);
    if (motivo === 'acordo') diasAv = Math.floor(diasAviso(anos) / 2); // CLT, art. 484-A, I, "a"
    const fim = diasAv ? somaDias(rup, diasAv) : rup; // término projetado (o aviso indenizado conta como tempo de serviço)
    const L = [], X = [], F = [], C = [], notas = [];
    const item = (lista, rot, conta, valor, extra) => { const v = r2(valor); lista.push(Object.assign({ rot, conta, valor: v }, extra || {})); return v; };

    // 1) Saldo de salário: só os dias pendentes; mensalista = mês de 30; saiu no último dia do mês = salário cheio
    const ult = data(rup.getUTCFullYear(), rup.getUTCMonth() + 1, 0).getUTCDate();
    const mesmoMes = adm.getUTCFullYear() === rup.getUTCFullYear() && adm.getUTCMonth() === rup.getUTCMonth();
    let dsAuto = rup.getUTCDate() === ult ? 30 : Math.min(30, rup.getUTCDate());
    if (mesmoMes) dsAuto = Math.min(dsAuto, rup.getUTCDate() === ult && adm.getUTCDate() === 1 ? 30 : rup.getUTCDate() - adm.getUTCDate() + 1);
    const ds = e.diasSaldo === null || e.diasSaldo === undefined || e.diasSaldo === '' ? dsAuto : Math.max(0, Math.min(30, +e.diasSaldo));
    const saldoBruto = rem / 30 * ds, saldoPago = +e.saldoPago || 0;
    const vSaldo = item(L, `Saldo de salário (${ds} dias pendentes)`, `${reais(rem)} ÷ 30 × ${ds}` + (saldoPago ? ` − ${reais(saldoPago)} já pagos` : ''), Math.max(0, saldoBruto - saldoPago));

    // 2) Aviso prévio indenizado
    let vAviso = 0;
    if (diasAv) vAviso = item(L, `Aviso prévio indenizado (${diasAv} dias${motivo === 'acordo' ? ', metade — art. 484-A' : ''})`, `${reais(rem)} ÷ 30 × ${diasAv} · projeta o contrato até ${br(fim)}`, rem / 30 * diasAv);

    // 3) 13º proporcional do ano da ruptura (com a projeção), menos o que já foi pago
    let v13 = 0, a13 = 0, a13sem = 0;
    if (!justa) {
      const iniAno = data(fim.getUTCFullYear(), 0, 1);
      a13 = avos(adm > iniAno ? adm : iniAno, fim);
      const iniAnoR = data(rup.getUTCFullYear(), 0, 1);
      a13sem = fim.getUTCFullYear() === rup.getUTCFullYear() ? avos(adm > iniAnoR ? adm : iniAnoR, rup) : avos(adm > iniAnoR ? adm : iniAnoR, rup);
      const pago13 = +e.decimoAnoPago || 0;
      v13 = item(L, `13º salário proporcional de ${fim.getUTCFullYear()} (${a13}/12)`, `${reais(rem)} ÷ 12 × ${a13}` + (diasAv ? ' (com a projeção do aviso)' : '') + (pago13 ? ` − ${reais(pago13)} já pagos` : ''), Math.max(0, rem / 12 * a13 - pago13));
    }

    // 4) Férias: cada período aquisitivo COMPLETO não gozado/pago + 1/3; em dobro se o período concessivo acabou antes da ruptura (CLT, art. 137)
    const periodos = anosCompletos(adm, fim);
    const pend = e.feriasPendentes === undefined || e.feriasPendentes === null || e.feriasPendentes === '' ? null : Math.max(0, Math.min(periodos, parseInt(e.feriasPendentes, 10) || 0));
    const gozadas = pend !== null ? periodos - pend : Math.max(0, Math.min(periodos, parseInt(e.feriasGozadas, 10) || 0));
    for (let k = gozadas; k < periodos; k++) {
      const ini = somaAnos(adm, k), fimP = somaDias(somaAnos(adm, k + 1), -1), fimConc = somaDias(somaAnos(adm, k + 2), -1);
      const dobro = fimConc < rup;
      item(L, `Férias integrais ${dobro ? 'EM DOBRO' : 'simples'} + 1/3 — período ${br(ini)} a ${br(fimP)}`, `${reais(rem)} × 4/3${dobro ? ' × 2 (prazo de concessão acabou em ' + br(fimConc) + ')' : ''}`, rem * 4 / 3 * (dobro ? 2 : 1));
    }
    // férias proporcionais do período incompleto (com a projeção). Justa causa: não há (Súmula 171 do TST)
    let af = 0;
    if (!justa) {
      const iniInc = somaAnos(adm, periodos);
      af = avos(iniInc, fim);
      if (af) item(L, `Férias proporcionais + 1/3 (${af}/12) — período desde ${br(iniInc)}`, `${reais(rem)} ÷ 12 × ${af} × 4/3` + (diasAv ? ' (com a projeção do aviso)' : ''), rem / 12 * af * 4 / 3);
    }
    const subtotal = r2(L.reduce((t, x) => t + x.valor, 0));

    // 5) parcelas anteriores não pagas (fora do subtotal das verbas rescisórias)
    let v13ant = 0, a13ant = 0;
    const anoAnt = rup.getUTCFullYear() - 1;
    if (e.decimoAnterior === 'nao_pago' && adm <= data(anoAnt, 11, 31)) {
      const ini = adm > data(anoAnt, 0, 1) ? adm : data(anoAnt, 0, 1);
      a13ant = avos(ini, data(anoAnt, 11, 31));
      v13ant = item(X, `13º salário de ${anoAnt} não pago (${a13ant}/12)`, `${reais(rem)} ÷ 12 × ${a13ant}`, rem / 12 * a13ant);
    }

    // 6) FGTS (8%) e multa — bloco separado (ajuste de 18/11/2026, pedido da usuária):
    //  a) FGTS MENSAL do contrato (meses anteriores ao da ruptura + 13ºs dos anos anteriores): já recolhido pela empresa — NÃO entra no total;
    //     fica para conferência pelo extrato e é a base da multa. Só vira valor a receber quando informado que não depositou (ou em parte).
    //  b) FGTS RESCISÓRIO ainda não recolhido (entra no total): 8% do saldo de salário, 8% do 13º devido (já com a projeção do aviso, uma vez
    //     só) e 8% do aviso prévio indenizado (Súmula 305 do TST).
    //  c) Multa de 40%/20% sobre a base fundiária legal: FGTS mensal + FGTS do saldo + FGTS do 13º do ano SEM a projeção — sem o FGTS do aviso
    //     indenizado (OJ 42, II, da SDI-1 e Tema 255 do TST).
    const mesesAntes = (() => { const iniMes = data(rup.getUTCFullYear(), rup.getUTCMonth(), 1); if (adm >= iniMes) return 0; return (iniMes - adm) / DIA / (365.25 / 12); })();
    const anosInteiros13 = (() => { let s = 0; for (let y = adm.getUTCFullYear(); y < rup.getUTCFullYear(); y++) { const ini = adm > data(y, 0, 1) ? adm : data(y, 0, 1); s += avos(ini, data(y, 11, 31)); } return s; })();
    const base13Ant = rem / 12 * anosInteiros13;
    const fgtsMensal = r2((rem * mesesAntes + base13Ant) * 0.08);
    item(C, 'FGTS mensal do contrato (8%) — já recolhido: conferir pelo extrato (não soma no total)', `8% × (${reais(rem)} × ${mesesAntes.toFixed(2).replace('.', ',')} meses` + (base13Ant ? ` + 13ºs de anos anteriores ${reais(base13Ant)}` : '') + ') · é a base da multa', fgtsMensal);
    const dep = e.fgtsDep || 'naosei', comprovado = +e.fgtsComprovado || 0;
    let aDepositar = 0;
    if (dep === 'nao') aDepositar = fgtsMensal - comprovado;
    else if (dep === 'parte') {
      const mNP = Math.max(0, Math.min(Math.ceil(mesesAntes), parseInt(e.fgtsMesesNP, 10) || 0));
      aDepositar = comprovado > 0 ? Math.max(0, fgtsMensal - comprovado) : rem * 0.08 * mNP * (1 + 1 / 12);
    }
    else if (comprovado > 0) aDepositar = Math.max(0, fgtsMensal - comprovado);
    aDepositar = r2(Math.max(0, aDepositar));
    if (comprovado) item(C, '(−) Depósitos de FGTS comprovados (extrato)', 'informado', -comprovado);
    let vFgtsDif = 0;
    if (aDepositar > 0) vFgtsDif = item(F, 'FGTS mensal NÃO recolhido (diferença a depositar)', dep === 'parte' && !comprovado ? `8% × ${reais(rem)} × meses sem depósito (+ 13º)` : `${reais(fgtsMensal)} − ${reais(comprovado)} comprovados`, aDepositar,
      { fora: !!e.fgtsOutroPedido });
    // FGTS rescisório (ainda não recolhido)
    const vFgtsSaldo = saldoBruto > 0 ? item(F, 'FGTS rescisório sobre o saldo de salário (8%)', `8% × ${reais(saldoBruto)}`, saldoBruto * 0.08) : 0;
    const vFgts13 = v13 > 0 ? item(F, `FGTS rescisório sobre o 13º devido (8%)${diasAv && a13 > a13sem ? ' — já com a projeção do aviso' : ''}`, `8% × ${reais(v13)}`, v13 * 0.08) : 0;
    const vFgtsAviso = diasAv ? item(F, 'FGTS rescisório sobre o aviso prévio indenizado (8%)', `8% × ${reais(vAviso)} (Súmula 305 do TST) · fora da base da multa`, vAviso * 0.08) : 0;
    void vFgtsSaldo; void vFgts13; void vFgtsAviso;
    // base fundiária legal da multa: mensal + saldo + 13º do ano SEM a projeção do aviso
    const base13Sem = justa ? 0 : rem / 12 * a13sem;
    const fgtsContratual = r2(fgtsMensal + (saldoBruto + base13Sem) * 0.08);
    const pct = semJusta ? 0.4 : motivo === 'acordo' ? 0.2 : 0;
    let vMulta = 0;
    if (pct && e.multaFgts === true) vMulta = item(F, `Multa de ${pct * 100}% do FGTS (${indireta ? 'rescisão indireta' : motivo === 'acordo' ? 'acordo' : 'dispensa sem justa causa'})`,
      `${pct * 100}% × ${reais(fgtsContratual)} (FGTS mensal ${reais(fgtsMensal)} + 8% do saldo + 8% do 13º sem a projeção; SEM o FGTS do aviso indenizado — OJ 42, II, SDI-1 / Tema 255 do TST)`, fgtsContratual * pct);
    void vMulta;
    const subFgts = r2(F.filter(x => !x.fora).reduce((t, x) => t + x.valor, 0));
    if (e.fgtsOutroPedido && vFgtsDif) notas.push(`FGTS mensal não recolhido (${reais(vFgtsDif)}) já calculado em outro pedido: aparece para conferência e NÃO entra no total. O FGTS rescisório (saldo, 13º e aviso) é discriminado separadamente; a multa do FGTS só entra quando selecionada.`);

    // 7) Multas dos arts. 477 e 467 da CLT — só se marcadas (dependem de pressupostos)
    const M = [];
    if (e.multa477 === true) M.push({ rot: 'Multa do art. 477, § 8º, da CLT (1 salário)', conta: '1 × ' + reais(sal) + ' — inclusão selecionada', valor: r2(sal), incluir: true });
    if (e.multa467 === true) {
      const base467 = Number(e.baseMulta467);
      if (!Number.isFinite(base467) || base467 <= 0) throw new Error('Informe a base das verbas rescisórias incontroversas para incluir a multa do art. 467.');
      M.push({ rot: 'Multa do art. 467 da CLT (50% da base incontroversa informada)', conta: '50% × ' + reais(base467) + ' — base informada, sem presumir o subtotal inteiro', valor: r2(base467 * 0.5), incluir: true });
    }
    const subMultas = r2(M.reduce((t, x) => t + x.valor, 0));
    const subAnt = r2(X.reduce((t, x) => t + x.valor, 0));
    const total = r2(subtotal + subAnt + subFgts + subMultas);
    // INSS só para conferência (não sai do cálculo bruto)
    const inss = v => { let t = 0, ant = 0; for (const [lim, a] of [[1621.00, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]) { if (v > ant) t += (Math.min(v, lim) - ant) * a; ant = lim; } return r2(t); };
    return { indireta, motivo, anos, diasAv, fim, rem, verbas: L, subtotal, anteriores: X, subAnt, contratual: C, fgts: F, subFgts, multas: M, subMultas, total,
      fgtsContratual, notas, inssConferencia: r2(inss(vSaldo) + inss(v13)), saldo: vSaldo };
  }
  raiz.RESCISAO = { calcular, avos, diasAviso, anosCompletos, r2 };
})(typeof window !== 'undefined' ? window : globalThis);
