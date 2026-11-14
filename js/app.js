// app.js — Bootstrap (Balken + gerichtete datierte Verbindungen)
//
// Leitgedanke der Bedienung: Beim Lesen hat man einen Namen, zwei Jahreszahlen und eine
// Beziehung im Kopf — aber keine Position und keine Zoomstufe. Deshalb nimmt die App
// Eingaben auch dort entgegen, wo keine Geometrie im Spiel ist: Schnellerfassung (N),
// Suche mit Sprung (⌘F), Beziehung aus dem Panel heraus. Die Leinwand bleibt die
// Abkürzung für alle, die den Ort ohnehin schon kennen.
import { seedData, byId, catName, fmtDate, getEntryColor, COUNTRIES } from './model.js';
import { LocalStorageStore, exportJson, importJson, normalize } from './store.js';
import { TimelineCanvas } from './timeline-canvas.js';
import { History } from './history.js';
import { parseDatum, parseZeile } from './parse.js';

const store = new LocalStorageStore('zeitleiste-proto-data-v1');
const LAYOUT_KEY = 'zeitleiste-proto-layout-v1';
const VIEW_KEY = 'zeitleiste-proto-view-v1';
const OPEN_KEY = 'zeitleiste-proto-open-v1';
const HINT_KEY = 'zeitleiste-proto-hint-weg-v1';

let data = await store.load();
if (!data || !Array.isArray(data.items)) { data = seedData(); await store.save(data); }
let savedLayout = null, savedView = null;
try { savedLayout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch { savedLayout = null; }
try { savedView = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch { savedView = null; }
let savedOpen = [];
try { savedOpen = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { savedOpen = []; }

const stage = document.getElementById('stage');
const info = document.getElementById('info');
const btnHidden = document.getElementById('btn-hidden');
const zoomVal = document.getElementById('zoom-val');
// Früh deklariert: onView() läuft schon aus dem Konstruktor der Leinwand heraus und
// rührt über platziereConnEditor() an diese beiden.
const cedit = document.getElementById('cedit');
let connId = null;
let viewTimer = null;   // vor dem Konstruktor: onView() läuft bereits aus ihm heraus

const tl = new TimelineCanvas(stage, data, {
  onSelect: renderInfo, onChange, onView, onConn: openConnEditor,
  initialLayout: savedLayout, initialView: savedView,
});
tl.expanded = new Set(savedOpen);
tl.render();
window.__tl = tl;

function save() {
  store.save(tl.data);
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify([...tl.pos]));
    localStorage.setItem(OPEN_KEY, JSON.stringify([...tl.expanded]));
  } catch { /* ignore */ }
}

// ── Verlauf ───────────────────────────────────────────────────────────────
// Ein Schnappschuss = Daten + Anordnung. `key` fasst gleichartige Änderungen kurz
// hintereinander zu EINEM Schritt zusammen (Tippen im Namensfeld, ein Ziehvorgang).
const snapshot = () => ({ data: tl.data, pos: [...tl.pos] });
const history = new History(snapshot());
let recKey = null, recTimer = null;
function record(key) {
  if (key && key === recKey) history.touch(snapshot());
  else history.record(snapshot());
  recKey = key || null;
  clearTimeout(recTimer);
  recTimer = setTimeout(() => { recKey = null; }, 500);
}
function applyState(st) {
  if (!st) return;
  closeConnEditor();                                   // die Verbindung darin kann es nicht mehr geben
  for (const k of Object.keys(data)) delete data[k];   // Objekt-Identität erhalten
  Object.assign(data, st.data);
  tl.pos = new Map(st.pos);
  tl.sel = new Set(); tl.selected = null; tl.editing = null; tl.selConn = null;
  const lo = tl.tLo, hi = tl.tHi;
  tl._buildScale();                       // ein rückgängig gemachter Import ändert die Spanne
  tl.render();
  if (tl.tLo !== lo || tl.tHi !== hi) tl.fit();
  renderInfo(null); save(); updateHidden();
}

// Einen von außen kommenden Datenstand übernehmen (Datei-Import oder altes Tool).
// Ersetzt den aktuellen Stand vollständig; ⌘Z nimmt es zurück.
function adopt(raw, herkunft) {
  const d = normalize(raw);
  const personen = d.items.filter((i) => i.kind === 'person').length;
  if (!d.items.length) { alert('Die Datei enthält keine Einträge.'); return; }
  const text = `${herkunft}\n\n${personen} Personen · ${d.items.length - personen} Ereignisse/Bereiche · `
             + `${d.connections.length} Verbindungen · ${d.sources.length} Quellen\n\n`
             + 'Der aktuelle Stand wird ersetzt. ⌘Z macht es rückgängig.';
  if (!confirm(text)) return;
  closeConnEditor();
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, d);
  // Anordnung und aufgeklappte Balken gehören zu den alten IDs — verwerfen.
  localStorage.removeItem(LAYOUT_KEY); localStorage.removeItem(OPEN_KEY);
  tl.pos = new Map(); tl.expanded = new Set();
  tl.sel = new Set(); tl.selected = null; tl.editing = null; tl.selConn = null;
  tl._buildScale(); tl._initialLayout(); tl.render(); tl.fit();
  renderInfo(null); onChange();
}

