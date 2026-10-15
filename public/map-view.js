// Cartographie : scène visible, filtres, recherche et gabarits (barre d'outils, légende, inspecteur).
// Les filtres et la recherche portent sur tout le corpus de pages, pas seulement sur ce qui est dessiné.
import { crawlTree, dirTree, subtreeStats, pathTo, pathClicks, descendants, topDir } from './map-model.js';
import { radialTree, visibleTree, seededPositions, cached, recall } from './map-layout.js';
import { DEPTH_COLORS, SEV_COLORS, STATUS_COLORS, INDEX_COLORS, DIR_COLORS, UNKNOWN, NO_ISSUE } from './viz.js';

export const MODES = ['crawl', 'dir', 'links'];
export const COLORS = ['depth', 'issues', 'status', 'index', 'dir'];
export const SIZES = ['linkScore', 'inlinks', 'uniform'];
export const BUDGET = { '2d': 2500, '3d': 1800 };

const pathLabel = (url) => {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname + u.search) || '/';
  } catch {
    return url;
  }
};

export function treeOf(M, mode, key) {
  return cached(`${key}|tree|${mode}`, () => {
    const tree = mode === 'crawl' ? crawlTree(M) : dirTree(M);
    return { tree, stats: subtreeStats(tree, M) };
  });
}

// Scène à dessiner. Arbres : positions fixes calculées une fois ; maillage : positions mises en cache après
// stabilisation, sinon un départ par répertoire que le moteur affine.
export function makeScene(M, o, key, t) {
  const { mode, dim } = o;
  const budget = BUDGET[dim];
  if (mode !== 'links') {
    const { tree, stats } = treeOf(M, mode, key);
    const layout = cached(`${key}|layout|${mode}|${dim}`, () => radialTree(tree, stats.pages, { dim, level: mode === 'dir' ? 60 : 72 }));
    let visible;
    let open;
    if (o.isolate) {
      visible = new Set(o.isolate);
      open = new Set([...visible].filter((id) => (tree.children.get(id) || []).some((c) => visible.has(c))));
    } else {
      ({ visible, open } = visibleTree(tree, stats.pages, { budget, expanded: o.expanded }));
    }
    const nodes = [];
    for (const id of visible) {
      const tn = tree.nodes.get(id);
      if (!tn) continue;
      const p = layout.pos.get(id) || { x: 0, y: 0, z: 0 };
      const kids = tree.children.get(id) || [];
      const collapsed = kids.length > 0 && !open.has(id);
      const hidden = collapsed ? stats.pages.get(id) - (tn.page ? 1 : 0) : 0;
      const d = layout.depthOf.get(id) ?? 0;
      nodes.push({
        id,
        kind: tn.kind,
        url: tn.url,
        page: tn.page,
        x: p.x,
        y: p.y,
        z: p.z,
        depth: tn.page ? tn.page.depth : null,
        level: d,
        sev: collapsed ? stats.sev.get(id) : tn.url ? M.worst(tn.url) : null,
        group: hidden,
        count: stats.pages.get(id),
        root: id === tree.root,
        major: false,
        label: id === tree.root ? t('map.home') : tn.kind === 'unreached' ? t('map.unreached') : tn.kind === 'folder' && !tn.page ? tn.label : pathLabel(tn.url),
      });
    }
    // Repères nommés : les plus grandes branches de premier niveau (au plus 8, au moins 2 % des pages).
    nodes.filter((x) => x.level === 1 && x.count >= Math.max(2, M.pages.length * 0.02)).sort((a, b) => b.count - a.count).slice(0, 8).forEach((x) => (x.major = true));
    const links = [];
    for (const x of nodes) {
      const par = tree.parent.get(x.id);
      if (par != null && visible.has(par)) links.push({ s: par, t: x.id, virtual: tree.nodes.get(par)?.kind === 'unreached' });
    }
    return { mode, fixed: true, nodes, links, tree, stats, hiddenPages: 0, groups: nodes.filter((x) => x.group).length };
  }
  // Maillage : budget de pages (les plus liées d'abord) ; une page recherchée ou isolée est toujours ajoutée.
  let ids = M.pages.map((p) => p.url);
  let hidden = 0;
  if (o.isolate) ids = [...o.isolate];
  else if (ids.length > budget) {
    const keep = new Set([M.home, ...(o.extra || [])]);
    const sorted = [...M.pages].sort((a, b) => (b.linkScore || 0) - (a.linkScore || 0) || (a.depth ?? 99) - (b.depth ?? 99) || a.url.localeCompare(b.url));
    for (const p of sorted) {
      if (keep.size >= budget) break;
      keep.add(p.url);
    }
    hidden = ids.length - keep.size;
    ids = [...keep].filter((u) => M.byUrl.has(u));
  }
  const set = new Set(ids);
  const posKey = `${key}|pos|links|${dim}|${o.isolate ? 'iso' + ids.length + ids[0] : ''}|${ids.length}`;
  const savedPos = recall(posKey);
  const seed = savedPos || seededPositions(M, ids, (u) => topDir(u), { dim });
  const nodes = ids.map((u) => {
    const p = M.byUrl.get(u);
    const s = seed.get(u) || { x: 0, y: 0, z: 0 };
    return { id: u, kind: 'page', url: u, page: p, x: s.x, y: s.y, z: s.z, depth: p.depth, sev: M.worst(u), root: u === M.home, label: u === M.home ? t('map.home') : pathLabel(u) };
  });
  // Quelques repères : les pages qui reçoivent le plus de liens.
  [...nodes].sort((a, b) => (M.inl.get(b.id)?.size || 0) - (M.inl.get(a.id)?.size || 0)).slice(0, 6).forEach((x) => (x.major = true));
  const links = [];
  for (const u of ids) for (const v of M.out.get(u) || []) if (set.has(v)) links.push({ s: u, t: v });
  return { mode, fixed: !!savedPos, nodes, links, posKey, hiddenPages: hidden };
}

