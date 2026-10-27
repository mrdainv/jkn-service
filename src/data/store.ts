import { SCHEMA_VERSION, type Db } from '../domain/types';
import { DB_API, REVISION_HEADER, type DbFile } from './protocol';

// One store for the whole app: every role reads the same snapshot and every change is a transaction
// that is saved before it becomes visible. Saves carry the revision they were based on; on a conflict
// (another tab or role saved first) the store reloads and re-applies the change.

export interface Snapshot {
  db: Db;
  revision: number;
}

export type SaveResult = { ok: true; revision: number } | { ok: false; currentRevision: number | null };

export interface Backend {
  readonly kind: 'file' | 'browser' | 'memory';
  readonly label: string;
  load(): Promise<Snapshot | null>;
  revision(): Promise<number | null>;
  save(db: Db, expectedRevision: number): Promise<SaveResult>;
}

/** local-data/db.json through the Vite plugin (dev and preview servers). */
export class FileBackend implements Backend {
  readonly kind = 'file';
  readonly label = 'Berkas lokal local-data/db.json';
  private readonly base: string;
  constructor(base = '') {
    this.base = base;
  }

  static async available(base = ''): Promise<boolean> {
    try {
      const res = await fetch(`${base}${DB_API.health}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const body = (await res.json()) as { store?: string };
      return body.store === 'file';
    } catch {
      return false;
    }
  }

  async load(): Promise<Snapshot | null> {
    const res = await fetch(`${this.base}${DB_API.db}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gagal memuat data (${res.status})`);
    const file = (await res.json()) as DbFile;
    return { db: file.db as Db, revision: file.revision };
  }

  async revision(): Promise<number | null> {
    const res = await fetch(`${this.base}${DB_API.revision}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { revision: number }).revision;
  }

  async save(db: Db, expectedRevision: number): Promise<SaveResult> {
    const res = await fetch(`${this.base}${DB_API.db}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', [REVISION_HEADER]: String(expectedRevision) },
      body: JSON.stringify({ db }),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { currentRevision?: number };
      return { ok: false, currentRevision: body.currentRevision ?? null };
    }
    if (!res.ok) throw new Error(`Gagal menyimpan data (${res.status})`);
    return { ok: true, revision: ((await res.json()) as { revision: number }).revision };
  }
}

/** Browser localStorage, for static hosting without a server. Shared by all tabs of this browser. */
export class BrowserBackend implements Backend {
  readonly kind = 'browser';
  readonly label = 'Penyimpanan browser (localStorage)';
  private readonly key: string;
  constructor(key = 'jkn-service/db/v2') {
    this.key = key;
  }

  private read(): DbFile | null {
    const text = window.localStorage.getItem(this.key);
    return text ? (JSON.parse(text) as DbFile) : null;
  }

  async load(): Promise<Snapshot | null> {
    const file = this.read();
    return file ? { db: file.db as Db, revision: file.revision } : null;
  }

  async revision(): Promise<number | null> {
    return this.read()?.revision ?? 0;
  }

  async save(db: Db, expectedRevision: number): Promise<SaveResult> {
    const current = this.read()?.revision ?? 0;
    if (current !== expectedRevision) return { ok: false, currentRevision: current };
    const revision = current + 1;
    window.localStorage.setItem(this.key, JSON.stringify({ revision, savedAt: new Date().toISOString(), db }));
    return { ok: true, revision };
  }
}

/** In-memory backend for tests. */
export class MemoryBackend implements Backend {
  readonly kind = 'memory';
  readonly label = 'Memori (uji)';
  private file: { revision: number; db: Db } | null = null;

  async load(): Promise<Snapshot | null> {
    return this.file ? { db: structuredClone(this.file.db), revision: this.file.revision } : null;
  }

  async revision(): Promise<number | null> {
    return this.file?.revision ?? 0;
  }

  async save(db: Db, expectedRevision: number): Promise<SaveResult> {
    const current = this.file?.revision ?? 0;
    if (current !== expectedRevision) return { ok: false, currentRevision: current };
    this.file = { revision: current + 1, db: structuredClone(db) };
    return { ok: true, revision: current + 1 };
  }
}

export class ConflictError extends Error {}

export function isCurrentSchema(value: unknown): value is Db {
  const db = value as Partial<Db> | null;
  return (
    !!db &&
    db.schemaVersion === SCHEMA_VERSION &&
    db.synthetic === true &&
    Array.isArray(db.claims) &&
    Array.isArray(db.questions) &&
    Array.isArray(db.assignments) &&
    Array.isArray(db.answers) &&
    typeof db.aiConfig === 'object'
  );
}

export type StoreStatus = 'loading' | 'ready' | 'error';

export class DbStore {
  private snapshot: Snapshot | null = null;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private channel: BroadcastChannel | null = null;
  status: StoreStatus = 'loading';
  error: string | null = null;
  /** True when the stored data has an older or unknown format and must be reset. */
  incompatible = false;

  readonly backend: Backend;
  private readonly seed: () => Db;

  constructor(backend: Backend, seed: () => Db) {
    this.backend = backend;
    this.seed = seed;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('jkn-service-db');
      this.channel.onmessage = () => void this.refresh();
    }
  }

  getSnapshot = (): Snapshot | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  private set(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.status = 'ready';
    this.error = null;
    this.emit();
  }

  private initializing: Promise<void> | null = null;

  /** Loads (or seeds) the data once; repeated calls share the same promise. */
  init(): Promise<void> {
    this.initializing ??= this.load();
    return this.initializing;
  }

  private async load(): Promise<void> {
    try {
      const loaded = await this.backend.load();
      if (loaded && !isCurrentSchema(loaded.db)) {
        this.incompatible = true;
        this.status = 'error';
        this.error = 'Data tersimpan memakai format lama. Reset ke data simulasi untuk melanjutkan.';
        this.snapshot = loaded;
        this.emit();
        return;
      }
      if (loaded) {
        this.set(loaded);
        return;
      }
      const db = this.seed();
      const saved = await this.backend.save(db, 0);
      if (!saved.ok) {
        const again = await this.backend.load();
        if (again) this.set(again);
        return;
      }
      this.set({ db, revision: saved.revision });
    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      this.emit();
    }
  }

  /** Applies `change` to a copy of the latest data and saves it; retried on conflicts. */
  transact<T>(change: (db: Db) => T): Promise<T> {
    const run = this.queue.then(() => this.runTransaction(change));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runTransaction<T>(change: (db: Db) => T): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const base = this.snapshot;
      if (!base || this.status !== 'ready') throw new Error('Data belum siap.');
      const draft = structuredClone(base.db);
      const result = change(draft);
      const saved = await this.backend.save(draft, base.revision);
      if (saved.ok) {
        this.set({ db: draft, revision: saved.revision });
        this.channel?.postMessage({ revision: saved.revision });
        return result;
      }
      await this.reload();
    }
    throw new ConflictError('Data sedang diubah di tempat lain. Coba lagi.');
  }

  async reload(): Promise<void> {
    const loaded = await this.backend.load();
    if (loaded && isCurrentSchema(loaded.db)) this.set(loaded);
  }

  /** Picks up changes saved by another tab or role. Cheap when nothing changed. */
  async refresh(): Promise<void> {
    if (this.status !== 'ready' || !this.snapshot) return;
    try {
      const revision = await this.backend.revision();
      if (revision !== null && revision !== this.snapshot.revision) await this.reload();
    } catch {
      // Offline or server restarting: keep showing the last good data.
    }
  }

  /** Replaces everything with a fresh copy of the simulation data. */
  async reset(): Promise<void> {
    const run = this.queue.then(async () => {
      const revision = (await this.backend.revision()) ?? 0;
      const db = this.seed();
      const saved = await this.backend.save(db, revision);
      if (!saved.ok) throw new ConflictError('Reset bentrok dengan perubahan lain. Coba lagi.');
      this.incompatible = false;
      this.set({ db, revision: saved.revision });
      this.channel?.postMessage({ revision: saved.revision });
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
