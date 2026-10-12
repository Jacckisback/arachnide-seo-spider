import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JoomlaConnector from '../src/connectors/joomla.mjs';

// Faux Joomla 5 : routes et formes JSON:API de l'API Web Services (api/index.php/v1).
function mockJoomla() {
  const TOKEN = 'tok-123';
  const s = {
    articles: {
      1: {
        title: 'Mon article', alias: 'mon-article', catid: 8, state: 1, metadesc: '', version: 3,
        metadata: '{"robots":"","author":"","rights":""}',
        attribs: '{"article_layout":"","show_title":"","article_page_title":""}',
        images: '{"image_intro":"images/intro.jpg#joomlaImage://local-images/intro.jpg?width=800&height=600","image_intro_alt":"","image_intro_alt_empty":"","image_fulltext":"","image_fulltext_alt":""}',
        introtext: '<p>Intro <img src="images/corps.png" alt="ancien"></p>', fulltext: '<p>Suite</p>',
      },
      2: { title: 'Accueil', alias: 'accueil', catid: 2, state: 1, metadesc: 'Bienvenue', version: 1, metadata: '{"robots":"noindex, nofollow"}', attribs: '{}', images: '{}', introtext: '', fulltext: '' },
      3: { title: 'À propos', alias: 'a-propos', catid: 2, state: 1, metadesc: '', version: 1, metadata: '{}', attribs: '{}', images: '{}', introtext: '', fulltext: '' },
    },
    history: {},
    menus: [
      { id: 101, title: 'Accueil', path: 'home', link: 'index.php?option=com_content&view=article&id=2', type: 'component', home: 1, language: '*', published: 1, params: '{"page_title":""}' },
      { id: 102, title: 'À propos', path: 'a-propos', link: 'index.php?option=com_content&view=article&id=3', type: 'component', home: 0, language: '*', published: 1, params: '{"page_title":"Qui sommes-nous ?"}' },
      { id: 103, title: 'Blog', path: 'blog', link: 'index.php?option=com_content&view=category&layout=blog&id=8', type: 'component', home: 0, language: '*', published: 1, params: '{}' },
    ],
    redirects: [],
    nextRedirect: 1,
    requests: [],
  };
  const snapshot = (id) => {
    const a = s.articles[id];
    (s.history[id] ||= []).unshift({ version_id: Date.now() + Math.random(), save_date: new Date().toISOString(), version_data: { id, ...a } });
  };
  for (const id of Object.keys(s.articles)) snapshot(id);
  const root = () => `http://127.0.0.1:${server.address().port}/`;
  const render = (id) => {
    const a = s.articles[id];
    const images = JSON.parse(a.images);
    for (const k of ['image_intro', 'image_fulltext']) if (images[k]) images[k] = root() + images[k];
    return {
      type: 'articles', id: String(id),
      attributes: { id: Number(id), title: a.title, alias: a.alias, state: a.state, metadesc: a.metadesc, metadata: JSON.parse(a.metadata), images, version: a.version, text: a.introtext + ' ' + a.fulltext },
      relationships: { category: { data: { type: 'categories', id: String(a.catid) } } },
    };
  };
  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/vnd.api+json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      s.requests.push(`${req.method} ${u.pathname}${u.search}`);
      if (!u.pathname.startsWith('/api/index.php/v1/')) return send(res, 404, { errors: [{ title: 'Not found' }] });
      if (req.headers['x-joomla-token'] !== TOKEN) return send(res, 401, { errors: [{ title: 'Forbidden', code: 401 }] });
      const p = u.pathname.slice('/api/index.php/v1'.length);
      const body = raw ? JSON.parse(raw) : null;
      const q = Object.fromEntries(u.searchParams);
      const page = (list) => {
        const off = Number(q['page[offset]'] || 0);
        const lim = Number(q['page[limit]'] || 20);
        return { data: list.slice(off, off + lim), meta: { 'total-pages': Math.ceil(list.length / lim) }, links: off + lim < list.length ? { next: 'x' } : {} };
      };
      let m;
      if (p === '/content/articles' && req.method === 'GET') {
        let ids = Object.keys(s.articles);
        if (q['filter[search]']) ids = ids.filter((id) => (s.articles[id].title + ' ' + s.articles[id].alias).includes(q['filter[search]']));
        return send(res, 200, page(ids.map(render)));
      }
      if ((m = /^\/content\/articles\/(\d+)$/.exec(p))) {
        const a = s.articles[m[1]];
        if (!a) return send(res, 404, { errors: [{ title: 'Resource not found', code: 404 }] });
        if (req.method === 'PATCH') {
          assert.match(req.headers['content-type'], /application\/json/);
          for (const [k, v] of Object.entries(body)) {
            if (k === 'version_note') continue;
            a[k] = ['attribs', 'metadata', 'images'].includes(k) ? JSON.stringify(v) : v;
          }
          a.version++;
          snapshot(m[1]);
        }
        return send(res, 200, { data: render(m[1]) });
      }
      if ((m = /^\/content\/articles\/(\d+)\/contenthistory$/.exec(p))) {
        return send(res, 200, page((s.history[m[1]] || []).map((h) => ({ type: 'history', id: String(h.version_id), attributes: { save_date: h.save_date, version_data: h.version_data } }))));
      }
      if ((m = /^\/content\/categories\/(\d+)$/.exec(p))) return send(res, 200, { data: { type: 'categories', id: m[1], attributes: { alias: m[1] === '8' ? 'blog' : 'uncategorised' } } });
      if (p === '/menus/site/items') return send(res, 200, page(s.menus.map((x) => ({ type: 'items', id: String(x.id), attributes: x }))));
      if (p === '/redirects' && req.method === 'GET') return send(res, 200, page(s.redirects.map((r) => ({ type: 'links', id: String(r.id), attributes: r }))));
      if (p === '/redirects' && req.method === 'POST') {
        const r = { id: s.nextRedirect++, header: 301, ...body };
        s.redirects.push(r);
        return send(res, 200, { data: { type: 'links', id: String(r.id), attributes: r } });
      }
      if ((m = /^\/redirects\/(\d+)$/.exec(p))) {
        const i = s.redirects.findIndex((r) => r.id === Number(m[1]));
        if (i < 0) return send(res, 404, { errors: [{ title: 'Resource not found' }] });
        if (req.method === 'DELETE') {
          s.redirects.splice(i, 1);
          return send(res, 204);
        }
        if (req.method === 'PATCH') Object.assign(s.redirects[i], body);
        return send(res, 200, { data: { type: 'links', id: m[1], attributes: s.redirects[i] } });
      }
      send(res, 404, { errors: [{ title: 'Resource not found' }] });
    });
  });
  return { server, state: s, TOKEN };
}

