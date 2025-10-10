// frontend/src/components/ChatInterface.tsx

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { planApi } from '../services/api';
import MessageList from './MessageList';
import type { Message, MapMarker, Venue, Event, Route } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onNewPlan: (message: Message, markers: MapMarker[], routes?: Route[], isRouteQuery?: boolean) => void;
  onMarkerSelect: (markerId: string) => void;
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
const ChatInterface = ({ messages, onNewPlan, onMarkerSelect }: ChatInterfaceProps) => {
  const [input, setInput] = useState('');

  const planMutation = useMutation({
    mutationFn: (prompt: string) => planApi.createPlan(prompt),
    onSuccess: (data) => {
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
      const markers: MapMarker[] = [
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

      const routes: Route[] = [];
      const isRouteQuery = /route|plan.*via|from.*to/i.test(data.result || '');

      onNewPlan(agentMessage, markers, routes, isRouteQuery);
    },
    onError: (error: any) => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'system',
        content: `Error: ${error.response?.data?.error || error.message || 'Something went wrong'}`,
        timestamp: Date.now(),
      };
      onNewPlan(errorMessage, [], []);
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
    planMutation.mutate(prompt);
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
      <div className="p-4 border-b border-gray-200 bg-primary-500 text-white">
        <h1 className="text-2xl font-bold">🗺️ PlanMate</h1>
        <p className="text-sm text-primary-50">Your AI Travel Planning Assistant</p>
      </div>

      <MessageList 
        messages={messages}
        isLoading={planMutation.isPending}
        onMarkerSelect={onMarkerSelect}
      />

      <div className="p-4 border-t border-gray-200 bg-white">
        {messages.length === 1 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">Try these examples:</p>
            <div className="flex flex-wrap gap-2">
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
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || planMutation.isPending}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {planMutation.isPending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;