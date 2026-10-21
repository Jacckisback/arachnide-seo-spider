// Segmentation d'un crawl, à la Screaming Frog : des segments nommés (« Fiches produit », « Blog », « Catégories »…)
// définis par des règles sur les pages (URL, titre, statut, profondeur, indexabilité, extraction personnalisée…).
//
// - Les segments s'appliquent APRÈS le crawl : on peut les créer, les modifier ou les réordonner sans recrawler.
// - Une page appartient au PREMIER segment dont les règles la décrivent (l'ordre compte, comme dans Screaming Frog) ;
//   les autres pages tombent dans « Sans segment ».
// - sliceResult() découpe un crawl complet sur un segment : pages, problèmes (et leurs URL), redirections, liens
//   cassés, doublons, images… et recalcule le score de santé et les piliers avec la méthode exacte du moteur.
//   Toute l'interface (tableaux, problèmes, plan d'action, rapport PDF, exports) travaille alors sur le segment.
// - segmentStats() donne la vue d'ensemble : une ligne par segment avec son score, ses erreurs et ses moyennes.
//
// Partagé par le moteur (src/), la CLI, les outils agents (MCP / REST) et l'interface : un seul calcul partout.
import { forEachLink, linkUrls } from './links.js';
import { issuePoints, computePillars, scoredPages, issueShare, OUTSIDE_CRAWL } from './pillars.js';

export const NONE = '__none';
export const MAX_SEGMENTS = 50;
export const MAX_RULES = 20;

// Palette catégorielle lisible sur fond clair comme sur fond sombre (contraste ≥ 3:1 sur blanc et sur #0f172a).
export const SEGMENT_COLORS = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#0d9488', '#ea580c', '#4f46e5'];
export const NONE_COLOR = '#94a3b8';

const pathOf = (url) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return String(url || '');
  }
};

// Champs utilisables dans une règle. type : text | number | bool | enum.
export const FIELDS = {
  url: { type: 'text', get: (p) => p.url },
  path: { type: 'text', get: (p) => pathOf(p.url) },
  title: { type: 'text', get: (p) => p.title || '' },
  h1: { type: 'text', get: (p) => (p.h1 || [])[0] || '' },
  metaDescription: { type: 'text', get: (p) => p.metaDescription || '' },
  contentType: { type: 'text', get: (p) => p.contentType || '' },
  canonical: { type: 'text', get: (p) => p.canonical || '' },
  lang: { type: 'text', get: (p) => p.lang || '' },
  schemaType: { type: 'text', get: (p) => (p.schemaTypes || []).join(' ') },
  status: { type: 'number', get: (p) => p.status ?? 0 },
  depth: { type: 'number', get: (p) => p.depth },
  words: { type: 'number', get: (p) => p.wordCount },
  inlinks: { type: 'number', get: (p) => p.uniqueInlinks ?? 0 },
  linkScore: { type: 'number', get: (p) => p.linkScore },
  responseTime: { type: 'number', get: (p) => p.responseTime },
  gscClicks: { type: 'number', get: (p) => p.gsc?.clicks },
  ga4Sessions: { type: 'number', get: (p) => p.ga4?.sessions },
  indexable: { type: 'bool', get: (p) => !!p.indexable },
  inSitemap: { type: 'bool', get: (p) => !!p.inSitemap },
  isHtml: { type: 'bool', get: (p) => !!p.isHtml },
  indexability: { type: 'enum', values: ['indexable', 'noindex', 'canonicalised', 'redirect', 'clientError', 'serverError', 'blocked', 'noResponse', 'metaRefresh', 'jsRedirect', 'rateLimited'], get: (p) => (p.indexable ? 'indexable' : p.indexabilityReason || 'noResponse') },
};
// Extraction personnalisée : « extract:Prix », « extract:Auteur »… (valeurs de l'extracteur jointes par « | »).
const fieldOf = (name) => {
  if (FIELDS[name]) return FIELDS[name];
  if (typeof name === 'string' && name.startsWith('extract:')) {
    const k = name.slice(8);
    return { type: 'text', get: (p) => (p.extracted?.[k] || []).join(' | ') };
  }
  return null;
};

