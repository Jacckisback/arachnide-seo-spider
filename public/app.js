/* Arachnide SEO Spider — interface */
import { LANGS, getT, detailText, detectLang } from './shared/i18n.js';
import { icon } from './shared/icons.js';
import { buildReport } from './shared/report.js';
import { compareResults } from './shared/compare.js';
import { robotsFlags } from './shared/directives.js';
import { initFix, refreshFixTexts, renderFixTab, renderFixHistory } from './fix.js';
import { summarize, filterSort, summaryHtml, listHtml, detailHtml } from './issues.js';
import { overviewHtml, playOverview, wireHighlight, pillarsOf, pillarCategories, topActions, strengths } from './overview.js';
import { buildGraph, renderGraph, PALETTE } from './viz.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PAGE_SIZE = 100;
const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem('arachnide.' + k); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('arachnide.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ }
  },
};

let t = (k) => k;
const state = {
  R: null,
  live: [],
  running: false,
  tab: 'dashboard',
  filter: {},
  search: '',
  sort: {},
  page: 0,
  issue: null,
  sevFilter: 'all',
  selected: null,
  detailTab: 'details',
  graph: null,
  env: {},
  progress: null,
  rateSamples: [],
};

/* ---------- Formatage ---------- */
const num = (n) => t.num(n);
const kb = (b) => (b ? `${t.num(Math.round((b / 1024) * 10) / 10)} KB` : '');
const statusCls = (s) => 'st s' + String(s || 0)[0];
const yn = (b) => (b ? `<span class="yes">${t('ui.yes')}</span>` : `<span class="no">${t('ui.no')}</span>`);
const TH = () => state.R?.meta?.thresholds || {};
const html200 = (R) => R.pages.filter((p) => p.isHtml && p.status === 200);
const idxLabel = (p) => (p.indexable ? t('idx.indexable') : t('idx.' + (p.indexabilityReason || 'nonIndexable')));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urlCell = (u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`;
const LEGACY_IMG = new Set(['jpg', 'png', 'gif', 'bmp', 'tiff']);
// Origine d'une image : attribut src, candidat srcset ou <source> d'un élément <picture>.
const imgSource = (r) => {
  if (!r.role || r.role === 'src') return r.picture ? 'src · <picture>' : 'src';
  const d = [r.descriptor, r.media].filter(Boolean).join(' · ');
  return (r.role === 'source' ? '<picture> source' : 'srcset') + (d ? ` (${d})` : '');
};

function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `${icon(kind === 'error' ? 'error' : kind === 'ok' ? 'check' : 'info')}<span>${esc(msg)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

function linkGraph() {
  if (state.graph) return state.graph;
  const { urls, edges } = state.R.links;
  const POS = ['content', 'nav', 'header', 'footer', 'aside'];
  const inl = new Map();
  const out = new Map();
  for (const [f, to, a, flags, pos] of edges) {
    const e = { from: urls[f], to: urls[to], anchor: a, nofollow: !!(flags & 1), internal: !!(flags & 2), image: !!(flags & 4), pos: POS[pos || 0] };
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
    if (!inl.has(e.to)) inl.set(e.to, []);
    inl.get(e.to).push(e);
  }
  state.graph = { inl, out, byUrl: new Map(state.R.pages.map((p) => [p.url, p])) };
  return state.graph;
}

/* ---------- Colonnes ---------- */
// Core Web Vitals : valeur au 75e centile avec la couleur Google (bon / à améliorer / mauvais).
const cwvCell = (m, k) => {
  if (!m) return '<span class="muted">—</span>';
  const v = k === 'cls' ? dec(m.p75, 2) : m.p75 >= 1000 ? `${dec(m.p75 / 1000, 1)} s` : `${num(m.p75)} ms`;
  return `<span class="cwv ${m.cat}">${v}</span>`;
};
// Nombre décimal dans le format de la langue (3,4 en français, 3.4 en anglais).
const dec = (v, d) => new Intl.NumberFormat(t.locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const scoreCell = (s) => (s == null ? '' : `<span class="cwv ${s >= 90 ? 'good' : s >= 50 ? 'ni' : 'poor'}">${s}</span>`);
const C = {
  url: { k: 'url', l: 'col.url', cls: 'trunc', html: (r) => urlCell(r.url) },
  type: { k: 'contentType', l: 'col.type', cls: 'trunc', v: (r) => (r.contentType || '').split(';')[0] },
  status: { k: 'status', l: 'col.status', num: true, html: (r) => (r.blockedByRobots ? `<span class="chip muted">robots.txt</span>` : `<span class="${statusCls(r.status)}">${r.status || '—'}</span>`) },
  statusText: { k: 'statusText', l: 'col.statusText', v: (r) => r.statusText || r.error || (r.blockedByRobots ? t('idx.blocked') : '') },
  indexability: { k: 'indexabilityReason', l: 'col.indexability', v: idxLabel, html: (r) => (r.indexable ? `<span class="chip ok">${t('idx.indexable')}</span>` : `<span class="chip muted">${esc(idxLabel(r))}</span>`) },
  title: { k: 'title', l: 'col.title', cls: 'trunc' },
  titleLength: { k: 'titleLength', l: 'col.chars', num: true },
  titlePx: { k: 'titlePx', l: 'col.pixels', num: true, html: (r) => pxCell(r.titlePx, TH().titleMaxPx) },
  depth: { k: 'depth', l: 'col.depth', num: true },
  inlinks: { k: 'uniqueInlinks', l: 'col.inlinks', num: true },
  contentInlinks: { k: 'contentInlinks', l: 'col.contentInlinks', num: true },
  linkScore: { k: 'linkScore', l: 'col.linkScore', num: true, html: (r) => `<span class="meter"><i style="width:${r.linkScore || 0}%"></i></span> ${num(r.linkScore)}` },
  outlinks: { k: 'internalOutlinks', l: 'col.outlinks', num: true },
  extOut: { k: 'externalOutlinks', l: 'col.extOutlinks', num: true },
  words: { k: 'wordCount', l: 'col.words', num: true },
  rt: { k: 'responseTime', l: 'col.responseTime', num: true },
  size: { k: 'size', l: 'col.size', num: true, html: (r) => kb(r.size) },
  inSitemap: { k: 'inSitemap', l: 'col.inSitemap', v: (r) => (r.inSitemap ? t('ui.yes') : t('ui.no')), html: (r) => yn(r.inSitemap) },
  focus: { k: 'focusKeyword', l: 'col.focusKeyword', cls: 'trunc' },
  dup: (k, sev = 'error') => ({ k, l: 'col.duplicate', v: (r) => (r[k] ? t('ui.yes') : ''), html: (r) => (r[k] ? `<span class="chip ${sev}">${t('ui.yes')}</span>` : '') }),
};
function pxCell(px, max) {
  if (!px) return '';
  const pct = Math.min(100, (px / max) * 100);
  return `<span class="meter ${px > max ? 'over' : ''}"><i style="width:${pct}%"></i></span> ${num(px)}`;
}

/* ---------- Onglets ---------- */
const TABS = [
  { group: 'grp.overview' },
  { id: 'dashboard', icon: 'dashboard' },
  { id: 'issues', icon: 'alert', count: (R) => R.issues.length },
  { id: 'plan', icon: 'target', count: (R) => Math.min(R.issues.length, 20) },
  { id: 'fix', icon: 'wand' },
  { id: 'fixHistory', icon: 'history' },
  { group: 'grp.crawl' },
  { id: 'internal', icon: 'list', rows: (R) => R.pages, cols: [C.url, C.type, C.status, C.indexability, C.title, C.words, C.depth, C.inlinks, C.linkScore, C.rt, C.size],
    filters: { all: () => true, html: (p) => p.isHtml, indexable: (p) => p.indexable && p.isHtml, nonIndexable: (p) => !p.indexable, otherFiles: (p) => !p.isHtml && p.status >= 200 && p.status < 300 } },
  { id: 'external', icon: 'external', rows: (R) => R.externals,
    cols: [C.url, { k: 'status', l: 'col.status', num: true, html: (r) => (r.status == null ? `<span class="chip muted">${t('ui.notChecked')}</span>` : `<span class="${statusCls(r.status)}">${r.status || '—'}</span>`) }, { k: 'statusText', l: 'col.statusText' }, { k: 'inlinks', l: 'col.links', num: true }, { k: 'pages', l: 'col.pages', num: true }, { k: 'firstPage', l: 'col.foundOn', cls: 'trunc' }],
    filters: { all: () => true, inError: (e) => e.status === 0 || e.status >= 400, redirected: (e) => e.status >= 300 && e.status < 400 } },
  { id: 'codes', icon: 'code', rows: (R) => R.pages, cols: [C.url, C.status, C.statusText, { k: 'redirectUrl', l: 'col.redirectsTo', cls: 'trunc' }, C.inlinks, C.rt],
    filters: { all: () => true, s2xx: (p) => p.status >= 200 && p.status < 300, s3xx: (p) => p.status >= 300 && p.status < 400, s4xx: (p) => p.status >= 400 && p.status < 500, s5xx: (p) => p.status >= 500, blocked: (p) => p.blockedByRobots, noResponse: (p) => !p.status && !p.blockedByRobots } },
  { id: 'redirects', icon: 'link', rows: (R) => R.redirects,
    cols: [C.url, { k: 'status', l: 'col.status', num: true }, { k: 'hops', l: 'col.hops', num: true }, { k: 'finalUrl', l: 'col.finalUrl', cls: 'trunc' }, { k: 'finalStatus', l: 'col.finalStatus', num: true }, { k: 'chain', l: 'col.chain', cls: 'wrap', v: (r) => r.chain.join(' → ') }, { k: 'inlinks', l: 'col.inlinks', num: true }],
    filters: { all: () => true, chains: (r) => r.hops > 1, loops: (r) => r.loop, temporary: (r) => r.status === 302 || r.status === 307 } },
  { id: 'broken', icon: 'error', rows: (R) => R.brokenLinks,
    cols: [{ k: 'from', l: 'col.source', cls: 'trunc', html: (r) => urlCell(r.from) }, { k: 'to', l: 'col.brokenLink', cls: 'trunc' }, { k: 'anchor', l: 'col.anchor', cls: 'trunc' }, { k: 'status', l: 'col.status', num: true, html: (r) => `<span class="${statusCls(r.status)}">${r.status || esc(r.statusText) || '—'}</span>` }, { k: 'external', l: 'col.type', v: (r) => (r.external ? t('ui.external') : t('ui.internal')) }],
    filters: { all: () => true, internal: (l) => !l.external, external: (l) => l.external } },
  { id: 'urls', icon: 'link', rows: (R) => R.pages, cols: [C.url, { k: 'urlLength', l: 'col.length', num: true }, C.status, C.indexability],
    filters: { all: () => true, uppercase: (p) => /[A-Z]/.test(new URL(p.url).pathname), underscores: (p) => new URL(p.url).pathname.includes('_'), params: (p) => !!new URL(p.url).search, tooLong: (p) => p.urlLength > (TH().urlMaxLength || 115), encoded: (p) => /%[0-9A-F]{2}/i.test(new URL(p.url).pathname) } },
  { group: 'grp.content' },
  { id: 'titles', icon: 'type', rows: html200,
    cols: [C.url, C.title, C.titleLength, C.titlePx, { k: 'titleCount', l: 'col.count', num: true }, C.dup('duplicateTitle'), C.indexability],
    filters: { all: () => true, missing: (p) => !p.title, duplicate: (p) => p.duplicateTitle, tooLong: (p) => p.titlePx > TH().titleMaxPx, tooShort: (p) => p.title && p.titleLength < TH().titleMin, multiple: (p) => p.titleCount > 1, sameAsH1: (p) => p.title && p.h1?.[0] && p.title.toLowerCase() === p.h1[0].toLowerCase() } },
  { id: 'desc', icon: 'file', rows: html200,
    cols: [C.url, { k: 'metaDescription', l: 'col.metaDescription', cls: 'wrap' }, { k: 'metaDescriptionLength', l: 'col.chars', num: true }, { k: 'metaDescriptionPx', l: 'col.pixels', num: true, html: (r) => pxCell(r.metaDescriptionPx, TH().descMaxPx) }, C.dup('duplicateDescription', 'warning'), C.indexability],
    filters: { all: () => true, missing: (p) => !p.metaDescription, duplicate: (p) => p.duplicateDescription, tooLong: (p) => p.metaDescriptionPx > TH().descMaxPx, tooShort: (p) => p.metaDescription && p.metaDescriptionLength < TH().descMin, multiple: (p) => p.metaDescriptionCount > 1 } },
  { id: 'h1', icon: 'type', rows: html200,
    cols: [C.url, { k: 'h1first', l: 'col.h1', cls: 'wrap', v: (r) => r.h1?.[0] || '' }, { k: 'h1len', l: 'col.chars', num: true, v: (r) => r.h1?.[0]?.length || 0 }, { k: 'h1Count', l: 'col.count', num: true }, { k: 'h1all', l: 'col.otherH1', cls: 'wrap', v: (r) => (r.h1 || []).slice(1).join(' | ') }],
    filters: { all: () => true, missing: (p) => !p.h1Count, multiple: (p) => p.h1Count > 1, duplicate: (p) => p.duplicateH1, skipped: (p) => p.headingSkips?.length } },
  { id: 'h2', icon: 'type', rows: html200, cols: [C.url, { k: 'h2Count', l: 'col.count', num: true }, { k: 'h2list', l: 'col.h2', cls: 'wrap', v: (r) => (r.h2 || []).join(' | ') }],
    filters: { all: () => true, none: (p) => !p.h2Count } },
  { id: 'content', icon: 'file', rows: html200,
    cols: [C.url, C.words, { k: 'textRatio', l: 'col.textRatio', num: true }, C.focus, { k: 'keywords', l: 'col.keywords', cls: 'trunc', v: (r) => (r.keywords || []).join(', ') }, C.dup('duplicateContent'), { k: 'closestSimilarity', l: 'col.similarity', num: true, html: (r) => (r.closestSimilarity ? `≈${r.closestSimilarity} %` : '') }, { k: 'lang', l: 'col.lang' }, C.indexability],
    filters: { all: () => true, thin: (p) => p.wordCount < TH().thinWords, duplicate: (p) => p.duplicateContent, nearDuplicate: (p) => p.nearDuplicates, noLang: (p) => !p.lang } },
  { id: 'neardup', icon: 'copy', rows: (R) => R.nearDuplicates || [],
    cols: [{ k: 'a', l: 'col.pageA', cls: 'trunc', html: (r) => urlCell(r.a) }, { k: 'b', l: 'col.pageB', cls: 'trunc', html: (r) => urlCell(r.b) }, { k: 'similarity', l: 'col.similarity', num: true, html: (r) => `<b>${r.similarity} %</b>` }] },
  { id: 'cannibal', icon: 'target', rows: (R) => (R.cannibalization || []).flatMap((g) => g.urls.map((url) => ({ keyword: g.keyword, url, count: g.urls.length }))),
    cols: [{ k: 'keyword', l: 'col.keyword' }, { k: 'count', l: 'col.pages', num: true }, C.url, { k: 'title', l: 'col.title', cls: 'trunc', v: (r) => linkGraph().byUrl.get(r.url)?.title || '' }] },
  { id: 'images', icon: 'image', rows: (R) => R.images,
    cols: [{ k: 'src', l: 'col.image', cls: 'trunc', html: (r) => urlCell(r.src) }, { k: 'role', l: 'col.imgSource', v: imgSource }, { k: 'format', l: 'col.format' }, { k: 'variants', l: 'col.variants', num: true }, { k: 'of', l: 'col.mainImage', cls: 'trunc' }, { k: 'alt', l: 'col.alt', cls: 'wrap' }, { k: 'missingAlt', l: 'col.altMissing', v: (r) => (r.missingAlt ? t('ui.yes') : ''), html: (r) => (r.missingAlt ? `<span class="chip warning">${t('ui.yes')}</span>` : '') }, { k: 'size', l: 'col.size', num: true, html: (r) => (r.size == null ? '' : kb(r.size)) }, { k: 'status', l: 'col.status', num: true }, { k: 'pages', l: 'col.pages', num: true }, { k: 'firstPage', l: 'col.foundOn', cls: 'trunc' }],
    filters: { all: () => true, mainImages: (i) => !i.role || i.role === 'src', variantsOnly: (i) => i.role && i.role !== 'src', responsive: (i) => i.responsive, notResponsive: (i) => (!i.role || i.role === 'src') && !i.responsive, legacyFormat: (i) => LEGACY_IMG.has(i.format), altMissing: (i) => i.missingAlt, heavy: (i) => i.size > (TH().largeImageBytes || 153600), broken: (i) => i.status !== null && (i.status === 0 || i.status >= 400) } },
  { id: 'extraction', icon: 'code', show: (R) => !!R.meta.options.extractors?.length, rows: html200, cols: [], filters: { all: () => true, withMatches: (p) => p.extracted && Object.values(p.extracted).some((v) => v.length && v[0] !== 0), withoutMatches: (p) => !p.extracted || Object.values(p.extracted).every((v) => !v.length || v[0] === 0) } },
  { id: 'search', icon: 'search', show: (R) => !!R.meta.options.search, rows: html200,
    cols: [C.url, { k: 'searchMatches', l: 'col.matches', num: true }, C.title],
    filters: { withMatches: (p) => p.searchMatches > 0, withoutMatches: (p) => !p.searchMatches } },
  { group: 'grp.technical' },
  { id: 'canonicals', icon: 'link', rows: html200, cols: [C.url, { k: 'canonical', l: 'col.canonical', cls: 'trunc' }, { k: 'canonicalCount', l: 'col.count', num: true }, C.indexability],
    filters: { all: () => true, selfRef: (p) => p.canonical === p.url, canonicalised: (p) => p.canonical && p.canonical !== p.url, missing: (p) => !p.canonical, multiple: (p) => p.canonicalCount > 1 } },
  { id: 'directives', icon: 'shield', rows: (R) => R.pages, cols: [C.url, { k: 'metaRobots', l: 'col.metaRobots' }, { k: 'xRobotsTag', l: 'col.xRobotsTag' }, C.indexability],
    filters: { all: () => true, noindex: (p) => robotsFlags(p.metaRobots, p.xRobotsTag).noindex, nofollow: (p) => robotsFlags(p.metaRobots, p.xRobotsTag).nofollow, blocked: (p) => p.blockedByRobots, nonIndexable: (p) => !p.indexable } },
  { id: 'hreflang', icon: 'globe', rows: (R) => html200(R).filter((p) => p.hreflang?.length),
    cols: [C.url, { k: 'lang', l: 'col.lang' }, { k: 'hrefCount', l: 'col.count', num: true, v: (r) => r.hreflang.length }, { k: 'hreflangs', l: 'col.alternates', cls: 'wrap', v: (r) => r.hreflang.map((h) => `${h.lang}: ${h.href}`).join(' | ') }],
    filters: { all: () => true, invalid: (p) => p.hreflangInvalid?.length, noXDefault: (p) => !p.hreflang.some((h) => h.lang.toLowerCase() === 'x-default') } },
  { id: 'schema', icon: 'code', rows: html200,
    cols: [C.url, { k: 'schemaTypes', l: 'col.schemaTypes', cls: 'wrap', v: (r) => (r.schemaTypes || []).join(', ') }, { k: 'schemaMissing', l: 'col.missingProps', cls: 'wrap', v: (r) => (r.schemaMissing || []).map((m) => `${m.type}: ${m.missing.join(', ')}`).join(' · ') }, { k: 'schemaErrors', l: 'col.invalidJson', num: true }],
    filters: { all: () => true, withData: (p) => p.schemaTypes?.length, withoutData: (p) => !p.schemaTypes?.length, incomplete: (p) => p.schemaMissing?.length, invalidJson: (p) => p.schemaErrors > 0 } },
  { id: 'javascript', icon: 'code', show: (R) => R.meta.rendered, rows: (R) => html200(R).filter((p) => p.js),
    cols: [C.url, { k: 'rawWords', l: 'col.rawWords', num: true, v: (r) => r.js.rawWordCount }, C.words, { k: 'jsLinks', l: 'col.jsLinks', num: true, v: (r) => r.js.jsOnlyLinks }, { k: 'lcp', l: 'col.lcp', num: true, v: (r) => r.js.lcp, html: (r) => (r.js.lcp ? `<span class="${r.js.lcp > TH().lcpMs ? 'no' : 'yes'}">${(r.js.lcp / 1000).toFixed(2)} s</span>` : '') }, { k: 'cls', l: 'col.cls', num: true, v: (r) => r.js.cls, html: (r) => (r.js.cls != null ? `<span class="${r.js.cls > TH().cls ? 'no' : 'yes'}">${r.js.cls}</span>` : '') }, { k: 'jsErrors', l: 'col.jsErrors', num: true, v: (r) => r.js.consoleErrors?.length || 0 }],
    filters: { all: () => true, jsContent: (p) => p.wordCount - p.js.rawWordCount > 100, jsTitle: (p) => p.js.rawTitle !== p.title, jsCanonical: (p) => p.js.rawCanonical !== p.canonical, jsErrors: (p) => p.js.consoleErrors?.length, lcpSlow: (p) => p.js.lcp > TH().lcpMs, clsHigh: (p) => p.js.cls > TH().cls } },
  { id: 'perf', icon: 'bolt', rows: html200,
    cols: [C.url, C.rt, { k: 'downloadTime', l: 'col.downloadTime', num: true }, C.size, { k: 'encoding', l: 'col.compression', v: (r) => r.headers?.encoding || '' }, { k: 'cache', l: 'col.cacheControl', cls: 'trunc', v: (r) => r.headers?.cacheControl || '' }, C.words],
    filters: { all: () => true, slow: (p) => p.responseTime > TH().slowMs, heavyHtml: (p) => p.size > (TH().largeHtmlBytes || 512000), noCompression: (p) => p.headers && !p.headers.encoding } },
  { id: 'security', icon: 'shield', rows: html200,
    cols: [C.url, { k: 'https', l: 'col.https', v: (r) => (r.url.startsWith('https:') ? t('ui.yes') : t('ui.no')), html: (r) => yn(r.url.startsWith('https:')) }, { k: 'hsts', l: 'col.hsts', v: (r) => (r.headers?.hsts ? t('ui.yes') : t('ui.no')), html: (r) => yn(r.headers?.hsts) }, { k: 'mixedContent', l: 'col.mixedContent', num: true }, { k: 'xcto', l: 'col.xcto', v: (r) => (r.headers?.xcto ? t('ui.yes') : t('ui.no')) }, { k: 'csp', l: 'col.csp', v: (r) => (r.headers?.csp ? t('ui.yes') : t('ui.no')) }],
    filters: { all: () => true, http: (p) => p.url.startsWith('http:'), noHsts: (p) => !p.headers?.hsts, mixed: (p) => p.mixedContent > 0 } },
  { group: 'grp.google' },
  { id: 'gsc', icon: 'search', show: (R) => !!R.meta.gsc, rows: (R) => [...html200(R), ...(R.gscOnly || []).map((r) => ({ ...r, gsc: r, gscOnly: true }))],
    cols: [C.url, { k: 'clicks', l: 'col.clicks', num: true, v: (r) => r.gsc?.clicks ?? '' }, { k: 'impressions', l: 'col.impressions', num: true, v: (r) => r.gsc?.impressions ?? '' }, { k: 'ctr', l: 'col.ctr', num: true, v: (r) => (r.gsc ? +(r.gsc.ctr * 100).toFixed(2) : ''), html: (r) => (r.gsc ? `${dec(r.gsc.ctr * 100, 1)} %` : '') }, { k: 'position', l: 'col.position', num: true, v: (r) => r.gsc?.position ?? '' }, { k: 'inCrawl', l: 'col.inCrawl', v: (r) => (r.gscOnly ? t('ui.no') : t('ui.yes')), html: (r) => (r.gscOnly ? `<span class="chip warning">${t('ui.no')}</span>` : t('ui.yes')) }, { ...C.indexability, html: (r) => (r.gscOnly ? '' : C.indexability.html(r)) }, C.linkScore],
    filters: { all: () => true, withClicks: (r) => r.gsc?.clicks > 0, gscOrphans: (r) => r.gscOnly, noImpressions: (r) => !r.gscOnly && r.indexable && !r.gsc?.impressions, lowCtr: (r) => r.gsc?.impressions >= 100 && r.gsc.position <= 10 && r.gsc.ctr < 0.02, nonIndexableTraffic: (r) => !r.gscOnly && !r.indexable && r.gsc?.clicks > 0 } },
  { id: 'cwv', icon: 'bolt', show: (R) => !!R.meta.psi, rows: (R) => html200(R).filter((p) => p.psi),
    cols: [C.url, { k: 'psiScore', l: 'col.psiScore', num: true, v: (r) => r.psi.score ?? '', html: (r) => scoreCell(r.psi.score) }, ...['lcp', 'inp', 'cls', 'fcp', 'ttfb'].map((m) => ({ k: 'f_' + m, l: 'col.' + m, num: true, v: (r) => r.psi.field?.[m]?.p75 ?? '', html: (r) => cwvCell(r.psi.field?.[m], m) })), { k: 'fieldSrc', l: 'col.fieldData', v: (r) => (r.psi.field ? t('ui.yes') : t('cwv.noField')) }, { k: 'labLcp', l: 'col.labLcp', num: true, v: (r) => (r.psi.lab?.lcp ? Math.round(r.psi.lab.lcp) : ''), html: (r) => (r.psi.lab?.lcp ? `${dec(r.psi.lab.lcp / 1000, 1)} s` : '') }, { k: 'tbt', l: 'col.tbt', num: true, v: (r) => (r.psi.lab?.tbt != null ? Math.round(r.psi.lab.tbt) : '') }],
    filters: { all: () => true, poor: (p) => ['lcp', 'inp', 'cls'].some((k) => p.psi.field?.[k]?.cat === 'poor'), needsImprovement: (p) => ['lcp', 'inp', 'cls'].some((k) => p.psi.field?.[k]?.cat === 'ni'), good: (p) => p.psi.field && ['lcp', 'inp', 'cls'].every((k) => !p.psi.field[k] || p.psi.field[k].cat === 'good'), noField: (p) => !p.psi.field } },
  { group: 'grp.architecture' },
  { id: 'linking', icon: 'sitemap', rows: html200, cols: [C.url, C.linkScore, C.depth, C.inlinks, C.contentInlinks, C.outlinks, C.extOut, C.indexability],
    filters: { all: () => true, lowInlinks: (p) => (p.uniqueInlinks || 0) <= 1, noContentInlinks: (p) => !p.contentInlinks, deep: (p) => p.depth >= (TH().deepLevel || 4), unreachable: (p) => p.depth === null } },
  { id: 'sitemap', icon: 'sitemap', rows: (R) => R.pages, cols: [C.url, C.status, C.inSitemap, C.indexability, C.inlinks, C.depth],
    filters: { inSitemap: (p) => p.inSitemap, orphans: (p) => p.inSitemap && !p.uniqueInlinks && p.depth !== 0, nonIndexableInSitemap: (p) => p.inSitemap && !p.indexable, indexableNotInSitemap: (p) => !p.inSitemap && p.indexable && p.isHtml } },
  { id: 'viz', icon: 'graph' },
  { id: 'robots', icon: 'robot' },
];
const TAB_BY_ID = Object.fromEntries(TABS.filter((x) => x.id).map((x) => [x.id, x]));
const visibleTabs = () => {
  const list = TABS.filter((x) => x.group || !x.show || (state.R && x.show(state.R)));
  // Un groupe sans onglet visible (ex. Google sans données) n'est pas affiché.
  return list.filter((x, i) => !x.group || (list[i + 1] && !list[i + 1].group));
};

/* ---------- Barre latérale ---------- */
// Pilotage et exploration en tête ; toutes les autres analyses restent accessibles dans « Plus d'analyses ».
const NAV = [
  { group: 'grp.pilot', items: ['dashboard', 'issues', 'plan', 'fix', 'fixHistory'] },
  { group: 'grp.explore', items: ['internal', 'linking', 'content', 'images', 'directives'] },
];
const NAV_IDS = new Set(NAV.flatMap((g) => g.items));
const SUB_ITEMS = new Set(['fixHistory']); // affiché en retrait sous « Corrections »
const NO_COUNT = new Set(['dashboard', 'plan', 'fix', 'fixHistory']); // pas de compteur qui ne veuille rien dire
const navLabel = (id) => {
  const k = 'nav.' + id;
  const v = t(k);
  return v && v !== k ? v : t('tab.' + id);
};

function tabButton(x) {
  const R = state.R;
  let count = '';
  if (!NO_COUNT.has(x.id)) {
    if (R && x.count) count = x.count(R);
    else if (R && x.rows) count = x.rows(R).length;
    else if (!R && x.id === 'internal' && state.live.length) count = state.live.length;
  }
  const active = state.tab === x.id;
  const disabled = !R && !['dashboard', 'internal'].includes(x.id);
  return `<button data-tab="${x.id}" class="${active ? 'active' : ''}${SUB_ITEMS.has(x.id) ? ' sub' : ''}" ${active ? 'aria-current="page"' : ''} ${disabled ? 'disabled' : ''}>${icon(x.icon)}<span class="lbl">${esc(navLabel(x.id))}</span>${count !== '' ? `<span class="count">${num(count)}</span>` : ''}</button>`;
}

function renderTabs() {
  const vis = visibleTabs();
  const byId = new Map(vis.filter((x) => x.id).map((x) => [x.id, x]));
  let html = NAV.map((g) => `<div class="group">${esc(t(g.group))}</div>${g.items.filter((id) => byId.has(id)).map((id) => tabButton(byId.get(id))).join('')}`).join('');
  // Autres analyses, regroupées comme avant (Crawl, Contenu, Technique, Google, Architecture).
  const more = [];
  let cur = null;
  for (const x of vis) {
    if (x.group) cur = { group: x.group, items: [] };
    else if (!NAV_IDS.has(x.id) && cur) {
      if (!more.includes(cur)) more.push(cur);
      cur.items.push(x);
    }
  }
  const open = store.get('navMore') === '1' || (state.tab && !NAV_IDS.has(state.tab));
  html += `<details class="nav-more" ${open ? 'open' : ''}><summary>${icon('chevronRight')}<span>${esc(t('grp.more'))}</span></summary>${more.map((g) => `<div class="subgroup">${esc(t(g.group))}</div>${g.items.map(tabButton).join('')}`).join('')}</details>`;
  $('#tabs').innerHTML = html;
  $('#tabs .nav-more').addEventListener('toggle', (e) => store.set('navMore', e.target.open ? '1' : '0'));
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b || b.disabled) return;
  // Depuis le menu, la page Problèmes s'ouvre sur sa liste (sur mobile, le détail est une vue à part).
  if (b.dataset.tab === 'issues') { state.ivDetailOpen = false; state.ivUrls = null; }
  goTab(b.dataset.tab);
});
function goTab(id) {
  closeNav();
  state.tab = id;
  state.search = '';
  state.page = 0;
  store.set('tab', id);
  renderTabs();
  render();
  $('#view').scrollTop = 0;
}

/* ---------- Rendu principal ---------- */
function render() {
  const view = $('#view');
  if (state.vizHandle && state.tab !== 'viz') {
    state.vizHandle.destroy();
    state.vizHandle = null;
  }
  view.classList.toggle('full', state.tab === 'viz' && !!state.R);
  if (!state.R) {
    if (state.tab === 'internal' && state.live.length) return renderTable(view, liveTab(), state.live);
    return state.running ? renderRunning(view) : renderHome(view);
  }
  if (state.tab === 'dashboard') return renderDashboard(view);
  if (state.tab === 'issues') return renderIssues(view);
  if (state.tab === 'plan') return renderPlan(view);
  if (state.tab === 'robots') return renderRobots(view);
  if (state.tab === 'viz') return renderViz(view);
  if (state.tab === 'fix') return renderFixTab(view);
  if (state.tab === 'fixHistory') return renderFixHistory(view);
  let tab = TAB_BY_ID[state.tab];
  if (!tab || (tab.show && !tab.show(state.R))) return goTab('dashboard');
  if (tab.id === 'extraction') {
    // Une colonne par extracteur défini dans la configuration du crawl.
    tab = { ...tab, cols: [C.url, ...state.R.meta.options.extractors.map((ex) => ({ k: 'x:' + ex.name, l: ex.name, raw: true, cls: 'wrap', v: (r) => (r.extracted?.[ex.name] || []).join(' | ') }))] };
  }
  renderTable(view, tab, tab.rows(state.R));
}

function liveTab() {
  return { id: 'live', cols: [C.url, C.type, C.status, C.title, C.words, C.rt, C.size] };
}

async function renderHome(view) {
  view.innerHTML = `<div class="home">
    <div class="hero">
      <div class="hero-logo">${icon('spider')}</div>
      <h1>${esc(t('home.title'))}</h1>
      <p>${esc(t('home.subtitle'))}</p>
      <div class="hero-feats">${['f1', 'f2', 'f3', 'f4'].map((k) => `<div class="feat">${icon(['bolt', 'code', 'report', 'globe'][['f1', 'f2', 'f3', 'f4'].indexOf(k)])}<b>${esc(t('home.' + k + 't'))}</b><span>${esc(t('home.' + k))}</span></div>`).join('')}</div>
    </div>
    <h2 class="sec">${esc(t('home.recent'))}</h2>
    <div id="recent" class="recent"><p class="muted">${esc(t('ui.loading'))}</p></div>
  </div>`;
  const items = await fetch('/api/crawls').then((r) => r.json()).catch(() => []);
  const box = $('#recent');
  if (!box) return;
  box.innerHTML = items.length
    ? items.slice(0, 8).map((i) => `<button class="recent-card" data-open="${esc(i.file)}">
        <span class="grade g${esc(i.grade || '')}">${esc(i.grade || '?')}</span>
        <span class="rc-main"><b>${esc(i.host || i.file)}</b><small>${i.finishedAt ? esc(t.date(i.finishedAt)) : ''}</small></span>
        <span class="rc-meta">${i.score != null ? `${num(i.score)}/100` : ''}<small>${i.totalUrls != null ? esc(t('home.urls', { n: i.totalUrls })) : ''}</small></span>
      </button>`).join('')
    : `<p class="muted">${esc(t('home.noCrawls'))}</p>`;
  box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openSaved(b.dataset.open)));
}

