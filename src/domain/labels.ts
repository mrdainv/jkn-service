import type {
  CareClass,
  CareType,
  ClaimStatus,
  DecisionOutcome,
  FraudLevel,
  FristaResult,
  MappingStatus,
  MatchType,
  QuestionOrigin,
  Segment,
  StopReason,
  Strength,
} from './types';
import type { EvidenceStatus } from './evidence';

// One wording per concept, used by every role. What the participant and the facility see is neutral;
// fraud wording (levels, stop reasons, the score disclaimer) appears on verifier screens only.

export const CARE_TYPE_LABEL: Record<CareType, string> = {
  RAWAT_INAP: 'Rawat inap',
  RAWAT_JALAN: 'Rawat jalan',
};

export const CARE_CLASS_LABEL: Record<CareClass, string> = {
  KELAS_1: 'Kelas 1',
  KELAS_2: 'Kelas 2',
  KELAS_3: 'Kelas 3',
};

export const SEGMENT_LABEL: Record<Segment, string> = {
  PBI: 'PBI (Penerima Bantuan Iuran)',
  PPU: 'PPU (Pekerja Penerima Upah)',
  PBPU: 'PBPU (Pekerja Bukan Penerima Upah)',
};

/** Verifier-facing claim status. */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  DIAJUKAN: 'Perlu persiapan pertanyaan',
  MENUNGGU_PESERTA: 'Menunggu jawaban peserta',
  JAWABAN_DITERIMA: 'Jawaban diterima',
  PERLU_KONTAK: 'Identitas belum terverifikasi',
  DITOLAK_PESERTA: 'Peserta tidak bersedia',
  TIDAK_DIJAWAB: 'Tidak dijawab dalam batas waktu',
  SELESAI: 'Selesai diputuskan',
};

/** What the facility sees: the workflow stage (and, once decided, the outcome), never the participant's answers. */
export const PROVIDER_STATUS_LABEL: Record<ClaimStatus, string> = {
  DIAJUKAN: 'Diajukan',
  MENUNGGU_PESERTA: 'Dalam verifikasi',
  JAWABAN_DITERIMA: 'Dalam verifikasi',
  PERLU_KONTAK: 'Dalam verifikasi',
  DITOLAK_PESERTA: 'Dalam verifikasi',
  TIDAK_DIJAWAB: 'Dalam verifikasi',
  SELESAI: 'Verifikasi selesai',
};

export const DECISION_LABEL: Record<DecisionOutcome, string> = {
  SESUAI: 'Sesuai',
  PERLU_TINDAK_LANJUT: 'Perlu tindak lanjut',
  TIDAK_DAPAT_DISIMPULKAN: 'Tidak dapat disimpulkan',
};

export const DECISION_HELP: Record<DecisionOutcome, string> = {
  SESUAI: 'Jawaban peserta sejalan dengan isi klaim.',
  PERLU_TINDAK_LANJUT: 'Ada hal yang perlu diperiksa lebih lanjut (mis. rekam medis).',
  TIDAK_DAPAT_DISIMPULKAN: 'Bukti dari peserta tidak cukup untuk menyimpulkan.',
};

export const STRENGTH_LABEL: Record<Strength, string> = {
  KUAT: 'Kuat mendukung',
  SEBAGIAN: 'Sebagian mendukung',
  NETRAL: 'Netral',
  BERTENTANGAN: 'Bertentangan',
};

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  PERLU_DIPERIKSA: 'Perlu diperiksa manusia',
  BUKTI_TIDAK_CUKUP: 'Bukti tidak cukup',
  KONSISTEN: 'Konsisten',
};

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  EPISODE: 'Pertanyaan episode (wajib rawat inap)',
  KODE_TEPAT: 'Kode sama persis',
  KODE_INDUK: 'Kode induk sama',
  KATA_KUNCI: 'Kemiripan nama tindakan',
  TIDAK_ADA: 'Tidak ada entri yang cocok',
};

export const MAPPING_STATUS_LABEL: Record<MappingStatus, string> = {
  TERPETAKAN: 'Terpetakan',
  DI_BAWAH_AMBANG: 'Di bawah ambang relevansi',
  TIDAK_TERPETAKAN: 'Tidak terpetakan',
};

export const ORIGIN_LABEL: Record<QuestionOrigin, string> = {
  KAMUS_AWAL: 'Kamus awal',
  DRAF_AI: 'Draf AI (tanpa suntingan)',
  DRAF_AI_DISUNTING: 'Draf AI, disunting verifikator',
  SUNTINGAN_VERIFIKATOR: 'Suntingan verifikator',
};

export const FRISTA_LABEL: Record<FristaResult, string> = {
  COCOK: 'Wajah cocok',
  TIDAK_COCOK: 'Wajah tidak cocok',
  LAYANAN_TIDAK_TERSEDIA: 'Layanan FRISTA tidak tersedia',
  TANPA_KAMERA: 'Tidak punya kamera',
};

/** Participant-facing stage of one of their claims. */
export const PARTICIPANT_STATUS_LABEL: Record<ClaimStatus, string> = {
  DIAJUKAN: 'Belum ada pertanyaan',
  MENUNGGU_PESERTA: 'Menunggu jawaban Anda',
  JAWABAN_DITERIMA: 'Jawaban terkirim',
  PERLU_KONTAK: 'Petugas BPJS akan menghubungi Anda',
  DITOLAK_PESERTA: 'Anda memilih tidak menjawab',
  TIDAK_DIJAWAB: 'Batas waktu menjawab terlewati',
  SELESAI: 'Selesai',
};

/** Why the adaptive questioning stopped. */
export const STOP_REASON_LABEL: Record<StopReason, string> = {
  INDIKASI_TINGGI: 'Indikasi fraud mencapai ambang tinggi',
  BATAS_PERTANYAAN: 'Batas jumlah pertanyaan tercapai',
  PERTANYAAN_HABIS: 'Tidak ada pertanyaan relevan yang tersisa',
  DIHENTIKAN_PESERTA: 'Peserta berhenti menjawab',
  BATAS_WAKTU: 'Batas waktu menjawab terlewati',
};

/** Fraud indication level, read against the thresholds in the AI configuration. */
export const FRAUD_LEVEL_LABEL: Record<FraudLevel, string> = {
  RENDAH: 'Indikasi rendah',
  SEDANG: 'Indikasi sedang',
  TINGGI: 'Indikasi tinggi',
};

/** What each level does to the session. */
export const FRAUD_LEVEL_EFFECT: Record<FraudLevel, string> = {
  RENDAH: 'AI melanjutkan dengan pertanyaan yang paling mungkin dijawab pasti.',
  SEDANG: 'AI melanjutkan dengan pertanyaan konfirmasi (pengalaman paling mudah dikenali).',
  TINGGI: 'Sesi berhenti; klaim didahulukan untuk diperiksa verifikator.',
};

/** One sentence on what the claim-level scores are, shown wherever they appear. */
export const SCORE_DISCLAIMER =
  'Skor indikasi fraud dihitung dengan aturan dari skor fraud pilihan jawaban yang dipilih peserta, dibobot keandalan; tingkatnya ditentukan ambang di Konfigurasi AI. Simulasi: skor ini mengurutkan dan menghentikan pertanyaan, bukan probabilitas fraud yang tervalidasi dan bukan keputusan.';
