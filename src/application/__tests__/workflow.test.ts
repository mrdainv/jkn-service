import { beforeEach, describe, expect, it } from 'vitest';
import { computeAnalytics } from '../../analytics/metrics';
import type { NextQuestionRequest, QuestionAi, RankRequest } from '../../ai/service';
import { simulatedAi } from '../../ai/simulatedAi';
import { buildSeed } from '../../data/seed/buildSeed';
import { DbStore, MemoryBackend } from '../../data/store';
import { checkIntegrity } from '../../domain/integrity';
import { answersOf, claimEvidence, currentAssignment, getEntry, getQuestion, getVersion, sessionFor } from '../../domain/queries';
import type { ActorRef, AnswerOption, Db, ResponseSession } from '../../domain/types';
import { createActions, type Actions } from '../actions';
import { CommandError, participantActor, type ClaimInput } from '../commands';

// The whole lifecycle across the three roles, on one store: what the facility submits is what the
// verifier prepares, what the AI asks one question at a time, what the participant answers, and what the
// verifier decides and analytics count.

const FACILITY: ActorRef = { role: 'FASKES', id: 'USR-FKS-01', name: 'Petugas klaim (uji)' };
const VERIFIER: ActorRef = { role: 'VERIFIKATOR', id: 'VRF-01', name: 'Verifikator (uji)' };