function onChange() { record(); save(); updateHidden(); }

// Ansicht merken, damit man nach dem Neuladen dort weitermacht, wo man war.
function onView(v) {
  if (zoomVal) zoomVal.textContent = Math.round(v.k * 100) + ' %';
  platziereConnEditor();                  // das Feld klebt an seiner Linie
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* ignore */ } }, 400);
}

function updateHidden() {
  const hid = tl.hiddenPersons();
  btnHidden.textContent = `Ausgeblendet (${hid.length})`;
  btnHidden.style.display = hid.length ? '' : 'none';
  if (!tl.selected && !tl.selConn) renderInfo(null);
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const isContainer = (it) => it.kind === 'person' || (it.kind === 'event' && !it.personId);
const jahre = (it) => it.end ? `${fmtDate(it.start)}–${fmtDate(it.end)}` : fmtDate(it.start);

// ── Hinweis-Kasten ────────────────────────────────────────────────────────
// Steht dauerhaft im Bild und wiederholt den Text im Panel. Nach dem ersten
// selbst angelegten Eintrag hat er seinen Zweck erfüllt.
const hint = document.getElementById('hint');
function hintWeg() {
  if (!hint || hint.hidden) return;
  hint.hidden = true;
  try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
}
if (localStorage.getItem(HINT_KEY)) hint.hidden = true;
document.getElementById('hint-x').addEventListener('click', hintWeg);

// ── Schnellerfassung ──────────────────────────────────────────────────────
// Ein Feld, das Name und Jahre aus einer Zeile liest, die Person anlegt und die
// Ansicht dorthin bringt. Ersetzt: wandern, zielen, Datum nachtippen, wiederfinden.
const quick = document.getElementById('quick');
const quickInput = document.getElementById('quick-input');
const quickEcho = document.getElementById('quick-echo');
let fokusFeld = null;   // welches Panel-Feld nach dem Anlegen den Fokus bekommt

function quickOpen() {
  closeConnEditor(); schliesseSuche();
  quick.hidden = false; quickInput.value = ''; zeigeEcho();
  quickInput.focus();
}
function quickClose() { quick.hidden = true; }
function zeigeEcho() {
  const z = parseZeile(quickInput.value);
  if (!quickInput.value.trim()) {
    quickEcho.innerHTML = 'Name und Jahre in einer Zeile — <b>1629–1695</b>, <b>*1629 †1695</b>, '
      + '<b>4.1.1643 – 31.3.1727</b> oder auch nur ein Jahr. Enter legt an.';
    return;
  }
  if (!z || !z.title.trim()) { quickEcho.textContent = 'Noch kein Name erkannt.'; return; }
  if (!z.start) {
    quickEcho.innerHTML = `Legt an: <b>${esc(z.title)}</b> — kein Jahr erkannt, `
      + 'die Spanne wird geschätzt und lässt sich gleich ziehen.';
    return;
  }
  const spanne = z.end ? `${fmtDate(z.start)}–${fmtDate(z.end)}` : `${fmtDate(z.start)} (Ende offen)`;
  quickEcho.innerHTML = `Legt an: <b>${esc(z.title)}</b> · <b>${esc(spanne)}</b>`;
}
function quickCommit() {
  const z = parseZeile(quickInput.value);
  if (!z || !z.title.trim()) return;
  quickClose();
  hintWeg();
  // Steht ein Name da, braucht der Name keinen Fokus mehr — die Beschreibung schon.
  fokusFeld = 'f-desc';
  tl.addPerson({ title: z.title, start: z.start, end: z.end, geraten: !z.start });
}
quickInput.addEventListener('input', zeigeEcho);
quickInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); quickCommit(); }
  else if (e.key === 'Escape') { e.preventDefault(); quickClose(); }
});
// Klick daneben schließt — aber nicht der Klick, der das Feld gerade öffnet.
stage.addEventListener('pointerdown', (e) => { if (!quick.hidden && !quick.contains(e.target)) quickClose(); }, true);

