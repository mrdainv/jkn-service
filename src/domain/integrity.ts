import { optionScoreProblem } from './checks';
import { claimedNights } from './evidence';
import type { Db } from './types';
import { appliedFraudScore, fraudLevel, thresholdsOf } from './verification';

/**
 * Referential integrity of the shared database: every reference resolves, published questions and
 * answers point at existing question versions, and statuses agree with the records behind them.
 * Returns human-readable problems; an empty list means the records are consistent.
 */
export function checkIntegrity(db: Db): string[] {
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);
  const ids = <T extends { id: string }>(name: string, items: readonly T[]) => {
    const set = new Set<string>();
    for (const item of items) {
      if (set.has(item.id)) fail(`${name}: ID ganda ${item.id}`);
      set.add(item.id);
    }
    return set;
  };

  const participants = ids('participants', db.participants);
  const facilities = ids('facilities', db.facilities);
  ids('practitioners', db.practitioners);
  const claims = ids('claims', db.claims);
  const entries = ids('dictionary', db.dictionary);
  ids('questions', db.questions);
  const mappings = ids('mappings', db.mappings);
  const suggestions = ids('suggestions', db.suggestions);
  ids('drafts', db.drafts);
  const assignments = ids('assignments', db.assignments);
  ids('notifications', db.notifications);
  const fristas = ids('fristaChecks', db.fristaChecks);
  const sessions = ids('sessions', db.sessions);
  ids('answers', db.answers);
  ids('statusHistory', db.statusHistory);
  ids('audit', db.audit);

  const claimById = new Map(db.claims.map((c) => [c.id, c]));
  const questionById = new Map(db.questions.map((q) => [q.id, q]));
  const assignmentById = new Map(db.assignments.map((a) => [a.id, a]));
  const versionExists = (questionId: string, version: number) =>
    questionById.get(questionId)?.versions.some((v) => v.version === version) ?? false;

  for (const p of db.practitioners) if (!facilities.has(p.facilityId)) fail(`DPJP ${p.id}: faskes ${p.facilityId} tidak ada`);

  const seps = new Set<string>();
  for (const c of db.claims) {
    if (seps.has(c.sepNumber)) fail(`Klaim ${c.id}: SEP ganda ${c.sepNumber}`);
    seps.add(c.sepNumber);
    if (!participants.has(c.participantId)) fail(`Klaim ${c.id}: peserta ${c.participantId} tidak ada`);
    if (!facilities.has(c.facilityId)) fail(`Klaim ${c.id}: faskes ${c.facilityId} tidak ada`);
    const doctor = db.practitioners.find((p) => p.id === c.practitionerId);
    if (!doctor || doctor.facilityId !== c.facilityId) fail(`Klaim ${c.id}: DPJP bukan dari faskes klaim`);
    const history = db.statusHistory.filter((s) => s.claimId === c.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    if (!history.length) fail(`Klaim ${c.id}: tanpa riwayat status`);
    else if (history[history.length - 1].to !== c.status) fail(`Klaim ${c.id}: status ${c.status} tidak sama dengan riwayat terakhir`);
    if ((c.status === 'SELESAI') !== (c.decision !== null)) fail(`Klaim ${c.id}: status SELESAI dan keputusan tidak selaras`);
    const basisSession = c.decision?.basis.sessionId;
    if (basisSession && db.sessions.find((x) => x.id === basisSession)?.claimId !== c.id) fail(`Klaim ${c.id}: dasar keputusan menunjuk sesi klaim lain`);
    const active = db.assignments.filter((a) => a.claimId === c.id && a.status === 'AKTIF');
    if (active.length > 1) fail(`Klaim ${c.id}: lebih dari satu putaran aktif`);
  }
  for (const s of db.statusHistory) if (!claims.has(s.claimId)) fail(`Riwayat ${s.id}: klaim tidak ada`);

  for (const q of db.questions) {
    if (!entries.has(q.entryId)) fail(`Pertanyaan ${q.id}: entri ${q.entryId} tidak ada`);
    q.versions.forEach((v, i) => {
      if (v.version !== i + 1) fail(`Pertanyaan ${q.id}: nomor versi tidak berurutan`);
      if (new Set(v.options.map((o) => o.id)).size !== v.options.length) fail(`Pertanyaan ${q.id} v${v.version}: ID pilihan ganda`);
      for (const o of v.options) {
        const problem = optionScoreProblem(o);
        if (problem) fail(`Pertanyaan ${q.id} v${v.version}: skor fraud pilihan ${o.id} ${problem}`);
      }
    });
  }

  for (const m of db.mappings) {
    if (!claims.has(m.claimId)) fail(`Pemetaan ${m.id}: klaim tidak ada`);
    if (m.entryId && !entries.has(m.entryId)) fail(`Pemetaan ${m.id}: entri tidak ada`);
    if (m.target.kind === 'PROSEDUR') {
      const t = m.target;
      if (!claimById.get(m.claimId)?.procedures.some((p) => p.lineId === t.lineId && p.code === t.code)) fail(`Pemetaan ${m.id}: baris tindakan tidak ada di klaim`);
    }
  }

  for (const s of db.suggestions) {
    if (!claims.has(s.claimId)) fail(`Usulan ${s.id}: klaim tidak ada`);
    if (!versionExists(s.questionId, s.questionVersion)) fail(`Usulan ${s.id}: versi pertanyaan tidak ada`);
    if (s.mappingId && !mappings.has(s.mappingId)) fail(`Usulan ${s.id}: pemetaan tidak ada`);
    if (s.aiConfidence < 0 || s.aiConfidence > 1) fail(`Usulan ${s.id}: keyakinan di luar 0–1`);
  }

  for (const sel of db.selections) {
    if (!claims.has(sel.claimId)) fail(`Pilihan ${sel.claimId}: klaim tidak ada`);
    for (const item of sel.items) {
      if (!versionExists(item.questionId, item.version)) fail(`Pilihan ${sel.claimId}: ${item.questionId} v${item.version} tidak ada`);
      if (item.suggestionId && !suggestions.has(item.suggestionId)) fail(`Pilihan ${sel.claimId}: usulan ${item.suggestionId} tidak ada`);
    }
  }

  for (const d of db.drafts) {
    if (d.claimId && !claims.has(d.claimId)) fail(`Draf ${d.id}: klaim tidak ada`);
    if (d.status === 'DISETUJUI' && (!d.approvedEntryId || !entries.has(d.approvedEntryId) || !d.approvedQuestionId || !questionById.has(d.approvedQuestionId))) {
      fail(`Draf ${d.id}: disetujui tanpa entri/pertanyaan`);
    }
  }

  for (const a of db.assignments) {
    const claim = claimById.get(a.claimId);
    if (!claim) fail(`Putaran ${a.id}: klaim tidak ada`);
    else if (claim.participantId !== a.participantId) fail(`Putaran ${a.id}: peserta berbeda dari klaim`);
    for (const item of a.items) if (!versionExists(item.questionId, item.questionVersion)) fail(`Putaran ${a.id}: ${item.questionId} v${item.questionVersion} tidak ada`);
    if (a.supersededBy && !assignments.has(a.supersededBy)) fail(`Putaran ${a.id}: pengganti tidak ada`);
    const session = db.sessions.find((s) => s.assignmentId === a.id);
    const answered = session ? db.answers.filter((x) => x.sessionId === session.id).length : 0;
    if (a.status === 'DIJAWAB' && !(session?.status === 'SELESAI' && answered > 0)) fail(`Putaran ${a.id}: DIJAWAB tanpa sesi selesai berisi jawaban`);
    if (a.status === 'AKTIF' && session && session.status !== 'BERLANGSUNG') fail(`Putaran ${a.id}: AKTIF dengan sesi yang sudah selesai`);
    if (a.status === 'DIGANTIKAN' && session) fail(`Putaran ${a.id}: digantikan padahal sesi sudah dimulai`);
    if (session?.status === 'BERLANGSUNG' && a.status !== 'AKTIF') fail(`Putaran ${a.id}: sesi berlangsung pada putaran ${a.status}`);
  }

  for (const n of db.notifications) {
    if (!participants.has(n.participantId)) fail(`Notifikasi ${n.id}: peserta tidak ada`);
    if (claimById.get(n.claimId)?.participantId !== n.participantId) fail(`Notifikasi ${n.id}: klaim bukan milik peserta`);
    if (n.assignmentId && !assignments.has(n.assignmentId)) fail(`Notifikasi ${n.id}: putaran tidak ada`);
  }

  for (const f of db.fristaChecks) {
    const a = assignmentById.get(f.assignmentId);
    if (!a || a.claimId !== f.claimId || a.participantId !== f.participantId) fail(`FRISTA ${f.id}: tidak cocok dengan putaran`);
  }

  const sessionPerAssignment = new Set<string>();
  for (const s of db.sessions) {
    const a = assignmentById.get(s.assignmentId);
    if (!a || a.claimId !== s.claimId || a.participantId !== s.participantId) fail(`Sesi ${s.id}: tidak cocok dengan putaran`);
    if (sessionPerAssignment.has(s.assignmentId)) fail(`Sesi ${s.id}: lebih dari satu sesi untuk ${s.assignmentId}`);
    sessionPerAssignment.add(s.assignmentId);
    const face = db.fristaChecks.find((f) => f.id === s.fristaCheckId);
    if (!fristas.has(s.fristaCheckId) || face?.result !== 'COCOK' || face.assignmentId !== s.assignmentId) fail(`Sesi ${s.id}: tanpa FRISTA cocok`);
    if (s.status === 'BERLANGSUNG' && (!s.pending || s.stopReason || s.endedAt)) fail(`Sesi ${s.id}: berlangsung tanpa pertanyaan aktif`);
    if (s.status === 'SELESAI' && (s.pending || !s.stopReason || !s.endedAt)) fail(`Sesi ${s.id}: selesai tanpa alasan berhenti`);
    if (s.pending && !a?.items.some((i) => i.questionId === s.pending!.questionId && i.questionVersion === s.pending!.questionVersion)) fail(`Sesi ${s.id}: pertanyaan aktif tidak ada di putaran`);
    const own = db.answers.filter((x) => x.sessionId === s.id).sort((x, y) => x.iteration - y.iteration);
    own.forEach((x, i) => {
      if (x.iteration !== i + 1) fail(`Sesi ${s.id}: urutan iterasi jawaban tidak berurutan`);
      if (x.claimId !== s.claimId || x.assignmentId !== s.assignmentId) fail(`Jawaban ${x.id}: klaim/putaran berbeda dari sesinya`);
    });
    if (new Set(own.map((x) => x.questionId)).size !== own.length) fail(`Sesi ${s.id}: pertanyaan yang sama dijawab dua kali`);
    if (s.pending && s.pending.iteration !== own.length + 1) fail(`Sesi ${s.id}: iterasi pertanyaan aktif tidak berurutan`);
    for (const k of s.skipped) if (own.some((x) => x.questionId === k.questionId)) fail(`Sesi ${s.id}: ${k.questionId} dilewati sekaligus dijawab`);
    // Levels are read once, with the thresholds the session ran under; a TINGGI level always ends the session there.
    const cfg = s.aiConfigVersion === db.aiConfig.version ? db.aiConfig : db.aiConfigHistory.find((c) => c.version === s.aiConfigVersion);
    if (!cfg) fail(`Sesi ${s.id}: versi konfigurasi ${s.aiConfigVersion} tidak ada`);
    own.forEach((x, i) => {
      if (cfg && x.scoresAfter.level !== fraudLevel(x.scoresAfter.indication, thresholdsOf(cfg))) fail(`Jawaban ${x.id}: tingkat indikasi tidak sesuai ambang sesi`);
      if (x.scoresAfter.level === 'TINGGI' && (i < own.length - 1 || s.status !== 'SELESAI' || s.stopReason !== 'INDIKASI_TINGGI')) fail(`Sesi ${s.id}: tidak berhenti pada indikasi tinggi`);
    });
    if (s.stopReason === 'INDIKASI_TINGGI' && own.at(-1)?.scoresAfter.level !== 'TINGGI') fail(`Sesi ${s.id}: berhenti karena indikasi tinggi tanpa jawaban bertingkat tinggi`);
  }

  for (const ans of db.answers) {
    if (!sessions.has(ans.sessionId)) fail(`Jawaban ${ans.id}: sesi tidak ada`);
    const a = assignmentById.get(ans.assignmentId);
    if (!a?.items.some((i) => i.questionId === ans.questionId && i.questionVersion === ans.questionVersion)) {
      fail(`Jawaban ${ans.id}: ${ans.questionId} v${ans.questionVersion} tidak diterbitkan di ${ans.assignmentId}`);
    }
    const version = questionById.get(ans.questionId)?.versions.find((v) => v.version === ans.questionVersion);
    const option = version?.options.find((o) => o.id === ans.optionId);
    if (!option) fail(`Jawaban ${ans.id}: pilihan ${ans.optionId} tidak ada`);
    const claim = claimById.get(ans.claimId);
    if (option && claim && ans.evaluation.fraudScore !== appliedFraudScore(option, claimedNights(claim))) fail(`Jawaban ${ans.id}: skor fraud bukan milik pilihan yang dipilih`);
    const sc = ans.scoresAfter;
    if (![sc.indication, sc.support, ans.evaluation.reliability, ans.evaluation.fraudScore, ans.pick.predictedDefinite].every((x) => x >= 0 && x <= 1)) fail(`Jawaban ${ans.id}: skor di luar 0–1`);
    if (sc.indication === 1 && !db.answers.some((x) => x.sessionId === ans.sessionId && x.iteration <= ans.iteration && x.evaluation.denial)) fail(`Jawaban ${ans.id}: indikasi 1 tanpa penyangkalan`);
  }
  return problems;
}