function renderRunning(view) {
  view.innerHTML = `<div class="empty"><div class="spin">${icon('spider')}</div><h2>${esc(t('run.title'))}</h2><p>${esc(t('run.hint'))}</p></div>`;
}

function cellValue(col, r) {
  return col.v ? col.v(r) : r[col.k];
}

function renderTable(view, tab, allRows, opts = {}) {
  const filters = tab.filters || {};
  const names = Object.keys(filters);
  const fname = names.includes(state.filter[tab.id]) ? state.filter[tab.id] : names[0];
  let rows = fname ? allRows.filter(filters[fname]) : allRows.slice();
  const q = state.search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => tab.cols.some((c) => String(cellValue(c, r) ?? '').toLowerCase().includes(q)));
  const s = state.sort[tab.id];
  if (s) {
    const col = tab.cols.find((c) => c.k === s.k) || tab.cols[0];
    rows.sort((a, b) => {
      const x = cellValue(col, a);
      const y = cellValue(col, b);
      const nx = x == null || x === '';
      const ny = y == null || y === '';
      if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), t.locale, { numeric: true });
      return s.desc ? -r : r;
    });
  }
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  const rowKey = (r) => r.url || r.from || r.a || r.src;
  const title = opts.title ?? t('tab.' + tab.id);
  const help = opts.help ?? (t.has('help.' + tab.id) ? t('help.' + tab.id) : '');

  view.innerHTML = `
    <div class="toolbar">
      <div class="tb-title"><h2>${esc(title)}</h2>${help ? `<p class="help">${esc(help)}</p>` : ''}</div>
      <div class="tb-actions">
        ${names.length > 1 ? `<div class="seg">${names.map((n) => `<button data-f="${n}" class="${n === fname ? 'on' : ''}">${esc(t('f.' + n))} <span>${num(allRows.filter(filters[n]).length)}</span></button>`).join('')}</div>` : ''}
        <label class="searchbox">${icon('search')}<input id="searchInput" type="search" placeholder="${esc(t('ui.search'))}" value="${esc(state.search)}"></label>
        <span class="muted">${esc(t('ui.rows', { n: rows.length }))}</span>
        <button class="btn" id="copyBtn" title="${esc(t('ui.copyUrls'))}">${icon('copy')}</button>
        <button class="btn" id="csvBtn">${icon('download')} CSV</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${tab.cols.map((c) => `<th data-k="${esc(c.k)}" class="${c.num ? 'num' : ''} ${s && s.k === c.k ? 'sorted' + (s.desc ? ' desc' : '') : ''}">${esc(c.raw ? c.l : t(c.l))}</th>`).join('')}</tr></thead>
      <tbody>${slice.map((r, i) => `<tr tabindex="-1" data-i="${state.page * PAGE_SIZE + i}" class="${state.selected && rowKey(r) === state.selected ? 'sel' : ''}">${tab.cols.map((c) => {
        const v = cellValue(c, r);
        return `<td class="${c.num ? 'num' : ''} ${c.cls || ''}" title="${esc(v)}">${c.html ? c.html(r) : esc(c.num ? num(v) : v)}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>${rows.length ? '' : `<div class="empty small">${icon('check')} ${esc(t('ui.noRows'))}</div>`}</div>
    ${pages > 1 ? `<div class="pager"><button class="btn small" id="prevPg" ${state.page === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button> ${esc(t('ui.page', { n: state.page + 1, total: pages }))} <button class="btn small" id="nextPg" ${state.page >= pages - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button></div>` : ''}`;

  view.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { state.filter[tab.id] = b.dataset.f; state.page = 0; render(); }));
  const si = $('#searchInput', view);
  si.addEventListener('input', debounce(() => {
    state.search = si.value;
    state.page = 0;
    render();
    const el = $('#searchInput');
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, 250));
  view.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    const cur = state.sort[tab.id];
    state.sort[tab.id] = cur && cur.k === k ? { k, desc: !cur.desc } : { k, desc: !!tab.cols.find((c) => c.k === k)?.num };
    render();
  }));
  $('#prevPg', view)?.addEventListener('click', () => { state.page--; render(); });
  $('#nextPg', view)?.addEventListener('click', () => { state.page++; render(); });
  $('#csvBtn', view).addEventListener('click', () => exportCsv(tab, rows, fname, title));
  $('#copyBtn', view).addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText([...new Set(rows.map(rowKey))].join('\n'));
      toast(t('toast.copied', { n: rows.length }), 'ok');
    } catch { toast(t('toast.copyFailed'), 'error'); }
  });
  const tbody = view.querySelector('tbody');
  const select = (tr) => {
    if (!tr) return;
    const r = rows[Number(tr.dataset.i)];
    view.querySelectorAll('tr.sel').forEach((x) => x.classList.remove('sel'));
    tr.classList.add('sel');
    tr.focus({ preventScroll: false });
    selectUrl(r.url || r.from || r.a || r.firstPage);
  };
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    select(e.target.closest('tr[data-i]'));
  });
  tbody.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (e.key === 'ArrowDown') { e.preventDefault(); select(tr?.nextElementSibling); }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(tr?.previousElementSibling); }
    if (e.key === 'Enter' && state.selected) window.open(state.selected, '_blank', 'noopener');
  });
}

