<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — free, open-source technical SEO crawler by Thierry Gustin" width="100%">
</p>

<p align="center">
  <b>🇬🇧 English</b> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/version-3.23.2-3d5f17" alt="Version 3.23.2">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 or newer">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 languages">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

<p align="center">🌐 Website and documentation: <a href="https://arachnide-seo.com"><b>arachnide-seo.com</b></a></p>

---

**Arachnide** is a free technical SEO crawler that runs on your own computer, like Screaming Frog SEO Spider. It explores a website the way Googlebot does, **renders JavaScript** if you want, and turns the crawl into a prioritised audit:

- a health score out of 100 and a score for each category;
- **about 90 checks**, each with an explanation and a fix;
- an action plan ranked by impact and effort;
- a **white-label PDF report** for your clients, in 6 languages.

There is no account and no cloud, and your data stays on your machine. Tested on a 200 000-page synthetic site (`npm run bench -- --pages 200000`); the default budget is 500 pages, raise it in the options.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Overview: SEO health score with four rings (technical, content, internal linking, performance), priorities, key indicators and strengths" width="100%">
</p>

## 🗂️ New in 3.23: sitemap changes — audit only the products that left, decide 301 or 410

Products come and go on a shop every week; recrawling the whole site to learn what happened to the ones that left is slow and useless. Give Arachnide the current **sitemap or sitemap index** and a reference (a previous crawl from the history, the old sitemap, or a URL list): it crawls **only the URLs that left the sitemap** (or the ones added), **follows their redirects** and decides for each one — 301 to a suggested similar page (same folder, similar name, with a similarity score), return 410 when nothing replaces it, fix a broken redirect or a server error, shorten a chain, or put a still-live page back. New **Sitemap changes** tab with filters and CSV, a dashboard card, six new checks in the score and the report, a *List mode options* dialog in the app, `--sitemap-previous` / `--sitemap-changes` on the CLI and `arachnide_sitemap_changes` for AI agents. XPath extraction and the sitemap-driven list mode asked for in the same feedback have been in since 3.21. Guide: **[docs/SITEMAP-CHANGES.md](docs/SITEMAP-CHANGES.md)**.

## 📜 New in 3.22: log file analysis — what Googlebot really requests

A crawl shows what search engines *could* reach; your **server access logs** show what Googlebot, Bingbot and the AI bots *actually* request, how often, with which status and how fast. Arachnide now reads those logs (Apache / Nginx combined and common, IIS / CloudFront W3C, JSON lines from Nginx, Cloudflare Logpush, Caddy, Traefik, or any custom Nginx `log_format`; `.gz` accepted, rotated files together) and matches them with the open crawl, through the same URL normalisation as the crawler. New **Logs** tab: requests per day by bot family, bots seen (with distinct IPs), busiest folders, every URL seen in the logs with its crawl data and eight filters; a dashboard card; log counters in page details, segments and the client report. **Six new checks** count in the score: pages search bots crawl but nothing links, indexable pages Googlebot never visits, crawl budget wasted on redirects / errors / non-indexable URLs, 5xx served to bots, **fake Googlebot visits** (reverse-DNS verification as Google and Bing document it) and pages slow for bots. Everything stays on your machine: files are streamed line by line, only aggregated counts are kept next to the crawl. CLI `--logs FILE` (repeatable), `--logs-format`, `--logs-custom`, `--logs-verify`; AI agents get `arachnide_logs`. Guide: **[docs/LOGS.md](docs/LOGS.md)**.

## 🛡️ New in 3.21: crawl guard-rails, XPath, sitemap list mode, and a reproducible 200 000-page benchmark

The page budget now counts pages actually downloaded (URLs blocked by robots.txt no longer eat it), URL parameters are sorted and tracking parameters (`utm_*`, `gclid`, `fbclid`…) removed by default, facet traps are reported, an unreachable robots.txt disallows everything as RFC 9309 requires (with an explicit way out), robots.txt is read per host in list mode, 5xx and network cuts get a deferred retry, response bodies are read as streams and bounded, a Chrome that dies is restarted and reported, and a runaway regex extraction is interrupted in a worker. **XPath extraction** joins CSS and regex (Chrome in rendering mode, optional jsdom on raw HTML); the CLI gets `attr:` / `html:` / `count:` / `xpath:` targets with one CSV column per rule, **`--sitemap URL`** crawls exactly a sitemap, list mode goes up to 500 000 URLs and AI agents get list mode too. `npm run bench -- --pages 200000` crawls a local synthetic site and prints duration, peak memory and file size.

## 🖥️ New in 3.20: scale, step 5 — the browser never receives the whole crawl again

The server keeps the crawl and its link graph; the browser receives a **light result as a stream** (pages reduced to what the tables show, no links) and asks for the rest on demand: a page's links **paginated** in the detail panel (no more silent cut at 1 000), the full page record on click, the site-map edges for the displayed nodes only, and the comparison with the previous crawl as a small diff computed server-side. Opening a saved crawl or importing a file no longer sends the crawl back and forth; exports stream from the server. Tab counts are computed once per result.

## 🔬 New in 3.19: scale, step 4 — an analysis that scales

