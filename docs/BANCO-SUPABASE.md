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

## O que a usuária faz (uma vez)
1. Criar a conta grátis em supabase.com e um projeto na região **São Paulo (sa-east-1)**.
2. Supabase › SQL Editor › colar `supabase/esquema.sql` › Run.
3. Avisar o Claude: as chaves (URL do projeto, chave pública "anon" e chave de serviço) são pedidas por formulário seguro,
   nunca coladas no chat. A chave de serviço fica SÓ nas Propriedades do Apps Script.

## Passos da troca
1. **Cópia sem risco**: um robô do Apps Script copia as abas para o Supabase a cada poucos minutos. Nada muda nas telas.
2. **Leitura rápida**: as listas grandes (clientes, processos, prazos, intimações, cobranças, agenda) passam a ser lidas do Supabase.
   Gravar continua pela planilha.
3. **Gravação direta**: gravar vai direto ao Supabase; os robôs (Gmail, DJEN, Drive, Agenda, PIX) continuam no Google e gravam no banco.
   A planilha vira cópia de segurança.
4. **Vários escritórios**: cada escritório ganha o seu `escritorio_id`; login por escritório; logo e cor de cada um.

## Custo
Plano grátis basta para um escritório. Para vender a outros escritórios: plano Pro, cerca de US$ 25 por mês.

## Passo 2 pronto (8.27.0): o painel lê do Supabase e grava nos dois
- Gravação: cada mudança vai para a planilha e, no fim do mesmo pedido, para o Supabase (linhas mudadas e apagadas).
  Se o Supabase falhar, a planilha já está certa e a cópia de 30 em 30 minutos acerta o Supabase.
- Leitura: as listas grandes (Clientes, Processos, Prazos, Intimações, Tarefas, Cobranças, Início, Relatórios) ficam prontas na tabela
  `respostas`, por perfil (o RH continua sem os totais) ou por pessoa. O navegador lê direto, com o login próprio de cada pessoa no
  Supabase (token de 1 hora, pedido ao Google com a sessão do painel). Se os dados mudaram, mostra na hora e confere no Google por trás.
  Supabase fora do ar → lê da planilha, como antes.
- Segurança: as tabelas brutas só o servidor lê (chave secreta). O navegador só lê `respostas` e `estado`, e o banco confere
  escritório + perfil + pessoa no token. A senha de cada pessoa no Supabase é aleatória e fica só nas Propriedades do Google.
- O que fazer: rodar de novo o supabase/esquema.sql (cria `respostas` e `estado`), colar a chave pública (publishable) em
  Gerenciar acessos › Banco novo, desligar "Allow new users to sign up" em Authentication › Sign In / Providers, e apertar
  "⏱ Medir velocidade".
