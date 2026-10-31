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

export const DEEPSEEK_API_KEY_STORAGE_KEY = 'selaras_deepseek_api_key';
export const DEEPSEEK_MODEL_STORAGE_KEY = 'selaras_deepseek_model';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com';

export function getDeepSeekApiKey(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY);
    if (stored !== null) return stored.trim();
  }
  const envKey = (import.meta as unknown as { env?: { VITE_DEEPSEEK_API_KEY?: string } }).env?.VITE_DEEPSEEK_API_KEY;
  return envKey?.trim() ?? '';
}

export function setDeepSeekApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, key.trim());
  }
}

export function getDeepSeekModel(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY);
    if (stored?.trim()) return stored.trim();
  }
  return DEFAULT_DEEPSEEK_MODEL;
}

export function setDeepSeekModel(model: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEEPSEEK_MODEL_STORAGE_KEY, model.trim() || DEFAULT_DEEPSEEK_MODEL);
  }
}

export function resolveDeepSeekUrl(path = '/chat/completions'): string {
  // If running in browser on localhost, use Vite proxy to prevent CORS issues
  if (typeof window !== 'undefined' && window.location) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return `/api/deepseek${path}`;
    }
  }
  return `${DEEPSEEK_API_URL}${path}`;
}

export function extractJsonFromText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

export async function testDeepSeekConnection(
  apiKey: string,
  model = getDeepSeekModel(),
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'API key DeepSeek kosong.' };
  }
  try {
    const url = resolveDeepSeekUrl('/chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, message: `Gagal (${msg})` };
    }
    return { ok: true, message: `Koneksi berhasil! Model DeepSeek (${model}) siap digunakan.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Koneksi jaringan gagal.' };
  }
}

interface DeepSeekStructuredDraft {
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

export async function draftWithDeepSeek(
  request: DraftRequest,
  apiKey: string,
  model = getDeepSeekModel(),
): Promise<DraftResponse> {
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
   - (Catatan: HANYA opsi penyangkalan total keberadaan yang boleh memiliki skorFraud 1.0; untuk tindakan medis skor bantahan adalah 0.6 - 0.85).

Format output WAJIB berupa objek JSON valid dengan struktur persis berikut:
{
  "pertanyaan": "Pertanyaan pasien 15-240 karakter",
  "pengalamanSensoris": ["Pengalaman sensoris fisik 1", "Pengalaman sensoris 2"],
  "alasanKlinis": "Penjelasan mengapa pertanyaan ini relevan",
  "istilahDihindari": ["istilah teknis medis 1"],
  "opsiJawaban": [
    {
      "id": "KONFIRMASI",
      "label": "Teks opsi jawaban",
      "kekuatan": "KUAT",
      "skorFraud": 0.0,
      "unsure": false,
      "denial": false
    }
  ]
}`;

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

  const url = resolveDeepSeekUrl('/chat/completions');
  const isReasoner = model === 'deepseek-reasoner' || model.includes('reasoner') || model.includes('r1');

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt },
    ],
  };

  if (!isReasoner) {
    payload.temperature = 0.2;
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(`DeepSeek API Error: ${(errorBody as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('DeepSeek API mengembalikan respons kosong.');

  const cleanedJson = extractJsonFromText(rawText);
  const parsed = JSON.parse(cleanedJson) as DeepSeekStructuredDraft;

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
      ...(o.denial && score === 1 ? { denial: true } : {}),
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
    rationale: `Draf disusun oleh model GenAI DeepSeek (${model}) berdasarkan URD v0.4 (E6). ${parsed.alasanKlinis || ''}`,
    referenceEntryIds: [],
    experienceSourceFound: true,
    claimAttributes: ['kode tindakan', 'nama tindakan', 'kategori layanan', 'jenis rawat', 'jumlah tindakan'],
  };
}

export const deepseekAi: QuestionAi = {
  get info(): AiModelInfo {
    const key = getDeepSeekApiKey();
    const model = getDeepSeekModel();

    if (key) {
      return {
        id: model,
        version: '2026.1',
        kind: 'MODEL_EKSTERNAL',
        label: `DeepSeek (${model}) + Aturan Medis`,
        confidenceEvent: 'JAWABAN_PASTI',
        confidenceEventText: 'Perkiraan peluang peserta memberi jawaban pasti (bukan "Tidak ingat") untuk pertanyaan ini.',
      };
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
    const key = getDeepSeekApiKey();
    const model = getDeepSeekModel();

    if (key) {
      try {
        return await draftWithDeepSeek(request, key, model);
      } catch (err) {
        console.warn('Gagal memanggil DeepSeek API, beralih ke simulasi deterministik:', err);
        const fallback = await simulatedAi.draft(request);
        return {
          ...fallback,
          rationale: `${fallback.rationale} (Fallback dari error DeepSeek: ${err instanceof Error ? err.message : String(err)})`,
        };
      }
    }
    return simulatedAi.draft(request);
  },
};
