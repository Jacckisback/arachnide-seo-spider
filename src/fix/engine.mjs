// Moteur de correction : problèmes du crawl → propositions de correction (Fix), sans jamais toucher au site.
import * as cheerio from 'cheerio';
import { FIX_CATALOG, fixMethod, fixKind, issueImpact } from './catalog.mjs';
import { deterministicFixes } from './rules.mjs';
import { makeFix } from './schema.mjs';
import { DEFAULT_UA } from '../crawler.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Problèmes du crawl groupés par type, triés par impact (pages × gravité), avec la méthode de correction.
export function fixGroups(R) {
  return R.issues
    .map((is) => ({ id: is.id, severity: is.severity, category: is.category, count: is.count, params: is.params, impact: issueImpact(is), method: fixMethod(is.id), kind: fixKind(is.id) }))
    .sort((a, b) => b.impact - a.impact);
}

// Extrait du contenu principal d'une page (~2 000 tokens ≈ 8 000 caractères), langue, title, H1.
export async function fetchPageContext(url, { fetch = globalThis.fetch, maxChars = 8000 } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': DEFAULT_UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const $ = cheerio.load(await res.text());
  const lang = ($('html').attr('lang') || '').trim();
  const title = $('head title').first().text().trim();
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  $('script, style, noscript, template, svg, nav, header, footer, aside, form').remove();
  const $main = $('main, [role="main"]').first().length ? $('main, [role="main"]').first() : $('article').length === 1 ? $('article') : $('body');
  $main.find('p, li, h1, h2, h3, h4, td, br, div').append('\n');
  const excerpt = $main.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, maxChars);
  return { lang, title, h1, excerpt };
}

const valueOf = (p, kind) => ({ seo_title: p.title || null, meta_description: p.metaDescription || null, h1: p.h1?.[0] || null, json_ld: null })[kind] ?? null;
const siblingValues = (R, p, kind, n = 30) =>
  R.pages
    .filter((x) => x.url !== p.url && x.isHtml && x.status === 200)
    .map((x) => valueOf(x, kind))
    .filter(Boolean)
    .slice(0, n);

// Travaux à faire pour un groupe : une URL (ou une image) = une demande.
function jobsFor(R, issue, urls) {
  const kind = fixKind(issue.id);
  const pages = new Map(R.pages.map((p) => [p.url, p]));
  const jobs = [];
  for (const it of issue.items) {
    if (urls && !urls.includes(it.url)) continue;
    const p = pages.get(it.url);
    if (!p || jobs.some((j) => j.url === it.url)) continue;
    if (kind === 'image_alt') for (const src of p.imagesMissingAltSrc || []) jobs.push({ url: p.url, page: p, kind, target: src, oldValue: null, detail: '' });
    else jobs.push({ url: p.url, page: p, kind, oldValue: valueOf(p, kind), detail: typeof it.detail === 'string' ? it.detail : '' });
  }
  return jobs;
}

// Estimation avant « Tout corriger » : nombre de requêtes et coût indicatif (tarifs du fichier de modèles).
export function estimateCost(R, issueIds, price = { input: 3, output: 15 }) {
  let requests = 0;
  for (const is of R.issues.filter((i) => issueIds.includes(i.id) && fixMethod(i.id) === 'ai')) requests += jobsFor(R, is).length;
  // ~2 500 tokens en entrée (contexte + extrait), ~150 en sortie par correction ; prix en $ par million de tokens.
  const usd = (requests * (2500 * price.input + 150 * price.output)) / 1e6;
  return { requests, usd: Math.round(usd * 1000) / 1000 };
}

// 429 du fournisseur : attente (Retry-After, sinon 2 s, 4 s, 8 s, 16 s) puis nouvelle tentative.
export async function withRetry(fn, { tries = 4, base = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e.status !== 429 || attempt >= tries) throw e;
      await sleep(e.retryAfter != null ? e.retryAfter * 1000 : base * 2 ** attempt);
    }
  }
}

// Exécute fn sur les éléments avec au plus n en parallèle ; 429 → attente (Retry-After ou exponentielle) puis reprise.
async function pool(items, n, fn, { onProgress, signal } = {}) {
  let i = 0;
  let done = 0;
  const out = new Array(items.length);
  const worker = async () => {
    while (i < items.length && !signal?.aborted) {
      const k = i++;
      try {
        out[k] = await withRetry(() => fn(items[k]));
      } catch (e) {
        out[k] = { error: e };
      }
      onProgress?.({ done: ++done, total: items.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// Propositions pour des types de problèmes (et éventuellement des URL précises).
export async function proposeFixes(R, { issueIds, urls, provider, fetch = globalThis.fetch, concurrency = 3, onProgress, signal, lang } = {}) {
  const fixes = [];
  const errors = [];
  const aiJobs = [];
  for (const issue of R.issues.filter((i) => issueIds.includes(i.id))) {
    const method = fixMethod(issue.id);
    if (method === 'deterministic') {
      const scoped = urls ? { ...issue, items: issue.items.filter((it) => urls.includes(it.url)) } : issue;
      fixes.push(...deterministicFixes(R, scoped));
    } else if (method === 'ai') {
      for (const j of jobsFor(R, issue, urls)) aiJobs.push({ issue, ...j });
    } else {
      fixes.push(await withRetry(() => actionPlan(R, issue, { provider, lang })).catch((e) => (errors.push({ issue: issue.id, error: e.message }), null)));
    }
  }
  if (aiJobs.length && !provider) throw Object.assign(new Error('No AI provider configured'), { code: 'no_provider' });
  const ctxCache = new Map();
  const results = await pool(
    aiJobs,
    concurrency,
    async (job) => {
      if (!ctxCache.has(job.url)) ctxCache.set(job.url, fetchPageContext(job.url, { fetch }).catch(() => ({ lang: job.page.lang || '', title: job.page.title, h1: job.page.h1?.[0] || '', excerpt: '' })));
      const pc = await ctxCache.get(job.url);
      const ctx = { ...pc, lang: pc.lang || job.page.lang || '', url: job.url, kind: job.kind, target: job.target, oldValue: job.oldValue, detail: job.detail, siblings: siblingValues(R, job.page, job.kind) };
      return provider.generateFix(job.issue, ctx);
    },
    { onProgress, signal }
  );
  results.forEach((r, k) => {
    if (r?.error) errors.push({ issue: aiJobs[k].issue.id, url: aiJobs[k].url, error: r.error.message, status: r.error.status });
    else if (r) fixes.push(r);
  });
  return { fixes: fixes.filter(Boolean), errors };
}

// Problème non automatisable : plan d'action (IA si configurée, sinon conseil standard traduit côté interface).
async function actionPlan(R, issue, { provider, lang }) {
  const url = issue.items.find((it) => /^https?:/.test(it.url))?.url || R.meta.finalStart || R.meta.startUrl;
  let text = null;
  if (provider) text = await provider.generatePlan(issue, { lang, site: R.meta.origin, examples: issue.items.slice(0, 5).map((it) => `${it.url} ${typeof it.detail === 'string' ? it.detail : ''}`) });
  return makeFix({ issueType: issue.id, url, kind: 'action_plan', oldValue: null, newValue: text, method: 'manual', provider: text ? provider.id : null, confidence: text ? 0.7 : 1, rationale: text ? '' : `issue.${issue.id}.fix` });
}

export { FIX_CATALOG };