async function setup(t, extra = {}) {
  const mock = mockJoomla();
  await new Promise((r) => mock.server.listen(0, '127.0.0.1', r));
  t.after(() => mock.server.close());
  const origin = `http://127.0.0.1:${mock.server.address().port}`;
  const c = new JoomlaConnector({ url: origin + '/', connector: 'joomla', token: mock.TOKEN, ...extra });
  return { c, origin, s: mock.state };
}

test('joomla : test() et échec d’authentification', async (t) => {
  const { c, origin } = await setup(t);
  const r = await c.test();
  assert.equal(r.ok, true);
  assert.match(r.details, /3 article/);
  assert.match(r.details, /redirects API available/);
  const bad = new JoomlaConnector({ url: origin, token: 'faux' });
  await assert.rejects(bad.test(), { code: 'auth' });
  await assert.rejects(bad.get({ url: origin + '/blog/mon-article', field: 'h1' }), { code: 'auth' });
  await assert.rejects(new JoomlaConnector({ url: origin }).test(), { code: 'config' });
});

test('joomla : URL → article (alias, / final, accueil, URL non SEF, préfixe de langue, inconnue)', async (t) => {
  const { c, origin } = await setup(t);
  assert.equal((await c.resolve(origin + '/blog/mon-article')).id, 1);
  assert.equal((await c.resolve(origin + '/blog/mon-article/')).id, 1);
  assert.equal((await c.resolve(origin + '/blog/mon-article.html')).id, 1);
  assert.equal((await c.resolve(origin + '/')).id, 2);
  assert.equal((await c.resolve(origin + '/fr/')).id, 2);
  assert.equal((await c.resolve(origin + '/index.php?option=com_content&view=article&id=3:a-propos')).id, 3);
  assert.equal((await c.resolve(origin + '/fr/a-propos')).id, 3);
  assert.equal((await c.resolve(origin + '/index.php/a-propos')).id, 3);
  await assert.rejects(c.get({ url: origin + '/inconnu', field: 'h1' }), { code: 'not_found' });
  await assert.rejects(c.get({ url: origin + '/blog', field: 'h1' }), { code: 'unsupported' });
});

