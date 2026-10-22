<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — kostenloser Open-Source-Crawler für technisches SEO von Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <b>🇩🇪 Deutsch</b> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="MIT-Lizenz"></a>
  <img src="https://img.shields.io/badge/version-3.21.0-3d5f17" alt="Version 3.21.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 oder neuer">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 Sprachen">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

<p align="center">🌐 Website und Dokumentation: <a href="https://arachnide-seo.com"><b>arachnide-seo.com</b></a></p>

---

**Arachnide** ist ein kostenloser Crawler für technisches SEO, der auf Ihrem eigenen Computer läuft, ähnlich wie Screaming Frog SEO Spider. Er durchsucht eine Website so wie der Googlebot, **rendert auf Wunsch JavaScript** und macht aus dem Crawl ein priorisiertes Audit:

- einen Health Score von 100 Punkten und eine Bewertung für jede Kategorie;
- **rund 90 Prüfungen**, jeweils mit Erklärung und Lösung;
- einen Maßnahmenplan, sortiert nach Wirkung und Aufwand;
- einen **White-Label-PDF-Bericht** für Ihre Kunden, in 6 Sprachen.

Es gibt kein Konto und keine Cloud. Ihre Daten bleiben auf Ihrem Rechner. Getestet auf einer synthetischen Site mit 200 000 Seiten (`npm run bench -- --pages 200000`); das Standardbudget sind 500 Seiten, in den Optionen anzuheben.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Übersicht: SEO Health Score mit vier Ringen (Technik, Inhalt, Verlinkung, Performance), Prioritäten, Kennzahlen und Stärken" width="100%">
</p>

## 🛡️ Neu in 3.21: Crawl-Leitplanken, XPath, Listenmodus per Sitemap und ein reproduzierbarer 200 000-Seiten-Benchmark

Das Seitenbudget zählt jetzt tatsächlich geladene Seiten (von robots.txt blockierte URLs verbrauchen es nicht mehr), URL-Parameter werden sortiert und Tracking-Parameter (`utm_*`, `gclid`, `fbclid`…) standardmäßig entfernt, Facetten-Fallen werden gemeldet, eine unerreichbare robots.txt verbietet alles, wie RFC 9309 verlangt (mit explizitem Ausweg), robots.txt wird im Listenmodus pro Host gelesen, 5xx und Netzabbrüche bekommen einen verzögerten Neuversuch, Antwortkörper werden als Stream gelesen und begrenzt, ein abgestürztes Chrome wird neu gestartet und gemeldet, und eine durchdrehende Regex-Extraktion wird in einem Worker abgebrochen. **XPath-Extraktion** ergänzt CSS und Regex (Chrome im Rendering, optionales jsdom auf rohem HTML); die CLI bekommt die Ziele `attr:` / `html:` / `count:` / `xpath:` mit einer CSV-Spalte pro Regel, **`--sitemap URL`** crawlt genau eine Sitemap, der Listenmodus geht bis 500 000 URLs, und KI-Agenten erhalten ebenfalls den Listenmodus. `npm run bench -- --pages 200000` crawlt eine lokale synthetische Site und zeigt Dauer, Spitzenspeicher und Dateigröße.

## 🖥️ Neu in 3.20: Skalierung, Schritt 5 — der Browser erhält nie mehr den ganzen Crawl

Der Server behält den Crawl und seinen Linkgraphen; der Browser erhält ein **leichtes Ergebnis als Stream** (Seiten reduziert auf das, was die Tabellen zeigen, ohne Links) und fragt den Rest bei Bedarf an: die Links einer Seite **seitenweise** im Detailbereich (kein stilles Abschneiden bei 1 000 mehr), den vollständigen Seitendatensatz per Klick, die Kanten der Sitemap nur für die angezeigten Knoten, und den Vergleich mit dem vorherigen Crawl als kleines, serverseitig berechnetes Diff. Einen gespeicherten Crawl öffnen oder eine Datei importieren schickt den Crawl nicht mehr hin und her; Exporte kommen als Stream vom Server. Tab-Zähler werden einmal pro Ergebnis berechnet.

## 🔬 Neu in 3.19: Skalierung, Schritt 4 — eine Analyse, die skaliert

