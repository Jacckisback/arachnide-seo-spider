// Moteur de crawl : file d'attente BFS, concurrence, robots.txt, sitemaps, redirections manuelles, rendu JS optionnel.
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { parseHtml, resolveUrl } from './parse.mjs';
import { robotsFlags } from '../public/shared/directives.js';
import { parseRobots, rulesFor, isAllowed } from './robots.mjs';
import { analyze } from './analyze.mjs';
import { Renderer } from './renderer.mjs';
import { runPsi, fetchGscPages, parseGscCsv, readGscKey } from './google.mjs';

export const VERSION = '3.2.0';

// Formats d'image sans compression moderne (pas de WebP / AVIF / SVG / JPEG XL).
const LEGACY_FORMATS = new Set(['jpg', 'png', 'gif', 'bmp', 'tiff']);
const newImage = (src) => ({ src, role: 'src', of: '', descriptor: '', type: '', media: '', alts: new Set(), missingAlt: false, pages: new Set(), status: null, size: null, contentType: '', responsive: false, picture: false, variantCount: 0 });

export const DEFAULT_UA = 'Mozilla/5.0 (compatible; ArachnideSEO/2.0; +https://github.com/Jacckisback/arachnide-seo-spider)';
export const USER_AGENTS = {
  arachnide: DEFAULT_UA,
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotMobile:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

export const DEFAULT_OPTIONS = {
  maxPages: 500,
  maxDepth: 20,
  concurrency: 5,
  delayMs: 0,
  timeoutMs: 20000,
  userAgent: DEFAULT_UA,
  respectRobots: true,
  crawlSubdomains: false,
  ignoreQuery: false,
  useSitemaps: true,
  crawlCanonicals: true,
  checkExternal: false,
  checkImages: false,
  include: '',
  exclude: '',
  maxExternal: 1000,
  maxImages: 2000,
  mode: 'spider', // 'spider' : suit les liens ; 'list' : crawle uniquement opts.urls
  urls: [],
  render: false, // rendu JavaScript avec Chrome
  renderConcurrency: 3,
  search: '', // texte ou /regex/ recherché dans le code source de chaque page
  acceptLanguage: '', // vide comme Googlebot
  // Spider > Limites (null = illimité)
  limitPerDepth: null, // URLs max par niveau de profondeur
  maxFolderDepth: null, // nombre max de dossiers dans le chemin
  maxQueryParams: null, // nombre max de paramètres d'URL
  maxRedirects: 10, // redirections suivies dans une chaîne
  maxUrlLength: 2000,
  maxLinksPerPage: 10000,
  maxPageSizeKb: 51200, // 50 Mo
  pathLimits: [], // [{ pattern: '/blog/', max: 200 }]
  // Vitesse
  maxUrlPerSec: 0, // 0 = illimité ; plafond global de requêtes par seconde
  // robots.txt : 'respect' | 'report' (ignorer mais signaler) | 'ignore'
  robotsMode: 'respect',
  customRobots: '', // robots.txt de test qui remplace celui du site pendant le crawl
  // Réécriture d'URL & accès
  removeParams: '', // ex. "utm_*, gclid, fbclid"
  httpUser: '',
  httpPass: '',
  customHeaders: '', // une ligne "Nom: valeur" par en-tête (cookies, jetons…)
  extractors: [], // [{ name, type: 'css' | 'regex', selector, target: 'text' | 'html' | 'attr' | 'count', attr }]
  // Données Google (facultatives)
  psiMax: 0, // nombre de pages testées avec PageSpeed Insights (0 = désactivé)
  psiKey: '', // clé API Google (PageSpeed Insights) — conseillée au-delà de quelques pages
  psiStrategy: 'mobile', // mobile | desktop
  gscKeyFile: '', // chemin du fichier JSON du compte de service Search Console
  gscProperty: '', // propriété (sc-domain:exemple.fr ou https://www.exemple.fr/) ; détectée si vide
  gscDays: 90,
  gscCsv: '', // contenu d'un export CSV « Pages » de Search Console
};

// Robots des moteurs de recherche et des IA dont on vérifie l'accès dans le robots.txt.
export const BOTS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'meta-externalagent', 'Amazonbot'];

