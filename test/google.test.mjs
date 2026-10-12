import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { parseGscCsv, parsePsi, fetchGscPages, pickProperty } from '../src/google.mjs';
import { Crawler } from '../src/crawler.mjs';
import { startFixture } from './fixture-site.mjs';

test('import CSV Search Console : anglais, français, séparateurs et pourcentages', () => {
  const en = parseGscCsv('﻿Top pages,Clicks,Impressions,CTR,Position\nhttps://x.fr/a,"1,234",56789,2.17%,3.4\nhttps://x.fr/b,0,12,0%,48\n');
  assert.deepEqual(en[0], { url: 'https://x.fr/a', clicks: 1234, impressions: 56789, ctr: 0.0217, position: 3.4 });
  assert.equal(en[1].position, 48);
  const fr = parseGscCsv('Pages les plus populaires;Clics;Impressions;CTR;Position\nhttps://x.fr/a;12;1 500;0,8 %;7,2\n');
  assert.deepEqual(fr[0], { url: 'https://x.fr/a', clicks: 12, impressions: 1500, ctr: 0.008, position: 7.2 });
  assert.throws(() => parseGscCsv('Query,Clicks\nfoo,3\n'), /No URL column/);
});

test('PageSpeed Insights : données terrain CrUX et score Lighthouse', () => {
  const r = parsePsi({
    loadingExperience: { overall_category: 'SLOW', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4800, category: 'SLOW' }, INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: 'FAST' }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: 'AVERAGE' } } },
    originLoadingExperience: { overall_category: 'AVERAGE', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2900, category: 'AVERAGE' } } },
    lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { 'largest-contentful-paint': { numericValue: 5100 }, 'total-blocking-time': { numericValue: 640 } } },
  });
  assert.equal(r.score, 42);
  assert.deepEqual(r.field.lcp, { p75: 4800, cat: 'poor' });
  assert.deepEqual(r.field.cls, { p75: 0.12, cat: 'ni' });
  assert.equal(r.field.overall, 'poor');
  assert.equal(r.origin.lcp.cat, 'ni');
  assert.equal(r.lab.tbt, 640);
  // Pas de données propres à la page : PSI renvoie celles de l'origine (origin_fallback) → pas de données de page.
  assert.equal(parsePsi({ loadingExperience: { origin_fallback: true, metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1, category: 'FAST' } } } }).field, null);
});

test('Search Console API : jeton de compte de service (JWT RS256), choix de la propriété, pagination', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  let base;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/token') {
      const jwt = new URLSearchParams(body).get('assertion');
      const [h, c, s] = jwt.split('.');
      const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'));
      const claims = JSON.parse(Buffer.from(c, 'base64url'));
      if (!ok || claims.iss !== 'arachnide@projet.iam.gserviceaccount.com' || !claims.scope.includes('webmasters.readonly')) {
        res.writeHead(400);
        return res.end('{"error":"invalid_grant"}');
      }
      return res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    }
    if (req.headers.authorization !== 'Bearer tok') {
      res.writeHead(401);
      return res.end('{}');
    }
    if (req.url === '/wm/sites') return res.end(JSON.stringify({ siteEntry: [{ siteUrl: 'https://autre.fr/', permissionLevel: 'siteOwner' }, { siteUrl: 'sc-domain:exemple.fr', permissionLevel: 'siteFullUser' }] }));
    if (req.url === '/wm/sites/sc-domain%3Aexemple.fr/searchAnalytics/query') {
      const q = JSON.parse(body);
      assert.deepEqual(q.dimensions, ['page']);
      const rows = q.startRow === 0 ? Array.from({ length: 25000 }, (_, i) => ({ keys: [`https://www.exemple.fr/p${i}`], clicks: 1, impressions: 10, ctr: 0.1, position: 5 })) : [{ keys: ['https://www.exemple.fr/fin'], clicks: 2, impressions: 3, ctr: 0.66, position: 1.5 }];
      return res.end(JSON.stringify({ rows }));
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const keyJson = JSON.stringify({ type: 'service_account', client_email: 'arachnide@projet.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: base + '/token' });
    const r = await fetchGscPages({ keyJson, siteUrl: 'https://www.exemple.fr/', api: base + '/wm', days: 28 });
    assert.equal(r.property, 'sc-domain:exemple.fr');
    assert.equal(r.rows.length, 25001);
    assert.deepEqual(r.rows.at(-1), { url: 'https://www.exemple.fr/fin', clicks: 2, impressions: 3, ctr: 0.66, position: 1.5 });
    await assert.rejects(fetchGscPages({ keyJson: '{"client_email":"x"}', siteUrl: 'https://www.exemple.fr/', api: base + '/wm' }), /service account/);
  } finally {
    server.close();
  }
  assert.equal(pickProperty([{ siteUrl: 'https://www.exemple.fr/', permissionLevel: 'siteOwner' }, { siteUrl: 'https://www.exemple.fr/blog/', permissionLevel: 'siteOwner' }], 'https://www.exemple.fr/blog/x'), 'https://www.exemple.fr/blog/');
});

test('crawl avec Search Console (CSV) et PageSpeed Insights : données par page et nouveaux contrôles', async () => {
  const site = await startFixture();
  const base = `http://127.0.0.1:${site.address().port}`;
  const psi = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x').searchParams.get('url');
    const slow = u === base + '/';
    res.end(JSON.stringify({
      loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: slow ? 5200 : 2000, category: slow ? 'SLOW' : 'FAST' }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: slow ? 3 : 15, category: slow ? 'FAST' : 'AVERAGE' } } },
      lighthouseResult: { categories: { performance: { score: slow ? 0.35 : 0.8 } }, audits: {} },
    }));
  });
  await new Promise((r) => psi.listen(0, '127.0.0.1', r));
  const csv = `Top pages,Clicks,Impressions,CTR,Position\n${base}/,40,5000,0.8%,3.1\n${base}/guide-delf,25,300,8.33%,6\n${base}/page-introuvable-dans-le-crawl,3,450,0.67%,12\n${base}/robots-only,0,0,0%,0\nhttps://autre-site.fr/x,5,9,1%,2\n`;
  try {
    const c = new Crawler(base + '/', { concurrency: 3, gscCsv: csv, psiMax: 3, psiApi: `http://127.0.0.1:${psi.address().port}/psi` });
    const R = await c.start();
    const home = R.pages.find((p) => p.url === base + '/');
    assert.deepEqual(home.gsc, { clicks: 40, impressions: 5000, ctr: 0.008, position: 3.1 });
    assert.equal(home.psi.score, 35);
    assert.equal(R.meta.psi.tested, 3);
    assert.equal(R.meta.gsc.source, 'csv');
    assert.equal(R.meta.options.gscCsv, true);
    assert.deepEqual(R.gscOnly.map((r) => r.url), [base + '/page-introuvable-dans-le-crawl', base + '/robots-only']);
    const ids = new Set(R.issues.map((i) => i.id));
    for (const id of ['gsc-orphan', 'gsc-low-ctr', 'gsc-no-impressions', 'cwv-poor', 'cwv-needs-improvement', 'psi-low-score']) assert.ok(ids.has(id), id);
    assert.deepEqual(R.issues.find((i) => i.id === 'gsc-orphan').items.map((i) => i.url), [base + '/page-introuvable-dans-le-crawl']);
    assert.deepEqual(R.issues.find((i) => i.id === 'gsc-low-ctr').items.map((i) => i.url), [base + '/']);
    assert.ok(R.issues.find((i) => i.id === 'cwv-poor').items.some((i) => i.url === base + '/'));
  } finally {
    site.close();
    psi.close();
  }
});