**Jede Seite wird jetzt auf Beinahe-Duplikate verglichen**: Die alte Prüfung hielt bei den ersten 5 000 Seiten an, ohne es zu sagen. Die Suche ist exakt per Bändern auf dem 64-Bit-Fingerabdruck (zwei Seiten mit höchstens 5 Bit Abstand teilen immer ein Band), sodass eine Site mit 200 000 Seiten in Sekunden verglichen wird; eine stark templatebasierte Site wird gemeldet statt still gekürzt. **Kannibalisierung** läuft in linearer Zeit mit einem invertierten Index, und Ausdrücke, die mehr als 500 Seiten teilen, werden als Site-Template gemeldet. **Segmente** zählen ihre Links in einem Durchlauf statt einem pro Segment (475 ms statt ~16 s für 10 Segmente bei 20 Millionen Links), und die Korrekturregeln lesen den kompakten Graphen.

## 💾 Neu in 3.18: Skalierung, Schritt 3 — ein Crawl, der laufend geschrieben wird

Ein Crawl geht nie mehr durch einen einzigen String. Ergebnisse werden als **gezipptes NDJSON** gespeichert (ein JSON-Objekt pro Zeile, Links in Paketen), als Stream geschrieben und gelesen, atomar; die Historie liest nur die erste Zeile. Während des Crawls hält ein **Fortsetzungsjournal** jede eingereihte URL und jede fertige Seite fest: nach einem Absturz oder Strg+C setzt `--resume` (oder `POST /api/crawl { resume }`) den Crawl dort fort, wo er stand, und verliert nur die letzten Sekunden. Gespeicherte Crawls gehen zeilenweise an den Browser, nachträglich geänderte Segmente in eine kleine Nebendatei, und die Kommandozeile schreibt JSON, CSV und Bericht jeweils als Stream und unabhängig voneinander. Alte `.json`-Crawls öffnen weiterhin. Nächster Schritt: leichtere Seiten und Links auf Abruf im Browser.

## 🧮 Neu in 3.17: Skalierung, Schritt 2 — ein kompakter Linkgraph

Ein Link war ein JavaScript-Objekt mit sieben Eigenschaften und zwei URL-Strings; die Analyse kopierte ihn in Maps von Sets und in ein Tupel-Array. Links liegen jetzt in **Integer-Spalten** (URLs und Ankertexte einmal gespeichert, 14 Bytes pro Link) und die Analyse läuft auf einem **CSR-Graphen**: eingehende Links, Klicktiefe, PageRank und Linkprüfungen lesen dieselben Spalten, ohne Objekt pro Link. Gemessen an 50 000 Seiten × 100 Links: Linkspeicher 690 MB → 55 MB, Analyse 29 s / 2,5 GB → 5,5 s / 647 MB, gleiche Ergebnisse. Ein Crawl mit 200 000 Seiten und 20 Millionen Links kommt jetzt durch die Analyse. Der gespeicherte `links`-Block ist spaltenorientiert; alte Crawl-Dateien öffnen weiterhin. Nächster Schritt: Datei und Browserdaten als Stream schreiben.

## 🏗️ Neu in 3.16: Skalierung, Schritt 1 — große Sites stürzen am Ende nicht mehr ab

Eine technische Prüfung an einem Crawl mit 200 000 Seiten zeigte: Die Engine skaliert, einige Zeilen der Datenverarbeitung nicht. Ein `Math.min(...)` über einen Wert pro URL ließ die Analyse ab ~125 000 URLs abstürzen (nach Stunden Crawl), und mehrere Schleifen waren quadratisch. **Vierzehn kleine Korrekturen**: kein Spread mehr auf Arrays in Site-Größe, einmal gebaute Indizes (Weiterleitungen, ausgehende Links, nächste URL für 404 mit Suche zuerst im Elternordner), KI-Beispiele aus demselben Ordner, Tabellensortierung 20× schneller (ein `Intl.Collator`), Ordnerzählung der Sitemap 5× schneller, beendete Crawl-Jobs behalten nur eine Zusammenfassung, und **atomares Schreiben**, damit ein Abbruch beim Speichern nie einen abgeschnittenen Crawl hinterlässt. Die nächsten Schritte verdichten die Linkspeicherung und streamen die Datei und die Daten für den Browser.

## 📊 Neu in 3.15: Google Analytics 4 — verwaiste Seiten mit Traffic

