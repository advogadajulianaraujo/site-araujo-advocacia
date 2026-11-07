/* Painel Araújo Advocacia — 8.12: telas de gestão
   CRM / Funil · Propostas · Calculadoras · Transcrição e resumos · Peças com IA · Biblioteca de prompts ·
   Padrões operacionais · Recibos · Painel financeiro.
   Carrega ANTES do painel.js e usa as ferramentas dele (window.PAINEL_KIT), como o future.js. */
(() => {
  'use strict';
  const K = () => window.PAINEL_KIT;
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const din = v => v === null || v === undefined ? '•••••' : BRL.format(+v || 0);
  const num = v => { const n = parseFloat(String(v || '').replace(/\s/g, '').replace(/R\$/i, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dataBR = iso => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const mesBR = m => { const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return m ? n[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4) : ''; };
  const primeiro = n => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };
  const zap = (tel, msg) => { const t = K().telefoneWhats(tel); return t ? `https://wa.me/${t}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`; };
  const copiar = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); K().avisar(ok || 'Copiado.'); } catch (e) { K().avisar('Não consegui copiar: selecione o texto e use Ctrl+C.', true); } };
  const dialogo = (cls, ...filhos) => {
    const { h } = K();
    const d = h('dialog', { class: 'dialogo g-dialogo ' + (cls || '') },
      h('button', { type: 'button', class: 'g-fechar', 'aria-label': 'Fechar', onclick: () => d.close() }, '×'), ...filhos);
    d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
    document.body.append(d); d.showModal(); return d;
  };
  const topo = (kicker, titulo, texto, ...acoes) => {
    const { h } = K();
    return h('header', { class: 'carteira-topo' },
      h('div', { class: 'carteira-tit' }, h('span', { class: 'carteira-kicker' }, kicker), h('h1', {}, titulo), texto ? h('p', {}, texto) : null),
      acoes.length ? h('div', { class: 'carteira-acoes' }, ...acoes) : null);
  };
  const numero = (cls, valor, rotulo, sub) => { const { h } = K(); return h('div', { class: 'fin-num ' + cls }, h('span', { class: 'fin-num-rot' }, rotulo), h('b', {}, valor), sub ? h('span', { class: 'fin-num-sub' }, sub) : null); };
  const iaFaixa = () => { const { h } = K(); return h('div', { class: 'g-ia-faixa' }, h('strong', {}, 'A IA está aqui para nos auxiliar, nunca para nos substituir.'), ' Ela aprimora a escrita e ajuda a enxergar pontos do processo; tudo o que ela escreve é rascunho: confira fatos, artigos e datas antes de usar.'); };
  /** Markdown simples → elementos (títulos, listas, tabelas, negrito). Nada de HTML vindo da IA entra na tela. */
  function mdParaDom(md) {
    const { h } = K();
    const inline = t => { const out = []; String(t).split(/(\*\*[^*]+\*\*)/g).forEach(p => { if (/^\*\*[^*]+\*\*$/.test(p)) out.push(h('strong', {}, p.slice(2, -2))); else if (p) out.push(p); }); return out; };
    const box = h('div', { class: 'g-md' }); const linhas = String(md || '').replace(/\r/g, '').split('\n'); let i = 0, lista = null;
    while (i < linhas.length) {
      const s = linhas[i].trim(); let m;
      if (!s) { lista = null; i++; continue; }
      if (/^\|/.test(s)) {
        const rows = [];
        while (i < linhas.length && /^\s*\|/.test(linhas[i])) { const c = linhas[i].trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim()); if (!c.every(x => /^:?-{2,}:?$/.test(x) || !x)) rows.push(c); i++; }
        if (rows.length) box.append(h('div', { class: 'g-md-tab' }, h('table', { class: 'tabela' }, h('thead', {}, h('tr', {}, rows[0].map(c => h('th', {}, inline(c.replace(/\*\*/g, '')))))),
          h('tbody', {}, rows.slice(1).map(r => h('tr', {}, r.map(c => h('td', {}, inline(c)))))))));
        lista = null; continue;
      }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(s))) { box.append(h(m[1].length <= 2 ? 'h3' : 'h4', {}, m[2].replace(/\*\*/g, ''))); lista = null; }
      else if ((m = /^[-*•]\s+(.*)$/.exec(s))) { if (!lista || lista.tagName !== 'UL') { lista = h('ul', {}); box.append(lista); } lista.append(h('li', {}, inline(m[1]))); }
      else if ((m = /^\d+[.)]\s+(.*)$/.exec(s))) { if (!lista || lista.tagName !== 'OL') { lista = h('ol', {}); box.append(lista); } lista.append(h('li', {}, inline(m[1]))); }
      else if ((m = /^>\s?(.*)$/.exec(s))) { box.append(h('blockquote', {}, inline(m[1]))); lista = null; }
      else if (/^---+$/.test(s)) { box.append(h('hr')); lista = null; }
      else { box.append(h('p', {}, inline(s))); lista = null; }
      i++;
    }
    return box;
  }

  /* ================================================================ */
  /* CRM / Funil                                                       */
  /* ================================================================ */
  const COR_ETAPA = { novo: '#2f6fd0', contato: '#5b6ee1', consulta: '#7a4fc0', atendido: '#1d8a8a', proposta: '#c98a12', negociacao: '#d0602d', ganho: '#1f8a4c', perdido: '#9aa0aa' };
  /** A política de segurança do painel bloqueia style="…" no HTML; a cor vai pela propriedade CSS (CSSOM), que é permitida. */
  const cor = (el, c) => { el.style.setProperty('--cor', c); return el; };
  const PROX_ETAPA = { novo: 'contato', contato: 'consulta', consulta: 'atendido', atendido: 'proposta', proposta: 'negociacao', negociacao: 'ganho' };
  const ESCRITORIO_LOCAL = 'no escritório (Rua Silvino Moreira Lima Sobrinho, 888, Sala 04, Humaitá, Tubarão/SC, em frente à nova rodoviária)';
  function msgLead(l) {
    const n = primeiro(l.nome), assunto = l.assunto ? ` sobre ${String(l.assunto).toLowerCase()}` : '';
    const quando = l.consulta_em ? `${dataBR(l.consulta_em.slice(0, 10))}${l.consulta_em.length > 10 ? ' às ' + l.consulta_em.slice(11, 16) : ''}` : '[data e hora]';
    switch (l.etapa) {
      case 'consulta': return `Olá, ${n}! Confirmando a nossa conversa em ${quando}, ${ESCRITORIO_LOCAL} ou por vídeo, como combinamos. Se puder, traga um documento com foto e os documentos do caso. Qualquer imprevisto, me avise por aqui. Araújo Advocacia`;
      case 'atendido': return `Olá, ${n}! Obrigada pela conversa. Como combinamos, vou te mandar a proposta para o seu caso. Se lembrar de algum documento ou detalhe, pode me mandar por aqui. Araújo Advocacia`;
      case 'proposta': case 'negociacao': return `Olá, ${n}! Tudo bem? Conseguiu ver a proposta que enviamos? Se ficou alguma dúvida, estou à disposição para explicar. Araújo Advocacia`;
      case 'ganho': return `Olá, ${n}! Seja bem-vindo(a) ao escritório. Vou te mandar o contrato e a procuração para assinatura e um guia rápido de como trabalhamos. Qualquer dúvida, é só chamar. Araújo Advocacia`;
      default: return `Olá, ${n}! Aqui é do escritório Araújo Advocacia. Recebemos o seu contato${assunto}. Podemos conversar agora? Se preferir, me diga o melhor dia e horário.`;
    }
  }
  async function telaCrm(params) {
    const { h, api, apiFresco, mostrar, carregando, avisar, botao, sessao, rota } = K();
    carregando();
    const [r, equipe] = await Promise.all([api('crm.listar', {}), api('equipe.listar', {}).catch(() => [])]);
    const m = r.metricas, nomeE = Object.fromEntries(r.etapas), rh = sessao.usuario.pode.ocultarValores;
    const visao = params.get('ver') || (() => { try { return localStorage.getItem('crm_visao') || 'funil'; } catch (e) { return 'funil'; } })();
    try { localStorage.setItem('crm_visao', visao); } catch (e) { /* ok */ }
    const busca = (params.get('q') || '').trim(), canal = params.get('canal') || '', resp = params.get('resp') || '';
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => v ? q.set(k, v) : q.delete(k)); location.hash = '#/crm' + (q.toString() ? '?' + q : ''); };
    const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const filtrados = r.leads.filter(l => (!busca || norm([l.nome, l.telefone, l.assunto, l.area].join(' ')).includes(norm(busca))) && (!canal || l.canal === canal) && (!resp || l.responsavel === resp));
    const recarregar = async () => { await apiFresco('crm.listar', {}); rota(); };
    const mover = async (l, etapa) => {
      if (etapa === l.etapa) return;
      if (etapa === 'perdido') return dialogoPerdido(l, recarregar);
      try { await api('crm.etapa', { id: l.id, etapa }); avisar(`${primeiro(l.nome)} → ${nomeE[etapa]}`); if (etapa === 'ganho' && !l.cliente_id) avisar('Fechou! Use "Virou cliente" no cartão para criar o cadastro e gerar o contrato.'); recarregar(); }
      catch (e) { avisar(e.message, true); }
    };
    const cartao = l => {
      const c = h('article', { class: 'crm-card temp-' + (l.temperatura || 'morno') + (l.atrasado ? ' atrasado' : ''), draggable: 'true', tabindex: 0,
        onclick: () => dialogoLead(l, r, equipe, recarregar), onkeydown: ev => { if (ev.key === 'Enter') dialogoLead(l, r, equipe, recarregar); } },
        h('div', { class: 'crm-card-topo' }, h('strong', {}, l.nome), l.valor_estimado && !rh ? h('span', { class: 'crm-valor' }, din(l.valor_estimado)) : null),
        h('div', { class: 'crm-tags' }, l.area ? h('span', { class: 'tag' }, l.area) : null, l.canal ? h('span', { class: 'tag sec' }, l.canal.replace(/ \(.*\)$/, '')) : null),
        l.assunto ? h('p', { class: 'crm-assunto' }, String(l.assunto).slice(0, 90)) : null,
        l.proxima_acao ? h('p', { class: 'crm-prox' + (l.atrasado ? ' atrasado' : '') }, '→ ', l.proxima_acao.slice(0, 80), l.proxima_data ? h('span', {}, ' · ' + dataBR(l.proxima_data)) : null) : null,
        h('div', { class: 'crm-card-pe' },
          h('span', { class: 'peq' }, l.dias_parado >= 7 && !['ganho', 'perdido'].includes(l.etapa) ? `⏳ ${l.dias_parado} dias sem mexer` : (l.responsavel || '')),
          h('span', { class: 'crm-bts' },
            l.telefone ? h('a', { class: 'btn mini wa', href: zap(l.telefone, msgLead(l)), target: '_blank', rel: 'noopener', title: 'Mensagem pronta para esta etapa', onclick: ev => ev.stopPropagation() }, 'WhatsApp') : null,
            PROX_ETAPA[l.etapa] ? h('button', { type: 'button', class: 'btn mini sec', title: 'Passar para ' + nomeE[PROX_ETAPA[l.etapa]], onclick: ev => { ev.stopPropagation(); mover(l, PROX_ETAPA[l.etapa]); } }, '→') : null)));
      c.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', l.id); c.classList.add('arrastando'); });
      c.addEventListener('dragend', () => c.classList.remove('arrastando'));
      return c;
    };
    const coluna = (id, itens, extra) => {
      const col = h('section', { class: 'crm-col', 'data-etapa': id },
        h('header', {}, h('span', { class: 'crm-ponto' }), h('strong', {}, nomeE[id]), h('span', { class: 'visao-n' }, String(itens.length)),
          !rh && itens.some(l => l.valor_estimado) ? h('span', { class: 'peq crm-col-valor' }, din(itens.reduce((t, l) => t + num(l.valor_estimado), 0))) : null),
        h('div', { class: 'crm-col-corpo' }, itens.length ? itens.map(cartao) : h('p', { class: 'peq crm-vazio' }, 'Arraste um cartão para cá')), extra || null);
      col.style.setProperty('--cor', COR_ETAPA[id]);
      col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('alvo'); });
      col.addEventListener('dragleave', () => col.classList.remove('alvo'));
      col.addEventListener('drop', ev => { ev.preventDefault(); col.classList.remove('alvo'); const l = r.leads.find(x => x.id === ev.dataTransfer.getData('text/plain')); if (l) mover(l, id); });
      return col;
    };
    const ord = (a, b) => (a.atrasado === b.atrasado ? 0 : a.atrasado ? -1 : 1) || String(a.proxima_data || '9999').localeCompare(String(b.proxima_data || '9999'));
    const recente = l => Date.now() - Date.parse(l.ganho_em || l.perdido_em || l.atualizado_em || l.criado_em) < 45 * 86400000;
    let corpo;
    if (visao === 'lista') {
      corpo = K().tabela(['Contato', 'Etapa', 'Canal', 'Próxima ação', 'Responsável', 'Entrou'], filtrados, l => [
        h('td', { 'data-r': 'Contato' }, h('strong', {}, l.nome), h('div', { class: 'peq' }, [l.telefone, l.area].filter(Boolean).join(' · '))),
        h('td', { 'data-r': 'Etapa' }, cor(h('span', { class: 'tag crm-etapa' }, nomeE[l.etapa] || l.etapa), COR_ETAPA[l.etapa]), l.etapa === 'perdido' && l.motivo_perda ? h('div', { class: 'peq' }, l.motivo_perda) : null),
        h('td', { 'data-r': 'Canal' }, l.canal || '—'),
        h('td', { 'data-r': 'Próxima ação' }, l.proxima_acao || '—', l.proxima_data ? h('div', { class: 'peq' + (l.atrasado ? ' erro' : '') }, dataBR(l.proxima_data)) : null),
        h('td', { 'data-r': 'Responsável' }, l.responsavel || '—'),
        h('td', { 'data-r': 'Entrou' }, dataBR(String(l.criado_em).slice(0, 10)))
      ], l => dialogoLead(l, r, equipe, recarregar), 'Nenhum contato com esse filtro.');
    } else if (visao === 'metricas') {
      corpo = blocoMetricasCrm(r, nomeE);
    } else {
      const quadro = h('div', { class: 'crm-quadro' },
        ['novo', 'contato', 'consulta', 'atendido', 'proposta', 'negociacao'].map(id => coluna(id, filtrados.filter(l => l.etapa === id).sort(ord))),
        coluna('ganho', filtrados.filter(l => l.etapa === 'ganho' && recente(l))),
        coluna('perdido', filtrados.filter(l => l.etapa === 'perdido' && recente(l))));
      corpo = h('div', {}, h('p', { class: 'peq crm-dica' }, 'Arraste o cartão para mudar de etapa (ou use →). Clique para ver tudo, anotar, gerar a proposta ou transformar em cliente. "Contrato fechado" e "Não fechou" mostram os últimos 45 dias.'),
        K().comSetas ? K().comSetas(quadro) : quadro);
    }
    const aba = (id, rot) => h('button', { type: 'button', role: 'tab', class: 'visao-bt' + (visao === id ? ' ativo' : ''), 'aria-selected': String(visao === id), onclick: () => ir({ ver: id }) }, rot);
    const fBusca = h('form', { class: 'crm-filtros', role: 'search' },
      h('input', { type: 'search', name: 'q', value: busca, placeholder: 'Buscar nome, telefone ou assunto', 'aria-label': 'Buscar contatos' }),
      h('select', { name: 'canal', 'aria-label': 'Canal', onchange: ev => ir({ canal: ev.target.value }) }, h('option', { value: '' }, 'Todos os canais'), r.canais.map(c => h('option', { value: c, selected: c === canal }, c))),
      h('select', { name: 'resp', 'aria-label': 'Responsável', onchange: ev => ir({ resp: ev.target.value }) }, h('option', { value: '' }, 'Toda a equipe'), equipe.map(p => h('option', { value: p.usuario, selected: p.usuario === resp }, p.nome))));
    fBusca.addEventListener('submit', ev => { ev.preventDefault(); ir({ q: fBusca.q.value.trim() }); });
    const sinal = m.atrasados ? h('div', { class: 'nota alerta crm-alerta' }, `⚠ ${m.atrasados} contato(s) com a próxima ação atrasada`, m.parados ? ` e ${m.parados} parado(s) há 7 dias ou mais` : '', '. Quem responde primeiro fecha mais: comece por eles.') : null;
    mostrar(
      topo('Relacionamento', 'CRM · Funil de atendimento', 'Do primeiro contato ao contrato assinado: cada pessoa que procura o escritório, a próxima ação e onde estamos perdendo clientes.',
        botao('+ Novo contato', () => dialogoLead(null, r, equipe, recarregar), 'dourado'),
        botao('Proposta de honorários', () => dialogoProposta(null, recarregar), 'sec')),
      h('section', { class: 'fin-nums crm-nums' },
        numero('azul', String(m.abertos), 'Em aberto', rh ? 'no funil' : (m.valorAberto ? din(m.valorAberto) + ' em propostas/estimativas' : 'no funil')),
        numero('dourado', String(m.novosMes), 'Novos no mês', 'contatos que chegaram'),
        numero('verde', String(m.ganhosMes), 'Fechados no mês', 'contratos assinados'),
        numero(m.conversao !== null && m.conversao < 30 ? 'vermelho' : 'verde', m.conversao === null ? '—' : m.conversao + '%', 'Taxa de fechamento', 'últimos 180 dias'),
        numero(m.respostaHoras !== null && m.respostaHoras > 2 ? 'vermelho' : 'azul', m.respostaHoras === null ? '—' : (m.respostaHoras < 1 ? Math.round(m.respostaHoras * 60) + ' min' : m.respostaHoras + ' h'), 'Tempo de resposta', 'mediana até o 1º contato')),
      sinal,
      h('section', { class: 'caixa crm-corpo' },
        h('div', { class: 'crm-barra' }, h('div', { class: 'visoes', role: 'tablist' }, aba('funil', 'Funil'), aba('lista', 'Lista'), aba('metricas', 'Números e motivos')), visao !== 'metricas' ? fBusca : null),
        corpo));
  }
  function blocoMetricasCrm(r, nomeE) {
    const { h, grafBarras } = K();
    const m = r.metricas;
    const etapas = ['novo', 'contato', 'consulta', 'atendido', 'proposta', 'negociacao', 'ganho'];
    const tot = etapas.map(e => m.porEtapa[e] ? m.porEtapa[e].n : 0);
    // funil acumulado: quantos chegaram pelo menos até cada etapa (ganhos contam em todas)
    const chegaram = etapas.map((e, i) => tot.slice(i).reduce((a, b) => a + b, 0));
    const max = Math.max(1, chegaram[0]);
    const funil = h('div', { class: 'crm-funil' }, etapas.map((e, i) => {
      const b = h('div', { class: 'crm-funil-barra' }, h('span', {}, nomeE[e]), h('b', {}, String(chegaram[i])), i ? h('em', {}, chegaram[i - 1] ? Math.round(chegaram[i] / chegaram[i - 1] * 100) + '% da etapa anterior' : '') : null);
      b.style.width = Math.max(28, chegaram[i] / max * 100) + '%'; b.style.setProperty('--cor', COR_ETAPA[e]); return b;
    }));
    const piorPasso = etapas.slice(1).map((e, i) => ({ de: nomeE[etapas[i]], para: nomeE[e], taxa: chegaram[i] ? chegaram[i + 1] / chegaram[i] : 1 })).filter(x => x.taxa < 1).sort((a, b) => a.taxa - b.taxa)[0];
    const melhorCanal = m.porCanal.filter(c => c.ganhos + c.perdidos >= 3).sort((a, b) => b.taxa - a.taxa)[0];
    const motivo = m.motivos[0];
    const ideias = [
      piorPasso ? `Onde mais perdemos: de "${piorPasso.de}" para "${piorPasso.para}" (só ${Math.round(piorPasso.taxa * 100)}% passam).` : null,
      melhorCanal ? `Canal que mais fecha: ${melhorCanal.canal} (${melhorCanal.taxa}% de fechamento). Vale investir mais nele.` : null,
      motivo ? `Motivo mais comum de não fechar: ${motivo.motivo} (${motivo.n}).` + (/Preço/.test(motivo.motivo) ? ' Mostre o valor do trabalho antes do preço e ofereça parcelamento.' : /respondeu/.test(motivo.motivo) ? ' Responda mais rápido e faça 3 tentativas de retorno.' : '') : null,
      m.respostaHoras !== null ? (m.respostaHoras > 2 ? `O 1º contato leva ${m.respostaHoras} h (mediana). O ideal é responder em até 15 minutos no horário de atendimento.` : 'Bom tempo de resposta: continue respondendo rápido.') : null,
      m.diasParaFechar !== null ? (m.diasParaFechar < 1 ? 'Em média, os contratos fecham no mesmo dia do primeiro contato.' : `Em média, um contrato fecha ${m.diasParaFechar} dia(s) depois do primeiro contato.`) : null
    ].filter(Boolean);
    return h('div', { class: 'crm-metricas' },
      h('div', { class: 'crm-met-grid' },
        h('div', { class: 'caixa' }, h('h3', {}, 'Funil (todos os contatos)'), funil),
        h('div', { class: 'caixa' }, h('h3', {}, 'O que os números dizem'), ideias.length ? h('ul', { class: 'crm-ideias' }, ideias.map(t => h('li', {}, t))) : h('p', { class: 'peq' }, 'Ainda há poucos contatos para tirar conclusões. Registre todos os contatos no funil: em 1 ou 2 meses os números aparecem.'))),
      h('div', { class: 'crm-met-grid' },
        h('div', { class: 'caixa' }, h('h3', {}, 'Por canal (últimos 180 dias)'),
          K().tabela(['Canal', 'Contatos', 'Fechados', 'Não fechou', 'Fechamento'], m.porCanal, c => [h('td', {}, c.canal), h('td', { class: 'num' }, String(c.leads)), h('td', { class: 'num' }, String(c.ganhos)), h('td', { class: 'num' }, String(c.perdidos)), h('td', { class: 'num' }, c.taxa === null ? '—' : c.taxa + '%')], () => {}, 'Sem contatos nos últimos 180 dias.')),
        h('div', { class: 'caixa' }, h('h3', {}, 'Por que não fechou (180 dias)'), m.motivos.length ? grafBarras(m.motivos.map(x => ({ nome: x.motivo, valor: x.n, cor: 'cinza' }))) : h('p', { class: 'peq' }, 'Nenhum contato marcado como "Não fechou" ainda.'))));
  }
  function dialogoPerdido(l, depois) {
    const { h, api, avisar } = K();
    const motivos = ['Preço / honorários', 'Escolheu outro escritório', 'Não tinha direito / caso inviável', 'Desistiu / sem interesse', 'Não respondeu', 'Fora da área ou da região', 'Outro'];
    const form = h('form', { class: 'g-form' }, h('h2', {}, `${l.nome}: não fechou`), h('p', { class: 'peq' }, 'O motivo mostra onde melhorar (aparece em "Números e motivos").'),
      h('div', { class: 'g-opcoes' }, motivos.map((m, i) => h('label', { class: 'g-opcao' }, h('input', { type: 'radio', name: 'motivo', value: m, required: true, checked: i === 0 }), m))),
      h('label', {}, 'Observação (opcional)'), h('textarea', { name: 'nota', rows: 2 }),
      h('div', { class: 'g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Marcar "Não fechou"')), h('p', { class: 'erro' }));
    const d = dialogo('', form);
    K().aoEnviar(form, async f => { await api('crm.etapa', { id: l.id, etapa: 'perdido', motivo: f.get('motivo'), nota: f.get('nota') }); d.close(); avisar('Anotado.'); depois(); });
  }
  function dialogoLead(l, r, equipe, depois) {
    const { h, api, avisar, campo, sessao } = K();
    const novo = !l; l = l || { etapa: 'novo', temperatura: 'morno', responsavel: sessao.usuario.usuario, proxima_data: hojeISO(), proxima_acao: 'Responder e entender o caso' };
    const nomeE = Object.fromEntries(r.etapas);
    const form = h('form', { class: 'g-form form-grade' },
      h('h2', { class: 'largo' }, novo ? 'Novo contato' : l.nome),
      novo ? null : h('div', { class: 'largo crm-etapas-linha' }, r.etapas.map(([id, nome]) => cor(h('button', { type: 'button', class: 'crm-etapa-bt' + (l.etapa === id ? ' ativa' : ''),
        onclick: async () => { if (id === l.etapa) return; if (id === 'perdido') { d.close(); dialogoPerdido(l, depois); return; } try { await api('crm.etapa', { id: l.id, etapa: id }); d.close(); avisar(`${primeiro(l.nome)} → ${nome}`); depois(); } catch (e) { avisar(e.message, true); } } }, nome), COR_ETAPA[id]))),
      campo('nome', 'Nome', l.nome, { obrigatorio: true, auto: 'off' }),
      campo('telefone', 'WhatsApp / telefone', l.telefone, { modo: 'tel', dica: '(48) 9…' }),
      campo('email', 'E-mail', l.email, { tipo: 'email' }),
      campo('canal', 'Como chegou', l.canal || '', { opcoes: [['', 'Escolha…']].concat(r.canais.map(c => [c, c])) }),
      campo('area', 'Área', l.area || '', { opcoes: [['', '—']].concat(r.areas.map(a => [a, a])) }),
      campo('temperatura', 'Chance de fechar', l.temperatura || 'morno', { opcoes: [['quente', '🔥 Alta'], ['morno', 'Média'], ['frio', '❄ Baixa']] }),
      campo('assunto', 'Assunto / caso', l.assunto, { largo: true, dica: 'Ex.: demitido sem receber a rescisão; aposentadoria negada', max: 300 }),
      campo('proxima_acao', 'Próxima ação', l.proxima_acao, { dica: 'Ex.: ligar para agendar a consulta' }),
      campo('proxima_data', 'Quando', l.proxima_data, { tipo: 'date' }),
      campo('consulta_em', 'Consulta marcada para', l.consulta_em || '', { tipo: 'datetime-local' }),
      campo('valor_estimado', 'Honorário estimado (R$)', l.valor_estimado || '', { modo: 'decimal', dica: 'opcional' }),
      campo('responsavel', 'Responsável', l.responsavel || '', { opcoes: [['', '—']].concat(equipe.map(p => [p.usuario, p.nome])) }),
      campo('indicado_por', 'Indicado por', l.indicado_por || '', { dica: 'se veio por indicação' }),
      h('div', { class: 'largo' }, h('label', { for: 'f-observacoes' }, 'Observações'), h('textarea', { id: 'f-observacoes', name: 'observacoes', rows: 3 }, l.observacoes || '')),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, novo ? 'Cadastrar no funil' : 'Salvar'),
        !novo && l.telefone ? h('a', { class: 'btn sec wa', href: zap(l.telefone, msgLead(l)), target: '_blank', rel: 'noopener' }, 'WhatsApp (mensagem da etapa)') : null),
      h('p', { class: 'erro largo' }));
    const extras = novo ? null : h('div', { class: 'crm-extra' },
      h('div', { class: 'crm-extra-acoes' },
        h('button', { type: 'button', class: 'btn sec', onclick: () => { d.close(); dialogoProposta(l, depois); } }, l.proposta_url ? 'Gerar nova proposta' : '📄 Gerar proposta de honorários'),
        l.proposta_url ? h('a', { class: 'btn sec', href: l.proposta_url, target: '_blank', rel: 'noopener' }, 'Abrir a proposta') : null,
        l.cliente_id ? h('a', { class: 'btn sec', href: '#/cliente/' + l.cliente_id, onclick: () => d.close() }, 'Abrir a ficha do cliente')
          : h('button', { type: 'button', class: 'btn dourado', onclick: async ev => {
            ev.target.disabled = true;
            try { const x = await api('crm.converter', { id: l.id }); d.close(); avisar(x.existente ? `Ligado ao cadastro de ${x.nome_existente}.` : 'Cadastro criado. Complete os dados e gere o contrato em Documentos e propostas.'); location.hash = '#/cliente/' + x.cliente_id; }
            catch (e) { avisar(e.message, true); ev.target.disabled = false; } } }, '✓ Virou cliente (criar cadastro)'),
        l.etapa !== 'perdido' ? h('button', { type: 'button', class: 'btn sec', onclick: () => { d.close(); dialogoPerdido(l, depois); } }, 'Não fechou') : null),
      (() => {
        const fa = h('form', { class: 'crm-anotar' }, h('label', { for: 'crm-nota' }, 'Anotar conversa'),
          h('textarea', { id: 'crm-nota', name: 'texto', rows: 2, placeholder: 'Ex.: liguei, vai mandar os documentos amanhã' }),
          h('div', { class: 'crm-anotar-linha' }, h('label', {}, h('input', { type: 'checkbox', name: 'contato', checked: l.etapa === 'novo' }), ' falei com a pessoa'),
            h('button', { type: 'submit', class: 'btn mini' }, 'Anotar')), h('p', { class: 'erro' }));
        K().aoEnviar(fa, async f => { await api('crm.anotar', { id: l.id, texto: f.get('texto'), contato: f.get('contato') === 'on' }); d.close(); avisar('Anotado.'); depois(); });
        return fa;
      })(),
      h('h3', {}, 'Histórico'), h('ol', { class: 'crm-hist' }, String(l.historico || '').split('\n').filter(Boolean).reverse().map(x => h('li', {}, x))),
      h('p', { class: 'peq' }, `Etapa: ${nomeE[l.etapa] || l.etapa} · entrou em ${dataBR(String(l.criado_em).slice(0, 10))}` + (l.motivo_perda ? ` · não fechou: ${l.motivo_perda}` : '')));
    const d = dialogo('crm-dialogo', form, extras);
    K().aoEnviar(form, async f => {
      const lead = { id: novo ? undefined : l.id };
      ['nome', 'telefone', 'email', 'canal', 'area', 'temperatura', 'assunto', 'proxima_acao', 'proxima_data', 'consulta_em', 'valor_estimado', 'responsavel', 'indicado_por', 'observacoes'].forEach(k => { lead[k] = f.get(k) || ''; });
      if (!lead.telefone && !lead.email) throw new Error('Informe o telefone ou o e-mail.');
      try { await api('crm.salvar', { lead }); }
      catch (e) { if (/Já existe um contato/.test(e.message) && confirm(e.message + '\n\nCadastrar mesmo assim?')) await api('crm.salvar', { lead, mesmoAssim: true }); else throw e; }
      d.close(); avisar(novo ? 'Contato no funil.' : 'Salvo.'); depois();
    });
  }

  /* ---------- Proposta de honorários ---------- */
  function dialogoProposta(l, depois) {
    const { h, api, avisar, campo } = K();
    const form = h('form', { class: 'g-form form-grade' },
      h('h2', { class: 'largo' }, 'Proposta de honorários'),
      h('p', { class: 'peq largo' }, 'Gera um documento no padrão do escritório (Google Docs + PDF), com o que está incluído, os honorários, como trabalhamos e a validade. ' + (l ? 'O cartão vai para "Proposta enviada".' : '')),
      l ? null : campo('nome', 'Para quem', '', { obrigatorio: true }),
      campo('area', 'Área', (l && l.area) || '', { opcoes: [['', 'Escolha…'], ['Trabalhista', 'Trabalhista'], ['Previdenciário', 'Previdenciário'], ['Família', 'Família'], ['Cível', 'Cível e consumidor'], ['Criminal', 'Criminal'], ['Empresarial', 'Empresarial']] }),
      campo('validade', 'Validade (dias)', '15', { modo: 'numeric' }),
      h('div', { class: 'largo' }, h('label', { for: 'f-objeto' }, 'Objeto (o serviço)'), h('textarea', { id: 'f-objeto', name: 'objeto', rows: 2, required: true, placeholder: 'Ex.: Ajuizamento de reclamação trabalhista contra a ex-empregadora para cobrança das verbas rescisórias, horas extras e FGTS.' }, (l && l.assunto) || '')),
      h('fieldset', { class: 'largo g-campo' }, h('legend', {}, 'Honorários'),
        h('div', { class: 'g-opcoes linha' }, [['fixo', 'Valor fixo'], ['exito', 'Só êxito (%)'], ['misto', 'Fixo + êxito'], ['mensal', 'Mensal (assessoria)']].map(([v, t], i) =>
          h('label', { class: 'g-opcao' }, h('input', { type: 'radio', name: 'forma', value: v, checked: i === 0, onchange: () => mostrarCampos() }), t))),
        h('div', { class: 'form-grade' },
          campo('valor', 'Valor total (R$)', (l && l.valor_estimado) || '', { modo: 'decimal' }),
          campo('entrada', 'Entrada (R$)', '', { modo: 'decimal', dica: 'opcional' }),
          campo('parcelas', 'Parcelas', '1', { modo: 'numeric' }),
          campo('percentual', 'Êxito (%)', '30', { modo: 'decimal' }),
          campo('mensal', 'Valor mensal (R$)', '', { modo: 'decimal' }),
          campo('dia', 'Vencimento (dia)', '10', { modo: 'numeric' }))),
      h('div', { class: 'largo' }, h('label', { for: 'f-inclui' }, 'O que está incluído (deixe em branco para usar o padrão da área; um item por linha)'), h('textarea', { id: 'f-inclui', name: 'inclui', rows: 3 })),
      h('div', { class: 'largo' }, h('label', { for: 'f-obs' }, 'Observações (opcional)'), h('textarea', { id: 'f-obs', name: 'obs', rows: 2 })),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Gerar a proposta')), h('p', { class: 'erro largo' }));
    const mostrarCampos = () => {
      const f = (form.querySelector('[name=forma]:checked') || {}).value;
      const vis = { valor: ['fixo', 'misto'], entrada: ['fixo', 'misto'], parcelas: ['fixo', 'misto'], percentual: ['exito', 'misto'], mensal: ['mensal'], dia: ['mensal'] };
      Object.entries(vis).forEach(([k, fs]) => { const el = form.querySelector('[name=' + k + ']'); if (el) el.closest('div').hidden = !fs.includes(f); });
    };
    mostrarCampos();
    const d = dialogo('', form);
    K().aoEnviar(form, async f => {
      const btn = form.querySelector('button[type=submit]'); btn.textContent = 'Gerando (até 1 min)…';
      try {
        const x = await api('crm.proposta', { lead_id: l ? l.id : '', nome: f.get('nome'), area: f.get('area'), objeto: f.get('objeto'), validade: f.get('validade'), inclui: f.get('inclui'), obs: f.get('obs'),
          honorarios: { forma: f.get('forma'), valor: num(f.get('valor')), entrada: num(f.get('entrada')), parcelas: f.get('parcelas'), percentual: f.get('percentual'), mensal: num(f.get('mensal')), dia: f.get('dia') } });
        d.close();
        dialogo('', h('h2', {}, 'Proposta pronta'), h('p', {}, `Proposta para ${x.nome} salva no Drive.`),
          h('div', { class: 'g-acoes' }, h('a', { class: 'btn', href: x.pdf, target: '_blank', rel: 'noopener' }, 'Abrir o PDF'), h('a', { class: 'btn sec', href: x.doc, target: '_blank', rel: 'noopener' }, 'Editar no Google Docs'),
            h('a', { class: 'btn sec wa', href: zap(x.telefone, x.mensagem), target: '_blank', rel: 'noopener' }, 'Mandar no WhatsApp')),
          h('p', { class: 'peq' }, 'O PDF é anexado à mão no WhatsApp (o arquivo não fica público).'));
        if (depois) depois();
      } finally { btn.textContent = 'Gerar a proposta'; }
    });
  }

  /* ================================================================ */
  /* Calculadoras                                                      */
  /* ================================================================ */
  const lerData = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  const iso = d => d.toISOString().slice(0, 10);
  const somaDias = (d, n) => new Date(d.getTime() + n * 86400000);
  const somaAnos = (d, n) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + n); return x; };
  const somaMes = (d, n) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + n); return x; };
  const anosCompletos = (a, b) => { let n = b.getUTCFullYear() - a.getUTCFullYear(); if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--; return Math.max(0, n); };
  const diasAviso = anos => Math.min(90, 30 + 3 * anos);
  const mesesEntre = (ini, fim) => { let n = 0, a = ini; while (n < 12) { const b = somaMes(a, 1); if (somaDias(b, -1) <= fim) { n++; a = b; } else { if ((fim - a) / 86400000 + 1 >= 15) n++; break; } } return Math.min(12, n); };
  function resultado(linhas, total, notas) {
    const { h } = K();
    return h('div', { class: 'calc-res' }, h('table', { class: 'tabela calc-tab' }, h('tbody', {}, linhas.map(([r, v]) => h('tr', {}, h('th', { scope: 'row' }, r), h('td', { class: 'num' }, typeof v === 'number' ? din(v) : v))),
      total !== null && total !== undefined ? h('tr', { class: 'calc-total' }, h('th', { scope: 'row' }, 'Total'), h('td', { class: 'num' }, typeof total === 'number' ? din(total) : total)) : null)),
      (notas || []).map(t => h('p', { class: 'peq' }, t)),
      h('div', { class: 'g-acoes' }, h('button', { type: 'button', class: 'btn mini sec', onclick: () => copiar(linhas.map(([r, v]) => r + ': ' + (typeof v === 'number' ? din(v) : v)).join('\n') + (total !== null && total !== undefined ? '\nTotal: ' + (typeof total === 'number' ? din(total) : total) : ''), 'Resultado copiado.') }, 'Copiar resultado')));
  }
  const CALCS = [
    ['rescisao', 'Rescisão trabalhista'], ['prescricao', 'Ainda dá tempo? (trabalhista)'], ['prazo', 'Prazo processual'],
    ['correcao', 'Correção e juros'], ['honorarios', 'Honorários e parcelas'], ['datas', 'Entre datas']
  ];
  function calcRescisao(out) {
    const { h, campo } = K();
    const form = h('form', { class: 'g-form form-grade' },
      campo('salario', 'Último salário (R$)', '', { modo: 'decimal', obrigatorio: true }),
      campo('admissao', 'Admissão', '', { tipo: 'date', obrigatorio: true }),
      campo('saida', 'Saída (último dia trabalhado)', '', { tipo: 'date', obrigatorio: true }),
      campo('motivo', 'Motivo', 'sem_justa', { opcoes: [['sem_justa', 'Dispensa sem justa causa'], ['pedido', 'Pedido de demissão'], ['acordo', 'Acordo (art. 484-A)'], ['justa', 'Justa causa'], ['indireta', 'Rescisão indireta']] }),
      campo('aviso', 'Aviso prévio', 'indenizado', { opcoes: [['indenizado', 'Indenizado'], ['trabalhado', 'Trabalhado / dispensado']] }),
      campo('vencidas', 'Férias vencidas (períodos)', '0', { opcoes: [['0', 'Nenhuma'], ['1', '1 período'], ['2', '2 períodos']] }),
      campo('fgts', 'Saldo do FGTS (R$)', '', { modo: 'decimal', dica: 'opcional: do extrato' }),
      campo('medias', 'Médias mensais (R$)', '', { modo: 'decimal', dica: 'horas extras, comissões… (opcional)' }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const base = num(form.salario.value) + num(form.medias.value), adm = lerData(form.admissao.value), saida = lerData(form.saida.value);
      let motivo = form.motivo.value; const indireta = motivo === 'indireta'; if (indireta) motivo = 'sem_justa';
      if (!(base > 0) || !adm || !saida || saida < adm) { out.replaceChildren(h('p', { class: 'erro' }, 'Confira o salário e as datas.')); return; }
      const anos = anosCompletos(adm, saida);
      let diasAv = 0;
      if (motivo === 'sem_justa' && (form.aviso.value === 'indenizado' || indireta)) diasAv = diasAviso(anos);
      if (motivo === 'acordo') diasAv = Math.floor(diasAviso(anos) / 2);
      const fimProj = diasAv ? somaDias(saida, diasAv) : saida;
      const itens = [];
      const ultimo = new Date(Date.UTC(saida.getUTCFullYear(), saida.getUTCMonth() + 1, 0)).getUTCDate();
      const mesmoMes = adm.getUTCFullYear() === saida.getUTCFullYear() && adm.getUTCMonth() === saida.getUTCMonth();
      let ds = saida.getUTCDate() === ultimo ? 30 : Math.min(30, saida.getUTCDate());
      if (mesmoMes) ds = Math.min(ds, saida.getUTCDate() === ultimo && adm.getUTCDate() === 1 ? 30 : saida.getUTCDate() - adm.getUTCDate() + 1);
      itens.push([`Saldo de salário (${ds} dias)`, base / 30 * ds]);
      if (diasAv) itens.push([`Aviso prévio indenizado (${diasAv} dias${motivo === 'acordo' ? ', metade' : ''})`, base / 30 * diasAv]);
      if (motivo !== 'justa') {
        const iniAno = new Date(Date.UTC(fimProj.getUTCFullYear(), 0, 1));
        const m13 = mesesEntre(adm > iniAno ? adm : iniAno, fimProj);
        itens.push([`13º proporcional (${m13}/12)`, base / 12 * m13]);
        let aniv = new Date(Date.UTC(fimProj.getUTCFullYear(), adm.getUTCMonth(), adm.getUTCDate())); if (aniv > fimProj) aniv = somaAnos(aniv, -1); if (aniv < adm) aniv = adm;
        const mf = mesesEntre(aniv, fimProj);
        itens.push([`Férias proporcionais + 1/3 (${mf}/12)`, base / 12 * mf * 4 / 3]);
      }
      const venc = +form.vencidas.value || 0;
      if (venc) itens.push([`Férias vencidas + 1/3 (${venc})`, base * venc * 4 / 3]);
      const meses = Math.max(1, Math.round((fimProj - adm) / (30.4375 * 86400000)));
      const saldoInf = num(form.fgts.value), saldo = saldoInf > 0 ? saldoInf : base * 0.08 * meses;
      const multa = motivo === 'sem_justa' ? 0.4 : motivo === 'acordo' ? 0.2 : 0;
      if (multa) itens.push([`Multa do FGTS (${multa * 100}% de ${saldoInf > 0 ? 'saldo informado' : 'saldo estimado ' + din(saldo)})`, saldo * multa]);
      const total = itens.reduce((t, x) => t + x[1], 0);
      out.replaceChildren(resultado(itens, total, [
        `Tempo de casa: ${anos} ano(s) · projeção do aviso até ${dataBR(iso(fimProj))} · prazo para a ação (2 anos): até ${dataBR(iso(somaAnos(fimProj, 2)))}.`,
        'Valores brutos (sem INSS e IR). Médias informadas entram na base de todas as verbas. Base: CLT arts. 477, 484-A e 487; Lei 12.506/2011; Lei 8.036/1990; Súmulas 171 e 261 do TST. Conferir antes de usar.']));
    });
    return form;
  }
  function calcPrescricao(out) {
    const { h, campo } = K();
    const form = h('form', { class: 'g-form form-grade' },
      campo('admissao', 'Admissão', '', { tipo: 'date' }), campo('saida', 'Saída', '', { tipo: 'date', obrigatorio: true }),
      campo('aviso', 'Aviso prévio', 'indenizado', { opcoes: [['indenizado', 'Indenizado (projeta)'], ['trabalhado', 'Trabalhado']] }),
      campo('ajuizamento', 'Data do ajuizamento', hojeISO(), { tipo: 'date' }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const adm = lerData(form.admissao.value), saida = lerData(form.saida.value), aj = lerData(form.ajuizamento.value) || lerData(hojeISO());
      if (!saida) return;
      const dias = form.aviso.value === 'indenizado' ? diasAviso(adm ? anosCompletos(adm, saida) : 0) : 0;
      const fim = somaDias(saida, dias), limite = somaAnos(fim, 2), alcance = somaAnos(aj, -5);
      const restam = Math.ceil((limite - aj) / 86400000);
      out.replaceChildren(resultado([
        ['Fim do contrato (com projeção do aviso)', dataBR(iso(fim)) + (dias ? ` (+${dias} dias)` : '')],
        ['Prescrição bienal (último dia para ajuizar)', dataBR(iso(limite))],
        ['Situação na data do ajuizamento', restam >= 0 ? `no prazo · faltam ${restam} dias` : `ATENÇÃO: passou ${-restam} dias`],
        ['Prescrição quinquenal: direitos a partir de', dataBR(iso(adm && adm > alcance ? adm : alcance))]
      ], null, ['CF, art. 7º, XXIX; OJ 83 da SDI-1 do TST (aviso indenizado projeta). Verificar causas de interrupção (protesto, ação anterior — Súmula 268 do TST) e de suspensão (menor de idade).']));
    });
    return form;
  }
  function calcPrazo(out) {
    const { h, campo, api } = K();
    const form = h('form', { class: 'g-form form-grade' },
      campo('inicio', 'Ciência / intimação', hojeISO(), { tipo: 'date', obrigatorio: true }),
      campo('dias', 'Prazo (dias)', '15', { modo: 'numeric', obrigatorio: true }),
      campo('contagem', 'Contagem', 'uteis', { opcoes: [['uteis', 'Dias úteis (CPC/CLT)'], ['corridos', 'Dias corridos (penal, material)']] }),
      campo('tribunal', 'Tribunal', 'TJSC', { opcoes: [['TJSC', 'TJSC (Justiça Estadual)'], ['TRT12', 'TRT-12 (Trabalho)'], ['TRF4', 'TRF-4 / JF (Federal)']] }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')), h('p', { class: 'erro largo' }));
    K().aoEnviar(form, async f => {
      const r = await api('calc.prazo', { inicio: f.get('inicio'), dias: f.get('dias'), contagem: f.get('contagem'), tribunal: f.get('tribunal') });
      out.replaceChildren(resultado([['Data fatal', h('strong', {}, dataBR(r.fatal))], ['Dias que não contaram', r.pulados.length ? r.pulados.map(p => dataBR(p.data) + ' (' + p.motivo + ')').join(' · ') : 'nenhum além de fins de semana']], null,
        ['Mesmo cálculo do robô (feriados nacionais, forenses, da aba Feriados e recesso de 20/12 a 20/01). A contagem começa no 1º dia útil depois da ciência. Na dúvida, considere o prazo mais curto e confira no sistema do tribunal.']));
    });
    return form;
  }
  function calcCorrecao(out) {
    const { h, campo, api } = K();
    const mesAtual = hojeISO().slice(0, 7);
    const form = h('form', { class: 'g-form form-grade' },
      campo('valor', 'Valor original (R$)', '', { modo: 'decimal', obrigatorio: true }),
      campo('de', 'Desde (mês)', '', { tipo: 'month', obrigatorio: true }),
      campo('ate', 'Até (mês)', mesAtual, { tipo: 'month', obrigatorio: true }),
      campo('indice', 'Correção', 'ipca', { opcoes: [['ipca', 'IPCA (Lei 14.905/2024, cível)'], ['ipcae', 'IPCA-E'], ['inpc', 'INPC'], ['igpm', 'IGP-M'], ['nenhum', 'Sem correção']] }),
      campo('juros', 'Juros', 'legal', { opcoes: [['legal', 'Taxa legal (Selic − IPCA, art. 406 CC)'], ['selic', 'Selic (já inclui correção)'], ['1am', '1% ao mês simples'], ['nenhum', 'Sem juros']] }),
      campo('juros_de', 'Juros desde (mês)', '', { tipo: 'month', dica: 'citação ou vencimento' }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')), h('p', { class: 'erro largo' }));
    K().aoEnviar(form, async f => {
      const v = num(f.get('valor')), de = f.get('de'), ate = f.get('ate'), ind = f.get('indice'), jur = f.get('juros'), jde = f.get('juros_de') || de;
      if (!(v > 0)) throw new Error('Informe o valor.');
      const pega = async s => (await api('calc.indices', { serie: s, de, ate })).itens;
      const fator = lista => lista.reduce((t, x) => t * (1 + x.valor / 100), 1);
      let corr = 1, linhas = [['Valor original', v]], ipca = null;
      if (jur === 'selic') {
        const sel = (await pega('selic')).filter(x => x.mes >= jde);
        const fs = fator(sel); linhas.push([`Selic acumulada (${sel.length} meses, desde ${mesBR(jde)})`, ((fs - 1) * 100).toFixed(2).replace('.', ',') + '%']);
        const tot = v * fs; linhas.push(['Valor atualizado (Selic)', tot]);
        out.replaceChildren(resultado(linhas, tot, ['Selic engloba correção e juros (não somar com outro índice). Fonte: Banco Central (SGS 4390). Estimativa: confira com a calculadora do tribunal antes de usar em petição.'])); return;
      }
      if (ind !== 'nenhum') { const l = await pega(ind); corr = fator(l); if (ind === 'ipca') ipca = l; linhas.push([`Correção ${ind.toUpperCase()} (${l.length} meses)`, ((corr - 1) * 100).toFixed(2).replace('.', ',') + '%']); }
      const corrigido = v * corr; linhas.push(['Valor corrigido', corrigido]);
      let juros = 0;
      if (jur === '1am') { const meses = Math.max(0, (+ate.slice(0, 4) - +jde.slice(0, 4)) * 12 + (+ate.slice(5) - +jde.slice(5))); juros = corrigido * 0.01 * meses; linhas.push([`Juros 1% a.m. (${meses} meses)`, juros]); }
      if (jur === 'legal') {
        const sel = (await pega('selic')).filter(x => x.mes >= jde), ip = ipca || await pega('ipca'), mapaI = Object.fromEntries(ip.map(x => [x.mes, x.valor]));
        const taxa = sel.reduce((t, x) => t + Math.max(0, x.valor - (mapaI[x.mes] || 0)), 0);
        juros = corrigido * taxa / 100; linhas.push([`Juros pela taxa legal (${taxa.toFixed(2).replace('.', ',')}% em ${sel.length} meses)`, juros]);
      }
      out.replaceChildren(resultado(linhas, corrigido + juros, ['Fonte dos índices: Banco Central (SGS). Taxa legal = Selic − IPCA do mês, nunca negativa (Lei 14.905/2024; art. 406 do CC). Na Justiça do Trabalho, conferir os critérios da ADC 58 e o cálculo do tribunal. Estimativa: confira antes de usar.']));
    });
    return form;
  }
  function calcHonorarios(out) {
    const { h, campo } = K();
    const form = h('form', { class: 'g-form form-grade' },
      campo('base', 'Valor da causa / do acordo (R$)', '', { modo: 'decimal', obrigatorio: true }),
      campo('pct', 'Êxito (%)', '30', { modo: 'decimal' }),
      campo('sucumb', 'Sucumbência (%)', '10', { modo: 'decimal', dica: 'paga pela outra parte' }),
      campo('fixo', 'Honorário fixo (R$)', '', { modo: 'decimal', dica: 'opcional' }),
      campo('entrada', 'Entrada (R$)', '', { modo: 'decimal', dica: 'opcional' }),
      campo('parcelas', 'Parcelas do fixo', '1', { modo: 'numeric' }),
      campo('venc', '1º vencimento', hojeISO(), { tipo: 'date' }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const base = num(form.base.value), pct = num(form.pct.value), suc = num(form.sucumb.value), fixo = num(form.fixo.value), ent = num(form.entrada.value), n = Math.max(1, parseInt(form.parcelas.value, 10) || 1);
      const exito = base * pct / 100, sucV = base * suc / 100;
      const linhas = [['Êxito contratual (' + pct + '%)', exito], ['Sucumbência estimada (' + suc + '%)', sucV], ['Cliente recebe (sem descontar custas)', base - exito]];
      if (fixo) {
        const resto = Math.max(0, fixo - ent), parc = Math.round(resto / (ent ? Math.max(1, n - 1) : n) * 100) / 100, v1 = lerData(form.venc.value) || lerData(hojeISO());
        if (ent) linhas.push(['Entrada', ent]);
        const qtd = ent ? Math.max(1, n - 1) : n;
        for (let i = 0; i < Math.min(qtd, 24); i++) linhas.push([`Parcela ${i + 1}/${qtd} · ${dataBR(iso(somaMes(v1, i + (ent ? 1 : 0))))}`, parc]);
      }
      out.replaceChildren(resultado(linhas, exito + sucV + fixo, ['Total para o escritório = êxito + sucumbência + fixo. Observe a Tabela de Honorários da OAB/SC e o contrato assinado.']));
    });
    return form;
  }
  function calcDatas(out) {
    const { h, campo } = K();
    const form = h('form', { class: 'g-form form-grade' },
      campo('a', 'Data inicial', '', { tipo: 'date', obrigatorio: true }), campo('b', 'Data final', hojeISO(), { tipo: 'date', obrigatorio: true }),
      campo('somar', 'Somar à data inicial', '', { dica: 'ex.: 90 (dias), 6m, 2a' }),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Calcular')));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const a = lerData(form.a.value), b = lerData(form.b.value); if (!a || !b) return;
      const [x, y] = a <= b ? [a, b] : [b, a];
      let anos = anosCompletos(x, y), d1 = somaAnos(x, anos), meses = 0; while (somaMes(d1, meses + 1) <= y) meses++;
      const dias = Math.round((y - somaMes(d1, meses)) / 86400000), total = Math.round((y - x) / 86400000);
      const linhas = [['Diferença', `${anos} ano(s), ${meses} mês(es) e ${dias} dia(s)`], ['Total em dias', `${total} dias`], ['Idade/tempo em anos', (total / 365.25).toFixed(2).replace('.', ',')]];
      const s = String(form.somar.value || '').trim().toLowerCase(), m = /^(\d+)\s*([dma]?)$/.exec(s);
      if (m) { const n = +m[1], r = m[2] === 'm' ? somaMes(a, n) : m[2] === 'a' ? somaAnos(a, n) : somaDias(a, n); linhas.push([`Data inicial + ${n} ${m[2] === 'm' ? 'meses' : m[2] === 'a' ? 'anos' : 'dias corridos'}`, dataBR(iso(r))]); }
      out.replaceChildren(resultado(linhas, null, []));
    });
    return form;
  }
  async function telaCalculadoras(params) {
    const { h, mostrar } = K();
    const atual = CALCS.some(c => c[0] === params.get('c')) ? params.get('c') : 'rescisao';
    const out = h('div', { class: 'calc-saida', 'aria-live': 'polite' });
    const fn = { rescisao: calcRescisao, prescricao: calcPrescricao, prazo: calcPrazo, correcao: calcCorrecao, honorarios: calcHonorarios, datas: calcDatas }[atual];
    mostrar(topo('Documentos', 'Calculadoras', 'Contas do dia a dia do escritório. São estimativas para orientar: confira sempre com o processo e o cálculo do tribunal.',
      h('a', { class: 'btn sec', href: '#/modelos' }, 'Documentos e propostas')),
      h('div', { class: 'calc-layout' },
        h('nav', { class: 'calc-menu', 'aria-label': 'Calculadoras' }, CALCS.map(([id, nome]) => h('a', { href: '#/calculadoras?c=' + id, class: id === atual ? 'ativo' : '', 'aria-current': id === atual ? 'page' : null }, nome))),
        h('section', { class: 'caixa calc-corpo' }, h('h2', {}, CALCS.find(c => c[0] === atual)[1]), fn(out), out)));
  }

  /* ================================================================ */
  /* Transcrição e resumos                                             */
  /* ================================================================ */
  const PEDACO = 3 * 1024 * 1024; // 3 MB: múltiplo de 3 (base64 emenda) e de 256 KiB (envio ao Google em partes)
  function b64DeBytes(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  async function enviarAudio(blob, nome, progresso) {
    const { api } = K();
    const partes = Math.ceil(blob.size / PEDACO);
    const ini = await api('ia.audioInicio', { tamanho: blob.size, mime: blob.type || 'audio/webm', partes, nome });
    for (let i = 0; i < partes; i++) {
      progresso(`Enviando o áudio… ${Math.round(i / partes * 100)}%`);
      const b64 = b64DeBytes(await blob.slice(i * PEDACO, (i + 1) * PEDACO).arrayBuffer());
      let ok = false, erro;
      for (let t = 0; t < 3 && !ok; t++) { try { await api('ia.audioParte', { id: ini.id, n: i, b64 }); ok = true; } catch (e) { erro = e; await new Promise(r => setTimeout(r, 2000)); } }
      if (!ok) throw erro;
    }
    return ini.id;
  }
  function seletorCasos(clientes, processos) {
    const { h } = K();
    const lista = h('datalist', { id: 'g-clientes' }, clientes.map(c => h('option', { value: c.nome })));
    const inCli = h('input', { name: 'cliente_nome', list: 'g-clientes', placeholder: 'Comece a digitar o nome', autocomplete: 'off' });
    const selProc = h('select', { name: 'processo_id' }, h('option', { value: '' }, 'Sem processo (atendimento)'));
    const achar = () => {
      const c = clientes.find(x => x.nome === inCli.value.trim());
      selProc.replaceChildren(h('option', { value: '' }, c ? 'Sem processo' : 'Escolha o cliente antes'), ...(c ? processos.filter(p => p.cliente_id === c.id).map(p => h('option', { value: p.id }, `${p.numero || 'a ajuizar'} · ${p.area || ''}`)) : []));
      return c;
    };
    inCli.addEventListener('change', achar); inCli.addEventListener('input', () => { if (clientes.some(x => x.nome === inCli.value.trim())) achar(); });
    return { el: h('div', { class: 'form-grade largo' }, h('div', {}, h('label', {}, 'Cliente (opcional)'), inCli, lista), h('div', {}, h('label', {}, 'Processo'), selProc)),
      valor: () => { const c = clientes.find(x => x.nome === inCli.value.trim()); return { cliente_id: c ? c.id : '', processo_id: selProc.value }; }, inCli, selProc, achar };
  }
  function mostrarResumo(x, alvo) {
    const { h, api, avisar } = K();
    const txt = h('textarea', { rows: 8, class: 'g-texto-cliente' }, x.cliente || '');
    const wa = () => zap(x.telefone, `Olá, ${primeiro(x.nome) || ''}! Segue o resumo da nossa ${/udi/i.test(x.titulo) ? 'audiência' : 'conversa'}:\n\n${txt.value}\n\nQualquer dúvida, estou à disposição. Araújo Advocacia`);
    const a = h('a', { class: 'btn wa', href: wa(), target: '_blank', rel: 'noopener', onclick: () => { a.href = wa(); } }, 'Mandar no WhatsApp');
    alvo.replaceChildren(h('div', { class: 'caixa g-resultado' },
      h('h2', {}, '✓ Resumo pronto: ' + x.titulo),
      h('div', { class: 'g-acoes' }, h('a', { class: 'btn', href: x.doc, target: '_blank', rel: 'noopener' }, 'Abrir o documento completo (Google Docs)')),
      h('h3', {}, 'Para o cliente (pode editar antes de mandar)'), txt,
      x.documentos && x.documentos.length ? h('div', {}, h('h4', {}, 'Documentos para pedir'), h('ul', {}, x.documentos.map(d => h('li', {}, d)))) : null,
      h('div', { class: 'g-acoes' }, a, h('button', { type: 'button', class: 'btn sec', onclick: () => copiar(txt.value, 'Texto copiado.') }, 'Copiar'),
        h('button', { type: 'button', class: 'btn sec', onclick: async ev => {
          ev.target.disabled = true;
          try { await api('ia.transcricaoPublicar', { id: x.id, texto: txt.value, publicar: true }); avisar('Publicado no Acompanhe do cliente (aparece quando ele entra com CPF e código).'); ev.target.textContent = '✓ No Acompanhe'; }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; } } }, 'Publicar no Acompanhe (site)')),
      h('details', { class: 'g-equipe', open: true }, h('summary', {}, 'Análise para a equipe'), mdParaDom(x.equipe))));
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function telaTranscricao(params) {
    const { h, api, mostrar, carregando, avisar } = K();
    carregando();
    const [clientes, processos, feitos] = await Promise.all([api('clientes.listar', {}), api('processos.listar', {}).catch(() => []), api('ia.transcricoes', {}).catch(() => ({ itens: [] }))]);
    const modo = params.get('modo') || 'gravar';
    const sel = seletorCasos(clientes, processos);
    const saida = h('div', { class: 'g-saida' });
    const estado = h('p', { class: 'g-estado', 'aria-live': 'polite' });
    const comum = h('div', { class: 'form-grade g-form' },
      h('fieldset', { class: 'largo g-campo' }, h('legend', {}, 'O que é'), h('div', { class: 'g-opcoes linha' },
        h('label', { class: 'g-opcao' }, h('input', { type: 'radio', name: 'tipo', value: 'atendimento', checked: params.get('tipo') !== 'audiencia' }), 'Atendimento a cliente'),
        h('label', { class: 'g-opcao' }, h('input', { type: 'radio', name: 'tipo', value: 'audiencia', checked: params.get('tipo') === 'audiencia' }), 'Audiência'))),
      h('div', {}, h('label', {}, 'Título'), h('input', { name: 'titulo', placeholder: 'Ex.: 1º atendimento — rescisão', maxlength: 140 })),
      h('div', {}, h('label', {}, 'Data'), h('input', { name: 'data_ato', type: 'date', value: hojeISO() })),
      sel.el,
      h('div', { class: 'largo' }, h('label', {}, 'Quem participa (ajuda a IA a identificar as vozes)'), h('input', { name: 'contexto', placeholder: 'Ex.: Juíza; Dra. Júlian (autora); Dr. X (ré); testemunha Maria; preposto João', maxlength: 1500 })));
    const lerComum = () => ({ tipo: (comum.querySelector('[name=tipo]:checked') || {}).value || 'atendimento', titulo: comum.querySelector('[name=titulo]').value.trim(),
      data_ato: comum.querySelector('[name=data_ato]').value, contexto: comum.querySelector('[name=contexto]').value.trim(), ...sel.valor() });
    const resumir = async (dados, botaoEl) => {
      estado.textContent = 'A IA está lendo e montando os resumos (até 2 minutos)…';
      if (botaoEl) botaoEl.disabled = true;
      try { const x = await api('ia.transcricaoResumo', dados); estado.textContent = ''; mostrarResumo(x, saida); }
      catch (e) { estado.textContent = ''; avisar(e.message, true); }
      finally { if (botaoEl) botaoEl.disabled = false; }
    };
    let painelModo;
    if (modo === 'gravar') {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const consent = h('label', { class: 'g-consent' }, h('input', { type: 'checkbox', name: 'consent' }), ' Avisei todos que a conversa está sendo gravada e eles concordaram (LGPD e sigilo profissional).');
      const textoAoVivo = h('textarea', { class: 'g-aovivo', rows: 12, placeholder: 'A transcrição ao vivo aparece aqui. Você pode corrigir enquanto grava.' });
      const prov = h('p', { class: 'peq g-provisorio' });
      const tempo = h('span', { class: 'g-tempo' }, '00:00');
      const btGravar = h('button', { type: 'button', class: 'btn g-gravar' }, '● Começar a gravar');
      const btIA = h('button', { type: 'button', class: 'btn sec', hidden: true }, 'Transcrever o áudio com a IA (identifica quem fala)');
      const btResumo = h('button', { type: 'button', class: 'btn', hidden: true }, 'Fazer os resumos com a transcrição ao vivo');
      let rec = null, mr = null, pedacos = [], ligado = false, inicio = 0, relogio = null, audioBlob = null;
      const parar = () => {
        ligado = false; clearInterval(relogio);
        try { rec && rec.stop(); } catch (e) { /* ok */ }
        try { mr && mr.state !== 'inactive' && mr.stop(); } catch (e) { /* ok */ }
        btGravar.textContent = '● Gravar de novo'; btGravar.classList.remove('gravando'); btResumo.hidden = !textoAoVivo.value.trim();
      };
      btGravar.addEventListener('click', async () => {
        if (ligado) { parar(); return; }
        if (!consent.querySelector('input').checked) { avisar('Marque que as pessoas autorizaram a gravação.', true); return; }
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
        catch (e) { avisar('O navegador não liberou o microfone. Clique no cadeado ao lado do endereço e permita o microfone.', true); return; }
        pedacos = []; audioBlob = null;
        const tipoMR = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
        try {
          mr = new MediaRecorder(stream, tipoMR ? { mimeType: tipoMR, audioBitsPerSecond: 24000 } : undefined);
          mr.ondataavailable = ev => { if (ev.data && ev.data.size) pedacos.push(ev.data); };
          mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); audioBlob = new Blob(pedacos, { type: (mr.mimeType || 'audio/webm').replace(/;.*$/, '') }); btIA.hidden = !audioBlob.size; };
          mr.start(10000);
        } catch (e) { mr = null; }
        if (Rec) {
          rec = new Rec(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
          rec.onresult = ev => {
            let parcial = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const t = ev.results[i][0].transcript;
              if (ev.results[i].isFinal) { const ts = Math.floor((Date.now() - inicio) / 1000); textoAoVivo.value += `[${String(Math.floor(ts / 60)).padStart(2, '0')}:${String(ts % 60).padStart(2, '0')}] ${t.trim()}\n`; textoAoVivo.scrollTop = textoAoVivo.scrollHeight; }
              else parcial += t;
            }
            prov.textContent = parcial;
          };
          rec.onerror = ev => { if (ev.error === 'not-allowed') { avisar('Microfone bloqueado para a transcrição ao vivo.', true); parar(); } };
          rec.onend = () => { if (ligado) { try { rec.start(); } catch (e) { /* reinicia na próxima */ } } };
          try { rec.start(); } catch (e) { /* segue só gravando */ }
        }
        ligado = true; inicio = Date.now();
        relogio = setInterval(() => { const s = Math.floor((Date.now() - inicio) / 1000); tempo.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
        btGravar.textContent = '■ Parar'; btGravar.classList.add('gravando'); btResumo.hidden = true; btIA.hidden = true;
      });
      btResumo.addEventListener('click', () => resumir({ ...lerComum(), texto: textoAoVivo.value }, btResumo));
      btIA.addEventListener('click', async () => {
        if (!audioBlob) return;
        btIA.disabled = true;
        try {
          const id = await enviarAudio(audioBlob, 'gravacao.webm', t => { estado.textContent = t; });
          estado.textContent = 'A IA está transcrevendo e identificando quem fala (pode levar alguns minutos)…';
          const tr = await api('ia.transcrever', { id, tipo: lerComum().tipo, contexto: lerComum().contexto });
          textoAoVivo.value = tr.texto; btResumo.hidden = false;
          await resumir({ ...lerComum(), id }, btIA);
        } catch (e) { estado.textContent = ''; avisar(e.message, true); }
        finally { btIA.disabled = false; }
      });
      painelModo = h('div', { class: 'g-gravador' },
        Rec ? null : h('p', { class: 'nota' }, 'Este navegador não faz a transcrição ao vivo (use o Google Chrome). A gravação funciona: ao parar, use "Transcrever o áudio com a IA".'),
        consent, h('div', { class: 'g-gravador-linha' }, btGravar, tempo, h('span', { class: 'peq' }, 'Grava o áudio leve (≈ 11 MB por hora) e escreve ao vivo.')),
        textoAoVivo, prov, h('div', { class: 'g-acoes' }, btResumo, btIA));
    } else if (modo === 'arquivo') {
      const inArq = h('input', { type: 'file', accept: 'audio/*,video/mp4,video/webm,.m4a,.mp3,.ogg,.opus,.wav,.webm,.mp4', 'aria-label': 'Arquivo de áudio' });
      const bt = h('button', { type: 'button', class: 'btn' }, 'Transcrever e resumir');
      bt.addEventListener('click', async () => {
        const f = inArq.files && inArq.files[0];
        if (!f) { avisar('Escolha o arquivo.', true); return; }
        if (f.size > 45 * 1048576) { avisar(`O arquivo tem ${Math.round(f.size / 1048576)} MB; o limite é 45 MB. Converta para áudio (mp3/m4a) ou divida.`, true); return; }
        bt.disabled = true;
        try {
          const blob = f.type ? f : new Blob([f], { type: /\.mp3$/i.test(f.name) ? 'audio/mpeg' : /\.m4a$/i.test(f.name) ? 'audio/mp4' : /\.wav$/i.test(f.name) ? 'audio/wav' : 'audio/ogg' });
          const id = await enviarAudio(blob, f.name, t => { estado.textContent = t; });
          estado.textContent = 'A IA está transcrevendo e identificando quem fala (pode levar alguns minutos)…';
          await api('ia.transcrever', { id, tipo: lerComum().tipo, contexto: lerComum().contexto });
          await resumir({ ...lerComum(), id }, bt);
        } catch (e) { estado.textContent = ''; avisar(e.message, true); }
        finally { bt.disabled = false; }
      });
      painelModo = h('div', { class: 'g-arquivo' }, h('p', {}, 'Áudio do celular, gravação do atendimento ou a mídia da audiência (até 45 MB; áudio de 1 hora em mp3 tem uns 30 MB).'),
        inArq, h('div', { class: 'g-acoes' }, bt),
        h('p', { class: 'peq' }, 'Audiência em segredo de justiça: só com autorização. O áudio vai ao Google Gemini (conta do escritório) e é apagado depois; o arquivo temporário do Drive é apagado em até 2 dias.'));
    } else if (modo === 'colar') {
      const ta = h('textarea', { rows: 14, placeholder: 'Cole aqui a transcrição (do Teams, Meet, Zoom, da ata ou do seu aplicativo de gravação).' });
      const bt = h('button', { type: 'button', class: 'btn' }, 'Fazer os resumos');
      bt.addEventListener('click', () => resumir({ ...lerComum(), texto: ta.value }, bt));
      painelModo = h('div', {}, ta, h('div', { class: 'g-acoes' }, bt));
    } else {
      painelModo = K().tabela(['Data', 'Tipo', 'Título', 'Cliente / processo', 'No Acompanhe', ''], feitos.itens, x => [
        h('td', {}, dataBR(x.data_ato)), h('td', {}, x.tipo === 'audiencia' ? 'Audiência' : 'Atendimento'), h('td', {}, h('strong', {}, x.titulo)),
        h('td', {}, x.cliente || '—', x.numero ? h('div', { class: 'peq' }, x.numero) : null),
        h('td', {}, x.publicado === 'sim' ? h('span', { class: 'tag ok' }, 'publicado') : '—'),
        h('td', {}, h('a', { class: 'btn mini sec', href: x.doc_url, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, 'Abrir'))
      ], x => window.open(x.doc_url, '_blank', 'noopener'), 'Nenhum resumo feito ainda.');
    }
    const aba = (id, rot) => h('a', { class: 'visao-bt' + (modo === id ? ' ativo' : ''), href: '#/transcricao?modo=' + id, role: 'tab', 'aria-selected': String(modo === id) }, rot);
    mostrar(topo('Inteligência', 'Transcrição e resumos', 'Grave o atendimento ou envie o áudio da audiência: a IA escreve tudo, separa quem falou e prepara o resumo para o cliente e a análise para a equipe.',
      h('a', { class: 'btn sec', href: '#/pecas' }, 'Peças com IA'), h('a', { class: 'btn sec', href: '#/prompts' }, 'Biblioteca de prompts')),
      iaFaixa(),
      h('section', { class: 'caixa g-corpo' }, h('div', { class: 'visoes', role: 'tablist' }, aba('gravar', '🎙 Gravar agora'), aba('arquivo', '⬆ Enviar áudio'), aba('colar', '📋 Colar texto'), aba('feitos', `Resumos feitos (${feitos.itens.length})`)),
        modo === 'feitos' ? null : comum, painelModo, estado),
      saida);
    const pc = params.get('processo');
    if (pc) { const p = processos.find(x => x.id === pc); const c = p && clientes.find(x => x.id === p.cliente_id); if (c) { sel.inCli.value = c.nome; sel.achar(); sel.selProc.value = pc; } }
  }

  /* ================================================================ */
  /* Peças com IA (análise, dossiê, mapa da prova, roteiro)            */
  /* ================================================================ */
  const PECAS = [
    ['dossie', 'Dossiê da audiência de instrução', 'Síntese, teses, pontos controvertidos, mapa da prova, estratégia, roteiros de perguntas, acordo e checklist do dia.'],
    ['mapa', 'Mapa da prova', 'Fato a provar × ônus × prova que temos × prova a produzir × testemunha × força.'],
    ['roteiro', 'Roteiro de perguntas', 'Depoimento pessoal da outra parte, nossas testemunhas e as da outra parte (com contradita).'],
    ['analise', 'Análise processual completa', 'Linha do tempo, pedidos e defesas, provas, riscos, estratégia e próximos atos.'],
    ['cliente', 'Preparação do cliente', 'Guia em linguagem simples para o cliente chegar seguro à audiência.'],
    ['recurso', 'Análise de decisão para recurso', 'O que foi decidido, possíveis erros, recursos cabíveis e teses.'],
    ['peticao', 'Revisão de petição', 'Estrutura, pedidos, provas e sugestões de reescrita.'],
    ['livre', 'Pedido livre', 'Escreva o que precisa; a IA usa os dados do processo e o material colado.']
  ];
  async function telaPecas(params) {
    const { h, api, mostrar, carregando, avisar } = K();
    carregando();
    const [clientes, processos] = await Promise.all([api('clientes.listar', {}), api('processos.listar', {}).catch(() => [])]);
    const tipo = PECAS.some(p => p[0] === params.get('tipo')) ? params.get('tipo') : 'dossie';
    const sel = seletorCasos(clientes, processos);
    const saida = h('div', { class: 'g-saida' }), estado = h('p', { class: 'g-estado', 'aria-live': 'polite' });
    const instr = h('textarea', { rows: 3, placeholder: tipo === 'livre' ? 'Descreva o que você quer (ex.: "liste as contradições entre a contestação e os documentos")' : 'Instruções extras (opcional): foco, teses, o que já sabemos…' }, params.get('instrucao') || '');
    const material = h('textarea', { rows: 10, placeholder: 'Cole aqui as peças e documentos principais: petição inicial, contestação, réplica, ata, laudo, documentos. Quanto mais material, melhor a análise.' });
    const nomes = h('input', { placeholder: 'Nomes a esconder da IA além das partes (testemunhas, filhos…), separados por ;', maxlength: 1000 });
    const bt = h('button', { type: 'button', class: 'btn' }, 'Gerar com a IA');
    bt.addEventListener('click', async () => {
      const v = sel.valor();
      bt.disabled = true; estado.textContent = 'A IA está lendo o processo e o material (até 2 minutos)…';
      try {
        const x = await api('ia.peca', { tipo, processo_id: v.processo_id, cliente_id: v.cliente_id, material: material.value, instrucao: instr.value, nomes: nomes.value });
        estado.textContent = '';
        const btDoc = h('button', { type: 'button', class: 'btn' }, 'Salvar como documento (pasta do cliente)');
        btDoc.addEventListener('click', async () => { btDoc.disabled = true; try { const d = await api('ia.pecaDoc', { titulo: x.titulo, texto: x.texto, processo_id: v.processo_id, cliente_id: v.cliente_id }); window.open(d.doc, '_blank', 'noopener'); avisar('Documento salvo no Drive.'); } catch (e) { avisar(e.message, true); btDoc.disabled = false; } });
        saida.replaceChildren(h('div', { class: 'caixa g-resultado' }, h('h2', {}, x.titulo + (x.processo ? ' · ' + x.processo : '')),
          h('p', { class: 'nota' }, 'Rascunho da IA: confira cada fato, artigo e data no processo antes de usar.'),
          h('div', { class: 'g-acoes' }, btDoc, h('button', { type: 'button', class: 'btn sec', onclick: () => copiar(x.texto, 'Texto copiado.') }, 'Copiar o texto')), mdParaDom(x.texto)));
        saida.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { estado.textContent = ''; avisar(e.message, true); }
      finally { bt.disabled = false; }
    });
    mostrar(topo('Inteligência', 'Peças com IA', 'Análise processual, dossiê estratégico, mapa da prova e roteiro de audiência, com os dados do processo que já estão no painel.',
      h('a', { class: 'btn sec', href: '#/transcricao' }, 'Transcrição e resumos'), h('a', { class: 'btn sec', href: '#/prompts' }, 'Biblioteca de prompts')),
      iaFaixa(),
      h('div', { class: 'g-pecas' }, PECAS.map(([id, nome, desc]) => h('a', { class: 'g-peca' + (id === tipo ? ' ativa' : ''), href: '#/pecas?tipo=' + id }, h('strong', {}, nome), h('span', {}, desc)))),
      h('section', { class: 'caixa g-corpo g-form' }, h('h2', {}, PECAS.find(p => p[0] === tipo)[1]),
        sel.el, h('label', {}, tipo === 'livre' ? 'O que a IA deve fazer' : 'Instruções extras'), instr,
        h('label', {}, 'Material (peças e documentos)'), material, nomes,
        h('p', { class: 'peq' }, 'O painel junta sozinho: histórico do processo, textos das intimações, resumo do caso da ficha e resumos de audiências já feitos. Nomes das partes, CPF, telefones e endereços são trocados por marcas antes de ir para a IA.'),
        h('div', { class: 'g-acoes' }, bt), estado),
      saida);
    const pc = params.get('processo');
    if (pc) { const p = processos.find(x => x.id === pc); const c = p && clientes.find(x => x.id === p.cliente_id); if (c) { sel.inCli.value = c.nome; sel.achar(); sel.selProc.value = pc; } }
  }

  /* ================================================================ */
  /* Biblioteca de prompts                                             */
  /* ================================================================ */
  const P_REGRAS = 'Regras: use só o material que eu colar; não invente fatos, provas, datas, artigos ou julgados; quando faltar informação, escreva [NÃO CONSTA — conferir]; cite artigos de lei só se tiver certeza e marque [conferir]; não cite números de processos ou julgados; escreva em português do Brasil, de forma clara e organizada, com títulos e listas.';
  const PROMPTS = [
    { cat: 'Audiência de instrução', titulo: 'Dossiê estratégico da audiência', texto: `Você é assistente de uma advogada que vai fazer uma audiência de instrução. Com base no material abaixo, monte um DOSSIÊ ESTRATÉGICO com:\n1. Síntese do caso (até 10 linhas).\n2. Tese do nosso cliente e tese da outra parte.\n3. Pontos controvertidos, numerados.\n4. Mapa da prova em tabela: Fato a provar | Quem tem o ônus | Prova que já temos | Prova a produzir na audiência | Quem pode provar | Situação.\n5. Estratégia para a audiência: o que priorizar e o que evitar.\n6. Roteiro de perguntas para o depoimento pessoal da outra parte (perguntas fechadas, ligadas a cada ponto controvertido).\n7. Roteiro para as nossas testemunhas e para as da outra parte (com hipóteses de contradita).\n8. Requerimentos que podem ser feitos na audiência.\n9. Pontos para negociar um acordo.\n10. Checklist do dia.\n11. Pontos que eu (advogada) preciso conferir.\n\n${P_REGRAS}\n\nPROCESSO (área, vara, nosso cliente é autor ou réu):\n[COLE AQUI]\n\nMATERIAL (inicial, contestação, réplica, documentos, decisões):\n[COLE AQUI]` },
    { cat: 'Audiência de instrução', titulo: 'Mapa da prova', texto: `Monte o MAPA DA PROVA deste processo.\n- Primeiro, liste os pontos controvertidos.\n- Depois, uma tabela: Nº | Fato a provar | Quem tem o ônus | Prova existente (documento/folha) | Prova a produzir | Testemunha que sabe | Força da prova (forte/média/fraca).\n- Por fim: lacunas de prova e como cobri-las, e documentos a pedir ao cliente.\n\n${P_REGRAS}\n\nMATERIAL:\n[COLE AQUI]` },
    { cat: 'Audiência de instrução', titulo: 'Roteiro de perguntas para testemunhas', texto: `Prepare o ROTEIRO DE PERGUNTAS para a audiência de instrução.\n- Para cada testemunha (nossas e da outra parte) diga o objetivo da oitiva.\n- Perguntas curtas e objetivas, agrupadas por ponto controvertido.\n- Para as testemunhas da outra parte: perguntas para testar se viu os fatos diretamente, desde quando conhece as partes, interesse no resultado e hipóteses de contradita.\n- Indique o que NÃO perguntar (perguntas que podem nos prejudicar).\n\n${P_REGRAS}\n\nPONTOS CONTROVERTIDOS E QUEM SÃO AS TESTEMUNHAS:\n[COLE AQUI]\n\nMATERIAL:\n[COLE AQUI]` },
    { cat: 'Audiência de instrução', titulo: 'Perguntas para o depoimento pessoal da outra parte', texto: `Elabore perguntas para o DEPOIMENTO PESSOAL da parte contrária, buscando confissão sobre os pontos controvertidos. Perguntas fechadas (sim/não ou dado objetivo), em ordem lógica, com o objetivo de cada bloco. Aponte as perguntas que podem ser indeferidas pelo juiz e como reformular.\n\n${P_REGRAS}\n\nMATERIAL:\n[COLE AQUI]` },
    { cat: 'Audiência de instrução', titulo: 'Preparar o cliente para a audiência', texto: `Escreva um guia, em linguagem bem simples, para preparar meu cliente para a audiência: como vai ser, quem estará presente, o que levar, como se comportar, perguntas que podem ser feitas a ele (sempre orientando a responder a verdade, com calma, só o que sabe) e o que evitar. Não oriente a mentir nem a omitir.\n\nTIPO DE AUDIÊNCIA E RESUMO DO CASO:\n[COLE AQUI]` },
    { cat: 'Audiência de instrução', titulo: 'Razões finais a partir da ata', texto: `Com base na ata/transcrição da audiência e nas peças, faça o roteiro das RAZÕES FINAIS: o que cada prova oral confirmou ou contrariou (com o trecho/minuto), confissões, contradições da outra parte, e os pontos a destacar para cada pedido. Não invente trechos.\n\n${P_REGRAS}\n\nATA / TRANSCRIÇÃO:\n[COLE AQUI]\n\nPEÇAS:\n[COLE AQUI]` },
    { cat: 'Análise processual', titulo: 'Análise processual completa', texto: `Faça uma ANÁLISE PROCESSUAL completa: síntese; linha do tempo em tabela (Data | Fato/ato | Fonte); pedidos e defesas; pontos controvertidos; provas produzidas e pendentes; pontos fortes; pontos fracos e riscos (alto/médio/baixo); situação atual; estratégia sugerida com prós e contras; pontos para conferir.\n\n${P_REGRAS}\n\nMATERIAL:\n[COLE AQUI]` },
    { cat: 'Análise processual', titulo: 'Linha do tempo dos fatos', texto: `Organize os FATOS em ordem cronológica, em tabela: Data | Fato | Quem | Prova/documento que mostra | Observação. Marque as datas incertas com [aproximada]. Ao final, aponte lacunas e contradições entre as versões.\n\n${P_REGRAS}\n\nMATERIAL:\n[COLE AQUI]` },
    { cat: 'Análise processual', titulo: 'Análise de sentença para recurso', texto: `Analise a SENTENÇA/DECISÃO: o que foi decidido item a item; fundamentos; onde perdemos; possíveis erros (de fato, de direito, omissão, contradição, obscuridade); recursos cabíveis (sem afirmar prazo: indique "conferir prazo e preparo"); teses recursais com a força de cada uma; riscos de recorrer.\n\n${P_REGRAS}\n\nDECISÃO:\n[COLE AQUI]\n\nPEÇAS PRINCIPAIS:\n[COLE AQUI]` },
    { cat: 'Análise processual', titulo: 'Contestação: pontos a rebater (réplica)', texto: `Leia a CONTESTAÇÃO e liste, em tabela: Argumento da defesa | Documento que ela juntou | Como rebater | Prova que temos | Risco. Depois, aponte preliminares e prejudiciais levantadas (prescrição, incompetência, ilegitimidade etc.) e o que responder em cada uma.\n\n${P_REGRAS}\n\nPETIÇÃO INICIAL:\n[COLE AQUI]\n\nCONTESTAÇÃO:\n[COLE AQUI]` },
    { cat: 'Atendimento', titulo: 'Triagem do primeiro atendimento', texto: `Sou advogada e vou atender um cliente na área [ÁREA]. Monte um ROTEIRO DE ENTREVISTA para o primeiro atendimento: perguntas essenciais em ordem (fatos, datas, valores, provas, testemunhas), sinais de prescrição/decadência a verificar, documentos a pedir e alertas de risco. Formato: lista de perguntas agrupadas.\n\nRESUMO DO QUE O CLIENTE CONTOU NO WHATSAPP:\n[COLE AQUI]` },
    { cat: 'Atendimento', titulo: 'Lista de documentos para o cliente', texto: `Faça a LISTA DE DOCUMENTOS que o cliente precisa reunir para uma ação de [TIPO DE AÇÃO], em linguagem simples, separando: obrigatórios, se tiver, e como conseguir cada um (site, órgão, empresa). Termine com uma mensagem curta e gentil para mandar no WhatsApp.` },
    { cat: 'Atendimento', titulo: 'Resumo do atendimento para o cliente', texto: `Transforme as anotações do atendimento num RESUMO PARA O CLIENTE, em português simples, até 180 palavras: o que conversamos, o que vamos fazer, o que ele precisa mandar e os próximos passos. Sem prometer resultado e sem termos técnicos.\n\nANOTAÇÕES:\n[COLE AQUI]` },
    { cat: 'Escrita', titulo: 'Revisar petição (clareza e padrão)', texto: `Revise a petição abaixo sem reescrevê-la inteira: avalie estrutura (fatos → fundamentos → pedidos), coerência dos pedidos com os fatos, provas citadas, clareza (frases longas, repetições, termos vagos) e padrão do escritório (títulos em maiúsculas, citações de artigos destacadas). Para cada problema, mostre o trecho original e a sugestão.\n\n${P_REGRAS}\n\nPETIÇÃO:\n[COLE AQUI]` },
    { cat: 'Escrita', titulo: 'Melhorar um parágrafo', texto: `Reescreva o parágrafo abaixo em linguagem jurídica clara, objetiva e elegante, sem mudar o sentido nem acrescentar fatos. Dê 2 versões: uma mais técnica e uma mais direta.\n\nPARÁGRAFO:\n[COLE AQUI]` },
    { cat: 'Escrita', titulo: 'Síntese de decisão (ementa)', texto: `Faça uma síntese em formato de ementa da decisão abaixo (tema em maiúsculas, palavras-chave separadas por ponto, e 3 a 5 itens com o que foi decidido). Só com o que está no texto.\n\nDECISÃO:\n[COLE AQUI]` },
    { cat: 'Relacionamento com o cliente', titulo: 'Explicar uma decisão ao cliente', texto: `Explique ao cliente, em português bem simples, até 120 palavras, o que significa a decisão abaixo e qual é o próximo passo. Sem termos técnicos, sem prometer resultado e sem prazos internos. Tom acolhedor. Em formato de mensagem de WhatsApp.\n\nDECISÃO:\n[COLE AQUI]` },
    { cat: 'Relacionamento com o cliente', titulo: 'Responder dúvida do cliente', texto: `Responda à dúvida do cliente abaixo em mensagem de WhatsApp: educada, curta (até 100 palavras), clara, sem prometer resultado e sem dar parecer definitivo sem análise. Se faltar informação, peça o que for necessário.\n\nDÚVIDA:\n[COLE AQUI]\n\nCONTEXTO DO CASO:\n[COLE AQUI]` },
    { cat: 'Marketing (Provimento 205)', titulo: 'Texto informativo para o blog/Instagram', texto: `Escreva um texto INFORMATIVO (não publicitário) sobre [TEMA], para o público leigo, com até 300 palavras: o que é, quem tem direito, o que fazer. Siga o Provimento 205/2021 da OAB: sem promessa de resultado, sem preços, sem captação de clientela, sem sensacionalismo. Termine com uma frase neutra como "Em caso de dúvida, procure orientação jurídica".` }
  ];
  async function telaPrompts(params) {
    const { h, api, apiFresco, mostrar, carregando, avisar, sessao, rota } = K();
    carregando();
    const proprios = await api('prompts.listar', {}).catch(() => ({ itens: [] }));
    const busca = (params.get('q') || '').toLowerCase();
    const todos = PROMPTS.map((p, i) => ({ ...p, id: 'p' + i })).concat(proprios.itens.map(p => ({ cat: p.categoria || 'Do escritório', titulo: p.titulo, texto: p.texto, id: p.id, meu: true, criado_por: p.criado_por })));
    const lista = todos.filter(p => !busca || (p.titulo + ' ' + p.texto + ' ' + p.cat).toLowerCase().includes(busca));
    const cats = [...new Set(lista.map(p => p.cat))];
    const usarNoPainel = p => { const tipo = /Dossi/.test(p.titulo) ? 'dossie' : /Mapa da prova/.test(p.titulo) ? 'mapa' : /Roteiro|depoimento/i.test(p.titulo) ? 'roteiro' : /Preparar o cliente/.test(p.titulo) ? 'cliente' : /sentença|recurso/i.test(p.titulo) ? 'recurso' : /Revisar petição/.test(p.titulo) ? 'peticao' : /Análise processual/.test(p.titulo) ? 'analise' : 'livre';
      location.hash = '#/pecas?tipo=' + tipo + (tipo === 'livre' ? '&instrucao=' + encodeURIComponent(p.texto.replace(/\n*(MATERIAL|PROCESSO|DECISÃO|PETIÇÃO|ATA|ANOTAÇÕES|DÚVIDA|CONTEXTO|PARÁGRAFO|CONTESTAÇÃO|PEÇAS|RESUMO|PONTOS)[^\n]*:\n\[COLE AQUI\]/g, '').slice(0, 3000)) : ''); };
    const cartao = p => h('article', { class: 'g-prompt' },
      h('header', {}, h('strong', {}, p.titulo), p.meu ? h('span', { class: 'tag sec' }, 'do escritório') : null),
      h('pre', { class: 'g-prompt-txt' }, p.texto),
      h('div', { class: 'g-acoes' },
        h('button', { type: 'button', class: 'btn mini', onclick: () => copiar(p.texto, 'Prompt copiado. Cole na IA e troque os [COLE AQUI].') }, 'Copiar'),
        h('button', { type: 'button', class: 'btn mini sec', onclick: () => usarNoPainel(p) }, 'Usar no painel (Gemini)'),
        p.meu && (p.criado_por === sessao.usuario.usuario || sessao.usuario.pode.usuarios) ? h('button', { type: 'button', class: 'btn mini sec', onclick: () => editar(p) }, 'Editar') : null));
    const editar = p => {
      const form = h('form', { class: 'g-form' }, h('h2', {}, p ? 'Editar prompt' : 'Novo prompt do escritório'),
        h('label', {}, 'Título'), h('input', { name: 'titulo', required: true, value: p ? p.titulo : '', maxlength: 120 }),
        h('label', {}, 'Categoria'), h('input', { name: 'categoria', value: p ? p.cat : 'Do escritório', list: 'g-cats', maxlength: 60 }), h('datalist', { id: 'g-cats' }, [...new Set(todos.map(x => x.cat))].map(c => h('option', { value: c }))),
        h('label', {}, 'Texto (use [COLE AQUI] onde vai o material)'), h('textarea', { name: 'texto', rows: 12, required: true }, p ? p.texto : ''),
        h('div', { class: 'g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'), p ? h('button', { type: 'button', class: 'btn sec', onclick: async () => { if (!confirm('Apagar este prompt?')) return; await api('prompts.salvar', { apagar: p.id }); d.close(); await apiFresco('prompts.listar', {}); rota(); } }, 'Apagar') : null),
        h('p', { class: 'erro' }));
      const d = dialogo('', form);
      K().aoEnviar(form, async f => { await api('prompts.salvar', { item: { id: p ? p.id : undefined, titulo: f.get('titulo'), categoria: f.get('categoria'), texto: f.get('texto') } }); d.close(); avisar('Prompt salvo.'); await apiFresco('prompts.listar', {}); rota(); });
    };
    const fBusca = h('form', { class: 'busca-grande', role: 'search' }, h('span', { class: 'busca-ico', 'aria-hidden': 'true' }, '⌕'), h('input', { type: 'search', name: 'q', value: busca, placeholder: 'Buscar prompt (ex.: testemunha, sentença, documentos)' }), h('button', { type: 'submit', class: 'btn' }, 'Buscar'));
    fBusca.addEventListener('submit', ev => { ev.preventDefault(); location.hash = '#/prompts' + (fBusca.q.value.trim() ? '?q=' + encodeURIComponent(fBusca.q.value.trim()) : ''); });
    mostrar(topo('Inteligência', 'Biblioteca de prompts', 'Pedidos prontos e testados para a IA. Copie para o Gemini, ChatGPT ou Claude, ou use direto no painel com os dados do processo.',
      K().botao('+ Novo prompt do escritório', () => editar(null), 'dourado'), h('a', { class: 'btn sec', href: '#/pecas' }, 'Peças com IA')),
      iaFaixa(), fBusca,
      h('nav', { class: 'g-cats' }, cats.map(c => h('a', { href: '#prompt-' + encodeURIComponent(c), onclick: ev => { ev.preventDefault(); const el = document.getElementById('prompt-' + c); if (el) el.scrollIntoView({ behavior: 'smooth' }); } }, c))),
      h('div', {}, cats.length ? cats.map(c => h('section', { class: 'g-cat', id: 'prompt-' + c }, h('h2', {}, c), h('div', { class: 'g-prompts' }, lista.filter(p => p.cat === c).map(cartao)))) : h('p', { class: 'peq' }, 'Nenhum prompt com essa busca.')));
  }

  /* ================================================================ */
  /* Padrões operacionais                                              */
  /* ================================================================ */
  async function telaPadroes(params) {
    const { h, api, apiFresco, mostrar, carregando, avisar, sessao, rota } = K();
    carregando();
    const r = await api('padroes.listar', {});
    const grupo = params.get('g') === 'equipe' ? 'equipe' : 'cliente';
    const pode = ['administrador', 'advogada'].includes(sessao.usuario.perfil);
    const itens = r.itens.filter(x => x.grupo === grupo);
    const recarregar = async () => { await apiFresco('padroes.listar', {}); rota(); };
    const editar = x => {
      const form = h('form', { class: 'g-form' }, h('h2', {}, x ? 'Editar' : 'Novo item'),
        h('label', {}, 'Para'), h('select', { name: 'grupo' }, h('option', { value: 'cliente', selected: (x ? x.grupo : grupo) === 'cliente' }, 'Clientes (como funciona o escritório)'), h('option', { value: 'equipe', selected: (x ? x.grupo : grupo) === 'equipe' }, 'Equipe (procedimentos)')),
        h('label', {}, 'Título'), h('input', { name: 'titulo', required: true, value: x ? x.titulo : '', maxlength: 120 }),
        h('label', {}, 'Texto (linhas com "- " viram lista; "1." lista numerada)'), h('textarea', { name: 'texto', rows: 10, required: true }, x ? x.texto : ''),
        h('div', { class: 'g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
          x ? h('button', { type: 'button', class: 'btn sec', onclick: async () => { if (!confirm('Apagar este item?')) return; await api('padroes.salvar', { apagar: x.id }); d.close(); recarregar(); } }, 'Apagar') : null), h('p', { class: 'erro' }));
      const d = dialogo('', form);
      K().aoEnviar(form, async f => { await api('padroes.salvar', { item: { id: x ? x.id : undefined, grupo: f.get('grupo'), titulo: f.get('titulo'), texto: f.get('texto') } }); d.close(); avisar('Salvo.'); recarregar(); });
    };
    const mover = async (x, dir) => {
      const i = itens.indexOf(x), y = itens[i + dir]; if (!y) return;
      await Promise.all([api('padroes.salvar', { item: { id: x.id, grupo: x.grupo, titulo: x.titulo, texto: x.texto, ordem: y.ordem } }), api('padroes.salvar', { item: { id: y.id, grupo: y.grupo, titulo: y.titulo, texto: y.texto, ordem: x.ordem } })]);
      recarregar();
    };
    const textoWhats = () => `Olá! Seja bem-vindo(a) ao escritório Araújo Advocacia. Preparamos um resumo de como trabalhamos:\n\n` + itens.slice(1).map(x => `*${x.titulo}*\n${x.texto}`).join('\n\n');
    const gerarGuia = async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Gerando o PDF…'; try { const x = await api('padroes.guia', { grupo }); window.open(x.pdf, '_blank', 'noopener'); avisar('Guia salvo no Drive (PAINEL — GUIAS E PADRÕES).'); } catch (e) { avisar(e.message, true); } finally { b.disabled = false; b.textContent = 'Gerar o guia em PDF'; } };
    const aba = (id, rot) => h('a', { class: 'visao-bt' + (grupo === id ? ' ativo' : ''), href: '#/padroes?g=' + id, role: 'tab', 'aria-selected': String(grupo === id) }, rot);
    mostrar(topo('Gestão', 'Padrões operacionais', grupo === 'cliente' ? 'Como o escritório funciona, explicado para o cliente novo: mande pelo WhatsApp ou em PDF logo depois de fechar o contrato.' : 'Os procedimentos do escritório, passo a passo. Todo mundo faz do mesmo jeito.',
      h('button', { type: 'button', class: 'btn dourado', onclick: gerarGuia }, 'Gerar o guia em PDF'),
      grupo === 'cliente' ? h('button', { type: 'button', class: 'btn sec', onclick: () => copiar(textoWhats(), 'Texto copiado: cole no WhatsApp do cliente.') }, 'Copiar para o WhatsApp') : null,
      pode ? K().botao('+ Novo item', () => editar(null), 'sec') : null),
      h('div', { class: 'visoes', role: 'tablist' }, aba('cliente', 'Para os clientes'), aba('equipe', 'Para a equipe (POPs)')),
      h('div', { class: 'g-padroes' }, itens.map((x, i) => h('article', { class: 'caixa g-padrao' },
        h('header', {}, h('span', { class: 'g-num' }, String(i + 1)), h('h2', {}, x.titulo),
          pode ? h('span', { class: 'g-padrao-bts' }, i ? h('button', { type: 'button', class: 'btn mini sec', 'aria-label': 'Subir', onclick: () => mover(x, -1) }, '↑') : null,
            i < itens.length - 1 ? h('button', { type: 'button', class: 'btn mini sec', 'aria-label': 'Descer', onclick: () => mover(x, 1) }, '↓') : null,
            h('button', { type: 'button', class: 'btn mini sec', onclick: () => editar(x) }, 'Editar')) : null),
        mdParaDom(x.texto)))),
      pode ? null : h('p', { class: 'peq' }, 'Só a administração e a advogada editam os padrões.'));
  }

  /* ================================================================ */
  /* Recibos                                                           */
  /* ================================================================ */
  async function telaRecibos(params) {
    const { h, api, mostrar, carregando, avisar } = K();
    carregando();
    const mes = params.get('mes') || '', busca = params.get('q') || '';
    const r = await api('fin.recibos', { mes, busca });
    const ir = mud => { const q = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => v ? q.set(k, v) : q.delete(k)); location.hash = '#/recibos' + (q.toString() ? '?' + q : ''); };
    const form = h('form', { class: 'crm-filtros', role: 'search' }, h('input', { type: 'search', name: 'q', value: busca, placeholder: 'Buscar cliente' }),
      h('input', { type: 'month', name: 'mes', value: mes, 'aria-label': 'Mês', onchange: ev => ir({ mes: ev.target.value }) }), h('button', { type: 'submit', class: 'btn' }, 'Buscar'));
    form.addEventListener('submit', ev => { ev.preventDefault(); ir({ q: form.q.value.trim() }); });
    const msg = x => `Olá, ${primeiro(x.cliente)}! Recebemos o pagamento${x.numero ? ' da ' + x.numero + 'ª parcela' : ''} de ${din(x.valor)} em ${dataBR(x.pago_em)}. Muito obrigada! Segue o recibo. Araújo Advocacia`;
    const linha = x => {
      const cel = h('td', {});
      const pintar = url => cel.replaceChildren(url ? h('a', { class: 'btn mini', href: url, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, 'Abrir recibo')
        : h('button', { type: 'button', class: 'btn mini sec', onclick: async ev => { ev.stopPropagation(); ev.target.disabled = true; ev.target.textContent = 'Gerando…';
          try { const g = await api('fin.recibo.gerar', { id: x.id }); x.recibo_url = g.pdf || g.doc; pintar(x.recibo_url); avisar('Recibo gerado na pasta do cliente.'); } catch (e) { avisar(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Gerar recibo'; } } }, 'Gerar recibo'),
        h('a', { class: 'btn mini sec wa', href: zap(x.telefone, msg(x)), target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, 'WhatsApp'));
      pintar(x.recibo_url);
      return [h('td', { 'data-r': 'Pago em' }, dataBR(x.pago_em)), h('td', { 'data-r': 'Cliente' }, h('strong', {}, x.cliente || '—'), x.honorario ? h('div', { class: 'peq' }, x.honorario) : null),
        h('td', { 'data-r': 'Parcela' }, x.numero ? x.numero + 'ª' : '—'), h('td', { class: 'num', 'data-r': 'Valor' }, din(x.valor)), h('td', { 'data-r': 'Forma' }, x.forma || '—'), cel];
    };
    mostrar(topo('Gestão', 'Recibos', 'Todo pagamento recebido, com o recibo em PDF na pasta do cliente. Recibo que faltou? "Gerar recibo".',
      h('a', { class: 'btn sec', href: '#/financeiro' }, 'Painel financeiro')),
      h('section', { class: 'caixa' }, form, h('p', { class: 'peq' }, `${r.total} pagamento(s)` + (r.soma !== null ? ` · ${din(r.soma)}` : '') + (r.total > r.itens.length ? ` · mostrando os ${r.itens.length} mais recentes` : '')),
        K().tabela(['Pago em', 'Cliente', 'Parcela', 'Valor', 'Forma', 'Recibo'], r.itens, linha, x => { location.hash = '#/cliente/' + x.cliente_id; }, 'Nenhum pagamento encontrado.')));
  }

  /* ================================================================ */
  /* Painel financeiro (topo do Financeiro)                            */
  /* ================================================================ */
  function graficoMeses(fluxo) {
    const { s, h } = K();
    const W = 640, H = 220, pad = 34, max = Math.max(1, ...fluxo.map(f => Math.max(f.entradas, f.saidas)));
    const bw = (W - pad * 2) / fluxo.length;
    const y = v => H - 26 - (v / max) * (H - 50);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pf-graf', role: 'img', 'aria-label': 'Entradas e saídas dos últimos 12 meses' },
      [0.25, 0.5, 0.75, 1].map(f => s('line', { x1: pad, x2: W - pad / 2, y1: y(max * f), y2: y(max * f), class: 'pf-grade' })),
      fluxo.map((f, i) => {
        const x = pad + i * bw;
        return s('g', {},
          s('rect', { x: x + bw * 0.14, y: y(f.entradas), width: bw * 0.34, height: Math.max(0, H - 26 - y(f.entradas)), class: 'pf-ent', rx: 3 }, s('title', {}, `${mesBR(f.mes)} · entradas ${din(f.entradas)}`)),
          s('rect', { x: x + bw * 0.52, y: y(f.saidas), width: bw * 0.34, height: Math.max(0, H - 26 - y(f.saidas)), class: 'pf-sai', rx: 3 }, s('title', {}, `${mesBR(f.mes)} · saídas ${din(f.saidas)}`)),
          s('text', { x: x + bw / 2, y: H - 8, class: 'pf-rot', 'text-anchor': 'middle' }, mesBR(f.mes)));
      }));
    return h('div', { class: 'pf-graf-box' }, svg, h('div', { class: 'pf-legenda' }, h('span', { class: 'pf-l-ent' }, 'Entradas (recebido)'), h('span', { class: 'pf-l-sai' }, 'Saídas (despesas pagas)')));
  }
  async function blocoPainelFinanceiro() {
    const { h, api, grafRosca, grafBarras } = K();
    let r;
    try { r = await api('fin.painel', {}); } catch (e) { return null; }
    if (!r || !r.kpis || r.kpis.recebidoMes === null) return null; // RH: o servidor não manda os totais
    const k = r.kpis;
    const varia = k.recebidoAnterior ? Math.round((k.recebidoMes / k.recebidoAnterior - 1) * 100) : null;
    return h('section', { class: 'pf' },
      h('div', { class: 'pf-nums' },
        numero('verde', din(k.recebidoMes), 'Recebido no mês', varia === null ? 'parcelas pagas' : `${varia >= 0 ? '▲' : '▼'} ${Math.abs(varia)}% sobre o mês passado`),
        numero('azul', din(k.media3), 'Média dos 3 meses', 'recebido por mês'),
        numero('vermelho', din(k.despesasMes), 'Despesas pagas no mês', ''),
        numero(k.saldoMes >= 0 ? 'verde' : 'vermelho', din(k.saldoMes), 'Resultado do mês', 'recebido − despesas'),
        numero('dourado', din(k.totalAberto), 'Carteira a receber', 'todas as parcelas em aberto'),
        numero(k.inadimplencia > 20 ? 'vermelho' : 'azul', k.inadimplencia + '%', 'Inadimplência', 'do que venceu nos últimos 90 dias'),
        numero('azul', String(k.contratosMes), 'Contratos fechados', 'assinados neste mês'),
        numero('dourado', String(k.exitosAbertos), 'Êxitos em andamento', 'honorários de êxito ativos')),
      h('div', { class: 'pf-grid' },
        h('div', { class: 'caixa' }, h('h3', {}, 'Entradas e saídas · 12 meses'), graficoMeses(r.fluxo)),
        h('div', { class: 'caixa' }, h('h3', {}, 'Previsão de recebimento'), grafBarras(r.previsao.map(p => ({ nome: mesBR(p.mes), valor: p.valor, cor: 'verde' })), { dinheiro: true }),
          h('h3', {}, 'Recebido por área · 12 meses'), r.porArea.length ? grafRosca(r.porArea.slice(0, 6).map(a => ({ nome: a.area, valor: a.valor })), { dinheiro: true }) : h('p', { class: 'peq' }, 'Sem recebimentos.'))),
      r.devedores.length ? h('div', { class: 'caixa' }, h('h3', {}, 'Maiores atrasos'), K().tabela(['Cliente', 'Parcelas', 'Desde', 'Em atraso'], r.devedores, d => [
        h('td', {}, h('strong', {}, d.cliente)), h('td', { class: 'num' }, String(d.parcelas)), h('td', {}, dataBR(d.desde)), h('td', { class: 'num' }, h('span', { class: 'tag urgente' }, din(d.valor)))
      ], d => { location.hash = '#/cliente/' + d.cliente_id; }, '')) : null);
  }

  window.GESTAO = { telaCrm, telaCalculadoras, telaTranscricao, telaPecas, telaPrompts, telaPadroes, telaRecibos, blocoPainelFinanceiro, dialogoProposta };
})();
