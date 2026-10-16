// Cartographie : rendu 2D (force-graph, canvas) et 3D (3d-force-graph + Three.js).
// Les positions arrivent déjà calculées (map-layout.js). Le rendu ne fait que dessiner et réagir :
// - 2D : nœuds dessinés à la main, tous les liens tracés en un seul chemin par image ;
// - 3D : tous les nœuds dans un InstancedMesh, tous les liens dans un LineSegments (2 à 4 appels de dessin
//   au lieu d'un objet Three.js par page et par lien), sélection par lancer de rayon sur les instances.
// Changer une couleur, survoler ou sélectionner ne recalcule jamais les positions.

const loaded = {};
function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Cannot load ' + src));
      document.head.append(s);
    });
  }
  return loaded[src];
}

// Ressources (images, PDF, CSS, JS…) : ce ne sont pas des pages, elles n'ont pas leur place dans les graphes.
const RESOURCE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|css|js|mjs|json|xml|txt|woff2?|ttf|eot|otf|docx?|xlsx?|pptx?|csv)$/i;
export function isPageNode(p) {
  if (!p.url.startsWith('http')) return false;
  if (p.isHtml) return true;
  try {
    if (RESOURCE_EXT.test(new URL(p.url).pathname)) return false;
  } catch {
    return false;
  }
  if (p.status >= 300 && p.status < 400) return true; // redirection : une ancienne URL de page
  if (p.status >= 200 && p.status < 300) return false; // 2xx non HTML : une ressource
  // Erreur ou absence de réponse : gardée sauf si le serveur annonce un autre type que HTML.
  return !p.contentType || /html/i.test(p.contentType);
}

// ---------- Couleurs et tailles ----------
// Deux styles : « classique » (fond blanc, sobre, pensé pour les captures montrées aux clients et managers) et
// « sombre ». Les échelles ont le même sens dans les deux ; seules les teintes sont adaptées au fond.
// Profondeur : turquoise → bleu → violet (une page profonde n'est pas « rouge », elle est simplement loin).
export const DEPTH_COLORS = ['#2dd4bf', '#38bdf8', '#3b82f6', '#6366f1', '#8b5cf6'];
export const SEV_COLORS = { error: '#ef4444', warning: '#f59e0b', notice: '#60a5fa' };
export const STATUS_COLORS = { ok: '#22c55e', redirect: '#f59e0b', client: '#ef4444', server: '#b91c1c', none: '#64748b' };
export const INDEX_COLORS = { yes: '#22c55e', no: '#94a3b8', unknown: '#475569' };
export const DIR_COLORS = ['#38bdf8', '#a78bfa', '#2dd4bf', '#f472b6', '#facc15', '#fb923c', '#4ade80', '#818cf8'];
export const UNKNOWN = '#475569';
export const NO_ISSUE = '#34d399';
const LIME = '#b4f321';
export const PALETTES = {
  dark: {
    bg: '#0b1220', depth: DEPTH_COLORS, sev: SEV_COLORS, status: STATUS_COLORS, index: INDEX_COLORS, dir: DIR_COLORS, unknown: UNKNOWN, noIssue: NO_ISSUE,
    folder: '#94a3b8', accent: LIME, inLink: '#38bdf8', outLink: LIME, treeLink: 'rgba(125,211,252,.30)', treeLink3d: '#7dd3fc', graphLink: '#94a3b8', graphLink3d: '#64748b',
    label: '#eef2f7', labelBg: 'rgba(11,18,28,.86)', labelBorder: 'rgba(167,139,250,.55)', groupRing: 'rgba(238,242,247,.7)', nodeStroke: null, legendText: '#cbd5e1', muted: '#94a3b8',
  },
  classic: {
    bg: '#ffffff', depth: ['#0f766e', '#0891b2', '#2563eb', '#7c3aed', '#c026d3'], sev: { error: '#dc2626', warning: '#d97706', notice: '#2563eb' },
    status: { ok: '#16a34a', redirect: '#d97706', client: '#dc2626', server: '#991b1b', none: '#94a3b8' }, index: { yes: '#16a34a', no: '#94a3b8', unknown: '#cbd5e1' },
    dir: ['#2563eb', '#7c3aed', '#0d9488', '#db2777', '#ca8a04', '#ea580c', '#16a34a', '#4f46e5'], unknown: '#94a3b8', noIssue: '#16a34a',
    folder: '#64748b', accent: '#ea580c', inLink: '#2563eb', outLink: '#ea580c', treeLink: '#c3ccd8', treeLink3d: '#94a3b8', graphLink: '#64748b', graphLink3d: '#94a3b8',
    label: '#1e293b', labelBg: '#ffffff', labelBorder: '#cbd5e1', groupRing: '#64748b', nodeStroke: '#ffffff', legendText: '#334155', muted: '#64748b',
  },
};
export const paletteOf = (look) => PALETTES[look] || PALETTES.classic;

