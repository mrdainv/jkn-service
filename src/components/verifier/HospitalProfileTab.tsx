import React from 'react';
import type { HospitalRiskProfile } from '../../types';
import { Building2, ShieldCheck, DollarSign, Activity } from 'lucide-react';


interface HospitalProfileTabProps {
  hospitalProfiles: HospitalRiskProfile[];
}

export const HospitalProfileTab: React.FC<HospitalProfileTabProps> = ({ hospitalProfiles }) => {
  const totalPrevented = hospitalProfiles.reduce((acc, curr) => acc + curr.preventedLossRupiah, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Profil Risiko Fasilitas Kesehatan
          </h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            Tim PK-JKN
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Agregasi respons pasien tingkat faskes untuk mendeteksi pola sistemik phantom billing & perpanjangan hari rawat (prolonged stay).
        </p>
      </div>

      {/* Top Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Potensi Dana JKN Diselamatkan</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-800 font-mono">
            Rp {(totalPrevented / 1000000000).toFixed(2)} Miliar
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dari 3 faskes sampel audit pilot
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Tingkat Diskordansi Rata-rata</span>
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            17.3%
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ketidakcocokan klaim RS vs pengakuan pasien
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Efek Gentar (Deterrence)</span>
            <ShieldCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-teal-800">
            Aktif Terpasang
          </div>
          <p className="text-xs text-slate-500 mt-1">
            RS mengetahui verifikasi melibatkan pasien
          </p>
        </div>
      </div>

      {/* Hospital Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Daftar Fasilitas Kesehatan Terpantau
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Dianalisis secara agregat untuk mencegah salah tuduh pada RS jujur
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Nama Faskes</th>
                <th className="py-3 px-6">Tipe & Kota</th>
                <th className="py-3 px-6">Klaim Terverifikasi</th>
                <th className="py-3 px-6">Tingkat Diskordansi</th>
                <th className="py-3 px-6">Anomali Terbanyak</th>
                <th className="py-3 px-6">Tingkat Risiko</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {hospitalProfiles.map((hp) => (
                <tr key={hp.hospitalCode} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{hp.hospitalName}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 block ml-6">
                      {hp.hospitalCode}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <div>{hp.type}</div>
                    <div className="text-slate-400">{hp.city}</div>
                  </td>
                  <td className="py-4 px-6 font-mono text-xs font-semibold text-slate-800">
                    {hp.totalAuditedClaims} klaim
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            hp.discordanceRate > 25
                              ? 'bg-rose-600'
                              : hp.discordanceRate > 10
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                          }`}
                          style={{ width: `${Math.min(100, hp.discordanceRate * 2.5)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {hp.discordanceRate}%
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    {hp.phantomBillingRate > 10 ? (
                      <span className="text-rose-700 font-semibold">
                        Phantom Billing ({hp.phantomBillingRate}%)
                      </span>
                    ) : hp.prolongedStayRate > 5 ? (
                      <span className="text-amber-700 font-medium">
                        Prolonged Stay ({hp.prolongedStayRate}%)
                      </span>
                    ) : (
                      <span className="text-emerald-700">Dalam batas wajar</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        hp.riskLevel === 'Tinggi'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : hp.riskLevel === 'Waspada'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {hp.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
