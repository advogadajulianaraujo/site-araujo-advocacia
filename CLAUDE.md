# Regras permanentes do painel (Araújo Advocacia)

## Calculadora: multas só por escolha expressa (18/11/2026)

- No site e no painel, nenhuma multa vem selecionada ou entra automaticamente: multa do FGTS (40%/20%), art. 477 e art. 467 têm opções separadas.
- Multa desmarcada não aparece na tabela nem no resultado copiado. Alterar um dado/opção invalida o resultado anterior até recalcular.
- Art. 467 exige informar a base incontroversa; não presume 50% de todo o subtotal rescisório.
- Ajuste restrito ao motor da calculadora e às duas interfaces; não muda Code.gs nem as versões dos motores Google/Supabase.

Leia também docs/PLANO-PAINEL.md antes de mexer no painel.

## Prazos: nunca sem data (regra do escritório)

- Nenhum prazo pode ficar sem data fatal. 8.43 (decisão da usuária, 17/11/2026: "não deveria ter prazo provisório; veja e entenda
  para não falhar"): o painel DESCOBRE o ato — texto da publicação no DJEN (frase "fica … intimado PARA …", prazo por extenso) e
  movimentações do DataJud (`identificarProvisorios_` em toda rodada). Só quando nada disso existe ainda o prazo fica "ATO NÃO
  IDENTIFICADO (PROVISÓRIO)" com a data de segurança MAIS CURTA (5 dias úteis; 5 corridos no criminal) — some sozinho quando o texto chega.
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

## 8.28.0 Banco novo — passo 2: o painel LÊ do Supabase (pedido da usuária: "mais rápido, planilha como reserva")

- Substitui a 8.27.0 de outra sessão ("respostas prontas" + login no Supabase Auth): lá a tela vinha velha depois de qualquer gravação
  e esperava o Google; aqui o navegador refaz a conta com as linhas que acabaram de chegar. As tabelas `respostas`/`estado` e os usuários
  criados no Supabase Auth por ela ficam sem uso (podem ser apagados).

- Medição antes (da usuária): cada doPost leva 2 a 9 s (o gargalo é o Apps Script). Depois (simulador e Chromium): a conta de cada tela
  no navegador leva 15–160 ms com volume real; a tela abre em ~0,1–0,5 s (ida ao Supabase + conta). Medir de verdade: Gerenciar acessos ›
  Banco novo › "⏱ Medir agora" (mesmas telas pelos dois caminhos, tempo e "resultado igual?") + tabela das medidas da aba.
- Leitura: `painel/banco.js` (window.PAINEL_BANCO) busca as linhas pela RPC `painel_ler` (supabase/leitura-rapida.sql) e roda a rota com
  `painel/motor.js` = as funções de leitura do Code.gs, GERADO por `node .github/motor/gerar.mjs` (mudou o Code.gs? rode o gerar; ele
  também atualiza `SB_CONFIG_LIVRE` no Code.gs). Gancho único em `chamar` (painel.js): `BANCO.lerOuPlanilha(acao, dados, …)`.
  Rotas do motor: `ROTAS_MOTOR` no gerar.mjs. Só incremental: `_em` (quando mudou no banco) com 2 min de folga + conferência de chaves.
- O motor nunca grava: inserir/atualizar/apagar, serviço do Google (Calendar, Gmail, Properties…), tabela/coluna não liberada ou valor
  mascarado na resposta = a conta para e a tela vai ao Apps Script (o mesmo pedido). `comTrava_(fn)` no motor só roda fn (se tentar gravar,
  para). Fuso do computador ≠ Brasília, Code.gs de outra versão (`versao` do motor = VERSAO) ou "pendente" → planilha.
  Tempo limite: 4,5 s (9 s na 1ª carga; a carga continua por trás); 3 falhas seguidas → 5 min só planilha.
- Segurança: rota `banco.sessao` (`bancoSessao_`) cria em `painel_sessoes` só o SHA-256 de um código novo, com perfil, `versao`
  (sessao_versao) e `permissoes` (`sbPermissoes_`); o navegador recebe código + chave PÚBLICA (Properties SUPABASE_PUBLICA; a secreta nunca
  sai do Google). `painel_ler` confere prazo (12 h total, 6 h parado), pessoa ativa, mesmo perfil e sessao_versao pela tabela usuarios
  (trocar senha/perfil/desativar/"Desconectar agora" derruba na hora); Sair apaga (`sbSair_`). Permissões: clientes com `acesso_hash`
  mascarado ("•"), processos com `andamentos` mascarado, Config só `SB_CONFIG_LIVRE` (nunca chave/código/Pix/conta/URL), financeiro só
  perfis com `financeiro` (os outros: honorários/parcelas com colunas mínimas), usuarios com 5 colunas para quem não é administração,
  Log só administração; tarefas fora da administração: as da pessoa inteiras e as dos colegas sem título/histórico/checklist e com só as
  marcas `[…:…]` da descrição (`_meu`); tarefas.listar usa só as da pessoa (`SB_TAREFAS_FILTRADAS_OK`). Linha resumida lida em coluna
  escondida = planilha (Proxy no banco.js). clientes.obter não manda mais `andamentos` dos processos.
- Gravação: os helpers chamam `sbMarcar_` (linha) / `sbApagar_` (id); no fim do doPost (e dos robôs) `sbEnviarSujas_` RELÊ as linhas da
  planilha e manda por `painel_gravar` (só entra linha com `_sinc` — hora da leitura, tirada ANTES de ler — mais nova e diferente:
  cópia atrasada nunca passa por cima). Falhou → Properties SB_PENDENTES + `painel_estado` "pendente" (navegador lê da planilha) e
  SB_FALHOU_EM (2 min sem tentar, para o Google não ficar esperando). Apagar linhas do meio (arquivarLog_) → `sbAbaMudouInteira_`.
  Escrita nova direto na planilha (fora dos helpers)? Marque com `sbMarcar_(aba, linha)` ou chame `sbAbaMudouInteira_`.
- Cópia completa de 30 em 30 min continua (segurança), agora por `sbCopiarAba_` → `painel_gravar` + `painel_apagar` (mantém só as chaves
  da planilha; nunca apaga linha gravada depois do início da cópia). Sem o leitura-rapida.sql, volta ao upsert antigo (8.26).
- Gerenciar acessos › Banco novo: chave pública, "Ligar/Desligar a leitura rápida" (Properties SUPABASE_LEITURA), aviso de pendência,
  medição. CSP do painel com `https://*.supabase.co` em connect-src.
- Testes: `.github/motor/teste/` (simulador do Google + PostgreSQL local + navegador, dados inventados; LEIA.md): 4 perfis × 30 telas
  iguais ao Apps Script, gravação/apagar/lote/pendência/troca de senha/sair/Log. Rodou o esquema.sql de novo (aba nova)? Rode também o leitura-rapida.sql (põe a coluna _em).

## 8.29.0 Banco novo — passo 3: Supabase como BANCO PRINCIPAL (pedido da usuária: "demore mas deixe tudo correto")

- Chave em Gerenciar acessos › Banco novo › "Banco principal" (rota `banco.conferir`, administração; Properties BANCO_PRINCIPAL =
  planilha|supabase). Só liga com a conferência de menos de 26 h e Clientes/Processos/Prazos/Intimacoes/Tarefas/Config iguais.
- No modo Supabase o SERVIDOR também lê do banco: `lerTabela_` → `sbLerTabela_` (RPC `painel_tabela`, service_role, linhas compactas em
  ordem de _n; `sbPrecarregar_` busca várias abas em paralelo com UrlFetchApp.fetchAll; cada rota lembra as abas que usa em CacheService
  `sbrota_<acao>` — `sbAntesDaRota_`/`sbDepoisDaRota_`). Lê do banco SÓ se: aba em SB_TABELAS_OK (conferida igual), fora de `SB_SO_PLANILHA`
  (Usuarios = senhas; Log, LogArquivo, PastasConferir, SiteCliques = gravadas direto na planilha), nada pendente/banco sem falha há 2 min,
  aba não gravada neste pedido (`SB_ESCRITAS`), maior _n do banco = última linha da planilha e nenhuma coluna faltando. Senão: planilha
  (`SB_LEITURAS` diz de onde veio cada aba). `sbNovaExecucao_` zera tudo no começo do doPost.
- Gravar linha lida do banco (`tab._sb`): `atualizarLinha_` → `sbGravarConferindo_` relê a linha da planilha, confere o registro
  (`sbConferirLinha_`: id, ou a 1ª coluna nas abas sem id, contra `_k` lido) e grava só as colunas mudadas; `regravarMudadas_` usa
  `_cols`; `apagarLinha_` confere antes. Não confere → nada é gravado, erro "A planilha mudou enquanto você salvava… tente de novo" e a aba
  sai de SB_TABELAS_OK (próxima leitura pela planilha).
- A gravação continua indo à planilha E ao Supabase (8.28): a planilha segue completa como reserva; a conferência conserta copiando da
  planilha. Conferência (`sbConferir_`/`sbConferirAba_`): linha a linha (falta, sobra, diferente, id repetido na planilha), "Conferir e
  consertar" (`sbCopiarAba_` + confere de novo); o robô faz 1×/dia com conserto (`sbConferirSeDia_` no copiarSeHora_; Properties
  SB_CONFERIDO_DIA/SB_CONFERENCIA). Aba com id repetido na planilha nunca entra (o banco guarda um só).
- Testes: `.github/motor/teste/principal.js` (20 telas × 4 perfis iguais nos dois modos, gravações, linha a mais/linhas trocadas à mão,
  banco fora do ar) e `PRINCIPAL=1 node .github/motor/teste/rodar.js` (toda a bateria da 8.28 com o banco principal).
- Próximo passo (só depois de semanas sem diferença na conferência): parar de gravar na planilha (vira cópia noturna do banco).

## 8.30.0 Etapa A — o Supabase GRAVA PRIMEIRO; a planilha vira cópia (plano A→D em docs/BANCO-SUPABASE.md)

- Pedido da usuária: sair da dependência do Google e da planilha, por etapas testadas. Etapa A: Properties BANCO_GRAVA = 'supabase'
  (Gerenciar acessos › Banco novo › "⚡ Gravar primeiro no Supabase"; rota `banco.conferir` grava=supabase|planilha; exige o banco
  principal ligado, todas as abas conferidas iguais e o leitura-rapida.sql 8.30 com `painel_aplicar`).
- Abas fora de `SB_SO_PLANILHA` (Usuarios, Log, LogArquivo, PastasConferir, SiteCliques continuam na planilha até a Etapa B): `lerTabela_`
  → `sbpTabela_` (banco + o que o pedido já mudou, `SB_PEND`); os helpers só anotam (`sbpInserir_`/`sbpAtualizar_`/`sbpApagar_`; `gravarLote_`,
  `regravarMudadas_`, `gravarVarias_` também) e `sbpAplicar_` manda tudo numa transação (RPC `painel_aplicar`: tudo ou nada, linha nova =
  maior _n + 1 com trava por tabela, atualização só das colunas mudadas, linha sumida = erro). Manda no fim de cada `comTrava_` (antes de
  soltar a trava; ao ENTRAR na trava a leitura é refeita: `SB_EXEC = {}`), no fim do doPost (erro no pedido = `SB_PEND = {}`, nada gravado)
  e no `sbEnviarSujas_` dos robôs; > 400 mudanças manda no meio. Tabela com `_sbp` tem `aba` falsa: escrita direta na planilha = erro.
- Banco fora: gravação recusada ("O banco de dados não respondeu…"); leitura pura (rota de LEITURAS_RAPIDAS) usa a cópia da planilha.
- Cópia inverte: `sbEspelhar_` (banco → planilha, abas em Properties SB_ESPELHO_SUJO, no `copiarSeHora_` de 30 em 30 min; SB_ESPELHO_ULTIMA);
  `copiarParaSupabase_` pula essas abas; `sbCopiarAba_` recusa; a conferência conserta copiando do BANCO. Voltar (grava=planilha): dentro da
  trava copia TUDO do banco para a planilha e só então troca; desligar o banco principal com grava=supabase é recusado.
- Teste: `.github/motor/teste/etapaA.js` — dois escritórios iguais (A = planilha, B = grava primeiro) recebem as MESMAS 11 gravações (ids
  em sequência: `Utilities.__uuid` no simulador) e as planilhas ficam IGUAIS; tudo ou nada; banco fora; navegador vê na hora; robô em lote;
  voltar. Junto: rodar.js (45), principal.js (28), PRINCIPAL=1 rodar.js (46) sem falhas.

## 8.31.0 Etapa B — login, senhas e Log também no Supabase (medição real de 14/11: telas 5× a 21× mais rápidas, todas "igual")

- Properties BANCO_LOGIN = 'supabase' (botão "🔐 Levar o login e as senhas para o Supabase"; rota `banco.conferir` login=supabase|planilha;
  exige BANCO_GRAVA = supabase e o leitura-rapida.sql 8.31: colunas `hash`/`salt` em usuarios e `painel_ler` que NUNCA devolve essas duas).
  `sbLigarLogin_` (dentro da trava) copia Usuarios COM hash/salt, Log e LogArquivo inteiros; `sbDesligarLogin_` espelha as três e volta.
- Então `sbSoPlanilha_(aba)` tira Usuarios/Log/LogArquivo de SB_SO_PLANILHA (`SB_ETAPA_B_`) e `sbFora_('Usuarios')` = [] (as funções do
  banco usam sbSoPlanilha_/sbFora_, nunca SB_SO_PLANILHA/SB_FORA direto). PastasConferir e SiteCliques continuam só na planilha.
- `registrar_` → fila `SB_LOG` (nunca descartada, nem com erro no pedido) → `sbLogAplicar_` no fim do doPost (sucesso e erro) e no
  `sbEnviarSujas_`; falhou → Properties SB_LOG_PEND (até 300) e tenta no próximo pedido. Login com senha errada grava a tentativa NA HORA
  (`sbGravarJa_`), senão o "tudo ou nada" apagaria o bloqueio de 5 erros. `relatorioSemana_` lê `ultimasLinhasLog_` (planilha ou banco;
  no motor é trocada pela leitura da aba falsa). `arquivarLog_` no banco move as linhas antigas para LogArquivo sem linhas "subindo".
- A conferência leva antes a cópia banco → planilha das abas pendentes (`sbEspelhar_`), para não acusar diferença de momento.
- Teste `.github/motor/teste/etapaB.js`: login certo, 5 erros + bloqueio, pessoa inexistente, usuário novo, tarefa, troca de senha — mesmas
  respostas e planilhas iguais nos dois escritórios; o navegador nunca recebe hash/salt; COM A PLANILHA FORA DO AR (`S.planilhaFora`) o
  painel entra, lista clientes e prazos e grava tarefa; desligar volta tudo para a planilha.
- Próximas: Etapa C (motor do painel numa Edge Function do Supabase, sem o Apps Script nas telas) e D (desligar o caminho antigo).

## 8.32.0 Etapa C — o motor do painel no Supabase (Edge Function "painel"; telas e gravações sem o Google)

- `supabase/functions/painel/`: `index.ts` (Deno.serve, CORS, rpc com a chave secreta do próprio Supabase: PAINEL_CHAVE, SUPABASE_SECRET_KEY ou
  SUPABASE_SERVICE_ROLE_KEY), `servidor.js` (sem Deno: testado no Node) e `motor.js` = o Code.gs INTEIRO + trocas de dados, GERADO por
  `node .github/motor/gerar-edge.mjs` (rode junto com o gerar.mjs sempre que mudar o Code.gs). Publicar: `.github/motor/publicar-edge.mjs`
  (API de administração, token com edge_functions_write) ou o workflow `publicar-edge.yml` (segredo SUPABASE_ACCESS_TOKEN + variável
  SUPABASE_PROJETO). verify_jwt = false: a pessoa é conferida no banco (`painel_quem`: mesmas regras do painel_ler).
- `servidor.js`: pedido {token (sessão do banco), acao, dados, pedido, versao} → `painel_quem` → abas por `painel_tabelas` (várias de uma vez,
  com `_sinc`; aprende as abas de cada rota) → `M.rodar` (rotear_ sem a sessão: permissão, valoresDoPerfil_; comTrava_/comMemoria_ só rodam;
  sbPrimeiro_/sbLogin_ = true; gravações ficam em SB_PEND/SB_LOG e viram ops com `v` = _sinc lido) → `painel_aplicar_pedido` (tudo ou nada;
  pedido repetido devolve a MESMA resposta sem gravar; `v` diferente = erro 'conflito' 40001 → lê de novo e refaz, até 2 vezes). Erro de
  regra (falha_) = a mesma mensagem do Apps Script e só o Log é gravado. Qualquer serviço do Google, Propriedades, aba só da planilha,
  versão diferente, marca `painel_estado` edge ≠ 'sim', "pendente" ou rota de `NUNCA` (login, sessão, banco.*, usuarios.*, senha.*, ext.*,
  future.*, públicas) → { voltar: true } (NADA foi gravado) e o navegador manda o mesmo pedido ao Apps Script.
- Navegador (`chamar` em painel.js; `SO_GOOGLE`): leitura = motor do navegador → `BANCO.lerViaEdge` → Apps Script; gravação =
  `BANCO.gravarViaEdge` (id de pedido; sem resposta tenta de novo com o MESMO id e, se ainda falhar, avisa para conferir — nunca manda ao
  Apps Script depois de falta de resposta, para não gravar duas vezes); rota que voltou fica em `edgeFora` na aba.
