// 📦 Routing
import { setupRouting } from './js/routing/routing.js';

// 📦 UI & Interaktion
import { setupBaseLayerControls } from './js/ui/setupBaseLayerControls.js';

// 📦 Geocoder
import { setupPhotonGeocoder } from './js/utils/geocoder.js';

// 📦 Permalink
import { setupPermalink } from './js/utils/permalink.js';

let MAPTILER_API_KEY = '';

const isLocalhost = location.hostname === "localhost";

// Set thumbnail background images (wait for DOM to be ready)
function setupThumbnails() {
  const standardThumb = document.querySelector('[data-map="standard"]');
  const satelliteThumb = document.querySelector('[data-map="satellite"]');
  if (standardThumb) {
    standardThumb.style.backgroundImage = "url('./thumbs/thumb-standard.png')";
  }
  if (satelliteThumb) {
    satelliteThumb.style.backgroundImage = "url('./thumbs/thumb-satellite.png')";
  }
}

// Set thumbnails when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupThumbnails);
} else {
  setupThumbnails();
}

(async () => {
  try {
    const config = await import(isLocalhost ? './js/config/config.js' : './js/config/config.public.js');
    ({ MAPTILER_API_KEY } = config);
    console.log(`🔑 ${isLocalhost ? "Lokale config.js" : "config.public.js"} geladen`);

    initMap();

  } catch (err) {
    console.error("❌ Konfig konnte nicht geladen werden:", err);
    // Fallback: ohne API Key starten
    initMap();
  }
})();

async function initMap() {
  // Load pmtiles protocol
  const pmtilesBaseURL = "https://f003.backblazeb2.com/file/nettobreite/";
  const protocol = new pmtiles.Protocol(name => `${pmtilesBaseURL}${name}`);
  maplibregl.addProtocol("pmtiles", protocol.tile);

  window.map = new maplibregl.Map({
    container: "map",
    style: "./style.json",
    center: [13.42113, 52.47676], // Default center (Berlin)
    zoom: 12,                  // Default zoom
    minZoom: 9,
    maxZoom: 20
  });

  // Setup permalink functionality (reads URL params and updates URL on map move)
  setupPermalink(map);

  map.on("load", () => {
    initializeMapModules(map);
    setupUI(map);
    setupRouting(map);
  });
}


function addNavigationControl(map) {
  const nav = new maplibregl.NavigationControl();

  const customNavContainer = document.getElementById("custom-nav-control");
  if (customNavContainer) {
    customNavContainer.appendChild(nav.onAdd(map));

    // Kompass-Reset aktivieren
    setTimeout(() => {
      const compass = customNavContainer.querySelector('.maplibregl-ctrl-compass');
      if (compass) {
        compass.addEventListener('click', () => {
          map.setPitch(0);
          map.easeTo({ bearing: 0 });
        });
      }
    }, 100);
  }
}

function setupUI(map) {
  setupBaseLayerControls(map, { value: true });
}

function initializeMapModules(map) {
  setupPhotonGeocoder(map);
  addNavigationControl(map);
  addBasicSources(map);
  addBasicLayers(map);
}

