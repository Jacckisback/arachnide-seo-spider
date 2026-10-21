# Changelog

## 3.17.0 — 2026-10-21

### Scale, step 2: a compact link graph — 14 bytes per link instead of an object
Second step of the 200 000-page work. Until now each link was a JavaScript object with seven properties and two URL strings, copied by the analysis into three `Map`s of `Set`s of strings and then into an array of tuples. Measured on 50 000 pages × 100 links: 690 MB of heap for the links alone and 29 s of analysis in 2.5 GB.
- **`src/graph.mjs`** (no dependency): `Interner` (a URL or an anchor text = one integer, assigned at first sight — « Contact » in the menu is stored once, not 200 000 times), `LinkStore` (links in typed-array columns `from`, `to`, `anchor`, `flags`, `pos`, doubling when full; an iterator still produces link objects on the fly for code that reads them one by one), `csr()` (compressed sparse row graph built in two passes from the columns plus the canonical / redirect edges added by the analysis, with optional node renumbering and per-row de-duplication), `uniqueCounts()` (distinct inlinks without a `Set`, one stamp buffer) and `pageRankCsr()`.
- **Crawler**: links go straight into the `LinkStore`; images and external links count their pages with a counter and the last page seen instead of a `Set` per entry (pages are processed one by one), alt texts capped at 5 distinct values.
- **Analysis on the CSR graph**: inlinks, unique inlinks, content inlinks, click depth (level by level, redirects at zero cost), path parent, PageRank (same result as the object version, unit-tested) and the broken / generic-anchor / nofollow link checks all read the columns. No object per link anywhere.
- **Saved format**: `links` is now columnar — `{ urls, anchors, from, to, anchor, flags, pos }` — nothing to convert at save time. `public/shared/links.js` (`forEachLink`, `linkCount`, `linkUrls`) reads both this format and the tuple format of 3.16 and earlier, so old crawl files still open; the app, segments and fix rules use it.
- **Measured** (synthetic site, 100 links per page): 50 000 pages — link storage 690 MB → 55 MB of heap, analysis 29.2 s / 2.5 GB → 5.5 s / 647 MB, identical inlinks and Link Scores. 200 000 pages / 20 million links — storage 142 MB, analysis 35 s in 2.3 GB (it completes; 3.16 could not). The remaining wall is the single `JSON.stringify` of the result (*Invalid string length* at that size): that is step 3.
- **Review rule, enforced by a test**: never `...array` as a call argument when the array size depends on the site (`test/scale.test.mjs` greps `src/` and `public/` and lists the few bounded exceptions); the remaining spreads in connectors and the live page stream became loops.
- **Tests**: `Interner` / `LinkStore` growth and iterator, CSR neighbours, de-duplication, unique counts, PageRank parity, both link formats, graph parity of the analysis (inlinks, uniques, content, depth through a redirect, path parent), Link Score on 150 000 URLs.

## 3.16.0 — 2026-10-21

### Scale, step 1: no more crash at 125 000 URLs, no more quadratic loops
From a technical review of 3.15 on a 200 000-page crawl: the crawl engine itself scales, but a few data-handling lines broke or slowed down between 70 000 and 130 000 pages. This release is the first of several steps (the next ones compact the link storage, stream the saved file and the data sent to the browser). Fourteen small fixes, no new dependency, no architecture change.
- **Call stack**: `Math.min(...logs)` / `Math.max(...logs)` on one value per URL (Link Score) raised *Maximum call stack size exceeded* beyond ~125 000 URLs — the crawl was lost at the very end, after hours. Replaced by one loop over a `Float64Array`. Same fix for `fixes.push(...deterministicFixes())` (an issue touching 125 000+ URLs, e.g. missing canonicals), `toFetch.push(...pages)` (very long sitemap indexes) and `Math.max(200, ...nodes)` in the 3D view (the *isolate* branch has no node cap).
- **Quadratic loops removed**: duplicate check in the fix jobs (`jobs.some()` → `Set`: 4.4 s at 40 000 items before, ~110 s extrapolated at 200 000); example values given to the AI (`siblingValues()` scanned every page for every job and always returned the first 30 pages of the crawl → computed once per fix kind, **pages of the same folder first**); links to redirects (`indexOf` + full edge scan per URL → URL→index `Map` and outgoing-link index built once); redirections (`find()` per link → `Map`); closest URL for 404s (path words of every candidate recomputed for every 404 → `prepareCandidates()` once, **parent folder searched first**, full search only when needed; same results).
- **Interface**: table sort used `localeCompare(y, locale, { numeric: true })`, which builds a comparator at every comparison (measured 24 s per sort on 200 000 rows) → one `Intl.Collator` per language (1.1 s). Folder list of the site map crossed every page with every folder (717 ms at 80 000 pages, at every render) → prefix counting in one pass (144 ms).
- **Memory**: a finished crawl job (interface or agent, up to 50 kept) no longer holds its crawler nor its full result, only a digest (meta, summary, top issues); the full crawl lives once, in the open result. Same in the stdio MCP server.
- **Storage**: crawl files and the history index are written to a temporary file then renamed (`writeAtomic`): a stop during a multi-second write of a large JSON can no longer leave a truncated crawl. An unreadable crawl file is reported in the console (`Crawl illisible…`) and marked in the history instead of silently becoming `{}`; an unreadable index is reported and rebuilt.
- **Tests**: `test/scale.test.mjs` — Link Score and deterministic fixes on 140 000 URLs (fails on 3.15 with the call-stack error), prepared candidates vs full search, link/redirect indexes, atomic write, folder counts vs the old cross product.