/* ---------- Tableau de bord ---------- */
function bars(entries, colorFn = () => 'var(--accent)') {
  const list = entries.filter(([, v]) => v > 0);
  const max = Math.max(1, ...list.map(([, v]) => v));
  return list.map(([k, v]) => `<div class="b"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%;background:${colorFn(k)}"></div></div><span class="n">${num(v)}</span></div>`).join('') || `<p class="muted">—</p>`;
}

const sevChip = (s) => `<span class="chip ${s}">${esc(t('sev.' + s))}</span>`;

function renderDashboard(view) {
  const R = state.R;
  const S = R.summary;
  const pillars = pillarsOf(R);
  const key = R.meta.finishedAt + '|' + R.meta.startUrl;
  // Animation au premier affichage d'un résultat (depuis les valeurs précédentes s'il y en avait), pas à chaque retour.
  const animate = state.ovShown !== key;
  const from = animate ? state.ovPrev || { score: 0, pillars: {}, kpis: {} } : null;
  const prevDelta = state.compare && state.compare.reliable !== false ? state.compare.scoreDelta : null;
  view.innerHTML = overviewHtml(R, { t, esc, icon, num, prevDelta }, { pillars, actions: topActions(R), good: strengths(R), partial: isPartial(R), from });
  playOverview(view, num, { animate });
  wireHighlight(view);
  state.ovShown = key;
  state.ovPrev = { score: S.score, pillars: Object.fromEntries(pillars.map((p) => [p.id, p.score ?? 0])), kpis: { crawled: S.totalUrls, indexable: S.indexable, response: S.medianResponseTime || 0, links: S.internalLinks } };
  const on = (sel, fn) => view.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
  on('[data-pillar]', (el) => {
    const p = pillars.find((x) => x.id === el.dataset.pillar);
    state.pillarFilter = { id: p.id, color: p.color, categories: pillarCategories(p.id) };
    state.sevFilter = 'all';
    state.issue = null;
    goTab('issues');
  });
  on('[data-issue]', (el) => openIssue(el.dataset.issue));
  on('[data-sev]', (el) => {
    state.pillarFilter = null;
    state.sevFilter = el.dataset.sev;
    state.issue = null;
    goTab('issues');
  });
  on('.good[data-tab]', (el) => goTab(el.dataset.tab));
  on('#ovDetail', () => openIssue());
  on('#ovAllIssues', () => openIssue());
  on('#ovPlan', () => goTab('plan'));
  on('#ovLimits', () => {
    configDialog.showModal();
    $('#configDialog [data-cfg="limits"]')?.click();
  });
}

