// Rendu JavaScript via Chrome / Edge / Chromium déjà installé (puppeteer-core, aucun téléchargement).
import fs from 'node:fs';
import path from 'node:path';

function candidates() {
  const env = [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH].filter(Boolean);
  if (process.platform === 'darwin') {
    return [
      ...env,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return [
      ...env,
      ...roots.flatMap((r) => [
        path.join(r, 'Google/Chrome/Application/chrome.exe'),
        path.join(r, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(r, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(r, 'Chromium/Application/chrome.exe'),
      ]),
    ];
  }
  const pw = '/opt/pw-browsers';
  const pwChromes = fs.existsSync(pw)
    ? fs.readdirSync(pw).filter((d) => d.startsWith('chromium-')).map((d) => path.join(pw, d, 'chrome-linux/chrome'))
    : [];
  return [
    ...env,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
    ...pwChromes,
  ];
}

export function findChrome() {
  return candidates().find((p) => {
    try {
      return p && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) || null;
}

// Script injecté avant le chargement : collecte LCP et CLS (mesures de labo, indicatives).
const VITALS = `
  window.__arachnide = { lcp: 0, cls: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__arachnide.lcp = e.renderTime || e.loadTime || e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__arachnide.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
`;

// Même contrat que src/xpath.mjs, exécuté dans Chrome.
const XPATH_IN_PAGE = (rules) => {
  const out = {};
  for (const ex of rules) {
    const values = [];
    try {
      const r = document.evaluate(ex.selector, document, null, 7, null);
      if (ex.target === 'count') values.push(r.snapshotLength);
      else
        for (let i = 0; i < Math.min(50, r.snapshotLength); i++) {
          const n = r.snapshotItem(i);
          const v = ex.target === 'html' ? n.outerHTML ?? n.textContent : ex.target === 'attr' ? (n.getAttribute ? n.getAttribute(ex.attr || 'href') : n.nodeValue) ?? '' : (n.textContent || n.nodeValue || '').replace(/\s+/g, ' ').trim();
          values.push(String(v ?? '').slice(0, 500));
        }
    } catch {
      values.push('⚠ invalid');
    }
    out[ex.name] = values;
  }
  return out;
};

export class Renderer {
  constructor({ userAgent, timeoutMs = 30000, executablePath, headers = {}, isInternal = () => false } = {}) {
    this.userAgent = userAgent;
    this.headers = headers;
    this.isInternal = isInternal;
    this.timeoutMs = Math.min(timeoutMs, 45000);
    this.executablePath = executablePath || findChrome();
  }

  async start() {
    if (!this.executablePath) throw Object.assign(new Error('Chrome introuvable'), { code: 'NO_CHROME' });
    const { default: puppeteer } = await import('puppeteer-core');
    this.browser = await puppeteer.launch({
      executablePath: this.executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--mute-audio'],
    });
    this.dead = false;
    // Chrome peut mourir en plein crawl (mémoire, plantage) : le crawler le voit et le relance, au lieu d'enregistrer
    // chaque page suivante « rendered: false » en silence.
    this.browser.on('disconnected', () => {
      this.dead = true;
    });
  }

  async restart() {
    if (this.restarting) return this.restarting;
    this.restarting = (async () => {
      await this.browser?.close().catch(() => {});
      await this.start();
    })().finally(() => {
      this.restarting = null;
    });
    return this.restarting;
  }

  async render(url, { xpath = [] } = {}) {
    if (this.dead || !this.browser) throw new Error('Chrome disconnected');
    const page = await this.browser.newPage();
    const consoleErrors = [];
    let requests = 0;
    let bytes = 0;
    try {
      if (this.userAgent) await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1366, height: 900 });
      await page.evaluateOnNewDocument(VITALS);
      if (Object.keys(this.headers).length) {
        // Authentification / en-têtes personnalisés : seulement pour les requêtes vers le site audité.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (this.isInternal(req.url())) req.continue({ headers: { ...req.headers(), ...this.headers } });
          else req.continue();
        });
      }
      // Les échecs de chargement de ressources (404 d'images, favicon…) ne sont pas des erreurs JavaScript.
      page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/i.test(m.text()) && consoleErrors.length < 20 && consoleErrors.push(m.text().slice(0, 300)));
      page.on('pageerror', (e) => consoleErrors.length < 20 && consoleErrors.push(String(e.message || e).slice(0, 300)));
      page.on('requestfinished', (req) => {
        requests++;
        const len = Number(req.response()?.headers()['content-length']);
        if (len) bytes += len;
      });
      const t0 = Date.now();
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeoutMs });
      } catch (e) {
        if (!/timeout/i.test(e.message)) throw e; // page lente : on garde ce qui est chargé
      }
      const loadTime = Date.now() - t0;
      await new Promise((r) => setTimeout(r, 300));
      const [html, vitals] = await Promise.all([page.content(), page.evaluate(() => window.__arachnide || null)]);
      // Extraction XPath dans la page rendue : document.evaluate, sans dépendance.
      const extracted = xpath.length ? await page.evaluate(XPATH_IN_PAGE, xpath).catch(() => null) : null;
      return {
        html,
        extracted,
        finalUrl: page.url(),
        loadTime,
        lcp: vitals?.lcp ? Math.round(vitals.lcp) : null,
        cls: vitals ? Math.round(vitals.cls * 1000) / 1000 : null,
        consoleErrors,
        requests,
        bytes,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }
}
