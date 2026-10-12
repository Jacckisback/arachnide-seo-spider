// Socle commun des connecteurs CMS : chaque connecteur sait lire et écrire un petit nombre de
// champs SEO d'une URL publique (titre SEO, meta description, H1, canonical, noindex, alt d'image, redirection).
//
// Un connecteur est une classe qui étend Connector et définit :
//   static id      identifiant ('wordpress', 'shopify'…)
//   static label   nom affiché
//   static fields  champs pris en charge (sous-ensemble de FIELDS)
//   static setup   description des réglages attendus dans la configuration du site (sans les secrets en clair)
//   async test()           vérifie l'accès (identifiants, droits) → { ok, details }
//   async get(change)      valeur actuelle du champ visé par la modification (null si absent)
//   async set(change)      écrit change.value (null = supprimer / revenir au défaut du CMS)
// Une modification (change) : { url, field, value, target? } ; target = src de l'image pour image_alt.
// Pour 'redirect', url est l'adresse à rediriger et value la destination (null = supprimer la redirection).

export const FIELDS = {
  seo_title: 'Balise <title> (titre SEO)',
  meta_description: 'Meta description',
  h1: 'Titre affiché (H1) du contenu',
  canonical: 'URL canonique',
  noindex: 'Exclusion de l’index (true / false)',
  image_alt: 'Texte alternatif d’une image (target = src de l’image)',
  redirect: 'Redirection 301 de url vers value',
};

export class ConnectorError extends Error {
  // code : 'auth' | 'not_found' | 'unsupported' | 'http' | 'config'
  constructor(code, message, hint = '') {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

export class Connector {
  static id = 'base';
  static label = 'Base';
  static fields = [];
  static setup = {};

  // site : { url, type, ...réglages propres au connecteur } ; secrets déjà résolus (variables d'environnement).
  constructor(site, { fetch = globalThis.fetch } = {}) {
    this.site = site;
    this.origin = new URL(site.url).origin;
    this.fetchImpl = fetch;
    this.cache = new Map();
  }

  supports(field) {
    return this.constructor.fields.includes(field);
  }

  async test() {
    return { ok: true, details: '' };
  }

  async get(change) {
    throw new ConnectorError('unsupported', `${this.constructor.label} : lecture de « ${change.field} » non prise en charge.`);
  }

  async set(change) {
    throw new ConnectorError('unsupported', `${this.constructor.label} : écriture de « ${change.field} » non prise en charge.`);
  }

  // Chemin de l'URL publique, relatif à la racine du site (sans / final sauf pour l'accueil).
  path(url) {
    const u = new URL(url, this.origin);
    const p = decodeURIComponent(u.pathname).replace(/\/+$/, '');
    return p || '/';
  }

  // Requête HTTP JSON avec erreurs explicites. opts : { method, headers, body (objet → JSON), raw }
  async http(url, opts = {}) {
    const headers = { accept: 'application/json', ...opts.headers };
    let body = opts.body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof URLSearchParams)) {
      body = JSON.stringify(body);
      headers['content-type'] ??= 'application/json';
    }
    let res;
    try {
      res = await this.fetchImpl(url, { method: opts.method || 'GET', headers, body, redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 30000) });
    } catch (e) {
      throw new ConnectorError('http', `${this.constructor.label} : impossible de joindre ${new URL(url).host} (${e.cause?.code || e.message}).`);
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError('auth', `${this.constructor.label} : accès refusé (${res.status}).`, 'Vérifiez les identifiants et les droits du compte dans la configuration du site.');
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      throw new ConnectorError('http', `${this.constructor.label} : ${opts.method || 'GET'} ${new URL(url).pathname} → ${res.status} ${text.slice(0, 300)}`);
    }
    if (opts.raw) return text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // Mémorise le résultat d'une recherche coûteuse (ex. URL → identifiant de contenu) le temps d'une session.
  async memo(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  }
}

// Remplace ou retire le premier élément qui correspond dans un HTML (utile pour les contenus éditables).
export function setImageAltInHtml(html, src, alt) {
  let found = false;
  const file = (s) => {
    try {
      return new URL(s, 'http://x').pathname.split('/').pop();
    } catch {
      return s;
    }
  };
  const target = file(src);
  const out = String(html).replace(/<img\b[^>]*>/gi, (tag) => {
    const m = /\ssrc=["']([^"']+)["']/i.exec(tag);
    if (found || !m || (m[1] !== src && file(m[1]) !== target)) return tag;
    found = true;
    // alt null : retire l'attribut (retour à l'état d'origine d'une image sans alt).
    if (alt === null) return tag.replace(/\salt=("[^"]*"|'[^']*'|[^\s>]*)/i, '');
    const escAlt = String(alt).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    if (/\salt=("[^"]*"|'[^']*'|[^\s>]*)/i.test(tag)) return tag.replace(/\salt=("[^"]*"|'[^']*'|[^\s>]*)/i, () => ` alt="${escAlt}"`);
    return tag.replace(/<img\b/i, () => `<img alt="${escAlt}"`);
  });
  return { html: out, found };
}

export function getImageAltInHtml(html, src) {
  const file = (s) => {
    try {
      return new URL(s, 'http://x').pathname.split('/').pop();
    } catch {
      return s;
    }
  };
  for (const tag of String(html).match(/<img\b[^>]*>/gi) || []) {
    const m = /\ssrc=["']([^"']+)["']/i.exec(tag);
    if (m && (m[1] === src || file(m[1]) === file(src))) {
      const a = /\salt=(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i.exec(tag);
      return a ? (a[1] ?? a[2] ?? a[3] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
    }
  }
  return undefined; // image absente de ce contenu
}
