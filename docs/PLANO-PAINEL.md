# Painel interno — plano e decisões

Este documento guarda o que foi decidido para o painel interno do site
(araujoadvocaciasc.com.br/painel). Sessões futuras do Claude devem segui-lo.

## Decisões

| Tema | Decisão |
|---|---|
| Endereço | Mesmo domínio: botão **ENTRAR** no canto superior direito leva a `/painel/`. |
| Conta Google | Tudo na **advogadajulianaraujo@gmail.com** (Drive, Agenda, Gmail, programa). |
| Banco de dados | Planilha **PAINEL — BANCO DE DADOS** na pasta privada **00. PAINEL — DADOS**, lida por um Apps Script. Sem serviço externo. Nenhum dado de cliente vai para este repositório (ele é público). |
| Login | Usuário e senha próprios do painel. Senha com 10+ caracteres, letras e números, sem padrões óbvios. Bloqueio de 15 min após 5 erros. |
| Perfis | Administrador vê tudo. Secretário e Estagiário veem tudo menos Financeiro e Usuários. O acesso da Dra. Júlian ao financeiro fica para decidir depois. |
| GEA | Deixa de ser usado. Tudo dele (clientes com processo, processos, agenda, cobrança) é importado para o painel. |
| Cadastro | Só os dados que procuração e contrato exigem: nome, CPF/CNPJ, RG, nascimento, estado civil, profissão, representante (PJ), endereço, telefone, e-mail, origem, área, observações. |
| Pastas | Cliente importado é ligado à pasta que já existe em **02. CLIENTES**; cliente novo ganha pasta nova (NOME EM MAIÚSCULAS) com a ficha. Procuração e contrato entram na pasta na etapa 4. |
| Prazos | Mostrar "Prazo: X dias úteis · Fatal: dd/mm · Faltam N dias", recalculado todo dia, verde (>5), amarelo (3–5), vermelho (≤2), "VENCE HOJE". Prazo calculado pelo robô fica com a etiqueta **"calculado pelo robô"** até a advogada clicar em **"conferido"**; não conferidos ficam no topo. |
| Fontes de intimação | DJEN pela OAB/SC 54832 e avisos no Gmail (eproc TJSC, eproc JFSC, PJe TRT12 1º e 2º grau, TRT16). |
| Robô | Roda todo dia às 6h, mais botão "Atualizar agora" no painel. Sem e-mail de resumo (a equipe olha o painel todo dia). |
| Agenda | Tabela dia/semana/mês lendo as agendas ATENDIMENTOS, AUDIÊNCIA CONCILIAÇÃO e AUDIÊNCIA INSTRUÇÃO (não "Família" nem "UNEMAT"), com os prazos fatais do dia. O que for marcado no painel vai para a agenda certa. |
| Feriados | 2026–2027: nacionais, SC, comarcas atendidas (Tubarão, Imbituba, Criciúma, Florianópolis, Garopaba, Armazém, Braço do Norte, Capivari de Baixo, Jaguaruna) e recesso de 20/12 a 20/01. Administrador pode acrescentar suspensões. |
| Financeiro | Controle de honorários, parcelas, vencimentos e atrasos. Fonte principal: GEA; também Google Agenda. Planilhas "Honorários Araújo — levantamento e conciliação" e "Clientes devedores" entram para conferência, marcando divergências. |
| Modelos | A usuária indica depois os modelos oficiais (procuração, contrato de honorários, contrato de prestação de serviços). Gerados a partir do cadastro do painel. |

## Etapas

1. **Feita (este envio):** botão ENTRAR, login, perfis, usuários, clientes, processos, pastas no Drive, carga inicial do levantamento de 23/10/2026 (68 clientes, 117 processos, 43 sem cliente).
2. Intimações e prazos (DJEN + Gmail, contagem, "conferido"), agenda dia/semana/mês, feriados.
3. Financeiro.
4. Modelos de procuração e contratos.

## Importação do GEA (precisa de sessão local com Claude in Chrome)

A sessão na nuvem não alcança o GEA. Para importar:

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
