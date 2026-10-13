// Moteur de correction : schéma Fix, règles déterministes, validation des réponses IA, file d'attente et 429.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FixSchema, makeFix } from '../src/fix/schema.mjs';
import { closestUrl, deterministicFixes } from '../src/fix/rules.mjs';
import { proposeFixes, fixGroups, estimateCost } from '../src/fix/engine.mjs';
import { AIProvider, AIError, extractJson } from '../src/ai/provider.mjs';

const B = 'https://ex.fr';
const page = (path, extra = {}) => ({ url: B + path, isHtml: true, status: 200, indexable: true, title: 'Titre ' + path, metaDescription: '', h1: ['H1 ' + path], lang: 'fr', ...extra });
const R = {
  meta: { startUrl: B + '/', finalStart: B + '/', origin: B },
  pages: [
    page('/'),
    page('/cours/grammaire-francaise'),
    page('/cours/conjugaison'),
    { url: B + '/cours/grammaire', isHtml: true, status: 404, indexable: false },
    page('/sans-canonical'),
    page('/cachee', { indexable: false, indexabilityReason: 'noindex', inSitemap: true, uniqueInlinks: 5 }),
    { url: B + '/ancienne', isHtml: false, status: 301, redirectUrl: B + '/cours/conjugaison' },
    page('/a-propos', { imagesMissingAltSrc: [B + '/img/prof.jpg'] }),
  ],
  redirects: [{ url: B + '/ancienne', finalUrl: B + '/cours/conjugaison', finalStatus: 200 }],
  links: { urls: [B + '/', B + '/ancienne'], edges: [[0, 1, 'conjugaison', 2, 0]] },
  issues: [
    { id: '4xx', severity: 'error', count: 1, items: [{ url: B + '/cours/grammaire' }] },
    { id: 'canonical-missing', severity: 'notice', count: 1, items: [{ url: B + '/sans-canonical' }] },
    { id: 'noindex', severity: 'notice', count: 1, items: [{ url: B + '/cachee' }] },
    { id: 'links-to-redirect', severity: 'warning', count: 1, items: [{ url: B + '/' }] },
    { id: 'desc-missing', severity: 'warning', count: 2, items: [{ url: B + '/cours/conjugaison' }, { url: B + '/a-propos' }] },
    { id: 'img-alt-missing', severity: 'warning', count: 1, items: [{ url: B + '/a-propos' }] },
    { id: 'slow', severity: 'warning', count: 1, items: [{ url: B + '/' }] },
  ],
};

test('schéma Fix : valeurs valides acceptées, invalides refusées', () => {
  const f = makeFix({ issueType: 'desc-missing', url: B + '/', kind: 'meta_description', oldValue: null, newValue: 'x', method: 'ai', provider: 'openai', confidence: 0.7, rationale: 'r' });
  assert.equal(FixSchema.parse(f).status, 'proposed');
  assert.throws(() => FixSchema.parse({ ...f, method: 'magic' }));
  assert.throws(() => FixSchema.parse({ ...f, confidence: 2 }));
  assert.throws(() => FixSchema.parse({ ...f, url: 'pas une url' }));
});

test('règles déterministes : 301 vers l’URL la plus proche, canonical, noindex accidentel, lien vers l’URL finale', () => {
  assert.equal(closestUrl(B + '/cours/grammaire', [B + '/cours/grammaire-francaise', B + '/a-propos']).url, B + '/cours/grammaire-francaise');
  const all = R.issues.slice(0, 4).flatMap((is) => deterministicFixes(R, is));
  const by = Object.fromEntries(all.map((f) => [f.issueType, f]));
  assert.equal(by['4xx'].target.kind, 'redirect');
  assert.equal(by['4xx'].newValue, B + '/cours/grammaire-francaise');
  assert.equal(by['canonical-missing'].newValue, B + '/sans-canonical');
  assert.deepEqual([by.noindex.oldValue, by.noindex.newValue], [true, false]);
  assert.deepEqual([by['links-to-redirect'].oldValue, by['links-to-redirect'].newValue], [B + '/ancienne', B + '/cours/conjugaison']);
  for (const f of all) assert.equal(FixSchema.parse(f).method, 'deterministic');
});