Verbinden Sie **Google Analytics 4** (API mit Dienstkonto oder CSV-Export „Seiten und Bildschirme“), um die Sitzungen jeder Seite zu sehen und zu finden, was ein Crawl allein übersieht: **verwaiste Seiten mit Besuchen**, **Fehlerseiten, die noch besucht werden**, nicht indexierbare Seiten mit Traffic und Seiten ohne Besuche. Neuer Tab *Google Analytics*, 4 neue Prüfungen, *GA4-Sitzungen* in Segmenten, CLI `--ga4-key` / `--ga4-csv` und Unterstützung für KI-Agenten.

## 🧩 Neu in 3.14: Segmente — große Websites Bereich für Bereich auditieren

Auf einer großen Website verdeckt ein globaler Score, wo die Probleme wirklich liegen. **Segmente** teilen das Audit in benannte Bereiche — Produktseiten, Kategorien, Blog, eine Sprache, Seiten ohne Traffic … — genau wie die Segmente von Screaming Frog.

- **Regeln auf jedem Feld**: Pfad, URL, Title, H1, Meta Description, Status, Indexierbarkeit, Klicktiefe, Wörter, eingehende Links, Link Score, Antwortzeit, Sitemap, Typ strukturierter Daten, Sprache, Search-Console-Klicks und Ihre **benutzerdefinierten Extraktionen**. Text-, Zahl- und Wahr/Falsch-Operatoren, kombiniert mit UND / ODER.
- **Das erste passende Segment gewinnt**: Reihenfolge festlegen, der Rest landet in *Ohne Segment*. Seitenzahlen live beim Bearbeiten.
- **Ein Klick zum Start**: *Aus Verzeichnissen erstellen* legt ein Segment pro Verzeichnis der ersten Ebene an.
- **Nach dem Crawl angewendet, ohne erneutes Crawlen**, mit dem Crawl gespeichert und für die nächsten Crawls übernommen. JSON-Import / -Export.
- **Ein globaler Filter** in der Seitenleiste: die ganze App folgt dem Segment — Übersicht, Score, Probleme, Maßnahmenplan, Tabellen, CSV und PDF-Bericht —, mit derselben Methode neu berechnet.
- **Segmenttabelle in der Übersicht**, jedes Problem nach Segment aufgeteilt, Spalte *Segment*, *Farbe nach Segment* auf der Sitemap.
- **CLI**: `--segments segments.json`, `--segment-folders`, `--segment blog`. **KI-Agenten**: Tool `arachnide_segments` und Parameter `segment`.

<p align="center">
  <img src="docs/screenshots/segments.png" alt="Segments" width="100%">
</p>

## 🤝 Neu in 3.13: Binden Sie Ihren eigenen KI-Agenten (Claude, ChatGPT…) an Arachnide an

Arachnide wird zu den Augen und Händen Ihres SEO-/GEO-Agenten. Der Agent liest das geöffnete Audit, startet Crawls, die live in der App erscheinen, erkundet Seiten, ruft den priorisierten Maßnahmenplan und den neuen Bericht zur **GEO-Readiness** ab und korrigiert die Website mit Ihrer Zustimmung.

- **Drei Zugänge, 25 Tools**: MCP über stdio (Claude Code, Claude Desktop), **MCP über HTTP** (`/mcp`, für benutzerdefinierte Connectors in claude.ai und gehostete Agenten) und **REST + OpenAPI 3.1** (`/api/agent/*`, `/openapi.json` – mit einem Klick als ChatGPT Action importierbar). Überall dieselben Tools, nur einmal definiert.
- **Zugriffstoken**, beim ersten Start erstellt, in *Einstellungen → KI-Agenten* sichtbar und erneuerbar, mit fertigen Snippets zum Einfügen (Claude-Desktop-Konfiguration, ChatGPT-Action-Einstellungen, Testanfrage), einem Feld für die öffentliche URL bei Tunneln (cloudflared, ngrok, Tailscale) und dem Protokoll der letzten Agentenaufrufe.
- **Neue Tools**: `arachnide_action_plan` (der geordnete Plan der App, Quick Wins markiert), `arachnide_search_pages` (Seiten nach Link Score, Tiefe, Status, Ordner, Problem filtern und sortieren), `arachnide_geo_readiness` (Zugriff für KI-Crawler, llms.txt, strukturierte Daten, Inhaltstiefe → Score von 0-100 und Empfehlungen), `arachnide_start_crawl` + `arachnide_crawl_status` (Crawl im Hintergrund, live in der App sichtbar). `crawl_id: "current"` bezeichnet immer das in der App geöffnete Audit.
- Anleitung und empfohlener System-Prompt für einen SEO-/GEO-Agenten: [docs/AGENTS.md](docs/AGENTS.md).

