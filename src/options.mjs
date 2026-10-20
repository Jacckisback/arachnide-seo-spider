// Conversion des options envoyées par l'interface (formulaire) en options du crawler, avec validation.
import { USER_AGENTS } from './crawler.mjs';
import { normalizeSegments } from '../public/shared/segments.js';

const NUMBERS = ['maxPages', 'maxDepth', 'concurrency', 'delayMs', 'timeoutMs', 'limitPerDepth', 'maxFolderDepth', 'maxQueryParams', 'maxRedirects', 'maxUrlLength', 'maxLinksPerPage', 'maxPageSizeKb', 'maxUrlPerSec', 'psiMax', 'gscDays', 'ga4Days'];
const BOOLS = ['crawlSubdomains', 'stayInFolder', 'ignoreQuery', 'useSitemaps', 'crawlCanonicals', 'checkExternal', 'checkImages', 'render'];
const STRINGS = ['include', 'exclude', 'search', 'acceptLanguage', 'customRobots', 'removeParams', 'httpUser', 'httpPass', 'customHeaders', 'psiKey', 'gscKeyFile', 'gscProperty', 'gscCsv', 'ga4KeyFile', 'ga4Property', 'ga4Csv'];

const bad = (key, detail) => Object.assign(new Error(`Invalid option: ${detail}`), { status: 400, key });

function checkRegex(re, label) {
  try {
    new RegExp(re);
  } catch {
    throw bad('toast.badRegex', `${label}: ${re}`);
  }
}

// « /blog/ = 200 » (une ligne par motif) → [{ pattern, max }]
export function parsePathLimits(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => /^(.+?)\s*[=:]\s*(\d+)\s*$/.exec(l.trim()))
    .filter(Boolean)
    .map(([, pattern, max]) => ({ pattern: pattern.trim(), max: Number(max) }));
}

export function toCrawlerOptions(o = {}) {
  const opts = {};
  for (const k of NUMBERS) if (o[k] !== undefined && o[k] !== '' && o[k] !== null && !Number.isNaN(Number(o[k]))) opts[k] = Number(o[k]);
  for (const k of BOOLS) if (o[k] !== undefined) opts[k] = !!o[k];
  for (const k of STRINGS) if (o[k]) opts[k] = String(o[k]);
  if (['respect', 'report', 'ignore'].includes(o.robotsMode)) opts.robotsMode = o.robotsMode;
  else if (o.respectRobots === false) opts.robotsMode = 'ignore';
  if (o.mode === 'list') {
    opts.mode = 'list';
    opts.urls = (Array.isArray(o.urls) ? o.urls : String(o.urls || '').split(/\s+/)).map(String).filter(Boolean).slice(0, 100000);
  }
  opts.pathLimits = Array.isArray(o.pathLimits) ? o.pathLimits : parsePathLimits(o.pathLimits);
  opts.extractors = (Array.isArray(o.extractors) ? o.extractors : [])
    .filter((e) => e && e.name && e.selector)
    .slice(0, 20)
    .map((e) => ({ name: String(e.name).slice(0, 40), type: e.type === 'regex' ? 'regex' : 'css', selector: String(e.selector), target: ['text', 'html', 'attr', 'count'].includes(e.target) ? e.target : 'text', attr: String(e.attr || '') }));
  // Une regex par ligne : chacune est vérifiée, l'erreur nomme la ligne fautive.
  for (const k of ['include', 'exclude']) for (const line of String(opts[k] || '').split(/\r?\n/)) if (line.trim()) checkRegex(line.trim(), k);
  for (const l of opts.pathLimits) checkRegex(l.pattern, 'pathLimits');
  for (const e of opts.extractors) if (e.type === 'regex') checkRegex(e.selector, e.name);
  // Segments (vue par section du site) : appliqués à la fin du crawl ; voir public/shared/segments.js.
  if (o.segments) opts.segments = normalizeSegments(o.segments).segments;
  opts.userAgent = USER_AGENTS[o.userAgent] || (o.customUserAgent ? String(o.customUserAgent) : USER_AGENTS.arachnide);
  opts.concurrency = Math.min(Math.max(opts.concurrency || 5, 1), 30);
  // Valeurs absurdes (négatives, infinies) ramenées à des bornes sûres plutôt que de bloquer ou de vider le crawl.
  if (opts.maxPages != null) opts.maxPages = Number.isFinite(opts.maxPages) && opts.maxPages >= 1 ? Math.min(Math.round(opts.maxPages), 10000000) : 500;
  if (opts.maxDepth != null) opts.maxDepth = Number.isFinite(opts.maxDepth) && opts.maxDepth >= 0 ? Math.min(Math.round(opts.maxDepth), 1000) : 20;
  for (const k of ['delayMs', 'timeoutMs', 'maxUrlPerSec']) if (opts[k] != null && !(opts[k] >= 0 && Number.isFinite(opts[k]))) delete opts[k];
  if (opts.psiMax != null) opts.psiMax = Math.min(Math.max(Math.round(opts.psiMax), 0), 500);
  opts.psiStrategy = o.psiStrategy === 'desktop' ? 'desktop' : 'mobile';
  if (!opts.psiKey && process.env.ARACHNIDE_PSI_KEY) opts.psiKey = process.env.ARACHNIDE_PSI_KEY;
  if (opts.gscDays != null) opts.gscDays = Math.min(Math.max(Math.round(opts.gscDays), 1), 480);
  if (opts.ga4Days != null) opts.ga4Days = Math.min(Math.max(Math.round(opts.ga4Days), 1), 730);
  return opts;
}
