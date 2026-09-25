export type ModuleTab = 'communication' | 'vision' | 'ouija' | 'sensors' | 'evidence' | 'blindtest' | 'settings' | 'painel' | 'admin' | 'privacy' | 'terms' | 'notfound';

export interface Session {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  investigatorName: string;
  locationNotes: string;
  status: 'active' | 'paused' | 'concluded';
  evidenceCount: number;
}

export type EvidenceCategory =
  | 'question'             // Pergunta do Investigador
  | 'signal_measured'        // Sinal Medido (dBFS, Hz, µT)
  | 'candidate_transcription' // Transcrição Candidata
  | 'ai_analysis'            // Análise da IA
  | 'verified_info'          // Informação Verificada
  | 'photo_capture'          // Captura Visual
  | 'ouija_record'           // Registro de Ouija
  | 'blind_test_event';      // Teste Cego

export interface EvidenceItem {
  id: string;
  sessionId: string;
  timestamp: number;
  formattedTime: string;
  relativeTimeSec: number;
  category: EvidenceCategory;
  title: string;
  details: string;

  // Question context
  questionText?: string;

  // Signal & Telemetry
  signalData?: {
    dbfs: number;
    peakFrequencyHz: number;
    rms: number;
    magneticMagnitudeUtd?: number;
    magneticDeltaUtd?: number;
    motionMagnitude?: number;
  };

  // Audio candidate
  audioId?: string;
  hasAudio?: boolean;
  candidateTranscription?: string | null;
  confidenceScore?: number; // 0 to 1
  possibleName?: {
    name: string;
    segmentTime: string;
    verified: boolean;
  };
  decisionStatus?: 'pending' | 'interference_marked' | 'confirmed_candidate' | 'discarded';

  // Blind independent review
  independentReviews?: {
    reviewerName: string;
    heardText: string;
    timestamp: number;
  }[];

  // AI & Forensic analysis
  aiAnalysis?: {
    conclusion: string;
    confidence: number;
    voiceDetected: boolean;
    acousticAnalysis: string;
    alternativeHypotheses: string[];
    provider: string;
  };

  // Visual capture & Optical processing metadata
  photoDataUrl?: string;
  visionMetadata?: {
    mode: 'standard' | 'low_light' | 'green_filter' | 'frame_stacking';
    gain: number;
    gamma: number;
    appliedGain: number;
    avgLuminance: number;
    lightCategory: 'very_dark' | 'low_light' | 'moderate' | 'bright';
    frameStacking: boolean;
    stackedFramesCount?: number;
    temporalDenoise: number;
    edgeEnhance: 'none' | 'low' | 'high';
    histogramStretched: boolean;
    motionPercent: number;
    cameraCapabilities?: {
      torchSupported: boolean;
      torchActive?: boolean;
      zoomSupported: boolean;
      zoomValue?: number;
      exposureSupported: boolean;
      exposureValue?: number;
      facingMode: string;
    };
    forensicDisclaimer: string;
  };

  // Ouija record
  ouijaRecord?: {
    mode: 'physical' | 'digital' | 'automatic';
    letters: string;
    operatorNote: string;
    dwellTimeSec: number;
    telemetry?: any;
    questionContext?: string;
  };

  // Status
  verifiedStatus?: 'none' | 'refuted_noise' | 'inconclusive' | 'verified_speech' | 'alternative_found';
}

export interface BlindTestItem {
  id: string;
  sessionId: string;
  targetSubject: string; // e.g., "Número no envelope 3", "Palavra de controle"
  sealedHash: string;
  sealedPayload: string; // Base64 obscured until unsealed
  successCriteria: string;
  sealedAt: number;
  
  hypothesisLocked?: string;
  lockedAt?: number;
  
  revealedAt?: number;
  revealedAnswer?: string;
  status: 'sealed' | 'locked' | 'evaluated';
  matched?: boolean;
  notes?: string;
}

export interface SensorState {
  magnetometer: {
    available: boolean;
    x: number;
    y: number;
    z: number;
    magnitude: number;
    baseline: number;
    delta: number;
    unit: 'µT';
    statusText: string;
  };
  motion: {
    available: boolean;
    x: number;
    y: number;
    z: number;
    magnitude: number;
    baseline?: number;
    delta?: number;
    unit: 'm/s²';
    statusText: string;
    rotationRate?: {
      alpha: number | null;
      beta: number | null;
      gamma: number | null;
    };
  };
  orientation?: {
    available: boolean;
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
    baselineBeta: number;
    baselineGamma: number;
    deltaBeta: number;
    deltaGamma: number;
    statusText: string;
  };
  audioLevel: {
    dbfs: number; // Digital dB Full Scale (-100 to 0)
    rms: number;
    peakHz: number;
    isSpeechBand: boolean;
  };
}

// ----------------------------------------------------
// Parte 2: Modelos de Carteira, Créditos e Mercado Pago
// ----------------------------------------------------

