# Sitemap changes: audit only what changed

*Version française : [SITEMAP-CHANGES.fr.md](SITEMAP-CHANGES.fr.md)*

On a shop or a catalogue, products come and go every week. Recrawling the whole site to find out what happened to the ones that left is slow and useless: the question is only *what do the removed URLs answer now, and what should we do with each one*. Arachnide 3.23 answers it without recrawling the site.

Give it the current sitemap (a single file or a **sitemap index with its sub-sitemaps**) and a reference (a previous crawl, the old sitemap, or a URL list). It compares the two, crawls **only the URLs that left** the sitemap (or the ones that arrived, or both), **follows their redirects** to know the final code, and gives one decision per URL.

## The decisions

| Decision | The URL now… | What to do |
|---|---|---|
| **301 to the suggested page** (`redirect-suggested`) | answers 404 | Redirect it to the closest page still in the sitemap: same folder, similar name (`chaussure-rouge-41` → `chaussure-rouge-42`). The similarity score (0–100) says how close. Check it, then apply. |
| **Return 410** (`gone-410`) | answers 404, nothing similar | Return 410 so search engines drop it faster. If a relevant page exists elsewhere, redirect to it instead. |
| **Fix the redirect** (`redirect-broken`) | redirects to a 4xx / 5xx, a loop, or a chain that never ends | Point the redirect at a live page (200). |
| **Fix the server error** (`error`) | answers 5xx, times out, or 401 / 403 / 429 | Fix it, or retire it properly (301 or 410). |
| **Still live** (`live`) | answers 200 and is indexable | Either put it back in the sitemap and keep it linked, or retire it (301 / 410) and remove internal links. The crawl cannot decide this one for you. |
| **Added but not indexable** (`added-bad`) | is new in the sitemap but not a 200 indexable page | Fix it or take it out of the sitemap. |
| **Shorten the chain** (`redirect-chain`) | redirects correctly, in several hops | Point the first redirect straight at the final page. |
| Redirect OK, gone OK, out of the index, added OK | — | Nothing to do. |

The decisions that need work are also **SEO issues** (`sitemap-removed-404`, `sitemap-removed-redirect-broken`, `sitemap-removed-error`, `sitemap-removed-live`, `sitemap-added-not-indexable`, `sitemap-removed-redirect-chain`), with severity, impact, effort and priority like the other checks, so they count in the score and appear in the action plan and the client report.

## In the app

1. Switch the top bar to **List** mode. A new button (sitemap icon) opens the *List mode options*.
2. **Sitemap or sitemap index URL**: paste it. Pasting URLs in the text field still works and takes precedence over the sitemap.
3. **Compare with**: pick a previous crawl of the same site from the history. The reference of a previous crawl is the list of its sitemap URLs (spider mode), its list (list mode), or, for a previous *changes* crawl, the full sitemap it read that day. The first time, crawl the sitemap once without comparison; next time, compare with it.
4. **Crawl**: the URLs removed from the sitemap (default), the ones added, or both. *Follow the redirects* is on, so the final code is known.
5. Save, then start the crawl. The **Sitemap changes** tab lists every changed URL with its code, decision, suggested target, redirect chain and indexability; the *To do* filter is on by default and every filter exports to CSV. The dashboard gets a card with the counts and the related issues; the page detail panel says *Removed* / *Added*.

The options are remembered. Clearing them brings the plain list mode back.

## Command line

```bash
# Day 1: crawl the sitemap once (any crawl of the site works as a reference)
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --out crawls

# Later: only the URLs that left the sitemap since that crawl, with decisions
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --sitemap-previous crawls/www.example.com_2026-10-01T06-00-00.jsonl.gz --csv --report

# The reference can also be an old sitemap (file, .gz or URL) or a text list of URLs
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --sitemap-previous old-sitemap.xml.gz --sitemap-changes both --csv
node src/cli.mjs --list today.txt --sitemap-previous yesterday.txt --csv
```

| Option | Effect |
|---|---|
| `--sitemap-previous SRC` | The reference: a saved crawl (`.jsonl.gz` / `.json`), a sitemap or index (file, `.gz` or URL) or a text list (one URL per line). Needs `--sitemap` or `--list`. |
| `--sitemap-changes removed\|added\|both` | Which changed URLs to crawl (default `removed`) |

The summary prints the comparison and the decision counts; `--csv` writes `<crawl>_sitemap-changes.csv` (URL, change, code, indexability, redirect, final URL, final code, hops, decision, suggested target, similarity); the report gets a *Sitemap changes* section.

## AI agents (MCP, ChatGPT Actions, REST)

`arachnide_crawl` / `arachnide_start_crawl` take `sitemap_url` plus `sitemap_previous_crawl` (a crawl id from `arachnide_list_crawls`) or `sitemap_previous_urls` (the old sitemap's URLs), `sitemap_changes` (`removed` by default) and `follow_redirects`. Then **`arachnide_sitemap_changes`** reads the decisions: the comparison counts, and the rows filtered by `decision` (`actions` = everything that needs work, or one decision) or `change`, with a plain-language *what_to_do* per URL, paginated.

## How matching works

- The sitemap URLs and the reference go through **the same normalisation as the crawler** (sorted parameters, tracking parameters removed, `remove parameters` patterns), so `?utm_source=` variants never count as changes.
- A sitemap index is read breadth-first, image / video / news sitemaps included only if they list pages, up to 500 files.
- The suggested target is chosen among the URLs **still in the sitemap**: shared folders weigh 35 %, words shared by the last segment 65 %; below 34 % nothing is suggested and the decision becomes 410. The home page is never suggested.
- Redirect chains are followed up to 10 hops; a loop or a longer chain is *broken*. A redirect to another host is reported with its target and no final code.
- Each *changes* crawl keeps the full sitemap it read, so it can be the reference of the next one: run it weekly against the previous week.

## Limits

- The reference says nothing about *why* a URL left the sitemap; the *live* decision is deliberately left to you.
- A page removed from the sitemap but still linked internally keeps its links: run a spider crawl to find them (the *4xx* and *broken-internal* checks).
- The similarity is lexical (URL words), not semantic: `chaussure-rouge-41` finds `chaussure-rouge-42`, but `basket-rouge` does not find `sneaker-rouge`.
