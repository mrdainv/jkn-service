import { draftSync, nextSync, rankSync, SIMULATED_MODEL } from '../../ai/simulatedAi';
import { findProcedure } from '../../ai/reference';
import {
  answerQuestion,
  closeExpired,
  declineQuestions,
  decideClaim,
  discardDraft,
  participantActor,
  publishQuestions,
  draftRequestFor,
  recordDraft,
  recordFrista,
  submitClaim,
  SYSTEM_ACTOR,
  type AiPort,
  type ClaimInput,
} from '../../application/commands';
import { claimedNights } from '../../domain/evidence';
import { claimEvidence, currentAssignment, getClaim, getEntry, getQuestion, getVersion } from '../../domain/queries';
import type { ActorRef, AnswerOption, CareClass, Db, DecisionOutcome, Gender, Participant, ResponseSession, SelectionItem } from '../../domain/types';
import { SCHEMA_VERSION } from '../../domain/types';
import { parseCsv } from '../../lib/csv';
import { hashString, intBetween, pick, prng } from '../../lib/random';
import claimsCsv from '../../../datasets/1_dataset_klaim_bpjs_sample_training.csv?raw';
import { FACILITIES, INA_CBG, INITIAL_AI_CONFIG, initialDictionary, PANEL_FRAUD_SCORE, practitionerFor, PRACTITIONERS, SEED_EPOCH, VERIFIER } from './reference';

// Builds the simulation database deterministically. Historical claims come from the claims dataset
// (June 2026); their verification is simulated by replaying the real commands in time order. Ground
// truth from the dataset only steers the simulated participants and is never stored.

export const DATASET_ID = 'sim-2026-10-30-v2';
const MODEL = { id: SIMULATED_MODEL.id, version: SIMULATED_MODEL.version, kind: SIMULATED_MODEL.kind };
/** The simulated AI, called synchronously: the seed replays commands without the async actions layer. */
const AI: AiPort = { rank: rankSync, next: nextSync };

type Truth = 'SESUAI' | 'BERTENTANGAN' | 'PENYANGKALAN_TOTAL';

/** WIB wall-clock time to an ISO timestamp. */
export function wib(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 7, minute)).toISOString();
}

