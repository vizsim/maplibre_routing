// Route visualization: colors, hover effects, custom_present highlighting

import { routeState } from './routeState.js';

export function setupRouteHover(map) {
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
    if (routeState.currentRouteData && e.features && e.features.length > 0) {
      // Use original coordinates from routeState, not segment coordinates
      const { coordinates: originalCoordinates } = routeState.currentRouteData;
      const point = e.lngLat;
      
      if (!originalCoordinates || originalCoordinates.length === 0) {
        popup.remove();
        return;
      }
      
      // Find closest point on original route (not just the segment)
      let closestPoint = originalCoordinates[0];
      let closestIndex = 0;
      let minDist = Infinity;
      
      originalCoordinates.forEach((coord, idx) => {
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
      const { encodedValues } = routeState.currentRouteData;
      
      // Get selected encoded type from heightgraph dropdown
      const select = document.getElementById('heightgraph-encoded-select');
      const selectedType = select ? select.value : 'custom_present';
      
      // Get the value for the selected encoded type at this point
      let selectedValue = null;
      let valueLabel = '';
      
      if (selectedType === 'custom_present' && encodedValues.custom_present && 
          encodedValues.custom_present[closestIndex] !== undefined && 
          encodedValues.custom_present[closestIndex] !== null) {
        selectedValue = encodedValues.custom_present[closestIndex];
        valueLabel = 'Custom Present';
      } else if (selectedType === 'surface' && encodedValues.surface && 
                 encodedValues.surface[closestIndex] !== undefined && 
                 encodedValues.surface[closestIndex] !== null) {
        selectedValue = encodedValues.surface[closestIndex];
        valueLabel = 'Surface';
      }
      
      // Show popup only if we have a value for the selected type
      if (selectedValue !== null) {
        let displayValue = '';
        if (typeof selectedValue === 'boolean') {
          displayValue = selectedValue ? 'Ja' : 'Nein';
        } else {
          displayValue = String(selectedValue);
        }
        
        popup
          .setLngLat(closestPoint)
          .setHTML(`<div style="font-size: 12px; line-height: 1.4;"><strong>${valueLabel}:</strong> ${displayValue}</div>`)
          .addTo(map);
      } else {
        popup.remove();
      }
      
      // Clear hover buffer (no longer needed for highlighting)
      if (hoveredSegment !== null) {
        hoveredSegment = null;
        map.getSource('route-hover-buffer').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }
  });
}

// Helper function to get color for encoded value
function getColorForEncodedValue(encodedType, value, allValues = []) {
  if (value === null || value === undefined) {
    return '#9ca3af'; // Gray for null/undefined
  }
  
  if (encodedType === 'custom_present') {
    const isCustomPresent = value === true || value === 'True' || value === 'true';
    return isCustomPresent ? '#3b82f6' : '#ec4899'; // Blue for true, Pink for false
  }
  
  if (encodedType === 'surface') {
    const surfaceColors = {
      'asphalt': '#22c55e',      // Green
      'concrete': '#f97316',      // Orange
      'paved': '#3b82f6',        // Blue
      'unpaved': '#a855f7',       // Purple
      'gravel': '#ec4899',        // Pink
      'dirt': '#78350f',          // Brown
      'sand': '#eab308',          // Yellow
      'grass': '#16a34a',         // Dark green
      'ground': '#78350f',        // Brown
      'compacted': '#6b7280',     // Gray
      'fine_gravel': '#fb923c',   // Light orange
      'pebblestone': '#a855f7',  // Purple
      'cobblestone': '#6366f1',   // Indigo
      'wood': '#b45309',          // Dark orange
      'metal': '#475569',         // Slate
      'sett': '#6366f1',          // Indigo
      'paving_stones': '#0ea5e9'  // Sky blue
    };
    const normalizedValue = String(value).toLowerCase();
    return surfaceColors[normalizedValue] || '#9ca3af'; // Default gray
  }
  
  if (encodedType === 'elevation' || encodedType === 'time' || encodedType === 'distance') {
    // Numeric data - use gradient color
    const validValues = allValues.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return '#3b82f6';
    
    const minValue = Math.min(...validValues);
    const maxValue = Math.max(...validValues);
    const range = maxValue - minValue || 1;
    const normalized = (value - minValue) / range;
    
    if (normalized < 0.25) return '#3b82f6'; // Blue
    else if (normalized < 0.5) return '#10b981'; // Green
    else if (normalized < 0.75) return '#f59e0b'; // Orange
    else return '#ef4444'; // Red
  }
  
  // Categorical data - assign colors based on unique values
  const uniqueValues = [...new Set(allValues.filter(v => v !== null && v !== undefined && v !== ''))];
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];
  const valueIndex = uniqueValues.indexOf(value);
  return valueIndex >= 0 ? colors[valueIndex % colors.length] : '#9ca3af';
}

