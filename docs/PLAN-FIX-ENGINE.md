# Plan — « Corriger en 1 clic » (v3.5)

## 1. Ce qui existe déjà (réutilisé, pas réécrit)

| Brique | Fichier | Rôle dans la v3.5 |
|---|---|---|
| Stack | Node ≥ 18 (ES modules), serveur HTTP natif `src/server.mjs`, UI vanilla JS `public/app.js` + `public/index.html`, cheerio, zod 4 | Inchangée : pas de framework ajouté |
| Crawl | `crawler.mjs` → `analyze.mjs` → résultat `R` (`R.pages`, `R.issues[{id, severity, category, impact, effort, count, items[{url, detail}]}]`, `R.meta`) | Source des problèmes à corriger |
| Suggestions | `src/fixes.mjs` (`ISSUE_FIELDS`, contraintes de longueur, contexte de page) | Base du choix « IA / automatique / manuel » |
| Changements | `src/changes.mjs` : `validateChange`, `previewChanges`, `applyChanges` (journal `~/.arachnide/journal`), `verifyBatch`, `rollback` | Application, vérification, annulation des Fix |
| Connecteurs | `src/connectors/*` (`Connector` : `test`, `get`, `set`, `supports`) — WordPress, Shopify, Wix, Webflow, Joomla, Drupal, PrestaShop, Cloudflare, fichiers, manuel | `CMSConnector` = adaptateur sur cette classe |
| Plugin WP | `integrations/wordpress/arachnide-connector/` (Yoast, Rank Math, AIOSEO, SEOPress, Redirection, stockage natif + `wp_head`) | Étendu : JSON-LD, i18n .pot/.po, zip |
| Secrets | `src/sites.mjs` (`~/.arachnide/sites.json`, `env:VAR`, masquage) | Même dossier pour la clé IA, chiffrée |
| Vérification | `src/live.mjs` (`readLive`) | Re-crawl de l'URL après application |
| PDF | `public/shared/report.js` (HTML imprimable → PDF navigateur) | Rapport « Corrections appliquées » |
| i18n | `public/i18n/{en,fr,de,es,it,pt}.js`, test de parité des clés | Toutes les nouvelles chaînes |

## 2. Architecture v3.5

```
Problème (R.issues) ─► fix-engine ─► Fix (proposed) ─► revue UI (edited/approved)
        │                 ├─ règles déterministes (sans IA)
        │                 └─ AIProvider (Anthropic | OpenAI) — via le serveur local, jamais depuis le navigateur
        └─ non automatisable ─► plan d'action texte (aucun bouton « Appliquer »)
Fix approved ─► CMSConnector (wordpress | github | export) ─► applied ─► re-crawl URL ─► verified | failed
                                                     └─► journal (avant/après) ─► rolled_back
```

