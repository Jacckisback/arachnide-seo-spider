# Connect your AI agent to Arachnide (SEO + GEO)

Arachnide 3.13 is built to be driven by an AI agent — yours, or any assistant that speaks **MCP** (Claude) or **OpenAPI** (ChatGPT Actions, LangChain, n8n, Make…). The agent reads the audit you have open, starts crawls that appear live in the app, explores pages, gets the prioritised action plan and the **GEO readiness** report, and — with your approval — fixes the site through the CMS connectors.

Everything runs on your machine (or your server). Nothing is sent to a third party except what your agent's own model receives.

## Three doors, one set of 27 tools

| Door | For | URL | Auth |
|---|---|---|---|
| **MCP over stdio** | Claude Code, Claude Desktop, any local MCP client | `node src/mcp.mjs` | none (local process) |
| **MCP over HTTP** (Streamable HTTP, stateless JSON) | claude.ai custom connectors, Claude Desktop remote servers, hosted agents, Claude Agent SDK | `https://<your-host>/mcp` | `Authorization: Bearer <token>` |
| **REST + OpenAPI 3.1** | ChatGPT GPT Actions, OpenAI Agents/Responses API tools, LangChain, n8n, Make, curl | `POST https://<your-host>/api/agent/<tool>` · spec at `/openapi.json` | `Authorization: Bearer <token>` or `X-API-Key: <token>` |

The token is created the first time Arachnide starts and lives in `~/.arachnide/agent.json` (0600). Read it, copy it or renew it in **Settings → AI agents**. On a server, set `ARACHNIDE_AGENT_TOKEN` instead. The same screen shows the latest calls received from agents.

The tools are identical on the three doors (they come from one registry, `src/agent/tools.mjs`). `crawl_id: "current"` always means *the crawl open in the Arachnide app* — tell your agent to use it when the user talks about "the audit" they are looking at.

## 1. Claude Desktop or Claude Code (local)

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

Claude Desktop: Settings → Developer → Edit config, add the `arachnide` server (see [docs/MCP.md](MCP.md)). With the app running you can also use the HTTP door from Claude Desktop: **Settings → AI agents → Copy the Claude Desktop config** gives you:

```json
{ "mcpServers": { "arachnide": { "url": "http://127.0.0.1:4000/mcp", "headers": { "Authorization": "Bearer ara_…" } } } }
```

## 2. claude.ai (custom connector) and hosted agents

claude.ai only reaches servers on the public internet over HTTPS. Expose the app:

```bash
npm start                                   # Arachnide on http://localhost:4000
cloudflared tunnel --url http://localhost:4000   # or: ngrok http 4000 · tailscale funnel 4000
```

Then in Arachnide → **Settings → AI agents**, paste the public URL (e.g. `https://xyz.trycloudflare.com`). In claude.ai → Settings → Connectors → *Add custom connector*: URL `https://xyz.trycloudflare.com/mcp`, and the token as the bearer token (OAuth is not required for a personal connector; the token is your key — never share it).

For a **hosted agent** built with the Claude Agent SDK / Messages API, add the server as an MCP server with the same URL and `Authorization` header, or call the REST door directly.

## 3. ChatGPT (GPT Actions) and OpenAI agents

In the GPT builder → *Actions* → **Import from URL**: `https://<your-host>/openapi.json`. Authentication: **API Key**, auth type **Bearer**, paste the token. Each tool becomes an action (`arachnide_get_summary`, `arachnide_action_plan`, …); read-only tools are marked non-consequential, write tools (apply, rollback, configure) ask for confirmation.

With the OpenAI Agents / Responses API, point a hosted MCP tool at `https://<your-host>/mcp` with the bearer header, or wrap the REST endpoints as functions from the OpenAPI spec.

## The tools (25)

| Tool | What it does | Writes? |
|---|---|---|
| `arachnide_detect_site` | CMS, framework, CDN and the connector that fits | no |
| `arachnide_crawl` | Crawl + ~95 SEO/GEO checks, waits for the result; `mode: "list"` with `urls` or `sitemap_url` crawls exactly those URLs | no |
| `arachnide_start_crawl` / `arachnide_crawl_status` | Same crawl in the background, **live in the app**, polled by job id | no |
| `arachnide_list_crawls` | Saved crawls; `current` first when the app has one open | no |
| `arachnide_get_summary` | Score, grade, pillars, top issues | no |
| `arachnide_list_issues` / `arachnide_get_issue` | Issues by priority, affected URLs (paginated) | no |
| `arachnide_action_plan` | The ordered action plan (quick wins flagged), as in the app | no |
| `arachnide_search_pages` | Find pages by text, status, indexability, depth, folder, issue; sort by Link Score | no |
| `arachnide_get_page` | Everything about one URL | no |
| `arachnide_geo_readiness` | AI crawlers access, llms.txt, structured data coverage, content depth, hygiene → 0-100 GEO score + recommendations | no |
| `arachnide_segments` | Site sections (product pages, categories, blog…): get the score, errors and averages per segment, suggest one per directory, or set them (no recrawl). Then pass `segment` to the reading tools | no (saves the segments on the crawl) |
| `arachnide_logs` | Server access logs imported into the crawl (Logs tab or CLI `--logs`): crawl frequency per bot and per day, URLs Googlebot requests that are not in the crawl, indexable pages it never visits, crawl budget wasted, 5xx served to bots, spoofed Googlebot IPs, slow pages for bots (`section`: summary, bots, timeline, directories, top_urls, orphans, not_crawled, waste, errors, spoofed, slow) | no |
| `arachnide_sitemap_changes` | Decisions for the URLs removed from (or added to) a sitemap, after a crawl made with `sitemap_url` + `sitemap_previous_crawl` / `sitemap_previous_urls`: 301 to a suggested similar page, 410, fix a broken redirect or an error, put a live page back; filter by decision (`actions`) or change, with a plain *what_to_do* per URL | no |
| `arachnide_fetch_page` | Read a live page (tags, headings, images, text excerpt) | no |
| `arachnide_suggest_fixes` | Fixable fields per page with current values and constraints | no |
| `arachnide_compare_crawls` | Before/after between two crawls | no |
| `arachnide_list_connectors` / `arachnide_list_sites` / `arachnide_configure_site` / `arachnide_test_site` | CMS connectors and site configuration (secrets as `env:VAR`, never in chat) | config |
| `arachnide_preview_changes` | Dry run of a batch of changes | no |
| `arachnide_apply_changes` | Apply approved changes through the connector, journaled | **yes** |
| `arachnide_verify_changes` / `arachnide_rollback_changes` / `arachnide_list_changes` | Verify on the live site, undo a batch, read the journal | rollback writes |

