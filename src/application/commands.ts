import type { DraftResponse, RankRequest, RankedQuestion } from '../ai/service';
import { checkQuestion } from '../domain/checks';
import { claimedNights } from '../domain/evidence';
import { bestMatch, episodeEntry, episodeTopicsFor, mappingStatus } from '../domain/mapping';
import {
  assignmentsOf,
  currentAssignment,
  currentVersion,
  failedFaceChecks,
  findClaim,
  getClaim,
  getEntry,
  getParticipant,
  getQuestion,
  getVersion,
  nextId,
  passedFaceCheck,
  questionForEntry,
  sessionFor,
} from '../domain/queries';
import type {
  ActorRef,
  AiConfig,
  AiDraft,
  AnswerOption,
  Assignment,
  CareClass,
  CareType,
  Claim,
  ClaimMapping,
  ClaimStatus,
  CodedItem,
  Db,
  DecisionOutcome,
  DictionaryEntry,
  DraftProposal,
  FristaCheck,
  FristaResult,
  Iso,
  MappingTarget,
  Notification,
  Question,
  QuestionOrigin,
  QuestionSelection,
  ResponseSession,
  SelectionItem,
  Suggestion,
} from '../domain/types';
import { formatPeriod, wibDate } from '../lib/format';

// Every change to the shared database goes through one of these commands. They mutate the draft `db`
// they are given (the store hands them a copy and commits it atomically), validate first, and leave an
// audit entry. The seed replays the same commands, so seeded and live records follow the same rules.

export interface Ctx {
  now: Iso;
  actor: ActorRef;
}