function plus(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function dateOf(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

const MALE = ['Agus', 'Bambang', 'Dedi', 'Eko', 'Hendra', 'Joko', 'Rudi', 'Slamet', 'Wahyu', 'Yusuf', 'Ahmad', 'Fajar', 'Irfan', 'Teguh', 'Rizal', 'Hasan'];
const FEMALE = ['Ani', 'Dewi', 'Fitri', 'Indah', 'Lestari', 'Nur', 'Rina', 'Sri', 'Wulan', 'Yuni', 'Ratna', 'Maya', 'Endang', 'Kartini', 'Sulastri', 'Ayu'];
const FAMILY = ['Saputra', 'Wijaya', 'Pratama', 'Hidayat', 'Nugroho', 'Kurniawan', 'Susanti', 'Rahmawati', 'Setiawan', 'Siregar', 'Lubis', 'Nasution', 'Harahap', 'Tanjung', 'Purba', 'Gunawan', 'Halim', 'Permana'];
const REGIONS = ['Kota Contoh', 'Kabupaten Contoh', 'Kota Sejahtera'];

function emptyDb(): Db {
  const { entries, questions } = initialDictionary();
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: DATASET_ID,
    synthetic: true,
    createdAt: SEED_EPOCH,
    counters: { KMS: entries.filter((e) => e.scope === 'PROSEDUR').length, QST: questions.length - 2 },
    participants: [],
    facilities: FACILITIES.map(({ datasetName: _unused, ...f }) => f),
    practitioners: PRACTITIONERS,
    claims: [],
    statusHistory: [],
    dictionary: entries,
    questions,
    mappings: [],
    suggestions: [],
    selections: [],
    drafts: [],
    assignments: [],
    notifications: [],
    fristaChecks: [],
    sessions: [],
    answers: [],
    aiConfig: INITIAL_AI_CONFIG,
    aiConfigHistory: [],
    audit: [],
  };
}

function birthDateFor(rand: () => number, age: number, onDate: string): string {
  const [y, m] = onDate.split('-').map(Number);
  const month = m > 1 ? intBetween(rand, 1, m - 1) : 1;
  return `${y - age}-${String(month).padStart(2, '0')}-${String(intBetween(rand, 1, 28)).padStart(2, '0')}`;
}

function careClassOf(label: string): CareClass {
  return label.endsWith('1') ? 'KELAS_1' : label.endsWith('2') ? 'KELAS_2' : 'KELAS_3';
}

function providerActor(facilityId: string): ActorRef {
  const f = FACILITIES.find((x) => x.id === facilityId)!;
  return { role: 'FASKES', id: `USR-${facilityId}`, name: `Petugas klaim ${f.name}` };
}

// ── Simulated people ────────────────────────────────────────────────────────

interface Profile {
  truth: Truth;
  age: number;
}

/** A participant's answer to one question, given what really happened. */
function simulatedAnswer(rand: () => number, options: AnswerOption[], kind: 'KEBERADAAN' | 'LAMA_RAWAT' | 'PROSEDUR', p: Profile, nights: number | null, observability: number, stayedAnswer: string | null): string {
  const byId = (id: string) => options.find((o) => o.id === id)?.id;
  const unsureId = options.find((o) => o.unsure)!.id;
  const support = options.filter((o) => o.mapping.kind === 'TETAP' && (o.mapping.strength === 'KUAT' || o.mapping.strength === 'SEBAGIAN'));
  const contra = options.filter((o) => o.mapping.kind === 'TETAP' && o.mapping.strength === 'BERTENTANGAN' && !o.denial);
  const older = p.age >= 65 ? 1 : 0;
  const u = rand();
  if (kind === 'KEBERADAAN') {
    if (p.truth === 'PENYANGKALAN_TOTAL') return u < 0.62 ? byId('PULANG_HARI_ITU')! : u < 0.94 ? byId('TIDAK_PERNAH')! : unsureId;
    return u < 0.95 ? byId('DIRAWAT_MENGINAP')! : u < 0.98 ? unsureId : byId('PULANG_HARI_ITU')!;
  }
  if (kind === 'LAMA_RAWAT') {
    const ranges = options.filter((o) => o.mapping.kind === 'RENTANG_MALAM');
    // Someone who went home the same day has no nights to count; some still pick "1 malam".
    if (stayedAnswer === 'PULANG_HARI_ITU') return u < 0.55 ? unsureId : ranges[0].id;
    if (u < 0.1 + 0.12 * older) return unsureId;
    const inRange = ranges.find((o) => o.mapping.kind === 'RENTANG_MALAM' && nights !== null && nights >= o.mapping.min && (o.mapping.max === null || nights <= o.mapping.max));
    if (inRange && rand() < 0.85) return inRange.id;
    const idx = inRange ? ranges.indexOf(inRange) : 1;
    return ranges[Math.max(0, Math.min(ranges.length - 1, idx + (rand() < 0.5 ? -1 : 1)))].id;
  }
  if (p.truth === 'BERTENTANGAN') {
    return u < 0.72 && contra.length ? pick(rand, contra).id : u < 0.92 ? unsureId : support[0].id;
  }
  const pUnsure = Math.min(0.7, Math.max(0.02, 0.75 - 0.65 * observability + 0.15 * older));
  if (u < pUnsure) return unsureId;
  if (u < pUnsure + 0.03 && contra.length) return contra[0].id;
  return support.length > 1 && rand() < 0.4 ? support[1].id : support[0].id;
}

/**
 * Typical verifier edits: name the hospital in the question, or add a "partly" answer when the
 * question only offers yes, no and "Tidak ingat". Returns null when neither applies.
 */
function simulatedEdit(base: { text: string; options: AnswerOption[] }): { text: string; options: AnswerOption[] } | null {
  if (base.text.startsWith('Selama dirawat, ')) return { text: base.text.replace('Selama dirawat, ', 'Saat dirawat di {faskes}, '), options: base.options };
  const hasPartial = base.options.some((o) => o.mapping.kind === 'TETAP' && o.mapping.strength === 'SEBAGIAN');
  if (hasPartial || base.options.some((o) => o.mapping.kind === 'RENTANG_MALAM')) return null;
  const partial: AnswerOption = { id: 'SEBAGIAN', label: 'Pernah, tetapi tidak persis seperti itu', mapping: { kind: 'TETAP', strength: 'SEBAGIAN' }, fraudScore: PANEL_FRAUD_SCORE.SEBAGIAN };
  const unsureAt = base.options.findIndex((o) => o.unsure);
  return { text: base.text, options: [...base.options.slice(0, unsureAt), partial, ...base.options.slice(unsureAt)] };
}

/** The simulated verifier's choices on the suggested questions. */
function verifierSelection(db: Db, claimId: string, rand: () => number): SelectionItem[] {
  const selection = db.selections.find((s) => s.claimId === claimId)!;
  const items = selection.items.map((item) => {
    const suggestion = db.suggestions.find((s) => s.id === item.suggestionId);
    const mapping = db.mappings.find((m) => m.id === suggestion?.mappingId);
    const u = rand();
    if (item.included) {
      if (u < 0.8) return { ...item };
      if (u < 0.92) {
        const episode = getEntry(db, getQuestion(db, item.questionId).entryId).scope === 'EPISODE';
        return { ...item, edit: episode ? null : simulatedEdit(getVersion(db, item.questionId, item.version)) };
      }
      return { ...item, included: false };
    }
    const include = mapping?.status === 'DI_BAWAH_AMBANG' ? u < 0.03 : u < 0.25;
    return { ...item, included: include };
  });
  const max = db.aiConfig.maxQuestions;
  let count = items.filter((i) => i.included).length;
  for (let i = items.length - 1; i >= 0 && count > max; i -= 1) {
    if (items[i].included) {
      items[i] = { ...items[i], included: false };
      count -= 1;
    }
  }
  if (count === 0 && items.length) items[0] = { ...items[0], included: true };
  return items;
}

function decisionFor(db: Db, claimId: string, rand: () => number): { outcome: DecisionOutcome; reason: string } {
  const claim = getClaim(db, claimId);
  const ev = claimEvidence(db, claim);
  const u = rand();
  if (!ev?.result) {
    return { outcome: 'TIDAK_DAPAT_DISIMPULKAN', reason: 'Tidak ada jawaban peserta yang dapat dibandingkan dengan isi klaim.' };
  }
  if (ev.result.status === 'PERLU_DIPERIKSA') {
    return u < 0.86
      ? { outcome: 'PERLU_TINDAK_LANJUT', reason: 'Jawaban peserta bertentangan dengan isi klaim; minta resume medis untuk diperiksa.' }
      : { outcome: 'TIDAK_DAPAT_DISIMPULKAN', reason: 'Jawaban bertentangan tetapi peserta mungkin salah ingat; belum dapat disimpulkan.' };
  }
  if (ev.result.status === 'KONSISTEN') {
    return u < 0.95
      ? { outcome: 'SESUAI', reason: 'Jawaban peserta sejalan dengan isi klaim pada semua butir yang ditanyakan.' }
      : { outcome: 'TIDAK_DAPAT_DISIMPULKAN', reason: 'Butir penting belum tertanya; bukti belum memadai.' };
  }
  return u < 0.7
    ? { outcome: 'TIDAK_DAPAT_DISIMPULKAN', reason: 'Sebagian besar jawaban "Tidak ingat"; bukti tidak cukup.' }
    : { outcome: 'SESUAI', reason: 'Tidak ada jawaban yang bertentangan; dokumen klaim lengkap.' };
}

// ── Event queue: replay everything in time order ────────────────────────────

interface Event {
  at: string;
  seq: number;
  run: () => void;
}

class Timeline {
  private events: Event[] = [];
  private seq = 0;
  at(at: string, run: () => void) {
    this.events.push({ at, seq: this.seq++, run });
  }
  drain() {
    while (this.events.length) {
      let min = 0;
      for (let i = 1; i < this.events.length; i += 1) {
        const a = this.events[i];
        const b = this.events[min];
        if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) min = i;
      }
      const [next] = this.events.splice(min, 1);
      next.run();
    }
  }
}

