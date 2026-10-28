import { Lightbulb } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MIN_BIN_N, MIN_N, computeAnalytics, type GroupRow } from '../../../analytics/metrics';
import { histogram, proportionDiff, wilson, type Describe } from '../../../analytics/stats';
import { useApp } from '../../../application/context';
import { CLAIM_STATUS_LABEL, DECISION_LABEL, EVIDENCE_STATUS_LABEL, SCORE_DISCLAIMER, STOP_REASON_LABEL } from '../../../domain/labels';
import type { ClaimStatus, StopReason } from '../../../domain/types';
import { formatNumber, formatScore } from '../../../lib/format';
import { href } from '../../../lib/router';
import { Badge, Notice, PageHeader, Stat } from '../../ui';
import { cx, td, th } from '../../styles';
import { pct } from './display';
import { CalibrationChart, HBar, HistogramChart, Insufficient, OptionBar, PropCell, Section, StrengthLegend, WeeklyChart } from './parts';

function DescribeTable({ rows }: { rows: { label: string; d: Describe }[] }) {
  const cols: [keyof Describe, string][] = [
    ['n', 'n'],
    ['mean', 'Rata-rata'],
    ['median', 'Median'],
    ['sd', 'SD'],
    ['variance', 'Varians'],
    ['p10', 'P10'],
    ['p25', 'P25'],
    ['p75', 'P75'],
    ['p90', 'P90'],
    ['min', 'Min'],
    ['max', 'Maks'],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Kelompok</th>
            {cols.map(([, l]) => (
              <th key={l} className={cx(th, 'text-right')}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ label, d }) => (
            <tr key={label}>
              <td className={td}>{label}</td>
              {cols.map(([k]) => (
                <td key={k} className={cx(td, 'tabular text-right text-xs')}>
                  {k === 'n' ? d.n : d.n < MIN_BIN_N ? '–' : k === 'variance' ? formatNumber(d.variance ?? 0, 4) : formatScore(d[k] as number | null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({ rows, caption }: { rows: GroupRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <caption className="pb-1 text-left text-xs font-medium text-slate-700">{caption}</caption>
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Kelompok</th>
            <th className={th}>Jawaban pasti</th>
            <th className={th}>"Tidak ingat"</th>
            <th className={th}>Bertentangan dengan klaim</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={cx(td, 'text-xs')}>{r.label}</td>
              <td className={td}>
                <PropCell p={r.definite} />
              </td>
              <td className={td}>
                <PropCell p={r.unsure} compact />
              </td>
              <td className={td}>
                <PropCell p={r.contradiction} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThresholdExplorer({ pairs, configured }: { pairs: { confidence: number; definite: boolean }[]; configured: number }) {
  const [t, setT] = useState(configured);
  const above = pairs.filter((p) => p.confidence >= t);
  const below = pairs.filter((p) => p.confidence < t);
  const pa = wilson(above.filter((p) => p.definite).length, above.length);
  const pb = wilson(below.filter((p) => p.definite).length, below.length);
  const diff = pa.n >= MIN_BIN_N && pb.n >= MIN_BIN_N ? proportionDiff(pa, pb) : null;
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="ambang-uji" className="text-xs font-medium text-slate-700">
          Uji ambang keyakinan
        </label>
        <input id="ambang-uji" type="range" min={0.5} max={0.95} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-56" />
        <span className="tabular text-sm font-medium">{formatScore(t)}</span>
        <span className="text-[11px] text-slate-500">(ambang aktif di konfigurasi: {formatScore(configured)})</span>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-500">≥ ambang: jawaban pasti</div>
          <PropCell p={pa} />
          <div className="text-[11px] text-slate-500">{pct(pairs.length ? above.length / pairs.length : null, 1)} pertanyaan terjawab ({above.length} dari {pairs.length}) berada di atas ambang</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">&lt; ambang: jawaban pasti</div>
          <PropCell p={pb} />
        </div>
        <div>
          <div className="text-xs text-slate-500">Selisih (atas − bawah), IK95% Newcombe</div>
          {diff ? (
            <span className="tabular">
              {formatNumber(diff.diff * 100, 1)} poin ({formatNumber(diff.lo * 100, 1)} s.d. {formatNumber(diff.hi * 100, 1)})
            </span>
          ) : (
            <span className="text-xs text-slate-400">salah satu sisi n &lt; {MIN_BIN_N}</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Alat ini hanya memperlihatkan pertukaran pada data yang ada. Sistem tidak menyatakan ambang mana yang optimal: itu membutuhkan tujuan yang disepakati (mis. biaya pertanyaan yang tak terjawab
        vs. pertanyaan yang hilang) dan sampel yang lebih besar.
      </p>
    </div>
  );
}

export function AnalyticsView() {
  const { db } = useApp();
  const a = useMemo(() => computeAnalytics(db), [db]);
  const cfg = db.aiConfig;
  const statusMax = Math.max(1, ...Object.values(a.operations.byStatus).map((v) => v ?? 0));
  const decisionsTotal = Object.values(a.operations.decisions).reduce((x, y) => x + (y ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Analitik AI"
        subtitle={`Dihitung langsung dari ${a.totals.claims} klaim, ${a.totals.suggestions} usulan AI, ${a.totals.assignments} putaran pertanyaan, ${a.totals.sessions} sesi, dan ${a.totals.answers} jawaban yang tersimpan.`}
      />
      <Notice kind="warn" className="mb-4" title="Cara membaca halaman ini">
        Semua data adalah simulasi. <b>Keyakinan AI</b> adalah skor model simulasi tentang peluang peserta memberi jawaban pasti; itu bukan <b>kepercayaan statistik</b> (interval 95% di setiap angka)
        dan bukan <b>hasil verifikasi</b> (keputusan verifikator). Skor tinggi tidak berarti klaim sah atau bermasalah. Hubungan antarvariabel adalah asosiasi, bukan sebab-akibat.
      </Notice>
      <nav className="mb-4 flex flex-wrap gap-2 text-xs" aria-label="Bagian analitik">
        {[
          ['operasional', 'Operasional'],
          ['cakupan', 'Cakupan kamus'],
          ['keyakinan', 'Keyakinan AI'],
          ['sesi', 'Sesi adaptif'],
          ['respons', 'Respons peserta'],
          ['mutu', 'Kualitas data'],
          ['hasil', 'Hasil verifikasi'],
          ['saran', 'Saran sistem'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <Section id="operasional" title="Volume dan alur klaim" kind="observed">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Klaim" value={a.totals.claims} />
            <Stat label="Sudah diputuskan" value={a.operations.decided} sub={pct(a.totals.claims ? a.operations.decided / a.totals.claims : null)} />
            <Stat
              label="Tingkat respons peserta"
              value={pct(a.operations.responseRate.p)}
              sub={`IK95% ${pct(a.operations.responseRate.lo)}–${pct(a.operations.responseRate.hi)} · n=${a.operations.responseRate.n} putaran selesai`}
            />
            <Stat
              label="Median diajukan → terbit"
              value={a.operations.hoursToPublish.median === null ? '–' : `${formatNumber(a.operations.hoursToPublish.median, 1)} jam`}
              sub={`n=${a.operations.hoursToPublish.n}`}
            />
            <Stat
              label="Median terbit → jawaban"
              value={a.operations.hoursToResponse.median === null ? '–' : `${formatNumber(a.operations.hoursToResponse.median, 1)} jam`}
              sub={`P90 ${formatNumber(a.operations.hoursToResponse.p90 ?? 0, 0)} jam · n=${a.operations.hoursToResponse.n}`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium text-slate-700">Distribusi status klaim</h3>
              <ul className="space-y-1.5">
                {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => (
                  <li key={s} className="grid grid-cols-[11rem_1fr] items-center gap-2 text-xs">
                    <span className="text-slate-600">{CLAIM_STATUS_LABEL[s]}</span>
                    <HBar value={a.operations.byStatus[s] ?? 0} max={statusMax} label={`${CLAIM_STATUS_LABEL[s]}: ${a.operations.byStatus[s] ?? 0}`} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium text-slate-700">Klaim diajukan per minggu (minggu tanpa klaim tidak ditampilkan)</h3>
              <WeeklyChart rows={a.operations.weekly} />
            </div>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-600">Tabel mingguan</summary>
            <table className="mt-2 w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Minggu</th>
                  <th className={th}>Diajukan</th>
                  <th className={th}>Diterbitkan</th>
                  <th className={th}>Putaran selesai</th>
                  <th className={th}>Tingkat respons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.operations.weekly.map((w) => (
                  <tr key={w.week}>
                    <td className={cx(td, 'font-mono text-xs')}>{w.week}</td>
                    <td className={cx(td, 'tabular')}>{w.submitted}</td>
                    <td className={cx(td, 'tabular')}>{w.published}</td>
                    <td className={cx(td, 'tabular')}>{w.settled}</td>
                    <td className={td}>
                      <PropCell p={w.responseRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Section>

        <Section
          id="cakupan"
          title="Pemetaan dan cakupan kamus pengalaman"
          kind="observed"
          intro={`Baris tindakan pada klaim dibanding entri kamus. Ambang relevansi saat ini ${formatScore(cfg.mappingThreshold)} (konfigurasi).`}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Baris tindakan terpetakan" value={pct(a.coverage.lines ? a.coverage.mapped / a.coverage.lines : null)} sub={`${a.coverage.mapped} dari ${a.coverage.lines}`} tone="good" />
            <Stat label="Di bawah ambang" value={a.coverage.belowThreshold} sub="cocok lemah, tidak dipilih otomatis" />
            <Stat label="Tidak terpetakan" value={a.coverage.unmatched} sub="tanpa entri kamus" tone={a.coverage.unmatched ? 'warn' : undefined} />
            <Stat label="Klaim dengan celah" value={a.coverage.claimsWithGap} sub={`dari ${a.coverage.claimsWithLines} klaim bertindakan`} />
            <Stat label="Klaim terbit dgn pertanyaan tindakan" value={a.coverage.procedureCovered} sub={`dari ${a.coverage.publishedWithLines} klaim terbit bertindakan`} />
          </div>
          <p className="text-xs text-slate-600">
            Daftar kode tanpa entri dan tombol Tanya AI ada di{' '}
            <a className="text-emerald-800 underline" href={href('/verifikator/kamus')}>
              Kamus pengalaman → Celah cakupan
            </a>
            .
          </p>
        </Section>

        <Section
          id="keyakinan"
          title="Keyakinan AI (skor simulasi)"
          kind="observed"
          intro='Satu skor per usulan pertanyaan, dicatat saat klaim dipetakan. Peristiwa yang diprediksi skor: peserta memberi jawaban pasti (bukan "Tidak ingat").'
        >
          {a.confidence.all.n < MIN_N ? (
            <Insufficient n={a.confidence.all.n} need={MIN_N} what="Usulan bersekor" />
          ) : (
            <>
              <DescribeTable
                rows={[
                  { label: 'Semua usulan', d: a.confidence.all },
                  { label: 'Pertanyaan episode', d: a.confidence.episode },
                  { label: 'Pertanyaan tindakan', d: a.confidence.procedure },
                ]}
              />
              <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <HistogramChart
                  bins={histogram(a.confidence.scores, 10)}
                  threshold={cfg.autoSelectThreshold}
                  label={`Sebaran keyakinan AI, n = ${a.confidence.all.n} usulan. Garis: ambang pilih otomatis (konfigurasi).`}
                />
                <div>
                  <h3 className="text-xs font-medium text-slate-700">Keyakinan AI vs. tindakan verifikator</h3>
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full min-w-[460px]">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className={th}>Keyakinan</th>
                          <th className={cx(th, 'text-right')}>n</th>
                          <th className={cx(th, 'text-right')}>Diterima</th>
                          <th className={cx(th, 'text-right')}>Disunting</th>
                          <th className={cx(th, 'text-right')}>Dihapus</th>
                          <th className={th}>Dipertahankan (IK95%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {a.acceptance.map((b) => (
                          <tr key={b.band}>
                            <td className={cx(td, 'text-xs')}>{b.band}</td>
                            <td className={cx(td, 'tabular text-right text-xs')}>{b.n}</td>
                            <td className={cx(td, 'tabular text-right text-xs')}>{b.accepted}</td>
                            <td className={cx(td, 'tabular text-right text-xs')}>{b.edited}</td>
                            <td className={cx(td, 'tabular text-right text-xs')}>{b.removed}</td>
                            <td className={td}>
                              <PropCell p={b.kept} compact />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Usulan di atas ambang dicentang otomatis, jadi angka penerimaan ikut dipengaruhi pengaturan, bukan hanya mutu skor. Dicentang otomatis: dipertahankan{' '}
                    {pct(a.keptBySelection.preselected.p)} (n={a.keptBySelection.preselected.n}); tidak dicentang: {pct(a.keptBySelection.notPreselected.p)} (n={a.keptBySelection.notPreselected.n}).
                  </p>
                </div>
              </div>
            </>
          )}
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <div>
              <h3 className="text-xs font-medium text-slate-700">Kalibrasi: skor vs. jawaban pasti yang teramati</h3>
              {a.calibration.sufficient ? (
                <>
                  <CalibrationChart bins={a.calibration.bins} />
                  <p className="text-[11px] text-slate-500">Titik = rentang keyakinan dengan n ≥ {MIN_BIN_N}; garis tegak = IK95% Wilson; garis miring = kalibrasi sempurna.</p>
                </>
              ) : (
                <Insufficient n={a.calibration.n} need={MIN_N} what="Pertanyaan terjawab yang bersekor" />
              )}
            </div>
            <div className="min-w-0 space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Keyakinan</th>
                      <th className={cx(th, 'text-right')}>n</th>
                      <th className={cx(th, 'text-right')}>Rata-rata skor</th>
                      <th className={th}>Jawaban pasti (IK95%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.calibration.bins.map((b) => (
                      <tr key={b.band}>
                        <td className={cx(td, 'text-xs')}>{b.band}</td>
                        <td className={cx(td, 'tabular text-right text-xs')}>{b.n}</td>
                        <td className={cx(td, 'tabular text-right text-xs')}>{b.n ? formatScore(b.meanPred) : '–'}</td>
                        <td className={td}>
                          <PropCell p={b.ci} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {a.calibration.sufficient && (
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Rata-rata skor vs. teramati</dt>
                    <dd className="tabular">
                      {formatScore(a.calibration.meanPred)} vs. {pct(a.calibration.observed.p)} (n={a.calibration.n})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Skor Brier · ECE</dt>
                    <dd className="tabular">
                      {formatNumber(a.calibration.brier ?? 0, 3)} · {formatNumber(a.calibration.ece ?? 0, 3)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Korelasi Spearman skor ↔ jawaban pasti</dt>
                    <dd className="tabular">
                      {a.calibration.correlation
                        ? `ρ = ${formatNumber(a.calibration.correlation.r, 2)} (IK95% ${formatNumber(a.calibration.correlation.lo, 2)} s.d. ${formatNumber(a.calibration.correlation.hi, 2)}; n=${a.calibration.correlation.n})`
                        : 'data belum cukup'}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
          {a.calibration.sufficient && <ThresholdExplorer pairs={a.calibration.pairs} configured={cfg.autoSelectThreshold} />}
        </Section>

        <Section
          id="sesi"
          title="Sesi tanya-jawab adaptif"
          kind="observed"
          intro={`Setiap sesi menanyakan satu pertanyaan per langkah dan berhenti menurut aturan. ${SCORE_DISCLAIMER}`}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Sesi selesai" value={a.adaptive.sessions} sub={`${a.adaptive.open} masih berlangsung`} />
            <Stat
              label="Median pertanyaan ditanyakan"
              value={a.adaptive.asked.median === null ? '–' : formatNumber(a.adaptive.asked.median, 1)}
              sub={`dari median ${a.adaptive.roundSize.median === null ? '–' : formatNumber(a.adaptive.roundSize.median, 1)} yang disetujui`}
            />
            <Stat label="Berhenti karena indikasi maksimum" value={a.adaptive.stopReasons.INDIKASI_MAKSIMUM ?? 0} sub={`${a.adaptive.reachedStop} sesi dengan indikasi 1,00`} />
            <Stat label="Pertanyaan dilewati AI" value={a.adaptive.skippedIrrelevant} sub="tidak relevan setelah jawaban sebelumnya" />
            <Stat label="Median indikasi akhir" value={formatScore(a.adaptive.indication.median)} sub={`median dukungan ${formatScore(a.adaptive.support.median)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium text-slate-700">Alasan sesi berhenti</h3>
              <ul className="space-y-1.5">
                {(Object.keys(STOP_REASON_LABEL) as StopReason[]).map((r) => (
                  <li key={r} className="grid grid-cols-[16rem_1fr] items-center gap-2 text-xs">
                    <span className="text-slate-600">{STOP_REASON_LABEL[r]}</span>
                    <HBar value={a.adaptive.stopReasons[r] ?? 0} max={Math.max(1, a.adaptive.sessions)} label={`${STOP_REASON_LABEL[r]}: ${a.adaptive.stopReasons[r] ?? 0}`} />
                  </li>
                ))}
              </ul>
            </div>
            <DescribeTable
              rows={[
                { label: 'Pertanyaan ditanyakan per sesi', d: a.adaptive.asked },
                { label: 'Indikasi akhir', d: a.adaptive.indication },
                { label: 'Dukungan akhir', d: a.adaptive.support },
              ]}
            />
          </div>
        </Section>

        <Section
          id="respons"
          title="Respons peserta per pertanyaan"
          kind="observed"
          intro={`Putaran terakhir per klaim. "Tidak terjawab" = tanpa respons dalam batas waktu; "Tidak ditanyakan" = sesi berhenti atau AI menilai tidak relevan sebelum pertanyaan ini. Sesi yang masih berjalan tidak dihitung. Interval tidak ditampilkan bila n < ${MIN_BIN_N}.`}
        >
          <StrengthLegend />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Pertanyaan</th>
                  <th className={cx(th, 'text-right')}>Terbit</th>
                  <th className={cx(th, 'text-right')}>Dijawab</th>
                  <th className={th}>Tidak terjawab</th>
                  <th className={th}>Tidak ditanyakan</th>
                  <th className={th}>"Tidak ingat"</th>
                  <th className={th}>Bertentangan</th>
                  <th className={th}>Sebaran jawaban</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.questions.map((q) => (
                  <tr key={q.questionId}>
                    <td className={cx(td, 'text-xs')}>
                      {q.entryCode && <span className="font-mono">{q.entryCode} · </span>}
                      {q.entryName}
                      <div className="font-mono text-[11px] text-slate-500">
                        {q.questionId} · versi {q.versions.join(', ')}
                      </div>
                    </td>
                    <td className={cx(td, 'tabular text-right text-xs')}>{q.published}</td>
                    <td className={cx(td, 'tabular text-right text-xs')}>{q.answered}</td>
                    <td className={td}>
                      <PropCell p={q.unanswered} compact />
                    </td>
                    <td className={td}>
                      <PropCell p={q.notAsked} compact />
                    </td>
                    <td className={td}>
                      <PropCell p={q.unsure} compact />
                    </td>
                    <td className={td}>
                      <PropCell p={q.contradiction} compact />
                    </td>
                    <td className={td}>
                      <OptionBar options={q.options} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <GroupTable rows={a.byOrigin} caption="Pertanyaan tindakan menurut asal kalimat" />
            <GroupTable rows={a.byObservability} caption="Pertanyaan tindakan menurut observabilitas entri" />
            <GroupTable rows={a.byAge} caption="Semua pertanyaan menurut usia peserta" />
          </div>
          <p className="text-[11px] text-slate-500">
            Perbedaan antarkelompok adalah asosiasi. Kalimat yang disunting verifikator dipakai pada klaim yang berbeda dari kalimat aslinya, dan kelompok kecil memiliki interval lebar; jangan
            menyimpulkan bahwa suntingan atau asal kalimat menyebabkan perbedaan.
          </p>
        </Section>

        <Section id="mutu" title="Kualitas data dan konsistensi jawaban" kind="observed">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Jawaban tidak konsisten"
              value={a.quality.nightsInconsistent.n ? `${a.quality.nightsInconsistent.k} / ${a.quality.nightsInconsistent.n}` : '–'}
              sub={'"Pulang hari itu" tetapi menyebut jumlah malam'}
            />
            <Stat label="Putaran tanpa respons" value={pct(a.quality.noResponse.p)} sub={`${a.quality.noResponse.k} dari ${a.quality.noResponse.n} putaran selesai`} />
            <Stat label="Butir tidak ditanyakan" value={a.quality.notAsked} sub={`sesi berhenti lebih dulu; ${a.quality.skippedIrrelevant} dinilai tidak relevan`} />
            <Stat
              label="FRISTA tidak cocok / tidak tersedia"
              value={`${a.quality.fristaMismatch} / ${a.quality.fristaUnavailable}`}
              sub={`dari ${a.quality.fristaChecks} pemeriksaan; ${a.quality.routedToPhone} dialihkan ke telepon`}
            />
            <Stat label="Peserta tidak bersedia" value={a.quality.declined} />
            <Stat label="Lewat batas waktu" value={a.quality.expired} />
            <Stat label="Belum terbit > 48 jam" value={a.quality.unpublishedOver2Days} tone={a.quality.unpublishedOver2Days ? 'warn' : undefined} />
            <Stat label="Jawaban masuk, belum diputuskan" value={a.quality.answeredUndecided} tone={a.quality.answeredUndecided ? 'warn' : undefined} />
          </div>
          <p className="text-[11px] text-slate-500">{a.quality.manualQuestions} pertanyaan terbit ditambahkan manual tanpa skor AI; pertanyaan itu tidak ikut analisis keyakinan.</p>
        </Section>

        <Section
          id="hasil"
          title="Keputusan verifikator dan pembacaan bukti"
          kind="observed"
          intro="Keputusan dibuat manusia. Tabel ini memperlihatkan bagaimana keputusan sejalan dengan pembacaan Tabel 2; ini bukan ukuran akurasi AI."
        >
          {decisionsTotal === 0 ? (
            <Insufficient n={0} need={1} what="Keputusan" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Pembacaan bukti</th>
                    {(['SESUAI', 'PERLU_TINDAK_LANJUT', 'TIDAK_DAPAT_DISIMPULKAN', 'BELUM'] as const).map((d) => (
                      <th key={d} className={cx(th, 'text-right')}>
                        {d === 'BELUM' ? 'Belum diputuskan' : DECISION_LABEL[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(['PERLU_DIPERIKSA', 'BUKTI_TIDAK_CUKUP', 'KONSISTEN', 'TANPA_JAWABAN'] as const).map((e) => (
                    <tr key={e}>
                      <td className={cx(td, 'text-xs')}>{e === 'TANPA_JAWABAN' ? 'Tanpa jawaban peserta' : EVIDENCE_STATUS_LABEL[e]}</td>
                      {(['SESUAI', 'PERLU_TINDAK_LANJUT', 'TIDAK_DAPAT_DISIMPULKAN', 'BELUM'] as const).map((d) => (
                        <td key={d} className={cx(td, 'tabular text-right text-xs')}>
                          {a.outcomeTable.find((r) => r.evidence === e && r.decision === d)?.count ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          id="saran"
          title="Area yang perlu ditinjau"
          kind="suggestion"
          intro="Disusun oleh aturan sederhana dari metrik di atas. Ini saran untuk diperiksa verifikator, bukan kesimpulan. Pertanyaan baru tetap melalui draf AI dan persetujuan verifikator."
        >
          {a.recommendations.length === 0 ? (
            <p className="text-sm text-slate-600">Tidak ada pola yang melewati batas aturan dengan data saat ini.</p>
          ) : (
            <ul className="space-y-2">
              {a.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-violet-100 bg-violet-50/40 p-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                  <div className="text-sm">
                    <div className="text-slate-900">{r.text}</div>
                    <div className="mt-0.5 text-xs text-slate-600">{r.basis}</div>
                    {r.link && (
                      <a className="mt-1 inline-block text-xs text-emerald-800 underline" href={href(r.link)}>
                        Buka
                      </a>
                    )}
                  </div>
                  <Badge tone="violet" className="ml-auto self-start">
                    {r.kind.replaceAll('_', ' ').toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
