// Score de santé et piliers du tableau de bord. Partagé par le moteur (src/analyze.mjs) et l'interface, pour que
// le calcul soit identique partout et s'applique aussi aux crawls déjà enregistrés.
//
// Méthode (la même pour le score global et pour chaque pilier) : chaque problème retire des points selon sa gravité,
// son impact et la part des pages concernées, plafonnés par problème ; les pertes se combinent de façon
// multiplicative. Un pilier ne prend en compte que les contrôles de ses catégories.

export const SCORE_CAP = { error: 30, warning: 12, notice: 0 };
export const PAGE_W = { error: 1, warning: 0.35, notice: 0 };
export const IMPACT_F = { high: 1, medium: 0.7, low: 0.4 };

// Points retirés par un problème : `share` = part des pages touchées (1 pour un problème de site).
export const issuePoints = (is, share) => Math.min(SCORE_CAP[is.severity] * IMPACT_F[is.impact], 100 * PAGE_W[is.severity] * IMPACT_F[is.impact] * share);

// Pages prises en compte dans le score : HTML, redirections et URL sans réponse.
export const scoredPages = (pages) => pages.filter((p) => p.isHtml || p.status >= 300 || !p.status);

// Problèmes dont les URL sont hors du crawl (pages orphelines vues par Search Console ou GA4) : ce sont bien des
// pages, comptées comme telles dans la part des pages touchées.
export const OUTSIDE_CRAWL = new Set(['gsc-orphan', 'ga4-orphan']);

export function issueShare(is, scoredSet, N) {
  if (is.scope === 'site') return 1;
  const outside = OUTSIDE_CRAWL.has(is.id);
  return Math.min(1, new Set(is.items.map((it) => it.url).filter((u) => outside || scoredSet.has(u))).size / N);
}

// Les quatre piliers et les catégories de contrôles qui les composent.
export const PILLARS = [
  { id: 'technical', color: 'cyan', categories: ['codes', 'redirects', 'security', 'directives', 'canonicals', 'sitemap', 'url', 'hreflang', 'javascript', 'markup', 'ai'] },
  { id: 'content', color: 'violet', categories: ['titles', 'meta', 'headings', 'content', 'images', 'schema'] },
  { id: 'linking', color: 'lime', categories: ['links', 'architecture'] },
  { id: 'performance', color: 'coral', categories: ['performance'] },
];

// Statut textuel d'un score (les couleurs des anneaux identifient le pilier, pas son état).
export const pillarStatus = (score) => (score == null ? 'unmeasured' : score >= 95 ? 'excellent' : score >= 85 ? 'solid' : score >= 70 ? 'fair' : score >= 50 ? 'weak' : 'critical');

// Score de chaque pilier : { id, score|null, status, scope, issues } ; null = « Non mesuré ».
export function computePillars(R) {
  const scored = scoredPages(R.pages || []);
  const N = Math.max(1, scored.length);
  const scoredSet = new Set(scored.map((p) => p.url));
  const pageSet = new Set((R.pages || []).map((p) => p.url));
  const htmlCount = (R.pages || []).filter((p) => p.isHtml && p.status === 200).length;
  return PILLARS.map((pl) => {
    const issues = R.issues.filter((is) => pl.categories.includes(is.category));
    let measured = htmlCount > 0;
    let scope = null;
    // Maillage : sans exploration par les liens (mode liste), le graphe de liens ne veut rien dire.
    if (pl.id === 'linking' && R.meta.mode === 'list') measured = false;
    // Performance : le temps de réponse du serveur seul ne décrit pas l'expérience ; on le dit.
    if (pl.id === 'performance') {
      const hasTimes = (R.pages || []).some((p) => p.responseTime != null);
      measured = measured && hasTimes;
      scope = R.meta.psi ? 'cwv' : R.meta.rendered ? 'lab' : 'server';
    }
    if (!measured) return { id: pl.id, color: pl.color, score: null, status: 'unmeasured', scope, issues };
    let keep = 1;
    for (const is of issues) {
      if (is.severity === 'notice') continue;
      const scope2 = is.scope || (OUTSIDE_CRAWL.has(is.id) || is.items.some((it) => pageSet.has(it.url)) ? 'page' : 'site');
      keep *= 1 - issuePoints(is, issueShare({ ...is, scope: scope2 }, scoredSet, N)) / 100;
    }
    const score = Math.max(0, Math.round(100 * keep));
    return { id: pl.id, color: pl.color, score, status: pillarStatus(score), scope, issues };
  });
}
