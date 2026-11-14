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
- Avisos de audiência (8.6.0, pedido da usuária: "NÃO PODEMOS PERDER AUDIÊNCIA"): `lembrarAudiencias_` usa `atosDaAgenda_` (aba Eventos +
  agendas do Google AUDIÊNCIA CONCILIAÇÃO / INSTRUÇÃO / PERÍCIAS) e cria DOIS avisos para a secretaria (`respSecretaria_`): "Avisar o cliente
  (1 semana antes)" (até 7 dias antes; `[lembrete:chave]`) e "⚖ HOJE — lembrar o cliente" no dia (`[lembrete:chave|dia]` + `[avisodia]`:
  `whatsAto` manda a mensagem "HOJE é a sua…"). Início da secretaria/RH e da administração: blocos "Audiências e perícias de HOJE" (Lembrar
  hoje) e "Próximos 7 dias — avisar o cliente" (Avisar); `agenda.avisado` com `quando` = dia|semana grava `avisado_dia_em`/`avisado_em`
  (colunas novas em Eventos) e fecha a tarefa do aviso. O texto abaixo (2 dias úteis) é o comportamento ANTIGO.
- Datas de audiência (8.6.0): `acharAto_` apaga números de processo do trecho antes de ler a data (lia "…2026.5.12.0041" como 05/12/2041
  e criou 78 cópias de uma perícia); ano no máximo +3; `atoJaMarcado_` confere também a data da CHAVE do evento; evento de dia inteiro
  é lido no fuso da agenda (`diaDoEvento_`). `limparAtosImpossiveis_` (uma vez, Config FIX_ATOS_86) apagou os eventos/lembretes com ano impossível.
- "Não há prazo" (8.6.0): botão nos prazos PROVISÓRIOS/"conferir" (rota `prazos.situacao` situacao=semprazo): cancela, anota quem
  conferiu e tira a intimação das abertas. A regra "nunca sem data" continua: o robô cria o provisório; a equipe descarta com 1 clique.
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
- DJEN à prova de falhas (7.4.0, `buscarDjen`/`lerDjenNavegador` em painel.js): cada pedido tenta até 4 vezes (internet, 429, 5xx;
  esperas de 3, 8 e 15 s; 25 s de limite), o período vai em janelas de 7 dias e cada OAB/janela é separada (uma falha não derruba
  as outras). O que foi lido é mandado aos poucos (nada se perde); "lido até hoje" só é marcado quando tudo deu certo, senão a
  próxima rodada busca o mesmo período. Falhou → tenta de novo em 15 min. Roda no painel aberto em QUALQUER computador. O cartão do
  robô só mostra o problema em vermelho se não houve leitura boa nas últimas 6 h.
- Robô da Agenda (7.4.0, `sincronizarAgenda_`, toda rodada do robô): prazos abertos com data fatal (hoje até +90 dias, fora os de
  audiência) viram eventos de dia inteiro na agenda do Google "PRAZOS FATAIS" (id em Config AGENDA_PRAZOS; colunas `agenda_id` e
  `agenda_data` em Prazos): data mudou → move; cumprido/cancelado → apaga. Audiência/perícia mudada de dia/hora no Google Agenda →
  atualiza Eventos, o lembrete do ato e o próximo ato do processo; apagada no Google → o lembrete do ato é cancelado. Status em
  Config AGENDA_SINC (cartão do robô).
- IA ocupada: `chamarGemini_` espera e tenta de novo no 503/429/500 e, persistindo, usa o outro modelo (lite ↔ flash) só naquela vez;
  o cartão mostra "Google ocupado" como passageiro, não como problema.
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

## Robôs do escritório (7.7.0, `robosEscritorio_`, toda rodada do robô)

- Alvará/RPV/precatório (`valoresALevantar_`, `RE_VALOR_LEVANTAR`; fora "alvará de soltura"): intimação de até 30 dias → tarefa
  "💰 … levantar o valor" (marca `[valor:procId|tipo|intimId]`, valor citado "R$ x" quando houver) para o responsável do processo;
  Financeiro › aba "💰 A levantar" (rota `fin.alevantar`: honorário de êxito do cliente e previsão = valor × %). Lançar o alvará no
  honorário (`salvarRecebimento_`) fecha a tarefa (`fecharValoresLancados_`).
- Processo parado (`processosParados_`, 1 vez por dia, Config PARADOS_DIA): sem movimentação nem intimação há PARADO_DIAS (60),
  ativo, com número, fora "a ajuizar"/encerrado/suspenso → tarefa "verificar andamento / pedir impulso" (`[parado:procId]`), no
  máximo PARADOS_POR_DIA (10), os mais parados primeiro; não repete antes de 60 dias.
- Retomar contato (`retomarAtendimentos_`, 1 vez por dia): cliente cadastrado pelo painel há 7 a 45 dias, sem processo nem
  honorário → tarefa da secretaria com WhatsApp pronto (`[retomar:cliId]` `[wa:retomar]`). Importados (GEA etc.) ficam de fora.
- Cobrar assinatura (`cobrarAssinaturas_`): log "documentos gerados" (com documento `assinaCliente`) entre 1 e 14 dias e a pasta
  "DOCUMENTOS PARA ASSINAR" ainda com documentos → tarefa da secretaria (`[assinar:cliId|dia]` `[wa:assinar]`); a pasta esvaziou → a
  tarefa fecha sozinha.
- Pedir avaliação (`pedirAvaliacao_`): processo foi para "Encerrado" (arrastado no quadro ou movimentação de até 30 dias) → tarefa
  da secretaria "Pedir avaliação no Google" com WhatsApp pronto (`[avaliacao:cliId]` `[wa:avaliacao]`, uma vez por cliente).
  NUNCA pedir avaliação no site (pedido da usuária: só depois do processo pronto). Link em Config LINK_AVALIACAO (Tarefas ›
  Responsáveis automáticos); sem ele, vai o link do mapa.
- E-mail ao cliente quando o processo anda (8.2, `avisarMovimentoClientes_`): só cliente com acesso ao Acompanhe (`acesso_hash`) e
  e-mail no cadastro; movimentação depois de MOV_AVISO_DESDE e dos últimos 7 dias; um e-mail por cliente por rodada (até 40/rodada,
  80/dia), texto curto sem detalhes do ato com o link do /acompanhe/; marca `avisado_mov_em` no processo. Config MOV_AVISO = "nao" desliga.
- Secretaria = Config RESP_SECRETARIA (Tarefas › Responsáveis automáticos) ou a primeira pessoa com perfil secretaria (`respSecretaria_`).
- Tarefa com `[wa:tipo]` ganha o botão de WhatsApp com a mensagem pronta (`whatsTarefa` em painel.js). As marcas novas também
  ficam protegidas ao editar a tarefa.

## Edifício Future (8.0.0, pedido do Luiz)

- Painel à parte para o prédio (pasta do Drive "05. ED. FUTURE"). Botão "Painel Edifício Future" no fim do menu lateral
  (`trocar-painel`, `ABAS_FUTURE`, `modoFuture()` em painel.js); dentro dele, "Voltar ao escritório". Telas em painel/future.js
  (`window.FUTURE.tela`, usa `window.PAINEL_KIT`; future.js carrega ANTES do painel.js). Rotas `future.*` com `future: true`
  (`podeFuture_`: Config FUTURE_USUARIOS; vazio = TODOS os administradores, escolha do Luiz).
- Dados nas abas FutUnidades, FutPessoas, FutLanc, FutCobrancas, FutEnergia da planilha do painel (entram nos backups). A planilha
  antiga "EDIFICIO FUTURE CONTROLE" é só a fonte de `futureImportar_` (Configurações › Importar; não duplica: chave `imp:aba:linha`).
  Nenhum dado do prédio vai para o repositório.
- Cobrança mensal (`futureGerarCobrancas_`, robô de hora em hora + ao abrir): unidade alugada/renovar = aluguel + taxas + energia do
  MÊS ANTERIOR (FutEnergia), vencimento dia FUTURE_DIA_VENC (10). Começa em FUTURE_COBRAR_DESDE (mês seguinte à importação, se já
  passou do dia 10). Recebimento lançado no caixa (Aluguel da unidade no mês) dá baixa sozinho. Apartamentos "- HC" = pagos pela
  empresa Hercílio Luz (`pagador`): cobrança única com "Recebi da …" (`future.cobranca.pagarGrupo`).
- Telas: Visão geral (planta do prédio por andar com cores por situação, ✓/!/• do aluguel do mês, HC; contratos vencendo em 45 dias
  com "Renovar?" no WhatsApp; atrasados com "Cobrar"; gráfico de 12 meses), Apartamentos e salas (ficha, histórico de quem morou,
  cobranças, energia), Cobranças, Caixa do prédio, Energia, Relatório do mês (para imprimir/PDF, com comparação ao mês anterior),
  Locatários (todos que já passaram), Configurações.
- Visual 8.1 (pedido do Luiz: "não gostei"): tema CLARO e VERDE no modo Future (`body.modo-future`: menu branco, marca "EF" verde,
  cabeçalhos verde-claros, botões verdes). Não voltar ao escuro.
