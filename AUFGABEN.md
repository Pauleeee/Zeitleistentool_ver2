# Zeitleiste — Projekt & Aufgaben

**Ziel:** Das alte Web-Tool „Zeitleiste für Buchnotizen" (`~/Documents/PKM-Tool/`) wird zu einer
eigenständigen App. Neue, frei erarbeitete Zeitleiste (Lebensspannen-Balken + gerichtete,
datierte Einfluss-Verbindungen). Endziel: **echte Mac-App (Tauri), später iPhone**. Zwischenziel
laut Absprache: **erst mindestens die Funktionalität des alten Tools erreichen, dann die
Anytype-Schnittstelle**.

Projektordner: `~/Documents/Zeitleiste zweiter Versuch/`
Start (Entwicklung): `python3 serve.py 8091` → http://localhost:8091 · Mac-App: `npm run tauri dev` / `npm run tauri build`

---

## Aktueller Stand (fertig & getestet)

- **Zeitleisten-Engine** (`js/timeline-canvas.js`, reines SVG, abhängigkeitsfrei) — **drei Ebenen**:
  `gBack` (Bildschirm, hinten: Fläche, Jahrhundert-Bänder, Raster) · `gWorld` (transformiert:
  Balken, Kinder, Verbindungen) · `gUI` (Bildschirm, vorn: **alle Beschriftungen**, klebende
  Jahresleiste, Randhinweise).
- **Lesbarkeit & Orientierung** (Durchgang 1):
  - Beschriftungen skalieren **nicht** mit dem Zoom; welche erscheinen, regelt die Zoomstufe
    (LOD) und ein Kollisions-Durchgang in `_placeLabels()`. Reinzoomen zeigt **mehr**, nicht größer.
  - **Klebende Jahresleiste** unten, Schrittweite aus der sichtbaren Spanne; Jahrhundert-Bänder.
  - `fit()` mit Lesbarkeitsgrenze; **Randhinweise** „← 3 weitere · 1643–1727" (anklickbar).
  - **Pan-Grenzen** (`_clampView`) — man kann sich nicht mehr ins Leere verlaufen.
  - **Ansicht wird gemerkt** (`zeitleiste-proto-view-v1`); Zoom-Bedienung `− % +` in der Kopfleiste.
  - **Tastatur**: `0` einpassen · `+ / −` zoomen · Pfeile bewegen · `F` auf Auswahl · `Esc` zurück.
  - Titel bleiben sichtbar, wenn ein Balken links aus dem Bild läuft.