export class CommandError extends Error {
  readonly code: string;
  readonly fields: Record<string, string>;
  constructor(code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

/** Days a participant has to answer before the round closes without an answer. */
export const RESPONSE_WINDOW_DAYS = 28;
/** Counted face-check failures before the participant is routed to a phone call. */
export const MAX_FACE_FAILURES = 2;

export const SYSTEM_ACTOR: ActorRef = { role: 'SISTEM', id: 'SYS', name: 'Sistem' };

function audit(db: Db, ctx: Ctx, action: string, entity: string, entityId: string, claimId: string | null, summary: string) {
  db.audit.push({ id: nextId(db, 'AUD', 7), at: ctx.now, actor: ctx.actor, action, entity, entityId, claimId, summary });
}

function setStatus(db: Db, claim: Claim, to: ClaimStatus, ctx: Ctx, note: string) {
  if (claim.status === to) return;
  db.statusHistory.push({ id: nextId(db, 'STS', 7), claimId: claim.id, from: claim.status, to, at: ctx.now, actor: ctx.actor, note });
  claim.status = to;
  claim.statusUpdatedAt = ctx.now;
}

function notify(db: Db, ctx: Ctx, n: Omit<Notification, 'id' | 'createdAt' | 'readAt'>): Notification {
  const notification: Notification = { ...n, id: nextId(db, 'NTF'), createdAt: ctx.now, readAt: null };
  db.notifications.push(notification);
  return notification;
}

function addDaysIso(iso: Iso, days: number): Iso {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

// ── Facility: claim submission ──────────────────────────────────────────────

export interface ClaimInput {
  participantId: string;
  facilityId: string;
  practitionerId: string;
  sepNumber: string;
  careType: CareType;
  careClass: CareClass;
  admissionDate: string;
  dischargeDate: string;
  diagnosis: CodedItem;
  secondaryDiagnoses: CodedItem[];
  procedures: { code: string; name: string; quantity: number }[];
  inaCbg: { code: string; tariff: number };
  hospitalCharge: number;
}

const ICD10 = /^[A-Z]\d{2}(\.\d{1,2})?$/;
const ICD9 = /^\d{2}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Field-level validation shared by the claim form and the command. Empty result means valid. */
export function validateClaimInput(db: Db, input: ClaimInput, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  const participant = db.participants.find((p) => p.id === input.participantId);
  if (!participant) e.participantId = 'Pilih peserta JKN yang terdaftar.';
  else if (participant.status !== 'AKTIF') e.participantId = 'Kepesertaan JKN tidak aktif.';
  if (!db.facilities.some((f) => f.id === input.facilityId)) e.facilityId = 'Faskes tidak dikenal.';
  const doctor = db.practitioners.find((p) => p.id === input.practitionerId);
  if (!doctor || doctor.facilityId !== input.facilityId) e.practitionerId = 'Pilih DPJP dari faskes ini.';

  const sep = input.sepNumber.trim().toUpperCase();
  if (!/^[0-9A-Z]{10,20}$/.test(sep)) e.sepNumber = 'Nomor SEP 10–20 karakter huruf/angka.';
  else if (db.claims.some((c) => c.sepNumber === sep)) e.sepNumber = 'Nomor SEP sudah dipakai klaim lain.';

  if (!DATE.test(input.admissionDate)) e.admissionDate = 'Isi tanggal masuk.';
  if (!DATE.test(input.dischargeDate)) e.dischargeDate = 'Isi tanggal pulang.';
  if (!e.admissionDate && !e.dischargeDate) {
    if (input.dischargeDate > today) e.dischargeDate = 'Tanggal pulang tidak boleh di masa depan.';
    else if (input.dischargeDate < input.admissionDate) e.dischargeDate = 'Tanggal pulang sebelum tanggal masuk.';
    else if (input.careType === 'RAWAT_INAP' && input.dischargeDate === input.admissionDate)
      e.dischargeDate = 'Rawat inap minimal satu malam.';
    else if (input.careType === 'RAWAT_JALAN' && input.dischargeDate !== input.admissionDate)
      e.dischargeDate = 'Rawat jalan: tanggal pulang sama dengan tanggal masuk.';
    else if (input.admissionDate < '2020-01-01') e.admissionDate = 'Tanggal masuk tidak wajar.';
  }

  if (!ICD10.test(input.diagnosis.code.trim().toUpperCase())) e.diagnosis = 'Kode ICD-10 tidak valid (contoh: A91 atau J18.9).';
  else if (!input.diagnosis.name.trim()) e.diagnosis = 'Isi nama diagnosis.';

  if (input.procedures.length > 10) e.procedures = 'Maksimal 10 baris tindakan.';
  const seen = new Set<string>();
  input.procedures.forEach((p, i) => {
    const code = p.code.trim();
    if (!ICD9.test(code)) e[`procedures.${i}`] = 'Kode ICD-9-CM tidak valid (contoh: 87.44).';
    else if (!p.name.trim()) e[`procedures.${i}`] = 'Isi nama tindakan.';
    else if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 99) e[`procedures.${i}`] = 'Jumlah 1–99.';
    else if (seen.has(code)) e[`procedures.${i}`] = 'Kode tindakan ganda.';
    seen.add(code);
  });

  if (!/^[A-Z]-\d-\d{1,2}-[A-Z0-9]{1,3}$/.test(input.inaCbg.code.trim().toUpperCase())) e.inaCbgCode = 'Format kode INA-CBG, contoh A-4-14-I.';
  if (!(input.inaCbg.tariff > 0)) e.inaCbgTariff = 'Tarif INA-CBG harus lebih dari 0.';
  if (!(input.hospitalCharge > 0)) e.hospitalCharge = 'Tarif rumah sakit harus lebih dari 0.';
  return e;
}

function targetKey(t: MappingTarget): string {
  return t.kind === 'EPISODE' ? `EP:${t.topic}` : `PR:${t.lineId}`;
}

/**
 * Matches the claim against the dictionary and stores one mapping per attribute. Re-running it updates
 * the same records (stable IDs) instead of adding duplicates.
 */
export function mapClaim(db: Db, claim: Claim, ctx: Ctx): ClaimMapping[] {
  const threshold = db.aiConfig.mappingThreshold;
  const targets: { target: MappingTarget; entryId: string | null; matchType: ClaimMapping['matchType']; relevance: number }[] = [];
  for (const topic of episodeTopicsFor(claim)) {
    const entry = episodeEntry(db.dictionary, topic);
    targets.push({ target: { kind: 'EPISODE', topic }, entryId: entry?.id ?? null, matchType: entry ? 'EPISODE' : 'TIDAK_ADA', relevance: entry ? 1 : 0 });
  }
  for (const line of claim.procedures) {
    const m = bestMatch(line, db.dictionary);
    targets.push({ target: { kind: 'PROSEDUR', lineId: line.lineId, code: line.code, name: line.name }, ...m });
  }
  const existing = db.mappings.filter((m) => m.claimId === claim.id);
  return targets.map((t) => {
    const status = mappingStatus({ entryId: t.entryId, matchType: t.matchType, relevance: t.relevance }, threshold);
    const prev = existing.find((m) => targetKey(m.target) === targetKey(t.target));
    if (prev) {
      if (prev.entryId !== t.entryId || prev.relevance !== t.relevance || prev.status !== status) {
        Object.assign(prev, { entryId: t.entryId, matchType: t.matchType, relevance: t.relevance, status, computedAt: ctx.now });
      }
      return prev;
    }
    const mapping: ClaimMapping = { id: nextId(db, 'MAP', 7), claimId: claim.id, ...t, status, computedAt: ctx.now };
    db.mappings.push(mapping);
    return mapping;
  });
}

interface Candidate {
  question: Question;
  entry: DictionaryEntry;
  mapping: ClaimMapping;
}

/** Questions worth ranking for a claim: one per mapped entry (low-relevance matches included, flagged). */
export function candidatesFor(db: Db, claimId: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const mapping of db.mappings.filter((m) => m.claimId === claimId && m.entryId)) {
    const question = questionForEntry(db, mapping.entryId!);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    out.push({ question, entry: getEntry(db, mapping.entryId!), mapping });
  }
  return out;
}

export function rankRequestFor(claim: Claim, candidates: readonly Candidate[]): RankRequest {
  return {
    claimKey: claim.id,
    careType: claim.careType,
    claimedNights: claimedNights(claim),
    candidates: candidates.map((c) => ({
      questionId: c.question.id,
      version: currentVersion(c.question).version,
      entry: { id: c.entry.id, scope: c.entry.scope, topic: c.entry.topic, category: c.entry.category, observability: c.entry.observability },
      relevance: c.mapping.relevance,
    })),
  };
}

export type Ranker = (request: RankRequest) => RankedQuestion[];

function episodeOrder(entry: DictionaryEntry): number {
  return entry.topic === 'KEBERADAAN' ? 0 : entry.topic === 'LAMA_RAWAT' ? 1 : 2;
}

/**
 * Turns ranked candidates into suggestions (the AI confidence observations) and adds them to the
 * claim's working selection. Episode questions come first; the rest follow AI confidence. Only mapped,
 * high-enough suggestions within the question limit are preselected.
 */
function addSuggestions(db: Db, claim: Claim, candidates: Candidate[], ranked: RankedQuestion[], ctx: Ctx, model: { id: string; version: string }) {
  const cfg = db.aiConfig;
  const scored = candidates.map((c) => {
    const r = ranked.find((x) => x.questionId === c.question.id);
    if (!r) throw new CommandError('AI_STALE', 'Hasil AI tidak memuat semua kandidat; ulangi.');
    return { ...c, confidence: r.confidence, version: r.version };
  });
  scored.sort((a, b) => episodeOrder(a.entry) - episodeOrder(b.entry) || b.confidence - a.confidence || a.question.id.localeCompare(b.question.id));
  const selection = ensureSelection(db, claim.id, ctx);
  const existingRank = db.suggestions.filter((s) => s.claimId === claim.id).length;
  let selected = selection.items.filter((i) => i.included).length;
  scored.forEach((c, i) => {
    if (selection.items.some((it) => it.questionId === c.question.id)) return;
    const preselected =
      c.mapping.status === 'TERPETAKAN' &&
      (c.entry.scope === 'EPISODE' || c.confidence >= cfg.autoSelectThreshold) &&
      selected < cfg.maxQuestions;
    if (preselected) selected += 1;
    const suggestion: Suggestion = {
      id: nextId(db, 'SUG', 7),
      claimId: claim.id,
      questionId: c.question.id,
      questionVersion: c.version,
      mappingId: c.mapping.id,
      source: 'PEMETAAN_KAMUS',
      aiConfidence: c.confidence,
      confidenceEvent: 'JAWABAN_PASTI',
      model,
      aiConfigVersion: cfg.version,
      rank: existingRank + i + 1,
      preselected,
      createdAt: ctx.now,
      verifierAction: null,
      actionAt: null,
    };
    db.suggestions.push(suggestion);
    selection.items.push({ questionId: c.question.id, version: c.version, included: preselected, source: 'PEMETAAN', suggestionId: suggestion.id, edit: null });
  });
  selection.updatedAt = ctx.now;
}

function ensureSelection(db: Db, claimId: string, ctx: Ctx): QuestionSelection {
  let selection = db.selections.find((s) => s.claimId === claimId);
  if (!selection) {
    selection = { claimId, items: [], updatedAt: ctx.now, updatedBy: ctx.actor };
    db.selections.push(selection);
  }
  return selection;
}

export function submitClaim(db: Db, input: ClaimInput, ctx: Ctx, rank: Ranker, model: { id: string; version: string }): Claim {
  const errors = validateClaimInput(db, input, wibDate(ctx.now));
  if (Object.keys(errors).length) throw new CommandError('INVALID_CLAIM', 'Data klaim belum lengkap atau tidak valid.', errors);
  const id = nextId(db, 'KLM');
  const claim: Claim = {
    id,
    sepNumber: input.sepNumber.trim().toUpperCase(),
    participantId: input.participantId,
    facilityId: input.facilityId,
    practitionerId: input.practitionerId,
    careType: input.careType,
    careClass: input.careClass,
    admissionDate: input.admissionDate,
    dischargeDate: input.dischargeDate,
    diagnosis: { code: input.diagnosis.code.trim().toUpperCase(), name: input.diagnosis.name.trim() },
    secondaryDiagnoses: input.secondaryDiagnoses.filter((d) => d.code.trim()).map((d) => ({ code: d.code.trim().toUpperCase(), name: d.name.trim() })),
    procedures: input.procedures.map((p, i) => ({ lineId: `L${i + 1}`, code: p.code.trim(), name: p.name.trim(), quantity: p.quantity })),
    inaCbg: { code: input.inaCbg.code.trim().toUpperCase(), tariff: input.inaCbg.tariff },
    hospitalCharge: input.hospitalCharge,
    submittedAt: ctx.now,
    submittedBy: ctx.actor,
    status: 'DIAJUKAN',
    statusUpdatedAt: ctx.now,
    decision: null,
  };
  db.claims.push(claim);
  db.statusHistory.push({ id: nextId(db, 'STS', 7), claimId: id, from: null, to: 'DIAJUKAN', at: ctx.now, actor: ctx.actor, note: 'Klaim diajukan faskes.' });
  audit(db, ctx, 'KLAIM_DIAJUKAN', 'Claim', id, id, `SEP ${claim.sepNumber}, ${claim.procedures.length} tindakan`);

  const sysCtx = { now: ctx.now, actor: SYSTEM_ACTOR };
  const mappings = mapClaim(db, claim, sysCtx);
  const mapped = mappings.filter((m) => m.status === 'TERPETAKAN').length;
  audit(db, sysCtx, 'PEMETAAN_KAMUS', 'Claim', id, id, `${mapped} dari ${mappings.length} atribut terpetakan ke kamus`);
  const candidates = candidatesFor(db, id);
  addSuggestions(db, claim, candidates, rank(rankRequestFor(claim, candidates)), { now: ctx.now, actor: { role: 'AI', id: model.id, name: 'AI (simulasi)' } }, model);
  return claim;
}

// ── Verifier: question preparation and publication ──────────────────────────

function isLocked(db: Db, claim: Claim): boolean {
  const current = currentAssignment(db, claim.id);
  return claim.status === 'SELESAI' || (current !== undefined && current.status !== 'AKTIF');
}

function sanitizeOptions(options: readonly AnswerOption[]): AnswerOption[] {
  return options.map((o) => ({ ...o, label: o.label.trim() }));
}

/** Saves the verifier's working selection without publishing anything to the participant. */
export function saveSelection(db: Db, claimId: string, items: SelectionItem[], ctx: Ctx): QuestionSelection {
  const claim = getClaim(db, claimId);
  if (isLocked(db, claim)) throw new CommandError('LOCKED', 'Pertanyaan klaim ini sudah dijawab atau ditutup.');
  for (const item of items) getVersion(db, item.questionId, item.version);
  const selection = ensureSelection(db, claimId, ctx);
  selection.items = items.map((i) => ({ ...i, edit: i.edit ? { text: i.edit.text.trim(), options: sanitizeOptions(i.edit.options) } : null }));
  selection.updatedAt = ctx.now;
  selection.updatedBy = ctx.actor;
  audit(db, ctx, 'PILIHAN_DISIMPAN', 'QuestionSelection', claimId, claimId, `${items.filter((i) => i.included).length} pertanyaan dipilih (belum diterbitkan)`);
  return selection;
}

function addVersion(question: Question, v: { text: string; options: AnswerOption[] }, origin: QuestionOrigin, ctx: Ctx, note: string, aiDraftId: string | null = null) {
  const base = currentVersion(question);
  const version = {
    version: base.version + 1,
    text: v.text.trim(),
    options: sanitizeOptions(v.options),
    origin,
    aiDraftId,
    basedOnVersion: base.version,
    createdAt: ctx.now,
    createdBy: ctx.actor,
    note,
  };
  question.versions.push(version);
  return version;
}

export function editIsChange(base: { text: string; options: readonly AnswerOption[] }, edit: { text: string; options: readonly AnswerOption[] }): boolean {
  return base.text.trim() !== edit.text.trim() || JSON.stringify(sanitizeOptions(base.options)) !== JSON.stringify(sanitizeOptions(edit.options));
}

/**
 * Publishes the included questions to the participant: edits become new question versions, a new
 * assignment round pins exact versions, the previous unanswered round is superseded, suggestions record
 * what the verifier did, and the participant is notified.
 */
export function publishQuestions(db: Db, claimId: string, items: SelectionItem[], ctx: Ctx): Assignment {
  const claim = getClaim(db, claimId);
  if (isLocked(db, claim)) throw new CommandError('LOCKED', 'Pertanyaan klaim ini sudah dijawab atau ditutup.');
  if (!['DIAJUKAN', 'MENUNGGU_PESERTA'].includes(claim.status)) {
    throw new CommandError('BAD_STATUS', 'Pertanyaan hanya dapat diterbitkan sebelum peserta menjawab.');
  }
  const included = items.filter((i) => i.included);
  if (included.length === 0) throw new CommandError('EMPTY', 'Pilih setidaknya satu pertanyaan.');
  if (included.length > db.aiConfig.maxQuestions) {
    throw new CommandError('TOO_MANY', `Maksimal ${db.aiConfig.maxQuestions} pertanyaan per klaim (lihat Konfigurasi AI).`);
  }
  const ids = new Set(included.map((i) => i.questionId));
  if (ids.size !== included.length) throw new CommandError('DUPLICATE', 'Pertanyaan yang sama dipilih dua kali.');

  // Validate every edit before changing anything.
  for (const item of included) {
    const base = getVersion(db, item.questionId, item.version);
    if (item.edit && editIsChange(base, item.edit)) {
      const entry = getEntry(db, getQuestion(db, item.questionId).entryId);
      const failed = checkQuestion(item.edit.text, item.edit.options, entry.avoidTerms).filter((r) => !r.ok);
      if (failed.length) throw new CommandError('CHECKS_FAILED', `Suntingan "${item.edit.text.slice(0, 40)}…" belum lolos pemeriksaan: ${failed[0].message}`);
    }
  }

  const finalItems = included.map((item, order) => {
    const question = getQuestion(db, item.questionId);
    const base = getVersion(db, item.questionId, item.version);
    let version = base.version;
    let edited = false;
    if (item.edit && editIsChange(base, item.edit)) {
      version = addVersion(question, item.edit, 'SUNTINGAN_VERIFIKATOR', ctx, `Disunting saat menyiapkan klaim ${claimId}`).version;
      edited = true;
      audit(db, ctx, 'PERTANYAAN_DISUNTING', 'Question', question.id, claimId, `${question.id} v${version} (dari v${base.version})`);
    }
    return { item, version, edited, order: order + 1 };
  });

  const previous = currentAssignment(db, claimId);
  const round = assignmentsOf(db, claimId).length + 1;
  const assignment: Assignment = {
    id: nextId(db, 'ASG'),
    claimId,
    participantId: claim.participantId,
    round,
    items: finalItems.map((f) => ({ questionId: f.item.questionId, questionVersion: f.version, order: f.order, suggestionId: f.item.suggestionId })),
    publishedAt: ctx.now,
    publishedBy: ctx.actor,
    status: 'AKTIF',
    supersededBy: null,
  };
  if (previous && previous.status === 'AKTIF') {
    previous.status = 'DIGANTIKAN';
    previous.supersededBy = assignment.id;
  }
  db.assignments.push(assignment);

  // What the verifier did with each AI suggestion; later rounds overwrite earlier ones.
  for (const s of db.suggestions.filter((x) => x.claimId === claimId)) {
    const f = finalItems.find((x) => x.item.suggestionId === s.id);
    s.verifierAction = f ? (f.edited ? 'DISUNTING' : 'DITERIMA') : 'DIHAPUS';
    s.actionAt = ctx.now;
  }

  const selection = ensureSelection(db, claimId, ctx);
  selection.items = items.map((i) => {
    const f = finalItems.find((x) => x.item.questionId === i.questionId);
    return { ...i, version: f ? f.version : i.version, edit: f ? null : i.edit };
  });
  selection.updatedAt = ctx.now;
  selection.updatedBy = ctx.actor;

  setStatus(db, claim, 'MENUNGGU_PESERTA', ctx, round === 1 ? `${finalItems.length} pertanyaan diterbitkan ke peserta.` : `Pertanyaan diperbarui (putaran ${round}).`);
  const facility = db.facilities.find((f) => f.id === claim.facilityId);
  notify(db, ctx, {
    participantId: claim.participantId,
    claimId,
    assignmentId: assignment.id,
    kind: round === 1 ? 'PERTANYAAN_BARU' : 'PERTANYAAN_DIPERBARUI',
    title: round === 1 ? 'Konfirmasi layanan kesehatan Anda' : 'Pertanyaan konfirmasi diperbarui',
    body: `BPJS Kesehatan meminta Anda mengonfirmasi layanan di ${facility?.name ?? 'rumah sakit'} (${formatPeriod(claim.admissionDate)}). ${finalItems.length} pertanyaan singkat, sukarela.`,
  });
  audit(db, ctx, 'PERTANYAAN_DITERBITKAN', 'Assignment', assignment.id, claimId, `Putaran ${round}: ${finalItems.map((f) => `${f.item.questionId} v${f.version}`).join(', ')}`);
  return assignment;
}

/** Dictionary page: a direct edit becomes the question's next version. */
export function editQuestion(db: Db, questionId: string, v: { text: string; options: AnswerOption[]; note: string }, ctx: Ctx) {
  const question = getQuestion(db, questionId);
  const entry = getEntry(db, question.entryId);
  if (!editIsChange(currentVersion(question), v)) throw new CommandError('NO_CHANGE', 'Tidak ada perubahan.');
  const failed = checkQuestion(v.text, v.options, entry.avoidTerms).filter((r) => !r.ok);
  if (failed.length) throw new CommandError('CHECKS_FAILED', failed[0].message);
  const version = addVersion(question, v, 'SUNTINGAN_VERIFIKATOR', ctx, v.note.trim() || 'Disunting di kamus pengalaman');
  audit(db, ctx, 'PERTANYAAN_DISUNTING', 'Question', questionId, null, `${questionId} v${version.version}`);
  return version;
}

// ── Verifier: AI drafts ─────────────────────────────────────────────────────

export function recordDraft(
  db: Db,
  args: { claimId: string | null; target: AiDraft['target']; response: DraftResponse; variant: number; previousDraftId: string | null; model: AiDraft['generator'] },
  ctx: Ctx,
): AiDraft {
  if (args.previousDraftId) {
    const prev = db.drafts.find((d) => d.id === args.previousDraftId);
    if (!prev || prev.status !== 'DRAF') throw new CommandError('BAD_DRAFT', 'Draf sebelumnya sudah diproses.');
    prev.status = 'DIGANTIKAN';
    prev.resolvedAt = ctx.now;
    prev.resolvedBy = ctx.actor;
  }
  const draft: AiDraft = {
    id: nextId(db, 'DRF'),
    claimId: args.claimId,
    target: args.target,
    status: 'DRAF',
    previousDraftId: args.previousDraftId,
    variant: args.variant,
    generatedAt: ctx.now,
    requestedBy: ctx.actor,
    generator: args.model,
    context: {
      claimAttributes: args.response.claimAttributes,
      referenceEntryIds: args.response.referenceEntryIds,
      experienceSourceFound: args.response.experienceSourceFound,
    },
    proposal: args.response.proposal,
    edited: null,
    confidence: args.response.confidence,
    rationale: args.response.rationale,
    resolvedAt: null,
    resolvedBy: null,
    approvedEntryId: null,
    approvedQuestionId: null,
  };
  db.drafts.push(draft);
  audit(db, ctx, args.previousDraftId ? 'DRAF_AI_DIBUAT_ULANG' : 'DRAF_AI_DIMINTA', 'AiDraft', draft.id, args.claimId, `${args.target.code} ${args.target.name}, keyakinan ${args.response.confidence}`);
  return draft;
}

function openDraft(db: Db, draftId: string): AiDraft {
  const draft = db.drafts.find((d) => d.id === draftId);
  if (!draft) throw new CommandError('NOT_FOUND', `Draf ${draftId} tidak ditemukan.`);
  if (draft.status !== 'DRAF') throw new CommandError('BAD_DRAFT', 'Draf ini sudah diproses.');
  return draft;
}

export function saveDraftEdits(db: Db, draftId: string, edited: DraftProposal, ctx: Ctx): AiDraft {
  const draft = openDraft(db, draftId);
  draft.edited = { ...edited, text: edited.text.trim(), options: sanitizeOptions(edited.options) };
  audit(db, ctx, 'DRAF_AI_DISUNTING', 'AiDraft', draftId, draft.claimId, 'Suntingan draf disimpan');
  return draft;
}

export function discardDraft(db: Db, draftId: string, reason: string, ctx: Ctx): AiDraft {
  const draft = openDraft(db, draftId);
  draft.status = 'DIBUANG';
  draft.resolvedAt = ctx.now;
  draft.resolvedBy = ctx.actor;
  audit(db, ctx, 'DRAF_AI_DIBUANG', 'AiDraft', draftId, draft.claimId, reason.trim() || 'Dibuang verifikator');
  return draft;
}

/** Claims whose mapping would change if an entry for `code` existed, with their ranking candidates. */
export function claimsAffectedByCode(db: Db, code: string): Claim[] {
  return db.claims.filter((c) => c.procedures.some((p) => p.code === code));
}

/**
 * Approving a draft is the only way AI wording enters the dictionary: it creates the entry and the
 * question (v1), re-maps claims that bill the same code, and suggests the new question on claims that
 * are still being prepared. Nothing is published to a participant here.
 */
export function approveDraft(db: Db, draftId: string, ctx: Ctx, rank: Ranker, model: { id: string; version: string }) {
  const draft = openDraft(db, draftId);
  const final = draft.edited ?? draft.proposal;
  const failed = checkQuestion(final.text, final.options, final.avoidTerms).filter((r) => !r.ok);
  if (failed.length) throw new CommandError('CHECKS_FAILED', `Draf belum lolos pemeriksaan: ${failed[0].message}`);
  if (db.dictionary.some((e) => e.code === draft.target.code && e.status === 'AKTIF')) {
    throw new CommandError('EXISTS', `Kamus sudah punya entri untuk kode ${draft.target.code}.`);
  }
  const edited = draft.edited !== null && editIsChange(draft.proposal, draft.edited);
  const entry: DictionaryEntry = {
    id: nextId(db, 'KMS', 4),
    scope: 'PROSEDUR',
    topic: null,
    code: draft.target.code,
    name: draft.target.name,
    category: draft.target.category,
    experiences: final.experiences,
    avoidTerms: final.avoidTerms,
    observability: null,
    source: 'DRAF_AI',
    aiDraftId: draft.id,
    createdAt: ctx.now,
    status: 'AKTIF',
  };
  db.dictionary.push(entry);
  const question: Question = {
    id: nextId(db, 'QST', 4),
    entryId: entry.id,
    status: 'AKTIF',
    versions: [
      {
        version: 1,
        text: final.text.trim(),
        options: sanitizeOptions(final.options),
        origin: edited ? 'DRAF_AI_DISUNTING' : 'DRAF_AI',
        aiDraftId: draft.id,
        basedOnVersion: null,
        createdAt: ctx.now,
        createdBy: ctx.actor,
        note: edited ? 'Draf AI disetujui setelah disunting verifikator' : 'Draf AI disetujui tanpa suntingan',
      },
    ],
  };
  db.questions.push(question);
  draft.status = 'DISETUJUI';
  draft.resolvedAt = ctx.now;
  draft.resolvedBy = ctx.actor;
  draft.approvedEntryId = entry.id;
  draft.approvedQuestionId = question.id;
  audit(db, ctx, 'DRAF_AI_DISETUJUI', 'AiDraft', draft.id, draft.claimId, `Entri ${entry.id} dan ${question.id} v1 dibuat`);

  const sysCtx = { now: ctx.now, actor: SYSTEM_ACTOR };
  for (const claim of claimsAffectedByCode(db, draft.target.code)) {
    mapClaim(db, claim, sysCtx);
    // Only claims not yet answered get the new question suggested; nothing is republished automatically.
    if (isLocked(db, claim) || !['DIAJUKAN', 'MENUNGGU_PESERTA'].includes(claim.status)) continue;
    const candidates = candidatesFor(db, claim.id).filter((c) => c.question.id === question.id);
    if (!candidates.length) continue;
    addSuggestions(db, claim, candidates, rank(rankRequestFor(claim, candidates)), sysCtx, model);
    if (claim.id === draft.claimId) {
      const item = ensureSelection(db, claim.id, ctx).items.find((i) => i.questionId === question.id);
      if (item) {
        item.included = true;
        item.source = 'DRAF_AI';
      }
    }
  }
  return { entry, question };
}

// ── Verifier: configuration and decision ────────────────────────────────────

export function updateAiConfig(db: Db, patch: Partial<Pick<AiConfig, 'mappingThreshold' | 'autoSelectThreshold' | 'maxQuestions' | 'draftWarningThreshold'>>, ctx: Ctx): AiConfig {
  const next: AiConfig = { ...db.aiConfig, ...patch, version: db.aiConfig.version + 1, updatedAt: ctx.now, updatedBy: ctx.actor };
  const inUnit = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
  if (!inUnit(next.mappingThreshold) || !inUnit(next.autoSelectThreshold) || !inUnit(next.draftWarningThreshold)) {
    throw new CommandError('INVALID_CONFIG', 'Ambang harus di antara 0 dan 1.');
  }
  if (!Number.isInteger(next.maxQuestions) || next.maxQuestions < 1 || next.maxQuestions > 8) {
    throw new CommandError('INVALID_CONFIG', 'Jumlah pertanyaan maksimal 1–8.');
  }
  db.aiConfigHistory.push(db.aiConfig);
  db.aiConfig = next;
  const changed = Object.keys(patch).join(', ');
  audit(db, ctx, 'KONFIGURASI_AI_DIUBAH', 'AiConfig', `v${next.version}`, null, `Versi ${next.version}: ${changed}`);
  return next;
}

export function decideClaim(db: Db, claimId: string, outcome: DecisionOutcome, reason: string, ctx: Ctx): Claim {
  const claim = getClaim(db, claimId);
  if (claim.status === 'SELESAI') throw new CommandError('DECIDED', 'Klaim ini sudah diputuskan.');
  if (claim.status === 'DIAJUKAN' || claim.status === 'MENUNGGU_PESERTA') {
    throw new CommandError('NOT_READY', 'Keputusan dibuat setelah ada jawaban atau proses peserta berakhir.');
  }
  if (reason.trim().length < 10) throw new CommandError('REASON_REQUIRED', 'Tulis alasan keputusan (minimal 10 karakter).', { reason: 'Wajib diisi.' });
  claim.decision = { outcome, reason: reason.trim(), decidedAt: ctx.now, decidedBy: ctx.actor };
  setStatus(db, claim, 'SELESAI', ctx, `Keputusan: ${outcome}`);
  audit(db, ctx, 'KEPUTUSAN_DIBUAT', 'Claim', claimId, claimId, outcome);
  return claim;
}

// ── Participant ─────────────────────────────────────────────────────────────

function activeAssignmentFor(db: Db, assignmentId: string, participantId: string): { assignment: Assignment; claim: Claim } {
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment || assignment.participantId !== participantId) throw new CommandError('NOT_FOUND', 'Pertanyaan tidak ditemukan untuk peserta ini.');
  if (assignment.status === 'DIGANTIKAN') throw new CommandError('SUPERSEDED', 'Pertanyaan ini sudah diperbarui verifikator. Buka versi terbaru.');
  if (assignment.status === 'DIJAWAB') throw new CommandError('ALREADY_SUBMITTED', 'Jawaban untuk pertanyaan ini sudah terkirim.');
  if (assignment.status === 'DITUTUP') throw new CommandError('CLOSED', 'Pertanyaan ini sudah ditutup.');
  return { assignment, claim: getClaim(db, assignment.claimId) };
}

