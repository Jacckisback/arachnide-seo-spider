// Normalisation d'URL partagée par le crawler et l'analyse de logs : la même règle donne la même clé des deux côtés,
// sinon une page crawlée et la même page vue dans les logs ne se retrouveraient pas.
//   - fragment retiré, encodage %xx en majuscules (RFC 3986) ;
//   - paramètres retirés à la demande (removeParams : motifs, « utm_* ») ;
//   - par défaut (normalizeParams) : paramètres de suivi connus retirés, paramètres triés par clé ;
//   - « /a? » = « /a ».

// Paramètres de suivi : ils ne changent pas la page (Google les ignore).
export const TRACKING_PARAMS = /^(utm_[a-z0-9_]+|gclid|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|yclid|twclid|ttclid|igshid|srsltid|_hsenc|_hsmi|hsctatracking|mkt_tok|vero_id|s_kwcid|ef_id|zanpid|_ga|_gl|_gid|_ke|oly_enc_id|oly_anon_id|rb_clickid|trk_[a-z0-9_]+|ref_src|ref_url)$/i;

const upperHex = (x) => x.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
const keyOf = (kv) => {
  let k = kv.split('=')[0];
  try {
    k = decodeURIComponent(k.replace(/\+/g, ' '));
  } catch {
    /* clé mal encodée : comparée telle quelle */
  }
  return k;
};

// Motifs de removeParams (« utm_*, gclid ») compilés en expressions régulières.
export function compileParamPatterns(src) {
  return String(src || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));
}

export function normalizeUrl(url, { ignoreQuery = false, removeParamRes = [], normalizeParams = true } = {}) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.pathname = upperHex(u.pathname);
    if (ignoreQuery) u.search = '';
    else if (removeParamRes.length && u.search) {
      // Suppression sur la chaîne brute : URLSearchParams réécrirait « ?b » en « ?b= » et « %20 » en « + ».
      const kept = u.search
        .slice(1)
        .split('&')
        .filter((kv) => kv && !removeParamRes.some((re) => re.test(keyOf(kv))));
      u.search = kept.length ? '?' + kept.join('&') : '';
    }
    if (u.search && normalizeParams) {
      const kept = u.search.slice(1).split('&').filter(Boolean).filter((kv) => !TRACKING_PARAMS.test(keyOf(kv)));
      kept.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
      u.search = kept.length ? '?' + kept.join('&') : '';
    }
    if (u.search) u.search = upperHex(u.search);
    return u.href.endsWith('?') ? u.href.slice(0, -1) : u.href;
  } catch {
    return null;
  }
}