Every reading tool (`arachnide_get_summary`, `arachnide_list_issues`, `arachnide_get_issue`, `arachnide_action_plan`, `arachnide_search_pages`, `arachnide_geo_readiness`) accepts `segment`: the scores, issues and pages are recomputed for that section of the site.

Google Analytics 4: pass `ga4_key_file` (and `ga4_property`) or `ga4_csv` to `arachnide_crawl` / `arachnide_start_crawl` to add sessions per page and find orphan pages that get traffic (`ga4-orphan`); `arachnide_search_pages` can sort by `sessions`.

Server logs (3.22): once access logs are imported into a crawl (Logs tab or CLI `--logs`), `arachnide_logs` reads them, `arachnide_search_pages` can sort by `log_hits` / `googlebot_hits` and returns `last_crawled_by_googlebot`, and `arachnide_get_summary` carries a `server_logs` block. See [LOGS.md](LOGS.md).

Sitemap changes (3.23): `arachnide_crawl` / `arachnide_start_crawl` with `sitemap_url` and `sitemap_previous_crawl` (or `sitemap_previous_urls`) crawl only the URLs that left the sitemap (`sitemap_changes`: removed / added / both), redirects followed; `arachnide_sitemap_changes` returns the decision per URL. See [SITEMAP-CHANGES.md](SITEMAP-CHANGES.md).

`GET /api/agent/tools` returns the same list with the JSON Schema of each input.

## Suggested instructions for an SEO / GEO agent

Paste this in your agent's system prompt (Claude project instructions, GPT instructions, Agent SDK `system`):

```
You are an SEO and GEO (generative engine optimisation) consultant. You work with Arachnide SEO Spider through its tools.
- When the user mentions "the audit", "the site" or "the crawl", use crawl_id "current": it is what they see in the Arachnide app. Call arachnide_list_crawls if unsure.
- Start every analysis with arachnide_get_summary, then arachnide_action_plan (what to do first) and arachnide_geo_readiness (visibility in AI answers). Explain in plain language, cite numbers, never invent data that is not in the tool results.
- To explore, use arachnide_search_pages (sorted by Link Score) and arachnide_get_page; to write content, read the real page with arachnide_fetch_page first.
- A new crawl: arachnide_start_crawl, then poll arachnide_crawl_status every 15-30 s; the user can watch it in the app.
- Changes to the live site: arachnide_suggest_fixes → write the values yourself (same language as the site, natural, unique, within pixel limits) → arachnide_preview_changes → show a before/after table → wait for an explicit "yes" → arachnide_apply_changes → arachnide_verify_changes. Small batches (10-30), most important pages first. Every batch can be undone with arachnide_rollback_changes.
- Never ask the user to paste passwords or API keys in the chat: configure sites with "env:VARIABLE" references.
```

## Security model

- The token is required on `/mcp` and `/api/agent/*`; `/openapi.json` is public (it contains no secret) so that GPT builders can import it. `/api/agent/settings` (token, log) answers only to the local interface (same-origin, localhost host header).
- Requests are rate-limited (240 per minute per IP) and the last 50 calls are shown in the app.
- Disable agents at any time with the switch in **Settings → AI agents**; renew the token if it leaks.
- Expose Arachnide only over HTTPS (tunnel or reverse proxy). Behind a proxy, forward `X-Forwarded-Proto` / `X-Forwarded-Host` or set the public URL in the app (or `ARACHNIDE_PUBLIC_URL`).
- Write tools go through the same policy as the MCP server: per-site allowed fields, batch size, read-only mode, journal and rollback (see [docs/MCP.md](MCP.md)).

## Examples

```bash
# summary of the audit open in the app
curl -X POST https://<host>/api/agent/arachnide_get_summary -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{}'
# the 10 pages with the highest Link Score under /blog/
curl -X POST https://<host>/api/agent/arachnide_search_pages -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{"folder":"/blog/","limit":10}'
# GEO readiness of a saved crawl
curl -X POST https://<host>/api/agent/arachnide_geo_readiness -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{"crawl_id":"www.example.com_2026-10-19T09-00-00"}'
```

Errors are JSON: `400` invalid arguments (with the field path), `401` missing/invalid token, `404` unknown tool, crawl, issue or page, `409` a crawl is already running.
