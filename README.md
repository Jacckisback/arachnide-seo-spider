<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — free, open-source technical SEO crawler by Thierry Gustin" width="100%">
</p>

<p align="center">
  <b>🇬🇧 English</b> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/version-2.1.0-3d5f17" alt="Version 2.1.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 or newer">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 languages">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** is a free technical SEO crawler that runs on your own computer, like Screaming Frog SEO Spider. It explores a website the way Googlebot does, **renders JavaScript** if you want, and turns the crawl into a prioritised audit:

- a health score out of 100 and a score for each category;
- **about 90 checks**, each with an explanation and a fix;
- an action plan ranked by impact and effort;
- a **white-label PDF report** for your clients, in 6 languages.

There is no account, no cloud and no page limit, and your data stays on your machine.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard: SEO health score, score by category, response codes, click depth and priorities" width="100%">
</p>

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
| <img src="docs/screenshots/home.png" alt="Home screen with recent crawls"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard in dark mode"> |

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
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
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
