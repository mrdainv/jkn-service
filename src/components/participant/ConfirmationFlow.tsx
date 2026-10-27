import { ArrowLeft, Camera, CheckCircle2, Clock, Lock, PhoneCall, ScanFace, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useAction, useApp } from '../../application/context';
import { MAX_FACE_FAILURES, RESPONSE_WINDOW_DAYS } from '../../application/commands';
import { CARE_TYPE_LABEL, FRISTA_LABEL } from '../../domain/labels';
import { answersOf, currentAssignment, failedFaceChecks, findClaim, getVersion, passedFaceCheck, renderText, sessionFor } from '../../domain/queries';
import type { ActorRef, FristaResult } from '../../domain/types';
import { addDays, formatDateLong, formatDateTime, formatPeriod } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { cx } from '../styles';

type Step = 'ringkasan' | 'frista' | 'pertanyaan' | 'periksa';

interface Picked {
  optionId: string;
  at: string;
}

// In-progress answers stay on this device only, so a reload does not lose them. They become shared
// records only when submitted, all at once.
function loadDraft(key: string): Record<string, Picked> {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, Picked>;
  } catch {
    return {};
  }
}

function saveDraft(key: string, value: Record<string, Picked> | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: answers are kept in memory for this visit only.
  }
}

const big = 'w-full rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-50';

