// Outils texte : mots vides multilingues, mots-clés principaux, simhash (quasi-doublons).
import crypto from 'node:crypto';

const STOP = new Set(
  `a à afin ai aie ainsi alors au aucun aussi autre aux avec avoir bon car ce ceci cela celle celles celui ces cet cette chaque chez ci comme comment dans de des du donc dont elle elles en encore est et été être eu fait faire il ils je la le les leur leurs lui là ma mais me même mes moi mon ne ni nos notre nous on ont ou où par pas peu peut plus pour pourquoi qu quand que quel quelle quelles quels qui sa sans se ses si son sont sous sur ta te tes toi ton tous tout toute toutes tr très tu un une vos votre vous vu ça
  the a an and or but if then than of to in on at by for with from as is are was were be been being it its this that these those there their they them he she his her we our you your i me my not no do does did have has had will would can could should may might just so very also about into over after before more most other such only own same too what which who whom when where why how all any both each few some up down out off again further once here
  el la lo los las un una unos unas y o pero si de del al en con por para sin sobre entre es son fue ser estar está están como más menos muy ya que qué cual cuál quien quién donde dónde cuando cuándo este esta estos estas ese esa esos esas su sus mi mis tu tus nuestro nuestra le les se nos me te no ni también hay
  der die das den dem des ein eine einer eines einem einen und oder aber wenn dann als von zu im in an auf mit für aus bei nach über unter ist sind war waren sein hat haben wird werden nicht kein keine auch noch nur sehr wie was wer wo warum sich sie er es wir ihr ich du mein dein unser euer ihr diese dieser dieses
  il lo la i gli le un uno una e o ma se di del della dei delle da in con su per tra fra è sono era essere avere ha hanno non come più anche che chi cui dove quando questo questa questi queste quello quella suo sua suoi sue mio mia nostro nostra
  o a os as um uma uns umas e ou mas se de do da dos das em no na nos nas com por para sem sobre entre é são foi ser estar está estão como mais menos muito já que qual quem onde quando este esta estes estas esse essa seu sua seus suas meu minha nosso nossa não também há`.split(/\s+/)
);

// Écritures sans espaces entre les mots (chinois, japonais, thaï, lao, khmer, birman) : découpage par Intl.Segmenter.
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
let segmenter = null;
function segmentWords(text) {
  segmenter ||= new Intl.Segmenter(undefined, { granularity: 'word' });
  const out = [];
  for (const s of segmenter.segment(text)) if (s.isWordLike && /[\p{L}\p{N}]/u.test(s.segment)) out.push(s.segment);
  return out;
}

export function tokenize(text) {
  const s = String(text || '').toLowerCase();
  if (NO_SPACE_SCRIPT.test(s)) return segmentWords(s).map((w) => w.replace(/^['’-]+|['’-]+$/g, '')).filter(Boolean);
  return (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).filter(Boolean);
}

// Nombre de mots d'un texte, juste aussi pour les langues sans espaces (un article japonais n'est pas « 1 mot »).
export function countWords(text) {
  const s = String(text || '');
  if (!s.trim()) return 0;
  if (NO_SPACE_SCRIPT.test(s)) return segmentWords(s).length;
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Les bigrammes ne doivent pas enjamber une fin de phrase, un séparateur de titre (« | », « - ») ou un bloc.
const SEGMENT_SPLIT = /\n|[.!?;:|·•—–](?=\s|$)|\s[-–—|]\s/;

export const isStop = (w) => STOP.has(w) || w.length < 3 || /^\d+$/.test(w);

// Termes principaux d'une page : unigrammes + bigrammes pondérés, titre et H1 renforcés.
export function topKeywords(bodyText, title = '', h1 = '', n = 5) {
  const score = new Map();
  const addTokens = (text, weight) => {
    for (const seg of String(text || '').split(SEGMENT_SPLIT)) addSegment(tokenize(seg), weight);
  };
  const addSegment = (tokens, weight) => {
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i];
      if (!isStop(w)) score.set(w, (score.get(w) || 0) + weight);
      const w2 = tokens[i + 1];
      if (w2 && !isStop(w) && !isStop(w2)) {
        const bg = w + ' ' + w2;
        score.set(bg, (score.get(bg) || 0) + weight * 1.6);
      }
    }
  };
  addTokens(bodyText, 1);
  addTokens(title, 15);
  addTokens(h1, 8);
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

// Simhash 64 bits sur des 3-grammes de mots, renvoyé sous forme [hi, lo] (deux entiers 32 bits).
export function simhash(tokens) {
  if (tokens.length < 3) return null;
  const v = new Int32Array(64);
  for (let i = 0; i + 2 < tokens.length; i++) {
    const h = crypto.createHash('md5').update(tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2]).digest();
    for (let b = 0; b < 64; b++) {
      const bit = (h[b >> 3] >> (b & 7)) & 1;
      v[b] += bit ? 1 : -1;
    }
  }
  let hi = 0;
  let lo = 0;
  for (let b = 0; b < 32; b++) if (v[b] > 0) hi |= 1 << b;
  for (let b = 0; b < 32; b++) if (v[b + 32] > 0) lo |= 1 << b;
  return [hi >>> 0, lo >>> 0];
}

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export const hamming = (a, b) => popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);
export const similarity = (a, b) => Math.round((1 - hamming(a, b) / 64) * 100);
