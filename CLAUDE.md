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
