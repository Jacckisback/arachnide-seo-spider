# Log file analysis

*Version française : [LOGS.fr.md](LOGS.fr.md)*

A crawl shows what a search engine **could** reach on your site. Your server's access logs show what Googlebot, Bingbot and the AI bots **actually** request, how often, with which status, and how fast the server answered. Arachnide reads those logs and matches them with the open crawl, like Screaming Frog's Log File Analyser, but inside the same tool, on the same crawl, with no separate licence.

Everything runs on your machine: the files are read line by line, never stored, and only aggregated counts are kept next to the crawl.

## What you get

| Where | What |
|---|---|
| **Logs tab** | Requests, Googlebot, other bots, visitors, pages outside the crawl, 5xx served to bots. A requests-per-day chart (search bots, AI bots, other bots, visitors), the bots seen (hits, distinct IPs, spoofed), the busiest folders, and a table of every URL seen in the logs with the crawl data beside it (status, indexability, depth, Link Score). |
| **Table filters** | *With requests*, *Crawled by bots, not in crawl*, *Never visited by Googlebot*, *Crawl budget waste*, *5xx served to bots*, *Spoofed bots*, *Resources*, *No request at all*. Every filter exports to CSV. |
| **Page detail** | Requests, Googlebot / Bingbot / AI counts, last request, average server time for every page of the crawl. |
| **Dashboard** | A card with Googlebot requests, bot requests, pages outside the crawl, spoofed requests, the daily chart and the log-based issues. |
| **SEO issues and action plan** | Six checks (below) with the same severity, impact, effort and priority as the other ~95 checks. They count in the score. |
| **Segments** | Log requests and Googlebot requests per segment; three rule fields (*Log requests*, *Log requests from search bots*, *Log requests from Googlebot*) to build segments like "pages Googlebot never sees". |
| **Report** | A "Server logs" section in the HTML / PDF client report. |
| **CLI and AI agents** | `--logs`, columns in `pages.csv`, and the `arachnide_logs` tool (see below). |

## Importing logs

1. Open a crawl (or finish one).
2. **Logs** in the sidebar → drop one or more files, or click to choose. Compressed `.gz` files are accepted as they are; rotated files (`access.log`, `access.log.1`, `access.log.2.gz`…) can be imported together.
3. Leave *Format* on **Detect automatically**, or choose a format. For an unusual Nginx `log_format`, choose **Custom** and paste the directive's pattern (`$remote_addr - $remote_user [$time_local] "$request" $status …`).
4. Keep **Verify Googlebot / Bingbot IPs by reverse DNS** ticked if the machine has network access: every IP claiming to be Googlebot or Bingbot is checked the way Google and Bing document it (reverse DNS, then forward DNS back to the IP). Requests from IPs that fail are counted as *spoofed* and removed from the bot counts.
5. **Analyse with this crawl**. The Logs tab, the SEO issues, the score and the dashboard update. The aggregated counts are saved in `crawls/<crawl>.logs.jsonl.gz` and come back when you reopen the crawl.

*Import more files* adds files to the same crawl; *Remove the logs* deletes the side file and the log-based checks.

### Formats recognised

| Format | Example source |
|---|---|
| **combined** / **common** (Apache, Nginx default) | `66.249.66.1 - - [10/Oct/2026:13:55:36 +0000] "GET /page HTTP/1.1" 200 5123 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; …)"` |
| **W3C extended** (IIS, CloudFront, Azure) | `#Fields: date time c-ip cs-method cs-uri-stem cs-uri-query sc-status cs(User-Agent) time-taken` |
| **JSON lines** (Nginx `log_format … escape=json`, Cloudflare Logpush, Caddy, Traefik, Vercel / Netlify exports) | one JSON object per line; fields are recognised by name (`remote_addr` / `ClientIP` / `request.remote_ip`, `request_uri` / `ClientRequestURI`, `status` / `EdgeResponseStatus`, `http_user_agent` / `ClientRequestUserAgent`, `request_time` / `OriginResponseDurationMs`…) |
| **Custom** | any Nginx `log_format` pattern using `$remote_addr`, `$time_local`, `$request`, `$status`, `$body_bytes_sent`, `$http_referer`, `$http_user_agent`, `$request_time`, `$host`, `$request_method`, `$request_uri`… |

Lines that do not match are counted as *skipped*; a file where nothing matches is refused with a sample of its first lines. Requests for another host (multi-site logs with a host field) are ignored and counted. The timestamp handles CLF (`10/Oct/2026:13:55:36 +0200`), ISO 8601, and epoch seconds / milliseconds / nanoseconds.

### URL matching

