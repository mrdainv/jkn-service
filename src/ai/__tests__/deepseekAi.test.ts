// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEEPSEEK_ENDPOINT,
  DEFAULT_DEEPSEEK_MODEL,
  deepseekAi,
  draftWithDeepSeek,
  extractJsonFromText,
  getDeepSeekApiKey,
  getDeepSeekEndpoint,
  getDeepSeekModel,
  resolveDeepSeekUrl,
  setDeepSeekApiKey,
  setDeepSeekEndpoint,
  setDeepSeekModel,
  testDeepSeekConnection,
} from '../deepseekAi';
import type { DraftRequest } from '../service';

describe('deepseekAi service', () => {
  beforeEach(() => {
    localStorage.clear();
    setDeepSeekApiKey('');
    setDeepSeekModel(DEFAULT_DEEPSEEK_MODEL);
    setDeepSeekEndpoint(DEFAULT_DEEPSEEK_ENDPOINT);
    vi.restoreAllMocks();
  });

  it('manages DeepSeek API key, model, and endpoint storage in localStorage', () => {
    expect(getDeepSeekApiKey()).toBe('');
    expect(getDeepSeekModel()).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(getDeepSeekEndpoint()).toBe(DEFAULT_DEEPSEEK_ENDPOINT);

    setDeepSeekApiKey('sk-test123456');
    setDeepSeekModel('deepseek-reasoner');
    setDeepSeekEndpoint('http://localhost:11434/v1');

    expect(getDeepSeekApiKey()).toBe('sk-test123456');
    expect(getDeepSeekModel()).toBe('deepseek-reasoner');
    expect(getDeepSeekEndpoint()).toBe('http://localhost:11434/v1');
  });

  it('correctly resolves endpoint URLs', () => {
    expect(resolveDeepSeekUrl('http://localhost:11434/v1', '/chat/completions')).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    expect(resolveDeepSeekUrl('https://my-proxy.com/api', '/chat/completions')).toBe(
      'https://my-proxy.com/api/chat/completions',
    );
  });

  it('extracts JSON from plain text or markdown fenced blocks', () => {
    const rawPlain = '{"hello": "world"}';
    expect(extractJsonFromText(rawPlain)).toBe('{"hello": "world"}');

    const fenced = '```json\n{"hello": "world"}\n```';
    expect(extractJsonFromText(fenced)).toBe('{"hello": "world"}');

    const fencedNoLang = '```\n{"hello": "world"}\n```';
    expect(extractJsonFromText(fencedNoLang)).toBe('{"hello": "world"}');
  });

  it('reflects correct AiModelInfo kind and label depending on API key or local endpoint', () => {
    expect(deepseekAi.info.kind).toBe('SIMULASI_DETERMINISTIK');

    setDeepSeekApiKey('sk-valid');
    expect(deepseekAi.info.kind).toBe('MODEL_EKSTERNAL');
    expect(deepseekAi.info.label).toContain('DeepSeek');

    setDeepSeekApiKey('');
    setDeepSeekEndpoint('http://localhost:11434/v1');
    expect(deepseekAi.info.kind).toBe('MODEL_EKSTERNAL');
  });

  it('tests connection: fails when API key is empty on remote cloud endpoint', async () => {
    const res = await testDeepSeekConnection('', 'deepseek-chat', 'https://api.deepseek.com');
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

    const res = await testDeepSeekConnection('sk-test', 'deepseek-chat');
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

    const res = await draftWithDeepSeek(req, 'sk-test-key');
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
