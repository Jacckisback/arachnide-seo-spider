# Changements de sitemap : n'auditer que ce qui a changé

*English version: [SITEMAP-CHANGES.md](SITEMAP-CHANGES.md)*

Sur une boutique ou un catalogue, des produits entrent et sortent chaque semaine. Recrawler tout le site pour savoir ce que sont devenus ceux qui sont partis est lent et inutile : la seule question est *que répondent aujourd'hui les URL retirées, et quoi faire de chacune*. Arachnide 3.23 y répond sans recrawler le site.

Donnez-lui le sitemap actuel (un fichier seul ou un **index de sitemaps avec ses sous-sitemaps**) et une référence (un crawl précédent, l'ancien sitemap, ou une liste d'URL). Il compare les deux, ne crawle **que les URL sorties** du sitemap (ou celles arrivées, ou les deux), **suit leurs redirections** pour connaître le code final, et rend une décision par URL.

## Les décisions

| Décision | L'URL répond… | Quoi faire |
|---|---|---|
| **301 vers la page proposée** (`redirect-suggested`) | 404 | La rediriger vers la page la plus proche encore dans le sitemap : même dossier, nom similaire (`chaussure-rouge-41` → `chaussure-rouge-42`). Le score de similarité (0–100) dit à quel point. Vérifiez, puis appliquez. |
| **Renvoyer 410** (`gone-410`) | 404, rien de similaire | Renvoyer 410 pour que les moteurs la retirent plus vite. Si une page pertinente existe ailleurs, redirigez plutôt vers elle. |
| **Réparer la redirection** (`redirect-broken`) | redirige vers une 4xx / 5xx, une boucle ou une chaîne sans fin | Pointer la redirection vers une page vivante (200). |
| **Réparer l'erreur serveur** (`error`) | 5xx, délai dépassé, ou 401 / 403 / 429 | Réparer, ou retirer proprement (301 ou 410). |
| **Toujours en ligne** (`live`) | 200 et indexable | Soit la remettre dans le sitemap et la garder maillée, soit la retirer (301 / 410) et supprimer les liens internes. Le crawl ne peut pas trancher celle-ci à votre place. |
| **Ajoutée mais non indexable** (`added-bad`) | nouvelle dans le sitemap mais pas une page 200 indexable | La réparer ou la sortir du sitemap. |
| **Raccourcir la chaîne** (`redirect-chain`) | redirige correctement, en plusieurs sauts | Pointer la première redirection directement vers la page finale. |
| Redirection OK, partie OK, hors index, ajoutée OK | — | Rien à faire. |

Les décisions qui demandent du travail sont aussi des **problèmes SEO** (`sitemap-removed-404`, `sitemap-removed-redirect-broken`, `sitemap-removed-error`, `sitemap-removed-live`, `sitemap-added-not-indexable`, `sitemap-removed-redirect-chain`), avec gravité, impact, effort et priorité comme les autres contrôles : ils comptent dans le score et apparaissent dans le plan d'action et le rapport client.

## Dans l'application

1. Passez la barre du haut en mode **Liste**. Un nouveau bouton (icône sitemap) ouvre les *Options du mode liste*.
2. **URL du sitemap ou de l'index de sitemaps** : collez-la. Coller des URL dans le champ texte marche toujours et passe avant le sitemap.
3. **Comparer avec** : choisissez un crawl précédent du même site dans l'historique. La référence d'un crawl précédent est la liste de ses URL de sitemap (mode spider), sa liste (mode liste), ou, pour un crawl de *changements* précédent, le sitemap complet lu ce jour-là. La première fois, crawlez le sitemap une fois sans comparaison ; la fois suivante, comparez avec lui.
4. **Crawler** : les URL retirées du sitemap (par défaut), les ajoutées, ou les deux. *Suivre les redirections* est coché, pour connaître le code final.
5. Enregistrez, puis lancez le crawl. L'onglet **Changements de sitemap** liste chaque URL changée avec son code, sa décision, la cible proposée, la chaîne de redirections et l'indexabilité ; le filtre *À traiter* est actif par défaut et chaque filtre s'exporte en CSV. Le tableau de bord gagne une carte avec les comptages et les problèmes liés ; la fiche de page indique *Retirée* / *Ajoutée*.

