import { CheckCheck, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAction, useApp } from '../../application/context';
import { editIsChange } from '../../application/commands';
import { checkQuestion, checksPass } from '../../domain/checks';
import type { AiDraft } from '../../domain/types';
import { formatDateTime, formatScore } from '../../lib/format';
import { href } from '../../lib/router';
import { Badge, Button, Notice } from '../ui';
import { cx, inputCls } from '../styles';
import { QuestionEditor, QuestionPreview, type QuestionDraft } from './QuestionEditor';
import { VERIFIER_ACTOR } from './actor';

const STATUS: Record<AiDraft['status'], { label: string; tone: 'violet' | 'good' | 'neutral' }> = {
  DRAF: { label: 'Draf, belum disetujui', tone: 'violet' },
  DISETUJUI: { label: 'Disetujui ke kamus', tone: 'good' },
  DIBUANG: { label: 'Dibuang', tone: 'neutral' },
  DIGANTIKAN: { label: 'Digantikan draf baru', tone: 'neutral' },
};

/** One AI draft: what the AI used and proposed, the verifier's edits, and the approve / discard decision. */
export function DraftReview({ draft, compact }: { draft: AiDraft; compact?: boolean }) {
  const { db, actions } = useApp();
  const current = draft.edited ?? draft.proposal;
  const [value, setValue] = useState<QuestionDraft>({ text: current.text, options: current.options });
  const [reason, setReason] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [save, saveState] = useAction(actions.saveDraftEdits);
  const [regen, regenState] = useAction(actions.regenerateDraft);
  const [approve, approveState] = useAction(actions.approveDraft);
  const [discard, discardState] = useAction(actions.discardDraft);
  const open = draft.status === 'DRAF';
  const dirty = editIsChange(current, value);
  const pass = checksPass(checkQuestion(value.text, value.options, current.avoidTerms));
  const low = draft.confidence < db.aiConfig.draftWarningThreshold;
  const refs = draft.context.referenceEntryIds.map((id) => db.dictionary.find((e) => e.id === id)).filter(Boolean);
  const error = saveState.error ?? regenState.error ?? approveState.error ?? discardState.error;
  const proposal = { ...current, ...value };

  return (
    <div className={cx('rounded-lg border bg-white', open ? 'border-violet-200' : 'border-slate-200')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
          <a href={href(`/verifikator/draf/${draft.id}`)} className="font-mono text-xs underline">
            {draft.id}
          </a>
          <span className="font-medium text-slate-900">
            {draft.target.code} · {draft.target.name}
          </span>
          <Badge tone={STATUS[draft.status].tone}>{STATUS[draft.status].label}</Badge>
          <Badge tone={low ? 'warn' : 'accent'} title="Keyakinan generator simulasi terhadap draf ini; bukan validasi klinis.">
            Keyakinan draf <span className="tabular">{formatScore(draft.confidence)}</span>
            {low && ' · di bawah ambang'}
          </Badge>
        </div>
        <span className="text-[11px] text-slate-500">
          {formatDateTime(draft.generatedAt)} · varian {draft.variant + 1}
        </span>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-5">
        <div className="space-y-2 text-xs text-slate-600 lg:col-span-2">
          <Notice kind="warn">Usulan AI (simulasi), belum terverifikasi. Periksa kesesuaian klinisnya sebelum menyetujui.</Notice>
          {!draft.context.experienceSourceFound && (
            <Notice kind="info">Tidak ada deskripsi pengalaman untuk kode ini, jadi AI tidak mengarang detail klinis. Lengkapi kalimatnya sendiri.</Notice>
          )}
          <div>
            <div className="font-medium text-slate-700">Alasan generator</div>
            <p className="mt-0.5">{draft.rationale}</p>
          </div>
          <div>
            <div className="font-medium text-slate-700">Konteks yang dipakai</div>
            <p className="mt-0.5">Atribut klaim: {draft.context.claimAttributes.join(', ')}.</p>
            <p>
              Rujukan kamus:{' '}
              {refs.length
                ? refs.map((e, i) => (
                    <span key={e!.id}>
                      {i > 0 && ', '}
                      <a className="underline" href={href(`/verifikator/kamus/${e!.id}`)}>
                        {e!.code} {e!.name}
                      </a>
                    </span>
                  ))
                : 'tidak ada'}
            </p>
            {draft.claimId && (
              <p>
                Diminta dari klaim{' '}
                <a className="font-mono underline" href={href(`/verifikator/klaim/${draft.claimId}`)}>
                  {draft.claimId}
                </a>
                .
              </p>
            )}
            {current.avoidTerms.length > 0 && <p>Istilah yang dihindari: {current.avoidTerms.join(', ')}.</p>}
          </div>
          {draft.edited && <Badge tone="info">Ada suntingan verifikator</Badge>}
        </div>
        <div className="lg:col-span-3">
          {open ? (
            <QuestionEditor idPrefix={draft.id} value={value} onChange={setValue} avoidTerms={current.avoidTerms} />
          ) : (
            <QuestionPreview text={current.text} options={current.options} />
          )}
          {!open && draft.status === 'DISETUJUI' && draft.approvedEntryId && (
            <p className="mt-2 text-xs text-slate-600">
              Menjadi entri{' '}
              <a className="underline" href={href(`/verifikator/kamus/${draft.approvedEntryId}`)}>
                {draft.approvedEntryId}
              </a>{' '}
              dan pertanyaan {draft.approvedQuestionId} v1 pada {formatDateTime(draft.resolvedAt)}.
            </p>
          )}
          {!open && draft.status === 'DIBUANG' && <p className="mt-2 text-xs text-slate-600">Dibuang {formatDateTime(draft.resolvedAt)}.</p>}
        </div>
      </div>
      {error && (
        <div className="px-4 pb-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          <Button size="sm" variant="primary" icon={CheckCheck} disabled={!pass} pending={approveState.pending} onClick={async () => {
            if (dirty && !(await save(draft.id, proposal, VERIFIER_ACTOR))) return;
            await approve(draft.id, VERIFIER_ACTOR);
          }} title={pass ? undefined : 'Perbaiki pemeriksaan yang belum lolos'}>
            Setujui ke kamus
          </Button>
          <Button size="sm" icon={Save} disabled={!dirty} pending={saveState.pending} onClick={() => save(draft.id, proposal, VERIFIER_ACTOR)}>
            Simpan suntingan
          </Button>
          <Button size="sm" icon={RefreshCw} pending={regenState.pending} onClick={() => regen(draft, VERIFIER_ACTOR)}>
            Buat ulang
          </Button>
          {discarding ? (
            <span className="flex flex-1 flex-wrap items-center gap-2">
              <input className={cx(inputCls, 'min-w-48 flex-1 py-1')} placeholder="Alasan dibuang (opsional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan membuang draf" />
              <Button size="sm" variant="danger" pending={discardState.pending} onClick={() => discard(draft.id, reason, VERIFIER_ACTOR)}>
                Buang draf
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDiscarding(false)}>
                Batal
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDiscarding(true)}>
              Buang
            </Button>
          )}
          {!compact && <span className="ml-auto text-[11px] text-slate-500">Draf tidak tampil ke peserta sebelum disetujui dan diterbitkan pada klaim.</span>}
        </div>
      )}
    </div>
  );
}
