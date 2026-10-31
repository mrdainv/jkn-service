import { deepseekAi, getDeepSeekApiKey } from './deepseekAi';
import { geminiAi, getGeminiApiKey } from './geminiAi';
import { simulatedAi } from './simulatedAi';
import type {
  AiModelInfo,
  DraftRequest,
  DraftResponse,
  NextQuestionRequest,
  NextQuestionResponse,
  QuestionAi,
  RankRequest,
  RankedQuestion,
} from './service';

export type AiProvider = 'gemini' | 'deepseek' | 'simulation';

export const AI_PROVIDER_STORAGE_KEY = 'selaras_ai_provider';

export function getAiProvider(): AiProvider {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY) as AiProvider | null;
    if (stored === 'gemini' || stored === 'deepseek' || stored === 'simulation') {
      return stored;
    }
  }

  // Auto-detect based on available keys if not explicitly set
  const deepseekKey = getDeepSeekApiKey();
  if (deepseekKey) {
    return 'deepseek';
  }

  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    return 'gemini';
  }

  return 'deepseek';
}

export function setAiProvider(provider: AiProvider): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
  }
}

/**
 * Unified QuestionAi that dynamically routes drafting requests to the verifier's
 * chosen LLM provider (DeepSeek API, Google Gemini, or Deterministic Simulation).
 * Engine 2 (Calibrated ML ranker) and Engine 3 (Adaptive session policy) remain strictly
 * auditable and deterministic according to TRIPOD+AI & URD v0.4 guidelines.
 */
export const activeAi: QuestionAi = {
  get info(): AiModelInfo {
    const provider = getAiProvider();
    if (provider === 'deepseek') {
      return deepseekAi.info;
    }
    if (provider === 'gemini') {
      return geminiAi.info;
    }
    return simulatedAi.info;
  },

  rank: async (request: RankRequest): Promise<RankedQuestion[]> => {
    return simulatedAi.rank(request);
  },

  next: async (request: NextQuestionRequest): Promise<NextQuestionResponse> => {
    return simulatedAi.next(request);
  },

  draft: async (request: DraftRequest): Promise<DraftResponse> => {
    const provider = getAiProvider();
    if (provider === 'deepseek') {
      return deepseekAi.draft(request);
    }
    if (provider === 'gemini') {
      return geminiAi.draft(request);
    }
    return simulatedAi.draft(request);
  },
};
