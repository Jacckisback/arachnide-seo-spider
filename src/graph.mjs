// Graphe compact du crawl : une URL ou une ancre = un entier, un lien = 14 octets en colonnes, et un graphe CSR
// (compressed sparse row) construit une fois pour l'analyse. Aucun objet par lien : 20 millions de liens tiennent
// en ~280 Mo au lieu de plusieurs gigaoctets avec un objet de sept propriétés et deux chaînes d'URL par lien.
//
// Limite à connaître : une Map V8 plafonne à 16 777 216 entrées. Pour 200 000 pages, la table d'URL en est loin ;
// au-delà de quelques millions d'URL découvertes, il faudrait la répartir sur plusieurs Map.

// Une URL ou une ancre = un entier, attribué à la première rencontre.
export class Interner {
  ids = new Map();
  values = [];
  id(s) {
    let i = this.ids.get(s);
    if (i === undefined) {
      i = this.values.length;
      this.ids.set(s, i);
      this.values.push(s);
    }
    return i;
  }
  has(s) {
    return this.ids.has(s);
  }
  get(s) {
    return this.ids.get(s);
  }
  get size() {
    return this.values.length;
  }
}

export const FLAG = { nofollow: 1, internal: 2, image: 4, code: 8 };
export const POS = ['content', 'nav', 'header', 'footer', 'aside'];
const POS_ID = new Map(POS.map((p, i) => [p, i]));
export const posId = (p) => POS_ID.get(p) ?? 0;

// Liens en colonnes : from, to (indices d'URL), anchor (indice d'ancre), flags, pos. Les tableaux doublent quand ils
// sont pleins. L'itérateur produit des objets à la volée pour le code qui lit encore des liens un par un.
export class LinkStore {
  n = 0;
  constructor(urls = new Interner(), anchors = new Interner(), cap = 1 << 16) {
    this.urls = urls;
    this.anchors = anchors;
    this.#alloc(cap);
  }
  #alloc(cap) {
    const grow = (A, old) => {
      const a = new A(cap);
      if (old) a.set(old.subarray(0, this.n));
      return a;
    };
    this.from = grow(Int32Array, this.from);
    this.to = grow(Int32Array, this.to);
    this.anchor = grow(Int32Array, this.anchor);
    this.flags = grow(Uint8Array, this.flags);
    this.pos = grow(Uint8Array, this.pos);
    this.cap = cap;
  }
  // Ajout par indices (chemin rapide).
  push(from, to, anchor, flags, pos) {
    if (this.n === this.cap) this.#alloc(this.cap * 2);
    const i = this.n++;
    this.from[i] = from;
    this.to[i] = to;
    this.anchor[i] = anchor;
    this.flags[i] = flags;
    this.pos[i] = pos;
    return i;
  }
  // Ajout par valeurs : { from, to, anchor, nofollow, internal, imageLink, code, pos }.
  add(l) {
    return this.push(this.urls.id(l.from), this.urls.id(l.to), this.anchors.id(l.anchor || ''), (l.nofollow ? FLAG.nofollow : 0) | (l.internal ? FLAG.internal : 0) | (l.imageLink ? FLAG.image : 0) | (l.code ? FLAG.code : 0), posId(l.pos));
  }
  get length() {
    return this.n;
  }
  // Objet lien reconstitué pour l'indice i (à éviter dans les boucles chaudes : préférer les colonnes).
  at(i) {
    const f = this.flags[i];
    return { from: this.urls.values[this.from[i]], to: this.urls.values[this.to[i]], anchor: this.anchors.values[this.anchor[i]], nofollow: !!(f & FLAG.nofollow), internal: !!(f & FLAG.internal), imageLink: !!(f & FLAG.image), code: !!(f & FLAG.code), pos: POS[this.pos[i]] };
  }
  *[Symbol.iterator]() {
    for (let i = 0; i < this.n; i++) yield this.at(i);
  }
  some(fn) {
    for (let i = 0; i < this.n; i++) if (fn(this.at(i), i)) return true;
    return false;
  }
  count(fn) {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (fn(this.flags[i], i)) c++;
    return c;
  }
  // Colonnes tronquées à la taille réelle, prêtes à sérialiser.
  columns() {
    return { from: this.from.subarray(0, this.n), to: this.to.subarray(0, this.n), anchor: this.anchor.subarray(0, this.n), flags: this.flags.subarray(0, this.n), pos: this.pos.subarray(0, this.n) };
  }
}

