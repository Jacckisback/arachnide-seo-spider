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

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = 'https://big.example';
const N = 150_000; // au-delà du seuil où Math.min(...tableau) lève « Maximum call stack size exceeded »

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

// ---- Chantier 2 : graphe compact (src/graph.mjs) ----

test('graphe : table d’URL, liens en colonnes qui grandissent, itérateur de compatibilité', async () => {
  const { Interner, LinkStore, FLAG } = await import('../src/graph.mjs');
  const urls = new Interner();
  assert.equal(urls.id('a'), 0);
  assert.equal(urls.id('b'), 1);
  assert.equal(urls.id('a'), 0);
  assert.equal(urls.size, 2);
  const L = new LinkStore(urls, new Interner(), 4); // capacité initiale minuscule : force les doublements
  for (let i = 0; i < 100; i++) L.add({ from: 'p' + (i % 10), to: 'p' + ((i + 1) % 10), anchor: i % 2 ? 'Contact' : '', nofollow: i % 3 === 0, internal: true, imageLink: i === 5, code: i === 7, pos: i % 4 ? 'content' : 'nav' });
  assert.equal(L.length, 100);
  assert.ok(L.cap >= 100);
  assert.equal(L.anchors.size, 2); // « Contact » stocké une fois, pas 50
  const l5 = L.at(5);
  assert.deepEqual(l5, { from: 'p5', to: 'p6', anchor: 'Contact', nofollow: false, internal: true, imageLink: true, code: false, pos: 'content' });
  assert.ok(L.some((l) => l.code && l.from === 'p7'));
  assert.equal([...L].length, 100);
  assert.equal(L.count((f) => f & FLAG.nofollow), 34);
  const cols = L.columns();
  assert.equal(cols.from.length, 100);
  assert.equal(cols.pos[0], 1); // nav
});

test('graphe CSR : voisins, dédoublonnage, liens entrants uniques, PageRank égal à la version objet', async () => {
  const { csr, uniqueCounts, pageRankCsr } = await import('../src/graph.mjs');
  // 0 → 1 (×3), 0 → 2, 1 → 2, 2 → 0, 3 isolé (dangling)
  const src = Int32Array.from([0, 0, 0, 0, 1, 2]);
  const dst = Int32Array.from([1, 1, 1, 2, 2, 0]);
  const g = csr(4, [{ src, dst }]);
  assert.deepEqual(Array.from(g.off), [0, 4, 5, 6, 6]);
  assert.deepEqual(Array.from(g.adj.subarray(0, 4)).sort(), [1, 1, 1, 2]);
  const d = csr(4, [{ src, dst }], { dedupe: true });
  assert.deepEqual(Array.from(d.off), [0, 2, 3, 4, 4]);
  assert.deepEqual(Array.from(d.adj), [1, 2, 2, 0]);
  const rev = csr(4, [{ src: dst, dst: src }]);
  assert.deepEqual(Array.from(uniqueCounts(4, rev)), [1, 1, 2, 0]);
  // keep et map : on exclut le nœud 3 et le lien 1 → 2.
  const mapped = csr(3, [{ src, dst, keep: (i) => !(src[i] === 1 && dst[i] === 2) }], { map: Int32Array.from([0, 1, 2, -1]), dedupe: true });
  assert.deepEqual(Array.from(mapped.adj), [1, 2, 0]);
  // PageRank : même résultat que l'ancienne implémentation (Map de Set), sur le graphe dédoublonné.
  const old = (nodes, adj, iterations = 30, dd = 0.85) => {
    const N = nodes.length;
    const idx = new Map(nodes.map((u, i) => [u, i]));
    const out = nodes.map((u) => [...(adj.get(u) || [])].map((v) => idx.get(v)));
    let pr = new Float64Array(N).fill(1 / N);
    for (let it = 0; it < iterations; it++) {
      const next = new Float64Array(N).fill((1 - dd) / N);
      let dangling = 0;
      for (let i = 0; i < N; i++) if (!out[i].length) dangling += pr[i]; else for (const j of out[i]) next[j] += (dd * pr[i]) / out[i].length;
      for (let i = 0; i < N; i++) next[i] += (dd * dangling) / N;
      pr = next;
    }
    const logs = Array.from(pr, Math.log);
    const min = Math.min(...logs), max = Math.max(...logs);
    return logs.map((l) => (max > min ? Math.round(((l - min) / (max - min)) * 100) : 100));
  };
  const adj = new Map([[0, new Set([1, 2])], [1, new Set([2])], [2, new Set([0])]]);
  assert.deepEqual(Array.from(pageRankCsr(4, d)), old([0, 1, 2, 3], adj));
});

