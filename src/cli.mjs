#!/usr/bin/env node
// Crawl en ligne de commande : node src/cli.mjs https://exemple.fr --max 1000 --csv --report --lang fr
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Crawler, USER_AGENTS, VERSION } from './crawler.mjs';
import { getT, detailText, LANGS } from '../public/shared/i18n.js';
import { buildReport } from '../public/shared/report.js';
import { compareResults } from '../public/shared/compare.js';
import { toCrawlerOptions } from './options.mjs';
import { applySegments, suggestFromFolders, segmentStats, sliceResult, NONE } from '../public/shared/segments.js';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EXT, writeResult } from './ndjson.mjs';
import { readResultFile, safeName, crawlId } from './store.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const val = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const vals = (name) => args.flatMap((a, i) => (a === '--' + name && args[i + 1] ? [args[i + 1]] : []));
const VALUE_FLAGS = new Set(['logs', 'logs-format', 'logs-custom', 'resume', 'sitemap', 'robots-unavailable', 'rate', 'robots', 'custom-robots', 'remove-params', 'auth', 'header', 'extract', 'path-limit', 'per-depth', 'folder-depth', 'max-params', 'max-redirects', 'max', 'depth', 'concurrency', 'delay', 'ua', 'include', 'exclude', 'out', 'lang', 'list', 'search', 'report-title', 'client', 'author', 'company', 'contact', 'website', 'color', 'compare', 'report-file', 'psi', 'psi-key', 'psi-strategy', 'gsc-key', 'gsc-property', 'gsc-days', 'gsc-csv', 'ga4-key', 'ga4-property', 'ga4-days', 'ga4-csv', 'alert-email', 'alert-score-drop', 'segments', 'segment']);
const url = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(args[i - 1].slice(2))))[0];
const lang = val('lang', (process.env.LANG || 'en').slice(0, 2));
const t = await getT(LANGS.some((l) => l.code === lang) ? lang : 'en');

if ((!url && !flag('list') && !val('sitemap')) || flag('help')) {
  console.log(`Arachnide SEO Spider ${VERSION}

Usage : node src/cli.mjs <url> [options]
        node src/cli.mjs --list urls.txt [options]

  --max N             Max URLs (500)
  --depth N           Max depth (20)
  --concurrency N     Concurrent requests (5)
  --delay MS          Delay between requests per worker (0)
  --ua NAME           arachnide | googlebot | googlebotMobile | chrome
  --render            JavaScript rendering with Chrome / Edge (installed browser)
  --list FILE         List mode: crawl only the URLs of a text file (one per line)
  --external          Check external links
  --images            Check image size and status
  --rate N            Max URLs per second (global cap)
  --robots MODE       respect | report (ignore but report) | ignore
  --custom-robots F   Use this robots.txt file instead of the site's one
  --per-depth N       Max URLs per crawl depth
  --folder-depth N    Max folder depth
  --max-params N      Max number of query strings
  --max-redirects N   Max redirects to follow (10)
  --path-limit P=N    Limit by URL path, e.g. "/blog/=200" (repeatable)
  --remove-params L   Remove URL parameters, e.g. "utm_*,gclid"
  --auth USER:PASS    HTTP authentication (staging sites)
  --header "K: V"     Custom HTTP header (repeatable)
  --extract N=SEL     Custom extraction (repeatable): N=SEL (CSS, text), N=/regex/, N=xpath:EXPR,
                      N=attr:href:SEL, N=html:SEL, N=count:SEL — one column per rule in pages.csv
  --sitemap URL       List mode from a sitemap or sitemap index: crawl exactly the URLs it lists
  --logs FILE         Server access log to analyse with the crawl (repeatable; .gz accepted; Apache/Nginx combined,
                      common, W3C/IIS, JSON lines, or --logs-format custom with --logs-custom "<nginx log_format>")
  --logs-verify       Verify Googlebot / Bingbot IPs by reverse DNS (needs network)
  --keep-params       Keep URL parameters as they are (by default: sorted, tracking params utm_*/gclid/fbclid… removed)
  --robots-unavailable allow|disallow   robots.txt in 5xx or unreachable: disallow all (RFC 9309, default) or allow
  --psi N             PageSpeed Insights + Core Web Vitals (CrUX) for the N most important pages
  --psi-key KEY       Google API key (or env ARACHNIDE_PSI_KEY)   --psi-strategy mobile|desktop
  --gsc-key FILE      Search Console: service account JSON key file
  --gsc-property P    Search Console property (sc-domain:example.com), auto-detected if omitted
  --gsc-days N        Search Console period in days (90)
  --gsc-csv FILE      Import a Search Console "Pages" CSV export instead of the API
  --ga4-key FILE      Google Analytics 4: service account JSON key file (the Search Console one works if it has access)
  --ga4-property ID   GA4 property ID (123456789), auto-detected from the domain if omitted
  --ga4-days N        GA4 period in days (90)
  --ga4-csv FILE      Import a GA4 "Pages and screens" (or "Landing page") CSV export instead of the API
  --alert-email A,B   Email an alert if the crawl got worse than the previous one (for cron jobs)
  --alert-score-drop N  Alert threshold in score points (5)
  --ignore-robots     Ignore robots.txt (same as --robots ignore)
  --subdomains        Crawl subdomains too
  --no-sitemap        Do not read XML sitemaps
  --include REGEX     Only crawl matching URLs (repeatable: one regex per flag)
  --exclude REGEX     Skip matching URLs (repeatable)
  --stay-in-folder    Do not crawl outside the start URL's folder (https://x.com/blog/ → /blog/… only)
  --search TEXT       Custom search in the source code (/regex/ supported)
  --segments FILE     Segments (JSON exported from the app, or [{ "name", "match", "rules": [{ "field", "op", "value" }] }]):
                      score, errors and averages per site section, a segment column in the CSV, a section in the report
  --segment-folders   One segment per top-level directory (automatic)
  --segment ID        Report and CSV on this segment only (e.g. --segment blog)
  --lang CODE         en | fr | de | es | it | pt (labels, CSV, report)
  --csv               Also export pages.csv and issues.csv
  --report            Also generate a professional HTML audit report (print to PDF)
      --report-title, --client, --author, --company, --contact, --website, --color "#5b8c1e"
      --compare FILE  Previous crawl .json to show the evolution in the report
  --out DIR           Output folder (./crawls)
  --resume FILE       Resume an interrupted crawl from its journal (<out>/.en-cours/*.ndjson)
  --no-journal        Do not write the resume journal during the crawl`);
  process.exit(url || flag('help') ? 0 : 1);
}