// ---------- Filtres (corpus complet) ----------
export const DEFAULT_FILTERS = { issues: '', depthMin: null, dir: '', status: '', index: '', lowInlinks: false, inlinksMax: 1, lsMin: null, lsMax: null };
export const activeFilters = (f) => Object.entries(f).filter(([k, v]) => k !== 'inlinksMax' && v !== '' && v !== null && v !== false);

export function matchPages(M, f) {
  const out = new Set();
  for (const p of M.pages) {
    const w = M.worst(p.url);
    if (f.issues === 'any' && !w) continue;
    if (f.issues && f.issues !== 'any' && !(M.issues.get(p.url) || []).some((i) => i.severity === f.issues)) continue;
    if (f.depthMin != null && !(p.depth != null && p.depth >= f.depthMin)) continue;
    if (f.dir && topDir(p.url) !== f.dir) continue;
    if (f.status) {
      const s = !p.status ? 'none' : p.status >= 500 ? 'server' : p.status >= 400 ? 'client' : p.status >= 300 ? 'redirect' : 'ok';
      if (s !== f.status) continue;
    }
    if (f.index === 'yes' && p.indexable !== true) continue;
    if (f.index === 'no' && p.indexable !== false) continue;
    if (f.lowInlinks && !((M.inl.get(p.url)?.size || 0) <= f.inlinksMax && p.url !== M.home)) continue;
    if (f.lsMin != null && !((p.linkScore ?? -1) >= f.lsMin)) continue;
    if (f.lsMax != null && !(p.linkScore != null && p.linkScore <= f.lsMax)) continue;
    out.add(p.url);
  }
  return out;
}

// Identifiants à mettre en avant dans la scène : pages correspondantes et groupes qui en contiennent.
export function matchIds(scene, matched) {
  const ids = new Set();
  if (!scene.tree) {
    for (const n of scene.nodes) if (matched.has(n.id)) ids.add(n.id);
    return ids;
  }
  const visible = new Set(scene.nodes.map((n) => n.id));
  for (const u of matched) {
    for (let cur = u; cur != null; cur = scene.tree.parent.get(cur)) {
      if (visible.has(cur)) {
        ids.add(cur);
        break;
      }
    }
  }
  // Un dossier qui porte une page correspondante (vue répertoires) est aussi mis en avant.
  for (const n of scene.nodes) if (n.url && matched.has(n.url)) ids.add(n.id);
  return ids;
}

// Isolement : pages correspondantes et leurs ancêtres (arbres), ou pages correspondantes seules (maillage).
export function isolateSet(scene, M, mode, matched, key) {
  if (mode === 'links') return new Set(matched);
  const { tree } = treeOf(M, mode, key);
  const out = new Set([tree.root]);
  for (const u of matched) {
    let cur = tree.nodes.has(u) ? u : [...tree.nodes.values()].find((n) => n.url === u)?.id;
    for (; cur != null && !out.has(cur); cur = tree.parent.get(cur)) out.add(cur);
  }
  return out;
}

export function searchPages(M, q, limit = 8) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const res = [];
  for (const p of M.pages) {
    const hit = p.url.toLowerCase().includes(s) || (p.title || '').toLowerCase().includes(s);
    if (hit) res.push(p);
  }
  return res.sort((a, b) => (b.linkScore || 0) - (a.linkScore || 0)).slice(0, limit);
}

// Identifiant du nœud qui porte une URL dans un arbre (la page, ou le dossier qui porte la page).
export function nodeIdForUrl(M, mode, key, url) {
  if (mode === 'links') return url;
  const { tree } = treeOf(M, mode, key);
  if (tree.nodes.has(url)) return url;
  for (const n of tree.nodes.values()) if (n.url === url) return n.id;
  return null;
}

// Ancêtres à déplier pour rendre une page visible.
export function ancestorsOf(M, mode, key, id) {
  const { tree } = treeOf(M, mode, key);
  const out = [];
  for (let cur = tree.parent.get(id); cur != null; cur = tree.parent.get(cur)) out.push(cur);
  return out;
}

export { pathTo, pathClicks, descendants };

// ---------- Légende ----------
export function legendItems(o, M, t, dirs) {
  switch (o.colorBy) {
    case 'issues':
      return [[SEV_COLORS.error, t('map.sev.error')], [SEV_COLORS.warning, t('map.sev.warning')], [SEV_COLORS.notice, t('map.sev.notice')], [NO_ISSUE, t('map.noIssue')]];
    case 'status':
      return [[STATUS_COLORS.ok, '2xx'], [STATUS_COLORS.redirect, '3xx'], [STATUS_COLORS.client, '4xx'], [STATUS_COLORS.server, '5xx'], [STATUS_COLORS.none, t('map.noResponse')]];
    case 'index':
      return [[INDEX_COLORS.yes, t('idx.indexable')], [INDEX_COLORS.no, t('idx.nonIndexable')], [INDEX_COLORS.unknown, t('map.unknown')]];
    case 'dir':
      return dirs.slice(0, DIR_COLORS.length).map((d, i) => [DIR_COLORS[i], d]).concat(dirs.length > DIR_COLORS.length ? [[UNKNOWN, t('map.otherDirs')]] : []);
    default:
      return DEPTH_COLORS.map((c, i) => [c, i === DEPTH_COLORS.length - 1 ? `${i}+` : String(i)]).concat([[UNKNOWN, t('map.unknown')]]);
  }
}
