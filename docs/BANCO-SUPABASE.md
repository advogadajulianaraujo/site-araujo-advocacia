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

## Passo 3 pronto (8.29.0): Supabase como banco principal
- Gerenciar acessos › Banco novo › "Banco principal": 🔧 Conferir e consertar (planilha × banco, linha a linha) e depois
  "⚡ Usar o Supabase como banco principal". O servidor passa a ler do banco; a planilha continua recebendo tudo (reserva).
- Segurança: só abas conferidas iguais; gravação confere na planilha que a linha é o mesmo registro antes de gravar; qualquer
  dúvida (pendência, banco fora, linha a mais à mão) → planilha. O robô confere e conserta 1×/dia.

## Rumo a sair do Google (pedido da usuária, 14/11/2026): o Supabase vira o banco E o motor do painel
Por etapas; cada uma testada com dados inventados contra o comportamento atual, desligada até a usuária ligar, e com volta.

| Etapa | O que muda | O que a usuária faz |
|---|---|---|
| **A (8.30, ligada em 14/11)** | O Supabase GRAVA PRIMEIRO (tudo ou nada por pedido); a planilha vira cópia do banco de 30 em 30 min. Login, senhas e Log ainda na planilha. | Gerenciar acessos › Banco novo › "⚡ Gravar primeiro no Supabase". |
| **B (8.31, pronta)** | Login, senhas (embaralhadas, nunca vão ao navegador) e o registro de atividades no Supabase: o painel entra, lê e grava com a planilha fora do ar. | Rodar o `leitura-rapida.sql` de novo + Code.gs novo + botão "🔐 Levar o login e as senhas para o Supabase". |
| **C (8.32, pronta)** | O motor do painel roda no Supabase (Edge Function `painel`, com o MESMO código do Code.gs nas rotas que não usam o Google): o navegador lê e grava direto, sem o Apps Script. Rotas do Google (documentos, Drive, Agenda, e-mail) seguem pelo Apps Script, que já grava no banco. | Uma vez: autorizar a publicação da função (token do Supabase com permissão de banco/funções, por formulário seguro). |
| **D (8.33, pronta)** | Entrar no painel pelo Supabase: login, senhas e as duas sessões criados pela função "painel" (chave das senhas no cofre Vault). Com o Google fora do ar dá para entrar, ler e gravar; o Apps Script fica com os robôs (Gmail/DJEN, Agenda, Drive, documentos, IA) e a planilha é só cópia. | Colar o Code.gs 8.33 e apertar "🔑 Entrar pelo Supabase (Etapa D)". |

## Etapa C (8.32): como publicar a função "painel"
- Código: `supabase/functions/painel/` (`index.ts` + `servidor.js` escritos à mão; `motor.js` GERADO do Code.gs por
  `node .github/motor/gerar-edge.mjs` — mudou o Code.gs? rode o gerar-edge junto com o gerar).
- Publicar: token do Supabase com permissão de Edge Functions (escrita) → `node .github/motor/publicar-edge.mjs`
  (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJETO) ou o GitHub Actions `publicar-edge.yml` (segredo SUPABASE_ACCESS_TOKEN e variável
  SUPABASE_PROJETO no repositório: publica sozinho a cada mudança da função no main). A função não confere JWT (verify_jwt false):
  quem confere a pessoa é o banco (painel_quem, pelo código da sessão do banco).
- Ligar: Gerenciar acessos › Banco novo › "🚀 Ligar o motor do Supabase" (confere se a função responde com a MESMA versão do Code.gs).

## 8.35: Agenda no banco
- O Google copia a agenda (mês passado a +3 meses) para a tabela agenda_eventos de 10 em 10 min; Agenda, Audiências e o Início leem a cópia.
  Mudança pelo painel, ↻ ou cópia velha (> 3 h) → a tela lê do Google.

## 8.34: atualização automática
- O push no main é a publicação: o Apps Script confere o GitHub de 10 em 10 min e instala sozinho (Supabase primeiro, com a chave de
  publicação em Properties SUPABASE_GESTAO; depois o Google). Detalhes em CLAUDE.md (8.34.0) e painel-backend/INSTALAR.md.

## 8.33: velocidade
- A função "painel" guarda as tabelas na memória entre pedidos; `painel_assinaturas` (linhas + último `_em` + maior `_n`) diz quais mudaram.
  Uma regra (trigger `painel_em`) marca `_em = now()` em QUALQUER mudança de linha, venha de onde vier.
- O navegador lembra por 12 h (por perfil e versão, localStorage `banco_fora_*`, só nomes de telas) o que precisa do Google e vai direto.
- O Início espera no máximo 1,5 s pelos blocos do Google (agenda, extras) e se redesenha quando chegam.
- O estado do robô (cartão) vem da "foto" Config ROBO_EXTRAS (Apps Script atualiza de 10 em 10 min): o resumo do Início é calculado no navegador.
- Ainda no Google: agenda/audiências (leem o Google Agenda), documentos, Drive, e-mail, IA.

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
