// Shared between the browser store and the Vite file-store plugin (plugins/db-file-store.ts).

export const DB_API = {
  db: '/api/db',
  revision: '/api/db/revision',
  health: '/api/db/health',
} as const;

/** Revision the client last read; a save with a stale revision is rejected (409). */
export const REVISION_HEADER = 'x-db-revision';
export const DB_DIR = 'local-data';
export const DB_FILE = 'db.json';
export const MAX_DB_BYTES = 20 * 1024 * 1024;

/** Shape of local-data/db.json. */
export interface DbFile {
  revision: number;
  savedAt: string;
  db: unknown;
}
