// Catalogue des corrections : pour chaque problème détecté, comment le corriger.
//   ai            → rédactionnel, proposé par Claude ou ChatGPT (title, meta description, H1, alt, JSON-LD)
//   deterministic → calculé sans IA (redirection 301, canonical, noindex, lien vers l'URL finale)
//   manual        → non automatisable (performance, hébergement…) : plan d'action en texte, jamais « Appliquer »
// Les autres problèmes (structure, maillage, hreflang…) sont « manual » par défaut.

export const FIX_CATALOG = {
  'title-missing': { method: 'ai', kind: 'seo_title' },
  'title-long': { method: 'ai', kind: 'seo_title' },
  'title-short': { method: 'ai', kind: 'seo_title' },
  'title-duplicate': { method: 'ai', kind: 'seo_title' },
  'desc-missing': { method: 'ai', kind: 'meta_description' },
  'desc-duplicate': { method: 'ai', kind: 'meta_description' },
  'desc-long': { method: 'ai', kind: 'meta_description' },
  'desc-short': { method: 'ai', kind: 'meta_description' },
  'h1-missing': { method: 'ai', kind: 'h1' },
  'h1-multiple': { method: 'ai', kind: 'h1' },
  'h1-duplicate': { method: 'ai', kind: 'h1' },
  'img-alt-missing': { method: 'ai', kind: 'image_alt' },
  'schema-missing': { method: 'ai', kind: 'json_ld' },
  '4xx': { method: 'deterministic', kind: 'redirect' },
  'canonical-missing': { method: 'deterministic', kind: 'canonical' },
  'canonical-non200': { method: 'deterministic', kind: 'canonical' },
  'canonical-multiple': { method: 'deterministic', kind: 'canonical' },
  noindex: { method: 'deterministic', kind: 'noindex' },
  'sitemap-non-indexable': { method: 'deterministic', kind: 'noindex' },
  'links-to-redirect': { method: 'deterministic', kind: 'link' },
};

export const fixMethod = (issueId) => FIX_CATALOG[issueId]?.method || 'manual';
export const fixKind = (issueId) => FIX_CATALOG[issueId]?.kind || 'action_plan';

// Longueurs cibles envoyées à l'IA (caractères) et contrôlées à la revue.
export const TARGETS = {
  seo_title: { min: 50, max: 60 },
  meta_description: { min: 140, max: 160 },
  h1: { min: 20, max: 70 },
  image_alt: { min: 5, max: 125 },
};

// Impact d'un groupe de problèmes : nombre de pages × gravité.
const SEV = { error: 3, warning: 2, notice: 1 };
export const issueImpact = (issue) => issue.count * (SEV[issue.severity] || 1);
