# Zeitleiste — Buchnotizen als freie Leinwand

Statische Web-App (Vanilla JS, ES-Module, **reines SVG**, kein Build-Schritt, kein Backend),
seit 14. November 2026 zusätzlich in eine **Mac-App (Tauri v2)** verpackt.
Nachfolger des alten Tools `~/Documents/PKM-Tool/`, dessen vis-timeline zu unflexibel war.
Endziel: Mac-App als **Leinwand über den Anytype-Daten**, später iPhone.

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

→ http://localhost:8091 · `serve.py` liefert den Ordner **`web/`** aus und ist ein No-Cache-Server (sonst cacht der Browser die
ES-Module und Änderungen sind unsichtbar).

**Port 8091, nicht 8090.** Beide `serve.py` — hier und im alten Tool — haben 8090 als
Standard; 8090 gehört dem alten Tool, damit beide gleichzeitig laufen können.
`.claude/launch.json` setzt 8091 bereits richtig.

### Mac-App (Tauri)

```bash
export PATH=/opt/homebrew/opt/rustup/bin:$PATH   # Rust kommt aus Homebrew-rustup (keg-only)
npm run tauri dev     # Fenster mit der App, lädt web/ direkt
npm run tauri build   # → src-tauri/target/release/bundle/macos/Zeitleiste.app (~1 min)
```

- Alles, was die Seite anzeigt, liegt in **`web/`** (= `frontendDist`). `src-tauri/` ist die Hülle.
- **WKWebView kennt `alert`/`confirm`/Downloads nicht** — `alert` zeigt nichts, `confirm` sagt
  stumm „Nein". Rückfragen, Hinweise und Export laufen deshalb über **`web/js/native.js`**
  (`frage`, `hinweis`, `exportiere`): in der App native Dialoge (`tauri-plugin-dialog`),
  im Browser wie gehabt. **Nie direkt `alert`/`confirm` aufrufen.**
- **Sicherheit:** Den „Sichern unter“-Dialog öffnet **Rust** (Befehl `exportieren`) — die Seite
  kann keinen Pfad vorgeben. JS darf nur `dialog:allow-ask`/`allow-message`. CSP in
  `tauri.conf.json` blockiert fremde Skripte. In `app.js` geht **alles** aus den Daten nur über
  `esc()` in `innerHTML` (auch IDs), Farben über `sichereFarbe()`. `serve.py` lauscht nur auf 127.0.0.1.
- Die App hat **eigenen localStorage**, getrennt von Safari/Chrome. Daten kommen per
  „Aus altem Tool laden" oder Import hinein.

## Module

| Datei | Zeilen | Rolle |
|---|---|---|
| `web/js/timeline-canvas.js` | 1043 | die Engine `TimelineCanvas`: drei Ebenen (`gBack`/`gWorld`/`gUI`), Geometrie, alle Gesten, `addPerson`, `connectTo`, `ensureVisible` |
| `web/js/app.js` | 575 | Bootstrap, Info-Panel, Schnellerfassung, Suche, Beziehungs-Feld, Tastatur, Persistenz |
| `web/js/model.js` | 488 | Datenmodell, Factories, Farb-/Datums-Helfer — **byte-identisch mit dem alten Tool** |
| `web/js/store.js` | 114 | localStorage, `exportJson`/`importJson`, **`normalize()`** |
| `web/js/parse.js` | 92 | `parseDatum()`, `parseZeile()` — getippter Text → Datenformat |
| `web/js/native.js` | 34 | Rückfragen/Hinweise/Export — Browser oder native Mac-Dialoge |
| `web/js/history.js` | 32 | Undo/Redo über Schnappschüsse (Daten + Anordnung) |
| `web/index.html`, `web/css/proto.css` | | Seite; **alle Leinwand-Farben als CSS-Variablen in `:root`** (`--tl-accent`, `--tl-paper`, `--tl-grid` …) |

Dev-Hook: `window.__tl` (`web/js/app.js:45`) — z. B. `__tl.fit()`, `__tl.data`, `__tl.view`.

## Datenmodell — die tragende Regel

Ein `event` **mit `personId` und `end`** ist ein **Bereich** („war bei X angestellt",
eingefärbte Säule). **Ohne `end`** ist es ein **Ereignis** (senkrechte Linie durch den Balken).
Beide docken unten an der Balkenkante an; von dort gehen Verbindungen aus. **Kein neues Feld
nötig** — das war die tragende Erkenntnis des Projekts.

- **`web/js/model.js` wird grundsätzlich nicht angefasst.** Es ist byte-identisch mit dem alten
  Tool, deshalb braucht die Datenübernahme keine Umwandlung. Diese Eigenschaft ist wertvoll.
- **Neue Felder stattdessen in `normalize()` (`web/js/store.js`) durchreichen.** So laufen heute
  schon `hidden` am Eintrag sowie `beleg` und `fromDate` an der Verbindung — Export/Import
  verlieren sie dadurch nicht.
- `web/js/store.js` ist zugleich der **austauschbare Persistenz-Seam** für den späteren
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

## Git

Seit 14. November 2026 versioniert: **`Pauleeee/Zeitleistentool_ver2`** auf GitHub (Branch `main`).
Nach jedem abgeschlossenen Schritt committen.
