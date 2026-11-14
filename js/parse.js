// parse.js — Text, wie man ihn beim Lesen tippt, in das Datenformat übersetzen.
//
// Beim Lesen hat man einen Namen und zwei Jahreszahlen im Kopf, keine Geometrie und
// kein ISO-Format. Diese Datei nimmt beides entgegen:
//
//   parseDatum('um 1630')        → '1630'
//   parseDatum('14.4.1629')      → '1629-04-14'
//   parseDatum('14. April 1629') → '1629-04-14'
//   parseDatum('1629?')          → '1629'
//   parseDatum('heute')          → 'now'
//
//   parseZeile('Christiaan Huygens 1629-1695')
//     → { title: 'Christiaan Huygens', start: '1629', end: '1695' }
//
// Ausgabe ist immer das Teil-Datum "JJJJ[-MM[-TT]]", das `toDate()` in model.js versteht.
// model.js selbst bleibt unangetastet.

const MON_NAMEN = [
  ['januar', 'jan'], ['februar', 'feb'], ['märz', 'maerz', 'mrz', 'mär'], ['april', 'apr'],
  ['mai'], ['juni', 'jun'], ['juli', 'jul'], ['august', 'aug'],
  ['september', 'sept', 'sep'], ['oktober', 'okt'], ['november', 'nov'], ['dezember', 'dez'],
];
// Längere Schreibweisen zuerst, damit „september" nicht schon bei „sep" abbricht.
const MON = MON_NAMEN.flat().sort((a, b) => b.length - a.length).join('|');
function monIdx(wort) {
  const w = wort.toLowerCase().replace(/\.$/, '');
  const i = MON_NAMEN.findIndex((gruppe) => gruppe.includes(w));
  return i < 0 ? null : i + 1;
}

const p2 = (n) => String(n).padStart(2, '0');
function iso(y, m, d) {
  const jahr = String(Number(y));
  if (!m) return jahr;
  if (!d) return `${jahr}-${p2(Number(m))}`;
  return `${jahr}-${p2(Number(m))}-${p2(Number(d))}`;
}

// Unschärfe („um 1630", „1629?") kann das Datenmodell nicht abbilden — wir nehmen
// die Jahreszahl und werfen die Beiwörter weg, statt die Eingabe abzulehnen.
const VORSATZ = /^(?:um|ca\.?|circa|etwa|gegen|vor|nach|seit|ab|zwischen)\s+/i;

export function parseDatum(text) {
  if (text == null) return null;
  let s = String(text).trim().toLowerCase();
  if (!s) return null;
  while (VORSATZ.test(s)) s = s.replace(VORSATZ, '');
  s = s.replace(/[?()\s.]+$/, '').trim();
  if (!s) return null;
  if (/^(?:heute|jetzt|now|gegenwart)$/.test(s)) return 'now';

  let m;
  if ((m = s.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{3,4})$/))) return iso(m[3], m[2], m[1]);
  if ((m = s.match(new RegExp(`^(\\d{1,2})\\.?\\s*(${MON})\\.?\\s*(\\d{3,4})$`)))) return iso(m[3], monIdx(m[2]), m[1]);
  if ((m = s.match(new RegExp(`^(${MON})\\.?\\s*(\\d{3,4})$`)))) return iso(m[2], monIdx(m[1]), null);
  if ((m = s.match(/^(\d{1,2})\.\s*(\d{3,4})$/))) return iso(m[2], m[1], null);
  if ((m = s.match(/^(\d{1,4})$/))) return String(Number(m[1]));
  return null;
}

// Ein Datums-Token, wie es in einer Schnellerfassungs-Zeile stehen darf. Die Monatsnamen
// sind eine feste Liste — sonst würde „Newton 1643" als „Monat Jahr" durchgehen und der
// Name verschwände.
const TOK = '(?:heute|jetzt|now'
  + `|\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*\\d{3,4}`
  + `|\\d{1,2}\\.?\\s*(?:${MON})\\.?\\s*\\d{3,4}`
  + `|(?:${MON})\\.?\\s*\\d{3,4}`
  + `|\\d{3,4}-\\d{1,2}(?:-\\d{1,2})?`
  + `|\\d{1,2}\\.\\s*\\d{3,4}`
  + `|\\d{3,4})`;
// Trennzeichen zwischen Anfang und Ende. Reiner Zwischenraum zählt auch, damit
// „Huygens *1629 †1695" und „Ada Lovelace 1815 1852" durchgehen.
const SEP = '(?:\\s*(?:[-–—]|bis|to|\\/|†)\\s*|\\s+)';
// Der Datumsteil steht am Ende und braucht ein Trennzeichen davor — dadurch bleibt
// immer ein Name übrig, und „Newton" allein wird nicht zum Datum.
const SCHWANZ = new RegExp(`[\\s(,;–-]+(?:\\*\\s*)?(${TOK})(?:${SEP}(?:†\\s*)?(${TOK}))?\\s*\\)?\\s*$`, 'i');

// „Christiaan Huygens 1629-1695" → Name + Spanne. Ohne erkennbares Datum ist die
// ganze Zeile der Name (dann setzt der Aufrufer seine eigene Schätzung ein).
export function parseZeile(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(SCHWANZ);
  if (!m) return { title: s, start: null, end: null };
  const title = s.slice(0, m.index).replace(/[\s(,;*–-]+$/, '').trim();
  if (!title) return { title: s, start: null, end: null };
  const start = parseDatum(m[1]);
  const end = m[2] ? parseDatum(m[2]) : null;
  if (!start) return { title: s, start: null, end: null };
  return { title, start, end };
}
