<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — kostenloser Open-Source-Crawler für technisches SEO von Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <b>🇩🇪 Deutsch</b> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT-Lizenz"></a>
  <img src="https://img.shields.io/badge/version-2.1.0-3d5f17" alt="Version 2.1.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 oder neuer">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 Sprachen">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** ist ein kostenloser Crawler für technisches SEO, der auf Ihrem eigenen Computer läuft, ähnlich wie Screaming Frog SEO Spider. Er durchsucht eine Website so wie der Googlebot, **rendert auf Wunsch JavaScript** und macht aus dem Crawl ein priorisiertes Audit:

- einen Health Score von 100 Punkten und eine Bewertung für jede Kategorie;
- **rund 90 Prüfungen**, jeweils mit Erklärung und Lösung;
- einen Maßnahmenplan, sortiert nach Wirkung und Aufwand;
- einen **White-Label-PDF-Bericht** für Ihre Kunden, in 6 Sprachen.

Es gibt kein Konto, keine Cloud und kein Seitenlimit. Ihre Daten bleiben auf Ihrem Rechner.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard: SEO Health Score, Bewertung nach Kategorie, Statuscodes, Klicktiefe und Prioritäten" width="100%">
</p>

## 🆕 Neu in Version 2.1

| | |
|---|---|
| 🕸️ **2D- & 3D-Visualisierungen** | Sehen Sie die Architektur der Website in 2D oder 3D, in drei Ansichten: **Crawl-Baum** (kürzester Klickpfad von der Startseite), **Verzeichnisse** (URL-Struktur) und **Links** (alle verfolgten internen Links). Färben Sie die Knoten nach Indexierbarkeit, SEO-Problemen oder Tiefe; die Knotengröße zeigt den Link Score. Klicken Sie auf einen Knoten, um die Details der Seite zu sehen, und exportieren Sie die Ansicht als PNG für Ihre Berichte. |
| ⚙️ **Crawler-Konfiguration wie in Screaming Frog** | Ein Fenster **Konfiguration** mit Tabs: Spider, **Limits**, **Geschwindigkeit**, **robots.txt**, Rendering, Einschließen / ausschließen, Extraktion, Authentifizierung. Es enthält nur die Einstellungen, auf die es ankommt. |
| 🚧 **Spider › Limits** | Crawl-Gesamtzahl, Crawl-Tiefe, URLs pro Tiefe, Ordnertiefe, Anzahl der Query-Strings, zu folgende Weiterleitungen, URL-Länge, Links pro Seite, Seitengröße und **Limits nach URL-Pfad** (`/blog/ = 200`). Das Dashboard zeigt, wie viele URLs jedes Limit übersprungen hat. |
| 🤖 **robots.txt** | Drei Modi: **robots.txt beachten**, **robots.txt ignorieren, aber Status melden** (blockierte URLs werden gecrawlt und trotzdem markiert) und **robots.txt ignorieren**. Fügen Sie eine **benutzerdefinierte robots.txt** ein, um eine neue Datei vor der Veröffentlichung zu testen, und prüfen Sie mit dem integrierten **Tester**, ob eine URL erlaubt ist und welche Regel greift. |
| 🐢 **Geschwindigkeit** | Maximale Anzahl Threads plus eine globale Obergrenze an **URLs pro Sekunde**, um empfindliche Server zu schonen. |
| 🧲 **Benutzerdefinierte Extraktion** | Erfassen Sie beliebige Daten aus jeder Seite per CSS-Selektor oder regulärem Ausdruck: Preis, Autor, Datum, Artikelnummer, Tracking-Code… Die Ergebnisse erscheinen in einem Tab **Extraktion** und im CSV-Export. |
| 🔐 **Authentifizierung & URL-Bereinigung** | HTTP-Authentifizierung sowie benutzerdefinierte Header oder Cookies für Staging-Websites. Sie werden nur an die geprüfte Website gesendet, und das Passwort wird nie gespeichert. **Entfernen Sie URL-Parameter** wie `utm_*`, `gclid` oder `fbclid`, um doppelte URLs zu vermeiden. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="3D-Crawl-Baum, gefärbt nach SEO-Problemen" width="100%">
</p>

## ✨ Neu in Version 2.0

