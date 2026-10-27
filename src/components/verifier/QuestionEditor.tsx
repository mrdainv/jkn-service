import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { checkQuestion } from '../../domain/checks';
import { STRENGTH_LABEL } from '../../domain/labels';
import type { AnswerOption, Strength } from '../../domain/types';
import { Button } from '../ui';
import { cx, inputCls } from '../styles';
import { StrengthBadge } from '../status';

export interface QuestionDraft {
  text: string;
  options: AnswerOption[];
}

const STRENGTHS: Strength[] = ['KUAT', 'SEBAGIAN', 'NETRAL', 'BERTENTANGAN'];

/** Edits participant wording and the answer → evidence mapping, with the system checks shown live. */
export function QuestionEditor({ value, onChange, avoidTerms, idPrefix }: { value: QuestionDraft; onChange: (v: QuestionDraft) => void; avoidTerms: readonly string[]; idPrefix: string }) {
  const checks = checkQuestion(value.text, value.options, avoidTerms);
  const failed = checks.filter((c) => !c.ok);
  const setOption = (i: number, patch: Partial<AnswerOption>) => onChange({ ...value, options: value.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) });
  const nextId = () => {
    let n = value.options.length + 1;
    while (value.options.some((o) => o.id === `OPSI_${n}`)) n += 1;
    return `OPSI_${n}`;
  };
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-text`} className="block text-xs font-medium text-slate-700">
          Kalimat untuk peserta
        </label>
        <textarea id={`${idPrefix}-text`} rows={2} className={cx(inputCls, 'mt-1')} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />
        <p className="mt-1 text-[11px] text-slate-500">
          Boleh memakai <code>{'{faskes}'}</code> dan <code>{'{periode}'}</code>; diisi otomatis dari klaim saat ditampilkan ke peserta.
        </p>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-700">Pilihan jawaban dan kekuatan bukti (Tabel 1)</div>
        <div className="mt-1 space-y-1.5">
          {value.options.map((o, i) => (
            <div key={o.id} className="grid grid-cols-12 items-center gap-2">
              <input aria-label={`Teks pilihan ${i + 1}`} className={cx(inputCls, 'col-span-12 sm:col-span-6')} value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
              {o.mapping.kind === 'TETAP' ? (
                <select
                  aria-label={`Kekuatan bukti pilihan ${i + 1}`}
                  className={cx(inputCls, 'col-span-6 sm:col-span-3')}
                  value={o.mapping.strength}
                  onChange={(e) => setOption(i, { mapping: { kind: 'TETAP', strength: e.target.value as Strength }, unsure: e.target.value === 'NETRAL' ? o.unsure : undefined })}
                >
                  {STRENGTHS.map((s) => (
                    <option key={s} value={s}>
                      {STRENGTH_LABEL[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="col-span-6 text-xs text-slate-600 sm:col-span-3">
                  Mendukung bila klaim {o.mapping.min}
                  {o.mapping.max === null ? '+' : o.mapping.max !== o.mapping.min ? `–${o.mapping.max}` : ''} malam
                </span>
              )}
              <label className="col-span-4 flex items-center gap-1 text-[11px] text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={!!o.unsure}
                  disabled={o.mapping.kind !== 'TETAP' || o.mapping.strength !== 'NETRAL'}
                  onChange={(e) => setOption(i, { unsure: e.target.checked || undefined })}
                />
                "Tidak ingat"
              </label>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Hapus pilihan ${i + 1}`} className="col-span-2 sm:col-span-1" onClick={() => onChange({ ...value, options: value.options.filter((_, k) => k !== i) })} />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          className="mt-1"
          disabled={value.options.length >= 6}
          onClick={() => onChange({ ...value, options: [...value.options, { id: nextId(), label: '', mapping: { kind: 'TETAP', strength: 'SEBAGIAN' } }] })}
        >
          Tambah pilihan
        </Button>
      </div>
      <ul className="grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2" aria-label="Pemeriksaan sistem">
        {checks.map((c) => (
          <li key={c.id} className={cx('flex items-start gap-1', c.ok ? 'text-slate-500' : 'text-red-700')}>
            {c.ok ? <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />}
            {c.message}
          </li>
        ))}
      </ul>
      {failed.length > 0 && <p className="text-xs font-medium text-red-700">{failed.length} pemeriksaan belum lolos; tidak dapat diterbitkan atau disetujui.</p>}
    </div>
  );
}

/** Read-only view of a question and how each answer would count. */
export function QuestionPreview({ text, options, nights }: { text: string; options: readonly AnswerOption[]; nights?: number | null }) {
  return (
    <div>
      <p className="text-sm text-slate-900">{text}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          let strength: Strength | null = null;
          if (o.mapping.kind === 'TETAP') strength = o.mapping.strength;
          else if (nights !== undefined && nights !== null) strength = nights >= o.mapping.min && (o.mapping.max === null || nights <= o.mapping.max) ? 'KUAT' : 'BERTENTANGAN';
          return (
            <li key={o.id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700">
              {o.label}
              {strength ? <StrengthBadge strength={strength} /> : <span className="text-[10px] text-slate-500">(rentang malam)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
