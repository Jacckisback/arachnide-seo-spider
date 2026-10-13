// Connecteurs de corrections : interface commune CMSConnector, indépendante du CMS.
//   testConnection() → { ok, … }   canApply(fix) → bool   read(fix) → valeur publiée côté CMS
//   apply(fix) → { previous }      rollback(fix) → remet fix.oldValue
// WordPress réutilise le connecteur v3.0 (src/connectors/wordpress.mjs + plugin compagnon).
// GitHub travaille par lot (une Pull Request) : voir github.mjs. Export : aucune écriture.
// Shopify, Webflow, Wix : connecteurs v3.0 disponibles pour le MCP ; branchement dans ce module = TODO (docs/CONNECTORS.md).
import WordPressConnector from '../connectors/wordpress.mjs';

export class CMSConnector {
  static id = 'base';
  static batch = false; // true : l'application se fait en un lot (ex. Pull Request)
  constructor(conn, { fetch = globalThis.fetch } = {}) {
    this.conn = conn;
    this.fetch = fetch;
  }
  async testConnection() {
    return { ok: true };
  }
  canApply() {
    return false;
  }
  async read() {
    return undefined;
  }
  async apply() {
    throw new Error('not supported');
  }
  async rollback() {
    throw new Error('not supported');
  }
}

// Correspondance Fix → champ du moteur de changements v3.0.
const WP_FIELDS = { seo_title: 'seo_title', meta_description: 'meta_description', h1: 'h1', canonical: 'canonical', noindex: 'noindex', image_alt: 'image_alt', redirect: 'redirect', json_ld: 'json_ld', link: 'link' };

export class WordPressFixConnector extends CMSConnector {
  static id = 'wordpress';
  constructor(conn, opts) {
    super(conn, opts);
    this.wp = new WordPressConnector({ name: new URL(conn.url).hostname, url: conn.url, connector: 'wordpress', user: conn.user, appPassword: conn.appPassword }, { fetch: this.fetch });
  }
  change(fix, value = fix.newValue) {
    return { url: fix.url, field: WP_FIELDS[fix.target.kind], value, target: fix.target.selector || undefined };
  }
  async testConnection() {
    const r = await this.wp.test();
    return { ok: true, ...r };
  }
  canApply(fix) {
    return !!WP_FIELDS[fix.target.kind] && this.wp.supports(WP_FIELDS[fix.target.kind]);
  }
  async read(fix) {
    return this.wp.get(this.change(fix));
  }
  async apply(fix) {
    const previous = await this.read(fix).catch(() => fix.oldValue ?? null);
    await this.wp.set(this.change(fix));
    return { previous };
  }
  async rollback(fix) {
    // Redirection créée par Arachnide : on la supprime ; sinon on remet la valeur d'avant.
    await this.wp.set(this.change(fix, fix.target.kind === 'redirect' ? null : fix.oldValue ?? null));
  }
}

export class ExportFixConnector extends CMSConnector {
  static id = 'export';
}

export const FIX_CONNECTORS = { wordpress: WordPressFixConnector, export: ExportFixConnector };

export async function fixConnectorFor(conn, opts) {
  if (conn.type === 'github') {
    const { GitHubFixConnector } = await import('./github.mjs');
    return new GitHubFixConnector(conn, opts);
  }
  const Cls = FIX_CONNECTORS[conn.type] || ExportFixConnector;
  return new Cls(conn, opts);
}
