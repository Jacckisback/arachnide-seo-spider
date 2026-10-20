# Arachnide + Claude (MCP) : auditer et corriger le SEO directement sur le site en ligne

> **3.13 :** les mêmes outils sont aussi servis en **HTTP** — MCP Streamable HTTP sur `/mcp` et une porte REST + OpenAPI sur `/api/agent/*` — pour les connecteurs claude.ai, les Actions ChatGPT et vos propres agents. Voir [AGENTS.fr.md](AGENTS.fr.md).

Arachnide 3.0 intègre un **serveur MCP** ([Model Context Protocol](https://modelcontextprotocol.io)). Connectez-le à Claude (Claude Code, Claude Desktop ou tout autre client MCP) et Claude pourra :

1. **détecter** le CMS et les technologies d'un site,
2. le **crawler et l'auditer** (les mêmes ~95 contrôles que dans l'application),
3. **décider** quoi corriger, page par page, en lisant le contenu réel,
4. **appliquer** les corrections sur le site en ligne via l'API du CMS, après votre validation,
5. **vérifier** qu'elles sont bien en ligne, **annuler** n'importe quel lot et **relancer un crawl** pour mesurer le gain.

Champs que Claude peut modifier : **balise title, meta description, H1, canonique, noindex, texte alternatif des images, redirections 301.**

## Couverture : environ 70 à 85 % du web

Les parts sont calculées sur l'ensemble des sites web (W3Techs, octobre 2026).

| Plateforme | Part de l'ensemble des sites | Mode d'application des corrections | Champs appliqués automatiquement |
|---|---:|---|---|
| WordPress (+ WooCommerce) | 40,1 % | API REST + [extension Arachnide Connector](../integrations/wordpress/arachnide-connector) (Yoast, Rank Math, AIOSEO, SEOPress, Redirection, ou aucune) | les 7 (H1 et alt fonctionnent même sans l'extension) |
| Shopify | 5,4 % | API Admin GraphQL | title, description, H1, noindex, alt des images produit, redirections |
| Wix | 4,2 % | API REST Wix (Item SEO Tags, URL Redirect Manager) | title, description, canonique, noindex, redirections |
| Squarespace | 2,4 % | pas d'API en écriture → instructions pas à pas, ou Cloudflare Worker | — |
| Joomla 4/5 | 1,1 % | API Web Services (articles) | titre, description, H1, noindex, alt d'image, redirections |
| Webflow | 0,8 % | Data API v2 | title, description, H1 des éléments CMS, redirections (offre Enterprise) |
| Drupal 9-11 | 0,6 % | JSON:API (+ modules Metatag et Redirect) | les 7 champs |
| PrestaShop | 0,5 % | API Webservice | titre, description, H1 (nom), alt dans les descriptions |
| Sans CMS (sur mesure, statique, Next.js, Hugo…) | 31,6 % | **fichiers** (modification du HTML + `_redirects` / `.htaccess` / nginx / `vercel.json`) ou **Cloudflare Worker** | les 7 |
| Tout autre site derrière Cloudflare | — | l'[Arachnide SEO Worker](../integrations/cloudflare-worker) réécrit le HTML en périphérie (edge) | les 7 |
| Tout le reste | — | **manuel** : chemin de clics exact + valeur à coller, pour chaque CMS | — |

Les API des CMS couvrent environ 53 % de l'ensemble des sites web. Les connecteurs fichiers et Cloudflare prennent le relais pour les sites sans CMS, dès lors que vous avez accès aux fichiers ou à Cloudflare, ce qui porte la couverture totale à 70-85 %. Tout ce qui ne peut pas être écrit automatiquement vous est renvoyé sous forme d'instructions manuelles précises : rien ne se perd.

## Installation

Prérequis : Node.js 18.17+ et le dossier Arachnide (avec `npm install` déjà exécuté).

**Claude Code**

```bash
claude mcp add arachnide -- node /path/to/arachnide-seo-spider/src/mcp.mjs
# avec un secret pour un site :
claude mcp add arachnide -e ARACHNIDE_WP_APP_PASSWORD="xxxx xxxx xxxx xxxx" -- node /path/to/arachnide-seo-spider/src/mcp.mjs
```

**Claude Desktop** : Paramètres → Développeur → Modifier la configuration, puis ajoutez :

```json
{
  "mcpServers": {
    "arachnide": {
      "command": "node",
      "args": ["C:\\Users\\you\\arachnide-seo-spider\\src\\mcp.mjs"],
      "env": { "ARACHNIDE_WP_APP_PASSWORD": "xxxx xxxx xxxx xxxx", "ARACHNIDE_LANG": "fr" }
    }
  }
}
```

Redémarrez Claude Desktop. Il ne vous reste plus qu'à demander : *« Audite www.mon-site.fr et corrige les titres et descriptions des pages les plus importantes. »*, ou à utiliser le prompt **optimize_site**.

## Connecter un site

Les sites sont enregistrés dans `~/.arachnide/sites.json` (modifiable via `ARACHNIDE_CONFIG`). Claude crée l'entrée avec `arachnide_configure_site` ; **les secrets ne passent jamais par la conversation** : le fichier stocke `env:VARIABLE` et la valeur réelle provient de l'environnement du serveur MCP.

```json
{
  "sites": {
    "mon-blog": {
      "url": "https://www.mon-blog.fr",
      "connector": "wordpress",
      "user": "admin",
      "appPassword": "env:ARACHNIDE_WP_APP_PASSWORD",
      "policy": { "allowedFields": ["seo_title", "meta_description", "image_alt"], "maxChangesPerBatch": 30 }
    }
  }
}
```

| Connecteur | Paramètres (secrets sous la forme `env:…`) | À faire côté site |
|---|---|---|
| `wordpress` | `user`, `appPassword` | Comptes → Profil → Mots de passe d'application ; installez l'extension Arachnide Connector pour les champs SEO et les redirections |
| `shopify` | `shop` (xxx.myshopify.com), `accessToken`, `apiVersion` | Créez une application personnalisée avec les scopes read/write_products, read/write_content, read/write_online_store_navigation, read/write_files |
| `wix` | `siteId`, `apiKey` | Clé API avec l'autorisation *Manage SEO Settings* (+ lecture Blog / Stores) |
| `webflow` | `siteId`, `token`, `publish` (`none`/`items`/`site`) | Jeton de site avec les scopes pages, CMS et sites ; liez les champs SEO du CMS dans le Designer |
| `joomla` | `token` | Jeton API Joomla d'un Super Utilisateur (plugins Web Services activés) |
| `drupal` | `user`, `password`, `metatagField` | Activez JSON:API (avec écriture) et HTTP Basic Auth |
| `prestashop` | `apiKey`, `languageId` | Paramètres avancés → Webservice → clé avec accès products / categories / cms |
| `cloudflare` | `accountId`, `namespaceId`, `apiToken` | Déployez le [Worker](../integrations/cloudflare-worker) |
| `files` | `root`, `redirectsFormat` (`netlify`, `apache`, `nginx`, `vercel`) | Dossier contenant le HTML (checkout Git, dossier de build) ; déployez ensuite comme d'habitude |
| `manual` | `cms` | rien |

## Sécurité

- **Aperçu d'abord.** `arachnide_preview_changes` n'écrit rien et affiche la valeur actuelle, la valeur publiée, la nouvelle valeur et les alertes SEO (largeur en pixels, noindex…). Claude a pour consigne de vous le montrer et d'attendre votre accord.
- **Votre client demande l'autorisation avant chaque écriture.** Les outils d'application et de retour arrière sont marqués *destructive* : Claude Code / Desktop vous demandent donc votre permission.
- **Règles par site** : champs autorisés, nombre maximal de modifications par lot, mode lecture seule.
- **Journal + annulation** : chaque modification appliquée conserve sa valeur précédente (`~/.arachnide/journal/<site>.jsonl`) ; `arachnide_rollback_changes` restaure un lot entier.
- **Vérification** : `arachnide_verify_changes` lit les pages publiques (les caches et le CDN peuvent introduire un délai de quelques minutes).
- Seul l'hôte du site configuré est accepté : aucune modification ne peut viser un autre domaine.

## Outils

| Outil | Rôle |
|---|---|
| `arachnide_detect_site` | CMS, framework, hébergement/CDN, connecteur recommandé |
| `arachnide_crawl` | Crawl + audit, avec enregistrement du crawl (notifications de progression) |
| `arachnide_list_crawls`, `arachnide_get_summary` | Crawls enregistrés, score, principaux problèmes |
| `arachnide_list_issues`, `arachnide_get_issue` | Problèmes par priorité, URL concernées, comment les corriger |
| `arachnide_get_page`, `arachnide_fetch_page` | Données de la page issues du crawl / extrait du contenu en ligne |
| `arachnide_suggest_fixes` | Éléments corrigeables par page, avec valeurs actuelles, contraintes et contexte |
| `arachnide_compare_crawls` | Avant / après |
| `arachnide_list_connectors`, `arachnide_list_sites`, `arachnide_configure_site`, `arachnide_test_site` | Connecteurs et sites |
| `arachnide_preview_changes`, `arachnide_apply_changes`, `arachnide_verify_changes`, `arachnide_rollback_changes`, `arachnide_list_changes` | Modifications |

Variables d'environnement : `ARACHNIDE_LANG` (langue des libellés : en, fr, de, es, it, pt), `ARACHNIDE_HOME` (configuration + journal, par défaut `~/.arachnide`), `ARACHNIDE_CONFIG`, `ARACHNIDE_CRAWLS` (dossier des crawls, partagé par défaut avec l'application web).

## Limites (en toute transparence)

- Les connecteurs ont été développés à partir de la documentation officielle des API et testés sur des serveurs simulés fidèles, ainsi que, pour le Cloudflare Worker, dans le véritable runtime Workers. Faites d'abord un test sur un site de préproduction ou sur quelques pages, et signalez tout problème sur GitHub.
- Le contenu généré par les page builders (Elementor, Divi…), les modèles du thème ou le JavaScript n'est pas toujours accessible via les API des CMS : ces modifications vous sont alors renvoyées sous forme d'étapes manuelles (ou passez par le Cloudflare Worker).
- Arachnide modifie les champs SEO on-page et les redirections. Il ne réécrit pas le contenu des pages, ne modifie pas les modèles et ne touche pas à votre hébergement.
