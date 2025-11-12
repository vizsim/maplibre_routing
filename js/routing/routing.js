// GraphHopper Routing Integration - Core Module
// This module handles route calculation, API calls, and coordinates the other routing modules

import { routeState } from './routeState.js';
import { setupUIHandlers } from './routingUI.js';
import { setupHeightgraphHandlers, drawHeightgraph, cleanupHeightgraphHandlers } from './heightgraph.js';
import { setupRouteHover, updateRouteColor } from './routeVisualization.js';
import {
  supportsCustomModel,
  getGraphHopperProfile,
  ensureCustomModel,
  buildPostRequestBodyWithCustomModel
} from './customModel.js';

const GRAPHHOPPER_URL = 'http://localhost:8989';
//const GRAPHHOPPER_URL = 'https://ghroute.duckdns.org';

// Flag to prevent parallel route calculations
let routeCalculationInProgress = false;

// Validate coordinates before route calculation
function validateCoordinates(coord, name) {
  if (!Array.isArray(coord) || coord.length < 2) {
    throw new Error(`${name}: Koordinaten müssen ein Array mit mindestens 2 Werten sein`);
  }
  const [lng, lat] = coord;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error(`${name}: Länge und Breite müssen Zahlen sein`);
  }
  if (lng < -180 || lng > 180) {
    throw new Error(`${name}: Länge muss zwischen -180 und 180 liegen`);
  }
  if (lat < -90 || lat > 90) {
    throw new Error(`${name}: Breite muss zwischen -90 und 90 liegen`);
  }
}

// Get profile parameter (car_customizable -> car)
function getProfileParam() {
  return getGraphHopperProfile(routeState.selectedProfile);
}

// Build GET request URL for route calculation
function buildGetRequestUrl(start, end, profileParam) {
  const baseUrl = `${GRAPHHOPPER_URL}/route?point=${start[1]},${start[0]}&point=${end[1]},${end[0]}&profile=${profileParam}&points_encoded=false&elevation=true`;
  const chDisableParam = profileParam === 'car' ? '&ch.disable=true' : '';
  const detailsParams = ['surface', 'mapillary_coverage', 'road_class', 'road_access', 'bicycle_infra']
    .map(d => `details=${d}`)
    .join('&');
  return `${baseUrl}${chDisableParam}&${detailsParams}&type=json`;
}

// Fetch route with GET request (with fallback for details format)
async function fetchRouteGet(url) {
  try {
    let response = await fetch(url);
    if (response.ok) return response;
    
    // Try comma-separated details format
    const urlComma = url.replace(/details=[^&]+/g, 'details=' + ['surface', 'mapillary_coverage', 'road_class', 'road_access', 'bicycle_infra'].join(','));
    response = await fetch(urlComma);
    if (response.ok) return response;
    
    // Try without details
    const urlNoDetails = url.replace(/&details=[^&]+/g, '').replace(/details=[^&]+&/g, '');
    response = await fetch(urlNoDetails);
    return response;
  } catch (error) {
    throw new Error(`Network error: ${error.message}. Make sure GraphHopper is running on ${GRAPHHOPPER_URL}`);
  }
}

// Extract coordinates from GraphHopper response
function extractCoordinates(path) {
  if (path.points && path.points.coordinates) {
    return path.points.coordinates;
  } else if (path.points && path.points.geometry && path.points.geometry.coordinates) {
    return path.points.geometry.coordinates;
  }
  throw new Error('Route points format not recognized. Response: ' + JSON.stringify(path).substring(0, 200));
}

// Normalize coordinates to [lng, lat] format
function normalizeCoordinates(coordinates) {
  return coordinates.map(coord => {
    if (Array.isArray(coord) && coord.length >= 2) {
      // If first value is <= 90, it's likely latitude - swap to [lng, lat]
      if (Math.abs(coord[0]) <= 90 && Math.abs(coord[1]) > 90) {
        return [coord[1], coord[0]];
      }
      return [coord[0], coord[1]];
    }
    return coord;
  });
}

