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
    let t = String(tel || '').replace(/\D/g, ''); if (!t) return null;
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
    const comp = params.get('mes') || compHoje();
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
      topo('Edifício Future', 'Visão geral', `${n.alugado + n.renovar} de ${alugaveis} unidades ocupadas (${ocup}%) · ${nomeMes(comp)}`,
        [h('a', { class: 'btn dourado', href: '#/future/relatorio?mes=' + comp }, 'Relatório do mês'), h('a', { class: 'btn sec', href: '#/future/caixa?mes=' + comp }, '+ Lançar no caixa')]),
      navMes(comp, '', params),
      h('section', { class: 'fin-nums fut-nums' },
        numero('verde', reais(r.receitas), 'Entrou no mês', 'receitas lançadas'),
        numero('vermelho', reais(r.despesas), 'Saiu no mês', 'despesas lançadas', '#/future/caixa?mes=' + comp),
        numero(r.receitas - r.despesas >= 0 ? 'dourado' : 'vermelho', reais(r.receitas - r.despesas), 'Saldo do mês', 'entrou − saiu'),
        numero(r.atrasado ? 'vermelho' : 'azul', reais(r.aReceber), 'A receber', r.atrasado ? `${reais(r.atrasado)} em atraso` : 'aluguéis do mês em aberto', '#/future/cobrancas?mes=' + comp)),
      h('section', { class: 'caixa fut-predio-caixa' }, h('h2', {}, 'O prédio agora'), legenda,
        h('div', { class: 'fut-predio' }, andares.map(([nome, us]) => h('div', { class: 'fut-andar' }, h('span', { class: 'fut-andar-nome' }, nome), h('div', { class: 'fut-aps' }, us.map(tile)))))),
      h('div', { class: 'fut-duas' },
        h('section', { class: 'caixa' }, h('h2', {}, `Contratos vencendo · 45 dias (${r.vencendo.length})`),
          r.vencendo.length ? h('ul', { class: 'fut-lista' }, r.vencendo.map(u => {
            const l = whats(u.telefone, `Olá, ${primeiro(u.locatario)}! Aqui é da administração do Edifício Future. O contrato do ${u.id} vence em ${dataBR(u.saida)}. Você tem interesse em renovar? Podemos conversar sobre as condições.`);
            return h('li', {}, h('a', { href: '#/future/unidade/' + encodeURIComponent(u.id) }, h('b', {}, u.id), ' · ', u.locatario || '—'),
              h('span', { class: 'tag ' + (u.saida < r.hoje ? 'urgente' : 'atencao') }, dataBR(u.saida)),
              l ? h('a', { class: 'btn mini wa', href: l, target: '_blank', rel: 'noopener noreferrer' }, 'Renovar?') : h('span', { class: 'peq' }, 'sem telefone'));
          })) : h('p', { class: 'peq' }, 'Nenhum contrato vence nos próximos 45 dias.')),
        h('section', { class: 'caixa' }, h('h2', {}, `Aluguéis em atraso (${r.atrasadas.length})`),
          r.atrasadas.length ? h('ul', { class: 'fut-lista' }, r.atrasadas.map(c => {
            const l = whats(c.telefone, msgCobranca(c));
            return h('li', {}, h('a', { href: '#/future/cobrancas?mes=' + c.competencia }, h('b', {}, c.unidade), ' · ', c.pessoa || '—', ' · ', curto(c.competencia)),
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
      h('input', { name: 'kwh', placeholder: 'kWh (opcional)', inputmode: 'numeric', 'aria-label': 'kWh' }),
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
  function textoCobranca(c, r) {
    const { reais, dataBR } = K();
    const linhas = [`Olá, ${primeiro(c.pessoa) || 'tudo bem'}! Aqui é da administração do Edifício Future.`, '',
      `Segue o valor do ${c.unidade} referente a ${nomeMes(c.competencia)}:`,
      `• Aluguel: ${reais(c.aluguel)}`, `• Taxas (${r.taxas_desc}): ${reais(c.taxas)}`];
    if (c.energia) linhas.push(`• Energia (Celesc de ${nomeMes(compMais(c.competencia, -1))}): ${reais(c.energia)}`);
    if (c.outros) linhas.push(`• Outros${c.obs ? ' (' + c.obs + ')' : ''}: ${reais(c.outros)}`);
    linhas.push(`*Total: ${reais(c.total)}*`, `Vencimento: ${dataBR(c.vencimento)}`);
    if (r.pix) linhas.push('', `PIX: ${r.pix}`);
    linhas.push('', 'Depois de pagar, se puder, mande o comprovante por aqui. Obrigado!');
    return linhas.join('\n');
  }
  async function cobrancas(params) {
    const { h, api, mostrar, reais, dataBR, avisar, carregando, hojeISO } = K();
    carregando();
    const comp = params.get('mes') || compHoje();
    const ver = params.get('ver') || 'falta';
    const r = await api('future.cobrancas', { mes: comp });
    const doMes = r.lista.filter(c => c.competencia === comp), antigas = r.lista.filter(c => c.competencia !== comp);
    const recarregar = () => K().rota();
    const total = doMes.reduce((a, c) => a + c.total, 0), recebido = doMes.reduce((a, c) => a + c.valor_pago, 0);
    const faltam = doMes.filter(c => !c.pago_em), pagas = doMes.filter(c => c.pago_em);
    const semEnergia = faltam.filter(c => !c.energia).length, naoEnviadas = faltam.filter(c => !c.enviado_em && !c.pagador).length;
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
      const link = c.telefone ? whats(c.telefone, textoCobranca(c, r)) : null;
      const status = c.pago_em ? h('span', { class: 'fut-st pago' }, '✓ Pago ' + dataBR(c.pago_em) + (c.valor_pago < c.total - 0.01 ? ' · ' + reais(c.valor_pago) + ' de ' + reais(c.total) : ''))
        : c.situacao === 'atrasada' ? h('span', { class: 'fut-st atraso' }, '! Atrasado · venceu ' + dataBR(c.vencimento))
        : c.enviado_em ? h('span', { class: 'fut-st enviado' }, '✉ Cobrança enviada ' + dataBR(c.enviado_em.slice(0, 10)) + (c.enviado_por ? ' por ' + c.enviado_por.split(' ')[0] : ''))
        : c.pagador ? h('span', { class: 'fut-st' }, 'Cobrança da empresa (' + c.pagador + ')')
        : h('span', { class: 'fut-st falta' }, '○ Falta mandar a cobrança');
      const botoes = h('div', { class: 'fut-acoes' });
      if (!c.pago_em) {
        if (!c.pagador && link) botoes.append(h('a', { class: 'btn wa fut-zap', href: link, target: '_blank', rel: 'noopener noreferrer', onclick: () => { api('future.cobranca.enviada', { id: c.id }).then(() => setTimeout(recarregar, 400)).catch(() => {}); } }, c.enviado_em ? 'Mandar de novo' : 'Cobrar no WhatsApp'));
        botoes.append(K().botao('✓ Pagou', () => area.replaceChildren(pagar(c)), 'mini'), K().botao('Ajustar valores', () => area.replaceChildren(ajustar(c)), 'mini sec'));
      } else botoes.append(K().botao('Desfazer pagamento', async () => { if (!confirm('Desfazer o pagamento de ' + c.unidade + '?')) return; await api('future.cobranca.pagar', { id: c.id, desfazer: true }); recarregar(); }, 'mini sec'));
      return h('article', { class: 'fut-cob-card ' + (c.pago_em ? 'pago' : c.situacao === 'atrasada' ? 'atraso' : c.enviado_em ? 'enviado' : 'falta') },
        h('div', { class: 'fut-cob-tit' }, h('a', { href: '#/future/unidade/' + encodeURIComponent(c.unidade) }, h('b', {}, c.unidade)),
          h('span', {}, c.pessoa || '—'), c.competencia !== comp ? h('span', { class: 'tag urgente' }, curto(c.competencia)) : null),
        h('div', { class: 'fut-cob-val' },
          h('span', {}, 'Aluguel ', h('b', {}, reais(c.aluguel))), h('span', {}, 'Taxas ', h('b', {}, reais(c.taxas))),
          h('span', { class: c.energia ? '' : 'falta' }, 'Energia ', h('b', {}, c.energia ? reais(c.energia) : 'não informada')),
          c.outros ? h('span', {}, 'Outros ', h('b', {}, reais(c.outros))) : null,
          h('span', { class: 'fut-cob-total' }, 'Total ', h('b', {}, reais(c.total)))),
        h('div', { class: 'fut-cob-pe' }, status, botoes),
        !c.pago_em && !c.pagador && !c.telefone ? h('div', { class: 'fut-cob-tel' }, h('span', { class: 'peq' }, 'Sem telefone: '), telefone(c)) : null,
        area);
    };
    // empresa que paga vários apartamentos (ex.: Hercílio Luz): uma cobrança só
    const grupos = {}; doMes.forEach(c => { if (c.pagador) (grupos[c.pagador] = grupos[c.pagador] || []).push(c); });
    const blocosGrupo = Object.entries(grupos).map(([pag, cs]) => {
      const abertas = cs.filter(c => !c.pago_em), soma = cs.reduce((a, c) => a + c.total, 0), falta = abertas.reduce((a, c) => a + c.total, 0);
      return h('section', { class: 'caixa fut-grupo' },
        h('div', {}, h('span', { class: 'carteira-kicker' }, 'Cobrança única da empresa'), h('h2', {}, pag),
          h('p', { class: 'peq' }, `${cs.length} apartamento(s): ${cs.map(c => c.unidade.replace('AP ', '')).join(', ')} · total ${reais(soma)}` + (abertas.length ? ` · falta ${reais(falta)}` : ' · tudo pago ✓'))),
        abertas.length ? K().botao(`✓ Recebi da ${pag.split(' (')[0]} (${reais(falta)})`, async () => {
          if (!confirm(`Registrar o pagamento das ${abertas.length} cobranças de ${pag} em ${nomeMes(comp)}?`)) return;
          const x = await api('future.cobranca.pagarGrupo', { pagador: pag, mes: comp }); avisar(`${x.pagas} cobrança(s) de ${pag} pagas.`); recarregar();
        }) : null);
    });
    const listaVer = ver === 'pagas' ? pagas : ver === 'todas' ? doMes : faltam.filter(c => !c.pagador);
    const aba = (id, rot, n) => h('button', { type: 'button', class: 'visao-bt' + (ver === id ? ' ativo' : ''), onclick: () => ir('cobrancas', { ver: id }, params) }, h('span', {}, rot), h('span', { class: 'visao-n' }, String(n)));
    mostrar(topo('Edifício Future', 'Cobranças do mês', `Aluguel + ${r.taxas_desc} + energia do mês anterior · vence dia ${(doMes[0] || {}).vencimento ? doMes[0].vencimento.slice(8) : '10'}`,
        [h('a', { class: 'btn sec', href: '#/future/energia?mes=' + compMais(comp, -1) }, '⚡ Informar energia'), h('a', { class: 'btn sec', href: '#/future/config' }, 'Chave PIX')]),
      navMes(comp, 'cobrancas', params),
      h('section', { class: 'fin-nums' },
        numero('dourado', reais(total), 'Cobrado no mês', `${doMes.length} cobrança(s)`),
        numero('verde', reais(recebido), 'Já pagaram', `${pagas.length} de ${doMes.length}`),
        numero(total - recebido > 0 ? 'vermelho' : 'verde', reais(total - recebido), 'Falta pagar', `${faltam.length} unidade(s)`),
        numero(naoEnviadas ? 'azul alerta' : 'azul', String(naoEnviadas), 'Falta mandar', 'cobranças ainda não enviadas')),
      semEnergia ? h('p', { class: 'nota' }, `⚡ ${semEnergia} cobrança(s) ainda sem a energia de ${nomeMes(compMais(comp, -1))}. Informe em Energia (ou cole a tabela da Celesc) antes de mandar — o total se atualiza sozinho.`) : null,
      !r.pix ? h('p', { class: 'nota' }, 'Cadastre a chave PIX em Configurações para ela ir junto na mensagem.') : null,
      ...blocosGrupo,
      h('div', { class: 'visoes fut-filtro' }, aba('falta', 'Falta pagar', faltam.filter(c => !c.pagador).length), aba('pagas', 'Pagas', pagas.length), aba('todas', 'Todas', doMes.length)),
      h('section', { class: 'fut-cob-lista' }, listaVer.length ? listaVer.map(cartao) : h('p', { class: 'caixa peq' }, ver === 'falta' ? 'Todo mundo pagou este mês. 🎉' : 'Nada aqui.')),
      antigas.length ? h('section', {}, h('h2', { class: 'fut-sub' }, 'Ainda em aberto de meses anteriores'), h('div', { class: 'fut-cob-lista' }, antigas.map(cartao))) : null);
  }

  /* ---------- Caixa ---------- */
  async function caixa(params) {
    const { h, api, mostrar, reais, dataBR, campo, aoEnviar, avisar, carregando, hojeISO } = K();
    carregando();
    const comp = params.get('mes') || compHoje();
    const r = await api('future.lancamentos', { mes: comp });
    const rec = r.lista.filter(l => l.tipo === 'receita'), des = r.lista.filter(l => l.tipo === 'despesa');
    const soma = ls => ls.reduce((a, l) => a + l.valor, 0);
    const tipoSel = campo('tipo', 'Tipo', 'despesa', { opcoes: [['despesa', 'Saiu (despesa)'], ['receita', 'Entrou (receita)']] });
    const catSel = h('select', { id: 'f-categoria', name: 'categoria' });
    const encher = t => catSel.replaceChildren(...r.categorias[t].map(c => h('option', {}, c)));
    encher('despesa');
    tipoSel.querySelector('select').addEventListener('change', ev => encher(ev.target.value));
    const form = h('form', { class: 'campos', novalidate: true }, tipoSel,
      h('div', {}, h('label', { for: 'f-categoria' }, 'Categoria'), catSel),
      campo('valor', 'Valor (R$)', '', { modo: 'decimal', obrigatorio: true }),
      campo('data', 'Data', comp === compHoje() ? hojeISO() : comp + '-10', { tipo: 'date' }),
      campo('unidade', 'Unidade (opcional)', '', { dica: 'ex.: 204 ou Sala 2' }),
      campo('pessoa', 'Pessoa / fornecedor', ''),
      campo('forma', 'Forma', 'Pix', { opcoes: [['Pix', 'Pix'], ['Dinheiro', 'Dinheiro'], ['Transferência', 'Transferência'], ['Boleto', 'Boleto'], ['Cartão', 'Cartão']] }),
      campo('descricao', 'Descrição', '', { largo: true }),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Lançar'), h('p', { class: 'erro' })));
    aoEnviar(form, async fd => { await api('future.lancamento.salvar', { competencia: comp, ...Object.fromEntries(fd.entries()) }); avisar('Lançado.'); K().rota(); });
    const lista = (titulo, ls, cls) => h('section', { class: 'caixa' }, h('h2', {}, `${titulo} · ${reais(soma(ls))}`),
      K().tabela(['Data', 'Categoria', 'Unidade', 'Descrição', 'Valor', ''], ls, l => [
        h('td', { 'data-r': 'Data' }, dataBR(l.data)), h('td', { 'data-r': 'Categoria' }, l.categoria),
        h('td', { 'data-r': 'Unidade' }, l.unidade || '—'), h('td', { 'data-r': 'Descrição' }, [l.descricao, l.pessoa].filter(Boolean).join(' · ') || '—', l.origem === 'planilha antiga' ? h('span', { class: 'peq' }, ' (planilha antiga)') : null),
        h('td', { class: 'num ' + cls, 'data-r': 'Valor' }, reais(l.valor)),
        h('td', {}, K().botao('Excluir', async ev => { ev.stopPropagation(); if (!confirm('Excluir este lançamento?')) return; await api('future.lancamento.salvar', { id: l.id, excluir: true }); K().rota(); }, 'mini sec'))
      ], () => {}, 'Nada lançado.'));
    mostrar(topo('Edifício Future', 'Caixa do prédio', 'Tudo o que entrou e saiu no mês'), navMes(comp, 'caixa', params),
      h('section', { class: 'fin-nums' }, numero('verde', reais(soma(rec)), 'Entrou'), numero('vermelho', reais(soma(des)), 'Saiu'),
        numero(soma(rec) - soma(des) >= 0 ? 'dourado' : 'vermelho', reais(soma(rec) - soma(des)), 'Saldo'), numero('azul', String(r.lista.length), 'Lançamentos')),
      K().secao('+ Novo lançamento', form, !r.lista.length), lista('Entrou', rec, 'pos'), lista('Saiu', des, 'neg'));
  }

  /* ---------- Energia ---------- */
  async function energia(params) {
    const { h, api, mostrar, reais, avisar, carregando } = K();
    carregando();
    const comp = params.get('mes') || compMais(compHoje(), -1);
    const [res, rel] = await Promise.all([api('future.resumo', {}), api('future.relatorio', { mes: comp })]);
    const valores = {}; rel.energia.forEach(e => { valores[e.unidade] = e; });
    const aps = res.unidades.filter(u => u.situacao !== 'proprio' || /^AP/.test(u.id));
    const linhas = aps.map(u => {
      const e = valores[u.id];
      const f = h('form', { class: 'fut-pagar', novalidate: true },
        h('input', { name: 'valor', value: e ? String(e.valor).replace('.', ',') : '', placeholder: 'R$', inputmode: 'decimal', 'aria-label': 'Valor ' + u.id }),
        h('input', { name: 'kwh', value: e && e.kwh ? e.kwh : '', placeholder: 'kWh', inputmode: 'numeric', 'aria-label': 'kWh ' + u.id }),
        h('button', { type: 'submit', class: 'btn mini sec' }, e ? 'Atualizar' : 'Lançar'), h('span', { class: 'erro' }));
      K().aoEnviar(f, async fd => { await api('future.energia.salvar', { competencia: comp, unidade: u.id, ...Object.fromEntries(fd.entries()) }); avisar(u.id + ': energia salva.'); K().rota(); });
      return h('tr', {}, h('td', { 'data-r': 'Unidade' }, h('strong', {}, u.id), h('div', { class: 'peq' }, u.locatario || (SIT[u.situacao] || [''])[0])), h('td', { 'data-r': 'Valor' }, f));
    });
    const colar = h('form', { class: 'campos', novalidate: true },
      h('div', { class: 'largo' }, h('label', { for: 'f-tabela' }, 'Cole aqui a tabela da Celesc (uma linha por unidade: UC ou apartamento e o valor)'),
        h('textarea', { id: 'f-tabela', name: 'texto', rows: 6, placeholder: '424093201190  DIEGO  R$ 145,30\nAP 102  98,70\n…' })),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Lançar as contas de ' + nomeMes(comp)), h('p', { class: 'erro' })));
    K().aoEnviar(colar, async fd => {
      const x = await api('future.energia.colar', { competencia: comp, texto: fd.get('texto') });
      avisar(`${x.lancadas.length} conta(s) lançada(s).` + (x.naoEntendidas.length ? ` ${x.naoEntendidas.length} linha(s) não entendida(s): ${x.naoEntendidas.slice(0, 3).join(' | ')}` : ''), !!x.naoEntendidas.length);
      K().rota();
    });
    mostrar(topo('Edifício Future', 'Energia', 'Conta da Celesc por unidade · o valor entra na cobrança do mês seguinte'), navMes(comp, 'energia', params),
      K().secao('📋 Colar a tabela da Celesc (lança tudo de uma vez)', colar, !rel.energia.length),
      h('section', { class: 'fin-nums' },
        numero('dourado', reais(rel.energiaTotal), 'Energia das unidades', `${rel.energia.length} conta(s) lançada(s)`),
        numero(rel.energiaTotal > rel.energiaAnt && rel.energiaAnt ? 'vermelho' : 'verde', reais(rel.energiaAnt), 'Mês anterior', rel.energiaAnt ? (rel.energiaTotal >= rel.energiaAnt ? '▲ ' : '▼ ') + Math.abs(Math.round(((rel.energiaTotal - rel.energiaAnt) / rel.energiaAnt) * 100)) + '%' : ''),
        numero('vermelho', reais(rel.energiaDespesa), 'Pago à Celesc no mês', 'despesas "Energia" do caixa'),
        numero('azul', reais(res.serie.reduce((a, s) => a + s.energia, 0)), '12 meses', 'despesas de energia')),
      h('section', { class: 'caixa' }, h('h2', {}, 'Contas de ' + nomeMes(comp)),
        h('table', { class: 'tabela' }, h('thead', {}, h('tr', {}, h('th', {}, 'Unidade'), h('th', {}, 'Valor da conta'))), h('tbody', {}, linhas))));
  }

  /* ---------- Relatório do mês (para imprimir / mandar) ---------- */
  async function relatorio(params) {
    const { h, api, mostrar, reais, dataBR, carregando, tabela } = K();
    carregando();
    const comp = params.get('mes') || compMais(compHoje(), -1);
    const r = await api('future.relatorio', { mes: comp });
    const varia = (a, b) => b ? h('span', { class: 'fut-var ' + (a >= b ? 'sobe' : 'desce') }, (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round(((a - b) / b) * 100)) + '% vs. ' + curto(r.anterior)) : null;
    const barras = (itens, total, cls) => h('ul', { class: 'fut-barras' }, itens.map(i => h('li', {}, h('span', {}, i.categoria || i.unidade), h('i', { class: cls, 'data-w': total ? Math.max(2, Math.round((i.valor / total) * 100)) : 0 }), h('b', {}, reais(i.valor)))));
    const pagas = r.cobrancas.filter(c => c.situacao === 'paga').length;
    mostrar(
      h('div', { class: 'barra nao-imprimir' }, navMes(comp, 'relatorio', params), K().botao('Imprimir / salvar PDF', () => window.print())),
      h('article', { class: 'fut-rel' },
        h('header', { class: 'fut-rel-cab' }, h('div', {}, h('span', { class: 'carteira-kicker' }, 'Edifício Future · relatório mensal'), h('h1', {}, nomeMes(comp).replace(/^./, x => x.toUpperCase()))),
          h('p', { class: 'peq' }, 'Gerado em ' + dataBR(K().hojeISO()))),
        h('section', { class: 'fin-nums' },
          numero('verde', reais(r.receitas), 'Receitas', '', null), numero('vermelho', reais(r.despesas), 'Despesas'),
          numero(r.receitas - r.despesas >= 0 ? 'dourado' : 'vermelho', reais(r.receitas - r.despesas), 'Resultado'),
          numero('azul', `${r.ocupacao.ocupadas}/${r.ocupacao.alugaveis}`, 'Ocupação', r.ocupacao.disponiveis.length ? 'livres: ' + r.ocupacao.disponiveis.join(', ') : 'todas ocupadas')),
        h('p', { class: 'fut-comp' }, 'Receitas ', varia(r.receitas, r.receitasAnt), ' · Despesas ', varia(r.despesas, r.despesasAnt), ' · Energia ', varia(r.energiaTotal, r.energiaAnt)),
        h('div', { class: 'fut-duas' },
          h('section', { class: 'caixa' }, h('h2', {}, 'De onde veio o dinheiro'), r.receitasCat.length ? barras(r.receitasCat, r.receitas, 'b-rec') : h('p', { class: 'peq' }, 'Sem receitas lançadas.')),
          h('section', { class: 'caixa' }, h('h2', {}, 'Para onde foi'), r.despesasCat.length ? barras(r.despesasCat, r.despesas, 'b-des') : h('p', { class: 'peq' }, 'Sem despesas lançadas.'))),
        h('div', { class: 'fut-duas' },
          h('section', { class: 'caixa' }, h('h2', {}, `Aluguéis do mês · ${pagas} de ${r.cobrancas.length} pagos`),
            tabela(['Unidade', 'Locatário', 'Cobrado', 'Recebido', 'Situação'], r.cobrancas, c => [
              h('td', {}, c.unidade), h('td', {}, c.pessoa || '—'), h('td', { class: 'num' }, reais(c.total)), h('td', { class: 'num' }, reais(c.pago)),
              h('td', {}, h('span', { class: 'tag ' + COB[c.situacao][1] }, COB[c.situacao][0]))], () => {}, 'Sem cobranças neste mês.')),
          h('section', { class: 'caixa' }, h('h2', {}, `Energia por unidade · ${reais(r.energiaTotal)}`),
            r.energia.length ? barras(r.energia, Math.max(1, ...r.energia.map(e => e.valor)), 'b-ene') : h('p', { class: 'peq' }, 'Contas de energia não lançadas para este mês.'),
            h('p', { class: 'peq' }, `Pago à Celesc (despesa do caixa): ${reais(r.energiaDespesa)}`))),
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
        h('td', { 'data-r': 'Situação' }, h('span', { class: 'tag ' + (p.situacao === 'atual' ? 'ok' : '') }, p.situacao === 'atual' ? 'mora agora' : 'saiu'))
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

  /* ---------- Configurações ---------- */
  async function config() {
    const { h, api, mostrar, avisar, carregando } = K();
    carregando();
    const c = await api('future.config', {});
    const f = h('form', { class: 'campos', novalidate: true },
      h('fieldset', { class: 'largo' }, h('legend', {}, 'Quem vê o painel do Edifício Future'),
        c.usuarios.map(u => h('label', { class: 'marcar' }, h('input', { type: 'checkbox', name: 'u', value: u.usuario, checked: u.acesso }), u.nome + ' (' + u.usuario + ')'))),
      K().campo('dia_venc', 'Dia de vencimento do aluguel', String(c.dia_venc), { tipo: 'number' }),
      K().campo('pix', 'Chave PIX (vai na mensagem de cobrança)', c.pix, { dica: 'CNPJ, e-mail, telefone ou chave aleatória' }),
      K().campo('taxas_desc', 'O que entra nas taxas', c.taxas_desc),
      h('div', { class: 'acoes largo' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), h('p', { class: 'erro' })));
    K().aoEnviar(f, async fd => { await api('future.config', { salvar: true, usuarios: fd.getAll('u'), dia_venc: fd.get('dia_venc'), pix: fd.get('pix'), taxas_desc: fd.get('taxas_desc') }); avisar('Configurações salvas.'); K().rota(); });
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
      h('section', { class: 'caixa' }, h('h2', {}, 'Pastas do Drive'), drive),
      h('section', { class: 'caixa' }, h('h2', {}, 'Importar da planilha antiga'), imp),
      h('section', { class: 'caixa' }, h('h2', {}, 'Acesso e vencimento'), f),
      h('section', { class: 'caixa' }, h('h2', {}, 'Próximos passos (automação)'),
        h('ul', {}, h('li', {}, 'PIX agendados e recebidos no Gmail → baixa automática das cobranças (aguardando os e-mails de exemplo).'),
          h('li', {}, 'Cobranças e contas na pasta do Drive → leitura automática.'),
          h('li', {}, 'Relatório de energia que você vai mandar → importação para o histórico.'))));
  }

  window.FUTURE = {
    async tela(partes, params) {
      const [sub, id] = partes;
      switch (sub) {
        case 'unidades': return unidades(params);
        case 'unidade': return unidade(id);
        case 'cobrancas': return cobrancas(params);
        case 'caixa': return caixa(params);
        case 'energia': return energia(params);
        case 'relatorio': return relatorio(params);
        case 'pessoas': return pessoas(params);
        case 'config': return config();
        default: return visao(params);
      }
    }
  };
})();
