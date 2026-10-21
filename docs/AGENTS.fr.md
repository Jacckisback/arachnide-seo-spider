# Connecter votre agent IA à Arachnide (SEO + GEO)

Arachnide 3.13 est conçu pour être piloté par un agent IA — le vôtre, ou tout assistant qui parle **MCP** (Claude) ou **OpenAPI** (Actions ChatGPT, LangChain, n8n, Make…). L’agent lit l’audit que vous avez ouvert, lance des crawls qui s’affichent en direct dans l’application, explore les pages, obtient le plan d’action priorisé et le rapport de **préparation GEO**, puis — avec votre accord — corrige le site via les connecteurs CMS.

Tout tourne sur votre machine (ou votre serveur). Rien n’est envoyé à un tiers, hormis ce que reçoit le modèle de votre propre agent.

## Trois portes, un seul jeu de 25 outils

| Porte | Pour | URL | Authentification |
|---|---|---|---|
| **MCP en stdio** | Claude Code, Claude Desktop, tout client MCP local | `node src/mcp.mjs` | aucune (processus local) |
| **MCP en HTTP** (Streamable HTTP, JSON sans session) | connecteurs personnalisés claude.ai, serveurs distants de Claude Desktop, agents hébergés, Claude Agent SDK | `https://<votre-hôte>/mcp` | `Authorization: Bearer <jeton>` |
| **REST + OpenAPI 3.1** | Actions GPT de ChatGPT, outils OpenAI Agents/Responses, LangChain, n8n, Make, curl | `POST https://<votre-hôte>/api/agent/<outil>` · schéma sur `/openapi.json` | `Authorization: Bearer <jeton>` ou `X-API-Key: <jeton>` |

Le jeton est créé au premier démarrage d’Arachnide et vit dans `~/.arachnide/agent.json` (0600). Lisez-le, copiez-le ou renouvelez-le dans **Paramètres → Agents IA**. Sur un serveur, définissez plutôt `ARACHNIDE_AGENT_TOKEN`. Le même écran montre les derniers appels reçus des agents.

Les outils sont identiques sur les trois portes (ils viennent d’un seul registre, `src/agent/tools.mjs`). `crawl_id: "current"` désigne toujours *le crawl ouvert dans l’application* : dites à votre agent de l’utiliser quand l’utilisateur parle de « l’audit » qu’il a sous les yeux.

## 1. Claude Desktop ou Claude Code (en local)

```bash
claude mcp add arachnide -- node /chemin/vers/arachnide-seo-spider/src/mcp.mjs
```

Claude Desktop : Réglages → Développeur → Modifier la configuration, ajoutez le serveur `arachnide` (voir [docs/MCP.fr.md](MCP.fr.md)). Application lancée, vous pouvez aussi utiliser la porte HTTP depuis Claude Desktop : **Paramètres → Agents IA → Copier la config Claude Desktop** vous donne :

```json
{ "mcpServers": { "arachnide": { "url": "http://127.0.0.1:4000/mcp", "headers": { "Authorization": "Bearer ara_…" } } } }
```

## 2. claude.ai (connecteur personnalisé) et agents hébergés

claude.ai ne joint que des serveurs publics en HTTPS. Exposez l’application :

```bash
npm start                                        # Arachnide sur http://localhost:4000
cloudflared tunnel --url http://localhost:4000   # ou : ngrok http 4000 · tailscale funnel 4000
```

Puis dans Arachnide → **Paramètres → Agents IA**, collez l’URL publique (par ex. `https://xyz.trycloudflare.com`). Dans claude.ai → Réglages → Connecteurs → *Ajouter un connecteur personnalisé* : URL `https://xyz.trycloudflare.com/mcp`, et le jeton comme bearer token (pas besoin d’OAuth pour un connecteur personnel ; le jeton est votre clé, ne le partagez jamais).

