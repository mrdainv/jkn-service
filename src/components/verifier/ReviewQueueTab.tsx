import React, { useState } from 'react';
import type { Claim, FactStatus } from '../../types';
import { 
  CheckCircle2, 
  ShieldCheck, 
  FileSearch, 
  Clock, 
  AlertOctagon,
} from 'lucide-react';
import confetti from 'canvas-confetti';


interface ReviewQueueTabProps {
  claim: Claim;
  onUpdateClaimStatus: (status: Claim['status'], decision: 'minta_resume' | 'setujui' | 'eskalasi_pk_jkn', notes?: string) => void;
}

export const ReviewQueueTab: React.FC<ReviewQueueTabProps> = ({
  claim,
  onUpdateClaimStatus,
}) => {
  const result = claim.result;
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3 animate-spin" />
        <h3 className="text-lg font-bold text-slate-800">Menunggu Jawaban Peserta</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
          Peserta belum menyelesaikan verifikasi di Mobile JKN. Silakan buka simulator Mobile JKN untuk mengisi jawaban.
        </p>
      </div>
    );
  }

  const handleAction = (decision: 'minta_resume' | 'setujui' | 'eskalasi_pk_jkn') => {
    let newStatus: Claim['status'] = 'Perlu Tinjauan';
    let message = '';

    if (decision === 'setujui') {
      newStatus = 'Disetujui';
      message = 'Klaim telah disetujui untuk diteruskan ke pembayaran INA-CBG.';
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    } else if (decision === 'minta_resume') {
      newStatus = 'Perlu Tinjauan';
      message = 'Notifikasi permintaan berkas rekam medis & klarifikasi bangsal telah dikirim ke Rumah Sakit.';
    } else if (decision === 'eskalasi_pk_jkn') {
      newStatus = 'Eskalasi PK-JKN';
      message = 'Klaim resmi dilaporkan ke Tim Pencegahan Kecurangan JKN (Permenkes 16/2019) untuk audit investigasi.';
    }

    onUpdateClaimStatus(newStatus, decision, message);
    setActionSuccess(message);
    setTimeout(() => setActionSuccess(null), 5000);
  };

  const getStatusBadge = (status: FactStatus) => {
    switch (status) {
      case 'Sesuai':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Sesuai
          </span>
        );
      case 'Bertentangan':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            Bertentangan
          </span>
        );
      case 'Gugur':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Gugur
          </span>
        );
      case 'Lolos':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Lolos
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-500">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Recommendation - Matching Slide 10 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hasil verifikasi • {claim.id}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Bukan penetapan kecurangan • Penjawab:{' '}
            <strong className="text-slate-800 font-semibold">
              {claim.isCompanionAnswer ? 'pendamping pasien' : 'peserta sendiri'}
            </strong>
            , wajah cocok (FRISTA {claim.faceMatchScore ? `${claim.faceMatchScore}%` : 'terverifikasi'})
          </p>
        </div>

        {/* Top Recommendation Badge */}
        <div>
          <span
            className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold shadow-xs border ${
              result.recommendation === 'Prioritas Tinggi: Dugaan Fraud Kritis'
                ? 'bg-rose-100 text-rose-900 border-rose-300 animate-pulse'
                : result.recommendation === 'Tinjauan manusia direkomendasikan'
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}
          >
            {result.recommendation}
          </span>
        </div>
      </div>

      {/* Action Toast Feedback if verifier acted */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 4 Dimension Score Cards - Matching Slide 10 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dimension 1: Konsistensi klaim */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Konsistensi klaim</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
              {result.consistencyScore}
            </span>
            <span className="text-slate-400 font-medium text-base">/100</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            {result.consistencyRange} • model demo
          </div>
        </div>

        {/* Dimension 2: Cakupan bukti */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Cakupan bukti</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-emerald-800 font-mono">
              {result.evidenceCoverage.answered}/{result.evidenceCoverage.total}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            fakta klaim terjawab
          </div>
        </div>

        {/* Dimension 3: Kontradiksi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Kontradiksi</div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-3xl font-bold tracking-tight font-mono ${
                result.materialContradictions > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {result.materialContradictions}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium truncate">
            {result.contradictionDetail}
          </div>
        </div>

        {/* Dimension 4: Keandalan ingatan */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Keandalan ingatan</div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold tracking-tight ${
                result.recallReliability === 'Tinggi'
                  ? 'text-emerald-800'
                  : result.recallReliability === 'Sedang'
                  ? 'text-amber-800'
                  : 'text-rose-700'
              }`}
            >
              {result.recallReliability}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium truncate">
            {result.reliabilityReason}
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Jejak Bukti Table & Panel Potensi Inkonsistensi */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 Cols): Jejak bukti per fakta */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              Jejak bukti per fakta
            </h3>
            <span className="text-xs text-slate-400">
              Bayesian Evidence Weighing
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Fakta</th>
                  <th className="py-3 px-4">Klaim</th>
                  <th className="py-3 px-4">Jawaban peserta</th>
                  <th className="py-3 px-4 text-center">Rasio bukti</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {result.evidenceTrail.map((ev, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900 text-xs">
                      {ev.factName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                      {ev.claimValue}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800">
                      <span
                        className={
                          ev.status === 'Bertentangan'
                            ? 'text-rose-700 font-bold'
                            : ev.status === 'Sesuai'
                            ? 'text-emerald-800'
                            : 'text-slate-600'
                        }
                      >
                        {ev.patientAnswer}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-xs font-mono font-semibold">
                      {ev.likelihoodRatio !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            ev.ratioDirection === 'up'
                              ? 'text-emerald-700'
                              : ev.ratioDirection === 'down'
                              ? 'text-rose-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {ev.likelihoodRatio.toFixed(1)}
                          {ev.ratioDirection === 'up' && ' ↑'}
                          {ev.ratioDirection === 'down' && ' ↓'}
                        </span>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(ev.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-50/70 border-t border-slate-200 text-[11px] text-slate-500 leading-normal">
            Keputusan lanjutan mengikuti prosedur verifikator dan Tim PK-JKN (Permenkes 16/2019). Skor belum dikalibrasi terhadap data audit nyata.
          </div>
        </div>

        {/* Right Column (5 Cols): Potensi inkonsistensi & Verifier Actions */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card: Potensi Inkonsistensi */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2">
              Potensi Inkonsistensi
            </h3>
            <p className="text-sm font-semibold text-slate-900 leading-snug">
              {result.discrepancyHighlight}
            </p>
            <p className="text-xs text-slate-600 mt-2">
              {result.materialContradictions > 0
                ? 'Peluang lama rawat sesuai klaim turun dari 90% (awal) menjadi 54% — bukti melemahkan, belum membuktikan mutlak.'
                : 'Tidak ditemukan indikasi pergeseran keabsahan klaim.'}
            </p>

            {/* Sub-card: Penjelasan lain yang perlu dicek */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2">
                Penjelasan lain yang perlu dicek
              </h4>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                {result.potentialExplanations.map((exp, i) => (
                  <li key={i} className="leading-relaxed">
                    {exp}
                  </li>
                ))}
              </ul>
            </div>

            {/* Verifier Decisions Action Buttons - Matching Slide 10 */}
            <div className="mt-6 pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Tindakan Verifikator:
              </div>

              <button
                onClick={() => handleAction('minta_resume')}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <FileSearch className="w-4 h-4 text-emerald-400" />
                <span>Minta resume medis & bangsal</span>
              </button>

              <button
                onClick={() => handleAction('setujui')}
                className="w-full py-2 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Tandai sesuai / Setujui klaim</span>
              </button>

              {result.materialContradictions > 0 && (
                <button
                  onClick={() => handleAction('eskalasi_pk_jkn')}
                  className="w-full py-2 px-4 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-xs border border-rose-200 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <AlertOctagon className="w-4 h-4 text-rose-600" />
                  <span>Eskalasi ke Tim PK-JKN</span>
                </button>
              )}
            </div>
          </div>

          {/* Context box: Etika AI & Regulasi */}
          <div className="p-4 rounded-xl bg-slate-100/70 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Sinyal Bukti, Bukan Vonis Otomatis</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Sesuai prinsip etika SELARAS: Sistem tidak pernah menolak klaim secara sepihak. Kontradiksi material selalu dirutekan ke staf verifikator manusia untuk pengecekan dokumen fisik rekam medis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
