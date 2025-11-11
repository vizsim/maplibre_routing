// GraphHopper Routing Integration

const GRAPHHOPPER_URL = 'http://localhost:8989';

let routeSource = null;
let routeLayer = null;
let startMarker = null;
let endMarker = null;
let startPoint = null;
let endPoint = null;
let isSelectingStart = false;
let isSelectingEnd = false;
let selectedProfile = 'car'; // Default profile
let mapInstance = null; // Store map instance for marker callbacks
let currentRouteData = null; // Store current route data for visualization
let currentEncodedType = 'custom_present'; // Current visualization type

export function setupRouting(map) {
  mapInstance = map; // Store map instance
  
  // Create source for route line
  if (!map.getSource('route')) {
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }

  // Create source for custom_present segments (black border)
  if (!map.getSource('route-custom-present')) {
    map.addSource('route-custom-present', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }
  
  // Create source for hover buffer (highlight segment on hover)
  if (!map.getSource('route-hover-buffer')) {
    map.addSource('route-hover-buffer', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }
  
  // Create source for heightgraph hover point (point on route line)
  if (!map.getSource('heightgraph-hover-point')) {
    map.addSource('heightgraph-hover-point', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }
  
  // Create layer for custom_present segments (black border, wider)
  if (!map.getLayer('route-custom-present-layer')) {
    map.addLayer({
      id: 'route-custom-present-layer',
      type: 'line',
      source: 'route-custom-present',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#000000',
        'line-width': 8,
        'line-opacity': 1.0
      }
    });
  }
  
  // Create layer for route line (on top of custom_present layer)
  if (!map.getLayer('route-layer')) {
    map.addLayer({
      id: 'route-layer',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 5,
        'line-opacity': 0.8
      }
    });
  }
  
  // Create layer for hover buffer (red highlight on hover)
  if (!map.getLayer('route-hover-buffer-layer')) {
    map.addLayer({
      id: 'route-hover-buffer-layer',
      type: 'line',
      source: 'route-hover-buffer',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#ef4444',
        'line-width': 12,
        'line-opacity': 0.6
      }
    });
  }
  
  // Create layer for heightgraph hover point (point on route line)
  if (!map.getLayer('heightgraph-hover-point-layer')) {
    map.addLayer({
      id: 'heightgraph-hover-point-layer',
      type: 'circle',
      source: 'heightgraph-hover-point',
      paint: {
        'circle-radius': 8,
        'circle-color': '#ef4444',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 1.0
      }
    });
  }
  
  // Setup hover interaction for route
  setupRouteHover(map);

  setupUIHandlers(map);
  setupHeightgraphHandlers();
  
  // Automatically activate start point selection mode on map load
  isSelectingStart = true;
  if (map.getCanvas()) {
    map.getCanvas().style.cursor = 'crosshair';
  }
  
  // Mark start button as active
  const startBtn = document.getElementById('set-start');
  if (startBtn) {
    startBtn.classList.add('active');
  }
}

function setupHeightgraphHandlers() {
  const select = document.getElementById('heightgraph-encoded-select');
  if (select) {
    select.addEventListener('change', () => {
      currentEncodedType = select.value;
      // Re-draw heightgraph when selection changes
      if (currentRouteData) {
        const { elevations, distance, encodedValues } = currentRouteData;
        drawHeightgraph(elevations || [], distance, encodedValues || {}, currentRouteData?.coordinates || []);
        // Update route color on map
        updateRouteColor(currentEncodedType, encodedValues || {});
      }
    });
  }
}