Pour un **agent hébergé** construit avec le Claude Agent SDK / l’API Messages, ajoutez le serveur comme serveur MCP avec la même URL et le même en-tête `Authorization`, ou appelez directement la porte REST.

## 3. ChatGPT (Actions GPT) et agents OpenAI

Dans le créateur de GPT → *Actions* → **Importer depuis une URL** : `https://<votre-hôte>/openapi.json`. Authentification : **Clé API**, type **Bearer**, collez le jeton. Chaque outil devient une action (`arachnide_get_summary`, `arachnide_action_plan`, …) ; les outils en lecture seule sont marqués sans conséquence, les outils d’écriture (appliquer, annuler, configurer) demandent confirmation.

Avec l’API Agents / Responses d’OpenAI, pointez un outil MCP hébergé vers `https://<votre-hôte>/mcp` avec l’en-tête bearer, ou enveloppez les points d’entrée REST en fonctions à partir du schéma OpenAPI.

## Les outils (25)

| Outil | Ce qu’il fait | Écrit ? |
|---|---|---|
| `arachnide_detect_site` | CMS, framework, CDN et le connecteur adapté | non |
| `arachnide_crawl` | Crawl + ~95 contrôles SEO/GEO, attend le résultat ; `mode: "list"` avec `urls` ou `sitemap_url` crawle exactement ces URL | non |
| `arachnide_start_crawl` / `arachnide_crawl_status` | Le même crawl en arrière-plan, **en direct dans l’app**, suivi par identifiant de tâche | non |
| `arachnide_list_crawls` | Crawls enregistrés ; `current` en tête quand l’app en a un d’ouvert | non |
| `arachnide_get_summary` | Score, note, piliers, principaux problèmes | non |
| `arachnide_list_issues` / `arachnide_get_issue` | Problèmes par priorité, URL concernées (paginées) | non |
| `arachnide_action_plan` | Le plan d’action ordonné (gains rapides signalés), comme dans l’app | non |
| `arachnide_search_pages` | Trouver des pages par texte, statut, indexabilité, profondeur, dossier, problème ; tri par Link Score | non |
| `arachnide_get_page` | Tout sur une URL | non |
| `arachnide_geo_readiness` | Accès des robots IA, llms.txt, couverture des données structurées, profondeur du contenu, hygiène → score GEO 0-100 + recommandations | non |
| `arachnide_segments` | Sections du site (fiches produit, catégories, blog…) : score, erreurs et moyennes par segment, proposition d’un segment par répertoire, ou enregistrement des segments (sans recrawler). Passez ensuite `segment` aux outils de lecture | non (enregistre les segments avec le crawl) |
| `arachnide_fetch_page` | Lire une page en ligne (balises, titres, images, extrait du texte) | non |
| `arachnide_suggest_fixes` | Champs corrigeables par page, valeurs actuelles et contraintes | non |
| `arachnide_compare_crawls` | Avant/après entre deux crawls | non |
| `arachnide_list_connectors` / `arachnide_list_sites` / `arachnide_configure_site` / `arachnide_test_site` | Connecteurs CMS et configuration des sites (secrets en `env:VAR`, jamais dans le chat) | config |
| `arachnide_preview_changes` | Simulation d’un lot de modifications | non |
| `arachnide_apply_changes` | Appliquer les modifications approuvées via le connecteur, journalisées | **oui** |
| `arachnide_verify_changes` / `arachnide_rollback_changes` / `arachnide_list_changes` | Vérifier sur le site, annuler un lot, lire le journal | l’annulation écrit |

Tous les outils de lecture (`arachnide_get_summary`, `arachnide_list_issues`, `arachnide_get_issue`, `arachnide_action_plan`, `arachnide_search_pages`, `arachnide_geo_readiness`) acceptent `segment` : scores, problèmes et pages sont recalculés pour cette section du site.

