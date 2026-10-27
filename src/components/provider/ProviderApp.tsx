import { FilePlus2, Files } from 'lucide-react';
import { useApp } from '../../application/context';
import type { ActorRef } from '../../domain/types';
import { href } from '../../lib/router';
import { usePref } from '../../lib/viewer';
import { cx, inputCls } from '../styles';
import { ClaimForm } from './ClaimForm';
import { ProviderClaimDetail } from './ProviderClaimDetail';
import { ProviderClaimList } from './ProviderClaimList';

export function ProviderApp({ route }: { route: string[] }) {
  const { db } = useApp();
  const [facilityId, setFacilityId] = usePref('facility', db.facilities[0].id);
  const facility = db.facilities.find((f) => f.id === facilityId) ?? db.facilities[0];
  const actor: ActorRef = { role: 'FASKES', id: `USR-${facility.id}`, name: `Petugas klaim ${facility.name}` };
  const [page, id] = route;
  const nav = [
    { path: '/faskes', label: 'Daftar klaim', icon: Files, active: !page || page === 'klaim' },
    { path: '/faskes/baru', label: 'Ajukan klaim', icon: FilePlus2, active: page === 'baru' },
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <label htmlFor="facility" className="text-xs text-slate-500">
            Masuk sebagai petugas klaim
          </label>
          <select id="facility" className={cx(inputCls, 'w-auto py-1')} value={facility.id} onChange={(e) => setFacilityId(e.target.value)}>
            {db.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.code}
              </option>
            ))}
          </select>
        </div>
        <nav className="flex gap-1" aria-label="Menu faskes">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <a
                key={n.path}
                href={href(n.path)}
                aria-current={n.active ? 'page' : undefined}
                className={cx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', n.active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {n.label}
              </a>
            );
          })}
        </nav>
      </div>
      {page === 'baru' ? (
        <ClaimForm facility={facility} actor={actor} />
      ) : page === 'klaim' && id ? (
        <ProviderClaimDetail claimId={id} facilityId={facility.id} />
      ) : (
        <ProviderClaimList facility={facility} />
      )}
    </div>
  );
}
