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

// Problèmes qui touchent chaque URL (gravité la plus élevée en premier).
function issuesByUrl(R) {
  const order = { error: 0, warning: 1, notice: 2 };
  const m = new Map();
  for (const is of R.issues) {
    for (const it of is.items) {
      if (!m.has(it.url)) m.set(it.url, []);
      m.get(it.url).push({ id: is.id, severity: is.severity, params: is.params });
    }
  }
  for (const list of m.values()) list.sort((a, b) => order[a.severity] - order[b.severity]);
  return m;
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

// Taille d'un nœud selon le critère choisi (rayon ∝ racine de val).
const SIZE = {
  linkScore: (p) => 1 + (p.linkScore || 0) / 12,
  weight: (p) => 1 + Math.min(40, (p.size || 0) / 25000),
  inlinks: (p) => 1 + Math.min(40, (p.uniqueInlinks || 0) / 3),
  responseTime: (p) => 1 + Math.min(40, (p.responseTime || 0) / 150),
};

function pickPages(R, maxNodes) {
  const home = R.meta.finalStart || R.meta.startUrl;
  const pages = R.pages.filter(isPageNode);
  if (pages.length <= maxNodes) return pages;
  // On garde les pages les plus importantes (Link Score, puis faible profondeur).
  const sorted = [...pages].sort((a, b) => (b.url === home) - (a.url === home) || (b.linkScore || 0) - (a.linkScore || 0) || (a.depth ?? 99) - (b.depth ?? 99));
  return sorted.slice(0, maxNodes);
}

// Construit les nœuds et liens pour la vue demandée.
export function buildGraph(R, graph, { view, colorBy, maxNodes, sizeBy = 'linkScore' }) {
  const pages = pickPages(R, maxNodes);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const issues = issuesByUrl(R);
  const sizeOf = SIZE[sizeBy] || SIZE.linkScore;
  const resources = R.pages.filter((p) => p.url.startsWith('http') && !isPageNode(p)).length;
  const maxDepth = Math.max(1, ...pages.map((p) => p.depth ?? 0));
  const color = (p) => {
    if (!p) return PALETTE.folder;
    if (colorBy === 'depth') return depthColor(p.depth, maxDepth);
    if (colorBy === 'issues') return { error: PALETTE.sevError, warning: PALETTE.sevWarning, notice: PALETTE.sevNotice }[issues.get(p.url)?.[0]?.severity] || PALETTE.sevNone;
    return statusColor(p);
  };
  const pageNode = (p) => ({ id: p.url, url: p.url, page: p, val: sizeOf(p), color: color(p), label: p.url, issues: issues.get(p.url) || [] });
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
    return { nodes, links, truncated: R.pages.length - resources > pages.length, resources };
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
    return { nodes, links, truncated: R.pages.length - resources > pages.length, resources };
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
  if (homePage) Object.assign(nodes[0], { page: homePage, url: homePage.url, color: color(homePage), val: Math.max(6, sizeOf(homePage)), issues: issues.get(homePage.url) || [] });
  return { nodes, links, truncated: R.pages.length - resources > pages.length, resources };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Affiche le graphe dans le conteneur. Renvoie une fonction de nettoyage.
export async function renderGraph(el, data, { view, dim, t, onSelect }) {
  const is3d = dim === '3d';
  await loadScript(is3d ? 'vendor/3d-force-graph.min.js' : 'vendor/force-graph.min.js');
  const Factory = is3d ? window.ForceGraph3D : window.ForceGraph;
  const bg = css('--panel') || '#ffffff';
  // Traits assez contrastés pour suivre l'arborescence, sans masquer les nœuds.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const linkCol = is3d ? (dark ? '#a9b2c3' : '#5b6578') : dark ? 'rgba(200,208,222,.42)' : 'rgba(70,80,100,.38)';
  const label = (n) => {
    const p = n.page;
    if (!p) return `<div class="gtip"><b>${esc(n.label)}</b>${n.count ? `<br>${esc(t('viz.children', { n: n.count }))}` : ''}</div>`;
    const kb = p.size ? ` · ${esc(t('col.size'))} ${Math.round(p.size / 1024)} KB` : '';
    const iss = n.issues?.length
      ? `<br><span class="gtip-issues">${esc(t('viz.issuesCount', { n: n.issues.length }))} : ${n.issues.slice(0, 3).map((i) => esc(t('issue.' + i.id + '.label', i.params))).join(' · ')}${n.issues.length > 3 ? ' …' : ''}</span>`
      : '';
    return `<div class="gtip"><b>${esc(p.url)}</b>${p.title ? `<br>${esc(p.title)}` : ''}<br>${esc(t('col.status'))} ${p.status || '—'} · ${esc(t('col.depth'))} ${p.depth ?? '—'} · Link Score ${p.linkScore ?? 0} · ${esc(t('col.inlinks'))} ${p.uniqueInlinks ?? 0}${kb}${iss}</div>`;
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
    .onNodeClick((n) => n.url && onSelect(n.url, n))
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
    g.nodeOpacity(0.95).linkOpacity(0.55).linkWidth(0.7).nodeRelSize(data.nodes.length > 400 ? 3 : 4);
  } else {
    const n = data.nodes.length;
    g.linkWidth(n > 1500 ? 0.7 : 1.1).nodeRelSize(n > 1500 ? 1.6 : n > 400 ? 2.2 : n > 100 ? 3 : 4);
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
