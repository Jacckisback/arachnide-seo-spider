import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WordPressConnector from '../src/connectors/wordpress.mjs';
import { ConnectorError } from '../src/connectors/base.mjs';

const USER = 'editor';
const PASS = 'abcd EFGH 1234 ijkl MNOP 5678';

// Faux WordPress : reproduit les routes wp/v2 (forme des réponses de la doc REST) et celles du plugin arachnide/v1.
function fakeWordPress({ plugin = true, pretty = true, admin = true } = {}) {
  const calls = [];
  const db = {
    posts: [
      { id: 10, type: 'post', slug: 'hello-world', path: '/2024/hello-world/', title: 'Hello world', content: '<!-- wp:image --><figure><img src="/wp-content/uploads/2024/01/cat-1024x683.jpg" alt="old" class="wp-image-55"/></figure><!-- /wp:image --><p>Hi</p>', featured_media: 56 },
      { id: 11, type: 'page', slug: 'contact', path: '/about/contact/', title: 'Contact us', content: '<p>Write to us</p>', featured_media: 0 },
      { id: 12, type: 'page', slug: 'accueil', path: '/', title: 'Accueil', content: '', featured_media: 0 },
      { id: 13, type: 'product', slug: 'chaussure-rouge', path: '/produit/chaussure-rouge/', title: 'Chaussure rouge', content: '', featured_media: 0 },
      { id: 14, type: 'post', slug: '%c3%a9t%c3%a9', path: '/%c3%a9t%c3%a9/', title: 'Été', content: '', featured_media: 0 },
    ],
    terms: [{ id: 5, taxonomy: 'category', slug: 'news', path: '/category/news/', name: 'News' }],
    media: [
      { id: 55, source_url: '/wp-content/uploads/2024/01/cat.jpg', alt_text: 'old', sizes: ['cat-1024x683.jpg', 'cat-300x200.jpg'] },
      { id: 56, source_url: '/wp-content/uploads/2024/01/hero-scaled.jpg', alt_text: '', sizes: ['hero-1024x512.jpg'] },
      { id: 57, source_url: '/wp-content/uploads/2023/05/logo.png', alt_text: 'Logo', sizes: [] },
    ],
    meta: {},
    redirects: {},
  };
  const base = { post: 'posts', page: 'pages', product: 'product' };
  let origin;
  const link = (path) => origin + path;
  const postJson = (p) => ({ id: p.id, type: p.type, slug: p.slug, link: link(p.path), title: { raw: p.title, rendered: p.title }, content: { raw: p.content, rendered: p.content }, featured_media: p.featured_media });
  const mediaJson = (m) => ({ id: m.id, source_url: link(m.source_url), alt_text: m.alt_text, media_details: { sizes: Object.fromEntries(m.sizes.map((s, i) => [`s${i}`, { source_url: link(m.source_url.replace(/[^/]+$/, s)) }])) } });
  const fields = (o, q) => (q.get('_fields') ? Object.fromEntries(q.get('_fields').split(',').map((f) => [f, o[f]])) : o);
  const sanitizeSlug = (s) => encodeURIComponent(decodeURIComponent(s).toLowerCase()).toLowerCase();

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const u = new URL(req.url, origin);
    let route = null;
    if (pretty && u.pathname.startsWith('/wp-json')) route = u.pathname.slice('/wp-json'.length) || '/';
    if (u.searchParams.has('rest_route')) route = u.searchParams.get('rest_route');
    const send = (status, json, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(json === undefined ? '' : JSON.stringify(json));
    };
    if (route === null) {
      // Pages publiques : en-tête de découverte de l'API.
      res.writeHead(pretty ? 200 : 200, { link: `<${origin}${pretty ? '/wp-json/' : '/?rest_route=/'}>; rel="https://api.w.org/"` });
      return res.end();
    }
    calls.push({ method: req.method, route, query: Object.fromEntries(u.searchParams) });
    const auth = req.headers.authorization || '';
    const [user, pass] = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString().split(':');
    // Comme WordPress : des identifiants Basic invalides font échouer toutes les routes, index compris.
    if (auth && (user !== USER || pass !== PASS)) return send(401, { code: 'incorrect_password', message: 'The provided password is an invalid application password.', data: { status: 401 } });
    if (route === '/') return send(200, { name: 'Blog', home: origin, url: origin, namespaces: ['wp/v2', ...(plugin ? ['arachnide/v1'] : [])] });
    if (!auth) return send(401, { code: 'incorrect_password', message: 'The provided password is an invalid application password.', data: { status: 401 } });
    const q = u.searchParams;
    const json = body ? JSON.parse(body) : {};
    let m;

    if (route === '/wp/v2/users/me') return send(200, { id: 2, name: 'Ed Itor', slug: 'editor', roles: [admin ? 'administrator' : 'editor'], capabilities: { edit_posts: true, manage_options: admin } });
    if (route === '/wp/v2/settings') return admin ? send(200, { title: 'Blog', show_on_front: 'page', page_on_front: 12, page_for_posts: 0 }) : send(403, { code: 'rest_forbidden', message: 'Sorry', data: { status: 403 } });
    if (route === '/wp/v2/types') {
      return send(200, {
        post: { slug: 'post', rest_base: 'posts', rest_namespace: 'wp/v2' },
        page: { slug: 'page', rest_base: 'pages', rest_namespace: 'wp/v2' },
        attachment: { slug: 'attachment', rest_base: 'media', rest_namespace: 'wp/v2' },
        product: { slug: 'product', rest_base: 'product', rest_namespace: 'wp/v2' },
        wp_block: { slug: 'wp_block', rest_base: 'blocks', rest_namespace: 'wp/v2' },
      });
    }
    if (route === '/wp/v2/taxonomies') return send(200, { category: { slug: 'category', rest_base: 'categories', rest_namespace: 'wp/v2', visibility: { public: true } }, post_tag: { slug: 'post_tag', rest_base: 'tags', rest_namespace: 'wp/v2', visibility: { public: true } } });
    if ((m = /^\/wp\/v2\/(posts|pages|product)$/.exec(route))) {
      const type = Object.keys(base).find((k) => base[k] === m[1]);
      return send(200, db.posts.filter((p) => p.type === type && (!q.get('slug') || p.slug === sanitizeSlug(q.get('slug')))).map((p) => fields(postJson(p), q)));
    }
    if ((m = /^\/wp\/v2\/(posts|pages|product)\/(\d+)$/.exec(route))) {
      const p = db.posts.find((x) => base[x.type] === m[1] && x.id === +m[2]);
      if (!p) return send(404, { code: 'rest_post_invalid_id', message: 'Invalid post ID.', data: { status: 404 } });
      if (req.method === 'POST') {
        if (json.title !== undefined) p.title = json.title;
        if (json.content !== undefined) p.content = json.content;
      }
      return send(200, fields(postJson(p), q));
    }
    if ((m = /^\/wp\/v2\/(categories|tags)$/.exec(route))) {
      const tax = m[1] === 'categories' ? 'category' : 'post_tag';
      return send(200, db.terms.filter((t) => t.taxonomy === tax && t.slug === sanitizeSlug(q.get('slug') || '')).map((t) => fields({ id: t.id, link: link(t.path), name: t.name, slug: t.slug }, q)));
    }
    if ((m = /^\/wp\/v2\/categories\/(\d+)$/.exec(route))) {
      const t = db.terms.find((x) => x.id === +m[1]);
      if (!t) return send(404, { code: 'rest_term_invalid', message: 'Term does not exist.', data: { status: 404 } });
      if (req.method === 'POST' && json.name !== undefined) t.name = json.name;
      return send(200, { id: t.id, name: t.name, link: link(t.path) });
    }
    if (route === '/wp/v2/media') {
      const s = (q.get('search') || '').toLowerCase();
      return send(200, db.media.filter((x) => x.source_url.toLowerCase().includes(s)).map(mediaJson));
    }
    if ((m = /^\/wp\/v2\/media\/(\d+)$/.exec(route))) {
      const x = db.media.find((y) => y.id === +m[1]);
      if (!x) return send(404, { code: 'rest_post_invalid_id', message: 'Invalid post ID.', data: { status: 404 } });
      if (req.method === 'POST' && json.alt_text !== undefined) x.alt_text = json.alt_text;
      return send(200, mediaJson(x));
    }

    if (route.startsWith('/arachnide/')) {
      if (!plugin) return send(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.', data: { status: 404 } });
      if (route === '/arachnide/v1/status') return send(200, { version: '1.0.0', wp_version: '6.8.3', php_version: '8.3.0', seo_plugin: 'yoast', seo_plugin_version: '26.1', redirects: 'native', can_manage_redirects: admin, term_meta: true });
      if (route === '/arachnide/v1/resolve') {
        const n = q.get('url').replace(/\/+$/, '');
        if (n === origin) return send(200, { kind: 'post', id: 12, subtype: 'page', rest_base: 'pages', rest_namespace: 'wp/v2' });
        const p = db.posts.find((x) => link(x.path).replace(/\/+$/, '') === n);
        if (p) return send(200, { kind: 'post', id: p.id, subtype: p.type, rest_base: base[p.type], rest_namespace: 'wp/v2' });
        const t = db.terms.find((x) => link(x.path).replace(/\/+$/, '') === n);
        if (t) return send(200, { kind: 'term', id: t.id, subtype: t.taxonomy, rest_base: 'categories', rest_namespace: 'wp/v2' });
        return send(404, { code: 'arachnide_not_found', message: 'No post, page or term matches this URL.', data: { status: 404 } });
      }
      if (route === '/arachnide/v1/meta') {
        const kind = q.get('kind') || json.kind;
        const id = +(q.get('id') || json.id);
        const exists = kind === 'term' ? db.terms.some((t) => t.id === id) : db.posts.some((p) => p.id === id);
        if (!exists) return send(404, { code: 'arachnide_not_found', message: 'Post not found.', data: { status: 404 } });
        const k = `${kind}:${id}`;
        db.meta[k] ??= {};
        if (req.method === 'POST') {
          if (kind === 'term' && json.field === 'canonical' && json.value === 'https://unsupported.example/') return send(501, { code: 'arachnide_unsupported', message: 'All in One SEO Lite does not store SEO data for terms (AIOSEO Pro required).', data: { status: 501 } });
          if (json.value === null) delete db.meta[k][json.field];
          else db.meta[k][json.field] = json.value;
          return send(200, { [json.field]: db.meta[k][json.field] ?? null });
        }
        const o = { seo_plugin: 'yoast' };
        for (const f of ['seo_title', 'meta_description', 'canonical', 'noindex']) o[f] = db.meta[k][f] ?? null;
        return send(200, o);
      }
      if (route === '/arachnide/v1/redirect') {
        if (!admin) return send(403, { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.', data: { status: 403 } });
        if (req.method === 'POST') {
          if (json.target === null) delete db.redirects[json.source];
          else db.redirects[json.source] = json.target;
          return send(200, { source: json.source, target: db.redirects[json.source] ?? null });
        }
        return send(200, { source: q.get('source'), target: db.redirects[q.get('source')] ?? null, backend: 'native' });
      }
    }
    return send(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.', data: { status: 404 } });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, origin, db, calls });
    }),
  );
}

async function withWp(opts, fn) {
  const wp = await fakeWordPress(opts);
  try {
    const c = new WordPressConnector({ url: wp.origin + '/', connector: 'wordpress', user: USER, appPassword: PASS, ...(opts.site || {}) });
    await fn(c, wp);
  } finally {
    wp.server.close();
  }
}

const roundTrip = async (c, change, value) => {
  await c.set({ ...change, value });
  assert.deepEqual(await c.get(change), value);
};

test('WordPress : test() détecte le compte et le plugin compagnon', async () => {
  await withWp({}, async (c) => {
    const r = await c.test();
    assert.equal(r.ok, true);
    assert.match(r.details, /Ed Itor \(administrator\)/);
    assert.match(r.details, /SEO plugin: yoast 26\.1/);
    assert.doesNotMatch(r.details, new RegExp(PASS));
  });
});

test('WordPress : authentification Basic par mot de passe d’application, échec → auth', async () => {
  await withWp({}, async (c, wp) => {
    await c.test();
    const bad = new WordPressConnector({ url: wp.origin, user: USER, appPassword: 'wrong' });
    await assert.rejects(bad.test(), (e) => e instanceof ConnectorError && e.code === 'auth' && /Application Passwords/.test(e.hint));
    const none = new WordPressConnector({ url: wp.origin, user: USER });
    await assert.rejects(none.test(), (e) => e.code === 'config');
  });
});

test('WordPress (plugin) : URL → contenu, accueil, slash final, terme ; champs SEO aller-retour', async () => {
  await withWp({}, async (c, wp) => {
    const post = wp.origin + '/2024/hello-world/';
    for (const [field, value] of [['seo_title', 'Hello | Blog'], ['meta_description', 'A greeting.'], ['canonical', wp.origin + '/2024/hello-world/'], ['noindex', true], ['noindex', false]]) {
      await roundTrip(c, { url: post, field }, value);
    }
    assert.equal(await c.get({ url: wp.origin + '/2024/hello-world', field: 'seo_title' }), 'Hello | Blog');
    await roundTrip(c, { url: post, field: 'seo_title' }, null);
    await roundTrip(c, { url: post, field: 'noindex' }, null);
    // Accueil = page statique 12
    await roundTrip(c, { url: wp.origin + '/', field: 'meta_description' }, 'Home description');
    assert.equal(wp.db.meta['post:12'].meta_description, 'Home description');
    // Terme
    await roundTrip(c, { url: wp.origin + '/category/news/', field: 'seo_title' }, 'News | Blog');
    assert.equal(wp.db.meta['term:5'].seo_title, 'News | Blog');
    await assert.rejects(c.set({ url: wp.origin + '/category/news/', field: 'canonical', value: 'https://unsupported.example/' }), (e) => e.code === 'unsupported' && /AIOSEO Pro/.test(e.message));
    await assert.rejects(c.get({ url: wp.origin + '/nope/', field: 'seo_title' }), (e) => e.code === 'not_found');
  });
});

test('WordPress : h1 (titre brut, context=edit) pour article, page, produit et terme', async () => {
  await withWp({}, async (c, wp) => {
    assert.equal(await c.get({ url: wp.origin + '/about/contact', field: 'h1' }), 'Contact us');
    await roundTrip(c, { url: wp.origin + '/about/contact/', field: 'h1' }, 'Contact our team');
    await roundTrip(c, { url: wp.origin + '/produit/chaussure-rouge/', field: 'h1' }, 'Red shoe');
    await roundTrip(c, { url: wp.origin + '/category/news/', field: 'h1' }, 'Latest news');
    await assert.rejects(c.set({ url: wp.origin + '/about/contact/', field: 'h1', value: null }), (e) => e.code === 'unsupported');
    assert.ok(wp.calls.some((x) => x.route === '/wp/v2/pages/11' && x.query.context === 'edit'));
  });
});

test('WordPress : image_alt dans le contenu, puis dans la médiathèque (image mise en avant)', async () => {
  await withWp({}, async (c, wp) => {
    const url = wp.origin + '/2024/hello-world/';
    const inContent = { url, field: 'image_alt', target: wp.origin + '/wp-content/uploads/2024/01/cat-1024x683.jpg' };
    assert.equal(await c.get(inContent), 'old');
    await roundTrip(c, inContent, 'A grey cat on a sofa');
    assert.match(wp.db.posts[0].content, /alt="A grey cat on a sofa"/);
    assert.match(wp.db.posts[0].content, /<!-- wp:image -->/);
    await roundTrip(c, inContent, null);
    const featured = { url, field: 'image_alt', target: wp.origin + '/wp-content/uploads/2024/01/hero-1024x512.jpg' };
    assert.equal(await c.get(featured), null);
    await roundTrip(c, featured, 'Hero banner');
    assert.equal(wp.db.media[1].alt_text, 'Hero banner');
    const library = { url, field: 'image_alt', target: wp.origin + '/wp-content/uploads/2023/05/logo.png' };
    await roundTrip(c, library, 'Company logo');
    await assert.rejects(c.get({ url, field: 'image_alt', target: '/img/none.jpg' }), (e) => e.code === 'not_found');
  });
});

test('WordPress : redirections via le plugin (création, lecture, suppression)', async () => {
  await withWp({}, async (c, wp) => {
    const change = { url: wp.origin + '/old-page/', field: 'redirect' };
    assert.equal(await c.get(change), null);
    await roundTrip(c, change, wp.origin + '/about/contact/');
    assert.equal(wp.db.redirects['/old-page/'], wp.origin + '/about/contact/');
    await roundTrip(c, change, null);
  });
  await withWp({ admin: false }, async (c, wp) => {
    await assert.rejects(c.get({ url: wp.origin + '/old/', field: 'redirect' }), (e) => e.code === 'auth');
  });
});

test('WordPress sans plugin : résolution par slug + lien confirmé, champs SEO non pris en charge', async () => {
  await withWp({ plugin: false }, async (c, wp) => {
    assert.match((await c.test()).details, /not installed/);
    assert.equal(await c.get({ url: wp.origin + '/about/contact/', field: 'h1' }), 'Contact us');
    assert.equal(await c.get({ url: wp.origin + '/produit/chaussure-rouge', field: 'h1' }), 'Chaussure rouge');
    assert.equal(await c.get({ url: wp.origin + '/%C3%A9t%C3%A9/', field: 'h1' }), 'Été');
    assert.equal(await c.get({ url: wp.origin + '/category/news/', field: 'h1' }), 'News');
    // Accueil : page statique lue dans /wp/v2/settings
    assert.equal(await c.get({ url: wp.origin, field: 'h1' }), 'Accueil');
    // Même slug, autre chemin : refusé par la comparaison des liens
    await assert.rejects(c.get({ url: wp.origin + '/contact/', field: 'h1' }), (e) => e.code === 'not_found');
    await assert.rejects(c.get({ url: wp.origin + '/2024/hello-world/', field: 'seo_title' }), (e) => e.code === 'unsupported' && /arachnide-connector/.test(e.hint));
    await assert.rejects(c.set({ url: wp.origin + '/old/', field: 'redirect', value: wp.origin + '/' }), (e) => e.code === 'unsupported');
    assert.ok(!wp.calls.some((x) => x.route === '/wp/v2/blocks'));
  });
  // Accueil « derniers articles » quand les réglages ne sont pas lisibles
  await withWp({ plugin: false, admin: false }, async (c, wp) => {
    await assert.rejects(c.get({ url: wp.origin + '/', field: 'h1' }), (e) => e.code === 'unsupported');
  });
});

test('WordPress sans permaliens : découverte de ?rest_route= par l’en-tête Link', async () => {
  await withWp({ pretty: false }, async (c, wp) => {
    assert.equal(await c.restRoot(), wp.origin + '/?rest_route=');
    assert.equal(await c.get({ url: wp.origin + '/2024/hello-world/', field: 'h1' }), 'Hello world');
    await roundTrip(c, { url: wp.origin + '/2024/hello-world/', field: 'meta_description' }, 'Desc');
    assert.ok(wp.calls.some((x) => x.route === '/arachnide/v1/meta' && x.query.kind === 'post'));
  });
  await withWp({ site: { restBase: 'http://127.0.0.1:1/wp-json/' } }, async (c) => {
    assert.equal(await c.restRoot(), 'http://127.0.0.1:1/wp-json');
  });
});
