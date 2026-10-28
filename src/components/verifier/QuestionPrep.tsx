import { Lock, Pencil, Plus, Save, Send, Sparkles, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { findProcedure } from '../../ai/reference';
import { useAction, useApp } from '../../application/context';
import { editIsChange, isLocked, MAX_POOL_QUESTIONS } from '../../application/commands';
import { checkQuestion, checksPass } from '../../domain/checks';
import { claimedNights } from '../../domain/evidence';
import { MATCH_TYPE_LABEL } from '../../domain/labels';
import { currentAssignment, currentVersion, getEntry, getQuestion, getVersion, questionForEntry, renderText, sessionFor } from '../../domain/queries';
import type { Claim, ClaimMapping, SelectionItem } from '../../domain/types';
import { formatDateTime, formatPeriod, formatScore } from '../../lib/format';
import { href } from '../../lib/router';
import { ConfidencePill, MappingBadge, OriginBadge } from '../status';
import { Badge, Button, Card, Empty, Notice } from '../ui';
import { cx, inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';
import { DraftReview } from './DraftReview';
import { QuestionEditor, QuestionPreview } from './QuestionEditor';

/** Mapping results, AI suggestions and the verifier's question set for one claim. */
export function QuestionPrep({ claim }: { claim: Claim }) {
  const { db, actions } = useApp();
  const persisted = db.selections.find((s) => s.claimId === claim.id);
  const persistedJson = JSON.stringify(persisted?.items ?? []);
  // Local edits only exist once the verifier changes something; until then the saved selection is shown,
  // so changes saved elsewhere (another tab, a draft approved below) appear immediately.
  const [local, setLocal] = useState<SelectionItem[] | null>(null);
  const items = local ?? persisted?.items ?? [];
  const setItems = (next: SelectionItem[]) => setLocal(next);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [published, setPublished] = useState(false);
  const dirty = local !== null && JSON.stringify(local) !== persistedJson;
  const [save, saveState] = useAction(actions.saveSelection);
  const [publish, publishState] = useAction(actions.publish);
  const [ask, askState] = useAction(actions.askAi);

  const mappings = db.mappings.filter((m) => m.claimId === claim.id);
  const assignment = currentAssignment(db, claim.id);
  const locked = isLocked(db, claim);
  const started = assignment ? sessionFor(db, assignment.id) : undefined;
  const cfg = db.aiConfig;
  const nights = claimedNights(claim);
  const facility = db.facilities.find((f) => f.id === claim.facilityId)!;
  const slots = { faskes: facility.name, periode: formatPeriod(claim.admissionDate) };
  const included = items.filter((i) => i.included);
  const openDrafts = db.drafts.filter((d) => d.status === 'DRAF' && (d.claimId === claim.id || claim.procedures.some((p) => p.code === d.target.code)));
  const invalidEdits = items.filter((i) => {
    if (!i.included || !i.edit) return false;
    const entry = getEntry(db, getQuestion(db, i.questionId).entryId);
    return !checksPass(checkQuestion(i.edit.text, i.edit.options, entry.avoidTerms));
  });

  const update = (questionId: string, patch: Partial<SelectionItem>) => setItems(items.map((i) => (i.questionId === questionId ? { ...i, ...patch } : i)));
  const addable = db.dictionary.filter((e) => e.status === 'AKTIF' && questionForEntry(db, e.id) && !items.some((i) => getQuestion(db, i.questionId).entryId === e.id));

  const askFor = (m: ClaimMapping) => {
    if (m.target.kind !== 'PROSEDUR') return;
    const ref = findProcedure(m.target.code);
    void ask(claim.id, { code: m.target.code, name: m.target.name, category: ref?.category ?? 'Tindakan' }, VERIFIER_ACTOR);
  };

  return (
    <div className="space-y-4">
      <Card title="Pemetaan ke kamus pengalaman" subtitle={`Dicocokkan otomatis saat klaim diajukan. Ambang relevansi ${formatScore(cfg.mappingThreshold)} (Konfigurasi AI). Relevansi menilai kecocokan entri, bukan keabsahan klaim.`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Atribut klaim</th>
                <th className={th}>Entri kamus</th>
                <th className={th}>Dasar cocok</th>
                <th className={th}>Relevansi</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappings.map((m) => {
                const entry = m.entryId ? db.dictionary.find((e) => e.id === m.entryId) : undefined;
                const draft = m.target.kind === 'PROSEDUR' ? openDrafts.find((d) => d.target.code === (m.target as { code: string }).code) : undefined;
                return (
                  <tr key={m.id}>
                    <td className={td}>
                      {m.target.kind === 'EPISODE' ? (
                        <span>{m.target.topic === 'KEBERADAAN' ? 'Episode: menginap di RS' : `Episode: lama rawat (${nights} malam)`}</span>
                      ) : (
                        <span>
                          <span className="font-mono text-xs">{m.target.code}</span> {m.target.name}
                        </span>
                      )}
                    </td>
                    <td className={cx(td, 'text-xs')}>
                      {entry ? (
                        <a className="underline" href={href(`/verifikator/kamus/${entry.id}`)}>
                          {entry.code ? `${entry.code} · ` : ''}
                          {entry.name}
                        </a>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className={cx(td, 'text-xs text-slate-600')}>{MATCH_TYPE_LABEL[m.matchType]}</td>
                    <td className={cx(td, 'tabular text-xs')}>{m.entryId ? formatScore(m.relevance) : '–'}</td>
                    <td className={td}>
                      <MappingBadge status={m.status} />
                    </td>
                    <td className={cx(td, 'text-right')}>
                      {/* Any match that is not an exact code may be the wrong entry, so the verifier can ask for a dedicated draft. */}
                      {m.matchType !== 'KODE_TEPAT' && m.target.kind === 'PROSEDUR' && !locked &&
                        (draft ? (
                          <a className="text-xs text-violet-700 underline" href={`#draf-${draft.id}`}>
                            Draf {draft.id} terbuka
                          </a>
                        ) : (
                          <Button size="sm" icon={Sparkles} pending={askState.pending} onClick={() => askFor(m)} title={m.status === 'TERPETAKAN' ? 'Entri yang cocok berasal dari kode lain; minta draf khusus untuk kode ini' : undefined}>
                            Tanya AI
                          </Button>
                        ))}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className={td}>
                  Diagnosis: <span className="font-mono text-xs">{claim.diagnosis.code}</span> {claim.diagnosis.name}
                </td>
                <td className={cx(td, 'text-xs text-slate-500')} colSpan={5}>
                  Tidak ditanyakan: diagnosis memerlukan penilaian dokter, bukan pengalaman peserta.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {askState.error && (
          <div className="p-3">
            <Notice kind="error">{askState.error}</Notice>
          </div>
        )}
      </Card>

      {openDrafts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Draf AI untuk klaim ini</h3>
          {openDrafts.map((d) => (
            <div id={`draf-${d.id}`} key={d.id}>
              <DraftReview draft={d} compact />
            </div>
          ))}
        </div>
      )}

      <Card
        title="Pertanyaan yang disetujui untuk peserta"
        subtitle={`${included.length} disetujui (maks. ${MAX_POOL_QUESTIONS}). Peserta ditanya satu per satu; AI memilih urutannya dari daftar ini dan berhenti paling lambat setelah ${cfg.maxQuestions} pertanyaan. Usulan dengan keyakinan AI ≥ ${formatScore(cfg.autoSelectThreshold)} dicentang otomatis.`}
        actions={
          assignment && (
            <Badge tone={assignment.status === 'AKTIF' ? 'info' : 'neutral'}>
              Putaran {assignment.round} terbit {formatDateTime(assignment.publishedAt)}
            </Badge>
          )
        }
      >
        {locked && (
          <Notice kind="info" className="mb-3" title="Pertanyaan terkunci">
            {started?.status === 'BERLANGSUNG'
              ? 'Peserta sedang menjawab putaran ini; daftar pertanyaan tidak dapat diubah sampai sesi berhenti.'
              : assignment?.status === 'DIJAWAB'
                ? 'Peserta sudah menjawab putaran ini; versi yang dijawab tidak dapat diubah.'
                : 'Klaim sudah diputuskan atau putaran ditutup.'}
          </Notice>
        )}
        {!locked && assignment?.status === 'AKTIF' && (
          <Notice kind="warn" className="mb-3">
            Pertanyaan sudah terbit dan peserta belum memulai. Menerbitkan ulang membuat putaran baru; peserta mendapat notifikasi pembaruan dan versi lama tidak dapat dijawab lagi.
          </Notice>
        )}
        {items.length === 0 ? (
          <Empty title="Belum ada pertanyaan yang cocok">Gunakan Tanya AI pada tindakan yang belum terpetakan, atau tambah pertanyaan dari kamus.</Empty>
        ) : (
          <ol className="space-y-2">
            {items.map((item, index) => {
              const question = getQuestion(db, item.questionId);
              const entry = getEntry(db, question.entryId);
              const base = getVersion(db, item.questionId, item.version);
              const latest = currentVersion(question);
              const suggestion = item.suggestionId ? db.suggestions.find((s) => s.id === item.suggestionId) : undefined;
              const mapping = suggestion?.mappingId ? db.mappings.find((m) => m.id === suggestion.mappingId) : undefined;
              const shown = item.edit ?? base;
              const edited = item.edit !== null && editIsChange(base, item.edit);
              const isEditing = editing === item.questionId;
              return (
                <li key={item.questionId} className={cx('rounded-md border p-3', item.included ? 'border-slate-300 bg-white' : 'border-dashed border-slate-200 bg-slate-50/60')}>
                  <div className="flex flex-wrap items-start gap-3">
                    <label className="mt-0.5 flex items-center gap-2">
                      <input type="checkbox" checked={item.included} disabled={locked} onChange={(e) => update(item.questionId, { included: e.target.checked })} aria-label={`Pilih pertanyaan ${entry.name}`} />
                      <span className="tabular w-5 text-xs text-slate-500">{item.included ? items.filter((x, k) => x.included && k <= index).length : '–'}</span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-medium text-slate-800">
                          {entry.code ? `${entry.code} · ` : ''}
                          {entry.name}
                        </span>
                        <span className="font-mono text-slate-500">
                          {question.id} v{item.version}
                          {edited && ' + suntingan'}
                        </span>
                        <OriginBadge origin={base.origin} />
                        {suggestion ? <ConfidencePill value={suggestion.aiConfidence} below={suggestion.aiConfidence < cfg.autoSelectThreshold} /> : <Badge tone="neutral">Ditambah manual</Badge>}
                        {mapping && mapping.status !== 'TERPETAKAN' && <Badge tone="warn">Relevansi rendah ({formatScore(mapping.relevance)})</Badge>}
                        {latest.version > item.version && !item.edit && !locked && (
                          <button type="button" className="text-sky-700 underline" onClick={() => update(item.questionId, { version: latest.version })}>
                            Pakai v{latest.version} terbaru
                          </button>
                        )}
                      </div>
                      <div className="mt-2">
                        {isEditing ? (
                          <QuestionEditor
                            idPrefix={item.questionId}
                            value={shown}
                            avoidTerms={entry.avoidTerms}
                            onChange={(v) => update(item.questionId, { edit: v })}
                          />
                        ) : (
                          <QuestionPreview text={renderText(shown.text, slots)} options={shown.options} nights={nights} />
                        )}
                      </div>
                    </div>
                    {!locked && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant={isEditing ? 'primary' : 'secondary'} icon={Pencil} onClick={() => setEditing(isEditing ? null : item.questionId)}>
                          {isEditing ? 'Selesai' : 'Sunting'}
                        </Button>
                        {item.edit && (
                          <Button size="sm" variant="ghost" icon={Undo2} aria-label="Batalkan suntingan" onClick={() => update(item.questionId, { edit: null })} />
                        )}
                        {item.source === 'MANUAL' && (
                          <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((i) => i.questionId !== item.questionId))}>
                            Hapus
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!locked && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className={cx(inputCls, 'w-auto max-w-sm py-1')} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Tambah pertanyaan dari kamus">
              <option value="">Tambah dari kamus…</option>
              {addable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code ? `${e.code} · ` : ''}
                  {e.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              icon={Plus}
              disabled={!adding}
              onClick={() => {
                const q = questionForEntry(db, adding)!;
                setItems([...items, { questionId: q.id, version: currentVersion(q).version, included: true, source: 'MANUAL', suggestionId: null, edit: null }]);
                setAdding('');
              }}
            >
              Tambah
            </Button>
          </div>
        )}
        {(saveState.error || publishState.error) && (
          <Notice kind="error" className="mt-3">
            {saveState.error ?? publishState.error}
          </Notice>
        )}
        {published && !dirty && !publishState.error && (
          <Notice kind="success" className="mt-3" title="Pertanyaan diterbitkan">
            Peserta sudah mendapat notifikasi. Versi pertanyaan terkunci pada putaran ini; AI menanyakannya satu per satu.
          </Notice>
        )}
        {!locked && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="primary"
              icon={Send}
              pending={publishState.pending}
              disabled={included.length === 0 || included.length > MAX_POOL_QUESTIONS || invalidEdits.length > 0}
              onClick={async () => {
                const done = await publish(claim.id, items, VERIFIER_ACTOR);
                if (done) {
                  setEditing(null);
                  setLocal(null);
                  setPublished(true);
                }
              }}
            >
              {assignment?.status === 'AKTIF' ? 'Simpan & terbitkan ulang' : 'Simpan & terbitkan ke peserta'}
            </Button>
            <Button icon={Save} disabled={!dirty} pending={saveState.pending} onClick={async () => { if (await save(claim.id, items, VERIFIER_ACTOR)) setLocal(null); }}>
              Simpan pilihan (belum terbit)
            </Button>
            {dirty && <span className="text-xs text-amber-800">Ada perubahan yang belum disimpan.</span>}
            {included.length > MAX_POOL_QUESTIONS && <span className="text-xs text-red-700">Melebihi batas {MAX_POOL_QUESTIONS} pertanyaan per putaran.</span>}
            {invalidEdits.length > 0 && <span className="text-xs text-red-700">{invalidEdits.length} suntingan belum lolos pemeriksaan.</span>}
          </div>
        )}
        {locked && assignment && <PublishedSummary assignmentId={assignment.id} />}
      </Card>
    </div>
  );
}

function PublishedSummary({ assignmentId }: { assignmentId: string }) {
  const { db } = useApp();
  const a = db.assignments.find((x) => x.id === assignmentId)!;
  return (
    <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
      <Lock className="h-3 w-3" aria-hidden />
      Putaran {a.round} ({a.id}) memuat {a.items.map((i) => `${i.questionId} v${i.questionVersion}`).join(', ')}.
    </p>
  );
}