Les options sont mémorisées. Les effacer ramène le mode liste ordinaire.

## Ligne de commande

```bash
# Jour 1 : crawler le sitemap une fois (n'importe quel crawl du site sert de référence)
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --out crawls

# Plus tard : seulement les URL sorties du sitemap depuis ce crawl, avec les décisions
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --sitemap-previous crawls/www.example.com_2026-10-01T06-00-00.jsonl.gz --csv --report

# La référence peut aussi être un ancien sitemap (fichier, .gz ou URL) ou une liste texte d'URL
node src/cli.mjs --sitemap https://www.example.com/sitemap_index.xml --sitemap-previous ancien-sitemap.xml.gz --sitemap-changes both --csv
node src/cli.mjs --list aujourdhui.txt --sitemap-previous hier.txt --csv
```

| Option | Effet |
|---|---|
| `--sitemap-previous SRC` | La référence : un crawl enregistré (`.jsonl.gz` / `.json`), un sitemap ou un index (fichier, `.gz` ou URL) ou une liste texte (une URL par ligne). Nécessite `--sitemap` ou `--list`. |
| `--sitemap-changes removed\|added\|both` | Quelles URL changées crawler (`removed` par défaut) |

Le résumé affiche la comparaison et le compte des décisions ; `--csv` écrit `<crawl>_sitemap-changes.csv` (URL, changement, code, indexabilité, redirection, URL finale, code final, sauts, décision, cible proposée, similarité) ; le rapport gagne une section *Changements de sitemap*.

## Agents IA (MCP, Actions ChatGPT, REST)

`arachnide_crawl` / `arachnide_start_crawl` prennent `sitemap_url` plus `sitemap_previous_crawl` (un identifiant de crawl venant d'`arachnide_list_crawls`) ou `sitemap_previous_urls` (les URL de l'ancien sitemap), `sitemap_changes` (`removed` par défaut) et `follow_redirects`. Puis **`arachnide_sitemap_changes`** lit les décisions : les comptages de la comparaison, et les lignes filtrées par `decision` (`actions` = tout ce qui demande du travail, ou une décision) ou `change`, avec un *what_to_do* en clair par URL, paginé.

## Comment se fait le rapprochement

- Les URL du sitemap et la référence passent par **la même normalisation que le crawler** (paramètres triés, paramètres de suivi retirés, motifs *retirer les paramètres*) : les variantes `?utm_source=` ne comptent jamais comme des changements.
- Un index de sitemaps est lu en largeur, jusqu'à 500 fichiers.
- La cible proposée est choisie parmi les URL **encore dans le sitemap** : les dossiers communs pèsent 35 %, les mots communs du dernier segment 65 % ; sous 34 %, rien n'est proposé et la décision devient 410. L'accueil n'est jamais proposé.
- Les chaînes de redirections sont suivies jusqu'à 10 sauts ; une boucle ou une chaîne plus longue est *cassée*. Une redirection vers un autre hôte est signalée avec sa cible, sans code final.
- Chaque crawl de *changements* garde le sitemap complet qu'il a lu : il peut servir de référence au suivant. Lancez-le chaque semaine contre la semaine précédente.

## Limites

- La référence ne dit pas *pourquoi* une URL a quitté le sitemap ; la décision *toujours en ligne* vous est laissée exprès.
- Une page retirée du sitemap mais encore liée en interne garde ses liens : un crawl spider les trouve (contrôles *4xx* et *broken-internal*).
- La similarité est lexicale (mots de l'URL), pas sémantique : `chaussure-rouge-41` trouve `chaussure-rouge-42`, mais `basket-rouge` ne trouve pas `sneaker-rouge`.
