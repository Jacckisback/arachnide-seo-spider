// Directives robots (meta robots / googlebot et en-tête X-Robots-Tag), lues comme Google les lit :
// directive par directive, jamais par sous-chaîne (« max-image-preview:none » n'est pas « none »,
// « noindexing » n'est pas « noindex »). Partagé entre le moteur (Node) et l'interface (navigateur).

// Robots qui, s'ils sont nommés en préfixe (« googlebot: noindex »), concernent Google.
const GOOGLE_BOTS = /^(googlebot|googlebot-news|googlebot-image|googlebot-video|google|\*)$/i;

// Découpe une valeur (ou plusieurs, jointes) en directives normalisées en minuscules.
// Un préfixe « bot: » limite la directive à ce robot : on ne garde que celles de Google (ou sans préfixe).
export function robotsDirectives(...values) {
  const out = [];
  for (const v of values) {
    // « otherbot: noindex, nofollow » : le préfixe vaut pour les directives qui suivent, jusqu'au préfixe suivant.
    let forGoogle = true;
    // La date RFC 850 de unavailable_after contient une virgule après le jour (« Wednesday, 25-Aug-2020 »).
    for (let part of String(v || '').replace(/(unavailable_after\s*:\s*[a-z]+),/gi, '$1 ').split(',')) {
      part = part.trim().toLowerCase();
      if (!part) continue;
      // Préfixe robot (« googlebot: noindex ») : uniquement quand ce n'est pas la valeur d'une directive.
      const m = /^([a-z0-9*_-]+)\s*:\s*(.+)$/.exec(part);
      if (m && !/^(max-snippet|max-image-preview|max-video-preview|unavailable_after)$/.test(m[1])) {
        forGoogle = GOOGLE_BOTS.test(m[1]);
        part = m[2].trim();
      }
      if (!forGoogle) continue;
      if (/^unavailable_after\s*:/.test(part)) {
        out.push('unavailable_after:' + part.replace(/^unavailable_after\s*:\s*/, '').trim());
        continue;
      }
      for (const tok of part.split(/\s+/)) if (tok) out.push(tok);
    }
  }
  return out;
}

// Verdict d'indexation : noindex / nofollow effectifs, directives lues, date « unavailable_after » passée.
export function robotsFlags(...values) {
  const tokens = robotsDirectives(...values);
  let noindex = tokens.includes('noindex') || tokens.includes('none');
  let nofollow = tokens.includes('nofollow') || tokens.includes('none');
  let unavailableAfter = '';
  for (const t of tokens) {
    if (t.startsWith('unavailable_after:')) {
      unavailableAfter = t.slice('unavailable_after:'.length);
      const d = Date.parse(unavailableAfter);
      // Format RFC 850 (« 25-Aug-2020 15:00:00 EST ») accepté par Google mais pas par Date.parse : on remplace les tirets.
      const d2 = Number.isNaN(d) ? Date.parse(unavailableAfter.replace(/^(\d{1,2})-([a-z]{3})-(\d{2,4})/i, '$1 $2 $3')) : d;
      if (!Number.isNaN(d2) && d2 < Date.now()) noindex = true;
    }
  }
  return { noindex, nofollow, tokens, unavailableAfter };
}

export const isNoindex = (...values) => robotsFlags(...values).noindex;
export const isNofollow = (...values) => robotsFlags(...values).nofollow;
