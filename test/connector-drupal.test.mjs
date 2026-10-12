import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import DrupalConnector, { decodeMetatag } from '../src/connectors/drupal.mjs';

// Faux Drupal 11 : JSON:API du cœur, basic_auth, Metatag 2.x (champ aplati, valeur JSON), Redirect, Decoupled Router.
function mockDrupal() {
  const AUTH = 'Basic ' + Buffer.from('editor:s3cret').toString('base64');
  const s = {
    readOnly: false,
    nodes: {
      'u-1': {
        type: 'node--article', nid: 1,
        attributes: {
          drupal_internal__nid: 1, langcode: 'fr', title: 'Mon article',
          body: { value: '<p><img src="/sites/default/files/inline/schema.png" alt="vieux"></p>', format: 'basic_html', processed: '<p>…</p>', summary: '' },
          field_meta_tags: JSON.stringify({ description: 'Ancienne description' }),
          metatag: [{ tag: 'meta', attributes: { name: 'title', content: 'Mon article | Site' } }],
          path: { alias: '/blog/mon-article', pid: 1, langcode: 'fr' },
        },
        relationships: {
          field_image: { data: { type: 'file--file', id: 'f-1', meta: { alt: 'Photo', title: '', width: 800, height: 600, drupal_internal__target_id: 11 } } },
          field_media: { data: [{ type: 'media--image', id: 'm-1', meta: { drupal_internal__target_id: 5 } }] },
          uid: { data: { type: 'user--user', id: 'usr', meta: { drupal_internal__target_id: 1 } } },
        },
      },
      'u-2': {
        type: 'node--page', nid: 2,
        attributes: {
          drupal_internal__nid: 2, langcode: 'fr', title: 'À propos', body: null,
          field_meta_tags: 'a:2:{s:5:"title";s:16:"Qui sommes-nous?";s:6:"robots";s:17:"noindex, nofollow";}',
          path: { alias: '/a-propos', pid: 2, langcode: 'fr' },
        },
        relationships: {},
      },
      'u-3': { type: 'node--page', nid: 3, attributes: { drupal_internal__nid: 3, langcode: 'fr', title: 'Accueil', field_meta_tags: null }, relationships: {} },
    },
    media: {
      'm-1': { type: 'media--image', attributes: { name: 'Media' }, relationships: { field_media_image: { data: { type: 'file--file', id: 'f-2', meta: { alt: 'Média', title: null, width: 10, height: 10, drupal_internal__target_id: 12 } } } } },
    },
    files: {
      'f-1': { filename: 'photo.jpg', uri: { value: 'public://2025-01/photo.jpg', url: '/sites/default/files/2025-01/photo.jpg' } },
      'f-2': { filename: 'media.png', uri: { value: 'public://media.png', url: '/sites/default/files/media.png' } },
    },
    aliases: [
      { id: 'a1', attributes: { alias: '/blog/mon-article', path: '/node/1', langcode: 'fr' } },
      { id: 'a2', attributes: { alias: '/a-propos', path: '/node/2', langcode: 'fr' } },
      { id: 'a3', attributes: { alias: '/tags/seo', path: '/taxonomy/term/4', langcode: 'fr' } },
    ],
    redirects: [],
    patches: [],
  };
  const send = (res, code, body, type = 'application/vnd.api+json') => {
    res.writeHead(code, { 'content-type': type });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const nodeDoc = (id) => ({ type: s.nodes[id].type, id, attributes: s.nodes[id].attributes, relationships: s.nodes[id].relationships });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const p = u.pathname;
      const q = Object.fromEntries(u.searchParams);
      const authed = req.headers.authorization === AUTH;
      if (req.headers.authorization && !authed) return send(res, 403, { errors: [{ status: '403', title: 'Forbidden', detail: 'Unauthorized' }] });
      if (p === '/router/translate-path') {
        if (q.path === '/') return send(res, 200, { resolved: '/', isHomePath: true, entity: { type: 'node', bundle: 'page', id: '3', uuid: 'u-3', langcode: 'fr' } }, 'application/json');
        return send(res, 404, { message: 'Unable to resolve path' }, 'application/json');
      }
      if (!p.startsWith('/jsonapi')) return send(res, 404, {}, 'text/html');
      if (req.method !== 'GET') {
        assert.equal(req.headers['content-type'], 'application/vnd.api+json');
        if (s.readOnly) return send(res, 405, { errors: [{ status: '405', detail: 'JSON:API is configured to accept only read operations.' }] });
        if (!authed) return send(res, 403, { errors: [{ status: '403' }] });
      }
      const body = raw ? JSON.parse(raw) : null;
      let m;
      if (p === '/jsonapi' || p === '/jsonapi/') {
        const links = { self: { href: '/jsonapi' } };
        for (const t of ['node--article', 'node--page', 'media--image', 'file--file', 'path_alias--path_alias', 'redirect--redirect']) links[t] = { href: '/jsonapi/' + t.replace('--', '/') };
        return send(res, 200, { jsonapi: { version: '1.0' }, data: [], links, ...(authed ? { meta: { links: { me: { meta: { id: 'usr' }, href: '/jsonapi/user/user/usr' } } } } : {}) });
      }
      if (p === '/jsonapi/path_alias/path_alias') return send(res, 200, { data: authed ? s.aliases.filter((a) => a.attributes.alias === q['filter[alias]']).map((a) => ({ type: 'path_alias--path_alias', ...a })) : [] });
      if ((m = /^\/jsonapi\/node\/(\w+)$/.exec(p))) {
        const list = Object.keys(s.nodes).filter((id) => s.nodes[id].type === 'node--' + m[1] && String(s.nodes[id].nid) === q['filter[drupal_internal__nid]']);
        return send(res, 200, { data: list.map(nodeDoc) });
      }
      if ((m = /^\/jsonapi\/(node|media)\/(\w+)\/([\w-]+)$/.exec(p))) {
        const store = m[1] === 'node' ? s.nodes : s.media;
        const e = store[m[3]];
        if (!e || e.type !== `${m[1]}--${m[2]}`) return send(res, 404, { errors: [{ status: '404' }] });
        if (req.method === 'PATCH') {
          assert.equal(body.data.id, m[3]);
          assert.equal(body.data.type, e.type);
          s.patches.push(body.data);
          Object.assign(e.attributes, body.data.attributes || {});
          for (const [k, v] of Object.entries(body.data.relationships || {})) {
            for (const d of [].concat(v.data)) assert.ok(!('drupal_internal__target_id' in (d.meta || {})), 'meta en lecture seule retirée');
            e.relationships[k] = { data: [].concat(v.data).map((d) => ({ ...d, meta: { ...d.meta, drupal_internal__target_id: 99 } })) };
            if (!Array.isArray(v.data)) e.relationships[k].data = e.relationships[k].data[0];
          }
        }
        const doc = { data: { type: e.type, id: m[3], attributes: e.attributes, relationships: e.relationships } };
        if (q.include) {
          doc.included = [];
          for (const rel of q.include.split(',')) for (const d of [].concat(e.relationships[rel]?.data || [])) if (s.files[d.id]) doc.included.push({ type: 'file--file', id: d.id, attributes: s.files[d.id] });
        }
        return send(res, 200, doc);
      }
      if (p === '/jsonapi/redirect/redirect' && req.method === 'GET') {
        return send(res, 200, { data: s.redirects.filter((r) => r.attributes.redirect_source.path === q['filter[redirect_source.path]']) });
      }
      if (p === '/jsonapi/redirect/redirect' && req.method === 'POST') {
        const r = { type: 'redirect--redirect', id: 'r-' + (s.redirects.length + 1), attributes: { enabled: true, ...body.data.attributes } };
        s.redirects.push(r);
        return send(res, 201, { data: r });
      }
      if ((m = /^\/jsonapi\/redirect\/redirect\/([\w-]+)$/.exec(p))) {
        const i = s.redirects.findIndex((r) => r.id === m[1]);
        if (req.method === 'DELETE') {
          s.redirects.splice(i, 1);
          return send(res, 204);
        }
        Object.assign(s.redirects[i].attributes, body.data.attributes);
        return send(res, 200, { data: s.redirects[i] });
      }
      send(res, 404, { errors: [{ status: '404' }] });
    });
  });
  return { server, state: s };
}

