// Heightgraph visualization and interactivity

import { routeState } from './routeState.js';
import { updateRouteColor } from './routeVisualization.js';
import { getSurfaceColorRgba, getRoadClassColorRgba, getBicycleInfraColorRgba } from './colorSchemes.js';

// Bicycle infrastructure descriptions mapping
const BICYCLE_INFRA_DESCRIPTIONS = {
  'none': 'Keine spezielle Fahrradinfrastruktur',
  'bicycleroad': 'Fahrradstraße',
  'bicycleroad_vehicledestination': 'Fahrradstraße mit<br>Anlieger/Kfz frei',
  'pedestrianareabicycleyes': 'Fußgängerzone,<br>Fahrrad frei',
  'cycleway_adjoining': 'Radweg,<br>straßenbegleitend',
  'cycleway_isolated': 'Radweg,<br>selbstständig geführt',
  'cycleway_adjoiningorisolated': 'Radweg (Fallback)',
  'cyclewaylink': 'Radweg-Routing-<br>Verbindungsstück',
  'crossing': 'Straßenquerung',
  'cyclewayonhighway_advisory': 'Schutzstreifen',
  'cyclewayonhighway_exclusive': 'Radfahrstreifen',
  'cyclewayonhighway_advisoryorexclusive': 'Radfahrstreifen/<br>Schutzstreifen (Fallback)',
  'cyclewayonhighwaybetweenlanes': 'Radfahrstreifen in<br>Mittellage ("Angstweiche")',
  'cyclewayonhighwayprotected': 'Protected Bike Lane (PBL)',
  'sharedbuslanebikewithbus': 'Radfahrstreifen mit<br>Freigabe Busverkehr',
  'sharedbuslanebuswithbike': 'Bussonderfahrstreifen<br>mit Fahrrad frei',
  'sharedmotorvehiclelane': 'Gemeinsamer Fahrstreifen',
  'footandcyclewaysegregated_adjoining': 'Getrennter Geh- und<br>Radweg, straßenbegleitend',
  'footandcyclewaysegregated_isolated': 'Getrennter Geh- und<br>Radweg, selbstständig',
  'footandcyclewaysegregated_adjoiningorisolated': 'Getrennter Geh- und<br>Radweg (Fallback)',
  'footandcyclewayshared_adjoining': 'Gemeinsamer Geh- und<br>Radweg, straßenbegleitend',
  'footandcyclewayshared_isolated': 'Gemeinsamer Geh- und<br>Radweg, selbstständig',
  'footandcyclewayshared_adjoiningorisolated': 'Gemeinsamer Geh- und<br>Radweg (Fallback)',
  'footwaybicycleyes_adjoining': 'Gehweg, Fahrrad frei,<br>straßenbegleitend',
  'footwaybicycleyes_isolated': 'Gehweg, Fahrrad frei,<br>selbstständig',
  'footwaybicycleyes_adjoiningorisolated': 'Gehweg, Fahrrad frei<br>(Fallback)',
  'needsclarification': 'Führungsform unklar -<br>Tags nicht ausreichend'
};

// Helper function to get bicycle infrastructure description
function getBicycleInfraDescription(value) {
  if (!value) return null;
  const normalizedValue = String(value).toLowerCase();
  return BICYCLE_INFRA_DESCRIPTIONS[normalizedValue] || null;
}

// Centralized configuration
const HEIGHTGRAPH_CONFIG = {
  canvas: {
    defaultWidth: 320,
    height: 150,
    minWidth: 100
  },
  padding: {
    top: 20,
    right: 5,
    bottom: 30,
    left: 25
  },
  grid: {
    steps: 5
  },
  colors: {
    background: '#f9fafb',
    grid: '#e5e7eb',
    text: '#6b7280',
    elevationLine: '#3b82f6',
    indicatorLine: '#ef4444'
  },
  debounce: {
    resize: 150
  },
  font: {
    size: '10px',
    family: 'sans-serif'
  }
};

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
    }, HEIGHTGRAPH_CONFIG.debounce.resize);
  };
  
  window.addEventListener('resize', heightgraphResizeHandler);
}

