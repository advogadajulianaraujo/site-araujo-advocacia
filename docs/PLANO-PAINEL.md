# Painel interno — plano e decisões

Este documento guarda o que foi decidido para o painel interno do site
(araujoadvocaciasc.com.br/painel). Sessões futuras do Claude devem segui-lo.

## Decisões

| Tema | Decisão |
|---|---|
| Endereço | Mesmo domínio: botão **ENTRAR** no canto superior direito leva a `/painel/`. |
| Conta Google | Tudo na **advogadajulianaraujo@gmail.com** (Drive, Agenda, Gmail, programa). |
| Banco de dados | Planilha **PAINEL — BANCO DE DADOS** na pasta privada **00. PAINEL — DADOS**, lida por um Apps Script. Sem serviço externo. Nenhum dado de cliente vai para este repositório (ele é público). |
| Login | Usuário e senha próprios do painel, criados pelo administrador. Qualquer senha é aceita (decisão do dono). Bloqueio de 15 min após 5 erros seguidos. |
| Perfis | Administrador vê tudo. Advogada vê tudo menos Financeiro e Usuários e é quem clica em "conferido" nos prazos (junto com o Administrador). Secretário e Estagiário veem tudo menos Financeiro e Usuários e não conferem prazos. O acesso da Dra. Júlian ao financeiro fica para decidir depois. |
| GEA | Deixa de ser usado. Tudo dele (clientes com processo, processos, agenda, cobrança) é importado para o painel. |
| Cadastro | Novo cliente pede só o que procuração e contrato exigem. Obrigatórios: nome, CPF/CNPJ, RG e profissão (pessoa física) e endereço. Opcionais: nascimento, estado civil, representante (PJ), CEP (preenche rua e cidade pelo ViaCEP), cidade, UF, telefone, e-mail e como chegou. Tipo de ação e área são escolhidos depois, ao gerar os documentos. |
| Pastas | Cliente importado é ligado à pasta que já existe em **02. CLIENTES**; cliente novo ganha pasta nova (NOME EM MAIÚSCULAS) com a ficha. Procuração e contrato entram na pasta na etapa 4. |
| Prazos | Cada prazo mostra o **número do processo**, "Prazo: X dias úteis · Fatal: dd/mm", **quantos dias e horas faltam**, contando até as **23h59 do dia fatal** (limite do eproc e do PJe), ex.: "Fatal: 10/11 · faltam 2 dias e 5 horas" e um **link para o sistema do tribunal** (PJe abre o processo; eproc abre o login, com botão para copiar o número). Formato base: "Prazo: X dias úteis · Fatal: dd/mm · Faltam N dias", recalculado todo dia, verde (>5), amarelo (3–5), vermelho (≤2), "VENCE HOJE". Prazo calculado pelo robô fica com a etiqueta **"calculado pelo robô"** até a advogada clicar em **"conferido"**; não conferidos ficam no topo. |
| Fontes de intimação | DJEN pela OAB/SC 54832 e avisos no Gmail (eproc TJSC, eproc JFSC, PJe TRT12 1º e 2º grau, TRT16). |
| Prazo sem data | **Proibido.** Quando o aviso não diz o ato, o robô usa o prazo provisório mais curto (5 dias) marcado "provisório · conferir"; prazos antigos "a definir" são definidos a cada rodada. Detalhes em CLAUDE.md. |
| Processos arquivados | Ficam no painel com filtro Em andamento / Arquivados; a situação vem da última movimentação e o histórico antigo do Gmail é lido aos poucos pelo robô. |
| Robô | Roda **de 6 em 6 horas** (0h, 6h, 12h, 18h), sempre buscando prazos novos e recalculando os que faltam, mais botão "Atualizar agora" no painel. Sem e-mail de resumo. |
| Agenda | Tabela dia/semana/mês lendo as agendas ATENDIMENTOS, AUDIÊNCIA CONCILIAÇÃO e AUDIÊNCIA INSTRUÇÃO (não "Família" nem "UNEMAT"), com os prazos fatais do dia. O que for marcado no painel vai para a agenda certa. |
| Feriados | 2026–2027: nacionais, SC, comarcas atendidas (Tubarão, Imbituba, Criciúma, Florianópolis, Garopaba, Armazém, Braço do Norte, Capivari de Baixo, Jaguaruna) e recesso de 20/12 a 20/01. Administrador pode acrescentar suspensões. |
| Financeiro | Controle de honorários, parcelas, vencimentos e atrasos. Fonte principal: GEA; também Google Agenda. Planilhas "Honorários Araújo — levantamento e conciliação" e "Clientes devedores" entram para conferência, marcando divergências. |
| Modelos | Oito modelos em Google Docs editáveis: procuração, declaração de hipossuficiência, declaração de residência, termo LGPD, contrato de honorários, contrato de prestação de serviços (extrajudicial), contrato de assessoria (mensal) e recibo. Ao gerar, escolhe-se cliente, advogado(a) outorgado(a) (aba Advogados), tipo de ação (preenche finalidade e poderes específicos) e a forma dos honorários: percentual, à vista, parcelado, fixo + percentual, mensal ou o honorário já cadastrado, com opção de lançar no Financeiro. Os modelos oficiais do escritório (no Drive) ainda serão enviados pela usuária para substituir os textos iniciais. |

