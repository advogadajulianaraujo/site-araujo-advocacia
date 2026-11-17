const $ = id => document.getElementById(id);
function mostrar(v) {
  const ligado = !!v.token;
  $('ligado').hidden = !ligado; $('desligado').hidden = ligado;
  $('quem').textContent = v.usuario ? 'Usuário: ' + v.usuario : '';
  $('djen').checked = v.djen !== false; $('djenMsg').textContent = v.djen_msg || 'DJEN: ainda não lido por esta extensão.';
  $('auto').checked = v.auto !== false; $('escrever').checked = v.escrever !== false; $('etiquetas').checked = v.etiquetas !== false;
}
chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas', 'escrever', 'djen', 'djen_msg'], mostrar);
$('ligar').addEventListener('click', () => {
  $('erro').textContent = ''; $('ligar').disabled = true;
  chrome.runtime.sendMessage({ tipo: 'ativar', codigo: $('codigo').value, nome: 'WhatsApp Web — ' + (navigator.platform || 'computador') }, r => {
    $('ligar').disabled = false;
    if (!r || !r.ok) { $('erro').textContent = (r && r.erro) || 'Não consegui ligar.'; return; }
    chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas', 'escrever', 'djen', 'djen_msg'], mostrar);
  });
});
$('codigo').addEventListener('keydown', e => { if (e.key === 'Enter') $('ligar').click(); });
$('auto').addEventListener('change', e => chrome.storage.local.set({ auto: e.target.checked }));
$('escrever').addEventListener('change', e => chrome.storage.local.set({ escrever: e.target.checked }));
$('etiquetas').addEventListener('change', e => chrome.storage.local.set({ etiquetas: e.target.checked }));
$('abrirWa').addEventListener('click', () => chrome.tabs.create({ url: 'https://web.whatsapp.com/' }));
$('sair').addEventListener('click', async () => {
  if (!confirm('Desligar o assistente neste computador?')) return;
  await chrome.storage.local.remove(['token', 'usuario']);
  chrome.storage.local.get(['token', 'usuario', 'auto', 'etiquetas', 'escrever', 'djen', 'djen_msg'], mostrar);
});
$('djen').addEventListener('change', e => chrome.storage.local.set({ djen: e.target.checked }));
$('djenAgora').addEventListener('click', () => {
  $('djenAgora').disabled = true; $('djenMsg').textContent = 'Lendo o DJEN… (pode levar 1 ou 2 minutos)';
  chrome.runtime.sendMessage({ tipo: 'djenAgora' }, r => {
    $('djenAgora').disabled = false;
    chrome.storage.local.get(['djen_msg'], v => { $('djenMsg').textContent = (r && !r.ok && r.erro) ? 'Não leu: ' + r.erro : (v.djen_msg || 'Pronto.'); });
  });
});
