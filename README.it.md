<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — crawler SEO tecnico gratuito e open source di Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <b>🇮🇹 Italiano</b> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licenza MIT"></a>
  <img src="https://img.shields.io/badge/version-3.3.0-3d5f17" alt="Versione 3.3.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 o successivo">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 lingue">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Test"></a>
</p>

---

**Arachnide** è un crawler SEO tecnico gratuito che funziona sul tuo computer, come Screaming Frog SEO Spider. Esplora un sito web come fa Googlebot, **esegue il rendering JavaScript** se vuoi, e trasforma il crawl in un audit con priorità:

- un punteggio di salute su 100 e un punteggio per ogni categoria;
- **circa 90 controlli**, ognuno con una spiegazione e una soluzione;
- un piano d’azione ordinato per impatto e impegno;
- un **report PDF white label** per i tuoi clienti, in 6 lingue.

Nessun account, nessun cloud e nessun limite di pagine. I tuoi dati restano sul tuo computer.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard: punteggio di salute SEO, punteggio per categoria, codici di risposta, profondità di clic e priorità" width="100%">
</p>

## 🛡️ Novità della 3.3: audit di affidabilità

Un audit completo (estrazione HTML, motore di scansione, regole SEO e scansioni di 8 siti reali) ha eliminato i falsi positivi e i falsi negativi che potevano trarre in inganno un professionista SEO o GEO.

- **Siti protetti contro i bot** (403 sullo user-agent del crawler): la scansione passa automaticamente a Chrome e lo segnala, invece di mostrare tutte le pagine in errore.
- **Limitazione della frequenza (429/503)**: Arachnide attende e riprova; le pagine rallentate non sono più contate come rotte. I link verso LinkedIn o siti protetti da Cloudflare sono «non verificabili», non «rotti».
- **Direttive lette come Google**: `max-image-preview:none` non è un noindex, l’`X-Robots-Tag` di un altro bot viene ignorato, il meta refresh è un reindirizzamento.
- **Il contenuto così com’è**: `<title>` degli SVG ignorati, `alt=""` = immagine decorativa, immagini in lazy-load (`data-src`) analizzate, conteggio delle parole in cinese, giapponese e thai.
- **Internazionale e dati strutturati**: hreflang verificati con i veri codici ISO, traduzioni e pagine paginate non sono duplicati, vengono controllate solo le proprietà schema.org richieste da Google.
- **Un punteggio di salute più equo**: un link rotto nel menu non porta più il sito a 0, e un sito che blocca Googlebot non ottiene più una A.
- **Nuovi controlli**: soft 404, canonical fuori dall’`<head>`, sitemap su un altro host, URL non verificabili.

## 📈 Novità della 3.2: dati Google e crawl pianificati

- **Core Web Vitals degli utenti reali** (PageSpeed Insights + CrUX: LCP, INP, CLS…) e punteggio Lighthouse delle tue pagine chiave.
- **Google Search Console**: clic, impressioni, CTR e posizione per URL, tramite API o importando il CSV. Trova anche le **pagine che Google conosce ma che i tuoi link non raggiungono**, i CTR bassi e le pagine non indicizzabili con traffico.
- **Crawl pianificati** (giornalieri / settimanali / mensili) con **avvisi via email** quando il punteggio cala o compaiono errori, con il report completo allegato.

Configurazione in 5 minuti: **[docs/GOOGLE-AND-SCHEDULES.md](docs/GOOGLE-AND-SCHEDULES.md)** (in inglese).

## 🤖 Novità della 3.0: Claude analizza **e corregge** il tuo sito (MCP)

Arachnide ora include un **server MCP**. Collegalo a Claude (Claude Code o Claude Desktop) e chiedi in parole semplici: *«Fai l'audit di www.mio-sito.it e correggi i title, le description e gli alt text mancanti delle pagine più importanti.»* Claude:

1. **rileva** il CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop, sito statico, Next.js…);
2. **scansiona e analizza** il sito con Arachnide;
3. **scrive** valori migliori partendo dal contenuto reale di ogni pagina (title unici entro il limite in pixel di Google, description, alt text, canonical, redirect per gli URL non funzionanti);
4. ti mostra un'**anteprima prima / dopo** e attende la tua approvazione;
5. **applica** le modifiche approvate sul sito online tramite l'API del CMS, le **verifica** e ti permette di **annullare** qualsiasi batch;
6. **riesegue la scansione** e ti mostra il miglioramento del punteggio.

