import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import PrestaShopConnector from '../src/connectors/prestashop.mjs';

// Faux Webservice PrestaShop : lecture JSON (output_format=JSON, language=N), écriture XML (PATCH partiel ou PUT complet).
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const NODES = { products: 'product', categories: 'category', content_management_system: 'content', manufacturers: 'manufacturer' };
const READONLY = { products: ['manufacturer_name', 'quantity', 'new'], categories: ['level_depth', 'nb_products_recursive'], manufacturers: ['link_rewrite'], content_management_system: [] };
const unCdata = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '');

function mockPrestaShop({ patch = true } = {}) {
  const L = (fr, en = '') => ({ 1: fr, 2: en });
  const s = {
    products: {
      12: {
        name: L('Chaussure rouge', 'Red shoe'), meta_title: L(''), meta_description: L('Desc FR', 'Desc EN'), link_rewrite: L('chaussure-rouge', 'red-shoe'),
        description: L('<p><img src="/img/cms/semelle.jpg" alt="vieux"></p>'), description_short: L(''), price: '10.000000', manufacturer_name: 'Acme', quantity: '5', new: '0',
      },
    },
    categories: { 3: { name: L('Chaussures', 'Shoes'), meta_title: L(''), meta_description: L(''), link_rewrite: L('chaussures', 'shoes'), description: L(''), additional_description: L(''), level_depth: '2', nb_products_recursive: '1', active: '1' } },
    content_management_system: { 4: { meta_title: L('Livraison', 'Delivery'), head_seo_title: L(''), meta_description: L(''), link_rewrite: L('livraison', 'delivery'), content: L('<p>Texte</p>') } },
    manufacturers: { 5: { name: 'Acme', meta_title: L(''), meta_description: L(''), description: L(''), short_description: L(''), link_rewrite: 'acme', active: '1' } },
    requests: [],
  };
  const xmlOf = (resource, id) => {
    const o = s[resource][id];
    const fields = Object.entries({ id, ...o }).map(([k, v]) =>
      v && typeof v === 'object'
        ? `<${k}>${Object.entries(v).map(([l, x]) => `<language id="${l}" xlink:href="http://shop/api/languages/${l}"><![CDATA[${x}]]></language>`).join('')}</${k}>`
        : `<${k}><![CDATA[${v}]]></${k}>`,
    );
    const assoc = resource === 'products' ? '<associations><categories nodeType="category" api="categories"><category xlink:href="x"><id><![CDATA[3]]></id></category></categories></associations>' : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n<${NODES[resource]}>\n${fields.join('\n')}\n${assoc}</${NODES[resource]}>\n</prestashop>`;
  };
  const parseXml = (resource, xml) => {
    const node = NODES[resource];
    const inner = new RegExp(`<${node}>([\\s\\S]*)</${node}>`).exec(xml)[1].replace(/<associations>[\s\S]*<\/associations>/, '');
    const out = {};
    for (const m of inner.matchAll(/<(\w+)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const body = m[2] || '';
      if (/<language\b/.test(body)) {
        out[m[1]] = {};
        for (const l of body.matchAll(/<language id="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/language>)/g)) out[m[1]][l[1]] = unCdata(l[2] || '');
      } else out[m[1]] = unCdata(body);
    }
    return out;
  };
  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'psws-version': '8.2.0' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const q = Object.fromEntries(u.searchParams);
      s.requests.push(`${req.method} ${u.pathname}`);
      const [user, pass] = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':');
      if (user !== KEY || pass !== '') return send(res, 401, { errors: [{ code: 18, message: 'Invalid authentication key format' }] });
      const json = q.output_format === 'JSON';
      let m;
      if (u.pathname === '/api/languages') return send(res, 200, { languages: [{ id: 1, iso_code: 'fr', active: '1' }, { id: 2, iso_code: 'en', active: '1' }] });
      if (u.pathname === '/api/configurations') return send(res, 200, { configurations: [{ name: 'PS_LANG_DEFAULT', value: '1' }] });
      if ((m = /^\/api\/(\w+)$/.exec(u.pathname)) && s[m[1]] && req.method === 'GET') {
        let ids = Object.keys(s[m[1]]);
        const f = /^\[(.*)\]$/.exec(q['filter[link_rewrite]'] || '')?.[1];
        if (f) ids = ids.filter((id) => Object.values(s[m[1]][id].link_rewrite).includes(f));
        if (!ids.length) return send(res, 200, []);
        return send(res, 200, { [m[1]]: ids.map((id) => ({ id: Number(id) })) });
      }
      if ((m = /^\/api\/(\w+)\/(\d+)$/.exec(u.pathname)) && s[m[1]]) {
        const [, resource, id] = m;
        const o = s[resource][id];
        if (!o) return send(res, 404, { errors: [{ code: 87, message: `Id(s) not exists: ${id}` }] });
        if (req.method === 'GET' && json) {
          const lang = q.language;
          const out = { id: Number(id) };
          for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === 'object' ? (lang ? v[lang] : Object.entries(v).map(([l, x]) => ({ id: l, value: x }))) : v;
          return send(res, 200, { [NODES[resource]]: out });
        }
        if (req.method === 'GET') return send(res, 200, xmlOf(resource, id), 'text/xml');
        assert.match(req.headers['content-type'], /xml/);
        if (req.method === 'PATCH' && !patch) return send(res, 405, { errors: [{ code: 23, message: 'Method PATCH is not valid' }] });
        const data = parseXml(resource, raw);
        assert.equal(data.id, id);
        for (const k of READONLY[resource]) if (k in data && req.method === 'PUT') return send(res, 400, { errors: [{ code: 93, message: `parameter "${k}" not writable. Please remove this attribute of this XML` }] });
        if (req.method === 'PUT') {
          // PUT : tout champ absent est vidé (comme WebserviceRequest::saveEntityFromXml).
          for (const k of Object.keys(o)) if (!(k in data) && !READONLY[resource].includes(k)) o[k] = typeof o[k] === 'object' ? {} : null;
        }
        for (const [k, v] of Object.entries(data)) if (k !== 'id') o[k] = typeof v === 'object' ? { ...o[k], ...v } : v;
        return send(res, 200, xmlOf(resource, id), 'text/xml');
      }
      send(res, 404, { errors: [{ code: 0, message: 'not found' }] });
    });
  });
  return { server, state: s };
}

async function setup(t, opts = {}, extra = {}) {
  const mock = mockPrestaShop(opts);
  await new Promise((r) => mock.server.listen(0, '127.0.0.1', r));
  t.after(() => mock.server.close());
  const origin = `http://127.0.0.1:${mock.server.address().port}`;
  const c = new PrestaShopConnector({ url: origin + '/', connector: 'prestashop', apiKey: KEY, ...extra });
  return { c, origin, s: mock.state };
}

test('prestashop : test() et échec d’authentification', async (t) => {
  const { c, origin } = await setup(t);
  const r = await c.test();
  assert.equal(r.ok, true);
  assert.match(r.details, /fr\(1\), en\(2\)/);
  await assert.rejects(new PrestaShopConnector({ url: origin, apiKey: 'WRONG' }).test(), { code: 'auth' });
  await assert.rejects(new PrestaShopConnector({ url: origin, apiKey: 'WRONG' }).get({ url: origin + '/12-chaussure-rouge.html', field: 'h1' }), { code: 'auth' });
  await assert.rejects(new PrestaShopConnector({ url: origin }).test(), { code: 'config' });
});

test('prestashop : URL → ressource (produit, catégorie, CMS, marque, langue, URL non simplifiée, inconnue)', async (t) => {
  const { c, origin } = await setup(t);
  assert.deepEqual(await c.resolve(origin + '/fr/chaussures/12-chaussure-rouge.html'), { resource: 'products', id: '12', lang: '1' });
  assert.deepEqual(await c.resolve(origin + '/en/shoes/12-45-red-shoe.html'), { resource: 'products', id: '12', lang: '2' });
  assert.deepEqual(await c.resolve(origin + '/3-chaussures/'), { resource: 'categories', id: '3', lang: '1' });
  assert.deepEqual(await c.resolve(origin + '/content/4-livraison'), { resource: 'content_management_system', id: '4', lang: '1' });
  assert.deepEqual(await c.resolve(origin + '/en/brand/5-acme'), { resource: 'manufacturers', id: '5', lang: '2' });
  assert.deepEqual(await c.resolve(origin + '/5_acme'), { resource: 'manufacturers', id: '5', lang: '1' });
  assert.deepEqual(await c.resolve(origin + '/index.php?id_product=12&controller=product&id_lang=2'), { resource: 'products', id: '12', lang: '2' });
  assert.deepEqual(await c.resolve(origin + '/fr/livraison'), { resource: 'content_management_system', id: '4', lang: '1' });
  await assert.rejects(c.get({ url: origin + '/99-inconnu.html', field: 'h1' }), { code: 'not_found' });
  await assert.rejects(c.get({ url: origin + '/', field: 'h1' }), { code: 'not_found' });
});

test('prestashop : PATCH (8.1+) — titre SEO, description, h1 par langue, null', async (t) => {
  const { c, origin, s } = await setup(t);
  const fr = origin + '/fr/chaussures/12-chaussure-rouge.html';
  const en = origin + '/en/shoes/12-red-shoe.html';
  assert.equal(await c.get({ url: fr, field: 'h1' }), 'Chaussure rouge');
  assert.equal(await c.get({ url: en, field: 'meta_description' }), 'Desc EN');
  assert.equal(await c.get({ url: fr, field: 'seo_title' }), null);
  await c.set({ url: fr, field: 'seo_title', value: 'Chaussure rouge en cuir & <daim> ]]> !' });
  assert.equal(await c.get({ url: fr, field: 'seo_title' }), 'Chaussure rouge en cuir & <daim> ]]> !');
  assert.equal(s.products[12].meta_title[2], '', 'l’autre langue est intacte');
  await c.set({ url: fr, field: 'seo_title', value: null });
  assert.equal(await c.get({ url: fr, field: 'seo_title' }), null);
  await c.set({ url: en, field: 'meta_description', value: 'New EN' });
  assert.equal(await c.get({ url: en, field: 'meta_description' }), 'New EN');
  assert.equal(s.products[12].meta_description[1], 'Desc FR');
  await c.set({ url: en, field: 'h1', value: 'Crimson shoe' });
  assert.equal(await c.get({ url: en, field: 'h1' }), 'Crimson shoe');
  await assert.rejects(c.set({ url: en, field: 'h1', value: null }), { code: 'unsupported' });
  assert.ok(s.requests.includes('PATCH /api/products/12'));
  assert.ok(!s.requests.includes('PUT /api/products/12'));
  assert.equal(s.products[12].price, '10.000000');

  // CMS : <title> = head_seo_title, H1 = meta_title. Marque : name non multilingue.
  const cms = origin + '/content/4-livraison';
  assert.equal(await c.get({ url: cms, field: 'h1' }), 'Livraison');
  await c.set({ url: cms, field: 'seo_title', value: 'Livraison gratuite' });
  assert.equal(s.content_management_system[4].head_seo_title[1], 'Livraison gratuite');
  assert.equal(s.content_management_system[4].meta_title[1], 'Livraison');
  const brand = origin + '/brand/5-acme';
  await c.set({ url: brand, field: 'h1', value: 'Acme Corp' });
  assert.equal(await c.get({ url: brand, field: 'h1' }), 'Acme Corp');
});

test('prestashop : repli PUT complet (PrestaShop 1.7 / 8.0) sans champs en lecture seule', async (t) => {
  const { c, origin, s } = await setup(t, { patch: false });
  const url = origin + '/12-chaussure-rouge.html';
  await c.set({ url, field: 'meta_description', value: 'Nouvelle desc' });
  assert.equal(await c.get({ url, field: 'meta_description' }), 'Nouvelle desc');
  assert.equal(s.products[12].meta_description[2], 'Desc EN');
  assert.equal(s.products[12].price, '10.000000', 'les autres champs sont renvoyés');
  assert.equal(s.products[12].name[1], 'Chaussure rouge');
  assert.ok(s.requests.includes('PUT /api/products/12'));
  await c.set({ url, field: 'seo_title', value: null });
  assert.equal(await c.get({ url, field: 'seo_title' }), null);
  const cat = origin + '/3-chaussures';
  await c.set({ url: cat, field: 'seo_title', value: 'Toutes nos chaussures' });
  assert.equal(await c.get({ url: cat, field: 'seo_title' }), 'Toutes nos chaussures');
  assert.equal(s.categories[3].active, '1');
  const brand = origin + '/en/brand/5-acme';
  await c.set({ url: brand, field: 'h1', value: 'Acme Inc' });
  assert.equal(s.manufacturers[5].name, 'Acme Inc');
});

test('prestashop : alt d’image dans la description', async (t) => {
  for (const patch of [true, false]) {
    const { c, origin, s } = await setup(t, { patch });
    const url = origin + '/12-chaussure-rouge.html';
    const img = origin + '/img/cms/semelle.jpg';
    assert.equal(await c.get({ url, field: 'image_alt', target: img }), 'vieux');
    await c.set({ url, field: 'image_alt', target: img, value: 'Semelle "crantée"' });
    assert.equal(await c.get({ url, field: 'image_alt', target: img }), 'Semelle "crantée"');
    await c.set({ url, field: 'image_alt', target: img, value: null });
    assert.equal(await c.get({ url, field: 'image_alt', target: img }), null);
    assert.equal(s.products[12].description[1], '<p><img src="/img/cms/semelle.jpg"></p>');
    await assert.rejects(c.get({ url, field: 'image_alt', target: origin + '/img/p/1/2/12-large.jpg' }), { code: 'not_found' });
  }
});
