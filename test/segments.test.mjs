// Segments (3.14) : règles, ordre, découpe du crawl, score par segment, CLI-options, rapport, API et outils agents.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { toCrawlerOptions } from '../src/options.mjs';
import { getT } from '../public/shared/i18n.js';
import { buildReport } from '../public/shared/report.js';
import { normalizeSegments, compileSegments, assignSegments, applySegments, sliceResult, computeSummary, segmentStats, issueBySegment, suggestFromFolders, NONE } from '../public/shared/segments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let cached;
async function crawl(options = {}) {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return { r: await new Crawler(base + '/', { concurrency: 3, ...options }).start(), base };
  } finally {
    server.close();
  }
}
const fixture = async () => (cached ||= await crawl());
const clone = (R) => JSON.parse(JSON.stringify(R));

const SEGS = [
  { name: 'Blog', rules: [{ field: 'path', op: 'startsWith', value: '/blog/' }] },
  { name: 'DELF', match: 'any', rules: [{ field: 'title', op: 'contains', value: 'delf' }, { field: 'url', op: 'regex', value: 'guia' }] },
];

test('le résumé recalculé est identique à celui du moteur (même méthode de score)', async () => {
  const { r } = await fixture();
  const S = computeSummary(r);
  for (const k of Object.keys(r.summary)) assert.deepEqual(S[k], r.summary[k], k);
});

