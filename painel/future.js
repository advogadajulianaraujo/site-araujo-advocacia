/* Painel do Edifício Future — telas (os dados vêm de painel-backend/Code.gs, rotas future.*).
   Usa as ferramentas do painel (window.PAINEL_KIT), lidas na hora de desenhar. */
(() => {
  'use strict';
  const K = () => window.PAINEL_KIT;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SIT = {
    alugado: ['Alugado', 'f-alugado'], disponivel: ['Disponível', 'f-livre'], renovar: ['Renovar contrato', 'f-renovar'],
    reforma: ['Em reforma', 'f-reforma'], proprio: ['Uso próprio', 'f-proprio']
  };
  const COB = { paga: ['Paga', 'ok'], 'paga em parte': ['Paga em parte', 'atencao'], aberta: ['Em aberto', ''], atrasada: ['Atrasada', 'urgente'], cancelada: ['Cancelada', ''] };
  const compHoje = () => K().hojeISO().slice(0, 7);
  const compMais = (c, n) => { let a = +c.slice(0, 4), m = +c.slice(5, 7) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + '-' + String(m + 1).padStart(2, '0'); };
  const nomeMes = c => c ? MESES[+c.slice(5, 7) - 1] + ' de ' + c.slice(0, 4) : '';
  const curto = c => c ? MESES[+c.slice(5, 7) - 1].slice(0, 3) + '/' + c.slice(2, 4) : '';
  const num = v => +String(v || '').replace(/[R$\s.]/g, '').replace(',', '.') || 0;
  const primeiro = n => K().nomeProprioJS(String(n || '').trim().split(/\s+/)[0] || '');
  const ir = (rota, mud, params) => { const q = new URLSearchParams(params || ''); Object.entries(mud || {}).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); }); location.hash = '#/future' + (rota ? '/' + rota : '') + (q.toString() ? '?' + q : ''); };
  function whats(tel, msg) {
    const partes = String(tel || '').split(/\s*(?:[\/;,|]|\bou\b|\be\b)\s*/i).filter(x => x.replace(/\D/g, '').length >= 10); // só o 1º telefone
    let t = String(partes[0] || tel || '').replace(/\D/g, ''); if (!t) return null;
    if (t.length <= 11) t = '55' + t;
    return 'https://wa.me/' + t + '?text=' + encodeURIComponent(msg);
  }
  const msgCobranca = c => `Olá, ${primeiro(c.pessoa) || 'tudo bem'}! Aqui é da administração do Edifício Future. Passando para lembrar do aluguel de ${nomeMes(c.competencia)} (${c.unidade}): ` +
    `${K().reais(c.total)}${c.energia ? ' (aluguel, taxas e energia)' : ' (aluguel e taxas)'}, com vencimento em ${K().dataBR(c.vencimento)}. Qualquer dúvida, estamos à disposição. Obrigado!`;

  /* ---------- peças comuns ---------- */
  function topo(kicker, titulo, sub, acoes) {
    const { h } = K();
    return h('header', { class: 'carteira-topo fut-topo' },
      h('div', { class: 'carteira-tit' }, h('span', { class: 'carteira-kicker' }, kicker), h('h1', {}, titulo), sub ? h('p', {}, sub) : null),
      acoes ? h('div', { class: 'carteira-acoes' }, acoes) : null);
  }
  // Mês de REFERÊNCIA: a cobrança que vence em novembro é de outubro (aluguel pago depois de usar). Tudo abre no mês anterior.
  const refHoje = () => compMais(compHoje(), -1);
  function navRef(ref, rota, params, extra) {
    const { h } = K();
    return h('div', { class: 'fut-mes' },
      h('button', { type: 'button', class: 'btn sec', 'aria-label': 'Mês anterior', onclick: () => ir(rota, { mes: compMais(ref, -1) }, params) }, '‹'),
      h('strong', {}, 'Referente a ' + nomeMes(ref)),
      h('button', { type: 'button', class: 'btn sec', 'aria-label': 'Próximo mês', onclick: () => ir(rota, { mes: compMais(ref, 1) }, params) }, '›'),
      extra ? h('span', { class: 'peq' }, extra) : null,
      ref !== refHoje() ? h('button', { type: 'button', class: 'link', onclick: () => ir(rota, { mes: '' }, params) }, 'mês atual') : null);
  }
  function navMes(comp, rota, params) {
    const { h } = K();
    return h('div', { class: 'fut-mes' },
      h('button', { type: 'button', class: 'btn sec', 'aria-label': 'Mês anterior', onclick: () => ir(rota, { mes: compMais(comp, -1) }, params) }, '‹'),
      h('strong', {}, nomeMes(comp)),
      h('button', { type: 'button', class: 'btn sec', 'aria-label': 'Próximo mês', onclick: () => ir(rota, { mes: compMais(comp, 1) }, params) }, '›'),
      comp !== compHoje() ? h('button', { type: 'button', class: 'link', onclick: () => ir(rota, { mes: '' }, params) }, 'hoje') : null);
  }
  function numero(cls, valor, rotulo, sub, href) {
    const { h } = K();
    return h(href ? 'a' : 'div', { class: 'fin-num ' + cls, href }, h('span', { class: 'fin-num-rot' }, rotulo), h('b', {}, valor), sub ? h('span', { class: 'fin-num-sub' }, sub) : null);
  }
  /** Barras de 12 meses (receitas x despesas) e a linha da energia — SVG feito aqui (a CSP não deixa biblioteca de fora). */
  function grafico(serie) {
    const W = 720, H = 220, pad = 30, max = Math.max(1, ...serie.map(s => Math.max(s.receitas, s.despesas)));
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`); svg.setAttribute('class', 'fut-graf'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Receitas e despesas dos últimos 12 meses');
    const el = (t, a, txt) => { const e = document.createElementNS(ns, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt) e.textContent = txt; svg.append(e); return e; };
    const bw = (W - pad) / serie.length, y = v => H - (v / max) * (H - 20);
    [0.5, 1].forEach(f => el('line', { x1: pad, x2: W, y1: y(max * f), y2: y(max * f), class: 'g-grade' }));
    serie.forEach((s, i) => {
      const x = pad + i * bw + bw * 0.14, w = bw * 0.34;
      el('rect', { x, y: y(s.receitas), width: w, height: H - y(s.receitas), class: 'g-rec', rx: 3 }).append(Object.assign(document.createElementNS(ns, 'title'), { textContent: curto(s.mes) + ' · receitas ' + K().reais(s.receitas) }));
      el('rect', { x: x + w + 3, y: y(s.despesas), width: w, height: H - y(s.despesas), class: 'g-des', rx: 3 }).append(Object.assign(document.createElementNS(ns, 'title'), { textContent: curto(s.mes) + ' · despesas ' + K().reais(s.despesas) }));
      el('text', { x: x + w, y: H + 16, class: 'g-rot', 'text-anchor': 'middle' }, curto(s.mes));
    });
    const pts = serie.map((s, i) => `${pad + i * bw + bw / 2},${y(s.energia)}`).join(' ');
    el('polyline', { points: pts, class: 'g-ene' });
    return svg;
  }

  /* ---------- Visão geral ---------- */
  async function visao(params) {
    const { h, api, mostrar, reais, dataBR, carregando } = K();
    carregando();
    const ref = params.get('mes') || refHoje(), comp = compMais(ref, 1);
    const r = await api('future.resumo', { mes: comp });
    if (!r.total) return semDados();
    const n = r.numeros, alugaveis = r.total - n.proprio, ocup = alugaveis ? Math.round(((n.alugado + n.renovar) / alugaveis) * 100) : 0;
    const tile = u => {
      const s = SIT[u.situacao] || SIT.disponivel, num = u.id.replace(/^AP /, '').replace(/^SALA /, 'Sala ');
      const cob = u.cobranca && COB[u.cobranca];
      return h('a', { class: 'fut-ap ' + s[1], href: '#/future/unidade/' + encodeURIComponent(u.id), title: s[0] + (u.locatario ? ' · ' + u.locatario : '') },
        h('span', { class: 'fut-ap-n' }, num),
        h('span', { class: 'fut-ap-nome' }, u.situacao === 'disponivel' ? 'Disponível' : (primeiro(u.locatario) || s[0])),
        u.saida && /alugado|renovar/.test(u.situacao) ? h('span', { class: 'fut-ap-ate' }, 'até ' + dataBR(u.saida).slice(0, 5) + '/' + u.saida.slice(2, 4)) : h('span', { class: 'fut-ap-ate' }, s[0]),
        cob ? h('span', { class: 'fut-ap-cob ' + cob[1], title: 'Aluguel do mês: ' + cob[0] }, u.cobranca === 'paga' ? '✓' : u.cobranca === 'atrasada' ? '!' : '•') : null,
        u.pagador ? h('span', { class: 'fut-ap-hc', title: 'Pago por ' + u.pagador }, 'HC') : null);
    };
    const andares = [['2º andar', r.unidades.filter(u => /^AP 2/.test(u.id))], ['1º andar', r.unidades.filter(u => /^AP 1/.test(u.id))], ['Salas comerciais', r.unidades.filter(u => /^SALA/.test(u.id))]]
      .filter(a => a[1].length);
    const legenda = h('div', { class: 'fut-legenda' }, Object.entries(SIT).map(([k, s]) => h('span', { class: 'fut-leg ' + s[1] }, s[0] + ' · ' + (n[k] || 0))),
      h('span', { class: 'peq' }, '✓ aluguel do mês pago · ! atrasado · • em aberto'));
    mostrar(
      topo('Edifício Future', 'Visão geral', `${n.alugado + n.renovar} de ${alugaveis} unidades ocupadas (${ocup}%)`,
        [h('a', { class: 'btn dourado', href: '#/future/relatorio?mes=' + ref }, 'Relatório de ' + MESES[+ref.slice(5, 7) - 1]), h('a', { class: 'btn sec', href: '#/future/caixa?mes=' + ref }, '+ Lançar despesa')]),
      navRef(ref, '', params, 'cobranças vencem dia 10/' + comp.slice(5, 7)),
      h('section', { class: 'fin-nums fut-nums' },
        numero('verde', reais(r.receitas), 'Recebido', 'aluguéis e outras receitas de ' + MESES[+ref.slice(5, 7) - 1]),
        numero('vermelho', reais(r.despesas), 'Despesas', 'lançadas em ' + MESES[+ref.slice(5, 7) - 1], '#/future/caixa?mes=' + ref),
        numero(r.receitas - r.despesas >= 0 ? 'dourado' : 'vermelho', reais(r.receitas - r.despesas), 'Resultado', 'recebido − despesas'),
        numero(r.atrasado ? 'vermelho' : 'azul', reais(r.aReceber), 'Falta receber', r.atrasado ? `${reais(r.atrasado)} em atraso` : 'cobranças em aberto', '#/future/cobrancas?mes=' + ref)),
      h('section', { class: 'caixa fut-predio-caixa' }, h('h2', {}, 'O prédio agora'), legenda,
        h('div', { class: 'fut-predio' }, andares.map(([nome, us]) => h('div', { class: 'fut-andar' }, h('span', { class: 'fut-andar-nome' }, nome), h('div', { class: 'fut-aps' }, us.map(tile)))))),
      h('div', { class: 'fut-duas' },
        h('section', { class: 'caixa' }, h('h2', {}, `Contratos vencendo · 45 dias (${r.vencendo.length})`),
          r.vencendo.length ? h('ul', { class: 'fut-lista fut-renovar' }, r.vencendo.map(u => {
            const l = whats(u.telefone, `Olá, ${primeiro(u.locatario)}! Aqui é da administração do Edifício Future. O contrato do ${u.id} vence em ${dataBR(u.saida)}. Você tem interesse em renovar? Podemos conversar sobre as condições.`);
            return h('li', {}, h('a', { href: '#/future/unidade/' + encodeURIComponent(u.id) }, h('b', {}, u.id), ' · ', u.locatario || '—'),
              h('span', { class: 'tag ' + (u.saida < r.hoje ? 'urgente' : 'atencao') }, dataBR(u.saida)),
              l ? h('a', { class: 'btn mini wa', href: l, target: '_blank', rel: 'noopener noreferrer' }, 'Renovar?') : h('span', { class: 'peq' }, 'sem telefone'));
          })) : h('p', { class: 'peq' }, 'Nenhum contrato vence nos próximos 45 dias.')),
        h('section', { class: 'caixa' }, h('h2', {}, `Aluguéis em atraso (${r.atrasadas.length})`),
          r.atrasadas.length ? h('ul', { class: 'fut-lista' }, r.atrasadas.map(c => {
            const l = whats(c.telefone, msgCobranca(c));
            return h('li', {}, h('a', { href: '#/future/cobrancas?mes=' + compMais(c.competencia, -1) }, h('b', {}, c.unidade), ' · ', c.pessoa || '—', ' · ref. ', curto(compMais(c.competencia, -1))),
              h('strong', {}, reais(c.total)), l ? h('a', { class: 'btn mini wa', href: l, target: '_blank', rel: 'noopener noreferrer' }, 'Cobrar') : h('span', { class: 'peq' }, 'sem telefone'));
          })) : h('p', { class: 'peq' }, 'Nenhum aluguel atrasado. 🎉'))),
      h('section', { class: 'caixa' }, h('h2', {}, 'Últimos 12 meses'),
        h('div', { class: 'fut-graf-leg' }, h('span', { class: 'l-rec' }, 'Receitas'), h('span', { class: 'l-des' }, 'Despesas'), h('span', { class: 'l-ene' }, 'Energia (despesa)')),
        grafico(r.serie)));
  }
  function semDados() {
    const { h, mostrar } = K();
    mostrar(topo('Edifício Future', 'Vamos começar', 'O painel ainda não tem os dados do prédio.'),
      h('section', { class: 'caixa' }, h('p', {}, 'Importe a planilha "EDIFICIO FUTURE CONTROLE" (pasta 05. ED. FUTURE): apartamentos, salas, locatários de agora e os que já passaram, receitas, despesas, lavanderia e energia.'),
        h('a', { class: 'btn', href: '#/future/config' }, 'Ir para Configurações e importar')));
  }

  /* ---------- Unidades ---------- */
  const diasAte = iso => iso ? Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(K().hojeISO() + 'T12:00:00')) / 86400000) : null;
  function etiquetaContrato(u) {
    const { h, dataBR } = K();
    if (!/alugado|renovar/.test(u.situacao)) return h('span', { class: 'peq' }, '—');
    const d = diasAte(u.saida);
    if (u.situacao === 'renovar') return h('span', { class: 'tag atencao' }, 'renovar' + (u.saida ? ' · ' + dataBR(u.saida) : ''));
    if (d === null) return h('span', { class: 'tag' }, 'sem data de fim');
    if (d < 0) return h('span', { class: 'tag urgente' }, `venceu há ${-d} dia(s)`);
    if (d <= 45) return h('span', { class: 'tag atencao' }, `vence em ${d} dia(s)`);
    return h('span', { class: 'tag ok' }, 'até ' + dataBR(u.saida));
  }
  function etiquetaGarantia(u) {
    const { h, reais } = K();
    const g = String(u.garantia || '').toLowerCase();
    if (/cau[cç]/.test(g) || u.caucao) return h('span', { class: 'fut-gar ok' }, 'Caução' + (u.caucao ? ' ' + reais(u.caucao) : ''));
    if (/aval/.test(g)) return h('span', { class: 'fut-gar' }, 'Avalista');
    if (/propri/.test(g) || u.situacao === 'proprio') return h('span', { class: 'peq' }, '—');
    return h('span', { class: 'fut-gar falta' }, 'Sem garantia');
  }
  async function unidades(params) {
    const { h, api, mostrar, reais, carregando } = K();
    carregando();
    const r = await api('future.resumo', {});
    const f = params.get('sit') || '';
    const lista = f === 'vencendo' ? r.unidades.filter(u => /alugado|renovar/.test(u.situacao) && (diasAte(u.saida) ?? 999) <= 45)
      : f === 'semcontrato' ? r.unidades.filter(u => /alugado|renovar/.test(u.situacao) && !u.contrato_url)
      : f ? r.unidades.filter(u => u.situacao === f) : r.unidades;
    const nVence = r.unidades.filter(u => /alugado|renovar/.test(u.situacao) && (diasAte(u.saida) ?? 999) <= 45).length;
    const nSem = r.unidades.filter(u => /alugado|renovar/.test(u.situacao) && !u.contrato_url).length;
    const filtros = [['', 'Todas', r.total]].concat(Object.entries(SIT).map(([k, s]) => [k, s[0], r.numeros[k] || 0]), [['vencendo', 'Vencendo (45 dias)', nVence], ['semcontrato', 'Sem contrato no Drive', nSem]]);
    const linha = u => h('tr', { tabindex: 0, onclick: () => { location.hash = '#/future/unidade/' + encodeURIComponent(u.id); } },
      h('td', { 'data-r': 'Unidade' }, h('strong', {}, u.id), h('div', {}, h('span', { class: 'fut-sit ' + (SIT[u.situacao] || SIT.disponivel)[1] }, (SIT[u.situacao] || SIT.disponivel)[0]))),
      h('td', { 'data-r': 'Locatário' }, u.locatario || h('span', { class: 'peq' }, '—'), u.pagador ? h('div', { class: 'peq' }, 'pago por ' + u.pagador) : null),
      h('td', { 'data-r': 'Contrato' }, etiquetaContrato(u), h('div', {}, u.contrato_url
        ? h('a', { class: 'fut-doc', href: u.contrato_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, '📄 ver contrato')
        : /alugado|renovar/.test(u.situacao) ? h('span', { class: 'fut-gar falta' }, 'contrato não achado na pasta') : null)),
      h('td', { 'data-r': 'Garantia' }, etiquetaGarantia(u)),
      h('td', { class: 'num', 'data-r': 'Aluguel + taxas' }, u.aluguel ? h('strong', {}, reais(u.aluguel + u.taxas)) : '—', u.aluguel ? h('div', { class: 'peq' }, reais(u.aluguel) + ' + ' + reais(u.taxas) + ' taxas') : null),
      h('td', { 'data-r': 'Mês' }, u.cobranca ? h('span', { class: 'tag ' + COB[u.cobranca][1] }, COB[u.cobranca][0]) : '—'));
    mostrar(topo('Edifício Future', 'Apartamentos e salas', `${r.total} unidades · ${r.numeros.disponivel} disponível(is) · ${nVence} contrato(s) vencendo · ${nSem} sem contrato achado no Drive`),
      h('div', { class: 'visoes fut-filtro' }, filtros.map(([k, nome, q]) =>
        h('button', { type: 'button', class: 'visao-bt' + (f === k ? ' ativo' : ''), onclick: () => ir('unidades', { sit: k }) }, h('span', {}, nome), h('span', { class: 'visao-n' }, String(q))))),
      h('table', { class: 'tabela fut-tab' }, h('thead', {}, h('tr', {}, ['Unidade', 'Locatário', 'Contrato', 'Garantia', 'Aluguel + taxas', 'Mês'].map(t => h('th', {}, t)))),
        h('tbody', {}, lista.length ? lista.map(linha) : h('tr', {}, h('td', { colspan: 6, class: 'vazio' }, 'Nenhuma unidade.')))));
  }

  async function unidade(id) {
    const { h, api, mostrar, reais, dataBR, campo, aoEnviar, avisar, tabela, carregando, secao } = K();
    carregando();
    const u = await api('future.unidade', { id });
    const recarregar = () => K().rota();
    const s = SIT[u.situacao] || SIT.disponivel;
    const form = h('form', { class: 'campos', novalidate: true },
      campo('situacao', 'Situação', u.situacao, { opcoes: Object.entries(SIT).map(([k, v]) => [k, v[0]]) }),
      campo('locatario', 'Locatário', u.locatario, { max: 120 }),
      campo('telefone', 'Telefone / WhatsApp', u.telefone, { tipo: 'tel', max: 30 }),
      campo('pagador', 'Quem paga (empresa)', u.pagador, { dica: 'ex.: Hercílio Luz (HC) — deixe vazio se for o próprio locatário' }),
      campo('entrada', 'Entrada', u.entrada, { tipo: 'date' }),
      campo('saida', 'Fim do contrato', u.saida, { tipo: 'date' }),
      campo('aluguel', 'Aluguel (R$)', u.aluguel, { modo: 'decimal' }),
      campo('taxas', 'IPTU / lixo / taxas (R$)', u.taxas, { modo: 'decimal' }),
      campo('garantia', 'Garantia', u.garantia, { dica: 'caução, avalista…' }),
      campo('caucao', 'Valor da caução (R$)', u.caucao, { modo: 'decimal' }),
      campo('cobra_energia', 'Energia na cobrança', u.cobra_energia || (/^SALA/.test(u.id) ? 'nao' : 'sim'), { opcoes: [['sim', 'Cobrar a energia do mês anterior'], ['nao', 'Não cobrar (paga a própria energia)']] }),
      campo('moeda', 'Mostrar também em dólar', u.moeda || '', { opcoes: [['', 'Não'], ['dolar', 'Sim (cotação em Configurações)']] }),
      campo('energia_resp', 'Energia (titular/responsável)', u.energia_resp),
      campo('uc', 'Unidade consumidora (UC)', u.uc),
      campo('medidor', 'Medidor', u.medidor),
      campo('kit', 'Nº da kit', u.kit),
      campo('obs', 'Observações', u.obs, { area: true, largo: true }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), h('p', { class: 'erro' })));
    aoEnviar(form, async fd => { await api('future.unidade.salvar', { id: u.id, ...Object.fromEntries(fd.entries()) }); avisar('Unidade atualizada.'); recarregar(); });
    const zap = u.telefone && u.locatario ? whats(u.telefone, `Olá, ${primeiro(u.locatario)}! Aqui é da administração do Edifício Future.`) : null;
    const novaEnergia = h('form', { class: 'barra', novalidate: true },
      h('input', { type: 'month', name: 'competencia', value: compMais(compHoje(), -1), 'aria-label': 'Mês da conta' }),
      h('input', { name: 'valor', placeholder: 'Valor Celesc (R$)', inputmode: 'decimal', 'aria-label': 'Valor' }),
      h('button', { type: 'submit', class: 'btn sec' }, 'Lançar energia'), h('p', { class: 'erro' }));
    aoEnviar(novaEnergia, async fd => { await api('future.energia.salvar', { unidade: u.id, ...Object.fromEntries(fd.entries()) }); avisar('Energia lançada (entra na cobrança do mês seguinte).'); recarregar(); });
    mostrar(
      h('p', { class: 'nao-imprimir' }, h('a', { class: 'link', href: '#/future/unidades' }, '← Apartamentos e salas')),
      topo('Edifício Future · ' + s[0], u.id, u.locatario ? u.locatario + (u.saida ? ' · contrato até ' + dataBR(u.saida) : '') : 'Sem locatário',
        [zap ? h('a', { class: 'btn dourado wa', href: zap, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp') : null,
          u.pasta_url ? h('a', { class: 'btn sec', href: u.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, '📁 Pasta no Drive') : null]),
      h('section', { class: 'fin-nums' },
        numero('dourado', u.aluguel ? reais(num(u.aluguel) + num(u.taxas)) : '—', 'Aluguel + taxas', u.aluguel ? `${reais(num(u.aluguel))} + ${reais(num(u.taxas))}` : ''),
        numero('verde', u.energia[0] ? reais(u.energia[0].valor) : '—', 'Última energia', u.energia[0] ? curto(u.energia[0].competencia) : 'sem lançamento'),
        (() => { const d = u.saida ? Math.round((Date.parse(u.saida + 'T12:00:00') - Date.parse(K().hojeISO() + 'T12:00:00')) / 86400000) : null;
          return numero(d !== null && d <= 45 ? 'vermelho' : 'azul', u.saida ? dataBR(u.saida) : '—', u.situacao === 'renovar' ? 'Renovar contrato' : 'Contrato até',
            d === null ? 'sem data de fim' : d < 0 ? `venceu há ${-d} dia(s)` : `faltam ${d} dia(s)`); })(),
        (() => { const pa = u.pessoas.find(p => p.situacao === 'atual') || {}, g = String(u.garantia || '').toLowerCase();
          return numero(pa.contrato_url ? 'verde' : 'vermelho', pa.contrato_url ? 'Tem contrato' : 'Sem contrato', 'Contrato e garantia',
            (/cau/.test(g) || num(u.caucao) ? 'Caução ' + (num(u.caucao) ? reais(num(u.caucao)) : '') : /aval/.test(g) ? 'Avalista' : 'Sem garantia'), pa.contrato_url || null); })()),
      secao('Dados da unidade e do contrato', form, false),
      h('section', { class: 'caixa' }, h('h2', {}, 'Quem já morou / ocupou'),
        tabela(['Nome', 'Entrada', 'Saída', 'Garantia', 'Situação'], u.pessoas, p => [
          h('td', { 'data-r': 'Nome' }, h('strong', {}, p.nome), p.telefone ? h('div', { class: 'peq' }, p.telefone) : null, p.obs ? h('div', { class: 'peq' }, p.obs) : null,
            p.pasta_url ? h('a', { class: 'fut-doc', href: p.pasta_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, `📁 documentos (${p.arquivos})`) : null),
          h('td', { 'data-r': 'Entrada' }, dataBR(p.entrada) || '—'), h('td', { 'data-r': 'Saída' }, dataBR(p.saida) || '—'),
          h('td', { 'data-r': 'Garantia' }, [p.garantia, p.caucao ? reais(num(p.caucao)) : ''].filter(Boolean).join(' · ') || '—'),
          h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (p.situacao === 'atual' ? 'ok' : '') }, p.situacao === 'atual' ? 'mora agora' : 'saiu'))
        ], () => { location.hash = '#/future/pessoas'; }, 'Ninguém registrado ainda.')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Cobranças'),
        tabela(['Mês', 'Vence', 'Aluguel', 'Taxas', 'Energia', 'Total', 'Situação'], u.cobrancas, c => [
          h('td', { 'data-r': 'Mês' }, curto(c.competencia)), h('td', { 'data-r': 'Vence' }, dataBR(c.vencimento)),
          h('td', { class: 'num', 'data-r': 'Aluguel' }, reais(c.aluguel)), h('td', { class: 'num', 'data-r': 'Taxas' }, reais(c.taxas)),
          h('td', { class: 'num', 'data-r': 'Energia' }, c.energia ? reais(c.energia) : '—'), h('td', { class: 'num', 'data-r': 'Total' }, h('strong', {}, reais(c.total))),
          h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + COB[c.situacao][1] }, COB[c.situacao][0]), c.pago_em ? h('div', { class: 'peq' }, 'em ' + dataBR(c.pago_em)) : null)
        ], c => { location.hash = '#/future/cobrancas?mes=' + c.competencia; }, 'Nenhuma cobrança ainda.')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Energia (Celesc)'), novaEnergia,
        u.energia.length ? h('div', { class: 'fut-ene' }, u.energia.slice(0, 12).reverse().map(e => {
          const max = Math.max(...u.energia.map(x => x.valor), 1);
          return h('div', { class: 'fut-ene-bar', title: curto(e.competencia) + ' · ' + reais(e.valor) }, h('i', { style: null, 'data-h': Math.round((e.valor / max) * 100) }), h('b', {}, reais(e.valor).replace('R$', '').trim()), h('span', {}, curto(e.competencia)));
        })) : h('p', { class: 'peq' }, 'Sem contas lançadas.')),
      u.lancamentos.length ? h('section', { class: 'caixa' }, h('h2', {}, 'Lançamentos desta unidade'),
        tabela(['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'], u.lancamentos, l => [
          h('td', { 'data-r': 'Data' }, dataBR(l.data)), h('td', { 'data-r': 'Tipo' }, l.tipo === 'receita' ? 'Entrou' : 'Saiu'),
          h('td', { 'data-r': 'Categoria' }, l.categoria), h('td', { 'data-r': 'Descrição' }, l.descricao || l.pessoa || '—'),
          h('td', { class: 'num ' + (l.tipo === 'receita' ? 'pos' : 'neg'), 'data-r': 'Valor' }, reais(l.valor))], () => {}, '')) : null);
    document.querySelectorAll('.fut-ene-bar i').forEach(i => { i.style.height = i.dataset.h + '%'; });
  }

  /* ---------- Cobranças: lista para mandar no WhatsApp, uma por uma, e registrar quem pagou ---------- */
  // Mensagem de cobrança no modelo do Luiz (demonstrativo). A cobrança de novembro é "referente a outubro".
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite'; };
  const refMes = c => { const r = compMais(c.competencia, -1); return MESES[+r.slice(5, 7) - 1] + '/' + r.slice(0, 4); };
  const nomeUnidade = id => /^AP /.test(id) ? 'apartamento ' + id.slice(3) : 'sala ' + id.replace(/\D/g, '');
  const faltaEnergia = c => c.cobra_energia && !c.energia;
  function linhasValores(c, r) {
    const { dataBR } = K(), L = [];
    const prop = /^prop\|/.test(c.detalhe || '') ? c.detalhe.split('|') : null;
    const tmp = /^temp\|/.test(c.detalhe || '') ? c.detalhe.split('|') : null;
    if (tmp) L.push(`Locação por temporada de ${dataBR(tmp[4]).slice(0, 5)} a ${dataBR(tmp[5]).slice(0, 5)} (${tmp[3]} dias)` + (+tmp[2] > 1 ? ` — parcela ${tmp[1]} de ${tmp[2]} (${tmp[6]})` : '') + `: ${brl(c.aluguel)}`);
    else L.push(prop ? `Aluguel proporcional de ${dataBR(prop[1]).slice(0, 5)} a ${dataBR(prop[2]).slice(0, 5)} — ${prop[3]} dias, pela base de 30 dias: ${brl(c.aluguel)}` : `Aluguel: ${brl(c.aluguel)}`);
    const itens = r.taxas_itens || [], soma = itens.reduce((a, t) => a + t.valor, 0);
    if (c.taxas) {
      if (itens.length && Math.abs(soma - c.taxas) < 0.01) itens.forEach(t => L.push(`${t.nome}: ${brl(t.valor)}`));
      else L.push(`Taxas: ${brl(c.taxas)}`);
    }
    if (c.cobra_energia) L.push(c.energia ? `Energia: ${brl(c.energia)}` : 'Energia: R$ [preencher]');
    if (c.lavanderia) {
      const sv = c.servicos || [], fax = sv.find(x => x.tipo === 'faxina'), lav = sv.filter(x => x.tipo !== 'faxina');
      const plural = (n, um, varios) => `${n} ${n > 1 ? varios : um}`;
      const desc = lav.map(x => x.tipo === 'secar' ? plural(x.qtd, 'secagem', 'secagens') : x.tipo === 'lavar_secar' ? plural(x.qtd, 'lavagem e secagem', 'lavagens e secagens') : plural(x.qtd, 'lavagem', 'lavagens')).join(', ');
      const vLav = lav.reduce((a, x) => a + x.valor, 0);
      if (!sv.length) L.push(`Lavanderia: ${brl(c.lavanderia)}`);
      if (lav.length) L.push(`Lavanderia (${desc}): ${brl(vLav)}`);
      if (fax) L.push(`Faxina do apartamento${fax.qtd > 1 ? ` (${fax.qtd}×)` : ''}: ${brl(fax.valor)}`);
    }
    if (c.outros) L.push(`${c.obs && !/^Temporada/.test(c.obs) ? c.obs : 'Outros'}: ${brl(c.outros)}`);
    return L;
  }
  // Dados para receber, em formato de Pix (chave sozinha numa linha para copiar fácil). A conta pode mudar e cada apto pode ter a sua.
  const semEmoji = t => String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]+$/gm, '').trim();
  const contaDe = (c, r, escolhida) => (r.contas || []).find(x => x.id === (escolhida || (c && c.conta) || r.conta_padrao)) || (r.contas || [])[0] || null;
  function blocoPagamento(conta, r) {
    if (!conta) return semEmoji(r.pagamento);
    const L = [];
    if (conta.pix) L.push(`Chave Pix${conta.pix_tipo ? ' (' + conta.pix_tipo.toLowerCase() + ')' : ''}: ${conta.pix}`);
    if (conta.titular) L.push(`Titular: ${conta.titular}`);
    const banco = [conta.banco, conta.codigo_banco ? `(${conta.codigo_banco})` : ''].filter(Boolean).join(' ');
    const ag = [banco, conta.agencia ? 'Agência ' + conta.agencia : '', conta.conta ? 'Conta ' + conta.conta : ''].filter(Boolean).join(' · ');
    if (ag) L.push(ag);
    return L.join('\n');
  }
  const totalTxt = c => faltaEnergia(c) ? `R$ [${brl(c.total).replace('R$ ', '')} + energia]` : brl(c.total);
  function textoCobranca(c, r, escolhida) {
    const pagamento = blocoPagamento(contaDe(c, r, escolhida), r);
    const { dataBR } = K(), unidade = nomeUnidade(c.unidade);
    const L = [`Oi, ${saudacao()}, ${primeiro(c.pessoa) || 'tudo bem'}! Tudo bem?`, '',
      /^temp\|/.test(c.detalhe || '') ? `Segue o demonstrativo da locação por temporada no ${r.predio} — ${unidade}:` : `Segue o demonstrativo do ${r.predio} — ${unidade}, referente a ${refMes(c)}:`, '', ...linhasValores(c, r), ''];
    if (c.moeda === 'dolar' && r.cotacao) {
      L.push(`Total em reais: ${totalTxt(c)}`);
      if (!faltaEnergia(c)) L.push(`Equivalente em dólares: US$ ${(c.total / r.cotacao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      L.push(`Cotação utilizada: R$ ${String(r.cotacao).replace('.', ',')} por dólar.`, '', `Vencimento: ${dataBR(c.vencimento)}.`);
      if (pagamento) L.push('', 'Para pagamento em reais (Pix):', pagamento);
    } else {
      L.push(`Total: ${totalTxt(c)}`, `Vencimento: ${dataBR(c.vencimento)}.`);
      if (pagamento) L.push('', 'Pagamento (Pix):', pagamento);
    }
    if (r.dinheiro) L.push('', semEmoji(r.dinheiro));
    L.push('', semEmoji(/^SALA/.test(c.unidade) ? r.assinatura.replace('o apartamento', 'a sala') : r.assinatura));
    return L.join('\n');
  }
  // Empresa que paga vários apartamentos (ex.: Hercílio Luz): um demonstrativo só, com um bloco por apartamento.
  function textoGrupo(pag, cs, r) {
    const pagamento = blocoPagamento(contaDe(null, r), r);
    const { dataBR } = K(), c0 = cs[0], contato = (r.pagadores[pag] || {}).contato;
    const L = [];
    if (contato) L.push(`Oi, ${saudacao()}, ${contato}! Tudo bem?`, '');
    L.push(`Segue o demonstrativo dos apartamentos contratados no ${r.predio}, referente a ${refMes(c0)}, com vencimento em ${dataBR(c0.vencimento)}:`);
    cs.slice().sort((a, b) => a.unidade < b.unidade ? -1 : 1).forEach(c => {
      L.push('', `Apartamento ${c.unidade.replace(/\D/g, '')}${c.pessoa ? ' — ' + primeiro(c.pessoa) : ''}`, ...linhasValores(c, r), `Total: ${totalTxt(c)}`);
    });
    const soma = cs.reduce((a, c) => a + c.total, 0);
    L.push('', `Total geral (${cs.length} apartamento${cs.length > 1 ? 's' : ''}): ${cs.some(faltaEnergia) ? 'R$ [' + brl(soma).replace('R$ ', '') + ' + energia]' : brl(soma)}`);
    if (pagamento) L.push('', 'Pagamento (Pix):', pagamento);
    if (r.dinheiro) L.push('', semEmoji(r.dinheiro));
    L.push('', semEmoji(r.assinatura.replace('identificando o apartamento', 'identificando os apartamentos')));
    return L.join('\n');
  }
  async function cobrancas(params) {
    const { h, api, mostrar, reais, dataBR, avisar, carregando, hojeISO } = K();
    carregando();
    const ref = params.get('mes') || refHoje(), comp = compMais(ref, 1);
    const ver = params.get('ver') || 'falta';
    const r = await api('future.cobrancas', { mes: comp });
    const doMes = r.lista.filter(c => c.competencia === comp), antigas = r.lista.filter(c => c.competencia !== comp);
    const recarregar = () => K().rota();
    const total = doMes.reduce((a, c) => a + c.total, 0), recebido = doMes.reduce((a, c) => a + c.valor_pago, 0);
    const faltam = doMes.filter(c => !c.pago_em), pagas = doMes.filter(c => c.pago_em), cobradas = faltam.filter(c => c.enviado_em && !c.pagador);
    const semEnergia = faltam.filter(faltaEnergia).length, naoEnviadas = faltam.filter(c => !c.enviado_em && !c.pagador).length;
    const pagar = c => {
      const f = h('form', { class: 'fut-pagar', novalidate: true },
        h('input', { name: 'valor', value: String((c.total - c.valor_pago).toFixed(2)).replace('.', ','), inputmode: 'decimal', 'aria-label': 'Valor recebido' }),
        h('input', { type: 'date', name: 'data', value: hojeISO(), 'aria-label': 'Data' }),
        h('select', { name: 'forma', 'aria-label': 'Forma' }, ['Pix', 'Dinheiro', 'Transferência', 'Boleto'].map(x => h('option', {}, x))),
        h('button', { type: 'submit', class: 'btn mini' }, 'Confirmar pagamento'), h('span', { class: 'erro' }));
      K().aoEnviar(f, async fd => { await api('future.cobranca.pagar', { id: c.id, ...Object.fromEntries(fd.entries()) }); avisar(`${c.unidade}: pagamento registrado e lançado no caixa.`); recarregar(); });
      return f;
    };
    const ajustar = c => {
      const f = h('form', { class: 'fut-pagar', novalidate: true },
        h('input', { name: 'aluguel', value: String(c.aluguel).replace('.', ','), placeholder: 'Aluguel R$', inputmode: 'decimal', 'aria-label': 'Aluguel', title: 'Aluguel cobrado neste mês' }),
        h('input', { name: 'energia', value: c.energia ? String(c.energia).replace('.', ',') : '', placeholder: 'Energia R$', inputmode: 'decimal', 'aria-label': 'Energia' }),
        h('input', { name: 'outros', value: c.outros ? String(c.outros).replace('.', ',') : '', placeholder: 'Outros R$', inputmode: 'decimal', 'aria-label': 'Outros' }),
        h('input', { name: 'obs', value: c.obs || '', placeholder: 'O que é "outros"', 'aria-label': 'Observação' }),
        h('button', { type: 'submit', class: 'btn mini' }, 'Salvar valores'), h('span', { class: 'erro' }));
      K().aoEnviar(f, async fd => { await api('future.cobranca.pagar', { id: c.id, ajustar: true, ...Object.fromEntries(fd.entries()) }); avisar('Cobrança ajustada.'); recarregar(); });
      return f;
    };
    const telefone = c => {
      const f = h('form', { class: 'fut-pagar', novalidate: true },
        h('input', { name: 'telefone', type: 'tel', placeholder: '(48) 9…', 'aria-label': 'Telefone de ' + c.unidade }),
        h('button', { type: 'submit', class: 'btn mini sec' }, 'Salvar telefone'), h('span', { class: 'erro' }));
      K().aoEnviar(f, async fd => { await api('future.unidade.salvar', { id: c.unidade, telefone: fd.get('telefone') }); avisar(`${c.unidade}: telefone salvo.`); recarregar(); });
      return f;
    };
    const cartao = c => {
      const area = h('div', { class: 'fut-cob-acao' });
      let escolhida = c.conta || r.conta_padrao;
      const link = c.telefone ? whats(c.telefone, textoCobranca(c, r)) : null;
      // etapas: 1) mandar a cobrança  2) cobrado (mandou)  3) pagou
      const etapa = c.pago_em ? 3 : c.enviado_em ? 2 : 1;
      const passos = h('ol', { class: 'fut-passos', 'aria-label': 'Etapas da cobrança' },
        [['Mandar', 1], ['Cobrado', 2], ['Pago', 3]].map(([t, n]) => h('li', { class: etapa > n || (n === 3 && etapa === 3) ? 'feito' : etapa === n ? 'agora' : '' }, h('b', {}, etapa > n || (n === 3 && etapa === 3) ? '✓' : String(n)), t)));
      const status = c.pago_em ? h('span', { class: 'fut-st pago' }, '✓ Pago ' + dataBR(c.pago_em) + (c.valor_pago < c.total - 0.01 ? ' · ' + reais(c.valor_pago) + ' de ' + reais(c.total) : ''))
        : c.situacao === 'atrasada' ? h('span', { class: 'fut-st atraso' }, '! Atrasado · venceu ' + dataBR(c.vencimento) + (c.enviado_em ? ' · cobrado ' + dataBR(c.enviado_em.slice(0, 10)) : ''))
        : c.enviado_em ? h('span', { class: 'fut-st enviado' }, '✉ Cobrado em ' + dataBR(c.enviado_em.slice(0, 10)) + (c.enviado_por ? ' por ' + c.enviado_por.split(' ')[0] : '') + ' · vence ' + dataBR(c.vencimento))
        : c.pagador ? h('span', { class: 'fut-st' }, 'Cobrança da empresa (' + c.pagador + ')')
        : h('span', { class: 'fut-st falta' }, '○ Falta mandar · vence ' + dataBR(c.vencimento));
      const marcar = como => api('future.cobranca.enviada', { id: c.id, como }).then(() => { avisar(`${c.unidade}: marcado como cobrado.`); setTimeout(recarregar, 300); }).catch(e => avisar(e.message, true));
      const botoes = h('div', { class: 'fut-acoes' });
      if (!c.pago_em) {
        if (!c.pagador) {
          if (link) botoes.append(h('a', { class: 'btn wa fut-zap', href: link, target: '_blank', rel: 'noopener noreferrer', onclick: ev => {
            if (faltaEnergia(c) && !confirm(`${c.unidade}: a energia de ${refMes(c)} ainda não foi informada. A mensagem vai com "[preencher]". Mandar mesmo assim?`)) { ev.preventDefault(); return; }
            api('future.cobranca.enviada', { id: c.id, como: 'WhatsApp' }).then(() => setTimeout(recarregar, 400)).catch(() => {}); } }, c.enviado_em ? 'Mandar de novo' : 'Cobrar no WhatsApp'));
          botoes.append(K().botao('Copiar texto', async () => { try { await navigator.clipboard.writeText(textoCobranca(c, r, escolhida)); avisar('Mensagem copiada. Depois de mandar, aperte "✓ Já mandei".'); } catch (e) { prompt('Copie a mensagem:', textoCobranca(c, r, escolhida)); } }, 'mini sec'));
          const ct = contaDe(c, r, escolhida);
          if (ct && ct.pix) botoes.append(K().botao('Copiar chave Pix', async () => { const k = (contaDe(c, r, escolhida) || {}).pix; try { await navigator.clipboard.writeText(k); avisar('Chave Pix copiada: ' + k); } catch (e) { prompt('Chave Pix:', k); } }, 'mini sec'));
          if (!c.enviado_em) botoes.append(K().botao('✓ Já mandei', () => marcar('copiado'), 'mini sec'));
          else botoes.append(K().botao('Desfazer "cobrado"', async () => { await api('future.cobranca.enviada', { id: c.id, desfazer: true }); recarregar(); }, 'mini link'));
        }
        botoes.append(K().botao('✓ Pagou', () => area.replaceChildren(pagar(c)), 'mini'), K().botao('Ajustar valores', () => area.replaceChildren(ajustar(c)), 'mini sec'));
      } else botoes.append(K().botao('Desfazer pagamento', async () => { if (!confirm('Desfazer o pagamento de ' + c.unidade + '?\n\nSe o valor veio do caixa (pagamento atrasado de outro mês que o painel juntou aqui), ele passa para o mês anterior.')) return; await api('future.cobranca.pagar', { id: c.id, desfazer: true }); recarregar(); }, 'mini sec'));
      const cartaoEl = h('article', { class: 'fut-cob-card ' + (c.pago_em ? 'pago' : c.situacao === 'atrasada' ? 'atraso' : c.enviado_em ? 'enviado' : 'falta') },
        h('div', { class: 'fut-cob-tit' }, h('a', { href: '#/future/unidade/' + encodeURIComponent(c.unidade) }, h('b', {}, c.unidade)),
          h('span', {}, c.pessoa || '—'), c.competencia !== comp ? h('span', { class: 'tag urgente' }, 'ref. ' + curto(compMais(c.competencia, -1))) : null,
          /^temp\|/.test(c.detalhe || '') ? h('span', { class: 'tag' }, 'temporada') : null),
        c.pagador ? null : passos,
        h('div', { class: 'fut-cob-val' },
          h('span', {}, /^prop\|/.test(c.detalhe || '') ? 'Aluguel proporcional (' + c.detalhe.split('|')[3] + ' dias) ' : 'Aluguel ', h('b', {}, reais(c.aluguel))), h('span', {}, 'Taxas ', h('b', {}, reais(c.taxas))),
          c.cobra_energia ? h('span', { class: c.energia ? '' : 'falta' }, 'Energia ', h('b', {}, c.energia ? reais(c.energia) : 'não informada')) : h('span', { class: 'peq' }, 'Energia por conta própria'),
          c.lavanderia ? h('span', {}, (c.servicos || []).some(x => x.tipo === 'faxina') ? 'Lavanderia/faxina ' : 'Lavanderia ', h('b', {}, reais(c.lavanderia))) : null,
          c.outros ? h('span', {}, 'Outros ', h('b', {}, reais(c.outros))) : null,
          h('span', { class: 'fut-cob-total' }, 'Total ', h('b', {}, reais(c.total)))),
        h('div', { class: 'fut-cob-pe' }, status, botoes),
        !c.pago_em && !c.pagador && (r.contas || []).length > 1 ? (() => {
          const sel = h('select', { 'aria-label': 'Conta para receber' }, r.contas.map(x => h('option', { value: x.id, selected: x.id === escolhida }, (x.apelido || x.titular || 'Conta') + (x.pix ? ' · Pix ' + x.pix : ''))));
          sel.addEventListener('change', () => { escolhida = sel.value; const z = cartaoEl.querySelector('.fut-zap'); if (z && c.telefone) z.href = whats(c.telefone, textoCobranca(c, r, escolhida)); avisar('A mensagem vai com esta conta.'); });
          const fixar = K().botao('usar sempre neste apto', async () => { await api('future.unidade.salvar', { id: c.unidade, conta_receb: sel.value }); avisar(c.unidade + ': conta guardada.'); recarregar(); }, 'mini link');
          return h('div', { class: 'fut-cob-tel' }, h('span', { class: 'peq' }, 'Receber em: '), sel, fixar);
        })() : null,
        !c.pago_em && !c.pagador && !c.telefone ? h('div', { class: 'fut-cob-tel' }, h('span', { class: 'peq' }, 'Sem telefone: '), telefone(c)) : null,
        area);
      return cartaoEl;
    };
    // empresa que paga vários apartamentos (ex.: Hercílio Luz): uma cobrança só
    const grupos = {}; doMes.forEach(c => { if (c.pagador) (grupos[c.pagador] = grupos[c.pagador] || []).push(c); });
    const blocosGrupo = Object.entries(grupos).map(([pag, cs]) => {
      const abertas = cs.filter(c => !c.pago_em), soma = cs.reduce((a, c) => a + c.total, 0), falta = abertas.reduce((a, c) => a + c.total, 0);
      return h('section', { class: 'caixa fut-grupo' },
        h('div', {}, h('span', { class: 'carteira-kicker' }, 'Cobrança única da empresa'), h('h2', {}, pag),
          h('p', { class: 'peq' }, `${cs.length} apartamento(s): ${cs.map(c => c.unidade.replace('AP ', '')).join(', ')} · total ${reais(soma)}` + (abertas.length ? ` · falta ${reais(falta)}` : ' · tudo pago ✓'))),
        abertas.length ? h('div', { class: 'fut-acoes' },
          (() => { const tel = (r.pagadores[pag] || {}).telefone, msg = textoGrupo(pag, abertas, r), link = tel ? whats(tel, msg) : null;
            const marcar = () => Promise.all(abertas.map(c => api('future.cobranca.enviada', { id: c.id }))).then(() => setTimeout(recarregar, 400)).catch(() => {});
            return [link ? h('a', { class: 'btn wa', href: link, target: '_blank', rel: 'noopener noreferrer', onclick: ev => {
                if (abertas.some(faltaEnergia) && !confirm('Falta a energia de algum apartamento. Mandar mesmo assim?')) { ev.preventDefault(); return; } marcar(); } }, abertas.some(c => c.enviado_em) ? 'Mandar de novo' : 'Cobrar a empresa no WhatsApp') : null,
              K().botao('Copiar demonstrativo', async () => { try { await navigator.clipboard.writeText(msg); avisar('Demonstrativo copiado.'); } catch (e) { prompt('Copie:', msg); } marcar(); }, 'sec'),
              !tel ? h('span', { class: 'peq' }, 'Telefone da empresa: Configurações › Empresas que pagam') : null]; })(),
          K().botao(`✓ Recebi da ${pag.split(' (')[0]} (${reais(falta)})`, async () => {
            if (!confirm(`Registrar o pagamento das ${abertas.length} cobranças de ${pag} em ${nomeMes(comp)}?`)) return;
            const x = await api('future.cobranca.pagarGrupo', { pagador: pag, mes: comp }); avisar(`${x.pagas} cobrança(s) de ${pag} pagas.`); recarregar();
          })) : null);
    });
    // 8.7.0: lembrete do aluguel no WhatsApp — dia 5 ("vence dia 10") e dia 10 em diante ("vence hoje" / "venceu")
    const diaHoje = +hojeISO().slice(8, 10), compHoje = hojeISO().slice(0, 7);
    const qual = diaHoje >= 10 ? '10' : diaHoje >= 5 ? '5' : '';
    const paraLembrar = qual && comp === compHoje ? faltam.filter(c => c.telefone && !c.pagador && !(qual === '10' ? c.lembrete10_em : c.lembrete5_em)) : [];
    const textoLembrete = c => {
      const nome = primeiro(c.pessoa), ap = c.unidade.replace(/^AP\s*/i, 'apartamento ').replace(/^SALA/i, 'sala'), refm = nomeMes(compMais(c.competencia, -1)).replace(/ de \d{4}$/, '');
      const venc = dataBR(c.vencimento), hojeV = c.vencimento === hojeISO();
      return qual === '5'
        ? `Oi, ${nome}! Tudo bem? Passando para lembrar que o aluguel do ${ap}, referente a ${refm}, vence dia ${venc}, no valor de ${reais(c.total - c.valor_pago)}. Assim que pagar, pode mandar o comprovante por aqui. Se preferir, também aceitamos em dinheiro. Obrigada!`
        : `Oi, ${nome}! Lembrete: o aluguel do ${ap}, referente a ${refm}, ${hojeV ? 'vence hoje' : 'venceu em ' + venc}, no valor de ${reais(c.total - c.valor_pago)}. Se já pagou, por favor mande o comprovante por aqui. Obrigada!`;
    };
    const blocoLembretes = paraLembrar.length ? h('section', { class: 'caixa fut-lembretes' },
      h('h2', {}, qual === '5' ? `🔔 Lembrete do dia 5 — ${paraLembrar.length} para lembrar` : `🔔 Vence dia 10 — ${paraLembrar.length} ainda não pagaram`),
      h('p', { class: 'peq' }, qual === '5' ? 'Lembre com antecedência quem ainda não pagou. O botão abre o WhatsApp com a mensagem pronta e marca como lembrado.' : 'Mensagem curta de "vence hoje / venceu", pedindo o comprovante.'),
      h('ul', { class: 'fut-lemb-lista' }, paraLembrar.map(c => h('li', {}, h('span', {}, h('b', {}, c.unidade), ' · ' + c.pessoa + ' · ' + reais(c.total - c.valor_pago)),
        h('a', { class: 'btn mini wa', href: whats(c.telefone, textoLembrete(c)), target: '_blank', rel: 'noopener noreferrer',
          onclick: () => { api('future.cobranca.lembrete', { id: c.id, qual }).then(() => setTimeout(recarregar, 400)).catch(e => avisar(e.message, true)); } }, 'Lembrar no WhatsApp'))))) : null;
    const listaVer = ver === 'pagas' ? pagas : ver === 'todas' ? doMes : ver === 'mandar' ? faltam.filter(c => !c.enviado_em && !c.pagador) : ver === 'cobradas' ? cobradas : faltam.filter(c => !c.pagador);
    const aba = (id, rot, n) => h('button', { type: 'button', class: 'visao-bt' + (ver === id ? ' ativo' : ''), onclick: () => ir('cobrancas', { ver: id }, params) }, h('span', {}, rot), h('span', { class: 'visao-n' }, String(n)));
    mostrar(topo('Edifício Future', 'Cobranças', `Aluguel, taxas, energia e lavanderia de ${MESES[+ref.slice(5, 7) - 1]} · vencem em ${dataBR((doMes[0] || {}).vencimento || comp + '-10')}`,
        [h('a', { class: 'btn sec', href: '#/future/energia?mes=' + ref }, '⚡ Energia'), h('a', { class: 'btn sec', href: '#/future/lavanderia?mes=' + ref }, '🧺 Lavanderia'), h('a', { class: 'btn sec', href: '#/future/config' }, 'Dados da mensagem')]),
      navRef(ref, 'cobrancas', params),
      h('section', { class: 'fin-nums' },
        numero('dourado', reais(total), 'Cobrado no mês', `${doMes.length} cobrança(s)`),
        numero('verde', reais(recebido), 'Já pagaram', `${pagas.length} de ${doMes.length}`),
        numero(total - recebido > 0 ? 'vermelho' : 'verde', reais(total - recebido), 'Falta pagar', `${faltam.length} unidade(s)`),
        numero(naoEnviadas ? 'azul alerta' : 'azul', String(naoEnviadas), 'Falta mandar', `${cobradas.length} já cobrada(s), esperando pagamento`)),
      semEnergia ? h('p', { class: 'nota' }, `⚡ ${semEnergia} cobrança(s) ainda sem a energia de ${nomeMes(ref)}. Informe em Energia (ou cole a tabela da Celesc) antes de mandar — o total se atualiza sozinho.`) : null,
      !r.pagamento ? h('p', { class: 'nota' }, 'Cadastre os dados de pagamento (banco, Pix, agência e conta) em Configurações para irem junto na mensagem.') : null,
      blocoLembretes,
      ...blocosGrupo,
      h('div', { class: 'visoes fut-filtro' }, aba('falta', 'Falta pagar', faltam.filter(c => !c.pagador).length), aba('mandar', '1 · Falta mandar', naoEnviadas), aba('cobradas', '2 · Cobradas', cobradas.length), aba('pagas', '3 · Pagas', pagas.length), aba('todas', 'Todas', doMes.length)),
      h('section', { class: 'fut-cob-lista' }, listaVer.length ? listaVer.map(cartao) : h('p', { class: 'caixa peq' }, ver === 'falta' ? 'Todo mundo pagou este mês. 🎉' : 'Nada aqui.')),
      antigas.length ? h('section', {}, h('h2', { class: 'fut-sub' }, 'Ainda em aberto de meses anteriores'), h('div', { class: 'fut-cob-lista' }, antigas.map(cartao))) : null);
  }

  /* ---------- Caixa ---------- */
  async function caixa(params) {
    const { h, api, mostrar, reais, dataBR, avisar, carregando, hojeISO } = K();
    carregando();
    const ref = params.get('mes') || refHoje();
    const r = await api('future.lancamentos', { mes: ref });
    const rec = r.lista.filter(l => l.tipo === 'receita'), des = r.lista.filter(l => l.tipo === 'despesa');
    const soma = ls => ls.reduce((a, l) => a + l.valor, 0);
    const dataPadrao = ref === compHoje() ? hojeISO() : ref + '-' + new Date(Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7), 0)).getUTCDate();
    // planilha: várias despesas de uma vez
    const linhaNova = () => h('tr', {},
      h('td', {}, h('input', { type: 'date', name: 'data', value: dataPadrao, 'aria-label': 'Data' })),
      h('td', {}, h('select', { name: 'categoria', 'aria-label': 'Categoria' }, h('option', { value: '' }, 'automática'), r.categorias.despesa.map(c => h('option', {}, c)))),
      h('td', {}, h('input', { name: 'descricao', placeholder: 'ex.: conserto do chuveiro AP 204', 'aria-label': 'Descrição' })),
      h('td', {}, h('input', { name: 'unidade', placeholder: 'AP/sala', class: 'curto', 'aria-label': 'Unidade' })),
      h('td', {}, h('input', { name: 'valor', placeholder: 'R$', inputmode: 'decimal', class: 'curto', 'aria-label': 'Valor' })),
      h('td', {}, h('select', { name: 'forma', 'aria-label': 'Forma' }, ['Pix', 'Dinheiro', 'Transferência', 'Boleto', 'Cartão'].map(x => h('option', {}, x)))));
    const corpo = h('tbody', {}, [1, 2, 3, 4, 5].map(linhaNova));
    const enviar = h('div', { class: 'acoes' },
      K().botao('+ linha', () => corpo.append(linhaNova()), 'sec'),
      K().botao('Salvar as linhas preenchidas', async ev => {
        const itens = [...corpo.querySelectorAll('tr')].map(tr => Object.assign({ tipo: 'despesa' }, Object.fromEntries([...tr.querySelectorAll('input,select')].map(x => [x.name, x.value])))).filter(x => num(x.valor) > 0);
        if (!itens.length) return avisar('Preencha o valor de pelo menos uma linha.', true);
        ev.target.disabled = true;
        try { const x = await api('future.lancamento.lote', { competencia: ref, itens }); avisar(`${x.lancados} lançamento(s) salvos em ${nomeMes(ref)}.`); K().rota(); }
        catch (e) { avisar(e.message, true); ev.target.disabled = false; }
      }));
    const colar = h('textarea', { rows: 4, placeholder: 'Ou cole uma lista, uma despesa por linha:\nConserto chuveiro AP 204 120,00\nProduto de limpeza 85,90\n12/10 Encanador 250,00' });
    const btColar = K().botao('Passar a lista para a planilha', () => {
      const linhas = colar.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if (!linhas.length) return;
      corpo.replaceChildren(); linhas.forEach(t => {
        const tr = linhaNova(); corpo.append(tr);
        const md = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t); let resto = t;
        if (md) { tr.querySelector('[name=data]').value = (md[3] ? (md[3].length === 2 ? '20' + md[3] : md[3]) : ref.slice(0, 4)) + '-' + md[2].padStart(2, '0') + '-' + md[1].padStart(2, '0'); resto = resto.replace(md[0], ' '); }
        const vs = resto.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}\b/g); if (vs) { tr.querySelector('[name=valor]').value = vs[vs.length - 1]; resto = resto.replace(vs[vs.length - 1], ' '); }
        const ap = /\b(?:ap\.?\s*)?([12]\d{2})\b|\bsala\s*\d\b/i.exec(resto); if (ap) tr.querySelector('[name=unidade]').value = ap[1] || ap[0];
        tr.querySelector('[name=descricao]').value = resto.replace(/\s+/g, ' ').replace(/[-–·]\s*$/, '').trim();
      });
      avisar(`${linhas.length} linha(s) na planilha. Confira e aperte "Salvar as linhas preenchidas".`);
    }, 'sec');
    const lista = (titulo, ls, cls) => h('section', { class: 'caixa' }, h('h2', {}, `${titulo} · ${reais(soma(ls))}`),
      K().tabela(['Data', 'Categoria', 'Unidade', 'Descrição', 'Valor', ''], ls, l => [
        h('td', { 'data-r': 'Data' }, dataBR(l.data)), h('td', { 'data-r': 'Categoria' }, l.categoria),
        h('td', { 'data-r': 'Unidade' }, l.unidade || '—'), h('td', { 'data-r': 'Descrição' }, [l.descricao, l.pessoa].filter(Boolean).join(' · ') || '—', l.origem === 'planilha antiga' ? h('span', { class: 'peq' }, ' (planilha antiga)') : l.origem === 'cobrança' ? h('span', { class: 'peq' }, ' (cobrança paga)') : null),
        h('td', { class: 'num ' + cls, 'data-r': 'Valor' }, reais(l.valor)),
        h('td', {}, l.origem === 'cobrança' ? null : K().botao('Excluir', async ev => { ev.stopPropagation(); if (!confirm('Excluir este lançamento?')) return; await api('future.lancamento.salvar', { id: l.id, excluir: true }); K().rota(); }, 'mini sec'))
      ], () => {}, 'Nada lançado.'));
    const porCat = {}; des.forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
    const btPasta = K().botao('📁 Ler a pasta "PARA IMPORTAR" do Drive', async ev => { ev.target.disabled = true; try { const x = await api('future.importarPasta', {});
      avisar(x.arquivos ? `${x.arquivos} arquivo(s) lido(s): ${x.despesas} despesa(s), ${x.lavanderia} serviço(s) de lavanderia.` + (x.erros.length ? ' Problemas: ' + x.erros.slice(0, 3).join(' | ') : '') : 'Nenhum arquivo novo na pasta PARA IMPORTAR.', !!x.erros.length); K().rota(); }
      catch (e) { avisar(e.message, true); ev.target.disabled = false; } }, 'sec');
    const porCatOrd = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    mostrar(topo('Edifício Future', 'Despesas', 'O que o prédio gastou no mês de referência · as receitas entram pelas cobranças e aparecem no Relatório do mês', [btPasta]), navRef(ref, 'caixa', params),
      h('section', { class: 'fin-nums' }, numero('vermelho', reais(soma(des)), 'Despesas de ' + MESES[+ref.slice(5, 7) - 1], `${des.length} lançamento(s)`),
        porCatOrd.slice(0, 3).map(([c, v]) => numero('azul', reais(v), c, Math.round(v / (soma(des) || 1) * 100) + '% das despesas'))),
      h('section', { class: 'caixa' }, h('h2', {}, 'Lançar despesas de ' + nomeMes(ref)),
        h('div', { class: 'fut-planilha' }, h('table', { class: 'tabela fut-grade' }, h('thead', {}, h('tr', {}, ['Data', 'Categoria', 'Descrição', 'Unidade', 'Valor', 'Forma'].map(t => h('th', {}, t)))), corpo)),
        enviar, h('details', { class: 'fut-colar' }, h('summary', {}, '📋 Colar uma lista de despesas'), colar, btColar)),
      lista('Despesas', des, 'neg'),
      h('p', { class: 'peq' }, `Receitas de ${MESES[+ref.slice(5, 7) - 1]} (aluguéis pagos, lavanderia, caução): ${reais(soma(rec))} — veja tudo no `, h('a', { href: '#/future/relatorio?mes=' + ref }, 'Relatório do mês'), '.'));
  }

  /* ---------- Energia: a conta de cada apartamento (sem as salas, que pagam a própria) ---------- */
  async function energia(params) {
    const { h, api, mostrar, reais, avisar, carregando } = K();
    carregando();
    const ref = params.get('mes') || refHoje();
    const r = await api('future.energia', { mes: ref });
    const total = m => r.unidades.reduce((a, u) => a + ((r.valores[u.id] || {})[m] || 0), 0);
    const linhas = r.unidades.map(u => {
      const v = (r.valores[u.id] || {})[ref];
      const inp = h('input', { name: 'valor', value: v ? String(v.toFixed(2)).replace('.', ',') : '', placeholder: 'R$', inputmode: 'decimal', class: 'curto', 'aria-label': 'Energia ' + u.id });
      const salvar = async () => { if (inp.value === (v ? String(v.toFixed(2)).replace('.', ',') : '')) return;
        try { await api('future.energia.salvar', { competencia: ref, unidade: u.id, valor: inp.value || '0' }); inp.classList.add('salvo'); avisar(`${u.id}: energia de ${MESES[+ref.slice(5, 7) - 1]} salva.`); } catch (e) { avisar(e.message, true); } };
      inp.addEventListener('change', salvar);
      const ant = (r.valores[u.id] || {})[compMais(ref, -1)];
      return h('tr', {}, h('td', { 'data-r': 'Apto' }, h('strong', {}, u.id.replace('AP ', ''))), h('td', { 'data-r': 'Morador' }, u.locatario || h('span', { class: 'peq' }, (SIT[u.situacao] || [''])[0])),
        h('td', { 'data-r': 'Conta no nome de' }, u.titular || '—'), h('td', { 'data-r': 'Valor' }, inp),
        h('td', { class: 'num peq', 'data-r': 'Mês anterior' }, ant ? reais(ant) : '—'));
    });
    const colar = h('form', { class: 'campos', novalidate: true },
      h('div', { class: 'largo' }, h('label', { for: 'f-tabela' }, 'Cole a planilha ou os demonstrativos (um apartamento por linha com o valor, ou o texto "apartamento 101 … Energia: R$ 103,53")'),
        h('textarea', { id: 'f-tabela', name: 'texto', rows: 6, placeholder: '101  103,53\n102  173,13\nAP 104 137,96\n…' })),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Lançar as contas de ' + nomeMes(ref)), h('p', { class: 'erro' })));
    K().aoEnviar(colar, async fd => {
      const x = await api('future.energia.colar', { competencia: ref, texto: fd.get('texto') });
      avisar(`${x.lancadas.length} conta(s) lançada(s).` + (x.naoEntendidas.length ? ` ${x.naoEntendidas.length} linha(s) não entendida(s): ${x.naoEntendidas.slice(0, 3).join(' | ')}` : ''), !!x.naoEntendidas.length);
      K().rota();
    });
    // titular de cada conta (as contas estão no nome da família/empresa e a cobrança vai para o morador)
    const titulares = h('table', { class: 'tabela fut-grade' }, h('thead', {}, h('tr', {}, ['Apto', 'Conta no nome de', 'Kit', 'Medidor', 'Unidade consumidora'].map(t => h('th', {}, t)))),
      h('tbody', {}, r.unidades.map(u => {
        const campoT = (k, v, cls) => { const i = h('input', { value: v || '', class: cls || '', 'aria-label': k + ' ' + u.id });
          i.addEventListener('change', async () => { try { await api('future.unidade.salvar', { id: u.id, [k]: i.value }); i.classList.add('salvo'); } catch (e) { avisar(e.message, true); } }); return i; };
        return h('tr', {}, h('td', {}, h('strong', {}, u.id.replace('AP ', ''))), h('td', {}, campoT('energia_resp', u.titular)), h('td', {}, campoT('kit', u.kit, 'curto')),
          h('td', {}, campoT('medidor', u.medidor)), h('td', {}, campoT('uc', u.uc)));
      })));
    const grade = h('div', { class: 'fut-planilha' }, h('table', { class: 'tabela fut-grade fut-ene-grade' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Apto'), r.meses.map(m => h('th', { class: m === ref ? 'atual' : '' }, curto(m))))),
      h('tbody', {}, r.unidades.map(u => h('tr', {}, h('td', {}, h('strong', {}, u.id.replace('AP ', ''))), r.meses.map(m => { const v = (r.valores[u.id] || {})[m]; return h('td', { class: 'num' + (m === ref ? ' atual' : '') }, v ? reais(v).replace('R$', '').trim() : '—'); }))),
        h('tr', { class: 'fut-total' }, h('td', {}, 'Total'), r.meses.map(m => h('td', { class: 'num' }, total(m) ? reais(total(m)).replace('R$', '').trim() : '—'))))));
    const falta = r.unidades.filter(u => /alugado|renovar/.test(u.situacao) && !(r.valores[u.id] || {})[ref]).map(u => u.id.replace('AP ', ''));
    mostrar(topo('Edifício Future', 'Energia', 'As contas vêm no nome da família/empresa e são cobradas de cada morador no mês seguinte · salas pagam a própria energia'),
      navRef(ref, 'energia', params),
      h('section', { class: 'fin-nums' },
        numero('dourado', reais(total(ref)), 'Energia de ' + MESES[+ref.slice(5, 7) - 1], `${r.unidades.filter(u => (r.valores[u.id] || {})[ref]).length} conta(s) lançada(s)`),
        numero('azul', reais(total(compMais(ref, -1))), 'Mês anterior', total(compMais(ref, -1)) ? (total(ref) >= total(compMais(ref, -1)) ? '▲ ' : '▼ ') + Math.abs(Math.round(((total(ref) - total(compMais(ref, -1))) / total(compMais(ref, -1))) * 100)) + '%' : ''),
        numero(falta.length ? 'vermelho' : 'verde', String(falta.length), 'Falta lançar', falta.length ? 'aptos ' + falta.join(', ') : 'tudo lançado ✓')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Contas de ' + nomeMes(ref)), h('p', { class: 'peq' }, 'Digite o valor e saia do campo: salva sozinho e atualiza a cobrança do mês seguinte.'),
        h('table', { class: 'tabela' }, h('thead', {}, h('tr', {}, ['Apto', 'Morador', 'Conta no nome de', 'Valor', 'Mês anterior'].map(t => h('th', {}, t)))), h('tbody', {}, linhas))),
      K().secao('📋 Colar a planilha de energia do mês', colar, false),
      h('section', { class: 'caixa' }, h('h2', {}, 'Planilha dos últimos 12 meses'), grade),
      K().secao('🔌 De quem é cada conta (titular, kit, medidor, UC)', h('div', {}, h('p', { class: 'peq' }, 'Editar e sair do campo salva. Use para saber em nome de quem está cada conta da Celesc.'), h('div', { class: 'fut-planilha' }, titulares)), false));
  }

  /* ---------- Lavanderia: cada lavagem entra na cobrança da pessoa ---------- */
  async function lavanderia(params) {
    const { h, api, mostrar, reais, dataBR, avisar, carregando, hojeISO } = K();
    carregando();
    const ref = params.get('mes') || refHoje();
    const r = await api('future.lavanderia', { mes: ref });
    const total = r.lista.reduce((a, l) => a + l.valor, 0), qtd = r.lista.reduce((a, l) => a + l.quantidade, 0);
    const porUn = {}; r.lista.forEach(l => { const x = porUn[l.unidade] = porUn[l.unidade] || { qtd: 0, valor: 0, pessoa: l.pessoa }; x.qtd += l.quantidade; x.valor += l.valor; });
    const dataPadrao = ref === compHoje() ? hojeISO() : ref + '-' + new Date(Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7), 0)).getUTCDate();
    const f = h('form', { class: 'barra fut-lav-form', novalidate: true },
      h('select', { name: 'unidade', 'aria-label': 'Apartamento' }, h('option', { value: '' }, 'Apartamento…'), r.unidades.map(u => h('option', { value: u.id }, u.id + (u.locatario ? ' · ' + u.locatario.split(' ')[0] : '')))),
      h('input', { type: 'date', name: 'data', value: dataPadrao, 'aria-label': 'Data' }),
      h('input', { name: 'quantidade', type: 'number', min: 1, value: 1, class: 'curto', 'aria-label': 'Quantidade' }),
      h('div', { class: 'fut-chips' }, Object.entries(r.servicos).map(([k, nome], i) => h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'tipo', value: k, checked: !i }), h('span', {}, nome + ' · ' + reais(r.precos[k]))))),
      h('button', { type: 'submit', class: 'btn' }, '+ Lançar'), h('p', { class: 'erro' }));
    K().aoEnviar(f, async fd => {
      if (!fd.get('unidade')) throw new Error('Escolha o apartamento.');
      const q = Math.max(1, +fd.get('quantidade') || 1);
      await api('future.lavanderia.salvar', { mes: ref, unidade: fd.get('unidade'), data: fd.get('data'), quantidade: q, tipo: fd.get('tipo') });
      avisar(`${r.servicos[fd.get('tipo')]} lançado: entra na cobrança de ${nomeMes(compMais(ref, 1))}.`); K().rota();
    });
    const colar = h('form', { class: 'campos', novalidate: true },
      h('div', { class: 'largo' }, h('label', { for: 'f-lav' }, 'Cole a tabela da lavanderia (uma linha por uso: apartamento, quantidade e/ou valor, data opcional)'),
        h('textarea', { id: 'f-lav', name: 'texto', rows: 5, placeholder: '101 2 lavagens\n204 - 1 - 30,00\n12/10 AP 106 25,00' })),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Lançar a tabela em ' + nomeMes(ref)), h('p', { class: 'erro' })));
    K().aoEnviar(colar, async fd => { const x = await api('future.lavanderia.colar', { mes: ref, texto: fd.get('texto') });
      avisar(`${x.lancadas.length} lançamento(s).` + (x.naoEntendidas.length ? ` Não entendi: ${x.naoEntendidas.slice(0, 3).join(' | ')}` : ''), !!x.naoEntendidas.length); K().rota(); });
    const preco = h('form', { class: 'barra', novalidate: true }, h('span', { class: 'peq' }, 'Preços — lavar:'),
      h('input', { name: 'preco', value: String(r.precos.lavar).replace('.', ','), class: 'curto', inputmode: 'decimal', 'aria-label': 'Preço lavar' }),
      h('span', { class: 'peq' }, 'secar:'), h('input', { name: 'preco_secar', value: String(r.precos.secar).replace('.', ','), class: 'curto', inputmode: 'decimal', 'aria-label': 'Preço secar' }),
      h('span', { class: 'peq' }, 'faxina:'), h('input', { name: 'preco_faxina', value: String(r.precos.faxina).replace('.', ','), class: 'curto', inputmode: 'decimal', 'aria-label': 'Preço faxina' }),
      h('button', { type: 'submit', class: 'btn mini sec' }, 'Salvar preços'), h('span', { class: 'erro' }));
    K().aoEnviar(preco, async fd => { await api('future.lavanderia.salvar', { so_preco: true, preco: fd.get('preco'), preco_secar: fd.get('preco_secar'), preco_faxina: fd.get('preco_faxina') }); avisar('Preços salvos.'); K().rota(); });
    mostrar(topo('Edifício Future', 'Lavanderia e faxina', 'Lavar, secar e faxina do apartamento: cada serviço vai sozinho para a cobrança do morador no mês seguinte'), navRef(ref, 'lavanderia', params),
      h('section', { class: 'fin-nums' }, numero('dourado', reais(total), 'Serviços de ' + MESES[+ref.slice(5, 7) - 1], `${r.lista.length} lançamento(s)`),
        numero('azul', String(Object.keys(porUn).length), 'Apartamentos', 'que usaram'), numero('verde', reais(r.precos.lavar), 'Lavar / secar', `${reais(r.precos.secar)} secar · faxina ${reais(r.precos.faxina)}`)),
      h('section', { class: 'caixa' }, h('h2', {}, 'Lançar'), f, preco),
      K().secao('📋 Colar a tabela da lavanderia', colar, false),
      h('section', { class: 'caixa' }, h('h2', {}, 'Por apartamento'), Object.keys(porUn).length ? h('ul', { class: 'fut-lista' }, Object.entries(porUn).sort().map(([un, x]) =>
        h('li', {}, h('b', {}, un), ' · ', x.pessoa || '—', ' · ', `${x.qtd}×`, h('strong', {}, reais(x.valor)), r.cobrancas[un] ? h('span', { class: 'tag ' + (COB[r.cobrancas[un]] || ['', ''])[1] }, 'cobrança ' + (COB[r.cobrancas[un]] || [r.cobrancas[un]])[0].toLowerCase()) : h('span', { class: 'peq' }, 'entra na cobrança quando ela for gerada')))) : h('p', { class: 'peq' }, 'Nenhuma lavagem neste mês.')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Lançamentos de ' + nomeMes(ref)), K().tabela(['Data', 'Apto', 'Pessoa', 'Serviço', 'Qtd.', 'Valor', ''], r.lista, l => [
        h('td', {}, dataBR(l.data)), h('td', {}, l.unidade), h('td', {}, l.pessoa || '—'),
        h('td', {}, (() => { const sel = h('select', { 'aria-label': 'Serviço', onclick: ev => ev.stopPropagation() }, Object.entries(r.servicos).map(([k, n]) => h('option', { value: k, selected: k === l.tipo }, n)));
          sel.addEventListener('change', async () => { try { await api('future.lavanderia.salvar', { id: l.id, mudar: true, tipo: sel.value, quantidade: l.quantidade }); avisar('Serviço trocado e valor recalculado.'); K().rota(); } catch (e) { avisar(e.message, true); } }); return sel; })()),
        h('td', { class: 'num' }, String(l.quantidade)), h('td', { class: 'num' }, reais(l.valor)),
        h('td', {}, K().botao('Excluir', async ev => { ev.stopPropagation(); if (!confirm('Excluir esta lavagem?')) return; await api('future.lavanderia.salvar', { id: l.id, excluir: true }); K().rota(); }, 'mini sec'))
      ], () => {}, 'Nada lançado.')),
      r.antigas ? h('p', { class: 'peq' }, `${r.antigas} recebimento(s) de lavanderia deste mês vieram da planilha antiga (estão em Despesas e receitas).`) : null);
  }

  /* ---------- Relatório do mês (para imprimir / mandar) ---------- */
  async function relatorio(params) {
    const { h, api, mostrar, reais, dataBR, carregando, tabela } = K();
    carregando();
    const comp = params.get('mes') || refHoje();
    const r = await api('future.relatorio', { mes: comp });
    const desp = r.lancamentos.filter(l => l.tipo === 'despesa'), aReceber = r.cobrancas.reduce((a, c) => a + Math.max(0, c.total - c.pago), 0);
    const somaC = k => r.cobrancas.reduce((a, c) => a + (c[k] || 0), 0);
    const varia = (a, b) => b ? h('span', { class: 'fut-var ' + (a >= b ? 'sobe' : 'desce') }, (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round(((a - b) / b) * 100)) + '% vs. ' + curto(r.anterior)) : null;
    const barras = (itens, total, cls) => h('ul', { class: 'fut-barras' }, itens.map(i => h('li', {}, h('span', {}, i.categoria || i.unidade), h('i', { class: cls, 'data-w': total ? Math.max(2, Math.round((i.valor / total) * 100)) : 0 }), h('b', {}, reais(i.valor)))));
    const pagas = r.cobrancas.filter(c => c.situacao === 'paga').length;
    mostrar(
      h('div', { class: 'barra nao-imprimir' }, navRef(comp, 'relatorio', params), K().botao('Imprimir / salvar PDF', () => window.print())),
      h('article', { class: 'fut-rel' },
        h('header', { class: 'fut-rel-cab' }, h('div', {}, h('span', { class: 'carteira-kicker' }, 'Edifício Future · relatório mensal'), h('h1', {}, nomeMes(comp).replace(/^./, x => x.toUpperCase()))),
          h('p', { class: 'peq' }, 'Cobranças com vencimento em ' + dataBR(r.vencimentoCobranca) + ' · gerado em ' + dataBR(K().hojeISO()))),
        h('section', { class: 'fin-nums' },
          numero('verde', reais(r.receitas), 'Receitas', '', null), numero('vermelho', reais(r.despesas), 'Despesas'),
          numero(r.receitas - r.despesas >= 0 ? 'dourado' : 'vermelho', reais(r.receitas - r.despesas), 'Resultado'),
          numero('azul', `${r.ocupacao.ocupadas}/${r.ocupacao.alugaveis}`, 'Ocupação', r.ocupacao.disponiveis.length ? 'livres: ' + r.ocupacao.disponiveis.join(', ') : 'todas ocupadas')),
        h('section', { class: 'fin-nums' },
          numero('dourado', reais(somaC('total')), 'Cobrado do mês', `aluguel ${reais(somaC('aluguel'))} · taxas ${reais(somaC('taxas'))} · energia ${reais(somaC('energia'))} · lavanderia ${reais(somaC('lavanderia'))}`),
          numero('verde', reais(somaC('pago')), 'Já recebido', `${pagas} de ${r.cobrancas.length} cobranças`),
          numero(aReceber ? 'vermelho' : 'verde', reais(aReceber), 'Falta receber', aReceber ? 'cobranças em aberto' : 'tudo recebido ✓'),
          numero('azul', reais(r.lavagens.reduce((a, l) => a + l.valor, 0)), 'Lavanderia', `${r.lavagens.reduce((a, l) => a + l.quantidade, 0)} lavagem(ns)`)),
        h('p', { class: 'fut-comp' }, 'Receitas ', varia(r.receitas, r.receitasAnt), ' · Despesas ', varia(r.despesas, r.despesasAnt), ' · Energia ', varia(r.energiaTotal, r.energiaAnt)),
        h('div', { class: 'fut-duas' },
          h('section', { class: 'caixa' }, h('h2', {}, 'De onde veio o dinheiro'), r.receitasCat.length ? barras(r.receitasCat, r.receitas, 'b-rec') : h('p', { class: 'peq' }, 'Sem receitas lançadas.')),
          h('section', { class: 'caixa' }, h('h2', {}, 'Para onde foi'), r.despesasCat.length ? barras(r.despesasCat, r.despesas, 'b-des') : h('p', { class: 'peq' }, 'Sem despesas lançadas.'))),
        h('div', { class: 'fut-duas' },
          h('section', { class: 'caixa' }, h('h2', {}, `Cobranças referentes a ${MESES[+comp.slice(5, 7) - 1]} · ${pagas} de ${r.cobrancas.length} pagas`),
            tabela(['Unidade', 'Locatário', 'Cobrado', 'Recebido', 'Situação'], r.cobrancas, c => [
              h('td', {}, c.unidade, c.temporada ? h('span', { class: 'peq' }, ' (temporada)') : null), h('td', {}, c.pessoa || '—'), h('td', { class: 'num' }, reais(c.total)), h('td', { class: 'num' }, reais(c.pago)),
              h('td', {}, h('span', { class: 'tag ' + COB[c.situacao][1] }, COB[c.situacao][0]))], () => {}, 'Sem cobranças neste mês.')),
          h('section', { class: 'caixa' }, h('h2', {}, `Energia por unidade · ${reais(r.energiaTotal)}`),
            r.energia.length ? barras(r.energia, Math.max(1, ...r.energia.map(e => e.valor)), 'b-ene') : h('p', { class: 'peq' }, 'Contas de energia não lançadas para este mês.'),
            h('p', { class: 'peq' }, `Pago à Celesc (despesa do caixa): ${reais(r.energiaDespesa)}`))),
        h('section', { class: 'caixa' }, h('h2', {}, `Despesas do mês (${desp.length}) · ${reais(r.despesas)}`),
          tabela(['Data', 'Categoria', 'Unidade', 'Descrição', 'Valor'], desp, l => [h('td', {}, dataBR(l.data)), h('td', {}, l.categoria), h('td', {}, l.unidade || '—'),
            h('td', {}, [l.descricao, l.pessoa].filter(Boolean).join(' · ') || '—'), h('td', { class: 'num neg' }, reais(l.valor))], () => {}, 'Nenhuma despesa lançada. Lance em "Despesas e receitas".')),
        (r.entraram.length || r.sairam.length) ? h('section', { class: 'caixa' }, h('h2', {}, 'Movimento de locatários'),
          h('ul', { class: 'fut-lista fut-mov' }, r.entraram.map(p => h('li', {}, '➜ Entrou: ', h('b', {}, p.nome), ` · ${p.unidade} · ${dataBR(p.data)}`)),
            r.sairam.map(p => h('li', {}, '← Saiu: ', h('b', {}, p.nome), ` · ${p.unidade} · ${dataBR(p.data)}`)))) : null,
        h('section', { class: 'caixa' }, h('h2', {}, `Todos os lançamentos (${r.lancamentos.length})`),
          tabela(['Data', 'Tipo', 'Categoria', 'Unidade', 'Descrição', 'Valor'], r.lancamentos, l => [
            h('td', {}, dataBR(l.data)), h('td', {}, l.tipo === 'receita' ? 'Entrou' : 'Saiu'), h('td', {}, l.categoria), h('td', {}, l.unidade || '—'),
            h('td', {}, [l.descricao, l.pessoa].filter(Boolean).join(' · ') || '—'), h('td', { class: 'num ' + (l.tipo === 'receita' ? 'pos' : 'neg') }, reais(l.valor))], () => {}, 'Nada lançado neste mês.'))));
    document.querySelectorAll('.fut-barras i').forEach(i => { i.style.width = i.dataset.w + '%'; });
  }

  /* ---------- Locatários ---------- */
  async function pessoas(params) {
    const { h, api, mostrar, dataBR, carregando, reais } = K();
    carregando();
    const lista = await api('future.pessoas', {});
    const q = (params.get('q') || '').toLowerCase();
    const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const vis = q ? lista.filter(p => sem(p.nome + ' ' + p.unidade + ' ' + p.telefone).includes(sem(q))) : lista;
    const busca = h('form', { class: 'busca-grande', role: 'search' }, h('span', { class: 'busca-ico', 'aria-hidden': 'true' }, '⌕'),
      h('input', { type: 'search', name: 'q', value: params.get('q') || '', placeholder: 'Buscar por nome, apartamento ou telefone', 'aria-label': 'Buscar locatário' }), h('button', { type: 'submit', class: 'btn' }, 'Buscar'));
    busca.addEventListener('submit', ev => { ev.preventDefault(); ir('pessoas', { q: busca.q.value.trim() }); });
    const atuais = lista.filter(p => p.situacao === 'atual').length;
    mostrar(topo('Edifício Future', 'Locatários', `${atuais} morando agora · ${lista.length - atuais} que já passaram pelo prédio`), busca,
      K().tabela(['Nome', 'Unidade', 'Entrada', 'Saída', 'Garantia', 'Situação'], vis, p => [
        h('td', { 'data-r': 'Nome' }, h('strong', {}, p.nome), p.telefone ? h('div', { class: 'peq' }, p.telefone) : null,
          h('div', { class: 'fut-docs' },
            p.pasta_url ? h('a', { class: 'fut-doc', href: p.pasta_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, `📁 documentos (${p.arquivos})`)
              : p.unidade ? h('button', { type: 'button', class: 'link fut-doc', onclick: async ev => { ev.stopPropagation(); ev.target.disabled = true; try { await api('future.pessoa.pasta', { id: p.id }); K().avisar('Pasta criada no Drive.'); K().rota(); } catch (e) { K().avisar(e.message, true); ev.target.disabled = false; } } }, '+ criar pasta no Drive') : null,
            p.contrato_url ? h('a', { class: 'fut-doc', href: p.contrato_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, '📄 contrato') : null)),
        h('td', { 'data-r': 'Unidade' }, p.unidade || '—'), h('td', { 'data-r': 'Entrada' }, dataBR(p.entrada) || '—'), h('td', { 'data-r': 'Saída' }, dataBR(p.saida) || '—'),
        h('td', { 'data-r': 'Garantia' }, [p.garantia, p.caucao ? reais(p.caucao) : ''].filter(Boolean).join(' · ') || '—'),
        h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (p.situacao === 'atual' ? 'ok' : '') }, p.situacao === 'atual' ? 'mora agora' : p.situacao === 'futuro' ? 'contrato futuro' : 'saiu'))
      ], p => editarPessoa(p), 'Ninguém encontrado.'));
  }
  function editarPessoa(p) {
    const { h, campo, aoEnviar, api, avisar } = K();
    const dlg = h('dialog', { class: 'fut-dlg' });
    const f = h('form', { class: 'campos', novalidate: true }, h('h2', { class: 'largo' }, p.nome),
      campo('nome', 'Nome', p.nome), campo('telefone', 'Telefone', p.telefone, { tipo: 'tel' }), campo('cpf', 'CPF', p.cpf),
      campo('unidade', 'Unidade', p.unidade), campo('entrada', 'Entrada', p.entrada, { tipo: 'date' }), campo('saida', 'Saída', p.saida, { tipo: 'date' }),
      campo('garantia', 'Garantia', p.garantia), campo('obs', 'Observações', p.obs, { area: true, largo: true }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), K().botao('Fechar', () => dlg.close(), 'sec'), h('p', { class: 'erro' })));
    aoEnviar(f, async fd => { await api('future.pessoa.salvar', { id: p.id, ...Object.fromEntries(fd.entries()) }); avisar('Salvo.'); dlg.close(); K().rota(); });
    dlg.append(f); document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }

  /* ---------- Contratos de locação: contrato + laudo prontos na pasta do morador ---------- */
  const PRAZOS = [3, 4, 6, 12];
  const somarMesesJS = (iso, n) => { const [a, m, d] = iso.split('-').map(Number), alvo = new Date(Date.UTC(a, m - 1 + n, 1)), ult = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return alvo.getUTCFullYear() + '-' + String(alvo.getUTCMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, ult)).padStart(2, '0'); };
  async function contratos(params) {
    const { h, api, mostrar, reais, dataBR, avisar, carregando, campo, hojeISO } = K();
    carregando();
    const r = await api('future.contratos', {});
    const base = r.contratos.find(c => c.id === params.get('renovar')) || null;
    const unSel = params.get('ap') || (base && base.unidade) || '';
    const pes = base ? r.pessoas.find(p => p.unidade === base.unidade) || {} : {};
    const opAp = r.unidades.map(u => [u.id, u.id + ' · ' + ((SIT[u.situacao] || [''])[0]) + (u.locatario ? ' · ' + u.locatario : '')]);
    const tipoIni = params.get('tipo') === 'temporada' || (base && base.tipo === 'temporada') ? 'temporada' : 'mensal';
    const blocoTemp = h('div', { class: 'largo fut-temp campos' },
      h('div', {}, h('label', {}, 'Período'), h('div', { class: 'fut-chips' },
        h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'unidade_prazo', value: 'dia', checked: true }), h('span', {}, 'em dias')),
        h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'unidade_prazo', value: 'mes' }), h('span', {}, 'em meses')))),
      campo('dias', 'Quantos dias', base && base.dias ? String(base.dias) : '10', { tipo: 'number' }),
      campo('meses', 'Quantos meses', '1', { tipo: 'number' }),
      campo('valor_total', 'Valor total da temporada (R$)', base && base.valor_total ? String(base.valor_total).replace('.', ',') : '', { modo: 'decimal', dica: 'energia, taxas e internet inclusas' }),
      campo('pagamento', 'Pagamento', 'duas', { opcoes: [['duas', 'Metade na reserva (assinatura) + metade na saída'], ['uma', 'Tudo na assinatura']] }),
      campo('data_reserva', 'Data da reserva / 1º pagamento', hojeISO(), { tipo: 'date' }));
    const f = h('form', { class: 'campos fut-contrato', novalidate: true },
      h('div', { class: 'largo' }, h('div', { class: 'fut-chips', role: 'radiogroup', 'aria-label': 'Tipo de contrato' },
        h('label', { class: 'fut-chip grande' }, h('input', { type: 'radio', name: 'tipo', value: 'mensal', checked: tipoIni === 'mensal' }), h('span', {}, '🏠 Mensal — 3, 4, 6 ou 12 meses')),
        h('label', { class: 'fut-chip grande' }, h('input', { type: 'radio', name: 'tipo', value: 'temporada', checked: tipoIni === 'temporada' }), h('span', {}, '🧳 Temporada — alguns dias ou 1 mês, valor fechado')))),
      h('h3', { class: 'largo fut-passo' }, '1. Apartamento e prazo'),
      campo('unidade', 'Apartamento', unSel, { opcoes: [['', 'Escolha…']].concat(opAp) }),
      blocoTemp,
      h('div', {}, h('label', {}, 'Prazo do contrato'),
        h('div', { class: 'fut-chips', role: 'radiogroup' }, PRAZOS.map(n => h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'prazo_meses', value: String(n), checked: n === ((base && base.prazo_meses) || 12) }), h('span', {}, n + ' meses'))),
          h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'prazo_meses', value: 'outro' }), h('span', {}, 'outro')),
          h('input', { name: 'prazo_outro', inputmode: 'numeric', placeholder: 'meses', class: 'fut-outro', 'aria-label': 'Outro prazo em meses' }))),
      campo('inicio', 'Entrada (entrega das chaves)', base ? base.fim : hojeISO(), { tipo: 'date' }),
      h('div', {}, h('label', {}, 'Fim do contrato'), h('output', { class: 'fut-fim', name: 'fim' }, '—')),
      campo('aluguel', 'Aluguel (R$)', base ? String(base.aluguel).replace('.', ',') : '', { modo: 'decimal' }),
      campo('dia_venc', 'Vencimento (dia do mês)', String(r.dia_venc), { tipo: 'number' }),
      h('h3', { class: 'largo fut-passo fut-garantia' }, '2. Garantia'),
      h('div', { class: 'largo fut-garantia' }, h('div', { class: 'fut-chips', role: 'radiogroup' },
        h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'garantia', value: 'com', checked: !base || base.garantia !== 'sem caução' }), h('span', {}, 'Com caução')),
        h('label', { class: 'fut-chip' }, h('input', { type: 'radio', name: 'garantia', value: 'sem', checked: !!base && base.garantia === 'sem caução' }), h('span', {}, 'Sem caução')))),
      campo('caucao', 'Valor da caução (R$)', '', { modo: 'decimal', dica: 'até 11 meses: 1 aluguel · 12 meses ou mais: 2 aluguéis (pode mudar)' }),
      campo('lancar_caucao', 'Caução recebida?', 'nao', { opcoes: [['nao', 'Ainda não (lanço depois no caixa)'], ['sim', 'Sim, lançar hoje no caixa do prédio']] }),
      h('h3', { class: 'largo fut-passo' }, '3. Locatário(a)'),
      campo('nome', 'Nome completo', base ? base.nome : '', { max: 120 }),
      campo('genero', 'Locatário ou locatária', pes.genero || '', { opcoes: [['', 'Pelo nome'], ['M', 'Locatário'], ['F', 'Locatária']] }),
      campo('cpf', 'CPF', base ? base.cpf : '', { max: 18 }),
      campo('rg', 'RG', pes.rg || '', { max: 30 }),
      campo('telefone', 'WhatsApp', base ? base.telefone : '', { tipo: 'tel', max: 30, dica: 'vai no contrato (vistoria enviada por WhatsApp)' }),
      campo('email', 'E-mail (Gmail)', pes.email || '', { tipo: 'email', max: 120, dica: 'para mandar o contrato, o laudo e o vídeo da vistoria' }),
      campo('nacionalidade', 'Nacionalidade', '', { dica: 'vazio = brasileiro(a)' }),
      campo('estado_civil', 'Estado civil', '', { opcoes: [['', '—'], ['solteiro(a)', 'Solteiro(a)'], ['casado(a)', 'Casado(a)'], ['divorciado(a)', 'Divorciado(a)'], ['viúvo(a)', 'Viúvo(a)'], ['união estável', 'União estável']] }),
      campo('profissao', 'Profissão', ''),
      campo('endereco', 'Endereço anterior (residência)', '', { largo: true, dica: 'ex.: Rua X, nº 10, Centro, Tubarão/SC' }),
      campo('qualificacao', 'Ou escreva a qualificação inteira', pes.qualificacao || '', { area: true, largo: true, dica: 'se preencher, substitui os campos acima (nacionalidade, estado civil, profissão, RG, CPF, endereço)' }),
      h('h3', { class: 'largo fut-passo' }, '4. Vistoria e assinatura'),
      campo('data_vistoria', 'Data da vistoria', base ? base.fim : hojeISO(), { tipo: 'date' }),
      campo('video_duracao', 'Duração do vídeo da vistoria', '', { dica: 'ex.: 6 minutos e 40 segundos' }),
      campo('data_assinatura', 'Data da assinatura', hojeISO(), { tipo: 'date' }),
      campo('kit', 'Nº da kit (quadro de medição)', ''), campo('uc', 'Unidade consumidora (UC)', ''), campo('medidor', 'Medidor de energia (relógio)', ''),
      campo('leitura', 'Leitura do medidor na entrega (kWh)', '', { modo: 'decimal' }),
      campo('chaves', 'Chaves e controles entregues', '', { largo: true, dica: 'ex.: 2 chaves da porta, 1 chave do portão, 1 controle do ar-condicionado' }),
      campo('obs_vistoria', 'Ressalvas da vistoria (o que já tinha algum defeito)', '', { area: true, largo: true, dica: 'vazio = nenhuma ressalva. Tudo o que aparece no vídeo já está listado no laudo (luzes, tomadas, móveis, eletrodomésticos, louças, esquadrias).' }),
      campo('atualizar_unidade', 'Atualizar o apartamento', 'sim', { opcoes: [['sim', 'Sim: passa a ser o(a) locatário(a) atual'], ['nao', 'Não: contrato para depois (o apartamento fica como está)']] }),
      h('div', { class: 'fut-resumo largo', 'aria-live': 'polite' }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar contrato e laudo'), h('p', { class: 'erro' })));
    const q = n => f.querySelector(`[name="${n}"]`);
    const meses = () => { const v = (f.querySelector('[name="prazo_meses"]:checked') || {}).value; return v === 'outro' ? parseInt(q('prazo_outro').value, 10) || 0 : +v || 0; };
    let caucaoMexida = false;
    q('caucao').addEventListener('input', () => { caucaoMexida = true; });
    const atualizar = (deUnidade) => {
      const u = r.unidades.find(x => x.id === q('unidade').value);
      if (u && deUnidade) {
        if (!base || deUnidade === 'troca') q('aluguel').value = u.aluguel ? String(u.aluguel).replace('.', ',') : '';
        q('kit').value = String(u.kit || '').replace(/\.0$/, ''); q('uc').value = String(u.uc || '').replace(/\.0$/, ''); q('medidor').value = String(u.medidor || '').replace(/\.0$/, '');
        if (!q('telefone').value && u.telefone && base) q('telefone').value = u.telefone;
      }
      const temp = (f.querySelector('[name="tipo"]:checked') || {}).value === 'temporada';
      f.classList.toggle('modo-temporada', temp);
      ['prazo_meses', 'aluguel', 'dia_venc', 'caucao', 'lancar_caucao'].forEach(k => { const el = f.querySelector(`[name="${k}"]`); const box = el && (el.closest('.fut-chips') ? el.closest('.fut-chips').parentElement : el.parentElement); if (box) box.hidden = temp; });
      f.querySelectorAll('.fut-garantia').forEach(x => { x.hidden = temp; });
      blocoTemp.hidden = !temp;
      if (temp) {
        const porMes = (f.querySelector('[name="unidade_prazo"]:checked') || {}).value === 'mes';
        q('dias').parentElement.hidden = porMes; q('meses').parentElement.hidden = !porMes;
        const qt = +(porMes ? q('meses').value : q('dias').value) || 0, ini = q('inicio').value;
        const fimT = ini && qt ? (porMes ? somarMesesJS(ini, qt) : new Date(Date.parse(ini + 'T12:00:00Z') + qt * 86400000).toISOString().slice(0, 10)) : '';
        q('fim').value = fimT ? dataBR(fimT) : '—';
        const u = r.unidades.find(x => x.id === q('unidade').value), tot = num(q('valor_total').value), duas = q('pagamento').value === 'duas';
        f.querySelector('.fut-resumo').replaceChildren(u && qt && ini && tot ? h('p', {}, h('b', {}, `${u.id}: temporada de ${qt} ${porMes ? (qt > 1 ? 'meses' : 'mês') : (qt > 1 ? 'dias' : 'dia')}, de ${dataBR(ini)} a ${dataBR(fimT)}`),
          ` · ${reais(tot)} ` + (duas ? `(${reais(Math.round(tot * 50) / 100)} na reserva + ${reais(tot - Math.round(tot * 50) / 100)} na saída)` : 'à vista'), ' · sem caução · energia e taxas inclusas',
          h('br'), h('span', { class: 'peq' }, `O painel cria as cobranças das parcelas e não cobra aluguel mensal deste apartamento enquanto durar a temporada.`)) : h('p', { class: 'peq' }, 'Escolha o apartamento, a entrada, o período e o valor total.'));
        return;
      }
      const n = meses(), al = num(q('aluguel').value), ini = q('inicio').value, com = (f.querySelector('[name="garantia"]:checked') || {}).value !== 'sem';
      const fim = ini && n ? somarMesesJS(ini, n) : '';
      q('fim').value = fim ? dataBR(fim) : '—';
      if (!caucaoMexida) q('caucao').value = al ? String(((n >= 12 ? 2 : 1) * al).toFixed(2)).replace('.', ',') : '';
      q('caucao').parentElement.hidden = !com; q('lancar_caucao').parentElement.hidden = !com;
      const res = f.querySelector('.fut-resumo');
      res.replaceChildren(u && n && ini && al ? h('p', {}, h('b', {}, `${u.id}: ${n} meses, de ${dataBR(ini)} a ${dataBR(fim)}`), ` · aluguel ${reais(al)} todo dia ${q('dia_venc').value}`,
        com ? ` · caução ${reais(num(q('caucao').value))} (${n >= 12 ? '2 aluguéis' : '1 aluguel'})` : ' · sem caução',
        h('br'), h('span', { class: 'peq' }, `A pasta "${(q('nome').value || 'NOME').toUpperCase()}" será criada em APARTAMENTOS › ${u.id}, com o contrato e o laudo (Google Docs para ajustar + PDF).`)) : h('p', { class: 'peq' }, 'Escolha o apartamento, o prazo, o início e o aluguel.'));
    };
    f.addEventListener('input', ev => atualizar(ev.target.name === 'unidade' ? 'troca' : false));
    f.addEventListener('change', ev => atualizar(ev.target.name === 'unidade' ? 'troca' : false));
    const saida = h('div');
    K().aoEnviar(f, async fd => {
      const dados = Object.fromEntries(fd.entries()); dados.prazo_meses = String(meses()); delete dados.prazo_outro;
      if (!dados.unidade) throw new Error('Escolha o apartamento.');
      if (dados.tipo !== 'temporada' && !(+dados.prazo_meses > 0)) throw new Error('Escolha o prazo.');
      const x = await api('future.contrato.gerar', dados);
      avisar(`${x.unidade}: contrato e laudo gerados na pasta de ${x.nome}.`);
      const link = (u, t) => h('a', { class: 'btn sec', href: u, target: '_blank', rel: 'noopener noreferrer' }, t);
      saida.replaceChildren(h('section', { class: 'caixa fut-pronto' }, h('h2', {}, '✓ Contrato pronto — ' + x.unidade + ' · ' + x.nome),
        h('p', { class: 'peq' }, `Termina em ${dataBR(x.fim)}.` + (x.temporada ? ` Temporada de ${reais(x.total)} · ${x.parcelas} cobrança(s) criada(s) em Cobranças.` : x.caucao ? ` Caução: ${reais(x.caucao)}.` : ' Sem caução.') + ' Confira o texto antes de imprimir; os Google Docs podem ser ajustados.'),
        h('div', { class: 'fut-acoes' }, link(x.contrato.pdf, '📄 Contrato (PDF)'), link(x.contrato.doc, '✎ Contrato (editar)'), link(x.laudo.pdf, '📋 Laudo (PDF)'), link(x.laudo.doc, '✎ Laudo (editar)'), link(x.pasta_url, '📁 Pasta'),
          x.telefone ? h('a', { class: 'btn wa', href: whats(x.telefone, `Olá, ${primeiro(x.nome)}! Seu contrato de locação do ${x.unidade.replace('AP ', 'apartamento ')} está pronto. Vou te mandar o contrato e o laudo de vistoria para conferir e assinar.`), target: '_blank', rel: 'noopener noreferrer' }, 'Avisar no WhatsApp') : null),
        x.id ? caixaEnviarVistoria({ id: x.id, unidade: x.unidade, nome: x.nome, telefone: x.telefone, email: x.email, pasta_url: x.pasta_url }) : null));
      saida.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const lista = K().tabela(['Apartamento', 'Locatário', 'Prazo', 'Garantia', 'Documentos'], r.contratos, c => [
      h('td', { 'data-r': 'Apartamento' }, h('strong', {}, c.unidade), h('div', { class: 'peq' }, 'gerado ' + dataBR(c.criado_em.slice(0, 10)) + (c.criado_por ? ' · ' + c.criado_por.split(' ')[0] : ''))),
      h('td', { 'data-r': 'Locatário' }, c.nome),
      h('td', { 'data-r': 'Prazo' }, c.tipo === 'distrato' ? h('span', { class: 'tag urgente' }, 'Distrato') : c.tipo === 'aditivo' ? h('span', { class: 'tag info' }, 'Termo aditivo') : c.tipo === 'temporada' ? `Temporada · ${c.dias} dias` : `${c.prazo_meses} meses`,
        h('div', { class: 'peq' }, c.tipo === 'distrato' ? 'encerrado em ' + dataBR(c.fim) : dataBR(c.inicio) + ' a ' + dataBR(c.fim)), c.situacao === 'encerrado' ? h('div', { class: 'peq' }, '(encerrado)') : null),
      h('td', { 'data-r': 'Garantia' }, c.tipo === 'temporada' ? reais(c.valor_total) + ' fechado' : c.caucao ? 'Caução ' + reais(c.caucao) : 'Sem caução'),
      h('td', { 'data-r': 'Documentos' }, h('div', { class: 'fut-docs' },
        c.pdf_url ? h('a', { class: 'fut-doc', href: c.pdf_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, c.tipo === 'distrato' ? '📄 distrato' : c.tipo === 'aditivo' ? '📄 aditivo' : '📄 contrato') : null,
        c.laudo_pdf ? h('a', { class: 'fut-doc', href: c.laudo_pdf, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, '📋 laudo') : null,
        c.pasta_url ? h('a', { class: 'fut-doc', href: c.pasta_url, target: '_blank', rel: 'noopener noreferrer', onclick: ev => ev.stopPropagation() }, '📁 pasta') : null,
        /^(distrato|aditivo)$/.test(c.tipo) ? null : h('button', { type: 'button', class: 'link fut-doc', onclick: ev => { ev.stopPropagation(); ir('contratos', { renovar: c.id, ap: '' }); } }, '↻ renovar'),
        c.laudo_pdf ? h('button', { type: 'button', class: 'link fut-doc', title: c.enviado_em ? 'enviado por e-mail em ' + dataBR(c.enviado_em.slice(0, 10)) : 'mandar contrato, laudo e vídeo', onclick: ev => { ev.stopPropagation();
          saida.replaceChildren(h('section', { class: 'caixa' }, h('h2', {}, `Enviar a vistoria — ${c.unidade} · ${c.nome}`), caixaEnviarVistoria(c))); saida.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, c.enviado_em ? '✉ enviado' : '✉ enviar vistoria') : null))
    ], () => {}, 'Nenhum contrato gerado pelo painel ainda.');
    // ----- 8.8.0: contratos EM VIGOR com Termo aditivo e Distrato -----
    const vigentes = r.unidades.filter(u => /^(alugado|renovar)$/.test(u.situacao) && u.modalidade !== 'temporada');
    const vagos = r.unidades.filter(u => !/^(alugado|renovar)$/.test(u.situacao));
    const resultadoDoc = (alvo, titulo, x, msgWa) => {
      const link = (u, t) => u ? h('a', { class: 'btn sec', href: u, target: '_blank', rel: 'noopener noreferrer' }, t) : null;
      alvo.replaceChildren(h('div', { class: 'nota ok' }, h('strong', {}, '✓ ' + titulo + ' pronto — ' + x.unidade + ' · ' + x.nome),
        h('div', { class: 'fut-acoes' }, link(x.documento.pdf, '📄 PDF'), link(x.documento.doc, '✎ Editar'), link(x.documento.pasta_url, '📁 Pasta'),
          x.telefone && msgWa ? h('a', { class: 'btn wa', href: whats(x.telefone, msgWa), target: '_blank', rel: 'noopener noreferrer' }, 'Avisar no WhatsApp') : null),
        h('p', { class: 'peq' }, 'Confira o texto antes de imprimir. O apartamento e o locatário já foram atualizados no painel.')));
    };
    const formDistrato = (u, alvo) => {
      const hoje = hojeISO(), diasFalta = u.saida && u.saida > hoje ? Math.round((Date.parse(u.saida) - Date.parse(hoje)) / 86400000) : 0;
      const multaSug = diasFalta ? Math.round(u.aluguel / 30 * diasFalta * 0.4 * 100) / 100 : 0;
      const f = h('form', { class: 'campos fut-distrato', novalidate: true },
        h('label', { class: 'marcar largo fut-manual' }, h('input', { type: 'checkbox', name: 'sem_documento', value: 'sim', onchange: ev => {
          f.classList.toggle('so-liberar', ev.target.checked);
          f.querySelector('button[type=submit]').textContent = ev.target.checked ? 'Liberar o apartamento (distrato já feito)' : 'Gerar o distrato e liberar o apartamento';
        } }), ' Já fiz o distrato fora do painel — só tirar o(a) locatário(a) e deixar o apartamento disponível'),
        campo('data_encerramento', 'Encerra em', hoje, { tipo: 'date' }),
        campo('data_chaves', 'Entrega das chaves', hoje, { tipo: 'date' }),
        campo('motivo', 'Motivo', diasFalta > 0 ? 'acordo' : 'fim', { opcoes: [['fim', 'Fim do prazo do contrato'], ['acordo', 'Comum acordo'], ['locatario', 'Pedido do locatário antes do prazo'], ['locadora', 'Pedido da locadora']] }),
        campo('multa', 'Multa por sair antes', 'dispensar', { opcoes: [['dispensar', 'Dispensar a multa'], ['cobrar', 'Cobrar a multa']] }),
        campo('multa_valor', 'Valor da multa (R$)', multaSug ? String(multaSug).replace('.', ',') : '', { modo: 'decimal', dica: diasFalta ? `40% dos aluguéis dos ${diasFalta} dias que faltam` : 'só se for cobrar' }),
        campo('vistoria', 'Vistoria final', 'ok', { opcoes: [['ok', 'Tudo certo (igual à vistoria inicial)'], ['ressalvas', 'Com ressalvas (descrever)']] }),
        campo('vistoria_obs', 'Ressalvas da vistoria', '', { max: 600, largo: true }),
        campo('pendencias', 'Valores do período', 'quitado', { opcoes: [['quitado', 'Está tudo pago'], ['valores', 'Ainda há valores a pagar']] }),
        campo('aluguel_proporcional', 'Aluguel proporcional (R$)', '', { modo: 'decimal' }),
        campo('energia', 'Energia (R$)', '', { modo: 'decimal' }),
        campo('outros', 'Outros (R$)', '', { modo: 'decimal' }),
        campo('outros_desc', 'O que é "outros"', '', { max: 200 }),
        campo('vencimento', 'Pagar até', hoje, { tipo: 'date' }),
        campo('cobranca_final', 'Criar a cobrança do acerto em Cobranças?', 'sim', { opcoes: [['sim', 'Sim'], ['nao', 'Não']] }),
        u.caucao ? campo('caucao_desconto', `Descontar da caução de ${reais(u.caucao)} (R$)`, '', { modo: 'decimal', dica: 'deixe vazio para devolver tudo' }) : null,
        u.caucao ? campo('caucao_motivo', 'Motivo do desconto', '', { max: 160 }) : null,
        u.caucao ? campo('lancar_caucao', 'Lançar a devolução da caução no caixa?', 'sim', { opcoes: [['sim', 'Sim'], ['nao', 'Não']] }) : null,
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar o distrato e liberar o apartamento')), h('p', { class: 'erro largo' }));
      K().aoEnviar(f, async fd => {
        if (!confirm(`Encerrar a locação do ${u.id} (${u.locatario})? O apartamento fica vago (disponível) no painel.`)) return;
        const x = await api('future.contrato.distrato', { unidade: u.id, ...Object.fromEntries(fd.entries()) });
        if (fd.get('sem_documento') === 'sim') { avisar(`${x.unidade}: ${x.nome} saiu. O apartamento está disponível.`); setTimeout(() => K().rota(), 600); return; }
        resultadoDoc(alvo, 'Distrato', x, `Olá, ${primeiro(x.nome)}! Segue o termo de distrato do ${x.unidade.replace('AP ', 'apartamento ')} para conferir e assinar. Obrigada por ter ficado com a gente!`);
      });
      return f;
    };
    const formAditivo = (u, alvo) => {
      const sec = (nome, rot, ...campos) => h('fieldset', { class: 'largo fut-adit' }, h('legend', {}, h('label', {}, h('input', { type: 'checkbox', name: nome, value: 'sim' }), ' ' + rot)), h('div', { class: 'campos' }, ...campos));
      const f = h('form', { class: 'campos', novalidate: true },
        sec('prorrogar', '⏩ Prorrogar o prazo', campo('meses', 'Por mais quantos meses', '6', { tipo: 'number' }), campo('novo_fim', 'ou nova data de término', '', { tipo: 'date' })),
        sec('reajustar', '💲 Reajustar o aluguel', campo('novo_aluguel', `Novo aluguel (hoje ${reais(u.aluguel)})`, '', { modo: 'decimal' }), campo('reajuste_desde', 'A partir de', hojeISO(), { tipo: 'date' }), campo('indice', 'Índice (opcional)', 'IGP-M/FGV', { max: 120 })),
        sec('trocar', '🔁 Trocar de apartamento', campo('nova_unidade', 'Novo apartamento', '', { opcoes: [['', 'Escolha…']].concat(vagos.map(v => [v.id, v.id])) }), campo('troca_data', 'A partir de', hojeISO(), { tipo: 'date' })),
        sec('livre', '✎ Outra cláusula', campo('titulo_livre', 'Título', 'DA ALTERAÇÃO', { max: 60 }), campo('texto_livre', 'Texto da cláusula', '', { area: true, largo: true, max: 1500 })),
        h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar o termo aditivo')), h('p', { class: 'erro largo' }));
      K().aoEnviar(f, async fd => {
        const d = Object.fromEntries(fd.entries());
        if (d.livre !== 'sim') delete d.texto_livre;
        const x = await api('future.contrato.aditivo', { unidade: u.id, ...d });
        resultadoDoc(alvo, 'Termo aditivo', x, `Olá, ${primeiro(x.nome)}! Segue o termo aditivo do seu contrato de locação${x.novo_fim ? ' (prorrogado até ' + dataBR(x.novo_fim) + ')' : ''} para conferir e assinar.`);
      });
      return f;
    };
    const cartaoVigente = u => {
      const area = h('div', {}), dias = u.saida ? Math.round((Date.parse(u.saida) - Date.parse(hojeISO())) / 86400000) : null;
      const abrir = qual => { area.replaceChildren(h('div', { class: 'fut-form-abre' }, h('h3', {}, qual === 'd' ? '⏹ Encerrar a locação (distrato)' : '✎ Termo aditivo'), qual === 'd' ? formDistrato(u, area) : formAditivo(u, area))); };
      const c = r.contratos.find(x => x.unidade === u.id && (x.tipo || 'mensal') === 'mensal');
      return h('li', { class: 'fut-vig' },
        h('div', { class: 'fut-vig-cab' },
          h('div', {}, h('strong', {}, u.id), ' · ', u.locatario || '—', h('div', { class: 'peq' }, (u.entrada ? dataBR(u.entrada) : '?') + ' a ' + (u.saida ? dataBR(u.saida) : '?') + ' · ' + reais(u.aluguel) + '/mês' +
            (u.caucao ? ' · caução ' + reais(u.caucao) : '') + (dias !== null ? (dias < 0 ? ` · venceu há ${-dias} dia(s)` : ` · faltam ${dias} dia(s)`) : ''))),
          h('div', { class: 'fut-acoes' },
            K().botao('✎ Termo aditivo', () => abrir('a'), 'sec mini'),
            K().botao('⏹ Encerrar (distrato)', () => abrir('d'), 'sec mini'),
            K().botao('↻ Renovar (contrato novo)', () => ir('contratos', c ? { renovar: c.id, ap: '' } : { ap: u.id, renovar: '' }), 'mini'))),
        area);
    };
    const blocoVigentes = h('section', { class: 'caixa' }, h('h2', {}, `Contratos em vigor (${vigentes.length})`),
      h('p', { class: 'peq' }, 'Aditivo = mudar algo no contrato atual (prorrogar, reajustar, trocar de apartamento). Distrato = encerrar a locação: o painel libera o apartamento e pode criar a cobrança do acerto.'),
      vigentes.length ? h('ul', { class: 'fut-vig-lista' }, vigentes.map(cartaoVigente)) : h('p', { class: 'peq' }, 'Nenhum apartamento alugado.'));
    const vence = r.vencendo.length ? h('section', { class: 'caixa' }, h('h2', {}, 'Contratos terminando (45 dias)'),
      h('ul', { class: 'fut-lista fut-renovar' }, r.vencendo.map(u => h('li', {}, h('b', {}, u.id), ' · ', u.locatario || '—', ' · termina ', dataBR(u.saida), ' ',
        h('button', { type: 'button', class: 'btn mini sec', onclick: () => { const c = r.contratos.find(x => x.unidade === u.id); ir('contratos', c ? { renovar: c.id, ap: '' } : { ap: u.id, renovar: '' }); } }, 'Fazer o novo contrato'))))) : null;
    mostrar(topo('Edifício Future', 'Contratos de locação', 'Em vigor (aditivo e distrato) · novo contrato mensal ou por temporada · histórico, tudo na pasta do morador',
        [h('a', { class: 'btn sec', href: '#/future/pessoas' }, 'Locatários')]),
      base ? h('p', { class: 'nota' }, `Renovação de ${base.nome} (${base.unidade}): o novo contrato começa no fim do anterior (${dataBR(base.fim)}). Confira os dados.`) : null,
      base ? null : blocoVigentes,
      vence,
      h('section', { class: 'caixa' }, h('h2', {}, base ? 'Renovar contrato' : 'Novo contrato'), f),
      saida,
      h('section', { class: 'caixa' }, h('h2', {}, 'Histórico: contratos, aditivos e distratos'), lista));
    if (unSel) atualizar(base ? 'base' : 'troca'); else atualizar(false);
  }

  /** 8.11: manda o contrato, o laudo e o vídeo da vistoria por e-mail (Gmail, com PDFs anexos) ou WhatsApp (mensagem pronta;
   *  os PDFs e o vídeo são anexados à mão — não deixamos arquivos públicos). */
  function caixaEnviarVistoria(c) {
    const { h, api, avisar } = K();
    const f = h('form', { class: 'campos fut-enviar', novalidate: true },
      K().campo('email', 'E-mail do(a) locatário(a)', c.email || '', { tipo: 'email', max: 120 }),
      K().campo('video_url', 'Link do vídeo da vistoria no Drive', c.video_url || '', { largo: true, dica: 'suba o vídeo na pasta do morador e cole o link aqui (o vídeo fica compartilhado só com esse e-mail)' }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, '✉ Enviar por e-mail'),
        c.telefone ? h('a', { class: 'btn wa', target: '_blank', rel: 'noopener noreferrer', href: whats(c.telefone,
          `Olá, ${primeiro(c.nome)}! Segue o contrato e o laudo de vistoria do ${String(c.unidade).replace('AP ', 'apartamento ')} do Edifício Future, com o vídeo da vistoria. ` +
          `Confira tudo: se encontrar alguma divergência, avise por escrito em até 5 dias da entrega das chaves. A devolução do apartamento deve ser nas mesmas condições da vistoria, e a caução é a garantia da locação.`) }, 'Mandar no WhatsApp') : null,
        c.pasta_url ? h('a', { class: 'btn sec', href: c.pasta_url, target: '_blank', rel: 'noopener noreferrer' }, '📁 Pasta (anexar no WhatsApp)') : null),
      h('p', { class: 'erro largo' }));
    K().aoEnviar(f, async fd => {
      const x = await api('future.vistoria.enviar', { id: c.id, email: fd.get('email'), video_url: fd.get('video_url') });
      avisar(`Enviado para ${x.email} (${x.anexos} PDF anexado${x.anexos === 1 ? '' : 's'}).`);
    });
    return h('div', { class: 'fut-enviar-box' }, h('h3', {}, 'Enviar a vistoria ao locatário'), h('p', { class: 'peq' }, 'Pelo e-mail vão o contrato e o laudo em PDF e o link do vídeo. Pelo WhatsApp vai a mensagem pronta: anexe os PDFs e o vídeo da pasta.'), f);
  }

  /* ---------- Configurações ---------- */
  async function config() {
    const { h, api, mostrar, avisar, carregando } = K();
    carregando();
    const c = await api('future.config', {});
    const f = h('form', { class: 'campos', novalidate: true },
      h('fieldset', { class: 'largo' }, h('legend', {}, 'Quem vê o painel do Edifício Future'),
        c.usuarios.map(u => h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'u', value: u.usuario, checked: u.acesso }), u.nome + ' (' + u.usuario + ')'))),
      K().campo('dia_venc', 'Dia de vencimento do aluguel', String(c.dia_venc), { tipo: 'number' }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), h('p', { class: 'erro' })));
    K().aoEnviar(f, async fd => { await api('future.config', { salvar: true, usuarios: fd.getAll('u'), dia_venc: fd.get('dia_venc') }); avisar('Configurações salvas.'); K().rota(); });
    // mensagem de cobrança: tudo editável (a conta e as taxas mudam de vez em quando)
    const fm = h('form', { class: 'campos', novalidate: true },
      K().campo('predio', 'Nome do prédio na mensagem', c.predio, { dica: 'aparece em "Segue o demonstrativo do …"' }),
      K().campo('cotacao', 'Cotação do dólar (R$)', String(c.cotacao).replace('.', ','), { modo: 'decimal', dica: 'para quem paga em dólar (marcado na ficha do apartamento)' }),
      K().campo('pagamento', 'Texto livre de pagamento (só usado se não houver conta cadastrada acima)', c.pagamento, { area: true, largo: true }),
      K().campo('taxas_itens', 'Taxas do apartamento, uma por linha', c.taxas_itens, { area: true, dica: 'Nome: valor — quando a soma bate com as taxas da unidade, a mensagem mostra cada uma' }),
      K().campo('taxas_sala', 'Taxas das salas comerciais (R$)', String(c.taxas_sala).replace('.', ','), { modo: 'decimal', dica: 'as salas pagam a própria energia' }),
      K().campo('pagadores', 'Empresas que pagam apartamentos', c.pagadores, { area: true, largo: true, dica: 'uma por linha: Nome da empresa (igual ao campo "Quem paga") | telefone | nome do contato' }),
      K().campo('fecho', 'Última frase da mensagem (sempre pede o comprovante)', c.fecho, { largo: true }),
      K().campo('dinheiro', 'Aceita pagamento em dinheiro?', c.dinheiro, { opcoes: [['sim', 'Sim — a mensagem avisa'], ['nao', 'Não mostrar']] }),
      K().campo('dinheiro_txt', 'Frase do dinheiro', c.dinheiro_txt, { largo: true }),
      K().campo('pix', 'Chave PIX (só se não houver dados de pagamento acima)', c.pix),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar a mensagem'), h('p', { class: 'erro' })));
    // contas para receber (a conta muda às vezes; cada apartamento pode usar uma)
    let contas = (c.contas || []).map(x => Object.assign({}, x));
    const boxContas = h('div', { class: 'fut-contas' });
    const desenharContas = () => boxContas.replaceChildren(...contas.map((ct, i) => {
      const inp = (k, rot, dica) => { const el = h('input', { value: ct[k] || '', placeholder: dica || '', 'aria-label': rot }); el.addEventListener('input', () => { ct[k] = el.value; }); return h('label', { class: 'fut-conta-campo' }, h('span', { class: 'peq' }, rot), el); };
      return h('fieldset', { class: 'fut-conta' }, h('legend', {}, ct.apelido || ct.titular || 'Conta ' + (i + 1)),
        h('label', { class: 'marcar' }, h('input', { type: 'radio', name: 'conta_padrao', value: ct.id || 'n' + i, checked: (ct.id || 'n' + i) === (c.conta_padrao || (contas[0] || {}).id) }), 'Conta padrão'),
        inp('apelido', 'Apelido', 'ex.: Nubank Janaina'), inp('titular', 'Titular'), inp('pix_tipo', 'Tipo da chave', 'celular, CPF, e-mail…'), inp('pix', 'Chave Pix'),
        inp('banco', 'Banco'), inp('codigo_banco', 'Código do banco', 'ex.: 0260'), inp('agencia', 'Agência'), inp('conta', 'Conta'),
        K().botao('Tirar esta conta', () => { contas.splice(i, 1); desenharContas(); }, 'mini link'));
    }), K().botao('+ outra conta', () => { contas.push({ id: '' }); desenharContas(); }, 'mini sec'));
    if (!contas.length) contas.push({ id: '' });
    desenharContas();
    const salvarContas = K().botao('Salvar as contas', async ev => {
      ev.target.disabled = true;
      contas.forEach((x, i) => { if (!x.id) x.id = 'n' + i; });
      const pad = (boxContas.querySelector('input[name=conta_padrao]:checked') || {}).value;
      try { await api('future.config', { salvar: true, usuarios: c.usuarios.filter(u => u.acesso).map(u => u.usuario), contas, conta_padrao: pad }); avisar('Contas salvas. As próximas mensagens já saem com o Pix novo.'); K().rota(); }
      catch (e) { avisar(e.message, true); ev.target.disabled = false; }
    });
    K().aoEnviar(fm, async fd => { await api('future.config', { salvar: true, usuarios: c.usuarios.filter(u => u.acesso).map(u => u.usuario), ...Object.fromEntries(fd.entries()) }); avisar('Mensagem de cobrança salva.'); K().rota(); });
    const imp = h('div', {},
      h('p', {}, c.importado ? 'Última importação: ' + c.importado.slice(0, 16).replace('T', ' ') + ' · ' + c.importado.slice(25) : 'Ainda não importado.'),
      h('p', { class: 'peq' }, 'Lê a planilha "EDIFICIO FUTURE CONTROLE": unidades, locatários de agora e os anteriores (abas AP 101…), receitas, despesas, lavanderia e as contas da Celesc. Pode rodar de novo: não duplica.'),
      K().botao(c.importado ? 'Importar de novo (só o que falta)' : 'Importar a planilha agora', async ev => {
        ev.target.disabled = true; ev.target.textContent = 'Importando… (até 1 minuto)';
        try { const r = await api('future.importar', {}); avisar(`Importado: ${r.unidades} unidades, ${r.pessoas} pessoas (planilha + pastas do Drive), ${r.receitas} receitas, ${r.despesas} despesas, ${r.energia} contas de energia, ${r.lavanderia} da lavanderia.`); K().rota(); }
        catch (e) { avisar(e.message, true); ev.target.disabled = false; }
      }));
    const drive = h('div', {}, h('p', { class: 'peq' }, 'Lê a pasta 05. ED. FUTURE › APARTAMENTOS (e as salas): liga cada unidade à sua pasta e cada pessoa à pasta dos documentos dela; quem tiver pasta e não estiver na planilha entra em "quem já morou". Roda sozinho uma vez por dia.'),
      K().botao('Ler as pastas do Drive agora', async ev => {
        ev.target.disabled = true; ev.target.textContent = 'Lendo o Drive…';
        try { const r = await api('future.drive', {}); avisar(`Drive lido: ${r.unidades} pasta(s) de unidade ligada(s), ${r.pessoas} pasta(s) de pessoas, ${r.novas} pessoa(s) nova(s).`); K().rota(); }
        catch (e) { avisar(e.message, true); ev.target.disabled = false; }
      }));
    mostrar(topo('Edifício Future', 'Configurações', 'Acesso, vencimento e importação'),
      h('section', { class: 'caixa' }, h('h2', {}, 'Contas para receber (Pix)'), h('p', { class: 'peq' }, 'Vão na mensagem de cobrança em formato de Pix. A conta padrão vale para todos; em cada cobrança dá para escolher outra, e "usar sempre neste apto" fixa uma conta para o apartamento.'), boxContas, salvarContas),
      h('section', { class: 'caixa' }, h('h2', {}, 'Mensagem de cobrança (WhatsApp)'), fm),
      h('section', { class: 'caixa' }, h('h2', {}, 'Pastas do Drive'), drive),
      h('section', { class: 'caixa' }, h('h2', {}, 'Importar da planilha antiga'), imp),
      h('section', { class: 'caixa' }, h('h2', {}, 'Acesso e vencimento'), f),
      h('section', { class: 'caixa' }, h('h2', {}, 'Próximos passos (automação)'),
        h('ul', {}, h('li', {}, 'PIX agendados e recebidos no Gmail → baixa automática das cobranças (aguardando os e-mails de exemplo).'),
          h('li', {}, 'Cobranças e contas na pasta do Drive → leitura automática.'),
          h('li', {}, 'Relatório de energia que você vai mandar → importação para o histórico.'))));
  }

  // Velocidade: ao abrir o painel do prédio, as outras telas já são buscadas em segundo plano (abrem na hora)
  let preparado = false;
  function prepararTelas() {
    if (preparado) return; preparado = true;
    const ref = refHoje(), cob = compMais(ref, 1), a = (x, d) => K().api(x, d).catch(() => {});
    setTimeout(() => { a('future.cobrancas', { mes: cob }); a('future.energia', { mes: ref }); a('future.lavanderia', { mes: ref }); a('future.lancamentos', { mes: ref });
      a('future.resumo', {}); a('future.relatorio', { mes: ref }); a('future.pessoas', {}); a('future.contratos', {}); }, 1200);
  }
  window.FUTURE = {
    async tela(partes, params) {
      const [sub, id] = partes;
      prepararTelas();
      switch (sub) {
        case 'unidades': return unidades(params);
        case 'unidade': return unidade(id);
        case 'cobrancas': return cobrancas(params);
        case 'caixa': return caixa(params);
        case 'energia': return energia(params);
        case 'relatorio': return relatorio(params);
        case 'pessoas': return pessoas(params);
        case 'config': return config();
        case 'contratos': return contratos(params);
        case 'lavanderia': return lavanderia(params);
        default: return visao(params);
      }
    }
  };
})();
