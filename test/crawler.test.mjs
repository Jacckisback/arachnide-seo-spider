import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { findChrome } from '../src/renderer.mjs';
import { parseRobots, rulesFor, isAllowed } from '../src/robots.mjs';
import { titlePixels } from '../src/pixel.mjs';
import { simhash, similarity, tokenize, topKeywords } from '../src/text.mjs';

test('robots.txt : règle la plus longue, wildcards', () => {
  const r = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b\nDisallow: /*.pdf$\n\nUser-agent: Googlebot\nDisallow: /g');
  const star = rulesFor(r, 'MonBot');
  assert.equal(isAllowed(star, '/a/x'), false);
  assert.equal(isAllowed(star, '/a/b/c'), true);
  assert.equal(isAllowed(star, '/doc.pdf'), false);
  assert.equal(isAllowed(star, '/doc.pdf?x'), true);
  const g = rulesFor(r, 'Mozilla/5.0 (compatible; Googlebot/2.1)');
  assert.equal(isAllowed(g, '/a'), true);
  assert.equal(isAllowed(g, '/g'), false);
});

test('largeur en pixels et simhash', () => {
  assert.ok(titlePixels('WWWWWWWWWW') > titlePixels('iiiiiiiiii') * 3);
  assert.ok(Math.abs(titlePixels('Cours de français en ligne avec un professeur natif') - 470) < 60);
  const a = tokenize('le chat mange la souris dans la cuisine '.repeat(20) + 'fin');
  const b = tokenize('le chat mange la souris dans la cuisine '.repeat(20) + 'autre');
  const c = tokenize('un texte totalement différent sur la grammaire allemande et ses déclinaisons '.repeat(10));
  assert.ok(similarity(simhash(a), simhash(b)) >= 90);
  assert.ok(similarity(simhash(a), simhash(c)) < 80);
  assert.equal(topKeywords('', 'Préparation DELF B2', '')[0], 'préparation delf');
});

async function crawlFixture(options = {}) {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = new Crawler(base + '/', { concurrency: 3, ...options });
    return { r: await c.start(), base };
  } finally {
    server.close();
  }
}

test('crawl complet du site de test', async () => {
  const { r, base } = await crawlFixture({ checkImages: true, search: 'DELF' });
  const page = (p) => r.pages.find((x) => x.url === base + p);
  const issue = (id) => r.issues.find((i) => i.id === id);
  const ids = (id) => issue(id)?.items.map((i) => i.url.replace(base, '')) || [];

  assert.equal(page('/').status, 200);
  assert.equal(page('/').depth, 0);
  assert.equal(page('/cassee').status, 404);
  assert.equal(page('/admin').blockedByRobots, true);
  assert.equal(page('/ancienne').status, 301);
  assert.equal(page('/orpheline').inSitemap, true);
  assert.equal(page('/orpheline').depth, null);
  assert.equal(page('/blog/Article_Un').indexabilityReason, 'noindex');
  assert.equal(page('/cours?page=2').indexabilityReason, 'canonicalised');
  assert.ok(page('/').linkScore >= page('/orpheline').linkScore);
  assert.ok(page('/guide-delf').searchMatches > 0);

  for (const id of ['4xx', 'broken-internal', 'redirect-chain', 'orphan', 'title-duplicate', 'desc-duplicate', 'h1-multiple',
    'img-alt-missing', 'img-large', 'url-underscore', 'sitemap-non-indexable', 'nofollow-internal', 'thin-content',
    'meta-refresh', 'heading-skip', 'hreflang-invalid', 'hreflang-return', 'schema-incomplete', 'generic-anchors',
    'empty-anchors', 'near-duplicate', 'cannibalization', 'ai-bots-blocked', 'llms-missing']) {
    assert.ok(issue(id), `problème attendu : ${id}`);
  }
  assert.ok(ids('near-duplicate').includes('/guide-delf') && ids('near-duplicate').includes('/guide-delf-2'));
  assert.ok(!ids('near-duplicate').includes('/es/guia-delf'));
  assert.ok(ids('cannibalization').includes('/guide-delf'));
  assert.ok(issue('ai-bots-blocked').items.some((i) => i.detail === 'GPTBot'));
  assert.ok(!issue('search-bots-blocked'));
  for (const i of r.issues) assert.ok(i.priority > 0 && ['high', 'medium', 'low'].includes(i.impact));
  assert.ok(r.summary.score > 0 && r.summary.score < 100);
  assert.match(r.summary.grade, /^[A-F]$/);
  assert.ok(r.links.from.length > 10 && r.links.from.length === r.links.to.length && r.links.urls.length > 0 && r.links.anchors.length > 0);
});

test('mode liste : ne suit pas les liens', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = new Crawler('', { mode: 'list', urls: [base + '/contact', base + '/cours', base + '/cassee'] });
    const r = await c.start();
    assert.deepEqual(r.pages.map((p) => p.url.replace(base, '')).sort(), ['/cassee', '/contact', '/cours']);
  } finally {
    server.close();
  }
});

test('rendu JavaScript (si Chrome est installé)', { skip: !findChrome() && 'Chrome introuvable' }, async () => {
  const { r, base } = await crawlFixture({ render: true, include: '/js$|127.0.0.1:\\d+/$' });
  const p = r.pages.find((x) => x.url === base + '/js');
  assert.ok(p.js?.rendered, JSON.stringify(p.js));
  assert.equal(p.title, 'Titre modifié par JavaScript');
  assert.equal(p.h1[0], 'Rendu JS');
  assert.ok(p.wordCount > 250);
  const ids = r.issues.map((i) => i.id);
  for (const id of ['js-content', 'js-title-changed', 'js-links']) assert.ok(ids.includes(id), id);
});

test('chemin de découverte : le parent enregistré est à un clic (ou une redirection) de la page', async () => {
  const { r } = await crawlFixture();
  const by = new Map(r.pages.map((p) => [p.url, p]));
  let checked = 0;
  for (const p of r.pages) {
    if (!p.pathParent) continue;
    const parent = by.get(p.pathParent);
    assert.ok(parent, 'parent présent dans le crawl : ' + p.url);
    assert.equal(p.depth, parent.depth + (p.pathViaRedirect ? 0 : 1), p.url);
    checked++;
  }
  assert.ok(checked > 5);
});

test('périmètre : plusieurs motifs, dossier de départ, regex invalide sans plantage', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const paths = async (start, o) => (await new Crawler(start, { concurrency: 3, useSitemaps: false, ...o }).start()).pages.filter((p) => p.url.startsWith(base)).map((p) => p.url.replace(base, ''));
    // Exclusions sur plusieurs lignes : aucune URL exclue n'est crawlée, l'URL de départ l'est toujours.
    const ex = await paths(base + '/', { exclude: '/blog/(.*)\n/es/' });
    assert.ok(ex.includes('/') && !ex.some((p) => p.startsWith('/blog/') && p !== '/blog/' && p.length > 6) && !ex.some((p) => p.startsWith('/es/')));
    // Inclusion : seules les URL qui correspondent sont suivies, mais le point d'entrée reste exploré.
    const inc = await paths(base + '/', { include: '/cours' });
    assert.ok(inc.includes('/') && inc.filter((p) => p !== '/').every((p) => p.startsWith('/cours')) && inc.length > 1);
    // Dossier de départ : https://site/blog/ → rien en dehors de /blog/.
    const folder = await paths(base + '/blog/', { stayInFolder: true });
    assert.ok(folder.length >= 2 && folder.every((p) => p.startsWith('/blog/')), folder.join(','));
    // Regex invalide : ignorée et signalée.
    const c = new Crawler(base + '/', { concurrency: 3, maxPages: 3, exclude: '(' });
    const r = await c.start();
    assert.ok(r.pages.length >= 1);
    assert.ok(r.meta.warnings.some((w) => w.key === 'warn.badRegex'));
  } finally {
    server.close();
  }
});
