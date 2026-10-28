import type { NextQuestionRequest, NextQuestionResponse, QuestionAi, RankRequest, RankedQuestion } from '../ai/service';
import type { DbStore } from '../data/store';
import { getClaim } from '../domain/queries';
import type { ActorRef, AiDraft, Db, DecisionOutcome, DraftProposal, FristaResult, SelectionItem } from '../domain/types';
import * as cmd from './commands';

/**
 * The application's use cases: what each role can do. They ask the AI service (which may be slow or
 * remote) outside the transaction, then apply the matching command inside one store transaction, so an
 * AI failure saves nothing.
 */

const sameIds = (a: readonly { questionId: string }[], b: readonly { questionId: string }[]) =>
  a.length === b.length && a.every((x, i) => x.questionId === b[i].questionId);

export function createActions(store: DbStore, ai: QuestionAi, clock: () => string = () => new Date().toISOString()) {
  const model: cmd.AiModel = { id: ai.info.id, version: ai.info.version, kind: ai.info.kind };
  const ctx = (actor: ActorRef): cmd.Ctx => ({ now: clock(), actor });
  const snapshot = (): Db => {
    const s = store.getSnapshot();
    if (!s) throw new Error('Data belum siap.');
    return s.db;
  };

  /**
   * Runs a command that needs the AI. A dry run on a copy collects the AI requests (and surfaces
   * validation errors early), the AI answers them, then the command runs for real against the answers.
   * If the data changed in between so that a request no longer matches, nothing is saved (AI_STALE).
   */
  async function withAi<T>(run: (db: Db, port: cmd.AiPort) => T): Promise<T> {
    const ranks: RankRequest[] = [];
    const nexts: NextQuestionRequest[] = [];
    run(structuredClone(snapshot()), {
      rank: (req) => {
        ranks.push(req);
        return req.candidates.map((c) => ({ questionId: c.questionId, version: c.version, confidence: 0.5 }));
      },
      next: (req) => {
        nexts.push(req);
        return { next: null, skipped: [] };
      },
    });
    const [rankAnswers, nextAnswers] = await Promise.all([Promise.all(ranks.map((r) => ai.rank(r))), Promise.all(nexts.map((r) => ai.next(r)))]);
    const stale = () => new cmd.CommandError('AI_STALE', 'Data berubah saat AI bekerja. Ulangi tindakan.');
    const port: cmd.AiPort = {
      rank: (req) => {
        const i = ranks.findIndex((r) => r.claim.claimKey === req.claim.claimKey && sameIds(r.candidates, req.candidates));
        const ranked: RankedQuestion[] | undefined = rankAnswers[i];
        if (!ranked) throw stale();
        return ranked;
      },
      next: (req) => {
        const i = nexts.findIndex((r) => r.sessionKey === req.sessionKey && r.history.length === req.history.length && sameIds(r.pool, req.pool));
        const answer: NextQuestionResponse | undefined = nextAnswers[i];
        if (!answer) throw stale();
        return answer;
      },
    };
    return store.transact((db) => run(db, port));
  }

  async function draftFor(claimId: string | null, target: AiDraft['target'], variant: number, previousDraftId: string | null, actor: ActorRef) {
    const db = snapshot();
    const claim = claimId ? getClaim(db, claimId) : null;
    const response = await ai.draft({
      target,
      claim: claim ? { careType: claim.careType } : null,
      dictionary: db.dictionary,
      variant,
    });
    return store.transact((d) => cmd.recordDraft(d, { claimId, target, response, variant, previousDraftId, model }, ctx(actor)));
  }

  return {
    // Facility
    submitClaim: (input: cmd.ClaimInput, actor: ActorRef) => withAi((db, port) => cmd.submitClaim(db, input, ctx(actor), port, model)),

    // Verifier
    saveSelection: (claimId: string, items: SelectionItem[], actor: ActorRef) => store.transact((db) => cmd.saveSelection(db, claimId, items, ctx(actor))),
    publish: (claimId: string, items: SelectionItem[], actor: ActorRef) => store.transact((db) => cmd.publishQuestions(db, claimId, items, ctx(actor))),
    askAi: (claimId: string | null, target: AiDraft['target'], actor: ActorRef) => draftFor(claimId, target, 0, null, actor),
    regenerateDraft: (draft: AiDraft, actor: ActorRef) => draftFor(draft.claimId, draft.target, draft.variant + 1, draft.id, actor),
    saveDraftEdits: (draftId: string, edited: DraftProposal, actor: ActorRef) => store.transact((db) => cmd.saveDraftEdits(db, draftId, edited, ctx(actor))),
    discardDraft: (draftId: string, reason: string, actor: ActorRef) => store.transact((db) => cmd.discardDraft(db, draftId, reason, ctx(actor))),
    approveDraft: (draftId: string, actor: ActorRef) => withAi((db, port) => cmd.approveDraft(db, draftId, ctx(actor), port, model)),
    editQuestion: (questionId: string, v: Parameters<typeof cmd.editQuestion>[2], actor: ActorRef) => store.transact((db) => cmd.editQuestion(db, questionId, v, ctx(actor))),
    decide: (claimId: string, outcome: DecisionOutcome, reason: string, actor: ActorRef) => store.transact((db) => cmd.decideClaim(db, claimId, outcome, reason, ctx(actor))),
    updateAiConfig: (patch: cmd.AiConfigPatch, actor: ActorRef) => store.transact((db) => cmd.updateAiConfig(db, patch, ctx(actor))),

    // Participant
    markNotificationRead: (notificationId: string, actor: ActorRef) => store.transact((db) => cmd.markNotificationRead(db, notificationId, ctx(actor))),
    recordFrista: (assignmentId: string, result: FristaResult, actor: ActorRef) => withAi((db, port) => cmd.recordFrista(db, assignmentId, result, ctx(actor), port, model)),
    decline: (assignmentId: string, actor: ActorRef) => store.transact((db) => cmd.declineQuestions(db, assignmentId, ctx(actor))),
    answer: (input: cmd.AnswerInput, actor: ActorRef) => withAi((db, port) => cmd.answerQuestion(db, input, ctx(actor), port, model)),

    // System
    closeExpired: async () => (cmd.hasExpired(snapshot(), clock()) ? store.transact((db) => cmd.closeExpired(db, ctx(cmd.SYSTEM_ACTOR))) : 0),
    reset: () => store.reset(),
  };
}

export type Actions = ReturnType<typeof createActions>;
