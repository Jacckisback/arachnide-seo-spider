import test from 'node:test';
import assert from 'node:assert/strict';
import { isPageNode, colorOf, radiusOf, DEPTH_COLORS, SEV_COLORS, UNKNOWN } from '../public/viz.js';
import { buildModel, crawlTree, dirTree, subtreeStats, pathTo, pathClicks, topDir } from '../public/map-model.js';
import { radialTree, visibleTree } from '../public/map-layout.js';
import { makeScene, matchPages, DEFAULT_FILTERS } from '../public/map-view.js';

const t = (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k);
const page = (url, extra = {}) => ({ url, isHtml: true, status: 200, indexable: true, depth: 1, linkScore: 10, ...extra });
const graphOf = (edges) => {
  const out = new Map();
  for (const [from, to, nofollow] of edges) {
    if (!out.has(from)) out.set(from, []);
    out.get(from).push({ from, to, internal: true, nofollow: !!nofollow });
  }
  return { out };
};
// Site : accueil → /blog/ → /blog/a (et /blog/b par un lien depuis /blog/a) ; /blog/a ↔ /blog/b ; /hors-lien n'est atteinte par aucun lien.
const H = 'https://x.fr/';
const R = {
  meta: { startUrl: H, finishedAt: '2026-10-15T10:00:00Z' },
  pages: [
    page(H, { depth: 0, linkScore: 100 }),
    page(H + 'blog/', { depth: 1, pathParent: H, linkScore: 60 }),
    page(H + 'blog/a', { depth: 2, pathParent: H + 'blog/', linkScore: 40 }),
    page(H + 'blog/b', { depth: 3, pathParent: H + 'blog/a', linkScore: null, indexable: null }),
    page(H + 'ancienne', { depth: 1, status: 301, isHtml: false, pathParent: H }),
    page(H + 'hors-lien', { depth: null }),
    { url: H + 'logo.png', status: 200, contentType: 'image/png', depth: 1 },
  ],
  issues: [
    { id: 'title-long', severity: 'warning', items: [{ url: H + 'blog/a' }, { url: H + 'blog/a' }] },
    { id: '4xx', severity: 'error', items: [{ url: H + 'blog/b' }] },
  ],
};
const G = graphOf([[H, H + 'blog/'], [H + 'blog/', H + 'blog/a'], [H + 'blog/a', H + 'blog/b'], [H + 'blog/b', H + 'blog/a'], [H, H + 'ancienne'], [H + 'blog/', H + 'blog/b', true]]);

test('cartographie : seules les pages sont des nœuds', () => {
  assert.equal(isPageNode({ url: 'https://x.fr/a', isHtml: true, status: 200 }), true);
  assert.equal(isPageNode({ url: 'https://x.fr/img/photo.jpg', status: 200, contentType: 'image/jpeg' }), false);
  assert.equal(isPageNode({ url: 'https://x.fr/doc.pdf', status: 404 }), false);
  assert.equal(isPageNode({ url: 'https://x.fr/ancienne', status: 301 }), true);
  const M = buildModel(R, G);
  assert.equal(M.pages.length, 6);
  assert.equal(M.resources, 1);
  // Liens suivis entre pages, dédoublonnés, sens et cycles conservés ; le nofollow n'en fait pas partie.
  assert.equal(M.linkCount, 5);
  assert.ok(M.out.get(H + 'blog/a').has(H + 'blog/b') && M.out.get(H + 'blog/b').has(H + 'blog/a'));
  assert.ok(!M.out.get(H + 'blog/').has(H + 'blog/b'));
  assert.deepEqual(M.issues.get(H + 'blog/a').map((i) => i.id), ['title-long']); // pas de doublon
  assert.equal(M.worst(H + 'blog/b'), 'error');
});

