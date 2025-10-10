// backend/services/tools/event-search.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { getTicketmasterClient, TicketmasterClient } from '../api-clients/ticketmaster.js';

/**
 * Event Search Tool
 * Searches for events and activities using Ticketmaster API
 * Features:
 * - Progressive radius expansion if no results
 * - Fallback to generic search if specific query returns empty
 */
export class EventSearchTool extends Tool {
  name: ToolName = 'search_events';
  description = 'Search for events, concerts, shows, sports, and activities';

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Event type (e.g., "concert", "comedy show", "sports", "theater"). Leave as "events" for any type.'
          },
          location: {
            type: 'string',
            description: 'Location to search in (e.g., "Boston", "New York")'
          },
          near_coordinates: {
            type: 'string',
            description: 'Optional: Search near specific coordinates for geographic optimization. Format: "latitude,longitude" (e.g., "42.365,-71.054"). Use this to find events near your planned activities.'
          },
          date: {
            type: 'string',
            description: 'Date or time period (e.g., "tonight", "this weekend", "next week")'
          },
          limit: {
            type: 'string',
            description: 'Maximum number of results (optional, default 10)'
          }
        },
        required: ['query', 'location']
      }
    };
  }

  async execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();

    // Validate parameters
    const validation = this.validate(parameters);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    const { query, location, near_coordinates, date, limit } = parameters;

    try {
      // Get Ticketmaster client
      const ticketmasterClient = getTicketmasterClient();

      // Parse date range
      const dateRange = date ? TicketmasterClient.parseDateRange(date as string) : {};

      let events;
      let searchAttempts = 0;
      const maxAttempts = 2; // Try specific query, then fallback to generic

      // GEOGRAPHIC OPTIMIZATION: Use coordinates if provided
      if (near_coordinates) {
        const coords = this.parseCoordinates(near_coordinates as string);
        if (!coords) {
          return this.error('Invalid coordinates format. Use "latitude,longitude"');
        }

        console.log(`🎭 [EventSearchTool] Geographic search: "${query}" near (${coords.lat}, ${coords.lng})`);

        // Try specific query first
        searchAttempts++;
        events = await ticketmasterClient.searchEventsByLocation(
          coords.lat,
          coords.lng,
          {
            keyword: query !== 'events' ? query : undefined, // Don't use keyword if generic
            startDateTime: dateRange.start,
            endDateTime: dateRange.end,
            size: parseInt(limit as string) || 10
          }
        );

        // FALLBACK: If no results with specific query, try ANY events
        if (events.length === 0 && query !== 'events') {
          console.log(`   ⚠️ No "${query}" events found. Trying any events nearby...`);
          searchAttempts++;
          
          events = await ticketmasterClient.searchEventsByLocation(
            coords.lat,
            coords.lng,
            {
              keyword: undefined, // No keyword filter = get any events
              startDateTime: dateRange.start,
              endDateTime: dateRange.end,
              size: parseInt(limit as string) || 10
            }
          );

          if (events.length > 0) {
            console.log(`   ✅ Found ${events.length} events (any type) nearby`);
          }
        }

      } else {
        // Broad city search
        console.log(`🎭 [EventSearchTool] City search: "${query}" in "${location}"${date ? ` on ${date}` : ''}`);

        // Try specific query first
        searchAttempts++;
        events = await ticketmasterClient.searchEvents({
          keyword: query !== 'events' ? query : undefined,
          city: location,
          startDateTime: dateRange.start,
          endDateTime: dateRange.end,
          size: parseInt(limit as string) || 10
        });

        // FALLBACK: If no results with specific query, try ANY events
        if (events.length === 0 && query !== 'events') {
          console.log(`   ⚠️ No "${query}" events found in ${location}. Trying any events...`);
          searchAttempts++;
          
          events = await ticketmasterClient.searchEvents({
            keyword: undefined, // No keyword = any events
            city: location,
            startDateTime: dateRange.start,
            endDateTime: dateRange.end,
            size: parseInt(limit as string) || 10
          });

          if (events.length > 0) {
            console.log(`   ✅ Found ${events.length} events (any type) in ${location}`);
          }
        }
      }

      // Format results for the agent - include venue coordinates for distance calculation
      // Format results for the agent - include venue coordinates for distance calculation
const formattedEvents = events.map(event => ({
  name: event.name,
  venue: {
    name: event.venue.name,
    address: event.venue.address,
    city: event.venue.city,
    state: event.venue.state,
    location: event.venue.location ? {
      lat: event.venue.location.lat,
      lng: event.venue.location.lng,
      coordinates: `${event.venue.location.lat},${event.venue.location.lng}`
    } : undefined
  },
  date: event.date,
  time: event.time,
  priceRange: event.priceRange ? 
    TicketmasterClient.formatPriceRange(event.priceRange) : 
    'Price not available',
  url: event.url,
  category: event.category,
  ticketsAvailable: event.ticketsAvailable
}));

// ========================================================================
// DEDUPLICATE: Group same event at same venue
// ========================================================================
const deduplicatedEvents = this.deduplicateEvents(formattedEvents);
console.log(`   📊 Deduplicated ${formattedEvents.length} events → ${deduplicatedEvents.length} unique events`);
     


const latency = Date.now() - startTime;

      if (formattedEvents.length === 0) {
        return this.success(
          {
            events: [],
            count: 0,
            query,
            location,
            date: date || 'any time',
            message: 'No events found in this area or timeframe. Try different dates or location.'
          },
          {
            apiCalls: searchAttempts,
            latency,
            source: 'ticketmaster'
          }
        );
      }

      return this.success(
        {
          events: deduplicatedEvents,  // ← Changed from formattedEvents
          count: deduplicatedEvents.length,  // ← Changed
          originalCount: formattedEvents.length,  // ← New: track original count
          query,
          location,
          date: date || 'any time',
          searchType: near_coordinates ? 'coordinate-based' : 'city-based',
          fallbackUsed: searchAttempts > 1,
          message: searchAttempts > 1
            ? `Specific "${query}" not available, showing other events nearby`
            : near_coordinates 
              ? `Found ${formattedEvents.length} events near coordinates` 
              : `Found ${formattedEvents.length} events in ${location}`
        },
        {
          apiCalls: searchAttempts,
          latency,
          source: 'ticketmaster'
        }
      );

    } catch (error) {
      console.error('❌ [EventSearchTool] Error:', error);
      
      return this.error(
        error instanceof Error ? error.message : 'Unknown error during event search'
      );
    }
  }

  /**
 * Deduplicate events - group same show at same venue
 * Returns unique events with combined date info
 */
