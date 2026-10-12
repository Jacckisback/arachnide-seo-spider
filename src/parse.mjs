// Extraction des données SEO d'une page HTML.
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { tokenize, topKeywords, simhash } from './text.mjs';

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:|sms:|ftp:|whatsapp:|skype:|#)/i;
const HREFLANG_RE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;

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

function metaContent($, names) {
  const out = [];
  $('meta').each((_, el) => {
    const n = ($(el).attr('name') || $(el).attr('property') || '').toLowerCase().trim();
    if (names.includes(n)) out.push(($(el).attr('content') || '').trim());
  });
  return out;
}

// Propriétés minimales attendues par Google pour les résultats enrichis les plus courants.
export const SCHEMA_REQUIRED = {
  Article: ['headline', 'image', 'datePublished', 'author'],
  NewsArticle: ['headline', 'image', 'datePublished', 'author'],
  BlogPosting: ['headline', 'image', 'datePublished', 'author'],
  Product: ['name', 'image', ['offers', 'review', 'aggregateRating']],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  Organization: ['name', 'url'],
  LocalBusiness: ['name', 'address'],
  Event: ['name', 'startDate', 'location'],
  Recipe: ['name', 'image'],
  Course: ['name', 'description', 'provider'],
  Review: ['itemReviewed', 'reviewRating', 'author'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  JobPosting: ['title', 'description', 'datePosted', 'hiringOrganization'],
  HowTo: ['name', 'step'],
  SoftwareApplication: ['name', ['offers', 'aggregateRating', 'review']],
  WebSite: ['name', 'url'],
};

function collectSchema(node, types, entities) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectSchema(n, types, entities));
  const t = node['@type'];
  if (t) {
    for (const x of Array.isArray(t) ? t : [t]) {
      types.add(String(x));
      if (SCHEMA_REQUIRED[x]) {
        const missing = SCHEMA_REQUIRED[x]
          .filter((req) => (Array.isArray(req) ? !req.some((r) => node[r] != null) : node[req] == null))
          .map((req) => (Array.isArray(req) ? req.join('|') : req));
        if (missing.length) entities.push({ type: String(x), missing });
      }
    }
  }
  for (const [k, v] of Object.entries(node)) if (k !== '@context' && v && typeof v === 'object') collectSchema(v, types, entities);
}

function linkPosition($el) {
  if ($el.closest('nav, [role="navigation"]').length) return 'nav';
  if ($el.closest('header, [role="banner"]').length) return 'header';
  if ($el.closest('footer, [role="contentinfo"]').length) return 'footer';
  if ($el.closest('aside, [role="complementary"]').length) return 'aside';
  return 'content';
}

