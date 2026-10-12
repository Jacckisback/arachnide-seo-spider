// Connecteur WordPress : API REST du cœur (wp/v2) avec mots de passe d'application (WordPress ≥ 5.6),
// complétée par le plugin compagnon integrations/wordpress/arachnide-connector pour les champs SEO
// (titre, description, canonical, noindex : stockés par Yoast / Rank Math / AIOSEO / SEOPress ou par le plugin)
// et les redirections (extension Redirection si active, sinon option du plugin).
//
// Docs :
//   Authentification      https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/#basic-authentication-with-application-passwords
//   Découverte de l'API   https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
//   Contenus              https://developer.wordpress.org/rest-api/reference/posts/ (pages, types personnalisés : même schéma)
//   Termes                https://developer.wordpress.org/rest-api/reference/categories/ (tags, taxonomies personnalisées)
//   Types / taxonomies    https://developer.wordpress.org/rest-api/reference/post-types/ , …/reference/taxonomies/
//   Médias                https://developer.wordpress.org/rest-api/reference/media/
//   Réglages              https://developer.wordpress.org/rest-api/reference/settings/
import { Connector, ConnectorError, setImageAltInHtml, getImageAltInHtml } from './base.mjs';

const PLUGIN_HINT = 'Install and activate the companion plugin integrations/wordpress/arachnide-connector (zip the folder, then Plugins > Add New > Upload Plugin).';
const SEO_FIELDS = ['seo_title', 'meta_description', 'canonical', 'noindex'];
// Types internes de WordPress qui n'ont pas d'URL publique.
const SKIP_TYPES = new Set(['attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face']);

// Forme comparable d'une URL : hôte sans www, chemin décodé sans / final, requête conservée (?p=123).
export function normUrl(u) {
  try {
    const x = new URL(u);
    let p = x.pathname;
    try {
      p = decodeURIComponent(p);
    } catch {}
    return x.hostname.toLowerCase().replace(/^www\./, '') + p.replace(/\/+$/, '').toLowerCase() + x.search;
  } catch {
    return String(u);
  }
}

// Nom de fichier d'image sans dimensions WordPress (-300x200), ni « -scaled », ni extension.
const imageKey = (src) => {
  try {
    src = new URL(src, 'http://x').pathname;
  } catch {}
  return decodeURIComponent(src.split('/').pop() || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-\d+x\d+$/, '')
    .replace(/-(scaled|rotated)$/, '')
    .toLowerCase();
};

export default class WordPressConnector extends Connector {
  static id = 'wordpress';
  static label = 'WordPress';
  static fields = ['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    user: 'WordPress username (an Editor is enough for content; Administrator for redirects)',
    appPassword: 'Application password, Users > Profile > Application Passwords (env: ARACHNIDE_WP_APP_PASSWORD)',
    restBase: 'Optional REST API root, e.g. https://example.com/wp-json (default: auto-discovered; ?rest_route= is used when pretty permalinks are off)',
  };