interface Script {
  input: ClaimInput;
  submitAt: string;
  profile: Profile;
  rand: () => number;
}

/** One claim's full lifecycle, scheduled step by step. */
function schedule(db: Db, t: Timeline, s: Script) {
  const { rand, profile } = s;
  t.at(s.submitAt, () => {
    const claim = submitClaim(db, s.input, { now: s.submitAt, actor: providerActor(s.input.facilityId) }, AI, MODEL);
    const publishAt = plus(s.submitAt, intBetween(rand, 6 * 60, 40 * 60));
    t.at(publishAt, () => {
      const items = verifierSelection(db, claim.id, rand);
      const assignment = publishQuestions(db, claim.id, items, { now: publishAt, actor: VERIFIER });
      const actor = participantActor(db, claim.participantId);
      const u = rand();
      const noResponse = 0.08 + (profile.age >= 65 ? 0.07 : 0);
      if (u < 0.04) {
        const at = plus(publishAt, intBetween(rand, 600, 4000));
        t.at(at, () => declineQuestions(db, assignment.id, { now: at, actor }));
        scheduleDecision(db, t, claim.id, at, rand, 0.7);
        return;
      }
      if (u < 0.04 + noResponse) {
        const at = plus(publishAt, (28 * 24 + 2) * 60);
        t.at(at, () => closeExpired(db, { now: at, actor: SYSTEM_ACTOR }));
        scheduleDecision(db, t, claim.id, at, rand, 0.6);
        return;
      }
      let at = plus(publishAt, intBetween(rand, 240, 5 * 24 * 60));
      const f = rand();
      const face = (result: Parameters<typeof recordFrista>[2], when: string) => t.at(when, () => recordFrista(db, assignment.id, result, { now: when, actor }, AI, MODEL));
      if (f < 0.03) {
        face('TANPA_KAMERA', at);
        scheduleDecision(db, t, claim.id, at, rand, 0.6);
        return;
      }
      if (f < 0.07) {
        face('LAYANAN_TIDAK_TERSEDIA', at);
        at = plus(at, intBetween(rand, 60, 600));
      }
      if (f >= 0.07 && f < 0.15) {
        face('TIDAK_COCOK', at);
        at = plus(at, 3);
        if (rand() < 0.3) {
          face('TIDAK_COCOK', at);
          scheduleDecision(db, t, claim.id, at, rand, 0.6);
          return;
        }
      }
      face('COCOK', at);
      const startedAt = plus(at, 1);
      t.at(startedAt, () => {
        // One question at a time: each answer is evaluated and the AI picks the next until a stop rule holds.
        const nights = claimedNights(getClaim(db, claim.id));
        let stayed: string | null = null;
        const ended = answerLoop(db, sessionOf(db, assignment.id), startedAt, actor, (questionId, version) => {
          const v = getVersion(db, questionId, version);
          const entry = getEntry(db, getQuestion(db, questionId).entryId);
          const kind = entry.topic ?? 'PROSEDUR';
          const optionId = simulatedAnswer(rand, v.options, kind, profile, nights, entry.observability ?? 0.55, stayed);
          if (kind === 'KEBERADAAN') stayed = optionId;
          return { optionId, minutes: 0.5 + rand() };
        });
        scheduleDecision(db, t, claim.id, ended, rand, 0.96);
      });
    });
  });
}