export const OPS = {
  text: ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'regex', 'notRegex', 'empty', 'notEmpty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'],
  bool: ['isTrue', 'isFalse'],
  enum: ['equals', 'notEquals'],
};
const NO_VALUE = new Set(['empty', 'notEmpty', 'isTrue', 'isFalse']);
export const opsFor = (field) => OPS[fieldOf(field)?.type] || OPS.text;
export const needsValue = (op) => !NO_VALUE.has(op);

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Regex invalide : lue comme du texte, jamais d'erreur (le segment reste utilisable).
function safeRegex(src) {
  try {
    return { re: new RegExp(src, 'i'), bad: false };
  } catch {
    return { re: new RegExp(escRe(src), 'i'), bad: true };
  }
}

export const slugId = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'segment';

// Nettoie une liste de segments venue de l'interface, d'un fichier JSON, de la CLI ou d'un agent.
// Renvoie { segments, problems } : les règles inutilisables sont retirées, les regex invalides signalées.
export function normalizeSegments(input) {
  const list = Array.isArray(input) ? input : Array.isArray(input?.segments) ? input.segments : [];
  const out = [];
  const problems = [];
  const ids = new Set();
  for (const raw of list.slice(0, MAX_SEGMENTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name || '').trim().slice(0, 60);
    if (!name) continue;
    let id = slugId(raw.id || name);
    for (let k = 2; ids.has(id) || id === NONE; k++) id = slugId(raw.id || name) + '-' + k;
    ids.add(id);
    const rules = [];
    for (const r of (Array.isArray(raw.rules) ? raw.rules : []).slice(0, MAX_RULES)) {
      if (!r || !fieldOf(r.field)) continue;
      const ops = opsFor(r.field);
      const op = ops.includes(r.op) ? r.op : ops[0];
      const value = r.value == null ? '' : String(r.value).slice(0, 500);
      if (needsValue(op) && value === '' && fieldOf(r.field).type !== 'text') continue;
      if ((op === 'regex' || op === 'notRegex') && safeRegex(value).bad) problems.push({ segment: name, rule: `${r.field} ${op} ${value}`, key: 'seg.badRegex' });
      rules.push({ field: r.field, op, value });
    }
    const color = /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color.toLowerCase() : SEGMENT_COLORS[out.length % SEGMENT_COLORS.length];
    out.push({ id, name, color, match: raw.match === 'any' ? 'any' : 'all', rules });
  }
  return { segments: out, problems };
}

// Une règle compilée = fonction page → booléen.
function compileRule(r) {
  const f = fieldOf(r.field);
  const v = r.value ?? '';
  if (f.type === 'number') {
    const n = Number(v);
    const has = (x) => x !== null && x !== undefined && x !== '' && !Number.isNaN(Number(x));
    switch (r.op) {
      case 'empty': return (p) => !has(f.get(p));
      case 'notEmpty': return (p) => has(f.get(p));
      case 'neq': return (p) => !has(f.get(p)) || Number(f.get(p)) !== n;
      case 'gt': return (p) => has(f.get(p)) && Number(f.get(p)) > n;
      case 'gte': return (p) => has(f.get(p)) && Number(f.get(p)) >= n;
      case 'lt': return (p) => has(f.get(p)) && Number(f.get(p)) < n;
      case 'lte': return (p) => has(f.get(p)) && Number(f.get(p)) <= n;
      default: return (p) => has(f.get(p)) && Number(f.get(p)) === n;
    }
  }
  if (f.type === 'bool') return r.op === 'isFalse' ? (p) => !f.get(p) : (p) => !!f.get(p);
  if (f.type === 'enum') return r.op === 'notEquals' ? (p) => f.get(p) !== v : (p) => f.get(p) === v;
  const lv = String(v).toLowerCase();
  const s = (p) => String(f.get(p) ?? '').toLowerCase();
  switch (r.op) {
    case 'notContains': return (p) => !s(p).includes(lv);
    case 'equals': return (p) => s(p) === lv;
    case 'notEquals': return (p) => s(p) !== lv;
    case 'startsWith': return (p) => s(p).startsWith(lv);
    case 'endsWith': return (p) => s(p).endsWith(lv);
    case 'regex': { const { re } = safeRegex(v); return (p) => re.test(String(f.get(p) ?? '')); }
    case 'notRegex': { const { re } = safeRegex(v); return (p) => !re.test(String(f.get(p) ?? '')); }
    case 'empty': return (p) => !s(p);
    case 'notEmpty': return (p) => !!s(p);
    default: return (p) => s(p).includes(lv);
  }
}

