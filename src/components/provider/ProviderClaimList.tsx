import { FilePlus2, Inbox } from 'lucide-react';
import { useState } from 'react';
import { useDb } from '../../application/context';
import { PROVIDER_STATUS_LABEL } from '../../domain/labels';
import type { Facility } from '../../domain/types';
import { formatDate, formatDateTime, formatRupiah } from '../../lib/format';
import { href } from '../../lib/router';
import { ClaimStatusBadge, DecisionBadge } from '../status';
import { Button, Card, Empty, PageHeader } from '../ui';
import { cx, inputCls, td, th } from '../styles';

export function ProviderClaimList({ facility }: { facility: Facility }) {
  const db = useDb();
  const [filter, setFilter] = useState<'ALL' | 'PROSES' | 'SELESAI'>('ALL');
  const [q, setQ] = useState('');
  const all = db.claims.filter((c) => c.facilityId === facility.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const claims = all.filter((c) => {
    if (filter === 'SELESAI' && c.status !== 'SELESAI') return false;
    if (filter === 'PROSES' && c.status === 'SELESAI') return false;
    if (!q.trim()) return true;
    const p = db.participants.find((x) => x.id === c.participantId);
    const needle = q.trim().toLowerCase();
    return c.sepNumber.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle) || !!p?.name.toLowerCase().includes(needle);
  });
  const inProcess = all.filter((c) => c.status !== 'SELESAI').length;
  return (
    <>
      <PageHeader
        title="Daftar klaim"
        subtitle={`${all.length} klaim dari ${facility.name}; ${inProcess} masih dalam proses.`}
        actions={
          <a href={href('/faskes/baru')}>
            <Button variant="primary" icon={FilePlus2}>
              Ajukan klaim
            </Button>
          </a>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {(['ALL', 'PROSES', 'SELESAI'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx('rounded-full border px-3 py-1 text-xs', filter === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}
            >
              {f === 'ALL' ? 'Semua' : f === 'PROSES' ? 'Dalam proses' : 'Selesai'}
            </button>
          ))}
          <input className={cx(inputCls, 'ml-auto w-60 py-1')} placeholder="Cari SEP, ID, atau nama" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari klaim" />
        </div>
        {claims.length === 0 ? (
          <div className="p-4">
            <Empty icon={Inbox} title="Belum ada klaim">
              Klaim yang Anda ajukan akan muncul di sini beserta status verifikasinya.
            </Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Klaim / SEP</th>
                  <th className={th}>Peserta</th>
                  <th className={th}>Rawat</th>
                  <th className={th}>Diagnosis</th>
                  <th className={th}>Tarif INA-CBG</th>
                  <th className={th}>Diajukan</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c) => {
                  const p = db.participants.find((x) => x.id === c.participantId);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className={td}>
                        <a href={href(`/faskes/klaim/${c.id}`)} className="font-mono text-xs font-medium text-emerald-800 underline">
                          {c.id}
                        </a>
                        <div className="font-mono text-[11px] text-slate-500">{c.sepNumber}</div>
                      </td>
                      <td className={td}>{p?.name}</td>
                      <td className={cx(td, 'text-xs')}>
                        {formatDate(c.admissionDate)} – {formatDate(c.dischargeDate)}
                      </td>
                      <td className={cx(td, 'text-xs')}>
                        <span className="font-mono">{c.diagnosis.code}</span> {c.diagnosis.name}
                      </td>
                      <td className={cx(td, 'tabular text-xs')}>{formatRupiah(c.inaCbg.tariff)}</td>
                      <td className={cx(td, 'text-xs text-slate-600')}>{formatDateTime(c.submittedAt)}</td>
                      <td className={td}>
                        <ClaimStatusBadge status={c.status} view="provider" />
                        {c.decision && (
                          <div className="mt-1">
                            <DecisionBadge outcome={c.decision.outcome} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">Status yang terlihat oleh faskes: {[...new Set(Object.values(PROVIDER_STATUS_LABEL))].join(' → ')}. Hasil keputusan ditampilkan; jawaban peserta tidak.</p>
    </>
  );
}
