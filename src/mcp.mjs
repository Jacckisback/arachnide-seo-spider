#!/usr/bin/env node
// Serveur MCP d'Arachnide : Claude (Claude Code, Claude Desktop…) peut crawler un site, analyser les problèmes,
// décider des corrections, puis les appliquer sur le site via le connecteur du CMS, les vérifier et les annuler.
// Transport stdio : rien ne doit être écrit sur la sortie standard en dehors du protocole.
console.log = console.error;

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = await import('zod');
const { Crawler, VERSION } = await import('./crawler.mjs');
const { toCrawlerOptions } = await import('./options.mjs');
const { listCrawls, loadCrawl, saveResult } = await import('./store.mjs');
const { detectSite } = await import('./detect.mjs');
const { fetchPageSummary } = await import('./live.mjs');
const { buildOpportunities } = await import('./fixes.mjs');
const { previewChanges, applyChanges, rollback, verifyBatch, readJournal } = await import('./changes.mjs');
const { describeConnectors, createConnector, CONNECTORS, FIELDS } = await import('./connectors/index.mjs');
const { readConfig, writeConfig, getSite, publicSite, resolveSecrets, SECRET_KEY, CONFIG_FILE, DEFAULT_POLICY } = await import('./sites.mjs');
const { getT, detailText } = await import('../public/shared/i18n.js');
const { compareResults } = await import('../public/shared/compare.js');

const t = await getT(process.env.ARACHNIDE_LANG || 'en');

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: e.message, code: e.code, hint: e.hint }) }] });
const tool = (fn) => async (args, extra) => {
  try {
    return json(await fn(args, extra));
  } catch (e) {
    return fail(e);
  }
};

const crawlId = (file) => file.replace(/\.json$/, '');
async function resolveCrawl(id) {
  if (id) return { id, R: await loadCrawl(id.endsWith('.json') ? id : id + '.json') };
  const [latest] = await listCrawls();
  if (!latest) throw Object.assign(new Error('No crawl yet: run arachnide_crawl first.'), { code: 'not_found' });
  return { id: crawlId(latest.file), R: await loadCrawl(latest.file) };
}

const issueLabel = (i) => t('issue.' + i.id + '.label', i.params);
const summaryOf = (id, R) => ({
  crawl_id: id,
  start_url: R.meta.startUrl,
  finished_at: R.meta.finishedAt,
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
  top_issues: R.issues.slice(0, 15).map((i) => ({ id: i.id, severity: i.severity, category: i.category, urls: i.count, label: issueLabel(i) })),
  skipped: R.meta.skipped,
  search_console: R.meta.gsc || undefined,
  pagespeed: R.meta.psi ? { tested: R.meta.psi.tested, strategy: R.meta.psi.strategy, origin_core_web_vitals: R.meta.psi.origin } : undefined,
  warnings: R.meta.warnings?.length ? R.meta.warnings : undefined,
});

const server = new McpServer({ name: 'arachnide-seo-mcp-server', version: VERSION }, {
  instructions: `Arachnide SEO Spider: crawl and audit websites, then fix SEO issues on the live site through CMS connectors.
Workflow: arachnide_detect_site → arachnide_crawl → arachnide_suggest_fixes (+ arachnide_fetch_page to read the content) → write better values → arachnide_preview_changes → show the user the before/after table and get an explicit yes → arachnide_apply_changes → arachnide_verify_changes → re-crawl to measure. Every applied batch can be undone with arachnide_rollback_changes.
Never apply changes the user has not approved. Prefer small batches (10-30 changes) on the most important pages first (high Link Score, errors before warnings). Keep the site's language and brand voice.`,
});

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// ——— Analyse ———
server.registerTool('arachnide_detect_site', {
  title: 'Detect CMS and technology',
  description: 'Fetch the home page of a website and detect its CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop…), framework and hosting/CDN, and recommend the connector that can apply SEO fixes (api, plugin, files, edge = Cloudflare Worker, or manual instructions).',
  inputSchema: { url: z.string().url().describe('Any URL of the site, e.g. https://example.com') },
  annotations: RO,
}, tool(({ url }) => detectSite(url)));