const [httpUser, ...pass] = (val('auth', '') || '').split(':');
const opts = toCrawlerOptions({
  maxPages: val('max', 500),
  maxDepth: val('depth', 20),
  concurrency: val('concurrency', 5),
  delayMs: val('delay', 0),
  maxUrlPerSec: val('rate', ''),
  limitPerDepth: val('per-depth', ''),
  maxFolderDepth: val('folder-depth', ''),
  maxQueryParams: val('max-params', ''),
  maxRedirects: val('max-redirects', ''),
  userAgent: val('ua', 'arachnide'),
  checkExternal: flag('external'),
  checkImages: flag('images'),
  robotsMode: flag('ignore-robots') ? 'ignore' : val('robots', 'respect'),
  crawlSubdomains: flag('subdomains'),
  useSitemaps: !flag('no-sitemap'),
  render: flag('render'),
  include: vals('include').join('\n'),
  exclude: vals('exclude').join('\n'),
  stayInFolder: flag('stay-in-folder'),
  search: val('search', ''),
  removeParams: val('remove-params', ''),
  httpUser,
  httpPass: pass.join(':'),
  customHeaders: vals('header').join('\n'),
  pathLimits: vals('path-limit').join('\n'),
  extractors: vals('extract').map(parseExtractArg),
  normalizeParams: !flag('keep-params'),
  robotsUnavailable: val('robots-unavailable', 'disallow'),
  sitemapUrl: val('sitemap', ''),
});
if (!USER_AGENTS[val('ua', 'arachnide')] && val('ua')) opts.userAgent = val('ua');
if (val('psi')) Object.assign(opts, toCrawlerOptions({ psiMax: val('psi'), psiStrategy: val('psi-strategy', 'mobile') }), { psiKey: val('psi-key', process.env.ARACHNIDE_PSI_KEY || '') });
if (val('gsc-key')) Object.assign(opts, { gscKeyFile: val('gsc-key'), gscProperty: val('gsc-property', ''), gscDays: Number(val('gsc-days', 90)) });
if (val('gsc-csv')) opts.gscCsv = await fs.readFile(val('gsc-csv'), 'utf8');
if (val('ga4-key')) Object.assign(opts, { ga4KeyFile: val('ga4-key'), ga4Property: val('ga4-property', ''), ga4Days: Number(val('ga4-days', 90)) });
if (val('ga4-csv')) opts.ga4Csv = await fs.readFile(val('ga4-csv'), 'utf8');
if (val('custom-robots')) opts.customRobots = await fs.readFile(val('custom-robots'), 'utf8');
if (flag('list')) {
  opts.mode = 'list';
  opts.urls = (await fs.readFile(val('list'), 'utf8')).split(/\s+/).filter((x) => /^https?:\/\//i.test(x));
}
if (val('sitemap')) opts.mode = 'list';

// --extract N=SEL · N=/re/ · N=xpath:EXPR · N=attr:NAME:SEL · N=html:SEL · N=count:SEL
function parseExtractArg(e) {
  const [name, ...rest] = e.split('=');
  const sel = rest.join('=');
  const re = /^\/(.+)\/$/.exec(sel);
  if (re) return { name, type: 'regex', selector: re[1] };
  const m = /^(xpath|attr|html|count):(.*)$/s.exec(sel);
  if (!m) return { name, type: 'css', selector: sel, target: 'text' };
  if (m[1] === 'xpath') return { name, type: 'xpath', selector: m[2], target: 'text' };
  if (m[1] === 'attr') {
    const [attr, ...s2] = m[2].split(':');
    return { name, type: 'css', selector: s2.join(':'), target: 'attr', attr };
  }
  return { name, type: 'css', selector: m[2], target: m[1] };
}

if (val('segments')) {
  try {
    opts.segments = toCrawlerOptions({ segments: JSON.parse(await fs.readFile(val('segments'), 'utf8')) }).segments;
  } catch (e) {
    console.error(`--segments: ${e.message}`);
    process.exit(1);
  }
}

const outDir = path.resolve(val('out', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'crawls')));
await fs.mkdir(outDir, { recursive: true });
// Journal de reprise : <sortie>/.en-cours/<hôte>_<date>.ndjson, écrit au fil de l'eau. --resume FICHIER reprend un crawl
// interrompu ; --no-journal n'écrit rien pendant le crawl.
let crawler;
if (val('resume')) {
  crawler = await Crawler.resume(path.resolve(val('resume')));
  crawler.on('resumed', (r) => console.log(`↻ ${t('cli.resumed', { n: r.pages, queued: r.queued })}`));
} else {
  crawler = new Crawler(url || '', opts);
  if (!flag('no-journal')) {
    const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
    await crawler.openJournal(path.join(outDir, '.en-cours', `${new URL(crawler.startUrl || 'http://list').hostname}_${stamp}.ndjson`)).catch((e) => console.warn(`⚠ journal: ${e.message}`));
  }
}
const tty = process.stdout.isTTY;
crawler.on('status', (s) => console.log(`→ ${t('phase.' + s.phase)}`));
crawler.on('warning', (w) => console.warn(`⚠ ${t(w.key, w.params)}`));
crawler.on('progress', (p) => {
  if (tty) process.stdout.write(`\r  ${t('progress.crawled', { n: p.crawled })} · ${t('progress.queued', { n: p.queued })} · ${Math.round(p.elapsed / 1000)} s   `);
});
process.on('SIGINT', () => {
  console.log('\n' + t('progress.stopping'));
  crawler.stop();
});

