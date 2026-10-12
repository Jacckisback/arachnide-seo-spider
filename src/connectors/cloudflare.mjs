// Connecteur « edge » : écrit les corrections dans le KV lu par l'Arachnide SEO Worker
// (integrations/cloudflare-worker). Fonctionne devant tout site qui passe par Cloudflare, quel que soit le CMS.
// API : https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/
import { Connector, ConnectorError } from './base.mjs';

const API = 'https://api.cloudflare.com/client/v4';

export const normPath = (p) => {
  let s = p;
  try {
    s = decodeURIComponent(p);
  } catch {
    // chemin mal encodé : gardé tel quel
  }
  return s.replace(/\/+$/, '') || '/';
};

export class CloudflareConnector extends Connector {
  static id = 'cloudflare';
  static label = 'Cloudflare Worker';
  static fields = ['seo_title', 'meta_description', 'h1', 'canonical', 'noindex', 'image_alt', 'redirect'];
  static setup = {
    accountId: 'Cloudflare account ID',
    namespaceId: 'ID of the KV namespace bound as ARACHNIDE in the Worker',
    apiToken: 'API token with "Workers KV Storage: Edit" (env ARACHNIDE_CF_TOKEN)',
  };

  constructor(site, opts) {
    super(site, opts);
    for (const k of ['accountId', 'namespaceId', 'apiToken']) {
      if (!site[k]) throw new ConnectorError('config', `The Cloudflare connector needs "${k}".`, 'See integrations/cloudflare-worker/README.md');
    }
    this.api = site.apiBase || API;
    this.headers = { authorization: `Bearer ${site.apiToken}` };
  }

  kvUrl(key) {
    return `${this.api}/accounts/${this.site.accountId}/storage/kv/namespaces/${this.site.namespaceId}/values/${encodeURIComponent(key)}`;
  }

  async test() {
    const r = await this.http(`${this.api}/accounts/${this.site.accountId}/storage/kv/namespaces/${this.site.namespaceId}`, { headers: this.headers });
    return { ok: true, details: `KV namespace "${r?.result?.title || this.site.namespaceId}" reachable. Check that the Arachnide Worker is deployed on the routes of ${new URL(this.site.url).host}.` };
  }

  async readKey(key) {
    const text = await this.http(this.kvUrl(key), { headers: this.headers, raw: true, allow404: true });
    if (text == null || text === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async writeKey(key, value) {
    if (value == null) return this.http(this.kvUrl(key), { method: 'DELETE', headers: this.headers, allow404: true });
    return this.http(this.kvUrl(key), { method: 'PUT', headers: { ...this.headers, 'content-type': 'text/plain' }, body: JSON.stringify(value) });
  }

  pathKey(url) {
    return normPath(new URL(url, this.origin).pathname);
  }

  async get(change) {
    const path = this.pathKey(change.url);
    if (change.field === 'redirect') return (await this.readKey('r:' + path))?.to ?? null;
    const rule = (await this.readKey('p:' + path)) || {};
    if (change.field === 'image_alt') return rule.image_alt?.[change.target] ?? null;
    return rule[change.field] ?? null;
  }

  async set(change) {
    const path = this.pathKey(change.url);
    if (change.field === 'redirect') return this.writeKey('r:' + path, change.value ? { to: change.value, status: 301 } : null);
    const rule = (await this.readKey('p:' + path)) || {};
    if (change.field === 'image_alt') {
      rule.image_alt = { ...rule.image_alt };
      if (change.value == null) delete rule.image_alt[change.target];
      else rule.image_alt[change.target] = change.value;
      if (!Object.keys(rule.image_alt).length) delete rule.image_alt;
    } else if (change.value == null) {
      delete rule[change.field];
    } else {
      rule[change.field] = change.field === 'noindex' ? !!change.value : String(change.value);
    }
    return this.writeKey('p:' + path, Object.keys(rule).length ? rule : null);
  }
}

export default CloudflareConnector;
