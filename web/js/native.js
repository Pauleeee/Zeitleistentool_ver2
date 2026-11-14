// Rückfragen, Hinweise und Datei-Export — im Browser wie gewohnt, in der Mac-App nativ.
//
// Hintergrund: Das Fenster der Tauri-App (WKWebView) kennt die Browser-Dialoge nicht.
// `alert()` zeigt dort nichts, `confirm()` antwortet stumm mit „Nein", und ein Download-Link
// legt keine Datei ab. Deshalb gehen alle diese Stellen über diese Datei: Ist
// `window.__TAURI__` da, kommen echte Mac-Dialoge, sonst die des Browsers.

import { exportJson } from './store.js';

const tauri = window.__TAURI__;
export const istApp = Boolean(tauri);

/** Ja/Nein-Rückfrage. Liefert true bei „OK". */
export async function frage(text) {
  if (!tauri) return confirm(text);
  return tauri.dialog.ask(text, { title: 'Zeitleiste', kind: 'warning', okLabel: 'OK', cancelLabel: 'Abbrechen' });
}

/** Reiner Hinweis mit OK-Knopf. */
export async function hinweis(text) {
  if (!tauri) { alert(text); return; }
  await tauri.dialog.message(text, { title: 'Zeitleiste' });
}

/** Datenstand als JSON-Datei sichern — in der App mit „Sichern unter …"-Dialog.
 *  Den Dialog öffnet Rust selbst (Befehl `exportieren`); die Seite gibt keinen Pfad vor. */
export async function exportiere(data, dateiname = 'zeitleiste.json') {
  if (!tauri) { exportJson(data, dateiname); return; }
  await tauri.core.invoke('exportieren', { dateiname, inhalt: JSON.stringify(data, null, 2) });
}
