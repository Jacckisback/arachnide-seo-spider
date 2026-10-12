// Visualisations du site : arbre de crawl, arbre des répertoires et graphe des liens, en 2D ou en 3D.
// Les bibliothèques (force-graph, 3d-force-graph) sont servies en local par le serveur et chargées à la demande.

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

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const PALETTE = {
  indexable: '#22a35a',
  nonIndexable: '#8a93a6',
  redirect: '#e0a000',
  error: '#e5484d',
  blocked: '#8e4ec6',
  folder: '#4f7fd9',
  root: '#4f7f17',
  sevError: '#e5484d',
  sevWarning: '#e0a000',
  sevNotice: '#3b82f6',
  sevNone: '#22a35a',
};

function statusColor(p) {
  if (!p) return PALETTE.folder;
  if (p.blockedByRobots) return PALETTE.blocked;
  if (!p.status || p.status >= 400) return PALETTE.error;
  if (p.status >= 300) return PALETTE.redirect;
  return p.indexable ? PALETTE.indexable : PALETTE.nonIndexable;
}

function depthColor(d, max) {
  if (d == null) return PALETTE.nonIndexable;
  const t = max ? Math.min(1, d / max) : 0;
  const h = 130 - t * 130; // vert → rouge
  return `hsl(${h} 65% 45%)`;
}

// Gravité la plus élevée des problèmes qui touchent chaque URL.
function severityMap(R) {
  const order = { error: 0, warning: 1, notice: 2 };
  const m = new Map();
  for (const is of R.issues) {
    for (const it of is.items) {
      const prev = m.get(it.url);
      if (prev === undefined || order[is.severity] < order[prev]) m.set(it.url, is.severity);
    }
  }
  return m;
}

function pickPages(R, maxNodes) {
  const home = R.meta.finalStart || R.meta.startUrl;
  const pages = R.pages.filter((p) => p.url.startsWith('http'));
  if (pages.length <= maxNodes) return pages;
  // On garde les pages les plus importantes (Link Score, puis faible profondeur).
  const sorted = [...pages].sort((a, b) => (b.url === home) - (a.url === home) || (b.linkScore || 0) - (a.linkScore || 0) || (a.depth ?? 99) - (b.depth ?? 99));
  return sorted.slice(0, maxNodes);
}

