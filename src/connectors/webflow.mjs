// Connecteur Webflow : Data API v2 (https://api.webflow.com/v2), jeton de site (Authorization: Bearer).
//
// Correspondance URL publique → ressource :
//   1. page statique dont publishedPath correspond au chemin (pages de collection exclues) ;
//   2. sinon élément CMS /{slug-de-collection}/{slug-d-élément} (fieldData.slug).
//   Un préfixe de langue secondaire (/fr/…, sous-dossier défini dans Localization) sélectionne la locale ;
//   le réglage « locale » force une locale pour toutes les URL.
//
// Pages statiques : seo.title / seo.description (PUT /pages/{id}). Le H1, la canonique et le noindex
// ne sont pas exposés par l'API des pages. Éléments CMS : titre SEO, description et H1 sont des champs
// du modèle de collection (réglage cmsFields), liés au <title> / à la meta du modèle dans le Designer.
// Les modifications sont « stagées » : elles n'apparaissent en ligne qu'après publication (réglage publish).

import { Connector, ConnectorError } from './base.mjs';

const API = 'https://api.webflow.com/v2';
// Slugs de champs CMS essayés quand cmsFields ne les précise pas.
const CANDIDATES = {
  seo_title: ['seo-title', 'meta-title', 'title-tag', 'seo-titel', 'titre-seo'],
  meta_description: ['meta-description', 'seo-description', 'description-seo', 'meta-beschreibung'],
  h1: ['name'],
};

export default class WebflowConnector extends Connector {
  static id = 'webflow';
  static label = 'Webflow';
  static fields = ['seo_title', 'meta_description', 'h1', 'redirect'];
  static setup = {
    siteId: 'Identifiant du site Webflow (Site settings > General > Site ID)',
    token: 'Jeton API du site (env : ARACHNIDE_WEBFLOW_TOKEN). Scopes : sites:read, pages:read, pages:write, cms:read, cms:write ; sites:write pour publier et pour les redirections (plan Enterprise)',
    locale: 'Optionnel : locale à modifier pour toutes les URL (tag ou sous-dossier, ex. fr) ; sinon détectée par le préfixe de l’URL',
    cmsFields: 'Optionnel : slugs des champs CMS, ex. { "seo_title": "seo-title", "meta_description": "meta-description", "h1": "name" }',
    publish: 'Optionnel : "none" (défaut, modifications en brouillon), "items" (publie l’élément CMS modifié) ou "site" (publie tout le site, nécessaire pour les pages statiques et les redirections)',
  };

  constructor(site, opts) {
    super(site, opts);
    this.api = String(site.apiBase || API).replace(/\/+$/, '');
    this.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }

  // Doc auth : https://developers.webflow.com/data/reference/authentication ; limites : https://developers.webflow.com/data/reference/rate-limits
  async call(path, opts = {}, retried = false) {
    if (!this.site.siteId) throw new ConnectorError('config', 'Webflow : réglage « siteId » manquant.', 'Copiez l’identifiant du site depuis Site settings > General.');
    if (!this.site.token) throw new ConnectorError('config', 'Webflow : jeton API manquant.', 'Générez un jeton dans Site settings > Apps & integrations > API access et renseignez ARACHNIDE_WEBFLOW_TOKEN.');
    try {
      return await this.http(this.api + path, { ...opts, headers: { authorization: `Bearer ${this.site.token}`, ...opts.headers } });
    } catch (e) {
      if (!retried && e.code === 'http' && /→ 429\b/.test(e.message)) {
        await this.sleep(2000);
        return this.call(path, opts, true);
      }
      if (e.code === 'auth') e.hint = 'Vérifiez le jeton (ARACHNIDE_WEBFLOW_TOKEN), le siteId et les scopes du jeton (sites:read, pages:read/write, cms:read/write).';
      throw e;
    }
  }

  qs(params) {
    const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return p.toString() ? `?${p}` : '';
  }

