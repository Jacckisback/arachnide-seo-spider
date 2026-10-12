<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — crawler SEO technique gratuit et open source par Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <b>🇫🇷 Français</b> · <a href="README.de.md">🇩🇪 Deutsch</a> · <a href="README.es.md">🇪🇸 Español</a> · <a href="README.it.md">🇮🇹 Italiano</a> · <a href="README.pt.md">🇵🇹 Português</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8cc63f" alt="Licence MIT"></a>
  <img src="https://img.shields.io/badge/version-3.1.0-3d5f17" alt="Version 3.1.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 ou plus récent">
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/languages-EN%20FR%20DE%20ES%20IT%20PT-555" alt="6 langues">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** est un crawler SEO technique gratuit qui tourne sur votre propre ordinateur, comme Screaming Frog SEO Spider. Il explore un site comme le fait Googlebot, **exécute le JavaScript** si vous le souhaitez, et transforme le crawl en audit priorisé :

- un score de santé sur 100 et un score par catégorie ;
- **environ 90 contrôles**, chacun avec une explication et une correction ;
- un plan d’action classé par impact et par effort ;
- un **rapport PDF en marque blanche** pour vos clients, en 6 langues.

Pas de compte, pas de cloud, pas de limite de pages : vos données restent sur votre machine.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Tableau de bord : score de santé SEO, score par catégorie, codes de réponse, profondeur de clic et priorités" width="100%">
</p>

## 🤖 Nouveau dans la 3.0 : Claude audite **et corrige** votre site (MCP)

Arachnide intègre désormais un **serveur MCP**. Branchez-le sur Claude (Claude Code ou Claude Desktop) et demandez simplement : *« Audite www.mon-site.fr et corrige les titres, les descriptions et les textes alternatifs manquants des pages les plus importantes. »* Claude va :

1. **détecter** le CMS (WordPress, Shopify, Wix, Squarespace, Webflow, Joomla, Drupal, PrestaShop, site statique, Next.js…) ;
2. **crawler et auditer** le site avec Arachnide ;
3. **rédiger** de meilleures valeurs à partir du contenu réel de chaque page (titres uniques respectant la limite en pixels de Google, meta descriptions, textes alternatifs, canoniques, redirections pour les URL cassées) ;
4. vous présenter un **aperçu avant / après** et attendre votre feu vert ;
5. **appliquer** les modifications validées sur le site en ligne via l'API du CMS, les **vérifier**, et vous permettre d'**annuler** n'importe quel lot ;
6. **relancer un crawl** et vous montrer le gain de score.

| Mode d'application des corrections | Plateformes | Part de l'ensemble des sites web* |
|---|---|---:|
| API du CMS (+ petite extension WordPress) | WordPress, Shopify, Wix, Joomla, Webflow, Drupal, PrestaShop | ≈ 53 % |
| Fichiers HTML ou Cloudflare Worker | sites sans CMS (sur mesure, statiques, Next.js, Hugo…) et tout site derrière Cloudflare | jusqu'à 31,6 % |
| Instructions pas à pas | Squarespace et autres éditeurs fermés | le reste |

<sub>* W3Techs, octobre 2026.</sub>

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

La sécurité avant tout : aperçu avant chaque écriture, demande d'autorisation pour chaque écriture, règles par site (champs autorisés, taille des lots, lecture seule), journal de toutes les valeurs précédentes avec retour arrière en un seul appel, et des secrets qui ne transitent jamais par la conversation. **Guide complet : [docs/MCP.fr.md](docs/MCP.fr.md)**.

## 🆕 Nouveautés de la version 2.1

