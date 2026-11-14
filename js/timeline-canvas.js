// timeline-canvas.js — Zeitleiste: Lebensspannen-Balken + gerichtete, datierte Verbindungen
//
// Modell (mit dem Nutzer erarbeitet, Stand 2):
//   - Personen = LEBENSSPANNEN-BALKEN. Position = ECHTES Datum (X), Höhe automatisch (Y).
//     Personen werden NICHT frei verschoben (damit die Zeit nicht „falsch" wird).
//   - Lebenszeit: die Enden (Geburt/Tod) sind nur im BEARBEITEN-Modus per Ziehen leicht
//     änderbar (neu angelegte Person ist automatisch im Bearbeiten-Modus). Danach fixiert;
//     spätere Änderung nur über den Umweg „Datum tippen" / Knopf „Lebenszeit ändern".
//   - Doppelklick auf eine Person/Welt-Ereignis = AUSBLENDEN (kommt über die Liste zurück).
//     Doppelklick auf leere Fläche = neue Person (Klick = Lebensmitte, 60 J.).
//   - VERBINDEN: auf einem Balken ziehen = Verbindung. Startpunkt = Datum unter dem Cursor,
//     Ziel = Datum auf der horizontalen Achse der Zielperson (oder ein Ereignis). Beide Enden
//     sind datiert → senkrechte Pfeile (Zeitgenossen, gleiches Datum) ODER schräge, gerichtete
//     Pfeile (Einfluss auf spätere Personen/Ereignisse).
//
// EBENEN (Durchgang „Orientierung & Lesbarkeit"):
//   gBack  — Bildschirmkoordinaten, hinten:  Fläche, Zeitbänder, Raster
//   gWorld — translate(tx,ty) scale(k):      Verbindungen, Balken, Rauten, Griffe
//   gUI    — Bildschirmkoordinaten, vorn:    ALLE Beschriftungen, klebende Jahresleiste, Randhinweise
// Weil die Beschriftungen nicht mitskaliert werden, bleiben sie auf jeder Zoomstufe gleich
// gut lesbar; welche überhaupt erscheinen, entscheidet die Zoomstufe (LOD) und ein
// Kollisions-Durchgang in `_placeLabels()`.
//
// Reines DOM-SVG, abhängigkeitsfrei.

import { toDate, fmtDate, getEntryColor, byId, persons, worldEvents,
         assignLanes, makeItem, makeConnection, rgba } from './model.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const YEAR = 365.25 * 24 * 3600 * 1000;
const HEAD = 30;                    // Kopfzeile im Balken: Name + Lebensdaten
const SLOT = 20;                    // eine Beschriftungszeile für Ereignisse/Bereiche
const GAP  = 16;                    // Luft zwischen zwei Zeilen der Leinwand
const BODY = 96;                    // fester Platz für aufgeklappte Zusatzinfos (Weltmaß)
const MINW = 26;                    // schmalster Balken (Weltmaß)
const AXIS_H = 30;                  // Höhe der klebenden Jahresleiste (Bildschirmmaß)
const K_MIN = 0.15, K_MAX = 4, K_FIT_MIN = 0.5;
const LOD = { sub: 0.85, event: 0.8, conn: 1.2 };   // ab welcher Zoomstufe was erscheint
const F_TITLE = '600 12.5px system-ui', F_SUB = '500 9.5px system-ui',
      F_EV = '500 9.5px system-ui', F_CONN = 'italic 9.5px system-ui';

function el(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  if (parent) parent.appendChild(n);
  return n;
}
const _measCtx = document.createElement('canvas').getContext('2d');
function textWidth(str, font) { _measCtx.font = font; return _measCtx.measureText(str).width; }
function ellipsize(str, font, maxW) {
  if (textWidth(str, font) <= maxW) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (textWidth(str.slice(0, m) + '…', font) <= maxW) lo = m; else hi = m - 1; }
  return str.slice(0, Math.max(1, lo)) + '…';
}
// „runde" Schrittweite für die Jahresachse (immer ~10 Beschriftungen im Bild)
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
function niceStep(raw) { for (const s of NICE) if (s >= raw) return s; return NICE[NICE.length - 1]; }

export class TimelineCanvas {
  constructor(container, data, opts = {}) {
    this.container = container;
    this.data = data;
    this.onSelect = opts.onSelect || (() => {});
    this.onChange = opts.onChange || (() => {});
    this.onView = opts.onView || (() => {});
    // Eine frisch gezogene Verbindung ist namenlos — der Aufrufer bekommt sie sofort
    // zum Benennen vorgelegt, statt dass sie stumm auf der Leinwand liegen bleibt.
    this.onConn = opts.onConn || (() => {});
    this.showConns = true;
    this.pos = new Map();          // barId -> { cy }  (nur Layout-Y; X = echtes Datum)
    this.view = { tx: 30, ty: 24, k: 1 };
    this.selected = null; this.editing = null;
    this.selConn = null;           // ausgewählte Verbindung (Linie angeklickt)
    this.sel = new Set();          // Mehrfachauswahl; `selected` = zuletzt angeklickt (fürs Panel)
    this.expanded = new Set();     // aufgeklappte Balken (reiner Ansichtszustand)
    this.justCreated = null;       // frisch angelegter Eintrag → Panel fokussiert den Namen
    this.pan = null; this.pending = null; this.resize = null; this.move = null;
    this._userTouched = false;
    this._labels = []; this._evRow = new Map(); this._kidRows = new Map();
    this.shift = new Map();   // temporäres Ausweichen (siehe _pushApart), wird nie gespeichert
    this.kid = null;          // Ziehen an einem Ereignis/Bereich
    this._bounds = { x0: 0, x1: 1, y0: 0, y1: 1 };

    this._buildDom();
    this._buildScale();
    this._initialLayout();
    if (opts.initialLayout) for (const [id, p] of opts.initialLayout) if (byId(this.data.items, id)) this.pos.set(id, { cy: p.cy });
    this._bindEvents();
    this.render();
    if (opts.initialView && isFinite(opts.initialView.k)) { this.view = { ...opts.initialView }; this._userTouched = true; this._applyView(); }
    else this.fit();
    this._ro = new ResizeObserver(() => {
      if (this._fitPending || !this._userTouched) this.fit();
      else this._applyView();
    });
    this._ro.observe(this.container);
  }

  yearOf(s) { return new Date(+toDate(s, 'start')).getFullYear(); }
  // Kinder eines Balkens: Ereignisse (Zeitpunkt) und Bereiche (Zeitspanne) IM Balken.
  _kids(id) { return this.data.items.filter((i) => i.personId === id && !i.hidden); }
  // Balkenhöhe: Kopfzeile + so viele Beschriftungszeilen, wie sich die Kinder zeitlich überlagern.
  _trackH(id) { return HEAD + Math.max(1, this._kidRows.get(id) || 0) * SLOT; }
  _h(id) { return this._trackH(id) + (this.expanded.has(id) ? BODY : 0); }
  _laneStep() { return HEAD + SLOT + GAP; }
  _visible(id) { const it = byId(this.data.items, id); if (!it || it.hidden) return false; if (it.personId) { const o = byId(this.data.items, it.personId); if (!o || o.hidden) return false; } return true; }
  _rect() { return this.svg.getBoundingClientRect(); }