test('cartographie : arbre de crawl = plus court chemin, profondeur = clics du chemin', () => {
  const M = buildModel(R, G);
  const T = crawlTree(M);
  assert.equal(T.inferred, false);
  assert.equal(T.parent.get(H + 'blog/b'), H + 'blog/a');
  const path = pathTo(T, H + 'blog/b');
  assert.deepEqual(path.map((s) => s.id), [H, H + 'blog/', H + 'blog/a', H + 'blog/b']);
  assert.equal(pathClicks(path), 3);
  // Une page non atteinte par un lien suivi est rangée dans un groupe virtuel, sans lien inventé.
  assert.equal(T.parent.get(H + 'hors-lien'), 'v:unreached');
  assert.equal(T.nodes.get('v:unreached').kind, 'unreached');
  // Crawl antérieur à la 3.9 (sans pathParent) : parent déduit, et signalé comme tel.
  const old = { ...R, pages: R.pages.map(({ pathParent, ...p }) => p) };
  const T2 = crawlTree(buildModel(old, G));
  assert.equal(T2.inferred, true);
  assert.equal(T2.parent.get(H + 'blog/a'), H + 'blog/');
});

test('cartographie : répertoires = dossiers virtuels non comptés comme pages', () => {
  const M = buildModel(R, G);
  const D = dirTree(M);
  const S = subtreeStats(D, M);
  assert.equal(S.pages.get(D.root), M.pages.length); // le total reste le nombre de pages explorées
  assert.equal(D.nodes.get('dir:/blog/').page.url, H + 'blog/'); // la page /blog/ est portée par son dossier, sans doublon
  assert.equal(S.pages.get('dir:/blog/'), 3);
  assert.equal(S.sev.get('dir:/blog/'), 'error'); // le groupe garde l'indicateur du problème le plus grave
  assert.equal(topDir(H + 'blog/a'), '/blog/');
});

test('cartographie : placement déterministe, groupes repliés, échelles bornées', () => {
  const M = buildModel(R, G);
  const T = crawlTree(M);
  const S = subtreeStats(T, M);
  const a = radialTree(T, S.pages, { dim: '3d' });
  const b = radialTree(T, S.pages, { dim: '3d' });
  assert.deepEqual([...a.pos.entries()], [...b.pos.entries()]); // mêmes positions à chaque calcul
  const V = visibleTree(T, S.pages, { budget: 3 });
  assert.ok(V.visible.size <= 4 && V.visible.has(H));
  const scene = makeScene(M, { mode: 'crawl', dim: '2d', expanded: new Set() }, 'k1', t);
  assert.equal(scene.fixed, true);
  assert.ok(scene.links.every((l) => scene.nodes.some((n) => n.id === l.s) && scene.nodes.some((n) => n.id === l.t)));
  const links = makeScene(M, { mode: 'links', dim: '2d' }, 'k1', t);
  assert.equal(links.links.length, M.linkCount);
  // Couleurs : profondeur turquoise → violet, inconnue en gris ; taille bornée, Link Score absent = taille minimale.
  const n = (p, extra = {}) => ({ kind: 'page', page: p, depth: p.depth, ...extra });
  assert.equal(colorOf(n(R.pages[0]), { colorBy: 'depth' }), DEPTH_COLORS[0]);
  assert.equal(colorOf(n(R.pages[5]), { colorBy: 'depth' }), UNKNOWN);
  assert.equal(colorOf(n(R.pages[3], { sev: 'error' }), { colorBy: 'issues' }), SEV_COLORS.error);
  assert.equal(colorOf(n(R.pages[3]), { colorBy: 'index' }), '#475569'); // indexabilité inconnue ≠ indexable
  const big = radiusOf(n(R.pages[0]), { sizeBy: 'linkScore' });
  const none = radiusOf(n(R.pages[3]), { sizeBy: 'linkScore' });
  assert.ok(big / none <= 2.7 && none === 2.2);
});