  // Doc : https://developers.webflow.com/data/reference/sites/get
  async siteInfo() {
    return this.memo('site', () => this.call(`/sites/${this.site.siteId}`));
  }

  async test() {
    const s = await this.siteInfo();
    const locs = [s.locales?.primary, ...(s.locales?.secondary || [])].filter(Boolean).map((l) => l.tag || l.displayName);
    const domains = (s.customDomains || []).map((d) => d.url).join(', ');
    return { ok: true, details: `${s.displayName || s.shortName} · Data API v2${domains ? ` · domaines : ${domains}` : ''}${locs.length > 1 ? ` · locales : ${locs.join(', ')}` : ''} · publication : ${this.site.publish || 'none'}` };
  }

  // --- URL → ressource -------------------------------------------------------------------------

  // Locale secondaire visée : préfixe de l'URL, sinon réglage « locale », sinon locale principale (null).
  async localeFor(parts) {
    const s = await this.siteInfo();
    const secondary = (s.locales?.secondary || []).filter((l) => l.enabled !== false);
    const norm = (x) => String(x || '').toLowerCase().replace(/^\/+|\/+$/g, '');
    const byPrefix = parts.length && secondary.find((l) => l.subdirectory && norm(l.subdirectory) === norm(parts[0]));
    if (byPrefix) return { locale: byPrefix, rest: parts.slice(1) };
    if (this.site.locale) {
      const all = [s.locales?.primary, ...secondary].filter(Boolean);
      const l = all.find((x) => [x.tag, x.subdirectory, x.displayName, x.id].some((v) => norm(v) === norm(this.site.locale)));
      if (!l) throw new ConnectorError('config', `Webflow : locale « ${this.site.locale} » introuvable sur le site.`, `Locales disponibles : ${all.map((x) => x.tag).join(', ')}`);
      return { locale: l === s.locales?.primary ? null : l, rest: parts };
    }
    return { locale: null, rest: parts };
  }

  // Doc : https://developers.webflow.com/data/reference/pages-and-components/pages/list
  async pages(localeId) {
    return this.memo(`pages:${localeId || ''}`, async () => {
      const out = [];
      for (let offset = 0; ; offset += 100) {
        const r = await this.call(`/sites/${this.site.siteId}/pages${this.qs({ localeId, limit: 100, offset })}`);
        for (const x of r?.pages || []) out.push(x);
        if (!r?.pages?.length || out.length >= (r.pagination?.total ?? 0)) break;
      }
      return out;
    });
  }

  // Doc : https://developers.webflow.com/data/reference/cms/collections/list
  async collections() {
    return this.memo('collections', async () => (await this.call(`/sites/${this.site.siteId}/collections`))?.collections || []);
  }

  async resolve(url) {
    return this.memo(`res:${url}`, async () => {
      const path = this.path(url);
      const parts = path.split('/').filter(Boolean);
      const { locale, rest } = await this.localeFor(parts);
      const clean = (p) => (String(p || '').replace(/\/+$/, '') || '/').toLowerCase();
      const wanted = [path, '/' + rest.join('/')].map(clean);
      const page = (await this.pages(locale?.id)).find((p) => !p.collectionId && !p.archived && wanted.includes(clean(p.publishedPath)));
      if (page) return { kind: 'page', id: page.id, localeId: locale?.id || null };
      if (rest.length === 2) {
        const col = (await this.collections()).find((c) => c.slug === rest[0]);
        if (col) {
          // Doc : https://developers.webflow.com/data/reference/cms/collection-items/staged-items/list-items
          const r = await this.call(`/collections/${col.id}/items${this.qs({ slug: rest[1], cmsLocaleId: locale?.cmsLocaleId, limit: 1 })}`);
          const item = (r?.items || []).find((i) => i.fieldData?.slug === rest[1]);
          if (item) return { kind: 'item', id: item.id, collectionId: col.id, cmsLocaleId: locale?.cmsLocaleId || null };
        }
      }
      throw new ConnectorError('not_found', `Webflow : aucune page ni élément CMS ne correspond à ${url}.`, 'Vérifiez que le site a été publié et que le chemin correspond à une page statique ou à /{collection}/{élément}.');
    });
  }

