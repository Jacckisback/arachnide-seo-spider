// Cartographie : modèle de données, indépendant du rendu et du placement.
// Trois structures réellement différentes, construites à partir du crawl sans rien inventer :
//   crawl → arbre du plus court chemin depuis l'accueil (parent enregistré par le moteur : `pathParent`) ;
//   dir   → arborescence des chemins d'URL, avec des dossiers virtuels qui ne comptent pas comme des pages ;
//   links → graphe orienté des liens internes suivis observés (cycles conservés, jamais transformé en arbre).
import { isPageNode } from './viz.js';

const SEV_ORDER = { error: 0, warning: 1, notice: 2 };
export const worse = (a, b) => (!a ? b : !b ? a : SEV_ORDER[a] <= SEV_ORDER[b] ? a : b);

export function buildModel(R, graph) {
  const home = R.meta.finalStart || R.meta.startUrl;
  const pages = R.pages.filter(isPageNode);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const issues = new Map();
  for (const is of R.issues) {
    for (const it of is.items) {
      if (!byUrl.has(it.url)) continue;
      if (!issues.has(it.url)) issues.set(it.url, []);
      const list = issues.get(it.url);
      if (!list.some((x) => x.id === is.id)) list.push({ id: is.id, severity: is.severity, params: is.params, impact: is.impact, effort: is.effort });
    }
  }
  for (const list of issues.values()) list.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  // Liens internes suivis entre pages du corpus, dédoublonnés (une paire orientée = une relation).
  const out = new Map();
  const inl = new Map();
  let linkCount = 0;
  for (const [from, edges] of graph.out) {
    if (!byUrl.has(from)) continue;
    for (const e of edges) {
      if (!e.internal || e.nofollow || e.to === from || !byUrl.has(e.to)) continue;
      if (!out.has(from)) out.set(from, new Set());
      if (out.get(from).has(e.to)) continue;
      out.get(from).add(e.to);
      if (!inl.has(e.to)) inl.set(e.to, new Set());
      inl.get(e.to).add(from);
      linkCount++;
    }
  }
  const resources = R.pages.filter((p) => p.url.startsWith('http') && !isPageNode(p)).length;
  const maxDepth = Math.max(0, ...pages.map((p) => p.depth ?? 0));
  return { R, home, pages, byUrl, issues, out, inl, linkCount, resources, maxDepth, worst: (u) => issues.get(u)?.[0]?.severity || null };
}

// Premier segment du chemin (« /agenda/ ») : sert au regroupement et à la couleur par répertoire.
export function topDir(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean);
    return seg.length > 1 || new URL(url).pathname.endsWith('/') ? (seg[0] ? '/' + seg[0] + '/' : '/') : '/';
  } catch {
    return '/';
  }
}

// Structure d'arbre commune : nœuds { id, kind: page | folder | unreached, url?, page? }, parent et enfants.
function makeTree(rootId) {
  return { root: rootId, nodes: new Map(), parent: new Map(), children: new Map() };
}
function attach(tree, id, parentId) {
  tree.parent.set(id, parentId);
  if (!tree.children.has(parentId)) tree.children.set(parentId, []);
  tree.children.get(parentId).push(id);
}

// Arbre de crawl : parent sur le plus court chemin (enregistré par le moteur depuis la 3.9). Pour un crawl plus
// ancien, on reprend la règle précédente : une page qui la lie au niveau de profondeur juste au-dessus.
export function crawlTree(M) {
  const tree = makeTree(M.home);
  const sorted = [...M.pages].sort((a, b) => (a.depth ?? 1e9) - (b.depth ?? 1e9) || a.url.localeCompare(b.url));
  let inferred = false;
  for (const p of sorted) tree.nodes.set(p.url, { id: p.url, kind: 'page', url: p.url, page: p });
  if (!tree.nodes.has(M.home)) tree.nodes.set(M.home, { id: M.home, kind: 'folder', label: hostOf(M.home) });
  const UNREACHED = 'v:unreached';
  for (const p of sorted) {
    if (p.url === M.home) continue;
    let parent = p.pathParent && M.byUrl.has(p.pathParent) && p.pathParent !== p.url ? p.pathParent : null;
    if (!parent && p.depth != null && p.depth > 0) {
      const cands = [...(M.inl.get(p.url) || [])].map((u) => M.byUrl.get(u)).filter((x) => x.depth === p.depth - 1);
      parent = cands.sort((a, b) => (b.linkScore || 0) - (a.linkScore || 0) || a.url.localeCompare(b.url))[0]?.url || null;
      if (parent) inferred = true;
    }
    if (!parent && p.depth === 0) parent = M.home; // accueil après redirection, autre racine en mode liste
    if (!parent) {
      // Non atteinte par un lien suivi depuis l'accueil (sitemap, canonical, hreflang, mode liste…) : groupe virtuel.
      if (!tree.nodes.has(UNREACHED)) {
        tree.nodes.set(UNREACHED, { id: UNREACHED, kind: 'unreached' });
        attach(tree, UNREACHED, M.home);
      }
      parent = UNREACHED;
    }
    attach(tree, p.url, parent);
  }
  return { ...tree, inferred };
}