// ── Suche mit Sprung ──────────────────────────────────────────────────────
const sucheInput = document.getElementById('search-input');
const sucheRes = document.getElementById('search-res');
let treffer = [], trefferIdx = -1;

function suche(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return data.items
    .filter((i) => (i.title || '').toLowerCase().includes(s))
    .sort((a, b) => {
      const ai = a.title.toLowerCase().indexOf(s), bi = b.title.toLowerCase().indexOf(s);
      return ai - bi || a.title.length - b.title.length;
    })
    .slice(0, 12);
}
function zeigeSuche() {
  treffer = suche(sucheInput.value); trefferIdx = treffer.length ? 0 : -1;
  if (!sucheInput.value.trim()) { schliesseSuche(); return; }
  sucheRes.hidden = false;
  sucheRes.innerHTML = treffer.length
    ? treffer.map((t, i) => {
        const wo = t.personId ? ' <span class="jahr">in ' + esc(byId(data.items, t.personId)?.title || '?') + '</span>' : '';
        return `<div class="r${i === trefferIdx ? ' on' : ''}" data-i="${i}">${t.hidden ? '⃠ ' : ''}${esc(t.title)}`
             + `<span class="jahr">${esc(jahre(t))}</span>${wo}</div>`;
      }).join('')
    : '<div class="leer">Nichts gefunden.</div>';
  sucheRes.querySelectorAll('.r').forEach((r) => {
    r.addEventListener('mousedown', (e) => { e.preventDefault(); springe(treffer[+r.getAttribute('data-i')]); });
  });
}
function schliesseSuche() { sucheRes.hidden = true; sucheRes.innerHTML = ''; treffer = []; trefferIdx = -1; }
function springe(it) {
  if (!it) return;
  schliesseSuche(); sucheInput.value = ''; sucheInput.blur();
  if (it.hidden) tl.restore(it.id);          // Ausgeblendetes holt der Sprung zurück
  tl._select(it.id);
  tl.focusItem(it.id);
}
sucheInput.addEventListener('input', zeigeSuche);
sucheInput.addEventListener('focus', () => { if (sucheInput.value.trim()) zeigeSuche(); });
sucheInput.addEventListener('blur', () => setTimeout(schliesseSuche, 120));
sucheInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!treffer.length) return;
    trefferIdx = (trefferIdx + (e.key === 'ArrowDown' ? 1 : treffer.length - 1)) % treffer.length;
    sucheRes.querySelectorAll('.r').forEach((r, i) => r.classList.toggle('on', i === trefferIdx));
  } else if (e.key === 'Enter') { e.preventDefault(); springe(treffer[trefferIdx]); }
  else if (e.key === 'Escape') { e.preventDefault(); sucheInput.value = ''; schliesseSuche(); sucheInput.blur(); }
});

// ── Beziehungs-Feld ───────────────────────────────────────────────────────
// Eine frisch gezogene Linie ist namenlos. Statt sie stumm liegen zu lassen, kommt
// direkt an der Linie ein kleines Feld hoch: Vorgaben zum Antippen, freier Text,
// beide Jahre und eine Fundstelle. Esc lässt sie unbenannt — das ist erlaubt.
const VORGABEN = ['las', 'Lehrer von', 'kannte', 'beeinflusst', 'bezieht sich auf'];

