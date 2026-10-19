# Arachnide + Claude (MCP): audit and fix SEO on the live site

> **3.13:** the same tools are also served over **HTTP** — MCP Streamable HTTP at `/mcp` and a REST + OpenAPI door at `/api/agent/*` — for claude.ai connectors, ChatGPT Actions and your own agents. See [AGENTS.md](AGENTS.md).

Arachnide 3.0 ships an **MCP server** ([Model Context Protocol](https://modelcontextprotocol.io)). Connect it to Claude (Claude Code, Claude Desktop or any MCP client) and Claude can:

1. **detect** the CMS and technology of a site,
2. **crawl and audit** it (the same ~95 checks as the app),
3. **decide** what to fix, page by page, reading the real content,
4. **apply** the fixes on the live site through the CMS API — after you approve them,
5. **verify** they are live, **undo** any batch, and **re-crawl** to measure the gain.

Fields Claude can change: **SEO title, meta description, H1, canonical, noindex, image alt text, 301 redirects.**

## Coverage: about 70-85% of the web

Shares are of all websites (W3Techs, October 2026).

| Platform | Share of all websites | How fixes are applied | Fields applied automatically |
|---|---:|---|---|
| WordPress (+ WooCommerce) | 40.1% | REST API + [Arachnide Connector plugin](../integrations/wordpress/arachnide-connector) (Yoast, Rank Math, AIOSEO, SEOPress, Redirection, or none) | all 7 (H1 + alt work even without the plugin) |
| Shopify | 5.4% | Admin GraphQL API | title, description, H1, noindex, product image alt, redirects |
| Wix | 4.2% | Wix REST APIs (Item SEO Tags, URL Redirect Manager) | title, description, canonical, noindex, redirects |
| Squarespace | 2.4% | no write API → step-by-step instructions, or Cloudflare Worker | — |
| Joomla 4/5 | 1.1% | Web Services API (articles) | title, description, H1, noindex, image alt, redirects |
| Webflow | 0.8% | Data API v2 | title, description, CMS item H1, redirects (Enterprise) |
| Drupal 9-11 | 0.6% | JSON:API (+ Metatag, Redirect modules) | all 7 |
| PrestaShop | 0.5% | Webservice API | title, description, H1 (name), alt in descriptions |
| No CMS (custom, static, Next.js, Hugo…) | 31.6% | **files** (edit the HTML + `_redirects` / `.htaccess` / nginx / `vercel.json`) or **Cloudflare Worker** | all 7 |
| Any other site behind Cloudflare | — | [Arachnide SEO Worker](../integrations/cloudflare-worker) rewrites the HTML at the edge | all 7 |
| Everything else | — | **manual**: exact click path + value to paste, per CMS | — |

CMS APIs cover ≈ 53% of all websites. The files and Cloudflare connectors cover sites without a CMS when you have access to the files or to Cloudflare, which brings the total to 70-85%. Whatever cannot be written automatically comes back as precise manual instructions, so nothing is lost.

## Install

Requires Node.js 18.17+ and the Arachnide folder (`npm install` already done).

**Claude Code**

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
# with a secret for a site:
claude mcp add arachnide -e ARACHNIDE_WP_APP_PASSWORD="xxxx xxxx xxxx xxxx" -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

**Claude Desktop**: Settings → Developer → Edit Config, then add:

```json
{
  "mcpServers": {
    "arachnide": {
      "command": "node",
      "args": ["C:\\Users\\you\\arachnide-seo-spider\\src\\mcp.mjs"],
      "env": { "ARACHNIDE_WP_APP_PASSWORD": "xxxx xxxx xxxx xxxx", "ARACHNIDE_LANG": "fr" }
    }
  }
}
```

Restart Claude Desktop. Then simply ask: *« Audite www.mon-site.fr et corrige les titres et descriptions des pages les plus importantes. »* — or use the **optimize_site** prompt.

## Connect a site

Sites live in `~/.arachnide/sites.json` (override with `ARACHNIDE_CONFIG`). Claude creates the entry with `arachnide_configure_site`; **secrets never go through the chat**: the file stores `env:VARIABLE` and the value comes from the MCP server environment.

```json
{
  "sites": {
    "mon-blog": {
      "url": "https://www.mon-blog.fr",
      "connector": "wordpress",
      "user": "admin",
      "appPassword": "env:ARACHNIDE_WP_APP_PASSWORD",
      "policy": { "allowedFields": ["seo_title", "meta_description", "image_alt"], "maxChangesPerBatch": 30 }
    }
  }
}
```

| Connector | Settings (secrets as `env:…`) | What to do on the site |
|---|---|---|
| `wordpress` | `user`, `appPassword` | Users → Profile → Application Passwords; install the Arachnide Connector plugin for SEO fields and redirects |
| `shopify` | `shop` (xxx.myshopify.com), `accessToken`, `apiVersion` | Create a custom app with scopes read/write_products, read/write_content, read/write_online_store_navigation, read/write_files |
| `wix` | `siteId`, `apiKey` | API key with *Manage SEO Settings* (+ read Blog / Stores) |
| `webflow` | `siteId`, `token`, `publish` (`none`/`items`/`site`) | Site token with pages, CMS and sites scopes; bind CMS SEO fields in the Designer |
| `joomla` | `token` | Joomla API token of a Super User (Web Services plugins enabled) |
| `drupal` | `user`, `password`, `metatagField` | Enable JSON:API (with write) and HTTP Basic Auth |
| `prestashop` | `apiKey`, `languageId` | Advanced Parameters → Webservice → key with products / categories / cms |
| `cloudflare` | `accountId`, `namespaceId`, `apiToken` | Deploy the [Worker](../integrations/cloudflare-worker) |
| `files` | `root`, `redirectsFormat` (`netlify`, `apache`, `nginx`, `vercel`) | Folder with the HTML (Git checkout, build output); deploy as usual afterwards |
| `manual` | `cms` | nothing |

## Safety

- **Preview first.** `arachnide_preview_changes` writes nothing and shows current value, published value, new value and SEO warnings (pixel width, noindex…). Claude is instructed to show it and wait for your yes.
- **Your client asks before each write.** Apply and rollback tools are flagged *destructive*, so Claude Code / Desktop ask for permission.
- **Policy per site**: allowed fields, max changes per batch, read-only mode.
- **Journal + undo**: every applied change stores its previous value (`~/.arachnide/journal/<site>.jsonl`); `arachnide_rollback_changes` restores a whole batch.
- **Verify**: `arachnide_verify_changes` reads the public pages (caches/CDN may delay by a few minutes).
- Only the site's own host is accepted; no change can target another domain.

## Tools

| Tool | Purpose |
|---|---|
| `arachnide_detect_site` | CMS, framework, hosting/CDN, recommended connector |
| `arachnide_crawl` | Crawl + audit, saves the crawl (progress notifications) |
| `arachnide_list_crawls`, `arachnide_get_summary` | Saved crawls, score, top issues |
| `arachnide_list_issues`, `arachnide_get_issue` | Issues by priority, affected URLs, how to fix |
| `arachnide_get_page`, `arachnide_fetch_page` | Page data from the crawl / live content excerpt |
| `arachnide_suggest_fixes` | Fixable items per page with current values, constraints and context |
| `arachnide_compare_crawls` | Before / after |
| `arachnide_list_connectors`, `arachnide_list_sites`, `arachnide_configure_site`, `arachnide_test_site` | Connectors and sites |
| `arachnide_preview_changes`, `arachnide_apply_changes`, `arachnide_verify_changes`, `arachnide_rollback_changes`, `arachnide_list_changes` | Changes |

Environment variables: `ARACHNIDE_LANG` (labels: en, fr, de, es, it, pt), `ARACHNIDE_HOME` (config + journal, default `~/.arachnide`), `ARACHNIDE_CONFIG`, `ARACHNIDE_CRAWLS` (crawl folder, shared with the web app by default).

## Limits (honest list)

- Connectors were built from the official API documentation and tested against faithful mock servers, plus the Cloudflare Worker in the real Workers runtime. Test on a staging site or a few pages first, and report issues on GitHub.
- Content written by page builders (Elementor, Divi…), theme templates or JavaScript may not be reachable through CMS APIs: those changes come back as manual steps (or use the Cloudflare Worker).
- Arachnide changes on-page SEO fields and redirects. It does not rewrite body content, change templates or touch your hosting.
