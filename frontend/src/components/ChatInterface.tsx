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
 * Smart venue filtering for route queries
 * Extracts venue names mentioned in agent's final result and filters to show only those
 */
/**
 * Smart venue filtering for route queries
 * Extracts venue names mentioned in agent's final result and filters to show only those
 */
const filterSelectedVenues = (
  allVenues: Venue[], 
  agentResult: string,
  mode?: 'discovery' | 'route'
): Venue[] => {
  // If mode is explicitly discovery, return all venues
  if (mode === 'discovery') {
    return allVenues;
  }
  
  // If result contains route indicators, filter intelligently
  const isRouteQuery = mode === 'route' || /route|plan.*via|from.*to/i.test(agentResult);
  
  if (!isRouteQuery) {
    // Not a route query - return all venues (discovery mode)
    return allVenues;
  }

  console.log('🎯 Route mode detected, filtering to selected venues...');
  console.log(`   Total venues available: ${allVenues.length}`);

  // Extract venue names that appear in the result
  const selectedVenues = allVenues.filter(venue => {
    // Check if venue name appears in the result
    // Use case-insensitive search
    const venueName = venue.name.toLowerCase();
    const resultLower = agentResult.toLowerCase();
    
    // Check if placeId appears in result (most reliable)
    if (agentResult.includes(venue.placeId)) {
      console.log(`   ✅ Found by placeId: ${venue.name} (${venue.placeId})`);
      return true;
    }
    
    // Check full name
    if (resultLower.includes(venueName)) {
      console.log(`   ✅ Found by name: ${venue.name}`);
      return true;
    }
    
    // Check for common abbreviations
    const abbreviations: Record<string, string[]> = {
      'massachusetts institute of technology': ['mit', 'mit main', 'massachusetts institute'],
      'harvard university': ['harvard', 'harvard main'],
      'museum of fine arts': ['mfa', 'museum of fine arts'],
    };
    
    const venueNameLower = venue.name.toLowerCase();
    for (const [fullName, abbrevs] of Object.entries(abbreviations)) {
      if (venueNameLower.includes(fullName)) {
        const found = abbrevs.some(abbrev => resultLower.includes(abbrev));
        if (found) {
          console.log(`   ✅ Found by abbreviation: ${venue.name}`);
          return true;
        }
      }
    }
    
    return false;
  });

  console.log(`   Filtered to ${selectedVenues.length} selected venues`);

  // If filtering resulted in venues, use those; otherwise fall back to all
  // This prevents showing an empty map if parsing failed
  if (selectedVenues.length > 0) {
    return selectedVenues;
  }

  console.log('⚠️  No venues matched filter, showing all venues as fallback');
  return allVenues;
};
const ChatInterface = ({ messages, onNewPlan, onMarkerSelect, userLocation}:  ChatInterfaceProps) => {
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
  
      // Smart filtering: For route queries, show only venues mentioned in agent's result
      const filteredVenues = filterSelectedVenues(data.venues, data.result || '', data.mode);
      
      // Create markers only from filtered venues
      let markers: MapMarker[] = [
        ...filteredVenues.map((venue: Venue, idx: number) => ({
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
  
      const isRouteQuery = (data.mode === 'route') || /route|plan.*via|from.*to/i.test(data.result || '');
      
      // Check if user location is mentioned ANYWHERE in the prompt
      const originalPrompt = variables.prompt.toLowerCase();
      const mentionsUserLocation = /(my location|here|me|current location|where i am)/i.test(originalPrompt);
      
      if (isRouteQuery && mentionsUserLocation && userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
        console.log('🎯 User mentioned their location in route - determining position...');
        
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
  
        // Determine where to insert user location marker
        // Check common patterns in the prompt
        const startsWithUserLocation = /^(route |plan )?(from )?(my location|here|me|current location)/i.test(originalPrompt);
        const endsWithUserLocation = /(to |via )?(my location|here|me|current location)\s*$/i.test(originalPrompt);
        
        // Parse the prompt to find position
        // Split by "to", "via", "from" to understand waypoint order
        const words = originalPrompt.split(/\s+(?:to|via|from)\s+/i);
        const userLocationIndex = words.findIndex(segment => 
          /(my location|here|me|current location)/i.test(segment)
        );
  
        if (startsWithUserLocation || userLocationIndex === 0) {
          // User location is at the START
          console.log('  ✅ Position: START of route');
          markers = [userMarker, ...markers];
        } else if (endsWithUserLocation || userLocationIndex === words.length - 1) {
          // User location is at the END
          console.log('  ✅ Position: END of route');
          markers = [...markers, userMarker];
        } else if (userLocationIndex > 0) {
          // User location is in the MIDDLE
          console.log(`  ✅ Position: MIDDLE of route (index ${userLocationIndex})`);
          markers.splice(userLocationIndex, 0, userMarker);
        } else {
          // Fallback: if we can't determine position, put it at start
          console.log('  ⚠️  Position unclear, defaulting to START');
          markers = [userMarker, ...markers];
        }
      } else if (isRouteQuery && mentionsUserLocation && (!userLocation || !Number.isFinite(userLocation.lat))) {
        console.log('⚠️  User mentioned their location but location data is unavailable');
      } else if (isRouteQuery) {
        console.log('ℹ️  Route query with explicit start/end points - NOT adding user location');
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
    // If user asked for "my location" but we don't have it, try to get geolocation first
    const wantsMyLocation = /\bmy location\b|\bfrom my location\b|\bfrom me\b/i.test(prompt);

    const sendRequest = (loc?: Location | undefined) => {
      const locationToSend = (loc || userLocation) && Number.isFinite((loc || userLocation)!.lat) && Number.isFinite((loc || userLocation)!.lng)
        ? (loc || userLocation)
        : undefined;
      planMutation.mutate({ prompt, userLocation: locationToSend });
    };

    if (wantsMyLocation && (!userLocation || !Number.isFinite(userLocation.lat) || !Number.isFinite(userLocation.lng))) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const loc: Location = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Current location' };
          // Don't update app-level userLocation here; just send it with the request so markers/routes work immediately
          sendRequest(loc);
        }, (err) => {
          console.warn('Geolocation failed, proceeding without user location', err);
          sendRequest(undefined);
        });
        return; // wait for async geolocation callback
      }
    }

    // Default: send immediately using existing userLocation if available
    sendRequest();
  };

  const examplePrompts = [
    "Find coffee shops near me",
    "Plan romantic dinner tonight in Boston",
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