import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectFromHtml } from '../src/detect.mjs';
import { editHtml, FilesConnector } from '../src/connectors/files.mjs';
import { CloudflareConnector } from '../src/connectors/cloudflare.mjs';
import { manualInstructions } from '../src/connectors/manual.mjs';
import { validateChange, seoWarnings } from '../src/changes.mjs';
import { DEFAULT_POLICY, resolveSecrets, publicSite } from '../src/sites.mjs';

test('détection du CMS, du framework et de l’hébergement', () => {
  const wp = detectFromHtml('<link rel="stylesheet" href="/wp-content/themes/x/style.css"><meta name="generator" content="WordPress 6.8.1"><link href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"><!-- This site is optimized with the Yoast SEO plugin -->', { server: 'nginx' });
  assert.equal(wp.cms.id, 'wordpress');
  assert.equal(wp.cms.version, '6.8.1');
  assert.deepEqual(wp.extensions, ['WooCommerce', 'Yoast SEO']);
  assert.equal(wp.connector, 'wordpress');
  assert.ok(wp.hosting.includes('nginx'));
  assert.equal(detectFromHtml('<script src="https://cdn.shopify.com/s/files/x.js"></script>').cms.id, 'shopify');
  assert.equal(detectFromHtml('<html data-wf-page="1" data-wf-site="2">').connector, 'webflow');
  assert.equal(detectFromHtml('', { 'x-wix-request-id': '1' }).cms.id, 'wix');
  assert.equal(detectFromHtml('', { 'x-generator': 'Drupal 10 (https://www.drupal.org)' }).cms.version, '10');
  const sq = detectFromHtml('<script>Static.SQUARESPACE_CONTEXT = {}</script>', { 'cf-ray': 'x' });
  assert.equal(sq.mode, 'manual');
  assert.equal(sq.alternatives[0].connector, 'cloudflare');
  const next = detectFromHtml('<script id="__NEXT_DATA__"></script>', { 'x-vercel-id': 'x' });
  assert.equal(next.cms, null);
  assert.deepEqual(next.frameworks, ['Next.js']);
  assert.equal(next.connector, 'files');
  assert.equal(detectFromHtml('<p>hi</p>', { 'cf-ray': '1' }).connector, 'cloudflare');
});

test('édition HTML : balises du head, H1, alt, valeurs avec caractères spéciaux', () => {
  const html = '<html><head><title>Old</title><meta name="description" content="old"><meta name="robots" content="nofollow"></head><body><h1 class="t">Old <em>h1</em></h1><img src="/a.jpg" alt="x"></body></html>';
  assert.match(editHtml(html, 'seo_title', 'Prix $& "promo" <2>'), /<title>Prix \$&amp; "promo" &lt;2&gt;<\/title>/);
  assert.match(editHtml(html, 'meta_description', 'Nouveau "texte" $1'), /<meta name="description" content="Nouveau &quot;texte&quot; \$1">/);
  assert.doesNotMatch(editHtml(html, 'meta_description', null), /description/);
  assert.match(editHtml(html, 'canonical', 'https://x.fr/'), /<link rel="canonical" href="https:\/\/x.fr\/">\n<\/head>/);
  assert.match(editHtml(html, 'noindex', true), /content="noindex, nofollow"/);
  assert.match(editHtml(editHtml(html, 'noindex', true), 'noindex', false), /content="nofollow"/);
  assert.match(editHtml(html, 'h1', 'Nouveau'), /<h1 class="t">Nouveau<\/h1>/);
  assert.match(editHtml(html, 'image_alt', 'Photo', 'https://x.fr/a.jpg'), /<img src="\/a.jpg" alt="Photo">/);
  assert.match(editHtml(html, 'image_alt', null, '/a.jpg'), /<img src="\/a.jpg">/);
  assert.throws(() => editHtml(html, 'image_alt', 'x', '/b.jpg'), /not found/);
  assert.throws(() => editHtml('<body></body>', 'h1', 'x'), /No <h1>/);
});