## 3.15.0 — 2026-10-20

### New: Google Analytics 4 — orphan pages that get traffic
Suggested by an SEO professional after 3.14: Search Console only sees pages that show up in Google; GA4 sees every visit (direct, email, social, ads, search).
- **Connection**: GA4 Data API with a service account (the Search Console one works once it is a Viewer of the property), property auto-detected from the site's web data stream (Admin API) or given as an ID (`123456789`, `properties/…` or a GA4 URL); or **import of a GA4 CSV export** (*Pages and screens* or *Landing page*; `#` comment lines, the 6 interface languages, `,` `;` or tab separators, paths or full URLs). Period up to 730 days.
- **Matching**: host + path rows are tied to crawled URLs (trailing slash and query variants added up); other hosts and `(not set)` are ignored. Each page gets `ga4 = { sessions, views, users, engaged }`; pages seen only in GA4 go to `ga4Only`.
- **4 new checks**: *Orphan pages that get traffic* (sessions but no internal link: missing from the crawl, or reached only through the sitemap / Search Console), *Pages in error that still get traffic* (4xx / 5xx with sessions), *Non-indexable pages that get traffic*, *Indexable pages with no sessions*. Each has its action-plan title and fix steps.
- **Google Analytics tab** (sessions, views, users, engagement rate, in crawl, inlinks, status, indexability) with filters: with sessions, orphans with traffic, no sessions, errors with traffic, non-indexable with traffic. Settings → Google: key file, property ID, period, CSV import.
- **Segments**: new rule field *GA4 sessions*; GA4 orphans belong to their segment; sessions column in the Segments card.
- **Orphan URLs outside the crawl** (`gsc-orphan`, `ga4-orphan`) now count as pages, not as a site-wide issue: the issues page shows their URL count, they are split by segment and weigh in the score by share of pages (shared `issueShare`).
- **CLI**: `--ga4-key`, `--ga4-property`, `--ga4-days`, `--ga4-csv`; sessions and views columns in `pages.csv`. **AI agents**: `ga4_key_file`, `ga4_property`, `ga4_csv` on the crawl tools, `google_analytics` in the summary, sessions in page search (sortable).
- **Tests**: `test/ga4.test.mjs` — property IDs, CSV variants, API token scope / property discovery / pagination / errors, matching and the 4 checks on the fixture site, segments, failure without stopping the crawl.

## 3.14.0 — 2026-10-20

