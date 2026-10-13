# Changelog

## 3.3.0 — 2026-10-13

Reliability release: a full audit (HTML extraction, crawl engine, SEO rules, and crawls of 8 real sites) removed false positives and false negatives that could mislead SEO and GEO professionals.

### Crawling
- **Bot protection**: when a site refuses the Arachnide user agent (403/406/429/503), the crawl switches to Chrome and says so, instead of reporting every page as an error.
- **Rate limiting**: 429/503 responses honour `Retry-After` and are retried; URLs still throttled are reported as "not checked", never as 4xx/5xx or broken links.
- **External links and images**: a HEAD error is confirmed with GET; 401/403/429/999/timeouts are "could not be checked", not "broken".
- **robots.txt** unreadable (5xx, 403, HTML page) is reported and bot access shows "unknown" instead of "allowed".
- **Sitemaps**: gzip sitemaps already decoded by the server, image/video sitemaps skipped, 500-file limit with a warning, XML entities, and a new check for sitemap URLs on another protocol or host.
- **URLs**: percent-encoding case, empty query string and parameter removal no longer create duplicate URLs; another port is not the audited site.
- **Redirects**: meta refresh is treated and followed as a redirect, 3xx without `Location` is an error, external redirect targets are checked, redirects add no click depth.
- **Charset**: BOM, `<meta charset>` inside comments, and windows-1252 fallback handled like browsers.

### HTML extraction
- `<title>` and headings inside inline SVG, `<noscript>` or `<template>` are ignored.
- Robots directives are read token by token: `max-image-preview:none` is no longer "noindex", other bots' `X-Robots-Tag` is ignored, `unavailable_after` is honoured.
- Lazy-loaded images (`data-src`, `data-lazy-src`, `data-original`) are analysed instead of their placeholders; CSS width/height accepted.
- Text of headings and links keeps line breaks and blocks apart; image alt text counts in headings and anchors; empty H1 is not an H1.
- Word count works for Chinese, Japanese and Thai; thin content is measured on the main content.
- Meta description: `content=""` and `property="description"` ignored; identical duplicate canonicals are a notice, conflicting ones a warning; canonical in `<body>` reported.
- hreflang validated against real ISO 639-1 and ISO 3166-1 codes.
- Structured data: only properties Google requires, checked on main entities (no more "Organization: url" from a nested publisher).

### SEO rules and score
- `alt=""` is a decorative image (separate notice), not a missing alt.
- hreflang, title, description, H1, image and URL checks run on indexable pages only.
- Duplicate titles/descriptions/H1 exclude hreflang alternates, paginated series and other-language pages; duplicate title is a warning.
- Self-links and links on error pages are not inlinks; anchors such as "!" or ">>" are not empty; `<code>this</code>` is not generic.
- Cannibalisation requires overlapping topics and ignores repeated title prefixes.
- 302 is a notice (Google passes signals); `/index.html → /` is not a soft 404.
- New checks: soft 404, rate-limited URLs, external links that could not be checked, canonical outside `<head>`, repeated canonical tag, sitemap on another host.
- **Health score**: each issue's penalty is capped and penalties combine multiplicatively, so one template defect no longer drops a site to 0, while site-level issues (Googlebot blocked, no HTTPS) finally count.

## 3.2.0 — 2026-10-12

### New
- **PageSpeed Insights & Core Web Vitals field data (CrUX)** for the most important pages:
  - Lighthouse score, plus LCP, INP, CLS, FCP and TTFB from real Chrome users, each rated good / needs improvement / poor;
  - new Core Web Vitals tab and 3 checks;
  - optional free API key (`ARACHNIDE_PSI_KEY`).
- **Google Search Console**, from the API (read-only service account, nothing to install) or from a CSV export:
  - clicks, impressions, CTR and position per URL in a new Search Console tab;
  - **pages seen by Google but missing from the crawl** (GSC-only orphan pages);
  - pages with no impressions, low CTR for the position, and non-indexable pages getting traffic.
- **Scheduled crawls with email alerts**:
  - daily, weekly or monthly schedules, with missed runs caught up;
  - comparison with the previous crawl;
  - alert rules: score drop, new or increased errors, new issue types, or always;
  - email summary with the full report attached;
  - SMTP settings with a test email;
  - runs in the app or standalone with `npm run scheduler`;
  - `--alert-email` for system cron jobs.
