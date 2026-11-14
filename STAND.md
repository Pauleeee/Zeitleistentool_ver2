# Stand — Übergabe für morgen

*Zuletzt bearbeitet: 14. November 2026. Die vollständige Aufgabenliste steht in
[AUFGABEN.md](AUFGABEN.md); dieses Blatt ist nur der Faden zum Weitermachen.*

---

## Neu am 14. November: Git, Mac-App, neue Richtung

**Git.** Das Projekt ist jetzt versioniert und liegt auf GitHub: `Pauleeee/Zeitleistentool_ver2`.

**Die Mac-App-Hülle steht.** `npm run tauri build` baut in gut einer Minute
`src-tauri/target/release/bundle/macos/Zeitleiste.app` (~10 MB). Dafür:
- Die Seite liegt jetzt in **`web/`** (index.html, css, js, data). `serve.py` liefert `web/` aus.
- **Rust** ist über Homebrew installiert (`rustup`, keg-only). Damit `cargo`/`rustc` im Terminal
  gefunden werden, gehört in `~/.bash_profile`:
  `export PATH=/opt/homebrew/opt/rustup/bin:$PATH`
- Das App-Fenster kennt die Browser-Dialoge nicht (`confirm` sagte stumm „Nein", Export legte
  keine Datei ab). Neu: **`web/js/native.js`** — in der App echte Mac-Dialoge und
  „Sichern unter …", im Browser alles wie vorher.
- Die App hat ihren **eigenen Speicher**. Beim ersten Start stehen Beispiel-Daten drin →
  ⋯ → „Aus altem Tool laden".
- **Nicht in der App selbst geprüft**: die nativen Dialoge (ich konnte keinen Bildschirm
  aufnehmen). Im Browser ist der Weg über `native.js` getestet.

**Neue Richtung (Entscheidung des Nutzers):** Die App soll eine **Leinwand über den
Anytype-Daten** werden, nicht ein zweites Datenhaltungs-Tool. Deshalb kommt **Phase B vor dem
Rest von Phase A**: Quellen, Kategorien und Unterkategorien pflegt man dann in Anytype; die App
merkt sich nur Anordnung, Aufklappen und Ansicht. Bestandsaufnahme in Anytype (14. Nov.):
Space **„Insta"** hat schon die Typen **Buch** (Autor, Erschienen, Stichwörter, Verlag …) und
**Autor**. Person, Ereignis und Beziehung gibt es noch nicht.

---

## Was zuletzt dazugekommen ist: Eingeben, ohne zu zielen

Der Durchgang davor hat die Leinwand lesbar gemacht. Dieser hat die **Hürde bei der Erfassung**
weggeräumt. Der Auslöser war ein Durchspielen aus der Sicht eines neuen Anwenders: „Ich lese ein
Buch, stoße auf Christiaan Huygens und will ihn anlegen und mit Newton verbinden." Das hat vorher
elf Interaktionen gebraucht, die Person sprang nach dem Tippen der Jahreszahlen aus dem Bild, und
am Ende stand eine namenlose Linie, die man nicht anklicken konnte.

**1 · Schnellerfassung.** `N` (oder `⌘K`, oder der Knopf **＋ Person**) öffnet ein Feld. Eine
Zeile genügt:

```
Christiaan Huygens 1629–1695
```

Enter — Person angelegt, ins Personen-Band einsortiert, **Ansicht springt hin**, der Fokus steht
in der Beschreibung. Erkannt werden auch `*1629 †1695`, `1815 bis 1852`,
`4.1.1643 – 31.3.1727`, `(1685–1750)` und ein einzelnes Jahr. Eine Vorschauzeile sagt vor dem
Enter, was ankommen wird.

**2 · Verbindungen sind jetzt Gegenstände, keine Deko.**
- **Klick auf die Linie** wählt sie aus (dicke unsichtbare Trefferfläche über jeder Linie).
- Direkt nach dem Ziehen kommt **an der Linie** ein Feld hoch: Vorgaben zum Antippen
  (las · Lehrer von · kannte · beeinflusst · bezieht sich auf), freier Text, **beide Jahre**
  und eine Fundstelle. Esc lässt sie bewusst unbenannt.
- **„＋ Beziehung …" im Panel** mit Zielsuche: beide Enden müssen **nicht** gleichzeitig im Bild
  sein. Beim Lesen ist genau das der Normalfall.
- Beim Ziehen zeigt ein Schild am Cursor **die Jahreszahl** — vorher zielte man auf 1675 und
  bekam 1677, ohne es zu merken.

