// Comparaison de deux crawls (évolution entre deux audits).
export function compareResults(cur, prev) {
  if (!cur || !prev) return null;
  const prevIssues = new Map(prev.issues.map((i) => [i.id, i]));
  const curIssues = new Map(cur.issues.map((i) => [i.id, i]));
  const ids = new Set([...prevIssues.keys(), ...curIssues.keys()]);
  const prevUrls = new Set(prev.pages.map((p) => p.url));
  const curUrls = new Set(cur.pages.map((p) => p.url));
  // Comparaison URL par URL : une URL « corrigée » doit avoir été recrawlée sans le problème. Une URL absente du
  // nouveau crawl (arrêté plus tôt, exclue…) n'est ni corrigée ni empirée : elle est « non revérifiée ».
  const issues = [...ids].map((id) => {
    const c = curIssues.get(id);
    const p = prevIssues.get(id);
    const cu = new Set((c?.items || []).map((it) => it.url));
    const pu = new Set((p?.items || []).map((it) => it.url));
    const fixedUrls = [...pu].filter((u) => !cu.has(u) && (curUrls.has(u) || !prevUrls.has(u)));
    const notRechecked = [...pu].filter((u) => !cu.has(u) && prevUrls.has(u) && !curUrls.has(u));
    const newUrls = [...cu].filter((u) => !pu.has(u));
    return {
      id,
      severity: (c || p).severity,
      category: (c || p).category,
      cur: c?.count || 0,
      prev: p?.count || 0,
      delta: (c?.count || 0) - (p?.count || 0),
      fixedUrls: fixedUrls.slice(0, 50),
      newUrls: newUrls.slice(0, 50),
      fixedCount: fixedUrls.length,
      newCount: newUrls.length,
      notRechecked: notRechecked.length,
    };
  });
  // Écart de plus de 20 % du nombre d'URL, ou crawl interrompu : la comparaison est à prendre avec prudence.
  const sizeGap = prevUrls.size ? Math.abs(curUrls.size - prevUrls.size) / prevUrls.size : 0;
  const reliable = sizeGap <= 0.2 && !cur.meta?.stopped && !prev.meta?.stopped;
  return {
    reliable,
    prevDate: prev.meta.finishedAt,
    prevScore: prev.summary.score,
    scoreDelta: cur.summary.score - prev.summary.score,
    // Corrigé : plus aucune occurrence ET toutes les URL concernées ont été revérifiées.
    fixed: issues.filter((i) => i.prev > 0 && i.cur === 0 && !i.notRechecked),
    unverified: issues.filter((i) => i.prev > 0 && i.cur === 0 && i.notRechecked),
    appeared: issues.filter((i) => i.prev === 0 && i.cur > 0),
    improved: issues.filter((i) => i.prev > 0 && i.cur > 0 && i.delta < 0),
    worsened: issues.filter((i) => i.prev > 0 && i.delta > 0),
    // Même nombre mais d'autres URL : le problème a bougé, il n'est pas « inchangé ».
    changed: issues.filter((i) => i.delta === 0 && (i.fixedCount || i.newCount)),
    issues: issues.sort((a, b) => a.delta - b.delta),
    urlsAdded: [...curUrls].filter((u) => !prevUrls.has(u)).length,
    urlsRemoved: [...prevUrls].filter((u) => !curUrls.has(u)).length,
    summary: ['errors', 'warnings', 'notices', 'totalUrls', 'indexable'].map((k) => ({ k, prev: prev.summary[k], cur: cur.summary[k] })),
  };
}