async function setup(t, extra = {}) {
  const mock = mockDrupal();
  await new Promise((r) => mock.server.listen(0, '127.0.0.1', r));
  t.after(() => mock.server.close());
  const origin = `http://127.0.0.1:${mock.server.address().port}`;
  const c = new DrupalConnector({ url: origin, connector: 'drupal', user: 'editor', password: 's3cret', ...extra });
  return { c, origin, s: mock.state };
}

test('drupal : valeur Metatag JSON (2.x) et PHP sérialisée (1.x)', () => {
  const j = decodeMetatag('{"title":"Été"}');
  assert.deepEqual(j.tags, { title: 'Été' });
  assert.equal(j.write({ title: 'X' }), '{"title":"X"}');
  const p = decodeMetatag('a:1:{s:5:"title";s:4:"Été";}');
  assert.deepEqual(p.tags, { title: 'Été' });
  assert.equal(p.write({ title: 'Noël' }), 'a:1:{s:5:"title";s:5:"Noël";}');
  assert.deepEqual(decodeMetatag({ value: '{"a":"b"}' }).write({ a: 'c' }), { value: '{"a":"c"}' });
  assert.deepEqual(decodeMetatag(null).tags, {});
});

test('drupal : test(), authentification et mode lecture seule', async (t) => {
  const { c, origin, s } = await setup(t);
  const r = await c.test();
  assert.equal(r.ok, true);
  assert.match(r.details, /article, page/);
  assert.match(r.details, /Redirect module exposed/);
  const bad = new DrupalConnector({ url: origin, user: 'editor', password: 'faux' });
  await assert.rejects(bad.test(), { code: 'auth' });
  await assert.rejects(bad.get({ url: origin + '/blog/mon-article', field: 'h1' }), { code: 'auth' });
  await assert.rejects(new DrupalConnector({ url: origin, user: 'editor' }).test(), { code: 'config' });
  s.readOnly = true;
  await assert.rejects(c.set({ url: origin + '/blog/mon-article', field: 'h1', value: 'x' }), { code: 'config' });
});

