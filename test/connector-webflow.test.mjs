import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebflowConnector from '../src/connectors/webflow.mjs';
import { ConnectorError } from '../src/connectors/base.mjs';

const SITE = 'site123';
// Faux Data API v2 : chemins, méthodes, en-têtes et corps tels que documentés sur developers.webflow.com.
function mockWebflow({ enterprise = true } = {}) {
  const db = {
    site: {
      id: SITE,
      displayName: 'Demo',
      shortName: 'demo',
      customDomains: [{ id: 'dom1', url: 'www.demo.example' }],
      locales: {
        primary: { id: 'loc-en', cmsLocaleId: 'cms-en', enabled: true, displayName: 'English', subdirectory: '', tag: 'en' },
        secondary: [{ id: 'loc-fr', cmsLocaleId: 'cms-fr', enabled: true, displayName: 'French', subdirectory: 'fr', tag: 'fr' }],
      },
    },
    pages: [
      { id: 'p-home', title: 'Home', slug: '', publishedPath: '/', collectionId: null, seo: { title: 'Accueil', description: '' } },
      { id: 'p-about', title: 'About', slug: 'about', publishedPath: '/company/about', collectionId: null, seo: { title: '', description: 'Old desc' } },
      { id: 'p-tpl', title: 'Blog template', slug: 'detail_post', publishedPath: '/post/detail_post', collectionId: 'col-post', seo: { title: '', description: '' } },
    ],
    pageFr: { 'p-about': { title: '', description: '' }, 'p-home': { title: '', description: '' } },
    collections: [{ id: 'col-post', displayName: 'Posts', singularName: 'Post', slug: 'post' }],
    fields: [
      { id: 'f1', slug: 'name', displayName: 'Name', type: 'PlainText', isRequired: true },
      { id: 'f2', slug: 'slug', displayName: 'Slug', type: 'PlainText', isRequired: true },
      { id: 'f3', slug: 'meta-title', displayName: 'Meta title', type: 'PlainText', isRequired: false },
      { id: 'f4', slug: 'meta-description', displayName: 'Meta description', type: 'PlainText', isRequired: false },
    ],
    items: {
      'cms-en': { id: 'it1', fieldData: { name: 'Hello world', slug: 'hello-world' } },
      'cms-fr': { id: 'it1', fieldData: { name: 'Bonjour', slug: 'bonjour' } },
    },
    redirects: [],
    published: [],
    calls: [],
  };
  let nextId = 1;
  const send = (res, status, obj) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(obj === undefined ? '' : JSON.stringify(obj));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const p = u.pathname;
      const q = Object.fromEntries(u.searchParams);
      const body = raw ? JSON.parse(raw) : undefined;
      db.calls.push(`${req.method} ${p}`);
      if (req.headers.authorization !== 'Bearer wf_ok') return send(res, 401, { code: 'not_authorized', message: 'Request not authorized' });
      if (req.method === 'GET' && p === `/v2/sites/${SITE}`) return send(res, 200, db.site);
      if (req.method === 'GET' && p === `/v2/sites/${SITE}/pages`) {
        const all = db.pages.map((pg) => (q.localeId === 'loc-fr' ? { ...pg, localeId: 'loc-fr', publishedPath: pg.publishedPath === '/' ? '/fr' : '/fr' + pg.publishedPath, seo: db.pageFr[pg.id] } : pg));
        const offset = Number(q.offset || 0);
        const limit = Math.min(Number(q.limit || 100), 2); // petite page pour tester la pagination
        return send(res, 200, { pages: all.slice(offset, offset + limit), pagination: { limit, offset, total: all.length } });
      }
      let m;
      if ((m = /^\/v2\/pages\/([^/]+)$/.exec(p))) {
        const pg = db.pages.find((x) => x.id === m[1]);
        if (!pg) return send(res, 404, { code: 'resource_not_found', message: 'Page not found' });
        const fr = q.localeId === 'loc-fr';
        if (req.method === 'PUT') {
          if (fr) db.pageFr[pg.id] = { ...db.pageFr[pg.id], ...body.seo };
          else pg.seo = { ...pg.seo, ...body.seo };
        }
        return send(res, 200, { ...pg, seo: fr ? db.pageFr[pg.id] : pg.seo });
      }
      if (req.method === 'GET' && p === `/v2/sites/${SITE}/collections`) return send(res, 200, { collections: db.collections });
      if (req.method === 'GET' && p === '/v2/collections/col-post') return send(res, 200, { ...db.collections[0], fields: db.fields });
      if (req.method === 'GET' && p === '/v2/collections/col-post/items') {
        const loc = q.cmsLocaleId || 'cms-en';
        const it = db.items[loc];
        const items = !q.slug || it.fieldData.slug === q.slug ? [{ ...it, cmsLocaleId: loc }] : [];
        return send(res, 200, { items, pagination: { limit: 100, offset: 0, total: items.length } });
      }
      if ((m = /^\/v2\/collections\/col-post\/items\/([^/]+)$/.exec(p)) && m[1] !== 'publish') {
        const loc = (req.method === 'PATCH' ? body.cmsLocaleId : q.cmsLocaleId) || 'cms-en';
        const it = db.items[loc];
        if (it.id !== m[1]) return send(res, 404, { code: 'resource_not_found' });
        if (req.method === 'PATCH') Object.assign(it.fieldData, body.fieldData);
        return send(res, 200, { ...it, cmsLocaleId: loc });
      }
      if (req.method === 'POST' && p === '/v2/collections/col-post/items/publish') {
        db.published.push(body);
        return send(res, 202, { publishedItemIds: body.itemIds || body.items.map((i) => i.id), errors: [] });
      }
      if (req.method === 'POST' && p === `/v2/sites/${SITE}/publish`) {
        db.published.push(body);
        return send(res, 202, { customDomains: db.site.customDomains, publishToWebflowSubdomain: true, publishScope: 'site' });
      }
      if (p.startsWith(`/v2/sites/${SITE}/redirects`)) {
        if (!enterprise) return send(res, 403, { code: 'forbidden', message: 'This endpoint requires an Enterprise workspace' });
        const id = p.split('/')[5];
        if (req.method === 'GET') return send(res, 200, { redirects: db.redirects, pagination: { limit: 100, offset: 0, total: db.redirects.length } });
        if (req.method === 'POST') {
          const r = { id: `r${nextId++}`, fromUrl: body.fromUrl, toUrl: body.toUrl };
          db.redirects.push(r);
          return send(res, 200, r);
        }
        const r = db.redirects.find((x) => x.id === id);
        if (!r) return send(res, 404, { code: 'resource_not_found' });
        if (req.method === 'PATCH') return send(res, 200, Object.assign(r, body));
        if (req.method === 'DELETE') {
          db.redirects = db.redirects.filter((x) => x.id !== id);
          return send(res, 200, { redirects: db.redirects, pagination: { limit: 100, offset: 0, total: db.redirects.length } });
        }
      }
      send(res, 404, { code: 'route_not_found', message: `${req.method} ${p}` });
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, db, origin: `http://127.0.0.1:${server.address().port}` })));
}

