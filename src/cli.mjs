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

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const val = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const vals = (name) => args.flatMap((a, i) => (a === '--' + name && args[i + 1] ? [args[i + 1]] : []));
const VALUE_FLAGS = new Set(['rate', 'robots', 'custom-robots', 'remove-params', 'auth', 'header', 'extract', 'path-limit', 'per-depth', 'folder-depth', 'max-params', 'max-redirects', 'max', 'depth', 'concurrency', 'delay', 'ua', 'include', 'exclude', 'out', 'lang', 'list', 'search', 'report-title', 'client', 'author', 'company', 'contact', 'website', 'color', 'compare', 'report-file']);
const url = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(args[i - 1].slice(2))))[0];
const lang = val('lang', (process.env.LANG || 'en').slice(0, 2));
const t = await getT(LANGS.some((l) => l.code === lang) ? lang : 'en');

if ((!url && !flag('list')) || flag('help')) {
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
  --extract N=SEL     Custom extraction: CSS selector, or N=/regex/ (repeatable)
  --ignore-robots     Ignore robots.txt (same as --robots ignore)
  --subdomains        Crawl subdomains too
  --no-sitemap        Do not read XML sitemaps
  --include REGEX     Only crawl matching URLs
  --exclude REGEX     Skip matching URLs
  --search TEXT       Custom search in the source code (/regex/ supported)
  --lang CODE         en | fr | de | es | it | pt (labels, CSV, report)
  --csv               Also export pages.csv and issues.csv
  --report            Also generate a professional HTML audit report (print to PDF)
      --report-title, --client, --author, --company, --contact, --website, --color "#5b8c1e"
      --compare FILE  Previous crawl .json to show the evolution in the report
  --out DIR           Output folder (./crawls)`);
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
  include: val('include', ''),
  exclude: val('exclude', ''),
  search: val('search', ''),
  removeParams: val('remove-params', ''),
  httpUser,
  httpPass: pass.join(':'),
  customHeaders: vals('header').join('\n'),
  pathLimits: vals('path-limit').join('\n'),
  extractors: vals('extract').map((e) => {
    const [name, ...rest] = e.split('=');
    const sel = rest.join('=');
    const re = /^\/(.+)\/$/.exec(sel);
    return re ? { name, type: 'regex', selector: re[1] } : { name, type: 'css', selector: sel, target: 'text' };
  }),
});
if (!USER_AGENTS[val('ua', 'arachnide')] && val('ua')) opts.userAgent = val('ua');
if (val('custom-robots')) opts.customRobots = await fs.readFile(val('custom-robots'), 'utf8');
if (flag('list')) {
  opts.mode = 'list';
  opts.urls = (await fs.readFile(val('list'), 'utf8')).split(/\s+/).filter((x) => /^https?:\/\//i.test(x));
}

const crawler = new Crawler(url || '', opts);
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

const r = await crawler.start();
if (tty) process.stdout.write('\n');

const S = r.summary;
const icon = { error: '✖', warning: '▲', notice: '•' };
console.log(`\n=== ${r.meta.startUrl} ===`);
console.log(`${t('dash.health')} : ${S.score}/100 (${S.grade}) — ${t('grade.' + S.grade)}`);
console.log(`${t('dash.urls')} : ${S.totalUrls} · ${t('dash.html')} : ${S.htmlPages} · ${t('dash.indexable')} : ${S.indexable}`);
console.log(`${t('dash.responseTime')} : ${S.avgResponseTime} ms · ${t('dash.words')} : ${S.avgWords}`);
console.log(`\n${t('tab.issues')} (${S.errors} ${t('sev.errors')}, ${S.warnings} ${t('sev.warnings')}, ${S.notices} ${t('sev.notices')}) :`);
for (const i of r.issues) console.log(`  ${icon[i.severity]} ${String(i.count).padStart(5)}  ${t('issue.' + i.id + '.label', i.params)}`);

const outDir = path.resolve(val('out', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'crawls')));
await fs.mkdir(outDir, { recursive: true });
const base = `${new URL(r.meta.startUrl).hostname}_${r.meta.finishedAt.replace(/[:]/g, '-').replace(/\..+$/, '')}`;
await fs.writeFile(path.join(outDir, base + '.json'), JSON.stringify(r));
console.log(`\n${t('cli.saved')} ${path.join(outDir, base + '.json')}`);

if (flag('csv')) {
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows, cols) => '﻿' + [cols.map((c) => esc(c[1])).join(';'), ...rows.map((row) => cols.map((c) => esc(row[c[0]])).join(';'))].join('\n');
  const pageCols = [['url', 'URL'], ['status', t('col.status')], ['indexable', t('col.indexability')], ['indexabilityReason', ''], ['depth', t('col.depth')], ['linkScore', t('col.linkScore')], ['title', t('col.title')], ['titleLength', t('col.chars')], ['titlePx', t('col.pixels')], ['metaDescription', t('col.metaDescription')], ['metaDescriptionLength', t('col.chars')], ['h1', 'H1'], ['h1Count', 'H1 #'], ['h2Count', 'H2 #'], ['wordCount', t('col.words')], ['focusKeyword', t('col.focusKeyword')], ['canonical', t('col.canonical')], ['metaRobots', t('col.metaRobots')], ['uniqueInlinks', t('col.inlinks')], ['internalOutlinks', t('col.outlinks')], ['externalOutlinks', t('col.extOutlinks')], ['responseTime', t('col.responseTime')], ['size', t('col.size')], ['inSitemap', t('col.inSitemap')], ['redirectUrl', t('col.redirectsTo')]];
  const pages = r.pages.map((p) => ({ ...p, indexabilityReason: p.indexabilityReason ? t('idx.' + p.indexabilityReason) : '' }));
  await fs.writeFile(path.join(outDir, base + '_pages.csv'), toCsv(pages, pageCols));
  const issueRows = r.issues.flatMap((i) => i.items.map((it) => ({ sev: t('sev.' + i.severity), cat: t('cat.' + i.category), issue: t('issue.' + i.id + '.label', i.params), url: it.url, detail: detailText(it.detail, t), fix: t('issue.' + i.id + '.fix', i.params) })));
  await fs.writeFile(path.join(outDir, base + '_issues.csv'), toCsv(issueRows, [['sev', t('col.severity')], ['cat', t('col.category')], ['issue', t('col.issue')], ['url', 'URL'], ['detail', t('col.detail')], ['fix', t('col.fix')]]));
  console.log(`CSV : ${base}_pages.csv, ${base}_issues.csv`);
}

if (flag('report')) {
  let compare = null;
  if (val('compare')) compare = compareResults(r, JSON.parse(await fs.readFile(val('compare'), 'utf8')));
  const html = buildReport(r, {
    title: val('report-title', ''),
    client: val('client', ''),
    author: val('author', ''),
    company: val('company', ''),
    contact: val('contact', ''),
    website: val('website', ''),
    color: val('color', '#5b8c1e'),
    maxUrls: 10,
    compare,
  }, t);
  const file = path.join(outDir, `${base}_report_${t.lang}.html`);
  await fs.writeFile(file, html);
  console.log(`${t('cli.report')} ${file}`);
}
