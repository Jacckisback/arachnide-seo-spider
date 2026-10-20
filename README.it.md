<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — crawler SEO tecnico gratuito e open source di Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="README.fr.md">🇫🇷 Français</a> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <b>🇮🇹 Italiano</b> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licenza MIT"></a>
  <img src="https://img.shields.io/badge/version-3.13.0-3d5f17" alt="Versione 3.13.0">
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
  <img src="docs/screenshots/dashboard.png" alt="Panoramica: punteggio di salute SEO in quattro anelli (tecnica, contenuto, linking, prestazioni), priorità, indicatori chiave e punti di forza" width="100%">
</p>

## 🧩 Novità della 3.14: segmenti — analizza un sito grande sezione per sezione

Su un sito grande, un punteggio globale nasconde dove sono davvero i problemi. I **segmenti** suddividono l’audit in sezioni con un nome — schede prodotto, categorie, blog, una lingua, pagine senza traffico… — esattamente come i segmenti di Screaming Frog.

- **Regole su qualsiasi campo**: percorso, URL, title, H1, meta description, stato, indicizzabilità, profondità di clic, parole, link in entrata, Link Score, tempo di risposta, sitemap, tipo di dati strutturati, lingua, clic di Search Console e le tue **estrazioni personalizzate**. Operatori di testo, numerici e vero / falso, combinati in E / O.
- **Vince il primo segmento che corrisponde**: ordina i segmenti, il resto va in *Senza segmento*. Conteggio delle pagine in tempo reale.
- **Un clic per iniziare**: *Crea dalle directory* crea un segmento per ogni cartella di primo livello.
- **Applicati dopo la scansione, senza ripeterla**, salvati con la scansione e riutilizzati nelle successive. Import / export JSON.
- **Un filtro globale** nella barra laterale: tutta l’app segue il segmento — panoramica, punteggio, problemi, piano d’azione, tabelle, CSV e report PDF —, ricalcolato con lo stesso metodo.
- **Tabella dei segmenti nella panoramica**, ogni problema suddiviso per segmento, colonna *Segmento*, *Colore per segmento* sulla mappa del sito.
- **CLI**: `--segments segments.json`, `--segment-folders`, `--segment blog`. **Agenti IA**: strumento `arachnide_segments` e parametro `segment`.

<p align="center">
  <img src="docs/screenshots/segments.png" alt="Segments" width="100%">
</p>

## 🤝 Novità della 3.13: collega il tuo agente IA (Claude, ChatGPT…) ad Arachnide

Arachnide diventa gli occhi e le mani del tuo agente SEO / GEO. L’agente legge l’audit che hai aperto, avvia crawl che compaiono in diretta nell’applicazione, esplora le pagine, ottiene il piano d’azione prioritizzato e il nuovo report sulla **prontezza GEO**, e corregge il sito con la tua approvazione.

- **Tre accessi, 25 strumenti**: MCP via stdio (Claude Code, Claude Desktop), **MCP via HTTP** (`/mcp`, per i connettori personalizzati di claude.ai e gli agenti ospitati) e **REST + OpenAPI 3.1** (`/api/agent/*`, `/openapi.json` — da importare con un clic come Action di ChatGPT). Gli stessi strumenti ovunque, definiti una sola volta.
- **Token di accesso** creato al primo avvio, visibile e rinnovabile in *Impostazioni → Agenti IA*, con snippet pronti da incollare (configurazione di Claude Desktop, impostazioni dell’Action di ChatGPT, richiesta di prova), un campo per l’URL pubblico per i tunnel (cloudflared, ngrok, Tailscale) e il registro delle ultime chiamate degli agenti.
- **Nuovi strumenti**: `arachnide_action_plan` (il piano ordinato dell’app, con i quick win segnalati), `arachnide_search_pages` (filtrare e ordinare le pagine per Link Score, profondità, stato, cartella, problema), `arachnide_geo_readiness` (accesso dei crawler IA, llms.txt, dati strutturati, profondità dei contenuti → punteggio 0-100 e raccomandazioni), `arachnide_start_crawl` + `arachnide_crawl_status` (crawl in background, visibile in diretta nell’app). `crawl_id: "current"` indica sempre l’audit aperto nell’app.
- Guida e istruzioni di sistema suggerite per un agente SEO / GEO: [docs/AGENTS.md](docs/AGENTS.md).