let store: DbStore;
let actions: Actions;
let clock = Date.parse('2026-10-27T03:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
const db = (): Db => store.getSnapshot()!.db;

/** The simulated AI with every request recorded, so tests can check what reached the AI and when. */
function spyAi(overrides: Partial<Pick<QuestionAi, 'next'>> = {}) {
  const ranks: RankRequest[] = [];
  const nexts: NextQuestionRequest[] = [];
  const ai: QuestionAi = {
    info: simulatedAi.info,
    draft: simulatedAi.draft,
    rank: (r) => (ranks.push(r), simulatedAi.rank(r)),
    next: (r) => (nexts.push(r), (overrides.next ?? simulatedAi.next)(r)),
  };
  return { ai, ranks, nexts };
}

async function freshStore(backend = new MemoryBackend()) {
  const s = new DbStore(backend, buildSeed);
  await s.init();
  return s;
}

function claimInput(overrides: Partial<ClaimInput> = {}): ClaimInput {
  const yohanes = db().participants.find((p) => p.name === 'Yohanes Situmorang')!;
  return {
    participantId: yohanes.id,
    facilityId: 'FKS-01',
    practitionerId: db().practitioners.find((p) => p.facilityId === 'FKS-01' && p.specialty === 'Paru')!.id,
    sepNumber: '0115R0012610270001',
    careType: 'RAWAT_INAP',
    careClass: 'KELAS_2',
    admissionDate: '2026-10-22',
    dischargeDate: '2026-10-25',
    diagnosis: { code: 'J18.9', name: 'Pneumonia, tidak spesifik' },
    secondaryDiagnoses: [],
    procedures: [
      { code: '87.44', name: 'Foto rontgen dada', quantity: 1 },
      { code: '89.52', name: 'Elektrokardiogram (EKG)', quantity: 1 },
    ],
    inaCbg: { code: 'J-4-16-I', tariff: 7_650_000 },
    hospitalCharge: 8_100_000,
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof CommandError && e.code === code);
}

const session = (assignmentId: string): ResponseSession => sessionFor(db(), assignmentId)!;

/** A supporting answer for the question, given the claimed nights. */
function supporting(options: readonly AnswerOption[], nights: number): string {
  return options.find((o) => !o.unsure && !o.denial && (o.mapping.kind === 'RENTANG_MALAM' ? o.mapping.min <= nights && (o.mapping.max ?? 99) >= nights : o.mapping.strength === 'KUAT'))!.id;
}

/** Answers the session's current question until it ends, choosing with `pick`. */
async function answerAll(a: Actions, assignmentId: string, me: ActorRef, pick: (options: readonly AnswerOption[], questionId: string) => string) {
  for (let guard = 0; guard < 12; guard += 1) {
    const s = session(assignmentId);
    if (s.status !== 'BERLANGSUNG') return s;
    const p = s.pending!;
    await a.answer({ sessionId: s.id, questionId: p.questionId, questionVersion: p.questionVersion, optionId: pick(getVersion(db(), p.questionId, p.questionVersion).options, p.questionId) }, me);
  }
  throw new Error('session did not end');
}

/** A claim of the given participant, published as prepared; returns the claim and its round. */
async function publishedClaim(a: Actions, overrides: Partial<ClaimInput> = {}) {
  const claim = await a.submitClaim(claimInput(overrides), FACILITY);
  const round = await a.publish(claim.id, db().selections.find((s) => s.claimId === claim.id)!.items, VERIFIER);
  return { claim, round, me: participantActor(db(), claim.participantId) };
}

beforeEach(async () => {
  clock = Date.parse('2026-10-27T03:00:00Z');
  store = await freshStore();
  actions = createActions(store, simulatedAi, tick);
});

describe('facility → verifier → AI session → participant → decision → analytics', () => {
  it('runs the whole lifecycle on shared records', async () => {
    const spy = spyAi();
    actions = createActions(store, spy.ai, tick);

    // 1–2. Submission is validated, persisted and linked to the right participant.
    await expectCode(actions.submitClaim(claimInput({ dischargeDate: '2026-10-21' }), FACILITY), 'INVALID_CLAIM');
    const claim = await actions.submitClaim(claimInput(), FACILITY);
    const stored = db().claims.find((c) => c.id === claim.id)!;
    expect(stored).toEqual(claim);
    expect(stored).toMatchObject({ status: 'DIAJUKAN', facilityId: 'FKS-01', sepNumber: '0115R0012610270001' });
    expect(db().participants.find((p) => p.id === stored.participantId)?.name).toBe('Yohanes Situmorang');

    // 4. The AI was given the claim context of this claim, without the participant's identity.
    const request = spy.ranks.at(-1)!;
    expect(request.claim).toEqual({
      claimKey: claim.id,
      careType: 'RAWAT_INAP',
      claimedNights: 3,
      diagnosis: claim.diagnosis,
      procedures: claim.procedures.map((p) => ({ lineId: p.lineId, code: p.code, name: p.name, quantity: p.quantity })),
    });
    const participant = db().participants.find((p) => p.id === claim.participantId)!;
    expect(JSON.stringify(request)).not.toContain(participant.name);
    expect(JSON.stringify(request)).not.toContain(participant.cardNumber);

    // Mapped automatically: two episode questions, rontgen exact, EKG unmatched.
    const maps = db().mappings.filter((m) => m.claimId === claim.id);
    expect(maps.map((m) => m.status)).toEqual(['TERPETAKAN', 'TERPETAKAN', 'TERPETAKAN', 'TIDAK_TERPETAKAN']);
    expect(db().selections.find((s) => s.claimId === claim.id)!.items.filter((i) => i.included)).toHaveLength(3);
    expect(db().suggestions.filter((s) => s.claimId === claim.id).every((s) => s.aiConfidence > 0 && s.aiConfidence < 1 && s.source === 'PEMETAAN_KAMUS')).toBe(true);

    // Ask AI for the gap, regenerate once, approve: the dictionary grows and the claim gets the question.
    const first = await actions.askAi(claim.id, { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' }, VERIFIER);
    expect(first.context.claimAttributes).toContain('jenis rawat');
    const second = await actions.regenerateDraft(first, VERIFIER);
    expect(db().drafts.find((d) => d.id === first.id)?.status).toBe('DIGANTIKAN');
    const { entry, question } = await actions.approveDraft(second.id, VERIFIER);
    expect(entry.source).toBe('DRAF_AI');
    expect(db().mappings.find((m) => m.claimId === claim.id && m.target.kind === 'PROSEDUR' && m.target.code === '89.52')).toMatchObject({ status: 'TERPETAKAN', entryId: entry.id });
    expect(db().suggestions.find((s) => s.claimId === claim.id && s.questionId === question.id)?.source).toBe('DRAF_AI');
    const items = db().selections.find((s) => s.claimId === claim.id)!.items;
    expect(items.find((i) => i.questionId === question.id)).toMatchObject({ included: true, source: 'DRAF_AI' });

    // Edit one question and publish: the edit becomes v(n+1) and the round pins versions.
    const rontgen = items.find((i) => getQuestion(db(), i.questionId).entryId === db().dictionary.find((e) => e.code === '87.44')!.id)!;
    const base = getVersion(db(), rontgen.questionId, rontgen.version);
    const edited = items.map((i) => (i === rontgen ? { ...i, edit: { text: `${base.text.replace(/\?$/, '')} saat itu?`, options: base.options } } : i));
    const assignment = await actions.publish(claim.id, edited, VERIFIER);
    const newVersion = getQuestion(db(), rontgen.questionId).versions.at(-1)!;
    expect(newVersion).toMatchObject({ origin: 'SUNTINGAN_VERIFIKATOR', basedOnVersion: base.version });
    expect(assignment.items.find((i) => i.questionId === rontgen.questionId)?.questionVersion).toBe(newVersion.version);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('MENUNGGU_PESERTA');
    expect(db().suggestions.filter((s) => s.claimId === claim.id).map((s) => s.verifierAction)).toContain('DISUNTING');

    // The participant is notified, and only that participant.
    const notes = db().notifications.filter((n) => n.assignmentId === assignment.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ participantId: claim.participantId, kind: 'PERTANYAAN_BARU', readAt: null });

    // FRISTA: a mismatch counts; a match opens the session with exactly one question.
    const me = participantActor(db(), claim.participantId);
    const stranger = participantActor(db(), db().participants[0].id);
    await actions.recordFrista(assignment.id, 'TIDAK_COCOK', me);
    expect(sessionFor(db(), assignment.id)).toBeUndefined();
    await actions.recordFrista(assignment.id, 'COCOK', me);
    const s = session(assignment.id);
    expect(s).toMatchObject({ status: 'BERLANGSUNG', claimId: claim.id, participantId: claim.participantId });
    expect(s.pending).toMatchObject({ questionId: 'QST-EP01', iteration: 1 });
    await expectCode(actions.publish(claim.id, edited, VERIFIER), 'LOCKED');

    // Someone else cannot answer; an answer to a question not on screen is rejected.
    const p1 = s.pending!;
    await expectCode(actions.answer({ sessionId: s.id, questionId: p1.questionId, questionVersion: p1.questionVersion, optionId: 'DIRAWAT_MENGINAP' }, stranger), 'NOT_FOUND');
    const other = assignment.items.find((i) => i.questionId !== p1.questionId)!;
    await expectCode(actions.answer({ sessionId: s.id, questionId: other.questionId, questionVersion: other.questionVersion, optionId: 'DUKUNG_1' }, me), 'STALE_QUESTION');

    // 5. One question per step: each answer is evaluated and scored before the AI picks the next one.
    const nextCallsBefore = spy.nexts.length;
    const ended = await answerAll(actions, assignment.id, me, (options) => supporting(options, 3));
    const answers = [...answersOf(db(), ended.id)].sort((a, b) => a.iteration - b.iteration);
    expect(answers.map((a) => a.iteration)).toEqual(answers.map((_, i) => i + 1));
    for (const a of answers) {
      expect(a).toMatchObject({ claimId: claim.id, assignmentId: assignment.id, evaluation: { strength: 'KUAT', definite: true } });
      expect(assignment.items).toContainEqual(expect.objectContaining({ questionId: a.questionId, questionVersion: a.questionVersion }));
      // The AI request that picked this question carried exactly the answers before it.
      const req = spy.nexts.find((r) => r.sessionKey === ended.id && r.history.length === a.iteration - 1)!;
      expect(req.history.map((h) => h.questionId)).toEqual(answers.slice(0, a.iteration - 1).map((x) => x.questionId));
      expect(req.claim.claimKey).toBe(claim.id);
    }
    expect(spy.nexts.length - nextCallsBefore).toBeGreaterThanOrEqual(answers.length - 1);
    expect(answers.at(-1)!.scoresAfter).toMatchObject({ indication: 0, answered: answers.length });
    expect(ended).toMatchObject({ status: 'SELESAI', pending: null, stopReason: 'PERTANYAAN_HABIS' });
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('JAWABAN_DITERIMA');
    await expectCode(actions.answer({ sessionId: s.id, questionId: p1.questionId, questionVersion: p1.questionVersion, optionId: 'DIRAWAT_MENGINAP' }, me), 'ALREADY_SUBMITTED');
    expect(claimEvidence(db(), db().claims.find((c) => c.id === claim.id)!)?.result?.status).toBe('KONSISTEN');

    // 9. Analytics are derived from the same records.
    const analytics = computeAnalytics(db());
    expect(analytics.totals.sessions).toBe(db().sessions.length);
    expect(analytics.totals.answers).toBe(db().answers.length);
    expect(analytics.adaptive.sessions).toBe(db().sessions.filter((x) => x.status === 'SELESAI').length);
    expect(analytics.questions.find((q) => q.questionId === question.id)?.answered).toBe(1);

    // 8. The decision is reasoned, closes the claim, and keeps the evaluation it was based on.
    await expectCode(actions.decide(claim.id, 'SESUAI', 'ok', VERIFIER), 'REASON_REQUIRED');
    await actions.decide(claim.id, 'SESUAI', 'Semua jawaban peserta sejalan dengan isi klaim.', VERIFIER);
    const decided = db().claims.find((c) => c.id === claim.id)!;
    expect(decided.status).toBe('SELESAI');
    expect(decided.decision?.basis).toEqual({ sessionId: ended.id, evidenceStatus: 'KONSISTEN', indication: 0, support: answers.at(-1)!.scoresAfter.support, stopReason: 'PERTANYAAN_HABIS', answered: answers.length });
    expect(computeAnalytics(db()).outcomeTable).toContainEqual({ evidence: 'KONSISTEN', decision: 'SESUAI', count: expect.any(Number) });
    expect(checkIntegrity(db())).toEqual([]);
  });

  it('keeps data across a reload of the store', async () => {
    const backend = new MemoryBackend();
    const a = await freshStore(backend);
    const claim = await createActions(a, simulatedAi, tick).submitClaim({ ...claimInput(), participantId: a.getSnapshot()!.db.participants.at(-1)!.id }, FACILITY);
    const b = await freshStore(backend);
    expect(b.getSnapshot()!.db.claims.find((c) => c.id === claim.id)).toEqual(claim);
    expect(b.getSnapshot()!.revision).toBe(a.getSnapshot()!.revision);
  });

  it('validates secondary diagnoses and dates against the participant', async () => {
    await expectCode(actions.submitClaim(claimInput({ secondaryDiagnoses: [{ code: 'XYZ', name: 'Salah' }] }), FACILITY), 'INVALID_CLAIM');
    await expectCode(actions.submitClaim(claimInput({ secondaryDiagnoses: [{ code: 'J18.9', name: 'Sama dengan utama' }] }), FACILITY), 'INVALID_CLAIM');
    const ok = await actions.submitClaim(claimInput({ secondaryDiagnoses: [{ code: 'I10', name: 'Hipertensi esensial' }] }), FACILITY);
    expect(ok.secondaryDiagnoses).toEqual([{ code: 'I10', name: 'Hipertensi esensial' }]);
  });
});

describe('adaptive session rules', () => {
  it('stops at once when the participant denies ever being there (indication 1)', async () => {
    const { claim, round, me } = await publishedClaim(actions);
    await actions.recordFrista(round.id, 'COCOK', me);
    const s = session(round.id);
    await actions.answer({ sessionId: s.id, questionId: 'QST-EP01', questionVersion: 1, optionId: 'TIDAK_PERNAH' }, me);
    const ended = session(round.id);
    expect(ended).toMatchObject({ status: 'SELESAI', stopReason: 'INDIKASI_MAKSIMUM', pending: null });
    const answers = answersOf(db(), ended.id);
    expect(answers).toHaveLength(1);
    expect(answers[0].scoresAfter.indication).toBe(1);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('JAWABAN_DITERIMA');
    expect(claimEvidence(db(), db().claims.find((c) => c.id === claim.id)!)!.result).toMatchObject({ status: 'PERLU_DIPERIKSA', priority: true });
    expect(checkIntegrity(db())).toEqual([]);
  });

  it('does not ask for nights after the participant says they went home the same day', async () => {
    const { round, me } = await publishedClaim(actions);
    await actions.recordFrista(round.id, 'COCOK', me);
    const ended = await answerAll(actions, round.id, me, (options, questionId) => (questionId === 'QST-EP01' ? 'PULANG_HARI_ITU' : supporting(options, 3)));
    expect(ended.skipped.map((x) => x.questionId)).toEqual(['QST-EP02']);
    expect(answersOf(db(), ended.id).map((a) => a.questionId)).not.toContain('QST-EP02');
    const first = answersOf(db(), ended.id).find((a) => a.iteration === 1)!;
    expect(first.evaluation).toMatchObject({ strength: 'BERTENTANGAN', denial: false });
    expect(first.scoresAfter.indication).toBeGreaterThan(0);
    expect(first.scoresAfter.indication).toBeLessThan(1);
    expect(ended.stopReason).toBe('PERTANYAAN_HABIS');
  });

  it('never counts "Tidak ingat" as a rebuttal and stops at the question limit', async () => {
    await actions.updateAiConfig({ maxQuestions: 2 }, VERIFIER);
    const claim = await actions.submitClaim(claimInput(), FACILITY);
    // The verifier approves more than the AI may ask.
    const items = db().selections.find((x) => x.claimId === claim.id)!.items.map((i) => ({ ...i, included: true }));
    const round = await actions.publish(claim.id, items, VERIFIER);
    const me = participantActor(db(), claim.participantId);
    expect(round.items.length).toBeGreaterThan(2);
    await actions.recordFrista(round.id, 'COCOK', me);
    const ended = await answerAll(actions, round.id, me, (options) => options.find((o) => o.unsure)!.id);
    expect(ended.stopReason).toBe('BATAS_PERTANYAAN');
    const answers = answersOf(db(), ended.id);
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.evaluation.indicationWeight === 0 && a.scoresAfter.indication === 0)).toBe(true);
    expect(claimEvidence(db(), db().claims.find((c) => c.id === claim.id)!)!.result?.status).toBe('BUKTI_TIDAK_CUKUP');
  });

  it('saves nothing when the AI fails or answers out of contract, and works on retry', async () => {
    const { round, me } = await publishedClaim(actions);
    const broken = createActions(store, spyAi({ next: async () => Promise.reject(new Error('AI tidak tersedia')) }).ai, tick);
    const revision = store.getSnapshot()!.revision;
    await expect(broken.recordFrista(round.id, 'COCOK', me)).rejects.toThrow('AI tidak tersedia');
    expect(store.getSnapshot()!.revision).toBe(revision);
    expect(sessionFor(db(), round.id)).toBeUndefined();
    expect(db().fristaChecks.filter((f) => f.assignmentId === round.id)).toHaveLength(0);

    const rogue = createActions(store, spyAi({ next: async () => ({ next: { questionId: 'QST-9999', version: 1, predictedDefinite: 0.9, rationale: 'x' }, skipped: [] }) }).ai, tick);
    await expectCode(rogue.recordFrista(round.id, 'COCOK', me), 'AI_INVALID');
    const outOfRange = createActions(store, spyAi({ next: async (r) => ({ next: { questionId: r.pool[0].questionId, version: r.pool[0].version, predictedDefinite: 1.7, rationale: 'x' }, skipped: [] }) }).ai, tick);
    await expectCode(outOfRange.recordFrista(round.id, 'COCOK', me), 'AI_INVALID');
    expect(store.getSnapshot()!.revision).toBe(revision);

    await actions.recordFrista(round.id, 'COCOK', me);
    expect(session(round.id).pending).not.toBeNull();
    // A failure mid-session keeps the answer unsaved and the question on screen.
    const s = session(round.id);
    const p = s.pending!;
    await expect(broken.answer({ sessionId: s.id, questionId: p.questionId, questionVersion: p.questionVersion, optionId: 'DIRAWAT_MENGINAP' }, me)).rejects.toThrow();
    expect(answersOf(db(), s.id)).toHaveLength(0);
    expect(session(round.id).pending).toEqual(p);
    expect(checkIntegrity(db())).toEqual([]);
  });

  it('keeps answers when the participant stops midway or the window closes', async () => {
    const a = await publishedClaim(actions);
    await actions.recordFrista(a.round.id, 'COCOK', a.me);
    const s = session(a.round.id);
    await actions.answer({ sessionId: s.id, questionId: 'QST-EP01', questionVersion: 1, optionId: 'DIRAWAT_MENGINAP' }, a.me);
    await actions.decline(a.round.id, a.me);
    expect(session(a.round.id)).toMatchObject({ status: 'SELESAI', stopReason: 'DIHENTIKAN_PESERTA' });
    expect(db().claims.find((c) => c.id === a.claim.id)?.status).toBe('JAWABAN_DITERIMA');
    expect(answersOf(db(), s.id)).toHaveLength(1);

    const b = await publishedClaim(actions, { participantId: db().participants.at(-2)!.id, sepNumber: '0115R0012610270002' });
    await actions.recordFrista(b.round.id, 'COCOK', b.me);
    const sb = session(b.round.id);
    await actions.answer({ sessionId: sb.id, questionId: 'QST-EP01', questionVersion: 1, optionId: 'DIRAWAT_MENGINAP' }, b.me);
    clock = Date.parse(b.round.publishedAt) + 29 * 86_400_000;
    expect(await actions.closeExpired()).toBeGreaterThanOrEqual(1);
    expect(session(b.round.id)).toMatchObject({ status: 'SELESAI', stopReason: 'BATAS_WAKTU' });
    expect(db().claims.find((c) => c.id === b.claim.id)?.status).toBe('JAWABAN_DITERIMA');
    expect(checkIntegrity(db())).toEqual([]);
  });

  it('runs a session under the configuration it started with', async () => {
    const { round, me } = await publishedClaim(actions);
    await actions.recordFrista(round.id, 'COCOK', me);
    await actions.updateAiConfig({ maxQuestions: 1 }, VERIFIER);
    const ended = await answerAll(actions, round.id, me, (options) => supporting(options, 3));
    expect(answersOf(db(), ended.id).length).toBeGreaterThan(1);
    await expectCode(actions.updateAiConfig({ stopIndicationThreshold: 0.2 }, VERIFIER), 'INVALID_CONFIG');
  });
});