**3 · Nichts geht mehr verloren.** Ändert ein Datum die Spanne so, dass der Balken aus dem Bild
läuft, zieht die Ansicht nach (`ensureVisible`). Nach dem Verbinden bleibt die Ausgangsperson
ausgewählt, das Panel zeigt die neue Beziehung. Und es gibt eine **Suche mit Sprung** (`⌘F`,
Pfeiltasten + Enter), die Ausgeblendetes gleich zurückholt.

**4 · Kleinigkeiten mit großer Wirkung.**
- Datumsfelder schlucken `um 1630`, `ca. 1630`, `1629?`, `14.4.1629`, `April 1629`, `heute`.
  Das Verstandene wird ins Feld zurückgeschrieben (man sieht, was ankam); Unverstandenes bleibt
  stehen und wird rot, ohne die Daten anzufassen.
- **Land** ist im Panel wählbar (die Daten bringen es längst mit, es war nur unsichtbar).
- **Quelle / Seite** als Freitext an Eintrag *und* Verbindung — der Platzhalter, bis die
  richtige Quellenverwaltung (A4) steht. Beim Lesen will man genau das festhalten.
- Werkzeugleiste: **＋ Person** vorn; Import, Export, „Aus altem Tool laden", „Layout
  zurücksetzen" und „Alles verwerfen" hinter **⋯**.
- Der Hinweis-Kasten ist wegklickbar und verschwindet nach dem ersten eigenen Eintrag.
- **`E` / Leertaste** klappt den ausgewählten Balken auf.

---

## Anytype-Probe (14. November): Space „Zeitleiste Test"

Entscheidungen des Nutzers: Ziel-Space ist **„Insta"** (dort liegen die Bücher; Anytype verknüpft
nur innerhalb eines Space). **Person** ist ein eigener Typ, **Autor** bleibt wie er ist. Der
Bestand wird übernommen — zuerst probeweise in den separaten Space **„Zeitleiste Test"**.