- **Die Person als Behälter** (Durchgang 2, nach der Skizze des Nutzers):
  - **Ereignisse** = senkrechte Linie durch den Balken; **Bereiche** = eingefärbte Säule
    („war bei X angestellt"). Beide tragen unten auf der Kante den **Andockpunkt** für Verbindungen.
    Datenmodell unverändert: `event` mit `personId` **+ `end`** = Bereich, ohne `end` = Ereignis.
  - Balkenhöhe **ergibt sich aus dem Inhalt**: Kopfzeile + so viele Beschriftungszeilen, wie sich
    die Kinder zeitlich überlagern (`_layoutEvents`, `_trackH`).
  - **Erfassen**: Doppelklick **in** eine Person = neuer Bereich · **Rand ziehen** = Spanne ·
    ganz **zusammenschieben** = wird zum Ereignis · **auseinanderziehen** = wieder ein Bereich
    (Ohren `◂ ▸` am ausgewählten Eintrag) · **Mitte ziehen** = zeitlich verschieben ·
    auf einen anderen Balken fallen lassen = umhängen.
  - **Aufklappen** (`▸` rechts im Kopf oder Knopf im Panel): Beschreibung + Liste der
    Ereignisse/Bereiche direkt auf der Leinwand. Der Platz ist fest, die Schrift konstant —
    beim Reinzoomen passt mehr hinein.
  - **Elegantes Ausweichen** (`_pushApart`): wächst ein Balken, rücken die zeitlich überlappenden
    Nachbarn animiert nach unten und **springen beim Zuklappen exakt zurück** — die gespeicherte
    Position (`pos`) wird dabei nie verändert.
  - **Mehrfachauswahl** (⇧-/⌘-Klick) mit Sammelansicht im Panel; **⌘D** blendet alle Ausgewählten aus.
  - **Undo/Redo** (`js/history.js`, ⌘Z / ⌘⇧Z): Schnappschüsse von Daten **und** Anordnung;
    gleichartige Änderungen kurz hintereinander werden zu einem Schritt zusammengefasst.
  - Doppelklick/Klick werden **selbst erkannt** — der native `dblclick` geht bei Zeiger-Erfassung
    und Neuaufbau des SVG verloren.
- **Editierbares Info-Panel** (`js/app.js`): Name, Datum, Kategorie, **Beschreibung**,
  Beziehungsliste (+ löschen), Aufklappen, Ausblenden, Löschen.
- **Persistenz**: localStorage — Daten (`…-data-v1`), Anordnung (`…-layout-v1`),
  Ansicht (`…-view-v1`), aufgeklappte Balken (`…-open-v1`).
- **Daten aus dem alten Tool**: `js/model.js` ist in beiden Projekten byte-identisch, die
  Übernahme braucht deshalb **keine Umwandlung**. Der Datensatz vom 19. Juli
  (`data/zeitleiste.json`: 36 Personen, 43 Ereignisse — davon **23 Bereiche mit Enddatum** —,
  6 Kategorien, 12 Unterkategorien, 3 Quellen) lädt der Knopf „Aus altem Tool laden".
  Die im Datensatz gespeicherte Zeile (`lane`) wird übernommen, damit die im alten Tool von Hand
  gemachte Anordnung erhalten bleibt; „Layout zurücksetzen" packt bewusst wieder automatisch.
  Einen **neueren** Stand holt man sich über `⬇ Export` im alten Tool und `⬆ Import` hier.
- **`fit()` zielt auf den dichtesten Bereich**, wenn die Lesbarkeitsgrenze greift — bei einer
  Spanne von 500 bis 2022 landet die geometrische Mitte sonst im leeren Mittelalter. Ist die
  Bühne beim Aufruf noch ohne Größe, wird das Einpassen vorgemerkt und nachgeholt.
- **Datenmodell** (`js/model.js`, aus altem Tool übernommen, **unverändert**): items (person/event),
  categories, **subcategories**, connections, **sources** (+ refs), meta, `land`, `description`.
- Konzept-Skizze: `mock-huygens.html`. Dev-Hook: `window.__tl`.

- **Eingabe ohne Geometrie** (Durchgang 3, „Hürde bei der Erfassung"): Beim Lesen hat man einen
  Namen, zwei Jahreszahlen und eine Beziehung im Kopf — aber keine Position und keine Zoomstufe.
  Deshalb nimmt die App Eingaben jetzt auch dort entgegen, wo keine Geometrie im Spiel ist:
  - **Schnellerfassung** (`N` oder `⌘K`, Knopf „＋ Person"): eine Zeile wie
    `Christiaan Huygens 1629–1695` → `js/parse.js` liest Name und Spanne heraus, `tl.addPerson()`
    legt an, sortiert ins Personen-Band ein und **springt hin**. Erkannt werden auch
    `*1629 †1695`, `1815 bis 1852`, `4.1.1643 – 31.3.1727`, `(1685–1750)` und ein einzelnes Jahr.
    Eine Vorschauzeile sagt vor dem Enter, was ankommt.
  - **Tolerante Datumsfelder**: `parseDatum()` schluckt `um 1630`, `ca. 1630`, `1629?`,
    `14.4.1629`, `14. April 1629`, `April 1629`, `heute`. Das Verstandene wird ins Feld
    zurückgeschrieben; Unverstandenes bleibt stehen und wird rot, ohne Daten zu zerstören.
  - **Suche mit Sprung** (`⌘F`), **Quelle/Seite** als Freitext an Eintrag *und* Verbindung
    (`beleg`, in `normalize()` durchgereicht — Platzhalter bis A4 steht).
  - **Jahresanzeige am Cursor** beim Ziehen einer Verbindung: dass die Waagerechte das Datum
    bestimmt, war vorher unsichtbar (man zielte auf 1675 und bekam 1677).
  - **`ensureVisible()`**: ändert ein Datum die Spanne so, dass der Balken aus dem Bild läuft,
    zieht die Ansicht nach, statt ihn verschwinden zu lassen.
  - **Werkzeugleiste**: „＋ Person" vorn, Import/Export/Übernahme/Layout/Beispiel-Daten hinter `⋯`.
  - **Hinweis-Kasten** wegklickbar und nach dem ersten selbst angelegten Eintrag von selbst weg.
  - **`E` / Leertaste** klappt den ausgewählten Balken auf — der Pfeil auf der Leinwand ist bei
    kleinem Zoom kaum zu treffen (siehe offener Punkt unten).

### Farben / späteres Erscheinungsbild
Alle Leinwand-Farben liegen als CSS-Variablen in `:root` (`--tl-accent`, `--tl-paper`, `--tl-grid` …).
Ein Wechsel auf „Bronze & Papier", hell oder dunkel ist damit ein Satz Variablen — kein JS-Eingriff.

## Phase A — Parität mit dem alten Tool

> **Neu priorisiert am 14. November 2026:** Phase B (Anytype) kommt vor dem Rest von Phase A.
> Quellen (A4), Kategorien (A2) und Unterkategorien pflegt man künftig in Anytype; was davon
> in der App noch nötig ist, entscheidet sich erst, wenn die Anytype-Struktur steht.

Reihenfolge grob nach Nutzen. Das Datenmodell ist da; Aufgaben = UI/Interaktion nachrüsten.

### A1 · Eintrag vollständig bearbeiten
- [x] **Beschreibung** (`description`) im Panel editierbar — und aufgeklappt auf der Leinwand sichtbar.
- [x] **Land** wählbar (Dropdown aus `COUNTRIES` in `model.js`) — im Panel unter der Kategorie.
- [ ] **Unterkategorie(n)** wählbar (`subcategoryIds`, Mehrfach; primäre bestimmt Farbe —
      `getEntryColor`). Chips wie im alten `ui.js` (primär markiert, umsortierbar).

### A2 · Kategorien & Unterkategorien verwalten
- [ ] Kategorien **anlegen / umbenennen / umfärben / löschen** (nutzt `makeCategory`, `CATEGORY_PALETTE`).
- [ ] Unterkategorien je Kategorie verwalten (`makeSubcategory`, eigene Farbe optional →
      sonst `autoSubcatColor`).
- [ ] Kleiner Verwalten-Dialog/Bereich (analog alter `ui.js`).

### A3 · Verbindungen ausbauen
- [x] Beim/nach dem Verbinden **Beschriftung** wählen: freier Text **oder** Vorgaben („las",
      „Lehrer von", „kannte", „beeinflusst", „bezieht sich auf") als Chips. Das Benennen-Feld
      (`#cedit` in `index.html`, `openConnEditor()` in `app.js`) kommt direkt nach dem Ziehen
      an der Linie hoch; Esc lässt die Verbindung bewusst unbenannt.
- [x] Verbindung **bearbeiten**: Beschriftung, beide Jahre (durch `parseDatum`) und eine
      Fundstelle. Stimmen beide Jahre überein, zieht das eine Feld das andere mit.
- [x] Verbindung durch **Klick auf die Linie** auswählen — dicke, unsichtbare Trefferfläche
      `.tl-conn-hit` über jeder Linie; die Ausgangsperson wird mit ausgewählt, damit das
      Panel den Zusammenhang zeigt.
- [x] Verbindung **aus dem Panel heraus** anlegen („＋ Beziehung …" mit Zielsuche,
      `tl.connectTo()`): beide Enden müssen **nicht** gleichzeitig im Bild sein — beim Lesen
      der Normalfall, weil die zweite Person oft noch gar nicht existiert.
- [ ] Verbindungs-**Typ** (`relation` diffus vs. `aktion` datiert) noch nicht wählbar;
      neu gezogene Verbindungen sind immer `aktion`.

### A3b · Bedienung auf der Leinwand
- [ ] **Aufklapp-Pfeil** in konstanter Bildschirmgröße (wie die Beschriftungen). Heute in
      Weltkoordinaten gezeichnet (~10 Einheiten, bei 50 % Zoom ≈ 5 px) und unter 46 Einheiten
      Balkenbreite gar nicht (`web/js/timeline-canvas.js:404`). `E`/Leertaste trifft immer.

### A4 · Quellen (Kern des Buchnotizen-Tools!)
- [ ] **Quellen verwalten** (`makeSource`, kontextuelle Felder je `kind`: Buch/Paper/Webseite …).
- [ ] Je Eintrag **Quellen-Referenzen** (`refs`: sourceId + Fundstelle `pages` + `note`).
- [ ] **Quellen-Ansicht** (analog alter `sourcesview.js`): Notizen (Markdown-light), Backlinks
      „verwendet in" (`itemsUsingSource`), „Ereignis an Quelle binden".

### A5 · Filter & Sichtbarkeit
- [ ] Filter nach **Kategorie/Unterkategorie**, **Typ** (Person/Ereignis), **Land**
      (`landsInUse`). Sichtbarkeit ein/aus (unabhängig von der Einfärbung).

### A6 · Datei & Bedienung
- [x] **Export/Import JSON** über Datei-Dialoge — Knöpfe `⬆ Import` / `⬇ Export` in der Kopfleiste,
      dazu **„Aus altem Tool laden"** (`data/zeitleiste.json`). Alles läuft durch `normalize()` in
      `store.js`, das den rohen JSON durch die Fabriken aus `model.js` schickt (migriert Altfelder
      wie `refs[].quote` → `note`) und Verbindungen ins Leere aussortiert. Ein Import ist per ⌘Z
      rückgängig zu machen.
- [x] **Suche** (Person/Ereignis nach Name) mit Sprung/Fokus — Feld in der Kopfleiste, `⌘F`,
      Pfeiltasten + Enter; Ausgeblendetes wird beim Sprung zurückgeholt.
- [x] **Undo/Redo** (⌘Z / ⌘⇧Z) — `js/history.js`.
- [x] Feinschliff: überlappende Ereignisse stapeln, kurze Balken lesbar beschriften,
      Beschriftungen kollisionsfrei setzen. (Verbindungs-Labels könnten noch besser liegen.)

### A7 · (Optional) Design angleichen
- [ ] Look an die alte App / „Bronze & Papier" annähern, falls gewünscht (aktuell eigenes,
      helles Schema).

**Definition of Done Phase A:** Ein Buch kann vollständig erfasst werden — Personen, Ereignisse
(mit/ohne Person), Kategorien/Unterkategorien, Land, Beschreibung, **Quellen mit Fundstellen**,
gerichtete datierte Verbindungen — filterbar, durchsuchbar, exportierbar; nichts geht beim
Neuladen verloren.

---

## Phase B — Anytype-Schnittstelle

- [~] **Struktur in Anytype festlegen** (gemeinsam) — Entwurf steht im Space „Zeitleiste Test“ mit dem
      kompletten Bestand (siehe STAND.md); noch nicht in „Insta“ übernommen.
      Ursprünglich:: Typen `Person`, `Ereignis`, `Beziehung`,
      `Quelle` mit Feldern (Geburt/Tod, Datum, Kategorie, from/to + Datum, Seite/Notiz …).
- [ ] **Pairing** mit Anytype-App (App-Key), lokale API erreichbar (Anytype-MCP ist auf dem Mac da).
- [ ] **Import-Adapter** (`js/anytype-import.js`): liest die Struktur, mappt auf `model.js`
      (Personen→Balken, Beziehungen→datierte Verbindungen, Quellen→sources/refs). **Einweg zuerst**
      (Anytype → App), hinter der `store.js`-Schnittstelle.
- [ ] Duplikat-/Update-Logik (stabile IDs), Vorschau vor Übernahme.
- [ ] (Später) bidirektional / periodischer Abgleich.

---

## Phase C — Echte Mac-App (Tauri) und danach iPhone

- [x] **Tauri v2** einrichten (Rust über Homebrew-`rustup`, Tauri-CLI über npm); `src-tauri/`,
      Seite nach `web/` verschoben.
- [x] Browser-Dialoge ersetzt: `web/js/native.js` (native Rückfragen, „Sichern unter …").
- [ ] **Datei-Store** statt localStorage (gleiche `load/save`-Schnittstelle; JSON, ggf. SQLite).
- [ ] Datei-**Import** über nativen Dialog (Export ist schon nativ), Menü; **Fonts offline** einbetten.
- [x] `.app` bauen (`npm run tauri build`, ~1 min, ~10 MB).
- [ ] (Bei Weitergabe) Signierung/Notarisierung — braucht Apple-Developer-Account.
- [ ] Eigenes App-Icon (derzeit das Tauri-Standard-Icon).
- [ ] (Später, eigene Phase) **iOS-Ziel** + Touch-/Responsive-Pass für die Leinwand.

---

## Architektur-Notizen (zum schnellen Wiederfinden)

- `js/model.js` — Datenmodell + Factories + Farb-/Datums-Helfer + `seedData` (aus altem Tool).
- `js/store.js` — `LocalStorageStore` (load/save/clear) + `exportJson/importJson`. **Andockpunkt**
  für Tauri-Datei-Store und Anytype-Import.
- `js/timeline-canvas.js` — die neue Engine (`TimelineCanvas`). Kapselt Rendering + Interaktion;
  könnte bei sehr großen Datenmengen später auf Canvas/Konva umgestellt werden.
- `js/app.js` — Bootstrap, Info-Panel, Persistenz, Toolbar, Tastatur, Verlauf-Anbindung.
- `js/history.js` — Undo/Redo über Schnappschüsse (Daten + Anordnung).
- `index.html` / `css/proto.css` — Seite & Styles. `serve.py` — No-Cache-Dev-Server.
- Referenz altes Tool: `~/Documents/PKM-Tool/` (Quelle für Quellen-/Filter-/Kategorie-UI-Ideen:
  `js/ui.js`, `js/filters.js`, `js/sourcesview.js`, `js/groupbar.js`).
