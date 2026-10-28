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

const COLLECTIONS = [
  'participants', 'facilities', 'practitioners', 'claims', 'statusHistory', 'dictionary', 'questions', 'mappings', 'suggestions',
  'selections', 'drafts', 'assignments', 'notifications', 'fristaChecks', 'sessions', 'answers', 'aiConfigHistory', 'audit',
] as const;

/**
 * Shape check for a stored database: the expected schema version, the synthetic flag, every collection
 * present as an array, and the configuration object. Used by the browser store on load and by the file
 * store on every save, so neither side accepts a payload of another format.
 */
export function isDbShape(value: unknown, schemaVersion: number): boolean {
  const db = value as Record<string, unknown> | null;
  return (
    !!db &&
    typeof db === 'object' &&
    db.schemaVersion === schemaVersion &&
    db.synthetic === true &&
    COLLECTIONS.every((c) => Array.isArray(db[c])) &&
    typeof db.aiConfig === 'object' &&
    db.aiConfig !== null &&
    typeof db.counters === 'object'
  );
}
