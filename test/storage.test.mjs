// Chantier « 200 000 pages », étape 3 : crawl écrit au fil de l'eau. NDJSON gzip en flux, en-tête seule pour l'historique,
// anciens .json toujours lisibles, segments dans un fichier voisin, journal de reprise, flux vers le navigateur, CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { writeResult, readResult, readHead, EXT } from '../src/ndjson.mjs';
import { readNdjson, resultRecords, fromTuples } from '../public/shared/ndjson.js';
import { forEachLink, linkCount } from '../public/shared/links.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-storage-'));
process.env.ARACHNIDE_CRAWLS = path.join(tmp, 'crawls');
const store = await import('../src/store.mjs');

const site = await startFixture();
const base = `http://127.0.0.1:${site.address().port}`;
test.after(() => site.close());

// Comparaisons après passage par JSON : les clés à undefined (options non renseignées) disparaissent à l'écriture.
const plain = (x) => JSON.parse(JSON.stringify(x));
const edges = (R) => {
  const out = [];
  forEachLink(R, (f, t, a, fl, p) => out.push([f, t, a, fl, p]));
  return out;
};

test('NDJSON gzip : écriture en flux, relecture identique, en-tête seule, JSON du navigateur inchangé', async () => {
  const R = await new Crawler(base + '/', { concurrency: 3, checkImages: true }).start();
  const file = path.join(tmp, 'a' + EXT);
  await writeResult(R, file);
  assert.deepEqual([...(await fs.readFile(file)).subarray(0, 2)], [0x1f, 0x8b]); // gzip
  assert.deepEqual(await fs.readdir(tmp).then((l) => l.filter((f) => f.endsWith('.tmp'))), []);
  const L = await readResult(file);
  assert.deepEqual(L.meta, plain(R.meta));
  assert.deepEqual(L.summary, plain(R.summary));
  assert.deepEqual(L.pages, plain(R.pages));
  assert.deepEqual(L.issues, plain(R.issues));
  assert.deepEqual(L.images, plain(R.images));
  assert.deepEqual(L.externals, plain(R.externals));
  assert.deepEqual(L.redirects, plain(R.redirects));
  assert.deepEqual(L.links.urls, R.links.urls);
  assert.deepEqual(edges(L), edges(R));
  assert.ok(L.links.from instanceof Int32Array && linkCount(L) > 10);
  // Même JSON pour le navigateur (le bloc de liens typé se sérialise en tableaux simples).
  assert.deepEqual(JSON.parse(JSON.stringify(L)), plain(R));
  const head = await readHead(file);
  assert.deepEqual(head.summary, plain(R.summary));
  assert.equal(head.pages, undefined);
  // Aucune ligne ne porte le crawl entier : chaque enregistrement est une page, un problème ou un paquet.
  const kinds = new Set([...resultRecords(R)].map((r) => r.t));
  assert.ok(kinds.has('head') && kinds.has('page') && kinds.has('issue') && kinds.has('edges') && kinds.has('urls'));
});