export function markNotificationRead(db: Db, notificationId: string, ctx: Ctx) {
  const n = db.notifications.find((x) => x.id === notificationId);
  if (!n || n.participantId !== ctx.actor.id) throw new CommandError('NOT_FOUND', 'Notifikasi tidak ditemukan.');
  if (!n.readAt) n.readAt = ctx.now;
}

/** FRISTA result. A match unlocks the questions; two mismatches or no camera route the case to a phone call. */
export function recordFrista(db: Db, assignmentId: string, result: FristaResult, ctx: Ctx): FristaCheck {
  const { assignment, claim } = activeAssignmentFor(db, assignmentId, ctx.actor.id);
  if (passedFaceCheck(db, assignmentId)) throw new CommandError('ALREADY_VERIFIED', 'Wajah sudah cocok untuk sesi ini.');
  const failedBefore = failedFaceChecks(db, assignmentId);
  if (failedBefore >= MAX_FACE_FAILURES || claim.status === 'PERLU_KONTAK') {
    throw new CommandError('ROUTED_TO_PHONE', 'Verifikasi wajah sudah gagal dua kali. Petugas BPJS akan menghubungi Anda.');
  }
  const failedAttempts = failedBefore + (result === 'TIDAK_COCOK' ? 1 : 0);
  const check: FristaCheck = { id: nextId(db, 'FRS'), participantId: ctx.actor.id, claimId: claim.id, assignmentId, result, failedAttempts, at: ctx.now, method: 'SIMULASI' };
  db.fristaChecks.push(check);
  audit(db, ctx, 'FRISTA', 'FristaCheck', check.id, claim.id, result);
  if (result === 'TANPA_KAMERA' || failedAttempts >= MAX_FACE_FAILURES) {
    assignment.status = 'DITUTUP';
    setStatus(db, claim, 'PERLU_KONTAK', ctx, result === 'TANPA_KAMERA' ? 'Peserta tidak punya kamera; dialihkan ke telepon.' : 'Cek wajah gagal dua kali; dialihkan ke telepon.');
  }
  return check;
}

