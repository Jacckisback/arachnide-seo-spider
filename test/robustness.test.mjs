// Fiabilité : cas remontés par les utilisateurs (faux positifs) et protections anti-bot.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Crawler, USER_AGENTS, DEFAULT_UA } from '../src/crawler.mjs';
import { parseHtml } from '../src/parse.mjs';

test('titre et titres Hn : SVG inline, noscript et template ne comptent pas', () => {
  const r = parseHtml(`<html><head><title>Cours de français</title></head><body>
    <a href="/"><svg viewBox="0 0 10 10"><title>Logo</title><desc>d</desc></svg></a>
    <noscript><h1>Activez JavaScript</h1><img src="/lazy.jpg"></noscript>
    <template><title>Modèle</title><h2>Caché</h2><a href="/template-link">x</a></template>
    <h1>Un seul H1</h1><h2>Section</h2><h3>Sous-section</h3></body></html>`, 'https://x.fr/');
  assert.equal(r.title, 'Cours de français');
  assert.equal(r.titleCount, 1);
  assert.deepEqual(r.h1, ['Un seul H1']);
  assert.deepEqual(r.h2, ['Section']);
  assert.deepEqual(r.headingSkips, []);
  assert.ok(!r.links.some((l) => l.to.includes('template-link')));
});

test('site qui refuse le user-agent Arachnide (403) : bascule automatique sur Chrome, signalée', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers['user-agent']);
    if (/ArachnideSEO/.test(req.headers['user-agent'])) {
      res.writeHead(403, { 'content-type': 'text/html' });
      return res.end('<title>403 Forbidden</title>');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/' ? '<title>Accueil</title><h1>Bienvenue</h1><a href="/page">p</a>' : '<title>Page</title><h1>Page</h1>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const R = await new Crawler(base + '/', { useSitemaps: false }).start();
    assert.equal(R.meta.uaFallback, true);
    assert.ok(R.meta.warnings.some((w) => w.key === 'warn.uaBlocked' && w.params.status === 403));
    assert.equal(R.meta.options.userAgent, USER_AGENTS.chrome);
    assert.deepEqual(R.pages.map((p) => p.status), [200, 200]);
    assert.equal(seen[0], DEFAULT_UA);
    // Un site réellement en erreur ne doit pas être masqué : 403 pour tout le monde reste un 403.
    const R2 = await new Crawler(base + '/', { useSitemaps: false, userAgent: 'Autre ArachnideSEO bot' }).start();
    assert.equal(R2.meta.uaFallback, false);
    assert.equal(R2.pages[0].status, 403);
  } finally {
    server.close();
  }
});