test('groupes triés par impact et estimation du coût', () => {
  const g = fixGroups(R);
  assert.equal(g[0].id, 'desc-missing'); // 2 pages × warning = 4
  assert.deepEqual(Object.fromEntries(g.map((x) => [x.id, x.method])).slow, 'manual');
  assert.equal(estimateCost(R, ['desc-missing', 'img-alt-missing']).requests, 3);
});

class FakeProvider extends AIProvider {
  static id = 'anthropic';
  constructor(answers) {
    super({ apiKey: 'k', model: 'm' });
    this.answers = answers;
    this.calls = [];
  }
  async complete(req) {
    this.calls.push(req);
    const a = this.answers.shift();
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a(req) : a;
  }
}

test('réponse IA : JSON extrait d’un bloc de code, une seule nouvelle tentative, sinon échec explicite', async () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  const ctx = { url: B + '/', kind: 'meta_description', lang: 'fr', excerpt: 'Cours de français' };
  const ok = new FakeProvider(['oups', '{"newValue":"Apprenez le français en ligne","rationale":"Résume la page","confidence":0.8}']);
  const f = await ok.generateFix({ id: 'desc-missing' }, ctx);
  assert.equal(f.status, 'proposed');
  assert.equal(ok.calls.length, 2);
  assert.match(ok.calls[1].user, /previous answer was invalid/);
  const ko = new FakeProvider(['nope', '{"newValue":""}']);
  const bad = await ko.generateFix({ id: 'desc-missing' }, ctx);
  assert.equal(bad.status, 'failed');
  assert.match(bad.error, /Invalid AI answer after 2 attempts/);
  assert.equal(ko.calls.length, 2);
});

test('« Tout corriger » : contexte minimal, langue de la page, 429 avec backoff, plan d’action pour le non automatisable', async () => {
  const fetchPage = async () => new Response('<html lang="fr"><head><title>T</title></head><body><nav>menu</nav><main><h1>Conjugaison</h1><p>Le présent de l’indicatif.</p></main></body></html>');
  const answers = [new AIError('rate limited', { status: 429, retryAfter: 0 })];
  const prov = new FakeProvider(answers);
  prov.complete = async function (req) {
    this.calls.push(req);
    if (answers.length) throw answers.shift();
    return JSON.stringify({ newValue: 'Valeur proposée', rationale: 'ok', confidence: 0.9 });
  };
  const progress = [];
  const { fixes, errors } = await proposeFixes(R, { issueIds: ['desc-missing', 'img-alt-missing', 'slow', '4xx'], provider: prov, fetch: fetchPage, onProgress: (p) => progress.push(p) });
  assert.deepEqual(errors, []);
  assert.equal(fixes.filter((f) => f.method === 'ai').length, 3);
  assert.ok(fixes.some((f) => f.target.kind === 'image_alt' && f.target.selector === B + '/img/prof.jpg'));
  assert.ok(fixes.some((f) => f.target.kind === 'action_plan' && f.issueType === 'slow'));
  assert.ok(fixes.some((f) => f.target.kind === 'redirect'));
  assert.equal(progress.at(-1).done, 3);
  const first = prov.calls.find((c) => /meta description/.test(c.user));
  assert.match(first.system, /language of the page \(fr\)/);
  assert.match(first.user, /Le présent de l’indicatif/);
  assert.doesNotMatch(first.user, /menu/);
  await assert.rejects(proposeFixes(R, { issueIds: ['desc-missing'], fetch: fetchPage }), /No AI provider/);
});

test('routes sensibles : refusées depuis une autre origine, sans JSON ou via un autre hôte (DNS rebinding)', async () => {
  const { isTrustedRequest } = await import('../src/fix/routes.mjs');
  const req = (method, headers) => ({ method, headers: { host: '127.0.0.1:4000', ...headers } });
  assert.equal(isTrustedRequest(req('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:4000' })), true);
  assert.equal(isTrustedRequest(req('GET', {})), true);
  assert.equal(isTrustedRequest(req('POST', { 'content-type': 'text/plain' })), false);
  assert.equal(isTrustedRequest(req('POST', { 'content-type': 'application/json', origin: 'https://evil.example' })), false);
  assert.equal(isTrustedRequest({ method: 'GET', headers: { host: 'evil.example:4000' } }), false);
});
