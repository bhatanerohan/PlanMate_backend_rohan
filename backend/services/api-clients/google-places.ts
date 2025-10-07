// backend/services/api-clients/google-places.ts

import axios from 'axios';

/**
 * Google Places API Client
 * Docs: https://developers.google.com/maps/documentation/places/web-service
 */

export interface PlaceResult {
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  priceLevel?: number;
  status?: string;
  types?: string[];
  placeId: string;
  photos?: string[];
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
}

export interface PlacesSearchParams {
  query: string;
  location?: string;
  radius?: number;
  type?: string;
  maxResults?: number;
}

export class GooglePlacesClient {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Google Places API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Text Search - Search for places by text query
   */
  async textSearch(params: PlacesSearchParams): Promise<PlaceResult[]> {
    try {
      console.log(`📍 [Google Places] Text search: "${params.query}"${params.location ? ` in ${params.location}` : ''}`);

      const query = params.location 
        ? `${params.query} in ${params.location}`
        : params.query;

      const requestParams = {
        query: query,
        key: this.apiKey,
        radius: params.radius || 5000, // 5km default
        type: params.type,
      };

      console.log('🔎 [Google Places] Request params:\n' + JSON.stringify(requestParams, null, 2));

      const response = await axios.get(`${this.baseUrl}/textsearch/json`, { params: requestParams });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      if (response.data.status === 'ZERO_RESULTS') {
        console.log('⚠️  No results found');
        return [];
      }

      const places = response.data.results
        .slice(0, params.maxResults || 10)
        .map((place: any) => this.formatPlace(place));

      console.log(`✅ Found ${places.length} places`);
      return places;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Google Places API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Nearby Search - Search for places near a location
   */
  async nearbySearch(latitude: number, longitude: number, params: Partial<PlacesSearchParams>): Promise<PlaceResult[]> {
    try {
      console.log(`📍 [Google Places] Nearby search at (${latitude}, ${longitude})`);

      const requestParams = {
        location: `${latitude},${longitude}`,
        radius: params.radius || 5000,
        type: params.type,
        keyword: params.query,
        key: this.apiKey,
      };

      console.log('🔎 [Google Places] Request params:\n' + JSON.stringify(requestParams, null, 2));

      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, { params: requestParams });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      if (response.data.status === 'ZERO_RESULTS') {
        return [];
      }

      const places = response.data.results
        .slice(0, params.maxResults || 10)
        .map((place: any) => this.formatPlace(place));

      return places;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Google Places API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get Place Details
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult> {
    try {
      const requestParams = {
        place_id: placeId,
        fields: 'name,formatted_address,geometry,rating,price_level,opening_hours,types,photos',
        key: this.apiKey,
      };

      console.log('🔎 [Google Places] Request params:\n' + JSON.stringify(requestParams, null, 2));

      const response = await axios.get(`${this.baseUrl}/details/json`, { params: requestParams });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return this.formatPlace(response.data.result);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Google Places API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Format place data from Google API response
   */
  private formatPlace(place: any): PlaceResult {
    return {
      name: place.name || 'Unknown',
      address: place.formatted_address || place.vicinity || 'Address not available',
      location: {
        lat: place.geometry?.location?.lat || 0,
        lng: place.geometry?.location?.lng || 0,
      },
      rating: place.rating,
      priceLevel: place.price_level,
      status: place.business_status || (place.opening_hours?.open_now ? 'Open' : 'Closed'),
      types: place.types || [],
      placeId: place.place_id,
      photos: place.photos?.map((photo: any) => 
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${this.apiKey}`
      ) || [],
      openingHours: place.opening_hours ? {
        openNow: place.opening_hours.open_now,
        weekdayText: place.opening_hours.weekday_text,
      } : undefined,
    };
  }

  /**
   * Helper to convert price level to string
   */
  static formatPriceLevel(level?: number): string {
    if (!level) return 'N/A';
    return '$'.repeat(level);
  }
}

// Export singleton instance
let googlePlacesClient: GooglePlacesClient | null = null;

export function getGooglePlacesClient(): GooglePlacesClient {
  if (!googlePlacesClient) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY not found in environment variables');
    }
    googlePlacesClient = new GooglePlacesClient(apiKey);
  }
  return googlePlacesClient;
}