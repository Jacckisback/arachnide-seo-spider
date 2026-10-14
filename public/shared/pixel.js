// Estimation de la largeur en pixels d'un texte dans les SERP Google (police Arial).
// Largeurs Arial/Helvetica en millièmes d'em pour les caractères ASCII 32 à 126.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // espace à /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0-9
  278, 278, 584, 584, 584, 556, 1015, // : à @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, // A-Z
  278, 278, 278, 469, 556, 333, // [ à `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, // a-z
  334, 260, 334, 584, // { à ~
];

function charWidth(ch) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return W[c - 32];
  const base = ch.normalize('NFD')[0];
  const b = base.codePointAt(0);
  if (b >= 32 && b <= 126) return W[b - 32];
  if (c >= 0x2e80) return 1000; // CJK, emojis
  return 556;
}

export function textWidth(text, fontSize) {
  let units = 0;
  for (const ch of String(text || '')) units += charWidth(ch);
  return Math.round((units * fontSize) / 1000);
}

// Google desktop : titre Arial 20px (~580 px visibles), description Arial 14px (~990 px sur deux lignes).
export const titlePixels = (t) => textWidth(t, 20);
export const descPixels = (t) => textWidth(t, 14);