Dort liegt jetzt der komplette Stand vom 19. Juli: **36 Personen, 43 Ereignisse, 3 Beziehungen,
3 Bücher, 3 Autoren** (Rückverweise geprüft, z. B. „Power" ← 11 Einträge).

| Typ | Felder |
|---|---|
| Person 👤 | Geboren, Gestorben (Datum) · Zeitangabe (Text) · Land, Kategorie (Auswahl) · Themen (Mehrfach) · Quelle (→ Buch) · Seite · Beschreibung = Text des Objekts |
| Ereignis 📍 | Beginn, Ende (Datum; Ende leer = Ereignis, gefüllt = Bereich) · Zeitangabe · **Person** (→ Person, leer = freistehend) · Land, Kategorie, Themen, Quelle, Seite |
| Beziehung 🔗 | Von, Nach (→ Person/Ereignis) · Art (las, Lehrer von, kannte, beeinflusst, bezieht sich auf, gerichtet an, verbunden) · Datum · Zeitangabe · Quelle, Seite |
| Buch 📖 / Autor ✍️ | wie in „Insta" (Autor, Erschienen, Verlag, ISBN) |

Kategorien und Themen tragen **Anytype-Farben** (Wissenschaft blau, Politik rot, Kunst orange,
Natur lime, Gesellschaft lila, Wirtschaft ice) — die App kann sie für die Balken übernehmen.

**Datumstest** (per API, Testseiten danach gelöscht):
- `1643-01-04` und `0800-12-25` kommen unverändert zurück.
- **v. Chr. wird abgelehnt** (`invalid date format`).
- Ein **reines Jahr** kennt Anytype nicht — nur ganze Tage.

Daraus die Regel: **Datumsfeld** (sortierbar) **plus optionale „Zeitangabe"** als Text, die nur
gefüllt ist, wenn das Datum ungenau ist oder noch läuft (`1400 – 1468`, `2019-12 – 2023-05`,
`1954-07-17 – heute`). Die App liest die Zeitangabe zuerst (mit `parseDatum`), sonst die
Datumsfelder. Ungenaue Jahre stehen im Datumsfeld als 1. Januar.

**Beim Übertragen bereinigt:** Giulio de' Medici „1478-05-56" → 26. Mai; Thomas Bayes
„1761-04-1761" → Zeitangabe „1701 – 1761"; „100 Tage Herrschaft" Ende „1815" lag vor dem Beginn →
Datumsfeld 31.12.1815, Zeitangabe „1815-03-20 – 1815".

**Aufgefallen, offen für den Nutzer:** viele gleichnamige Einträge („Bundeskanzler" ×10,
„König von Frankreich" ×3) sind in Anytype-Listen schwer zu unterscheiden; „brenton Wood"
(= Bretton Woods), „Oberbürgermeiseter"; Autor „Gabor, Steinhart" (in „Insta": „Steingart, Babor").
Im Space liegt noch die Test-Eigenschaft „Testdatum".

---

## Wo ich weitermachen würde — in dieser Reihenfolge

1. **Struktur im Space „Zeitleiste Test" ansehen** (Nutzer) und anpassen; danach dieselbe
   Struktur in **„Insta"** anlegen und den Bestand dorthin übertragen.
2. **Lese-Brücke** (B2/B3): API-Schlüssel in Anytype erzeugen, `web/js/anytype-import.js` hinter
   `store.js`. In der Mac-App laufen die Anfragen über Rust, damit der Browser sie nicht blockiert.
3. Erst danach, falls dann noch nötig: Aufklapp-Pfeil in fester Größe, Verbindungs-Typ, Filter.

---

## Offene Kleinigkeiten und Vorbehalte

- **⌘Z, ⌘D, ⌘F und ⌘K sind nicht mit echter Tastatur geprüft** — die Browser-Steuerung liefert
  die Cmd-Taste nicht durch. Verifiziert wurden sie über ausgelöste Tastatur-Ereignisse; die
  Handler sind gewöhnlich, aber probier es bitte einmal selbst.
- **Verbindungs-Beschriftungen** liegen manchmal ungünstig (mitten im Balken). Kosmetisch.
- **`beleg` ist Freitext**, nicht die Quellenverwaltung. Er wird in `normalize()` mit
  durchgereicht (wie `hidden` und `fromDate`), damit Export/Import ihn nicht verlieren —
  `model.js` blieb dafür unangetastet.
- **Erscheinungsbild** ist bewusst noch neutral. Alle Leinwand-Farben liegen als CSS-Variablen
  in `:root` (`--tl-accent`, `--tl-paper`, `--tl-grid` …) — die Wahl zwischen „Bronze & Papier",
  hell und dunkel ist damit ein Satz Variablen, kein JS-Eingriff (A7).
- **`data/zeitleiste.json` ist eine Kopie vom 19. Juli.** Sie wird beim Klick auf „Aus altem
  Tool laden" gelesen, aber nie geschrieben — der Arbeitsstand liegt in localStorage.

## Entscheidungen, die feststehen (nicht versehentlich umdrehen)

- Personen sind **nicht** frei horizontal verschiebbar — sonst „wird die Zeit falsch".
- Positionen bleiben **frei** (keine erzwungene Zeilenordnung); beim Aufklappen weichen
  Nachbarn nur **temporär** aus und springen exakt zurück.
- Ausblenden geht über **Auswahl + ⌘D**, nicht per Doppelklick — der Doppelklick gehört dem
  Anlegen.
- Beim Aufklappen ist der Platz im Balken **fest** und die Schrift konstant groß: es erscheint
  so viel, wie beim aktuellen Zoom hineinpasst. Reinzoomen zeigt mehr Zeilen.
- Eine frisch gezogene Verbindung darf **namenlos bleiben** (Esc). Das Benennen-Feld ist ein
  Angebot, keine Pflicht — sonst wäre die schnelle Geste wieder ausgebremst.

---

## Dateien

| Datei | Rolle |
|---|---|
| `js/timeline-canvas.js` | die Engine: drei Ebenen, Geometrie, alle Gesten, `addPerson`, `connectTo`, `ensureVisible` |
| `js/app.js` | Bootstrap, Info-Panel, Schnellerfassung, Suche, Beziehungs-Feld, Tastatur, Persistenz |
| `js/parse.js` | **neu** — `parseDatum()` und `parseZeile()`: getippter Text → Datenformat |
| `js/store.js` | localStorage, `exportJson`/`importJson`, **`normalize()`** |
| `js/history.js` | Undo/Redo über Schnappschüsse (Daten + Anordnung) |
| `js/model.js` | Datenmodell — **byte-identisch mit dem alten Tool**, nicht anfassen |
| `index.html`, `css/proto.css` | Seite und Farb-Variablen |
| `data/zeitleiste.json` | Datenstand aus dem alten Tool (19. Juli) |

Dev-Hook: `window.__tl` (z. B. `__tl.fit()`, `__tl.data`, `__tl.view`).
localStorage-Schlüssel: `zeitleiste-proto-data-v1`, `-layout-v1`, `-view-v1`, `-open-v1`,
`-hint-weg-v1`.
