// Post-traitement : indexabilité, graphe de liens, profondeur, doublons, redirections et liste des problèmes SEO.

export const THRESHOLDS = {
  titleMax: 60,
  titleMin: 30,
  descMax: 155,
  descMin: 70,
  thinWords: 200,
  slowMs: 1000,
  largeHtmlBytes: 500 * 1024,
  largeImageBytes: 150 * 1024,
  deepLevel: 4,
  urlMaxLength: 115,
  lowTextRatio: 10,
};

const SEV_ORDER = { error: 0, warning: 1, notice: 2 };

function indexability(p) {
  if (p.blockedByRobots) return 'Bloqué par robots.txt';
  if (!p.status) return 'Aucune réponse';
  if (p.status >= 300 && p.status < 400) return 'Redirection';
  if (p.status >= 400 && p.status < 500) return 'Erreur client (4xx)';
  if (p.status >= 500) return 'Erreur serveur (5xx)';
  if (/noindex|none/i.test(`${p.metaRobots || ''} ${p.xRobotsTag || ''}`)) return 'Noindex';
  if (p.isHtml && p.canonical && p.canonical !== p.url) return 'Canonicalisée';
  return '';
}

export function analyze(crawler) {
  const T = THRESHOLDS;
  const pages = [...crawler.pages.values()];
  const byUrl = crawler.pages;
  const start = crawler.startUrl;

  for (const p of pages) {
    p.indexabilityReason = indexability(p);
    p.indexable = !p.indexabilityReason;
    p.inlinks = 0;
    p.uniqueInlinks = 0;
    p.h1Count = p.h1?.length || 0;
    p.h2Count = p.h2?.length || 0;
    p.titleLength = p.title?.length || 0;
    p.metaDescriptionLength = p.metaDescription?.length || 0;
    p.urlLength = p.url.length;
  }

  // Graphe de liens internes
  const inFrom = new Map();
  const adj = new Map();
  for (const l of crawler.links) {
    if (!l.internal) continue;
    const t = byUrl.get(l.to);
    if (t) t.inlinks++;
    if (!inFrom.has(l.to)) inFrom.set(l.to, new Set());
    inFrom.get(l.to).add(l.from);
    if (!l.nofollow) {
      if (!adj.has(l.from)) adj.set(l.from, new Set());
      adj.get(l.from).add(l.to);
    }
  }
  for (const [to, set] of inFrom) {
    const t = byUrl.get(to);
    if (t) t.uniqueInlinks = set.size;
  }
  for (const p of pages) {
    if (p.redirectUrl) {
      if (!adj.has(p.url)) adj.set(p.url, new Set());
      adj.get(p.url).add(crawler.normalize(p.redirectUrl) || p.redirectUrl);
    }
  }

  // Profondeur réelle (plus court chemin depuis l'accueil)
  for (const p of pages) p.depth = null;
  const q = [start];
  const dist = new Map([[start, 0]]);
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    for (const v of adj.get(u) || []) {
      if (!dist.has(v)) {
        dist.set(v, dist.get(u) + 1);
        q.push(v);
      }
    }
  }
  for (const [u, d] of dist) {
    const p = byUrl.get(u);
    if (p) p.depth = d;
  }

  // Chaînes de redirection
  const redirects = [];
  for (const p of pages) {
    if (!p.redirectUrl) continue;
    const chain = [p.url];
    let cur = p;
    let loop = false;
    while (cur && cur.redirectUrl) {
      const next = crawler.normalize(cur.redirectUrl) || cur.redirectUrl;
      if (chain.includes(next)) {
        loop = true;
        chain.push(next);
        break;
      }
      chain.push(next);
      cur = byUrl.get(next);
      if (chain.length > 12) break;
    }
    const final = byUrl.get(chain[chain.length - 1]);
    p.redirectHops = chain.length - 1;
    p.finalUrl = chain[chain.length - 1];
    redirects.push({
      url: p.url,
      status: p.status,
      target: p.redirectUrl,
      hops: chain.length - 1,
      chain,
      loop,
      finalUrl: p.finalUrl,
      finalStatus: loop ? null : final?.status ?? null,
      inlinks: p.inlinks,
    });
  }

  const html200 = pages.filter((p) => p.isHtml && p.status === 200);
  const indexableHtml = html200.filter((p) => p.indexable);
  const internalOnly = pages.filter((p) => p.url.startsWith('http'));

  const dupMap = (key) => {
    const m = new Map();
    for (const p of indexableHtml) {
      const v = key(p);
      if (!v) continue;
      const k = v.toLowerCase();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    const dups = new Set();
    for (const arr of m.values()) if (arr.length > 1) arr.forEach((p) => dups.add(p.url));
    return { m, dups };
  };
  const dupTitle = dupMap((p) => p.title);
  const dupDesc = dupMap((p) => p.metaDescription);
  const dupH1 = dupMap((p) => p.h1?.[0]);
  const dupContent = dupMap((p) => p.contentHash);
  for (const p of html200) {
    p.duplicateTitle = dupTitle.dups.has(p.url);
    p.duplicateDescription = dupDesc.dups.has(p.url);
    p.duplicateH1 = dupH1.dups.has(p.url);
    p.duplicateContent = dupContent.dups.has(p.url);
  }
  const dupCount = (d, key, p) => d.m.get((key(p) || '').toLowerCase())?.length || 0;

  // Liens cassés / vers redirections
  const brokenLinks = [];
  const linksToRedirects = [];
  const nofollowInternal = [];
  for (const l of crawler.links) {
    if (l.internal) {
      const t = byUrl.get(l.to);
      if (l.nofollow) nofollowInternal.push(l);
      if (!t || t.blockedByRobots) continue;
      if (!t.status || t.status >= 400) brokenLinks.push({ from: l.from, to: l.to, anchor: l.anchor, status: t.status, statusText: t.statusText || t.error });
      else if (t.status >= 300) linksToRedirects.push({ from: l.from, to: l.to, anchor: l.anchor, status: t.status, target: t.redirectUrl });
    } else {
      const ex = crawler.externals.get(l.to);
      if (ex && ex.status !== null && (ex.status === 0 || ex.status >= 400)) {
        brokenLinks.push({ from: l.from, to: l.to, anchor: l.anchor, status: ex.status, statusText: ex.statusText, external: true });
      }
    }
  }

  // Hreflang : liens retour manquants
  const hreflangMissingReturn = [];
  for (const p of html200) {
    for (const h of p.hreflang || []) {
      const n = crawler.normalize(h.href) || h.href;
      if (n === p.url) continue;
      const t = byUrl.get(n);
      if (!t || !t.isHtml || t.status !== 200) continue;
      const back = (t.hreflang || []).some((x) => (crawler.normalize(x.href) || x.href) === p.url);
      if (!back) hreflangMissingReturn.push({ url: p.url, detail: `${h.lang} → ${n}` });
    }
  }

  // Problèmes
  const issues = [];
  const add = (id, severity, category, label, description, fix, list) => {
    if (list.length) issues.push({ id, severity, category, label, description, fix, count: list.length, items: list });
  };
  const u = (arr, detail = () => '') => arr.map((p) => ({ url: p.url, detail: detail(p) }));
  const has = (p, s) => new RegExp(s, 'i').test(`${p.metaRobots || ''} ${p.xRobotsTag || ''}`);

  // Codes réponse
  add('4xx', 'error', 'Codes réponse', 'URLs internes en erreur 4xx', 'Pages introuvables ou interdites, liées depuis le site.', 'Corrigez les liens qui pointent vers ces URLs ou redirigez-les (301) vers une page équivalente.', u(pages.filter((p) => p.status >= 400 && p.status < 500), (p) => `${p.status} · ${p.inlinks} lien(s) entrant(s)`));
  add('5xx', 'error', 'Codes réponse', 'URLs internes en erreur serveur 5xx', 'Le serveur a renvoyé une erreur.', 'Vérifiez les logs serveur, la charge et les plugins. Recrawlez ensuite.', u(pages.filter((p) => p.status >= 500), (p) => String(p.status)));
  add('no-response', 'error', 'Codes réponse', 'URLs sans réponse (timeout / DNS / connexion)', 'Aucune réponse HTTP reçue.', 'Vérifiez la disponibilité du serveur, le DNS et le certificat SSL ; augmentez le timeout si le site est lent.', u(pages.filter((p) => !p.status && !p.blockedByRobots), (p) => p.error));
  add('broken-internal', 'error', 'Liens', 'Liens internes cassés', 'Pages contenant des liens vers des URLs internes en erreur.', 'Remplacez ou supprimez ces liens (voir l’onglet « Liens cassés »).', brokenLinks.filter((l) => !l.external).map((l) => ({ url: l.from, detail: `→ ${l.to} (${l.status || l.statusText})` })));
  add('broken-external', 'warning', 'Liens', 'Liens externes cassés', 'Liens sortants vers des pages externes en erreur.', 'Mettez à jour ou supprimez ces liens sortants.', brokenLinks.filter((l) => l.external).map((l) => ({ url: l.from, detail: `→ ${l.to} (${l.status || l.statusText})` })));
  add('redirect-loop', 'error', 'Redirections', 'Boucles de redirection', 'La redirection revient sur une URL déjà visitée.', 'Corrigez la règle de redirection pour pointer vers l’URL finale en 200.', redirects.filter((r) => r.loop).map((r) => ({ url: r.url, detail: r.chain.join(' → ') })));
  add('redirect-chain', 'warning', 'Redirections', 'Chaînes de redirection (2 sauts ou plus)', 'Plusieurs redirections successives diluent le crawl budget et ralentissent.', 'Redirigez directement vers l’URL finale.', redirects.filter((r) => r.hops > 1 && !r.loop).map((r) => ({ url: r.url, detail: r.chain.join(' → ') })));
  add('links-to-redirect', 'warning', 'Liens', 'Liens internes vers des redirections', 'Des liens internes pointent vers des URLs 3xx.', 'Mettez à jour les liens pour pointer directement vers l’URL finale.', linksToRedirects.map((l) => ({ url: l.from, detail: `→ ${l.to} (${l.status} → ${l.target})` })));
  const homes = new Set([start, crawler.finalStart]);
  add('redirect-to-home', 'warning', 'Redirections', 'Redirections vers la page d’accueil', 'Des URLs internes sont redirigées vers l’accueil : Google les traite souvent comme des soft 404 et le jus SEO est perdu.', 'Redirigez chaque ancienne URL vers la page la plus proche thématiquement (ou renvoyez une 410 si le contenu n’existe plus).', redirects.filter((r) => !r.loop && homes.has(r.finalUrl) && !homes.has(r.url) && new URL(r.url).pathname !== '/').map((r) => ({ url: r.url, detail: `${r.status} → ${r.finalUrl}` })));
  add('redirect-3xx', 'notice', 'Redirections', 'URLs internes redirigées (3xx)', 'URLs internes qui redirigent.', 'Normal après une migration, mais évitez de les lier en interne.', u(pages.filter((p) => p.status >= 300 && p.status < 400), (p) => `${p.status} → ${p.redirectUrl}`));
  add('redirect-302', 'warning', 'Redirections', 'Redirections temporaires (302/307)', 'Une redirection temporaire ne transmet pas les signaux aussi clairement qu’une 301.', 'Utilisez une 301/308 si le déplacement est définitif.', u(pages.filter((p) => p.status === 302 || p.status === 307), (p) => `${p.status} → ${p.redirectUrl}`));
  add('http-urls', 'warning', 'Sécurité', 'URLs internes en HTTP (non sécurisé)', 'Des URLs http:// sont liées alors que le site est en HTTPS.', 'Forcez le HTTPS et mettez à jour les liens internes.', crawler.origin?.startsWith('https') ? u(pages.filter((p) => p.url.startsWith('http:'))) : []);
  add('mixed-content', 'warning', 'Sécurité', 'Contenu mixte (ressources HTTP sur page HTTPS)', 'Images, scripts ou CSS chargés en http:// sur une page https://.', 'Passez toutes les ressources en https://.', u(html200.filter((p) => p.mixedContent > 0), (p) => `${p.mixedContent} ressource(s)`));

  // Titres
  add('title-missing', 'error', 'Titres', 'Balise title manquante ou vide', 'La page n’a pas de <title>.', 'Rédigez un titre unique de 30 à 60 caractères avec le mot-clé principal.', u(html200.filter((p) => !p.title)));
  add('title-duplicate', 'error', 'Titres', 'Titres dupliqués', 'Plusieurs pages indexables partagent le même titre.', 'Rendez chaque titre unique et descriptif.', u(html200.filter((p) => p.duplicateTitle), (p) => `${p.title} (×${dupCount(dupTitle, (x) => x.title, p)})`));
  add('title-long', 'warning', 'Titres', `Titres trop longs (> ${T.titleMax} car.)`, 'Risque de troncature dans Google.', 'Raccourcissez le titre et placez le mot-clé au début.', u(html200.filter((p) => p.titleLength > T.titleMax), (p) => `${p.titleLength} car. · ${p.title}`));
  add('title-short', 'warning', 'Titres', `Titres trop courts (< ${T.titleMin} car.)`, 'Titre peu descriptif, opportunité manquée.', 'Enrichissez le titre (mot-clé + bénéfice + marque).', u(html200.filter((p) => p.title && p.titleLength < T.titleMin), (p) => `${p.titleLength} car. · ${p.title}`));
  add('title-multiple', 'warning', 'Titres', 'Plusieurs balises title', 'La page contient plus d’une balise <title>.', 'Ne gardez qu’une seule balise <title> dans le <head>.', u(html200.filter((p) => p.titleCount > 1), (p) => `${p.titleCount} titres`));
  add('title-eq-h1', 'notice', 'Titres', 'Title identique au H1', 'Le title et le H1 sont strictement identiques.', 'Pas une erreur, mais varier les formulations élargit le champ sémantique.', u(html200.filter((p) => p.title && p.h1?.[0] && p.title.trim().toLowerCase() === p.h1[0].trim().toLowerCase())));

  // Meta descriptions
  add('desc-missing', 'warning', 'Meta description', 'Meta description manquante', 'Google générera lui-même un extrait.', 'Rédigez une description incitative de 120 à 155 caractères.', u(html200.filter((p) => p.indexable && !p.metaDescription)));
  add('desc-duplicate', 'warning', 'Meta description', 'Meta descriptions dupliquées', 'Plusieurs pages partagent la même description.', 'Écrivez une description unique par page.', u(html200.filter((p) => p.duplicateDescription), (p) => `×${dupCount(dupDesc, (x) => x.metaDescription, p)} · ${p.metaDescription.slice(0, 80)}`));
  add('desc-long', 'notice', 'Meta description', `Meta descriptions trop longues (> ${T.descMax} car.)`, 'Risque de troncature.', 'Raccourcissez à ~155 caractères.', u(html200.filter((p) => p.metaDescriptionLength > T.descMax), (p) => `${p.metaDescriptionLength} car.`));
  add('desc-short', 'notice', 'Meta description', `Meta descriptions trop courtes (< ${T.descMin} car.)`, 'Description peu incitative.', 'Développez avec un bénéfice et un appel à l’action.', u(html200.filter((p) => p.metaDescription && p.metaDescriptionLength < T.descMin), (p) => `${p.metaDescriptionLength} car.`));
  add('desc-multiple', 'warning', 'Meta description', 'Plusieurs meta descriptions', 'Plus d’une balise meta description.', 'N’en gardez qu’une.', u(html200.filter((p) => p.metaDescriptionCount > 1)));

  // Titres Hn
  add('h1-missing', 'warning', 'H1', 'H1 manquant', 'La page n’a pas de titre H1.', 'Ajoutez un H1 unique décrivant le sujet de la page.', u(html200.filter((p) => p.indexable && !p.h1Count)));
  add('h1-multiple', 'notice', 'H1', 'Plusieurs H1', 'La page contient plusieurs H1.', 'Gardez un H1 principal et passez les autres en H2.', u(html200.filter((p) => p.h1Count > 1), (p) => p.h1.join(' | ')));
  add('h1-duplicate', 'warning', 'H1', 'H1 dupliqués', 'Plusieurs pages indexables ont le même H1.', 'Différenciez les H1.', u(html200.filter((p) => p.duplicateH1), (p) => p.h1[0]));
  add('h2-missing', 'notice', 'H2', 'Pas de H2', 'Aucun sous-titre H2 : structure faible.', 'Structurez le contenu avec des H2 contenant des mots-clés secondaires.', u(indexableHtml.filter((p) => !p.h2Count)));

  // Contenu
  add('thin-content', 'warning', 'Contenu', `Contenu faible (< ${T.thinWords} mots)`, 'Peu de texte : risque de page jugée de faible qualité (Helpful Content).', 'Enrichissez la page ou fusionnez-la / passez-la en noindex.', u(indexableHtml.filter((p) => p.wordCount < T.thinWords), (p) => `${p.wordCount} mots`));
  add('duplicate-content', 'error', 'Contenu', 'Contenu dupliqué (pages identiques)', 'Plusieurs pages indexables ont exactement le même texte.', 'Ajoutez une canonical vers la version principale ou supprimez les doublons.', u(html200.filter((p) => p.duplicateContent), (p) => `×${dupCount(dupContent, (x) => x.contentHash, p)}`));
  add('low-text-ratio', 'notice', 'Contenu', `Ratio texte/HTML faible (< ${T.lowTextRatio} %)`, 'Beaucoup de code pour peu de texte.', 'Allégez le HTML (scripts inline, builder) ou ajoutez du contenu.', u(indexableHtml.filter((p) => p.textRatio < T.lowTextRatio), (p) => `${p.textRatio} %`));

  // Images
  const imgs = [...crawler.images.values()];
  add('img-alt-missing', 'warning', 'Images', 'Images sans attribut alt', 'Pages contenant des images sans texte alternatif.', 'Ajoutez un alt descriptif (accessibilité + Google Images). alt="" seulement pour les images décoratives.', u(html200.filter((p) => p.imagesMissingAlt > 0), (p) => `${p.imagesMissingAlt}/${p.imagesCount} image(s)`));
  add('img-broken', 'error', 'Images', 'Images cassées', 'Images renvoyant une erreur.', 'Corrigez le chemin ou remplacez l’image.', imgs.filter((i) => i.status !== null && (i.status === 0 || i.status >= 400)).map((i) => ({ url: [...i.pages][0], detail: `${i.src} (${i.status})` })));
  add('img-large', 'warning', 'Images', `Images lourdes (> ${Math.round(T.largeImageBytes / 1024)} Ko)`, 'Images qui ralentissent le chargement (LCP).', 'Compressez, convertissez en WebP/AVIF et redimensionnez.', imgs.filter((i) => i.size > T.largeImageBytes).map((i) => ({ url: i.src, detail: `${Math.round(i.size / 1024)} Ko · ${i.pages.size} page(s)` })));

  // Indexabilité & directives
  add('noindex', 'notice', 'Directives', 'Pages en noindex', 'Ces pages ne seront pas indexées.', 'Vérifiez que c’est volontaire.', u(html200.filter((p) => has(p, 'noindex|none')), (p) => p.metaRobots || p.xRobotsTag));
  add('nofollow-page', 'notice', 'Directives', 'Pages en nofollow (meta robots)', 'Les liens de ces pages ne sont pas suivis.', 'Retirez nofollow sauf cas particulier.', u(html200.filter((p) => has(p, 'nofollow|none'))));
  add('blocked-robots', 'notice', 'Directives', 'URLs bloquées par robots.txt', 'Le crawler n’a pas pu explorer ces URLs.', 'Vérifiez que le blocage est volontaire (et qu’aucune page importante n’est bloquée).', u(pages.filter((p) => p.blockedByRobots)));
  add('nofollow-internal', 'notice', 'Liens', 'Liens internes en nofollow', 'Liens internes portant rel="nofollow".', 'Évitez le nofollow sur les liens internes : il gaspille le PageRank interne.', nofollowInternal.map((l) => ({ url: l.from, detail: `→ ${l.to}` })));

  // Canonicals
  add('canonical-missing', 'notice', 'Canonicals', 'Canonical absente', 'Pas de balise rel="canonical".', 'Ajoutez une canonical auto-référente sur chaque page indexable.', u(html200.filter((p) => !p.canonical)));
  add('canonicalised', 'notice', 'Canonicals', 'Pages canonicalisées vers une autre URL', 'La canonical pointe vers une autre URL.', 'Vérifiez que la page cible est la bonne et qu’elle est indexable.', u(html200.filter((p) => p.canonical && p.canonical !== p.url), (p) => `→ ${p.canonical}`));
  add('canonical-non200', 'error', 'Canonicals', 'Canonical vers une URL non indexable', 'La canonical pointe vers une URL en erreur, redirigée ou non indexable.', 'Faites pointer la canonical vers l’URL finale en 200 et indexable.', u(html200.filter((p) => {
    if (!p.canonical || p.canonical === p.url) return false;
    const t = byUrl.get(crawler.normalize(p.canonical));
    return t && (t.status !== 200 || !t.indexable);
  }), (p) => { const t = byUrl.get(crawler.normalize(p.canonical)); return `→ ${p.canonical} (${t.status || '—'} ${t.indexabilityReason})`; }));
  add('canonical-multiple', 'warning', 'Canonicals', 'Plusieurs canonicals', 'Plusieurs balises canonical : Google peut toutes les ignorer.', 'Ne gardez qu’une seule canonical.', u(html200.filter((p) => p.canonicalCount > 1)));

  // Sitemap
  const hasSitemap = crawler.sitemapUrls.size > 0;
  add('no-sitemap', 'warning', 'Sitemap', 'Aucun sitemap XML trouvé', 'Ni /sitemap.xml ni sitemap déclaré dans robots.txt.', 'Générez un sitemap XML et déclarez-le dans robots.txt et la Search Console.', hasSitemap || !crawler.opts.useSitemaps ? [] : [{ url: crawler.origin + '/sitemap.xml', detail: 'introuvable' }]);
  add('orphan', 'warning', 'Sitemap', 'Pages orphelines (dans le sitemap, sans lien interne)', 'Présentes dans le sitemap mais aucune page du site ne les lie.', 'Ajoutez des liens internes depuis des pages thématiquement proches (cocon sémantique).', u(pages.filter((p) => p.inSitemap && p.uniqueInlinks === 0 && p.url !== start && p.url !== crawler.finalStart)));
  add('sitemap-non-indexable', 'warning', 'Sitemap', 'URLs non indexables dans le sitemap', 'Le sitemap doit contenir uniquement des URLs 200 indexables.', 'Retirez du sitemap les redirections, erreurs, noindex et pages canonicalisées.', u(pages.filter((p) => p.inSitemap && !p.indexable), (p) => p.indexabilityReason));
  add('not-in-sitemap', 'notice', 'Sitemap', 'Pages indexables absentes du sitemap', 'Pages indexables découvertes par les liens mais absentes du sitemap.', 'Ajoutez-les au sitemap si elles sont importantes.', hasSitemap ? u(indexableHtml.filter((p) => !p.inSitemap)) : []);

  // Architecture
  add('deep', 'notice', 'Architecture', `Pages profondes (≥ ${T.deepLevel} clics depuis l’accueil)`, 'Pages difficiles d’accès pour les robots et les visiteurs.', 'Rapprochez-les de l’accueil (menus, catégories, liens contextuels).', u(indexableHtml.filter((p) => p.depth !== null && p.depth >= T.deepLevel), (p) => `profondeur ${p.depth}`));
  add('one-inlink', 'notice', 'Architecture', 'Pages avec un seul lien entrant', 'Peu de PageRank interne.', 'Ajoutez des liens internes contextuels.', u(indexableHtml.filter((p) => p.uniqueInlinks === 1)));
  add('unreachable', 'notice', 'Architecture', 'Pages non atteignables par les liens', 'Pages trouvées uniquement via le sitemap.', 'Liez-les depuis le site.', u(indexableHtml.filter((p) => p.depth === null)));

  // Performance
  add('slow', 'warning', 'Performance', `Temps de réponse lent (> ${T.slowMs} ms)`, 'Le serveur met du temps à répondre (TTFB).', 'Activez un cache (page cache, CDN), optimisez la base de données / l’hébergement.', u(html200.filter((p) => p.responseTime > T.slowMs), (p) => `${p.responseTime} ms`));
  add('large-html', 'notice', 'Performance', `HTML lourd (> ${Math.round(T.largeHtmlBytes / 1024)} Ko)`, 'Document HTML volumineux.', 'Réduisez le DOM, les scripts inline et le contenu caché.', u(html200.filter((p) => p.size > T.largeHtmlBytes), (p) => `${Math.round(p.size / 1024)} Ko`));

  // URLs
  add('url-uppercase', 'notice', 'URL', 'URLs avec majuscules', 'Risque de doublons (les URLs sont sensibles à la casse).', 'Utilisez des URLs en minuscules.', u(internalOnly.filter((p) => /[A-Z]/.test(new URL(p.url).pathname))));
  add('url-underscore', 'notice', 'URL', 'URLs avec underscores', 'Google recommande les tirets.', 'Préférez les tirets (-) aux underscores (_).', u(internalOnly.filter((p) => new URL(p.url).pathname.includes('_'))));
  add('url-params', 'notice', 'URL', 'URLs avec paramètres', 'Les paramètres peuvent créer du contenu dupliqué.', 'Canonicalisez ou évitez de lier des URLs paramétrées.', u(internalOnly.filter((p) => new URL(p.url).search)));
  add('url-long', 'notice', 'URL', `URLs trop longues (> ${T.urlMaxLength} car.)`, 'URLs difficiles à lire et à partager.', 'Raccourcissez les slugs.', u(internalOnly.filter((p) => p.urlLength > T.urlMaxLength), (p) => `${p.urlLength} car.`));
  add('url-non-ascii', 'notice', 'URL', 'URLs avec caractères spéciaux / accents', 'Caractères encodés dans l’URL.', 'Utilisez des slugs sans accents.', u(internalOnly.filter((p) => /%[0-9A-F]{2}/i.test(new URL(p.url).pathname))));

  // Balisage
  add('lang-missing', 'notice', 'Balisage', 'Attribut lang manquant', '<html> sans attribut lang.', 'Ajoutez <html lang="fr"> (ou la langue de la page).', u(html200.filter((p) => !p.lang)));
  add('viewport-missing', 'warning', 'Balisage', 'Meta viewport manquante', 'La page n’est pas configurée pour le mobile.', 'Ajoutez <meta name="viewport" content="width=device-width, initial-scale=1">.', u(html200.filter((p) => !p.viewport)));
  add('og-missing', 'notice', 'Balisage', 'Balises Open Graph manquantes', 'og:title / og:image absents : partages sociaux peu attractifs.', 'Ajoutez og:title, og:description et og:image.', u(indexableHtml.filter((p) => !p.og?.title || !p.og?.image)));
  add('schema-missing', 'notice', 'Données structurées', 'Pas de données structurées', 'Aucun JSON-LD ni microdata.', 'Ajoutez Organization, Article, FAQPage, Course, Product… selon la page.', u(indexableHtml.filter((p) => !p.schemaTypes?.length)));
  add('schema-invalid', 'warning', 'Données structurées', 'JSON-LD invalide', 'Bloc JSON-LD impossible à parser.', 'Corrigez la syntaxe JSON (testez dans le Rich Results Test).', u(html200.filter((p) => p.schemaErrors > 0), (p) => `${p.schemaErrors} bloc(s)`));
  add('hreflang-return', 'warning', 'Hreflang', 'Hreflang sans lien retour', 'La page cible ne renvoie pas vers cette page.', 'Chaque version linguistique doit référencer toutes les autres (et elle-même).', hreflangMissingReturn);

  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);

  // Score de santé : pénalité par page HTML selon le niveau de gravité le plus élevé.
  const worst = new Map();
  for (const is of issues) {
    for (const it of is.items) {
      const prev = worst.get(it.url);
      if (prev === undefined || SEV_ORDER[is.severity] < prev) worst.set(it.url, SEV_ORDER[is.severity]);
    }
  }
  const scored = pages.filter((p) => p.isHtml || p.status >= 300 || !p.status);
  let penalty = 0;
  for (const p of scored) {
    const w = worst.get(p.url);
    penalty += w === 0 ? 1 : w === 1 ? 0.35 : 0;
  }
  const score = scored.length ? Math.max(0, Math.round(100 * (1 - penalty / scored.length))) : 0;

  const statusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'Bloqué': 0, 'Sans réponse': 0 };
  for (const p of pages) {
    if (p.blockedByRobots) statusBuckets['Bloqué']++;
    else if (!p.status) statusBuckets['Sans réponse']++;
    else statusBuckets[`${String(p.status)[0]}xx`]++;
  }
  const depthBuckets = {};
  for (const p of pages) {
    const k = p.depth === null ? 'n/a' : p.depth >= 10 ? '10+' : String(p.depth);
    depthBuckets[k] = (depthBuckets[k] || 0) + 1;
  }
  const rt = html200.map((p) => p.responseTime).filter((x) => x != null).sort((a, b) => a - b);

  // Sérialisation compacte des liens
  const urlIndex = new Map();
  const urls = [];
  const idx = (x) => {
    if (!urlIndex.has(x)) {
      urlIndex.set(x, urls.length);
      urls.push(x);
    }
    return urlIndex.get(x);
  };
  const edges = crawler.links.map((l) => [idx(l.from), idx(l.to), l.anchor, (l.nofollow ? 1 : 0) | (l.internal ? 2 : 0)]);

  return {
    version: 1,
    meta: {
      startUrl: crawler.startUrl,
      finalStart: crawler.finalStart,
      origin: crawler.origin,
      startedAt: crawler.startedAt,
      finishedAt: crawler.finishedAt,
      stopped: crawler.stopped,
      options: crawler.opts,
      robotsTxt: crawler.robotsTxt,
      sitemapFiles: crawler.sitemapFiles,
      sitemapUrlCount: crawler.sitemapUrls.size,
      thresholds: T,
    },
    summary: {
      score,
      totalUrls: pages.length,
      htmlPages: html200.length,
      indexable: indexableHtml.length,
      nonIndexable: pages.length - pages.filter((p) => p.indexable).length,
      avgResponseTime: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0,
      medianResponseTime: rt.length ? rt[Math.floor(rt.length / 2)] : 0,
      avgWords: html200.length ? Math.round(html200.reduce((a, p) => a + p.wordCount, 0) / html200.length) : 0,
      internalLinks: crawler.links.filter((l) => l.internal).length,
      externalLinks: crawler.links.filter((l) => !l.internal).length,
      uniqueExternal: crawler.externals.size,
      images: crawler.images.size,
      errors: issues.filter((i) => i.severity === 'error').reduce((a, i) => a + i.count, 0),
      warnings: issues.filter((i) => i.severity === 'warning').reduce((a, i) => a + i.count, 0),
      notices: issues.filter((i) => i.severity === 'notice').reduce((a, i) => a + i.count, 0),
      statusBuckets,
      depthBuckets,
    },
    issues,
    pages,
    redirects,
    brokenLinks,
    images: imgs.map((i) => ({ src: i.src, alt: [...i.alts].join(' | '), missingAlt: i.missingAlt, pages: i.pages.size, firstPage: [...i.pages][0], status: i.status, size: i.size })),
    externals: [...crawler.externals.values()].map((e) => ({ url: e.url, status: e.status, statusText: e.statusText || '', inlinks: e.inlinks, pages: e.pages.size, firstPage: [...e.pages][0] })),
    links: { urls, edges },
  };
}
