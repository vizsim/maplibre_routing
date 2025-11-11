# Heightgraph.js Verbesserungen
## Robuster & Nachvollziehbarer machen

---

## 🔍 Aktuelle Probleme

1. **`drawHeightgraph()` ist zu groß** (~470 Zeilen)
   - Macht zu viel: Canvas-Setup, Daten-Verarbeitung, Zeichnen, Interaktivität
   - Schwer zu testen und zu debuggen

2. **Hardcoded Werte überall**
   - Padding: `{ top: 20, right: 5, bottom: 30, left: 25 }` (2x im Code!)
   - Magic Numbers: `gridSteps = 5`, `debounce = 150ms`, `height = 150`
   - Keine zentrale Konfiguration

3. **Wiederholte DOM-Zugriffe**
   - `getElementById('heightgraph-canvas')` mehrfach
   - `getElementById('heightgraph-encoded-select')` mehrfach
   - Keine Caching

4. **Duplizierte Segment-Fill-Logik**
   - `custom_present`, `surface`, `road_class` haben fast identische Fill-Logik
   - ~150 Zeilen duplizierter Code

5. **`setupHeightgraphInteractivity()` ist riesig** (~300 Zeilen)
   - Event-Handler, Tooltip-Management, Canvas-Drawing alles in einer Funktion

6. **Fehlende Validierung**
   - Keine Checks ob Daten konsistent sind
   - Keine Checks ob Arrays gleich lang sind

---

## ✅ Konkrete Verbesserungen (Umsetzbar)

### 1. Konfiguration zentralisieren ⭐⭐⭐

**Problem:** Hardcoded Werte überall

**Lösung:**
```javascript
// Am Anfang der Datei
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
    text: '#6b7280'
  },
  debounce: {
    resize: 150
  }
};
```

**Impact:** Hoch - Einfach zu ändern, klar dokumentiert

---

### 2. DOM-Elemente cachen ⭐⭐

**Problem:** Wiederholte `getElementById()` Calls

**Lösung:**
```javascript
// Am Anfang von drawHeightgraph
const elements = {
  container: document.getElementById('heightgraph-container'),
  canvas: document.getElementById('heightgraph-canvas'),
  indicatorCanvas: document.getElementById('heightgraph-indicator-canvas'),
  select: document.getElementById('heightgraph-encoded-select')
};

if (!elements.container || !elements.canvas) return;
```

**Impact:** Mittel - Performance + Lesbarkeit

---

### 3. Segment-Fill-Logik extrahieren ⭐⭐⭐

**Problem:** 150 Zeilen duplizierter Code für custom_present, surface, road_class

**Lösung:**
```javascript
function fillSegmentsByValue(ctx, points, values, getColor, padding, graphHeight) {
  let currentValue = null;
  let segmentStart = 0;
  
  for (let i = 0; i < points.length; i++) {
    const value = values[points[i].index];
    
    if (value !== currentValue || i === 0) {
      // Fill previous segment
      if (currentValue !== null && i > segmentStart) {
        const fillColor = getColor(currentValue);
        fillSegment(ctx, points, segmentStart, i, fillColor, padding, graphHeight);
      }
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

function fillSegment(ctx, points, startIdx, endIdx, color, padding, graphHeight) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[startIdx].x, points[startIdx].y);
  for (let j = startIdx + 1; j < endIdx; j++) {
    ctx.lineTo(points[j].x, points[j].y);
  }
  ctx.lineTo(points[endIdx - 1].x, padding.top + graphHeight);
  ctx.lineTo(points[startIdx].x, padding.top + graphHeight);
  ctx.closePath();
  ctx.fill();
}
```

**Impact:** Hoch - 150 Zeilen → 30 Zeilen, viel wartbarer

---

### 4. Daten-Validierung hinzufügen ⭐⭐

**Problem:** Keine Checks ob Daten konsistent sind

**Lösung:**
```javascript
function validateHeightgraphData(elevations, coordinates, encodedValues) {
  const errors = [];
  
  if (elevations.length !== coordinates.length) {
    errors.push(`Elevation count (${elevations.length}) doesn't match coordinates (${coordinates.length})`);
  }
  
  Object.keys(encodedValues).forEach(key => {
    if (encodedValues[key].length !== coordinates.length) {
      errors.push(`Encoded value '${key}' length (${encodedValues[key].length}) doesn't match coordinates (${coordinates.length})`);
    }
  });
  
  if (errors.length > 0) {
    console.warn('Heightgraph data validation errors:', errors);
    // Return false or throw, depending on severity
  }
  
  return errors.length === 0;
}
```

**Impact:** Mittel - Verhindert Bugs, besseres Debugging

---

### 5. Drawing-Funktionen extrahieren ⭐⭐

**Problem:** `drawHeightgraph()` macht zu viel

**Lösung:**
```javascript
function drawGrid(ctx, padding, graphWidth, graphHeight, elevationMin, elevationMax) {
  // Grid drawing logic
}

function drawElevationLine(ctx, points, padding, graphHeight) {
  // Elevation line drawing
}

function drawXAxisLabels(ctx, padding, graphWidth, graphHeight, actualTotalDistance) {
  // X-axis label drawing
}
```

**Impact:** Mittel - Bessere Lesbarkeit, testbarer

---

### 6. Tooltip-Manager extrahieren ⭐

**Problem:** Tooltip-Logik in `setupHeightgraphInteractivity()` versteckt

**Lösung:**
```javascript
class TooltipManager {
  constructor() {
    this.tooltip = null;
  }
  
  getOrCreate() {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'heightgraph-tooltip';
      // ... styling
      document.body.appendChild(this.tooltip);
    }
    return this.tooltip;
  }
  
  show(content, x, y) {
    const tooltip = this.getOrCreate();
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    // Position calculation
  }
  
  hide() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }
  
  remove() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }
}
```

**Impact:** Niedrig-Mittel - Bessere Organisation

---

### 7. Kumulative Distanz-Berechnung extrahieren ⭐⭐

**Problem:** Wird 2x berechnet (in drawHeightgraph und setupHeightgraphInteractivity)

**Lösung:**
```javascript
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
```

**Impact:** Mittel - DRY, weniger Bugs

---

## 📋 Priorisierte Umsetzung

### Phase 1: Quick Wins (30 Min)
1. ✅ Konfiguration zentralisieren
2. ✅ DOM-Elemente cachen
3. ✅ Kumulative Distanz-Funktion extrahieren

### Phase 2: Code-Reduktion (45 Min)
4. ✅ Segment-Fill-Logik extrahieren (größter Impact!)

### Phase 3: Robustheit (30 Min)
5. ✅ Daten-Validierung hinzufügen
6. ✅ Drawing-Funktionen extrahieren

### Phase 4: Optional (wenn Zeit)
7. ✅ Tooltip-Manager

---

## 🎯 Erwarteter Impact

**Vorher:**
- ❌ 1009 Zeilen, schwer zu verstehen
- ❌ Hardcoded Werte überall
- ❌ 150 Zeilen duplizierter Code
- ❌ Keine Validierung

**Nachher:**
- ✅ ~800 Zeilen, klarer strukturiert
- ✅ Zentrale Konfiguration
- ✅ DRY: Segment-Fill-Logik wiederverwendbar
- ✅ Validierung verhindert Bugs
- ✅ Einfacher zu testen und zu debuggen

**Zeitaufwand:** ~2 Stunden
**Impact:** Hoch (Wartbarkeit + Robustheit)