const full = await crawler.start();
if (tty) process.stdout.write('\n');
if (flag('segment-folders') && !full.meta.segments?.length) applySegments(full, suggestFromFolders(full));
const segs = full.meta.segments || [];
// --segment : le résumé, les CSV et le rapport portent sur ce segment (le JSON garde le crawl complet).
const segId = val('segment', '');
if (segId && segId !== NONE && !segs.some((s) => s.id === segId)) console.warn(`⚠ --segment ${segId}: ${segs.map((s) => s.id).join(', ') || '—'}`);
const r = segId && (segId === NONE || segs.some((s) => s.id === segId)) ? sliceResult(full, segId) : full;

const S = r.summary;
const icon = { error: '✖', warning: '▲', notice: '•' };
console.log(`\n=== ${r.meta.startUrl} ===`);
console.log(`${t('dash.health')} : ${S.score}/100 (${S.grade}) — ${t('grade.' + S.grade)}`);
console.log(`${t('dash.urls')} : ${S.totalUrls} · ${t('dash.html')} : ${S.htmlPages} · ${t('dash.indexable')} : ${S.indexable}`);
console.log(`${t('dash.responseTime')} : ${S.avgResponseTime} ms · ${t('dash.words')} : ${S.avgWords}`);
console.log(`\n${t('tab.issues')} (${S.errors} ${t('sev.errors')}, ${S.warnings} ${t('sev.warnings')}, ${S.notices} ${t('sev.notices')}) :`);
for (const i of r.issues) console.log(`  ${icon[i.severity]} ${String(i.count).padStart(5)}  ${t('issue.' + i.id + '.label', i.params)}`);
const segRows = segs.length ? segmentStats(full) : [];
if (segRows.length) {
  console.log(`\n${t('seg.cardTitle')} :`);
  const w = Math.max(...segRows.map((g) => (g.id === NONE ? t('seg.none') : g.name).length));
  for (const g of segRows) console.log(`  ${(g.id === NONE ? t('seg.none') : g.name).padEnd(w)}  ${String(g.pages).padStart(6)} ${t('seg.col.pages').toLowerCase()} · ${g.score ?? '—'}/100 · ${icon.error} ${g.errors} · ${icon.warning} ${g.warnings}`);
}

