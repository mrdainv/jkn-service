import { checkQuestion, checksPass } from '../domain/checks';
import type { AnswerOption, DraftProposal } from '../domain/types';
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

export const GEMINI_API_KEY_STORAGE_KEY = 'selaras_gemini_api_key';
export const GEMINI_MODEL_STORAGE_KEY = 'selaras_gemini_model';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
    if (stored !== null) return stored.trim();
  }
  const envKey = (import.meta as unknown as { env?: { VITE_GEMINI_API_KEY?: string } }).env?.VITE_GEMINI_API_KEY;
  return envKey?.trim() ?? '';
}

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
  }
}

export function getGeminiModel(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
    if (stored?.trim()) return stored.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

export function setGeminiModel(model: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model.trim() || DEFAULT_GEMINI_MODEL);
  }
}

export async function testGeminiConnection(apiKey: string, model = DEFAULT_GEMINI_MODEL): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'API key Gemini kosong.' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Balas kata "OK" jika koneksi aktif.' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, message: `Gagal (${msg})` };
    }
    return { ok: true, message: `Koneksi berhasil! Model ${model} siap digunakan.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Koneksi jaringan gagal.' };
  }
}

interface GeminiStructuredDraft {
  pertanyaan: string;
  pengalamanSensoris: string[];
  alasanKlinis: string;
  istilahDihindari: string[];
  opsiJawaban: {
    id: string;
    label: string;
    kekuatan: 'KUAT' | 'SEBAGIAN' | 'BERTENTANGAN' | 'NETRAL';
    skorFraud: number;
    unsure?: boolean;
    denial?: boolean;
  }[];
}

export async function draftWithGemini(request: DraftRequest, apiKey: string): Promise<DraftResponse> {
  const model = getGeminiModel();
  const { target, claim, analysis } = request;
  const line = analysis ? claim?.procedures.find((p) => p.lineId === analysis.lineId) : undefined;
  const quantity = line?.quantity ?? 1;
  const careType = claim?.careType ?? 'RAWAT_INAP';
  const staySlot = careType === 'RAWAT_JALAN' ? 'Saat berobat di {faskes}' : 'Selama dirawat di {faskes}';

  const systemInstruction = `Anda adalah asisten perumus pertanyaan verifikasi klaim BPJS Kesehatan sesuai panduan URD v0.4 (E6: Observabilitas Pengalaman Pasien).
Tugas Anda adalah merumuskan 1 pertanyaan pengalaman pasien dan 3-5 opsi jawaban pilihan ganda untuk mengonfirmasi tindakan medis yang diajukan rumah sakit.

ATURAN KETAT URD E6 (Wajib dipatuhi 100%):
1. GUNAKAN BAHASA PANCA INDRA SEHARI-HARI: Pasien adalah orang awam. Jelaskan sensasi fisik, alat yang dilihat, dipasang di tubuh, bau, cairan, atau tindakan nyata.
2. DILARANG MENGGUNAKAN KATA KLAIM & BIAYA: Jangan pernah gunakan kata "klaim", "tagihan", "ditagihkan", "biaya", "tarif", "rupiah", "INA-CBG", "ICD".
3. DILARANG MENYEBUT ANGKA DI PERTANYAAN: Pertanyaan TIDAK BOLEH memuat angka (angka membocorkan jumlah tindakan yang diklaim).
4. PANJANG PERTANYAAN: Wajib antara 15 sampai 240 karakter.
5. TEMPAT & WAKTU: Wajib diawali atau menyertakan slot "${staySlot}". Dilarang membuat slot selain {faskes} dan {periode}.
6. STRUKTUR OPSI JAWABAN (Setiap opsi WAJIB memiliki skor fraud yang tepat):
   - Opsi Konfirmasi: Mendukung penuh klaim (kekuatan: "KUAT", skorFraud: 0.0). Contoh: "Ya, saya ingat mengalaminya".
   - Opsi Kuantitas (Jika jumlah tindakan > 1): Mengonfirmasi pernah, tapi frekuensi lebih sedikit (kekuatan: "SEBAGIAN", skorFraud: 0.6). Contoh: "Pernah, tetapi hanya satu kali".
   - Opsi Parsial/Mirip: Pernah ada tindakan tapi tidak persis sama (kekuatan: "SEBAGIAN", skorFraud: 0.2 atau 0.3). Contoh: "Pernah, tetapi tidak seperti itu".
   - Opsi Bantahan: Pasien tidak pernah mengalami tindakan tersebut (kekuatan: "BERTENTANGAN", skorFraud: 0.6 sampai 0.85). Contoh: "Tidak pernah mengalami hal itu".
   - Opsi Tidak Ingat: Pasien lupa (kekuatan: "NETRAL", skorFraud: 0.0, unsure: true). Contoh: "Tidak ingat".
   - (Catatan: HANYA opsi penyangkalan total keberadaan yang boleh memiliki skorFraud 1.0; untuk tindakan medis skor bantahan adalah 0.6 - 0.85).`;

  const prompt = `Data Tindakan Medis yang diajukan Faskes:
- Kode ICD-9-CM: ${target.code}
- Nama Tindakan Medis: ${target.name}
- Kategori Layanan: ${target.category}
- Jenis Rawat: ${careType}
- Jumlah Tindakan Ditagihkan: ${quantity} kali

Rujukan pola opsi dari kamus BPJS:
- Dukung: Ya, pernah mengalami hal tersebut (skorFraud 0.0)
- Bantah: Tidak pernah sama sekali (skorFraud 0.6)
- Lupa: Tidak ingat (skorFraud 0.0, unsure true)

Kembalikan jawaban dalam format JSON murni sesuai skema.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const responseJsonSchema = {
    type: 'OBJECT',
    properties: {
      pertanyaan: { type: 'STRING', description: `Pertanyaan pasien 15-240 karakter diawali "${staySlot}" tanpa angka` },
      pengalamanSensoris: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Daftar 1-2 pengalaman fisik panca indra yang dialami pasien',
      },
      alasanKlinis: { type: 'STRING', description: 'Penjelasan mengapa pertanyaan ini dipilih dan relevan' },
      istilahDihindari: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Istilah teknis medis yang sengaja dihindari',
      },
      opsiJawaban: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            label: { type: 'STRING' },
            kekuatan: { type: 'STRING', enum: ['KUAT', 'SEBAGIAN', 'BERTENTANGAN', 'NETRAL'] },
            skorFraud: { type: 'NUMBER' },
            unsure: { type: 'BOOLEAN' },
            denial: { type: 'BOOLEAN' },
          },
          required: ['id', 'label', 'kekuatan', 'skorFraud'],
        },
      },
    },
    required: ['pertanyaan', 'pengalamanSensoris', 'alasanKlinis', 'opsiJawaban'],
  };

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: responseJsonSchema,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(`Gemini API Error: ${(errorBody as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini API mengembalikan respons kosong.');

  const parsed = JSON.parse(rawText) as GeminiStructuredDraft;

  // Convert to internal AnswerOption format and sanitize fraudScore
  let options: AnswerOption[] = parsed.opsiJawaban.map((o) => {
    let score = Number(o.skorFraud) || 0;
    if (o.unsure) score = 0;
    else if (o.kekuatan === 'KUAT' || o.kekuatan === 'NETRAL') score = 0;
    else if (score >= 1) score = o.denial ? 1 : 0.85;
    else if (score <= 0 && o.kekuatan === 'BERTENTANGAN') score = 0.6;

    return {
      id: o.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      label: o.label.trim(),
      mapping: { kind: 'TETAP', strength: o.kekuatan },
      fraudScore: score,
      ...(o.unsure ? { unsure: true } : {}),
      ...(o.denial ? { denial: true } : {}),
    };
  });

  // Ensure "Tidak ingat" is present
  if (!options.some((o) => o.unsure)) {
    options.push({
      id: 'TIDAK_INGAT',
      label: 'Tidak ingat',
      mapping: { kind: 'TETAP', strength: 'NETRAL' },
      fraudScore: 0,
      unsure: true,
    });
  }

  let text = parsed.pertanyaan.trim();
  // Ensure question contains the stay phrase
  if (!text.includes('{faskes}')) {
    text = `${staySlot}, ${text.charAt(0).toLowerCase() + text.slice(1)}`;
  }

  const avoidTerms = Array.isArray(parsed.istilahDihindari) && parsed.istilahDihindari.length > 0
    ? parsed.istilahDihindari
    : [target.name];

  const proposal: DraftProposal = {
    text,
    options,
    experiences: parsed.pengalamanSensoris || [target.name],
    avoidTerms,
  };

  // Run integrity checks
  const checkResults = checkQuestion(proposal.text, proposal.options, proposal.avoidTerms);
  const pass = checksPass(checkResults);

  return {
    proposal,
    confidence: pass ? 0.88 : 0.65,
    rationale: `Draf disusun oleh model GenAI (${model}) berdasarkan URD v0.4 (E6). ${parsed.alasanKlinis || ''}`,
    referenceEntryIds: [],
    experienceSourceFound: true,
    claimAttributes: ['kode tindakan', 'nama tindakan', 'kategori layanan', 'jenis rawat', 'jumlah tindakan'],
  };
}

/**
 * QuestionAi implementation that uses Google Gemini API when an API key is available,
 * and gracefully falls back to deterministic simulation otherwise.
 */
export const geminiAi: QuestionAi = {
  get info(): AiModelInfo {
    const key = getGeminiApiKey();
    const model = getGeminiModel();
    if (key) {
      return {
        id: model,
        version: '2026.1',
        kind: 'MODEL_EKSTERNAL',
        label: `Google Gemini (${model}) + Aturan Medis`,
        confidenceEvent: 'JAWABAN_PASTI',
        confidenceEventText: 'Perkiraan peluang peserta memberi jawaban pasti (bukan "Tidak ingat") untuk pertanyaan ini.',
      };
    }
    return simulatedAi.info;
  },

  rank: async (request: RankRequest): Promise<RankedQuestion[]> => {
    // Engine 2: Calibrated ranker is deterministic and follows TRIPOD+AI standards
    return simulatedAi.rank(request);
  },

  next: async (request: NextQuestionRequest): Promise<NextQuestionResponse> => {
    // Engine 3: Adaptive session controller follows the medical policy and Noisy-OR early stopping
    return simulatedAi.next(request);
  },

  draft: async (request: DraftRequest): Promise<DraftResponse> => {
    const key = getGeminiApiKey();
    if (key) {
      try {
        return await draftWithGemini(request, key);
      } catch (err) {
        console.warn('Gagal memanggil Gemini API, beralih ke simulasi deterministik:', err);
        const fallback = await simulatedAi.draft(request);
        return {
          ...fallback,
          rationale: `${fallback.rationale} (Fallback dari error Gemini: ${err instanceof Error ? err.message : String(err)})`,
        };
      }
    }
    return simulatedAi.draft(request);
  },
};
