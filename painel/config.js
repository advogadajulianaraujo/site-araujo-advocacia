// Endereço do programa do Google (Apps Script) que guarda os dados do painel.
// Depois de "Implantar → App da Web", cole aqui a URL que termina em /exec.
window.PAINEL_API_URL = 'https://script.google.com/macros/s/AKfycbwMffQm4vsbVo7fiTygLC8uxalR7ipQeZdK4y_0ieg2iPqMO4X981nrE9kll8BBrNl4/exec';
// 8.36.3: entrada pelo Supabase desde o primeiro acesso (endereço da função e chave PÚBLICA do Supabase — feita para ficar no navegador;
// os dados continuam protegidos pela senha de cada pessoa e pelas regras do banco). Sem resposta do Supabase, entra pelo Google.
window.PAINEL_EDGE = { edge: 'https://jnjyzmzvwxaghunjxofz.supabase.co/functions/v1/painel', chave: 'sb_publishable_PaAzXyqQ5uQYDIoNqSIQRQ_kftLErnh' };