### New: segments — audit a big site section by section
Requested by SEO professionals working on large sites: without segmentation, the audit of a 50 000-page e-commerce site is one score and one list. Segments work like Screaming Frog's.
- **Engine** (`public/shared/segments.js`, shared by the app, the server, the CLI and the agent tools): named segments with rules on 20 fields (path, URL, title, H1, meta description, content type, indexability, indexable, HTTP status, click depth, words, unique inlinks, Link Score, response time, in sitemap, HTML, structured data type, language, canonical, Search Console clicks) plus custom extractions (`extract:<name>`); text (contains, equals, starts / ends with, regex, empty…), number (=, ≠, >, ≥, <, ≤, empty) and boolean operators; AND / OR. **A page belongs to the first matching segment** (order matters), the rest goes to *No segment*. Invalid regexes are read as plain text and reported, never blocking. Up to 50 segments × 20 rules.
- **Slicing**: `sliceResult()` cuts a crawl to one segment — pages, page-level issues and their URLs, redirects, broken links, duplicates, images, external links, GSC-only URLs — and recomputes the summary (health score, pillars, category scores, counters) with **exactly the engine's scoring method** (unit-tested: recomputing the full crawl gives the engine's summary). Site-level issues (robots.txt, HTTPS, sitemap…) apply to every segment.
- **Applied after the crawl, without recrawling**; saved with the crawl (`meta.segments`, `p.segment`, `summary.segments`), remembered per site in the browser and sent with the next crawls of the site. `POST /api/segments` saves them on the open crawl and rewrites its file (also when the crawl was reopened from the history).
- **UI**: global segment filter in the sidebar (counts per segment) with a banner on every page; the whole app follows the filter (dashboard, score and pillars, issues, action plan, every table, CSV exports, PDF report). Segment manager: colour, name, AND / OR, rules with typed operators and values, reorder, delete, live page counts, *Create from directories* (one segment per top-level folder, one level deeper when one folder holds the whole site), JSON import / export. Dashboard **Segments** card (pages, share, score, errors, warnings, indexable %, average depth, words, Link Score, response time, top issues — click a row to filter, click an issue to open it in that segment), or a short invitation on sites of 30+ pages. Issue detail: **breakdown by segment** (stacked bar + chips that filter). *Segment* column in the page tables, the affected-URLs list and the CSV exports; segment in the page detail panel. Site map and 2D / 3D view: **Colour by segment** with legend, and the active segment highlighted over the whole site. 6 languages.
- **PDF report**: segment named on the cover when the report is for one segment; a **Results by segment** section otherwise.
- **CLI**: `--segments FILE` (JSON exported from the app or written by hand, see `docs/segments.example.json`), `--segment-folders`, `--segment ID` (summary, CSV and report on one segment; the JSON keeps the full crawl); per-segment table in the console; *Segment* column in `pages.csv` and `issues.csv`.
- **AI agents (MCP / REST)**: new tool `arachnide_segments` (`get` stats per segment, `suggest` from directories, `set` — saved with the crawl and pushed live to the app); `segment` parameter on `arachnide_get_summary`, `arachnide_list_issues`, `arachnide_get_issue`, `arachnide_action_plan`, `arachnide_search_pages`, `arachnide_geo_readiness`; `segments` option on `arachnide_crawl` / `arachnide_start_crawl`; the summary lists the segments. 25 tools.
- **Tests**: `test/segments.test.mjs` — score parity with the engine, normalisation, every operator family and rule order, slicing invariants (pages, issues, site issues, summary), folder suggestions, crawl option, report, server API and agent tools end to end.

## 3.13.0 — 2026-10-19

