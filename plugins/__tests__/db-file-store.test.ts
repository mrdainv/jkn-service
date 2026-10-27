// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbMiddleware } from '../db-file-store.ts';

let dir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'jkn-db-'));
  const mw = createDbMiddleware({ dir });
  server = createServer((req, res) => void mw(req, res, () => ((res.statusCode = 404), res.end())));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const put = (rev: number, db: unknown) =>
  fetch(`${base}/api/db`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-db-revision': String(rev) }, body: JSON.stringify({ db }) });

describe('db file store', () => {
  it('saves with revisions and rejects stale writes', async () => {
    expect((await fetch(`${base}/api/db`)).status).toBe(404);
    expect(await (await fetch(`${base}/api/db/revision`)).json()).toEqual({ revision: 0 });
    expect(await (await put(0, { a: 1 })).json()).toMatchObject({ revision: 1 });
    const stale = await put(0, { a: 2 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ currentRevision: 1 });
    expect((await put(1, { a: 3 })).status).toBe(200);
    const file = JSON.parse(await readFile(path.join(dir, 'db.json'), 'utf8'));
    expect(file).toMatchObject({ revision: 2, db: { a: 3 } });
    expect(await (await fetch(`${base}/api/db`)).json()).toMatchObject({ revision: 2, db: { a: 3 } });
  });

  it('requires a revision and a JSON body', async () => {
    expect((await fetch(`${base}/api/db`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(428);
    expect((await fetch(`${base}/api/db`, { method: 'PUT', headers: { 'content-type': 'text/plain', 'x-db-revision': '0' }, body: 'x' })).status).toBe(415);
    expect((await put(0, null)).status).toBe(400);
  });
});