- Apps Script: Properties BANCO_EDGE (botão "🚀 Ligar o motor do Supabase", rota `banco.conferir` edge=sim|nao: confere `sbEdgePing_` =
  mesma VERSAO; marca painel_estado edge/asaas); `comMemoria_` desligado com o motor ligado; `bancoSessao_` devolve `edge` (endereço);
  `sbEspelhar_` também copia as abas de `painel_mudadas` (painel_aplicar marca 'mudou:<tabela>'); asaas atualizado no copiarSeHora_.
- SQL 8.32 (leitura-rapida.sql): `painel_tabelas`, `painel_quem`, `painel_pedidos` + `painel_aplicar_pedido`, `painel_mudadas`, `v` no painel_aplicar.
- Testes: `.github/motor/teste/etapaC.mjs` (17 telas × 4 perfis iguais ao Apps Script; as mesmas 10 gravações nos dois escritórios →
  planilhas iguais; pedido repetido grava uma vez; linha mudada no meio refaz sem perder; Google/login/sessão inválida/versão/desligado
  voltam; acesso negado registrado) e `deno.mjs` (a função no DENO com relógio em Greenwich: igual ao Apps Script, gravação ~0,2 s).

## 8.33.0 Etapa D — entrar sem o Google + velocidade (pedido da usuária: "está travando; deixe bem melhor")

- Login pela função "painel" (`entrar` em servidor.js → `M.entrar` = o login_ do Code.gs com PropertiesService falso só para CHAVE_SENHAS):
  mesmas travas e mensagens (5 erros por pessoa, contador geral em painel_estado login_falhas via `painel_login_falha`). A chave das senhas
  fica no COFRE do Supabase (Vault, `painel_segredo_gravar`/`painel_login_info`; nunca em tabela comum). Devolve { token, usuario } + `banco`
  (a sessão do banco pronta: `painel_sessao_nova`). O Apps Script aceita a sessão criada pela função (`sbSessaoDoBanco_` em usuarioDaSessao_:
  confere painel_sessoes.sessao = sha256 do token, expira, 6 h parado, sessao_versao). Sair apaga também pela função (`painel_sessao_sair`).
- Ligar: Gerenciar acessos › Banco novo › "🔑 Entrar pelo Supabase (Etapa D)" (`banco.conferir` entrar=sim|nao; Properties BANCO_ENTRAR;
  painel_estado login_edge e publica); exige o motor do Supabase; desligar o motor desliga a entrada. O navegador lembra o endereço da função e
  a chave PÚBLICA em localStorage `painel_edge` e tenta entrar por ela; não deu → login pelo Google.
