// Détection du CMS, du framework et de l'hébergement d'un site à partir de la page d'accueil
// (en-têtes HTTP + HTML), pour choisir le connecteur capable d'appliquer les corrections SEO.

// Parts de marché W3Techs (octobre 2026, % de tous les sites web) : utilisées pour l'indicateur de couverture.
export const MARKET_SHARE = { none: 31.6, wordpress: 40.1, shopify: 5.4, wix: 4.2, squarespace: 2.4, joomla: 1.1, webflow: 0.8, tilda: 0.8, duda: 0.7, drupal: 0.6, godaddy: 0.6, prestashop: 0.5, typo3: 0.4, weebly: 0.4, bitrix: 0.4, opencart: 0.3, jimdo: 0.3, ghost: 0.1 };

// mode : comment Arachnide applique les corrections pour ce CMS
//   api     : API officielle du CMS (connecteur dédié)
//   plugin  : API + petit module compagnon à installer (champs SEO)
//   files   : modification des fichiers HTML (sites statiques, dépôt Git, export)
//   edge    : réécriture à la volée par un Cloudflare Worker (tout site derrière Cloudflare)
//   manual  : instructions pas à pas dans l'interface du CMS (aucune API d'écriture)
const CMS = [
  { id: 'wordpress', name: 'WordPress', connector: 'wordpress', mode: 'plugin', test: (h, x) => /wp-content\/|wp-includes\//i.test(h) || /<meta[^>]+generator[^>]+WordPress/i.test(h) || /api\.w\.org/.test(x.link || ''), version: (h) => /generator[^>]+WordPress ([\d.]+)/i.exec(h)?.[1] },
  { id: 'shopify', name: 'Shopify', connector: 'shopify', mode: 'api', test: (h, x) => /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(h) || !!x['x-shopid'] || !!x['x-shopify-stage'] },
  { id: 'wix', name: 'Wix', connector: 'wix', mode: 'api', test: (h, x) => /static\.wixstatic\.com|static\.parastorage\.com|generator[^>]+Wix\.com/i.test(h) || !!x['x-wix-request-id'] },
  { id: 'squarespace', name: 'Squarespace', connector: 'manual', mode: 'manual', test: (h) => /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT|<!-- This is Squarespace/i.test(h) },
  { id: 'webflow', name: 'Webflow', connector: 'webflow', mode: 'api', test: (h) => /data-wf-page=|data-wf-site=|generator[^>]+Webflow/i.test(h) },
  { id: 'joomla', name: 'Joomla', connector: 'joomla', mode: 'api', test: (h) => /generator[^>]+Joomla|\/media\/system\/js\/|\/components\/com_/i.test(h), version: (h) => /generator[^>]+Joomla! ?([\d.]+)?/i.exec(h)?.[1] },
  { id: 'drupal', name: 'Drupal', connector: 'drupal', mode: 'api', test: (h, x) => /generator[^>]+Drupal|drupal-settings-json|\/sites\/default\/files\//i.test(h) || /drupal/i.test(x['x-generator'] || '') || !!x['x-drupal-cache'], version: (h, x) => /Drupal (\d+)/i.exec(x['x-generator'] || h)?.[1] },
  { id: 'prestashop', name: 'PrestaShop', connector: 'prestashop', mode: 'api', test: (h) => /var prestashop\s*=|\/modules\/ps_|generator[^>]+PrestaShop/i.test(h) },
  { id: 'magento', name: 'Magento / Adobe Commerce', connector: 'manual', mode: 'manual', test: (h, x) => /Mage\.Cookies|\/static\/version\d+\/|"Magento_|text\/x-magento-init/i.test(h) || !!x['x-magento-cache-debug'] },
  { id: 'tilda', name: 'Tilda', connector: 'manual', mode: 'manual', test: (h) => /tildacdn\.com|generator[^>]+Tilda/i.test(h) },
  { id: 'duda', name: 'Duda', connector: 'manual', mode: 'manual', test: (h) => /irp\.cdn-website\.com|dmAlbum|cdn-website\.com/i.test(h) },
  { id: 'godaddy', name: 'GoDaddy Website Builder', connector: 'manual', mode: 'manual', test: (h) => /img1\.wsimg\.com|generator[^>]+(Go ?Daddy|Starfield)/i.test(h) },
  { id: 'weebly', name: 'Weebly / Square Online', connector: 'manual', mode: 'manual', test: (h) => /editmysite\.com|weebly\.com/i.test(h) },
  { id: 'jimdo', name: 'Jimdo', connector: 'manual', mode: 'manual', test: (h) => /jimstatic\.com|jimdo/i.test(h) },
  { id: 'typo3', name: 'TYPO3', connector: 'manual', mode: 'manual', test: (h) => /generator[^>]+TYPO3|\/typo3conf\/|\/typo3temp\//i.test(h) },
  { id: 'bitrix', name: '1C-Bitrix', connector: 'manual', mode: 'manual', test: (h) => /\/bitrix\/(js|templates|cache)\//i.test(h) },
  { id: 'opencart', name: 'OpenCart', connector: 'manual', mode: 'manual', test: (h) => /catalog\/view\/theme|route=common\/home|route=product\/product/i.test(h) },
  { id: 'ghost', name: 'Ghost', connector: 'manual', mode: 'manual', test: (h) => /generator[^>]+Ghost/i.test(h) },
  { id: 'hubspot', name: 'HubSpot CMS', connector: 'manual', mode: 'manual', test: (h, x) => /generator[^>]+HubSpot|hs-scripts\.com|hubspotusercontent/i.test(h) || !!x['x-hs-cache-config'] },
  { id: 'blogger', name: 'Blogger', connector: 'manual', mode: 'manual', test: (h) => /generator[^>]+Blogger|blogger\.com\/static/i.test(h) },
];

// Générateurs de sites statiques et frameworks : sans CMS, les corrections passent par les fichiers ou le Worker.
const FRAMEWORKS = [
  { id: 'nextjs', name: 'Next.js', test: (h, x) => /__NEXT_DATA__|\/_next\/static\//.test(h) || /Next\.js/i.test(x['x-powered-by'] || '') },
  { id: 'nuxt', name: 'Nuxt', test: (h) => /__NUXT__|\/_nuxt\//.test(h) },
  { id: 'gatsby', name: 'Gatsby', test: (h) => /___gatsby|generator[^>]+Gatsby/i.test(h) },
  { id: 'astro', name: 'Astro', test: (h) => /generator[^>]+Astro|astro-island/i.test(h) },
  { id: 'hugo', name: 'Hugo', test: (h) => /generator[^>]+Hugo/i.test(h) },
  { id: 'jekyll', name: 'Jekyll', test: (h) => /generator[^>]+Jekyll/i.test(h) },
  { id: 'eleventy', name: 'Eleventy', test: (h) => /generator[^>]+Eleventy/i.test(h) },
  { id: 'docusaurus', name: 'Docusaurus', test: (h) => /generator[^>]+Docusaurus/i.test(h) },
  { id: 'react', name: 'React (SPA)', test: (h) => /<div id="root"><\/div>|data-reactroot/i.test(h) },
  { id: 'vue', name: 'Vue (SPA)', test: (h) => /<div id="app"><\/div>|data-v-app/i.test(h) },
  { id: 'angular', name: 'Angular', test: (h) => /ng-version=/i.test(h) },
  { id: 'laravel', name: 'Laravel', test: (h, x) => /laravel_session/i.test(x['set-cookie'] || '') },
  { id: 'php', name: 'PHP', test: (h, x) => /PHP/i.test(x['x-powered-by'] || '') },
  { id: 'aspnet', name: 'ASP.NET', test: (h, x) => !!x['x-aspnet-version'] || /ASP\.NET/i.test(x['x-powered-by'] || '') },
];

const HOSTING = [
  { id: 'cloudflare', name: 'Cloudflare', test: (x) => !!x['cf-ray'] || /cloudflare/i.test(x.server || '') },
  { id: 'netlify', name: 'Netlify', test: (x) => /netlify/i.test(x.server || '') || !!x['x-nf-request-id'] },
  { id: 'vercel', name: 'Vercel', test: (x) => !!x['x-vercel-id'] || /vercel/i.test(x.server || '') },
  { id: 'github-pages', name: 'GitHub Pages', test: (x) => /GitHub\.com/i.test(x.server || '') },
  { id: 'apache', name: 'Apache', test: (x) => /apache/i.test(x.server || '') },
  { id: 'nginx', name: 'nginx', test: (x) => /nginx/i.test(x.server || '') },
  { id: 'litespeed', name: 'LiteSpeed', test: (x) => /litespeed/i.test(x.server || '') },
  { id: 'iis', name: 'IIS', test: (x) => /IIS/i.test(x.server || '') },
  { id: 'cloudfront', name: 'Amazon CloudFront', test: (x) => /cloudfront/i.test(x.via || '') || !!x['x-amz-cf-id'] },
  { id: 'fastly', name: 'Fastly', test: (x) => !!x['x-served-by'] && /cache-/i.test(x['x-served-by']) },
];

// Analyse pure (testable) : html = code source de l'accueil, headers = objet d'en-têtes en minuscules.
export function detectFromHtml(html, headers = {}) {
  const h = String(html || '').slice(0, 600000);
  const x = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const found = CMS.filter((c) => c.test(h, x));
  // WooCommerce est une extension de WordPress : on le signale sans changer de connecteur.
  const extras = [];
  if (found.some((c) => c.id === 'wordpress')) {
    if (/plugins\/woocommerce\/|woocommerce-(page|no-js|js)|wc-block/i.test(h)) extras.push('WooCommerce');
    if (/yoast/i.test(h)) extras.push('Yoast SEO');
    if (/rank-math|rankmath/i.test(h)) extras.push('Rank Math');
    if (/aioseo|all in one seo/i.test(h)) extras.push('All in One SEO');
    if (/seopress/i.test(h)) extras.push('SEOPress');
    if (/elementor/i.test(h)) extras.push('Elementor');
  }
  const cms = found[0] || null;
  const frameworks = FRAMEWORKS.filter((f) => f.test(h, x)).map((f) => f.name);
  const hosting = HOSTING.filter((s) => s.test(x)).map((s) => s.name);
  const behindCloudflare = hosting.includes('Cloudflare');
  let connector;
  let mode;
  if (cms) {
    connector = cms.connector;
    mode = cms.mode;
  } else if (behindCloudflare) {
    connector = 'cloudflare';
    mode = 'edge';
  } else {
    connector = 'files';
    mode = 'files';
  }
  const alternatives = [];
  if (cms && cms.mode === 'manual' && behindCloudflare) alternatives.push({ connector: 'cloudflare', mode: 'edge', why: 'The site is behind Cloudflare: a Worker can rewrite titles, descriptions, canonicals, robots, alt texts and redirects without touching the CMS.' });
  if (!cms) alternatives.push({ connector: 'files', mode: 'files', why: 'No CMS detected: edit the HTML files directly (local folder, Git checkout or export).' });
  if (!cms && !behindCloudflare) alternatives.push({ connector: 'cloudflare', mode: 'edge', why: 'Put the site behind Cloudflare (free plan) to apply fixes with the Arachnide Worker, whatever the technology.' });
  alternatives.push({ connector: 'manual', mode: 'manual', why: 'Always available: step-by-step instructions with the exact values to paste.' });
  return {
    cms: cms ? { id: cms.id, name: cms.name, version: cms.version?.(h, x) || null } : null,
    extensions: extras,
    frameworks,
    hosting,
    generator: /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(h)?.[1] || x['x-generator'] || null,
    connector,
    mode,
    alternatives,
    marketShare: MARKET_SHARE[cms?.id || 'none'] ?? null,
  };
}

export async function detectSite(url, { fetch = globalThis.fetch, userAgent } = {}) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': userAgent || 'Mozilla/5.0 (compatible; ArachnideSEO/3.0; +https://github.com/Jacckisback/arachnide-seo-spider)', accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  const html = await res.text();
  const headers = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const out = { url: res.url || url, status: res.status, ...detectFromHtml(html, headers) };
  if (res.status >= 400) out.warning = `The site answered ${res.status} (bot protection or error): detection is unreliable. Check the CMS with the site owner or retry with another user agent.`;
  return out;
}
