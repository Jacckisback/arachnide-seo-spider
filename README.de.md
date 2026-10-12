<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — kostenloser Open-Source-Crawler für technisches SEO von Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <b>🇩🇪 Deutsch</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-8cc63f" alt="MIT-Lizenz"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 oder neuer">
  <img src="https://img.shields.io/badge/Systeme-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** ist ein kostenloser Crawler für technisches SEO, der auf Ihrem eigenen Computer läuft. Wie Screaming Frog SEO Spider durchsucht er eine Website so, wie Googlebot es tut, und macht aus dem Crawl ein vollständiges Audit. Sie erhalten einen Health Score, über 50 Prüfungen mit Erklärung und Lösung sowie CSV-Exporte, die Sie direkt an Kunden weitergeben können.

Kein Konto, keine Cloud, kein Seitenlimit: Ihre Daten bleiben auf Ihrem Rechner.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard mit SEO-Health-Score, Statuscodes, Klicktiefe und gefundenen Problemen" width="100%">
</p>

## ✨ Funktionen

| | |
|---|---|
| 🩺 **Health Score & Probleme** | Über 50 Prüfungen, eingeteilt in Fehler, Warnungen und Hinweise. Zu jedem Problem: Erklärung, Lösung und betroffene URLs. |
| 🔗 **Statuscodes** | 2xx / 3xx / 4xx / 5xx, Timeouts und durch robots.txt blockierte URLs. |
| 🏷️ **Titles & Meta Descriptions** | Fehlend, doppelt, zu lang oder zu kurz, mehrfach vorhanden, Title identisch mit H1. Mit Google-SERP-Vorschau. |
| 📑 **Überschriften** | H1 fehlend, doppelt oder mehrfach; Seiten ohne H2. |
| 📝 **Inhalt** | Wortanzahl, Thin Content, exakt doppelte Seiten, Text-zu-HTML-Verhältnis, `lang`-Attribut. |
| 🖼️ **Bilder** | Fehlender Alt-Text, große Bilder, defekte Bilder. |
| 🧭 **Canonicals & Direktiven** | Selbstreferenzierend, kanonisiert, fehlend, mehrfach oder auf eine nicht indexierbare URL zeigend. `noindex`, `nofollow`, `X-Robots-Tag`. |
| ↪️ **Weiterleitungen** | Ketten, Schleifen, temporäre 302/307-Weiterleitungen und Weiterleitungen auf die Startseite (Soft 404). |
| ❌ **Defekte Links** | Quellseite, defekter Link, Ankertext und Statuscode, für interne und (optional) externe Links. |
| 🗺️ **XML-Sitemaps** | Verwaiste Seiten, nicht indexierbare URLs in der Sitemap, indexierbare Seiten, die in der Sitemap fehlen. |
| 🕸️ **Interne Verlinkung** | Echte Klicktiefe ab der Startseite, eingehende Links mit Ankertexten, ausgehende Links, schwach verlinkte Seiten. |
| 🌍 **Hreflang & strukturierte Daten** | Fehlende hreflang-Rückverweise, JSON-LD- und Microdata-Typen, ungültiges JSON-LD. |
| ⚡ **Performance & URLs** | Langsame Serverantwort, großes HTML; URLs mit Großbuchstaben, Unterstrichen, Parametern, Umlauten oder Überlänge. |
| 📤 **Export & Verlauf** | Jede Tabelle lässt sich sortieren, filtern und als CSV exportieren (Excel-kompatibel). Jeder Crawl wird gespeichert und kann wieder geöffnet werden. |
| 🖥️ **Kommandozeile** | Crawlen im Terminal: Sie erhalten den Score, die Problemliste und versandfertige CSV-Dateien. |

## 📸 Screenshots

| Probleme mit Lösungen | SERP-Vorschau |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Problemliste mit Erklärung und Lösung"> | <img src="docs/screenshots/titles-serp.png" alt="Titles-Tab mit Google-SERP-Vorschau"> |
| **Interne Verlinkung & eingehende Links** | **Dunkelmodus** |
| <img src="docs/screenshots/internal-linking.png" alt="Tab Interne Verlinkung mit eingehenden Links"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard im Dunkelmodus"> |

## 🚀 Installation

### 1. Node.js installieren