const statusKey = (p) => (!p?.status ? 'none' : p.status >= 500 ? 'server' : p.status >= 400 ? 'client' : p.status >= 300 ? 'redirect' : 'ok');

export function colorOf(n, style) {
  const P = paletteOf(style.look || 'dark');
  if (n.kind === 'folder' && !n.page) return P.folder;
  if (n.kind === 'unreached') return P.unknown;
  const p = n.page;
  switch (style.colorBy) {
    case 'issues':
      return n.sev ? P.sev[n.sev] : P.noIssue;
    case 'status':
      return P.status[statusKey(p)];
    case 'index':
      return p?.indexable == null ? P.index.unknown : p.indexable ? P.index.yes : P.index.no;
    case 'dir':
      return style.dirColor?.(n) || P.unknown;
    default:
      return n.depth == null ? P.unknown : P.depth[Math.min(P.depth.length - 1, n.depth)];
  }
}

// Rayon borné : un nœud très bien lié reste lisible sans masquer ses voisins (×1 à ×2,6).
export function radiusOf(n, style) {
  if (n.group) return 4.5 + Math.min(5, Math.log2(1 + n.group));
  if (n.kind === 'folder' && !n.page) return 3.4;
  const p = n.page;
  let s = 0;
  if (style.sizeBy === 'linkScore') s = p?.linkScore == null ? 0 : Math.sqrt(p.linkScore / 100);
  else if (style.sizeBy === 'inlinks') s = Math.min(1, Math.log10(1 + (p?.uniqueInlinks || 0)) / 3);
  return 2.2 * (1 + 1.6 * s) + (n.root ? 3 : 0);
}

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`;

// Un nœud est « estompé » quand un filtre ou une sélection met d'autres nœuds en avant (le contexte reste visible).
const dimmed = (n, style) => (style.focus && !style.focus.has(n.id)) || (style.match && !style.match.has(n.id));

// ---------- Rendu ----------
export async function createMap(el, { dim, data, style, t, onHover, onClick, onReady, reducedMotion }) {
  return dim === '3d' ? create3d(el, { data, style, t, onHover, onClick, onReady, reducedMotion }) : create2d(el, { data, style, t, onHover, onClick, onReady, reducedMotion });
}

// Libellés à afficher : sélection, survol, racine, grandes branches et chemin courant ; jamais des centaines.
function labelSet(data, style, hover) {
  const ids = new Set();
  if (style.selected) ids.add(style.selected);
  if (hover) ids.add(hover);
  for (const n of data.nodes) if (n.root) ids.add(n.id);
  for (const id of style.pathIds || []) ids.add(id);
  for (const n of data.nodes) if (n.major) ids.add(n.id);
  return ids;
}
// Évite les chevauchements : un libellé moins prioritaire qui recouvrirait un autre n'est pas affiché.
function collides(boxes, b) {
  for (const o of boxes) if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) return true;
  boxes.push(b);
  return false;
}
export const labelText = (n, t) => (n.kind === 'more' && n.group === n.siblings ? n.label : n.group ? `${n.label} · ${t('map.pagesN', { n: n.group })}` : n.major && n.count ? `${n.label} · ${t('map.pagesN', { n: n.count })}` : n.label);

async function create2d(el, { data, style, t, onHover, onClick, onReady, reducedMotion }) {
  await loadScript('vendor/force-graph.min.js');
  let hover = null;
  let labels = labelSet(data, style, hover);
  const pending = [];
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const tree = data.layout === 'tree';
  const parents = new Set(data.links.map((l) => l.s));
  for (const n of data.nodes) if (data.fixed) Object.assign(n, { fx: n.x, fy: n.y });
  const g = window.ForceGraph()(el)
    .backgroundColor('rgba(0,0,0,0)')
    .width(el.clientWidth)
    .height(el.clientHeight)
    .nodeId('id')
    .nodeRelSize(1)
    .nodeVal((n) => radiusOf(n, style) ** 2)
    .nodeLabel(() => '')
    .linkVisibility(false)
    .enableNodeDrag(false)
    .autoPauseRedraw(true)
    .cooldownTicks(data.fixed ? 0 : 150)
    .cooldownTime(data.fixed ? 0 : 2500)
    .warmupTicks(0)
    .onNodeHover((n) => {
      hover = n?.id || null;
      labels = labelSet(data, style, hover);
      el.style.cursor = n ? 'pointer' : '';
      onHover?.(n || null);
    })
    .onNodeClick((n) => onClick?.(n))
    .onBackgroundClick(() => onClick?.(null))
    .nodeCanvasObject((n, ctx, scale) => {
      const P = paletteOf(style.look);
      const r = radiusOf(n, style);
      const dim_ = dimmed(n, style);
      const col = colorOf(n, style);
      ctx.globalAlpha = dim_ ? (style.look === 'classic' ? 0.22 : 0.16) : 1;
      if (n.kind === 'folder' && !n.page) {
        if (P.nodeStroke) {
          ctx.fillStyle = P.bg;
          ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4 / Math.max(0.6, scale);
        ctx.strokeRect(n.x - r, n.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (P.nodeStroke) {
          ctx.lineWidth = Math.min(0.8, 1 / scale);
          ctx.strokeStyle = P.nodeStroke;
          ctx.stroke();
        }
      }
      if (n.group) {
        ctx.lineWidth = 1 / Math.max(0.5, scale);
        ctx.strokeStyle = P.groupRing;
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 2.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Marqueur de problème (anneau) quand la couleur ne montre pas déjà les problèmes.
      if (n.sev && n.sev !== 'notice' && style.colorBy !== 'issues') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 1.6, 0, Math.PI * 2);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = P.sev[n.sev];
        ctx.stroke();
      }
      if (n.id === style.selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2 / Math.max(0.5, scale);
        ctx.strokeStyle = P.accent;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Arbre horizontal : un libellé par nœud dès que les lignes sont assez espacées à l'écran pour être lues.
      const auto = tree ? scale * ROW >= 12 : scale > 2.2 && data.nodes.length < 400;
      if (labels.has(n.id) || (auto && !dim_)) pending.push(n);
    })
    .onRenderFramePost((ctx, scale) => {
      const order = [...labels];
      pending.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9));
      const boxes = [];
      for (const n of pending) {
        const full = labelText(n, t);
        const suffix = full.startsWith(n.label) ? full.slice(n.label.length) : '';
        let text = suffix ? n.label : full;
        const r = radiusOf(n, style);
        const fs = labelSize(n, style, scale, tree);
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        // Arbre : le libellé d'un nœud qui a des enfants ne doit pas déborder sur la colonne suivante.
        // Le compteur (« · 21 pages ») est toujours gardé ; seul le chemin est raccourci.
        const room = (tree && parents.has(n.id) && n.id !== style.selected ? LEVEL - r - fs * 1.5 : fs * (tree ? 27 : 36)) - ctx.measureText(suffix).width;
        text = fitText(ctx, text, room) + suffix;
        const w = ctx.measureText(text).width + fs;
        if (collides(boxes, { x: n.x + r, y: n.y - fs * 0.6, w, h: fs * 1.25 }) && n.id !== style.selected) continue;
        drawLabel(ctx, n, text, r, scale, n.id === style.selected, style, fs);
      }
      pending.length = 0;
    })
    .onRenderFramePre((ctx, scale) => {
      const P = paletteOf(style.look);
      // Tous les liens en un seul tracé ; ceux du contexte (chemin, voisinage) par-dessus.
      const faded = style.focus || style.match;
      ctx.lineWidth = Math.max(0.35, (tree ? 1 : 0.9) / scale);
      ctx.strokeStyle = data.mode === 'links' ? rgba(P.graphLink, (faded ? 0.12 : 1) * linkAlpha(data) * 0.6) : faded ? rgba(style.look === 'classic' ? '#cbd5e1' : '#94a3b8', style.look === 'classic' ? 0.45 : 0.08) : P.treeLink;
      ctx.beginPath();
      for (const l of data.links) {
        const a = byId.get(l.s);
        const b = byId.get(l.t);
        if (a && b) segment(ctx, a, b, tree);
      }
      ctx.stroke();
      if (style.hiLinks?.length) {
        for (const [kind, col] of [['in', P.inLink], ['out', P.outLink], ['path', P.accent]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(0.8, 1.8 / scale);
          ctx.beginPath();
          for (const l of style.hiLinks) {
            if (l.kind !== kind) continue;
            const a = byId.get(l.s);
            const b = byId.get(l.t);
            if (!a || !b) continue;
            segment(ctx, a, b, tree);
            if (data.mode === 'links') arrow(ctx, a, b, radiusOf(b, style), scale);
          }
          ctx.stroke();
        }
      }
    })
    .graphData({ nodes: data.nodes, links: simLinks(data) });
  if (!data.fixed) installCluster(g, data);
  let readyDone = false;
  const ready = () => {
    if (readyDone) return;
    readyDone = true;
    fitView(reducedMotion ? 0 : 300);
    onReady?.();
  };
  // Cadrage : tout le graphe, en laissant la place de la légende (en bas) et des libellés (à droite de l'arbre).
  // Arbre très haut : on garde des lignes lisibles (≥ 9 px) plutôt que de tout réduire à des points.
  function fitView(ms) {
    const W = el.clientWidth;
    const Hh = el.clientHeight;
    if (!W || !Hh || !data.nodes.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of data.nodes) {
      x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
    }
    const legend = el.parentElement?.querySelector('.map-legend')?.offsetHeight || 0;
    const pad = { l: 40, r: tree ? 200 : 60, t: 56, b: Math.min(Hh / 3, legend + 28) };
    const aw = Math.max(80, W - pad.l - pad.r);
    const ah = Math.max(80, Hh - pad.t - pad.b);
    let z = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0), 4);
    if (tree) z = Math.max(z, 14 / ROW);
    z = Math.max(0.02, z);
    const over = (x1 - x0) * z > aw;
    const cx = over ? x0 + (W / 2 - pad.l) / z : (x0 + x1) / 2 - (pad.l + aw / 2 - W / 2) / z;
    const root = data.nodes.find((x) => x.root);
    const cy = (y1 - y0) * z > ah && root ? root.y : (y0 + y1) / 2 - (pad.t + ah / 2 - Hh / 2) / z;
    g.zoom(z, ms);
    g.centerAt(cx, cy, ms);
  }
  if (data.fixed) requestAnimationFrame(ready);
  else g.onEngineStop(ready);
  const ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
  ro.observe(el);
  const dur = reducedMotion ? 0 : 450;
  return {
    graph: g,
    positions: () => new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y, z: 0 }])),
    setStyle(next) {
      Object.assign(style, next);
      labels = labelSet(data, style, hover);
      g.nodeVal(g.nodeVal());
    },
    focus(id) {
      const n = byId.get(id);
      if (!n) return;
      // Arbre horizontal : on recadre sur la page sans trop zoomer, pour garder ses voisins et leurs libellés lisibles.
      g.centerAt(tree ? n.x + 140 : n.x, n.y, dur);
      g.zoom(tree ? Math.min(1.4, Math.max(g.zoom(), 1)) : Math.max(g.zoom(), 2.4), dur);
    },
    fit: () => fitView(dur),
    zoomBy: (f) => g.zoom(g.zoom() * f, reducedMotion ? 0 : 200),
    canvas: () => el.querySelector('canvas'),
    // Le canvas 2D contient déjà les libellés : l'export n'a qu'à recopier l'image.
    overlayLabels: () => [],
    destroy() {
      ro.disconnect();
      // La bibliothèque garde des écouteurs internes : on coupe toutes nos références (fonctions, données) pour
      // que l'audit précédent puisse être libéré même si son instance n'est pas entièrement détruite.
      try {
        g.onNodeHover(null).onNodeClick(null).onBackgroundClick(null).onEngineStop(() => {}).onRenderFramePre(null).onRenderFramePost(null).nodeCanvasObject(null).nodeVal(1);
        g._destructor?.();
      } catch { /* déjà détruit */ }
      release(data, byId, pending);
      el.innerHTML = '';
    },
  };
}

function release(data, byId, extra) {
  data.nodes.length = 0;
  data.links.length = 0;
  byId?.clear?.();
  if (Array.isArray(extra)) extra.length = 0;
  for (const k of ['tree', 'stats']) delete data[k];
}

const ROW = 20; // espacement des lignes de l'arbre horizontal (identique à hierTree)
const LEVEL = 300; // espacement des colonnes (identique à hierTree)
// Tronque un texte (avec « … ») pour qu'il tienne dans une largeur donnée, en unités du canvas.
// Pour un chemin d'URL, l'ellipse va au milieu (« /catalogue/…/fiction_10/index.html ») : la fin distingue une page
// de ses voisines, le premier segment situe la section ; le milieu est commun à toute la branche.
function fitText(ctx, text, max) {
  const fits = (x) => ctx.measureText(x).width <= max;
  if (fits(text)) return text;
  const head = text.startsWith('/') ? text.slice(0, text.indexOf('/', 1) + 1 || 1) : '';
  const tailMax = text.length - head.length;
  let lo = 0;
  let hi = tailMax;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(head + '…' + text.slice(text.length - mid))) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= 6) return head + '…' + text.slice(text.length - lo);
  // Très peu de place : début du texte seulement.
  lo = 0;
  hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(text.slice(0, mid) + '…')) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, Math.max(1, lo)) + '…';
}
function labelSize(n, style, scale, tree) {
  const px = n.id === style.selected ? 13 : 11.5;
  const fs = px / scale;
  return tree ? Math.min(fs, ROW * 0.7) : Math.max(3.2, fs);
}
// Liens : segment droit (radial, maillage) ou courbe en S de gauche à droite (arbre horizontal).
function segment(ctx, a, b, tree) {
  ctx.moveTo(a.x, a.y);
  if (!tree) return ctx.lineTo(b.x, b.y);
  const mx = (a.x + b.x) / 2;
  ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
}

function drawLabel(ctx, n, text, r, scale, strong, style, fs) {
  const P = paletteOf(style.look);
  ctx.font = `${strong ? 700 : 600} ${fs}px Inter, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  const pad = fs * 0.45;
  const x = n.x + r + fs * 0.5;
  const y = n.y - fs * 0.62;
  ctx.textBaseline = 'top';
  if (style.look === 'classic' && !strong) {
    // Style classique : texte foncé détouré de blanc, sans cartouche (lisible sur les liens, sobre en capture).
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.32;
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = dimmed(n, style) ? P.muted : P.label;
    ctx.fillText(text, x, y);
    return;
  }
  ctx.fillStyle = P.labelBg;
  ctx.strokeStyle = strong ? P.accent : P.labelBorder;
  ctx.lineWidth = Math.max(0.3, (strong ? 1.6 : 1) / scale);
  roundRect(ctx, x - pad, y - pad * 0.5, w + pad * 2, fs * 1.24 + pad * 0.5, fs * 0.35);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.label;
  ctx.fillText(text, x, y);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function arrow(ctx, a, b, rb, scale) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = Math.max(2, 5 / scale);
  const tx = b.x - Math.cos(ang) * (rb + 1);
  const ty = b.y - Math.sin(ang) * (rb + 1);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - L * Math.cos(ang - 0.4), ty - L * Math.sin(ang - 0.4));
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - L * Math.cos(ang + 0.4), ty - L * Math.sin(ang + 0.4));
}