### New: an agent bridge — drive Arachnide from your own AI agent
- **One tool registry, three transports** (`src/agent/tools.mjs`): the 24 tools are defined once and served over MCP stdio (`src/mcp.mjs`, unchanged for Claude Code / Claude Desktop), **MCP Streamable HTTP** (`POST /mcp`, stateless JSON responses, for claude.ai custom connectors, remote Claude Desktop servers and hosted agents) and **REST** (`POST /api/agent/<tool>`, JSON in / JSON out, Zod-validated with field-level 400 errors) described by an **OpenAPI 3.1** document (`GET /openapi.json`, with `x-openai-isConsequential` on write tools, importable as a ChatGPT Action).
- **Access token**: generated at first start in `~/.arachnide/agent.json` (0600), overridable with `ARACHNIDE_AGENT_TOKEN`; accepted as `Authorization: Bearer` or `X-API-Key`; constant-time comparison; 240 requests / min / IP; CORS for browser-based MCP clients; `/api/agent/settings` (token, URLs, log, public URL, enable switch, rotation) answers only to the local interface.
- **Shared state with the app**: `crawl_id: "current"` = the crawl open in the interface; `arachnide_start_crawl` runs the crawl in the app's engine (live progress in the UI, toast "an AI agent started a crawl"), `arachnide_crawl_status` polls it; a synchronous `arachnide_crawl` adopts its result as the current audit; every agent call is logged (last 50) and pushed to the UI over SSE.
- **New tools**: `arachnide_action_plan` (ordered plan with quick wins, same ranking as the Action plan page), `arachnide_search_pages` (query / folder / status / indexability / depth / issue filters, sort by Link Score, depth, inlinks, words, paginated compact rows), `arachnide_geo_readiness` (AI crawlers allowed/blocked from robots.txt, llms.txt, structured-data coverage and answer-oriented types, content depth and thin pages, duplicates, titles/descriptions/H1/Open Graph hygiene → 0-100 score by part and ordered recommendations), `arachnide_start_crawl` / `arachnide_crawl_status`. `arachnide_crawl` gains `stay_in_folder`, multi-line `include` / `exclude`, inline `gsc_csv`.
- **UI**: Settings → **AI agents** pane: enable switch, masked token with show / copy / renew, MCP and OpenAPI URLs, public URL field (tunnels), one-click snippets (Claude Desktop config, ChatGPT Action settings, curl test), link to the guide, live log of the latest agent calls. 6 languages.
- **Docs**: `docs/AGENTS.md` / `docs/AGENTS.fr.md` — the three doors, setup for Claude Desktop / Claude Code, claude.ai connectors (with cloudflared / ngrok / Tailscale), ChatGPT Actions and OpenAI agents, the tool table, a suggested system prompt for an SEO / GEO agent, the security model and curl examples.
- **Tests**: `test/agent.test.mjs` — token and settings protection, OpenAPI shape, REST auth (401 / 400 / 404), background crawl started by an agent and shared with the app, new tools, MCP over HTTP with the official client, log, rotation, disable switch, public URL; `geoReadiness` unit test. The stdio MCP end-to-end test still passes on the shared registry.

## 3.12.0 — 2026-10-18

Design audit of the whole interface (every page, dark and light themes, 1440 px and 390 px), measured with real contrast ratios, then fixed.

### Typography
- **Inter Variable bundled** (`public/fonts`, latin + latin-ext, upright and italic, SIL OFL 1.1). The stylesheet named Inter but never loaded it, so most machines rendered a system font and the intermediate weights (550 / 650 / 750) did not exist. Weights are now 400 / 500 / 600 / 700 / 800 on a variable font, with the `cv11` / `ss01` features and a preload of the main file.
- One type scale (`--fs-xs` … `--fs-hero`, 8 steps) replaces 23 distinct sizes; page titles share one size (`--fs-h1`), section titles another (`--fs-h2`); eyebrow letter-spacing unified; `h1`–`h4` get a shared line-height and wrapping rule.
- Radii reduced to a 4-step scale (`--r-sm` / `--r-md` / `--r-lg` / `--r-xl`), applied to buttons, inputs, cards and dialogs.

### Colour & contrast
- Light theme palette rebuilt so that every text colour reaches ≥ 4.5:1 on every background it is used on (page, card, secondary card, soft badge backgrounds): `--muted`, `--accent`, `--err`, `--warn`, `--ok`, `--info` darkened; effort colours (`--eff-lo` / `--eff-mid` / `--eff-hi`) and Core Web Vitals colours become theme tokens instead of dark-only hex values (they were 1.5:1 on white).
- Dark theme: white text on warning / OK badges replaced by the ink colour (it was 1.7:1); tooltip, CWV, switch and warning fallbacks now use tokens.
- Measured with an in-browser WCAG script over all pages: 103 failing text elements in the light theme → 0 (the 3 remaining hits are false positives on the dark visualisation stage).

### UX fixes found by the audit
- **Fixes tab on an imported crawl** showed a raw English “No crawl loaded”: a crawl opened from a file is now also sent to the server (`POST /api/result`), so Fixes, comparisons and the MCP tools work on what the user is looking at; error keys are translated.
- The page detail panel stayed open on pages without a table (Robots, dashboard…); it now hides there and comes back with its selection on table pages.
- Selected table row: the accent marker is painted on the first cell (the row box-shadow drew a full-width line in Chrome).
- Theme button shows a sun in dark mode and a moon in light mode (it always showed a moon); duplicate icon removed.
- Simulation switch on the Fixes page was an invisible checkbox with its label cut off; banners wrap on narrow widths.
- Dashboard card headers wrap on mobile instead of breaking the title word by word; buttons have a visible hover background; `.woff2` files are served with the right MIME type.

