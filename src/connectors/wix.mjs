// Connecteur Wix (Wix Editor, Wix Studio) : API REST officielles www.wixapis.com, authentification par clé d'API.
//
// - Balises SEO (titre, meta description, canonical, robots) : API « Item SEO Tags » (SEO > Item Seo Tags V1),
//   la même pour les pages statiques, les articles de blog et les produits Wix Stores.
//   https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/introduction
// - Redirections 301 : API « SEO Redirects » (= gestionnaire de redirections d'URL du tableau de bord).
//   https://dev.wix.com/docs/api-reference/business-management/seo/redirects/redirect-v1/introduction
// - URL publique → contenu : /post/{slug} (Blog), /product-page/{slug} (Stores), sinon page statique
//   retrouvée par sa balise canonical / og:url (liste des pages STATIC_PAGE), ou via site.pages { chemin: pageId }.
//
// Authentification (clé d'API créée par le propriétaire du site) :
//   Authorization: <clé>  +  wix-site-id: <id du site>
//   https://dev.wix.com/docs/api-reference/articles/authentication/api-keys/make-api-calls-with-an-api-key
// Droits de la clé : « Manage SEO Settings » (SCOPE.PROMOTE.MANAGE-SEO), « Read Blog » si blog,
// « Read Products » (catalogue V1) / « Read products in v3 catalog » (+ « Product v3 read admin » pour les produits masqués) si boutique.

import { Connector, ConnectorError } from './base.mjs';

// Chemins de l'API Item SEO Tags : les exemples officiels utilisent /promote/seo/v1, le schéma /seo-metatags-server/v1.
const SEO_PATHS = ['/promote/seo/v1', '/seo-metatags-server/v1'];

const norm = (p) => (String(p || '').replace(/\/+$/, '') || '/');

export default class WixConnector extends Connector {
  static id = 'wix';
  static label = 'Wix';
  static fields = ['seo_title', 'meta_description', 'canonical', 'noindex', 'redirect'];
  static setup = {
    siteId: 'ID du site Wix (dans l’URL du tableau de bord : manage.wix.com/dashboard/<siteId>/…)',
    apiKey: 'Clé d’API Wix créée par le propriétaire du site — droits « Manage SEO Settings », « Read Blog », « Read Products » (env : ARACHNIDE_WIX_API_KEY)',
    pages: 'Optionnel : correspondance { "/chemin": "pageId" } pour les pages statiques non retrouvées automatiquement',
    postPrefix: 'Optionnel : préfixe d’URL des articles de blog (défaut « post »)',
    productPrefix: 'Optionnel : préfixe d’URL des fiches produits (défaut « product-page »)',
  };

  constructor(site, opts) {
    super(site, opts);
    this.api = String(site.apiBase || 'https://www.wixapis.com').replace(/\/+$/, '');
    // Sites gratuits : https://compte.wixsite.com/monsite/… → préfixe /monsite à ignorer.
    this.basePath = norm(new URL(site.url).pathname) === '/' ? '' : norm(new URL(site.url).pathname);
  }

  headers() {
    if (!this.site.apiKey || !this.site.siteId) {
      throw new ConnectorError('config', 'Wix : siteId et apiKey sont requis.', 'Créez une clé d’API (Paramètres du compte Wix > Clés d’API) et indiquez l’ID du site ; la clé se met dans ARACHNIDE_WIX_API_KEY.');
    }
    return { authorization: this.site.apiKey, 'wix-site-id': this.site.siteId };
  }

  call(path, opts = {}) {
    return this.http(this.api + path, { ...opts, headers: { ...this.headers(), ...opts.headers } });
  }

  // Chemin relatif au site (sans préfixe de site gratuit), décodé, sans / final.
  rel(url) {
    let p = this.path(url);
    if (this.basePath && (p === this.basePath || p.startsWith(this.basePath + '/'))) p = p.slice(this.basePath.length) || '/';
    return p;
  }

