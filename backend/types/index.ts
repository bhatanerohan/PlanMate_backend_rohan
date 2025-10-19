// backend/types/index.ts

export type IntentCategory = 
  | 'venue_search'
  | 'activity_event'
  | 'quick_itinerary'
  | 'day_itinerary'
  | 'multi_day_itinerary'
  | 'not_relevant';

// NEW: Enhanced classification with routing
export type QueryType = 
  | 'explicit_route'      // "route from A to B"
  | 'itinerary_planning'  // "bar crawl", "date night"
  | 'discovery'           // "best pizza", "find bars"
  | 'not_relevant';       // "what's 2+2"

export type RouteTo = 'agent1' | 'agent2' | null;

// UPDATED: Classification result with routing info
export interface ClassificationResult {
  isRelevant: boolean;
  category: IntentCategory;
  reasoning: string;
  prompt: string;
}

// NEW: Enhanced classification result
export interface EnhancedClassificationResult {
  isRelevant: boolean;
  routeTo: RouteTo;
  queryType: QueryType;
  reasoning: string;
  prompt: string;
}

export interface ClassifyRequest {
  prompt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  env: string;
  openai: boolean;
}

// NEW: Plan Creator types
export interface PlanStop {
  slot: number;
  category: string;
  description?: string;
}

export interface ItineraryPlan {
  planType: string;
  stops: PlanStop[];
  location: string;
  reasoning: string;
}