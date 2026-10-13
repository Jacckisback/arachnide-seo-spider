// Règles déterministes : corrections calculées sans IA à partir du résultat du crawl.
import { makeFix } from './schema.mjs';

const segs = (u) => {
  try {
    return decodeURIComponent(new URL(u).pathname).toLowerCase().split(/[/_.-]+/).filter((s) => s && !/^(html?|php|aspx?)$/.test(s));
  } catch {
    return [];
  }
};
const parentPath = (u) => new URL(u).pathname.replace(/\/[^/]*\/?$/, '/') || '/';

// URL la plus proche d'une URL en 404 : mots du chemin en commun (Jaccard), bonus pour le même dossier parent.
// Retourne { url, score } ou null. Candidats : pages HTML 200 indexables.
export function closestUrl(missing, candidates) {
  const a = new Set(segs(missing));
  let best = null;
  for (const c of candidates) {
    const b = new Set(segs(c));
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size || 1;
    let score = inter / union;
    if (parentPath(c) === parentPath(missing)) score += 0.15;
    if (!best || score > best.score) best = { url: c, score };
  }
  return best && best.score > 0 ? { url: best.url, score: Math.min(1, best.score) } : null;
}

const byUrlOf = (R) => new Map(R.pages.map((p) => [p.url, p]));

// Suit les redirections connues jusqu'à la destination finale.
function finalOf(R, url) {
  const r = (R.redirects || []).find((x) => x.url === url);
  return r && !r.loop ? { url: r.finalUrl, status: r.finalStatus } : null;
}

export function deterministicFixes(R, issue) {
  const pages = byUrlOf(R);
  const home = R.meta.finalStart || R.meta.startUrl;
  const indexable = R.pages.filter((p) => p.isHtml && p.status === 200 && p.indexable).map((p) => p.url);
  const out = [];
  const urls = [...new Set(issue.items.map((it) => it.url))];
  for (const url of urls) {
    const p = pages.get(url);
    const base = { issueType: issue.id, url, method: 'deterministic' };
    if (issue.id === '4xx') {
      if (!p || ![404, 410].includes(p.status)) continue;
      const best = closestUrl(url, indexable.filter((u) => u !== home));
      const target = best && best.score >= 0.25 ? best.url : home;
      out.push(makeFix({ ...base, kind: 'redirect', oldValue: null, newValue: target, confidence: best && target === best.url ? Math.round(best.score * 100) / 100 : 0.3, rationale: target === home ? 'fix.r.redirectHome' : 'fix.r.redirectClosest' }));
    } else if (issue.id === 'canonical-missing') {
      out.push(makeFix({ ...base, kind: 'canonical', oldValue: null, newValue: url, confidence: 0.95, rationale: 'fix.r.canonicalSelf' }));
    } else if (issue.id === 'canonical-non200' || issue.id === 'canonical-multiple') {
      if (!p) continue;
      const fin = p.canonical ? finalOf(R, p.canonical) : null;
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
      const idx = R.links?.urls || [];
      const fromI = idx.indexOf(url);
      const seen = new Set();
      for (const e of R.links?.edges || []) {
        if (e[0] !== fromI) continue;
        const to = idx[e[1]];
        if (seen.has(to)) continue;
        const fin = finalOf(R, to);
        if (!fin || fin.status !== 200 || fin.url === to) continue;
        seen.add(to);
        out.push(makeFix({ ...base, kind: 'link', selector: to, oldValue: to, newValue: fin.url, confidence: 0.95, rationale: 'fix.r.linkFinal' }));
      }
    }
  }
  return out;
}
