import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, isPageNode } from '../public/viz.js';

test('visualisations : seules les pages sont des nœuds, problèmes et poids par nœud', () => {
  assert.equal(isPageNode({ url: 'https://x.fr/a', isHtml: true, status: 200 }), true);
  assert.equal(isPageNode({ url: 'https://x.fr/img/photo.jpg', status: 200, contentType: 'image/jpeg' }), false);
  assert.equal(isPageNode({ url: 'https://x.fr/doc.pdf', status: 404 }), false);
  assert.equal(isPageNode({ url: 'https://x.fr/flux', status: 200, contentType: 'application/rss+xml' }), false);
  assert.equal(isPageNode({ url: 'https://x.fr/ancienne', status: 301 }), true);
  assert.equal(isPageNode({ url: 'https://x.fr/cassee', status: 404, contentType: 'text/html' }), true);
  const R = {
    meta: { startUrl: 'https://x.fr/' },
    pages: [
      { url: 'https://x.fr/', isHtml: true, status: 200, depth: 0, linkScore: 100, size: 50000 },
      { url: 'https://x.fr/a', isHtml: true, status: 200, depth: 1, linkScore: 10, size: 400000 },
      { url: 'https://x.fr/logo.png', status: 200, contentType: 'image/png', depth: 1 },
    ],
    issues: [{ id: 'title-long', severity: 'warning', params: {}, items: [{ url: 'https://x.fr/a' }] }, { id: '4xx', severity: 'error', params: {}, items: [{ url: 'https://x.fr/a' }] }],
  };
  const graph = { inl: new Map([['https://x.fr/a', [{ from: 'https://x.fr/' }]]]), out: new Map() };
  const g = buildGraph(R, graph, { view: 'crawl', colorBy: 'issues', maxNodes: 100, sizeBy: 'weight' });
  assert.deepEqual(g.nodes.map((n) => n.id), ['https://x.fr/', 'https://x.fr/a']);
  assert.equal(g.resources, 1);
  const a = g.nodes.find((n) => n.id === 'https://x.fr/a');
  assert.deepEqual(a.issues.map((i) => i.id), ['4xx', 'title-long']);
  assert.ok(a.val > g.nodes[0].val);
});