private deduplicateEvents(events: any[]): any[] {
  // Group by event name + venue name
  const grouped = new Map<string, any[]>();
  
  events.forEach(event => {
    const key = `${event.name}|||${event.venue.name}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(event);
  });

  // Create deduplicated list
  const deduplicated: any[] = [];
  
  grouped.forEach((eventGroup, key) => {
    if (eventGroup.length === 1) {
      // Single showtime - keep as is
      deduplicated.push(eventGroup[0]);
    } else {
      // Multiple showtimes - combine dates
      const firstEvent = eventGroup[0];
      const dates = [...new Set(eventGroup.map(e => e.date))].sort();
      
      deduplicated.push({
        ...firstEvent,
        date: dates.length === 1 ? dates[0] : `${dates[0]} - ${dates[dates.length - 1]}`,
        time: eventGroup.length > 1 ? 'Multiple showtimes' : firstEvent.time,
        showtimeCount: eventGroup.length,
        allDates: dates // For frontend to show details
      });
    }
  });

  return deduplicated;
}

  /**
   * Parse coordinates from string "lat,lng"
   */
  private parseCoordinates(coords: string): { lat: number; lng: number } | null {
    try {
      const parts = coords.split(',').map(s => s.trim());
      if (parts.length !== 2) return null;
      
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      
      if (isNaN(lat) || isNaN(lng)) return null;
      if (lat < -90 || lat > 90) return null;
      if (lng < -180 || lng > 180) return null;
      
      return { lat, lng };
    } catch {
      return null;
    }
  }
}