import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WixConnector from '../src/connectors/wix.mjs';
import { ConnectorError } from '../src/connectors/base.mjs';

// Faux www.wixapis.com reproduisant les formes documentées (Item SEO Tags, SEO Redirects, Blog, Stores V3).
function startMock() {
  const calls = [];
  const items = new Map();
  let origin = '';
  const add = (type, id, resolved, { listResolved = true } = {}) => items.set(`${type}:${id}`, { itemType: type, itemId: id, tags: [], base: resolved, listResolved });
  const redirects = [{ id: 'r-old', from: '/ancien', to: '/nouveau', options: { groupRedirect: false } }];
  const key = (t) => (t.type === 'title' ? 'title' : t.type === 'link' ? 'link:' + t.props.rel : 'meta:' + (t.props.name || t.props.property));
  const view = (it, withResolved = true) => {
    const own = new Map(it.tags.map((t) => [key(t), t]));
    const resolved = it.base.filter((r) => !own.has(key(r.tag))).concat(it.tags.map((t) => ({ tag: t, source: 'TAG_SOURCE_ITEM' })));
    return { id: `${it.itemType}:${it.itemId}`, itemType: it.itemType, itemId: it.itemId, tags: it.tags, hasOverride: it.tags.length > 0, ...(withResolved ? { resolvedTags: resolved } : {}), publishStatus: 'PUBLISH_STATUS_UNSPECIFIED' };
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ method: req.method, path: u.pathname, search: u.search, body });
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(obj === undefined ? '' : JSON.stringify(obj));
      };
      if (req.headers.authorization !== 'CLE' || req.headers['wix-site-id'] !== 'SITE-1') return send(403, { message: 'PERMISSION_DENIED' });
      const p = u.pathname;
      let m;
      // Seul le chemin du schéma répond, pour vérifier le repli /promote/seo/v1 → /seo-metatags-server/v1.
      if ((m = /^\/seo-metatags-server\/v1\/item-seo-tags\/([A-Z_]+)$/.exec(p)) && req.method === 'GET') {
        const all = [...items.values()].filter((i) => i.itemType === m[1]);
        const limit = Number(u.searchParams.get('paging.limit') || 50);
        const start = Number(u.searchParams.get('paging.cursor') || 0);
        const page = all.slice(start, start + limit);
        const hasNext = start + limit < all.length;
        return send(200, { itemSeoTags: page.map((i) => view(i, i.listResolved)), pagingMetadata: { count: page.length, hasNext, cursors: hasNext ? { next: String(start + limit) } : {} } });
      }
      if ((m = /^\/seo-metatags-server\/v1\/item-seo-tags\/([A-Z_]+)\/([^/]+)(\/reset-to-default)?$/.exec(p))) {
        const it = items.get(`${m[1]}:${decodeURIComponent(m[2])}`);
        if (!it) return send(404, { details: { applicationError: { code: 'ITEM_NOT_FOUND' } } });
        if (m[3] && req.method === 'POST') {
          it.tags = [];
          return send(200, { itemSeoTags: view(it) });
        }
        if (req.method === 'GET') return send(200, { itemSeoTags: view(it) });
        if (req.method === 'PATCH') {
          if (body.fieldMask !== 'tags' || !Array.isArray(body.itemSeoTags?.tags)) return send(400, { details: { applicationError: { code: 'INVALID_FIELD_MASK' } } });
          if (!body.publish) it.tags = body.itemSeoTags.tags; // publish: true ne touche que la version publiée
          else it.published = body.itemSeoTags.tags;
          return send(200, { itemSeoTags: view(it) });
        }
      }
      if ((m = /^\/blog\/v3\/posts\/slugs\/(.+)$/.exec(p)) && req.method === 'GET') {
        const slug = decodeURIComponent(m[1]);
        if (slug === 'mon-article' || slug === 'été-2026') return send(200, { post: { id: 'post-' + slug, slug } });
        return send(404, { message: 'post not found' });
      }
      if (p === '/stores/v3/provision/version') return send(200, { catalogVersion: 'V3_CATALOG' });
      if ((m = /^\/stores\/v3\/products\/slug\/(.+)$/.exec(p))) {
        if (decodeURIComponent(m[1]) === 'chaussure-rouge') return send(200, { product: { id: 'prod-1', slug: 'chaussure-rouge' } });
        return send(404, { message: 'product not found' });
      }
      if (p === '/seo-redirects-service/v1/redirects' && req.method === 'GET') return send(200, { redirects });
      if (p === '/seo-redirects-service/v1/create-redirect' && req.method === 'POST') {
        const r = body.redirect;
        const i = redirects.findIndex((x) => x.from.replace(/\/$/, '') === r.from.replace(/\/$/, ''));
        if (i >= 0 && !body.options?.forceReplace) return send(409, { details: { applicationError: { code: 'FROM_URL_EXISTS' } } });
        if (i >= 0) redirects.splice(i, 1);
        const created = { id: 'r-' + redirects.length + '-' + Date.now(), from: r.from, to: r.to, options: { groupRedirect: false } };
        redirects.push(created);
        return send(200, { redirect: { from: created.from, to: created.to, options: created.options, id: created.id } });
      }
      if ((m = /^\/seo-redirects-service\/v1\/redirects\/(.+)$/.exec(p)) && req.method === 'DELETE') {
        const i = redirects.findIndex((x) => x.id === decodeURIComponent(m[1]));
        if (i < 0) return send(404, { details: { applicationError: { code: 'REDIRECT_NOT_FOUND' } } });
        redirects.splice(i, 1);
        return send(200, {});
      }
      send(404, { message: 'Not Found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    const site = 'https://www.boutique.fr';
    const canon = (path, extra = []) => [{ tag: { type: 'title', children: 'Défaut | Boutique' }, source: 'TAG_SOURCE_DEFAULT_PATTERN' }, { tag: { type: 'link', props: { rel: 'canonical', href: site + path } }, source: 'TAG_SOURCE_DEFAULT_PATTERN' }, ...extra];
    add('STATIC_PAGE', 'c1dmp', canon(''));
    add('STATIC_PAGE', 'ab12', canon('/a-propos'));
    add('STATIC_PAGE', 'nr9x', canon('/contact'), { listResolved: false });
    add('STATIC_PAGE', 'inh1', canon('/prive', [{ tag: { type: 'meta', props: { name: 'robots', content: 'noindex' } }, source: 'TAG_SOURCE_SITE' }]));
    add('BLOG_POST', 'post-mon-article', canon('/post/mon-article'));
    add('BLOG_POST', 'post-été-2026', canon('/post/été-2026'));
    add('STORES_PRODUCT', 'prod-1', canon('/product-page/chaussure-rouge'));
    resolve({ server, calls, items, redirects, origin });
  }));
}