function skippedBanner(R) {
  const sk = Object.entries(R.meta.skipped || {}).filter(([, n]) => n > 0);
  if (!sk.length) return '';
  const total = sk.reduce((a, [, n]) => a + n, 0);
  return `<div class="banner info">${icon('info')} <span><b>${esc(t('dash.skipped', { n: total }))}</b> ${sk.map(([k, n]) => `${esc(t('skip.' + k))} : ${num(n)}`).join(' · ')}</span></div>`;
}

function openIssue(id) {
  state.pillarFilter = null;
  state.ivUrls = null;
  if (id) { state.sevFilter = 'all'; state.ivQ = ''; state.ivDetailOpen = true; }
  state.issue = id || null;
  state.ivFollow = true;
  goTab('issues');
}

/* ---------- Problèmes ---------- */
const ivX = () => ({ t, esc, icon, num, detailText });
const ivState = () => ({ sev: state.sevFilter, q: state.ivQ || '', sort: state.ivSort || 'priority', page: state.ivPage || 0, issue: state.issue });

function renderIssues(view) {
  const R = state.R;
  if (!R.issues.length) {
    view.innerHTML = `<div class="iv">${ivHead()}<div class="empty">${icon('check')}<h2>${esc(t('issues.none'))}</h2><p class="muted">${esc(t('iv.noneHint'))}</p></div></div>`;
    return;
  }
  const pf = state.pillarFilter;
  // Liste complète des URL d'un problème : tableau existant (recherche, tri, pagination, CSV, panneau de détail).
  const urlsOf = state.ivUrls && R.issues.find((i) => i.id === state.ivUrls);
  if (urlsOf) {
    view.innerHTML = `<div class="iv"><button class="link iv-back-list" id="ivBackList">${icon('chevronLeft')} ${esc(t('iv.backToIssues'))}</button><div id="issueTable"></div></div>`;
    $('#ivBackList').onclick = () => { state.ivUrls = null; state.search = ''; state.page = 0; render(); };
    renderTable($('#issueTable'), { id: 'issue-' + urlsOf.id, cols: [C.url, { k: 'detail', l: 'col.detail', cls: 'wrap' }] }, ivItems(urlsOf), { title: t('issue.' + urlsOf.id + '.label', urlsOf.params), help: t('iv.urlsHelp') });
    return;
  }
  const st = ivState();
  const rows = filterSort(R.issues, { sev: st.sev, q: st.q, sort: st.sort, categories: pf?.categories }, t);
  // Le problème sélectionné reste celui choisi s'il est encore visible, sinon le premier du classement actif.
  if (!rows.find((i) => i.id === state.issue)) state.issue = rows[0]?.id || null;
  const idx = rows.findIndex((i) => i.id === state.issue);
  if (state.ivFollow && idx >= 0) state.ivPage = Math.floor(idx / IV_PAGE);
  state.ivFollow = false;
  st.issue = state.issue;
  st.page = state.ivPage || 0;
  const issue = R.issues.find((i) => i.id === state.issue);
  view.innerHTML = `<div class="iv">
    ${ivHead()}
    ${isPartial(R) ? `<div class="ov-banner warn">${icon('alert')}<span>${esc(t('iv.partial'))}</span></div>` : ''}
    ${summaryHtml(summarize(R.issues), st.sev, ivX())}
    ${pf ? `<div class="filter-chip-row"><span class="pill-filter c-${pf.color}">${esc(t('pillar.' + pf.id))} <button class="link" id="clearPillar" aria-label="${esc(t('ui.close'))}">${icon('x')}</button></span></div>` : ''}
    <div class="iv-work${state.ivDetailOpen ? ' show-detail' : ''}">
      ${listHtml(R, rows, st, ivX())}
      <div id="ivDetail">${issue ? detailHtml(R, issue, ivX()) : `<section class="iv-panel iv-detail"><div class="empty small">${icon('search')}<p>${esc(t('iv.noSelection'))}</p></div></section>`}</div>
    </div></div>`;
  wireIssues(view, rows);
}

const IV_PAGE = 10;
const ivHead = () => `<header class="iv-head"><h1>${esc(t('iv.title'))}</h1><p>${esc(t('iv.subtitle'))}</p></header>`;
const ivItems = (is) => is.items.map((it) => ({ url: it.url, detail: detailText(it.detail, t) }));

function wireIssues(view, rows) {
  const R = state.R;
  const rerender = (follow) => { state.ivFollow = follow; render(); };
  view.querySelectorAll('[data-sevf]').forEach((b) => b.addEventListener('click', () => { state.sevFilter = b.dataset.sevf; state.ivPage = 0; rerender(true); }));
  view.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { state.ivSort = b.dataset.sort; state.ivPage = 0; rerender(true); }));
  view.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { state.ivPage = Number(b.dataset.pg); rerender(false); $('#ivAllTitle')?.scrollIntoView({ block: 'nearest' }); }));
  $('#ivSort', view)?.addEventListener('change', (e) => { state.ivSort = e.target.value; state.ivPage = 0; rerender(true); });
  $('#ivReset', view)?.addEventListener('click', () => { state.sevFilter = 'all'; state.ivQ = ''; state.pillarFilter = null; state.ivPage = 0; rerender(true); });
  $('#clearPillar', view)?.addEventListener('click', () => { state.pillarFilter = null; rerender(true); });
  const si = $('#ivSearch', view);
  si?.addEventListener('input', debounce(() => {
    state.ivQ = si.value;
    state.ivPage = 0;
    rerender(true);
    const el = $('#ivSearch');
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, 200));
  // Choisir un problème ne met à jour que le panneau : la page, la recherche et le défilement de la liste restent.
  const select = (tr, focusDetail) => {
    if (!tr) return;
    state.issue = tr.dataset.issue;
    view.querySelectorAll('.iv-row').forEach((x) => { x.classList.toggle('sel', x === tr); x.setAttribute('aria-selected', x === tr); });
    const is = R.issues.find((i) => i.id === state.issue);
    $('#ivDetail', view).innerHTML = detailHtml(R, is, ivX());
    wireDetail(view, is);
    if (focusDetail) {
      state.ivDetailOpen = true;
      view.querySelector('.iv-work')?.classList.add('show-detail');
      if (matchMedia('(max-width: 900px)').matches) { $('#ivDetail', view)?.scrollIntoView({ block: 'start' }); $('#ivBack', view)?.focus({ preventScroll: true }); }
    }
  };
  const tbody = view.querySelector('.iv-table tbody');
  tbody?.addEventListener('click', (e) => select(e.target.closest('.iv-row'), true));
  tbody?.addEventListener('keydown', (e) => {
    const tr = e.target.closest('.iv-row');
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(tr, true); }
    if (e.key === 'ArrowDown') { e.preventDefault(); tr?.nextElementSibling?.focus(); select(tr?.nextElementSibling); }
    if (e.key === 'ArrowUp') { e.preventDefault(); tr?.previousElementSibling?.focus(); select(tr?.previousElementSibling); }
  });
  const is = R.issues.find((i) => i.id === state.issue);
  if (is) wireDetail(view, is);
}

function wireDetail(view, is) {
  $('#ivSeeUrls', view)?.addEventListener('click', () => { state.ivUrls = is.id; state.search = ''; state.page = 0; render(); });
  $('#ivExport', view)?.addEventListener('click', () => exportCsv({ cols: [C.url, { k: 'detail', l: 'col.detail' }] }, ivItems(is), '', t('issue.' + is.id + '.label', is.params)));
  $('#ivFix', view)?.addEventListener('click', () => goTab('fix'));
  $('#ivBack', view)?.addEventListener('click', () => {
    state.ivDetailOpen = false;
    view.querySelector('.iv-work')?.classList.remove('show-detail');
    view.querySelector(`.iv-row[data-issue="${CSS.escape(is.id)}"]`)?.focus();
  });
}

/* ---------- Plan d'action ---------- */
function renderPlan(view) {
  const R = state.R;
  const plan = [...R.issues].sort((a, b) => ['error', 'warning', 'notice'].indexOf(a.severity) - ['error', 'warning', 'notice'].indexOf(b.severity) || b.priority - a.priority);
  const quick = plan.filter((i) => i.effort === 'low' && i.impact !== 'low' && i.severity !== 'notice');
  view.innerHTML = `
    <div class="toolbar"><div class="tb-title"><h2>${esc(t('tab.plan'))}</h2><p class="help">${esc(t('help.plan'))}</p></div>
      <div class="tb-actions"><button class="btn primary" id="planReport">${icon('report')} ${esc(t('ui.report'))}</button></div></div>
    ${quick.length ? `<div class="card quick"><h3>${icon('bolt')} ${esc(t('plan.quickWins'))}</h3><div class="qw">${quick.slice(0, 6).map((i) => `<button data-issue="${i.id}"><b>${esc(t('issue.' + i.id + '.label', i.params))}</b><span>${num(i.count)} · ${esc(t('cat.' + i.category))}</span></button>`).join('')}</div></div>` : ''}
    <div class="table-wrap"><table class="plan"><thead><tr><th>#</th><th>${esc(t('col.issue'))}</th><th>${esc(t('col.severity'))}</th><th>${esc(t('impact.label'))}</th><th>${esc(t('effort.label'))}</th><th class="num">${esc(t('col.urls'))}</th><th>${esc(t('col.fix'))}</th></tr></thead>
    <tbody>${plan.map((i, n) => `<tr data-issue="${i.id}"><td class="num">${n + 1}</td><td><b>${esc(t('issue.' + i.id + '.label', i.params))}</b><br><small class="muted">${esc(t('cat.' + i.category))}</small></td><td>${sevChip(i.severity)}</td><td><span class="lvl impact-${i.impact}">${esc(t('lvl.' + i.impact))}</span></td><td><span class="lvl effort-${i.effort}">${esc(t('lvl.' + i.effort))}</span></td><td class="num">${num(i.count)}</td><td class="wrap">${esc(t('issue.' + i.id + '.fix', i.params))}</td></tr>`).join('')}</tbody></table></div>`;
  view.querySelectorAll('[data-issue]').forEach((el) => el.addEventListener('click', () => openIssue(el.dataset.issue)));
  $('#planReport').addEventListener('click', openReportDialog);
}

