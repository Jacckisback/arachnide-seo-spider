// Génère les traductions du plugin WordPress : languages/arachnide-connector.pot, puis .po et .mo (compilés ici,
// sans gettext) pour fr_FR, es_ES, de_DE, it_IT, pt_PT et pt_BR. Usage : node integrations/wordpress/build-languages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'arachnide-connector');
const src = fs.readFileSync(path.join(DIR, 'arachnide-connector.php'), 'utf8');
const strings = [...new Set([...src.matchAll(/__\( '((?:[^'\\]|\\.)*)', 'arachnide-connector' \)/g)].map((m) => m[1].replace(/\\'/g, "'")))].sort();
const DESC = /\* Description:\s+(.+)/.exec(src)[1].trim();
strings.push(DESC);

// Traductions, dans l'ordre : fr, es, de, it, pt.
const T = {
  'All in One SEO Lite does not store SEO data for terms (AIOSEO Pro required).': ['All in One SEO Lite n’enregistre pas de données SEO pour les termes (AIOSEO Pro requis).', 'All in One SEO Lite no guarda datos SEO para los términos (se requiere AIOSEO Pro).', 'All in One SEO Lite speichert keine SEO-Daten für Begriffe (AIOSEO Pro erforderlich).', 'All in One SEO Lite non salva dati SEO per i termini (serve AIOSEO Pro).', 'O All in One SEO Lite não guarda dados SEO para termos (requer AIOSEO Pro).'],
  'All in One SEO could not save: ': ['All in One SEO n’a pas pu enregistrer : ', 'All in One SEO no pudo guardar: ', 'All in One SEO konnte nicht speichern: ', 'All in One SEO non ha potuto salvare: ', 'O All in One SEO não conseguiu guardar: '],
  'All in One SEO models are not available (unsupported AIOSEO version).': ['Les modèles de All in One SEO ne sont pas disponibles (version d’AIOSEO non prise en charge).', 'Los modelos de All in One SEO no están disponibles (versión de AIOSEO no compatible).', 'Die Modelle von All in One SEO sind nicht verfügbar (AIOSEO-Version nicht unterstützt).', 'I modelli di All in One SEO non sono disponibili (versione di AIOSEO non supportata).', 'Os modelos do All in One SEO não estão disponíveis (versão do AIOSEO não suportada).'],
  'Canonical must be an absolute http(s) URL.': ['La canonical doit être une URL absolue http(s).', 'La canonical debe ser una URL absoluta http(s).', 'Das Canonical muss eine absolute http(s)-URL sein.', 'La canonical deve essere un URL assoluto http(s).', 'A canonical deve ser um URL absoluto http(s).'],
  'Invalid URL.': ['URL invalide.', 'URL no válida.', 'Ungültige URL.', 'URL non valido.', 'URL inválido.'],
  'Invalid source (the home page cannot be redirected).': ['Source invalide (la page d’accueil ne peut pas être redirigée).', 'Origen no válido (la página de inicio no se puede redirigir).', 'Ungültige Quelle (die Startseite kann nicht weitergeleitet werden).', 'Origine non valida (la home page non può essere reindirizzata).', 'Origem inválida (a página inicial não pode ser redirecionada).'],
  'Invalid source.': ['Source invalide.', 'Origen no válido.', 'Ungültige Quelle.', 'Origine non valida.', 'Origem inválida.'],
  'No post, page or term matches this URL.': ['Aucun article, page ou terme ne correspond à cette URL.', 'Ninguna entrada, página o término corresponde a esta URL.', 'Kein Beitrag, keine Seite und kein Begriff entspricht dieser URL.', 'Nessun articolo, pagina o termine corrisponde a questo URL.', 'Nenhum artigo, página ou termo corresponde a este URL.'],
  'Post not found.': ['Contenu introuvable.', 'Contenido no encontrado.', 'Inhalt nicht gefunden.', 'Contenuto non trovato.', 'Conteúdo não encontrado.'],
  'Redirection has no enabled group: finish the Redirection setup first.': ['Redirection n’a aucun groupe actif : terminez d’abord la configuration de Redirection.', 'Redirection no tiene ningún grupo activo: termine primero la configuración de Redirection.', 'Redirection hat keine aktive Gruppe: Schließen Sie zuerst die Einrichtung von Redirection ab.', 'Redirection non ha gruppi attivi: completate prima la configurazione di Redirection.', 'O Redirection não tem nenhum grupo ativo: conclua primeiro a configuração do Redirection.'],
  'Redirection: ': ['Redirection : ', 'Redirection: ', 'Redirection: ', 'Redirection: ', 'Redirection: '],
  'Target must be an absolute http(s) URL.': ['La cible doit être une URL absolue http(s).', 'El destino debe ser una URL absoluta http(s).', 'Das Ziel muss eine absolute http(s)-URL sein.', 'La destinazione deve essere un URL assoluto http(s).', 'O destino deve ser um URL absoluto http(s).'],
  'Term not found.': ['Terme introuvable.', 'Término no encontrado.', 'Begriff nicht gefunden.', 'Termine non trovato.', 'Termo não encontrado.'],
  'Value must be a string or null.': ['La valeur doit être une chaîne ou null.', 'El valor debe ser una cadena o null.', 'Der Wert muss eine Zeichenkette oder null sein.', 'Il valore deve essere una stringa o null.', 'O valor deve ser uma cadeia de caracteres ou null.'],
  'from and to must be absolute http(s) URLs.': ['from et to doivent être des URL absolues http(s).', 'from y to deben ser URL absolutas http(s).', 'from und to müssen absolute http(s)-URLs sein.', 'from e to devono essere URL assoluti http(s).', 'from e to devem ser URLs absolutos http(s).'],
  'json_ld must be a JSON object or array.': ['json_ld doit être un objet ou un tableau JSON.', 'json_ld debe ser un objeto o una matriz JSON.', 'json_ld muss ein JSON-Objekt oder -Array sein.', 'json_ld deve essere un oggetto o un array JSON.', 'json_ld deve ser um objeto ou uma matriz JSON.'],
  'noindex must be true, false or null.': ['noindex doit valoir true, false ou null.', 'noindex debe ser true, false o null.', 'noindex muss true, false oder null sein.', 'noindex deve essere true, false o null.', 'noindex deve ser true, false ou null.'],
  [DESC]: ['Permet à Arachnide SEO Spider de lire et d’appliquer des corrections SEO (title SEO, meta description, canonical, noindex, redirections 301, données structurées JSON-LD, liens internes) via l’API REST, en utilisant Yoast SEO, Rank Math, All in One SEO, SEOPress ou Redirection lorsqu’ils sont actifs.', 'Permite que Arachnide SEO Spider lea y aplique correcciones SEO (title SEO, meta description, canonical, noindex, redirecciones 301, datos estructurados JSON-LD, enlaces internos) mediante la API REST, usando Yoast SEO, Rank Math, All in One SEO, SEOPress o Redirection cuando están activos.', 'Ermöglicht Arachnide SEO Spider, SEO-Korrekturen (SEO-Title, Meta-Beschreibung, Canonical, noindex, 301-Weiterleitungen, strukturierte JSON-LD-Daten, interne Links) über die REST-API zu lesen und anzuwenden, mit Yoast SEO, Rank Math, All in One SEO, SEOPress oder Redirection, wenn sie aktiv sind.', 'Permette ad Arachnide SEO Spider di leggere e applicare correzioni SEO (title SEO, meta description, canonical, noindex, reindirizzamenti 301, dati strutturati JSON-LD, link interni) tramite l’API REST, usando Yoast SEO, Rank Math, All in One SEO, SEOPress o Redirection quando sono attivi.', 'Permite ao Arachnide SEO Spider ler e aplicar correções SEO (title SEO, meta description, canonical, noindex, redirecionamentos 301, dados estruturados JSON-LD, links internos) através da API REST, usando Yoast SEO, Rank Math, All in One SEO, SEOPress ou Redirection quando estão ativos.'],
};
const LOCALES = [['fr_FR', 0], ['es_ES', 1], ['de_DE', 2], ['it_IT', 3], ['pt_PT', 4], ['pt_BR', 4]];