// Fonction page → id du segment (NONE si aucun). Un segment sans règle ne prend aucune page.
export function compileSegments(segments) {
  const compiled = segments.map((s) => ({ id: s.id, any: s.match === 'any', tests: s.rules.map(compileRule) }));
  return (p) => {
    for (const c of compiled) {
      if (!c.tests.length) continue;
      if (c.any ? c.tests.some((f) => f(p)) : c.tests.every((f) => f(p))) return c.id;
    }
    return NONE;
  };
}

// Pose p.segment sur chaque page (et sur les URL Search Console hors crawl). Renvoie le nombre de pages par segment.
export function assignSegments(R, segments) {
  const of = compileSegments(segments || []);
  const counts = new Map([...(segments || []).map((s) => [s.id, 0]), [NONE, 0]]);
  for (const p of R.pages || []) {
    p.segment = segments?.length ? of(p) : undefined;
    if (p.segment) counts.set(p.segment, (counts.get(p.segment) || 0) + 1);
  }
  for (const g of R.gscOnly || []) g.segment = segments?.length ? of({ url: g.url, gsc: g }) : undefined;
  for (const g of R.ga4Only || []) g.segment = segments?.length ? of({ url: g.url, ga4: g }) : undefined;
  return counts;
}

export const grade = (score) => (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : score >= 20 ? 'E' : 'F');

const SEV_ORDER = { error: 0, warning: 1, notice: 2 };
const PRIO_FLOOR = { error: 1000, warning: 500, notice: 0 };
const SEV_W = { error: 3, warning: 2, notice: 1 };
const LVL_W = { high: 3, medium: 2, low: 1 };
const html200 = (pages) => pages.filter((p) => p.isHtml && p.status === 200);

// Résumé (score, piliers, compteurs) recalculé à partir des pages et des problèmes : même méthode que src/analyze.mjs.
export function computeSummary(R) {
  const pages = R.pages || [];
  const issues = R.issues || [];
  const h200 = html200(pages);
  const indexableHtml = h200.filter((p) => p.indexable);
  const scored = scoredPages(pages);
  const N = Math.max(1, scored.length);
  const scoredSet = new Set(scored.map((p) => p.url));
  let keep = 1;
  const keepByCat = {};
  for (const is of issues) {
    if (is.severity === 'notice') continue;
    const share = issueShare(is, scoredSet, N);
    const pts = issuePoints(is, share);
    keep *= 1 - pts / 100;
    keepByCat[is.category] = (keepByCat[is.category] ?? 1) * (1 - pts / 40);
  }
  let score = scored.length ? Math.max(0, Math.round(100 * keep)) : 0;
  if (issues.some((i) => i.id === 'search-bots-blocked')) score = Math.min(score, 15);
  const categoryScores = {};
  for (const c of new Set(issues.map((i) => i.category))) categoryScores[c] = Math.max(0, Math.round(100 * (keepByCat[c] ?? 1)));
  const statusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, blocked: 0, none: 0 };
  const depthBuckets = {};
  for (const p of pages) {
    if (p.blockedByRobots) statusBuckets.blocked++;
    else if (!p.status) statusBuckets.none++;
    else statusBuckets[`${String(p.status)[0]}xx`] = (statusBuckets[`${String(p.status)[0]}xx`] || 0) + 1;
    const k = p.depth === null || p.depth === undefined ? 'n/a' : p.depth >= 10 ? '10+' : String(p.depth);
    depthBuckets[k] = (depthBuckets[k] || 0) + 1;
  }
  const rt = h200.map((p) => p.responseTime).filter((x) => x != null).sort((a, b) => a - b);
  // Liens : ceux qui partent des pages du périmètre.
  const inScope = new Set(pages.map((p) => p.url));
  let internalLinks = 0;
  let externalLinks = 0;
  const ext = new Set();
  const urls = linkUrls(R);
  forEachLink(R, (f, to, _a, flags) => {
    if (!inScope.has(urls[f])) return;
    if (flags & 2) internalLinks++;
    else {
      externalLinks++;
      ext.add(urls[to]);
    }
  });
  const sum = (sev) => issues.filter((i) => i.severity === sev).reduce((a, i) => a + i.count, 0);
  return {
    score,
    grade: grade(score),
    categoryScores,
    pillars: computePillars({ pages, issues, meta: R.meta || {} }).map(({ issues: _i, ...pl }) => pl),
    totalUrls: pages.length,
    htmlPages: h200.length,
    indexable: indexableHtml.length,
    nonIndexable: pages.length - pages.filter((p) => p.indexable).length,
    avgResponseTime: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0,
    medianResponseTime: rt.length ? rt[Math.floor(rt.length / 2)] : 0,
    avgWords: h200.length ? Math.round(h200.reduce((a, p) => a + (p.wordCount || 0), 0) / h200.length) : 0,
    internalLinks,
    externalLinks,
    uniqueExternal: ext.size,
    images: (R.images || []).length,
    errors: sum('error'),
    warnings: sum('warning'),
    notices: sum('notice'),
    statusBuckets,
    depthBuckets,
  };
}

