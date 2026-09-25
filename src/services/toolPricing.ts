import { PremiumToolId, ToolPricingConfig } from '../types';

/**
 * Configuração Autoritativa de Preços e Prazos de Ferramentas Premium
 * 
 * Regra Comercial Padrão do Sistema:
 * - 5 créditos = 4 minutos (240 segundos) de utilização contínua de ferramenta premium.
 * - Centralizada e autoritativa no backend.
 * - Permite ajuste global ou específico sem necessidade de alterações espalhadas no frontend.
 */

export const TOOL_PRICING: Record<PremiumToolId, ToolPricingConfig> = {
  communication: {
    toolId: 'communication',
    costCredits: 5,
    durationSeconds: 240, // 4 minutos
    name: 'Comunicação e Análise Espectral',
    description: 'Gravação pericial de áudio, espectrograma em tempo real, osciloscópio e consultas com IA forense.',
    category: 'audio',
  },
  vision: {
    toolId: 'vision',
    costCredits: 5,
    durationSeconds: 240, // 4 minutos
    name: 'Visão Computacional e Câmera',
    description: 'Análise óptica de luminância, retículo forense, realces digitais e registro fotográfico na cadeia de custódia.',
    category: 'camera',
  },
  ouija: {
    toolId: 'ouija',
    costCredits: 5,
    durationSeconds: 240, // 4 minutos
    name: 'Mesa Ouija Digital e Microvariações',
    description: 'Registro de movimentos com detecção de efeito ideomotor, triangulação e captura de sequências alfanuméricas.',
    category: 'sensor_board',
  },
  blindTest: {
    toolId: 'blindTest',
    costCredits: 5,
    durationSeconds: 240, // 4 minutos
    name: 'Protocolo de Teste Duplo-Cego',
    description: 'Criptografia SHA-256 com sal de alvos em envelopes selados, bloqueio de hipóteses e desvendamento cego verificado.',
    category: 'protocol',
  },
  evidenceAnalysis: {
    toolId: 'evidenceAnalysis',
    costCredits: 5,
    durationSeconds: 240, // 4 minutos
    name: 'Cadeia de Evidência e Filtragem DSP',
    description: 'Auditoria de integridade temporal, filtros de isolamento acústico pericial e laudo pericial exportável.',
    category: 'chain',
  },
};

export function isValidPremiumTool(toolId: any): toolId is PremiumToolId {
  return typeof toolId === 'string' && toolId in TOOL_PRICING;
}

export function getToolPricing(toolId: PremiumToolId): ToolPricingConfig {
  return TOOL_PRICING[toolId];
}

export function getAllToolPricing(): Record<PremiumToolId, ToolPricingConfig> {
  return TOOL_PRICING;
}
