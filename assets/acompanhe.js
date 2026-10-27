/* Área do cliente: consulta dos processos com CPF + código (nada fica guardado no navegador). */
(function () {
  'use strict';
  var form = document.getElementById('acomp-form');
  if (!form) return;
  var erro = document.getElementById('ac-erro'), saida = document.getElementById('ac-resultado');
  var cpf = form.cpf, cod = form.codigo, btn = form.querySelector('button');
  var grade = form.closest('.acomp-grid') || form;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function dataBR(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function mascara(v) {
    v = v.replace(/\D/g, '').slice(0, 14);
    if (v.length <= 11) return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  cpf.addEventListener('input', function () { cpf.value = mascara(cpf.value); });
  cod.addEventListener('input', function () { cod.value = cod.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); });

  function mostrar(r) {
    saida.textContent = '';
    var cab = el('div', 'acomp-cab');
    cab.appendChild(el('h2', '', 'Olá, ' + r.nome + '.'));
    cab.appendChild(el('p', '', r.processos.length ? 'Encontramos ' + r.processos.length + ' processo' + (r.processos.length === 1 ? '' : 's') + ' no seu nome.' : 'Ainda não há processo cadastrado no seu nome. Fale com o escritório se tiver dúvida.'));
    var sair = el('button', 'btn line sm', 'Sair');
    sair.type = 'button';
    sair.addEventListener('click', function () { saida.textContent = ''; grade.hidden = false; cpf.value = ''; cod.value = ''; cpf.focus(); });
    cab.appendChild(sair);
    saida.appendChild(cab);
    r.processos.forEach(function (p) {
      var card = el('article', 'acomp-card');
      var topo = el('div', 'acomp-topo');
      topo.appendChild(el('strong', 'acomp-num', p.numero));
      topo.appendChild(el('span', 'acomp-tag' + (p.situacao === 'Em andamento' ? ' ativo' : ''), p.situacao));
      card.appendChild(topo);
      card.appendChild(el('p', 'acomp-orgao', [p.area, p.orgao || p.tribunal].filter(Boolean).join(' · ')));
      if (p.proximo) {
        var prox = el('div', 'acomp-prox');
        prox.appendChild(el('span', '', 'Próximo ato'));
        prox.appendChild(el('strong', '', p.proximo.ato + ' — ' + dataBR(p.proximo.data)));
        card.appendChild(prox);
      }
      if (p.movimentacao) card.appendChild(el('p', 'acomp-mov', 'Última movimentação em ' + dataBR(p.movimentacao) + (p.ultimo ? ': ' + p.ultimo : '')));
      saida.appendChild(card);
    });
    if (r.atualizado) saida.appendChild(el('p', 'acomp-peq', 'Informações atualizadas pelo escritório em ' + new Date(r.atualizado).toLocaleString('pt-BR') + '. Elas não substituem a consulta oficial no sistema do tribunal.'));
    grade.hidden = true;
    saida.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    erro.textContent = '';
    var c = cpf.value.replace(/\D/g, ''), k = cod.value.trim();
    if (c.length !== 11 && c.length !== 14) { erro.textContent = 'Digite o CPF completo.'; cpf.focus(); return; }
    if (k.length !== 8) { erro.textContent = 'O código tem 8 letras e números.'; cod.focus(); return; }
    if (!window.PAINEL_API_URL) { erro.textContent = 'Consulta indisponível no momento. Fale com o escritório.'; return; }
    btn.disabled = true; btn.textContent = 'Consultando…';
    fetch(window.PAINEL_API_URL, { method: 'POST', body: JSON.stringify({ acao: 'consulta.processos', dados: { cpf: c, codigo: k } }), redirect: 'follow', credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.erro || 'Não foi possível consultar.'); cod.value = ''; mostrar(j.dados); })
      .catch(function (e) { erro.textContent = e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'Sem conexão. Tente de novo em instantes.'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Ver meus processos'; });
  });
})();
