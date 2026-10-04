import React from 'react';
import type { Claim } from '../../types';
import { Smartphone, Sparkles, ArrowRight } from 'lucide-react';


interface PreparationTabProps {
  claim: Claim;
  onOpenMobileJkn: () => void;
  onGoToReview: () => void;
}

export const PreparationTab: React.FC<PreparationTabProps> = ({
  claim,
  onOpenMobileJkn,
  onGoToReview,
}) => {
  return (
    <div className="space-y-6">
      {/* Title & Subtitle */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Persiapan verifikasi • {claim.id}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Klaim diubah menjadi pengalaman yang dapat dirasakan dan diingat peserta. Diagnosis tidak ditanyakan.
        </p>
      </div>

      {/* 4 Summary Cards - Matching Slide 8 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Penjawab */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Penjawab</div>
          <div className="font-bold text-slate-900 text-base flex items-center gap-1.5">
            <span>{claim.isCompanionAnswer ? 'Pendamping' : 'Peserta sendiri'}</span>
            <span className="text-xs font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              • cek wajah
            </span>
          </div>
        </div>

        {/* Card 2: Jeda sejak pulang */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Jeda sejak pulang</div>
          <div className="font-bold text-slate-900 text-base">
            {claim.daysSinceDischarge} hari
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {claim.daysSinceDischarge <= 30 ? 'Optimal (daya ingat valid)' : 'Melebihi jendela ingatan (30 hari)'}
          </div>
        </div>

        {/* Card 3: Kanal */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Kanal</div>
          <div className="font-bold text-slate-900 text-base flex items-center gap-1.5">
            <span>Mobile JKN</span>
            <span className="text-xs font-normal text-slate-500">• telepon 165</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Push notifikasi interaktif</div>
        </div>

        {/* Card 4: Rencana */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-400 mb-1">Rencana</div>
          <div className="font-bold text-slate-900 text-base">
            ≤ 5 tanya • {claim.distractors.length} pengecoh
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Maks. beban waktu ±2 menit
          </div>
        </div>
      </div>

      {/* Main Table: Fakta klaim -> Pengalaman peserta */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Fakta klaim → pengalaman peserta
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nilai informasi = perkiraan pengurangan ketidakpastian (bit), model demo
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>AI Information Gain Planner</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Fakta klaim</th>
                <th className="py-3 px-6">Dapat diamati?</th>
                <th className="py-3 px-6">Bahasa peserta (dari bank templat)</th>
                <th className="py-3 px-6">Nilai informasi</th>
                <th className="py-3 px-6">Keputusan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {claim.claimItems.map((item) => {
                // Percentage width for information gain bar (max bit ~ 0.25)
                const percent = Math.min(100, Math.round((item.informationGainBits / 0.25) * 100));

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Fakta Klaim */}
                    <td className="py-3.5 px-6 font-medium text-slate-900">
                      <div>{item.description}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{item.code !== '-' ? item.code : item.category}</div>
                    </td>

                    {/* Dapat diamati */}
                    <td className="py-3.5 px-6 text-xs text-slate-600">
                      {item.observability !== 'Di luar cakupan' ? (
                        <span className="font-medium text-slate-700">{item.observability}</span>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>

                    {/* Bahasa Peserta */}
                    <td className="py-3.5 px-6 text-sm">
                      {item.decision.includes('Ditanya') || item.decision === 'Dilewati' ? (
                        <span className="text-emerald-800 font-medium">
                          “{item.patientLanguage}”
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-xs">
                          {item.patientLanguage}
                        </span>
                      )}
                    </td>

                    {/* Nilai Informasi */}
                    <td className="py-3.5 px-6">
                      {item.informationGainBits > 0 ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-medium text-slate-700">
                            {item.informationGainBits.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">–</span>
                      )}
                    </td>

                    {/* Keputusan Badge */}
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          item.decision === 'Ditanya : jangkar'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : item.decision === 'Ditanya'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : item.decision === 'Dilewati'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : item.decision === 'Tak dapat ditanya'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {item.decision}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="p-5 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
          <p className="font-medium text-slate-700 mb-1">
            Pertanyaan diambil dari bank templat yang sudah ditinjau klinisi dan diuji keterbacaan.
          </p>
          <p className="text-slate-500">
            Saat berjalan, AI hanya mengisi slot (nama RS, tanggal) — <strong>tidak mengarang kalimat medis baru bebas</strong> untuk menghindari risiko halusinasi atau kebingungan pasien (MediQ, NeurIPS 2024).
          </p>
        </div>
      </div>

      {/* Next Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-emerald-950 text-sm">
              Alur Verifikasi Telah Disusun oleh AI
            </div>
            <div className="text-xs text-emerald-800">
              Anda dapat menguji respons langsung di simulator Mobile JKN atau melihat antrean tinjauan.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={onOpenMobileJkn}
            className="flex-1 sm:flex-none px-4 py-2 bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Smartphone className="w-4 h-4" />
            <span>Buka di Mobile JKN</span>
          </button>

          <button
            onClick={onGoToReview}
            className="flex-1 sm:flex-none px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>Hasil & Antrean Tinjauan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