const base = `${new URL(r.meta.startUrl).hostname}_${r.meta.finishedAt.replace(/[:]/g, '-').replace(/\..+$/, '')}`;
// Chaque sortie s'écrit en flux et indépendamment : l'échec de l'une n'empêche pas les autres.
const failures = [];
const output = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    failures.push(label);
    console.error(`✖ ${label}: ${e.message}`);
  }
};
// Le fichier de crawl s'écrit avant le rattachement des journaux d'accès : les logs vivent dans un fichier voisin
// (<crawl>.logs.jsonl.gz), relu à l'ouverture et retirable sans toucher au crawl.
await output('json', async () => {
  const file = path.join(outDir, base + EXT);
  await writeResult(full, file);
  console.log(`\n${t('cli.saved')} ${file}`);
});
// Journaux d'accès : rattachés au résultat avant les sorties (et enregistrés à côté du crawl).
const logFiles = vals('logs');
let logAgg = null;
if (logFiles.length) {
  const { parseLog } = await import('./logs/parse.mjs');
  const { LogAggregator, applyLogs } = await import('./logs/analyze.mjs');
  logAgg = new LogAggregator({ origin: new URL(full.meta.finalStart || full.meta.startUrl).origin, options: full.meta.options || {} });
  for (const f of logFiles) {
    try {
      const st = await parseLog(path.resolve(f), { format: val('logs-format', 'auto'), custom: val('logs-custom', ''), onEvent: (e) => logAgg.add(e) });
      logAgg.files.push({ name: path.basename(f), ...st });
      logAgg.format ||= st.format;
      logAgg.lines += st.lines;
      logAgg.parsed += st.parsed;
      logAgg.skipped += st.skipped;
      console.log(`📜 ${path.basename(f)} : ${st.format}, ${st.parsed} ${t('logs.events').toLowerCase()}`);
    } catch (e) {
      console.error(`✖ ${f}: ${e.message}`);
    }
  }
  if (flag('logs-verify')) await logAgg.verify();
  const L = applyLogs(full, logAgg);
  if (segId && segId !== NONE) Object.assign(r, sliceResult(full, segId));
  console.log(`📜 ${t('logs.title')} : ${L.events} ${t('logs.events').toLowerCase()} · Googlebot ${L.googlebotHits} · ${L.outsidePages} ${t('logs.outsidePages').toLowerCase()}`);
  await output('logs', async () => {
    const { writeRecords } = await import('./ndjson.mjs');
    const { aggregatorRecords } = await import('./logs/analyze.mjs');
    await writeRecords(aggregatorRecords(logAgg), path.join(outDir, base + '.logs.jsonl.gz'));
  });
}

if (crawler.stopped && crawler.journalFile) console.log(`↻ ${t('cli.resumeHint')} node src/cli.mjs --resume "${crawler.journalFile}"`);

// Alerte e-mail (pour une tâche cron) : comparaison avec le crawl précédent du même site dans le dossier de sortie.
if (val('alert-email')) {
  const { evaluateAlerts, alertEmail } = await import('./schedules.mjs');
  const { sendMail } = await import('./mailer.mjs');
  const host = new URL(r.meta.startUrl).hostname;
  const files = (await fs.readdir(outDir)).filter((f) => f.startsWith(host + '_') && safeName(f) && crawlId(f) !== base).sort();
  const prev = files.length ? await readResultFile(path.join(outDir, files[files.length - 1])).catch(() => null) : null;
  const { alerts, compare } = evaluateAlerts(r, prev, { scoreDrop: Number(val('alert-score-drop', 5)), errors: true });
  if (alerts.length) {
    const mail = alertEmail({ R: r, prev, alerts, compare, t, schedule: { name: host } });
    await sendMail({ to: val('alert-email'), ...mail, attachments: [{ filename: `${host}_report.html`, content: buildReport(r, { maxUrls: 10, compare }, t), contentType: 'text/html' }] })
      .then(() => console.log(`✉  ${t('alert.count', { n: alerts.length })} → ${val('alert-email')}`))
      .catch((e) => console.error(`✉  ${e.message}`));
  } else console.log(`✉  ${t('alert.none')}`);
}