function addBasicSources(map) {
  // Raster: Satellite ESRI
  map.addSource("satellite", {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    ],
    tileSize: 256,
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });

  // Raster: Hillshade
  if (MAPTILER_API_KEY) {
    map.addSource("hillshade", {
      type: "raster",
      url: `https://api.maptiler.com/tiles/hillshades/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256,
      attribution: "© MapTiler"
    });
    
    // Raster-DEM: Terrain
    map.addSource("terrain", {
      type: "raster-dem",
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
      tileSize: 256,
      encoding: "mapbox",
      attribution: "© MapTiler"
    });
  }

  // Bike lanes source
  map.addSource("bike-lanes", {
    type: "vector",
    tiles: [
      "https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}"
    ],
    minzoom: 9,
    maxzoom: 22
  });

  // Mapillary missing streets sources (3 sources combined)
  // Source 1: Roads
  map.addSource("mapillary-roads", {
    type: "vector",
    tiles: [
      "https://tiles.tilda-geo.de/atlas_generalized_roads/{z}/{x}/{y}"
    ],
    minzoom: 9,
    maxzoom: 22
  });
  
  // Source 2: Bike lanes (reused from bike-lanes, but with different styling)
  // Note: bike-lanes source is already added above
  
  // Source 3: Road path classes
  map.addSource("mapillary-roadspathclasses", {
    type: "vector",
    tiles: [
      "https://tiles.tilda-geo.de/atlas_generalized_roadspathclasses/{z}/{x}/{y}"
    ],
    minzoom: 9,
    maxzoom: 22
  });
}

function addBasicLayers(map) {
  // Raster layers
  map.addLayer({
    id: "satellite-layer",
    type: "raster",
    source: "satellite",
    layout: { visibility: "none" }
  });

  // Hillshade layer
  if (map.getSource("hillshade")) {
    map.addLayer({
      id: "hillshade-layer",
      type: "raster",
      source: "hillshade",
      layout: { visibility: "none" },
      paint: {
        "raster-opacity": 0.3
      }
    });
  }

  // Add bike lanes layers
  addBikeLanesLayers(map);

  // Add missing streets layers
  addMissingStreetsLayers(map);

  // Disable terrain initially
  map.setTerrain(null);
}

function addMissingStreetsLayers(map) {
  // Check if all sources are loaded
  if (!map.getSource("mapillary-roads") || !map.getSource("bike-lanes") || !map.getSource("mapillary-roadspathclasses")) {
    // Sources not loaded yet, try again after a delay
    setTimeout(() => {
      if (map.getSource("mapillary-roads") && map.getSource("bike-lanes") && map.getSource("mapillary-roadspathclasses")) {
        addMissingStreetsLayers(map);
      }
    }, 1000);
    return;
  }

  // Layer für fehlende Fotos (rosa) - aus roadsPathClasses (vorerst ausgeschaltet)
  // map.addLayer({
  //   id: 'missing-streets-missing-pathclasses',
  //   type: 'line',
  //   source: 'mapillary-roadspathclasses',
  //   'source-layer': 'roadsPathClasses',
  //   minzoom: 9,
  //   maxzoom: 22,
  //   layout: { visibility: 'none' },
  //   paint: {
  //     'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
  //     'line-color': '#e91e63',
  //     'line-opacity': 0.7,
  //   },
  //   filter: [
  //     'any',
  //     ['==', ['get', 'mapillary_coverage'], 'missing'],
  //     ['!', ['has', 'mapillary_coverage']],
  //     ['==', ['get', 'mapillary_coverage'], '']
  //   ],
  // });

  // Layer für fehlende Fotos (rosa) - aus roads
  map.addLayer({
    id: 'missing-streets-missing-roads',
    type: 'line',
    source: 'mapillary-roads',
    'source-layer': 'roads',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#e91e63',
      'line-opacity': 0.7,
    },
    filter: [
      'any',
      ['==', ['get', 'mapillary_coverage'], 'missing'],
      ['!', ['has', 'mapillary_coverage']],
      ['==', ['get', 'mapillary_coverage'], '']
    ],
  });

  // Layer für fehlende Fotos (rosa) - aus bikelanes
  map.addLayer({
    id: 'missing-streets-missing-bikelanes',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#e91e63',
      'line-opacity': 0.7,
    },
    filter: [
      'any',
      ['==', ['get', 'mapillary_coverage'], 'missing'],
      ['!', ['has', 'mapillary_coverage']],
      ['==', ['get', 'mapillary_coverage'], '']
    ],
  });

  // Layer für regular Fotos (blau) - aus roadsPathClasses (vorerst ausgeschaltet)
  // map.addLayer({
  //   id: 'missing-streets-regular-pathclasses',
  //   type: 'line',
  //   source: 'mapillary-roadspathclasses',
  //   'source-layer': 'roadsPathClasses',
  //   minzoom: 9,
  //   maxzoom: 22,
  //   layout: { visibility: 'none' },
  //   paint: {
  //     'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
  //     'line-color': '#0098f0',
  //     'line-opacity': 0.7,
  //   },
  //   filter: [
  //     '==', ['get', 'mapillary_coverage'], 'regular'
  //   ],
  // });

  // Layer für regular Fotos (blau) - aus roads
  map.addLayer({
    id: 'missing-streets-regular-roads',
    type: 'line',
    source: 'mapillary-roads',
    'source-layer': 'roads',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#0098f0',
      'line-opacity': 0.7,
    },
    filter: [
      '==', ['get', 'mapillary_coverage'], 'regular'
    ],
  });

  // Layer für regular Fotos (blau) - aus bikelanes
  map.addLayer({
    id: 'missing-streets-regular-bikelanes',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#0098f0',
      'line-opacity': 0.7,
    },
    filter: [
      '==', ['get', 'mapillary_coverage'], 'regular'
    ],
  });

  // Layer für Panorama-Fotos (dunkelblau) - aus roadsPathClasses (vorerst ausgeschaltet)
  // map.addLayer({
  //   id: 'missing-streets-pano-pathclasses',
  //   type: 'line',
  //   source: 'mapillary-roadspathclasses',
  //   'source-layer': 'roadsPathClasses',
  //   minzoom: 9,
  //   maxzoom: 22,
  //   layout: { visibility: 'none' },
  //   paint: {
  //     'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
  //     'line-color': '#174ed9',
  //     'line-opacity': 0.7,
  //   },
  //   filter: [
  //     '==', ['get', 'mapillary_coverage'], 'pano'
  //   ],
  // });

  // Layer für Panorama-Fotos (dunkelblau) - aus roads
  map.addLayer({
    id: 'missing-streets-pano-roads',
    type: 'line',
    source: 'mapillary-roads',
    'source-layer': 'roads',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#174ed9',
      'line-opacity': 0.7,
    },
    filter: [
      '==', ['get', 'mapillary_coverage'], 'pano'
    ],
  });

  // Layer für Panorama-Fotos (dunkelblau) - aus bikelanes
  map.addLayer({
    id: 'missing-streets-pano-bikelanes',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.5, 15, 2],
      'line-color': '#174ed9',
      'line-opacity': 0.7,
    },
    filter: [
      '==', ['get', 'mapillary_coverage'], 'pano'
    ],
  });
}

function addBikeLanesLayers(map) {
  if (!map.getSource("bike-lanes")) return;

  // Needs clarification
  map.addLayer({
    id: 'bike-lanes-needsClarification',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-color': '#a97bea',
      'line-dasharray': [2.5, 0.5],
    },
    filter: ['match', ['get', 'category'], ['needsClarification'], true, false],
  });

  // Gehweg Rad frei
  map.addLayer({
    id: 'bike-lanes-gehweg',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-dasharray': [2, 2],
      'line-color': '#9fb9f9',
      'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, -1],
    },
    filter: [
      'match',
      ['get', 'category'],
      [
        'footwayBicycleYes_isolated',
        'pedestrianAreaBicycleYes',
        'footwayBicycleYes_adjoining',
        'footwayBicycleYes_adjoiningOrIsolated',
      ],
      true,
      false,
    ],
  });

  // Fuehrung mit Kfz-explizit
  map.addLayer({
    id: 'bike-lanes-kfz',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-dasharray': [3, 1],
      'line-color': '#0098f0',
      'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, -1],
    },
    filter: [
      'match',
      ['get', 'category'],
      [
        'sharedMotorVehicleLane',
        'bicycleRoad_vehicleDestination',
        'sharedBusLaneBusWithBike',
        'sharedBusLaneBikeWithBus',
      ],
      true,
      false,
    ],
  });

  // Fuehrung mit Fussverkehr
  map.addLayer({
    id: 'bike-lanes-fussverkehr',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-dasharray': [3, 1],
      'line-color': '#174ed9',
      'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, -1],
    },
    filter: [
      'match',
      ['get', 'category'],
      [
        'footAndCyclewayShared_isolated',
        'footAndCyclewayShared_adjoining',
        'footAndCyclewayShared_adjoiningOrIsolated',
      ],
      true,
      false,
    ],
  });

  // Fuehrung eigenstaendig auf Fahrbahn
  map.addLayer({
    id: 'bike-lanes-eigenstaendig',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-color': '#0098f0',
      'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, -1],
    },
    filter: [
      'match',
      ['get', 'category'],
      [
        'cyclewayOnHighway_exclusive',
        'cyclewayOnHighwayBetweenLanes',
        'cyclewayLink',
        'crossing',
        'cyclewayOnHighway_advisory',
        'cyclewayOnHighway_advisoryOrExclusive',
      ],
      true,
      false,
    ],
  });

  // Fuehrung baul. abgesetzt von Kfz
  map.addLayer({
    id: 'bike-lanes-baulich',
    type: 'line',
    source: 'bike-lanes',
    'source-layer': 'bikelanes',
    minzoom: 9,
    maxzoom: 22,
    layout: { visibility: 'none' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 10, 1.5, 14, 2, 16, 3],
      'line-color': '#174ed9',
      'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, -1],
    },
    filter: [
      'match',
      ['get', 'category'],
      [
        'footAndCyclewaySegregated_adjoining',
        'footAndCyclewaySegregated_adjoiningOrIsolated',
        'cycleway_isolated',
        'cycleway_adjoining',
        'bicycleRoad',
        'footAndCyclewaySegregated_isolated',
        'cycleway_adjoiningOrIsolated',
        'cyclewayOnHighwayProtected',
      ],
      true,
      false,
    ],
  });
}


// Toggle logic for Hillshade and Terrain
document.addEventListener('DOMContentLoaded', () => {
  const toggleHillshade = document.getElementById('toggleHillshade');
  const toggleTerrain = document.getElementById('toggleTerrain');
  
  if (toggleHillshade) {
    toggleHillshade.addEventListener('change', (e) => {
      if (window.map && window.map.getLayer('hillshade-layer')) {
        const visibility = e.target.checked ? 'visible' : 'none';
        window.map.setLayoutProperty('hillshade-layer', 'visibility', visibility);
      }
    });
  }

  if (toggleTerrain) {
    toggleTerrain.addEventListener('change', (e) => {
      if (window.map) {
        if (e.target.checked && window.map.getSource('terrain')) {
          window.map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
        } else {
          window.map.setTerrain(null);
        }
      }
    });
  }

  // Bike lanes toggle
  const toggleBikelanes = document.getElementById('toggle-bikelanes');
  const bikelanesLegend = document.getElementById('bikelanes-legend');
  const toggleBikelanesSegment = document.getElementById('toggle-bikelanes-segment');
  const bikelanesSegmentContent = document.getElementById('bikelanes-segment-content');

  if (toggleBikelanes) {
    toggleBikelanes.addEventListener('change', (e) => {
      if (window.map) {
        const visibility = e.target.checked ? 'visible' : 'none';
        const layers = [
          'bike-lanes-needsClarification',
          'bike-lanes-gehweg',
          'bike-lanes-kfz',
          'bike-lanes-fussverkehr',
          'bike-lanes-eigenstaendig',
          'bike-lanes-baulich'
        ];
        
        layers.forEach(layerId => {
          if (window.map.getLayer(layerId)) {
            window.map.setLayoutProperty(layerId, 'visibility', visibility);
          }
        });

        // Show/hide legend
        if (bikelanesLegend) {
          bikelanesLegend.style.display = e.target.checked ? 'flex' : 'none';
        }
      }
    });
  }

  // Toggle bike lanes segment
  if (toggleBikelanesSegment && bikelanesSegmentContent) {
    toggleBikelanesSegment.addEventListener('click', () => {
      const isCollapsed = bikelanesSegmentContent.classList.contains('collapsed');
      bikelanesSegmentContent.classList.toggle('collapsed');
      const toggleBtn = toggleBikelanesSegment.querySelector('.btn-segment-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = isCollapsed ? '▼' : '▶';
      }
    });
  }

  // Missing streets toggle
  const toggleMissingStreets = document.getElementById('toggle-missing-streets');
  const missingStreetsLegend = document.getElementById('missing-streets-legend');
  const toggleMissingStreetsSegment = document.getElementById('toggle-missing-streets-segment');
  const missingStreetsSegmentContent = document.getElementById('missing-streets-segment-content');

  if (toggleMissingStreets) {
    toggleMissingStreets.addEventListener('change', (e) => {
      if (window.map) {
        const visibility = e.target.checked ? 'visible' : 'none';
        const layers = [
          // 'missing-streets-missing-pathclasses', // vorerst ausgeschaltet
          'missing-streets-missing-roads',
          'missing-streets-missing-bikelanes',
          // 'missing-streets-regular-pathclasses', // vorerst ausgeschaltet
          'missing-streets-regular-roads',
          'missing-streets-regular-bikelanes',
          // 'missing-streets-pano-pathclasses', // vorerst ausgeschaltet
          'missing-streets-pano-roads',
          'missing-streets-pano-bikelanes'
        ];
        
        layers.forEach(layerId => {
          if (window.map.getLayer(layerId)) {
            window.map.setLayoutProperty(layerId, 'visibility', visibility);
          }
        });

        // Show/hide legend
        if (missingStreetsLegend) {
          missingStreetsLegend.style.display = e.target.checked ? 'flex' : 'none';
        }
      }
    });
  }

  // Toggle missing streets segment
  if (toggleMissingStreetsSegment && missingStreetsSegmentContent) {
    toggleMissingStreetsSegment.addEventListener('click', () => {
      const isCollapsed = missingStreetsSegmentContent.classList.contains('collapsed');
      missingStreetsSegmentContent.classList.toggle('collapsed');
      const toggleBtn = toggleMissingStreetsSegment.querySelector('.btn-segment-toggle');
      if (toggleBtn) {
        toggleBtn.textContent = isCollapsed ? '▼' : '▶';
      }
    });
  }

  // Position context panel below routing panel
  const routingPanel = document.querySelector('.routing-panel');
  const contextPanel = document.querySelector('.context-panel');
  
  if (routingPanel && contextPanel) {
    const updateContextPanelPosition = () => {
      // Force a reflow to get accurate measurements
      contextPanel.style.display = 'block';
      
      const routingRect = routingPanel.getBoundingClientRect();
      const routingBottom = routingRect.bottom;
      const viewportHeight = window.innerHeight;
      const padding = 10;
      const maxBottom = viewportHeight - padding;
      
      // Calculate available space - ensure context panel gets remaining 30% of viewport
      const routingMaxHeight = viewportHeight * 0.7;
      const contextMaxHeight = viewportHeight * 0.3 - padding;
      const routingActualHeight = Math.min(routingRect.height, routingMaxHeight);
      const routingBottomCalculated = routingRect.top + routingActualHeight;
      
      // Position context panel below routing panel
      contextPanel.style.top = `${routingBottomCalculated + padding}px`;
      contextPanel.style.maxHeight = `${contextMaxHeight}px`;
      contextPanel.style.overflowY = 'auto';
      contextPanel.style.bottom = 'auto';
    };
    
    // Update on load
    setTimeout(updateContextPanelPosition, 100);
    
    // Update on window resize
    window.addEventListener('resize', updateContextPanelPosition);
    
    // Update when routing panel content changes (e.g., route calculated, heightgraph shown)
    const observer = new MutationObserver(() => {
      updateContextPanelPosition();
    });
    
    observer.observe(routingPanel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // Also update when route info changes (heightgraph appears/disappears)
    const routeInfo = document.getElementById('route-info');
    if (routeInfo) {
      observer.observe(routeInfo, { childList: true, subtree: true, attributes: true });
    }
    
    const heightgraphContainer = document.getElementById('heightgraph-container');
    if (heightgraphContainer) {
      observer.observe(heightgraphContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }
  }
});
