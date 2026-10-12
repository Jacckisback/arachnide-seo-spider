# Changelog

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