// Opacité des liens selon leur nombre : un maillage dense reste lisible (le voisinage sélectionné est redessiné à part).
const linkAlpha = (data) => (data.mode === 'links' ? Math.max(0.05, Math.min(0.5, 900 / Math.max(1, data.links.length))) : 0.55);

// Liens donnés au moteur uniquement quand il simule (maillage) ; le dessin utilise data.links.
const simLinks = (data) => (data.fixed ? [] : data.links.map((l) => ({ source: l.s, target: l.t })));

// Maillage : une force légère ramène chaque page vers sa position de départ (son répertoire), ce qui limite
// l'enchevêtrement sans créer de lien ; le reste vient des liens réellement observés.
function installCluster(g, data) {
  const seed = new Map(data.nodes.map((n) => [n.id, { x: n.x, y: n.y, z: n.z || 0 }]));
  let nodes = [];
  const force = (alpha) => {
    for (const n of nodes) {
      const s = seed.get(n.id);
      if (!s) continue;
      n.vx += (s.x - n.x) * 0.14 * alpha;
      n.vy += (s.y - n.y) * 0.14 * alpha;
      if (n.vz != null) n.vz += (s.z - n.z) * 0.14 * alpha;
    }
  };
  force.initialize = (ns) => (nodes = ns);
  g.d3Force('cluster', force);
  g.d3Force('charge')?.strength(-14).distanceMax(160);
  g.d3Force('link')?.distance(30).strength(0.03);
  g.d3Force('center', null);
}

