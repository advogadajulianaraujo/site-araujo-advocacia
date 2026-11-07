const $ = id => document.getElementById(id);
function mostrar(v) {
  const ligado = !!v.token;
  $('ligado').hidden = !ligado; $('desligado').hidden = ligado;
  $('quem').textContent = v.usuario ? 'Usuário: ' + v.usuario : '';
  $('auto').checked = v.auto !== false; $('etiquetas').checked = v.etiquetas !== false;
}
chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas'], mostrar);
$('ligar').addEventListener('click', () => {
  $('erro').textContent = ''; $('ligar').disabled = true;
  chrome.runtime.sendMessage({ tipo: 'ativar', codigo: $('codigo').value, nome: 'WhatsApp Web — ' + (navigator.platform || 'computador') }, r => {
    $('ligar').disabled = false;
    if (!r || !r.ok) { $('erro').textContent = (r && r.erro) || 'Não consegui ligar.'; return; }
    chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas'], mostrar);
  });
});
$('codigo').addEventListener('keydown', e => { if (e.key === 'Enter') $('ligar').click(); });
$('auto').addEventListener('change', e => chrome.storage.local.set({ auto: e.target.checked }));
$('etiquetas').addEventListener('change', e => chrome.storage.local.set({ etiquetas: e.target.checked }));
$('abrirWa').addEventListener('click', () => chrome.tabs.create({ url: 'https://web.whatsapp.com/' }));
$('sair').addEventListener('click', async () => {
  if (!confirm('Desligar o assistente neste computador?')) return;
  await chrome.storage.local.remove(['token', 'usuario']);
  chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas'], mostrar);
});
