// Registre des outils exposés aux agents IA, défini une seule fois et servi de trois façons :
//   - MCP en stdio (src/mcp.mjs : Claude Code, Claude Desktop, tout client MCP local) ;
//   - MCP en Streamable HTTP (/mcp : connecteurs claude.ai, Claude Desktop distant, agents hébergés) ;
//   - REST JSON (/api/agent/<outil>) décrit par /openapi.json (Actions ChatGPT, n'importe quel agent HTTP).
// Chaque outil porte un schéma Zod (validation + JSON Schema), une description écrite pour un modèle, et des
// annotations (lecture seule, destructif…). Le contexte `ctx` fournit ce qui dépend de l'hôte : le crawl que
// l'utilisateur regarde dans l'interface, et la façon de lancer un crawl (visible dans l'interface quand c'est elle).
import { z } from 'zod';
import { Crawler } from '../crawler.mjs';
import { toCrawlerOptions } from '../options.mjs';
import { listCrawls, loadCrawl, saveResult, crawlId, crawlFileOf } from '../store.mjs';
import { detectSite } from '../detect.mjs';
import { fetchPageSummary } from '../live.mjs';
import { buildOpportunities } from '../fixes.mjs';
import { previewChanges, applyChanges, rollback, verifyBatch, readJournal } from '../changes.mjs';
import { describeConnectors, createConnector, CONNECTORS, FIELDS } from '../connectors/index.mjs';
import { readConfig, writeConfig, getSite, publicSite, resolveSecrets, SECRET_KEY, CONFIG_FILE } from '../sites.mjs';
import { getT, detailText } from '../../public/shared/i18n.js';
import { compareResults } from '../../public/shared/compare.js';
import { applySegments, normalizeSegments, segmentStats, sliceResult, suggestFromFolders, NONE, FIELDS as SEG_FIELDS, OPS as SEG_OPS } from '../../public/shared/segments.js';

export const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const LOCAL = { ...RO, openWorldHint: false };

const err = (message, code = 'invalid', hint) => Object.assign(new Error(message), { code, hint });
export { crawlId };

// Contexte autonome (stdio, tests) : pas d'interface, les crawls tournent dans ce processus.
// Ce qu'une tâche de crawl terminée retient de son résultat : de quoi le résumer (meta, summary, principaux
// problèmes sans leurs URL), jamais les pages ni les liens. Le crawl entier ne vit qu'une fois en mémoire.
export const digestOf = (R) => ({ meta: R.meta, summary: R.summary, issues: R.issues.slice(0, 15).map(({ items, ...i }) => i) });

export function standaloneContext() {
  const jobs = new Map();
  return {
    currentResult: () => null,
    async startCrawl(url, opts) {
      const id = 'job_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const c = new Crawler(url, opts);
      const job = { id, url: c.startUrl, state: 'running', startedAt: new Date().toISOString(), crawler: c };
      jobs.set(id, job);
      c.start()
        .then(async (R) => Object.assign(job, { state: 'done', file: await saveResult(R), result: digestOf(R), crawler: null, finishedAt: new Date().toISOString() }))
        .catch((e) => Object.assign(job, { state: 'failed', error: e.message, crawler: null, finishedAt: new Date().toISOString() }));
      return { id };
    },
    jobStatus(id) {
      const j = jobs.get(id);
      if (!j) return null;
      return { id, url: j.url, state: j.state, started_at: j.startedAt, finished_at: j.finishedAt, progress: j.crawler?.progress?.() || null, crawl_id: j.file ? crawlId(j.file) : undefined, result: j.result, error: j.error };
    },
  };
}

