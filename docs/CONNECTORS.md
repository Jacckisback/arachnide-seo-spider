# Connectors — how “Fix in 1 click” writes to a site

Arachnide never lets the AI touch a site directly. Every correction follows the same path:

```
issue → Fix (proposed) → before/after review → human approval → CMSConnector.apply() → re-crawl of the URL → history (undo)
```

The **Fix** object (`src/fix/schema.mjs`, validated with Zod) is the only format exchanged between the fix engine, the AI providers and the connectors:

| Field | Meaning |
|---|---|
| `issueType` | Arachnide issue id (`desc-missing`, `title-long`, `4xx`…) |
| `url` | Page to fix |
| `target.kind` | `seo_title`, `meta_description`, `h1`, `image_alt`, `json_ld`, `canonical`, `noindex`, `redirect`, `link`, `action_plan` |
| `target.selector` | Image `src` (`image_alt`), old link URL (`link`) |
| `oldValue` / `newValue` | Value before / after (string, boolean or null) |
| `method` / `provider` | `ai` (`anthropic` / `openai`), `deterministic`, `manual` |
| `status` | `proposed → edited → approved → applied → verified`, or `failed`, `rolled_back`, `ignored` |

## The `CMSConnector` interface

`src/fix/connectors.mjs`:

```js
class MyConnector extends CMSConnector {
  static id = 'mycms';
  static batch = false;            // true: the whole batch is applied at once (e.g. one pull request)
  async testConnection() {}        // → { ok: true, details } or { ok: false, error }
  canApply(fix) {}                 // → true if this connector can write fix.target.kind
  async read(fix) {}               // → current value in the CMS
  async apply(fix) {}              // → { previous } (value before the write, stored for undo)
  async rollback(fix) {}           // puts fix.oldValue back
  // batch connectors implement instead: preview(fixes), applyBatch(fixes, { batch }), rollbackBatch(fixes)
}
```

After `apply()`, `src/fix/apply.mjs` re-crawls the URL (`verifyFix`) and sets `verified` when the new value is visible on the public page, or keeps `applied` with “not visible yet” (cache) — the user can recheck later from the history.

## Adding a CMS in 5 steps

1. **Reuse an existing v3.0 connector if there is one** (`src/connectors/*.mjs`: Shopify, Webflow, Wix, Joomla, Drupal, PrestaShop, Cloudflare Worker). They already implement `get(change)` / `set(change)` for `seo_title`, `meta_description`, `h1`, `canonical`, `noindex`, `image_alt`, `redirect`. A `CMSConnector` for them is a thin adapter — see `WordPressFixConnector`, which maps `fix.target.kind` to a change field and calls `get` / `set`.
2. Write the class in `src/fix/connectors.mjs` (or its own file, loaded lazily like `github.mjs`) and register it in `FIX_CONNECTORS`.
3. Add its type to `saveConnection()` in `src/fix/store.mjs` (fields + which ones are secrets: they are encrypted with AES-256-GCM and never sent back to the UI).
4. Add the connection form in `openConnection()` (`public/fix.js`) and the labels `fix.conn.<id>` in the six `public/i18n/*.js` files.
5. Test it against a fake API (see `test/connector-wordpress.test.mjs` and `test/fix-github.test.mjs`): apply, read back, rollback.

## Shopify, Webflow, Wix (not wired in V1)

The v3.0 connectors exist and are used by the MCP server (Claude Desktop / Claude Code). Wiring them to the “Fix in 1 click” UI only needs the adapter of step 1:

- **Shopify** — `src/connectors/shopify.mjs` (Admin GraphQL: SEO title/description, product/collection/page titles, image alt, URL redirects; noindex via the `seo.hidden` metafield). TODO: `ShopifyFixConnector` + form (shop domain, Admin API access token).
- **Webflow** — `src/connectors/webflow.mjs` (Data API v2: static page SEO, CMS item fields, asset alt). TODO: `WebflowFixConnector` + form (site id, API token); remember to publish the site after the write.
- **Wix** — `src/connectors/wix.mjs` (Pages & SEO API, redirects). TODO: `WixFixConnector` + form (site id, API key).

Until then, choose **Export** in the connection dialog: approved fixes are exported as CSV, JSON or PDF with step-by-step instructions.

## Security rules for every connector

- Credentials are stored locally only, encrypted, and never returned by the API, logged or exported.
- No write happens in simulation mode (on by default) or before the user accepted the live-mode warning.
- Always return the previous value from `apply()` so the change can be undone.
- Never widen scope: a connector writes only the field of the Fix it was given, on the URL of the Fix.
