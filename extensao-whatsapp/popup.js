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

// 1.5.0: PJe lido sozinho
function mostrarPje() {
  chrome.storage.local.get(['pje', 'pje_auto'], v => {
    $('pjeAuto').checked = v.pje_auto !== false;
    const t = Object.entries(v.pje || {}).filter(([, x]) => x && x.url);
    const quando = ms => ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    $('pjeMsg').textContent = '';
    if (!t.length) { $('pjeMsg').textContent = 'Nenhuma tela guardada ainda. Entre no PJe com o certificado e abra a tela de Expedientes uma vez: a extensão aprende o endereço.'; return; }
    t.forEach(([host, x]) => {
      const d = document.createElement('div');
      const login = x.login_em && x.login_em > (x.lido_em || 0);
      d.textContent = host.replace(/^pje\./, '').replace(/\.jus\.br$/, '').toUpperCase() + ': ' + (login ? '⚠ pediu para entrar de novo (abra o PJe com o certificado)' : 'lido ' + quando(x.lido_em) + (x.n ? ' · ' + x.n + ' processo(s)' : ''));
      if (login) d.style.color = '#B3261E';
      $('pjeMsg').appendChild(d);
    });
  });
}
mostrarPje();
$('pjeAuto').addEventListener('change', e => chrome.storage.local.set({ pje_auto: e.target.checked }));
$('pjeAgora').addEventListener('click', () => {
  $('pjeAgora').disabled = true;
  chrome.runtime.sendMessage({ tipo: 'pjeAgora' }, r => { $('pjeAgora').disabled = false; if (r && !r.ok) $('pjeMsg').textContent = 'Não leu: ' + r.erro; setTimeout(mostrarPje, 100000); mostrarPje(); });
});
