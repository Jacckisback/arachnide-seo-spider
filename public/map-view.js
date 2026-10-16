// Cartographie : scène visible, filtres, recherche et gabarits (barre d'outils, légende, inspecteur).
// Les filtres et la recherche portent sur tout le corpus de pages, pas seulement sur ce qui est dessiné.
import { crawlTree, dirTree, subtreeStats, pathTo, pathClicks, descendants, inFolder, worse as worseSev } from './map-model.js';
import { radialTree, hierTree, visibleTree, seededPositions, cached, recall } from './map-layout.js';
import { paletteOf } from './viz.js';

export const MODES = ['crawl', 'dir', 'links'];
export const COLORS = ['depth', 'issues', 'status', 'index', 'dir'];
export const SIZES = ['linkScore', 'inlinks', 'uniform'];
// Nœuds dessinés au plus ; au-delà, les branches se replient en groupes. L'arbre horizontal affiche un libellé par
// nœud : son budget est plus serré pour rester lisible (et présentable en capture d'écran).
export const BUDGET = { '2d': 2500, '3d': 1800, tree: 600 };
// Arbre horizontal : au-delà de ce nombre d'enfants, les plus petites branches sont regroupées dans « + N autres ».
export const SIBLINGS = 10;

const pathLabel = (url) => {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname + u.search) || '/';
  } catch {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
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
  const hier = dim === '2d' && o.layout === 'tree' && mode !== 'links';
  const budget = hier ? BUDGET.tree : BUDGET[dim];
  if (mode !== 'links') {
    const { tree, stats } = treeOf(M, mode, key);
    let layout = hier ? null : cached(`${key}|layout|${mode}|${dim}`, () => radialTree(tree, stats.pages, { dim, level: mode === 'dir' ? 60 : 72 }));
    let visible;
    let open;
    if (o.isolate) {
      visible = new Set(o.isolate);
      open = new Set([...visible].filter((id) => (tree.children.get(id) || []).some((c) => visible.has(c))));
    } else {
      ({ visible, open } = visibleTree(tree, stats.pages, { budget, expanded: o.expanded }));
    }
    // Arbre horizontal : une fratrie très longue (36 articles sous /blog/) est résumée en gardant les plus grosses
    // branches et un nœud « + N autres pages » ; « Afficher tout » (ou une recherche) déplie la fratrie entière.
    const more = new Map();
    if (hier) {
      for (const id of [...open]) {
        if (o.showAll?.has(id)) continue;
        const kids = (tree.children.get(id) || []).filter((c) => visible.has(c));
        if (kids.length <= SIBLINGS) continue;
        const rank = (c) => stats.pages.get(c) * 1000 + (tree.nodes.get(c)?.page?.linkScore || 0);
        const keep = new Set([...kids].sort((a, b) => rank(b) - rank(a) || String(a).localeCompare(String(b))).slice(0, SIBLINGS - 1));
        // La page sélectionnée (et son chemin) reste toujours affichée, même dans une longue fratrie.
        for (const c of kids) if (o.pin?.has(c)) keep.add(c);
        if (keep.size >= kids.length) continue;
        const hide = kids.filter((c) => !keep.has(c));
        for (const c of hide) {
          const stack = [c];
          while (stack.length) {
            const x = stack.pop();
            visible.delete(x);
            open.delete(x);
            for (const k of tree.children.get(x) || []) if (visible.has(k)) stack.push(k);
          }
        }
        more.set(id, hide);
      }
    }
    // Arbre horizontal : positions calculées sur les nœuds visibles (rapide, sans cache : O(n)).
    if (hier) layout = hierTree(tree, new Set([...visible].filter((id) => id === tree.root || open.has(tree.parent.get(id)))), { extra: new Map([...more.keys()].map((p) => [p, ['more:' + p]])) });
    // Répertoires en arbre : comme un explorateur de fichiers, chaque nœud affiche son chemin relatif au dossier parent
    // (« services » sous « /en/ ») ; l'info-bulle et l'inspecteur gardent l'URL complète.
    const relLabel = (label, id) => {
      if (!(hier && mode === 'dir')) return label;
      const par = tree.nodes.get(tree.parent.get(id));
      const base = par && par.id !== tree.root && par.path ? par.path.replace(/^https?:\/\/[^/]+/, '') : '';
      return base && label.startsWith(base) && label.length > base.length ? label.slice(base.length) : label;
    };
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
        label: id === tree.root ? t('map.home') : tn.kind === 'unreached' ? t('map.unreached') : relLabel(tn.kind === 'folder' && !tn.page ? tn.label : pathLabel(tn.url), id),
      });
    }
    for (const [par, hide] of more) {
      const p = layout.pos.get('more:' + par) || { x: 0, y: 0, z: 0 };
      const count = hide.reduce((a, c) => a + stats.pages.get(c), 0);
      nodes.push({ id: 'more:' + par, kind: 'more', expandId: par, x: p.x, y: p.y, z: 0, depth: null, level: layout.depthOf.get('more:' + par) ?? 0, sev: hide.reduce((a, c) => worseSev(a, stats.sev.get(c)), null), group: count, count, siblings: hide.length, root: false, major: false, label: t(count === hide.length ? 'map.morePagesOnly' : 'map.morePages', { n: hide.length }) });
    }
    // Repères nommés : les plus grandes branches de premier niveau (au plus 8, au moins 2 % des pages).
    nodes.filter((x) => x.level === 1 && x.count >= Math.max(2, M.pages.length * 0.02)).sort((a, b) => b.count - a.count).slice(0, 8).forEach((x) => (x.major = true));
    const links = [];
    for (const x of nodes) {
      const par = x.kind === 'more' ? x.expandId : tree.parent.get(x.id);
      if (par != null && visible.has(par)) links.push({ s: par, t: x.id, virtual: tree.nodes.get(par)?.kind === 'unreached' });
    }
    return { mode, layout: hier ? 'tree' : 'radial', fixed: true, nodes, links, tree, stats, hiddenPages: 0, groups: nodes.filter((x) => x.group).length };
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
  const seed = savedPos || seededPositions(M, ids, (u) => M.dirOf(u), { dim });
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
// dir : dossier à n'importe quel niveau (« /en/blog/ ») ; urlInc / urlExc : motifs d'URL, un par ligne.
export const DEFAULT_FILTERS = { issues: '', depthMin: null, dir: '', urlInc: '', urlExc: '', status: '', index: '', lowInlinks: false, inlinksMax: 1, lsMin: null, lsMax: null };
export const activeFilters = (f) => Object.entries(f).filter(([k, v]) => k !== 'inlinksMax' && k !== '_mode' && v !== '' && v !== null && v !== false && v !== undefined);

