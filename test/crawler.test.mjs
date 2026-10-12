import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { parseRobots, rulesFor, isAllowed } from '../src/robots.mjs';

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

test('crawl complet du site de test', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = new Crawler(base + '/', { checkExternal: false, checkImages: true, concurrency: 3 });
    const r = await c.start();
    const page = (p) => r.pages.find((x) => x.url === base + p);
    const issue = (id) => r.issues.find((i) => i.id === id);

    assert.equal(page('/').status, 200);
    assert.equal(page('/').depth, 0);
    assert.equal(page('/cassee').status, 404);
    assert.equal(page('/admin').blockedByRobots, true);
    assert.equal(page('/ancienne').status, 301);
    assert.equal(page('/orpheline').inSitemap, true);
    assert.equal(page('/orpheline').depth, null);
    assert.equal(page('/blog/Article_Un').indexabilityReason, 'Noindex');
    assert.equal(page('/cours?page=2').indexabilityReason, 'Canonicalisée');

    assert.ok(issue('4xx'));
    assert.ok(issue('broken-internal').items.length >= 1);
    assert.ok(issue('redirect-chain').items.some((i) => i.url === base + '/ancienne'));
    assert.ok(issue('orphan').items.some((i) => i.url === base + '/orpheline'));
    assert.ok(issue('title-duplicate'));
    assert.ok(issue('desc-duplicate'));
    assert.ok(issue('h1-multiple'));
    assert.ok(issue('img-alt-missing'));
    assert.ok(issue('img-large'));
    assert.ok(issue('url-underscore'));
    assert.ok(issue('sitemap-non-indexable'));
    assert.ok(issue('nofollow-internal'));
    assert.ok(issue('thin-content'));
    assert.ok(r.summary.score > 0 && r.summary.score < 100);
    assert.ok(r.links.edges.length > 10);
  } finally {
    server.close();
  }
});
