# Teste do banco novo (8.28)

Confere, com dados INVENTADOS, que cada tela calculada no navegador (painel/motor.js + painel/banco.js, lendo do Supabase)
dá exatamente o mesmo resultado que o Apps Script (painel-backend/Code.gs lendo a planilha), em todos os perfis, e que as
gravações chegam ao banco na hora, na linha certa, sem dado velho por cima.

Precisa de: Node 18+ e um PostgreSQL vazio só para o teste (ex.: `initdb` + `pg_ctl` numa pasta temporária).

```bash
psql -c "create role anon; create role authenticated; create role service_role; create schema auth; create function auth.jwt() returns jsonb language sql as \$\$ select '{}'::jsonb \$\$;"
psql -f supabase/esquema.sql && psql -f supabase/leitura-rapida.sql
node .github/motor/gerar.mjs           # sempre que mudar o Code.gs
node .github/motor/teste/rodar.js      # telas (4 perfis) + gravações; ✗ = problema
N=1600 node .github/motor/teste/bench.js   # tempos com volume parecido com o real
```
`navegador.js` abre o painel no Chromium (Playwright) com o Google e o Supabase simulados (servir a pasta do site em :8099).