// Arbre des répertoires : un dossier virtuel par segment ; une page dont l'URL est le dossier lui-même
// (« /blog/ ») est rattachée au dossier au lieu de créer un doublon.
export function dirTree(M) {
  const rootId = 'dir:/';
  const tree = makeTree(rootId);
  const homePage = M.byUrl.get(M.home);
  tree.nodes.set(rootId, { id: rootId, kind: 'folder', label: hostOf(M.home), path: '/', page: homePage, url: homePage?.url });
  const origin = safeOrigin(M.home);
  for (const p of [...M.pages].sort((a, b) => a.url.localeCompare(b.url))) {
    if (p === homePage) continue;
    let u;
    try {
      u = new URL(p.url);
    } catch {
      continue;
    }
    const segs = u.pathname.split('/').filter(Boolean);
    const isDir = u.pathname.endsWith('/');
    let parent = rootId;
    if (u.origin !== origin) {
      parent = 'dir:' + u.origin;
      if (!tree.nodes.has(parent)) {
        tree.nodes.set(parent, { id: parent, kind: 'folder', label: u.host, path: u.origin });
        attach(tree, parent, rootId);
      }
    }
    const dirSegs = isDir ? segs : segs.slice(0, -1);
    let path = (u.origin !== origin ? u.origin : '') + '/';
    for (const s of dirSegs) {
      path += s + '/';
      const id = 'dir:' + path;
      if (!tree.nodes.has(id)) {
        tree.nodes.set(id, { id, kind: 'folder', label: path, path });
        attach(tree, id, parent);
      }
      parent = id;
    }
    // L'URL du dossier est une vraie page : on la porte par le dossier (sans query, sinon c'est une page enfant).
    if (isDir && !u.search && tree.nodes.get(parent).kind === 'folder' && !tree.nodes.get(parent).page) {
      Object.assign(tree.nodes.get(parent), { page: p, url: p.url });
      continue;
    }
    tree.nodes.set(p.url, { id: p.url, kind: 'page', url: p.url, page: p });
    attach(tree, p.url, parent);
  }
  return tree;
}

// Pages réellement contenues dans chaque sous-arbre (les dossiers virtuels ne comptent pas) et gravité la plus haute.
export function subtreeStats(tree, M) {
  const pages = new Map();
  const sev = new Map();
  const order = [];
  const stack = [tree.root];
  while (stack.length) {
    const id = stack.pop();
    order.push(id);
    for (const c of tree.children.get(id) || []) stack.push(c);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const n = tree.nodes.get(id);
    let count = n?.page ? 1 : 0;
    let s = n?.url ? M.worst(n.url) : null;
    for (const c of tree.children.get(id) || []) {
      count += pages.get(c);
      s = worse(s, sev.get(c));
    }
    pages.set(id, count);
    sev.set(id, s);
  }
  return { pages, sev, order };
}

// Chemin depuis la racine, en suivant les parents de l'arbre : [{ id, url, viaRedirect }].
export function pathTo(tree, id) {
  const out = [];
  const seen = new Set();
  for (let cur = id; cur != null && !seen.has(cur); cur = tree.parent.get(cur)) {
    seen.add(cur);
    const n = tree.nodes.get(cur);
    out.unshift({ id: cur, url: n?.url, viaRedirect: !!n?.page?.pathViaRedirect, kind: n?.kind });
  }
  return out;
}

// Clics du chemin : chaque arête compte, sauf une redirection (elle n'est pas un clic).
export const pathClicks = (path) => path.slice(1).filter((s) => s.kind === 'page' && !s.viaRedirect).length;

export function descendants(tree, id) {
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) for (const c of tree.children.get(stack.pop()) || []) if (!out.has(c)) (out.add(c), stack.push(c));
  return out;
}

export function neighbors(M, url) {
  return { in: M.inl.get(url) || new Set(), out: M.out.get(url) || new Set() };
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}
function safeOrigin(u) {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}