server.registerTool('arachnide_crawl', {
  title: 'Crawl and audit a website',
  description: 'Crawl a website like Googlebot (robots.txt, sitemaps, redirects), run ~95 SEO checks and save the crawl. Returns the crawl_id, health score and top issues. Can take a few minutes for large sites; start with max_pages 300-500.',
  inputSchema: {
    url: z.string().url().describe('Start URL (usually the home page)'),
    max_pages: z.number().int().min(1).max(20000).default(500).describe('Maximum number of URLs to crawl'),
    max_depth: z.number().int().min(0).max(50).optional().describe('Maximum click depth'),
    render: z.boolean().default(false).describe('Render JavaScript with the installed Chrome/Edge (slower; for JS-built sites)'),
    check_images: z.boolean().default(true).describe('Check every image (size, status, format, srcset variants)'),
    check_external: z.boolean().default(false).describe('Check outgoing external links'),
    user_agent: z.enum(['arachnide', 'googlebot', 'googlebotMobile', 'chrome']).default('arachnide'),
    robots: z.enum(['respect', 'report', 'ignore']).default('respect').describe('robots.txt mode'),
    include: z.string().optional().describe('Only crawl URLs matching this regex'),
    exclude: z.string().optional().describe('Skip URLs matching this regex'),
    concurrency: z.number().int().min(1).max(20).default(5),
    psi_pages: z.number().int().min(0).max(200).default(0).describe('Run PageSpeed Insights (Lighthouse score + Core Web Vitals field data from CrUX) on the N most important pages. Uses env ARACHNIDE_PSI_KEY if set.'),
    psi_strategy: z.enum(['mobile', 'desktop']).default('mobile'),
    gsc_key_file: z.string().optional().describe('Path of a Google service account JSON key with access to the Search Console property (clicks, impressions, CTR, position per URL)'),
    gsc_property: z.string().optional().describe('Search Console property, e.g. sc-domain:example.com (auto-detected if omitted)'),
    gsc_csv_path: z.string().optional().describe('Path of a Search Console "Pages" CSV export, instead of the API'),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, tool(async (a, extra) => {
  const { readFile } = await import('node:fs/promises');
  const opts = toCrawlerOptions({ maxPages: a.max_pages, maxDepth: a.max_depth, render: a.render, checkImages: a.check_images, checkExternal: a.check_external, userAgent: a.user_agent, robotsMode: a.robots, include: a.include || '', exclude: a.exclude || '', concurrency: a.concurrency, psiMax: a.psi_pages, psiStrategy: a.psi_strategy, gscKeyFile: a.gsc_key_file || '', gscProperty: a.gsc_property || '', gscCsv: a.gsc_csv_path ? await readFile(a.gsc_csv_path, 'utf8') : '' });
  const c = new Crawler(a.url, opts);
  const token = extra?._meta?.progressToken;
  let last = 0;
  if (token !== undefined) {
    c.on('progress', (p) => {
      if (Date.now() - last < 2000) return;
      last = Date.now();
      extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: p.crawled, total: Math.max(p.crawled + p.queued, 1), message: `${p.crawled} URLs crawled, ${p.queued} queued` } }).catch(() => {});
    });
  }
  const R = await c.start();
  const file = await saveResult(R);
  return summaryOf(crawlId(file), R);
}));

server.registerTool('arachnide_list_crawls', {
  title: 'List saved crawls',
  description: 'List saved crawls (most recent first) with host, date, score and grade. Use the crawl_id in other tools.',
  inputSchema: { host: z.string().optional().describe('Filter by host name, e.g. example.com'), limit: z.number().int().min(1).max(200).default(20) },
  annotations: RO,
}, tool(async ({ host, limit }) => (await listCrawls()).filter((c) => !host || c.host?.includes(host)).slice(0, limit).map((c) => ({ crawl_id: crawlId(c.file), host: c.host, start_url: c.startUrl, finished_at: c.finishedAt, score: c.score, grade: c.grade, urls: c.totalUrls }))));