export function ConfirmationFlow({ claimId, actor }: { claimId: string; actor: ActorRef }) {
  const { db, actions } = useApp();
  const claim = findClaim(db, claimId);
  const assignment = claim ? currentAssignment(db, claim.id) : undefined;
  const draftKey = `jkn-service/jawaban/${assignment?.id ?? 'none'}`;
  const [step, setStep] = useState<Step>('ringkasan');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<string, Picked>>(() => loadDraft(draftKey));
  const [startedAt] = useState(() => new Date().toISOString());
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [frista, fristaState] = useAction(actions.recordFrista);
  const [decline, declineState] = useAction(actions.decline);
  const [submit, submitState] = useAction(actions.submitResponses);

  useEffect(() => saveDraft(draftKey, Object.keys(picked).length ? picked : null), [draftKey, picked]);

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

  const answered = assignment ? sessionFor(db, assignment.id) : undefined;
  if (!assignment) {
    return <Message title="Belum ada pertanyaan" text="Belum ada pertanyaan untuk layanan ini. Anda akan mendapat notifikasi bila ada." top={summary} />;
  }
  if (answered) {
    const ans = answersOf(db, answered.id);
    return (
      <div className="space-y-3 p-4">
        <Back />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-2 text-lg font-semibold text-slate-900">Jawaban Anda sudah terkirim</h1>
          <p className="text-sm text-slate-700">Terima kasih. Jawaban ini tidak mengubah hak layanan Anda.</p>
          <p className="mt-2 text-xs text-slate-600">
            Nomor tanda terima <span className="font-mono font-semibold">{answered.id}</span>
            <br />
            {formatDateTime(answered.submittedAt)}
          </p>
        </div>
        {summary}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Jawaban Anda</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {[...assignment.items]
              .sort((a, b) => a.order - b.order)
              .map((item) => {
                const v = getVersion(db, item.questionId, item.questionVersion);
                const a = ans.find((x) => x.questionId === item.questionId);
                return (
                  <li key={item.questionId}>
                    <div className="text-slate-600">{renderText(v.text, slots)}</div>
                    <div className="font-medium text-slate-900">{a?.optionId ? v.options.find((o) => o.id === a.optionId)?.label : 'Dilewati'}</div>
                  </li>
                );
              })}
          </ol>
        </div>
      </div>
    );
  }
  if (claim.status === 'PERLU_KONTAK') {
    return <Message icon={PhoneCall} title="Petugas BPJS akan menghubungi Anda" text="Verifikasi wajah belum berhasil. Petugas resmi BPJS Kesehatan akan menelepon Anda. Hak layanan Anda tidak berubah." top={summary} />;
  }
  if (assignment.status === 'DITUTUP' || claim.status === 'DITOLAK_PESERTA' || claim.status === 'TIDAK_DIJAWAB') {
    return (
      <Message
        icon={Lock}
        title={claim.status === 'DITOLAK_PESERTA' ? 'Anda memilih tidak menjawab' : 'Pertanyaan sudah ditutup'}
        text={claim.status === 'DITOLAK_PESERTA' ? 'Pilihan Anda sudah dicatat. Hak layanan Anda tidak berubah.' : `Batas waktu menjawab ${RESPONSE_WINDOW_DAYS} hari sudah lewat. Hak layanan Anda tidak berubah.`}
        top={summary}
      />
    );
  }

  const items = [...assignment.items].sort((a, b) => a.order - b.order);
  const versions = items.map((i) => getVersion(db, i.questionId, i.questionVersion));
  const deadline = addDays(assignment.publishedAt.slice(0, 10), RESPONSE_WINDOW_DAYS);
  const verified = !!passedFaceCheck(db, assignment.id);
  const failures = failedFaceChecks(db, assignment.id);
  const denialAt = items.findIndex((it, k) => versions[k].options.find((o) => o.id === picked[it.questionId]?.optionId)?.denial);
  const lastIndex = denialAt >= 0 ? denialAt : items.length - 1;

  if (step === 'ringkasan') {
    return (
      <div className="space-y-3 p-4">
        <Back />
        <h1 className="text-lg font-semibold text-slate-900">Konfirmasi layanan kesehatan</h1>
        {summary}
        <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <li className="flex gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            {items.length} pertanyaan pilihan ganda, sekitar {Math.max(1, Math.round(items.length * 0.5))} menit. Jawab sampai {formatDateLong(deadline)}.
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
            Bila tidak ingat, pilih "Tidak ingat". Itu jawaban yang sah.
          </li>
        </ul>
        {assignment.round > 1 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Pertanyaan ini sudah diperbarui oleh BPJS Kesehatan.</p>}
        <button type="button" className={cx(big, 'bg-emerald-700 text-white')} onClick={() => setStep(verified ? 'pertanyaan' : 'frista')}>
          Mulai
        </button>
        <button type="button" className={cx(big, 'border border-slate-300 bg-white text-slate-700')} onClick={() => navigate('/peserta')}>
          Nanti saja
        </button>
        {confirmDecline ? (
          <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm">
            <p>Yakin tidak ingin menjawab? Pilihan ini dicatat dan tidak dapat diubah.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={declineState.pending} onClick={() => decline(assignment.id, actor)}>
                Ya, tidak bersedia
              </button>
              <button type="button" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setConfirmDecline(false)}>
                Batal
              </button>
            </div>
            {declineState.error && <p className="mt-2 text-xs text-red-700">{declineState.error}</p>}
          </div>
        ) : (
          <button type="button" className="w-full py-2 text-sm text-slate-500 underline" onClick={() => setConfirmDecline(true)}>
            Saya tidak bersedia menjawab
          </button>
        )}
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
        {fristaState.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{fristaState.error}</p>}
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

  if (step === 'pertanyaan') {
    const item = items[index];
    const v = versions[index];
    const choice = picked[item.questionId]?.optionId;
    const isDenial = v.options.find((o) => o.id === choice)?.denial;
    return (
      <div className="flex min-h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <button type="button" onClick={() => (index === 0 ? setStep('ringkasan') : setIndex(index - 1))} className="flex items-center gap-1 text-sm text-slate-600">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Kembali
          </button>
          <span aria-live="polite">
            Pertanyaan {index + 1} dari {items.length}
          </span>
        </div>
        <div className="mb-4 h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
        </div>
        <fieldset>
          <legend className="text-lg font-semibold leading-snug text-slate-900">{renderText(v.text, slots)}</legend>
          <div className="mt-4 space-y-2">
            {v.options.map((o) => (
              <label
                key={o.id}
                className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-base', choice === o.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200')}
              >
                <input
                  type="radio"
                  name={`q-${item.questionId}`}
                  value={o.id}
                  checked={choice === o.id}
                  onChange={() => setPicked({ ...picked, [item.questionId]: { optionId: o.id, at: new Date().toISOString() } })}
                  className="h-5 w-5 accent-emerald-700"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {isDenial && index < items.length - 1 && <p className="mt-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-700">Karena Anda tidak pernah ke sana, pertanyaan berikutnya dilewati.</p>}
        <div className="mt-auto pt-6">
          <button type="button" className={cx(big, 'bg-emerald-700 text-white')} disabled={!choice} onClick={() => (index >= lastIndex ? setStep('periksa') : setIndex(index + 1))}>
            {index >= lastIndex ? 'Periksa jawaban' : 'Lanjut'}
          </button>
        </div>
      </div>
    );
  }

  // Review and submit everything at once.
  const shown = items.slice(0, lastIndex + 1);
  const complete = shown.every((it) => picked[it.questionId]);
  return (
    <div className="space-y-3 p-4">
      <button type="button" onClick={() => { setIndex(lastIndex); setStep('pertanyaan'); }} className="flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Kembali
      </button>
      <h1 className="text-lg font-semibold text-slate-900">Periksa jawaban Anda</h1>
      <ol className="space-y-2">
        {shown.map((it, k) => {
          const v = versions[k];
          return (
            <li key={it.questionId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm text-slate-600">{renderText(v.text, slots)}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-slate-900">{v.options.find((o) => o.id === picked[it.questionId]?.optionId)?.label ?? '–'}</span>
                <button type="button" className="text-sm text-emerald-700 underline" onClick={() => { setIndex(k); setStep('pertanyaan'); }}>
                  Ubah
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {lastIndex < items.length - 1 && <p className="text-xs text-slate-500">{items.length - 1 - lastIndex} pertanyaan lain dilewati.</p>}
      {submitState.error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {submitState.error}{' '}
          <a className="underline" href={href(`/peserta/klaim/${claim.id}`)} onClick={() => { saveDraft(draftKey, null); setPicked({}); setStep('ringkasan'); }}>
            Muat ulang pertanyaan
          </a>
        </div>
      )}
      <button
        type="button"
        className={cx(big, 'bg-emerald-700 text-white')}
        disabled={!complete || submitState.pending}
        onClick={async () => {
          const session = await submit(
            {
              assignmentId: assignment.id,
              startedAt,
              answers: shown.map((it) => ({ questionId: it.questionId, questionVersion: it.questionVersion, optionId: picked[it.questionId].optionId, answeredAt: picked[it.questionId].at })),
            },
            actor,
          );
          if (session) saveDraft(draftKey, null);
        }}
      >
        {submitState.pending ? 'Mengirim…' : 'Kirim jawaban'}
      </button>
      <p className="text-center text-xs text-slate-500">Semua jawaban dikirim sekaligus dan tidak dapat diubah setelah terkirim.</p>
    </div>
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
