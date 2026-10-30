# Regras permanentes do painel (Araújo Advocacia)

Leia também docs/PLANO-PAINEL.md antes de mexer no painel.

## Prazos: nunca sem data (regra do escritório)

- Nenhum prazo pode ficar sem data fatal. Se o aviso do tribunal não disser o ato (no PJe vem "documento sigiloso"),
  o robô usa o prazo provisório MAIS CURTO (5 dias úteis; 5 corridos no criminal), marcado "PROVISÓRIO — conferir".
- Na dúvida entre dois prazos, sempre o mais curto. Exemplos já no código (`sugerirPrazo_` em painel-backend/Code.gs):
  sentença TJSC 15 úteis, JEC/JEF 10, TRT 8, criminal 5 corridos; acórdão: embargos de declaração 5 (criminal 2 corridos);
  contrarrazões 15/10/8; laudo 15 (TRT 5); despacho/decisão 5 (art. 218, § 3º, CPC).
- `definirPendentes_` define qualquer prazo antigo que tenha ficado "a definir"; roda no `configurar` e em toda rodada do robô.
- Prazo de audiência ou perícia (observações começando com "ato:") usa a data do ato e nunca é recalculado.
- DJEN: a consulta do CNJ recusa os servidores do Google (403). O painel aberto no computador do escritório lê o DJEN
  pelo navegador (`lerDjenNavegador` em painel.js → rotas `djen.config`/`djen.importar`) a cada 2 h, para todas as OABs
  da aba Advogados, e manda para a planilha; se o navegador leu nas últimas 36 h, o robô do servidor nem tenta.
  Se o CNJ recusar também o navegador, o cartão do robô mostra o problema e o link "ver no site do DJEN".
- Cota do Gmail: a leitura dos avisos NOVOS tem prioridade. Histórico antigo e classificação de áreas usam no máximo
  `GMAIL_EXTRA_DIA` (250) leituras por dia e param no dia em que o Google avisar "chamado muitas vezes" (`gmailEsgotado_`).
- Intimações: filtro por sistema (Todos / eproc · Cível / eproc · Federal / PJe · Trabalhista), guardado em cada computador
  (`prazos_sistema`); o quadro Prazos do Início segue a mesma escolha. Cada prazo aberto tem botão "WhatsApp" (avisa o cliente
  que chegou intimação, sem expor o prazo interno), "fazer até" = meta interna de 2 dias úteis antes do fatal, filtros
  "Vencem hoje" e "Meus prazos".
- Robô lê TODOS os tribunais (`from:jus.br`, `lerAvisoTribunal_`): PJe [PUSH], eproc (TJSC, TJRS, JF) e, nos outros formatos
  (Projudi, e-SAJ, peticionamento eletrônico), `lerAvisoGenerico_` só cadastra o processo, sem prazo. O histórico do Gmail lê
  primeiro os tribunais que antes ficavam de fora (HIST2_GMAIL_*) e depois continua o geral (HIST_GMAIL_*).
- Robô à prova de falhas (6.9): `roboRapidoGatilho` de hora em hora (o de 6 em 6 h segue com as tarefas pesadas); Gmail lido com
  `in:anywhere -in:trash` (pega aviso no SPAM) e TODAS as páginas (não só as 300 conversas mais novas); feriados nacionais e
  forenses calculados para qualquer ano (`feriadosDoAno_`, Páscoa de Meeus) além dos da aba Feriados; `vigiaRobo_` avisa por
  e-mail (admin/advogada, no máx. 1 a cada 12 h) e no cartão do robô quando: Gmail sem leitura há 6 h, DJEN sem leitura há 26 h
  em dia útil, prazo aberto sem data fatal, ou IA achou prazo diferente do calculado.
- IA confere o prazo: `contextoPrazoIA_` manda o que o painel calculou; se o texto fala em outro nº de dias ou outra data de
  audiência, o resumo ganha "⚠ ATENÇÃO" (vermelho na tela, no e-mail das 7h e no vigia). A IA nunca muda o prazo.
  Botão "Resumir com IA" na tela do prazo (rota `ia.resumirPrazo`).
- Histórico do DJEN: o navegador do escritório volta 30 dias por vez até 2020 (`historicoDjen` → rota `djen.historico`),
  só cadastrando processos que faltam (origem "histórico DJEN"), sem criar intimação nem prazo.