test('normalisation : ids uniques, règles invalides retirées, regex invalide signalée', () => {
  const { segments, problems } = normalizeSegments([
    { name: 'Blog', rules: [{ field: 'path', op: 'startsWith', value: '/blog/' }] },
    { name: 'Blog', rules: [{ field: 'nope', op: 'x', value: 1 }, { field: 'depth', op: 'gte', value: '' }, { field: 'title', op: 'regex', value: '(' }] },
    { name: '', rules: [] },
    null,
    { name: '  Fiches produit  ', color: 'red', match: 'any', rules: [{ field: 'status', op: 'weird', value: '200' }] },
  ]);
  assert.deepEqual(segments.map((s) => s.id), ['blog', 'blog-2', 'fiches-produit']);
  assert.equal(segments[1].rules.length, 1); // seule la regex (invalide mais lue comme texte) reste
  assert.equal(problems.length, 1);
  assert.equal(segments[2].name, 'Fiches produit');
  assert.match(segments[2].color, /^#[0-9a-f]{6}$/);
  assert.equal(segments[2].rules[0].op, 'eq'); // opérateur inconnu → premier opérateur du type
  assert.equal(normalizeSegments({ segments: [{ name: 'X', rules: [] }] }).segments.length, 1); // format exporté par l'app
});

test('règles : premier segment qui correspond, ET / OU, nombres, booléens, énumérations, extraction', () => {
  const pages = [
    { url: 'https://x.fr/blog/a', title: 'Guide DELF', wordCount: 900, depth: 2, indexable: true, isHtml: true, status: 200, extracted: { Auteur: ['Marie'] } },
    { url: 'https://x.fr/p/1?ref=2', title: 'Produit', wordCount: 50, depth: 4, indexable: false, indexabilityReason: 'noindex', status: 200, isHtml: true },
    { url: 'https://x.fr/old', status: 301, indexable: false, indexabilityReason: 'redirect' },
  ];
  const of = (segs) => {
    const { segments } = normalizeSegments(segs);
    const f = compileSegments(segments);
    return pages.map((p) => f(p));
  };
  assert.deepEqual(of(SEGS), ['blog', NONE, NONE]); // « Guide DELF » est d'abord dans Blog : l'ordre compte
  assert.deepEqual(of([SEGS[1], SEGS[0]]), ['delf', NONE, NONE]);
  assert.deepEqual(of([{ name: 'Courtes', rules: [{ field: 'words', op: 'lt', value: 100 }] }]), [NONE, 'courtes', NONE]); // sans mots : pas « < 100 »
  assert.deepEqual(of([{ name: 'Profondes non indexables', rules: [{ field: 'depth', op: 'gte', value: 3 }, { field: 'indexable', op: 'isFalse' }] }]), [NONE, 'profondes-non-indexables', NONE]);
  assert.deepEqual(of([{ name: 'Redirections', rules: [{ field: 'indexability', op: 'equals', value: 'redirect' }] }]), [NONE, NONE, 'redirections']);
  assert.deepEqual(of([{ name: 'Params', rules: [{ field: 'path', op: 'contains', value: '?REF=' }] }]), [NONE, 'params', NONE]); // insensible à la casse
  assert.deepEqual(of([{ name: 'Marie', rules: [{ field: 'extract:Auteur', op: 'equals', value: 'marie' }] }]), ['marie', NONE, NONE]);
  assert.deepEqual(of([{ name: 'Vide', rules: [] }]), [NONE, NONE, NONE]); // un segment sans règle ne prend rien
  assert.deepEqual(of([{ name: 'Pas blog', rules: [{ field: 'path', op: 'notRegex', value: '^/blog' }, { field: 'status', op: 'eq', value: 200 }] }]), [NONE, 'pas-blog', NONE]);
});

test('découpe d’un crawl sur un segment : pages, problèmes, score recalculé, problèmes de site gardés', async () => {
  const R = clone((await fixture()).r);
  applySegments(R, SEGS);
  const B = sliceResult(R, 'blog');
  assert.ok(B.pages.length >= 3 && B.pages.every((p) => p.segment === 'blog'));
  const urls = new Set(B.pages.map((p) => p.url));
  for (const i of B.issues) {
    if (i.scope === 'site') assert.deepEqual(i.items, R.issues.find((x) => x.id === i.id).items);
    else assert.ok(i.items.every((it) => urls.has(it.url)), i.id);
    assert.equal(i.count, i.items.length);
  }
  assert.ok(B.issues.some((i) => i.scope === 'site')); // robots.txt, HTTPS… touchent aussi ce segment
  assert.equal(B.summary.totalUrls, B.pages.length);
  assert.equal(B.meta.segment.name, 'Blog');
  assert.equal(B.meta.segment.total, R.pages.length);
  assert.deepEqual(B.summary, computeSummary(B));
  assert.ok(B.redirects.every((x) => urls.has(x.url)) && B.brokenLinks.every((l) => urls.has(l.from)));
  // Les segments + « sans segment » couvrent tout le crawl, sans recouvrement.
  const stats = segmentStats(R);
  assert.equal(stats.reduce((a, g) => a + g.pages, 0), R.pages.length);
  assert.deepEqual(stats.map((g) => g.id), ['blog', 'delf', NONE]);
  assert.ok(stats.every((g) => g.score == null || (g.score >= 0 && g.score <= 100)));
  assert.deepEqual(R.summary.segments.map((g) => g.id), ['blog', 'delf', NONE]);
  // Répartition d'un problème de page par segment = ses URL uniques.
  const is = R.issues.find((i) => i.scope === 'page');
  assert.equal(issueBySegment(R, is).reduce((a, g) => a + g.count, 0), new Set(is.items.map((x) => x.url)).size);
  // Segment inconnu : crawl complet inchangé.
  assert.equal(sliceResult(R, 'nope'), R);
  // Retirer les segments.
  applySegments(R, []);
  assert.deepEqual(R.meta.segments, []);
  assert.equal(R.summary.segments, undefined);
  assert.ok(R.pages.every((p) => p.segment === undefined));
});

test('segments proposés à partir des répertoires (et un niveau plus bas quand un dossier contient tout)', () => {
  const page = (p) => ({ url: 'https://x.fr' + p, isHtml: true, status: 200 });
  const R1 = { pages: ['/', '/blog/a', '/blog/b', '/blog/c', '/shop/a', '/shop/b', '/contact', '/x/1'].map(page) };
  assert.deepEqual(suggestFromFolders(R1).map((s) => [s.name, s.rules[0].value]), [['Blog', '/blog/'], ['Shop', '/shop/']]);
  const R2 = { pages: ['/fr/', ...Array.from({ length: 10 }, (_, i) => `/fr/produits/p${i}`), ...Array.from({ length: 6 }, (_, i) => `/fr/blog/b${i}`), '/en/x'].map(page) };
  assert.deepEqual(suggestFromFolders(R2).map((s) => s.rules[0].value), ['/fr/produits/', '/fr/blog/']);
  const R3 = { pages: ['/fr/a', '/es/b', '/en/c', '/de/d', '/fr/e', '/es/f'].map(page) };
  assert.deepEqual(suggestFromFolders(R3).map((s) => s.name), ['FR', 'ES']);
});

test('option de crawl « segments » : appliquée au résultat, validée par toCrawlerOptions', async () => {
  const opts = toCrawlerOptions({ segments: [...SEGS, { name: 'Bad', rules: [{ field: 'x' }] }] });
  assert.equal(opts.segments.length, 3);
  const { r } = await crawl(opts);
  assert.deepEqual(r.meta.segments.map((s) => s.id), ['blog', 'delf', 'bad']);
  assert.ok(r.pages.some((p) => p.segment === 'blog'));
  assert.ok(r.summary.segments.find((g) => g.id === 'blog').pages >= 3);
});

test('rapport : couverture du segment et section « Résultats par segment »', async () => {
  const R = clone((await fixture()).r);
  applySegments(R, SEGS);
  const t = await getT('fr');
  const full = buildReport(R, { segments: segmentStats(R) }, t);
  assert.match(full, /Résultats par segment/);
  assert.match(full, /Sans segment/);
  const seg = buildReport(sliceResult(R, 'blog'), {}, t);
  assert.match(seg, /Segment : Blog/);
  assert.doesNotMatch(seg, /Résultats par segment/);
});

test('API et outils agents : segments enregistrés avec le crawl, filtre « segment » sur les outils', { timeout: 90000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-seg-'));
  const site = await startFixture();
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;
  const port = 47000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ARACHNIDE_HOME: home, ARACHNIDE_CRAWLS: path.join(home, 'crawls'), ARACHNIDE_NO_SCHEDULER: '1', ARACHNIDE_OPEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('app did not start')), 15000);
    child.stdout.on('data', (d) => String(d).includes('http://') && (clearTimeout(to), resolve()));
  });
  const B = `http://127.0.0.1:${port}`;
  const j = async (u, o = {}) => {
    const r = await fetch(B + u, o);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const post = (u, body, headers = {}) => j(u, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/api/segments', { segments: SEGS })).status, 404); // aucun crawl ouvert
    await post('/api/crawl', { url: siteUrl, options: { maxPages: 60 } });
    let st;
    for (let i = 0; i < 100; i++) {
      st = (await j('/api/state')).body;
      if (st.hasResult && st.file) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(st.hasResult);
    // Depuis l'interface : appliqués sans recrawler, enregistrés dans le fichier du crawl.
    const saved = await post('/api/segments', { segments: SEGS });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.segments.map((s) => s.id), ['blog', 'delf']);
    assert.deepEqual(saved.body.stats.map((g) => g.id), ['blog', 'delf', NONE]);
    const file = JSON.parse(await fs.readFile(path.join(home, 'crawls', st.file), 'utf8'));
    assert.deepEqual(file.meta.segments.map((s) => s.id), ['blog', 'delf']);
    assert.ok(file.pages.some((p) => p.segment === 'delf'));
    assert.deepEqual((await j('/api/segments')).body.segments.map((s) => s.id), ['blog', 'delf']);

    // Outils agents (REST) : lecture, filtre par segment, proposition et modification.
    const token = (await j('/api/agent/settings')).body.token;
    const H = { authorization: 'Bearer ' + token };
    const get = await post('/api/agent/arachnide_segments', {}, H);
    assert.equal(get.status, 200);
    assert.deepEqual(get.body.stats.map((g) => g.id), ['blog', 'delf', NONE]);
    const sum = await post('/api/agent/arachnide_get_summary', { segment: 'blog' }, H);
    assert.equal(sum.body.segment.name, 'Blog');
    assert.equal(sum.body.urls, get.body.stats[0].pages);
    const all = await post('/api/agent/arachnide_get_summary', {}, H);
    assert.equal(all.body.segments.length, 3);
    const pages = await post('/api/agent/arachnide_search_pages', { segment: 'blog', limit: 100 }, H);
    assert.ok(pages.body.pages.length > 0 && pages.body.pages.every((p) => p.segment === 'blog'));
    const issues = await post('/api/agent/arachnide_list_issues', { segment: NONE }, H);
    assert.equal(issues.status, 200);
    const plan = await post('/api/agent/arachnide_action_plan', { segment: 'delf' }, H);
    assert.equal(plan.status, 200);
    const unknown = await post('/api/agent/arachnide_get_summary', { segment: 'nope' }, H);
    assert.equal(unknown.status, 404);
    assert.match(unknown.body.hint || unknown.body.error, /blog/);
    const sug = await post('/api/agent/arachnide_segments', { action: 'suggest' }, H);
    assert.equal(sug.body.saved, false);
    assert.ok(sug.body.segments.some((s) => s.rules[0].value === '/blog/'));
    assert.deepEqual((await j('/api/segments')).body.segments.map((s) => s.id), ['blog', 'delf']); // « suggest » n'enregistre rien
    const set = await post('/api/agent/arachnide_segments', { action: 'set', segments: [{ name: 'Espagnol', rules: [{ field: 'path', op: 'startsWith', value: '/es/' }] }] }, H);
    assert.equal(set.status, 200);
    assert.deepEqual((await j('/api/segments')).body.segments.map((s) => s.id), ['espagnol']);
    const file2 = JSON.parse(await fs.readFile(path.join(home, 'crawls', st.file), 'utf8'));
    assert.deepEqual(file2.meta.segments.map((s) => s.id), ['espagnol']);
  } finally {
    child.kill();
    site.close();
  }
});
