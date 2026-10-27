import type {
  CareClass,
  CareType,
  ClaimStatus,
  DecisionOutcome,
  FristaResult,
  MappingStatus,
  MatchType,
  QuestionOrigin,
  Segment,
  Strength,
} from './types';
import type { EvidenceStatus } from './evidence';

// One wording per concept, used by every role. Neutral by design: nothing here suggests fraud.

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

/** What the facility sees: the workflow stage only, never the participant's answers (no result is sent to the hospital). */
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
