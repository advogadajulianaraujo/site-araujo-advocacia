# Como ligar o painel ao Google (uma vez só, cerca de 10 minutos)

Estes passos podem ser feitos por uma sessão local do Claude com a extensão Claude in Chrome,
no computador onde a conta Google está aberta (veja docs/PLANO-PAINEL.md).

Faça tudo logado na conta **advogadajulianaraujo@gmail.com**.

## 1. Abrir a planilha-banco

1. No Google Drive, abra a pasta **00. PAINEL — DADOS (não compartilhar)**.
2. Abra a planilha **PAINEL — BANCO DE DADOS**.
3. Não compartilhe essa planilha nem a pasta com ninguém. A equipe entra só pelo painel.

## 2. Colar o programa

1. Na planilha, clique em **Extensões → Apps Script**.
2. Apague tudo o que estiver no arquivo `Code.gs` e cole o conteúdo de
   [`painel-backend/Code.gs`](Code.gs).
3. Clique na engrenagem (**Configurações do projeto**), marque
   **Mostrar arquivo de manifesto "appsscript.json" no editor**, volte ao editor,
   abra `appsscript.json` e troque o conteúdo pelo de [`painel-backend/appsscript.json`](appsscript.json).
4. Clique em **Salvar** (ícone de disquete).

## 3. Configurar e importar os clientes

1. Volte à aba da planilha e recarregue a página (F5). Aparece o menu **Painel**.
2. Clique em **Painel → 1. Configurar planilha**.
3. O Google pede autorização. Escolha a conta advogadajulianaraujo, clique em
   **Avançado → Acessar (não seguro)** e depois em **Permitir**.
   O aviso de "não verificado" aparece porque o programa é seu, não de uma empresa publicada.
4. Rode **Painel → 1. Configurar planilha** de novo, se a primeira vez só pediu a autorização.
5. Vai aparecer: *Importados 68 clientes e 117 processos* e o **código de primeiro acesso**.
   O código também fica na aba **Config**.

## 4. Publicar

1. No Apps Script, clique em **Implantar → Nova implantação**.
2. Em "Selecionar tipo", escolha **App da Web**.
3. **Executar como:** Eu (advogadajulianaraujo@gmail.com).
   **Quem pode acessar:** Qualquer pessoa.
   (Precisa ser "qualquer pessoa" para o site conseguir falar com o programa. Quem protege os dados
   é o login do painel: sem usuário e senha válidos, o programa não entrega nada.)
4. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).
5. Envie esse endereço ao Claude, ou cole em `painel/config.js`:
   `window.PAINEL_API_URL = 'https://script.google.com/macros/s/.../exec';`

## 5. Primeiro acesso

1. Abra **araujoadvocaciasc.com.br/painel** (ou clique em **ENTRAR** no site).
2. Clique em **Primeiro acesso: criar o administrador**.
3. Informe o código da aba Config, seu nome, um usuário e uma senha.
4. Entre e crie os outros usuários em **Usuários**.

## Ligar o robô de prazos (etapa 2)

1. No Apps Script, escolha a função **configurar** e clique em **Executar** (cria as abas Intimacoes e Prazos e carrega os feriados).
2. Escolha a função **instalarRobo** e clique em **Executar**. O Google pede permissão para ler o Gmail, a Agenda e acessar o DJEN: autorize.
   O robô passa a rodar sozinho de 6 em 6 horas e já faz a primeira leitura (últimos 30 dias do Gmail e 15 do DJEN).
3. Implante uma nova versão (abaixo).

## Financeiro (etapa 3)

1. Cole o `Code.gs` novo e salve.
2. Rode a função **configurar** (cria as abas Honorarios, Parcelas e Recebimentos).
3. Rode a função **importarHonorariosPlanilha**: lê as abas Cobranças, Mensalistas e Parcelas GEA da planilha
   "Honorários Araújo — levantamento e conciliação" e cria tudo como "importado — conferir".
4. Implante uma nova versão (abaixo).

## Importação do GEA

1. Deixe as planilhas **GEA — clientes** e **GEA — financeiro** na pasta **00. PAINEL — DADOS**.
2. Cole o `Code.gs` novo e salve.
3. Rode **configurar**. A importação roda junto, uma vez só. Se ninguém rodar, o robô faz a importação sozinho na próxima rodada.
4. O resultado fica na aba **Config**: em **GEA_IMPORTADO** quando deu certo, ou em **GEA_ERRO** quando deu erro.
   Para importar de novo, apague o valor de GEA_IMPORTADO.

## Pastas dos clientes

O **configurar** (ou o menu **Painel → 2. Vincular pastas**) liga cada cliente à pasta dele em **02. CLIENTES**:
primeiro pelo nome igual, depois pelo nome parecido (erro de digitação, nome incompleto, "- IMBITUBA", "(DATIVA)",
pasta com duas pessoas). Só liga quando há um único cliente possível. As pastas que sobraram ficam na aba
**PastasConferir**; para ligar à mão, abra a ficha do cliente no painel → Editar → cole o link da pasta.

## Modelos e advogados (versão 5)

Ao rodar **configurar**, o painel cria a aba **Advogados** com a Dra. Júlian como padrão. Outros advogados são
cadastrados na aba Modelos do painel (só administrador). Na primeira vez que alguém abre a aba Modelos, o painel cria
os oito modelos na pasta **MODELOS (editáveis)**; os dois modelos antigos ficam renomeados como "ANTIGO — ...".

O **configurar** também classifica a área dos processos que estão sem área, lendo os avisos do eproc no Gmail
(fica anotado "Área definida pelo sistema: conferir" nas observações do processo). O robô continua a classificação
nas rodadas seguintes, se sobrar algum.

## Quando o programa for atualizado

Cole o novo `Code.gs` por cima do antigo, salve e vá em
**Implantar → Gerenciar implantações → lápis (editar) → Versão: Nova versão → Implantar**.
O endereço `/exec` continua o mesmo.

## Perfis

| Perfil | Vê |
|---|---|
| Administrador | Tudo, inclusive Financeiro e Usuários; confere prazos |
| Advogada | Tudo, menos Financeiro e Usuários; confere prazos |
| Secretário | Tudo, menos Financeiro e Usuários |
| Estagiário | Tudo, menos Financeiro e Usuários |

Depois de 5 senhas erradas, o usuário fica bloqueado por 15 minutos. Toda entrada, alteração
e tentativa recusada fica registrada na aba **Log**.