| | |
|---|---|
| 🕸️ **Visualisations 2D et 3D** | Visualisez l’architecture du site en 2D ou en 3D, selon trois vues : **arbre de crawl** (chemin de clics le plus court depuis la page d’accueil), **arbre des répertoires** (structure des URLs) et **graphe des liens** (tous les liens internes suivis). Colorez les nœuds selon l’indexabilité, les problèmes SEO ou la profondeur ; la taille des nœuds reflète le Link Score. Cliquez sur un nœud pour afficher le détail de la page, et exportez la vue en PNG pour vos rapports. |
| ⚙️ **Configuration du crawler, comme dans Screaming Frog** | Une fenêtre **Configuration** organisée en onglets : Spider, **Limites**, **Vitesse**, **robots.txt**, Rendu, Inclure / exclure, Extraction, Authentification. Elle ne garde que les réglages utiles. |
| 🚧 **Spider › Limites** | Total du crawl, profondeur de crawl, URLs par niveau de profondeur, profondeur de dossiers, nombre de paramètres d’URL, redirections suivies, longueur d’URL, liens par page, poids de page, et **limites par chemin d’URL** (`/blog/ = 200`). Le tableau de bord indique combien d’URLs chaque limite a écartées. |
| 🤖 **robots.txt** | Trois modes : **respecter**, **ignorer mais signaler** (les URLs bloquées sont explorées tout en restant signalées) et **ignorer**. Collez un **robots.txt personnalisé** pour tester un nouveau fichier avant de le mettre en ligne, et utilisez le **testeur** intégré pour savoir si une URL est autorisée et quelle règle s’applique. |
| 🐢 **Vitesse** | Nombre maximal de threads et plafond global d’**URLs max par seconde**, pour ménager les serveurs fragiles. |
| 🧲 **Extraction personnalisée** | Récupérez n’importe quelle donnée dans chaque page avec un sélecteur CSS ou une regex : prix, auteur, date, référence (SKU), code de suivi… Les résultats apparaissent dans un onglet **Extraction** et dans l’export CSV. |
| 🔐 **Authentification et nettoyage des URLs** | Authentification HTTP et en-têtes ou cookies personnalisés pour les sites de préproduction. Ils ne sont envoyés qu’au site audité, et le mot de passe n’est jamais enregistré. **Supprimez des paramètres d’URL** comme `utm_*`, `gclid` ou `fbclid` pour éviter les URLs en double. |

<p align="center">
  <img src="docs/screenshots/viz-crawl-tree-3d.png" alt="Arbre de crawl en 3D coloré selon les problèmes SEO" width="100%">
</p>

## ✨ Nouveautés de la version 2.0

| | |
|---|---|
| 🌍 **6 langues** | L’application, les exports CSV et les rapports sont disponibles en anglais, français, allemand, espagnol, italien et portugais, avec un sélecteur de langue dans l’en-tête. |
| ⚙️ **Rendu JavaScript** | Auditez les sites React, Vue, Angular et Next.js tels que Google les voit. Arachnide utilise le Chrome ou l’Edge déjà installé sur votre ordinateur : rien d’autre à télécharger. Il compare le HTML brut à la page rendue et mesure le **LCP et le CLS**. |
| 📄 **Rapports SEO pro** | Un rapport d’audit en marque blanche avec votre logo, votre couleur et vos coordonnées. Il contient une synthèse, les constats clés, les scores par catégorie, un plan d’action priorisé, une analyse détaillée et **l’évolution depuis le dernier audit**. Imprimez-le en PDF en un clic. [Voir un exemple de rapport (PDF)](docs/sample-report.pdf). |
| 🎯 **Plan d’action** | Chaque problème est classé selon gravité × impact × nombre d’URLs ÷ effort, et les gains rapides (quick wins) sont mis en avant. |
| 🧠 **Nouvelles analyses SEO** | PageRank interne (Link Score), contenu quasi dupliqué (simhash), cannibalisation de mots-clés, largeur des titles et descriptions en pixels, liens contextuels vs liens de menu et de pied de page, ancres génériques, hiérarchie des titres, données structurées incomplètes, validation hreflang, compression, HSTS, etc. |
| 🤖 **IA & GEO** | Indique si ChatGPT, Claude, Perplexity, Google-Extended et d’autres crawlers d’IA peuvent accéder au site, et si celui-ci possède un fichier `llms.txt`. |
| 📋 **Mode liste** | Auditez uniquement une liste d’URLs que vous collez, sans suivre les liens. |
| 🔎 **Recherche personnalisée** | Trouvez toutes les pages qui contiennent un texte ou une regex, par exemple un ancien numéro de téléphone ou un code de suivi. |
| 🎨 **Nouveau design** | Écran d’accueil avec les crawls récents, progression en direct avec vitesse et temps restant, panneau de détail redimensionnable, navigation au clavier (↑ ↓ Entrée, `/` pour rechercher), notifications et mode sombre. |

## 🔍 Tout ce qu’Arachnide contrôle

