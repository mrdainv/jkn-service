// Vite plugin: persists the simulation database to local-data/db.json for `npm run dev` and
// `npm run preview`. Every save carries the revision the client read; a stale save gets 409 so two
// tabs or roles never overwrite each other silently. Static builds (GitHub Pages) have no server and
// fall back to browser storage.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { DB_API, DB_DIR, DB_FILE, MAX_DB_BYTES, REVISION_HEADER } from '../src/data/protocol.ts';

type Next = (err?: unknown) => void;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** The write endpoint must never be reachable from another machine (e.g. `vite --host`). */
export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

class HttpError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error));
    this.status = status;
    this.body = body;
  }
}

export function createDbMiddleware(options: { dir: string; now?: () => Date }) {
  const file = path.join(options.dir, DB_FILE);
  const now = options.now ?? (() => new Date());
  let cache: { mtimeMs: number; revision: number } | null = null;
  // Serialises writes so two saves can never both pass the revision check.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  async function currentRevision(): Promise<number> {
    let info;
    try {
      info = await stat(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
    if (cache && cache.mtimeMs === info.mtimeMs) return cache.revision;
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { revision?: unknown };
    if (!Number.isInteger(parsed.revision)) throw new HttpError(500, { error: 'CORRUPT_FILE' });
    cache = { mtimeMs: info.mtimeMs, revision: parsed.revision as number };
    return cache.revision;
  }

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== DB_API.db && pathname !== DB_API.revision && pathname !== DB_API.health) return next();
    try {
      if (!isLoopback(req.socket.remoteAddress)) throw new HttpError(403, { error: 'LOCAL_ONLY' });
      const method = req.method ?? 'GET';
      if (pathname === DB_API.health) return sendJson(res, 200, { store: 'file', file: `${DB_DIR}/${DB_FILE}` });
      if (pathname === DB_API.revision) {
        if (method !== 'GET') throw new HttpError(405, { error: 'METHOD_NOT_ALLOWED' });
        return sendJson(res, 200, { revision: await currentRevision() });
      }
      if (method === 'GET') {
        const text = await readFile(file, 'utf8').catch((err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') throw new HttpError(404, { error: 'NOT_FOUND' });
          throw err;
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        return res.end(text);
      }
      if (method === 'PUT') {
        if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, { error: 'JSON_ONLY' });
        const header = req.headers[REVISION_HEADER];
        const expected = Number(Array.isArray(header) ? header[0] : header);
        if (!Number.isInteger(expected) || expected < 0) throw new HttpError(428, { error: 'REVISION_REQUIRED' });
        let body: { db?: unknown };
        try {
          body = JSON.parse(await readBody(req)) as { db?: unknown };
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(400, { error: 'MALFORMED_JSON' });
        }
        if (!body || typeof body.db !== 'object' || body.db === null) throw new HttpError(400, { error: 'DB_REQUIRED' });
        const saved = await exclusive(async () => {
          const current = await currentRevision();
          if (current !== expected) throw new HttpError(409, { error: 'REVISION_CONFLICT', currentRevision: current });
          const revision = current + 1;
          const savedAt = now().toISOString();
          await mkdir(options.dir, { recursive: true });
          const temp = `${file}.tmp-${process.pid}-${revision}`;
          await writeFile(temp, JSON.stringify({ revision, savedAt, db: body.db }), 'utf8');
          await rename(temp, file);
          cache = null;
          return { revision, savedAt };
        });
        return sendJson(res, 200, saved);
      }
      throw new HttpError(405, { error: 'METHOD_NOT_ALLOWED' });
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, err.body);
      return sendJson(res, 500, { error: 'STORE_ERROR', message: (err as Error).message });
    }
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // Keep draining past the limit so the 413 response can still be delivered.
      if (size <= MAX_DB_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_DB_BYTES) reject(new HttpError(413, { error: 'TOO_LARGE', maxBytes: MAX_DB_BYTES }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function dbFileStore(): Plugin {
  return {
    name: 'jkn-db-file-store',
    configureServer(server) {
      server.middlewares.use(createDbMiddleware({ dir: path.resolve(server.config.root, DB_DIR) }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDbMiddleware({ dir: path.resolve(server.config.root, DB_DIR) }));
    },
  };
}
