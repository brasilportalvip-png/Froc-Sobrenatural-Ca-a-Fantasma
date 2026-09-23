# Froc Sobrenatural Caça Fantasma

> **Estação avançada de investigação sobrenatural baseada em cadeia de custódia de evidência, análise espectral em tempo real, telemetria de sensores físicos, registro visual e teste duplo-cego.**

---

## 🔬 Visão e Filosofia do Produto

Diferente de aplicativos comuns de entretenimento que simulam "jogadores fantasmas" ou geram palavras aleatórias num dicionário de terror, o **Froc Sobrenatural Caça Fantasma** opera sob os pilares do **método científico, ceticismo metodológico e cadeia de custódia imutável**:

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
   - Geração de hash SHA-256 e isolamento da resposta.
   - Trava irreversível da hipótese do investigador.
   - Abertura do selo e confronto imparcial com registro de acertos e falhas.
7. **Configurações & Privacidade**:
   - Diagnóstico e autorização granular de microfone, câmera e acelerômetro.
   - Seletor de dispositivo de áudio (microfone externo vs interno).
   - Estatísticas de armazenamento do IndexedDB com botão de exclusão definitiva.
   - Transparência total de rede: funcionamento 100% local por padrão.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- Node.js 18+ (ou Node 20+)
- NPM

### Instalação e Execução

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (Porta 3000)
npm run dev

# 3. Compilar para produção
npm run build

# 4. Iniciar servidor em produção
npm run start
```

Abra `http://localhost:3000` em seu navegador ou dispositivo móvel na mesma rede.

---

## 🔍 O que está funcionando de verdade vs O que depende de Chave/Hardware

| Funcionalidade | Status Real | Observação |
|---|---|---|
| Gravação de Áudio & MediaRecorder | **100% Funcional** | Captura nativa do microfone com persistência IndexedDB |
| Osciloscópio & Medição dBFS | **100% Funcional** | Web Audio API nativa com cálculo real de RMS e pico em Hz |
| Filtro Passa-Faixa (Cópia Tratada) | **100% Funcional** | DSP via OfflineAudioContext e exportação WAV |
| Câmera e Captura Fotográfica | **100% Funcional** | getUserMedia e Canvas snapshot integrado à cadeia |
| Ouija Digital e Físico | **100% Funcional** | Rastreamento ideomotor manual sem jogadores invisíveis |
| Teste Duplo-Cego com SHA-256 | **100% Funcional** | Web Crypto API com selagem real |
| Persistência Local & Exportação JSON | **100% Funcional** | Banco IndexedDB com download de cadeia de custódia |
| PWA e Instalação | **100% Funcional** | Service worker, manifesto e botão de instalação in-app |
| Acelerômetro de Movimento | **Funcional no Hardware** | Depende de acelerômetro e permissão no navegador móvel |
| Magnetômetro (µT) | **Funcional no Hardware** | Requer dispositivo e navegador com W3C Generic Sensor API (ex: Chrome Android com flag de sensor). Se ausente, informa honestamente |
| Análise Forense com IA (Gemini) | **Depende de GEMINI_API_KEY** | Se configurada no servidor (`.env`), usa `gemini-3.8-flash`. Se ausente, o **Motor Local DSP** assume sem falhas |
| Câmera Térmica / Raio X | **Não aplicável em celular** | Explicitamente alertado na interface que celulares comuns não possuem sensores térmicos ou raio X |
