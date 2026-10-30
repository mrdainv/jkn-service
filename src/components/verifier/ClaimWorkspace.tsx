import { ArrowLeft, Building2, FileText, User } from 'lucide-react';
import { useState } from 'react';
import { decisionBasis } from '../../application/commands';
import { useAction, useApp } from '../../application/context';
import { claimedNights, EVIDENCE_RULE_TEXT } from '../../domain/evidence';
import { CARE_CLASS_LABEL, CARE_TYPE_LABEL, DECISION_HELP, DECISION_LABEL, EVIDENCE_STATUS_LABEL, FRAUD_LEVEL_EFFECT, FRAUD_LEVEL_LABEL, FRISTA_LABEL, SCORE_DISCLAIMER, SEGMENT_LABEL, STOP_REASON_LABEL } from '../../domain/labels';
import { claimEvidence, configAt, currentAssignment, findClaim, fristaChecksFor, getFacility, getParticipant, getPractitioner, questionLimit, renderText } from '../../domain/queries';
import type { Claim, DecisionBasis, DecisionOutcome } from '../../domain/types';
import { ageOn, formatDate, formatDateTime, formatPeriod, formatRupiah, formatScore } from '../../lib/format';
import { href } from '../../lib/router';
import { ClaimStatusBadge, DecisionBadge, EvidenceBadge, FraudLevelBadge, StrengthBadge } from '../status';
import { Badge, Button, Card, Empty, KeyValue, Notice, PageHeader, Tabs } from '../ui';
import { cx, inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';
import { QuestionPrep } from './QuestionPrep';

type Tab = 'pertanyaan' | 'jawaban' | 'keputusan' | 'riwayat';

const NEXT_STEP: Record<Claim['status'], string> = {
  DIAJUKAN: 'Periksa pemetaan, sesuaikan pertanyaan, lalu terbitkan ke peserta.',
  MENUNGGU_PESERTA: 'Menunggu peserta menjawab di Mobile JKN (batas 28 hari). AI menanyakan satu pertanyaan per langkah dan berhenti bila aturan berhenti terpenuhi.',
  JAWABAN_DITERIMA: 'Tinjau jawaban dan bukti per butir, lalu buat keputusan.',
  PERLU_KONTAK: 'Identitas peserta belum terverifikasi lewat FRISTA; perlu kontak telepon resmi.',
  DITOLAK_PESERTA: 'Peserta memilih tidak menjawab. Putuskan dengan bukti lain.',
  TIDAK_DIJAWAB: 'Tidak ada jawaban dalam batas waktu. Putuskan dengan bukti lain.',
  SELESAI: 'Klaim sudah diputuskan.',
};

export function ClaimWorkspace({ claimId }: { claimId: string }) {
  const { db } = useApp();
  const claim = findClaim(db, claimId);
  const [tab, setTab] = useState<Tab>(() => (claim?.status === 'DIAJUKAN' || claim?.status === 'MENUNGGU_PESERTA' ? 'pertanyaan' : 'jawaban'));
  if (!claim) {
    return (
      <Empty title={`Klaim ${claimId} tidak ditemukan`}>
        <a className="underline" href={href('/verifikator/klaim')}>
          Kembali ke klaim masuk
        </a>
      </Empty>
    );
  }
  const participant = getParticipant(db, claim.participantId);
  const facility = getFacility(db, claim.facilityId);
  const doctor = getPractitioner(db, claim.practitionerId);
  const evidence = claimEvidence(db, claim);
  const nights = claimedNights(claim);

  return (
    <>
      <PageHeader
        crumbs={
          <a href={href('/verifikator/klaim')} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Klaim masuk
          </a>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{claim.id}</span>
            <ClaimStatusBadge status={claim.status} />
            {evidence?.result && <EvidenceBadge status={evidence.result.status} denied={evidence.denied} />}
            {evidence?.session && evidence.scores.answered > 0 && <FraudLevelBadge value={evidence.scores.indication} level={evidence.scores.level} />}
            {claim.decision && <DecisionBadge outcome={claim.decision.outcome} />}
          </span>
        }
        subtitle={`SEP ${claim.sepNumber} · diajukan ${formatDateTime(claim.submittedAt)} oleh ${claim.submittedBy.name}`}
      />
      <Notice kind={claim.status === 'SELESAI' ? 'success' : 'info'} className="mb-4" title="Langkah berikutnya">
        {NEXT_STEP[claim.status]}
      </Notice>
      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title={<span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-slate-400" aria-hidden />Klaim</span>}>
          <KeyValue
            items={[
              ['Rawat', `${CARE_TYPE_LABEL[claim.careType]} · ${CARE_CLASS_LABEL[claim.careClass]}`],
              ['Tanggal', `${formatDate(claim.admissionDate)} – ${formatDate(claim.dischargeDate)}${nights !== null ? ` (${nights} malam)` : ''}`],
              ['Diagnosis utama', `${claim.diagnosis.code} · ${claim.diagnosis.name}`],
              ['INA-CBG', `${claim.inaCbg.code} · ${formatRupiah(claim.inaCbg.tariff)}`],
              ['Tarif RS', formatRupiah(claim.hospitalCharge)],
              ['Diagnosis sekunder', claim.secondaryDiagnoses.map((d) => `${d.code} ${d.name}`).join('; ') || '–'],
            ]}
          />
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-sm">
            {claim.procedures.map((p) => (
              <li key={p.lineId} className="flex justify-between gap-2">
                <span>
                  <span className="font-mono text-xs text-slate-500">{p.code}</span> {p.name}
                </span>
                <span className="tabular text-xs text-slate-500">×{p.quantity}</span>
              </li>
            ))}
            {claim.procedures.length === 0 && <li className="text-xs text-slate-500">Tanpa tindakan</li>}
          </ul>
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-slate-400" aria-hidden />Faskes</span>}>
          <KeyValue
            cols={1}
            items={[
              ['Nama', facility.name],
              ['Kode faskes', <span key="code" className="font-mono">{facility.code}</span>],
              ['Kelas / kepemilikan', `Kelas ${facility.hospitalClass} · ${facility.ownership === 'PEMERINTAH' ? 'Pemerintah' : 'Swasta'} · ${facility.city}`],
              ['DPJP', `${doctor.name} (${doctor.specialty})`],
            ]}
          />
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" aria-hidden />Peserta JKN</span>}>
          <KeyValue
            cols={1}
            items={[
              ['Nama', participant.name],
              ['No. kartu', <span key="card" className="font-mono">{participant.cardNumber}</span>],
              ['Usia saat masuk / jenis kelamin', `${ageOn(participant.birthDate, claim.admissionDate)} th · ${participant.gender === 'L' ? 'Laki-laki' : 'Perempuan'}`],
              ['Segmen / hak kelas', `${SEGMENT_LABEL[participant.segment]} · ${CARE_CLASS_LABEL[participant.careClass]}`],
              ['Mobile JKN', participant.mobileJknActive ? 'Aktif' : 'Tidak aktif'],
            ]}
          />
        </Card>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: 'pertanyaan', label: 'Kamus & pertanyaan' },
          { id: 'jawaban', label: 'Sesi AI & bukti' },
          { id: 'keputusan', label: 'Keputusan' },
          { id: 'riwayat', label: 'Riwayat' },
        ]}
      />
      <div className="mt-4">
        {tab === 'pertanyaan' && <QuestionPrep key={claim.id} claim={claim} />}
        {tab === 'jawaban' && <EvidencePanel claim={claim} />}
        {tab === 'keputusan' && <DecisionPanel claim={claim} />}
        {tab === 'riwayat' && <HistoryPanel claim={claim} />}
      </div>
    </>
  );
}