export async function buildTools(ctx = standaloneContext(), { lang = process.env.ARACHNIDE_LANG || 'en' } = {}) {
  const t = await getT(lang);
  const issueLabel = (i) => t('issue.' + i.id + '.label', i.params);
  const issueFix = (i) => t('issue.' + i.id + '.fix', i.params);
  const actionTitle = (i) => {
    const k = 'act.' + i.id;
    const v = t(k, i.params);
    return v !== k ? v : issueLabel(i);
  };
  const uniqueUrls = (i) => (i.scope === 'site' ? null : new Set(i.items.map((x) => x.url)).size);
  const isQuickWin = (i) => i.effort === 'low' && i.impact !== 'low' && i.severity !== 'notice';

  // « current » = le crawl affiché dans l'interface (ou en cours de consultation par l'agent) ; sinon le plus récent.
  async function loadRef(id) {
    if (id && id !== 'current' && id !== 'latest') {
      const file = await crawlFileOf(id);
      if (!file) throw err(`Unknown crawl ${id}. Call arachnide_list_crawls.`, 'not_found');
      return { id: crawlId(file), R: await loadCrawl(file), file };
    }
    if (id !== 'latest') {
      const cur = ctx.currentResult();
      if (cur) return { id: 'current', R: cur, current: true };
    }
    const [latest] = await listCrawls();
    if (!latest) throw err('No crawl yet: run arachnide_crawl (or arachnide_start_crawl) first.', 'not_found');
    return { id: crawlId(latest.file), R: await loadCrawl(latest.file), file: latest.file };
  }
  // `segment` : l'id d'un segment du crawl (arachnide_segments) ; le résultat est le crawl découpé sur ce segment.
  async function resolveCrawl(id, segment) {
    const ref = await loadRef(id);
    if (!segment) return ref;
    const segs = ref.R.meta.segments || [];
    if (segment !== NONE && !segs.some((x) => x.id === segment)) throw err(`Segment "${segment}" not found in ${ref.id}.`, 'not_found', segs.length ? `Known segments: ${segs.map((x) => x.id).join(', ')}, ${NONE}.` : 'This crawl has no segments: define them with arachnide_segments (action "set" or "suggest").');
    return { ...ref, R: sliceResult(ref.R, segment) };
  }

  const summaryOf = (id, R) => ({
    crawl_id: id,
    site: R.meta.finalStart || R.meta.startUrl,
    start_url: R.meta.startUrl,
    finished_at: R.meta.finishedAt,
    partial: !!(R.meta.stopped || R.meta.skipped?.total),
    rendered: R.meta.rendered,
    score: R.summary.score,
    grade: R.summary.grade,
    urls: R.summary.totalUrls,
    html_pages: R.summary.htmlPages,
    indexable: R.summary.indexable,
    errors: R.summary.errors,
    warnings: R.summary.warnings,
    notices: R.summary.notices,
    category_scores: R.summary.categoryScores,
    pillars: R.summary.pillars,
    top_issues: R.issues.slice(0, 15).map((i) => ({ id: i.id, severity: i.severity, category: i.category, urls: i.count, label: issueLabel(i) })),
    skipped: R.meta.skipped,
    search_console: R.meta.gsc || undefined,
    google_analytics: R.meta.ga4 || undefined,
    pagespeed: R.meta.psi ? { tested: R.meta.psi.tested, strategy: R.meta.psi.strategy, origin_core_web_vitals: R.meta.psi.origin } : undefined,
    crawl_warnings: R.meta.warnings?.length ? R.meta.warnings : undefined,
    segment: R.meta.segment || undefined,
    segments: !R.meta.segment && R.summary.segments?.length ? R.summary.segments.map((g) => ({ id: g.id, name: g.id === NONE ? '(no segment)' : g.name, pages: g.pages, score: g.score, errors: g.errors, warnings: g.warnings })) : undefined,
  });

  const ruleSchema = z.object({
    field: z.string().describe(`One of: ${Object.keys(SEG_FIELDS).join(', ')}, or "extract:<extractor name>"`),
    op: z.string().describe(`text: ${SEG_OPS.text.join('|')}; number: ${SEG_OPS.number.join('|')}; bool: ${SEG_OPS.bool.join('|')}; enum: ${SEG_OPS.enum.join('|')}`),
    value: z.union([z.string(), z.number()]).optional(),
  });
  const segmentSchema = z.object({
    name: z.string().min(1).max(60),
    color: z.string().optional().describe('#rrggbb'),
    match: z.enum(['all', 'any']).default('all').describe('all = every rule must match (AND), any = at least one (OR)'),
    rules: z.array(ruleSchema).min(1).max(20),
  });
  const crawlOptions = (a) => toCrawlerOptions({
    maxPages: a.max_pages, maxDepth: a.max_depth, render: a.render, checkImages: a.check_images, checkExternal: a.check_external, userAgent: a.user_agent, robotsMode: a.robots,
    include: a.include || '', exclude: a.exclude || '', stayInFolder: !!a.stay_in_folder, concurrency: a.concurrency, psiMax: a.psi_pages, psiStrategy: a.psi_strategy,
    gscKeyFile: a.gsc_key_file || '', gscProperty: a.gsc_property || '', gscCsv: a.gsc_csv || '', ga4KeyFile: a.ga4_key_file || '', ga4Property: a.ga4_property || '', ga4Csv: a.ga4_csv || '', segments: a.segments,
  });
  const crawlShape = {
    url: z.string().url().describe('Start URL (usually the home page)'),
    max_pages: z.number().int().min(1).max(20000).default(500).describe('Maximum number of URLs to crawl'),
    max_depth: z.number().int().min(0).max(50).optional().describe('Maximum click depth'),
    render: z.boolean().default(false).describe('Render JavaScript with the installed Chrome/Edge (slower; for JS-built sites)'),
    check_images: z.boolean().default(true).describe('Check every image (size, status, format, srcset variants)'),
    check_external: z.boolean().default(false).describe('Check outgoing external links'),
    user_agent: z.enum(['arachnide', 'googlebot', 'googlebotMobile', 'chrome']).default('arachnide'),
    robots: z.enum(['respect', 'report', 'ignore']).default('respect').describe('robots.txt mode'),
    include: z.string().optional().describe('Only crawl URLs matching these regular expressions (one per line)'),
    exclude: z.string().optional().describe('Skip URLs matching these regular expressions (one per line), e.g. "/en/(.*)"'),
    stay_in_folder: z.boolean().default(false).describe('Do not leave the folder of the start URL (https://x.com/blog/ → only /blog/…)'),
    concurrency: z.number().int().min(1).max(20).default(5),
    psi_pages: z.number().int().min(0).max(200).default(0).describe('Run PageSpeed Insights (Lighthouse + Core Web Vitals field data) on the N most important pages. Uses env ARACHNIDE_PSI_KEY if set.'),
    psi_strategy: z.enum(['mobile', 'desktop']).default('mobile'),
    gsc_key_file: z.string().optional().describe('Path (on the Arachnide machine) of a Google service-account JSON key with access to the Search Console property'),
    gsc_property: z.string().optional().describe('Search Console property, e.g. sc-domain:example.com (auto-detected if omitted)'),
    gsc_csv: z.string().optional().describe('Content of a Search Console "Pages" CSV export, instead of the API'),
    ga4_key_file: z.string().optional().describe('Path (on the Arachnide machine) of a Google service-account JSON key with Viewer access to the Google Analytics 4 property: adds sessions per page and finds orphan pages that get traffic'),
    ga4_property: z.string().optional().describe('GA4 property ID, e.g. 123456789 (auto-detected from the domain if omitted)'),
    ga4_csv: z.string().optional().describe('Content of a GA4 "Pages and screens" or "Landing page" CSV export, instead of the API'),
    segments: z.array(segmentSchema).optional().describe('Segments to apply to the result (site sections such as product pages, categories, blog). Can also be set later with arachnide_segments.'),
  };

  const changeSchema = z.object({
    url: z.string().describe('Public URL of the page (for redirect: the old URL to redirect)'),
    field: z.enum(Object.keys(FIELDS)),
    value: z.union([z.string(), z.boolean(), z.null()]).describe('New value; true/false for noindex; destination URL for redirect; null to remove the custom value'),
    target: z.string().optional().describe('image_alt only: src of the image'),
    reason: z.string().optional().describe('Why (shown in the journal)'),
  });
  const segRef = z.string().optional().describe('Only this segment (id from arachnide_segments, "__none" = pages without a segment): scores, issues and pages are recomputed for that site section');
  const crawlRef = z.string().optional().describe('Crawl id from arachnide_list_crawls; "current" (default) = the crawl open in the Arachnide app, else the latest saved one');

  const tools = [];
  const def = (name, { title, description, shape = {}, annotations = RO, handler }) => tools.push({ name, title, description, shape, schema: z.object(shape), annotations, handler });

  // ——— Découverte et crawl ———
  def('arachnide_detect_site', {
    title: 'Detect CMS and technology',
    description: 'Fetch the home page of a website and detect its CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop…), framework and hosting/CDN, and recommend the connector that can apply SEO fixes (api, plugin, files, edge = Cloudflare Worker, or manual instructions).',
    shape: { url: z.string().url().describe('Any URL of the site, e.g. https://example.com') },
    handler: ({ url }) => detectSite(url),
  });

  def('arachnide_crawl', {
    title: 'Crawl and audit a website (waits for the result)',
    description: 'Crawl a website like Googlebot (robots.txt, sitemaps, redirects), run ~95 SEO + GEO checks and save the crawl. Returns the crawl_id, health score and top issues. Blocks until the crawl ends (minutes for large sites): start with max_pages 300-500, or use arachnide_start_crawl + arachnide_crawl_status for a long crawl.',
    shape: crawlShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (a, extra) => {
      const c = new Crawler(a.url, crawlOptions(a));
      const token = extra?._meta?.progressToken;
      let last = 0;
      if (token !== undefined && extra?.sendNotification) {
        c.on('progress', (p) => {
          if (Date.now() - last < 2000) return;
          last = Date.now();
          extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: p.crawled, total: Math.max(p.crawled + p.queued, 1), message: `${p.crawled} URLs crawled, ${p.queued} queued` } }).catch(() => {});
        });
      }
      const R = await c.start();
      const file = await saveResult(R);
      ctx.adopt?.(R, file);
      return summaryOf(crawlId(file), R);
    },
  });

  def('arachnide_start_crawl', {
    title: 'Start a crawl in the background',
    description: 'Start a crawl and return immediately with a job id. When Arachnide\'s app is running, the crawl shows live in its interface. Poll arachnide_crawl_status every 10-30 s until state is "done", then use the crawl_id it returns.',
    shape: crawlShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (a) => {
      const job = await ctx.startCrawl(a.url, crawlOptions(a));
      return { job_id: job.id, state: 'running', next: 'Call arachnide_crawl_status with this job_id.' };
    },
  });

  def('arachnide_crawl_status', {
    title: 'Status of a background crawl',
    description: 'Progress of a crawl started with arachnide_start_crawl: state (running / done / failed), URLs crawled and queued, and the crawl summary once done.',
    shape: { job_id: z.string() },
    annotations: LOCAL,
    handler: async ({ job_id }) => {
      const j = ctx.jobStatus(job_id);
      if (!j) throw err(`Unknown job ${job_id}.`, 'not_found');
      const { result, ...rest } = j;
      return rest.state === 'done' && result ? { ...rest, summary: summaryOf(rest.crawl_id || 'current', result) } : rest;
    },
  });

  def('arachnide_list_crawls', {
    title: 'List saved crawls',
    description: 'Saved crawls (most recent first) with host, date, score and grade. Use the crawl_id in other tools; "current" always means the crawl open in the Arachnide app.',
    shape: { host: z.string().optional().describe('Filter by host name, e.g. example.com'), limit: z.number().int().min(1).max(200).default(20) },
    annotations: LOCAL,
    handler: async ({ host, limit }) => {
      // Tableau (compatibilité 3.0) ; le crawl ouvert dans l'app, s'il y en a un, vient en tête sous l'id « current ».
      const cur = ctx.currentResult();
      const list = (await listCrawls()).filter((c) => !host || c.host?.includes(host)).slice(0, limit).map((c) => ({ crawl_id: crawlId(c.file), host: c.host, start_url: c.startUrl, finished_at: c.finishedAt, score: c.score, grade: c.grade, urls: c.totalUrls }));
      const curHost = cur ? safeHost(cur.meta.startUrl) : null;
      if (cur && (!host || curHost?.includes(host))) list.unshift({ crawl_id: 'current', host: curHost, start_url: cur.meta.startUrl, finished_at: cur.meta.finishedAt, score: cur.summary.score, grade: cur.summary.grade, urls: cur.summary.totalUrls, open_in_app: true });
      return list;
    },
  });

  // ——— Lecture d'un crawl ———
  def('arachnide_get_summary', {
    title: 'Crawl summary',
    description: 'Health score, grade, category and pillar scores, and the 15 highest-priority issues of a crawl. Start here after a crawl.',
    shape: { crawl_id: crawlRef, segment: segRef },
    annotations: LOCAL,
    handler: async ({ crawl_id, segment }) => {
      const { id, R } = await resolveCrawl(crawl_id, segment);
      return summaryOf(id, R);
    },
  });

  def('arachnide_segments', {
    title: 'Segments (site sections)',
    description: 'Split a crawl into named site sections (product pages, categories, blog…), like Screaming Frog segments, without recrawling. A page belongs to the FIRST segment whose rules it matches (order matters). action "get" returns the segments with health score, errors, warnings, indexability and averages per segment; "suggest" proposes one segment per top-level directory (not saved); "set" saves segments on the crawl (replaces them; [] removes them) and returns the new stats. Then pass `segment` to arachnide_get_summary, arachnide_list_issues, arachnide_get_issue, arachnide_action_plan, arachnide_search_pages or arachnide_geo_readiness to work on one section.',
    shape: { crawl_id: crawlRef, action: z.enum(['get', 'suggest', 'set']).default('get'), segments: z.array(segmentSchema).optional().describe('For action "set": the full ordered list') },
    annotations: { ...LOCAL, readOnlyHint: false, idempotentHint: true, destructiveHint: false },
    handler: async ({ crawl_id, action, segments }) => {
      const ref = await loadRef(crawl_id);
      const { R } = ref;
      const out = (list) => ({ crawl_id: ref.id, segments: list, stats: list.length ? segmentStats(R, list).map(({ pillars, ...g }) => ({ ...g, name: g.id === NONE ? '(no segment)' : g.name, top_issues: g.topIssues.map((i) => ({ id: i.id, severity: i.severity, urls: i.count, label: issueLabel(i) })), topIssues: undefined })) : [] });
      if (action === 'suggest') {
        const sug = suggestFromFolders(R);
        const copy = { ...R, pages: R.pages.map((p) => ({ ...p })), meta: { ...R.meta } };
        applySegments(copy, sug);
        return { crawl_id: ref.id, segments: sug, stats: segmentStats(copy, sug).map(({ pillars, topIssues, ...g }) => ({ ...g, name: g.id === NONE ? '(no segment)' : g.name })), saved: false, hint: 'Call arachnide_segments with action "set" and these segments (edit names or rules first if needed) to save them.' };
      }
      if (action === 'set') {
        if (!segments) throw err('action "set" needs `segments` (an empty array removes them).', 'invalid');
        const { segments: clean, problems } = applySegments(R, segments);
        if (ref.file) await saveResult(R);
        if (ref.current) await ctx.segmentsChanged?.(R);
        return { ...out(clean), saved: true, problems: problems.length ? problems : undefined };
      }
      return out(R.meta.segments || []);
    },
  });

  def('arachnide_list_issues', {
    title: 'List SEO issues',
    description: 'All issues of a crawl sorted by recommended priority (severity first, then impact × URLs ÷ effort), each with how to fix it.',
    shape: { crawl_id: crawlRef, segment: segRef, severity: z.enum(['error', 'warning', 'notice']).optional(), category: z.string().optional().describe('e.g. titles, meta, images, links, redirects, canonicals, content, schema, ai, performance, security') },
    annotations: LOCAL,
    handler: async ({ crawl_id, segment, severity, category }) => {
      const { id, R } = await resolveCrawl(crawl_id, segment);
      return { crawl_id: id, issues: R.issues.filter((i) => (!severity || i.severity === severity) && (!category || i.category === category)).map((i) => ({ id: i.id, severity: i.severity, category: i.category, impact: i.impact, effort: i.effort, urls: i.count, scope: i.scope, label: issueLabel(i), fix: issueFix(i) })) };
    },
  });

  def('arachnide_get_issue', {
    title: 'URLs affected by an issue',
    description: 'Explanation, fix and affected URLs (paginated) for one issue id from arachnide_list_issues.',
    shape: { crawl_id: crawlRef, segment: segRef, issue_id: z.string(), limit: z.number().int().min(1).max(500).default(50), offset: z.number().int().min(0).default(0) },
    annotations: LOCAL,
    handler: async ({ crawl_id, segment, issue_id, limit, offset }) => {
      const { id, R } = await resolveCrawl(crawl_id, segment);
      const i = R.issues.find((x) => x.id === issue_id);
      if (!i) throw err(`Issue "${issue_id}" not found in ${id}. Use arachnide_list_issues.`, 'not_found');
      return { crawl_id: id, id: i.id, severity: i.severity, category: i.category, label: issueLabel(i), why: t('issue.' + i.id + '.desc', i.params), fix: issueFix(i), total: i.count, offset, has_more: offset + limit < i.count, items: i.items.slice(offset, offset + limit).map((it) => ({ url: it.url, detail: detailText(it.detail, t) })) };
    },
  });

  def('arachnide_action_plan', {
    title: 'Prioritised action plan',
    description: 'The crawl\'s issues turned into an ordered action plan (same ranking as the Arachnide "Action plan" page): rank, action title, severity, impact, effort, URLs, quick-win flag and how to fix. Use it to tell the user what to do first.',
    shape: { crawl_id: crawlRef, segment: segRef, limit: z.number().int().min(1).max(200).default(25), quick_wins_only: z.boolean().default(false) },
    annotations: LOCAL,
    handler: async ({ crawl_id, segment, limit, quick_wins_only }) => {
      const { id, R } = await resolveCrawl(crawl_id, segment);
      const all = R.issues.map((i, k) => ({ rank: k + 1, id: i.id, action: actionTitle(i), issue: issueLabel(i), severity: i.severity, category: i.category, impact: i.impact, effort: i.effort, urls: uniqueUrls(i) ?? 'site', quick_win: isQuickWin(i), fix: issueFix(i) }));
      const rows = quick_wins_only ? all.filter((a) => a.quick_win) : all;
      return { crawl_id: id, total_actions: all.length, quick_wins: all.filter((a) => a.quick_win).length, start_here: all[0] || null, actions: rows.slice(0, limit) };
    },
  });

  def('arachnide_search_pages', {
    title: 'Search and filter crawled pages',
    description: 'Find pages in a crawl by text (URL or title), segment, HTTP status, indexability, click depth, folder, or issue, sorted by Link Score (internal PageRank), depth, inlinks or words. Returns compact rows; use arachnide_get_page for everything about one URL.',
    shape: {
      crawl_id: crawlRef,
      segment: segRef,
      query: z.string().optional().describe('Text contained in the URL or title'),
      folder: z.string().optional().describe('Path prefix, e.g. /blog/'),
      status: z.enum(['ok', 'redirect', 'client_error', 'server_error', 'no_response']).optional(),
      indexable: z.boolean().optional(),
      depth_min: z.number().int().min(0).optional(),
      depth_max: z.number().int().min(0).optional(),
      issue_id: z.string().optional().describe('Only pages affected by this issue'),
      sort: z.enum(['link_score', 'depth', 'inlinks', 'words', 'url', 'sessions']).default('link_score').describe('"sessions" needs Google Analytics 4 data in the crawl'),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: LOCAL,
    handler: async (a) => {
      const { id, R } = await resolveCrawl(a.crawl_id, a.segment);
      const affected = a.issue_id ? new Set((R.issues.find((i) => i.id === a.issue_id)?.items || []).map((x) => x.url)) : null;
      const bucket = (p) => (!p.status ? 'no_response' : p.status >= 500 ? 'server_error' : p.status >= 400 ? 'client_error' : p.status >= 300 ? 'redirect' : 'ok');
      const q = a.query?.toLowerCase();
      let rows = R.pages.filter((p) => p.isHtml || (p.status >= 300 && p.status < 400) || !p.status);
      rows = rows.filter((p) => {
        if (q && !(p.url.toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q))) return false;
        if (a.folder && !safePath(p.url).startsWith(a.folder)) return false;
        if (a.status && bucket(p) !== a.status) return false;
        if (a.indexable != null && !!p.indexable !== a.indexable) return false;
        if (a.depth_min != null && !(p.depth != null && p.depth >= a.depth_min)) return false;
        if (a.depth_max != null && !(p.depth != null && p.depth <= a.depth_max)) return false;
        if (affected && !affected.has(p.url)) return false;
        return true;
      });
      const by = { link_score: (x, y) => (y.linkScore || 0) - (x.linkScore || 0), depth: (x, y) => (x.depth ?? 99) - (y.depth ?? 99), inlinks: (x, y) => (y.uniqueInlinks || 0) - (x.uniqueInlinks || 0), words: (x, y) => (y.wordCount || 0) - (x.wordCount || 0), sessions: (x, y) => (y.ga4?.sessions || 0) - (x.ga4?.sessions || 0), url: (x, y) => x.url.localeCompare(y.url) };
      rows.sort(by[a.sort]);
      const issuesOf = new Map();
      for (const i of R.issues) for (const it of i.items) issuesOf.set(it.url, (issuesOf.get(it.url) || 0) + 1);
      return { crawl_id: id, total: rows.length, offset: a.offset, has_more: a.offset + a.limit < rows.length, pages: rows.slice(a.offset, a.offset + a.limit).map((p) => ({ url: p.url, status: p.status, indexable: p.indexable, depth: p.depth, title: p.title, link_score: p.linkScore, inlinks: p.uniqueInlinks, words: p.wordCount, sessions: p.ga4?.sessions, segment: p.segment, issues: issuesOf.get(p.url) || 0 })) };
    },
  });

  def('arachnide_get_page', {
    title: 'Page details from a crawl',
    description: 'Everything Arachnide knows about one URL in a crawl: status, indexability, title, description, headings, canonical, robots, structured data, links, Link Score, keywords, images without alt and the issues affecting it.',
    shape: { crawl_id: crawlRef, url: z.string().url() },
    annotations: LOCAL,
    handler: async ({ crawl_id, url }) => {
      const { id, R } = await resolveCrawl(crawl_id);
      const p = R.pages.find((x) => x.url === url) || R.pages.find((x) => x.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
      if (!p) throw err(`${url} is not in crawl ${id}.`, 'not_found', 'Use arachnide_search_pages to find the exact URL.');
      const { headers, contentHash, ...page } = p;
      return { crawl_id: id, ...page, issues: R.issues.filter((i) => i.items.some((it) => it.url === p.url)).map((i) => ({ id: i.id, severity: i.severity, label: issueLabel(i), fix: issueFix(i) })) };
    },
  });

  def('arachnide_geo_readiness', {
    title: 'GEO readiness (visibility in AI answers)',
    description: 'Generative Engine Optimisation report from a crawl: can AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) read the site, is there an llms.txt, how much of the site carries structured data (and which types), content depth, duplicates, headings and metadata hygiene — with a 0-100 readiness score and ordered recommendations.',
    shape: { crawl_id: crawlRef, segment: segRef },
    annotations: LOCAL,
    handler: async ({ crawl_id, segment }) => {
      const { id, R } = await resolveCrawl(crawl_id, segment);
      return { crawl_id: id, ...geoReadiness(R, { issueLabel }) };
    },
  });

  def('arachnide_fetch_page', {
    title: 'Read a live page',
    description: 'Fetch a page as published now and return its SEO tags, headings, images (src + alt) and an excerpt of the main text — to write accurate titles, descriptions, alt texts or FAQ answers.',
    shape: { url: z.string().url(), max_chars: z.number().int().min(200).max(20000).default(3000) },
    handler: ({ url, max_chars }) => fetchPageSummary(url, { maxChars: max_chars }),
  });

  def('arachnide_suggest_fixes', {
    title: 'Fix opportunities',
    description: 'Turn a crawl into concrete, fixable items per page: which field to change (seo_title, meta_description, h1, canonical, noindex, image_alt, redirect), the current value, why, the SEO constraints and page context. Write the new values yourself, then call arachnide_preview_changes.',
    shape: { crawl_id: crawlRef, url: z.string().url().optional().describe('Only this page'), fields: z.array(z.enum(Object.keys(FIELDS))).optional(), limit: z.number().int().min(1).max(200).default(25), offset: z.number().int().min(0).default(0) },
    annotations: LOCAL,
    handler: async ({ crawl_id, url, fields, limit, offset }) => {
      const { id, R } = await resolveCrawl(crawl_id);
      return { crawl_id: id, ...buildOpportunities(R, { url, fields, limit, offset }) };
    },
  });

  def('arachnide_compare_crawls', {
    title: 'Compare two crawls',
    description: 'Score change, fixed / new / improved / worse issues between a crawl and a previous one of the same site (the previous saved crawl of the same host by default). Use after applying fixes and re-crawling.',
    shape: { crawl_id: crawlRef, previous_crawl_id: z.string().optional() },
    annotations: LOCAL,
    handler: async ({ crawl_id, previous_crawl_id }) => {
      const { id, R } = await resolveCrawl(crawl_id);
      let prevId = previous_crawl_id;
      if (!prevId) {
        const host = new URL(R.meta.startUrl).hostname;
        const older = (await listCrawls()).filter((c) => c.host === host && crawlId(c.file) !== id && String(c.finishedAt) < String(R.meta.finishedAt));
        if (!older.length) throw err(`No previous crawl of ${host} to compare with.`, 'not_found');
        prevId = crawlId(older[0].file);
      }
      const prev = (await resolveCrawl(prevId)).R;
      const c = compareResults(R, prev);
      const lab = (x) => ({ id: x.id, severity: x.severity, before: x.prev, after: x.cur, label: t('issue.' + x.id + '.label', R.issues.find((i) => i.id === x.id)?.params || prev.issues.find((i) => i.id === x.id)?.params || {}) });
      return { crawl_id: id, previous_crawl_id: prevId, score_before: c.prevScore, score_after: R.summary.score, score_delta: c.scoreDelta, fixed: c.fixed.map(lab), appeared: c.appeared.map(lab), improved: c.improved.map(lab), worsened: c.worsened.map(lab), urls_added: c.urlsAdded, urls_removed: c.urlsRemoved };
    },
  });

  // ——— Sites et connecteurs ———
  def('arachnide_list_connectors', {
    title: 'Available CMS connectors',
    description: 'Connectors that can apply fixes, the fields each one can write automatically and the settings it needs. Fields a connector cannot write are returned as manual instructions.',
    annotations: LOCAL,
    handler: async () => ({ fields: FIELDS, connectors: await describeConnectors() }),
  });

  def('arachnide_list_sites', {
    title: 'Configured sites',
    description: `Sites Arachnide can modify (config file ${CONFIG_FILE}), with their connector and policy. Secrets are never shown.`,
    annotations: LOCAL,
    handler: async () => {
      const cfg = await readConfig();
      return { config_file: CONFIG_FILE, sites: Object.entries(cfg.sites).map(([n, s]) => publicSite(n, s)) };
    },
  });

  def('arachnide_configure_site', {
    title: 'Add or update a site',
    description: 'Register a site and its connector (see arachnide_list_connectors for settings). Secrets (passwords, tokens, API keys) must NOT be sent here: pass "env:VARIABLE_NAME" and ask the user to set that environment variable where Arachnide runs, or to edit the config file themselves.',
    shape: {
      name: z.string().regex(/^[\w.-]+$/).describe('Short name, e.g. mon-blog'),
      url: z.string().url().describe('Public URL of the site'),
      connector: z.enum(Object.keys(CONNECTORS)),
      settings: z.record(z.string(), z.any()).default({}).describe('Connector settings, e.g. {"user":"admin","appPassword":"env:ARACHNIDE_WP_APP_PASSWORD"}'),
      cms: z.string().optional().describe('CMS id for manual instructions (e.g. squarespace)'),
      policy: z.object({ allowedFields: z.array(z.enum(Object.keys(FIELDS))).optional(), maxChangesPerBatch: z.number().int().min(1).max(500).optional(), readOnly: z.boolean().optional() }).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async ({ name, url, connector, settings, cms, policy }) => {
      for (const [k, v] of Object.entries(settings)) {
        if (SECRET_KEY.test(k) && typeof v === 'string' && v && !v.startsWith('env:')) throw err(`"${k}" looks like a secret: use "env:VARIABLE_NAME" instead of the value, then set that variable where Arachnide runs (or edit ${CONFIG_FILE} yourself).`, 'config');
      }
      const cfg = await readConfig();
      const prev = cfg.sites[name] || {};
      cfg.sites[name] = { ...prev, ...settings, url, connector, ...(cms ? { cms } : {}), policy: { ...prev.policy, ...policy } };
      await writeConfig(cfg);
      const missing = Object.entries(cfg.sites[name]).filter(([, v]) => typeof v === 'string' && v.startsWith('env:') && process.env[v.slice(4)] === undefined).map(([, v]) => v.slice(4));
      return { saved: publicSite(name, cfg.sites[name]), config_file: CONFIG_FILE, missing_env: missing, next: missing.length ? `Ask the user to set ${missing.join(', ')} where Arachnide runs, restart it, then call arachnide_test_site.` : 'Call arachnide_test_site.' };
    },
  });

  def('arachnide_test_site', {
    title: 'Test a site connection',
    description: 'Check that the connector can reach the site with its credentials and permissions (one cheap authenticated call).',
    shape: { site: z.string() },
    handler: async ({ site }) => {
      const s = await getSite(site);
      const c = await createConnector(resolveSecrets(s));
      return { site, connector: s.connector, writable_fields: c.constructor.fields.filter((f) => s.policy.allowedFields.includes(f)), ...(await c.test()) };
    },
  });

  // ——— Modifications ———
  def('arachnide_preview_changes', {
    title: 'Preview changes',
    description: 'Dry run: for each change, the current value in the CMS, the value published on the site, the new value, SEO warnings (pixel width…) and whether it will be applied automatically or needs manual steps. Nothing is written. Show this to the user before applying.',
    shape: { site: z.string(), changes: z.array(changeSchema).min(1).max(500) },
    handler: async ({ site, changes }) => {
      const s = await getSite(site);
      const items = await previewChanges(s, changes);
      return { site, connector: s.connector, auto: items.filter((i) => i.mode === 'auto' && !i.unchanged).length, manual: items.filter((i) => i.mode === 'manual').length, unchanged: items.filter((i) => i.unchanged).length, invalid: items.filter((i) => i.mode === 'invalid').length, items };
    },
  });

  def('arachnide_apply_changes', {
    title: 'Apply changes to the live site',
    description: 'Write the approved changes to the site through its connector, one by one, recording the previous value of each field in the journal (undo with arachnide_rollback_changes). Only call after the user approved the preview. Returns a batch id, per-change status (applied, unchanged, manual + instructions, failed) and manual steps for fields the CMS API cannot change.',
    shape: { site: z.string(), changes: z.array(changeSchema).min(1).max(500), dry_run: z.boolean().default(false) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    handler: async ({ site, changes, dry_run }) => {
      const s = await getSite(site);
      const r = await applyChanges(s, changes, { dryRun: dry_run });
      const count = (st) => r.results.filter((x) => x.status === st).length;
      return { site, batch: r.batch, dry_run, applied: count('applied'), unchanged: count('unchanged'), manual: count('manual'), failed: count('failed') + count('mismatch') + count('invalid'), results: r.results, next: 'Call arachnide_verify_changes with this batch (caches may need a few minutes), then re-crawl to measure.' };
    },
  });

  def('arachnide_verify_changes', {
    title: 'Verify changes on the live site',
    description: 'Fetch the public pages of a batch and check each applied change is visible (status live / not_yet_visible — page caches and CDNs can delay it).',
    shape: { site: z.string(), batch: z.string() },
    handler: async ({ site, batch }) => {
      const s = await getSite(site);
      const items = await verifyBatch(s, batch);
      return { site, batch, live: items.filter((i) => i.status === 'live').length, not_yet_visible: items.filter((i) => i.status === 'not_yet_visible').length, items };
    },
  });

  def('arachnide_rollback_changes', {
    title: 'Undo changes',
    description: 'Restore the previous values of a whole batch (or of specific change ids) from the journal, in reverse order.',
    shape: { site: z.string(), batch: z.string().optional(), ids: z.array(z.string()).optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: async ({ site, batch, ids }) => {
      if (!batch && !ids?.length) throw err('Give a batch id or change ids.', 'config');
      return rollback(await getSite(site), { batch, ids });
    },
  });

  def('arachnide_list_changes', {
    title: 'Change journal',
    description: 'History of changes applied (and rolled back) on a site: batch, field, before/after values, date and reason.',
    shape: { site: z.string(), batch: z.string().optional(), limit: z.number().int().min(1).max(1000).default(100) },
    annotations: LOCAL,
    handler: async ({ site, batch, limit }) => {
      await getSite(site);
      const j = (await readJournal(site)).filter((e) => !batch || e.batch === batch);
      return { site, total: j.length, entries: j.slice(-limit).reverse() };
    },
  });

  const prompts = [{
    name: 'optimize_site',
    title: 'Audit and optimise a website (SEO + GEO)',
    description: 'Guided workflow: detect the CMS, crawl, prioritise, check AI readiness, propose fixes, apply the approved ones, verify and measure.',
    argsSchema: { url: z.string().describe('Site URL'), site: z.string().optional().describe('Configured site name, if any'), focus: z.string().optional().describe('e.g. titles and descriptions, images, redirects, GEO') },
    build: ({ url, site, focus }) => `Audit and optimise the SEO and GEO (visibility in AI answers) of ${url}${focus ? ` (focus: ${focus})` : ''}.
1. arachnide_detect_site, then ${site ? `use the configured site "${site}" (arachnide_test_site)` : 'check arachnide_list_sites; if the site is not configured, explain which connector fits and what the user must set up (never ask them to paste secrets in the chat)'}.
2. arachnide_start_crawl (max_pages 500) and poll arachnide_crawl_status; then arachnide_get_summary, arachnide_action_plan and arachnide_geo_readiness, and summarise the score, the main problems and the AI-readiness in plain language.
3. arachnide_suggest_fixes; for the most important pages read the content with arachnide_fetch_page and write new values (same language as the page, natural, no keyword stuffing, unique titles within the pixel limits).
4. arachnide_preview_changes, show me a before/after table and wait for my approval. Apply only what I approve with arachnide_apply_changes, give me the manual steps for the rest.
5. arachnide_verify_changes, then re-crawl and arachnide_compare_crawls to show the gain.`,
  }];

  return { tools, prompts, t };
}

export const INSTRUCTIONS = `Arachnide SEO Spider: crawl and audit websites (SEO + GEO), then fix SEO issues on the live site through CMS connectors.
Workflow: arachnide_detect_site → arachnide_start_crawl + arachnide_crawl_status (or arachnide_crawl) → arachnide_get_summary, arachnide_action_plan, arachnide_geo_readiness → arachnide_suggest_fixes (+ arachnide_fetch_page to read the content) → write better values → arachnide_preview_changes → show the user the before/after table and get an explicit yes → arachnide_apply_changes → arachnide_verify_changes → re-crawl and arachnide_compare_crawls.
crawl_id "current" is the crawl open in the Arachnide app: prefer it when the user talks about "the audit" or "the site" they are looking at. Every applied batch can be undone with arachnide_rollback_changes.
Never apply changes the user has not approved. Prefer small batches (10-30 changes) on the most important pages first (high Link Score, errors before warnings). Keep the site's language and brand voice.`;

// Enregistre le registre sur un McpServer (SDK) : même code pour stdio et HTTP.
export function registerOn(server, { tools, prompts }) {
  const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
  const fail = (e) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: e.message, code: e.code, hint: e.hint }) }] });
  for (const tool of tools) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.shape, annotations: tool.annotations }, async (args, extra) => {
      try {
        return json(await tool.handler(args, extra));
      } catch (e) {
        return fail(e);
      }
    });
  }
  for (const p of prompts) {
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: p.argsSchema }, (args) => ({ messages: [{ role: 'user', content: { type: 'text', text: p.build(args) } }] }));
  }
}

