// Connecteur « manuel » : aucune écriture automatique. Lit les valeurs publiées et produit, pour chaque
// modification, les instructions exactes à suivre dans l'interface du CMS (où cliquer, quoi coller).
import { Connector, ConnectorError } from './base.mjs';
import { readLive } from '../live.mjs';

// Chemins d'interface par CMS et par champ. {value} est remplacé par la valeur à coller.
// Chemins vérifiés en octobre 2026 quand c'était possible ; l'interface des CMS évolue, d'où des libellés génériques.
export const UI_PATHS = {
  squarespace: {
    seo_title: 'Pages panel → gear icon of the page → SEO tab → "SEO title": {value} (blog post: ⋯ → Settings → SEO; product: product editor → SEO tab)',
    meta_description: 'Pages panel → gear icon of the page → SEO tab → "SEO description": {value}',
    noindex: 'Page settings → SEO → "Hide page from search results": {value}',
    image_alt: 'Edit the image block showing {target} → Content → alt text: {value} (product image: product editor → image → alt text)',
    redirect: 'Settings → Developer tools → URL mappings, add the line: {url} -> {value} 301 (use paths, e.g. /old -> /new 301)',
    canonical: 'Squarespace generates canonicals automatically. Workaround (paid plans): Page settings → Advanced → Page header code injection: <link rel="canonical" href="{value}">',
    h1: 'Edit the page and change the first Heading 1 block to: {value}',
  },
  wix: {
    seo_title: 'Editor → Pages & Menu → ⋯ next to the page → SEO basics → "Title tag": {value}',
    meta_description: 'Editor → Pages & Menu → ⋯ next to the page → SEO basics → "Meta description": {value}',
    noindex: 'Editor → Pages & Menu → ⋯ → SEO basics → "Let search engines index this page": {value}',
    canonical: 'Editor → Pages & Menu → ⋯ → SEO basics → Advanced SEO → Canonical: {value}',
    image_alt: 'In the Editor, select the image {target} → Settings (gear) → "What\'s in the image? Tell Google": {value}',
    redirect: 'Dashboard → Marketing & SEO → SEO → Tools and settings → URL Redirect Manager → + New Redirect: from {url} to {value}',
    h1: 'In the Editor, edit the main heading text of the page: {value}',
  },
  shopify: {
    seo_title: 'Admin → Products / Collections / Online Store → Pages or Blog posts → the item → "Search engine listing" → Edit → Page title: {value}',
    meta_description: 'Admin → the item → "Search engine listing" → Edit → Meta description: {value}',
    image_alt: 'Admin → Products → the product → click the image {target} → Add alt text: {value}',
    redirect: 'Admin → Content → Menus → View URL redirects → Create URL redirect: from {url} to {value}',
    canonical: 'Shopify themes generate the canonical: edit theme.liquid (Online Store → Themes → Edit code) to change it.',
    noindex: 'No admin toggle: set the metafield seo.hidden = 1 on the item (or edit the theme) to {value} indexing.',
  },
  webflow: {
    seo_title: 'Designer → Pages panel → gear of the page → SEO settings → Title tag: {value} (CMS template pages: edit the bound collection field)',
    meta_description: 'Designer → Pages panel → gear of the page → SEO settings → Meta description: {value}',
    image_alt: 'Select the image {target} → Settings panel → Alt text: {value} (or Assets panel → asset settings)',
    redirect: 'Site settings → Publishing → 301 redirects: old path {url} → redirect to {value}, then publish',
    canonical: 'Page settings → Custom code → Inside <head> tag: <link rel="canonical" href="{value}"> (global canonical: Site settings → SEO)',
    noindex: 'Page settings → Custom code → Inside <head>: <meta name="robots" content="noindex"> to {value} indexing, and switch off "Sitemap indexing".',
  },
  wordpress: {
    seo_title: 'Edit the post/page → SEO plugin box (Yoast: "SEO title"; Rank Math: General → Edit Snippet → Title): {value}',
    meta_description: 'Edit the post/page → SEO plugin box (Yoast / Rank Math) → Meta description: {value}',
    noindex: 'Edit the post/page → Yoast: Advanced → "Allow search engines to show this content in search results?"; Rank Math: Advanced → Robots Meta "No Index" → {value} indexing',
    canonical: 'Edit the post/page → Yoast: Advanced → Canonical URL; Rank Math: Advanced → Canonical URL: {value}',
    image_alt: 'Media → Library → the image {target} → "Alternative Text": {value} (or select the image block → Alternative text)',
    redirect: 'Install the Redirection plugin (or Rank Math → Redirections / Yoast Premium → Redirects) and add a 301 from {url} to {value}',
    h1: 'Edit the post/page and change its title to: {value}',
  },
  generic: {
    seo_title: 'Open the page in your CMS editor, find the SEO / search engine settings and set the page title (meta title) to: {value}',
    meta_description: 'In the page SEO settings, set the meta description to: {value}',
    h1: 'Edit the page content and change the main heading (H1) to: {value}',
    canonical: 'In the page SEO / advanced settings, set the canonical URL to: {value}',
    noindex: 'In the page SEO settings, {value} search engine indexing for this page.',
    image_alt: 'Edit the page, select the image {target} and set its alternative text (alt) to: {value}',
    redirect: 'In the redirects / URL manager of your CMS or server, add a 301 redirect from {url} to {value}',
  },
};

export function manualInstructions(cms, change) {
  const paths = { ...UI_PATHS.generic, ...(UI_PATHS[cms] || {}) };
  let text = paths[change.field] || UI_PATHS.generic[change.field] || `Set ${change.field} to {value}`;
  const value = change.field === 'noindex' ? (change.value ? 'turn OFF (hide from search engines)' : 'turn ON (allow)') : change.value ?? '(empty / default)';
  if (change.field === 'redirect' && change.value == null) text = 'Delete the 301 redirect from {url} in your redirects manager.';
  return text.replaceAll('{value}', String(value)).replaceAll('{url}', change.url).replaceAll('{target}', change.target || '');
}

export class ManualConnector extends Connector {
  static id = 'manual';
  static label = 'Manual (guided)';
  static fields = [];
  static setup = { cms: 'Optional CMS id (squarespace, wix, magento…) to get CMS-specific instructions' };

  async test() {
    return { ok: true, details: 'Read-only: changes are returned as step-by-step instructions.' };
  }

  async get(change) {
    const v = await readLive(change.url, change.field, { target: change.target, fetch: this.fetchImpl });
    return change.field === 'redirect' ? v?.to ?? null : v ?? null;
  }

  async set(change) {
    throw new ConnectorError('manual', manualInstructions(this.site.cms, change));
  }
}

export default ManualConnector;
