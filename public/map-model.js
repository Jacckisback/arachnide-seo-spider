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
  const maxDepth = pages.reduce((m, p) => Math.max(m, p.depth ?? 0), 0);
  const folders = foldersOf(pages);
  return { R, home, pages, byUrl, issues, out, inl, linkCount, resources, maxDepth, folders, dirOf: (u) => topDir(u, folders), worst: (u) => issues.get(u)?.[0]?.severity || null };
}

// Premier segment du chemin (« /agenda/ ») : sert au regroupement et à la couleur par répertoire.
// Une URL sans barre finale (« /en ») appartient au dossier « /en/ » quand d'autres pages vivent sous ce dossier :
// c'est la racine de la section, pas une page isolée à la racine du site. `folders` = dossiers observés dans le crawl.
export function topDir(url, folders) {
  try {
    const path = new URL(url).pathname;
    const seg = path.split('/').filter(Boolean);
    if (!seg.length) return '/';
    if (seg.length > 1 || path.endsWith('/')) return '/' + seg[0] + '/';
    return folders?.has('/' + seg[0] + '/') ? '/' + seg[0] + '/' : '/';
  } catch {
    return '/';
  }
}

// Dossiers réellement observés (au moins une page dont l'URL passe par ce dossier), chemin complet : « /en/blog/ ».
export function foldersOf(pages) {
  const out = new Set();
  for (const p of pages) {
    let path;
    try {
      path = new URL(p.url).pathname;
    } catch {
      continue;
    }
    const seg = path.split('/').filter(Boolean);
    const n = path.endsWith('/') ? seg.length : seg.length - 1;
    let cur = '/';
    for (let i = 0; i < n; i++) out.add((cur += seg[i] + '/'));
  }
  return out;
}

// Une page appartient à un dossier si son chemin commence par celui-ci, ou si elle en est la racine sans barre finale
// (« /en » pour « /en/ »). Le dossier « / » contient tout.
export function inFolder(url, folder) {
  if (!folder || folder === '/') return true;
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return path.startsWith(folder) || path + '/' === folder;
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

// Arbre des répertoires : un dossier virtuel par segment. Une page dont l'URL est le dossier lui-même (« /blog/ »)
// ou sa racine sans barre finale (« /blog ») est portée par le dossier au lieu de créer un doublon : la carte n'affiche
// jamais une URL qui n'a pas été crawlée. Un dossier sans page à son adresse est libellé « /blog/* » (regroupement).
export function dirTree(M) {
  const rootId = 'dir:/';
  const tree = makeTree(rootId);
  const homePage = M.byUrl.get(M.home);
  tree.nodes.set(rootId, { id: rootId, kind: 'folder', label: hostOf(M.home), path: '/', page: homePage, url: homePage?.url });
  const origin = safeOrigin(M.home);
  const items = [];
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
    const pre = u.origin !== origin ? u.origin : '';
    if (pre) {
      parent = 'dir:' + u.origin;
      if (!tree.nodes.has(parent)) {
        tree.nodes.set(parent, { id: parent, kind: 'folder', label: u.host, path: u.origin + '/', other: true });
        attach(tree, parent, rootId);
      }
    }
    let path = pre + '/';
    for (const s of isDir ? segs : segs.slice(0, -1)) {
      path += s + '/';
      const id = 'dir:' + path;
      if (!tree.nodes.has(id)) {
        tree.nodes.set(id, { id, kind: 'folder', path });
        attach(tree, id, parent);
      }
      parent = id;
    }
    items.push({ p, u, isDir, parent, self: !isDir && segs.length ? 'dir:' + path + segs[segs.length - 1] + '/' : null });
  }
  // 1) L'URL exacte du dossier (« /blog/ ») porte le dossier ; 2) à défaut, sa variante sans barre (« /blog »).
  const place = [];
  for (const it of items) {
    const f = tree.nodes.get(it.parent);
    if (it.isDir && !it.u.search && f.kind === 'folder' && !f.page && !f.other) Object.assign(f, { page: it.p, url: it.p.url });
    else place.push(it);
  }
  for (const it of place) {
    const f = it.self && !it.u.search ? tree.nodes.get(it.self) : null;
    if (f && !f.page) {
      Object.assign(f, { page: it.p, url: it.p.url, noSlash: true });
      continue;
    }
    tree.nodes.set(it.p.url, { id: it.p.url, kind: 'page', url: it.p.url, page: it.p });
    attach(tree, it.p.url, it.parent);
  }
  for (const n of tree.nodes.values()) {
    if (n.kind !== 'folder' || n.id === rootId || n.other) continue;
    const path = n.path.replace(/^https?:\/\/[^/]+/, '');
    n.label = n.page ? safePath(n.page.url) : decodeSafe(path) + '*';
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
function safePath(u) {
  try {
    const x = new URL(u);
    return decodeSafe(x.pathname + x.search);
  } catch {
    return u;
  }
}
function decodeSafe(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}
function safeOrigin(u) {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}
