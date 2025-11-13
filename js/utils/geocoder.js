// geocoder.js
export function setupPhotonGeocoder(map) {
  const container = document.createElement("div");
  container.className = "geocoder";
  container.innerHTML = `
    <div class="geocoder-input-wrapper">
      <svg class="geocoder-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input type="text" id="search" placeholder="Adresse suchen..." autocomplete="off" />
      <button class="geocoder-clear" id="geocoder-clear" style="display: none;" title="Löschen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="geocoder-loading" id="geocoder-loading" style="display: none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    </div>
    <div id="results" class="geocoder-results"></div>
  `;
  document.body.appendChild(container);

  const input = container.querySelector("#search");
  const resultsEl = container.querySelector("#results");
  const clearBtn = container.querySelector("#geocoder-clear");
  const loadingEl = container.querySelector("#geocoder-loading");
  let marker;
  let debounceTimeout;
  let selectedIndex = -1;
  let currentResults = [];

  async function fetchSuggestions(query) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=de&limit=5&bbox=5,47,15,55`;
    const res = await fetch(url);
    const json = await res.json();
    return json.features || [];
  }

  function formatResult(feature) {
    const props = feature.properties;
    let primary = '';
    
    // Build address: prefer street + housenumber, fallback to name
    if (props.street) {
      // We have a street name
      if (props.housenumber) {
        primary = `${props.street} ${props.housenumber}`;
      } else {
        primary = props.street;
      }
    } else if (props.name) {
      // Use name if no street property
      if (props.housenumber && !props.name.includes(props.housenumber)) {
        // Add housenumber if not already in name
        primary = `${props.housenumber} ${props.name}`.trim();
      } else {
        primary = props.name;
      }
    } else if (props.housenumber) {
      // Only housenumber available
      primary = props.housenumber;
    } else {
      primary = 'Unbekannte Adresse';
    }
    
    const location = [];
    if (props.city) location.push(props.city);
    if (props.state) location.push(props.state);
    if (props.country && props.country !== 'Deutschland') location.push(props.country);
    
    return {
      primary: primary,
      secondary: location.join(', ') || props.country || ''
    };
  }

  function selectResult(feature, index = -1) {
    const [lng, lat] = feature.geometry.coordinates;
    if (marker) marker.remove();
    marker = new maplibregl.Marker({
      color: '#3b82f6'
    }).setLngLat([lng, lat]).addTo(map);
    map.flyTo({ center: [lng, lat], zoom: 15 });
    resultsEl.style.display = "none";
    input.value = formatResult(feature).primary + (formatResult(feature).secondary ? ', ' + formatResult(feature).secondary : '');
    selectedIndex = -1;
    updateClearButton();
  }

  function showResults(features) {
    resultsEl.innerHTML = "";
    currentResults = features;
    selectedIndex = -1;
    
    if (features.length === 0) {
      resultsEl.innerHTML = '<div class="geocoder-no-results">Keine Ergebnisse gefunden</div>';
      resultsEl.style.display = "block";
      return;
    }

    features.forEach((f, index) => {
      const item = document.createElement("div");
      item.className = "geocoder-result-item";
      const formatted = formatResult(f);
      
      item.innerHTML = `
        <div class="geocoder-result-primary">${formatted.primary}</div>
        ${formatted.secondary ? `<div class="geocoder-result-secondary">${formatted.secondary}</div>` : ''}
      `;
      
      item.addEventListener("click", () => {
        selectResult(f, index);
      });
      
      item.addEventListener("mouseenter", () => {
        selectedIndex = index;
        updateResultSelection();
      });
      
      resultsEl.appendChild(item);
    });

    resultsEl.style.display = "block";
  }

  function updateResultSelection() {
    const items = resultsEl.querySelectorAll('.geocoder-result-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  }

  function updateClearButton() {
    if (input.value.length > 0) {
      clearBtn.style.display = 'flex';
    } else {
      clearBtn.style.display = 'none';
    }
  }

  function clearInput() {
    input.value = '';
    resultsEl.style.display = 'none';
    if (marker) {
      marker.remove();
      marker = null;
    }
    updateClearButton();
    input.focus();
  }

  input.addEventListener("input", (e) => {
    const query = e.target.value;
    updateClearButton();
    clearTimeout(debounceTimeout);
    
    if (query.length < 2) {
      resultsEl.style.display = "none";
      loadingEl.style.display = 'none';
      return;
    }

    loadingEl.style.display = 'flex';
    resultsEl.style.display = "none";

    debounceTimeout = setTimeout(async () => {
      loadingEl.style.display = 'none';
      const results = await fetchSuggestions(query);
      showResults(results);
    }, 300);
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && currentResults[selectedIndex]) {
        selectResult(currentResults[selectedIndex], selectedIndex);
      } else if (currentResults.length > 0) {
        selectResult(currentResults[0], 0);
      } else {
        const results = await fetchSuggestions(e.target.value);
        if (results.length > 0) {
          selectResult(results[0], 0);
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateResultSelection();
        const items = resultsEl.querySelectorAll('.geocoder-result-item');
        if (items[selectedIndex]) {
          items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateResultSelection();
      }
    } else if (e.key === "Escape") {
      resultsEl.style.display = "none";
      selectedIndex = -1;
    }
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearInput();
  });

  // Close results when clicking outside
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      resultsEl.style.display = "none";
      selectedIndex = -1;
    }
  });

  // Focus input when clicking on container
  container.addEventListener("click", (e) => {
    if (e.target === container || e.target.classList.contains('geocoder-input-wrapper')) {
      input.focus();
    }
  });
}