// Cleanup function to remove all event handlers
export function cleanupHeightgraphHandlers() {
  const canvas = document.getElementById('heightgraph-canvas');
  
  // Remove mouse event handlers
  if (canvas && heightgraphMouseMoveHandler) {
    canvas.removeEventListener('mousemove', heightgraphMouseMoveHandler);
    heightgraphMouseMoveHandler = null;
  }
  if (canvas && heightgraphMouseLeaveHandler) {
    canvas.removeEventListener('mouseleave', heightgraphMouseLeaveHandler);
    heightgraphMouseLeaveHandler = null;
  }
  
  // Remove resize handler
  if (heightgraphResizeHandler) {
    window.removeEventListener('resize', heightgraphResizeHandler);
    if (heightgraphResizeHandler.timeout) {
      clearTimeout(heightgraphResizeHandler.timeout);
    }
    heightgraphResizeHandler = null;
  }
  
  // Clear indicator canvas
  const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
  if (indicatorCanvas) {
    const ctx = indicatorCanvas.getContext('2d');
    ctx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
  }
  
  // Remove tooltip if it exists
  const tooltip = document.getElementById('heightgraph-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
  
  // Clear hover point on map
  if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
    routeState.mapInstance.getSource('heightgraph-hover-point').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
}

// Validate heightgraph data for consistency
function validateHeightgraphData(elevations, coordinates, encodedValues) {
  const errors = [];
  
  if (elevations.length > 0 && coordinates.length > 0 && elevations.length !== coordinates.length) {
    errors.push(`Elevation count (${elevations.length}) doesn't match coordinates (${coordinates.length})`);
  }
  
  if (encodedValues) {
    Object.keys(encodedValues).forEach(key => {
      const values = encodedValues[key];
      if (Array.isArray(values) && coordinates.length > 0 && values.length !== coordinates.length) {
        errors.push(`Encoded value '${key}' length (${values.length}) doesn't match coordinates (${coordinates.length})`);
      }
    });
  }
  
  if (errors.length > 0) {
    console.warn('Heightgraph data validation errors:', errors);
    // Don't throw - just warn, as the graph can still be drawn with partial data
  }
  
  return errors.length === 0;
}

export function drawHeightgraph(elevations, totalDistance, encodedValues = {}, coordinates = [], skipInteractivity = false) {
  // Cache DOM elements
  const elements = {
    container: document.getElementById('heightgraph-container'),
    canvas: document.getElementById('heightgraph-canvas'),
    indicatorCanvas: document.getElementById('heightgraph-indicator-canvas'),
    select: document.getElementById('heightgraph-encoded-select')
  };
  
  if (!elements.container || !elements.canvas) return;
  
  // Validate data consistency
  validateHeightgraphData(elevations, coordinates, encodedValues);
  
  const { container, canvas, indicatorCanvas, select } = elements;
  
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
  const maxWidth = container.clientWidth || HEIGHTGRAPH_CONFIG.canvas.defaultWidth;
  const width = Math.max(HEIGHTGRAPH_CONFIG.canvas.minWidth, maxWidth);
  const height = HEIGHTGRAPH_CONFIG.canvas.height;
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
  
  // Use centralized padding configuration
  const padding = HEIGHTGRAPH_CONFIG.padding;
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  
  // Calculate stepX based on available data
  const dataLength = Math.max(baseData.length, overlayData.length > 0 ? overlayData.length : 0);
  const stepX = dataLength > 1 ? graphWidth / (dataLength - 1) : 0;
  
  // Draw background
  drawBackground(ctx, padding, graphWidth, graphHeight);
  
  // Draw grid lines and Y-axis labels
  drawGrid(ctx, padding, graphWidth, graphHeight, baseData);
  
  // Calculate cumulative distances for each point (for accurate X-axis positioning)
  // This ensures the graph matches the actual route distance, not just point count
  let cumulativeDistances = [];
  let actualTotalDistance = totalDistance;
  
  if (coordinates.length > 0) {
    const result = calculateCumulativeDistances(coordinates);
    cumulativeDistances = result.distances;
    actualTotalDistance = result.total;
  } else {
    // Fallback: use index-based if no coordinates
    for (let i = 0; i < baseData.length; i++) {
      cumulativeDistances.push((i / (baseData.length - 1)) * totalDistance);
    }
  }
  
  // Always draw base elevation profile first
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      const baseMin = Math.min(...baseValid) - 10; // Add 10m padding below
      const baseMax = Math.max(...baseValid) + 10; // Add 10m padding above
      const baseRange = baseMax - baseMin || 1;
      
      // Store points for area filling
      const points = [];
      
      baseData.forEach((value, index) => {
        if (value === null || value === undefined) return;
        
        // Calculate X position based on cumulative distance, not index
        // Use actualTotalDistance to ensure 100% matches the end of the route
        const distanceRatio = actualTotalDistance > 0 && cumulativeDistances[index] !== undefined
          ? cumulativeDistances[index] / actualTotalDistance
          : index / (baseData.length - 1);
        const x = padding.left + graphWidth * distanceRatio;
        
        const normalized = (value - baseMin) / baseRange;
        const y = padding.top + graphHeight - (normalized * graphHeight);
        
        points.push({ x, y, index });
      });
      
      // Draw elevation line
      drawElevationLine(ctx, points);
      
      // Fill area under elevation curve based on selected encoded value
      const selectedType = select ? select.value : 'mapillary_coverage';
      
      // Use generic fillSegmentsByValue function for all encoded value types
      if (selectedType === 'mapillary_coverage' && encodedValues.mapillary_coverage && encodedValues.mapillary_coverage.length > 0 && points.length > 0) {
        // Custom color function for mapillary_coverage (boolean-like values)
        const getCustomPresentColor = (value) => {
          const isTrue = value === true || value === 'True' || value === 'true';
          return isTrue ? 'rgba(59, 130, 246, 0.3)' : 'rgba(236, 72, 153, 0.3)';
        };
        fillSegmentsByValue(ctx, points, encodedValues.mapillary_coverage, getCustomPresentColor, padding, graphHeight);
      } else if (selectedType === 'surface' && encodedValues.surface && encodedValues.surface.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.surface, getSurfaceColor, padding, graphHeight);
      } else if (selectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.road_class, getRoadClassColor, padding, graphHeight);
      } else if (selectedType === 'bicycle_infra' && encodedValues.bicycle_infra && encodedValues.bicycle_infra.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.bicycle_infra, getBicycleInfraColor, padding, graphHeight);
      } else {
        // Fallback: fill with default blue if no encoded value data
        // Note: This requires the elevation line path to still be active
        // If no encoded values, just skip the fill (elevation line is already drawn)
      }
    }
  }
  
  // Draw distance labels on x-axis
  drawXAxisLabels(ctx, padding, graphWidth, graphHeight, actualTotalDistance, height);
  
  // Setup interactive hover (only if not skipped)
  if (!skipInteractivity) {
    // Also setup indicator canvas
    if (indicatorCanvas) {
      indicatorCanvas.width = canvas.width;
      indicatorCanvas.height = canvas.height;
      // Ensure CSS size matches actual canvas size to avoid scaling issues
      indicatorCanvas.style.width = canvas.width + 'px';
      indicatorCanvas.style.height = canvas.height + 'px';
    }
    setupHeightgraphInteractivity(canvas, baseData, actualTotalDistance, coordinates, cumulativeDistances);
  }
  
  // Update stats
  const statsSelectedType = select ? select.value : 'mapillary_coverage';
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

