import { ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useDb } from '../../application/context';
import type { AiDraft } from '../../domain/types';
import { formatDateTime, formatScore } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { Badge, Card, Empty, Notice, PageHeader } from '../ui';
import { cx, td, th } from '../styles';
import { DraftReview } from './DraftReview';

const FILTERS: { id: AiDraft['status'] | 'ALL'; label: string }[] = [
  { id: 'DRAF', label: 'Perlu ditinjau' },
  { id: 'DISETUJUI', label: 'Disetujui' },
  { id: 'DIBUANG', label: 'Dibuang' },
  { id: 'DIGANTIKAN', label: 'Digantikan' },
  { id: 'ALL', label: 'Semua' },
];

export function DraftsView({ draftId }: { draftId?: string }) {
  const db = useDb();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('DRAF');
  if (draftId) {
    const draft = db.drafts.find((d) => d.id === draftId);
    return (
      <>
        <PageHeader
          crumbs={
            <a href={href('/verifikator/draf')} className="inline-flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" aria-hidden /> Draf AI
            </a>
          }
          title={`Draf ${draftId}`}
        />
        {draft ? <DraftReview key={`${draft.id}-${draft.status}`} draft={draft} /> : <Empty title="Draf tidak ditemukan" />}
        {draft?.status === 'DIGANTIKAN' && (
          <Notice className="mt-3">
            Draf ini digantikan oleh{' '}
            {db.drafts
              .filter((d) => d.previousDraftId === draft.id)
              .map((d) => (
                <a key={d.id} className="underline" href={href(`/verifikator/draf/${d.id}`)}>
                  {d.id}
                </a>
              ))}
            .
          </Notice>
        )}
      </>
    );
  }
  const drafts = db.drafts.filter((d) => filter === 'ALL' || d.status === filter).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return (
    <>
      <PageHeader title="Draf AI" subtitle="Usulan pertanyaan dari AI (simulasi) yang terpisah dari kamus sampai disetujui verifikator." />
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx('rounded-full border px-3 py-1 text-xs', filter === f.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-white')}
          >
            {f.label} ({f.id === 'ALL' ? db.drafts.length : db.drafts.filter((d) => d.status === f.id).length})
          </button>
        ))}
      </div>
      <Card bodyClassName="p-0">
        {drafts.length === 0 ? (
          <div className="p-4">
            <Empty icon={Sparkles} title="Tidak ada draf di kelompok ini">
              Minta draf lewat <b>Tanya AI</b> pada tindakan yang belum terpetakan di halaman klaim atau di Kamus pengalaman → Celah cakupan.
            </Empty>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Draf</th>
                <th className={th}>Tindakan</th>
                <th className={th}>Kalimat usulan</th>
                <th className={th}>Keyakinan draf</th>
                <th className={th}>Klaim</th>
                <th className={th}>Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drafts.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/verifikator/draf/${d.id}`)}>
                  <td className={cx(td, 'font-mono text-xs')}>
                    <a className="underline" href={href(`/verifikator/draf/${d.id}`)} onClick={(e) => e.stopPropagation()}>
                      {d.id}
                    </a>
                    <div>
                      <Badge tone={d.status === 'DRAF' ? 'violet' : d.status === 'DISETUJUI' ? 'good' : 'neutral'}>{d.status.toLowerCase()}</Badge>
                    </div>
                  </td>
                  <td className={cx(td, 'text-xs')}>
                    <span className="font-mono">{d.target.code}</span> {d.target.name}
                  </td>
                  <td className={cx(td, 'max-w-md text-xs')}>{(d.edited ?? d.proposal).text}</td>
                  <td className={cx(td, 'tabular text-xs')}>{formatScore(d.confidence)}</td>
                  <td className={cx(td, 'font-mono text-xs')}>{d.claimId ?? '–'}</td>
                  <td className={cx(td, 'text-xs text-slate-500')}>{formatDateTime(d.generatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
