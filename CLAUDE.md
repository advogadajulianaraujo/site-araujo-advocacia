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
- Agenda sempre em dia (6.9.3): `acharAto_` lê audiência (conciliação, instrução, inicial/una, mediação/CEJUSC) e perícia com data em
  "dd/mm/aaaa", "dd/mm/aa" ou "26 de novembro de 2026" e hora "14h30"/"14:30". `varrerAgenda_` roda em toda rodada do robô: relê as
  intimações de 180 dias e as movimentações do DataJud, marca o que falta (sem duplicar: mesmo processo + data + tipo) e refaz no
  Google Agenda os eventos que falharam. Ato designado SEM data no texto (PJe sigiloso) vira tarefa "abrir o processo e lançar na
  agenda" (`tarefaAtoSemData_`). O lembrete do ato é À PARTE: o prazo "para fazer" da intimação nunca é tirado.
  Botão "📅 Marcar na agenda" em cada intimação e na tela do prazo (rota `agenda.marcarAto`); conclui a tarefa de lançar.
- Robô do lembrete (6.9.9, `lembrarAudiencias_`, toda rodada do robô): 2 dias úteis antes de cada audiência ou perícia (aba Eventos
  e as agendas do Google AUDIÊNCIA CONCILIAÇÃO / INSTRUÇÃO / PERÍCIAS, inclusive as lançadas à mão) cria UMA tarefa "Lembrar o
  cliente: … em dd/mm às hh:mm — cliente" para o responsável do processo (ou o do sistema), prioridade alta (urgente se for amanhã),
  entrega no dia anterior, checklist por tipo (`CHECK_ATO`) e as marcas `[ato:tipo|data|hora|local]` e `[lembrete:chave]` (não
  repete). No painel a tarefa mostra o ato e o botão "WhatsApp ao cliente" com a mensagem pronta (`whatsAto`: dia, hora, local,
  o que levar; testemunhas na instrução; exames na perícia). Editar a tarefa nunca apaga as marcas internas (`salvarTarefa_`).
- Intimações sempre à vista: lista aberta na tela Intimações e prazos (busca, filtro do sistema, prazo de cada uma, "Na agenda"),
  da mais nova para a mais antiga; nada é apagado, nem depois da baixa do prazo (`intimacoes.listar` devolve {total, lista}).
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
  Botão "Resumir com IA" na tela do prazo (rota `ia.resumirPrazo`). Sem o texto do ato (PJe "documento sigiloso"), `fontePrazoIA_`
  procura: 1) outra publicação do mesmo processo com texto (±20 dias da ciência, ex.: DJEN); 2) o nome do ato no aviso + as últimas
  movimentações do DataJud (busca na hora se faltar) e a IA dá uma ESTIMATIVA marcada "sem o texto do ato… confirmar" (amarelo).
  O robô faz isso sozinho para os prazos PROVISÓRIOS (`resumirProvisoriosIA_`, até 10 por rodada).
- Gemini: modelo padrão `gemini-3.5-flash-lite`; `modeloIA_` troca modelos 1.x/2.x antigos e `modeloSugerido_` troca sozinho quando
  o Google responde que o modelo foi aposentado ("use models/X"). DataJud: lotes de 4 com pausa; código 429 = espera 8 s, tenta de
  novo e, se persistir, para sem erro ("o CNJ pediu uma pausa") e continua na próxima rodada. Datas de entrega usam o dia de
  Brasília (`diaSP_`), não o de Greenwich.
- Histórico do DJEN: o navegador do escritório volta 30 dias por vez até 2020 (`historicoDjen` → rota `djen.historico`),
  só cadastrando processos que faltam (origem "histórico DJEN"), sem criar intimação nem prazo.
- Área sem Gmail: TRT/TST e número ".5." = Trabalhista; TRF = Federal; senão pelo nome da vara nos avisos (`areaPeloOrgao_`).
- Ao revisar prazos, procure em tudo que tiver acesso: avisos do eproc e do PJe no Gmail (conta advogadajulianaraujo),
  DJEN (a consulta pública recusa o Google e esta nuvem, código 403) e a agenda. Nunca invente o conteúdo de um ato.

## Processos