/* ---------- Visualisations 2D / 3D ---------- */
// Export PDF : page imprimable (image du graphe, légende, site et date) ; « Enregistrer au format PDF » à l'impression.
function vizPdf({ img, title, legend, notes }) {
  const w = window.open('', '_blank');
  if (!w) return toast(t('viz.popupBlocked'), 'error');
  const site = state.R.meta.startUrl;
  const date = new Date(state.R.meta.finishedAt).toLocaleString(t.lang);
  w.document.write(`<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><title>${esc(hostOf())} — ${esc(title)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1f27;margin:0}
h1{font-size:18px;margin:0 0 2px}.meta{color:#5b6578;margin-bottom:8px}img{width:100%;max-height:150mm;object-fit:contain;border:1px solid #e2e5eb;border-radius:6px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.notes{color:#5b6578;margin-top:6px}footer{margin-top:8px;color:#8a93a6;font-size:10px}</style></head><body>
<h1>${esc(title)}</h1><div class="meta">${esc(site)} · ${esc(date)}</div><img src="${img}" alt="">
<div class="legend">${legend.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>
<div class="notes">${notes.filter(Boolean).map(esc).join(' · ')}</div><footer>Arachnide SEO Spider</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

async function renderViz(view) {
  const o = { view: 'crawl', dim: '2d', colorBy: 'status', sizeBy: 'linkScore', maxNodes: 1500, ...store.get('viz', {}) };
  const seg = (name, values) => `<div class="seg">${values.map((v) => `<button data-${name}="${v}" class="${o[name] === v ? 'on' : ''}">${esc(t(`viz.${name}.${v}`))}</button>`).join('')}</div>`;
  const legend = o.colorBy === 'issues'
    ? [['sevError', 'sev.error'], ['sevWarning', 'sev.warning'], ['sevNotice', 'sev.notice'], ['sevNone', 'viz.noIssue']]
    : o.colorBy === 'depth'
      ? [['__depth0', 'viz.shallow'], ['__depth1', 'viz.deep']]
      : [['indexable', 'idx.indexable'], ['nonIndexable', 'idx.nonIndexable'], ['redirect', 'idx.redirect'], ['error', 'viz.error'], ['blocked', 'idx.blocked'], ...(o.view === 'dir' ? [['folder', 'viz.folder']] : [])];
  const swatch = (k) => (k === '__depth0' ? 'hsl(130 65% 45%)' : k === '__depth1' ? 'hsl(0 65% 45%)' : PALETTE[k]);
  view.innerHTML = `
    <div class="toolbar"><div class="tb-title"><h2>${esc(t('tab.viz'))}</h2><p class="help">${esc(t('help.viz.' + o.view))}</p></div>
      <div class="tb-actions">
        ${seg('view', ['crawl', 'dir', 'links'])}
        ${seg('dim', ['2d', '3d'])}
        <select id="vizColor" aria-label="${esc(t('viz.colorBy'))}">${['status', 'issues', 'depth'].map((c) => `<option value="${c}" ${o.colorBy === c ? 'selected' : ''}>${esc(t('viz.color.' + c))}</option>`).join('')}</select>
 <select id="vizSize" aria-label="${esc(t('viz.sizeBy'))}">${['linkScore', 'weight', 'inlinks', 'responseTime'].map((c) => `<option value="${c}" ${o.sizeBy === c ? 'selected' : ''}>${esc(t('viz.size.' + c))}</option>`).join('')}</select>
        <select id="vizMax" aria-label="${esc(t('viz.maxNodes'))}">${[500, 1500, 3000, 6000].map((n) => `<option value="${n}" ${o.maxNodes === n ? 'selected' : ''}>${esc(t('viz.nodes', { n }))}</option>`).join('')}</select>
        <button class="btn" id="vizFit" title="${esc(t('viz.fit'))}">${icon('target')}</button>
        <button class="btn" id="vizPng">${icon('download')} PNG</button>
        <button class="btn" id="vizPdf">${icon('file')} PDF</button>
      </div></div>
    <div class="viz-wrap"><div id="vizCanvas" class="viz-canvas"><div class="empty">${icon('spider')} ${esc(t('ui.loading'))}</div></div>
      <div class="viz-legend">${legend.map(([k, l]) => `<span><i style="background:${swatch(k)}"></i>${esc(t(l))}</span>`).join('')}<span class="muted">${esc(t('viz.sizeHint.' + o.sizeBy))}</span>${o.colorBy === 'issues' ? `<span class="muted">${esc(t('viz.issuesHint'))}</span>` : ''}</div>
      <div id="vizNote" class="viz-note muted"></div></div>`;
  const update = (patch) => { store.set('viz', { ...o, ...patch }); render(); };
  view.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => update({ view: b.dataset.view })));
  view.querySelectorAll('[data-dim]').forEach((b) => b.addEventListener('click', () => update({ dim: b.dataset.dim })));
  $('#vizColor').addEventListener('change', (e) => update({ colorBy: e.target.value }));
  $('#vizMax').addEventListener('change', (e) => update({ maxNodes: Number(e.target.value) }));
  $('#vizSize').addEventListener('change', (e) => update({ sizeBy: e.target.value }));
  if (state.vizHandle) { state.vizHandle.destroy(); state.vizHandle = null; }
  const el = $('#vizCanvas');
  const data = buildGraph(state.R, linkGraph(), o);
  const note = t('viz.stats', { nodes: data.nodes.length, links: data.links.length }) + (data.truncated ? ' · ' + t('viz.truncated', { n: o.maxNodes }) : '') + (data.resources ? ' · ' + t('viz.resourcesHidden', { n: data.resources }) : '');
  $('#vizNote').textContent = note;
  try {
    el.innerHTML = '';
    const R = state.R;
    // Clic sur un nœud : détails de la page, ou directement ses problèmes quand la couleur montre les problèmes.
    const onSelect = (url, n) => {
      if (o.colorBy === 'issues' && n?.issues?.length) state.detailTab = 'issues';
      selectUrl(url);
    };
    const handle = await renderGraph(el, data, { view: o.view, dim: o.dim, t, onSelect });
    if (state.R !== R || state.tab !== 'viz' || !document.body.contains(el)) return handle.destroy();
    state.vizHandle = handle;
    $('#vizFit').addEventListener('click', () => handle.graph.zoomToFit(500, 30));
    $('#vizPng').addEventListener('click', () => {
      const url = handle.png();
      if (!url) return toast(t('toast.copyFailed'), 'error');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${hostOf()}_${o.view}_${o.dim}.png`;
      a.click();
    });
    $('#vizPdf').addEventListener('click', () => {
      const img = handle.png();
      if (!img) return toast(t('toast.copyFailed'), 'error');
      vizPdf({ img, title: `${t('tab.viz')} — ${t('viz.view.' + o.view)} (${o.dim.toUpperCase()})`, legend: legend.map(([k, l]) => [swatch(k), t(l)]), notes: [t('viz.color.' + o.colorBy), t('viz.sizeHint.' + o.sizeBy), note] });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty">${icon('error')} ${esc(t('viz.loadFailed'))}<br><small>${esc(err.message)}</small></div>`;
  }
}