## Publicação

A branch `painel-etapa-1` só vai para `main` (site no ar) depois que a sessão local terminar a instalação no Google e gravar a URL /exec em `painel/config.js`. Assim o botão ENTRAR já abre um painel funcionando.

## Etapas

1. **Feita (este envio):** botão ENTRAR, login, perfis, usuários, clientes, processos, pastas no Drive, carga inicial do levantamento de 23/10/2026 (68 clientes, 117 processos, 43 sem cliente).
2. **Feita:** robô de 6 em 6 horas (Gmail: eproc TJSC/JFSC e PJe TRT; DJEN pela OAB/SC 54832), prazos com ciência confirmada/tácita (10 dias)/publicação DJEN, sugestão de dias (sentença: apelação 15 úteis, recurso ordinário 8, recurso inominado 10, apelação criminal 5 corridos; texto do DJEN com "prazo de N dias"), "prazo a definir" quando não há como saber, Conferir/Cumprido, feriados 2026–2027 e recesso, agenda dia/semana/mês com as três agendas e os prazos fatais, marcação de compromisso.
3. **Feita:** Financeiro só para administrador: honorários parcelado, êxito e mensal; parcelas com situação (a vencer, atrasada, paga); atraso por faixa (até 30, 31–90, +90 dias); fluxo de cobrança atraso → WhatsApp com texto pronto → ação; alvará com cálculo de honorários e repasse; mensalidades geradas automaticamente; importação da planilha "Honorários Araújo — levantamento e conciliação" (dados tirados do GEA) como "importado — conferir".
4. **Feita:** audiências e perícias das intimações na agenda; aba Intimações; relatório de cumpridos; Início; clientes por área; processos por área; modelos.
5. **Feita (27/10/2026):** cadastro enxuto; ficha mostra o que tem na pasta (procuração, contrato, honorário, declarações e quantos outros arquivos); gerador com oito modelos, advogados, tipos de ação e formas de honorário; área dos processos pelas partes do aviso do eproc (criminal, família, cível, consumidor, previdenciário, federal, trabalhista); tela de Intimações com cartão do robô, contadores por urgência, filtros e cores; robô religado sozinho se o gatilho sumir e rodado pelo painel se atrasar.

## Sessão local com Claude in Chrome: instalação e importação do GEA

A sessão na nuvem não alcança o GEA nem o editor do Apps Script. A sessão local, com o Chrome aberto na conta advogadajulianaraujo, faz as duas coisas:

**A. Instalar o programa do painel** seguindo painel-backend/INSTALAR.md: abrir a planilha PAINEL — BANCO DE DADOS, colar Code.gs e appsscript.json no Apps Script, rodar Painel → Configurar planilha, autorizar, implantar como App da Web (executar como eu; qualquer pessoa) e gravar a URL /exec em painel/config.js. Enviar o commit para a branch painel-etapa-1.

**B. Importar o GEA:**

1. No computador do escritório, instale a extensão **Claude in Chrome** e entre no GEA pelo Chrome.
2. Abra o aplicativo Claude, inicie uma sessão **local** do Claude Code neste repositório e peça:
   "Importe do GEA para o painel, seguindo docs/PLANO-PAINEL.md".
3. A sessão deve:
   - abrir o GEA no Chrome e, cliente por cliente (só os que têm processo), copiar os campos do cadastro listados acima;
   - casar cada cliente com os já importados pelo nome (sem acento, minúsculas) e pelo número do processo;
     completar os campos vazios, sem apagar o que já estiver preenchido no painel;
   - identificar o cliente dos 43 processos "a identificar" pelo número;
   - copiar a cobrança (honorários, parcelas, vencimentos, pagos/atrasados) para a etapa 3;
   - gravar tudo na planilha PAINEL — BANCO DE DADOS (pelo Drive ou pelo painel), nunca neste repositório;
   - marcar como "importado — conferir" o que tiver dúvida.
4. Depois da importação: bloquear os acessos ao GEA e cancelar a assinatura.

## Pendências de segurança

- O PDF "Passo a passo GEA Agenda.pdf" no Drive tem a senha do usuário Estagiário do GEA em texto aberto. Aprovado: tirar a senha do PDF e trocar a senha no GEA.

## Para fazer no futuro (pedido do dono em 26/10/2026)

- **Cópia de segurança semanal** da planilha PAINEL — BANCO DE DADOS numa pasta do Drive (gatilho do Apps Script).
- **Alarme de robô parado:** se o robô não ler nenhuma intimação em 3 dias úteis, aviso vermelho no painel e e-mail para advogadajulianaraujo@gmail.com.
- **Lembrete de feriados:** em novembro de 2027, aviso no painel para carregar os feriados forenses de 2028.
- **DJEN:** a consulta pública recusa os servidores do Google (código 403, visto na primeira execução em 26/10/2026). Hoje as intimações chegam pelos avisos do eproc e do PJe no Gmail. Se for preciso o DJEN, avaliar um intermediário hospedado no Brasil.

## Manutenção

- Renovar o domínio no Registro.br todo ano.
- Manter a conta Google advogadajulianaraujo com verificação em duas etapas e recuperação atualizada.
- Se chegar e-mail do Google sobre "falha de execução" do robô, abrir o Apps Script e rodar instalarRobo de novo.