  // ── DOM ──
  _buildDom() {
    // Nur ein früheres SVG entfernen — der Hinweis-Kasten aus index.html bleibt erhalten.
    const old = this.container.querySelector('svg.tl-svg');
    if (old) old.remove();
    this.svg = el('svg', { class: 'tl-svg' }, this.container);
    const defs = el('defs', {}, this.svg);
    for (const [id, cls] of [['inf', 'tl-mk-inf'], ['inf-hi', 'tl-mk-hi'], ['rel', 'tl-mk-rel']]) {
      const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { class: cls, d: 'M0,0 L10,5 L0,10 z' }, m);
    }
    // hinten (Bildschirmkoordinaten): Fläche, Zeitbänder, Raster
    this.gBack = el('g', { class: 'tl-back' }, this.svg);
    this.bg = el('rect', { class: 'tl-bg', x: 0, y: 0, width: '100%', height: '100%', fill: 'transparent' }, this.gBack);
    this.gBands = el('g', { class: 'tl-bands' }, this.gBack);
    this.gGrid = el('g', { class: 'tl-gridlines' }, this.gBack);
    // Mitte (Weltkoordinaten, wird transformiert): Geometrie
    this.gWorld = el('g', { class: 'tl-world' }, this.svg);
    this.gConns = el('g', { class: 'tl-conns' }, this.gWorld);
    this.gBars = el('g', { class: 'tl-bars' }, this.gWorld);
    this.pendingLine = el('path', { class: 'tl-pending', d: '' }, this.gWorld);
    this.pendingDot = el('circle', { class: 'tl-pending-dot', r: 4, opacity: 0 }, this.gWorld);
    // vorn (Bildschirmkoordinaten): Beschriftungen, Jahresleiste, Randhinweise
    this.gUI = el('g', { class: 'tl-ui' }, this.svg);
    this.gLabels = el('g', { class: 'tl-labels' }, this.gUI);
    this.gAxis = el('g', { class: 'tl-axis' }, this.gUI);
    this.gEdge = el('g', { class: 'tl-edge' }, this.gUI);
    this.gDrag = el('g', { class: 'tl-drag' }, this.gUI);   // Jahresanzeige beim Verbinden
  }

  // Jahresanzeige am Cursor: dass die Waagerechte das Datum bestimmt, ist eine schöne
  // Idee, die man ohne diese Anzeige nicht sieht — man zielt auf 1675 und bekommt 1677.
  _showReadout(sx, sy, text) {
    const g = this.gDrag; g.innerHTML = '';
    const w = textWidth(text, F_SUB) + 16;
    el('rect', { class: 'tl-readout-bg', x: sx + 12, y: sy - 26, width: w, height: 20, rx: 10 }, g);
    el('text', { class: 'tl-readout', x: sx + 12 + w / 2, y: sy - 12, 'text-anchor': 'middle', text }, g);
  }
  _hideReadout() { this.gDrag.innerHTML = ''; }

  // ── Skala ──
  _buildScale() {
    let lo = Infinity, hi = -Infinity;
    for (const it of this.data.items) { const s = +toDate(it.start, 'start'); const e = +toDate(it.end || it.start, 'end'); if (!isNaN(s)) lo = Math.min(lo, s); if (!isNaN(e)) hi = Math.max(hi, e); }
    if (!isFinite(lo)) { lo = +new Date(1900, 0, 1); hi = +new Date(2000, 0, 1); }
    const padY = Math.max(3, (hi - lo) / YEAR * 0.05);
    this.tLo = lo - padY * YEAR; this.tHi = hi + padY * YEAR;
    const spanY = (this.tHi - this.tLo) / YEAR;
    this.pxPerYear = Math.max(9, 2400 / spanY); this.contentW = spanY * this.pxPerYear;
  }
  xAt(s) { const t = +toDate(s, 'start'); return isNaN(t) ? 0 : ((t - this.tLo) / YEAR) * this.pxPerYear; }
  xEnd(it) { const t = +toDate(it.end || it.start, 'end'); return isNaN(t) ? this.xAt(it.start) : ((t - this.tLo) / YEAR) * this.pxPerYear; }
  yearAtX(wx) { return new Date(this.tLo + (wx / this.pxPerYear) * YEAR).getFullYear(); }
  _clampYear(id, yr) { const it = byId(this.data.items, id); if (!it || !(it.kind === 'person' || it.end)) return yr; return Math.max(this.yearOf(it.start), Math.min(this.yearOf(it.end || it.start), yr)); }

  // ── Layout ──
  // Bringt der Datensatz eigene Zeilen mit (Feld `lane` aus dem alten Tool), werden sie
  // übernommen — sonst geht die dort von Hand gemachte Anordnung verloren. Der Test auf
  // „mehr als ein Wert" ist nötig, weil `makeItem` `lane: 0` vorgibt: bei frisch angelegten
  // Einträgen stünde sonst alles in einer einzigen Zeile.
  _lanesOf(list, eigene) {
    if (eigene) {
      const werte = list.map((i) => i.lane).filter(Number.isFinite);
      if (werte.length === list.length && new Set(werte).size > 1) {
        return { map: Object.fromEntries(list.map((i) => [i.id, i.lane])), count: Math.max(...werte) + 1 };
      }
    }
    return assignLanes(list);
  }

  _initialLayout(eigeneZeilen = true) {
    this._layoutEvents();                 // die Höhen hängen vom Inhalt der Balken ab
    this.pos.clear(); let y = 24;
    const place = (list) => {
      if (!list.length) return;
      const { map, count } = this._lanesOf(list, eigeneZeilen);
      const laneH = new Array(count).fill(0);
      for (const it of list) { const r = map[it.id] || 0; laneH[r] = Math.max(laneH[r], this._h(it.id)); }
      const laneY = []; let yy = y;
      for (let i = 0; i < count; i++) { laneY[i] = yy; yy += laneH[i] + GAP; }
      for (const it of list) this.pos.set(it.id, { cy: laneY[map[it.id] || 0] });
      y = yy + 10;
    };
    place(worldEvents(this.data).filter((e) => !e.hidden));
    this.personBandTop = y;
    place(persons(this.data).filter((p) => !p.hidden));
    this.axisY = y + 8;
  }
  // „Layout zurücksetzen" packt bewusst automatisch neu und ignoriert gespeicherte Zeilen.
  resetLayout() { this._initialLayout(false); this.render(); this.fit(); this.onChange(); }

  // Nächste freie Zeile in einem Band, in der die Spanne [x0,x1] niemanden überdeckt.
  // Damit landen neue Einträge im Band der anderen — nicht dort, wo zufällig der Cursor war.
  _freeRow(bandTop, x0, x1, sameBand) {
    const used = [];
    for (const it of this.data.items) {
      if (it.hidden || it.personId) continue;
      if (!sameBand(it)) continue;
      const p = this.pos.get(it.id); if (!p) continue;
      const a = this.xAt(it.start), b = Math.max(a + MINW, this.xEnd(it));
      used.push({ cy: p.cy, a, b });
    }
    for (let i = 0; i < 40; i++) {
      const cy = bandTop + i * this._laneStep();
      const clash = used.some((u) => Math.abs(u.cy - cy) < this._laneStep() * 0.75 && x0 < u.b + 8 && x1 > u.a - 8);
      if (!clash) return cy;
    }
    return bandTop;
  }

  // Temporäres Ausweichen: wächst ein Balken (neue Zeile, aufgeklappte Details), rücken
  // die Balken, die er sonst überdecken würde, nach unten — aber NUR solange die Ursache
  // besteht. Die gespeicherte Position (`pos`) wird dabei nie angefasst; sobald der Balken
  // wieder schrumpft, ist der Versatz von selbst weg und alles sitzt exakt wie vorher.
  // Nur zeitlich überlappende Balken müssen ausweichen — Zeilen bleiben also gefüllt.
  _pushApart() {
    const prev = this.shift;
    this.shift = new Map();
    const list = this.data.items
      .filter((it) => !it.personId && this._visible(it.id))
      .map((it) => {
        const p = this.pos.get(it.id) || { cy: this.personBandTop };
        const xs = this.xAt(it.start);
        const hasSpan = it.kind === 'person' || it.end;
        const w = hasSpan ? Math.max(MINW, this.xEnd(it) - xs) : MINW;
        return { id: it.id, cy: p.cy, h: this._h(it.id), x0: hasSpan ? xs : xs - w / 2, x1: (hasSpan ? xs : xs - w / 2) + w };
      })
      .sort((a, b) => a.cy - b.cy);
    const placed = [];
    for (const b of list) {
      let y = b.cy;
      for (const q of placed) if (b.x0 < q.x1 + 10 && b.x1 > q.x0 - 10) y = Math.max(y, q.y + q.h + GAP);
      this.shift.set(b.id, y - b.cy);
      placed.push({ ...b, y });
    }
    // Hat sich etwas verschoben, wird die Bewegung kurz animiert (siehe .tl-bars.anim).
    let changed = false;
    for (const [id, v] of this.shift) if (Math.abs(v - (prev.get(id) || 0)) > 0.5) { changed = true; break; }
    if (changed) this._animate();
  }
  _animate() {
    this.gBars.classList.add('anim');
    clearTimeout(this._animT);
    this._animT = setTimeout(() => this.gBars.classList.remove('anim'), 340);
  }

  // ── Geometrie (Weltkoordinaten) ──
  _geom(id) {
    const it = byId(this.data.items, id); if (!it) return null;
    // Kind (Ereignis oder Bereich): liegt IM Balken seines Besitzers und ist so hoch wie dieser.
    // `capY` ist die Grundlinie seiner Beschriftungszeile, `ax` der Andockpunkt an der Unterkante.
    if (it.personId) {
      const host = this._geom(it.personId); if (!host) return null;
      const row = this._evRow.get(id) || 0;
      const x = this.xAt(it.start);
      const w = it.end ? Math.max(1.5, this.xEnd(it) - x) : 0;
      return { type: it.end ? 'span' : 'mark', it, host, row,
               x, y: host.y, w, h: host.trackH, trackH: host.trackH,
               cx: x + w / 2, cy: host.y + host.trackH / 2,
               ax: x + w / 2, ay: host.y + host.trackH,
               capY: host.y + HEAD + row * SLOT + 13 };
    }
    const p = this.pos.get(id) || { cy: this.personBandTop };
    const cy = p.cy + (this.shift.get(id) || 0);
    const h = this._h(id);
    const hasSpan = it.kind === 'person' || (it.kind === 'event' && it.end);
    const xs = this.xAt(it.start);
    const w = hasSpan ? Math.max(MINW, this.xEnd(it) - xs) : MINW;
    const x = hasSpan ? xs : xs - w / 2;
    return { type: 'bar', it, x, y: cy, w, h, trackH: this._trackH(id), cx: x + w / 2, cy: cy + h / 2 };
  }

  // Ereignisse und Bereiche eines Balkens auf Beschriftungszeilen verteilen: was sich zeitlich
  // überlagert, bekommt eine eigene Zeile — davon hängt die Höhe des Balkens ab.
  // Weltmaß → unabhängig von der Zoomstufe stabil.
  _layoutEvents() {
    this._evRow = new Map(); this._kidRows = new Map();
    for (const owner of this.data.items) {
      if (owner.personId) continue;
      const list = this._kids(owner.id).sort((a, b) => this.xAt(a.start) - this.xAt(b.start));
      const rowEnd = [];
      for (const kid of list) {
        const a = this.xAt(kid.start);
        const b = kid.end ? Math.max(a, this.xEnd(kid)) : a;
        let row = rowEnd.findIndex((e) => e < a - 6);
        if (row === -1) { rowEnd.push(b + 6); row = rowEnd.length - 1; } else rowEnd[row] = b + 6;
        this._evRow.set(kid.id, row);
      }
      this._kidRows.set(owner.id, rowEnd.length);
    }
  }

  // ── Render ──
  render() {
    this._layoutEvents();
    if (!this.move && !this.resize) this._pushApart();   // beim Ziehen soll nichts springen
    this.gLabels.innerHTML = ''; this._labels = [];
    this._renderBars();
    this._renderConns();
    this._labels.sort((a, b) => a.rank - b.rank);
    this._applyView();
  }

  _applyView() {
    this._clampView();
    const { tx, ty, k } = this.view;
    this.gWorld.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
    this._renderScale();
    this._placeLabels();
    this._renderEdgeHints();
    this.onView(this.view);
  }

  _clampView() {
    const r = this._rect(); if (!r.width) return;
    this.view.k = Math.min(K_MAX, Math.max(K_MIN, this.view.k));
    const k = this.view.k, W = r.width, H = r.height - AXIS_H;
    const b = this._bounds;
    const mx = Math.min(140, W * 0.35), my = Math.min(120, H * 0.35);
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    this.view.tx = clamp(this.view.tx, mx - b.x1 * k, W - mx - b.x0 * k);
    this.view.ty = clamp(this.view.ty, my - b.y1 * k, H - my - b.y0 * k);
  }

  // Jahresleiste (klebt unten), Raster und Jahrhundert-Bänder — alles in Bildschirmkoordinaten,
  // Schrittweite aus der SICHTBAREN Spanne (nicht aus der Gesamtspanne).
  _renderScale() {
    const r = this._rect(); const W = r.width, H = r.height; if (!W) return;
    const { tx, k } = this.view;
    const gA = this.gAxis, gG = this.gGrid, gB = this.gBands;
    gA.innerHTML = ''; gG.innerHTML = ''; gB.innerHTML = '';
    const top = H - AXIS_H;
    el('rect', { class: 'tl-axisbar', x: 0, y: top, width: W, height: AXIS_H }, gA);
    el('line', { class: 'tl-axisline', x1: 0, y1: top + 0.5, x2: W, y2: top + 0.5 }, gA);

    const y0 = this.yearAtX(-tx / k), y1 = this.yearAtX((W - tx) / k);
    const step = niceStep(Math.max(1, (y1 - y0) / 10));
    if ((y1 - y0) / step > 400) return;
    const first = Math.floor(y0 / step) * step;
    for (let yr = first; yr <= y1 + step; yr += step) {
      const sx = this.xAt(String(yr)) * k + tx;
      const sxN = this.xAt(String(yr + step)) * k + tx;
      if (Math.floor(yr / step) % 2 === 0) el('rect', { class: 'tl-band', x: sx, y: 0, width: Math.max(0, sxN - sx), height: top }, gB);
      if (sx < -40 || sx > W + 40) continue;
      el('line', { class: 'tl-grid', x1: sx, y1: 0, x2: sx, y2: top }, gG);
      el('line', { class: 'tl-tick', x1: sx, y1: top, x2: sx, y2: top + 5 }, gA);
      el('text', { class: 'tl-yr', x: sx, y: top + 20, text: String(yr) }, gA);
    }
  }

  // Auswahl-Umfeld: die Auswahl selbst, ihre eigenen Ereignisse (bzw. ihre Person) und alles,
  // was mit diesem Kern verbunden ist. Nur der Rest tritt zurück.
  _related() {
    const core = new Set(), rel = new Set();
    if (!this.sel.size) return { core, rel };
    for (const id of this.sel) {
      const sel = byId(this.data.items, id); if (!sel) continue;
      core.add(id);
      for (const i of this.data.items) if (i.personId === id) core.add(i.id);
      if (sel.personId) core.add(sel.personId);
    }
    for (const id of core) rel.add(id);
    for (const c of this.data.connections) {
      if (core.has(c.fromId)) rel.add(c.toId);
      if (core.has(c.toId)) rel.add(c.fromId);
    }
    return { core, rel };
  }

  _renderBars() {
    const g = this.gBars; g.innerHTML = '';
    const { core, rel } = this._related();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of this.data.items) {
      if (it.personId) continue;                 // Kinder zeichnet ihr Balken selbst
      if (!this._visible(it.id)) continue;
      const gm = this._geom(it.id); if (!gm) continue;
      const color = getEntryColor(it, this.data) || '#64748b';
      const isSel = this.sel.has(it.id);
      const dim = this.sel.size && !rel.has(it.id);
      const cls = 'tl-item tl-bar' + (isSel ? ' sel' : '') + (dim ? ' dim' : '') + (this.editing === it.id ? ' edit' : '');
      x0 = Math.min(x0, gm.x); x1 = Math.max(x1, gm.x + gm.w);
      y0 = Math.min(y0, gm.y); y1 = Math.max(y1, gm.y + gm.h);

      const grp = el('g', { class: cls, 'data-id': it.id, 'data-kind': it.kind, transform: `translate(${gm.x},${gm.y})` }, g);
      el('rect', { class: 'tl-bar-bg', x: 0, y: 0, width: gm.w, height: gm.h, rx: 7, stroke: color, fill: rgba(color, 0.10) }, grp);
      el('rect', { class: 'tl-bar-accent', x: 0, y: 0, width: 4, height: gm.h, rx: 2, fill: color }, grp);
      this._renderKids(grp, it, gm, color, dim, core);
      // ↕-Griff links: Balken vertikal gegen andere anordnen (Zeit bleibt fix)
      el('rect', { class: 'tl-move', x: -15, y: gm.h / 2 - 9, width: 9, height: 18, rx: 3, fill: color, 'data-move': it.id }, grp);
      if (this.editing === it.id) {   // Enden nur im Bearbeiten-Modus ziehbar
        el('rect', { class: 'tl-resize', x: -5, y: -2, width: 10, height: gm.h + 4, rx: 3, 'data-resize': 'start' }, grp);
        el('rect', { class: 'tl-resize', x: gm.w - 5, y: -2, width: 10, height: gm.h + 4, rx: 3, 'data-resize': 'end' }, grp);
      }
      if (gm.w > 46) {   // Aufklapp-Pfeil rechts im Kopf — links steht der Name
        const open = this.expanded.has(it.id);
        const eg = el('g', { class: 'tl-expand', transform: `translate(${gm.w - 17},7)`, 'data-expand': it.id }, grp);
        el('rect', { x: -3, y: -3, width: 16, height: 16, fill: 'transparent', 'data-expand': it.id }, eg);
        el('path', { d: open ? 'M0,2 L10,2 L5,9 z' : 'M2,0 L9,5 L2,10 z', fill: color, 'data-expand': it.id }, eg);
      }
      if (!dim) {
        this._pushBarLabel(it, gm, isSel || core.has(it.id));
        if (this.expanded.has(it.id)) this._pushBodyLabel(it, gm);
      }
    }
    if (!isFinite(x0)) { x0 = 0; x1 = this.contentW; y0 = 0; y1 = this.axisY; }
    this._bounds = { x0, x1: Math.max(x1, x0 + 1), y0, y1: Math.max(y1 + 30, y0 + 1) };
  }

  // Ereignisse und Bereiche IM Balken (nach der Skizze):
  //   Bereich  = eingefärbte Säule über die volle Balkenhöhe, Ränder als senkrechte Linien
  //   Ereignis = eine senkrechte Linie über die volle Balkenhöhe
  // Beide tragen unten auf der Kante einen Punkt — das ist der Andockpunkt für Verbindungen.
  _renderKids(grp, owner, gm, ownerColor, dim, core) {
    const TH = gm.trackH;
    const kids = this._kids(owner.id);
    if (!kids.length) return;
    const clipId = `clip-${owner.id}`;
    const cp = el('clipPath', { id: clipId }, grp);
    el('rect', { x: 0, y: 0, width: gm.w, height: gm.h, rx: 7 }, cp);
    const kg = el('g', { class: 'tl-kids', 'clip-path': `url(#${clipId})` }, grp);
    for (const kid of kids) {
      const kc = getEntryColor(kid, this.data) || ownerColor;
      const kx = this.xAt(kid.start) - gm.x;
      const kw = kid.end ? Math.max(1.5, this.xEnd(kid) - this.xAt(kid.start)) : 0;
      const sel = this.sel.has(kid.id);
      const kgrp = el('g', { class: 'tl-kid' + (kid.end ? ' span' : ' mark') + (sel ? ' sel' : ''), 'data-id': kid.id }, kg);
      if (kid.end) el('rect', { class: 'tl-kid-fill', x: kx, y: 0, width: kw, height: TH, fill: rgba(kc, 0.3) }, kgrp);
      el('line', { class: 'tl-kid-edge', x1: kx, y1: 0, x2: kx, y2: gm.h, stroke: kc }, kgrp);
      if (kid.end) el('line', { class: 'tl-kid-edge', x1: kx + kw, y1: 0, x2: kx + kw, y2: gm.h, stroke: kc }, kgrp);
      el('circle', { class: 'tl-kid-dot', cx: kx + kw / 2, cy: TH, r: 3, fill: kc }, kgrp);
      // breitere, unsichtbare Trefferfläche — die Linie allein ist zu dünn zum Anfassen
      el('line', { class: 'tl-kid-hit', x1: kx + kw / 2, y1: 0, x2: kx + kw / 2, y2: TH }, kgrp);
      if (sel) {   // Ohren: Bereich schmaler/breiter ziehen — ganz zusammen = Ereignis
        const ey = TH / 2 - 7;
        const ear = (x, side) => el('rect', { class: 'tl-kid-ear', x, y: ey, width: 6, height: 14, rx: 2, 'data-ear': side }, kgrp);
        if (kid.end) { ear(kx - 3, 'start'); ear(kx + kw - 3, 'end'); }
        else { ear(kx - 9, 'start'); ear(kx + 3, 'end'); }
      }
      if (dim) continue;
      const wichtig = sel || core.has(kid.id);
      this._pushLabel({
        kind: 'kid', rank: wichtig ? 1 : 3, minK: wichtig ? 0 : LOD.event,
        text: ellipsize(kid.title || '', F_EV, 170), font: F_EV, cls: 'tl-ev-lbl',
        wx: this.xAt(kid.start) + kw / 2, wy: gm.y + HEAD + (this._evRow.get(kid.id) || 0) * SLOT + 13,
        dx: kid.end ? 0 : 6, dy: 0, anchor: kid.end ? 'middle' : 'start',
      });
    }
  }

  // Balken-Beschriftung: Titel (+ Lebensdaten). Ob sie in den Balken passt, hängt von der
  // Zoomstufe ab und wird deshalb erst in `_placeLabels()` entschieden.
  _pushBarLabel(it, gm, important) {
    const sub = it.kind === 'person' ? `${fmtDate(it.start)} – ${fmtDate(it.end || 'now')}`
                                     : fmtDate(it.start) + (it.end ? ` – ${fmtDate(it.end)}` : '');
    const node = el('text', { class: 'tl-bar-title', text: it.title || '' }, this.gLabels);
    const subNode = el('text', { class: 'tl-bar-sub', text: sub }, this.gLabels);
    this._labels.push({
      kind: 'bar', rank: important ? -1 : (it.kind === 'person' ? 0 : 1), minK: 0,
      node, subNode, text: it.title || '', font: F_TITLE,
      wx: gm.x, wy: gm.y, ww: gm.w, wh: gm.h, important,
    });
  }

  // Aufgeklappter Körper: Beschreibung + Liste der Ereignisse/Bereiche. Der Platz im Balken
  // ist fest (BODY, Weltmaß), die Schrift bleibt konstant groß — es erscheint also so viel,
  // wie beim aktuellen Zoom hineinpasst. Reinzoomen zeigt mehr.
  _pushBodyLabel(it, gm) {
    const nodes = [];
    for (let i = 0; i < 8; i++) nodes.push(el('text', { class: 'tl-body-line' }, this.gLabels));
    this._labels.push({ kind: 'body', rank: 2, nodes, it, wx: gm.x, wy: gm.y + gm.trackH, ww: gm.w, wh: BODY });
  }
  _wrap(text, font, maxW, maxLines) {
    const out = []; let line = '';
    for (const word of String(text).split(/\s+/)) {
      const probe = line ? line + ' ' + word : word;
      if (textWidth(probe, font) <= maxW || !line) { line = probe; continue; }
      out.push(line); line = word;
      if (out.length >= maxLines) return out;
    }
    if (line) out.push(line);
    return out.slice(0, maxLines);
  }

  _pushLabel(spec) {
    spec.node = el('text', { class: spec.cls, text: spec.text }, this.gLabels);
    if (spec.chip) spec.chipNode = el('rect', { class: 'tl-lbl-chip' }, this.gLabels);
    if (spec.chipNode) this.gLabels.insertBefore(spec.chipNode, spec.node);
    spec.w = textWidth(spec.text, spec.font);
    this._labels.push(spec);
  }

  // Alle Beschriftungen in Bildschirmkoordinaten setzen: Sichtbarkeit nach Zoomstufe (LOD),
  // danach Kollisionen auflösen. Baut kein DOM neu auf — nur x/y/display.
  _placeLabels() {
    const r = this._rect(); const W = r.width, H = r.height - AXIS_H; if (!W) return;
    const { tx, ty, k } = this.view;
    const boxes = [];
    const free = (x, y, w, h) => {
      for (const p of boxes) if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) return false;
      return true;
    };
    const hide = (n) => { if (n) n.setAttribute('display', 'none'); };
    const show = (n, x, y, anchor) => { n.removeAttribute('display'); n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('text-anchor', anchor || 'start'); };

    for (const L of this._labels) {
      if (L.kind === 'bar') {
        const sx = L.wx * k + tx, sy = L.wy * k + ty, bw = L.ww * k, bh = L.wh * k;
        if (sx > W || sx + bw < -200 || sy > H || sy + bh < 0) { hide(L.node); hide(L.subNode); continue; }
        const tw = textWidth(L.text, F_TITLE);
        const inside = bh >= 13 && tw + 20 <= bw;
        const roomy = bh >= 30;                       // Platz für eine zweite Zeile?
        // Läuft der Balken links aus dem Bild, wandert die Beschriftung mit dem Bildrand
        // mit (bleibt aber im Balken) — sonst verliert man beim Pannen die Namen.
        let x = inside ? Math.min(Math.max(sx + 10, 8), Math.max(sx + 10, sx + bw - tw - 8)) : sx + bw + 7;
        let y = inside && roomy ? sy + 14 : sy + bh / 2 + 4.5;
        let box = { x: x - 2, y: y - 11, w: tw + 4, h: 14 };
        if (!inside) {
          // Außenstehende Titel weichen ein paar Zeilen nach unten aus. Klappt das nicht,
          // treten sie zurück statt sich zu überlagern — beim Reinzoomen sind sie wieder da.
          for (let i = 0; i < 3 && !free(box.x, box.y, box.w, box.h); i++) { y += 13; box = { x: box.x, y: y - 11, w: box.w, h: 14 }; }
          if (!L.important && !free(box.x, box.y, box.w, box.h)) { hide(L.node); hide(L.subNode); continue; }
        }
        show(L.node, x, y, 'start'); boxes.push(box);
        const wantSub = k >= LOD.sub && inside && roomy;
        if (wantSub) { show(L.subNode, x, sy + 26, 'start'); boxes.push({ x: x - 2, y: sy + 17, w: textWidth(L.subNode.textContent, F_SUB) + 4, h: 12 }); }
        else hide(L.subNode);
        continue;
      }
      if (L.kind === 'body') {
        const sx = L.wx * k + tx, sy = L.wy * k + ty;
        const availH = L.wh * k, availW = L.ww * k - 26;
        let i = 0;
        const put = (txt, cls) => {
          const yy = sy + 13 + i * 14;
          if (i >= L.nodes.length || yy > sy + availH - 3 || availW < 70 || sy > H || sy + availH < 0) return false;
          const n = L.nodes[i]; n.setAttribute('class', cls);
          n.textContent = ellipsize(txt, F_SUB, availW);
          show(n, sx + 13, yy, 'start');
          boxes.push({ x: sx + 11, y: yy - 10, w: textWidth(n.textContent, F_SUB) + 4, h: 13 });
          i++; return true;
        };
        const desc = (L.it.description || '').trim();
        for (const line of this._wrap(desc || '— noch keine Beschreibung —', F_SUB, availW, 3)) {
          if (!put(line, desc ? 'tl-body-line' : 'tl-body-leer')) break;
        }
        for (const kid of this._kids(L.it.id)) {
          const t = `${fmtDate(kid.start)}${kid.end ? ' – ' + fmtDate(kid.end) : ''}  ·  ${kid.title}`;
          if (!put(t, 'tl-body-item')) break;
        }
        for (; i < L.nodes.length; i++) hide(L.nodes[i]);
        continue;
      }
      if (k < L.minK) { hide(L.node); hide(L.chipNode); continue; }
      const sx = L.wx * k + tx + (L.dx || 0), sy = L.wy * k + ty + (L.dy || 0);
      const w = L.w, h = 13;
      const bx = L.anchor === 'middle' ? sx - w / 2 : sx;
      if (sx < -60 || sx > W + 60 || sy < -20 || sy > H + 20) { hide(L.node); hide(L.chipNode); continue; }
      if (!free(bx - 2, sy - 10, w + 4, h)) { hide(L.node); hide(L.chipNode); continue; }
      show(L.node, sx, sy, L.anchor);
      if (L.chipNode) { L.chipNode.removeAttribute('display'); L.chipNode.setAttribute('x', bx - 3); L.chipNode.setAttribute('y', sy - 10); L.chipNode.setAttribute('width', w + 6); L.chipNode.setAttribute('height', h); L.chipNode.setAttribute('rx', 3); }
      boxes.push({ x: bx - 2, y: sy - 10, w: w + 4, h });
    }
  }

  // Randhinweise: was liegt links/rechts außerhalb des Bildes?
  _renderEdgeHints() {
    const g = this.gEdge; g.innerHTML = '';
    const r = this._rect(); const W = r.width, H = r.height - AXIS_H; if (!W) return;
    const { tx, k } = this.view;
    const left = [], right = [];
    for (const it of this.data.items) {
      if (it.personId || !this._visible(it.id)) continue;
      const gm = this._geom(it.id); if (!gm) continue;
      const a = gm.x * k + tx, b = (gm.x + gm.w) * k + tx;
      if (b < 0) left.push(it); else if (a > W) right.push(it);
    }
    const chip = (side, list) => {
      if (!list.length) return;
      const yrs = list.map((i) => this.yearOf(i.start)).sort((a, b) => a - b);
      const label = `${side === 'l' ? '←' : ''} ${list.length} weitere · ${yrs[0]}–${yrs[yrs.length - 1]} ${side === 'r' ? '→' : ''}`.trim();
      const w = textWidth(label, F_SUB) + 18;
      const x = side === 'l' ? 10 : W - 10 - w, y = 12;
      const grp = el('g', { class: 'tl-edge-chip', 'data-side': side }, g);
      el('rect', { x, y, width: w, height: 22, rx: 11 }, grp);
      el('text', { x: x + w / 2, y: y + 15, 'text-anchor': 'middle', text: label }, grp);
      grp.addEventListener('click', () => {
        const target = side === 'l' ? list.reduce((m, i) => (this.xAt(i.start) > this.xAt(m.start) ? i : m))
                                    : list.reduce((m, i) => (this.xAt(i.start) < this.xAt(m.start) ? i : m));
        this.focusItem(target.id);
      });
    };
    chip('l', left); chip('r', right);
  }

  // Anker eines Endes an einem Datum, an der Kante Richtung `towardY`.
  _anchor(id, dateStr, towardY) {
    // Gilt für Balken wie für Kinder: X = das Datum, auf die eigene Ausdehnung begrenzt;
    // Y = Ober- oder Unterkante des Balkens, je nach Richtung. Bei Kindern ist das genau
    // der Punkt auf der Kante, den die Skizze zeigt.
    const gm = this._geom(id); if (!gm) return null;
    const x = Math.max(gm.x, Math.min(gm.x + gm.w, this.xAt(dateStr)));
    const y = towardY >= gm.cy ? gm.y + (gm.trackH || gm.h) : gm.y;
    return { x, y };
  }

  _renderConns() {
    const g = this.gConns; g.innerHTML = ''; if (!this.showConns) return;
    const { core } = this._related();
    for (const c of this.data.connections) {
      if (!this._visible(c.fromId) || !this._visible(c.toId)) continue;
      const gf = this._geom(c.fromId), gt = this._geom(c.toId); if (!gf || !gt) continue;
      const aktiv = this.selConn === c.id;
      const hi = aktiv || (this.sel.size && (core.has(c.fromId) || core.has(c.toId)));
      const dim = !aktiv && this.sel.size && !hi;
      const dated = c.type === 'aktion' || c.fromDate || c.toDate || c.date;
      let d, land = null;
      if (dated) {
        const fromD = c.fromDate || byId(this.data.items, c.fromId).start;
        const toD = c.toDate || c.date || byId(this.data.items, c.toId).start;
        const a = this._anchor(c.fromId, fromD, gt.cy);
        const b = this._anchor(c.toId, toD, gf.cy);
        d = `M${a.x},${a.y} L${b.x},${b.y}`; land = b;
      } else {   // diffuse Beziehung: Mitte zu Mitte, gebogen
        const a = { x: gf.cx, y: gf.cy }, b = { x: gt.cx, y: gt.cy }; const my = (a.y + b.y) / 2;
        d = `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
      }
      el('path', { class: 'tl-conn ' + (dated ? 'aktion' : 'relation') + (hi ? ' hi' : '') + (dim ? ' dim' : '') + (aktiv ? ' sel' : ''), d, 'marker-end': `url(#${dated ? (hi ? 'inf-hi' : 'inf') : 'rel'})` }, g);
      // Unsichtbare, dicke Trefferfläche über der Linie — die dünne Linie selbst ist
      // bei jedem Zoom zu schmal, um sie verlässlich anzuklicken.
      el('path', { class: 'tl-conn-hit', d, 'data-conn': c.id }, g);
      if (land) el('circle', { class: 'tl-land' + (hi ? ' hi' : '') + (dim ? ' dim' : ''), cx: land.x, cy: land.y, r: 3.5 }, g);
      const lbl = c.label || (c.relation && c.relation !== 'verbunden' ? c.relation : '');
      if (lbl && !dim) {
        this._pushLabel({
          kind: 'conn', rank: hi ? 2 : 4, minK: hi ? 0 : LOD.conn,
          text: ellipsize(lbl, F_CONN, 160), font: F_CONN, cls: 'tl-conn-lbl', chip: true,
          wx: dated ? this._midX(c) : (gf.cx + gt.cx) / 2, wy: (gf.cy + gt.cy) / 2, dx: 0, dy: -4, anchor: 'middle',
        });
      }
    }
  }
  _midX(c) { const a = this.xAt(c.fromDate || byId(this.data.items, c.fromId).start); const b = this.xAt(c.toDate || c.date || byId(this.data.items, c.toId).start); return (a + b) / 2; }

  // ── Interaktion ──
  _bindEvents() {
    this.svg.addEventListener('pointerdown', (e) => this._onDown(e));
    this.svg.addEventListener('pointermove', (e) => this._onMove(e));
    this.svg.addEventListener('pointerup', (e) => this._onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this._onUp(e));
    this.svg.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }
  _s2w(e) { const r = this._rect(); return { x: (e.clientX - r.left - this.view.tx) / this.view.k, y: (e.clientY - r.top - this.view.ty) / this.view.k }; }

  _onDown(e) {
    this._userTouched = true;
    const expand = e.target.getAttribute && e.target.getAttribute('data-expand');
    if (expand) { e.preventDefault(); this.toggleExpand(expand); return; }
    const conn = e.target.getAttribute && e.target.getAttribute('data-conn');
    if (conn) { e.preventDefault(); this.selectConn(conn); return; }
    const resize = e.target.getAttribute && e.target.getAttribute('data-resize');
    const move = e.target.getAttribute && e.target.getAttribute('data-move');
    const kidG = e.target.closest && e.target.closest('.tl-kid');
    const barG = e.target.closest && e.target.closest('.tl-bar');
    if (resize && barG) { e.preventDefault(); this.resize = { id: barG.getAttribute('data-id'), edge: resize }; try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    else if (move) { e.preventDefault(); const w = this._s2w(e); const p = this.pos.get(move); this.move = { id: move, dy: w.y - p.cy }; try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    else if (kidG) {   // Ereignis/Bereich: nahe am Rand = Spanne ändern, sonst verschieben
      e.preventDefault();
      const id = kidG.getAttribute('data-id');
      const kid = byId(this.data.items, id); const gm = this._geom(id); const w = this._s2w(e);
      const ear = e.target.getAttribute && e.target.getAttribute('data-ear');
      let zone = ear || 'move';
      if (!ear && kid && kid.end) {
        const k = this.view.k;
        if ((w.x - gm.x) * k < 7) zone = 'start';
        else if ((gm.x + gm.w - w.x) * k < 7) zone = 'end';
      }
      this.kid = { id, zone, moved: false, sx: e.clientX, sy: e.clientY,
                   grabYear: this.yearAtX(w.x), start0: kid.start, end0: kid.end };
      try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    else if (barG) {   // Ziehen auf dem Balken = Verbindung; Startpunkt = Datum unter Cursor
      e.preventDefault(); const id = barG.getAttribute('data-id'); const w = this._s2w(e);
      const fromDate = String(this._clampYear(id, this.yearAtX(w.x)));
      this.pending = { fromId: id, fromDate, moved: false, sx: e.clientX, sy: e.clientY };
      try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else { this.pan = { x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false }; try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  }

  _onMove(e) {
    if (this.resize) {
      const w = this._s2w(e); const it = byId(this.data.items, this.resize.id); const yr = this.yearAtX(w.x);
      const sY = this.yearOf(it.start), eY = this.yearOf(it.end || it.start);
      if (this.resize.edge === 'start') it.start = String(Math.min(yr, eY - 1)); else it.end = String(Math.max(yr, sY + 1));
      this.render(); return;
    }
    if (this.move) { const w = this._s2w(e); const p = this.pos.get(this.move.id); p.cy = w.y - this.move.dy; this.render(); return; }
    if (this.pending) {
      if (!this.pending.moved && Math.hypot(e.clientX - this.pending.sx, e.clientY - this.pending.sy) < 4) return;
      const w = this._s2w(e); this.pending.moved = true;
      const a = this._anchor(this.pending.fromId, this.pending.fromDate, w.y);
      this.pendingLine.setAttribute('d', `M${a.x},${a.y} L${w.x},${w.y}`);
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const bar = over && over.closest && over.closest('.tl-bar');
      const r = this._rect();
      if (bar && bar.getAttribute('data-id') !== this.pending.fromId) {
        const tid = bar.getAttribute('data-id'); const gm = this._geom(tid);
        const x = Math.max(gm.x, Math.min(gm.x + gm.w, w.x));
        this.pendingDot.setAttribute('cx', x); this.pendingDot.setAttribute('cy', w.y >= gm.cy ? gm.y + gm.h : gm.y); this.pendingDot.setAttribute('opacity', 1);
        this._showReadout(e.clientX - r.left, e.clientY - r.top,
          `${this.pending.fromDate} → ${this._clampYear(tid, this.yearAtX(w.x))}`);
      } else {
        this.pendingDot.setAttribute('opacity', 0);
        this._showReadout(e.clientX - r.left, e.clientY - r.top, `ab ${this.pending.fromDate}`);
      }
      return;
    }
    if (this.kid) {
      if (!this.kid.moved && Math.hypot(e.clientX - this.kid.sx, e.clientY - this.kid.sy) < 3) return;
      this.kid.moved = true;
      const kid = byId(this.data.items, this.kid.id); if (!kid) return;
      const yr = this.yearAtX(this._s2w(e).x);
      if (this.kid.zone === 'move') {
        const d = yr - this.kid.grabYear;
        kid.start = String(this.yearOf(this.kid.start0) + d);
        kid.end = this.kid.end0 ? String(this.yearOf(this.kid.end0) + d) : null;
      } else {
        // Der gegenüberliegende Rand bleibt stehen; der gezogene kann ihn nicht überholen.
        // Schiebt man ganz auf ihn zusammen, wird aus dem Bereich ein EREIGNIS —
        // zieht man wieder auseinander, entsteht daraus wieder ein Bereich.
        const fixed = this.yearOf(this.kid.zone === 'start' ? (this.kid.end0 || this.kid.start0) : this.kid.start0);
        const gezogen = this.kid.zone === 'start' ? Math.min(fixed, yr) : Math.max(fixed, yr);
        const lo = Math.min(fixed, gezogen), hi = Math.max(fixed, gezogen);
        if (hi - lo < 1) { kid.start = String(fixed); kid.end = null; }
        else { kid.start = String(lo); kid.end = String(hi); }
      }
      this.render(); return;
    }
    if (this.pan) { this.view.tx = this.pan.tx + (e.clientX - this.pan.x); this.view.ty = this.pan.ty + (e.clientY - this.pan.y); if (Math.abs(e.clientX - this.pan.x) + Math.abs(e.clientY - this.pan.y) > 3) this.pan.moved = true; this._applyView(); }
  }

  _onUp(e) {
    if (this.resize) { const id = this.resize.id; this.resize = null; this.onChange(); if (this.selected === id) this.onSelect(byId(this.data.items, id)); return; }
    if (this.move) { this.move = null; this.onChange(); return; }
    if (this.pending) {
      if (!this.pending.moved) { this._click(e, this.pending.fromId); }
      else {
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const tbar = over && over.closest && over.closest('.tl-bar');
        const tev = over && over.closest && over.closest('.tl-kid');
        if (tbar && tbar.getAttribute('data-id') !== this.pending.fromId) {
          const tid = tbar.getAttribute('data-id'); const w = this._s2w(e);
          const toDate = String(this._clampYear(tid, this.yearAtX(w.x)));
          this._addConn(this.pending.fromId, tid, this.pending.fromDate, toDate);
        } else if (tev) { const tid = tev.getAttribute('data-id'); this._addConn(this.pending.fromId, tid, this.pending.fromDate, byId(this.data.items, tid).start); }
      }
      this.pending = null; this.pendingLine.setAttribute('d', ''); this.pendingDot.setAttribute('opacity', 0);
      this._hideReadout(); this.render(); return;
    }
    if (this.kid) {
      const id = this.kid.id, moved = this.kid.moved; this.kid = null;
      const ev = byId(this.data.items, id);
      if (!moved) { this._click(e, id); return; }
      // Auf einem anderen Balken losgelassen? → dorthin umhängen.
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const bar = over && over.closest && over.closest('.tl-bar');
      const t = bar && bar.getAttribute('data-id');
      if (ev && t && t !== id && t !== ev.personId && !byId(this.data.items, t).personId) ev.personId = t;
      this.onChange(); this._select(id); return;
    }
    if (this.pan) { if (!this.pan.moved) this._click(e, null); this.pan = null; }
  }

  _onWheel(e) {
    e.preventDefault(); this._userTouched = true;
    if (e.ctrlKey) { const r = this._rect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; this._zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015)); return; }
    this.view.tx -= e.deltaX; this.view.ty -= e.deltaY;
    this._applyView();
  }

  _zoomAt(sx, sy, factor) {
    const wx = (sx - this.view.tx) / this.view.k, wy = (sy - this.view.ty) / this.view.k;
    const k = Math.min(K_MAX, Math.max(K_MIN, this.view.k * factor));
    this.view.k = k; this.view.tx = sx - wx * k; this.view.ty = sy - wy * k;
    this._applyView();
  }

  // Klick und Doppelklick werden selbst erkannt: der native `dblclick` geht verloren, sobald
  // die Zeiger-Erfassung läuft und der erste Klick das SVG neu aufbaut.
  _click(e, id) {
    const now = performance.now(); const last = this._lastClick;
    const doppelt = last && now - last.t < 380 && last.id === id
                    && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6;
    this._lastClick = doppelt ? null : { t: now, x: e.clientX, y: e.clientY, id };
    if (doppelt) this._doubleClick(e, id); else this._select(id, e.shiftKey || e.metaKey || e.ctrlKey);
  }

  _doubleClick(e, id) {
    this._userTouched = true;
    const w = this._s2w(e); const yr = this.yearAtX(w.x);
    if (id) {
      const it = byId(this.data.items, id);
      if (!it || it.personId) return;          // auf einem Ereignis/Bereich: nichts
      this.addRange(id, yr); return;           // IN einer Person: neuer Bereich
    }
    // leere Fläche = neue Person (Klick = Lebensmitte, 60 J.), im Bearbeiten-Modus.
    this.addPerson({ start: String(yr - 30), end: String(yr + 30), geraten: true, fokus: false });
  }

  // Neue Person anlegen. `geraten` heißt: die Spanne stammt aus der Klickposition, nicht
  // aus einer Angabe — dann startet der Balken im Bearbeiten-Modus, damit man die Enden
  // gleich ziehen kann. Kommen die Daten aus der Schnellerfassung, stimmen sie bereits.
  // Die Zeile kommt immer aus dem Personen-Band, nicht von der Cursor-Höhe.
  addPerson({ title, start, end, geraten = false, fokus = true } = {}) {
    const r = this._rect();
    const mitte = r.width ? this.yearAtX((r.width / 2 - this.view.tx) / this.view.k) : this.yearAtX(this.contentW / 2);
    const s = start || String(mitte - 30);
    const p = makeItem({ kind: 'person', title: title || 'Neue Person', start: s, end: end || null,
                         categoryId: this.data.categories[0]?.id || null });
    this.data.items.push(p);
    // Eine Person außerhalb der bisherigen Spanne (500–2022) verschiebt die Skala —
    // sonst läge sie außerhalb der Leinwand.
    this._buildScale();
    const cy = this._freeRow(this.personBandTop, this.xAt(p.start), this.xEnd(p), (i) => i.kind === 'person');
    this.pos.set(p.id, { cy });
    this.sel = new Set([p.id]); this.selected = p.id; this.selConn = null;
    this.editing = geraten ? p.id : null;
    this.justCreated = p.id;
    this.render();
    if (fokus) this.focusItem(p.id);
    this.onSelect(p); this.onChange();
    return p;
  }

  // Klick ersetzt die Auswahl, Shift-/Cmd-Klick nimmt hinzu bzw. wieder heraus.
  _select(id, additive = false) {
    this.selConn = null;
    if (additive && id) {
      if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
      this.selected = this.sel.has(id) ? id : ([...this.sel].pop() || null);
    } else {
      this.sel = new Set(id ? [id] : []);
      this.selected = id;
    }
    if (this.selected !== this.editing) this.editing = null;
    this.render();
    this.onSelect(this.selected ? byId(this.data.items, this.selected) : null);
  }
  hideSelected() {
    const ids = [...this.sel]; if (!ids.length) return;
    for (const id of ids) { const it = byId(this.data.items, id); if (it) it.hidden = true; }
    this.sel.clear(); this.selected = null; this.editing = null;
    this.render(); this.onSelect(null); this.onChange();
  }
  toggleExpand(id) {
    if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
    this._animate(); this.render(); this.onChange();
  }

  _addConn(fromId, toId, fromDate, toDate) {
    const doppelt = this.data.connections.find((c) => c.fromId === fromId && c.toId === toId
      && c.fromDate === fromDate && (c.toDate || c.date) === toDate);
    if (doppelt) { this.selectConn(doppelt.id); return doppelt; }
    const c = makeConnection({ fromId, toId, type: 'aktion', date: toDate, relation: '' }); c.fromDate = fromDate; c.toDate = toDate;
    this.data.connections.push(c); this.onChange();
    // Frisch gezogen heißt: noch namenlos. Sofort auswählen und zum Benennen vorlegen —
    // und die Ausgangsperson ausgewählt lassen, damit das Panel die neue Beziehung zeigt.
    // Nicht über _select(), das würde die Verbindungsauswahl gleich wieder löschen.
    this.sel = new Set([fromId]); this.selected = fromId; this.editing = null;
    this.selConn = c.id; this.render();
    this.onSelect(byId(this.data.items, fromId));
    this.onConn(c, this.connScreenPos(c.id));
    return c;
  }

  // Mittelpunkt einer Verbindung in Bildschirmkoordinaten (relativ zur Bühne) —
  // damit der Aufrufer sein Benennen-Feld an die richtige Stelle setzen kann.
  connScreenPos(cid) {
    const c = byId(this.data.connections, cid); if (!c) return null;
    const gf = this._geom(c.fromId), gt = this._geom(c.toId); if (!gf || !gt) return null;
    const { tx, ty, k } = this.view;
    const dated = c.type === 'aktion' || c.fromDate || c.toDate || c.date;
    const wx = dated ? this._midX(c) : (gf.cx + gt.cx) / 2;
    return { x: wx * k + tx, y: ((gf.cy + gt.cy) / 2) * k + ty };
  }

  // Verbindung auswählen (Klick auf die Linie oder direkt nach dem Ziehen).
  selectConn(cid) {
    const c = byId(this.data.connections, cid);
    this.selConn = c ? c.id : null;
    // Die Ausgangsperson mit auswählen: das Panel zeigt dann den Zusammenhang, aus dem
    // die Linie kommt, und hebt sie in der Beziehungsliste hervor.
    const von = c ? byId(this.data.items, c.fromId) : null;
    this.sel = new Set(von ? [von.id] : []); this.selected = von ? von.id : null; this.editing = null;
    this.render();
    this.onSelect(von);
    if (c) this.onConn(c, this.connScreenPos(c.id));
  }

  // Verbindung aus dem Panel heraus anlegen: kein Zielen auf der Leinwand nötig,
  // beide Enden müssen nicht gleichzeitig im Bild sein.
  connectTo(fromId, toId) {
    const a = byId(this.data.items, fromId), b = byId(this.data.items, toId);
    if (!a || !b || a.id === b.id) return null;
    // Vorbelegung: wo sich beide Spannen überschneiden, sonst der spätere Anfang.
    const aS = this.yearOf(a.start), aE = this.yearOf(a.end || a.start);
    const bS = this.yearOf(b.start), bE = this.yearOf(b.end || b.start);
    const lo = Math.max(aS, bS), hi = Math.min(aE, bE);
    const jahr = lo <= hi ? Math.round((lo + hi) / 2) : Math.max(aS, bS);
    return this._addConn(fromId, toId, String(this._clampYear(fromId, jahr)), String(this._clampYear(toId, jahr)));
  }

  deleteConn(cid) {
    this.data.connections = this.data.connections.filter((c) => c.id !== cid);
    if (this.selConn === cid) this.selConn = null;
    this.render(); this.onChange();
  }

  // öffentliche Helfer (vom Panel / von der Tastatur genutzt)
  // Neuer Bereich in einem Balken. Breite: ein kleiner Anteil der Lebensspanne, damit man
  // sofort etwas zu fassen hat; Zusammenschieben macht daraus ein Ereignis.
  addRange(ownerId, year) {
    const owner = byId(this.data.items, ownerId); if (!owner || owner.personId) return;
    const yr = this._clampYear(ownerId, year);
    const life = Math.abs(this.yearOf(owner.end || owner.start) - this.yearOf(owner.start));
    const span = Math.max(2, Math.round(life * 0.06));
    const ev = makeItem({ kind: 'event', title: 'Neuer Bereich', start: String(yr), end: String(yr + span),
                          personId: ownerId, categoryId: owner.categoryId });
    this.data.items.push(ev); this.justCreated = ev.id;
    this.selected = ev.id; this.render(); this.onSelect(ev); this.onChange();
  }
  addEvent(ownerId) { const o = byId(this.data.items, ownerId); const mid = Math.round((this.yearOf(o.start) + this.yearOf(o.end || o.start)) / 2); const ev = makeItem({ kind: 'event', title: 'Neues Ereignis', start: String(mid), personId: ownerId, categoryId: o.categoryId }); this.data.items.push(ev); this.justCreated = ev.id; this.render(); this._select(ev.id); this.onChange(); }
  // Welt-Ereignis (ohne Person) in der Mitte der aktuellen Ansicht anlegen, als Balken (Standard-Spanne)
  addWorldEvent() {
    const r = this._rect(); const yr = this.yearAtX((r.width / 2 - this.view.tx) / this.view.k);
    const ev = makeItem({ kind: 'event', title: 'Neues Welt-Ereignis', start: String(yr), end: String(yr + 5), categoryId: this.data.categories[0]?.id || null });
    const cy = this._freeRow(24, this.xAt(ev.start), this.xEnd(ev), (i) => i.kind === 'event');
    this.data.items.push(ev); this.pos.set(ev.id, { cy });
    this.selected = ev.id; this.editing = ev.id; this.justCreated = ev.id;
    this.render(); this.onSelect(ev); this.onChange();
  }
  // Datum eines Eintrags ändern. Zwei Dinge hängen daran: die Gesamtspanne (eine Person
  // von 1629 in einem Datensatz ab 1775 verschiebt die Skala) und die Ansicht — sonst
  // wandert der Balken beim Tippen aus dem Bild und der Eintrag ist weg.
  setDate(id, feld, wert) {
    const it = byId(this.data.items, id); if (!it) return;
    it[feld] = wert;
    const lo = this.tLo, hi = this.tHi;
    this._buildScale();
    this.render();
    if (this.tLo !== lo || this.tHi !== hi) this._applyView();
    this.ensureVisible(id);
  }

  editLifespan(id) { this.editing = id; this.selected = id; this.render(); this.onSelect(byId(this.data.items, id)); }
  confirmLifespan() { this.editing = null; this.render(); if (this.selected) this.onSelect(byId(this.data.items, this.selected)); }
  restore(id) { const it = byId(this.data.items, id); if (it) it.hidden = false; this._initialLayout(); this.render(); this.onChange(); }
  hiddenPersons() { return this.data.items.filter((i) => i.hidden); }
  refresh() { this.render(); }
  setShowConns(v) { this.showConns = v; this.render(); }
  takeJustCreated() { const id = this.justCreated; this.justCreated = null; return id; }

  zoomBy(factor) { const r = this._rect(); this._userTouched = true; this._zoomAt(r.width / 2, (r.height - AXIS_H) / 2, factor); }
  panBy(dx, dy) { this._userTouched = true; this.view.tx += dx; this.view.ty += dy; this._applyView(); }
  escape() {
    if (this.editing) this.confirmLifespan();
    else if (this.selConn) { this.selConn = null; this.render(); }
    else if (this.sel.size) this._select(null);
  }

  focusItem(id) {
    const gm = this._geom(id); if (!gm) return;
    const r = this._rect(); if (!r.width) return;
    this._userTouched = true;
    const k = Math.max(this.view.k, 0.8);
    this.view.k = k;
    this.view.tx = r.width / 2 - (gm.cx != null ? gm.cx : gm.x) * k;
    this.view.ty = (r.height - AXIS_H) / 2 - (gm.cy != null ? gm.cy : gm.y) * k;
    this._applyView();
  }

  // Nachziehen statt wegspringen lassen: tippt man in ein Datumsfeld, wandert der Balken
  // oft weit aus dem Bild — dann wäre der gerade angelegte Eintrag verschwunden. Liegt er
  // noch (großzügig) im Bild, bleibt die Ansicht in Ruhe stehen.
  ensureVisible(id) {
    const gm = this._geom(id); if (!gm) return;
    const r = this._rect(); if (!r.width) return;
    const { tx, ty, k } = this.view;
    const W = r.width, H = r.height - AXIS_H;
    const x0 = gm.x * k + tx, x1 = (gm.x + gm.w) * k + tx;
    const y0 = gm.y * k + ty, y1 = (gm.y + gm.h) * k + ty;
    const rand = 24;
    const drin = x1 > rand && x0 < W - rand && y1 > rand && y0 < H - rand;
    if (drin) return;
    this.focusItem(id);
  }
  focusSelected() { if (this.selected) this.focusItem(this.selected); else this.fit(); }

  // Einpassen — aber nie unter die Lesbarkeitsgrenze. Passt dann nicht alles ins Bild,
  // sagen die Randhinweise, was links/rechts noch liegt.
  fit() {
    // Hat die Bühne noch keine Größe (Seite frisch geladen, Fenster verdeckt), lässt sich
    // nichts einpassen. Dann wird es vorgemerkt und nachgeholt, sobald eine Größe da ist —
    // sonst bliebe die Ansicht stumm dort stehen, wo sie gerade war.
    const r = this._rect();
    if (!r.width) { this._fitPending = true; return; }
    this._fitPending = false;
    this._userTouched = false;
    const b = this._bounds; const W = r.width, H = r.height - AXIS_H;
    const pad = 46;
    const kk = Math.min(1.4, Math.min((W - 2 * pad) / (b.x1 - b.x0), (H - 2 * pad) / (b.y1 - b.y0)));
    const k = Math.max(K_FIT_MIN, Math.min(K_MAX, kk));
    this.view.k = k;
    // Greift die Lesbarkeitsgrenze, passt eben NICHT alles ins Bild — dann ist die
    // geometrische Mitte die falsche Wahl (bei einer Spanne von 500 bis 2022 landet man
    // im leeren Mittelalter). Stattdessen dorthin, wo die meisten Einträge liegen.
    let zx = (b.x0 + b.x1) / 2, zy = (b.y0 + b.y1) / 2;
    if (kk < K_FIT_MIN) {
      const xs = [], ys = [];
      for (const it of this.data.items) {
        if (it.personId || !this._visible(it.id)) continue;
        const gm = this._geom(it.id); if (!gm) continue;
        xs.push(gm.cx); ys.push(gm.cy);
      }
      if (xs.length) {
        xs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
        zx = xs[Math.floor(xs.length / 2)]; zy = ys[Math.floor(ys.length / 2)];
      }
    }
    this.view.tx = W / 2 - zx * k;
    this.view.ty = H / 2 - zy * k;
    this._applyView();
  }
}
