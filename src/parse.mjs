// Extraction des données SEO d'une page HTML.
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { tokenize, topKeywords, simhash, countWords } from './text.mjs';
import { isValidHreflang } from './iso-codes.mjs';

const BLOCKS = 'p, div, li, td, th, h1, h2, h3, h4, h5, h6, br, section, article, header, footer, nav, aside, main, blockquote, dt, dd, figcaption, option, label, button, ul, ol, dl, table, tr, figure, form, fieldset, address, pre, hr';
const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:|sms:|ftp:|whatsapp:|skype:|#)/i;

export function resolveUrl(href, base) {
  if (!href) return null;
  const h = String(href).trim();
  if (!h || SKIP_SCHEMES.test(h)) return null;
  try {
    const u = new URL(h, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

// Analyse d'un attribut srcset selon l'algorithme HTML : les URL peuvent contenir des virgules
// (CDN d'images du type « w_400,h_300 »), seule une virgule suivie d'un descripteur ou d'un espace sépare les candidats.
export function parseSrcset(value, base) {
  const out = [];
  const s = String(value || '');
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j++;
    let url = s.slice(i, j);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let k = j;
      let depth = 0;
      while (k < s.length && (s[k] !== ',' || depth)) {
        if (s[k] === '(') depth++;
        else if (s[k] === ')') depth--;
        k++;
      }
      descriptor = s.slice(j, k).trim();
      j = k;
    }
    i = j;
    const abs = resolveUrl(url, base);
    if (abs) out.push({ url: abs, descriptor: /^\d+(\.\d+)?[wx]$/i.test(descriptor) ? descriptor.toLowerCase() : '' });
  }
  return out;
}

const IMG_EXT = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif', svg: 'svg', jxl: 'jxl', bmp: 'bmp', ico: 'ico', tif: 'tiff', tiff: 'tiff' };
export function imageFormat(url) {
  try {
    const u = new URL(url);
    const m = /\.([a-z0-9]{2,5})$/i.exec(u.pathname);
    if (m && IMG_EXT[m[1].toLowerCase()]) return IMG_EXT[m[1].toLowerCase()];
    // CDN : format dans les paramètres (?format=webp, ?fm=avif, f_auto…)
    const q = /(?:^|[?&,/])(?:format|fm|f)[=_](webp|avif|jpe?g|png|auto)\b/i.exec(u.search + u.pathname);
    return q ? (q[1].toLowerCase() === 'jpeg' ? 'jpg' : q[1].toLowerCase()) : '';
  } catch {
    return '';
  }
}

// Valeurs d'une meta : description / robots / viewport se lisent sur name= (pas property=, que Google ignore) ;
// og:* sur property= (ou name=). Espaces normalisés, valeurs vides écartées.
function metaContent($, names, { og = false } = {}) {
  const out = [];
  $('meta').each((_, el) => {
    const $el = $(el);
    const n = ((og ? $el.attr('property') || $el.attr('name') : $el.attr('name')) || '').toLowerCase().trim();
    if (!names.includes(n)) return;
    const v = ($el.attr('content') || '').replace(/\s+/g, ' ').trim();
    if (v) out.push(v);
  });
  return out;
}

// Propriétés REQUISES par Google pour obtenir le résultat enrichi (les propriétés seulement recommandées ne
// bloquent rien : Article, Organization, WebSite n'ont aucune propriété requise). Un tableau = l'une des propriétés.
export const SCHEMA_REQUIRED = {
  Product: ['name', ['offers', 'review', 'aggregateRating']],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  LocalBusiness: ['name', 'address'],
  Event: ['name', 'startDate', 'location'],
  Recipe: ['name', 'image'],
  Course: ['name', 'description'],
  Review: ['itemReviewed', 'reviewRating', 'author'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  JobPosting: ['title', 'description', 'datePosted', 'hiringOrganization', ['jobLocation', 'jobLocationType']],
  SoftwareApplication: ['name', ['offers', 'aggregateRating', 'review']],
};

// « https://schema.org/Product », « schema:Product », « Product » → « Product ».
const schemaType = (t) => String(t).trim().replace(/^(https?:\/\/)?(www\.)?schema\.org\/|^schema:/i, '').replace(/\/+$/, '');

// Types relevés partout ; propriétés requises vérifiées seulement sur les entités racines (bloc JSON-LD, membres de
// @graph, mainEntity) : un auteur ou un éditeur imbriqué n'est pas candidat à un résultat enrichi.
function collectSchema(node, types, entities, top = true) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectSchema(n, types, entities, top));
  const t = node['@type'];
  const keys = Object.keys(node).filter((k) => k !== '@context');
  const isRef = '@id' in node && keys.every((k) => k === '@id' || k === '@type');
  if (t) {
    for (const raw of Array.isArray(t) ? t : [t]) {
      const x = schemaType(raw);
      if (!x) continue;
      types.add(x);
      if (top && !isRef && SCHEMA_REQUIRED[x]) {
        const missing = SCHEMA_REQUIRED[x]
          .filter((req) => (Array.isArray(req) ? !req.some((r) => node[r] != null) : node[req] == null))
          .map((req) => (Array.isArray(req) ? req.join('|') : req));
        const key = x + ':' + missing.join(',');
        if (missing.length && !entities.some((e) => e.type + ':' + e.missing.join(',') === key)) entities.push({ type: x, missing });
      }
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === '@context' || !v || typeof v !== 'object') continue;
    collectSchema(v, types, entities, k === '@graph' || (k === 'mainEntity' && top));
  }
}

