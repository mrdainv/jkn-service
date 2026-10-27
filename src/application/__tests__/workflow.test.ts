import { beforeEach, describe, expect, it } from 'vitest';
import { computeAnalytics } from '../../analytics/metrics';
import { simulatedAi } from '../../ai/simulatedAi';
import { buildSeed } from '../../data/seed/buildSeed';
import { DbStore, MemoryBackend } from '../../data/store';
import { checkIntegrity } from '../../domain/integrity';
import { claimEvidence, currentAssignment, getQuestion, getVersion } from '../../domain/queries';
import type { ActorRef, Db } from '../../domain/types';
import { createActions, type Actions } from '../actions';
import { CommandError, participantActor, type ClaimInput } from '../commands';

// The whole lifecycle across the three roles, on one store: what the facility submits is what the
// verifier prepares, what the participant answers, and what analytics count.

const FACILITY: ActorRef = { role: 'FASKES', id: 'USR-FKS-01', name: 'Petugas klaim (uji)' };
const VERIFIER: ActorRef = { role: 'VERIFIKATOR', id: 'VRF-01', name: 'Verifikator (uji)' };

let store: DbStore;
let actions: Actions;
let clock = Date.parse('2026-10-27T03:00:00Z');
const tick = () => new Date((clock += 60_000)).toISOString();
const db = (): Db => store.getSnapshot()!.db;

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

beforeEach(async () => {
  clock = Date.parse('2026-10-27T03:00:00Z');
  store = await freshStore();
  actions = createActions(store, simulatedAi, tick);
});

