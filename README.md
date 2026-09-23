# Froc Sobrenatural Caça Fantasma

> **Estação de investigação com registro local de evidências, análise de áudio, sensores disponíveis, câmera e teste cego local.**

---

## 🔬 Visão e Filosofia do Produto

O **Froc Sobrenatural Caça Fantasma** registra observações para investigação, separando medições e hipóteses. Registros locais podem ser editados ou apagados pelo titular do dispositivo e não são uma cadeia de custódia imutável:

1. **Cadeia de Evidência Rigorosa**: Cada ocorrência exibe o dado bruto original, a hora exata, o deslocamento temporal na sessão, os valores de sensores no instante, a confiança calibrada e hipóteses alternativas físicas (como interferência de RF, ruído térmico do microfone, reflexo de lente ou pareidolia auditiva).
2. **Separação Visual Absoluta**:
   - `[1] Pergunta do Investigador`
   - `[2] Sinal Medido (dBFS, Hz, µT, m/s²)`
   - `[3] Transcrição Candidata (com incerteza calibrada)`
   - `[4] Análise da IA (Gemini ou Motor DSP Local)`
   - `[5] Informação Verificada`
3. **Ausência de Resposta Honestamente Reportada**: Quando um sinal não contém fonemas humanos inteligíveis ou está abaixo do piso de ruído, o sistema reporta categoricamente: **“Nenhuma resposta identificada.”**
4. **Preservação de Mídias Originais**: Filtros passa-faixa (300Hz - 3.4kHz) são processados como cópias digitais separadas via Web Audio API; o arquivo bruto de áudio gravado permanece intacto.
5. **Teste Duplo-Cego Criptográfico**: Respostas de controle são seladas com hash SHA-256 e obscurecidas localmente antes da formulação de hipóteses, impossibilitando que a IA ou o investigador leiam o conteúdo antes da revelação.

---

## 🛠️ Stack Tecnológica

- **Frontend**: React 19 + TypeScript + Vite 8
- **Estilização**: Tailwind CSS v4 (estética de laboratório avançado com fundo `#05080f`, acentos ciano neon `#00f0ff` e verde frio espectral `#00ffb3`)
- **PWA**: `vite-plugin-pwa` com Service Worker, manifesto W3C, ícones (192px, 512px, maskable, apple-touch-icon) e botão de instalação in-app com suporte a iOS Safari e Chromium
- **Áudio & DSP**: Web Audio API (`AudioContext`, `AnalyserNode`, `BiquadFilterNode`, `OfflineAudioContext`, decibéis digitais `dBFS`)
- **Sensores**: W3C Generic Sensor API (`Magnetometer`) e `DeviceMotionEvent` triaxial
- **Persistência**: IndexedDB nativo (armazenamento de sessões, eventos, fotos em alta resolução e blobs de áudio sem perda de sessão após reload)
- **Backend & Inteligência Artificial**: Node.js + Express + `@google/genai` (modelo `gemini-3.8-flash` para análise forense e consultoria técnica com prompt de rigor físico)

---

## 📱 Módulos da Aplicação

1. **Comunicação (Tela Principal)**:
   - Indicador de status da sessão, cronômetro de duração, controles Iniciar/Encerrar Sessão e Gravar/Parar Áudio.
   - Entrada de pergunta por texto ou reconhecimento de voz (SpeechRecognition).
   - Osciloscópio e espectrograma em tempo real com escala visual de dBFS.
   - Chat de eventos com cartões de evidência e botão **"Ver evidência"** com salto imediato para a linha do tempo.
   - Assistente consultivo de metodologia forense integrado ao Gemini.
2. **Visão**:
   - Câmera ao vivo (com alternância entre câmera traseira e frontal).
   - Análise de variação óptica e fluxo de luminosidade por Canvas.
   - Captura de fotos sincronizadas à linha do tempo da sessão.
   - Esclarecimento honesto: Não há falsa promessa de visão noturna verdadeira, térmica ou raio X (explicação clara sobre necessidade de sensor de infravermelho físico para termografia).
3. **Ouija**:
   - **Modo Tabuleiro Digital**: Ponteiro interativo acionado pelo toque e arraste do usuário. Medição de velocidade e registro do efeito ideomotor humano. Nenhuma simulação falsa de entidade.
   - **Modo Tabuleiro Físico**: Campo de observação e marcação manual rápida de letras para experimentos com tabuleiro real.
4. **Sensores**:
   - Magnetômetro em microTesla (µT) com botão de calibração de linha de base e cálculo de variação delta (Δ).
   - Acelerômetro de movimento (m/s²) para correlacionar tremores da mão com supostas anomalias.
   - Nível sonoro digital em dBFS.
   - Gráfico de série temporal contínua multissensorial.
   - Guia de descarte de interferências rotineiras (ímãs do alto-falante, rede elétrica 50/60Hz).
   - Detecção real: se o aparelho não possui sensor, exibe "Sensor não disponível no hardware" sem dados inventados.
5. **Evidências**:
   - Linha do tempo sincronizada com todos os eventos da sessão.
   - Reprodutor duplo de áudio: ouça o **Áudio Original Bruto** e a **Cópia Tratada (Passa-faixa 300Hz-3.4kHz)**.
   - Download de arquivos (áudio original `.webm`, cópia tratada `.wav`, foto `.jpg` e cadeia completa em `.json`).
   - Gerador de **Relatório Técnico de Investigação Forense** pronto para impressão ou exportação em PDF.