function sessionOf(db: Db, assignmentId: string): ResponseSession {
  const session = db.sessions.find((s) => s.assignmentId === assignmentId);
  if (!session) throw new Error(`seed: no session for ${assignmentId}`);
  return session;
}

/** Answers the session's current question until it ends; returns the time of the last answer. */
function answerLoop(db: Db, session: ResponseSession, from: string, actor: ActorRef, choose: (questionId: string, version: number) => { optionId: string; minutes: number }): string {
  let at = from;
  for (let guard = 0; session.status === 'BERLANGSUNG' && session.pending && guard < 20; guard += 1) {
    const { questionId, questionVersion } = session.pending;
    const { optionId, minutes } = choose(questionId, questionVersion);
    at = plus(at, minutes);
    answerQuestion(db, { sessionId: session.id, questionId, questionVersion, optionId }, { now: at, actor }, AI, MODEL);
  }
  if (session.status !== 'SELESAI') throw new Error(`seed: session ${session.id} did not end`);
  return at;
}

function scheduleDecision(db: Db, t: Timeline, claimId: string, after: string, rand: () => number, probability: number) {
  if (rand() >= probability) return;
  const at = plus(after, intBetween(rand, 18 * 60, 4 * 24 * 60));
  t.at(at, () => {
    const d = decisionFor(db, claimId, rand);
    decideClaim(db, claimId, d.outcome, d.reason, { now: at, actor: VERIFIER });
  });
}

// ── Assembly ────────────────────────────────────────────────────────────────

function addParticipant(db: Db, p: Omit<Participant, 'id'>): Participant {
  const participant = { ...p, id: `PST-${String(db.participants.length + 1).padStart(4, '0')}` };
  db.participants.push(participant);
  return participant;
}

function nameFor(rand: () => number, gender: Gender): string {
  return `${pick(rand, gender === 'L' ? MALE : FEMALE)} ${pick(rand, FAMILY)}`;
}

function quantityFrom(name: string): number {
  const m = name.match(/(\d+)\s*(sesi|kantong|kali)/i);
  return m ? Number(m[1]) : 1;
}

