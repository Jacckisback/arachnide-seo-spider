// Changements de sitemap (3.23) : comparer le sitemap actuel (ou une liste) à une référence (crawl précédent, ancien
// sitemap, liste d'URL), ne crawler que ce qui a changé, et trancher pour chaque URL retirée : la garder, la rediriger
// (vers quelle page), la passer en 410, ou réparer. Cas d'usage : les produits retirés d'une boutique, sans recrawler
// tout le site.
//
//   diffUrls(current, previous)           → { removed, added, kept }
//   previousUrlsOf(R)                     → URL de référence d'un crawl enregistré (sitemap ou liste)
//   parseUrlList(text)                    → URL d'un sitemap XML, d'un index (locs) ou d'une liste texte
//   readSitemapUrls(url, fetchText)       → URL d'un sitemap ou d'un index distant (sous-sitemaps lus en largeur)
//   buildSitemapChanges(crawler, pages)   → { rows, counts } : une décision par URL retirée / ajoutée

export const CHANGE_KINDS = ['removed', 'added', 'both'];
// Décisions possibles, dans l'ordre d'affichage. Les « *-ok » n'appellent aucune action.
export const DECISIONS = ['redirect-suggested', 'gone-410', 'redirect-broken', 'error', 'live', 'added-bad', 'redirect-chain', 'redirect-ok', 'gone-ok', 'noindex', 'added-ok'];
export const ACTION_DECISIONS = new Set(['redirect-suggested', 'gone-410', 'redirect-broken', 'error', 'live', 'added-bad', 'redirect-chain']);
const MAX_HOPS = 10;
const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
const decodeXml = (v) => v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

export function diffUrls(current, previous) {
  const cur = current instanceof Set ? current : new Set(current);
  const prev = previous instanceof Set ? previous : new Set(previous);
  const removed = [];
  const added = [];
  let kept = 0;
  for (const u of prev) if (!cur.has(u)) removed.push(u);
  for (const u of cur) if (prev.has(u)) kept++; else added.push(u);
  return { removed, added, kept };
}

// URL de référence d'un crawl : en mode liste, les URL de la liste (pas celles atteintes par redirection) ; en mode
// spider, les URL du sitemap.
export function previousUrlsOf(R) {
  if (R.sitemapUrls?.length) return R.sitemapUrls; // crawl de changements : le sitemap complet lu ce jour-là
  const pages = R.pages || [];
  if (R.meta?.mode === 'list') return pages.filter((p) => p.via !== 'redirect').map((p) => p.url);
  return pages.filter((p) => p.inSitemap).map((p) => p.url);
}

// Sitemap XML (urlset ou index : toutes les <loc>), ou texte : une URL par ligne, lignes vides et commentaires ignorés.
export function parseUrlList(text) {
  const s = String(text || '');
  if (/<(urlset|sitemapindex)[\s>]/i.test(s)) return [...s.matchAll(LOC_RE)].map((m) => decodeXml(m[1]).trim()).filter((u) => /^https?:\/\//i.test(u));
  return s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l));
}

