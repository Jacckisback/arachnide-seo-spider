// Connecteur Joomla 4 / 5 / 6 : API Web Services du cœur (JSON:API) sous <site>/api/index.php/v1,
// authentification par jeton API (en-tête X-Joomla-Token) d'un Super Utilisateur.
//
// Docs :
//   Web Services (auth, articles)   https://manual.joomla.org/docs/general-concepts/webservices/
//   Liste des routes du cœur        https://docs.joomla.org/J4.x:Joomla_Core_APIs
//   Code source des routes          https://github.com/joomla/joomla-cms/tree/5.4-dev/plugins/webservices (content, menus, redirect)
//
// Points vérifiés dans le code source de Joomla (5.4) :
//   - GET content/articles/{id} expose title, alias, metadesc, metadata (robots), images (alt intro/complète), version,
//     mais PAS attribs (où vit « Titre de la page du navigateur » = attribs.article_page_title) ni introtext/fulltext
//     séparés (seul « text » est rendu, après les plugins de contenu). Ces données brutes sont lues dans la dernière
//     version de l'historique (GET content/articles/{id}/contenthistory, tri save_date DESC), après avoir vérifié
//     qu'elle correspond bien à l'article actuel (même numéro de version). Il faut donc que les Versions soient activées.
//   - PATCH complète les colonnes absentes avec les valeurs stockées ; attribs / metadata / images sont remplacés en bloc,
//     d'où l'envoi de l'objet complet fusionné.
//   - Redirections : route v1/redirects (plugin « Web Services - Redirect »), champs old_url / new_url / published.
import { Connector, ConnectorError, setImageAltInHtml, getImageAltInHtml } from './base.mjs';

const LANG = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;
const NOTE = 'Arachnide SEO';
const HISTORY_HINT =
  'Enable versions in Content > Articles > Options > Editing Layout > "Enable Versions" (on by default), then save the article once in the administrator so its latest version matches the stored article.';

