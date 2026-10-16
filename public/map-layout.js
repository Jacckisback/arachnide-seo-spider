// Cartographie : calcul des positions, séparé du rendu.
// Les arbres (crawl, répertoires) sont placés de façon déterministe en un seul passage : pas de simulation,
// pas de positions aléatoires, et les mêmes coordonnées tant que la structure ne change pas.
// La position est une convention de lecture : elle n'implique aucun lien ni aucune conclusion SEO.

// Arbre radial : chaque branche reçoit un secteur proportionnel à la racine carrée de sa taille (les grosses
// branches ne écrasent pas les petites), séparé de ses voisines par une marge ; la distance au centre suit le niveau.
export function radialTree(tree, sizes, { dim = '2d', level = 70 } = {}) {
  const pos = new Map();
  const w = new Map();
  for (const [id, n] of sizes) w.set(id, Math.sqrt(Math.max(1, n)));
  const depthOf = new Map([[tree.root, 0]]);
  pos.set(tree.root, { x: 0, y: 0, z: 0 });
  const top = tree.children.get(tree.root) || [];
  // Marge entre les grandes branches pour qu'elles se lisent comme des groupes distincts.
  const gap = top.length > 1 ? Math.min(0.35, 1.2 / top.length) : 0;
  const total = top.reduce((a, c) => a + w.get(c), 0) || 1;
  const usable = Math.PI * 2 - gap * top.length;
  let a0 = -Math.PI / 2;
  const stack = [];
  top.forEach((c, i) => {
    const span = (usable * w.get(c)) / total;
    stack.push([c, a0, a0 + span, 1, i]);
    a0 += span + gap;
  });
  while (stack.length) {
    const [id, from, to, d, branch] = stack.pop();
    depthOf.set(id, d);
    const mid = (from + to) / 2;
    // Rayon : niveau × pas, légèrement élargi pour les niveaux profonds et peuplés (moins de chevauchement).
    const r = level * d * (1 + Math.min(0.6, Math.log10(1 + (tree.children.get(tree.parent.get(id)) || []).length) * 0.12));
    const p = { x: r * Math.cos(mid), y: r * Math.sin(mid), z: 0 };
    if (dim === '3d') {
      // Relief : chaque grande branche s'incline d'un côté ou de l'autre du plan, de façon reproductible.
      const tilt = ((branch * 0.618) % 1) * 2 - 1;
      p.z = r * 0.45 * tilt + (d > 1 ? Math.sin(mid * 7 + d) * level * 0.35 : 0);
    }
    pos.set(id, p);
    const kids = tree.children.get(id) || [];
    if (!kids.length) continue;
    const sum = kids.reduce((a, c) => a + w.get(c), 0) || 1;
    // Les enfants s'étalent un peu au-delà du secteur du parent quand il est étroit (lisibilité des feuilles).
    const span = Math.max(to - from, Math.min(0.5, (kids.length * 0.9) / (level * (d + 1))));
    let s = mid - span / 2;
    for (const c of kids) {
      const part = (span * w.get(c)) / sum;
      stack.push([c, s, s + part, d + 1, branch]);
      s += part;
    }
  }
  return { pos, depthOf };
}

// Arbre hiérarchique horizontal (lecture « à la Screaming Frog ») : la racine à gauche, un niveau par colonne,
// une ligne par feuille visible, chaque parent centré sur ses enfants. Calculé sur les seuls nœuds visibles, pour que
// les branches repliées ne laissent pas de trous ; l'ordre des enfants est celui de l'arbre (alphabétique).
export function hierTree(tree, visible, { levelGap = 300, rowGap = 20, extra } = {}) {
  const pos = new Map();
  const depthOf = new Map();
  let row = 0;
  // extra : nœuds virtuels ajoutés après les enfants (« + 24 autres pages »), par parent.
  const kidsOf = (id) => (tree.children.get(id) || []).filter((c) => visible.has(c)).concat(extra?.get(id) || []);
  // Parcours postfixe itératif (pas de récursion : un arbre de 10 000 niveaux ne fait pas déborder la pile).
  const stack = [[tree.root, 0, false]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const [id, d, done] = top;
    const kids = kidsOf(id);
    if (!done && kids.length) {
      top[2] = true;
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], d + 1, false]);
      continue;
    }
    stack.pop();
    depthOf.set(id, d);
    const y = kids.length ? (pos.get(kids[0]).y + pos.get(kids[kids.length - 1]).y) / 2 : row++ * rowGap;
    pos.set(id, { x: d * levelGap, y, z: 0 });
  }
  return { pos, depthOf };
}