- Revisão geral (7.1.0, Usuários › "Revisão geral dos dados", rota `revisao.geral`, prévia e "Corrigir agora"): grava a etapa em
  todo processo (`faseDe_`), arquivado → Encerrado, tribunal e área pelo número/vara, liga o processo ao cliente de MESMO nome e,
  se o nome veio do tribunal e não há cadastro, cria o cadastro só com o nome (origem "processo (revisão geral)", sem pasta nova;
  "SIGILO" fica de fora); cadastros "importado — conferir" viram "completo" e a ficha mostra "Falta no cadastro: …"; prazos "a
  definir" ganham data; manda o robô reler 10 dias de Gmail (sem duplicar).
- PJe: "Notificação de Documento Anexado" (PDF no e-mail, sem lista de eventos) entra como intimação com prazo PROVISÓRIO e cria
  o processo se for novo; evento "Documento sigiloso" do push é registrado como movimentação (sem prazo).

- Etapas do processo (6.9.8, `FASES` + `ORDEM_FASE`, na ordem): Petição inicial (a ajuizar, chave `contratado`) → Ajuizado
  (citação) → Audiência de conciliação → Em andamento (defesa e réplica) → Perícia → Audiência de instrução → Sentença →
  Acordo / Homologação → Recurso → Execução / cumprimento → Encerrado / arquivado (`extinto`). `avancaFase_`: a etapa automática
  só anda para a frente (acordo, execução e encerramento a qualquer hora; conciliação pode vir de "Em andamento"; arquivado só
  reabre com "desarquivamento"). Liga sozinho: movimentação (`faseDoMovimento_`: citação, audiência de conciliação/instrução
  designada, perícia designada, sentença…), audiência/perícia marcada na agenda (`marcarAto_`), conciliação já passada
  (`varrerAgenda_` → Em andamento), lembrete da conciliação conferido (→ Em andamento) e petição inicial conferida (→ Ajuizado ou
  Em andamento com número). Escolhida à mão no formulário (`fase_auto` = "nao") fica fixa; arrastar no quadro
  (`processos.fase`) muda a etapa e deixa o automático seguir para a frente. Sem número não passa de "Ajuizado".
- Processos abrem no QUADRO POR ETAPA (`COLUNAS_PROC`; lembra a escolha em `proc_visao`): arrastar o cartão para outra coluna ou
  "Concluir etapa →" (na Petição inicial é "Inicial feita →", que abre o Conferido com o número). O site do cliente (acompanhe.js)
  mostra conciliação, perícia e instrução dentro de "Em andamento", com explicação própria.
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
- Escolha dos documentos (pedido da usuária: menos informação na tela): botão "📂 Escolher documentos (n)" + chips do que foi
  escolhido; a janela (`seletorDocumentos`) tem busca e categorias (sem pacotes prontos: retirados a pedido da usuária) (`CATEGORIAS_DOC`: Procurações, Contratos de honorários, Declarações e termos, Recibos e
  cobrança, Petições, Notificações e outros).
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

- Menu LATERAL à esquerda (tema 2026, pedido da usuária, no estilo do ADVBOX): grupos Escritório (Início, Clientes, Processos,
  Intimações e prazos, Tarefas, Agenda), Documentos (Modelos) e Gestão (Financeiro, Relatórios, Usuários — conforme o perfil), com
  ícones SVG (`ICONES`/`ABAS` em painel.js). Embaixo, o cartão da pessoa (iniciais, nome, perfil) abre Ver o site, Trocar senha e Sair.
  No celular (≤ 900 px) o menu vira gaveta pelo botão ☰ da barra preta. Visual: fundo claro, cartões brancos com cantos de 12 px,
  botões sem caixa-alta, títulos em Jost (Bodoni só na saudação do Início e no login).
- "Clientes e processos" é UMA aba no menu (pedido da usuária), com duas visões que dividem o cabeçalho escuro e a busca única
  (`cabCarteira`): "Por cliente" (#/clientes: cartões de cliente com os processos em chips coloridos pela fase e o próximo ato;
  a busca acha também pelo nº do processo, parte contrária ou vara) e "Por processo" (#/processos: filtros dentro do cartão de
  busca, etapas, lista/quadro). A última visão usada fica no computador (`carteira_visao`). Clientes SEM etapas.
- Dois grupos de clientes (6.9.5): "Com ação" (tem processo, inclusive o "a ajuizar" criado ao gerar procuração/contrato) e
  "Em atendimento" (sem contrato, procuração nem processo). Cartões no topo de Clientes (`grupo=acao|atendimento`) e etiqueta
  na lista. Cadastro novo cria a pasta no Drive sozinho e fica "Em atendimento"; na ficha, "Cliente contratou: abrir ação"
  (rota `clientes.abrirAcao`) cria o processo na fase "Petição inicial (a ajuizar)" (chave `contratado`).
