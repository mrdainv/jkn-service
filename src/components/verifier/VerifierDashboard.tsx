import React, { useState } from 'react';
import type { Claim, HospitalRiskProfile, AuditLogEntry } from '../../types';
import { ClaimListTab } from './ClaimListTab';
import { PreparationTab } from './PreparationTab';
import { ReviewQueueTab } from './ReviewQueueTab';
import { HospitalProfileTab } from './HospitalProfileTab';
import { AuditLogTab } from './AuditLogTab';
import { 
  FileText, 
  Settings2, 
  Inbox, 
  Building2, 
  History, 
  ExternalLink,
  Smartphone
} from 'lucide-react';

interface VerifierDashboardProps {
  claim: Claim;
  allClaims: Claim[];
  onSelectClaim: (claimId: string) => void;
  hospitalProfiles: HospitalRiskProfile[];
  auditLogs: AuditLogEntry[];
  onUpdateClaimStatus: (status: Claim['status'], decision: 'minta_resume' | 'setujui' | 'eskalasi_pk_jkn', notes?: string) => void;
  onOpenMobileJkn: () => void;
}

export type VerifierTab = 'claims' | 'prep' | 'review' | 'hospitals' | 'audit';

interface NavItem {
  id: VerifierTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const VerifierDashboard: React.FC<VerifierDashboardProps> = ({
  claim,
  allClaims,
  onSelectClaim,
  hospitalProfiles,
  auditLogs,
  onUpdateClaimStatus,
  onOpenMobileJkn,
}) => {
  const [activeTab, setActiveTab] = useState<VerifierTab>('claims');

  const navItems: NavItem[] = [
    { id: 'claims', label: 'Klaim masuk', icon: FileText },
    { id: 'prep', label: 'Persiapan verifikasi', icon: Settings2 },
    { id: 'review', label: 'Antrean tinjauan', icon: Inbox, badge: claim.result?.materialContradictions ? '1' : undefined },
    { id: 'hospitals', label: 'Profil faskes', icon: Building2 },
    { id: 'audit', label: 'Audit & log', icon: History },
  ];


  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50/50">
      {/* Verifier Sidebar - Matches Presentation Slide 8, 10 exact styling */}
      <aside className="w-full md:w-60 bg-white border-r border-slate-200 shrink-0 p-4 flex flex-col justify-between">
        <div>
          {/* Brand header */}
          <div className="flex items-center gap-2.5 px-3 py-3 mb-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="h-7 w-7 rounded-lg bg-emerald-700 flex items-center justify-center text-white text-xs font-bold">
              S
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 tracking-tight">SELARAS</div>
              <div className="text-[10px] text-slate-400 font-medium">Verifikator Hub</div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-50/80 text-emerald-900 font-bold border border-emerald-200/80 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom helper card */}
        <div className="mt-8 pt-4 border-t border-slate-100">
          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs">
            <div className="font-semibold text-emerald-950 mb-1 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
              <span>Simulasi Mobile JKN</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed mb-2.5">
              Ingin mencoba alur dari sudut pandang pasien?
            </p>
            <button
              onClick={onOpenMobileJkn}
              className="w-full py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-2xs"
            >
              <span>Buka Mobile JKN</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="mt-3 text-[10px] text-slate-400 text-center">
            Healthkathon BPJS Kesehatan 2026
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
        {/* Top prototype banner */}
        <div className="flex justify-end mb-4">
          <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-slate-900 text-white shadow-2xs">
            PROTOTIPE • DATA FIKTIF
          </span>
        </div>

        {/* Tab content router */}
        {activeTab === 'claims' && (
          <ClaimListTab
            claim={claim}
            allClaims={allClaims}
            onSelectClaim={onSelectClaim}
            onProceedToPreparation={() => setActiveTab('prep')}
          />
        )}

        {activeTab === 'prep' && (
          <PreparationTab
            claim={claim}
            onOpenMobileJkn={onOpenMobileJkn}
            onGoToReview={() => setActiveTab('review')}
          />
        )}

        {activeTab === 'review' && (
          <ReviewQueueTab
            claim={claim}
            onUpdateClaimStatus={onUpdateClaimStatus}
          />
        )}

        {activeTab === 'hospitals' && (
          <HospitalProfileTab hospitalProfiles={hospitalProfiles} />
        )}

        {activeTab === 'audit' && (
          <AuditLogTab logs={auditLogs} />
        )}
      </main>
    </div>
  );
};
