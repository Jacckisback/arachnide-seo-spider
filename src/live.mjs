// Lecture des valeurs SEO telles qu'elles sont publiées (HTML en ligne), pour les connecteurs sans API
// de lecture et pour vérifier qu'une modification est bien visible sur le site.
import * as cheerio from 'cheerio';
import { DEFAULT_UA } from './crawler.mjs';
import { robotsFlags } from '../public/shared/directives.js';

export function readFieldFromHtml(html, field, { target, url } = {}) {
  const $ = cheerio.load(html);
  const abs = (v) => {
    try {
      return v ? new URL(v, url).href : v;
    } catch {
      return v;
    }
  };
  switch (field) {
    case 'seo_title':
      return $('head title').first().text().trim() || null;
    case 'meta_description':
      return $('meta[name="description" i]').first().attr('content')?.trim() ?? null;
    case 'h1':
      return $('h1').first().text().replace(/\s+/g, ' ').trim() || null;
    case 'canonical':
      return abs($('link[rel="canonical" i]').first().attr('href')?.trim()) || null;
    case 'noindex':
      return $('meta[name="robots" i], meta[name="googlebot" i]').toArray().some((el) => robotsFlags($(el).attr('content')).noindex);
    case 'image_alt': {
      const want = abs(target);
      const file = (s) => s?.split('?')[0].split('/').pop();
      const img = $('img').toArray().find((el) => {
        const src = abs($(el).attr('src') || $(el).attr('data-src'));
        return src === want || file(src) === file(want);
      });
      if (!img) return undefined;
      return $(img).attr('alt') ?? null;
    }
    default:
      return undefined;
  }
}

// Valeur publiée d'un champ ; pour 'redirect', la destination de la redirection (ou null).
export async function readLive(url, field, { target, fetch = globalThis.fetch, cacheBust = true } = {}) {
  const u = new URL(url);
  if (cacheBust && field !== 'redirect') u.searchParams.set('_arachnide', Date.now().toString(36));
  const res = await fetch(u.href, { redirect: field === 'redirect' ? 'manual' : 'follow', headers: { 'user-agent': DEFAULT_UA, accept: 'text/html', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  if (field === 'redirect') {
    await res.body?.cancel();
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) return { status: res.status, to: new URL(res.headers.get('location'), url).href };
    return null;
  }
  const html = await res.text();
  if (field === 'noindex' && robotsFlags(res.headers.get('x-robots-tag')).noindex) return true;
  return readFieldFromHtml(html, field, { target, url });
}

// Résumé d'une page publiée pour aider Claude à rédiger : balises SEO actuelles, titres, extrait du contenu principal.
export async function fetchPageSummary(url, { fetch = globalThis.fetch, maxChars = 3000 } = {}) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': DEFAULT_UA, accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  const html = await res.text();
  const $ = cheerio.load(html);
  const pick = (f) => readFieldFromHtml(html, f, { url: res.url || url });
  const out = {
    url: res.url || url,
    status: res.status,
    seo_title: pick('seo_title'),
    meta_description: pick('meta_description'),
    h1: pick('h1'),
    canonical: pick('canonical'),
    noindex: pick('noindex'),
    lang: $('html').attr('lang') || null,
    headings: $('h2, h3').toArray().slice(0, 30).map((el) => `${el.tagName.toUpperCase()}: ${$(el).text().replace(/\s+/g, ' ').trim()}`),
    images: $('img').toArray().slice(0, 40).map((el) => ({ src: (() => { try { return new URL($(el).attr('src') || $(el).attr('data-src') || '', res.url || url).href; } catch { return null; } })(), alt: $(el).attr('alt') ?? null })).filter((i) => i.src),
  };
  $('script, style, noscript, template, svg, nav, header, footer, aside, form').remove();
  $('p, div, li, td, th, h1, h2, h3, h4, h5, h6, br, section, article, blockquote').append(' ');
  const main = $('main, article, [role="main"]').first();
  out.text_excerpt = (main.length ? main : $('body')).text().replace(/\s+/g, ' ').trim().slice(0, maxChars);
  return out;
}