- Petição inicial: todo processo "a ajuizar" (gerar documentos, abrir ação, processo novo sem número) ganha `responsavel`
  (Config RESP_INICIAL, escolhido em Tarefas › Responsáveis automáticos) e uma tarefa "Petição inicial — cliente" (marca
  `[inicial:ID]`, prazo PRAZO_INICIAL_DIAS, padrão 7). Trocar o responsável do processo passa a tarefa junto. Colocar o número
  muda a fase para "Em andamento" e a tarefa para "Protocolado" (`concluirPeticaoInicial_`).
- Processos: cartões de ETAPAS (as fases de `FASES`, com as cores de `CORES_FASE`; clicar filtra) e "Lista / Quadro por etapa"
  (quadro = processos em colunas por fase). Sem gráficos (foram para Relatórios a pedido da usuária).
- Relatórios: no topo a "Semana da equipe" (`relatorio.semana`, segunda a domingo, navegar semanas): por usuário, o que fez,
  lido da aba Log (`CATEGORIAS_LOG`: intimações terminadas, prazos cumpridos/conferidos/lançados, tarefas concluídas, WhatsApp ao
  cliente, agenda, clientes, processos, documentos, financeiro). Depois os gráficos, inclusive por fase e por tribunal.
- Fluxo da equipe (6.9.6): em cada prazo, intimação e petição inicial (processo "a ajuizar") vêm 1) "WhatsApp" ao cliente e
  2) "✓ Conferido": abre a lista da equipe (`equipe.listar`, `escolherQuem`), aperta o nome de quem fez e grava (rota
  `trabalho.conferir`): prazo → situacao "cumprido" + cumprido_por; intimação → terminada_por (e o prazo ligado também,
  `intimacoesDoPrazo_` liga pelos dois lados); inicial → tarefa "Protocolado" e o processo vai para "Em andamento" (com número)
  ou "Ajuizado" (sem). O log fica no nome de QUEM FEZ. Some da lista da equipe (intimações: `abertas`) e aparece só para a
  administração em "Aguardando o seu OK" (topo de Intimações e prazos; `trabalho.aguardando`), com "✓ OK" (`trabalho.ok`, grava
  ok_por/ok_em, aceita lote) ou "Devolver" (`trabalho.devolver`, volta para a equipe). "Confirmar data" é a conferência da data
  fatal calculada pelo robô (antigo "Conferir"). "✨ Resumir com IA" também em cada intimação (`ia.resumirIntimacao`).
- Relatórios: "O que cada colaborador fez" (Semana/Mês, `per=mes`): números da equipe, ranking com barras por tipo de trabalho
  (`CAT_EQUIPE`: cor e ícone), cartões por pessoa com blocos por tipo e a linha do tempo por dia.
- Avisos do robô que não sumiam: com a fila vazia o DataJud agora grava "em dia" e apaga o erro; a IA testa o Gemini e apaga o
  erro antigo quando responde. O cartão do robô avisa quando o Code.gs do Google é mais velho que o painel (`VERSAO_PAINEL` em
  painel.js = `VERSAO` do Code.gs: suba os dois juntos) e tem "Consertar agora" (`robo.consertar`).
- Início (simples, pedido da usuária): faixa escura enxuta (data, saudação em Bodoni, frase do dia, alerta de vencidos, botões
  "+ Novo cliente" e "Novo prazo"); 4 números (Prazos, Hoje, Tarefas, Processos); duas colunas: Prazos (vencidos primeiro, até 6)
  e Agenda (hoje e próximos 14 dias numa lista só, até 6); um cartão com 2 gráficos redondos (prazos em aberto e processos ativos
  por área, 5 áreas + "Outras"); pílula de status do robô. Carteira por fase e tribunal ficam em Processos e Relatórios.
