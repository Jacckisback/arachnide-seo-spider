// Extraction par regex hors du fil principal, avec délai : au-delà, le Worker est terminé et relancé, la page garde
// « ⚠ timeout » pour cette règle et le crawl continue. Créé seulement quand une règle regex existe.
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./regex-worker.mjs', import.meta.url));

export class RegexRunner {
  constructor({ timeoutMs = 2000, onTimeout = () => {} } = {}) {
    this.timeoutMs = timeoutMs;
    this.onTimeout = onTimeout;
    this.worker = null;
    this.pending = new Map();
    this.seq = 0;
  }
  spawn() {
    const w = new Worker(WORKER);
    w.on('message', ({ id, out }) => {
      const p = this.pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.resolve(out);
    });
    w.on('error', () => this.failAll('⚠ error'));
    w.on('exit', () => {
      if (this.worker === w) this.worker = null;
    });
    w.unref();
    this.worker = w;
    return w;
  }
  failAll(value) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.resolve(Object.fromEntries(p.rules.map((r) => [r.name, [value]])));
    }
  }
  // Une page à la fois par Worker : les règles sont courtes, l'attente est celle du parse.
  run(html, rules) {
    if (!rules.length) return Promise.resolve({});
    const w = this.worker || this.spawn();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.onTimeout(rules);
        // Le Worker est perdu dans sa regex : on le tue, le suivant repart propre.
        w.terminate().catch(() => {});
        if (this.worker === w) this.worker = null;
        resolve(Object.fromEntries(rules.map((r) => [r.name, ['⚠ timeout']])));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer, rules });
      w.postMessage({ id, html, rules });
    });
  }
  async close() {
    this.failAll('⚠ closed');
    await this.worker?.terminate().catch(() => {});
    this.worker = null;
  }
}