- **`src/fix/schema.mjs`** : schéma Zod de l'objet Fix (format de la mission). `issueType` = identifiant de problème Arachnide (`desc-missing`, `title-long`…), stable et déjà traduit.
- **`src/fix/catalog.mjs`** : pour chaque type de problème → catégorie `ai | deterministic | manual`, cible (`seo_title`, `meta_description`, `h1`, `image_alt`, `json_ld`, `redirect`, `canonical`, `noindex`, `link`), contraintes.
- **`src/fix/rules.mjs`** : règles déterministes — 404 interne → 301 vers l'URL la plus proche (similarité de chemin + titre), canonical manquante/incohérente → auto-référente, noindex accidentel (page dans le sitemap ou très liée) → retrait, lien vers redirection → URL finale.
- **`src/fix/engine.mjs`** : `proposeFixes(R, {issueTypes, urls, provider})`, file d'attente (3 requêtes simultanées), backoff 429, estimation de coût, validation Zod + 1 nouvelle tentative, plan d'action pour les problèmes non automatisables.
- **`src/ai/`** : interface `AIProvider.generateFix(issue, context)` ; `anthropic.mjs` (Messages API), `openai.mjs` (Chat Completions, réponse JSON) ; `models.json` (modèles par défaut éditables, tarifs indicatifs pour l'estimation) ; `settings.mjs` (clé chiffrée AES-256-GCM dans `~/.arachnide/ai.json`, clé locale `~/.arachnide/.secret`, fichiers en 0600, jamais renvoyée au navigateur ni loguée).
- **`src/fix/store.mjs`** : Fix persistés par crawl dans `~/.arachnide/fixes/<site>.json` (statuts), historique = journal `changes.mjs` + Fix appliqués.
- **Connecteurs (`src/fix/connectors.mjs`)** : interface `CMSConnector` (`testConnection`, `canApply`, `read`, `apply`, `rollback`) :
  - `wordpress` → adaptateur sur `WordPressConnector` + `changes.mjs` (ajout du champ `json_ld`) ;
  - `github` → nouveau : branche `arachnide/fix-AAAAMMJJ-HHMM`, commits par fichier, Pull Request avec tableau récapitulatif ; localisation par framework (Next `metadata`, React Helmet, Astro `<head>`, HTML statique), diff montré avant création ;
  - `export` → CSV + JSON + PDF avec instructions par CMS (réutilise `manual.mjs`) ;
  - Shopify / Webflow / Wix : connecteurs v3.0 existants pour les champs simples ; mapping Fix → TODO documenté dans `docs/CONNECTORS.md` (pas d'UI en V1).

## 3. API du serveur local (nouvelles routes)

| Route | Rôle |
|---|---|
| `GET/POST /api/ai/settings`, `POST /api/ai/test` | Fournisseur, modèle, clé (jamais renvoyée), test de connexion |
| `GET /api/fix/catalog` | Problèmes du dernier crawl groupés, badge IA / Automatique / Manuel, impact, coût estimé |
| `POST /api/fix/propose` | Génère des Fix (un problème, une URL ou « tout corriger ») — progression par SSE `/api/events` |
| `POST /api/fix/update` | Édition inline, validation, ignorer, régénérer |
| `GET/POST /api/fix/connection`, `POST /api/fix/connection/test` | Connexion WordPress / GitHub / export |
| `POST /api/fix/apply` | Applique les Fix validés (refusé en mode simulation) → re-crawl → `verified` / `failed` |
| `POST /api/fix/rollback` | Annule un Fix ou un lot |
| `GET /api/fix/history`, `GET /api/fix/export?format=csv|json` | Historique, exports |
| `GET /api/fix/wp-plugin.zip` | Plugin WordPress zippé (zip construit sans dépendance) |

## 4. UI

Nouvel onglet **« Corriger »** (groupe Vue d'ensemble) et onglet **« Historique des corrections »**, composants existants (tableaux, chips, dialogues `<dialog>`, icônes) :
- problèmes groupés par type, triés par impact (pages × gravité), badge de catégorie, boutons « Corriger » / « Tout corriger » (coût estimé + confirmation) ;
- panneau de revue : avant / après côte à côte, compteur de caractères et de pixels, édition inline, Valider / Régénérer / Ignorer, sélection multiple ;
- bandeau **Mode simulation** (activé par défaut, rien n'est poussé) ; avertissement explicite avant la première application réelle ;
- Paramètres > IA (dans la fenêtre Configuration existante) ; Paramètres > Connexion (WordPress / GitHub / export) ;
- Historique : filtres, « Annuler » par correction et par lot, export PDF « Corrections appliquées ».

## 5. Sécurité

- Les appels IA partent du serveur local (pas de CORS, la clé ne transite jamais par le navigateur après sa saisie).
- Données envoyées au fournisseur : URL, langue, title, H1, extrait ≤ ~2 000 tokens, titles/metas voisins (doublons) — rien d'autre.
- Clés chiffrées au repos, masquées dans toutes les réponses, exclues des exports et du journal ; pas de log des en-têtes.
- Plugin : capability `edit_posts` (objet) / `manage_options` (redirections), mots de passe d'application, valeurs précédentes conservées.

## 6. Étapes et commits

1. Objet Fix + fix-engine + règles déterministes + tests
2. Fournisseurs IA + paramètres (+ tests avec fournisseurs simulés)
3. UI de revue + historique + mode simulation
4. Connecteur WordPress (JSON-LD, adaptateur Fix) + plugin (i18n, zip)
5. Connecteur GitHub (PR) + tests avec API simulée
6. Export CSV/JSON/PDF, i18n complète, README, `docs/CONNECTORS.md`, CHANGELOG, test e2e en simulation

## 7. Questions

Aucune question bloquante. Choix par défaut retenus :
- `issueType` reprend les identifiants Arachnide existants (déjà traduits et testés) plutôt que de nouveaux noms ;
- modèles par défaut dans `src/ai/models.json`, modifiables dans l'UI ; la liste se rafraîchit depuis l'API du fournisseur au test de connexion ;
- JSON-LD : proposé par l'IA, appliqué via WordPress (plugin) ou GitHub ; exporté sinon.