| Domaine | Contrôles |
|---|---|
| **Codes de réponse** | 2xx / 3xx / 4xx / 5xx, délais dépassés, URLs bloquées par le robots.txt, liens internes et externes cassés |
| **Redirections** | Chaînes, boucles, redirections temporaires 302/307, meta refresh, redirections vers la page d’accueil (soft 404), liens internes pointant vers des redirections |
| **Titles & metas** | Manquants, dupliqués, trop longs (en pixels), trop courts ou multiples ; title identique au H1 ; aperçu dans la SERP Google |
| **Titres Hn** | H1 manquant, dupliqué ou multiple ; aucun H2 ; niveaux de titres sautés |
| **Contenu** | Nombre de mots, contenu pauvre, doublons exacts et quasi-doublons, cannibalisation de mots-clés, mot-clé principal par page, ratio texte |
| **Images** | Texte alternatif manquant, images lourdes, images cassées, width/height manquants (CLS), chaque fichier des `srcset` et `<picture>` contrôlé (poids, statut, format), pas de version responsive, pas de WebP / AVIF, `srcset` sans `sizes` |
| **Indexation** | Canonicals (manquantes, multiples, pointant vers une URL non indexable), noindex, nofollow, X-Robots-Tag |
| **Architecture** | Profondeur de clic, Link Score (PageRank interne), pages orphelines, pages avec un seul lien entrant ou sans lien contextuel, pages inaccessibles |
| **Sitemaps** | Sitemap manquant, URLs non indexables dans le sitemap, pages indexables absentes du sitemap |
| **International** | Codes hreflang invalides, liens de retour manquants, auto-référence manquante, x-default manquant |
| **Données structurées** | Types détectés (JSON-LD, microdonnées), JSON-LD invalide, propriétés manquantes pour les résultats enrichis (Article, Product, FAQPage, LocalBusiness, Course, Event…) |
| **JavaScript** | Contenu, liens, title, H1, canonical ou noindex modifiés par JavaScript ; erreurs JS ; LCP et CLS |
| **Performance & sécurité** | Temps de réponse, poids du HTML, compression, HTTPS, HSTS, contenu mixte |
| **URLs** | Majuscules, underscores, paramètres, accents, longueur |
| **IA & GEO** | Accès pour Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended… ; llms.txt |

## 📸 Captures d’écran

| Problèmes et corrections | Plan d’action priorisé |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Liste des problèmes avec explication, impact, effort et correction"> | <img src="docs/screenshots/action-plan.png" alt="Plan d’action avec les gains rapides"> |
| **Aperçu SERP Google (largeur en pixels)** | **Maillage interne, Link Score et liens entrants** |
| <img src="docs/screenshots/titles-serp.png" alt="Onglet Titles avec aperçu Google et jauges en pixels"> | <img src="docs/screenshots/internal-linking.png" alt="Onglet Maillage interne avec Link Score et panneau des liens entrants"> |
| **Réglages du rapport en marque blanche** | **Rapport d’audit professionnel** |
| <img src="docs/screenshots/report-dialog.png" alt="Fenêtre du rapport avec logo, couleur, client et comparaison"> | <img src="docs/screenshots/report.png" alt="Synthèse du rapport d’audit"> |
| **Arbre de crawl (2D)** | **Graphe des liens (2D)** |
| <img src="docs/screenshots/viz-crawl-tree-2d.png" alt="Arbre de crawl en 2D"> | <img src="docs/screenshots/viz-link-graph.png" alt="Graphe des liens internes en disposition par forces"> |
| **Arbre des répertoires** | **Extraction personnalisée** |
| <img src="docs/screenshots/viz-directory-tree.png" alt="Visualisation de l’arbre des répertoires"> | <img src="docs/screenshots/custom-extraction.png" alt="Onglet Extraction avec des prix extraits par sélecteur CSS"> |
| **Configuration › Limites** | **Configuration › robots.txt (avec testeur)** |
| <img src="docs/screenshots/config-limits.png" alt="Réglages des limites du spider"> | <img src="docs/screenshots/config-robots.png" alt="Modes robots.txt, robots.txt personnalisé et testeur"> |
| **Écran d’accueil** | **Mode sombre** |
| <img src="docs/screenshots/home.png" alt="Écran d’accueil avec les crawls récents"> | <img src="docs/screenshots/dashboard-dark.png" alt="Tableau de bord en mode sombre"> |

## 🚀 Installation

### 1. Installer Node.js

