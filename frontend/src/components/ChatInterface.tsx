// frontend/src/components/ChatInterface.tsx

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { planApi } from '../services/api';
import MessageList from './MessageList';
import type { Message, MapMarker, Venue, Event, Route } from '../types';  // ⭐ Added Route

interface ChatInterfaceProps {
  messages: Message[];
  onNewPlan: (message: Message, markers: MapMarker[], routes: Route[]) => void;  // ⭐ Added routes
  onMarkerSelect: (markerId: string) => void;
}

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
          routes: data.routes  // ⭐ NEW
        },
      };

      const markers: MapMarker[] = [
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

      onNewPlan(agentMessage, markers, data.routes);  // ⭐ Pass routes
    },
    onError: (error: any) => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'system',
        content: `Error: ${error.response?.data?.error || error.message || 'Something went wrong'}`,
        timestamp: Date.now(),
      };
      onNewPlan(errorMessage, [], []);  // ⭐ Empty routes on error
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
    
    onNewPlan(userMessage, [], []);  // ⭐ Empty routes for user message
    
    const prompt = input;
    setInput('');
    planMutation.mutate(prompt);
  };

  const examplePrompts = [
    "Find coffee shops near me",
    "Plan romantic dinner tonight in Boston",
    "Weekend trip to NYC",
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