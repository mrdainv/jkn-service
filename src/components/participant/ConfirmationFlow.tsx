import { ArrowLeft, Camera, CheckCircle2, Clock, Lock, PhoneCall, ScanFace, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useAction, useApp } from '../../application/context';
import { MAX_FACE_FAILURES, RESPONSE_WINDOW_DAYS } from '../../application/commands';
import { CARE_TYPE_LABEL, FRISTA_LABEL } from '../../domain/labels';
import { answersOf, currentAssignment, failedFaceChecks, findClaim, getVersion, questionLimit, renderText, sessionFor } from '../../domain/queries';
import type { ActorRef, FristaResult, PendingQuestion, ResponseSession } from '../../domain/types';
import { addDays, formatDateLong, formatDateTime, formatPeriod } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { cx } from '../styles';

type Step = 'ringkasan' | 'frista' | 'pertanyaan';

const big = 'w-full rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-50';

/**
 * The participant's side of the adaptive session: summary, FRISTA, then one question at a time. Each
 * answer is saved and evaluated as soon as it is sent; the next question is whatever the session holds.
 */
export function ConfirmationFlow({ claimId, actor }: { claimId: string; actor: ActorRef }) {
  const { db, actions } = useApp();
  const claim = findClaim(db, claimId);
  const assignment = claim ? currentAssignment(db, claim.id) : undefined;
  const session = assignment ? sessionFor(db, assignment.id) : undefined;
  const [step, setStep] = useState<Step>(() => (session?.status === 'BERLANGSUNG' ? 'pertanyaan' : 'ringkasan'));
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [frista, fristaState] = useAction(actions.recordFrista);
  const [decline, declineState] = useAction(actions.decline);

  if (!claim || claim.participantId !== actor.id) {
    return <Message title="Layanan tidak ditemukan" text="Layanan ini tidak terdaftar atas nama Anda." />;
  }
  const facility = db.facilities.find((f) => f.id === claim.facilityId)!;
  const slots = { faskes: facility.name, periode: formatPeriod(claim.admissionDate) };
  const summary = (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">Layanan yang ditanyakan</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{facility.name}</div>
      <div className="text-sm text-slate-700">
        {CARE_TYPE_LABEL[claim.careType]}, {formatPeriod(claim.admissionDate)}
      </div>
    </div>
  );

  if (!assignment) {
    return <Message title="Belum ada pertanyaan" text="Belum ada pertanyaan untuk layanan ini. Anda akan mendapat notifikasi bila ada." top={summary} />;
  }
  const answers = session ? [...answersOf(db, session.id)].sort((a, b) => a.iteration - b.iteration) : [];
  if (session?.status === 'SELESAI' && answers.length > 0) {
    const notAsked = assignment.items.length - answers.length;
    return (
      <div className="space-y-3 p-4">
        <Back />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-2 text-lg font-semibold text-slate-900">Jawaban Anda sudah terkirim</h1>
          <p className="text-sm text-slate-700">Terima kasih. Jawaban ini tidak mengubah hak layanan Anda.</p>
          <p className="mt-2 text-xs text-slate-600">
            Nomor tanda terima <span className="font-mono font-semibold">{session.id}</span>
            <br />
            {formatDateTime(session.endedAt)}
          </p>
        </div>
        {summary}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Jawaban Anda</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {answers.map((a) => {
              const v = getVersion(db, a.questionId, a.questionVersion);
              return (
                <li key={a.id}>
                  <div className="text-slate-600">{renderText(v.text, slots)}</div>
                  <div className="font-medium text-slate-900">{v.options.find((o) => o.id === a.optionId)?.label}</div>
                </li>
              );
            })}
          </ol>
          {notAsked > 0 && <p className="mt-2 text-xs text-slate-500">{notAsked} pertanyaan lain tidak perlu ditanyakan.</p>}
        </div>
      </div>
    );
  }
  if (claim.status === 'PERLU_KONTAK') {
    return <Message icon={PhoneCall} title="Petugas BPJS akan menghubungi Anda" text="Verifikasi wajah belum berhasil. Petugas resmi BPJS Kesehatan akan menelepon Anda. Hak layanan Anda tidak berubah." top={summary} />;
  }
  if (assignment.status !== 'AKTIF' || claim.status === 'DITOLAK_PESERTA' || claim.status === 'TIDAK_DIJAWAB') {
    return (
      <Message
        icon={Lock}
        title={claim.status === 'DITOLAK_PESERTA' ? 'Anda memilih tidak menjawab' : 'Pertanyaan sudah ditutup'}
        text={
          claim.status === 'DITOLAK_PESERTA'
            ? 'Pilihan Anda sudah dicatat. Hak layanan Anda tidak berubah.'
            : session?.stopReason === 'PERTANYAAN_HABIS'
              ? 'Tidak ada pertanyaan yang perlu Anda jawab untuk layanan ini. Hak layanan Anda tidak berubah.'
              : `Batas waktu menjawab ${RESPONSE_WINDOW_DAYS} hari sudah lewat. Hak layanan Anda tidak berubah.`
        }
        top={summary}
      />
    );
  }

  const limit = questionLimit(db, assignment, session);
  const deadline = addDays(assignment.publishedAt.slice(0, 10), RESPONSE_WINDOW_DAYS);
  const failures = failedFaceChecks(db, assignment.id);
  const declineBox = confirmDecline ? (
    <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm">
      <p>{answers.length ? `Berhenti sekarang? ${answers.length} jawaban yang sudah terkirim tetap tersimpan.` : 'Yakin tidak ingin menjawab? Pilihan ini dicatat dan tidak dapat diubah.'}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={declineState.pending} onClick={() => decline(assignment.id, actor)}>
          {answers.length ? 'Ya, berhenti' : 'Ya, tidak bersedia'}
        </button>
        <button type="button" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setConfirmDecline(false)}>
          Batal
        </button>
      </div>
      {declineState.error && <p className="mt-2 text-xs text-red-700">{declineState.error}</p>}
    </div>
  ) : (
    <button type="button" className="w-full py-2 text-sm text-slate-500 underline" onClick={() => setConfirmDecline(true)}>
      {answers.length ? 'Saya ingin berhenti menjawab' : 'Saya tidak bersedia menjawab'}
    </button>
  );

  if (step === 'pertanyaan' && session?.status === 'BERLANGSUNG' && session.pending) {
    return (
      <div className="flex min-h-full flex-col p-4">
        <QuestionStep key={session.pending.iteration} session={session} pending={session.pending} limit={limit} slots={slots} actor={actor} />
        <div className="mt-2">{declineBox}</div>
      </div>
    );
  }

  if (step === 'frista') {
    const run = async (result: FristaResult) => {
      const check = await frista(assignment.id, result, actor);
      if (check?.result === 'COCOK') setStep('pertanyaan');
    };
    const last = db.fristaChecks.filter((f) => f.assignmentId === assignment.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    return (
      <div className="space-y-3 p-4">
        <button type="button" onClick={() => setStep('ringkasan')} className="flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Kembali
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Pastikan yang menjawab adalah Anda</h1>
        <p className="text-sm text-slate-600">Wajah Anda dicocokkan dengan foto KTP-el lewat FRISTA BPJS Kesehatan. Foto tidak disimpan; yang dicatat hanya cocok atau tidak cocok.</p>
        <CameraPreview />
        {failures > 0 && (
          <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            Wajah belum cocok ({failures} dari {MAX_FACE_FAILURES} kesempatan). Pastikan cahaya cukup lalu coba lagi.
          </p>
        )}
        {last?.result === 'LAYANAN_TIDAK_TERSEDIA' && <p className="rounded-lg bg-slate-100 p-2 text-sm text-slate-700">Layanan FRISTA sedang tidak tersedia. Silakan coba lagi nanti; ini tidak dihitung sebagai kegagalan.</p>}
        {fristaState.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800" role="alert">{fristaState.error}</p>}
        <fieldset className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hasil FRISTA (simulasi)</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['COCOK', 'TIDAK_COCOK', 'LAYANAN_TIDAK_TERSEDIA', 'TANPA_KAMERA'] as FristaResult[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={fristaState.pending}
                onClick={() => run(r)}
                className={cx('rounded-lg border px-2 py-2.5 text-sm font-medium disabled:opacity-50', r === 'COCOK' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700')}
              >
                {FRISTA_LABEL[r]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <Back />
      <h1 className="text-lg font-semibold text-slate-900">Konfirmasi layanan kesehatan</h1>
      {summary}
      <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <li className="flex gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          Hingga {limit} pertanyaan pilihan ganda, satu per satu, sekitar {Math.max(1, Math.round(limit * 0.5))} menit. Jawab sampai {formatDateLong(deadline)}.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          Sukarela. Menjawab atau tidak, hak layanan Anda tidak berubah. Jawaban tidak dikirim ke rumah sakit.
        </li>
        <li className="flex gap-2">
          <ScanFace className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          Sebelum menjawab, wajah Anda dicocokkan lewat FRISTA agar yang menjawab benar Anda.
        </li>
        <li className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          Setiap jawaban langsung tersimpan; pertanyaan berikutnya menyesuaikan jawaban Anda. Bila tidak ingat, pilih "Tidak ingat". Itu jawaban yang sah.
        </li>
      </ul>
      {assignment.round > 1 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Pertanyaan ini sudah diperbarui oleh BPJS Kesehatan.</p>}
      <button type="button" className={cx(big, 'bg-emerald-700 text-white')} onClick={() => setStep(session?.status === 'BERLANGSUNG' ? 'pertanyaan' : 'frista')}>
        {session?.status === 'BERLANGSUNG' ? 'Lanjutkan' : 'Mulai'}
      </button>
      <button type="button" className={cx(big, 'border border-slate-300 bg-white text-slate-700')} onClick={() => navigate('/peserta')}>
        Nanti saja
      </button>
      {declineBox}
    </div>
  );
}

/** The one question the session is waiting for. Sending it saves the answer and moves the session on. */
function QuestionStep({ session, pending, limit, slots, actor }: { session: ResponseSession; pending: PendingQuestion; limit: number; slots: { faskes: string; periode: string }; actor: ActorRef }) {
  const { db, actions } = useApp();
  const [choice, setChoice] = useState<string | null>(null);
  const [send, sendState, clear] = useAction(actions.answer);
  const v = getVersion(db, pending.questionId, pending.questionVersion);
  return (
    <>
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <a href={href('/peserta')} className="flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Beranda
        </a>
        <span aria-live="polite">
          Pertanyaan ke-{pending.iteration} (paling banyak {limit})
        </span>
      </div>
      <div className="mb-4 h-1.5 rounded-full bg-slate-200">
        <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${(pending.iteration / Math.max(limit, 1)) * 100}%` }} />
      </div>
      <fieldset>
        <legend className="text-lg font-semibold leading-snug text-slate-900">{renderText(v.text, slots)}</legend>
        <div className="mt-4 space-y-2">
          {v.options.map((o) => (
            <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-base', choice === o.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200')}>
              <input type="radio" name={`q-${pending.questionId}`} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="h-5 w-5 accent-emerald-700" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      {sendState.error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {sendState.error} Jawaban ini belum tersimpan.{' '}
          <button type="button" className="underline" onClick={clear}>
            Coba lagi
          </button>
        </div>
      )}
      <div className="mt-auto pt-6">
        <button
          type="button"
          className={cx(big, 'bg-emerald-700 text-white')}
          disabled={!choice || sendState.pending}
          onClick={() => choice && send({ sessionId: session.id, questionId: pending.questionId, questionVersion: pending.questionVersion, optionId: choice }, actor)}
        >
          {sendState.pending ? 'Mengirim…' : 'Kirim jawaban ini'}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Jawaban yang sudah dikirim tidak dapat diubah.</p>
      </div>
    </>
  );
}

function Back() {
  return (
    <a href={href('/peserta')} className="flex items-center gap-1 text-sm text-slate-600">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Beranda
    </a>
  );
}

function Message({ title, text, top, icon: Icon = Clock }: { title: string; text: string; top?: ReactNode; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="space-y-3 p-4">
      <Back />
      {top}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
        <Icon className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
        <h1 className="mt-2 text-base font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{text}</p>
      </div>
    </div>
  );
}

/** Optional live preview. Nothing is recorded or sent; the result above is what counts (simulated). */
function CameraPreview() {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'off' | 'on' | 'unavailable'>('off');
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  const open = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      setState('on');
    } catch {
      setState('unavailable');
    }
  };
  return (
    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-slate-900">
      <video ref={video} autoPlay playsInline muted className={cx('h-full w-full -scale-x-100 object-cover', state !== 'on' && 'hidden')} />
      {state !== 'on' && (
        <div className="text-center">
          <div className="mx-auto grid h-28 w-24 place-items-center rounded-full border-2 border-dashed border-emerald-400/80">
            <ScanFace className="h-10 w-10 text-emerald-400/80" aria-hidden />
          </div>
          <button type="button" onClick={open} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">
            <Camera className="h-3.5 w-3.5" aria-hidden /> {state === 'unavailable' ? 'Kamera tidak tersedia' : 'Buka kamera (pratinjau)'}
          </button>
        </div>
      )}
    </div>
  );
}
