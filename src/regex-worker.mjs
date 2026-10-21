// Fil d'exécution des extractions par expression régulière : une regex à retour arrière catastrophique y tourne sans
// bloquer le crawl ; le fil principal l'interrompt par terminate() au-delà du délai (src/regex-runner.mjs).
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ id, html, rules }) => {
  const out = {};
  for (const ex of rules) {
    const values = [];
    try {
      const re = new RegExp(ex.selector, 'gi');
      for (const m of html.matchAll(re)) {
        values.push((m[1] ?? m[0]).slice(0, 500));
        if (values.length >= 50) break;
      }
    } catch {
      values.push('⚠ invalid');
    }
    out[ex.name] = values;
  }
  parentPort.postMessage({ id, out });
});
