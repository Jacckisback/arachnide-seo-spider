// Chantier « 200 000 pages », étape 1 : plus de spread sur des tableaux à la taille du site, plus de boucles quadratiques,
// écritures atomiques. Les cas ci-dessous reproduisent les limites mesurées (pile d'appels dès ~125 000 éléments).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closestUrl, prepareCandidates, deterministicFixes } from '../src/fix/rules.mjs';
import { proposeFixes } from '../src/fix/engine.mjs';
import { writeAtomic } from '../src/store.mjs';

const B = 'https://big.example';
const N = 140_000; // au-delà du seuil où Math.min(...tableau) lève « Maximum call stack size exceeded »

test('scores de liens : 140 000 URL sans dépasser la pile d’appels', async () => {
  const { analyze } = await import('../src/analyze.mjs');
  const { Crawler } = await import('../src/crawler.mjs');
  const c = new Crawler(B + '/', { maxUrls: N + 10 });
  c.finalStart = B + '/';
  c.startedAt = c.finishedAt = new Date().toISOString();
  for (let i = 0; i < N; i++) {
    const url = `${B}/p/${i}`;
    c.pages.set(url, { url, isHtml: true, status: 200, statusText: 'OK', contentType: 'text/html', indexable: true, title: 'T' + i, metaDescription: 'D'.repeat(80), h1: ['H'], h1Count: 1, h2: [], wordCount: 300, canonical: url, hreflang: [], depth: 1, responseTime: 10, size: 1000 });
    c.links.push({ from: url, to: `${B}/p/${(i + 1) % N}`, anchor: 'next', internal: true, nofollow: false });
  }
  const t0 = Date.now();
  const R = analyze(c);
  assert.equal(R.pages.length, N);
  assert.ok(R.pages.every((p) => p.linkScore >= 0 && p.linkScore <= 100));
  assert.ok(Date.now() - t0 < 60_000);
});

test('règles déterministes : un problème qui touche 140 000 URL, sans spread, en temps linéaire', async () => {
  const pages = [];
  for (let i = 0; i < N; i++) pages.push({ url: `${B}/p/${i}`, isHtml: true, status: 200, indexable: true, title: 'T' });
  const R = { meta: { startUrl: B + '/', finalStart: B + '/', origin: B }, pages, redirects: [], links: { urls: [], edges: [] }, issues: [{ id: 'canonical-missing', severity: 'notice', count: N, items: pages.map((p) => ({ url: p.url })) }] };
  const t0 = Date.now();
  const { fixes } = await proposeFixes(R, { issueIds: ['canonical-missing'] });
  assert.equal(fixes.length, N);
  assert.ok(Date.now() - t0 < 20_000, `${Date.now() - t0} ms`);
});

test('404 : candidats préparés une fois, dossier parent d’abord, même résultat que la recherche complète', () => {
  const urls = [];
  for (let i = 0; i < 20_000; i++) urls.push(`${B}/${['blog', 'cours', 'shop'][i % 3]}/article-${i}`);
  urls.push(`${B}/cours/grammaire-francaise`, `${B}/autre/grammaire`);
  const P = prepareCandidates(urls);
  assert.equal(P.all.length, urls.length);
  // Même dossier + même mot : l'URL du dossier parent gagne, comme avant.
  assert.equal(closestUrl(`${B}/cours/grammaire`, P).url, `${B}/cours/grammaire-francaise`);
  assert.equal(closestUrl(`${B}/cours/grammaire`, urls).url, `${B}/cours/grammaire-francaise`);
  // Rien dans le dossier parent : la recherche complète trouve ailleurs.
  assert.equal(closestUrl(`${B}/inconnu/grammaire`, P).url, `${B}/autre/grammaire`);
  assert.equal(closestUrl(`${B}/inconnu/zzz`, P), null);
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) closestUrl(`${B}/cours/article-${i}-x`, P);
  assert.ok(Date.now() - t0 < 5_000, `${Date.now() - t0} ms pour 300 recherches`);
});

test('liens vers des redirections : index des liens sortants et des redirections, construits une fois', () => {
  const n = 5_000;
  const urls = [];
  for (let i = 0; i < n; i++) urls.push(`${B}/p/${i}`);
  urls.push(`${B}/old`, `${B}/new`);
  const edges = [];
  for (let i = 0; i < n; i++) edges.push([i, n, 'x', 2, 0], [i, (i + 1) % n, 'y', 2, 0]);
  const pages = urls.map((url) => ({ url, isHtml: true, status: url.endsWith('/old') ? 301 : 200, indexable: !url.endsWith('/old') }));
  const R = { meta: { startUrl: B + '/', finalStart: B + '/p/0', origin: B }, pages, redirects: [{ url: `${B}/old`, finalUrl: `${B}/new`, finalStatus: 200 }], links: { urls, edges }, issues: [] };
  const t0 = Date.now();
  const fixes = deterministicFixes(R, { id: 'links-to-redirect', items: urls.slice(0, n).map((url) => ({ url })) });
  assert.equal(fixes.length, n);
  assert.ok(fixes.every((f) => f.oldValue === `${B}/old` && f.newValue === `${B}/new`));
  assert.ok(Date.now() - t0 < 5_000, `${Date.now() - t0} ms`);
});

test('écriture atomique : le fichier final apparaît entier ou pas du tout, sans fichier temporaire oublié', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-atomic-'));
  const file = path.join(dir, 'a.json');
  await writeAtomic(file, '{"ok":1}');
  assert.equal(await fs.readFile(file, 'utf8'), '{"ok":1}');
  await writeAtomic(file, '{"ok":2}');
  assert.equal(await fs.readFile(file, 'utf8'), '{"ok":2}');
  await assert.rejects(writeAtomic(path.join(dir, 'absent', 'b.json'), 'x'));
  assert.deepEqual(await fs.readdir(dir), ['a.json']);
});

test('carte : dossiers comptés par préfixe, même résultat que le croisement page × dossier', async () => {
  const { buildModel } = await import('../public/map-model.js');
  const { folderOptions } = await import('../public/map-view.js');
  const H = B + '/';
  const pages = [];
  for (let i = 0; i < 3_000; i++) pages.push({ url: `${H}${['en', 'fr'][i % 2]}/${['blog', 'cours'][i % 3 % 2]}/${i}`, isHtml: true, status: 200, indexable: true });
  pages.push({ url: H + 'en', isHtml: true, status: 200, indexable: true }, { url: H + 'en/blog/', isHtml: true, status: 200, indexable: true });
  const M = buildModel({ meta: { startUrl: H }, pages, issues: [] }, { out: new Map() });
  const fast = new Map(folderOptions(M));
  const slow = new Map();
  for (const f of M.folders) slow.set(f, 0);
  for (const p of M.pages) {
    const pth = new URL(p.url).pathname;
    for (const f of M.folders) if (pth.startsWith(f) || pth + '/' === f) slow.set(f, slow.get(f) + 1);
  }
  for (const [f, n] of slow) if (n >= 2) assert.equal(fast.get(f), n, f);
  assert.equal(fast.get('/en/'), slow.get('/en/'));
});