// Objet depuis une valeur JSON éventuellement encodée (attribs, images, params…).
const obj = (v) => {
  if (v && typeof v === 'object') return { ...v };
  if (typeof v === 'string' && v.trim()) {
    try {
      const o = JSON.parse(v);
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  return {};
};

// Nom de fichier d'une image Joomla (« images/a.jpg#joomlaImage://local-images/a.jpg?width=…&height=… »).
const fileOf = (s) => {
  try {
    return decodeURIComponent(new URL(String(s).split('#')[0], 'http://x').pathname.split('/').pop() || '').toLowerCase();
  } catch {
    return String(s).toLowerCase();
  }
};

// Identifiant d'article d'un lien de menu « index.php?option=com_content&view=article&id=12 ».
const articleIdFromLink = (link) => {
  const q = new URLSearchParams(String(link || '').split('?')[1] || '');
  if (q.get('option') !== 'com_content' || q.get('view') !== 'article') return null;
  const id = parseInt(q.get('id'), 10);
  return id > 0 ? id : null;
};

export default class JoomlaConnector extends Connector {
  static id = 'joomla';
  static label = 'Joomla';
  static fields = ['seo_title', 'meta_description', 'h1', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    token: 'API token of a Super User: Users > Edit user > "Joomla API Token" tab, plugins "API Authentication - Web Services Joomla Token" and "User - Joomla API Token" enabled (env: ARACHNIDE_JOOMLA_TOKEN)',
    apiBase: 'Optional API root, e.g. https://example.com/api/index.php/v1 (default: <site url>/api/index.php/v1)',
  };

  constructor(site, opts) {
    super(site, opts);
    const root = new URL(site.url);
    this.basePath = root.pathname.replace(/\/+$/, ''); // Joomla installé dans un sous-dossier
    this.api = String(site.apiBase || `${root.origin}${this.basePath}/api/index.php/v1`).replace(/\/+$/, '');
  }

  // https://manual.joomla.org/docs/general-concepts/webservices/ (en-têtes X-Joomla-Token, Accept JSON:API)
  async req(path, opts = {}) {
    if (!this.site.token) throw new ConnectorError('config', 'Joomla: missing API token.', 'Set "token" in the site config (e.g. "env:ARACHNIDE_JOOMLA_TOKEN").');
    try {
      return await this.http(this.api + path, {
        ...opts,
        headers: { accept: 'application/vnd.api+json', 'x-joomla-token': this.site.token, ...opts.headers },
      });
    } catch (e) {
      if (e.code === 'auth') e.hint = 'Check the API token, that the user is a Super User (or has core.login.api), and that the "API Authentication - Web Services Joomla Token" plugin is enabled.';
      throw e;
    }
  }

  // Toutes les pages d'une collection (pagination JSON:API page[offset] / page[limit]).
  async all(path) {
    const out = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let offset = 0, n = 0; n < 50; n++, offset += 100) {
      const r = await this.req(`${path}${sep}page[limit]=100&page[offset]=${offset}`, { allow404: true });
      const data = r?.data || [];
      out.push(...data);
      if (data.length < 100 || !r.links?.next) break;
    }
    return out;
  }

  async test() {
    const r = await this.req('/content/articles?page[limit]=1');
    const total = r?.meta?.['total-pages'];
    const redirects = await this.req('/redirects?page[limit]=1', { allow404: true });
    const parts = [`Joomla Web Services OK`, total !== undefined ? `${total} article(s)` : null, redirects ? 'redirects API available' : 'redirects API not found (enable the "Web Services - Redirect" plugin and the "System - Redirect" plugin)'];
    return { ok: true, details: parts.filter(Boolean).join(' — ') };
  }

  // --- URL publique → article ---------------------------------------------------------------------------------

  menuItems() {
    // https://github.com/joomla/joomla-cms/blob/5.4-dev/plugins/webservices/menus/src/Extension/Menus.php
    return this.memo('menus', async () => (await this.all('/menus/site/items')).map((d) => ({ id: d.id, ...d.attributes })).filter((m) => Number(m.published) === 1));
  }

  async resolve(url) {
    const u = new URL(url, this.origin);
    let rel = this.path(u.href);
    if (this.basePath && (rel === this.basePath || rel.startsWith(this.basePath + '/'))) rel = rel.slice(this.basePath.length) || '/';
    const key = rel + '?' + u.search;
    return this.memo('r:' + key, async () => {
      // URL non SEF : index.php?option=com_content&view=article&id=12(:alias)
      const q = u.searchParams;
      if (q.get('option') === 'com_content' && q.get('view') === 'article' && parseInt(q.get('id'), 10) > 0) return { id: parseInt(q.get('id'), 10) };
      const segs = rel.split('/').filter(Boolean);
      if (segs[0] === 'index.php') segs.shift();
      if (segs.length) segs[segs.length - 1] = segs[segs.length - 1].replace(/\.html?$/i, ''); // suffixe SEF optionnel
      const tries = [segs];
      if (segs.length && LANG.test(segs[0])) tries.push(segs.slice(1)); // préfixe de langue (/fr/…)
      for (const s of tries) {
        const lang = s === segs ? null : segs[0];
        const hit = s.length ? await this.resolvePath(s) : await this.resolveHome(lang);
        if (hit) return hit;
      }
      throw new ConnectorError('not_found', `Joomla: no article found for ${url}.`, 'Only com_content articles can be edited. Check that the URL is a public article page.');
    });
  }

  async resolveHome(lang) {
    const homes = (await this.menuItems()).filter((m) => Number(m.home) === 1);
    const m = homes.find((h) => lang && String(h.language || '').toLowerCase().startsWith(lang.toLowerCase())) || homes.find((h) => h.language === '*') || homes[0];
    if (!m) return null;
    const id = articleIdFromLink(m.link);
    if (!id) throw new ConnectorError('unsupported', `Joomla: the home page is a "${m.link}" menu item, not a single article.`, 'Edit the home menu item in Menus > Main Menu (Page Display / Metadata tabs).');
    return { id, menu: m };
  }

  async resolvePath(segs) {
    const full = segs.join('/');
    const menu = (await this.menuItems()).find((m) => String(m.path || '').toLowerCase() === full.toLowerCase());
    if (menu) {
      const id = articleIdFromLink(menu.link);
      if (id) return { id, menu };
      if (menu.type !== 'alias' && menu.type !== 'url') {
        throw new ConnectorError('unsupported', `Joomla: ${full} is a "${menu.link}" menu item, not a single article.`, 'Only article pages can be edited through the API; edit this menu item manually in Menus.');
      }
    }
    const last = segs[segs.length - 1];
    // Routeur hérité : « 12-mon-article »
    const m = /^(\d+)-/.exec(last);
    if (m) {
      const r = await this.req(`/content/articles/${m[1]}`, { allow404: true });
      if (r?.data) return { id: Number(m[1]) };
    }
    // Routeur moderne : alias de l'article en dernier segment (filtre « search » = titre / alias)
    // https://github.com/joomla/joomla-cms/blob/5.4-dev/api/components/com_content/src/Controller/ArticlesController.php
    const found = (await this.all(`/content/articles?filter[search]=${encodeURIComponent(last)}`)).filter(
      (d) => String(d.attributes?.alias || '').toLowerCase() === last.toLowerCase(),
    );
    if (found.length === 1) return { id: Number(found[0].id) };
    if (found.length > 1) {
      // Plusieurs articles avec le même alias : on départage par l'alias de la catégorie (segment précédent).
      const parent = (segs[segs.length - 2] || '').toLowerCase();
      for (const d of found) {
        const catid = d.relationships?.category?.data?.id;
        if (!catid || !parent) continue;
        const c = await this.memo('cat:' + catid, () => this.req(`/content/categories/${catid}`, { allow404: true }));
        if (String(c?.data?.attributes?.alias || '').toLowerCase() === parent) return { id: Number(d.id) };
      }
      const pub = found.filter((d) => Number(d.attributes?.state) === 1);
      if (pub.length === 1) return { id: Number(pub[0].id) };
      throw new ConnectorError('not_found', `Joomla: several articles use the alias "${last}".`, 'Use the non-SEF URL index.php?option=com_content&view=article&id=N for this page.');
    }
    return null;
  }

  // --- Lecture / écriture d'un article --------------------------------------------------------------------------

  // https://manual.joomla.org/docs/general-concepts/webservices/ (GET / PATCH content/articles/{id})
  async article(id) {
    const r = await this.req(`/content/articles/${id}`, { allow404: true });
    if (!r?.data) throw new ConnectorError('not_found', `Joomla: article ${id} not found.`);
    return { id, ...r.data.attributes };
  }

  async patch(id, data) {
    // version_note : force l'enregistrement d'une version d'historique à jour (lue ensuite par raw()).
    await this.req(`/content/articles/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: { ...data, version_note: `${NOTE} ${new Date().toISOString()}` } });
  }

  // Données brutes (attribs, images, introtext, fulltext) : dernière version de l'historique de contenu.
  // https://github.com/joomla/joomla-cms/blob/5.4-dev/plugins/webservices/content/src/Extension/Content.php (contenthistory)
  async raw(art) {
    const r = await this.req(`/content/articles/${art.id}/contenthistory?page[limit]=1`, { allow404: true });
    const v = r?.data?.[0]?.attributes?.version_data;
    if (!v || typeof v !== 'object') throw new ConnectorError('unsupported', `Joomla: no version history for article ${art.id}; its raw settings cannot be read through the API.`, HISTORY_HINT);
    if (v.version !== undefined && art.version !== undefined && String(v.version) !== String(art.version)) {
      throw new ConnectorError('unsupported', `Joomla: the latest saved version of article ${art.id} is out of date (v${v.version} vs v${art.version}).`, HISTORY_HINT);
    }
    return { attribs: obj(v.attribs), images: obj(v.images), introtext: v.introtext ?? '', fulltext: v.fulltext ?? '' };
  }

  async get(change) {
    if (change.field === 'redirect') return this.getRedirect(change.url);
    const res = await this.resolve(change.url);
    const art = await this.article(res.id);
    switch (change.field) {
      case 'h1':
        return art.title || null;
      case 'meta_description':
        return art.metadesc || null;
      case 'noindex':
        return /noindex/i.test(obj(art.metadata).robots || '');
      case 'seo_title': {
        const menuTitle = res.menu && obj(res.menu.params).page_title;
        if (menuTitle) return menuTitle; // le titre du navigateur de l'élément de menu l'emporte
        return (await this.raw(art)).attribs.article_page_title || null;
      }
      case 'image_alt':
        return (await this.findImage(art, change.target, false)).alt;
      default:
        return super.get(change);
    }
  }

  async set(change) {
    if (change.field === 'redirect') return this.setRedirect(change.url, change.value);
    const res = await this.resolve(change.url);
    const art = await this.article(res.id);
    const v = change.value;
    switch (change.field) {
      case 'h1':
        if (!v) throw new ConnectorError('unsupported', 'Joomla: an article title cannot be empty.');
        return this.patch(art.id, { title: String(v) });
      case 'meta_description':
        return this.patch(art.id, { metadesc: v ?? '' });
      case 'noindex': {
        const metadata = obj(art.metadata);
        const nofollow = /nofollow/i.test(metadata.robots || '');
        // Valeurs autorisées par le formulaire (validate="options") : '', 'index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow'
        metadata.robots = v ? `noindex, ${nofollow ? 'nofollow' : 'follow'}` : nofollow ? 'index, nofollow' : '';
        return this.patch(art.id, { metadata });
      }
      case 'seo_title': {
        if (res.menu && obj(res.menu.params).page_title) {
          throw new ConnectorError('unsupported', `Joomla: the browser page title of this URL comes from menu item "${res.menu.title}" (#${res.menu.id}).`, 'Edit Menus > (menu) > item > Page Display > "Browser Page Title".');
        }
        const { attribs } = await this.raw(art);
        attribs.article_page_title = v ?? '';
        return this.patch(art.id, { attribs });
      }
      case 'image_alt': {
        const img = await this.findImage(art, change.target, true);
        return this.patch(art.id, img.update(v));
      }
      default:
        return super.set(change);
    }
  }

  // Image visée : image d'introduction / complète (champ images), puis <img> du texte (introtext, fulltext).
  async findImage(art, target, forWrite) {
    if (!target) throw new ConnectorError('config', 'Joomla: image_alt needs target = image src.');
    const key = fileOf(target);
    let raw = null;
    try {
      raw = await this.raw(art);
    } catch (e) {
      if (forWrite) throw e;
    }
    const images = raw ? raw.images : obj(art.images);
    for (const k of ['image_intro', 'image_fulltext']) {
      if (images[k] && fileOf(images[k]) === key) {
        return {
          alt: images[`${k}_alt`] || null,
          update: (v) => ({ images: { ...images, [`${k}_alt`]: v ?? '', ...(v ? { [`${k}_alt_empty`]: '' } : {}) } }),
        };
      }
    }
    if (!raw) throw new ConnectorError('unsupported', `Joomla: image ${target} is not the intro/full image and the article text cannot be read.`, HISTORY_HINT);
    for (const k of ['introtext', 'fulltext']) {
      const alt = getImageAltInHtml(raw[k], target);
      if (alt !== undefined) {
        return { alt, update: (v) => ({ [k]: setImageAltInHtml(raw[k], target, v ?? '').html }) };
      }
    }
    throw new ConnectorError('not_found', `Joomla: image ${target} not found in article ${art.id}.`, 'The image may come from a module, the template or a custom field.');
  }

  // --- Redirections (com_redirect) -----------------------------------------------------------------------------
  // https://github.com/joomla/joomla-cms/blob/5.4-dev/plugins/webservices/redirect/src/Extension/Redirect.php
  // Le plugin « System - Redirect » compare old_url (sans casse) à l'URL complète ou au chemin + requête de la page 404.

  async findRedirect(url) {
    const u = new URL(url, this.origin);
    const p = decodeURIComponent(u.pathname) + u.search;
    const keys = new Set([u.href, decodeURIComponent(u.href), p, p.replace(/^\//, ''), p.replace(/\/+$/, '')].map((s) => s.toLowerCase()));
    const list = await this.all('/redirects');
    return { path: p, hit: list.find((d) => keys.has(String(d.attributes?.old_url || '').toLowerCase())) };
  }

  async getRedirect(url) {
    const { hit } = await this.findRedirect(url);
    return hit && Number(hit.attributes.published) === 1 ? hit.attributes.new_url || null : null;
  }

  async setRedirect(url, value) {
    const { path, hit } = await this.findRedirect(url);
    const json = { 'content-type': 'application/json' };
    if (value === null || value === undefined) {
      if (hit) await this.req(`/redirects/${hit.id}`, { method: 'DELETE' });
      return;
    }
    if (hit) return this.req(`/redirects/${hit.id}`, { method: 'PATCH', headers: json, body: { new_url: String(value), published: 1 } });
    await this.req('/redirects', { method: 'POST', headers: json, body: { old_url: path, new_url: String(value), published: 1, comment: NOTE } });
  }
}
