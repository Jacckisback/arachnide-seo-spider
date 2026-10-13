import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixture-site.mjs';
import { Crawler } from '../src/crawler.mjs';
import { LANGS, getT } from '../public/shared/i18n.js';
import { buildReport } from '../public/shared/report.js';
import { compareResults } from '../public/shared/compare.js';

test('rapport HTML dans les 6 langues, avec comparaison', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  let cur, prev;
  try {
    prev = await new Crawler(base + '/', { maxPages: 5 }).start();
    cur = await new Crawler(base + '/', {}).start();
  } finally {
    server.close();
  }
  const cmp = compareResults(cur, prev);
  assert.equal(cmp.prevScore, prev.summary.score);
  assert.ok(cmp.issues.length > 0);
  for (const { code } of LANGS) {
    const t = await getT(code);
    const html = buildReport(cur, { client: 'Client <test>', author: 'Thierry Gustin', color: '#123456', compare: cmp, maxUrls: 3 }, t);
    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes(`lang="${code}"`));
    assert.ok(html.includes('Client &lt;test&gt;'), 'les champs sont échappés');
    assert.ok(html.includes('#123456'));
    const leak = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').match(/.{0,40}\b(issue|report|cat|sev|lvl)\.[a-z0-9-]+\b.{10}/);
    assert.ok(!leak, code + ': ' + leak?.[0]);
  }
});

test('comparaison URL par URL : corrigé, non revérifié, déplacé, fiabilité', async () => {
  const { compareResults } = await import('../public/shared/compare.js');
  const R = (urls, issues, extra = {}) => ({ meta: { finishedAt: '2026-10-01', ...extra }, summary: { score: 70 }, pages: urls.map((url) => ({ url })), issues: issues.map(([id, severity, items]) => ({ id, severity, count: items.length, items: items.map((url) => ({ url })) })) });
  const prev = R(['/a', '/b', '/c', '/d', '/e'], [['title-missing', 'error', ['/a', '/b']], ['h1-missing', 'warning', ['/c']], ['desc-missing', 'warning', ['/d']]]);
  // /d n'a pas été recrawlée ; h1-missing passe de /c à /e (même nombre, autre URL).
  const cur = R(['/a', '/b', '/c', '/e'], [['h1-missing', 'warning', ['/e']]]);
  const c = compareResults(cur, prev);
  assert.deepEqual(c.fixed.map((i) => i.id), ['title-missing']);
  assert.deepEqual(c.unverified.map((i) => i.id), ['desc-missing']);
  assert.deepEqual(c.changed.map((i) => [i.id, i.fixedCount, i.newCount]), [['h1-missing', 1, 1]]);
  assert.equal(c.reliable, true); // 5 → 4 URL : écart de 20 %, limite incluse
  assert.equal(compareResults(R(['/a'], [], { stopped: true }), prev).reliable, false);
});