export function buildSeed(): Db {
  const db = emptyDb();
  const t = new Timeline();
  const rows = parseCsv(claimsCsv).sort((a, b) => a.tgl_masuk.localeCompare(b.tgl_masuk) || a.no_sep.localeCompare(b.no_sep));

  for (const row of rows) {
    const rand = prng(hashString(row.no_sep));
    const facility = FACILITIES.find((f) => f.datasetName === row.nama_rumah_sakit)!;
    const gender = row.jenis_kelamin === 'L' ? 'L' : 'P';
    const age = Number(row.usia);
    const participant = addParticipant(db, {
      cardNumber: `0${row.nomor_kartu_pseudonym}`,
      name: nameFor(rand, gender),
      gender,
      birthDate: birthDateFor(rand, age, row.tgl_masuk),
      careClass: careClassOf(row.kelas_rawat),
      segment: pick(rand, ['PBI', 'PPU', 'PBPU'] as const),
      region: pick(rand, REGIONS),
      mobileJknActive: true,
      status: 'AKTIF',
    });
    const procedureName = findProcedure(row.kode_prosedur_icd9)?.name ?? row.nama_prosedur;
    const input: ClaimInput = {
      participantId: participant.id,
      facilityId: facility.id,
      practitionerId: practitionerFor(facility.id, row.kode_diagnosa_icd10).id,
      sepNumber: row.no_sep,
      careType: 'RAWAT_INAP',
      careClass: participant.careClass,
      admissionDate: row.tgl_masuk,
      dischargeDate: row.tgl_pulang,
      diagnosis: { code: row.kode_diagnosa_icd10, name: row.nama_diagnosa },
      secondaryDiagnoses: [],
      procedures: [{ code: row.kode_prosedur_icd9, name: row.kode_prosedur_icd9 === '99.18' ? row.nama_prosedur : procedureName, quantity: quantityFrom(row.nama_prosedur) }],
      inaCbg: { code: INA_CBG[row.kode_diagnosa_icd10] ?? 'Z-4-10-I', tariff: Number(row.tarif_inacbg) },
      hospitalCharge: Number(row.biaya_tagihan_rs),
    };
    const submitAt = wib(dateOf(plus(wib(row.tgl_pulang, 12), intBetween(rand, 1, 3) * 24 * 60)), intBetween(rand, 8, 15), intBetween(rand, 0, 59));
    schedule(db, t, { input, submitAt, profile: { truth: row.ground_truth_verifikasi as Truth, age }, rand });
  }

  // A verifier once asked the AI about infusion lines and discarded the draft: still a known gap.
  const infusionDraftAt = wib('2026-06-22', 10, 5);
  t.at(infusionDraftAt, () => {
    const claim = db.claims.find((c) => c.procedures.some((p) => p.code === '99.18'))!;
    const target = { code: '99.18', name: 'Infus cairan elektrolit', category: 'Tindakan' };
    const response = draftSync(draftRequestFor(db, claim.id, target, 0));
    const draft = recordDraft(db, { claimId: claim.id, target, response, variant: 0, previousDraftId: null, model: MODEL }, { now: infusionDraftAt, actor: VERIFIER });
    const discardAt = plus(infusionDraftAt, 14);
    t.at(discardAt, () =>
      discardDraft(db, draft.id, 'Hampir semua pasien rawat inap diinfus, jadi pertanyaan ini tidak membedakan. Ditunda sampai panel menilai.', { now: discardAt, actor: VERIFIER }),
    );
  });

  t.drain();
  addDemoCases(db);
  return db;
}