test('store : nouveaux et anciens fichiers côte à côte, historique par en-tête, identifiants, segments à côté, suppression', async () => {
  const R = await new Crawler(base + '/', { concurrency: 3 }).start();
  const file = await store.saveResult(R);
  assert.ok(file.endsWith(EXT));
  // Ancien format (≤ 3.16) : JSON d'un bloc avec des liens en tuples.
  const old = { ...R, meta: { ...R.meta, finishedAt: '2026-01-01T00:00:00.000Z' }, links: { urls: R.links.urls, edges: edges(R).map(([f, t, a, fl, p]) => [f, t, a, fl, p]) } };
  await fs.writeFile(path.join(store.CRAWLS, 'old_2026-01-01.json'), JSON.stringify(old));
  const list = await store.listCrawls();
  assert.deepEqual(list.map((c) => c.file), [file, 'old_2026-01-01.json']);
  assert.equal(list[0].score, R.summary.score);
  assert.equal(list[1].totalUrls, R.summary.totalUrls);
  const idx = JSON.parse(await fs.readFile(path.join(store.CRAWLS, '_index.json'), 'utf8'));
  assert.ok(idx[file] && idx['old_2026-01-01.json']);
  // Les deux se chargent, avec le même contenu de liens.
  const a = await store.loadCrawl(file);
  const b = await store.loadCrawl('old_2026-01-01.json');
  assert.deepEqual(edges(a), edges(b));
  assert.deepEqual(edges({ links: fromTuples(old.links) }), edges(R));
  // Identifiants sans extension, quel que soit le format.
  assert.equal(store.crawlId(file) + EXT, file);
  assert.equal(await store.crawlFileOf(store.crawlId(file)), file);
  assert.equal(await store.crawlFileOf('old_2026-01-01'), 'old_2026-01-01.json');
  assert.equal(await store.crawlFileOf('absent'), null);
  assert.equal(store.safeName('x.segments.json'), null);
  // Segments modifiés après coup : fichier voisin, appliqué à l'ouverture, le crawl n'est pas réécrit.
  const before = await fs.stat(path.join(store.CRAWLS, file));
  await store.saveSegments(file, [{ id: 'cours', name: 'Cours', color: '#123456', rules: [{ field: 'path', op: 'starts', value: '/cours' }] }]);
  const withSeg = await store.loadCrawl(file);
  assert.deepEqual(withSeg.meta.segments.map((s) => s.id), ['cours']);
  assert.ok(withSeg.pages.some((p) => p.segment === 'cours'));
  assert.equal((await fs.stat(path.join(store.CRAWLS, file))).mtimeMs, before.mtimeMs);
  await store.deleteCrawl(file);
  assert.deepEqual((await fs.readdir(store.CRAWLS)).filter((f) => f.startsWith(store.crawlId(file))), []);
});

test('journal de reprise : arrêt en plein crawl, reprise à l’identique (pages, file, identifiants d’URL), journal supprimé à la fin', async () => {
  const full = await new Crawler(base + '/', { concurrency: 1 }).start();
  const journal = store.journalPath('test-resume');
  const c1 = new Crawler(base + '/', { concurrency: 1 });
  await c1.openJournal(journal);
  let n = 0;
  c1.on('page', () => ++n === 4 && c1.stop());
  const partial = await c1.start();
  assert.ok(partial.pages.length >= 4 && partial.pages.length < full.pages.length);
  assert.ok((await store.listPending()).some((p) => p.id === 'test-resume'));
  const lines = (await fs.readFile(journal, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].t, 'start');
  assert.ok(lines.some((l) => l.t === 'q') && lines.filter((l) => l.t === 'p').length === partial.pages.length);
  // Journal tronqué par un arrêt brutal : la dernière ligne incomplète est ignorée.
  await fs.appendFile(journal, '{"t":"p","rec":{"url":"' + base + '/cou');
  const c2 = await Crawler.resume(journal);
  assert.equal(c2.resumed, true);
  let replayed = null;
  c2.on('resumed', (r) => {
    replayed = r;
    // Rejoué à l'identique : mêmes pages faites, mêmes identifiants d'URL, des URL encore en file.
    assert.equal(c2.pages.size, partial.pages.length);
    assert.deepEqual(c2.urls.values.slice(0, c1.urls.size), c1.urls.values);
  });
  const resumed = await c2.start();
  assert.ok(replayed && replayed.pages === partial.pages.length && replayed.queued > 0, JSON.stringify(replayed));
  assert.deepEqual(resumed.pages.map((p) => p.url).sort(), full.pages.map((p) => p.url).sort());
  assert.equal(resumed.summary.score, full.summary.score);
  assert.equal(resumed.summary.internalLinks, full.summary.internalLinks);
  assert.deepEqual(resumed.links.urls, full.links.urls);
  for (const p of resumed.pages) {
    const q = full.pages.find((x) => x.url === p.url);
    assert.equal(p.uniqueInlinks, q.uniqueInlinks, p.url);
    assert.equal(p.depth, q.depth, p.url);
  }
  assert.equal(await fs.stat(journal).catch(() => null), null); // journal supprimé en fin de crawl
  assert.deepEqual(await store.listPending(), []);
});

