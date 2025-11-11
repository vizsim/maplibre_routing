// Route visualization: colors, hover effects, mapillary_coverage highlighting

import { routeState } from './routeState.js';
import { getColorForEncodedValue } from './colorSchemes.js';

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
      const selectedType = select ? select.value : 'mapillary_coverage';
      
      // Get the value for the selected encoded type at this point
      let selectedValue = null;
      let valueLabel = '';
      
      if (selectedType === 'mapillary_coverage' && encodedValues.mapillary_coverage && 
          encodedValues.mapillary_coverage[closestIndex] !== undefined && 
          encodedValues.mapillary_coverage[closestIndex] !== null) {
        selectedValue = encodedValues.mapillary_coverage[closestIndex];
        valueLabel = 'Mapillary Coverage';
      } else if (selectedType === 'surface' && encodedValues.surface && 
                 encodedValues.surface[closestIndex] !== undefined && 
                 encodedValues.surface[closestIndex] !== null) {
        selectedValue = encodedValues.surface[closestIndex];
        valueLabel = 'Surface';
      } else if (selectedType === 'road_class' && encodedValues.road_class && 
                 encodedValues.road_class[closestIndex] !== undefined && 
                 encodedValues.road_class[closestIndex] !== null) {
        selectedValue = encodedValues.road_class[closestIndex];
        valueLabel = 'Road Class';
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

// Color function is now imported from colorSchemes.js

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