  // Slug du champ CMS correspondant à un champ SEO, d'après cmsFields ou le schéma de la collection.
  // Doc : https://developers.webflow.com/data/reference/cms/collections/get
  async cmsField(collectionId, field) {
    const schema = await this.memo(`col:${collectionId}`, () => this.call(`/collections/${collectionId}`));
    const fields = schema?.fields || [];
    const wanted = this.site.cmsFields?.[field];
    const slug = wanted || CANDIDATES[field]?.find((s) => fields.some((f) => f.slug === s));
    const f = slug && fields.find((x) => x.slug === slug);
    if (!f) {
      throw new ConnectorError('unsupported', `Webflow : la collection « ${schema?.displayName} » n’a pas de champ pour « ${field} »${wanted ? ` (champ « ${wanted} » introuvable)` : ''}.`, `Ajoutez un champ texte, liez-le aux réglages SEO du modèle de collection, puis indiquez son slug dans cmsFields. Champs existants : ${fields.map((x) => x.slug).join(', ')}`);
    }
    return f;
  }

  // --- Lecture / écriture ----------------------------------------------------------------------

  async get(change) {
    const { field } = change;
    if (field === 'redirect') return (await this.findRedirect(change.url))?.toUrl ?? null;
    const res = await this.resolve(change.url);
    if (res.kind === 'page') {
      const key = this.pageKey(field);
      // Doc : https://developers.webflow.com/data/reference/pages-and-components/pages/get-metadata
      const p = await this.call(`/pages/${res.id}${this.qs({ localeId: res.localeId })}`);
      return p?.seo?.[key] || null;
    }
    const f = await this.cmsField(res.collectionId, field);
    // Doc : https://developers.webflow.com/data/reference/cms/collection-items/staged-items/get-item
    const item = await this.call(`/collections/${res.collectionId}/items/${res.id}${this.qs({ cmsLocaleId: res.cmsLocaleId })}`);
    const v = item?.fieldData?.[f.slug];
    return v === undefined || v === '' ? null : v;
  }

  pageKey(field) {
    if (field === 'seo_title') return 'title';
    if (field === 'meta_description') return 'description';
    throw new ConnectorError('unsupported', `Webflow : « ${field} » n’est pas modifiable par l’API sur une page statique.`, 'Modifiez-le dans le Designer (le H1 est un élément de la page).');
  }

  async set(change) {
    const { field, value } = change;
    if (field === 'redirect') return this.setRedirect(change.url, value);
    const res = await this.resolve(change.url);
    if (res.kind === 'page') {
      const key = this.pageKey(field);
      const q = this.qs({ localeId: res.localeId });
      const p = await this.call(`/pages/${res.id}${q}`);
      const seo = { title: p?.seo?.title ?? '', description: p?.seo?.description ?? '', [key]: value ?? '' };
      // Doc : https://developers.webflow.com/data/reference/pages-and-components/pages/update-page-settings
      await this.call(`/pages/${res.id}${q}`, { method: 'PUT', body: { seo } });
      return this.publish(res);
    }
    const f = await this.cmsField(res.collectionId, field);
    if ((value === null || value === '') && (f.isRequired || f.slug === 'name')) {
      throw new ConnectorError('unsupported', `Webflow : le champ « ${f.displayName} » est obligatoire et ne peut pas être vidé.`);
    }
    const body = { fieldData: { [f.slug]: value ?? '' } };
    if (res.cmsLocaleId) body.cmsLocaleId = res.cmsLocaleId;
    // Doc : https://developers.webflow.com/data/reference/cms/collection-items/staged-items/update-item
    await this.call(`/collections/${res.collectionId}/items/${res.id}`, { method: 'PATCH', body });
    return this.publish(res);
  }

