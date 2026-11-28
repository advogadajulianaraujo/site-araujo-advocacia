// 8.64: execução do contrato de honorários — parcelas vencidas, vencimento antecipado e demonstrativo (dados INVENTADOS)
const T = require('./teste.js'); const { C, assert, add } = T;
const hoje = C.hojeSP_(), dia = n => C.somarDias_(hoje, n);
add('Clientes', [{ id: 'CEX1', nome: 'Cliente Inventado Execução', cpf_cnpj: '123.456.789-09', criado_em: hoje }, { id: 'CEX2', nome: 'Cliente Em Dia', criado_em: hoje }]);
add('Honorarios', [{ id: 'HEX1', cliente_id: 'CEX1', tipo: 'parcelado', valor_total: '1200.00', situacao: 'ativo', inicio: '2026-01-15', criado_em: '2026-01-15T12:00:00Z' }]);
add('Parcelas', [{ id: 'PEX1', honorario_id: 'HEX1', cliente_id: 'CEX1', numero: '1', vencimento: dia(-90), valor: '400.00', pago_em: dia(-89), valor_pago: '400.00' },
  { id: 'PEX2', honorario_id: 'HEX1', cliente_id: 'CEX1', numero: '2', vencimento: dia(-60), valor: '400.00' },
  { id: 'PEX3', honorario_id: 'HEX1', cliente_id: 'CEX1', numero: '3', vencimento: dia(30), valor: '400.00' }]);
const inpc = {}; for (let i = -4; i <= 0; i++) { const m = C.somarDias_(hoje, i * 30).slice(0, 7); inpc[m] = 0.5; }
const e = C.encargosParcela_(400, dia(-60), hoje, inpc);
assert(e.dias === 60 && Math.abs(e.juros - Math.round(e.corrigido * 0.02 * 100) / 100) < 0.011 && e.multa === Math.round(e.corrigido * 0.02 * 100) / 100 && e.corrigido > 400, 'encargos: correção INPC, juros 1% a.m. pro rata (60 dias = 2%) e multa 2% sobre o corrigido');
const r = C.execucaoCalculo_({ id: 'CEX1' }, inpc);
assert(r.vencidas === 1 && r.antecipadas === 1 && Math.abs(r.total - (e.total + 400)) < 0.011, 'paga fica fora; vencida com encargos + a seguinte antecipada (atraso > 30 dias)');
assert(/2ª parcela, vencida em/.test(r.parcelasTxt) && /cláusula 7ª/.test(r.antecipadasTxt) && /INPC/.test(r.encargosTxt) && /vencimento antecipado/.test(r.demonstrativoTxt) && r.dataContrato === '2026-01-15', 'textos da petição e data do contrato');
let erro = ''; try { C.execucaoCalculo_({ id: 'CEX2' }, inpc); } catch (x) { erro = x.message; }
assert(/não tem parcelas vencidas/.test(erro), 'cliente sem parcela vencida: não gera execução');
const r2 = C.execucaoCalculo_({ id: 'CEX1' }, {});
assert(/COMPLETAR/.test(r2.encargosTxt) && !/correção R\$/.test(r2.demonstrativoTxt), 'sem o índice do Banco Central: avisa para conferir a correção (não inventa)');
console.log('fim execucao');
