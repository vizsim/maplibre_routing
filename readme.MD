# MapLibre GraphHopper Routing

Eine interaktive Web-Anwendung für Routenplanung mit GraphHopper-Integration, Höhenprofil-Visualisierung und Kontext-Layern für Radinfrastruktur und Mapillary-Abdeckung.

---

## Features

### 🗺️ Routing
- **Multi-Profile Routing**: Unterstützung für verschiedene Verkehrsmittel (Auto, Fahrrad, etc.)
- **Interaktive Routenplanung**: Start- und Endpunkt per Klick oder Geocoding setzen
- **Route-Visualisierung**: Farbcodierte Darstellung basierend auf verschiedenen Attributen:
  - Mapillary Coverage (Abdeckung mit Street View Fotos)
  - Surface (Oberflächenbeschaffenheit)
  - Road Class (Straßenklasse)
- **Höhenprofil**: Interaktives Höhenprofil mit Hover-Funktionalität
- **GPX-Export**: Export berechneter Routen als GPX-Datei

### 📊 Höhenprofil
- **Interaktive Visualisierung**: Canvas-basierte Darstellung des Höhenprofils
- **Encoded Values Overlay**: Darstellung verschiedener Route-Attribute im Höhenprofil
- **Hover-Integration**: Synchronisierte Hover-Indikatoren zwischen Karte und Höhenprofil
- **Responsive Design**: Automatische Anpassung an Container-Breite

### 🚴 Kontext-Layer
- **Radinfrastruktur**: Visualisierung von Radwegen und Radinfrastruktur aus OpenStreetMap
- **Mapillary Missing Streets**: Anzeige von Straßen mit fehlenden oder ausreichenden Mapillary-Fotos
- **Toggle-Funktionalität**: Ein-/Ausschalten der Layer über Checkboxen

### 🔗 Permalink
- **Vollständige State-Speicherung**: Alle Einstellungen werden in der URL gespeichert:
  - Kartenposition und Zoom
  - Start- und Endpunkt
  - Routing-Profil
  - Encoded Value Auswahl
  - Aktivierte Kontext-Layer
- **Teilbare URLs**: Einfaches Teilen von Routen und Konfigurationen

---

## Technische Details

### Framework & Bibliotheken
- **MapLibre GL JS** (v5.6.0): Kartenvisualisierung
- **GraphHopper Routing API**: Routenberechnung
- **Photon Geocoder**: Adresssuche und Geocoding


### Datenquellen
- **GraphHopper API**: Routenberechnung und Elevation-Daten
- **OpenStreetMap**: Basiskartendaten
- **FixMyCity** / **tilda-geo.de**: Vektortiles für Radinfrastruktur
- **OSM Verkehrswende**: Mapillary Missing Streets Daten
- **MapTiler** (optional): Hillshade und Terrain-Daten
- **Sonny's Terrain Models**: Höhenmodelle für Elevation-Daten (CC BY 4.0) - [sonny.4lima.de](https://sonny.4lima.de)

---



## Projektstruktur

```
maplibre_routing/
├── index.html              # Haupt-HTML-Datei
├── main.js                 # Haupt-Initialisierung
├── style.css               # Stylesheet
├── style.json              # MapLibre Style-Konfiguration
├── js/
│   ├── routing/            # Routing-Module
│   │   ├── routing.js      # Haupt-Routing-Logik
│   │   ├── routingUI.js   # UI-Handler
│   │   ├── routeState.js   # State Management
│   │   ├── routeVisualization.js  # Route-Farben & Hover
│   │   ├── heightgraph.js  # Höhenprofil-Visualisierung
│   │   ├── colorSchemes.js # Farb-Schemas
│   │   └── gpxExport.js    # GPX-Export
│   ├── ui/                 # UI-Komponenten
│   └── utils/              # Utilities
│       ├── permalink.js    # Permalink-Funktionalität
│       └── geocoder.js    # Geocoding
└── thumbs/                 # Thumbnails für Basemaps
```

---


## Lizenz

[Lizenz hier angeben]

---

## Credits

- **MapLibre GL JS**: Open-Source Kartenbibliothek
- **GraphHopper**: Open-Source Routing-Engine
- **OpenStreetMap**: Community-getriebene Kartendaten
- **Mapillary**: Street View Fotos und Coverage-Daten
- **FixMyCity** / **tilda-geo.de**: Vektortiles für Radinfrastruktur - [tilda-geo.de](https://tilda-geo.de)
- **OSM Verkehrswende**: Mapillary Missing Streets Daten - [osm-verkehrswende.org](https://www.osm-verkehrswende.org)
- **Sonny's Terrain Models**: Höhenmodelle (CC BY 4.0) - [sonny.4lima.de](https://sonny.4lima.de)