server.registerTool('arachnide_get_summary', {
  title: 'Crawl summary',
  description: 'Health score, grade, category scores and the 15 highest-priority issues of a crawl (latest crawl when crawl_id is omitted).',
  inputSchema: { crawl_id: z.string().optional() },
  annotations: RO,
}, tool(async ({ crawl_id }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  return summaryOf(id, R);
}));

server.registerTool('arachnide_list_issues', {
  title: 'List SEO issues',
  description: 'All issues of a crawl sorted by priority (severity × impact × URLs ÷ effort), with how to fix each one.',
  inputSchema: { crawl_id: z.string().optional(), severity: z.enum(['error', 'warning', 'notice']).optional(), category: z.string().optional().describe('e.g. titles, meta, images, links, redirects, canonicals, performance') },
  annotations: RO,
}, tool(async ({ crawl_id, severity, category }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  return { crawl_id: id, issues: R.issues.filter((i) => (!severity || i.severity === severity) && (!category || i.category === category)).map((i) => ({ id: i.id, severity: i.severity, category: i.category, impact: i.impact, effort: i.effort, urls: i.count, label: issueLabel(i), fix: t('issue.' + i.id + '.fix', i.params) })) };
}));

server.registerTool('arachnide_get_issue', {
  title: 'URLs affected by an issue',
  description: 'Explanation, fix and affected URLs (paginated) for one issue id from arachnide_list_issues.',
  inputSchema: { crawl_id: z.string().optional(), issue_id: z.string(), limit: z.number().int().min(1).max(500).default(50), offset: z.number().int().min(0).default(0) },
  annotations: RO,
}, tool(async ({ crawl_id, issue_id, limit, offset }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  const i = R.issues.find((x) => x.id === issue_id);
  if (!i) throw Object.assign(new Error(`Issue "${issue_id}" not found in ${id}. Use arachnide_list_issues.`), { code: 'not_found' });
  return { crawl_id: id, id: i.id, severity: i.severity, label: issueLabel(i), why: t('issue.' + i.id + '.desc', i.params), fix: t('issue.' + i.id + '.fix', i.params), total: i.count, offset, has_more: offset + limit < i.count, items: i.items.slice(offset, offset + limit).map((it) => ({ url: it.url, detail: detailText(it.detail, t) })) };
}));