| | |
|---|---|
| 🌍 **6 Sprachen** | Die App, die CSV-Exporte und die Berichte gibt es auf Englisch, Französisch, Deutsch, Spanisch, Italienisch und Portugiesisch. Die Sprache wechseln Sie oben in der Kopfzeile. |
| ⚙️ **JavaScript-Rendering** | Prüft React-, Vue-, Angular- und Next.js-Websites so, wie Google sie sieht. Arachnide nutzt das Chrome oder Edge, das bereits auf Ihrem Computer installiert ist. Es wird also nichts zusätzlich heruntergeladen. Arachnide vergleicht das Roh-HTML mit der gerenderten Seite und misst **LCP und CLS**. |
| 📄 **Professionelle SEO-Berichte** | Ein White-Label-Auditbericht mit Ihrem Logo, Ihrer Farbe und Ihren Kontaktdaten. Er enthält eine Zusammenfassung für die Geschäftsführung, die wichtigsten Ergebnisse, Bewertungen nach Kategorie, einen priorisierten Maßnahmenplan, eine detaillierte Analyse und den **Fortschritt seit dem letzten Audit**. Mit einem Klick als PDF drucken. [Beispielbericht ansehen (PDF)](docs/sample-report.pdf). |
| 🎯 **Maßnahmenplan** | Jedes Problem wird nach Schweregrad × Wirkung × Anzahl URLs ÷ Aufwand eingestuft. Quick Wins werden hervorgehoben. |
| 🧠 **Neue SEO-Analysen** | Interner PageRank (Link Score), nahezu doppelte Inhalte (simhash), Keyword-Kannibalisierung, Breite von Title und Description in Pixeln, Kontextlinks im Vergleich zu Menü- und Footer-Links, generische Ankertexte, Überschriftenhierarchie, unvollständige strukturierte Daten, hreflang-Validierung, Komprimierung, HSTS und mehr. |
| 🤖 **KI & GEO** | Zeigt, ob ChatGPT, Claude, Perplexity, Google-Extended und andere KI-Crawler auf die Website zugreifen können und ob sie eine `llms.txt`-Datei hat. |
| 📋 **Listenmodus** | Prüft nur eine eingefügte Liste von URLs, ohne Links zu folgen. |
| 🔎 **Benutzerdefinierte Suche** | Findet alle Seiten, die einen Text oder einen regulären Ausdruck enthalten, zum Beispiel eine alte Telefonnummer oder einen Tracking-Code. |
| 🎨 **Neues Design** | Startbildschirm mit den letzten Crawls, Live-Fortschritt mit Geschwindigkeit und Restzeit, ein Detailbereich mit anpassbarer Größe, Tastaturnavigation (↑ ↓ Enter, `/` zum Suchen), Benachrichtigungen und Dunkelmodus. |

## 🔍 Was Arachnide prüft

