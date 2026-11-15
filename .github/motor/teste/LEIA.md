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

8.29 (Supabase como banco principal):
```bash
node .github/motor/teste/principal.js
PRINCIPAL=1 node .github/motor/teste/rodar.js
node .github/motor/teste/etapaA.js          # 8.30: Supabase grava primeiro × planilha (mesmas gravações, planilhas iguais)
node .github/motor/teste/etapaB.js          # 8.31: login/senhas/Log no banco; painel com a planilha fora do ar
node .github/motor/gerar-edge.mjs && node .github/motor/teste/etapaC.mjs   # 8.32: motor do painel no Supabase
node .github/motor/teste/deno.mjs           # 8.32: a função rodando no Deno (precisa do deno instalado)
node .github/motor/teste/etapaD.mjs          # 8.33: entrar pelo Supabase (precisa do vault falso abaixo)
```
Vault falso (no Supabase de verdade ele já existe):
```sql
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create or replace function vault.create_secret(s text, n text default null, d text default '') returns uuid language sql as $$ insert into vault.secrets(name, secret, description) values (n, s, d) returning id $$;
create or replace function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
```
