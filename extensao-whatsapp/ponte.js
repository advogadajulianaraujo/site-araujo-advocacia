/* 1.2.0 Ponte do painel → WhatsApp Web (pedido da usuária: "os botões do WhatsApp Web não vão").
   O WhatsApp Web não deixa o painel reaproveitar a aba dele (cada clique abria outra aba e pedia "Usar aqui").
   Com a extensão, o painel avisa esta ponte e a extensão abre a conversa NA ABA DO WHATSAPP QUE JÁ ESTÁ ABERTA. Nada é enviado sozinho:
   a mensagem fica escrita na caixa e a pessoa aperta Enviar. */
document.documentElement.dataset.araujoWhats = '1.2.0';
window.addEventListener('message', ev => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const d = ev.data || {};
  if (d.araujo !== 'whats' || !/^\d{12,13}$/.test(String(d.tel || ''))) return;
  try { chrome.runtime.sendMessage({ tipo: 'abrirWhats', tel: String(d.tel), texto: String(d.texto || '').slice(0, 6000) }); } catch (e) { /* extensão recarregada: o painel usa o caminho antigo */ }
});
