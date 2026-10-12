import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { toCrawlerOptions, parsePathLimits } from '../src/options.mjs';
import { testRobots } from '../public/shared/robots.js';

async function crawl(options) {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await new Crawler(base + '/', { concurrency: 3, ...options }).start();
    return { r, base, page: (p) => r.pages.find((x) => x.url === base + p) };
  } finally {
    server.close();
  }
}

test('options du formulaire → options du crawler', () => {
  assert.deepEqual(parsePathLimits('/blog/ = 200\n/produits/: 50\nn’importe quoi'), [{ pattern: '/blog/', max: 200 }, { pattern: '/produits/', max: 50 }]);
  const o = toCrawlerOptions({ maxQueryParams: '0', maxUrlPerSec: '', robotsMode: 'report', extractors: [{ name: 'prix', selector: '.prix' }, { name: '', selector: 'x' }] });
  assert.equal(o.maxQueryParams, 0);
  assert.equal(o.maxUrlPerSec, undefined);
  assert.equal(o.robotsMode, 'report');
  assert.equal(o.extractors.length, 1);
  assert.throws(() => toCrawlerOptions({ include: '(' }), /Invalid option/);
  assert.equal(toCrawlerOptions({ respectRobots: false }).robotsMode, 'ignore');
});

test('testeur robots.txt', () => {
  assert.deepEqual(testRobots('User-agent: *\nDisallow: /admin', 'Googlebot', 'https://x.fr/admin/page'), { allowed: false, rule: 'Disallow: /admin' });
  assert.equal(testRobots('User-agent: *\nDisallow: /admin', 'Googlebot', 'https://x.fr/blog').allowed, true);
});

test('Spider > Limites : dossiers, paramètres, par profondeur, par chemin', async () => {
  const a = await crawl({ maxFolderDepth: 2, maxQueryParams: 1 });
  assert.equal(a.page('/a/b/c/d/profond'), undefined);
  assert.equal(a.page('/produits?utm_source=x&id=3'), undefined);
  assert.ok(a.r.meta.skipped.folderDepth >= 1 && a.r.meta.skipped.queryParams >= 1);

  const full = await crawl({ useSitemaps: false });
  const b = await crawl({ limitPerDepth: 3, useSitemaps: false });
  // 1 URL au niveau 0 + 3 au niveau 1 + 3 au niveau 2… (la profondeur est mesurée à la découverte)
  assert.ok(b.r.pages.length < full.r.pages.length);
  assert.ok(b.r.pages.filter((p) => p.via === 'link').length <= 3 * 4);
  assert.ok(b.r.meta.skipped.perDepth > 0);

  const c = await crawl({ pathLimits: [{ pattern: '/blog/', max: 1 }] });
  assert.equal(c.r.pages.filter((p) => p.url.includes('/blog/')).length, 1);
});

test('robots.txt : ignorer mais signaler, ignorer, robots.txt personnalisé', async () => {
  const report = await crawl({ robotsMode: 'report' });
  assert.equal(report.page('/admin').status, 200);
  assert.equal(report.page('/admin').indexabilityReason, 'blocked');
  assert.ok(report.r.issues.find((i) => i.id === 'blocked-robots').items.some((i) => i.url.endsWith('/admin')));

  const ignore = await crawl({ robotsMode: 'ignore' });
  assert.equal(ignore.page('/admin').status, 200);
  assert.notEqual(ignore.page('/admin').indexabilityReason, 'blocked');

  const custom = await crawl({ customRobots: 'User-agent: *\nDisallow: /blog/' });
  assert.equal(custom.page('/blog/').blockedByRobots, true);
  assert.equal(custom.page('/admin').status, 200);
});

test('suppression de paramètres, extraction personnalisée, authentification', async () => {
  const { r, page } = await crawl({
    removeParams: 'utm_*',
    httpUser: 'demo',
    httpPass: 'pass',
    customHeaders: 'X-Test: 1',
    extractors: [
      { name: 'prix', type: 'css', selector: '.prix', target: 'text' },
      { name: 'nbPrix', type: 'css', selector: '.prix', target: 'count' },
      { name: 'ref', type: 'regex', selector: 'Réf\\. ([A-Z]+-\\d+)' },
    ],
  });
  assert.ok(page('/produits?id=3'), 'utm_source retiré');
  assert.equal(page('/produits?utm_source=x&id=3'), undefined);
  assert.deepEqual(page('/produits?id=3').extracted, { prix: ['19,90 €', '29,90 €'], nbPrix: [2], ref: ['ABC-123'] });
  assert.equal(page('/secret').status, 200);
  assert.equal(page('/secret').title, 'Zone protégée');
  assert.equal(r.meta.options.httpPass, '••••', 'le mot de passe n’est pas enregistré');
});

test('vitesse : plafond d’URL par seconde', async () => {
  const t0 = Date.now();
  const { r } = await crawl({ maxUrlPerSec: 20, maxPages: 10, useSitemaps: false });
  const secs = (Date.now() - t0) / 1000;
  assert.ok(r.pages.length >= 8);
  assert.ok(secs >= (r.pages.length + 1) / 20 - 0.1, `trop rapide : ${r.pages.length} URLs en ${secs}s`);
});
