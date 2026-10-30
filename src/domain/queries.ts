import { evidenceStatus, type EvidenceResult } from './evidence';
import { EMPTY_SCORES } from './verification';
import type {
  AiConfig,
  Answer,
  AnswerEvaluation,
  AnswerOption,
  Assignment,
  Claim,
  Db,
  DictionaryEntry,
  Facility,
  FristaCheck,
  Participant,
  Practitioner,
  Question,
  QuestionVersion,
  ResponseSession,
  Strength,
  VerificationScores,
} from './types';

// Read-side helpers shared by every role and by analytics. All of them derive from the stored
// records; none of them keeps its own copy.

export class NotFoundError extends Error {}

/** Allocates the next stable ID for a prefix, e.g. `KLM-000101`. Mutates `db.counters`. */
export function nextId(db: Db, prefix: string, width = 6): string {
  const n = (db.counters[prefix] ?? 0) + 1;
  db.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(width, '0')}`;
}

interface Index {
  key: string;
  participants: Map<string, Participant>;
  facilities: Map<string, Facility>;
  practitioners: Map<string, Practitioner>;
  claims: Map<string, Claim>;
  entries: Map<string, DictionaryEntry>;
  questions: Map<string, Question>;
  assignmentsByClaim: Map<string, Assignment[]>;
  sessionsByAssignment: Map<string, ResponseSession>;
  answersBySession: Map<string, Answer[]>;
}

const indexes = new WeakMap<Db, Index>();

/**
 * Lookup tables, built once per database object. Commands mutate records in place and only ever append
 * to collections, so the collection sizes tell whether a cached index is still complete.
 */
export function index(db: Db): Index {
  const key = [db.participants, db.facilities, db.practitioners, db.claims, db.dictionary, db.questions, db.assignments, db.sessions, db.answers]
    .map((c) => c.length)
    .join(',');
  let ix = indexes.get(db);
  if (ix && ix.key === key) return ix;
  const group = <T, K>(items: readonly T[], key: (t: T) => K) => {
    const m = new Map<K, T[]>();
    for (const item of items) {
      const k = key(item);
      const list = m.get(k);
      if (list) list.push(item);
      else m.set(k, [item]);
    }
    return m;
  };
  ix = {
    key,
    participants: new Map(db.participants.map((p) => [p.id, p])),
    facilities: new Map(db.facilities.map((f) => [f.id, f])),
    practitioners: new Map(db.practitioners.map((p) => [p.id, p])),
    claims: new Map(db.claims.map((c) => [c.id, c])),
    entries: new Map(db.dictionary.map((e) => [e.id, e])),
    questions: new Map(db.questions.map((q) => [q.id, q])),
    assignmentsByClaim: group(db.assignments, (a) => a.claimId),
    sessionsByAssignment: new Map(db.sessions.map((s) => [s.assignmentId, s])),
    answersBySession: group(db.answers, (a) => a.sessionId),
  };
  indexes.set(db, ix);
  return ix;
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new NotFoundError(`${what} tidak ditemukan`);
  return value;
}

export const getClaim = (db: Db, id: string) => must(index(db).claims.get(id), `Klaim ${id}`);
export const findClaim = (db: Db, id: string) => index(db).claims.get(id);
export const getParticipant = (db: Db, id: string) => must(index(db).participants.get(id), `Peserta ${id}`);
export const getFacility = (db: Db, id: string) => must(index(db).facilities.get(id), `Faskes ${id}`);
export const getPractitioner = (db: Db, id: string) => must(index(db).practitioners.get(id), `DPJP ${id}`);
export const getEntry = (db: Db, id: string) => must(index(db).entries.get(id), `Entri kamus ${id}`);
export const findEntry = (db: Db, id: string | null) => (id ? index(db).entries.get(id) : undefined);
export const getQuestion = (db: Db, id: string) => must(index(db).questions.get(id), `Pertanyaan ${id}`);

export function getVersion(db: Db, questionId: string, version: number): QuestionVersion {
  const q = getQuestion(db, questionId);
  return must(
    q.versions.find((v) => v.version === version),
    `Pertanyaan ${questionId} v${version}`,
  );
}

export function currentVersion(question: Question): QuestionVersion {
  return question.versions[question.versions.length - 1];
}

/** The active question for a dictionary entry (one per entry in this simulation). */
export function questionForEntry(db: Db, entryId: string): Question | undefined {
  return db.questions.find((q) => q.entryId === entryId && q.status === 'AKTIF');
}

export function assignmentsOf(db: Db, claimId: string): Assignment[] {
  return index(db).assignmentsByClaim.get(claimId) ?? [];
}

/** The published round the participant should see or has answered (the latest that is not superseded). */
export function currentAssignment(db: Db, claimId: string): Assignment | undefined {
  return assignmentsOf(db, claimId)
    .filter((a) => a.status !== 'DIGANTIKAN')
    .sort((a, b) => b.round - a.round)[0];
}

export function sessionFor(db: Db, assignmentId: string): ResponseSession | undefined {
  return index(db).sessionsByAssignment.get(assignmentId);
}

export function answersOf(db: Db, sessionId: string): Answer[] {
  return index(db).answersBySession.get(sessionId) ?? [];
}

export function fristaChecksFor(db: Db, assignmentId: string): FristaCheck[] {
  return db.fristaChecks.filter((f) => f.assignmentId === assignmentId).sort((a, b) => a.at.localeCompare(b.at));
}

/** Failed face checks so far for an assignment (a service outage does not count). */
export function failedFaceChecks(db: Db, assignmentId: string): number {
  const checks = fristaChecksFor(db, assignmentId);
  return checks.length ? checks[checks.length - 1].failedAttempts : 0;
}

export function passedFaceCheck(db: Db, assignmentId: string): FristaCheck | undefined {
  return fristaChecksFor(db, assignmentId).find((f) => f.result === 'COCOK');
}

/** The configuration with this version: the current one or one from the history. */
export function configAt(db: Db, version: number): AiConfig {
  return version === db.aiConfig.version ? db.aiConfig : (db.aiConfigHistory.find((c) => c.version === version) ?? db.aiConfig);
}

/** Most questions a session on this round can ask. */
export function questionLimit(db: Db, assignment: Assignment, session?: ResponseSession): number {
  return Math.min(assignment.items.length, configAt(db, session?.aiConfigVersion ?? db.aiConfig.version).maxQuestions);
}

/** Fills `{faskes}` and `{periode}` for the participant. */
export function renderText(text: string, slots: { faskes: string; periode: string }): string {
  return text.replaceAll('{faskes}', slots.faskes).replaceAll('{periode}', slots.periode);
}

export interface EvidenceRow {
  questionId: string;
  questionVersion: number;
  /** Position in the verifier's round. */
  order: number;
  entry: DictionaryEntry;
  version: QuestionVersion;
  answer: Answer | undefined;
  option: AnswerOption | undefined;
  evaluation: AnswerEvaluation | null;
  strength: Strength | null;
  /** Shown to the participant right now. */
  pending: boolean;
  /** Why the question was not asked, once the session made that final. */
  notAsked: { kind: 'TIDAK_RELEVAN'; reason: string } | { kind: 'SESI_BERHENTI' } | null;
}

export interface ClaimEvidence {
  assignment: Assignment;
  session: ResponseSession | undefined;
  /** Asked questions in the order they were asked, then the current one, then the rest of the round. */
  rows: EvidenceRow[];
  /** Scores and fraud level after the latest answer (all zero, RENDAH, before the first). */
  scores: VerificationScores;
  /** Table 2 for the claim, read through the session's thresholds, once the session has ended with at least one answer. */
  result: EvidenceResult | null;
  denied: boolean;
}

/**
 * The current round read against the claim. Every number comes from the evaluation stored with each
 * answer when it was given; nothing is re-scored here.
 */
export function claimEvidence(db: Db, claim: Claim): ClaimEvidence | null {
  const assignment = currentAssignment(db, claim.id);
  if (!assignment) return null;
  const session = sessionFor(db, assignment.id);
  const answers = session ? [...answersOf(db, session.id)].sort((a, b) => a.iteration - b.iteration) : [];
  const ended = session?.status === 'SELESAI';
  const rows = [...assignment.items]
    .sort((a, b) => a.order - b.order)
    .map((item): EvidenceRow => {
      const question = getQuestion(db, item.questionId);
      const version = getVersion(db, item.questionId, item.questionVersion);
      const answer = answers.find((a) => a.questionId === item.questionId && a.questionVersion === item.questionVersion);
      const option = answer ? version.options.find((o) => o.id === answer.optionId) : undefined;
      const skip = session?.skipped.find((s) => s.questionId === item.questionId);
      const pending = session?.pending?.questionId === item.questionId;
      return {
        questionId: item.questionId,
        questionVersion: item.questionVersion,
        order: item.order,
        entry: getEntry(db, question.entryId),
        version,
        answer,
        option,
        evaluation: answer?.evaluation ?? null,
        strength: answer?.evaluation.strength ?? null,
        pending,
        notAsked: answer || pending ? null : skip ? { kind: 'TIDAK_RELEVAN', reason: skip.reason } : ended ? { kind: 'SESI_BERHENTI' } : null,
      };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.answer && b.answer ? a.answer.iteration - b.answer.iteration : a.order - b.order));
  const denied = answers.some((a) => a.evaluation.denial);
  const scores = answers.at(-1)?.scoresAfter ?? EMPTY_SCORES;
  const result = ended && answers.length ? evidenceStatus({ level: scores.level, supported: scores.support > 0 }) : null;
  return { assignment, session, rows, scores, result, denied };
}

function rank(row: EvidenceRow): number {
  return row.answer ? 0 : row.pending ? 1 : 2;
}