const make = (origin, extra = {}) => new WixConnector({ url: 'https://www.boutique.fr/', type: 'wix', apiBase: origin, siteId: 'SITE-1', apiKey: 'CLE', ...extra });

test('Wix : test() et repli sur le chemin /seo-metatags-server/v1', async () => {
  const m = await startMock();
  try {
    const c = make(m.origin);
    const r = await c.test();
    assert.equal(r.ok, true);
    assert.match(r.details, /seo-metatags-server/);
    assert.match(r.details, /1 redirection/);
    assert.ok(m.calls.some((x) => x.path === '/promote/seo/v1/item-seo-tags/STATIC_PAGE'));
    assert.ok(!r.details.includes('CLE'));
  } finally {
    m.server.close();
  }
});

test('Wix : URL → élément (accueil, / final, slug encodé, blog, produit, page sans resolvedTags dans la liste)', async () => {
  const m = await startMock();
  try {
    const c = make(m.origin);
    assert.deepEqual(await c.resolve('https://www.boutique.fr/'), { itemType: 'STATIC_PAGE', itemId: 'c1dmp' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr'), { itemType: 'STATIC_PAGE', itemId: 'c1dmp' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr/a-propos/'), { itemType: 'STATIC_PAGE', itemId: 'ab12' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr/contact'), { itemType: 'STATIC_PAGE', itemId: 'nr9x' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr/post/mon-article/'), { itemType: 'BLOG_POST', itemId: 'post-mon-article' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr/post/%C3%A9t%C3%A9-2026'), { itemType: 'BLOG_POST', itemId: 'post-été-2026' });
    assert.deepEqual(await c.resolve('https://www.boutique.fr/product-page/chaussure-rouge'), { itemType: 'STORES_PRODUCT', itemId: 'prod-1' });
    const c2 = make(m.origin, { pages: { '/cachee': 'ab12' } });
    assert.deepEqual(await c2.resolve('https://www.boutique.fr/cachee/'), { itemType: 'STATIC_PAGE', itemId: 'ab12' });
    for (const u of ['https://www.boutique.fr/inconnue', 'https://www.boutique.fr/post/absent', 'https://www.boutique.fr/product-page/absent']) {
      await assert.rejects(c.get({ url: u, field: 'seo_title' }), (e) => e instanceof ConnectorError && e.code === 'not_found');
    }
  } finally {
    m.server.close();
  }
});

test('Wix : get/set/null pour titre, description, canonical (page statique publiée, produit, article)', async () => {
  const m = await startMock();
  try {
    const c = make(m.origin);
    const cases = [
      ['https://www.boutique.fr/a-propos', 'STATIC_PAGE:ab12'],
      ['https://www.boutique.fr/product-page/chaussure-rouge', 'STORES_PRODUCT:prod-1'],
      ['https://www.boutique.fr/post/mon-article', 'BLOG_POST:post-mon-article'],
    ];
    for (const [url, id] of cases) {
      for (const [field, value] of [['seo_title', 'Titre « neuf » | Boutique'], ['meta_description', 'Une description.'], ['canonical', 'https://www.boutique.fr/autre']]) {
        assert.equal(await c.get({ url, field }), null);
        await c.set({ url, field, value });
        assert.equal(await c.get({ url, field }), value);
      }
      // Les autres balises sont conservées lors d'une écriture (l'API remplace la liste complète).
      assert.equal(m.items.get(id).tags.length, 3);
      await c.set({ url, field: 'seo_title', value: null });
      assert.equal(await c.get({ url, field: 'seo_title' }), null);
      assert.equal(await c.get({ url, field: 'meta_description' }), 'Une description.');
      await c.set({ url, field: 'meta_description', value: null });
      await c.set({ url, field: 'canonical', value: null });
      assert.equal(m.items.get(id).tags.length, 0);
    }
    // Page statique : brouillon + version publiée.
    const patches = m.calls.filter((x) => x.method === 'PATCH' && x.path.endsWith('/STATIC_PAGE/ab12'));
    assert.ok(patches.some((x) => x.body.publish === true) && patches.some((x) => !x.body.publish));
    assert.ok(m.calls.some((x) => x.method === 'POST' && x.path.endsWith('/STATIC_PAGE/ab12/reset-to-default')));
    assert.ok(m.calls.every((x) => x.method !== 'PATCH' || x.body.fieldMask === 'tags'));
  } finally {
    m.server.close();
  }
});

test('Wix : noindex (propre à l’élément, puis hérité du site)', async () => {
  const m = await startMock();
  try {
    const c = make(m.origin);
    const url = 'https://www.boutique.fr/product-page/chaussure-rouge';
    assert.equal(await c.get({ url, field: 'noindex' }), false);
    await c.set({ url, field: 'noindex', value: true });
    assert.equal(await c.get({ url, field: 'noindex' }), true);
    assert.deepEqual(m.items.get('STORES_PRODUCT:prod-1').tags, [{ type: 'meta', props: { name: 'robots', content: 'noindex' } }]);
    await c.set({ url, field: 'noindex', value: false });
    assert.equal(await c.get({ url, field: 'noindex' }), false);
    const prive = 'https://www.boutique.fr/prive';
    assert.equal(await c.get({ url: prive, field: 'noindex' }), true);
    await assert.rejects(c.set({ url: prive, field: 'noindex', value: false }), (e) => e.code === 'unsupported');
  } finally {
    m.server.close();
  }
});

test('Wix : redirections (création, remplacement, suppression, accueil interdit)', async () => {
  const m = await startMock();
  try {
    const c = make(m.origin);
    assert.equal(await c.get({ url: 'https://www.boutique.fr/ancien/', field: 'redirect' }), 'https://www.boutique.fr/nouveau');
    assert.equal(await c.get({ url: 'https://www.boutique.fr/vieux-produit', field: 'redirect' }), null);
    await c.set({ url: 'https://www.boutique.fr/vieux-produit', field: 'redirect', value: 'https://www.boutique.fr/product-page/chaussure-rouge' });
    assert.equal(await c.get({ url: 'https://www.boutique.fr/vieux-produit', field: 'redirect' }), 'https://www.boutique.fr/product-page/chaussure-rouge');
    const created = m.calls.find((x) => x.path === '/seo-redirects-service/v1/create-redirect');
    assert.deepEqual(created.body, { redirect: { from: '/vieux-produit', to: '/product-page/chaussure-rouge' }, options: { forceReplace: true } });
    await c.set({ url: 'https://www.boutique.fr/ancien', field: 'redirect', value: 'https://ailleurs.com/page' });
    assert.equal(await c.get({ url: 'https://www.boutique.fr/ancien', field: 'redirect' }), 'https://ailleurs.com/page');
    await c.set({ url: 'https://www.boutique.fr/ancien', field: 'redirect', value: null });
    assert.equal(await c.get({ url: 'https://www.boutique.fr/ancien', field: 'redirect' }), null);
    await assert.rejects(c.set({ url: 'https://www.boutique.fr/', field: 'redirect', value: '/x' }), (e) => e.code === 'unsupported');
  } finally {
    m.server.close();
  }
});

test('Wix : erreurs d’authentification, de configuration et champ non pris en charge', async () => {
  const m = await startMock();
  try {
    await assert.rejects(make(m.origin, { apiKey: 'MAUVAISE' }).test(), (e) => e instanceof ConnectorError && e.code === 'auth');
    await assert.rejects(make(m.origin, { apiKey: '' }).test(), (e) => e.code === 'config');
    await assert.rejects(make(m.origin).set({ url: 'https://www.boutique.fr/a-propos', field: 'h1', value: 'x' }), (e) => e.code === 'unsupported');
  } finally {
    m.server.close();
  }
});
