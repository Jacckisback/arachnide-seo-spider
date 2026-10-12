// Connecteur PrestaShop 1.7 / 8 / 9 : Webservice du cœur (<boutique>/api/), clé passée comme identifiant HTTP Basic
// (mot de passe vide). Lecture en JSON (output_format=JSON) ; écriture en XML (le Webservice n'accepte pas de corps JSON) :
// PATCH partiel quand il est disponible (PrestaShop ≥ 8.1), sinon PUT de la ressource complète relue en XML.
//
// Docs :
//   Webservice (auth, formats, filtres)  https://devdocs.prestashop-project.org/9/webservice/
//   Paramètres output_format, language, display, filter  https://devdocs.prestashop-project.org/9/webservice/cheat-sheet/
//   Ressources products / categories / content_management_system / manufacturers / languages / configurations
//                                        https://devdocs.prestashop-project.org/9/webservice/resources/
//   Mise à jour (PUT / PATCH)            https://devdocs.prestashop-project.org/9/webservice/tutorials/
//   Code de référence                    https://github.com/PrestaShop/PrestaShop/blob/develop/classes/webservice/WebserviceRequest.php
//   Règles d'URL par défaut              https://github.com/PrestaShop/PrestaShop/blob/develop/classes/Dispatcher.php
//
// Pas de canonical, noindex ni redirections dans le Webservice du cœur : ces champs ne sont pas déclarés.
import { Connector, ConnectorError, setImageAltInHtml, getImageAltInHtml } from './base.mjs';

// h1 = champ affiché en titre ; title = champ <title>. Pour les pages CMS, meta_title est le titre visible
// et head_seo_title la balise <title> (classes/Meta.php, getCmsMetas).
// strip = champs en lecture seule (setter false) ou dangereux à renvoyer dans un PUT complet.
const RES = {
  products: { node: 'product', label: 'product', h1: 'name', title: 'meta_title', html: ['description', 'description_short'], strip: ['manufacturer_name', 'quantity', 'new', 'position_in_category'] },
  categories: { node: 'category', label: 'category', h1: 'name', title: 'meta_title', html: ['description', 'additional_description'], strip: ['level_depth', 'nb_products_recursive'] },
  content_management_system: { node: 'content', label: 'CMS page', h1: 'meta_title', title: 'head_seo_title', html: ['content'], strip: [] },
  manufacturers: { node: 'manufacturer', label: 'brand', h1: 'name', title: 'meta_title', html: ['description', 'short_description'], strip: ['link_rewrite'] },
};
const I18N_SINGLE = { manufacturers: ['name'] }; // champs non multilingues
const PERM_HINT = 'In Advanced Parameters > Webservice, enable the webservice and give the key GET + PUT (and PATCH on PrestaShop 8.1+) on products, categories, content_management_system, manufacturers, and GET on languages and configurations.';