test('connecteur fichiers : correspondance URL → fichier et formats de redirection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arachnide-files-'));
  try {
    await fs.mkdir(path.join(root, 'blog'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.html'), '<head><title>A</title></head>');
    await fs.writeFile(path.join(root, 'blog', 'index.html'), '<head><title>B</title></head>');
    await fs.writeFile(path.join(root, 'contact.html'), '<head><title>C</title></head>');
    await fs.writeFile(path.join(root, '.htaccess'), 'RewriteEngine On\n');
    const site = { url: 'https://ex.fr', root, redirectsFormat: 'apache' };
    const c = new FilesConnector(site);
    assert.equal(await c.get({ url: 'https://ex.fr/', field: 'seo_title' }), 'A');
    assert.equal(await c.get({ url: 'https://ex.fr/blog', field: 'seo_title' }), 'B');
    assert.equal(await c.get({ url: 'https://ex.fr/contact', field: 'seo_title' }), 'C');
    await assert.rejects(c.get({ url: 'https://ex.fr/../../etc/passwd', field: 'seo_title' }), { code: 'not_found' });
    await c.set({ url: 'https://ex.fr/vieux', field: 'redirect', value: 'https://ex.fr/blog/' });
    await c.set({ url: 'https://ex.fr/autre', field: 'redirect', value: 'https://ex.fr/' });
    assert.equal(await c.get({ url: 'https://ex.fr/vieux', field: 'redirect' }), 'https://ex.fr/blog/');
    await c.set({ url: 'https://ex.fr/autre', field: 'redirect', value: null });
    const ht = await fs.readFile(path.join(root, '.htaccess'), 'utf8');
    assert.equal(ht, '# BEGIN Arachnide redirects\nRedirect 301 /vieux https://ex.fr/blog/\n# END Arachnide redirects\n\nRewriteEngine On\n');
    for (const fmt of ['netlify', 'nginx', 'vercel']) {
      const cf = new FilesConnector({ ...site, redirectsFormat: fmt });
      await cf.set({ url: 'https://ex.fr/a', field: 'redirect', value: 'https://ex.fr/b' });
      assert.equal(await cf.get({ url: 'https://ex.fr/a', field: 'redirect' }), 'https://ex.fr/b', fmt);
      await cf.set({ url: 'https://ex.fr/a', field: 'redirect', value: null });
      assert.equal(await cf.get({ url: 'https://ex.fr/a', field: 'redirect' }), null, fmt);
    }
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8')).redirects.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('connecteur Cloudflare : règles dans le KV via l’API', async () => {
  const kv = new Map();
  let auth = null;
  const server = http.createServer(async (req, res) => {
    auth = req.headers.authorization;
    const m = /^\/client\/v4\/accounts\/acc\/storage\/kv\/namespaces\/ns(?:\/values\/(.+))?$/.exec(req.url);
    if (!m || auth !== 'Bearer tok') {
      res.writeHead(m ? 403 : 404, { 'content-type': 'application/json' });
      return res.end('{"success":false}');
    }
    if (!m[1]) return res.end(JSON.stringify({ success: true, result: { id: 'ns', title: 'ARACHNIDE' } }));
    const key = decodeURIComponent(m[1]);
    if (req.method === 'PUT') {
      let body = '';
      for await (const ch of req) body += ch;
      kv.set(key, body);
      return res.end('{"success":true}');
    }
    if (req.method === 'DELETE') {
      kv.delete(key);
      return res.end('{"success":true}');
    }
    if (!kv.has(key)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"success":false,"errors":[{"code":10009,"message":"get: \'key not found\'"}]}');
    }
    res.end(kv.get(key));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const apiBase = `http://127.0.0.1:${server.address().port}/client/v4`;
  try {
    const c = new CloudflareConnector({ url: 'https://ex.fr', accountId: 'acc', namespaceId: 'ns', apiToken: 'tok', apiBase });
    assert.match((await c.test()).details, /ARACHNIDE/);
    const u = 'https://ex.fr/cours/';
    assert.equal(await c.get({ url: u, field: 'seo_title' }), null);
    await c.set({ url: u, field: 'seo_title', value: 'Titre' });
    await c.set({ url: u, field: 'noindex', value: false });
    await c.set({ url: u, field: 'image_alt', target: 'https://ex.fr/a.jpg', value: 'Alt' });
    assert.deepEqual(JSON.parse(kv.get('p:/cours')), { seo_title: 'Titre', noindex: false, image_alt: { 'https://ex.fr/a.jpg': 'Alt' } });
    assert.equal(await c.get({ url: 'https://ex.fr/cours', field: 'noindex' }), false);
    await c.set({ url: 'https://ex.fr/vieux/', field: 'redirect', value: 'https://ex.fr/cours/' });
    assert.equal(await c.get({ url: 'https://ex.fr/vieux', field: 'redirect' }), 'https://ex.fr/cours/');
    for (const f of ['seo_title', 'noindex']) await c.set({ url: u, field: f, value: null });
    await c.set({ url: u, field: 'image_alt', target: 'https://ex.fr/a.jpg', value: null });
    assert.equal(kv.has('p:/cours'), false);
    const bad = new CloudflareConnector({ url: 'https://ex.fr', accountId: 'acc', namespaceId: 'ns', apiToken: 'nope', apiBase });
    await assert.rejects(bad.get({ url: u, field: 'h1' }), { code: 'auth' });
  } finally {
    server.close();
  }
});

test('validation des modifications, avertissements, secrets et instructions manuelles', () => {
  const site = { name: 's', url: 'https://www.ex.fr', policy: { ...DEFAULT_POLICY, allowedFields: ['seo_title', 'noindex', 'redirect'] } };
  assert.deepEqual(validateChange(site, { url: 'https://ex.fr/a', field: 'seo_title', value: '  Titre  ' }).change.value, 'Titre');
  assert.match(validateChange(site, { url: 'https://autre.fr/a', field: 'seo_title', value: 'x' }).errors[0], /not on/);
  assert.match(validateChange(site, { url: '/a', field: 'h1', value: 'x' }).errors[0], /policy/);
  assert.match(validateChange(site, { url: '/a', field: 'noindex', value: 'yes' }).errors[0], /true or false/);
  assert.match(validateChange(site, { url: '/a', field: 'redirect', value: '/a' }).errors[0], /itself/);
  assert.equal(validateChange(site, { url: '/a', field: 'redirect', value: '/b' }).change.value, 'https://www.ex.fr/b');
  assert.match(seoWarnings({ field: 'seo_title', value: 'Un titre beaucoup trop long pour tenir dans la largeur affichée par Google dans les résultats' })[0], /truncate/);
  assert.throws(() => resolveSecrets({ appPassword: 'env:ARACHNIDE_TEST_ABSENT' }, {}), /not set/);
  assert.equal(resolveSecrets({ appPassword: 'env:X', user: 'u' }, { X: 'secret' }).appPassword, 'secret');
  assert.equal(publicSite('s', { apiToken: 'abc', user: 'u' }).apiToken, '••••');
  assert.equal(publicSite('s', { apiToken: 'env:T' }).apiToken, 'env:T');
  assert.match(manualInstructions('wix', { field: 'meta_description', url: 'https://ex.fr/', value: 'Desc' }), /SEO basics.*Desc/);
  assert.match(manualInstructions('unknown-cms', { field: 'redirect', url: 'https://ex.fr/a', value: null }), /Delete the 301/);
});