export function declineQuestions(db: Db, assignmentId: string, ctx: Ctx) {
  const { assignment, claim } = activeAssignmentFor(db, assignmentId, ctx.actor.id);
  assignment.status = 'DITUTUP';
  setStatus(db, claim, 'DITOLAK_PESERTA', ctx, 'Peserta memilih tidak menjawab. Hak layanan tidak berubah.');
  audit(db, ctx, 'PESERTA_MENOLAK', 'Assignment', assignmentId, claim.id, 'Peserta tidak bersedia menjawab');
}

export interface AnswerInput {
  questionId: string;
  questionVersion: number;
  optionId: string;
  answeredAt: Iso;
}

/**
 * Records all answers of one round in a single write. Rejects a second submission, a superseded round,
 * a missing face match, and answers that do not belong to the exact published versions. After a denial
 * the remaining questions are stored as skipped.
 */
export function submitResponses(db: Db, args: { assignmentId: string; answers: AnswerInput[]; startedAt: Iso }, ctx: Ctx): ResponseSession {
  const { assignment, claim } = activeAssignmentFor(db, args.assignmentId, ctx.actor.id);
  if (sessionFor(db, assignment.id)) throw new CommandError('ALREADY_SUBMITTED', 'Jawaban untuk pertanyaan ini sudah terkirim.');
  const face = passedFaceCheck(db, assignment.id);
  if (!face) throw new CommandError('FRISTA_REQUIRED', 'Verifikasi wajah FRISTA diperlukan sebelum mengirim jawaban.');

  const items = [...assignment.items].sort((a, b) => a.order - b.order);
  const byQuestion = new Map(args.answers.map((a) => [a.questionId, a]));
  if (byQuestion.size !== args.answers.length) throw new CommandError('DUPLICATE_ANSWER', 'Satu pertanyaan dijawab dua kali.');
  let denied = false;
  const resolved = items.map((item) => {
    const version = getVersion(db, item.questionId, item.questionVersion);
    const given = byQuestion.get(item.questionId);
    if (denied) return { item, option: null as AnswerOption | null, answeredAt: given?.answeredAt ?? ctx.now };
    if (!given) throw new CommandError('INCOMPLETE', 'Semua pertanyaan perlu dijawab (pilih "Tidak ingat" bila tidak ingat).');
    if (given.questionVersion !== item.questionVersion) throw new CommandError('VERSION_MISMATCH', 'Versi pertanyaan berubah. Muat ulang pertanyaan.');
    const option = version.options.find((o) => o.id === given.optionId);
    if (!option) throw new CommandError('BAD_OPTION', 'Pilihan jawaban tidak dikenal.');
    if (option.denial) denied = true;
    return { item, option, answeredAt: given.answeredAt };
  });
  for (const a of args.answers) {
    if (!items.some((i) => i.questionId === a.questionId)) throw new CommandError('BAD_QUESTION', 'Jawaban untuk pertanyaan yang tidak diterbitkan.');
  }

  const session: ResponseSession = {
    id: nextId(db, 'RSP'),
    claimId: claim.id,
    assignmentId: assignment.id,
    participantId: assignment.participantId,
    fristaCheckId: face.id,
    channel: 'MOBILE_JKN',
    startedAt: args.startedAt,
    submittedAt: ctx.now,
    status: 'TERKIRIM',
  };
  db.sessions.push(session);
  for (const r of resolved) {
    db.answers.push({
      id: nextId(db, 'ANS', 7),
      sessionId: session.id,
      claimId: claim.id,
      assignmentId: assignment.id,
      questionId: r.item.questionId,
      questionVersion: r.item.questionVersion,
      optionId: r.option?.id ?? null,
      status: r.option ? 'DIJAWAB' : 'DILEWATI',
      answeredAt: r.answeredAt,
    });
  }
  assignment.status = 'DIJAWAB';
  setStatus(db, claim, 'JAWABAN_DITERIMA', ctx, `${resolved.filter((r) => r.option).length} jawaban diterima${denied ? ' (penyangkalan; sisa pertanyaan dilewati)' : ''}.`);
  for (const n of db.notifications.filter((x) => x.assignmentId === assignment.id && !x.readAt)) n.readAt = ctx.now;
  // The receipt is shown on screen right away, so it starts out read.
  const receipt = notify(db, ctx, {
    participantId: assignment.participantId,
    claimId: claim.id,
    assignmentId: assignment.id,
    kind: 'JAWABAN_DITERIMA',
    title: 'Jawaban Anda sudah diterima',
    body: `Nomor tanda terima ${session.id}. Terima kasih. Jawaban ini tidak mengubah hak layanan Anda.`,
  });
  receipt.readAt = ctx.now;
  audit(db, ctx, 'JAWABAN_DIKIRIM', 'ResponseSession', session.id, claim.id, `${resolved.length} butir, ${resolved.filter((r) => !r.option).length} dilewati`);
  return session;
}

