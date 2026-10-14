import test from 'node:test';
import assert from 'node:assert/strict';
import { createT } from '../public/shared/i18n.js';
import fr from '../public/i18n/fr.js';
import en from '../public/i18n/en.js';
import { summarize, filterSort, uniqueUrls, fixSteps, shorten, example } from '../public/issues.js';
import { titlePixels } from '../public/shared/pixel.js';

const t = createT(fr, en, { code: 'fr', locale: 'fr-FR' });
const it = (url, detail = '') => ({ url, detail });
const issues = [
  { id: 'title-long', severity: 'warning', category: 'titles', impact: 'medium', effort: 'low', count: 3, scope: 'page', priority: 600, params: { max: 580 }, items: [it('https://a.fr/a'), it('https://a.fr/b'), it('https://a.fr/c')] },
  { id: 'duplicate-content', severity: 'error', category: 'content', impact: 'high', effort: 'medium', count: 2, scope: 'page', priority: 30, items: [it('https://a.fr/a'), it('https://a.fr/b')] },
  { id: 'img-alt-missing', severity: 'notice', category: 'images', impact: 'low', effort: 'low', count: 4, scope: 'page', priority: 5, items: [it('https://a.fr/a'), it('https://a.fr/a'), it('https://a.fr/b'), it('https://a.fr/b')] },
  { id: 'no-sitemap', severity: 'warning', category: 'sitemap', impact: 'medium', effort: 'low', count: 1, scope: 'site', priority: 550, items: [it('https://a.fr/sitemap.xml')] },
];

test('problèmes : synthèse en types, URL uniques et problèmes de site', () => {
  assert.deepEqual(summarize(issues), { total: 4, error: 1, warning: 2, notice: 1 });
  assert.equal(uniqueUrls(issues[2]), 2); // 4 occurrences sur 2 pages
  assert.equal(uniqueUrls(issues[3]), null);
});

test('problèmes : la priorité recommandée met toujours la gravité en premier', () => {
  const ids = (r) => r.map((i) => i.id);
  assert.deepEqual(ids(filterSort(issues, {}, t)), ['duplicate-content', 'title-long', 'no-sitemap', 'img-alt-missing']);
  assert.deepEqual(ids(filterSort(issues, { sev: 'warning' }, t)), ['title-long', 'no-sitemap']);
  assert.deepEqual(ids(filterSort(issues, { q: 'images' }, t)), ['img-alt-missing']); // recherche sur la catégorie
  assert.deepEqual(ids(filterSort(issues, { sev: 'error', q: 'title' }, t)), []);
  assert.equal(filterSort(issues, { sort: 'urls' }, t)[0].id, 'no-sitemap'); // un problème de site touche tout le site
});

test('problèmes : étapes de correction et suggestion calculée', () => {
  const steps = fixSteps(issues[0], t);
  assert.equal(steps.at(-1), t('istep.recrawl'));
  assert.ok(steps.includes(t('istep.titles')));
  const long = 'Agenda Aix-en-Provence : que faire cette semaine ? Concerts, expos, marchés | Aixenville';
  const s = shorten(long, 580, titlePixels);
  assert.ok(s && titlePixels(s) <= 580 && long.startsWith(s));
  assert.equal(shorten('Court', 580, titlePixels), null);
  const R = { pages: [{ url: 'https://a.fr/a', title: long, titlePx: titlePixels(long) }] };
  const ex = example(issues[0], R);
  assert.equal(ex.value, long);
  assert.ok(ex.px > 580 && ex.suggestionPx <= 580);
  assert.equal(example(issues[2], R), null); // pas d'exemple inventé
});