// Extract elevation data from path
function extractElevation(path, coordinates) {
  let elevations = [];
  let hasElevation = false;
  
  // Check if coordinates include elevation (3rd value)
  if (coordinates.length > 0 && coordinates[0].length >= 3) {
    elevations = coordinates.map(coord => coord[2] || null);
    hasElevation = elevations.some(e => e !== null);
    // Remove elevation from coordinates for MapLibre
    coordinates = coordinates.map(coord => [coord[0], coord[1]]);
  } else if (path.points && path.points.elevation) {
    elevations = path.points.elevation;
    hasElevation = elevations && elevations.length > 0;
  } else if (path.elevation) {
    elevations = path.elevation;
    hasElevation = elevations && elevations.length > 0;
  }
  
  return { elevations, hasElevation, coordinates };
}

// Map detail arrays to coordinate arrays
function mapDetailsToCoordinates(detailArray, coordinatesLength) {
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
}

// Extract encoded values (details) from path
function extractEncodedValues(path, coordinates) {
  const encodedValues = {};
  
  // Extract from path.details
  if (path.details && Object.keys(path.details).length > 0) {
    Object.keys(path.details).forEach(detailKey => {
      const detailArray = path.details[detailKey];
      if (Array.isArray(detailArray) && detailArray.length > 0) {
        encodedValues[detailKey] = mapDetailsToCoordinates(detailArray, coordinates.length);
      }
    });
  }
  
  // Extract from instructions
  if (path.instructions && path.instructions.length > 0) {
    const timeArray = new Array(coordinates.length).fill(0);
    const distanceArray = new Array(coordinates.length).fill(0);
    const streetNameArray = new Array(coordinates.length).fill('');
    const mapillaryArray = new Array(coordinates.length).fill(null);
    
    path.instructions.forEach((inst) => {
      if (inst.interval && Array.isArray(inst.interval) && inst.interval.length === 2) {
        const [startIdx, endIdx] = inst.interval;
        for (let i = startIdx; i <= endIdx && i < coordinates.length; i++) {
          timeArray[i] = inst.time || 0;
          distanceArray[i] = inst.distance || 0;
          streetNameArray[i] = inst.street_name || '';
          if (inst.mapillary_coverage !== undefined) {
            mapillaryArray[i] = inst.mapillary_coverage;
          }
        }
      }
    });
    
    encodedValues.time = timeArray;
    encodedValues.distance = distanceArray;
    encodedValues.street_name = streetNameArray;
    if (mapillaryArray.some(v => v !== null)) {
      encodedValues.mapillary_coverage = mapillaryArray;
    }
  }
  
  return encodedValues;
}

// Format time display
function formatTime(timeSeconds) {
  const timeMinutes = Math.round(timeSeconds / 60);
  const timeHours = Math.floor(timeMinutes / 60);
  const timeMins = timeMinutes % 60;
  
  if (timeHours > 0) {
    return `${timeHours}h ${timeMins}min`;
  }
  return `${timeMinutes} min`;
}

