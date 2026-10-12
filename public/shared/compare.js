// Comparaison de deux crawls (évolution entre deux audits).
export function compareResults(cur, prev) {
  if (!cur || !prev) return null;
  const prevIssues = new Map(prev.issues.map((i) => [i.id, i]));
  const curIssues = new Map(cur.issues.map((i) => [i.id, i]));
  const ids = new Set([...prevIssues.keys(), ...curIssues.keys()]);
  const issues = [...ids].map((id) => {
    const c = curIssues.get(id);
    const p = prevIssues.get(id);
    return { id, severity: (c || p).severity, category: (c || p).category, cur: c?.count || 0, prev: p?.count || 0, delta: (c?.count || 0) - (p?.count || 0) };
  });
  const prevUrls = new Set(prev.pages.map((p) => p.url));
  const curUrls = new Set(cur.pages.map((p) => p.url));
  return {
    prevDate: prev.meta.finishedAt,
    prevScore: prev.summary.score,
    scoreDelta: cur.summary.score - prev.summary.score,
    fixed: issues.filter((i) => i.prev > 0 && i.cur === 0),
    appeared: issues.filter((i) => i.prev === 0 && i.cur > 0),
    improved: issues.filter((i) => i.prev > 0 && i.cur > 0 && i.delta < 0),
    worsened: issues.filter((i) => i.prev > 0 && i.delta > 0),
    issues: issues.sort((a, b) => a.delta - b.delta),
    urlsAdded: [...curUrls].filter((u) => !prevUrls.has(u)).length,
    urlsRemoved: [...prevUrls].filter((u) => !curUrls.has(u)).length,
    summary: ['errors', 'warnings', 'notices', 'totalUrls', 'indexable'].map((k) => ({ k, prev: prev.summary[k], cur: cur.summary[k] })),
  };
}
