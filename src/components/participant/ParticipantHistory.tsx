import { FileCheck2 } from 'lucide-react';
import { useDb } from '../../application/context';
import { answersOf } from '../../domain/queries';
import { formatDateTime, formatPeriod } from '../../lib/format';
import { href } from '../../lib/router';

export function ParticipantHistory({ participantId }: { participantId: string }) {
  const db = useDb();
  const sessions = db.sessions.filter((s) => s.participantId === participantId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <p className="mt-2">Belum ada jawaban yang Anda kirim.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-4">
      <h1 className="text-base font-semibold text-slate-900">Riwayat jawaban</h1>
      <ul className="space-y-2">
        {sessions.map((s) => {
          const claim = db.claims.find((c) => c.id === s.claimId)!;
          const facility = db.facilities.find((f) => f.id === claim.facilityId)!;
          const count = answersOf(db, s.id).filter((a) => a.status === 'DIJAWAB').length;
          return (
            <li key={s.id}>
              <a href={href(`/peserta/klaim/${claim.id}`)} className="block rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-sm font-medium text-slate-900">{facility.name}</div>
                <div className="text-xs text-slate-600">{formatPeriod(claim.admissionDate)} · {count} jawaban</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Terkirim {formatDateTime(s.submittedAt)} · tanda terima <span className="font-mono">{s.id}</span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