// Draw background rectangle
function drawBackground(ctx, padding, graphWidth, graphHeight) {
  ctx.fillStyle = HEIGHTGRAPH_CONFIG.colors.background;
  ctx.fillRect(padding.left, padding.top, graphWidth, graphHeight);
}

// Draw grid lines and Y-axis labels
function drawGrid(ctx, padding, graphWidth, graphHeight, baseData) {
  ctx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.grid;
  ctx.lineWidth = 1;
  
  // Y-axis always shows elevation data (baseData), regardless of selectedType
  const yLabels = new Set(); // Track Y-axis labels to avoid duplicates
  
  // Calculate elevation range for Y-axis labels
  let elevationMin = 0;
  let elevationMax = 0;
  let elevationRange = 1;
  
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      elevationMin = Math.min(...baseValid) - 10; // Add 10m padding below
      elevationMax = Math.max(...baseValid) + 10; // Add 10m padding above
      elevationRange = elevationMax - elevationMin || 1;
    }
  }
  
  // Calculate ticks in 5 or 10 meter steps, minimal but nice
  const calculateNiceTicks = (min, max) => {
    const range = max - min;
    
    // Determine step size: prefer 10, fall back to 5 for smaller ranges
    // Use 10m steps if range >= 35m to avoid too many ticks
    let step = 10;
    if (range < 35) {
      step = 5;
    }
    
    // Round min down to nearest step
    const tickMin = Math.floor(min / step) * step;
    // Round max up to nearest step
    const tickMax = Math.ceil(max / step) * step;
    
    // Generate ticks
    const ticks = [];
    for (let value = tickMin; value <= tickMax; value += step) {
      ticks.push(value);
    }
    
    return { ticks, step };
  };
  
  const { ticks } = calculateNiceTicks(elevationMin, elevationMax);
  
  // Draw grid lines and labels for each tick
  ticks.forEach((elevationValue) => {
    // Calculate Y position based on elevation value
    const y = padding.top + graphHeight - ((elevationValue - elevationMin) / elevationRange) * graphHeight;
    
    // Only draw if within graph bounds
    if (y >= padding.top && y <= padding.top + graphHeight) {
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + graphWidth, y);
      ctx.stroke();
      
      // Label - always use elevation data for Y-axis, always natural numbers
      const labelText = Math.round(elevationValue) + ' m';
      
      // Only draw label if it's not a duplicate
      if (!yLabels.has(labelText)) {
        yLabels.add(labelText);
        ctx.fillStyle = HEIGHTGRAPH_CONFIG.colors.text;
        ctx.font = `${HEIGHTGRAPH_CONFIG.font.size} ${HEIGHTGRAPH_CONFIG.font.family}`;
        ctx.textAlign = 'right';
        ctx.fillText(labelText, padding.left - 3, y + 3);
      }
    }
  });
}

