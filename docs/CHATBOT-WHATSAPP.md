# Chatbot do WhatsApp — como ligar (passo a passo)

O robô atende pelo **número oficial do escritório**, usando a API oficial do WhatsApp (Meta). Nada de aplicativo pirata: o número
não corre risco de bloqueio. Ele responde dúvidas, faz a triagem do caso, consulta o processo (com CPF + código do Acompanhe),
transcreve áudios, pede para marcar a consulta (a equipe confirma) e leva cada contato para o **CRM / Funil**. Urgências
("preso", "audiência amanhã", "liminar"…) e quem pede "falar com a doutora" vão direto para a equipe (tarefa + e-mail) e o robô
para de responder naquela conversa.

Tempo total: cerca de 1 hora (a maior parte é esperar o Meta aprovar).

## 1. Conta do Meta (WhatsApp Business Platform)

1. Entre em **business.facebook.com** com a conta do escritório e confirme que existe o "Portfólio empresarial" Araújo Advocacia.
   Em Configurações › Central de segurança, faça a **verificação da empresa** (CNPJ 46.000.441/0001-94, comprovante de endereço).
2. Entre em **developers.facebook.com** › Meus apps › **Criar app** › tipo **Empresa** › adicione o produto **WhatsApp**.
3. Em WhatsApp › Primeiros passos, **adicione o número do escritório**.
   - Se o número continua no **aplicativo WhatsApp Business do celular**, escolha a opção de **usar o mesmo número no aplicativo e na
     API** ("coexistência", conectar o app do WhatsApp Business). Assim a equipe continua respondendo pelo celular e o robô entende
     que, quando alguém responde pelo celular, ele deve ficar quieto por 3 horas naquela conversa.
   - Se a opção não aparecer, use um número novo só para o robô (pode ser um chip novo).
4. Anote o **Phone number ID** (WhatsApp › Configuração da API).
5. **Token permanente**: Configurações do negócio › Usuários › **Usuários do sistema** › Adicionar (Administrador) › Gerar token ›
   escolha o app, marque `whatsapp_business_messaging` e `whatsapp_business_management`, validade **Nunca**. Copie o token (começa com EAA).
6. **Chave secreta do app**: no app › Configurações › Básico › **Chave secreta do aplicativo** (App Secret). Copie.

## 2. Ponte gratuita na Cloudflare (recebe as mensagens)

1. Crie uma conta grátis em **dash.cloudflare.com** › **Workers e Pages** › **Criar** › **Worker** › nome `whatsapp-araujo` › Implantar.
2. Clique em **Editar código**, apague tudo e cole o arquivo **`chatbot/worker.js`** deste site
   (https://raw.githubusercontent.com/advogadajulianaraujo/site-araujo-advocacia/main/chatbot/worker.js). **Implantar**.
3. Worker › Configurações › **Variáveis e segredos** › adicione como **Segredo**:
   - `VERIFY_TOKEN`: uma senha que você inventa (ex.: uma frase sem espaços);
   - `APP_SECRET`: a chave secreta do app (passo 1.6);
   - `PAINEL_URL` e `PAINEL_CHAVE`: copie do painel em **Conversas do WhatsApp › ⚙ Ligar / configurar**.
4. Anote o endereço da ponte (ex.: `https://whatsapp-araujo.SEU-NOME.workers.dev`).

## 3. Ligar o retorno no Meta

No app do Meta › WhatsApp › **Configuração** › Webhook › Editar:
- **URL de retorno**: o endereço da ponte;
- **Token de verificação**: o mesmo `VERIFY_TOKEN`;
- Verificar e salvar. Depois, em "Campos do webhook", **assine `messages`** (e `smb_message_echoes` se usar a coexistência).

## 4. No painel

**Relacionamento › Conversas do WhatsApp › ⚙ Ligar / configurar**:
1. Cole o **token** e o **Phone number ID**; escolha quem recebe as tarefas; **Salvar**.
2. **Mandar um teste** para o seu celular.
3. Use **🧪 Testar o robô** para ver como ele responde (não manda nada a ninguém).
4. Marque **Robô respondendo sozinho** e salve. Pronto.

Precisa também da chave do Gemini (Gerenciar acessos › IA), que o painel já usa nos resumos.

## Como funciona no dia a dia

- Cada conversa aparece em **Conversas do WhatsApp**: o robô responde; a equipe vê tudo e pode responder por ali (o robô pausa).
  "✋ Assumir" pausa o robô; "🤖 Devolver ao robô" religa.
- Contato novo vira cartão no **CRM / Funil** (canal WhatsApp), com área, resumo do caso e o dia que a pessoa prefere para a consulta.
- No **Início** da administração aparecem as conversas esperando a equipe.
- Regras do robô: sempre se apresenta como assistente virtual; não dá parecer, não fala valores nem prazos, não promete resultado
  (Código de Ética e Provimento 205/2021 da OAB); não pede CPF a não ser para consultar o processo; avisa sobre a LGPD.
- O WhatsApp só deixa responder livremente até **24 horas** depois da última mensagem do cliente. Depois disso, responda pelo celular
  (ou espere o cliente escrever de novo).
- Custos do Meta: responder a quem escreveu (dentro das 24 h) é gratuito; mensagens iniciadas pelo escritório (modelos) são pagas.
