=== Arachnide Connector ===
Contributors: thierrygustin
Tags: seo, rest api, redirects, yoast, rank math
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lets Arachnide SEO Spider apply SEO fixes (title, meta description, canonical, noindex, 301 redirects, JSON-LD, internal links) to your site through the REST API.

== Description ==

Arachnide SEO Spider crawls your site, finds SEO issues and can fix them for you. The WordPress core REST API already lets it change post titles (H1) and image alt texts, but SEO meta data belongs to your SEO plugin and is not writable through the core API. This small companion plugin adds the missing endpoints (namespace `arachnide/v1`):

* `GET /wp-json/arachnide/v1/status` – active SEO plugin, redirect backend, versions.
* `GET /wp-json/arachnide/v1/resolve?url=…` – maps a public URL to a post, page, custom post type entry or taxonomy term (uses `url_to_postid()`).
* `GET|POST /wp-json/arachnide/v1/meta` – reads / writes the SEO title, meta description, canonical URL and noindex flag of a post or term.
* `GET|POST /wp-json/arachnide/v1/redirect` – reads / creates / deletes a 301 redirect.

Values are stored where your SEO plugin expects them:

* **Yoast SEO**: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_canonical`, `_yoast_wpseo_meta-robots-noindex` (terms: `wpseo_taxonomy_meta` option). Yoast indexables are rebuilt after each change.
* **Rank Math**: `rank_math_title`, `rank_math_description`, `rank_math_canonical_url`, `rank_math_robots` (post and term meta).
* **All in One SEO**: its `aioseo_posts` table through AIOSEO's own models (terms need AIOSEO Pro).
* **SEOPress**: `_seopress_titles_title`, `_seopress_titles_desc`, `_seopress_robots_canonical`, `_seopress_robots_index` (post and term meta).
* **No SEO plugin**: the plugin stores the values in its own meta and outputs them itself (document title, meta description, canonical, `wp_robots`).

Redirects use the **Redirection** plugin when it is active; otherwise they are stored in an option and served with a 301 on `template_redirect`.

Security: every endpoint requires an authenticated user. SEO meta requires the right to edit that post or term; redirects require `manage_options`. Arachnide authenticates with an Application Password (Users → Profile → Application Passwords, WordPress 5.6+), so no cookie or nonce is involved. All input is sanitized and all output escaped.

== Installation ==

1. Zip the `arachnide-connector` folder (or download it from the Arachnide repository, `integrations/wordpress/arachnide-connector`).
2. In WordPress, go to Plugins → Add New → Upload Plugin, upload the zip and activate it.
3. Create an Application Password for the user Arachnide will use (Users → Profile). Use an Editor account for content fixes, an Administrator account if you also want redirects.
4. In Arachnide, set the site type to `wordpress`, with `user` and the application password (env `ARACHNIDE_WP_APP_PASSWORD`).

Application Passwords require HTTPS (except on local environments). If your host strips the `Authorization` header (some CGI/FastCGI setups), add to `.htaccess`: `SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1`.

== Frequently Asked Questions ==

= Does it change anything on activation? =

No. It only adds REST routes. Without an SEO plugin it also prints the SEO values Arachnide set (and nothing else); without Redirection it serves the redirects Arachnide created.

= How do I remove everything? =

Deactivate and delete the plugin. Values written into your SEO plugin's fields stay there, as if you had typed them yourself.

== Changelog ==

= 1.1.0 =
* JSON-LD structured data per post, page or term, output in wp_head (validated and re-encoded: no script injection).
* Internal link rewriting in post content (POST /link), with a WordPress revision so the previous content stays restorable.
* History of the last 200 changes with their previous value (GET /history).
* Translations: French, Spanish, German, Italian, Portuguese (Portugal and Brazil).
* Requires WordPress 6.0+.

= 1.0.0 =
* First release.