  constructor(site, opts) {
    super(site, opts);
    this.siteUrl = String(site.url).replace(/[?#].*$/, '').replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- HTTP

  authHeader() {
    const { user, appPassword } = this.site;
    if (!user || !appPassword) {
      throw new ConnectorError('config', 'WordPress connector needs "user" and "appPassword".', 'Create an application password in Users > Profile > Application Passwords and set it in ARACHNIDE_WP_APP_PASSWORD.');
    }
    return 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
  }

  // Racine de l'API : réglage restBase, sinon <site>/wp-json, sinon en-tête Link rel="https://api.w.org/", sinon ?rest_route=.
  // https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
  async restRoot() {
    return this.memo('root', async () => {
      if (this.site.restBase) return String(this.site.restBase).replace(/\/+$/, '');
      const probe = async (base) => {
        try {
          const res = await this.fetchImpl(this.buildUrl(base, '/'), { headers: { accept: 'application/json', authorization: this.authHeader() }, signal: AbortSignal.timeout(15000) });
          const j = await res.json().catch(() => null);
          // 401/403 au format WP_Error : l'API existe, l'erreur d'identifiants sera signalée par l'appel suivant.
          if (res.status === 401 || res.status === 403) return !!(j && typeof j.code === 'string');
          return res.ok && !!(j && Array.isArray(j.namespaces));
        } catch (e) {
          if (e instanceof ConnectorError) throw e;
          return false;
        }
      };
      const pretty = `${this.siteUrl}/wp-json`;
      if (await probe(pretty)) return pretty;
      try {
        const res = await this.fetchImpl(this.siteUrl + '/', { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        const m = /<([^>]+)>\s*;\s*rel="https:\/\/api\.w\.org\/"/.exec(res.headers.get('link') || '');
        if (m) {
          const base = m[1].replace(/\/+$/, '');
          if (await probe(base)) return base;
        }
      } catch {}
      const plain = `${this.siteUrl}/?rest_route=`;
      if (await probe(plain)) return plain;
      throw new ConnectorError('config', `No WordPress REST API found at ${this.siteUrl}.`, 'Check the site URL, that the REST API is not disabled by a security plugin, or set "restBase" (e.g. https://example.com/wp-json).');
    });
  }

  // base + route (« /wp/v2/posts?slug=x ») ; en mode ?rest_route=, la requête de la route passe après « & ».
  buildUrl(base, route) {
    if (/[?&]rest_route=$/.test(base)) {
      const [p, q] = route.split('?');
      return base + p + (q ? '&' + q : '');
    }
    return base + route;
  }

  async api(route, opts = {}) {
    const root = await this.restRoot();
    try {
      return await this.http(this.buildUrl(root, route), { ...opts, headers: { authorization: this.authHeader(), ...opts.headers } });
    } catch (e) {
      if (e.code === 'auth') {
        e.hint = 'Check "user" and the application password (Users > Profile > Application Passwords; HTTPS is required). If the password is right, your host may strip the Authorization header: add SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1 to .htaccess. Redirects need an Administrator account.';
      } else if (e.code === 'http') {
        if (/arachnide_unsupported/.test(e.message)) {
          const m = /"message":"((?:[^"\\]|\\.)*)"/.exec(e.message);
          throw new ConnectorError('unsupported', `WordPress: ${m ? JSON.parse(`"${m[1]}"`) : 'not supported by the active SEO plugin'}`);
        }
        if (/rest_no_route/.test(e.message) && route.startsWith('/arachnide/')) {
          throw new ConnectorError('unsupported', 'WordPress: the Arachnide Connector plugin is not active on this site.', PLUGIN_HINT);
        }
        if (/rest_(post|term)_invalid_id|arachnide_not_found|rest_invalid_param.*\bid\b/.test(e.message) && / → 404 /.test(e.message)) {
          throw new ConnectorError('not_found', `WordPress: resource not found (${route.split('?')[0]}).`);
        }
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- Découverte

  // Plugin compagnon : null s'il n'est pas installé. https://…/integrations/wordpress/arachnide-connector
  async plugin() {
    return this.memo('plugin', async () => {
      const root = await this.restRoot();
      const s = await this.http(this.buildUrl(root, '/arachnide/v1/status'), { headers: { authorization: this.authHeader() }, allow404: true });
      return s && typeof s === 'object' ? s : null;
    });
  }

  async requirePlugin() {
    const p = await this.plugin();
    if (!p) throw new ConnectorError('unsupported', 'WordPress: SEO title, meta description, canonical, noindex and redirects need the Arachnide Connector plugin (the core REST API cannot write SEO plugin data).', PLUGIN_HINT);
    return p;
  }

  // Index de l'API : adresse d'accueil (home) réelle, utile pour les installations en sous-dossier.
  async index() {
    return this.memo('index', () => this.api('/'));
  }

  // https://developer.wordpress.org/rest-api/reference/post-types/#list-types
  async types() {
    return this.memo('types', async () => {
      const t = await this.api('/wp/v2/types?context=edit');
      const list = Object.values(t || {}).filter((x) => x && x.rest_base && !SKIP_TYPES.has(x.slug));
      const rank = (x) => (x.slug === 'post' ? 0 : x.slug === 'page' ? 1 : x.slug === 'product' ? 2 : 3);
      return list.sort((a, b) => rank(a) - rank(b)).map((x) => ({ slug: x.slug, ns: x.rest_namespace || 'wp/v2', base: x.rest_base }));
    });
  }

  // https://developer.wordpress.org/rest-api/reference/taxonomies/#list-taxonomies
  async taxonomies() {
    return this.memo('taxonomies', async () => {
      const t = await this.api('/wp/v2/taxonomies?context=edit');
      return Object.values(t || {})
        .filter((x) => x && x.rest_base && x.visibility?.public !== false && x.slug !== 'nav_menu' && x.slug !== 'wp_pattern_category')
        .map((x) => ({ slug: x.slug, ns: x.rest_namespace || 'wp/v2', base: x.rest_base }));
    });
  }

  // URL publique → { kind: 'post'|'term'|'home', id, ns, base, subtype }.
  async resolve(url) {
    const key = normUrl(url);
    return this.memo('res:' + key, async () => {
      const plugin = await this.plugin();
      if (plugin) {
        // Le plugin utilise url_to_postid() + liens des termes : fiable pour toutes les structures de permaliens.
        const r = await this.api('/arachnide/v1/resolve?url=' + encodeURIComponent(url), { allow404: true });
        if (!r) throw new ConnectorError('not_found', `WordPress: no post, page or term found for ${url}.`);
        return { kind: r.kind, id: r.id, ns: r.rest_namespace || 'wp/v2', base: r.rest_base || null, subtype: r.subtype };
      }
      return this.resolveCore(url, key);
    });
  }

  async resolveCore(url, key) {
    const u = new URL(url);
    const idx = await this.index();
    const home = idx?.home || this.siteUrl;
    if (key === normUrl(home)) {
      // Accueil : page statique si la lecture des réglages est permise (manage_options).
      let s = null;
      try {
        s = await this.api('/wp/v2/settings');
      } catch (e) {
        if (e.code !== 'auth') throw e;
      }
      if (s?.show_on_front === 'page' && s.page_on_front) return { kind: 'post', id: s.page_on_front, ns: 'wp/v2', base: 'pages', subtype: 'page' };
      return { kind: 'home', id: 0 };
    }
    // Permaliens simples : ?p=123, ?page_id=123
    const qid = u.searchParams.get('p') || u.searchParams.get('page_id');
    const types = await this.types();
    if (qid && /^\d+$/.test(qid)) {
      for (const t of types.filter((x) => x.slug === (u.searchParams.has('page_id') ? 'page' : 'post'))) {
        const o = await this.api(`/${t.ns}/${t.base}/${qid}?context=edit&_fields=id,link`, { allow404: true });
        if (o && normUrl(o.link) === key) return { kind: 'post', id: o.id, ns: t.ns, base: t.base, subtype: t.slug };
      }
    }
    const rel = u.pathname.replace(/\/+$/, '');
    const seg = rel.split('/').filter(Boolean).pop();
    if (seg) {
      let slug = seg;
      try {
        slug = decodeURIComponent(seg);
      } catch {}
      slug = encodeURIComponent(slug.toLowerCase());
      const find = (list) => (Array.isArray(list) ? list.find((o) => normUrl(o.link) === key) : null);
      for (const t of types) {
        const list = await this.api(`/${t.ns}/${t.base}?slug=${slug}&context=edit&_fields=id,link&per_page=20`, { allow404: true }).catch((e) => {
          if (e.code === 'http' || e.code === 'auth') return null; // type non listable par ce compte
          throw e;
        });
        const o = find(list);
        if (o) return { kind: 'post', id: o.id, ns: t.ns, base: t.base, subtype: t.slug };
      }
      for (const t of await this.taxonomies()) {
        const list = await this.api(`/${t.ns}/${t.base}?slug=${slug}&context=edit&_fields=id,link&per_page=20`, { allow404: true }).catch((e) => {
          if (e.code === 'http' || e.code === 'auth') return null;
          throw e;
        });
        const o = find(list);
        if (o) return { kind: 'term', id: o.id, ns: t.ns, base: t.base, subtype: t.slug };
      }
    }
    throw new ConnectorError('not_found', `WordPress: no published post, page, product or term has the URL ${url}.`, 'Check the URL (pagination, archives and search pages are not editable). Installing the Arachnide Connector plugin enables url_to_postid() lookups.');
  }

  async resource(url, forField) {
    const r = await this.resolve(url);
    if (r.kind === 'home') {
      throw new ConnectorError('unsupported', `WordPress: the home page lists the latest posts and has no editable content for ${forField}.`, 'Edit it in your theme / SEO plugin settings, or set a static front page (Settings > Reading).');
    }
    return r;
  }

  objectRoute(r, extra = '') {
    if (!r.base) throw new ConnectorError('unsupported', `WordPress: "${r.subtype}" is not exposed in the REST API (show_in_rest is off).`);
    return `/${r.ns}/${r.base}/${r.id}${extra}`;
  }

  // ---------------------------------------------------------------- test()

  // https://developer.wordpress.org/rest-api/reference/users/#retrieve-a-user (users/me)
  async test() {
    const me = await this.api('/wp/v2/users/me?context=edit');
    const roles = (me?.roles || []).join(', ') || 'no role';
    const plugin = await this.plugin();
    const parts = [`Logged in as ${me?.name || me?.slug || this.site.user} (${roles})`];
    if (plugin) {
      parts.push(`Arachnide Connector ${plugin.version} on WordPress ${plugin.wp_version}`);
      parts.push(plugin.seo_plugin ? `SEO plugin: ${plugin.seo_plugin}${plugin.seo_plugin_version ? ' ' + plugin.seo_plugin_version : ''}` : 'no SEO plugin (values stored and output by Arachnide Connector)');
      parts.push(`redirects: ${plugin.redirects}${plugin.can_manage_redirects ? '' : ' (needs an Administrator account)'}`);
    } else {
      parts.push('Arachnide Connector plugin not installed: only h1 and image_alt can be changed. ' + PLUGIN_HINT);
    }
    if (!me?.capabilities?.edit_posts && me?.capabilities) parts.push('warning: this user cannot edit posts');
    return { ok: true, details: parts.join('; ') + '.' };
  }

  // ---------------------------------------------------------------- get / set

  async get(change) {
    const { field } = change;
    if (field === 'redirect') return this.getRedirect(change.url);
    if (SEO_FIELDS.includes(field)) {
      await this.requirePlugin();
      const r = await this.resource(change.url, field);
      const m = await this.api(`/arachnide/v1/meta?kind=${r.kind}&id=${r.id}`);
      const v = m?.[field];
      if (field === 'noindex') return typeof v === 'boolean' ? v : null;
      return v === '' || v === undefined ? null : v;
    }
    if (field === 'h1') {
      const r = await this.resource(change.url, field);
      const o = await this.api(this.objectRoute(r, '?context=edit'));
      const v = r.kind === 'term' ? o?.name : o?.title?.raw;
      return v ? v : null;
    }
    if (field === 'image_alt') {
      const loc = await this.locateImage(change);
      return loc.alt === '' || loc.alt === undefined ? null : loc.alt;
    }
    return super.get(change);
  }

  async set(change) {
    const { field, value } = change;
    if (field === 'redirect') return this.setRedirect(change.url, value);
    if (SEO_FIELDS.includes(field)) {
      await this.requirePlugin();
      const r = await this.resource(change.url, field);
      await this.api('/arachnide/v1/meta', { method: 'POST', body: { kind: r.kind, id: r.id, field, value } });
      return;
    }
    if (field === 'h1') {
      if (value === null || value === '') throw new ConnectorError('unsupported', 'WordPress: removing the title (H1) is not supported; give the new title text.');
      const r = await this.resource(change.url, field);
      // https://developer.wordpress.org/rest-api/reference/posts/#update-a-post (title) / categories (name)
      await this.api(this.objectRoute(r), { method: 'POST', body: r.kind === 'term' ? { name: value } : { title: value } });
      return;
    }
    if (field === 'image_alt') {
      const loc = await this.locateImage(change);
      if (loc.where === 'content') {
        const { html, found } = setImageAltInHtml(loc.content, change.target, value ?? '');
        if (!found) throw new ConnectorError('not_found', `WordPress: image ${change.target} not found in the content.`);
        await this.api(this.objectRoute(loc.r), { method: 'POST', body: { content: html } });
      } else {
        // https://developer.wordpress.org/rest-api/reference/media/#update-a-media-item (alt_text)
        await this.api(`/wp/v2/media/${loc.mediaId}`, { method: 'POST', body: { alt_text: value ?? '' } });
      }
      return;
    }
    return super.set(change);
  }

  // Image dans le contenu (content.raw → réécriture de la balise <img>) ou, à défaut, pièce jointe de la
  // médiathèque (image mise en avant, galerie produit… rendues par wp_get_attachment_image → alt_text).
  async locateImage(change) {
    if (!change.target) throw new ConnectorError('config', 'image_alt needs "target": the image src.');
    const r = await this.resource(change.url, 'image_alt');
    const o = await this.api(this.objectRoute(r, '?context=edit'));
    const content = r.kind === 'post' ? o?.content?.raw : undefined;
    if (typeof content === 'string') {
      const alt = getImageAltInHtml(content, change.target);
      if (alt !== undefined) return { where: 'content', r, content, alt };
    }
    const key = imageKey(change.target);
    const candidates = [];
    if (o?.featured_media) candidates.push(o.featured_media);
    if (Array.isArray(o?.gallery_images)) candidates.push(...o.gallery_images.map((g) => g.id || g));
    for (const id of candidates) {
      const m = await this.api(`/wp/v2/media/${id}?context=edit`, { allow404: true });
      if (m && this.mediaMatches(m, key)) return { where: 'media', r, mediaId: m.id, alt: m.alt_text };
    }
    // Recherche dans la médiathèque par nom de fichier (title/slug), confirmée par source_url.
    const found = await this.api(`/wp/v2/media?search=${encodeURIComponent(key)}&context=edit&per_page=20&media_type=image`, { allow404: true });
    const m = Array.isArray(found) ? found.find((x) => this.mediaMatches(x, key)) : null;
    if (m) return { where: 'media', r, mediaId: m.id, alt: m.alt_text };
    throw new ConnectorError('not_found', `WordPress: image ${change.target} is neither in the content of ${change.url} nor in the media library.`, 'It may come from the theme or a page builder: change its alt text there.');
  }

  mediaMatches(m, key) {
    if (imageKey(m.source_url || '') === key) return true;
    return Object.values(m.media_details?.sizes || {}).some((s) => imageKey(s.source_url || '') === key);
  }

  // ---------------------------------------------------------------- Redirections (plugin compagnon)

  sourcePath(url) {
    const u = new URL(url, this.siteUrl + '/');
    return u.pathname + u.search;
  }

  async getRedirect(url) {
    const p = await this.requirePlugin();
    if (!p.can_manage_redirects) throw new ConnectorError('auth', 'WordPress: redirects need an account with the manage_options capability (Administrator).');
    const r = await this.api('/arachnide/v1/redirect?source=' + encodeURIComponent(this.sourcePath(url)));
    if (!r?.target) return null;
    return new URL(r.target, this.siteUrl + '/').href;
  }

  async setRedirect(url, value) {
    const p = await this.requirePlugin();
    if (!p.can_manage_redirects) throw new ConnectorError('auth', 'WordPress: redirects need an account with the manage_options capability (Administrator).');
    await this.api('/arachnide/v1/redirect', { method: 'POST', body: { source: this.sourcePath(url), target: value ?? null } });
  }
}
