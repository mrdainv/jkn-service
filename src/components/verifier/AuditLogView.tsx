import { useMemo, useState } from 'react';
import { useDb } from '../../application/context';
import type { Role } from '../../domain/types';
import { formatDateTime } from '../../lib/format';
import { href } from '../../lib/router';
import { Card, PageHeader } from '../ui';
import { cx, inputCls, td, th } from '../styles';

const ROLE_LABEL: Record<Role, string> = { FASKES: 'Faskes', VERIFIKATOR: 'Verifikator', PESERTA: 'Peserta', SISTEM: 'Sistem', AI: 'AI' };
const PAGE = 100;

export function AuditLogView() {
  const db = useDb();
  const [role, setRole] = useState<Role | ''>('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...db.audit]
      .filter((a) => (!role || a.actor.role === role) && (!needle || `${a.action} ${a.summary} ${a.entityId} ${a.claimId ?? ''}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  }, [db.audit, role, q]);
  return (
    <>
      <PageHeader title="Log audit" subtitle={`${db.audit.length} catatan perubahan dari semua peran, tidak dapat diubah dari aplikasi.`} />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2.5">
          <select className={cx(inputCls, 'w-auto py-1')} value={role} onChange={(e) => setRole(e.target.value as Role | '')} aria-label="Filter peran">
            <option value="">Semua peran</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <input className={cx(inputCls, 'w-64 py-1')} placeholder="Cari aksi, klaim, ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari log" />
          <span className="ml-auto self-center text-xs text-slate-500">{rows.length} catatan</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Waktu</th>
                <th className={th}>Pelaku</th>
                <th className={th}>Aksi</th>
                <th className={th}>Objek</th>
                <th className={th}>Ringkasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, limit).map((a) => (
                <tr key={a.id}>
                  <td className={cx(td, 'whitespace-nowrap text-xs text-slate-500')}>{formatDateTime(a.at)}</td>
                  <td className={cx(td, 'text-xs')}>
                    <div className="font-medium">{ROLE_LABEL[a.actor.role]}</div>
                    <div className="text-slate-500">{a.actor.name}</div>
                  </td>
                  <td className={cx(td, 'font-mono text-[11px]')}>{a.action}</td>
                  <td className={cx(td, 'font-mono text-[11px]')}>
                    {a.entityId}
                    {a.claimId && (
                      <div>
                        <a className="text-emerald-800 underline" href={href(`/verifikator/klaim/${a.claimId}`)}>
                          {a.claimId}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className={cx(td, 'text-xs')}>{a.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button type="button" className="text-sm text-emerald-800 underline" onClick={() => setLimit(limit + PAGE)}>
              Tampilkan {Math.min(PAGE, rows.length - limit)} lagi
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