describe('facility → verifier → participant → analytics', () => {
  it('runs the whole lifecycle on shared records', async () => {
    // 1–2. Submission is validated, persisted and linked.
    await expectCode(actions.submitClaim(claimInput({ dischargeDate: '2026-10-21' }), FACILITY), 'INVALID_CLAIM');
    const claim = await actions.submitClaim(claimInput(), FACILITY);
    expect(db().claims.find((c) => c.id === claim.id)).toMatchObject({ status: 'DIAJUKAN', facilityId: 'FKS-01' });
    expect(db().participants.find((p) => p.id === claim.participantId)?.name).toBe('Yohanes Situmorang');

    // 3. Mapped automatically: two episode questions, rontgen exact, EKG unmatched.
    const maps = db().mappings.filter((m) => m.claimId === claim.id);
    expect(maps.map((m) => m.status)).toEqual(['TERPETAKAN', 'TERPETAKAN', 'TERPETAKAN', 'TIDAK_TERPETAKAN']);
    const selection = db().selections.find((s) => s.claimId === claim.id)!;
    expect(selection.items.filter((i) => i.included)).toHaveLength(3);
    expect(db().suggestions.filter((s) => s.claimId === claim.id).every((s) => s.aiConfidence > 0 && s.aiConfidence < 1)).toBe(true);

    // 10. Ask AI for the gap, regenerate once, approve: the dictionary grows and the claim gets the question.
    const first = await actions.askAi(claim.id, { code: '89.52', name: 'Elektrokardiogram (EKG)', category: 'Penunjang' }, VERIFIER);
    const second = await actions.regenerateDraft(first, VERIFIER);
    expect(db().drafts.find((d) => d.id === first.id)?.status).toBe('DIGANTIKAN');
    const { entry, question } = await actions.approveDraft(second.id, VERIFIER);
    expect(entry.source).toBe('DRAF_AI');
    expect(db().mappings.find((m) => m.claimId === claim.id && m.target.kind === 'PROSEDUR' && m.target.code === '89.52')).toMatchObject({ status: 'TERPETAKAN', entryId: entry.id });
    const items = db().selections.find((s) => s.claimId === claim.id)!.items;
    expect(items.find((i) => i.questionId === question.id)).toMatchObject({ included: true, source: 'DRAF_AI' });

    // 4–5. Edit one question, drop nothing, publish: the edit becomes v(n+1) and the round pins versions.
    const rontgen = items.find((i) => getQuestion(db(), i.questionId).entryId === db().dictionary.find((e) => e.code === '87.44')!.id)!;
    const base = getVersion(db(), rontgen.questionId, rontgen.version);
    const edited = items.map((i) => (i === rontgen ? { ...i, edit: { text: `${base.text.replace(/\?$/, '')} saat itu?`, options: base.options } } : i));
    const assignment = await actions.publish(claim.id, edited, VERIFIER);
    const newVersion = getQuestion(db(), rontgen.questionId).versions.at(-1)!;
    expect(newVersion).toMatchObject({ origin: 'SUNTINGAN_VERIFIKATOR', basedOnVersion: base.version });
    expect(assignment.items.find((i) => i.questionId === rontgen.questionId)?.questionVersion).toBe(newVersion.version);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('MENUNGGU_PESERTA');
    const actionsTaken = db().suggestions.filter((s) => s.claimId === claim.id).map((s) => s.verifierAction);
    expect(actionsTaken).toContain('DISUNTING');

    // 6. The participant is notified, and only that participant.
    const notes = db().notifications.filter((n) => n.assignmentId === assignment.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ participantId: claim.participantId, kind: 'PERTANYAAN_BARU', readAt: null });

    // 7. FRISTA is required; a mismatch counts, a match unlocks.
    const me = participantActor(db(), claim.participantId);
    const answers = assignment.items.map((i) => {
      const v = getVersion(db(), i.questionId, i.questionVersion);
      const option = v.options.find((o) => !o.unsure && !o.denial && (o.mapping.kind === 'RENTANG_MALAM' ? o.mapping.min <= 3 && (o.mapping.max ?? 99) >= 3 : o.mapping.strength === 'KUAT'))!;
      return { questionId: i.questionId, questionVersion: i.questionVersion, optionId: option.id, answeredAt: tick() };
    });
    await expectCode(actions.submitResponses({ assignmentId: assignment.id, answers, startedAt: tick() }, me), 'FRISTA_REQUIRED');
    await actions.recordFrista(assignment.id, 'TIDAK_COCOK', me);
    await actions.recordFrista(assignment.id, 'COCOK', me);

    // Someone else cannot answer this participant's questions.
    const stranger = participantActor(db(), db().participants[0].id);
    await expectCode(actions.submitResponses({ assignmentId: assignment.id, answers, startedAt: tick() }, stranger), 'NOT_FOUND');

    // 8. Bulk submission with version references; a second submission is rejected.
    const before = db().answers.length;
    const session = await actions.submitResponses({ assignmentId: assignment.id, answers, startedAt: tick() }, me);
    expect(db().answers.length - before).toBe(assignment.items.length);
    for (const a of db().answers.filter((x) => x.sessionId === session.id)) {
      expect(assignment.items).toContainEqual(expect.objectContaining({ questionId: a.questionId, questionVersion: a.questionVersion }));
      expect(a.claimId).toBe(claim.id);
    }
    await expectCode(actions.submitResponses({ assignmentId: assignment.id, answers, startedAt: tick() }, me), 'ALREADY_SUBMITTED');
    await expectCode(actions.publish(claim.id, edited, VERIFIER), 'LOCKED');
    expect(claimEvidence(db(), db().claims.find((c) => c.id === claim.id)!)?.result?.status).toBe('KONSISTEN');

    // 9. Analytics are derived from the same records.
    const analytics = computeAnalytics(db());
    expect(analytics.totals.sessions).toBe(db().sessions.length);
    expect(analytics.questions.find((q) => q.questionId === question.id)?.answered).toBe(1);

    // Decision closes the claim; everything still references cleanly.
    await expectCode(actions.decide(claim.id, 'SESUAI', 'ok', VERIFIER), 'REASON_REQUIRED');
    await actions.decide(claim.id, 'SESUAI', 'Semua jawaban peserta sejalan dengan isi klaim.', VERIFIER);
    expect(db().claims.find((c) => c.id === claim.id)?.status).toBe('SELESAI');
    expect(checkIntegrity(db())).toEqual([]);
  });

  it('keeps data across a reload of the store (11)', async () => {
    const backend = new MemoryBackend();
    const a = await freshStore(backend);
    const claim = await createActions(a, simulatedAi, tick).submitClaim({ ...claimInput(), participantId: a.getSnapshot()!.db.participants.at(-1)!.id }, FACILITY);
    const b = await freshStore(backend);
    expect(b.getSnapshot()!.db.claims.find((c) => c.id === claim.id)).toBeDefined();
    expect(b.getSnapshot()!.revision).toBe(a.getSnapshot()!.revision);
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

  it('skips the remaining questions after a denial', async () => {
    const claim = db().claims.find((c) => c.status === 'MENUNGGU_PESERTA')!;
    const a = currentAssignment(db(), claim.id)!;
    const me = participantActor(db(), claim.participantId);
    await actions.recordFrista(a.id, 'COCOK', me);
    const first = [...a.items].sort((x, y) => x.order - y.order)[0];
    const session = await actions.submitResponses({ assignmentId: a.id, startedAt: tick(), answers: [{ questionId: first.questionId, questionVersion: first.questionVersion, optionId: 'TIDAK_PERNAH', answeredAt: tick() }] }, me);
    const stored = db().answers.filter((x) => x.sessionId === session.id);
    expect(stored).toHaveLength(a.items.length);
    expect(stored.filter((x) => x.status === 'DILEWATI')).toHaveLength(a.items.length - 1);
    const ev = claimEvidence(db(), db().claims.find((c) => c.id === claim.id)!)!;
    expect(ev.result).toMatchObject({ status: 'PERLU_DIPERIKSA', priority: true });
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
