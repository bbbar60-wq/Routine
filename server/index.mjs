/**
 * Routine — API server.
 *
 * Zero npm dependencies: node:http + node:sqlite + node:crypto only.
 * In development Vite serves the UI and proxies /api here.
 * In production this same process serves the built bundle too.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sendJson, sendError, securityHeaders, notFound, HttpError, rateLimit, clientIp } from './http.mjs';
import { currentUser, requireCsrf, purgeExpiredSessions } from './auth.mjs';

import registerAuth from './routes/auth.mjs';
import registerCore from './routes/core.mjs';
import registerBody from './routes/body.mjs';
import registerLife from './routes/life.mjs';
import registerInsights from './routes/insights.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT || 5181);
const HOST = process.env.HOST || '127.0.0.1';
const DEV = process.env.NODE_ENV !== 'production';

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

const routes = [];

/**
 * @param method  HTTP verb
 * @param pattern e.g. '/api/tasks/:id'
 * @param handler (ctx) => body   — ctx = { req, res, params, query, user }
 * @param opts    { auth = true }
 */
export function route(method, pattern, handler, opts = {}) {
  const names = [];
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\/:(\w+)/g, (_, name) => {
          names.push(name);
          return '/([^/]+)';
        }) +
      '$'
  );
  routes.push({ method, regex, names, handler, auth: opts.auth !== false });
}

const api = { get: (p, h, o) => route('GET', p, h, o),
              post: (p, h, o) => route('POST', p, h, o),
              patch: (p, h, o) => route('PATCH', p, h, o),
              put: (p, h, o) => route('PUT', p, h, o),
              del: (p, h, o) => route('DELETE', p, h, o) };

registerAuth(api);
registerCore(api);
registerBody(api);
registerLife(api);
registerInsights(api);

/* ------------------------------------------------------------------ *
 * Static files (production)
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(req, res, pathname) {
  // Contain every request inside DIST — no traversal out of it.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel);
  if (!file.startsWith(DIST)) return false;

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) {
    // SPA fallback — client-side routes resolve to the app shell.
    if (extname(rel)) return false;
    file = join(DIST, 'index.html');
    info = await stat(file).catch(() => null);
    if (!info?.isFile()) return false;
  }

  const ext = extname(file).toLowerCase();
  const body = await readFile(file);
  const immutable = rel.startsWith('assets') && ext !== '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(body);
  return true;
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const server = createServer(async (req, res) => {
  const started = Date.now();
  try {
    securityHeaders(res, { dev: DEV });

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw notFound();
      const served = await serveStatic(req, res, pathname);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
      return;
    }

    // A broad ceiling so a runaway client can't spin the DB.
    const limited = rateLimit(`api:${clientIp(req)}`, { limit: 1200, windowMs: 60_000 });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      throw new HttpError(429, 'Too many requests');
    }

    const match = routes.find((r) => r.method === req.method && r.regex.test(pathname));
    if (!match) {
      // Distinguish "wrong verb" from "no such route".
      const pathExists = routes.some((r) => r.regex.test(pathname));
      throw new HttpError(pathExists ? 405 : 404, pathExists ? 'Method not allowed' : 'Not found');
    }

    const captured = pathname.match(match.regex).slice(1);
    const params = Object.fromEntries(match.names.map((n, i) => [n, decodeURIComponent(captured[i])]));
    const query = Object.fromEntries(url.searchParams.entries());

    let user = null;
    if (match.auth) {
      user = currentUser(req);
      if (!user) throw new HttpError(401, 'Not signed in');
      if (MUTATING.has(req.method)) requireCsrf(req, user);
    }

    const result = await match.handler({ req, res, params, query, user, url });
    if (res.writableEnded) return;
    sendJson(res, 200, result ?? { ok: true });
  } catch (err) {
    if (!res.writableEnded) sendError(res, err);
  } finally {
    if (DEV && req.url?.startsWith('/api/')) {
      console.log(`  ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3600_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`  Routine API   http://${HOST}:${PORT}`);
  if (!DEV) console.log(`  Routine app   http://${HOST}:${PORT}`);
});
