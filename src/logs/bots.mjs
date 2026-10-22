// Identification des robots dans les journaux et vérification des robots de recherche usurpés.
// Un user-agent « Googlebot » ne prouve rien : n'importe quel scanner peut l'écrire. La vérification suit la méthode
// publiée par Google et Bing : DNS inverse de l'IP → nom d'hôte dans le domaine du moteur → DNS direct du nom qui
// redonne la même IP. Les robots sans méthode publiée (la plupart des robots IA) restent « non vérifiables ».
import dns from 'node:dns/promises';

// family : search (moteurs), ai (robots des assistants et de leurs index), seo (outils SEO), social, monitor, other.
// rdns : domaines (suffixes) attendus au DNS inverse pour un robot authentique.
export const BOTS = [
  { id: 'googlebot', name: 'Googlebot', family: 'search', re: /Googlebot(?!-Image|-Video|-News)|Googlebot\/2\.1/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'googlebot-image', name: 'Googlebot Image', family: 'search', re: /Googlebot-Image/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'googlebot-video', name: 'Googlebot Video', family: 'search', re: /Googlebot-Video/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'googlebot-news', name: 'Googlebot News', family: 'search', re: /Googlebot-News/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'storebot-google', name: 'Storebot-Google', family: 'search', re: /Storebot-Google/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'google-inspectiontool', name: 'Google-InspectionTool', family: 'search', re: /Google-InspectionTool/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'googleother', name: 'GoogleOther', family: 'search', re: /GoogleOther/i, rdns: ['googlebot.com', 'google.com'] },
  { id: 'adsbot-google', name: 'AdsBot-Google', family: 'search', re: /AdsBot-Google/i, rdns: ['google.com'] },
  { id: 'mediapartners-google', name: 'Mediapartners-Google', family: 'search', re: /Mediapartners-Google/i, rdns: ['google.com'] },
  { id: 'google-extended', name: 'Google-Extended', family: 'ai', re: /Google-Extended/i, rdns: ['google.com'] },
  { id: 'apis-google', name: 'APIs-Google', family: 'other', re: /APIs-Google/i, rdns: ['google.com'] },
  { id: 'feedfetcher-google', name: 'FeedFetcher-Google', family: 'other', re: /FeedFetcher-Google/i, rdns: ['google.com'] },
  { id: 'bingbot', name: 'Bingbot', family: 'search', re: /bingbot/i, rdns: ['search.msn.com'] },
  { id: 'adidxbot', name: 'AdIdxBot', family: 'search', re: /adidxbot/i, rdns: ['search.msn.com'] },
  { id: 'bingpreview', name: 'BingPreview', family: 'search', re: /BingPreview/i, rdns: ['search.msn.com'] },
  { id: 'duckduckbot', name: 'DuckDuckBot', family: 'search', re: /DuckDuckBot|DuckDuckGo/i },
  { id: 'applebot', name: 'Applebot', family: 'search', re: /Applebot(?!-Extended)/i, rdns: ['applebot.apple.com'] },
  { id: 'applebot-extended', name: 'Applebot-Extended', family: 'ai', re: /Applebot-Extended/i, rdns: ['applebot.apple.com'] },
  { id: 'yandexbot', name: 'YandexBot', family: 'search', re: /Yandex(?:Bot|Images|Mobile|Accessibility|Metrika|Turbo|Market|Direct|Screenshot|Video|News|Media)/i, rdns: ['yandex.ru', 'yandex.net', 'yandex.com'] },
  { id: 'baiduspider', name: 'Baiduspider', family: 'search', re: /Baiduspider/i, rdns: ['baidu.com', 'baidu.jp'] },
  { id: 'naverbot', name: 'Naver Yeti', family: 'search', re: /Yeti\/|NaverBot/i },
  { id: 'seznambot', name: 'SeznamBot', family: 'search', re: /SeznamBot/i, rdns: ['seznam.cz'] },
  { id: 'qwantbot', name: 'Qwantbot', family: 'search', re: /Qwantify|Qwantbot/i },
  { id: 'petalbot', name: 'PetalBot', family: 'search', re: /PetalBot/i, rdns: ['petalsearch.com', 'aspiegel.com'] },
  { id: 'sogou', name: 'Sogou', family: 'search', re: /Sogou\s?(web|inst|pic)?\s?spider/i },
  { id: 'coccoc', name: 'Cốc Cốc', family: 'search', re: /coccocbot/i },
  { id: 'gptbot', name: 'GPTBot', family: 'ai', re: /GPTBot/i },
  { id: 'oai-searchbot', name: 'OAI-SearchBot', family: 'ai', re: /OAI-SearchBot/i },
  { id: 'chatgpt-user', name: 'ChatGPT-User', family: 'ai', re: /ChatGPT-User/i },
  { id: 'claudebot', name: 'ClaudeBot', family: 'ai', re: /ClaudeBot/i },
  { id: 'claude-user', name: 'Claude-User', family: 'ai', re: /Claude-User|Claude-Web/i },
  { id: 'claude-searchbot', name: 'Claude-SearchBot', family: 'ai', re: /Claude-SearchBot/i },
  { id: 'anthropic-ai', name: 'anthropic-ai', family: 'ai', re: /anthropic-ai/i },
  { id: 'perplexitybot', name: 'PerplexityBot', family: 'ai', re: /PerplexityBot/i },
  { id: 'perplexity-user', name: 'Perplexity-User', family: 'ai', re: /Perplexity-User/i },
  { id: 'bytespider', name: 'Bytespider', family: 'ai', re: /Bytespider/i },
  { id: 'ccbot', name: 'CCBot', family: 'ai', re: /CCBot/i },
  { id: 'amazonbot', name: 'Amazonbot', family: 'ai', re: /Amazonbot/i, rdns: ['crawl.amazonbot.amazon'] },
  { id: 'meta-externalagent', name: 'Meta-ExternalAgent', family: 'ai', re: /meta-externalagent|meta-externalfetcher|FacebookBot/i },
  { id: 'cohere-ai', name: 'cohere-ai', family: 'ai', re: /cohere-ai/i },
  { id: 'mistral', name: 'MistralAI-User', family: 'ai', re: /MistralAI-User/i },
  { id: 'diffbot', name: 'Diffbot', family: 'ai', re: /Diffbot/i },
  { id: 'omgili', name: 'Omgili', family: 'ai', re: /omgili|webzio/i },
  { id: 'youbot', name: 'YouBot', family: 'ai', re: /YouBot/i },
  { id: 'duckassistbot', name: 'DuckAssistBot', family: 'ai', re: /DuckAssistBot/i },
  { id: 'timpibot', name: 'Timpibot', family: 'ai', re: /Timpibot/i },
  { id: 'ahrefsbot', name: 'AhrefsBot', family: 'seo', re: /AhrefsBot|AhrefsSiteAudit/i },
  { id: 'semrushbot', name: 'SemrushBot', family: 'seo', re: /SemrushBot|SiteAuditBot/i },
  { id: 'mj12bot', name: 'MJ12bot', family: 'seo', re: /MJ12bot/i },
  { id: 'dotbot', name: 'DotBot', family: 'seo', re: /DotBot/i },
  { id: 'rogerbot', name: 'rogerbot', family: 'seo', re: /rogerbot/i },
  { id: 'screaming-frog', name: 'Screaming Frog', family: 'seo', re: /Screaming Frog/i },
  { id: 'arachnide', name: 'Arachnide', family: 'seo', re: /ArachnideSEO/i },
  { id: 'sitebulb', name: 'Sitebulb', family: 'seo', re: /Sitebulb/i },
  { id: 'oncrawl', name: 'Oncrawl', family: 'seo', re: /OnCrawl/i },
  { id: 'botify', name: 'Botify', family: 'seo', re: /Botify/i },
  { id: 'dataforseo', name: 'DataForSEO', family: 'seo', re: /DataForSeoBot/i },
  { id: 'serpstat', name: 'Serpstat', family: 'seo', re: /serpstatbot/i },
  { id: 'facebook', name: 'facebookexternalhit', family: 'social', re: /facebookexternalhit|Facebot/i },
  { id: 'twitterbot', name: 'Twitterbot', family: 'social', re: /Twitterbot/i },
  { id: 'linkedinbot', name: 'LinkedInBot', family: 'social', re: /LinkedInBot/i },
  { id: 'pinterest', name: 'Pinterestbot', family: 'social', re: /Pinterest(?:bot)?\//i },
  { id: 'slackbot', name: 'Slackbot', family: 'social', re: /Slackbot/i },
  { id: 'telegrambot', name: 'TelegramBot', family: 'social', re: /TelegramBot/i },
  { id: 'whatsapp', name: 'WhatsApp', family: 'social', re: /WhatsApp/i },
  { id: 'discordbot', name: 'Discordbot', family: 'social', re: /Discordbot/i },
  { id: 'uptimerobot', name: 'UptimeRobot', family: 'monitor', re: /UptimeRobot/i },
  { id: 'pingdom', name: 'Pingdom', family: 'monitor', re: /Pingdom/i },
  { id: 'statuscake', name: 'StatusCake', family: 'monitor', re: /StatusCake/i },
  { id: 'gtmetrix', name: 'GTmetrix', family: 'monitor', re: /GTmetrix/i },
  { id: 'lighthouse', name: 'Lighthouse', family: 'monitor', re: /Chrome-Lighthouse/i },
  { id: 'pagespeed', name: 'PageSpeed Insights', family: 'monitor', re: /Google Page Speed Insights|PageSpeed/i },
  { id: 'wget', name: 'wget', family: 'other', re: /^Wget\//i },
  { id: 'curl', name: 'curl', family: 'other', re: /^curl\//i },
  { id: 'python', name: 'Python client', family: 'other', re: /python-requests|Python-urllib|aiohttp|httpx\//i },
  { id: 'go-http', name: 'Go client', family: 'other', re: /Go-http-client/i },
  { id: 'java', name: 'Java client', family: 'other', re: /^Java\/|Apache-HttpClient|okhttp/i },
  { id: 'scrapy', name: 'Scrapy', family: 'other', re: /Scrapy/i },
  { id: 'headless', name: 'Headless browser', family: 'other', re: /HeadlessChrome|PhantomJS|Puppeteer|Playwright/i },
  { id: 'generic-bot', name: 'Other bot', family: 'other', re: /bot\b|crawler|spider|crawling|fetcher|scraper|archiver|archive\.org|ia_archiver/i },
];
const BY_ID = new Map(BOTS.map((b) => [b.id, b]));
export const botById = (id) => BY_ID.get(id) || null;
export const FAMILIES = ['search', 'ai', 'seo', 'social', 'monitor', 'other'];

// Reconnaît le robot d'un user-agent : { id, name, family, mobile } ou null (visiteur humain, navigateur).
const cache = new Map();
export function classify(ua) {
  const s = ua || '';
  if (cache.has(s)) return cache.get(s);
  let out = null;
  for (const b of BOTS) {
    if (b.re.test(s)) {
      out = { id: b.id, name: b.name, family: b.family, mobile: /Mobile|Android|iPhone/i.test(s) };
      break;
    }
  }
  if (cache.size > 50000) cache.clear();
  cache.set(s, out);
  return out;
}

// Vérification DNS d'une IP se présentant comme un robot : « verified », « spoofed », « unverifiable » (pas de méthode
// publiée pour ce robot) ou « error » (DNS injoignable). Résultats mis en cache par IP, concurrence bornée.
export class BotVerifier {
  constructor({ resolver = dns, concurrency = 8, timeoutMs = 4000 } = {}) {
    this.resolver = resolver;
    this.concurrency = concurrency;
    this.timeoutMs = timeoutMs;
    this.cache = new Map(); // ip|botId → status
    this.active = 0;
    this.waiters = [];
  }
  async slot() {
    while (this.active >= this.concurrency) await new Promise((r) => this.waiters.push(r));
    this.active++;
  }
  release() {
    this.active--;
    this.waiters.shift()?.();
  }
  withTimeout(p) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('DNS timeout')), this.timeoutMs))]);
  }
  async verify(ip, botId) {
    const bot = BY_ID.get(botId);
    if (!bot?.rdns) return 'unverifiable';
    const key = ip + '|' + bot.rdns.join(',');
    if (this.cache.has(key)) return this.cache.get(key);
    await this.slot();
    let status;
    try {
      const names = await this.withTimeout(this.resolver.reverse(ip));
      const ok = names.filter((n) => bot.rdns.some((d) => n === d || n.endsWith('.' + d)));
      if (!ok.length) status = 'spoofed';
      else {
        status = 'spoofed';
        for (const n of ok) {
          const addrs = await this.withTimeout(this.resolver.resolve4(n).catch(() => this.resolver.resolve6(n))).catch(() => []);
          if (addrs.includes(ip)) {
            status = 'verified';
            break;
          }
        }
      }
    } catch (e) {
      // Pas d'enregistrement inverse : un vrai Googlebot en a toujours un → usurpé. Autre erreur DNS : inconnue.
      status = /ENOTFOUND|ENODATA|NXDOMAIN/i.test(e.code || e.message) ? 'spoofed' : 'error';
    } finally {
      this.release();
    }
    this.cache.set(key, status);
    return status;
  }
}
