// Extraction des données SEO d'une page HTML.
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';

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

function metaContent($, names) {
  const out = [];
  $('meta').each((_, el) => {
    const n = ($(el).attr('name') || $(el).attr('property') || '').toLowerCase().trim();
    if (names.includes(n)) out.push(($(el).attr('content') || '').trim());
  });
  return out;
}

function collectSchemaTypes(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectSchemaTypes(n, acc));
  const t = node['@type'];
  if (t) (Array.isArray(t) ? t : [t]).forEach((x) => acc.add(String(x)));
  if (node['@graph']) collectSchemaTypes(node['@graph'], acc);
  for (const [k, v] of Object.entries(node)) {
    if (k !== '@graph' && v && typeof v === 'object') collectSchemaTypes(v, acc);
  }
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
  const relNext = resolveUrl($('link[rel="next"]').attr('href'), base);
  const relPrev = resolveUrl($('link[rel="prev"]').attr('href'), base);

  const h1 = $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  const h2 = $('h2').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();

  // Données structurées
  const schema = new Set();
  let schemaErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectSchemaTypes(JSON.parse($(el).contents().text()), schema);
    } catch {
      schemaErrors++;
    }
  });
  $('[itemtype]').each((_, el) => {
    const t = ($(el).attr('itemtype') || '').split('/').pop();
    if (t) schema.add(t + ' (microdata)');
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
    if (!anchor) anchor = $el.find('img[alt]').attr('alt')?.trim() ? '[img] ' + $el.find('img[alt]').attr('alt').trim() : $el.find('img').length ? '[image sans alt]' : '';
    const rel = ($el.attr('rel') || '').toLowerCase();
    const nofollow = /\b(nofollow|ugc|sponsored)\b/.test(rel);
    const key = to + '\u0000' + anchor + '\u0000' + nofollow;
    if (seenLink.has(key)) return;
    seenLink.add(key);
    links.push({ to, anchor: anchor.slice(0, 200), nofollow });
  });

  // Images
  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = resolveUrl($el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src'), base);
    if (!src) return;
    const alt = $el.attr('alt');
    images.push({ src, alt: alt === undefined ? null : alt.trim(), width: $el.attr('width') || '', height: $el.attr('height') || '' });
  });

  // Contenu mixte (ressources http sur page https)
  let mixedContent = 0;
  if (isHttps) {
    $('img[src], script[src], iframe[src], link[rel="stylesheet"][href], source[src], video[src], audio[src]').each((_, el) => {
      const v = $(el).attr('src') || $(el).attr('href') || '';
      if (/^http:\/\//i.test(v.trim())) mixedContent++;
    });
  }

  // Texte
  $('script, style, noscript, template, svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)) : [];
  const contentHash = words.length ? crypto.createHash('md5').update(text.toLowerCase()).digest('hex') : '';

  return {
    title: titles[0] || '',
    titleCount: titles.length,
    metaDescription: descs[0] || '',
    metaDescriptionCount: descs.length,
    metaRobots: robots.join(', '),
    canonical: canonicals[0] || '',
    canonicalCount: canonicals.length,
    hreflang,
    relNext: relNext || '',
    relPrev: relPrev || '',
    h1,
    h2,
    lang: ($('html').attr('lang') || '').trim(),
    viewport: metaContent($, ['viewport'])[0] || '',
    og,
    schemaTypes: [...schema],
    schemaErrors,
    links,
    images,
    mixedContent,
    wordCount: words.length,
    textRatio: html.length ? Math.round((text.length / html.length) * 1000) / 10 : 0,
    contentHash,
  };
}
