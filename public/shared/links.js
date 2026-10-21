// Liens d'un résultat de crawl, dans les deux formats enregistrés :
//   - colonnes (3.17 et après) : { urls, anchors, from, to, anchor, flags, pos } — un entier par lien et par colonne ;
//   - tuples (jusqu'à 3.16) : { urls, edges: [[from, to, ancre, drapeaux, position], …] }.
// Drapeaux : 1 nofollow, 2 interne, 4 lien-image, 8 lien dans du code. Position : 0 content, 1 nav, 2 header, 3 footer, 4 aside.
export const LINK_FLAG = { nofollow: 1, internal: 2, image: 4, code: 8 };
export const LINK_POS = ['content', 'nav', 'header', 'footer', 'aside'];

export const linkUrls = (R) => R.links?.urls || [];

export function linkCount(R) {
  const L = R.links;
  if (!L) return 0;
  return L.edges ? L.edges.length : L.from?.length || 0;
}

// Appelle fn(fromIndex, toIndex, anchorText, flags, pos) pour chaque lien, sans créer d'objet par lien.
export function forEachLink(R, fn) {
  const L = R.links;
  if (!L) return;
  if (L.edges) {
    for (const e of L.edges) fn(e[0], e[1], e[2], e[3], e[4] || 0);
    return;
  }
  const { from, to, anchor, flags, pos, anchors = [] } = L;
  const n = from?.length || 0;
  for (let i = 0; i < n; i++) fn(from[i], to[i], anchors[anchor[i]] ?? '', flags[i], pos[i]);
}
