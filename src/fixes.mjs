// Opportunités de correction : traduit les problèmes d'un crawl en modifications concrètes possibles
// (champ, valeur actuelle, contraintes, contexte) pour que Claude rédige les nouvelles valeurs.
import { robotsFlags } from '../public/shared/directives.js';
import { THRESHOLDS } from './analyze.mjs';

// Problème → champ que l'on peut corriger directement dans le CMS.
export const ISSUE_FIELDS = {
  'title-missing': 'seo_title',
  'title-duplicate': 'seo_title',
  'title-long': 'seo_title',
  'title-short': 'seo_title',
  'js-title-changed': 'seo_title',
  'desc-missing': 'meta_description',
  'desc-duplicate': 'meta_description',
  'desc-long': 'meta_description',
  'desc-short': 'meta_description',
  'h1-missing': 'h1',
  'h1-duplicate': 'h1',
  'canonical-missing': 'canonical',
  'canonical-non200': 'canonical',
  'canonical-multiple': 'canonical',
  'js-canonical-changed': 'canonical',
  'img-alt-missing': 'image_alt',
  'sitemap-non-indexable': 'noindex',
  'js-noindex-changed': 'noindex',
};

const SEV = { error: 0, warning: 1, notice: 2 };

const constraints = (T) => ({
  seo_title: `Unique on the site, ${T.titleMin}+ characters and at most ${T.titleMaxPx}px wide (≈ 55-60 characters). Main keyword near the start, brand at the end if room.`,
  meta_description: `Unique, ${T.descMin}-155 characters, at most ${T.descMaxPx}px wide. Summarise the page and give a reason to click; no keyword stuffing.`,
  h1: 'One H1 per page, describing the page content for the reader; may differ from the title.',
  canonical: 'Absolute URL of the preferred version of the page (usually the page itself, https, without tracking parameters). It must return 200 and be indexable.',
  image_alt: 'Describe what the image shows in context (≤ 125 characters). Use an empty alt only for purely decorative images.',
  noindex: 'false to let search engines index the page (only if it should rank), true to keep it out of the index (then remove it from the sitemap).',
  redirect: 'Destination: the closest equivalent live page (200, indexable). Avoid redirecting everything to the home page.',
});

// Page la plus proche (segments d'URL communs) pour proposer une cible de redirection.
function closestPage(url, candidates) {
  const segs = (u) => new URL(u).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  const a = segs(url);
  const words = new Set(a.join('-').split(/[-_.]+/).filter((w) => w.length > 2));
  let best = null;
  let bestScore = 0;
  for (const p of candidates) {
    const b = segs(p.url);
    let score = 0;
    for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) score += 2;
    for (const w of b.join('-').split(/[-_.]+/)) if (words.has(w)) score += 1;
    if (score > bestScore) {
      best = p.url;
      bestScore = score;
    }
  }
  return best;
}

export function buildOpportunities(R, { url, fields, limit = 50, offset = 0 } = {}) {
  const T = { ...THRESHOLDS, ...R.meta.thresholds };
  const C = constraints(T);
  const byUrl = new Map(R.pages.map((p) => [p.url, p]));
  const pageIssues = new Map();
  for (const is of R.issues) {
    for (const it of is.items) {
      if (!pageIssues.has(it.url)) pageIssues.set(it.url, []);
      pageIssues.get(it.url).push({ id: is.id, severity: is.severity, detail: typeof it.detail === 'string' ? it.detail : undefined, field: ISSUE_FIELDS[is.id] });
    }
  }
  const out = [];
  for (const [u, issues] of pageIssues) {
    const p = byUrl.get(u);
    if (!p || !p.isHtml || p.status !== 200 || (url && u !== url)) continue;
    const suggestions = [];
    const seen = new Set();
    for (const is of issues.sort((a, b) => SEV[a.severity] - SEV[b.severity])) {
      if (!is.field || seen.has(is.field) || (fields && !fields.includes(is.field))) continue;
      // Page du sitemap canonicalisée, redirigée ou en erreur : la solution est de la retirer du sitemap, jamais un noindex.
      if (is.id === 'sitemap-non-indexable' && p.indexabilityReason !== 'noindex') continue;
      seen.add(is.field);
      const current = { seo_title: p.title || null, meta_description: p.metaDescription || null, h1: p.h1?.[0] || null, canonical: p.canonical || null, noindex: robotsFlags(p.metaRobots, p.xRobotsTag).noindex }[is.field];
      if (is.field === 'image_alt') {
        for (const src of p.imagesMissingAltSrc || []) suggestions.push({ field: 'image_alt', target: src, current: null, because: [is.id], constraints: C.image_alt });
        if (!p.imagesMissingAltSrc?.length) suggestions.push({ field: 'image_alt', target: null, note: 'Re-crawl with Arachnide 3.0+ to get the image sources, or use arachnide_fetch_page.', because: [is.id], constraints: C.image_alt });
        continue;
      }
      suggestions.push({ field: is.field, current, because: issues.filter((x) => x.field === is.field).map((x) => x.id), constraints: C[is.field], ...(is.field === 'canonical' && !p.canonical ? { proposed: p.url } : {}) });
    }
    if (!suggestions.length) continue;
    out.push({
      url: u,
      priority: Math.min(...issues.map((i) => SEV[i.severity])),
      linkScore: p.linkScore ?? 0,
      indexable: p.indexable,
      context: { title: p.title || null, h1: p.h1 || [], metaDescription: p.metaDescription || null, focusKeyword: p.focusKeyword || null, keywords: (p.keywords || []).slice(0, 8), wordCount: p.wordCount, lang: p.lang || null, h2: (p.h2 || []).slice(0, 10) },
      suggestions,
    });
  }
  // Redirections : pages en erreur encore liées, et chaînes de redirection à raccourcir.
  if (!fields || fields.includes('redirect')) {
    const live = R.pages.filter((p) => p.isHtml && p.status === 200 && p.indexable);
    for (const p of R.pages.filter((x) => x.status >= 400 && x.status < 500 && (x.uniqueInlinks || 0) > 0 && (!url || x.url === url))) {
      out.push({ url: p.url, priority: 0, linkScore: p.linkScore ?? 0, indexable: false, context: { status: p.status, inlinks: p.uniqueInlinks }, suggestions: [{ field: 'redirect', current: null, proposed: closestPage(p.url, live), because: ['4xx'], constraints: C.redirect, also: 'Fix the internal links that point here (see arachnide_get_issue 4xx / broken-internal).' }] });
    }
    for (const r of R.redirects || []) {
      if (r.hops > 1 && !r.loop && r.finalStatus === 200 && (!url || r.url === url)) {
        out.push({ url: r.url, priority: 1, linkScore: 0, indexable: false, context: { chain: r.chain }, suggestions: [{ field: 'redirect', current: r.chain[1] || null, proposed: r.finalUrl, because: ['redirect-chain'], constraints: 'Point the first URL straight to the final destination (one hop).' }] });
      }
    }
  }
  out.sort((a, b) => a.priority - b.priority || b.linkScore - a.linkScore);
  return { total: out.length, offset, items: out.slice(offset, offset + limit), has_more: offset + limit < out.length };
}
