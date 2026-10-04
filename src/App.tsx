import React, { useState } from 'react';
import type { Claim, HospitalRiskProfile, AuditLogEntry, PatientAnswerRecord } from './types';
import { INITIAL_CLAIMS, MOCK_HOSPITAL_RISKS, MOCK_AUDIT_LOGS } from './data/mockClaims';
import { calculateBayesianVerification } from './services/bayesianScorer';
import { Navbar } from './components/Navbar';
import { VerifierDashboard } from './components/verifier/VerifierDashboard';
import { MobileJknSimulator } from './components/patient/MobileJknSimulator';
import { MethodologyModal } from './components/MethodologyModal';
import { NewClaimModal } from './components/verifier/NewClaimModal';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'verifier' | 'patient' | 'split'>('split');
  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('KLM-DEMO-0427');
  const [hospitalProfiles, setHospitalProfiles] = useState<HospitalRiskProfile[]>(MOCK_HOSPITAL_RISKS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOGS);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isNewClaimOpen, setIsNewClaimOpen] = useState(false);

  // Active claim object
  const activeClaim = claims.find((c) => c.id === selectedClaimId) || claims[0];

  // When patient saves answers in Mobile JKN, recalculate Bayesian verification dynamically
  const handleSavePatientAnswers = (
    answers: Record<string, PatientAnswerRecord>,
    isCompanion: boolean
  ) => {
    const updatedResult = calculateBayesianVerification(
      activeClaim,
      answers,
      isCompanion,
      activeClaim.faceMatchScore || 99.2
    );

    const updatedClaim: Claim = {
      ...activeClaim,
      patientAnswers: answers,
      faceVerificationPassed: true,
      isCompanionAnswer: isCompanion,
      result: updatedResult,
      status:
        updatedResult.recommendation === 'Prioritas Tinggi: Dugaan Fraud Kritis'
          ? 'Eskalasi PK-JKN'
          : updatedResult.recommendation === 'Terverifikasi Selaras Otomatis'
          ? 'Disetujui'
          : 'Perlu Tinjauan',
    };

    setClaims((prev) => prev.map((c) => (c.id === activeClaim.id ? updatedClaim : c)));

    // Append to audit log
    const newAuditLog: AuditLogEntry = {
      id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      actor: isCompanion ? 'PATIENT_COMPANION' : 'PATIENT_MOBILE_JKN',
      actorRole: isCompanion ? 'Pendamping Pasien Terotorisasi' : 'Peserta JKN (Wajah Cocok FRISTA)',
      action: 'SUBMIT_VERIFIKASI_MANDIRI',
      targetId: activeClaim.id,
      dataHash: `sha256:${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
      pdpComplianceNote: `Jawaban (${Object.keys(answers).length} fakta) diselaraskan ke mesin Bayesian. Skor: ${updatedResult.consistencyScore}/100.`,
    };

    setAuditLogs((prev) => [newAuditLog, ...prev]);
  };

  // Verifier actions (Minta resume, Setujui, Eskalasi PK-JKN)
  const handleUpdateClaimStatus = (
    status: Claim['status'],
    decision: 'minta_resume' | 'setujui' | 'eskalasi_pk_jkn',
    notes?: string
  ) => {
    const updatedClaim: Claim = {
      ...activeClaim,
      status,
      result: activeClaim.result
        ? {
            ...activeClaim.result,
            verifierDecision: decision,
            verifierNotes: notes,
          }
        : undefined,
    };

    setClaims((prev) => prev.map((c) => (c.id === activeClaim.id ? updatedClaim : c)));

    // Append to audit log
    const newAuditLog: AuditLogEntry = {
      id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      actor: 'VERIF-BPJS-014',
      actorRole: 'Staf Verifikator Klaim Rujukan',
      action: decision.toUpperCase(),
      targetId: activeClaim.id,
      dataHash: `sha256:${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
      pdpComplianceNote: `Tindakan manusia: ${decision}. Catatan: ${notes || '-'}.`,
    };

    setAuditLogs((prev) => [newAuditLog, ...prev]);
  };

  const handleAddNewClaim = (newClaim: Claim) => {
    setClaims((prev) => [newClaim, ...prev]);
    setSelectedClaimId(newClaim.id);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        onViewChange={setCurrentView}
        claims={claims}
        selectedClaimId={selectedClaimId}
        onSelectClaim={setSelectedClaimId}
        onOpenMethodology={() => setIsMethodologyOpen(true)}
        onOpenNewClaim={() => setIsNewClaimOpen(true)}
      />

      {/* Main Container Viewport */}
      <div className="flex-1 w-full">
        {/* VIEW 1: FULL VERIFIER DASHBOARD */}
        {currentView === 'verifier' && (
          <VerifierDashboard
            claim={activeClaim}
            allClaims={claims}
            onSelectClaim={setSelectedClaimId}
            hospitalProfiles={hospitalProfiles}
            auditLogs={auditLogs}
            onUpdateClaimStatus={handleUpdateClaimStatus}
            onOpenMobileJkn={() => setCurrentView('patient')}
          />
        )}

        {/* VIEW 2: FULL MOBILE JKN SIMULATOR */}
        {currentView === 'patient' && (
          <div className="py-8 px-4 flex justify-center items-center min-h-[calc(100vh-4rem)]">
            <MobileJknSimulator
              claim={activeClaim}
              onSaveAnswers={handleSavePatientAnswers}
              onGoToVerifierResult={() => setCurrentView('verifier')}
            />
          </div>
        )}

        {/* VIEW 3: SPLIT SCREEN (LIVE DEMO FOR HACKATHON JUDGES) */}
        {currentView === 'split' && (
          <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
            {/* Left side: Verifier Portal (Flexible width) */}
            <div className="flex-1 border-r border-slate-300 overflow-y-auto">
              <div className="bg-emerald-900 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between">
                <span>PORTAL VERIFIKATOR BPJS (SISI KLAIM & TIM PK-JKN)</span>
                <span className="text-[11px] font-mono text-emerald-300">Live Linked Mode</span>
              </div>
              <VerifierDashboard
                claim={activeClaim}
                allClaims={claims}
                onSelectClaim={setSelectedClaimId}
                hospitalProfiles={hospitalProfiles}
                auditLogs={auditLogs}
                onUpdateClaimStatus={handleUpdateClaimStatus}
                onOpenMobileJkn={() => setCurrentView('patient')}
              />
            </div>

            {/* Right side: Mobile JKN Smartphone Simulator (Fixed width on large screens) */}
            <div className="w-full lg:w-[440px] bg-slate-900/95 p-4 flex flex-col items-center justify-start overflow-y-auto shrink-0 border-t lg:border-t-0 lg:border-l border-slate-700">
              <div className="w-full mb-3 flex items-center justify-between text-xs text-slate-300 font-semibold px-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>SIMULATOR MOBILE JKN (PASIEN)</span>
                </span>
                <span className="text-[10px] text-slate-400">Interaktif Realtime</span>
              </div>
              <MobileJknSimulator
                claim={activeClaim}
                onSaveAnswers={handleSavePatientAnswers}
                onGoToVerifierResult={() => setCurrentView('verifier')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Methodology & Science Modal */}
      {isMethodologyOpen && (
        <MethodologyModal onClose={() => setIsMethodologyOpen(false)} />
      )}

      {/* New Claim Modal */}
      {isNewClaimOpen && (
        <NewClaimModal
          onClose={() => setIsNewClaimOpen(false)}
          onAddClaim={handleAddNewClaim}
        />
      )}
    </div>
  );
};

export default App;

