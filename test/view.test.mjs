// Chantier « 200 000 pages », étape 5 : le navigateur reçoit un résultat léger en flux, sans les liens ; le serveur garde
// le graphe et répond à la demande (liens d'une page, sous-graphe de la carte, fiche complète, comparaison, ouverture).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { writeResult, readResult, EXT } from '../src/ndjson.mjs';
import { lightRecords, lightPage, pageLinks, mapCounts, mapEdges, linkStatsOf } from '../src/view.mjs';
import { readNdjson, assembler } from '../public/shared/ndjson.js';
import { forEachLink, linkUrls, LINK_POS } from '../public/shared/links.js';
import { buildModel } from '../public/map-model.js';
import { sliceResult, applySegments } from '../public/shared/segments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = await startFixture();
const base = `http://127.0.0.1:${site.address().port}`;
test.after(() => site.close());
const R = await new Crawler(base + '/', { concurrency: 3, checkImages: true }).start();

// Graphe complet en mémoire (comme l'ancienne interface) pour vérifier les réponses du serveur.
function legacyGraph(R) {
  const urls = linkUrls(R);
  const out = new Map();
  const inl = new Map();
  forEachLink(R, (f, to, a, flags, pos) => {
    const e = { from: urls[f], to: urls[to], anchor: a, nofollow: !!(flags & 1), internal: !!(flags & 2), image: !!(flags & 4), pos: LINK_POS[pos || 0] };
    (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    (inl.get(e.to) || inl.set(e.to, []).get(e.to)).push(e);
  });
  return { out, inl };
}

test('résultat léger : mêmes pages, problèmes et résumé, sans les liens ni les champs réservés à la fiche', () => {
  const A = assembler();
  for (const r of lightRecords(R)) A.push(r);
  const L = A.finish();
  assert.equal(L.pages.length, R.pages.length);
  assert.deepEqual(L.issues, JSON.parse(JSON.stringify(R.issues)));
  assert.deepEqual(L.summary, JSON.parse(JSON.stringify(R.summary)));
  assert.equal(L.links.from.length, 0);
  const home = L.pages.find((p) => p.url === base + '/');
  const full = R.pages.find((p) => p.url === base + '/');
  assert.ok(full.og && !('og' in home) && !('closestMatch' in home));
  for (const k of ['title', 'status', 'indexable', 'depth', 'uniqueInlinks', 'linkScore', 'wordCount', 'h1', 'keywords', 'canonical', 'headers']) assert.deepEqual(home[k], full[k], k);
  const light = JSON.stringify([...lightRecords(R)]);
  const whole = JSON.stringify(R);
  assert.ok(light.length < whole.length, `${light.length} vs ${whole.length}`); // site de test minuscule : la vraie mesure est dans le CHANGELOG
  const js = lightPage({ url: 'x', js: { rendered: true, lcp: 1, consoleErrors: ['a', 'b'], requests: 3, html: 'big' } });
  assert.deepEqual(js.js, { rendered: true, lcp: 1, requests: 3, jsErrors: 2 });
});

test('liens d’une page à la demande : pagination, sens, règles de la carte, mêmes données que le graphe complet', () => {
  const G = legacyGraph(R);
  for (const url of [base + '/', base + '/cours', base + '/guide-delf']) {
    for (const dir of ['out', 'in']) {
      const want = (dir === 'out' ? G.out : G.inl).get(url) || [];
      const all = pageLinks(R, url, { dir, limit: 1000 });
      assert.equal(all.total, want.length, `${url} ${dir}`);
      assert.deepEqual(all.items.map((e) => [e[dir === 'in' ? 'from' : 'to'], e.anchor, e.pos, e.internal, e.nofollow]), want.map((e) => [e[dir === 'in' ? 'from' : 'to'], e.anchor, e.pos, e.internal, e.nofollow]));
      const p1 = pageLinks(R, url, { dir, offset: 0, limit: 3 });
      const p2 = pageLinks(R, url, { dir, offset: 3, limit: 3 });
      assert.equal(p1.items.length, Math.min(3, want.length));
      assert.equal(p1.has_more, want.length > 3);
      assert.deepEqual([...p1.items, ...p2.items].slice(0, want.length), all.items.slice(0, 6));
    }
  }
  assert.deepEqual(pageLinks(R, 'https://nope/', {}).items, []);
  // Statut de la cible (liens sortants) ou de la page (liens entrants).
  const out = pageLinks(R, base + '/', { dir: 'out', limit: 1000 }).items.find((e) => e.to === base + '/cassee');
  assert.equal(out.status, 404);
  // Règles de la carte : voisins distincts, liens suivis, entre pages du corpus.
  const M = buildModel(R, legacyGraph(R));
  const inMap = pageLinks(R, base + '/cours', { dir: 'in', map: true, limit: 1000 });
  assert.deepEqual(new Set(inMap.items.map((x) => x.url)), M.inl.get(base + '/cours'));
  const outMap = pageLinks(R, base + '/', { dir: 'out', map: true, limit: 1000 });
  assert.deepEqual(new Set(outMap.items.map((x) => x.url)), M.out.get(base + '/'));
});

test('carte : compteurs et sous-graphe du serveur = modèle construit sur le graphe complet', () => {
  const M = buildModel(R, legacyGraph(R));
  const C = mapCounts(R);
  assert.equal(C.linkCount, M.linkCount);
  for (const p of M.pages) assert.equal(C.inl[p.url] || 0, M.inl.get(p.url)?.size || 0, p.url);
  const lazy = buildModel(R, { counts: C });
  assert.equal(lazy.lazy, true);
  assert.equal(lazy.linkCount, M.linkCount);
  for (const p of M.pages) assert.equal(lazy.inl.get(p.url)?.size || 0, M.inl.get(p.url)?.size || 0);
  const urls = M.pages.map((p) => p.url);
  const edges = mapEdges(R, urls);
  const want = new Set();
  for (const [u, set] of M.out) for (const v of set) want.add(u + ' ' + v);
  assert.deepEqual(new Set(edges.map(([a, b]) => urls[a] + ' ' + urls[b])), want);
  assert.deepEqual(mapEdges(R, [base + '/', 'https://nope/']), mapEdges(R, [base + '/']));
});

test('segments dans le navigateur : compteurs de liens en nombres, même résumé qu’avec les liens', () => {
  const segs = [{ id: 'cours', name: 'Cours', color: '#123', rules: [{ field: 'path', op: 'starts', value: '/cours' }] }];
  applySegments(R, segs);
  const stats = linkStatsOf(R);
  const A = assembler();
  for (const r of lightRecords(R)) A.push(r);
  const L = A.finish();
  assert.deepEqual(L.linkStats, stats);
  const withLinks = sliceResult(R, 'cours').summary;
  const light = sliceResult(L, 'cours').summary;
  assert.equal(light.internalLinks, withLinks.internalLinks);
  assert.equal(light.externalLinks, withLinks.externalLinks);
  assert.equal(light.uniqueExternal, withLinks.uniqueExternal);
  assert.equal(light.score, withLinks.score);
  applySegments(R, []);
});

test('serveur : résultat léger en flux, fiche, liens, carte, comparaison, ouverture, import et export', { timeout: 120000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-view-'));
  await fs.mkdir(path.join(home, 'crawls'), { recursive: true });
  const older = { ...R, meta: { ...R.meta, finishedAt: '2026-01-01T00:00:00.000Z' }, issues: R.issues.slice(2) };
  await writeResult(older, path.join(home, 'crawls', 'prev' + EXT));
  const port = 49000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('http://') && resolve());
    child.on('exit', (c) => reject(new Error('app exited ' + c + ' ' + stderr)));
  });
  child.on('exit', (c) => console.error('server exited', c, stderr.slice(-2000)));
  const B = `http://127.0.0.1:${port}`;
  const j = (u, o) => fetch(B + u, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), type: r.headers.get('content-type') || '' }));
  try {
    assert.equal((await j('/api/result')).status, 404);
    // Import d'un ancien export JSON (comme le bouton « Importer »), puis le résultat léger en flux.
    const imp = await j('/api/import', { method: 'POST', body: JSON.stringify(R) });
    assert.equal(imp.status, 200);
    const r1 = await fetch(B + '/api/result');
    assert.match(r1.headers.get('content-type'), /ndjson/);
    const L = await readNdjson(r1.body);
    assert.equal(L.pages.length, R.pages.length);
    assert.equal(L.meta.light, undefined);
    assert.equal(L.links.from.length, 0);
    // Fiche complète, liens paginés, carte.
    const page = await j('/api/page?url=' + encodeURIComponent(base + '/'));
    assert.ok(page.body.og && page.body.url === base + '/');
    assert.equal((await j('/api/page?url=https://nope/')).status, 404);
    const links = await j('/api/links?url=' + encodeURIComponent(base + '/') + '&dir=out&limit=2');
    assert.equal(links.body.items.length, 2);
    assert.ok(links.body.total > 2 && links.body.has_more);
    const mg = await j('/api/map-graph');
    assert.equal(mg.body.linkCount, buildModel(R, legacyGraph(R)).linkCount);
    const me = await j('/api/map-edges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: [base + '/', base + '/cours'] }) });
    assert.ok(me.body.edges.some(([a, b]) => a === 0 && b === 1));
    // Comparaison calculée côté serveur : petit diff, jamais le crawl précédent entier.
    const cmp = await j('/api/compare?with=prev' + EXT);
    assert.equal(cmp.status, 200);
    assert.ok(Array.isArray(cmp.body.issues) && cmp.body.issues.some((i) => i.prev === 0 && i.cur > 0));
    assert.equal((await j('/api/compare?with=nope' + EXT)).status, 404);
    // Ouverture par nom : le serveur lit le fichier lui-même.
    const op = await j('/api/open?file=prev' + EXT, { method: 'POST' });
    assert.equal(op.status, 200);
    assert.equal((await j('/api/state')).body.file, 'prev' + EXT);
    assert.equal((await j('/api/open?file=absent' + EXT, { method: 'POST' })).status, 404);
    // Export : NDJSON gzip, relu entièrement.
    const ex = await fetch(B + '/api/export');
    assert.match(ex.headers.get('content-disposition') || '', /attachment/);
    const buf = Buffer.from(await ex.arrayBuffer());
    const tmp = path.join(home, 'export' + EXT);
    await fs.writeFile(tmp, buf);
    const back = await readResult(tmp);
    assert.equal(back.pages.length, R.pages.length);
    assert.ok(back.links.from.length > 10);
    assert.ok(gunzipSync(buf).toString('utf8').startsWith('{"t":"head"'));
    // Import d'un fichier NDJSON gzip (export ou fichier enregistré).
    assert.equal((await j('/api/import', { method: 'POST', body: buf })).status, 200);
    assert.equal((await j('/api/state')).body.file, null);
    assert.equal((await j('/api/import', { method: 'POST', body: 'not json' })).status, 400);
    // Segments : compteurs de liens renvoyés avec les statistiques.
    const seg = await j('/api/segments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ segments: [{ id: 'cours', name: 'Cours', color: '#123', rules: [{ field: 'path', op: 'starts', value: '/cours' }] }] }) });
    assert.ok(seg.body.linkStats.cours.internalLinks > 0);
  } finally {
    child.kill();
  }
});

