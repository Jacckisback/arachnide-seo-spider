// Connecteur Shopify : Admin GraphQL API, jeton d'une app personnalisée (en-tête X-Shopify-Access-Token).
//
// Correspondance URL publique → ressource :
//   /products/{handle}, /collections/{c}/products/{handle} → produit
//   /collections/{handle} → collection ; /pages/{handle} → page
//   /blogs/{blog} → blog ; /blogs/{blog}/{article} → article
//   préfixe de langue (/fr/…) : si c'est une langue publiée de la boutique (hors langue principale),
//   titre SEO, meta description et H1 sont lus/écrits comme traductions (translationsRegister).
//   Accueil « / » : titre et description de la page d'accueil (Préférences de la boutique) non exposés par l'API.
//
// Champs SEO : métachamps global.title_tag / global.description_tag (les mêmes que Product.seo / Collection.seo),
// noindex : métachamp seo.hidden = 1 (number_integer), supprimé pour réindexer.
// Doc : https://shopify.dev/docs/apps/build/marketing/optimize-storefront-seo

import { Connector, ConnectorError } from './base.mjs';

const DEFAULT_VERSION = '2026-10'; // dernière version stable en octobre 2026 (https://shopify.dev/docs/api/usage/versioning)
const TYPES = { products: 'product', collections: 'collection', pages: 'page', blogs: 'blog' };
const META = {
  seo_title: { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', tkey: 'meta_title' },
  meta_description: { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', tkey: 'meta_description' },
  noindex: { namespace: 'seo', key: 'hidden', type: 'number_integer' },
};

// Clé de comparaison d'une image du CDN Shopify : nom de fichier sans requête ni suffixe de taille (_600x, _600x600_crop_center, @2x).
export function shopifyImageKey(src) {
  let name;
  try {
    name = new URL(src, 'https://x').pathname.split('/').pop();
  } catch {
    name = String(src).split('?')[0].split('/').pop();
  }
  name = decodeURIComponent(name).toLowerCase();
  return name.replace(/_(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:_crop_[a-z]+)?(?:@\dx)?(?=\.[a-z0-9]+$)/, '').replace(/_crop_[a-z]+(?=\.[a-z0-9]+$)/, '');
}

export default class ShopifyConnector extends Connector {
  static id = 'shopify';
  static label = 'Shopify';
  static fields = ['seo_title', 'meta_description', 'h1', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    shop: 'Domaine myshopify de la boutique, ex. ma-boutique.myshopify.com (le site public peut être sur un domaine personnalisé)',
    accessToken: 'Jeton d’accès Admin API d’une app personnalisée (env : ARACHNIDE_SHOPIFY_TOKEN). Scopes : read_products, write_products, read_content, write_content (ou read/write_online_store_pages), read_online_store_navigation, write_online_store_navigation, read_files, write_files ; pour les URL traduites : read_locales, read_translations, write_translations',
    apiVersion: `Version de l’Admin API (défaut ${DEFAULT_VERSION})`,
  };

  constructor(site, opts) {
    super(site, opts);
    this.apiVersion = site.apiVersion || DEFAULT_VERSION;
    const shop = String(site.shop || '').trim().replace(/\/+$/, '');
    const host = shop || (/\.myshopify\.com$/i.test(new URL(site.url).hostname) ? new URL(site.url).hostname : '');
    // Une origine complète (http://…) est acceptée, utile pour les tests ou un proxy.
    this.shopOrigin = host ? (/^https?:\/\//i.test(host) ? new URL(host).origin : `https://${host}`) : '';
    this.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }

  get endpoint() {
    if (!this.shopOrigin) throw new ConnectorError('config', 'Shopify : réglage « shop » manquant.', 'Indiquez le domaine myshopify de la boutique (ex. ma-boutique.myshopify.com) dans la configuration du site.');
    if (!this.site.accessToken) throw new ConnectorError('config', 'Shopify : jeton d’accès manquant.', 'Créez une app personnalisée (Paramètres > Apps > Développer des apps, ou le Dev Dashboard), installez-la et renseignez son jeton Admin API dans ARACHNIDE_SHOPIFY_TOKEN.');
    return `${this.shopOrigin}/admin/api/${this.apiVersion}/graphql.json`;
  }

  // Appel GraphQL : erreurs de haut niveau, limitation de débit (THROTTLED / 429 → une seule nouvelle tentative).
  // Doc : https://shopify.dev/docs/api/admin-graphql#rate-limits et https://shopify.dev/docs/api/usage/limits
  async gql(query, variables = {}, retried = false) {
    let res;
    try {
      res = await this.http(this.endpoint, { method: 'POST', headers: { 'X-Shopify-Access-Token': this.site.accessToken }, body: { query, variables } });
    } catch (e) {
      if (!retried && e.code === 'http' && /→ 429\b/.test(e.message)) {
        await this.sleep(2000);
        return this.gql(query, variables, true);
      }
      if (e.code === 'auth') e.hint = 'Vérifiez le jeton Admin API (ARACHNIDE_SHOPIFY_TOKEN) et le domaine myshopify de la boutique.';
      throw e;
    }
    const errors = res?.errors;
    if (errors) {
      const list = Array.isArray(errors) ? errors : [{ message: String(errors) }];
      if (!retried && list.some((e) => e.extensions?.code === 'THROTTLED')) {
        const t = res.extensions?.cost;
        const need = (t?.requestedQueryCost || 50) - (t?.throttleStatus?.currentlyAvailable || 0);
        const rate = t?.throttleStatus?.restoreRate || 50;
        await this.sleep(Math.min(10000, Math.max(1000, Math.ceil((need / rate) * 1000))));
        return this.gql(query, variables, true);
      }
      const msg = list.map((e) => e.message).join(' ; ');
      if (list.some((e) => e.extensions?.code === 'ACCESS_DENIED') || /access denied/i.test(msg)) {
        throw new ConnectorError('auth', `Shopify : accès refusé (${msg}).`, 'Ajoutez les scopes manquants à l’app personnalisée, puis réinstallez-la pour obtenir un nouveau jeton.');
      }
      throw new ConnectorError('http', `Shopify : erreur GraphQL (${msg}).`);
    }
    return res?.data || {};
  }

  // Erreurs métier d'une mutation (userErrors).
  check(payload, what) {
    const errs = payload?.userErrors || [];
    if (errs.length) throw new ConnectorError('http', `Shopify : ${what} refusé (${errs.map((e) => (e.field ? `${[].concat(e.field).join('.')} : ` : '') + e.message).join(' ; ')}).`);
    return payload;
  }

  async test() {
    const d = await this.gql('{ shop { name myshopifyDomain primaryDomain { url } } currentAppInstallation { accessScopes { handle } } }');
    const scopes = (d.currentAppInstallation?.accessScopes || []).map((s) => s.handle);
    const missing = [
      ['write_products', 'write_products'],
      ['write_content', 'write_content', 'write_online_store_pages'],
      ['write_online_store_navigation', 'write_online_store_navigation'],
      ['write_files', 'write_files', 'write_themes'],
    ].filter(([, ...alts]) => !alts.some((s) => scopes.includes(s))).map(([n]) => n);
    return {
      ok: true,
      details: `${d.shop?.name} (${d.shop?.myshopifyDomain}, ${d.shop?.primaryDomain?.url}) · Admin API ${this.apiVersion} · scopes : ${scopes.join(', ') || '?'}${missing.length ? ` · manquants : ${missing.join(', ')}` : ''}`,
    };
  }

  // --- URL → ressource -------------------------------------------------------------------------

  async locales() {
    return this.memo('locales', async () => {
      const d = await this.gql('{ shopLocales { locale primary published } }');
      return d.shopLocales || [];
    });
  }

  // Découpe le chemin public : { locale (langue secondaire ou null), parts }.
  async parse(url) {
    const parts = this.path(url).split('/').filter(Boolean);
    let locale = null;
    if (parts.length > 1 && /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i.test(parts[0]) && (TYPES[parts[1]] || parts[1] === 'collections')) {
      const prefix = parts.shift().toLowerCase();
      const all = await this.locales();
      const found = all.find((l) => l.locale.toLowerCase() === prefix) || all.find((l) => l.locale.toLowerCase() === prefix.split('-')[0]);
      if (!found) throw new ConnectorError('not_found', `Shopify : préfixe de langue « ${prefix} » inconnu de la boutique (${url}).`);
      if (!found.primary) locale = found.locale;
    }
    return { locale, parts };
  }

  async resolve(url) {
    return this.memo(`res:${url}`, async () => {
      const { locale, parts } = await this.parse(url);
      if (!parts.length) {
        throw new ConnectorError('unsupported', 'Shopify : le titre et la meta description de la page d’accueil ne sont pas modifiables par l’API.', 'Modifiez-les dans Boutique en ligne > Préférences.');
      }
      const [section, a, b, c] = parts;
      let r = null;
      // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/productByIdentifier
      if (section === 'products' && a && !b) r = await this.byHandle('product', a);
      else if (section === 'collections' && a && b === 'products' && c) r = await this.byHandle('product', c);
      // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/collectionByIdentifier
      else if (section === 'collections' && a && !b) r = await this.byHandle('collection', a);
      // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/pages
      else if (section === 'pages' && a && !b) r = await this.byHandle('page', a);
      // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/blogs et /queries/articles
      else if (section === 'blogs' && a && !b) r = await this.byHandle('blog', a);
      else if (section === 'blogs' && a && b && b !== 'tagged' && !c) r = await this.article(a, b);
      if (!r) throw new ConnectorError('not_found', `Shopify : aucune ressource ne correspond à ${url}.`, 'Seules les URL /products/…, /collections/…, /pages/…, /blogs/… sont modifiables (avec leur handle dans la langue principale).');
      return { ...r, locale };
    });
  }

  async byHandle(type, handle) {
    const q = {
      product: 'query($h: String!) { r: productByIdentifier(identifier: { handle: $h }) { id handle } }',
      collection: 'query($h: String!) { r: collectionByIdentifier(identifier: { handle: $h }) { id handle } }',
      page: 'query($q: String!) { c: pages(first: 5, query: $q) { nodes { id handle } } }',
      blog: 'query($q: String!) { c: blogs(first: 5, query: $q) { nodes { id handle } } }',
    }[type];
    const d = await this.gql(q, { h: handle, q: `handle:${JSON.stringify(handle)}` });
    const node = d.r || (d.c?.nodes || []).find((n) => n.handle === handle);
    return node ? { type, id: node.id } : null;
  }

  async article(blog, handle) {
    const d = await this.gql('query($q: String!) { articles(first: 20, query: $q) { nodes { id handle blog { handle } } } }', { q: `handle:${JSON.stringify(handle)}` });
    const node = (d.articles?.nodes || []).find((n) => n.handle === handle && n.blog?.handle === blog);
    return node ? { type: 'article', id: node.id } : null;
  }

  // --- Lecture / écriture ----------------------------------------------------------------------

  async get(change) {
    const { field } = change;
    if (field === 'redirect') return (await this.findRedirect(change.url))?.target ?? null;
    const res = await this.resolve(change.url);
    if (field === 'image_alt') return (await this.media(res, change.target)).alt || null;
    if (res.locale && field !== 'noindex') return this.getTranslation(res, field);
    const d = await this.gql(
      `query($id: ID!) { node(id: $id) { id
        ... on HasMetafields { t: metafield(namespace: "global", key: "title_tag") { value } d: metafield(namespace: "global", key: "description_tag") { value } h: metafield(namespace: "seo", key: "hidden") { value } }
        ... on Product { title } ... on Collection { title } ... on Page { title } ... on Article { title } ... on Blog { title } } }`,
      { id: res.id },
    );
    const n = d.node;
    if (!n) throw new ConnectorError('not_found', `Shopify : ressource ${res.id} introuvable.`);
    if (field === 'seo_title') return n.t?.value || null;
    if (field === 'meta_description') return n.d?.value || null;
    if (field === 'h1') return n.title ?? null;
    if (field === 'noindex') return n.h?.value === '1';
    return super.get(change);
  }

  async set(change) {
    const { field, value } = change;
    if (field === 'redirect') return this.setRedirect(change.url, value);
    const res = await this.resolve(change.url);
    if (field === 'image_alt') return this.setAlt(res, change.target, value);
    if (res.locale && field !== 'noindex') return this.setTranslation(res, field, value);
    if (field === 'h1') return this.setTitle(res, value);
    const m = META[field];
    if (!m) return super.set(change);
    const remove = field === 'noindex' ? !value : value === null || value === '';
    // Doc : https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet et /mutations/metafieldsDelete
    if (remove) {
      const d = await this.gql('mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { deletedMetafields { key } userErrors { field message } } }', {
        m: [{ ownerId: res.id, namespace: m.namespace, key: m.key }],
      });
      this.check(d.metafieldsDelete, 'suppression du métachamp');
    } else {
      const d = await this.gql('mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { key value } userErrors { field message code } } }', {
        m: [{ ownerId: res.id, namespace: m.namespace, key: m.key, type: m.type, value: field === 'noindex' ? '1' : String(value) }],
      });
      this.check(d.metafieldsSet, 'enregistrement du métachamp');
    }
    return { ok: true };
  }

  async setTitle(res, value) {
    if (value === null || value === '') throw new ConnectorError('unsupported', 'Shopify : le titre (H1) est obligatoire et ne peut pas être vidé.');
    const title = String(value);
    let d;
    // Doc : https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate (et collectionUpdate, pageUpdate, articleUpdate, blogUpdate)
    if (res.type === 'product') {
      d = (await this.gql('mutation($p: ProductUpdateInput!) { r: productUpdate(product: $p) { userErrors { field message } } }', { p: { id: res.id, title } })).r;
    } else if (res.type === 'collection') {
      // L'argument « collection » remplace « input » depuis la version 2026-07.
      d = this.apiVersion >= '2026-07'
        ? (await this.gql('mutation($c: CollectionUpdateInput!) { r: collectionUpdate(collection: $c) { userErrors { field message } } }', { c: { id: res.id, title } })).r
        : (await this.gql('mutation($c: CollectionInput!) { r: collectionUpdate(input: $c) { userErrors { field message } } }', { c: { id: res.id, title } })).r;
    } else if (res.type === 'page') {
      d = (await this.gql('mutation($id: ID!, $p: PageUpdateInput!) { r: pageUpdate(id: $id, page: $p) { userErrors { code field message } } }', { id: res.id, p: { title } })).r;
    } else if (res.type === 'article') {
      d = (await this.gql('mutation($id: ID!, $a: ArticleUpdateInput!) { r: articleUpdate(id: $id, article: $a) { userErrors { code field message } } }', { id: res.id, a: { title } })).r;
    } else {
      d = (await this.gql('mutation($id: ID!, $b: BlogUpdateInput!) { r: blogUpdate(id: $id, blog: $b) { userErrors { code field message } } }', { id: res.id, b: { title } })).r;
    }
    this.check(d, 'changement de titre');
    return { ok: true };
  }

  // --- Traductions (URL préfixées par une langue secondaire) ----------------------------------
  // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/translatableResource et /mutations/translationsRegister

  tkey(field) {
    if (field === 'h1') return 'title';
    if (META[field]?.tkey) return META[field].tkey;
    throw new ConnectorError('unsupported', `Shopify : « ${field} » n’est pas traduisible par l’API.`, 'Ce champ est commun à toutes les langues : modifiez-le sur l’URL de la langue principale.');
  }

  async translatable(res, locale) {
    const d = await this.gql('query($id: ID!, $l: String!) { translatableResource(resourceId: $id) { translatableContent { key value digest } translations(locale: $l) { key value } } }', { id: res.id, l: locale });
    return d.translatableResource || { translatableContent: [], translations: [] };
  }

  async getTranslation(res, field) {
    const key = this.tkey(field);
    const t = await this.translatable(res, res.locale);
    return t.translations.find((x) => x.key === key)?.value || null;
  }

  async setTranslation(res, field, value) {
    const key = this.tkey(field);
    if (value === null || value === '') {
      const d = await this.gql('mutation($id: ID!, $k: [String!]!, $l: [String!]!) { translationsRemove(resourceId: $id, translationKeys: $k, locales: $l) { translations { key } userErrors { field message } } }', { id: res.id, k: [key], l: [res.locale] });
      this.check(d.translationsRemove, 'suppression de la traduction');
      return { ok: true };
    }
    const t = await this.translatable(res, res.locale);
    const src = t.translatableContent.find((x) => x.key === key);
    if (!src?.digest) {
      throw new ConnectorError('unsupported', `Shopify : pas de contenu source « ${key} » à traduire pour cette ressource.`, 'Renseignez d’abord la valeur dans la langue principale (Shopify ne traduit que les champs remplis).');
    }
    const d = await this.gql('mutation($id: ID!, $t: [TranslationInput!]!) { translationsRegister(resourceId: $id, translations: $t) { translations { key value } userErrors { field message } } }', {
      id: res.id,
      t: [{ locale: res.locale, key, value: String(value), translatableContentDigest: src.digest }],
    });
    this.check(d.translationsRegister, 'enregistrement de la traduction');
    return { ok: true };
  }

  // --- Texte alternatif des médias produit -----------------------------------------------------

  async media(res, src) {
    if (res.type !== 'product') throw new ConnectorError('unsupported', 'Shopify : seul le texte alternatif des médias produit est modifiable par l’API.', 'Pour les autres images, modifiez l’alt dans l’éditeur de thème ou le contenu.');
    if (res.locale) throw new ConnectorError('unsupported', 'Shopify : modifiez le texte alternatif sur l’URL de la langue principale.');
    if (!src) throw new ConnectorError('config', 'Shopify : image_alt demande la src de l’image (target).');
    const d = await this.gql('query($id: ID!) { product(id: $id) { media(first: 250) { nodes { id alt mediaContentType ... on MediaImage { image { url } } } } } }', { id: res.id });
    const key = shopifyImageKey(src);
    const m = (d.product?.media?.nodes || []).find((n) => n.image?.url && shopifyImageKey(n.image.url) === key);
    if (!m) throw new ConnectorError('not_found', `Shopify : image ${src} absente des médias du produit.`, 'L’image vient peut-être du thème ou de la description : modifiez son alt à cet endroit.');
    return m;
  }

  async setAlt(res, src, value) {
    const m = await this.media(res, src);
    // Doc : https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileUpdate (remplace productUpdateMedia, déprécié)
    const d = await this.gql('mutation($f: [FileUpdateInput!]!) { fileUpdate(files: $f) { files { id alt } userErrors { code field message } } }', { f: [{ id: m.id, alt: value ?? '' }] });
    this.check(d.fileUpdate, 'changement du texte alternatif');
    return { ok: true };
  }

  // --- Redirections 301 -------------------------------------------------------------------------
  // Doc : https://shopify.dev/docs/api/admin-graphql/latest/queries/urlRedirects et /mutations/urlRedirectCreate

  redirectPath(url) {
    const u = new URL(url, this.origin);
    return (decodeURIComponent(u.pathname).replace(/(.)\/+$/, '$1') || '/') + u.search;
  }

  async findRedirect(url) {
    const path = this.redirectPath(url);
    const d = await this.gql('query($q: String!) { urlRedirects(first: 50, query: $q) { nodes { id path target } } }', { q: `path:${JSON.stringify(path)}` });
    const norm = (p) => p.toLowerCase().replace(/(.)\/+$/, '$1');
    return (d.urlRedirects?.nodes || []).find((r) => norm(r.path) === norm(path)) || null;
  }

  target(value) {
    const u = new URL(String(value), this.origin);
    return u.origin === this.origin ? u.pathname + u.search + u.hash : u.href;
  }

  async setRedirect(url, value) {
    const found = await this.findRedirect(url);
    if (value === null || value === '') {
      if (found) this.check((await this.gql('mutation($id: ID!) { urlRedirectDelete(id: $id) { deletedUrlRedirectId userErrors { field message } } }', { id: found.id })).urlRedirectDelete, 'suppression de la redirection');
      return { ok: true };
    }
    const input = { path: this.redirectPath(url), target: this.target(value) };
    if (found) {
      this.check((await this.gql('mutation($id: ID!, $r: UrlRedirectInput!) { urlRedirectUpdate(id: $id, urlRedirect: $r) { urlRedirect { id } userErrors { field message } } }', { id: found.id, r: input })).urlRedirectUpdate, 'modification de la redirection');
    } else {
      this.check((await this.gql('mutation($r: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $r) { urlRedirect { id } userErrors { field message } } }', { r: input })).urlRedirectCreate, 'création de la redirection');
    }
    return { ok: true };
  }
}
