import { ArrowLeft } from 'lucide-react';
import { useDb } from '../../application/context';
import { CARE_CLASS_LABEL, CARE_TYPE_LABEL, PROVIDER_STATUS_LABEL } from '../../domain/labels';
import { findClaim, getParticipant, getPractitioner } from '../../domain/queries';
import { formatDate, formatDateTime, formatRupiah } from '../../lib/format';
import { href, useRoute } from '../../lib/router';
import { ClaimStatusBadge } from '../status';
import { Card, Empty, KeyValue, Notice, PageHeader } from '../ui';
import { td, th } from '../styles';

export function ProviderClaimDetail({ claimId, facilityId }: { claimId: string; facilityId: string }) {
  const db = useDb();
  useRoute();
  const isNew = typeof window !== 'undefined' && window.location.hash.includes('baru=1');
  const claim = findClaim(db, claimId);
  if (!claim || claim.facilityId !== facilityId) {
    return (
      <Empty title="Klaim tidak ditemukan">
        Klaim {claimId} bukan milik faskes ini. <a className="underline" href={href('/faskes')}>Kembali ke daftar</a>
      </Empty>
    );
  }
  const participant = getParticipant(db, claim.participantId);
  const doctor = getPractitioner(db, claim.practitionerId);
  // The facility sees workflow stages only; consecutive internal states that look the same are merged.
  const timeline = db.statusHistory
    .filter((s) => s.claimId === claim.id)
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter((s, i, all) => i === 0 || PROVIDER_STATUS_LABEL[s.to] !== PROVIDER_STATUS_LABEL[all[i - 1].to]);

  return (
    <>
      <PageHeader
        crumbs={
          <a href={href('/faskes')} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Daftar klaim
          </a>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            Klaim <span className="font-mono">{claim.id}</span> <ClaimStatusBadge status={claim.status} view="provider" />
          </span>
        }
        subtitle={`SEP ${claim.sepNumber} · diajukan ${formatDateTime(claim.submittedAt)}`}
      />
      {isNew && (
        <Notice kind="success" className="mb-4" title="Klaim berhasil diajukan">
          Klaim tersimpan dan sudah masuk ke antrean verifikator BPJS. Status di halaman ini diperbarui otomatis.
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Data klaim" className="lg:col-span-2">
          <KeyValue
            items={[
              ['Peserta', `${participant.name} · ${participant.cardNumber}`],
              ['DPJP', doctor.name],
              ['Jenis / kelas rawat', `${CARE_TYPE_LABEL[claim.careType]} · ${CARE_CLASS_LABEL[claim.careClass]}`],
              ['Tanggal', `${formatDate(claim.admissionDate)} – ${formatDate(claim.dischargeDate)}`],
              ['Diagnosis utama', `${claim.diagnosis.code} · ${claim.diagnosis.name}`],
              ['Diagnosis sekunder', claim.secondaryDiagnoses.length ? claim.secondaryDiagnoses.map((d) => `${d.code} ${d.name}`).join('; ') : '–'],
              ['INA-CBG', `${claim.inaCbg.code} · ${formatRupiah(claim.inaCbg.tariff)}`],
              ['Tarif rumah sakit', formatRupiah(claim.hospitalCharge)],
            ]}
          />
          <table className="mt-4 w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Kode</th>
                <th className={th}>Tindakan</th>
                <th className={th}>Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claim.procedures.map((p) => (
                <tr key={p.lineId}>
                  <td className={`${td} font-mono text-xs`}>{p.code}</td>
                  <td className={td}>{p.name}</td>
                  <td className={`${td} tabular`}>{p.quantity}</td>
                </tr>
              ))}
              {claim.procedures.length === 0 && (
                <tr>
                  <td className={td} colSpan={3}>
                    Tanpa tindakan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Riwayat status">
          <ol className="space-y-3">
            {timeline.map((s) => (
              <li key={s.id} className="border-l-2 border-emerald-200 pl-3">
                <div className="text-sm font-medium text-slate-900">{PROVIDER_STATUS_LABEL[s.to]}</div>
                <div className="text-xs text-slate-500">{formatDateTime(s.at)}</div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Selama simulasi, verifikator dapat menanyai peserta tentang layanan yang dialami. Jawaban peserta dan hasil verifikasi tidak dikirim ke faskes.
          </p>
        </Card>
      </div>
    </>
  );
}
