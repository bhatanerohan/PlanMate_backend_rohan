// backend/services/api-clients/ticketmaster.ts

import axios from 'axios';

/**
 * Ticketmaster Discovery API Client
 * Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

export interface EventResult {
  name: string;
  venue: {
    name: string;
    address: string;
    city: string;
    state?: string;
    location?: {
      lat: number;
      lng: number;
    };
  };
  date: string;
  time?: string;
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  url: string;
  images?: string[];
  category?: string;
  status?: string;
  ticketsAvailable?: boolean;
}

export interface EventSearchParams {
  keyword?: string;
  city?: string;
  stateCode?: string;
  startDateTime?: string;
  endDateTime?: string;
  size?: number;
  classificationName?: string; // Music, Sports, Arts & Theatre, Film, Miscellaneous
}

export class TicketmasterClient {
  private apiKey: string;
  private baseUrl = 'https://app.ticketmaster.com/discovery/v2';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Ticketmaster API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Search for events
   */
  async searchEvents(params: EventSearchParams): Promise<EventResult[]> {
    try {
      console.log(`🎭 [Ticketmaster] Searching events: "${params.keyword || 'all'}"${params.city ? ` in ${params.city}` : ''}`);

      const requestParams = {
        apikey: this.apiKey,
        keyword: params.keyword,
        city: params.city,
        stateCode: params.stateCode,
        startDateTime: params.startDateTime,
        endDateTime: params.endDateTime,
        size: params.size || 20,
        classificationName: params.classificationName,
        sort: 'date,asc',
      };

      console.log('🔎 [Ticketmaster] Request params:\n' + JSON.stringify(requestParams, null, 2));

      const response = await axios.get(`${this.baseUrl}/events.json`, { params: requestParams });

      if (!response.data._embedded?.events) {
        console.log('⚠️  No events found');
        return [];
      }

      const events = response.data._embedded.events
        .slice(0, params.size || 10)
        .map((event: any) => this.formatEvent(event));

      console.log(`✅ Found ${events.length} events`);
      return events;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid Ticketmaster API key');
        }
        throw new Error(`Ticketmaster API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get event details by ID
   */
  async getEventDetails(eventId: string): Promise<EventResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/events/${eventId}.json`, {
        params: {
          apikey: this.apiKey,
        }
      });

      return this.formatEvent(response.data);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ticketmaster API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Search events by location (lat/lng)
   */
  async searchEventsByLocation(
    latitude: number,
    longitude: number,
    params: Partial<EventSearchParams>
  ): Promise<EventResult[]> {
    try {
      console.log(`🎭 [Ticketmaster] Searching events near (${latitude}, ${longitude})`);

      const response = await axios.get(`${this.baseUrl}/events.json`, {
        params: {
          apikey: this.apiKey,
          latlong: `${latitude},${longitude}`,
          radius: '25',
          unit: 'miles',
          keyword: params.keyword,
          startDateTime: params.startDateTime,
          endDateTime: params.endDateTime,
          size: params.size || 20,
          classificationName: params.classificationName,
          sort: 'date,asc',
        }
      });

      if (!response.data._embedded?.events) {
        return [];
      }

      const events = response.data._embedded.events
        .slice(0, params.size || 10)
        .map((event: any) => this.formatEvent(event));

      return events;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ticketmaster API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Format event data from Ticketmaster API response
   */
  private formatEvent(event: any): EventResult {
    const venue = event._embedded?.venues?.[0] || {};
    const location = venue.location || {};
    
    // Parse date and time
    const dateObj = event.dates?.start;
    const date = dateObj?.localDate || 'Date TBA';
    const time = dateObj?.localTime || undefined;

    // Parse price range
    let priceRange = undefined;
    if (event.priceRanges?.[0]) {
      priceRange = {
        min: event.priceRanges[0].min,
        max: event.priceRanges[0].max,
        currency: event.priceRanges[0].currency || 'USD',
      };
    }

    return {
      name: event.name || 'Unknown Event',
      venue: {
        name: venue.name || 'Unknown Venue',
        address: venue.address?.line1 || 'Address not available',
        city: venue.city?.name || '',
        state: venue.state?.stateCode,
        location: location.latitude && location.longitude ? {
          lat: parseFloat(location.latitude),
          lng: parseFloat(location.longitude),
        } : undefined,
      },
      date,
      time,
      priceRange,
      url: event.url || '',
      images: event.images?.map((img: any) => img.url) || [],
      category: event.classifications?.[0]?.segment?.name,
      status: event.dates?.status?.code || 'onsale',
      ticketsAvailable: event.dates?.status?.code !== 'cancelled' && event.dates?.status?.code !== 'offsale',
    };
  }

  /**
   * Helper to format price range
   */
  static formatPriceRange(priceRange?: EventResult['priceRange']): string {
    if (!priceRange) return 'Price not available';
    return `$${priceRange.min}-$${priceRange.max}`;
  }

  /**
   * Helper to parse date strings for API
   * Converts natural language to ISO format
   */
  static parseDateRange(input: string): { start?: string; end?: string } {
    const now = new Date();
    const result: { start?: string; end?: string } = {};

    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('tonight') || lowerInput.includes('today')) {
      result.start = now.toISOString().split('T')[0] + 'T00:00:00Z';
      result.end = now.toISOString().split('T')[0] + 'T23:59:59Z';
    } else if (lowerInput.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      result.start = tomorrow.toISOString().split('T')[0] + 'T00:00:00Z';
      result.end = tomorrow.toISOString().split('T')[0] + 'T23:59:59Z';
    } else if (lowerInput.includes('this weekend')) {
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
      const saturday = new Date(now);
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      
      const sunday = new Date(saturday);
      sunday.setDate(sunday.getDate() + 1);
      
      result.start = saturday.toISOString().split('T')[0] + 'T00:00:00Z';
      result.end = sunday.toISOString().split('T')[0] + 'T23:59:59Z';
    } else if (lowerInput.includes('next week')) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      result.start = nextWeek.toISOString().split('T')[0] + 'T00:00:00Z';
      
      const nextWeekEnd = new Date(nextWeek);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      result.end = nextWeekEnd.toISOString().split('T')[0] + 'T23:59:59Z';
    }

    return result;
  }
}

// Export singleton instance
let ticketmasterClient: TicketmasterClient | null = null;

export function getTicketmasterClient(): TicketmasterClient {
  if (!ticketmasterClient) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      throw new Error('TICKETMASTER_API_KEY not found in environment variables');
    }
    ticketmasterClient = new TicketmasterClient(apiKey);
  }
  return ticketmasterClient;
}