- Command line: `--psi`, `--psi-key`, `--gsc-key`, `--gsc-property`, `--gsc-days`, `--gsc-csv`, `--alert-email`, `--alert-score-drop`. MCP `arachnide_crawl`: `psi_pages`, `gsc_key_file`, `gsc_property`, `gsc_csv_path`.
- Setup guide: `docs/GOOGLE-AND-SCHEDULES.md`.

### Changed
- Decimal numbers in the new tables follow the interface language (3,4 s in French).
- New dependency: `nodemailer` (email).

## 3.1.0 — 2026-10-12

### Visualisations (user feedback)
- **Pages only**: images, PDF, CSS, JS and other resources are no longer drawn as nodes. The note under the graph says how many were hidden.
- **Issues at a glance**:
  - In "Colour: issues" mode, the tooltip lists the page's issues.
  - Clicking a node opens the new **Issues** tab of the detail pane: severity, issue, detail and how to fix it. Click a row to open the full issue.
- **Node size**: Link Score (default), page weight (HTML), inlinks or response time.
- **Darker and slightly thicker links**, in 2D and 3D, so the structure is easier to follow.
- **PDF export**: a printable A4 landscape page with the graph, legend, site and date.
- The page detail pane now has an **Issues** tab for every page, not only in the visualisations.

## 3.0.0 — 2026-10-12

### New: MCP server — Claude audits and fixes your site
- `src/mcp.mjs` (`npm run mcp`, bin `arachnide-mcp`): 19 tools and an `optimize_site` prompt for Claude Code, Claude Desktop and any MCP client. See [docs/MCP.md](docs/MCP.md).
- **Analysis tools**: CMS / technology detection, crawl with progress, summary, issues, affected URLs, page details, live page reading, crawl comparison.
- **Decision support**: `arachnide_suggest_fixes` turns a crawl into fixable items per page, with the current value, the reason, the SEO constraints and the page context.
- **Changes on the live site**: preview (nothing written), apply, verify on the public page, journal with previous values, and rollback by batch or change id. Supported fields: SEO title, meta description, H1, canonical, noindex, image alt, 301 redirect.
- **Connectors**:
  - WordPress, with a companion plugin for Yoast, Rank Math, AIOSEO, SEOPress and Redirection;
  - Shopify, Wix, Webflow, Joomla, Drupal, PrestaShop;
  - **files**: static HTML, plus `_redirects`, `.htaccess`, nginx or `vercel.json` redirects;
  - **Cloudflare Worker**: rewrites the HTML at the edge, for any site behind Cloudflare;
  - **manual**: exact click path and value for every other CMS.
- **Safety**:
  - per-site policy (allowed fields, batch size, read-only);
  - secrets stored as `env:VARIABLE` and never shown;
  - writes limited to the site's own domain;
  - destructive tools flagged so MCP clients ask for permission.

### Changed
- Crawl storage moved to `src/store.mjs`, shared by the web app, the CLI and the MCP server.
- Crawls now keep the `src` of images without alt text, one list per page.

## 2.2.0 — 2026-10-12

### New
- **Responsive images**: every file listed in `srcset` (on `img`, including lazy-loading `data-srcset`) and in `<picture>` `<source>` elements is now collected and checked like the main `src`: status, file size, format. A heavy 1600w variant or a broken WebP source is now reported.
- Images tab: new Source (src, srcset 800w, `<picture>` source…), Format, Variants and Main image columns, with filters for main images, variants, responsive / not responsive images and JPEG / PNG / GIF.
- 3 new checks:
  - heavy images without `srcset` or `<picture>`;
  - images without a modern format (no WebP / AVIF in src, srcset or `<picture>`);
  - `srcset` with width descriptors (`w`) but no `sizes` attribute.
- Mixed content now also counts `http://` URLs in `srcset`.

## 2.1.0 — 2026-10-12

