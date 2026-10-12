<p align="center">
  <img src="docs/banner.svg" alt="Arachnide SEO Spider — crawler SEO technique gratuit et open source par Thierry Gustin" width="100%">
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <b>🇫🇷 Français</b> · <a href="README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-8cc63f" alt="Licence MIT"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018.17-3d5f17" alt="Node.js 18.17 ou plus">
  <img src="https://img.shields.io/badge/syst%C3%A8mes-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="macOS, Windows, Linux">
  <a href="https://github.com/Jacckisback/arachnide-seo-spider/actions"><img src="https://github.com/Jacckisback/arachnide-seo-spider/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
</p>

---

**Arachnide** est un crawler SEO technique gratuit qui tourne sur votre ordinateur. Comme Screaming Frog SEO Spider, il parcourt un site comme le fait Googlebot et transforme le crawl en audit complet. Vous obtenez un score de santé, plus de 50 contrôles, chacun avec son explication et sa correction, et des exports CSV à transmettre à vos clients.

Pas de compte, pas de cloud, pas de limite de pages : vos données restent chez vous.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Tableau de bord avec score de santé SEO, codes réponse, profondeur de clic et problèmes détectés" width="100%">
</p>

## ✨ Fonctionnalités

| | |
|---|---|
| 🩺 **Score de santé et problèmes** | Plus de 50 contrôles classés en erreurs, avertissements et remarques. Pour chaque problème : l'explication, la correction et les URLs concernées. |
| 🔗 **Codes réponse** | 2xx / 3xx / 4xx / 5xx, timeouts et URLs bloquées par le robots.txt. |
| 🏷️ **Titres et meta descriptions** | Manquants, dupliqués, trop longs ou trop courts, balises multiples, title identique au H1. Avec aperçu du résultat Google. |
| 📑 **Titres Hn** | H1 manquant, dupliqué ou multiple ; pages sans H2. |
| 📝 **Contenu** | Nombre de mots, contenu faible, pages dupliquées, ratio texte/HTML, attribut `lang`. |
| 🖼️ **Images** | Attribut alt manquant, images lourdes, images cassées. |
| 🧭 **Canonicals et directives** | Auto-référente, canonicalisée, absente, multiple, ou pointant vers une URL non indexable. `noindex`, `nofollow`, `X-Robots-Tag`. |
| ↪️ **Redirections** | Chaînes, boucles, redirections temporaires 302/307, redirections vers l'accueil (soft 404). |
| ❌ **Liens cassés** | Page source, lien cassé, ancre et code d'erreur, pour les liens internes et (en option) externes. |
| 🗺️ **Sitemaps XML** | Pages orphelines, URLs non indexables dans le sitemap, pages indexables absentes du sitemap. |
| 🕸️ **Maillage interne** | Profondeur de clic réelle depuis l'accueil, liens entrants avec leurs ancres, liens sortants, pages peu liées. |
| 🌍 **Hreflang et données structurées** | Liens retour hreflang manquants, types JSON-LD et microdata, JSON-LD invalide. |
| ⚡ **Performance et URLs** | Temps de réponse lent, HTML lourd ; URLs avec majuscules, underscores, paramètres, accents ou trop longues. |
| 📤 **Exports et historique** | Chaque tableau se trie, se filtre et s'exporte en CSV (compatible Excel). Chaque crawl est enregistré et peut être rouvert. |
| 🖥️ **Ligne de commande** | Crawlez depuis le terminal et obtenez le score, la liste des problèmes et des CSV prêts à envoyer. |

## 📸 Captures d'écran

| Problèmes et corrections | Aperçu SERP |
|---|---|
| <img src="docs/screenshots/issues.png" alt="Liste des problèmes avec explication et correction"> | <img src="docs/screenshots/titles-serp.png" alt="Onglet Titres avec aperçu du résultat Google"> |
| **Maillage interne et liens entrants** | **Mode sombre** |
| <img src="docs/screenshots/internal-linking.png" alt="Onglet Maillage interne avec le panneau des liens entrants"> | <img src="docs/screenshots/dashboard-dark.png" alt="Tableau de bord en mode sombre"> |

## 🚀 Installation

### 1. Installer Node.js