- Gráficos redondos (`grafRosca` em painel.js, SVG próprio; legenda clicável que filtra): Início (prazos em aberto e processos
  por área), Processos (faixa acima da tabela: área, fase, tribunal), Financeiro (situação do mês e
  atrasos por tempo; escondido para o RH) e Relatórios (ativos e arquivados por área). Cores das fases em `CORES_FASE`.
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
- Robô do PIX (7.0.0, banco Inter): `lerPix_` roda no robô de hora em hora (e "Ler o Gmail agora" no Financeiro, rota `fin.pixLer`).
  Lê `from:no-reply@inter.co subject:(Pix recebido)` ("Você recebeu um Pix no valor de R$ X de NOME, na conta …"), guarda cada
  um na aba Pix (id = "pix:" + id do e-mail; nunca relê; PIX_GMAIL_DESDE, começa 45 dias atrás). Baixa SOZINHO só quando: nome
  igual ao de um cliente (`nomeComparavel_`, sem acento/"de"/"ltda"), parcela em aberto com o MESMO valor, já vencida ou a vencer
  em até 15 dias (a mais antiga), e nenhum pagamento igual já lançado à mão ±7 dias. Usa `pagarParcela_` (forma "PIX (Inter)",
  recibo automático). Todo o resto fica "a conferir" no Financeiro (quadro "PIX recebidos"): escolher a parcela e "Dar baixa"
  (`fin.pixBaixar`) ou "Não é honorário" (`fin.pixIgnorar`). RH vê sem valores e não dá baixa.
  Melhorias 7.0.1 (`planoDeBaixa_`): também baixa sozinho quando o PIX é a SOMA das parcelas em aberto mais antigas (2 a 6) e
  quando a parcela VENCIDA vem com até PIX_TOLERANCIA_JUROS % a mais (padrão 10; 0 desliga; ajuste no quadro, rota
  `fin.pixConfig`). Aprende o pagador (`apelidosPix_`): depois de uma baixa (à mão ou automática) o mesmo nome de pagador vai
  direto para aquele cliente (nome que apontou para 2 clientes é ignorado). A trava "já lançado à mão" ignora parcelas que já
  vieram de um PIX (`pagasPeloPix`). Cada baixa guarda o recibo (coluna `recibo`) e tem "Mandar recibo no WhatsApp"
  (agradecimento pronto; o PDF é anexado à mão).
- Parcelas a vencer têm "Lembrar no WhatsApp" e as atrasadas "Cobrar no WhatsApp", com a mensagem pronta (wa.me).

## Velocidade

- Robô da velocidade (7.1.0): `aquecerMemoria_` (gatilho `aquecerGatilho` de 10 em 10 min e logo depois do robô de hora em hora)
  deixa prontas na memória do servidor as listas grandes (clientes, processos, prazos, intimações abertas, relatório, honorários)
  para cada perfil. Essas listas são guardadas por PERFIL (`MEMORIA_POR_PERFIL`), não por pessoa, e a chave ignora campos vazios
  (`busca: ''`, `false`). O painel, 2,5 s depois de abrir, já busca em segundo plano Clientes, Prazos, Tarefas e Início.

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

- Tarefas 6.9.7: cada colaborador vê SÓ o que é dele (servidor, `listarTarefas_`: responsável = ele, ou criada por ele sem
  responsável); a administração vê tudo ("Minhas / Toda a equipe / pessoa"). "🙋 Eu faço" (e "Passar para…" para administração
  e advogada) em prazos, intimações e petição inicial (`trabalho.assumir`): prazo → responsável; intimação sem prazo → vira
  tarefa da pessoa com a marca `[intim:ID]` (Conferido em uma fecha a outra; conta uma vez só no OK); inicial → responsável do
  processo + tarefa. Tarefa tem prioridade (urgente/alta/normal/baixa), checklist (`tarefas.check`), comentários
  (`tarefas.comentar`, no histórico), repetição semanal/mensal (`repetirTarefa_` cria a próxima ao terminar, marca `[rep:ID]`),
  cliente e processo (por número). Quadro ou Lista, busca, filtros Atrasadas / Para hoje / Próximos 7 dias / Urgente / Alta.
  Etapas: A fazer → Fazendo → Pronto para revisar → Feito / protocolado (Conferido) → OK da administração.
- Início de cada um (`eu.painel`): colaborador vê os números dele (Comigo, Atrasadas, Hoje, Feitas na semana), "Minhas tarefas e
  prazos" com ✓ Conferido na própria linha, "O que eu fiz nesta semana" (blocos por tipo, posição na equipe) e os prazos do
  escritório; a administração vê o Início do escritório + as próprias tarefas, a própria semana e "N esperando o seu OK".

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
