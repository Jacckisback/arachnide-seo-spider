// Google Analytics 4 (3.15) : import CSV, API Data + Admin, rapprochement avec le crawl, pages orphelines avec trafic.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { parseGa4Csv, fetchGa4Pages, normalizeGa4Property } from '../src/google.mjs';
import { Crawler } from '../src/crawler.mjs';
import { toCrawlerOptions } from '../src/options.mjs';
import { startFixture } from './fixture-site.mjs';
import { applySegments, sliceResult, segmentStats } from '../public/shared/segments.js';

test('ID de propriété GA4 : nombre, « properties/… », URL de l’interface', () => {
  assert.equal(normalizeGa4Property('123456789'), 'properties/123456789');
  assert.equal(normalizeGa4Property(' properties/987654 '), 'properties/987654');
  assert.equal(normalizeGa4Property('https://analytics.google.com/analytics/web/#/p345678901/reports/intelligenthome'), 'properties/345678901');
  assert.equal(normalizeGa4Property('G-ABC123'), null);
  assert.equal(normalizeGa4Property(''), null);
});

test('import CSV GA4 : commentaires « # », langues, séparateurs, URL complètes, lignes parasites', () => {
  const fr = parseGa4Csv('# ----------------------------------------\n# Pages et écrans : chemin de la page et classe de l\'écran\n# Toutes les données\n# 20260701-20260930\n# ----------------------------------------\n\nChemin de la page et classe de l\'écran,Vues,Utilisateurs actifs,Sessions,Sessions avec engagement\n/,"1 234",500,700,450\n/blog/a,10,5,6,2\n(not set),3,3,3,0\n,1247,508,709,452\n');
  assert.deepEqual(fr, [
    { host: '', path: '/', sessions: 700, views: 1234, users: 500, engaged: 450 },
    { host: '', path: '/blog/a', sessions: 6, views: 10, users: 5, engaged: 2 },
  ]);
  const en = parseGa4Csv('Landing page;Sessions;Active users\nhttps://www.x.fr/promo?utm_source=mail;1,234;900\n/contact;12;10\n');
  assert.deepEqual(en[0], { host: 'www.x.fr', path: '/promo?utm_source=mail', sessions: 1234, views: null, users: 900, engaged: null });
  assert.equal(en[1].path, '/contact');
  const de = parseGa4Csv('Seitenpfad und Bildschirmklasse\tAufrufe\tSitzungen\n/a\t5\t4\n');
  assert.equal(de[0].sessions, 4);
  assert.throws(() => parseGa4Csv('Country,Sessions\nFrance,3\n'), /No page path column/);
  assert.throws(() => parseGa4Csv('Page path,Country\n/a,France\n'), /No sessions/);
});

test('API GA4 : jeton (portée analytics.readonly), propriété trouvée par le domaine, pagination, erreurs', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    calls.push(req.url);
    if (req.url === '/token') {
      const jwt = new URLSearchParams(body).get('assertion');
      const [h, c, s] = jwt.split('.');
      const claims = JSON.parse(Buffer.from(c, 'base64url'));
      const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'));
      if (!ok || claims.scope !== 'https://www.googleapis.com/auth/analytics.readonly') {
        res.writeHead(400);
        return res.end('{"error":"invalid_scope"}');
      }
      return res.end(JSON.stringify({ access_token: 'tok' }));
    }
    if (req.headers.authorization !== 'Bearer tok') {
      res.writeHead(401);
      return res.end('{}');
    }
    if (req.url.startsWith('/admin/accountSummaries')) {
      if (!req.url.includes('pageToken')) return res.end(JSON.stringify({ accountSummaries: [{ propertySummaries: [{ property: 'properties/111' }] }], nextPageToken: 'p2' }));
      return res.end(JSON.stringify({ accountSummaries: [{ propertySummaries: [{ property: 'properties/222' }, { property: 'properties/333' }] }] }));
    }
    if (req.url === '/admin/properties/111/dataStreams?pageSize=200') return res.end(JSON.stringify({ dataStreams: [{ webStreamData: { defaultUri: 'https://autre.fr' } }] }));
    if (req.url === '/admin/properties/222/dataStreams?pageSize=200') return res.end(JSON.stringify({ dataStreams: [{ type: 'ANDROID_APP_DATA_STREAM' }, { webStreamData: { defaultUri: 'https://exemple.fr/' } }] }));
    if (req.url === '/data/properties/222:runReport') {
      const q = JSON.parse(body);
      assert.deepEqual(q.dimensions.map((d) => d.name), ['hostName', 'pagePath']);
      assert.deepEqual(q.metrics.map((m) => m.name), ['sessions', 'screenPageViews', 'activeUsers', 'engagedSessions']);
      const mk = (p, n) => ({ dimensionValues: [{ value: 'www.exemple.fr' }, { value: p }], metricValues: [{ value: String(n) }, { value: String(n * 2) }, { value: String(n) }, { value: '1' }] });
      if (q.offset === 0) return res.end(JSON.stringify({ rowCount: 100001, rows: Array.from({ length: 100000 }, (_, i) => mk(`/p${i}`, 1)) }));
      return res.end(JSON.stringify({ rowCount: 100001, rows: [mk('/fin', 9)] }));
    }
    if (req.url === '/data/properties/999999999:runReport') {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: { message: 'User does not have sufficient permissions for this property.' } }));
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const keyJson = JSON.stringify({ client_email: 'arachnide@projet.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: base + '/token' });
  try {
    const r = await fetchGa4Pages({ keyJson, siteUrl: 'https://www.exemple.fr/', days: 30, api: base + '/data', admin: base + '/admin' });
    assert.equal(r.property, 'properties/222');
    assert.equal(r.rows.length, 100001);
    assert.deepEqual(r.rows.at(-1), { host: 'www.exemple.fr', path: '/fin', sessions: 9, views: 18, users: 9, engaged: 1 });
    assert.equal((new Date(r.end) - new Date(r.start)) / 864e5, 29);
    await assert.rejects(fetchGa4Pages({ keyJson, property: '999999999', siteUrl: 'https://www.exemple.fr/', api: base + '/data', admin: base + '/admin' }), /sufficient permissions.*arachnide@projet/);
    await assert.rejects(fetchGa4Pages({ keyJson, property: 'G-XYZ', siteUrl: 'https://www.exemple.fr/', api: base + '/data', admin: base + '/admin' }), /not a GA4 property ID/);
    await assert.rejects(fetchGa4Pages({ keyJson, siteUrl: 'https://inconnu.fr/', api: base + '/data', admin: base + '/admin' }), /No Google Analytics 4 property for inconnu\.fr is shared with arachnide@projet/);
  } finally {
    server.close();
  }
});