A log line's path becomes an absolute URL on the crawl's origin, then goes through **the same normalisation as the crawler**: fragment removed, parameters sorted, tracking parameters (`utm_*`, `gclid`, `fbclid`…) and the crawl's *remove parameters* patterns dropped, `ignoreQuery` honoured. `/page?utm_source=news` and `/page` are one page, as in the crawl. The host is compared without `www.`.

URLs seen in the logs but absent from the crawl are kept as **URLs outside the crawl** (flagged *resource* when the extension says image, script, style, font, PDF…).

## The six checks

| Check | Severity | What it means |
|---|---|---|
| **Pages crawled by search bots but not linked** (`log-orphan`) | warning | Googlebot or Bingbot request the URL (served 200) but the crawl never reached it by following links: either it is outside the crawl, or it is a sitemap page nothing links to. Link it, or redirect / 410 it. |
| **Indexable pages Googlebot never visited** (`log-not-crawled`) | notice | Over the log period (at least 7 days, with Googlebot active on the site), these indexable pages were never requested by Googlebot. Too deep, poorly linked, or judged not worth the budget. |
| **Crawl budget wasted on redirects, errors and non-indexable URLs** (`log-crawl-waste`) | warning | Search bots spend requests on redirects, 4xx, noindex / canonicalised pages and parameter URLs. Fix the internal links and sitemaps, 410 the gone pages, block the facets. |
| **Server errors (5xx) served to bots** (`log-bot-errors`) | error | Search or AI bots received 5xx answers. Repeated 5xx slow Google's crawl down and can drop URLs from the index. |
| **Fake Googlebot / Bingbot visits** (`log-spoofed`) | notice | Requests from IPs that fail the reverse-DNS check. Nothing to change for SEO; block them at the firewall or CDN if the load matters. Only with DNS verification. |
| **Pages slow for search bots** (`log-slow`) | notice | Average server time above the *slow* threshold for search bots (needs a response-time field: `$request_time`, `time-taken`, `OriginResponseDurationMs`…). |

Spoofed requests are excluded from every bot count once verification has run; without verification, the Logs tab says so.

## Command line

```bash
node src/cli.mjs https://example.com --logs access.log --logs access.log.1.gz --csv --report
node src/cli.mjs https://example.com --logs iis.log --logs-format w3c
node src/cli.mjs https://example.com --logs app.log --logs-format custom --logs-custom '$remote_addr [$time_local] "$request" $status $body_bytes_sent "$http_user_agent" $request_time'
node src/cli.mjs https://example.com --logs access.log --logs-verify
```

| Option | Effect |
|---|---|
| `--logs FILE` | Access log to analyse with the crawl (repeatable; `.gz` accepted) |
| `--logs-format auto\|combined\|common\|w3c\|json\|custom` | Force a format (default: detect) |
| `--logs-custom PATTERN` | Nginx `log_format` pattern for `--logs-format custom` |
| `--logs-verify` | Verify Googlebot / Bingbot IPs by reverse DNS |

The summary prints the requests, Googlebot requests and pages outside the crawl; the crawl is saved without the logs, the aggregated counts go to `<crawl>.logs.jsonl.gz` beside it (the app reads both); `pages.csv` gets *Requests*, *Googlebot* and *Last request* columns; the report gets its section.

## AI agents (MCP, ChatGPT Actions, REST)

`arachnide_logs` reads the logs attached to a crawl. `section` picks what comes back:

| `section` | Returns |
|---|---|
| `summary` (default) | period, files, totals per family and status, Googlebot / Bingbot hits, URLs matched and outside the crawl, verification, top bots, log-based issues |
| `bots`, `timeline`, `directories` | the bots seen, requests per day, requests per folder (paginated) |
| `top_urls` | URLs by requests; `bot` = `all`, `googlebot`, `bingbot`, `search`, `ai`, `human` |
| `orphans`, `not_crawled`, `waste`, `errors`, `spoofed`, `slow` | the URLs of each check, with the detail |

`arachnide_search_pages` accepts `sort: "log_hits"` / `"googlebot_hits"` and returns `log_hits`, `googlebot_hits`, `last_crawled_by_googlebot`; `arachnide_get_summary` carries a `server_logs` block. Without logs the tool answers with a `not_found` error that says how to import them.

## Limits

- The aggregation keeps up to 2 000 000 distinct URLs per crawl; beyond that, requests are counted in *overflow* and not detailed.
- DNS verification needs network access and takes a few milliseconds per distinct IP (cached, 8 in parallel, 4 s timeout). Without a reverse record, an IP claiming to be Googlebot is counted as spoofed, as Google documents.
- Bots are recognised by user agent (about 80 signatures: search engines, AI crawlers, SEO tools, social previews, monitoring). Unknown user agents count as visitors.
- The logs are matched with the crawl that is open: a crawl of `https://www.example.com` with logs from `example.com` works (same host without `www.`); logs of another domain are ignored and counted as *other host*.
