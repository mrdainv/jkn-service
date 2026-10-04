import React from 'react';
import type { Claim } from '../../types';
import { ArrowRight } from 'lucide-react';


interface ClaimListTabProps {
  claim: Claim;
  onProceedToPreparation: () => void;
  onSelectClaim: (claimId: string) => void;
  allClaims: Claim[];
}

export const ClaimListTab: React.FC<ClaimListTabProps> = ({
  claim,
  onProceedToPreparation,
  onSelectClaim,
  allClaims,
}) => {
  return (
    <div className="space-y-6">
      {/* Scenario quick switch bar for presentation */}
      <div className="bg-slate-100/80 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Pilih Demo Klaim:</span>
          <div className="flex flex-wrap gap-2">
            {allClaims.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectClaim(c.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  c.id === claim.id
                    ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {c.id} ({c.samplingReason.split(' ')[1] || 'Klaim'})
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500 italic">
          * Seluruh data pasien & rumah sakit fiktif untuk simulasi Healthkathon BPJS
        </div>
      </div>

      {/* Main Claim Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Klaim {claim.id}
          </h1>
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
              claim.status === 'Disetujui'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : claim.status === 'Eskalasi PK-JKN'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {claim.status}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Klaim rawat inap tingkat lanjut diterima dari {claim.hospitalName}.{' '}
          {claim.result ? 'Sudah memiliki data respons verifikasi.' : 'Belum ada penilaian apa pun.'}
        </p>
      </div>

      {/* 4 Summary Cards - Matching Slide 8 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Peserta */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Peserta</div>
          <div className="font-bold text-slate-900 text-base">
            {claim.patient.maskedName}, {claim.patient.age} th
          </div>
          <div className="text-xs text-slate-500 mt-1">
            No. kartu <span className="font-mono text-slate-700">{claim.patient.cardNumber}</span>
          </div>
        </div>

        {/* Card 2: Tanggal masuk - pulang */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Tanggal masuk – pulang</div>
          <div className="font-bold text-slate-900 text-base">
            {claim.admissionDate.split('-').slice(1).join('/')} – {claim.dischargeDate.split('-').slice(1).join('/')} ({claim.losDays} hari)
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Kelas rawat <span className="font-semibold text-slate-700">{claim.careClass}</span>
          </div>
        </div>

        {/* Card 3: Diagnosis utama */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Diagnosis utama</div>
          <div className="font-bold text-slate-900 text-base flex items-baseline gap-1.5 truncate">
            <span className="text-emerald-700 font-mono text-sm">{claim.primaryDiagnosisCode}</span>
            <span className="truncate">{claim.primaryDiagnosisName}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Grup tarif <span className="font-semibold text-slate-700">{claim.tariffGroup}</span>
          </div>
        </div>

        {/* Card 4: Alasan masuk verifikasi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Alasan masuk verifikasi</div>
          <div className="font-bold text-slate-900 text-base">{claim.samplingReason}</div>
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">
            {claim.samplingNote}
          </div>
        </div>
      </div>

      {/* Claim Items Table (Sumber 1) - Matching Slide 8 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Isi klaim (Sumber 1)</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Sumber 1 • dokumen rumah sakit
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kode ICD-10 / ICD-9-CM nyata; seluruh data pasien & RS fiktif.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">Total Biaya Klaim:</span>
            <div className="font-mono font-bold text-emerald-800 text-lg">
              Rp {claim.claimAmount.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Kode</th>
                <th className="py-3 px-6">Uraian dalam klaim</th>
                <th className="py-3 px-6">Jenis</th>
                <th className="py-3 px-6">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {claim.claimItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-6 font-mono text-xs font-semibold">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {item.code}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 font-medium text-slate-900">
                    {item.description}
                  </td>
                  <td className="py-3.5 px-6 text-xs text-slate-600">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 font-medium text-slate-900">
                    {item.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Bottom Bar */}
        <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Klaim ini siap dianalisis oleh AI Planner untuk memetakan fakta menjadi pertanyaan peserta.
          </div>
          <button
            onClick={onProceedToPreparation}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-sm shadow-sm transition-all"
          >
            <span>Siapkan verifikasi peserta</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
