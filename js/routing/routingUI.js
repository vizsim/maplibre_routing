// Routing UI handlers: buttons, inputs, markers, geocoding

import { routeState } from './routeState.js';
import { updateRouteColorByProfile } from './routeVisualization.js';
import { exportRouteToGPX } from './gpxExport.js';
import {
  supportsCustomModel,
  ensureCustomModel,
  getMapillaryPriority,
  updateMapillaryPriority
} from './customModel.js';

export function setupUIHandlers(map) {
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
      routeState.selectedProfile = btn.dataset.profile;
      
      // Set default custom model if car_customizable is selected and no custom model is set
      if (supportsCustomModel(routeState.selectedProfile)) {
        routeState.customModel = ensureCustomModel(routeState.customModel);
      }
      
      // Show/hide customizable slider
      const sliderContainer = document.getElementById('customizable-slider-container');
      if (sliderContainer) {
        if (supportsCustomModel(routeState.selectedProfile)) {
          sliderContainer.style.display = 'block';
          // Initialize slider value from customModel
          const multiplyBy = getMapillaryPriority(routeState.customModel);
          if (multiplyBy !== null && multiplyBy !== undefined) {
            const slider = document.getElementById('mapillary-priority-slider');
            const sliderValue = document.getElementById('slider-value');
            if (slider) {
              // Map the multiply_by value to slider index
              const sliderValues = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 1.0];
              const index = sliderValues.findIndex(v => Math.abs(v - multiplyBy) < 0.001);
              if (index !== -1) {
                slider.value = index;
                if (sliderValue) {
                  const inverseValue = (1 / multiplyBy).toFixed(0);
                  sliderValue.textContent = `${multiplyBy.toFixed(2)} (×${inverseValue})`;
                }
              }
            }
          }
        } else {
          sliderContainer.style.display = 'none';
        }
      }
      
      // Update route color based on profile
      updateRouteColorByProfile(map, routeState.selectedProfile);
      
      // If route already exists, recalculate with new profile
      if (routeState.startPoint && routeState.endPoint) {
        // Import dynamically to avoid circular dependency
        import('./routing.js').then(({ calculateRoute }) => {
          calculateRoute(map, routeState.startPoint, routeState.endPoint);
        });
      }
    });
  });
  
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
      routeState.isSelectingStart = true;
      routeState.isSelectingEnd = false;
      map.getCanvas().style.cursor = 'crosshair';
      startBtn.classList.add('active');
      if (endBtn) endBtn.classList.remove('active');
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', () => {
      routeState.isSelectingEnd = true;
      routeState.isSelectingStart = false;
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
      // Import dynamically to avoid circular dependency
      import('./routing.js').then(({ clearRoute }) => {
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
    });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', () => {
      if (routeState.startPoint && routeState.endPoint) {
        // Import dynamically to avoid circular dependency
        import('./routing.js').then(({ calculateRoute }) => {
          calculateRoute(map, routeState.startPoint, routeState.endPoint);
        });
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
  
  // Mapillary priority slider for car_customizable profile
  const mapillarySlider = document.getElementById('mapillary-priority-slider');
  const sliderValueDisplay = document.getElementById('slider-value');
  if (mapillarySlider) {
    // Define slider values with custom steps
    const sliderValues = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 1.0];
    
    mapillarySlider.addEventListener('input', (e) => {
      const index = parseInt(e.target.value);
      const value = sliderValues[index];
      
      if (sliderValueDisplay) {
        // Show inverse value to make it more intuitive (smaller multiply_by = higher priority)
        const inverseValue = (1 / value).toFixed(0);
        sliderValueDisplay.textContent = `${value.toFixed(2)} (×${inverseValue})`;
      }
      
      // Update customModel if car_customizable is selected
      if (supportsCustomModel(routeState.selectedProfile) && routeState.customModel) {
        updateMapillaryPriority(routeState.customModel, value);
        
        // Recalculate route if both points are set
        if (routeState.startPoint && routeState.endPoint) {
          import('./routing.js').then(({ calculateRoute }) => {
            calculateRoute(map, routeState.startPoint, routeState.endPoint);
          });
        }
      }
    });
  }

  // Map click handler
  map.on('click', (e) => {
    if (routeState.isSelectingStart) {
      setStartPoint(map, e.lngLat);
      routeState.isSelectingStart = false;
      if (startBtn) startBtn.classList.remove('active');
      
      // Automatically activate end point selection mode
      routeState.isSelectingEnd = true;
      map.getCanvas().style.cursor = 'crosshair';
      if (endBtn) endBtn.classList.add('active');
    } else if (routeState.isSelectingEnd) {
      setEndPoint(map, e.lngLat);
      routeState.isSelectingEnd = false;
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
          routeState.isSelectingStart = false;
          routeState.isSelectingEnd = true;
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

export function setStartPoint(map, lngLat) {
  routeState.startPoint = [lngLat.lng, lngLat.lat];
  updateMarkers(map);
  
  const startInput = document.getElementById('start-input');
  if (startInput) {
    startInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  }
  
  // Automatically calculate route if both points are set
  if (routeState.startPoint && routeState.endPoint) {
    // Import dynamically to avoid circular dependency
    import('./routing.js').then(({ calculateRoute }) => {
      calculateRoute(map, routeState.startPoint, routeState.endPoint);
    });
  }
}

export function setEndPoint(map, lngLat) {
  routeState.endPoint = [lngLat.lng, lngLat.lat];
  updateMarkers(map);
  
  const endInput = document.getElementById('end-input');
  if (endInput) {
    endInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
  }
  
  // Automatically calculate route if both points are set
  if (routeState.startPoint && routeState.endPoint) {
    // Import dynamically to avoid circular dependency
    import('./routing.js').then(({ calculateRoute }) => {
      calculateRoute(map, routeState.startPoint, routeState.endPoint);
    });
  }
}

export function updateMarkers(map) {
  // Remove existing markers
  if (routeState.startMarker) {
    routeState.startMarker.remove();
    routeState.startMarker = null;
  }
  if (routeState.endMarker) {
    routeState.endMarker.remove();
    routeState.endMarker = null;
  }
  
  // Create draggable start marker with pin icon
  if (routeState.startPoint) {
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
    
    routeState.startMarker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom'
    })
      .setLngLat(routeState.startPoint)
      .addTo(map);
    
    routeState.startMarker.on('dragstart', () => {
      el.style.cursor = 'grabbing';
    });
    
    routeState.startMarker.on('dragend', () => {
      el.style.cursor = 'grab';
      const lngLat = routeState.startMarker.getLngLat();
      routeState.startPoint = [lngLat.lng, lngLat.lat];
      
      const startInput = document.getElementById('start-input');
      if (startInput) {
        startInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
      }
      
      // Recalculate route if end point exists
      if (routeState.endPoint) {
        // Import dynamically to avoid circular dependency
        import('./routing.js').then(({ calculateRoute }) => {
          calculateRoute(map, routeState.startPoint, routeState.endPoint);
        });
      }
    });
  }
  
  // Create draggable end marker with pin icon
  if (routeState.endPoint) {
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
    
    routeState.endMarker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom'
    })
      .setLngLat(routeState.endPoint)
      .addTo(map);
    
    routeState.endMarker.on('dragstart', () => {
      el.style.cursor = 'grabbing';
    });
    
    routeState.endMarker.on('dragend', () => {
      el.style.cursor = 'grab';
      const lngLat = routeState.endMarker.getLngLat();
      routeState.endPoint = [lngLat.lng, lngLat.lat];
      
      const endInput = document.getElementById('end-input');
      if (endInput) {
        endInput.value = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
      }
      
      // Recalculate route if start point exists
      if (routeState.startPoint) {
        // Import dynamically to avoid circular dependency
        import('./routing.js').then(({ calculateRoute }) => {
          calculateRoute(map, routeState.startPoint, routeState.endPoint);
        });
      }
    });
  }
}

export async function geocodeAddress(query) {
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

