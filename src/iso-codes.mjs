// Codes acceptés par Google pour hreflang : langue ISO 639-1, région ISO 3166-1 alpha-2.
export const ISO_639_1 = new Set(`aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu`.split(' '));

// Région ISO 3166-1 alpha-2 (Intl connaît la liste à jour) ; UK, EU, UN… sont des alias que Google n'accepte pas.
const NOT_ISO = new Set(['UK', 'EU', 'UN', 'EZ', 'QO']);
let regions = null;
export function isRegion(code) {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || NOT_ISO.has(c)) return false;
  regions ||= new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  return !!regions.of(c);
}

// hreflang valide pour Google : x-default, ou langue ISO 639-1 [+ écriture ISO 15924] [+ région ISO 3166-1].
export function isValidHreflang(value) {
  const v = String(value || '').trim();
  if (/^x-default$/i.test(v)) return true;
  const m = /^([a-z]{2})(?:-([a-z]{4}))?(?:-([a-z]{2}))?$/i.exec(v);
  return !!m && ISO_639_1.has(m[1].toLowerCase()) && (!m[3] || isRegion(m[3]));
}
