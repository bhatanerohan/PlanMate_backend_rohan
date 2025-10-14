// frontend/src/components/ChatInterface.tsx

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { planApi } from '../services/api';
import MessageList from './MessageList';
import type { Message, MapMarker, Venue, Event, Route, Location } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onNewPlan: (message: Message, markers: MapMarker[], routes?: Route[], isRouteQuery?: boolean) => void;
  onMarkerSelect: (markerId: string) => void;
  userLocation?: Location | null;
  onLocationChange?: (loc: Location) => void;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if user location is already in venues list
 * Uses multiple checks: distance, address similarity, and name matching
 */
function isUserLocationInVenues(
  userLocation: Location, 
  venues: Venue[]
): { isIncluded: boolean; matchedVenue?: Venue } {
  for (const venue of venues) {
    // Check 1: Distance (within 200 meters)
    const distance = calculateDistance(
      venue.location.lat,
      venue.location.lng,
      userLocation.lat,
      userLocation.lng
    );
    
    if (distance < 0.2) {
      console.log(`   ✅ Distance match: "${venue.name}" is ${(distance * 1000).toFixed(0)}m from user location`);
      return { isIncluded: true, matchedVenue: venue };
    }
    
    // Check 2: Coordinate precision match
    const latDiff = Math.abs(venue.location.lat - userLocation.lat);
    const lngDiff = Math.abs(venue.location.lng - userLocation.lng);
    
    if (latDiff < 0.001 && lngDiff < 0.001) {
      console.log(`   ✅ Coordinate precision match: "${venue.name}"`);
      return { isIncluded: true, matchedVenue: venue };
    }
  }
  
  return { isIncluded: false };
}

