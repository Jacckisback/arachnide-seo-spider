// Traductions : chargement des dictionnaires et fonction t(clé, paramètres). Utilisé par l'interface, les rapports et la CLI.
export const LANGS = [
  { code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'es', name: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', locale: 'it-IT' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', locale: 'pt-PT' },
];

const cache = {};

export async function loadDict(code) {
  if (!LANGS.some((l) => l.code === code)) code = 'en';
  if (!cache[code]) cache[code] = (await import(`../i18n/${code}.js`)).default;
  return cache[code];
}

export async function getT(code) {
  const lang = LANGS.find((l) => l.code === code) || LANGS[0];
  const [dict, fallback] = await Promise.all([loadDict(lang.code), loadDict('en')]);
  return createT(dict, fallback, lang);
}

export function createT(dict, fallback, lang) {
  const nf = new Intl.NumberFormat(lang.locale);
  const pr = new Intl.PluralRules(lang.locale);
  const t = (key, params = {}) => {
    // Pluriel : une variante « clé.one » est utilisée quand {n} est au singulier dans la langue (fr : 0 et 1).
    if (typeof params.n === 'number' && pr.select(params.n) === 'one' && (dict[key + '.one'] ?? fallback?.[key + '.one']) !== undefined) key += '.one';
    const s = dict[key] ?? fallback?.[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : typeof params[k] === 'number' ? nf.format(params[k]) : String(params[k])));
  };
  t.lang = lang.code;
  t.locale = lang.locale;
  t.has = (key) => key in dict || (fallback && key in fallback);
  t.num = (n) => (n == null || n === '' ? '' : nf.format(n));
  t.date = (d, opts = { dateStyle: 'long', timeStyle: 'short' }) => new Intl.DateTimeFormat(lang.locale, opts).format(new Date(d));
  return t;
}

// Le détail d'un problème est soit un texte neutre, soit { k: clé, p: paramètres }.
export function detailText(d, t) {
  if (d && typeof d === 'object') return t(d.k, d.p);
  return d ?? '';
}

export function detectLang(preferred) {
  const cands = [preferred, ...(typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [])];
  for (const c of cands) {
    const code = String(c || '').slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === code)) return code;
  }
  return 'en';
}