## 🎨 Neu in 3.12: ein Design-Feinschliff für die gesamte App

Ein umfassendes UX-, Farb- und Typografie-Audit jeder Seite, in beiden Designs, auf Desktop und Mobilgerät – anschließend die Korrekturen.

- **Echte Typografie**: Die Schrift Inter Variable ist jetzt mitgeliefert (offline, SIL-OFL-Lizenz), sodass jede Schriftstärke auf jedem Rechner gleich dargestellt wird; 23 verstreute Schriftgrößen wurden zu einer Skala mit 8 Stufen, mit einheitlichen Überschriften, Rundungen und Abständen.
- **Gut lesbares helles Design**: Jeder farbige Text (Warnungen, OK-Zustände, Links, nachrangige Beschriftungen, Aufwands-Badges) erreicht auf seinem Hintergrund jetzt den WCAG-AA-Kontrast (4,5:1) – 103 gemessene Verstöße wurden auf 0 gesenkt.
- **Geschmeidigere Details**: Die Seite „Korrekturen“ funktioniert jetzt auch bei einem aus einer Datei geöffneten Crawl; das Seitendetail-Panel bleibt auf Seiten ohne Tabelle nicht mehr stehen; die ausgewählte Tabellenzeile ist sauber markiert; die Design-Schaltfläche zeigt, was sie bewirkt; der Simulationsschalter ist wieder sichtbar.

## 🧭 Neu in 3.11: Sitemap und 2D-/3D-Visualisierung nebeneinander

- **Sitemap** (Seitenleiste): die klassische Karte im Stil von Screaming Frog – weißer Hintergrund, horizontaler Baum, gemacht für Screenshots und Kundenberichte.
- **2D-/3D-Visualisierung** (neuer Tab, direkt darunter): die Erkundungsansicht – dunkler Stil, radiales Layout, in 2D oder 3D, standardmäßig nach SEO-Problemen eingefärbt.
- Beide Ansichten nutzen dieselben Daten, Filter, Suche und denselben Seiteninspektor; jede merkt sich ihre eigenen Einstellungen.

## 🌳 Neu in 3.10: eine klassische, präsentationsfertige Website-Karte

Eine übersichtlichere Karte, die Sie einem Kunden oder Vorgesetzten unverändert zeigen können — plus feinere Kontrolle darüber, was Sie crawlen und abbilden.

<p align="center"><img src="docs/screenshots/viz-classic-tree.png" alt="Website-Karte im Stil Klassisch: horizontaler Crawl-Baum auf weißem Hintergrund, ein Label pro Seite, lange Listen zusammengefasst als „+ N weitere Seiten“" width="100%"></p>

- **Klassischer Stil (neuer Standard)**: weißer Hintergrund, dünne Verbindungen, dunkle Labels — im Geist des Crawl-Baums von Screaming Frog. Der Stil *Dunkel* ist weiterhin einen Klick entfernt, in 2D wie in 3D.
- **Horizontaler Baum**: Startseite links, eine Spalte pro Ebene, ein Label pro Seite. Lange Listen werden zusammengefasst („+ 28 weitere Seiten“, Probleme ausgeblendeter Seiten bleiben markiert) und *Gesamte Liste anzeigen* klappt sie auf; die ausgewählte Seite bleibt immer sichtbar. In *Verzeichnisse* zeigt jedes Verzeichnis seinen Pfad relativ zum übergeordneten Verzeichnis, wie ein Datei-Explorer.
- **Exporte für Kunden**: PNG / PDF enthalten jetzt eine Kopfzeile (Website, Ansicht, Crawl-Datum, angezeigte Seiten), die Legende und den Kontext.
- **Keine erfundenen URLs**: In *Verzeichnisse* trägt eine Seite wie `/en` jetzt ihr Verzeichnis `/en/`, statt dass daneben eine falsche URL `/en/` erscheint; ein Verzeichnis ohne Seite unter seiner Adresse wird als Gruppierung dargestellt (`/blog/page/*`).
- **URLs in der Karte ein- / ausschließen**: ein Muster pro Zeile — einfacher Text (`/en/`), Platzhalter (`/en/*/page-*`) oder regulärer Ausdruck (`/en/(.*)`). Der Filter *Verzeichnis* funktioniert jetzt auf jeder Ebene (`/en/blog/`).
- **Crawl-Umfang**: Ein- / Ausschließen akzeptieren eine Regex pro Zeile, und die neue Option *Im Startverzeichnis bleiben* crawlt nur unterhalb des Verzeichnisses der Start-URL (wie das Abwählen von „Crawl Outside of Start Folder“ in Screaming Frog). Auf der Kommandozeile: `--include` / `--exclude` wiederholen, `--stay-in-folder` hinzufügen.
- **Robuster**: Ungültige Start-URLs (`htp:/x`, `javascript:…`, eine bloße Zahl) werden mit einer klaren Meldung abgelehnt, absurde Zahlen werden auf sichere Grenzen zurückgesetzt, ein Crawl, der sich nicht speichern lässt, meldet das. Neue End-to-End- und „Monkey“-Tests steuern bei jedem Testlauf die echte Oberfläche in einem Browser (zufällige Klicks, unsinnige Eingaben, Größenänderungen).

