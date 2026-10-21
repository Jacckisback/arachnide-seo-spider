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
import { CRAWLS, safeName, listCrawls, saveResult, deleteCrawl, loadCrawl, saveSegments, crawlId, journalPath, listPending } from './store.mjs';
import { isNdjson, ndjsonStream, readResult, EXT } from './ndjson.mjs';
import { createReadStream, createWriteStream } from 'node:fs';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { resultRecords } from '../public/shared/ndjson.js';
import { lightRecords, pageLinks, mapCounts, mapEdges, compareTo, linkStatsOf } from './view.mjs';
import { readSchedules, saveSchedule, deleteSchedule, runSchedule, nextRun, startScheduler } from './schedules.mjs';
import { publicSmtp, saveSmtp, sendMail } from './mailer.mjs';
import { handleFixRoutes } from './fix/routes.mjs';
import { createAgentGateway } from './agent/http.mjs';
import { digestOf } from './agent/tools.mjs';
import { applySegments } from '../public/shared/segments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

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

// Flux NDJSON vers le navigateur : une ligne par enregistrement, jamais le résultat entier dans une chaîne.
async function sendNdjson(res, records, { gzip = false, filename = null } = {}) {
  const headers = { 'content-type': gzip ? 'application/gzip' : 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' };
  if (filename) headers['content-disposition'] = `attachment; filename="${filename}"`;
  res.writeHead(200, headers);
  async function* lines() {
    for (const r of records) yield JSON.stringify(r) + '\n';
  }
  try {
    await (gzip ? pipeline(Readable.from(lines()), createGzip({ level: 1 }), res) : pipeline(Readable.from(lines()), res));
  } catch {
    res.destroy();
  }
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const raw = (await readRaw(req)).toString('utf8');
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400, key: 'toast.badRequest' });
  }
  // null, nombre, tableau… : une requête mal formée n'est pas une erreur serveur.
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

// Crawls lancés depuis l'interface ou par un agent : un seul à la fois, visible en direct dans l'interface.
const jobs = new Map();
async function startCrawl(body) {
  // { resume: <id> } : reprise d'un crawl interrompu depuis son journal (GET /api/pending les liste).
  if (body.resume) return launchCrawl(null, {}, 'ui', { resume: String(body.resume) });
  return launchCrawl(body.url, toCrawlerOptions(body.options || {}), 'ui');
}
async function launchCrawl(url, opts, via, { resume = null } = {}) {
  if (crawler && crawler.phase !== 'done') throw Object.assign(new Error('A crawl is already running.'), { status: 409, key: 'toast.busy' });
  let c;
  const jobId = resume || 'job_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (resume) {
    c = await Crawler.resume(journalPath(resume)).catch((e) => {
      throw Object.assign(new Error('Cannot resume: ' + e.message), { status: 404, key: 'toast.openFailed' });
    });
  } else {
    c = new Crawler(url, opts); // lève une erreur si l'URL est invalide
    // Journal de reprise : écrit au fil de l'eau, supprimé en fin de crawl ; un arrêt brutal ne perd que les dernières secondes.
    await c.openJournal(journalPath(jobId)).catch((e) => console.error('Journal de crawl impossible :', e.message));
  }
  const job = { id: jobId, url: c.startUrl, via, state: 'running', startedAt: c.startedAt || new Date().toISOString(), crawler: c };
  jobs.set(job.id, job);
  if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
  crawler = c;
  lastResult = null;
  liveRows = [];
  broadcast('reset', { startUrl: c.startUrl, via });
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
        lastFile = null;
        console.error('Sauvegarde impossible :', e.message);
        // Le résultat reste affiché, mais l'utilisateur doit savoir qu'il n'est pas enregistré (et l'exporter).
        broadcast('warning', { key: 'warn.saveFailed', params: { error: e.code || 'error' } });
      }
      // La tâche ne garde qu'un condensé : le crawl entier (des centaines de Mo sur un gros site) ne vit que dans lastResult.
      Object.assign(job, { state: 'done', file: lastFile, digest: digestOf(result), crawler: null, finishedAt: new Date().toISOString() });
      broadcast('done', { file: lastFile, summary: result.summary });
      console.log(`Crawl terminé : ${result.summary.totalUrls} URLs, score ${result.summary.score}/100 → crawls/${lastFile}`);
    })
    .catch((e) => {
      console.error(e);
      Object.assign(job, { state: 'failed', error: e.message, crawler: null, finishedAt: new Date().toISOString() });
      broadcast('failed', { message: e.message });
      c.phase = 'done';
    });
  return { startUrl: c.startUrl, job: job.id };
}

