import React, { useState } from 'react';
import type { Claim, ClaimItem } from '../../types';
import { generateAdaptiveVerificationPlan } from '../../services/plannerEngine';
import { X, Sparkles } from 'lucide-react';


interface NewClaimModalProps {
  onClose: () => void;
  onAddClaim: (newClaim: Claim) => void;
}

export const NewClaimModal: React.FC<NewClaimModalProps> = ({ onClose, onAddClaim }) => {
  const [hospitalName, setHospitalName] = useState('RS Permata Medika (fiktif)');
  const [patientName, setPatientName] = useState('Dewi Sartika');
  const [age, setAge] = useState(45);
  const [losDays, setLosDays] = useState(3);
  const [diagCode, setDiagCode] = useState('I20.0');
  const [diagName, setDiagName] = useState('Angina Pektoris Tidak Stabil');
  const [claimAmount, setClaimAmount] = useState(7800000);
  const [includeOxygen, setIncludeOxygen] = useState(true);
  const [includeEcg, setIncludeEcg] = useState(true);
  const [samplingReason, setSamplingReason] = useState<Claim['samplingReason']>('Sampel acak harian');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const claimId = `KLM-DEMO-${Math.floor(1000 + Math.random() * 9000)}`;
    const masked = patientName.slice(0, 1) + '*** ' + (patientName.split(' ')[1] ? patientName.split(' ')[1].slice(0, 1) + '****' : '*****');

    // Build claim items
    const claimItems: ClaimItem[] = [
      {
        id: 'ci-stay',
        code: 'ADM-STAY',
        description: `Rawat inap ${losDays} hari`,
        category: 'Administratif',
        quantity: `${losDays} hari`,
        observability: 'Tinggi',
        patientLanguage: `menginap di ${hospitalName}`,
        informationGainBits: 0.20,
        decision: 'Ditanya : jangkar',
        reason: 'Jangkar validasi utama rawat inap.',
      },
      {
        id: 'ci-los',
        code: 'LOS',
        description: 'Lama rawat inap',
        category: 'Administratif',
        quantity: `${losDays} hari`,
        observability: 'Tinggi',
        patientLanguage: 'berapa malam Anda menginap',
        informationGainBits: 0.15,
        decision: 'Ditanya',
        reason: 'Memastikan durasi menginap nyata tidak dipanjangkan (prolonged stay).',
      },
    ];

    if (includeOxygen) {
      claimItems.push({
        id: 'ci-o2',
        code: '93.96',
        description: 'Pemberian oksigen',
        category: 'Tindakan',
        quantity: `${losDays} hari`,
        observability: 'Tinggi',
        patientLanguage: 'selang kecil di hidung atau masker oksigen',
        informationGainBits: 0.10,
        decision: 'Ditanya',
        reason: 'Sensasi aliran oksigen di hidung mudah diingat.',
      });
    }

    if (includeEcg) {
      claimItems.push({
        id: 'ci-ecg',
        code: '89.52',
        description: 'Pemeriksaan Elektrokardiogram (EKG)',
        category: 'Penunjang',
        quantity: '2 kali',
        observability: 'Tinggi',
        patientLanguage: 'dada dipasang kabel/stiker rekam jantung',
        informationGainBits: 0.12,
        decision: 'Ditanya',
        reason: 'Pemasangan elektroda rekam jantung di dada sangat spesifik.',
      });
    }

    claimItems.push({
      id: 'ci-infus',
      code: '-',
      description: 'Infus cairan Ringer Lactate',
      category: 'Alkes / BMHP',
      quantity: `${losDays} kolf`,
      observability: 'Tinggi',
      patientLanguage: 'diinfus',
      informationGainBits: 0.02,
      decision: 'Dilewati',
      reason: 'Hampir semua pasien diinfus, nilai diferensiasi rendah.',
    });

    const newClaim: Claim = {
      id: claimId,
      hospitalName,
      hospitalCode: `RS-NEW-${Math.floor(100 + Math.random() * 900)}`,
      patient: {
        name: patientName,
        maskedName: masked,
        age,
        cardNumber: `0000-NEW-${Math.floor(1000 + Math.random() * 9000)}`,
        nikMasked: '3201********0009',
        phone: '0812-****-8812',
        avatarSeed: patientName.toLowerCase().replace(/\s/g, ''),
      },
      admissionDate: '2026-09-01',
      dischargeDate: `2026-09-0${Math.min(9, 1 + losDays)}`,
      daysSinceDischarge: 12,
      losDays,
      careClass: 'Kelas 2',
      primaryDiagnosisCode: diagCode,
      primaryDiagnosisName: diagName,
      tariffGroup: 'INA-CBG Jantung & Vaskular',
      claimAmount,
      samplingReason,
      samplingNote: 'Klaim baru ditambahkan via Sandbox Simulator Healthkathon',
      status: 'Siap Verifikasi',
      claimItems,
      questions: [],
      distractors: ['Operasi Bedah Terbuka', 'Cuci Darah'],
      faceVerificationPassed: false,
    };

    // Generate questions using AI Planner
    newClaim.questions = generateAdaptiveVerificationPlan(newClaim);

    onAddClaim(newClaim);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-scaleIn">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Tambah Klaim Baru (Sandbox AI Planner)
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Rumah Sakit Pengaju
            </label>
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Nama Pasien
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Usia Pasien
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Lama Rawat (LOS)
              </label>
              <input
                type="number"
                min="1"
                max="14"
                value={losDays}
                onChange={(e) => setLosDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Besaran Klaim (Rp)
              </label>
              <input
                type="number"
                step="50000"
                value={claimAmount}
                onChange={(e) => setClaimAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Diagnosis Utama (ICD-10)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={diagCode}
                onChange={(e) => setDiagCode(e.target.value)}
                placeholder="Kode ICD-10"
                className="w-24 px-3 py-2 font-mono border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
              <input
                type="text"
                value={diagName}
                onChange={(e) => setDiagName(e.target.value)}
                placeholder="Nama Diagnosis"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1.5">
              Tindakan Tambahan dalam Klaim:
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOxygen}
                  onChange={(e) => setIncludeOxygen(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Pemberian Oksigen (93.96)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEcg}
                  onChange={(e) => setIncludeEcg(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Pemeriksaan EKG (89.52)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Alasan Pengambilan Sampel
            </label>
            <select
              value={samplingReason}
              onChange={(e) => setSamplingReason(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="Sampel acak harian">Sampel acak harian</option>
              <option value="Sampel anomali LOS">Sampel anomali LOS (Prolonged Stay)</option>
              <option value="Sampel anomali Phantom Billing">Sampel anomali Phantom Billing</option>
              <option value="Sampel anomali Frekuensi Tindakan">Sampel anomali Frekuensi Tindakan</option>
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Susun Rencana & Simpan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
