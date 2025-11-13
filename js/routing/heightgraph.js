// Heightgraph visualization and interactivity

import { routeState } from './routeState.js';
import { updateRouteColor } from './routeVisualization.js';
import { getSurfaceColorRgba, getRoadClassColorRgba, getBicycleInfraColorRgba, getBicycleInfraDescription } from './colorSchemes.js';

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
let heightgraphResizeHandler = null;

// ============================================================================
// Helper Functions
// ============================================================================

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
  }
  
  return errors.length === 0;
}

/**
 * Get container width - tries to get actual width, falls back to default if not available
 * This is critical for first load (permalink or first route) when layout might not be ready
 */
function getContainerWidth(container) {
  // Force a reflow to ensure layout is calculated
  void container.offsetWidth;
  
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  
  // If we have a valid width (at least 200px), use it
  if (width > 0 && width >= 200) {
    return width;
  }
  
  // If width is still invalid, try one more time after forcing another reflow
  // This handles cases where the container was just made visible
  void container.offsetWidth;
  const rect2 = container.getBoundingClientRect();
  const width2 = rect2.width;
  
  if (width2 > 0 && width2 >= 200) {
    return width2;
  }
  
  // Fallback to default width - this will be corrected on next redraw
  // (e.g., when dropdown changes or window resizes)
  return HEIGHTGRAPH_CONFIG.canvas.defaultWidth;
}

/**
 * Setup canvas with proper dimensions and high-DPI support
 * Returns the logical width and height (not physical pixels)
 */
function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  
  // Set CSS size (logical size)
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.style.maxWidth = '100%';
  
  // Set actual canvas size (physical pixels) for high-DPI
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  return ctx;
}

/**
 * Setup indicator canvas with proper dimensions and high-DPI support
 * Must match the main canvas dimensions exactly
 */
function setupIndicatorCanvas(indicatorCanvas, width, height) {
  if (!indicatorCanvas) return null;
  
  const dpr = window.devicePixelRatio || 1;
  
  // Set CSS size (logical size) - MUST match main canvas exactly
  // Override any CSS width: 100% to ensure exact match
  indicatorCanvas.style.width = width + 'px';
  indicatorCanvas.style.height = height + 'px';
  indicatorCanvas.style.maxWidth = '100%'; // Prevent overflow, but prefer exact width
  
  // Set actual canvas size (physical pixels) for high-DPI
  // NOTE: Setting canvas.width/height resets the context, so we need to scale again
  indicatorCanvas.width = width * dpr;
  indicatorCanvas.height = height * dpr;
  
  // Store DPR and logical dimensions for later use
  indicatorCanvas._dpr = dpr;
  indicatorCanvas._logicalWidth = width;
  indicatorCanvas._logicalHeight = height;
  
  const ctx = indicatorCanvas.getContext('2d');
  // Reset transform and scale for high-DPI
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  
  return ctx;
}

// ============================================================================
// Drawing Functions
// ============================================================================

function drawBackground(ctx, padding, graphWidth, graphHeight) {
  ctx.fillStyle = HEIGHTGRAPH_CONFIG.colors.background;
  ctx.fillRect(padding.left, padding.top, graphWidth, graphHeight);
}

