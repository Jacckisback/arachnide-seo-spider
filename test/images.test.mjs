import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Crawler } from '../src/crawler.mjs';
import { parseSrcset, imageFormat } from '../src/parse.mjs';

test('srcset : candidats, descripteurs et virgules dans les URL', () => {
  assert.deepEqual(parseSrcset('a.jpg 480w, b.jpg 960w,c.jpg 2x', 'https://x.fr/p/'), [
    { url: 'https://x.fr/p/a.jpg', descriptor: '480w' },
    { url: 'https://x.fr/p/b.jpg', descriptor: '960w' },
    { url: 'https://x.fr/p/c.jpg', descriptor: '2x' },
  ]);
  const cdn = parseSrcset('/up/w_400,h_300/a.jpg 400w, /up/w_800,h_600/a.jpg 800w', 'https://x.fr/');
  assert.deepEqual(cdn.map((c) => c.url), ['https://x.fr/up/w_400,h_300/a.jpg', 'https://x.fr/up/w_800,h_600/a.jpg']);
  assert.deepEqual(parseSrcset('seule.webp', 'https://x.fr/'), [{ url: 'https://x.fr/seule.webp', descriptor: '' }]);
  assert.equal(imageFormat('https://x.fr/a.JPEG'), 'jpg');
  assert.equal(imageFormat('https://cdn.x.fr/i?w=300&fm=avif'), 'avif');
});

const jpg = (kb) => [200, 'image/jpeg', 'x'.repeat(kb * 1024)];
const routes = {
  '/': [200, 'text/html', `<html><head><title>Galerie</title></head><body><h1>Galerie</h1>
    <picture>
      <source type="image/avif" srcset="/img/hero-800.avif 800w, /img/hero-1600.avif 1600w" sizes="100vw">
      <source type="image/webp" srcset="/img/hero-800.webp 800w, /img/hero-1600.webp 1600w" sizes="100vw">
      <img src="/img/hero-800.jpg" srcset="/img/hero-800.jpg 800w, /img/hero-1600.jpg 1600w" sizes="100vw" alt="Salle de classe" width="800" height="400">
    </picture>
    <img src="/img/carte.jpg" srcset="/img/carte-480.jpg 480w, /img/carte-960.jpg 960w" alt="Carte">
    <img src="/img/lourde.png" alt="Lourde">
    <img data-src="/img/lazy.jpg" data-srcset="/img/lazy.jpg 1x, /img/lazy@2x.jpg 2x" alt="Lazy">
  </body></html>`],
  '/img/hero-800.avif': [200, 'image/avif', 'x'.repeat(20 * 1024)],
  '/img/hero-1600.avif': [200, 'image/avif', 'x'.repeat(60 * 1024)],
  '/img/hero-800.webp': [200, 'image/webp', 'x'.repeat(30 * 1024)],
  '/img/hero-1600.webp': [200, 'image/webp', 'x'.repeat(90 * 1024)],
  '/img/hero-800.jpg': jpg(80),
  '/img/hero-1600.jpg': jpg(320),
  '/img/carte.jpg': jpg(40),
  '/img/carte-480.jpg': jpg(30),
  '/img/lourde.png': [200, 'image/png', 'x'.repeat(400 * 1024)],
  '/img/lazy.jpg': jpg(10),
  '/img/lazy@2x.jpg': jpg(20),
};

test('images : srcset et <picture> analysés fichier par fichier', async () => {
  const server = http.createServer((req, res) => {
    const r = routes[req.url];
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('404'); }
    res.writeHead(r[0], { 'content-type': r[1], 'content-length': Buffer.byteLength(r[2]) });
    res.end(req.method === 'HEAD' ? undefined : r[2]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let r;
  try {
    r = await new Crawler(base + '/', { checkImages: true, useSitemaps: false }).start();
  } finally {
    server.close();
  }
  const img = (p) => r.images.find((i) => i.src === base + p);
  // 4 images principales + 8 variantes srcset / <picture>, la variante 404 comprise.
  assert.equal(r.images.length, 12);
  assert.equal(img('/img/hero-800.jpg').role, 'src');
  assert.equal(img('/img/hero-800.jpg').picture, true);
  assert.equal(img('/img/hero-800.jpg').variants, 5);
  assert.equal(img('/img/hero-1600.jpg').role, 'srcset');
  assert.equal(img('/img/hero-1600.jpg').descriptor, '1600w');
  assert.equal(img('/img/hero-1600.jpg').of, base + '/img/hero-800.jpg');
  assert.equal(img('/img/hero-1600.avif').role, 'source');
  assert.equal(img('/img/hero-1600.avif').format, 'avif');
  assert.equal(img('/img/hero-1600.jpg').size, 320 * 1024);
  assert.equal(img('/img/carte-960.jpg').status, 404);
  assert.equal(img('/img/lazy.jpg').role, 'src');
  assert.equal(img('/img/lazy@2x.jpg').descriptor, '2x');

  const issue = (id) => r.issues.find((i) => i.id === id);
  // La variante 1600w de 320 Ko est lourde, même si l'image src ne l'est pas.
  assert.ok(issue('img-large').items.some((it) => it.url === base + '/img/hero-1600.jpg' && /srcset 1600w/.test(it.detail)));
  assert.ok(issue('img-broken').items.some((it) => /carte-960\.jpg \[srcset 960w\] \(404\)/.test(it.detail)));
  assert.deepEqual(issue('img-not-responsive').items.map((i) => i.url), [base + '/img/lourde.png']);
  assert.equal(issue('img-legacy-format').items[0].detail, '3/4');
  assert.equal(issue('img-srcset-no-sizes').items[0].detail, '1/4');
  const home = r.pages.find((p) => p.url === base + '/');
  assert.equal(home.imagesResponsive, 3);
});