// Passerelle agents IA (MCP HTTP + REST) : elle lit le crawl ouvert et lance des crawls visibles dans l'interface.
const gateway = createAgentGateway({
  lang: process.env.ARACHNIDE_LANG || 'en',
  broadcast,
  ctx: {
    currentResult: () => lastResult,
    startCrawl: async (url, opts) => ({ id: (await launchCrawl(url, opts, 'agent')).job }),
    jobStatus(id) {
      const j = jobs.get(id);
      if (!j) return null;
      return { id, url: j.url, state: j.state, started_at: j.startedAt, finished_at: j.finishedAt, progress: j.crawler?.progress?.() || null, crawl_id: j.file ? crawlId(j.file) : (j.state === 'done' ? 'current' : undefined), result: j.digest, error: j.error };
    },
    // Un agent a changé les segments du crawl ouvert : on les enregistre avec le crawl et l'interface les reprend.
    segmentsChanged(R) {
      if (R !== lastResult) return null;
      broadcast('segments', { segments: R.meta.segments || [], via: 'agent' });
      return lastFile ? saveSegments(lastFile, R.meta.segments).catch((e) => console.error('Sauvegarde des segments impossible :', e.message)) : null;
    },
    adopt(R, file) {
      if (crawler && crawler.phase !== 'done') return;
      lastResult = R;
      lastFile = file || null;
      broadcast('done', { file: lastFile, summary: R.summary, via: 'agent' });
    },
  },
});

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
    if (await gateway.handle(req, res, p, url, { send, readBody })) return;
    if (p === '/api/env') return send(res, 200, { version: VERSION, chrome: findChrome(), node: process.version, platform: process.platform });
    if (p === '/api/state') return send(res, 200, { running: !!crawler && crawler.phase !== 'done', progress: crawler?.progress() || null, hasResult: !!lastResult, file: lastFile });
    if (p === '/api/crawl' && req.method === 'POST') return send(res, 200, await startCrawl(await readBody(req)));
    if (p === '/api/stop' && req.method === 'POST') {
      crawler?.stop();
      return send(res, 200, { ok: true });
    }
    // Crawls planifiés et réglages e-mail
    if (p === '/api/schedules' && req.method === 'GET') return send(res, 200, (await readSchedules()).map((s) => ({ ...s, nextRun: s.enabled ? nextRun(s).toISOString() : null })));
    if (p === '/api/schedules' && req.method === 'POST') {
      try {
        return send(res, 200, await saveSchedule(await readBody(req)));
      } catch (e) {
        throw Object.assign(e, { status: 400, key: 'sched.invalid' });
      }
    }
    let m = /^\/api\/schedules\/([\w-]+)(\/run)?$/.exec(p);
    if (m && req.method === 'DELETE') {
      await deleteSchedule(m[1]);
      return send(res, 200, { ok: true });
    }
    if (m && m[2] && req.method === 'POST') {
      const s = (await readSchedules()).find((x) => x.id === m[1]);
      if (!s) return send(res, 404, { error: 'Unknown schedule' });
      runSchedule(s).then((r) => broadcast('schedule', { id: s.id, ...r })).catch(() => {});
      return send(res, 202, { started: true });
    }
    if (p.startsWith('/api/ai/') || p.startsWith('/api/fix/')) {
      if (await handleFixRoutes(req, res, p, { send, readBody, broadcast, getResult: () => lastResult })) return;
    }
    if (p === '/api/smtp' && req.method === 'GET') return send(res, 200, await publicSmtp());
    if (p === '/api/smtp' && req.method === 'POST') return send(res, 200, await saveSmtp(await readBody(req)));
    if (p === '/api/smtp/test' && req.method === 'POST') {
      const { to } = await readBody(req);
      try {
        await sendMail({ to, subject: 'Arachnide SEO Spider — test', text: 'It works: Arachnide can send you crawl alerts.', html: '<p>It works: <b>Arachnide SEO Spider</b> can send you crawl alerts.</p>' });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message, key: e.key || 'mail.failed' });
      }
    }
    if (p === '/api/result' && req.method === 'POST') {
      // Un crawl ouvert depuis un fichier dans l'interface devient aussi le crawl courant du serveur : les corrections,
      // les comparaisons et l'outil MCP travaillent alors sur ce que l'utilisateur regarde.
      if (crawler && crawler.phase !== 'done') return send(res, 409, { error: 'A crawl is already running.', key: 'toast.busy' });
      // Crawl rouvert depuis l'historique : le serveur le relit lui-même depuis le fichier (le navigateur n'a rien à
      // renvoyer) et garde son nom, pour y rattacher les segments.
      const fromFile = safeName(url.searchParams.get('file') || '');
      const body = await readBody(req);
      let R = body.pages ? body : null;
      if (!R && fromFile) R = await loadCrawl(fromFile).catch(() => null);
      if (!R || !R.pages || !R.summary || !R.meta) return send(res, 400, { error: 'Invalid crawl', key: 'toast.invalidFile' });
      lastResult = R;
      lastFile = fromFile && (await fs.stat(path.join(CRAWLS, fromFile)).then(() => true, () => false)) ? fromFile : null;
      return send(res, 200, { ok: true });
    }
    // Segments du crawl ouvert : appliqués sans recrawler, enregistrés avec le crawl (visibles des agents IA / MCP).
    if (p === '/api/segments' && req.method === 'GET') return send(res, 200, { segments: lastResult?.meta?.segments || [], stats: lastResult?.summary?.segments || [], linkStats: lastResult ? linkStatsOf(lastResult) : {} });
    if (p === '/api/segments' && req.method === 'POST') {
      if (!lastResult) return send(res, 404, { error: 'No crawl loaded', key: 'toast.noCrawl' });
      const body = await readBody(req);
      const { segments, problems } = applySegments(lastResult, body.segments || []);
      if (lastFile) await saveSegments(lastFile, segments).catch((e) => console.error('Sauvegarde des segments impossible :', e.message));
      broadcast('segments', { segments });
      return send(res, 200, { segments, problems, stats: lastResult.summary.segments || [], linkStats: linkStatsOf(lastResult) });
    }
    // Le navigateur reçoit un résultat léger en flux (pages réduites aux champs des tableaux, sans les liens) ; le graphe
    // reste ici et répond à la demande.
    if (p === '/api/result') return lastResult ? sendNdjson(res, lightRecords(lastResult)) : send(res, 404, { error: 'Aucun résultat' });
    if (p === '/api/page') {
      const u = url.searchParams.get('url') || '';
      const page = lastResult?.pages.find((x) => x.url === u);
      return page ? send(res, 200, page) : send(res, 404, { error: 'Unknown page' });
    }
    if (p === '/api/links') {
      if (!lastResult) return send(res, 404, { error: 'Aucun résultat' });
      const q = url.searchParams;
      return send(res, 200, pageLinks(lastResult, q.get('url') || '', { dir: q.get('dir') === 'in' ? 'in' : 'out', offset: Math.max(0, Number(q.get('offset')) || 0), limit: Math.min(1000, Math.max(1, Number(q.get('limit')) || 200)), map: q.get('map') === '1' }));
    }
    if (p === '/api/map-graph') return lastResult ? send(res, 200, mapCounts(lastResult)) : send(res, 404, { error: 'Aucun résultat' });
    if (p === '/api/map-edges' && req.method === 'POST') {
      if (!lastResult) return send(res, 404, { error: 'Aucun résultat' });
      const body = await readBody(req);
      const urls = Array.isArray(body.urls) ? body.urls.filter((x) => typeof x === 'string').slice(0, 10000) : [];
      return send(res, 200, { edges: mapEdges(lastResult, urls) });
    }
    // Comparaison avec un crawl enregistré : calculée ici, seul le petit diff part vers le navigateur.
    if (p === '/api/compare') {
      if (!lastResult) return send(res, 404, { error: 'Aucun résultat' });
      const name = safeName(url.searchParams.get('with') || '');
      if (!name) return send(res, 400, { error: 'Nom invalide' });
      const prev = await loadCrawl(name).catch(() => null);
      return prev ? send(res, 200, compareTo(lastResult, prev)) : send(res, 404, { error: 'Not found' });
    }
    // Ouverture d'un crawl enregistré : le serveur lit le fichier lui-même, le navigateur demande ensuite /api/result.
    if (p === '/api/open' && req.method === 'POST') {
      if (crawler && crawler.phase !== 'done') return send(res, 409, { error: 'A crawl is already running.', key: 'toast.busy' });
      const name = safeName(url.searchParams.get('file') || '');
      const R = name ? await loadCrawl(name).catch(() => null) : null;
      if (!R) return send(res, 404, { error: 'Not found', key: 'toast.openFailed' });
      lastResult = R;
      lastFile = name;
      return send(res, 200, { ok: true, file: name, summary: R.summary });
    }
    // Import d'un fichier depuis le navigateur : JSON (anciens exports) ou NDJSON gzip, lu en flux via un fichier temporaire.
    if (p === '/api/import' && req.method === 'POST') {
      if (crawler && crawler.phase !== 'done') return send(res, 409, { error: 'A crawl is already running.', key: 'toast.busy' });
      const buf = await readRaw(req);
      let R = null;
      try {
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          const tmp = path.join(os.tmpdir(), `arachnide-import-${process.pid}-${Date.now().toString(36)}${EXT}`);
          await fs.writeFile(tmp, buf);
          R = await readResult(tmp).finally(() => fs.unlink(tmp).catch(() => {}));
        } else R = JSON.parse(buf.toString('utf8'));
      } catch {
        R = null;
      }
      if (!R || !R.pages || !R.summary || !R.meta) return send(res, 400, { error: 'Invalid crawl', key: 'toast.invalidFile' });
      lastResult = R;
      lastFile = null;
      return send(res, 200, { ok: true, summary: R.summary });
    }
    // Export du crawl ouvert : NDJSON gzip en flux (le format des fichiers enregistrés).
    if (p === '/api/export') {
      if (!lastResult) return send(res, 404, { error: 'Aucun résultat' });
      const host = new URL(lastResult.meta.startUrl).hostname.replace(/[^\w.-]/g, '_');
      return sendNdjson(res, resultRecords(lastResult), { gzip: true, filename: `${host}_${(lastResult.meta.finishedAt || '').slice(0, 10)}${EXT}` });
    }
    if (p === '/api/crawls') return send(res, 200, await listCrawls());
    if (p === '/api/pending') return send(res, 200, await listPending());
    if (p.startsWith('/api/crawls/')) {
      const name = safeName(decodeURIComponent(p.slice('/api/crawls/'.length)));
      if (!name) return send(res, 400, { error: 'Nom invalide' });
      const file = path.join(CRAWLS, name);
      if (req.method === 'DELETE') {
        await deleteCrawl(name);
        return send(res, 200, { ok: true });
      }
      // En flux : NDJSON décompressé (nouveau format, assemblé ligne par ligne par le navigateur) ou le JSON tel quel.
      if (!(await fs.stat(file).catch(() => null))) return send(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'content-type': isNdjson(name) ? 'application/x-ndjson; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      const src = isNdjson(name) ? ndjsonStream(file) : createReadStream(file);
      src.on('error', () => res.destroy());
      src.pipe(res);
      return;
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Route inconnue' });

    // Bibliothèques de visualisation servies depuis node_modules (fonctionne hors ligne)
    if (p.startsWith('/vendor/')) {
      const VENDOR = { 'force-graph.min.js': 'force-graph/dist/force-graph.min.js', '3d-force-graph.min.js': '3d-force-graph/dist/3d-force-graph.min.js', 'three.module.js': 'three/build/three.module.js', 'three.core.js': 'three/build/three.core.js' };
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
    // Erreur système (fichier absent, droits…) : pas de chemin interne dans la réponse.
    if (e.code === 'ENOENT') return send(res, 404, { error: 'Not found', key: 'toast.notFound' });
    if (e.code && !e.status) return send(res, 500, { error: e.code });
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

// Planificateur : crawls planifiés pendant que l'application est ouverte (désactivable avec ARACHNIDE_NO_SCHEDULER=1).
if (!process.env.ARACHNIDE_NO_SCHEDULER) startScheduler({ log: (m) => console.log(m) });
