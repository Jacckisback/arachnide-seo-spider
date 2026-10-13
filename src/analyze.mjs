// Post-traitement : indexabilité, graphe de liens, profondeur, PageRank interne, doublons,
// redirections et liste des problèmes SEO. Les textes sont des clés de traduction (public/i18n).
import { titlePixels, descPixels } from './pixel.mjs';
import { similarity } from './text.mjs';
import { robotsFlags } from '../public/shared/directives.js';
import { imageFormat } from './parse.mjs';

export const THRESHOLDS = {
  titleMaxPx: 580,
  titleMaxChars: 60,
  titleMin: 30,
  descMaxPx: 990,
  descMax: 160,
  descMin: 70,
  thinWords: 200,
  slowMs: 1000,
  largeHtmlBytes: 500 * 1024,
  largeImageBytes: 150 * 1024,
  deepLevel: 4,
  urlMaxLength: 115,
  lowTextRatio: 10,
  nearDuplicate: 92,
  maxLinks: 1000,
  lcpMs: 2500,
  cls: 0.1,
};

export const SEVERITIES = ['error', 'warning', 'notice'];
const SEV_ORDER = { error: 0, warning: 1, notice: 2 };
// /index.html, /home, /accueil… → / : simple alias de l'accueil, pas une page supprimée.
const HOME_ALIAS = /^\/((index|default|home|accueil|inicio|start|startseite)(\.(html?|php|aspx?))?\/?)?$/i;
const UNVERIFIABLE = new Set([0, 401, 403, 429, 999]);
// Score : plafond de points retirés par problème, poids par page touchée, facteur d'impact.
const SCORE_CAP = { error: 30, warning: 12, notice: 0 };
const PAGE_W = { error: 1, warning: 0.35, notice: 0 };
const IMPACT_F = { high: 1, medium: 0.7, low: 0.4 };
const PRIO_FLOOR = { error: 20, warning: 10, notice: 0 };
const SEV_W = { error: 3, warning: 2, notice: 1 };
const LVL_W = { high: 3, medium: 2, low: 1 };

export const GENERIC_ANCHORS = new Set([
  'cliquez ici', 'ici', 'en savoir plus', 'lire la suite', 'voir plus', 'plus', 'lien', 'cliquer ici', 'suite', 'découvrir',
  'click here', 'here', 'read more', 'learn more', 'more', 'more info', 'this', 'link', 'continue reading', 'see more', 'details',
  'hier', 'mehr', 'weiterlesen', 'mehr erfahren', 'hier klicken', 'weiter',
  'aquí', 'aqui', 'haga clic aquí', 'haz clic aquí', 'leer más', 'más información', 'ver más', 'más',
  'qui', 'clicca qui', 'leggi di più', 'scopri di più', 'continua', 'altro',
  'clique aqui', 'leia mais', 'saiba mais', 'ver mais', 'mais',
]);

// Clé d'indexabilité (traduite par l'interface : idx.<clé>).
function indexability(p) {
  if (p.blockedByRobots || p.robotsBlocked) return 'blocked';
  if (!p.status) return 'noResponse';
  if (p.status >= 300 && p.status < 400) return 'redirect';
  if (p.rateLimited) return 'rateLimited';
  if (p.status >= 400 && p.status < 500) return 'clientError';
  if (p.status >= 500) return 'serverError';
  if (robotsFlags(p.metaRobots, p.xRobotsTag).noindex) return 'noindex';
  if (p.metaRefreshUrl && p.metaRefreshUrl !== p.url) return 'metaRefresh';
  if (p.jsRedirectUrl) return 'jsRedirect';
  if (p.isHtml && p.canonical && p.canonical !== p.url) return 'canonicalised';
  return '';
}

// Détail traduisible d'un élément de problème : { k: clé i18n, p: paramètres }.
const D = (k, p = {}) => ({ k, p });

// PageRank interne (Link Score 0-100), comme le « Link Score » de Screaming Frog.
function pageRank(nodes, adj, iterations = 30, d = 0.85) {
  const N = nodes.length;
  if (!N) return new Map();
  const idx = new Map(nodes.map((u, i) => [u, i]));
  const out = nodes.map((u) => [...(adj.get(u) || [])].map((v) => idx.get(v)).filter((x) => x !== undefined));
  let pr = new Float64Array(N).fill(1 / N);
  for (let it = 0; it < iterations; it++) {
    const next = new Float64Array(N).fill((1 - d) / N);
    let dangling = 0;
    for (let i = 0; i < N; i++) {
      if (!out[i].length) dangling += pr[i];
      else for (const j of out[i]) next[j] += (d * pr[i]) / out[i].length;
    }
    for (let i = 0; i < N; i++) next[i] += (d * dangling) / N;
    pr = next;
  }
  const logs = [...pr].map((x) => Math.log(x));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  return new Map(nodes.map((u, i) => [u, max > min ? Math.round(((logs[i] - min) / (max - min)) * 100) : 100]));
}

export function grade(score) {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : score >= 20 ? 'E' : 'F';
}