// Construit les nœuds et liens pour la vue demandée.
export function buildGraph(R, graph, { view, colorBy, maxNodes }) {
  const pages = pickPages(R, maxNodes);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const sev = colorBy === 'issues' ? severityMap(R) : null;
  const maxDepth = Math.max(1, ...pages.map((p) => p.depth ?? 0));
  const color = (p) => {
    if (!p) return PALETTE.folder;
    if (colorBy === 'depth') return depthColor(p.depth, maxDepth);
    if (colorBy === 'issues') return { error: PALETTE.sevError, warning: PALETTE.sevWarning, notice: PALETTE.sevNotice }[sev.get(p.url)] || PALETTE.sevNone;
    return statusColor(p);
  };
  const pageNode = (p) => ({ id: p.url, url: p.url, page: p, val: 1 + (p.linkScore || 0) / 12, color: color(p), label: p.url });
  const nodes = [];
  const links = [];
  const home = R.meta.finalStart || R.meta.startUrl;

  if (view === 'links') {
    for (const p of pages) nodes.push(pageNode(p));
    const seen = new Set();
    for (const [from, outs] of graph.out) {
      if (!byUrl.has(from)) continue;
      for (const e of outs) {
        if (!e.internal || e.nofollow || e.to === from || !byUrl.has(e.to)) continue;
        const k = from + '\u0000' + e.to;
        if (seen.has(k)) continue;
        seen.add(k);
        links.push({ source: from, target: e.to });
        if (links.length >= 8000) break;
      }
    }
    return { nodes, links, truncated: R.pages.length > pages.length };
  }

  if (view === 'crawl') {
    // Arbre de crawl : chaque page est reliée à une page qui la lie au niveau de profondeur précédent.
    for (const p of pages) nodes.push(pageNode(p));
    for (const p of pages) {
      if (!p.depth) continue;
      const parents = (graph.inl.get(p.url) || [])
        .filter((e) => !e.nofollow && byUrl.has(e.from) && byUrl.get(e.from).depth === p.depth - 1)
        .map((e) => byUrl.get(e.from));
      let parent = parents.sort((a, b) => (b.linkScore || 0) - (a.linkScore || 0))[0];
      // Redirections : la cible est reliée à l'URL qui redirige.
      if (!parent) parent = pages.find((x) => x.redirectUrl && (x.finalUrl === p.url || x.redirectUrl === p.url) && x.depth === p.depth);
      if (parent && parent.url !== p.url) links.push({ source: parent.url, target: p.url });
      else if (byUrl.has(home) && p.url !== home) links.push({ source: home, target: p.url, orphan: true });
    }
    return { nodes, links, truncated: R.pages.length > pages.length };
  }

  // Arbre des répertoires : un nœud par dossier de l'URL, les pages en feuilles.
  const folders = new Map();
  const rootId = 'root:' + new URL(home).origin;
  nodes.push({ id: rootId, label: new URL(home).host, val: 6, color: PALETTE.root, folder: true });
  folders.set(rootId, true);
  const homePage = byUrl.get(home);
  for (const p of pages) {
    const u = new URL(p.url);
    const segs = u.pathname.split('/').filter(Boolean);
    const isDir = u.pathname.endsWith('/');
    let parent = u.origin === new URL(home).origin ? rootId : 'root:' + u.origin;
    if (!folders.has(parent)) {
      folders.set(parent, true);
      nodes.push({ id: parent, label: u.host, val: 4, color: PALETTE.root, folder: true });
      links.push({ source: rootId, target: parent });
    }
    const dirSegs = isDir ? segs.slice(0, -1) : segs.slice(0, -1);
    let path = u.origin + '/';
    for (const s of dirSegs) {
      path += s + '/';
      const id = 'dir:' + path;
      if (!folders.has(id)) {
        folders.set(id, true);
        nodes.push({ id, label: path, val: 2, color: PALETTE.folder, folder: true, count: 0 });
        links.push({ source: parent, target: id });
      }
      parent = id;
    }
    if (p === homePage) continue;
    nodes.push(pageNode(p));
    links.push({ source: parent, target: p.url });
  }
  for (const n of nodes) if (n.folder && n.id.startsWith('dir:')) n.count = links.filter((l) => l.source === n.id).length;
  if (homePage) Object.assign(nodes[0], { page: homePage, url: homePage.url, color: color(homePage), val: 6 });
  return { nodes, links, truncated: R.pages.length > pages.length };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Affiche le graphe dans le conteneur. Renvoie une fonction de nettoyage.
export async function renderGraph(el, data, { view, dim, t, onSelect }) {
  const is3d = dim === '3d';
  await loadScript(is3d ? 'vendor/3d-force-graph.min.js' : 'vendor/force-graph.min.js');
  const Factory = is3d ? window.ForceGraph3D : window.ForceGraph;
  const bg = css('--panel') || '#ffffff';
  const linkCol = css('--line') || '#d0d4dc';
  const label = (n) => {
    const p = n.page;
    if (!p) return `<div class="gtip"><b>${esc(n.label)}</b>${n.count ? `<br>${esc(t('viz.children', { n: n.count }))}` : ''}</div>`;
    return `<div class="gtip"><b>${esc(p.url)}</b>${p.title ? `<br>${esc(p.title)}` : ''}<br>${esc(t('col.status'))} ${p.status || '—'} · ${esc(t('col.depth'))} ${p.depth ?? '—'} · Link Score ${p.linkScore ?? 0} · ${esc(t('col.inlinks'))} ${p.uniqueInlinks ?? 0}</div>`;
  };
  const tree = view !== 'links';
  const g = Factory(is3d ? { rendererConfig: { preserveDrawingBuffer: true, antialias: true } } : undefined)(el)
    .backgroundColor(bg)
    .width(el.clientWidth)
    .height(el.clientHeight)
    .graphData(data)
    .nodeId('id')
    .nodeVal('val')
    .nodeColor('color')
    .nodeLabel(label)
    .linkColor((l) => (l.orphan ? 'rgba(229,72,77,.35)' : linkCol))
    .onNodeClick((n) => n.url && onSelect(n.url))
    .cooldownTicks(tree ? 200 : 120)
    .cooldownTime(4000)
    .warmupTicks(tree ? 30 : 10);
  if (tree) {
    g.dagMode('radialout').dagLevelDistance(view === 'dir' ? 45 : 60).onDagError(() => {});
    g.d3Force('charge')?.strength(-40);
  } else {
    g.d3Force('charge')?.strength(-30);
  }
  if (is3d) {
    g.nodeOpacity(0.95).linkOpacity(0.35).linkWidth(0.4).nodeRelSize(data.nodes.length > 400 ? 3 : 4);
  } else {
    const n = data.nodes.length;
    g.linkWidth(0.6).nodeRelSize(n > 1500 ? 1.6 : n > 400 ? 2.2 : n > 100 ? 3 : 4);
    if (!tree) g.linkDirectionalArrowLength(2.5).linkDirectionalArrowRelPos(1);
  }
  // Cadrage : une première fois pendant la mise en place, puis quand la simulation s'arrête.
  let fitted = false;
  const early = setTimeout(() => g.zoomToFit(400, 40), 900);
  g.onEngineStop(() => {
    if (!fitted) {
      fitted = true;
      g.zoomToFit(500, 40);
    }
  });
  const ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
  ro.observe(el);
  return {
    graph: g,
    png: () => (is3d ? g.renderer().domElement : el.querySelector('canvas'))?.toDataURL('image/png'),
    destroy: () => {
      clearTimeout(early);
      ro.disconnect();
      try {
        g.pauseAnimation?.();
        g._destructor?.();
      } catch { /* déjà détruit */ }
      el.innerHTML = '';
    },
  };
}