// Problèmes limités à un ensemble d'URL. Les problèmes de site (robots.txt, HTTPS, sitemap…) touchent tous les
// segments : ils sont gardés tels quels, comme dans le score global.
export function sliceIssues(issues, urlSet, pageSet) {
  const out = [];
  for (const is of issues || []) {
    const scope = is.scope || (OUTSIDE_CRAWL.has(is.id) || is.items.some((it) => pageSet.has(it.url)) ? 'page' : 'site');
    const items = scope === 'site' ? is.items : is.items.filter((it) => urlSet.has(it.url));
    if (!items.length) continue;
    const copy = { ...is, scope, items, count: items.length };
    const n = scope === 'site' ? Math.max(1, urlSet.size) : copy.count;
    copy.priority = Math.round((((SEV_W[is.severity] || 1) * (LVL_W[is.impact] || 1) * Math.log2(n + 1)) / (LVL_W[is.effort] || 1) + (PRIO_FLOOR[is.severity] || 0)) * 10) / 10;
    out.push(copy);
  }
  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
}

const segOf = (p) => p.segment || NONE;

// Crawl découpé sur un segment. `R` doit déjà porter p.segment (assignSegments). Le résultat partage les objets
// page du crawl complet (pas de copie) : il est léger même sur 100 000 URL.
export function sliceResult(R, segId, segments = R.meta?.segments || []) {
  if (!segId) return R;
  const def = segId === NONE ? { id: NONE, name: '', color: NONE_COLOR } : segments.find((s) => s.id === segId);
  if (!def) return R;
  const pages = R.pages.filter((p) => segOf(p) === segId);
  const gscOnly = (R.gscOnly || []).filter((g) => (g.segment || NONE) === segId);
  const ga4Only = (R.ga4Only || []).filter((g) => (g.segment || NONE) === segId);
  // URL du segment : ses pages, plus les orphelines Search Console / GA4 qui lui appartiennent.
  const urlSet = new Set([...pages, ...gscOnly, ...ga4Only].map((p) => p.url));
  const pageSet = new Set(R.pages.map((p) => p.url));
  const inSeg = (u) => urlSet.has(u);
  const S = {
    ...R,
    pages,
    issues: sliceIssues(R.issues, urlSet, pageSet),
    redirects: (R.redirects || []).filter((r) => inSeg(r.url)),
    brokenLinks: (R.brokenLinks || []).filter((l) => inSeg(l.from)),
    nearDuplicates: (R.nearDuplicates || []).filter((d) => inSeg(d.a) || inSeg(d.b)),
    cannibalization: (R.cannibalization || []).filter((g) => g.urls.some(inSeg)),
    images: (R.images || []).filter((i) => inSeg(i.firstPage)),
    externals: (R.externals || []).filter((e) => inSeg(e.firstPage)),
    gscOnly,
    ga4Only,
    meta: { ...R.meta, segment: { id: def.id, name: def.name, color: def.color, pages: pages.length, total: R.pages.length } },
  };
  S.summary = computeSummary(S);
  return S;
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// Vue d'ensemble : une ligne par segment (dans l'ordre défini), puis « Sans segment » s'il reste des pages.
export function segmentStats(R, segments = R.meta?.segments || [], { topIssues = 3 } = {}) {
  if (!segments.length) return [];
  const rows = [...segments, { id: NONE, name: '', color: NONE_COLOR }].map((s) => {
    const S = sliceResult(R, s.id, segments);
    const pages = S.pages;
    if (s.id === NONE && !pages.length) return null;
    const h = html200(pages);
    const depths = pages.map((p) => p.depth).filter((d) => d != null);
    const top = S.issues.filter((i) => i.scope !== 'site' && i.severity !== 'notice').slice(0, topIssues).map((i) => ({ id: i.id, severity: i.severity, count: i.count, params: i.params }));
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      pages: pages.length,
      html: h.length,
      share: R.pages.length ? round((100 * pages.length) / R.pages.length, 1) : 0,
      indexable: S.summary.indexable,
      indexableRate: h.length ? round((100 * S.summary.indexable) / h.length) : null,
      score: pages.length ? S.summary.score : null,
      grade: pages.length ? S.summary.grade : null,
      errors: S.issues.filter((i) => i.severity === 'error' && i.scope !== 'site').reduce((a, i) => a + i.count, 0),
      warnings: S.issues.filter((i) => i.severity === 'warning' && i.scope !== 'site').reduce((a, i) => a + i.count, 0),
      notices: S.issues.filter((i) => i.severity === 'notice' && i.scope !== 'site').reduce((a, i) => a + i.count, 0),
      errorPages: new Set(S.issues.filter((i) => i.severity === 'error' && i.scope !== 'site').flatMap((i) => i.items.map((x) => x.url))).size,
      avgDepth: round(avg(depths), 1),
      avgWords: round(avg(h.map((p) => p.wordCount || 0))),
      avgResponseTime: round(avg(h.map((p) => p.responseTime).filter((x) => x != null))),
      avgLinkScore: round(avg(h.map((p) => p.linkScore).filter((x) => x != null))),
      inSitemap: pages.filter((p) => p.inSitemap).length,
      clicks: pages.some((p) => p.gsc) ? pages.reduce((a, p) => a + (p.gsc?.clicks || 0), 0) : null,
      sessions: R.meta?.ga4 || pages.some((p) => p.ga4) ? pages.reduce((a, p) => a + (p.ga4?.sessions || 0), 0) + S.ga4Only.reduce((a, g) => a + (g.sessions || 0), 0) : null,
      pillars: S.summary.pillars.map((p) => ({ id: p.id, score: p.score })),
      topIssues: top,
    };
  });
  return rows.filter(Boolean);
}

