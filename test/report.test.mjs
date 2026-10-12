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
