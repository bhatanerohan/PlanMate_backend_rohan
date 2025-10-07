// backend/types/index.ts

export type IntentCategory = 
  | 'venue_search'          // Looking for venues: "find Starbucks", "gyms near me", "parks in Boston"
  | 'activity_event'        // "find concert tonight"
  | 'quick_itinerary'       // Few hours: "I'm hungry", "plan evening"
  | 'day_itinerary'         // Full day
  | 'multi_day_itinerary'   // Multiple days
  | 'not_relevant';

export interface ClassificationResult {
  isRelevant: boolean;
  category: IntentCategory;
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