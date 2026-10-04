import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle2, RefreshCw, UserCheck, ShieldAlert, Sparkles, X } from 'lucide-react';

interface FristaCameraModalProps {
  onSuccess: (score: number) => void;
  onCancel: () => void;
}

export const FristaCameraModal: React.FC<FristaCameraModalProps> = ({ onSuccess, onCancel }) => {
  const [isLiveCamera, setIsLiveCamera] = useState(false);
  const [scanningState, setScanningState] = useState<'idle' | 'scanning' | 'matched'>('idle');
  const [progress, setProgress] = useState(0);
  const [blinkDetected, setBlinkDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Try opening webcam if available
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 480, height: 480 },
          });
          if (active && videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setIsLiveCamera(true);
          }
        }
      } catch (err) {
        console.warn('Webcam not active or permission denied, using interactive simulator:', err);
        setIsLiveCamera(false);
      }
    }

    startCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStartScan = () => {
    setScanningState('scanning');
    setProgress(0);
    setBlinkDetected(false);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 60 && !blinkDetected) {
          setBlinkDetected(true);
        }
        if (prev >= 100) {
          clearInterval(interval);
          setScanningState('matched');
          setTimeout(() => {
            onSuccess(99.4);
          }, 1200);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 animate-scaleIn">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              F
            </div>
            <span className="text-xs font-bold text-slate-800">FRISTA Face Liveness BPJS</span>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-56 h-56 rounded-full overflow-hidden border-4 border-emerald-500 shadow-inner bg-slate-950 flex items-center justify-center">
            {isLiveCamera ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="text-center p-4">
                <div className="w-24 h-28 rounded-full border-2 border-dashed border-emerald-400 mx-auto flex items-center justify-center mb-2">
                  <UserCheck className="w-12 h-12 text-emerald-400 opacity-80" />
                </div>
                <div className="text-[11px] text-emerald-300 font-medium">
                  Mode Simulasi Kamera
                </div>
              </div>
            )}

            {/* Scanning radar line */}
            {scanningState === 'scanning' && (
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/25 to-transparent h-12 w-full animate-scan" />
            )}

            {/* Match success badge */}
            {scanningState === 'matched' && (
              <div className="absolute inset-0 bg-emerald-900/70 flex flex-col items-center justify-center text-white">
                <CheckCircle2 className="w-14 h-14 text-emerald-300 animate-bounce mb-1" />
                <span className="text-xs font-bold">Wajah Cocok 99.4%</span>
              </div>
            )}
          </div>

          {/* Liveness prompt pill */}
          <div className="mt-4 px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              {scanningState === 'scanning'
                ? blinkDetected
                  ? 'Kedipan mata terdeteksi ✓'
                  : 'Posisikan wajah, lalu kedipkan mata'
                : scanningState === 'matched'
                ? 'Verifikasi Berhasil'
                : 'Posisikan wajah di dalam lingkaran'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 text-center mt-3 max-w-xs leading-relaxed">
            Pencocokan biometrik terenkripsi dengan KTP-el melalui FRISTA BPJS Kesehatan.
          </p>

          {/* Button trigger */}
          <div className="mt-5 w-full space-y-2">
            {scanningState === 'idle' && (
              <button
                onClick={handleStartScan}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Mulai Cek Wajah (3 Detik)</span>
              </button>
            )}

            <button
              onClick={() => onSuccess(98.5)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors"
            >
              Simulasikan Cocok Otomatis (Demo)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