test('drupal : URL → nœud (alias, / final, accueil, /node/N, préfixe de langue, inconnue)', async (t) => {
  const { c, origin } = await setup(t);
  assert.deepEqual(await c.resolve(origin + '/blog/mon-article'), { bundle: 'article', uuid: 'u-1' });
  assert.equal((await c.resolve(origin + '/blog/mon-article/')).uuid, 'u-1');
  assert.equal((await c.resolve(origin + '/fr/a-propos')).uuid, 'u-2');
  assert.equal((await c.resolve(origin + '/node/2')).uuid, 'u-2');
  assert.equal((await c.resolve(origin + '/')).uuid, 'u-3');
  await assert.rejects(c.get({ url: origin + '/inconnue', field: 'h1' }), { code: 'not_found' });
  await assert.rejects(c.get({ url: origin + '/tags/seo', field: 'h1' }), { code: 'unsupported' });
  const scoped = new DrupalConnector({ url: origin, user: 'editor', password: 's3cret', bundles: ['page'] });
  await assert.rejects(scoped.get({ url: origin + '/blog/mon-article', field: 'h1' }), { code: 'not_found' });
});

test('drupal : h1, titre SEO, description, canonical, noindex (aller-retour et null)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/blog/mon-article/';
  assert.equal(await c.get({ url, field: 'h1' }), 'Mon article');
  await c.set({ url, field: 'h1', value: 'Titre affiché' });
  assert.equal(await c.get({ url, field: 'h1' }), 'Titre affiché');
  await assert.rejects(c.set({ url, field: 'h1', value: null }), { code: 'unsupported' });

  assert.equal(await c.get({ url, field: 'seo_title' }), null);
  await c.set({ url, field: 'seo_title', value: 'Titre SEO' });
  assert.equal(await c.get({ url, field: 'seo_title' }), 'Titre SEO');
  assert.deepEqual(JSON.parse(s.nodes['u-1'].attributes.field_meta_tags), { description: 'Ancienne description', title: 'Titre SEO' });
  await c.set({ url, field: 'seo_title', value: null });
  assert.equal(await c.get({ url, field: 'seo_title' }), null);

  assert.equal(await c.get({ url, field: 'meta_description' }), 'Ancienne description');
  await c.set({ url, field: 'meta_description', value: 'Nouvelle' });
  assert.equal(await c.get({ url, field: 'meta_description' }), 'Nouvelle');

  await c.set({ url, field: 'canonical', value: 'https://example.com/canon' });
  assert.equal(await c.get({ url, field: 'canonical' }), 'https://example.com/canon');
  await c.set({ url, field: 'canonical', value: null });
  assert.equal(await c.get({ url, field: 'canonical' }), null);

  assert.equal(await c.get({ url, field: 'noindex' }), false);
  await c.set({ url, field: 'noindex', value: true });
  assert.equal(await c.get({ url, field: 'noindex' }), true);
  await c.set({ url, field: 'noindex', value: false });
  assert.equal(await c.get({ url, field: 'noindex' }), false);
  assert.equal(JSON.parse(s.nodes['u-1'].attributes.field_meta_tags).robots, undefined);
  assert.ok(!s.patches.some((d) => 'metatag' in (d.attributes || {})), 'le champ calculé metatag n’est jamais écrit');

  // Metatag 1.x (PHP sérialisé) : le format est conservé, nofollow aussi.
  const page = origin + '/a-propos';
  assert.equal(await c.get({ url: page, field: 'seo_title' }), 'Qui sommes-nous?');
  assert.equal(await c.get({ url: page, field: 'noindex' }), true);
  await c.set({ url: page, field: 'noindex', value: false });
  assert.equal(s.nodes['u-2'].attributes.field_meta_tags, 'a:2:{s:5:"title";s:16:"Qui sommes-nous?";s:6:"robots";s:8:"nofollow";}');

  // Pas de champ Metatag sur le nœud : erreur de configuration explicite.
  await assert.rejects(c.get({ url: origin + '/', field: 'seo_title' }).then(() => c.get({ url: origin + '/', field: 'seo_title' })), (e) => true);
  const other = new DrupalConnector({ url: origin, user: 'editor', password: 's3cret', metatagField: 'field_seo' });
  await assert.rejects(other.get({ url, field: 'seo_title' }), { code: 'config' });
});