| Bereich | Prüfungen |
|---|---|
| **Statuscodes** | 2xx / 3xx / 4xx / 5xx, Timeouts, durch robots.txt blockierte URLs, defekte interne und externe Links |
| **Weiterleitungen** | Ketten, Schleifen, temporäre 302/307-Weiterleitungen, Meta-Refresh, Weiterleitungen auf die Startseite (Soft 404), interne Links auf Weiterleitungen |
| **Titles & Metas** | Fehlend, doppelt, zu lang (in Pixeln), zu kurz oder mehrfach; Title identisch mit H1; Google-SERP-Vorschau |
| **Überschriften** | H1 fehlend, doppelt oder mehrfach; keine H2; übersprungene Überschriftenebenen |
| **Inhalt** | Wortanzahl, dünner Inhalt, exakte und nahezu doppelte Inhalte, Keyword-Kannibalisierung, Haupt-Keyword pro Seite, Textanteil |
| **Bilder** | Fehlender Alt-Text, schwere Bilder, defekte Bilder, fehlende width/height (CLS), jede Datei aus `srcset` und `<picture>` geprüft (Größe, Status, Format), keine responsive Version, kein WebP / AVIF, `srcset` ohne `sizes` |
| **Indexierung** | Canonicals (fehlend, mehrfach, auf eine nicht indexierbare URL verweisend), noindex, nofollow, X-Robots-Tag |
| **Architektur** | Klicktiefe, Link Score (interner PageRank), verwaiste Seiten, Seiten mit nur einem eingehenden Link oder ohne Kontextlink, nicht erreichbare Seiten |
| **Sitemaps** | Fehlende Sitemap, nicht indexierbare URLs in der Sitemap, indexierbare Seiten, die in der Sitemap fehlen |
| **International** | Ungültige hreflang-Codes, fehlende Rückverweise, fehlender Selbstverweis, fehlendes x-default |
| **Strukturierte Daten** | Gefundene Typen (JSON-LD, Microdata), ungültiges JSON-LD, fehlende Eigenschaften für Rich Results (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Inhalt, Links, Title, H1, Canonical oder noindex durch JavaScript verändert; JS-Fehler; LCP und CLS |
| **Performance & Sicherheit** | Antwortzeit, HTML-Größe, Komprimierung, HTTPS, HSTS, gemischte Inhalte |
| **URLs** | Großbuchstaben, Unterstriche, Parameter, Akzente, Länge |
| **KI & GEO** | Zugriff für Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…; llms.txt |

## 📸 Screenshots

| Probleme mit Lösungen | Priorisierter Maßnahmenplan |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Problemliste mit Erklärung, Wirkung, Aufwand und Lösung"> | <img src="docs/screenshots/action-plan.png" alt="Maßnahmenplan mit Quick Wins"> |
| **Google-SERP-Vorschau (Pixelbreite)** | **Interne Verlinkung, Link Score & eingehende Links** |
| <img src="docs/screenshots/titles-serp.png" alt="Titles-Tab mit Google-Vorschau und Pixelanzeige"> | <img src="docs/screenshots/internal-linking.png" alt="Tab Interne Verlinkung mit Link Score und Bereich für eingehende Links"> |
| **White-Label-Berichtseinstellungen** | **Professioneller Auditbericht** |
| <img src="docs/screenshots/report-dialog.png" alt="Berichtsdialog mit Logo, Farbe, Kunde und Vergleich"> | <img src="docs/screenshots/report.png" alt="Zusammenfassung des Auditberichts"> |
| **Crawl-Baum (2D)** | **Link-Graph (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="2D-Crawl-Baum"> | <img src="docs/screenshots/viz-link-graph.png" alt="Kräftebasierter Graph der internen Links"> |
| **Verzeichnisbaum** | **Benutzerdefinierte Extraktion** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Visualisierung des Verzeichnisbaums"> | <img src="docs/screenshots/custom-extraction.png" alt="Tab Extraktion mit per CSS-Selektor extrahierten Preisen"> |
| **Konfiguration › Limits** | **Konfiguration › robots.txt (mit Tester)** |
| <img src="docs/screenshots/config-limits.png" alt="Einstellungen für die Spider-Limits"> | <img src="docs/screenshots/config-robots.png" alt="robots.txt-Modi, benutzerdefinierte robots.txt und Tester"> |
| **Startbildschirm** | **Dunkelmodus** |
| <img src="docs/screenshots/home.png" alt="Startbildschirm mit den letzten Crawls"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard im Dunkelmodus"> |

## 🚀 Installation

### 1. Node.js installieren

Laden Sie die **LTS**-Version von **[nodejs.org](https://nodejs.org)** herunter und installieren Sie sie wie jedes andere Programm. Sie benötigen Version 18.17 oder neuer; empfohlen wird die neueste LTS-Version. Um Ihre Version zu prüfen, öffnen Sie ein Terminal und geben Sie `node -v` ein.

Für das **JavaScript-Rendering** muss außerdem Google Chrome, Microsoft Edge, Chromium oder Brave installiert sein. Arachnide findet den Browser automatisch.

### 2. Arachnide herunterladen

- **Am einfachsten:** Klicken Sie oben auf dieser Seite auf die grüne Schaltfläche **`<> Code`**, dann auf **Download ZIP**, und entpacken Sie die Datei.
- **Mit Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Starten

**Option A: Doppelklick.** Das Startskript installiert oder aktualisiert alles und öffnet dann Ihren Browser.

| System | Datei zum Doppelklicken |
|---|---|
| macOS | `start-mac.command`. Klicken Sie beim ersten Mal mit der rechten Maustaste darauf und wählen Sie **Öffnen**, da macOS unsignierte Skripte blockiert. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Option B: Terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Öffnen Sie dann **http://localhost:4000**. Geben Sie eine Website-Adresse ein und klicken Sie auf **Crawlen**.

Lassen Sie das Terminalfenster geöffnet, solange Sie die App nutzen. Mit `Ctrl + C` beenden Sie sie. Ist Port 4000 belegt, wählt Arachnide den nächsten freien Port und zeigt ihn im Terminal an.

**Update von 1.x:** Laden Sie die neue Version herunter (oder führen Sie `git pull` aus) und führen Sie dann erneut `npm install` aus. Die Startskripte für den Doppelklick erledigen das für Sie.

## 📄 Einen Kundenbericht erstellen

1. Crawlen Sie die Website.
2. Klicken Sie auf **Bericht**. Wählen Sie die Sprache des Berichts und fügen Sie dann Ihr Logo, Ihre Markenfarbe, den Kundennamen und Ihre Kontaktdaten hinzu. Ihre Einstellungen werden gespeichert.
3. Wählen Sie optional einen **früheren Crawl derselben Website**, um den Fortschritt zu zeigen: Veränderung der Bewertung, behobene Probleme und neue Probleme.
4. Klicken Sie auf **Bericht erstellen** und dann auf **Drucken / Als PDF speichern**.

Mit **Alle Probleme (CSV)** geben Sie Ihrem Kunden oder Entwickler die vollständige Liste der zu korrigierenden URLs.

## ⚙️ Konfiguration

Klicken Sie auf **⚙ Optionen**, um das Fenster **Konfiguration** zu öffnen. Ihre Einstellungen werden gespeichert, mit Ausnahme des Passworts.

| Tab | Einstellungen |
|---|---|
| Spider | XML-Sitemaps lesen, Canonicals folgen, Subdomains einbeziehen, externe Links und Bilder prüfen |
| Limits | Crawl-Gesamtzahl, Crawl-Tiefe, URLs pro Tiefe, Ordnertiefe, Query-Strings, zu folgende Weiterleitungen, URL-Länge, Links pro Seite, Seitengröße, Limits nach URL-Pfad (`/blog/ = 200`, eines pro Zeile) |
| Geschwindigkeit | Max. Threads, max. URLs pro Sekunde, Timeout |
| robots.txt | Beachten / ignorieren, aber Status melden / ignorieren, benutzerdefinierte robots.txt, URL-Tester |
| Rendering | JavaScript-Rendering, User-Agent (Arachnide, Googlebot Desktop/Smartphone, Chrome), Accept-Language |
| Einschließen / ausschließen | Regulärer Ausdruck zum Ein- und Ausschließen, URL-Parameter entfernen (`utm_*, gclid`), alle Parameter ignorieren, benutzerdefinierte Suche |
| Extraktion | Bis zu 20 Extraktoren: CSS-Selektor (Text, Attribut, HTML oder Anzahl) oder regulärer Ausdruck |
| Authentifizierung | HTTP-Benutzer und -Passwort, benutzerdefinierte Header (Cookies, Tokens) |

Mit dem Schalter **Website / Liste** neben dem Adressfeld crawlen Sie eine ganze Website oder nur eine Liste von URLs.

## 🕸️ Visualisierungen

Öffnen Sie nach einem Crawl **Visualisierungen** in der Seitenleiste:

- **Crawl-Baum:** Jede Seite ist mit der Seite verbunden, über die sie auf der vorherigen Klicktiefe erreicht wurde. Lange Äste bedeuten tief liegende Seiten.
- **Verzeichnisse:** die URL-Struktur, Ordner für Ordner. So erkennen Sie unausgewogene oder zu tief verschachtelte Bereiche.
- **Links:** der vollständige Graph der internen Links. Gut verlinkte Seiten sammeln sich in der Mitte, isolierte Seiten treiben an den Rand.

Wechseln Sie zwischen **2D** und **3D**, färben Sie nach Indexierbarkeit, Problemen oder Tiefe, wählen Sie, wie viele Knoten angezeigt werden (bis zu 6.000), klicken Sie auf einen Knoten, um seine Details zu öffnen, und exportieren Sie ein PNG für Ihre Berichte.

## 🖥️ Kommandozeile

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang de
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

Die CLI gibt die Bewertung und die Probleme in Ihrer Sprache aus. Sie speichert den Crawl als JSON, das Sie in der Oberfläche über **📂** öffnen können. Mit `--csv` exportiert sie außerdem Seiten und Probleme, und mit `--report` erstellt sie einen HTML-Auditbericht in Ihrem Branding, den Sie als PDF drucken können.

## 🛠️ Fehlerbehebung

| Meldung | Lösung |
|---|---|
| `cd: no such file or directory` | Sie sind nicht im richtigen Ordner. Geben Sie `cd` gefolgt vom Pfad des entpackten Ordners ein, z. B. `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Gleiche Ursache: Führen Sie `npm install` **im** Arachnide-Ordner aus. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Ihre Shell setzt eine Option, die Ihre Node-Version nicht unterstützt. Führen Sie `unset NODE_OPTIONS` aus (macOS/Linux) oder aktualisieren Sie Node.js auf die neueste LTS-Version. |
| JavaScript-Rendering ist nicht verfügbar | Installieren Sie Google Chrome. Ist es an einem ungewöhnlichen Ort installiert, starten Sie Arachnide mit `CHROME_PATH="/path/to/chrome" npm start`. |
| Einige Seiten zeigen keine H1 oder keinen Inhalt | Die Website erzeugt ihren Inhalt wahrscheinlich mit JavaScript. Aktivieren Sie **JavaScript-Rendering** in den Optionen. |

## 🧪 Entwicklung

```bash
npm test
```

Die Tests crawlen eine kleine lokale Website mit absichtlich eingebauten SEO-Fehlern (`test/fixture-site.mjs`). Sie decken das JavaScript-Rendering, den Listenmodus, die Berichte in allen Sprachen und die Vollständigkeit der Übersetzungen ab. Sie laufen über GitHub Actions auf Node 18, 20 und 22.

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

**Eine Sprache hinzufügen:** Kopieren Sie `public/i18n/en.js`, übersetzen Sie die Werte und fügen Sie die Sprache zu `LANGS` in `public/shared/i18n.js` hinzu. `npm test` prüft, dass kein Schlüssel und kein Platzhalter fehlt.

## 🗺️ Roadmap

- [ ] Felddaten aus PageSpeed Insights / CrUX
- [ ] Integration der Google Search Console (Klicks und Impressionen pro URL)
- [ ] Geplante Crawls mit E-Mail-Benachrichtigungen
- [ ] Import eines CSV-Exports aus der Google Search Console (verwaiste Seiten, die nur in der GSC auftauchen)
- [x] Benutzerdefinierte Extraktion (2.1)
- [x] 2D- / 3D-Visualisierungen der Website-Architektur (2.1)

Vorschläge und Pull Requests sind willkommen. Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Verantwortungsvolle Nutzung

Crawlen Sie nur Websites, die Ihnen gehören oder die Sie prüfen dürfen. Bleiben Sie bei Kunden-Websites bei 2 bis 5 gleichzeitigen Anfragen und fügen Sie bei Shared Hosting eine Pause ein. Die Oberfläche ist nur auf Ihrem Computer erreichbar (`127.0.0.1`).

---

## 👤 Autor

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p>Freiberuflicher <b>SEO-Berater</b> und Französischlehrer in <b>Madrid</b> 🇪🇸🇫🇷.<br>
      Ich habe Arachnide für meine eigenen technischen SEO-Audits entwickelt und stelle es der SEO-Community kostenlos zur Verfügung.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — SEO-Audits & Beratung<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — Französischkurse und Vorbereitung auf DELF / DALF / TCF
      </p>
      <p><b>Sie brauchen ein vollständiges SEO-Audit oder Hilfe beim Beheben der Probleme, die Arachnide gefunden hat?</b> <a href="https://thierrygustin.com/contact">Kontakt aufnehmen →</a></p>
    </td>
  </tr>
</table>

Wenn Arachnide Ihnen Zeit spart, hilft ein ⭐ auf GitHub sehr!

## 📄 Lizenz

[MIT](LICENSE) © 2026 Thierry Gustin. Sie dürfen es frei nutzen, verändern und weitergeben, auch für kommerzielle Arbeiten.

<sub>Arachnide ist ein unabhängiges Projekt und steht in keiner Verbindung zu Screaming Frog Ltd. „Screaming Frog“ ist eine Marke ihres Inhabers.</sub>
