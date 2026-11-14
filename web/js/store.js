// Datenzugriff hinter einer schlanken, async Schnittstelle.
//
// Die ganze App spricht NUR mit dieser Schnittstelle, nie direkt mit
// localStorage. Dadurch lässt sich später ein echter Backend-Store
// (z. B. Supabase) als Drop-in einsetzen: einfach eine neue Klasse mit
// denselben Methoden (load/save) schreiben und in main.js instanziieren.
//
//   interface Store {
//     async load(): Promise<Data | null>
//     async save(data: Data): Promise<void>
//   }
//
// Export/Import von JSON-Dateien sind reine Helfer und vom Store unabhängig.

import { emptyData, makeItem, makeCategory, makeSubcategory, makeConnection, makeSource } from './model.js';

const STORAGE_KEY = 'pkm-timeline-v6';

export class LocalStorageStore {
  constructor(key = STORAGE_KEY) {
    this.key = key;
  }

  async load() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('Konnte gespeicherte Daten nicht lesen:', err);
      return null;
    }
  }

  async save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }

  async clear() {
    localStorage.removeItem(this.key);
  }
}

// --- JSON Datei-Export / -Import (unabhängig vom Store) -------------------

export function exportJson(data, filename = 'zeitleiste.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// --- Normalisieren ------------------------------------------------------
//
// Alles, was von außen kommt (Datei-Import, Datenbestand des alten Tools), läuft hier
// durch die Fabriken aus `model.js`. Die erledigen die Migration der Altfelder — etwa
// `refs[].quote` → `refs[].note` oder `source.author` → `authorFirst`/`authorLast` — und
// ergänzen fehlende Felder; vorhandene `id`s bleiben dabei erhalten.
//
// Ein paar Felder kennen die Fabriken (noch) nicht, weil sie erst in der neuen Engine
// entstanden sind: `hidden` am Eintrag, `fromDate`/`toDate` an der Verbindung und
// `beleg` an beidem — die schnelle Freitext-Fundstelle („Buch, S. 214"), solange die
// richtige Quellenverwaltung (A4) noch aussteht. Die werden danach wieder angeheftet.
export function normalize(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== 'object') return d;

  d.categories = (raw.categories || []).map(makeCategory);
  d.subcategories = (raw.subcategories || []).map(makeSubcategory);
  d.sources = (raw.sources || []).map(makeSource);
  d.items = (raw.items || []).map((r) => {
    const it = makeItem(r);
    if (r.hidden) it.hidden = true;
    if (r.beleg) it.beleg = r.beleg;
    return it;
  });

  // Verbindungen ins Leere würden beim Zeichnen stolpern — nur behalten, was beide Enden hat.
  const vorhanden = new Set(d.items.map((i) => i.id));
  d.connections = (raw.connections || [])
    .filter((r) => vorhanden.has(r.fromId) && vorhanden.has(r.toId))
    .map((r) => {
      const c = makeConnection(r);
      if (r.fromDate) c.fromDate = r.fromDate;
      if (r.toDate) c.toDate = r.toDate;
      if (r.beleg) c.beleg = r.beleg;
      return c;
    });

  d.meta = { ...d.meta, ...(raw.meta || {}) };
  return d;
}
