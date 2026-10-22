# Analyse des logs serveur

*English version: [LOGS.md](LOGS.md)*

Un crawl montre ce qu'un moteur **pouvait** atteindre sur votre site. Les journaux d'accès de votre serveur montrent ce que Googlebot, Bingbot et les robots IA **demandent réellement**, à quelle fréquence, avec quel statut, et en combien de temps le serveur a répondu. Arachnide lit ces logs et les rattache au crawl ouvert, comme le Log File Analyser de Screaming Frog, mais dans le même outil, sur le même crawl, sans licence à part.

Tout se passe sur votre machine : les fichiers sont lus ligne par ligne, jamais conservés, et seuls des comptages agrégés sont gardés à côté du crawl.

## Ce que vous obtenez

| Où | Quoi |
|---|---|
| **Onglet Logs** | Requêtes, Googlebot, autres robots, visiteurs, pages hors crawl, 5xx servies aux robots. Un graphique des requêtes par jour (robots de recherche, robots IA, autres robots, visiteurs), les robots vus (requêtes, IP distinctes, usurpées), les dossiers les plus demandés, et un tableau de chaque URL vue dans les logs avec les données du crawl à côté (statut, indexabilité, profondeur, Link Score). |
| **Filtres du tableau** | *Avec requêtes*, *Crawlées par les robots, hors crawl*, *Jamais visitées par Googlebot*, *Budget de crawl gaspillé*, *5xx servies aux robots*, *Robots usurpés*, *Ressources*, *Aucune requête*. Chaque filtre s'exporte en CSV. |
| **Fiche de page** | Requêtes, compteurs Googlebot / Bingbot / IA, dernière requête, temps serveur moyen pour chaque page du crawl. |
| **Tableau de bord** | Une carte avec les requêtes Googlebot, les requêtes de robots, les pages hors crawl, les requêtes usurpées, le graphique par jour et les problèmes issus des logs. |
| **Problèmes SEO et plan d'action** | Six contrôles (ci-dessous) avec la même gravité, le même impact, effort et priorité que les ~95 autres. Ils comptent dans le score. |
| **Segments** | Requêtes et requêtes Googlebot par segment ; trois champs de règle (*Requêtes dans les logs*, *Requêtes des robots de recherche*, *Requêtes de Googlebot*) pour bâtir des segments comme « pages que Googlebot ne voit jamais ». |
| **Rapport** | Une section « Logs serveur » dans le rapport client HTML / PDF. |
| **CLI et agents IA** | `--logs`, des colonnes dans `pages.csv`, et l'outil `arachnide_logs` (voir plus bas). |

## Importer des logs

