// Test « singe » : un internaute pressé clique au hasard partout, tape n'importe quoi dans les champs (texte très long,
// emoji, HTML, regex cassées, nombres absurdes), redimensionne la fenêtre… pendant quelques centaines d'actions.
// La graine est fixe (MONKEY_SEED pour en essayer une autre) : un échec se rejoue à l'identique, journal à l'appui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, demoCrawlFile, startApp, openApp } from './ui-helpers.mjs';

const pw = loadPlaywright();
const SEED = Number(process.env.MONKEY_SEED) || 20261016;
const STEPS = Number(process.env.MONKEY_STEPS) || 150;
const JUNK = ['', ' ', '(', '[a-', '.*', '/en/(.*)', '\\', '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', '🕷️🔥', 'שלום', '-5', '1e309', 'NaN', '0', '999999999', 'x'.repeat(5000), '%E0%A4%A', 'javascript:alert(1)', '/blog/*\n/en'];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('interface : 150 actions au hasard sans erreur JavaScript ni script injecté', { skip: !pw && 'Playwright introuvable', timeout: 300000 }, async () => {
  const { file } = await demoCrawlFile();
  const app = await startApp();
  let browser;
  try {
    const o = await openApp(pw, app.url, file);
    if (!o) return;
    browser = o.browser;
    const { page, errors, dialogs } = o;
    const rand = rng(SEED);
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const log = [];
    // Pas d'action qui quitte l'application ou ouvre une fenêtre externe (lien sortant, impression, téléchargement).
    const SAFE = 'button:not([disabled]):not([data-exp]):not(#mapFull), select, input:not([type=file]), textarea, summary, [data-goto], [role=tab], [data-tab]';
    for (let i = 0; i < STEPS; i++) {
      const r = rand();
      try {
        if (r < 0.06) {
          const id = pick(await page.$$eval('#tabs [data-tab]:not([disabled])', (bs) => bs.map((b) => b.dataset.tab)));
          log.push(`tab ${id}`);
          await page.evaluate((x) => document.querySelector(`#tabs [data-tab="${x}"]`)?.click(), id);
        } else if (r < 0.1) {
          const w = pick([360, 390, 768, 1024, 1280, 1600]);
          log.push(`resize ${w}`);
          await page.setViewportSize({ width: w, height: pick([640, 800, 1000]) });
        } else if (r < 0.16) {
          const k = pick(['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'Shift+Tab']);
          log.push(`key ${k}`);
          await page.keyboard.press(k);
        } else {
          // Éléments visibles repérés en un seul aller-retour avec la page (rapide), puis choisis au hasard.
          const count = await page.evaluate((sel) => {
            let k = 0;
            for (const e of document.querySelectorAll('[data-monkey]')) e.removeAttribute('data-monkey');
            for (const e of document.querySelectorAll(sel)) {
              const r = e.getBoundingClientRect();
              if (r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]')) e.setAttribute('data-monkey', k++);
            }
            return k;
          }, SAFE);
          if (!count) continue;
          const el = await page.$(`[data-monkey="${Math.floor(rand() * count)}"]`);
          if (!el) continue;
          const desc = await el.evaluate((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[name=' + e.name + ']' : ''}${e.dataset.f ? '[data-f=' + e.dataset.f + ']' : ''} ${(e.textContent || '').trim().slice(0, 30)}`).catch(() => '?');
          const tag = await el.evaluate((e) => e.tagName + ':' + (e.type || '')).catch(() => '');
          if (/^(INPUT:(text|search|number|url|email|password)|TEXTAREA)/.test(tag)) {
            const v = pick(JUNK);
            log.push(`type "${v.slice(0, 20)}" → ${desc}`);
            await el.fill(v, { timeout: 1000 });
            await el.dispatchEvent('change');
          } else if (tag.startsWith('SELECT')) {
            const opts = await el.evaluate((e) => [...e.options].map((o) => o.value));
            const v = pick(opts);
            log.push(`select ${v} → ${desc}`);
            await el.selectOption(v, { timeout: 1000 });
          } else {
            const n = rand() < 0.15 ? 2 : 1;
            log.push(`click×${n} → ${desc}`);
            await el.click({ clickCount: n, timeout: 1000 });
          }
        }
      } catch {
        // Élément disparu entre le choix et l'action (rendu en cours) : comportement normal, on continue.
      }
      await page.waitForTimeout(30);
      if (errors.length || dialogs.length) break;
    }
    const ctxMsg = `graine ${SEED}, dernières actions :\n${log.slice(-12).join('\n')}`;
    assert.deepEqual(dialogs, [], `script injecté exécuté — ${ctxMsg}`);
    assert.deepEqual(errors, [], ctxMsg);
    // L'application répond toujours après la tempête.
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => !!document.querySelector('#tabs [data-tab]')));
  } finally {
    await browser?.close();
    app.child.kill();
  }
});