- Área sem Gmail: TRT/TST e número ".5." = Trabalhista; TRF = Federal; senão pelo nome da vara nos avisos (`areaPeloOrgao_`).
- Ao revisar prazos, procure em tudo que tiver acesso: avisos do eproc e do PJe no Gmail (conta advogadajulianaraujo),
  DJEN (a consulta pública recusa o Google e esta nuvem, código 403) e a agenda. Nunca invente o conteúdo de um ato.

## Processos

- Fase de cada processo (`fase`, `FASES`): Contrato assinado (a ajuizar) → Ajuizado → Em andamento → Sentença / Acordo /
  Homologação → Recurso → Execução → Extinto/arquivado. Muda sozinha pela última movimentação (`faseDoMovimento_`), sem
  voltar de fase adiantada por "juntada"; escolhida à mão (`fase_auto` = "nao") fica fixa. Processos antigos sem fase usam
  `faseDe_`. Gerar procuração/contrato para quem não tem processo cria um "a ajuizar" (sem número).
- Ao criar processo (ou colocar o número no "a ajuizar") a tela mostra "Informar o cliente no WhatsApp" com o link do
  Acompanhe (opcional: gera código de acesso novo e põe na mensagem).

- Processos em andamento e arquivados/baixados ficam todos no painel. A situação vem da última movimentação
  (`atualizarMovimento_`); o histórico antigo do Gmail é lido por `importarHistoricoGmail_` até o fim da caixa.

## Pastas dos clientes

- Não criar pastas novas para clientes antigos. Só ligar às pastas que já existem no Drive (`vincularPastas_`).
  Pasta nova só para cliente cadastrado pelo painel ou quando o usuário gera documento para quem não tem pasta.

## Dados

- Nenhum dado de cliente vai para este repositório (é público). Tudo fica na planilha PAINEL — BANCO DE DADOS.

## Modelos de documentos

- A geração de documentos fica só na aba Modelos (a ficha do cliente tem apenas o botão "Gerar documentos").
- Padrão visual de TODOS os modelos (tirado do modelo de juntada enviado pela usuária): fonte EB Garamond 12,
  texto sempre justificado, espaço depois de cada parágrafo, nome da parte em negrito, títulos centralizados em
  negrito, logo (assets/logo-documentos.png) no topo com linha, rodapé em itálico com endereço, telefone,
  CNPJ 46.000.441/0001-94 e OAB/SC nº 7551, assinatura do(a) advogado(a) centralizada (nome em negrito e OAB embaixo).
