// history.js — Undo/Redo über Schnappschüsse.
//
// Bewusst simpel: der gesamte Datenstand ist klein (JSON im niedrigen zweistelligen
// KB-Bereich), deshalb ist ein vollständiger Schnappschuss je Schritt billiger und viel
// robuster, als einzelne Aktionen rückwärts zu rechnen. Ein Schnappschuss enthält die
// Daten UND die Anordnung (`pos`) — sonst würde ein zurückgeholter Eintrag seine Zeile
// verlieren.
//
// Aufrufmuster: `record()` NACH der Änderung. `current` hält immer den Stand, wie er
// zuletzt festgehalten wurde — also den Stand VOR der jetzigen Änderung.
// `touch()` schreibt den Stand fort, ohne einen neuen Schritt zu erzeugen; damit werden
// schnell aufeinanderfolgende Änderungen derselben Art (Tippen, Ziehen) zu einem Schritt.

const LIMIT = 60;
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class History {
  constructor(snapshot) { this.past = []; this.future = []; this.current = clone(snapshot); }

  record(snapshot) {
    this.past.push(this.current);
    if (this.past.length > LIMIT) this.past.shift();
    this.future.length = 0;
    this.current = clone(snapshot);
  }
  touch(snapshot) { this.current = clone(snapshot); }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undo() { if (!this.past.length) return null; this.future.push(this.current); this.current = this.past.pop(); return clone(this.current); }
  redo() { if (!this.future.length) return null; this.past.push(this.current); this.current = this.future.pop(); return clone(this.current); }
}
