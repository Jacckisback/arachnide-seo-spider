// Test du Cloudflare Worker dans le vrai moteur Workers (workerd) via Miniflare, s'il est installé :
//   npm i --no-save miniflare@4 && node --test test/worker.test.mjs
// (ignoré sinon, pour garder l'installation du projet légère)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let Miniflare;
try {
  ({ Miniflare } = await import(process.env.MINIFLARE_PATH || 'miniflare'));
} catch {
  Miniflare = null;
}

const ORIGIN = `<!doctype html><html><head><title>Ancien titre</title><meta name="robots" content="noindex, follow"></head>
<body><h1>Ancien H1</h1><h1>Second</h1><img src="/img/a.jpg"><img src="https://cdn.ex.com/b.png" alt="b"></body></html>`;

test('Worker Cloudflare : réécriture HTML et redirections depuis le KV', { skip: !Miniflare && 'miniflare non installé' }, async () => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: path.join(ROOT, 'integrations/cloudflare-worker/src/worker.js'),
    compatibilityDate: '2026-08-01',
    kvNamespaces: ['ARACHNIDE'],
    outboundService: (req) => {
      const u = new URL(req.url);
      if (u.pathname.endsWith('.css')) return new Response('body{}', { headers: { 'content-type': 'text/css' } });
      return new Response(ORIGIN, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
    },
  });
  try {
    const kv = await mf.getKVNamespace('ARACHNIDE');
    await kv.put('p:/cours', JSON.stringify({ seo_title: 'Cours de français & DELF', meta_description: 'Nouvelle "description"', canonical: 'https://ex.com/cours/', noindex: false, h1: 'Nos cours', image_alt: { 'https://ex.com/img/a.jpg': 'Élèves en classe' } }));
    await kv.put('r:/ancien', JSON.stringify({ to: 'https://ex.com/cours/', status: 301 }));

    const r = await mf.dispatchFetch('https://ex.com/cours/');
    const html = await r.text();
    assert.match(html, /<title>Cours de français &amp; DELF<\/title>/);
    assert.match(html, /<h1>Nos cours<\/h1><h1>Second<\/h1>/);
    assert.match(html, /<img src="\/img\/a.jpg" alt="Élèves en classe">/);
    assert.match(html, /alt="b"/);
    assert.match(html, /<meta name="description" content="Nouvelle &quot;description&quot;"><link rel="canonical" href="https:\/\/ex.com\/cours\/"><\/head>/);
    assert.match(html, /<meta name="robots" content="follow">/);
    assert.equal(r.headers.get('x-robots-tag'), null);

    const red = await mf.dispatchFetch('https://ex.com/ancien/', { redirect: 'manual' });
    assert.equal(red.status, 301);
    assert.equal(red.headers.get('location'), 'https://ex.com/cours/');

    // Sans règle, la page passe telle quelle ; les fichiers non HTML ne sont jamais touchés.
    assert.match(await (await mf.dispatchFetch('https://ex.com/autre')).text(), /<title>Ancien titre<\/title>/);
    assert.equal(await (await mf.dispatchFetch('https://ex.com/cours/style.css')).text(), 'body{}');

    await kv.put('p:/', JSON.stringify({ noindex: true }));
    const home = await mf.dispatchFetch('https://ex.com/');
    assert.match(await home.text(), /<meta name="robots" content="noindex, follow">/);
    assert.equal(home.headers.get('x-robots-tag'), 'noindex');
  } finally {
    await mf.dispose();
  }
});