function setupRouteHover(map) {
  // Create a popup for showing encoded values on hover
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });
  
  let hoveredSegment = null;
  
  map.on('mouseenter', 'route-layer', (e) => {
    map.getCanvas().style.cursor = 'pointer';
  });
  
  map.on('mouseleave', 'route-layer', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
    // Clear hover buffer
    if (map.getSource('route-hover-buffer')) {
      map.getSource('route-hover-buffer').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    hoveredSegment = null;
  });
  
  map.on('mousemove', 'route-layer', (e) => {
    if (currentRouteData && e.features && e.features.length > 0) {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates;
      const point = e.lngLat;
      
      // Find closest point on route
      let closestPoint = coordinates[0];
      let closestIndex = 0;
      let minDist = Infinity;
      
      coordinates.forEach((coord, idx) => {
        const dist = Math.sqrt(
          Math.pow(coord[0] - point.lng, 2) + 
          Math.pow(coord[1] - point.lat, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          closestPoint = coord;
          closestIndex = idx;
        }
      });
      
      // Get all available details for this point
      const { encodedValues, elevations } = currentRouteData;
      
      // Find the segment that contains this point - only highlight if custom_present=True
      // Check if custom_present is available and if the current point has custom_present=True
      if (encodedValues.custom_present && 
          encodedValues.custom_present[closestIndex] !== undefined && 
          encodedValues.custom_present[closestIndex] !== null) {
        
        const isCustomPresent = encodedValues.custom_present[closestIndex] === true || 
                                encodedValues.custom_present[closestIndex] === 'True' ||
                                encodedValues.custom_present[closestIndex] === 'true';
        
        if (isCustomPresent) {
          // Find the boundaries of the custom_present segment containing this point
          // Go backwards to find segment start
          let segmentStart = closestIndex;
          while (segmentStart > 0) {
            const prevValue = encodedValues.custom_present[segmentStart - 1];
            const prevIsCustomPresent = prevValue === true || prevValue === 'True' || prevValue === 'true';
            if (prevIsCustomPresent) {
              segmentStart--;
            } else {
              break;
            }
          }
          
          // Go forwards to find segment end
          let segmentEnd = closestIndex;
          while (segmentEnd < coordinates.length - 1) {
            const nextValue = encodedValues.custom_present[segmentEnd + 1];
            const nextIsCustomPresent = nextValue === true || nextValue === 'True' || nextValue === 'true';
            if (nextIsCustomPresent) {
              segmentEnd++;
            } else {
              break;
            }
          }
          
          // Create segment for highlighting
          const segmentCoords = coordinates.slice(segmentStart, segmentEnd + 1);
          
          // Only update if segment changed
          const segmentKey = `${segmentStart}-${segmentEnd}`;
          if (hoveredSegment !== segmentKey && segmentCoords.length > 1) {
            hoveredSegment = segmentKey;
            
            // Update hover buffer layer
            map.getSource('route-hover-buffer').setData({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: segmentCoords
              },
              properties: {}
            });
          }
        } else {
          // Not custom_present, clear hover buffer
          if (hoveredSegment !== null) {
            hoveredSegment = null;
            map.getSource('route-hover-buffer').setData({
              type: 'FeatureCollection',
              features: []
            });
          }
        }
      } else {
        // No custom_present data, clear hover buffer
        if (hoveredSegment !== null) {
          hoveredSegment = null;
          map.getSource('route-hover-buffer').setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      }
      const details = [];
      
      // Elevation
      if (elevations && elevations[closestIndex] !== undefined && elevations[closestIndex] !== null) {
        details.push({
          label: 'Höhe',
          value: Math.round(elevations[closestIndex]) + ' m'
        });
      }
      
      // Time
      if (encodedValues.time && encodedValues.time[closestIndex] !== undefined && encodedValues.time[closestIndex] !== null && encodedValues.time[closestIndex] !== 0) {
        const timeSeconds = encodedValues.time[closestIndex];
        const timeMinutes = Math.round(timeSeconds / 60);
        details.push({
          label: 'Zeit',
          value: timeMinutes > 0 ? `${timeMinutes} min` : `${Math.round(timeSeconds)} s`
        });
      }
      
      // Distance
      if (encodedValues.distance && encodedValues.distance[closestIndex] !== undefined && encodedValues.distance[closestIndex] !== null && encodedValues.distance[closestIndex] !== 0) {
        const distMeters = encodedValues.distance[closestIndex];
        details.push({
          label: 'Distanz',
          value: distMeters > 1000 ? `${(distMeters / 1000).toFixed(2)} km` : `${Math.round(distMeters)} m`
        });
      }
      
      // Street name
      if (encodedValues.street_name && encodedValues.street_name[closestIndex] !== undefined && encodedValues.street_name[closestIndex] !== null && encodedValues.street_name[closestIndex] !== '') {
        details.push({
          label: 'Straße',
          value: encodedValues.street_name[closestIndex]
        });
      }
      
      // Road class (if available)
      if (encodedValues.road_class && encodedValues.road_class[closestIndex] !== undefined && encodedValues.road_class[closestIndex] !== null) {
        details.push({
          label: 'Straßenklasse',
          value: String(encodedValues.road_class[closestIndex])
        });
      }
      
      // Road environment (if available)
      if (encodedValues.road_environment && encodedValues.road_environment[closestIndex] !== undefined && encodedValues.road_environment[closestIndex] !== null) {
        details.push({
          label: 'Umgebung',
          value: String(encodedValues.road_environment[closestIndex])
        });
      }
      
      // Road access (if available)
      if (encodedValues.road_access && encodedValues.road_access[closestIndex] !== undefined && encodedValues.road_access[closestIndex] !== null) {
        details.push({
          label: 'Zugang',
          value: String(encodedValues.road_access[closestIndex])
        });
      }
      
      // Surface (if available)
      if (encodedValues.surface && encodedValues.surface[closestIndex] !== undefined && encodedValues.surface[closestIndex] !== null) {
        details.push({
          label: 'Oberfläche',
          value: String(encodedValues.surface[closestIndex])
        });
      }
      
      // Custom present (if available)
      if (encodedValues.custom_present && encodedValues.custom_present[closestIndex] !== undefined && encodedValues.custom_present[closestIndex] !== null) {
        const customValue = encodedValues.custom_present[closestIndex];
        details.push({
          label: 'Custom Present',
          value: typeof customValue === 'boolean' ? (customValue ? 'Ja' : 'Nein') : String(customValue)
        });
      }
      
      // Show any other available details dynamically (for any details that GraphHopper returns)
      Object.keys(encodedValues).forEach(key => {
        // Skip already displayed details and arrays from instructions
        const knownKeys = ['time', 'distance', 'street_name'];
        if (!knownKeys.includes(key) && 
            encodedValues[key] && 
            Array.isArray(encodedValues[key]) &&
            encodedValues[key][closestIndex] !== undefined && 
            encodedValues[key][closestIndex] !== null) {
          const value = encodedValues[key][closestIndex];
          // Format label nicely
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          details.push({
            label: label,
            value: typeof value === 'boolean' ? (value ? 'Ja' : 'Nein') : String(value)
          });
        }
      });
      
      // Build popup HTML
      if (details.length > 0) {
        const detailsHTML = details.map(d => 
          `<div style="margin: 2px 0;"><strong>${d.label}:</strong> ${d.value}</div>`
        ).join('');
        
        popup
          .setLngLat(closestPoint)
          .setHTML(`<div style="font-size: 12px; line-height: 1.4;">${detailsHTML}</div>`)
          .addTo(map);
      }
    }
  });
}

function updateRouteColor(encodedType, encodedValues) {
  if (!mapInstance || !currentRouteData) return;
  
  const { elevations, encodedValues: allEncodedValues } = currentRouteData;
  const data = encodedType === 'elevation' ? elevations : (allEncodedValues[encodedType] || []);
  
  if (!data || data.length === 0) {
    // Default color if no data
    mapInstance.setPaintProperty('route-layer', 'line-color', '#3b82f6');
    return;
  }
  
  // For now, use average color - in a full implementation, we'd need to create segments
  const validValues = data.filter(v => v !== null && v !== undefined);
  if (validValues.length === 0) {
    mapInstance.setPaintProperty('route-layer', 'line-color', '#3b82f6');
    return;
  }
  
  if (encodedType === 'elevation' || encodedType === 'time' || encodedType === 'distance') {
    // Numeric data - use gradient color based on average
    const minValue = Math.min(...validValues);
    const maxValue = Math.max(...validValues);
    const range = maxValue - minValue || 1;
    const avgValue = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    const normalized = (avgValue - minValue) / range;
    
    let color = '#3b82f6';
    if (normalized < 0.25) color = '#3b82f6';
    else if (normalized < 0.5) color = '#10b981';
    else if (normalized < 0.75) color = '#f59e0b';
    else color = '#ef4444';
    
    mapInstance.setPaintProperty('route-layer', 'line-color', color);
  } else {
    // Categorical data
    const uniqueValues = [...new Set(data.filter(v => v !== null && v !== undefined && v !== ''))];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const firstValue = data.find(v => v !== null && v !== undefined && v !== '');
    if (firstValue !== undefined) {
      const valueIndex = uniqueValues.indexOf(firstValue);
      const color = colors[valueIndex % colors.length];
      mapInstance.setPaintProperty('route-layer', 'line-color', color);
    }
  }
}

