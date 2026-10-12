<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — free, open-source technical SEO crawler by Thierry Gustin" width="100%">
</p>

<p align="center">
  <b>🇬🇧 English</b> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 or newer">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** is a free technical SEO crawler you run on your own computer. Like Screaming Frog SEO Spider, it explores a website the way Googlebot does and turns the crawl into a full audit. You get a health score, more than 50 checks, each with an explanation and a fix, and CSV exports you can hand to a client.

No account, no cloud and no page limit: your data stays on your machine.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard with SEO health score, status codes, click depth and detected issues" width="100%">
</p>

## ✨ Features

| | |
|---|---|
| 🩺 **Health score & issues** | Over 50 checks ranked as errors, warnings and notices. Each issue explains the problem, how to fix it and which URLs it affects. |
| 🔗 **Response codes** | 2xx / 3xx / 4xx / 5xx, timeouts and URLs blocked by robots.txt. |
| 🏷️ **Titles & meta descriptions** | Missing, duplicate, too long or too short, multiple tags, title identical to the H1. Includes a Google SERP preview. |
| 📑 **Headings** | H1 missing, duplicate or multiple; pages without an H2. |
| 📝 **Content** | Word count, thin content, exact duplicate pages, text-to-HTML ratio, `lang` attribute. |
| 🖼️ **Images** | Missing alt text, heavy images, broken images. |
| 🧭 **Canonicals & directives** | Self-referencing, canonicalised, missing, multiple, or pointing to a non-indexable URL. `noindex`, `nofollow`, `X-Robots-Tag`. |
| ↪️ **Redirects** | Chains, loops, temporary 302/307 redirects, and redirects to the homepage (soft 404s). |
| ❌ **Broken links** | Source page, broken link, anchor text and status code, for internal links and (optionally) external ones. |
| 🗺️ **XML sitemaps** | Orphan pages, non-indexable URLs in the sitemap, indexable pages missing from it. |
| 🕸️ **Internal linking** | Real click depth from the homepage, inlinks with anchor texts, outlinks, poorly linked pages. |
| 🌍 **Hreflang & structured data** | Missing hreflang return links, JSON-LD and microdata types, invalid JSON-LD. |
| ⚡ **Performance & URLs** | Slow server response, heavy HTML; URLs with uppercase letters, underscores, parameters, accents, or too long. |
| 📤 **Exports & history** | Every table can be sorted, filtered and exported to CSV (opens in Excel). Every crawl is saved and can be reopened later. |
| 🖥️ **CLI** | Crawl from the terminal and get the score, the list of issues and CSV files ready to send. |

## 📸 Screenshots

| Issues with fixes | SERP preview |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Issue list with explanation and fix"> | <img src="docs/screenshots/titles-serp.png" alt="Titles tab with Google SERP preview"> |
| **Internal linking & inlinks** | **Dark mode** |
| <img src="docs/screenshots/internal-linking.png" alt="Internal linking tab with inlinks panel"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard in dark mode"> |

## 🚀 Installation

### 1. Install Node.js

Download the **LTS** version from **[nodejs.org](https://nodejs.org)** and install it like any other program. You need version 18.17 or newer; the latest LTS is recommended. To check your version, open a terminal and type `node -v`.

### 2. Download Arachnide

- **Easiest:** click the green **`<> Code`** button at the top of this page, then **Download ZIP**, and unzip the file.
- **With Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Start it

**Option A: double-click** (installs everything the first time, then opens your browser)

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

Then open **http://localhost:4000**, type a website address and click **Crawler**.

Keep the terminal window open while you use the app. Press `Ctrl + C` to stop it.

> ℹ️ The interface is currently in French. Main buttons: **Crawler** = start crawl, **Arrêter** = stop, **Historique** = saved crawls, **Problèmes** = issues, **Tableau de bord** = dashboard.

## ⚙️ Crawl options

Click **⚙ Options** before starting a crawl:

- maximum number of URLs and maximum depth
- number of simultaneous requests, pause between requests, timeout
- user-agent: Arachnide, Googlebot desktop, Googlebot smartphone or Chrome
- include / exclude URLs with a regex, for example only `/blog/`, or excluding `/wp-admin/`
- respect robots.txt, read XML sitemaps, follow canonicals, include subdomains, ignore URL parameters
- check external links, and check images (size and status)

## 🖥️ Command line

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv
node src/cli.mjs https://www.example.com --ua googlebotMobile --external --images
node src/cli.mjs --help
```

The CLI prints the health score and the issues. It saves the full crawl as JSON, which you can open in the interface with **📂 Ouvrir**. With `--csv`, it also writes `_pages.csv` and `_problemes.csv`.

## 🛠️ Troubleshooting

| Message | Fix |
|---|---|
| `cd: no such file or directory` | You are not in the right folder. Use `cd` followed by the path of the unzipped folder, e.g. `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Same cause: run `npm install` **inside** the Arachnide folder. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Your shell sets an option your Node version doesn't support. Run `unset NODE_OPTIONS` (macOS/Linux), or update Node.js to the latest LTS. |
| `EADDRINUSE: address already in use :::4000` | Arachnide is already running, or another app uses port 4000. Start it on another port: `PORT=4001 npm start`. |
| Some pages show no H1 or no content | Arachnide reads the HTML sent by the server and doesn't run JavaScript. Pages built entirely in JavaScript look empty to it. |

## 🧪 Development

```bash
npm test
```

The tests crawl a small local website with deliberate SEO mistakes (`test/fixture-site.mjs`). They run on Node 18, 20 and 22 through GitHub Actions.

```
src/
  crawler.mjs   crawl engine (queue, concurrency, robots.txt, sitemaps, redirects)
  parse.mjs     HTML extraction (titles, metas, headings, links, images, schema…)
  analyze.mjs   link graph, click depth, duplicates and SEO checks
  robots.mjs    robots.txt parser (Google rules)
  server.mjs    local web server and API, with live updates
  cli.mjs       command-line interface
public/         web interface (HTML/CSS/JS, no framework)
```

## 🗺️ Roadmap

- [ ] English and German interface
- [ ] JavaScript rendering (headless Chrome)
- [ ] Title width in pixels
- [ ] Near-duplicate content detection
- [ ] PDF / HTML audit report with your own branding
- [ ] Compare two crawls

Suggestions and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Responsible use

Only crawl websites you own or are allowed to audit. On client websites, keep 2 to 5 simultaneous requests and add a pause on shared hosting. The interface listens only on your computer (`127.0.0.1`).

---

## 👤 Author

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin" style="border-radius:50%">
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
      <p><b>Need a full SEO audit or help fixing the issues Arachnide found?</b> <a href="https://thierrygustin.com/contact">Get in touch →</a></p>
    </td>
  </tr>
</table>

If Arachnide saves you time, a ⭐ on GitHub helps a lot!

## 📄 License

[MIT](LICENSE) © 2026 Thierry Gustin. Free to use, modify and share, including for commercial work.

<sub>Arachnide is an independent project. It is not affiliated with Screaming Frog Ltd. "Screaming Frog" is a trademark of its owner.</sub>