function openConnEditor(c, pos) {
  if (!c) return;
  quickClose(); schliesseSuche();
  connId = c.id;
  const a = byId(data.items, c.fromId), b = byId(data.items, c.toId);
  const lbl = c.label || (c.relation && c.relation !== 'verbunden' ? c.relation : '');
  cedit.hidden = false;
  cedit.innerHTML =
    `<div class="c-kopf"><b>${esc(a ? a.title : '?')}</b> <span class="c-pfeil">→</span> <b>${esc(b ? b.title : '?')}</b></div>`
    + `<label>Was verbindet die beiden?</label>`
    + `<input id="c-label" value="${esc(lbl)}" placeholder="frei beschreiben …">`
    + `<div class="c-chips">${VORGABEN.map((v) => `<button type="button" class="c-chip${v === lbl ? ' on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`
    + `<div class="c-2"><div><label>Jahr bei ${esc(kurz(a))}</label><input id="c-from" value="${esc(c.fromDate || '')}" placeholder="JJJJ"></div>`
    + `<div><label>Jahr bei ${esc(kurz(b))}</label><input id="c-to" value="${esc(c.toDate || c.date || '')}" placeholder="JJJJ"></div></div>`
    + `<label>Quelle / Seite</label><input id="c-beleg" value="${esc(c.beleg || '')}" placeholder="z. B. Huygens-Biographie, S. 214">`
    + `<div class="c-btns"><button class="c-ok" id="c-ok">Fertig</button>`
    + `<button class="c-del" id="c-del">Löschen</button></div>`;
  platziereConnEditor(pos);

  const g = (id) => cedit.querySelector('#' + id);
  const setzeLabel = (v) => {
    c.label = v;
    cedit.querySelectorAll('.c-chip').forEach((ch) => ch.classList.toggle('on', ch.getAttribute('data-v') === v));
    record('conn:' + c.id + ':label'); tl.render(); save();
  };
  g('c-label').addEventListener('input', (e) => setzeLabel(e.target.value));
  cedit.querySelectorAll('.c-chip').forEach((ch) => ch.addEventListener('click', () => {
    const v = ch.getAttribute('data-v');
    const neu = c.label === v ? '' : v;          // nochmal antippen = wieder abwählen
    g('c-label').value = neu; setzeLabel(neu);
  }));
  // Stimmen beide Jahre überein (der Normalfall: ein Akt an einem Datum), zieht das
  // eine Feld das andere mit — sonst tippt man dieselbe Zahl zweimal.
  const datum = (feld, e, mitziehen) => {
    const roh = e.target.value.trim();
    const v = roh ? parseDatum(roh) : null;
    e.target.classList.toggle('bad', !!roh && !v);
    if (roh && !v) return;
    const gleich = (c.fromDate || '') === (c.toDate || c.date || '');
    if (v) e.target.value = v;
    if (feld === 'from') { c.fromDate = v; if (gleich && mitziehen) { c.toDate = v; c.date = v; g('c-to').value = v || ''; } }
    else { c.toDate = v; c.date = v; if (gleich && mitziehen) { c.fromDate = v; g('c-from').value = v || ''; } }
    record('conn:' + c.id + ':datum'); tl.render(); save(); platziereConnEditor(); panelAuffrischen();
  };
  g('c-from').addEventListener('change', (e) => datum('from', e, true));
  g('c-to').addEventListener('change', (e) => datum('to', e, true));
  g('c-beleg').addEventListener('input', (e) => { c.beleg = e.target.value; record('conn:' + c.id + ':beleg'); save(); });
  g('c-ok').addEventListener('click', fertig);
  g('c-del').addEventListener('click', () => { const id = c.id; closeConnEditor(); tl.deleteConn(id); renderInfo(tl.selected ? byId(data.items, tl.selected) : null); });
  g('c-label').focus(); g('c-label').select();
}
function fertig() { closeConnEditor(); tl.selConn = null; tl.render(); panelAuffrischen(); }
// Die Beziehungsliste im Panel zeigt Name und Jahre der Verbindung — ändert man sie im
// Benennen-Feld, muss die Liste mitgehen, sonst steht dort noch der alte Stand.
function panelAuffrischen() {
  if (tl.sel.size > 1) return;
  renderInfo(tl.selected ? byId(data.items, tl.selected) : null);
}
// Einmal registriert, nicht bei jedem Öffnen neu — der Inhalt wird ausgetauscht,
// das Element selbst bleibt.
cedit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); fertig(); }
  else if (e.key === 'Escape') { e.preventDefault(); fertig(); }
});
const kurz = (it) => !it ? '?' : (it.title.length > 12 ? it.title.slice(0, 11) + '…' : it.title);

