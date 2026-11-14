# Troca do banco: planilha do Google → Supabase (PostgreSQL)

Objetivo: telas abrindo em 0,1–0,3 s (hoje 1–4 s) e o painel pronto para vários escritórios.
Nada para de funcionar no meio: a planilha continua sendo a fonte até o passo 3.

## O que já está pronto no repositório
- `supabase/esquema.sql`: uma tabela por aba da planilha, com as mesmas colunas, mais `escritorio_id`
  e a regra de segurança (RLS) "cada escritório só vê o que é dele". Gerado do `ESQUEMA` do Code.gs.
  Mudou o ESQUEMA? Gere o arquivo de novo.

## Passo 1 já pronto (8.26.0): cópia automática
- Gerenciar acessos › "🗄 Banco novo (Supabase)": Project URL + chave service_role → "Ligar e testar" → "Copiar agora".
- Depois o painel copia sozinho de 30 em 30 minutos (aquecedor + robô de hora em hora), só as abas que mudaram.
- A chave fica SÓ nas Propriedades do Apps Script (SUPABASE_CHAVE). Senha dos usuários (hash/salt) nunca vai para o banco.

## Passo 2 pronto (8.28.0): leitura rápida
- O navegador lê as telas direto do Supabase e faz a conta com as MESMAS funções do Code.gs (`painel/motor.js`, gerado por
  `node .github/motor/gerar.mjs`). Gravar continua pelo Apps Script, que reenvia na hora as linhas gravadas ao Supabase.
- Segurança: no login o Apps Script cria uma "sessão do banco" (tabela `painel_sessoes`, só o SHA-256 do código) com o que o perfil
  pode ler; o navegador recebe o código + a chave PÚBLICA. A função `painel_ler` confere tudo (prazo 12 h / 6 h parado, pessoa ativa,
  mesmo perfil, sem troca de senha) e devolve só as tabelas/colunas/linhas liberadas. Sair apaga a sessão do banco.
- Falhou, demorou (4,5 s; 9 s na 1ª carga), mudança "pendente" ou a tela precisa do Google (agenda, robô) → a tela vem da planilha sozinha.
- Ligar: rodar `supabase/leitura-rapida.sql` no SQL Editor (uma vez) e colar a chave pública em Gerenciar acessos › Banco novo.
- Medir: Gerenciar acessos › Banco novo › "⏱ Medir agora" (as mesmas telas pelos dois caminhos, com tempo e "resultado igual?").
- Testar no computador: `.github/motor/teste/` (simulador com dados inventados; ver LEIA.md).

## O que a usuária faz (uma vez)
1. Criar a conta grátis em supabase.com e um projeto na região **São Paulo (sa-east-1)**.
2. Supabase › SQL Editor › colar `supabase/esquema.sql` › Run.
3. Avisar o Claude: as chaves (URL do projeto, chave pública "anon" e chave de serviço) são pedidas por formulário seguro,
   nunca coladas no chat. A chave de serviço fica SÓ nas Propriedades do Apps Script.

## Passos da troca
1. **Cópia sem risco**: um robô do Apps Script copia as abas para o Supabase a cada poucos minutos. Nada muda nas telas.
2. **Leitura rápida** (feito na 8.27): as telas de leitura vêm do Supabase (menos agenda, cartão do robô e o que precisa do Google).
   Gravar continua pela planilha.
3. **Gravação direta**: gravar vai direto ao Supabase; os robôs (Gmail, DJEN, Drive, Agenda, PIX) continuam no Google e gravam no banco.
   A planilha vira cópia de segurança.
4. **Vários escritórios**: cada escritório ganha o seu `escritorio_id`; login por escritório; logo e cor de cada um.

## Custo
Plano grátis basta para um escritório. Para vender a outros escritórios: plano Pro, cerca de US$ 25 por mês.