function drawGrid(ctx, padding, graphWidth, graphHeight, baseData) {
  ctx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.grid;
  ctx.lineWidth = 1;
  
  const yLabels = new Set();
  
  // Calculate elevation range for Y-axis labels
  let elevationMin = 0;
  let elevationMax = 0;
  let elevationRange = 1;
  
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      elevationMin = Math.min(...baseValid) - 10;
      elevationMax = Math.max(...baseValid) + 10;
      elevationRange = elevationMax - elevationMin || 1;
    }
  }
  
  // Calculate ticks in 5 or 10 meter steps
  const calculateNiceTicks = (min, max) => {
    const range = max - min;
    const step = range < 35 ? 5 : 10;
    const tickMin = Math.floor(min / step) * step;
    const tickMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = tickMin; value <= tickMax; value += step) {
      ticks.push(value);
    }
    return { ticks, step };
  };
  
  const { ticks } = calculateNiceTicks(elevationMin, elevationMax);
  
  // Draw grid lines and labels
  ticks.forEach((elevationValue) => {
    const y = padding.top + graphHeight - ((elevationValue - elevationMin) / elevationRange) * graphHeight;
    
    if (y >= padding.top && y <= padding.top + graphHeight) {
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + graphWidth, y);
      ctx.stroke();
      
      const labelText = Math.round(elevationValue) + ' m';
      
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

function drawXAxisLabels(ctx, padding, graphWidth, graphHeight, actualTotalDistance, height) {
  ctx.fillStyle = HEIGHTGRAPH_CONFIG.colors.text;
  ctx.font = `${HEIGHTGRAPH_CONFIG.font.size} ${HEIGHTGRAPH_CONFIG.font.family}`;
  ctx.textAlign = 'center';
  
  const totalDistanceKm = actualTotalDistance / 1000;
  const maxTicks = 8;
  
  const possibleStepSizes = [0.5, 1, 2, 5, 10, 20, 50, 100];
  let stepSize = possibleStepSizes[possibleStepSizes.length - 1];
  let useHalfSteps = false;
  
  for (const candidateStepSize of possibleStepSizes) {
    const numTicks = Math.ceil(totalDistanceKm / candidateStepSize);
    if (numTicks <= maxTicks || candidateStepSize === possibleStepSizes[possibleStepSizes.length - 1]) {
      stepSize = candidateStepSize;
      useHalfSteps = (candidateStepSize === 0.5);
      break;
    }
  }
  
  const ticks = [];
  if (useHalfSteps) {
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      ticks.push(Math.round(distance * 10) / 10);
    }
  } else {
    for (let distance = stepSize; distance <= totalDistanceKm; distance += stepSize) {
      ticks.push(distance);
    }
  }
  
  for (const distance of ticks) {
    const distanceRatio = totalDistanceKm > 0 ? distance / totalDistanceKm : 0;
    const x = padding.left + graphWidth * distanceRatio;
    
    if (x >= padding.left && x <= padding.left + graphWidth) {
      const labelText = (distance % 1 === 0 ? distance.toFixed(0) : distance.toFixed(1)) + ' km';
      ctx.fillText(labelText, x, height - 5);
    }
  }
}

function fillSegment(ctx, points, startIdx, endIdx, color, padding, graphHeight) {
  if (startIdx >= endIdx || startIdx < 0 || endIdx > points.length) return;
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[startIdx].x, points[startIdx].y);
  
  for (let j = startIdx + 1; j < endIdx; j++) {
    ctx.lineTo(points[j].x, points[j].y);
  }
  
  if (endIdx < points.length) {
    ctx.lineTo(points[endIdx].x, points[endIdx].y);
  }
  
  const lastPoint = endIdx < points.length ? points[endIdx] : points[endIdx - 1];
  ctx.lineTo(lastPoint.x, padding.top + graphHeight);
  ctx.lineTo(points[startIdx].x, padding.top + graphHeight);
  ctx.closePath();
  ctx.fill();
}

function fillSegmentsByValue(ctx, points, values, getColor, padding, graphHeight) {
  if (!points || points.length === 0 || !values || values.length === 0) return;
  
  let currentValue = null;
  let segmentStart = 0;
  
  for (let i = 0; i < points.length; i++) {
    const value = values[points[i].index];
    
    if (value !== currentValue || i === 0) {
      if (currentValue !== null && i > segmentStart) {
        const fillColor = getColor(currentValue);
        fillSegment(ctx, points, segmentStart, i, fillColor, padding, graphHeight);
      }
      
      currentValue = value;
      segmentStart = i;
    }
  }
  
  if (currentValue !== null && segmentStart < points.length) {
    const fillColor = getColor(currentValue);
    fillSegment(ctx, points, segmentStart, points.length, fillColor, padding, graphHeight);
  }
}

// ============================================================================
// Color Helper Functions
// ============================================================================

function getSurfaceColorForStats(surfaceValue) {
  return getSurfaceColorRgba(surfaceValue, 0.15);
}

function getRoadClassColorForStats(roadClassValue) {
  return getRoadClassColorRgba(roadClassValue, 0.15);
}

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

// ============================================================================
// Main Drawing Function
// ============================================================================

/**
 * Main function to draw the heightgraph
 * Handles container width detection, canvas setup, and drawing
 */
