// Run the Cloudflare Worker locally on Node with an in-memory D1 (no Cloudflare account needed).
// Usage: node scripts/local-api.mjs [port]   then build/serve the app with VITE_API_URL=http://localhost:8787
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fakeD1 } from './fake-d1.mjs';

const port = Number(process.argv[2] ?? 8787);
const out = join(mkdtempSync(join(tmpdir(), 'fronts-worker-')), 'worker.mjs');
execFileSync(resolve('node_modules/.bin/rolldown'), ['worker/src/index.ts', '--format', 'esm', '--file', out], { stdio: 'inherit' });
const worker = (await import(pathToFileURL(out).href)).default;
const env = { DB: fakeD1(), ALLOWED_ORIGINS: '*' };

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  const r = await worker.fetch(request, env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
  console.log(req.method, req.url, r.status);
}).listen(port, () => console.log(`FRONTS local API on http://localhost:${port}`));