**Every page is now compared for near duplicates**: the old check stopped at the first 5 000 pages without saying so. The search is exact by bands on the 64-bit fingerprint (two pages within 5 bits always share a band), so a 200 000-page site is compared in seconds; a very templated site is reported rather than silently truncated. **Cannibalization** runs in linear time with an inverted index, and expressions shared by more than 500 pages are reported as the site template. **Segments** count their links in a single pass instead of one per segment (475 ms versus ~16 s for 10 segments on 20 million links), and the fix rules read the compact graph.

## 💾 New in 3.18: scale, step 3 — a crawl written as it goes

A crawl never passes through a single string any more. Results are saved as **gzipped NDJSON** (one JSON object per line, links by chunks), written and read as streams, atomically; the history reads only the first line. During the crawl a **resume journal** records every URL queued and every page done: after a crash or Ctrl+C, `--resume` (or `POST /api/crawl { resume }`) picks the crawl up where it stopped, losing only the last seconds. Saved crawls are streamed to the browser line by line, segments edited afterwards go to a small side file, and the CLI writes JSON, CSV and report each in a stream and independently. Old `.json` crawls still open. Next step: lighter pages and on-demand links in the browser.

## 🧮 New in 3.17: scale, step 2 — a compact link graph

A link used to be a JavaScript object with seven properties and two URL strings; the analysis then copied it into maps of sets and into an array of tuples. Links now live in **columns of integers** (URLs and anchor texts stored once, 14 bytes per link) and the analysis runs on a **CSR graph**: inlinks, click depth, PageRank and the link checks read the same columns, with no object per link. Measured on 50 000 pages × 100 links: link storage 690 MB → 55 MB, analysis 29 s / 2.5 GB → 5.5 s / 647 MB, same results. A 200 000-page / 20-million-link crawl now gets through the analysis. The saved `links` block is columnar; old crawl files still open. Next step: streaming the saved file and the data sent to the browser.

## 🏗️ New in 3.16: scale, step 1 — large sites no longer crash at the end

A technical review on a 200 000-page crawl found that the engine scales but a few data-handling lines did not: a `Math.min(...)` on one value per URL crashed the analysis beyond ~125 000 URLs (after hours of crawl), and several loops were quadratic. **Fourteen small fixes**: no more spread on site-sized arrays, indexes built once (redirects, outgoing links, closest URL for 404s with the parent folder searched first), AI examples taken from the same folder, table sort 20× faster (one `Intl.Collator`), site-map folder counts 5× faster, finished crawl jobs keep only a digest, and **atomic writes** so a stop during saving never leaves a truncated crawl. Next steps will compact link storage and stream the saved file and the data sent to the browser.

## 📊 New in 3.15: Google Analytics 4 — orphan pages that get traffic

Connect **Google Analytics 4** (API with a service account, or a CSV export of *Pages and screens*) to see the sessions of every page and catch what a crawl alone misses: **orphan pages that get visits** (campaign landing pages, old URLs, pages only in the sitemap), **error pages still visited**, non-indexable pages with traffic and pages nobody visits. New *Google Analytics* tab, 4 new checks, *GA4 sessions* in segments, CLI `--ga4-key` / `--ga4-csv` and AI-agent support.

## 🧩 New in 3.14: segments — audit a big site section by section

On a large site, one global score hides where the problems really are. **Segments** split the audit into named sections — product pages, categories, blog, a language, pages without traffic… — exactly like Screaming Frog segments.

- **Rules on any field**: path, URL, title, H1, meta description, status, indexability, click depth, word count, inlinks, Link Score, response time, sitemap, structured data type, language, Search Console clicks, and your **custom extractions** (`extract:Price`…). Text operators (contains, starts with, regex…), numbers (>, ≤…), true/false. Combine rules with AND / OR.
- **First match wins**, like Screaming Frog: order your segments, the rest goes to *No segment*. Live page counts while you edit.
- **One click to start**: *Create from directories* builds one segment per top-level folder (and goes one level deeper when a single folder holds the whole site, e.g. `/fr/`).
- **Applied after the crawl, no recrawl**: create, edit or reorder segments at any time. They are saved with the crawl and reused for the next crawls of the site. Import / export as JSON to share them across a team.
- **A global filter** in the sidebar: pick a segment and *every* page follows — dashboard, health score and pillars, SEO issues, action plan, all the tables, CSV exports and the PDF report — recomputed for that section with the exact same scoring method.
- **A segments table on the dashboard**: pages, health score, errors, warnings, indexability, average depth, words, Link Score, response time and main issues for each section. Click a row to filter the whole audit.
- **Each issue split by segment**, a *Segment* column in the tables and CSV, *Colour by segment* on the site map (the segment you filter on is highlighted, the rest stays as context).
- **CLI**: `--segments segments.json`, `--segment-folders`, `--segment blog`. **AI agents**: new `arachnide_segments` tool (get / suggest / set) and a `segment` parameter on summary, issues, action plan, page search and GEO readiness.

<p align="center">
  <img src="docs/screenshots/segments.png" alt="Segments: health score, errors and main issues per site section" width="100%">
</p>

## 🤝 New in 3.13: plug your own AI agent (Claude, ChatGPT…) into Arachnide

