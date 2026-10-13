import test from 'node:test';
import assert from 'node:assert/strict';
import { computePillars, pillarStatus } from '../public/shared/pillars.js';
import { dashOffset, circumference, topActions } from '../public/overview.js';

const page = (url, extra = {}) => ({ url, status: 200, isHtml: true, responseTime: 120, ...extra });

test('piliers : scores par catégorie, « non mesuré » sans données', () => {
  const pages = [page('https://a.fr/'), page('https://a.fr/b'), page('https://a.fr/c'), page('https://a.fr/d')];
  const issues = [
    { id: 'title-missing', severity: 'error', category: 'titles', impact: 'high', count: 2, scope: 'page', priority: 1, items: [{ url: 'https://a.fr/b' }, { url: 'https://a.fr/c' }] },
    { id: 'no-https', severity: 'error', category: 'security', impact: 'high', count: 1, scope: 'site', priority: 1, items: [{ url: 'https://a.fr/' }] },
  ];
  const by = Object.fromEntries(computePillars({ pages, issues, meta: { mode: 'spider' } }).map((p) => [p.id, p]));
  assert.equal(by.technical.score, 70); // problème de site : 30 points retirés
  assert.equal(by.content.score, 70); // 2 pages sur 4, plafonné à 30
  assert.equal(by.linking.score, 100);
  assert.equal(by.performance.scope, 'server');
  // Mode liste : le maillage n'est pas mesurable ; sans page HTML, rien ne l'est.
  assert.equal(computePillars({ pages, issues: [], meta: { mode: 'list' } }).find((p) => p.id === 'linking').score, null);
  assert.ok(computePillars({ pages: [], issues: [], meta: {} }).every((p) => p.score == null && p.status === 'unmeasured'));
  assert.equal(pillarStatus(95), 'excellent');
  assert.equal(pillarStatus(49), 'critical');
});

test('anneaux : la longueur de l’arc correspond exactement au score', () => {
  const r = 100;
  assert.equal(dashOffset(r, 100), 0);
  assert.equal(dashOffset(r, 0), circumference(r));
  assert.ok(Math.abs(dashOffset(r, 25) - circumference(r) * 0.75) < 1e-9);
  assert.equal(dashOffset(r, 140), 0);
});

test('priorités : pages uniques, pas la somme des occurrences', () => {
  const R = {
    pages: [],
    issues: [
      { id: 'img-alt-missing', severity: 'warning', category: 'images', impact: 'medium', count: 5, scope: 'page', priority: 40, items: [{ url: 'https://a.fr/' }, { url: 'https://a.fr/' }, { url: 'https://a.fr/b' }, { url: 'https://a.fr/b' }, { url: 'https://a.fr/b' }] },
      { id: 'no-https', severity: 'error', category: 'security', impact: 'high', count: 1, scope: 'site', priority: 90, items: [{ url: 'https://a.fr/' }] },
    ],
  };
  const acts = topActions(R);
  assert.equal(acts[0].id, 'no-https');
  assert.equal(acts[0].pages, null);
  assert.equal(acts[1].pages, 2);
});
