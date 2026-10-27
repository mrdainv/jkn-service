import { createContext, useCallback, useContext, useState } from 'react';
import type { QuestionAi } from '../ai/service';
import { buildSeed } from '../data/seed/buildSeed';
import { BrowserBackend, DbStore, FileBackend } from '../data/store';
import type { Db } from '../domain/types';
import type { Actions } from './actions';
import { CommandError } from './commands';

export interface AppValue {
  store: DbStore;
  db: Db;
  revision: number;
  actions: Actions;
  ai: QuestionAi;
}

export const AppContext = createContext<AppValue | null>(null);

/** Picks the file store when the dev/preview server offers it, otherwise browser storage. */
export async function createDefaultStore(): Promise<DbStore> {
  const backend = (await FileBackend.available()) ? new FileBackend() : new BrowserBackend();
  return new DbStore(backend, buildSeed);
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function useDb(): Db {
  return useApp().db;
}

export interface ActionState {
  pending: boolean;
  error: string | null;
  fields: Record<string, string>;
}

/** Wraps an async action with pending and error state for buttons and forms. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [state, setState] = useState<ActionState>({ pending: false, error: null, fields: {} });
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setState({ pending: true, error: null, fields: {} });
      try {
        const result = await fn(...args);
        setState({ pending: false, error: null, fields: {} });
        return result;
      } catch (err) {
        const fields = err instanceof CommandError ? err.fields : {};
        setState({ pending: false, error: (err as Error).message, fields });
        return undefined;
      }
    },
    [fn],
  );
  const clear = useCallback(() => setState({ pending: false, error: null, fields: {} }), []);
  return [run, state, clear] as const;
}
