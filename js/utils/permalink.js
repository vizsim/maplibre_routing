// permalink.js - Permalink functionality for map state, routing, and context layers

import { routeState } from '../routing/routeState.js';
import { updateMarkers } from '../routing/routingUI.js';

export class Permalink {
  constructor(map) {
    this.map = map;
    this.isUpdating = false;
    this.pendingRouteCalculation = false; // Flag to track if route should be calculated after map loads
    this.setupEventListeners();
    this.loadFromURL();
  }

  setupEventListeners() {
    // Update URL on map move/zoom (debounced)
    this.map.on('moveend', () => this.updateURL());
    this.map.on('zoomend', () => this.updateURL());
    
    // Wait for map to load before calculating route from URL
    this.map.once('load', () => {
      if (this.pendingRouteCalculation) {
        this.calculateRouteFromURL();
      }
    });
    
    // Update URL when route points change
    // We'll use a MutationObserver or polling to detect routeState changes
    // For now, we'll update on specific events
    this.setupRouteStateListeners();
    this.setupContextLayerListeners();
  }

  setupRouteStateListeners() {
    // Monitor routeState changes by checking periodically
    // This is a simple approach - could be improved with a state management system
    let lastState = this.getRouteStateSnapshot();
    
    const checkState = () => {
      const currentState = this.getRouteStateSnapshot();
      if (JSON.stringify(currentState) !== JSON.stringify(lastState)) {
        lastState = currentState;
        this.updateURL();
      }
    };
    
    // Check state changes periodically (debounced)
    setInterval(checkState, 500);
    
    // Also update immediately when encoded type changes
    const encodedSelect = document.getElementById('heightgraph-encoded-select');
    if (encodedSelect) {
      encodedSelect.addEventListener('change', () => {
        setTimeout(() => this.updateURL(), 100);
      });
    }
    
    // Update when profile changes
    document.querySelectorAll('.profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(() => this.updateURL(), 100);
      });
    });
  }

  setupContextLayerListeners() {
    // Listen to context layer checkbox changes
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleMissingStreets = document.getElementById('toggle-missing-streets');
    
    if (toggleBikelanes) {
      toggleBikelanes.addEventListener('change', () => {
        this.updateURL();
      });
    }
    
    if (toggleMissingStreets) {
      toggleMissingStreets.addEventListener('change', () => {
        this.updateURL();
      });
    }
  }

  getRouteStateSnapshot() {
    return {
      startPoint: routeState.startPoint,
      endPoint: routeState.endPoint,
      selectedProfile: routeState.selectedProfile,
      currentEncodedType: routeState.currentEncodedType
    };
  }

  updateURL() {
    if (this.isUpdating) return;
    
    const params = new URLSearchParams();
    
    // Map state
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const lng = Math.round(center.lng * 1000) / 1000;
    const lat = Math.round(center.lat * 1000) / 1000;
    const zoomRounded = Math.round(zoom * 10) / 10;
    
    params.set('map', `${zoomRounded}/${lat}/${lng}`);
    
    // Route points
    if (routeState.startPoint) {
      const [startLng, startLat] = routeState.startPoint;
      params.set('start', `${Math.round(startLat * 10000) / 10000},${Math.round(startLng * 10000) / 10000}`);
    }
    
    if (routeState.endPoint) {
      const [endLng, endLat] = routeState.endPoint;
      params.set('end', `${Math.round(endLat * 10000) / 10000},${Math.round(endLng * 10000) / 10000}`);
    }
    
    // Profile
    if (routeState.selectedProfile && routeState.selectedProfile !== 'car') {
      params.set('profile', routeState.selectedProfile);
    }
    
    // Encoded value type
    if (routeState.currentEncodedType && routeState.currentEncodedType !== 'mapillary_coverage') {
      params.set('encoded', routeState.currentEncodedType);
    }
    
    // Context layers
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleMissingStreets = document.getElementById('toggle-missing-streets');
    
    if (toggleBikelanes && toggleBikelanes.checked) {
      params.set('bikelanes', '1');
    }
    
    if (toggleMissingStreets && toggleMissingStreets.checked) {
      params.set('missingStreets', '1');
    }
    
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
  }

  loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    // Load map state
    const mapParam = params.get('map');
    if (mapParam) {
      const parts = mapParam.split('/');
      if (parts.length === 3) {
        const zoom = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        
        if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) {
          this.isUpdating = true;
          this.map.setCenter([lng, lat]);
          this.map.setZoom(zoom);
          setTimeout(() => {
            this.isUpdating = false;
          }, 100);
        }
      }
    }
    
    // Load route points
    const startParam = params.get('start');
    if (startParam) {
      const [lat, lng] = startParam.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        routeState.startPoint = [lng, lat];
        // Update input field
        const startInput = document.getElementById('start-input');
        if (startInput) {
          startInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
      }
    }
    
    const endParam = params.get('end');
    if (endParam) {
      const [lat, lng] = endParam.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        routeState.endPoint = [lng, lat];
        // Update input field
        const endInput = document.getElementById('end-input');
        if (endInput) {
          endInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
      }
    }
    
    // Update markers if points were loaded
    if (routeState.startPoint || routeState.endPoint) {
      updateMarkers(this.map);
    }
    
    // Load profile
    const profileParam = params.get('profile');
    if (profileParam) {
      routeState.selectedProfile = profileParam;
      // Update UI
      document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.profile === profileParam) {
          btn.classList.add('active');
        }
      });
    }
    
    // Load encoded value type
    const encodedParam = params.get('encoded');
    if (encodedParam) {
      routeState.currentEncodedType = encodedParam;
      // Update select dropdown
      const encodedSelect = document.getElementById('heightgraph-encoded-select');
      if (encodedSelect) {
        encodedSelect.value = encodedParam;
      }
    }
    
    // Load context layers
    // Store state for activation after map loads
    const bikelanesParam = params.get('bikelanes');
    const missingStreetsParam = params.get('missingStreets');
    
    if (bikelanesParam === '1' || missingStreetsParam === '1') {
      // Function to activate context layers
      const activateContextLayers = () => {
        if (bikelanesParam === '1') {
          const toggleBikelanes = document.getElementById('toggle-bikelanes');
          if (toggleBikelanes) {
            toggleBikelanes.checked = true;
            // Trigger change event to show layers
            toggleBikelanes.dispatchEvent(new Event('change'));
          }
        }
        
        if (missingStreetsParam === '1') {
          const toggleMissingStreets = document.getElementById('toggle-missing-streets');
          if (toggleMissingStreets) {
            toggleMissingStreets.checked = true;
            // Trigger change event to show layers
            // Retry if layers don't exist yet (they might be created asynchronously)
            let retryCount = 0;
            const maxRetries = 25; // 25 * 200ms = 5 seconds
            const activateMissingStreets = () => {
              const layers = [
                'missing-streets-missing-roads',
                'missing-streets-missing-bikelanes',
                'missing-streets-regular-roads',
                'missing-streets-regular-bikelanes',
                'missing-streets-pano-roads',
                'missing-streets-pano-bikelanes'
              ];
              const allLayersExist = layers.every(layerId => this.map.getLayer(layerId));
              
              if (allLayersExist) {
                toggleMissingStreets.dispatchEvent(new Event('change'));
              } else {
                // Retry after a short delay
                retryCount++;
                if (retryCount < maxRetries) {
                  setTimeout(activateMissingStreets, 200);
                } else {
                  console.warn('Permalink: Could not activate missingStreets layers - layers not available');
                }
              }
            };
            activateMissingStreets();
          }
        }
      };
      
      // Wait for map to load before activating layers
      if (this.map.loaded()) {
        // Map already loaded, wait a bit for layers to be created
        setTimeout(activateContextLayers, 500);
      } else {
        // Map not loaded yet, wait for load event
        this.map.once('load', () => {
          // Additional delay to ensure layers are created
          setTimeout(activateContextLayers, 500);
        });
      }
    }
    
    // If both start and end points are loaded, mark for route calculation
    // Route will be calculated after map is loaded and routing sources exist
    if (routeState.startPoint && routeState.endPoint) {
      this.pendingRouteCalculation = true;
      // If map is already loaded, calculate immediately
      if (this.map.loaded()) {
        this.calculateRouteFromURL();
      }
    }
  }

  calculateRouteFromURL() {
    // Check if routing sources exist (they should be created by setupRouting)
    // setupRouting is called in map.on('load'), so we need to wait for it
    let retryCount = 0;
    const maxRetries = 50; // Max 5 seconds (50 * 100ms)
    
    const checkAndCalculate = () => {
      if (this.map.getSource('route') && routeState.startPoint && routeState.endPoint) {
        import('../routing/routing.js').then(({ calculateRoute }) => {
          calculateRoute(this.map, routeState.startPoint, routeState.endPoint);
        });
        this.pendingRouteCalculation = false;
      } else if (this.pendingRouteCalculation && retryCount < maxRetries) {
        // Retry after a short delay if sources don't exist yet
        retryCount++;
        setTimeout(checkAndCalculate, 100);
      } else if (retryCount >= maxRetries) {
        // Give up after max retries
        console.warn('Permalink: Could not calculate route - routing sources not available');
        this.pendingRouteCalculation = false;
      }
    };
    
    // Start checking
    checkAndCalculate();
  }

  // Method to get current state as URL parameters
  getCurrentState() {
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    
    return {
      lng: Math.round(center.lng * 1000) / 1000,
      lat: Math.round(center.lat * 1000) / 1000,
      zoom: Math.round(zoom * 10) / 10,
      startPoint: routeState.startPoint,
      endPoint: routeState.endPoint,
      profile: routeState.selectedProfile,
      encodedType: routeState.currentEncodedType
    };
  }

  // Method to generate shareable URL
  getShareableURL() {
    const params = new URLSearchParams();
    
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const mapParam = `${Math.round(zoom * 10) / 10}/${Math.round(center.lat * 1000) / 1000}/${Math.round(center.lng * 1000) / 1000}`;
    params.set('map', mapParam);
    
    if (routeState.startPoint) {
      const [lng, lat] = routeState.startPoint;
      params.set('start', `${Math.round(lat * 10000) / 10000},${Math.round(lng * 10000) / 10000}`);
    }
    
    if (routeState.endPoint) {
      const [lng, lat] = routeState.endPoint;
      params.set('end', `${Math.round(lat * 10000) / 10000},${Math.round(lng * 10000) / 10000}`);
    }
    
    if (routeState.selectedProfile && routeState.selectedProfile !== 'car') {
      params.set('profile', routeState.selectedProfile);
    }
    
    if (routeState.currentEncodedType && routeState.currentEncodedType !== 'mapillary_coverage') {
      params.set('encoded', routeState.currentEncodedType);
    }
    
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleMissingStreets = document.getElementById('toggle-missing-streets');
    
    if (toggleBikelanes && toggleBikelanes.checked) {
      params.set('bikelanes', '1');
    }
    
    if (toggleMissingStreets && toggleMissingStreets.checked) {
      params.set('missingStreets', '1');
    }
    
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }
}

// Export a simple setup function
export function setupPermalink(map) {
  return new Permalink(map);
}
