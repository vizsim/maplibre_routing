// Heightgraph statistics calculation and display

import { routeState } from '../routeState.js';
import { calculateDistance } from './heightgraphUtils.js';
import { getSurfaceColorForStats, getRoadClassColorForStats, getBicycleInfraColorForStats } from './heightgraphDrawing.js';
import { getBicycleInfraDescription } from '../colorSchemes.js';

/**
 * Calculate and display statistics for the selected encoded value
 */
export function updateHeightgraphStats(encodedType, encodedValues) {
  const statsContainer = document.getElementById('heightgraph-stats');
  if (!statsContainer || !routeState.currentRouteData) {
    return;
  }
  
  const { encodedValues: allEncodedValues, coordinates } = routeState.currentRouteData;
  const data = allEncodedValues[encodedType];
  
  if (!data || data.length === 0 || !coordinates || coordinates.length === 0) {
    statsContainer.innerHTML = '';
    statsContainer.style.display = 'none';
    return;
  }
  
  const valueDistances = {};
  
  for (let i = 0; i < data.length - 1 && i < coordinates.length - 1; i++) {
    const value = data[i];
    
    if (value === null || value === undefined) {
      continue;
    }
    
    const segmentDistance = calculateDistance(coordinates[i], coordinates[i + 1]);
    
    let key;
    if (encodedType === 'mapillary_coverage') {
      const isTrue = value === true || value === 'True' || value === 'true';
      key = isTrue ? 'true' : 'false';
    } else {
      key = String(value);
    }
    
    if (!valueDistances[key]) {
      valueDistances[key] = 0;
    }
    valueDistances[key] += segmentDistance;
  }
  
  if (Object.keys(valueDistances).length === 0) {
    statsContainer.innerHTML = '';
    statsContainer.style.display = 'none';
    return;
  }
  
  let statsHTML = '';
  const sortedKeys = Object.keys(valueDistances).sort((a, b) => {
    return valueDistances[b] - valueDistances[a];
  });
  
  sortedKeys.forEach(key => {
    const distanceKm = (valueDistances[key] / 1000).toFixed(2);
    let displayKey = key;
    let backgroundColor = '';
    
    if (encodedType === 'mapillary_coverage') {
      displayKey = key === 'true' ? 'true' : 'false';
      backgroundColor = key === 'true' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(236, 72, 153, 0.15)';
    } else if (encodedType === 'surface') {
      backgroundColor = getSurfaceColorForStats(key);
    } else if (encodedType === 'road_class') {
      backgroundColor = getRoadClassColorForStats(key);
    } else if (encodedType === 'bicycle_infra') {
      backgroundColor = getBicycleInfraColorForStats(key);
      const description = getBicycleInfraDescription(key);
      if (description) {
        displayKey = description;
      } else {
        displayKey = displayKey.replace(/_/g, '<br>_');
      }
    }
    
    statsHTML += `<div class="heightgraph-stat-item" style="background-color: ${backgroundColor};">
      <span class="heightgraph-stat-label">${displayKey}</span>
      <span class="heightgraph-stat-value">${distanceKm} km</span>
    </div>`;
  });
  
  statsContainer.innerHTML = statsHTML;
  statsContainer.style.display = 'flex';
}