export function drawHeightgraph(elevations, totalDistance, encodedValues = {}, coordinates = [], skipInteractivity = false) {
  // Clean up existing handlers first
  cleanupHeightgraphHandlers();
  
  // Get DOM elements
  const container = document.getElementById('heightgraph-container');
  const canvas = document.getElementById('heightgraph-canvas');
  const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
  const select = document.getElementById('heightgraph-encoded-select');
  
  if (!container || !canvas) return;
  
  // Validate data
  validateHeightgraphData(elevations, coordinates, encodedValues);
  
  // Show container
  container.style.display = 'block';
  
  // Get container width with retry logic
  // This is critical for first load when layout might not be ready
  let containerWidth = getContainerWidth(container);
  
  // Check if we got a valid width by measuring the actual container
  // If the measured width is still 0 or very small, the container isn't ready yet
  const actualRect = container.getBoundingClientRect();
  const actualWidth = actualRect.width;
  
  // If width is invalid (0 or very small), schedule a redraw after layout settles
  // This handles the case where container width is 0 on first load
  if (actualWidth === 0 || actualWidth < 200) {
    // Check if we're already pending a redraw to prevent infinite loops
    if (!canvas._pendingRedraw) {
      canvas._pendingRedraw = true;
      
      // Wait for panel positioning to complete (listen to custom event)
      const onPanelReady = () => {
        canvas._pendingRedraw = false;
        // Redraw with same parameters
        drawHeightgraph(elevations, totalDistance, encodedValues, coordinates, skipInteractivity);
      };
      
      window.addEventListener('panelPositioningComplete', onPanelReady, { once: true });
      
      // Fallback: if event doesn't fire within 1 second, try again anyway
      setTimeout(() => {
        if (canvas._pendingRedraw) {
          canvas._pendingRedraw = false;
          window.removeEventListener('panelPositioningComplete', onPanelReady);
          // Try one more time - container might be ready now
          const newRect = container.getBoundingClientRect();
          const newWidth = newRect.width;
          if (newWidth > 0 && newWidth >= 200) {
            drawHeightgraph(elevations, totalDistance, encodedValues, coordinates, skipInteractivity);
            return;
          }
        }
      }, 1000);
      
      // Don't continue drawing if we're scheduling a redraw
      return;
    }
    // If we're already pending a redraw, continue with default width (fallback)
  }
  
  const width = Math.max(HEIGHTGRAPH_CONFIG.canvas.minWidth, containerWidth);
  const height = HEIGHTGRAPH_CONFIG.canvas.height;
  
  // Setup canvas
  const ctx = setupCanvas(canvas, width, height);
  ctx.clearRect(0, 0, width, height);
  
  // Get selected visualization type
  const selectedType = select ? select.value : 'elevation';
  
  // Determine data to visualize
  let baseData = elevations.length > 0 ? elevations : [];
  let overlayData = [];
  let dataLabel = 'Höhe (m)';
  let overlayLabel = '';
  let isNumeric = true;
  let hasOverlay = false;
  
  if (selectedType === 'elevation') {
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
  
  let dataToVisualize = baseData;
  
  if (baseData.length === 0 && overlayData.length > 0) {
    dataToVisualize = overlayData;
    dataLabel = overlayLabel;
  } else if (baseData.length === 0) {
    // No data available
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Keine Daten verfügbar', width / 2, height / 2);
    return;
  }
  
  if (dataToVisualize.length < 2) return;
  
  // Process data
  let processedData = [];
  let minValue, maxValue, valueRange;
  
  if (isNumeric) {
    const validValues = dataToVisualize.filter(v => v !== null && v !== undefined);
    if (validValues.length === 0) return;
    
    minValue = Math.min(...validValues);
    maxValue = Math.max(...validValues);
    valueRange = maxValue - minValue || 1;
    processedData = dataToVisualize;
  } else {
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
  
  // Calculate graph dimensions
  const padding = HEIGHTGRAPH_CONFIG.padding;
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  
  // Draw background and grid
  drawBackground(ctx, padding, graphWidth, graphHeight);
  drawGrid(ctx, padding, graphWidth, graphHeight, baseData);
  
  // Calculate cumulative distances
  let cumulativeDistances = [];
  let actualTotalDistance = totalDistance;
  
  if (coordinates.length > 0) {
    const result = calculateCumulativeDistances(coordinates);
    cumulativeDistances = result.distances;
    actualTotalDistance = result.total;
  } else {
    for (let i = 0; i < baseData.length; i++) {
      cumulativeDistances.push((i / (baseData.length - 1)) * totalDistance);
    }
  }
  
  // Draw elevation profile
  if (baseData.length > 0) {
    const baseValid = baseData.filter(v => v !== null && v !== undefined);
    if (baseValid.length > 0) {
      const baseMin = Math.min(...baseValid) - 10;
      const baseMax = Math.max(...baseValid) + 10;
      const baseRange = baseMax - baseMin || 1;
      
      const points = [];
      
      baseData.forEach((value, index) => {
        if (value === null || value === undefined) return;
        
        const distanceRatio = actualTotalDistance > 0 && cumulativeDistances[index] !== undefined
          ? cumulativeDistances[index] / actualTotalDistance
          : index / (baseData.length - 1);
        const x = padding.left + graphWidth * distanceRatio;
        
        const normalized = (value - baseMin) / baseRange;
        const y = padding.top + graphHeight - (normalized * graphHeight);
        
        points.push({ x, y, index });
      });
      
      drawElevationLine(ctx, points);
      
      // Fill area under elevation curve based on selected encoded value
      const currentSelectedType = select ? select.value : 'mapillary_coverage';
      
      if (currentSelectedType === 'mapillary_coverage' && encodedValues.mapillary_coverage && encodedValues.mapillary_coverage.length > 0 && points.length > 0) {
        const getCustomPresentColor = (value) => {
          const isTrue = value === true || value === 'True' || value === 'true';
          return isTrue ? 'rgba(59, 130, 246, 0.3)' : 'rgba(236, 72, 153, 0.3)';
        };
        fillSegmentsByValue(ctx, points, encodedValues.mapillary_coverage, getCustomPresentColor, padding, graphHeight);
      } else if (currentSelectedType === 'surface' && encodedValues.surface && encodedValues.surface.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.surface, getSurfaceColor, padding, graphHeight);
      } else if (currentSelectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.road_class, getRoadClassColor, padding, graphHeight);
      } else if (currentSelectedType === 'bicycle_infra' && encodedValues.bicycle_infra && encodedValues.bicycle_infra.length > 0 && points.length > 0) {
        fillSegmentsByValue(ctx, points, encodedValues.bicycle_infra, getBicycleInfraColor, padding, graphHeight);
      }
    }
  }
  
  // Draw X-axis labels
  drawXAxisLabels(ctx, padding, graphWidth, graphHeight, actualTotalDistance, height);
  
  // Setup interactivity
  if (!skipInteractivity) {
    setupIndicatorCanvas(indicatorCanvas, width, height);
    setupHeightgraphInteractivity(canvas, baseData, actualTotalDistance, coordinates, cumulativeDistances, width, height);
  }
  
  // Update stats
  const statsSelectedType = select ? select.value : 'mapillary_coverage';
  updateHeightgraphStats(statsSelectedType, encodedValues);
}