// Graphe CSR en deux passages, aucun objet par lien : les voisins de u sont adj[off[u]] … adj[off[u + 1] - 1].
// sets = plusieurs jeux d'arêtes { src, dst, m, keep } (les colonnes du LinkStore, plus quelques arêtes ajoutées par
// l'analyse : canonicals, redirections). map (optionnel) renumérote les nœuds (-1 = exclu), n étant alors le nombre
// de nœuds après renumérotation. Avec dedupe, chaque voisin n'apparaît qu'une fois par ligne.
export function csr(n, sets, { map = null, dedupe = false } = {}) {
  const off = new Int32Array(n + 1);
  const each = (fn) => {
    for (const { src, dst, m = src.length, keep } of sets) {
      for (let i = 0; i < m; i++) {
        if (keep && !keep(i)) continue;
        let u = src[i];
        let v = dst[i];
        if (map) {
          u = map[u];
          v = map[v];
          if (u < 0 || v < 0) continue;
        }
        fn(u, v);
      }
    }
  };
  each((u) => off[u + 1]++);
  for (let u = 0; u < n; u++) off[u + 1] += off[u];
  const adj = new Int32Array(off[n]);
  const cur = off.slice(0, n);
  each((u, v) => (adj[cur[u]++] = v));
  if (!dedupe) return { off, adj };
  const out = new Int32Array(adj.length);
  const off2 = new Int32Array(n + 1);
  let k = 0;
  for (let u = 0; u < n; u++) {
    const a = off[u];
    const b = off[u + 1];
    if (b > a) {
      const row = adj.subarray(a, b).sort();
      let last = -1;
      for (let j = 0; j < row.length; j++) {
        if (row[j] !== last) out[k++] = row[j];
        last = row[j];
      }
    }
    off2[u + 1] = k;
  }
  return { off: off2, adj: out.subarray(0, k) };
}

// Nombre de voisins distincts par ligne, sans Set : un tampon « déjà vu pour cette ligne » par voisin.
export function uniqueCounts(n, { off, adj }) {
  const out = new Int32Array(n);
  const stamp = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    for (let j = off[t]; j < off[t + 1]; j++) {
      const s = adj[j];
      if (stamp[s] !== t) {
        stamp[s] = t;
        out[t]++;
      }
    }
  }
  return out;
}

// PageRank sur un graphe CSR (voisins sortants), score 0-100 sur l'échelle log. Aucun objet par nœud ni par lien.
export function pageRankCsr(n, { off, adj }, iterations = 30, d = 0.85) {
  const scores = new Uint8Array(n);
  if (!n) return scores;
  let pr = new Float64Array(n).fill(1 / n);
  let next = new Float64Array(n);
  for (let it = 0; it < iterations; it++) {
    next.fill((1 - d) / n);
    let dangling = 0;
    for (let u = 0; u < n; u++) {
      const deg = off[u + 1] - off[u];
      if (!deg) dangling += pr[u];
      else {
        const w = (d * pr[u]) / deg;
        for (let j = off[u]; j < off[u + 1]; j++) next[adj[j]] += w;
      }
    }
    const dd = (d * dangling) / n;
    for (let u = 0; u < n; u++) next[u] += dd;
    [pr, next] = [next, pr];
  }
  let min = Infinity;
  let max = -Infinity;
  const logs = new Float64Array(n);
  for (let u = 0; u < n; u++) {
    const l = Math.log(pr[u]);
    logs[u] = l;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  for (let u = 0; u < n; u++) scores[u] = max > min ? Math.round(((logs[u] - min) / (max - min)) * 100) : 100;
  return scores;
}