// Nœuds visibles d'un arbre selon un budget : on déplie d'abord les niveaux hauts puis les plus grosses branches.
// Un nœud non déplié devient un groupe qui affiche le nombre de pages qu'il contient : rien n'est supprimé.
export function visibleTree(tree, sizes, { budget = 1500, expanded = new Set(), collapsed = new Set() } = {}) {
  const open = new Set();
  let count = 1;
  const queue = [[tree.root, 0]];
  const forced = (id) => expanded.has(id);
  while (queue.length) {
    queue.sort((a, b) => a[1] - b[1] || (sizes.get(b[0]) || 0) - (sizes.get(a[0]) || 0));
    const [id, d] = queue.shift();
    const kids = tree.children.get(id) || [];
    if (!kids.length || collapsed.has(id)) continue;
    if (count + kids.length > budget && !forced(id) && id !== tree.root) continue;
    open.add(id);
    count += kids.length;
    for (const c of kids) queue.push([c, d + 1]);
  }
  const visible = new Set([tree.root]);
  const stack = [tree.root];
  while (stack.length) {
    const id = stack.pop();
    if (!open.has(id)) continue;
    for (const c of tree.children.get(id) || []) (visible.add(c), stack.push(c));
  }
  return { visible, open };
}

// Maillage : positions de départ par répertoire (un secteur par répertoire de premier niveau, la profondeur
// éloigne du centre). Le moteur de forces affine ensuite à partir de ce point, pendant une durée bornée.
export function seededPositions(M, ids, groupOf, { dim = '2d', level = 60 } = {}) {
  const groups = new Map();
  for (const id of ids) {
    const g = groupOf(id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(id);
  }
  const keys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b));
  const total = ids.length || 1;
  const pos = new Map();
  let a0 = -Math.PI / 2;
  keys.forEach((k, gi) => {
    const list = groups.get(k).sort((a, b) => (M.byUrl.get(a)?.depth ?? 9) - (M.byUrl.get(b)?.depth ?? 9) || a.localeCompare(b));
    const span = Math.max(0.15, (Math.PI * 2 * list.length) / total);
    list.forEach((id, i) => {
      const d = M.byUrl.get(id)?.depth ?? 4;
      const ang = a0 + (span * (i + 0.5)) / list.length;
      const r = level * (1.6 + d * 1.2) + (i % 7) * 9;
      pos.set(id, { x: r * Math.cos(ang), y: r * Math.sin(ang), z: dim === '3d' ? (((gi * 0.618) % 1) * 2 - 1) * level * 2 + (d - 2) * level * 0.6 : 0 });
    });
    a0 += span;
  });
  return pos;
}

// Cache des positions : clé = audit + mode + dimension + paramètres de disposition. Borné pour libérer la mémoire.
const CACHE = new Map();
export function cached(key, compute) {
  if (CACHE.has(key)) return CACHE.get(key);
  const v = compute();
  CACHE.set(key, v);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  return v;
}
export const remember = (key, v) => {
  CACHE.set(key, v);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
};
export const recall = (key) => CACHE.get(key);
// Changement d'audit : les arbres et positions de l'audit précédent ne servent plus, on libère la mémoire.
export const clearLayoutCache = () => CACHE.clear();
