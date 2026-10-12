// Registre des connecteurs : chargés à la demande pour ne pas alourdir le démarrage.
import { FIELDS, ConnectorError } from './base.mjs';

export const CONNECTORS = {
  wordpress: () => import('./wordpress.mjs'),
  shopify: () => import('./shopify.mjs'),
  wix: () => import('./wix.mjs'),
  webflow: () => import('./webflow.mjs'),
  joomla: () => import('./joomla.mjs'),
  drupal: () => import('./drupal.mjs'),
  prestashop: () => import('./prestashop.mjs'),
  cloudflare: () => import('./cloudflare.mjs'),
  files: () => import('./files.mjs'),
  manual: () => import('./manual.mjs'),
};

export async function connectorClass(id) {
  const load = CONNECTORS[id];
  if (!load) throw new ConnectorError('config', `Unknown connector "${id}". Available: ${Object.keys(CONNECTORS).join(', ')}.`);
  return (await load()).default;
}

export async function createConnector(site, opts) {
  const Cls = await connectorClass(site.connector);
  return new Cls(site, opts);
}

export async function describeConnectors() {
  const out = [];
  for (const id of Object.keys(CONNECTORS)) {
    try {
      const C = await connectorClass(id);
      out.push({ id, label: C.label, fields: C.fields, setup: C.setup });
    } catch (e) {
      out.push({ id, error: e.message });
    }
  }
  return out;
}

export { FIELDS };