test('joomla : h1, meta description, noindex (aller-retour et null)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/blog/mon-article/';
  assert.equal(await c.get({ url, field: 'h1' }), 'Mon article');
  await c.set({ url, field: 'h1', value: 'Nouveau titre' });
  assert.equal(await c.get({ url, field: 'h1' }), 'Nouveau titre');
  await assert.rejects(c.set({ url, field: 'h1', value: null }), { code: 'unsupported' });

  assert.equal(await c.get({ url, field: 'meta_description' }), null);
  await c.set({ url, field: 'meta_description', value: 'Une description' });
  assert.equal(await c.get({ url, field: 'meta_description' }), 'Une description');
  await c.set({ url, field: 'meta_description', value: null });
  assert.equal(await c.get({ url, field: 'meta_description' }), null);

  assert.equal(await c.get({ url, field: 'noindex' }), false);
  await c.set({ url, field: 'noindex', value: true });
  assert.equal(await c.get({ url, field: 'noindex' }), true);
  assert.equal(JSON.parse(s.articles[1].metadata).robots, 'noindex, follow');
  assert.equal(JSON.parse(s.articles[1].metadata).author, '', 'les autres métadonnées sont conservées');
  await c.set({ url, field: 'noindex', value: false });
  assert.equal(await c.get({ url, field: 'noindex' }), false);
  assert.equal(JSON.parse(s.articles[1].metadata).robots, '');
  // L'accueil est en « noindex, nofollow » : on garde le nofollow.
  assert.equal(await c.get({ url: origin + '/', field: 'noindex' }), true);
  await c.set({ url: origin + '/', field: 'noindex', value: false });
  assert.equal(JSON.parse(s.articles[2].metadata).robots, 'index, nofollow');
  assert.ok(s.requests.some((r) => r.startsWith('PATCH /api/index.php/v1/content/articles/1')));
});

test('joomla : titre SEO (attribs.article_page_title via l’historique) et priorité du menu', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/blog/mon-article';
  assert.equal(await c.get({ url, field: 'seo_title' }), null);
  await c.set({ url, field: 'seo_title', value: 'Titre SEO' });
  assert.equal(await c.get({ url, field: 'seo_title' }), 'Titre SEO');
  assert.equal(JSON.parse(s.articles[1].attribs).article_layout, '', 'les autres réglages sont conservés');
  await c.set({ url, field: 'seo_title', value: null });
  assert.equal(await c.get({ url, field: 'seo_title' }), null);
  // Élément de menu avec « Titre de la page du navigateur » : prioritaire, non modifiable par l'API.
  assert.equal(await c.get({ url: origin + '/a-propos', field: 'seo_title' }), 'Qui sommes-nous ?');
  await assert.rejects(c.set({ url: origin + '/a-propos', field: 'seo_title', value: 'x' }), { code: 'unsupported' });
  // Historique désynchronisé (versions désactivées) : refus explicite.
  s.articles[1].version = 99;
  await assert.rejects(c.get({ url, field: 'seo_title' }), { code: 'unsupported' });
});

test('joomla : alt d’image (image d’introduction et image du texte)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/blog/mon-article';
  const intro = origin + '/images/intro.jpg';
  assert.equal(await c.get({ url, field: 'image_alt', target: intro }), null);
  await c.set({ url, field: 'image_alt', target: intro, value: 'Une intro' });
  assert.equal(await c.get({ url, field: 'image_alt', target: intro }), 'Une intro');
  assert.match(JSON.parse(s.articles[1].images).image_intro, /#joomlaImage:/, 'chemin brut de l’image conservé');
  await c.set({ url, field: 'image_alt', target: intro, value: null });
  assert.equal(await c.get({ url, field: 'image_alt', target: intro }), null);

  const body = origin + '/images/corps.png';
  assert.equal(await c.get({ url, field: 'image_alt', target: body }), 'ancien');
  await c.set({ url, field: 'image_alt', target: body, value: 'Schéma "corps"' });
  assert.equal(await c.get({ url, field: 'image_alt', target: body }), 'Schéma "corps"');
  assert.equal(s.articles[1].fulltext, '<p>Suite</p>');
  await c.set({ url, field: 'image_alt', target: body, value: null });
  assert.equal(await c.get({ url, field: 'image_alt', target: body }), null);
  assert.match(s.articles[1].introtext, /<img src="images\/corps.png">/);
  await assert.rejects(c.get({ url, field: 'image_alt', target: origin + '/images/absente.jpg' }), { code: 'not_found' });
});

test('joomla : redirections (création, lecture, modification, suppression)', async (t) => {
  const { c, origin, s } = await setup(t);
  const url = origin + '/ancienne-page';
  assert.equal(await c.get({ url, field: 'redirect' }), null);
  await c.set({ url, field: 'redirect', value: origin + '/blog/mon-article' });
  assert.equal(s.redirects[0].old_url, '/ancienne-page');
  assert.equal(await c.get({ url, field: 'redirect' }), origin + '/blog/mon-article');
  await c.set({ url, field: 'redirect', value: '/a-propos' });
  assert.equal(await c.get({ url, field: 'redirect' }), '/a-propos');
  assert.equal(s.redirects.length, 1);
  await c.set({ url, field: 'redirect', value: null });
  assert.equal(await c.get({ url, field: 'redirect' }), null);
  assert.equal(s.redirects.length, 0);
});