## 🕸️ Neu in 3.9: eine schnellere, übersichtlichere Website-Karte

Erkunden Sie die Struktur und finden Sie die zu verbessernden Seiten – in 2D oder 3D, auf Tausenden von Seiten.

<p align="center"><img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Website-Karte in 3D: Crawl-Baum mit beschrifteten Zweigen, ausgewählte Seite, Entdeckungspfad und Seiteninspektor" width="100%"></p>

- **Drei wirklich unterschiedliche Ansichten**: *Crawl-Baum* (jede Seite unter der Seite, über die sie auf dem kürzesten Weg von der Startseite erreicht wurde – der angezeigte Pfad entspricht immer der Klicktiefe), *Verzeichnisse* (URL-Pfade, virtuelle Ordner zählen nicht als Seiten) und *Interne Verlinkung* (die tatsächlich beobachteten, gerichteten Links, Zyklen inklusive).
- **Seiteninspektor**: Status, Indexierbarkeit (nur wenn bekannt), Tiefe, Link Score, Quellseiten, ausgehende Links, Entdeckungspfad, Probleme und vorhandene Empfehlung, mit *Zweig / Umgebung isolieren*, *Interne Links ansehen* und *Maßnahmenplan ansehen*.
- **Suche, Filter und Analysen** über alle gecrawlten Seiten (nicht nur die gezeichneten): SEO-Probleme, Tiefe, Verzeichnis, HTTP-Status, Indexierbarkeit, schwache eingehende Verlinkung mit ausdrücklichem Schwellenwert, Link-Score-Bereich – im Kontext hervorgehoben oder isoliert. Exporte (PNG, PDF, CSV) behalten Beschriftungen, Legende und Kontext; eine *Listen*-Ansicht ermöglicht die Bedienung per Tastatur.
- **Deutlich schneller**: deterministische Anordnung statt Physiksimulation für Bäume, Knoten und Links in wenigen Stapeln gezeichnet, Neuzeichnen nur bei Änderungen. Gemessen auf demselben Rechner (Software-Rendering): 3D-Stabilisierung von 5,5–13,9 s auf 0,7–3,2 s, 3D-Bildrate beim Drehen von 1–11 auf 46–60 Bilder/s.

## 🗺️ Neu in 3.8: ein Maßnahmenplan, mit dem Sie arbeiten können

Was zu beheben ist, in welcher Reihenfolge und wie – und wo Sie gerade stehen.

<p align="center"><img src="docs/screenshots/action-plan.png" alt="Maßnahmenplan: Übersichtskarten, priorisierte Roadmap mit Status und Methodenbereich der Maßnahme" width="100%"></p>

