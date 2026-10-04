import React, { useState, useEffect } from 'react';
import type { Claim, PatientAnswerRecord } from '../../types';
import { FristaCameraModal } from './FristaCameraModal';
import { 
  FileCheck2, 
  UserCheck, 
  Check, 
  RotateCcw,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import confetti from 'canvas-confetti';


interface MobileJknSimulatorProps {
  claim: Claim;
  onSaveAnswers: (answers: Record<string, PatientAnswerRecord>, isCompanion: boolean) => void;
  onGoToVerifierResult: () => void;
}

export const MobileJknSimulator: React.FC<MobileJknSimulatorProps> = ({
  claim,
  onSaveAnswers,
  onGoToVerifierResult,
}) => {
  // Navigation states: 'invite' | 'frista' | 'questions' | 'completed'
  const [screen, setScreen] = useState<'invite' | 'frista' | 'questions' | 'completed'>('invite');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PatientAnswerRecord>>(claim.patientAnswers || {});
  const [selectedSingleOption, setSelectedSingleOption] = useState<string>('');
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<string[]>([]);
  const [showFristaModal, setShowFristaModal] = useState(false);
  const [faceVerified, setFaceVerified] = useState(claim.faceVerificationPassed);
  const [isCompanion, setIsCompanion] = useState(claim.isCompanionAnswer);

  // Active question list
  const activeQuestions = claim.questions;
  const currentQ = activeQuestions[currentQuestionIndex];

  // Sync selected options when question index changes
  useEffect(() => {
    if (currentQ) {
      const existing = answers[currentQ.id];
      if (existing) {
        if (currentQ.questionType === 'multi_select') {
          setSelectedMultiOptions(existing.selectedOptions || []);
        } else {
          // Find option id matching text
          const opt = currentQ.options?.find((o) => o.label === existing.answerText || existing.answerText.includes(o.label));
          setSelectedSingleOption(opt?.id || '');
        }
      } else {
        setSelectedSingleOption('');
        setSelectedMultiOptions([]);
      }
    }
  }, [currentQuestionIndex, currentQ]);

  const handleStartInvitation = () => {
    if (faceVerified) {
      setScreen('questions');
    } else {
      setScreen('frista');
    }
  };

  const handleFaceSuccess = (score: number) => {
    setFaceVerified(true);
    setIsCompanion(false);
    setShowFristaModal(false);
    setScreen('questions');
  };

  const handleChooseCompanion = () => {
    setIsCompanion(true);
    setFaceVerified(true);
    setScreen('questions');
  };

  const handleNextQuestion = () => {
    if (!currentQ) return;

    // Record answer
    let answerText = '';
    let selectedOpts: string[] = [];

    if (currentQ.questionType === 'multi_select') {
      selectedOpts = selectedMultiOptions;
      if (selectedMultiOptions.length === 0) {
        answerText = 'Tidak memilih / tidak ada';
      } else {
        answerText = selectedMultiOptions
          .map((id) => currentQ.options?.find((o) => o.id === id)?.label)
          .filter(Boolean)
          .join(', ');
      }
    } else {
      const opt = currentQ.options?.find((o) => o.id === selectedSingleOption);
      answerText = opt ? opt.label : 'Tidak menjawab';
    }

    const updatedAnswers: Record<string, PatientAnswerRecord> = {
      ...answers,
      [currentQ.id]: {
        questionId: currentQ.id,
        factId: currentQ.factId,
        answerText,
        selectedOptions: selectedOpts,
        answeredAt: new Date().toISOString(),
        responseTimeSeconds: 5,
      },
    };

    setAnswers(updatedAnswers);

    // Check if next question exists
    if (currentQuestionIndex < activeQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Completed all questions!
      setScreen('completed');
      onSaveAnswers(updatedAnswers, Boolean(isCompanion));
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
    }
  };


  const handleReset = () => {
    setAnswers({});
    setCurrentQuestionIndex(0);
    setScreen('invite');
    setSelectedSingleOption('');
    setSelectedMultiOptions([]);
  };

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-4">
      {/* Smartphone Outer Shell */}
      <div className="w-full max-w-[390px] min-h-[740px] bg-slate-900 rounded-[44px] p-3 shadow-2xl ring-1 ring-slate-800/80 relative">
        {/* Dynamic Island / Speaker cutout */}
        <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-28 h-4 bg-slate-950 rounded-full z-40 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ml-16" />
        </div>

        {/* Screen Bezel Area */}
        <div className="w-full h-full bg-white rounded-[36px] overflow-hidden flex flex-col relative font-sans text-slate-900 min-h-[716px]">
          {/* Status Bar */}
          <div className="pt-2 px-6 pb-2 flex items-center justify-between text-xs font-semibold text-slate-800 shrink-0">
            <span>09.41</span>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5 items-end h-2.5">
                <span className="w-1 h-1.5 bg-slate-800 rounded-2xs" />
                <span className="w-1 h-2 bg-slate-800 rounded-2xs" />
                <span className="w-1 h-2.5 bg-slate-800 rounded-2xs" />
              </div>
              <span className="text-[10px] font-bold">4G</span>
              <div className="w-5 h-2.5 border border-slate-700 rounded-xs p-0.5 flex items-center">
                <div className="w-full h-full bg-slate-800 rounded-2xs" />
              </div>
            </div>
          </div>

          {/* App Header */}
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 inline-block -mr-1" />
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block opacity-80" />
              </div>
              <div>
                <div className="font-bold text-xs tracking-tight text-slate-900">
                  Konfirmasi Layanan
                </div>
                <div className="text-[10px] text-slate-400">
                  {screen === 'invite' && 'Mobile JKN • Undangan verifikasi'}
                  {screen === 'frista' && 'Mobile JKN • Langkah 1 • Identitas'}
                  {screen === 'questions' && `Mobile JKN • ${claim.hospitalName.split('(')[0].trim()}`}
                  {screen === 'completed' && 'Mobile JKN • Selesai'}
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              title="Reset Simulasi Pasien"
              className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* SCREEN 1: UNDANGAN VERIFIKASI (Slide 9 Exact) */}
          {screen === 'invite' && (
            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              <div>
                {/* Hero Icon */}
                <div className="w-full py-6 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-center mb-6">
                  <div className="w-16 h-16 rounded-xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-emerald-700">
                    <FileCheck2 className="w-9 h-9 stroke-[1.75]" />
                  </div>
                </div>

                {/* Title & Desc */}
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 leading-snug">
                  Bantu kami memastikan layanan atas nama Anda tercatat dengan benar
                </h2>

                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  Ada catatan rawat inap atas nama Anda di{' '}
                  <strong className="text-slate-800">{claim.hospitalName}</strong>. Kami akan
                  mengajukan paling banyak 5 pertanyaan singkat (±2 menit).
                </p>

                {/* 3 Bullet Points */}
                <div className="mt-5 space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-700 font-bold">•</span>
                    <span>
                      Jawab sesuai yang Anda ingat. <strong className="text-slate-800">“Tidak yakin”</strong> selalu boleh.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-700 font-bold">•</span>
                    <span>
                      Jawaban Anda <strong className="text-slate-800">tidak memengaruhi hak</strong> layanan JKN Anda.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-700 font-bold">•</span>
                    <span>
                      Boleh dijawab oleh pendamping bila pasien anak atau sedang sakit.
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 space-y-2.5">
                <button
                  onClick={handleStartInvitation}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-xs transition-colors"
                >
                  Mulai
                </button>
                <button
                  onClick={() => alert('Sesi verifikasi ditunda. Pengingat akan dikirimkan kembali melalui notifikasi Mobile JKN.')}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-xl transition-colors"
                >
                  Lain kali
                </button>
                <div className="text-[10px] text-slate-400 text-center leading-normal pt-1">
                  Data diproses sesuai UU 27/2022 tentang Pelindungan Data Pribadi. Prototipe • data fiktif.
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 2: CEK WAJAH FRISTA (Slide 9 Exact) */}
          {screen === 'frista' && (
            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 leading-snug">
                  Pastikan yang menjawab adalah Anda
                </h2>

                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Wajah Anda dicocokkan dengan foto KTP-el lewat FRISTA BPJS Kesehatan. Butuh sekitar 3 detik.
                </p>

                {/* Viewfinder Graphic Container */}
                <div className="mt-5 w-full aspect-4/3 bg-slate-900 rounded-2xl relative flex flex-col items-center justify-center overflow-hidden border-2 border-slate-800">
                  <div className="w-28 h-36 rounded-full border-2 border-dashed border-emerald-400/80 flex items-center justify-center">
                    <div className="w-20 h-28 rounded-full bg-slate-800/80 flex items-center justify-center">
                      <UserCheck className="w-10 h-10 text-emerald-400/70" />
                    </div>
                  </div>

                  <div className="absolute bottom-3 px-3 py-1 bg-slate-950/80 backdrop-blur-xs rounded-full text-[11px] text-white font-medium">
                    Posisikan wajah, lalu kedipkan
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
                  Foto wajah tidak disimpan oleh layanan ini. Yang dicatat hanya hasilnya: cocok atau tidak.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-2.5">
                <button
                  onClick={() => setShowFristaModal(true)}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-xs transition-colors"
                >
                  Verifikasi wajah
                </button>

                <button
                  onClick={handleChooseCompanion}
                  className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-xl transition-colors"
                >
                  Saya pendamping pasien
                </button>

                <div className="text-[10px] text-slate-400 text-center leading-normal pt-1">
                  Gagal dua kali atau tidak punya kamera? Petugas akan menelepon Anda. Ini bukan tanda kesalahan. Prototipe • data fiktif
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 3..5: SATU PERTANYAAN PER LAYAR (Slide 9 Exact) */}
          {screen === 'questions' && currentQ && (
            <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto">
              <div>
                {/* Step indicator header */}
                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                    Pertanyaan {currentQuestionIndex + 1} dari maks. {activeQuestions.length}
                  </div>
                  {/* Segmented Progress Bars */}
                  <div className="flex gap-1.5">
                    {activeQuestions.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          idx <= currentQuestionIndex ? 'bg-emerald-600' : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Question Illustration Banner */}
                {currentQ.iconType === 'oxygen' && (
                  <div className="w-full py-5 bg-emerald-50/50 rounded-2xl border border-emerald-100/60 flex items-center justify-center mb-4">
                    <svg
                      className="w-28 h-16 text-emerald-800 stroke-current fill-none stroke-[2.5]"
                      viewBox="0 0 100 60"
                    >
                      <path d="M 20 45 C 20 20, 50 15, 65 25 C 75 32, 70 42, 60 40 C 50 38, 55 25, 75 20 C 85 18, 90 28, 92 45" />
                      <circle cx="65" cy="27" r="3" fill="currentColor" />
                    </svg>
                  </div>
                )}

                {/* Question Title & Subtitle */}
                <h3 className="text-lg font-bold text-slate-900 leading-snug">
                  {currentQ.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {currentQ.subtitle}
                </p>

                {/* Question Options */}
                <div className="mt-5 space-y-2.5">
                  {currentQ.questionType === 'multi_select' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {currentQ.options?.map((opt) => {
                        const isChecked = selectedMultiOptions.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedMultiOptions((prev) =>
                                isChecked ? prev.filter((i) => i !== opt.id) : [...prev, opt.id]
                              );
                            }}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isChecked
                                ? 'bg-emerald-50/80 border-emerald-600 text-emerald-950 font-bold shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className={`w-4 h-4 rounded-md border flex items-center justify-center text-white text-[10px] ${
                                  isChecked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <span className="text-xs font-bold leading-tight">{opt.label}</span>
                            </div>
                            {opt.sublabel && (
                              <div className="text-[10px] text-slate-500 pl-6 leading-tight">
                                {opt.sublabel}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    currentQ.options?.map((opt) => {
                      const isSelected = selectedSingleOption === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedSingleOption(opt.id)}
                          className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-emerald-50/70 border-emerald-600 text-emerald-950 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                              isSelected ? 'border-emerald-600' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <div className="w-2 h-2 rounded-full bg-emerald-600" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold leading-snug">{opt.label}</div>
                            {opt.sublabel && (
                              <div className="text-[11px] text-slate-500 mt-0.5">{opt.sublabel}</div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Bottom Next Button */}
              <div className="pt-4 space-y-2">
                <button
                  onClick={handleNextQuestion}
                  disabled={
                    currentQ.questionType !== 'multi_select' && !selectedSingleOption
                  }
                  className={`w-full py-3.5 font-bold text-xs rounded-xl shadow-xs transition-all ${
                    currentQ.questionType === 'multi_select' || selectedSingleOption
                      ? 'bg-slate-900 hover:bg-slate-800 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {currentQuestionIndex === activeQuestions.length - 1
                    ? 'Kirim jawaban'
                    : 'Lanjut'}
                </button>

                <div className="text-[10px] text-slate-400 text-center">
                  {currentQ.isAdaptive
                    ? 'Pertanyaan ini muncul karena jawaban sebelumnya. Prototipe • data fiktif'
                    : 'Prototipe • data fiktif'}
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 6: TERIMA KASIH / SELESAI */}
          {screen === 'completed' && (
            <div className="flex-1 p-6 flex flex-col justify-between items-center text-center overflow-y-auto">
              <div className="py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  Terima kasih!
                </h2>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Jawaban Anda telah kami terima secara aman dan langsung diselaraskan dengan dokumen klaim rumah sakit.
                </p>

                <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs">
                  <div className="font-semibold text-slate-800">Ringkasan Bukti Anda:</div>
                  <div className="text-slate-600">
                    • Identitas: {claim.patient.maskedName} ({isCompanion ? 'Pendamping' : 'Pasien Sendiri'})
                  </div>
                  <div className="text-slate-600">
                    • Total fakta diverifikasi: {Object.keys(answers).length} poin
                  </div>
                  <div className="text-slate-600 font-mono text-[11px] text-slate-400">
                    • Hash Verifikasi: sha256:8f4...
                  </div>
                </div>
              </div>

              <div className="w-full space-y-2.5">
                <button
                  onClick={onGoToVerifierResult}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Lihat Hasil di Verifikator BPJS</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleReset}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors"
                >
                  Ulangi Simulasi Ini
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FRISTA Webcam Modal */}
      {showFristaModal && (
        <FristaCameraModal
          onSuccess={handleFaceSuccess}
          onCancel={() => setShowFristaModal(false)}
        />
      )}
    </div>
  );
};