Arachnide becomes the eyes and hands of your SEO / GEO agent. The agent reads the audit you have open, starts crawls that appear live in the app, explores pages, gets the prioritised action plan and the new **GEO readiness** report, and fixes the site with your approval.

- **Three doors, 25 tools**: MCP over stdio (Claude Code, Claude Desktop), **MCP over HTTP** (`/mcp`, for claude.ai custom connectors and hosted agents) and **REST + OpenAPI 3.1** (`/api/agent/*`, `/openapi.json` — import it as a ChatGPT Action in one click). Same tools everywhere, defined once.
- **Access token** created at first start, shown and renewable in *Settings → AI agents*, with ready-to-paste snippets (Claude Desktop config, ChatGPT Action settings, test request), a public-URL field for tunnels (cloudflared, ngrok, Tailscale) and the log of the latest agent calls.
- **New tools**: `arachnide_action_plan` (the app's ordered plan, quick wins flagged), `arachnide_search_pages` (filter and sort pages by Link Score, depth, status, folder, issue), `arachnide_geo_readiness` (AI crawlers access, llms.txt, structured data, content depth → 0-100 score and recommendations), `arachnide_start_crawl` + `arachnide_crawl_status` (background crawl, visible live in the app). `crawl_id: "current"` always means the audit open in the app.
- Guide and suggested system prompt for an SEO / GEO agent: [docs/AGENTS.md](docs/AGENTS.md).

## 🎨 New in 3.12: a design pass across the whole app

A full UX, colour and typography audit of every page, in both themes, on desktop and mobile — then the fixes.

- **Real typography**: the Inter Variable font is now bundled (offline, SIL OFL licence), so every weight renders the same on every machine; 23 scattered text sizes became one 8-step scale, with consistent headings, radii and spacing.
- **Readable light theme**: every coloured text (warnings, OK states, links, muted labels, effort badges) now meets WCAG AA contrast (4.5:1) on the backgrounds it sits on — 103 measured failures brought to 0.
- **Smoother details**: the Fixes page now works on a crawl opened from a file; the page detail panel no longer lingers on pages without a table; the selected table row is marked cleanly; the theme button shows what it will do; the simulation switch is visible again.

## 🧭 New in 3.11: site map and 2D / 3D visualisation, side by side

- **Site map** (sidebar): the classic, Screaming Frog-style map — white background, horizontal tree, made for screenshots and client reports.
- **2D / 3D visualisation** (new tab, right below): the exploration view — dark style, radial layout, 2D or 3D, coloured by SEO issues by default.
- Both views share the same data, filters, search and page inspector; each remembers its own settings.

## 🌳 New in 3.10: a classic, screenshot-ready site map

A clearer site map you can show to a client or a manager as is — plus finer control of what you crawl and map.

<p align="center"><img src="docs/screenshots/viz-classic-tree.png" alt="Site map in the Classic style: horizontal crawl tree on a white background, one label per page, long lists summarised as “+ N more pages”" width="100%"></p>

- **Classic style (new default)**: white background, thin links, dark labels — in the spirit of Screaming Frog’s crawl tree. The *Dark* style is still one click away, in 2D and 3D.
- **Horizontal tree**: home page on the left, one column per level, one label per page. Long lists are summarised (“+ 28 more pages”, problems of hidden pages still flagged) and *Show the full list* expands them; the selected page always stays visible. In *Directories*, each folder shows its path relative to its parent, like a file explorer.
- **Client-ready exports**: the PNG / PDF now has a header (site, view, crawl date, pages shown), the legend and the context.
- **No invented URLs**: in *Directories*, a page such as `/en` now carries its `/en/` folder instead of a fake `/en/` URL appearing next to it; a folder with no page at its address is shown as a grouping (`/blog/page/*`).
- **URL include / exclude in the map**: one pattern per line — plain text (`/en/`), wildcard (`/en/*/page-*`) or regular expression (`/en/(.*)`). The *Folder* filter now works at any level (`/en/blog/`).
- **Crawl scope**: include / exclude accept one regex per line, and a new *Stay in the start folder* option crawls only below the start URL’s folder (like unticking “Crawl Outside of Start Folder” in Screaming Frog). CLI: repeat `--include` / `--exclude`, add `--stay-in-folder`.
- **Sturdier**: invalid start URLs (`htp:/x`, `javascript:…`, a bare number) are refused with a clear message, absurd numbers are brought back to safe limits, a crawl that cannot be saved now says so. New end-to-end and “monkey” tests drive the real interface in a browser (random clicks, garbage input, resizes) on every test run.

## 🕸️ New in 3.9: a faster, clearer site map

Explore the structure and spot the pages to improve — in 2D or 3D, on thousands of pages.

<p align="center"><img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Site map in 3D: crawl tree with labelled branches, selected page, discovery path and page inspector" width="100%"></p>

- **Three truly different views**: *Crawl tree* (each page under the page it was reached from on the shortest path from the home page — the path shown always matches the depth in clicks), *Directories* (URL paths, with virtual folders that are not counted as pages) and *Internal linking* (the real directed links, cycles included).
- **Page inspector**: status, indexability (only when known), depth, Link Score, source pages, outgoing links, discovery path, issues and the existing recommendation, with *Isolate the branch / neighbourhood*, *See internal links* and *See the action plan*.
- **Search, filters and analyses** on every crawled page (not only what is drawn): SEO issues, depth, directory, HTTP status, indexability, weak inbound linking with an explicit threshold, Link Score range — highlighted in context or isolated. Exports (PNG, PDF, CSV) keep the labels, legend and context; a *List* view gives keyboard access.
- **Much faster**: deterministic layout instead of a physics simulation for trees, all nodes and links drawn in a few batches, rendering only when something changes. Measured on the same machine (software rendering): 3D stabilisation from 5.5–13.9 s down to 0.7–3.2 s, 3D frame rate while rotating from 1–11 to 46–60 fps.

## 🗺️ New in 3.8: an action plan you can work from

Know what to fix, in which order, and how — and keep track of where you are.

<p align="center"><img src="docs/screenshots/action-plan.png" alt="Action plan: summary cards, prioritised roadmap with statuses and the action’s method panel" width="100%"></p>

- **Four cards**: actions left to handle (by severity), quick wins (low effort, medium or high impact), fixing effort and **Start here** — the first action of the recommended order.
- **Roadmap**: each issue becomes an action with a clear verb (“Shorten titles”, “Check nofollow links”), its rank, severity, SEO impact, unique URLs, effort and status. Filters (all, quick wins, to do, to check, other states), search, and a manual sort that clearly replaces the recommended order until you switch back.
- **Action panel**: why start here (facts from the crawl only), numbered method, a concrete “Done when…” criterion, see / export the URLs, a note, and **Start this action → Mark as done → Run the crawl again to validate**. Only a new crawl that no longer detects the issue marks it as resolved.
- **Tracking** (status and notes) is saved in your browser for each site, and multi-select lets you export the URLs of several actions or change their status at once.

## 🧭 New in 3.7: a clearer SEO issues page

From diagnosis to fixes on one screen: what was found, what to fix first, how serious it is, how many URLs it affects and how much effort it takes.

<p align="center"><img src="docs/screenshots/issues.png" alt="SEO issues page: summary cards, prioritised list and fix panel with a before / after example" width="100%"></p>

- **Summary cards**: issue types overall, errors, warnings and notices (never a sum of URLs). Click a card to filter the list.
- **Prioritised list**: severity tabs, search, and a sort selector (recommended priority by default, with its rule explained). Unique URLs per issue, effort shown separately from severity, pagination and keyboard navigation.
- **Fix panel**: why it matters, numbered steps, a before / after example taken from a real page (with a clearly labelled automatic suggestion for titles and descriptions that are too long), a preview of affected URLs, **See the N URLs** and **Export the list**.
- **Errors always come first** in the recommended priority, the action plan and the overview.
- Two columns on large screens, a dedicated detail view on mobile.

## 🌙 New in 3.6: dark dashboard redesign

The overview answers one question at a glance: how is my site doing, and what should I do next? (screenshot at the top of this page)

- **SEO health in four rings**: Technical, Content, Internal linking and Performance. Each arc is exactly the pillar score; click a ring to see the matching issues. A pillar without data is shown as “Not measured”.
- **Your priorities**: the top 3 actions, counted in unique pages, with a link to the action plan.
- **Key indicators**, **What works well** and **Your next goal**, plus a banner when the audit is partial.
- New sidebar (Steering / Explore), topbar with the crawl status and a “Run the crawl again” button, dark theme by default.

## ✨ New in 3.5: Fix in 1 click with Claude or ChatGPT

After a crawl, open the **Fix in 1 click** tab: issues are grouped by impact (pages × severity) and tagged **AI-fixable**, **Automatic** or **Manual**.

<p align="center"><img src="docs/screenshots/fix-issues.png" alt="Fix in 1 click: issues grouped by impact with AI / automatic / manual badges and cost estimate" width="100%"></p>

1. **Fix** one URL or **Fix all** for an issue type — Claude or ChatGPT writes titles, meta descriptions, H1, image alt texts and JSON-LD in the page’s language, from the page’s real content (the estimated cost is shown first). 301 redirects for internal 404s, canonicals, accidental noindex and links to redirects are computed without AI. Performance or hosting issues get a written action plan, never an “Apply” button.
2. **Review**: before / after side by side, character counter against the target length, inline edit, Approve / Regenerate / Ignore, multi-select.
3. **Apply** to WordPress (companion plugin) or to a code repository on GitHub (pull request — Lovable, Bolt.new, React, Next.js, Astro, HTML), or export CSV / JSON / PDF for any other CMS. **Simulation mode is on by default**: nothing is sent until you switch it off and accept the warning.
4. Each fixed URL is **re-crawled** (verified ✓), and the **Fix history** tab lets you undo one fix or a whole batch, and export the “Applied fixes” PDF.

<p align="center"><img src="docs/screenshots/fix-review.png" alt="Review panel: before / after, character counter, approve, regenerate, ignore" width="100%"></p>

**The AI never changes your site by itself**: it proposes, you approve, a connector applies, Arachnide checks — and every change can be undone.

### Set up

- **AI key** — *Options → AI*: choose Claude (Anthropic) or ChatGPT (OpenAI), paste your API key ([console.anthropic.com](https://console.anthropic.com/settings/keys) or [platform.openai.com](https://platform.openai.com/api-keys)), pick a model, click *Test the connection*. The key is stored encrypted on your computer only and sent only to that provider; you pay the provider directly.
- **WordPress** — in the *Fix* tab click the connection button → *WordPress* → *Download the WordPress plugin (.zip)*, then in WordPress *Plugins → Add New → Upload Plugin*. Create an **application password** in *Users → Profile → Application Passwords* (name it “Arachnide”, copy it), and enter the site address, username and that password in Arachnide. An Editor account is enough for content; Administrator for redirects. Works with Yoast SEO, Rank Math, SEOPress, All in One SEO and Redirection.
- **GitHub / Lovable** — create a **fine-grained token** in *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens*: *Only select repositories* (one repo), permissions *Contents: Read and write* and *Pull requests: Read and write*. Enter `owner/repo` and the token. Arachnide opens a pull request on `arachnide/fix-YYYYMMDD-HHMM` and shows the diff first; for Lovable, merging it into the default branch updates the project automatically.

How connectors work and how to add a CMS: [docs/CONNECTORS.md](docs/CONNECTORS.md).

<p align="center"><img src="docs/screenshots/fix-connection.png" alt="Connection dialog: WordPress, GitHub pull request or export" width="80%"></p>

## 🔎 New in 3.4: finishing the reliability work

- **JavaScript redirects** detected when rendering: treated as redirects, target crawled.
- **Links grouped by page and target**, with all their anchors, instead of one row per anchor.
- **Crawl comparison URL by URL**: "fixed" only when the URL was crawled again without the issue, with a warning when the two crawls are not comparable.
- **hreflang language versions crawled and checked**: errors, redirects and non-indexable targets reported.

## 🛡️ New in 3.3: reliability audit

A full audit (HTML extraction, crawl engine, SEO rules and crawls of 8 real sites) removed the false positives and false negatives that could mislead an SEO or GEO professional.

- **Bot-protected sites** (403 on the crawler's user agent): the crawl switches to Chrome automatically and tells you, instead of reporting every page as an error.
- **Rate limiting (429/503)**: Arachnide waits and retries; throttled pages are no longer counted as broken. External links to LinkedIn or Cloudflare-protected sites are "could not be checked", not "broken".
- **Directives read like Google**: `max-image-preview:none` is not a noindex, another bot's `X-Robots-Tag` is ignored, meta refresh is a redirect.
- **Content seen as it is**: SVG `<title>` ignored, `alt=""` is a decorative image, lazy-loaded images (`data-src`) analysed, word count for Chinese, Japanese and Thai.
- **International and structured data**: hreflang checked against real ISO codes, translations and paginated pages are not duplicates, only the schema.org properties Google requires.
- **A fairer health score**: one broken link in the menu no longer drops a site to 0, and a site blocking Googlebot no longer gets an A.
- **New checks**: soft 404, canonical outside `<head>`, sitemap on another host, URLs that could not be checked.

## 📈 New in 3.2: Google data & scheduled crawls

- **Core Web Vitals from real users** (PageSpeed Insights + CrUX: LCP, INP, CLS…) and Lighthouse score for your key pages.
- **Google Search Console**: clicks, impressions, CTR and position per URL, by API or CSV import. Also finds **pages Google sees but your links don't reach**, low-CTR pages and non-indexable pages with traffic.
- **Scheduled crawls** (daily / weekly / monthly) with **email alerts** when the score drops or errors appear, with the full report attached.

Setup in 5 minutes: **[docs/GOOGLE-AND-SCHEDULES.md](docs/GOOGLE-AND-SCHEDULES.md)**.

## 🤖 New in 3.0: Claude audits **and fixes** your site (MCP)

Arachnide now includes an **MCP server**. Plug it into Claude (Claude Code or Claude Desktop) and ask in plain words: *“Audit www.my-site.com and fix the titles, descriptions and missing alt texts of the most important pages.”* Claude will:

1. **detect** the CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop, static site, Next.js…);
2. **crawl and audit** the site with Arachnide;
3. **write** better values from the real content of each page (unique titles within Google's pixel limit, descriptions, alt texts, canonicals, redirects for broken URLs);
4. show you a **before / after preview** and wait for your approval;
5. **apply** the approved changes on the live site through the CMS API, **verify** them, and let you **undo** any batch;
6. **re-crawl** and show the score gain.

| How fixes are applied | Platforms | Share of all websites* |
|---|---|---:|
| CMS API (+ small WordPress plugin) | WordPress, Shopify, Wix, Joomla, Webflow, Drupal, PrestaShop | ≈ 53% |
| HTML files or Cloudflare Worker | sites without CMS (custom, static, Next.js, Hugo…) and any site behind Cloudflare | up to 31.6% |
| Step-by-step instructions | Squarespace and other closed builders | the rest |

<sub>* W3Techs, October 2026.</sub>

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

Safety first: preview before every write, permission prompt for each write, per-site policy (allowed fields, batch size, read-only), a journal of every previous value with one-call rollback, and secrets that never pass through the chat. **Full guide: [docs/MCP.md](docs/MCP.md)**.

## 🆕 What's new in 2.1

| | |
|---|---|
| 🕸️ **2D & 3D visualisations** | See the site's architecture in 2D or 3D, in three views: **crawl tree** (shortest click path from the homepage), **directory tree** (URL structure) and **link graph** (every followed internal link). Colour the nodes by indexability, SEO issues or depth; node size shows the Link Score. Click a node to see the page's details, and export the view as PNG for your reports. |
| ⚙️ **Crawler configuration, like Screaming Frog** | A **Configuration** window with tabs: Spider, **Limits**, **Speed**, **robots.txt**, Rendering, Include / exclude, Extraction, Authentication. It keeps only the settings that matter. |
| 🚧 **Spider › Limits** | Crawl total, crawl depth, URLs per depth, folder depth, number of query strings, redirects to follow, URL length, links per page, page size, and **limits by URL path** (`/blog/ = 200`). The dashboard shows how many URLs each limit skipped. |
| 🤖 **robots.txt** | Three modes: **respect**, **ignore but report** (crawl blocked URLs and still flag them) and **ignore**. Paste a **custom robots.txt** to test a new file before you publish it, and use the built-in **tester** to see whether a URL is allowed and which rule applies. |
| 🐢 **Speed** | Max threads plus a global **max URLs per second** cap, to protect fragile servers. |
| 🧲 **Custom extraction** | Collect any data from every page with a CSS selector or a regex: price, author, date, SKU, tracking code… It appears in an **Extraction** tab and the CSV export. |
| 🔐 **Authentication & URL cleaning** | HTTP authentication and custom headers or cookies for staging sites. They are only sent to the audited site, and the password is never saved. **Remove URL parameters** such as `utm_*`, `gclid` or `fbclid` to avoid duplicate URLs. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="3D crawl tree coloured by SEO issues" width="100%">
</p>

## ✨ What's new in 2.0

| | |
|---|---|
| 🌍 **6 languages** | The app, the CSV exports and the reports are available in English, French, German, Spanish, Italian and Portuguese, with a language switcher in the header. |
| ⚙️ **JavaScript rendering** | Audits React, Vue, Angular and Next.js sites the way Google sees them. Arachnide uses the Chrome or Edge already installed on your computer, so nothing else is downloaded. It compares raw HTML with the rendered page and measures **LCP and CLS**. |
| 📄 **Pro SEO reports** | A white-label audit report with your logo, colour and contact details. It contains an executive summary, key findings, scores by category, a prioritised action plan, a detailed analysis and **progress since the last audit**. Print it to PDF in one click. [See a sample report (PDF)](docs/sample-report.pdf). |
| 🎯 **Action plan** | Every issue is ranked by severity × impact × number of URLs ÷ effort, and quick wins are highlighted. |
| 🧠 **New SEO insights** | Internal PageRank (Link Score), near-duplicate content (simhash), keyword cannibalisation, title and description width in pixels, contextual links vs menu and footer links, generic anchors, heading hierarchy, incomplete structured data, hreflang validation, compression, HSTS and more. |
| 🤖 **AI & GEO** | Shows whether ChatGPT, Claude, Perplexity, Google-Extended and other AI crawlers can access the site, and whether it has an `llms.txt` file. |
| 📋 **List mode** | Audit only a list of URLs you paste in, without following links. |
| 🔎 **Custom search** | Find every page that contains a text or a regex, such as an old phone number or a tracking code. |
| 🎨 **New design** | Home screen with recent crawls, live progress with speed and time remaining, a resizable detail pane, keyboard navigation (↑ ↓ Enter, `/` to search), notifications, and dark mode. |

## 🔍 Everything Arachnide checks

| Area | Checks |
|---|---|
| **Response codes** | 2xx / 3xx / 4xx / 5xx, timeouts, URLs blocked by robots.txt, broken internal and external links |
| **Redirects** | Chains, loops, temporary 302/307 redirects, meta refresh, redirects to the homepage (soft 404), internal links pointing to redirects |
| **Titles & metas** | Missing, duplicate, too long (in pixels), too short or multiple; title identical to H1; Google SERP preview |
| **Headings** | H1 missing, duplicate or multiple; no H2; skipped heading levels |
| **Content** | Word count, thin content, exact and near duplicates, keyword cannibalisation, main keyword per page, text ratio |
| **Images** | Missing alt text, heavy images, broken images, missing width/height (CLS), every `srcset` and `<picture>` file checked (size, status, format), no responsive version, no WebP / AVIF, `srcset` without `sizes` |
| **Indexing** | Canonicals (missing, multiple, pointing to a non-indexable URL), noindex, nofollow, X-Robots-Tag |
| **Architecture** | Click depth, Link Score (internal PageRank), orphan pages, pages with a single inlink or no contextual link, unreachable pages |
| **Sitemaps** | Missing sitemap, non-indexable URLs in the sitemap, indexable pages missing from the sitemap |
| **International** | Invalid hreflang codes, missing return links, missing self-reference, missing x-default |
| **Structured data** | Types found (JSON-LD, microdata), invalid JSON-LD, properties missing for rich results (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Content, links, title, H1, canonical or noindex changed by JavaScript; JS errors; LCP and CLS |
| **Performance & security** | Response time, HTML size, compression, HTTPS, HSTS, mixed content |
| **URLs** | Uppercase letters, underscores, parameters, accents, length |
| **AI & GEO** | Access for Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…; llms.txt |

## 📸 Screenshots

| Issues with fixes | Prioritised action plan |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Issue list with explanation, impact, effort and fix"> | <img src="docs/screenshots/action-plan.png" alt="Action plan with quick wins"> |
| **Google SERP preview (pixel width)** | **Internal linking, Link Score & inlinks** |
| <img src="docs/screenshots/titles-serp.png" alt="Titles tab with Google preview and pixel meters"> | <img src="docs/screenshots/internal-linking.png" alt="Internal linking tab with Link Score and inlinks panel"> |
| **White-label report settings** | **Professional audit report** |
| <img src="docs/screenshots/report-dialog.png" alt="Report dialog with logo, colour, client and comparison"> | <img src="docs/screenshots/report.png" alt="Executive summary of the audit report"> |
| **Crawl tree (2D)** | **Link graph (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="2D crawl tree"> | <img src="docs/screenshots/viz-link-graph.png" alt="Force-directed internal link graph"> |
| **Directory tree** | **Custom extraction** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Directory tree visualisation"> | <img src="docs/screenshots/custom-extraction.png" alt="Extraction tab with prices extracted by CSS selector"> |
| **Configuration › Limits** | **Configuration › robots.txt (with tester)** |
| <img src="docs/screenshots/config-limits.png" alt="Spider limits settings"> | <img src="docs/screenshots/config-robots.png" alt="robots.txt modes, custom robots.txt and tester"> |
| **Home screen** | **Dark mode** |
| <img src="docs/screenshots/home.png" alt="Home screen with recent crawls"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard on a tablet"> |

## 🚀 Installation

### 1. Install Node.js

Download the **LTS** version from **[nodejs.org](https://nodejs.org)** and install it like any other program. You need version 18.17 or newer; the latest LTS is recommended. To check your version, open a terminal and type `node -v`.

For **JavaScript rendering**, you also need Google Chrome, Microsoft Edge, Chromium or Brave installed. Arachnide finds the browser automatically.

### 2. Download Arachnide

- **Easiest:** click the green **`<> Code`** button at the top of this page, then **Download ZIP**, and unzip the file.
- **With Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Start it

**Option A: double-click.** The launcher installs or updates everything, then opens your browser.

| System | File to double-click |
|---|---|
| macOS | `start-mac.command`. The first time, right-click it and choose **Open**, because macOS blocks unsigned scripts. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Option B: terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Then open **http://localhost:4000**. Type a website address and click **Crawl**.

Keep the terminal window open while you use the app, and press `Ctrl + C` to stop it. If port 4000 is busy, Arachnide picks the next free port and shows it in the terminal.

**Updating from 1.x:** download the new version (or run `git pull`), then run `npm install` again. The double-click launchers do this for you.

## 📄 Creating a client report

1. Crawl the website.
2. Click **Report**. Choose the report language, then add your logo, brand colour, client name and contact details. Your settings are remembered.
3. Optionally, pick a **previous crawl of the same site** to show its progress: score change, issues fixed and new issues.
4. Click **Generate report**, then **Print / Save as PDF**.

Use **All issues (CSV)** to give your client or developer the full list of URLs to fix.

## ⚙️ Configuration

Click **⚙ Options** to open the **Configuration** window. Your settings are remembered, except the password.

| Tab | Settings |
|---|---|
| Spider | Read XML sitemaps, follow canonicals, include subdomains, check external links and images |
| Limits | Crawl total, crawl depth, URLs per depth, folder depth, query strings, redirects to follow, URL length, links per page, page size, limits by URL path (`/blog/ = 200`, one per line) |
| Speed | Max threads, max URLs per second, timeout |
| robots.txt | Respect / ignore but report / ignore, custom robots.txt, URL tester |
| Rendering | JavaScript rendering, user-agent (Arachnide, Googlebot desktop/smartphone, Chrome), Accept-Language |
| Include / exclude | Include / exclude regex, remove URL parameters (`utm_*, gclid`), ignore all parameters, custom search |
| Extraction | Up to 20 extractors: CSS selector (text, attribute, HTML or count) or regex |
| Authentication | HTTP user and password, custom headers (cookies, tokens) |

Use the **Website / List** switch next to the address field to crawl a whole site or only a list of URLs.

## 🕸️ Visualisations

Open **Visualisations** in the sidebar after a crawl:

- **Crawl tree:** each page is linked to the page that led to it at the previous click depth. Long branches mean deep pages.
- **Directories:** the URL structure folder by folder. It shows unbalanced or overly deep sections.
- **Links:** the full internal link graph. Well-linked pages gather in the centre, and isolated pages drift to the edge.

Switch between **2D** and **3D**, colour by indexability, issues or depth, choose how many nodes to show (up to 6,000), click a node to open its details, and export a PNG for your reports.

## 🖥️ Command line

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang en
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs --sitemap https://www.example.com/sitemap.xml --extract "price=.price" --extract "sku=xpath://meta[@itemprop='sku']/@content" --csv
npm run bench -- --pages 200000
node src/cli.mjs https://www.example.com --report --compare crawls/previous.jsonl.gz
node src/cli.mjs --resume crawls/.en-cours/www.example.com_2026-10-21T09-00-00.ndjson --csv
node src/cli.mjs https://www.example.com --max 20000 --segments segments.json --csv --report
node src/cli.mjs https://www.example.com --ga4-key ga4-key.json --ga4-property 123456789 --csv
node src/cli.mjs https://www.example.com --logs access.log --logs access.log.1.gz --logs-verify --csv --report
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --sitemap-previous crawls/previous.jsonl.gz --csv
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

The CLI prints the score and the issues in your language. It saves the crawl as JSON, which you can open in the interface with **📂**. With `--csv` it also exports pages and issues, and with `--report` it writes a branded HTML audit report that you can print to PDF.

## 🛠️ Troubleshooting

| Message | Fix |
|---|---|
| `cd: no such file or directory` | You are not in the right folder. Use `cd` followed by the path of the unzipped folder, e.g. `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Same cause: run `npm install` **inside** the Arachnide folder. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Your shell sets an option your Node version doesn't support. Run `unset NODE_OPTIONS` (macOS/Linux), or update Node.js to the latest LTS. |
| JavaScript rendering is unavailable | Install Google Chrome. If it is installed in an unusual location, start Arachnide with `CHROME_PATH="/path/to/chrome" npm start`. |
| Some pages show no H1 or no content | The site probably builds its content with JavaScript. Enable **JavaScript rendering** in the options. |

## 🧪 Development

```bash
npm test
```

The tests crawl a small local website with deliberate SEO mistakes (`test/fixture-site.mjs`). They cover JavaScript rendering, list mode, the reports in every language and translation completeness. They run on Node 18, 20 and 22 through GitHub Actions.

```
src/
  crawler.mjs    crawl engine (queue, concurrency, robots.txt, sitemaps, redirects, list mode)
  renderer.mjs   JavaScript rendering with the installed Chrome / Edge (puppeteer-core)
  parse.mjs      HTML extraction (titles, metas, headings, links, images, schema, hreflang…)
  analyze.mjs    link graph, click depth, Link Score, duplicates, cannibalisation, SEO checks
  text.mjs       keywords, multilingual stop words, simhash
  pixel.mjs      title and description width in pixels
  options.mjs    validation of the crawl configuration (UI and CLI)
  server.mjs     local web server and API with live updates
  cli.mjs        command-line interface
public/
  app.js         web interface (no framework)
  viz.js         2D / 3D visualisations (force-graph, 3d-force-graph, served locally)
  i18n/*.js      translations (en, fr, de, es, it, pt)
  shared/        report generator, crawl comparison, robots.txt parser, i18n, icons (used by the UI and the CLI)
```

**Adding a language:** copy `public/i18n/en.js`, translate the values and add the language to `LANGS` in `public/shared/i18n.js`. `npm test` checks that no key or placeholder is missing.

## 🗺️ Roadmap

- [ ] PageSpeed Insights / CrUX field data
- [ ] Google Search Console integration (clicks and impressions per URL)
- [ ] Scheduled crawls with email alerts
- [ ] Import of a Google Search Console CSV export (GSC-only orphan pages)
- [x] Custom extraction (2.1)
- [x] 2D / 3D site architecture visualisations (2.1)

Suggestions and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Responsible use

Only crawl websites you own or are allowed to audit. On client websites, keep 2 to 5 simultaneous requests, and add a pause on shared hosting. The interface listens only on your computer (`127.0.0.1`).

---

## 🙏 Thanks

Arachnide would not be what it is without the people who took the time to test it, challenge it and cheer it on, most of them on X:

- [@Loran750](https://x.com/Loran750), for an incredible amount of help, far beyond anything I could have hoped for even in my wildest dreams, and for keeping me motivated all along.
- [@mrgris](https://x.com/mrgris), for the recommendations on image checks and for so much motivation throughout this project.
- [@Mar1e](https://x.com/Mar1e), for the recommendation to integrate Google Analytics 4.
- [@effi_10](https://x.com/effi_10), for the recommendations on segmentation.
- [@EmelineRoblot](https://x.com/EmelineRoblot), for the challenge she set me: crawling more than a million pages without a crash.
- And of course my children, Oliver and Alberto, by far my finest creation and my greatest pride.

## 👤 Author

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p>Freelance <b>SEO consultant</b> and French teacher based in <b>Madrid</b> 🇪🇸🇫🇷.<br>
      I built Arachnide for my own technical SEO audits, and I share it freely with the SEO community.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — SEO audits & consulting<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — French courses and DELF / DALF / TCF prep
      </p>
      <p><b>Need a full SEO audit, or help fixing the issues Arachnide found?</b> <a href="https://thierrygustin.com/contact">Get in touch →</a></p>
    </td>
  </tr>
</table>

If Arachnide saves you time, a ⭐ on GitHub helps a lot!

## 📄 License

[MIT](LICENSE) © 2026 Thierry Gustin. You are free to use, modify and share it, including for commercial work.

<sub>Arachnide is an independent project, not affiliated with Screaming Frog Ltd. “Screaming Frog” is a trademark of its owner.</sub>
