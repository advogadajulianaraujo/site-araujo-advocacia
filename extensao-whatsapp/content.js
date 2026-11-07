/* Assistente Araújo Advocacia dentro do WhatsApp Web.
   - Ao lado da conversa aberta: quem é a pessoa no painel (cliente / contato do funil), a etapa, processos, parcelas e anotações.
   - Na lista de conversas: uma etiqueta com a etapa de cada contato.
   - Sozinho: contato novo falando de um problema jurídico entra no funil; o link do cadastro mandado e a procuração/contrato
     enviados fazem o cartão andar de etapa.
   - Nunca manda mensagem sozinho: as mensagens prontas vão para a caixa de texto e a pessoa da equipe aperta Enviar.
   Só lê a tela do WhatsApp Web deste computador; nada é guardado aqui além das preferências. */
(() => {
  'use strict';
  if (window.__araujoAssistente) return;
  window.__araujoAssistente = true;

  const PAINEL = 'https://araujoadvocaciasc.com.br/painel/';
  const CORES = { novo: '#2f6fd0', contato: '#5b6ee1', cadastro: '#7a4fc0', cliente: '#1d8a8a', atendido: '#c98a12', proposta: '#d0602d', ganho: '#1f8a4c', perdido: '#8d8a83', cliente_antigo: '#3a3a3a' };
  const CURTO = { novo: 'Novo', contato: 'Conversa', cadastro: 'Cadastro enviado', cliente: 'Cadastro ok', atendido: 'Atendimento', proposta: 'Procuração/contrato', ganho: 'Contratou', perdido: 'Não fechou', cliente_antigo: 'Cliente' };
  const ORDEM = ['novo', 'contato', 'cadastro', 'cliente', 'atendido', 'proposta', 'ganho'];
  let conf = { auto: true, etiquetas: true, aberto: true }, pareado = false, usuario = '';

  /* ---------- comunicação com o painel (pelo bg.js) ---------- */
  const api = (acao, dados) => new Promise((ok, falha) => {
    try {
      chrome.runtime.sendMessage({ tipo: 'api', acao, dados }, r => {
        if (chrome.runtime.lastError) return falha(new Error('A extensão foi atualizada: recarregue a página do WhatsApp (F5).'));
        if (!r || !r.ok) { if (r && r.sessao) { pareado = false; desenhar(); } return falha(new Error((r && r.erro) || 'O painel não respondeu.')); }
        ok(r.dados);
      });
    } catch (e) { falha(new Error('A extensão foi atualizada: recarregue a página do WhatsApp (F5).')); }
  });

  /* ---------- leitura da tela do WhatsApp Web (com alternativas, porque o WhatsApp muda o visual de vez em quando) ---------- */
  function chatAtual() {
    const main = document.querySelector('#main');
    if (!main) return null;
    const header = main.querySelector('header');
    let titulo = '';
    if (header) for (const s of header.querySelectorAll('span[dir="auto"], span[title]')) { const t = (s.getAttribute('title') || s.textContent || '').trim(); if (t && t.length < 80) { titulo = t; break; } }
    let telefone = '', grupo = false;
    for (const el of main.querySelectorAll('[data-id]')) {
      const id = el.getAttribute('data-id') || '';
      if (/@g\.us/.test(id)) { grupo = true; break; }
      const m = /(?:true|false)_(\d{10,15})@c\.us/.exec(id);
      if (m) { telefone = m[1]; break; }
    }
    if (!telefone && /^\+?[\d\s()\-]{10,}$/.test(titulo)) telefone = titulo.replace(/\D/g, '');
    if (!titulo && !telefone) return null;
    return { titulo, telefone, grupo, chave: telefone || titulo };
  }
  function mensagens() {
    const main = document.querySelector('#main'); if (!main) return [];
    const vistas = new Set(), out = [];
    main.querySelectorAll('[data-id^="true_"], [data-id^="false_"]').forEach(el => {
      const id = el.getAttribute('data-id'); if (vistas.has(id)) return; vistas.add(id);
      const dir = id.startsWith('true_') ? 'out' : 'in';
      const bloco = el.querySelector('.copyable-text') || el;
      let texto = (bloco.querySelector('span.selectable-text') || bloco).innerText || '';
      texto = texto.replace(/\n?\d{1,2}:\d{2}\s*$/, '').trim();
      const arq = (el.innerText.match(/[^\n/\\]{2,80}\.(pdf|docx?|odt)\b/i) || [])[0] || '';
      if (texto || arq) out.push({ id, dir, texto: texto.slice(0, 800), arquivo: arq });
    });
    return out;
  }
  /** Põe o texto na caixa de mensagem da conversa aberta (sem enviar: quem envia é a pessoa). */
  function colocarNaCaixa(texto) {
    const box = document.querySelector('#main footer div[contenteditable="true"]') || document.querySelector('footer div[contenteditable="true"]');
    if (!box) { aviso('Não achei a caixa de mensagem: abra a conversa e tente de novo.', true); return false; }
    box.focus();
    let colou = false;
    try { const dt = new DataTransfer(); dt.setData('text/plain', texto); colou = box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) === false || (box.innerText || '').includes(texto.slice(0, 15)); } catch (e) { colou = false; }
    if (!colou || !(box.innerText || '').includes(texto.slice(0, 15))) { document.execCommand('insertText', false, texto); }
    aviso('Mensagem colocada na caixa. Confira e aperte Enviar.');
    return true;
  }

  /* ---------- painel lateral (Shadow DOM: o visual do WhatsApp não interfere) ---------- */
  const host = document.createElement('div');
  host.id = 'araujo-assistente';
  document.documentElement.appendChild(host);
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:"Segoe UI",Roboto,Arial,sans-serif}
    .lado{position:fixed;top:0;right:0;width:340px;height:100vh;background:#fbfaf7;border-left:1px solid #e3dfd6;z-index:2147483000;display:flex;flex-direction:column;color:#2e2f33;font-size:13.5px;box-shadow:-6px 0 18px -10px rgba(0,0,0,.25)}
    .lado[hidden]{display:none}
    .topo{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1c1a17;color:#f1e9da}
    .marca{width:28px;height:28px;border-radius:7px;background:#b58d52;color:#1c1a17;display:grid;place-items:center;font:700 16px Georgia,serif}
    .topo b{font-size:14px;flex:1}
    .topo button{background:none;border:0;color:#d9cfbd;font-size:18px;cursor:pointer;padding:4px 6px;border-radius:6px}
    .topo button:hover{background:rgba(255,255,255,.1)}
    .corpo{flex:1;overflow-y:auto;padding:12px}
    .aba{position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:2147483000;background:#1c1a17;color:#b58d52;border:0;border-radius:10px 0 0 10px;padding:14px 8px;cursor:pointer;font:700 16px Georgia,serif;box-shadow:-3px 0 10px rgba(0,0,0,.25)}
    .aba[hidden]{display:none}
    h3{margin:0 0 2px;font-size:16px;color:#16171a}
    .peq{font-size:12px;color:#6f6f76}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:600;color:#fff;background:#888;margin:2px 4px 2px 0}
    .caixa{background:#fff;border:1px solid #e9e5dc;border-radius:12px;padding:10px 12px;margin:10px 0}
    .caixa h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7a5a1f}
    .etapas{display:flex;flex-wrap:wrap;gap:4px}
    .etapas button{border:1px solid #e3dfd6;background:#fff;border-radius:999px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:#2e2f33}
    .etapas button.ativa{color:#fff;border-color:transparent}
    .etapas button:hover{border-color:#b58d52}
    .bt{display:block;width:100%;margin:6px 0 0;padding:9px 10px;border-radius:9px;border:1px solid #1c1a17;background:#1c1a17;color:#fff;font-size:13px;cursor:pointer;text-align:center;text-decoration:none}
    .bt.sec{background:#fff;color:#1c1a17;border-color:#d7d3ca}
    .bt.ouro{background:#b58d52;border-color:#b58d52;color:#1c1a17;font-weight:600}
    .bt:disabled{opacity:.6;cursor:wait}
    ul{margin:4px 0 0;padding-left:18px}li{margin:2px 0}
    textarea{width:100%;border:1px solid #d7d3ca;border-radius:8px;padding:8px;font-size:13px;resize:vertical}
    .sug{background:#e9f7ee;border:1px solid #cde6d6;border-radius:10px;padding:8px 10px;white-space:pre-wrap;margin-top:6px}
    .alerta{background:#fbf1d6;border:1px solid #eadcbe;border-radius:10px;padding:8px 10px;margin:8px 0}
    .erro{color:#a3221a}
    .vermelho{color:#a3221a;font-weight:600}
    input[type=text]{width:100%;border:1px solid #d7d3ca;border-radius:8px;padding:9px;font-size:16px;letter-spacing:.2em;text-transform:uppercase;text-align:center}
    .msg{position:fixed;bottom:16px;right:356px;z-index:2147483001;background:#1c1a17;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;max-width:320px;box-shadow:0 8px 20px rgba(0,0,0,.3)}
    .msg.ruim{background:#a3221a}.msg[hidden]{display:none}
    a{color:#7a5a1f}
  </style>
  <button class="aba" title="Abrir o assistente do escritório" hidden>A</button>
  <aside class="lado"><div class="topo"><span class="marca">A</span><b>Araújo Advocacia</b><button class="recarregar" title="Atualizar">⟳</button><button class="fechar" title="Esconder o assistente">×</button></div><div class="corpo"></div></aside>
  <div class="msg" hidden></div>`;
  const lado = raiz.querySelector('.lado'), corpo = raiz.querySelector('.corpo'), aba = raiz.querySelector('.aba'), msgEl = raiz.querySelector('.msg');
  let msgTimer;
  function aviso(t, ruim) { msgEl.textContent = t; msgEl.className = 'msg' + (ruim ? ' ruim' : ''); msgEl.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { msgEl.hidden = true; }, ruim ? 6000 : 3500); }
  function abrir(sim) {
    conf.aberto = sim; chrome.storage.local.set({ aberto: sim });
    lado.hidden = !sim; aba.hidden = sim;
    document.documentElement.classList.toggle('araujo-aberto', sim);
    msgEl.style.right = sim ? '356px' : '16px';
  }
  raiz.querySelector('.fechar').addEventListener('click', () => abrir(false));
  aba.addEventListener('click', () => abrir(true));
  raiz.querySelector('.recarregar').addEventListener('click', () => { atual = null; dadosContato = null; verificar(true); });

  /* mini "h" para montar a tela sem innerHTML com dados */
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style') el.style.cssText = v; else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const f of filhos.flat(9)) { if (f === null || f === undefined || f === false) continue; el.append(f instanceof Node ? f : document.createTextNode(String(f))); }
    return el;
  }
  const botao = (texto, fn, cls) => h('button', { class: 'bt ' + (cls || ''), onclick: async ev => { const b = ev.currentTarget; b.disabled = true; try { await fn(b); } catch (e) { aviso(e.message, true); } finally { b.disabled = false; } } }, texto);
  const dataBR = iso => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

  /* ---------- estado ---------- */
  let atual = null, dadosContato = null, analise = null, etapas = [];
  const eventosFeitos = new Set();

  function telaPareamento() {
    const inp = h('input', { type: 'text', maxlength: 6, placeholder: 'ABC234', 'aria-label': 'Código do painel' });
    const erro = h('p', { class: 'erro' });
    corpo.replaceChildren(h('h3', {}, 'Ligar o assistente'),
      h('p', {}, 'No painel do escritório, abra o menu do seu nome › Gerenciar acessos › "Extensão do WhatsApp Web" e clique em "Gerar código". Digite o código aqui:'),
      inp, botao('Ligar este computador', async () => {
        erro.textContent = '';
        const r = await new Promise(ok => chrome.runtime.sendMessage({ tipo: 'ativar', codigo: inp.value, nome: 'WhatsApp Web — ' + (navigator.platform || 'computador') }, ok));
        if (!r || !r.ok) { erro.textContent = (r && r.erro) || 'Não consegui ligar.'; return; }
        pareado = true; usuario = r.dados.usuario; aviso('Assistente ligado. Bem-vinda, ' + usuario + '!'); atual = null; verificar(true);
      }, 'ouro'), erro,
      h('p', { class: 'peq' }, 'O código vale 10 minutos e uma vez só. A chave fica só neste Chrome e pode ser desligada no painel a qualquer momento.'));
  }

  function etapaBotoes(lead) {
    const nomes = Object.fromEntries(etapas);
    return h('div', { class: 'etapas' }, etapas.filter(([id]) => id !== 'perdido').map(([id, nome]) => {
      const b = h('button', { class: lead.etapa === id ? 'ativa' : '', title: 'Mudar para: ' + nome, onclick: async () => {
        if (id === lead.etapa) return;
        try { await api('ext.etapa', { id: lead.id, etapa: id }); aviso('Etapa: ' + nome); atual = null; verificar(true); } catch (e) { aviso(e.message, true); }
      } }, nome);
      if (lead.etapa === id) b.style.background = CORES[id] || '#555';
      return b;
    }), h('button', { title: 'Não fechou', onclick: async () => {
      const motivo = prompt('Por que não fechou? (preço, outro escritório, sem direito, desistiu, não respondeu…)'); if (!motivo) return;
      try { await api('ext.etapa', { id: lead.id, etapa: 'perdido', motivo }); aviso('Marcado: não fechou.'); atual = null; verificar(true); } catch (e) { aviso(e.message, true); }
    } }, nomes.perdido || 'Não fechou'));
  }
  function caixaSugestao(objetivo) {
    const box = h('div', {});
    const bt = botao('✍ Sugerir uma resposta', async () => {
      box.replaceChildren(h('p', { class: 'peq' }, 'Lendo a conversa…'));
      const r = await api('ext.analisar', { mensagens: mensagens().map(m => ({ dir: m.dir, texto: m.texto || ('[documento] ' + m.arquivo) })), objetivo });
      analise = r;
      box.replaceChildren(r.sugestao ? h('div', {}, h('div', { class: 'sug' }, r.sugestao), botao('Colocar na caixa de mensagem', () => colocarNaCaixa(r.sugestao), 'sec')) : h('p', { class: 'peq' }, 'Sem sugestão agora.'),
        r.proximo_passo ? h('p', { class: 'peq' }, 'Próximo passo: ' + r.proximo_passo) : null);
    }, 'sec');
    return h('div', {}, bt, box);
  }
  function caixaAnotar(alvo) {
    const ta = h('textarea', { rows: 2, placeholder: 'Anotar no painel (ex.: vai mandar os documentos amanhã)' });
    return h('div', { class: 'caixa' }, h('h4', {}, 'Anotar no painel'), ta, botao('Anotar', async () => {
      if (!ta.value.trim()) return;
      await api('ext.anotar', Object.assign({ texto: ta.value, contato: true }, alvo)); ta.value = ''; aviso('Anotado no painel.');
    }, 'sec'));
  }

  function desenharContato(r) {
    const lead = r.lead, cli = r.cliente;
    const nome = (cli && cli.nome) || (lead && lead.nome) || atual.titulo;
    const partes = [h('h3', {}, nome), h('div', {}, cli ? h('span', { class: 'tag', style: 'background:#3a3a3a' }, 'Cliente') : h('span', { class: 'tag', style: 'background:#2f6fd0' }, 'Contato do funil'),
      lead ? h('span', { class: 'tag', style: 'background:' + (CORES[lead.etapa] || '#888') }, (Object.fromEntries(etapas))[lead.etapa] || lead.etapa) : null),
      atual.telefone ? h('div', { class: 'peq' }, '+' + atual.telefone) : null];
    if (lead) {
      partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'Etapa no funil'), etapaBotoes(lead),
        lead.proxima_acao ? h('p', { class: 'peq' }, '→ ' + lead.proxima_acao + (lead.proxima_data ? ' · ' + dataBR(lead.proxima_data) : '')) : null,
        lead.assunto ? h('p', {}, lead.assunto) : null));
    }
    const precisaCadastro = !cli || (cli.faltam && cli.faltam.length);
    if (lead && precisaCadastro) partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'Cadastro'),
      lead.cadastro_pendente ? h('p', { class: 'peq' }, 'Link do cadastro já enviado e ainda não preenchido.') : (cli && cli.faltam.length ? h('p', { class: 'peq' }, 'Falta no cadastro: ' + cli.faltam.join(', ')) : null),
      botao(lead.cadastro_pendente ? '📝 Mandar o link do cadastro de novo' : '📝 Mandar o link do cadastro', async () => {
        const k = await api('ext.linkCadastro', { id: lead.id }); colocarNaCaixa(k.mensagem); eventosFeitos.add(atual.chave + '|cadastro'); atual = null; verificar(true);
      }, 'ouro')));
    if (!lead && cli && cli.faltam && cli.faltam.length) partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'Cadastro'), h('p', { class: 'peq' }, 'Falta no cadastro: ' + cli.faltam.join(', ')),
      botao('📝 Mandar o link para completar', async () => { const k = await api('ext.linkCadastro', { cliente_id: cli.id }); colocarNaCaixa(k.mensagem); atual = null; verificar(true); }, 'ouro')));
    if (cli) {
      const p = cli.parcelas || {};
      partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'No escritório'),
        cli.processos.length ? h('ul', {}, cli.processos.map(x => h('li', {}, (x.area ? x.area + ' · ' : '') + x.numero + (x.fase ? ' — ' + x.fase : '') + (x.proximo ? ' · ' + x.proximo : '')))) : h('p', { class: 'peq' }, 'Sem processo em andamento.'),
        cli.assinatura === 'aguardando' ? h('p', { class: 'vermelho' }, '✍ Procuração/contrato aguardando assinatura') : null,
        p.abertas ? h('p', { class: p.atrasadas ? 'vermelho' : '' }, `💰 ${p.abertas} parcela(s) em aberto` + (p.atrasadas ? `, ${p.atrasadas} atrasada(s)` : '')) : null,
        cli.observacoes.length ? h('div', {}, h('p', { class: 'peq' }, 'Últimas anotações:'), h('ul', {}, cli.observacoes.map(o => h('li', { class: 'peq' }, o)))) : null));
    }
    partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'Responder'), caixaSugestao(lead && lead.etapa === 'novo' ? 'acolher e entender o caso' : '')));
    partes.push(caixaAnotar(lead ? { id: lead.id } : { cliente_id: cli.id }));
    if (lead && lead.historico && lead.historico.length) partes.push(h('div', { class: 'caixa' }, h('h4', {}, 'Histórico'), h('ul', {}, lead.historico.map(x => h('li', { class: 'peq' }, x)))));
    partes.push(h('a', { class: 'bt sec', href: cli ? PAINEL + '#/cliente/' + cli.id : PAINEL + '#/crm?ver=lista&q=' + encodeURIComponent(nome), target: '_blank', rel: 'noopener' }, 'Abrir no painel'));
    corpo.replaceChildren(...partes);
  }
  function desenharNovo() {
    const partes = [h('h3', {}, atual.titulo || '+' + atual.telefone), h('div', {}, h('span', { class: 'tag', style: 'background:#8d8a83' }, 'Não está no painel'))];
    const box = h('div', { class: 'caixa' });
    const adicionar = botao('＋ Adicionar ao funil (contato novo)', async () => {
      const a = analise || {};
      await api('ext.adicionar', { titulo: atual.titulo, telefone: atual.telefone, nome: a.nome || '', area: a.area || '', resumo: a.resumo || '' });
      aviso('Adicionado ao funil.'); atual = null; verificar(true);
    }, 'ouro');
    if (analise) box.append(h('h4', {}, analise.novo_cliente ? 'Parece cliente novo' : 'O que a IA entendeu'),
      analise.area ? h('p', {}, 'Área: ', h('b', {}, analise.area)) : null, analise.resumo ? h('p', {}, analise.resumo) : null,
      analise.proximo_passo ? h('p', { class: 'peq' }, 'Próximo passo: ' + analise.proximo_passo) : null);
    else box.append(h('p', { class: 'peq' }, 'Contato que ainda não está no painel.'));
    box.append(adicionar);
    partes.push(box, h('div', { class: 'caixa' }, h('h4', {}, 'Responder'), caixaSugestao('acolher e entender o caso')));
    corpo.replaceChildren(...partes);
  }
  function desenhar() {
    if (!pareado) return telaPareamento();
    if (!atual) return corpo.replaceChildren(h('h3', {}, 'Olá' + (usuario ? ', ' + usuario.split(' ')[0] : '') + '!'), h('p', {}, 'Abra uma conversa para ver quem é a pessoa no painel.'),
      h('p', { class: 'peq' }, conf.auto ? 'Contato novo falando de um caso entra no funil sozinho. ' : '', 'As etiquetas na lista mostram a etapa de cada contato.'));
    if (atual.grupo) return corpo.replaceChildren(h('h3', {}, atual.titulo), h('p', { class: 'peq' }, 'Grupo: o assistente trabalha só nas conversas individuais.'));
    if (!dadosContato) return corpo.replaceChildren(h('h3', {}, atual.titulo), h('p', { class: 'peq' }, 'Procurando no painel…'));
    if (dadosContato.achou) desenharContato(dadosContato); else desenharNovo();
  }

  /* ---------- o que acontece sozinho ---------- */
  async function verificar(forcar) {
    if (!pareado) return desenhar();
    const c = chatAtual();
    const mudou = !c ? !!atual : (!atual || c.chave !== atual.chave);
    if (!mudou && !forcar) return;
    atual = c; dadosContato = null; analise = null; desenhar();
    if (!c || c.grupo) return;
    const pedido = c.chave;
    try {
      const r = await api('ext.contato', { titulo: c.titulo, telefone: c.telefone });
      if (!atual || atual.chave !== pedido) return;
      etapas = r.etapas || etapas; dadosContato = r; desenhar();
      if (!r.achou) analisarNovo(pedido);
      else olharEventos();
    } catch (e) { if (atual && atual.chave === pedido) corpo.replaceChildren(h('h3', {}, c.titulo), h('p', { class: 'erro' }, e.message)); }
  }
  /** Contato que não está no painel: a IA lê a conversa uma vez por dia; se for alguém procurando o escritório, entra no funil sozinho. */
  async function analisarNovo(chave) {
    const msgs = mensagens(); if (!msgs.some(m => m.dir === 'in')) return;
    const k = 'analisado:' + chave, hoje = new Date().toISOString().slice(0, 10);
    const ja = (await chrome.storage.local.get(k))[k];
    try {
      const r = await api('ext.analisar', { mensagens: msgs.map(m => ({ dir: m.dir, texto: m.texto || ('[documento] ' + m.arquivo) })) });
      if (!atual || atual.chave !== chave) return;
      analise = r; desenhar();
      if (r.novo_cliente && conf.auto && ja !== hoje) {
        chrome.storage.local.set({ [k]: hoje });
        await api('ext.adicionar', { titulo: atual.titulo, telefone: atual.telefone, nome: r.nome || '', area: r.area || '', resumo: r.resumo || '' });
        aviso('Contato novo: entrou no funil como "Em conversa".'); atual = null; verificar(true);
      }
    } catch (e) { /* segue com o botão manual */ }
  }
  /** Link do cadastro mandado / procuração e contrato enviados nesta conversa → o cartão anda sozinho. */
  async function olharEventos() {
    if (!atual || !dadosContato || !dadosContato.achou) return;
    const lead = dadosContato.lead; if (!lead) return;
    const msgs = mensagens().filter(m => m.dir === 'out');
    const pos = e => ORDEM.indexOf(e);
    if (pos(lead.etapa) < pos('cadastro') && msgs.some(m => /araujoadvocaciasc\.com\.br\/cadastro/i.test(m.texto)) && !eventosFeitos.has(atual.chave + '|cadastro')) {
      eventosFeitos.add(atual.chave + '|cadastro');
      try { const r = await api('ext.evento', { tipo: 'link_cadastro', titulo: atual.titulo, telefone: atual.telefone }); if (r.etapa) { aviso('Etapa: Cadastro enviado'); atual = null; verificar(true); return; } } catch (e) { /* segue */ }
    }
    const doc = msgs.find(m => /procura[cç][aã]o|contrato/i.test(m.arquivo || ''));
    if (doc && pos(lead.etapa) < pos('proposta') && pos(lead.etapa) >= 0 && !eventosFeitos.has(atual.chave + '|docs')) {
      eventosFeitos.add(atual.chave + '|docs');
      try { const r = await api('ext.evento', { tipo: 'documentos', arquivo: doc.arquivo, titulo: atual.titulo, telefone: atual.telefone }); if (r.etapa) { aviso('Etapa: Procuração e contrato enviados'); atual = null; verificar(true); } } catch (e) { /* segue */ }
    }
  }

  /* ---------- etiquetas na lista de conversas ---------- */
  const cacheEtq = new Map(); let pedindo = false;
  function linhasDaLista() { const lado = document.querySelector('#pane-side'); return lado ? Array.from(lado.querySelectorAll('[role="listitem"], [role="row"]')) : []; }
  function tituloDaLinha(el) { const s = el.querySelector('span[title]'); return s ? (s.getAttribute('title') || '').trim() : ''; }
  async function etiquetas() {
    if (!pareado || !conf.etiquetas || pedindo) return;
    const linhas = linhasDaLista(); if (!linhas.length) return;
    const agora = Date.now(), faltam = [];
    linhas.forEach(el => { const t = tituloDaLinha(el); if (t && !(cacheEtq.has(t) && agora - cacheEtq.get(t).t < 180000)) faltam.push(t); });
    if (faltam.length) {
      pedindo = true;
      try {
        const r = await api('ext.contatos', { itens: [...new Set(faltam)].slice(0, 80).map(t => ({ titulo: t, chave: t })) });
        etapas = r.etapas || etapas;
        faltam.forEach(t => cacheEtq.set(t, { t: agora, v: r.itens[t] || null }));
      } catch (e) { /* tenta depois */ } finally { pedindo = false; }
    }
    linhas.forEach(el => {
      const t = tituloDaLinha(el), info = cacheEtq.get(t), v = info && info.v;
      let tag = el.querySelector('.araujo-etq');
      if (!v) { if (tag) tag.remove(); return; }
      const texto = CURTO[v.etapa] || 'Cliente', cor = CORES[v.etapa] || '#3a3a3a';
      if (!tag) { tag = document.createElement('span'); tag.className = 'araujo-etq'; const s = el.querySelector('span[title]'); (s && s.parentElement ? s.parentElement : el).appendChild(tag); }
      if (tag.textContent !== texto) tag.textContent = texto;
      tag.style.background = cor;
    });
  }

  /* ---------- começar ---------- */
  chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas', 'aberto'], v => {
    pareado = !!v.token; usuario = v.usuario || '';
    conf.auto = v.auto !== false; conf.etiquetas = v.etiquetas !== false; conf.aberto = v.aberto !== false;
    abrir(conf.aberto); desenhar();
    setInterval(() => verificar(false), 1500);
    setInterval(etiquetas, 6000);
    let obsT = null;
    new MutationObserver(() => { clearTimeout(obsT); obsT = setTimeout(olharEventos, 2000); }).observe(document.body, { childList: true, subtree: true });
  });
  chrome.storage.onChanged.addListener(m => {
    if (m.token) { pareado = !!m.token.newValue; atual = null; verificar(true); }
    if (m.auto) conf.auto = m.auto.newValue !== false;
    if (m.etiquetas) { conf.etiquetas = m.etiquetas.newValue !== false; if (!conf.etiquetas) document.querySelectorAll('.araujo-etq').forEach(e => e.remove()); }
  });
})();