function linkPosition($el) {
  if ($el.closest('nav, [role="navigation"]').length) return 'nav';
  if ($el.closest('header, [role="banner"]').length) return 'header';
  if ($el.closest('footer, [role="contentinfo"]').length) return 'footer';
  if ($el.closest('aside, [role="complementary"]').length) return 'aside';
  return 'content';
}

// Dimensions réservées : attributs width/height numériques, ou largeur + hauteur (ou aspect-ratio) en style inline.
function hasDimensions($el) {
  const num = (v) => /^\s*\d/.test(v || '');
  if (num($el.attr('width')) && num($el.attr('height'))) return true;
  const style = ($el.attr('style') || '').toLowerCase();
  const len = (prop) => new RegExp(`(^|;)\\s*${prop}\\s*:\\s*\\d`).test(style);
  return (len('width') && len('height')) || /aspect-ratio\s*:\s*\d/.test(style);
}

// Extraction personnalisée : sélecteur CSS ou expression régulière, comme « Custom Extraction » de Screaming Frog.
function runExtractors($, html, extractors) {
  const out = {};
  for (const ex of extractors || []) {
    if (!ex || !ex.name || !ex.selector) continue;
    let values = [];
    try {
      if (ex.type === 'regex') {
        const re = new RegExp(ex.selector, 'gi');
        for (const m of html.matchAll(re)) {
          values.push(m[1] ?? m[0]);
          if (values.length >= 50) break;
        }
      } else {
        const $els = $(ex.selector);
        if (ex.target === 'count') values = [$els.length];
        else $els.slice(0, 50).each((_, el) => {
          const $el = $(el);
          values.push(ex.target === 'html' ? $.html(el) : ex.target === 'attr' ? $el.attr(ex.attr || 'href') ?? '' : $el.text().replace(/\s+/g, ' ').trim());
        });
      }
    } catch {
      values = ['⚠ invalid'];
    }
    out[ex.name] = values.map((v) => (typeof v === 'string' ? v.slice(0, 500) : v));
  }
  return out;
}

