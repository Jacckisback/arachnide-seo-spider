// Ce que le navigateur reçoit d'un crawl : un résultat léger, en flux, sans les liens ; le graphe reste sur le serveur
// et répond à la demande (liens d'une page, sous-graphe de la carte, fiche complète d'une page, comparaison).
// Chantier « 200 000 pages », étape 5 : le navigateur ne reçoit plus jamais le crawl entier d'un bloc.
import { csr, uniqueCounts, FLAG, POS } from './graph.mjs';
import { fromTuples, resultRecords, ITEM_KEYS } from '../public/shared/ndjson.js';
import { linkStatsBySegment, NONE } from '../public/shared/segments.js';
import { isPageNode } from '../public/viz.js';
import { compareResults } from '../public/shared/compare.js';

// Champs d'une page que seule la fiche de détail lit : retirés du résultat léger, servis par GET /api/page.
const DETAIL_ONLY = new Set(['og', 'viewport', 'imagesMissingAltSrc', 'closestMatch', 'lastModified', 'crawledAt', 'headingSkips', 'hreflangInvalid']);
const JS_LIGHT = ['rendered', 'loadTime', 'lcp', 'cls', 'requests', 'rawWordCount', 'rawTitle', 'rawCanonical', 'jsOnlyLinks', 'rawLinkCount'];

export function lightPage(p) {
  const out = {};
  for (const k in p) if (!DETAIL_ONLY.has(k)) out[k] = p[k];
  if (p.js) {
    const js = {};
    for (const k of JS_LIGHT) if (p.js[k] !== undefined) js[k] = p.js[k];
    js.jsErrors = p.js.consoleErrors?.length || 0;
    out.js = js;
  }
  if (p.headingSkips?.length) out.headingSkipCount = p.headingSkips.length;
  if (p.hreflangInvalid?.length) out.hreflangInvalidCount = p.hreflangInvalid.length;
  return out;
}

// Compteurs de liens par segment, en nombres (le navigateur ne peut plus les compter : il n'a pas les liens).
export function linkStatsOf(R) {
  const out = {};
  for (const [id, s] of linkStatsBySegment(R, R.meta?.segments || [])) out[id] = { internalLinks: s.internalLinks, externalLinks: s.externalLinks, uniqueExternal: s.ext.size };
  return out;
}

// Enregistrements NDJSON du résultat léger : même format que le fichier (public/shared/ndjson.js), pages allégées,
// pas de liens, compteurs de liens par segment dans l'en-tête.
export function* lightRecords(R) {
  const { links, pages, sitemapUrls, ...rest } = R; // sitemapUrls : référence du prochain crawl de changements, inutile au navigateur
  const head = { t: 'head', version: 3, app_version: R.version, meta: R.meta, summary: R.summary, light: true, linkStats: linkStatsOf(R) };
  let first = true;
  for (const rec of resultRecords({ ...rest, pages: [] })) {
    if (rec.t === 'head') {
      yield head;
      first = false;
      continue;
    }
    yield rec;
  }
  if (first) yield head;
  for (const p of pages || []) yield { t: 'page', ...lightPage(p) };
}

