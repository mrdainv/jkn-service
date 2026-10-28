import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { QuestionAi } from '../ai/service';
import { simulatedAi } from '../ai/simulatedAi';
import type { DbStore } from '../data/store';
import { createActions } from './actions';
import { AppContext } from './context';

interface Props {
  store: DbStore;
  ai?: QuestionAi;
  clock?: () => string;
  /** How often to look for changes saved by other tabs or roles and close expired rounds; 0 disables polling (tests). */
  pollMs?: number;
  children: ReactNode;
}

export function AppProvider({ store, ai = simulatedAi, clock, pollMs = 2500, children }: Props) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [, rerender] = useState(0);
  const actions = useMemo(() => createActions(store, ai, clock), [store, ai, clock]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = store.subscribe(() => alive && rerender((n) => n + 1));
    if (!store.getSnapshot()) {
      void store.init().then(() => {
        // System job: rounds past the response window close on their own.
        if (store.status === 'ready') actions.closeExpired().catch(() => undefined);
      });
    }
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store, actions]);

  useEffect(() => {
    if (!pollMs) return;
    // The system job runs on the same tick, so rounds close on time while the app is open, not only at load.
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void store
        .refresh()
        .then(() => actions.closeExpired())
        .catch(() => undefined);
    };
    const timer = window.setInterval(tick, pollMs);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [store, actions, pollMs]);

  if (store.status === 'error' || !snapshot || store.incompatible) {
    return <StoreGate store={store} />;
  }
  return <AppContext.Provider value={{ store, db: snapshot.db, revision: snapshot.revision, actions, ai }}>{children}</AppContext.Provider>;
}

function StoreGate({ store }: { store: DbStore }) {
  const [busy, setBusy] = useState(false);
  if (store.status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500" role="status">
        Memuat data simulasi…
      </div>
    );
  }
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-base font-semibold text-slate-900">Data tidak dapat dimuat</h1>
        <p className="mt-2 text-sm text-slate-600">{store.error}</p>
        <p className="mt-2 text-xs text-slate-500">Penyimpanan: {store.backend.label}</p>
        <button
          className="mt-4 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await store.reset().catch(() => undefined);
            setBusy(false);
          }}
        >
          Reset ke data simulasi awal
        </button>
      </div>
    </div>
  );
}
