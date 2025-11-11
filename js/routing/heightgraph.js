// Heightgraph visualization and interactivity

import { routeState } from './routeState.js';
import { updateRouteColor } from './routeVisualization.js';

// Store event handlers to prevent duplicate listeners
let heightgraphMouseMoveHandler = null;
let heightgraphMouseLeaveHandler = null;
let routeHighlightMarker = null;

// Store resize handler to prevent duplicate listeners
let heightgraphResizeHandler = null;

export function setupHeightgraphHandlers() {
  const select = document.getElementById('heightgraph-encoded-select');
  if (select) {
    select.addEventListener('change', () => {
      routeState.currentEncodedType = select.value;
      // Re-draw heightgraph when selection changes
      if (routeState.currentRouteData) {
        const { elevations, distance, encodedValues } = routeState.currentRouteData;
        drawHeightgraph(elevations || [], distance, encodedValues || {}, routeState.currentRouteData?.coordinates || []);
        // Update route color on map
        updateRouteColor(routeState.currentEncodedType, encodedValues || {});
        // Update stats
        updateHeightgraphStats(routeState.currentEncodedType, encodedValues || {});
      }
    });
  }
  
  // Add resize handler to redraw chart when window size changes
  if (heightgraphResizeHandler) {
    window.removeEventListener('resize', heightgraphResizeHandler);
  }
  
  heightgraphResizeHandler = () => {
    // Debounce resize events
    clearTimeout(heightgraphResizeHandler.timeout);
    heightgraphResizeHandler.timeout = setTimeout(() => {
      if (routeState.currentRouteData) {
        const select = document.getElementById('heightgraph-encoded-select');
        const currentType = select ? select.value : routeState.currentEncodedType;
        const { elevations, distance, encodedValues } = routeState.currentRouteData;
        drawHeightgraph(elevations || [], distance, encodedValues || {}, routeState.currentRouteData?.coordinates || []);
        // Update route color on map
        updateRouteColor(currentType, encodedValues || {});
        // Update stats
        updateHeightgraphStats(currentType, encodedValues || {});
      }
    }, 150);
  };
  
  window.addEventListener('resize', heightgraphResizeHandler);
}

