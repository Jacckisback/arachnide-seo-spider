<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — free, open-source technical SEO crawler by Thierry Gustin" width="100%">
</p>

<p align="center">
  <b>🇬🇧 English</b> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/version-2.0.0-3d5f17" alt="Version 2.0.0">
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
| **Images** | Missing alt text, heavy images, broken images, missing width/height (CLS) |
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

## ⚙️ Crawl options

| Group | Options |
|---|---|
| Crawl | Max URLs, max depth, concurrent requests, delay between requests, timeout |
| Rendering | JavaScript rendering, user-agent (Arachnide, Googlebot desktop/smartphone, Chrome), Accept-Language |
| Scope | Include / exclude URLs with a regex, custom search, subdomains, ignore URL parameters |
| Checks | Respect robots.txt, read XML sitemaps, follow canonicals, check external links, check images |

Use the **Website / List** switch next to the address field to crawl a whole site or only a list of URLs.

## 🖥️ Command line

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang en
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
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
  server.mjs     local web server and API with live updates
  cli.mjs        command-line interface
public/
  app.js         web interface (no framework)
  i18n/*.js      translations (en, fr, de, es, it, pt)
  shared/        report generator, crawl comparison, i18n, icons (used by the UI and the CLI)
```

**Adding a language:** copy `public/i18n/en.js`, translate the values and add the language to `LANGS` in `public/shared/i18n.js`. `npm test` checks that no key or placeholder is missing.

## 🗺️ Roadmap

- [ ] PageSpeed Insights / CrUX field data
- [ ] Google Search Console integration (clicks and impressions per URL)
- [ ] Custom extraction (CSS selectors / XPath)
- [ ] Scheduled crawls with email alerts
- [ ] Interactive site architecture visualisation

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