| Come vengono applicate le correzioni | Piattaforme | Quota sul totale dei siti web* |
|---|---|---:|
| API del CMS (+ piccolo plugin WordPress) | WordPress, Shopify, Wix, Joomla, Webflow, Drupal, PrestaShop | ≈ 53% |
| File HTML o Cloudflare Worker | siti senza CMS (su misura, statici, Next.js, Hugo…) e qualsiasi sito dietro Cloudflare | fino al 31,6% |
| Istruzioni passo passo | Squarespace e altri site builder chiusi | il resto |

<sub>* W3Techs, ottobre 2026.</sub>

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

La sicurezza prima di tutto: anteprima prima di ogni scrittura, richiesta di autorizzazione per ogni scrittura, regole per sito (campi consentiti, dimensione dei batch, sola lettura), un registro di tutti i valori precedenti con ripristino in una sola chiamata, e credenziali che non passano mai dalla chat. **Guida completa (in inglese): [docs/MCP.md](docs/MCP.md)**.

## 🆕 Novità della versione 2.1

| | |
|---|---|
| 🕸️ **Visualizzazioni 2D e 3D** | Osserva l’architettura del sito in 2D o in 3D, con tre viste: **albero di crawl** (il percorso di clic più breve dalla homepage), **directory** (la struttura degli URL) e **link** (tutti i link interni seguiti). Colora i nodi in base all’indicizzabilità, ai problemi SEO o alla profondità; la dimensione dei nodi indica il Link Score. Clicca su un nodo per vedere i dettagli della pagina ed esporta la vista in PNG per i tuoi report. |
| ⚙️ **Configurazione del crawler, come in Screaming Frog** | Una finestra **Configurazione** a schede: Spider, **Limiti**, **Velocità**, **robots.txt**, Rendering, Includi / escludi, Estrazione, Autenticazione. Contiene solo le impostazioni che contano davvero. |
| 🚧 **Spider › Limiti** | Totale del crawl, profondità di crawl, URL per livello di profondità, profondità delle cartelle, numero di query string, redirect da seguire, lunghezza degli URL, link per pagina, dimensione della pagina e **limiti per percorso URL** (`/blog/ = 200`). La dashboard mostra quanti URL ha escluso ciascun limite. |
| 🤖 **robots.txt** | Tre modalità: **Rispetta robots.txt**, **Ignora robots.txt ma segnala lo stato** (gli URL bloccati vengono scansionati ma restano segnalati) e **Ignora robots.txt**. Incolla un **robots.txt personalizzato** per testare un nuovo file prima di pubblicarlo e usa il **tester** integrato per vedere se un URL è consentito e quale regola si applica. |
| 🐢 **Velocità** | Numero massimo di thread e un limite globale di **URL al secondo**, per proteggere i server fragili. |
| 🧲 **Estrazione personalizzata** | Raccogli qualsiasi dato da ogni pagina con un selettore CSS o una regex: prezzo, autore, data, SKU, codice di tracciamento… I risultati compaiono in una scheda **Estrazione** e nell’export CSV. |
| 🔐 **Autenticazione e pulizia degli URL** | Autenticazione HTTP e header o cookie personalizzati per i siti di staging. Vengono inviati solo al sito analizzato e la password non viene mai salvata. **Rimuovi i parametri degli URL** come `utm_*`, `gclid` o `fbclid` per evitare URL duplicati. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Albero di crawl in 3D colorato in base ai problemi SEO" width="100%">
</p>

## ✨ Novità della versione 2.0

