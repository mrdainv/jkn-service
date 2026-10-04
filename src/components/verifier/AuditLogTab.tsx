import React from 'react';
import type { AuditLogEntry } from '../../types';
import { Lock, UserCheck, KeyRound } from 'lucide-react';


interface AuditLogTabProps {
  logs: AuditLogEntry[];
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ logs }) => {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Audit Trail & Kepatuhan UU PDP
          </h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
            UU No. 27/2022 & Permenkes 16/2019
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Pencatatan jejak audit integritas verifikasi klaim dua sumber dengan prinsip privasi sejak desain (Privacy by Design).
        </p>
      </div>

      {/* 3 Privacy Pillars Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">Pseudonimisasi Data</div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Nama, NIK, dan nomor kartu selalu disamarkan saat proses inferensi. Tidak ada data pribadi mentah yang diteruskan ke API eksternal.
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-teal-50 text-teal-700 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">Zero Raw Biometric Storage</div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Sistem FRISTA memproses liveness di perangkat/enklave aman. Foto wajah tidak pernah disimpan di basis data verifikasi SELARAS.
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-700 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">SHA-256 Immutability</div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Setiap keputusan planner, transmisi jawaban pasien, dan catatan verifikator di-hash secara kriptografis untuk mencegah sanggahan (non-repudiation).
            </p>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Log Aktivitas Sistem Terenkripsi
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Log real-time pergerakan klaim, FRISTA token, dan intervensi manusia
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Aktor / Engine</th>
                <th className="py-3 px-4">Aksi</th>
                <th className="py-3 px-4">Target Klaim</th>
                <th className="py-3 px-4">Data Hash (SHA-256)</th>
                <th className="py-3 px-4">Catatan Kepatuhan PDP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                    {log.timestamp.split('T')[1].split('+')[0]}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-xs text-slate-900">{log.actor}</div>
                    <div className="text-[11px] text-slate-500">{log.actorRole}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-800">
                    {log.targetId}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                    {log.dataHash.slice(0, 18)}...
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {log.pdpComplianceNote}
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