test('serveur : crawl journalisé, fichier envoyé en flux NDJSON et assemblé comme dans le navigateur, réouverture par nom', { timeout: 60000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-srv-'));
  const port = 47000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('http://') && resolve());
    child.on('exit', (c) => reject(new Error('app exited ' + c)));
  });
  const B = `http://127.0.0.1:${port}`;
  const j = (u, o) => fetch(B + u, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), type: r.headers.get('content-type') }));
  try {
    await j('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: base + '/', options: { maxPages: 50 } }) });
    for (let i = 0; i < 200; i++) {
      const s = (await j('/api/state')).body;
      if (!s.running && s.file) break; // le fichier est écrit juste après la fin du crawl
      await new Promise((r) => setTimeout(r, 200));
    }
    const list = (await j('/api/crawls')).body;
    assert.equal(list.length, 1);
    assert.ok(list[0].file.endsWith(EXT));
    assert.deepEqual((await j('/api/pending')).body, []); // journal supprimé à la fin du crawl
    const r = await fetch(B + '/api/crawls/' + encodeURIComponent(list[0].file));
    assert.match(r.headers.get('content-type'), /ndjson/);
    const R = await readNdjson(r.body); // exactement ce que fait l'application
    assert.equal(R.pages.length, list[0].totalUrls);
    assert.ok(R.links.from instanceof Int32Array && linkCount(R) > 10);
    // Réouverture : le navigateur n'envoie que le nom, le serveur relit le fichier lui-même.
    assert.equal((await j('/api/result?file=' + encodeURIComponent(list[0].file), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal((await j('/api/state')).body.file, list[0].file);
    assert.equal((await j('/api/result?file=nope.json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
    assert.equal((await fetch(B + '/api/crawls/absent.json')).status, 404);
  } finally {
    child.kill();
  }
});

test('CLI : JSON, CSV et rapport écrits chacun en flux, dans le nouveau format', { timeout: 60000 }, async () => {
  const out = path.join(tmp, 'cli');
  const { stdout } = await promisify(execFile)(process.execPath, ['src/cli.mjs', base + '/', '--max', '30', '--csv', '--report', '--out', out, '--lang', 'fr'], { cwd: ROOT });
  const files = await fs.readdir(out);
  const json = files.find((f) => f.endsWith(EXT));
  assert.ok(json, stdout);
  assert.ok(files.some((f) => f.endsWith('_pages.csv')) && files.some((f) => f.endsWith('_issues.csv')) && files.some((f) => f.endsWith('_report_fr.html')));
  assert.deepEqual(await fs.readdir(path.join(out, '.en-cours')), []); // journal supprimé
  const R = await store.readResultFile(path.join(out, json));
  assert.ok(R.pages.length > 5);
  const csv = await fs.readFile(path.join(out, files.find((f) => f.endsWith('_pages.csv'))), 'utf8');
  assert.ok(csv.startsWith('﻿URL;') && csv.trim().split('\n').length === R.pages.length + 1);
});

test('navigateur : un crawl enregistré au nouveau format s’ouvre depuis l’historique, lu en flux, sans erreur', { timeout: 90000 }, async (t) => {
  const { loadPlaywright } = await import('./ui-helpers.mjs');
  const pw = loadPlaywright();
  if (!pw) return t.skip('Playwright absent');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-ui-'));
  const R = await new Crawler(base + '/', { concurrency: 3 }).start();
  await fs.mkdir(path.join(home, 'crawls'), { recursive: true });
  const name = 'demo_2026-10-21T10-00-00' + EXT;
  await writeResult(R, path.join(home, 'crawls', name));
  const port = 48000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('http://') && resolve());
    child.on('exit', (c) => reject(new Error('app exited ' + c)));
  });
  const browser = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }).catch(() => null);
  if (!browser) return t.skip('Chromium absent');
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.click('#historyBtn');
    await page.click(`#historyDialog [data-open="${name}"]`);
    await page.waitForSelector('#tabs [data-tab=viz]:not([disabled])');
    const shown = await page.evaluate(() => document.querySelector('#tabs [data-tab=internal]')?.textContent || document.body.textContent);
    assert.ok(shown, 'pages tab');
    // Le serveur a rouvert le même fichier (segments, corrections et agents travaillent dessus).
    for (let i = 0; i < 50 && (await fetch(`http://127.0.0.1:${port}/api/state`).then((r) => r.json())).file !== name; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/state`).then((r) => r.json())).file, name);
    // Le tableau des pages et la cartographie lisent les liens du bloc en colonnes.
    await page.click('#tabs [data-tab=internal]');
    const rows = await page.$$eval('table tbody tr', (trs) => trs.length);
    assert.ok(rows > 5, String(rows));
    await page.click('#tabs [data-tab=viz]');
    await page.waitForTimeout(800);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    child.kill();
  }
});
