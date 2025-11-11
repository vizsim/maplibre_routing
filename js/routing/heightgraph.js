// Heightgraph visualization and interactivity

import { routeState } from './routeState.js';
import { updateRouteColor } from './routeVisualization.js';

// Store event handlers to prevent duplicate listeners
let heightgraphMouseMoveHandler = null;
let heightgraphMouseLeaveHandler = null;
let routeHighlightMarker = null;

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
      }
    });
  }
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
  
  // Set canvas size
  const width = container.clientWidth - 20; // Account for padding
  const height = 150;
  canvas.width = width;
  canvas.height = height;
  
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
  
  // Padding
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
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
      ctx.fillText(labelText, padding.left - 5, y + 3);
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
        for (let i = 0; i < points.length - 1; i++) {
          const point1 = points[i];
          const point2 = points[i + 1];
          
          // Get custom_present value for this segment
          const customValue = encodedValues.custom_present[point1.index];
          const isCustomPresent = customValue === true || customValue === 'True' || customValue === 'true';
          
          // Set color based on custom_present
          const fillColor = isCustomPresent 
            ? 'rgba(59, 130, 246, 0.3)'  // Blue for true
            : 'rgba(236, 72, 153, 0.3)'; // Pink/rosa for false
          
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(point1.x, point1.y);
          ctx.lineTo(point2.x, point2.y);
          ctx.lineTo(point2.x, padding.top + graphHeight);
          ctx.lineTo(point1.x, padding.top + graphHeight);
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
              ctx.lineTo(points[i - 1].x, padding.top + graphHeight);
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
  
  // Draw distance labels on x-axis (natural numbers, no duplicates, with 0.5km steps if needed)
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  
  const totalDistanceKm = totalDistance / 1000;
  let distanceSteps = 5;
  let stepSize = totalDistanceKm / distanceSteps;
  
  // If total distance is small and would only show 0 and 1 km, use 0.5 km steps
  if (totalDistanceKm <= 1.5 && stepSize >= 0.3) {
    distanceSteps = Math.ceil(totalDistanceKm * 2); // Double the steps for 0.5km increments
    stepSize = 0.5;
  } else {
    stepSize = totalDistanceKm / distanceSteps;
  }
  
  const xLabels = new Set(); // Track X-axis labels to avoid duplicates
  
  for (let i = 0; i <= distanceSteps; i++) {
    const x = padding.left + (graphWidth / distanceSteps) * i;
    const distance = stepSize * i;
    
    // Format: use natural numbers, but allow 0.5 km if stepSize is 0.5
    let labelText;
    if (stepSize === 0.5) {
      // Show 0.5 km steps
      labelText = distance.toFixed(1) + ' km';
    } else {
      // Show natural numbers (whole numbers)
      const distanceRounded = Math.round(distance);
      labelText = distanceRounded + ' km';
    }
    
    // Only draw label if it's not a duplicate
    if (!xLabels.has(labelText)) {
      xLabels.add(labelText);
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
    }
    setupHeightgraphInteractivity(canvas, baseData, totalDistance, coordinates);
  }
}

// Helper function to get color for surface value
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
    'paving_stones': 'rgba(99, 102, 241, 0.3)' // Indigo
  };
  
  const normalizedValue = String(surfaceValue).toLowerCase();
  return surfaceColors[normalizedValue] || 'rgba(156, 163, 175, 0.3)'; // Default gray
}

function setupHeightgraphInteractivity(canvas, elevations, totalDistance, coordinates) {
  if (!canvas || !routeState.currentRouteData || !routeState.mapInstance || !coordinates || coordinates.length === 0) return;
  
  const { encodedValues } = routeState.currentRouteData;
  const select = document.getElementById('heightgraph-encoded-select');
  const selectedType = select ? select.value : 'custom_present';
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
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
    
    // Check if mouse is within graph area
    if (x < padding.left || x > padding.left + graphWidth || 
        y < padding.top || y > padding.top + graphHeight) {
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
    const relativeX = x - padding.left;
    const dataIndex = Math.round((relativeX / graphWidth) * (elevations.length - 1));
    
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
      
      // Add selected encoded value (custom_present or surface)
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
        const indicatorCanvas = document.getElementById('heightgraph-indicator-canvas');
        if (indicatorCanvas) {
          const indicatorCtx = indicatorCanvas.getContext('2d');
          
          // Clear previous indicator line
          indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
          
          // Draw new indicator line
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