  // Base de l'API Item SEO Tags qui répond sur ce site (sonde une fois).
  // https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/list-item-seo-tags
  seoBase() {
    return this.memo('seoBase', async () => {
      const list = this.site.seoPath ? [this.site.seoPath] : SEO_PATHS;
      for (const base of list) {
        const r = await this.call(`${base}/item-seo-tags/STATIC_PAGE?paging.limit=1`, { allow404: true });
        if (r) return base;
      }
      throw new ConnectorError('unsupported', 'Wix : l’API Item SEO Tags ne répond pas pour ce site.', 'Vérifiez l’ID du site et que la clé a le droit « Manage SEO Settings ».');
    });
  }

  async test() {
    const base = await this.seoBase();
    const r = await this.call(`${base}/item-seo-tags/STATIC_PAGE?paging.limit=100`);
    // https://dev.wix.com/docs/api-reference/business-management/seo/redirects/redirect-v1/list-redirects
    const red = await this.call('/seo-redirects-service/v1/redirects');
    const n = r?.itemSeoTags?.length ?? 0;
    return { ok: true, details: `API Item SEO Tags (${base}) : ${n}${r?.pagingMetadata?.hasNext ? '+' : ''} page(s) statique(s) ; ${red?.redirects?.length ?? 0} redirection(s).` };
  }

  // ---- URL → élément SEO { itemType, itemId } ----
  async resolve(url) {
    const p = this.rel(url);
    return this.memo('item:' + p, async () => {
      const seg = p.split('/').filter(Boolean);
      const postPrefix = this.site.postPrefix || 'post';
      const productPrefix = this.site.productPrefix || 'product-page';
      if (seg.length === 2 && seg[0] === postPrefix) {
        // https://dev.wix.com/docs/api-reference/business-solutions/blog/posts-stats/get-post-by-slug
        const r = await this.call(`/blog/v3/posts/slugs/${encodeURIComponent(seg[1])}`, { allow404: true });
        if (r?.post?.id) return { itemType: 'BLOG_POST', itemId: r.post.id };
      } else if (seg.length === 2 && seg[0] === productPrefix) {
        const id = await this.productId(seg[1]);
        if (id) return { itemType: 'STORES_PRODUCT', itemId: id };
      } else {
        const pages = this.site.pages || {};
        const mapped = pages[p] ?? pages[p + '/'];
        if (mapped) return { itemType: 'STATIC_PAGE', itemId: mapped };
        const id = (await this.staticPages()).get(p);
        if (id) return { itemType: 'STATIC_PAGE', itemId: id };
      }
      throw new ConnectorError('not_found', `Wix : aucun contenu ne correspond à ${p}.`, 'Articles : /post/<slug>, produits : /product-page/<slug>. Pour une page statique, ajoutez site.pages { "' + p + '": "<pageId>" }.');
    });
  }

  // Catalogue V1 ou V3 selon le site.
  async productId(slug) {
    // https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-versioning/get-catalog-version
    const v = await this.memo('catalog', async () => (await this.call('/stores/v3/provision/version', { allow404: true }))?.catalogVersion || 'V1_CATALOG');
    if (v === 'V3_CATALOG') {
      // https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/get-product-by-slug
      const r = await this.call(`/stores/v3/products/slug/${encodeURIComponent(slug)}`, { allow404: true });
      return r?.product?.id || null;
    }
    // https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v1/catalog/query-products
    const r = await this.call('/stores/v1/products/query', { method: 'POST', body: { query: { filter: JSON.stringify({ slug }), paging: { limit: 1 } }, includeHiddenProducts: true } });
    return r?.products?.[0]?.id || null;
  }