const PUB = 'https://www.demo.example';
async function setup(extra = {}, mockOpts) {
  const m = await mockWebflow(mockOpts);
  const c = new WebflowConnector({ url: PUB + '/', type: 'webflow', siteId: SITE, token: 'wf_ok', apiBase: m.origin + '/v2', ...extra });
  c.sleep = async () => {};
  return { ...m, c };
}

test('Webflow : test() et jeton refusé', async () => {
  const { server, c, origin } = await setup();
  try {
    const r = await c.test();
    assert.equal(r.ok, true);
    assert.match(r.details, /Demo.*www\.demo\.example.*en, fr/);
    const bad = new WebflowConnector({ url: PUB, siteId: SITE, token: 'nope', apiBase: origin + '/v2' });
    await assert.rejects(bad.test(), (e) => e instanceof ConnectorError && e.code === 'auth');
    await assert.rejects(new WebflowConnector({ url: PUB, token: 'x', apiBase: origin }).test(), (e) => e.code === 'config');
  } finally {
    server.close();
  }
});

test('Webflow : URL → page statique ou élément CMS (locales, slash final, accueil)', async () => {
  const { server, c } = await setup();
  try {
    assert.deepEqual(await c.resolve(PUB + '/'), { kind: 'page', id: 'p-home', localeId: null });
    assert.equal((await c.resolve(PUB + '/company/about/')).id, 'p-about');
    assert.deepEqual(await c.resolve(PUB + '/fr/company/about'), { kind: 'page', id: 'p-about', localeId: 'loc-fr' });
    assert.equal((await c.resolve(PUB + '/fr')).id, 'p-home');
    assert.deepEqual(await c.resolve(PUB + '/post/hello-world'), { kind: 'item', id: 'it1', collectionId: 'col-post', cmsLocaleId: null });
    assert.equal((await c.resolve(PUB + '/fr/post/bonjour/')).cmsLocaleId, 'cms-fr');
    await assert.rejects(c.resolve(PUB + '/post/detail_post'), (e) => e.code === 'not_found');
    await assert.rejects(c.resolve(PUB + '/post/inconnu'), (e) => e.code === 'not_found');
    await assert.rejects(c.resolve(PUB + '/rien/du/tout'), (e) => e.code === 'not_found');
  } finally {
    server.close();
  }
});

