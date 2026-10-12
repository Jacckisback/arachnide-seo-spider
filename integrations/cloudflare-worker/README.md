# Arachnide SEO Worker (Cloudflare)

Apply the SEO fixes decided with Arachnide + Claude **in front of any website** — custom code, Next.js, a closed website builder, an old CMS without API — as long as the domain goes through Cloudflare (free plan is enough, orange-cloud proxy on).

The Worker reads rules from a KV namespace and rewrites the HTML on the fly with `HTMLRewriter`:

| Field | What the Worker does |
|---|---|
| `seo_title` | replaces `<title>` (adds it if missing) |
| `meta_description` | replaces / adds `<meta name="description">` |
| `canonical` | replaces / adds `<link rel="canonical">` (removes duplicates) |
| `noindex` | adds or removes `noindex` in `<meta name="robots">` and the `X-Robots-Tag` header |
| `h1` | replaces the text of the first `<h1>` |
| `image_alt` | sets `alt` on the matching `<img>` (same URL or same file name) |
| `redirect` | answers with a 301 before reaching your server |

Non-HTML responses (images, CSS, JS, APIs) are never modified. Rules are cached at the edge for 60 seconds.

## Install (10 minutes)

```bash
cd integrations/cloudflare-worker
npx wrangler login
npx wrangler kv namespace create ARACHNIDE     # copy the id into wrangler.toml
# edit wrangler.toml: replace exemple.com by your domain in "routes"
npx wrangler deploy
```

Then create an API token (Cloudflare dashboard → My Profile → API Tokens → Create token → *Custom*: **Account → Workers KV Storage → Edit**) and register the site in Arachnide (Claude does it for you with `arachnide_configure_site`):

```json
"mon-site": {
  "url": "https://www.exemple.com",
  "connector": "cloudflare",
  "accountId": "<account id>",
  "namespaceId": "<KV namespace id>",
  "apiToken": "env:ARACHNIDE_CF_TOKEN"
}
```

and set `ARACHNIDE_CF_TOKEN` in the environment of the MCP server.

## Undo / remove

Every change goes through the Arachnide journal, so `arachnide_rollback_changes` deletes the rules. To stop everything at once, remove the Worker route (or `npx wrangler delete`): the site is served exactly as before.

## Good to know

- The fix lives at the edge, not in your CMS: if you later rebuild the site elsewhere, re-apply the values in the new CMS (the journal lists them).
- Googlebot sees the rewritten HTML (the Worker runs for every visitor and bot). Client-side JavaScript that rewrites the title after load is not affected.
- Tested in the real Workers runtime (workerd) with Miniflare: `npm i --no-save miniflare@4 && node --test test/worker.test.mjs`.
