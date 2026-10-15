import test from 'node:test';
import assert from 'node:assert/strict';
import { createT } from '../public/shared/i18n.js';
import fr from '../public/i18n/fr.js';
import en from '../public/i18n/en.js';
import { reconcile, summary, visible, isQuickWin, defaultStatus, actionTitles, whyText } from '../public/plan.js';

const t = createT(fr, en, { code: 'fr', locale: 'fr-FR' });
const it = (url) => ({ url, detail: '' });
const issues = [
  { id: 'title-long', severity: 'warning', category: 'titles', impact: 'medium', effort: 'low', count: 2, scope: 'page', priority: 600, params: { max: 580 }, items: [it('https://a.fr/a'), it('https://a.fr/b')] },
  { id: 'duplicate-content', severity: 'error', category: 'content', impact: 'high', effort: 'medium', count: 2, scope: 'page', priority: 1003, items: [it('https://a.fr/a'), it('https://a.fr/b')] },
  { id: 'llms-missing', severity: 'notice', category: 'ai', impact: 'low', effort: 'low', count: 1, scope: 'site', priority: 1, items: [it('https://a.fr/llms.txt')] },
  { id: 'thin-content', severity: 'warning', category: 'content', impact: 'high', effort: 'high', count: 3, scope: 'page', priority: 550, items: [it('https://a.fr/a'), it('https://a.fr/c'), it('https://a.fr/d')] },
];
const R = (list, at = '2026-10-15T10:00:00Z') => ({ issues: list, pages: [], meta: { origin: 'https://a.fr', finishedAt: at } });

test('plan : statuts par défaut, gains rapides et titres d’action', () => {
  assert.equal(defaultStatus(issues[2]), 'review'); // une information est à vérifier
  assert.equal(defaultStatus(issues[0]), 'todo');
  assert.deepEqual(issues.filter(isQuickWin).map((i) => i.id), ['title-long']);
  assert.equal(actionTitles(issues[0], t).title, 'Raccourcir les titres');
  assert.equal(actionTitles(issues[2], t).title, 'Évaluer l’ajout de llms.txt');
});

test('plan : synthèse, « Commencez ici » et filtres', () => {
  const r = R(issues);
  let track = reconcile(null, r);
  let S = summary(r, track, t);
  assert.deepEqual(S.order.map((i) => i.id), ['duplicate-content', 'title-long', 'thin-content', 'llms-missing']);
  assert.equal(S.start.id, 'duplicate-content');
  assert.deepEqual(S.counts, { all: 4, quick: 1, todo: 3, review: 1, doing: 0, validate: 0 });
  assert.deepEqual(S.byEffort, { low: 2, medium: 1, high: 1 });
  // Une action marquée terminée sort des actions à traiter ; « Commencez ici » passe à la suivante.
  track = reconcile({ items: { 'duplicate-content': { status: 'validate', at: '2026-10-15T10:00:00Z' } } }, r);
  S = summary(r, track, t);
  assert.equal(S.remaining.length, 3);
  assert.equal(S.start.id, 'title-long');
  assert.deepEqual(visible(r, track, { filter: 'validate' }, t).map((i) => i.id), ['duplicate-content']);
  assert.deepEqual(visible(r, track, { filter: 'quick' }, t).map((i) => i.id), ['title-long']);
  assert.equal(S.rank.get('thin-content'), 3); // le rang ne dépend pas du filtre
  assert.match(whyText(issues[0], 2, 4, t), /Rang 2 sur 4/);
});

test('plan : seul un nouveau crawl confirme une résolution', () => {
  const saved = { items: { 'duplicate-content': { status: 'validate', at: '2026-10-14T10:00:00Z' }, 'title-long': { status: 'validate', at: '2026-10-14T10:00:00Z' } } };
  // Nouveau crawl : le contenu dupliqué a disparu, les titres trop longs sont toujours là.
  const r = R(issues.filter((i) => i.id !== 'duplicate-content'));
  const track = reconcile(saved, r);
  assert.equal(track.items['duplicate-content'].status, 'resolved');
  assert.equal(track.resolved, 1);
  assert.equal(track.status['title-long'].stillDetected, true);
  // Le problème revient plus tard : il repart à « À faire ».
  const back = reconcile(track, R(issues, '2026-10-16T10:00:00Z'));
  assert.equal(back.status['duplicate-content'].status, 'todo');
  // Marquer terminé sans nouveau crawl ne résout rien.
  const same = reconcile({ items: { 'title-long': { status: 'validate', at: '2026-10-15T10:00:00Z' } } }, R(issues));
  assert.equal(same.status['title-long'].stillDetected, false);
  assert.equal(same.resolved, 0);
});