| | |
|---|---|
| 🌍 **6 lingue** | L’app, gli export CSV e i report sono disponibili in inglese, francese, tedesco, spagnolo, italiano e portoghese, con un selettore di lingua nell’intestazione. |
| ⚙️ **Rendering JavaScript** | Analizza i siti React, Vue, Angular e Next.js come li vede Google. Arachnide usa Chrome o Edge già installati sul tuo computer, quindi non scarica nient’altro. Confronta l’HTML grezzo con la pagina renderizzata e misura **LCP e CLS**. |
| 📄 **Report SEO professionali** | Un report di audit white label con il tuo logo, il tuo colore e i tuoi contatti. Contiene una sintesi per la direzione, i risultati principali, i punteggi per categoria, un piano d’azione con priorità, un’analisi dettagliata e i **progressi dall’ultimo audit**. Stampalo in PDF con un clic. [Vedi un report di esempio (PDF)](docs/sample-report.pdf). |
| 🎯 **Piano d’azione** | Ogni problema è ordinato per gravità × impatto × numero di URL ÷ impegno, e i quick win sono evidenziati. |
| 🧠 **Nuove analisi SEO** | PageRank interno (Link Score), contenuti quasi duplicati (simhash), cannibalizzazione delle parole chiave, larghezza di title e description in pixel, link contestuali vs link di menu e footer, anchor generiche, gerarchia dei titoli, dati strutturati incompleti, validazione hreflang, compressione, HSTS e altro. |
| 🤖 **IA e GEO** | Mostra se ChatGPT, Claude, Perplexity, Google-Extended e altri crawler di IA possono accedere al sito, e se il sito ha un file `llms.txt`. |
| 📋 **Modalità elenco** | Analizza solo un elenco di URL che incolli, senza seguire i link. |
| 🔎 **Ricerca personalizzata** | Trova tutte le pagine che contengono un testo o una regex, per esempio un vecchio numero di telefono o un codice di tracciamento. |
| 🎨 **Nuovo design** | Schermata iniziale con i crawl recenti, avanzamento in tempo reale con velocità e tempo rimanente, pannello di dettaglio ridimensionabile, navigazione da tastiera (↑ ↓ Invio, `/` per cercare), notifiche e modalità scura. |

## 🔍 Tutto quello che Arachnide controlla