test('drupal : alt d’image (champ image, média, image du body)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/blog/mon-article';
  const photo = origin + '/sites/default/files/styles/large/public/2025-01/photo.jpg.webp?itok=abc';
  assert.equal(await c.get({ url, field: 'image_alt', target: photo }), 'Photo');
  await c.set({ url, field: 'image_alt', target: photo, value: 'Nouvelle photo' });
  assert.equal(await c.get({ url, field: 'image_alt', target: photo }), 'Nouvelle photo');
  assert.equal(s.nodes['u-1'].relationships.field_image.data.meta.width, 800, 'méta conservées');
  await c.set({ url, field: 'image_alt', target: photo, value: null });
  assert.equal(await c.get({ url, field: 'image_alt', target: photo }), null);

  const media = origin + '/sites/default/files/media.png';
  assert.equal(await c.get({ url, field: 'image_alt', target: media }), 'Média');
  await c.set({ url, field: 'image_alt', target: media, value: 'Média modifié' });
  assert.equal(s.media['m-1'].relationships.field_media_image.data.meta.alt, 'Média modifié');

  const inline = origin + '/sites/default/files/inline/schema.png';
  assert.equal(await c.get({ url, field: 'image_alt', target: inline }), 'vieux');
  await c.set({ url, field: 'image_alt', target: inline, value: 'Schéma' });
  assert.equal(await c.get({ url, field: 'image_alt', target: inline }), 'Schéma');
  const bodyPatch = s.patches.findLast((d) => d.attributes?.body);
  assert.equal(bodyPatch.attributes.body.format, 'basic_html');
  assert.ok(!('processed' in bodyPatch.attributes.body));
  await assert.rejects(c.get({ url, field: 'image_alt', target: origin + '/x/absente.jpg' }), { code: 'not_found' });
});

test('drupal : redirections (module Redirect)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/ancienne-page/';
  assert.equal(await c.get({ url, field: 'redirect' }), null);
  await c.set({ url, field: 'redirect', value: origin + '/blog/mon-article' });
  assert.deepEqual(s.redirects[0].attributes.redirect_source, { path: 'ancienne-page', query: {} });
  assert.equal(s.redirects[0].attributes.redirect_redirect.uri, 'internal:/blog/mon-article');
  assert.equal(s.redirects[0].attributes.status_code, 301);
  assert.equal(await c.get({ url, field: 'redirect' }), origin + '/blog/mon-article');
  await c.set({ url, field: 'redirect', value: 'https://autre.example/page' });
  assert.equal(await c.get({ url, field: 'redirect' }), 'https://autre.example/page');
  assert.equal(s.redirects.length, 1);
  await c.set({ url, field: 'redirect', value: null });
  assert.equal(await c.get({ url, field: 'redirect' }), null);
  assert.equal(s.redirects.length, 0);
});