// ============================================================================
// Interactivity Setup
// ============================================================================

function setupHeightgraphInteractivity(canvas, elevations, totalDistance, coordinates, cumulativeDistances = null, canvasWidth = null, canvasHeight = null) {
  if (!canvas || !routeState.currentRouteData || !routeState.mapInstance || !coordinates || coordinates.length === 0) return;
  
  const { encodedValues } = routeState.currentRouteData;
  const select = document.getElementById('heightgraph-encoded-select');
  const selectedType = select ? select.value : 'mapillary_coverage';
  const padding = HEIGHTGRAPH_CONFIG.padding;
  
  // Get indicator canvas and store in closure
  const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
  
  // Get canvas dimensions - use passed values if available, otherwise measure
  let actualCanvasWidth, actualCanvasHeight;
  if (canvasWidth !== null && canvasHeight !== null) {
    actualCanvasWidth = canvasWidth;
    actualCanvasHeight = canvasHeight;
  } else {
    const rect = canvas.getBoundingClientRect();
    actualCanvasWidth = rect.width;
    actualCanvasHeight = rect.height;
  }
  
  const graphWidth = actualCanvasWidth - padding.left - padding.right;
  const graphHeight = actualCanvasHeight - padding.top - padding.bottom;
  
  // Store dimensions in closure for event handlers
  const storedCanvasWidth = actualCanvasWidth;
  const storedCanvasHeight = actualCanvasHeight;
  const storedGraphWidth = graphWidth;
  const storedGraphHeight = graphHeight;
  
  // Calculate cumulative distances
  let computedCumulativeDistances = cumulativeDistances;
  let actualTotalDistance = totalDistance;
  
  if (!computedCumulativeDistances && coordinates.length > 0) {
    const result = calculateCumulativeDistances(coordinates);
    computedCumulativeDistances = result.distances;
    actualTotalDistance = result.total;
  } else if (computedCumulativeDistances && computedCumulativeDistances.length > 0) {
    actualTotalDistance = computedCumulativeDistances[computedCumulativeDistances.length - 1];
  }
  
  // Remove existing event listeners
  if (heightgraphMouseMoveHandler) {
    canvas.removeEventListener('mousemove', heightgraphMouseMoveHandler);
    heightgraphMouseMoveHandler = null;
  }
  if (heightgraphMouseLeaveHandler) {
    canvas.removeEventListener('mouseleave', heightgraphMouseLeaveHandler);
    heightgraphMouseLeaveHandler = null;
  }
  
  // Create or get tooltip
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
  
  // Remove existing marker
  if (routeHighlightMarker) {
    routeHighlightMarker.remove();
    routeHighlightMarker = null;
  }
  
  // Mouse move handler
  heightgraphMouseMoveHandler = (e) => {
    const currentRect = canvas.getBoundingClientRect();
    const x = e.clientX - currentRect.left;
    const y = e.clientY - currentRect.top;
    
    // Scale mouse position if canvas is scaled by CSS
    const scaleX = storedCanvasWidth / currentRect.width;
    const scaleY = storedCanvasHeight / currentRect.height;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    
    // Check boundaries
    const leftBoundary = padding.left;
    const rightBoundary = padding.left + storedGraphWidth;
    const topBoundary = padding.top;
    const bottomBoundary = padding.top + storedGraphHeight;
    
    if (scaledX < leftBoundary || scaledX > rightBoundary || 
        scaledY < topBoundary || scaledY > bottomBoundary) {
      // Mouse outside graph area
      tooltip.style.display = 'none';
      if (routeHighlightMarker) {
        routeHighlightMarker.remove();
        routeHighlightMarker = null;
      }
      if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
        routeState.mapInstance.getSource('heightgraph-hover-point').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
      clearIndicatorLine(indicatorCanvas, storedCanvasWidth, storedCanvasHeight);
      return;
    }
    
    // Calculate segment
    const relativeX = (scaledX - padding.left) / storedGraphWidth;
    const clampedRelativeX = Math.max(0, Math.min(1, relativeX));
    const targetDistance = clampedRelativeX * actualTotalDistance;
    
    let segmentStartIndex = 0;
    let segmentEndIndex = 0;
    let segmentStartDistance = 0;
    let segmentEndDistance = 0;
    
    if (computedCumulativeDistances && computedCumulativeDistances.length > 1) {
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
      if (targetDistance >= computedCumulativeDistances[computedCumulativeDistances.length - 1]) {
        segmentStartIndex = computedCumulativeDistances.length - 2;
        segmentEndIndex = computedCumulativeDistances.length - 1;
        segmentStartDistance = computedCumulativeDistances[segmentStartIndex];
        segmentEndDistance = computedCumulativeDistances[segmentEndIndex];
      }
    } else {
      const totalPoints = elevations.length;
      const pointIndex = Math.min(totalPoints - 1, Math.max(0, Math.round(clampedRelativeX * (totalPoints - 1))));
      segmentStartIndex = Math.max(0, Math.min(pointIndex, totalPoints - 2));
      segmentEndIndex = segmentStartIndex + 1;
      segmentStartDistance = (totalDistance / totalPoints) * segmentStartIndex;
      segmentEndDistance = (totalDistance / totalPoints) * segmentEndIndex;
    }
    
    const dataIndex = segmentStartIndex;
    const segmentMidDistance = (segmentStartDistance + segmentEndDistance) / 2;
    const segmentMidRelativeX = segmentMidDistance / actualTotalDistance;
    const segmentMidX = padding.left + (segmentMidRelativeX * storedGraphWidth);
    
    if (dataIndex >= 0 && dataIndex < elevations.length && dataIndex < coordinates.length) {
      const elevation = elevations[dataIndex];
      const coord = coordinates[dataIndex];
      const distance = segmentMidDistance;
      
      // Build tooltip content
      let tooltipContent = `Distanz: ${(distance / 1000).toFixed(2)} km<br>`;
      
      if (elevation !== null && elevation !== undefined) {
        tooltipContent += `Höhe: ${Math.round(elevation)} m<br>`;
      }
      
      // Add encoded value
      if (selectedType === 'mapillary_coverage' && encodedValues.mapillary_coverage && encodedValues.mapillary_coverage[dataIndex] !== undefined && 
          encodedValues.mapillary_coverage[dataIndex] !== null) {
        const customValue = encodedValues.mapillary_coverage[dataIndex];
        const customPresentText = typeof customValue === 'boolean' 
          ? (customValue ? 'Ja' : 'Nein') 
          : String(customValue);
        tooltipContent += `Mapillary Coverage: ${customPresentText}`;
      } else if (selectedType === 'surface' && encodedValues.surface && encodedValues.surface[dataIndex] !== undefined && 
                 encodedValues.surface[dataIndex] !== null) {
        tooltipContent += `Surface: ${String(encodedValues.surface[dataIndex])}`;
      } else if (selectedType === 'road_class' && encodedValues.road_class && encodedValues.road_class[dataIndex] !== undefined && 
                 encodedValues.road_class[dataIndex] !== null) {
        tooltipContent += `Road Class: ${String(encodedValues.road_class[dataIndex])}`;
      } else if (selectedType === 'bicycle_infra' && encodedValues.bicycle_infra && encodedValues.bicycle_infra[dataIndex] !== undefined && 
                 encodedValues.bicycle_infra[dataIndex] !== null) {
        const bicycleInfraValue = encodedValues.bicycle_infra[dataIndex];
        const description = getBicycleInfraDescription(bicycleInfraValue);
        if (description) {
          tooltipContent += `Bicycle Infrastructure: ${description.replace(/<br>/g, ' ')}`;
        } else {
          tooltipContent += `Bicycle Infrastructure: ${String(bicycleInfraValue).replace(/_/g, ' ')}`;
        }
      }
      
      // Show tooltip
      tooltip.innerHTML = tooltipContent;
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      
      const offsetX = 10;
      const offsetY = -30;
      const tooltipX = segmentMidX / scaleX;
      let tooltipLeft = currentRect.left + tooltipX + offsetX;
      let tooltipTop = currentRect.top + y + offsetY;
      
      if (tooltipLeft + tooltipWidth > window.innerWidth) {
        tooltipLeft = currentRect.left + tooltipX - tooltipWidth - offsetX;
      }
      if (tooltipLeft < 0) {
        tooltipLeft = 10;
      }
      if (tooltipTop < 0) {
        tooltipTop = 10;
      }
      if (tooltipTop + tooltipHeight > window.innerHeight) {
        tooltipTop = window.innerHeight - tooltipHeight - 10;
      }
      
      tooltip.style.left = tooltipLeft + 'px';
      tooltip.style.top = tooltipTop + 'px';
      tooltip.style.visibility = 'visible';
      
      // Update route highlight
      if (coord && routeState.mapInstance) {
        if (routeHighlightMarker) {
          routeHighlightMarker.remove();
          routeHighlightMarker = null;
        }
        
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
        
        // Draw indicator line
        drawIndicatorLine(indicatorCanvas, segmentMidX, padding, storedGraphHeight, storedCanvasWidth, storedCanvasHeight);
      }
    }
  };
  
  heightgraphMouseLeaveHandler = () => {
    tooltip.style.display = 'none';
    if (routeHighlightMarker) {
      routeHighlightMarker.remove();
      routeHighlightMarker = null;
    }
    if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
      routeState.mapInstance.getSource('heightgraph-hover-point').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    clearIndicatorLine(indicatorCanvas, storedCanvasWidth, storedCanvasHeight);
  };
  
  // Add event listeners
  canvas.addEventListener('mousemove', heightgraphMouseMoveHandler);
  canvas.addEventListener('mouseleave', heightgraphMouseLeaveHandler);
}