test('Webflow : SEO des pages statiques (aller-retour, null, locale)', async () => {
  const { server, c, db } = await setup();
  try {
    for (const url of ['/', '/company/about', '/fr/company/about']) {
      for (const field of ['seo_title', 'meta_description']) {
        const ch = { url: PUB + url, field };
        const before = await c.get(ch);
        const r = await c.set({ ...ch, value: `Nouveau ${field}` });
        assert.equal(r.published, false);
        assert.equal(await c.get(ch), `Nouveau ${field}`);
        await c.set({ ...ch, value: null });
        assert.equal(await c.get(ch), null);
        await c.set({ ...ch, value: before });
        assert.equal(await c.get(ch), before);
      }
    }
    // l'autre champ SEO n'est pas écrasé
    await c.set({ url: PUB + '/company/about', field: 'seo_title', value: 'T' });
    assert.equal(db.pages[1].seo.description, 'Old desc');
    assert.equal(db.pageFr['p-about'].title, '');
    await assert.rejects(c.get({ url: PUB + '/company/about', field: 'h1' }), (e) => e.code === 'unsupported');
  } finally {
    server.close();
  }
});

test('Webflow : champs SEO des éléments CMS et publication', async () => {
  const { server, c, db } = await setup({ publish: 'items' });
  try {
    for (const field of ['seo_title', 'meta_description', 'h1']) {
      const ch = { url: PUB + '/post/hello-world', field };
      const before = await c.get(ch);
      await c.set({ ...ch, value: `Valeur ${field}` });
      assert.equal(await c.get(ch), `Valeur ${field}`);
      if (field !== 'h1') {
        await c.set({ ...ch, value: null });
        assert.equal(await c.get(ch), null);
      } else {
        await assert.rejects(c.set({ ...ch, value: null }), (e) => e.code === 'unsupported');
        await c.set({ ...ch, value: before });
        assert.equal(await c.get(ch), 'Hello world');
      }
    }
    assert.deepEqual(db.published[0], { itemIds: ['it1'] });
    await c.set({ url: PUB + '/fr/post/bonjour', field: 'seo_title', value: 'Titre FR' });
    assert.equal(db.items['cms-fr'].fieldData['meta-title'], 'Titre FR');
    assert.equal(db.items['cms-en'].fieldData['meta-title'], '');
    assert.deepEqual(db.published.at(-1), { items: [{ id: 'it1', cmsLocaleIds: ['cms-fr'] }] });
    // champ absent de la collection
    const c2 = new WebflowConnector({ ...c.site, cmsFields: { seo_title: 'seo-title' } });
    await assert.rejects(c2.get({ url: PUB + '/post/hello-world', field: 'seo_title' }), (e) => e.code === 'unsupported' && /meta-title/.test(e.hint));
  } finally {
    server.close();
  }
});

test('Webflow : redirections 301 (Enterprise) et publication du site', async () => {
  const { server, c, db } = await setup({ publish: 'site' });
  try {
    const ch = { url: PUB + '/old-page/', field: 'redirect' };
    assert.equal(await c.get(ch), null);
    const r = await c.set({ ...ch, value: PUB + '/company/about' });
    assert.equal(r.published, 'site');
    assert.deepEqual(db.published[0], { customDomains: ['dom1'], publishToWebflowSubdomain: true });
    assert.deepEqual(db.redirects[0], { id: 'r1', fromUrl: '/old-page', toUrl: '/company/about' });
    assert.equal(await c.get(ch), '/company/about');
    await c.set({ ...ch, value: '/post/hello-world' });
    assert.equal(await c.get(ch), '/post/hello-world');
    assert.equal(db.redirects.length, 1);
    await c.set({ ...ch, value: null });
    assert.equal(await c.get(ch), null);
    assert.ok(db.calls.includes(`DELETE /v2/sites/${SITE}/redirects/r1`));
  } finally {
    server.close();
  }
  const m = await setup({}, { enterprise: false });
  try {
    await assert.rejects(m.c.get({ url: PUB + '/old', field: 'redirect' }), (e) => e.code === 'unsupported' && /Enterprise/.test(e.hint));
  } finally {
    m.server.close();
  }
});
