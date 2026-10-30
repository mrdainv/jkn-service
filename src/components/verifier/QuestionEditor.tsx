import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { checkQuestion } from '../../domain/checks';
import { strengthOf } from '../../domain/evidence';
import { STRENGTH_LABEL } from '../../domain/labels';
import type { AnswerOption, Strength } from '../../domain/types';
import { appliedFraudScore } from '../../domain/verification';
import { Button } from '../ui';
import { cx, inputCls } from '../styles';
import { FraudScoreTag, StrengthBadge } from '../status';

export interface QuestionDraft {
  text: string;
  options: AnswerOption[];
}

const STRENGTHS: Strength[] = ['KUAT', 'SEBAGIAN', 'NETRAL', 'BERTENTANGAN'];

/** Whether the score rule fixes this option's fraud score (so it is not edited by hand). */
function fixedScore(o: AnswerOption): boolean {
  return !!o.unsure || !!o.denial || (o.mapping.kind === 'TETAP' && (o.mapping.strength === 'KUAT' || o.mapping.strength === 'NETRAL'));
}

/** Edits participant wording, the answer → evidence mapping and each option's fraud score, with the system checks shown live. */
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
        <div className="text-xs font-medium text-slate-700">Pilihan jawaban, kekuatan bukti (Tabel 1), dan skor fraud</div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Skor fraud 0–1 milik setiap pilihan dan dihitung saat peserta memilihnya (× keandalan). Mendukung penuh, netral, dan "Tidak ingat" = 0; penyangkalan = 1; rentang malam hanya
          berlaku bila klaim di luar rentang. Tidak pernah ditampilkan ke peserta.
        </p>
        <div className="mt-1 space-y-1.5">
          {value.options.map((o, i) => (
            <div key={o.id} className="grid grid-cols-12 items-center gap-2">
              <input aria-label={`Teks pilihan ${i + 1}`} className={cx(inputCls, 'col-span-12 sm:col-span-4')} value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
              {o.mapping.kind === 'TETAP' ? (
                <select
                  aria-label={`Kekuatan bukti pilihan ${i + 1}`}
                  className={cx(inputCls, 'col-span-5 sm:col-span-3')}
                  value={o.mapping.strength}
                  onChange={(e) => {
                    const strength = e.target.value as Strength;
                    // Fully supporting and neutral options never carry a fraud score; other strengths keep the verifier's value.
                    setOption(i, { mapping: { kind: 'TETAP', strength }, unsure: strength === 'NETRAL' ? o.unsure : undefined, fraudScore: strength === 'KUAT' || strength === 'NETRAL' ? 0 : o.fraudScore });
                  }}
                >
                  {STRENGTHS.map((s) => (
                    <option key={s} value={s}>
                      {STRENGTH_LABEL[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="col-span-5 text-xs text-slate-600 sm:col-span-3">
                  Mendukung bila klaim {o.mapping.min}
                  {o.mapping.max === null ? '+' : o.mapping.max !== o.mapping.min ? `–${o.mapping.max}` : ''} malam
                </span>
              )}
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                aria-label={`Skor fraud pilihan ${i + 1}`}
                title={fixedScore(o) ? 'Ditetapkan oleh aturan skor' : 'Skor fraud bila peserta memilih pilihan ini'}
                className={cx(inputCls, 'col-span-3 tabular sm:col-span-2')}
                value={o.fraudScore}
                disabled={fixedScore(o)}
                onChange={(e) => setOption(i, { fraudScore: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
              <label className="col-span-3 flex items-center gap-1 text-[11px] text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={!!o.unsure}
                  disabled={o.mapping.kind !== 'TETAP' || o.mapping.strength !== 'NETRAL'}
                  onChange={(e) => setOption(i, { unsure: e.target.checked || undefined, fraudScore: 0 })}
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
          onClick={() => onChange({ ...value, options: [...value.options, { id: nextId(), label: '', mapping: { kind: 'TETAP', strength: 'SEBAGIAN' }, fraudScore: 0 }] })}
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

/**
 * Read-only view of a question and how each answer would count: its Table 1 strength and fraud score,
 * read against the claimed nights when they are known.
 */
export function QuestionPreview({ text, options, nights }: { text: string; options: readonly AnswerOption[]; nights?: number | null }) {
  const known = nights !== undefined && nights !== null;
  return (
    <div>
      <p className="text-sm text-slate-900">{text}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const range = o.mapping.kind === 'RENTANG_MALAM';
          const strength: Strength | null = !range || known ? strengthOf(o, nights ?? null) : null;
          return (
            <li key={o.id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700">
              {o.label}
              {strength ? <StrengthBadge strength={strength} /> : <span className="text-[10px] text-slate-500">(rentang malam)</span>}
              <FraudScoreTag value={range && known ? appliedFraudScore(o, nights) : o.fraudScore} conditional={range && !known} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