- **Vier Karten**: offene Maßnahmen (nach Schweregrad), Quick Wins (geringer Aufwand, mittlere oder hohe Wirkung), Korrekturaufwand und **Hier beginnen** – die erste Maßnahme der empfohlenen Reihenfolge.
- **Roadmap**: Jedes Problem wird zu einer Maßnahme mit klarem Verb, Rang, Schweregrad, SEO-Wirkung, eindeutigen URLs, Aufwand und Status. Filter (alle, Quick Wins, zu erledigen, zu prüfen, weitere Status), Suche und eine manuelle Sortierung, die die empfohlene Reihenfolge sichtbar ersetzt, bis Sie zurückwechseln.
- **Maßnahmenbereich**: warum hier beginnen (nur Fakten aus dem Crawl), nummerierte Methode, konkretes Kriterium „Erledigt, wenn…“, URLs ansehen / exportieren, Notiz und **Maßnahme starten → Als erledigt markieren → Crawl erneut starten zur Bestätigung**. Erst ein neuer Crawl, der das Problem nicht mehr findet, markiert es als gelöst.
- **Fortschritt** (Status und Notizen) wird pro Website im Browser gespeichert; per Mehrfachauswahl exportieren Sie die URLs mehrerer Maßnahmen oder ändern deren Status auf einmal.

## 🧭 Neu in 3.7: eine übersichtlichere Seite „SEO-Probleme“

Von der Diagnose zur Korrektur auf einem Bildschirm: was gefunden wurde, was zuerst zu beheben ist, wie schwer es wiegt, wie viele URLs betroffen sind und wie viel Aufwand es kostet.

<p align="center"><img src="docs/screenshots/issues.png" alt="Seite SEO-Probleme: Übersichtskarten, priorisierte Liste und Korrekturbereich mit Vorher-/Nachher-Beispiel" width="100%"></p>

- **Übersichtskarten**: Problemtypen insgesamt, Fehler, Warnungen und Hinweise (nie eine Summe von URLs). Ein Klick auf eine Karte filtert die Liste.
- **Priorisierte Liste**: Reiter nach Schweregrad, Suche und Sortierung (standardmäßig empfohlene Priorität, mit erklärter Regel). Eindeutige URLs pro Problem, Aufwand getrennt vom Schweregrad, Seitenumbruch und Tastaturnavigation.
- **Korrekturbereich**: warum beheben, nummerierte Schritte, Vorher-/Nachher-Beispiel von einer echten Seite (mit klar gekennzeichnetem automatischem Vorschlag für zu lange Titles und Beschreibungen), Vorschau der URLs, **Alle N URLs ansehen** und **Liste exportieren**.
- **Fehler stehen immer zuerst** – in der empfohlenen Priorität, im Maßnahmenplan und in der Übersicht.
- Zwei Spalten auf großen Bildschirmen, eigene Detailansicht auf dem Smartphone.

## 🌙 Neu in 3.6: Dashboard im Dunkelmodus

Die Übersicht beantwortet eine Frage auf einen Blick: Wie steht meine Website da, und was ist als Nächstes zu tun? (Screenshot oben auf dieser Seite)

- **SEO-Gesundheit in vier Ringen**: Technik, Inhalt, Verlinkung und Performance. Jeder Bogen entspricht genau dem Wert der Säule; ein Klick öffnet die passenden Probleme. Eine Säule ohne Daten wird als „Nicht gemessen“ angezeigt.
- **Ihre Prioritäten**: die 3 wichtigsten Maßnahmen, gezählt in eindeutigen Seiten, mit Link zum Maßnahmenplan.
- **Kennzahlen**, **Was gut funktioniert** und **Ihr nächstes Ziel**, dazu ein Hinweis bei einem Teilaudit.
- Neue Seitenleiste (Steuerung / Erkunden), obere Leiste mit Crawl-Status und „Crawl erneut starten“, standardmäßig dunkles Design.

## ✨ Neu in 3.5: Mit 1 Klick korrigieren – mit Claude oder ChatGPT

Nach einem Crawl gruppiert der Tab **Mit 1 Klick korrigieren** die Probleme nach Wirkung, mit dem Hinweis **Per KI korrigierbar**, **Automatisch** oder **Manuell**.

- **Korrigieren** / **Alle korrigieren**: Claude oder ChatGPT schreibt Title, Meta-Beschreibung, H1, Alt-Texte und JSON-LD in der Sprache der Seite (die geschätzten Kosten werden vorher angezeigt). 301-Weiterleitungen für interne 404, Canonicals, versehentliches noindex und Links auf Weiterleitungen werden ohne KI berechnet.
- **Prüfung**: Vorher / Nachher nebeneinander, Zeichenzähler, direkte Bearbeitung, Freigeben / Neu erzeugen / Ignorieren.
- **Anwenden** auf WordPress (Begleit-Plugin), über einen GitHub-Pull-Request (Lovable, Bolt.new, React, Next.js, Astro, HTML) oder Export als CSV / JSON / PDF. **Der Simulationsmodus ist standardmäßig aktiv.**
- Jede korrigierte URL wird **erneut gecrawlt** (geprüft ✓); im **Korrekturverlauf** lässt sich jede Korrektur oder ein ganzer Stapel rückgängig machen.