function setupUIHandlers(map) {
  const startBtn = document.getElementById('set-start');
  const endBtn = document.getElementById('set-end');
  const clearBtn = document.getElementById('clear-route');
  const calculateBtn = document.getElementById('calculate-route');
  const startInput = document.getElementById('start-input');
  const endInput = document.getElementById('end-input');
  const collapseBtn = document.getElementById('collapse-routing-panel');
  
  // Profile selection handlers
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      // Update selected profile
      selectedProfile = btn.dataset.profile;
      // Update route color based on profile
      updateRouteColorByProfile(map, selectedProfile);
      
      // If route already exists, recalculate with new profile
      if (startPoint && endPoint) {
        calculateRoute(map, startPoint, endPoint);
      }
    });
  });
  
  // Set initial route color
  updateRouteColor(map, selectedProfile);
  
  // Collapse/expand panel handler
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const panel = document.querySelector('.routing-panel');
      if (panel) {
        const isCollapsed = panel.classList.contains('collapsed');
        if (isCollapsed) {
          // Expand panel
          panel.classList.remove('collapsed');
          collapseBtn.textContent = '▼';
          collapseBtn.title = 'Einklappen';
        } else {
          // Collapse panel
          panel.classList.add('collapsed');
          collapseBtn.textContent = '▶';
          collapseBtn.title = 'Ausklappen';
        }
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      isSelectingStart = true;
      isSelectingEnd = false;
      map.getCanvas().style.cursor = 'crosshair';
      startBtn.classList.add('active');
      if (endBtn) endBtn.classList.remove('active');
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', () => {
      isSelectingEnd = true;
      isSelectingStart = false;
      map.getCanvas().style.cursor = 'crosshair';
      endBtn.classList.add('active');
      if (startBtn) startBtn.classList.remove('active');
    });
  }

  // Hide route button
  const hideBtn = document.getElementById('hide-route');
  if (hideBtn) {
    let isHidden = false;
    hideBtn.addEventListener('click', () => {
      isHidden = !isHidden;
      
      // Toggle route layer opacity
      if (map.getLayer('route-layer')) {
        const newOpacity = isHidden ? 0 : 0.8;
        map.setPaintProperty('route-layer', 'line-opacity', newOpacity);
        
        // Update button icon and title
        const svg = hideBtn.querySelector('svg');
        if (svg) {
          if (isHidden) {
            // Show eye-off icon (hidden)
            svg.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
            hideBtn.title = 'Einblenden';
          } else {
            // Show eye icon (visible)
            svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
            hideBtn.title = 'Ausblenden';
          }
        }
      }
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearRoute(map);
      // Reset hide button state
      const hideBtn = document.getElementById('hide-route');
      if (hideBtn) {
        const svg = hideBtn.querySelector('svg');
        if (svg) {
          // Reset to eye icon (visible)
          svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
          hideBtn.title = 'Ausblenden';
        }
      }
    });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', () => {
      if (startPoint && endPoint) {
        calculateRoute(map, startPoint, endPoint);
      } else {
        alert('Bitte Start- und Endpunkt setzen');
      }
    });
  }

  // GPX Export button
  const exportGpxBtn = document.getElementById('export-gpx');
  if (exportGpxBtn) {
    exportGpxBtn.addEventListener('click', () => {
      exportRouteToGPX();
    });
  }

  // Map click handler
  map.on('click', (e) => {
    if (isSelectingStart) {
      setStartPoint(map, e.lngLat);
      isSelectingStart = false;
      if (startBtn) startBtn.classList.remove('active');
      
      // Automatically activate end point selection mode
      isSelectingEnd = true;
      map.getCanvas().style.cursor = 'crosshair';
      if (endBtn) endBtn.classList.add('active');
    } else if (isSelectingEnd) {
      setEndPoint(map, e.lngLat);
      isSelectingEnd = false;
      map.getCanvas().style.cursor = '';
      if (endBtn) endBtn.classList.remove('active');
    }
  });

  // Geocoder integration (if available)
  if (startInput) {
    startInput.addEventListener('change', async (e) => {
      const query = e.target.value;
      if (query) {
        const coords = await geocodeAddress(query);
        if (coords) {
          setStartPoint(map, { lng: coords.lng, lat: coords.lat });
          map.flyTo({ center: [coords.lng, coords.lat], zoom: 14 });
          
          // Automatically activate end point selection mode
          isSelectingStart = false;
          isSelectingEnd = true;
          map.getCanvas().style.cursor = 'crosshair';
          if (startBtn) startBtn.classList.remove('active');
          if (endBtn) endBtn.classList.add('active');
        }
      }
    });
  }

  if (endInput) {
    endInput.addEventListener('change', async (e) => {
      const query = e.target.value;
      if (query) {
        const coords = await geocodeAddress(query);
        if (coords) {
          setEndPoint(map, { lng: coords.lng, lat: coords.lat });
          map.flyTo({ center: [coords.lng, coords.lat], zoom: 14 });
        }
      }
    });
  }
}

function setStartPoint(map, lngLat) {
  startPoint = [lngLat.lng, lngLat.lat];
  updateMarkers(map);
  
  const startInput = document.getElementById('start-input');
  if (startInput) {
    startInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  }
  
  // Automatically calculate route if both points are set
  if (startPoint && endPoint) {
    calculateRoute(map, startPoint, endPoint);
  }
}

function setEndPoint(map, lngLat) {
  endPoint = [lngLat.lng, lngLat.lat];
  updateMarkers(map);
  
  const endInput = document.getElementById('end-input');
  if (endInput) {
    endInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  }
  
  // Automatically calculate route if both points are set
  if (startPoint && endPoint) {
    calculateRoute(map, startPoint, endPoint);
  }
}

function updateMarkers(map) {
  // Remove existing markers
  if (startMarker) {
    startMarker.remove();
    startMarker = null;
  }
  if (endMarker) {
    endMarker.remove();
    endMarker = null;
  }
  
  // Create draggable start marker with pin icon
  if (startPoint) {
    const el = document.createElement('div');
    el.className = 'custom-marker start-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.cursor = 'grab';
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#10b981" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="white"></circle>
      </svg>
    `;
    el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
    
    startMarker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom'
    })
      .setLngLat(startPoint)
      .addTo(map);
    
    startMarker.on('dragstart', () => {
      el.style.cursor = 'grabbing';
    });
    
    startMarker.on('dragend', () => {
      el.style.cursor = 'grab';
      const lngLat = startMarker.getLngLat();
      startPoint = [lngLat.lng, lngLat.lat];
      
      const startInput = document.getElementById('start-input');
      if (startInput) {
        startInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
      }
      
      // Recalculate route if end point exists
      if (endPoint) {
        calculateRoute(map, startPoint, endPoint);
      }
    });
  }
  
  // Create draggable end marker with pin icon
  if (endPoint) {
    const el = document.createElement('div');
    el.className = 'custom-marker end-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.cursor = 'grab';
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="white"></circle>
      </svg>
    `;
    el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
    
    endMarker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom'
    })
      .setLngLat(endPoint)
      .addTo(map);
    
    endMarker.on('dragstart', () => {
      el.style.cursor = 'grabbing';
    });
    
    endMarker.on('dragend', () => {
      el.style.cursor = 'grab';
      const lngLat = endMarker.getLngLat();
      endPoint = [lngLat.lng, lngLat.lat];
      
      const endInput = document.getElementById('end-input');
      if (endInput) {
        endInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
      }
      
      // Recalculate route if start point exists
      if (startPoint) {
        calculateRoute(map, startPoint, endPoint);
      }
    });
  }
}

function updateRouteColorByProfile(map, profile) {
  if (!map.getLayer('route-layer')) return;
  
  const colorMap = {
    'car': '#3b82f6',        // Blue
    'car_custom': '#6366f1', // Indigo
    'bike': '#10b981',       // Green
    'my_bike_cycleways': '#059669', // Darker green
    'racingbike': '#ef4444', // Red
    'cargo_bike': '#f59e0b', // Orange
    'mtb': '#8b5cf6'         // Purple
  };
  
  const color = colorMap[profile] || '#3b82f6';
  map.setPaintProperty('route-layer', 'line-color', color);
}

