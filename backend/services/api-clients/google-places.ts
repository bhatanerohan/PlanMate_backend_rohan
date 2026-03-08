// backend/services/api-clients/google-places.ts
// Uses Places API (New) — legacy /maps/api/place/* endpoints are deprecated

import axios from 'axios';

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
  description?: string;
  photoUrl?: string;
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
  private newBaseUrl = 'https://places.googleapis.com/v1';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Google Places API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Resolve a Places API (New) photo resource name to an actual CDN image URL.
   * The /media endpoint with skipHttpRedirect=true returns JSON with a `photoUri` field.
   */
  private async resolvePhotoUrl(photoResourceName: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.newBaseUrl}/${photoResourceName}/media`,
        {
          params: {
            maxHeightPx: 800,
            maxWidthPx: 800,
            skipHttpRedirect: true,
            key: this.apiKey,
          },
          // Don't follow redirects — we need the JSON response
          maxRedirects: 0,
        }
      );
      // The response body is { name, photoUri }
      return response.data?.photoUri || null;
    } catch (err: any) {
      // axios throws on 3xx when maxRedirects=0; check headers for Location
      if (err.response?.status >= 300 && err.response?.status < 400) {
        return err.response.headers?.location || null;
      }
      return null;
    }
  }

  /**
   * Resolve up to `limit` photo resource names in parallel to CDN URLs.
   */
  private async resolvePhotoUrls(photos: any[], limit = 10): Promise<string[]> {
    const slice = (photos || []).slice(0, limit);
    const results = await Promise.all(
      slice.map((p: any) => {
        const name: string = p.name || '';
        return name ? this.resolvePhotoUrl(name) : Promise.resolve(null);
      })
    );
    return results.filter((u): u is string => !!u);
  }

  /**
   * Text Search — Places API (New)
   * POST https://places.googleapis.com/v1/places:searchText
   */
  async textSearch(params: PlacesSearchParams): Promise<PlaceResult[]> {
    try {
      console.log(`🔍 [Google Places] Text search: "${params.query}"${params.location ? ` in ${params.location}` : ''}`);

      const query = params.location
        ? `${params.query} in ${params.location}`
        : params.query;

      const body: any = {
        textQuery: query,
        maxResultCount: Math.min(params.maxResults || 10, 20),
      };

      if (params.type) {
        body.includedType = params.type;
      }

      const fields = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.priceLevel',
        'places.businessStatus',
        'places.types',
        'places.photos',
        'places.currentOpeningHours',
        'places.regularOpeningHours',
        'places.editorialSummary',
      ].join(',');

      const response = await axios.post(
        `${this.newBaseUrl}/places:searchText`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fields,
          },
        }
      );

      const rawPlaces: any[] = response.data.places || [];

      if (rawPlaces.length === 0) {
        console.log('⚠️  No results found');
        return [];
      }

      // Resolve photo URLs for all places in parallel
      const formatted = await Promise.all(rawPlaces.map((p) => this.formatPlaceNew(p)));
      console.log(`✅ Found ${formatted.length} places`);
      return formatted;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`Google Places API request failed: ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Nearby Search — Places API (New)
   * POST https://places.googleapis.com/v1/places:searchNearby
   * If a text query is given, falls back to textSearch with location bias.
   */
  async nearbySearch(latitude: number, longitude: number, params: Partial<PlacesSearchParams>): Promise<PlaceResult[]> {
    try {
      console.log(`🔍 [Google Places] Nearby search at (${latitude}, ${longitude})`);

      // New Nearby Search doesn't support free-text — use textSearch with location
      if (params.query) {
        return this.textSearch({
          query: params.query,
          location: `${latitude},${longitude}`,
          radius: params.radius,
          maxResults: params.maxResults,
        });
      }

      const body: any = {
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: params.radius || 5000,
          },
        },
        maxResultCount: Math.min(params.maxResults || 10, 20),
      };

      if (params.type) {
        body.includedTypes = [params.type];
      }

      const fields = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.priceLevel',
        'places.businessStatus',
        'places.types',
        'places.photos',
        'places.currentOpeningHours',
        'places.editorialSummary',
      ].join(',');

      const response = await axios.post(
        `${this.newBaseUrl}/places:searchNearby`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fields,
          },
        }
      );

      const rawPlaces: any[] = response.data.places || [];
      return await Promise.all(rawPlaces.map((p) => this.formatPlaceNew(p)));

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`Google Places API request failed: ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Get Place Details — Places API (New)
   * GET https://places.googleapis.com/v1/places/{id}
   */
  async getPlaceDetails(placeId: string): Promise<PlaceResult> {
    try {
      const fields = [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'rating',
        'priceLevel',
        'currentOpeningHours',
        'regularOpeningHours',
        'types',
        'photos',
        'editorialSummary',
        'businessStatus',
      ].join(',');

      const response = await axios.get(
        `${this.newBaseUrl}/places/${placeId}`,
        {
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fields,
          },
        }
      );

      return this.formatPlaceNew(response.data);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.error?.message || error.message;
        throw new Error(`Google Places API request failed: ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Format a place from the Places API (New) response shape.
   * Resolves photo resource names to actual CDN URLs.
   */
  private async formatPlaceNew(place: any): Promise<PlaceResult> {
    const name = place.displayName?.text || 'Unknown';

    // Editorial summary
    const description: string | undefined =
      place.editorialSummary?.text?.trim() || undefined;

    if (description) {
      console.log(`   ✅ ${name}: Got description (${description.length} chars)`);
    } else {
      console.log(`   ⚠️  ${name}: No editorial summary available`);
    }

    // Resolve photo resource names → actual CDN URLs (max 5 photos)
    const rawPhotos: any[] = place.photos || [];
    let photoUrls: string[] = [];

    if (rawPhotos.length > 0) {
      photoUrls = await this.resolvePhotoUrls(rawPhotos, 5);
      if (photoUrls.length > 0) {
        console.log(`   📷 ${name}: Got ${photoUrls.length} photos`);
      }
    }

    const photoUrl = photoUrls[0];

    // Opening hours
    const hours = place.currentOpeningHours || place.regularOpeningHours;
    const openingHours = hours
      ? {
        openNow: hours.openNow,
        weekdayText: hours.weekdayDescriptions,
      }
      : undefined;

    // Price level — new API returns a string enum
    const priceLevelMap: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    const priceLevel =
      typeof place.priceLevel === 'string'
        ? priceLevelMap[place.priceLevel]
        : typeof place.priceLevel === 'number'
          ? place.priceLevel
          : undefined;

    return {
      name,
      address: place.formattedAddress || 'Address not available',
      location: {
        lat: place.location?.latitude || 0,
        lng: place.location?.longitude || 0,
      },
      rating: place.rating,
      priceLevel,
      status: place.businessStatus || undefined,
      types: place.types || [],
      placeId: place.id || '',
      photos: photoUrls,
      photoUrl,
      description,
      openingHours,
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