## 3.11.0 — 2026-10-16

- **Two map tabs**: *Site map* is now the classic, Screaming Frog-style map only (white background, horizontal tree, 2D; the style / layout / 3D switches are gone from it). The 3.9 exploration view is back as its own tab, **2D / 3D visualisation**, right below *Site map* in the sidebar: dark style, radial layout, 2D or 3D, coloured by SEO issues by default. Both tabs share the data, filters, search and inspector, and remember their own settings.
- Tests: the end-to-end test covers both tabs in every mode; UI tests no longer mistake the app's own confirmation dialogs for injected scripts.

## 3.10.0 — 2026-10-16

Based on user feedback: the 3.9 map was judged “accurate but too futuristic, less readable than before”, the main use being screenshots for clients and managers.

### Site map
- **Classic style, now the default**: white background, thin grey links, dark labels with a white halo, sober palette tuned for a white background (depth, issues, status, indexability, directory). The *Dark* style remains available in 2D and 3D; the choice is remembered.
- **Horizontal tree layout** (2D, crawl tree and directories), in the spirit of Screaming Frog’s crawl tree: home on the left, one column per level, one row per leaf, curved links, one label per node as soon as rows are readable (≥ 12 px). Long sibling lists keep their 9 biggest branches and summarise the rest in a “+ N more pages” node that keeps the most serious issue of what it hides; *Show the full list* expands it; the selected page and its path are always kept. The radial layout is still available.
- **Labels**: URL labels are shortened in the middle (`/catalogue/…/fiction_10/index.html`) and never overflow into the next column; counters (“· 21 pages”) are always kept. In *Directories*, labels are relative to the parent folder (file-explorer style). Framing leaves room for the legend and the labels.
- **Exports** (PNG / PDF): header with the view, site, crawl date and pages shown; legend and context in the footer; colours follow the chosen style.
- **Fixed — URLs that were never crawled in *Directories***: a page `/en` (no trailing slash) now carries the `/en/` folder instead of appearing next to a fake `/en/` node; a folder with no page at its own address is labelled as a grouping (`/blog/page/*`) and explained as such. First-level directory grouping and colours treat `/en` as part of `/en/`.
- **Filters**: *Folder* now lists folders at every level with their page count and matches `/en` as part of `/en/`; new **URLs to include / to exclude** fields (one pattern per line: text, `*` wildcard or regular expression; an invalid regex is read as plain text and flagged, never blocks the map).
- **Fixed**: editing a filter field then clicking elsewhere could throw a DOM error (render during blur); numeric filter values are clamped (0–100).

### Crawler
- `include` / `exclude`: one regular expression per line (UI textarea, repeatable `--include` / `--exclude` in the CLI); each line is validated; an invalid line found at crawl time is ignored and reported as a warning.
- New **Stay in the start folder** option (`stayInFolder`, `--stay-in-folder`): only URLs below the start URL’s folder are crawled.
- The start URL (and list-mode URLs) is always crawled even when it doesn’t match the include patterns; URLs left out by the scope are counted (“out of scope”).

### Robustness (found by automated “chaos” testing)
- Invalid start URLs (`htp:/x`, `javascript:…`, `12345`, 5 000-character strings, other schemes) are refused with HTTP 400 and a clear message instead of a 500 or a guessed host.
- Malformed or non-object JSON bodies → 400; missing crawl file → 404 without internal paths; system errors no longer leak file paths.
- Absurd numbers (`maxPages` ≤ 0 or infinite, negative depth, delays) are brought back to safe values.
- Saved crawl file names are length-bounded; if a crawl cannot be saved, the interface now warns the user to export it.

### Tests
- New end-to-end test (`test/e2e-ui.test.mjs`) and seeded “monkey” test (`test/monkey-ui.test.mjs`) driving the real interface in Chromium with Playwright (skipped when Playwright is not installed): every page, every map view combination, filters, search, PNG export, configuration, mobile width, no JavaScript error, no injected script executed. `MONKEY_SEED` / `MONKEY_STEPS` replay or extend a run.
- Unit tests for the folder carrier, folder and URL-pattern filters, horizontal layout (deep trees without recursion), sibling summaries, crawl scope and input validation.