test('cartographie : filtres sur tout le corpus, seuil explicite', () => {
  const M = buildModel(R, G);
  assert.deepEqual([...matchPages(M, { ...DEFAULT_FILTERS, issues: 'any' })].sort(), [H + 'blog/a', H + 'blog/b']);
  assert.deepEqual([...matchPages(M, { ...DEFAULT_FILTERS, depthMin: 3 })], [H + 'blog/b']);
  // Faible maillage : aucune page source observée (seuil 0) — l'accueil n'est pas concerné.
  assert.deepEqual([...matchPages(M, { ...DEFAULT_FILTERS, lowInlinks: true, inlinksMax: 0 })], [H + 'hors-lien']);
  assert.deepEqual([...matchPages(M, { ...DEFAULT_FILTERS, index: 'yes', dir: '/blog/' })].sort(), [H + 'blog/', H + 'blog/a']);
});

test('répertoires : « /en » porte le dossier /en/, jamais d’URL inventée', () => {
  // Cas remonté sur coeurduweb.com : /en existe, /en/ n'existe pas, des pages vivent sous /en/…
  const pages = [page(H, { depth: 0 }), page(H + 'en', { depth: 1 }), page(H + 'en/services', { depth: 2 }), page(H + 'en/blog', { depth: 2 }), page(H + 'en/blog/post-1', { depth: 3 }), page(H + 'contact')];
  const M = buildModel({ meta: { startUrl: H }, pages, issues: [] }, graphOf([]));
  const D = dirTree(M);
  const urls = new Set([...D.nodes.values()].map((n) => n.url).filter(Boolean));
  for (const u of urls) assert.ok(M.byUrl.has(u), `URL affichée mais non crawlée : ${u}`);
  assert.equal(D.nodes.get('dir:/en/').url, H + 'en'); // la page /en porte son dossier
  assert.equal(D.nodes.get('dir:/en/blog/').url, H + 'en/blog');
  assert.ok(!D.nodes.has(H + 'en') && !D.nodes.has(H + 'en/blog'));
  assert.equal(subtreeStats(D, M).pages.get(D.root), pages.length); // chaque page comptée une fois
  // Un dossier sans page à son adresse est libellé comme un regroupement, pas comme une URL.
  const M2 = buildModel({ meta: { startUrl: H }, pages: [page(H, { depth: 0 }), page(H + 'fr/a'), page(H + 'fr/b')], issues: [] }, graphOf([]));
  const D2 = dirTree(M2);
  assert.equal(D2.nodes.get('dir:/fr/').url, undefined);
  assert.equal(D2.nodes.get('dir:/fr/').label, '/fr/*');
  // Répertoire de premier niveau : /en appartient à /en/, /contact reste à la racine.
  assert.equal(M.dirOf(H + 'en'), '/en/');
  assert.equal(M.dirOf(H + 'contact'), '/');
});

test('filtres : dossier à tout niveau, motifs d’URL à inclure / exclure', async () => {
  const { compilePatterns, folderOptions } = await import('../public/map-view.js');
  const pages = [page(H, { depth: 0 }), page(H + 'en', { depth: 1 }), page(H + 'en/blog/a'), page(H + 'en/blog/b'), page(H + 'fr/blog/a'), page(H + 'fr/cours?page=2')];
  const M = buildModel({ meta: { startUrl: H }, pages, issues: [] }, graphOf([]));
  const m = (f) => [...matchPages(M, { ...DEFAULT_FILTERS, ...f })].map((u) => u.replace(H, '/')).sort();
  assert.deepEqual(m({ dir: '/en/' }), ['/en', '/en/blog/a', '/en/blog/b']);
  assert.deepEqual(m({ dir: '/en/blog/' }), ['/en/blog/a', '/en/blog/b']);
  assert.deepEqual(m({ urlExc: '/en/(.*)\n/en' }), ['/', '/fr/blog/a', '/fr/cours?page=2']);
  assert.deepEqual(m({ urlInc: '/*/blog/*' }), ['/en/blog/a', '/en/blog/b', '/fr/blog/a']);
  assert.deepEqual(m({ urlInc: '?page=' }), ['/fr/cours?page=2']); // regex invalide → lue comme du texte
  assert.deepEqual(m({ urlInc: 'blog', urlExc: '/fr/' }), ['/en/blog/a', '/en/blog/b']);
  // Regex invalide : lue comme du texte et signalée, la carte n'est jamais bloquée.
  assert.deepEqual(compilePatterns('(\n/ok/').bad, ['(']);
  assert.equal(m({ urlInc: '(' }).length, 0);
  const opts = new Map(folderOptions(M));
  assert.equal(opts.get('/en/'), 3);
  assert.equal(opts.get('/en/blog/'), 2);
});

