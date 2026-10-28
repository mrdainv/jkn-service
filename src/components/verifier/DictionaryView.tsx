import { ArrowLeft, BookOpen, Pencil, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { findProcedure } from '../../ai/reference';
import { useAction, useApp } from '../../application/context';
import { checkQuestion, checksPass } from '../../domain/checks';
import { currentVersion, questionForEntry } from '../../domain/queries';
import type { Db } from '../../domain/types';
import { formatDateTime, formatScore } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { OriginBadge } from '../status';
import { Badge, Button, Card, Empty, KeyValue, Notice, PageHeader } from '../ui';
import { cx, inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';
import { QuestionEditor, QuestionPreview, type QuestionDraft } from './QuestionEditor';

/** Codes billed on claims that no dictionary entry covers yet. */
function coverageGaps(db: Db) {
  const byCode = new Map<string, { code: string; name: string; claims: Set<string>; preparing: Set<string> }>();
  for (const m of db.mappings) {
    if (m.target.kind !== 'PROSEDUR' || m.status === 'TERPETAKAN') continue;
    const claim = db.claims.find((c) => c.id === m.claimId);
    const g = byCode.get(m.target.code) ?? { code: m.target.code, name: findProcedure(m.target.code)?.name ?? m.target.name, claims: new Set(), preparing: new Set() };
    g.claims.add(m.claimId);
    if (claim?.status === 'DIAJUKAN' || claim?.status === 'MENUNGGU_PESERTA') g.preparing.add(m.claimId);
    byCode.set(m.target.code, g);
  }
  return [...byCode.values()]
    .map((g) => {
      const drafts = db.drafts.filter((d) => d.target.code === g.code).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      return { ...g, claimCount: g.claims.size, preparingCount: g.preparing.size, latestDraft: drafts[0] };
    })
    .sort((a, b) => b.claimCount - a.claimCount || a.code.localeCompare(b.code));
}

export function DictionaryView({ entryId }: { entryId?: string }) {
  return entryId ? <EntryDetail entryId={entryId} /> : <EntryList />;
}

function EntryList() {
  const { db, actions } = useApp();
  const [ask, askState] = useAction(actions.askAi);
  const gaps = useMemo(() => coverageGaps(db), [db]);
  const usage = useMemo(() => {
    const m = new Map<string, { claims: number; published: number }>();
    for (const map of db.mappings) if (map.entryId && map.status === 'TERPETAKAN') m.set(map.entryId, { claims: (m.get(map.entryId)?.claims ?? 0) + 1, published: m.get(map.entryId)?.published ?? 0 });
    for (const a of db.assignments)
      for (const it of a.items) {
        const q = db.questions.find((x) => x.id === it.questionId)!;
        const u = m.get(q.entryId) ?? { claims: 0, published: 0 };
        m.set(q.entryId, { ...u, published: u.published + 1 });
      }
    return m;
  }, [db]);

  return (
    <>
      <PageHeader title="Kamus pengalaman" subtitle="Apa yang dapat dirasakan pasien dari setiap layanan, dalam bahasa sehari-hari, beserta pertanyaan dan versi yang dipakai klaim." />
      <Card
        className="mb-4"
        title="Celah cakupan"
        subtitle="Kode tindakan pada klaim yang belum punya entri kamus yang relevan. Draf AI selalu melalui tinjauan verifikator sebelum masuk kamus."
        bodyClassName="p-0"
      >
        {gaps.length === 0 ? (
          <div className="p-4">
            <Empty title="Semua tindakan pada klaim sudah terpetakan" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Kode</th>
                <th className={th}>Tindakan</th>
                <th className={th}>Klaim terdampak</th>
                <th className={th}>Masih bisa ditanyakan</th>
                <th className={th}>Draf AI terakhir</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gaps.map((g) => (
                <tr key={g.code}>
                  <td className={cx(td, 'font-mono text-xs')}>{g.code}</td>
                  <td className={td}>{g.name}</td>
                  <td className={cx(td, 'tabular')}>{g.claimCount}</td>
                  <td className={cx(td, 'tabular')}>{g.preparingCount}</td>
                  <td className={cx(td, 'text-xs')}>
                    {g.latestDraft ? (
                      <a className="underline" href={href(`/verifikator/draf/${g.latestDraft.id}`)}>
                        {g.latestDraft.id} · {g.latestDraft.status.toLowerCase()}
                      </a>
                    ) : (
                      <span className="text-slate-400">belum ada</span>
                    )}
                  </td>
                  <td className={cx(td, 'text-right')}>
                    {g.latestDraft?.status === 'DRAF' ? (
                      <a className="text-xs text-violet-700 underline" href={href(`/verifikator/draf/${g.latestDraft.id}`)}>
                        Tinjau draf
                      </a>
                    ) : (
                      <Button
                        size="sm"
                        icon={Sparkles}
                        pending={askState.pending}
                        onClick={async () => {
                          const claimId = [...g.preparing][0] ?? null;
                          const draft = await ask(claimId, { code: g.code, name: g.name, category: findProcedure(g.code)?.category ?? 'Tindakan' }, VERIFIER_ACTOR);
                          if (draft) navigate(`/verifikator/draf/${draft.id}`);
                        }}
                      >
                        Tanya AI
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {askState.error && <Notice kind="error" className="m-3">{askState.error}</Notice>}
      </Card>
      <Card title={`Entri kamus (${db.dictionary.length})`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Kode / entri</th>
                <th className={th}>Kategori</th>
                <th className={th}>Observabilitas</th>
                <th className={th}>Pertanyaan aktif</th>
                <th className={th}>Klaim terpetakan</th>
                <th className={th}>Kali diterbitkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.dictionary.map((e) => {
                const q = questionForEntry(db, e.id);
                const v = q ? currentVersion(q) : undefined;
                const u = usage.get(e.id);
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/verifikator/kamus/${e.id}`)}>
                    <td className={td}>
                      <a className="underline" href={href(`/verifikator/kamus/${e.id}`)} onClick={(ev) => ev.stopPropagation()}>
                        {e.code ? <span className="font-mono text-xs">{e.code} · </span> : null}
                        {e.name}
                      </a>
                      {e.source === 'DRAF_AI' && (
                        <Badge tone="violet" className="ml-1.5">
                          dari draf AI
                        </Badge>
                      )}
                    </td>
                    <td className={cx(td, 'text-xs')}>{e.category}</td>
                    <td className={cx(td, 'tabular text-xs')}>{e.observability === null ? <span className="text-slate-400">belum dinilai</span> : formatScore(e.observability)}</td>
                    <td className={cx(td, 'text-xs')}>
                      {q && v ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="font-mono">
                            {q.id} v{v.version}
                          </span>
                          <OriginBadge origin={v.origin} />
                        </span>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className={cx(td, 'tabular text-xs')}>{u?.claims ?? 0}</td>
                    <td className={cx(td, 'tabular text-xs')}>{u?.published ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function EntryDetail({ entryId }: { entryId: string }) {
  const { db, actions } = useApp();
  const entry = db.dictionary.find((e) => e.id === entryId);
  const question = entry ? questionForEntry(db, entry.id) : undefined;
  const latest = question ? currentVersion(question) : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>({ text: latest?.text ?? '', options: latest?.options ?? [] });
  const [note, setNote] = useState('');
  const [edit, editState] = useAction(actions.editQuestion);
  if (!entry) return <Empty icon={BookOpen} title={`Entri ${entryId} tidak ditemukan`} />;
  const versionStats = (version: number) => {
    const published = db.assignments.filter((a) => a.items.some((i) => i.questionId === question?.id && i.questionVersion === version)).length;
    const answers = db.answers.filter((a) => a.questionId === question?.id && a.questionVersion === version);
    return { published, answered: answers.length };
  };
  return (
    <>
      <PageHeader
        crumbs={
          <a href={href('/verifikator/kamus')} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Kamus pengalaman
          </a>
        }
        title={`${entry.code ? `${entry.code} · ` : ''}${entry.name}`}
        subtitle={`${entry.id} · ${entry.category} · ${entry.source === 'DRAF_AI' ? `dari draf AI ${entry.aiDraftId}` : 'kamus awal (simulasi)'}`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Isi entri">
          <KeyValue
            cols={1}
            items={[
              ['Pengalaman yang dapat dirasakan pasien', <ul key="exp" className="list-disc pl-4">{entry.experiences.map((x) => <li key={x}>{x}</li>)}</ul>],
              ['Istilah medis yang dihindari', entry.avoidTerms.join(', ') || '–'],
              ['Observabilitas', entry.observability === null ? 'Belum dinilai (entri baru)' : formatScore(entry.observability)],
              ['Dibuat', formatDateTime(entry.createdAt)],
            ]}
          />
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {question && latest && (
            <Card
              title={`Pertanyaan ${question.id} · versi ${latest.version}`}
              actions={
                !editing && (
                  <Button size="sm" icon={Pencil} onClick={() => { setDraft({ text: latest.text, options: latest.options }); setEditing(true); }}>
                    Sunting (versi baru)
                  </Button>
                )
              }
            >
              {editing ? (
                <div className="space-y-3">
                  <QuestionEditor idPrefix={question.id} value={draft} onChange={setDraft} avoidTerms={entry.avoidTerms} />
                  <input className={inputCls} placeholder="Catatan perubahan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Catatan perubahan" />
                  {editState.error && <Notice kind="error">{editState.error}</Notice>}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!checksPass(checkQuestion(draft.text, draft.options, entry.avoidTerms))}
                      pending={editState.pending}
                      onClick={async () => {
                        if (await edit(question.id, { ...draft, note }, VERIFIER_ACTOR)) {
                          setEditing(false);
                          setNote('');
                        }
                      }}
                    >
                      Simpan sebagai v{latest.version + 1}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Batal
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Versi lama tetap utuh: putaran yang sudah terbit dan jawaban yang sudah masuk tetap menunjuk versi yang mereka pakai.</p>
                </div>
              ) : (
                <QuestionPreview text={latest.text} options={latest.options} />
              )}
            </Card>
          )}
          {question && (
            <Card title="Riwayat versi" bodyClassName="p-0">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Versi</th>
                    <th className={th}>Kalimat</th>
                    <th className={th}>Asal</th>
                    <th className={th}>Terbit</th>
                    <th className={th}>Dijawab</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...question.versions].reverse().map((v) => {
                    const s = versionStats(v.version);
                    return (
                      <tr key={v.version}>
                        <td className={cx(td, 'font-mono text-xs')}>v{v.version}</td>
                        <td className={cx(td, 'text-xs')}>
                          {v.text}
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {v.options.length} pilihan · {v.note} · {v.createdBy.name}, {formatDateTime(v.createdAt)}
                          </div>
                        </td>
                        <td className={td}>
                          <OriginBadge origin={v.origin} />
                        </td>
                        <td className={cx(td, 'tabular text-xs')}>{s.published}</td>
                        <td className={cx(td, 'tabular text-xs')}>{s.answered}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