// Generate route info HTML
function generateRouteInfoHTML(path) {
  const distance = (path.distance / 1000).toFixed(2);
  const timeSeconds = Math.round(path.time / 1000);
  const timeDisplay = formatTime(timeSeconds);
  
  const avgSpeed = timeSeconds > 0 
    ? (path.distance / 1000 / (path.time / 1000 / 3600)).toFixed(1)
    : '0.0';
  
  const ascend = path.ascend ? Math.round(path.ascend) : null;
  const descend = path.descend ? Math.round(path.descend) : null;
  const instructionCount = path.instructions ? path.instructions.length : null;
  const weight = path.weight ? path.weight.toFixed(2) : null;
  
  return `
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
}

export function setupRouting(map) {
  routeState.init(map);
  
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

  // Create source for route hover segment (highlighted segment on hover)
  if (!map.getSource('route-hover-segment')) {
    map.addSource('route-hover-segment', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }
  
  // Create layer for route line (on top of mapillary_coverage layer)
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
  
  // Create layer for route hover segment (highlighted segment on hover)
  if (!map.getLayer('route-hover-segment-layer')) {
    map.addLayer({
      id: 'route-hover-segment-layer',
      type: 'line',
      source: 'route-hover-segment',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 8,
        'line-opacity': 1.0
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
  routeState.isSelectingStart = true;
  if (map.getCanvas()) {
    map.getCanvas().style.cursor = 'crosshair';
  }
  
  // Mark start button as active
  const startBtn = document.getElementById('set-start');
  if (startBtn) {
    startBtn.classList.add('active');
  }
}

export async function calculateRoute(map, start, end) {
  // Prevent parallel route calculations
  if (routeCalculationInProgress) {
    console.warn('Route-Berechnung bereits in Arbeit, ignoriere neue Anfrage');
    return;
  }
  
  // Validate coordinates
  validateCoordinates(start, 'Startpunkt');
  validateCoordinates(end, 'Endpunkt');
  
  routeCalculationInProgress = true;
  const calculateBtn = document.getElementById('calculate-route');
  const routeInfo = document.getElementById('route-info');
  
  if (calculateBtn) {
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Berechne...';
  }

  try {
    // Prepare profile and custom model
    const profileParam = getProfileParam();
    
    // Ensure custom model is initialized if needed
    if (supportsCustomModel(routeState.selectedProfile)) {
      routeState.customModel = ensureCustomModel(routeState.customModel);
    }
    
    // Fetch route from GraphHopper API
    const hasCustomModel = supportsCustomModel(routeState.selectedProfile) && routeState.customModel;
    let response;
    
    if (hasCustomModel) {
      // POST request with JSON body
      const requestBody = buildPostRequestBodyWithCustomModel(
        start,
        end,
        routeState.selectedProfile,
        routeState.customModel
      );
      
      try {
        response = await fetch(`${GRAPHHOPPER_URL}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      } catch (error) {
        throw new Error(`Network error: ${error.message}. Make sure GraphHopper is running on ${GRAPHHOPPER_URL}`);
      }
    } else {
      // GET request with URL parameters
      const url = buildGetRequestUrl(start, end, profileParam);
      response = await fetchRouteGet(url);
    }
    
    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.paths && data.paths.length > 0) {
      const path = data.paths[0];
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
        // Map detail arrays to coordinate arrays for all available details
        // GraphHopper returns details as: [[startIdx, endIdx, value], ...]
        Object.keys(path.details).forEach(detailKey => {
          const detailArray = path.details[detailKey];
          if (Array.isArray(detailArray) && detailArray.length > 0) {
            encodedValues[detailKey] = mapDetailsToCoordinates(detailArray, coordinates.length);
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
              // Check if mapillary_coverage is in instruction or details
              if (inst.mapillary_coverage !== undefined) {
                customPresentArray[i] = inst.mapillary_coverage;
              }
            }
          }
        });
        
        // Store as encoded values for visualization
        encodedValues.time = timeArray;
        encodedValues.distance = distanceArray;
        encodedValues.street_name = streetNameArray;
        // Only set mapillary_coverage if we have values
        if (customPresentArray.some(v => v !== null)) {
          encodedValues.mapillary_coverage = customPresentArray;
        }
      }
      
      // Update route layer - will be colored by updateRouteColor based on selected encoded value
      // Initially set as single feature, will be updated by updateRouteColor
      map.getSource('route').setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          color: '#3b82f6'
        }
      });
      
      // Update layer to support property-based coloring
      map.setPaintProperty('route-layer', 'line-color', ['get', 'color']);
      
      // Update route color based on selected encoded value
      const select = document.getElementById('heightgraph-encoded-select');
      const selectedType = select ? select.value : 'mapillary_coverage';
      updateRouteColor(selectedType, encodedValues);
      
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
        routeState.currentRouteData = {
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
        updateRouteColor(routeState.currentEncodedType, encodedValues);
      }
      
      // Fit map to route
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      
      // Account for right-side panels (routing panel: 320px + context panel: 320px + margins)
      const rightPanelWidth = 320 + 10; // Panel width + right margin
      map.fitBounds(bounds, {
        padding: {
          top: 50,
          right: rightPanelWidth + 20, // Extra padding for visibility
          bottom: 50,
          left: 50
        }
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
    routeCalculationInProgress = false;
    if (calculateBtn) {
      calculateBtn.disabled = false;
      calculateBtn.textContent = 'Route berechnen';
    }
  }
}

export function clearRoute(map) {
  // Cleanup heightgraph event handlers
  cleanupHeightgraphHandlers();
  
  routeState.reset();
  map.getCanvas().style.cursor = '';
  
  map.getSource('route').setData({
    type: 'FeatureCollection',
    features: []
  });
  
  // Clear heightgraph hover point
  if (map.getSource('heightgraph-hover-point')) {
    map.getSource('heightgraph-hover-point').setData({
      type: 'FeatureCollection',
      features: []
    });
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