export function parseHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const baseHref = $('base[href]').attr('href');
  const base = (baseHref && resolveUrl(baseHref, pageUrl)) || pageUrl;

  const titles = $('title').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  const descs = metaContent($, ['description']);
  const robots = metaContent($, ['robots', 'googlebot']);
  const canonicals = $('link[rel]')
    .filter((_, el) => ($(el).attr('rel') || '').toLowerCase().split(/\s+/).includes('canonical'))
    .map((_, el) => resolveUrl($(el).attr('href'), base))
    .get()
    .filter(Boolean);
  const hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({ lang: ($(el).attr('hreflang') || '').trim(), href: resolveUrl($(el).attr('href'), base) }))
    .get()
    .filter((h) => h.href);
  const hreflangInvalid = hreflang.filter((h) => !HREFLANG_RE.test(h.lang)).map((h) => h.lang);
  const relNext = resolveUrl($('link[rel="next"]').attr('href'), base);
  const relPrev = resolveUrl($('link[rel="prev"]').attr('href'), base);

  let metaRefresh = '';
  $('meta[http-equiv]').each((_, el) => {
    if (($(el).attr('http-equiv') || '').toLowerCase() === 'refresh') metaRefresh = ($(el).attr('content') || '').trim();
  });

  const h1 = $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  const h2 = $('h2').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  // Hiérarchie des titres : on repère les niveaux sautés (ex. H2 → H4).
  const levels = $('h1, h2, h3, h4, h5, h6').map((_, el) => Number(el.tagName[1])).get();
  const headingSkips = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) headingSkips.push(`H${levels[i - 1]}→H${levels[i]}`);
  }

  // Données structurées
  const schemaTypes = new Set();
  const schemaMissing = [];
  let schemaErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectSchema(JSON.parse($(el).contents().text()), schemaTypes, schemaMissing);
    } catch {
      schemaErrors++;
    }
  });
  $('[itemtype]').each((_, el) => {
    const t = ($(el).attr('itemtype') || '').split('/').pop();
    if (t) schemaTypes.add(t + ' (microdata)');
  });

  const og = {
    title: metaContent($, ['og:title'])[0] || '',
    description: metaContent($, ['og:description'])[0] || '',
    image: metaContent($, ['og:image'])[0] || '',
    twitterCard: metaContent($, ['twitter:card'])[0] || '',
  };

  // Liens
  const isHttps = pageUrl.startsWith('https:');
  const links = [];
  const seenLink = new Set();
  $('a[href], area[href]').each((_, el) => {
    const $el = $(el);
    const to = resolveUrl($el.attr('href'), base);
    if (!to) return;
    let anchor = $el.text().replace(/\s+/g, ' ').trim();
    let imageLink = false;
    if (!anchor) {
      const $img = $el.find('img').first();
      if ($img.length) {
        imageLink = true;
        anchor = ($img.attr('alt') || '').trim();
      } else {
        anchor = ($el.attr('aria-label') || $el.attr('title') || '').trim();
      }
    }
    const rel = ($el.attr('rel') || '').toLowerCase();
    const nofollow = /\b(nofollow|ugc|sponsored)\b/.test(rel);
    const key = to + '\u0000' + anchor + '\u0000' + nofollow;
    if (seenLink.has(key)) return;
    seenLink.add(key);
    links.push({ to, anchor: anchor.slice(0, 200), nofollow, imageLink, pos: linkPosition($el) });
  });

  // Images
  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = resolveUrl($el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src'), base);
    if (!src) return;
    const alt = $el.attr('alt');
    images.push({
      src,
      alt: alt === undefined ? null : alt.trim(),
      hasDimensions: !!($el.attr('width') && $el.attr('height')),
      lazy: ($el.attr('loading') || '').toLowerCase() === 'lazy',
    });
  });

  // Contenu mixte (ressources http sur page https)
  let mixedContent = 0;
  if (isHttps) {
    $('img[src], script[src], iframe[src], link[rel="stylesheet"][href], source[src], video[src], audio[src]').each((_, el) => {
      const v = $(el).attr('src') || $(el).attr('href') || '';
      if (/^http:\/\//i.test(v.trim())) mixedContent++;
    });
  }

  // Texte : corps complet + contenu principal (sans navigation, en-tête, pied de page)
  $('script, style, noscript, template, svg').remove();
  // Espace entre éléments de bloc pour éviter « titreparagraphe » lors de l'extraction du texte.
  $('p, div, li, td, th, h1, h2, h3, h4, h5, h6, br, section, article, header, footer, nav, aside, main, blockquote, dt, dd, figcaption, option, label, button').append(' ');
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)) : [];
  let $main = $('main, article, [role="main"]').first();
  if (!$main.length) {
    $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $main = $('body');
  }
  const mainText = $main.text().replace(/\s+/g, ' ').trim();
  const mainTokens = tokenize(mainText);
  const contentHash = words.length ? crypto.createHash('md5').update(text.toLowerCase()).digest('hex') : '';

  return {
    title: titles[0] || '',
    titleCount: titles.length,
    metaDescription: descs[0] || '',
    metaDescriptionCount: descs.length,
    metaRobots: robots.join(', '),
    metaRefresh,
    canonical: canonicals[0] || '',
    canonicalCount: canonicals.length,
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
    wordCount: words.length,
    mainWordCount: mainTokens.length,
    textRatio: html.length ? Math.round((text.length / html.length) * 1000) / 10 : 0,
    contentHash,
    simhash: mainTokens.length >= 50 ? simhash(mainTokens) : null,
    keywords: topKeywords(mainText, titles[0] || '', h1[0] || ''),
  };
}