- Pastas do Drive (8.1, `futureSincronizarDrive_`, 1 vez por dia no robô, na importação e em Configurações › "Ler as pastas do Drive
  agora", rota `future.drive`): 05. ED. FUTURE › APARTAMENTOS › "AP 101"… e "SALA COMERCIAL 2"/"… SALA 04" → `pasta_url` da unidade;
  cada subpasta = uma pessoa que morou (`futMesmaPessoa_` liga à já cadastrada; senão entra como "saiu", origem "pasta do Drive";
  "10 DIAS" vira observação; "HERCILIO LUZ" marca o pagador HC) com `pasta_url` e nº de `arquivos` ("📁 documentos").
- 8.2: Cobranças em CARTÕES (aluguel, taxas, energia, total) com "Cobrar no WhatsApp" (mensagem detalhada `textoCobranca`, com chave
  PIX Config FUTURE_PIX e as taxas Config FUTURE_TAXAS_DESC; clicar grava `enviado_em/enviado_por`, rota `future.cobranca.enviada`),
  "✓ Pagou", "Ajustar valores", telefone que falta salvo no próprio cartão; abas Falta pagar / Pagas / Todas. Apartamentos: contrato
  (vence em X dias / renovar / link "📄 ver contrato" achado na pasta do Drive: arquivo com "contrato"/"locação" no nome →
  `contrato_url`), garantia (caução R$/avalista/sem garantia). Energia: "Colar a tabela da Celesc" (rota `future.energia.colar`:
  acha a unidade pela UC/medidor, "Sala n" ou nº do apartamento, e o valor; atualiza a cobrança do mês seguinte). Morador novo
  ganha pasta no Drive sozinho (`futCriarPasta_`); "+ criar pasta no Drive" em Locatários (rota `future.pessoa.pasta`).
- 8.3 Cobrança no modelo do Luiz (`textoCobranca`/`textoGrupo` em future.js): "Oi, bom dia, Nome! … Segue o demonstrativo do
  {Config FUTURE_NOME_MSG, padrão "Edifício Future" — NUNCA "Edifício Cultura" (8.7.1: `futNomeCerto_` troca em qualquer texto salvo; `futCorrigirNomePredio_` corrige a Config uma vez)} — apartamento 101, referente a {mês ANTERIOR ao vencimento}" + Aluguel, taxas item
  a item (Config FUTURE_TAXAS_ITENS "Nome: valor", só quando a soma bate com as taxas da unidade), Energia, Total, Vencimento, "Pagamento:"
  (Config FUTURE_PAGAMENTO, só na planilha — nunca no repositório) e fecho (FUTURE_FECHO). Entrada no meio do mês de referência = "Aluguel
  proporcional de 04/10 a 31/10 — 28 dias, pela base de 30 dias" (`futCalcCobranca_`, coluna `detalhe` = prop|entrada|fim|dias). Cobrança
  do robô ainda não enviada/paga é recalculada sozinha; "Ajustar valores" (aluguel/energia/outros) trava o recálculo. Unidade `moeda` =
  dolar → "Total em reais / Equivalente em dólares / Cotação" (FUTURE_COTACAO) e "Para pagamento em reais:". Empresa pagadora (HC): um
  demonstrativo com blocos "Apartamento 102 — Everton" + total geral, telefone/contato em Config FUTURE_PAGADORES ("Nome | tel | contato").
  A mensagem SEMPRE pede o comprovante (se a frase final não pedir, o painel acrescenta) e avisa que aceita dinheiro (Config
  FUTURE_DINHEIRO = nao desliga; frase em FUTURE_DINHEIRO_TXT).
  Salas: `cobra_energia` = nao (pagam a própria energia) e taxas FUTURE_TAXAS_SALA (107; os recebimentos são 2.000 + 107). Falta energia →
  "[preencher]" e o painel pergunta antes de mandar. Energia de out/2026 semeada uma vez (`FUT_ENERGIA_INICIAL`, só nº do apto e valor).
  "Colar" em Energia também lê os demonstrativos ("apartamento 207" … "Energia: R$ 88,10").
- 8.3 Contratos (#/future/contratos, `future.contratos`/`future.contrato.gerar`): 3, 4, 6, 12 meses (ou outro), com ou sem caução (até 11 meses
  = 1 aluguel, 12 ou mais = 2; editável), fim = mesmo dia n meses depois. Modelos Google Docs na pasta 05. ED. FUTURE › MODELOS DE CONTRATO
  ("MODELO — CONTRATO DE LOCAÇÃO (painel)" e "MODELO — LAUDO DE VISTORIA (painel)", ids em Config FUTURE_MODELO_*), com as cláusulas do
  contrato do Gabriel; marcas {{…}} e [[SO_CAUCAO]] (sem caução esses parágrafos saem e as disposições finais viram a 9ª). Os dados da
  locadora ficam SÓ no modelo do Drive. Gera em APARTAMENTOS › AP x › NOME (pasta criada SÓ aqui — salvar a unidade não cria mais pasta)
  contrato + laudo (Doc editável + PDF), atualiza unidade e locatário (opção "contrato para depois"), lança a caução no caixa se pedido, e
  registra na aba FutContratos ("↻ renovar" e "Contratos terminando (45 dias)"). Só apartamentos (modelo residencial).
- 8.4 (pedido do Luiz: "está confuso"): MÊS DE REFERÊNCIA em tudo — a cobrança que vence em novembro é "referente a outubro"; as telas
  abrem no mês anterior (`refHoje`, `navRef` em future.js) e o relatório de outubro mostra as cobranças que vencem em 10/11. Recebimento
  pago pelo painel vai para o caixa na competência de REFERÊNCIA (`futRefDaCobranca_`; `futMigrarReferencia_` acertou os antigos uma vez).
  Menu em 3 grupos: Dia a dia (Visão geral, Cobranças, Energia, Lavanderia, Despesas e receitas), Cadastro (Apartamentos e salas,
  Locatários, Contratos), Fechamento (Relatório do mês, Configurações).
  Cobranças em ETAPAS: 1 Mandar → 2 Cobrado → 3 Pago (abas por etapa; "Copiar texto" + "✓ Já mandei" marca cobrado sem WhatsApp,
  `future.cobranca.enviada` com `como`/`desfazer`). Lavanderia (aba FutLavagens, rotas `future.lavanderia*`): lançar (25/30 por
  lavagem, Config FUTURE_LAV_PRECO/PRECO2) ou colar a tabela; entra sozinha na cobrança do mês seguinte (coluna `lavanderia`, linha
  "Lavanderia (2 lavagens)" na mensagem; ao quitar vira receita "Lavanderia" no caixa). Total = `futTotal_` (aluguel+taxas+energia+
  lavanderia+outros). Energia (`future.energia`): só apartamentos (salas pagam a própria), valor sem kWh, "falta lançar", planilha
  de 12 meses e tabela de titular/kit/medidor/UC editável. Despesas e receitas: planilha de várias linhas (`future.lancamento.lote`)
  e "colar lista". Contrato por TEMPORADA (modelo "MODELO — CONTRATO DE TEMPORADA (painel)", tirado do contrato AMANDA 10 DIAS):
  dias ou meses, valor fechado (energia/taxas inclusas, lavanderia à parte, sem caução), metade na reserva + metade na saída ou à
  vista; unidade `modalidade` = temporada (o robô não gera aluguel mensal) e as parcelas viram cobranças (`detalhe` temp|…).
- 8.4.2: "Despesas" só com despesas (receitas entram pelas cobranças e aparecem juntas no Relatório do mês). Lavanderia e faxina:
  serviços com tipo (coluna `tipo` em FutLavagens: lavar R$ 25, secar R$ 25, lavar e secar = os dois, faxina R$ 120; Config
  FUTURE_LAV_PRECO / FUTURE_SECAR_PRECO / FUTURE_FAXINA_PRECO; `FUT_SERVICOS`, `futTipoServico_`); dá para trocar o serviço de um
  lançamento (recalcula); a mensagem traz "Lavanderia (2 lavagens, 1 secagem)" e "Faxina do apartamento" em linhas separadas; ao quitar,
  vira receita Lavanderia e Faxina. Pasta do Drive 05. ED. FUTURE › PARA IMPORTAR (`futureImportarPasta_`, robô de hora em hora e
  botão em Despesas, rota `future.importarPasta`): arquivo "DESPESAS …" (data | categoria | descrição | valor) e "LAVANDERIA …"
  (data | AP | serviço | quantidade; "SUBSTITUIR" troca o mês), "MES: aaaa-mm" no topo; depois de lido vira "IMPORTADO …" (chave
  `pasta:arquivo:linha` evita duplicar). É assim que listas com nomes entram sem passar pelo repositório. Ao abrir o painel do
  prédio, as outras telas já são buscadas em segundo plano (`prepararTelas` em future.js).
- 8.4.3: CONTAS PARA RECEBER (Config FUTURE_CONTAS em JSON + FUTURE_CONTA_PADRAO; só na planilha): Configurações › "Contas para receber
  (Pix)" (apelido, titular, tipo e chave Pix, banco, código, agência, conta); a mensagem sai com "Pagamento (Pix):" + "Chave Pix (celular):
  …" numa linha só + titular + banco/agência/conta (`blocoPagamento` em future.js). Em cada cartão de cobrança dá para escolher outra
  conta ("Receber em") e "usar sempre neste apto" (coluna `conta_receb` da unidade); botão "Copiar chave Pix". Emojis são tirados da
  mensagem (`semEmoji`). Arquivo "CONTA …" ou "PAGAMENTO …" (linhas "chave: valor", "padrao: sim") na pasta PARA IMPORTAR vira conta.
- 8.4.4: os aluguéis de um mês de referência são pagos a partir do dia 5–10 do mês seguinte (exceção: quem paga adiantado, ex. temporada
  de 1 mês). "Desfazer pagamento" (`futDesfazerPagamento_`): pagamento feito pelo painel é apagado; recebimento que veio do caixa/planilha
  (atrasado do mês anterior que a baixa automática juntou) vai para o mês de referência anterior e não volta a baixar. Uma vez
  (`futCorrigirOutubro_`, Config FUTURE_FIX_OUT26): AP 202 e Sala 2 tinham pagamentos de setembro juntados a outubro → foram para setembro.
- 8.8.0 Contratos remodelados (#/future/contratos): no topo "Contratos em vigor" (aptos alugado/renovar, fora temporada) com "✎ Termo aditivo",
  "⏹ Encerrar (distrato)" e "↻ Renovar (contrato novo)". Modelos no Drive (MODELOS DE CONTRATO): "MODELO — DISTRATO DE LOCAÇÃO (painel)" e
  "MODELO — TERMO ADITIVO DE LOCAÇÃO (painel)" (Config FUTURE_MODELO_DISTRATO/ADITIVO; dados da locadora só no modelo). `futContratoVigente_`
  pega o último contrato "gerado" do apto (ou a unidade + locatário atual); `futGerarDoc_` copia, preenche, põe em negrito "CLÁUSULA nª – …" e faz o PDF.
  Distrato (`future.contrato.distrato`): motivo fim/locatario/acordo/locadora, vistoria ok/ressalvas, pendências (aluguel proporcional, energia,
  outros) com vencimento, multa (só no pedido do locatário: sugestão 40% × aluguel/30 × dias que faltam; cobrar ou dispensar), caução (devolver/
  reter); libera o apto (vago), locatário "saiu", contrato "encerrado", cobrança do acerto opcional (`detalhe` distrato, o robô não recalcula) e
  devolução da caução no caixa. Aditivo (`future.contrato.aditivo`, campos com valor "sim"): prorrogar (meses ou nova data), reajustar (novo
  aluguel a partir de), trocar de apartamento (o antigo fica vago) e cláusula livre; numerado PRIMEIRO/SEGUNDO… por contrato; atualiza saída/aluguel.
  Histórico mostra Distrato / Termo aditivo. Distrato do Richarles (AP 103, 04/11/2026) feito à mão no Drive.
- Falta (o Luiz vai mandar): e-mails do PIX agendado no Gmail (baixa automática), a tabela de energia (UC × apartamento) e os telefones.

## 8.10.0 (nov/2026: revisão externa + pedidos da usuária)

- Prazos em FILAS (`filaPrazo_` no servidor, `filaDe` no painel): 'conferir' (provisório, a definir ou IA divergente "⚠ ATENÇÃO" → abrir no
  tribunal), 'calculado' (robô calculou, só confirmar a data) e 'confirmado'. Tela Intimações e prazos com as 3 filas (`?fila=`), divergência
  sempre no topo. Cores: ÂMBAR = conferir no tribunal (`linha-conferir`, `tag conferir`), VERMELHO só para prazo confirmado/calculado em risco
  ou vencido, VERDE = cumprido — sempre com o texto do status junto. "Conferi no tribunal" pede a FONTE (Prazos.conferido_fonte; o servidor
  recusa confirmar provisório/divergente sem fonte). Agenda: provisório = "⚠ CONFERIR NO TRIBUNAL" em amarelo no Google (agenda_data com "|c")
  e no painel (`ag-conferir`); confirmado = "⏱" vermelho.
- Início: "Precisa de ação agora" (`inicio.acoes`, `blocoAcoesAgora`): prazo vencendo em 2 dias sem responsável (vermelho), divergência da IA e
  provisório vencendo em 3 dias (âmbar), audiência/perícia em 7 dias sem horário ou sem aviso ao cliente (azul), intimações a fazer sem
  responsável (só a conta). Cada linha: próxima ação + quem cuida. Colaborador vê só o dele (+ os sem responsável).
- Robô: DataJud 502/504 fica na fila (não vira erro se leu algo), `DATAJUD_OK` = última leitura boa; cartão mostra última leitura boa e a
  próxima tentativa (+4 h). DJEN só lê com o painel aberto (o CNJ bloqueia o Google) — dito no cartão. "Carregando…" > 20 s mostra
  "Tentar de novo" (`carregando`).
- Ficha do cliente: "Onde o atendimento está" (documentos gerados → assinatura → assinado → financeiro; `documentos.assinaturas` com
  `todas`), botão "✎ Editar cadastro" no topo e "✎ editar" em cada observação (`clientes.notaEditar`: corrige/apaga uma linha, mantém
  data/autor, marca "(editado em … por …)", confere a linha original e registra no Log).
- Busca de cliente por PALAVRA (`palavrasComecam`/`bateBusca`): "toni" acha Toni/Toninho, não Antônio; nomes primeiro, outros campos só se
  nenhum nome bater; com números compara dígitos. Todas as caixas com lista (datalist) filtram assim (ouvinte global de input).
- Modelos: todos os perfis geram tudo (já era); "Liberar a edição dos modelos para a equipe" (`modelos.liberarEdicao`, só administração) dá
  EDIÇÃO nos Google Docs dos modelos e na pasta de modelos do escritório para o e-mail Google de cada usuário ativo (campo E-mail em Usuários).
- Contrato de honorários em UMA folha: mesmas 11 cláusulas em texto enxuto, título junto do texto ("CLÁUSULA 1ª – OBJETO. …"), modo
  `umaFolha: 'mini'` (EB Garamond 10,5, espaço simples, margens 20/48/62, logo menor), chave MODELO10_CONTRATO_ID; promissória vira "§ 4º".
- Marketing: "Quais páginas trazem consultas" (`marketing.funil`, aba MktFunil): cliques por página (automático) + conversas iniciadas e
  consultas agendadas (totais do mês lançados pela equipe, sem nome).
- Paleta: site grafite quente #171513, dourado fosco #B58D52, marfim #F8F5EF; painel com menu grafite (#1C1A17), fundo marfim, cartões
  brancos e dourado só na marca e na aba ativa.
- Site: atua em TODAS as áreas (sem "área principal"/"especialidade" trabalhista); horário 8h–12h e 13h30–18h (JSON-LD opens 08:00);
  menu "Empresarial" (não "Empresas"); "Entrar" discreto na faixa de cima à direita (`util-entrar`), no menu do celular e no rodapé.

## 8.11.0 (nov/2026: revisão externa + pedidos da usuária e do Luís)

- "Não vai assinar" / "Não vai fechar" (`desfazerFechamento_`, rota `processos.naoFechou`; `documentos.assinatura` acao=desistiu vale também
  para quem já foi marcado "Assinado"): arquiva a petição inicial SEM número (fase extinto), cancela a tarefa da inicial e os lembretes e
  cancela o honorário lançado ao assinar — só se nenhuma parcela foi paga; as parcelas não pagas são apagadas (`apagarLinha_`: linha em
  branco). O "✓ Assinado" agora guarda os ids lançados em `honorarios_lancados` ("data|id,id"). Botão na caixa da Petição inicial, no cartão
  do quadro e na "jornada" da ficha.
- Protocolou (número na inicial, `trabalho.conferir` inicial ou `processos.salvar`): `aoProtocolar_` gera sozinho o código do Acompanhe
  (cliente com CPF e sem código; quem já tem fica com o dele) e já lê o DataJud. A tela do processo abre com a mensagem do WhatsApp com o
  código (`PROTOCOLOS`/`guardarProtocolo` em painel.js; o código só existe naquela aba).
- "Aguardando o seu OK" numa linha só: "✓ OK" pequeno + "ver a lista" (lembra em localStorage `aguarda_aberta`).
- Telefone com dois números ("… / …", "ou", "e") → só o primeiro ANTES de juntar os dígitos (`telefoneWhats` em painel.js e `whats` em
  future.js); os links de WhatsApp das telas usam `telefoneWhats`.
- Calculadora de rescisão: mensalista = 30 dias; saiu no último dia do mês = salário cheio (31/10 não vira 31/30).
- Prazo vencido conta dias do calendário: "venceu ontem" (antes, fatal 04/11 visto em 05/11 dizia "venceu hoje").
- IA: `lerRespostaGemini_` nunca mostra pedaço de JSON/código; resposta cortada termina na última frase inteira + "(resposta da IA incompleta…)".
- Marketing: cliente novo sem "Como nos conheceu?" → "RETORNO NÃO MEDIDO" (não "não está dando retorno").
- Site: "Agendar pelo WhatsApp"; legenda "Nossa identidade" (não "Recepção"); pergunta repetida tirada do Criminal.
- Padrão de petições do escritório: docs/PADRAO-PETICOES.md (cópia em painel/padrao-peticoes.md; botão "📋 Copiar o padrão de petições (para
  IA)" em Modelos). `padraoPeticao_` formata as petições geradas (modelos do painel com `processo` e modelos do Drive que são petição):
  entrelinha 1,5, 8 pt depois, recuo 1 cm, títulos em MAIÚSCULAS, artigo citado ("Art.", "§", aspas) em fonte 10 com recuo de 6 cm.
  Contratos do Edifício Future seguem o mesmo espaçamento (`futPreencherDoc_`). Mudou o padrão? Atualize os dois arquivos .md juntos.
- Edifício Future: distrato feito à mão → "Já fiz o distrato fora do painel" (`sem_documento`) só libera o apartamento (vago) e tira o
  locatário. Contrato e laudo: UC + medidor (relógio) + leitura, chaves e controles, ressalvas, e-mail do locatário (`email` em FutPessoas e
  FutContratos; `video_url`, `enviado_em/por`). `futAtualizarModelos811_` (uma vez, Config FUTURE_MODELOS_811) acrescentou nos modelos do Drive:
  "A VISTORIA É PARTE DESTE CONTRATO", "RESPONSABILIDADE PELO QUE FOI ENTREGUE", caução como garantia (não paga aluguel/último mês; devolvida
  só depois da vistoria final), quadro "4.1 ITENS CONFERIDOS NA ENTREGA" no laudo e o prazo `{{PRAZO_LAUDO}}`. Prazo para apontar
  divergência no laudo: a Lei 8.245/91 não fixa (é contratual) → padrão 5 dias corridos da entrega das chaves (Config FUTURE_PRAZO_LAUDO_DIAS).
  "✉ enviar vistoria" (rota `future.vistoria.enviar`): Gmail com contrato + laudo em PDF anexos e o link do vídeo (compartilhado só com esse
  e-mail); WhatsApp com mensagem pronta (os PDFs e o vídeo são anexados à mão — nada fica público).
- Financeiro › "📥 Antigos para lançar" (rota `fin.levantamento`, permissão financeiro): lê a planilha "Honorários Araújo — levantamento e
  conciliação" (Config LEVANTAMENTO_ID; abas Contratos, Mensalistas, Cobranças, Promissórias) e mostra os clientes do painel SEM honorário que
  têm contrato/promissória/cobrança. "Lançar" abre o honorário preenchido (params tipo, valor, parcelas, venc, pct, mensal, obs → situação
  "importado — conferir"); "Não lançar" (Config LEVANT_IGNORADOS); "Lançar os N de êxito" só para processo ativo. Nada é lançado sozinho.
  Em 06/11/2026: todos os 1.431 clientes do GEA já estavam no painel; 479 contratos, 25 cobranças e 94 promissórias sem honorário.

- 8.11.1: observações SEM limite (pedido da usuária): sem os 2.000 caracteres por anotação; `seguro_` corta célula só em 49 mil (antes cortava
  TODA célula em 5 mil e as observações antigas sumiam). Passou de ~45 mil na célula → `guardarObsCliente_` move as anotações mais antigas para
  a aba ObsArquivo (cliente_id, texto) e a ficha mostra "Observações antigas". Obs. de despesas e do Edifício Future também sem corte.
  Parcelas que faltam pagar em VERMELHO (`parcelasAbertasCliente_` em clientes.obter → `seloParcelas` no topo da ficha; `parc_abertas`/
  `parc_atrasadas` em clientes.listar → etiqueta no cartão): ignora honorário cancelado/encerrado; RH vê só as contas, sem valores.

- 8.11.2 (pedidos de 06/11/2026):
  - Petição inicial: 1º manda a inicial ao CLIENTE aprovar (WhatsApp "veja se está tudo certo ou se quer mudar algo"); depois do clique no
    WhatsApp o "✓ Conferido" aparece ao lado, no mesmo passo (`caixaPeticaoInicial`; sessionStorage `inicial_wa_<id>`).
  - Processos abrem só com os EM ANDAMENTO (`sit` padrão = ativo); arquivados, "não fechou" e desistências em Situação › Arquivados/Todos.
  - Edifício Future: arquivo "DISTRATO…"/"RESCISÃO…" na pasta do morador ATUAL → `futLiberarPorDistrato_` (na leitura diária das pastas)
    deixa o apto vago, o locatário "saiu" e registra o distrato (é o caso do AP 103). `futAtualizarModelos811_` roda no robô de hora em hora.
  - Levantamento: o robô lança UMA vez (aos poucos, 60 por rodada; Config LEVANT_AUTO_812) os êxitos com percentual de clientes com processo
    ativo ("importado — conferir"). Financeiro › "📥 Do sistema antigo" agora também mostra as dívidas das planilhas "Planilha de cobranças" e
    "Clientes devedores" (aba Cobranças do levantamento) e as parcelas anotadas só na AGENDA do GEA desde 2026 (aba Histórico GEA), para quem
    NÃO tem parcela em aberto no painel. Em 06/11: as 254 parcelas do "GEA — financeiro" já estavam no painel; 21 devedores das planilhas sem
    nada em aberto e 5 sem cadastro.
  - Contrato de honorários: "Formato do contrato" no gerador — Uma folha (padrão) ou Padrão do escritório (`padraoContrato_`; lembra em
    localStorage `formato_contrato`).
  - Resumo das 7h: ninguém com e-mail em Usuários → vai para a conta dona do painel.
  - Site: início reordenado — abertura → "Como podemos ajudar" (por problema) → Resolva pelo site → blog → Quem cuida → Estrutura →
    calculadora → Acompanhe → Como funciona → Dúvidas → Blog → contato; saíram "O escritório" (números), "Direito Empresarial" e "Publicações"
    (estão em /escritorio/ e /empresarial/).
  - Tarefas: etapa "Aguardando cliente" (`aguardando`, entre Fazendo e Pronto para revisar). Agenda: aviso de conflito de horário
    (`conflitosAgenda`). Modelos: prévia do que vai no documento e do que falta, em vermelho (`desenharPrevia`). Financeiro: "↻ Renegociar a
    dívida" no honorário (rota `fin.renegociar`: abertas saem, parcial fica com o pago, saldo ± juros/desconto vira parcelas novas).

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

- Revisão 8.5.0 (Usuários › Revisão geral, `revisaoGeral_`): etapa conferida com TODA a história (`movimentosDoProcesso_` = DataJud +
  avisos; `faseDaHistoria_`; só para a frente, menos as etapas gravadas pela regra antiga errada); baixa definitiva / execução extinta
  sem nada depois → Encerrado + status arquivado; lista os processos com dígito verificador errado (`cnjValido_`, módulo 97; o
  painel também avisa na tela do processo e `salvarProcesso_` recusa número com dígito errado). `faseDoMovimento_` corrigida:
  "conclusão para julgamento", pauta e "instrução e julgamento" não são sentença; "decurso" não é recurso; "solicitação de
  habilitação" não é citação; "extinção da execução" = encerrado; sobrestamento por RE não é recurso.
- Intimações abertas (8.5.0, `arquivarMovimentos_`, na revisão e em toda rodada do robô): só movimentação (sem prazo, sem tarefa
  `[intim:]`) há mais de 7 dias e as de prazo cumprido/baixado ganham terminada_por "robô (…)" e ok_por "robô" (não vão para o OK).
  Nada é apagado: continuam em "Todas".
- Processos em andamento e arquivados/baixados ficam todos no painel. A situação vem da última movimentação
  (`atualizarMovimento_`); o histórico antigo do Gmail é lido por `importarHistoricoGmail_` até o fim da caixa.

## Pastas dos clientes

- Não criar pastas novas para clientes antigos. Só ligar às pastas que já existem no Drive (`vincularPastas_`).
  Pasta nova só para cliente cadastrado pelo painel ou quando o usuário gera documento para quem não tem pasta.

## Dados

- Nenhum dado de cliente vai para este repositório (é público). Tudo fica na planilha PAINEL — BANCO DE DADOS.

## Modelos de documentos

- A geração de documentos fica só na aba Modelos (a ficha do cliente tem apenas o botão "Gerar documentos").
- Assinatura (8.4.1, pedido da usuária: "nem toda procuração e contrato significa que vai assinar"): gerar procuração/contrato
  (sem nº de processo) NÃO abre mais a petição inicial; cria um registro "aguardando" na aba Assinaturas (um por cliente). Botões
  "✓ Assinado" (rota `documentos.assinatura` acao=assinado → `abrirPeticaoInicial_`: processo "Petição inicial (a ajuizar)" + tarefa da
  inicial) e "Não vai assinar" (acao=desistiu) no resultado da geração, na ficha do cliente e no topo de Modelos ("Aguardando
  assinatura", rota `documentos.assinaturas`). Robô `lembrarAssinaturas_` (substituiu `cobrarAssinaturas_`): 7 dias sem assinatura →
  tarefa "Assinatura pendente — cliente" para quem gerou (ou a secretaria), `[assinatura:id]` `[wa:assinar]`, de novo a cada 7 dias
  (até 3 vezes); "Assinado"/"Não vai assinar" fecha o lembrete.
  8.4.5: grupo "✍ Aguardando assinatura" em Clientes (4º cartão, `grupo=assinatura`, etiqueta no cartão do cliente) e faixa amarela
  (vermelha com mais de 7 dias) no topo de Clientes e Processos (`faixaAssinaturas` em `cabCarteira`). Na ficha sem registro:
  "Marcar aguardando assinatura" (acao=criar). Casos antigos (`assinaturasAntigas_`, uma vez, Config ASSIN_ANTIGAS): petição inicial
  sem número criada pelo gerador entra como aguardando, ligada ao processo (1º lembrete em 7 dias); "Assinado" mantém o processo;
  "Não vai assinar" arquiva o processo sem número e cancela a tarefa da inicial.
  8.5.0 (pedido da usuária): o HONORÁRIO só entra no Financeiro depois de assinado. Ao gerar o contrato, o combinado (forma, valores,
  parcelas) fica guardado no registro da aba Assinaturas (colunas `honorarios` JSON e `honorarios_lancados`); o "✓ Assinado" lança
  (`lancarHonorariosForm_`) e devolve `lancados`. O cartão "aguardando" mostra "💰 … entra no Financeiro ao assinar". Só se não houver
  procuração/contrato entre os documentos o honorário é lançado na hora.
- Contrato previdenciário (MODELO9_CONTRATO_PREV_ID): na concessão o gerador escolhe "2 benefícios ou 30% (o que for maior)" (padrão),
  "2 primeiras parcelas do benefício + X% dos retroativos" ou "apenas as 2 primeiras parcelas" (`d.prev`, `textoPrevConcessao_`).
- TODOS os perfis (inclusive RH, secretaria e estagiário) geram TODOS os documentos, também contratos de honorários, recibos,
  promissórias e cobrança (8.3.2, pedido da usuária); o honorário do contrato é lançado no financeiro por quem gerar.
  O RH continua sem ver valores nas telas do Financeiro e sem editar honorários/parcelas lá.
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

## Início do RH, Tarefas, Relatórios e Marketing (8.6.0)

- Início da secretaria/RH: números Audiências hoje / Para avisar / Cobranças / Aniversários; blocos de HOJE, próximos 7 dias, "Vencem hoje —
  lembrar", "Não pagos — cobrar" e aniversariantes, todos com WhatsApp. `inicio.extras` (param `dia`) fica na memória do servidor por perfil
  (ROTAS_GUARDADAS + MEMORIA_POR_PERFIL), é aquecido pelo `aquecerMemoria_` e NÃO vai mais no lote (corre em paralelo); se passar de 25 s a
  tela abre e se redesenha sozinha quando chegar (antes o RH via tudo vazio).
- Tarefas: visão padrão "Lista do dia" (`listaDia` em telaTarefas; `tarefas_visao86`): campo "O que precisa ser feito?" + para quem +
  quando, grupos Atrasadas/Hoje/Amanhã/7 dias/Depois/Sem data, ✓ de um clique (prazo usa o Conferido), WhatsApp na linha, "feitas hoje".
  Quadro e Tabela continuam como opção.
- Observações do cliente em todo lugar (`notasDoCliente`): tela do processo, do prazo e prévia (📝) no cartão da lista de clientes
  (`obs`/`n_obs` em clientes.listar). "Aguardando assinatura" saiu de Modelos (fica em Clientes).
- WhatsApp: "Abrir o WhatsApp Web do painel" no menu do nome abre a aba `whatsapp_painel`; aba aberta à mão não pode ser reaproveitada.
- Relatórios: "Resultados de <mês>" (`blocoResultados`, `doMes` em relatorio.geral, `mes=aaaa-mm`): contratos fechados (Assinaturas
  assinado), clientes novos e processos finalizados, com nomes; gráficos mensais de contratos fechados e finalizados.
- Marketing (#/marketing, só administração; rotas `marketing.resumo`/`marketing.salvar`, aba Marketing): investimento por mês/canal/área
  lançado à mão (custo do Google Ads), cliques anônimos do site (`site.clique` público → aba SiteCliques: página, área, origem ads/google/
  social/direto, 300/h; site.js guarda a origem na sessionStorage pelo gclid/utm), contatos do site (Contatos.origem), clientes com
  "Como nos conheceu?" (Clientes.como_conheceu, `CANAIS_CONHECEU`), contratos assinados e honorários contratados/recebidos. Veredito por
  área bem explícito ("DÁ RETORNO: cada R$ 1 trouxe R$ x" / "AINDA NÃO SE PAGOU"). Uma campanha por área no Google Ads = uma linha por área.

## 8.7.0 (organizar, PIX, petições, linha do tempo, calculadoras, blog, Google Ads, Future)

- Organizar cadastros (#/organizar, botão "🔧 Organizar cadastros" em Clientes e processos; rotas `organizar.listar`/`organizar.ligar`):
  processos ativos sem cliente com sugestões (mesmo nome / nome parecido) → "Ligar" ou "+ Criar cadastro" (nome do tribunal, origem
  "processo (organizar cadastros)", sem pasta); "Cadastros para completar" (clientes com processo ativo; sem telefone primeiro) com
  "Pedir no WhatsApp" só do que falta. SEM campo de e-mail para a equipe e SEM OAB nova (pedido da usuária: só a da Dra. Júlian).
- PIX (`classificarPix_`, usado no robô e em `reprocessarPixPendentes_`, que reconfere os "a conferir" toda rodada): nome com 2 partes
  iguais (`clientePor2Nomes_`); PIX do mesmo valor das parcelas do cliente sem parcela aberta perto (> 20 dias) = parcela de mês
  ANTERIOR à importação do GEA → lança parcela paga "avulsa" (`parcelaAnteriorImportacao_`); "Não é honorário" pede o motivo (coluna
  `categoria` em Pix) e o robô aprende pelo pagador (`categoriasPix_`). PIX ENVIADOS ("Pagamento Pix realizado", `lerPixSaida_`,
  Config PIX_SAIDA_DESDE): viram despesa paga "PIX para NOME" (marca `[pix:id]`), ou dão baixa numa despesa prevista de mesmo valor ±10
  dias; categoria aprendida pelo nome, senão "A classificar" (seleção na tabela do Caixa, rota `fin.despesa.categoria`, aplica às
  outras do mesmo nome). Nenhum PIX recebido é do Edifício Future (palavra da usuária).
- Petições genéricas (MODELO9_*, grupo Petições, precisam do nº): ciência, dilação de prazo, impulso, laudo, cálculos, alvará, novo
  endereço, rol de testemunhas, videoconferência, manifestação livre. O campo "detalhes/objeto" do gerador entra em `{{detalhes_peticao}}`;
  o que depende do caso fica "[COMPLETAR: …]".
- Processo: "Como está o processo?" (`ia.resumirProcesso`: Gemini, histórico anonimizado, texto simples para o cliente + nota para a
  equipe, botão WhatsApp; `chamarGemini_(…, livre)`) e "🕑 Linha do tempo" (`processos.linhaTempo`: DataJud, intimações, prazos, atos,
  tarefas e log de documentos/WhatsApp).
- Site: /calculadoras/ (assets/calculadoras.js/.css): "Ainda dá tempo?" (2 anos do fim do contrato, aviso indenizado projetado — OJ 83;
  alcance de 5 anos) e estimativa de rescisão (saldo, aviso proporcional Lei 12.506, 13º e férias por avos ≥ 15 dias, férias vencidas,
  multa 40%/20% do FGTS, acordo 484-A com metade do aviso). Tudo no aparelho, nada é enviado. Link na página Trabalhista e no sitemap.
- Blog: o robô também lê STJ e TJSC pelo Google (`noticiasOutrasAreas`) e dá prioridade às áreas com menos textos recentes
  (`areasDaVez`; no máx. 1 trabalhista quando houver outras); intercala as áreas. Imagem 1080×1080 + legenda para o Instagram
  (`instagram.mjs` com @resvg/resvg-js instalado no workflow → blog/<slug>/instagram.png e instagram.txt). A tarefa semanal
  "Postar no Google e no Instagram" traz os links da imagem e da legenda.
- Google Ads automático: Marketing › "Ligar o Google Ads" mostra um script (com a URL do painel e a chave Config MARKETING_ADS_CHAVE,
  rota `marketing.adsConfig`) para colar em Google Ads › Ferramentas › Ações em massa › Scripts (diário). Ele manda custo, cliques,
  impressões e conversões por campanha/mês para a rota pública `marketing.ads` (confere a chave; obs "auto"); a área vem do nome da
  campanha (`areaMkt_`). Lançamento à mão de Google Ads do mesmo mês/área é ignorado quando o automático já trouxe.
- Edifício Future: lembrete do aluguel no WhatsApp — em Cobranças, do dia 5 ao 9 "Lembrete do dia 5" e do dia 10 em diante "Vence dia 10"
  para quem não pagou (colunas `lembrete5_em`/`lembrete10_em`, rota `future.cobranca.lembrete`).

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
- Grupos de clientes (8.5.0, pedido da usuária: "com ação/em atendimento está confuso"): só "Todos" e "✍ Aguardando assinatura"
  (`grupo=assinatura`). Cadastro novo NÃO cria pasta: só liga à pasta que já existe no Drive com o mesmo nome
  (`criarPastaCliente_` com `soVincular`); a pasta nova nasce ao gerar o primeiro documento (`gerarDocumentos_`). RG não é
  obrigatório no cadastro. Na ficha sem processo, "Cliente contratou: abrir ação" (rota `clientes.abrirAcao`) cria o processo na
  fase "Petição inicial (a ajuizar)" (chave `contratado`).
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
- Início por perfil (7.3.0, `telaInicio`): SECRETARIA (perfis secretario e rh) — números Audiências (7 dias), Para avisar,
  Cobranças, Aniversários; blocos "Audiências e perícias · 7 dias" (botão "Avisar" no WhatsApp com a mensagem do `whatsAto`;
  marca `avisado_em/avisado_por` na aba Eventos, rota `agenda.avisado`), "Cobranças do dia" (parcelas que vencem hoje e atrasadas
  até 90 dias, "Lembrar"/"Cobrar" no WhatsApp; valor só para quem vê financeiro), "Aniversariantes de hoje" ("Parabéns") e
  Minhas tarefas. EQUIPE (advogada, estagiário) — simples: Minhas tarefas, Atrasadas, Prazos, Processos + Minhas tarefas e
  Agenda. ADMINISTRAÇÃO — o essencial: Prazos, Seu OK, Hoje, Processos + Prazos e Audiências (com Avisar) + Cobranças e
  Aniversários só quando houver. Dados extras na rota `inicio.extras`. Gráficos do Início saíram (estão em Relatórios).
- Quadros largos (Processos por etapa e Tarefas) têm setas ‹ › para andar para o lado (`comSetas`).
- Início (simples, pedido da usuária): faixa escura enxuta (data, saudação em Bodoni, frase do dia, alerta de vencidos, botões
  "+ Novo cliente" e "Novo prazo"); 4 números (Prazos, Hoje, Tarefas, Processos); duas colunas: Prazos (vencidos primeiro, até 6)
  e Agenda (hoje e próximos 14 dias numa lista só, até 6); um cartão com 2 gráficos redondos (prazos em aberto e processos ativos
  por área, 5 áreas + "Outras"); pílula de status do robô. Carteira por fase e tribunal ficam em Processos e Relatórios.
- Gráficos redondos (`grafRosca` em painel.js, SVG próprio; legenda clicável que filtra): Início (prazos em aberto e processos
  por área), Processos (faixa acima da tabela: área, fase, tribunal), Financeiro (situação do mês e
  atrasos por tempo; escondido para o RH) e Relatórios (ativos e arquivados por área). Cores das fases em `CORES_FASE`.
- Processos: filtro de Área em cima, junto com Situação, Tribunal e Cliente (Situação abre em "Em andamento" desde 8.11.2; os outros em "Todos"); sem os botões de área.
- Tabelas de Processos e Intimações compactas: na coluna "Próximo ato" só o ato com a data completa ("Audiência 26/10/2026");
  o resumo da última movimentação aparece só ao abrir o processo.

## WhatsApp e Financeiro

- WhatsApp sempre na MESMA aba (8.3.1, pedido da usuária): um ouvinte de clique (fase de captura) em painel.js ajusta todo link wa.me
  do painel na hora: no computador vira web.whatsapp.com/send numa aba com nome fixo `whatsapp_painel` (sem noopener, senão o
  navegador não reaproveita a aba); "WhatsApp: no aplicativo" no menu do nome (localStorage `whats_modo` = app) usa whatsapp://send;
  no celular fica wa.me. `telefoneWhats` conserta o número (0 na frente, sem 55, dois telefones juntos → o primeiro) e avisa se
  estiver incompleto. Links novos de WhatsApp: basta usar https://wa.me/… normal. Aba aberta à mão fora do painel não pode ser
  reaproveitada (regra do navegador).
- Nada fica "Carregando…" para sempre (8.3.1): `comLimite` põe tempo limite nas chamadas ao Google (leituras 90 s, gravações 340 s,
  lote 60 s); erro na tela tem "Tentar de novo". O Início pede tudo junto e os blocos extras (agenda, eu.painel, inicio.extras,
  aguardando) têm 25 s: se demorar, abre sem eles. O Início não busca mais `processos.listar` (não aparecia na tela).

- "Fotos e conversas do WhatsApp" foi retirado da ficha e do robô a pedido da usuária (o código `processarWhatsapp_` ficou
  sem uso; não religar sem ela pedir).
- Perfil RH (`PERFIS.rh`, `ocultarValores`; 8.4.6, pedido da usuária): USA TUDO, inclusive o Financeiro (lança honorário, dá baixa,
  confere PIX, despesas, contratos); não vê Relatórios nem Usuários (permissão `usuarios`) e não vê os TOTAIS a receber: `valoresDoPerfil_`
  apaga só `fin.areceber` inteiro e `totais`/`faixas` do `fin.resumo` (cada parcela continua com valor). Não há mais rota recusada ao RH.
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
  Cruzamentos 7.5.0: nome abreviado pelo banco (primeiro + último nome iguais) e nome parecido valem quando valor e data da parcela
  batem (±20 dias); sem cliente pelo nome, `parcelaPeloValorEData_` acha a ÚNICA parcela aberta de mesmo valor vencendo entre −10 e
  +5 dias do PIX: com sobrenome em comum (`sobrenomeComum_`, familiar pagando) dá baixa sozinho; sem, vira SUGESTÃO (coluna
  `sugestao`) com botão "✓ Confirmar" no quadro.
- Financeiro 7.5.0 (`telaFinanceiro`): sem gráficos — faixa escura, 4 números (Recebido no mês, A receber 30 dias, Em atraso, PIX
  para conferir), pílulas de atraso por faixa e abas Em atraso / Próximos 30 dias / PIX recebidos / Honorários (`ver=`).
- Parcelas a vencer têm "Lembrar no WhatsApp" e as atrasadas "Cobrar no WhatsApp", com a mensagem pronta (wa.me).

## Velocidade

- Velocidade 7.2.0: (1) LOTE — as leituras pedidas juntas (mesma tela, busca antecipada) vão numa ida só ao Google: o painel
  junta por 25 ms (`chamar` → `enviarLote`, máx. 12; só as rotas de `EM_LOTE`) e o servidor responde tudo em `rotearLote_`
  (aceita só rotas de LEITURAS_RAPIDAS; gravações nunca vão em lote; Code.gs antigo → volta a pedir um por um). (2) Sessão sem
  abrir a planilha: `usuarioDaSessao_` guarda os dados do usuário (sem hash/salt) na memória do servidor com a versão dos dados
  na chave — qualquer gravação (desativar, trocar senha/perfil) invalida na hora. (3) Leitura NUNCA pode ficar fora de
  `LEITURAS` em painel.js: senão é tratada como gravação e apaga a memória do painel (era o caso de `trabalho.aguardando`).
  Rota de leitura nova = pôr em `LEITURAS` (e em `EM_LOTE` + LEITURAS_RAPIDAS do Code.gs se for só leitura).

- Robô da velocidade (7.1.0): `aquecerMemoria_` (gatilho `aquecerGatilho` de 10 em 10 min e logo depois do robô de hora em hora)
  deixa prontas na memória do servidor as listas grandes (clientes, processos, prazos, intimações abertas, relatório, honorários)
  para cada perfil. Essas listas são guardadas por PERFIL (`MEMORIA_POR_PERFIL`), não por pessoa, e a chave ignora campos vazios
  (`busca: ''`, `false`). O painel, 2,5 s depois de abrir, já busca em segundo plano Clientes, Prazos, Tarefas e Início.

- Servidor guarda por até 10 min as listas grandes (clientes, processos, prazos, intimações, honorários) em `comMemoria_`;
  toda gravação na planilha chama `marcarMudanca_` e a memória é descartada na hora. Toda escrita nova deve passar
  pelos helpers (`inserirLinha_`, `atualizarLinha_`, `gravarLote_`, `regravarMudadas_`), que já marcam a mudança.

- Instantâneo (7.6.0): depois de gravar, a memória NÃO é apagada — fica "velha" (`m.velho`), a tela abre na hora com o que já
  tinha e se redesenha quando o Google responde (faixa dourada `body.atualizando` enquanto confere; contador `conferindo`). Se
  outra gravação acontecer no meio, `conferir` confere de novo. Item recém-criado que não está na lista: `apiFresco`.
  `processos.andamentos` sem `atualizar` é leitura (não apaga a memória). Botão Conferido/OK some na hora (`sumirNaHora`).
  index.html faz preconnect a script.google.com e o painel "acorda" o servidor ao abrir.
- No navegador, a memória das telas também fica na aba (sessionStorage `painel_memoria`) para o F5 abrir na hora;
  é apagada ao sair, ao cair a sessão e ao fechar o navegador.
- Contratos: CONTRATADA qualificada com o(a) advogado(a) só pela OAB (sem repetir endereço); assinaturas com nome em
  negrito e o papel embaixo ("NOME|CONTRATANTE" no texto do modelo).
- 8.8.1 (pedido da usuária): contratos de honorários (contrato, prestação, assessoria, previdenciário) e procurações são assinados SÓ pelo
  cliente — sem a assinatura do escritório/CONTRATADA e sem testemunhas ("{{c:o|a}} CONTRATANTE assina o presente instrumento"); título
  executivo pelo art. 24 do EAOAB + art. 784, XII, do CPC (o inciso III exigiria testemunhas). Chaves MODELO9_*/MODELO10_CONTRATO_PREV_ID.

## Site público

- Visual 2026 (pedido da usuária: "site parecia morto"): fotos COLORIDAS (sem grayscale), acento dourado (`--gold`, `--gold-d`,
  `--gold-l`, botão `.btn.gold`), abertura `.hero2` com a foto da Dra. Júlian em frente aos diplomas (`assets/julian-diplomas.webp`)
  e selos, cartões "Como podemos ajudar" com ícones, seção "Quem cuida do seu caso" (`.quem`, `julian-atual` + `julian-retrato`,
  credenciais) e "Equipe" (Júlian e Luís), blog logo depois, chamada final com retrato. Imagem com width/height no HTML precisa de
  `height:auto` no CSS. Fotos dos ensaios ficam no Drive; a ferramenta do Drive só baixa arquivos de até ~4 MB. Não usar fotos com
  terceiros/crianças (ex.: "FOTO EQUIPE" no restaurante) nem das pastas de clientes.
- Início 2026.2 (pedido da usuária: "blog, calculadora e acompanhe estão escondidos"): logo abaixo da abertura, faixa "Resolva pelo site"
  (`.online`: Acompanhe seu processo em destaque, Ainda dá tempo?, Quanto devo receber na rescisão?, Blog); botão "Acompanhar meu processo"
  na abertura; calculadora rápida "Saiu da empresa? Veja se ainda dá tempo" na própria página (assets/tempo-rapido.js, tudo no aparelho);
  vitrine do Acompanhe com celular desenhado em CSS (`.acomp-sec`, "Pedir o meu código" no WhatsApp). "Meu processo" no menu de TODAS as
  páginas (`.nav-proc`) e na barra do celular (WhatsApp | Meu processo | Ligar). Fotos do ensaio no Drive têm 8–12 MB (a ferramenta do Drive
  não baixa): para novas fotos no site, pedir versões menores. Pastas com fotos pessoais ou de clientes nunca entram.
- Revisão nov/2026 (2 revisões juntas, pedido da usuária): abertura mais curta (título menor; "Escritório de advocacia em Tubarão/SC, com atuação
  principal em Direito do Trabalho…"; "Falar no WhatsApp" + link "Já é cliente? Acompanhe seu processo"); "Entrar" (painel) saiu do menu e foi
  para o rodapé ("Área da equipe"); lista das 6 áreas saiu da home (fica em /atuacao/, link embaixo dos cartões); Estrutura (fotos do
  escritório) logo depois de "Quem cuida"; balão "Prefere que a gente ligue?" some no celular e no computador só aparece depois de rolar
  (em /contato/ há o botão `data-abrir-ligue`); logo nítido `logo-araujo-3x.png` (116×80). Calculadora rápida pergunta o AVISO PRÉVIO e a
  admissão (mesma regra da completa) e nunca diz "terminou" sem "pode ter terminado… não desista sem conversar". Rescisão: FGTS distingue
  saque-rescisão e saque-aniversário. Privacidade reescrita (retorno por telefone, Acompanhe, calculadoras); `limparContatosAntigos_`
  (robôs do escritório, 1×/dia) apaga nome/telefone/assunto dos pedidos de retorno com mais de 12 meses. Confirmado pela usuária: a sala NÃO
  fica no 2º andar e a Dra. Júlian NÃO vai fazer pós-doutorado (não colocar no site).
- Equipe nov/2026 (palavra do Luís): o escritório é SÓ a Dra. Júlian e o Luís Fernando. O site não fala mais em secretaria, "equipe de
  apoio" nem "advogados parceiros"; textos na 1ª pessoa ("Nós agendamos", "Respondemos"). Bloco "Quem atende você" (Dois irmãos…).
  Estrutura abre com `sala-atendimento-2026.webp` (foto do WhatsApp da sala nova, com o retrato dos dois na parede). Todas as fotos e
  vídeos do fotógrafo + as do WhatsApp ficam no Drive em "FOTOS E VÍDEOS DO ESCRITÓRIO (ensaio do fotógrafo + WhatsApp)"
  (13TgmS_qSygSifMS2xvpVCudCi6mPqKra). "Fotos da equipe" (DSC093xx–095xx, inauguração) tem ex-colaboradores e convidados: não usar no site.
- Postagem no Google (`postagemGoogle_`, robôs do escritório, só às segundas): lê /blog/feed.xml e cria para a secretaria a tarefa
  "Postar no perfil do Google" com texto e link prontos (`[google:link]`; Config GOOGLE_POST_LINKS guarda os já mandados).
  8.9.0 (acesso à API pedido pela usuária em 11/2026): Marketing › "📣 Blog no perfil do Google" (rota `marketing.gbp`: status/conectar/
  ligar/desligar/postar; `gbpConectar_` acha conta+local → Config GBP_LOCAL; `gbpPostar_` = v4 localPosts com a imagem instagram.png e
  botão LEARN_MORE; `gbpErro_` traduz cota 0 / escopo / API desativada para o passo que falta). Com Config GBP_AUTO = sim, o robô de segunda
  posta sozinho e a secretaria recebe só "Postar no Instagram"; se falhar, volta a tarefa antiga com o aviso. Precisa: projeto do Cloud aprovado
  ligado ao Apps Script, 3 APIs ativas e o escopo business.manage no appsscript.json (já no repositório).
  8.9.1 (pedido da usuária: "queria fazer automaticamente" sem esperar): ZAPIER grátis (RSS by Zapier → Google Business Profile › Create
  Post) lê /blog/feed.xml; o feed tem `<enclosure>` com a imagem instagram.png de cada texto (gerar.mjs; robo.mjs roda o gerar de novo
  depois das imagens). No painel, "✓ Já liguei o Zapier" grava Config GBP_ZAPIER = sim e o robô de segunda cria só a tarefa do Instagram.

- /acompanhe/ ("Acompanhe seu processo"): o cliente entra com CPF + código de 8 caracteres gerado na ficha
  ("Acesso do cliente ao site"). O código aparece uma vez só e é guardado embaralhado (`acesso_hash`, nunca vai ao painel).
  Rota pública `consulta.processos` devolve só número, área, vara, situação, próximo ato e data/resumo da última
  movimentação. 5 erros por CPF bloqueiam 15 min; 100 erros no total travam a consulta 15 min. Nada fica no navegador.
- Acompanhe v3: etapas em linha do tempo (Preparação → Ajuizado → Em andamento → Decisão → Recurso → Recebimento → Concluído),
  explicação em linguagem simples, últimas movimentações (DataJud) e link de dúvida pelo WhatsApp.
- Conversão: WhatsApp é o botão principal da primeira tela; "Prefere que a gente ligue?" (site.js) em todas as páginas →
  rota pública `site.contato` (campo-isca anti-spam, 40/h no total, 1 por telefone a cada 6 h) grava na aba Contatos, cria
  tarefa "Ligar para…" (Config RESP_SITE) e manda e-mail (Config CONTATO_EMAIL ou a conta dona).
- Blog (7.7.0): /blog/ com páginas estáticas montadas por `.github/robo-blog/gerar.mjs` a partir de `.github/robo-blog/posts.json`
  (cabeçalho/rodapé copiados de contato/index.html; bloco "Do blog" no Início e nas páginas de área entre `<!--BLOG:INICIO-->` e
  `<!--BLOG:FIM-->`; sitemap entre as mesmas marcas; RSS em /blog/feed.xml). Para tirar um texto: `"oculto": true` no posts.json e
  rodar o gerar. ROBÔ (`robo.mjs`, GitHub Actions `blog-semanal.yml`, segunda 7h17 de Brasília, também "Run workflow" à mão):
  fonte principal = TST lido PELO GOOGLE (ferramenta `url_context` do Gemini: lista em tst.jus.br/noticias, notícia em
  tst.jus.br/-/<título sem acento>), mais STF/STJ/TRT-SC/CNJ lidos direto quando o site aceita o GitHub; a Busca do Google
  (`google_search`) é só o último recurso (a chave do escritório NÃO tem cota para ela: 429). O Gemini escolhe as decisões
  (nada institucional), a notícia é conferida pelo título, o texto é escrito SÓ com o que está na notícia oficial (sem nome de pessoa nem de empresa, sem promessa/preço — Provimento 205),
  passa por conferência (tamanho, palavras proibidas) e cita a fonte. Chave no segredo GEMINI_API_KEY do repositório. O robô faz
  commit direto no main: antes de dar push no main, SEMPRE `git fetch origin main` e rebase (senão o push é recusado).
- Blog mais exposto (8.2): faixa "Novo no blog" logo abaixo da abertura do Início (marcas `<!--BLOGFAIXA:INICIO-->`), texto mais
  recente em destaque na /blog/ (`post-destaque`), botões de compartilhar (WhatsApp, Facebook, LinkedIn, copiar link) em cada texto.
- Perfil do Google: textos prontos em docs/GOOGLE-PERFIL.md (sem acesso direto ao Google Meu Negócio daqui).
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
- Cópia SEMANAL (7.6.0, pedido da usuária): toda sexta-feira ~18h (`backupSemanalGatilho` → `backupSemanal`) a planilha inteira
  + um .xlsx vão para "CÓPIAS SEMANAIS — SEXTA-FEIRA (guarda 1 ano)" dentro da pasta de backups, por 52 semanas. A primeira sai
  no `configurar`; se atrasar mais de 7,5 dias, a cópia diária das 3h faz a da semana. Status no quadro "Segurança dos dados".
- Abas da planilha protegidas com aviso contra edição manual. Pedidos acima de 200 mil caracteres são recusados.
- Nunca colocar senha, CPF ou dado de cliente no repositório (é público).

## 8.12.0 (nov/2026: conferência geral + gestão, pedidos da usuária)

- Menu novo (`ABAS`): Escritório · Relacionamento (CRM / Funil, Marketing) · Documentos (Documentos e propostas = antiga Modelos, Calculadoras,
  Padrões operacionais) · Inteligência (Transcrição e resumos, Peças com IA, Biblioteca de prompts) · Gestão (Painel financeiro, Recibos,
  Relatórios, Gerenciar acessos = antiga Usuários). Telas novas em painel/gestao.js (`window.GESTAO`, carrega ANTES do painel.js, usa
  `PAINEL_KIT`). CSP do painel: nunca `style="…"` no HTML (é bloqueado); cor por `el.style.setProperty` (CSSOM).
- CRM (aba Leads; rotas `crm.*`): etapas novo → contato → consulta → atendido → proposta → negociação → ganho/perdido (motivo obrigatório).
  Pedido de retorno do site vira lead sozinho (`crmSincronizar_`, também nos robôs do escritório); lead ligado a cliente com Assinatura
  "assinado" vira ganho, "desistiu" vira perdido. "Virou cliente" (`crm.converter`) cria cadastro mínimo (origem "funil (CRM)") ou liga ao
  existente. Métricas: conversão 180 dias, tempo de 1ª resposta (mediana), por canal, motivos de perda, funil acumulado.
- Proposta de honorários (`crm.proposta`, `gerarProposta_`): Doc + PDF no padrão do escritório (pasta do cliente ou "PAINEL — PROPOSTAS DE
  HONORÁRIOS"), inclui/não inclui por área, honorários fixo/êxito/misto/mensal, "como trabalhamos", obrigação de meio, validade. Botão no
  funil e em Documentos e propostas. `docMarkdown_` = Markdown → Google Docs com o padrão visual (títulos, listas, tabelas).
- Calculadoras do painel: rescisão (mesma regra do site + médias), prescrição trabalhista, prazo processual (`calc.prazo` = mesmo cálculo
  do robô), correção e juros (`calc.indices`: BCB SGS IPCA 433, INPC 188, IPCA-E 10764, Selic 4390, IGP-M 189; taxa legal = Selic − IPCA),
  honorários/parcelas e entre datas. Tudo "estimativa: conferir".
- Transcrição (aba Transcricoes): gravar no navegador (Web Speech ao vivo + MediaRecorder 24 kbps), enviar áudio (até 45 MB, pedaços de 3 MB
  → `ia.audioParte`, pedido de até 4,4 MB só nessa rota; pasta temporária apagada em 2 dias) ou colar texto. Gemini Files API (upload
  resumable) transcreve com "[mm:ss] Papel:"; `ia.transcricaoResumo` faz resumo para o cliente + análise da equipe + Doc. Consentimento
  obrigatório para gravar. "Publicar no Acompanhe" (`ia.transcricaoPublicar`) mostra o resumo ao cliente em /acompanhe/ (`resumos`/`comunicados`).
- Peças com IA (`ia.peca`/`ia.pecaDoc`, `PECAS_IA`): dossiê da audiência de instrução, mapa da prova, roteiro de perguntas, análise
  completa, preparação do cliente, análise para recurso, revisão de petição, livre. Junta histórico, intimações, resumo do caso e
  transcrições do processo, tudo anonimizado. `IA_SISTEMA_JURIDICO`: nunca inventar, "[NÃO CONSTA — conferir]", sem julgados, sem datas fatais.
  Princípio da usuária em todas as telas de IA: "a IA está aqui para nos auxiliar, nunca para nos substituir".
- Biblioteca de prompts: prontos em gestao.js (`PROMPTS`) + os do escritório (aba Prompts). Padrões operacionais (aba Padroes, semeada com
  `PADROES_INICIAIS`: guia do cliente e POPs da equipe; edita só administração/advogada; "Gerar o guia em PDF" `padroes.guia`).
- Painel financeiro (`fin.painel`, escondido do RH): KPIs, 12 meses entradas × saídas, previsão 3 meses, recebido por área, maiores atrasos.
  Recibos (`fin.recibos`, `fin.recibo.gerar`; coluna nova `recibo_url` em Parcelas, gravada ao pagar).
- Conferência (segurança/velocidade/dados): senha nova com 8+ caracteres, letras e números, sem o usuário; robô solta a trava antes do
  Future e do PIX; painel repete sozinho a gravação quando o robô está gravando ("sistema ocupado"); tempo de robô do dia
  (`contarTempoRobo_`, limite de 90 min do Google; alerta em 70) e alerta de robô parado há 3 h no vigia; aquecedor só no horário do
  escritório; Log com mais de 4.000 linhas passa o que tem mais de 180 dias para LogArquivo (`arquivarLog_`).
- Site: aviso de cookies compacto (não cobre a abertura), rodapé com alvos de toque de 40 px e mais contraste, abertura mais objetiva.
- 8.12.1 (pedido da usuária: "todo cliente novo aparece no CRM"): `crmSincronizar_` também põe no funil todo cliente cadastrado PELO PAINEL
  a partir de Config CRM_CLIENTES_DESDE (criada com 60 dias para trás na 1ª vez); importados (GEA, histórico, revisão, organizar, robô,
  "importado — conferir") ficam de fora. Mesmo telefone de um cartão sem cliente (ex.: pedido do site) → só liga ao cadastro e passa para
  "Atendido"; senão cria o cartão em Atendido (Proposta enviada se há assinatura aguardando; Contrato fechado/Não fechou conforme a
  Assinatura). Roda na hora ao salvar cliente novo (`salvarCliente_`), ao abrir o CRM e nos robôs. Assinatura "aguardando" leva o cartão
  para "Proposta enviada". Ficha do cliente: selo "📈 Funil: etapa · veio por canal" (`seloFunil`, `lead` em clientes.obter); cartão do
  funil com "✓ cliente" quando já tem cadastro.
- 8.12.2 (pedido da usuária: "gerencie o que as pessoas podem ver"): CRM / Funil e Marketing SÓ administração (menu, rotas `crm.*` com
  permissão `usuarios`; `crm.proposta` continua aberta para Documentos e propostas; selo do funil na ficha só para a administração).
  Todos: Início, Clientes e processos, Intimações, Tarefas (cada um vê só as suas; a administração vê todas), Agenda, Documentos e propostas,
  Calculadoras, Transcrição e resumos. Padrões operacionais SAÍRAM do menu: link discreto no fim de todo Início ("📘 Chegou agora no
  escritório?…", `extrasDoInicio`). SAÍRAM "Peças com IA" e "Biblioteca de prompts" (rotas e telas; #/pecas e #/prompts levam à Transcrição).
  Recibos virou a aba "🧾 Recibos" do Painel financeiro (#/recibos → #/financeiro?ver=recibos); painel financeiro SEM gráficos: só Entradas,
  Saídas, Resultado do mês e Inadimplência (`blocoPainelFinanceiro`). Menu da esquerda RECOLHE (só ícones, 68 px) ao clicar numa aba
  (`menu-recolhido`; passar o mouse abre por cima; botão ☰ no topo do menu alterna; só no computador). Início da administração: faixa
  "📈 Funil: N contatos para responder hoje". CRM: "📅 Agendar consulta" (`crm.consulta` → agenda ATENDIMENTOS do Google + etapa Consulta
  agendada + "confirmar na véspera") e "💬 Mensagem pronta" com 7 modelos (`mensagensLead`). Transcrição: "Resumos feitos" abrem no painel
  (`ia.transcricao`), "Pedir os documentos no WhatsApp", "＋ Tarefa com os próximos passos" (`ia.transcricaoTarefa`, checklist),
  "Tirar do Acompanhe", gravação com Pausar/Continuar e rascunho salvo no computador a cada 10 s (localStorage `transcricao_rascunho`).
- 8.12.3 (pedidos da usuária): WhatsApp AUTOMÁTICO (localStorage `whats_modo` = auto|app|web, padrão auto; `whats_aprendido`): no 1º envio
  o painel tenta o aplicativo (`whatsapp://send`) e, se o Chrome perde o foco (o app abriu), aprende "app"; senão pergunta UMA vez ("O WhatsApp
  abriu no aplicativo?") e passa a usar o WhatsApp Web na aba `whatsapp_painel` (`descobrirWhats`). Menu do nome: um só item "WhatsApp:
  automático (…)" que abre a escolha (automático/aplicativo/Web); "Abrir o WhatsApp Web do painel" ficou escondido. Ditado nas observações:
  `ditado(textarea, clienteId)` em painel.js (Web Speech pt-BR, texto aparece na caixa; nenhum áudio é guardado) na ficha do cliente e no
  "Anotar conversa" do CRM; "✨ Arrumar o texto" (`ia.organizarNota`: Gemini só pontua e organiza, sem acrescentar; nome do cliente volta
  no lugar de [PARTE]).

## 8.13.0 Chatbot do WhatsApp (pedido da usuária)

- API oficial do Meta (WhatsApp Cloud). Caminho: Meta → ponte Cloudflare (`chatbot/worker.js`: verificação GET, assinatura X-Hub-Signature-256
  com APP_SECRET, responde 200 na hora e repassa em segundo plano só mensagens/ecos/falhas) → rota PÚBLICA `whats.webhook` (confere a chave
  da ponte WHATS_PONTE_CHAVE nas Propriedades) → `whatsReceber_`. Token do Meta só nas Propriedades (WHATS_TOKEN); Config WHATS_PHONE_ID,
  WHATS_BOT (sim/nao), WHATS_RESP, WHATS_API_VERSAO (v21.0). Guia completo em docs/CHATBOT-WHATSAPP.md.
- Abas Conversas (estado robo|humano, pausado_ate, dados JSON com cidade/área/resumo/preferência/aguarda_cpf) e Mensagens (dedupe por wa_id).
  SEMPRE gravar a conversa com `atualizarConversa_` (relê a linha; o objeto antigo apagava a pausa e o aguarda_cpf).
- `whatsCerebro_`: urgência (`URGENTE_WHATS`) ou pedido de pessoa (`PEDE_HUMANO`) → pausa o robô, tarefa (🚨 urgente + e-mail) e resposta fixa;
  processo (`PEDE_PROCESSO`) → pede CPF + código e consulta com `consultaCliente_` (mesmas travas do Acompanhe); resto → Gemini com
  `WHATS_SISTEMA` + `baseConhecimentoWhats_` (guia do cliente dos Padrões + dados fixos), JSON; trava de segurança troca resposta com R$/%/
  "você tem direito"/prazo. Áudio → `whatsTranscreverAudio_` (Gemini). Coexistência: `message_echoes` (resposta pelo celular) pausa 3 h.
  Freio de 25 respostas/hora por número. `crmDoWhats_` cria/atualiza o cartão no CRM (canal WhatsApp) e "📅 Marcar a consulta pedida".
- Painel: Relacionamento › "Conversas do WhatsApp" (#/conversas, só administração; `whats.conversas`/`whats.acao`/`whats.config`): lista +
  conversa estilo WhatsApp, responder (só dentro das 24 h), Assumir/Devolver ao robô, ditado, "🧪 Testar o robô" (simulação sem enviar),
  "⚙ Ligar / configurar" com os passos e as chaves para copiar. Início da administração: faixa "💬 WhatsApp: N conversas esperando a equipe".
- 8.13.1 (pedidos da usuária): "Gerenciar acessos" saiu dos tópicos do menu e fica no menu do NOME (clicar no usuário, embaixo; só
  administração). Menu da esquerda NÃO abre/fecha sozinho: só o botão ☰ do topo (escolha guardada em localStorage `menu_recolhido`; sem
  abrir ao passar o mouse). Marca do menu: "Araújo Advocacia" (não "Painel jurídico"). Transcrição com cliente escolhido vai para as
  OBSERVAÇÕES do cliente (`anotarCliente_`): "AUDIÊNCIA — título (data)" ou "ATENDIMENTO — …", depois Resumo, "Transcrição:" e as falas,
  separadas por " ⏎ " (a ficha mostra a 1ª linha e "ver o resumo e a transcrição", `corpoNota`; corta em 38 mil caracteres + link do Doc).

## 8.14.0 Assistente do WhatsApp Web + funil automático + cadastro online (pedido da usuária)

- Etapas do funil (`ETAPAS_CRM`/`ORDEM_CRM`, `etapaAFrente_` só anda para a frente): Novo contato → Em conversa → Cadastro enviado → Cadastro
  preenchido → Em atendimento → Procuração e contrato enviados → Contrato assinado (ganho) / Não fechou. Antigas consulta→contato e
  negociacao→proposta (migração uma vez, Config CRM_ETAPAS_814). Cliente novo do painel entra em "Cadastro preenchido"; proposta de honorários
  leva a "Em atendimento"; Assinatura aguardando → "Procuração e contrato enviados"; assinado → ganho.
- Cadastro online (/cadastro/?c=…, noindex, assets/cadastro.js): `crm.linkCadastro` (CRM, ficha "📝 Pedir o cadastro ao cliente" quando falta
  algo, cartão 📝) gera link de 15 dias, uso único, guardado só o hash (Leads.cadastro_token/cadastro_ate/cadastro_em). `site.cadastroInfo` e
  `site.cadastro` são públicas (trava por código e geral, campo-isca, CPF validado, ViaCEP no navegador); cria/atualiza o cliente, cartão →
  "Cadastro preenchido" e tarefa "📝 Cadastro preenchido — …". Nada do cliente fica no navegador.
- Extensão do Chrome (pasta extensao-whatsapp/, baixada em painel/extensao-whatsapp.zip — refazer o zip ao mudar a pasta; pasta interna
  "assistente-whatsapp-araujo"): painel à direita do WhatsApp Web (Shadow DOM; `html.araujo-aberto` encolhe o WhatsApp), etiqueta da etapa na
  lista de conversas, ficha do contato (etapa com botões, processos, parcelas, anotações, histórico), "Mandar o link do cadastro", "Sugerir uma
  resposta" (Gemini, anonimizado), anotar. Sozinho: contato novo falando de caso entra no funil (IA `ext.analisar`, 1×/dia por conversa;
  desliga no popup), mensagem enviada com o link /cadastro/ → "Cadastro enviado", PDF de procuração/contrato enviado → "Procuração e contrato
  enviados" (`ext.evento`). NUNCA envia mensagem: só põe o texto na caixa. Nome do lead = nome da conversa (o da IA só quando o título é número).
- Pareamento: Gerenciar acessos › "Assistente do WhatsApp Web" › Gerar código (`ext.parear`, 6 letras, 10 min, uso único) → digitado na
  extensão (`ext.ativar`, público) → chave `ext_`+64 hex guardada só como hash em Properties EXT_DISPOSITIVOS; abre SÓ rotas `ext.*`
  (`rotear_`); "Desligar" (`ext.dispositivos` revogar). Extensão nova = mudar `version` no manifest.json e refazer o zip.

## 8.15.0 Etapa de TODOS os clientes + robô que escreve no WhatsApp Web (pedido da usuária)

- `jornadasClientes_` (calculado na hora, muda sozinho): processo com número ativo → "Em atendimento · processo em andamento"; petição inicial
  a fazer ou assinatura "assinado"/lead ganho → "Em atendimento · petição inicial" (ASSINOU = EM ATENDIMENTO); assinatura aguardando →
  "Procuração e contrato enviados"; senão a etapa aberta do funil; só processos encerrados → "Caso encerrado"; desistiu/perdido → "Não fechou";
  resto → "Sem caso aberto". Vai em clientes.listar (`jornada`), clientes.obter (`jornada`/`jornada_nome`), ext.contato e nas etiquetas da
  extensão (`j_<etapa>`). Clientes: linha "Etapa:" com contagem e filtro (`?etapa=`), selo no cartão e no topo da ficha (`seloJornada`).
  No funil, "atendido" passou a se chamar "Consulta feita" (o "Em atendimento" é depois de assinar).
- Extensão 1.1.0: "Escrever as respostas sozinho" (popup, padrão ligado, storage `escrever`): última mensagem da conversa aberta é do cliente
  e a caixa está vazia → `ext.analisar` (com `objetivo` pela etapa e `contexto` do painel, anonimizado) e a resposta vai para a caixa; a
  pessoa confere e aperta Enviar. Nunca envia sozinho e nunca mexe na caixa se alguém está escrevendo; rascunho do robô é trocado (não somado)
  por outro texto pronto. Envio 100% automático só pela API oficial (8.13, docs/CHATBOT-WHATSAPP.md): automatizar o envio no WhatsApp Web
  arrisca o bloqueio do número.

## 8.16.0 Robô do WhatsApp faz o primeiro atendimento inteiro (pedido da usuária)

- `whatsCerebro_(conv, texto, tipo, novo, sim)`: fases em Conversas.dados.fase triagem → oferta (dados.slots) → agendado (dados.agendado
  {dia,hora,modo,evento}). Saudação sozinha (`SAUDACAO_WHATS`) responde sem IA; escolha de horário sem IA (`escolhaDoSlot_`: só o número,
  "opção 2", "a primeira", "14h30"; "daqui 3 dias" NÃO é escolha); `REMARCAR_WHATS`/`CANCELAR_WHATS` desmarcam (`whatsDesmarcar_`);
  `FINANCEIRO_WHATS` → equipe. IA (`WHATS_SISTEMA` novo, JSON com caso_entendido, quer_atendimento, escolha, dia_preferido, periodo,
  outro_horario, modo, conflito, nao_quer_agora) recebe HOJE (`hojeExtenso_`) e os HORÁRIOS OFERECIDOS. Explica só em termos gerais; nunca
  parecer, direito, valores ou prazos (trava de segurança troca a frase). Diz que é assistente virtual (não finge ser a advogada).
- `horariosLivres_({qtd, desde, dia, periodo})`: dias úteis sem feriado, 8h–12h e 13h30–18h, passo 30 min, duração WHATS_DURACAO, antecedência
  WHATS_ANTECEDENCIA_MIN, sem bater com NENHUMA agenda do escritório nem a principal da conta (`agendasOcupacao_`, ignora dia inteiro).
  `whatsMarcar_` confere de novo (`slotLivre_`), cria o evento em ATENDIMENTOS, atualiza o cartão (consulta_em, próxima ação), gera o link do
  cadastro (não gera de novo se o anterior ainda vale) e cria a tarefa "📅 Atendimento …" (WHATS_RESP). `whatsCutucar_` (robôs do escritório):
  1 lembrete após 3 h parado, só no horário do escritório e na janela de 24 h.
- "🧪 Testar o robô" = conversa completa (`whatsSimular_` guarda 1 h no cache por usuário; `reiniciar`); `sim.acoes` mostra o que faria
  (⚙ agenda, cadastro, CRM, equipe) sem gravar, marcar nem enviar. Guia em docs/CHATBOT-WHATSAPP.md.

## 8.17.0 Regras de valor e qualificação do robô do WhatsApp (decididas pela usuária na sabatina de 09/11/2026)

- Persona: "aqui é do escritório Araújo Advocacia", sem dizer que é robô; pergunta direta (`PERGUNTA_ROBO`) → verdade em uma frase + oferece a
  equipe. Nunca se passa pela Dra. nem por uma pessoa.
- Valor (`consultaGratis_`): trabalhista do empregado (`dados.lado` ≠ empresa) e Previdenciário = sem valor (êxito: 30% / 2 primeiras parcelas);
  resto = Config WHATS_VALOR (300), `textoValor_` (análise completa ~1 h; pago no dia ANTES do atendimento, Pix ou no escritório; descontado dos
  honorários se fechar) dito logo antes dos horários ou quando perguntam (`pergunta_preco`). `recusou_preco` → pergunta formal do motivo (fase
  `motivo`) → CRM perdido "Preço — …". WHATS_DURACAO padrão 60. Pix em Config WHATS_PIX_TXT (só na planilha, nunca no repositório).
- Sem link de cadastro no robô: depois de marcar, `textoQualificacao_` (dados.qualif = pedida) → `lerQualificacao_` (CPF/RG/CEP/e-mail/data por
  regra; nome, estado civil, profissão e endereço pela IA, sem CPF) → `faltasQualificacao_` → `whatsSalvarCliente_` (origem "WhatsApp (robô)",
  cartão → Cadastro preenchido) → `textoDocs_` (`DOCS_AREA`).
- Documentos: `whatsGuardarMidia_` (whatsReceber_, image/document) baixa do Meta para "PAINEL — DOCUMENTOS DO WHATSAPP (aguardando contrato · não
  compartilhar)" (Config PASTA_WHATS_DOCS, subpasta por conversa, dados.pasta_docs) e a IA só rotula; responde 1 vez a cada 3 min; "pronto/enviei"
  → `resumoDocs_` (✓/✗ na tarefa do atendimento). `whatsDocsRobo_` (robôs do escritório): jornada inicial/andamento → move para a pasta do
  cliente › DOCUMENTOS DO WHATSAPP; 90 dias sem fechar → lixeira.
- Checagem (`o.checagem`, fase checagem → checagem_enviada): valor + Pix antes (sem custo no trabalhista do empregado); documento + comprovante →
  `tarefaChecagem_` (vence em 2 dias úteis, `doisDiasUteis_`). O financeiro (`FINANCEIRO_WHATS`) não interrompe a checagem.
- whatsCerebro_ pode devolver VÁRIAS mensagens (array): whatsReceber_ manda em ordem; o teste junta com "⎯⎯⎯" e aceita "[documento: …]".

## 8.18.0 Transcrição grava a outra pessoa da chamada (pedido da usuária: "no Meet e no WhatsApp só saía a minha voz")

- Transcrição › Gravar agora: "De onde vem a conversa" (localStorage `transcricao_fonte`): 🖥 Chamada no computador (padrão) ou 🎙 Presencial.
  Computador = `getDisplayMedia` (Meet: aba + "Compartilhar áudio da guia"; WhatsApp/Zoom: tela inteira + "Compartilhar áudio do sistema"; a imagem é
  descartada na hora, só o som fica) + microfone, em DUAS trilhas (MediaRecorder separados: `mr` = microfone, `mrSis` = computador). Ao parar,
  envia as duas e chama `ia.transcrever` com `id2`: `transcrever_` transcreve cada trilha (microfone = "Advogado(a)", ignora o eco; computador =
  as outras pessoas) e `mesclarTranscricoes_` junta pela hora ([mm:ss] ou [h:mm:ss], `linhasTempo_`), tirando do microfone o eco do alto-falante
  (≥ 60% das palavras iguais a falas do computador em ±25 s). Ao vivo (Web Speech) continua só a voz do microfone.

## 8.19.0 Prazos iguais ao PJe/eproc, aviso ao cliente por IA, acessos e calculadora (pedidos da usuária, 10/11/2026)

- Os e-mails do PJe e do eproc NÃO trazem a data final (só "expedida/confirmada a intimação"): a data final só existe dentro do sistema.
  PJe: o prazo do advogado conta da PUBLICAÇÃO no DJEN → estimativa = próximo dia útil depois da expedição (`publicacaoEstimadaPje_`,
  ciencia_tipo "publicação no DJEN estimada em … — conferir no PJe"); a leitura do DJEN troca pela data exata (`registrarIntimacao_`:
  DJEN substitui estimativa; processo do eproc mantém a ciência do eproc). Antes era tácita de 10 dias depois da expedição (dava data
  mais tarde que o PJe). `recalcularPrazosPje_` (rota `prazos.recalcularPje`, administração; uma vez no robô, Config FIX_PRAZOS_819)
  refez os prazos abertos do robô que usavam a regra antiga.
- "📌 Data do PJe/eproc" na tela do prazo (rota `prazos.vincular`): digita a data final do sistema → prazo "conferido", origem
  "vinculado ao PJe|eproc", fonte anotada ("o painel tinha …"); o robô não recalcula mais.
- Aviso ao cliente só nos atos que importam (`AVISAR_CLIENTE`/`avisoClienteDe_`, `avisar_cliente` em prazos.listar): perícia/laudo,
  contestação/réplica, audiência, sentença/acórdão, acordo. "✨ Avisar o cliente" (rota `ia.textoCliente`): a IA escreve 3–5 frases
  simples (anonimizado, sem prazo interno, sem promessa; [NOME] = primeiro nome); texto editável + WhatsApp. Os outros prazos
  (síntese, ciência, manifestação) ficam SEM botão de WhatsApp ("Não precisa avisar o cliente").
- "✓ Conferido" dentro da tela do prazo fecha a tela (volta para Intimações e prazos).
- Audiências: o tipo vem SÓ do texto junto da palavra "audiência" (`tipoAudiencia_`); antes qualquer "instrução" no texto virava instrução.
  Sem tipo claro → "audiência (tipo a conferir no processo)" na agenda de CONCILIAÇÃO; una → INSTRUÇÃO. "designo" agora conta como
  designação. `conferirAudienciasInstrucao_` (uma vez, Config FIX_AUD_819) criou a tarefa "⚖ Conferir o tipo destas audiências".
- Gerenciar acessos: "🗑 Excluir pessoa" (`usuarios.salvar` com `excluir`: ativo "excluido", sem senha, usuário renomeado, sessões caem;
  não exclui a si mesma nem o último administrador; some da lista; o Log continua). Senha: mínimo 4 caracteres (pode ser só números;
  pedido da usuária — o bloqueio de 15 min depois de 5 erros continua).
- Menu: "Chatbot do WhatsApp" (antes "Conversas do WhatsApp").
- Calculadora de rescisão (painel `contaRescisao` em gestao.js = site assets/calculadoras.js): férias integrais (vencidas) + 1/3;
  INSS 2026 progressivo (Portaria MPS/MF nº 13/2026: 1.621,00 / 2.902,84 / 4.354,27 / 8.475,55 a 7,5/9/12/14%) separado no saldo de
  salário e no 13º (não no aviso indenizado nem nas férias indenizadas); líquido; FGTS em bloco à parte (não entra no líquido): saldo
  da conta, FGTS do mês (8% de saldo + 13º), FGTS do aviso indenizado em linha própria e multa 40%/20% sobre a base para fins
  rescisórios SEM a projeção do aviso (Tema 255 do TST / OJ 42, II, SDI-1). Mudou a regra? Mude os dois arquivos.

## 8.20.0 Botão de aviso vira "✓ Já avisado" (pedido da usuária)

- Todo botão de aviso ao cliente no WhatsApp (Início: "Lembrar hoje"/"Avisar" das audiências e perícias, "Parabéns", "Lembrar"/"Cobrar"
  das parcelas; Tarefas: "WhatsApp ao cliente", "Cobrar assinatura", "Pedir avaliação") usa `botaoAvisar` em painel.js: ao clicar abre o
  WhatsApp, muda NA HORA para "✓ Já avisado" (verde, `.btn.wa.feito`, título com quem e quando) e continua clicável para mandar de novo.
- Fica gravado: audiências em Eventos (`agenda.avisado`, como antes); o resto na aba Avisos (chave, tipo, ref, em, por) pela rota
  `registro.whatsapp` com `chave` (`marcarAviso_`): "niver:cliId:ano", "cob:parcelaId", "tarefa:id". `avisosMapa_` devolve em
  `inicio.extras` (aniversarios/cobrancas: chave, avisado_em, avisado_por) e em `tarefas.listar` (avisado_em/por).

## 8.21.0 Audiências com 3 avisos, cobrança, CRM, site (pedidos da usuária, 13/11/2026)

- AUDIÊNCIAS (regra FIXA da usuária: "NUNCA deixe de avisar"): TRÊS avisos ao cliente em cada audiência/perícia — 1 semana antes (caiu em
  sábado/domingo/feriado → o dia útil ANTERIOR), na VÉSPERA útil (audiência na segunda → aviso na sexta) e NO DIA (`diasDosAvisos_`,
  `avisoDevido_`, `utilAteh_`/`utilAntes_`). `lembrarAudiencias_` (toda rodada) cria a tarefa do aviso devido para a secretaria (marcas
  `[lembrete:chave]`, `[lembrete:chave|vespera]` + `[avisovespera]`, `[lembrete:chave|dia]` + `[avisodia]`) e cancela a tarefa do aviso
  anterior que ninguém fez. Ficha de cada ato na aba Audiencias (chave = a do `atosDaAgenda_`; herda testemunhas/modo da ficha anterior
  do mesmo processo e tipo): modo online/presencial + link, testemunhas (nome, CPF, telefone, obs, confirmou), anotações, "ciente" da equipe
  e aviso_semana/vespera/dia (em/por). Rotas `audiencias.listar` (`audienciasLista_`, também no Início via inicio.extras) e `audiencias.salvar`;
  `agenda.avisado` aceita quando = semana|vespera|dia e grava na ficha. Tela Audiências (#/audiencias, menu Escritório): três botões por
  ato (`chipsAvisosAto`: feito ✓, "📲 Avisar agora" verde no devido, cinza com a data nos futuros), filtros e números. Mensagens
  (`textoAvisoAto`): conciliação explica que é TENTATIVA DE ACORDO e diz se é online/presencial; instrução pede as testemunhas (nome, CPF,
  telefone); véspera diz "amanhã" ou "na segunda-feira (dd/mm)". "Precisa de ação agora": aviso devido (véspera/dia em vermelho) e
  instrução sem testemunhas.
- Financeiro: "Retirar honorário" (`fin.honorario.retirar`, motivo obrigatório; parcelas NÃO pagas apagadas, pagas ficam; situação
  "retirado" — não vira saldo; resumo ignora retirado/cancelado), "Mudar o dia de pagamento" (`fin.honorario.dia`, a partir de uma data),
  "📝 Notas promissórias" no honorário (abre Modelos com docs=promissoria&honorario=; o gerador usa o honorário com MAIS parcelas em aberto
  quando nenhum é escolhido e, sem nenhuma, as parcelas abertas de todos os honorários do cliente). Aba "⚖ Ação de cobrança"
  (`fin.acaoCobranca`/`.marcar`: atraso > 60 dias ou marcado; etapas WhatsApp → notificação (15 dias sem resposta e > 90 de atraso) → ação;
  prescrição 5 anos do vencimento, art. 25 EAOAB; "Não cobrar" = Config ACAO_COB_IGNORADOS). Aba "🔎 Conferir cobranças"
  (`fin.conferencia`): parcela sem honorário, sem valor/vencimento, repetida, honorário em duplicidade/sem parcelas/soma diferente,
  pagamento no futuro, dívida > 5 anos, importado não conferido e cliente com processo ativo SEM honorário. Só aponta.
- CRM: `crmNomes_` (toda sincronização) troca nome que é número de telefone pelo nome do cadastro ligado, do cliente com o mesmo telefone
  (e liga) ou do perfil da conversa do WhatsApp; sem nenhum, o cartão mostra "❓ nome a confirmar". `crmAreas_`: tipo de ação da Assinatura
  vira área/assunto do cartão (etiqueta "Trabalhista" etc.). "Não vai fechar" na petição inicial → `crmPerdido_` (cartão "Não fechou").
- Várias ações por cliente: "＋ Nova ação" na ficha (`clientes.abrirAcao` com `nova`); a inicial sem número só é reaproveitada se for da
  MESMA área (`abrirAcaoCliente_`, `abrirPeticaoInicial_`); "aguardando assinatura" só junta com o do MESMO tipo de ação. Ficha lista os
  processos com a ETAPA de cada um.
- Gerador: área previdenciária marca procuração + contrato PREVIDENCIÁRIO (troca ao mudar o tipo de ação); campo "Cidade da assinatura"
  (linha "Cidade, data") vem com a cidade do cliente (`cidadeAssinatura_`: informada → cidade/UF do cliente → escritório); promissória emitida
  na cidade do cliente. Ficha sem pasta: não há mais "Criar pasta" (a pasta nasce ao gerar o 1º documento).
- Sessão parada no navegador: 1 hora (antes 30 min).
- Edifício Future: caução NUNCA é aluguel — `futEhCaucao_` ("Caução"/"Calção"); a baixa automática não junta caução; Relatório e Visão geral
  tiram a caução das receitas (quadro "Cauções do mês (garantia, não é receita)"); `futCaucaoNormalizar_` (uma vez, Config FUTURE_CAUCAO_821)
  trocou "Calção" por "Caução". `future.conferir` (Visão geral, caixa amarela): caução com descrição de aluguel (ou o contrário), lançamento
  repetido (mesma unidade, mês, categoria e valor) e receita sem unidade.
- Site 2026.3 (revisão externa): primeira tela curta (título menor, 2 linhas, botão "Falar com o escritório pelo WhatsApp"); "Como podemos
  ajudar" = Trabalhista e Previdenciário lado a lado abrindo as PÁGINAS ("Ver atendimento trabalhista/previdenciário"), demais áreas em
  pílulas + "Todas as áreas"; menu: Previdenciário no lugar de Empresarial (Empresarial fica em Atuação e no rodapé); home sem a calculadora
  interativa e sem a faixa "Novo no blog"; "Resolva pelo site" só Acompanhe + Calculadoras; guia em destaque "Fui demitido por justa causa:
  quais documentos devo separar?" (post do escritório no blog). Calculadoras (site e painel): "A empresa NÃO depositou o FGTS" + meses →
  FGTS a cobrar em linha própria e na base da multa.

## 8.22.0 Boleto/Pix automático, fluxos por tipo de ação, portal com documentos, indicadores (pedido da usuária, 13/11/2026)

- Cobrança automática (Asaas): chave SÓ nas Propriedades (ASAAS_CHAVE); Config ASAAS_AMBIENTE (producao|sandbox; ASAAS_URL força outra base),
  ASAAS_AUTO, ASAAS_DIAS (10), ASAAS_MULTA (2), ASAAS_JUROS (1). `asaas_` (header access_token), `asaasCliente_` (procura pelo CPF/CNPJ, cria;
  Clientes.asaas_id), `asaasGerar_` (billingType UNDEFINED = boleto/Pix/cartão; vencimento passado → hoje+2; externalReference = id da parcela;
  Parcelas.asaas_id/asaas_link/asaas_status), `asaasCancelar_`, `asaasRobo_` (robôs do escritório: confere cada cobrança aberta e, paga, chama
  `pagarParcela_` com forma "Asaas (Pix|boleto|cartão)" e recibo; com ASAAS_AUTO gera as que vencem nos próximos ASAAS_DIAS, clientes com
  CPF, nunca atrasadas). Rotas `fin.asaas.config` (administração: chave, testar, sincronizar), `fin.asaas.gerar`/`cancelar` (financeiro). Painel:
  aba "⚡ Boleto/Pix automático" no Financeiro (só administração), botões "Gerar boleto/Pix" / "🔗 Boleto/Pix" / "✕" na parcela
  (`ASAAS_LIGADO` vem de fin.resumo/fin.honorario), o link vai junto no WhatsApp de cobrança (`linkWhats`). Retirar honorário cancela no Asaas.
- Fluxos por tipo de ação (`FLUXOS` por área × fase, `fluxoDe_`; áreas Trabalhista, Previdenciário, Família, Cível, Criminal + geral):
  `fluxosProcessos_` (robôs do escritório) cria a tarefa "📋 <etapa> — cliente" com o checklist quando o processo MUDA de etapa
  (Processos.fluxo_fase; marca `[fluxo:procId|fase]`; na Petição inicial o checklist entra na tarefa `[inicial:]`). 1ª rodada (Config FLUXO_DESDE)
  só anota a etapa atual, sem tarefas. Tela do processo: "📋 Checklist da etapa" (`fluxos.processo`, marca pelo `tarefas.check`).
- Portal do cliente (/acompanhe/): `autenticarCliente_` (mesmas travas do CPF + código). Pasta do cliente › "PORTAL — O CLIENTE VÊ" =
  documentos que o cliente baixa (`consulta.baixar`: só arquivo DENTRO dessa pasta, até 15 MB, passa pelo servidor — nada público); envio
  pelo cliente (`consulta.enviar`: PDF/foto até 3 MB, 20/h, pedido até 4,4 MB) → "ENVIADOS PELO CLIENTE (portal)" (sem pasta → pasta central
  "PAINEL — ENVIADOS PELO PORTAL") + tarefa "📎 … enviou um documento". consulta.processos devolve `documentos` e `pagamentos` (parcelas em
  aberto até 45 dias, com o link do Asaas; sem link mostra o Pix de WHATS_PIX_TXT). Credenciais só na memória da página. Ficha: seção
  "Portal do cliente" (`clientes.portal`: abrir/criar a pasta, documentos enviados).
- Indicadores (`indicadores.mes`, administração; topo de Relatórios, `blocoIndicadores`): prazos cumpridos e % no prazo, folga média antes do
  fatal, tarefas e % no prazo, intimações tratadas e dias até tratar, clientes novos, contratos, recebido — mês × anterior; "Agora": prazos
  vencidos/sem responsável/para conferir, processos ativos e parados 60+ dias, inadimplência; tabela por pessoa.

## 8.23.0 Motor de prazos igual ao PJe, revisão/baixa, robô do DJEN na nuvem, Financeiro novo (pedido da usuária, 13/11/2026)

- Foco do produto (palavra da usuária): GESTÃO PARA ESCRITÓRIOS DE ADVOCACIA integrando PRAZOS e COBRANÇA DE HONORÁRIOS.
- Motor de prazos (`calcularFatal_` + `cienciaEfetiva_`): ciência em sábado/domingo/feriado/recesso (20/12–20/01, só não criminal) vale no 1º dia
  útil seguinte (Lei 11.419 art. 4º §3º e art. 5º §§2º–3º); úteis contam do dia útil SEGUINTE; corridos (criminal) terminam no próximo útil. Achado
  nos dados reais: ciência tácita do eproc caía no sábado/domingo (fatal 1 dia antes do eproc). "🧮 Como o painel contou este prazo"
  (`prazos.memoria`, `memoriaPrazo_`, `nomesFeriados_`) mostra a conta dia a dia na tela do prazo.
- Revisão (`revisarPrazos_`, rota `prazos.revisao` admin, botão "🔧 Revisar prazos" em Intimações e prazos): repetidos (mesma intimação/processo
  + descrição + fatal), "Vista ao Ministério Público", "Intimação de audiência" com a audiência já em Eventos (fica em Audiências com os 3 avisos),
  data diferente da conta nova (recalcula) → automáticos em toda rodada do robô (`robosEscritorio_` 'prazos823'); VENCIDOS ainda abertos → baixa
  "cumprido" em lote, com marca "baixa em lote … se NÃO foi feito, reabra" (uma vez sozinho, Config FIX_VENCIDOS_823; depois só pelo botão);
  lista "Baixados em lote" com Reabrir (`baixadosEmLote_`). Nos dados de 13/11: 143 abertos, 63 "PROVISÓRIO 5 dias", 29 vencidos, um processo
  com o mesmo aviso repetido dezenas de vezes.
- Robô do DJEN na NUVEM (GitHub Actions `.github/workflows/robo-djen.yml` + `.github/robo-djen/robo.mjs`, de 2 em 2 h): lê o DJEN e manda pela rota
  PÚBLICA `djen.robo` (acao config | itens/fim | erro) com a chave do robô (só o hash em Properties DJEN_ROBO_HASH; `djen.roboChave` gera/desliga;
  botão "☁ Robô do DJEN" em Intimações e prazos). Segredos do repositório: PAINEL_URL e DJEN_ROBO_CHAVE (a usuária cria; o proxy desta nuvem não
  deixa o Claude criar segredos). Config DJEN_NUVEM_ULTIMA/ERRO. Se o CNJ também recusar o GitHub, o erro aparece no cartão e o navegador continua.
- Financeiro novo (`telaFinanceiro`): `heroFinanceiro` (recebido no mês + barra de meta = tudo que vence no mês, cartões Em atraso / A receber 30
  dias / PIX para conferir / Boleto-Pix automático), `reguaCobranca` (barra segmentada: vence em 7 dias → atraso até 30 → 31–90 → +90, clicável),
  `agendaRecebimentos` (14 dias em colunas), cobranças em CARTÕES (`listaCobrancas`, `chipVenc`: "vence hoje", "3 dias em atraso"…), abas Em atraso /
  A receber / Recebidas no mês / Ação de cobrança / PIX… fin.resumo devolve `mes`, `agenda`, `recebidas` (RH: sem valores).

## 8.24 (nov/2026: Entrega 1 da revisão — escolhas da usuária: layout "C" e cor "3")

- Só painel (Code.gs continua 8.23.0; `VERSAO_PAINEL` não mudou para não acusar "Code.gs velho"). Revisão completa com as próximas entregas:
  artifact "Revisão do Painel Araújo" (Entrega 2: Clientes/Intimações/Agenda; 3: Documentos/CRM; 4: Supabase; 5: produto/SaaS).
- Layout C: menu lateral CLARO com poucos itens (`ABAS` = [id, nome, permissão, ícone]): Início, Clientes e processos, Intimações e prazos,
  Tarefas, Agenda, Cobranças (financeiro), Documentos (modelos), Atendimento (crm, só administração). Barra do topo (`#barra-topo` em
  index.html): busca única (`#busca-topo` → #/clientes?busca=…, atalho Ctrl+K) e SUB-ABAS da seção (`SUBABAS`, `SECAO_DA_TELA`,
  `desenharSubabas`): Agenda › Calendário | Audiências e perícias; Documentos › Gerar documentos | Calculadoras | Gravar e resumir conversa;
  Atendimento › Funil | Chatbot | Marketing; Relatórios › Resumo do mês | Equipe. Relatórios e "Equipe: o que cada um fez" ficam no menu do NOME.
  Ficha do cliente: "🎙 Gravar atendimento" nas observações (#/transcricao?cliente=ID já escolhe o cliente).
- Cor 3 (verde-petróleo): bloco "8.24 — tema" no fim do painel.css (`--acento:#0F6E6E`, `--acento-esc`, `--acento-f`, fundo `#F4F6F7`,
  `--preto` = verde-petróleo para os botões). Cabeçalhos das telas CLAROS (carteira-topo, ini-hero, eq-topo); sem faixas escuras nem dourado.
  Avisos continuam: âmbar = conferir, vermelho = vencido/risco, verde = feito. O Edifício Future mantém o tema verde dele.
- Cobranças (`telaFinanceiro`, pedido da usuária: "poluído, sem base de nada"): 3 números (Recebido no mês, Falta receber no mês, Em atraso),
  aviso azul só quando há PIX para conferir, abas Atrasadas | Este mês | Próximas | Pagas no mês (`ver=atrasadas|mes|proximas|pagas`; os antigos
  atraso/proximas ainda funcionam), uma linha por parcela (`linhasCobranca`): nome, parcela, data, situação (`chipVenc`), valor, UM botão
  (Cobrar/Lembrar no WhatsApp; paga → Recibo) e o ⋯ (`acoesParcela(p, depois, semWhats)`: Pago, boleto/Pix, ação de cobrança, abrir honorário).
  Clicar na linha abre a cobrança na LATERAL (`gavetaCobranca`: dados, ações e todas as parcelas do honorário). O resto foi para "Ferramentas"
  (`FERRAMENTAS_FIN`: honorários, PIX, ação de cobrança, alvarás, recibos, conferir, sistema antigo, Asaas, entradas e saídas; A receber por cliente;
  Caixa), cada uma com "← Cobranças". Saíram da tela: régua, agenda de 14 dias e o painel de entradas/saídas aberto.
- Relatórios: 6 números do mês (navega ‹ ›; recebido, resultado, clientes novos, contratos, prazos no prazo, processos ativos) + 2 gráficos
  (entradas × saídas; clientes novos e contratos); o resto em "Ver todos os gráficos e indicadores". `?ver=equipe` = página Equipe (semana/mês
  por pessoa + produtividade).
- Correções: "null" solto nas telas (append/replaceChildren ignoram null/false — patch no início do painel.js) e a tabela de prazos não passa
  mais da tela (`.tabela.compacta .mini-acoes` quebra linha).

## 8.25.0 (nov/2026: Entregas 2 e 3 da revisão + preparo do banco novo)

- Agenda que não trava (Code.gs): `eventosDoMes_` guarda os eventos do Google por MÊS na memória do servidor (10 min, em pedaços);
  `listarAgenda_` junta os meses do período; `aquecerAgenda_` (no `aquecerGatilho` e depois do robô de hora em hora) deixa prontos o mês passado,
  o atual e o próximo. Mudança feita pelo painel chama `mudouAgenda_` (criarCompromisso_, criarEventoAto_, sincronizarAgenda_, limparAtosImpossiveis_,
  whatsMarcar_, whatsDesmarcar_) e a próxima leitura vai ao Google; mudança direto no Google aparece em até 10 min ou no botão "↻" da Agenda
  (`atualizar: true`). Função nova que crie/mude evento no Google: chame `mudouAgenda_()` no começo.
- Agenda abre na visão LISTA da semana (dia a dia, hora, bolinha, título, local; lembra em localStorage `agenda_visao`); Dia/Semana/Mês continuam.
  Início: agenda PEQUENA em tabela (`blocoAgendaMini`: Quando/Hora/O quê/Agenda, hoje · amanhã · 7 dias), minimiza e lembra (`inicio_agenda`).
- Audiências: LISTA simples (data, hora, cliente, tipo, 3 bolinhas dos avisos: verde = avisado, contorno verde = avisar agora); clicar abre a
  ficha (avisos, online/presencial, testemunhas, anotações, ciente) logo abaixo da linha, uma por vez. Os 4 quadrinhos viraram uma linha de alerta.
- Ficha do cliente em ABAS (`fichaEmAbas`): Resumo · Processos · Cobranças · Anotações · Documentos e portal · Cadastro (lembra a aba por
  cliente na sessão; "✎ Editar cadastro" abre a aba Cadastro; cadastro incompleto abre nela).
- Intimações e prazos: "semáforo" do robô (`semaforoRobo`: verde/âmbar/vermelho + "Falta(m) N coisa(s) para rodar 100%": robô atrasado,
  Code.gs velho, DJEN sem leitura há 26 h, alertas do vigia; detalhes = o cartão antigo). Os 5 quadrinhos saíram: as contagens estão nos filtros.
- Documentos abre com 3 escolhas (sem parâmetros): Documentos para um cliente (#/modelos?passo=gerar), Proposta de honorários, Petição simples
  (`abrir=peticoes` abre a janela de documentos já em Petições: `seletorDocumentos().abrirEm`).
- CRM: cartões mais limpos (iniciais de quem cuida, dias parado em âmbar a partir de 3, botões só ao passar o mouse; colunas cinza-azuladas).
- Celular: `.btn.mini` com 34 px de toque; `table.mini-tab` rola dentro do cartão.
- Banco novo: `supabase/esquema.sql` (gerado do ESQUEMA: uma tabela por aba + `escritorio_id` + RLS) e o plano em docs/BANCO-SUPABASE.md.
  Falta a usuária criar o projeto no Supabase (região São Paulo); as chaves vão por formulário seguro / Propriedades do script.
- 8.25.1 (pedido da usuária: "a proposta era Início, Clientes, Processos e prazos, Agenda, Cobranças, Documentos e Atendimento"): o menu tem
  EXATAMENTE esses 7 itens (Atendimento só administração). "Clientes" (#/clientes) e "Processos e prazos" (#/prazos) são itens separados;
  Processos e prazos › sub-abas Intimações e prazos | Processos | Tarefas. O cabeçalho da carteira (`cabCarteira`) mostra "Clientes" ou
  "Processos" conforme a tela, sem o botão "Por cliente / Por processo".

## 8.26.0 Banco novo (Supabase) — passo 1: cópia automática (pedido da usuária: "deixar pronto para quando eu quiser vender")

- A planilha continua sendo a fonte. `copiarParaSupabase_` copia cada aba do ESQUEMA para a tabela de mesmo nome (snake_case, `sbTabela_`)
  em supabase/esquema.sql: colunas iguais + `escritorio_id`, `_n` (linha da planilha) e `_sinc` (carimbo). Só manda abas que MUDARAM (MD5 em
  Properties SB_DIG_<aba>), upsert em lotes de 500 (`on_conflict` escritorio_id,id — ou escritorio_id,_n nas abas sem id; id repetido na planilha
  fica a última linha) e depois apaga do banco o que saiu da planilha (`_sinc` antigo). `SB_FORA`: Usuarios.hash/salt NUNCA saem do Google.
- `copiarSeHora_` (no `aquecerGatilho` e no fim do `roboRapidoGatilho`): de 30 em 30 min, limite de 60 s por rodada (o que faltar vai na próxima).
  Status em Properties SUPABASE_ULTIMA (NÃO na planilha: gravar na planilha apagaria a memória das telas a cada cópia).
- Ligar: Gerenciar acessos › "🗄 Banco novo (Supabase)" (`caixaBancoNovo`, rota `banco.config` só administração: url, chave, testar, copiar,
  tudo, desligar). Chave service_role SÓ em Properties SUPABASE_CHAVE; escritório criado sozinho na 1ª cópia (SUPABASE_ESCRITORIO).
  `supabase_` traduz 401/403 (chave errada) e tabela inexistente ("rode o esquema.sql").
- esquema.sql pode rodar de novo (create if not exists + add column if not exists). Mudou o ESQUEMA? Gere o arquivo de novo (script do
  simulador `tsql.js`) e rode no SQL Editor. RLS ligado em tudo; política de leitura por `escritorio_id` do JWT (para o passo 2).
- 8.26.1: aceita a chave nova "sb_secret_…" (vai só no header apikey) e a antiga "service_role" (eyJ…, também no Authorization); recusa a "publishable".
- Próximo passo (2): o painel ler do Supabase direto pelo navegador, respeitando o perfil (RH sem totais, tarefas só da pessoa).
