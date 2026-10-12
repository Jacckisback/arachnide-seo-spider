import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGS, getT } from '../public/shared/i18n.js';

const load = async (code) => (await import(`../public/i18n/${code}.js`)).default;
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join();

test('toutes les langues ont les mêmes clés et les mêmes paramètres', async () => {
  const ref = await load('en');
  for (const { code } of LANGS) {
    const d = await load(code);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in ref)), [], `${code}: clés en trop`);
    assert.deepEqual(Object.keys(ref).filter((k) => !(k in d)), [], `${code}: clés manquantes`);
    for (const k of Object.keys(ref)) assert.equal(placeholders(d[k]), placeholders(ref[k]), `${code}: paramètres de ${k}`);
  }
});

test('chaque clé utilisée dans le code existe', async () => {
  const ref = await load('en');
  const src = ['public/app.js', 'public/shared/report.js', 'src/cli.mjs'].map((f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'\s*[,)]/g)].map((m) => m[1]).filter((k) => !k.endsWith('.')));
  for (const m of html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bl: '(col\.[a-zA-Z]+)'/g)) used.add(m[1]);
  const analyze = fs.readFileSync(new URL('../src/analyze.mjs', import.meta.url), 'utf8');
  for (const [, id, , cat] of analyze.matchAll(/add\('([a-z0-9-]+)', '(error|warning|notice)', '([a-z]+)'/g)) {
    for (const s of ['label', 'desc', 'fix']) used.add(`issue.${id}.${s}`);
    used.add('cat.' + cat);
  }
  for (const m of analyze.matchAll(/D\('([a-zA-Z.]+)'/g)) if (!m[1].endsWith('.')) used.add(m[1]);
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const m of app.matchAll(/\{ id: '([a-z0-9]+)'/g)) used.add('tab.' + m[1]);
  for (const m of app.matchAll(/filters: \{([^}]*?)\} \}/gs)) for (const f of m[1].matchAll(/(?:^|[ {,])([a-zA-Z0-9]+): \(/g)) used.add('f.' + f[1]);
  const missing = [...used].filter((k) => !(k in ref));
  assert.deepEqual(missing, []);
});

test('t() remplace les paramètres et formate les nombres', async () => {
  const t = await getT('fr');
  assert.equal(t('progress.crawled', { n: 1234 }), '1 234 URLs crawlées');
  assert.equal((await getT('xx')).lang, 'en');
});