## 🎨 Novità della 3.12: una revisione del design su tutta l'applicazione

Un audit completo di UX, colori e tipografia di ogni pagina, in entrambi i temi, su desktop e su mobile, e poi le correzioni.

- **Una vera tipografia**: il font Inter Variable è ora incluso (offline, licenza SIL OFL), così ogni peso viene visualizzato allo stesso modo su qualsiasi macchina; 23 dimensioni di testo sparse diventano una scala di 8 livelli, con titoli, raggi e spaziature coerenti.
- **Tema chiaro leggibile**: tutti i testi colorati (avvisi, stati OK, link, etichette secondarie, badge di impegno) raggiungono ora il contrasto WCAG AA (4,5:1) sugli sfondi su cui sono posti: 103 difetti misurati ridotti a 0.
- **Dettagli più curati**: la pagina «Correzioni» funziona con una scansione aperta da un file; il pannello di dettaglio della pagina non resta più visibile sulle pagine senza tabella; la riga selezionata di una tabella è evidenziata in modo pulito; il pulsante del tema mostra ciò che farà; l'interruttore della simulazione è di nuovo visibile.

## 🧭 Novità della 3.11: mappa del sito e visualizzazione 2D / 3D, fianco a fianco

- **Mappa del sito** (barra laterale): la mappa classica in stile Screaming Frog — sfondo bianco, albero orizzontale, pensata per screenshot e report per i clienti.
- **Visualizzazione 2D / 3D** (nuova scheda, subito sotto): la vista di esplorazione — stile scuro, disposizione radiale, in 2D o 3D, colorata per problemi SEO di default.
- Le due viste condividono gli stessi dati, filtri, ricerca e ispettore di pagina; ciascuna ricorda le proprie impostazioni.

## 🌳 Novità della 3.10: una mappa classica, pronta da mostrare

Una mappa più leggibile, da mostrare così com’è a un cliente o a un responsabile — e un controllo più fine di ciò che scansioni e mappi.

<p align="center"><img src="docs/screenshots/viz-classic-tree.png" alt="Mappa in stile Classico: albero di scansione orizzontale su sfondo bianco, un’etichetta per pagina, elenchi lunghi riassunti come «+ N altre pagine»" width="100%"></p>

- **Stile classico (nuovo predefinito)**: sfondo bianco, collegamenti sottili, etichette scure — nello spirito dell’albero di scansione di Screaming Frog. Lo stile *Scuro* resta a un clic, in 2D come in 3D.
- **Albero orizzontale**: la home a sinistra, una colonna per livello, un’etichetta per pagina. Gli elenchi lunghi vengono riassunti («+ 28 altre pagine», i problemi delle pagine nascoste restano segnalati) e *Mostra l’elenco completo* li espande; la pagina selezionata resta sempre visibile. In *Directory*, ogni directory mostra il proprio percorso relativo alla directory padre, come in un file manager.
- **Esportazioni pronte da inviare**: il PNG / PDF ha ora un’intestazione (sito, vista, data della scansione, pagine mostrate), la legenda e il contesto.
- **Nessun URL inventato**: in *Directory*, una pagina come `/en` porta ora la sua directory `/en/` invece di mostrare accanto un falso URL `/en/`; una directory senza pagina al proprio indirizzo è presentata come un raggruppamento (`/blog/page/*`).
- **Includere / escludere URL nella mappa**: un pattern per riga — testo semplice (`/en/`), carattere jolly (`/en/*/page-*`) o espressione regolare (`/en/(.*)`). Il filtro *Directory* ora funziona a tutti i livelli (`/en/blog/`).
- **Perimetro della scansione**: includi / escludi accettano una regex per riga, e la nuova opzione *Resta nella directory di partenza* scansiona solo sotto la directory dell’URL di partenza (come deselezionare «Crawl Outside of Start Folder» in Screaming Frog). Da riga di comando: ripeti `--include` / `--exclude`, aggiungi `--stay-in-folder`.
- **Più robusto**: un URL di partenza non valido (`htp:/x`, `javascript:…`, un semplice numero) viene rifiutato con un messaggio chiaro, i numeri assurdi vengono riportati a limiti sicuri, una scansione che non può essere salvata lo segnala. Nuovi test end-to-end e «monkey» pilotano la vera interfaccia in un browser (clic casuali, input insensati, ridimensionamenti) a ogni esecuzione dei test.