  // Publication des modifications stagées selon le réglage « publish ».
  async publish(res) {
    const mode = this.site.publish || 'none';
    if (mode === 'items' && res?.kind === 'item') {
      // Doc : https://developers.webflow.com/data/reference/cms/collection-items/staged-items/publish-item
      const body = res.cmsLocaleId ? { items: [{ id: res.id, cmsLocaleIds: [res.cmsLocaleId] }] } : { itemIds: [res.id] };
      const r = await this.call(`/collections/${res.collectionId}/items/publish`, { method: 'POST', body });
      if (r?.errors?.length) throw new ConnectorError('http', `Webflow : publication de l’élément refusée (${r.errors.join(' ; ')}).`);
      return { ok: true, published: 'item' };
    }
    if (mode === 'site') {
      // Doc : https://developers.webflow.com/data/reference/sites/publish (1 publication par minute)
      const s = await this.siteInfo();
      const customDomains = (s.customDomains || []).map((d) => d.id);
      try {
        await this.call(`/sites/${this.site.siteId}/publish`, { method: 'POST', body: { customDomains, publishToWebflowSubdomain: true } });
      } catch (e) {
        if (e.code === 'http' && /→ 429\b/.test(e.message)) return { ok: true, published: false, note: 'Webflow : modification enregistrée, publication limitée à une par minute — publiez le site plus tard.' };
        throw e;
      }
      return { ok: true, published: 'site' };
    }
    return { ok: true, published: false, note: 'Webflow : modification enregistrée en brouillon, à publier depuis Webflow (ou réglage publish).' };
  }

  // --- Redirections 301 (plan Enterprise) -----------------------------------------------------
  // Doc : https://developers.webflow.com/data/reference/enterprise/site-configuration/301-redirects/get (create, patch, delete)

  redirectPath(url) {
    const u = new URL(url, this.origin);
    return (decodeURIComponent(u.pathname).replace(/(.)\/+$/, '$1') || '/') + u.search;
  }

  async redirects() {
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const r = await this.enterprise(() => this.call(`/sites/${this.site.siteId}/redirects${this.qs({ limit: 100, offset })}`));
      for (const x of r?.redirects || []) out.push(x);
      if (!r?.redirects?.length || !r.pagination || out.length >= r.pagination.total) break;
    }
    return out;
  }

  async enterprise(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 'auth' && /\(403\)/.test(e.message)) {
        throw new ConnectorError('unsupported', 'Webflow : l’API des redirections 301 est refusée.', 'Elle est réservée aux sites d’un workspace Enterprise et demande les scopes sites:read et sites:write ; sinon, ajoutez la redirection dans Site settings > Publishing > 301 redirects.');
      }
      throw e;
    }
  }

  async findRedirect(url) {
    const norm = (p) => String(p).toLowerCase().replace(/(.)\/+$/, '$1');
    const path = norm(this.redirectPath(url));
    return (await this.redirects()).find((r) => norm(r.fromUrl) === path) || null;
  }

  async setRedirect(url, value) {
    const found = await this.findRedirect(url);
    const base = `/sites/${this.site.siteId}/redirects`;
    if (value === null || value === '') {
      if (found) await this.enterprise(() => this.call(`${base}/${found.id}`, { method: 'DELETE' }));
    } else {
      const u = new URL(String(value), this.origin);
      const body = { fromUrl: this.redirectPath(url), toUrl: u.origin === this.origin ? u.pathname + u.search + u.hash : u.href };
      if (found) await this.enterprise(() => this.call(`${base}/${found.id}`, { method: 'PATCH', body }));
      else await this.enterprise(() => this.call(base, { method: 'POST', body }));
    }
    return this.publish(null);
  }
}