6. **Teste Cego**:
   - Criação de pergunta de controle selada por um terceiro.
   - Geração de hash SHA-256 e ocultação local da resposta; sem isolamento criptográfico contra acesso ao aparelho.
   - Trava irreversível da hipótese do investigador.
   - Abertura do selo e confronto imparcial com registro de acertos e falhas.
7. **Configurações & Privacidade**:
   - Diagnóstico e autorização granular de microfone, câmera e acelerômetro.
   - Seletor de dispositivo de áudio (microfone externo vs interno).
   - Estatísticas de armazenamento do IndexedDB com botão de exclusão definitiva.
   - Evidências locais no IndexedDB; login, pagamento e consultas de IA exigem serviços remotos.

---

## 🚀 Como Executar o Projeto & Deploy na Vercel

### Pré-requisitos
- Node.js 20+
- NPM

### Instalação e Execução Local

```bash
# 1. Instalar dependências
npm install

# 2. Executar testes de integração (Segurança, Assinaturas MP, Endpoints /api/*)
npm test

# 3. Iniciar servidor full-stack local (Express + Vite na Porta 3000)
npm run dev

# 4. Compilar para produção
npm run build

# 5. Iniciar servidor Node.js de produção
npm run start
```

### Arquitetura de Produção Vercel

O projeto foi configurado com arquitetura híbrida de alto desempenho:
1. **Frontend**: SPA compilado pelo Vite para `/dist`, servido estaticamente com cache otimizado e Service Worker PWA (`navigateFallbackDenylist: [/^\/api/]`).
2. **Backend Serverless**: `src/apiEntry.ts` é compilado para a entrada única `api/index.js`. Não crie `api/index.ts` em paralelo: a Vercel rejeita entradas com o mesmo nome base.
3. **Roteamento `vercel.json`**:
   - `GET|POST /api/(.*)` redirecionado para a função serverless `api/index.js`.
   - `/(.*)` redirecionado para `/index.html` (SPA fallback sem interferir nas rotas de API).
4. **Variáveis de Ambiente na Vercel**:
   - `GEMINI_API_KEY`: Chave da API do Google Gemini.
   - `APP_URL`: Domínio da aplicação (ex: `https://froc-sobrenatural-ca-a-fantasma.vercel.app`).
   - `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`: Credenciais para Checkout Pro e validação segura de Webhooks.
   - `PACKAGE_50_PRICE_CENTS`, `PACKAGE_75_PRICE_CENTS`, `PACKAGE_100_PRICE_CENTS`: Valores em centavos (ex: `2990`). Se indefinidos, o catálogo protege a aplicação sem inventar preços.
   - `ADMIN_UIDS`: UIDs do Firebase Auth autorizados a abrir `/admin`, separados por vírgula. Copie o UID correto do console Firebase; sem valor configurado e sem custom claim, ninguém é administrador.
   - `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON da credencial administrativa no ambiente do servidor, caso a identidade de execução não disponibilize credenciais. Jamais use prefixo `VITE_` nesta variável.

### Verificação antes de publicar (Windows CMD)

```cmd
npm ci
npm run lint
npm test
npm run build
```

Depois da publicação, confirme que `/api/status` e `/api/packages` devolvem JSON HTTP 200 e que `/api/wallet` sem login devolve HTTP 401. Os testes locais não comprovam Firebase, Gemini ou Mercado Pago de produção. Consultas de análise e chat concluídas consomem **5 créditos** cada; erro técnico antes da conclusão devolve a reserva. O fallback local não afirma comunicação nem substitui uma análise cobrada por IA. Os arquivos de investigação no IndexedDB permanecem somente no aparelho e podem ser apagados pelo navegador.

---

## 🔍 O que está funcionando de verdade vs O que depende de Chave/Hardware

| Funcionalidade | Status Real | Observação |
|---|---|---|
| Gravação de Áudio & MediaRecorder | **100% Funcional** | Captura nativa do microfone com persistência IndexedDB |
| Osciloscópio & Medição dBFS | **100% Funcional** | Web Audio API nativa com cálculo real de RMS e pico em Hz |
| Filtro Passa-Faixa (Cópia Tratada) | **100% Funcional** | DSP via OfflineAudioContext e exportação WAV |
| Câmera e Captura Fotográfica | **100% Funcional** | getUserMedia e Canvas snapshot integrado à cadeia |
| Ouija Digital e Físico | **100% Funcional** | Rastreamento ideomotor manual sem jogadores invisíveis |
| Teste cego local com SHA-256 | **Local** | A resposta ainda está no mesmo aparelho, codificada de modo reversível; não há sigilo criptográfico contra quem acessa o armazenamento |
| Persistência Local & Exportação JSON | **100% Funcional** | Banco IndexedDB com download de cadeia de custódia |
| PWA e Instalação | **100% Funcional** | Service worker, manifesto e botão de instalação in-app |
| Acelerômetro de Movimento | **Funcional no Hardware** | Depende de acelerômetro e permissão no navegador móvel |
| Magnetômetro (µT) | **Funcional no Hardware** | Requer dispositivo e navegador com W3C Generic Sensor API (ex: Chrome Android com flag de sensor). Se ausente, informa honestamente |
| Análise com Gemini | **Depende de chave e API disponíveis** | Ordem 3.8 → 3.7 → 3.6 Flash. Sem IA configurada, a consulta cobrada não é iniciada; as medições locais permanecem disponíveis |
| Câmera Térmica / Raio X | **Não aplicável em celular** | Explicitamente alertado na interface que celulares comuns não possuem sensores térmicos ou raio X |
