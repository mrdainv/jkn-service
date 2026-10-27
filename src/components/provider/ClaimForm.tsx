import { Plus, Search, Send, Trash2, UserCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { DIAGNOSES, PROCEDURES } from '../../ai/reference';
import { useAction, useApp } from '../../application/context';
import { validateClaimInput, type ClaimInput } from '../../application/commands';
import { CARE_CLASS_LABEL, CARE_TYPE_LABEL, SEGMENT_LABEL } from '../../domain/labels';
import type { ActorRef, CareClass, CareType, Facility, Participant } from '../../domain/types';
import { addDays, ageOn, daysBetween, formatDate, formatRupiah, wibDate } from '../../lib/format';
import { navigate } from '../../lib/router';
import { Badge, Button, Card, Field, Notice, PageHeader } from '../ui';
import { cx, inputCls } from '../styles';

interface ProcRow {
  key: number;
  code: string;
  name: string;
  quantity: string;
}

function newSep(facility: Facility, taken: Set<string>): string {
  const d = wibDate().replaceAll('-', '').slice(2);
  for (;;) {
    const sep = `${facility.code}${d}${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`;
    if (!taken.has(sep)) return sep;
  }
}

/** Facility claim form. Validation is the same function the submit command runs. */
export function ClaimForm({ facility, actor }: { facility: Facility; actor: ActorRef }) {
  const { db, actions } = useApp();
  const today = wibDate();
  const doctors = db.practitioners.filter((p) => p.facilityId === facility.id);
  const [query, setQuery] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [sep, setSep] = useState(() => newSep(facility, new Set(db.claims.map((c) => c.sepNumber))));
  const [careType, setCareType] = useState<CareType>('RAWAT_INAP');
  const [careClass, setCareClass] = useState<CareClass | ''>('');
  const [admission, setAdmission] = useState(addDays(today, -4));
  const [discharge, setDischarge] = useState(addDays(today, -1));
  const [practitionerId, setPractitionerId] = useState(doctors[0]?.id ?? '');
  const [dx, setDx] = useState({ code: '', name: '' });
  const [dx2, setDx2] = useState({ code: '', name: '' });
  const [rows, setRows] = useState<ProcRow[]>([{ key: 1, code: '', name: '', quantity: '1' }]);
  const [cbgCode, setCbgCode] = useState('');
  const [tariff, setTariff] = useState('');
  const [charge, setCharge] = useState('');
  const [touched, setTouched] = useState(false);
  const [submit, state] = useAction(actions.submitClaim);

  const participant = db.participants.find((p) => p.id === participantId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return db.participants.filter((p) => p.cardNumber.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [db.participants, query]);

  const input: ClaimInput = {
    participantId,
    facilityId: facility.id,
    practitionerId,
    sepNumber: sep,
    careType,
    careClass: (careClass || participant?.careClass || 'KELAS_3') as CareClass,
    admissionDate: admission,
    dischargeDate: careType === 'RAWAT_JALAN' ? admission : discharge,
    diagnosis: { code: dx.code, name: dx.name },
    secondaryDiagnoses: dx2.code ? [dx2] : [],
    procedures: rows.filter((r) => r.code || r.name).map((r) => ({ code: r.code, name: r.name, quantity: Number(r.quantity) })),
    inaCbg: { code: cbgCode, tariff: Number(tariff) },
    hospitalCharge: Number(charge),
  };
  const errors = touched ? { ...validateClaimInput(db, input, today), ...state.fields } : {};
  const nights = careType === 'RAWAT_INAP' && admission && discharge ? daysBetween(admission, discharge) : 0;

  const choose = (p: Participant) => {
    setParticipantId(p.id);
    setCareClass(p.careClass);
    setQuery('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(validateClaimInput(db, input, today)).length) return;
    const claim = await submit(input, actor);
    if (claim) navigate(`/faskes/klaim/${claim.id}?baru=1`);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title="Ajukan klaim"
        subtitle={`${facility.name} · kode faskes ${facility.code}`}
        actions={
          <Button type="submit" variant="primary" icon={Send} pending={state.pending}>
            Ajukan klaim
          </Button>
        }
      />
      {state.error && (
        <Notice kind="error" className="mb-4" title="Klaim belum terkirim">
          {state.error}
        </Notice>
      )}
      {touched && Object.keys(errors).length > 0 && !state.error && (
        <Notice kind="warn" className="mb-4">
          Periksa {Object.keys(errors).length} isian yang ditandai.
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1. Peserta JKN" className="lg:col-span-1">
          <Field label="Cari nomor kartu atau nama" htmlFor="cari-peserta" error={errors.participantId} required>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" aria-hidden />
              <input id="cari-peserta" className={cx(inputCls, 'pl-8')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="mis. 0001234500059" autoComplete="off" />
            </div>
          </Field>
          {matches.length > 0 && (
            <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200" role="listbox" aria-label="Hasil pencarian peserta">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={p.id === participantId} onClick={() => choose(p)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{p.cardNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && matches.length === 0 && <p className="mt-2 text-xs text-slate-500">Tidak ada peserta yang cocok.</p>}
          {participant ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <UserCheck className="h-4 w-4 text-emerald-700" aria-hidden />
                {participant.name}
                <Badge tone={participant.status === 'AKTIF' ? 'good' : 'bad'}>{participant.status === 'AKTIF' ? 'Aktif' : 'Tidak aktif'}</Badge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600">
                <dt>No. kartu</dt>
                <dd className="font-mono text-slate-900">{participant.cardNumber}</dd>
                <dt>Tgl lahir</dt>
                <dd className="text-slate-900">
                  {formatDate(participant.birthDate)} ({ageOn(participant.birthDate, today)} th)
                </dd>
                <dt>Jenis kelamin</dt>
                <dd className="text-slate-900">{participant.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</dd>
                <dt>Hak kelas</dt>
                <dd className="text-slate-900">{CARE_CLASS_LABEL[participant.careClass]}</dd>
                <dt>Segmen</dt>
                <dd className="text-slate-900">{SEGMENT_LABEL[participant.segment]}</dd>
              </dl>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Peserta harus terdaftar dan aktif. Data peserta diambil dari kepesertaan, tidak diketik ulang.</p>
          )}
        </Card>

        <Card title="2. Kunjungan & SEP" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nomor SEP" htmlFor="sep" error={errors.sepNumber} required hint="Dibuat otomatis; boleh diganti sesuai SEP.">
              <input id="sep" className={cx(inputCls, 'font-mono')} value={sep} onChange={(e) => setSep(e.target.value.toUpperCase())} aria-invalid={!!errors.sepNumber} />
            </Field>
            <Field label="DPJP" htmlFor="dpjp" error={errors.practitionerId} required>
              <select id="dpjp" className={inputCls} value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.specialty})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jenis rawat" htmlFor="jenis-rawat" required>
              <select id="jenis-rawat" className={inputCls} value={careType} onChange={(e) => setCareType(e.target.value as CareType)}>
                {(Object.keys(CARE_TYPE_LABEL) as CareType[]).map((t) => (
                  <option key={t} value={t}>
                    {CARE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kelas rawat" htmlFor="kelas" hint={participant && careClass && careClass !== participant.careClass ? 'Berbeda dari hak kelas peserta.' : undefined}>
              <select id="kelas" className={inputCls} value={careClass} onChange={(e) => setCareClass(e.target.value as CareClass)}>
                <option value="">Sesuai hak kelas</option>
                {(Object.keys(CARE_CLASS_LABEL) as CareClass[]).map((c) => (
                  <option key={c} value={c}>
                    {CARE_CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal masuk" htmlFor="masuk" error={errors.admissionDate} required>
              <input id="masuk" type="date" className={inputCls} value={admission} max={today} onChange={(e) => setAdmission(e.target.value)} aria-invalid={!!errors.admissionDate} />
            </Field>
            {careType === 'RAWAT_INAP' ? (
              <Field label="Tanggal pulang" htmlFor="pulang" error={errors.dischargeDate} required hint={nights > 0 ? `Lama rawat ${nights} malam.` : undefined}>
                <input id="pulang" type="date" className={inputCls} value={discharge} max={today} onChange={(e) => setDischarge(e.target.value)} aria-invalid={!!errors.dischargeDate} />
              </Field>
            ) : (
              <Field label="Tanggal pulang" hint="Rawat jalan: sama dengan tanggal masuk.">
                <input type="date" className={inputCls} value={admission} disabled />
              </Field>
            )}
          </div>
        </Card>

        <Card title="3. Diagnosis (ICD-10)" className="lg:col-span-1">
          <div className="space-y-3">
            <Field label="Pilih dari referensi" htmlFor="dx-ref">
              <select
                id="dx-ref"
                className={inputCls}
                value=""
                onChange={(e) => {
                  const d = DIAGNOSES.find((x) => x.code === e.target.value);
                  if (d) setDx(d);
                }}
              >
                <option value="">— pilih untuk mengisi —</option>
                {DIAGNOSES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Kode utama" htmlFor="dx-code" required>
                <input id="dx-code" className={cx(inputCls, 'font-mono')} value={dx.code} onChange={(e) => setDx({ ...dx, code: e.target.value.toUpperCase() })} aria-invalid={!!errors.diagnosis} />
              </Field>
              <div className="col-span-2">
                <Field label="Nama diagnosis utama" htmlFor="dx-name" required>
                  <input id="dx-name" className={inputCls} value={dx.name} onChange={(e) => setDx({ ...dx, name: e.target.value })} aria-invalid={!!errors.diagnosis} />
                </Field>
              </div>
            </div>
            {errors.diagnosis && (
              <p className="text-xs text-red-700" role="alert">
                {errors.diagnosis}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Field label="Sekunder (ops.)" htmlFor="dx2-code">
                <input id="dx2-code" className={cx(inputCls, 'font-mono')} value={dx2.code} onChange={(e) => setDx2({ ...dx2, code: e.target.value.toUpperCase() })} />
              </Field>
              <div className="col-span-2">
                <Field label="Nama" htmlFor="dx2-name">
                  <input id="dx2-name" className={inputCls} value={dx2.name} onChange={(e) => setDx2({ ...dx2, name: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="4. Tindakan / prosedur (ICD-9-CM)"
          className="lg:col-span-2"
          actions={
            <Button size="sm" icon={Plus} onClick={() => setRows([...rows, { key: Math.max(...rows.map((r) => r.key), 0) + 1, code: '', name: '', quantity: '1' }])} disabled={rows.length >= 10}>
              Tambah tindakan
            </Button>
          }
        >
          {errors.procedures && <p className="mb-2 text-xs text-red-700">{errors.procedures}</p>}
          <div className="space-y-2">
            {rows.map((row, i) => {
              const err = errors[`procedures.${i}`];
              const update = (patch: Partial<ProcRow>) => setRows(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
              return (
                <div key={row.key} className="grid grid-cols-12 items-start gap-2">
                  <select
                    aria-label={`Referensi tindakan ${i + 1}`}
                    className={cx(inputCls, 'col-span-12 sm:col-span-4')}
                    value={PROCEDURES.some((p) => p.code === row.code) ? row.code : ''}
                    onChange={(e) => {
                      const p = PROCEDURES.find((x) => x.code === e.target.value);
                      if (p) update({ code: p.code, name: p.name });
                    }}
                  >
                    <option value="">— pilih dari referensi —</option>
                    {PROCEDURES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                  <input aria-label={`Kode tindakan ${i + 1}`} className={cx(inputCls, 'col-span-3 font-mono sm:col-span-2')} value={row.code} placeholder="87.44" onChange={(e) => update({ code: e.target.value })} aria-invalid={!!err} />
                  <input aria-label={`Nama tindakan ${i + 1}`} className={cx(inputCls, 'col-span-5 sm:col-span-4')} value={row.name} placeholder="Nama tindakan" onChange={(e) => update({ name: e.target.value })} aria-invalid={!!err} />
                  <input aria-label={`Jumlah tindakan ${i + 1}`} type="number" min={1} max={99} className={cx(inputCls, 'col-span-2 sm:col-span-1')} value={row.quantity} onChange={(e) => update({ quantity: e.target.value })} />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Hapus tindakan ${i + 1}`} className="col-span-2 sm:col-span-1" onClick={() => setRows(rows.filter((r) => r.key !== row.key))} />
                  {err && <p className="col-span-12 text-xs text-red-700">{err}</p>}
                </div>
              );
            })}
            {rows.length === 0 && <p className="text-xs text-slate-500">Tanpa tindakan: hanya pertanyaan episode yang akan disiapkan.</p>}
          </div>
        </Card>

        <Card title="5. Tarif" className="lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Kode INA-CBG" htmlFor="cbg" error={errors.inaCbgCode} required hint="Format simulasi, contoh A-4-14-I.">
              <input id="cbg" className={cx(inputCls, 'font-mono')} value={cbgCode} onChange={(e) => setCbgCode(e.target.value.toUpperCase())} aria-invalid={!!errors.inaCbgCode} />
            </Field>
            <Field label="Tarif INA-CBG (Rp)" htmlFor="tarif" error={errors.inaCbgTariff} required hint={Number(tariff) > 0 ? formatRupiah(Number(tariff)) : undefined}>
              <input id="tarif" type="number" min={0} className={inputCls} value={tariff} onChange={(e) => setTariff(e.target.value)} aria-invalid={!!errors.inaCbgTariff} />
            </Field>
            <Field label="Tarif rumah sakit (Rp)" htmlFor="tarif-rs" error={errors.hospitalCharge} required hint={Number(charge) > 0 ? formatRupiah(Number(charge)) : undefined}>
              <input id="tarif-rs" type="number" min={0} className={inputCls} value={charge} onChange={(e) => setCharge(e.target.value)} aria-invalid={!!errors.hospitalCharge} />
            </Field>
          </div>
        </Card>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" variant="primary" icon={Send} pending={state.pending}>
          Ajukan klaim
        </Button>
      </div>
    </form>
  );
}