export function parseHtml(html, pageUrl, { extractors } = {}) {
  const $ = cheerio.load(html);
  const extracted = extractors?.length ? runExtractors($, html, extractors) : undefined;
  // Le contenu d'un <template> n'est jamais rendu ni indexé : retiré avant toute extraction.
  $('template').remove();
  // Espace entre éléments de bloc et <br> AVANT toute lecture de texte : « <h1>Ligne 1<br>Ligne 2</h1> » ou une carte
  // « <a><div>Titre</div><div>Résumé</div></a> » ne doivent pas donner « Ligne 1Ligne 2 » / « TitreRésumé ».
  $(BLOCKS).append('\n');
  const baseHref = $('base[href]').attr('href');
  const base = (baseHref && resolveUrl(baseHref, pageUrl)) || pageUrl;

  // Seuls les éléments HTML comptent : un <title> ou un <h1> dans un SVG inline, un <noscript> ou un <template>
  // n'est pas le titre de la page pour Google.
  const isHtmlEl = (_, el) => !$(el).closest('svg, noscript, template').length;
  const titles = $('title').filter(isHtmlEl).map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  const descs = metaContent($, ['description']);
  const robots = metaContent($, ['robots', 'googlebot']);
  const relHas = (el, token) => ($(el).attr('rel') || '').toLowerCase().split(/\s+/).includes(token);
  // Google ignore une canonical placée dans <body> ; plusieurs balises identiques (Yoast + thème) ne sont pas un conflit.
  const canonEls = $('link[rel]').filter((_, el) => relHas(el, 'canonical'));
  const inHead = (el) => !$(el).closest('body').length;
  const canonicals = canonEls.filter((_, el) => inHead(el)).map((_, el) => resolveUrl($(el).attr('href'), base)).get().filter(Boolean);
  const canonicalOutsideHead = canonEls.filter((_, el) => !inHead(el)).length;
  const seenLang = new Set();
  const hreflang = $('link[hreflang]')
    .filter((_, el) => relHas(el, 'alternate'))
    .map((_, el) => ({ lang: ($(el).attr('hreflang') || '').trim(), href: resolveUrl($(el).attr('href'), base) }))
    .get()
    .filter((h) => h.href && !seenLang.has(h.lang.toLowerCase() + ' ' + h.href) && seenLang.add(h.lang.toLowerCase() + ' ' + h.href));
  const hreflangInvalid = hreflang.filter((h) => !isValidHreflang(h.lang)).map((h) => h.lang);
  const relNext = resolveUrl($('link[rel="next"]').attr('href'), base);
  const relPrev = resolveUrl($('link[rel="prev"]').attr('href'), base);

  // Meta refresh : le premier compte (comme dans un navigateur) ; sans URL c'est un simple rechargement, pas une redirection.
  let metaRefresh = '';
  $('meta[http-equiv]').each((_, el) => {
    if (!metaRefresh && ($(el).attr('http-equiv') || '').toLowerCase() === 'refresh') metaRefresh = ($(el).attr('content') || '').trim();
  });
  const refreshMatch = /^\s*(\d+(?:\.\d+)?)?\s*[;,]?\s*url\s*=\s*['"]?([^'"]+)/i.exec(metaRefresh);
  const metaRefreshUrl = refreshMatch ? resolveUrl(refreshMatch[2].trim(), base) || '' : '';

  // Texte d'un titre tel que Google le lit : texte + alt des images (logo dans le H1) ; un titre vide n'est pas un titre.
  const headingText = (el) => {
    const $el = $(el);
    if (!$el.find('img[alt], svg').length) return $el.text().replace(/\s+/g, ' ').trim();
    const $c = $el.clone();
    $c.find('svg').remove();
    $c.find('img[alt]').each((_, i) => $(i).replaceWith(' ' + ($(i).attr('alt') || '') + ' '));
    return $c.text().replace(/\s+/g, ' ').trim();
  };
  const h1 = $('h1').filter(isHtmlEl).map((_, el) => headingText(el)).get().filter(Boolean);
  const h2 = $('h2').filter(isHtmlEl).map((_, el) => headingText(el)).get().filter(Boolean);
  // Hiérarchie des titres : on repère les niveaux sautés (ex. H2 → H4).
  // Seulement dans le contenu : les titres de widgets du pied de page ou de la barre latérale (<h4> après un <h2>)
  // ne sont pas un défaut de structure de l'article.
  const levels = $('h1, h2, h3, h4, h5, h6')
    .filter(isHtmlEl)
    .filter((_, el) => !$(el).closest('header, footer, nav, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').length)
    .filter((_, el) => headingText(el))
    .map((_, el) => Number(el.tagName[1]))
    .get();
  const headingSkips = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) headingSkips.push(`H${levels[i - 1]}→H${levels[i]}`);
  }

  // Données structurées
  const schemaTypes = new Set();
  const schemaMissing = [];
  let schemaErrors = 0;
  $('script[type]').each((_, el) => {
    if (!/^application\/ld\+json\b/i.test(($(el).attr('type') || '').trim())) return;
    // Enveloppes tolérées par Google : commentaires HTML, CDATA. Un script vide n'est pas une erreur.
    const json = $(el).contents().text().trim().replace(/^(<!--|\/\*\s*<!\[CDATA\[\s*\*\/)|(-->|\/\*\s*\]\]>\s*\*\/)$/g, '').trim();
    if (!json) return;
    try {
      collectSchema(JSON.parse(json), schemaTypes, schemaMissing);
    } catch {
      schemaErrors++;
    }
  });
  $('[itemtype]').each((_, el) => {
    for (const t of ($(el).attr('itemtype') || '').split(/\s+/)) {
      const x = schemaType(t).split('/').pop();
      if (x) schemaTypes.add(x + ' (microdata)');
    }
  });

  const og = {
    title: metaContent($, ['og:title'], { og: true })[0] || '',
    description: metaContent($, ['og:description'], { og: true })[0] || '',
    image: resolveUrl(metaContent($, ['og:image'], { og: true })[0], base) || metaContent($, ['og:image'], { og: true })[0] || '',
    twitterCard: metaContent($, ['twitter:card'], { og: true })[0] || '',
  };

  // Liens
  const isHttps = pageUrl.startsWith('https:');
  const links = [];
  const seenLink = new Set();
  $('a[href], area[href]').each((_, el) => {
    const $el = $(el);
    const to = resolveUrl($el.attr('href'), base);
    if (!to) return;
    // Ancre comme Google la lit : texte + alt des images (dans l'ordre), sans le <title> d'un SVG d'icône ;
    // à défaut aria-label puis title. <area> : son attribut alt.
    let anchor;
    let imageLink = false;
    if (el.tagName === 'area') anchor = ($el.attr('alt') || '').trim();
    else if ($el.find('img, svg').length) {
      const $c = $el.clone();
      $c.find('svg').remove();
      const textOnly = $c.text().replace(/\s+/g, ' ').trim();
      imageLink = !textOnly && $el.find('img').length > 0;
      $c.find('img').each((_, i) => $(i).replaceWith(' ' + ($(i).attr('alt') || '') + ' '));
      anchor = $c.text().replace(/\s+/g, ' ').trim();
    } else anchor = $el.text().replace(/\s+/g, ' ').trim();
    if (!anchor) anchor = ($el.attr('aria-label') || $el.attr('title') || '').trim();
    // Lien dont tout le texte est du code (<a><code>this</code></a>) : nom technique, pas une ancre générique.
    const code = !!anchor && $el.find('code').length > 0 && $el.find('code').text().replace(/\s+/g, ' ').trim() === anchor;
    const rel = ($el.attr('rel') || '').toLowerCase();
    const nofollow = /\b(nofollow|ugc|sponsored)\b/.test(rel);
    const key = to + '\u0000' + anchor + '\u0000' + nofollow;
    if (seenLink.has(key)) return;
    seenLink.add(key);
    links.push({ to, anchor: anchor.slice(0, 200), nofollow, imageLink, pos: linkPosition($el), ...(code && { code }) });
  });

  // Images : src, srcset et sources <picture> (chaque fichier candidat est relevé)
  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    // Lazy-load (lazysizes, WP Rocket, Smush, jQuery.lazyload) : la vraie image est dans data-src / data-lazy-src /
    // data-original, le src n'est qu'un espace réservé (GIF 1×1, data:) que Google remplace en exécutant le JS.
    const attr = (n) => $el.attr('data-' + n) || $el.attr('data-lazy-' + n) || (n === 'src' && $el.attr('data-original')) || $el.attr(n) || '';
    const srcset = parseSrcset(attr('srcset'), base);
    const $picture = $el.parent().is('picture') ? $el.parent() : null;
    const sources = [];
    $picture?.children('source').each((_, s) => {
      const $s = $(s);
      const type = ($s.attr('type') || '').toLowerCase().trim();
      const media = ($s.attr('media') || '').trim();
      for (const c of parseSrcset($s.attr('srcset') || $s.attr('data-srcset') || '', base)) sources.push({ ...c, type, media });
    });
    const src = resolveUrl(attr('src'), base) || srcset[0]?.url || sources[0]?.url;
    if (!src) return;
    const alt = $el.attr('alt');
    const variants = [];
    const seen = new Set([src]);
    for (const c of srcset) if (!seen.has(c.url)) { seen.add(c.url); variants.push({ ...c, role: 'srcset' }); }
    for (const c of sources) if (!seen.has(c.url)) { seen.add(c.url); variants.push({ ...c, role: 'source' }); }
    const formats = new Set([imageFormat(src), ...variants.map((v) => v.type ? v.type.replace('image/', '').replace('jpeg', 'jpg') : imageFormat(v.url))].filter(Boolean));
    images.push({
      src,
      alt: alt === undefined ? null : alt.trim(),
      hasDimensions: hasDimensions($el),
      lazy: ($el.attr('loading') || '').toLowerCase() === 'lazy',
      picture: !!$picture,
      responsive: srcset.length > 1 || sources.length > 0,
      // Descripteurs « w » sans attribut sizes : le navigateur suppose 100vw et télécharge une image trop grande.
      noSizes: [...srcset, ...sources].some((c) => /w$/.test(c.descriptor)) && !attr('sizes') && !$picture?.children('source[sizes]').length,
      formats: [...formats],
      variants,
    });
  });

  // Contenu mixte (ressources http sur page https)
  let mixedContent = 0;
  if (isHttps) {
    // Une ressource comptée une fois par élément, même si src et srcset sont tous deux en http.
    const http = (v) => /^\s*http:\/\//i.test(v || '');
    $('img, script[src], iframe[src], link[href], source, video, audio, embed[src], object[data]').each((_, el) => {
      const $el = $(el);
      if (el.tagName === 'link' && !/\b(stylesheet|preload|icon|modulepreload)\b/i.test($el.attr('rel') || '')) return;
      const urls = [$el.attr('src'), $el.attr('href'), $el.attr('data'), $el.attr('poster')];
      const srcset = $el.attr('srcset');
      if (urls.some(http) || (srcset && /(^|,)\s*http:\/\//i.test(srcset))) mixedContent++;
    });
  }

  // Texte : corps complet + contenu principal (sans navigation, en-tête, pied de page)
  $('script, style, noscript, template, svg').remove();
  // Espace entre éléments de bloc pour éviter « titreparagraphe » lors de l'extraction du texte.
  const rawText = $('body').text();
  const text = rawText.replace(/\s+/g, ' ').trim();
  const wordCount = countWords(text);
  // Contenu principal : <main> (ou role=main) d'abord, un <article> seulement s'il est unique (sinon ce sont des
  // résumés de liste), sinon le corps sans navigation, en-tête, pied de page, barres latérales ni bandeau cookies.
  let $main = $('main, [role="main"]').first();
  if (!$main.length && $('article').length === 1) $main = $('article');
  const hasMain = !!$main.length;
  if (!hasMain) {
    $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').remove();
    $('[id], [class]').filter((_, el) => /(^|[\s_-])(sidebar|widget-area|cookie|consent|gdpr)([\s_-]|$)/i.test(`${$(el).attr('id') || ''} ${$(el).attr('class') || ''}`)).remove();
    $main = $('body');
  }
  const mainRaw = $main.text();
  const mainText = mainRaw.replace(/\s+/g, ' ').trim();
  const mainTokens = tokenize(mainText);
  const contentHash = wordCount ? crypto.createHash('md5').update(text.toLowerCase()).digest('hex') : '';

  return {
    title: titles[0] || '',
    titleCount: titles.length,
    metaDescription: descs[0] || '',
    metaDescriptionCount: descs.length,
    metaRobots: robots.join(', '),
    metaRefresh: metaRefreshUrl ? metaRefresh : '',
    metaRefreshUrl,
    canonical: canonicals[0] || '',
    canonicalCount: canonicals.length,
    canonicalConflict: new Set(canonicals).size > 1,
    canonicalOutsideHead,
    hreflang,
    hreflangInvalid,
    relNext: relNext || '',
    relPrev: relPrev || '',
    h1,
    h2,
    headingSkips,
    lang: ($('html').attr('lang') || '').trim(),
    viewport: metaContent($, ['viewport'])[0] || '',
    og,
    schemaTypes: [...schemaTypes],
    schemaMissing,
    schemaErrors,
    links,
    images,
    mixedContent,
    wordCount,
    mainWordCount: countWords(mainText),
    hasMain,
    textRatio: html.length ? Math.round((text.length / html.length) * 1000) / 10 : 0,
    contentHash,
    simhash: mainTokens.length >= 50 ? simhash(mainTokens) : null,
    keywords: topKeywords(mainRaw, titles[0] || '', h1[0] || ''),
    extracted,
  };
}
