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
  const COR_ETAPA = { novo: '#2f6fd0', contato: '#5b6ee1', cadastro: '#7a4fc0', cliente: '#a04fb0', atendido: '#1d8a8a', proposta: '#c98a12', ganho: '#1f8a4c', perdido: '#9aa0aa' };
  const ETAPAS_ABERTAS = ['novo', 'contato', 'cadastro', 'cliente', 'atendido', 'proposta'];
  /** A política de segurança do painel bloqueia style="…" no HTML; a cor vai pela propriedade CSS (CSSOM), que é permitida. */
  const cor = (el, c) => { el.style.setProperty('--cor', c); return el; };
  const PROX_ETAPA = { novo: 'contato', contato: 'cadastro', cadastro: 'cliente', cliente: 'atendido', atendido: 'proposta', proposta: 'ganho' };
  const ESCRITORIO_LOCAL = 'no escritório (Rua Silvino Moreira Lima Sobrinho, 888, Sala 04, Humaitá, Tubarão/SC, em frente à nova rodoviária)';
  function msgLead(l) {
    const n = primeiro(l.nome), assunto = l.assunto ? ` sobre ${String(l.assunto).toLowerCase()}` : '';
    const quando = l.consulta_em ? `${dataBR(l.consulta_em.slice(0, 10))}${l.consulta_em.length > 10 ? ' às ' + l.consulta_em.slice(11, 16) : ''}` : '[data e hora]';
    switch (l.etapa) {
      case 'lembrar': return `Olá, ${n}! Confirmando a nossa conversa em ${quando}, ${ESCRITORIO_LOCAL} ou por vídeo, como combinamos. Se puder, traga um documento com foto e os documentos do caso. Qualquer imprevisto, me avise por aqui. Araújo Advocacia`;
      case 'cadastro': return `Olá, ${n}! Tudo bem? Conseguiu preencher o cadastro pelo link que mandei? Se tiver qualquer dificuldade, me avise que eu ajudo por aqui. Araújo Advocacia`;
      case 'cliente': return `Olá, ${n}! Recebemos o seu cadastro, obrigada. Vamos marcar a nossa conversa sobre o seu caso: qual o melhor dia e horário para você? Pode ser no escritório ou por vídeo. Araújo Advocacia`;
      case 'atendido': return `Olá, ${n}! Obrigada pela conversa. Como combinamos, vou te mandar a procuração e o contrato de honorários para você conferir e assinar. Se lembrar de algum documento ou detalhe, pode me mandar por aqui. Araújo Advocacia`;
      case 'proposta': return `Olá, ${n}! Tudo bem? Conseguiu ver a procuração e o contrato que enviamos? Se ficou alguma dúvida, estou à disposição para explicar. Depois de assinar, é só me mandar por aqui. Araújo Advocacia`;
      case 'propostaH': return `Olá, ${n}! Tudo bem? Conseguiu ver a proposta que enviamos? Se ficou alguma dúvida, estou à disposição para explicar. Araújo Advocacia`;
      case 'ganho': return `Olá, ${n}! Seja bem-vindo(a) ao escritório. Vou te mandar o contrato e a procuração para assinatura e um guia rápido de como trabalhamos. Qualquer dúvida, é só chamar. Araújo Advocacia`;
      default: return `Olá, ${n}! Aqui é do escritório Araújo Advocacia. Recebemos o seu contato${assunto}. Podemos conversar agora? Se preferir, me diga o melhor dia e horário.`;
    }
  }
  /** 8.12.2: mensagens prontas para cada situação do atendimento (escolher no cartão). */
  function mensagensLead(l) {
    const n = primeiro(l.nome);
    return [
      ['Mensagem da etapa', msgLead(l)],
      ['Primeira resposta', `Olá, ${n}! Aqui é do escritório Araújo Advocacia, obrigada pelo contato. Para eu entender melhor, pode me contar em poucas palavras o que aconteceu e desde quando? Se preferir, podemos marcar uma conversa no escritório ou por vídeo.`],
      ['Pedir documentos', `Olá, ${n}! Para analisarmos o seu caso, pode me mandar por aqui (foto legível ou PDF) os documentos que tiver: documento com foto, comprovante de residência e o que tiver sobre o caso (contratos, mensagens, comprovantes). Obrigada!`],
      ['Lembrar a consulta', msgLead(Object.assign({}, l, { etapa: 'lembrar' }))],
      ['Lembrar o cadastro', msgLead(Object.assign({}, l, { etapa: 'cadastro' }))],
      ['Mandei a procuração e o contrato', msgLead(Object.assign({}, l, { etapa: 'proposta' }))],
      ['Sem resposta (retomar)', `Olá, ${n}! Tudo bem? Estou retomando o seu contato com o escritório. Ainda precisa de ajuda com ${l.assunto ? String(l.assunto).toLowerCase() : 'o seu caso'}? Se preferir, me diga o melhor dia e horário para conversarmos.`],
      ['Depois da proposta de honorários', msgLead(Object.assign({}, l, { etapa: 'propostaH' }))],
      ['Boas-vindas (fechou)', msgLead(Object.assign({}, l, { etapa: 'ganho' }))]
    ];
  }
  /** 8.14: gera o link do cadastro online (vale 15 dias, uso único) e abre o WhatsApp com a mensagem pronta. */
  async function mandarLinkCadastro(alvo, depois) {
    const { h, api, avisar } = K();
    let r;
    try { r = await api('crm.linkCadastro', alvo.id ? { id: alvo.id } : { cliente_id: alvo.cliente_id }); }
    catch (e) { avisar(e.message, true); return; }
    const copiar = h('button', { type: 'button', class: 'btn sec', onclick: async () => { try { await navigator.clipboard.writeText(r.mensagem); avisar('Mensagem copiada.'); } catch (e) { avisar('Não consegui copiar: selecione o texto.', true); } } }, 'Copiar a mensagem');
    const d = dialogo('', h('h2', {}, '📝 Link do cadastro pronto'),
      h('p', {}, 'Mande ao cliente. Quando ele preencher, o cadastro entra em Clientes sozinho e o cartão do funil passa para "Cadastro preenchido".'),
      h('p', { class: 'crm-msg-prev' }, r.mensagem),
      h('p', { class: 'peq' }, 'O link vale 15 dias e só uma vez. Gerar outro invalida o anterior.'),
      h('div', { class: 'g-acoes' }, r.telefone ? h('a', { class: 'btn wa', href: zap(r.telefone, r.mensagem), target: '_blank', rel: 'noopener' }, 'Mandar no WhatsApp') : null, copiar));
    // a tela só é redesenhada quando a janela fecha (redesenhar antes fecharia a janela com o link)
    if (depois) d.addEventListener('close', () => depois());
  }
  function dialogoConsulta(l, depois) {
    const { h, api, avisar, campo } = K();
    const amanha = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const form = h('form', { class: 'g-form form-grade' }, h('h2', { class: 'largo' }, '📅 Agendar consulta — ' + l.nome),
      campo('data', 'Dia', (l.consulta_em || '').slice(0, 10) || amanha, { tipo: 'date', obrigatorio: true }),
      campo('hora', 'Hora', (l.consulta_em || '').slice(11, 16) || '14:00', { tipo: 'time', obrigatorio: true }),
      campo('modo', 'Como', 'presencial', { opcoes: [['presencial', 'No escritório'], ['video', 'Por vídeo']] }),
      h('p', { class: 'peq largo' }, 'Entra na agenda ATENDIMENTOS do Google e a próxima ação do cartão vira "confirmar na véspera".'),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Agendar')), h('p', { class: 'erro largo' }));
    const d = dialogo('', form);
    K().aoEnviar(form, async f => {
      const r = await api('crm.consulta', { id: l.id, data: f.get('data'), hora: f.get('hora'), modo: f.get('modo') });
      d.close();
      const l2 = Object.assign({}, l, { etapa: 'lembrar', consulta_em: f.get('data') + 'T' + f.get('hora') });
      dialogo('', h('h2', {}, r.agenda ? '✓ Consulta agendada' : 'Consulta anotada'), r.agenda ? null : h('p', { class: 'nota alerta' }, 'Não consegui pôr no Google Agenda: ' + r.erro),
        h('p', {}, `${l.nome} · ${dataBR(f.get('data'))} às ${f.get('hora')} (${f.get('modo') === 'video' ? 'por vídeo' : 'no escritório'}).`),
        h('div', { class: 'g-acoes' }, l.telefone ? h('a', { class: 'btn wa', href: zap(l.telefone, msgLead(l2).replace(` ${ESCRITORIO_LOCAL} ou por vídeo, como combinamos`, f.get('modo') === 'video' ? ' por vídeo (mando o link pouco antes)' : ' ' + ESCRITORIO_LOCAL)), target: '_blank', rel: 'noopener' }, 'Confirmar no WhatsApp') : null));
      if (depois) depois();
    });
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
        h('div', { class: 'crm-tags' }, l.cliente_id ? h('span', { class: 'tag ok', title: 'Já tem cadastro de cliente' }, '✓ cliente') : null, l.area ? h('span', { class: 'tag' }, l.area) : null, l.canal ? h('span', { class: 'tag sec' }, l.canal.replace(/ \(.*\)$/, '')) : null),
        l.assunto ? h('p', { class: 'crm-assunto' }, String(l.assunto).slice(0, 90)) : null,
        l.proxima_acao ? h('p', { class: 'crm-prox' + (l.atrasado ? ' atrasado' : '') }, '→ ', l.proxima_acao.slice(0, 80), l.proxima_data ? h('span', {}, ' · ' + dataBR(l.proxima_data)) : null) : null,
        h('div', { class: 'crm-card-pe' },
          h('span', { class: 'peq' }, l.dias_parado >= 7 && !['ganho', 'perdido'].includes(l.etapa) ? `⏳ ${l.dias_parado} dias sem mexer` : (l.responsavel || '')),
          h('span', { class: 'crm-bts' },
            l.telefone ? h('a', { class: 'btn mini wa', href: zap(l.telefone, msgLead(l)), target: '_blank', rel: 'noopener', title: 'Mensagem pronta para esta etapa', onclick: ev => ev.stopPropagation() }, 'WhatsApp') : null,
            ['novo', 'contato'].includes(l.etapa) ? h('button', { type: 'button', class: 'btn mini sec', title: 'Mandar o link do cadastro', 'aria-label': 'Mandar o link do cadastro', onclick: ev => { ev.stopPropagation(); mandarLinkCadastro(l, recarregar); } }, '📝') : null,
            ['novo', 'contato', 'cliente'].includes(l.etapa) ? h('button', { type: 'button', class: 'btn mini sec', title: 'Agendar a consulta', 'aria-label': 'Agendar a consulta', onclick: ev => { ev.stopPropagation(); dialogoConsulta(l, recarregar); } }, '📅') : null,
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
        ETAPAS_ABERTAS.map(id => coluna(id, filtrados.filter(l => l.etapa === id).sort(ord))),
        coluna('ganho', filtrados.filter(l => l.etapa === 'ganho' && recente(l))),
        coluna('perdido', filtrados.filter(l => l.etapa === 'perdido' && recente(l))));
      corpo = h('div', {}, h('p', { class: 'peq crm-dica' }, 'Arraste o cartão para mudar de etapa (ou use →). Clique para ver tudo, anotar, gerar a proposta ou transformar em cliente. "Contrato assinado" e "Não fechou" mostram os últimos 45 dias. O caminho anda sozinho: link do cadastro mandado → cadastro preenchido → procuração e contrato gerados → assinado.'),
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
    const etapas = ETAPAS_ABERTAS.concat('ganho');
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
      l.telefone ? (() => {
        const ms = mensagensLead(l), sel = h('select', { 'aria-label': 'Mensagem pronta' }, ms.map(([t], i) => h('option', { value: i }, t)));
        const prev = h('p', { class: 'crm-msg-prev' }, ms[0][1]);
        const ir = h('a', { class: 'btn mini wa', href: zap(l.telefone, ms[0][1]), target: '_blank', rel: 'noopener' }, 'Abrir no WhatsApp');
        sel.addEventListener('change', () => { const m = ms[+sel.value][1]; prev.textContent = m; ir.href = zap(l.telefone, m); });
        return h('div', { class: 'crm-msgs' }, h('label', {}, '💬 Mensagem pronta '), sel, ir, prev);
      })() : null,
      h('div', { class: 'crm-extra-acoes' },
        ['novo', 'contato', 'cadastro'].includes(l.etapa) ? h('button', { type: 'button', class: 'btn dourado', onclick: () => { d.close(); mandarLinkCadastro(l, depois); } }, l.etapa === 'cadastro' ? '📝 Mandar o link do cadastro de novo' : '📝 Mandar link do cadastro') : null,
        h('button', { type: 'button', class: 'btn sec', onclick: () => { d.close(); dialogoConsulta(l, depois); } }, l.consulta_em ? '📅 Remarcar a consulta' : '📅 Agendar consulta'),
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
          (() => { const ta = h('textarea', { id: 'crm-nota', name: 'texto', rows: 2, placeholder: 'Ex.: liguei, vai mandar os documentos amanhã (ou dite 🎙)' }); return h('div', {}, ta, K().ditado ? K().ditado(ta, l.cliente_id) : null); })(),
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
    return { el: h('div', { class: 'form-grade largo' }, h('div', {}, h('label', {}, 'Cliente (opcional — a transcrição vai para as observações dele)'), inCli, lista), h('div', {}, h('label', {}, 'Processo'), selProc)),
      valor: () => { const c = clientes.find(x => x.nome === inCli.value.trim()); return { cliente_id: c ? c.id : '', processo_id: selProc.value }; }, inCli, selProc, achar };
  }
  function mostrarResumo(x, alvo) {
    const { h, api, avisar } = K();
    const txt = h('textarea', { rows: 8, class: 'g-texto-cliente' }, x.cliente || '');
    const wa = () => zap(x.telefone, `Olá, ${primeiro(x.nome) || ''}! Segue o resumo da nossa ${/udi/i.test(x.titulo) ? 'audiência' : 'conversa'}:\n\n${txt.value}\n\nQualquer dúvida, estou à disposição. Araújo Advocacia`);
    const a = h('a', { class: 'btn wa', href: wa(), target: '_blank', rel: 'noopener', onclick: () => { a.href = wa(); } }, 'Mandar no WhatsApp');
    alvo.replaceChildren(h('div', { class: 'caixa g-resultado' },
      h('h2', {}, (x.criado_em ? '' : '✓ Resumo pronto: ') + x.titulo + (x.criado_em ? ' · ' + dataBR(x.data_ato) : '')),
      x.nome || x.numero ? h('p', { class: 'peq' }, [x.nome, x.numero].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'g-acoes' }, h('a', { class: 'btn', href: x.doc, target: '_blank', rel: 'noopener' }, 'Abrir o documento completo (Google Docs)')),
      h('h3', {}, 'Para o cliente (pode editar antes de mandar)'), txt,
      x.documentos && x.documentos.length ? h('div', { class: 'g-docs' }, h('h4', {}, 'Documentos para pedir'), h('ul', {}, x.documentos.map(d => h('li', {}, d))),
        h('a', { class: 'btn mini sec wa', target: '_blank', rel: 'noopener', href: zap(x.telefone, `Olá, ${primeiro(x.nome) || ''}! Para darmos andamento, pode me mandar por aqui (foto legível ou PDF):\n\n${x.documentos.map(d => '• ' + d).join('\n')}\n\nSe faltar algum, me avise. Obrigada! Araújo Advocacia`) }, 'Pedir os documentos no WhatsApp')) : null,
      h('div', { class: 'g-acoes' }, a, h('button', { type: 'button', class: 'btn sec', onclick: () => copiar(txt.value, 'Texto copiado.') }, 'Copiar'),
        x.publicado === 'sim' ? h('button', { type: 'button', class: 'btn sec', onclick: async ev => {
          ev.target.disabled = true;
          try { await api('ia.transcricaoPublicar', { id: x.id, publicar: false }); avisar('Tirado do Acompanhe.'); ev.target.textContent = 'Fora do Acompanhe'; }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; } } }, 'Tirar do Acompanhe')
        : h('button', { type: 'button', class: 'btn sec', onclick: async ev => {
          ev.target.disabled = true;
          try { await api('ia.transcricaoPublicar', { id: x.id, texto: txt.value, publicar: true }); avisar('Publicado no Acompanhe do cliente (aparece quando ele entra com CPF e código).'); ev.target.textContent = '✓ No Acompanhe'; }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; } } }, 'Publicar no Acompanhe (site)'),
        h('button', { type: 'button', class: 'btn sec', title: 'Tarefa para você com os documentos a pedir e os próximos passos (com checklist)', onclick: async ev => {
          ev.target.disabled = true;
          try { await api('ia.transcricaoTarefa', { id: x.id }); avisar('Tarefa criada em Tarefas, com checklist.'); ev.target.textContent = '✓ Tarefa criada'; }
          catch (e) { avisar(e.message, true); ev.target.disabled = false; } } }, '＋ Tarefa com os próximos passos')),
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
      try { const x = await api('ia.transcricaoResumo', dados); estado.textContent = ''; mostrarResumo(x, saida); try { localStorage.removeItem('transcricao_rascunho'); } catch (e) { /* ok */ } }
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
      let rec = null, mr = null, pedacos = [], ligado = false, inicio = 0, relogio = null, audioBlob = null, pausado = false, pausaEm = 0;
      // 8.12.2: o texto ao vivo fica salvo neste computador a cada 10 s (fechou a aba sem querer? volta aqui)
      const CH = 'transcricao_rascunho';
      try { const r0 = localStorage.getItem(CH); if (r0) { const o = JSON.parse(r0); if (o.texto && Date.now() - o.t < 3 * 86400000) textoAoVivo.value = o.texto; } } catch (e) { /* ok */ }
      const salvarRasc = () => { try { if (textoAoVivo.value.trim()) localStorage.setItem(CH, JSON.stringify({ t: Date.now(), texto: textoAoVivo.value.slice(-300000) })); } catch (e) { /* ok */ } };
      const ivR = setInterval(() => { if (!textoAoVivo.isConnected) { clearInterval(ivR); return; } salvarRasc(); }, 10000); textoAoVivo.addEventListener('change', salvarRasc);
      const btPausa = h('button', { type: 'button', class: 'btn sec', hidden: true }, '❚❚ Pausar');
      btPausa.addEventListener('click', () => {
        if (!ligado) return;
        pausado = !pausado;
        if (pausado) { pausaEm = Date.now(); try { mr && mr.state === 'recording' && mr.pause(); } catch (e) { /* ok */ } try { rec && rec.stop(); } catch (e) { /* ok */ } btPausa.textContent = '▶ Continuar'; tempo.classList.add('pausado'); }
        else { inicio += Date.now() - pausaEm; try { mr && mr.state === 'paused' && mr.resume(); } catch (e) { /* ok */ } try { rec && rec.start(); } catch (e) { /* ok */ } btPausa.textContent = '❚❚ Pausar'; tempo.classList.remove('pausado'); }
      });
      const btLimpar = h('button', { type: 'button', class: 'btn mini sec' }, 'Limpar o texto');
      btLimpar.addEventListener('click', () => { if (ligado || !textoAoVivo.value.trim() || !confirm('Apagar o texto da transcrição?')) return; textoAoVivo.value = ''; try { localStorage.removeItem(CH); } catch (e) { /* ok */ } btResumo.hidden = true; });
      const parar = () => {
        ligado = false; pausado = false; clearInterval(relogio); btPausa.hidden = true; tempo.classList.remove('pausado'); salvarRasc();
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
          rec.onend = () => { if (ligado && !pausado) { try { rec.start(); } catch (e) { /* reinicia na próxima */ } } };
          try { rec.start(); } catch (e) { /* segue só gravando */ }
        }
        ligado = true; inicio = Date.now();
        relogio = setInterval(() => { if (pausado) return; const s = Math.floor((Date.now() - inicio) / 1000); tempo.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
        btGravar.textContent = '■ Parar'; btGravar.classList.add('gravando'); btResumo.hidden = true; btIA.hidden = true; btPausa.hidden = false;
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
        consent, h('div', { class: 'g-gravador-linha' }, btGravar, btPausa, tempo, h('span', { class: 'peq' }, 'Grava o áudio leve (≈ 11 MB por hora) e escreve ao vivo. O texto fica salvo neste computador enquanto você grava.')),
        textoAoVivo, prov, h('div', { class: 'g-acoes' }, btResumo, btIA, btLimpar));
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
        h('td', {}, h('span', { class: 'btn mini' }, 'Ver'), ' ', h('a', { class: 'btn mini sec', href: x.doc_url, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, 'Docs'))
      ], async x => { try { mostrarResumo(await api('ia.transcricao', { id: x.id }), saida); } catch (e) { avisar(e.message, true); } }, 'Nenhum resumo feito ainda.');
    }
    const aba = (id, rot) => h('a', { class: 'visao-bt' + (modo === id ? ' ativo' : ''), href: '#/transcricao?modo=' + id, role: 'tab', 'aria-selected': String(modo === id) }, rot);
    mostrar(topo('Inteligência', 'Transcrição e resumos', 'Grave o atendimento ou envie o áudio da audiência: a IA escreve tudo, separa quem falou e prepara o resumo para o cliente e a análise para a equipe.'),
      iaFaixa(),
      h('section', { class: 'caixa g-corpo' }, h('div', { class: 'visoes', role: 'tablist' }, aba('gravar', '🎙 Gravar agora'), aba('arquivo', '⬆ Enviar áudio'), aba('colar', '📋 Colar texto'), aba('feitos', `Resumos feitos (${feitos.itens.length})`)),
        modo === 'feitos' ? null : comum, painelModo, estado),
      saida);
    const pc = params.get('processo');
    if (pc) { const p = processos.find(x => x.id === pc); const c = p && clientes.find(x => x.id === p.cliente_id); if (c) { sel.inCli.value = c.nome; sel.achar(); sel.selProc.value = pc; } }
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
  async function blocoRecibos(params) {
    const { h, api, avisar } = K();
    const mes = params.get('mes') || '', busca = params.get('q') || '';
    const r = await api('fin.recibos', { mes, busca });
    const ir = mud => { const q = new URLSearchParams(params); q.set('ver', 'recibos'); Object.entries(mud).forEach(([k, v]) => v ? q.set(k, v) : q.delete(k)); location.hash = '#/financeiro?' + q; };
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
    return h('div', {}, h('p', { class: 'peq fin-dica' }, 'Todo pagamento recebido, com o recibo em PDF na pasta do cliente. Recibo que faltou? "Gerar recibo".'),
      form, h('p', { class: 'peq' }, `${r.total} pagamento(s)` + (r.soma !== null ? ` · ${din(r.soma)}` : '') + (r.total > r.itens.length ? ` · mostrando os ${r.itens.length} mais recentes` : '')),
      K().tabela(['Pago em', 'Cliente', 'Parcela', 'Valor', 'Forma', 'Recibo'], r.itens, linha, x => { location.hash = '#/cliente/' + x.cliente_id; }, 'Nenhum pagamento encontrado.'));
  }

  /* ================================================================ */
  /* Painel financeiro (topo do Financeiro)                            */
  /* ================================================================ */
  /* 8.12.2 (pedido da usuária: "o gráfico está muito grande"): só entradas e saídas do mês, sem gráficos */
  async function blocoPainelFinanceiro() {
    const { h, api } = K();
    let r;
    try { r = await api('fin.painel', {}); } catch (e) { return null; }
    if (!r || !r.kpis || r.kpis.recebidoMes === null) return null; // RH: o servidor não manda os totais
    const k = r.kpis;
    const varia = k.recebidoAnterior ? Math.round((k.recebidoMes / k.recebidoAnterior - 1) * 100) : null;
    const ant = (r.fluxo || [])[(r.fluxo || []).length - 2] || { entradas: 0, saidas: 0 };
    return h('div', { class: 'pf-nums pf-enxuto' },
      numero('verde', din(k.recebidoMes), 'Entradas do mês', varia === null ? 'parcelas recebidas' : `${varia >= 0 ? '▲' : '▼'} ${Math.abs(varia)}% sobre o mês passado (${din(ant.entradas)})`),
      numero('vermelho', din(k.despesasMes), 'Saídas do mês', `despesas pagas · mês passado: ${din(ant.saidas)}`),
      numero(k.saldoMes >= 0 ? 'verde' : 'vermelho', din(k.saldoMes), 'Resultado do mês', 'entradas − saídas'),
      numero(k.inadimplencia > 20 ? 'vermelho' : 'azul', k.inadimplencia + '%', 'Inadimplência', 'do que venceu nos últimos 90 dias'));
  }


  /* ================================================================ */
  /* 8.13: Conversas do WhatsApp (chatbot) — só administração          */
  /* ================================================================ */
  const horaCurta = iso => { if (!iso) return ''; const d = new Date(iso), hoje = new Date(); return d.toDateString() === hoje.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  async function telaConversas(params) {
    const { h, api, apiFresco, mostrar, carregando, avisar, botao, sessao } = K();
    carregando();
    const id = params.get('id') || '';
    const r = await apiFresco('whats.conversas', id ? { id } : {});
    const aberta = r.conversa || null;
    if (aberta && +aberta.nao_lidas) api('whats.acao', { id: aberta.id, acao: 'lida' }).catch(() => {});
    const busca = (params.get('q') || '').toLowerCase();
    const itens = r.itens.filter(c => !busca || (c.nome + ' ' + c.telefone + ' ' + c.ultima_msg).toLowerCase().includes(busca));
    const lista = h('ul', { class: 'wz-lista' }, itens.length ? itens.map(c => h('li', { class: (c.id === id ? 'ativa ' : '') + (+c.nao_lidas ? 'nova' : '') },
      h('a', { href: '#/conversas?id=' + c.id },
        h('div', { class: 'wz-l1' }, h('strong', {}, c.nome || '+' + c.telefone), h('span', { class: 'peq' }, horaCurta(c.ultima_em))),
        h('div', { class: 'wz-l2' }, h('span', {}, String(c.ultima_msg || '').slice(0, 70)),
          +c.nao_lidas ? h('b', { class: 'wz-n' }, c.nao_lidas) : null),
        h('div', { class: 'wz-l3' }, c.estado === 'humano' ? h('span', { class: 'tag atencao' }, 'com a equipe') : h('span', { class: 'tag ok' }, 'robô'),
          c.cliente_id ? h('span', { class: 'tag' }, 'cliente') : null)))) : h('li', { class: 'vazia' }, r.configurado ? 'Nenhuma conversa ainda.' : 'Assim que o WhatsApp for ligado, as conversas aparecem aqui.'));
    let fio = h('div', { class: 'wz-vazio' }, h('p', {}, 'Escolha uma conversa à esquerda.'), h('p', { class: 'peq' }, 'O robô responde sozinho; quando é urgente, quando pedem uma pessoa ou quando você responde por aqui, ele pausa e a conversa fica com a equipe.'));
    if (aberta) {
      const msgs = h('div', { class: 'wz-msgs' }, (r.mensagens || []).map(m => h('div', { class: 'wz-msg ' + (m.direcao === 'entrada' ? 'entrada' : 'saida') + (m.autor === 'robô' ? ' robo' : '') },
        h('div', { class: 'wz-txt' }, m.texto), h('div', { class: 'wz-meta' }, (m.direcao === 'entrada' ? '' : (m.autor === 'robô' ? '🤖 robô · ' : m.autor ? m.autor + ' · ' : '')) + new Date(m.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })))));
      const ta = h('textarea', { rows: 2, placeholder: r.janela ? 'Escreva a resposta… (o robô pausa nesta conversa)' : 'Passaram 24 h da última mensagem do cliente: o WhatsApp só permite responder pelo seu celular ou depois que ele escrever de novo.', disabled: !r.janela });
      const enviar = h('button', { type: 'button', class: 'btn', disabled: !r.janela }, 'Enviar');
      enviar.addEventListener('click', async () => {
        if (!ta.value.trim()) return; enviar.disabled = true;
        try { await api('whats.acao', { id: aberta.id, acao: 'enviar', texto: ta.value }); ta.value = ''; await telaConversas(params); }
        catch (e) { avisar(e.message, true); enviar.disabled = false; }
      });
      ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) enviar.click(); });
      const d = aberta.dados || {};
      fio = h('div', { class: 'wz-fio' },
        h('header', { class: 'wz-cab' },
          h('div', {}, h('strong', {}, aberta.nome || '+' + aberta.telefone), h('div', { class: 'peq' }, '+' + aberta.telefone + (d.cidade ? ' · ' + d.cidade : '') + (d.area ? ' · ' + d.area : ''))),
          h('div', { class: 'wz-bts' },
            aberta.estado === 'humano' ? botao('🤖 Devolver ao robô', async () => { await api('whats.acao', { id: aberta.id, acao: 'robo' }); avisar('O robô volta a responder esta conversa.'); telaConversas(params); }, 'mini sec')
              : botao('✋ Assumir (pausar o robô)', async () => { await api('whats.acao', { id: aberta.id, acao: 'assumir' }); avisar('Conversa com você: o robô não responde mais aqui.'); telaConversas(params); }, 'mini sec'),
            aberta.lead_id ? h('a', { class: 'btn mini sec', href: '#/crm?ver=lista&q=' + encodeURIComponent(aberta.nome || aberta.telefone) }, 'No CRM') : null,
            aberta.cliente_id ? h('a', { class: 'btn mini sec', href: '#/cliente/' + aberta.cliente_id }, 'Ficha do cliente') : null)),
        d.resumo || d.preferencia ? h('div', { class: 'wz-resumo' }, d.resumo ? h('div', {}, h('b', {}, 'Resumo do caso: '), d.resumo) : null, d.preferencia ? h('div', {}, h('b', {}, 'Quer conversar: '), d.preferencia) : null) : null,
        msgs, h('div', { class: 'wz-resp' }, ta, h('div', { class: 'wz-resp-bt' }, enviar, K().ditado ? K().ditado(ta, aberta.cliente_id) : null)));
      setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 30);
    }
    const status = h('span', { class: 'wz-status ' + (r.ligado && r.configurado ? 'on' : 'off') }, r.configurado ? (r.ligado ? '● Robô respondendo' : '● Robô desligado (só guarda as mensagens)') : '● WhatsApp ainda não ligado');
    const fBusca = h('form', { class: 'wz-busca', role: 'search' }, h('input', { type: 'search', name: 'q', value: params.get('q') || '', placeholder: 'Buscar conversa' }));
    fBusca.addEventListener('submit', ev => { ev.preventDefault(); const q = new URLSearchParams(params); if (fBusca.q.value.trim()) q.set('q', fBusca.q.value.trim()); else q.delete('q'); location.hash = '#/conversas?' + q; });
    mostrar(topo('Relacionamento', 'Conversas do WhatsApp', 'O robô atende 24 h: responde dúvidas, faz a triagem, consulta o processo (com CPF e código) e leva cada contato para o CRM. Urgências vêm direto para a equipe.',
      status, botao('🧪 Testar o robô', () => dialogoTestarRobo(), 'sec'), botao('⚙ Ligar / configurar', () => dialogoWhatsConfig(), 'dourado')),
      r.erro ? h('div', { class: 'nota alerta' }, 'Último problema do WhatsApp: ' + r.erro) : null,
      !r.configurado ? h('div', { class: 'nota' }, 'Falta ligar o WhatsApp: em "⚙ Ligar / configurar" estão os passos (conta do Meta, ponte gratuita na Cloudflare e o token). Enquanto isso, use "🧪 Testar o robô" para ver como ele responde.') : null,
      h('section', { class: 'wz' }, h('aside', { class: 'wz-lado' }, fBusca, lista), fio));
    // atualiza sozinho a cada 20 s enquanto a tela estiver aberta (sem perder o que está sendo digitado)
    const marca = location.hash;
    const iv = setInterval(async () => {
      if (location.hash !== marca || document.hidden) { if (location.hash !== marca) clearInterval(iv); return; }
      const ta = document.querySelector('.wz-resp textarea'); if (ta && ta.value.trim()) return;
      try { const n = await apiFresco('whats.conversas', id ? { id } : {}); if (location.hash === marca && (n.mensagens || []).length !== (r.mensagens || []).length || n.itens.length !== r.itens.length || n.itens.some((x, i) => (r.itens[i] || {}).ultima_em !== x.ultima_em)) { clearInterval(iv); telaConversas(params); } } catch (e) { /* tenta de novo */ }
    }, 20000);
  }
  /** 8.16: conversa de teste com o robô (várias mensagens, como um cliente). Nada é enviado, marcado nem gravado. */
  function dialogoTestarRobo() {
    const { h, api } = K();
    const conversa = h('div', { class: 'wz-sim-conversa', 'aria-live': 'polite' });
    const ta = h('textarea', { rows: 2, placeholder: 'Escreva como se fosse um cliente (Enter manda)' });
    const fase = h('p', { class: 'peq wz-sim-fase' }, 'Comece com "Oi, boa tarde". Depois conte um caso, aceite marcar e escolha um horário.');
    const NOME_FASE = { triagem: 'entendendo o caso', oferta: 'horários oferecidos', agendado: 'atendimento marcado' };
    const balao = (lado, texto, extra) => { const b = h('div', { class: 'wz-msg ' + (lado === 'eu' ? 'entrada' : 'saida robo') }, h('div', { class: 'wz-txt' }, texto), extra || null); conversa.append(b); conversa.scrollTop = conversa.scrollHeight; return b; };
    const mandar = async () => {
      const texto = ta.value.trim(); if (!texto) return;
      ta.value = ''; bt.disabled = true; balao('eu', texto); const pensando = balao('robo', '…');
      try {
        const r = await api('whats.config', { simular: texto }); const s2 = r.simulacao || {};
        pensando.replaceWith(balao('robo', s2.resposta || '—', s2.acoes && s2.acoes.length ? h('ul', { class: 'wz-sim-acoes' }, s2.acoes.map(x => h('li', {}, '⚙ ' + x))) : null));
        fase.textContent = 'Etapa: ' + (NOME_FASE[s2.fase] || s2.fase || '—') + (s2.area ? ' · ' + s2.area : '') + (s2.resumo ? ' · ' + s2.resumo : '') + (s2.pausado ? ' · robô pausado (equipe assumiu)' : '');
      } catch (e) { pensando.replaceWith(balao('robo', '⚠ ' + e.message)); }
      finally { bt.disabled = false; ta.focus(); }
    };
    const bt = h('button', { type: 'button', class: 'btn', onclick: mandar }, 'Mandar');
    ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); mandar(); } });
    const recomecar = h('button', { type: 'button', class: 'btn sec', onclick: async () => { await api('whats.config', { reiniciar: true }).catch(() => {}); conversa.replaceChildren(); fase.textContent = 'Conversa nova.'; ta.focus(); } }, 'Recomeçar');
    api('whats.config', { reiniciar: true }).catch(() => {});
    dialogo('wz-sim-dialogo', h('h2', {}, '🧪 Testar o robô'),
      h('p', { class: 'peq' }, 'Converse como se fosse um cliente. Nada é enviado a ninguém e nada é marcado na agenda: as linhas ⚙ mostram o que ele faria de verdade (agenda, cadastro, funil, equipe). Os horários oferecidos são os livres da agenda de verdade.'),
      conversa, fase, ta, h('div', { class: 'g-acoes' }, bt, recomecar));
    setTimeout(() => ta.focus(), 50);
  }
  async function dialogoWhatsConfig() {
    const { h, api, avisar, campo } = K();
    let c, equipe = [];
    try { [c, equipe] = await Promise.all([api('whats.config', {}), api('equipe.listar', {}).catch(() => [])]); } catch (e) { avisar(e.message, true); return; }
    const copiar1 = (rot, val) => h('div', { class: 'wz-copia' }, h('span', {}, rot), h('code', {}, val), h('button', { type: 'button', class: 'btn mini sec', onclick: () => copiar(val, 'Copiado.') }, 'Copiar'));
    const form = h('form', { class: 'g-form form-grade' },
      h('h2', { class: 'largo' }, '⚙ Ligar o WhatsApp'),
      h('ol', { class: 'largo wz-passos' },
        h('li', {}, 'No Meta (developers.facebook.com › Meus apps › Criar app › Empresa › WhatsApp), ligue o número do escritório. Se ele continua no aplicativo do celular, escolha a opção de usar o mesmo número no aplicativo e na API ("coexistência").'),
        h('li', {}, 'Crie a ponte grátis na Cloudflare (Workers › Criar › colar o arquivo chatbot/worker.js do site) e coloque nas variáveis: VERIFY_TOKEN (uma senha que você inventar), APP_SECRET (do app no Meta), e as duas abaixo:'),
        h('li', { class: 'wz-copias' }, copiar1('PAINEL_URL', window.PAINEL_API_URL || c.urlPainel || '(o endereço /exec do programa do Google)'), copiar1('PAINEL_CHAVE', c.chavePonte)),
        h('li', {}, 'No Meta › WhatsApp › Configuração: URL de retorno = endereço da ponte, token de verificação = o VERIFY_TOKEN; assine o campo "messages" (e "smb_message_echoes" se usar o celular junto).'),
        h('li', {}, 'Cole aqui o token permanente (usuário do sistema do Meta) e o "Phone number ID", salve, teste e ligue o robô.')),
      campo('token', c.temToken ? 'Token do Meta (já cadastrado; cole outro para trocar)' : 'Token do Meta (permanente)', '', { tipo: 'password', auto: 'off', largo: true }),
      campo('phone_id', 'Phone number ID', c.phone_id, { modo: 'numeric' }),
      campo('resp', 'Quem recebe as tarefas do WhatsApp', c.resp, { opcoes: [['', 'Secretaria / padrão']].concat(equipe.map(p => [p.usuario, p.nome])) }),
      h('label', { class: 'largo g-opcao' }, h('input', { type: 'checkbox', name: 'ligado', checked: c.ligado }), ' Robô respondendo sozinho (desligado, ele só guarda as mensagens para a equipe responder por aqui)'),
      c.iaLigada ? null : h('p', { class: 'largo nota alerta' }, 'A IA (chave do Gemini) não está cadastrada: o robô só consegue passar as mensagens para a equipe. Cadastre em Gerenciar acessos › IA.'),
      h('div', { class: 'largo g-acoes' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
        h('button', { type: 'button', class: 'btn sec', onclick: async () => { const n = prompt('Mandar uma mensagem de teste para qual número? (com 55 e DDD, ex.: 5548999998888)'); if (!n) return; try { await api('whats.config', { testar: n }); avisar('Mensagem de teste enviada.'); } catch (e) { avisar(e.message, true); } } }, 'Mandar um teste'),
        h('button', { type: 'button', class: 'btn sec', onclick: async () => { if (!confirm('Gerar uma chave nova da ponte? Depois troque PAINEL_CHAVE na Cloudflare.')) return; await api('whats.config', { novaChave: true }); d.close(); dialogoWhatsConfig(); } }, 'Gerar nova chave da ponte')),
      c.ultima ? h('p', { class: 'peq largo' }, 'Última mensagem recebida: ' + new Date(c.ultima).toLocaleString('pt-BR')) : null,
      c.erro ? h('p', { class: 'peq largo erro' }, 'Último problema: ' + c.erro) : null, h('p', { class: 'erro largo' }));
    const d = dialogo('wz-config', form);
    K().aoEnviar(form, async f => {
      const dados = { phone_id: f.get('phone_id') || '', resp: f.get('resp') || '', ligado: f.get('ligado') === 'on' };
      if (f.get('token')) dados.token = f.get('token');
      await api('whats.config', dados); d.close(); avisar('WhatsApp salvo.'); location.reload();
    });
  }

  window.GESTAO = { mandarLinkCadastro, telaConversas, telaCrm, telaCalculadoras, telaTranscricao, telaPadroes, blocoRecibos, blocoPainelFinanceiro, dialogoProposta };
})();