Laden Sie die **LTS**-Version von **[nodejs.org](https://nodejs.org)** herunter und installieren Sie sie wie jedes andere Programm. Sie brauchen Version 18.17 oder neuer; empfohlen ist die aktuelle LTS. Ihre Version sehen Sie im Terminal mit `node -v`.

### 2. Arachnide herunterladen

- **Am einfachsten:** Klicken Sie oben auf dieser Seite auf den grünen Button **`<> Code`**, dann auf **Download ZIP**, und entpacken Sie die Datei.
- **Mit Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Starten

**Option A: Doppelklick** (installiert beim ersten Start alles und öffnet dann den Browser)

| System | Datei zum Doppelklicken |
|---|---|
| macOS | `start-mac.command`. Beim ersten Mal mit Rechtsklick → **Öffnen** starten, da macOS nicht signierte Skripte blockiert. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Option B: Terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Öffnen Sie dann **http://localhost:4000**, geben Sie eine Website-Adresse ein und klicken Sie auf **Crawler**.

Lassen Sie das Terminalfenster während der Nutzung offen. Mit `Ctrl + C` beenden Sie die App.

> ℹ️ Die Oberfläche ist derzeit auf Französisch. Wichtigste Buttons: **Crawler** = Crawl starten, **Arrêter** = stoppen, **Historique** = gespeicherte Crawls, **Problèmes** = Probleme, **Tableau de bord** = Dashboard.

## ⚙️ Crawl-Optionen

Klicken Sie vor dem Start auf **⚙ Options**:

- maximale Anzahl an URLs und maximale Tiefe
- gleichzeitige Anfragen, Pause zwischen Anfragen, Timeout
- User-Agent: Arachnide, Googlebot Desktop, Googlebot Smartphone oder Chrome
- URLs per Regex ein- oder ausschließen, z. B. nur `/blog/` oder alles außer `/wp-admin/`
- robots.txt beachten, XML-Sitemaps lesen, Canonicals folgen, Subdomains einbeziehen, URL-Parameter ignorieren
- externe Links prüfen und Bilder prüfen (Größe und Status)

## 🖥️ Kommandozeile

```bash
node src/cli.mjs https://www.beispiel.de --max 2000 --csv
node src/cli.mjs https://www.beispiel.de --ua googlebotMobile --external --images
node src/cli.mjs --help
```

Die CLI zeigt den Health Score und die Probleme an. Sie speichert den vollständigen Crawl als JSON, das Sie in der Oberfläche über **📂 Ouvrir** öffnen können. Mit `--csv` schreibt sie zusätzlich `_pages.csv` und `_problemes.csv`.

## 🛠️ Fehlerbehebung

| Meldung | Lösung |
|---|---|
| `cd: no such file or directory` | Sie sind nicht im richtigen Ordner. Geben Sie `cd` und den Pfad des entpackten Ordners ein, z. B. `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Gleiche Ursache: Führen Sie `npm install` **im** Arachnide-Ordner aus. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Ihr Terminal setzt eine Option, die Ihre Node-Version nicht kennt. Führen Sie `unset NODE_OPTIONS` aus (macOS/Linux) oder aktualisieren Sie Node.js auf die aktuelle LTS. |
| `EADDRINUSE: address already in use :::4000` | Arachnide läuft bereits, oder eine andere App nutzt Port 4000. Starten Sie es auf einem anderen Port: `PORT=4001 npm start`. |
| Manche Seiten zeigen keine H1 oder keinen Inhalt | Arachnide liest das vom Server gesendete HTML und führt kein JavaScript aus. Seiten, die komplett per JavaScript gebaut werden, wirken für ihn leer. |

## 🧪 Entwicklung

```bash
npm test
```

Die Tests crawlen eine kleine lokale Website mit absichtlichen SEO-Fehlern (`test/fixture-site.mjs`). Sie laufen über GitHub Actions auf Node 18, 20 und 22.

## 🗺️ Roadmap

- [ ] Oberfläche auf Englisch und Deutsch
- [ ] JavaScript-Rendering (Headless Chrome)
- [ ] Title-Breite in Pixeln
- [ ] Erkennung von Near-Duplicate-Inhalten
- [ ] PDF- / HTML-Auditbericht mit eigenem Branding
- [ ] Vergleich zweier Crawls

Vorschläge und Pull Requests sind willkommen: siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Verantwortungsvolle Nutzung

Crawlen Sie nur Websites, die Ihnen gehören oder die Sie prüfen dürfen. Bleiben Sie auf Kundenseiten bei 2 bis 5 gleichzeitigen Anfragen und fügen Sie bei Shared Hosting eine Pause hinzu. Die Oberfläche ist nur auf Ihrem Computer erreichbar (`127.0.0.1`).

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
      Ich habe Arachnide für meine eigenen technischen SEO-Audits entwickelt und teile es kostenlos mit der SEO-Community.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — SEO-Audits & Beratung<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — Französischkurse und Vorbereitung auf DELF / DALF / TCF
      </p>
      <p><b>Sie brauchen ein vollständiges SEO-Audit oder Hilfe beim Beheben der gefundenen Probleme?</b> <a href="https://thierrygustin.com/contact">Kontakt aufnehmen →</a></p>
    </td>
  </tr>
</table>

Wenn Arachnide Ihnen Zeit spart, hilft ein ⭐ auf GitHub sehr!

## 📄 Lizenz

[MIT](LICENSE) © 2026 Thierry Gustin. Frei nutzbar, veränderbar und teilbar, auch kommerziell.

<sub>Arachnide ist ein unabhängiges Projekt ohne Verbindung zu Screaming Frog Ltd. „Screaming Frog“ ist eine Marke ihres Inhabers.</sub>
