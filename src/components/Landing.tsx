import { ArrowRight, Building2, ClipboardCheck, Smartphone } from 'lucide-react';
import { useApp } from '../application/context';
import { CLAIM_STATUS_LABEL } from '../domain/labels';
import type { ClaimStatus } from '../domain/types';
import { href } from '../lib/router';
import { Card, Notice } from './ui';

const STEPS: { title: string; who: string; text: string }[] = [
  { title: 'Klaim diajukan', who: 'Faskes', text: 'Rumah sakit mengisi formulir klaim; sistem menyimpan dan menautkannya ke peserta dan faskes.' },
  { title: 'Pemetaan kamus', who: 'Sistem', text: 'Atribut klaim dicocokkan dengan kamus pengalaman; AI (simulasi) memberi skor keyakinan per pertanyaan.' },
  { title: 'Persiapan pertanyaan', who: 'Verifikator', text: 'Setujui, sunting, atau minta draf AI untuk tindakan yang belum ada di kamus.' },
  { title: 'Terbit & notifikasi', who: 'Verifikator → Peserta', text: 'Versi pertanyaan dikunci pada putaran yang diterbitkan; peserta mendapat notifikasi.' },
  { title: 'Sesi adaptif', who: 'Peserta ↔ AI (simulasi)', text: 'Setelah FRISTA, satu pertanyaan per langkah: jawaban dievaluasi, skor diperbarui, lalu AI memilih pertanyaan berikutnya atau berhenti.' },
  { title: 'Tinjauan & analitik', who: 'Verifikator', text: 'Hasil sesi, keputusan manusia beserta dasarnya, dan dasbor yang dihitung dari catatan yang sama.' },
];

const ROLES = [
  { path: '/faskes', icon: Building2, title: 'Faskes (Rumah Sakit)', text: 'Ajukan klaim, pantau status verifikasi klaim Anda.' },
  { path: '/verifikator', icon: ClipboardCheck, title: 'Verifikator BPJS', text: 'Klaim masuk, kamus pengalaman, draf AI, konfigurasi AI, analitik, log audit.' },
  { path: '/peserta', icon: Smartphone, title: 'Peserta JKN (Mobile JKN)', text: 'Notifikasi, ringkasan layanan, FRISTA, pertanyaan, riwayat jawaban.' },
];

export function Landing() {
  const { db, store } = useApp();
  const counts = db.claims.reduce<Partial<Record<ClaimStatus, number>>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  const newest = [...db.claims].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 4);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Simulasi end-to-end</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Bawa suara peserta ke dalam verifikasi klaim</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Faskes mengajukan klaim, verifikator BPJS menyiapkan pertanyaan dari kamus pengalaman, dan peserta JKN menjawab apa yang benar-benar mereka alami. AI hanya membantu menyusun dan
          mengurutkan pertanyaan; keputusan tetap di tangan verifikator. Ketiga peran memakai catatan yang sama.
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <a key={r.path} href={href(r.path)} className="group rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm">
              <Icon className="h-5 w-5 text-emerald-700" aria-hidden />
              <div className="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-900">
                {r.title}
                <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
              <p className="mt-1 text-xs text-slate-600">{r.text}</p>
            </a>
          );
        })}
      </div>

      <Card className="mt-6" title="Alur klaim" subtitle="Setiap langkah membaca dan menulis catatan bersama di penyimpanan yang sama.">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-700 text-[11px] font-semibold text-white">{i + 1}</span>
                <span className="text-sm font-medium text-slate-900">{s.title}</span>
              </div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{s.who}</div>
              <p className="mt-1 text-xs text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Coba alurnya" subtitle="Skenario demo memakai data simulasi yang sudah disiapkan.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Buka <a className="text-emerald-800 underline" href={href('/faskes/baru')}>Faskes → Ajukan klaim</a>, isi klaim untuk peserta <b>Yohanes Situmorang</b> (kartu 0001234500059).
            </li>
            <li>
              Di <a className="text-emerald-800 underline" href={href('/verifikator')}>Verifikator → Klaim masuk</a>, buka klaim baru itu, periksa pemetaan kamus, sunting atau hapus pertanyaan, pakai <i>Tanya AI</i> untuk tindakan yang
              belum terpetakan, lalu <i>Simpan &amp; terbitkan</i>.
            </li>
            <li>
              Di <a className="text-emerald-800 underline" href={href('/peserta')}>Peserta JKN</a>, masuk sebagai Yohanes, buka notifikasi, lewati FRISTA (simulasi), jawab, kirim.
            </li>
            <li>Kembali ke verifikator: lihat jawaban dan bukti per butir, buat keputusan, lalu buka Analitik AI.</li>
          </ol>
          <div className="mt-3 text-xs text-slate-500">Klaim siap pakai di setiap tahap:</div>
          <ul className="mt-1 space-y-1 text-xs">
            {newest.map((c) => (
              <li key={c.id}>
                <a className="font-mono text-emerald-800 underline" href={href(`/verifikator/klaim/${c.id}`)}>
                  {c.id}
                </a>{' '}
                · {db.participants.find((p) => p.id === c.participantId)?.name} · {CLAIM_STATUS_LABEL[c.status]}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Isi data saat ini">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => (
              <div key={s} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt className="text-slate-600">{CLAIM_STATUS_LABEL[s]}</dt>
                <dd className="tabular font-medium text-slate-900">{counts[s] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <Notice className="mt-4" kind="warn" title="Semua data adalah simulasi">
            100 klaim historis berasal dari dataset contoh (Juni 2026); jawaban peserta, FRISTA, dan AI disimulasikan secara deterministik. Tidak ada koneksi ke sistem BPJS, FRISTA, atau
            layanan AI sungguhan. Penyimpanan: {store.backend.label}.
          </Notice>
        </Card>
      </div>
    </main>
  );
}
