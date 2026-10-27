import type { QuestionAi, RankRequest, RankedQuestion } from '../ai/service';
import type { DbStore } from '../data/store';
import { getClaim } from '../domain/queries';
import type { ActorRef, AiConfig, AiDraft, Db, DecisionOutcome, DraftProposal, FristaResult, SelectionItem } from '../domain/types';
import * as cmd from './commands';

/**
 * The application's use cases: what each role can do. They ask the AI service (which may be slow or
 * remote) outside the transaction, then apply the matching command inside one store transaction.
 */

export function createActions(store: DbStore, ai: QuestionAi, clock: () => string = () => new Date().toISOString()) {
  const model = { id: ai.info.id, version: ai.info.version };
  const generator = { ...model, kind: ai.info.kind };
  const ctx = (actor: ActorRef): cmd.Ctx => ({ now: clock(), actor });
  const snapshot = (): Db => {
    const s = store.getSnapshot();
    if (!s) throw new Error('Data belum siap.');
    return s.db;
  };

  /**
   * Runs a command that needs AI rankings. A dry run on a copy collects the ranking requests (and
   * surfaces validation errors early), the AI answers them, then the command runs for real.
   */
  async function withRanking<T>(run: (db: Db, rank: cmd.Ranker) => T): Promise<T> {
    const requests: RankRequest[] = [];
    run(structuredClone(snapshot()), (req) => {
      requests.push(req);
      return req.candidates.map((c) => ({ questionId: c.questionId, version: c.version, confidence: 0.5 }));
    });
    const answers = await Promise.all(requests.map((r) => ai.rank(r)));
    const lookup: cmd.Ranker = (req) => {
      const i = requests.findIndex((r) => r.claimKey === req.claimKey && r.candidates.length === req.candidates.length);
      const ranked: RankedQuestion[] | undefined = i >= 0 ? answers[i] : undefined;
      if (!ranked || req.candidates.some((c) => !ranked.some((r) => r.questionId === c.questionId))) {
        throw new cmd.CommandError('AI_STALE', 'Data berubah saat AI bekerja. Ulangi tindakan.');
      }
      return ranked;
    };
    return store.transact((db) => run(db, lookup));
  }

  async function draftFor(claimId: string | null, target: AiDraft['target'], variant: number, previousDraftId: string | null, actor: ActorRef) {
    const db = snapshot();
    const claim = claimId ? getClaim(db, claimId) : null;
    const response = await ai.draft({
      target,
      claimContext: { careType: claim?.careType ?? 'RAWAT_INAP', diagnosisName: claim?.diagnosis.name ?? null },
      dictionary: db.dictionary,
      variant,
    });
    return store.transact((d) => cmd.recordDraft(d, { claimId, target, response, variant, previousDraftId, model: generator }, ctx(actor)));
  }

  return {
    // Facility
    submitClaim: (input: cmd.ClaimInput, actor: ActorRef) => withRanking((db, rank) => cmd.submitClaim(db, input, ctx(actor), rank, model)),

    // Verifier
    saveSelection: (claimId: string, items: SelectionItem[], actor: ActorRef) => store.transact((db) => cmd.saveSelection(db, claimId, items, ctx(actor))),
    publish: (claimId: string, items: SelectionItem[], actor: ActorRef) => store.transact((db) => cmd.publishQuestions(db, claimId, items, ctx(actor))),
    askAi: (claimId: string | null, target: AiDraft['target'], actor: ActorRef) => draftFor(claimId, target, 0, null, actor),
    regenerateDraft: (draft: AiDraft, actor: ActorRef) => draftFor(draft.claimId, draft.target, draft.variant + 1, draft.id, actor),
    saveDraftEdits: (draftId: string, edited: DraftProposal, actor: ActorRef) => store.transact((db) => cmd.saveDraftEdits(db, draftId, edited, ctx(actor))),
    discardDraft: (draftId: string, reason: string, actor: ActorRef) => store.transact((db) => cmd.discardDraft(db, draftId, reason, ctx(actor))),
    approveDraft: (draftId: string, actor: ActorRef) => withRanking((db, rank) => cmd.approveDraft(db, draftId, ctx(actor), rank, model)),
    editQuestion: (questionId: string, v: Parameters<typeof cmd.editQuestion>[2], actor: ActorRef) => store.transact((db) => cmd.editQuestion(db, questionId, v, ctx(actor))),
    decide: (claimId: string, outcome: DecisionOutcome, reason: string, actor: ActorRef) => store.transact((db) => cmd.decideClaim(db, claimId, outcome, reason, ctx(actor))),
    updateAiConfig: (patch: Partial<Pick<AiConfig, 'mappingThreshold' | 'autoSelectThreshold' | 'maxQuestions' | 'draftWarningThreshold'>>, actor: ActorRef) =>
      store.transact((db) => cmd.updateAiConfig(db, patch, ctx(actor))),

    // Participant
    markNotificationRead: (notificationId: string, actor: ActorRef) => store.transact((db) => cmd.markNotificationRead(db, notificationId, ctx(actor))),
    recordFrista: (assignmentId: string, result: FristaResult, actor: ActorRef) => store.transact((db) => cmd.recordFrista(db, assignmentId, result, ctx(actor))),
    decline: (assignmentId: string, actor: ActorRef) => store.transact((db) => cmd.declineQuestions(db, assignmentId, ctx(actor))),
    submitResponses: (args: { assignmentId: string; answers: cmd.AnswerInput[]; startedAt: string }, actor: ActorRef) =>
      store.transact((db) => cmd.submitResponses(db, args, ctx(actor))),

    // System
    closeExpired: async () => (cmd.hasExpired(snapshot(), clock()) ? store.transact((db) => cmd.closeExpired(db, ctx(cmd.SYSTEM_ACTOR))) : 0),
    reset: () => store.reset(),
  };
}

export type Actions = ReturnType<typeof createActions>;
