// Fiabilité : cas remontés par les utilisateurs (faux positifs) et protections anti-bot.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Crawler, USER_AGENTS, DEFAULT_UA } from '../src/crawler.mjs';
import { parseHtml } from '../src/parse.mjs';
import { findChrome } from '../src/renderer.mjs';

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

test('429 avec Retry-After : nouvelle tentative, pas d’erreur 4xx ni de lien cassé', async () => {
  const hits = new Map();
  const server = http.createServer((req, res) => {
    const n = (hits.get(req.url) || 0) + 1;
    hits.set(req.url, n);
    if (req.url === '/lent' && n === 1) {
      res.writeHead(429, { 'retry-after': '0' });
      return res.end();
    }
    if (req.url === '/bloque') {
      res.writeHead(429, { 'retry-after': '0' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/' ? '<title>Accueil</title><h1>A</h1><a href="/lent">l</a><a href="/bloque">b</a>' : '<title>Lent</title><h1>L</h1>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const R = await new Crawler(base + '/', { useSitemaps: false }).start();
    const lent = R.pages.find((p) => p.url === base + '/lent');
    assert.equal(lent.status, 200);
    assert.equal(lent.retries, 1);
    assert.equal(hits.get('/bloque'), 3);
    const ids = new Set(R.issues.map((i) => i.id));
    assert.ok(ids.has('rate-limited'));
    assert.ok(!ids.has('4xx') && !ids.has('broken-internal'));
    assert.ok(R.meta.warnings.some((w) => w.key === 'warn.rateLimited'));
  } finally {
    server.close();
  }
});

test('sitemap .gz servi avec Content-Encoding, URL du sitemap en http, robots.txt en erreur 500', async () => {
  const zlib = await import('node:zlib');
  let base;
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(500);
      return res.end('oops');
    }
    if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(`<sitemapindex><sitemap><loc>${base}/pages.xml.gz</loc></sitemap><sitemap><loc>${base}/image-sitemap-1.xml</loc></sitemap></sitemapindex>`);
    }
    if (req.url === '/pages.xml.gz') {
      // Comme MDN : fichier .gz, mais servi compressé en transfert → fetch le décompresse déjà.
      res.writeHead(200, { 'content-type': 'application/xml', 'content-encoding': 'gzip' });
      return res.end(zlib.gzipSync(`<urlset><url><loc>${base.replace('127.0.0.1', 'localhost')}/a?x=1&#38;y=2</loc></url><url><loc>${base}/</loc></url></urlset>`));
    }
    if (req.url === '/image-sitemap-1.xml') throw new Error('ne doit pas être lu');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>T</title><h1>H</h1>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = new Crawler(base + '/', { maxPages: 5 });
    const R = await c.start();
    assert.ok(c.sitemapUrls.has(base + '/'));
    assert.ok(R.meta.warnings.some((w) => w.key === 'warn.robotsUnavailable' && w.params.status === 500));
    assert.ok(R.meta.botAccess.every((b) => b.allowed === null));
    assert.ok(!R.issues.some((i) => i.id === 'no-sitemap' || i.id === 'search-bots-blocked'));
    assert.deepEqual(R.meta.sitemapFiles.map((f) => f.type), ['index', 'urlset']);
  } finally {
    server.close();
  }
});

test('score de santé : un défaut de gabarit ne met pas le site à 0, Googlebot bloqué le fait chuter', async () => {
  const mk = (mode) => http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end(mode === 'gbot' ? 'User-agent: Googlebot\nDisallow: /\n' : '');
    const m = /^\/p(\d+)$/.exec(req.url);
    if (req.url !== '/' && !m) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<title>404</title>');
    }
    const menu = Array.from({ length: 10 }, (_, k) => `<a href="/p${k + 1}">Page ${k + 1}</a>`).join('') + (mode === 'one404' ? '<a href="/manquante">Contact</a>' : '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<title>Page ${req.url} du site de démonstration</title><nav>${menu}</nav><h1>T ${req.url}</h1>`);
  });
  const scoreOf = async (mode) => {
    const server = mk(mode);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      return (await new Crawler(`http://127.0.0.1:${server.address().port}/`, { useSitemaps: false }).start()).summary.score;
    } finally {
      server.close();
    }
  };
  const [clean, one404, gbot] = [await scoreOf('clean'), await scoreOf('one404'), await scoreOf('gbot')];
  assert.ok(one404 < clean && one404 >= clean - 35, `${clean} → ${one404}`);
  assert.ok(gbot <= 15);
});

test('redirection JavaScript (si Chrome est installé) : traitée comme une redirection, cible explorée', { skip: !findChrome() && 'Chrome introuvable' }, async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/') return res.end('<title>Accueil</title><h1>A</h1><a href="/ancienne">ancienne</a>');
    if (req.url === '/ancienne') return res.end('<title>Ancienne</title><script>location.href="/nouvelle"</script>');
    res.end('<title>Nouvelle page</title><h1>Nouvelle</h1>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const R = await new Crawler(base + '/', { useSitemaps: false, render: true }).start();
    const old = R.pages.find((p) => p.url === base + '/ancienne');
    assert.equal(old.jsRedirectUrl, base + '/nouvelle');
    assert.equal(old.indexabilityReason, 'jsRedirect');
    assert.ok(R.pages.some((p) => p.url === base + '/nouvelle' && p.status === 200));
    assert.ok(R.issues.some((i) => i.id === 'js-redirect'));
  } finally {
    server.close();
  }
});

test('liens cassés : une ligne par paire page → cible, avec toutes les ancres', async () => {
  const server = http.createServer((req, res) => {
    if (req.url !== '/') {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<title>404</title>');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Accueil</title><h1>A</h1><a href="/support">Support</a> <a href="/support">Obtenir du support</a>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const R = await new Crawler(base + '/', { useSitemaps: false }).start();
    const broken = R.issues.find((i) => i.id === 'broken-internal');
    assert.equal(broken.count, 1);
    assert.match(broken.items[0].detail, /« Support », « Obtenir du support »/);
  } finally {
    server.close();
  }
});