// ---- Graphe du crawl ouvert, construit une fois par résultat ----
const cache = new WeakMap();
export function graphOf(R) {
  let g = cache.get(R);
  if (g) return g;
  const L = !R.links ? { urls: [], anchors: [], from: new Int32Array(0), to: new Int32Array(0), anchor: new Int32Array(0), flags: new Uint8Array(0), pos: new Uint8Array(0) } : R.links.edges ? fromTuples(R.links) : R.links;
  const n = L.urls.length;
  const m = L.from.length;
  const edgeIds = new Int32Array(m);
  for (let i = 0; i < m; i++) edgeIds[i] = i;
  const index = new Map(L.urls.map((u, i) => [u, i]));
  const byUrl = new Map((R.pages || []).map((p) => [p.url, p]));
  const pageNode = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = byUrl.get(L.urls[i]);
    if (p && isPageNode(p)) pageNode[i] = 1;
  }
  // Voisins = indices de liens (pour lire ancre, position, drapeaux), dans les deux sens.
  const out = csr(n, [{ src: L.from, dst: edgeIds, m }]);
  const inl = csr(n, [{ src: L.to, dst: edgeIds, m }]);
  // Règles de la carte : lien interne suivi, pas vers soi-même, entre pages du corpus ; une paire orientée = une relation.
  const mapKeep = (i) => L.flags[i] & FLAG.internal && !(L.flags[i] & FLAG.nofollow) && L.from[i] !== L.to[i] && pageNode[L.from[i]] && pageNode[L.to[i]];
  const mapOut = csr(n, [{ src: L.from, dst: L.to, m, keep: mapKeep }], { dedupe: true });
  const mapIn = csr(n, [{ src: L.to, dst: L.from, m, keep: mapKeep }], { dedupe: true });
  g = { L, n, m, index, byUrl, pageNode, out, inl, mapOut, mapIn, mapInCounts: uniqueCounts(n, mapIn), mapLinkCount: mapOut.adj.length };
  cache.set(R, g);
  return g;
}

// Liens d'une page, paginés : dir = out (liens sortants) | in (liens entrants). map = règles de la carte (voisins
// distincts, liens suivis entre pages), sans ancre ni position.
export function pageLinks(R, url, { dir = 'out', offset = 0, limit = 200, map = false } = {}) {
  const g = graphOf(R);
  const u = g.index.get(url);
  if (u === undefined) return { url, dir, total: 0, offset, items: [] };
  const G = map ? (dir === 'in' ? g.mapIn : g.mapOut) : dir === 'in' ? g.inl : g.out;
  const a = G.off[u];
  const b = G.off[u + 1];
  const total = b - a;
  const items = [];
  for (let j = a + offset; j < Math.min(b, a + offset + limit); j++) {
    if (map) {
      const v = G.adj[j];
      const p = g.byUrl.get(g.L.urls[v]);
      items.push({ url: g.L.urls[v], linkScore: p?.linkScore ?? null, status: p?.status ?? null });
      continue;
    }
    const e = G.adj[j];
    const other = g.L.urls[dir === 'in' ? g.L.from[e] : g.L.to[e]];
    const f = g.L.flags[e];
    const target = g.byUrl.get(dir === 'in' ? url : other);
    items.push({ [dir === 'in' ? 'from' : 'to']: other, anchor: g.L.anchors[g.L.anchor[e]] || '', pos: POS[g.L.pos[e]], internal: !!(f & FLAG.internal), nofollow: !!(f & FLAG.nofollow), image: !!(f & FLAG.image), status: target?.status ?? null });
  }
  return { url, dir, total, offset, has_more: offset + items.length < total, items };
}

// Compteurs de la carte pour toutes les pages (liens entrants distincts, règles de la carte) : petit, envoyé une fois.
export function mapCounts(R) {
  const g = graphOf(R);
  const inl = {};
  for (let i = 0; i < g.n; i++) if (g.pageNode[i] && g.mapInCounts[i]) inl[g.L.urls[i]] = g.mapInCounts[i];
  return { inl, linkCount: g.mapLinkCount };
}

// Arêtes de la carte entre les nœuds affichés (au plus quelques milliers) : [indice source, indice cible] dans `urls`.
export function mapEdges(R, urls) {
  const g = graphOf(R);
  const pos = new Map();
  urls.forEach((u, k) => {
    const i = g.index.get(u);
    if (i !== undefined) pos.set(i, k);
  });
  const edges = [];
  for (const [i, k] of pos) for (let j = g.mapOut.off[i]; j < g.mapOut.off[i + 1]; j++) {
    const to = pos.get(g.mapOut.adj[j]);
    if (to !== undefined) edges.push([k, to]);
  }
  return edges;
}

export function compareTo(R, prev) {
  return compareResults(R, prev);
}

export { ITEM_KEYS, NONE };