export interface UserWallet {
  uid: string;
  balance: number; // Saldo disponível em créditos inteiros
  reserved: number; // Saldo temporariamente retido durante processamento
  promotionalGranted: number; // Total promocional recebido (ex: 25 bônus)
  purchasedTotal: number; // Total de créditos comprados
  manualGrantedTotal?: number; // Total de créditos concedidos manualmente pela administração
  spentTotal: number; // Total de créditos efetivamente consumidos
  debtAmount?: number; // Dívida ativa se houver estorno de créditos já consumidos
  version: number; // Versão de controle de concorrência
  updatedAt: number;
}

export interface LedgerEntry {
  id: string;
  uid: string;
  type: 'free_grant' | 'purchase' | 'consultation_reserve' | 'consultation_commit' | 'consultation_release' | 'refund' | 'admin_adjustment' | 'tool_session' | 'tool_session_renewal';
  amount: number; // Positivo ou negativo (ex: +25, -5, +5)
  balanceAfter: number;
  description: string;
  referenceId?: string; // ID da consulta, requestId, orderId ou adminOpId
  adminUid?: string; // UID do administrador que executou a ação (se aplicável)
  reason?: string;
  category?: 'courtesy' | 'support' | 'correction' | 'other';
  timestamp: number;
}

export interface AdminAdjustmentReceipt {
  operationId: string;
  targetUid: string;
  targetEmail?: string;
  adminUid: string;
  action: 'grant' | 'revoke';
  amount: number;
  reason: string;
  category: 'courtesy' | 'support' | 'correction' | 'other';
  previousBalance: number;
  balanceAfter: number;
  timestamp: number;
  idempotencyKey: string;
}

export interface AdminDashboardOverview {
  totalUsers: number;
  metricsPartial?: boolean;
  totalCreditsInCirculation: number;
  totalPurchasedCredits: number;
  totalSpentCredits: number;
  totalReservedCredits: number;
  totalConsultationsCompleted: number;
  totalConsultationsFailed: number;
  ordersCountByStatus: Record<string, number>;
  apiHealth: {
    status: string;
    geminiOnline: boolean;
    mercadoPagoOnline: boolean;
    adminConfigured: boolean;
  };
}

export interface CreditPackage {
  id: string;
  credits: number; // 50, 75 ou 100
  consultationsEquivalent: number; // 10, 15 ou 20
  priceInCentsBRL: number; // Ex: 2990 = R$ 29,90. 0 se não configurado
  active: boolean;
  description: string;
}

export interface OrderItem {
  id: string;
  uid: string;
  packageId: string;
  credits: number;
  amountCentsBRL: number;
  status: 'created' | 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | 'refunded';
  mercadoPagoPreferenceId?: string;
  mercadoPagoPaymentId?: string;
  mercadoPagoInitPoint?: string;
  createdAt: number;
  approvedAt?: number;
  errorReason?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  displayNameLower?: string | null;
  emailLower?: string | null;
  displayNameNormalized?: string | null;
  emailNormalized?: string | null;
  photoURL: string | null;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
  authProvider: string;
  emailVerified: boolean;
}

export interface ConsultationTransaction {
  id: string;
  requestId: string;
  uid: string;
  creditsReserved: number;
  creditsCommitted: number;
  status: 'created' | 'reserved' | 'processing' | 'completed' | 'failed_released' | 'expired_released';
  modelUsed?: string;
  executionTimeMs?: number;
  failoverHistory?: string[];
  createdAt: number;
  reservedAt?: number;
  expiresAt?: number;
  processingStartedAt?: number;
  completedAt?: number;
  releasedAt?: number;
}

// ----------------------------------------------------
// Parte 3: Sistema Central de Sessões Temporizadas por Ferramenta
// ----------------------------------------------------

export type PremiumToolId = 'communication' | 'vision' | 'ouija' | 'blindTest' | 'evidenceAnalysis';

export interface ToolPricingConfig {
  toolId: PremiumToolId;
  costCredits: number;
  durationSeconds: number;
  name: string;
  description: string;
  category: 'audio' | 'camera' | 'sensor_board' | 'protocol' | 'chain';
}

export type ToolSessionStatus = 'created' | 'reserved' | 'active' | 'expired' | 'renewing' | 'ended' | 'failed_released';

export interface ToolSession {
  toolSessionId: string;
  uid: string;
  toolId: PremiumToolId;
  status: ToolSessionStatus;
  startedAt: number;
  expiresAt: number;
  durationSeconds: number;
  costCredits: number;
  autoRenew: boolean;
  renewalCount: number;
  lastRenewedAt?: number;
  createdAt: number;
  endedAt?: number;
  requestId: string;
}

// ----------------------------------------------------
// Parte 4: Legendas e Análise Forense Vocal em Tempo Real
// ----------------------------------------------------

export type LiveCaptionStatus =
  | 'listening'
  | 'analyzing'
  | 'no_speech'
  | 'possible_speech'
  | 'error'
  | 'paused';

export interface LiveCaptionEvent {
  id: string;
  timestampFormatted: string; // "00:42"
  timestampMs: number;
  status: LiveCaptionStatus;
  text: string;
  candidateTranscription?: string | null;
  confidence: number;
  dbfs: number;
  peakFrequencyHz: number;
  provider: string;
  executionTimeMs?: number;
  toolSessionId?: string;
  isRelevant: boolean;
  audioBlob?: Blob;
  alternativeHypotheses?: string[];
}