/** Recent cases for the live demonstration, each at a different step of the workflow. */
function addDemoCases(db: Db) {
  const people: Omit<Participant, 'id'>[] = [
    { cardNumber: '0001234500011', name: 'Rahmat Hidayat', gender: 'L', birthDate: '1979-03-14', careClass: 'KELAS_2', segment: 'PPU', region: 'Kota Sejahtera', mobileJknActive: true, status: 'AKTIF' },
    { cardNumber: '0001234500028', name: 'Siti Aminah', gender: 'P', birthDate: '1990-07-02', careClass: 'KELAS_3', segment: 'PBI', region: 'Kota Contoh', mobileJknActive: true, status: 'AKTIF' },
    { cardNumber: '0001234500035', name: 'Budi Santoso', gender: 'L', birthDate: '1958-11-21', careClass: 'KELAS_1', segment: 'PBPU', region: 'Kota Contoh', mobileJknActive: true, status: 'AKTIF' },
    { cardNumber: '0001234500042', name: 'Dewi Lestari', gender: 'P', birthDate: '1985-01-30', careClass: 'KELAS_2', segment: 'PPU', region: 'Kabupaten Contoh', mobileJknActive: true, status: 'AKTIF' },
    { cardNumber: '0001234500059', name: 'Yohanes Situmorang', gender: 'L', birthDate: '1972-09-09', careClass: 'KELAS_2', segment: 'PPU', region: 'Kota Contoh', mobileJknActive: true, status: 'AKTIF' },
  ];
  const [rahmat, siti, budi, dewi] = people.map((p) => addParticipant(db, p));
  const proc = (code: string, quantity = 1) => ({ code, name: findProcedure(code)!.name, quantity });
  const claimFor = (participant: Participant, facilityId: string, sep: string, adm: string, dis: string, dx: { code: string; name: string }, procedures: ClaimInput['procedures'], tariff: number, charge: number): ClaimInput => ({
    participantId: participant.id,
    facilityId,
    practitionerId: practitionerFor(facilityId, dx.code).id,
    sepNumber: sep,
    careType: 'RAWAT_INAP',
    careClass: participant.careClass,
    admissionDate: adm,
    dischargeDate: dis,
    diagnosis: dx,
    secondaryDiagnoses: [],
    procedures,
    inaCbg: { code: INA_CBG[dx.code] ?? 'Z-4-10-I', tariff },
    hospitalCharge: charge,
  });
  const submit = (input: ClaimInput, at: string) => submitClaim(db, input, { now: at, actor: providerActor(input.facilityId) }, AI, MODEL);
  const accept = (claimId: string) => db.selections.find((s) => s.claimId === claimId)!.items;

  // 1. Waiting for question preparation; every line maps to the dictionary except the blood count.
  submit(claimFor(rahmat, 'FKS-05', '0115R005102601', '2026-10-21', '2026-10-25', { code: 'A91', name: 'Demam berdarah dengue' }, [proc('99.05', 4), proc('88.76'), proc('90.59', 3)], 6_900_000, 7_450_000), wib('2026-10-26', 10, 15));

  // 2. Waiting for preparation with no dictionary entry for its main procedure: the "Tanya AI" case.
  submit(claimFor(siti, 'FKS-01', '0115R001102501', '2026-10-20', '2026-10-23', { code: 'K35.8', name: 'Apendisitis akut' }, [proc('47.09'), proc('03.91'), proc('99.18')], 9_800_000, 11_200_000), wib('2026-10-25', 14, 30));

  // 3. Published and waiting for the participant (unread notification).
  const c3 = submit(claimFor(budi, 'FKS-04', '0115R004102201', '2026-10-15', '2026-10-20', { code: 'J18.9', name: 'Pneumonia, tidak spesifik' }, [proc('87.44'), proc('93.96', 5)], 8_200_000, 8_900_000), wib('2026-10-22', 9, 0));
  publishQuestions(db, c3.id, accept(c3.id), { now: wib('2026-10-23', 10, 20), actor: VERIFIER });

  // 4. Answered, with one contradiction: waiting for the verifier's decision.
  const c4 = submit(claimFor(dewi, 'FKS-03', '0115R003101901', '2026-10-12', '2026-10-17', { code: 'M54.5', name: 'Nyeri punggung bawah' }, [proc('93.39', 10), proc('87.44')], 7_400_000, 8_100_000), wib('2026-10-19', 8, 40));
  const a4 = publishQuestions(db, c4.id, accept(c4.id), { now: wib('2026-10-20', 9, 10), actor: VERIFIER });
  const dewiActor = participantActor(db, dewi.id);
  recordFrista(db, a4.id, 'COCOK', { now: wib('2026-10-21', 19, 2), actor: dewiActor }, AI, MODEL);
  answerLoop(db, sessionOf(db, a4.id), wib('2026-10-21', 19, 2), dewiActor, (questionId, version) => {
    const v = getVersion(db, questionId, version);
    const entry = getEntry(db, getQuestion(db, questionId).entryId);
    const optionId =
      entry.topic === 'KEBERADAAN' ? 'DIRAWAT_MENGINAP'
      : entry.topic === 'LAMA_RAWAT' ? 'N4_7'
      : entry.code === '93.39' ? v.options.find((o) => o.id.startsWith('BANTAH'))!.id
      : v.options.find((o) => o.id.startsWith('DUKUNG'))!.id;
    return { optionId, minutes: 1 };
  });
  if (currentAssignment(db, c4.id)?.status !== 'DIJAWAB') throw new Error('seed: demo case 4 is not answered');
}
