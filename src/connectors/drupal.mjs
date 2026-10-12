// Connecteur Drupal 9 / 10 / 11 : module JSON:API du cœur (écritures à autoriser) + authentification HTTP Basic
// (module basic_auth du cœur). Champs SEO via le module Metatag (champ de type « metatag »), redirections via le
// module Redirect (entité redirect--redirect exposée par JSON:API).
//
// Docs :
//   JSON:API (lecture, filtres, include)   https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/api-overview
//   Mises à jour (PATCH)                    https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/updating-existing-resources-patch
//   Création / suppression                  https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/creating-new-resources-post
//                                           https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/removing-resources-delete
//   Filtres                                 https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/filtering
//   Authentification Basic                  https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/what-jsonapi-does-and-does-not-do#s-authentication
//   Decoupled Router (facultatif)           https://www.drupal.org/project/decoupled_router
//   Metatag 2.x (stockage JSON, champ « value » unique, aplati par JSON:API)  https://www.drupal.org/project/metatag
//   Redirect (entité redirect, champs redirect_source / redirect_redirect)    https://www.drupal.org/project/redirect
import { Connector, ConnectorError, setImageAltInHtml, getImageAltInHtml } from './base.mjs';

const JSONAPI = 'application/vnd.api+json';
const LANG = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;
const METATAG_FIELDS = ['field_meta_tags', 'field_metatag', 'field_metatags', 'field_meta_tag', 'field_seo'];
const META_KEYS = { seo_title: 'title', meta_description: 'description', canonical: 'canonical_url' };
const WRITE_HINT = 'Enable writes in Configuration > Web services > JSON:API ("Accept all JSON:API create, read, update, and delete operations").';

// --- Valeur du champ Metatag : JSON (Metatag 2.x) ou tableau PHP sérialisé (Metatag 1.x) ---------------------------

function phpUnserialize(str) {
  const buf = Buffer.from(str, 'utf8');
  let i = 0;
  const until = (ch) => {
    const j = buf.indexOf(ch, i);
    const s = buf.toString('utf8', i, j);
    i = j + 1;
    return s;
  };
  const read = () => {
    const t = String.fromCharCode(buf[i]);
    i += 2;
    if (t === 'N') return null;
    if (t === 'b') return until(';') === '1';
    if (t === 'i' || t === 'd') return Number(until(';'));
    if (t === 's') {
      const len = Number(until(':'));
      const s = buf.toString('utf8', i + 1, i + 1 + len);
      i += len + 3;
      return s;
    }
    if (t === 'a') {
      const n = Number(until(':'));
      i++; // {
      const o = {};
      for (let k = 0; k < n; k++) {
        const key = read();
        o[key] = read();
      }
      i++; // }
      return o;
    }
    throw new Error('unsupported PHP serialization');
  };
  return read();
}

function phpSerialize(v) {
  if (v === null || v === undefined) return 'N;';
  if (typeof v === 'boolean') return `b:${v ? 1 : 0};`;
  if (typeof v === 'number') return Number.isInteger(v) ? `i:${v};` : `d:${v};`;
  if (typeof v === 'object') {
    const e = Object.entries(v);
    return `a:${e.length}:{${e.map(([k, x]) => (/^\d+$/.test(k) ? `i:${k};` : phpSerialize(String(k))) + phpSerialize(x)).join('')}}`;
  }
  const s = String(v);
  return `s:${Buffer.byteLength(s, 'utf8')}:"${s}";`;
}