- O número do processo é opcional no gerador; é obrigatório só para petições e substabelecimento.
- A usuária vai mandar os modelos oficiais do escritório para refazer os textos (ex.: juntada de documentos).
- Os modelos oficiais do escritório ficam na pasta do Drive 1BYDfDiNV6WHKLHZXwOyjY8BripbcbYt0 ("01. Declaração de
  residência" … "11. Apelação criminal"). Todo Google Docs posto lá aparece sozinho na aba Modelos (`modelosDrive_`).
  Ao gerar, `preencherColchetes_` troca pelo contexto do parágrafo: [VARA]/[NÚMERO]/[CIDADE/UF] na linha "AO JUÍZO",
  [NÚMERO] em "Processo nº", [NOME] nas linhas de partes, [NOME DA PARTE]/[NOME DO(A) RECLAMANTE] etc., CPF, RG,
  endereço e "[CIDADE/UF], [DATA]". Colchetes de conteúdo ([DESCREVER…]) ficam para a advogada.
- Modelos do Drive escondidos a pedido da usuária (`MODELOS_DRIVE_OCULTOS`): apelação criminal, cumprimento de sentença,
  reclamação trabalhista, petição inicial, réplica, juntada de documentos e declaração de residência (o painel já tem as suas).
  Modelos do Drive que são petições dentro do processo (pesquisa de endereço, emenda etc.) vão para o grupo "Petições" e exigem o nº.
- O contrato gerado de novo não lança outra vez o mesmo honorário (mesmo tipo, percentual e valor).
- Gênero nos documentos: nunca "brasileiro(a)" quando dá para saber. Nos textos use {{c:o|a}} (cliente), {{adv:o|a}} (advogado(a))
  e {{sub:o|a}} (quem substabelece); `resolverGenero_` escolhe. O gênero vem do campo "Sexo" do cadastro ou do primeiro nome
  (`generoPeloNome_`); sem certeza sai "o(a)" e o painel avisa. Endereço com preposição certa ("na Rua", "no Loteamento").
- Documentos que o cliente assina (procurações, declarações, termo LGPD, contratos, notas promissórias: `assinaCliente`)
  vão para a subpasta "DOCUMENTOS PARA ASSINAR" dentro da pasta do cliente (criada se não existir). Petições, recibo e
  notificação ficam na pasta principal. A ficha mostra quantos arquivos esperam assinatura.
- Ao gerar, os documentos que o cliente assina ganham o botão "Imprimir" e, se forem dois ou mais, um PDF único
  "IMPRIMIR — PARA ASSINAR" (`juntarParaImprimir_`: procuração → declarações → contrato → promissórias, cada um em folha nova).
- Procuração, procuração de filhos menores, hipossuficiência e residência cabem em UMA folha (`umaFolha`: margens e logo
  menores, espaçamento 1,1, qualificação sem telefone/e-mail). Petições e contratos não precisam.
- Procuração de filhos menores: o cliente é quem representa (pai/mãe, tutor, guardião); até 15 anos "representado",
  16 e 17 "assistido" (pela data de nascimento, obrigatória).
- Notas promissórias: uma por parcela, duas por folha, geradas do valor fixo do formulário ou das parcelas em aberto.
- Parcelado: 1ª parcela numa data e as demais "todo dia X" (`dia_demais`).
- Modelo do Drive "Cobrança de honorários — procedimento comum" escondido a pedido da usuária.
- Modelos novos (MODELO7_): procuração para inventário e partilha, requerimento de isenção de IRPF (doença grave),
  declaração de comparecimento, notificação extrajudicial em nome do cliente e contrato de honorários previdenciário
  (texto do contrato do escritório: 2 benefícios ou 30%, revisões 30%, multa de desistência 2 SM, 5% habilitação de herdeiros).
  Versão MODELO8_ (contrato, prestação, assessoria, previdenciário, procurações): atraso > 30 dias permite suspender os
  serviços não urgentes e renunciar ao mandato com aviso de 10 dias (art. 5º, § 3º, EAOAB; art. 112 CPC); multa de 2 salários
  mínimos por desistência OU falta injustificada em audiência/perícia, cobrável judicialmente (art. 24 EAOAB; art. 784, III, CPC).
- Procuração por área (`poderesGeraisProcuracao_`, campo `ambito` em TIPOS_ACAO): o tipo de ação é obrigatório; a procuração
  traz FINALIDADE, PODERES com o âmbito da área (Justiça do Trabalho, INSS/Justiça Federal, Varas de Família…) e PODERES
  ESPECÍFICOS DESTA ÁREA. Na área criminal os poderes são pelo CPP (sem o art. 105 do CPC).
- Contrato de honorários (modelos v5, com cláusulas do contrato antigo do escritório: notas promissórias, PIX, vencimento
  antecipado após 30 dias de atraso, sigilo/LGPD). Antes, v4: cláusulas pedidas pela usuária — sucumbência integral, sustentação oral/TNU/STF fora,
  despesas (perícias, custas, diligências fora da comarca, deslocamento acima de 100 km), obrigações do cliente (documentos,
  mudança de telefone/endereço), vedado acordo sem anuência, obrigação de meio, desistência = 2 salários mínimos,
  descumprimento = multa de 5%, foro de Tubarão/SC. Mudou texto em TEXTO_MODELOS? Suba a versão das chaves (hoje MODELO6_ → MODELO7_)
  para o Google Docs do modelo ser recriado.

## Layout

- No topo ficam só os tópicos (Início, Clientes, Processos, Intimações, Tarefas, Agenda, Modelos, Financeiro). Relatórios, Usuários,
  Trocar senha e Sair ficam no menu que abre ao clicar no nome.
- Início: atalhos para todos os tópicos (com números), e três quadros pequenos: Prazos (vencidos primeiro), Audiências e perícias
  (agenda + audiências dos processos, sem repetir) e Hoje.
- Processos: filtro de Área em cima, junto com Situação, Tribunal e Cliente (padrão sempre "Todos"); sem os botões de área.
- Tabelas de Processos e Intimações compactas: na coluna "Próximo ato" só o ato com a data completa ("Audiência 26/10/2026");
  o resumo da última movimentação aparece só ao abrir o processo.

## WhatsApp e Financeiro

- "Fotos e conversas do WhatsApp" foi retirado da ficha e do robô a pedido da usuária (o código `processarWhatsapp_` ficou
  sem uso; não religar sem ela pedir).
- Perfil RH (`PERFIS.rh`, `ocultarValores`): vê tudo menos Usuários; entra no Financeiro, mas `semValores_` apaga os valores
  no servidor (rotas fin.*, relatorio.*, documentos.gerar, clientes.documentos) e as rotas que mudam valores são recusadas.
- Financeiro › "A receber": lista por cliente/honorário com parcelas pagas/total, valor total, recebido, falta receber,
  atrasado e próxima parcela (`aReceber_`, rota `fin.areceber`), atrasados primeiro, com botão de imprimir e de WhatsApp.
- Ao marcar uma parcela como paga, o recibo sai sozinho em PDF na pasta do cliente (`reciboDaParcela_`) e o painel abre
  uma caixa com "Abrir / imprimir recibo" e "Mandar no WhatsApp" (o PDF é anexado à mão; não tornamos o arquivo público).
- Parcelas a vencer têm "Lembrar no WhatsApp" e as atrasadas "Cobrar no WhatsApp", com a mensagem pronta (wa.me).

## Velocidade

- Servidor guarda por até 10 min as listas grandes (clientes, processos, prazos, intimações, honorários) em `comMemoria_`;
  toda gravação na planilha chama `marcarMudanca_` e a memória é descartada na hora. Toda escrita nova deve passar
  pelos helpers (`inserirLinha_`, `atualizarLinha_`, `gravarLote_`, `regravarMudadas_`), que já marcam a mudança.

- No navegador, a memória das telas também fica na aba (sessionStorage `painel_memoria`) para o F5 abrir na hora;
  é apagada ao sair, ao cair a sessão e ao fechar o navegador.
- Contratos: CONTRATADA qualificada com o(a) advogado(a) só pela OAB (sem repetir endereço); assinaturas com nome em
  negrito e o papel embaixo ("NOME|CONTRATANTE" no texto do modelo); testemunhas com nome e CPF.

## Site público

- /acompanhe/ ("Acompanhe seu processo"): o cliente entra com CPF + código de 8 caracteres gerado na ficha
  ("Acesso do cliente ao site"). O código aparece uma vez só e é guardado embaralhado (`acesso_hash`, nunca vai ao painel).
  Rota pública `consulta.processos` devolve só número, área, vara, situação, próximo ato e data/resumo da última
  movimentação. 5 erros por CPF bloqueiam 15 min; 100 erros no total travam a consulta 15 min. Nada fica no navegador.
- Acompanhe v3: etapas em linha do tempo (Preparação → Ajuizado → Em andamento → Decisão → Recurso → Recebimento → Concluído),
  explicação em linguagem simples, últimas movimentações (DataJud) e link de dúvida pelo WhatsApp.
- Conversão: WhatsApp é o botão principal da primeira tela; "Prefere que a gente ligue?" (site.js) em todas as páginas →
  rota pública `site.contato` (campo-isca anti-spam, 40/h no total, 1 por telefone a cada 6 h) grava na aba Contatos, cria
  tarefa "Ligar para…" (Config RESP_SITE) e manda e-mail (Config CONTATO_EMAIL ou a conta dona).
- SEO: páginas de área com 6 a 8 perguntas frequentes (texto e schema FAQPage iguais) e BreadcrumbList. Conteúdo
  informativo, citando a lei, sem promessas nem preços (Provimento 205/2021 da OAB).

## Login

- "Lembrar meu usuário" guarda só o nome de usuário no navegador; a senha fica no gerenciador de senhas do navegador
  (o painel pede para salvar). A sessão continua só na aba (sessionStorage) e cai ao fechar o navegador.
- Usuários: "Desconectar agora" derruba a pessoa em todos os aparelhos; "Desbloquear" tira o bloqueio de 15 min.

## Agenda e clientes

- Agenda em grade de horários (estilo Google Agenda) nas visões dia e semana. O filtro "Dra. Júlian" nunca mostra prazos fatais.
- Observações do cliente: cada anotação guarda data, hora e autor (`anotarCliente_`); não editar pelo formulário do cadastro.

## Tarefas, caixa, relatórios, e-mail, IA e andamentos (versão 6.7)

- Tarefas (aba no topo): quadro A fazer → Fazendo → Pronto para revisar → Protocolado → Conferido e concluído. Junta as
  tarefas da aba Tarefas e os prazos abertos (coluna `responsavel` e `etapa` em Prazos). Prazo em "Protocolado" = cumprido;
  voltar para trás reabre. Só quem confere prazos passa para "Conferido e concluído". Pontos: tarefa no prazo vale o peso
  (1 a 5), prazo processual no prazo vale 3 (`PESO_PRAZO`); atrasada não pontua. Responsável automático por sistema
  (Config RESP_PJE / RESP_EPROC, `atribuirResponsaveis_` no robô).
- Financeiro › Caixa e contas a pagar (`caixa_`, aba Despesas): despesas mensais fixas geradas 2 meses à frente
  (`estenderDespesas_`), "cobrar do cliente" para custas adiantadas, fluxo de 12 meses e previsão de 3.
- Relatórios (menu do nome, só administração; `relatorio.geral`): gráficos em SVG feitos no próprio painel (a CSP não deixa
  biblioteca de fora). Clientes/processos importados (GEA, histórico do Gmail) não contam como novos.
- Resumo do dia por e-mail: gatilho `resumoDiarioGatilho` às 7h, só dias úteis, para usuários com e-mail (coluna `email`,
  `resumo_email`). Usa GmailApp.sendEmail (escopo já existente).
- IA: Gemini (Google), nunca Claude. Chave só nas Propriedades do script (GEMINI_CHAVE), nunca na planilha. `anonimizar_`
  troca nomes das partes por [PARTE] e o nº por [PROCESSO] e tira CPF/CNPJ/RG/telefone/e-mail/CEP/conta antes de enviar. A IA só escreve `resumo_ia` (Intimações e Prazos); NUNCA muda
  prazo. Recomendar chave com faturamento (plano gratuito pode usar os dados).
- Andamentos: DataJud (API pública do CNJ), gatilho `andamentosGatilho` de 4 em 4 h, em lotes (`UrlFetchApp.fetchAll`).
  Guarda os 25 últimos em Processos.andamentos (JSON; "-" = não achado: segredo de justiça ou não enviado). A chave pública
  vem do wiki do CNJ sozinha (`chaveDatajud_`); Config DATAJUD_CHAVE força uma. `processos.listar` não devolve andamentos
  (rota própria `processos.andamentos`). Gmail e DJEN só trazem intimações; por isso os andamentos vêm do DataJud.
- Abas novas da planilha são criadas sozinhas na primeira leitura (`aba_`), sem precisar rodar o configurar.
- Painel: leitura pedida por uma tela que já foi trocada não desenha por cima da tela nova (`rotaN`/`vezAtual` em painel.js).

## Segurança (versão 6)

- Senhas: HMAC-SHA256 com chave secreta nas Propriedades do script (CHAVE_SENHAS, fora da planilha), 1.000 rodadas e
  salt por usuário; prefixo "v2$". Senhas antigas (sem prefixo) são conferidas pela versão 1 e trocadas no login.
- Sessões: token de 96 caracteres; caem com 6 h sem uso, 12 h no total e 30 min parado no navegador. Trocar senha,
  mudar perfil ou desativar aumenta `sessao_versao` e derruba as sessões abertas.
- Login: 5 erros bloqueiam o usuário por 15 min; 30 erros no painel em 15 min travam todos os logins por 15 min.
- Cópia de segurança diária da planilha às 3h em "BACKUPS DO PAINEL (não compartilhar)", guardando 30 dias.
- Abas da planilha protegidas com aviso contra edição manual. Pedidos acima de 200 mil caracteres são recusados.
- Nunca colocar senha, CPF ou dado de cliente no repositório (é público).