- Velocidade: a função guarda as tabelas na memória entre pedidos (`carregar` + `painel_assinaturas`; trigger `painel_em` marca _em em toda
  mudança); o navegador lembra 12 h o que precisa do Google (`banco_fora_<perfil>_<versão>`, `foraLembrado`; motivos passageiros não contam);
  `BANCO.acordar()` ao abrir e de 4 em 4 min; leitura pela função espera 10 s (antes 15). Início: agenda/extras/eu.painel/aguardando esperam
  1,5 s e a tela se redesenha quando chegam (antes até 25 s; o redesenho não funcionava em #/inicio). `estadoExtras_` lê a foto Config
  ROBO_EXTRAS (`roboExtrasAtualizar_` no aquecerGatilho e no robô de hora em hora; grava só se mudou) → o "resumo" sai do navegador.
- Teste: `.github/motor/teste/etapaD.mjs` (login igual ao Apps Script, bloqueio, contador, sessões, planilha fora, Sair, desligar) e deno.mjs
  (2ª chamada com as tabelas na memória ~0,1 s; mudança feita direto no banco é percebida). O banco de teste precisa de um "vault" falso
  (LEIA.md).

## 8.34.0 Tudo automático (pedido da usuária: "não quero precisar ficar fazendo sempre")

- ATUALIZAÇÃO AUTOMÁTICA (`autoAtualizar_`, no aquecerGatilho de 10 em 10 min e no fim do roboRapidoGatilho): lê o Code.gs do main (raw do
  GitHub); VERSAO mais nova → confere (tamanho, doPost, `new Function` = sem erro de escrita) → appsscript.json com permissão NOVA = não
  instala e avisa → `supabasePublicar_` (com Properties SUPABASE_GESTAO = token sbp_ da Management API: roda esquema.sql + leitura-rapida.sql
  e publica a função "painel" em multipart; espera o ping com a versão nova) → PUT content (API do Apps Script, `apiScript_` com
  ScriptApp.getOAuthToken) → versão nova → implantação do web app (`idImplantacao_` = id do PAINEL_API_URL de painel/config.js) →
  confere `situacao` (devolve `versao`) e, se não responder com a nova, VOLTA o código e a implantação. Falha → Config AUTO_ATUALIZAR_ERRO
  (cartão + vigia) e espera 1 h para a mesma versão (AUTO_FALHOU); sucesso → Config AUTO_ATUALIZADO. Nunca volta para versão mais velha.
  Properties AUTO_ATUALIZAR = nao desliga. Rota `sistema.atualizar` (administração; botão "Atualizar agora" em Gerenciar acessos › Banco novo).
  appsscript.json ganhou script.projects e script.deployments. UMA vez: API do Apps Script ligada (script.google.com/home/usersettings) e
  rodar `autorizar()` no editor (pede as permissões, publica a versão colada, religa gatilhos e já confere o GitHub).
  REGRA para quem mexe no código: subir a VERSAO do Code.gs junto com a VERSAO_PAINEL e rodar gerar.mjs + gerar-edge.mjs ANTES do push no main:
  o push no main É a publicação (o Apps Script instala sozinho em até 10 min). Permissão nova no appsscript.json exige a usuária rodar
  `autorizar` de novo (o painel avisa) — evite.
- "Entrar pelo Supabase" liga sozinho (`sbAutoEntrar_`, no aquecedor e no robô) quando o motor do Supabase está ligado e ninguém
  escolheu no botão (Properties BANCO_ENTRAR ainda vazia); `sbLigarEntrar_` é a função comum do botão e do automático.
- Robô do DJEN na nuvem SEM segredo: o workflow tem `id-token: write`; robo.mjs pede a identidade OIDC do GitHub (audience
  painel-araujo-djen) e pega o endereço do painel em painel/config.js (o segredo PAINEL_URL salvo errado — "Failed to parse URL" — é ignorado;
  segredos antigos são limpos de espaços/aspas e servem só de reserva). `oidcGithubValido_` confere a assinatura RS256 (BigInt) com as chaves
  públicas do GitHub (cache 6 h) + emissor, audience, validade, repositório, ref main e workflow robo-djen.yml.
- Teste `.github/motor/teste/etapaAuto.mjs` (identidade verdadeira/falsa/outro repo/outro robô/outro ramo/vencida/alterada; atualização:
  instala, mesma versão, mais velha, erro de escrita, permissão nova, não respondeu → volta, espera 1 h, botão força, ordem Supabase →
  Google, chave do Supabase vencida).

## 8.35.0 Agenda no banco (pedido da usuária: Agenda, Audiências e Início abrindo na hora)

- Aba/tabela nova AgendaEventos (id = agenda|evento|início, mes, agenda, ev_id, titulo, local, descricao, dia_todo, inicio, fim, dia). O
  `aquecerAgenda_` (10 em 10 min + robô de hora em hora) lê do mês passado a +3 meses (`mesAntes_`/`mesDepois_` — NÃO confundir com o
  `mesSeguinte_(iso, dia)` das parcelas) e `agendaCopiar_` grava só o que mudou e apaga o que saiu; Config AGENDA_COPIA = {em, meses, avisos}
  (regravada só se mudou ou a cada 1 h). Só copia se a tabela existir no banco (`sbTemTabela_`).
- `semGoogle_()` = false no Apps Script e true nos motores (gerar.mjs TROCADAS; gerar-edge trocas). `eventosDoMes_` nos motores →
  `eventosDaCopia_` (mesmo formato, eventos que tocam o mês, ordem por agenda + início); mês fora da cópia, cópia com mais de 3 h, `atualizar`
  (↻) ou marca apagada → CalendarApp → a tela vai ao Google. `mudouAgenda_` apaga a marca (mudança feita pelo painel nunca mostra agenda velha).
- `atosDaAgenda_(hoje, ate, eventos, fresco)` lê os eventos pelo `eventosDoMes_` (Google com memória de 10 min; o robô dos avisos passa
  fresco = true e lê na hora). Eventos ganharam o campo `dia` (dia do evento de dia inteiro no fuso da agenda).
- ROTAS_MOTOR ganhou agenda.listar e inicio.extras; a função do Supabase descobre até 25 tabelas por tela (antes 10: inicio.extras usa 11).
- Teste `.github/motor/teste/etapaAgenda.mjs` (Google Agenda simulado: 6 telas × 4 perfis iguais no navegador e 6 na função; dia inteiro,
  evento que atravessa o mês, ↻, mudança pelo painel, evento apagado/mudado/novo, cópia velha, mês fora, robô lê na hora).

## 8.35.1 Visual novo do painel (só painel; Code.gs continua 8.35.0) — pedido da usuária: "poluído, cores não combinam, menu grande"

- Tema GRAFITE + DOURADO (cores da logo; bloco "8.36 — tema GRAFITE + DOURADO" no fim do painel.css): menu lateral grafite #171513 estreito
  (212 px), dourado #C9A46A na seleção, fundo #F4F2EE, botões grafite, letras menores (corpo 13,5 px). Não voltar ao verde-petróleo nem ao menu claro.
- Menu da esquerda com grupos e mais abas (`ABAS` = [rota, nome, permissão, ícone, grupo]): Escritório (Início, Clientes, Processos, Intimações,
  Tarefas) · Agenda (Agenda, Audiências) · Gestão (Cobranças, Documentos, Atendimento, Relatórios). "Prazos" virou "Intimações" (pedido da usuária).
  Sub-abas do topo só em Documentos, Atendimento e Relatórios.
- Clientes em TABELA (Cliente · Área · Etapa · Processos · Próximo ato · Financeiro), filtros numa linha (grupo, etapa, área, cadastros a completar);
  observações e chips de processo saíram da lista.
- Ficha do cliente: topo com avatar, selos e WhatsApp / Gerar documentos / Editar / ⋯; aba "Visão geral" = processos, anotações (anotação
  rápida), dados do cliente, financeiro, onde o atendimento está.
- Tela do processo em abas (Visão geral · Prazos · Andamentos e linha do tempo · Editar); Visão geral = Agora (próximo ato, prazos abertos,
  última movimentação), detalhes do processo e, ao lado, o CLIENTE com TODAS as observações (mais novas primeiro) e anotação rápida.
- Intimações: filas, sistema e filtros numa barra só; na linha só Avisar / Conferido / Confirmar — o resto no ⋯; "Nada esperando o seu OK" não aparece mais.
- Início: números logo abaixo da faixa escura; "Seu dia" para TODOS os perfis (para fazer hoje, compromissos de hoje, a sua semana em gráfico);
  administração: "Equipe nesta semana" (barras) + rosca de prazos.
- Agenda: SEM prazos fatais (filtro "Prazos fatais" saiu; prazos ficam em Intimações). Documentos: cartão "Honorários" (Editar honorário → Cobranças ›
  Honorários; Fazer proposta).

## 8.35.2 Painel "mais futurista" (só painel; Code.gs continua 8.35.0) — pedido da usuária

- PÁGINA INTEIRA: `.app` sem largura máxima em todas as telas. `marcarAba` grava `body[data-tela]` (CSS por tela).
- Processos (`telaProcessos`): no topo "Processos" + busca própria + "+ Novo processo" numa linha (a barra de busca geral some nesta tela),
  uma LINHA reta, gráfico das ÁREAS (cartões com número e barrinha, clicar filtra), ETAPAS (barra segmentada + chips com contagem) e FILTROS
  À DIREITA (`px-lado`: andamento, tribunal, cliente, só com ato, Lista/Quadro, organizar). Lista em UMA linha por processo (Processo · Etapa ·
  Cliente · Área·tribunal · Próximo ato curto). Classes `px-*`.
- Intimações: tabela de prazos e intimações recebidas em linha reta e mais juntas (só CSS, `body[data-tela="prazos"]`, `.item-intim` em grade).
- Cobranças: painel do mês (`cbx-*`) — 4 números com % do previsto e barras (recebido, falta receber, em atraso + inadimplência, próximos 30
  dias), "Recebido nos últimos 6 meses" (colunas, `fin.painel`), rosca da situação do mês e atraso por tempo. RH continua só com contagens.
- "Atendimento" virou "CRM" (sub-aba "Funil"); topo do CRM mais curto, instruções escondidas.
- Relatórios: "Desempenho de cada pessoa" (mês, `relatorio.semana` per=mes) e "Funil do CRM" (etapas, novos e fechados no mês, % de fechamento).
- Paleta dos gráficos (`CORES_GRAF`, `.c-verde/.c-azul/...`) no grafite + dourado.

## 8.35.3 Velocidade com versões diferentes + Clientes com gráficos + visual mais escuro (só painel) — 16/11/2026

- CAUSA da lentidão de 15–16/11: o painel publicado (motor.js 8.35) ficou à frente do Code.gs instalado (8.34; a atualização automática falhava
  por falta da API do Apps Script). Com versões diferentes o banco era recusado e CADA tela ia duas vezes ao Google. Correção em banco.js:
  `carregarMotor(versão)` carrega `/painel/motor-<versão do servidor>.js` e o banco continua ligado; a versão do servidor fica em localStorage
  `painel_versao_servidor` (o motor certo já vem antes da entrada); sem o arquivo, `desligarPor(10 min)` (uma ida ao Google por tela, sem
  perguntar o banco de novo). REGRA: ao publicar Code.gs novo, GUARDE o motor anterior como painel/motor-<versão anterior>.js
  (`git show <commit>:painel/motor.js`) — é o que mantém o painel rápido enquanto o Google não instala a versão nova.
- Clientes (`painelClientes`): topo com 3 cartões — "Fechamentos da semana/mês" (escuro, filtro Semana|Mês pequeno DENTRO do cartão, `?per=mes`;
  colunas Fecharam × Não fecharam × Aguardando, pela aba Assinaturas `documentos.assinaturas` todas), "Contratos assinados · 6 semanas/meses"
  (colunas) e "Carteira" (total, com processo, parcela atrasada, cadastros a completar); linha reta; filtros numa linha com a busca PEQUENA
  (`busca-peq`); a barra de busca geral some em Clientes e Processos.
- Gráfico de colunas `grafCols` (HTML, cor pelo CSSOM; exportado no PAINEL_KIT): Processos por área (cartão escuro), Início (sua semana,
  equipe), Cobranças (atraso por tempo), Relatórios (desempenho), CRM ("Contatos por etapa", cartão escuro).
- Mais escuro (pedido da usuária: "muito claro"): fundo #ECE8E1, cabeçalho das tabelas grafite, barra de filtros de Intimações grafite,
  cartão "Recebido no mês" e "Recebido nos últimos 6 meses" escuros (`pc-escuro`).
- 8.35.4 Processos (pedido da usuária, com desenho): gráfico "Processos por área" maior, na largura toda (`px-areas-g`, alto 210); ETAPAS de novo
  em QUADROS (`px-etapa-cards`/`px-et`: número + nome, borda na cor da fase, rolagem com as setas ‹ ›, "Todas as etapas" primeiro); os filtros
  (andamento, tribunal, cliente, só com ato, Lista/Quadro, organizar) ficam escondidos no botão "⚙ Filtros" (`details.px-filtros`, com o número
  de filtros ligados; fecha ao clicar fora). Lista na largura toda.
- 8.35.5 (pedido da usuária): Processos abre SEMPRE no QUADRO com todas as etapas em colunas (como no CRM; Lista só pelo botão Filtros ›
  Ver como); os quadros de etapa para clicar saíram; gráfico das áreas compacto (alto 110).
- Modelo do contrato estragado (16/11/2026): em 11/11 alguém editou o MODELO do contrato de honorários no Drive (MODELO10_CONTRATO_ID) com os
  dados da VANESSA; todo contrato gerado depois saiu com o nome dela. O modelo foi restaurado com os campos {{…}}. Em Modelos o link virou
  "editar o MODELO (vale para todos)" e pede confirmação avisando para não pôr dados de cliente.
- 8.35.6 (pedido da usuária, com a foto do CRM): o quadro de Processos usa a MESMA aparência do CRM (`crm-quadro`/`crm-col`/`crm-card`:
  bolinha da cor da etapa, nome e número no topo da coluna, cartão com cliente, área/tribunal, nº e próximo ato; ← / → / Inicial feita aparecem
  ao passar o mouse).
- 8.35.7 (pedido da usuária: "muito feio… sem brechas"): o semáforo do robô em Intimações virou uma CENTRAL (`semaforoRobo`, classes `cr-*`):
  uma linha (bolinha, "Robôs em dia/funcionando/Atenção", última leitura e chips curtos das pendências); aberta mostra "O que fazer" (cada
  pendência com explicação curta e um botão: Ler agora, Ler o DJEN agora, Ver os N prazos → #/prazos?fila=conferir, Passo a passo para
  publicar a Nova versão no Google, "Já fiz: tentar de novo" → `sistema.atualizar`) e cartões por robô (Gmail, DJEN, Andamentos, Agenda,
  IA, tempo de robô, programa do Google). Aviso da API e da versão viram UM item; pendências do sistema só para a administração.
- 8.35.8 TRAVAMENTO de 16/11 (achado no painel REAL, entrando como Luis num navegador de teste): (1) a 1ª carga do banco levou 9,5 s e o
  limite era 9 s → 10 telas esperando a mesma carga contavam "3 falhas" e o banco era DESLIGADO por 5 min → tudo ia ao Google (10–80 s por
  pedido). Agora (banco.js): demorar NÃO é falha (`demorou`), várias telas contam UMA falha (3 s), TEMPO_PRIMEIRA 30 s / TEMPO_DEPOIS 8 s;
  a carga vai em PARTES em paralelo (tabela grande sozinha, pequenas de 4 em 4; "statement timeout" do Supabase → pede de novo uma vez);
  tabela lida há < 20 s não é pedida de novo (NO_LOTE_MS; antes 1,5 s) e qualquer gravação chama `PAINEL_BANCO.envelhecer()`.
  (2) o Início nunca se redesenhava: um <details> criado já aberto dispara "toggle" com isTrusted e ligava `sujo` → "Seu dia" ficava em
  "Carregando…" para sempre. Agora só conta como mexer o toggle até 1,5 s depois de clique/tecla (`ultimoGesto`), e o redesenho acontece
  sempre que o Início ainda tem "Carregando…" quando o resto chega. TESTE NO PAINEL REAL: navegador com timezoneId America/Sao_Paulo (fora
  do fuso de Brasília o banco desliga de propósito). A função do Supabase (Etapa C/D) ficou DESLIGADA (painel_estado edge/login_edge = nao)
  até ser testada de novo; leituras = motor do navegador, gravações = Apps Script.
- 8.35.8 Calculadora de rescisão (site e painel, pedido da usuária): "A empresa depositou o FGTS?" Sim / Não (nenhum mês) / Só em parte (meses) /
  Não sei. Não depositado = 8% × salário × meses × (1 + 1/12 do 13º + 1/36 do 1/3 de férias), no máximo os últimos 60 meses (STF, Tema 608);
  o saldo estimado da conta conta só os meses depositados; bloco próprio "FGTS não pago — o que a empresa deve (separado da multa)":
  depósitos que faltaram, multa de 40%/20% sobre eles e o total.
- 8.35.8 (cont.): no máximo 3 leituras ao banco ao mesmo tempo (`naFila`: com 10+ juntas o Supabase cortava por "statement timeout");
  agenda que caiu no Google por falta de cópia (CalendarApp) tenta o banco de novo em 5 min (antes ficava 12 h em `banco_fora_*`, 60 s por
  tela; as anotações antigas de agenda/início/audiências são apagadas ao abrir); função do Supabase que responde "desligado" não é mais
  perguntada por 30 min. Medido no painel REAL (Luis, 16/11 ~15h50 UTC): todas as telas 0,5 s; Início 11 s só na 1ª entrada; login pelo
  Google 8–38 s (o Apps Script está lento: tempo de robô 57/90 min no dia).
- 8.35.8 (fim, 16/11 ~16h UTC): a função "painel" do Supabase NÃO tinha erro (functions.combined-stats do dia: 0 erros 5xx); os 500 vistos no
  navegador eram o `painel_ler` cortado pelo statement_timeout do papel `anon` (3 s). `alter role anon set statement_timeout = '15s'` (só tempo;
  as tabelas seguem fechadas por RLS) e a função foi RELIGADA (painel_estado edge/login_edge = sim). Medido no painel real: 1ª entrada 7 s
  (Google), da 2ª em diante 1,8 s pela função; Início pronto em ~7 s; telas 0,5 s; nenhum erro. Registros da função: Management API
  `analytics/endpoints/functions.combined-stats?function_id=…&interval=1day` (as tabelas function_logs/edge_logs não existem mais no endpoint logs).
- 8.35.9 (pedido da usuária): "Aguardando o seu OK" SEMPRE à vista para a administração — no Início logo abaixo dos números (lista aberta, até 8
  itens com OK/Devolver, "ver todos em Intimações") e em Intimações; vazio = faixa verde "✓ Aguardando o seu OK: nada · a equipe está em dia"
  (`blocoAguardandoOk({ inicio })`, `.aguarda-vazio`, `.aguarda-ini`).

## 8.36.0 Quem faz o quê + avisos no canto + atalhos (pedidos da usuária, 16/11/2026)

- Distribuição automática (Code.gs): Config DISTRIBUICAO (JSON) = { prazo: {trabalhista, civel, familia, previdenciario, criminal, outros: [usuarios]},
  inicial: {mesmas áreas}, secretaria: [usuarios] }. `areaDist_` (área do processo; sem área: nº ".5." = trabalhista, ".4." = previdenciário),
  `quemDa_(tipo, area, numero)` (só usuários ativos; 2+ pessoas → quem tem MENOS prazos abertos + tarefas ativas, `cargas_` com 5 s de
  memória), `respInicial_(area)`. Entra em `responsavelPadrao_`/`atribuirResponsaveis_` (prazos do robô), nas 4 criações de petição inicial
  e no `respSecretaria_` (assinaturas, retomar contato, avaliação, avisos de audiência…). Sem ninguém marcado valem RESP_PJE/RESP_EPROC/
  RESP_INICIAL/RESP_SECRETARIA. Rota `distribuicao.config` (administração; salvar + "distribuir agora os prazos sem responsável").
- Tela "Quem faz o quê" (#/distribuicao, menu do NOME, só administração): chips da equipe por área com a carga aberta de cada um; na 1ª vez já
  vem marcada a divisão descrita pela usuária (Lara trabalhista; Davi e Jennifer cível; Jennifer família; Gustavo previdenciário; perfis
  secretario/rh na secretaria) — confere e salva.
- Avisos discretos no canto (`iniciarNotificacoes`/`mostrarNotif`, `.notifs`): administração e secretaria/RH; de 90 em 90 s (aba visível) PIX
  dos últimos 2 dias ("PIX de R$ 500 recebido · MARIA · baixado ✓") e, para a administração, intimações novas; ids vistos em localStorage
  `notif_vistos_<usuario>` (1ª vez marca tudo como visto); mais de 3 juntos viram 1 aviso; some em 12 s; clicar abre a tela.
- Atalhos de teclado (`atalhosTeclado`): "?" mostra a lista; g i/c/p/n/t/a/u/f/d/r = Início, Clientes, Processos, Intimações, Tarefas, Agenda,
  Audiências, Cobranças, Documentos, CRM; n c/p/z/a = novo cliente/processo/prazo/compromisso; Ctrl+K busca (não age dentro de campos).
- Motor anterior guardado em painel/motor-8.35.0.js.


## 8.36.1 Configurações, valores em reais, parcelas editáveis (pedidos da usuária, 16/11/2026)

- Atalhos de teclado RETIRADOS (pedido da usuária: "bem feios"); Ctrl+K da busca continua.
- Menu do NOME: só "⚙ Configurações" e Sair. Tela #/configuracoes (`telaConfiguracoes`) em tópicos: Minha conta (senha, WhatsApp neste
  computador, ver o site) · Equipe (Gerenciar acessos, Quem faz o quê, o que cada um fez; administração) · Cobrança (Boleto e Pix automático,
  PIX, recibos) · Robôs e sistema (central dos robôs, banco novo, chatbot, marketing) · Edifício Future. Os ids antigos do menu ficam escondidos
  em index.html (o código que os usa continua funcionando).
- O nome da plataforma de cobrança NÃO aparece na tela: "Boleto e Pix automático" / "plataforma de cobrança" (o código interno segue asaas_*).
- Valores em reais como maquininha: todo campo de R$ (`data-moeda`, ou inputmode decimal com R$ no rótulo/placeholder) — digitar 320000
  mostra 3.200,00 (ouvinte global em painel.js; `formatarMoeda`). Calculadoras do site também. No servidor `dinheiro_` lê "3.200" como três mil
  e duzentos (antes 3,2).
- Honorário: "✎ Corrigir parcelas em aberto" (data e valor de cada parcela, "Mesmo valor para todas", salva e acerta o valor total). Em 16/11 os
  honorários do Aílton e do Leandro de Souza tinham parcelas de R$ 0,40 → corrigidas para R$ 400,00 (total R$ 3.200,00).
- Edifício Future: caução é R$ 1.750,00 ou R$ 3.500,00 (conforme a pessoa) — botões rápidos no contrato, padrão 1.750,00.
- Motor anterior guardado em painel/motor-8.36.0.js.
- 8.36.2: a atualização automática pula a etapa do Supabase quando a função "painel" já responde com a versão nova (publicada pelo Claude/GitHub): a chave de gestão vencida não trava mais o Google. Motor anterior em painel/motor-8.36.1.js. "Precisa de ação agora" do Início virou uma linha (`acoes-mini`: chips com o total por tipo, só os urgentes aparecem, até 3; "ver todos" abre a lista em linhas curtas).
- 8.36.3 (16/11, "ainda trava"): a ENTRADA era o gargalo — ia ao Google (10 a 23 s; às vezes mais de 2 min) porque o navegador só aprendia o
  endereço da função do Supabase depois de entrar uma vez pelo Google. Agora painel/config.js traz `window.PAINEL_EDGE` (endereço da função +
  chave PÚBLICA sb_publishable_, feita para o navegador) e `cfgEdge` usa como reserva: entrada em ~3 s desde o 1º acesso. Login pelo Google
  (reserva) mostra aviso depois de 45 s em vez de ficar parado; espera da entrada pelo Supabase 12 s (antes 8). Trocou a chave pública ou o
  projeto do Supabase? Atualize config.js.

## 8.36.3 (16/11/2026 noite) Banco lento achado e corrigido + PDF + calculadora

- CAUSA do "trava": o banco do Supabase (instância pequena) estava sobrecarregado. pg_stat_statements: `painel_tabela` (o Google lendo tabelas
  INTEIRAS) foi chamada 13.718 vezes = 2,3 h de trabalho do banco; uma consulta simples chegou a 47 s. Correções: (1) `aquecerMemoria_` não
  roda mais com o motor do Supabase ligado (`sbEdge_()`: a memória do Google nem é usada — era milhares de leituras inteiras por dia jogadas
  fora e tempo de robô gasto), no aquecerGatilho e no roboRapidoGatilho; (2) `painel_tabela`/`painel_tabelas` mais leves (leitura-rapida.sql:
  colunas por `painel_cols_` via pg_attribute, json em vez de jsonb, sem `res || jsonb` em loop): intimações 607→319 ms, processos 420→117 ms.
  As duas funções mudaram de jsonb para json (o arquivo apaga a versão jsonb antes de criar). Para olhar o banco: Management API
  `/database/query` com `select … from pg_stat_statements order by total_exec_time desc`.
- PDF/documentos davam "Sem resposta do banco de dados ao gravar (o motor do Supabase demorou)": a rota passava pela função do Supabase, que só
  descobria no meio que precisava do Google. Agora gerar.mjs calcula as rotas que usam Drive/Docs/Gmail/Agenda/internet (`google` no motor.js,
  55 rotas: documentos.gerar, clientes.salvar, fin.parcela.pagar, ia.*, future.contrato.*…) e o painel manda essas DIRETO ao Apps Script.
  Ficam fora (`NAO_FORCAR`) as gravações frequentes que só às vezes usam o Google (trabalho.conferir, processos.salvar…). Gravação pela função:
  3 tentativas com o MESMO pedido (25 s, 25 s, 60 s) antes de qualquer erro. Leitura pela função: corrida — passou de 6 s, pede também ao
  Google e vale o primeiro; demorar não desliga mais a função por 3 min. `naFila` = 6 leituras ao mesmo tempo. Cobranças e Relatórios
  (`fin.painel`, `relatorio.geral`) entraram no motor do navegador (3 s em vez de 20 s).
- Calculadora de rescisão (painel): é CÁLCULO, não "pago no TRCT": "Verbas rescisórias devidas (valores brutos)" + subtotal, "FGTS devido pela
  empresa" (mês da rescisão, aviso, não depositado, multa 40%/20% com o motivo escrito) + subtotal e "VALOR TOTAL A SER PAGO PELA EMPRESA";
  INSS só em "Para conferência". Rescisão indireta mostra alerta âmbar (`.calc-alerta`): cálculo para a petição, valores brutos, depende do juiz.
  FGTS não depositado não conta mais duas vezes o mês da saída e o 13º do ano da saída (site e painel).
- Token de gestão do Supabase: NÃO precisa trocar mais (só trocamos porque ele apareceu no chat). Fica no formulário seguro desta nuvem e em
  Gerenciar acessos › Banco novo (SUPABASE_GESTAO).
- 8.36.4: TEMPO DE ROBÔ — em 16/11 os gatilhos usaram 110 min (o Google para TODOS os robôs aos 90 min/dia; o robô de hora em hora parou às
  14h12). `aquecerGatilho` (10 em 10 min) ficou leve: `aquecerAgenda_` e `roboExtrasAtualizar_` só de 30 em 30 min (Properties
  AQUECER_PESADO_EM) — a agenda sai antes se o painel mudou algo (Config AGENDA_COPIA vazia); sem aquecerMemoria_ com o motor ligado.
  Depois da correção, pg_stat_statements: ~2 s de trabalho do banco em 10 min (antes: horas).
- 8.36.5 (16/11 ~19h20 UTC, "equipe inteira sem entrar"): CAUSA REAL DO TRAVAMENTO — `painel_aplicar` levantava o conflito de linha com
  errcode '40001' (serialization_failure) e o PostgREST REPETE sozinho, sem parar, o pedido com esse código: ~170 chamadas/s de
  painel_aplicar_pedido (medido com contadores), 820 mil rollbacks, banco a 16–47 s por consulta. Agora o conflito usa errcode 'PT409'
  (o PostgREST devolve HTTP 409 e não repete); servidor.js aceita '40001' ou 'PT409'. NUNCA usar 40001/40P01 em raise de função chamada
  pelo PostgREST. Depois: zero rollbacks em 10 s, entrada em 5,8 s.
- 8.36.6: "Erro interno (motivo técnico curto)" — o doPost mostra a mensagem do erro, para a equipe mandar o print. Achado com isso: o script foi
  ligado ao projeto do Google Cloud 895531255553 (para a atualização automática) e a API do Google Drive precisava ser ativada nele
  ("Permission denied while enabling APIs: drive") — a usuária ativou em 16/11. Trocou de projeto? Ative lá as APIs que o script usa.
- 8.36.7 (pedido da usuária: "contrato previdenciário muito grande, às vezes 1 página e meia"): contrato previdenciário em UMA folha, no formato do
  contrato de honorários (`umaFolha: 'mini'`, cláusulas com título junto, mesmas regras; chave MODELO11_CONTRATO_PREV_ID). E TODO documento de
  uma folha é conferido depois de gerado: `caberUmaFolha_` conta as páginas do PDF (`paginasPdf_`) e, se passou de 1, diminui meio ponto da letra,
  os espaços e as margens de cima/baixo e gera de novo (até 4 vezes, letra mínima 8,5). "Padrão do escritório" no contrato não é apertado.
- 8.36.8: nome do arquivo gerado nunca sai "undefined" (`NOMES_ARQ` ganhou o contrato previdenciário; sem nome na lista usa o nome do modelo).
  Motor anterior em painel/motor-8.36.7.js.

## 8.37.0 Ação de cobrança como aba + prazos do "Advogado" para a equipe (pedidos da usuária, 16/11/2026)

- Cobranças: aba principal "⚖ Ação de cobrança" (ao lado de Atrasadas; saiu de Ferramentas). Cliente com parcela atrasada marcada
  `cobranca = 'acao'` (`clientesEmAcao_`) SAI de "Atrasadas", do total "Em atraso", das faixas e das cobranças do Início; vai para a TABELA
  da aba (parcelas, total, mais antiga, prescrição, dados para a ação, WhatsApp/Notificação/Honorário/"↩ Voltar para atrasadas"). Embaixo,
  "Podem ir para a ação" (atraso > 60 dias). Marcar uma parcela manda o cliente inteiro (`cobrancaParcela_`). fin.resumo devolve `emAcao`.
- `distribuirAdvogado837_` (robôs do escritório, uma vez, Config FIX_DIST_837): sem "Quem faz o quê" salvo, grava a divisão da usuária (Lara
  trabalhista; Davi e Jennifer cível, criminal e outras; Jennifer família; Gustavo previdenciário; secretaria = perfis secretaria/RH) e passa os
  prazos abertos e as tarefas ativas do usuário genérico "Advogado" (`GENERICOS_DIST`) para quem cuida da área do processo; lembretes ao
  cliente → secretaria. Motor anterior em painel/motor-8.36.8.js.
- 8.37.1 (pedido da usuária: "não falei para apagar essa etapa — é importante saber se foi feita ou não"): a tabela "Em ação de cobrança" voltou a
  mostrar as ETAPAS da cobrança, cada uma ✓ com data e quem fez (clique marca/desfaz): 1 WhatsApp (mensagem_em das parcelas), 2 Notificação e
  3 Ação ajuizada (aba Avisos, chave `acaocob:<cliente>:notificacao|ajuizada`, rota `fin.acaoCobranca.marcar` acao=notificacao|ajuizada|desfazer_*),
  + "último aviso / nunca avisado". Os cartões de sugestão continuam com a etapa sugerida.

## 8.37.2 Audiências com 4 avisos, intimações mais claras, WhatsApp Web pela extensão (pedidos da usuária, 16–17/11/2026)

- QUATRO avisos ao cliente por audiência/perícia: "audiência nova" (assim que aparece) + 1 semana antes + véspera + no dia (`AVISOS_ATO`).
  `avisoDevido_(…, nova)`: o "nova" vale antes da janela da semana. Ato novo = Eventos.criado_em ou Audiencias.visto_em depois de Config
  AVISO_NOVA_DESDE (1ª rodada só anota; os que já existiam não geram "nova"). `lembrarAudiencias_` de 2 em 2 h (Properties AVISO_NOVA_EM) olha
  até 90 dias (= o que a cópia da agenda tem) e cria a ficha com `visto_em`; tarefa "📅 AUDIÊNCIA NOVA — avisar o cliente" (`[lembrete:chave|nova]`
  + `[avisonova]`). Colunas novas em Audiencias: visto_em, aviso_nova_em, aviso_nova_por. `agenda.avisado` aceita quando=nova; textoAvisoAto "O juízo marcou…".
- Designadas SEM data no aviso (PJe sigiloso): `atosSemData_` (tarefas abertas com `[agenda:`; tipo pela marca `[atosd:pericia|audiencia]` — o título
  fica escondido no navegador para quem não é administração) → topo da tela Audiências e bloco "📅 Audiências novas — avisar o cliente" do Início
  (`inicio.extras` devolve `audNovas` e `audSemData`) com "📅 Lançar a data" (`caixaMarcarAto`).
- Sem audiência repetida: `marcarAto_` usa o evento que já existe no Google (mesmo nº, dia e hora: `eventoGoogleDoAto_`) em vez de criar outro;
  `limparAtosDuplicados837_` (uma vez, Config FIX_ATOS_DUP_837) apagou os eventos do robô que tinham gêmeo lançado à mão; a Agenda mostra uma vez só
  o mesmo processo no mesmo horário (`semRepetidosAgenda`) e não acusa conflito entre eles (`mesmoProcesso`).
- "Intimação de audiência" NÃO é mais cancelada pelo robô (fica nos prazos para conferir); a categoria saiu do automático e da revisão marcada.
- Intimações: célula "O que fazer" (`celulaOQueFazer`/`oQueFazer`): em cima o ATO (no provisório, o que a IA leu), etiqueta "provisório · 5 dias úteis",
  "⚠ IA leu outro prazo", ciência e quem cuida; botões em coluna (não cortam). Tela do prazo: título = o ato + `passosPrazo` (conferir no tribunal →
  fazer até a meta → avisar o cliente → Conferido → OK).
- WhatsApp Web: o WhatsApp não deixa o painel reaproveitar a aba dele (cada clique abria outra aba com "Usar aqui"). Extensão 1.2.0 (`ponte.js` no
  painel + `abrirWhats` no bg.js): o painel manda `postMessage({araujo:'whats'})` e a extensão abre a conversa NA ABA JÁ ABERTA (chrome.tabs.update),
  com a mensagem escrita. Sem a extensão, continua o caminho antigo + uma dica. Zip refeito (painel/extensao-whatsapp.zip).
- Ação de cobrança 8.37.1: etapas WhatsApp → notificação → ação ajuizada de volta na tabela (ver acima).

## 8.37.3 Processos (desfazer, apagar, várias ações, partes), petição inicial automática, PIX, prazo pelo texto (pedidos da usuária, 17/11/2026)

- Desfazer: "↩ Fechou sim" (rota `processos.fechouSim` / `documentos.assinatura` acao=fechou: `reabrirInicial_` volta a inicial arquivada pelo
  "Não vai fechar", reabre a tarefa e relança o honorário do JSON da Assinatura) e "↩ Desfazer 'Assinado'" (acao=desfazer_assinado: volta para
  aguardando, APAGA a inicial sem número e tira o honorário lançado ao assinar se nada foi pago). Na jornada da ficha e na tela do processo.
- "🗑 Apagar este processo (não foi protocolado)" (`processos.apagar`, `apagarProcessoSemNumero_`): só processo SEM número; cancela as tarefas
  dele; honorário não é mexido. `caixaDesfazerProcesso` na tela do processo.
- Várias ações por cliente: aviso na ficha quando a área do cadastro não tem processo ("＋ Abrir a ação de …"). Caso do Jucemar: o contrato
  trabalhista de 05/11 foi juntado ao previdenciário pela regra antiga (corrigida na 8.21).
- `identificarPartes_` (robôs do escritório, 12 por rodada; Properties PARTES_TENTADAS, 20 dias): processo ativo sem cliente → lê o DJEN
  (Intimacoes.texto) e o e-mail do PJe no Gmail ("RECLAMANTE(S): - FULANO ADVOGADO(S): - JULIAN…"); `parteDoEscritorio_` acha a parte
  da Dra. Júlian → liga ao cadastro de mesmo nome ou cria (origem "processo (identificado pelo robô)") e grava o polo. O e-mail do eproc
  não traz as partes; SIGILO fica de fora.
- Petição inicial: tarefa `[inicial:]` tem `wa` = inicial ("📄 Mandar a inicial ao cliente", mensagem para aprovar). Protocolou
  (`concluirPeticaoInicial_`) → tarefa "📣 Avisar o cliente: processo protocolado" (`[protocolo:procId]`, botão abre o processo com
  ?avisar=1: número + link + código); fecha sozinha quando a mensagem é mandada (`registro.whatsapp` com processo_id). `iniciaisComNumero_`
  (robôs): processo na etapa Petição inicial COM número → Em andamento. `salvarProcesso_`: processo novo com número para cliente que tem a
  inicial sem número (mesma área) → o número entra nessa inicial (`juntou`), sem processo repetido (`d.separado` evita).
- PIX: `explicarPixDesconhecido_` (parte contrária de um processo = acordo/condenação; transferência do escritório; pagador recorrente;
  mesmo sobrenome) e "É de X, mas não tem parcela em aberto" com "＋ Lançar como recebimento deste cliente" (`fin.pixAvulso`: parcela paga
  avulsa no honorário mais recente ou num "Recebimentos avulsos (PIX)", com recibo).
- Prazo divergente: `prazoPublico_` devolve `fatal_texto`/`dias_texto` (data pela conta com os dias que a IA leu no texto) → etiqueta
  "✓ pelo texto: dd/mm" ao lado; a data do painel continua valendo (a mais curta).
- 8.37.4: ATUALIZAÇÃO AUTOMÁTICA consertada — a conferência depois de publicar usava `ScriptApp.getService().getUrl()`, que no GATILHO devolve um
  endereço que pede login: toda atualização automática "não respondia" e voltava (de 8.36.8 a 8.37.3 ficou na 8.36.7; só o botão "Atualizar agora"
  instalava). Agora confere em https://script.google.com/macros/s/<implantação>/exec e espera até ~1 min (6 tentativas). A 1ª instalação desta
  correção precisa do botão (o código antigo ainda confere do jeito errado).

## 8.37.5 Função do Supabase com DOIS motores (pedido da usuária: "olhe tudo para não travar mais", 17/11/2026)

- CAUSA achada: o Google ficou na 8.36.7 (a atualização automática falhava; a correção 8.37.4 precisa de UM clique em "Atualizar agora") e a
  função do Supabase estava na 8.37.4. Com versões diferentes a função recusava tudo: a ENTRADA e CADA GRAVAÇÃO iam ao Google (4 a 40 s), e
  cada F5 pedia a sessão do banco de novo ao Google.
- Agora a função leva `motor.js` (versão nova) + `motor-anterior.js` (a versão que o GOOGLE roda), e roda o motor da versão que o navegador
  pede (`servidor.js`: `extras`, `motor(v)`, ping devolve `versoes`). Na entrada usa a marca painel_estado `google` (o Code.gs grava com
  `sbVersaoGoogle_` no aquecedor, no robô de hora em hora e logo depois de se atualizar; painel_login_info devolve a marca). index.ts carrega o
  anterior por import dinâmico (faltando, segue só com o novo). `supabasePublicar_` e publicar-edge.mjs mandam também o motor-anterior.js.
- Gerar o anterior: `node .github/motor/motor-anterior.mjs <versão que o Google roda>` (usa o Code.gs e o gerar-edge.mjs daquela versão,
  tirados do git). REGRA ao publicar: se o Google ainda não está na versão nova, gere o anterior com a versão dele antes de publicar a função.
- banco.js: a sessão guardada vale também quando é da versão do servidor lembrada (F5 não vai mais ao Google).
- Teste: `.github/motor/teste/etapaVersoes.mjs` (telas e gravação pelos dois motores; versão desconhecida volta ao Google).

## 8.38.0 Abrir e trocar de aba na hora (pedido da usuária: "demora pra entrar, pra abrir, pra trocar de aba", 17/11/2026)

- Medido: Supabase (função e banco) responde em 0,1–0,3 s; a demora era o navegador baixar TODAS as tabelas (~7 MB: intimações 2,4 MB,
  processos 2,8 MB, clientes 0,8 MB…) a cada entrada antes de mostrar o Início, e jogar tudo fora ao fechar o navegador. No banco real só
  ~5–10% das linhas mudam por dia.
- Cópia local criptografada (banco.js, `carregarGuardado`/`guardarAgora`): as tabelas lidas ficam no IndexedDB `painel_cache` cifradas com
  AES-GCM; a chave vem de `painel_cache_chave(p_token)` (leitura-rapida.sql 8.38, tabela painel_cache_chaves sem acesso do anon; uma chave por
  pessoa + sessao_versao: trocar senha/perfil, desativar ou "Desconectar agora" troca a chave e a cópia antiga é apagada). Na entrada seguinte
  só vem o que mudou (`desde`; a conferência de chaves tira o que sumiu). Assinatura da cópia = versão do motor + pessoa + perfil + permissões
  (mudou → baixa tudo). Guarda 4 s depois de chegar algo novo e ao fechar a aba; cópia com mais de 20 dias é ignorada. Sair limpa a memória;
  a cópia cifrada fica (sem login não abre).
- Trocar de aba: se tudo o que a tela usa foi conferido há menos de 3 min (`FRESCO_MS`) e ninguém gravou desde então, a tela abre na hora
  e confere o que mudou por trás; gravar (`envelhecer`) força a conferência antes da próxima tela.
- Teste: `.github/motor/teste/copiaLocal.js` (Chromium com perfil guardado: 2ª entrada 2 KB × 1.749 KB; o que mudou com o navegador fechado
  aparece; senha trocada não usa a cópia). Precisa de `python3 -m http.server 8099` na pasta do site.

## 8.38.0 (cont.) Conferência geral de 17/11/2026 (pedido da usuária: "deixe tudo alinhado")

- Tudo na 8.38.0: Google (instalou sozinho às 10:39), função "painel" do Supabase (8.38.0 + motor anterior 8.37.5) e o site. painel_estado
  google = 8.38.0. esquema.sql e leitura-rapida.sql rodados de novo no banco real sem erro. Planilha de reserva = banco (mesma última linha e
  mesmo id em Clientes, Processos, Prazos, Intimações e Tarefas). Banco: 23 MB, região São Paulo, sem complementos pagos.
- DJEN: o CNJ recusa (403) GitHub, Google E Supabase São Paulo (teste com função temporária, já apagada). O robô do DJEN no GitHub saiu do
  horário automático (só à mão); o DJEN é lido pelo painel aberto em qualquer computador do escritório. Os avisos do PJe/eproc chegam pelo Gmail.

## 8.39.0 WhatsApp sem Cloudflare, DJEN pela extensão, chat da equipe (pedidos da usuária, 17/11/2026)

- Ponte do WhatsApp no SUPABASE (função `whatsapp`, supabase/functions/whatsapp/index.ts; publicar com `FUNCAO=whatsapp node .github/motor/publicar-edge.mjs`):
  verificação do Meta (GET hub.challenge com o token de verificação), assinatura X-Hub-Signature-256 com o App Secret, responde 200 na hora e
  entrega em segundo plano ao Apps Script (whats.webhook). Segredos no COFRE do Supabase (`painel_whats_gravar`/`painel_whats_info`: verify,
  secret, ponte, url). `whatsConfig_` aceita `app_secret` (Properties WHATS_APP_SECRET), gera WHATS_VERIFY e manda tudo ao cofre
  (`whatsPonteSupabase_`, só quando muda: WHATS_SB_SYNC); devolve `urlRetorno` (…/functions/v1/whatsapp) e `verifyToken` para colar no Meta.
  A Cloudflare (chatbot/worker.js) fica só de reserva. Em 17/11: WHATS_PHONE_ID já salvo, nenhuma conversa recebida (faltava o webhook).
- DJEN pela EXTENSÃO do Chrome 1.3.0 (`lerDjen` em extensao-whatsapp/bg.js, `chrome.alarms` de 15 em 15 min, lê se passou 2 h): basta o Chrome
  aberto no escritório (o CNJ recusa Google/GitHub/Supabase). Rotas `ext.djenConfig` (devolve também `ultima` leitura boa: se o painel leu há
  < 2 h, ela não lê) e `ext.djenImportar` (= djenImportar_; Config DJEN_EXT_ULTIMA). Popup: "Ler o DJEN deste computador" (storage `djen`) e
  "Ler o DJEN agora". Manifest ganhou `alarms` e comunicaapi.pje.jus.br — a extensão precisa ser atualizada no Chrome (zip novo).
- CHAT DA EQUIPE (#/chat, menu Escritório › "Chat da equipe"): abas Chat (id, sala, de, texto, em, apagado) e ChatLidos (id = usuário|sala, em).
  Sala "geral" (Equipe toda) e "dm:<usuário>|<usuário>" (em ordem; só os dois veem — `chatSalaOk_`). Rotas `chat.listar` (leitura), `chat.enviar`,
  `chat.lido`, `chat.apagar` (só quem escreveu). Navegador: `iniciarChat` pergunta de 15 em 15 s ao banco `painel_chat_ping(p_token)` (chave
  pública + sessão do banco; não lidas + última mensagem; sem a função do Supabase) → número vermelho no menu (`chatBadge`) e aviso no canto
  (💬); sem o banco, pergunta ao servidor a cada 60 s. Mensagem aparece na hora ("enviando…"); Enter envia, Shift+Enter pula linha; links
  clicáveis. Teste: `.github/motor/teste/etapaChat.mjs` (Apps Script e Supabase iguais; privacidade das conversas a dois; ping; apagar).
- 8.39.8: "Pessoas e acessos" abre sem esperar o quadro "Segurança dos dados" (rota `seguranca` = Drive + Log inteiro, lenta; o quadro aparece
  sozinho depois). Cadastro do cliente no painel com campo BAIRRO próprio (não é coluna: entra no fim de `endereco`, "Rua X, nº 10, Centro";
  o CEP preenche; obrigatório no cadastro novo). O /cadastro/ do site já tinha Bairro.
- 8.39.7 (pedido da usuária: "tem diversas pessoas que são tanto trabalhista quanto previdenciário"): "✓ Assinado" (`cartaoAssinatura`) abre
  "O cliente também vai ter outra ação?" com ＋ Trabalhista/Previdenciário/Cível/Família/Criminal; `documentos.assinatura` acao=assinado com
  `outras` → `abrirAcaoCliente_` por área (`AREAS_ACAO_`; não repete a inicial sem número da mesma área), cada uma com a tarefa da inicial do
  responsável da área. Jucemar Machado Rodrigues (17/11): ganhou a inicial TRABALHISTA (Lara) além da previdenciária (Gustavo).
- 8.39.6 (17/11, "está travando todas as páginas"): o banco GRATUITO do Supabase ficou sem força (conta de 0,1 s levando 2–4 s). Quem mais
  pesava: o Google lendo ~50 tabelas INTEIRAS por minuto (`painel_tabela`). Agora `sbPrecarregar_` pergunta antes a assinatura da tabela
  (`painel_assinaturas`: linhas | último _em | maior _n — consulta pequena) e, se for a mesma, usa a cópia guardada no CacheService do Google
  (`sbtDoCache_`/`sbtGuardar_`, pedaços de 30 mil letras, 2 min; Usuarios nunca é guardada). E o chat não pergunta mais ao Google quando o
  banco não responde (era 1 pedido por pessoa por minuto). Plano pago do Supabase (Pro + Small) recomendado à usuária.
- 8.39.4 (pedido da usuária): "Chat da equipe" SAIU do menu da esquerda (só a bolinha de baixo; #/chat continua abrindo). A bolinha e o topo da
  janela se ARRASTAM para qualquer lugar (pointer events; localStorage `chat_pos` = {r, b} distância da direita/de baixo; `posicionar` nunca
  deixa a janela sair da tela); duplo clique na bolinha volta ao canto.
- 8.39.3: Início SEM relatório (pedido da usuária): saíram "A sua semana" (Seu dia) e "Equipe nesta semana"; ficam em Relatórios. Colaborador continua com "O que eu fiz nesta semana".
- 8.39.1 (pedido da usuária, com print: "chat pequeno no canto direito de baixo, que dê para aumentar e diminuir, e quando alguém mandar
  mensagem aparecer"): o chat virou JANELA FLUTUANTE (`montarChatFlutuante` em painel.js, classes `chatf-*`): bolinha "💬 Chat" no canto
  direito de baixo com o número de não lidas → janela PEQUENA (360 px: lista OU conversa, "‹" volta) → GRANDE (⤢: lista e conversa lado a lado;
  ⤡ diminui) → "—" minimiza. Estado em localStorage `chat_modo`/`chat_sala`/`chat_vista`. Mensagem nova de outra pessoa com a janela
  minimizada → abre sozinha, pequena, na conversa dela (sem roubar o cursor; a bolinha pisca). Menu "Chat da equipe" e #/chat abrem a janela
  (a tela inteira saiu). Avisos do canto (`.notifs`) subiram para não ficar em cima da bolinha. Celular: a janela ocupa a tela.

## 8.40 Auditoria de estabilidade (17/11/2026, pedido da usuária: "auditoria geral")

- Sessão sem fila: `painel_tocar_sessao_` (UPDATE … FOR UPDATE SKIP LOCKED, no máx. 1×/min) no painel_ler e no painel_quem. Antes a 1ª
  leitura do minuto segurava a linha de painel_sessoes até o fim da leitura e as outras abas da mesma pessoa esperavam (teste: 3,3 s → 24 ms).
- Supabase advisors: painel_ler/painel_chat_ping/painel_cache_chave ficam abertas ao `anon` DE PROPÓSITO (o navegador usa a chave pública; cada
  uma confere o hash da sessão, prazo, pessoa ativa, perfil e sessao_versao) e saíram do `authenticated` (não usado); search_path fixo em
  painel_marcar_em_ e painel_login_falhas_; as 43 políticas com `(select auth.jwt())` (DO no fim do leitura-rapida.sql + esquema.sql).
  Tabelas com RLS e sem política (painel_sessoes, painel_estado, painel_pedidos, painel_cache_chaves, escritorios) = fechadas de propósito.
  Proteção de senha vazada (HIBP) só existe no plano Pro do Supabase — o painel não usa o Supabase Auth (login próprio, 5 erros bloqueiam).
- Índices conferidos: cada tabela tem (escritorio_id, id) + (escritorio_id, _em); tabelas pequenas (≤ 3,3 mil linhas) — nada a criar.
- Cópia das funções/políticas/permissões de antes, para voltar: scratchpad da sessão (backup-8.40).
- 8.41 Calculadora de rescisão (pedido da usuária, com exemplo): MOTOR ÚNICO `assets/rescisao-motor.js` (`window.RESCISAO.calcular`), usado pelo
  site (assets/calculadoras.js) e pelo painel (gestao.js `calcRescisao`/`tabelaRescisao`; a conta antiga `contaRescisao` saiu). Rescisão indireta =
  dispensa sem justa causa com aviso indenizado (30 + 3/ano, máx. 90) e projeção para 13º e férias; férias de CADA período completo não
  gozado (simples ou EM DOBRO se o concessivo acabou antes da ruptura) + proporcionais; 13º do ano anterior não pago em linha própria fora do
  subtotal; FGTS em bloco: contratual (só conferência se não informaram falta de depósito — não presume), diferença a depositar, FGTS do aviso,
  FGTS do 13º da projeção e multa 40% SÓ sobre o contratual (Tema 255); "FGTS já calculado em outro pedido" não soma a diferença; multas 467/477
  em campos próprios (só entram marcadas). Cada linha mostra a conta; arredonda cada parcela a 2 casas. Teste da usuária: adm 01/06/2025,
  ruptura 27/08/2026, R$ 2.860 → 2.574,00 + 3.146,00 + 2.145,00 + 3.813,33 + 1.271,11 = 12.949,44; FGTS aviso 251,68; 13º/2025 1.668,33 (conferido).

## 8.42.0 Central de Prazos e Intimações + fila da IA + sem baixa indevida (pedidos da usuária, 17/11/2026)

- CENTRAL DE PRAZOS (#/central, menu Escritório › "Central de Prazos", `telaCentral` em painel.js, classes `central-*` e cores `k-*` — NÃO usar
  `c-*`, que é dos gráficos): cartões clicáveis (novas 48 h, aguardando leitura da IA, intimações aguardando conferência, provisórios/conferir,
  calculados não confirmados, confirmados, vencem hoje, próximos 3 dias, vencidos SEM comprovação + baixados em lote, audiências e perícias
  designadas, perícias aguardando designação (pela IA), sem data/horário, falhas da IA + sem texto/sigiloso, falhas de captura) + filtros
  (cliente/nº, tribunal, responsável, ato) + `semaforoRobo` + linha "Captura" (fila e falhas da IA). Só lê (prazos.listar, intimacoes.listar,
  audiencias.listar, resumo); nada muda sozinho.
- FILA PERSISTENTE DA IA (`resumirIntimacoes_`): colunas novas em Intimacoes `ia_dados` (JSON estruturado), `ia_tentativas`, `ia_erro`,
  `ia_proxima`. Falha = tentativa +1, erro guardado e espera crescente (15 min × 2^(n−1), até 12 h); 8 falhas = fica em "Falhas na leitura
  automática" (conferir à mão) e avisa no chat. 429 → Config IA_PAUSA_ATE (+15 min) e a rodada para (não insiste). Roda no robô de 6 em 6 h E
  no de hora em hora (só 7h–20h, 8 por vez, 25 s — tempo de robô do Google é limitado a 90 min/dia).
- Leitura ESTRUTURADA (`pedidoGemini_`): ato, providência, existe_prazo, prazo_dias, contagem, fundamento, datas (disponibilização/publicação/
  ciência), audiência (designada/redesignada/cancelada/designar_sem_data), perícia (designada/designar_sem_data/aguardando_designacao/
  nomeacao_perito/quesitos/laudo_apresentado/manifestar_laudo), data/hora/local do ato, perito, TRECHO literal, confiabilidade, conferir,
  insuficiente ("INFORMAÇÃO INSUFICIENTE — CONFERÊNCIA NO TRIBUNAL"). `IA_ULTIMO_OBJ` guarda o JSON lido. A IA continua NUNCA mudando prazo.
- Alertas no chat da equipe (`chatRobo_`, de = 'robô', sala geral): intimação lida com audiência/perícia, prazo divergente ou informação
  insuficiente, e falha 8×; até 10 por rodada. Mensagem do robô NÃO abre a janela do chat (só pisca).
- SEM BAIXA EM LOTE: `revisarPrazos_` ignora a categoria 'vencidos' (só lista); vencido sem comprovação fica na Central. Os 27 baixados em lote de
  13/11 aparecem em "Vencidos sem comprovação" com o aviso "reabra se não foi feito" (nada foi mudado neles). Conferido de PRAZO pede o
  COMPROVANTE do protocolo (`conferirTrabalho` → `comprovante`; observacoes "comprovante: … (quem, data)" ou "sem comprovante informado").
- Início de TODOS os perfis: "⏳ Esperando há muito tempo" (`esperandoMuito_` em inicio.extras): ainda não assinaram há 7+ dias (WhatsApp pronto)
  e petição inicial sem número há 10+ dias (com quem está).
- Testemunhas nas ANOTAÇÕES do cliente (`textoTestemunhas_`, `testemunhasNasNotas_` nos robôs do escritório, e na hora em `salvarFichaAto_`): cada
  audiência de instrução/una dos próximos 90 dias vira anotação com as testemunhas (ou "nenhuma cadastrada: pedir nome, CPF e telefone").
- Relatório DIÁRIO: Relatórios › Equipe com Dia | Semana | Mês (`relatorio.semana` periodo=dia).
- Chat (revisão): `chatEnviar_` na trava, mesma mensagem em 2 min não grava 2 vezes, máx. 20/min por pessoa; no painel: sem envio duplo, texto
  volta para a caixa se falhar, aviso "sem conexão" e consulta leve de 2 em 2 min quando o banco não responde.
- Teste novo `.github/motor/teste/etapa842.js` (429 → tentativa e pausa; espera; leitura estruturada; chat do robô; sem baixa em lote;
  comprovante; chat sem duplicar; relatório do dia; esperando; testemunhas). sim.js ganhou getLastColumn. `sbEspelhar_` escreve o cabeçalho
  quando a aba da planilha tem menos colunas que o ESQUEMA.
- DECIDIDO (8.43): sem provisório — o painel identifica o ato pelo DJEN/DataJud; só sem nenhum texto fica "ATO NÃO IDENTIFICADO".

## 8.43.0 Prazos sem "provisório": o painel descobre o ato (decisão da usuária, 17/11/2026)

- `sugerirPrazo_(texto, proc, tribunal, segundoGrau, temTexto)`: com o TEXTO do ato (≥ 200 letras, não sigiloso) vale a frase da intimação
  (`fraseIntimado_`: "fica … intimado(a) para/a/de que …" até o fim da frase); prazo dado à OUTRA parte no mesmo texto não conta. `prazosNoTexto_`
  lê "prazo (improrrogável/comum…) de 15 (quinze)/quinze/dez dias (úteis/corridos)" e, dentro da frase, "em 15 dias"; vários = o mais curto.
  Tipo do ato pela frase ("ciência da sentença" → sentença); "cumprimento de sentença" (classe) não é sentença. Sem prazo no texto =
  5 dias LEGAIS (art. 218, § 3º, CPC), não provisório. Distribuição do processo = `semPrazo` (não abre prazo). Perícia marcada / quesitos /
  intimação de audiência / vista ao MP saíram do "PROVISÓRIO" (o ato é conhecido). `semEntidades_` tira &eacute; etc. do eproc.
- Sem texto (aviso do PJe/eproc) → "ATO NÃO IDENTIFICADO (PROVISÓRIO): …" (o /PROVIS/ continua marcando a fila "conferir").
- `registrarIntimacao_`: publicação com texto que chega para um prazo ATO NÃO IDENTIFICADO troca dias/descrição pelo do texto, recalcula a data
  e anota; qualquer troca de ciência recalcula a data na hora.
- `identificarProvisorios_` (robôs do escritório, 40 por rodada): para cada aberto do robô com /PROVIS/, procura publicação com texto do mesmo
  número até 4 dias do aviso ou da ciência; senão sentença/acórdão/laudo no DataJud até 10 dias antes (fora trânsito, decurso, remessa,
  conclusão…). Várias leituras → a de data MAIS CURTA. Nunca mexe em conferido, de audiência/perícia ("ato:") ou lançado à mão.
- Nos dados de 17/11: 86 abertos provisórios → 52 identificados pelo texto do DJEN (simulação); 34 sem nenhum texto ainda (eproc sem nome do
  ato no e-mail, segredo de justiça, notificação do PJe com PDF) ficam "ATO NÃO IDENTIFICADO" na Central até chegar o texto ou alguém abrir.
- Teste: `.github/motor/teste/etapa843.js`.


## 8.44 Intimações em 3 partes; a "Central de Prazos" saiu (pedido da usuária: "não gostei; prefiro só Intimações, mais organizado")

- Só painel (Code.gs continua 8.43.0). Menu sem "Central de Prazos"; #/central leva a #/prazos. `telaCentral` foi apagada.
- `telaPrazos` (#/prazos): cabeçalho "Intimações" + link "Funcionamento do sistema" (`?parte=sistema`: `semaforoRobo` aberto, Robô do DJEN,
  Revisar prazos, como o painel conta, feriados). Na área de trabalho só `avisoFontes` (Gmail parado ou DJEN > 26 h em dia útil: qual fonte,
  última leitura boa, o que fazer, quem resolve). 4 números que abrem a lista exata (`?ver=venc|doc|confirmar|semresp`; `meus` escondido;
  links antigos ver=vencido/conferir/definir e fila=conferir são traduzidos). Abas (`?parte=`): Hoje e próximos dias (vencidos sem baixa,
  hoje, amanhã, 7 dias — com audiências/perícias de `audiencias.listar`, sem data, "Mais adiante") · Para analisar (documento pendente,
  divergência, calculado para confirmar + `blocoIntimacoes`) · Execução e aprovação (Aguardando o seu OK, confirmados por responsável,
  baixados em lote sem comprovante). Busca `?q=` e sistema.
- Linha (`linhaPrazoIx`): tipo da data (`dataDoPrazo`: "Consultar o tribunal até" = data INTERNA quando falta o documento, "Prazo calculado",
  "Prazo confirmado", "Divergência", "Compromisso"), cliente + ato, processo/ciência/dias, "Falta: …" (`pendenciasDoPrazo`), estado
  (`estadoDoPrazo`), responsável e os botões de sempre (`botoesPrazo`). `docPendente` = /PROVIS/ ou "a definir", nunca conferido. CSS `.ix-*`.
- Prévia aprovada antes: https://claude.ai/artifact/6HrChawH3HgUP7aXZMMCj6 (dados fictícios).
- 8.44.1 (pedido da usuária: "mais fácil, automatizado por dentro, prazos claros e bonito"): cada linha tem a FOLHINHA de calendário
  (`folhinha`: dia da semana, dia, mês; borda na cor do tipo da data) e a linha "⟳ via DJEN/eproc/PJe · ciência · dias · ato lido no texto /
  no DataJud" (de onde o painel tirou o prazo). Em "Hoje e próximos dias", faixa dos próximos dias (`faixaDias`: vencidos + 7 dias úteis com
  prazos e atos de cada dia; clicar rola até o grupo).

## 8.44.0 Vencidos saem sozinhos, com o motivo (pedido da usuária, 18/11/2026: "tem prazos que a gente faz e não dá ciência no painel, e
## tem prazos que só dão ciência; os vencidos, retire" — ex.: o do Israel, manifestação já juntada)

- `baixarVencidos844_` (robôs do escritório, toda rodada): prazo aberto com fatal ANTES de hoje (fora "ato:") sai da lista: (1) acordo/
  extinção/arquivamento depois do aviso (`RE_ENCERROU_`) → cancelado "sem prazo: …"; (2) "Juntada de petição / manifestação / quesitos…"
  (`RE_JUNTADA_`, intimações do PJe/eproc ou DataJud) depois do aviso → cumprido "robô (petição juntada em dd/mm)" — a MAIS RECENTE; vai
  para o OK da administração conferir se foi do escritório; (3) só ciência (perícia/audiência marcada, notificação de processo novo, frase
  "intimado para ciência" sem nada a fazer) → cancelado "o ato era só para ciência"; (4) nada → cumprido "robô (vencido sem comprovação)" com
  ok já dado e a marca "se NÃO foi feito, reabra" — aparece em Intimações › Execução › "Baixados em lote sem comprovante" (regex
  /baixa em lote|sem comprova/). Esta regra SUBSTITUI o "não baixar vencido" da 8.42 (decisão da usuária). Nada é apagado.
- Em 18/11 (simulação nos dados reais): 14 vencidos → 6 com petição juntada (Israel 13/11 etc.), 6 só ciência/acordo, 2 sem comprovação.
- Teste em `.github/motor/teste/etapa843.js`.
- 8.44.2 (pedido da usuária): `vencidosRapido_` no `aquecerGatilho` (10 em 10 min, horário do escritório) — lê só Prazos e só roda a baixa
  (na trava + `sbEnviarSujas_`) se houver vencido para retirar. `vencidoParaRetirar_`: prazo que o robô ou a baixa em lote já retirou e a
  equipe REABRIU (observações com "saiu da lista em" / "baixa automática:" / "sem prazo: … (robô," / "baixa em lote em") nunca é retirado de novo.
- 8.44.3 (pedidos da usuária, 18/11/2026): (1) audiência/perícia ("ato:") com data passada sai sozinha (`baixarVencidos844_`: cumprido
  "robô (o ato já aconteceu)", com ok, sem ir para o OK) — "o que aconteceu ontem não preciso, só as novas". (2) Intimações: abas "Prazos e
  audiências" (audiências/perícias NOVAS = marcadas nos últimos 7 dias, `linhaAtoNovo`; Atrasados; um grupo por dia com o nome por extenso,
  `tituloDia`; "Depois desta semana"), "Conferir no tribunal" (SÓ ato não identificado + leitura divergente; prazo calculado pelo robô não
  conta mais — antes "Para analisar" mostrava 144) e "Em execução e aprovação"; links antigos parte=analisar e ver=confirmar continuam. A
  faixa de dias e as audiências da semana saíram. (3) Filtro por TRIBUNAL (`seletorSistema`, `TRIB_ATUA`/`TRIB_LUGAR`, `filtroSisOk`, valor
  "t:TRT6"): TRT12, TJSC, TRF4, TRT6 (Pernambuco), TRT23, TRT16, TST, TJRS… com o nº em aberto; tribunais novos entram sozinhos.
  (4) TRAVAMENTO de 18/11 13h02 (achado no registro do Supabase): o navegador do Luis abriu o painel guardado em cache (GitHub Pages guarda
  10 min) com motor mais velho que o Google; o arquivo painel/motor-<versão do Google>.js ainda não existia → banco desligado 10 min → tudo
  no Google (1,5 min de tela parada). Agora o publicar também grava painel/motor-<VERSÃO NOVA>.js, o painel velho se recarrega sozinho uma
  vez (`recarregarSeVelho` em banco.js) e a cópia local não depende mais da versão do Google (assinatura = colunas do ESQUEMA), então uma
  atualização do Google não faz todos baixarem ~7 MB de novo. REGRA: ao publicar, gravar painel/motor-<VERSÃO NOVA>.js junto do motor.js.
- 8.44.1 (Code.gs): a rodada do robô de 18/11 11h12 caiu com "O banco de dados não respondeu agora": a leitura de uma tabela inteira pelo
  servidor passou dos 8 s do `authenticator` (já chegava a 7,8 s) e a rodada INTEIRA foi perdida. `alter role service_role set statement_timeout
  = '30s'` (só o servidor usa essa chave; registrado no fim do leitura-rapida.sql) e `sbPrecarregar_` tenta de novo, uma vez, a tabela que voltou
  com 5xx/429 antes de desistir.


## 8.45.0 Audiências por tipo + FGTS rescisório na calculadora (pedidos da usuária, 18/11/2026)

- Audiências (#/audiencias): duas abas — "🤝 Conciliação" (conciliação, inicial, una sem tipo, mediação; `ehConc`) e "⚖ Instrução" — cada uma
  com o nº de pendentes; perícias e "avisos para mandar" ficam em links discretos à direita (`?ver=pericia|avisar`). Linha mostra o resumo
  (`resumoAcordo`/`resumoTestemunhas`: "Acordo a combinar", "pedir R$ x · mínimo R$ y", "3 testemunhas · 1 a confirmar", "Cliente sem
  testemunhas", resultado). Conciliação: valor que vamos pedir, mínimo que o cliente aceita, forma de pagamento (+ parcelas), "o cliente
  autorizou" (quem/quando), combinado, resultado (acordo fechado + valor / sem acordo / redesignada) e "Combinar no WhatsApp". Instrução:
  "vai ter / não vai ter / a confirmar" testemunhas, lista (nome, CPF, telefone, obs, confirmou, Zap para a testemunha), aviso > 3, o que
  provar, documentos para levar, "cliente orientado sobre o depoimento", resultado e "Perguntar no WhatsApp".
- Servidor: colunas novas `acordo` e `preparo` (JSON) em Audiencias (ESQUEMA + esquema.sql; ALTER já rodado no Supabase em 18/11);
  `salvarFichaAto_` aceita `acordo`/`preparo` (campos em `CAMPOS_ACORDO_`/`CAMPOS_PREPARO_`, `limparCamposAto_`; valores por `dinheiro_`);
  acordo salvo vira anotação na ficha do cliente (`textoAcordo_`); "não terá testemunhas" entra no `textoTestemunhas_`.
- Calculadora de rescisão (motor único assets/rescisao-motor.js; site e painel): FGTS MENSAL do contrato = já recolhido → linha cinza de
  conferência pelo extrato (não soma); só vira valor a receber com "não depositou"/"em parte". Entra no total o FGTS RESCISÓRIO: 8% do saldo
  de salário, 8% do 13º devido (já com a projeção do aviso, uma vez só) e 8% do aviso indenizado. Multa 40%/20% sobre a base legal = FGTS
  mensal + 8% do saldo + 8% do 13º SEM a projeção (sem o FGTS do aviso — OJ 42, II, SDI-1 / Tema 255). Exemplo da usuária: FGTS 205,92 +
  171,60 + 251,68 = 629,20; multa 1.477,67 (igual a antes).

## 8.46.0 Audiências mais simples e automáticas (pedido da usuária, 18/11/2026)

- Conciliação: em cada linha o VALOR COMBINADO com o cliente (campo R$ na própria linha → acordo.pedir) e "OK do cliente" (acordo.autorizou);
  clicar no NOME abre os detalhes (`detalhes`): avisos ao cliente, online/presencial, últimas anotações do cliente (`obs_cliente`), "O que o
  cliente quer" (acordo.obs), mínimo e forma de pagamento (opcionais), WhatsApp para combinar, Processo, ciência. Instrução: nome do cliente,
  resumo das testemunhas na linha; nos detalhes, vai ter/não vai ter, testemunhas, o que provar, documentos, orientado, WhatsApp.
- No dia e depois (`pendenteRes`: data ≤ hoje sem resultado), botão AMARELO "O que aconteceu?" (`dialogoResultadoAto`): Fechou acordo / Não fechou
  (quanto ofereceram) / Redesignada / Não aconteceu (instrução: Realizada / Teve acordo / …). Fechou acordo → valor, parcelas, 1º pagamento e
  honorários % (do honorário de ÊXITO do cliente, `pct_exito`; sem ele, 30%) com prévia "30% de R$ X = R$ Y em Nx" → rota `audiencias.resultado`
  (`audienciaResultado_`): grava o resultado na ficha, cria o honorário PARCELADO no Financeiro (salvarHonorario_; não lança 2 vezes:
  honorario_id), leva o processo para a etapa Acordo e anota na ficha do cliente; a tela abre o honorário criado.
- `audiencias.listar` com `passados` traz também as dos últimos 30 dias SEM resultado (grupo "Já aconteceram — anote o resultado"); `pct_exito`
  só para perfis com financeiro. Lista até 85 dias (a cópia da agenda no banco vai até +3 meses; mais que isso iria ao Google, lento).
- O aviso "⚠ N audiência(s)/perícia(s) designada(s) sem a data no aviso" ficou fechado: clicar mostra a lista.

## 8.47.0 Chat sem travar, petição inicial em 2 passos, avisos com "Avisar agora", PIX do acordo sozinho (pedidos da usuária, 18/11/2026)

- CHAT travado: cada mensagem e cada conversa aberta (chat.lido) apagava a memória de TODAS as telas (`esquecerDepois` sem 'chat' em AFETA →
  esquecerTudo + envelhecer do banco). Agora `chat.*` não mexe na memória das telas; chat.lido só uma vez por mensagem (`st.lidoEm`); com a janela
  aberta o ping é de 5 em 5 s (fechada, 15 s).
- Petição inicial (pedido da usuária: "apertei Inicial feita e foi para Ajuizado, mas nem protocolamos"): quadro de Processos com a coluna
  "Protocolar" (`colunaDoProc`: etapa contratado + Processos.inicial_feita_em). "Inicial feita →" (rota `processos.inicialFeita`, tarefa da inicial →
  "aguardando") → coluna Protocolar com "📄 Mandar ao cliente" (WhatsApp `linkInicialCliente`; rota `processos.inicialEnviada` grava
  inicial_enviada_em; o cartão troca na hora para "✓ cliente avisado") e "Protocolar →" (`campoProtocolo`: número OBRIGATÓRIO no padrão CNJ + vara →
  Em andamento + aviso ao cliente com número e código). "←" volta para Petição inicial (desfazer). O Conferido da inicial SEM número não leva mais
  para "Ajuizado": fica em Protocolar e a tarefa continua aberta. `ajuizadosSemNumero847_` (uma vez, Config FIX_AJUIZADO_847) devolveu para Protocolar
  os processos "Ajuizado" sem número (6 em 18/11, entre eles o do Jucemar). Colunas novas em Processos: inicial_feita_em, inicial_feita_por,
  inicial_enviada_em (ALTER já rodado no Supabase). processos.listar devolve `cliente_tel` só para quem está em Protocolar.
- Audiências: nos detalhes (clicar no nome) os avisos viram linhas (`linhasAvisosAto`): "1 semana antes · 12/11 [Avisar agora] já avisei",
  "Véspera · 18/11 …", "No dia …" — o botão abre o WhatsApp e já marca avisado (mesmo antes da data); "já avisei" marca sem abrir (avisou por
  telefone); feito = "✓ avisado · Nome" + "mandar de novo".
- Avisos no canto (`iniciarNotificacoes`): PIX recebido SÓ para a administração; intimação nova para todos.
- PIX do ACORDO (pedido da usuária: "acordo de R$ 1.000, a doutora fica com 30%; quando cair o PIX no dia combinado, já descontar"):
  o honorário lançado pelo "O que aconteceu?" leva a marca [acordo:valor|parcelas|pct]; `pixDeAcordo_` (início do `classificarPix_`, no robô
  de hora em hora e na reconferência) reconhece o PIX com o valor da PARCELA DO ACORDO (empresa pagou ao escritório) ou da PARCELA DOS
  HONORÁRIOS (cliente repassou), de 7 dias antes a 20 dias depois do vencimento → baixa sozinho a parcela de honorários (forma "PIX (Inter) —
  acordo", recibo) e, no valor cheio, cria a tarefa "💸 Repassar R$ X ao cliente" (`[repasse:parcelaId]`). Dois acordos iguais na mesma data =
  sugestão para conferir. Teste em etapa843.js.

## 8.48.0 Nenhuma audiência fora da agenda (pedido da usuária, 18/11/2026: "a audiência da Márcia não estava no sistema")

- CAUSA: a data da audiência estava só no "próximo ato" do processo (importado do sistema antigo: "Instrução" + data); Agenda e Audiências
  leem só o Google Agenda e os atos que o robô tira das intimações (o aviso do PJe/DJEN da Márcia nunca trouxe a data). Eram 34 processos assim.
- `atosDoProximoAto_(limite)`: processo ativo com número e próximo ato de audiência/perícia (`RE_ATO_PROX`) de hoje até +3 anos que não está em
  Eventos → `marcarAto_` (Google Agenda certa, Eventos, lembrete, os 4 avisos), os MAIS PRÓXIMOS primeiro. Sem horário no texto → tarefa
  "⚖ Conferir o HORÁRIO" (`[horaato:numero:data]`, urgente se for em 2 dias). Roda no aquecedor de 10 em 10 min (`atosDoProximoAtoRapido_`, só
  trava se faltar algum) e nos robôs do escritório (40 por rodada).
- Sem audiência repetida: `eventoGoogleDoAto_` e `atosDaAgenda_` reconhecem o evento lançado À MÃO sem o número mas com o NOME do cliente no
  título (`nomeNoTitulo_`: primeiro nome + outro nome) no mesmo dia/hora. `limparAtosDuplicados848_` (uma vez, Config FIX_ATOS_DUP_848) apagou o
  evento do robô que tinha gêmeo à mão (caso dos "2 João") e ligou Eventos ao lançado à mão.
- "Feito" no lugar do "Conferido" (pedido da usuária): `escolherQuem` não mostra mais a equipe — quem fez = quem está logado; sem campo extra
  grava na hora, com campo (comprovante do prazo, nº do processo) abre só o campo e "✓ Feito". Tudo vai para "Aguardando o seu OK" e some da
  lista de quem fez; "Devolver" da administração reabre o prazo/intimação/tarefa. "🙋 Eu faço" e "Passar para…" SAÍRAM (`botoesEuFaco` só mostra
  o responsável; a distribuição é a de "Quem faz o quê").
- Chat: trocar de conversa abre na hora com o que já estava na tela (`st.cache` por sala) e a resposta atrasada da conversa anterior não puxa
  mais de volta (`st.seq`).
- Processos sem número: `semNumeroParaProtocolar848_` (uma vez, Config FIX_SEMNUM_848) levou para "Protocolar" a inicial sem número criada há
  mais de 5 dias (conferir se já foi protocolada). Sem cliente: `parteDoEscritorio_` entende o e-mail [PUSH] do PJe ("Réu: … Advogados do Réu:
  … JULIAN"; papéis sem diferenciar maiúscula) e `identificarPartes_` tenta de novo todos uma vez (Config FIX_PARTES_848). O e-mail do eproc
  não traz as partes; SIGILO fica de fora.
- Gmail aberto/apagado (pedido da usuária: "tem gente que vê o prazo pelo Gmail"): Intimacoes.gmail_id (id da mensagem, gravado na leitura),
  gmail_lido_em, gmail_apagado_em. `gmailSituacao_` (robô de hora em hora; 2 buscas: in:trash e is:read, 60 dias, `getMessagesForThreads`)
  marca o que foi aberto/apagado; os antigos sem id pelo nº do processo no assunto + dia. Selo "✉ aberto / apagado / não aberto no Gmail"
  (`seloGmail`) na intimação e no prazo (`gmail` em prazos.listar). Só INFORMA: apagar o e-mail nunca dá baixa no prazo.

## 8.48.1 Vencidos só saem depois de 10 dias úteis + calculadora em botões (18/11/2026)

- Achado no print do PJe (Expedientes) da usuária: o painel conta pela regra MAIS CURTA (5 dias) e o "Prazo final" do PJe às vezes é maior
  (19/11 × 17/11 no painel); `baixarVencidos844_` tirava no dia seguinte prazos que ainda corriam no tribunal (0000909, 0000486, 0000908,
  0001026, 0000005). Agora "só ciência" e "sem comprovação" só saem sozinhos depois de 10 dias úteis da data do painel (`alemDaMargem_`; antes
  se a data foi conferida/vinculada ao PJe). Petição juntada, acordo/extinção e ato que já aconteceu continuam na hora; acordo/suspensão
  REVOGADA depois (`RE_RETOMOU_`) não encerra. `reabrirVencidosCedo848_` (uma vez, Config FIX_REABRIR_848) reabriu os retirados cedo demais
  (inclusive a baixa em lote de 13/11), menos os com petição juntada depois do aviso; a marca impede que saiam sozinhos de novo.
- Por que o painel mostra mais que o PJe: o PJe › Expedientes lista só as intimações pendentes daquele sistema; o painel junta também as
  audiências/perícias futuras (até 2027), os prazos do eproc/TJSC/TRF4 e as publicações do DJEN.
- Calculadora de rescisão (painel): perguntas em BOTÕES (`seg`): "1ª/2ª/3ª férias foi paga?" uma por período completo (`RESCISAO.periodosFerias`,
  com a projeção do aviso; motor aceita `feriasPagas` = [true/false por período]), "13º do ano passado foi pago?", "O FGTS foi pago?" (Sim /
  Não / Só em parte / Já está em outro pedido da inicial / Não sei). "Data da ruptura" saiu: só Admissão e "Demissão / último dia trabalhado";
  "Dias de salário pendentes" continua.

## 8.49.0 Ficha do cliente com Audiências, Início com atalhos, CRM por dia/semana/mês (pedidos da usuária, 18/11/2026)

- Ficha do cliente › aba "Audiências": a MESMA lista da tela Audiências (`telaAudiencias(params, clienteId)` devolve o elemento), com TODAS as
  audiências/perícias do cliente — Próximas (avisos, valor combinado, testemunhas) e "Histórico de audiências" (rota `audiencias.cliente`,
  `audienciasDoCliente_`: janela atual + fichas da aba Audiencias + atos da aba Eventos; nada some). Clicar no nome abre os detalhes.
- Início de TODOS os perfis: botões rápidos (`ini-rapidos`): Intimações, Audiências, Calculadoras, Documentos, Clientes, Processos, Tarefas,
  Agenda, Cobranças (financeiro) e CRM (administração).
- CRM: bloco do período (`crm-periodo`, Dia | Semana | Mês, localStorage `crm_per`, padrão Semana): novos contatos, respondidos, consultas
  marcadas, fecharam, não fecharam, taxa; colunas das últimas 8 semanas. "Novos/Fechados" do topo seguem o período.
- CRM integrado: `crmSincronizar_` também põe no funil o cliente ANTIGO (importado) que gerou procuração/contrato depois de CRM_CLIENTES_DESDE
  (em 18/11: 3 clientes tinham assinado sem cartão). Conferido: todo cliente cadastrado pelo painel desde 08/09 já tem cartão.
- 8.49.1 (pedido da usuária: "às vezes é lançado um processo sem número que não vai ter; quero que apague o honorário também"): "🗑 Apagar este
  processo" pergunta em seguida "Apagar também o HONORÁRIO lançado para esta ação?" (só perfis com financeiro). `apagarProcessoSemNumero_` com
  `honorario`: retira os honorários ligados ao processo (Honorarios.processo_id) ou lançados pelo "Assinado" desta inicial (Assinaturas.
  honorarios_lancados) — parcelas NÃO pagas apagadas (e o boleto/Pix cancelado), as pagas ficam; situação "retirado" com o motivo.
- 8.49.2 (perguntas da usuária: "vai acontecer de novo?"): (1) Petição juntada NO MESMO DIA do aviso é da OUTRA parte (o aviso costuma ser
  para responder a ela): só conta como "feito" a juntada a partir do dia SEGUINTE (`baixarVencidos844_` e `reabrirVencidosCedo848_`); reabertura
  de novo, uma vez (Config FIX_REABRIR_849) — caso do 0000486 (contrarrazões ao RO, prazo 19/11 no PJe). (2) Duas publicações do DJEN com
  textos/atos diferentes no mesmo processo viram DOIS prazos (`outraPublicacao_` no `registrarIntimacao_`; antes a 2ª entrava no prazo da 1ª e
  o prazo do PJe sumia — caso do 0000005, ciência 11/11 → 23/11); `separarPublicacoes849_` (uma vez, Config FIX_PUBLIC_849) separou as dos
  últimos 45 dias. (3) Processos sem cliente: `parteDoPeticionamento_` lê o e-mail do eproc "Peticionamento Eletrônico - Envio de Processo
  Finalizado" ("Nome da(s) Parte(s): FULANO - *AUTOR* X …": cliente = polo ativo; processo originário também; o escritório como parte não
  decide); `identificarPartes_` agora tenta também os em SIGILO, 25 por rodada, e começa tudo de novo uma vez (Config FIX_PARTES_849). 8.49.3: processo que já tem o nome E o papel (polo) de quem o escritório representa vira cadastro direto.

## 8.50.0 Intimações só do escritório + acordo com a empresa que paga (pedidos da usuária, 19/11/2026)

- "Nas intimações eu só quero o que está no PJe": o DJEN publica UMA intimação para cada parte. `outraParteDjen_(texto, proc)` lê o destinatário
  ("Destinatário: …" / "Intimado(s) / Citado(s) - …") e o cabeçalho ("RECLAMANTE: … RECLAMADO: …", rótulos em `POLO_A_`/`POLO_B_`): cliente num
  polo e destinatário no outro → é da outra parte. Cliente desconhecido/sigilo, destinatário com o nome do cliente ou fora do cabeçalho → não decide
  (o prazo continua). `registrarIntimacao_`: publicação da outra parte entra em "Todas" com terminada_por "robô (para a outra parte: …)" e NÃO abre
  prazo nem se junta a outro. `outraParte850_` (uma vez, Config FIX_OUTRA_850): fecha as antigas; prazo aberto só delas → cancelado "sem prazo: a
  publicação era para a outra parte … Se for nosso, reabra"; prazo que também é do cliente fica, ligado à publicação do cliente. Nos dados de 19/11:
  12 dos 40 prazos abertos do DJEN eram de publicações para a outra parte.
- Tela Intimações: aba "Prazos" (sem "Audiências e perícias novas" e sem os lembretes "ato:"); audiências e perícias só na tela Audiências (link no rodapé).
- Audiências › "O que aconteceu?" › Fechou acordo: continua na tela Audiências (não abre mais o honorário); os honorários entram sozinhos em
  Cobranças. Campo "Quem vai pagar (empresa)" (padrão: parte contrária do processo) → ficha (acordo.empresa) e marca `[pagador:NOME]` no honorário;
  `pixDeAcordo_` põe primeiro o acordo cuja empresa bate com quem mandou o PIX (desempata dois acordos de mesmo valor).
- 8.50.1 (pedido da usuária: "19 audiências que não foi conferido… veja a data e o horário sozinho"): ACHADO — o e-mail [PUSH] do PJe traz a data
  do ato entre parênteses ("…designada (29/06/2027 15:20 Sala Principal - VARA…)"), mas o texto do e-mail quebra a linha antes dela e o robô lia a
  data como outro evento ("Sala Principal - VARA…)"): a audiência ficava "sem data". `eventosPush_` (o antigo lerAvisoPje_) junta a linha antes
  (`juntarDataDoAto_`). `atosSemDataPeloPush_` (robôs do escritório, 12 por rodada; Properties ATOSD_TENTADOS, 6 h) relê os e-mails [PUSH] de cada
  tarefa "abrir o processo e lançar na agenda" e marca o ato (agenda + 4 avisos); a tarefa fecha sozinha quando o ato do mesmo tipo está na agenda.
  A intimação/prazo do aviso continua aberta. `periciasTrocadas850_` (uma vez, Config FIX_PERICIA_850): perícia do robô no mesmo dia/hora de uma
  audiência do mesmo processo sai da agenda (caso 0000909: a instrução virou "perícia"). Sem data em nenhum lugar (segredo, eproc, sigiloso) a tarefa fica.
- 8.50.2: intimação cujo destinatário é a própria Dra. ou o escritório (ação de cobrança de honorários) nunca é "da outra parte"; audiências são marcadas de TODOS os processos e de qualquer parte (a detecção roda antes da regra da outra parte).
- Audiências: quadro "Audiências de hoje" no canto de cima à direita (`quadroDoDia`): hora, cliente, Conciliação/Instrução/Perícia juntas, online/
  presencial; sem audiência hoje mostra o próximo dia com audiência.
- 8.50.3 (caso da Gislaine, 19/11: "a pauta de hoje foi remarcada e não foi colocado aqui"): o aviso do PJe de 31/10 dizia "instrução … CANCELADA
  (19/11/2026 14:00)" e "instrução … designada (15/03/2027 13:30)". A de 15/03 estava na agenda (como conciliação), mas o robô do "próximo ato"
  (8.48) criou outra em 19/11 a partir do campo velho do processo ("Audiência 19/11"). Correções: `atosDoProximoAto_` não cria ato quando o processo
  já tem ato do mesmo tipo marcado pela publicação em outra data (e atualiza o próximo ato) nem quando o aviso diz "cancelada" naquela data
  (`atoCanceladoNoAviso_`, `RE_ATO_CANC_`/`RE_ATO_DESIG_`; "redesignada (data)" traz a data NOVA = designação). `atosCancelados_` (robôs do
  escritório): ato futuro que o aviso do PJe dá como cancelado sai da agenda (`cancelarEventoAto_`: Google, Eventos "apagado (…)", lembrete "ato:"
  cancelado, tarefa do horário cancelada) e o próximo ato do processo é refeito; uma vez (Config FIX_PROXATO_850) confere os 36 atos que vieram
  do próximo ato em 18/11 (relendo os e-mails [PUSH]). `tiposDoPush850_` (aos poucos, Config FIX_TIPO_850): audiência futura marcada como
  conciliação/"a conferir" vira INSTRUÇÃO quando o aviso do PJe diz "Audiência de instrução … designada (mesma data)".
- 8.50.3 Intimações › "Prazos do dia" (pedido da usuária: "apenas as intimações do dia, com a data certa, e assim vai indo; amanhã é feriado"):
  UM dia por vez (‹ dia anterior · dia · próximo ›, "Hoje", escolher a data, botões dos próximos 6 dias úteis com a quantidade). Hoje mostra
  também os atrasados ainda abertos e os sem data. Feriado (`feriadoDoDia`: fixos, Páscoa, recesso) e fim de semana dizem "não vence nenhum
  prazo". Nenhuma audiência/perícia nesta tela (ficam em Audiências).

## 8.51.0 Avisos de audiência pelo WhatsApp oficial sem clique (pedido da usuária, 19/11/2026)

- O WhatsApp só deixa a empresa começar a conversa com MODELO aprovado pelo Meta: `whatsModeloAviso_` cria sozinho o modelo
  "aviso_audiencia_araujo" (Utilidade, pt_BR; `CORPO_MODELO_AVISO_` com {{1}} nome, {{2}} o ato, {{3}} quando, {{4}} onde/o que levar) na conta
  achada pelo token (`whatsWaba_`: debug_token → Config WHATS_WABA_ID) e confere a aprovação de 3 em 3 h (Config WHATS_MODELO_AVISO_ST).
- `avisosAutomaticos_` (logo depois de `lembrarAudiencias_`, em toda rodada do robô): com o modelo APPROVED, as tarefas de aviso 1 SEMANA, VÉSPERA
  e NO DIA saem sozinhas (8h–19h; a do dia desde 7h30; "audiência nova" continua com a secretaria) para o telefone do cadastro
  (`telWhatsServidor_`: 55 + DDD + número; dois números → o primeiro). Enviou → ficha aviso_*_em/por "robô (WhatsApp automático)", tarefa fecha
  (`[whatsauto:enviado]`), mensagem registrada na conversa do Chatbot. Sem telefone ou o Meta recusou → tarefa fica para a secretaria
  (`[whatsauto:falhou]` + motivo no histórico). Config WHATS_AVISO_AUTO = nao desliga (Chatbot do WhatsApp › ⚙ Ligar / configurar).
- Resposta do cliente até 3 dias (`respostaAvisoAto_`, Properties AVISO_WA_<8 dígitos>): "ok/confirmo/vou…" → agradece e anota "Cliente confirmou
  pelo WhatsApp" nas observações da ficha da audiência; outra coisa → vai para a equipe (robô pausa).
- 8.51.1 (pedido da usuária: "às vezes é online, PRINCIPALMENTE online; damos a opção de vir aqui no escritório — tem que tomar cuidado"): o "local"
  que vem do PJe ("Sala 1", "Sala Principal - VARA…", videoconferência) é a sala VIRTUAL da vara e nunca vai para o cliente. Aviso de audiência
  (automático `paramsAvisoAto_` e o do botão `textoAvisoAto`) = "Será ONLINE (por vídeo)… Se preferir, você pode participar aqui do nosso
  escritório: é só nos avisar", salvo quando a ficha da audiência está marcada PRESENCIAL ("no fórum" / endereço real). Perícia: só o que levar.
- 8.51.2 (revisão "sem brecha" do aviso automático, `avisosAutomaticos_`): marca do envio nas Propriedades ANTES da planilha (AVISO_ENV_<hashCurto_>):
  o mesmo aviso nunca sai duas vezes, nem se a gravação na planilha se perder depois do envio; secretaria já avisou (ficha aviso_*_em) → não manda;
  resultado da audiência já anotado ou ato cancelado/remarcado na agenda (Eventos "apagado"/outra data) → não manda e fecha a tarefa; aviso do dia
  depois do horário → não manda; falha passageira do Meta (503/timeout) → tenta na próxima rodada (não vira tarefa); recusa definitiva → secretaria;
  mensagem já saiu e algo depois falhou → tarefa fecha (a secretaria não manda de novo). Cliente empresa (LTDA, CNPJ…) → nome inteiro. Resposta com
  "não", "?", imprevisto, remarcar, presencial, escritório, link… → equipe (não é confirmação).
- 8.51.3: em 19/11 o robô respondeu "SEM_CONTA" (o token não mostrou a conta do WhatsApp Business pelo debug_token). `whatsWaba_` agora tenta 4
  caminhos (debug_token, /me/businesses, /me/whatsapp_business_accounts e confere o número) e grava o motivo exato em WHATS_MODELO_AVISO_ST
  (mostrado em Chatbot › ⚙); "SEM_CONTA"/"ERRO" conferem de novo em 1 h. Campo reserva "ID da conta do WhatsApp Business" no ⚙ (Config WHATS_WABA_ID).

## 8.52.0 Botão "Qualificação" e documentos só com o que existe (pedidos da usuária, 19/11/2026)

- Ficha do cliente: botão pequeno "📋 Qualificação" no topo (ao lado de Gerar documentos) copia o parágrafo pronto (`qualificacaoTexto_` →
  clientes.obter `cliente.qualificacao`): "NOME, brasileiro(a), estado civil, profissão, inscrito(a) no CPF de n° …, portador(a) do RG de n° …,
  residente e domiciliado(a) na …, Cidade/UF, CEP …" (PJ: CNPJ, sede e representante). Gênero pelo cadastro/nome; só o que existe aparece.
- "Quando não tiver RG, não coloque COMPLETAR; sempre use as informações que tem": os modelos do painel já omitiam (`qualificacao_`); nos modelos
  do Drive (`preencherColchetes_`) RG, estado civil, profissão e e-mail que faltam SAEM do texto junto com "portador do RG nº", a vírgula etc. (antes
  ficava "[RG]"). A prévia do gerador diz "O documento sai só com o que está no cadastro".
- `copiar(txt, ok)` em painel.js (faltava: o "Copiar o texto" do "✨ Avisar o cliente" também quebrava).
- 8.52.1 (pedido da usuária): "Aguardando o seu OK" abre SEMPRE com a lista escondida (Início e Intimações; não lembra mais `aguarda_aberta`); só mostra ao apertar "ver a lista".
- 8.52.2 (pedido da usuária: "por que fala em atendimento se já foi assinado"): etapa do cliente (`JORNADA`): "Em atendimento · …" SÓ antes do
  contrato assinado (em conversa, cadastro enviado/preenchido, consulta feita, procuração e contrato enviados); assinou → "Contrato assinado ·
  petição inicial"; processo com número → "Processo em andamento". Extensão 1.3.1 (etiqueta "Contrato assinado").
- 8.52.3 (pedido da usuária): "📋 qualificação" também no quadro "Dados do cliente" (Visão geral da ficha), ao lado de "✎ editar".
- 8.52.4: os dois botões de qualificação aparecem SEMPRE — o texto é montado no navegador (`qualificacaoCliente` em painel.js, mesma regra do `qualificacaoTexto_`) quando o servidor ainda não manda `cliente.qualificacao` (Google numa versão anterior).
- 8.52.5 (pedido da usuária: "cliente com dois números aparece indisponível no WhatsApp"): o painel usava SEMPRE o primeiro número e, no caso do
  Diogo Mateus (CRM: "41992588246 / 4899803800"), o primeiro não tinha WhatsApp. `telefonesWhats` (painel.js) lê TODOS os números do cadastro
  ("/", "ou", "e", " - ", vírgula, dois números colados; celular antigo sem o 9 ganha o 9; sem DDD = 48; "+351…" = estrangeiro; celulares
  primeiro); `telefoneWhats` devolve os números juntos com "_" e o clique (ouvinte global dos links wa.me) pergunta "Este cliente tem 2
  números — qual tem WhatsApp?" (`escolherNumeroWhats`; o último escolhido fica lembrado neste computador, localStorage `whats_num_<números>`,
  e vem primeiro). Vale para TODOS os botões de WhatsApp (ficha, CRM, cobranças, audiências, Edifício Future — future.js usa a mesma função).
  Servidor (`telWhatsServidor_`, avisos automáticos de audiência): mesma leitura, usa o primeiro CELULAR. Em 19/11: 520 cadastros com 2 números.

## 8.53.0 Chat estilo WhatsApp, direto no banco (pedido da usuária, 19/11/2026: "não deixe travar; mandar áudio, anexo, tipo o WhatsApp")

- Antes cada mensagem passava pela função "painel" (às vezes pelo Google): 0,4 s em média, picos de 4–6 s. Agora o navegador fala DIRETO com
  funções do banco (leitura-rapida.sql 8.53, chave pública + código da sessão do banco, mesmas travas do painel_chat_ping): `painel_chat_listar`
  (salas, não lidas, últimas 200 mensagens, resposta citada `resp`, `vistos` = até onde cada um leu), `painel_chat_enviar` (id gerado no navegador
  'M'+12 hex = mandar de novo não duplica; mesmo texto em 2 min não duplica; 30/min; só pessoa ativa nas conversas a dois; anexo só se o arquivo
  JÁ está no Storage), `painel_chat_lido`, `painel_chat_apagar` (só quem escreveu). Toda mudança marca painel_estado 'mudou:chat'/'mudou:chat_lidos'
  (a cópia banco → planilha leva junto). Sem o banco (sessão caiu, fora do ar) → o caminho antigo (`chat.*` do Apps Script, que aceita `id` e `resposta`).
- Arquivos (áudio, foto, PDF/documento até 25 MB) no Storage do Supabase, cesto PRIVADO "chat": função `chat` (supabase/functions/chat/index.ts;
  publicar `FUNCAO=chat node .github/motor/publicar-edge.mjs`) dá o link de ENVIO de uso único (nome novo escolhido pelo banco em
  `painel_chat_arquivo_`) e links de BAIXA de 1 h só para arquivos de mensagens que a pessoa pode ver (não apagadas). O navegador sobe direto ao
  Storage com a % (`chatSubir`, XHR). Colunas novas em Chat: tipo (audio|imagem|arquivo), arquivo, arquivo_nome, arquivo_tam, arquivo_tipo,
  duracao, resposta. CSP do painel: img-src/media-src com https://*.supabase.co e blob:.
- Janela (`montarChatFlutuante`): 📎 anexar (também colar imagem e arrastar arquivos), 🎤 gravar áudio (aparece com a caixa vazia; até 5 min,
  32 kbps; 🗑 cancela), player com velocidade 1x/1,5x/2x, foto em miniatura (clique abre), PDF em cartão, ↩ responder (citação clicável),
  ⧉ copiar, 🗑 apagar, ✓/✓✓ (azul = lido; na "Equipe toda" o título diz quem viu). A lista é atualizada POR PEÇAS (só o que mudou): o áudio que
  está tocando não para quando chega mensagem. Uma leitura por vez (`st.carregando`). Envio que falhou fica com "Tentar de novo".
- Teste: SQL (invasão, sala alheia, pessoa inativa, arquivo inexistente/de outro escritório, apagar alheio, anon sem acesso às internas) e
  navegador (texto 0,17 s, PDF, foto, áudio gravado e tocando, resposta, 0 pedidos ao Google). etapaChat.mjs continua passando.
- 8.53.1 (pedido da usuária: "tem muita intimação que está meio fora do ar"): em 19/11 havia 892 "intimações" abertas de novembro — 634 sem
  prazo eram só avisos de MOVIMENTAÇÃO do PJe/eproc (documento sigiloso, juntada, disponibilizado/publicado, decorrido prazo, mandado, download…)
  e o robô só os tirava depois de 7 dias. `movimentoPuro_` (`RE_MOV_PURO_`, nunca audiência/perícia/intimação expedida/citação): movimentação sem
  prazo sai NA HORA (`arquivarMovimentos_`, terminada_por "robô (só movimentação)") e nem aparece em `intimacoes.listar` abertas; o resto sem prazo
  sai em 2 dias (antes 7). Simulação nos dados reais: 634 → 81 na hora. O robô da "petição juntada" e a agenda continuam lendo TODOS os avisos.
- Conexão direta com PJe/eproc (pergunta da usuária): desde 16/05/2025 a intimação do advogado particular é a PUBLICAÇÃO no DJEN e o prazo conta
  dela (art. 224 CPC; o PJe só repete essa conta). O DJEN já é lido pelo painel aberto/extensão. O webservice MNI do PJe/eproc exige login/
  certificado do advogado guardado no sistema e ABRIR o teor da comunicação por ele registra a CIÊNCIA — não usar.
- 8.53.2 (pedidos da usuária, 19/11/2026: "começar a usar as tarefas de verdade, bem designadas, copiando o ADVBOX"; "bairro no cadastro, o PJe
  pede"; "o que a pessoa fez, no Início"):
  - Tarefas com TIPO (coluna `categoria` em Tarefas; `CATEGORIAS_TAREFA` no Code.gs, `TIPOS_T` em painel.js): 📞 Falar com o cliente, 📝 Petição,
    📤 Protocolo, 🖋 Procuração / documentos, ⚖ Audiência / perícia, ⏱ Prazo / intimação, 🤝 Extrajudicial, 💰 Financeiro, 🗂 Administrativo,
    • Outro. As tarefas do robô ganham o tipo sozinhas (`categoriaTarefa_`: marcas [inicial:], [lembrete:], [intim:], [assinatura:], [valor:]… e o
    título; "Protocolar…" = protocolo). Lista do dia: chip colorido em cada linha, filtro "Tipo:" com contagem (`?cat=`), campo "Anotar" com o tipo
    (adivinha pelo texto — `adivinharTipo`) e botões de modelo "Começar por:" (como no ADVBOX). Formulário com "Tipo da tarefa" e responsável
    obrigatório (tarefa nova sem responsável fica com quem criou — `salvarTarefa_`). Quadro e Tabela mostram o tipo.
  - Início de TODOS os perfis: "✅ O que eu fiz" (`blocoOQueFiz`, Hoje | Semana | Mês, localStorage `fiz_per`): quantas tarefas e prazos a própria
    pessoa terminou, quantos no prazo, os tipos (chips) e a lista; busca sozinho `tarefas.listar` (dias 31; concluida_por = usuário ou nome).
  - Bairro: coluna própria `bairro` em Clientes (ESQUEMA, CAMPOS_CLIENTE, esquema.sql; ALTER já rodado no Supabase). O formulário mostra o campo
    preenchido (o endereço aparece sem o bairro no fim: `semBairroNoFim`) e o bairro continua no fim do `endereco` (procurações e contratos não
    mudam). A ficha mostra "Bairro" (ou "falta — o PJe pede"). /cadastro/ do site e o robô do WhatsApp também gravam a coluna.
- 8.53.3 (pedido da usuária: "arrumar intimações e DJEN para ficar eficiente antes de vender; arrumar a IA; robôs do site"):
  - DJEN × eproc: em 19/11, em 41 dos 66 prazos contados pela ciência do eproc (tácita/confirmada) o DJEN publicou o MESMO ato ~10 dias antes
    (ex.: ciência eproc 29/11, DJEN 19/11) → pela publicação o prazo vence 5 a 11 dias ANTES. A data do painel continua a do eproc (decisão da
    usuária na 8.19) até ela decidir; `prazoPublico_` devolve `fatal_djen`/`djen_pub` (DJEN do mesmo número de −2 a +4 dias da expedição;
    publicação = próximo dia útil) e a linha mostra "⚠ Pelo DJEN (publicado dd/mm) vence em dd/mm — faça até essa data" (`.ix-djen`; etiqueta
    também em `celulaOQueFazer`). PERGUNTA EM ABERTO para a usuária: passar a usar a data do DJEN (mais curta) como a data do prazo?
  - IA (`resumoIaLimpo_`, `prazoNoTexto_`): o aviso "⚠ ATENÇÃO: o texto fala em N dias" só fica se N está ESCRITO no texto (número ou extenso
    junto de "dias") e ainda difere do prazo ATUAL. Aplicado ao gravar (resumirIntimacoes_) e ao mostrar (prazoPublico_, filaPrazo_). Nos dados
    de 19/11: 11 avisos → 4 (6 velhos de prazos já corrigidos; 1 "8 dias" que não estava no texto). Sem o texto inteiro (outra publicação, texto
    cortado em 1.490+) confere só se ainda difere.
  - Tempo de robô (o Google para TODOS em 90 min/dia; em 19/11 já eram 110): `contarTempoRobo_(ms, nome)` guarda quanto cada robô gastou
    (Properties TEMPO_ROBO.por; `tempoRoboHoje_` devolve `por`/`porOntem`; cartão "Por robô: …"); os extras do robô de hora em hora e do de 6 em 6 h
    agora entram na conta. Cortes: conferir versão nova no GitHub de 30 em 30 min (AUTO_CONFERIDO_EM; antes a cada 10 min e de hora em hora),
    vencidos/atos no aquecedor de 20 em 20 min (AQUECER_LEVE_EM), DataJud 150 s por rodada (antes 270) e espera de 3 s no 429 (antes 8), tarefas
    pesadas do robô de 6 em 6 h com 210 s (antes 300).
  - DataJud: o CNJ limita a chave pública do país inteiro (429/timeout também saindo do Supabase — testado com função temporária, já apagada).
    Fila agora começa pelos processos com intimação nos últimos 15 dias (os que mudaram).
  - Robô do blog: em 16/11 não publicou nada (44 candidatas) porque a IA respondeu a escolha como objeto ({"escolhidas":[…]}) e o robô entendeu
    lista vazia. Agora aceita objeto/lista/números e, se a IA não escolher nenhuma, segue com as candidatas na ordem. Workflow "Publicar a função do
    Supabase" falhava em todo push por falta do segredo: agora só avisa e sai sem erro (a função é publicada pela atualização automática).
  - 19/11 (rodado à mão para recuperar a semana): a IA AINDA não escolheu nenhuma notícia e entrou "Justiça do Trabalho é premiada pelo CNJ por
    uso de linguagem simples" (institucional) → ocultada (`"oculto": true`). O robô agora: ignora as partes de "pensamento" da resposta
    (`textoDe` filtra `thought`), registra a resposta crua quando a IA não escolhe nada, e o plano B (`reserva`) tira as institucionais
    (`INSTITUCIONAL`) e alterna as áreas da vez.

## 8.54.0 Intimações com data certa, sem repetido e sem prazo a mais (pedido da usuária, 21/11/2026: "copiar o ADVBOX/Astrea… tudo certinho")

- Como o ADVBOX/Astrea fazem (ajuda pública; os sites deles não abrem desta nuvem): leem o diário (DJEN pela OAB) + o painel do tribunal com
  login/certificado, NUNCA abrem a intimação, cada intimação vira tarefa com responsável, a IA só sugere o prazo e uma pessoa confirma, a
  publicação duplicada vira uma só e o prazo conta da DATA DE PUBLICAÇÃO. Fizemos o equivalente sem guardar senha/certificado do tribunal.
- Achados nos 144 prazos abertos de 21/11 e as regras novas (`revisarPrazos_` categorias novas, rodam em toda rodada dos robôs do escritório
  'prazos823' e no botão "🔧 Revisar prazos"; `registrarIntimacao_` já não cria os próximos):
  1. eproc "Confirmada a intimação eletrônica" é avisada para QUALQUER parte (o MP confirma a vista dele em 3 dias): 10 de 10 prazos abertos
     vindos de confirmação eram falsos. Confirmação sem prazo aberto do mesmo ato e com expedição do eproc nos 20 dias antes
     (`expedicaoEprocAntes_`) → sem prazo (intimação fica "confirmação da intimação de dd/mm, já tratada"). Categoria `confirmacao`.
  2. PJe "Expedido(a) intimação/notificação a(o) X" quando o aviso não diz o nosso polo: X empresa × cliente pessoa (ou o contrário) = outra
     parte; "Mandado de intimação" = oficial de justiça, nunca prazo do advogado (`destinoPjeOutraParte_`, `ehPessoaJuridica_`). Duas pessoas
     com nomes diferentes: na dúvida fica. Categoria `outraparte`.
  3. eproc × DJEN: uma data só, a MAIS CURTA. Desde 16/05/2025 (Res. CNJ 569/2024; cartilha do TJSC sobre o eproc) o prazo do advogado conta
     da publicação no DJEN, que sai ~10 dias antes da ciência tácita do eproc. `djenDoPrazoEproc_` (DJEN disponibilizado de −2 a +4 dias da
     expedição) → ciência = publicação; anota "o eproc dava dd/mm". Se pela publicação já venceu e pelo eproc não, fica a do eproc com o aviso
     "⚠ Pelo DJEN venceu em …; o eproc dá até … — faça HOJE" (não vira "vencido" de repente). Categoria `djen`. Substitui a regra da 8.19
     ("eproc vale mais que o DJEN").
  4. Lembrete "ato:" cujo evento saiu da agenda (perícia lida no lugar da audiência, ato cancelado) → cancelado. Categoria `atoapagado`.
  5. Vencidos: o "Decorrido o prazo de <nosso cliente> em dd/mm/aaaa" do PJe (data ≥ a nossa, até 10 dias úteis depois) fecha o prazo na hora,
     sem esperar a margem; o prazo que o PRÓPRIO robô reabriu na 8.48 (e ninguém mexeu) volta a poder sair (antes ficava vencido para sempre).
     Reaberto por uma pessoa continua nunca saindo sozinho.
- NÃO fazer: "sem publicação no DJEN = não é nosso" — testado e descartado: contrarrazões no 2º grau do TJSC (5001200-33) não tinha DJEN e era nosso.
- DJEN pelo navegador/extensão (`djenImportar_`, `djenHistorico_`) dentro do `comTrava_`: robô gravando → "O sistema está ocupado" → o painel
  espera e manda de novo sozinho (antes a leitura inteira falhava com "O robô está gravando agora"; em 21/11 a última leitura completa era de 19/11).
- Linha do prazo em Intimações: "⟳ chegou dd/mm · via DJEN · publicado no DJEN dd/mm (ou ciência tácita/confirmada/publicação prevista) · N dias".
- Ensaio nos dados reais de 21/11 (sem gravar): 10 confirmações + 1 mandado + 1 perícia repetida saem, 36 prazos do eproc passam para a data da
  publicação, 5 vencidos fecham (2 pelo "Decorrido o prazo"); abertos sem audiência 144 → 128. Teste: `.github/motor/teste/etapa843.js` ("fim 854").

## 8.55.0 Intimações recebidas, INSS, comissão, horas, fatura, IA jurídica, lista do PJe (pedidos da usuária, 22–23/11/2026)

- Intimações › aba "Recebidas" (padrão): cada intimação (publicação do DJEN ou aviso de intimação/citação/notificação do PJe/eproc, desde
  Config CAIXA_DESDE, padrão 16/11/2026) fica "Para resolver" até alguém Resolver (confirmar a sugestão, lançar prazo/audiência/tarefa/evento/
  histórico) ou Concluir, ou Descartar (motivo; opcional cancelar o prazo do robô). Nomes do escritório: Para resolver / Resolvidas /
  Descartadas — NUNCA "não tratadas/tratadas" (pedido da usuária). Placar (chegaram hoje, resolvidas hoje, descartadas hoje, para resolver) +
  gráfico de 7 dias. Colunas Intimacoes.tratada_em/tratada_por/tratamento. Rotas intimacoes.caixa/obter/tratar (+ intimacoes.agendar para
  audiência/evento, que usa o Google Agenda). Tela #/intimacao/ID: texto com o trecho grifado, processo/cliente/em aberto/andamentos à direita,
  "✨ O que o painel sugere" (prazo + tarefas de preparação por ato, TAREFAS_ATO ou as da IA, com responsável e data, ✏️ editar, 👎 não sugerir,
  👍/👎 no prazo; aba IaAprendizado: recusada 2× e mais que aceita = some), "Próxima ›". O robô continua criando o prazo sozinho.
- Andamentos importantes (aba, `andamentos.importantes`/`visto`): sentença, acórdão, citação, audiência, perícia, alvará, acordo, penhora…
  (RE_IMPORTANTE_ menos as movimentações comuns) com "✓ Visto" e "✨ Explicar ao cliente" (`ia.explicarAndamento`: 3–5 frases simples, sem
  prazo/promessa; aba Explicacoes; `explicacoes.enviar` e-mail/WhatsApp/descartar). Robô `explicacoesRobo_`: Config EXPLICAR_AUTO aprovar
  (padrão: fica para revisar) | auto (manda o e-mail) | nao.
- Prazo: "Avisar X dias antes" (Prazos.alerta_dias → aviso no canto para o responsável) e etiqueta. Avisos por pessoa (Configurações › Meus
  avisos; Usuarios.avisos = os desligados; `eu.avisos`): intimação, prazo, PIX, andamento importante, chat. SEM verificação em 2 etapas (decisão).
- INSS (#/inss, menu Escritório; aba Inss; rotas inss.*): pedidos ADMINISTRATIVOS separados dos judiciais. Etapas INSS_ETAPAS (assinado →
  documentos → protocolado → análise → exigência / perícia → resultado → aprovado | indeferido → recurso → recurso negado → Justiça; arquivado),
  só os passos de INSS_PROXIMAS. Cada etapa cria/fecha tarefas `[inss:ID]`; exigência e recurso = 30 dias (Decreto 3.048, art. 305 § 1º) com
  tarefa urgente 5 úteis antes; perícia → avisos + agenda PERÍCIAS (`inss.agenda`); APROVADO lança o honorário parcelado; Justiça abre a
  petição inicial previdenciária. "✓ Assinado" previdenciário tem "Começa pelo INSS" (marcado) → cria o pedido em vez da inicial.
  "Trazer para o INSS" (`inss.trazer`) converte inicial previdenciária sem número. Tela: quadro por etapa e ficha com passos.
- Comissão de indicação (Clientes.indicado_por/indicacao_pct/indicacao_base exito|todos/indicacao_em; aba Comissoes): parcela paga DEPOIS
  de cadastrar a indicação → comissão "a pagar" (`registrarPagamento_` + robô `gerarComissoes_`); estorno cancela; Cobranças › Ferramentas ›
  Comissões de indicação: "Paguei" → despesa "Comissão de indicação" no Caixa (uma por indicador).
- Ficha do cliente: CTPS, PIS, CNH, mãe, pai, naturalidade, falecido/óbito, banco/agência/conta/Pix. Audiência: Presencial / Virtual / Híbrida
  + fórum + sala (Audiencias.forum/sala), também nas mensagens ao cliente (manual e automática).
- Horas (#/horas; aba Horas; horas.*): cronômetro "⏱ Horas" no topo (um por pessoa), lançar à mão ("1h30"), totais. Fatura (Cobranças ›
  Ferramentas › Fatura do cliente; fin.fatura / fin.fatura.gerar): parcelas a cobrar + horas faturáveis × valor da hora (Config VALOR_HORA) +
  despesas reembolsáveis → Doc + PDF; marca as horas faturadas.
- IA jurídica (Documentos › "Jurisprudência e peças (IA)", #/juridico): `ia.jurisprudencia` lê a base OFICIAL do STJ (SCON) e a IA só resume as
  ementas lidas (trava: citação fora da lista descarta o resumo); sem acesso → links oficiais prontos (STJ, TST, TRT12, TJSC, TNU, STF). NUNCA
  inventar julgado. `ia.peca`: rascunho (Google Docs, padrão de petição) com o histórico anonimizado + julgados marcados; "[NÃO CONSTA — conferir]".
- CRM (pedido da usuária: "fazemos o cadastro e não vai para o CRM"): `crmDadosCliente_` (ao salvar e nos robôs) leva ao cartão a área do
  cadastro, telefone, e-mail, assunto, canal ("Como nos conheceu?", só se o cartão não tem) e quem indicou.
- Perícia da Joyce (23/11): o aviso do PJe dizia só "perícia designada" (sigiloso) e a tarefa "abrir o processo e lançar na agenda" ficou parada
  desde 30/10. Agora `cobrarAtosSemData_` (robôs do escritório): tarefa parada vira URGENTE, aparece em VERMELHO no "Precisa de ação agora" de
  todos (há N dias, com quem) e o robô manda a lista no chat da equipe 1×/dia (Properties ATOS_SEM_DATA_CHAT). Havia 11 nessa situação.
- Lista de expedientes do PJe (pergunta da usuária: "no PJe é 23/11 e aqui não"): sem prazo no texto o painel usa o mais curto (5 dias, art.
  218 § 3º) = "Data de segurança"; o PJe mostra o prazo que a vara lançou. "📥 Trazer a lista do PJe" em Intimações (copiar a tela Expedientes e
  colar; prévia) e a extensão 1.4.0 (pje.js, páginas *.jus.br com "Expedientes") mandam a lista (`prazos.importarPje` / `ext.pjeLista`):
  prazo do painel fica IGUAL ao PJe (conferido, origem "vinculado ao PJe"), o que faltar vira prazo novo (pela extensão só com as 3 datas).
  Sem senha e sem abrir expediente (não dá ciência). Diego (0000011-37): ajustado à mão para 24/11 a pedido da usuária.
- Teste: `.github/motor/teste/etapa855.js` (caixa, sugestão, aprendizado, INSS, comissão, horas/fatura, lista do PJe, CRM, atos sem data, ficha).

## 8.56 Intimações direto do eproc (pedido da usuária, 23/11/2026: "monitorar as intimações que saem só nos portais", como o Astrea)

- Testado do Supabase (us-east e sa-east-1): o eproc do TJSC (1º e 2º grau), da JFSC e do TRF4 RESPONDE ao serviço oficial (MNI 2.2.2,
  `…/ws/controlador_ws.php?srv=intercomunicacao2.2`) e autentica com USUÁRIO + SENHA do eproc (não precisa de certificado). O PJe do TRT12 e do
  TST, o eproc do TJRS e o DJEN recusam servidores (403 antes de qualquer login: certificado não resolve) → esses ficam com o Chrome do escritório
  (extensão). TRT4, TRT9, TRT6 e o SSO do PJe (sso.cloud.pje.jus.br) aceitam servidores (certificado A1 no servidor só serviria para eles).
- Função `tribunais` do Supabase (supabase/functions/tribunais; `FUNCAO=tribunais node .github/motor/publicar-edge.mjs`): só administração
  (`painel_quem`); acao status | guardar (testa ANTES e só guarda se o eproc aceitar) | testar | apagar. Login no COFRE (`painel_trib_gravar`/
  `painel_trib_info`, só service_role; segredo trib_<tribunal>_<escritório>); resultado do último teste em painel_estado `tribunais`.
  REGRA DE OURO: só `consultarAvisosPendentes` (lista sem dar ciência); NUNCA `consultarTeorComunicacao` nem `confirmarRecebimento`.
- Painel: Configurações › Robôs e sistema › "⚖ Intimações direto do eproc" (`dialogoTribunais`, `PAINEL_BANCO.tribunais`). A senha vai do
  navegador direto à função (não passa pelo Google nem pela planilha).
- Falta (depois do teste com o login real): o robô de hora em hora importar as pendentes como intimações (cruzando com o DJEN) e a extensão
  ler o PJe do TRT12 sozinha.