function searchRegex(q) {
  if (!q) return null;
  const m = /^\/(.+)\/([a-z]*)$/.exec(q);
  try {
    return m ? new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry-After : nombre de secondes ou date HTTP.
function retryAfterMs(v) {
  if (!v) return null;
  if (/^\d+$/.test(v.trim())) return Number(v) * 1000;
  const d = Date.parse(v);
  return Number.isNaN(d) ? null : Math.max(0, d - Date.now());
}
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;

// Décodage comme un navigateur : BOM d'abord, puis l'en-tête HTTP, puis <meta charset> (hors commentaires, 8 Ko),
// sinon UTF-8 s'il est valide, et windows-1252 en dernier recours (pages anciennes sans déclaration).
export function decodeBody(buf, contentType) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  let charset = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = Buffer.from(b.subarray(0, 8192)).toString('latin1').replace(/<!--[\s\S]*?-->/g, '');
    charset = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1];
  }
  if (charset) {
    try {
      return new TextDecoder(charset).decode(b);
    } catch {
      /* jeu de caractères inconnu : détection ci-dessous */
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

export class Crawler extends EventEmitter {
  constructor(startUrl, options = {}) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    const fix = (x) => {
      let u = String(x || '').trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      return new URL(u).href;
    };
    if (this.opts.mode === 'list') {
      this.listUrls = [...new Set((this.opts.urls || []).map((x) => { try { return fix(x); } catch { return null; } }).filter(Boolean))];
      if (!this.listUrls.length) throw new Error('URL list is empty');
      startUrl = this.listUrls[0];
      this.opts.maxPages = Math.max(this.opts.maxPages, this.listUrls.length);
    }
    this.startUrl = fix(startUrl);
    if (options.respectRobots === false && !options.robotsMode) this.opts.robotsMode = 'ignore'; // compatibilité 2.0
    this.removeParamRes = String(this.opts.removeParams || '').split(/[\s,]+/).filter(Boolean)
      .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));
    this.pathLimits = (this.opts.pathLimits || [])
      .map((l) => { try { return { re: new RegExp(l.pattern, 'i'), max: Number(l.max), count: 0, pattern: l.pattern }; } catch { return null; } })
      .filter((l) => l && l.max >= 0);
    this.depthCounts = new Map();
    this.skipped = {}; // URLs non crawlées à cause des limites, par motif
    this.nextRequestAt = 0;
    this.extraHeaders = {};
    for (const line of String(this.opts.customHeaders || '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) this.extraHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    if (this.opts.httpUser) this.extraHeaders.authorization = 'Basic ' + Buffer.from(`${this.opts.httpUser}:${this.opts.httpPass || ''}`).toString('base64');
    this.searchRe = searchRegex(this.opts.search);
    this.warnings = [];
    this.botAccess = [];
    this.llmsTxt = null;
    this.includeRe = this.opts.include ? new RegExp(this.opts.include, 'i') : null;
    this.excludeRe = this.opts.exclude ? new RegExp(this.opts.exclude, 'i') : null;
    this.pages = new Map(); // url -> enregistrement
    this.queue = [];
    this.qHead = 0;
    this.deferred = []; // URLs issues des sitemaps, crawlées en dernier
    this.seen = new Set();
    this.links = []; // {from, to, anchor, nofollow}
    this.images = new Map(); // url -> {src, role: src|srcset|source, of, alts: Set, missingAlt, pages: Set, status, size, …}
    this.externals = new Map(); // url -> {url, status, inlinks}
    this.sitemapUrls = new Set();
    this.sitemapFiles = [];
    this.robotsRules = [];
    this.robotsTxt = null;
    this.active = 0;
    this.stopped = false;
    this.startedAt = null;
    this.finishedAt = null;
    this.phase = 'idle';
  }

  stop() {
    this.stopped = true;
  }

  normalize(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      if (this.opts.ignoreQuery) u.search = '';
      else if (this.removeParamRes.length && u.search) {
        for (const k of [...u.searchParams.keys()]) if (this.removeParamRes.some((re) => re.test(k))) u.searchParams.delete(k);
      }
      return u.href;
    } catch {
      return null;
    }
  }

  isInternal(url) {
    let h;
    try {
      h = new URL(url).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (this.hosts.has(h)) return true;
    if (this.opts.crawlSubdomains) return h === this.rootDomain || h.endsWith('.' + this.rootDomain);
    return false;
  }

  inScope(url) {
    if (this.includeRe && !this.includeRe.test(url)) return false;
    if (this.excludeRe && this.excludeRe.test(url)) return false;
    return true;
  }

  skip(reason) {
    this.skipped[reason] = (this.skipped[reason] || 0) + 1;
  }

  enqueue(url, depth, via = 'link', hops = 0) {
    const n = this.normalize(url);
    if (!n || this.seen.has(n)) return;
    if (!this.isInternal(n) || !this.inScope(n)) return;
    const o = this.opts;
    if (via !== 'start' && via !== 'list') {
      // Spider > Limites
      if (depth > o.maxDepth) return this.skip('depth');
      if (hops > o.maxRedirects) return this.skip('redirects');
      if (n.length > o.maxUrlLength) return this.skip('urlLength');
      const u = new URL(n);
      if (o.maxFolderDepth != null && u.pathname.split('/').filter(Boolean).length - (u.pathname.endsWith('/') ? 0 : 1) > o.maxFolderDepth) return this.skip('folderDepth');
      if (o.maxQueryParams != null && [...u.searchParams.keys()].length > o.maxQueryParams) return this.skip('queryParams');
      if (o.limitPerDepth != null && (this.depthCounts.get(depth) || 0) >= o.limitPerDepth) return this.skip('perDepth');
      const pl = this.pathLimits.find((l) => l.re.test(n));
      if (pl && pl.count >= pl.max) return this.skip('path');
      if (pl) pl.count++;
    }
    if (this.seen.size >= o.maxPages) return this.skip('total');
    this.seen.add(n);
    this.depthCounts.set(depth, (this.depthCounts.get(depth) || 0) + 1);
    this.queue.push({ url: n, depth, via, hops });
  }

  // Vitesse : plafond global de requêtes par seconde, partagé par tous les workers.
  async throttle() {
    // Le site a demandé de ralentir (429/503 + Retry-After) : toutes les requêtes attendent.
    if (this.backoffUntil > Date.now()) await sleep(this.backoffUntil - Date.now());
    if (!this.opts.maxUrlPerSec) return;
    const gap = 1000 / this.opts.maxUrlPerSec;
    const now = Date.now();
    const at = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = at + gap;
    if (at > now) await sleep(at - now);
  }

  async request(url, method = 'GET') {
    await this.throttle();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': this.opts.userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(this.opts.acceptLanguage ? { 'accept-language': this.opts.acceptLanguage } : {}),
          // Authentification et en-têtes personnalisés : uniquement vers le site audité.
          ...(this.hosts && this.isInternal(url) ? this.extraHeaders : {}),
        },
      });
      const ttfb = Math.round(performance.now() - t0);
      return { res, ttfb, t0, timer };
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async fetchText(url) {
    try {
      const { res, timer } = await this.request(url);
      try {
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          await res.body?.cancel();
          return this.fetchText(new URL(res.headers.get('location'), url).href);
        }
        if (res.status !== 200) {
          await res.body?.cancel();
          return null;
        }
        let buf = Buffer.from(await res.arrayBuffer());
        if (url.endsWith('.gz') || (buf[0] === 0x1f && buf[1] === 0x8b)) buf = zlib.gunzipSync(buf);
        return buf.toString('utf8');
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  async resolveStart() {
    // Suit les redirections de l'URL de départ pour connaître l'hôte réel du site.
    this.hosts = new Set([new URL(this.startUrl).hostname.toLowerCase()]);
    if (this.listUrls) for (const x of this.listUrls) this.hosts.add(new URL(x).hostname.toLowerCase());
    let url = this.startUrl;
    for (let i = 0; i < 10; i++) {
      try {
        const { res, timer } = await this.request(url);
        clearTimeout(timer);
        await res.body?.cancel();
        const loc = res.headers.get('location');
        this.startStatus = res.status;
        if (res.status >= 300 && res.status < 400 && loc) {
          url = new URL(loc, url).href;
          this.hosts.add(new URL(url).hostname.toLowerCase());
          continue;
        }
      } catch {
        /* l'erreur sera enregistrée lors du crawl */
      }
      break;
    }
    // Protection anti-bot (LiteSpeed, Cloudflare, Sucuri…) : certains hébergeurs refusent les user-agents inconnus
    // avec un 403 alors qu'un navigateur passe. Dans ce cas on crawle avec le user-agent Chrome et on le signale,
    // pour que l'audit reflète ce que voient les visiteurs et Google, et non la protection.
    if ([401, 403, 406, 429, 503].includes(this.startStatus) && this.opts.userAgent === DEFAULT_UA) {
      const blockedStatus = this.startStatus;
      this.opts.userAgent = USER_AGENTS.chrome;
      try {
        const { res, timer } = await this.request(url);
        clearTimeout(timer);
        await res.body?.cancel();
        if (res.status < 400) {
          this.uaFallback = true;
          this.warn('warn.uaBlocked', { status: blockedStatus });
        } else this.opts.userAgent = DEFAULT_UA;
      } catch {
        this.opts.userAgent = DEFAULT_UA;
      }
    }
    this.finalStart = url;
    this.origin = new URL(url).origin;
    this.rootDomain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  }

  async loadRobotsAndSitemaps() {
    this.setPhase('robots');
    const [txt, llms] = await Promise.all([this.fetchText(this.origin + '/robots.txt'), this.fetchText(this.origin + '/llms.txt')]);
    this.robotsTxt = txt;
    this.llmsTxt = llms && !/<html/i.test(llms.slice(0, 500)) ? { size: llms.length } : null;
    if (this.opts.customRobots) this.robotsTxt = this.opts.customRobots;
    const robots = this.robotsTxt ? parseRobots(this.robotsTxt) : null;
    this.robotsRules = robots ? rulesFor(robots, this.opts.userAgent) : [];
    this.botAccess = BOTS.map((bot) => ({ bot, allowed: robots ? isAllowed(rulesFor(robots, bot), '/') : true }));
    if (!this.opts.useSitemaps || this.opts.mode === 'list') return;

    this.setPhase('sitemaps');
    const toFetch = [...new Set([...(robots?.sitemaps || []), this.origin + '/sitemap.xml', this.origin + '/sitemap_index.xml'])];
    const done = new Set();
    while (toFetch.length && done.size < 100 && !this.stopped) {
      const sm = toFetch.shift();
      if (done.has(sm)) continue;
      done.add(sm);
      const xml = await this.fetchText(sm);
      if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
        m[1].replace(/&amp;/g, '&').trim()
      );
      if (/<sitemapindex/i.test(xml)) {
        toFetch.push(...locs);
        this.sitemapFiles.push({ url: sm, type: 'index', count: locs.length });
      } else {
        let n = 0;
        for (const l of locs) {
          const norm = this.normalize(l);
          if (norm) {
            this.sitemapUrls.add(norm);
            n++;
          }
        }
        this.sitemapFiles.push({ url: sm, type: 'urlset', count: n });
      }
    }
  }

  blockedByRobots(url) {
    if (this.opts.robotsMode === 'ignore' || !this.robotsRules.length) return false;
    const u = new URL(url);
    if (u.origin !== this.origin) return false;
    return !isAllowed(this.robotsRules, u.pathname + u.search);
  }

  setPhase(phase) {
    this.phase = phase;
    this.emit('status', { phase });
  }

  warn(key, params = {}) {
    this.warnings.push({ key, params });
    this.emit('warning', { key, params });
  }

  async startRenderer() {
    if (!this.opts.render) return;
    this.setPhase('browser');
    const r = new Renderer({ userAgent: this.opts.userAgent, timeoutMs: this.opts.timeoutMs, headers: this.extraHeaders, isInternal: (u) => this.isInternal(u) });
    try {
      await r.start();
      this.renderer = r;
      this.renderSlots = Math.max(1, Math.min(this.opts.renderConcurrency, this.opts.concurrency));
      this.renderWaiters = [];
    } catch (e) {
      this.warn(e.code === 'NO_CHROME' ? 'warn.noChrome' : 'warn.renderFailed', { error: e.message });
    }
  }

  async withRenderSlot(fn) {
    while (this.renderSlots <= 0) await new Promise((r) => this.renderWaiters.push(r));
    this.renderSlots--;
    try {
      return await fn();
    } finally {
      this.renderSlots++;
      this.renderWaiters.shift()?.();
    }
  }

  async start() {
    this.startedAt = new Date().toISOString();
    this.setPhase('start');
    await this.resolveStart();
    await this.loadRobotsAndSitemaps();
    await this.startRenderer();
    if (this.listUrls) {
      for (const u of this.listUrls) this.enqueue(u, 0, 'list');
    } else {
      this.enqueue(this.startUrl, 0, 'start');
      if (this.finalStart !== this.startUrl) this.enqueue(this.finalStart, 0, 'redirect');
      if (this.opts.useSitemaps) this.deferred = [...this.sitemapUrls];
    }

    this.setPhase('crawl');
    const progressTimer = setInterval(() => this.emit('progress', this.progress()), 500);
    try {
      await Promise.all(Array.from({ length: Math.max(1, this.opts.concurrency) }, () => this.worker()));
      if (!this.stopped && this.opts.checkExternal) await this.checkExternals();
      if (!this.stopped && this.opts.checkImages) await this.checkImages();
      if (!this.stopped) await this.loadSearchConsole();
      if (!this.stopped && this.opts.psiMax > 0) await this.runPageSpeed();
    } finally {
      clearInterval(progressTimer);
      await this.renderer?.close();
    }
    this.setPhase('analyse');
    this.finishedAt = new Date().toISOString();
    const result = analyze(this);
    this.phase = 'done';
    this.emit('progress', this.progress());
    this.emit('done', result);
    return result;
  }

  progress() {
    return {
      phase: this.phase,
      crawled: this.pages.size,
      queued: this.queue.length - this.qHead,
      discovered: this.seen.size,
      maxPages: this.opts.maxPages,
      active: this.active,
      externals: this.externals.size,
      stopped: this.stopped,
      elapsed: this.startedAt ? Date.now() - Date.parse(this.startedAt) : 0,
      rendering: !!this.renderer,
    };
  }

  async worker() {
    while (!this.stopped) {
      if (this.qHead >= this.queue.length) {
        if (this.active === 0) {
          // File vide : on injecte les URLs des sitemaps non découvertes par les liens.
          const pending = this.deferred.filter((u) => !this.seen.has(u));
          this.deferred = [];
          if (!pending.length) return;
          for (const u of pending) this.enqueue(u, 0, 'sitemap');
          if (this.qHead >= this.queue.length) return;
          continue;
        }
        await sleep(30);
        continue;
      }
      const item = this.queue[this.qHead++];
      this.active++;
      try {
        await this.process(item);
      } catch (e) {
        this.pages.set(item.url, this.errorRecord(item, e));
      } finally {
        this.active--;
      }
      if (this.opts.delayMs) await sleep(this.opts.delayMs);
    }
  }

  baseRecord(item) {
    return {
      url: item.url,
      via: item.via,
      depth: item.depth,
      status: 0,
      statusText: '',
      contentType: '',
      isHtml: false,
      responseTime: null,
      size: 0,
      redirectUrl: '',
      xRobotsTag: '',
      lastModified: '',
      blockedByRobots: false,
      error: '',
      inSitemap: this.sitemapUrls.has(item.url),
      crawledAt: new Date().toISOString(),
    };
  }

  errorRecord(item, e) {
    const rec = this.baseRecord(item);
    rec.error = e?.name === 'AbortError' ? 'Timeout' : e?.cause?.code || e?.message || String(e);
    return rec;
  }

  async process(item) {
    const rec = this.baseRecord(item);
    const blocked = this.blockedByRobots(item.url);
    if (blocked && this.opts.robotsMode === 'report') rec.robotsBlocked = true; // crawlé quand même, mais signalé
    else if (blocked) {
      rec.blockedByRobots = true;
      this.pages.set(item.url, rec);
      this.emit('page', rec);
      return;
    }
    let reqRes;
    try {
      // 429 / 503 : le serveur demande de ralentir. On attend (Retry-After, 30 s max) et on réessaie deux fois
      // avant de conclure ; une page seulement freinée n'est pas une page cassée.
      for (let attempt = 0; ; attempt++) {
        reqRes = await this.request(item.url);
        const st = reqRes.res.status;
        if ((st !== 429 && st !== 503) || attempt >= 2) break;
        const wait = retryAfterMs(reqRes.res.headers.get('retry-after')) ?? 2000 * (attempt + 1);
        clearTimeout(reqRes.timer);
        await reqRes.res.body?.cancel();
        if (st === 429 && !this.rateLimitWarned) {
          this.rateLimitWarned = true;
          this.warn('warn.rateLimited', { status: st });
        }
        this.backoffUntil = Math.max(this.backoffUntil || 0, Date.now() + Math.min(wait, 30000));
        rec.retries = attempt + 1;
      }
    } catch (e) {
      const r = this.errorRecord(item, e);
      this.pages.set(item.url, r);
      this.emit('page', r);
      return;
    }
    const { res, ttfb, timer } = reqRes;
    try {
      rec.status = res.status;
      // Toujours freinée après les nouvelles tentatives : artefact du crawl, pas une erreur du site.
      if (res.status === 429 || (res.status === 503 && rec.retries)) rec.rateLimited = true;
      rec.statusText = res.statusText;
      rec.contentType = res.headers.get('content-type') || '';
      rec.xRobotsTag = res.headers.get('x-robots-tag') || '';
      rec.lastModified = res.headers.get('last-modified') || '';
      rec.responseTime = ttfb;
      rec.headers = {
        hsts: !!res.headers.get('strict-transport-security'),
        xcto: !!res.headers.get('x-content-type-options'),
        csp: !!res.headers.get('content-security-policy'),
        encoding: res.headers.get('content-encoding') || '',
        cacheControl: res.headers.get('cache-control') || '',
      };
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        if (loc) {
          rec.redirectUrl = resolveUrl(loc, item.url) || loc;
          if (this.opts.mode !== 'list') this.enqueue(rec.redirectUrl, item.depth, 'redirect', (item.hops || 0) + 1);
        }
        this.pages.set(item.url, rec);
        this.emit('page', rec);
        return;
      }
      rec.isHtml = HTML_TYPES.test(rec.contentType);
      if (!rec.isHtml) {
        rec.size = Number(res.headers.get('content-length')) || 0;
        await res.body?.cancel();
        this.pages.set(item.url, rec);
        this.emit('page', rec);
        return;
      }
      const maxBytes = this.opts.maxPageSizeKb * 1024;
      if (Number(res.headers.get('content-length')) > maxBytes) {
        await res.body?.cancel();
        rec.size = Number(res.headers.get('content-length'));
        rec.tooLarge = true;
        this.skip('pageSize');
        this.pages.set(item.url, rec);
        this.emit('page', rec);
        return;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      rec.downloadTime = Math.round(performance.now() - reqRes.t0);
      rec.size = buf.byteLength;
      const html = decodeBody(buf, rec.contentType);
      const popts = { extractors: this.opts.extractors };
      let data = parseHtml(html, item.url, popts);
      if (this.searchRe) rec.searchMatches = (html.match(this.searchRe) || []).length;
      if (this.renderer && res.status === 200) {
        const raw = data;
        try {
          const r = await this.withRenderSlot(() => this.renderer.render(item.url));
          // Redirection JavaScript ou meta refresh : la page rendue est une autre URL, on garde le HTML brut.
          if (this.normalize(r.finalUrl) !== item.url) throw new Error(`JS redirect → ${r.finalUrl}`);
          data = parseHtml(r.html, item.url, popts);
          const rawLinks = new Set(raw.links.map((l) => l.to));
          rec.js = {
            rendered: true,
            loadTime: r.loadTime,
            lcp: r.lcp,
            cls: r.cls,
            requests: r.requests,
            consoleErrors: r.consoleErrors,
            rawWordCount: raw.wordCount,
            rawTitle: raw.title,
            rawH1: raw.h1[0] || '',
            rawCanonical: raw.canonical,
            rawMetaRobots: raw.metaRobots,
            rawLinkCount: raw.links.length,
            jsOnlyLinks: data.links.filter((l) => !rawLinks.has(l.to)).length,
          };
          if (this.searchRe) rec.searchMatches = (r.html.match(this.searchRe) || []).length;
        } catch (e) {
          rec.js = { rendered: false, error: e.message.slice(0, 200) };
        }
      }
      const { links, images, ...fields } = data;
      Object.assign(rec, fields);
      rec.internalOutlinks = 0;
      rec.externalOutlinks = 0;
      rec.imagesCount = images.length;
      // alt absent = problème ; alt="" = image déclarée décorative (valide pour Google et l'accessibilité).
      rec.imagesMissingAlt = images.filter((i) => i.alt === null).length;
      rec.imagesEmptyAlt = images.filter((i) => i.alt === '').length;
      if (rec.imagesMissingAlt) rec.imagesMissingAltSrc = images.filter((i) => i.alt === null).slice(0, 30).map((i) => i.src);
      rec.imagesNoDimensions = images.filter((i) => !i.hasDimensions).length;
      rec.imagesResponsive = images.filter((i) => i.responsive).length;
      rec.imagesNoSizes = images.filter((i) => i.noSizes).length;
      rec.imagesLegacyOnly = images.filter((i) => i.formats.length && i.formats.every((f) => LEGACY_FORMATS.has(f))).length;
      rec.imageVariants = images.reduce((n, i) => n + i.variants.length, 0);

      const followAll = !robotsFlags(rec.metaRobots, rec.xRobotsTag).nofollow;
      const follow = this.opts.mode !== 'list';
      if (links.length > this.opts.maxLinksPerPage) {
        rec.linksTruncated = links.length;
        links.length = this.opts.maxLinksPerPage;
      }
      for (const l of links) {
        const to = this.normalize(l.to) || l.to;
        const internal = this.isInternal(to);
        this.links.push({ from: item.url, to, anchor: l.anchor, nofollow: l.nofollow, internal, imageLink: l.imageLink, pos: l.pos, ...(l.code && { code: true }) });
        if (internal) {
          rec.internalOutlinks++;
          if (follow && followAll && !l.nofollow) this.enqueue(to, item.depth + 1, 'link');
        } else {
          rec.externalOutlinks++;
          const ex = this.externals.get(to) || { url: to, status: null, statusText: '', inlinks: 0, pages: new Set() };
          ex.inlinks++;
          ex.pages.add(item.url);
          this.externals.set(to, ex);
        }
      }
      for (const img of images) {
        const im = this.images.get(img.src) || newImage(img.src);
        Object.assign(im, { role: 'src', of: '' });
        if (img.alt === null) im.missingAlt = true;
        else if (img.alt === '') im.emptyAlt = true;
        else im.alts.add(img.alt);
        im.pages.add(item.url);
        if (img.responsive) im.responsive = true;
        if (img.picture) im.picture = true;
        im.variantCount = Math.max(im.variantCount, img.variants.length);
        this.images.set(img.src, im);
        // Chaque fichier de srcset / <picture> est un fichier distinct à contrôler (poids, statut).
        for (const v of img.variants) {
          const vm = this.images.get(v.url) || Object.assign(newImage(v.url), { role: v.role, of: img.src, descriptor: v.descriptor, type: v.type || '', media: v.media || '' });
          vm.pages.add(item.url);
          this.images.set(v.url, vm);
        }
      }
      if (follow && this.opts.crawlCanonicals && rec.canonical && rec.canonical !== item.url) this.enqueue(rec.canonical, item.depth + 1, 'canonical');
      if (follow && rec.relNext) this.enqueue(rec.relNext, item.depth + 1, 'pagination');
      if (follow && rec.metaRefreshUrl) this.enqueue(rec.metaRefreshUrl, item.depth, 'redirect', (item.hops || 0) + 1);
      this.pages.set(item.url, rec);
      this.emit('page', rec);
    } finally {
      clearTimeout(timer);
    }
  }

  async pool(items, fn, concurrency) {
    let i = 0;
    const run = async () => {
      while (i < items.length && !this.stopped) await fn(items[i++]);
    };
    await Promise.all(Array.from({ length: concurrency }, run));
  }

  async headStatus(url) {
    try {
      let { res, timer } = await this.request(url, 'HEAD');
      clearTimeout(timer);
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        ({ res, timer } = await this.request(url, 'GET'));
        clearTimeout(timer);
        await res.body?.cancel();
      }
      return { status: res.status, statusText: res.statusText, size: Number(res.headers.get('content-length')) || null, location: res.headers.get('location') || '', type: (res.headers.get('content-type') || '').split(';')[0].trim() };
    } catch (e) {
      return { status: 0, statusText: e?.name === 'AbortError' ? 'Timeout' : e?.cause?.code || 'Error', size: null };
    }
  }

  // Search Console : export CSV importé, sinon API avec un compte de service.
  async loadSearchConsole() {
    const o = this.opts;
    if (!o.gscCsv && !o.gscKeyFile) return;
    this.setPhase('gsc');
    try {
      if (o.gscCsv) {
        this.gsc = { source: 'csv', rows: parseGscCsv(o.gscCsv) };
      } else {
        const r = await fetchGscPages({ keyJson: await readGscKey(o.gscKeyFile), property: o.gscProperty, siteUrl: this.finalStart || this.startUrl, days: o.gscDays || 90, fetch: o.googleFetch, api: o.gscApi });
        this.gsc = { source: 'api', property: r.property, start: r.start, end: r.end, rows: r.rows };
      }
    } catch (e) {
      this.warn('warn.gscFailed', { error: e.message });
    }
  }

  // PageSpeed Insights sur les pages les plus importantes : les plus cliquées (Search Console), sinon l'accueil
  // puis les pages qui reçoivent le plus de liens internes.
  async runPageSpeed() {
    this.setPhase('psi');
    const html = [...this.pages.values()].filter((p) => p.isHtml && p.status === 200 && !robotsFlags(p.metaRobots, p.xRobotsTag).noindex);
    const inl = new Map();
    for (const l of this.links) if (l.internal && l.from !== l.to) inl.set(l.to, (inl.get(l.to) || 0) + 1);
    const clicks = new Map((this.gsc?.rows || []).map((r) => [r.url, r.clicks || 0]));
    const home = this.finalStart || this.startUrl;
    const ranked = html.sort((a, b) => (b.url === home) - (a.url === home) || (clicks.get(b.url) || 0) - (clicks.get(a.url) || 0) || (inl.get(b.url) || 0) - (inl.get(a.url) || 0)).slice(0, this.opts.psiMax);
    this.psi = new Map();
    let failures = 0;
    await this.pool(ranked, async (p) => {
      try {
        this.psi.set(p.url, await runPsi(p.url, { key: this.opts.psiKey, strategy: this.opts.psiStrategy, fetch: this.opts.googleFetch, api: this.opts.psiApi }));
      } catch (e) {
        if (++failures === 1) this.warn('warn.psiFailed', { error: e.message });
      }
      this.emit('progress', this.progress());
    }, this.opts.psiKey ? 4 : 1);
  }

  async checkExternals() {
    this.setPhase('externals');
    const list = [...this.externals.values()].slice(0, this.opts.maxExternal);
    await this.pool(list, async (ex) => Object.assign(ex, await this.headStatus(ex.url)), this.opts.concurrency * 2);
  }

  async checkImages() {
    this.setPhase('images');
    const list = [...this.images.values()].slice(0, this.opts.maxImages);
    await this.pool(list, async (im) => {
      const r = await this.headStatus(im.src);
      im.status = r.status;
      im.size = r.size;
      if (r.type) im.contentType = r.type;
    }, this.opts.concurrency * 2);
  }
}
