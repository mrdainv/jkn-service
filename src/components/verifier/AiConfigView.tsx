import { Eye, EyeOff, Save, Sparkles } from 'lucide-react';
import { getGeminiApiKey, getGeminiModel, setGeminiApiKey, setGeminiModel, testGeminiConnection } from '../../ai/geminiAi';
import { useState } from 'react';
import { useAction, useApp } from '../../application/context';
import { AI_REQUEST_FIELDS } from '../../ai/service';
import { MAX_POOL_QUESTIONS, RESPONSE_WINDOW_DAYS } from '../../application/commands';
import { FRAUD_LEVEL_EFFECT, FRAUD_LEVEL_LABEL } from '../../domain/labels';
import { DEFAULT_OBSERVABILITY, EVALUATION_RULES } from '../../domain/verification';
import { formatDateTime, formatScore } from '../../lib/format';
import { Badge, Button, Card, Field, KeyValue, Notice, PageHeader } from '../ui';
import { cx, inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';

export function AiConfigView() {
  const { db, actions, ai } = useApp();
  const cfg = db.aiConfig;
  const [form, setForm] = useState({
    mappingThreshold: String(cfg.mappingThreshold),
    autoSelectThreshold: String(cfg.autoSelectThreshold),
    maxQuestions: String(cfg.maxQuestions),
    draftWarningThreshold: String(cfg.draftWarningThreshold),
    fraudMediumThreshold: String(cfg.fraudMediumThreshold),
    fraudHighThreshold: String(cfg.fraudHighThreshold),
  });
  const [save, state] = useAction(actions.updateAiConfig);
  const [saved, setSaved] = useState(false);
  const [geminiKey, setGeminiKey] = useState(getGeminiApiKey);
  const [geminiModelChoice, setGeminiModelChoice] = useState(getGeminiModel);
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const patch = {
    mappingThreshold: Number(form.mappingThreshold),
    autoSelectThreshold: Number(form.autoSelectThreshold),
    maxQuestions: Number(form.maxQuestions),
    draftWarningThreshold: Number(form.draftWarningThreshold),
    fraudMediumThreshold: Number(form.fraudMediumThreshold),
    fraudHighThreshold: Number(form.fraudHighThreshold),
  };
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] !== cfg[k]);
  const history = [...db.aiConfigHistory, cfg].reverse();
  const field = (key: keyof typeof form, label: string, hint: string, step = '0.05', max = '1', min = '0') => (
    <Field label={label} htmlFor={key} hint={hint}>
      <input id={key} type="number" step={step} min={min} max={max} className={inputCls} value={form[key]} onChange={(e) => { setSaved(false); setForm({ ...form, [key]: e.target.value }); }} />
    </Field>
  );
  return (
    <>
      <PageHeader title="Konfigurasi AI" subtitle="Pengaturan yang dipakai sistem. Bagian ini berisi konfigurasi, bukan metrik; dampaknya terlihat di Analitik AI." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Layanan AI" className="lg:col-span-1">
          <KeyValue
            cols={1}
            items={[
              ['Mode', <Badge key="mode" tone={ai.info.kind === 'MODEL_EKSTERNAL' ? 'good' : 'warn'}>{ai.info.label}</Badge>],
              ['Model', <span key="model" className="font-mono">{ai.info.id} v{ai.info.version}</span>],
              ['Yang diprediksi skor', ai.info.confidenceEventText],
              ['Peringkat (saat klaim diajukan)', AI_REQUEST_FIELDS.rank.join(', ')],
              ['Pertanyaan berikutnya (tiap langkah sesi)', AI_REQUEST_FIELDS.next.join(', ')],
              ['Draf (Tanya AI)', AI_REQUEST_FIELDS.draft.join(', ')],
              ['Tidak pernah dikirim', 'Nama, nomor kartu, tanggal lahir, atau alamat peserta.'],
              ['Batas waktu menjawab', `${RESPONSE_WINDOW_DAYS} hari (ditetapkan sistem)`],
            ]}
          />
          <Notice kind={ai.info.kind === 'MODEL_EKSTERNAL' ? 'success' : 'info'} className="mt-3">
            {ai.info.kind === 'MODEL_EKSTERNAL'
              ? 'Layanan GenAI nyata aktif. Draf pertanyaan dan opsi jawaban akan disusun langsung oleh Google Gemini berbasis pengalaman sensoris URD v0.4 (E6).'
              : 'Mode simulasi deterministik aktif. Masukkan Google Gemini API Key pada form di bawah untuk mengaktifkan AI generatif nyata.'}
          </Notice>
          <div className="mt-3 text-xs text-slate-600">
            <div className="font-medium text-slate-700">Evaluasi jawaban ({EVALUATION_RULES}, aturan, bukan AI)</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Setiap pilihan jawaban punya skor fraud sendiri (0–1), disimpan di versi pertanyaan dan dapat disunting verifikator. Pertanyaan tidak punya skor.</li>
              <li>Keandalan = observabilitas entri (default {DEFAULT_OBSERVABILITY}) bila jawaban pasti, 0 bila "Tidak ingat".</li>
              <li>Bobot fraud jawaban = skor fraud pilihan yang dipilih × keandalan; penyangkalan bernilai 1. Rentang malam hanya berbobot bila klaim di luar rentang.</li>
              <li>Indikasi fraud = gabungan noisy-OR bobot fraud; mencapai 1,00 hanya lewat penyangkalan. Dukungan dihitung dengan cara yang sama dari jawaban yang mendukung.</li>
              <li>Tingkat indikasi dibaca dari ambang di samping, dengan konfigurasi saat sesi dimulai:</li>
            </ul>
            <ul className="mt-1 space-y-0.5 pl-4">
              {(['RENDAH', 'SEDANG', 'TINGGI'] as const).map((l) => (
                <li key={l}>
                  <span className="font-medium">{FRAUD_LEVEL_LABEL[l]}</span>
                  {l === 'RENDAH' ? ` (< ${formatScore(cfg.fraudMediumThreshold)})` : l === 'SEDANG' ? ` (≥ ${formatScore(cfg.fraudMediumThreshold)})` : ` (≥ ${formatScore(cfg.fraudHighThreshold)})`}: {FRAUD_LEVEL_EFFECT[l]}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden />
              Koneksi Google Gemini API (GenAI)
            </div>
            <div className="mt-2 space-y-2">
              <Field label="Gemini API Key" htmlFor="gemini-key" hint="Disimpan aman di browser lokal Anda (localStorage)">
                <div className="relative">
                  <input
                    id="gemini-key"
                    type={showKey ? 'text' : 'password'}
                    className={cx(inputCls, 'pr-8 font-mono text-xs')}
                    value={geminiKey}
                    placeholder="AIzaSy..."
                    onChange={(e) => {
                      setGeminiKey(e.target.value);
                      setTestStatus(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    title={showKey ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </Field>

              <Field label="Model Gemini" htmlFor="gemini-model">
                <select
                  id="gemini-model"
                  className={cx(inputCls, 'text-xs')}
                  value={geminiModelChoice}
                  onChange={(e) => setGeminiModelChoice(e.target.value)}
                >
                  <option value="gemini-flash-latest">Gemini Flash Latest (Direkomendasikan)</option>
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
              </Field>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setGeminiApiKey(geminiKey);
                    setGeminiModel(geminiModelChoice);
                    setSavedKey(true);
                    setTimeout(() => setSavedKey(false), 3000);
                  }}
                >
                  {savedKey ? 'Tersimpan!' : 'Simpan Kunci'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={testingKey}
                  onClick={async () => {
                    setTestingKey(true);
                    const res = await testGeminiConnection(geminiKey, geminiModelChoice);
                    setTestingKey(false);
                    setTestStatus(res);
                  }}
                >
                  Uji Koneksi
                </Button>
                {geminiKey && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGeminiKey('');
                      setGeminiApiKey('');
                      setTestStatus(null);
                    }}
                  >
                    Hapus
                  </Button>
                )}
              </div>

              {testStatus && (
                <Notice kind={testStatus.ok ? 'success' : 'error'} className="mt-2 text-xs">
                  {testStatus.message}
                </Notice>
              )}
            </div>
          </div>
        </Card>
        <Card title={`Pengaturan aktif · versi ${cfg.version}`} subtitle={`Diubah ${formatDateTime(cfg.updatedAt)} oleh ${cfg.updatedBy.name}`} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('mappingThreshold', 'Ambang relevansi pemetaan', 'Kecocokan entri kamus di bawah nilai ini ditandai "di bawah ambang" dan tidak dipilih otomatis. Berlaku untuk klaim baru.')}
            {field('autoSelectThreshold', 'Ambang pilih otomatis (keyakinan AI)', 'Usulan dengan keyakinan AI di bawah nilai ini tetap ditampilkan tetapi tidak dicentang.')}
            {field('maxQuestions', 'Maksimal pertanyaan ditanyakan per sesi', `Termasuk pertanyaan episode; juga batas centang otomatis. Verifikator dapat menyetujui hingga ${MAX_POOL_QUESTIONS}. 1–8.`, '1', '8')}
            {field('draftWarningThreshold', 'Ambang peringatan draf AI', 'Draf AI di bawah nilai ini diberi tanda peringatan.')}
            {field('fraudMediumThreshold', 'Ambang indikasi fraud sedang', 'Indikasi yang mencapai nilai ini: hasil sesi "perlu diperiksa" dan AI beralih ke pertanyaan konfirmasi. Harus di atas 0 dan di bawah ambang tinggi. Berlaku untuk sesi baru.')}
            {field('fraudHighThreshold', 'Ambang indikasi fraud tinggi (berhenti)', 'Indikasi yang mencapai nilai ini: sesi berhenti dan klaim didahulukan. 1,00 = hanya penyangkalan yang menghentikan. Berlaku untuk sesi baru.')}
          </div>
          <Notice kind="warn" className="mt-4">
            Ambang di sini adalah pilihan kebijakan, bukan nilai optimal. Analitik AI menunjukkan apa yang terjadi di sekitar ambang dengan data yang ada; menetapkan ambang "terbaik" memerlukan
            tujuan yang disepakati dan data yang cukup.
          </Notice>
          {state.error && <Notice kind="error" className="mt-3">{state.error}</Notice>}
          {saved && !state.error && <Notice kind="success" className="mt-3">Konfigurasi versi {cfg.version} tersimpan dan tercatat di log audit.</Notice>}
          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" icon={Save} disabled={changed.length === 0} pending={state.pending} onClick={async () => { if (await save(patch, VERIFIER_ACTOR)) setSaved(true); }}>
              Simpan sebagai versi {cfg.version + 1}
            </Button>
            {changed.length > 0 && <span className="text-xs text-amber-800">{changed.length} perubahan belum disimpan</span>}
          </div>
        </Card>
        <Card title="Riwayat konfigurasi" className="lg:col-span-3" bodyClassName="p-0">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Versi</th>
                <th className={th}>Relevansi</th>
                <th className={th}>Pilih otomatis</th>
                <th className={th}>Maks. pertanyaan</th>
                <th className={th}>Peringatan draf</th>
                <th className={th}>Indikasi sedang</th>
                <th className={th}>Indikasi tinggi</th>
                <th className={th}>Diubah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.version}>
                  <td className={`${td} font-mono text-xs`}>v{h.version}</td>
                  <td className={`${td} tabular`}>{formatScore(h.mappingThreshold)}</td>
                  <td className={`${td} tabular`}>{formatScore(h.autoSelectThreshold)}</td>
                  <td className={`${td} tabular`}>{h.maxQuestions}</td>
                  <td className={`${td} tabular`}>{formatScore(h.draftWarningThreshold)}</td>
                  <td className={`${td} tabular`}>{formatScore(h.fraudMediumThreshold)}</td>
                  <td className={`${td} tabular`}>{formatScore(h.fraudHighThreshold)}</td>
                  <td className={`${td} text-xs text-slate-500`}>
                    {formatDateTime(h.updatedAt)} · {h.updatedBy.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
