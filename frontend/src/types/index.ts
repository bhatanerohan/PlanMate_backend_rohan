import type { ReactNode } from "react";

export type GeoPreferenceMode = 'auto' | 'walkable' | 'spread';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
}

export interface Venue {
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
    coordinates: string;
  };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  placeId: string;
  types?: string[];
  photos?: string[];
  description?: string;
  photoUrl?: string;
  videos?: YouTubeVideo[];
  instagramReels?: InstagramReel[];
  category?: string;
  priority?: 'must_have' | 'nice_to_have';
  reasoning?: string;
  reviewsSummary?: string;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  thumbnailHigh?: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount?: string;
  likeCount?: string;
}

export interface InstagramReel {
  id: string;
  shortCode: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  likesCount: number;
  viewCount: number;
  commentsCount: number;
  ownerUsername: string;
  hashtags: string[];
  timestamp: string;
  url: string;
}

export interface Event {
  address: ReactNode;
  description: any;
  dateTime: string | number | Date;
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

export interface FinishParameters {
  result: string;
  mode: 'discovery' | 'route';
  selected_venue_ids?: string[];
  alternatives_map?: Record<string, Venue[]>;
}

export interface AgentState {
  status: string;
  currentIteration: number;
  startTime: number;
  totalTokensUsed: number;
  conversationHistory: any[];
  toolResults: any[];
  finalResult?: string;
  finishParameters?: FinishParameters;
  error?: string;
}

export interface SavedTripSummary {
  id: string;
  title: string;
  mode: 'route' | 'discovery';
  venueCount: number;
  originalPrompt: string;
  createdAt: string;
  updatedAt: string;
}


export interface AdminDashboardSummary {
  totalPlans: number;
  uniqueSessions: number;
  mobilePlans: number;
  desktopPlans: number;
  avgExecutionTimeMs: number;
  totalModificationCount: number;
  avgModificationCount: number;
  reelClickRate: number;
  totalReelInteractions: number;
  savedTrips: number;
  sharedTrips: number;
  totalUsers: number;
}

export interface AdminRecentAnalyticsEvent {
  id: number;
  sessionId: string;
  tripId?: string;
  timestamp: string;
  deviceType: string | null;
  userPrompt: string;
  queryType: string | null;
  totalTimeMs: number;
  modificationCount: number;
  clickedReels: boolean;
  reelInteractionCount: number;
}

export interface AdminTopPrompt {
  prompt: string;
  count: number;
  lastSeenAt: string;
}

export interface AdminTripSummary extends SavedTripSummary {
  userId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  sharedCount: number;
}

export interface AdminDashboardData {
  summary: AdminDashboardSummary;
  recentEvents: AdminRecentAnalyticsEvent[];
  topPrompts: AdminTopPrompt[];
  recentTrips: AdminTripSummary[];
  ownerEmail: string;
}
export interface PlanResponse {
  success: boolean;
  session_id?: string;
  result?: string;
  mode?: 'discovery' | 'route';
  queryType?: 'explicit_route' | 'itinerary_planning' | 'discovery' | 'itinerary_modification' | 'not_relevant';
  venues: Venue[];
  events: Event[];
  routes?: Route[];
  alternativesMap?: Record<string, Venue[]>;
  state?: AgentState;
  iterations: number;
  tokensUsed: number;
  executionTimeMs: number;
  stoppedReason?: string;
  error?: string;
  isModification?: boolean;
  tripId?: string;
  tripSummary?: SavedTripSummary;
}

export interface SharedTripPayload {
  tripId?: string;
  result: string;
  mode: 'route' | 'discovery';
  venues: Venue[];
  events?: Event[];
  routes?: Route[];
  alternativesMap?: Record<string, Venue[]>;
  originalPrompt?: string;
  createdBy?: string;
}

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  data?: {
    venues?: Venue[];
    events?: Event[];
    alternativesMap?: Record<string, Venue[]>;
    originalPrompt?: string;
    tripId?: string;
    tripSummary?: SavedTripSummary;
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
  metadata?: {
    isPrimary?: boolean;
    isAlternative?: boolean;
    stopNumber?: number;
    primaryPlaceId?: string;
    primaryVenueName?: string;
    primaryStopNumber?: number;
  };
}

export interface Location {
  lat: number;
  lng: number;
  name: string;
}

export interface Route {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distance: number;
  distanceFormatted: string;
  duration: number;
  durationFormatted: string;
  start?: string;
  end?: string;
}