const safeHost = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
};
const safePath = (u) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

// Rapport GEO : ce que les moteurs de réponse (ChatGPT, Claude, Perplexity, AI Overviews) peuvent lire et comprendre.
export function geoReadiness(R, { issueLabel = (i) => i.id } = {}) {
  const pages = R.pages.filter((p) => p.isHtml && p.status >= 200 && p.status < 300);
  const indexable = pages.filter((p) => p.indexable);
  const n = indexable.length || 1;
  const pct = (k) => Math.round((100 * k) / n);
  const bots = R.meta.botAccess || [];
  const aiBots = bots.filter((b) => !/^(googlebot|bingbot)$/i.test(b.bot));
  const blocked = aiBots.filter((b) => b.allowed === false).map((b) => b.bot);
  const unknown = aiBots.filter((b) => b.allowed == null).map((b) => b.bot);
  const types = new Map();
  for (const p of indexable) for (const s of p.schemaTypes || []) types.set(s, (types.get(s) || 0) + 1);
  const withSchema = indexable.filter((p) => p.schemaTypes?.length).length;
  const answerTypes = ['FAQPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'Product', 'Organization', 'LocalBusiness', 'Person', 'BreadcrumbList'];
  const answerCoverage = Object.fromEntries(answerTypes.map((k) => [k, [...types.entries()].filter(([s]) => s.startsWith(k)).reduce((a, [, c]) => a + c, 0)]));
  const count = (id) => R.issues.find((i) => i.id === id)?.count || 0;
  const words = indexable.map((p) => p.mainWordCount || p.wordCount || 0);
  const avgWords = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const thin = indexable.filter((p) => (p.mainWordCount || p.wordCount || 0) < 200).length;
  const withMain = indexable.filter((p) => p.hasMain).length;
  const withLang = indexable.filter((p) => p.lang).length;
  const withOg = indexable.filter((p) => p.og && Object.keys(p.og).length).length;
  const h1Ok = indexable.filter((p) => p.h1Count === 1).length;
  const descOk = indexable.filter((p) => p.metaDescription && !p.duplicateDescription).length;
  const titleOk = indexable.filter((p) => p.title && !p.duplicateTitle).length;

  // Score : accès des robots IA (25), llms.txt (10), données structurées (20), contenu (20), hygiène (25).
  const parts = {
    ai_access: aiBots.length ? Math.round(25 * (1 - blocked.length / aiBots.length)) : 15,
    llms_txt: R.meta.llmsTxt ? 10 : 0,
    structured_data: Math.round(20 * (withSchema / n)),
    content: Math.round(20 * Math.min(1, (indexable.length - thin) / n) * (withMain ? 1 : 0.85)),
    hygiene: Math.round(25 * ((titleOk + descOk + h1Ok) / (3 * n))),
  };
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const recommendations = [];
  if (blocked.length) recommendations.push({ priority: 'high', text: `Allow the AI crawlers blocked in robots.txt if you want to appear in AI answers: ${blocked.join(', ')}.` });
  if (!R.meta.llmsTxt) recommendations.push({ priority: 'medium', text: 'Publish an /llms.txt (plain-text guide to your key pages and what you offer) for AI engines.' });
  if (withSchema / n < 0.6) recommendations.push({ priority: 'high', text: `Only ${pct(withSchema)}% of indexable pages carry structured data: add Organization/LocalBusiness on the home page, Article/BlogPosting on posts, Product on products, FAQPage where you answer questions.` });
  if (!answerCoverage.FAQPage) recommendations.push({ priority: 'medium', text: 'No FAQPage markup found: answer the real questions of your audience in short Q&A blocks with FAQPage schema — AI engines quote them readily.' });
  if (thin > 0) recommendations.push({ priority: thin / n > 0.3 ? 'high' : 'medium', text: `${thin} indexable pages have fewer than 200 words of main content: AI engines need substance to cite a page.` });
  if (count('duplicate-content') || count('near-duplicate')) recommendations.push({ priority: 'medium', text: 'Duplicate or near-duplicate pages dilute which URL an AI engine should cite: canonicalise or merge them.' });
  if (h1Ok / n < 0.9) recommendations.push({ priority: 'medium', text: `${pct(n - h1Ok)}% of pages do not have exactly one H1: a clear question-shaped or topic-shaped H1 helps answer engines.` });
  if (descOk / n < 0.8) recommendations.push({ priority: 'low', text: 'Unique meta descriptions help AI engines summarise and attribute your pages.' });
  if (withOg / n < 0.5) recommendations.push({ priority: 'low', text: 'Open Graph tags are missing on most pages: they define how your pages are previewed when cited.' });
  if (!withMain) recommendations.push({ priority: 'low', text: 'No <main> landmark detected: wrap the primary content in <main> so extractors separate it from navigation.' });
  if (unknown.length) recommendations.push({ priority: 'info', text: `robots.txt access could not be determined for: ${unknown.join(', ')}.` });

  const relatedIssues = R.issues.filter((i) => ['ai', 'schema', 'content', 'headings', 'canonicals'].includes(i.category)).slice(0, 12).map((i) => ({ id: i.id, severity: i.severity, urls: i.count, label: issueLabel(i) }));
  return {
    site: R.meta.finalStart || R.meta.startUrl,
    geo_score: score,
    score_parts: parts,
    ai_crawlers: { checked: aiBots.map((b) => b.bot), blocked, unknown, allowed: aiBots.filter((b) => b.allowed === true).map((b) => b.bot) },
    llms_txt: R.meta.llmsTxt ? { present: true, size: R.meta.llmsTxt.size } : { present: false },
    structured_data: { pages_with_schema_pct: pct(withSchema), types: [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([type, pages]) => ({ type, pages })), answer_oriented_types: answerCoverage, pages_with_schema_errors: count('schema-invalid') || count('schema-incomplete') },
    content: { indexable_pages: indexable.length, avg_main_words: avgWords, thin_pages_lt_200_words: thin, pages_with_main_landmark_pct: pct(withMain), pages_with_lang_pct: pct(withLang), duplicates: count('duplicate-content'), near_duplicates: count('near-duplicate') },
    hygiene: { unique_titles_pct: pct(titleOk), unique_descriptions_pct: pct(descOk), single_h1_pct: pct(h1Ok), open_graph_pct: pct(withOg), sitemap_urls: R.meta.sitemapUrlCount || 0 },
    related_issues: relatedIssues,
    recommendations,
  };
}