Téléchargez la version **LTS** sur **[nodejs.org](https://nodejs.org)** et installez-la comme n'importe quel logiciel. Il faut la version 18.17 ou plus récente ; la dernière LTS est conseillée. Pour connaître votre version, ouvrez un terminal et tapez `node -v`.

### 2. Télécharger Arachnide

- **Le plus simple :** cliquez sur le bouton vert **`<> Code`** en haut de cette page, puis **Download ZIP**, et décompressez le fichier.
- **Avec Git :**
  ```bash
  git clone https://github.com/Jacckisback/arachnide-seo-spider.git
  ```

### 3. Lancer l'application

**Option A : double-clic** (installe tout la première fois, puis ouvre le navigateur)

| Système | Fichier à double-cliquer |
|---|---|
| macOS | `start-mac.command`. La première fois, faites un clic droit puis **Ouvrir**, car macOS bloque les scripts non signés. |
| Windows | `start-windows.bat` |
| Linux | `start-linux.sh` |

**Option B : terminal**

```bash
cd arachnide-seo-spider
npm install
npm start
```

Ouvrez ensuite **http://localhost:4000**, saisissez l'adresse d'un site et cliquez sur **Crawler**.

Laissez la fenêtre du terminal ouverte pendant l'utilisation. `Ctrl + C` arrête l'application.

## ⚙️ Options de crawl

Cliquez sur **⚙ Options** avant de lancer le crawl :

- nombre maximum d'URLs et profondeur maximale
- requêtes simultanées, pause entre les requêtes, timeout
- user-agent : Arachnide, Googlebot desktop, Googlebot smartphone ou Chrome
- inclure / exclure des URLs par regex, par exemple seulement `/blog/`, ou tout sauf `/wp-admin/`
- respecter le robots.txt, lire les sitemaps XML, suivre les canonicals, inclure les sous-domaines, ignorer les paramètres d'URL
- vérifier les liens externes, et vérifier les images (poids et statut)

## 🖥️ Ligne de commande

```bash
node src/cli.mjs https://www.exemple.fr --max 2000 --csv
node src/cli.mjs https://www.exemple.fr --ua googlebotMobile --external --images
node src/cli.mjs --help
```

La CLI affiche le score de santé et les problèmes. Elle enregistre le crawl complet en JSON, que vous pouvez ouvrir dans l'interface avec **📂 Ouvrir**. Avec `--csv`, elle écrit aussi `_pages.csv` et `_problemes.csv`.

## 🛠️ Dépannage

| Message | Solution |
|---|---|
| `cd: no such file or directory` | Vous n'êtes pas dans le bon dossier. Tapez `cd` suivi du chemin du dossier décompressé, par ex. `cd ~/Downloads/arachnide-seo-spider`. |
| `npm ERR! enoent … package.json` | Même cause : lancez `npm install` **dans** le dossier d'Arachnide. |
| `--disable-warning= is not allowed in NODE_OPTIONS` | Votre terminal définit une option que votre version de Node ne connaît pas. Tapez `unset NODE_OPTIONS` (macOS/Linux) ou mettez Node.js à jour avec la dernière LTS. |
| `EADDRINUSE: address already in use :::4000` | Arachnide tourne déjà, ou une autre application utilise le port 4000. Lancez-le sur un autre port : `PORT=4001 npm start`. |
| Certaines pages n'ont ni H1 ni contenu | Arachnide lit le HTML envoyé par le serveur et n'exécute pas le JavaScript. Les pages construites entièrement en JavaScript lui paraissent vides. |

## 🧪 Développement

```bash
npm test
```

Les tests crawlent un petit site local qui contient des erreurs SEO volontaires (`test/fixture-site.mjs`). Ils tournent sur Node 18, 20 et 22 via GitHub Actions.

## 🗺️ Feuille de route

- [ ] Interface en anglais et en allemand
- [ ] Rendu JavaScript (Chrome headless)
- [ ] Largeur des titres en pixels
- [ ] Détection des contenus quasi dupliqués
- [ ] Rapport d'audit PDF / HTML personnalisable à vos couleurs
- [ ] Comparaison de deux crawls

Les suggestions et les pull requests sont les bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚖️ Utilisation responsable

Ne crawlez que les sites qui vous appartiennent ou que vous êtes autorisé à auditer. Sur le site d'un client, restez entre 2 et 5 requêtes simultanées et ajoutez une pause sur un hébergement mutualisé. L'interface n'est accessible que depuis votre ordinateur (`127.0.0.1`).

---

## 👤 Auteur

<table>
  <tr>
    <td width="140" align="center">
      <img src="https://github.com/Jacckisback.png" width="110" alt="Thierry Gustin">
    </td>
    <td>
      <h3>Thierry Gustin</h3>
      <p><b>Consultant SEO</b> indépendant et professeur de français installé à <b>Madrid</b> 🇪🇸🇫🇷.<br>
      J'ai créé Arachnide pour mes propres audits SEO techniques, et je le partage gratuitement avec la communauté SEO.</p>
      <p>
        🌐 <a href="https://thierrygustin.com">thierrygustin.com</a> — audits et conseil SEO<br>
        💼 <a href="https://www.linkedin.com/in/thierrygustin">LinkedIn</a><br>
        📚 <a href="https://laclassefrancaise.es">laclassefrancaise.es</a> · <a href="https://delfonline.es">delfonline.es</a> — cours de français et préparation DELF / DALF / TCF
      </p>
      <p><b>Besoin d'un audit SEO complet ou d'aide pour corriger ce qu'Arachnide a trouvé ?</b> <a href="https://thierrygustin.com/contact">Contactez-moi →</a></p>
    </td>
  </tr>
</table>

Si Arachnide vous fait gagner du temps, une ⭐ sur GitHub m'aide beaucoup !

## 📄 Licence

[MIT](LICENSE) © 2026 Thierry Gustin. Libre d'utilisation, de modification et de partage, y compris pour un usage commercial.

<sub>Arachnide est un projet indépendant, sans lien avec Screaming Frog Ltd. « Screaming Frog » est une marque de son propriétaire.</sub>
