import { Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDb } from '../../application/context';
import { claimEvidence } from '../../domain/queries';
import type { Claim, ClaimStatus } from '../../domain/types';
import { formatDate, formatDateTime } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { usePref } from '../../lib/viewer';
import { ClaimStatusBadge, EvidenceBadge, FraudLevelBadge } from '../status';
import { Badge, Card, Empty, PageHeader } from '../ui';
import { cx, inputCls, td, th } from '../styles';

const GROUPS: { id: string; label: string; statuses: ClaimStatus[]; hint: string }[] = [
  { id: 'aksi', label: 'Perlu tindakan', statuses: ['DIAJUKAN', 'JAWABAN_DITERIMA', 'PERLU_KONTAK', 'DITOLAK_PESERTA', 'TIDAK_DIJAWAB'], hint: 'Siapkan pertanyaan atau tinjau hasil' },
  { id: 'persiapan', label: 'Perlu persiapan', statuses: ['DIAJUKAN'], hint: 'Klaim baru: periksa pemetaan dan terbitkan pertanyaan' },
  { id: 'menunggu', label: 'Menunggu peserta', statuses: ['MENUNGGU_PESERTA'], hint: 'Pertanyaan sudah terbit' },
  { id: 'tinjau', label: 'Siap ditinjau', statuses: ['JAWABAN_DITERIMA', 'PERLU_KONTAK', 'DITOLAK_PESERTA', 'TIDAK_DIJAWAB'], hint: 'Jawaban masuk atau proses peserta berakhir' },
  { id: 'selesai', label: 'Selesai', statuses: ['SELESAI'], hint: 'Sudah diputuskan' },
  { id: 'semua', label: 'Semua', statuses: [], hint: '' },
];

export function ClaimQueue() {
  const db = useDb();
  const [group, setGroup] = usePref('verifier-queue', 'aksi');
  const [q, setQ] = useState('');
  const active = GROUPS.find((g) => g.id === group) ?? GROUPS[0];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.claims
      .filter((c) => active.statuses.length === 0 || active.statuses.includes(c.status))
      .map((c) => {
        const participant = db.participants.find((p) => p.id === c.participantId)!;
        const facility = db.facilities.find((f) => f.id === c.facilityId)!;
        const maps = db.mappings.filter((m) => m.claimId === c.id && m.target.kind === 'PROSEDUR');
        const evidence = c.status === 'DIAJUKAN' ? null : claimEvidence(db, c);
        return { c, participant, facility, mapped: maps.filter((m) => m.status === 'TERPETAKAN').length, lines: maps.length, evidence };
      })
      .filter(({ c, participant }) => !needle || c.id.toLowerCase().includes(needle) || c.sepNumber.toLowerCase().includes(needle) || participant.name.toLowerCase().includes(needle) || c.diagnosis.code.toLowerCase().includes(needle))
      .sort((a, b) => {
        // TINGGI fraud level first (every denial reaches it), then the highest indication, then the oldest waiting claim.
        const pa = a.evidence?.result?.priority ? 0 : 1;
        const pb = b.evidence?.result?.priority ? 0 : 1;
        if (pa !== pb && group !== 'selesai') return pa - pb;
        const ia = a.evidence?.result ? a.evidence.scores.indication : 0;
        const ib = b.evidence?.result ? b.evidence.scores.indication : 0;
        if (ia !== ib && group !== 'selesai') return ib - ia;
        return group === 'selesai' || group === 'semua' ? b.c.submittedAt.localeCompare(a.c.submittedAt) : a.c.submittedAt.localeCompare(b.c.submittedAt);
      });
  }, [db, active, q, group]);

  const count = (statuses: ClaimStatus[]) => (statuses.length ? db.claims.filter((c) => statuses.includes(c.status)).length : db.claims.length);

  return (
    <>
      <PageHeader title="Klaim masuk" subtitle="Semua klaim dari faskes, dengan pemetaan kamus dan jawaban peserta di satu tempat." />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={group === g.id}
            onClick={() => setGroup(g.id)}
            title={g.hint}
            className={cx('rounded-lg border px-3 py-2 text-left', group === g.id ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600' : 'border-slate-200 bg-white hover:bg-slate-50')}
          >
            <div className="text-xs text-slate-500">{g.label}</div>
            <div className="tabular text-xl font-semibold text-slate-900">{count(g.statuses)}</div>
          </button>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs text-slate-500">{active.hint}</span>
          <input className={cx(inputCls, 'w-64 py-1')} placeholder="Cari klaim, SEP, peserta, ICD-10" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari klaim" />
        </div>
        {rows.length === 0 ? (
          <div className="p-4">
            <Empty icon={Inbox} title="Tidak ada klaim di kelompok ini">
              Klaim baru dari faskes muncul di <b>Perlu persiapan</b> segera setelah diajukan.
            </Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Klaim / SEP</th>
                  <th className={th}>Peserta</th>
                  <th className={th}>Faskes</th>
                  <th className={th}>Diagnosis</th>
                  <th className={th}>Tindakan terpetakan</th>
                  <th className={th}>Hasil sesi peserta</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ c, participant, facility, mapped, lines, evidence }) => (
                  <ClaimRow key={c.id} c={c} name={participant.name} facility={facility.name} mapped={mapped} lines={lines} evidence={evidence} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ClaimRow({ c, name, facility, mapped, lines, evidence }: { c: Claim; name: string; facility: string; mapped: number; lines: number; evidence: ReturnType<typeof claimEvidence> }) {
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/verifikator/klaim/${c.id}`)}>
      <td className={td}>
        <a href={href(`/verifikator/klaim/${c.id}`)} className="font-mono text-xs font-medium text-emerald-800 underline" onClick={(e) => e.stopPropagation()}>
          {c.id}
        </a>
        <div className="font-mono text-[11px] text-slate-500">{c.sepNumber}</div>
      </td>
      <td className={td}>{name}</td>
      <td className={cx(td, 'text-xs')}>
        {facility}
        <div className="text-slate-500">
          {formatDate(c.admissionDate)} – {formatDate(c.dischargeDate)}
        </div>
      </td>
      <td className={cx(td, 'text-xs')}>
        <span className="font-mono">{c.diagnosis.code}</span> {c.diagnosis.name}
      </td>
      <td className={cx(td, 'text-xs')}>
        {lines === 0 ? (
          <span className="text-slate-400">tanpa tindakan</span>
        ) : (
          <Badge tone={mapped === lines ? 'good' : mapped === 0 ? 'bad' : 'warn'}>
            {mapped}/{lines} tindakan
          </Badge>
        )}
      </td>
      <td className={td}>
        {evidence?.result && evidence.session ? (
          <span className="flex flex-wrap gap-1">
            <EvidenceBadge status={evidence.result.status} denied={evidence.denied} />
            <FraudLevelBadge value={evidence.scores.indication} level={evidence.scores.level} />
          </span>
        ) : evidence?.session?.status === 'BERLANGSUNG' ? (
          <span className="text-xs text-sky-700">sedang menjawab ({evidence.scores.answered})</span>
        ) : (
          <span className="text-xs text-slate-400">–</span>
        )}
      </td>
      <td className={td}>
        <ClaimStatusBadge status={c.status} />
        <div className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(c.statusUpdatedAt)}</div>
      </td>
    </tr>
  );
}
