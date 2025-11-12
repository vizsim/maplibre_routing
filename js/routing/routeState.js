// Route State Management
// Centralized state management for routing functionality

export const routeState = {
  // Map instance
  mapInstance: null,
  
  // Markers
  startMarker: null,
  endMarker: null,
  
  // Points
  startPoint: null,
  endPoint: null,
  
  // Selection state
  isSelectingStart: false,
  isSelectingEnd: false,
  
  // Profile
  selectedProfile: 'car',
  
  // Custom model for car_customizable profile
  customModel: null,
  
  // Default custom model for car_customizable profile
  defaultCustomModel_tester: {
    "distance_influence": 90,
    "priority": [
      {"if": "road_class==SECONDARY||road_class==PRIMARY||road_class==TRUNK", "multiply_by": 0.1},
      {"if": "road_class==FOOTWAY||road_class==PATH||road_class==STEPS||road_class==CYCLEWAY", "multiply_by": 0.0},
      {"if": "mapillary_coverage==false", "multiply_by": 0.1}
    ],
    "speed": [
      {"if": "true", "limit_to": "car_average_speed"},
      {"if": "car_access==false", "limit_to": 0},
      {"if": "mapillary_coverage==false", "multiply_by": 1.0}
    ]
  },

  defaultCustomModel: {
    "distance_influence": 90,
    "priority": [
      {"if": "road_class==MOTORWAY", "multiply_by": 1.0},
      {"if": "road_class==FOOTWAY||road_class==PATH||road_class==STEPS||road_class==CYCLEWAY", "multiply_by": 0.0},
      {"if": "mapillary_coverage==true", "multiply_by": 0.1}
    ],
    "speed": [
      {"if": "true", "limit_to": "car_average_speed"},
      {"if": "car_access==false", "limit_to": 0},
      {"if": "mapillary_coverage==false", "multiply_by": 1.0}
    ]
  },
  
  // Route data
  currentRouteData: null,
  currentEncodedType: 'mapillary_coverage',
  
  // Initialize state
  init(map) {
    this.mapInstance = map;
  },
  
  // Reset state
  reset() {
    this.startPoint = null;
    this.endPoint = null;
    this.isSelectingStart = false;
    this.isSelectingEnd = false;
    this.currentRouteData = null;
    
    if (this.startMarker) {
      this.startMarker.remove();
      this.startMarker = null;
    }
    if (this.endMarker) {
      this.endMarker.remove();
      this.endMarker = null;
    }
  }
};