test('crawl + GA4 : sessions par page, orphelines avec trafic, erreurs et noindex visités, pages sans session', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  const csv = [
    '# Pages et écrans',
    'Chemin de la page et classe de l\'écran,Vues,Utilisateurs actifs,Sessions,Sessions avec engagement',
    '/,900,400,500,300',
    '/cours/,40,30,35,20', // slash final : rattaché à /cours
    '/cours?utm_source=mail,10,8,8,4', // paramètres : additionnés à /cours
    '/landing-campagne,120,90,95,60', // jamais liée : orpheline absente du crawl
    '/orpheline,30,20,25,10', // dans le sitemap seulement : crawlée sans aucun lien interne
    '/cassee,15,12,12,0', // 404 encore visitée
    '/blog/Article_Un,8,6,7,3', // noindex visitée
    '/zero,0,0,0,0',
  ].join('\n');
  try {
    const opts = toCrawlerOptions({ ga4Csv: csv, concurrency: 3 });
    const R = await new Crawler(base + '/', opts).start();
    const page = (p) => R.pages.find((x) => x.url === base + p);
    const issue = (id) => R.issues.find((i) => i.id === id);
    const urls = (id) => (issue(id)?.items || []).map((i) => i.url.replace(base, ''));
    assert.equal(R.meta.ga4.source, 'csv');
    assert.equal(R.meta.options.ga4Csv, true); // le contenu du CSV n'est pas recopié dans le crawl
    assert.equal(R.meta.ga4.sessions, 682);
    assert.deepEqual(page('/').ga4, { sessions: 500, views: 900, users: 400, engaged: 300 });
    assert.equal(page('/cours').ga4.sessions, 43);
    assert.deepEqual(R.ga4Only.map((r) => r.url.replace(base, '')), ['/landing-campagne', '/zero']);
    assert.deepEqual(urls('ga4-orphan'), ['/landing-campagne', '/orpheline']);
    assert.equal(issue('ga4-orphan').scope, 'page'); // des URL, pas un problème « tout le site »
    assert.deepEqual(urls('ga4-error-traffic'), ['/cassee']);
    assert.deepEqual(urls('ga4-non-indexable-traffic'), ['/blog/Article_Un']);
    assert.ok(urls('ga4-no-sessions').includes('/contact'));
    assert.ok(!urls('ga4-no-sessions').includes('/'));
    // Segments : champ « Sessions GA4 » et orphelines GA4 rattachées à leur segment.
    applySegments(R, [{ name: 'Landing', rules: [{ field: 'path', op: 'startsWith', value: '/landing' }] }, { name: 'Trafic', rules: [{ field: 'ga4Sessions', op: 'gte', value: 20 }] }]);
    assert.deepEqual(sliceResult(R, 'trafic').pages.map((p) => p.url.replace(base, '')).sort(), ['/', '/cours', '/orpheline']);
    assert.deepEqual(sliceResult(R, 'landing').ga4Only.map((r) => r.url.replace(base, '')), ['/landing-campagne']);
    assert.deepEqual(sliceResult(R, 'landing').issues.find((i) => i.id === 'ga4-orphan').items.map((i) => i.url.replace(base, '')), ['/landing-campagne']);
    assert.equal(segmentStats(R).find((g) => g.id === 'trafic').sessions, 568);
    assert.equal(segmentStats(R).find((g) => g.id === 'landing').sessions, 95); // orpheline absente du crawl, comptée dans son segment
  } finally {
    server.close();
  }
});

test('GA4 en erreur : avertissement, le crawl continue', async () => {
  const server = await startFixture();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const R = await new Crawler(base + '/', { concurrency: 3, ga4Csv: 'Country,Sessions\nFrance,3\n' }).start();
    assert.ok(R.meta.warnings.some((w) => w.key === 'warn.ga4Failed'));
    assert.equal(R.meta.ga4, null);
    assert.ok(R.pages.length > 5);
  } finally {
    server.close();
  }
});