export function drawHeightgraph(elevations, totalDistance, encodedValues = {}, coordinates = [], skipInteractivity = false) {
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
  
  // Set canvas size - use more of the available width
  // Ensure width doesn't exceed container width to prevent overflow
  const maxWidth = container.clientWidth || 320; // Fallback to 320 if clientWidth is 0
  const width = Math.max(100, maxWidth); // Minimum 100px width
  const height = 150;
  canvas.width = width;
  canvas.height = height;
  // Ensure CSS size matches actual canvas size to avoid scaling issues
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.style.maxWidth = '100%'; // Prevent overflow
  
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
  
  // Padding - minimal padding to maximize chart width
  const padding = { top: 20, right: 5, bottom: 30, left: 25 };
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
      ctx.fillText(labelText, padding.left - 3, y + 3);
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
      
      // Fill area under elevation curve based on selected encoded value
      const selectedType = select ? select.value : 'custom_present';
      
      if (selectedType === 'custom_present' && encodedValues.custom_present && encodedValues.custom_present.length > 0 && points.length > 0) {
        // Fill segment by segment based on custom_present
        // Group consecutive segments with the same value to avoid gaps
        let currentValue = null;
        let segmentStart = 0;
        
        for (let i = 0; i < points.length; i++) {
          const customValue = encodedValues.custom_present[points[i].index];
          const isCustomPresent = customValue === true || customValue === 'True' || customValue === 'true';
          
          if (isCustomPresent !== currentValue) {
            // Fill previous segment if exists
            if (currentValue !== null && i > segmentStart) {
              const fillColor = currentValue 
                ? 'rgba(59, 130, 246, 0.3)'  // Blue for true
                : 'rgba(236, 72, 153, 0.3)'; // Pink/rosa for false
              
              ctx.fillStyle = fillColor;
              ctx.beginPath();
              ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
              for (let j = segmentStart + 1; j < i; j++) {
                ctx.lineTo(points[j].x, points[j].y);
              }
              // Include the transition point to avoid gaps
              if (i < points.length) {
                ctx.lineTo(points[i].x, points[i].y);
              }
              ctx.lineTo(points[i < points.length ? i : i - 1].x, padding.top + graphHeight);
              ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
              ctx.closePath();
              ctx.fill();
            }
            
            // Start new segment
            currentValue = isCustomPresent;
            segmentStart = i;
          }
        }
        
        // Fill final segment
        if (currentValue !== null && segmentStart < points.length) {
          const fillColor = currentValue 
            ? 'rgba(59, 130, 246, 0.3)'  // Blue for true
            : 'rgba(236, 72, 153, 0.3)'; // Pink/rosa for false
          
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
          for (let j = segmentStart + 1; j < points.length; j++) {
            ctx.lineTo(points[j].x, points[j].y);
          }
          ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
          ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
          ctx.closePath();
          ctx.fill();
        }
      } else if (selectedType === 'surface' && encodedValues.surface && encodedValues.surface.length > 0 && points.length > 0) {
        // Fill segment by segment based on surface
        // Group consecutive segments with the same surface value
        let currentSurface = null;
        let segmentStart = 0;
        
        for (let i = 0; i < points.length; i++) {
          const surfaceValue = encodedValues.surface[points[i].index];
          
          if (surfaceValue !== currentSurface) {
            // Fill previous segment if exists
            if (currentSurface !== null && i > segmentStart) {
              const fillColor = getSurfaceColor(currentSurface);
              ctx.fillStyle = fillColor;
              ctx.beginPath();
              ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
              for (let j = segmentStart + 1; j < i; j++) {
                ctx.lineTo(points[j].x, points[j].y);
              }
              // Include the transition point to avoid gaps
              if (i < points.length) {
                ctx.lineTo(points[i].x, points[i].y);
              }
              ctx.lineTo(points[i < points.length ? i : i - 1].x, padding.top + graphHeight);
              ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
              ctx.closePath();
              ctx.fill();
            }
            
            // Start new segment
            currentSurface = surfaceValue;
            segmentStart = i;
          }
        }
        
        // Fill final segment
        if (currentSurface !== null && segmentStart < points.length) {
          const fillColor = getSurfaceColor(currentSurface);
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
          for (let j = segmentStart + 1; j < points.length; j++) {
            ctx.lineTo(points[j].x, points[j].y);
          }
          ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
          ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
          ctx.closePath();
          ctx.fill();
        }
      } else if (selectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class.length > 0 && points.length > 0) {
        // Fill segment by segment based on road_class
        // Group consecutive segments with the same road_class value
        let currentRoadClass = null;
        let segmentStart = 0;
        
        for (let i = 0; i < points.length; i++) {
          const roadClassValue = encodedValues.road_class[points[i].index];
          
          if (roadClassValue !== currentRoadClass) {
            // Fill previous segment if exists
            if (currentRoadClass !== null && i > segmentStart) {
              const fillColor = getRoadClassColor(currentRoadClass);
              ctx.fillStyle = fillColor;
              ctx.beginPath();
              ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
              for (let j = segmentStart + 1; j < i; j++) {
                ctx.lineTo(points[j].x, points[j].y);
              }
              // Include the transition point to avoid gaps
              if (i < points.length) {
                ctx.lineTo(points[i].x, points[i].y);
              }
              ctx.lineTo(points[i < points.length ? i : i - 1].x, padding.top + graphHeight);
              ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
              ctx.closePath();
              ctx.fill();
            }
            
            // Start new segment
            currentRoadClass = roadClassValue;
            segmentStart = i;
          }
        }
        
        // Fill final segment
        if (currentRoadClass !== null && segmentStart < points.length) {
          const fillColor = getRoadClassColor(currentRoadClass);
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(points[segmentStart].x, points[segmentStart].y);
          for (let j = segmentStart + 1; j < points.length; j++) {
            ctx.lineTo(points[j].x, points[j].y);
          }
          ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
          ctx.lineTo(points[segmentStart].x, padding.top + graphHeight);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Fallback: fill with default blue if no encoded value data
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.lineTo(padding.left + graphWidth, padding.top + graphHeight);
        ctx.lineTo(padding.left, padding.top + graphHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  
  // Draw distance labels on x-axis with dynamic step size based on total distance
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  
  const totalDistanceKm = totalDistance / 1000;
  const maxTicks = 8; // Maximum number of ticks to avoid overcrowding
  
  // Determine appropriate step size based on total distance
  // Try different step sizes and pick one that gives reasonable number of ticks
  let stepSize;
  let useHalfSteps = false;
  
  // Try step sizes in order: 0.5, 1, 2, 5, 10, 20, 50, ...
  const possibleStepSizes = [0.5, 1, 2, 5, 10, 20, 50, 100];
  
  for (const candidateStepSize of possibleStepSizes) {
    const numTicks = Math.ceil(totalDistanceKm / candidateStepSize);
    if (numTicks <= maxTicks || candidateStepSize === possibleStepSizes[possibleStepSizes.length - 1]) {
      stepSize = candidateStepSize;
      useHalfSteps = (candidateStepSize === 0.5);
      break;
    }
  }
  
  // Generate ticks based on step size
  const ticks = [];
  if (useHalfSteps) {
    // For 0.5 km steps: 0.5, 1.0, 1.5, 2.0, ...
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      const roundedDistance = Math.round(distance * 10) / 10;
      ticks.push(roundedDistance);
    }
  } else {
    // For whole number steps: 1, 2, 3, ... or 2, 4, 6, ... or 5, 10, 15, ...
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      ticks.push(distance);
    }
  }
  
  // Draw ticks
  for (const distance of ticks) {
    // Calculate x position based on distance ratio to total distance
    const distanceRatio = totalDistanceKm > 0 ? distance / totalDistanceKm : 0;
    const x = padding.left + graphWidth * distanceRatio;
    
    // Only draw if within bounds
    if (x >= padding.left && x <= padding.left + graphWidth) {
      // Format: show whole numbers without .0, decimals with .1
      const labelText = (distance % 1 === 0 ? distance.toFixed(0) : distance.toFixed(1)) + ' km';
      ctx.fillText(labelText, x, height - 5);
    }
  }
  
  // Setup interactive hover (only if not skipped)
  if (!skipInteractivity) {
    // Also setup indicator canvas
    const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
    if (indicatorCanvas) {
      indicatorCanvas.width = canvas.width;
      indicatorCanvas.height = canvas.height;
      // Ensure CSS size matches actual canvas size to avoid scaling issues
      indicatorCanvas.style.width = canvas.width + 'px';
      indicatorCanvas.style.height = canvas.height + 'px';
    }
    setupHeightgraphInteractivity(canvas, baseData, totalDistance, coordinates);
  }
  
  // Update stats
  const statsSelectedType = select ? select.value : 'custom_present';
  updateHeightgraphStats(statsSelectedType, encodedValues);
}

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(coord1, coord2) {
  const R = 6371000; // Earth radius in meters
  const lat1 = coord1[1] * Math.PI / 180;
  const lat2 = coord2[1] * Math.PI / 180;
  const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

// Calculate and display statistics for the selected encoded value
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
  
  // Calculate distance sums for each value
  // Instead of using distance array (which contains segment distances), 
  // calculate actual distances between consecutive coordinates
  const valueDistances = {};
  
  for (let i = 0; i < data.length - 1 && i < coordinates.length - 1; i++) {
    const value = data[i];
    
    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }
    
    // Calculate distance between this point and the next
    const segmentDistance = calculateDistance(coordinates[i], coordinates[i + 1]);
    
    // Normalize value for key (treat boolean-like values consistently)
    let key;
    if (encodedType === 'custom_present') {
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
  
  // Build HTML
  if (Object.keys(valueDistances).length === 0) {
    statsContainer.innerHTML = '';
    statsContainer.style.display = 'none';
    return;
  }
  
  let statsHTML = '';
  // Sort by distance (highest first)
  const sortedKeys = Object.keys(valueDistances).sort((a, b) => {
    return valueDistances[b] - valueDistances[a];
  });
  
  sortedKeys.forEach(key => {
    const distanceKm = (valueDistances[key] / 1000).toFixed(2);
    let displayKey = key;
    let backgroundColor = '';
    
    if (encodedType === 'custom_present') {
      displayKey = key === 'true' ? 'true' : 'false';
      // Use same colors as route visualization: blue for true, pink for false
      backgroundColor = key === 'true' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(236, 72, 153, 0.15)';
    } else if (encodedType === 'surface') {
      // Get surface color and make it lighter for background
      const surfaceColor = getSurfaceColorForStats(key);
      backgroundColor = surfaceColor;
    } else if (encodedType === 'road_class') {
      // Get road_class color and make it lighter for background
      const roadClassColor = getRoadClassColorForStats(key);
      backgroundColor = roadClassColor;
    }
    
    statsHTML += `<div class="heightgraph-stat-item" style="background-color: ${backgroundColor};">
      <span class="heightgraph-stat-label">${displayKey}</span>
      <span class="heightgraph-stat-value">${distanceKm} km</span>
    </div>`;
  });
  
  statsContainer.innerHTML = statsHTML;
  statsContainer.style.display = 'flex';
}

// Helper function to get color for surface value (for heightgraph fill)
function getSurfaceColor(surfaceValue) {
  if (!surfaceValue) return 'rgba(156, 163, 175, 0.3)'; // Gray for null/undefined
  
  const surfaceColors = {
    'asphalt': 'rgba(34, 197, 94, 0.3)',      // Green
    'concrete': 'rgba(249, 115, 22, 0.3)',     // Orange
    'paved': 'rgba(59, 130, 246, 0.3)',       // Blue
    'unpaved': 'rgba(168, 85, 247, 0.3)',     // Purple
    'gravel': 'rgba(236, 72, 153, 0.3)',      // Pink
    'dirt': 'rgba(120, 53, 15, 0.3)',         // Brown
    'sand': 'rgba(234, 179, 8, 0.3)',         // Yellow
    'grass': 'rgba(22, 163, 74, 0.3)',        // Dark green
    'ground': 'rgba(120, 53, 15, 0.3)',       // Brown
    'compacted': 'rgba(107, 114, 128, 0.3)',  // Gray
    'fine_gravel': 'rgba(251, 146, 60, 0.3)', // Light orange
    'pebblestone': 'rgba(168, 85, 247, 0.3)',  // Purple
    'cobblestone': 'rgba(99, 102, 241, 0.3)', // Indigo
    'wood': 'rgba(180, 83, 9, 0.3)',          // Dark orange
    'metal': 'rgba(71, 85, 105, 0.3)',        // Slate
    'sett': 'rgba(99, 102, 241, 0.3)',        // Indigo
    'paving_stones': 'rgba(14, 165, 233, 0.3)' // Sky blue
  };
  
  const normalizedValue = String(surfaceValue).toLowerCase();
  return surfaceColors[normalizedValue] || 'rgba(156, 163, 175, 0.3)'; // Default gray
}

// Helper function to get background color for surface value in stats (lighter version)
function getSurfaceColorForStats(surfaceValue) {
  if (!surfaceValue) return 'rgba(156, 163, 175, 0.15)'; // Gray for null/undefined
  
  const surfaceColors = {
    'asphalt': 'rgba(34, 197, 94, 0.15)',      // Green
    'concrete': 'rgba(249, 115, 22, 0.15)',     // Orange
    'paved': 'rgba(59, 130, 246, 0.15)',       // Blue
    'unpaved': 'rgba(168, 85, 247, 0.15)',     // Purple
    'gravel': 'rgba(236, 72, 153, 0.15)',      // Pink
    'dirt': 'rgba(120, 53, 15, 0.15)',         // Brown
    'sand': 'rgba(234, 179, 8, 0.15)',         // Yellow
    'grass': 'rgba(22, 163, 74, 0.15)',        // Dark green
    'ground': 'rgba(120, 53, 15, 0.15)',       // Brown
    'compacted': 'rgba(107, 114, 128, 0.15)',  // Gray
    'fine_gravel': 'rgba(251, 146, 60, 0.15)', // Light orange
    'pebblestone': 'rgba(168, 85, 247, 0.15)',  // Purple
    'cobblestone': 'rgba(99, 102, 241, 0.15)', // Indigo
    'wood': 'rgba(180, 83, 9, 0.15)',          // Dark orange
    'metal': 'rgba(71, 85, 105, 0.15)',        // Slate
    'sett': 'rgba(99, 102, 241, 0.15)',        // Indigo
    'paving_stones': 'rgba(14, 165, 233, 0.15)' // Sky blue
  };
  
  const normalizedValue = String(surfaceValue).toLowerCase();
  return surfaceColors[normalizedValue] || 'rgba(156, 163, 175, 0.15)'; // Default gray
}

// Helper function to get color for road_class value (for heightgraph fill)
function getRoadClassColor(roadClassValue) {
  if (!roadClassValue) return 'rgba(156, 163, 175, 0.3)'; // Gray for null/undefined
  
  const roadClassColors = {
    'motorway': 'rgba(220, 38, 38, 0.3)',      // Red
    'trunk': 'rgba(239, 68, 68, 0.3)',         // Light red
    'primary': 'rgba(249, 115, 22, 0.3)',      // Orange
    'secondary': 'rgba(234, 179, 8, 0.3)',     // Yellow
    'tertiary': 'rgba(34, 197, 94, 0.3)',      // Green
    'unclassified': 'rgba(59, 130, 246, 0.3)', // Blue
    'residential': 'rgba(168, 85, 247, 0.3)',   // Purple
    'service': 'rgba(236, 72, 153, 0.3)',      // Pink
    'track': 'rgba(120, 53, 15, 0.3)',         // Brown
    'path': 'rgba(107, 114, 128, 0.3)',        // Gray
    'cycleway': 'rgba(14, 165, 233, 0.3)',    // Sky blue
    'footway': 'rgba(22, 163, 74, 0.3)',       // Dark green
    'steps': 'rgba(180, 83, 9, 0.3)',          // Dark orange
    'living_street': 'rgba(251, 146, 60, 0.3)' // Light orange
  };
  
  const normalizedValue = String(roadClassValue).toLowerCase();
  return roadClassColors[normalizedValue] || 'rgba(156, 163, 175, 0.3)'; // Default gray
}

// Helper function to get background color for road_class value in stats (lighter version)
function getRoadClassColorForStats(roadClassValue) {
  if (!roadClassValue) return 'rgba(156, 163, 175, 0.15)'; // Gray for null/undefined
  
  const roadClassColors = {
    'motorway': 'rgba(220, 38, 38, 0.15)',      // Red
    'trunk': 'rgba(239, 68, 68, 0.15)',         // Light red
    'primary': 'rgba(249, 115, 22, 0.15)',      // Orange
    'secondary': 'rgba(234, 179, 8, 0.15)',     // Yellow
    'tertiary': 'rgba(34, 197, 94, 0.15)',      // Green
    'unclassified': 'rgba(59, 130, 246, 0.15)', // Blue
    'residential': 'rgba(168, 85, 247, 0.15)',   // Purple
    'service': 'rgba(236, 72, 153, 0.15)',      // Pink
    'track': 'rgba(120, 53, 15, 0.15)',         // Brown
    'path': 'rgba(107, 114, 128, 0.15)',        // Gray
    'cycleway': 'rgba(14, 165, 233, 0.15)',    // Sky blue
    'footway': 'rgba(22, 163, 74, 0.15)',       // Dark green
    'steps': 'rgba(180, 83, 9, 0.15)',          // Dark orange
    'living_street': 'rgba(251, 146, 60, 0.15)' // Light orange
  };
  
  const normalizedValue = String(roadClassValue).toLowerCase();
  return roadClassColors[normalizedValue] || 'rgba(156, 163, 175, 0.15)'; // Default gray
}

function setupHeightgraphInteractivity(canvas, elevations, totalDistance, coordinates) {
  if (!canvas || !routeState.currentRouteData || !routeState.mapInstance || !coordinates || coordinates.length === 0) return;
  
  const { encodedValues } = routeState.currentRouteData;
  const select = document.getElementById('heightgraph-encoded-select');
  const selectedType = select ? select.value : 'custom_present';
  // Use same padding values as in drawHeightgraph
  const padding = { top: 20, right: 5, bottom: 30, left: 25 };
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
    
    // Calculate graph boundaries - use actual canvas width minus padding
    const rightBoundary = padding.left + graphWidth;
    const bottomBoundary = padding.top + graphHeight;
    
    // Check if mouse is within graph area (include edges with tolerance)
    // Allow tolerance on the right edge to ensure full coverage (account for rounding/pixel issues)
    // Use a percentage-based tolerance to handle different canvas sizes
    const tolerance = Math.max(5, graphWidth * 0.1); // At least 5px or 10% of graph width
    if (x < padding.left || x > rightBoundary + tolerance || 
        y < padding.top || y > bottomBoundary) {
      tooltip.style.display = 'none';
      if (routeHighlightMarker) {
        routeHighlightMarker.remove();
        routeHighlightMarker = null;
      }
      // Clear point on route line
      if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
        routeState.mapInstance.getSource('heightgraph-hover-point').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
      return;
    }
    
    // Calculate which point in the data corresponds to this x position
    // Clamp relativeX to ensure it's within bounds (even with tolerance)
    let relativeX = x - padding.left;
    // If x is beyond rightBoundary but within tolerance, clamp to graphWidth
    if (relativeX > graphWidth) {
      relativeX = graphWidth;
    }
    relativeX = Math.max(0, Math.min(graphWidth, relativeX));
    const dataIndex = Math.min(elevations.length - 1, Math.max(0, Math.round((relativeX / graphWidth) * (elevations.length - 1))));
    
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
      
      // Build tooltip content - show distance, elevation, and selected encoded value
      let tooltipContent = `Distanz: ${(distance / 1000).toFixed(2)} km<br>`;
      
      if (elevation !== null && elevation !== undefined) {
        tooltipContent += `Höhe: ${Math.round(elevation)} m<br>`;
      }
      
      // Add selected encoded value (custom_present, surface, or road_class)
      if (selectedType === 'custom_present' && encodedValues.custom_present && encodedValues.custom_present[dataIndex] !== undefined && 
          encodedValues.custom_present[dataIndex] !== null) {
        const customValue = encodedValues.custom_present[dataIndex];
        const customPresentText = typeof customValue === 'boolean' 
          ? (customValue ? 'Ja' : 'Nein') 
          : String(customValue);
        tooltipContent += `Custom Present: ${customPresentText}`;
      } else if (selectedType === 'surface' && encodedValues.surface && encodedValues.surface[dataIndex] !== undefined && 
                 encodedValues.surface[dataIndex] !== null) {
        const surfaceValue = encodedValues.surface[dataIndex];
        tooltipContent += `Surface: ${String(surfaceValue)}`;
      } else if (selectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class[dataIndex] !== undefined && 
                 encodedValues.road_class[dataIndex] !== null) {
        const roadClassValue = encodedValues.road_class[dataIndex];
        tooltipContent += `Road Class: ${String(roadClassValue)}`;
      }
      
      tooltip.innerHTML = tooltipContent;
      
      // Highlight point on route
      if (coord && routeState.mapInstance) {
        // Remove existing marker (if using marker approach)
        if (routeHighlightMarker) {
          routeHighlightMarker.remove();
          routeHighlightMarker = null;
        }
        
        // Update point on route line using GeoJSON source
        if (routeState.mapInstance.getSource('heightgraph-hover-point')) {
          routeState.mapInstance.getSource('heightgraph-hover-point').setData({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [coord[0], coord[1]]
            },
            properties: {}
          });
        }
        
        // Draw vertical indicator line on heightgraph using separate overlay canvas
        // Always draw at exact mouse position x (no clamping)
        const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
        if (indicatorCanvas) {
          const indicatorCtx = indicatorCanvas.getContext('2d');
          
          // Clear previous indicator line
          indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
          
          // Draw new indicator line at exact mouse position
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
    if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
      routeState.mapInstance.getSource('heightgraph-hover-point').setData({
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

