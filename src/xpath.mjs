// Extraction XPath sur le HTML brut : jsdom (dépendance facultative) implémente document.evaluate. Chargé par import()
// à la première règle XPath seulement : son coût par page est élevé, une page sans règle XPath ne le paie jamais.
// En rendu JavaScript, l'extraction se fait dans Chrome (src/renderer.mjs), sans jsdom.
let JSDOM = null;
let unavailable = false;

export async function xpathAvailable() {
  if (JSDOM) return true;
  if (unavailable) return false;
  try {
    ({ JSDOM } = await import('jsdom'));
    return true;
  } catch {
    unavailable = true;
    return false;
  }
}

// Même contrat que les règles CSS : target text | html | attr | count, 50 valeurs de 500 caractères au plus.
export function evaluateXpath(document, rules) {
  const out = {};
  for (const ex of rules) {
    const values = [];
    try {
      const r = document.evaluate(ex.selector, document, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null);
      if (ex.target === 'count') values.push(r.snapshotLength);
      else
        for (let i = 0; i < Math.min(50, r.snapshotLength); i++) {
          const n = r.snapshotItem(i);
          const v = ex.target === 'html' ? n.outerHTML ?? n.textContent : ex.target === 'attr' ? (n.getAttribute?.(ex.attr || 'href') ?? n.nodeValue ?? '') : (n.textContent || n.nodeValue || '').replace(/\s+/g, ' ').trim();
          values.push(String(v ?? '').slice(0, 500));
        }
    } catch {
      values.push('⚠ invalid');
    }
    out[ex.name] = values;
  }
  return out;
}

export async function xpathExtract(html, url, rules) {
  if (!(await xpathAvailable())) return Object.fromEntries(rules.map((r) => [r.name, ['⚠ xpath: install jsdom or enable rendering']]));
  const dom = new JSDOM(html, { url });
  try {
    return evaluateXpath(dom.window.document, rules);
  } finally {
    dom.window.close();
  }
}
