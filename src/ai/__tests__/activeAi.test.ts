// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { activeAi, getAiProvider, setAiProvider } from '../activeAi';
import { setDeepSeekApiKey } from '../deepseekAi';
import { setGeminiApiKey } from '../geminiAi';
import type { DraftRequest } from '../service';

describe('activeAi router', () => {
  beforeEach(() => {
    localStorage.clear();
    setDeepSeekApiKey('');
    setGeminiApiKey('');
  });

  it('allows setting and retrieving active AI provider', () => {
    setAiProvider('gemini');
    expect(getAiProvider()).toBe('gemini');

    setAiProvider('deepseek');
    expect(getAiProvider()).toBe('deepseek');

    setAiProvider('simulation');
    expect(getAiProvider()).toBe('simulation');
  });

  it('routes to simulatedAi when provider is simulation', async () => {
    setAiProvider('simulation');
    expect(activeAi.info.kind).toBe('SIMULASI_DETERMINISTIK');

    const req: DraftRequest = {
      target: {
        code: '87.41',
        name: 'CAT scan of thorax',
        category: 'DIAGNOSTIK',
      },
      claim: null,
      analysis: null,
      dictionary: [],
      variant: 0,
    };
    const res = await activeAi.draft(req);
    expect(res.proposal.text).toBeDefined();
    expect(res.confidence).toBeDefined();
  });

  it('switches AI model info dynamically based on chosen provider', () => {
    setAiProvider('deepseek');
    setDeepSeekApiKey('sk-deepseek-active');
    expect(activeAi.info.label).toContain('DeepSeek');

    setAiProvider('gemini');
    setGeminiApiKey('AIzaSyGeminiActive');
    expect(activeAi.info.label).toContain('Google Gemini');
  });
});