export function updateRouteColor(encodedType, encodedValues) {
  if (!routeState.mapInstance || !routeState.currentRouteData) return;
  
  const { coordinates } = routeState.currentRouteData;
  const { elevations, encodedValues: allEncodedValues } = routeState.currentRouteData;
  const data = encodedType === 'elevation' ? elevations : (allEncodedValues[encodedType] || []);
  
  if (!data || data.length === 0 || !coordinates || coordinates.length === 0) {
    // Default: single segment with default color
    routeState.mapInstance.getSource('route').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates || []
      },
      properties: {
        color: '#3b82f6'
      }
    });
    
    // Update layer to use property-based coloring
    routeState.mapInstance.setPaintProperty('route-layer', 'line-color', ['get', 'color']);
    return;
  }
  
  // Create segments based on encoded value
  const segments = [];
  let currentSegment = null;
  let currentValue = null;
  
  // Helper function to normalize values for comparison (treat null and undefined as equal)
  const normalizeValue = (val) => {
    if (val === null || val === undefined) return null;
    return val;
  };
  
  coordinates.forEach((coord, index) => {
    const value = normalizeValue(data[index]);
    const normalizedCurrentValue = normalizeValue(currentValue);
    
    // Check if value changed or is first point
    if (value !== normalizedCurrentValue || index === 0) {
      // Save previous segment if exists
      if (currentSegment !== null && currentSegment.length > 0) {
        // Always add the current point to close the previous segment (to avoid gaps)
        // This ensures seamless connection between segments
        const segmentToSave = [...currentSegment, coord];
        
        // Only add segment if it has at least 2 points
        if (segmentToSave.length > 1) {
          const color = getColorForEncodedValue(encodedType, currentValue, data);
          segments.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: segmentToSave
            },
            properties: {
              color: color,
              value: currentValue
            }
          });
        }
      }
      
      // Start new segment with current point (which is also the last point of previous segment)
      // This ensures no gaps between segments
      currentSegment = [coord];
      currentValue = data[index]; // Store original value, not normalized
    } else {
      // Continue current segment
      currentSegment.push(coord);
    }
  });
  
  // Add final segment (must have at least 2 points)
  if (currentSegment !== null && currentSegment.length > 1) {
    const color = getColorForEncodedValue(encodedType, currentValue, data);
    segments.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: currentSegment
      },
      properties: {
        color: color,
        value: currentValue
      }
    });
  } else if (currentSegment !== null && currentSegment.length === 1 && segments.length > 0) {
    // If final segment has only one point, merge it with the last segment
    const lastSegment = segments[segments.length - 1];
    lastSegment.geometry.coordinates.push(currentSegment[0]);
  }
  
  // Update route source with segments
  routeState.mapInstance.getSource('route').setData({
    type: 'FeatureCollection',
    features: segments
  });
  
  // Update layer to use property-based coloring
  routeState.mapInstance.setPaintProperty('route-layer', 'line-color', ['get', 'color']);
}

export function updateRouteColorByProfile(map, profile) {
  const colorMap = {
    'car': '#3b82f6',
    'car_custom': '#8b5cf6',
    'bike': '#10b981',
    'my_bike_cycleways': '#f59e0b',
    'cargo_bike': '#ef4444',
    'racingbike': '#06b6d4',
    'mtb': '#ec4899'
  };

  const color = colorMap[profile] || '#3b82f6';

  map.setPaintProperty('route-layer', 'line-color', color);
}