// Draw elevation line
function drawElevationLine(ctx, points) {
  if (points.length === 0) return;
  
  ctx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.elevationLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  
  ctx.stroke();
}

// Draw X-axis distance labels
function drawXAxisLabels(ctx, padding, graphWidth, graphHeight, actualTotalDistance, height) {
  ctx.fillStyle = HEIGHTGRAPH_CONFIG.colors.text;
  ctx.font = `${HEIGHTGRAPH_CONFIG.font.size} ${HEIGHTGRAPH_CONFIG.font.family}`;
  ctx.textAlign = 'center';
  
  const totalDistanceKm = actualTotalDistance / 1000;
  const maxTicks = 8; // Maximum number of ticks to avoid overcrowding
  
  // Determine appropriate step size based on total distance
  let stepSize;
  let useHalfSteps = false;
  
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
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      const roundedDistance = Math.round(distance * 10) / 10;
      ticks.push(roundedDistance);
    }
  } else {
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      ticks.push(distance);
    }
  }
  
  // Draw ticks
  for (const distance of ticks) {
    const distanceRatio = totalDistanceKm > 0 ? distance / totalDistanceKm : 0;
    const x = padding.left + graphWidth * distanceRatio;
    
    if (x >= padding.left && x <= padding.left + graphWidth) {
      const labelText = (distance % 1 === 0 ? distance.toFixed(0) : distance.toFixed(1)) + ' km';
      ctx.fillText(labelText, x, height - 5);
    }
  }
}

// Calculate cumulative distances for all coordinates
// Returns { distances: number[], total: number }
function calculateCumulativeDistances(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return { distances: [], total: 0 };
  }
  
  const distances = [0];
  let total = 0;
  
  for (let i = 1; i < coordinates.length; i++) {
    const segmentDist = calculateDistance(coordinates[i - 1], coordinates[i]);
    total += segmentDist;
    distances.push(total);
  }
  
  return { distances, total };
}

// Fill a single segment under the elevation curve
function fillSegment(ctx, points, startIdx, endIdx, color, padding, graphHeight) {
  if (startIdx >= endIdx || startIdx < 0 || endIdx > points.length) return;
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[startIdx].x, points[startIdx].y);
  
  // Draw the top edge of the segment (along the elevation curve)
  for (let j = startIdx + 1; j < endIdx; j++) {
    ctx.lineTo(points[j].x, points[j].y);
  }
  
  // Include the transition point to avoid gaps
  if (endIdx < points.length) {
    ctx.lineTo(points[endIdx].x, points[endIdx].y);
  }
  
  // Draw down to the bottom
  const lastPoint = endIdx < points.length ? points[endIdx] : points[endIdx - 1];
  ctx.lineTo(lastPoint.x, padding.top + graphHeight);
  
  // Draw along the bottom
  ctx.lineTo(points[startIdx].x, padding.top + graphHeight);
  ctx.closePath();
  ctx.fill();
}

