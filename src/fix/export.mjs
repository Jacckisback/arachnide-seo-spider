// Export des corrections (CSV, JSON) pour les CMS sans connecteur : à appliquer à la main. Aucun secret inclus.
const COLS = ['status', 'url', 'issueType', 'target', 'selector', 'oldValue', 'newValue', 'method', 'provider', 'confidence', 'rationale', 'appliedAt'];
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function fixesToCsv(fixes) {
  const rows = fixes.map((f) => [f.status, f.url, f.issueType, f.target.kind, f.target.selector, f.oldValue, f.newValue, f.method, f.provider, f.confidence, f.rationale, f.appliedAt]);
  return [COLS, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