## 🕸️ Novità della 3.9: una mappa del sito più veloce e più chiara

Esplora la struttura e individua le pagine da migliorare, in 2D o in 3D, su migliaia di pagine.

<p align="center"><img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Mappa del sito in 3D: albero di scansione con rami etichettati, pagina selezionata, percorso di scoperta e ispettore di pagina" width="100%"></p>

- **Tre viste davvero diverse**: *Albero di scansione* (ogni pagina sotto la pagina da cui è stata raggiunta sul percorso più breve dalla home — il percorso mostrato corrisponde sempre alla profondità in clic), *Directory* (percorsi URL, con cartelle virtuali non contate come pagine) e *Linking interno* (i link realmente osservati, orientati, cicli compresi).
- **Ispettore di pagina**: stato, indicizzabilità (solo se nota), profondità, Link Score, pagine sorgente, link in uscita, percorso di scoperta, problemi e raccomandazione esistente, con *Isola il ramo / il vicinato*, *Vedi i link interni* e *Vedi il piano d’azione*.
- **Ricerca, filtri e analisi** su tutte le pagine scansionate (non solo quelle disegnate): problemi SEO, profondità, directory, stato HTTP, indicizzabilità, linking in entrata debole con soglia esplicita, intervallo di Link Score — evidenziati nel contesto o isolati. Le esportazioni (PNG, PDF, CSV) mantengono etichette, legenda e contesto; una vista *Elenco* permette l’uso da tastiera.
- **Molto più veloce**: disposizione deterministica invece di una simulazione fisica per gli alberi, nodi e link disegnati in pochi lotti, rendering solo quando qualcosa cambia. Misurato sulla stessa macchina (rendering software): stabilizzazione 3D da 5,5–13,9 s a 0,7–3,2 s, fluidità 3D in rotazione da 1–11 a 46–60 immagini/s.

## 🗺️ Novità della 3.8: un piano d’azione su cui lavorare

Cosa correggere, in che ordine e come, e a che punto sei.

<p align="center"><img src="docs/screenshots/action-plan.png" alt="Piano d’azione: schede di riepilogo, roadmap con priorità e stati e scheda del metodo dell’azione" width="100%"></p>

- **Quattro schede**: azioni da gestire (per gravità), vittorie rapide (poco sforzo, impatto medio o alto), sforzo di correzione e **Inizia da qui**, la prima azione dell’ordine consigliato.
- **Roadmap**: ogni problema diventa un’azione con un verbo chiaro, il suo rango, gravità, impatto SEO, URL unici, sforzo e stato. Filtri (tutto, vittorie rapide, da fare, da verificare, altri stati), ricerca e un ordinamento manuale che sostituisce chiaramente quello consigliato finché non lo ripristini.
- **Scheda dell’azione**: perché iniziare da qui (solo dati della scansione), metodo numerato, criterio «Fatto quando…», vedi / esporta gli URL, una nota e **Avvia questa azione → Segna come completata → Rilancia la scansione per convalidare**. Solo una nuova scansione che non rileva più il problema lo segna come risolto.
- **Avanzamento** (stato e note) salvato nel tuo browser per ogni sito; la selezione multipla permette di esportare gli URL di più azioni o di cambiarne lo stato in una volta.

## 🧭 Novità della 3.7: una pagina Problemi SEO più chiara

Dalla diagnosi alla correzione in un'unica schermata: cosa è stato rilevato, cosa correggere per primo, la gravità, quanti URL sono interessati e lo sforzo stimato.

<p align="center"><img src="docs/screenshots/issues.png" alt="Pagina Problemi SEO: schede di riepilogo, elenco con priorità e pannello di correzione con esempio prima / dopo" width="100%"></p>