1. Ouvrez un crawl (ou terminez-en un).
2. **Logs serveur** dans la barre latérale → déposez un ou plusieurs fichiers, ou cliquez pour choisir. Les fichiers compressés `.gz` sont acceptés tels quels ; les fichiers de rotation (`access.log`, `access.log.1`, `access.log.2.gz`…) s'importent ensemble.
3. Laissez *Format* sur **Détecter automatiquement**, ou choisissez un format. Pour un `log_format` Nginx inhabituel, choisissez **Personnalisé** et collez le motif de la directive (`$remote_addr - $remote_user [$time_local] "$request" $status …`).
4. Gardez **Vérifier les IP Googlebot / Bingbot par DNS inverse** coché si la machine a accès au réseau : chaque IP qui se dit Googlebot ou Bingbot est vérifiée comme Google et Bing le documentent (DNS inverse, puis DNS direct vers l'IP). Les requêtes des IP qui échouent sont comptées comme *usurpées* et retirées des compteurs de robots.
5. **Analyser avec ce crawl**. L'onglet Logs, les problèmes SEO, le score et le tableau de bord se mettent à jour. Les comptages agrégés sont enregistrés dans `crawls/<crawl>.logs.jsonl.gz` et reviennent à la réouverture du crawl.

*Importer d'autres fichiers* ajoute des fichiers au même crawl ; *Retirer les logs* supprime le fichier voisin et les contrôles issus des logs.

### Formats reconnus

| Format | Exemple de source |
|---|---|
| **combined** / **common** (Apache, Nginx par défaut) | `66.249.66.1 - - [10/Oct/2026:13:55:36 +0000] "GET /page HTTP/1.1" 200 5123 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; …)"` |
| **W3C extended** (IIS, CloudFront, Azure) | `#Fields: date time c-ip cs-method cs-uri-stem cs-uri-query sc-status cs(User-Agent) time-taken` |
| **JSON lignes** (Nginx `log_format … escape=json`, Cloudflare Logpush, Caddy, Traefik, exports Vercel / Netlify) | un objet JSON par ligne ; les champs sont reconnus par leur nom (`remote_addr` / `ClientIP` / `request.remote_ip`, `request_uri` / `ClientRequestURI`, `status` / `EdgeResponseStatus`, `http_user_agent` / `ClientRequestUserAgent`, `request_time` / `OriginResponseDurationMs`…) |
| **Personnalisé** | tout motif `log_format` Nginx avec `$remote_addr`, `$time_local`, `$request`, `$status`, `$body_bytes_sent`, `$http_referer`, `$http_user_agent`, `$request_time`, `$host`, `$request_method`, `$request_uri`… |

Les lignes qui ne correspondent pas sont comptées comme *ignorées* ; un fichier où rien ne correspond est refusé avec un échantillon de ses premières lignes. Les requêtes vers un autre hôte (logs multi-sites avec un champ hôte) sont ignorées et comptées. La date accepte le format CLF (`10/Oct/2026:13:55:36 +0200`), ISO 8601, et l'epoch en secondes / millisecondes / nanosecondes.

### Rattachement des URL

Le chemin d'une ligne de log devient une URL absolue sur l'origine du crawl, puis passe par **la même normalisation que le crawler** : fragment retiré, paramètres triés, paramètres de suivi (`utm_*`, `gclid`, `fbclid`…) et motifs *retirer les paramètres* du crawl supprimés, `ignoreQuery` respecté. `/page?utm_source=news` et `/page` sont une seule page, comme dans le crawl. L'hôte est comparé sans `www.`.

Les URL vues dans les logs mais absentes du crawl sont gardées comme **URL hors crawl** (marquées *ressource* quand l'extension dit image, script, style, police, PDF…).

## Les six contrôles

| Contrôle | Gravité | Ce que cela veut dire |
|---|---|---|
| **Pages crawlées par les moteurs mais sans lien** (`log-orphan`) | avertissement | Googlebot ou Bingbot demandent l'URL (servie 200) mais le crawl ne l'a jamais atteinte en suivant les liens : soit elle est hors crawl, soit c'est une page du sitemap que rien ne lie. Liez-la, ou redirigez / 410. |
| **Pages indexables jamais visitées par Googlebot** (`log-not-crawled`) | remarque | Sur la période des logs (au moins 7 jours, avec Googlebot actif sur le site), ces pages indexables n'ont jamais été demandées par Googlebot. Trop profondes, mal maillées, ou jugées sans valeur pour le budget. |
| **Budget de crawl gaspillé en redirections, erreurs et URL non indexables** (`log-crawl-waste`) | avertissement | Les robots de recherche dépensent des requêtes sur des redirections, des 4xx, des pages noindex / canonicalisées et des URL à paramètres. Corrigez les liens internes et les sitemaps, renvoyez 410 pour les pages disparues, bloquez les facettes. |
| **Erreurs serveur (5xx) servies aux robots** (`log-bot-errors`) | erreur | Des robots de recherche ou IA ont reçu des réponses 5xx. Des 5xx répétées font ralentir le crawl de Google et peuvent sortir des URL de l'index. |
| **Fausses visites Googlebot / Bingbot** (`log-spoofed`) | remarque | Requêtes d'IP qui échouent à la vérification DNS inverse. Rien à changer pour le SEO ; bloquez-les au pare-feu ou au CDN si la charge pose problème. Seulement avec la vérification DNS. |
| **Pages lentes pour les robots de recherche** (`log-slow`) | remarque | Temps serveur moyen au-dessus du seuil *lent* pour les robots de recherche (nécessite un champ de temps de réponse : `$request_time`, `time-taken`, `OriginResponseDurationMs`…). |

Les requêtes usurpées sont exclues de tous les compteurs de robots une fois la vérification faite ; sans vérification, l'onglet Logs le dit.

## Ligne de commande

```bash
node src/cli.mjs https://example.com --logs access.log --logs access.log.1.gz --csv --report
node src/cli.mjs https://example.com --logs iis.log --logs-format w3c
node src/cli.mjs https://example.com --logs app.log --logs-format custom --logs-custom '$remote_addr [$time_local] "$request" $status $body_bytes_sent "$http_user_agent" $request_time'
node src/cli.mjs https://example.com --logs access.log --logs-verify
```

| Option | Effet |
|---|---|
| `--logs FICHIER` | Journal d'accès à analyser avec le crawl (répétable ; `.gz` accepté) |
| `--logs-format auto\|combined\|common\|w3c\|json\|custom` | Forcer un format (par défaut : détection) |
| `--logs-custom MOTIF` | Motif `log_format` Nginx pour `--logs-format custom` |
| `--logs-verify` | Vérifier les IP Googlebot / Bingbot par DNS inverse |

Le résumé affiche les requêtes, les requêtes Googlebot et les pages hors crawl ; le crawl est enregistré sans les logs, les comptages agrégés vont dans `<crawl>.logs.jsonl.gz` à côté (l'application lit les deux) ; `pages.csv` gagne les colonnes *Requêtes*, *Googlebot* et *Dernière requête* ; le rapport gagne sa section.

## Agents IA (MCP, Actions ChatGPT, REST)

`arachnide_logs` lit les logs rattachés à un crawl. `section` choisit ce qui revient :

| `section` | Renvoie |
|---|---|
| `summary` (défaut) | période, fichiers, totaux par famille et par statut, requêtes Googlebot / Bingbot, URL rattachées et hors crawl, vérification, principaux robots, problèmes issus des logs |
| `bots`, `timeline`, `directories` | les robots vus, les requêtes par jour, les requêtes par dossier (paginés) |
| `top_urls` | les URL par requêtes ; `bot` = `all`, `googlebot`, `bingbot`, `search`, `ai`, `human` |
| `orphans`, `not_crawled`, `waste`, `errors`, `spoofed`, `slow` | les URL de chaque contrôle, avec le détail |

`arachnide_search_pages` accepte `sort: "log_hits"` / `"googlebot_hits"` et renvoie `log_hits`, `googlebot_hits`, `last_crawled_by_googlebot` ; `arachnide_get_summary` porte un bloc `server_logs`. Sans logs, l'outil répond par une erreur `not_found` qui dit comment les importer.

## Limites

- L'agrégation garde jusqu'à 2 000 000 d'URL distinctes par crawl ; au-delà, les requêtes sont comptées en *overflow* et non détaillées.
- La vérification DNS a besoin du réseau et prend quelques millisecondes par IP distincte (cache, 8 en parallèle, délai de 4 s). Sans enregistrement inverse, une IP qui se dit Googlebot est comptée comme usurpée, comme Google le documente.
- Les robots sont reconnus par user-agent (environ 80 signatures : moteurs de recherche, crawlers IA, outils SEO, aperçus sociaux, supervision). Les user-agents inconnus comptent comme visiteurs.
- Les logs sont rattachés au crawl ouvert : un crawl de `https://www.example.com` avec des logs de `example.com` fonctionne (même hôte sans `www.`) ; les logs d'un autre domaine sont ignorés et comptés comme *autre hôte*.
