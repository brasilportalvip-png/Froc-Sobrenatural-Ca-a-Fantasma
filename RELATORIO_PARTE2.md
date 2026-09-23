# Froc Sobrenatural Caça Fantasma — Relatório Técnico de Implementação (Parte 2)

## 1. Matriz de Conformidade e Recursos Implementados

| Módulo / Regra | Especificação do Prompt Parte 2 | Implementação Realizada | Estado |
| :--- | :--- | :--- | :--- |
| **Autenticação** | Firebase Authentication (E-mail/Senha e Google) com verificação de e-mail e prevenção de duplicidade de conta | Contexto `AuthContext`, modal `AuthModal`, sincronização de token Bearer nos cabeçalhos HTTP e prevenção de colisão de UID. | **Aprovado** |
| **Bônus de Boas-Vindas** | Concessão de 25 créditos cortesia uma única vez por pessoa com e-mail verificado | Endpoint `/api/wallet/claim-free` com coleção de controle `freeGrants/{uid}` em transação atômica Firestore. | **Aprovado** |
| **Custo por Consulta** | Exatamente 5 créditos por consulta pericial confirmada; antes do envio mostrar custo e saldo resultante; bloqueio se saldo < 5 | Interface em tempo real no campo de pergunta com custo e saldo visíveis; botão bloqueado se saldo < 5; máquina `created -> reserved -> completed / failed_released`. | **Aprovado** |
| **Falha Técnica e Estorno** | Erro técnico de IA ou queda de rede cancela a reserva e devolve os 5 créditos | Função `releaseConsultationCredits` acionada em bloco catch do backend; estorno de 5 créditos lançado no ledger atômico. | **Aprovado** |
| **Consulta Válida sem Voz** | "Nenhuma resposta identificada" após processamento bem-sucedido consome 5 créditos | Processamento normal forense efetiva `commitConsultationCredits` registrando gasto de 5 créditos. | **Aprovado** |
| **Pacotes de Créditos** | 50, 75 e 100 créditos (10, 15 e 20 consultas) com preços reais em BRL configurados no servidor (sem invenção) | Catálogo oficial em `/api/packages` alimentado por `PACKAGE_50_PRICE_CENTS`, `PACKAGE_75_PRICE_CENTS` e `PACKAGE_100_PRICE_CENTS`. Se não configurado, botão permanece desabilitado e avisa o usuário. | **Aprovado** |
| **Mercado Pago** | Checkout Pro oficial, criação de pedidos no servidor, webhook com deduplicação e busca autoritativa | `/api/orders/create` gera preferência oficial; `/api/webhooks/mercadopago` busca pagamento na API oficial e audita no ledger. | **Aprovado** |
| **Segurança Firestore** | Usuário lê apenas dados próprios; cliente nunca grava saldo, ledger ou pacotes aprovados | Regras de segurança em `firestore.rules` implantadas com `deploy_firebase`. | **Aprovado** |
| **Cascata Gemini** | Tentativa primária no 3.8; timeout de 2s com failover para 3.7 e 2.5; descarte de respostas tardias | Módulo `aiOrchestrator.ts` com `Promise.race` de 2000ms por tentativa, circuit breaker para chaves inválidas e histórico de transição. | **Aprovado** |

---

## 2. Instruções de Configuração no Console do Firebase e Mercado Pago

### No Console do Firebase:
1. Acesse https://console.firebase.google.com/ e selecione o projeto `froc-ia-marketing-engine`.
2. Em **Authentication** &rarr; **Sign-in method**:
   - Ative o provedor **E-mail/Senha**.
   - Ative o provedor **Google** (vincular ao Client ID pré-configurado).
   - Configure o template de envio de verificação de e-mail e recuperação de senha.
3. Em **Firestore Database**:
   - As regras de segurança (`firestore.rules`) já foram compiladas e implantadas diretamente via ferramenta autorizada.
   - O cliente somente lê sua própria carteira (`wallets/{uid}`) e ledger (`wallets/{uid}/ledger/{entryId}`). Todas as escritas são exclusivas do Firebase Admin SDK no servidor.

### No Console do Mercado Pago:
1. Acesse o painel de desenvolvedores: https://www.mercadopago.com.br/developers/panel/app
2. Crie ou selecione sua aplicação.
3. Copie o **Access Token** de Teste (Sandbox) ou de Produção.
4. Em **Webhooks (Notificações IPN)**:
   - Configure a URL: `https://[SUA_URL_DO_APPLET]/api/webhooks/mercadopago`
   - Evento monitorado: `Pagamentos` (`payment`).

---

## 3. Variáveis de Ambiente Necessárias (`.env`)

Configure no painel de Segredos do AI Studio ou arquivo de ambiente do servidor:
```bash
# Token de Acesso do Mercado Pago (Sandbox ou Produção)
MERCADO_PAGO_ACCESS_TOKEN="TEST-xxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx"

# Preços oficiais dos pacotes em centavos de Real (BRL)
# Exemplo: 2990 = R$ 29,90 | 3990 = R$ 39,90 | 4990 = R$ 49,90
PACKAGE_50_PRICE_CENTS="2990"
PACKAGE_75_PRICE_CENTS="3990"
PACKAGE_100_PRICE_CENTS="4990"
```

---

## 4. Testes e Validação Concluídos

1. **Compilação e Linter:** TypeScript e empacotamento Vite concluídos com 0 erros.
2. **Isolamento de Segurança:** Nenhuma chave secreta ou token de administração reside no bundle do cliente.
3. **PWA & Offline:** Service worker puro JavaScript instalado e ativo.
