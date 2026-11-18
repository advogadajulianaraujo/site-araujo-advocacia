// Regressão: nenhuma multa é presumida. Exemplo e combinações com dados fictícios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../assets/rescisao-motor.js'), 'utf8'), ctx);
const { calcular, r2 } = ctx.RESCISAO;
const entrada = {
  salario: 2860, medias: 0, admissao: new Date('2025-06-01T00:00:00Z'), ruptura: new Date('2026-08-27T00:00:00Z'),
  motivo: 'indireta', aviso: 'indenizado', feriasGozadas: 0, decimoAnterior: 'nao_pago', fgtsDep: 'naosei', fgtsOutroPedido: true
};
const sem = calcular(entrada);
assert.equal(sem.subtotal, 12949.44);
assert.equal(sem.subAnt, 1668.33);
assert.equal(sem.subFgts, 629.2); // 18/11: FGTS rescisório = saldo 205,92 + 13º 171,60 + aviso 251,68
assert.equal(sem.total, 15246.97);
assert.equal(sem.multas.length, 0);
assert.ok(sem.fgts.every(x => !/^Multa de /.test(x.rot)));
for (let mask = 0; mask < 8; mask++) {
  const multaFgts = !!(mask & 1), multa477 = !!(mask & 2), multa467 = !!(mask & 4);
  const r = calcular({ ...entrada, multaFgts, multa477, multa467, baseMulta467: 1000 });
  assert.equal(r.multas.length, +multa477 + +multa467);
  assert.equal(r.fgts.some(x => /^Multa de /.test(x.rot)), multaFgts);
  assert.equal(r.subMultas, (multa477 ? 2860 : 0) + (multa467 ? 500 : 0));
  assert.equal(r.total, r2(sem.total + (multaFgts ? 1477.67 : 0) + r.subMultas));
}
for (const baseMulta467 of [undefined, '', 0, -1, Infinity, NaN]) {
  assert.throws(() => calcular({ ...entrada, multa467: true, baseMulta467 }), /base.*incontroversas/);
}
const textoFalso = calcular({ ...entrada, multaFgts: 'false', multa477: 'false', multa467: 'false' });
assert.equal(textoFalso.total, sem.total);
assert.equal(textoFalso.multas.length, 0);
const marcado = calcular({ ...entrada, multaFgts: true, multa477: true, multa467: true, baseMulta467: 1000 });
assert.ok(marcado.total > sem.total);
assert.equal(calcular({ ...entrada, multaFgts: false, multa477: false, multa467: false, baseMulta467: 1000 }).total, sem.total);
const acordo = calcular({ ...entrada, motivo: 'acordo', multaFgts: true });
assert.equal(acordo.fgts.find(x => /^Multa de /.test(x.rot)).valor, r2(acordo.fgtsContratual * 0.2));
for (const motivo of ['pedido', 'justa']) assert.ok(calcular({ ...entrada, motivo, multaFgts: true }).fgts.every(x => !/^Multa de /.test(x.rot)));
const outro = calcular({ ...entrada, fgtsDep: 'nao', fgtsOutroPedido: true });
assert.equal(outro.total, sem.total);
assert.ok(outro.fgts.some(x => x.fora));
console.log('✓ Multas opcionais: exemplo, oito combinações, base do art. 467, recálculo e FGTS sem duplicidade.');