## 3.9.0 — 2026-10-15

### New: site map redesign (“Cartographie”)
- **Three distinct representations**: *Crawl tree* — each page under its parent on the shortest click path from the home page, now recorded by the engine (`pathParent`), so the displayed path always has exactly “depth” clicks (crawls made before 3.9 fall back to an inferred parent, and say so); pages not reached by a followed link are grouped under a virtual “Not reached from the home page” node instead of an invented link. *Directories* — URL path hierarchy; folders are virtual and never counted as pages; a page whose URL is the folder itself is carried by the folder. *Internal linking* — the real directed links between crawled pages (deduplicated page pairs, cycles kept, nofollow excluded); the counter shows that number, never the number of discovery links.
- **Layout**: deterministic radial tree computed once (branch angles proportional to their size, gaps between main branches, depth by distance, relief in 3D) — no physics simulation for trees, identical positions until the structure changes. Internal linking starts from a per-directory layout refined by a bounded simulation, then cached. Large trees are progressively collapsed into groups that show their page count and most serious issue.
- **Rendering**: 3D nodes drawn as one `Points` object with a shaded sphere shader, issue rings as a second one, all links as one `LineSegments`, screen-space picking, render-on-demand (nothing is redrawn while idle), links hidden only while rotating a very dense linking graph. 2D draws all links in one path per frame. Three.js is loaded only in 3D and shared with 3d-force-graph.
- **Colours & sizes**: depth (turquoise → blue → violet; unknown is grey, never “good”), SEO issues, HTTP status, indexability (unknown shown as such), directory; error / warning rings; bounded Link Score size explained as Arachnide’s relative internal PageRank — not a Google metric.
- **Inspector**: title, URL (copy / open), status, indexability only when known, depth in clicks, Link Score, source pages, outgoing links, discovery path, issues with the existing recommendations; *Isolate the branch / neighbourhood*, *See internal links* (keeps the selection), *See the action plan* (opens the right action), *Back to the overall view*.
- **Search** across all pages (expands collapsed groups or adds the page, then frames it), **filters** on the whole corpus (issues, severity, depth, directory, HTTP status, indexability, weak inbound linking with an explicit adjustable threshold, Link Score range) in *highlight* or *isolate* mode, **Analyse** presets, chips and reset. Wording never calls a page “orphan” — only “no inbound link observed in this crawl”.
- **Exports**: PNG / PDF with labels, legend and context (mode, colour, filters, scope), CSV of the pages; **List** view (keyboard access), full screen, collapsible inspector, zoom / fit / reset / help controls, 2D fallback when WebGL is unavailable, reduced-motion support.
- Sidebar: the site map now sits in the main navigation, after the action plan.

### Measured (same machine and viewport, software rendering, synthetic sites crawled by the engine)
| Dataset · view | Stabilisation | Main-thread blocking | Frames/s while rotating |
|---|---|---|---|
| 500 pages · tree 3D | 5.5 s → 0.7 s | 5.9 s → 0.3 s | 11 → 49 |
| 1 500 pages · tree 3D | 6.5 s → 0.8 s | 6.9 s → 0.4 s | 4 → 46 |
| 5 000 pages · tree 3D | 11.7 s → 0.9 s | 12.1 s → 0.5 s | 1 → 47 |
| 5 000 pages · linking 3D | 13.9 s → 3.2 s | 14.5 s → 2.9 s | 1 → 59 |
| 1 500 pages · tree 2D | 5.3 s → 0.8 s | 0.4 s → 0.15 s | 59 → 60 |
| 1 500 pages · linking 2D | 5.5 s → 3.3 s | 4.8 s → 0.4 s | 15 → 48 |

Selection → inspector: 4–13 ms. First 3D image is slightly later (≈0.15 s → 0.3–0.5 s) because Three.js is now loaded as a module; 2D linking on 5 000 pages went from 45 to 37 fps. After several audit changes, a heap snapshot shows only the current crawl kept in memory.

## 3.8.0 — 2026-10-15

