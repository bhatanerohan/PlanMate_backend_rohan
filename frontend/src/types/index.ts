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

// User location structure used for centering/searching
export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

// ⭐ NEW
export interface Route {
  distance: number;
  distanceFormatted: string;
  duration: number;
  durationFormatted: string;
  geometry: {
    type: 'LineString';
    coordinates: number[][];  // [lng, lat] pairs
  };
  mode: 'walking' | 'driving' | 'cycling';
  waypoints: Array<{ lat: number; lng: number }>;
}

export interface PlanResponse {
  success: boolean;
  result?: string;
  venues: Venue[];
  events: Event[];
  routes: Route[];  // ⭐ NEW
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
    routes?: Route[];  // ⭐ NEW
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