Google Analytics 4 : passez `ga4_key_file` (et `ga4_property`) ou `ga4_csv` à `arachnide_crawl` / `arachnide_start_crawl` pour ajouter les sessions par page et repérer les pages orphelines qui reçoivent du trafic (`ga4-orphan`) ; `arachnide_search_pages` peut trier par `sessions`.

`GET /api/agent/tools` renvoie la même liste avec le JSON Schema de chaque entrée.

## Instructions suggérées pour un agent SEO / GEO

À coller dans les instructions de votre agent (projet Claude, instructions du GPT, `system` de l’Agent SDK) :

```
Tu es consultant SEO et GEO (optimisation pour les moteurs génératifs). Tu travailles avec Arachnide SEO Spider via ses outils.
- Quand l’utilisateur parle de « l’audit », « le site » ou « le crawl », utilise crawl_id "current" : c’est ce qu’il voit dans l’application Arachnide. Appelle arachnide_list_crawls en cas de doute.
- Commence toute analyse par arachnide_get_summary, puis arachnide_action_plan (quoi faire en premier) et arachnide_geo_readiness (visibilité dans les réponses des IA). Explique simplement, cite les chiffres, n’invente jamais une donnée absente des résultats.
- Pour explorer : arachnide_search_pages (tri par Link Score) et arachnide_get_page ; pour rédiger, lis d’abord la vraie page avec arachnide_fetch_page.
- Nouveau crawl : arachnide_start_crawl, puis arachnide_crawl_status toutes les 15-30 s ; l’utilisateur peut le suivre dans l’application.
- Modifications du site : arachnide_suggest_fixes → rédige toi-même les valeurs (langue du site, naturel, unique, dans les limites en pixels) → arachnide_preview_changes → montre un tableau avant/après → attends un « oui » explicite → arachnide_apply_changes → arachnide_verify_changes. Petits lots (10-30), pages les plus importantes d’abord. Chaque lot s’annule avec arachnide_rollback_changes.
- Ne demande jamais de coller un mot de passe ou une clé API dans le chat : configure les sites avec des références "env:VARIABLE".
```

## Modèle de sécurité

- Le jeton est exigé sur `/mcp` et `/api/agent/*` ; `/openapi.json` est public (il ne contient aucun secret) pour que les créateurs de GPT puissent l’importer. `/api/agent/settings` (jeton, journal) ne répond qu’à l’interface locale (même origine, hôte localhost).
- Les requêtes sont limitées (240 par minute et par IP) et les 50 derniers appels sont affichés dans l’application.
- Désactivez les agents à tout moment avec l’interrupteur de **Paramètres → Agents IA** ; renouvelez le jeton s’il fuit.
- N’exposez Arachnide qu’en HTTPS (tunnel ou proxy inverse). Derrière un proxy, transmettez `X-Forwarded-Proto` / `X-Forwarded-Host` ou renseignez l’URL publique dans l’application (ou `ARACHNIDE_PUBLIC_URL`).
- Les outils d’écriture suivent la même politique que le serveur MCP : champs autorisés par site, taille des lots, mode lecture seule, journal et annulation (voir [docs/MCP.fr.md](MCP.fr.md)).

## Exemples

```bash
# résumé de l’audit ouvert dans l’application
curl -X POST https://<hôte>/api/agent/arachnide_get_summary -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{}'
# les 10 pages au Link Score le plus élevé sous /blog/
curl -X POST https://<hôte>/api/agent/arachnide_search_pages -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{"folder":"/blog/","limit":10}'
# préparation GEO d’un crawl enregistré
curl -X POST https://<hôte>/api/agent/arachnide_geo_readiness -H "Authorization: Bearer ara_…" -H "Content-Type: application/json" -d '{"crawl_id":"www.exemple.fr_2026-10-19T09-00-00"}'
```

Les erreurs sont en JSON : `400` arguments invalides (avec le chemin du champ), `401` jeton absent ou invalide, `404` outil, crawl, problème ou page inconnu, `409` un crawl est déjà en cours.
