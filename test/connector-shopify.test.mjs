import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import ShopifyConnector, { shopifyImageKey } from '../src/connectors/shopify.mjs';
import { ConnectorError } from '../src/connectors/base.mjs';

// Faux Admin GraphQL API : reproduit les formes de requêtes/réponses documentées sur shopify.dev.
function mockShopify() {
  const db = {
    resources: {
      'gid://shopify/Product/1': { type: 'product', handle: 'red-shoe', title: 'Red shoe', mf: {}, media: [{ id: 'gid://shopify/MediaImage/10', alt: '', mediaContentType: 'IMAGE', image: { url: 'https://cdn.shopify.com/s/files/1/0001/files/red-shoe.jpg?v=17' } }] },
      'gid://shopify/Collection/2': { type: 'collection', handle: 'shoes', title: 'Shoes', mf: {} },
      'gid://shopify/Page/3': { type: 'page', handle: 'about', title: 'About us', mf: {} },
      'gid://shopify/Blog/4': { type: 'blog', handle: 'news', title: 'News', mf: {} },
      'gid://shopify/Article/5': { type: 'article', handle: 'hello', title: 'Hello', blog: 'news', mf: {} },
    },
    translations: {}, // `${id}|${locale}|${key}` → value
    redirects: [],
    calls: [],
    throttleOnce: false,
  };
  let nextId = 100;
  const find = (type, handle) => Object.entries(db.resources).find(([, r]) => r.type === type && r.handle === handle);
  const node = (id) => {
    const r = db.resources[id];
    if (!r) return null;
    const mf = (k) => (r.mf[k] ? { value: r.mf[k] } : null);
    return { id, title: r.title, t: mf('global.title_tag'), d: mf('global.description_tag'), h: mf('seo.hidden') };
  };
  const handleOf = (q) => JSON.parse(/handle:(".*")/.exec(q)[1]);

  function exec(query, v) {
    db.calls.push(query);
    if (/\bshop \{/.test(query)) return { shop: { name: 'Demo', myshopifyDomain: 'demo.myshopify.com', primaryDomain: { url: 'https://shop.example' } }, currentAppInstallation: { accessScopes: [{ handle: 'write_products' }, { handle: 'write_content' }] } };
    if (/shopLocales/.test(query)) return { shopLocales: [{ locale: 'en', primary: true, published: true }, { locale: 'fr', primary: false, published: true }] };
    if (/productByIdentifier/.test(query)) { const f = find('product', v.h); return { r: f ? { id: f[0], handle: v.h } : null }; }
    if (/collectionByIdentifier/.test(query)) { const f = find('collection', v.h); return { r: f ? { id: f[0], handle: v.h } : null }; }
    for (const t of ['pages', 'blogs']) {
      if (new RegExp(`c: ${t}\\(`).test(query)) {
        const f = find(t === 'pages' ? 'page' : 'blog', handleOf(v.q));
        return { c: { nodes: f ? [{ id: f[0], handle: f[1].handle }] : [] } };
      }
    }
    if (/articles\(/.test(query)) {
      const h = handleOf(v.q);
      return { articles: { nodes: Object.entries(db.resources).filter(([, r]) => r.type === 'article' && r.handle === h).map(([id, r]) => ({ id, handle: r.handle, blog: { handle: r.blog } })) } };
    }
    if (/node\(id/.test(query)) return { node: node(v.id) };
    if (/metafieldsSet/.test(query)) {
      for (const m of v.m) {
        assert.ok(m.type, 'type requis');
        db.resources[m.ownerId].mf[`${m.namespace}.${m.key}`] = m.value;
      }
      return { metafieldsSet: { metafields: v.m.map((m) => ({ key: m.key, value: m.value })), userErrors: [] } };
    }
    if (/metafieldsDelete/.test(query)) {
      for (const m of v.m) delete db.resources[m.ownerId].mf[`${m.namespace}.${m.key}`];
      return { metafieldsDelete: { deletedMetafields: v.m.map((m) => ({ key: m.key })), userErrors: [] } };
    }
    const upd = (id, input) => {
      if (!input.title) return { userErrors: [{ field: ['title'], message: "Title can't be blank" }] };
      db.resources[id].title = input.title;
      return { userErrors: [] };
    };
    if (/productUpdate\(product:/.test(query)) return { r: upd(v.p.id, v.p) };
    if (/collectionUpdate\(collection:/.test(query)) return { r: upd(v.c.id, v.c) };
    if (/pageUpdate\(id: \$id, page:/.test(query)) return { r: upd(v.id, v.p) };
    if (/articleUpdate\(id: \$id, article:/.test(query)) return { r: upd(v.id, v.a) };
    if (/blogUpdate\(id: \$id, blog:/.test(query)) return { r: upd(v.id, v.b) };
    if (/translatableResource/.test(query)) {
      const r = db.resources[v.id];
      const content = [{ key: 'title', value: r.title, digest: 'dg-title' }];
      if (r.mf['global.title_tag']) content.push({ key: 'meta_title', value: r.mf['global.title_tag'], digest: 'dg-mt' });
      const translations = Object.entries(db.translations).filter(([k]) => k.startsWith(`${v.id}|${v.l}|`)).map(([k, value]) => ({ key: k.split('|')[2], value }));
      return { translatableResource: { translatableContent: content, translations } };
    }
    if (/translationsRegister/.test(query)) {
      for (const t of v.t) {
        assert.ok(t.translatableContentDigest);
        db.translations[`${v.id}|${t.locale}|${t.key}`] = t.value;
      }
      return { translationsRegister: { translations: v.t, userErrors: [] } };
    }
    if (/translationsRemove/.test(query)) {
      for (const k of v.k) for (const l of v.l) delete db.translations[`${v.id}|${l}|${k}`];
      return { translationsRemove: { translations: [], userErrors: [] } };
    }
    if (/product\(id/.test(query)) return { product: { media: { nodes: db.resources[v.id].media } } };
    if (/fileUpdate/.test(query)) {
      for (const f of v.f) for (const r of Object.values(db.resources)) for (const m of r.media || []) if (m.id === f.id) m.alt = f.alt;
      return { fileUpdate: { files: v.f, userErrors: [] } };
    }
    if (/urlRedirects\(/.test(query)) {
      const p = JSON.parse(/path:(".*")/.exec(v.q)[1]);
      return { urlRedirects: { nodes: db.redirects.filter((r) => r.path.includes(p)) } };
    }
    if (/urlRedirectCreate/.test(query)) {
      const r = { id: `gid://shopify/UrlRedirect/${nextId++}`, ...v.r };
      db.redirects.push(r);
      return { urlRedirectCreate: { urlRedirect: { id: r.id }, userErrors: [] } };
    }
    if (/urlRedirectUpdate/.test(query)) {
      Object.assign(db.redirects.find((r) => r.id === v.id), v.r);
      return { urlRedirectUpdate: { urlRedirect: { id: v.id }, userErrors: [] } };
    }
    if (/urlRedirectDelete/.test(query)) {
      db.redirects = db.redirects.filter((r) => r.id !== v.id);
      return { urlRedirectDelete: { deletedUrlRedirectId: v.id, userErrors: [] } };
    }
    throw new Error('requête non simulée : ' + query);
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'POST' || req.url !== '/admin/api/2026-10/graphql.json') {
        res.statusCode = 404;
        return res.end('{"errors":"Not Found"}');
      }
      if (req.headers['x-shopify-access-token'] !== 'shpat_ok') {
        res.statusCode = 401;
        return res.end('{"errors":"[API] Invalid API key or access token (unrecognized login or wrong password)"}');
      }
      const { query, variables } = JSON.parse(body);
      if (db.throttleOnce) {
        db.throttleOnce = false;
        return res.end(JSON.stringify({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { requestedQueryCost: 10, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 0, restoreRate: 100 } } } }));
      }
      try {
        res.end(JSON.stringify({ data: exec(query, variables || {}) }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ errors: [{ message: e.message }] }));
      }
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, db, origin: `http://127.0.0.1:${server.address().port}` })));
}

const PUB = 'https://shop.example';
async function setup(token = 'shpat_ok') {
  const m = await mockShopify();
  const c = new ShopifyConnector({ url: PUB + '/', type: 'shopify', shop: m.origin, accessToken: token });
  c.sleep = async () => {};
  return { ...m, c };
}

test('Shopify : test() et jeton refusé', async () => {
  const { server, c } = await setup();
  const bad = new ShopifyConnector({ url: PUB, shop: c.shopOrigin, accessToken: 'nope' });
  try {
    const r = await c.test();
    assert.equal(r.ok, true);
    assert.match(r.details, /demo\.myshopify\.com/);
    await assert.rejects(bad.test(), (e) => e instanceof ConnectorError && e.code === 'auth');
    await assert.rejects(new ShopifyConnector({ url: PUB, accessToken: 'x' }).test(), (e) => e.code === 'config');
  } finally {
    server.close();
  }
});

test('Shopify : URL → ressource', async () => {
  const { server, c } = await setup();
  try {
    assert.equal((await c.resolve(PUB + '/products/red-shoe')).id, 'gid://shopify/Product/1');
    assert.equal((await c.resolve(PUB + '/products/red-shoe/')).id, 'gid://shopify/Product/1');
    assert.equal((await c.resolve(PUB + '/collections/shoes/products/red-shoe')).id, 'gid://shopify/Product/1');
    assert.equal((await c.resolve(PUB + '/collections/shoes?page=2')).id, 'gid://shopify/Collection/2');
    assert.equal((await c.resolve(PUB + '/pages/about')).id, 'gid://shopify/Page/3');
    assert.equal((await c.resolve(PUB + '/blogs/news')).id, 'gid://shopify/Blog/4');
    assert.equal((await c.resolve(PUB + '/blogs/news/hello')).id, 'gid://shopify/Article/5');
    const fr = await c.resolve(PUB + '/fr/products/red-shoe');
    assert.deepEqual([fr.id, fr.locale], ['gid://shopify/Product/1', 'fr']);
    assert.equal((await c.resolve(PUB + '/en/pages/about')).locale, null);
    await assert.rejects(c.resolve(PUB + '/products/inconnu'), (e) => e.code === 'not_found');
    await assert.rejects(c.resolve(PUB + '/blogs/autre/hello'), (e) => e.code === 'not_found');
    await assert.rejects(c.resolve(PUB + '/search'), (e) => e.code === 'not_found');
    await assert.rejects(c.get({ url: PUB + '/', field: 'seo_title' }), (e) => e.code === 'unsupported');
  } finally {
    server.close();
  }
});

test('Shopify : titre SEO, description, noindex, H1 (aller-retour et null)', async () => {
  const { server, c, db } = await setup();
  try {
    for (const url of ['/products/red-shoe', '/collections/shoes', '/pages/about', '/blogs/news/hello', '/blogs/news']) {
      for (const field of ['seo_title', 'meta_description']) {
        const ch = { url: PUB + url, field };
        assert.equal(await c.get(ch), null);
        await c.set({ ...ch, value: `Valeur ${field}` });
        assert.equal(await c.get(ch), `Valeur ${field}`);
        await c.set({ ...ch, value: null });
        assert.equal(await c.get(ch), null);
      }
      const ni = { url: PUB + url, field: 'noindex' };
      assert.equal(await c.get(ni), false);
      await c.set({ ...ni, value: true });
      assert.equal(await c.get(ni), true);
      await c.set({ ...ni, value: false });
      assert.equal(await c.get(ni), false);
      const h1 = { url: PUB + url, field: 'h1' };
      const before = await c.get(h1);
      await c.set({ ...h1, value: 'Nouveau titre' });
      assert.equal(await c.get(h1), 'Nouveau titre');
      await c.set({ ...h1, value: before });
      assert.equal(await c.get(h1), before);
      await assert.rejects(c.set({ ...h1, value: null }), (e) => e.code === 'unsupported');
    }
    assert.ok(db.calls.some((q) => /collectionUpdate\(collection:/.test(q)));
    // version antérieure à 2026-07 : argument « input »
    c.apiVersion = '2026-04';
    assert.equal(c.endpoint.endsWith('/admin/api/2026-04/graphql.json'), true);
  } finally {
    server.close();
  }
});

test('Shopify : traductions sur URL préfixée par une langue', async () => {
  const { server, c } = await setup();
  try {
    const ch = { url: PUB + '/fr/products/red-shoe', field: 'h1' };
    assert.equal(await c.get(ch), null);
    await c.set({ ...ch, value: 'Chaussure rouge' });
    assert.equal(await c.get(ch), 'Chaussure rouge');
    assert.equal(await c.get({ url: PUB + '/products/red-shoe', field: 'h1' }), 'Red shoe');
    await c.set({ ...ch, value: null });
    assert.equal(await c.get(ch), null);
    // meta_title non renseigné dans la langue principale → pas de digest
    await assert.rejects(c.set({ url: PUB + '/fr/products/red-shoe', field: 'seo_title', value: 'x' }), (e) => e.code === 'unsupported');
    await c.set({ url: PUB + '/products/red-shoe', field: 'seo_title', value: 'Red shoe | Demo' });
    await c.set({ url: PUB + '/fr/products/red-shoe', field: 'seo_title', value: 'Chaussure rouge | Démo' });
    assert.equal(await c.get({ url: PUB + '/fr/products/red-shoe', field: 'seo_title' }), 'Chaussure rouge | Démo');
    assert.equal(await c.get({ url: PUB + '/products/red-shoe', field: 'seo_title' }), 'Red shoe | Demo');
  } finally {
    server.close();
  }
});

test('Shopify : texte alternatif des médias produit', async () => {
  const { server, c } = await setup();
  try {
    assert.equal(shopifyImageKey('//shop.example/cdn/shop/files/red-shoe_600x600_crop_center.jpg?v=17&width=800'), 'red-shoe.jpg');
    const ch = { url: PUB + '/products/red-shoe', field: 'image_alt', target: 'https://shop.example/cdn/shop/files/red-shoe.jpg?v=17&width=1946' };
    assert.equal(await c.get(ch), null);
    await c.set({ ...ch, value: 'Chaussure rouge en cuir' });
    assert.equal(await c.get(ch), 'Chaussure rouge en cuir');
    await c.set({ ...ch, value: null });
    assert.equal(await c.get(ch), null);
    await assert.rejects(c.get({ ...ch, target: '/cdn/shop/files/autre.png' }), (e) => e.code === 'not_found');
    await assert.rejects(c.get({ ...ch, url: PUB + '/pages/about' }), (e) => e.code === 'unsupported');
  } finally {
    server.close();
  }
});

test('Shopify : redirections et limitation de débit', async () => {
  const { server, c, db } = await setup();
  try {
    const ch = { url: PUB + '/products/old-shoe/', field: 'redirect' };
    assert.equal(await c.get(ch), null);
    await c.set({ ...ch, value: PUB + '/products/red-shoe' });
    assert.equal(db.redirects[0].path, '/products/old-shoe');
    assert.equal(await c.get(ch), '/products/red-shoe');
    db.throttleOnce = true; // THROTTLED → attente puis une nouvelle tentative
    await c.set({ ...ch, value: 'https://ailleurs.example/x' });
    assert.equal(await c.get(ch), 'https://ailleurs.example/x');
    assert.equal(db.redirects.length, 1);
    await c.set({ ...ch, value: null });
    assert.equal(await c.get(ch), null);
    assert.equal(db.redirects.length, 0);
  } finally {
    server.close();
  }
});