const ChatInterface = ({ messages, onNewPlan, onMarkerSelect, userLocation}: ChatInterfaceProps) => {
  const [input, setInput] = useState('');

  const planMutation = useMutation({
    mutationFn: (vars: { prompt: string; userLocation?: Location | null }) =>
      planApi.createPlan(vars.prompt, vars.userLocation || undefined),
    onSuccess: (data, variables) => {
      const agentMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: data.result || 'I found some results for you!',
        timestamp: Date.now(),
        data: {
          venues: data.venues,
          events: data.events,
        },
      };

      const isRouteQuery = data.mode === 'route';
      const backendSelectedVenues = data.state?.finishParameters?.selected_venue_ids || [];
      const userLocationIndex = backendSelectedVenues.indexOf('user-location');
      const backendHasUserLocation = userLocationIndex !== -1;

      let markers: MapMarker[] = [];

      // ═══════════════════════════════════════════════════════════════════
      // ROUTE MODE: Use backend's selected_venue_ids for ordering
      // ═══════════════════════════════════════════════════════════════════
      if (isRouteQuery && backendSelectedVenues.length > 0) {
        console.log('🗺️ Route mode: Creating ordered markers from backend selected_venue_ids');
        console.log(`   Backend selected: ${backendSelectedVenues.length} waypoints`);
        console.log(`   Selected venue IDs:`, backendSelectedVenues);
        
        // Create placeId lookup for fast access
        const venuesByPlaceId = new Map<string, Venue>();
        data.venues.forEach((venue: Venue) => {
          venuesByPlaceId.set(venue.placeId, venue);
          console.log(`   📍 Available: ${venue.name} (${venue.placeId})`);
        });

        // Build markers in exact order from backend
        backendSelectedVenues.forEach((placeId, index) => {
          if (placeId === 'user-location') {
            // Skip here, will insert later
            console.log(`   ⏭️  Position ${index}: user-location (will insert later)`);
            return;
          }
          
          // Find venue with this placeId
          const venue = venuesByPlaceId.get(placeId);
          if (venue) {
            markers.push({
              id: `venue-${markers.length}`,
              position: {
                lat: venue.location.lat,
                lng: venue.location.lng,
              },
              title: venue.name,
              type: 'venue' as const,
              data: venue,
            });
            console.log(`   ✅ Position ${index}: ${venue.name} (${placeId.substring(0, 20)}...)`);
          } else {
            console.warn(`   ⚠️  Position ${index}: PlaceId not found in venues array: ${placeId}`);
            console.warn(`   Available placeIds:`, Array.from(venuesByPlaceId.keys()));
          }
        });
        
        console.log(`   Created ${markers.length} ordered markers from ${backendSelectedVenues.length} selected venues`);
        
      } else {
        // ═══════════════════════════════════════════════════════════════════
        // DISCOVERY MODE: Show all venues and events
        // ═══════════════════════════════════════════════════════════════════
        console.log('🔍 Discovery mode: Creating markers from all results');
        
        markers = [
          ...data.venues.map((venue: Venue, idx: number) => ({
            id: `venue-${idx}`,
            position: {
              lat: venue.location.lat,
              lng: venue.location.lng,
            },
            title: venue.name,
            type: 'venue' as const,
            data: venue,
          })),
          ...data.events.map((event: Event, idx: number) => ({
            id: `event-${idx}`,
            position: {
              lat: event.venue.location?.lat || 0,
              lng: event.venue.location?.lng || 0,
            },
            title: event.name,
            type: 'event' as const,
            data: event,
          })),
        ];
        
        console.log(`   Created ${markers.length} markers (${data.venues.length} venues, ${data.events.length} events)`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // INSERT USER LOCATION (if applicable)
      // ═══════════════════════════════════════════════════════════════════
      const originalPrompt = variables.prompt.toLowerCase();
      const mentionsUserLocation = /(my location|here|me|current location|where i am)/i.test(originalPrompt);
      
      // Check if user location already in venues
      let userLocationAlreadyIncluded = false;
      let matchedVenue: Venue | undefined;
      
      if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
        const result = isUserLocationInVenues(userLocation, data.venues);
        userLocationAlreadyIncluded = result.isIncluded;
        matchedVenue = result.matchedVenue;
      }

      console.log('🎯 User location check:', {
        isRouteQuery,
        mentionsUserLocation,
        hasUserLocation: !!userLocation,
        userLocationValid: userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng),
        userLocationAlreadyIncluded,
        backendHasUserLocation,
        userLocationIndex,
        markersBeforeInsertion: markers.length
      });

      if (isRouteQuery && mentionsUserLocation && userLocation && 
          Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng) &&
          !userLocationAlreadyIncluded && backendHasUserLocation && userLocationIndex >= 0) {
        
        console.log(`✅ INSERTING user location at position ${userLocationIndex}`);
        
        const userMarker: MapMarker = {
          id: 'user-location',
          position: { lat: userLocation.lat, lng: userLocation.lng },
          title: userLocation.name || 'Your Location',
          type: 'venue',
          data: {
            name: userLocation.name || 'Your Location',
            address: 'Current location',
            location: { 
              lat: userLocation.lat, 
              lng: userLocation.lng, 
              coordinates: `${userLocation.lat},${userLocation.lng}` 
            },
            placeId: 'user-location'
          } as unknown as Venue
        };

        // Insert at exact position from backend
        markers.splice(userLocationIndex, 0, userMarker);
        console.log(`✅ Markers after insertion (${markers.length} total):`, markers.map(m => m.title));
        
      } else if (userLocationAlreadyIncluded) {
        console.log(`ℹ️  User location already in venues as "${matchedVenue?.name}"`);
      } else if (mentionsUserLocation && !backendHasUserLocation) {
        console.log('⚠️  User mentioned location but backend did not include it');
      } else if (isRouteQuery && !mentionsUserLocation) {
        console.log('ℹ️  Route query with explicit waypoints only (no user location)');
      } else {
        console.log('ℹ️  Discovery mode or no user location needed');
      }
  
      const routes: Route[] = [];
  
      onNewPlan(agentMessage, markers, routes, isRouteQuery);
    },
    onError: (error: any) => {
      let errorMessage = 'Something went wrong. Please try again.';
      
      if (error.response?.data?.error === 'not_relevant') {
        errorMessage = error.response.data.message || 
          "I can only help with location-based queries like finding venues, planning routes, or discovering events.";
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
  
      const errorMessageObj: Message = {
        id: Date.now().toString(),
        type: 'system',
        content: `❌ ${errorMessage}`,
        timestamp: Date.now(),
      };
      onNewPlan(errorMessageObj, [], []);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: Date.now(),
    };
    
    onNewPlan(userMessage, [], []);
    
    const prompt = input;
    setInput('');
    
    const wantsMyLocation = /\bmy location\b|\bfrom my location\b|\bfrom me\b|\bhere\b/i.test(prompt);

    const sendRequest = (loc?: Location | undefined) => {
      const locationToSend = userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)
      ? userLocation
      : undefined;
    
    planMutation.mutate({ prompt, userLocation: locationToSend });
      };

    if (wantsMyLocation && (!userLocation || !Number.isFinite(userLocation.lat) || !Number.isFinite(userLocation.lng))) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const loc: Location = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Current location' };
          sendRequest(loc);
        }, (err) => {
          console.warn('Geolocation failed, proceeding without user location', err);
          sendRequest(undefined);
        });
        return;
      }
    }

    sendRequest();
  };

  const examplePrompts = [
    "Find coffee shops near me",
    "route from my location to starbucks on newbury street to harvard square to fenway park",
    "Plan route from MFA to Harvard via MIT",
    "Find concerts this weekend",
  ];

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 bg-primary-500 text-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">PlanMate</h1>
          <p className="text-xs text-primary-50 hidden sm:block">Your AI Travel Planning Assistant</p>
        </div>
        <div className="text-xs text-primary-50 sm:hidden">🗺️</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-3">
          <MessageList 
            messages={messages}
            isLoading={planMutation.isPending}
            onMarkerSelect={onMarkerSelect}
          />
        </div>

        <div className="p-3 border-t border-gray-200 bg-white sticky bottom-0 z-10 safe-area-bottom">
          {messages.length === 1 && (
            <div className="mb-2">
              <details className="sm:hidden">
                <summary className="text-xs text-gray-500">Try example prompts</summary>
                <div className="flex flex-wrap gap-2 mt-2">
                  {examplePrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleExampleClick(prompt)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </details>

              <div className="hidden sm:flex flex-wrap gap-2">
                {examplePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(prompt)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What would you like to do?"
              disabled={planMutation.isPending}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || planMutation.isPending}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {planMutation.isPending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;