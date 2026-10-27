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
- Ao revisar prazos, procure em tudo que tiver acesso: avisos do eproc e do PJe no Gmail (conta advogadajulianaraujo),
  DJEN (a consulta pública recusa o Google e esta nuvem, código 403) e a agenda. Nunca invente o conteúdo de um ato.

## Processos

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
- Contrato de honorários (modelos v4): cláusulas pedidas pela usuária — sucumbência integral, sustentação oral/TNU/STF fora,
  despesas (perícias, custas, diligências fora da comarca, deslocamento acima de 100 km), obrigações do cliente (documentos,
  mudança de telefone/endereço), vedado acordo sem anuência, obrigação de meio, desistência = 2 salários mínimos,
  descumprimento = multa de 5%, foro de Tubarão/SC. Mudou texto em TEXTO_MODELOS? Suba a versão das chaves (MODELO4_ → MODELO5_)
  para o Google Docs do modelo ser recriado.

## Layout

- No topo ficam só os tópicos (Início, Clientes, Processos, Intimações, Agenda, Modelos, Financeiro). Usuários, Trocar senha e Sair
  ficam no menu que abre ao clicar no nome.
- Início: atalhos para todos os tópicos (com números), e três quadros pequenos: Prazos (vencidos primeiro), Audiências e perícias
  (agenda + audiências dos processos, sem repetir) e Hoje.
- Processos: filtro de Área em cima, junto com Situação, Tribunal e Cliente (padrão sempre "Todos"); sem os botões de área.
- Tabelas de Processos e Intimações compactas: na coluna "Próximo ato" só o ato com a data completa ("Audiência 26/10/2026");
  o resumo da última movimentação aparece só ao abrir o processo.

## WhatsApp e Financeiro

- O WhatsApp não deixa ler conversas. O caminho é "Exportar conversa › Anexar mídia" para a pasta do Drive
  "ENTRADA DO WHATSAPP (exportar conversas aqui)". `processarWhatsapp_` (robô de 6 em 6 h e botão na ficha) acha o cliente pelo
  nome ou telefone, faz o PDF das fotos (uma por página, com data), a conversa em PDF e guarda vídeos/áudios numa subpasta
  na pasta do cliente. Também aceita subpasta da entrada com o nome do cliente. Zip acima de 48 MB não abre (limite do Google).
- Parcelas a vencer têm "Lembrar no WhatsApp" e as atrasadas "Cobrar no WhatsApp", com a mensagem pronta (wa.me).

## Login

- "Lembrar meu usuário" guarda só o nome de usuário no navegador; a senha fica no gerenciador de senhas do navegador
  (o painel pede para salvar). A sessão continua só na aba (sessionStorage) e cai ao fechar o navegador.
- Usuários: "Desconectar agora" derruba a pessoa em todos os aparelhos; "Desbloquear" tira o bloqueio de 15 min.

## Agenda e clientes

- Agenda em grade de horários (estilo Google Agenda) nas visões dia e semana. O filtro "Dra. Júlian" nunca mostra prazos fatais.
- Observações do cliente: cada anotação guarda data, hora e autor (`anotarCliente_`); não editar pelo formulário do cadastro.

## Segurança (versão 6)

- Senhas: HMAC-SHA256 com chave secreta nas Propriedades do script (CHAVE_SENHAS, fora da planilha), 1.000 rodadas e
  salt por usuário; prefixo "v2$". Senhas antigas (sem prefixo) são conferidas pela versão 1 e trocadas no login.
- Sessões: token de 96 caracteres; caem com 6 h sem uso, 12 h no total e 30 min parado no navegador. Trocar senha,
  mudar perfil ou desativar aumenta `sessao_versao` e derruba as sessões abertas.
- Login: 5 erros bloqueiam o usuário por 15 min; 30 erros no painel em 15 min travam todos os logins por 15 min.
- Cópia de segurança diária da planilha às 3h em "BACKUPS DO PAINEL (não compartilhar)", guardando 30 dias.
- Abas da planilha protegidas com aviso contra edição manual. Pedidos acima de 200 mil caracteres são recusados.
- Nunca colocar senha, CPF ou dado de cliente no repositório (é público).