describe('participant rules', () => {
  it('supersedes an unanswered round when the verifier republishes', async () => {
    const claim = db().claims.find((c) => c.status === 'MENUNGGU_PESERTA')!;
    const old = currentAssignment(db(), claim.id)!;
    const items = db().selections.find((s) => s.claimId === claim.id)!.items;
    const next = await actions.publish(claim.id, items.map((i, k) => ({ ...i, included: k < 2 })), VERIFIER);
    expect(db().assignments.find((a) => a.id === old.id)).toMatchObject({ status: 'DIGANTIKAN', supersededBy: next.id });
    expect(db().notifications.find((n) => n.assignmentId === next.id)?.kind).toBe('PERTANYAAN_DIPERBARUI');
    const me = participantActor(db(), claim.participantId);
    await expectCode(actions.recordFrista(old.id, 'COCOK', me), 'SUPERSEDED');
  });

  it('routes to a phone call after two face mismatches and closes expired rounds', async () => {
    const claim = db().claims.find((c) => c.status === 'MENUNGGU_PESERTA')!;
    const a = currentAssignment(db(), claim.id)!;
    const me = participantActor(db(), claim.participantId);
    await actions.recordFrista(a.id, 'LAYANAN_TIDAK_TERSEDIA', me);
    await actions.recordFrista(a.id, 'TIDAK_COCOK', me);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('MENUNGGU_PESERTA');
    await actions.recordFrista(a.id, 'TIDAK_COCOK', me);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('PERLU_KONTAK');

    const other = await actions.submitClaim({ ...claimInput(), participantId: db().participants.at(-1)!.id }, FACILITY);
    const round = await actions.publish(other.id, db().selections.find((s) => s.claimId === other.id)!.items, VERIFIER);
    clock = Date.parse(round.publishedAt) + 29 * 86_400_000;
    expect(await actions.closeExpired()).toBe(1);
    expect(db().claims.find((c) => c.id === other.id)?.status).toBe('TIDAK_DIJAWAB');
    expect(await actions.closeExpired()).toBe(0);
  });
});

