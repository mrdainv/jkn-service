import React from 'react';
import { X, BookOpen, Scale, Brain, Shield, ExternalLink, Calculator } from 'lucide-react';

interface MethodologyModalProps {
  onClose: () => void;
}

export const MethodologyModal: React.FC<MethodologyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Landasan Riset, Matematika & Regulasi JKN Service
              </h2>
              <p className="text-xs text-slate-500">
                Healthkathon 2026 BPJS Kesehatan • Efisiensi Risiko JKN
              </p>
            </div>

          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-sm text-slate-700 leading-relaxed">
          {/* Section 1: Validitas Pasien sebagai Saksi Independen */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
              <Scale className="w-4 h-4 text-emerald-700" />
              <span>1. Validitas Daya Ingat Pasien (Zuvekas & Olin, 2009)</span>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Riset <em>Health Services Research</em> yang membandingkan laporan rumah tangga pasien dengan klaim resmi Medicare (AS) membuktikan:
            </p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                <div className="text-xl font-bold text-emerald-800 font-mono">κ = 0.89</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Kesesuaian rawat inap (Hampir Sempurna)
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                <div className="text-xl font-bold text-emerald-800 font-mono">κ = 0.88</div>
                <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Kesesuaian jumlah malam menginap (LOS)
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Kesimpulan: Hal yang menonjol dan sensorik (menginap, oksigen, rontgen, operasi) terekam sangat akurat. Pasien <strong>tidak pernah ditanya</strong> hal teknis (diagnosis ICD, molekul obat infus).
            </p>
          </div>

          {/* Section 2: Mengapa Bukan LLM yang Mengarang Pertanyaan (MediQ NeurIPS 2024) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
              <Brain className="w-4 h-4 text-teal-700" />
              <span>2. Arsitektur Pertanyaan Terkunci (MediQ, NeurIPS 2024)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Penelitian <em>MediQ (NeurIPS 2024)</em> menemukan bahwa jika Large Language Model (LLM) dibiarkan langsung merumuskan dan menanyakan kalimat klinis secara bebas tanpa batasan, penalaran klinis justru menurun dan timbul risiko halusinasi.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Oleh karena itu, <strong>JKN Service menggunakan pendekatan hybrid</strong>: AI bertindak sebagai Planner di balik layar yang memilih templat baku tervalidasi klinis dan mengoptimalkan <em>Information Gain</em>, sementara kalimat yang diterima pasien 100% terkunci.
            </p>

          </div>

          {/* Section 3: Rumus Bayesian Evidence & Rasio Bukti */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
              <Calculator className="w-4 h-4 text-indigo-700" />
              <span>3. Penimbangan Bukti Bayesian & Rasio Kemungkinan (Likelihood Ratio)</span>
            </div>
            <p className="text-xs text-slate-600">
              Setiap jawaban pasien ditimbang sebagai bukti independen terhadap hipotesis keabsahan klaim:
            </p>
            <div className="bg-slate-900 text-emerald-300 font-mono text-xs p-3 rounded-lg my-2 overflow-x-auto">
              Odds(Post) = Odds(Prior) × ∏ Likelihood_Ratio(i)
              <br />
              LR(i) = P(Jawaban Pasien | Klaim Sah) / P(Jawaban Pasien | Klaim Tidak Sah)
            </div>
            <p className="text-xs text-slate-600">
              Jika pasien mengonfirmasi tindakan nyata (oksigen, rontgen), LR naik (3.9x – 8.2x). Namun jika terjadi kontradiksi material (klaim 4 hari namun pasien ingat 1 malam), LR turun tajam (0.13x) sehingga memicu tinjauan verifikator manusia.
            </p>
          </div>

          {/* Section 4: Regulasi UU PDP & Permenkes 16/2019 */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
              <Shield className="w-4 h-4 text-emerald-700" />
              <span>4. Kepatuhan Regulasi & Privasi Pasien</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>
                <strong>UU No. 27 Tahun 2022 (Pelindungan Data Pribadi):</strong> Prinsip pseudonimisasi data, enkripsi end-to-end, dan zero raw facial image storage.
              </li>
              <li>
                <strong>Permenkes No. 16 Tahun 2019:</strong> Pencegahan dan penanganan kecurangan (fraud) serta pengenaan sanksi administrasi terhadap fasilitas kesehatan.
              </li>
              <li>
                <strong>Etika Human-in-the-Loop:</strong> Skor AI adalah sinyal penimbang bukti, bukan vonis penolakan otomatis.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