// Motifs d'URL, un par ligne : texte contenu dans l'URL (« /en/ »), joker (« /en/*/page-* ») ou expression régulière
// à la Screaming Frog (« /en/(.*) », « \?page=\d+ ») dès qu'un caractère spécial de regex apparaît.
// Une regex invalide (« ?page= », « ( ») est lue comme du texte simple et signalée : elle ne bloque jamais la carte.
const REGEX_HINT = /[\\^$()[\]|+?{}]|\.\*/;
export function compilePatterns(src) {
  const res = [];
  const bad = [];
  for (const raw of String(src || '').split(/\n/)) {
    const s = raw.trim();
    if (!s) continue;
    try {
      if (REGEX_HINT.test(s)) res.push(new RegExp(s, 'i'));
      else if (s.includes('*')) res.push(new RegExp(s.split('*').map(escRe).join('.*'), 'i'));
      else res.push(new RegExp(escRe(s), 'i'));
    } catch {
      bad.push(s);
      res.push(new RegExp(escRe(s), 'i'));
    }
  }
  return { res, bad };
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le motif est testé sur le chemin (« /en/blog?p=2 ») et sur l'URL complète, pour qu'un joker de chemin marche aussi.
const testUrl = (re, url) => {
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch { /* URL brute */ }
  return re.test(path) || re.test(url);
};

export function matchPages(M, f) {
  const out = new Set();
  const inc = compilePatterns(f.urlInc).res;
  const exc = compilePatterns(f.urlExc).res;
  for (const p of M.pages) {
    const w = M.worst(p.url);
    if (f.issues === 'any' && !w) continue;
    if (f.issues && f.issues !== 'any' && !(M.issues.get(p.url) || []).some((i) => i.severity === f.issues)) continue;
    if (f.depthMin != null && !(p.depth != null && p.depth >= f.depthMin)) continue;
    if (f.dir && !inFolder(p.url, f.dir)) continue;
    if (inc.length && !inc.some((re) => testUrl(re, p.url))) continue;
    if (exc.length && exc.some((re) => testUrl(re, p.url))) continue;
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

// Dossiers proposés dans le filtre : tous les niveaux, avec le nombre de pages qu'ils contiennent (au moins 2).
export function folderOptions(M) {
  const c = new Map();
  for (const f of M.folders) c.set(f, 0);
  for (const p of M.pages) {
    let path;
    try {
      path = new URL(p.url).pathname;
    } catch {
      continue;
    }
    for (const f of M.folders) if (path.startsWith(f) || path + '/' === f) c.set(f, c.get(f) + 1);
  }
  return [...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 400);
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
  const carrier = new Map();
  for (const n of tree.nodes.values()) if (n.kind === 'folder' && n.url) carrier.set(n.url, n.id);
  for (const u of matched) {
    let cur = tree.nodes.has(u) ? u : carrier.get(u);
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
  const P = paletteOf(o.look);
  switch (o.colorBy) {
    case 'issues':
      return [[P.sev.error, t('map.sev.error')], [P.sev.warning, t('map.sev.warning')], [P.sev.notice, t('map.sev.notice')], [P.noIssue, t('map.noIssue')]];
    case 'status':
      return [[P.status.ok, '2xx'], [P.status.redirect, '3xx'], [P.status.client, '4xx'], [P.status.server, '5xx'], [P.status.none, t('map.noResponse')]];
    case 'index':
      return [[P.index.yes, t('idx.indexable')], [P.index.no, t('idx.nonIndexable')], [P.index.unknown, t('map.unknown')]];
    case 'dir':
      return dirs.slice(0, P.dir.length).map((d, i) => [P.dir[i], d]).concat(dirs.length > P.dir.length ? [[P.unknown, t('map.otherDirs')]] : []);
    default:
      return P.depth.map((c, i) => [c, i === P.depth.length - 1 ? `${i}+` : String(i)]).concat([[P.unknown, t('map.unknown')]]);
  }
}