/* ---------- Robots, IA & sitemaps ---------- */
function renderRobots(view) {
  const m = state.R.meta;
  view.innerHTML = `
    <div class="toolbar"><div class="tb-title"><h2>${esc(t('tab.robots'))}</h2><p class="help">${esc(t('help.robots'))}</p></div></div>
    <div class="dash-two">
      <div class="card"><h3>${icon('robot')} ${esc(t('robots.bots'))}</h3>
        <table class="mini"><tbody>${(m.botAccess || []).map((b) => `<tr><td>${esc(b.bot)}</td><td>${b.allowed == null ? `<span class="chip">${esc(t('robots.unknown'))}</span>` : b.allowed ? `<span class="chip ok">${esc(t('robots.allowed'))}</span>` : `<span class="chip error">${esc(t('robots.blocked'))}</span>`}</td></tr>`).join('')}</tbody></table>
        <p class="mt">${m.llmsTxt ? `<span class="chip ok">llms.txt ✓</span> ${num(m.llmsTxt.size)} ${esc(t('robots.chars'))}` : `<span class="chip muted">llms.txt ✗</span> ${esc(t('robots.noLlms'))}`}</p>
      </div>
      <div class="card"><h3>${icon('sitemap')} ${esc(t('robots.sitemaps'))} · ${num(m.sitemapUrlCount)} URLs</h3>
        ${m.sitemapFiles.length ? `<table class="mini"><tbody>${m.sitemapFiles.map((s) => `<tr><td class="trunc">${urlCell(s.url)}</td><td>${esc(s.type === 'index' ? t('robots.index') : 'urlset')}</td><td class="num">${num(s.count)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${esc(t('robots.noSitemap'))}</p>`}
      </div>
    </div>
    <div class="card mt"><h3>robots.txt · <a href="${esc(m.origin)}/robots.txt" target="_blank" rel="noopener">${esc(m.origin)}/robots.txt</a></h3>
      <p class="mt0"><span class="chip muted">${esc(t('robots.modeUsed'))} : ${esc(t({ respect: 'opt.robotsRespect', report: 'opt.robotsReport', ignore: 'opt.robotsIgnore' }[m.options.robotsMode || 'respect']))}</span>${m.options.customRobots ? ` <span class="chip notice">${esc(t('robots.customUsed'))}</span>` : ''}</p>
      ${m.robotsTxt ? `<pre class="robots">${esc(m.robotsTxt)}</pre>` : `<p class="muted">${esc(t('robots.noRobots'))}</p>`}</div>
    <div class="card mt"><h3>${esc(t('robots.config'))}</h3><div class="kv">${Object.entries(m.options).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div></div>`;
}

/* ---------- Panneau de détails ---------- */
function selectUrl(url) {
  if (!url) return;
  state.selected = url;
  renderDetail();
}

function renderDetail() {
  const box = $('#detail');
  const url = state.selected;
  if (!url) { box.hidden = true; return; }
  const p = state.R ? linkGraph().byUrl.get(url) : state.live.find((x) => x.url === url);
  box.hidden = false;
  const pageIssues = state.R ? state.R.issues.filter((i) => i.items.some((it) => it.url === url)) : [];
  const tabs = state.R ? ['details', 'issues', 'serp', 'in', 'out', ...(p?.js ? ['js'] : [])] : ['details'];
  if (!tabs.includes(state.detailTab)) state.detailTab = 'details';
  let body = '';
  if (!p) body = `<p class="muted">${esc(t('detail.notCrawled'))}</p>`;
  else if (state.detailTab === 'details') body = detailKv(p);
  else if (state.detailTab === 'issues') body = pageIssuesTable(url, pageIssues);
  else if (state.detailTab === 'serp') body = serpPreview(p);
  else if (state.detailTab === 'js') body = jsCompare(p);
  else {
    const g = linkGraph();
    const list = (state.detailTab === 'in' ? g.inl.get(url) : g.out.get(url)) || [];
    const other = state.detailTab === 'in' ? 'from' : 'to';
    body = list.length ? `<div class="table-wrap"><table><thead><tr><th>${esc(t(state.detailTab === 'in' ? 'detail.from' : 'detail.to'))}</th><th>${esc(t('col.anchor'))}</th><th>${esc(t('detail.position'))}</th><th>${esc(t('col.type'))}</th><th>${esc(t('col.status'))}</th></tr></thead><tbody>${list.slice(0, 1000).map((e) => {
      const target = g.byUrl.get(e[other]);
      return `<tr data-url="${esc(e[other])}"><td class="trunc">${esc(e[other])}</td><td class="trunc">${e.anchor ? esc(e.anchor) : `<span class="muted">${esc(t(e.image ? 'detail.imageNoAlt' : 'detail.noAnchor'))}</span>`}</td><td>${esc(t('pos.' + e.pos))}</td><td>${esc(e.internal ? t('ui.internal') : t('ui.external'))}${e.nofollow ? ' <span class="chip warning">nofollow</span>' : ''}</td><td>${target ? `<span class="${statusCls(target.status)}">${target.status || '—'}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('detail.noLinks'))}</p>`;
  }
  const label = (k) => (k === 'in' || k === 'out' ? `${t('detail.' + k)} <span class="count">${num(((k === 'in' ? linkGraph().inl : linkGraph().out).get(url) || []).length)}</span>` : k === 'issues' ? `${esc(t('detail.issues'))} <span class="count${pageIssues.length ? ' warn' : ''}">${num(pageIssues.length)}</span>` : esc(t('detail.' + k)));
  box.innerHTML = `<div class="resizer" title="${esc(t('detail.resize'))}"></div><div class="detail-head">
      <span class="url" title="${esc(url)}">${esc(url)}</span>
      <div class="detail-tabs">${tabs.map((k) => `<button data-dt="${k}" class="${state.detailTab === k ? 'active' : ''}">${label(k)}</button>`).join('')}</div>
      <a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')}</a>
      <button class="btn small" id="closeDetail" aria-label="${esc(t('ui.close'))}">${icon('x')}</button>
    </div><div class="detail-body">${body}</div>`;
  box.querySelectorAll('[data-dt]').forEach((b) => b.addEventListener('click', () => { state.detailTab = b.dataset.dt; renderDetail(); }));
  $('#closeDetail').addEventListener('click', () => { state.selected = null; renderDetail(); });
  box.querySelectorAll('tr[data-url]').forEach((tr) => tr.addEventListener('click', () => selectUrl(tr.dataset.url)));
  box.querySelectorAll('tr[data-issue]').forEach((tr) => tr.addEventListener('click', () => openIssue(tr.dataset.issue)));
  initResizer(box);
}

// Problèmes d'une page : gravité, libellé, détail et correction, avec un lien vers la liste complète.
function pageIssuesTable(url, issues) {
  if (!issues.length) return `<p class="muted">${esc(t('detail.noIssues'))}</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>${esc(t('col.severity'))}</th><th>${esc(t('col.issue'))}</th><th>${esc(t('col.detail'))}</th><th>${esc(t('col.fix'))}</th></tr></thead><tbody>${issues.map((i) => {
    const it = i.items.find((x) => x.url === url);
    return `<tr data-issue="${esc(i.id)}"><td>${sevChip(i.severity)}</td><td><b>${esc(t('issue.' + i.id + '.label', i.params))}</b></td><td class="wrap">${esc(detailText(it?.detail, t))}</td><td class="wrap muted">${esc(t('issue.' + i.id + '.fix', i.params))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function initResizer(box) {
  const h = store.get('detailHeight');
  if (h) box.style.height = h + 'px';
  $('.resizer', box).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = box.offsetHeight;
    const move = (ev) => { box.style.height = Math.min(window.innerHeight * 0.85, Math.max(140, startH + startY - ev.clientY)) + 'px'; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); store.set('detailHeight', box.offsetHeight); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function detailKv(p) {
  const rows = [
    ['col.status', `${p.status || '—'} ${p.statusText || ''}`],
    ['col.indexability', idxLabel(p)],
    ['col.type', p.contentType],
    ['col.redirectsTo', p.redirectUrl],
    ['col.title', p.title], ['detail.titleLength', p.title ? `${p.titleLength} · ${p.titlePx} px` : ''],
    ['col.metaDescription', p.metaDescription], ['detail.descLength', p.metaDescription ? `${p.metaDescriptionLength} · ${p.metaDescriptionPx} px` : ''],
    ['col.h1', (p.h1 || []).join(' | ')], ['col.h2', (p.h2 || []).slice(0, 15).join(' | ')],
    ['col.focusKeyword', p.focusKeyword], ['col.keywords', (p.keywords || []).join(', ')],
    ['col.canonical', p.canonical], ['col.metaRobots', p.metaRobots], ['col.xRobotsTag', p.xRobotsTag],
    ['col.lang', p.lang], ['detail.viewport', p.viewport],
    ['col.words', p.wordCount], ['col.textRatio', p.textRatio != null ? p.textRatio + ' %' : ''],
    ['col.similarity', p.closestMatch ? `≈${p.closestSimilarity} % · ${p.closestMatch}` : ''],
    ['col.depth', p.depth], ['col.linkScore', p.linkScore], ['col.inlinks', p.uniqueInlinks], ['col.contentInlinks', p.contentInlinks], ['col.outlinks', p.internalOutlinks], ['col.extOutlinks', p.externalOutlinks],
    ['detail.images', p.imagesCount != null ? `${p.imagesCount} · ${t('col.altMissing')}: ${p.imagesMissingAlt}${p.imagesResponsive != null ? ` · ${t('f.responsive')}: ${p.imagesResponsive}` : ''}` : ''],
    ['col.alternates', (p.hreflang || []).map((h) => `${h.lang}: ${h.href}`).join(' | ')],
    ['col.schemaTypes', (p.schemaTypes || []).join(', ')],
    ['detail.og', p.og ? [p.og.title && 'og:title', p.og.description && 'og:description', p.og.image && 'og:image', p.og.twitterCard && 'twitter:card'].filter(Boolean).join(', ') : ''],
    ['col.inSitemap', p.inSitemap ? t('ui.yes') : t('ui.no')],
    ['col.responseTime', p.responseTime != null ? p.responseTime + ' ms' : ''], ['col.size', kb(p.size)],
    ['col.compression', p.headers?.encoding], ['detail.lastModified', p.lastModified], ['detail.via', p.via ? t('via.' + p.via) : ''], ['detail.error', p.error],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return `<div class="kv">${rows.map(([k, v]) => `<div>${esc(t(k))}</div><div>${esc(v)}</div>`).join('')}</div>`;
}

function serpPreview(p) {
  const T = TH();
  const title = p.title || t('serp.noTitle');
  const desc = p.metaDescription || t('serp.noDesc');
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const u = new URL(p.url);
  const crumbs = u.pathname.split('/').filter(Boolean);
  const meter = (px, max, lbl) => `<div class="pxm"><span>${esc(lbl)}</span><div class="track"><div class="fill ${px > max ? 'over' : ''}" style="width:${Math.min(100, (px / max) * 100)}%"></div></div><b>${num(px)} / ${num(max)} px</b></div>`;
  return `<div class="serp-wrap"><div class="serp">
    <div class="s-site"><span class="fav">${esc(u.hostname[0]?.toUpperCase() || '')}</span><div><b>${esc(u.hostname.replace(/^www\./, ''))}</b><small>${esc(u.origin)}${crumbs.length ? ' › ' + esc(crumbs.join(' › ')) : ''}</small></div></div>
    <div class="s-title">${esc(cut(title, 70))}</div>
    <div class="s-desc">${esc(cut(desc, 160))}</div></div>
    <div class="pxms">${meter(p.titlePx || 0, T.titleMaxPx, t('col.title'))}${meter(p.metaDescriptionPx || 0, T.descMaxPx, t('col.metaDescription'))}</div>
    <p class="muted small">${esc(t('serp.note'))}</p></div>`;
}

function jsCompare(p) {
  const j = p.js;
  if (!j.rendered) return `<p class="muted">${esc(t('detail.renderFailed'))}: ${esc(j.error)}</p>`;
  const row = (k, raw, ren) => `<tr><td>${esc(t(k))}</td><td>${esc(raw)}</td><td class="${String(raw) !== String(ren) ? 'changed' : ''}">${esc(ren)}</td></tr>`;
  return `<table class="mini cmp"><thead><tr><th></th><th>${esc(t('js.raw'))}</th><th>${esc(t('js.rendered'))}</th></tr></thead><tbody>
    ${row('col.title', j.rawTitle, p.title)}${row('col.h1', j.rawH1, p.h1?.[0] || '')}${row('col.canonical', j.rawCanonical, p.canonical)}${row('col.metaRobots', j.rawMetaRobots, p.metaRobots)}
    ${row('col.words', j.rawWordCount, p.wordCount)}${row('col.links', j.rawLinkCount, p.internalOutlinks + p.externalOutlinks)}
  </tbody></table>
  <div class="kv mt"><div>LCP</div><div>${j.lcp ? (j.lcp / 1000).toFixed(2) + ' s' : '—'}</div><div>CLS</div><div>${j.cls ?? '—'}</div><div>${esc(t('js.loadTime'))}</div><div>${num(j.loadTime)} ms</div><div>${esc(t('js.requests'))}</div><div>${num(j.requests)}</div>
  ${j.consoleErrors?.length ? `<div>${esc(t('col.jsErrors'))}</div><div><pre class="errs">${esc(j.consoleErrors.join('\n'))}</pre></div>` : ''}</div>`;
}

/* ---------- Exports ---------- */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const hostOf = () => (state.R ? new URL(state.R.meta.startUrl).hostname : 'crawl');

function exportCsv(tab, rows, fname, title) {
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [tab.cols.map((c) => cell(c.raw ? c.l : t(c.l))).join(';'), ...rows.map((r) => tab.cols.map((c) => cell(cellValue(c, r))).join(';'))].join('\r\n');
  download(`${hostOf()}_${slug(title)}${fname ? '_' + slug(t('f.' + fname)) : ''}.csv`, csv, 'text/csv;charset=utf-8');
}

$('#exportJsonBtn').addEventListener('click', () => {
  if (!state.R) return;
  download(`${hostOf()}_${state.R.meta.finishedAt.slice(0, 10)}.json`, JSON.stringify(state.R), 'application/json');
});
$('#exportIssuesBtn')?.addEventListener('click', () => exportAllIssues());
function exportAllIssues() {
  if (!state.R) return;
  const tab = { cols: [{ k: 'sev', l: 'col.severity' }, { k: 'cat', l: 'col.category' }, { k: 'issue', l: 'col.issue' }, { k: 'url', l: 'col.url' }, { k: 'detail', l: 'col.detail' }, { k: 'fix', l: 'col.fix' }] };
  const rows = state.R.issues.flatMap((i) => i.items.map((it) => ({ sev: t('sev.' + i.severity), cat: t('cat.' + i.category), issue: t('issue.' + i.id + '.label', i.params), url: it.url, detail: detailText(it.detail, t), fix: t('issue.' + i.id + '.fix', i.params) })));
  exportCsv(tab, rows, null, t('tab.issues'));
}

/* ---------- Rapport ---------- */
$('#reportBtn').addEventListener('click', () => openReportDialog());
async function openReportDialog() {
  if (!state.R) return;
  const dlg = $('#reportDialog');
  const saved = store.get('report', {});
  const form = $('#reportForm');
  form.lang.innerHTML = LANGS.map((l) => `<option value="${l.code}" ${l.code === (saved.lang || t.lang) ? 'selected' : ''}>${l.flag} ${l.name}</option>`).join('');
  for (const k of ['title', 'client', 'author', 'company', 'contact', 'website', 'color', 'intro']) if (saved[k] != null && form[k]) form[k].value = saved[k];
  if (!form.color.value) form.color.value = '#5b8c1e';
  form.maxUrls.value = saved.maxUrls || 10;
  $('#logoPreview').innerHTML = saved.logo ? `<img src="${saved.logo}" alt="">` : '';
  const crawls = await fetch('/api/crawls').then((r) => r.json()).catch(() => []);
  const host = hostOf();
  form.compare.innerHTML = `<option value="">${esc(t('report.noCompare'))}</option>` + crawls.filter((c) => c.host === host && c.finishedAt !== state.R.meta.finishedAt).map((c) => `<option value="${esc(c.file)}">${esc(t.date(c.finishedAt || 0))} · ${c.score ?? '?'}/100</option>`).join('');
  dlg.showModal();
}

$('#logoInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 1024 * 1024) return toast(t('toast.logoTooBig'), 'error');
  const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  const saved = store.get('report', {});
  saved.logo = data;
  store.set('report', saved);
  $('#logoPreview').innerHTML = `<img src="${data}" alt="">`;
});
$('#logoClear').addEventListener('click', () => {
  const saved = store.get('report', {});
  delete saved.logo;
  store.set('report', saved);
  $('#logoPreview').innerHTML = '';
});

$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (e.submitter?.value === 'cancel') return $('#reportDialog').close();
  const opts = {};
  for (const k of ['lang', 'title', 'client', 'author', 'company', 'contact', 'website', 'color', 'intro', 'maxUrls']) opts[k] = form[k].value;
  opts.maxUrls = Number(opts.maxUrls) || 10;
  const saved = { ...store.get('report', {}), ...opts };
  store.set('report', saved);
  let compare = null;
  if (form.compare.value) {
    const prev = await fetch('/api/crawls/' + encodeURIComponent(form.compare.value)).then((r) => r.json()).catch(() => null);
    compare = compareResults(state.R, prev);
  }
  const rt = await getT(opts.lang);
  const html = buildReport(state.R, { ...saved, compare }, rt);
  $('#reportDialog').close();
  const w = window.open('', '_blank');
  if (!w) {
    download(`audit-seo_${hostOf()}_${state.R.meta.finishedAt.slice(0, 10)}.html`, html, 'text/html');
    return toast(t('toast.popupBlocked'), 'info');
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
});

/* ---------- Chargement ---------- */
async function loadResult(R) {
  if (!R || !R.pages || !R.summary) throw new Error(t('toast.invalidFile'));
  if (!R.version || R.version < 2) toast(t('toast.oldVersion'), 'info');
  state.R = R;
  state.graph = null;
  state.selected = null;
  state.issue = null;
  state.page = 0;
  state.compare = null;
  $('#exportJsonBtn').disabled = false;
  $('#reportBtn').disabled = false;
  $('#urlInput').value = R.meta.mode === 'list' ? '' : R.meta.startUrl;
  updateTopbar();
  const saved = store.get('tab');
  state.tab = saved && TAB_BY_ID[saved] && (!TAB_BY_ID[saved].show || TAB_BY_ID[saved].show(R)) ? saved : 'dashboard';
  renderTabs();
  render();
  renderDetail();
  // Évolution par rapport au crawl précédent du même site
  fetch('/api/crawls').then((r) => r.json()).then(async (list) => {
    const host = hostOf();
    const prevMeta = list.find((c) => c.host === host && c.finishedAt && c.finishedAt < R.meta.finishedAt);
    if (!prevMeta || state.R !== R) return;
    const prev = await fetch('/api/crawls/' + encodeURIComponent(prevMeta.file)).then((r) => r.json());
    state.compare = compareResults(R, prev);
    if (state.tab === 'dashboard') render();
  }).catch(() => {});
}

async function openSaved(file) {
  try {
    const R = await fetch('/api/crawls/' + encodeURIComponent(file)).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
    await loadResult(R);
  } catch (err) {
    toast(t('toast.openFailed') + ' ' + err.message, 'error');
  }
}

$('#importInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await loadResult(JSON.parse(await f.text()));
  } catch (err) {
    toast(t('toast.openFailed') + ' ' + err.message, 'error');
  }
  e.target.value = '';
});

$('#historyBtn').addEventListener('click', async () => {
  const dlg = $('#historyDialog');
  const list = $('#historyList');
  list.innerHTML = `<p class="muted">${esc(t('ui.loading'))}</p>`;
  dlg.showModal();
  const items = await fetch('/api/crawls').then((r) => r.json()).catch(() => []);
  list.innerHTML = items.length ? items.map((i) => `<div class="hist"><span class="grade g${esc(i.grade || '')}">${esc(i.grade || '?')}</span><span class="name"><b>${esc(i.host || i.file)}</b><small>${i.finishedAt ? esc(t.date(i.finishedAt)) : esc(i.file)} · ${kb(i.size)}</small></span><button class="btn small" data-open="${esc(i.file)}">${esc(t('ui.open'))}</button><button class="btn small" data-del="${esc(i.file)}" aria-label="${esc(t('ui.delete'))}">${icon('x')}</button></div>`).join('') : `<p class="muted">${esc(t('home.noCrawls'))}</p>`;
  list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => { dlg.close(); await openSaved(b.dataset.open); }));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('ui.confirmDelete', { name: b.dataset.del }))) return;
    await fetch('/api/crawls/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
    b.closest('.hist').remove();
  }));
});

/* ---------- Crawls planifiés & alertes e-mail ---------- */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
async function openSchedules(edit) {
  const dlg = $('#scheduleDialog');
  const body = $('#scheduleBody');
  if (!dlg.open) dlg.showModal();
  body.innerHTML = `<p class="muted">${esc(t('ui.loading'))}</p>`;
  const [list, smtp] = await Promise.all([fetch('/api/schedules').then((r) => r.json()).catch(() => []), fetch('/api/smtp').then((r) => r.json()).catch(() => ({}))]);
  const s = edit === 'new' ? { url: $('#urlInput').value || state.R?.meta.startUrl || '', frequency: 'weekly', time: '06:00', weekday: 1, monthday: 1, emails: [], alerts: { scoreDrop: 5, errors: true, newIssues: false, always: false } } : list.find((x) => x.id === edit);
  const freq = (x) => (x.frequency === 'daily' ? t('sched.daily', { time: x.time }) : x.frequency === 'weekly' ? t('sched.weekly', { day: t('sched.day' + x.weekday), time: x.time }) : t('sched.monthly', { day: x.monthday, time: x.time }));
  const last = (x) => {
    const r = x.lastResult;
    if (!r) return `<span class="muted">${esc(t('sched.never'))}</span>`;
    if (r.status === 'running') return `<span class="chip">${esc(t('sched.running'))}</span>`;
    if (r.status === 'error') return `<span class="chip error" title="${esc(r.error)}">${esc(t('sched.failed'))}</span>`;
    return `<span class="grade g${esc(r.grade)}">${esc(r.grade)}</span> ${r.score}/100 · ${esc(t('alert.count', { n: r.alerts }))}${r.emailed ? ` · ✉︎` : ''}${r.mailError ? ` · <span class="chip warning" title="${esc(r.mailError)}">${esc(t('sched.mailFailed'))}</span>` : ''}`;
  };
  body.innerHTML = s
    ? `<form id="schedForm" class="sched-form">
        <div class="cfg-grid">
          <label class="span2"><span>${esc(t('sched.url'))}</span><input name="url" type="url" required value="${esc(s.url)}"></label>
          <label><span>${esc(t('sched.name'))}</span><input name="name" value="${esc(s.name || '')}" placeholder="${esc(t('sched.namePh'))}"></label>
          <label><span>${esc(t('sched.frequency'))}</span><select name="frequency">${['daily', 'weekly', 'monthly'].map((f) => `<option value="${f}" ${s.frequency === f ? 'selected' : ''}>${esc(t('sched.f.' + f))}</option>`).join('')}</select></label>
          <label data-when="weekly"><span>${esc(t('sched.weekday'))}</span><select name="weekday">${WEEKDAYS.map((d) => `<option value="${d}" ${+s.weekday === d ? 'selected' : ''}>${esc(t('sched.day' + d))}</option>`).join('')}</select></label>
          <label data-when="monthly"><span>${esc(t('sched.monthday'))}</span><input name="monthday" type="number" min="1" max="28" value="${s.monthday}"></label>
          <label><span>${esc(t('sched.time'))}</span><input name="time" type="time" value="${esc(s.time)}"></label>
          <label class="span2"><span>${esc(t('sched.emails'))}</span><input name="emails" value="${esc((s.emails || []).join(', '))}" placeholder="vous@exemple.fr, client@exemple.fr"></label>
        </div>
        <h4>${esc(t('sched.alerts'))}</h4>
        <div class="sched-alerts">
          <label>${esc(t('sched.scoreDrop'))} <input name="scoreDrop" type="number" min="0" max="100" value="${s.alerts.scoreDrop}" class="small-num"></label>
          <label class="check"><input type="checkbox" name="errors" ${s.alerts.errors ? 'checked' : ''}> ${esc(t('sched.alertErrors'))}</label>
          <label class="check"><input type="checkbox" name="newIssues" ${s.alerts.newIssues ? 'checked' : ''}> ${esc(t('sched.alertNew'))}</label>
          <label class="check"><input type="checkbox" name="always" ${s.alerts.always ? 'checked' : ''}> ${esc(t('sched.alertAlways'))}</label>
        </div>
        <p class="cfg-help">${esc(t('sched.optionsHelp'))}</p>
        <div class="sched-actions"><button type="button" class="btn" id="schedCancel">${esc(t('ui.cancel'))}</button><button class="btn primary">${esc(t('sched.save'))}</button></div>
      </form>`
    : `<p class="cfg-help">${esc(t('sched.help'))}</p>
      ${list.length ? `<div class="sched-list">${list.map((x) => `<div class="sched-item ${x.enabled ? '' : 'off'}">
          <div class="si-main"><b>${esc(x.name)}</b><small>${esc(x.url)}</small><small>${esc(freq(x))}${x.nextRun ? ` · ${esc(t('sched.next'))} ${esc(t.date(x.nextRun))}` : ''}${x.emails.length ? ` · ✉︎ ${esc(x.emails.join(', '))}` : ''}</small></div>
          <div class="si-last">${last(x)}</div>
          <div class="si-actions"><label class="switch" title="${esc(t('sched.enabled'))}"><input type="checkbox" data-toggle="${x.id}" ${x.enabled ? 'checked' : ''}><span></span></label>
            <button class="btn small" data-run="${x.id}">${icon('play')} ${esc(t('sched.runNow'))}</button><button class="btn small" data-edit="${x.id}">${icon('settings')}</button><button class="btn small" data-del="${x.id}" aria-label="${esc(t('ui.delete'))}">${icon('x')}</button></div>
        </div>`).join('')}</div>` : `<p class="muted">${esc(t('sched.none'))}</p>`}
      <button class="btn primary" id="schedNew">${icon('calendar')} ${esc(t('sched.add'))}</button>
      <details class="smtp" ${smtp.host ? '' : 'open'}><summary>${esc(t('mail.settings'))}${smtp.host ? ` · <span class="muted">${esc(smtp.host)}</span>` : ''}</summary>
        ${smtp.fromEnv ? `<p class="cfg-help">${esc(t('mail.fromEnv'))}</p>` : ''}
        <p class="cfg-help">${esc(t('mail.help'))}</p>
        <form id="smtpForm" class="cfg-grid">
          <label><span>${esc(t('mail.host'))}</span><input name="host" value="${esc(smtp.host)}" placeholder="smtp.gmail.com"></label>
          <label><span>${esc(t('mail.port'))}</span><input name="port" type="number" value="${smtp.port}"></label>
          <label><span>${esc(t('mail.user'))}</span><input name="user" value="${esc(smtp.user)}" autocomplete="off"></label>
          <label><span>${esc(t('mail.pass'))}</span><input name="pass" type="password" autocomplete="new-password" placeholder="${smtp.hasPassword ? esc(t('mail.passKept')) : ''}"></label>
          <label><span>${esc(t('mail.from'))}</span><input name="from" value="${esc(smtp.from)}" placeholder="Arachnide &lt;vous@exemple.fr&gt;"></label>
          <label class="check"><input type="checkbox" name="secure" ${smtp.secure ? 'checked' : ''}> ${esc(t('mail.secure'))}</label>
          <div class="span2 smtp-actions"><button class="btn">${esc(t('mail.save'))}</button><input id="testTo" type="email" placeholder="${esc(t('mail.testTo'))}"><button type="button" class="btn" id="smtpTest">${esc(t('mail.test'))}</button></div>
        </form></details>`;
  if (s) {
    const f = $('#schedForm');
    const showWhen = () => f.querySelectorAll('[data-when]').forEach((el) => { el.hidden = el.dataset.when !== f.frequency.value; });
    showWhen();
    f.frequency.addEventListener('change', showWhen);
    $('#schedCancel').addEventListener('click', () => openSchedules());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const o = readOptions();
      for (const k of [...SECRET, 'gscCsv']) delete o[k];
      const payload = { id: s.id, url: f.url.value, name: f.name.value, frequency: f.frequency.value, weekday: +f.weekday.value, monthday: +f.monthday.value, time: f.time.value, emails: f.emails.value, lang: t.lang, alerts: { scoreDrop: +f.scoreDrop.value, errors: f.errors.checked, newIssues: f.newIssues.checked, always: f.always.checked }, options: s.id ? s.options : o, enabled: s.enabled !== false };
      const r = await fetch('/api/schedules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) return toast(t('sched.invalid'), 'error');
      toast(t('sched.saved'), 'ok');
      openSchedules();
    });
    return;
  }
  $('#schedNew').addEventListener('click', () => openSchedules('new'));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openSchedules(b.dataset.edit)));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('sched.confirmDelete'))) return;
    await fetch('/api/schedules/' + b.dataset.del, { method: 'DELETE' });
    openSchedules();
  }));
  body.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/schedules/${b.dataset.run}/run`, { method: 'POST' });
    toast(t('sched.started'), 'ok');
    setTimeout(() => dlg.open && openSchedules(), 800);
  }));
  body.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('change', async () => {
    const x = list.find((y) => y.id === b.dataset.toggle);
    await fetch('/api/schedules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...x, enabled: b.checked }) });
    openSchedules();
  }));
  const sf = $('#smtpForm');
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { host: sf.host.value, port: +sf.port.value, user: sf.user.value, from: sf.from.value, secure: sf.secure.checked };
    if (sf.pass.value) payload.pass = sf.pass.value;
    await fetch('/api/smtp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    toast(t('mail.saved'), 'ok');
    openSchedules();
  });
  $('#smtpTest').addEventListener('click', async () => {
    const to = $('#testTo').value;
    if (!to) return $('#testTo').focus();
    const r = await fetch('/api/smtp/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to }) }).then((x) => x.json());
    toast(r.ok ? t('mail.testOk', { to }) : `${t('mail.testFailed')} ${r.error}`, r.ok ? 'ok' : 'error');
  });
}
$('#scheduleBtn').addEventListener('click', () => openSchedules());

/* ---------- Configuration & lancement ---------- */
const configForm = $('#configForm');
const configDialog = $('#configDialog');
const SECRET = new Set(['httpPass']); // jamais enregistré dans le navigateur
const DEFAULTS = {};
configForm.querySelectorAll('[name]').forEach((el) => {
  if (el.type === 'radio') { if (el.checked) DEFAULTS[el.name] = el.value; } else DEFAULTS[el.name] = el.type === 'checkbox' ? el.checked : el.value;
});

function readOptions() {
  const o = {};
  configForm.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  o.extractors = readExtractors();
  if (state.gscCsv) o.gscCsv = state.gscCsv.text;
  return o;
}
function applyOptions(saved) {
  configForm.querySelectorAll('[name]').forEach((el) => {
    if (!(el.name in saved)) return;
    if (el.type === 'checkbox') el.checked = !!saved[el.name];
    else if (el.type === 'radio') el.checked = el.value === saved[el.name];
    else el.value = saved[el.name];
  });
  renderExtractors(saved.extractors || []);
}
function restoreOptions() {
  const saved = store.get('options');
  // Compatibilité 2.0 : respectRobots (case à cocher) → robotsMode
  if (saved && saved.robotsMode === undefined && saved.respectRobots === false) saved.robotsMode = 'ignore';
  applyOptions(saved || { extractors: [] });
}
function saveOptions() {
  const o = readOptions();
  for (const k of SECRET) delete o[k];
  delete o.gscCsv; // gros fichier : gardé en mémoire pour la session seulement
  store.set('options', o);
}

// Extraction personnalisée : une ligne par extracteur.
function extractorRow(e = {}) {
  return `<div class="ex-row">
    <input class="ex-name" type="text" placeholder="${esc(t('cfg.exName'))}" value="${esc(e.name || '')}">
    <select class="ex-type"><option value="css" ${e.type !== 'regex' ? 'selected' : ''}>CSS</option><option value="regex" ${e.type === 'regex' ? 'selected' : ''}>Regex</option></select>
    <input class="ex-sel mono" type="text" placeholder="${esc(t('cfg.exSelector'))}" value="${esc(e.selector || '')}">
    <select class="ex-target">${['text', 'attr', 'html', 'count'].map((x) => `<option value="${x}" ${e.target === x ? 'selected' : ''}>${esc(t('cfg.ex.' + x))}</option>`).join('')}</select>
    <input class="ex-attr" type="text" placeholder="href" value="${esc(e.attr || '')}" ${e.target === 'attr' ? '' : 'hidden'}>
    <button type="button" class="btn small ex-del" aria-label="${esc(t('ui.delete'))}">${icon('x')}</button></div>`;
}
function renderExtractors(list) {
  $('#extractors').innerHTML = list.map(extractorRow).join('');
}
function readExtractors() {
  return $$('#extractors .ex-row').map((r) => ({
    name: $('.ex-name', r).value.trim(), type: $('.ex-type', r).value, selector: $('.ex-sel', r).value.trim(), target: $('.ex-target', r).value, attr: $('.ex-attr', r).value.trim(),
  })).filter((e) => e.name && e.selector);
}
// Import d'un export CSV de Search Console : lu dans le navigateur, envoyé avec le prochain crawl.
$('#gscCsvFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.gscCsv = { name: f.name, text: await f.text() };
  showGscCsv();
});
$('#gscCsvClear').addEventListener('click', () => { state.gscCsv = null; $('#gscCsvFile').value = ''; showGscCsv(); });
function showGscCsv() {
  $('#gscCsvName').textContent = state.gscCsv ? `${state.gscCsv.name} · ${num(Math.round(state.gscCsv.text.length / 1024))} KB` : '';
  $('#gscCsvClear').hidden = !state.gscCsv;
}

$('#addExtractor').addEventListener('click', () => {
  if ($$('#extractors .ex-row').length >= 20) return;
  $('#extractors').insertAdjacentHTML('beforeend', extractorRow({ type: 'css', target: 'text' }));
});
$('#extractors').addEventListener('click', (e) => { if (e.target.closest('.ex-del')) e.target.closest('.ex-row').remove(); });
$('#extractors').addEventListener('change', (e) => {
  if (e.target.matches('.ex-target')) $('.ex-attr', e.target.closest('.ex-row')).hidden = e.target.value !== 'attr';
  if (e.target.matches('.ex-type')) {
    const row = e.target.closest('.ex-row');
    $('.ex-target', row).disabled = e.target.value === 'regex';
  }
});

$$('#cfgNav button').forEach((b) => b.addEventListener('click', () => {
  $$('#cfgNav button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.cfg-body [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.cfg; });
}));
$('#optionsBtn').addEventListener('click', () => configDialog.showModal());
configDialog.addEventListener('close', saveOptions);
$('#cfgReset').addEventListener('click', () => { applyOptions({ ...DEFAULTS, extractors: [] }); toast(t('cfg.resetDone'), 'ok'); });

// Testeur robots.txt : robots.txt personnalisé, sinon celui du dernier crawl.
import('./shared/robots.js').then(({ testRobots }) => {
  $('#robotsTestBtn').addEventListener('click', () => {
    const out = $('#robotsTestOut');
    const url = $('#robotsTestUrl').value.trim();
    const txt = configForm.customRobots.value.trim() || state.R?.meta?.robotsTxt || '';
    if (!url) return;
    if (!txt) { out.innerHTML = `<span class="muted">${esc(t('cfg.noRobots'))}</span>`; return; }
    try {
      const ua = { googlebot: 'Googlebot', googlebotMobile: 'Googlebot', chrome: 'Chrome' }[configForm.userAgent.value] || 'ArachnideSEO';
      const r = testRobots(txt, ua, /^https?:/i.test(url) ? url : 'https://x' + (url.startsWith('/') ? '' : '/') + url);
      out.innerHTML = `${r.allowed ? `<span class="chip ok">${esc(t('robots.allowed'))}</span>` : `<span class="chip error">${esc(t('robots.blocked'))}</span>`} <code>${esc(r.rule || t('cfg.noRule'))}</code>`;
    } catch (err) { out.textContent = err.message; }
  });
});

let mode = store.get('mode', 'spider');
function setMode(m) {
  mode = m;
  store.set('mode', m);
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#urlInput').hidden = m === 'list';
  $('#listInput').hidden = m !== 'list';
  $('#urlInput').required = m !== 'list';
}
$$('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('#crawlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const options = readOptions();
  saveOptions();
  const body = { options };
  if (mode === 'list') {
    options.mode = 'list';
    options.urls = $('#listInput').value.split(/\s+/).map((x) => x.trim()).filter(Boolean);
    if (!options.urls.length) return toast(t('toast.listEmpty'), 'error');
  } else {
    body.url = $('#urlInput').value.trim();
    if (!body.url) return;
  }
  const res = await fetch('/api/crawl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return toast(data.key ? t(data.key) : data.error || t('toast.startFailed'), 'error');
});
$('#stopBtn').addEventListener('click', () => fetch('/api/stop', { method: 'POST' }));

function setRunning(running) {
  state.running = running;
  $('#startBtn').hidden = running;
  $('#stopBtn').hidden = !running;
  $('#urlInput').disabled = running;
  $('#progress').hidden = !running;
  updateTopbar();
}

// Barre supérieure : statut de l'analyse à côté du domaine, « Relancer le crawl » quand l'URL est celle du résultat.
const isPartial = (R) => !!R && (R.meta.stopped || Object.values(R.meta.skipped || {}).some((n) => n > 0));
function updateTopbar() {
  const R = state.R;
  const st = $('#crawlStatus');
  const kind = state.running ? 'running' : !R ? '' : isPartial(R) ? 'partial' : 'done';
  st.className = 'crawl-status ' + kind;
  st.innerHTML = kind === 'running' ? '<span class="spin"></span>' : kind === 'partial' ? icon('alert') : kind === 'done' ? icon('check') : '';
  st.title = kind ? t('status.' + kind) : '';
  st.setAttribute('aria-label', st.title);
  const same = R && R.meta.mode !== 'list' && $('#urlInput').value.trim().replace(/\/$/, '') === String(R.meta.startUrl).replace(/\/$/, '');
  $('#startLbl').textContent = t(same ? 'ui.recrawl' : 'ui.crawl');
}
$('#urlInput').addEventListener('input', () => updateTopbar());

// Menu latéral sur mobile et tablette.
function closeNav() {
  document.body.classList.remove('nav-open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  $('#sidebarScrim').hidden = true;
}
$('#navToggle').addEventListener('click', () => {
  const open = !document.body.classList.contains('nav-open');
  document.body.classList.toggle('nav-open', open);
  $('#navToggle').setAttribute('aria-expanded', String(open));
  $('#sidebarScrim').hidden = !open;
});
$('#sidebarScrim').addEventListener('click', closeNav);
// Menus déroulants (Exporter, Plus) : un seul ouvert, fermés au clic sur un élément, à l'extérieur ou avec Échap.
$$('details.menu').forEach((d) => d.addEventListener('toggle', () => d.open && $$('details.menu').forEach((o) => o !== d && (o.open = false))));
document.addEventListener('click', (e) => {
  $$('details.menu[open]').forEach((d) => {
    if (!d.contains(e.target) || e.target.closest('.menu-item:not(label)')) d.open = false;
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('details.menu[open]').forEach((d) => (d.open = false));
    closeNav();
  }
});

function showProgress(p) {
  if (!p) return;
  state.progress = p;
  const now = Date.now();
  state.rateSamples.push([now, p.crawled]);
  state.rateSamples = state.rateSamples.filter(([ts]) => now - ts < 10000);
  const [t0, c0] = state.rateSamples[0];
  const rate = now - t0 > 1500 ? ((p.crawled - c0) / (now - t0)) * 1000 : 0;
  const target = Math.min(p.maxPages, Math.max(p.discovered, 1));
  const left = Math.max(0, target - p.crawled);
  const eta = rate > 0 ? Math.round(left / rate) : null;
  const pct = p.phase === 'crawl' ? (p.crawled / target) * 100 : p.phase === 'done' ? 100 : (p.crawled / target) * 100;
  $('#progressBar').style.width = Math.min(100, pct) + '%';
  $('#progressText').innerHTML = [
    `<b>${esc(t('phase.' + p.phase))}</b>`,
    esc(t('progress.crawled', { n: p.crawled })),
    esc(t('progress.queued', { n: p.queued })),
    rate ? esc(t('progress.rate', { n: Math.round(rate * 10) / 10 })) : '',
    esc(t('progress.elapsed', { s: Math.round(p.elapsed / 1000) })),
    eta != null && p.phase === 'crawl' ? esc(t('progress.eta', { s: eta })) : '',
    p.rendering ? `<span class="chip notice">JS</span>` : '',
    p.stopped ? esc(t('progress.stopping')) : '',
  ].filter(Boolean).join(' <span class="dot">·</span> ');
}

/* ---------- Flux temps réel ---------- */
const throttledRender = debounce(() => {
  renderTabs();
  if (!state.R && state.tab === 'internal') render();
}, 300);

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    setRunning(d.running);
    showProgress(d.progress);
  });
  es.addEventListener('reset', () => {
    Object.assign(state, { R: null, graph: null, live: [], selected: null, tab: 'internal', rateSamples: [], compare: null });
    $('#exportJsonBtn').disabled = true;
    $('#reportBtn').disabled = true;
    setRunning(true);
    renderTabs();
    render();
    renderDetail();
  });
  es.addEventListener('status', (e) => showProgress({ ...(state.progress || { crawled: 0, queued: 0, discovered: 0, maxPages: 1, elapsed: 0 }), phase: JSON.parse(e.data).phase }));
  es.addEventListener('progress', (e) => showProgress(JSON.parse(e.data)));
  es.addEventListener('warning', (e) => { const w = JSON.parse(e.data); toast(t(w.key, w.params), 'error'); });
  es.addEventListener('pages', (e) => { state.live.push(...JSON.parse(e.data)); throttledRender(); });
  es.addEventListener('done', async () => {
    setRunning(false);
    try {
      await loadResult(await fetch('/api/result').then((r) => r.json()));
      toast(t('toast.done'), 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
  es.addEventListener('failed', (e) => { setRunning(false); toast(t('toast.failed') + ' ' + JSON.parse(e.data).message, 'error'); });
}

/* ---------- Thème & langue ---------- */
const savedTheme = store.get('theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
else document.documentElement.dataset.theme = 'dark'; // thème sombre par défaut (direction graphique du tableau de bord)
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
});

async function setLang(code) {
  t = await getT(code);
  store.set('lang', t.lang);
  document.documentElement.lang = t.lang;
  $('#langSel').value = t.lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
  document.title = t('app.title');
  updateEnvNote();
  renderTabs();
  render();
  renderDetail();
  refreshFixTexts();
  updateTopbar();
}
$('#langSel').innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.flag} ${l.code.toUpperCase()}</option>`).join('');
$('#langSel').addEventListener('change', (e) => setLang(e.target.value));

function updateEnvNote() {
  const note = $('#renderNote');
  if (!note) return;
  note.textContent = state.env.chrome ? t('opt.renderFound', { path: state.env.chrome }) : t('opt.renderMissing');
  note.className = 'opt-note ' + (state.env.chrome ? 'ok' : 'warn');
}

$$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    ($('#searchInput') || $('#urlInput')).focus();
  }
  if (e.key === 'Escape' && state.selected && !document.querySelector('dialog[open]')) { state.selected = null; renderDetail(); }
});

/* ---------- Démarrage ---------- */
(async function init() {
  restoreOptions();
  setMode(mode);
  state.env = await fetch('/api/env').then((r) => r.json()).catch(() => ({}));
  if (state.env.version) $('#version').textContent = 'v' + state.env.version;
  await setLang(detectLang(store.get('lang')));
  initFix({ t: () => t, esc, icon, toast, getResult: () => state.R, rerender: () => { renderTabs(); render(); } }).catch(() => {});
  connect();
  try {
    const s = await fetch('/api/state').then((r) => r.json());
    if (s.hasResult && !s.running) await loadResult(await fetch('/api/result').then((r) => r.json()));
  } catch { /* serveur indisponible */ }
})();
