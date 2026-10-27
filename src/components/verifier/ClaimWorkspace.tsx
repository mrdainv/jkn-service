import { ArrowLeft, Building2, FileText, User } from 'lucide-react';
import { useState } from 'react';
import { useAction, useApp } from '../../application/context';
import { claimedNights, EVIDENCE_RULE_TEXT } from '../../domain/evidence';
import { CARE_CLASS_LABEL, CARE_TYPE_LABEL, DECISION_HELP, DECISION_LABEL, FRISTA_LABEL, SEGMENT_LABEL } from '../../domain/labels';
import { claimEvidence, currentAssignment, findClaim, fristaChecksFor, getFacility, getParticipant, getPractitioner, renderText } from '../../domain/queries';
import type { Claim, DecisionOutcome } from '../../domain/types';
import { ageOn, formatDate, formatDateTime, formatPeriod, formatRupiah } from '../../lib/format';
import { href } from '../../lib/router';
import { ClaimStatusBadge, DecisionBadge, EvidenceBadge, StrengthBadge } from '../status';
import { Badge, Button, Card, Empty, KeyValue, Notice, PageHeader, Tabs } from '../ui';
import { cx, inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';
import { QuestionPrep } from './QuestionPrep';

type Tab = 'pertanyaan' | 'jawaban' | 'keputusan' | 'riwayat';

const NEXT_STEP: Record<Claim['status'], string> = {
  DIAJUKAN: 'Periksa pemetaan, sesuaikan pertanyaan, lalu terbitkan ke peserta.',
  MENUNGGU_PESERTA: 'Menunggu peserta menjawab di Mobile JKN (batas 28 hari).',
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
            {evidence?.result && <EvidenceBadge status={evidence.result.status} priority={evidence.result.priority} />}
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
          { id: 'jawaban', label: 'Jawaban & bukti' },
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
  const checks = fristaChecksFor(db, evidence.assignment.id);
  const askedEntries = new Set(evidence.rows.map((r) => r.entry.id));
  const unasked = db.mappings.filter((m) => m.claimId === claim.id && m.target.kind === 'PROSEDUR' && (!m.entryId || !askedEntries.has(m.entryId)));
  return (
    <div className="space-y-4">
      <Card
        title="Jawaban peserta dibandingkan dengan isi klaim"
        subtitle={
          evidence.session
            ? `Sesi ${evidence.session.id} · dikirim ${formatDateTime(evidence.session.submittedAt)} lewat Mobile JKN · putaran ${evidence.assignment.round} (${evidence.assignment.id})`
            : `Putaran ${evidence.assignment.round} (${evidence.assignment.id}) terbit ${formatDateTime(evidence.assignment.publishedAt)} · belum ada jawaban`
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Pertanyaan (versi)</th>
                <th className={th}>Isi klaim</th>
                <th className={th}>Jawaban peserta</th>
                <th className={th}>Kekuatan bukti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidence.rows.map((r, i) => (
                <tr key={r.questionId}>
                  <td className={cx(td, 'tabular text-xs text-slate-500')}>{i + 1}</td>
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
                  <td className={td}>
                    {r.answer?.status === 'DILEWATI' ? (
                      <span className="text-xs text-slate-500">Dilewati (setelah penyangkalan)</span>
                    ) : r.option ? (
                      <>
                        <div className="text-sm">{r.option.label}</div>
                        <div className="text-[11px] text-slate-500">{formatDateTime(r.answer?.answeredAt)}</div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">–</span>
                    )}
                  </td>
                  <td className={td}>{evidence.session ? <StrengthBadge strength={r.strength} /> : <span className="text-xs text-slate-400">menunggu</span>}</td>
                </tr>
              ))}
              {unasked.map((m) => (
                <tr key={m.id} className="bg-slate-50/50">
                  <td className={td} />
                  <td className={cx(td, 'text-xs text-slate-500')}>Tidak ditanyakan ({m.status === 'TERPETAKAN' ? 'tidak dipilih verifikator' : 'tidak ada pertanyaan kamus yang relevan'})</td>
                  <td className={cx(td, 'text-xs text-slate-600')}>{m.target.kind === 'PROSEDUR' && `${m.target.code} ${m.target.name}`}</td>
                  <td className={td} />
                  <td className={td}>
                    <StrengthBadge strength={null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pembacaan bukti (Tabel 2)">
          {evidence.result ? (
            <>
              <EvidenceBadge status={evidence.result.status} priority={evidence.result.priority} />
              <p className="mt-2 text-sm text-slate-700">{EVIDENCE_RULE_TEXT[evidence.result.rule]}</p>
              <p className="mt-2 text-xs text-slate-500">Pembacaan ini mengurutkan pekerjaan verifikator. Ini bukan keputusan dan bukan skor AI; "Tidak ingat" tidak pernah dihitung sebagai bantahan.</p>
            </>
          ) : (
            <p className="text-sm text-slate-600">Belum ada jawaban.</p>
          )}
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
      </div>
    </div>
  );
}

const OUTCOMES: DecisionOutcome[] = ['SESUAI', 'PERLU_TINDAK_LANJUT', 'TIDAK_DAPAT_DISIMPULKAN'];

function DecisionPanel({ claim }: { claim: Claim }) {
  const { actions } = useApp();
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
      </Card>
    );
  }
  const ready = !['DIAJUKAN', 'MENUNGGU_PESERTA'].includes(claim.status);
  return (
    <Card title="Keputusan verifikator" subtitle="Keputusan manusia. AI tidak menilai keabsahan klaim, dan selama simulasi keputusan tidak mengubah pembayaran.">
      {!ready && <Notice kind="info" className="mb-3">Keputusan dapat dibuat setelah peserta menjawab atau prosesnya berakhir.</Notice>}
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