Téléchargez la version **LTS** sur **[nodejs.org](https://nodejs.org)** et installez-la comme n’importe quel autre programme. Il faut la version 18.17 ou plus récente ; la dernière LTS est recommandée. Pour vérifier votre version, ouvrez un terminal et tapez `node -v`.

Pour le **Rendu JavaScript**, il vous faut aussi Google Chrome, Microsoft Edge, Chromium ou Brave. Arachnide trouve le navigateur automatiquement.

### 2. Télécharger Arachnide

- **Le plus simple :** cliquez sur le bouton vert **`<> Code`** en haut de cette page, puis sur **Download ZIP**, et décompressez le fichier.
- **Avec Git :**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Le lancer

**Option A : double-clic.** Le lanceur installe ou met à jour tout ce qu’il faut, puis ouvre votre navigateur.

| Système | Fichier à double-cliquer |
|---|---|
| macOS | `start-mac.command`. La première fois, faites un clic droit dessus et choisissez **Ouvrir**, car macOS bloque les scripts non signés. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Option B : terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Ouvrez ensuite **http://localhost:4000**. Saisissez l’adresse d’un site et cliquez sur **Crawler**.

Laissez la fenêtre du terminal ouverte pendant que vous utilisez l’application, et appuyez sur `Ctrl + C` pour l’arrêter. Si le port 4000 est occupé, Arachnide choisit le port libre suivant et l’affiche dans le terminal.

**Mise à jour depuis la 1.x :** téléchargez la nouvelle version (ou lancez `git pull`), puis relancez `npm install`. Les lanceurs par double-clic le font pour vous.

## 📄 Créer un rapport client

1. Crawlez le site.
2. Cliquez sur **Rapport**. Choisissez la langue du rapport, puis ajoutez votre logo, votre couleur de marque, le nom du client et vos coordonnées. Vos réglages sont mémorisés.
3. Si vous le souhaitez, choisissez un **crawl précédent du même site** pour montrer son évolution : variation du score, problèmes corrigés et nouveaux problèmes.
4. Cliquez sur **Générer le rapport**, puis sur **Imprimer / Enregistrer en PDF**.

Utilisez **Tous les problèmes (CSV)** pour donner à votre client ou à votre développeur la liste complète des URLs à corriger.

## ⚙️ Configuration

Cliquez sur **⚙ Options** pour ouvrir la fenêtre **Configuration**. Vos réglages sont mémorisés, sauf le mot de passe.

| Onglet | Réglages |
|---|---|
| Spider | Lire les sitemaps XML, suivre les canonicals, inclure les sous-domaines, vérifier les liens externes et les images |
| Limites | Total du crawl, profondeur de crawl, URLs par niveau de profondeur, profondeur de dossiers, paramètres d’URL, redirections suivies, longueur d’URL, liens par page, poids de page, limites par chemin d’URL (`/blog/ = 200`, une par ligne) |
| Vitesse | Nombre max. de threads, URLs max par seconde, délai d’attente |
| robots.txt | Respecter / ignorer mais signaler / ignorer, robots.txt personnalisé, testeur d’URL |
| Rendu | Rendu JavaScript, user-agent (Arachnide, Googlebot desktop/smartphone, Chrome), Accept-Language |
| Inclure / exclure | Regex d’inclusion / d’exclusion, suppression de paramètres d’URL (`utm_*, gclid`), ignorer tous les paramètres, recherche personnalisée |
| Extraction | Jusqu’à 20 extracteurs : sélecteur CSS (texte, attribut, HTML ou nombre) ou regex |
| Authentification | Utilisateur et mot de passe HTTP, en-têtes personnalisés (cookies, jetons) |

Utilisez le sélecteur **Site / Liste** à côté du champ d’adresse pour crawler un site entier ou seulement une liste d’URLs.

## 🕸️ Visualisations

Après un crawl, ouvrez **Visualisations** dans la barre latérale :

- **Arbre de crawl :** chaque page est reliée à la page qui l’a fait découvrir au niveau de clic précédent. Les longues branches signalent des pages profondes.
- **Répertoires :** la structure des URLs, dossier par dossier. Elle fait ressortir les sections déséquilibrées ou trop profondes.
- **Liens :** le graphe complet des liens internes. Les pages bien maillées se regroupent au centre, et les pages isolées dérivent vers la périphérie.

Basculez entre **2D** et **3D**, colorez selon l’indexabilité, les problèmes ou la profondeur, choisissez le nombre de nœuds affichés (jusqu’à 6 000), cliquez sur un nœud pour ouvrir son détail, et exportez un PNG pour vos rapports.

## 🖥️ Ligne de commande

```bash
node src/cli.mjs https://www.example.com --max 2000 --csv --report --lang fr
node src/cli.mjs https://www.example.com --render --ua googlebotMobile --report --client "ACME" --author "Your name"
node src/cli.mjs --list urls.txt --lang de --csv
node src/cli.mjs https://www.example.com --report --compare crawls/previous.json
node src/cli.mjs https://staging.example.com --auth user:pass --rate 2 --robots report --path-limit "/blog/=200" --extract "price=.price" --remove-params "utm_*,gclid"
node src/cli.mjs --help
```

La CLI affiche le score et les problèmes dans votre langue. Elle enregistre le crawl au format JSON, que vous pouvez ouvrir dans l’interface avec **📂**. Avec `--csv`, elle exporte aussi les pages et les problèmes, et avec `--report`, elle génère un rapport d’audit HTML à vos couleurs, que vous pouvez imprimer en PDF.

## 🛠️ Dépannage

| Message | Solution |
|---|---|
| `cd: no such file or directory` | Vous n’êtes pas dans le bon dossier. Tapez `cd` suivi du chemin du dossier décompressé, par exemple `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Même cause : lancez `npm install` **dans** le dossier d’Arachnide. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Votre shell définit une option que votre version de Node ne prend pas en charge. Lancez `unset NODE_OPTIONS` (macOS/Linux), ou mettez Node.js à jour vers la dernière LTS. |
| Le rendu JavaScript n’est pas disponible | Installez Google Chrome. S’il est installé à un emplacement inhabituel, lancez Arachnide avec `CHROME_PATH="/path/to/chrome" npm start`. |
| Certaines pages n’ont ni H1 ni contenu | Le site construit probablement son contenu en JavaScript. Activez le **Rendu JavaScript** dans les options. |

## 🧪 Développement

```bash
npm test
```

Les tests crawlent un petit site local qui contient des erreurs SEO volontaires (`test/fixture-site.mjs`). Ils couvrent le rendu JavaScript, le mode liste, les rapports dans chaque langue et la complétude des traductions. Ils tournent sur Node 18, 20 et 22 via GitHub Actions.

```
src/
  crawler.mjs    moteur de crawl (file d’attente, concurrence, robots.txt, sitemaps, redirections, mode liste)
  renderer.mjs   rendu JavaScript avec le Chrome / Edge installé (puppeteer-core)
  parse.mjs      extraction HTML (titles, metas, titres Hn, liens, images, schema, hreflang…)
  analyze.mjs    graphe de liens, profondeur de clic, Link Score, doublons, cannibalisation, contrôles SEO
  text.mjs       mots-clés, mots vides multilingues, simhash
  pixel.mjs      largeur des titles et descriptions en pixels
  options.mjs    validation de la configuration du crawl (interface et CLI)
  server.mjs     serveur web local et API avec mises à jour en direct
  cli.mjs        interface en ligne de commande
public/
  app.js         interface web (sans framework)
  viz.js         visualisations 2D / 3D (force-graph, 3d-force-graph, servis localement)
  i18n/*.js      traductions (en, fr, de, es, it, pt)
  shared/        générateur de rapports, comparaison de crawls, parseur robots.txt, i18n, icônes (utilisés par l’interface et la CLI)
```

**Ajouter une langue :** copiez `public/i18n/en.js`, traduisez les valeurs et ajoutez la langue à `LANGS` dans `public/shared/i18n.js`. `npm test` vérifie qu’aucune clé ni aucun paramètre ne manque.

## 🗺️ Feuille de route

- [ ] Données terrain PageSpeed Insights / CrUX
- [ ] Intégration de la Google Search Console (clics et impressions par URL)
- [ ] Crawls planifiés avec alertes par e-mail
- [ ] Import d’un export CSV de la Google Search Console (pages orphelines connues uniquement de la GSC)
- [x] Extraction personnalisée (2.1)
- [x] Visualisations 2D / 3D de l’architecture du site (2.1)

Les suggestions et les pull requests sont les bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Usage responsable

Ne crawlez que des sites qui vous appartiennent ou que vous êtes autorisé à auditer. Sur les sites de vos clients, limitez-vous à 2 à 5 requêtes simultanées, et ajoutez une pause sur les hébergements mutualisés. L’interface n’écoute que sur votre ordinateur (`127.0.0.1`).

---

## 👤 Auteur

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p><b>Consultant SEO</b> freelance et professeur de français basé à <b>Madrid</b> 🇪🇸🇫🇷.<br>
      J’ai créé Arachnide pour mes propres audits SEO techniques, et je le partage librement avec la communauté SEO.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — audits et conseil SEO<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — cours de français et préparation au DELF / DALF / TCF
      </p>
      <p><b>Besoin d’un audit SEO complet, ou d’aide pour corriger les problèmes détectés par Arachnide ?</b> <a href="https://thierrygustin.com/contact">Contactez-moi →</a></p>
    </td>
  </tr>
</table>

Si Arachnide vous fait gagner du temps, une ⭐ sur GitHub aide beaucoup !

## 📄 Licence

[MIT](LICENSE) © 2026 Thierry Gustin. Vous êtes libre de l’utiliser, de le modifier et de le partager, y compris pour un usage commercial.

<sub>Arachnide est un projet indépendant, sans lien avec Screaming Frog Ltd. « Screaming Frog » est une marque déposée de son propriétaire.</sub>