### New
- **2D / 3D visualisations**: crawl tree, directory tree and internal link graph. Nodes are coloured by indexability, issues or depth, and sized by Link Score. Click a node for its details, export as PNG. The libraries (force-graph, 3d-force-graph) are served locally, so it works offline.
- **Configuration window** with tabs, modelled on Screaming Frog's Spider configuration: Spider, Limits, Speed, robots.txt, Rendering, Include / exclude, Extraction, Authentication.
- **Spider › Limits**: URLs per crawl depth, max folder depth, max query strings, max redirects to follow, max URL length, max links per URL, max page size, limits by URL path. Skipped URLs are counted per reason on the dashboard.
- **Speed**: global max URLs per second.
- **robots.txt**: respect / ignore but report / ignore modes, custom robots.txt for the crawl, URL tester showing the matching rule.
- **Custom extraction**: CSS selector (text, attribute, HTML, count) or regex, with an Extraction tab and CSV export.
- **Authentication**: HTTP basic auth and custom headers/cookies, sent only to the audited site (also in JavaScript rendering); the password is never saved.
- **Remove URL parameters** (`utm_*`, `gclid`…), with wildcards.
- CLI flags for all of the above: `--rate`, `--robots`, `--custom-robots`, `--per-depth`, `--folder-depth`, `--max-params`, `--max-redirects`, `--path-limit`, `--remove-params`, `--auth`, `--header`, `--extract`.

### Changed
- `respectRobots: false` (2.0) still works and maps to `robotsMode: 'ignore'`.
- The robots.txt parser moved to `public/shared/robots.js` so the interface can use it.

## 2.0.0 — 2026-10-12

### New
- **6 languages**: the interface, CSV exports, CLI output and reports are available in English, French, German, Spanish, Italian and Portuguese. The language is detected automatically and can be changed from the header.
- **JavaScript rendering** with the Chrome / Edge / Chromium / Brave already installed (puppeteer-core, no extra download). It compares raw and rendered HTML (content, links, title, H1, canonical, noindex), reports JS errors, and gives lab LCP and CLS.
- **Professional SEO reports**: white-label HTML report (logo, colour, client, contact) that prints to PDF. It includes a cover page, executive summary, key findings, strengths, scores by category, an action plan in 3 priority levels, a detailed analysis with sample URLs, a technical overview and the methodology. It can compare with a previous crawl to show score change and issues fixed, new or worse.
- **Action plan** tab: issues ranked by severity × impact × URLs ÷ effort, with quick wins.
- **List mode**: crawl a pasted list of URLs (UI) or a text file (CLI `--list`).
- **Custom search**: find pages containing a text or `/regex/`.
- New analyses:
  - Link Score (internal PageRank) and contextual inlinks
  - near-duplicate content (simhash) and keyword cannibalisation
  - main keyword per page
  - title and description width in pixels, with a Google SERP preview
- About 35 new checks:
  - meta refresh, HSTS, no HTTPS, compression
  - heading hierarchy, generic or empty anchors, too many links
  - incomplete structured data (Article, Product, FAQPage, LocalBusiness…)
  - invalid hreflang codes, missing hreflang self-reference, missing x-default
  - image dimensions (CLS)
  - search engines and AI crawlers blocked in robots.txt, llms.txt
  - LCP / CLS
  - JavaScript-dependent content, links, title, H1, canonical and noindex
- New tabs: Action plan, Near duplicates, Cannibalisation, Search, JavaScript, Security, Robots / AI & sitemaps.

### Improved
- New design:
  - home screen with recent crawls and A–F grades
  - SVG icons, toasts, segmented filters
  - resizable detail pane, keyboard navigation (↑ ↓ Enter, `/`)
  - live speed and time remaining
  - grouped options
- Saved crawls are indexed (score, grade, date) and compared automatically with the previous crawl of the same site.
- The server picks the next free port when 4000 is busy and opens the browser from the double-click launchers.
- Better text extraction (spaces between blocks, main content detection).
- Googlebot-like requests: no Accept-Language header by default (configurable).

### Changed
- Crawl files use format version 2. Crawls from 1.x still open, with fewer details.
- Issue labels are no longer stored in crawl files. Translation keys are stored instead.

## 1.0.0 — 2026-10-12

First public release.

- Crawl engine: BFS queue, concurrency, robots.txt (Google rules), XML sitemaps (including indexes and .gz files), manual redirect tracking, include/exclude regex, user-agent presets
- More than 50 SEO checks with a health score, explanations and fixes
- Local web interface: dashboard, issues, 20 sortable and filterable tabs, detail pane with SERP preview and inlinks/outlinks, CSV/JSON export, crawl history, dark mode
- Command-line interface with CSV export
- Double-click launchers for macOS, Windows and Linux
- Documentation in English, French and German
