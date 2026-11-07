/* Cadastro do cliente pelo link do escritório (8.14). Os dados vão direto para o painel; nada fica guardado no navegador. */
(function () {
  'use strict';
  var form = document.getElementById('cad-form'), aviso = document.getElementById('cad-aviso'), erro = document.getElementById('cad-erro');
  var ok = document.getElementById('cad-ok'), ola = document.getElementById('cad-ola');
  var codigo = (new URLSearchParams(location.search).get('c') || '').replace(/[^a-f0-9]/gi, '');
  var mostrarAviso = function (t) { aviso.textContent = t; aviso.hidden = false; form.hidden = true; };
  var chamar = function (acao, dados) {
    return fetch(window.PAINEL_API_URL, { method: 'POST', body: JSON.stringify({ acao: acao, dados: dados }) }).then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.erro || 'Não foi possível enviar.'); return j.dados; });
  };
  var mascaraCpf = function (v) { v = v.replace(/\D/g, '').slice(0, 11); return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); };
  var mascaraTel = function (v) { v = v.replace(/\D/g, '').slice(0, 11); return v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, ''); };
  var cpfOk = function (c) { c = c.replace(/\D/g, ''); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var dv = function (n) { var s = 0; for (var i = 0; i < n; i++) s += +c[i] * (n + 1 - i); var r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === +c[9] && dv(10) === +c[10]; };
  form.cpf.addEventListener('input', function () { form.cpf.value = mascaraCpf(form.cpf.value); form.cpf.setCustomValidity(''); });
  form.telefone.addEventListener('input', function () { form.telefone.value = mascaraTel(form.telefone.value); });
  form.cep.addEventListener('input', function () {
    var v = form.cep.value.replace(/\D/g, '').slice(0, 8); form.cep.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
    if (v.length === 8) fetch('https://viacep.com.br/ws/' + v + '/json/').then(function (r) { return r.json(); }).then(function (e) {
      if (e && !e.erro) { if (!form.rua.value) form.rua.value = e.logradouro || ''; if (!form.bairro.value) form.bairro.value = e.bairro || ''; form.cidade.value = e.localidade || form.cidade.value; form.uf.value = e.uf || form.uf.value; (form.rua.value ? form.numero : form.rua).focus(); }
    }).catch(function () { /* preenche à mão */ });
  });
  if (!codigo || codigo.length < 32) { mostrarAviso('Este endereço de cadastro está incompleto. Abra o link exatamente como o escritório mandou pelo WhatsApp, ou peça um novo.'); return; }
  if (!window.PAINEL_API_URL) { mostrarAviso('Cadastro indisponível no momento. Fale com o escritório pelo WhatsApp (48) 99612-6491.'); return; }
  chamar('site.cadastroInfo', { c: codigo }).then(function (r) {
    if (!r.ok) { mostrarAviso('Este link de cadastro expirou ou já foi usado. Peça um novo pelo WhatsApp do escritório: (48) 99612-6491.'); return; }
    if (r.nome) ola.textContent = 'Olá, ' + r.nome + '! Preencha os seus dados para darmos andamento ao atendimento. Leva uns 3 minutos.';
    if (r.telefone) form.telefone.value = mascaraTel(r.telefone);
    form.hidden = false;
  }).catch(function (e) { mostrarAviso(e.message && !/fetch|network/i.test(e.message) ? e.message : 'Sem conexão. Tente de novo em instantes.'); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); erro.textContent = '';
    if (!cpfOk(form.cpf.value)) { form.cpf.setCustomValidity('CPF inválido'); }
    if (!form.checkValidity()) { form.reportValidity(); erro.textContent = 'Confira os campos marcados.'; return; }
    var dados = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) dados[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    var isca = dados.empresa_site; delete dados.empresa_site;
    var bt = form.querySelector('button[type=submit]'); bt.disabled = true; bt.textContent = 'Enviando…';
    chamar('site.cadastro', { c: codigo, dados: dados, empresa_site: isca }).then(function () {
      form.hidden = true; ok.hidden = false; ok.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) { erro.textContent = e.message && !/fetch|network/i.test(e.message) ? e.message : 'Sem conexão. Tente de novo.'; })
      .then(function () { bt.disabled = false; bt.textContent = 'Enviar meu cadastro'; });
  });
})();