// Sitemap ou index distant : les sous-sitemaps sont lus en largeur (au plus 500 fichiers). fetchText(url) → texte | null.
export async function readSitemapUrls(url, fetchText, { maxFiles = 500 } = {}) {
  const toFetch = [url];
  const done = new Set();
  const out = [];
  const seen = new Set();
  while (toFetch.length && done.size < maxFiles) {
    const sm = toFetch.shift();
    if (done.has(sm)) continue;
    done.add(sm);
    const xml = await fetchText(sm);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const locs = [...xml.matchAll(LOC_RE)].map((m) => decodeXml(m[1]).trim());
    if (/<sitemapindex/i.test(xml)) for (const l of locs) toFetch.push(l);
    else for (const l of locs) if (/^https?:\/\//i.test(l) && !seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  }
  return { urls: out, files: done.size };
}

// Score de proximité entre deux URL (dossiers communs, mots du slug communs) : la page la plus proche parmi les URL
// encore dans le sitemap est la cible de 301 proposée. 0 → rien de comparable (→ 410).
export function similarity(url, candidate) {
  const segs = (u) => new URL(u).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  const words = (ss) => new Set(ss.join('-').split(/[-_.%+]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w)));
  const a = segs(url);
  const b = segs(candidate);
  let folders = 0;
  for (let i = 0; i < Math.min(a.length, b.length) - 1 && a[i] === b[i]; i++) folders++;
  const wa = words(a.slice(-1));
  const wb = words(b.slice(-1));
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  const union = new Set([...wa, ...wb]).size;
  const slug = union ? common / union : 0;
  // Dossier partagé et slug proche pèsent ensemble ; un slug identique dans un autre dossier reste pertinent.
  return Math.round(100 * Math.min(1, 0.35 * Math.min(folders, 2) / 2 + 0.65 * slug));
}

export function suggestTarget(url, candidates, { min = 34 } = {}) {
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (c === url) continue;
    const s = similarity(url, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= min ? { url: best, score: bestScore } : null;
}

// Décision par URL. crawler : sitemapRemoved, sitemapAdded, sitemapCurrent (Set), normalize(). pages : après analyse
// (indexable, indexabilityReason).
export function buildSitemapChanges(crawler, pages) {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const current = [...(crawler.sitemapCurrent || [])];
  const rows = [];
  const final = (p) => {
    // Suit la chaîne de redirections dans les pages crawlées : { url, status, hops, loop }.
    let cur = p;
    let hops = 0;
    const seen = new Set([p.url]);
    while (cur && cur.status >= 300 && cur.status < 400 && cur.redirectUrl && hops < MAX_HOPS) {
      hops++;
      const next = crawler.normalize ? crawler.normalize(cur.redirectUrl) || cur.redirectUrl : cur.redirectUrl;
      if (seen.has(next)) return { url: next, status: cur.status, hops, loop: true };
      seen.add(next);
      const np = byUrl.get(next);
      if (!np) return { url: next, status: null, hops, loop: false, external: !crawler.isInternal || !crawler.isInternal(next) };
      cur = np;
    }
    return { url: cur.url, status: cur.status, hops, loop: false, tooMany: hops >= MAX_HOPS && cur.status >= 300 && cur.status < 400 };
  };
  const decide = (p, change) => {
    const st = p.status || 0;
    const row = { url: p.url, change, status: st, indexable: !!p.indexable, indexabilityReason: p.indexabilityReason || '', redirectUrl: p.redirectUrl || '', finalUrl: '', finalStatus: null, hops: 0, decision: '', suggest: '', score: 0 };
    if (change === 'added') {
      row.decision = st >= 200 && st < 300 && p.indexable ? 'added-ok' : 'added-bad';
      if (st >= 300 && st < 400) {
        const f = final(p);
        Object.assign(row, { finalUrl: f.url, finalStatus: f.status, hops: f.hops });
      }
      return row;
    }
    if (st >= 300 && st < 400 && p.redirectUrl) {
      const f = final(p);
      Object.assign(row, { finalUrl: f.url, finalStatus: f.status, hops: f.hops });
      if (f.loop || f.tooMany || (f.status !== null && !(f.status >= 200 && f.status < 300))) row.decision = 'redirect-broken';
      else row.decision = f.hops > 1 ? 'redirect-chain' : 'redirect-ok';
      return row;
    }
    if (st >= 200 && st < 300) {
      row.decision = p.indexable ? 'live' : 'noindex';
      return row;
    }
    if (st === 410) {
      row.decision = 'gone-ok';
      return row;
    }
    if (st === 404) {
      const s = suggestTarget(p.url, current);
      if (s) Object.assign(row, { decision: 'redirect-suggested', suggest: s.url, score: s.score });
      else row.decision = 'gone-410';
      return row;
    }
    row.decision = 'error'; // 0 (réseau, délai), 3xx sans Location, 401 / 403 / 429, 5xx
    return row;
  };
  for (const u of crawler.sitemapRemoved || []) {
    const p = byUrl.get(u);
    if (p) rows.push(decide(p, 'removed'));
  }
  for (const u of crawler.sitemapAdded || []) {
    const p = byUrl.get(u);
    if (p) rows.push(decide(p, 'added'));
  }
  const order = new Map(DECISIONS.map((d, i) => [d, i]));
  rows.sort((a, b) => order.get(a.decision) - order.get(b.decision) || a.url.localeCompare(b.url));
  const counts = {};
  for (const d of DECISIONS) counts[d] = 0;
  for (const r of rows) counts[r.decision]++;
  counts.actions = rows.filter((r) => ACTION_DECISIONS.has(r.decision)).length;
  return { rows, counts };
}

// Référence résolue en liste d'URL avant le lancement : un crawl enregistré (sitemapPreviousCrawl), un texte
// (sitemapPreviousText : sitemap XML, index ou liste), ou déjà une liste (sitemapPrevious). loadCrawl(name) → résultat.
export async function resolveSitemapPrevious(opts, { loadCrawl, fetchText } = {}) {
  if (Array.isArray(opts.sitemapPrevious) && opts.sitemapPrevious.length) return opts;
  if (opts.sitemapPreviousCrawl && loadCrawl) {
    const R = await loadCrawl(opts.sitemapPreviousCrawl);
    if (!R) throw Object.assign(new Error(`Previous crawl not found: ${opts.sitemapPreviousCrawl}`), { status: 404, key: 'toast.openFailed' });
    opts.sitemapPrevious = previousUrlsOf(R);
    opts.sitemapPreviousSource = { type: 'crawl', name: opts.sitemapPreviousCrawl, date: R.meta?.finishedAt || '' };
  } else if (opts.sitemapPreviousText) {
    opts.sitemapPrevious = parseUrlList(opts.sitemapPreviousText);
    opts.sitemapPreviousSource = opts.sitemapPreviousSource || { type: 'text', name: '', date: '' };
  } else if (opts.sitemapPreviousUrl && fetchText) {
    const { urls } = await readSitemapUrls(opts.sitemapPreviousUrl, fetchText);
    opts.sitemapPrevious = urls;
    opts.sitemapPreviousSource = { type: 'sitemap', name: opts.sitemapPreviousUrl, date: '' };
  }
  delete opts.sitemapPreviousText;
  if (Array.isArray(opts.sitemapPrevious) && !opts.sitemapPrevious.length) throw Object.assign(new Error('The sitemap reference contains no URL.'), { status: 400, key: 'toast.sitemapPreviousEmpty' });
  return opts;
}