// ── System ──────────────────────────────────────────────────────────────────

/** Whether any published round has passed the response window without an answer. */
export function hasExpired(db: Db, now: Iso): boolean {
  return db.assignments.some((a) => a.status === 'AKTIF' && addDaysIso(a.publishedAt, RESPONSE_WINDOW_DAYS) <= now);
}

/** Closes rounds left unanswered past the response window. Idempotent. */
export function closeExpired(db: Db, ctx: Ctx): number {
  let closed = 0;
  for (const a of db.assignments) {
    if (a.status !== 'AKTIF') continue;
    if (addDaysIso(a.publishedAt, RESPONSE_WINDOW_DAYS) > ctx.now) continue;
    const claim = findClaim(db, a.claimId);
    if (!claim || claim.status !== 'MENUNGGU_PESERTA') continue;
    a.status = 'DITUTUP';
    setStatus(db, claim, 'TIDAK_DIJAWAB', ctx, `Tidak ada jawaban dalam ${RESPONSE_WINDOW_DAYS} hari.`);
    audit(db, ctx, 'PUTARAN_DITUTUP', 'Assignment', a.id, claim.id, 'Batas waktu menjawab terlewati');
    closed += 1;
  }
  return closed;
}

export function participantActor(db: Db, participantId: string): ActorRef {
  const p = getParticipant(db, participantId);
  return { role: 'PESERTA', id: p.id, name: p.name };
}