export function analyze(crawler) {
  const T = THRESHOLDS;
  const pages = [...crawler.pages.values()];
  const byUrl = crawler.pages;
  const start = crawler.startUrl;
  const homes = new Set([start, crawler.finalStart]);
  const norm = (u) => crawler.normalize(u) || u;

  for (const p of pages) {
    p.indexabilityReason = indexability(p);
    p.indexable = !p.indexabilityReason;
    p.inlinks = 0;
    p.uniqueInlinks = 0;
    p.contentInlinks = 0;
    p.h1Count = p.h1?.length || 0;
    p.h2Count = p.h2?.length || 0;
    p.titleLength = p.title?.length || 0;
    p.titlePx = p.title ? titlePixels(p.title) : 0;
    p.metaDescriptionLength = p.metaDescription?.length || 0;
    p.metaDescriptionPx = p.metaDescription ? descPixels(p.metaDescription) : 0;
    p.urlLength = p.url.length;
  }

  // Graphe de liens internes
  const inFrom = new Map();
  const contentFrom = new Map();
  const adj = new Map();
  for (const l of crawler.links) {
    if (!l.internal) continue;
    // Un lien vers soi-même n'est pas un lien entrant ; Google ne suit pas les liens d'une page en erreur.
    if (l.from === l.to) continue;
    const src = byUrl.get(l.from);
    if (src && src.status >= 400) continue;
    const t = byUrl.get(l.to);
    if (t) t.inlinks++;
    if (!inFrom.has(l.to)) inFrom.set(l.to, new Set());
    inFrom.get(l.to).add(l.from);
    if (l.pos === 'content') {
      if (!contentFrom.has(l.to)) contentFrom.set(l.to, new Set());
      contentFrom.get(l.to).add(l.from);
    }
    if (!l.nofollow) {
      if (!adj.has(l.from)) adj.set(l.from, new Set());
      adj.get(l.from).add(l.to);
    }
  }
  for (const [to, set] of inFrom) {
    const t = byUrl.get(to);
    if (t) t.uniqueInlinks = set.size;
  }
  for (const [to, set] of contentFrom) {
    const t = byUrl.get(to);
    if (t) t.contentInlinks = set.size;
  }
  // Les redirections (HTTP ou meta refresh) ne sont pas des clics : arêtes de poids 0 pour la profondeur.
  const hop = new Map();
  for (const p of pages) {
    const target = p.redirectUrl || p.metaRefreshUrl || p.jsRedirectUrl;
    if (target) hop.set(p.url, norm(target));
    if (p.canonical && p.canonical !== p.url && p.indexabilityReason === 'canonicalised') {
      if (!adj.has(p.url)) adj.set(p.url, new Set());
      adj.get(p.url).add(norm(p.canonical));
    }
  }

  // Profondeur réelle (plus court chemin depuis l'accueil, ou depuis chaque URL en mode liste)
  for (const p of pages) p.depth = null;
  // Parcours 0-1 : l'accueil après redirection (http → https, www) reste au niveau 0.
  const roots = crawler.listUrls ? crawler.listUrls : [start];
  const dist = new Map(roots.map((r) => [r, 0]));
  const dq = [...roots];
  while (dq.length) {
    const cur = dq.shift();
    const d = dist.get(cur);
    const h = hop.get(cur);
    if (h && (!dist.has(h) || dist.get(h) > d)) {
      dist.set(h, d);
      dq.unshift(h);
    }
    for (const v of adj.get(cur) || []) {
      if (!dist.has(v) || dist.get(v) > d + 1) {
        dist.set(v, d + 1);
        dq.push(v);
      }
    }
  }
  for (const [u, d] of dist) {
    const p = byUrl.get(u);
    if (p) p.depth = d;
  }

  // PageRank interne sur les pages crawlées
  const nodes = pages.map((p) => p.url);
  const adjCrawled = new Map();
  for (const [u, set] of adj) adjCrawled.set(u, new Set([...set].filter((v) => byUrl.has(v))));
  for (const [u, v] of hop) if (byUrl.has(v)) adjCrawled.set(u, new Set([...(adjCrawled.get(u) || []), v]));
  const pr = pageRank(nodes, adjCrawled);
  for (const p of pages) p.linkScore = pr.get(p.url) ?? 0;

  // Chaînes de redirection
  const redirects = [];
  for (const p of pages) {
    if (!p.redirectUrl) continue;
    const chain = [p.url];
    let cur = p;
    let loop = false;
    while (cur && cur.redirectUrl) {
      const next = norm(cur.redirectUrl);
      if (chain.includes(next)) {
        loop = true;
        chain.push(next);
        break;
      }
      chain.push(next);
      cur = byUrl.get(next);
      if (chain.length > 12) break;
    }
    const final = byUrl.get(chain[chain.length - 1]);
    p.redirectHops = chain.length - 1;
    p.finalUrl = chain[chain.length - 1];
    redirects.push({ url: p.url, status: p.status, target: p.redirectUrl, hops: chain.length - 1, chain, loop, finalUrl: p.finalUrl, finalStatus: loop ? null : final?.status ?? crawler.externals?.get(p.finalUrl)?.status ?? null, inlinks: p.inlinks });
  }

  const html200 = pages.filter((p) => p.isHtml && p.status === 200);
  const indexableHtml = html200.filter((p) => p.indexable);
  const isHttps = crawler.origin?.startsWith('https');

  // Familles de pages qui ont le droit de partager titre, description et H1 : versions linguistiques déclarées en
  // hreflang et pages d'une même série paginée (rel next/prev). Google ne les traite pas comme des doublons.
  const family = new Map();
  const root = (u) => {
    while (family.has(u) && family.get(u) !== u) u = family.get(u);
    return u;
  };
  const join = (a, b) => {
    if (!a || !b || !byUrl.has(a) || !byUrl.has(b)) return;
    if (!family.has(a)) family.set(a, a);
    if (!family.has(b)) family.set(b, b);
    family.set(root(a), root(b));
  };
  for (const p of html200) {
    for (const h of p.hreflang || []) join(p.url, norm(h.href));
    if (p.relNext) join(p.url, norm(p.relNext));
    if (p.relPrev) join(p.url, norm(p.relPrev));
  }
  // Mots de contenu : hors menu et pied de page quand la page les balise (<main>, <nav>, <footer>), sinon le corps.
  const contentWords = (p) => (p.hasMain && p.mainWordCount != null ? p.mainWordCount : p.wordCount);
  const dupMap = (key, { byLang = false } = {}) => {
    const m = new Map();
    for (const p of indexableHtml) {
      const v = key(p);
      if (!v) continue;
      // Deux traductions qui gardent le même titre (« MDN Web Docs ») ne se concurrencent pas.
      const k = (byLang ? (p.lang || '').toLowerCase().split('-')[0] + '\u0000' : '') + v.toLowerCase();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    const dups = new Map();
    for (const arr of m.values()) {
      if (arr.length < 2) continue;
      const fams = new Set(arr.map((p) => root(p.url)));
      if (fams.size > 1) arr.forEach((p) => dups.set(p.url, arr.length));
    }
    return { m, dups, count: (p) => dups.get(p.url) || 0 };
  };
  const dupTitle = dupMap((p) => p.title, { byLang: true });
  const dupDesc = dupMap((p) => p.metaDescription, { byLang: true });
  const dupH1 = dupMap((p) => p.h1?.[0], { byLang: true });
  const dupContent = dupMap((p) => p.contentHash);
  for (const p of html200) {
    p.duplicateTitle = dupTitle.dups.has(p.url);
    p.duplicateDescription = dupDesc.dups.has(p.url);
    p.duplicateH1 = dupH1.dups.has(p.url);
    p.duplicateContent = dupContent.dups.has(p.url);
  }

  // Quasi-doublons (simhash sur le contenu principal)
  const nearDup = [];
  const cand = indexableHtml.filter((p) => p.simhash && !p.duplicateContent).slice(0, 5000);
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const s = similarity(cand[i].simhash, cand[j].simhash);
      if (s >= T.nearDuplicate) {
        nearDup.push({ a: cand[i].url, b: cand[j].url, similarity: s });
        cand[i].nearDuplicates = (cand[i].nearDuplicates || 0) + 1;
        cand[j].nearDuplicates = (cand[j].nearDuplicates || 0) + 1;
        if (!cand[i].closestMatch || s > cand[i].closestSimilarity) Object.assign(cand[i], { closestMatch: cand[j].url, closestSimilarity: s });
        if (!cand[j].closestMatch || s > cand[j].closestSimilarity) Object.assign(cand[j], { closestMatch: cand[i].url, closestSimilarity: s });
      }
    }
  }

  // Cannibalisation potentielle : même expression principale dans le title de plusieurs pages.
  // Les segments de titre répétés sur 3 pages ou plus (marque, préfixe de rubrique « Getting Started: ») sont ignorés.
  const segOf = (title) => (title || '').toLowerCase().split(/\s[|–—-]\s|:\s/).map((x) => x.trim()).filter(Boolean);
  const segFreq = new Map();
  for (const p of indexableHtml) for (const sg of new Set(segOf(p.title))) segFreq.set(sg, (segFreq.get(sg) || 0) + 1);
  const coreTitle = (p) => segOf(p.title).filter((sg) => segFreq.get(sg) < 3).join(' ');
  const titleTermFreq = new Map();
  for (const p of indexableHtml) {
    const t = coreTitle(p);
    for (const k of new Set(p.keywords || [])) if (t.includes(k)) titleTermFreq.set(k, (titleTermFreq.get(k) || 0) + 1);
  }
  const siteWide = Math.max(3, indexableHtml.length * 0.3); // termes de marque présents partout : ignorés
  const focusGroups = new Map();
  for (const p of indexableHtml) {
    const t = coreTitle(p);
    const slug = decodeURIComponent(new URL(p.url).pathname).toLowerCase().replace(/[-_/]+/g, ' ');
    const h1 = (p.h1?.[0] || '').toLowerCase();
    const focus = (p.keywords || []).find((k) => k.includes(' ') && t.includes(k) && titleTermFreq.get(k) < siteWide);
    p.focusKeyword = focus || (p.keywords || []).find((k) => t.includes(k) && titleTermFreq.get(k) < siteWide) || '';
    // L'expression doit aussi être le sujet affiché (H1, description) ou l'adresse de la page, pas un mot commun de titre.
    if (focus && (h1.includes(focus) || slug.includes(focus) || (p.metaDescription || '').toLowerCase().includes(focus))) {
      if (!focusGroups.has(focus)) focusGroups.set(focus, []);
      focusGroups.get(focus).push(p);
    }
  }
  // Deux pages ne se concurrencent que si leurs sujets se recouvrent : au moins 2 mots-clés principaux communs.
  const overlap = (a, b) => (a.keywords || []).filter((k) => (b.keywords || []).includes(k)).length;
  for (const [k, arr] of focusGroups) focusGroups.set(k, arr.filter((p) => arr.some((o) => o !== p && root(o.url) !== root(p.url) && overlap(p, o) >= 2)));
  const cannibal = [...focusGroups.entries()].filter(([, arr]) => arr.length > 1);

  // Liens cassés / vers redirections / ancres
  const brokenLinks = [];
  const linksToRedirects = [];
  const nofollowInternal = [];
  const genericAnchors = new Map();
  const emptyAnchors = new Map();
  const unverifiedExternal = [];
  for (const l of crawler.links) {
    if (l.internal) {
      const t = byUrl.get(l.to);
      if (l.nofollow) nofollowInternal.push(l);
      // Vide = aucun texte du tout ; « ! », « >> » sont des ancres réelles (opérateurs, pagination).
      const a = (l.anchor || '').toLowerCase().replace(/[.…:!»›→>\s]+$/u, '').trim();
      if (!(l.anchor || '').trim()) emptyAnchors.set(l.from, (emptyAnchors.get(l.from) || 0) + 1);
      else if (a && !l.code && GENERIC_ANCHORS.has(a)) {
        if (!genericAnchors.has(l.from)) genericAnchors.set(l.from, new Set());
        genericAnchors.get(l.from).add(l.anchor);
      }
      if (!t || t.blockedByRobots || t.rateLimited) continue;
      if (!t.status || t.status >= 400) brokenLinks.push({ from: l.from, to: l.to, anchor: l.anchor, status: t.status, statusText: t.statusText || t.error });
      else if (t.status >= 300) linksToRedirects.push({ from: l.from, to: l.to, anchor: l.anchor, status: t.status, target: t.redirectUrl });
    } else {
      const ex = crawler.externals.get(l.to);
      if (ex && ex.status !== null && (ex.status === 0 || ex.status >= 400)) {
        // Anti-bot, limite de débit ou délai dépassé : le lien n'a pas pu être vérifié, il n'est pas forcément cassé.
        const item = { from: l.from, to: l.to, anchor: l.anchor, status: ex.status, statusText: ex.statusText, external: true };
        if (UNVERIFIABLE.has(ex.status)) unverifiedExternal.push(item);
        else brokenLinks.push(item);
      }
    }
  }

  // Hreflang
  const hreflangMissingReturn = [];
  for (const p of html200.filter((x) => x.indexable)) {
    for (const h of p.hreflang || []) {
      const n = norm(h.href);
      if (n === p.url) continue;
      const t = byUrl.get(n);
      if (!t || !t.isHtml || t.status !== 200) continue;
      if (!(t.hreflang || []).some((x) => norm(x.href) === p.url)) hreflangMissingReturn.push({ url: p.url, detail: `${h.lang} → ${n}` });
    }
  }

  // ---------- Problèmes ----------
  // Données Google rattachées aux pages : Search Console (clics, impressions…) et PageSpeed Insights.
  const gscKey = (u) => {
    try {
      const x = new URL(u);
      return x.hostname.replace(/^www\./, '').toLowerCase() + (x.pathname.replace(/\/+$/, '') || '/') + x.search;
    } catch {
      return u;
    }
  };
  const gscOnly = [];
  let gscMeta = null;
  if (crawler.gsc) {
    const byKey = new Map(pages.map((p) => [gscKey(p.url), p]));
    const host = new URL(crawler.finalStart || crawler.startUrl).hostname.replace(/^www\./, '');
    let clicks = 0;
    let impressions = 0;
    for (const r of crawler.gsc.rows) {
      clicks += r.clicks || 0;
      impressions += r.impressions || 0;
      const p = byKey.get(gscKey(r.url));
      const data = { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? (r.impressions ? r.clicks / r.impressions : 0), position: r.position != null ? Math.round(r.position * 10) / 10 : null };
      if (p) {
        // Plusieurs variantes d'une même URL (slash final…) : on additionne.
        if (p.gsc) {
          p.gsc.clicks += data.clicks;
          p.gsc.impressions += data.impressions;
          p.gsc.ctr = p.gsc.impressions ? p.gsc.clicks / p.gsc.impressions : 0;
        } else p.gsc = data;
      } else {
        try {
          if (new URL(r.url).hostname.replace(/^www\./, '') === host) gscOnly.push({ url: r.url, ...data });
        } catch {
          // URL invalide dans l'export : ignorée
        }
      }
    }
    for (const p of pages) if (p.isHtml && p.status === 200 && !p.gsc) p.gsc = { clicks: 0, impressions: 0, ctr: 0, position: null };
    gscMeta = { source: crawler.gsc.source, property: crawler.gsc.property, start: crawler.gsc.start, end: crawler.gsc.end, rows: crawler.gsc.rows.length, clicks, impressions, matched: crawler.gsc.rows.length - gscOnly.length };
  }
  let psiMeta = null;
  if (crawler.psi?.size) {
    for (const [u, r] of crawler.psi) {
      const p = byUrl.get(u);
      if (p) p.psi = { score: r.score, field: r.field, lab: r.lab };
    }
    psiMeta = { tested: crawler.psi.size, strategy: crawler.opts.psiStrategy, origin: [...crawler.psi.values()].find((r) => r.origin)?.origin || null };
  }
  gscOnly.sort((a, b) => b.impressions - a.impressions);

  const issues = [];
  // impact : importance SEO ; effort : difficulté de correction (pour le plan d'action)
  const add = (id, severity, category, impact, effort, items, params = {}) => {
    if (items.length) issues.push({ id, severity, category, impact, effort, params, count: items.length, items });
  };
  // Liens : une ligne par paire page → cible, même si le lien apparaît plusieurs fois avec des ancres différentes
  // (« Support », « Obtenir du support ») ; les ancres sont listées dans le détail.
  const byPair = (links, detail) => {
    const m = new Map();
    for (const l of links) {
      const k = l.from + '\u0000' + l.to;
      if (!m.has(k)) m.set(k, { ...l, anchors: new Set() });
      if (l.anchor) m.get(k).anchors.add(l.anchor);
    }
    return [...m.values()].map((l) => ({ url: l.from, detail: detail(l) + (l.anchors.size ? ` · « ${[...l.anchors].slice(0, 5).join(' », « ')} »` : '') }));
  };
  const u = (arr, detail = () => '') => arr.map((p) => ({ url: p.url, detail: detail(p) }));
  const robotsHas = (p, s) => robotsFlags(p.metaRobots, p.xRobotsTag)[s];
  const imgs = [...crawler.images.values()];
  const imgRole = (i) => (i.role === 'src' ? '' : ` [${i.role === 'source' ? '<picture>' : 'srcset'}${i.descriptor ? ' ' + i.descriptor : ''}]`);

  // Codes réponse & liens
  add('4xx', 'error', 'codes', 'high', 'low', u(pages.filter((p) => p.status >= 400 && p.status < 500 && !p.rateLimited), (p) => D('d.statusInlinks', { status: p.status, n: p.uniqueInlinks })));
  add('5xx', 'error', 'codes', 'high', 'medium', u(pages.filter((p) => p.status >= 500 && !p.rateLimited), (p) => String(p.status)));
  add('no-response', 'error', 'codes', 'high', 'medium', u(pages.filter((p) => !p.status && !p.blockedByRobots), (p) => p.error));
  add('rate-limited', 'notice', 'codes', 'medium', 'low', u(pages.filter((p) => p.rateLimited), (p) => String(p.status)));
  add('broken-internal', 'error', 'links', 'high', 'low', byPair(brokenLinks.filter((l) => !l.external), (l) => `→ ${l.to} (${l.status || l.statusText})`));
  add('broken-external', 'warning', 'links', 'medium', 'low', byPair(brokenLinks.filter((l) => l.external), (l) => `→ ${l.to} (${l.status || l.statusText})`));
  add('external-unverified', 'notice', 'links', 'low', 'low', byPair(unverifiedExternal, (l) => `→ ${l.to} (${l.status || l.statusText})`));
  add('redirect-loop', 'error', 'redirects', 'high', 'low', redirects.filter((r) => r.loop).map((r) => ({ url: r.url, detail: r.chain.join(' → ') })));
  // Une chaîne n'est signalée qu'une fois, depuis son début : les étapes intermédiaires sans lien entrant ni sitemap
  // n'existent que comme maillons de la chaîne.
  const midHops = new Set(redirects.flatMap((r) => r.chain.slice(1, -1)));
  const chainStart = (r) => !midHops.has(r.url) || byUrl.get(r.url)?.inSitemap || (byUrl.get(r.url)?.via && byUrl.get(r.url).via !== 'redirect');
  add('redirect-chain', 'warning', 'redirects', 'medium', 'low', redirects.filter((r) => r.hops > 1 && !r.loop && chainStart(r)).map((r) => ({ url: r.url, detail: r.chain.join(' → ') })));
  add('redirect-to-home', 'warning', 'redirects', 'medium', 'medium', redirects.filter((r) => !r.loop && homes.has(r.finalUrl) && !homes.has(r.url) && !HOME_ALIAS.test(new URL(r.url).pathname)).map((r) => ({ url: r.url, detail: `${r.status} → ${r.finalUrl}` })));
  add('links-to-redirect', 'warning', 'links', 'medium', 'medium', byPair(linksToRedirects, (l) => `→ ${l.to} (${l.status} → ${l.target})`));
  // Google traite un 302 comme un 301 pour le PageRank ; il reste légitime pour une redirection de langue ou de pays.
  add('redirect-302', 'notice', 'redirects', 'low', 'low', u(pages.filter((p) => p.status === 302 || p.status === 307), (p) => `${p.status} → ${p.redirectUrl}`));
  add('js-redirect', 'warning', 'redirects', 'medium', 'low', u(html200.filter((p) => p.jsRedirectUrl), (p) => `→ ${p.jsRedirectUrl}`));
  add('meta-refresh', 'warning', 'redirects', 'medium', 'low', u(html200.filter((p) => p.metaRefresh), (p) => p.metaRefresh));
  add('redirect-3xx', 'notice', 'redirects', 'low', 'low', u(pages.filter((p) => p.status >= 300 && p.status < 400), (p) => `${p.status} → ${p.redirectUrl}`));

  // Sécurité
  add('http-urls', 'warning', 'security', 'medium', 'medium', isHttps ? u(pages.filter((p) => p.url.startsWith('http:'))) : []);
  add('mixed-content', 'warning', 'security', 'medium', 'low', u(html200.filter((p) => p.mixedContent > 0), (p) => D('d.resources', { n: p.mixedContent })));
  add('no-hsts', 'notice', 'security', 'low', 'low', isHttps ? u(html200.filter((p) => p.url.startsWith('https:') && p.headers && !p.headers.hsts)) : []);
  add('no-https', 'error', 'security', 'high', 'medium', !isHttps && html200.length ? [{ url: crawler.origin, detail: 'http://' }] : []);

  // Titres
  add('title-missing', 'error', 'titles', 'high', 'low', u(html200.filter((p) => !p.title)));
  add('title-duplicate', 'warning', 'titles', 'high', 'medium', u(html200.filter((p) => p.duplicateTitle), (p) => `${p.title} (×${dupTitle.count(p)})`));
  add('title-long', 'warning', 'titles', 'medium', 'low', u(indexableHtml.filter((p) => p.titlePx > T.titleMaxPx), (p) => D('d.pxChars', { px: p.titlePx, n: p.titleLength, text: p.title })), { max: T.titleMaxPx });
  add('title-short', 'warning', 'titles', 'medium', 'low', u(indexableHtml.filter((p) => p.title && p.titleLength < T.titleMin), (p) => D('d.chars', { n: p.titleLength, text: p.title })), { min: T.titleMin });
  add('title-multiple', 'warning', 'titles', 'low', 'low', u(html200.filter((p) => p.titleCount > 1), (p) => `×${p.titleCount}`));
  add('title-eq-h1', 'notice', 'titles', 'low', 'low', u(indexableHtml.filter((p) => p.title && p.h1?.[0] && p.title.trim().toLowerCase() === p.h1[0].trim().toLowerCase())));

  // Meta descriptions
  add('desc-missing', 'warning', 'meta', 'medium', 'low', u(html200.filter((p) => p.indexable && !p.metaDescription)));
  add('desc-duplicate', 'warning', 'meta', 'medium', 'medium', u(html200.filter((p) => p.duplicateDescription), (p) => `×${dupDesc.count(p)} · ${p.metaDescription.slice(0, 80)}`));
  add('desc-long', 'notice', 'meta', 'low', 'low', u(indexableHtml.filter((p) => p.metaDescriptionPx > T.descMaxPx), (p) => D('d.pxChars', { px: p.metaDescriptionPx, n: p.metaDescriptionLength, text: '' })), { max: T.descMaxPx });
  add('desc-short', 'notice', 'meta', 'low', 'low', u(indexableHtml.filter((p) => p.metaDescription && p.metaDescriptionLength < T.descMin), (p) => D('d.chars', { n: p.metaDescriptionLength, text: '' })), { min: T.descMin });
  add('desc-multiple', 'warning', 'meta', 'low', 'low', u(html200.filter((p) => p.metaDescriptionCount > 1)));

  // Titres Hn
  add('h1-missing', 'warning', 'headings', 'medium', 'low', u(html200.filter((p) => p.indexable && !p.h1Count)));
  add('h1-multiple', 'notice', 'headings', 'low', 'low', u(indexableHtml.filter((p) => p.h1Count > 1), (p) => p.h1.join(' | ')));
  add('h1-duplicate', 'warning', 'headings', 'medium', 'medium', u(html200.filter((p) => p.duplicateH1), (p) => p.h1[0]));
  add('h2-missing', 'notice', 'headings', 'low', 'low', u(indexableHtml.filter((p) => !p.h2Count)));
  add('heading-skip', 'notice', 'headings', 'low', 'low', u(indexableHtml.filter((p) => p.headingSkips?.length), (p) => [...new Set(p.headingSkips)].join(', ')));

  // Contenu
  // Soft 404 : la page répond 200 mais annonce qu'elle n'existe pas (titre ou H1), comme Google la classe.
  const SOFT_404 = /\b(404|page not found|not found|page introuvable|page non trouvée|página no encontrada|no se ha encontrado|seite nicht gefunden|nicht gefunden|pagina non trovata|página não encontrada|page doesn.t exist|no longer available)\b/i;
  add('soft-404', 'warning', 'codes', 'high', 'low', u(html200.filter((p) => !homes.has(p.url) && (SOFT_404.test(p.title || '') || SOFT_404.test(p.h1?.[0] || ''))), (p) => p.title || p.h1?.[0]));
  add('thin-content', 'warning', 'content', 'high', 'high', u(indexableHtml.filter((p) => contentWords(p) < T.thinWords), (p) => D('d.words', { n: contentWords(p) })), { min: T.thinWords });
  add('duplicate-content', 'error', 'content', 'high', 'medium', u(html200.filter((p) => p.duplicateContent), (p) => `×${dupContent.count(p)}`));
  add('near-duplicate', 'warning', 'content', 'high', 'high', u(indexableHtml.filter((p) => p.nearDuplicates), (p) => `≈${p.closestSimilarity} % · ${p.closestMatch}`), { min: T.nearDuplicate });
  add('cannibalization', 'notice', 'content', 'medium', 'medium', cannibal.flatMap(([k, arr]) => arr.map((p) => ({ url: p.url, detail: `« ${k} » ×${arr.length}` }))));
  add('low-text-ratio', 'notice', 'content', 'low', 'medium', u(indexableHtml.filter((p) => p.textRatio < T.lowTextRatio), (p) => `${p.textRatio} %`), { min: T.lowTextRatio });

  // Images
  add('img-alt-missing', 'warning', 'images', 'medium', 'low', u(indexableHtml.filter((p) => p.imagesMissingAlt > 0), (p) => `${p.imagesMissingAlt}/${p.imagesCount}`));
  add('img-alt-empty', 'notice', 'images', 'low', 'low', u(indexableHtml.filter((p) => p.imagesEmptyAlt > 0), (p) => `${p.imagesEmptyAlt}/${p.imagesCount}`));
  add('img-broken', 'error', 'images', 'medium', 'low', imgs.filter((i) => i.status !== null && i.status >= 400 && !UNVERIFIABLE.has(i.status)).map((i) => ({ url: [...i.pages][0], detail: `${i.src}${imgRole(i)} (${i.status})` })));
  add('img-large', 'warning', 'images', 'medium', 'low', imgs.filter((i) => i.size > T.largeImageBytes).map((i) => ({ url: i.src, detail: `${Math.round(i.size / 1024)} KB · ${i.pages.size} p.${imgRole(i)}` })), { max: Math.round(T.largeImageBytes / 1024) });
  add('img-dimensions', 'notice', 'images', 'low', 'low', u(indexableHtml.filter((p) => p.imagesNoDimensions > 0), (p) => `${p.imagesNoDimensions}/${p.imagesCount}`));
  add('img-not-responsive', 'notice', 'images', 'medium', 'medium', imgs.filter((i) => i.role === 'src' && !i.responsive && i.size > T.largeImageBytes && !/svg/.test(i.contentType + imageFormat(i.src))).map((i) => ({ url: i.src, detail: `${Math.round(i.size / 1024)} KB · ${i.pages.size} p.` })), { max: Math.round(T.largeImageBytes / 1024) });
  add('img-legacy-format', 'notice', 'images', 'medium', 'medium', u(indexableHtml.filter((p) => p.imagesLegacyOnly > 0), (p) => `${p.imagesLegacyOnly}/${p.imagesCount}`));
  add('img-srcset-no-sizes', 'notice', 'images', 'low', 'low', u(indexableHtml.filter((p) => p.imagesNoSizes > 0), (p) => `${p.imagesNoSizes}/${p.imagesCount}`));

  // Directives
  add('noindex', 'notice', 'directives', 'medium', 'low', u(html200.filter((p) => robotsHas(p, 'noindex')), (p) => p.metaRobots || p.xRobotsTag));
  add('nofollow-page', 'notice', 'directives', 'low', 'low', u(html200.filter((p) => robotsHas(p, 'nofollow'))));
  add('blocked-robots', 'notice', 'directives', 'medium', 'low', u(pages.filter((p) => p.blockedByRobots || p.robotsBlocked)));

  // Liens & ancres
  add('nofollow-internal', 'notice', 'links', 'low', 'low', byPair(nofollowInternal, (l) => `→ ${l.to}`));
  add('generic-anchors', 'notice', 'links', 'low', 'low', [...genericAnchors].map(([url, set]) => ({ url, detail: [...set].map((a) => `« ${a} »`).join(', ') })));
  add('empty-anchors', 'warning', 'links', 'medium', 'low', [...emptyAnchors].map(([url, n]) => ({ url, detail: D('d.links', { n }) })));
  add('too-many-links', 'notice', 'links', 'low', 'medium', u(indexableHtml.filter((p) => p.internalOutlinks + p.externalOutlinks > T.maxLinks), (p) => D('d.links', { n: p.internalOutlinks + p.externalOutlinks })), { max: T.maxLinks });

  // Canonicals
  add('canonical-missing', 'notice', 'canonicals', 'low', 'low', u(indexableHtml.filter((p) => !p.canonical)));
  add('canonicalised', 'notice', 'canonicals', 'low', 'low', u(html200.filter((p) => p.canonical && p.canonical !== p.url), (p) => `→ ${p.canonical}`));
  add('canonical-non200', 'error', 'canonicals', 'high', 'low', u(html200.filter((p) => {
    if (!p.canonical || p.canonical === p.url) return false;
    const t = byUrl.get(norm(p.canonical));
    return t && (t.status !== 200 || !t.indexable);
  }), (p) => { const t = byUrl.get(norm(p.canonical)); return `→ ${p.canonical} (${t.status || '—'})`; }));
  // Plusieurs canonicals qui pointent vers des URL différentes : Google les ignore toutes. Identiques : sans effet.
  add('canonical-multiple', 'warning', 'canonicals', 'medium', 'low', u(html200.filter((p) => p.canonicalCount > 1 && p.canonicalConflict !== false), (p) => `×${p.canonicalCount}`));
  add('canonical-duplicate-tag', 'notice', 'canonicals', 'low', 'low', u(html200.filter((p) => p.canonicalCount > 1 && p.canonicalConflict === false), (p) => `×${p.canonicalCount}`));
  add('canonical-outside-head', 'warning', 'canonicals', 'medium', 'low', u(html200.filter((p) => p.canonicalOutsideHead > 0)));

  // Sitemap
  const hasSitemap = crawler.sitemapUrls.size > 0;
  const spider = crawler.opts.mode !== 'list';
  // Un index trouvé mais sans URL lisible n'est pas « absent » : le détail dit ce qui a été lu.
  const smFiles = crawler.sitemapFiles || [];
  const noSitemapDetail = smFiles.length ? D('d.sitemapEmpty', { n: smFiles.length }) : '404';
  add('no-sitemap', 'warning', 'sitemap', 'medium', 'low', hasSitemap || !crawler.opts.useSitemaps || !spider ? [] : [{ url: smFiles[0]?.url || crawler.origin + '/sitemap.xml', detail: noSitemapDetail }]);
  add('sitemap-host-mismatch', 'warning', 'sitemap', 'high', 'low', crawler.sitemapHostMismatch ? [{ url: crawler.sitemapMismatchExample, detail: D('d.sitemapHost', { n: crawler.sitemapHostMismatch, origin: crawler.origin }) }] : []);
  add('orphan', 'warning', 'sitemap', 'high', 'medium', u(pages.filter((p) => p.inSitemap && p.uniqueInlinks === 0 && !homes.has(p.url))));
  // Search Console : pages vues par Google mais absentes du crawl, pages sans visibilité, CTR faible.
  const EXPECTED_CTR = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.035, 0.03, 0.025];
  add('gsc-orphan', 'warning', 'sitemap', 'high', 'medium', gscOnly.filter((r) => r.impressions > 0).map((r) => ({ url: r.url, detail: D('d.gsc', { clicks: r.clicks, impressions: r.impressions }) })));
  add('gsc-no-impressions', 'notice', 'content', 'medium', 'high', crawler.gsc ? u(indexableHtml.filter((p) => p.gsc && !p.gsc.impressions)) : []);
  add('gsc-low-ctr', 'warning', 'titles', 'high', 'low', u(indexableHtml.filter((p) => p.gsc?.impressions >= 100 && p.gsc.position && p.gsc.position <= 10 && p.gsc.ctr < EXPECTED_CTR[Math.max(0, Math.round(p.gsc.position) - 1)] / 2), (p) => `CTR ${(p.gsc.ctr * 100).toFixed(1)} % · pos. ${p.gsc.position} · ${p.gsc.impressions} impr.`));
  add('gsc-non-indexable-traffic', 'warning', 'directives', 'high', 'low', u(html200.filter((p) => !p.indexable && p.gsc?.clicks > 0), (p) => D('d.gsc', { clicks: p.gsc.clicks, impressions: p.gsc.impressions })));
  add('sitemap-non-indexable', 'warning', 'sitemap', 'medium', 'low', u(pages.filter((p) => p.inSitemap && !p.indexable && !p.rateLimited), (p) => D('idx.' + p.indexabilityReason)));
  add('not-in-sitemap', 'notice', 'sitemap', 'low', 'low', hasSitemap && !crawler.sitemapsTruncated ? u(indexableHtml.filter((p) => !p.inSitemap)) : []);

  // Architecture
  add('deep', 'notice', 'architecture', 'medium', 'medium', spider ? u(indexableHtml.filter((p) => p.depth !== null && p.depth >= T.deepLevel), (p) => D('d.depth', { n: p.depth })) : [], { min: T.deepLevel });
  add('one-inlink', 'notice', 'architecture', 'medium', 'low', spider ? u(indexableHtml.filter((p) => p.uniqueInlinks === 1)) : []);
  add('no-content-inlinks', 'notice', 'architecture', 'medium', 'medium', spider ? u(indexableHtml.filter((p) => p.uniqueInlinks > 0 && !p.contentInlinks && !homes.has(p.url))) : []);
  add('unreachable', 'notice', 'architecture', 'medium', 'medium', spider ? u(indexableHtml.filter((p) => p.depth === null && !(p.inSitemap && p.uniqueInlinks === 0))) : []);

  // Performance
  add('slow', 'warning', 'performance', 'medium', 'high', u(html200.filter((p) => p.responseTime > T.slowMs), (p) => `${p.responseTime} ms`), { max: T.slowMs });
  add('large-html', 'notice', 'performance', 'low', 'medium', u(html200.filter((p) => p.size > T.largeHtmlBytes), (p) => `${Math.round(p.size / 1024)} KB`), { max: Math.round(T.largeHtmlBytes / 1024) });
  add('no-compression', 'warning', 'performance', 'medium', 'low', u(html200.filter((p) => p.headers && !p.headers.encoding && p.size > 10 * 1024), (p) => `${Math.round(p.size / 1024)} KB`));
  add('lcp-slow', 'warning', 'performance', 'high', 'high', u(html200.filter((p) => p.js?.lcp > T.lcpMs), (p) => `LCP ${(p.js.lcp / 1000).toFixed(1)} s`), { max: T.lcpMs / 1000 });
  add('cls-high', 'warning', 'performance', 'medium', 'medium', u(html200.filter((p) => p.js?.cls > T.cls), (p) => `CLS ${p.js.cls}`), { max: T.cls });
  // Core Web Vitals terrain (CrUX via PageSpeed Insights) : ce que vivent les vrais visiteurs, utilisé par Google.
  const cwvDetail = (p) => ['lcp', 'inp', 'cls'].filter((k) => p.psi.field[k]).map((k) => `${k.toUpperCase()} ${k === 'cls' ? p.psi.field[k].p75 : k === 'lcp' ? (p.psi.field[k].p75 / 1000).toFixed(1) + ' s' : p.psi.field[k].p75 + ' ms'} (${p.psi.field[k].cat})`).join(' · ');
  const withField = html200.filter((p) => p.psi?.field);
  add('cwv-poor', 'error', 'performance', 'high', 'high', u(withField.filter((p) => ['lcp', 'inp', 'cls'].some((k) => p.psi.field[k]?.cat === 'poor')), cwvDetail));
  add('cwv-needs-improvement', 'warning', 'performance', 'medium', 'high', u(withField.filter((p) => !['lcp', 'inp', 'cls'].some((k) => p.psi.field[k]?.cat === 'poor') && ['lcp', 'inp', 'cls'].some((k) => p.psi.field[k]?.cat === 'ni')), cwvDetail));
  add('psi-low-score', 'notice', 'performance', 'medium', 'high', u(html200.filter((p) => p.psi?.score != null && p.psi.score < 50), (p) => `${p.psi.score}/100`));

  // JavaScript (mode rendu)
  const rendered = html200.filter((p) => p.js?.rendered);
  add('js-noindex-changed', 'error', 'javascript', 'high', 'medium', u(rendered.filter((p) => robotsFlags(p.js.rawMetaRobots).noindex !== robotsFlags(p.metaRobots).noindex), (p) => `${p.js.rawMetaRobots || '—'} → ${p.metaRobots || '—'}`));
  add('js-canonical-changed', 'warning', 'javascript', 'high', 'medium', u(rendered.filter((p) => p.js.rawCanonical !== p.canonical), (p) => `${p.js.rawCanonical || '—'} → ${p.canonical || '—'}`));
  add('js-title-changed', 'notice', 'javascript', 'medium', 'medium', u(rendered.filter((p) => p.js.rawTitle !== p.title), (p) => `${p.js.rawTitle || '—'} → ${p.title || '—'}`));
  add('js-content', 'warning', 'javascript', 'high', 'high', u(rendered.filter((p) => p.wordCount - p.js.rawWordCount > 100 && p.wordCount > p.js.rawWordCount * 1.5), (p) => D('d.jsWords', { raw: p.js.rawWordCount, n: p.wordCount })));
  add('js-links', 'warning', 'javascript', 'medium', 'high', u(rendered.filter((p) => p.js.jsOnlyLinks > 5), (p) => D('d.links', { n: p.js.jsOnlyLinks })));
  add('js-h1-changed', 'notice', 'javascript', 'low', 'medium', u(rendered.filter((p) => (p.js.rawH1 || '') !== (p.h1?.[0] || '')), (p) => `${p.js.rawH1 || '—'} → ${p.h1?.[0] || '—'}`));
  add('js-errors', 'notice', 'javascript', 'low', 'medium', u(rendered.filter((p) => p.js.consoleErrors?.length), (p) => p.js.consoleErrors[0]));

  // URLs
  // Règles d'URL sur les pages indexables seulement (pas les images, PDF, redirections ni pages canonicalisées).
  const inside = indexableHtml;
  // Segments de langue-région (/en-US/, /pt-BR/) : convention normale, pas une majuscule fautive.
  const upperPath = (p) => new URL(p.url).pathname.split('/').some((seg) => /[A-Z]/.test(seg) && !/^[a-z]{2,3}[-_][A-Z]{2}$/.test(seg));
  add('url-uppercase', 'notice', 'url', 'low', 'medium', u(inside.filter(upperPath)));
  add('url-underscore', 'notice', 'url', 'low', 'medium', u(inside.filter((p) => new URL(p.url).pathname.includes('_'))));
  // Paramètres de pagination d'une série rel=next/prev : légitimes.
  add('url-params', 'notice', 'url', 'low', 'medium', u(inside.filter((p) => new URL(p.url).search && !((p.relNext || p.relPrev) && /^\?(page|p|paged|pg)=\d+$/i.test(new URL(p.url).search)))));
  add('url-long', 'notice', 'url', 'low', 'medium', u(inside.filter((p) => p.urlLength > T.urlMaxLength), (p) => D('d.chars', { n: p.urlLength, text: '' })), { max: T.urlMaxLength });
  add('url-non-ascii', 'notice', 'url', 'low', 'medium', u(inside.filter((p) => /%[0-9A-F]{2}/i.test(new URL(p.url).pathname))));

  // Balisage & données structurées
  add('lang-missing', 'notice', 'markup', 'low', 'low', u(html200.filter((p) => !p.lang)));
  add('viewport-missing', 'warning', 'markup', 'high', 'low', u(html200.filter((p) => !p.viewport)));
  add('og-missing', 'notice', 'markup', 'low', 'low', u(indexableHtml.filter((p) => !p.og?.title || !p.og?.image)));
  add('schema-missing', 'notice', 'schema', 'medium', 'medium', u(indexableHtml.filter((p) => !p.schemaTypes?.length)));
  add('schema-invalid', 'warning', 'schema', 'medium', 'low', u(html200.filter((p) => p.schemaErrors > 0), (p) => `JSON-LD ×${p.schemaErrors}`));
  add('schema-incomplete', 'warning', 'schema', 'medium', 'low', u(html200.filter((p) => p.schemaMissing?.length), (p) => p.schemaMissing.map((m) => `${m.type}: ${m.missing.join(', ')}`).join(' · ')));

  // Hreflang
  add('hreflang-invalid', 'error', 'hreflang', 'high', 'low', u(html200.filter((p) => p.hreflangInvalid?.length), (p) => p.hreflangInvalid.join(', ')));
  add('hreflang-return', 'warning', 'hreflang', 'high', 'medium', hreflangMissingReturn);
  // Google n'évalue les hreflang que sur les URL canoniques indexables : une page canonicalisée ou noindex n'est pas jugée.
  add('hreflang-self', 'warning', 'hreflang', 'medium', 'low', u(indexableHtml.filter((p) => p.hreflang?.length && !p.hreflang.some((h) => norm(h.href) === p.url))));
  add('hreflang-xdefault', 'notice', 'hreflang', 'low', 'low', u(indexableHtml.filter((p) => p.hreflang?.length && !p.hreflang.some((h) => h.lang.toLowerCase() === 'x-default'))));

  // IA & moteurs génératifs (GEO)
  const blockedBots = (crawler.botAccess || []).filter((b) => b.allowed === false);
  add('search-bots-blocked', 'error', 'ai', 'high', 'low', blockedBots.filter((b) => b.bot === 'Googlebot' || b.bot === 'Bingbot').map((b) => ({ url: crawler.origin + '/robots.txt', detail: b.bot })));
  add('ai-bots-blocked', 'notice', 'ai', 'medium', 'low', blockedBots.filter((b) => b.bot !== 'Googlebot' && b.bot !== 'Bingbot').map((b) => ({ url: crawler.origin + '/robots.txt', detail: b.bot })));
  add('llms-missing', 'notice', 'ai', 'low', 'low', spider && !crawler.llmsTxt && html200.length ? [{ url: crawler.origin + '/llms.txt', detail: '404' }] : []);

  // Problèmes de site (robots.txt, https, sitemap…) : leurs éléments ne sont pas des pages, ils touchent tout le site.
  const pageSet = new Set(pages.map((p) => p.url));
  for (const is of issues) is.scope = is.items.some((it) => pageSet.has(it.url)) ? 'page' : 'site';
  const htmlN = Math.max(1, html200.length);
  for (const is of issues) {
    const n = is.scope === 'site' ? htmlN : is.count;
    const raw = (SEV_W[is.severity] * LVL_W[is.impact] * Math.log2(n + 1)) / LVL_W[is.effort];
    // Une erreur passe toujours avant un avertissement, un avertissement avant une remarque.
    is.priority = Math.round((raw + PRIO_FLOOR[is.severity]) * 10) / 10;
  }
  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);

  // Score de santé : chaque problème retire des points selon sa gravité, son impact et la part de pages touchées,
  // plafonnés par problème. Un défaut de gabarit (un lien cassé dans le menu, présent sur toutes les pages) pèse donc
  // comme un défaut, pas comme autant de défauts que de pages ; un problème de site compte comme touchant tout le site.
  const scored = pages.filter((p) => p.isHtml || p.status >= 300 || !p.status);
  const N = Math.max(1, scored.length);
  const scoredSet = new Set(scored.map((p) => p.url));
  // Combinaison multiplicative : chaque problème retire un pourcentage de ce qui reste (pas de score négatif ni de
  // plancher à 0 dès que plusieurs problèmes s'additionnent).
  let keep = 1;
  const keepByCat = {};
  for (const is of issues) {
    if (is.severity === 'notice') continue;
    const share = is.scope === 'site' ? 1 : Math.min(1, new Set(is.items.map((it) => it.url).filter((u) => scoredSet.has(u))).size / N);
    const pts = Math.min(SCORE_CAP[is.severity] * IMPACT_F[is.impact], 100 * PAGE_W[is.severity] * IMPACT_F[is.impact] * share);
    keep *= 1 - pts / 100;
    keepByCat[is.category] = (keepByCat[is.category] ?? 1) * (1 - pts / 40);
  }
  let score = scored.length ? Math.max(0, Math.round(100 * keep)) : 0;
  // Googlebot ou Bingbot bloqué dans robots.txt : le site ne peut pas être référencé, quelle que soit la qualité des pages.
  if (issues.some((i) => i.id === 'search-bots-blocked')) score = Math.min(score, 15);

  // Score par catégorie : une erreur majeure (30 points) laisse 25 % ; un avertissement plafonné (12 points) 70 %.
  const categories = [...new Set(issues.map((i) => i.category))];
  const categoryScores = {};
  for (const c of categories) categoryScores[c] = Math.max(0, Math.round(100 * (keepByCat[c] ?? 1)));

  const statusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, blocked: 0, none: 0 };
  for (const p of pages) {
    if (p.blockedByRobots) statusBuckets.blocked++;
    else if (!p.status) statusBuckets.none++;
    else statusBuckets[`${String(p.status)[0]}xx`] = (statusBuckets[`${String(p.status)[0]}xx`] || 0) + 1;
  }
  const depthBuckets = {};
  for (const p of pages) {
    const k = p.depth === null ? 'n/a' : p.depth >= 10 ? '10+' : String(p.depth);
    depthBuckets[k] = (depthBuckets[k] || 0) + 1;
  }
  const rt = html200.map((p) => p.responseTime).filter((x) => x != null).sort((a, b) => a - b);

  // Sérialisation compacte des liens : [from, to, ancre, drapeaux, position]
  const urlIndex = new Map();
  const urls = [];
  const idx = (x) => {
    if (!urlIndex.has(x)) {
      urlIndex.set(x, urls.length);
      urls.push(x);
    }
    return urlIndex.get(x);
  };
  const POS = { content: 0, nav: 1, header: 2, footer: 3, aside: 4 };
  const edges = crawler.links.map((l) => [idx(l.from), idx(l.to), l.anchor, (l.nofollow ? 1 : 0) | (l.internal ? 2 : 0) | (l.imageLink ? 4 : 0), POS[l.pos] ?? 0]);
  for (const p of pages) delete p.simhash;

  return {
    version: 2,
    meta: {
      app: 'Arachnide SEO Spider',
      startUrl: crawler.startUrl,
      finalStart: crawler.finalStart,
      origin: crawler.origin,
      mode: crawler.opts.mode,
      startedAt: crawler.startedAt,
      finishedAt: crawler.finishedAt,
      stopped: crawler.stopped,
      rendered: !!crawler.renderer,
      options: { ...crawler.opts, urls: crawler.listUrls ? crawler.listUrls.length : undefined, httpPass: crawler.opts.httpPass ? '••••' : '', customHeaders: crawler.opts.customHeaders ? '••••' : '', psiKey: crawler.opts.psiKey ? '••••' : '', gscCsv: crawler.opts.gscCsv ? true : undefined, googleFetch: undefined },
      gsc: gscMeta,
      psi: psiMeta,
      robotsTxt: crawler.robotsTxt,
      llmsTxt: crawler.llmsTxt,
      botAccess: crawler.botAccess,
      sitemapFiles: crawler.sitemapFiles,
      sitemapUrlCount: crawler.sitemapUrls.size,
      warnings: crawler.warnings,
      uaFallback: !!crawler.uaFallback,
      skipped: crawler.skipped,
      thresholds: T,
    },
    summary: {
      score,
      grade: grade(score),
      categoryScores,
      totalUrls: pages.length,
      htmlPages: html200.length,
      indexable: indexableHtml.length,
      nonIndexable: pages.length - pages.filter((p) => p.indexable).length,
      avgResponseTime: rt.length ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0,
      medianResponseTime: rt.length ? rt[Math.floor(rt.length / 2)] : 0,
      avgWords: html200.length ? Math.round(html200.reduce((a, p) => a + p.wordCount, 0) / html200.length) : 0,
      internalLinks: crawler.links.filter((l) => l.internal).length,
      externalLinks: crawler.links.filter((l) => !l.internal).length,
      uniqueExternal: crawler.externals.size,
      images: crawler.images.size,
      errors: issues.filter((i) => i.severity === 'error').reduce((a, i) => a + i.count, 0),
      warnings: issues.filter((i) => i.severity === 'warning').reduce((a, i) => a + i.count, 0),
      notices: issues.filter((i) => i.severity === 'notice').reduce((a, i) => a + i.count, 0),
      statusBuckets,
      depthBuckets,
    },
    issues,
    pages,
    redirects,
    brokenLinks,
    nearDuplicates: nearDup.sort((a, b) => b.similarity - a.similarity).slice(0, 5000),
    cannibalization: cannibal.map(([keyword, arr]) => ({ keyword, urls: arr.map((p) => p.url) })),
    images: imgs.map((i) => ({ src: i.src, role: i.role, of: i.of || undefined, descriptor: i.descriptor || undefined, media: i.media || undefined, format: (i.type || i.contentType).replace(/^image\//, '').replace('jpeg', 'jpg').replace('svg+xml', 'svg') || imageFormat(i.src), responsive: i.responsive || undefined, picture: i.picture || undefined, variants: i.variantCount || undefined, alt: [...i.alts].join(' | '), missingAlt: i.missingAlt, emptyAlt: i.emptyAlt || undefined, pages: i.pages.size, firstPage: [...i.pages][0], status: i.status, size: i.size })),
    gscOnly,
    externals: [...crawler.externals.values()].map((e) => ({ url: e.url, status: e.status, statusText: e.statusText || '', inlinks: e.inlinks, pages: e.pages.size, firstPage: [...e.pages][0] })),
    links: { urls, edges },
  };
}
