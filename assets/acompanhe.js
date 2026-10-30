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

  // Etapas mostradas ao cliente (em linguagem simples)
  var ETAPAS = [
    { id: 'contratado', nome: 'Preparação' }, { id: 'ajuizado', nome: 'Ajuizado' }, { id: 'andamento', nome: 'Em andamento' },
    { id: 'sentenca', nome: 'Decisão' }, { id: 'recurso', nome: 'Recurso' }, { id: 'execucao', nome: 'Recebimento' }, { id: 'extinto', nome: 'Concluído' }];
  var POS = { contratado: 0, ajuizado: 1, andamento: 2, sentenca: 3, acordo: 3, homologacao: 3, recurso: 4, execucao: 5, extinto: 6 };
  var EXPLICA = {
    contratado: 'Estamos reunindo os documentos e preparando a ação. Assim que ela for protocolada, o número do processo aparece aqui.',
    ajuizado: 'A ação foi protocolada na Justiça. Agora o juízo vai analisar o pedido e chamar a outra parte.',
    andamento: 'O processo está tramitando normalmente: o juízo e as partes estão praticando os atos do processo.',
    sentenca: 'O juízo já decidiu o pedido (sentença). Estamos analisando a decisão e os próximos passos.',
    acordo: 'Houve acordo entre as partes. Agora é aguardar a homologação e o cumprimento do que foi combinado.',
    homologacao: 'O acordo ou o cálculo foi homologado pelo juízo. Falta o cumprimento (pagamento ou providência).',
    recurso: 'O processo está em fase de recurso, sendo analisado pelo tribunal.',
    execucao: 'Fase de cumprimento: cobrança e recebimento dos valores ou do que foi decidido.',
    extinto: 'O processo foi concluído e arquivado.'
  };
  var WHATS = 'https://wa.me/5548996126491?text=';

  function etapas(fase) {
    var atual = POS[fase] === undefined ? 2 : POS[fase];
    var ol = el('ol', 'acomp-etapas');
    ol.setAttribute('aria-label', 'Etapas do processo');
    ETAPAS.forEach(function (e, i) {
      var li = el('li', i < atual ? 'feita' : i === atual ? 'atual' : '');
      li.appendChild(el('span', 'acomp-bola', i < atual ? '✓' : String(i + 1)));
      li.appendChild(el('span', 'acomp-et-nome', e.nome));
      if (i === atual) li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    return ol;
  }

  function mostrar(r) {
    saida.textContent = '';
    var cab = el('div', 'acomp-cab');
    var t = el('div');
    t.appendChild(el('p', 'acomp-ola', 'Área do cliente'));
    t.appendChild(el('h2', '', 'Olá, ' + r.nome + '!'));
    t.appendChild(el('p', '', r.processos.length ? 'Você tem ' + r.processos.length + ' processo' + (r.processos.length === 1 ? '' : 's') + ' com o escritório.' : 'Ainda não há processo cadastrado no seu nome. Fale com o escritório se tiver dúvida.'));
    cab.appendChild(t);
    var sair = el('button', 'btn line sm', 'Sair');
    sair.type = 'button';
    sair.addEventListener('click', function () { saida.textContent = ''; grade.hidden = false; cpf.value = ''; cod.value = ''; cpf.focus(); });
    cab.appendChild(sair);
    saida.appendChild(cab);
    r.processos.forEach(function (p) {
      var card = el('article', 'acomp-card' + (p.situacao === 'Arquivado / baixado' ? ' arquivado' : ''));
      var topo = el('div', 'acomp-topo');
      var tit = el('div');
      tit.appendChild(el('span', 'acomp-area', p.area || 'Processo'));
      tit.appendChild(el('strong', 'acomp-num', p.numero || 'Ação em preparação'));
      topo.appendChild(tit);
      topo.appendChild(el('span', 'acomp-tag' + (p.situacao === 'Arquivado / baixado' ? '' : ' ativo'), p.fase_nome || p.situacao));
      card.appendChild(topo);
      if (p.orgao || p.tribunal) card.appendChild(el('p', 'acomp-orgao', [p.orgao, p.tribunal].filter(Boolean).join(' · ')));
      card.appendChild(etapas(p.fase));
      card.appendChild(el('p', 'acomp-explica', EXPLICA[p.fase] || EXPLICA.andamento));
      if (p.proximo) {
        var prox = el('div', 'acomp-prox');
        prox.appendChild(el('span', '', 'Próximo compromisso'));
        prox.appendChild(el('strong', '', p.proximo.ato + ' — ' + dataBR(p.proximo.data)));
        prox.appendChild(el('small', '', 'O escritório vai orientar você antes da data. Guarde este dia na agenda.'));
        card.appendChild(prox);
      }
      var andam = (p.andamentos || []).slice();
      if (!andam.length && p.movimentacao) andam = [{ d: p.movimentacao, n: p.ultimo || 'Movimentação no processo' }];
      if (andam.length) {
        var det = el('details', 'acomp-hist');
        det.appendChild(el('summary', '', 'Últimas movimentações (' + andam.length + ')'));
        var ul = el('ul', 'acomp-linha');
        andam.forEach(function (m) { var li = el('li'); li.appendChild(el('time', '', dataBR(m.d))); li.appendChild(el('span', '', m.n)); ul.appendChild(li); });
        det.appendChild(ul);
        if (andam === p.andamentos || p.andamentos.length) det.open = false;
        card.appendChild(det);
      }
      var fala = el('a', 'acomp-fala', 'Dúvida sobre este processo? Fale com o escritório');
      fala.href = WHATS + encodeURIComponent('Olá! Sou ' + r.nome + ' e tenho uma dúvida sobre o meu processo' + (p.numero ? ' nº ' + p.numero : '') + '.');
      fala.target = '_blank'; fala.rel = 'noopener noreferrer'; fala.setAttribute('data-contact', 'acompanhe-duvida');
      card.appendChild(fala);
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
