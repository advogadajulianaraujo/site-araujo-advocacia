# Como trabalhar neste projeto junto com outro assistente (Claude + ChatGPT)

Atualizado em 18/11/2026. Nada aqui é segredo: senhas, tokens e chaves NUNCA ficam no repositório.

## 1. Repositório

- https://github.com/advogadajulianaraujo/site-araujo-advocacia (público).
- `main` = PRODUÇÃO. Todo push no `main` publica: o site e o painel saem na hora (GitHub Pages) e o Apps Script se instala sozinho em até ~10 min
  (`autoAtualizar_`, lê o Code.gs do `main`). `painel-layout` é um espelho antigo do `main` (pode ser ignorado).
- Regras do projeto: `CLAUDE.md` (histórico de cada versão e regras fixas da usuária). Plano do banco: `docs/BANCO-SUPABASE.md`.

## 2. Apps Script (Google)

- Código: `painel-backend/Code.gs` (+ `appsscript.json`). Versão = `var VERSAO` no Code.gs; deve ser igual a `VERSAO_PAINEL` em `painel/painel.js`.
- Implantação usada pelo painel: a URL `PAINEL_API_URL` em `painel/config.js` (web app `/macros/s/<id>/exec`).
- Versão instalada em 18/11/2026: 8.43.0 (instalada sozinha em 17/11 às 21:13). Projeto do Google Cloud ligado: 895531255553.
- O link do editor do Apps Script só a dona da conta tem (pedir a ela para compartilhar como Editor, se precisar).
- Atualização automática nunca instala versão MAIS VELHA. Para voltar atrás: reverter o código no `main` E subir o número da VERSAO,
  ou, no editor, Implantar › Gerenciar implantações › escolher a versão anterior.

## 3. Publicação

- Site + painel: GitHub Pages, domínio em `CNAME` (araujoadvocaciasc.com.br). Publicar = push no `main`; voltar = `git revert` + push.
- Supabase (projeto `jnjyzmzvwxaghunjxofz`, região São Paulo):
  - SQL: `supabase/esquema.sql` e `supabase/leitura-rapida.sql` (podem rodar de novo; não apagam dados).
  - Funções: `supabase/functions/painel` (motor do painel; `motor.js` e `motor-anterior.js` são GERADOS) e `supabase/functions/whatsapp`.
  - Publicar a função: `node .github/motor/publicar-edge.mjs` (token de gestão) ou o workflow `publicar-edge.yml` (push no `main` que mude a pasta).
- Arquivos GERADOS (nunca editar à mão; refazer depois de mexer no Code.gs): `painel/motor.js` (`node .github/motor/gerar.mjs`),
  `supabase/functions/painel/motor.js` (`node .github/motor/gerar-edge.mjs`) e `motor-anterior.js` (`node .github/motor/motor-anterior.mjs <versão do Google>`).
  Ao subir a VERSAO, guardar o motor anterior como `painel/motor-<versão anterior>.js`.

## 4. Últimas alterações (todas publicadas)

| Versão | O quê | Onde |
|---|---|---|
| 8.44.1 | Intimações: folhinha de calendário, faixa dos próximos dias, "de onde veio" | painel.js, painel.css |
| 8.44 | Intimações em 3 partes; "Central de Prazos" removida | painel.js, painel.css |
| 8.43.0 | Prazo descoberto pelo texto do DJEN / DataJud (`sugerirPrazo_`, `identificarProvisorios_`) | Code.gs |
| 8.42.0 | Fila persistente da IA, sem baixa em lote, comprovante no Conferido, chat do robô | Code.gs, painel.js |
| 8.41 | Motor único da calculadora de rescisão | assets/rescisao-motor.js |
| 8.40 | Sessão sem fila (SKIP LOCKED), permissões e políticas do Supabase | leitura-rapida.sql, esquema.sql |

Funções SQL mexidas na auditoria: `painel_tocar_sessao_`, `painel_ler`, `painel_quem`, `painel_tabela`, `painel_tabelas`, `painel_aplicar`
(conflito com errcode PT409 — NUNCA usar 40001/40P01, o PostgREST repete sem parar), `painel_cache_chave`, `painel_chat_ping`, políticas com
`(select auth.jwt())`. Função "painel" no ar: versão 27 (motores 8.43.0 + 8.42.0). Nada pendente de publicação no repositório.

## 5. Testes

- Não há homologação separada. Os testes rodam com dados INVENTADOS: simulador do Apps Script + PostgreSQL 16 local + Chromium (Playwright).
- Como rodar: `.github/motor/teste/LEIA.md`. Resumo: PostgreSQL na porta 5433 (socket /tmp), aplicar `supabase/esquema.sql` e
  `supabase/leitura-rapida.sql`, servir a pasta do site em :8099 (`python3 -m http.server 8099`) e rodar `node rodar.js`, `node principal.js`,
  `node etapaA.js`, `node etapaB.js`, `node etapa842.js`, `node etapa843.js` (e os `.mjs`). Em 17/11: 151 verificações, 0 falhas.

## 6. Integrações

| Serviço | Uso | Situação |
|---|---|---|
| Google Sheets | planilha "PAINEL — BANCO DE DADOS" = cópia de reserva do Supabase | ativa |
| Google Drive | pastas dos clientes, modelos de documentos, backups diários/semanais | ativa |
| Google Agenda | audiências, perícias, PRAZOS FATAIS, ATENDIMENTOS | ativa |
| Gmail | avisos do PJe/eproc, PIX do banco Inter, e-mail das 7h | ativa |
| Gemini (IA) | leitura das intimações, resumos (nunca muda prazo) | ativa |
| DataJud (CNJ) | andamentos dos processos | ativa |
| DJEN (CNJ) | publicações; o CNJ recusa Google, GitHub e Supabase: lê só pelo navegador do escritório ou pela extensão do Chrome | depende de computador ligado |
| Supabase | banco principal, login, motor do painel | ativa |
| WhatsApp / Meta (API oficial) | chatbot e ponte `supabase/functions/whatsapp` | NÃO configurada (falta o webhook no Meta; 0 conversas) |
| Boleto/Pix automático (Asaas) | cobranças | NÃO configurada (0 cobranças geradas) |

Onde ficam os acessos (nunca no repositório): Propriedades do script do Apps Script (chaves da IA, das senhas, do Meta, do Supabase, da
plataforma de cobrança), Cofre (Vault) do Supabase (chave das senhas, segredos do WhatsApp), segredos do repositório no GitHub
(GEMINI_API_KEY, SUPABASE_ACCESS_TOKEN).

Acessos que outro assistente precisaria pedir à dona: permissão de escrita no repositório (colaborador no GitHub), membro do projeto Supabase,
editor do Apps Script.

## 7. Como trabalhar em dupla sem conflito

- Cada assistente num ramo próprio (ex.: `chatgpt/estabilizacao`, `claude/intimacoes`) e Pull Request para o `main`. Ninguém faz push direto no `main` sem combinar.
- UMA pessoa faz a publicação (merge no `main`) por vez, e quem publica: sobe a VERSAO (Code.gs + painel.js), roda `gerar.mjs` e `gerar-edge.mjs`,
  guarda o motor anterior, roda os testes e só então faz o merge.
- `Code.gs` é um arquivo único de ~16 mil linhas: dividir por ÁREA (ex.: um cuida de prazos/intimações, o outro de banco/segurança) para não editar as mesmas funções.
- Não editar `motor.js` à mão (são gerados); em conflito neles, refazer com os scripts.