if (flag('csv')) await output('csv', async () => {
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // CSV écrit ligne par ligne (jamais une chaîne de tout le fichier).
  const writeCsv = async (file, rows, cols) => {
    const line = (row) => cols.map((c) => esc(row[c[0]])).join(';') + '\n';
    async function* gen() {
      yield '\ufeff' + cols.map((c) => esc(c[1])).join(';') + '\n';
      for (const row of rows) yield line(row);
    }
    await pipeline(Readable.from(gen()), createWriteStream(file));
  };
  const segName = (id) => (!id ? '' : id === NONE ? t('seg.none') : segs.find((s) => s.id === id)?.name || id);
  const exNames = (full.meta.options?.extractors || []).map((x) => x.name);
  const pageCols = [['url', 'URL'], ...(segs.length ? [['segmentName', t('col.segment')]] : []), ['status', t('col.status')], ['indexable', t('col.indexability')], ['indexabilityReason', ''], ['depth', t('col.depth')], ['linkScore', t('col.linkScore')], ['title', t('col.title')], ['titleLength', t('col.chars')], ['titlePx', t('col.pixels')], ['metaDescription', t('col.metaDescription')], ['metaDescriptionLength', t('col.chars')], ['h1', 'H1'], ['h1Count', 'H1 #'], ['h2Count', 'H2 #'], ['wordCount', t('col.words')], ['focusKeyword', t('col.focusKeyword')], ['canonical', t('col.canonical')], ['metaRobots', t('col.metaRobots')], ['uniqueInlinks', t('col.inlinks')], ['internalOutlinks', t('col.outlinks')], ['externalOutlinks', t('col.extOutlinks')], ['responseTime', t('col.responseTime')], ['size', t('col.size')], ['inSitemap', t('col.inSitemap')], ['redirectUrl', t('col.redirectsTo')], ...(full.meta.ga4 ? [['ga4Sessions', t('col.sessions')], ['ga4Views', t('col.views')]] : []), ...(full.meta.logs ? [['logHits', t('col.logHits')], ['logGooglebot', t('col.logGooglebot')], ['logLast', t('col.logLast')]] : []), ...exNames.map((n) => ['ex:' + n, n])];
  function* pageRows() {
    for (const p of r.pages) {
      const row = { ...p, segmentName: segName(p.segment), ga4Sessions: p.ga4?.sessions ?? '', ga4Views: p.ga4?.views ?? '', logHits: p.log?.hits ?? '', logGooglebot: p.log?.googlebot ?? '', logLast: p.log?.last ? p.log.last.slice(0, 10) : '', indexabilityReason: p.indexabilityReason ? t('idx.' + p.indexabilityReason) : '' };
      for (const n of exNames) row['ex:' + n] = (p.extracted?.[n] || []).join(' | ');
      yield row;
    }
  }
  await writeCsv(path.join(outDir, base + '_pages.csv'), pageRows(), pageCols);
  const segOfUrl = new Map(full.pages.map((p) => [p.url, p.segment]));
  function* issueRows() {
    for (const i of r.issues) for (const it of i.items) yield { sev: t('sev.' + i.severity), cat: t('cat.' + i.category), issue: t('issue.' + i.id + '.label', i.params), url: it.url, segment: segName(segOfUrl.get(it.url)), detail: detailText(it.detail, t), fix: t('issue.' + i.id + '.fix', i.params) };
  }
  await writeCsv(path.join(outDir, base + '_issues.csv'), issueRows(), [['sev', t('col.severity')], ['cat', t('col.category')], ['issue', t('col.issue')], ['url', 'URL'], ...(segs.length ? [['segment', t('col.segment')]] : []), ['detail', t('col.detail')], ['fix', t('col.fix')]]);
  console.log(`CSV : ${base}_pages.csv, ${base}_issues.csv`);
});

if (flag('report')) await output('report', async () => {
  let compare = null;
  if (val('compare')) compare = compareResults(r, await readResultFile(val('compare')));
  const html = buildReport(r, {
    title: val('report-title', ''),
    client: val('client', ''),
    author: val('author', ''),
    company: val('company', ''),
    contact: val('contact', ''),
    website: val('website', ''),
    color: val('color', '#5b8c1e'),
    maxUrls: 10,
    compare: segId ? null : compare,
    segments: segRows.length ? segRows : null,
  }, t);
  const file = path.join(outDir, `${base}_report_${t.lang}.html`);
  await fs.writeFile(file, html);
  console.log(`${t('cli.report')} ${file}`);
});
if (failures.length) process.exitCode = 1;