### New: “Action plan” page redesign
- **Summary cards**: actions left to handle (by severity, with a segmented bar), quick wins (low effort, medium or high impact — one shared rule), fixing effort (low / medium / high) and **Start here**, the first action to do in the recommended order, which moves on as actions are handled.
- **Roadmap**: rank in the recommended order, action title with a verb (action titles added for every check), severity, SEO impact, unique URLs (or “Whole site”), effort and status. Filters (all, quick wins, to do, to check, plus in progress / to validate), search, recommended sort by default with its rule shown; a manual sort says it replaces the recommended order and offers a way back. Pagination and keyboard navigation.
- **Action panel**: why start here (rank, severity, scope, impact, effort — facts only), numbered method, “Done when…” criterion (a re-crawl for fixes, a documented decision for notices), see / export the URLs, a real note, and the status flow **To do → In progress → To validate**. Only a newer crawl that no longer detects the issue marks it resolved; one still detected is flagged.
- **Tracking** saved in the browser per site with stable issue IDs; save errors are reported. Multi-select exports the URLs of several actions or changes their status at once.
- Two-thirds / one-third layout with a sticky panel; on tablets the panel opens as a drawer (focus moved in and back, Escape closes it); compact cards and rows on mobile. Translations in the 6 languages.

## 3.7.0 — 2026-10-14

### New: “SEO issues” page redesign
- **Summary cards**: number of issue *types* overall, errors, warnings and notices (never a sum of URLs), with a segmented severity bar. Each card filters the list; the active filter is highlighted, “All” resets it.
- **Prioritised list**: “All issues” with severity tabs and counters, search on name, category and action, and a sort selector — recommended priority by default, then URLs affected, severity, lowest effort or name. The rule behind the recommended priority is spelled out, and the sort indicator always matches the order actually applied.
- **Table**: issue with its recommended action, severity badge (text + icon + colour), number of **unique URLs** (or “Whole site”), and effort on its own colour scale. Selected row tinted with a lime marker; the whole row opens the detail; keyboard navigation (↑ ↓ Enter); pagination so every issue stays reachable.
- **Fix panel**: severity, impact, effort, URLs affected, “Why fix it?”, numbered “How to fix it” steps (the issue’s own recommendation, a check for its category, then a re-crawl), a before / after example taken from a real page — with an automatic shortening suggestion for titles and descriptions that are too long, clearly labelled — nuances (decorative images, intentional noindex, short pages), a preview of the affected URLs, “See the N URLs” (full table with search, pagination and CSV) and “Export the list” for the selected issue. “Prepare the fix” opens the Fixes tab when the issue can be fixed there.
- **Layout**: 58 / 42 two-column work area on large screens with a sticky panel, stacked on tablets, and on mobile a list then a dedicated detail view with a clear way back. Partial-audit banner, no-issue and no-result states.
- New night palette (`#090E15`, `#121B27`, `#182331`, lime `#AAEF29`), translations in the 6 languages.

### Fixed
- **Recommended priority**: a widespread warning could rank above an error, contrary to the documented rule. Errors now always come first, then warnings, then notices (also in the action plan and the overview priorities, including crawls saved before 3.7).

### Internal
- The pixel width measurement (`public/shared/pixel.js`) and the fix catalogue (`public/shared/fix-catalog.js`) are now shared between the engine and the interface.

## 3.6.0 — 2026-10-13

### New: dark dashboard redesign
- **New layout**: grouped sidebar (Steering: Overview, Issues, Action plan, Fixes · Explore: Internal pages, Links & linking, Content, Images, Indexability), every other tab under “More analyses”, History and Settings at the bottom; counters only where they match the section. Becomes a drawer on tablet and mobile.
- **Topbar**: domain field with the crawl status (running / partial / complete), export menu (report, JSON), open / scheduled crawls menu, and a primary “Run the crawl again” button.
- **Overview**: “Your SEO at a glance.” with domain, last crawl date and the real analysis state; compact banner when the audit is partial (stopped or limit reached) with a shortcut to adjust the limit.
- **SEO health in four concentric rings**: Technical, Content, Internal linking and Performance. Each arc is exactly the pillar score, with the overall score in the centre, a status per pillar, hover / focus highlighting, and a click opens the issues filtered on that pillar. A pillar without data shows a neutral “Not measured” ring (internal linking in list mode, performance without response times). Performance is labelled “server time only” unless browser measurements or Core Web Vitals are available.
- **Your priorities**: error / warning / notice summary, top 3 actions with a short explanation, the number of unique pages (never the sum of occurrences) or “Whole site”, and a link to the action plan. Editorial items are shown as “To review”.
- **Key indicators** (URLs crawled, indexable URLs, median server response, internal links), **What works well** (only checks actually passed on the crawled scope) and **Your next goal**.
- **Animations**: rings fill in ~1.1 s, staggered; counters count up; values move from the previous crawl on refresh; everything is static with `prefers-reduced-motion`, and final values are exposed to assistive technologies immediately.
- Dark theme by default (light theme still available), new palette and Inter typography; translations in the 6 languages, with singular / plural forms.
- Pillar scores are computed by a shared module (`public/shared/pillars.js`) used by the engine (`summary.pillars`) and the interface.

