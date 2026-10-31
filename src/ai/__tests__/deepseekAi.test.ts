// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEEPSEEK_MODEL,
  deepseekAi,
  draftWithDeepSeek,
  extractJsonFromText,
  getDeepSeekApiKey,
  getDeepSeekModel,
  resolveDeepSeekUrl,
  setDeepSeekApiKey,
  setDeepSeekModel,
  testDeepSeekConnection,
} from '../deepseekAi';
import type { DraftRequest } from '../service';

describe('deepseekAi service', () => {
  beforeEach(() => {
    localStorage.clear();
    setDeepSeekApiKey('');
    setDeepSeekModel(DEFAULT_DEEPSEEK_MODEL);
    vi.restoreAllMocks();
  });

  it('manages DeepSeek API key and model storage in localStorage', () => {
    expect(getDeepSeekApiKey()).toBe('');
    expect(getDeepSeekModel()).toBe(DEFAULT_DEEPSEEK_MODEL);

    setDeepSeekApiKey('sk-test123456');
    setDeepSeekModel('deepseek-v4-flash');

    expect(getDeepSeekApiKey()).toBe('sk-test123456');
    expect(getDeepSeekModel()).toBe('deepseek-v4-flash');
  });

  it('correctly resolves endpoint URLs', () => {
    expect(resolveDeepSeekUrl('/chat/completions')).toContain('/chat/completions');
  });

  it('extracts JSON from plain text or markdown fenced blocks', () => {
    const rawPlain = '{"hello": "world"}';
    expect(extractJsonFromText(rawPlain)).toBe('{"hello": "world"}');

    const fenced = '```json\n{"hello": "world"}\n```';
    expect(extractJsonFromText(fenced)).toBe('{"hello": "world"}');

    const fencedNoLang = '```\n{"hello": "world"}\n```';
    expect(extractJsonFromText(fencedNoLang)).toBe('{"hello": "world"}');
  });

  it('reflects correct AiModelInfo kind and label depending on API key', () => {
    expect(deepseekAi.info.kind).toBe('SIMULASI_DETERMINISTIK');

    setDeepSeekApiKey('sk-valid');
    expect(deepseekAi.info.kind).toBe('MODEL_EKSTERNAL');
    expect(deepseekAi.info.label).toContain('DeepSeek');
  });

  it('tests connection: fails when API key is empty', async () => {
    const res = await testDeepSeekConnection('', 'deepseek-v4-flash');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('kosong');
  });

  it('tests connection: succeeds when API returns 200 OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await testDeepSeekConnection('sk-test', 'deepseek-v4-flash');
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Koneksi berhasil');
  });

  it('drafts question with DeepSeek and formats structured proposal complying with URD E6', async () => {
    const fakeDeepSeekResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              pertanyaan: 'Selama dirawat di {faskes}, apakah dada Anda dimasukkan ke tabung besar bundar yang bersuara dengung keras?',
              pengalamanSensoris: ['masuk tabung bundar', 'suara dengung keras'],
              alasanKlinis: 'Mengonfirmasi tindakan CT Scan thorax dengan sensasi visual dan auditori.',
              istilahDihindari: ['CT Scan', 'rontgen canggih', 'radiologi'],
              opsiJawaban: [
                {
                  id: 'KONFIRMASI',
                  label: 'Ya, dada saya dimasukkan ke tabung bundar tersebut',
                  kekuatan: 'KUAT',
                  skorFraud: 0.0,
                },
                {
                  id: 'PARSIAL',
                  label: 'Pernah difoto, tapi hanya dengan papan rontgen biasa',
                  kekuatan: 'SEBAGIAN',
                  skorFraud: 0.3,
                },
                {
                  id: 'BANTAHAN',
                  label: 'Tidak pernah dimasukkan ke tabung apapun',
                  kekuatan: 'BERTENTANGAN',
                  skorFraud: 0.75,
                },
                {
                  id: 'TIDAK_INGAT',
                  label: 'Tidak ingat',
                  kekuatan: 'NETRAL',
                  skorFraud: 0.0,
                  unsure: true,
                },
              ],
            }),
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fakeDeepSeekResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

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

    const res = await draftWithDeepSeek(req, 'sk-test-key', 'deepseek-v4-flash');
    expect(res.proposal.text).toContain('{faskes}');
    expect(res.proposal.options.length).toBe(4);
    expect(res.proposal.options.find((o) => o.id === 'KONFIRMASI')?.fraudScore).toBe(0.0);
    expect(res.proposal.options.find((o) => o.id === 'BANTAHAN')?.fraudScore).toBe(0.75);
    expect(res.proposal.options.find((o) => o.unsure)?.fraudScore).toBe(0.0);
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    expect(res.rationale).toContain('DeepSeek');
  });

  it('falls back to deterministic simulation on DeepSeek API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    setDeepSeekApiKey('sk-test');
    const req: DraftRequest = {
      target: {
        code: '99.18',
        name: 'Injection or infusion of electrolytes',
        category: 'TERAPEUTIK',
      },
      claim: null,
      analysis: null,
      dictionary: [],
      variant: 0,
    };

    const res = await deepseekAi.draft(req);
    expect(res.proposal.text).toBeDefined();
    expect(res.rationale).toContain('Fallback dari error DeepSeek');
  });
});