/**
 * Draw indicator line on indicator canvas
 * x is in logical coordinates (same coordinate system as the main canvas)
 */
function drawIndicatorLine(indicatorCanvas, x, padding, graphHeight, canvasWidth, canvasHeight) {
  if (!indicatorCanvas) return;
  
  const ctx = indicatorCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  // Ensure context is scaled correctly
  // The canvas should already be set up with correct dimensions by setupIndicatorCanvas
  if (indicatorCanvas._dpr !== dpr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    indicatorCanvas._dpr = dpr;
  }
  
  // Use the stored logical width from setupIndicatorCanvas
  // This ensures we use the same coordinate system as the main canvas
  const indicatorLogicalWidth = indicatorCanvas._logicalWidth || canvasWidth;
  
  // Clear previous line (use logical dimensions)
  ctx.clearRect(0, 0, indicatorLogicalWidth, canvasHeight);
  
  // Draw new line - x is already in the correct coordinate system
  ctx.strokeStyle = HEIGHTGRAPH_CONFIG.colors.indicatorLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, padding.top);
  ctx.lineTo(x, padding.top + graphHeight);
  ctx.stroke();
}

/**
 * Clear indicator line
 */
function clearIndicatorLine(indicatorCanvas, canvasWidth, canvasHeight) {
  if (!indicatorCanvas) return;
  
  const ctx = indicatorCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  
  // Ensure context is scaled correctly
  if (indicatorCanvas._dpr !== dpr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    indicatorCanvas._dpr = dpr;
  }
  
  // Use the stored logical width from setupIndicatorCanvas
  const indicatorLogicalWidth = indicatorCanvas._logicalWidth || canvasWidth;
  
  // Clear using logical dimensions
  ctx.clearRect(0, 0, indicatorLogicalWidth, canvasHeight);
}