test('arbre horizontal : une ligne par feuille, longues fratries résumées, rien de perdu', async () => {
  const { hierTree } = await import('../public/map-layout.js');
  const { SIBLINGS } = await import('../public/map-view.js');
  const posts = Array.from({ length: 30 }, (_, i) => page(H + 'blog/p' + i, { depth: 2, pathParent: H + 'blog/' }));
  const pages = [page(H, { depth: 0 }), page(H + 'blog/', { depth: 1, pathParent: H }), page(H + 'contact', { depth: 1, pathParent: H }), ...posts];
  const M = buildModel({ meta: { startUrl: H }, pages, issues: [{ id: '4xx', severity: 'error', items: [{ url: H + 'blog/p29' }] }] }, graphOf([]));
  const sc = makeScene(M, { mode: 'crawl', dim: '2d', layout: 'tree', expanded: new Set() }, 'k-tree', t);
  assert.equal(sc.layout, 'tree');
  const more = sc.nodes.find((n) => n.kind === 'more');
  const shown = sc.nodes.filter((n) => n.page && n.id.startsWith(H + 'blog/p')).length;
  assert.equal(shown, SIBLINGS - 1);
  assert.equal(more.count + shown, 30); // chaque page est soit affichée, soit comptée dans « + N autres »
  assert.equal(more.sev, 'error'); // le problème d'une page résumée reste signalé
  assert.ok(sc.links.some((l) => l.s === H + 'blog/' && l.t === more.id));
  // Lignes : toutes distinctes, colonnes = niveaux, parent centré sur ses enfants.
  const ys = sc.nodes.filter((n) => !sc.nodes.some((c) => sc.links.some((l) => l.s === n.id && l.t === c.id))).map((n) => n.y);
  assert.equal(new Set(ys).size, ys.length);
  const blog = sc.nodes.find((n) => n.id === H + 'blog/');
  assert.ok(blog.x > sc.nodes.find((n) => n.root).x);
  // « Afficher toute la liste » : la fratrie entière revient.
  const pinned = makeScene(M, { mode: 'crawl', dim: '2d', layout: 'tree', expanded: new Set(), pin: new Set([H + 'blog/p3']) }, 'k-tree', t);
  assert.ok(pinned.nodes.some((n) => n.id === H + 'blog/p3')); // la page sélectionnée n'est jamais résumée
  const all = makeScene(M, { mode: 'crawl', dim: '2d', layout: 'tree', expanded: new Set(), showAll: new Set([H + 'blog/']) }, 'k-tree', t);
  assert.ok(!all.nodes.some((n) => n.kind === 'more'));
  assert.equal(all.nodes.filter((n) => n.id.startsWith(H + 'blog/p')).length, 30);
  // Arbre profond : pas de récursion, pas de débordement de pile.
  const deep = { root: 'r', nodes: new Map(), parent: new Map(), children: new Map() };
  let prev = 'r';
  for (let i = 0; i < 20000; i++) (deep.children.set(prev, ['n' + i]), deep.parent.set('n' + i, prev), (prev = 'n' + i));
  const L = hierTree(deep, new Set(['r', ...deep.parent.keys()]));
  assert.equal(L.pos.size, 20001);
});