// Fill segments based on encoded values
// Generic function that works for mapillary_coverage, surface, road_class, etc.
function fillSegmentsByValue(ctx, points, values, getColor, padding, graphHeight) {
  if (!points || points.length === 0 || !values || values.length === 0) return;
  
  let currentValue = null;
  let segmentStart = 0;
  
  for (let i = 0; i < points.length; i++) {
    const value = values[points[i].index];
    
    // Check if value changed or is first point
    if (value !== currentValue || i === 0) {
      // Fill previous segment if exists
      if (currentValue !== null && i > segmentStart) {
        const fillColor = getColor(currentValue);
        fillSegment(ctx, points, segmentStart, i, fillColor, padding, graphHeight);
      }
      
      // Start new segment
      currentValue = value;
      segmentStart = i;
    }
  }
  
  // Fill final segment
  if (currentValue !== null && segmentStart < points.length) {
    const fillColor = getColor(currentValue);
    fillSegment(ctx, points, segmentStart, points.length, fillColor, padding, graphHeight);
  }
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
    
    if (encodedType === 'mapillary_coverage') {
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
    } else if (encodedType === 'bicycle_infra') {
      // Get bicycle_infra color and make it lighter for background
      const bicycleInfraColor = getBicycleInfraColorForStats(key);
      backgroundColor = bicycleInfraColor;
      // Use description if available, otherwise format the key
      const description = getBicycleInfraDescription(key);
      if (description) {
        displayKey = description; // Already contains <br> tags for line breaks
      } else {
        // Fallback: replace underscores with line breaks before underscore
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

// Color functions are now imported from colorSchemes.js
// Local helper functions for stats (use lighter opacity)
function getSurfaceColorForStats(surfaceValue) {
  return getSurfaceColorRgba(surfaceValue, 0.15);
}

function getRoadClassColorForStats(roadClassValue) {
  return getRoadClassColorRgba(roadClassValue, 0.15);
}

// For heightgraph fill (use standard opacity)
function getSurfaceColor(surfaceValue) {
  return getSurfaceColorRgba(surfaceValue, 0.3);
}

function getRoadClassColor(roadClassValue) {
  return getRoadClassColorRgba(roadClassValue, 0.3);
}

function getBicycleInfraColor(bicycleInfraValue) {
  return getBicycleInfraColorRgba(bicycleInfraValue, 0.3);
}

function getBicycleInfraColorForStats(bicycleInfraValue) {
  return getBicycleInfraColorRgba(bicycleInfraValue, 0.15);
}

function setupHeightgraphInteractivity(canvas, elevations, totalDistance, coordinates, cumulativeDistances = null) {
  if (!canvas || !routeState.currentRouteData || !routeState.mapInstance || !coordinates || coordinates.length === 0) return;
  
  const { encodedValues } = routeState.currentRouteData;
  const select = document.getElementById('heightgraph-encoded-select');
  const selectedType = select ? select.value : 'mapillary_coverage';
  // Use same padding values as in drawHeightgraph
  const padding = HEIGHTGRAPH_CONFIG.padding;
  
  // CRITICAL: Use getBoundingClientRect() to get the ACTUAL rendered size, not canvas.width
  // canvas.width is the internal resolution, but CSS might scale it down
  // This was the bug when the chart was made wider!
  const rect = canvas.getBoundingClientRect();
  const actualCanvasWidth = rect.width;
  const actualCanvasHeight = rect.height;
  
  const graphWidth = actualCanvasWidth - padding.left - padding.right;
  const graphHeight = actualCanvasHeight - padding.top - padding.bottom;
  
  // Calculate cumulative distances if not provided
  let computedCumulativeDistances = cumulativeDistances;
  let actualTotalDistance = totalDistance;
  
  if (!computedCumulativeDistances && coordinates.length > 0) {
    const result = calculateCumulativeDistances(coordinates);
    computedCumulativeDistances = result.distances;
    actualTotalDistance = result.total;
  } else if (computedCumulativeDistances && computedCumulativeDistances.length > 0) {
    // Use the last cumulative distance as the actual total
    actualTotalDistance = computedCumulativeDistances[computedCumulativeDistances.length - 1];
  }
  
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
      white-space: normal;
      max-width: 250px;
      word-wrap: break-word;
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
    // Get fresh bounding rect to handle any resizing or CSS scaling
    // This is critical: canvas.width might be different from rendered size!
    const currentRect = canvas.getBoundingClientRect();
    const x = e.clientX - currentRect.left;
    const y = e.clientY - currentRect.top;
    
    // Recalculate graphWidth from actual rendered size (not canvas.width!)
    // This fixes the bug when chart width was changed
    const actualGraphWidth = currentRect.width - padding.left - padding.right;
    const actualGraphHeight = currentRect.height - padding.top - padding.bottom;
    
    // Calculate graph boundaries - use actual rendered canvas width minus padding
    const leftBoundary = padding.left;
    const rightBoundary = padding.left + actualGraphWidth;
    const topBoundary = padding.top;
    const bottomBoundary = padding.top + actualGraphHeight;
    
    // Check if mouse is within graph area (strict boundaries, no tolerance)
    if (x < leftBoundary || x > rightBoundary || 
        y < topBoundary || y > bottomBoundary) {
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
      // Clear indicator line
      const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
      if (indicatorCanvas) {
        const indicatorCtx = indicatorCanvas.getContext('2d');
        indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
      }
      return;
    }
    
    // Calculate which segment the mouse is over (not just a point)
    // Use distance-based calculation to match the X-axis labels
    // Calculate relative position within the graph area (0 to 1)
    // Use actualGraphWidth (from rendered size), not graphWidth (from canvas.width)!
    const relativeX = (x - padding.left) / actualGraphWidth;
    // Clamp to valid range [0, 1]
    const clampedRelativeX = Math.max(0, Math.min(1, relativeX));
    
    // Calculate distance ratio from X position
    // Use actualTotalDistance to ensure hover matches the graph
    // clampedRelativeX is already a ratio [0, 1], so use it directly
    const targetDistance = clampedRelativeX * actualTotalDistance;
    
    // Find the segment that contains this distance
    // A segment is between point i and point i+1
    let segmentStartIndex = 0;
    let segmentEndIndex = 0;
    let segmentStartDistance = 0;
    let segmentEndDistance = 0;
    
    if (computedCumulativeDistances && computedCumulativeDistances.length > 1) {
      // Find the segment containing targetDistance
      for (let i = 0; i < computedCumulativeDistances.length - 1; i++) {
        const startDist = computedCumulativeDistances[i];
        const endDist = computedCumulativeDistances[i + 1];
        
        if (targetDistance >= startDist && targetDistance <= endDist) {
          segmentStartIndex = i;
          segmentEndIndex = i + 1;
          segmentStartDistance = startDist;
          segmentEndDistance = endDist;
          break;
        }
      }
      // If we're at the end, use the last segment
      if (targetDistance >= computedCumulativeDistances[computedCumulativeDistances.length - 1]) {
        segmentStartIndex = computedCumulativeDistances.length - 2;
        segmentEndIndex = computedCumulativeDistances.length - 1;
        segmentStartDistance = computedCumulativeDistances[segmentStartIndex];
        segmentEndDistance = computedCumulativeDistances[segmentEndIndex];
      }
    } else {
      // Fallback: use index-based calculation
      const totalPoints = elevations.length;
      const pointIndex = Math.min(totalPoints - 1, Math.max(0, Math.round(clampedRelativeX * (totalPoints - 1))));
      segmentStartIndex = Math.max(0, Math.min(pointIndex, totalPoints - 2));
      segmentEndIndex = segmentStartIndex + 1;
      segmentStartDistance = (totalDistance / totalPoints) * segmentStartIndex;
      segmentEndDistance = (totalDistance / totalPoints) * segmentEndIndex;
    }
    
    // Use the start point of the segment for the value (the segment "belongs" to its start point)
    const dataIndex = segmentStartIndex;
    
    // Calculate segment midpoint for positioning
    const segmentMidDistance = (segmentStartDistance + segmentEndDistance) / 2;
    const segmentMidRelativeX = segmentMidDistance / actualTotalDistance;
    const segmentMidX = padding.left + (segmentMidRelativeX * actualGraphWidth);
    
    if (dataIndex >= 0 && dataIndex < elevations.length && dataIndex < coordinates.length) {
      const elevation = elevations[dataIndex];
      const coord = coordinates[dataIndex];
      const distance = segmentMidDistance; // Use midpoint distance for display
      
      // Build tooltip content first - show distance, elevation, and selected encoded value
      let tooltipContent = `Distanz: ${(distance / 1000).toFixed(2)} km<br>`;
      
      if (elevation !== null && elevation !== undefined) {
        tooltipContent += `Höhe: ${Math.round(elevation)} m<br>`;
      }
      
      // Add selected encoded value (mapillary_coverage, surface, road_class, or bicycle_infra)
      if (selectedType === 'mapillary_coverage' && encodedValues.mapillary_coverage && encodedValues.mapillary_coverage[dataIndex] !== undefined && 
          encodedValues.mapillary_coverage[dataIndex] !== null) {
        const customValue = encodedValues.mapillary_coverage[dataIndex];
        const customPresentText = typeof customValue === 'boolean' 
          ? (customValue ? 'Ja' : 'Nein') 
          : String(customValue);
        tooltipContent += `Mapillary Coverage: ${customPresentText}`;
      } else if (selectedType === 'surface' && encodedValues.surface && encodedValues.surface[dataIndex] !== undefined && 
                 encodedValues.surface[dataIndex] !== null) {
        const surfaceValue = encodedValues.surface[dataIndex];
        tooltipContent += `Surface: ${String(surfaceValue)}`;
      } else if (selectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class[dataIndex] !== undefined && 
                 encodedValues.road_class[dataIndex] !== null) {
        const roadClassValue = encodedValues.road_class[dataIndex];
        tooltipContent += `Road Class: ${String(roadClassValue)}`;
      } else if (selectedType === 'bicycle_infra' && encodedValues.bicycle_infra && encodedValues.bicycle_infra[dataIndex] !== undefined && 
                 encodedValues.bicycle_infra[dataIndex] !== null) {
        const bicycleInfraValue = encodedValues.bicycle_infra[dataIndex];
        // Use description if available, otherwise format the value
        const description = getBicycleInfraDescription(bicycleInfraValue);
        if (description) {
          // Replace <br> with spaces for tooltip (tooltip handles wrapping automatically)
          const tooltipDescription = description.replace(/<br>/g, ' ');
          tooltipContent += `Bicycle Infrastructure: ${tooltipDescription}`;
        } else {
          // Fallback: replace underscores with spaces
          const formattedValue = String(bicycleInfraValue).replace(/_/g, ' ');
          tooltipContent += `Bicycle Infrastructure: ${formattedValue}`;
        }
      }
      
      // Set tooltip content first (hidden) to measure actual size
      tooltip.innerHTML = tooltipContent;
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      
      // Measure actual tooltip size
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      
      // Calculate tooltip position based on segment midpoint, not mouse position
      const offsetX = 10; // Horizontal offset from segment midpoint
      const offsetY = -30; // Vertical offset from cursor
      
      // Use segment midpoint X position for tooltip positioning
      const tooltipX = segmentMidX;
      let tooltipLeft = rect.left + tooltipX + offsetX;
      let tooltipTop = rect.top + y + offsetY;
      
      // Check if tooltip goes over right edge of viewport
      if (tooltipLeft + tooltipWidth > window.innerWidth) {
        // Position tooltip to the left of segment midpoint
        tooltipLeft = rect.left + tooltipX - tooltipWidth - offsetX;
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
      tooltip.style.visibility = 'visible';
      
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
        // Draw at the calculated position based on distance, not exact mouse position
        // This ensures the indicator matches the actual route position
        const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
        if (indicatorCanvas) {
          const indicatorCtx = indicatorCanvas.getContext('2d');
          
          // Clear previous indicator line
          indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
          
          // Calculate the X position based on the segment midpoint
          // This ensures the indicator line matches the segment, not just mouse position
          // Use segmentMidX which is already calculated relative to padding.left
          const indicatorX = segmentMidX;
          
          // Draw new indicator line at calculated position
          indicatorCtx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.indicatorLine;
          indicatorCtx.lineWidth = 2;
          indicatorCtx.beginPath();
          indicatorCtx.moveTo(indicatorX, padding.top);
          indicatorCtx.lineTo(indicatorX, padding.top + actualGraphHeight);
          indicatorCtx.stroke();
        } else {
          // Fallback: draw on main canvas if indicator canvas not available
          const ctx = canvas.getContext('2d');
          const indicatorX = padding.left + (clampedRelativeX * actualGraphWidth);
          ctx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.indicatorLine;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(indicatorX, padding.top);
          ctx.lineTo(indicatorX, padding.top + actualGraphHeight);
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
    'bicycle_infra': 'Fahrradinfrastruktur',
    'time': 'Zeit (s)',
    'distance': 'Distanz (m)',
    'street_name': 'Straßenname'
  };
  return labels[type] || type;
}