| Ambito | Controlli |
|---|---|
| **Codici di risposta** | 2xx / 3xx / 4xx / 5xx, timeout, URL bloccati da robots.txt, link interni ed esterni rotti |
| **Redirect** | Catene, loop, redirect temporanei 302/307, meta refresh, redirect verso la homepage (soft 404), link interni che puntano a redirect |
| **Title e meta** | Mancanti, duplicati, troppo lunghi (in pixel), troppo corti o multipli; title identico all’H1; anteprima SERP di Google |
| **Titoli** | H1 mancante, duplicato o multiplo; nessun H2; livelli di titolo saltati |
| **Contenuto** | Numero di parole, contenuto scarso, duplicati esatti e quasi duplicati, cannibalizzazione delle parole chiave, parola chiave principale per pagina, rapporto testo |
| **Immagini** | Testo alternativo mancante, immagini pesanti, immagini rotte, width/height mancanti (CLS), ogni file di `srcset` e `<picture>` controllato (peso, stato, formato), nessuna versione responsive, nessun WebP / AVIF, `srcset` senza `sizes` |
| **Indicizzazione** | Canonical (mancanti, multipli, che puntano a un URL non indicizzabile), noindex, nofollow, X-Robots-Tag |
| **Architettura** | Profondità di clic, Link Score (PageRank interno), pagine orfane, pagine con un solo link in entrata o senza link contestuale, pagine irraggiungibili |
| **Sitemap** | Sitemap mancante, URL non indicizzabili nella sitemap, pagine indicizzabili assenti dalla sitemap |
| **Internazionale** | Codici hreflang non validi, link di ritorno mancanti, autoreferenza mancante, x-default mancante |
| **Dati strutturati** | Tipi trovati (JSON-LD, microdata), JSON-LD non valido, proprietà mancanti per i risultati avanzati (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Contenuto, link, title, H1, canonical o noindex modificati da JavaScript; errori JS; LCP e CLS |
| **Prestazioni e sicurezza** | Tempo di risposta, dimensione HTML, compressione, HTTPS, HSTS, contenuti misti |
| **URL** | Lettere maiuscole, underscore, parametri, accenti, lunghezza |
| **IA e GEO** | Accesso per Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…; llms.txt |

## 📸 Screenshot

| Problemi con soluzioni | Piano d’azione con priorità |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Elenco dei problemi con spiegazione, impatto, impegno e soluzione"> | <img src="docs/screenshots/action-plan.png" alt="Piano d’azione con quick win"> |
| **Anteprima SERP di Google (larghezza in pixel)** | **Linking interno, Link Score e link in entrata** |
| <img src="docs/screenshots/titles-serp.png" alt="Scheda Title con anteprima Google e misuratori in pixel"> | <img src="docs/screenshots/internal-linking.png" alt="Scheda Linking interno con Link Score e pannello dei link in entrata"> |
| **Impostazioni del report white label** | **Report di audit professionale** |
| <img src="docs/screenshots/report-dialog.png" alt="Finestra del report con logo, colore, cliente e confronto"> | <img src="docs/screenshots/report.png" alt="Sintesi per la direzione del report di audit"> |
| **Albero di crawl (2D)** | **Grafo dei link (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="Albero di crawl in 2D"> | <img src="docs/screenshots/viz-link-graph.png" alt="Grafo dei link interni con layout a forze"> |
| **Directory** | **Estrazione personalizzata** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Visualizzazione dell’albero delle directory"> | <img src="docs/screenshots/custom-extraction.png" alt="Scheda Estrazione con prezzi estratti tramite selettore CSS"> |
| **Configurazione › Limiti** | **Configurazione › robots.txt (con tester)** |
| <img src="docs/screenshots/config-limits.png" alt="Impostazioni dei limiti dello spider"> | <img src="docs/screenshots/config-robots.png" alt="Modalità robots.txt, robots.txt personalizzato e tester"> |
| **Schermata iniziale** | **Modalità scura** |
| <img src="docs/screenshots/home.png" alt="Schermata iniziale con i crawl recenti"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard in modalità scura"> |

## 🚀 Installazione

### 1. Installa Node.js

Scarica la versione **LTS** da **[nodejs.org](https://nodejs.org)** e installala come qualsiasi altro programma. Ti serve la versione 18.17 o successiva; è consigliata l’ultima LTS. Per controllare la tua versione, apri un terminale e digita `node -v`.

Per il **Rendering JavaScript** ti serve anche Google Chrome, Microsoft Edge, Chromium o Brave. Arachnide trova il browser automaticamente.

### 2. Scarica Arachnide

- **Il modo più semplice:** clicca sul pulsante verde **`<> Code`** in alto in questa pagina, poi su **Download ZIP**, ed estrai il file.
- **Con Git:**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Avvialo

**Opzione A: doppio clic.** Il launcher installa o aggiorna tutto, poi apre il browser.

| Sistema | File su cui fare doppio clic |
|---|---|
| macOS | `start-mac.command`. La prima volta, fai clic destro sul file e scegli **Apri**, perché macOS blocca gli script non firmati. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Opzione B: terminale**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Poi apri **http://localhost:4000**. Digita l’indirizzo di un sito e clicca su **Avvia crawl**.

Tieni aperta la finestra del terminale mentre usi l’app, e premi `Ctrl + C` per fermarla. Se la porta 4000 è occupata, Arachnide sceglie la prima porta libera e la mostra nel terminale.

**Aggiornamento dalla 1.x:** scarica la nuova versione (o esegui `git pull`), poi esegui di nuovo `npm install`. I launcher con doppio clic lo fanno per te.

## 📄 Creare un report per un cliente

1. Esegui il crawl del sito.
2. Clicca su **Report**. Scegli la lingua del report, poi aggiungi il tuo logo, il colore del tuo brand, il nome del cliente e i tuoi contatti. Le impostazioni vengono memorizzate.
3. Se vuoi, scegli un **crawl precedente dello stesso sito** per mostrare i progressi: variazione del punteggio, problemi risolti e nuovi problemi.
4. Clicca su **Genera il report**, poi su **Stampa / Salva come PDF**.

Usa **Tutti i problemi (CSV)** per dare al tuo cliente o al tuo sviluppatore l’elenco completo degli URL da correggere.

## ⚙️ Configurazione

Clicca su **⚙ Opzioni** per aprire la finestra **Configurazione**. Le impostazioni vengono memorizzate, tranne la password.

| Scheda | Impostazioni |
|---|---|
| Spider | Leggere le sitemap XML, seguire i canonical, includere i sottodomini, controllare i link esterni e le immagini |
| Limiti | Totale del crawl, profondità di crawl, URL per livello di profondità, profondità delle cartelle, query string, redirect da seguire, lunghezza degli URL, link per pagina, dimensione della pagina, limiti per percorso URL (`/blog/ = 200`, uno per riga) |
| Velocità | Numero massimo di thread, numero massimo di URL al secondo, timeout |
| robots.txt | Rispetta / ignora ma segnala lo stato / ignora, robots.txt personalizzato, tester di URL |
| Rendering | Rendering JavaScript, user-agent (Arachnide, Googlebot desktop/smartphone, Chrome), Accept-Language |
| Includi / escludi | Regex di inclusione / esclusione, rimozione dei parametri degli URL (`utm_*, gclid`), ignorare tutti i parametri, ricerca personalizzata |
| Estrazione | Fino a 20 estrattori: selettore CSS (testo, attributo, HTML o conteggio) o regex |
| Autenticazione | Utente e password HTTP, header personalizzati (cookie, token) |

Usa il selettore **Sito / Elenco** accanto al campo dell’indirizzo per analizzare un intero sito o solo un elenco di URL.

## 🕸️ Visualizzazioni

Dopo un crawl, apri **Visualizzazioni** nella barra laterale:

- **Albero di crawl:** ogni pagina è collegata alla pagina che vi ha condotto al livello di clic precedente. I rami lunghi indicano pagine profonde.
- **Directory:** la struttura degli URL, cartella per cartella. Mette in evidenza le sezioni sbilanciate o troppo profonde.
- **Link:** il grafo completo dei link interni. Le pagine ben collegate si raggruppano al centro, mentre quelle isolate si spostano ai margini.

Passa dal **2D** al **3D** e viceversa, colora in base all’indicizzabilità, ai problemi o alla profondità, scegli quanti nodi mostrare (fino a 6.000), clicca su un nodo per aprirne i dettagli ed esporta un PNG per i tuoi report.

## 🖥️ Riga di comando

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang it
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

La CLI mostra il punteggio e i problemi nella tua lingua. Salva il crawl in JSON, che puoi aprire nell’interfaccia con **📂**. Con `--csv` esporta anche le pagine e i problemi, e con `--report` genera un report di audit HTML con il tuo brand, che puoi stampare in PDF.

## 🛠️ Risoluzione dei problemi

| Messaggio | Soluzione |
|---|---|
| `cd: no such file or directory` | Non sei nella cartella giusta. Usa `cd` seguito dal percorso della cartella estratta, per esempio `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Stessa causa: esegui `npm install` **dentro** la cartella di Arachnide. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | La tua shell imposta un’opzione che la tua versione di Node non supporta. Esegui `unset NODE_OPTIONS` (macOS/Linux), oppure aggiorna Node.js all’ultima LTS. |
| Il rendering JavaScript non è disponibile | Installa Google Chrome. Se è installato in una posizione insolita, avvia Arachnide con `CHROME_PATH="/path/to/chrome" npm start`. |
| Alcune pagine non mostrano H1 né contenuto | Probabilmente il sito costruisce il contenuto con JavaScript. Attiva **Rendering JavaScript** nelle opzioni. |

## 🧪 Sviluppo

```bash
npm test
```

I test eseguono il crawl di un piccolo sito locale con errori SEO volontari (`test/fixture-site.mjs`). Coprono il rendering JavaScript, la modalità elenco, i report in tutte le lingue e la completezza delle traduzioni. Vengono eseguiti su Node 18, 20 e 22 tramite GitHub Actions.

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

**Aggiungere una lingua:** copia `public/i18n/en.js`, traduci i valori e aggiungi la lingua a `LANGS` in `public/shared/i18n.js`. `npm test` verifica che non manchi nessuna chiave né alcun segnaposto.

## 🗺️ Roadmap

- [ ] Dati reali PageSpeed Insights / CrUX
- [ ] Integrazione con Google Search Console (clic e impressioni per URL)
- [ ] Crawl pianificati con avvisi via email
- [ ] Importazione di un export CSV di Google Search Console (pagine orfane presenti solo in GSC)
- [x] Estrazione personalizzata (2.1)
- [x] Visualizzazioni 2D / 3D dell’architettura del sito (2.1)

Suggerimenti e pull request sono benvenuti. Consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Uso responsabile

Esegui il crawl solo dei siti di tua proprietà o che sei autorizzato ad analizzare. Sui siti dei clienti, mantieni da 2 a 5 richieste simultanee, e aggiungi una pausa sugli hosting condivisi. L’interfaccia è in ascolto solo sul tuo computer (`127.0.0.1`).

---

## 👤 Autore

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p><b>Consulente SEO</b> freelance e insegnante di francese con base a <b>Madrid</b> 🇪🇸🇫🇷.<br>
      Ho creato Arachnide per i miei audit SEO tecnici, e lo condivido liberamente con la community SEO.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — audit e consulenza SEO<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — corsi di francese e preparazione DELF / DALF / TCF
      </p>
      <p><b>Ti serve un audit SEO completo, o un aiuto per correggere i problemi trovati da Arachnide?</b> <a href="https://thierrygustin.com/contact">Contattami →</a></p>
    </td>
  </tr>
</table>

Se Arachnide ti fa risparmiare tempo, una ⭐ su GitHub è di grande aiuto!

## 📄 Licenza

[MIT](LICENSE) © 2026 Thierry Gustin. Sei libero di usarlo, modificarlo e condividerlo, anche per lavori commerciali.

<sub>Arachnide è un progetto indipendente, non affiliato a Screaming Frog Ltd. “Screaming Frog” è un marchio del rispettivo titolare.</sub>