Einrichtung (KI-Schlüssel, WordPress-Anwendungspasswort, GitHub-Token): siehe [README (EN)](README.md#-new-in-35-fix-in-1-click-with-claude-or-chatgpt) und [docs/CONNECTORS.md](docs/CONNECTORS.md).

<p align="center"><img src="docs/screenshots/fix-review.png" alt="Prüfung: Vorher / Nachher, Zeichenzähler" width="100%"></p>

## 🔎 Neu in 3.4: Zuverlässigkeit bis ins Detail

- **JavaScript-Weiterleitungen** beim Rendern erkannt: als Weiterleitung behandelt, Ziel gecrawlt.
- **Links nach Seite und Ziel gruppiert**, mit allen Ankertexten, statt einer Zeile pro Anker.
- **Crawl-Vergleich URL für URL**: „behoben“ nur, wenn die URL erneut ohne das Problem gecrawlt wurde, mit Warnung, wenn die Crawls nicht vergleichbar sind.
- **hreflang-Sprachversionen gecrawlt und geprüft**: Fehler, Weiterleitungen und nicht indexierbare Ziele werden gemeldet.

## 🛡️ Neu in 3.3: Zuverlässigkeits-Audit

Ein vollständiges Audit (HTML-Extraktion, Crawl-Engine, SEO-Regeln und Crawls von 8 echten Websites) hat die falsch positiven und falsch negativen Befunde beseitigt, die SEO- und GEO-Profis in die Irre führen konnten.

- **Gegen Bots geschützte Websites** (403 auf den User-Agent des Crawlers): Der Crawl wechselt automatisch zu Chrome und weist darauf hin, statt alle Seiten als Fehler zu melden.
- **Ratenbegrenzung (429/503)**: Arachnide wartet und versucht es erneut; gebremste Seiten zählen nicht mehr als defekt. Links zu LinkedIn oder Cloudflare-geschützten Websites gelten als „nicht prüfbar“, nicht als „defekt“.
- **Direktiven wie Google gelesen**: `max-image-preview:none` ist kein noindex, das `X-Robots-Tag` eines anderen Bots wird ignoriert, Meta-Refresh ist eine Weiterleitung.
- **Inhalte, wie sie sind**: SVG-`<title>` ignoriert, `alt=""` = dekoratives Bild, Lazy-Load-Bilder (`data-src`) analysiert, Wortzählung für Chinesisch, Japanisch und Thai.
- **International und strukturierte Daten**: hreflang gegen echte ISO-Codes geprüft, Übersetzungen und paginierte Seiten sind keine Duplikate, nur die von Google geforderten schema.org-Eigenschaften werden geprüft.
- **Ein faireres Health-Score**: Ein defekter Link im Menü drückt die Website nicht mehr auf 0, und eine Website, die Googlebot sperrt, bekommt kein A mehr.
- **Neue Prüfungen**: Soft 404, Canonical außerhalb von `<head>`, Sitemap auf anderem Host, nicht prüfbare URLs.

## 📈 Neu in 3.2: Google-Daten und geplante Crawls

- **Core Web Vitals echter Nutzer** (PageSpeed Insights + CrUX: LCP, INP, CLS…) und Lighthouse-Score Ihrer wichtigsten Seiten.
- **Google Search Console**: Klicks, Impressionen, CTR und Position je URL, per API oder CSV-Import. Findet auch **Seiten, die Google kennt, Ihre Links aber nicht erreichen**, Seiten mit niedriger CTR und nicht indexierbare Seiten mit Traffic.
- **Geplante Crawls** (täglich / wöchentlich / monatlich) mit **E-Mail-Benachrichtigung**, wenn der Score sinkt oder Fehler auftreten – inklusive vollständigem Bericht.

Einrichtung in 5 Minuten: **[docs/GOOGLE-AND-SCHEDULES.md](docs/GOOGLE-AND-SCHEDULES.md)** (auf Englisch).

## 🤖 Neu in 3.0: Claude prüft **und korrigiert** Ihre Website (MCP)

Arachnide bringt jetzt einen **MCP-Server** mit. Verbinden Sie ihn mit Claude (Claude Code oder Claude Desktop) und formulieren Sie Ihren Wunsch ganz einfach: *„Prüfe www.meine-seite.de und korrigiere Titles, Descriptions und fehlende Alt-Texte der wichtigsten Seiten.“* Claude wird:

1. das CMS **erkennen** (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop, statische Website, Next.js…);
2. die Website mit Arachnide **crawlen und auditieren**;
3. auf Basis des tatsächlichen Inhalts jeder Seite bessere Werte **formulieren** (eindeutige Titles innerhalb von Googles Pixel-Limit, Descriptions, Alt-Texte, Canonicals, Weiterleitungen für defekte URLs);
4. Ihnen eine **Vorher-/Nachher-Vorschau** zeigen und auf Ihre Freigabe warten;
5. die freigegebenen Änderungen über die CMS-API auf der Live-Website **umsetzen**, sie **überprüfen** und Ihnen erlauben, jeden Batch **rückgängig zu machen**;
6. **erneut crawlen** und die Verbesserung des Scores anzeigen.

| Wie Korrekturen umgesetzt werden | Plattformen | Anteil an allen Websites* |
|---|---|---:|
| CMS-API (+ kleines WordPress-Plugin) | WordPress, Shopify, Wix, Joomla, Webflow, Drupal, PrestaShop | ≈ 53 % |
| HTML-Dateien oder Cloudflare Worker | Websites ohne CMS (individuell, statisch, Next.js, Hugo…) und jede Website hinter Cloudflare | bis zu 31,6 % |
| Schritt-für-Schritt-Anleitung | Squarespace und andere geschlossene Baukästen | der Rest |

<sub>* W3Techs, Oktober 2026.</sub>

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

Sicherheit geht vor: Vorschau vor jedem Schreibvorgang, Berechtigungsabfrage für jeden Schreibvorgang, Regeln pro Website (erlaubte Felder, Batch-Größe, Nur-Lesen-Modus), ein Protokoll aller vorherigen Werte mit Rollback in einem einzigen Aufruf, und Zugangsdaten, die nie durch den Chat laufen. **Vollständige Anleitung (auf Englisch): [docs/MCP.md](docs/MCP.md)**.

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
| <img src="docs/screenshots/home.png" alt="Startbildschirm mit den letzten Crawls"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard auf dem Tablet"> |

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
node src/cli.mjs --sitemap https://www.example.com/sitemap.xml --extract "price=.price" --extract "sku=xpath://meta[@itemprop='sku']/@content" --csv
npm run bench -- --pages 200000
node src/cli.mjs https://www.example.com --report --compare crawls/previous.jsonl.gz
node src/cli.mjs --resume crawls/.en-cours/www.example.com_2026-10-21T09-00-00.ndjson --csv
node src/cli.mjs https://www.example.com --max 20000 --segments segments.json --csv --report
node src/cli.mjs https://www.example.com --ga4-key ga4-key.json --ga4-property 123456789 --csv
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

## 🙏 Danksagung

Arachnide wäre nicht, was es ist, ohne die Menschen, die sich die Zeit genommen haben, es zu testen, herauszufordern und anzufeuern, die meisten davon auf X:

- [@Loran750](https://x.com/Loran750), für eine unglaubliche Hilfe, weit über alles hinaus, was ich mir selbst in meinen kühnsten Träumen hätte erhoffen können, und für die ständige Motivation.
- [@mrgris](https://x.com/mrgris), für die Empfehlungen zu den Bildprüfungen und für so viel Motivation in diesem Projekt.
- [@Mar1e](https://x.com/Mar1e), für die Empfehlung, Google Analytics 4 zu integrieren.
- [@effi_10](https://x.com/effi_10), für die Empfehlungen zur Segmentierung.
- [@EmelineRoblot](https://x.com/EmelineRoblot), für die Herausforderung, die sie mir gestellt hat: mehr als eine Million Seiten zu crawlen, ohne dass etwas abstürzt.
- Und natürlich meine Kinder Oliver und Alberto, mit Abstand meine schönste Schöpfung und mein größter Stolz.

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
