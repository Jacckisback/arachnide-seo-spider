#!/usr/bin/env node
// Serveur local : sert l'interface et pilote le crawler (API JSON + flux SSE).
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Crawler, USER_AGENTS, VERSION } from './crawler.mjs';
import { findChrome } from './renderer.mjs';
import { toCrawlerOptions } from './options.mjs';
import { CRAWLS, safeName, listCrawls, saveResult, deleteCrawl } from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

let crawler = null;
let lastResult = null;
let lastFile = null;
let liveRows = [];
const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

setInterval(() => {
  if (liveRows.length) {
    broadcast('pages', liveRows);
    liveRows = [];
  }
}, 400);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function startCrawl(body) {
  if (crawler && crawler.phase !== 'done') throw Object.assign(new Error('A crawl is already running.'), { status: 409, key: 'toast.busy' });
  const opts = toCrawlerOptions(body.options || {});

  const c = new Crawler(body.url, opts); // lève une erreur si l'URL est invalide
  crawler = c;
  lastResult = null;
  liveRows = [];
  broadcast('reset', { startUrl: c.startUrl });
  c.on('status', (s) => broadcast('status', s));
  c.on('warning', (w) => broadcast('warning', w));
  c.on('progress', (p) => broadcast('progress', p));
  c.on('page', (p) => liveRows.push({ url: p.url, status: p.status, statusText: p.statusText, contentType: p.contentType, title: p.title || '', responseTime: p.responseTime, size: p.size, wordCount: p.wordCount ?? null }));
  c.start()
    .then(async (result) => {
      lastResult = result;
      try {
        lastFile = await saveResult(result);
      } catch (e) {
        console.error('Sauvegarde impossible :', e.message);
      }
      broadcast('done', { file: lastFile, summary: result.summary });
      console.log(`Crawl terminé : ${result.summary.totalUrls} URLs, score ${result.summary.score}/100 → crawls/${lastFile}`);
    })
    .catch((e) => {
      console.error(e);
      broadcast('failed', { message: e.message });
      c.phase = 'done';
    });
  return { startUrl: c.startUrl };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ running: !!crawler && crawler.phase !== 'done', progress: crawler?.progress() || null })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    if (p === '/api/env') return send(res, 200, { version: VERSION, chrome: findChrome(), node: process.version, platform: process.platform });
    if (p === '/api/state') return send(res, 200, { running: !!crawler && crawler.phase !== 'done', progress: crawler?.progress() || null, hasResult: !!lastResult, file: lastFile });
    if (p === '/api/crawl' && req.method === 'POST') return send(res, 200, await startCrawl(await readBody(req)));
    if (p === '/api/stop' && req.method === 'POST') {
      crawler?.stop();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/result') return lastResult ? send(res, 200, lastResult) : send(res, 404, { error: 'Aucun résultat' });
    if (p === '/api/crawls') return send(res, 200, await listCrawls());
    if (p.startsWith('/api/crawls/')) {
      const name = safeName(decodeURIComponent(p.slice('/api/crawls/'.length)));
      if (!name) return send(res, 400, { error: 'Nom invalide' });
      const file = path.join(CRAWLS, name);
      if (req.method === 'DELETE') {
        await deleteCrawl(name);
        return send(res, 200, { ok: true });
      }
      return send(res, 200, await fs.readFile(file));
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Route inconnue' });

    // Bibliothèques de visualisation servies depuis node_modules (fonctionne hors ligne)
    if (p.startsWith('/vendor/')) {
      const VENDOR = { 'force-graph.min.js': 'force-graph/dist/force-graph.min.js', '3d-force-graph.min.js': '3d-force-graph/dist/3d-force-graph.min.js' };
      const rel = VENDOR[p.slice('/vendor/'.length)];
      if (!rel) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'public, max-age=86400' });
      return res.end(await fs.readFile(path.join(ROOT, 'node_modules', rel)));
    }

    // Fichiers statiques
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Interdit', 'text/plain');
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'Introuvable', 'text/plain');
    return send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    return send(res, e.status || 500, { error: e.message, key: e.key });
  }
});

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* pas de navigateur disponible */ }
}

// Si le port est occupé (Arachnide déjà lancé ou autre application), on essaie les suivants.
function listen(port, attempt = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempt < 10 && !process.env.PORT) return listen(port + 1, attempt + 1);
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} déjà utilisé / already in use.` : e.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`;
    console.log(`\n🕷️  Arachnide SEO Spider ${VERSION} → ${url}\n`);
    if (process.env.ARACHNIDE_OPEN) openBrowser(url);
  });
}
listen(PORT);
