// Format de crawl enregistré depuis la 3.18 : NDJSON (un objet JSON par ligne), gzip côté serveur. Aucune ligne ne
// dépasse quelques mégaoctets, quelle que soit la taille du site : un crawl ne passe plus jamais par une seule chaîne.
//
// Ordre des lignes :
//   { t: 'head', version, meta, summary }      — l'historique ne lit que cette ligne
//   { t: 'issue', ...problème }                — une ligne par problème, avec ses URL
//   { t: 'page', ...page }                     — une ligne par page
//   { t: 'urls', v: [...] } / { t: 'anchors', v: [...] } — table d'URL et d'ancres par paquets de 100 000
//   { t: 'edges', from, to, anchor, flags, pos } — liens en colonnes, par paquets de 100 000
//   { t: 'images' | 'externals' | 'redirects' | 'brokenLinks' | …, v: élément } — une ligne par élément
//   { t: 'x', k, v }                           — toute autre clé du résultat, entière
// Ce module n'a aucune dépendance Node : il sert au serveur (src/ndjson.mjs) et au navigateur (lecture en flux).

export const CHUNK = 100_000;
export const NDJSON_VERSION = 3;
// Collections écrites un élément par ligne.
export const ITEM_KEYS = ['issues', 'pages', 'redirects', 'brokenLinks', 'nearDuplicates', 'cannibalization', 'images', 'gscOnly', 'ga4Only', 'logOnly', 'sitemapChanges', 'sitemapUrls', 'externals'];
const ITEM_TAG = { issues: 'issue', pages: 'page' };
const TAG_KEY = Object.fromEntries(ITEM_KEYS.map((k) => [ITEM_TAG[k] || k, k]));
const COLS = ['from', 'to', 'anchor', 'flags', 'pos'];

// Bloc de liens tel qu'il vit en mémoire : colonnes typées, et une sérialisation JSON en tableaux simples
// (JSON.stringify d'un tableau typé donnerait un objet { "0": … }).
export function linksBlock({ urls = [], anchors = [], from, to, anchor, flags, pos }) {
  const n = from?.length || 0;
  const typed = (a, T) => (a instanceof T ? a : T.from(a || []));
  const L = { urls, anchors, from: typed(from, Int32Array), to: typed(to, Int32Array), anchor: typed(anchor, Int32Array), flags: typed(flags, Uint8Array), pos: typed(pos, Uint8Array) };
  Object.defineProperty(L, 'toJSON', { enumerable: false, value: () => ({ urls: L.urls, anchors: L.anchors, from: Array.from(L.from), to: Array.from(L.to), anchor: Array.from(L.anchor), flags: Array.from(L.flags), pos: Array.from(L.pos) }) });
  Object.defineProperty(L, 'length', { enumerable: false, value: n });
  return L;
}

// Découpe un résultat en enregistrements (objets, pas encore des chaînes).
export function* resultRecords(R) {
  const { version, meta, summary, links, ...rest } = R;
  yield { t: 'head', version: NDJSON_VERSION, app_version: version, meta, summary };
  for (const k of ITEM_KEYS) {
    const arr = rest[k];
    delete rest[k];
    if (!Array.isArray(arr)) continue;
    const tag = ITEM_TAG[k];
    for (const it of arr) yield tag ? { t: tag, ...it } : { t: k, v: it };
  }
  if (links) {
    const L = links.edges ? fromTuples(links) : links;
    for (let s = 0; s < (L.urls || []).length; s += CHUNK) yield { t: 'urls', v: L.urls.slice(s, s + CHUNK) };
    for (let s = 0; s < (L.anchors || []).length; s += CHUNK) yield { t: 'anchors', v: L.anchors.slice(s, s + CHUNK) };
    const n = L.from?.length || 0;
    for (let s = 0; s < n; s += CHUNK) {
      const rec = { t: 'edges' };
      for (const c of COLS) rec[c] = Array.from(L[c].slice(s, Math.min(s + CHUNK, n)));
      yield rec;
    }
  }
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) yield { t: 'x', k, v };
}

// Ancien format de liens (tuples [from, to, ancre, drapeaux, position], ≤ 3.16) → colonnes.
export function fromTuples({ urls = [], edges = [] }) {
  const anchors = [];
  const anchorId = new Map();
  const n = edges.length;
  const L = { urls, anchors, from: new Int32Array(n), to: new Int32Array(n), anchor: new Int32Array(n), flags: new Uint8Array(n), pos: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const [f, t, a, fl, p] = edges[i];
    const txt = a || '';
    let id = anchorId.get(txt);
    if (id === undefined) {
      id = anchors.length;
      anchorId.set(txt, id);
      anchors.push(txt);
    }
    L.from[i] = f;
    L.to[i] = t;
    L.anchor[i] = id;
    L.flags[i] = fl || 0;
    L.pos[i] = p || 0;
  }
  return linksBlock(L);
}

// Assemble les enregistrements, dans l'ordre, en un résultat tel que l'application le lit.
export function assembler() {
  const R = {};
  for (const k of ITEM_KEYS) R[k] = [];
  const urls = [];
  const anchors = [];
  const chunks = [];
  let n = 0;
  let head = false;
  return {
    push(rec) {
      const t = rec.t;
      if (t === 'head') {
        head = true;
        R.version = rec.app_version ?? rec.version;
        R.meta = rec.meta;
        R.summary = rec.summary;
        // Résultat léger envoyé au navigateur : compteurs de liens par segment (il n'a pas les liens).
        if (rec.linkStats) R.linkStats = rec.linkStats;
        if (rec.light) R.light = true;
      } else if (TAG_KEY[t]) {
        if (t === 'issue' || t === 'page') {
          const { t: _t, ...it } = rec;
          R[TAG_KEY[t]].push(it);
        } else R[TAG_KEY[t]].push(rec.v);
      } else if (t === 'urls') for (const u of rec.v) urls.push(u);
      else if (t === 'anchors') for (const a of rec.v) anchors.push(a);
      else if (t === 'edges') {
        chunks.push(rec);
        n += rec.from.length;
      } else if (t === 'x') R[rec.k] = rec.v;
    },
    get hasHead() {
      return head;
    },
    finish() {
      if (!head) throw new Error('Crawl file without head line');
      const L = { urls, anchors, from: new Int32Array(n), to: new Int32Array(n), anchor: new Int32Array(n), flags: new Uint8Array(n), pos: new Uint8Array(n) };
      let o = 0;
      for (const c of chunks) {
        for (const k of COLS) L[k].set(c[k], o);
        o += c.from.length;
      }
      R.links = linksBlock(L);
      return R;
    },
  };
}

// Lit un flux de texte NDJSON (ReadableStream du navigateur ou itérable de chaînes / Uint8Array) ligne par ligne.
export async function* ndjsonLines(source) {
  const dec = new TextDecoder();
  let buf = '';
  const iter = source[Symbol.asyncIterator] ? source : readerIterator(source);
  for await (const chunk of iter) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }
  buf += dec.decode();
  if (buf.trim()) yield JSON.parse(buf);
}

async function* readerIterator(stream) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// Résultat entier à partir d'un flux NDJSON.
export async function readNdjson(source) {
  const A = assembler();
  for await (const rec of ndjsonLines(source)) A.push(rec);
  return A.finish();
}
