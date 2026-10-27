import { Save } from 'lucide-react';
import { useState } from 'react';
import { useAction, useApp } from '../../application/context';
import { RESPONSE_WINDOW_DAYS } from '../../application/commands';
import { formatDateTime, formatScore } from '../../lib/format';
import { Badge, Button, Card, Field, KeyValue, Notice, PageHeader } from '../ui';
import { inputCls, td, th } from '../styles';
import { VERIFIER_ACTOR } from './actor';

export function AiConfigView() {
  const { db, actions, ai } = useApp();
  const cfg = db.aiConfig;
  const [form, setForm] = useState({
    mappingThreshold: String(cfg.mappingThreshold),
    autoSelectThreshold: String(cfg.autoSelectThreshold),
    maxQuestions: String(cfg.maxQuestions),
    draftWarningThreshold: String(cfg.draftWarningThreshold),
  });
  const [save, state] = useAction(actions.updateAiConfig);
  const [saved, setSaved] = useState(false);
  const patch = {
    mappingThreshold: Number(form.mappingThreshold),
    autoSelectThreshold: Number(form.autoSelectThreshold),
    maxQuestions: Number(form.maxQuestions),
    draftWarningThreshold: Number(form.draftWarningThreshold),
  };
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] !== cfg[k]);
  const history = [...db.aiConfigHistory, cfg].reverse();
  const field = (key: keyof typeof form, label: string, hint: string, step = '0.05', max = '1') => (
    <Field label={label} htmlFor={key} hint={hint}>
      <input id={key} type="number" step={step} min="0" max={max} className={inputCls} value={form[key]} onChange={(e) => { setSaved(false); setForm({ ...form, [key]: e.target.value }); }} />
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
              ['Mode', <Badge key="mode" tone="warn">{ai.info.label}</Badge>],
              ['Model', <span key="model" className="font-mono">{ai.info.id} v{ai.info.version}</span>],
              ['Yang diprediksi skor', ai.info.confidenceEventText],
              ['Yang dikirim ke AI', 'Kode dan nama tindakan, kategori, jenis rawat, jumlah malam, isi kamus. Tanpa nama, nomor kartu, tanggal lahir, atau alamat peserta.'],
              ['Batas waktu menjawab', `${RESPONSE_WINDOW_DAYS} hari (ditetapkan sistem)`],
            ]}
          />
          <Notice kind="info" className="mt-3">
            Belum ada layanan AI sungguhan. Simulasi berada di balik antarmuka <code>QuestionAi</code> sehingga dapat diganti tanpa mengubah alur kerja.
          </Notice>
        </Card>
        <Card title={`Pengaturan aktif · versi ${cfg.version}`} subtitle={`Diubah ${formatDateTime(cfg.updatedAt)} oleh ${cfg.updatedBy.name}`} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('mappingThreshold', 'Ambang relevansi pemetaan', 'Kecocokan entri kamus di bawah nilai ini ditandai "di bawah ambang" dan tidak dipilih otomatis. Berlaku untuk klaim baru.')}
            {field('autoSelectThreshold', 'Ambang pilih otomatis (keyakinan AI)', 'Usulan dengan keyakinan AI di bawah nilai ini tetap ditampilkan tetapi tidak dicentang.')}
            {field('maxQuestions', 'Maksimal pertanyaan per klaim', 'Termasuk pertanyaan episode (menginap, lama rawat). 1–8.', '1', '8')}
            {field('draftWarningThreshold', 'Ambang peringatan draf AI', 'Draf AI di bawah nilai ini diberi tanda peringatan.')}
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