function clearRoute(map) {
  startPoint = null;
  endPoint = null;
  isSelectingStart = false;
  isSelectingEnd = false;
  map.getCanvas().style.cursor = '';
  
  map.getSource('route').setData({
    type: 'FeatureCollection',
    features: []
  });
  
  // Clear custom_present layer
  if (map.getSource('route-custom-present')) {
    map.getSource('route-custom-present').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  
  // Clear hover buffer layer
  if (map.getSource('route-hover-buffer')) {
    map.getSource('route-hover-buffer').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  
  // Clear heightgraph hover point
  if (map.getSource('heightgraph-hover-point')) {
    map.getSource('heightgraph-hover-point').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  
  // Remove markers
  if (startMarker) {
    startMarker.remove();
    startMarker = null;
  }
  if (endMarker) {
    endMarker.remove();
    endMarker = null;
  }
  
  const startBtn = document.getElementById('set-start');
  const endBtn = document.getElementById('set-end');
  if (startBtn) startBtn.classList.remove('active');
  if (endBtn) endBtn.classList.remove('active');
  
  const startInput = document.getElementById('start-input');
  const endInput = document.getElementById('end-input');
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  
  // Hide heightgraph
  const heightgraphContainer = document.getElementById('heightgraph-container');
  if (heightgraphContainer) {
    heightgraphContainer.style.display = 'none';
  }
  
  // Clear route data
  currentRouteData = null;
  
  // Hide GPX export button
  const exportGpxBtn = document.getElementById('export-gpx');
  if (exportGpxBtn) {
    exportGpxBtn.style.display = 'none';
  }
  
  // Reset route color
  if (map) {
    map.setPaintProperty('route-layer', 'line-color', '#3b82f6');
  }
}

async function calculateRoute(map, start, end) {
  const calculateBtn = document.getElementById('calculate-route');
  const routeInfo = document.getElementById('route-info');
  
  if (calculateBtn) {
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Berechne...';
  }
  
  if (routeInfo) {
    routeInfo.textContent = 'Route wird berechnet...';
  }

  try {
    // GraphHopper API call - request GeoJSON format with points_encoded=false and elevation data
    // GraphHopper expects point as lat,lng
    // Request details - format: details=surface&details=custom_present (multiple parameters)
    // or details=surface,custom_present (comma-separated)
    const baseUrl = `${GRAPHHOPPER_URL}/route?point=${start[1]},${start[0]}&point=${end[1]},${end[0]}&profile=${selectedProfile}&points_encoded=false&elevation=true`;
    
    // Try different formats for requesting details
    // Format 1: Multiple detail parameters (as GraphHopper web UI might use)
    const detailsParams = ['surface', 'custom_present', 'road_class', 'road_access']
      .map(d => `details=${d}`)
      .join('&');
    const url = `${baseUrl}&${detailsParams}&type=json`;
    
    console.log('Requesting route with URL:', url);
    
    let response = await fetch(url);
    
    // If details request fails, try comma-separated format
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Details request failed with multiple params, trying comma-separated:', errorText);
      
      // Format 2: Comma-separated
      const detailsComma = ['surface', 'custom_present', 'road_class', 'road_access'].join(',');
      const urlComma = `${baseUrl}&details=${detailsComma}&type=json`;
      response = await fetch(urlComma);
      
      // If still fails, try without details
      if (!response.ok) {
        const errorText2 = await response.text();
        console.warn('Details request failed with comma-separated, trying without details:', errorText2);
        const urlNoDetails = `${baseUrl}&type=json`;
        response = await fetch(urlNoDetails);
        
        if (!response.ok) {
          const errorText3 = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText3}`);
        }
      }
    }
    
    const data = await response.json();
    
    // Debug: Log full response to see what's available
    console.log('GraphHopper API Response:', data);
    if (data.paths && data.paths.length > 0) {
      const path = data.paths[0];
      console.log('Path data:', path);
      console.log('Available path fields:', Object.keys(path));
      let coordinates = [];
      
      // GraphHopper with points_encoded=false returns coordinates in the points.geometry.coordinates array
      // Format is GeoJSON LineString: coordinates are [lng, lat] arrays
      if (path.points && path.points.coordinates) {
        // Direct coordinates array (GeoJSON format)
        coordinates = path.points.coordinates;
      } else if (path.points && path.points.geometry && path.points.geometry.coordinates) {
        // Nested geometry object
        coordinates = path.points.geometry.coordinates;
      } else {
        throw new Error('Route points format not recognized. Response: ' + JSON.stringify(path).substring(0, 200));
      }
      
      // Extract elevation data if available
      let elevations = [];
      let hasElevation = false;
      
      // Check if coordinates include elevation (3rd value) or if there's a separate elevation array
      if (coordinates.length > 0 && coordinates[0].length >= 3) {
        // Coordinates include elevation: [lng, lat, elevation]
        elevations = coordinates.map(coord => coord[2] || null);
        hasElevation = elevations.some(e => e !== null);
        // Remove elevation from coordinates for MapLibre
        coordinates = coordinates.map(coord => [coord[0], coord[1]]);
      } else if (path.points && path.points.elevation) {
        // Separate elevation array
        elevations = path.points.elevation;
        hasElevation = elevations && elevations.length > 0;
      } else if (path.elevation) {
        // Elevation at path level
        elevations = path.elevation;
        hasElevation = elevations && elevations.length > 0;
      }
      
      // Ensure coordinates are in [lng, lat] format for MapLibre
      // GraphHopper may return [lat, lng], so check and swap if needed
      coordinates = coordinates.map(coord => {
        // If first value is > 90 or < -90, it's likely longitude (already correct)
        // Otherwise, it might be latitude and we need to swap
        if (Array.isArray(coord) && coord.length >= 2) {
          if (Math.abs(coord[0]) <= 90 && Math.abs(coord[1]) > 90) {
            // Looks like [lat, lng] - swap to [lng, lat]
            return [coord[1], coord[0]];
          }
          // Already [lng, lat] or correct format
          return [coord[0], coord[1]];
        }
        return coord;
      });
      
      console.log('Elevation data:', { hasElevation, elevationCount: elevations.length, sample: elevations.slice(0, 5) });
      
      // Extract encoded values (details) if available
      // GraphHopper returns details as arrays: [[startIdx, endIdx, value], ...]
      const encodedValues = {};
      
      // Helper function to map detail arrays to coordinate arrays
      const mapDetailsToCoordinates = (detailArray, coordinatesLength) => {
        if (!detailArray || !Array.isArray(detailArray)) return null;
        
        const result = new Array(coordinatesLength).fill(null);
        detailArray.forEach(([startIdx, endIdx, value]) => {
          if (typeof startIdx === 'number' && typeof endIdx === 'number') {
            for (let i = startIdx; i <= endIdx && i < coordinatesLength; i++) {
              result[i] = value;
            }
          }
        });
        return result;
      };
      
      if (path.details && Object.keys(path.details).length > 0) {
        console.log('Path details structure:', path.details);
        console.log('Available detail keys:', Object.keys(path.details));
        
        // Map detail arrays to coordinate arrays for all available details
        // GraphHopper returns details as: [[startIdx, endIdx, value], ...]
        Object.keys(path.details).forEach(detailKey => {
          const detailArray = path.details[detailKey];
          if (Array.isArray(detailArray) && detailArray.length > 0) {
            encodedValues[detailKey] = mapDetailsToCoordinates(detailArray, coordinates.length);
            console.log(`Mapped ${detailKey}:`, encodedValues[detailKey].filter(v => v !== null).length, 'non-null values');
          }
        });
        
        // Also check for time and distance in details (if available)
        if (path.details.time) {
          encodedValues.time = mapDetailsToCoordinates(path.details.time, coordinates.length);
        }
        if (path.details.distance) {
          encodedValues.distance = mapDetailsToCoordinates(path.details.distance, coordinates.length);
        }
      }
      
      // Extract data from instructions - they contain per-segment information
      if (path.instructions && path.instructions.length > 0) {
        console.log('Instructions sample:', path.instructions[0]);
        console.log('All instruction keys:', Object.keys(path.instructions[0]));
        
        // Map instruction data to coordinates using intervals
        const timeArray = new Array(coordinates.length).fill(0);
        const distanceArray = new Array(coordinates.length).fill(0);
        const streetNameArray = new Array(coordinates.length).fill('');
        const customPresentArray = new Array(coordinates.length).fill(null);
        
        path.instructions.forEach((inst) => {
          if (inst.interval && Array.isArray(inst.interval) && inst.interval.length === 2) {
            const [startIdx, endIdx] = inst.interval;
            // Fill the interval with instruction values
            for (let i = startIdx; i <= endIdx && i < coordinates.length; i++) {
              timeArray[i] = inst.time || 0;
              distanceArray[i] = inst.distance || 0;
              streetNameArray[i] = inst.street_name || '';
              // Check if custom_present is in instruction or details
              if (inst.custom_present !== undefined) {
                customPresentArray[i] = inst.custom_present;
              }
            }
          }
        });
        
        // Store as encoded values for visualization
        encodedValues.time = timeArray;
        encodedValues.distance = distanceArray;
        encodedValues.street_name = streetNameArray;
        // Only set custom_present if we have values
        if (customPresentArray.some(v => v !== null)) {
          encodedValues.custom_present = customPresentArray;
        }
        
        console.log('Extracted from instructions:', {
          timeSample: timeArray.slice(0, 10),
          distanceSample: distanceArray.slice(0, 10),
          streetNameSample: streetNameArray.slice(0, 10),
          totalInstructions: path.instructions.length
        });
      }
      
      // Log all available data for debugging
      console.log('=== GraphHopper Available Data ===');
      console.log('Path details object:', path.details);
      console.log('Path details keys:', path.details ? Object.keys(path.details) : 'No details object');
      
      // Log instruction fields
      if (path.instructions && path.instructions.length > 0) {
        console.log('Instruction fields available:', Object.keys(path.instructions[0]));
        console.log('Sample instruction:', path.instructions[0]);
      }
      
      // Log what we extracted
      console.log('Extracted encoded values:', Object.keys(encodedValues).filter(k => encodedValues[k] && encodedValues[k].length > 0));
      console.log('Encoded values details:', {
        time: encodedValues.time ? `${encodedValues.time.length} values` : 'not available',
        distance: encodedValues.distance ? `${encodedValues.distance.length} values` : 'not available',
        street_name: encodedValues.street_name ? `${encodedValues.street_name.length} values` : 'not available',
        surface: encodedValues.surface ? `${encodedValues.surface.length} values` : 'not available',
        custom_present: encodedValues.custom_present ? `${encodedValues.custom_present.length} values` : 'not available',
        road_class: encodedValues.road_class ? `${encodedValues.road_class.length} values` : 'not available',
        road_environment: encodedValues.road_environment ? `${encodedValues.road_environment.length} values` : 'not available',
        road_access: encodedValues.road_access ? `${encodedValues.road_access.length} values` : 'not available'
      });
      console.log('===================================');
      
      // Update route layer
      map.getSource('route').setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {}
      });
      
      // Create segments for custom_present=True (black border)
      if (encodedValues.custom_present && encodedValues.custom_present.length > 0) {
        const customPresentSegments = [];
        let currentSegment = null;
        
        coordinates.forEach((coord, index) => {
          const isCustomPresent = encodedValues.custom_present[index] === true || 
                                  encodedValues.custom_present[index] === 'True' ||
                                  encodedValues.custom_present[index] === 'true';
          
          if (isCustomPresent) {
            if (currentSegment === null) {
              // Start new segment
              currentSegment = [coord];
            } else {
              // Continue segment
              currentSegment.push(coord);
            }
          } else {
            // End current segment if exists
            if (currentSegment !== null && currentSegment.length > 1) {
              customPresentSegments.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: currentSegment
                },
                properties: {}
              });
              currentSegment = null;
            }
          }
        });
        
        // Add final segment if exists
        if (currentSegment !== null && currentSegment.length > 1) {
          customPresentSegments.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: currentSegment
            },
            properties: {}
          });
        }
        
        // Update custom_present layer
        map.getSource('route-custom-present').setData({
          type: 'FeatureCollection',
          features: customPresentSegments
        });
        
        console.log('Custom present segments:', customPresentSegments.length);
      } else {
        // Clear custom_present layer if no data
        map.getSource('route-custom-present').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
      
      // Update route info
      if (routeInfo) {
        const distance = (path.distance / 1000).toFixed(2);
        const timeSeconds = Math.round(path.time / 1000);
        const timeMinutes = Math.round(timeSeconds / 60);
        const timeHours = Math.floor(timeMinutes / 60);
        const timeMins = timeMinutes % 60;
        
        // Format time nicely
        let timeDisplay = '';
        if (timeHours > 0) {
          timeDisplay = `${timeHours}h ${timeMins}min`;
        } else {
          timeDisplay = `${timeMinutes} min`;
        }
        
        // Calculate average speed (km/h)
        const avgSpeed = timeHours > 0 
          ? (path.distance / 1000 / (path.time / 1000 / 3600)).toFixed(1)
          : (path.distance / 1000 / (path.time / 1000 / 60) * 60).toFixed(1);
        
        // Get elevation data if available
        const ascend = path.ascend ? Math.round(path.ascend) : null;
        const descend = path.descend ? Math.round(path.descend) : null;
        
        // Get instruction count if available
        const instructionCount = path.instructions ? path.instructions.length : null;
        
        // Additional GraphHopper data
        const weight = path.weight ? path.weight.toFixed(2) : null;
        const transfers = path.transfers !== undefined ? path.transfers : null;
        const bbox = path.bbox ? path.bbox : null;
        const pointsEncoded = path.points_encoded !== undefined ? path.points_encoded : null;
        const snappedWaypoints = path.snapped_waypoints ? path.snapped_waypoints : null;
        
        // Log additional data for debugging
        console.log('Additional route data:', {
          weight,
          transfers,
          bbox,
          pointsEncoded,
          hasSnappedWaypoints: !!snappedWaypoints,
          instructionDetails: path.instructions ? path.instructions.slice(0, 3) : null // First 3 instructions
        });
        
        routeInfo.innerHTML = `
          <div class="route-info-compact">
            <div class="route-info-row">
              <svg width="16" height="16" viewBox="0 0 179 179" fill="currentColor">
                <polygon points="52.258,67.769 52.264,37.224 0,89.506 52.264,141.782 52.258,111.237 126.736,111.249 126.736,141.782 179.006,89.506 126.736,37.224 126.736,67.769"/>
              </svg>
              <span class="route-info-compact-value">${distance} km</span>
            </div>
            <div class="route-info-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="route-info-compact-value">${timeDisplay}</span>
            </div>
            <div class="route-info-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,2A10,10,0,1,0,22,12,10.011,10.011,0,0,0,12,2Zm7.411,13H12.659L9.919,8.606a1,1,0,1,0-1.838.788L10.484,15H4.589a8,8,0,1,1,14.822,0Z"/>
              </svg>
              <span class="route-info-compact-label">Ø:</span>
              <span class="route-info-compact-value">${avgSpeed} km/h</span>
            </div>
            ${(ascend !== null || descend !== null) ? `
            <div class="route-info-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 14L17 9L22 18H2.84444C2.46441 18 2.2233 17.5928 2.40603 17.2596L10.0509 3.31896C10.2429 2.96885 10.7476 2.97394 10.9325 3.32786L15.122 11.3476"/>
              </svg>
              <span class="route-info-compact-value">
                ${ascend !== null ? `↑ ${ascend} m` : ''}
                ${ascend !== null && descend !== null ? ' ' : ''}
                ${descend !== null ? `↓ ${descend} m` : ''}
              </span>
            </div>
            ` : ''}
            ${instructionCount !== null ? `
            <div class="route-info-row">
              <svg width="16" height="16" viewBox="0 0 403.262 460.531" fill="currentColor">
                <path d="M403.262,254.156v206.375h-70.628V254.156c0-32.26-8.411-56.187-25.718-73.16c-24.636-24.166-60.904-27.919-71.934-28.469 h-50.747l29.09,73.648c0.979,2.468,0.187,5.284-1.927,6.88c-2.116,1.604-5.048,1.593-7.152-0.03L59.574,121.797 c-1.445-1.126-2.305-2.84-2.305-4.678c0-1.835,0.86-3.561,2.305-4.672L204.246,1.218c1.064-0.819,2.323-1.218,3.6-1.218 c1.247,0,2.494,0.387,3.552,1.185c2.119,1.593,2.905,4.413,1.927,6.889l-29.09,73.642l37.442,0.109c0,0,3.588,0.198,8.565,0.624 l-0.018-0.63c3.174-0.067,75.568-0.859,126.153,48.761C387.492,161.092,403.262,202.665,403.262,254.156z"/>
              </svg>
              <span class="route-info-compact-label">turns:</span>
              <span class="route-info-compact-value">${instructionCount}</span>
            </div>
            ` : ''}
            ${weight !== null ? `
            <div class="route-info-row">
              <span class="route-info-compact-label">Weight:</span>
              <span class="route-info-compact-value">${weight}</span>
            </div>
            ` : ''}
          </div>
        `;
        
        // Store route data for redrawing heightgraph and route visualization
        currentRouteData = {
          elevations: hasElevation ? elevations : [],
          distance: path.distance,
          encodedValues: encodedValues,
          coordinates: coordinates
        };
        
        // Show GPX export button
        const exportGpxBtn = document.getElementById('export-gpx');
        if (exportGpxBtn) {
          exportGpxBtn.style.display = 'flex';
        }
        
        // Always show heightgraph if we have elevation or encoded values
        if (hasElevation && elevations.length > 0) {
          drawHeightgraph(elevations, path.distance, encodedValues, coordinates);
        } else if (Object.keys(encodedValues).length > 0) {
          // Show heightgraph even without elevation if we have encoded values
          drawHeightgraph([], path.distance, encodedValues, coordinates);
        } else {
          // Hide heightgraph if no data
          const heightgraphContainer = document.getElementById('heightgraph-container');
          if (heightgraphContainer) {
            heightgraphContainer.style.display = 'none';
          }
        }
        
        // Update route color based on current selection
        updateRouteColor(currentEncodedType, encodedValues);
      }
      
      // Fit map to route
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      
      map.fitBounds(bounds, {
        padding: 50
      });
    } else {
      throw new Error('Keine Route gefunden');
    }
  } catch (error) {
    console.error('Routing error:', error);
    if (routeInfo) {
      routeInfo.textContent = `Fehler: ${error.message}`;
    }
    alert(`Fehler beim Berechnen der Route: ${error.message}`);
  } finally {
    if (calculateBtn) {
      calculateBtn.disabled = false;
      calculateBtn.textContent = 'Route berechnen';
    }
  }
}

function drawHeightgraph(elevations, totalDistance, encodedValues = {}, coordinates = [], skipInteractivity = false) {
  const container = document.getElementById('heightgraph-container');
  const canvas = document.getElementById('heightgraph-canvas');
  const select = document.getElementById('heightgraph-encoded-select');
  
  if (!container || !canvas) return;
  
  // Clear indicator line tracking when redrawing
  if (canvas.lastIndicatorX !== undefined) {
    canvas.lastIndicatorX = undefined;
  }
  
  // Show container
  container.style.display = 'block';
  
  // Get selected visualization type
  const selectedType = select ? select.value : 'elevation';
  
  // Always show elevation as base, overlay selected encoded value
  let baseData = elevations.length > 0 ? elevations : [];
  let overlayData = [];
  let dataLabel = 'Höhe (m)';
  let overlayLabel = '';
  let isNumeric = true;
  let hasOverlay = false;
  
  // Determine overlay data based on selection
  if (selectedType === 'elevation') {
    // Just show elevation
    overlayData = [];
    hasOverlay = false;
  } else if (encodedValues[selectedType]) {
    overlayData = encodedValues[selectedType];
    overlayLabel = getLabelForEncodedType(selectedType);
    isNumeric = selectedType === 'time' || selectedType === 'distance';
    hasOverlay = true;
  } else if (selectedType === 'street_name' && encodedValues.street_name) {
    overlayData = encodedValues.street_name;
    overlayLabel = 'Straßenname';
    isNumeric = false;
    hasOverlay = true;
  }
  
  // Use base elevation data for visualization
  let dataToVisualize = baseData;
  
  if (baseData.length === 0 && overlayData.length > 0) {
    // Fallback to overlay if no elevation
    dataToVisualize = overlayData;
    dataLabel = overlayLabel;
  } else if (baseData.length === 0) {
    // No data available for selected type
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Keine Daten verfügbar', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  // Set canvas size
  const width = container.clientWidth - 20; // Account for padding
  const height = 150;
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (dataToVisualize.length < 2) return;
  
  // Process data based on type
  let processedData = [];
  let minValue, maxValue, valueRange;
  
  if (isNumeric) {
    // Numeric data (elevation, time, distance)
    const validValues = dataToVisualize.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return;
    
    minValue = Math.min(...validValues);
    maxValue = Math.max(...validValues);
    valueRange = maxValue - minValue || 1;
    processedData = dataToVisualize;
  } else {
    // Categorical data (road_class, road_environment, road_access)
    // Convert to numeric values for visualization
    const uniqueValues = [...new Set(dataToVisualize.filter(v => v !== null && v !== undefined))];
    const valueMap = {};
    uniqueValues.forEach((val, idx) => {
      valueMap[val] = idx;
    });
    
    processedData = dataToVisualize.map(v => v !== null && v !== undefined ? valueMap[v] : null);
    minValue = 0;
    maxValue = uniqueValues.length - 1;
    valueRange = maxValue - minValue || 1;
  }
  
  // Padding
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  
  // Calculate stepX based on available data
  const dataLength = Math.max(baseData.length, overlayData.length > 0 ? overlayData.length : 0);
  const stepX = dataLength > 1 ? graphWidth / (dataLength - 1) : 0;
  
  // Draw background
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(padding.left, padding.top, graphWidth, graphHeight);
  
  // Draw grid lines
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  
  // Horizontal grid lines
  // Y-axis always shows elevation data (baseData), regardless of selectedType
  const gridSteps = 5;
  const yLabels = new Set(); // Track Y-axis labels to avoid duplicates
  
  // Calculate elevation range for Y-axis labels
  let elevationMin = 0;
  let elevationMax = 0;
  let elevationRange = 1;
  
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      elevationMin = Math.min(...baseValid);
      elevationMax = Math.max(...baseValid);
      elevationRange = elevationMax - elevationMin || 1;
    }
  }
  
  for (let i = 0; i <= gridSteps; i++) {
    const y = padding.top + (graphHeight / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + graphWidth, y);
    ctx.stroke();
    
    // Label - always use elevation data for Y-axis, always natural numbers
    const elevationValue = elevationMax - (elevationRange / gridSteps) * i;
    const labelText = Math.round(elevationValue) + ' m';
    
    // Only draw label if it's not a duplicate
    if (!yLabels.has(labelText)) {
      yLabels.add(labelText);
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labelText, padding.left - 5, y + 3);
    }
  }
  
  // Always draw base elevation profile first
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      const baseMin = Math.min(...baseValid);
      const baseMax = Math.max(...baseValid);
      const baseRange = baseMax - baseMin || 1;
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const stepX = graphWidth / (baseData.length - 1);
      
      // Store points for area filling
      const points = [];
      
      baseData.forEach((value, index) => {
        if (value === null || value === undefined) return;
        const x = padding.left + stepX * index;
        const normalized = (value - baseMin) / baseRange;
        const y = padding.top + graphHeight - (normalized * graphHeight);
        
        points.push({ x, y, index });
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Fill area under elevation curve with custom_present coloring
      if (encodedValues.custom_present && encodedValues.custom_present.length > 0 && points.length > 0) {
        // Fill segment by segment based on custom_present
        for (let i = 0; i < points.length - 1; i++) {
          const point1 = points[i];
          const point2 = points[i + 1];
          
          // Get custom_present value for this segment
          const customValue = encodedValues.custom_present[point1.index];
          const isCustomPresent = customValue === true || customValue === 'True' || customValue === 'true';
          
          // Set color based on custom_present
          const fillColor = isCustomPresent 
            ? 'rgba(59, 130, 246, 0.3)'  // Blue for true
            : 'rgba(236, 72, 153, 0.3)'; // Pink/rosa for false
          
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(point1.x, point1.y);
          ctx.lineTo(point2.x, point2.y);
          ctx.lineTo(point2.x, padding.top + graphHeight);
          ctx.lineTo(point1.x, padding.top + graphHeight);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Fallback: fill with default blue if no custom_present data
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.lineTo(padding.left + graphWidth, padding.top + graphHeight);
        ctx.lineTo(padding.left, padding.top + graphHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  
  // Overlay for encoded values removed - only showing elevation profile
  
  // Draw distance labels on x-axis (natural numbers, no duplicates, with 0.5km steps if needed)
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  
  const totalDistanceKm = totalDistance / 1000;
  let distanceSteps = 5;
  let stepSize = totalDistanceKm / distanceSteps;
  
  // If total distance is small and would only show 0 and 1 km, use 0.5 km steps
  if (totalDistanceKm <= 1.5 && stepSize >= 0.3) {
    distanceSteps = Math.ceil(totalDistanceKm * 2); // Double the steps for 0.5km increments
    stepSize = 0.5;
  } else {
    stepSize = totalDistanceKm / distanceSteps;
  }
  
  const xLabels = new Set(); // Track X-axis labels to avoid duplicates
  
  for (let i = 0; i <= distanceSteps; i++) {
    const x = padding.left + (graphWidth / distanceSteps) * i;
    const distance = stepSize * i;
    
    // Format: use natural numbers, but allow 0.5 km if stepSize is 0.5
    let labelText;
    if (stepSize === 0.5) {
      // Show 0.5 km steps
      labelText = distance.toFixed(1) + ' km';
    } else {
      // Show natural numbers (whole numbers)
      const distanceRounded = Math.round(distance);
      labelText = distanceRounded + ' km';
    }
    
    // Only draw label if it's not a duplicate
    if (!xLabels.has(labelText)) {
      xLabels.add(labelText);
      ctx.fillText(labelText, x, height - 5);
    }
  }
  
  // Axis titles removed to prevent overlap
  
  // Min/max markers removed
  
  // Setup interactive hover (only if not skipped)
  if (!skipInteractivity) {
    // Also setup indicator canvas
    const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
    if (indicatorCanvas) {
      indicatorCanvas.width = canvas.width;
      indicatorCanvas.height = canvas.height;
    }
    setupHeightgraphInteractivity(canvas, baseData, totalDistance, coordinates);
  }
}

// Store event handlers to prevent duplicate listeners
let heightgraphMouseMoveHandler = null;
let heightgraphMouseLeaveHandler = null;
let routeHighlightMarker = null;

function setupHeightgraphInteractivity(canvas, elevations, totalDistance, coordinates) {
  if (!canvas || !currentRouteData || !mapInstance || !coordinates || coordinates.length === 0) return;
  
  const { encodedValues } = currentRouteData;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const graphWidth = canvas.width - padding.left - padding.right;
  const graphHeight = canvas.height - padding.top - padding.bottom;
  
  // Remove existing event listeners if they exist
  if (heightgraphMouseMoveHandler) {
    canvas.removeEventListener('mousemove', heightgraphMouseMoveHandler);
  }
  if (heightgraphMouseLeaveHandler) {
    canvas.removeEventListener('mouseleave', heightgraphMouseLeaveHandler);
  }
  
  // Create tooltip element
  let tooltip = document.getElementById('heightgraph-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'heightgraph-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      pointer-events: none;
      z-index: 1000;
      display: none;
      white-space: nowrap;
    `;
    document.body.appendChild(tooltip);
  }
  
  // Remove existing marker if any
  if (routeHighlightMarker) {
    routeHighlightMarker.remove();
    routeHighlightMarker = null;
  }
  
  // Create new event handlers
  heightgraphMouseMoveHandler = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if mouse is within graph area
    if (x < padding.left || x > padding.left + graphWidth || 
        y < padding.top || y > padding.top + graphHeight) {
      tooltip.style.display = 'none';
      if (routeHighlightMarker) {
        routeHighlightMarker.remove();
        routeHighlightMarker = null;
      }
      // Clear point on route line
      if (mapInstance && mapInstance.getSource('heightgraph-hover-point')) {
        mapInstance.getSource('heightgraph-hover-point').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
      return;
    }
    
    // Calculate which point in the data corresponds to this x position
    const relativeX = x - padding.left;
    const dataIndex = Math.round((relativeX / graphWidth) * (elevations.length - 1));
    
    if (dataIndex >= 0 && dataIndex < elevations.length && dataIndex < coordinates.length) {
      const elevation = elevations[dataIndex];
      const coord = coordinates[dataIndex];
      const distance = (totalDistance / elevations.length) * dataIndex;
      
      // Show tooltip
      tooltip.style.display = 'block';
      
      // Calculate tooltip position
      const tooltipWidth = 150; // Approximate tooltip width
      const tooltipHeight = 60; // Approximate tooltip height
      const offsetX = 10; // Horizontal offset from cursor
      const offsetY = -30; // Vertical offset from cursor
      
      let tooltipLeft = rect.left + x + offsetX;
      let tooltipTop = rect.top + y + offsetY;
      
      // Check if tooltip goes over right edge of viewport
      if (tooltipLeft + tooltipWidth > window.innerWidth) {
        // Position tooltip to the left of cursor
        tooltipLeft = rect.left + x - tooltipWidth - offsetX;
      }
      
      // Check if tooltip goes over left edge of viewport
      if (tooltipLeft < 0) {
        tooltipLeft = 10; // Small margin from left edge
      }
      
      // Check if tooltip goes over top edge of viewport
      if (tooltipTop < 0) {
        tooltipTop = 10; // Small margin from top edge
      }
      
      // Check if tooltip goes over bottom edge of viewport
      if (tooltipTop + tooltipHeight > window.innerHeight) {
        tooltipTop = window.innerHeight - tooltipHeight - 10; // Small margin from bottom edge
      }
      
      tooltip.style.left = tooltipLeft + 'px';
      tooltip.style.top = tooltipTop + 'px';
      
      // Build tooltip content - only show distance, custom_present, and elevation
      let tooltipContent = `Distanz: ${(distance / 1000).toFixed(2)} km<br>`;
      
      if (elevation !== null && elevation !== undefined) {
        tooltipContent += `Höhe: ${Math.round(elevation)} m<br>`;
      }
      
      // Add custom_present if available
      if (encodedValues.custom_present && encodedValues.custom_present[dataIndex] !== undefined && 
          encodedValues.custom_present[dataIndex] !== null) {
        const customValue = encodedValues.custom_present[dataIndex];
        const customPresentText = typeof customValue === 'boolean' 
          ? (customValue ? 'Ja' : 'Nein') 
          : String(customValue);
        tooltipContent += `Custom Present: ${customPresentText}`;
      }
      
      tooltip.innerHTML = tooltipContent;
      
      // Highlight point on route
      if (coord && mapInstance) {
        // Remove existing marker (if using marker approach)
        if (routeHighlightMarker) {
          routeHighlightMarker.remove();
          routeHighlightMarker = null;
        }
        
        // Update point on route line using GeoJSON source
        if (mapInstance.getSource('heightgraph-hover-point')) {
          mapInstance.getSource('heightgraph-hover-point').setData({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [coord[0], coord[1]]
            },
            properties: {}
          });
        }
        
        // Draw vertical indicator line on heightgraph using separate overlay canvas
        const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
        if (indicatorCanvas) {
          const indicatorCtx = indicatorCanvas.getContext('2d');
          
          // Clear previous indicator line
          indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
          
          // Draw new indicator line
          indicatorCtx.strokeStyle = '#ef4444';
          indicatorCtx.lineWidth = 2;
          indicatorCtx.beginPath();
          indicatorCtx.moveTo(x, padding.top);
          indicatorCtx.lineTo(x, padding.top + graphHeight);
          indicatorCtx.stroke();
        } else {
          // Fallback: draw on main canvas if indicator canvas not available
          const ctx = canvas.getContext('2d');
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, padding.top);
          ctx.lineTo(x, padding.top + graphHeight);
          ctx.stroke();
        }
      }
    }
  };
  
  heightgraphMouseLeaveHandler = () => {
    tooltip.style.display = 'none';
    if (routeHighlightMarker) {
      routeHighlightMarker.remove();
      routeHighlightMarker = null;
    }
    // Clear point on route line
    if (mapInstance && mapInstance.getSource('heightgraph-hover-point')) {
      mapInstance.getSource('heightgraph-hover-point').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    // Clear indicator line from overlay canvas
    const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
    if (indicatorCanvas) {
      const indicatorCtx = indicatorCanvas.getContext('2d');
      indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
    }
  };
  
  // Add event listeners
  canvas.addEventListener('mousemove', heightgraphMouseMoveHandler);
  canvas.addEventListener('mouseleave', heightgraphMouseLeaveHandler);
}

function getLabelForEncodedType(type) {
  const labels = {
    'road_class': 'Straßenklasse',
    'road_environment': 'Umgebung',
    'road_access': 'Zugang',
    'time': 'Zeit (s)',
    'distance': 'Distanz (m)',
    'street_name': 'Straßenname'
  };
  return labels[type] || type;
}

async function geocodeAddress(query) {
  try {
    // Use Photon geocoder
    const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        lng: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1]
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
}

function exportRouteToGPX() {
  if (!currentRouteData || !currentRouteData.coordinates || currentRouteData.coordinates.length === 0) {
    alert('Keine Route zum Exportieren vorhanden');
    return;
  }

  const { coordinates, elevations, distance } = currentRouteData;
  const now = new Date().toISOString();
  
  // Generate GPX XML
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MapLibre GraphHopper Routing" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Route</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>Route</name>
    <trkseg>
`;

  // Add track points
  coordinates.forEach((coord, index) => {
    const [lng, lat] = coord;
    const elevation = elevations && elevations[index] !== undefined && elevations[index] !== null 
      ? elevations[index] 
      : null;
    
    gpx += `      <trkpt lat="${lat}" lon="${lng}">`;
    if (elevation !== null) {
      gpx += `\n        <ele>${elevation.toFixed(2)}</ele>`;
    }
    gpx += `\n      </trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  // Create download
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `route_${new Date().toISOString().split('T')[0]}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

