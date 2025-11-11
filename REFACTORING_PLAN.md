# Refactoring Plan für maplibre_routing

## Priorität 1: routing.js aufteilen (1899 Zeilen → ~300-400 Zeilen pro Modul)

### Neue Struktur:
```
js/routing/
  ├── routing.js          (Core: API calls, route calculation, state)
  ├── routingUI.js         (UI handlers: buttons, inputs, markers)
  ├── heightgraph.js      (Höhenprofil: canvas drawing, interactivity)
  ├── routeVisualization.js (Route styling: colors, hover, custom_present)
  └── gpxExport.js        (GPX export functionality)
```

### Vorteile:
- Bessere Wartbarkeit
- Einfachere Tests
- Klarere Verantwortlichkeiten
- Kleinere Dateien sind leichter zu navigieren

---

## Priorität 2: Layer-Definitionen auslagern

### Neue Struktur:
```
js/mapdata/
  ├── bikeLanes.js        (Bike lanes layers + toggle logic)
  ├── missingStreets.js   (Missing streets layers + toggle logic)
  └── baseLayers.js      (Satellite, Hillshade, Terrain)
```

### Vorteile:
- main.js wird kleiner und übersichtlicher
- Layer-Logik ist isoliert
- Einfacher neue Layer hinzuzufügen

---

## Priorität 3: State Management

### Neue Datei:
```
js/state/routeState.js
```

### Vorteile:
- Zentrale Verwaltung des Route-States
- Keine globalen Variablen mehr
- Einfacher zu debuggen

---

## Priorität 4: Konstanten extrahieren

### Neue Datei:
```
js/config/constants.js
```

### Enthält:
- Layer-IDs
- Farben
- API-URLs
- Magic Numbers

---

## Priorität 5: Code-Bereinigung

- Kommentierte Code-Blöcke entfernen
- Unused imports entfernen
- Konsistente Code-Formatierung