  // Pages statiques : chemin public (d'après canonical / og:url des balises résolues) → pageId.
  staticPages() {
    return this.memo('staticPages', async () => {
      const base = await this.seoBase();
      const map = new Map();
      let cursor = '';
      for (let i = 0; i < 50; i++) {
        const q = `paging.limit=100${cursor ? '&paging.cursor=' + encodeURIComponent(cursor) : ''}`;
        const r = await this.call(`${base}/item-seo-tags/STATIC_PAGE?${q}`);
        for (const it of r?.itemSeoTags || []) {
          const resolved = it.resolvedTags ? it : (await this.call(`${base}/item-seo-tags/STATIC_PAGE/${encodeURIComponent(it.itemId)}`))?.itemSeoTags || it;
          for (const { tag } of resolved.resolvedTags || []) {
            const href = tag?.type === 'link' && tag.props?.rel === 'canonical' ? tag.props.href : tag?.type === 'meta' && tag.props?.property === 'og:url' ? tag.props.content : null;
            if (!href) continue;
            try {
              const k = this.rel(href);
              if (!map.has(k)) map.set(k, it.itemId);
            } catch {}
          }
        }
        cursor = r?.pagingMetadata?.hasNext ? r.pagingMetadata.cursors?.next : '';
        if (!cursor) break;
      }
      return map;
    });
  }

  // ---- Lecture / écriture des balises ----
  // https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/get-item-seo-tags
  async readItem(item) {
    const base = await this.seoBase();
    const r = await this.call(`${base}/item-seo-tags/${item.itemType}/${encodeURIComponent(item.itemId)}`, { allow404: true });
    if (!r?.itemSeoTags) throw new ConnectorError('not_found', `Wix : élément ${item.itemType} ${item.itemId} introuvable.`);
    return r.itemSeoTags;
  }

  // Écrit la liste complète des balises propres à l'élément (l'API remplace tout). Liste vide → retour aux valeurs héritées.
  // https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/set-item-seo-tags
  // https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/reset-item-seo-tags-to-default
  async writeItem(item, tags) {
    const base = await this.seoBase();
    const path = `${base}/item-seo-tags/${item.itemType}/${encodeURIComponent(item.itemId)}`;
    if (!tags.length) return (await this.call(path + '/reset-to-default', { method: 'POST', body: {} }))?.itemSeoTags;
    const body = { itemSeoTags: { tags }, fieldMask: 'tags' };
    const r = await this.call(path, { method: 'PATCH', body });
    // Page statique : brouillon (relu par Get) puis version publiée (publish: true ne met à jour que celle-ci).
    if (item.itemType === 'STATIC_PAGE') await this.call(path, { method: 'PATCH', body: { ...body, publish: true } });
    return r?.itemSeoTags;
  }

  async get(change) {
    if (change.field === 'redirect') return this.getRedirect(change.url);
    this.check(change.field);
    const it = await this.readItem(await this.resolve(change.url));
    if (change.field === 'noindex') return isNoindex(it);
    const t = (it.tags || []).find((x) => !x.disabled && match(x, change.field));
    return t ? valueOf(t, change.field) : null;
  }

  async set(change) {
    if (change.field === 'redirect') return this.setRedirect(change.url, change.value);
    this.check(change.field);
    const item = await this.resolve(change.url);
    const it = await this.readItem(item);
    let tags = [...(it.tags || [])];
    if (change.field === 'noindex') {
      const own = tags.find((x) => match(x, 'robots'));
      const src = own || (it.resolvedTags || []).map((r) => r.tag).find((x) => x && match(x, 'robots'));
      const dirs = new Set(String(src?.props?.content || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s && s !== 'index' && s !== 'noindex'));
      if (change.value) dirs.add('noindex');
      tags = tags.filter((x) => !match(x, 'robots'));
      if (change.value || own) {
        if (dirs.size) tags.push({ type: 'meta', props: { name: 'robots', content: [...dirs].join(', ') } });
      }
      const after = await this.writeItem(item, tags);
      if (!change.value && after && isNoindex(after)) {
        throw new ConnectorError('unsupported', 'Wix : le noindex de cette page est hérité (réglage du site ou du modèle de pages), pas de la page elle-même.', 'Désactivez-le dans le tableau de bord : Marketing & SEO > Outils SEO > Paramètres SEO.');
      }
      return;
    }
    tags = tags.filter((x) => !match(x, change.field));
    if (change.value !== null && change.value !== undefined) tags.push(makeTag(change.field, String(change.value)));
    await this.writeItem(item, tags);
  }