// Das Feld klebt an seiner Linie — auch beim Zoomen und Verschieben — bleibt aber
// immer vollständig auf der Bühne.
function platziereConnEditor(pos) {
  if (cedit.hidden || !connId) return;
  const p = pos || tl.connScreenPos(connId);
  const r = stage.getBoundingClientRect();
  const w = cedit.offsetWidth || 268, h = cedit.offsetHeight || 260;
  let x = (p ? p.x : r.width / 2) + 18, y = (p ? p.y : r.height / 2) - h / 2;
  x = Math.max(10, Math.min(r.width - w - 10, x));
  y = Math.max(10, Math.min(r.height - h - 10, y));
  cedit.style.left = x + 'px'; cedit.style.top = y + 'px';
}
function closeConnEditor() { cedit.hidden = true; cedit.innerHTML = ''; connId = null; }

// ── Werkzeugleiste ────────────────────────────────────────────────────────
document.getElementById('btn-fit').addEventListener('click', () => tl.fit());
document.getElementById('btn-reset').addEventListener('click', () => tl.resetLayout());
document.getElementById('zoom-in').addEventListener('click', () => tl.zoomBy(1.25));
document.getElementById('zoom-out').addEventListener('click', () => tl.zoomBy(1 / 1.25));
const btnConns = document.getElementById('btn-conns');
btnConns.classList.toggle('active', tl.showConns);
btnConns.addEventListener('click', () => { tl.setShowConns(!tl.showConns); btnConns.classList.toggle('active', tl.showConns); });
btnHidden.addEventListener('click', () => tl._select(null));
document.getElementById('btn-addperson').addEventListener('click', quickOpen);
document.getElementById('btn-addworld').addEventListener('click', () => { hintWeg(); tl.addWorldEvent(); });
document.getElementById('btn-export').addEventListener('click', () => exportJson(tl.data, 'zeitleiste.json'));

// Das ⋯-Menü schließt sich nach jeder Wahl und beim Klick daneben.
const menu = document.getElementById('menu');
menu.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') menu.open = false; });
document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });

const fileInput = document.getElementById('file-import');
document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; fileInput.value = '';
  if (!file) return;
  try { adopt(await importJson(file), `Import: ${file.name}`); }
  catch (err) { alert('Die Datei ließ sich nicht lesen:\n' + err.message); }
});

document.getElementById('btn-adopt').addEventListener('click', async () => {
  try {
    const res = await fetch('data/zeitleiste.json');
    if (!res.ok) throw new Error(`data/zeitleiste.json: ${res.status}`);
    adopt(await res.json(), 'Datenstand aus dem alten Tool (data/zeitleiste.json)');
  } catch (err) { alert('Konnte data/zeitleiste.json nicht laden:\n' + err.message); }
});
document.getElementById('btn-seed').addEventListener('click', async () => {
  if (!confirm('Alles verwerfen und Beispiel-Daten laden?')) return;
  localStorage.removeItem(LAYOUT_KEY); localStorage.removeItem(VIEW_KEY); localStorage.removeItem(OPEN_KEY);
  await store.save(seedData()); location.reload();
});

// ── Tastatur ──────────────────────────────────────────────────────────────
// Greift nie, solange der Fokus in einem Eingabefeld steht (dort ist „0" eine Null).
const inField = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'z' || e.key === 'Z')) {   // greift auch aus einem Eingabefeld heraus
    e.preventDefault();
    applyState(e.shiftKey ? history.redo() : history.undo());
    return;
  }
  if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); sucheInput.focus(); sucheInput.select(); return; }
  if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); quickOpen(); return; }
  if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); tl.hideSelected(); return; }
  if (inField(e.target)) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = e.shiftKey ? 240 : 80;
  switch (e.key) {
    case 'n': case 'N': quickOpen(); break;
    case '0': tl.fit(); break;
    case '+': case '=': tl.zoomBy(1.25); break;
    case '-': case '_': tl.zoomBy(1 / 1.25); break;
    case 'ArrowLeft': tl.panBy(step, 0); break;
    case 'ArrowRight': tl.panBy(-step, 0); break;
    case 'ArrowUp': tl.panBy(0, step); break;
    case 'ArrowDown': tl.panBy(0, -step); break;
    case 'e': case 'E': case ' ':
      // Der Aufklapp-Pfeil auf der Leinwand ist bei kleinem Zoom kaum zu treffen —
      // die Tastatur trifft ihn immer.
      if (tl.selected) tl.toggleExpand(tl.selected); else return;
      break;
    case 'f': case 'F': tl.focusSelected(); break;
    case 'Escape': closeConnEditor(); quickClose(); tl.escape(); break;
    default: return;
  }
  e.preventDefault();
});