// Lit l'attribut JSON:API du champ metatag → { tags, write(tags) } (write reproduit la forme et le format lus).
export function decodeMetatag(attr) {
  let item = Array.isArray(attr) ? attr[0] : attr;
  const wrapped = item && typeof item === 'object' && 'value' in item;
  let raw = wrapped ? item.value : item;
  let php = false;
  let tags = {};
  if (raw && typeof raw === 'object') tags = { ...raw };
  else if (typeof raw === 'string' && raw.trim()) {
    if (/^a:\d+:\{/.test(raw)) {
      php = true;
      tags = phpUnserialize(raw) || {};
    } else {
      try {
        tags = JSON.parse(raw) || {};
      } catch {
        tags = {};
      }
    }
  }
  const write = (t) => {
    const s = php ? phpSerialize(t) : JSON.stringify(t);
    const v = wrapped ? { value: s } : s;
    return Array.isArray(attr) ? [v] : v;
  };
  return { tags, write };
}

// Robots : « noindex, nofollow » (chaîne) ou { index: 'index', noindex: 'noindex' } (forme des cases à cocher).
const robotsList = (r) => {
  if (!r) return [];
  if (typeof r === 'object') return Object.values(r).filter((x) => x && x !== '0').map(String);
  return String(r).split(',').map((s) => s.trim()).filter(Boolean);
};

const fileOf = (s) => {
  try {
    return decodeURIComponent(new URL(String(s), 'http://x').pathname.split('/').pop() || '')
      .replace(/(\.[a-z0-9]+)\.(webp|avif)$/i, '$1') // dérivés WebP / AVIF « photo.jpg.webp »
      .toLowerCase();
  } catch {
    return String(s).toLowerCase();
  }
};

const asList = (d) => (Array.isArray(d) ? d : d ? [d] : []);

export default class DrupalConnector extends Connector {
  static id = 'drupal';
  static label = 'Drupal';
  static fields = ['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    user: 'Drupal username with permission to edit the content (and "administer redirects" for redirects)',
    password: 'Password of that user, sent with HTTP Basic auth (core module basic_auth) (env: ARACHNIDE_DRUPAL_PASSWORD)',
    bundles: 'Optional list of node bundles to search, e.g. ["article", "page"] (default: all node types listed by /jsonapi)',
    metatagField: 'Optional machine name of the Metatag field (default: auto-detected, usually field_meta_tags)',
    apiBase: 'Optional JSON:API root, e.g. https://example.com/jsonapi (default: <site url>/jsonapi)',
  };

  constructor(site, opts) {
    super(site, opts);
    const root = new URL(site.url);
    this.basePath = root.pathname.replace(/\/+$/, '');
    this.root = `${root.origin}${this.basePath}`;
    this.api = String(site.apiBase || `${this.root}/jsonapi`).replace(/\/+$/, '');
  }

  async req(url, opts = {}) {
    if (!this.site.user || !this.site.password) {
      throw new ConnectorError('config', 'Drupal: missing user or password.', 'Set "user" and "password" (e.g. "env:ARACHNIDE_DRUPAL_PASSWORD") in the site config.');
    }
    const auth = 'Basic ' + Buffer.from(`${this.site.user}:${this.site.password}`).toString('base64');
    const headers = { accept: JSONAPI, authorization: auth, ...(opts.body !== undefined ? { 'content-type': JSONAPI } : {}), ...opts.headers };
    try {
      return await this.http(url.startsWith('http') ? url : this.api + url, { ...opts, headers });
    } catch (e) {
      if (e.code === 'auth') e.hint = 'Check the user/password, that the core "HTTP Basic Authentication" module is enabled and that the user may edit this content.';
      if (e.code === 'http' && /→ 405\b/.test(e.message)) throw new ConnectorError('config', 'Drupal: JSON:API is read-only on this site.', WRITE_HINT);
      throw e;
    }
  }

  index() {
    return this.memo('index', () => this.req('/'));
  }

  async test() {
    const idx = await this.index();
    // Utilisateur authentifié : JSON:API ajoute meta.links.me (sinon l'en-tête Basic a été ignoré).
    if (!idx?.meta?.links?.me) {
      throw new ConnectorError('auth', 'Drupal: the request was handled as anonymous.', 'Enable the core "HTTP Basic Authentication" (basic_auth) module and check user/password.');
    }
    const types = Object.keys(idx.links || {});
    const bundles = types.filter((t) => t.startsWith('node--')).map((t) => t.slice(6));
    const parts = [`JSON:API OK`, `node bundles: ${bundles.join(', ') || 'none'}`, types.includes('redirect--redirect') ? 'Redirect module exposed' : 'Redirect module not found'];
    return { ok: true, details: parts.join(' — ') };
  }

  async bundles() {
    if (Array.isArray(this.site.bundles) && this.site.bundles.length) return this.site.bundles;
    const idx = await this.index();
    return Object.keys(idx?.links || {}).filter((t) => t.startsWith('node--')).map((t) => t.slice(6));
  }

  // --- URL publique → nœud ---------------------------------------------------------------------------------------

  async resolve(url) {
    const u = new URL(url, this.origin);
    let rel = this.path(u.href);
    if (this.basePath && (rel === this.basePath || rel.startsWith(this.basePath + '/'))) rel = rel.slice(this.basePath.length) || '/';
    return this.memo('r:' + rel, async () => {
      const segs = rel.split('/').filter(Boolean);
      const tries = [{ path: rel, lang: null }];
      if (segs.length && LANG.test(segs[0])) tries.push({ path: '/' + segs.slice(1).join('/'), lang: segs[0] });
      for (const t of tries) {
        const hit = (await this.viaRouter(t.path)) || (await this.viaAlias(t.path, t.lang));
        if (hit) return hit;
      }
      throw new ConnectorError('not_found', `Drupal: no node found for ${url}.`, rel === '/' ? 'Install the decoupled_router module to resolve the front page, or use the node URL (/node/N).' : 'Only nodes can be edited. Check the URL alias.');
    });
  }

  // Module contrib decoupled_router : GET /router/translate-path?path=/x
  // https://www.drupal.org/project/decoupled_router
  async viaRouter(path) {
    let r;
    try {
      r = await this.req(`${this.root}/router/translate-path?path=${encodeURIComponent(path)}&_format=json`, { allow404: true, headers: { accept: 'application/json' } });
    } catch (e) {
      if (e.code === 'config') throw e;
      return null;
    }
    const e = r && typeof r === 'object' ? r.entity : null;
    if (!e?.uuid) return null;
    if (e.type !== 'node') throw new ConnectorError('unsupported', `Drupal: ${path} is a ${e.type} entity; only nodes are supported.`);
    return { bundle: e.bundle, uuid: e.uuid, lang: e.langcode || null };
  }

  // Cœur : entité path_alias (filtre sur alias), puis /node/N → bundle et UUID.
  async viaAlias(path, lang) {
    let nid = /^\/node\/(\d+)$/.exec(path)?.[1];
    if (!nid && path !== '/') {
      const r = await this.req(`/path_alias/path_alias?filter[alias]=${encodeURIComponent(path)}`, { allow404: true });
      const list = (r?.data || []).map((d) => d.attributes || {});
      const a = list.find((x) => lang && x.langcode === lang) || list.find((x) => ['und', 'zxx'].includes(x.langcode)) || list[0];
      if (!a) return null;
      nid = /^\/node\/(\d+)$/.exec(a.path || '')?.[1];
      if (!nid) throw new ConnectorError('unsupported', `Drupal: ${path} points to ${a.path}; only nodes are supported.`);
      if (a.langcode && !['und', 'zxx'].includes(a.langcode)) lang = a.langcode;
    }
    if (!nid) return null;
    for (const b of await this.bundles()) {
      const r = await this.req(`/node/${b}?filter[drupal_internal__nid]=${nid}`, { allow404: true });
      const d = r?.data?.[0];
      if (d) {
        if (lang && d.attributes?.langcode && d.attributes.langcode !== lang) {
          throw new ConnectorError('unsupported', `Drupal: ${path} is the "${lang}" translation of node ${nid}; only the original language (${d.attributes.langcode}) is edited by this connector.`);
        }
        return { bundle: b, uuid: d.id };
      }
    }
    return null;
  }

  // --- Lecture / écriture ---------------------------------------------------------------------------------------

  async load(type, uuid, include = []) {
    const [et, b] = type.split('--');
    const r = await this.req(`/${et}/${b}/${uuid}${include.length ? `?include=${include.join(',')}` : ''}`, { allow404: true });
    if (!r?.data) throw new ConnectorError('not_found', `Drupal: ${type} ${uuid} not found.`);
    return r;
  }

  // https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/updating-existing-resources-patch
  async patch(type, uuid, { attributes, relationships }) {
    const [et, b] = type.split('--');
    const data = { type, id: uuid };
    if (attributes) data.attributes = attributes;
    if (relationships) data.relationships = relationships;
    await this.req(`/${et}/${b}/${uuid}`, { method: 'PATCH', body: { data } });
  }

  async node(url) {
    const res = await this.resolve(url);
    const type = `node--${res.bundle}`;
    const { data } = await this.load(type, res.uuid);
    const lc = data.attributes?.langcode;
    if (res.lang && lc && res.lang !== lc && !['und', 'zxx'].includes(res.lang)) {
      throw new ConnectorError('unsupported', `Drupal: ${url} is the "${res.lang}" translation of this node; only the original language (${lc}) is edited by this connector.`);
    }
    return { type, uuid: res.uuid, attrs: data.attributes || {}, rels: data.relationships || {} };
  }

  metatagField(n) {
    const name = this.site.metatagField || METATAG_FIELDS.find((f) => f in n.attrs);
    if (!name || !(name in n.attrs)) {
      throw new ConnectorError('config', `Drupal: no Metatag field on ${n.type}${this.site.metatagField ? ` (looked for "${this.site.metatagField}")` : ''}.`, 'Install the Metatag module, add a "Meta tags" field to this content type, and set "metatagField" if its machine name is not field_meta_tags.');
    }
    return name;
  }

  async get(change) {
    if (change.field === 'redirect') return this.getRedirect(change.url);
    const n = await this.node(change.url);
    if (change.field === 'h1') return n.attrs.title || null;
    if (change.field === 'image_alt') return (await this.findImage(n, change.target)).alt;
    if (!(change.field in META_KEYS) && change.field !== 'noindex') return super.get(change);
    const { tags } = decodeMetatag(n.attrs[this.metatagField(n)]);
    if (change.field === 'noindex') return robotsList(tags.robots).some((x) => x.toLowerCase() === 'noindex');
    return tags[META_KEYS[change.field]] || null;
  }

  async set(change) {
    if (change.field === 'redirect') return this.setRedirect(change.url, change.value);
    const n = await this.node(change.url);
    const v = change.value;
    if (change.field === 'h1') {
      if (!v) throw new ConnectorError('unsupported', 'Drupal: a node title cannot be empty.');
      return this.patch(n.type, n.uuid, { attributes: { title: String(v) } });
    }
    if (change.field === 'image_alt') return (await this.findImage(n, change.target)).write(v);
    if (!(change.field in META_KEYS) && change.field !== 'noindex') return super.set(change);
    const field = this.metatagField(n);
    const { tags, write } = decodeMetatag(n.attrs[field]);
    if (change.field === 'noindex') {
      const list = robotsList(tags.robots).filter((x) => !/^(no)?index$/i.test(x));
      if (v) list.unshift('noindex');
      if (list.length) tags.robots = list.join(', ');
      else delete tags.robots;
    } else {
      const k = META_KEYS[change.field];
      if (v === null || v === undefined || v === '') delete tags[k];
      else tags[k] = String(v);
    }
    return this.patch(n.type, n.uuid, { attributes: { [field]: write(tags) } });
  }

  // Images : champs image (relations file--file avec meta.alt) du nœud et des médias référencés, puis <img> des
  // champs texte formatés (body…).
  async findImage(n, target) {
    if (!target) throw new ConnectorError('config', 'Drupal: image_alt needs target = image src.');
    const key = fileOf(target);
    const hit = (await this.imageIn(n.type, n.uuid, n.rels, key)) || (await this.imageInMedia(n.rels, key));
    if (hit) return hit;
    for (const [name, val] of Object.entries(n.attrs)) {
      if (!val || typeof val !== 'object' || Array.isArray(val) || typeof val.value !== 'string' || !('format' in val)) continue;
      const alt = getImageAltInHtml(val.value, target);
      if (alt === undefined) continue;
      return {
        alt,
        write: (v) => {
          const { processed, ...rest } = val;
          return this.patch(n.type, n.uuid, { attributes: { [name]: { ...rest, value: setImageAltInHtml(val.value, target, v ?? '').html } } });
        },
      };
    }
    throw new ConnectorError('not_found', `Drupal: image ${target} not found on this node.`, 'The image may come from a block, a view, the theme or a nested paragraph.');
  }

  async imageIn(type, uuid, rels, key) {
    const names = Object.keys(rels).filter((r) => asList(rels[r]?.data).some((d) => d.type === 'file--file' && d.meta && 'alt' in d.meta));
    if (!names.length) return null;
    const { included = [] } = await this.load(type, uuid, names);
    const files = new Map(included.filter((f) => f.type === 'file--file').map((f) => [f.id, f.attributes || {}]));
    for (const name of names) {
      const list = asList(rels[name].data);
      const idx = list.findIndex((d) => {
        const f = files.get(d.id);
        return f && (fileOf(f.filename || '') === key || fileOf(f.uri?.url || '') === key);
      });
      if (idx < 0) continue;
      return {
        alt: list[idx].meta.alt ?? null,
        // PATCH de la relation complète : toutes les valeurs sont renvoyées avec leurs méta (alt, title, width, height).
        write: (v) => {
          const data = list.map((d, i) => {
            const { drupal_internal__target_id, ...meta } = d.meta || {};
            return { type: d.type, id: d.id, meta: i === idx ? { ...meta, alt: v ?? '' } : meta };
          });
          return this.patch(type, uuid, { relationships: { [name]: { data: Array.isArray(rels[name].data) ? data : data[0] } } });
        },
      };
    }
    return null;
  }

  async imageInMedia(rels, key) {
    for (const name of Object.keys(rels)) {
      for (const d of asList(rels[name]?.data).filter((x) => x.type?.startsWith('media--')).slice(0, 20)) {
        const { data } = await this.load(d.type, d.id);
        const hit = await this.imageIn(d.type, d.id, data.relationships || {}, key);
        if (hit) return hit;
      }
    }
    return null;
  }

  // --- Redirections (module Redirect) --------------------------------------------------------------------------
  // Entité redirect : redirect_source { path (sans / initial ni final), query }, redirect_redirect { uri }, status_code.
  // https://git.drupalcode.org/project/redirect/-/blob/8.x-1.x/src/Entity/Redirect.php

  async findRedirect(url) {
    const idx = await this.index();
    if (!idx?.links?.['redirect--redirect']) {
      throw new ConnectorError('unsupported', 'Drupal: the Redirect module is not installed (no redirect--redirect resource).', 'Install and enable https://www.drupal.org/project/redirect.');
    }
    const u = new URL(url, this.origin);
    let p = decodeURIComponent(u.pathname);
    if (this.basePath && p.startsWith(this.basePath + '/')) p = p.slice(this.basePath.length);
    p = p.replace(/^\/+|\/+$/g, '');
    const query = Object.fromEntries(u.searchParams);
    const r = await this.req(`/redirect/redirect?filter[redirect_source.path]=${encodeURIComponent(p)}`);
    const same = (q) => JSON.stringify(Object.entries(q && typeof q === 'object' ? q : {}).sort()) === JSON.stringify(Object.entries(query).sort());
    const hit = (r?.data || []).find((d) => String(d.attributes?.redirect_source?.path || '').toLowerCase() === p.toLowerCase() && same(d.attributes.redirect_source.query));
    return { path: p, query, hit };
  }

  toUri(value) {
    const v = String(value);
    if (/^(internal|entity|route|base):/.test(v)) return v;
    const u = new URL(v, this.root + '/');
    if (u.origin !== new URL(this.root).origin) return u.href;
    let p = u.pathname;
    if (this.basePath && p.startsWith(this.basePath + '/')) p = p.slice(this.basePath.length);
    return 'internal:' + p + u.search + u.hash;
  }

  fromUri(uri) {
    const m = /^(?:internal|base):\/?(.*)$/.exec(uri || '') || /^entity:(.*)$/.exec(uri || '');
    return m ? `${this.root}/${m[1]}` : uri || null;
  }

  async getRedirect(url) {
    const { hit } = await this.findRedirect(url);
    if (!hit || hit.attributes.enabled === false) return null;
    return this.fromUri(hit.attributes.redirect_redirect?.uri);
  }

  async setRedirect(url, value) {
    const { path, query, hit } = await this.findRedirect(url);
    if (value === null || value === undefined) {
      if (hit) await this.req(`/redirect/redirect/${hit.id}`, { method: 'DELETE' });
      return;
    }
    const attributes = { redirect_redirect: { uri: this.toUri(value), title: '' }, status_code: 301 };
    if (hit) return this.patch('redirect--redirect', hit.id, { attributes: { ...attributes, ...(hit.attributes.enabled === false ? { enabled: true } : {}) } });
    await this.req('/redirect/redirect', { method: 'POST', body: { data: { type: 'redirect--redirect', attributes: { redirect_source: { path, query }, ...attributes } } } });
  }
}