// ============================================================================
// Setup and Cleanup Functions
// ============================================================================

export function setupHeightgraphHandlers() {
  const select = document.getElementById('heightgraph-encoded-select');
  if (select) {
    select.addEventListener('change', () => {
      routeState.currentEncodedType = select.value;
      if (routeState.currentRouteData) {
        const { elevations, distance, encodedValues } = routeState.currentRouteData;
        drawHeightgraph(elevations || [], distance, encodedValues || {}, routeState.currentRouteData?.coordinates || []);
        updateRouteColor(routeState.currentEncodedType, encodedValues || {});
        updateHeightgraphStats(routeState.currentEncodedType, encodedValues || {});
      }
    });
  }
  
  if (heightgraphResizeHandler) {
    window.removeEventListener('resize', heightgraphResizeHandler);
  }
  
  heightgraphResizeHandler = () => {
    clearTimeout(heightgraphResizeHandler.timeout);
    heightgraphResizeHandler.timeout = setTimeout(() => {
      if (routeState.currentRouteData) {
        const select = document.getElementById('heightgraph-encoded-select');
        const currentType = select ? select.value : routeState.currentEncodedType;
        const { elevations, distance, encodedValues } = routeState.currentRouteData;
        drawHeightgraph(elevations || [], distance, encodedValues || {}, routeState.currentRouteData?.coordinates || []);
        updateRouteColor(currentType, encodedValues || {});
        updateHeightgraphStats(currentType, encodedValues || {});
      }
    }, HEIGHTGRAPH_CONFIG.debounce.resize);
  };
  
  window.addEventListener('resize', heightgraphResizeHandler);
}

export function cleanupHeightgraphHandlers() {
  const canvas = document.getElementById('heightgraph-canvas');
  
  if (canvas && heightgraphMouseMoveHandler) {
    canvas.removeEventListener('mousemove', heightgraphMouseMoveHandler);
    heightgraphMouseMoveHandler = null;
  }
  if (canvas && heightgraphMouseLeaveHandler) {
    canvas.removeEventListener('mouseleave', heightgraphMouseLeaveHandler);
    heightgraphMouseLeaveHandler = null;
  }
  
  if (heightgraphResizeHandler) {
    window.removeEventListener('resize', heightgraphResizeHandler);
    if (heightgraphResizeHandler.timeout) {
      clearTimeout(heightgraphResizeHandler.timeout);
    }
    heightgraphResizeHandler = null;
  }
  
  const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
  if (indicatorCanvas) {
    const ctx = indicatorCanvas.getContext('2d');
    const rect = indicatorCanvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }
  
  const tooltip = document.getElementById('heightgraph-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
  
  if (routeState.mapInstance && routeState.mapInstance.getSource('heightgraph-hover-point')) {
    routeState.mapInstance.getSource('heightgraph-hover-point').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
}

// ============================================================================
// Stats Function
// ============================================================================

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
