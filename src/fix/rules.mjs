// Règles déterministes : corrections calculées sans IA à partir du résultat du crawl.
import { makeFix } from './schema.mjs';
import { forEachLink, linkUrls } from '../../public/shared/links.js';

const segs = (u) => {
  try {
    return decodeURIComponent(new URL(u).pathname).toLowerCase().split(/[/_.-]+/).filter((s) => s && !/^(html?|php|aspx?)$/.test(s));
  } catch {
    return [];
  }
};
const parentPath = (u) => new URL(u).pathname.replace(/\/[^/]*\/?$/, '/') || '/';

// Candidats préparés une fois : mots du chemin et dossier parent de chaque URL, regroupés par dossier.
// Sur un gros site, closestUrl est appelée pour chaque 404 : recalculer les mots de tous les candidats à chaque appel
// coûtait O(404 × candidats) analyses d'URL.
export function prepareCandidates(urls) {
  const all = [];
  const byParent = new Map();
  for (const url of urls) {
    let parent;
    try {
      parent = parentPath(url);
    } catch {
      continue;
    }
    const e = { url, segs: new Set(segs(url)), parent };
    all.push(e);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(e);
  }
  return { prepared: true, all, byParent };
}

const SAME_PARENT_BONUS = 0.15;

// URL la plus proche d'une URL en 404 : mots du chemin en commun (Jaccard), bonus pour le même dossier parent.
// Retourne { url, score } ou null. Candidats : pages HTML 200 indexables (tableau d'URL ou prepareCandidates()).
export function closestUrl(missing, candidates) {
  const P = candidates?.prepared ? candidates : prepareCandidates(candidates || []);
  const a = new Set(segs(missing));
  let parent = null;
  try {
    parent = parentPath(missing);
  } catch {}
  const scoreOf = (e) => {
    let inter = 0;
    for (const x of a) if (e.segs.has(x)) inter++;
    const union = a.size + e.segs.size - inter || 1;
    return inter / union + (e.parent === parent ? SAME_PARENT_BONUS : 0);
  };
  let best = null;
  const consider = (list) => {
    for (const e of list) {
      const score = scoreOf(e);
      if (!best || score > best.score) best = { url: e.url, score };
    }
  };
  // Le dossier parent d'abord : une très bonne correspondance (tous les mots en commun) y est définitive,
  // aucun candidat d'un autre dossier ne peut la dépasser.
  consider(P.byParent.get(parent) || []);
  if (!best || best.score < 1 + SAME_PARENT_BONUS) consider(P.all);
  return best && best.score > 0 ? { url: best.url, score: Math.min(1, best.score) } : null;
}

const byUrlOf = (R) => new Map(R.pages.map((p) => [p.url, p]));

// Redirections connues, indexées une fois par URL de départ.
const redirectMap = (R) => new Map((R.redirects || []).map((x) => [x.url, x]));

// Suit les redirections connues jusqu'à la destination finale.
function finalOf(redirects, url) {
  const r = redirects.get(url);
  return r && !r.loop ? { url: r.finalUrl, status: r.finalStatus } : null;
}

// Liens sortants par page (indices dans R.links.urls), construits une fois : parcourir toutes les arêtes pour
// chaque page coûtait O(pages × liens).
function outlinkIndex(R) {
  const out = new Map();
  forEachLink(R, (f, to) => {
    if (!out.has(f)) out.set(f, []);
    out.get(f).push(to);
  });
  return out;
}

export function deterministicFixes(R, issue) {
  const pages = byUrlOf(R);
  const home = R.meta.finalStart || R.meta.startUrl;
  const redirects = redirectMap(R);
  // Index coûteux, construits seulement si le problème en a besoin.
  let candidates = null;
  let urlIndex = null;
  let outlinks = null;
  const out = [];
  const urls = [...new Set(issue.items.map((it) => it.url))];
  for (const url of urls) {
    const p = pages.get(url);
    const base = { issueType: issue.id, url, method: 'deterministic' };
    if (issue.id === '4xx') {
      if (!p || ![404, 410].includes(p.status)) continue;
      candidates ||= prepareCandidates(R.pages.filter((p) => p.isHtml && p.status === 200 && p.indexable && p.url !== home).map((p) => p.url));
      const best = closestUrl(url, candidates);
      const target = best && best.score >= 0.25 ? best.url : home;
      out.push(makeFix({ ...base, kind: 'redirect', oldValue: null, newValue: target, confidence: best && target === best.url ? Math.round(best.score * 100) / 100 : 0.3, rationale: target === home ? 'fix.r.redirectHome' : 'fix.r.redirectClosest' }));
    } else if (issue.id === 'canonical-missing') {
      out.push(makeFix({ ...base, kind: 'canonical', oldValue: null, newValue: url, confidence: 0.95, rationale: 'fix.r.canonicalSelf' }));
    } else if (issue.id === 'canonical-non200' || issue.id === 'canonical-multiple') {
      if (!p) continue;
      const fin = p.canonical ? finalOf(redirects, p.canonical) : null;
      const target = fin && fin.status === 200 && pages.get(fin.url)?.indexable ? fin.url : url;
      out.push(makeFix({ ...base, kind: 'canonical', oldValue: p.canonical || null, newValue: target, confidence: target === url ? 0.8 : 0.9, rationale: target === url ? 'fix.r.canonicalSelf' : 'fix.r.canonicalFinal' }));
    } else if (issue.id === 'noindex' || issue.id === 'sitemap-non-indexable') {
      // noindex « accidentel » : la page est dans le sitemap, reçoit des liens ou du trafic Google.
      if (!p || p.indexabilityReason !== 'noindex') continue;
      const signals = (p.inSitemap ? 1 : 0) + ((p.uniqueInlinks || 0) >= 3 ? 1 : 0) + ((p.gsc?.clicks || 0) > 0 ? 1 : 0);
      if (!signals) continue;
      out.push(makeFix({ ...base, kind: 'noindex', oldValue: true, newValue: false, confidence: Math.min(0.9, 0.4 + signals * 0.2), rationale: 'fix.r.noindexAccidental' }));
    } else if (issue.id === 'links-to-redirect') {
      // Un Fix par lien : href qui redirige → URL finale (200).
      const idx = linkUrls(R);
      urlIndex ||= new Map(idx.map((u, i) => [u, i]));
      outlinks ||= outlinkIndex(R);
      const seen = new Set();
      for (const toI of outlinks.get(urlIndex.get(url)) || []) {
        const to = idx[toI];
        if (seen.has(to)) continue;
        const fin = finalOf(redirects, to);
        if (!fin || fin.status !== 200 || fin.url === to) continue;
        seen.add(to);
        out.push(makeFix({ ...base, kind: 'link', selector: to, oldValue: to, newValue: fin.url, confidence: 0.95, rationale: 'fix.r.linkFinal' }));
      }
    }
  }
  return out;
}