// ── Info-Panel ────────────────────────────────────────────────────────────
let connSuche = null;   // läuft gerade die Zielsuche für „＋ Beziehung"?

function renderInfo(it) {
  if (tl.sel.size > 1) {   // Sammelansicht
    const namen = [...tl.sel].map((id) => byId(data.items, id)).filter(Boolean);
    info.innerHTML = `<div class="i-kind">${namen.length} ausgewählt</div>`
      + namen.map((n) => `<div class="i-hidden">${esc(n.title)}</div>`).join('')
      + `<div class="i-btns"><button id="m-hide" class="i-btn">Ausblenden (⌘D)</button></div>`
      + `<button class="i-del" id="m-del">Alle löschen</button>`;
    document.getElementById('m-hide').addEventListener('click', () => tl.hideSelected());
    document.getElementById('m-del').addEventListener('click', () => {
      if (!confirm(`${namen.length} Einträge löschen?`)) return;
      for (const n of namen) deleteItem(n.id);
    });
    return;
  }
  if (!it) {
    // Nichts ausgewählt heißt auch: kein Benennen-Feld mehr offen — es sei denn,
    // gerade wurde eine Verbindung angeklickt (die hat kein Item als Auswahl).
    if (!tl.selConn) closeConnEditor();
    let html = '<div class="placeholder">Nichts ausgewählt.<br><br>'
      + '<b>N</b> legt eine Person an — Name und Jahre in einer Zeile, ohne vorher '
      + 'die richtige Stelle suchen zu müssen. <b>⌘F</b> sucht und springt hin.<br><br>'
      + '<b>Doppelklick</b> ins Leere = neue Person · <b>in eine Person</b> = neuer Bereich.<br>'
      + 'Auf einem Balken <b>ziehen</b> = Verbindung; <b>Klick auf eine Linie</b> öffnet sie zum Benennen.<br><br>'
      + '<b>0</b> einpassen · <b>+ / −</b> zoomen · <b>E</b> aufklappen · <b>F</b> auf Auswahl · <b>Esc</b> zurück</div>';
    const hid = tl.hiddenPersons();
    if (hid.length) html += '<label>Ausgeblendet — klicken zum Zurückholen</label>'
      + hid.map((h) => `<div class="i-hidden" data-id="${h.id}">↩ ${esc(h.title)} <span class="k">${esc(h.kind === 'person' ? '' : 'Ereignis')}</span></div>`).join('');
    info.innerHTML = html;
    info.querySelectorAll('.i-hidden').forEach((elx) => elx.addEventListener('click', () => tl.restore(elx.getAttribute('data-id'))));
    return;
  }
  const color = getEntryColor(it, data) || '#64748b';
  const isPerson = it.kind === 'person';
  const editing = tl.editing === it.id;
  const cats = data.categories.map((c) => `<option value="${c.id}" ${c.id === it.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const laender = COUNTRIES.map((l) => `<option value="${esc(l)}" ${l === it.land ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const conns = data.connections.filter((c) => c.fromId === it.id || c.toId === it.id);
  const connLines = conns.map((c) => {
    const other = byId(data.items, c.fromId === it.id ? c.toId : c.fromId);
    const dir = c.fromId === it.id ? '→' : '←';
    // Ohne fromDate nur das Zieldatum zeigen — fmtDate('') liefert sonst ein „?" davor.
    const bis = c.toDate || c.date;
    const when = bis ? ` <span class="k">(${c.fromDate ? fmtDate(c.fromDate) + '→' : ''}${fmtDate(bis)})</span>` : '';
    const lbl = c.label || (c.relation && c.relation !== 'verbunden' ? c.relation : 'ohne Namen');
    return `<div class="i-conn${tl.selConn === c.id ? ' on' : ''}" data-cid="${c.id}">${dir} ${esc(other ? other.title : '?')} <span class="k">${esc(lbl)}</span>${when} <span class="i-cdel" data-cid="${c.id}">✕</span></div>`;
  }).join('') || '<div class="k">— keine —</div>';

  info.innerHTML =
    `<div class="i-kind">${isPerson ? 'Person' : (it.personId ? 'Ereignis (gehört zu ' + esc(byId(data.items, it.personId)?.title || '?') + ')' : 'Welt-Ereignis')}</div>`
    + `<label>Name</label><input id="f-title" value="${esc(it.title || '')}">`
    + `<div class="i-2"><div><label>${isPerson ? 'Geburt' : 'Beginn'}</label><input id="f-start" value="${esc(it.start || '')}" placeholder="JJJJ"></div>`
    + `<div><label>${isPerson ? 'Tod' : 'Ende'}</label><input id="f-end" value="${esc(it.end || '')}" placeholder="JJJJ / leer"></div></div>`
    + `<div class="i-note">Auch „um 1630", „14.4.1629", „April 1629" oder „heute".</div>`
    + `<label>Kategorie <span class="i-chip" style="background:${color}"></span></label><select id="f-cat"><option value="">—</option>${cats}</select>`
    + `<label>Land</label><select id="f-land"><option value="">—</option>${laender}</select>`
    + `<label>Beschreibung</label><textarea id="f-desc" rows="3">${esc(it.description || '')}</textarea>`
    + `<label>Quelle / Seite</label><input id="f-beleg" value="${esc(it.beleg || '')}" placeholder="z. B. Huygens-Biographie, S. 214">`
    + (isContainer(it)
        ? `<div class="i-btns">`
          + (editing ? `<button id="f-lockspan" class="i-btn-ok">✓ Lebenszeit fixieren</button>`
                     : `<button id="f-editspan" class="i-btn">Lebenszeit ändern (Enden ziehen)</button>`)
          + `<button id="f-addev" class="i-btn">＋ Ereignis</button>`
          + `<button id="f-open" class="i-btn">${tl.expanded.has(it.id) ? '▾ Details zuklappen' : '▸ Details aufklappen'} (E)</button>`
          + `<button id="f-hide" class="i-btn">Ausblenden</button>`
          + `</div>` : '')
    + `<div class="i-conns"><label style="margin-top:0">Beziehungen</label>${connLines}`
    + `<div class="i-btns"><button id="f-addconn" class="i-btn">＋ Beziehung …</button></div>`
    + `<div id="f-connpick"></div></div>`
    + `<button class="i-del" id="f-del">Löschen</button>`;

  const g = (id) => document.getElementById(id);
  const commit = (field, val) => { it[field] = val; record('feld:' + it.id + ':' + field); tl.refresh(); save(); };
  // Datumsfelder gehen durch den Parser: unverstandenes bleibt stehen und wird rot,
  // verstandenes wird zurückgeschrieben, damit man sieht, was angekommen ist.
  const datumFeld = (feld, e) => {
    const roh = e.target.value.trim();
    const v = roh ? parseDatum(roh) : null;
    e.target.classList.toggle('bad', !!roh && !v);
    if (roh && !v) return;
    e.target.value = v || '';
    tl.setDate(it.id, feld, v);
    record('feld:' + it.id + ':' + feld); save();
  };
  g('f-title').addEventListener('input', (e) => commit('title', e.target.value));
  g('f-start').addEventListener('change', (e) => datumFeld('start', e));
  g('f-end').addEventListener('change', (e) => datumFeld('end', e));
  g('f-cat').addEventListener('change', (e) => commit('categoryId', e.target.value || null));
  g('f-land').addEventListener('change', (e) => commit('land', e.target.value || null));
  g('f-desc').addEventListener('input', (e) => commit('description', e.target.value));
  g('f-beleg').addEventListener('input', (e) => commit('beleg', e.target.value));
  g('f-del').addEventListener('click', () => deleteItem(it.id));
  if (isContainer(it)) {
    if (editing) g('f-lockspan').addEventListener('click', () => tl.confirmLifespan());
    else g('f-editspan').addEventListener('click', () => tl.editLifespan(it.id));
    g('f-addev').addEventListener('click', () => tl.addEvent(it.id));
    g('f-open').addEventListener('click', () => tl.toggleExpand(it.id));
    g('f-hide').addEventListener('click', () => { it.hidden = true; tl._select(null); tl.render(); onChange(); });
  }
  // Klick auf eine Beziehung öffnet dasselbe Feld wie der Klick auf die Linie.
  info.querySelectorAll('.i-conn').forEach((elx) => elx.addEventListener('click', (e) => {
    if (e.target.classList.contains('i-cdel')) return;
    const c = byId(data.connections, elx.getAttribute('data-cid'));
    if (c) { tl.selConn = c.id; tl.render(); openConnEditor(c, tl.connScreenPos(c.id)); }
  }));
  info.querySelectorAll('.i-cdel').forEach((elx) => elx.addEventListener('click', (e) => {
    e.stopPropagation(); const cid = elx.getAttribute('data-cid');
    if (connId === cid) closeConnEditor();
    tl.deleteConn(cid); renderInfo(it);
  }));
  g('f-addconn').addEventListener('click', () => zeigeConnSuche(it));
  if (connSuche === it.id) zeigeConnSuche(it);

  // Frisch angelegt? Dann sofort losschreiben können, ohne erst ins Feld zu klicken.
  if (tl.justCreated === it.id) {
    tl.takeJustCreated();
    hintWeg();                       // wer selbst etwas anlegt, braucht die Anleitung nicht mehr
    const f = g(fokusFeld || 'f-title') || g('f-title');
    fokusFeld = null;
    f.focus(); if (f.select) f.select();
  }
}

// Ziel einer neuen Beziehung suchen — der Weg, der ohne Leinwand auskommt: beide
// Enden müssen nicht gleichzeitig im Bild sein, und man muss nicht zielen.
function zeigeConnSuche(it) {
  connSuche = it.id;
  const box = document.getElementById('f-connpick');
  if (!box) return;
  box.innerHTML = `<input id="f-connq" placeholder="Wen oder was verbinden?" autocomplete="off">`
    + `<div class="search-res" id="f-connres" style="position:static;width:auto;box-shadow:none;margin-top:5px"></div>`;
  const q = document.getElementById('f-connq');
  const res = document.getElementById('f-connres');
  let liste = [], idx = -1;
  const zeichne = () => {
    liste = suche(q.value).filter((t) => t.id !== it.id).slice(0, 8);
    idx = liste.length ? 0 : -1;
    res.innerHTML = !q.value.trim() ? '<div class="leer">Namen tippen …</div>'
      : liste.length ? liste.map((t, i) => `<div class="r${i === idx ? ' on' : ''}" data-i="${i}">${esc(t.title)}<span class="jahr">${esc(jahre(t))}</span></div>`).join('')
      : '<div class="leer">Nichts gefunden.</div>';
    res.querySelectorAll('.r').forEach((r) => r.addEventListener('mousedown', (e) => { e.preventDefault(); waehle(liste[+r.getAttribute('data-i')]); }));
  };
  const waehle = (ziel) => {
    if (!ziel) return;
    connSuche = null;
    tl.connectTo(it.id, ziel.id);        // öffnet das Benennen-Feld selbst
    renderInfo(it);
    const lf = cedit.querySelector('#c-label');
    if (lf) { lf.focus(); lf.select(); }
  };
  q.addEventListener('input', zeichne);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!liste.length) return;
      idx = (idx + (e.key === 'ArrowDown' ? 1 : liste.length - 1)) % liste.length;
      res.querySelectorAll('.r').forEach((r, i) => r.classList.toggle('on', i === idx));
    } else if (e.key === 'Enter') { e.preventDefault(); waehle(liste[idx]); }
    else if (e.key === 'Escape') { e.preventDefault(); connSuche = null; box.innerHTML = ''; }
  });
  zeichne(); q.focus();
  // Der Knopf sitzt am unteren Ende eines langen Panels — ohne das hier tippt man
  // in ein Feld, dessen Trefferliste unterhalb des Sichtbaren liegt.
  info.scrollTop = info.scrollHeight;
}

function deleteItem(id) {
  const item = byId(data.items, id);
  const rm = new Set([id]);
  if (item && item.kind === 'person') data.items.filter((i) => i.personId === id).forEach((i) => rm.add(i.id));
  data.items = data.items.filter((i) => !rm.has(i.id));
  data.connections = data.connections.filter((c) => !rm.has(c.fromId) && !rm.has(c.toId));
  closeConnEditor();
  tl.selected = null; tl.sel = new Set(); tl.selConn = null;
  record(); tl.render(); renderInfo(null); save();
}

updateHidden();
renderInfo(null);