## 3.5.0 — 2026-10-13

### New: Fix in 1 click with Claude or ChatGPT
- **Fix engine** (`src/fix/`): every correction is a validated **Fix** object (Zod schema). The AI never writes to a site: issue → proposal → before/after review → human approval → connector → re-crawl → history with undo.
- **AI fixes** (Claude via the Anthropic Messages API, ChatGPT via OpenAI): SEO title, meta description, H1, image alt texts and JSON-LD (Article, Organization, FAQPage, Product depending on the page), written in the page’s language from a minimal context (URL, language, title, H1, ~2,000-token excerpt, target lengths, other pages’ values to avoid duplicates). Invalid answers get one retry, then a clear failure.
- **Automatic fixes without AI**: 301 redirect from an internal 404 to the closest existing URL, missing or inconsistent canonical, accidental noindex, links pointing to redirects replaced by the final URL.
- **Non-automatable issues** (performance, hosting, Core Web Vitals…): written action plan only.
- **Batches**: “Fix all” per issue type with a queue (3 concurrent requests), 429 back-off, progress bar and cost estimate shown before running.
- **Bring your own key**: Options → AI (provider, editable model list with defaults in `src/ai/models.json`, connection test). The key is encrypted locally (AES-256-GCM), never returned to the browser, logged or exported.
- **Review UI**: new “Fix in 1 click” and “Fix history” tabs — issues grouped by impact with AI / Automatic / Manual badges, before/after side by side, character counter, inline edit, approve / regenerate / ignore, multi-select; **simulation mode on by default** and an explicit warning before the first live write.
- **WordPress**: companion plugin **1.1.0** (downloadable as a zip from the app) — application passwords, Yoast SEO / Rank Math / SEOPress / All in One SEO / Redirection, JSON-LD output, internal link rewriting (with a WordPress revision), history of previous values, translations (fr, es, de, it, pt) via .pot/.po/.mo, WordPress 6.0+ / PHP 7.4+.
- **GitHub** (Lovable, Bolt.new, React, Next.js, Astro, static HTML): fine-grained token on one repository, framework detection, exact location of titles / descriptions / H1 / alt / links in the code (AI-assisted when ambiguous), **diff shown before** a branch `arachnide/fix-YYYYMMDD-HHMM` and a pull request with a summary table are created; undo closes the PR or opens a revert PR.
- **Export** for every other CMS: CSV, JSON and a PDF with step-by-step instructions; “Applied fixes” PDF report (before/after, date, AI provider, status).
- Docs: README section, [docs/CONNECTORS.md](docs/CONNECTORS.md) (how to add a CMS; Shopify / Webflow / Wix planned), [docs/PLAN-FIX-ENGINE.md](docs/PLAN-FIX-ENGINE.md).

## 3.4.0 — 2026-10-13

Completes the reliability work started in 3.3.

- **JavaScript redirects**: when rendering is on, a page that sends visitors elsewhere with JavaScript is treated as a redirect (not indexable, target crawled), with a new `js-redirect` check.
- **Links grouped by page and target**: the same broken or redirected link with several anchors ("Support", "Get support") is one row listing all its anchors, instead of one row per anchor.
- **Crawl comparison URL by URL**: an issue is "fixed" only when its URLs were crawled again without it; URLs not crawled again are "not rechecked"; issues that moved to other URLs with the same count are shown; a warning appears when the two crawls differ by more than 20 % or one was stopped. The report gets "URLs fixed" and "New URLs" columns, and scheduled alerts fire on new error URLs.
- **hreflang targets checked**: language versions declared in hreflang are crawled, with new checks for targets in error or redirected (`hreflang-target-error`) and non-indexable targets (`hreflang-target-non-indexable`).

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