  check(field) {
    if (!this.supports(field)) throw new ConnectorError('unsupported', `Wix : le champ « ${field} » n’est pas modifiable par l’API.`);
  }

  // ---- Redirections ----
  fromPath(url) {
    const p = this.rel(url);
    if (p === '/') throw new ConnectorError('unsupported', 'Wix : impossible de rediriger la page d’accueil.');
    return p;
  }

  async findRedirect(url) {
    const p = this.fromPath(url);
    // https://dev.wix.com/docs/api-reference/business-management/seo/redirects/redirect-v1/list-redirects
    const r = await this.call('/seo-redirects-service/v1/redirects');
    const same = (r?.redirects || []).filter((x) => !x.language && !x.options?.groupRedirect && norm(safeDecode(x.from)) === p);
    return same[0] || null;
  }

  async getRedirect(url) {
    const r = await this.findRedirect(url);
    if (!r) return null;
    const to = safeDecode(r.to);
    return to.startsWith('/') ? this.origin + this.basePath + to : to;
  }

  async setRedirect(url, value) {
    const from = this.fromPath(url);
    if (value === null || value === undefined) {
      const r = await this.findRedirect(url);
      // https://dev.wix.com/docs/api-reference/business-management/seo/redirects/redirect-v1/delete-redirect
      if (r?.id) await this.call(`/seo-redirects-service/v1/redirects/${encodeURIComponent(r.id)}`, { method: 'DELETE', allow404: true });
      return;
    }
    // Destination sur le même site → chemin relatif au site (comme from) ; relue en URL absolue par get.
    let to = String(value);
    try {
      const u = new URL(to, this.origin);
      if (u.origin === this.origin) to = this.rel(u.href) + u.search + u.hash;
    } catch {}
    // forceReplace : remplace la redirection existante depuis le même chemin (sinon 409 FROM_URL_EXISTS).
    // https://dev.wix.com/docs/api-reference/business-management/seo/redirects/redirect-v1/create-redirect
    await this.call('/seo-redirects-service/v1/create-redirect', {
      method: 'POST',
      body: { redirect: { from: encodeURI(from), to: encodeURI(safeDecode(to)) }, options: { forceReplace: true } },
    });
  }
}

// ---- Balises ----
function match(t, field) {
  const name = String(t?.props?.name || '').toLowerCase();
  if (field === 'seo_title') return t.type === 'title';
  if (field === 'meta_description') return t.type === 'meta' && name === 'description';
  if (field === 'robots' || field === 'noindex') return t.type === 'meta' && name === 'robots';
  if (field === 'canonical') return t.type === 'link' && String(t.props?.rel || '').toLowerCase() === 'canonical';
  return false;
}

function valueOf(t, field) {
  if (field === 'seo_title') return t.children ?? null;
  if (field === 'meta_description') return t.props?.content ?? null;
  if (field === 'canonical') return t.props?.href ?? null;
  return null;
}

function makeTag(field, v) {
  if (field === 'seo_title') return { type: 'title', children: v };
  if (field === 'meta_description') return { type: 'meta', props: { name: 'description', content: v } };
  return { type: 'link', props: { rel: 'canonical', href: v } };
}

function isNoindex(it) {
  const list = it.resolvedTags ? it.resolvedTags.map((r) => r.tag) : it.tags || [];
  return list.some((t) => t && !t.disabled && match(t, 'robots') && /(^|[\s,])(noindex|none)([\s,]|$)/i.test(String(t.props?.content || '')));
}

function safeDecode(s) {
  try {
    return decodeURI(String(s));
  } catch {
    return String(s);
  }
}
