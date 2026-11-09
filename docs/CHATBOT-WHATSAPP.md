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

## Como o robô conduz o primeiro atendimento (8.16)

1. **Oi / bom dia / tudo bem?** → ele cumprimenta, diz que é a assistente virtual do escritório e pergunta como pode ajudar.
2. **A pessoa conta o caso** → no máximo 2 ou 3 perguntas (o que aconteceu, desde quando, cidade).
3. **Entendeu o caso** → explica em termos gerais o que a Dra. costuma verificar nesse tipo de situação (sem dizer que a pessoa tem direito,
   sem valores nem prazos) e convida para um atendimento por ligação, vídeo ou no escritório.
4. **Aceitou** → manda 4 horários LIVRES da agenda (dias úteis, 8h–12h e 13h30–18h, sem bater com audiências, perícias e compromissos).
5. **Escolheu** ("2", "a primeira", "14h30", "amanhã de tarde") → marca na agenda ATENDIMENTOS, manda o link do cadastro, cria a tarefa
   "📅 Atendimento …" para a equipe e o cartão no CRM fica com a data. Daí em diante é com vocês.
6. **Remarcar / cancelar** → desmarca da agenda e oferece novos horários (ou só cancela) e avisa a equipe.
7. **Passa direto para a equipe**: urgência (preso, audiência hoje, despejo…), "quero falar com a doutora", pagamento/boleto/comprovante,
   parte contrária ou reclamação. **Não vira contato no funil**: fornecedor, propaganda, currículo, engano.
8. Parou no meio? Depois de 3 h, UMA mensagem gentil ("Conseguiu ver os horários?"), só no horário do escritório e dentro das 24 h do WhatsApp.

Ajustes na aba Config da planilha (opcionais): `WHATS_DURACAO` (minutos, padrão 30), `WHATS_ANTECEDENCIA_MIN` (padrão 60),
`WHATS_DIAS_AGENDA` (padrão 10), `WHATS_QUEM` (padrão "a Dra. Júlian"). Teste tudo antes em **🧪 Testar o robô** (conversa completa, nada é enviado nem marcado).

## Regras de atendimento (8.17, decididas pela Dra. Júlian)

- O robô fala como "o escritório Araújo Advocacia" e não abre dizendo que é robô. Se perguntarem diretamente ("é robô?"), responde a
  verdade em uma frase e oferece chamar a equipe. Nunca diz que é a Dra. nem inventa nome de pessoa.
- Sempre tenta entender o caso; se não entender, pede com gentileza para explicar melhor.
- **Sem valor de consulta:** trabalhista do empregado (30% no êxito) e previdenciário/INSS (2 primeiras parcelas no êxito): só marca.
- **R$ 300 (Config WHATS_VALOR):** família, cível, consumidor, bancário (revisão de juros), criminal, empresarial, inventário e o lado da
  empresa no trabalhista. Explicado depois de entender o caso, logo antes dos horários; pago no dia, ANTES do atendimento (Pix ou no
  escritório); descontado dos honorários se fechar. Atendimento de 1 hora.
- Achou caro: pergunta uma vez, de forma formal, o que pesou; a resposta vai para o CRM como "Não fechou — Preço — …".
- Depois de marcar: pede a qualificação por TEXTO (nome, nascimento, estado civil, profissão, CPF, RG, endereço com CEP, e-mail), confere o
  CPF, pede só o que faltou e cria/completa o cadastro. Depois manda a lista de documentos da área; cada foto/PDF fica na pasta reservada
  "PAINEL — DOCUMENTOS DO WHATSAPP (aguardando contrato)" e a IA diz só QUE documento é. "Pronto/enviei" → confere o que falta e anota na tarefa.
- Contrato assinado → os documentos vão para a pasta do cliente › DOCUMENTOS DO WHATSAPP (robô de hora em hora). 90 dias sem fechar → lixeira.
- Checagem de documento: R$ 300, Pix ANTES (dados em Config WHATS_PIX_TXT, editável em Configurar); trabalhista do empregado sem custo.
  Documento + comprovante → tarefa "🔎 Checagem" (conferir o Pix); resposta em até 2 dias úteis.
- Urgência criminal (preso, flagrante, delegacia): não fala valor nem marca; passa como URGENTE.
