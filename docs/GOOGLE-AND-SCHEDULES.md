# Google data & scheduled crawls (Arachnide 3.2)

## PageSpeed Insights & Core Web Vitals

Options → **Google** → *Pages to test* (e.g. 20). After the crawl, Arachnide sends the most important pages to PageSpeed Insights: the most-clicked pages when Search Console data is available, otherwise the home page and then the pages with the most internal links. For each page you get:

- the **Lighthouse performance score**;
- **field data from real Chrome users** (CrUX, 75th percentile): LCP, INP, CLS, FCP and TTFB, each rated good / needs improvement / poor. These are the values Google uses for ranking. Small pages often have *not enough traffic*; the origin-level values are then shown in the crawl summary.

New tab **Core Web Vitals**. New issues: *Poor Core Web Vitals*, *Core Web Vitals need improvement*, *Low PageSpeed score*.

**API key**: optional, but PageSpeed Insights limits anonymous requests. Getting one takes 2 minutes and is free:

1. Go to console.cloud.google.com and create a project.
2. Enable *PageSpeed Insights API*.
3. Open *Credentials → Create credentials → API key*.
4. Paste it in Options → Google, or set the `ARACHNIDE_PSI_KEY` environment variable.

## Google Search Console

Two ways to use it.

**1. CSV import (no setup)**

1. In Search Console, open *Performance → Search results*.
2. Pick the period, then *Export → Download CSV*, and unzip the file.
3. In Arachnide, open Options → Google → *Choose a CSV file*, then select **Pages.csv**.

It works with every interface language.

**2. API (automatic, needed for scheduled crawls)**

1. console.cloud.google.com → enable *Google Search Console API*.
2. *IAM → Service accounts → Create*, then *Keys → Add key → JSON*. Save the file on your computer, for example `~/arachnide-gsc.json`.
3. Search Console → *Settings → Users and permissions → Add user*: paste the service account email (`…@….iam.gserviceaccount.com`), with *Restricted* permission.
4. In Arachnide, open Options → Google and enter the **path** of the JSON file. The property is detected automatically: a domain property (`sc-domain:example.com`) or a URL-prefix property.

The key never leaves your computer. Arachnide signs a short-lived token with it and only reads data (`webmasters.readonly`).

You get a new **Search Console** tab with clicks, impressions, CTR and position for each crawled URL. The URLs Google knows but the crawl did not find are listed as *Not in crawl*.

The four new issues:

- **Pages seen by Google but not found by the crawl**: orphan pages, often with traffic.
- **Indexable pages with no impressions.**
- **Low CTR for the position**: the page is on page 1 but gets fewer than half the clicks expected at its position, so its title or description needs rework.
- **Non-indexable pages getting Google traffic.**

Command line: `--gsc-key ~/arachnide-gsc.json` or `--gsc-csv Pages.csv`, plus `--psi 20`. With Claude (MCP), use the `psi_pages`, `gsc_key_file` and `gsc_csv_path` parameters of `arachnide_crawl`.

## Scheduled crawls & email alerts

Click the **calendar** button in the header, then *Schedule a crawl*.

**Frequency**: daily, weekly or monthly, at the time you choose. A run missed because the computer was off is caught up at the next start. The current crawler configuration is saved with the schedule; passwords are not.

**Alerts**: an email is sent when one of the rules you tick is met:

- the score drops by N points or more;
- errors appear or increase (4xx, 5xx, broken links, …);
- a new type of issue appears;
- or always, which gives you a report after every crawl.

The email shows the alerts, a before/now table and how many issues were fixed. The full HTML report is attached (open it in a browser, print to PDF).

**Email settings (SMTP)** are in the same window. For Gmail: `smtp.gmail.com`, port `465`, tick *Secure connection*, your address and an **app password** (Google account → Security → App passwords). Use *Send a test* to check them. You can also set everything in one variable: `ARACHNIDE_SMTP_URL=smtps://user:password@smtp.example.com:465`. The password is stored only in `~/.arachnide/smtp.json`, readable by your user only.

**When do scheduled crawls run?** They run while Arachnide is open (`npm start`). To run them without the interface, start `npm run scheduler` when your computer starts:

- **macOS**: a LaunchAgent, or `pm2 start npm --name arachnide -- run scheduler`;
- **Windows**: Task Scheduler → *At log on* → `npm run scheduler` in the Arachnide folder;
- **Linux**: a systemd user service or `@reboot` in crontab.

Already using cron? Then `node src/cli.mjs https://example.com --alert-email you@example.com --alert-score-drop 5` crawls, compares with the previous crawl and emails you only when something got worse.
