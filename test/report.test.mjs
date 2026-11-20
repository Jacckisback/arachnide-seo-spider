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

test('présentation du rapport : polices embarquées, verdict, URL relatives au site, couleurs d’état cohérentes', async () => {
  const { reportFonts } = await import('../src/report-fonts.mjs');
  const fonts = await reportFonts();
  assert.match(fonts.serif, /^data:font\/woff2;base64,d09GMg/, 'Newsreader en WOFF2');
  assert.match(fonts.sans, /^data:font\/woff2;base64,d09GMg/, 'Inter en WOFF2');
  const t = await getT('fr');
  const R = {
    meta: { startUrl: 'https://www.exemple.fr/', finalStart: 'https://www.exemple.fr/', finishedAt: '2026-11-20T10:00:00Z', options: {}, botAccess: [] },
    summary: { score: 61, grade: 'C', totalUrls: 40, htmlPages: 38, indexable: 36, avgResponseTime: 210, errors: 3, warnings: 12, avgWords: 500, categoryScores: { titles: 60 }, statusBuckets: { '2xx': 38, '4xx': 2 }, depthBuckets: { 0: 1, 1: 39 } },
    issues: [
      { id: '4xx', severity: 'error', category: 'codes', priority: 90, count: 2, impact: 'high', effort: 'low', items: [{ url: 'https://www.exemple.fr/produits/bague-or-18-carats/', detail: '404' }, { url: 'https://autre-site.com/page', detail: '' }] },
      { id: 'title-long', severity: 'warning', category: 'titles', priority: 40, count: 1, impact: 'medium', effort: 'low', items: [{ url: 'https://exemple.fr/a', detail: '' }] },
    ],
    pages: [],
  };
  const html = buildReport(R, { fonts, maxUrls: 5 }, t);
  assert.ok(html.includes('font-family: "Newsreader Report"') && html.includes(fonts.serif), 'police de titre embarquée');
  assert.ok(html.includes('Un type d’erreur bloquante à corriger en premier.'), 'verdict au singulier');
  assert.match(html, /Priorité n° 1 : [^<]+\(2 URL\)/);
  // URL du site : chemin seul, coupable, lien complet ; autre site : adresse complète.
  assert.ok(html.includes('<a href="https://www.exemple.fr/produits/bague-or-18-carats/">/<wbr>produits/<wbr>bague-<wbr>or-<wbr>18-<wbr>carats/<wbr></a>'));
  assert.ok(html.includes('href="https://exemple.fr/a">/<wbr>a</a>'), 'avec ou sans www');
  assert.ok(html.includes('href="https://autre-site.com/page">https:/<wbr>/<wbr>autre-<wbr>site.com/<wbr>page</a>'));
  assert.ok(html.includes('Les adresses sont indiquées par rapport à https://www.exemple.fr.'));
  // Sans polices (rapport généré ailleurs) : repli sur les polices du système, pas de @font-face vide.
  assert.ok(!buildReport(R, {}, t).includes('@font-face'));
});