test('navigateur : panneau de détail avec liens entrants / sortants servis par le serveur, carte en mode maillage', { timeout: 120000 }, async (t) => {
  const { loadPlaywright, startApp, openApp } = await import('./ui-helpers.mjs');
  const pw = loadPlaywright();
  if (!pw) return t.skip('Playwright absent');
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-view-ui-')), 'crawl' + EXT);
  await writeResult(R, file);
  const app = await startApp();
  const ui = await openApp(pw, app.url, file);
  if (!ui) { app.child.kill(); return t.skip('Chromium absent'); }
  const { browser, page, errors } = ui;
  try {
    await page.click('#tabs [data-tab=internal]');
    // Première ligne du tableau : l'URL est lue dans l'en-tête du panneau, les attentes viennent du serveur.
    await page.click('table tbody tr[data-i="0"]');
    await page.waitForSelector('#detail [data-dt=out]');
    const url = (await page.textContent('#detail .detail-head .url')).trim();
    const want = pageLinks(R, url, { dir: 'out', limit: 1000 });
    await page.click('#detail [data-dt=out]');
    if (want.total) {
      await page.waitForSelector('#detail tr[data-url]');
      const rows = await page.$$eval('#detail tr[data-url]', (trs) => trs.map((x) => x.dataset.url));
      assert.deepEqual(rows, want.items.slice(0, 200).map((e) => e.to));
    } else await page.waitForFunction(() => /\S/.test(document.querySelector('#detail .detail-body')?.textContent || ''));
    const count = await page.textContent('#detail [data-dt=out] .count');
    assert.equal(Number(count.replace(/\D/g, '')), want.total);
    await page.click('#detail [data-dt=in]');
    const wantIn = pageLinks(R, url, { dir: 'in', limit: 1000 });
    if (wantIn.total) await page.waitForSelector('#detail tr[data-url]');
    await page.click('#detail [data-dt=details]');
    // Fiche complète (champs réservés au détail) demandée au serveur : le panneau se remplit sans erreur.
    await page.waitForFunction(() => (document.querySelector('#detail .detail-body')?.textContent || '').trim().length > 50);
    await page.waitForResponse((r) => r.url().includes('/api/page?'), { timeout: 5000 }).catch(() => {});
    await page.click('#tabs [data-tab=graph]');
    await page.waitForSelector('#mapCanvas canvas');
    await page.selectOption('[data-o=mode]', 'links').catch(() => {});
    await page.waitForTimeout(800);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    app.child.kill();
  }
});
