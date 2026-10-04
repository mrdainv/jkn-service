import React from 'react';
import { Shield, Sparkles, Smartphone, LayoutDashboard, SplitSquareVertical, BookOpen, PlusCircle } from 'lucide-react';
import type { Claim } from '../types';


interface NavbarProps {
  currentView: 'verifier' | 'patient' | 'split';
  onViewChange: (view: 'verifier' | 'patient' | 'split') => void;
  claims: Claim[];
  selectedClaimId: string;
  onSelectClaim: (claimId: string) => void;
  onOpenMethodology: () => void;
  onOpenNewClaim: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  claims,
  selectedClaimId,
  onSelectClaim,
  onOpenMethodology,
  onOpenNewClaim,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Hackathon Badge */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xl tracking-tight text-slate-900">SELARAS</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    MVP 2026
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium hidden sm:block">
                  Verifikasi Klaim Dua Sumber • BPJS Kesehatan
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 hidden md:block" />

            {/* Claim Scenario Selector */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Skenario:</span>
              <select
                value={selectedClaimId}
                onChange={(e) => onSelectClaim(e.target.value)}
                className="text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
              >
                {claims.map((claim) => (
                  <option key={claim.id} value={claim.id}>
                    {claim.id} • {claim.primaryDiagnosisName.split(',')[0]} ({claim.status})
                  </option>
                ))}
              </select>

              <button
                onClick={onOpenNewClaim}
                title="Tambah Klaim Baru"
                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Controls: View Switcher & Research Modal */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Switcher Pill */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                onClick={() => onViewChange('verifier')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === 'verifier'
                    ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Verifikator</span>
              </button>

              <button
                onClick={() => onViewChange('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === 'split'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilkan Verifikator & Pasien berdampingan untuk Live Demo"
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Live Split</span>
              </button>

              <button
                onClick={() => onViewChange('patient')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === 'patient'
                    ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mobile JKN</span>
              </button>
            </div>

            {/* Research & Methodology Button */}
            <button
              onClick={onOpenMethodology}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-emerald-800 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 rounded-lg transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Riset & Dalil</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