const cdata = (v) => `<![CDATA[${String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NO_ALT = '\u0000arachnide-no-alt';
const htmlAlt = (html, src, v) => setImageAltInHtml(html, src, v ?? NO_ALT).html.replace(` alt="${NO_ALT}"`, '');

// Valeur d'un champ multilingue en JSON : chaîne (une seule langue demandée) ou [{ id, value }].
const langValue = (v, lang) => {
  if (Array.isArray(v)) return v.find((x) => String(x.id) === String(lang))?.value ?? '';
  return v ?? '';
};

export default class PrestaShopConnector extends Connector {
  static id = 'prestashop';
  static label = 'PrestaShop';
  static fields = ['seo_title', 'meta_description', 'h1', 'image_alt'];
  static setup = {
    apiKey: 'Webservice key, Advanced Parameters > Webservice (env: ARACHNIDE_PRESTASHOP_KEY)',
    languageId: 'Optional language id to edit when the URL has no language prefix (default: PS_LANG_DEFAULT)',
    apiBase: 'Optional webservice root, e.g. https://shop.example.com/api (default: <site url>/api)',
  };

  constructor(site, opts) {
    super(site, opts);
    const root = new URL(site.url);
    this.basePath = root.pathname.replace(/\/+$/, '');
    this.api = String(site.apiBase || `${root.origin}${this.basePath}/api`).replace(/\/+$/, '');
  }

  // https://devdocs.prestashop-project.org/9/webservice/ (clé = identifiant HTTP Basic, mot de passe vide)
  async req(path, opts = {}) {
    if (!this.site.apiKey) throw new ConnectorError('config', 'PrestaShop: missing webservice key.', 'Set "apiKey" in the site config (e.g. "env:ARACHNIDE_PRESTASHOP_KEY").');
    const auth = 'Basic ' + Buffer.from(`${this.site.apiKey}:`).toString('base64');
    const xml = opts.xml;
    const url = this.api + path + (xml ? '' : `${path.includes('?') ? '&' : '?'}output_format=JSON`);
    try {
      return await this.http(url, {
        ...opts,
        raw: xml || opts.raw,
        headers: { authorization: auth, ...(xml ? { accept: 'application/xml', 'content-type': 'application/xml; charset=utf-8' } : {}), ...opts.headers },
      });
    } catch (e) {
      if (e.code === 'auth') e.hint = 'Check the webservice key and its permissions. ' + PERM_HINT;
      throw e;
    }
  }

  async test() {
    const langs = await this.languages();
    const def = await this.defaultLang();
    await this.req('/products?display=[id]&limit=1');
    return { ok: true, details: `PrestaShop webservice OK — languages: ${langs.map((l) => `${l.iso_code}(${l.id})`).join(', ')}; edited by default: ${def}` };
  }

  languages() {
    return this.memo('langs', async () => {
      const r = await this.req('/languages?display=[id,iso_code,active]');
      return (r?.languages || []).map((l) => ({ id: String(l.id), iso_code: String(l.iso_code).toLowerCase(), active: String(l.active) === '1' }));
    });
  }

  defaultLang() {
    return this.memo('deflang', async () => {
      if (this.site.languageId) return String(this.site.languageId);
      try {
        const r = await this.req('/configurations?display=[name,value]&filter[name]=[PS_LANG_DEFAULT]');
        const v = r?.configurations?.find((c) => c.name === 'PS_LANG_DEFAULT')?.value;
        if (v) return String(v);
      } catch {}
      const langs = await this.languages();
      return (langs.find((l) => l.active) || langs[0])?.id || '1';
    });
  }

  // --- URL publique → ressource ----------------------------------------------------------------------------------
  // Règles par défaut (Dispatcher.php) : produit {category:/}{id}{-:id_product_attribute}-{rewrite}{-:ean13}.html,
  // catégorie {id}-{rewrite}, CMS content/{id}-{rewrite}, marque brand/{id}-{rewrite} (1.7 : {id}_{rewrite}),
  // préfixe ISO de langue (/fr/) en multilingue ; sans URL simplifiées : index.php?controller=product&id_product=N.

  async resolve(url) {
    const u = new URL(url, this.origin);
    let rel = this.path(u.href);
    if (this.basePath && (rel === this.basePath || rel.startsWith(this.basePath + '/'))) rel = rel.slice(this.basePath.length) || '/';
    return this.memo('r:' + rel + u.search, async () => {
      const segs = rel.split('/').filter(Boolean);
      if (segs[0] === 'index.php') segs.shift();
      let lang = null;
      if (segs.length && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(segs[0])) {
        const l = (await this.languages()).find((x) => x.iso_code === segs[0].toLowerCase());
        if (l) {
          lang = l.id;
          segs.shift();
        }
      }
      if (!lang && u.searchParams.get('id_lang')) lang = u.searchParams.get('id_lang');
      lang ||= await this.defaultLang();

      const q = u.searchParams;
      const direct = [['id_product', 'products'], ['id_category', 'categories'], ['id_cms', 'content_management_system'], ['id_manufacturer', 'manufacturers']];
      for (const [p, resource] of direct) if (/^\d+$/.test(q.get(p) || '')) return this.check(resource, q.get(p), lang, url);

      if (!segs.length) throw new ConnectorError('not_found', 'PrestaShop: the home page is not a catalog resource.', 'Edit the home page title/description in Shop Parameters > Traffic & SEO > SEO & URLs (page "index").');
      const last = segs[segs.length - 1];
      let m;
      if (segs[0] === 'content' && segs[1] === 'category') throw new ConnectorError('unsupported', 'PrestaShop: CMS categories are not supported.');
      if (segs[0] === 'supplier') throw new ConnectorError('unsupported', 'PrestaShop: supplier pages are not supported.');
      const tries = [];
      if (segs[0] === 'content' && (m = /^(\d+)-/.exec(last))) tries.push(['content_management_system', m[1]]);
      else if (segs[0] === 'brand' && (m = /^(\d+)-/.exec(last))) tries.push(['manufacturers', m[1]]);
      else if ((m = /^(\d+)(?:-\d+)?-.+\.html?$/i.exec(last))) tries.push(['products', m[1]]);
      else if (segs.length === 1 && (m = /^(\d+)_.+/.exec(last))) tries.push(['manufacturers', m[1]]);
      else if ((m = /^(\d+)-/.exec(last))) tries.push(['categories', m[1]]);
      for (const [resource, id] of tries) {
        const hit = await this.check(resource, id, lang, url, true);
        if (hit) return hit;
      }
      // Routes personnalisées sans identifiant : recherche par link_rewrite.
      const slug = last.replace(/\.html?$/i, '').replace(/^\d+(?:-\d+)?[-_]/, '');
      for (const resource of ['products', 'categories', 'content_management_system']) {
        const r = await this.req(`/${resource}?display=[id]&filter[link_rewrite]=[${encodeURIComponent(slug)}]&language=${lang}`, { allow404: true });
        const list = Array.isArray(r) ? [] : r?.[resource] || [];
        if (list.length === 1) return { resource, id: String(list[0].id), lang };
      }
      throw new ConnectorError('not_found', `PrestaShop: no product, category, CMS page or brand found for ${url}.`);
    });
  }

  async check(resource, id, lang, url, soft = false) {
    const r = await this.req(`/${resource}/${id}?language=${lang}`, { allow404: true });
    if (r?.[RES[resource].node]) return { resource, id: String(id), lang };
    if (soft) return null;
    throw new ConnectorError('not_found', `PrestaShop: ${RES[resource].label} ${id} not found (${url}).`);
  }

  // --- Lecture / écriture ----------------------------------------------------------------------------------------

  async load(res) {
    const r = await this.req(`/${res.resource}/${res.id}?language=${res.lang}`, { allow404: true });
    const o = r?.[RES[res.resource].node];
    if (!o) throw new ConnectorError('not_found', `PrestaShop: ${RES[res.resource].label} ${res.id} not found.`);
    return o;
  }

  fieldFor(res, field) {
    const def = RES[res.resource];
    if (field === 'seo_title') return def.title;
    if (field === 'meta_description') return 'meta_description';
    if (field === 'h1') return def.h1;
    return null;
  }

  async get(change) {
    const res = await this.resolve(change.url);
    const o = await this.load(res);
    if (change.field === 'image_alt') return this.findImage(res, o, change.target).alt;
    const f = this.fieldFor(res, change.field);
    if (!f) return super.get(change);
    if (!(f in o)) throw new ConnectorError('unsupported', `PrestaShop: field "${f}" is not available on this version.`);
    return langValue(o[f], res.lang) || null;
  }

  async set(change) {
    const res = await this.resolve(change.url);
    const o = await this.load(res);
    const v = change.value;
    if (change.field === 'image_alt') {
      const img = this.findImage(res, o, change.target);
      return this.write(res, img.field, htmlAlt(img.html, change.target, v));
    }
    const f = this.fieldFor(res, change.field);
    if (!f) return super.set(change);
    if (!(f in o)) throw new ConnectorError('unsupported', `PrestaShop: field "${f}" is not available on this version.`);
    if (change.field === 'h1' && !v) throw new ConnectorError('unsupported', `PrestaShop: the ${RES[res.resource].label} name cannot be empty.`);
    return this.write(res, f, v ?? '');
  }

  // <img> dans les champs HTML de la ressource (description…). Les légendes des images produit ne sont pas exposées
  // par le Webservice.
  findImage(res, o, target) {
    if (!target) throw new ConnectorError('config', 'PrestaShop: image_alt needs target = image src.');
    for (const field of RES[res.resource].html) {
      if (!(field in o)) continue;
      const html = langValue(o[field], res.lang);
      const alt = getImageAltInHtml(html, target);
      if (alt !== undefined) return { field, html, alt };
    }
    throw new ConnectorError('not_found', `PrestaShop: image ${target} not found in the ${RES[res.resource].label} descriptions.`, 'Product image legends (Catalog > Products > Images > caption) are not available through the webservice; edit them in the back office.');
  }

  // Écriture d'un champ : PATCH partiel (PrestaShop ≥ 8.1), sinon PUT de la ressource complète.
  async write(res, field, value) {
    const def = RES[res.resource];
    const single = I18N_SINGLE[res.resource]?.includes(field);
    const inner = single ? cdata(value) : `<language id="${res.lang}">${cdata(value)}</language>`;
    if (!this.noPatch) {
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><${def.node}><id>${cdata(res.id)}</id><${field}>${inner}</${field}></${def.node}></prestashop>`;
      try {
        await this.req(`/${res.resource}/${res.id}`, { method: 'PATCH', body, xml: true });
        return;
      } catch (e) {
        if (!(e.code === 'http' && /→ 405\b/.test(e.message))) throw e;
        this.noPatch = true; // PrestaShop < 8.1, ou PATCH non autorisé pour la clé / bloqué par le serveur
      }
    }
    // PUT : la ressource complète est relue en XML, modifiée puis renvoyée sans les champs en lecture seule.
    let xml = await this.req(`/${res.resource}/${res.id}`, { xml: true });
    if (typeof xml !== 'string' || !xml.includes(`<${def.node}`)) throw new ConnectorError('http', `PrestaShop: unexpected XML for ${res.resource}/${res.id}.`);
    for (const f of [...def.strip, 'associations']) {
      xml = xml.replace(new RegExp(`\\s*<${f}\\b[^>]*/>`, 'g'), '').replace(new RegExp(`\\s*<${f}\\b[^>]*>[\\s\\S]*?</${f}>`, 'g'), '');
    }
    const fieldRe = new RegExp(`(<${field}\\b[^>]*>)([\\s\\S]*?)(</${field}>)|<${field}\\b([^>]*)/>`);
    const fm = fieldRe.exec(xml);
    if (!fm) throw new ConnectorError('unsupported', `PrestaShop: field "${field}" not found in the ${def.label} XML.`);
    let replaced;
    if (single || fm[4] !== undefined) {
      replaced = `<${field}>${inner}</${field}>`;
    } else {
      const content = fm[2];
      const langRe = new RegExp(`<language id="${esc(res.lang)}"([^>]*?)(?:/>|>[\\s\\S]*?</language>)`);
      const lm = langRe.exec(content);
      const next = lm ? content.replace(langRe, `<language id="${res.lang}"${lm[1]}>${cdata(value)}</language>`) : content + `<language id="${res.lang}">${cdata(value)}</language>`;
      replaced = fm[1] + next + fm[3];
    }
    xml = xml.slice(0, fm.index) + replaced + xml.slice(fm.index + fm[0].length);
    await this.req(`/${res.resource}/${res.id}`, { method: 'PUT', body: xml, xml: true });
  }
}
