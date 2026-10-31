import { Building2, ClipboardCheck, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { activeAi } from './ai/activeAi';
import { AppProvider } from './application/AppProvider';
import { useAction, useApp } from './application/context';
import type { DbStore } from './data/store';
import { Landing } from './components/Landing';
import { ParticipantApp } from './components/participant/ParticipantApp';
import { ProviderApp } from './components/provider/ProviderApp';
import { VerifierApp } from './components/verifier/VerifierApp';
import { cx } from './components/styles';
import { Button, SimBadge } from './components/ui';
import { href, useRoute } from './lib/router';

const ROLES: { id: string; label: string; short: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'faskes', label: 'Faskes (Rumah Sakit)', short: 'Faskes', icon: Building2 },
  { id: 'verifikator', label: 'Verifikator BPJS', short: 'Verifikator', icon: ClipboardCheck },
  { id: 'peserta', label: 'Peserta JKN', short: 'Peserta', icon: Smartphone },
];

function TopBar({ role }: { role: string | undefined }) {
  const { store, revision } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [reset, resetState] = useAction(() => store.reset());
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <a href={href('/')} className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-emerald-700 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-slate-900">JKN Service</span>
            <span className="block text-[11px] text-slate-500">Verifikasi klaim dengan suara peserta</span>
          </span>
        </a>
        <nav aria-label="Peran" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.id;
            return (
              <a
                key={r.id}
                href={href(`/${r.id}`)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                  active ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="hidden md:inline">{r.label}</span>
                <span className="md:hidden">{r.short}</span>
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SimBadge />
          <span className="hidden text-[11px] text-slate-500 lg:inline" title={store.backend.label}>
            Tersimpan · rev {revision}
          </span>
          {confirming ? (
            <span className="flex items-center gap-1">
              <span className="text-xs text-slate-600">Hapus semua perubahan?</span>
              <Button
                size="sm"
                variant="danger"
                pending={resetState.pending}
                onClick={async () => {
                  await reset();
                  setConfirming(false);
                }}
              >
                Ya, reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Batal
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirming(true)} title="Kembalikan data simulasi ke kondisi awal">
              <span className="hidden sm:inline">Reset data</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const route = useRoute();
  const [role, ...rest] = route;
  return (
    <div className="min-h-screen">
      <TopBar role={role} />
      {role === 'faskes' ? (
        <ProviderApp route={rest} />
      ) : role === 'verifikator' ? (
        <VerifierApp route={rest} />
      ) : role === 'peserta' ? (
        <ParticipantApp route={rest} />
      ) : (
        <Landing />
      )}
    </div>
  );
}

export default function App({ store, pollMs }: { store: DbStore; pollMs?: number }) {
  return (
    <AppProvider store={store} ai={activeAi} pollMs={pollMs}>
      <Shell />
    </AppProvider>
  );
}