// Répartition d'un problème par segment : [{ id, name, color, count }], segments sans URL concernée omis.
export function issueBySegment(R, issue, segments = R.meta?.segments || []) {
  if (!segments.length || !issue || issue.scope === 'site') return [];
  const segOfUrl = new Map(R.pages.map((p) => [p.url, segOf(p)]));
  const counts = new Map();
  for (const u of new Set(issue.items.map((it) => it.url))) {
    const s = segOfUrl.get(u) || NONE;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...segments, { id: NONE, name: '', color: NONE_COLOR }].filter((s) => counts.has(s.id)).map((s) => ({ id: s.id, name: s.name, color: s.color, count: counts.get(s.id) }));
}

// Segments proposés à partir des répertoires du site (un segment par dossier de premier niveau, les plus gros
// d'abord). Si un seul dossier contient presque tout le site (/fr/, /shop/…), on descend d'un niveau dedans.
export function suggestFromFolders(R, { max = 10, minPages = 2 } = {}) {
  const pages = (R.pages || []).filter((p) => p.isHtml || (p.status >= 300 && p.status < 400));
  const level = (prefix) => {
    const c = new Map();
    for (const p of pages) {
      const path = pathOf(p.url).split('?')[0];
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const i = rest.indexOf('/');
      if (i <= 0) continue;
      const dir = prefix + rest.slice(0, i + 1);
      c.set(dir, (c.get(dir) || 0) + 1);
    }
    return [...c.entries()].filter(([, n]) => n >= minPages).sort((a, b) => b[1] - a[1]);
  };
  let dirs = level('/');
  const total = pages.length || 1;
  if (dirs.length && dirs[0][1] / total >= 0.8) {
    const inner = level(dirs[0][0]);
    if (inner.length >= 2) dirs = inner;
  }
  const nice = (d) => {
    const last = decodeURIComponent(d.replace(/\/$/, '').split('/').pop() || d);
    return last.length <= 3 ? last.toUpperCase() : last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_]+/g, ' ');
  };
  return normalizeSegments(dirs.slice(0, max).map(([d], i) => ({ name: nice(d) || d, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], match: 'all', rules: [{ field: 'path', op: 'startsWith', value: d }] }))).segments;
}

// Applique des segments à un crawl complet : p.segment, meta.segments et summary.segments (statistiques).
export function applySegments(R, input) {
  const { segments, problems } = normalizeSegments(input);
  assignSegments(R, segments);
  R.meta = { ...R.meta, segments };
  if (R.summary) R.summary = { ...R.summary, segments: segments.length ? segmentStats(R, segments).map(({ pillars: _p, ...row }) => row) : undefined };
  return { segments, problems };
}
