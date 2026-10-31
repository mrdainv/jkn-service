import { Eye, EyeOff, Save, Server, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getAiProvider, setAiProvider, type AiProvider } from '../../ai/activeAi';
import {
  DEFAULT_DEEPSEEK_ENDPOINT,
  getDeepSeekApiKey,
  getDeepSeekEndpoint,
  getDeepSeekModel,
  setDeepSeekApiKey,
  setDeepSeekEndpoint,
  setDeepSeekModel,
  testDeepSeekConnection,
} from '../../ai/deepseekAi';
import {
  getGeminiApiKey,
  getGeminiModel,
  setGeminiApiKey,
  setGeminiModel,
  testGeminiConnection,
} from '../../ai/geminiAi';
import { AI_REQUEST_FIELDS } from '../../ai/service';
import { MAX_POOL_QUESTIONS, RESPONSE_WINDOW_DAYS } from '../../application/commands';
import { useAction, useApp } from '../../application/context';
import { FRAUD_LEVEL_EFFECT, FRAUD_LEVEL_LABEL } from '../../domain/labels';
import { DEFAULT_OBSERVABILITY, EVALUATION_RULES } from '../../domain/verification';
import { formatDateTime, formatScore } from '../../lib/format';
import { cx, inputCls, td, th } from '../styles';
import { Badge, Button, Card, Field, KeyValue, Notice, PageHeader } from '../ui';
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

  // Active Provider
  const [provider, setProviderState] = useState<AiProvider>(getAiProvider);

  // Gemini state
  const [geminiKey, setGeminiKey] = useState(getGeminiApiKey);
  const [geminiModelChoice, setGeminiModelChoice] = useState(getGeminiModel);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [savedGeminiKey, setSavedGeminiKey] = useState(false);
  const [testGeminiStatus, setTestGeminiStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // DeepSeek state
  const [deepseekKey, setDeepSeekKey] = useState(getDeepSeekApiKey);
  const [deepseekModelChoice, setDeepSeekModelChoice] = useState(getDeepSeekModel);
  const [deepseekEndpointChoice, setDeepSeekEndpointChoice] = useState(getDeepSeekEndpoint);
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);
  const [testingDeepSeek, setTestingDeepSeek] = useState(false);
  const [savedDeepSeekKey, setSavedDeepSeekKey] = useState(false);
  const [testDeepSeekStatus, setTestDeepSeekStatus] = useState<{ ok: boolean; message: string } | null>(null);

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
      <input
        id={key}
        type="number"
        step={step}
        min={min}
        max={max}
        className={inputCls}
        value={form[key]}
        onChange={(e) => {
          setSaved(false);
          setForm({ ...form, [key]: e.target.value });
        }}
      />
    </Field>
  );

  const handleProviderChange = (newP: AiProvider) => {
    setProviderState(newP);
    setAiProvider(newP);
  };

  return (
    <>
      <PageHeader
        title="Konfigurasi AI"
        subtitle="Pengaturan yang dipakai sistem. Bagian ini berisi konfigurasi, bukan metrik; dampaknya terlihat di Analitik AI."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Layanan AI" className="lg:col-span-1">
          <KeyValue
            cols={1}
            items={[
              ['Mode Aktif', <Badge key="mode" tone={ai.info.kind === 'MODEL_EKSTERNAL' ? 'good' : 'warn'}>{ai.info.label}</Badge>],
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
            {ai.info.kind === 'MODEL_EKSTERNAL' ? (
              provider === 'deepseek' ? (
                <>Layanan GenAI <b>DeepSeek</b> aktif. Draf pertanyaan sensoris disusun menggunakan <b>{deepseekModelChoice}</b> {deepseekEndpointChoice.includes('localhost') ? '(Server Lokal On-Premise)' : '(DeepSeek Cloud)'} sesuai URD v0.4 (E6).</>
              ) : (
                <>Layanan GenAI <b>Google Gemini</b> aktif. Draf pertanyaan sensoris disusun langsung oleh <b>{geminiModelChoice}</b> berbasis URD v0.4 (E6).</>
              )
            ) : (
              'Mode simulasi deterministik aktif. Pilih provider DeepSeek atau Google Gemini dan masukkan API Key di bawah untuk mengaktifkan AI generatif nyata.'
            )}
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

          {/* Provider Selection Section */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden />
                Pilihan Provider GenAI (Engine 1)
              </div>
            </div>

            <div className="mt-2 space-y-3">
              <Field label="Provider LLM Aktif" htmlFor="llm-provider" hint="Pilih model GenAI untuk merumuskan draf pertanyaan sensoris">
                <select
                  id="llm-provider"
                  className={cx(inputCls, 'text-xs font-medium')}
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                >
                  <option value="deepseek">DeepSeek (Cloud / On-Premise Lokal BPJS)</option>
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="simulation">Simulasi Deterministik (Offline / Tanpa Kunci)</option>
                </select>
              </Field>

              {/* DeepSeek Configuration Box */}
              {provider === 'deepseek' && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 space-y-2.5">
                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-900">
                    <Server className="h-3.5 w-3.5 text-indigo-600" />
                    Pengaturan DeepSeek (Cloud / Server On-Premise)
                  </div>

                  <Field label="Endpoint API / Server" htmlFor="deepseek-endpoint" hint="Gunakan DeepSeek Cloud atau Server Ollama lokal instansi">
                    <select
                      id="deepseek-endpoint"
                      className={cx(inputCls, 'text-xs')}
                      value={deepseekEndpointChoice}
                      onChange={(e) => {
                        setDeepSeekEndpointChoice(e.target.value);
                        setTestDeepSeekStatus(null);
                      }}
                    >
                      <option value={DEFAULT_DEEPSEEK_ENDPOINT}>DeepSeek Cloud (api.deepseek.com)</option>
                      <option value="http://localhost:11434/v1">Server Lokal Ollama (http://localhost:11434/v1)</option>
                      <option value="http://127.0.0.1:8000/v1">Server Lokal vLLM (http://127.0.0.1:8000/v1)</option>
                    </select>
                  </Field>

                  <Field
                    label="DeepSeek API Key"
                    htmlFor="deepseek-key"
                    hint={deepseekEndpointChoice.includes('localhost') || deepseekEndpointChoice.includes('127.0.0.1')
                      ? 'Server lokal (Ollama) tidak memerlukan API key (boleh kosong).'
                      : 'Disimpan aman di browser lokal Anda (localStorage).'}
                  >
                    <div className="relative">
                      <input
                        id="deepseek-key"
                        type={showDeepSeekKey ? 'text' : 'password'}
                        className={cx(inputCls, 'pr-8 font-mono text-xs')}
                        value={deepseekKey}
                        placeholder={deepseekEndpointChoice.includes('localhost') ? '(Opsional untuk lokal)' : 'sk-...'}
                        onChange={(e) => {
                          setDeepSeekKey(e.target.value);
                          setTestDeepSeekStatus(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeepSeekKey(!showDeepSeekKey)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        title={showDeepSeekKey ? 'Sembunyikan' : 'Tampilkan'}
                      >
                        {showDeepSeekKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </Field>

                  <Field label="Model DeepSeek" htmlFor="deepseek-model">
                    <select
                      id="deepseek-model"
                      className={cx(inputCls, 'text-xs')}
                      value={deepseekModelChoice}
                      onChange={(e) => setDeepSeekModelChoice(e.target.value)}
                    >
                      <option value="deepseek-chat">deepseek-chat (DeepSeek-V3 - Cepat & Bahasa Luwes)</option>
                      <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1 - Penalaran Medis)</option>
                      <option value="deepseek-r1:8b">deepseek-r1:8b (Model Lokal Ollama 8B)</option>
                      <option value="deepseek-r1:14b">deepseek-r1:14b (Model Lokal Ollama 14B)</option>
                    </select>
                  </Field>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setDeepSeekApiKey(deepseekKey);
                        setDeepSeekModel(deepseekModelChoice);
                        setDeepSeekEndpoint(deepseekEndpointChoice);
                        setSavedDeepSeekKey(true);
                        setTimeout(() => setSavedDeepSeekKey(false), 3000);
                      }}
                    >
                      {savedDeepSeekKey ? 'Tersimpan!' : 'Simpan Pengaturan'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={testingDeepSeek}
                      onClick={async () => {
                        setTestingDeepSeek(true);
                        const res = await testDeepSeekConnection(deepseekKey, deepseekModelChoice, deepseekEndpointChoice);
                        setTestingDeepSeek(false);
                        setTestDeepSeekStatus(res);
                      }}
                    >
                      Uji Koneksi
                    </Button>
                    {deepseekKey && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDeepSeekKey('');
                          setDeepSeekApiKey('');
                          setTestDeepSeekStatus(null);
                        }}
                      >
                        Hapus Kunci
                      </Button>
                    )}
                  </div>

                  {testDeepSeekStatus && (
                    <Notice kind={testDeepSeekStatus.ok ? 'success' : 'error'} className="mt-2 text-xs">
                      {testDeepSeekStatus.message}
                    </Notice>
                  )}
                </div>
              )}

              {/* Gemini Configuration Box */}
              {provider === 'gemini' && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/30 p-3 space-y-2.5">
                  <div className="flex items-center gap-1 text-xs font-semibold text-violet-900">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                    Pengaturan Google Gemini API
                  </div>

                  <Field label="Gemini API Key" htmlFor="gemini-key" hint="Disimpan aman di browser lokal Anda (localStorage)">
                    <div className="relative">
                      <input
                        id="gemini-key"
                        type={showGeminiKey ? 'text' : 'password'}
                        className={cx(inputCls, 'pr-8 font-mono text-xs')}
                        value={geminiKey}
                        placeholder="AIzaSy..."
                        onChange={(e) => {
                          setGeminiKey(e.target.value);
                          setTestGeminiStatus(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        title={showGeminiKey ? 'Sembunyikan' : 'Tampilkan'}
                      >
                        {showGeminiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
                        setSavedGeminiKey(true);
                        setTimeout(() => setSavedGeminiKey(false), 3000);
                      }}
                    >
                      {savedGeminiKey ? 'Tersimpan!' : 'Simpan Kunci'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={testingGemini}
                      onClick={async () => {
                        setTestingGemini(true);
                        const res = await testGeminiConnection(geminiKey, geminiModelChoice);
                        setTestingGemini(false);
                        setTestGeminiStatus(res);
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
                          setTestGeminiStatus(null);
                        }}
                      >
                        Hapus Kunci
                      </Button>
                    )}
                  </div>

                  {testGeminiStatus && (
                    <Notice kind={testGeminiStatus.ok ? 'success' : 'error'} className="mt-2 text-xs">
                      {testGeminiStatus.message}
                    </Notice>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card
          title={`Pengaturan aktif · versi ${cfg.version}`}
          subtitle={`Diubah ${formatDateTime(cfg.updatedAt)} oleh ${cfg.updatedBy.name}`}
          className="lg:col-span-2"
        >
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
            <Button
              variant="primary"
              icon={Save}
              disabled={changed.length === 0}
              pending={state.pending}
              onClick={async () => {
                if (await save(patch, VERIFIER_ACTOR)) setSaved(true);
              }}
            >
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
