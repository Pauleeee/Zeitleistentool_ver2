# Zeitleiste — Buchnotizen als freie Leinwand

Statische Web-App (Vanilla JS, ES-Module, **reines SVG**, kein Build-Schritt, kein Backend).
Nachfolger des alten Tools `~/Documents/PKM-Tool/`, dessen vis-timeline zu unflexibel war.
Endziel: echte Mac-App über **Tauri v2**, später iPhone.

## Zuerst lesen

- **`STAND.md`** — der Faden zum Weitermachen: was zuletzt dazukam, wo es weitergeht,
  offene Vorbehalte. Bei jedem Einstieg zuerst hier nachsehen.
- **`AUFGABEN.md`** — die vollständige Aufgabenliste (Phase A Parität · B Anytype · C Tauri)
  mit Haken am Erledigten.

Diese Datei hier ist nur die Orientierung und wiederholt die beiden nicht.

## Start

```bash
cd "/Users/aph-admin/Documents/Zeitleiste zweiter Versuch" && python3 serve.py 8091
```

→ http://localhost:8091 · `serve.py` ist ein No-Cache-Server (sonst cacht der Browser die
ES-Module und Änderungen sind unsichtbar).

**Port 8091, nicht 8090.** Beide `serve.py` — hier und im alten Tool — haben 8090 als
Standard; 8090 gehört dem alten Tool, damit beide gleichzeitig laufen können.
`.claude/launch.json` setzt 8091 bereits richtig.

## Module

| Datei | Zeilen | Rolle |
|---|---|---|
| `js/timeline-canvas.js` | 1043 | die Engine `TimelineCanvas`: drei Ebenen (`gBack`/`gWorld`/`gUI`), Geometrie, alle Gesten, `addPerson`, `connectTo`, `ensureVisible` |
| `js/app.js` | 575 | Bootstrap, Info-Panel, Schnellerfassung, Suche, Beziehungs-Feld, Tastatur, Persistenz |
| `js/model.js` | 488 | Datenmodell, Factories, Farb-/Datums-Helfer — **byte-identisch mit dem alten Tool** |
| `js/store.js` | 114 | localStorage, `exportJson`/`importJson`, **`normalize()`** |
| `js/parse.js` | 92 | `parseDatum()`, `parseZeile()` — getippter Text → Datenformat |
| `js/history.js` | 32 | Undo/Redo über Schnappschüsse (Daten + Anordnung) |
| `index.html`, `css/proto.css` | | Seite; **alle Leinwand-Farben als CSS-Variablen in `:root`** (`--tl-accent`, `--tl-paper`, `--tl-grid` …) |

Dev-Hook: `window.__tl` (`js/app.js:44`) — z. B. `__tl.fit()`, `__tl.data`, `__tl.view`.

## Datenmodell — die tragende Regel

Ein `event` **mit `personId` und `end`** ist ein **Bereich** („war bei X angestellt",
eingefärbte Säule). **Ohne `end`** ist es ein **Ereignis** (senkrechte Linie durch den Balken).
Beide docken unten an der Balkenkante an; von dort gehen Verbindungen aus. **Kein neues Feld
nötig** — das war die tragende Erkenntnis des Projekts.

- **`js/model.js` wird grundsätzlich nicht angefasst.** Es ist byte-identisch mit dem alten
  Tool, deshalb braucht die Datenübernahme keine Umwandlung. Diese Eigenschaft ist wertvoll.
- **Neue Felder stattdessen in `normalize()` (`js/store.js`) durchreichen.** So laufen heute
  schon `hidden` am Eintrag sowie `beleg` und `fromDate` an der Verbindung — Export/Import
  verlieren sie dadurch nicht.
- `js/store.js` ist zugleich der **austauschbare Persistenz-Seam** für den späteren
  Tauri-Datei-Store und den Anytype-Import.

## Persistenz

Arbeitsstand liegt in **localStorage**:
`zeitleiste-proto-data-v1` · `-layout-v1` · `-view-v1` · `-open-v1` · `-hint-weg-v1`

`data/zeitleiste.json` ist der Datenstand aus dem alten Tool (**19. Juli**, 36 Personen,
43 Ereignisse, davon 23 Bereiche). Er wird von „Aus altem Tool laden" **gelesen, aber nie
geschrieben**. Einen neueren Stand holt man über `⬇ Export` im alten Tool → `⬆ Import` hier.

## Entscheidungen des Nutzers — nicht versehentlich umdrehen

- Personen sind **nicht** frei horizontal verschiebbar — sonst „wird die Zeit falsch".
- Positionen bleiben **frei**, keine erzwungene Zeilenordnung. Beim Aufklappen weichen
  Nachbarn nur **temporär** aus und springen exakt zurück; `pos` wird dabei nie verändert.
- Ausblenden über **Auswahl + ⌘D**, nicht per Doppelklick — der Doppelklick gehört dem Anlegen.
- Beim Aufklappen ist der Platz im Balken **fest** und die Schrift **konstant groß**.
  Reinzoomen zeigt **mehr** Zeilen, nicht größere.
- Beschriftungen skalieren nicht mit dem Zoom; die Zoomstufe regelt nur, **welche** erscheinen.
- Eine frisch gezogene Verbindung darf **namenlos bleiben** (Esc). Das Benennen-Feld ist ein
  Angebot, keine Pflicht — sonst wäre die schnelle Geste wieder ausgebremst.

Leitziel des Nutzers: „cooles UI-Feeling mit möglichst kleiner Hürde bei der Datenerfassung,
solange ich die Daten händisch erfasse." Beim Lesen hat man Name, Jahre und Beziehung im Kopf,
aber **keine Position und keine Zoomstufe** — Eingabe muss deshalb auch ohne Geometrie gehen
(Schnellerfassung `N`, Suche `⌘F`, „＋ Beziehung" mit Zielsuche im Panel).

## Stolperfallen

- **`CLAUDE_altes_projekt.md` ist nicht die Doku dieses Projekts.** Es ist eine byte-identische
  Kopie der `CLAUDE.md` des **alten** Tools und beschreibt vis-timeline, das hier **nicht**
  verwendet wird. Nur als Referenz für Quellen-, Filter- und Kategorie-UI heranziehen
  (`~/Documents/PKM-Tool/js/ui.js`, `filters.js`, `sourcesview.js`, `groupbar.js`).
- **Doppelklick/Klick werden selbst erkannt** — der native `dblclick` geht bei Zeiger-Erfassung
  und Neuaufbau des SVG verloren.
- **Der Aufklapp-Pfeil ist in Weltkoordinaten gezeichnet** (~10 Einheiten) und bei kleinem
  Zoom kaum zu treffen; unter 46 Einheiten Balkenbreite entfällt er ganz. `E` / Leertaste
  trifft immer. Offener Punkt: konstante Größe geben, wie bei den Beschriftungen.
- **⌘Z, ⌘D, ⌘F, ⌘K sind nicht mit echter Tastatur geprüft** — die Browser-Steuerung liefert die
  Cmd-Taste nicht durch; verifiziert nur über ausgelöste Tastatur-Ereignisse.
- **`beleg` ist Freitext**, nicht die Quellenverwaltung (A4). Beim Ausbau in echte `refs`
  überführen.
- `mock-huygens.html` ist eine Konzept-Skizze, kein Teil der App.

## Kein Git

Dieses Projekt ist **nicht versioniert**. Vor größeren Umbauten daran denken — das alte Tool
hat ein Repo (`Pauleeee/pkm-tool`), dieses nicht.