server.registerTool('arachnide_get_page', {
  title: 'Page details from a crawl',
  description: 'Everything Arachnide knows about one URL in a crawl: status, indexability, title, description, headings, canonical, robots, links, Link Score, keywords, images without alt and the issues affecting it.',
  inputSchema: { crawl_id: z.string().optional(), url: z.string().url() },
  annotations: RO,
}, tool(async ({ crawl_id, url }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  const p = R.pages.find((x) => x.url === url) || R.pages.find((x) => x.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
  if (!p) throw Object.assign(new Error(`${url} is not in crawl ${id}.`), { code: 'not_found' });
  const { headers, contentHash, ...page } = p;
  return { crawl_id: id, ...page, issues: R.issues.filter((i) => i.items.some((it) => it.url === p.url)).map((i) => ({ id: i.id, severity: i.severity, label: issueLabel(i) })) };
}));

server.registerTool('arachnide_fetch_page', {
  title: 'Read a live page',
  description: 'Fetch a page as published now and return its SEO tags, headings, images (src + alt) and an excerpt of the main text — to write accurate titles, descriptions and alt texts.',
  inputSchema: { url: z.string().url(), max_chars: z.number().int().min(200).max(20000).default(3000) },
  annotations: RO,
}, tool(({ url, max_chars }) => fetchPageSummary(url, { maxChars: max_chars })));

server.registerTool('arachnide_suggest_fixes', {
  title: 'Fix opportunities',
  description: 'Turn a crawl into concrete, fixable items per page: which field to change (seo_title, meta_description, h1, canonical, noindex, image_alt, redirect), the current value, why, the SEO constraints and page context. Write the new values yourself, then call arachnide_preview_changes.',
  inputSchema: { crawl_id: z.string().optional(), url: z.string().url().optional().describe('Only this page'), fields: z.array(z.enum(Object.keys(FIELDS))).optional(), limit: z.number().int().min(1).max(200).default(25), offset: z.number().int().min(0).default(0) },
  annotations: RO,
}, tool(async ({ crawl_id, url, fields, limit, offset }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  return { crawl_id: id, ...buildOpportunities(R, { url, fields, limit, offset }) };
}));

server.registerTool('arachnide_compare_crawls', {
  title: 'Compare two crawls',
  description: 'Score change, fixed / new / improved / worse issues between a crawl and a previous one of the same site (the previous crawl of the same host by default). Use after applying fixes and re-crawling.',
  inputSchema: { crawl_id: z.string().optional(), previous_crawl_id: z.string().optional() },
  annotations: RO,
}, tool(async ({ crawl_id, previous_crawl_id }) => {
  const { id, R } = await resolveCrawl(crawl_id);
  let prevId = previous_crawl_id;
  if (!prevId) {
    const host = new URL(R.meta.startUrl).hostname;
    const older = (await listCrawls()).filter((c) => c.host === host && crawlId(c.file) !== id && String(c.finishedAt) < String(R.meta.finishedAt));
    if (!older.length) throw Object.assign(new Error(`No previous crawl of ${host} to compare with.`), { code: 'not_found' });
    prevId = crawlId(older[0].file);
  }
  const prev = (await resolveCrawl(prevId)).R;
  const c = compareResults(R, prev);
  const lab = (x) => ({ id: x.id, severity: x.severity, before: x.prev, after: x.cur, label: t('issue.' + x.id + '.label', R.issues.find((i) => i.id === x.id)?.params || prev.issues.find((i) => i.id === x.id)?.params || {}) });
  return { crawl_id: id, previous_crawl_id: prevId, score_before: c.prevScore, score_after: R.summary.score, score_delta: c.scoreDelta, fixed: c.fixed.map(lab), appeared: c.appeared.map(lab), improved: c.improved.map(lab), worsened: c.worsened.map(lab), urls_added: c.urlsAdded, urls_removed: c.urlsRemoved };
}));

// ——— Sites et connecteurs ———
server.registerTool('arachnide_list_connectors', {
  title: 'Available CMS connectors',
  description: 'Connectors that can apply fixes, the fields each one can write automatically and the settings it needs. Fields a connector cannot write are returned as manual instructions.',
  inputSchema: {},
  annotations: { ...RO, openWorldHint: false },
}, tool(async () => ({ fields: FIELDS, connectors: await describeConnectors() })));

server.registerTool('arachnide_list_sites', {
  title: 'Configured sites',
  description: `Sites Arachnide can modify (config file ${CONFIG_FILE}), with their connector and policy. Secrets are never shown.`,
  inputSchema: {},
  annotations: { ...RO, openWorldHint: false },
}, tool(async () => {
  const cfg = await readConfig();
  return { config_file: CONFIG_FILE, sites: Object.entries(cfg.sites).map(([n, s]) => publicSite(n, s)) };
}));

server.registerTool('arachnide_configure_site', {
  title: 'Add or update a site',
  description: 'Register a site and its connector (see arachnide_list_connectors for settings). Secrets (passwords, tokens, API keys) must NOT be sent here: pass "env:VARIABLE_NAME" and ask the user to set that environment variable for the MCP server, or to edit the config file themselves.',
  inputSchema: {
    name: z.string().regex(/^[\w.-]+$/).describe('Short name, e.g. mon-blog'),
    url: z.string().url().describe('Public URL of the site'),
    connector: z.enum(Object.keys(CONNECTORS)),
    settings: z.record(z.string(), z.any()).default({}).describe('Connector settings, e.g. {"user":"admin","appPassword":"env:ARACHNIDE_WP_APP_PASSWORD"}'),
    cms: z.string().optional().describe('CMS id for manual instructions (e.g. squarespace)'),
    policy: z.object({ allowedFields: z.array(z.enum(Object.keys(FIELDS))).optional(), maxChangesPerBatch: z.number().int().min(1).max(500).optional(), readOnly: z.boolean().optional() }).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, tool(async ({ name, url, connector, settings, cms, policy }) => {
  for (const [k, v] of Object.entries(settings)) {
    if (SECRET_KEY.test(k) && typeof v === 'string' && v && !v.startsWith('env:')) throw Object.assign(new Error(`"${k}" looks like a secret: use "env:VARIABLE_NAME" instead of the value, then set that variable in the MCP server environment (or edit ${CONFIG_FILE} yourself).`), { code: 'config' });
  }
  const cfg = await readConfig();
  const prev = cfg.sites[name] || {};
  cfg.sites[name] = { ...prev, ...settings, url, connector, ...(cms ? { cms } : {}), policy: { ...prev.policy, ...policy } };
  await writeConfig(cfg);
  const missing = Object.entries(cfg.sites[name]).filter(([, v]) => typeof v === 'string' && v.startsWith('env:') && process.env[v.slice(4)] === undefined).map(([, v]) => v.slice(4));
  return { saved: publicSite(name, cfg.sites[name]), config_file: CONFIG_FILE, missing_env: missing, next: missing.length ? `Ask the user to set ${missing.join(', ')} in the MCP server environment, restart it, then call arachnide_test_site.` : 'Call arachnide_test_site.' };
}));

server.registerTool('arachnide_test_site', {
  title: 'Test a site connection',
  description: 'Check that the connector can reach the site with its credentials and permissions (one cheap authenticated call).',
  inputSchema: { site: z.string() },
  annotations: RO,
}, tool(async ({ site }) => {
  const s = await getSite(site);
  const c = await createConnector(resolveSecrets(s));
  return { site, connector: s.connector, writable_fields: c.constructor.fields.filter((f) => s.policy.allowedFields.includes(f)), ...(await c.test()) };
}));

// ——— Modifications ———
const changeSchema = z.object({
  url: z.string().describe('Public URL of the page (for redirect: the old URL to redirect)'),
  field: z.enum(Object.keys(FIELDS)),
  value: z.union([z.string(), z.boolean(), z.null()]).describe('New value; true/false for noindex; destination URL for redirect; null to remove the custom value'),
  target: z.string().optional().describe('image_alt only: src of the image'),
  reason: z.string().optional().describe('Why (shown in the journal)'),
});

server.registerTool('arachnide_preview_changes', {
  title: 'Preview changes',
  description: 'Dry run: for each change, the current value in the CMS, the value published on the site, the new value, SEO warnings (pixel width…) and whether it will be applied automatically or needs manual steps. Nothing is written. Show this to the user before applying.',
  inputSchema: { site: z.string(), changes: z.array(changeSchema).min(1).max(500) },
  annotations: RO,
}, tool(async ({ site, changes }) => {
  const s = await getSite(site);
  const items = await previewChanges(s, changes);
  return { site, connector: s.connector, auto: items.filter((i) => i.mode === 'auto' && !i.unchanged).length, manual: items.filter((i) => i.mode === 'manual').length, unchanged: items.filter((i) => i.unchanged).length, invalid: items.filter((i) => i.mode === 'invalid').length, items };
}));

server.registerTool('arachnide_apply_changes', {
  title: 'Apply changes to the live site',
  description: 'Write the approved changes to the site through its connector, one by one, recording the previous value of each field in the journal (undo with arachnide_rollback_changes). Only call after the user approved the preview. Returns a batch id, per-change status (applied, unchanged, manual + instructions, failed) and manual steps for fields the CMS API cannot change.',
  inputSchema: { site: z.string(), changes: z.array(changeSchema).min(1).max(500), dry_run: z.boolean().default(false) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
}, tool(async ({ site, changes, dry_run }) => {
  const s = await getSite(site);
  const r = await applyChanges(s, changes, { dryRun: dry_run });
  const count = (st) => r.results.filter((x) => x.status === st).length;
  return { site, batch: r.batch, dry_run, applied: count('applied'), unchanged: count('unchanged'), manual: count('manual'), failed: count('failed') + count('mismatch') + count('invalid'), results: r.results, next: 'Call arachnide_verify_changes with this batch (caches may need a few minutes), then re-crawl to measure.' };
}));

server.registerTool('arachnide_verify_changes', {
  title: 'Verify changes on the live site',
  description: 'Fetch the public pages of a batch and check each applied change is visible (status live / not_yet_visible — page caches and CDNs can delay it).',
  inputSchema: { site: z.string(), batch: z.string() },
  annotations: RO,
}, tool(async ({ site, batch }) => {
  const s = await getSite(site);
  const items = await verifyBatch(s, batch);
  return { site, batch, live: items.filter((i) => i.status === 'live').length, not_yet_visible: items.filter((i) => i.status === 'not_yet_visible').length, items };
}));

server.registerTool('arachnide_rollback_changes', {
  title: 'Undo changes',
  description: 'Restore the previous values of a whole batch (or of specific change ids) from the journal, in reverse order.',
  inputSchema: { site: z.string(), batch: z.string().optional(), ids: z.array(z.string()).optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
}, tool(async ({ site, batch, ids }) => {
  if (!batch && !ids?.length) throw Object.assign(new Error('Give a batch id or change ids.'), { code: 'config' });
  return rollback(await getSite(site), { batch, ids });
}));

server.registerTool('arachnide_list_changes', {
  title: 'Change journal',
  description: 'History of changes applied (and rolled back) on a site: batch, field, before/after values, date and reason.',
  inputSchema: { site: z.string(), batch: z.string().optional(), limit: z.number().int().min(1).max(1000).default(100) },
  annotations: { ...RO, openWorldHint: false },
}, tool(async ({ site, batch, limit }) => {
  await getSite(site);
  const j = (await readJournal(site)).filter((e) => !batch || e.batch === batch);
  return { site, total: j.length, entries: j.slice(-limit).reverse() };
}));

server.registerPrompt('optimize_site', {
  title: 'Audit and optimise a website',
  description: 'Guided workflow: detect the CMS, crawl, prioritise, propose fixes, apply the approved ones, verify and measure.',
  argsSchema: { url: z.string().describe('Site URL'), site: z.string().optional().describe('Configured site name, if any'), focus: z.string().optional().describe('e.g. titles and descriptions, images, redirects') },
}, ({ url, site, focus }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Audit and optimise the SEO of ${url}${focus ? ` (focus: ${focus})` : ''}.
1. arachnide_detect_site, then ${site ? `use the configured site "${site}" (arachnide_test_site)` : 'check arachnide_list_sites; if the site is not configured, explain which connector fits and what the user must set up (never ask them to paste secrets in the chat)'}.
2. arachnide_crawl (max_pages 500) and summarise the score and the main problems in plain language.
3. arachnide_suggest_fixes; for the most important pages read the content with arachnide_fetch_page and write new values (same language as the page, natural, no keyword stuffing, unique titles within the pixel limits).
4. arachnide_preview_changes, show me a before/after table and wait for my approval. Apply only what I approve with arachnide_apply_changes, give me the manual steps for the rest.
5. arachnide_verify_changes, then re-crawl and arachnide_compare_crawls to show the gain.`,
    },
  }],
}));

await server.connect(new StdioServerTransport());
console.error(`Arachnide SEO MCP server ${VERSION} ready (config: ${CONFIG_FILE}, default policy: ${DEFAULT_POLICY.maxChangesPerBatch} changes per batch).`);