function EvidencePanel({ claim }: { claim: Claim }) {
  const { db } = useApp();
  const evidence = claimEvidence(db, claim);
  const facility = getFacility(db, claim.facilityId);
  const slots = { faskes: facility.name, periode: formatPeriod(claim.admissionDate) };
  if (!evidence) return <Empty title="Belum ada pertanyaan yang diterbitkan">Siapkan dan terbitkan pertanyaan di tab Kamus &amp; pertanyaan.</Empty>;
  const { session, assignment, scores } = evidence;
  const checks = fristaChecksFor(db, assignment.id);
  const cfg = configAt(db, session?.aiConfigVersion ?? db.aiConfig.version);
  const askedEntries = new Set(evidence.rows.map((r) => r.entry.id));
  const unasked = db.mappings.filter((m) => m.claimId === claim.id && m.target.kind === 'PROSEDUR' && (!m.entryId || !askedEntries.has(m.entryId)));
  const subtitle = !session
    ? `Putaran ${assignment.round} (${assignment.id}) terbit ${formatDateTime(assignment.publishedAt)} · peserta belum memulai`
    : session.status === 'BERLANGSUNG'
      ? `Sesi ${session.id} berlangsung sejak ${formatDateTime(session.startedAt)} · ${scores.answered} jawaban sejauh ini`
      : `Sesi ${session.id} · selesai ${formatDateTime(session.endedAt)} lewat Mobile JKN · ${STOP_REASON_LABEL[session.stopReason!]}`;
  return (
    <div className="space-y-4">
      <Card title="Sesi tanya-jawab adaptif" subtitle={subtitle} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Langkah</th>
                <th className={th}>Pertanyaan (versi)</th>
                <th className={th}>Isi klaim</th>
                <th className={th}>Alasan AI memilih</th>
                <th className={th}>Jawaban peserta</th>
                <th className={th}>Evaluasi jawaban (aturan)</th>
                <th className={th}>Skor sesudahnya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidence.rows.map((r) => {
                const pick = r.answer?.pick ?? (r.pending ? session?.pending?.pick : undefined);
                return (
                  <tr key={r.questionId} className={r.answer || r.pending ? undefined : 'bg-slate-50/50'}>
                    <td className={cx(td, 'tabular text-xs text-slate-500')}>{r.answer ? `#${r.answer.iteration}` : r.pending ? `#${session?.pending?.iteration}` : '–'}</td>
                    <td className={td}>
                      <div className="text-sm">{renderText(r.version.text, slots)}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {r.questionId} v{r.questionVersion}
                      </div>
                    </td>
                    <td className={cx(td, 'text-xs text-slate-600')}>
                      {r.entry.topic === 'KEBERADAAN'
                        ? `Rawat inap di ${facility.name}`
                        : r.entry.topic === 'LAMA_RAWAT'
                          ? `${claimedNights(claim)} malam`
                          : `${r.entry.code} ${claim.procedures.find((p) => p.code === r.entry.code)?.name ?? r.entry.name}`}
                    </td>
                    <td className={cx(td, 'max-w-xs text-xs text-slate-600')}>
                      {pick ? (
                        <>
                          {pick.rationale}
                          <div className="text-[11px] text-slate-400">
                            peluang jawaban pasti {formatScore(pick.predictedDefinite)} · {pick.model.id}
                          </div>
                        </>
                      ) : r.notAsked?.kind === 'TIDAK_RELEVAN' ? (
                        <span>Dilewati AI: {r.notAsked.reason}</span>
                      ) : r.notAsked ? (
                        <span>Tidak ditanyakan: sesi berhenti lebih dulu.</span>
                      ) : (
                        <span className="text-slate-400">belum dipilih</span>
                      )}
                    </td>
                    <td className={td}>
                      {r.option ? (
                        <>
                          <div className="text-sm">{r.option.label}</div>
                          <div className="text-[11px] text-slate-500">{formatDateTime(r.answer?.answeredAt)}</div>
                        </>
                      ) : r.pending ? (
                        <span className="text-xs text-sky-700">Sedang ditanyakan</span>
                      ) : (
                        <span className="text-xs text-slate-400">–</span>
                      )}
                    </td>
                    <td className={cx(td, 'max-w-xs')}>
                      {r.evaluation ? (
                        <>
                          <span className="flex flex-wrap items-center gap-1">
                            <StrengthBadge strength={r.evaluation.strength} />
                            <span className="tabular text-[11px] text-slate-600">skor fraud pilihan {formatScore(r.evaluation.fraudScore)}</span>
                          </span>
                          <div className="mt-1 text-[11px] text-slate-500">{r.evaluation.explanation}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">–</span>
                      )}
                    </td>
                    <td className={cx(td, 'tabular text-xs')}>
                      {r.answer ? (
                        <>
                          indikasi {formatScore(r.answer.scoresAfter.indication)}
                          <div className={r.answer.scoresAfter.level === 'RENDAH' ? 'text-slate-500' : 'font-medium text-red-700'}>{FRAUD_LEVEL_LABEL[r.answer.scoresAfter.level].toLowerCase()}</div>
                          <div className="text-slate-500">dukungan {formatScore(r.answer.scoresAfter.support)}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {unasked.map((m) => (
                <tr key={m.id} className="bg-slate-50/50">
                  <td className={td} />
                  <td className={cx(td, 'text-xs text-slate-500')}>Tidak ada di putaran ({m.status === 'TERPETAKAN' ? 'tidak dipilih verifikator' : 'tidak ada pertanyaan kamus yang relevan'})</td>
                  <td className={cx(td, 'text-xs text-slate-600')}>{m.target.kind === 'PROSEDUR' && `${m.target.code} ${m.target.name}`}</td>
                  <td className={td} colSpan={4} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Hasil verifikasi sesi">
          {evidence.result ? (
            <>
              <span className="flex flex-wrap gap-1">
                <EvidenceBadge status={evidence.result.status} denied={evidence.denied} />
                <FraudLevelBadge value={scores.indication} level={scores.level} />
              </span>
              <p className="mt-2 text-sm text-slate-700">{EVIDENCE_RULE_TEXT[evidence.result.rule]}</p>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {session?.status === 'BERLANGSUNG' ? `Sesi masih berlangsung (${FRAUD_LEVEL_LABEL[scores.level].toLowerCase()}): ${FRAUD_LEVEL_EFFECT[scores.level]}` : 'Belum ada jawaban.'}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-1 text-xs">
            <dt className="text-slate-500">Indikasi fraud</dt>
            <dd className="tabular">{scores.answered ? `${formatScore(scores.indication)} · ${FRAUD_LEVEL_LABEL[scores.level].toLowerCase()}` : '–'}</dd>
            <dt className="text-slate-500">Ambang sesi (konfigurasi v{cfg.version})</dt>
            <dd className="tabular">
              sedang ≥ {formatScore(cfg.fraudMediumThreshold)} · tinggi (berhenti) ≥ {formatScore(cfg.fraudHighThreshold)}
            </dd>
            <dt className="text-slate-500">Dukungan</dt>
            <dd className="tabular">{scores.answered ? formatScore(scores.support) : '–'}</dd>
            <dt className="text-slate-500">Jawaban pasti / total</dt>
            <dd className="tabular">
              {scores.definite} / {scores.answered} (maks. {questionLimit(db, assignment, session)})
            </dd>
          </dl>
          <p className="mt-2 text-xs text-slate-500">{SCORE_DISCLAIMER} "Tidak ingat" tidak pernah dihitung sebagai bantahan.</p>
        </Card>
        <Card title="Verifikasi identitas FRISTA">
          {checks.length === 0 ? (
            <p className="text-sm text-slate-600">Peserta belum melakukan cek wajah untuk putaran ini.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {checks.map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span>
                    <Badge tone={f.result === 'COCOK' ? 'good' : f.result === 'TIDAK_COCOK' ? 'bad' : 'neutral'}>{FRISTA_LABEL[f.result]}</Badge>
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(f.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Simulasi: hanya hasil cocok/tidak cocok yang disimpan, tanpa foto atau persentase.</p>
        </Card>
        <Card title="Cara sesi berjalan">
          <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600">
            <li>FRISTA cocok membuka sesi; AI memilih satu pertanyaan dari putaran yang disetujui.</li>
            <li>Setiap jawaban dievaluasi dengan skor fraud pilihan yang dipilih × keandalan (observabilitas), lalu indikasi dibaca terhadap ambang sesi.</li>
            <li>
              Indikasi rendah: AI lanjut dengan pertanyaan yang paling mungkin dijawab pasti. Sedang (≥ {formatScore(cfg.fraudMediumThreshold)}): AI lanjut dengan pertanyaan konfirmasi.
            </li>
            <li>Sesi berhenti bila indikasi tinggi (≥ {formatScore(cfg.fraudHighThreshold)}), batas {cfg.maxQuestions} pertanyaan tercapai, atau tidak ada pertanyaan relevan.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function BasisSummary({ basis }: { basis: DecisionBasis }) {
  return (
    <dl className="grid grid-cols-2 gap-1 text-xs">
      <dt className="text-slate-500">Pembacaan bukti</dt>
      <dd>{basis.evidenceStatus === 'TANPA_JAWABAN' ? 'Tanpa jawaban peserta' : EVIDENCE_STATUS_LABEL[basis.evidenceStatus]}</dd>
      <dt className="text-slate-500">Indikasi fraud / dukungan</dt>
      <dd className="tabular">
        {formatScore(basis.indication)} / {formatScore(basis.support)}
      </dd>
      <dt className="text-slate-500">Tingkat indikasi</dt>
      <dd>{basis.level ? FRAUD_LEVEL_LABEL[basis.level] : '–'}</dd>
      <dt className="text-slate-500">Jawaban</dt>
      <dd className="tabular">{basis.answered}</dd>
      <dt className="text-slate-500">Sesi berhenti karena</dt>
      <dd>{basis.stopReason ? STOP_REASON_LABEL[basis.stopReason] : '–'}</dd>
    </dl>
  );
}

const OUTCOMES: DecisionOutcome[] = ['SESUAI', 'PERLU_TINDAK_LANJUT', 'TIDAK_DAPAT_DISIMPULKAN'];

function DecisionPanel({ claim }: { claim: Claim }) {
  const { db, actions } = useApp();
  const [outcome, setOutcome] = useState<DecisionOutcome | ''>('');
  const [reason, setReason] = useState('');
  const [decide, state] = useAction(actions.decide);
  if (claim.decision) {
    return (
      <Card title="Keputusan verifikator">
        <DecisionBadge outcome={claim.decision.outcome} />
        <p className="mt-2 text-sm text-slate-800">{claim.decision.reason}</p>
        <p className="mt-1 text-xs text-slate-500">
          {claim.decision.decidedBy.name} · {formatDateTime(claim.decision.decidedAt)}
        </p>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1 text-xs font-medium text-slate-700">Dasar evaluasi saat diputuskan</div>
          <BasisSummary basis={claim.decision.basis} />
        </div>
      </Card>
    );
  }
  const ready = !['DIAJUKAN', 'MENUNGGU_PESERTA'].includes(claim.status);
  return (
    <Card title="Keputusan verifikator" subtitle="Keputusan manusia. AI tidak menilai keabsahan klaim, dan selama simulasi keputusan tidak mengubah pembayaran.">
      {!ready && <Notice kind="info" className="mb-3">Keputusan dapat dibuat setelah peserta menjawab atau prosesnya berakhir.</Notice>}
      {ready && (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 text-xs font-medium text-slate-700">Dasar evaluasi yang disimpan bersama keputusan</div>
          <BasisSummary basis={decisionBasis(db, claim)} />
        </div>
      )}
      <fieldset disabled={!ready} className="space-y-2">
        <legend className="sr-only">Hasil keputusan</legend>
        {OUTCOMES.map((o) => (
          <label key={o} className={cx('flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2', outcome === o ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-200')}>
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-slate-900">{DECISION_LABEL[o]}</span>
              <span className="block text-xs text-slate-500">{DECISION_HELP[o]}</span>
            </span>
          </label>
        ))}
        <label htmlFor="alasan" className="block pt-2 text-xs font-medium text-slate-700">
          Alasan (wajib)
        </label>
        <textarea id="alasan" rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Jelaskan dasar keputusan, misalnya butir yang bertentangan." />
      </fieldset>
      {state.error && (
        <Notice kind="error" className="mt-3">
          {state.error}
        </Notice>
      )}
      <Button className="mt-3" variant="primary" disabled={!ready || !outcome} pending={state.pending} onClick={() => outcome && decide(claim.id, outcome, reason, VERIFIER_ACTOR)}>
        Simpan keputusan
      </Button>
    </Card>
  );
}

function HistoryPanel({ claim }: { claim: Claim }) {
  const { db } = useApp();
  const events = db.statusHistory.filter((s) => s.claimId === claim.id).sort((a, b) => a.at.localeCompare(b.at));
  const auditRows = db.audit.filter((a) => a.claimId === claim.id).sort((a, b) => a.at.localeCompare(b.at));
  const notes = db.notifications.filter((n) => n.claimId === claim.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const assignment = currentAssignment(db, claim.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Riwayat status">
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-slate-200 pl-3">
              <ClaimStatusBadge status={e.to} />
              <div className="mt-0.5 text-xs text-slate-600">{e.note}</div>
              <div className="text-[11px] text-slate-400">
                {formatDateTime(e.at)} · {e.actor.name}
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-4">
        <Card title="Notifikasi ke peserta" subtitle={assignment ? `Putaran aktif/terakhir: ${assignment.id}` : undefined}>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada notifikasi.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id}>
                  <div className="font-medium">{n.title}</div>
                  <div className="text-xs text-slate-500">
                    {n.id} · {formatDateTime(n.createdAt)} · {n.readAt ? `dibaca ${formatDateTime(n.readAt)}` : 'belum dibaca'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Log audit klaim" bodyClassName="p-0">
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-xs">
            {auditRows.map((a) => (
              <li key={a.id} className="px-4 py-2">
                <span className="font-mono text-slate-500">{a.action}</span> · {a.summary}
                <div className="text-[11px] text-slate-400">
                  {formatDateTime(a.at)} · {a.actor.name}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
