// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  geminiAi,
  getGeminiApiKey,
  getGeminiModel,
  setGeminiApiKey,
  setGeminiModel,
  testGeminiConnection,
} from '../geminiAi';
import type { DraftRequest } from '../service';

describe('geminiAi service', () => {
  beforeEach(() => {
    localStorage.clear();
    setGeminiApiKey('');
    vi.restoreAllMocks();
  });

  it('manages API key and model storage in localStorage', () => {
    setGeminiApiKey('');
    expect(getGeminiApiKey()).toBe('');
    expect(getGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);

    setGeminiApiKey('AIzaSyTestKey123');
    setGeminiModel('gemini-3.8-flash');

    expect(getGeminiApiKey()).toBe('AIzaSyTestKey123');
    expect(getGeminiModel()).toBe('gemini-3.8-flash');

    setGeminiApiKey('');
    expect(getGeminiApiKey()).toBe('');
  });

  it('reflects correct AiModelInfo kind and label depending on API key existence', () => {
    expect(geminiAi.info.kind).toBe('SIMULASI_DETERMINISTIK');
    expect(geminiAi.info.label).toContain('Simulasi deterministik');

    setGeminiApiKey('AIzaSyValidKey');
    expect(geminiAi.info.kind).toBe('MODEL_EKSTERNAL');
    expect(geminiAi.info.label).toContain('Google Gemini');
  });

  it('tests connection: fails when API key is empty', async () => {
    const res = await testGeminiConnection('');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('kosong');
  });

  it('tests connection: succeeds when API returns 200 OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await testGeminiConnection('AIzaSyTestKey');
    expect(res.ok).toBe(true);
    expect(res.message).toContain('berhasil');
  });

  it('tests connection: handles HTTP error response gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'API_KEY_INVALID' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await testGeminiConnection('AIzaSyBadKey');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('API_KEY_INVALID');
  });

  it('draft: falls back to simulatedAi when no API key is configured', async () => {
    const req: DraftRequest = {
      target: { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' },
      claim: {
        claimKey: 'KLM-01',
        careType: 'RAWAT_INAP',
        claimedNights: 2,
        diagnosis: { code: 'I10', name: 'Hipertensi' },
        procedures: [{ lineId: 'L1', code: '89.52', name: 'Elektrokardiogram (EKG)', quantity: 1 }],
      },
      analysis: null,
      dictionary: [],
      variant: 0,
    };

    const res = await geminiAi.draft(req);
    expect(res.proposal.text).toBeTruthy();
    expect(res.proposal.options.length).toBeGreaterThanOrEqual(3);
    expect(res.proposal.options.some((o) => o.unsure)).toBe(true);
  });

  it('draft: calls Gemini API and returns validated structured draft when API key is present', async () => {
    setGeminiApiKey('AIzaSyLiveKey');

    const mockGeminiJson = {
      pertanyaan: 'Selama dirawat di {faskes}, apakah dada Anda pernah dipasangi stiker kabel untuk rekam jantung?',
      pengalamanSensoris: ['Ditempel stiker kabel di dada', 'Diminta berbaring diam beberapa menit'],
      alasanKlinis: 'Menguji pelaksanaan pemeriksaan EKG secara sensoris tanpa menyebut istilah medis teknis.',
      istilahDihindari: ['EKG', 'elektroda', 'elektrokardiogram'],
      opsiJawaban: [
        { id: 'YA', label: 'Ya, saya ingat dipasangi stiker kabel di dada', kekuatan: 'KUAT', skorFraud: 0 },
        { id: 'TIDAK', label: 'Tidak, hal itu tidak pernah dilakukan', kekuatan: 'BERTENTANGAN', skorFraud: 0.75 },
        { id: 'TIDAK_INGAT', label: 'Tidak ingat', kekuatan: 'NETRAL', skorFraud: 0, unsure: true },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockGeminiJson) }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const req: DraftRequest = {
      target: { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' },
      claim: {
        claimKey: 'KLM-01',
        careType: 'RAWAT_INAP',
        claimedNights: 2,
        diagnosis: { code: 'I10', name: 'Hipertensi' },
        procedures: [{ lineId: 'L1', code: '89.52', name: 'Elektrokardiogram (EKG)', quantity: 1 }],
      },
      analysis: null,
      dictionary: [],
      variant: 0,
    };

    const res = await geminiAi.draft(req);
    expect(res.experienceSourceFound).toBe(true);
    expect(res.proposal.text).toContain('{faskes}');
    expect(res.proposal.options.find((o) => o.id === 'YA')?.fraudScore).toBe(0);
    expect(res.proposal.options.find((o) => o.id === 'TIDAK')?.fraudScore).toBe(0.75);
    expect(res.proposal.options.find((o) => o.unsure)?.fraudScore).toBe(0);
  });
});
