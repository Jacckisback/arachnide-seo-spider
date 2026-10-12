// Moteur de crawl : file d'attente BFS, concurrence, robots.txt, sitemaps, redirections manuelles.
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { parseHtml, resolveUrl } from './parse.mjs';
import { parseRobots, rulesFor, isAllowed } from './robots.mjs';
import { analyze } from './analyze.mjs';

export const DEFAULT_UA = 'Mozilla/5.0 (compatible; ArachnideSEO/1.0; +https://github.com/Jacckisback/arachnide-seo-spider)';
export const USER_AGENTS = {
  arachnide: DEFAULT_UA,
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotMobile:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
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
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HTML_TYPES = /text\/html|application\/xhtml\+xml/i;

function decodeBody(buf, contentType) {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = Buffer.from(buf.subarray(0, 2048)).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export class Crawler extends EventEmitter {
  constructor(startUrl, options = {}) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    let u = String(startUrl || '').trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    this.startUrl = new URL(u).href;
    this.includeRe = this.opts.include ? new RegExp(this.opts.include, 'i') : null;
    this.excludeRe = this.opts.exclude ? new RegExp(this.opts.exclude, 'i') : null;
    this.pages = new Map(); // url -> enregistrement
    this.queue = [];
    this.qHead = 0;
    this.deferred = []; // URLs issues des sitemaps, crawlées en dernier
    this.seen = new Set();
    this.links = []; // {from, to, anchor, nofollow}
    this.images = new Map(); // src -> {src, alt: Set, missingAlt, pages:Set, status, size}
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

  enqueue(url, depth, via = 'link') {
    const n = this.normalize(url);
    if (!n || this.seen.has(n)) return;
    if (!this.isInternal(n) || !this.inScope(n)) return;
    if (depth > this.opts.maxDepth) return;
    if (this.seen.size >= this.opts.maxPages) return;
    this.seen.add(n);
    this.queue.push({ url: n, depth, via });
  }

  async request(url, method = 'GET') {
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
          'accept-language': 'fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7',
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
    let url = this.startUrl;
    for (let i = 0; i < 10; i++) {
      try {
        const { res, timer } = await this.request(url);
        clearTimeout(timer);
        await res.body?.cancel();
        const loc = res.headers.get('location');
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
    this.finalStart = url;
    this.origin = new URL(url).origin;
    this.rootDomain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  }

  async loadRobotsAndSitemaps() {
    this.phase = 'robots';
    this.emit('status', { phase: 'robots', message: 'Lecture du robots.txt' });
    const txt = await this.fetchText(this.origin + '/robots.txt');
    this.robotsTxt = txt;
    const robots = txt ? parseRobots(txt) : null;
    this.robotsRules = robots ? rulesFor(robots, this.opts.userAgent) : [];
    if (!this.opts.useSitemaps) return;

    this.phase = 'sitemaps';
    this.emit('status', { phase: 'sitemaps', message: 'Lecture des sitemaps XML' });
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
    if (!this.opts.respectRobots || !this.robotsRules.length) return false;
    const u = new URL(url);
    if (u.origin !== this.origin) return false;
    return !isAllowed(this.robotsRules, u.pathname + u.search);
  }

  async start() {
    this.startedAt = new Date().toISOString();
    this.phase = 'start';
    this.emit('status', { phase: 'start', message: 'Résolution de l’URL de départ' });
    await this.resolveStart();
    await this.loadRobotsAndSitemaps();
    this.enqueue(this.startUrl, 0, 'start');
    if (this.finalStart !== this.startUrl) this.enqueue(this.finalStart, 0, 'redirect');
    if (this.opts.useSitemaps) this.deferred = [...this.sitemapUrls];

    this.phase = 'crawl';
    this.emit('status', { phase: 'crawl', message: 'Crawl en cours' });
    const progressTimer = setInterval(() => this.emit('progress', this.progress()), 500);
    try {
      await Promise.all(Array.from({ length: Math.max(1, this.opts.concurrency) }, () => this.worker()));
      if (!this.stopped && this.opts.checkExternal) await this.checkExternals();
      if (!this.stopped && this.opts.checkImages) await this.checkImages();
    } finally {
      clearInterval(progressTimer);
    }
    this.phase = 'analyse';
    this.emit('status', { phase: 'analyse', message: 'Analyse des résultats' });
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
    rec.statusText = 'Aucune réponse';
    return rec;
  }

  async process(item) {
    const rec = this.baseRecord(item);
    if (this.blockedByRobots(item.url)) {
      rec.blockedByRobots = true;
      rec.statusText = 'Bloqué par robots.txt';
      this.pages.set(item.url, rec);
      this.emit('page', rec);
      return;
    }
    let reqRes;
    try {
      reqRes = await this.request(item.url);
    } catch (e) {
      const r = this.errorRecord(item, e);
      this.pages.set(item.url, r);
      this.emit('page', r);
      return;
    }
    const { res, ttfb, timer } = reqRes;
    try {
      rec.status = res.status;
      rec.statusText = res.statusText;
      rec.contentType = res.headers.get('content-type') || '';
      rec.xRobotsTag = res.headers.get('x-robots-tag') || '';
      rec.lastModified = res.headers.get('last-modified') || '';
      rec.responseTime = ttfb;
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        if (loc) {
          rec.redirectUrl = resolveUrl(loc, item.url) || loc;
          this.enqueue(rec.redirectUrl, item.depth, 'redirect');
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
      const buf = new Uint8Array(await res.arrayBuffer());
      rec.downloadTime = Math.round(performance.now() - reqRes.t0);
      rec.size = buf.byteLength;
      const html = decodeBody(buf, rec.contentType);
      const data = parseHtml(html, item.url);
      const { links, images, ...fields } = data;
      Object.assign(rec, fields);
      rec.internalOutlinks = 0;
      rec.externalOutlinks = 0;
      rec.imagesCount = images.length;
      rec.imagesMissingAlt = images.filter((i) => i.alt === null || i.alt === '').length;

      const followAll = !/nofollow/i.test(rec.metaRobots + ' ' + rec.xRobotsTag);
      for (const l of links) {
        const to = this.normalize(l.to) || l.to;
        const internal = this.isInternal(to);
        this.links.push({ from: item.url, to, anchor: l.anchor, nofollow: l.nofollow, internal });
        if (internal) {
          rec.internalOutlinks++;
          if (followAll && !l.nofollow) this.enqueue(to, item.depth + 1, 'link');
        } else {
          rec.externalOutlinks++;
          const ex = this.externals.get(to) || { url: to, status: null, statusText: '', inlinks: 0, pages: new Set() };
          ex.inlinks++;
          ex.pages.add(item.url);
          this.externals.set(to, ex);
        }
      }
      for (const img of images) {
        const im = this.images.get(img.src) || { src: img.src, alts: new Set(), missingAlt: false, pages: new Set(), status: null, size: null };
        if (img.alt === null || img.alt === '') im.missingAlt = true;
        else im.alts.add(img.alt);
        im.pages.add(item.url);
        this.images.set(img.src, im);
      }
      if (this.opts.crawlCanonicals && rec.canonical && rec.canonical !== item.url) this.enqueue(rec.canonical, item.depth + 1, 'canonical');
      if (rec.relNext) this.enqueue(rec.relNext, item.depth + 1, 'pagination');
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
      return { status: res.status, statusText: res.statusText, size: Number(res.headers.get('content-length')) || null, location: res.headers.get('location') || '' };
    } catch (e) {
      return { status: 0, statusText: e?.name === 'AbortError' ? 'Timeout' : e?.cause?.code || 'Erreur', size: null };
    }
  }

  async checkExternals() {
    this.phase = 'externes';
    this.emit('status', { phase: 'externes', message: 'Vérification des liens externes' });
    const list = [...this.externals.values()].slice(0, this.opts.maxExternal);
    await this.pool(list, async (ex) => Object.assign(ex, await this.headStatus(ex.url)), this.opts.concurrency * 2);
  }

  async checkImages() {
    this.phase = 'images';
    this.emit('status', { phase: 'images', message: 'Vérification des images' });
    const list = [...this.images.values()].slice(0, this.opts.maxImages);
    await this.pool(list, async (im) => {
      const r = await this.headStatus(im.src);
      im.status = r.status;
      im.size = r.size;
    }, this.opts.concurrency * 2);
  }
}