- **Schede di riepilogo**: tipi di problemi in totale, errori, avvisi e segnalazioni (mai una somma di URL). Un clic su una scheda filtra l'elenco.
- **Elenco con priorità**: schede per gravità, ricerca e ordinamento (priorità consigliata per impostazione predefinita, con la regola spiegata). URL unici per problema, sforzo distinto dalla gravità, paginazione e navigazione da tastiera.
- **Pannello di correzione**: perché correggere, passaggi numerati, esempio prima / dopo preso da una pagina reale (con un suggerimento automatico chiaramente indicato per titoli e descrizioni troppo lunghi), anteprima degli URL, **Vedi i N URL** ed **Esporta l'elenco**.
- **Gli errori vengono sempre per primi** nella priorità consigliata, nel piano d'azione e nella panoramica.
- Due colonne sugli schermi grandi, vista di dettaglio dedicata su mobile.

## 🌙 Novità della 3.6: dashboard in modalità scura

La panoramica risponde a colpo d'occhio a una domanda: come sta il mio sito e cosa fare adesso? (screenshot in cima a questa pagina)

- **Salute SEO in quattro anelli**: Tecnica, Contenuto, Linking e Prestazioni. Ogni arco corrisponde esattamente al punteggio del pilastro; un clic apre i problemi corrispondenti. Un pilastro senza dati è indicato come «Non misurato».
- **Le tue priorità**: le prime 3 azioni, contate in pagine uniche, con un link al piano d'azione.
- **Indicatori chiave**, **Cosa funziona bene** e **Il tuo prossimo obiettivo**, più un avviso quando l'audit è parziale.
- Nuova barra laterale (Gestione / Esplorazione), barra superiore con lo stato della scansione e «Rilancia la scansione», tema scuro predefinito.

## ✨ Novità della 3.5: correggi in 1 clic con Claude o ChatGPT

Dopo una scansione, la scheda **Correggi in 1 clic** raggruppa i problemi per impatto, con l’etichetta **Correggibile con IA**, **Automatica** o **Manuale**.

- **Correggi** / **Correggi tutto**: Claude o ChatGPT scrive title, meta description, H1, testi alternativi e JSON-LD nella lingua della pagina (il costo stimato è mostrato prima). I reindirizzamenti 301 dei 404 interni, le canonical, i noindex accidentali e i link verso reindirizzamenti sono calcolati senza IA.
- **Revisione**: prima / dopo affiancati, contatore di caratteri, modifica diretta, Convalida / Rigenera / Ignora.
- **Applicazione** su WordPress (plugin compagno), tramite una pull request GitHub (Lovable, Bolt.new, React, Next.js, Astro, HTML) o esportazione CSV / JSON / PDF. **La modalità simulazione è attiva per impostazione predefinita.**
- Ogni URL corretto viene **riscansionato** (verificato ✓) e la **Cronologia delle correzioni** permette di annullare una correzione o un intero lotto.

Configurazione (chiave IA, password per le applicazioni di WordPress, token GitHub): vedere il [README (EN)](README.md#-new-in-35-fix-in-1-click-with-claude-or-chatgpt) e [docs/CONNECTORS.md](docs/CONNECTORS.md).

<p align="center"><img src="docs/screenshots/fix-review.png" alt="Revisione: prima / dopo, contatore di caratteri" width="100%"></p>

## 🔎 Novità della 3.4: affidabilità fino in fondo

- **Reindirizzamenti JavaScript** rilevati durante il rendering: trattati come reindirizzamenti, destinazione scansionata.
- **Link raggruppati per pagina e destinazione**, con tutti i loro anchor, invece di una riga per anchor.
- **Confronto dei crawl URL per URL**: «risolto» solo se l’URL è stato riscansionato senza il problema, con un avviso quando i due crawl non sono confrontabili.
- **Versioni hreflang scansionate e verificate**: destinazioni in errore, reindirizzate o non indicizzabili segnalate.

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
| <img src="docs/screenshots/home.png" alt="Schermata iniziale con i crawl recenti"> | <img src="docs/screenshots/dashboard-dark.png" alt="Dashboard su tablet"> |

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
node src/cli.mjs https://www.example.com --max 20000 --segments segments.json --csv --report
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
