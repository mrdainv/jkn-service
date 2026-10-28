import { AlertOctagon, CheckCircle2, HelpCircle, MinusCircle, Sparkles } from 'lucide-react';
import type { EvidenceStatus } from '../domain/evidence';
import {
  CLAIM_STATUS_LABEL,
  DECISION_LABEL,
  EVIDENCE_STATUS_LABEL,
  MAPPING_STATUS_LABEL,
  ORIGIN_LABEL,
  PARTICIPANT_STATUS_LABEL,
  PROVIDER_STATUS_LABEL,
  SCORE_DISCLAIMER,
  STRENGTH_LABEL,
} from '../domain/labels';
import type { ClaimStatus, DecisionOutcome, MappingStatus, QuestionOrigin, Strength } from '../domain/types';
import { formatScore } from '../lib/format';
import { Badge, type Tone } from './ui';

const CLAIM_TONE: Record<ClaimStatus, Tone> = {
  DIAJUKAN: 'warn',
  MENUNGGU_PESERTA: 'info',
  JAWABAN_DITERIMA: 'violet',
  PERLU_KONTAK: 'neutral',
  DITOLAK_PESERTA: 'neutral',
  TIDAK_DIJAWAB: 'neutral',
  SELESAI: 'good',
};

export function ClaimStatusBadge({ status, view = 'verifier' }: { status: ClaimStatus; view?: 'verifier' | 'provider' | 'participant' }) {
  const label = view === 'provider' ? PROVIDER_STATUS_LABEL[status] : view === 'participant' ? PARTICIPANT_STATUS_LABEL[status] : CLAIM_STATUS_LABEL[status];
  const tone = view === 'provider' ? (status === 'SELESAI' ? 'good' : status === 'DIAJUKAN' ? 'neutral' : 'info') : CLAIM_TONE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function EvidenceBadge({ status, priority }: { status: EvidenceStatus; priority?: boolean }) {
  const Icon = status === 'PERLU_DIPERIKSA' ? AlertOctagon : status === 'KONSISTEN' ? CheckCircle2 : HelpCircle;
  const tone: Tone = status === 'PERLU_DIPERIKSA' ? 'bad' : status === 'KONSISTEN' ? 'good' : 'neutral';
  return (
    <Badge tone={tone}>
      <Icon className="h-3 w-3" aria-hidden />
      {EVIDENCE_STATUS_LABEL[status]}
      {priority && ' · penyangkalan'}
    </Badge>
  );
}

const STRENGTH_TONE: Record<Strength, Tone> = { KUAT: 'good', SEBAGIAN: 'accent', NETRAL: 'neutral', BERTENTANGAN: 'bad' };

export function StrengthBadge({ strength }: { strength: Strength | null }) {
  if (!strength) return <Badge tone="neutral">Belum ada bukti</Badge>;
  return <Badge tone={STRENGTH_TONE[strength]}>{STRENGTH_LABEL[strength]}</Badge>;
}

export function DecisionBadge({ outcome }: { outcome: DecisionOutcome }) {
  const tone: Tone = outcome === 'SESUAI' ? 'good' : outcome === 'PERLU_TINDAK_LANJUT' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{DECISION_LABEL[outcome]}</Badge>;
}

export function MappingBadge({ status }: { status: MappingStatus }) {
  const Icon = status === 'TERPETAKAN' ? CheckCircle2 : status === 'DI_BAWAH_AMBANG' ? HelpCircle : MinusCircle;
  const tone: Tone = status === 'TERPETAKAN' ? 'good' : status === 'DI_BAWAH_AMBANG' ? 'warn' : 'bad';
  return (
    <Badge tone={tone}>
      <Icon className="h-3 w-3" aria-hidden />
      {MAPPING_STATUS_LABEL[status]}
    </Badge>
  );
}

export function OriginBadge({ origin }: { origin: QuestionOrigin }) {
  const tone: Tone = origin === 'KAMUS_AWAL' ? 'neutral' : origin === 'SUNTINGAN_VERIFIKATOR' ? 'info' : 'violet';
  return (
    <Badge tone={tone}>
      {(origin === 'DRAF_AI' || origin === 'DRAF_AI_DISUNTING') && <Sparkles className="h-3 w-3" aria-hidden />}
      {ORIGIN_LABEL[origin]}
    </Badge>
  );
}

/** The AI score, always labelled as what it is: a simulated estimate, not a verdict on the claim. */
export function ConfidencePill({ value, below }: { value: number | null; below?: boolean }) {
  if (value === null) return <Badge tone="neutral">Tanpa skor AI</Badge>;
  return (
    <Badge tone={below ? 'warn' : 'accent'} title="Keyakinan AI (simulasi): perkiraan peluang peserta memberi jawaban pasti. Bukan penilaian keabsahan klaim.">
      <Sparkles className="h-3 w-3" aria-hidden />
      Keyakinan AI <span className="tabular">{formatScore(value)}</span>
    </Badge>
  );
}

/** Claim-level inconsistency indication from the participant's answers (rule-based, not a fraud probability). */
export function IndicationBadge({ value, threshold }: { value: number; threshold: number }) {
  const tone: Tone = value >= threshold ? 'bad' : value > 0 ? 'warn' : 'neutral';
  return (
    <Badge tone={tone} title={SCORE_DISCLAIMER}>
      Indikasi <span className="tabular">{formatScore(value)}</span>
    </Badge>
  );
}
