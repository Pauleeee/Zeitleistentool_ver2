# Stand — Übergabe für morgen

*Zuletzt bearbeitet: 8. September 2026. Die vollständige Aufgabenliste steht in
[AUFGABEN.md](AUFGABEN.md); dieses Blatt ist nur der Faden zum Weitermachen.*

---

## Zuerst: das Wichtigste

**Deine echten Daten sind womöglich noch nicht in deinem Browser.** Die Übernahme ist bisher
nur im Vorschau-Browser getestet worden — steht bei dir noch „Isaac Newton, Galileo Galilei,
Johannes Kepler …", dann passt es; stehen dort vier Beispiel-Personen, fehlt der Schritt noch.

```bash
cd "/Users/aph-admin/Documents/Zeitleiste zweiter Versuch" && python3 serve.py 8091
```

Dann [http://localhost:8091](http://localhost:8091) öffnen und im **⋯-Menü** auf
**„Aus altem Tool laden"** klicken. Danach stehen 36 Personen und 43 Ereignisse drin.

> Falls du im alten Tool seit dem 19. Juli weitergearbeitet hast: dort **⬇ Export**, hier
> **⬆ Import** (ebenfalls im ⋯-Menü) — das ist der aktuellere Weg. Die Datei
> `data/zeitleiste.json` ist der Stand vom 19. Juli.

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

## Wo ich weitermachen würde — in dieser Reihenfolge

1. **Aufklapp-Pfeil auf der Leinwand.** Er ist in Weltkoordinaten gezeichnet (~10 Einheiten),
   bei 50 % Zoom also rund 5 Bildschirmpixel, und bei Balken schmaler als 46 Einheiten wird er
   gar nicht gezeichnet. Die Tastatur (`E`) trifft ihn jetzt immer — der Pfeil selbst sollte
   aber konstante Größe bekommen wie die Beschriftungen.
2. **Unterkategorien** (A1, letzter offener Punkt): `subcategoryIds`, Mehrfachauswahl, die
   primäre bestimmt die Farbe (`getEntryColor`). Deine Daten bringen 12 mit, die im Panel noch
   nirgends auftauchen. Land ist erledigt.
3. **A4 — Quellen.** Der Kern des Buchnotizen-Tools und der größte fachliche Rest: `makeSource`,
   `refs` (sourceId + Fundstelle + Notiz), Quellen-Ansicht mit Backlinks. Das Freitextfeld
   `beleg` ist nur die Brücke dorthin und sollte beim Ausbau in echte `refs` überführt werden.
4. **A2** (Kategorien verwalten), **A5** (Filter). Dann Phase B (Anytype) und C (Tauri).
5. Verbindungs-**Typ** wählbar machen (`relation` diffus vs. `aktion` datiert) — neu gezogene
   sind derzeit immer `aktion`.

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
