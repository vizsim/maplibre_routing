// Route State Management
// Centralized state management for routing functionality

import { defaultCustomModel } from './customModel.js';

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
  
  // Default custom model (imported from customModel.js)
  get defaultCustomModel() {
    return defaultCustomModel;
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

