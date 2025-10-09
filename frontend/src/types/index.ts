// frontend/src/types/index.ts

export interface Venue {
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
    coordinates: string;
  };
  rating?: number;
  priceLevel?: string;
  placeId: string;
  types?: string[];
}

export interface Event {
  name: string;
  venue: {
    name: string;
    address: string;
    city: string;
    state?: string;
    location?: {
      lat: number;
      lng: number;
      coordinates: string;
    };
  };
  date: string;
  time?: string;
  priceRange?: string;
  url: string;
  category?: string;
  ticketsAvailable?: boolean;
}

export interface PlanResponse {
  success: boolean;
  result?: string;
  mode?: 'discovery' | 'route';  // NEW: Add mode field
  venues: Venue[];
  events: Event[];
  routes?: Route[];  // Add this line (optional because backend might not send it)
  iterations: number;
  tokensUsed: number;
  executionTimeMs: number;
  stoppedReason?: string;
  error?: string;
}

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  data?: {
    venues?: Venue[];
    events?: Event[];
  };
}

export interface MapMarker {
  id: string;
  position: {
    lat: number;
    lng: number;
  };
  title: string;
  type: 'venue' | 'event';
  data: Venue | Event;
}

// Location interface for user location and geocoding
export interface Location {
  lat: number;
  lng: number;
  name: string;
}

// Route interface for rendering paths between markers
export interface Route {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // Array of [lng, lat] pairs
  };
  distance: number; // in kilometers
  distanceFormatted: string; // e.g., "2.5 km"
  duration: number; // in seconds
  durationFormatted: string; // e.g., "15 min walk"
  start?: string; // Starting point name
  end?: string; // Ending point name
}