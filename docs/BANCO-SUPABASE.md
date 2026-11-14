# Troca do banco: planilha do Google → Supabase (PostgreSQL)

Objetivo: telas abrindo em 0,1–0,3 s (hoje 1–4 s) e o painel pronto para vários escritórios.
Nada para de funcionar no meio: a planilha continua sendo a fonte até o passo 3.

## O que já está pronto no repositório
- `supabase/esquema.sql`: uma tabela por aba da planilha, com as mesmas colunas, mais `escritorio_id`
  e a regra de segurança (RLS) "cada escritório só vê o que é dele". Gerado do `ESQUEMA` do Code.gs.
  Mudou o ESQUEMA? Gere o arquivo de novo.

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
