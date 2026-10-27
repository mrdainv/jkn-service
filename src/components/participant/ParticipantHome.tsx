import { ChevronRight, ClipboardList, ShieldCheck } from 'lucide-react';
import { useDb } from '../../application/context';
import { CARE_TYPE_LABEL } from '../../domain/labels';
import { currentAssignment } from '../../domain/queries';
import type { Participant } from '../../domain/types';
import { formatPeriod } from '../../lib/format';
import { href } from '../../lib/router';
import { ClaimStatusBadge } from '../status';

export function ParticipantHome({ participant }: { participant: Participant }) {
  const db = useDb();
  const claims = db.claims.filter((c) => c.participantId === participant.id).sort((a, b) => b.admissionDate.localeCompare(a.admissionDate));
  const pending = claims.filter((c) => currentAssignment(db, c.id)?.status === 'AKTIF');
  const facilityName = (id: string) => db.facilities.find((f) => f.id === id)?.name ?? 'Rumah sakit';
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Halo, {participant.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-600">Bantu kami memastikan layanan yang Anda terima tercatat dengan benar.</p>
      </div>
      {pending.length > 0 ? (
        <section aria-labelledby="perlu-konfirmasi">
          <h2 id="perlu-konfirmasi" className="mb-2 text-sm font-semibold text-slate-900">
            Perlu konfirmasi Anda
          </h2>
          <ul className="space-y-2">
            {pending.map((c) => {
              const a = currentAssignment(db, c.id)!;
              return (
                <li key={c.id}>
                  <a href={href(`/peserta/klaim/${c.id}`)} className="flex items-center gap-3 rounded-xl border-2 border-emerald-600 bg-white p-3 shadow-sm">
                    <ClipboardList className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{facilityName(c.facilityId)}</span>
                      <span className="block text-xs text-slate-600">
                        {CARE_TYPE_LABEL[c.careType]}, {formatPeriod(c.admissionDate)} · {a.items.length} pertanyaan singkat
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Tidak ada konfirmasi yang menunggu. Kami akan memberi tahu Anda lewat notifikasi.</div>
      )}
      <section aria-labelledby="layanan-anda">
        <h2 id="layanan-anda" className="mb-2 text-sm font-semibold text-slate-900">
          Layanan Anda
        </h2>
        {claims.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada layanan yang tercatat.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {claims.map((c) => (
              <li key={c.id}>
                <a href={href(`/peserta/klaim/${c.id}`)} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span>
                    <span className="block text-sm text-slate-900">{facilityName(c.facilityId)}</span>
                    <span className="block text-xs text-slate-500">
                      {CARE_TYPE_LABEL[c.careType]}, {formatPeriod(c.admissionDate)}
                    </span>
                  </span>
                  <ClaimStatusBadge status={c.status} view="participant" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
          <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
          Kenapa saya ditanya?
        </summary>
        <p className="mt-2 text-slate-600">
          BPJS Kesehatan bertanya kepada sebagian peserta tentang layanan yang mereka alami. Menjawab bersifat sukarela, tidak mengubah hak layanan Anda, dan jawaban tidak dikirim ke rumah sakit.
        </p>
      </details>
    </div>
  );
}