describe('seeded records', () => {
  it('ties every seeded answer to its claim, round, question and evaluation', () => {
    for (const s of db().sessions) {
      const answers = answersOf(db(), s.id);
      for (const a of answers) {
        const entry = getEntry(db(), getQuestion(db(), a.questionId).entryId);
        expect(a.claimId).toBe(s.claimId);
        expect(a.evaluation.reliability).toBe(a.evaluation.definite ? (entry.observability ?? 0.55) : 0);
      }
    }
    expect(db().claims.filter((c) => c.decision).every((c) => c.decision!.basis.sessionId === null || db().sessions.some((s) => s.id === c.decision!.basis.sessionId && s.claimId === c.id))).toBe(true);
  });
});

describe('store', () => {
  it('re-applies a change that lost a race with another tab', async () => {
    const backend = new MemoryBackend();
    const tabA = await freshStore(backend);
    const tabB = await freshStore(backend);
    await tabA.transact((d) => d.participants[0].region = 'Tab A');
    await tabB.transact((d) => d.participants[1].region = 'Tab B');
    const saved = (await backend.load())!.db;
    expect(saved.participants[0].region).toBe('Tab A');
    expect(saved.participants[1].region).toBe('Tab B');
  });

  it('never saves a change whose command fails', async () => {
    const revision = store.getSnapshot()!.revision;
    await expectCode(actions.decide(db().claims[0].id, 'SESUAI', '', VERIFIER), db().claims[0].status === 'SELESAI' ? 'DECIDED' : 'REASON_REQUIRED');
    expect(store.getSnapshot()!.revision).toBe(revision);
  });
});
