// Tests de bout en bout de l'interface (navigateur réel, Playwright) : on importe un vrai crawl et on clique
// partout comme un utilisateur. Ignorés si Playwright (ou Chromium) n'est pas disponible sur la machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright, demoCrawlFile, startApp, openApp } from './ui-helpers.mjs';

const pw = loadPlaywright();

test('interface : parcours complet sans erreur (navigation, cartographie, filtres, export)', { skip: !pw && 'Playwright introuvable', timeout: 180000 }, async () => {
  const { file, base } = await demoCrawlFile();
  const app = await startApp();
  let browser;
  try {
    const o = await openApp(pw, app.url, file);
    if (!o) return; // Chromium absent : rien à tester ici
    browser = o.browser;
    const { page, errors, dialogs } = o;

    // 1. Toutes les pages de l'interface s'ouvrent, sans erreur ni débordement horizontal.
    const tabs = await page.$$eval('#tabs [data-tab]', (bs) => bs.map((b) => b.dataset.tab));
    for (const id of tabs) {
      await page.evaluate((x) => document.querySelector(`#tabs [data-tab="${x}"]`)?.click(), id);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `débordement horizontal : ${id}`);
    }

    // 2. Cartographie : style classique et arbre horizontal par défaut.
    await page.evaluate(() => document.querySelector('#tabs [data-tab=viz]').click());
    await page.waitForSelector('#mapCanvas canvas');
    assert.ok(await page.$('.map.classic'));
    assert.equal(await page.$('[data-dim]'), null); // la cartographie est un plan 2D, sans bascule 3D

    // 3. Répertoires : « /en » porte son dossier, aucune URL « /en/ » inventée.
    await page.click('[data-mode=dir]');
    await page.waitForSelector('#mapCanvas canvas');
    await page.fill('#mapSearch', '/en');
    await page.waitForSelector('#mapResults li[data-goto]');
    const results = await page.$$eval('#mapResults li[data-goto]', (lis) => lis.map((l) => new URL(l.dataset.goto).pathname));
    assert.ok(results.includes('/en') && !results.includes('/en/'));
    await page.dispatchEvent(`#mapResults li[data-goto="${base}/en"]`, 'mousedown');
    await page.waitForFunction(() => document.querySelector('#mapInspector .mi-title')?.textContent.includes('Web agency'));

    // 4. Filtres : dossier à tout niveau, motifs d'URL, motif invalide signalé sans plantage.
    await page.click('#mapFiltersBtn');
    const folders = await page.$$eval('[data-f=dir] option', (os) => os.map((o) => o.value));
    assert.ok(folders.includes('/en/') && folders.includes('/en/blog/') && folders.includes('/blog/'), folders.join());
    await page.fill('[data-f=urlExc]', '/en/(.*)\n/en');
    await page.dispatchEvent('[data-f=urlExc]', 'change');
    await page.waitForSelector('.map-chip');
    assert.match(await page.textContent('#mapChips'), /Exclure : \/en\/\(\.\*\), \/en/);
    await page.fill('[data-f=urlInc]', '(');
    await page.dispatchEvent('[data-f=urlInc]', 'change');
    await page.waitForSelector('.mf-bad');
    await page.click('#mapFiltersReset');

    // 5. Deux onglets : Cartographie (classique, 2D) et Visualisation 2D / 3D (sombre), tous les modes.
    for (const [tab, key, look, dims] of [['viz', 'map', 'classic', ['2d']], ['graph', 'graph', 'dark', ['2d', '3d']]]) {
      for (const mode of ['crawl', 'dir', 'links']) {
        for (const dim of dims) {
          await page.evaluate(([k, m, d]) => localStorage.setItem('arachnide.' + k, JSON.stringify({ mode: m, dim: d })), [key, mode, dim]);
          await page.evaluate(() => document.querySelector('#tabs [data-tab=dashboard]').click());
          await page.evaluate((x) => document.querySelector(`#tabs [data-tab=${x}]`).click(), tab);
          await page.waitForSelector('#mapCanvas canvas, #mapCanvas .empty', { timeout: 20000 });
          assert.ok(await page.$(`.map.${look}`), `${tab}/${mode}/${dim}`);
        }
      }
    }

    // 6. Export PNG prêt à partager (en-tête, légende) : un vrai fichier image.
    await page.evaluate(() => localStorage.setItem('arachnide.map', JSON.stringify({ mode: 'crawl' })));
    await page.evaluate(() => document.querySelector('#tabs [data-tab=dashboard]').click());
    await page.evaluate(() => document.querySelector('#tabs [data-tab=viz]').click());
    await page.waitForSelector('#mapCanvas canvas');
    await page.waitForTimeout(500);
    await page.click('#mapExport summary');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp=png]')]);
    const png = fs.readFileSync(await dl.path());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.length > 5000);

    // 7. Configuration : inclusions / exclusions multiples et « rester dans le dossier de départ ».
    await page.click('#optionsBtn');
    await page.click('[data-cfg=scope]');
    assert.equal(await page.$eval('[name=include]', (e) => e.tagName), 'TEXTAREA');
    assert.ok(await page.$('[name=stayInFolder]'));

    // 8. Mobile : pas de débordement horizontal sur la cartographie.
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);

    assert.deepEqual(dialogs, [], 'aucun script injecté ne doit s’exécuter');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    app.child.kill();
  }
});