const q = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
const header = (lang) => `Project-Id-Version: Arachnide Connector\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n${lang ? `Language: ${lang}\nPlural-Forms: nplurals=2; plural=${/^(fr|pt_BR)/.test(lang) ? 'n > 1' : 'n != 1'};\n` : ''}X-Domain: arachnide-connector\n`;
const po = (lang, pairs) => [`msgid ""\nmsgstr ${q(header(lang))}\n`, ...pairs.map(([id, str]) => `msgid ${q(id)}\nmsgstr ${q(str)}\n`)].join('\n');

// Fichier .mo (format GNU gettext) : en-tête, table des originaux, table des traductions, chaînes.
function mo(lang, pairs) {
  const entries = [['', header(lang)], ...pairs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const ids = entries.map(([id]) => Buffer.from(id, 'utf8'));
  const strs = entries.map(([, s]) => Buffer.from(s, 'utf8'));
  const N = entries.length;
  const headSize = 28 + 16 * N;
  let offset = headSize;
  const idTable = [];
  const strTable = [];
  for (const b of ids) idTable.push([b.length, offset]), (offset += b.length + 1);
  for (const b of strs) strTable.push([b.length, offset]), (offset += b.length + 1);
  const out = Buffer.alloc(offset);
  out.writeUInt32LE(0x950412de, 0);
  out.writeUInt32LE(0, 4);
  out.writeUInt32LE(N, 8);
  out.writeUInt32LE(28, 12);
  out.writeUInt32LE(28 + 8 * N, 16);
  out.writeUInt32LE(0, 20);
  out.writeUInt32LE(headSize, 24);
  idTable.forEach(([len, off], i) => (out.writeUInt32LE(len, 28 + 8 * i), out.writeUInt32LE(off, 32 + 8 * i)));
  strTable.forEach(([len, off], i) => (out.writeUInt32LE(len, 28 + 8 * N + 8 * i), out.writeUInt32LE(off, 32 + 8 * N + 8 * i)));
  [...ids, ...strs].forEach((b, i) => b.copy(out, (i < N ? idTable[i] : strTable[i - N])[1]));
  return out;
}

const LANG_DIR = path.join(DIR, 'languages');
fs.mkdirSync(LANG_DIR, { recursive: true });
const missing = strings.filter((s) => !T[s]);
if (missing.length) throw new Error('Missing translations: ' + missing.join(' | '));
fs.writeFileSync(path.join(LANG_DIR, 'arachnide-connector.pot'), po(null, strings.map((s) => [s, ''])));
for (const [lang, i] of LOCALES) {
  const pairs = strings.map((s) => [s, T[s][i]]);
  fs.writeFileSync(path.join(LANG_DIR, `arachnide-connector-${lang}.po`), po(lang, pairs));
  fs.writeFileSync(path.join(LANG_DIR, `arachnide-connector-${lang}.mo`), mo(lang, pairs));
}
console.log(`${strings.length} strings, ${LOCALES.length} languages → ${LANG_DIR}`);