test('liens enregistrés : lecture des deux formats (colonnes 3.17+, tuples ≤ 3.16) par le même code', async () => {
  const { forEachLink, linkCount, linkUrls } = await import('../public/shared/links.js');
  const urls = ['https://x.fr/', 'https://x.fr/a', 'https://ext.com/'];
  const tuples = { links: { urls, edges: [[0, 1, 'A', 2, 0], [1, 2, '', 0, 3]] } };
  const columns = { links: { urls, anchors: ['A', ''], from: [0, 1], to: [1, 2], anchor: [0, 1], flags: [2, 0], pos: [0, 3] } };
  const seen = (R) => {
    const out = [];
    forEachLink(R, (f, t, a, fl, p) => out.push([f, t, a, fl, p]));
    return out;
  };
  assert.deepEqual(seen(tuples), seen(columns));
  assert.deepEqual(seen(columns), [[0, 1, 'A', 2, 0], [1, 2, '', 0, 3]]);
  assert.equal(linkCount(tuples), 2);
  assert.equal(linkCount(columns), 2);
  assert.equal(linkUrls(columns)[2], 'https://ext.com/');
  assert.equal(linkCount({}), 0);
});

test('analyse sur colonnes : même graphe que l’ancien chemin objet (inlinks, uniques, contenu, profondeur, chemin)', async () => {
  const { Crawler } = await import('../src/crawler.mjs');
  const { analyze } = await import('../src/analyze.mjs');
  const H = 'https://g.example';
  const c = new Crawler(H + '/', {});
  c.finalStart = H + '/';
  c.startedAt = c.finishedAt = new Date().toISOString();
  const add = (path, extra = {}) => c.pages.set(H + path, { url: H + path, isHtml: true, status: 200, statusText: 'OK', contentType: 'text/html', indexable: true, title: 'T', metaDescription: 'D'.repeat(80), h1: ['H'], h1Count: 1, h2: [], wordCount: 300, hreflang: [], responseTime: 10, size: 1000, ...extra });
  add('/');
  add('/a');
  add('/b');
  add('/old', { status: 301, isHtml: false, redirectUrl: H + '/b' });
  add('/err', { status: 404, isHtml: false });
  const link = (from, to, pos = 'content', nofollow = false) => c.links.add({ from: H + from, to: H + to, anchor: 'x', nofollow, internal: true, pos });
  link('/', '/a', 'nav');
  link('/', '/a', 'content'); // deux liens vers /a depuis / : 1 source unique, 1 en contenu
  link('/', '/old'); // / → /old → (redirection, 0 clic) /b
  link('/a', '/b', 'content', true); // nofollow : compte en inlink, pas pour la profondeur
  link('/err', '/b'); // page en erreur : ignorée
  link('/b', '/b'); // vers soi-même : ignoré
  c.links.add({ from: H + '/', to: 'https://ext.com/', anchor: 'ext', internal: false, pos: 'footer' });
  const R = analyze(c);
  const P = Object.fromEntries(R.pages.map((p) => [p.url.replace(H, ''), p]));
  assert.equal(P['/a'].inlinks, 2);
  assert.equal(P['/a'].uniqueInlinks, 1);
  assert.equal(P['/a'].contentInlinks, 1);
  assert.equal(P['/b'].inlinks, 1); // depuis /a (nofollow compte) ; /err et /b → /b ignorés
  assert.equal(P['/'].depth, 0);
  assert.equal(P['/a'].depth, 1);
  assert.equal(P['/old'].depth, 1);
  assert.equal(P['/b'].depth, 1); // via la redirection de /old : 1 clic, pas 2
  assert.equal(P['/b'].pathParent, H + '/old');
  assert.equal(P['/b'].pathViaRedirect, true);
  assert.equal(P['/a'].pathParent, H + '/');
  assert.equal(P['/err'].depth, null);
  assert.ok(R.pages.every((p) => p.linkScore >= 0 && p.linkScore <= 100));
  assert.equal(R.summary.internalLinks, 6);
  assert.equal(R.summary.externalLinks, 1);
  assert.equal(R.links.from.length, 7);
  assert.equal(R.links.anchors.length, 2);
  assert.equal(R.images.length, 0);
});

test('règle de relecture : jamais de spread (...tableau) en argument quand la taille dépend du site', async () => {
  const { execSync } = await import('node:child_process');
  const out = execSync(`grep -rnE "Math\\.(min|max)\\(\\.\\.\\.|\\.push\\(\\.\\.\\." src public --include=*.mjs --include=*.js --exclude-dir=vendor --exclude-dir=fonts || true`, { cwd: ROOT, encoding: 'utf8' });
  // Sites autorisés : taille bornée par construction (≤ 50 segments, ≤ 100 types de problèmes).
  const allowed = [/src\/cli\.mjs:\d+:.*segRows/, /src\/fixes\.mjs:\d+:.*SEV\[i\.severity\]/, /public\/segments-ui\.js:\d+:.*sug\.filter/, /src\/connectors\/wordpress\.mjs:\d+:.*gallery_images/];
  const bad = out.split('\n').filter(Boolean).filter((l) => !allowed.some((re) => re.test(l)));
  assert.deepEqual(bad, [], 'spread sur un tableau à la taille du site :\n' + bad.join('\n'));
});