async function create3d(el, { data, style, t, onHover, onClick, onReady, reducedMotion }) {
  // Three.js en module : 3d-force-graph utilise window.THREE s'il existe, on partage donc une seule instance.
  const THREE = window.THREE || (window.THREE = { ...(await import('./vendor/three.module.js')) });
  await loadScript('vendor/3d-force-graph.min.js');
  const n = data.nodes.length;
  const byId = new Map(data.nodes.map((x, i) => [x.id, i]));
  for (const x of data.nodes) if (data.fixed) Object.assign(x, { fx: x.x, fy: x.y, fz: x.z });
  const g = window.ForceGraph3D({ controlType: 'orbit', rendererConfig: { antialias: n < 1200, preserveDrawingBuffer: true, powerPreference: 'high-performance' } })(el)
    .backgroundColor('rgba(0,0,0,0)')
    .width(el.clientWidth)
    .height(el.clientHeight)
    .showNavInfo(false)
    .nodeVisibility(false)
    .linkVisibility(false)
    .enableNodeDrag(false)
    .enablePointerInteraction(false)
    .cooldownTicks(data.fixed ? 0 : 120)
    .cooldownTime(data.fixed ? 0 : 2500)
    .warmupTicks(0)
    .graphData({ nodes: data.nodes, links: simLinks(data) });
  g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, n > 3000 ? 1 : 1.5));
  const scene = g.scene();
  // Rendu à la demande : la boucle de 3d-force-graph continue (contrôles et transitions restent actifs), mais l'image
  // n'est recalculée que si quelque chose a changé (caméra, données, sélection, taille). Au repos : aucun dessin.
  // On enveloppe le compositeur entier (il efface l'image avant de la redessiner) : sauter seulement le rendu
  // laisserait un écran vide.
  const renderer = g.renderer();
  const composer = g.postProcessingComposer();
  const rawCompose = composer.render.bind(composer);
  let dirtyUntil = performance.now() + 1500;
  const invalidate = (ms = 120) => (dirtyUntil = Math.max(dirtyUntil, performance.now() + ms));
  composer.render = (...args) => {
    if (performance.now() <= dirtyUntil) rawCompose(...args);
  };
  const rawRender = () => rawCompose();
  // Nœuds : un seul objet Points (un sommet par page) dessiné comme une petite sphère ombrée par le shader.
  // Mesuré : des sphères maillées coûtent ~10× plus cher à dessiner sans carte graphique, pour un rendu équivalent.
  const nodePos = new Float32Array(n * 3);
  const nodeCol = new Float32Array(n * 3);
  const nodeSize = new Float32Array(n);
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
  nodeGeo.setAttribute('size', new THREE.BufferAttribute(nodeSize, 1));
  const uniforms = { uScale: { value: 1 } };
  const VERT = `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
    void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(2.0, size * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`;
  const nodeMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: `varying vec3 vColor; void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard;
      float z = sqrt(1.0 - r); float light = 0.45 + 0.55 * clamp(dot(vec3(c.x, -c.y, z), normalize(vec3(-0.4, 0.5, 0.75))), 0.0, 1.0);
      gl_FragColor = vec4(vColor * light + vec3(0.12) * pow(z, 12.0), 1.0); }`,
  });
  const points = new THREE.Points(nodeGeo, nodeMat);
  scene.add(points);
  // Anneaux des problèmes (erreurs et avertissements) : même principe, un anneau par page concernée.
  const haloIdx = [];
  const haloGeo = new THREE.BufferGeometry();
  const haloMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: `varying vec3 vColor; void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c); if (r > 1.0 || r < 0.8) discard; gl_FragColor = vec4(vColor, 1.0); }`,
    depthWrite: false,
  });
  const halo = new THREE.Points(haloGeo, haloMat);
  scene.add(halo);
  const setScale = () => {
    const cam = g.camera();
    uniforms.uScale.value = (el.clientHeight * g.renderer().getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360));
  };
  setScale();
  // Liens : un seul LineSegments ; couleurs par sommet pour estomper sans reconstruire.
  const linkGeo = new THREE.BufferGeometry();
  const linkPos = new Float32Array(data.links.length * 6);
  const linkCol = new Float32Array(data.links.length * 6);
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkCol, 3));
  const lines = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: linkAlpha(data), depthWrite: false }));
  scene.add(lines);
  const hiGeo = new THREE.BufferGeometry();
  const hiLines = new THREE.LineSegments(hiGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 }));
  scene.add(hiLines);
  // Marqueur de sélection : un anneau qui fait face à la caméra.
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 40), new THREE.MeshBasicMaterial({ color: paletteOf(style.look).accent, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }));
  ring.visible = false;
  scene.add(ring);
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  const BG = new THREE.Color(paletteOf(style.look).bg);

  function writeNodes() {
    for (let i = 0; i < n; i++) {
      const x = data.nodes[i];
      nodePos[i * 3] = x.x || 0;
      nodePos[i * 3 + 1] = x.y || 0;
      nodePos[i * 3 + 2] = x.z || 0;
      nodeSize[i] = radiusOf(x, style) * 2.6;
    }
    nodeGeo.attributes.position.needsUpdate = true;
    nodeGeo.attributes.size.needsUpdate = true;
    nodeGeo.computeBoundingSphere();
    if (haloIdx.length) {
      const hp = haloGeo.attributes.position.array;
      const hs = haloGeo.attributes.size.array;
      haloIdx.forEach((i, k) => {
        const x = data.nodes[i];
        hp.set([x.x || 0, x.y || 0, x.z || 0], k * 3);
        hs[k] = radiusOf(x, style) * 2.6 * 1.55;
      });
      haloGeo.attributes.position.needsUpdate = true;
      haloGeo.attributes.size.needsUpdate = true;
      haloGeo.computeBoundingSphere();
    }
    for (let k = 0; k < data.links.length; k++) {
      const a = data.nodes[byId.get(data.links[k].s)];
      const b = data.nodes[byId.get(data.links[k].t)];
      if (!a || !b) continue;
      linkPos.set([a.x || 0, a.y || 0, a.z || 0, b.x || 0, b.y || 0, b.z || 0], k * 6);
    }
    linkGeo.attributes.position.needsUpdate = true;
    linkGeo.computeBoundingSphere();
    placeRing();
  }
  function writeColors() {
    const anyDim = !!(style.focus || style.match);
    for (let i = 0; i < n; i++) {
      const x = data.nodes[i];
      col.set(colorOf(x, style));
      if (dimmed(x, style)) col.lerp(BG, 0.82);
      nodeCol.set([col.r, col.g, col.b], i * 3);
    }
    nodeGeo.attributes.color.needsUpdate = true;
    // Anneaux : reconstruits quand la couleur ou la sélection change (quand la couleur montre déjà les problèmes, aucun anneau).
    haloIdx.length = 0;
    if (style.colorBy !== 'issues') data.nodes.forEach((x, i) => x.sev && x.sev !== 'notice' && haloIdx.push(i));
    haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(haloIdx.length * 3), 3));
    haloGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(haloIdx.length), 1));
    const hcol = new Float32Array(haloIdx.length * 3);
    haloIdx.forEach((i, k) => {
      col.set(paletteOf(style.look).sev[data.nodes[i].sev]);
      if (dimmed(data.nodes[i], style)) col.lerp(BG, 0.85);
      hcol.set([col.r, col.g, col.b], k * 3);
    });
    haloGeo.setAttribute('color', new THREE.BufferAttribute(hcol, 3));
    const P = paletteOf(style.look);
    BG.set(P.bg);
    const base = new THREE.Color(data.mode === 'links' ? P.graphLink3d : P.treeLink3d);
    if (anyDim) base.lerp(BG, 0.75);
    for (let k = 0; k < data.links.length; k++) for (let j = 0; j < 2; j++) linkCol.set([base.r, base.g, base.b], k * 6 + j * 3);
    linkGeo.attributes.color.needsUpdate = true;
    // Liens du contexte (chemin, voisinage) dans leur propre lot, au-dessus.
    const hl = style.hiLinks || [];
    const hp = new Float32Array(hl.length * 6);
    const hc = new Float32Array(hl.length * 6);
    hl.forEach((l, k) => {
      const a = data.nodes[byId.get(l.s)];
      const b = data.nodes[byId.get(l.t)];
      if (!a || !b) return;
      hp.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
      col.set(l.kind === 'in' ? P.inLink : l.kind === 'out' ? P.outLink : P.accent);
      hc.set([col.r, col.g, col.b, col.r, col.g, col.b], k * 6);
    });
    hiGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hiGeo.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    hiGeo.computeBoundingSphere();
    writeNodes();
  }
  function placeRing() {
    const i = byId.get(style.selected);
    ring.visible = i != null;
    if (i == null) return;
    const x = data.nodes[i];
    const r = radiusOf(x, style) * 1.7;
    ring.position.set(x.x || 0, x.y || 0, x.z || 0);
    ring.scale.set(r, r, r);
    ring.quaternion.copy(g.camera().quaternion);
  }
  writeColors();

  // Libellés HTML au-dessus du canvas, recalculés quand la caméra bouge (limités à quelques dizaines).
  const layer = document.createElement('div');
  layer.className = 'map-labels';
  el.append(layer);
  let hover = null;
  let labelIds = labelSet(data, style, hover);
  let raf = 0;
  const placed = [];
  function drawLabels() {
    raf = 0;
    placeRing();
    const cam = g.camera();
    const w = el.clientWidth;
    const h = el.clientHeight;
    const frag = document.createDocumentFragment();
    placed.length = 0;
    const boxes = [];
    for (const id of labelIds) {
      const i = byId.get(id);
      if (i == null) continue;
      const x = data.nodes[i];
      v.set(x.x || 0, x.y || 0, x.z || 0).project(cam);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      if (sx < -50 || sy < -20 || sx > w + 50 || sy > h + 20) continue;
      const text = labelText(x, t);
      if (collides(boxes, { x: sx + 10, y: sy - 12, w: Math.min(260, text.length * 7.2 + 20), h: 24 }) && id !== style.selected) continue;
      const d = document.createElement('div');
      d.className = 'map-label' + (id === style.selected ? ' sel' : '') + (dimmed(x, style) ? ' dim' : '');
      d.textContent = text;
      d.style.transform = `translate(${Math.round(sx + 10)}px, ${Math.round(sy - 12)}px)`;
      frag.append(d);
      placed.push({ text: d.textContent, x: sx + 10, y: sy - 12, sel: id === style.selected });
    }
    layer.replaceChildren(frag);
  }
  const schedule = () => (invalidate(), (raf ||= requestAnimationFrame(drawLabels)));
  const ctrlListeners = [['change', schedule]];
  // Maillage très dense : les liens sont masqués le temps d'une rotation, puis réaffichés à l'arrêt.
  if (data.links.length > 3000) {
    ctrlListeners.push(['start', () => ((lines.visible = false), invalidate())], ['end', () => ((lines.visible = true), invalidate(200))]);
  }
  for (const [ev, fn] of ctrlListeners) g.controls().addEventListener(ev, fn);
  if (!data.fixed) {
    installCluster(g, data);
    g.onEngineTick(() => {
      writeNodes();
      invalidate();
      schedule();
    });
  }

  // Sélection par lancer de rayon sur les instances (aucun objet par nœud à parcourir).
  // Sélection : projection des nœuds à l'écran (au plus quelques milliers), le plus proche de la caméra l'emporte.
  const canvas = g.renderer().domElement;
  let down = null;
  let moveRaf = 0;
  let lastEv = null;
  const pick = (ev) => {
    const b = canvas.getBoundingClientRect();
    const mx = ev.clientX - b.left;
    const my = ev.clientY - b.top;
    const cam = g.camera();
    const scalePx = uniforms.uScale.value / g.renderer().getPixelRatio();
    let best = null;
    let bestZ = Infinity;
    for (let i = 0; i < n; i++) {
      const x = data.nodes[i];
      v.set(x.x || 0, x.y || 0, x.z || 0).applyMatrix4(cam.matrixWorldInverse);
      const depth = -v.z;
      if (depth <= 0) continue;
      v.applyMatrix4(cam.projectionMatrix);
      const sx = (v.x * 0.5 + 0.5) * b.width;
      const sy = (-v.y * 0.5 + 0.5) * b.height;
      const rpx = Math.max(4, (radiusOf(x, style) * 1.3 * scalePx) / depth) + 2;
      if ((sx - mx) ** 2 + (sy - my) ** 2 <= rpx * rpx && depth < bestZ) {
        best = x;
        bestZ = depth;
      }
    }
    return best;
  };
  const onMove = (ev) => {
    lastEv = ev;
    if (moveRaf || down) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      const x = pick(lastEv);
      if ((x?.id || null) === hover) return;
      hover = x?.id || null;
      canvas.style.cursor = x ? 'pointer' : '';
      labelIds = labelSet(data, style, hover);
      schedule();
      onHover?.(x, lastEv);
    });
  };
  const onDown = (ev) => (down = { x: ev.clientX, y: ev.clientY });
  const onUp = (ev) => {
    if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) onClick?.(pick(ev));
    down = null;
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => onHover?.(null));

  const fitAll = (ms) => {
    invalidate(ms + 200);
    g.zoomToFit(ms, 40);
    setTimeout(schedule, ms + 30);
  };
  let readyDone = false;
  const ready = () => {
    if (readyDone) return;
    readyDone = true;
    // Vue de départ légèrement inclinée : la profondeur se lit sans tourner la scène.
    const r = Math.max(200, ...data.nodes.map((x) => Math.hypot(x.x || 0, x.y || 0, x.z || 0))) * 1.9;
    g.cameraPosition({ x: 0, y: -r * 0.32, z: r * 0.95 }, { x: 0, y: 0, z: 0 }, 0);
    schedule();
    onReady?.();
  };
  if (data.fixed) requestAnimationFrame(ready);
  else g.onEngineStop(() => (ready(), schedule()));
  const ro = new ResizeObserver(() => (g.width(el.clientWidth).height(el.clientHeight), setScale(), schedule()));
  ro.observe(el);
  const dur = reducedMotion ? 0 : 600;
  return {
    graph: g,
    positions: () => new Map(data.nodes.map((x) => [x.id, { x: x.x, y: x.y, z: x.z }])),
    setStyle(next) {
      Object.assign(style, next);
      labelIds = labelSet(data, style, hover);
      writeColors();
      schedule();
    },
    focus(id) {
      const i = byId.get(id);
      if (i == null) return;
      const x = data.nodes[i];
      const cam = g.camera().position;
      const dir = new THREE.Vector3(cam.x - x.x, cam.y - x.y, cam.z - x.z).normalize().multiplyScalar(data.mode === 'links' ? 420 : 300);
      invalidate(dur + 200);
      g.cameraPosition({ x: x.x + dir.x, y: x.y + dir.y, z: x.z + dir.z }, { x: x.x, y: x.y, z: x.z }, dur);
      setTimeout(schedule, dur + 30);
    },
    fit: () => fitAll(dur),
    zoomBy(f) {
      const c = g.controls();
      const cam = g.camera().position;
      const tg = c.target;
      invalidate(400);
      g.cameraPosition({ x: tg.x + (cam.x - tg.x) / f, y: tg.y + (cam.y - tg.y) / f, z: tg.z + (cam.z - tg.z) / f }, tg, reducedMotion ? 0 : 200);
      setTimeout(schedule, 230);
    },
    canvas: () => (rawRender(), canvas),
    overlayLabels: () => placed.slice(),
    destroy() {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      for (const o of [points, halo, lines, hiLines, ring]) scene.remove(o);
      for (const r of [nodeGeo, nodeMat, haloGeo, haloMat, linkGeo, lines.material, hiGeo, hiLines.material, ring.geometry, ring.material]) r.dispose();
      for (const [ev, fn] of ctrlListeners) g.controls().removeEventListener(ev, fn);
      try {
        g.onEngineTick(() => {}).onEngineStop(() => {});
        g._destructor?.();
        composer.render = rawCompose;
        renderer.dispose();
        renderer.forceContextLoss?.();
      } catch { /* déjà détruit */ }
      release(data, byId);
      el.innerHTML = '';
    },
  };
}

export { rgba };
