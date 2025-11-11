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
      const { encodedValues, elevations } = routeState.currentRouteData;
      
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

export function updateRouteColor(encodedType, encodedValues) {
  if (!routeState.mapInstance || !routeState.currentRouteData) return;
  
  const { elevations, encodedValues: allEncodedValues } = routeState.currentRouteData;
  const data = encodedType === 'elevation' ? elevations : (allEncodedValues[encodedType] || []);
  
  if (!data || data.length === 0) {
    // Default color if no data
    routeState.mapInstance.setPaintProperty('route-layer', 'line-color', '#3b82f6');
    return;
  }
  
  // For now, use average color - in a full implementation, we'd need to create segments
  const validValues = data.filter(v => v !== null && v !== undefined);
  if (validValues.length === 0) {
    routeState.mapInstance.setPaintProperty('route-layer', 'line-color', '#3b82f6');
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
    
    routeState.mapInstance.setPaintProperty('route-layer', 'line-color', color);
  } else {
    // Categorical data
    const uniqueValues = [...new Set(data.filter(v => v !== null && v !== undefined && v !== ''))];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const firstValue = data.find(v => v !== null && v !== undefined && v !== '');
    if (firstValue !== undefined) {
      const valueIndex = uniqueValues.indexOf(firstValue);
      const color = colors[valueIndex % colors.length];
      routeState.mapInstance.setPaintProperty('route-layer', 'line-color', color);
    }
  }
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

