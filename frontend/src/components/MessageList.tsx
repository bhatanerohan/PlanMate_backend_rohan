// frontend/src/components/MessageList.tsx

import { useEffect, useRef, useState } from 'react';
import type { Message, Venue, Event } from '../types';

// Render inline **bold** markers as <strong>
function renderContentWithBold(text: string) {
  if (!text) return null;
  // Split on **bold** groups (including multiline)
  const parts = text.split(/(\*\*(?:[\s\S]*?)\*\*)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const match = part.match(/^\*\*(?:[\s\S]*?)\*\*$/);
    if (match) {
      const inner = part.slice(2, -2);
      return <strong key={i} className="font-bold">{inner}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Helper: calculate haversine distance (km)
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface CurrentItinerary {
  venues: Venue[];
  originalPrompt: string;
  mode: 'route' | 'discovery';
  timestamp: number;
  userLocationIndex?: number;
  hasUserLocation?: boolean;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onMarkerSelect: (markerId: string) => void;
  currentItinerary?: CurrentItinerary | null;
}

// Dynamic loading component that cycles through messages
const DynamicLoadingIndicator = () => {
  const [currentStage, setCurrentStage] = useState(0);
  
  const stages = [
    { text: 'Thinking...', icon: '🤔', duration: 6000 },
    { text: 'Searching for best spots...', icon: '🔍', duration: 6000 },
    { text: 'Fetching info...', icon: '📡', duration: 6000 },
    { text: 'Summarizing...', icon: '📝', duration: null } // null means it stays until done
  ];

  useEffect(() => {
    if (currentStage >= stages.length - 1) {
      // Stay on the last stage
      return;
    }

    const currentDuration = stages[currentStage].duration;
    if (currentDuration === null) {
      return; // Don't advance from the last stage
    }

    const timer = setTimeout(() => {
      setCurrentStage(prev => Math.min(prev + 1, stages.length - 1));
    }, currentDuration);

    return () => clearTimeout(timer);
  }, [currentStage]);

  const stage = stages[currentStage];

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white">
        🧭
      </div>
      <div className="flex-1 bg-[#081622] rounded-lg p-4 border border-[#0f2a3a]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-sm text-gray-300 ml-2 flex items-center gap-2">
            <span className="text-lg">{stage.icon}</span>
            {stage.text}
          </span>
        </div>
      </div>
    </div>
  );
};

const MessageList = ({ messages, isLoading, onMarkerSelect, currentItinerary }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Local alias to avoid issues with closure capture in JSX handlers
  // const _currentItinerary = currentItinerary;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-transparent" style={{ WebkitOverflowScrolling: 'touch' }}>
      {messages.map((message) => (
        <MessageBubble 
          key={message.id} 
          message={message} 
          onMarkerSelect={onMarkerSelect}
          currentItinerary={currentItinerary}
        />
      ))}
      
      {isLoading && <DynamicLoadingIndicator />}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

interface MessageBubbleProps {
  message: Message;
  onMarkerSelect: (markerId: string) => void;
  currentItinerary?: CurrentItinerary | null;
}

const MessageBubble = ({ message, onMarkerSelect, currentItinerary }: MessageBubbleProps) => {
  if (message.type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary-500 text-white rounded-lg p-4">
          <p className="text-sm">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="flex justify-center">
        <div className="bg-[#0f1b28] text-gray-300 rounded-lg px-4 py-2 text-sm border border-[#1a2b36]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white flex-shrink-0">
        🤖
      </div>
      <div className="flex-1">
        <div className="bg-[#0f1b28] rounded-lg p-4 border border-[#10222b]">
          <p className="text-sm whitespace-pre-wrap text-gray-200 leading-relaxed">{renderContentWithBold(message.content)}</p>
        </div>
        
        {message.data?.venues && message.data.venues.length > 0 && (() => {
          const venues = message.data?.venues || [];
          return (
            <div className="mt-3 space-y-2">
              {venues.map((venue: Venue, idx: number) => (
                <VenueCard 
                  key={idx} 
                  venue={venue} 
                  nextVenue={venues[idx + 1]}
                  onShowOnMap={() => {
                    const venuesList = currentItinerary?.venues || [];
                    const hasItinerary = venuesList.length > 0;
                    const isRouteMode = currentItinerary?.mode === 'route';

                    // Only map to primary-<n> markers when we have a route-mode itinerary
                    if (hasItinerary && isRouteMode) {
                      if (venue.placeId === 'user-location') {
                        onMarkerSelect('user-location');
                        return;
                      }

                      const idxInItin = venuesList.findIndex((v: Venue) => v.placeId === venue.placeId);
                      if (idxInItin !== -1) {
                        onMarkerSelect(`primary-${idxInItin}`);
                        return;
                      }
                      // Fallback to venue-<idx> if not found in itinerary
                      onMarkerSelect(`venue-${idx}`);
                    } else {
                      // In discovery mode or when there's no route-style itinerary, use venue-<idx>
                      onMarkerSelect(`venue-${idx}`);
                    }
                  }}
                />
              ))}
              {venues.length > 5 && (
                <div className="text-xs text-gray-400 text-center py-2">
                  Showing all {venues.length} venues
                </div>
              )}
            </div>
          );
        })()}

        {message.data?.events && message.data.events.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.data.events.map((event: Event, idx: number) => (
              <EventCard 
                key={idx} 
                event={event} 
                onShowOnMap={() => onMarkerSelect(`event-${idx}`)}
              />
            ))}
            {message.data.events.length > 5 && (
              <div className="text-xs text-gray-400 text-center py-2">
                Showing all {message.data.events.length} events
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const VenueCard = ({ venue, nextVenue, onShowOnMap }: { venue: Venue; nextVenue?: Venue; onShowOnMap: () => void }) => (
  <div className="bg-[#071620] border border-[#0f2a3a] rounded-lg overflow-hidden hover:shadow-md transition-shadow">
    {venue.photoUrl && (
      <div className="w-full h-32 sm:h-40 overflow-hidden">
        <img 
          src={venue.photoUrl} 
          alt={venue.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    )}
    
    <div className="p-3">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          <h4 className="font-bold text-sm text-gray-100">{venue.name}</h4>
          <p className="text-xs text-gray-400 mt-1">{venue.address}</p>
          
          {venue.description && (
            <p className="text-xs text-gray-300 mt-2 line-clamp-2">
              {venue.description}
            </p>
          )}
          
          <div className="flex items-center gap-3 mt-2">
            {venue.rating && (
              <span className="text-xs text-yellow-400">
                ⭐ {venue.rating}
              </span>
            )}
            {venue.priceLevel && (
              <span className="text-xs text-gray-500">{venue.priceLevel}</span>
            )}
          </div>

          {venue.videos && venue.videos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-2">🎥 Videos ({venue.videos.length})</p>
              <div className="flex gap-2 overflow-x-auto">
                {venue.videos.map((video) => (
                  <a
                    key={video.videoId}
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-24 sm:w-28 group"
                    title={video.title}
                  >
                    <div className="relative rounded overflow-hidden">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-16 sm:h-18 object-cover group-hover:opacity-80 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-600 rounded-full p-1.5 group-hover:scale-110 transition-transform">
                          <svg 
                            className="w-4 h-4 text-white" 
                            fill="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {video.title}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {nextVenue && nextVenue.location && venue.location && (
            <p className="text-xs text-gray-500 mt-2">
              ➡️ {formatDistanceKm(calculateDistanceKm(
                venue.location.lat,
                venue.location.lng,
                nextVenue.location.lat,
                nextVenue.location.lng
              ))} to next stop
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onShowOnMap}
        className="mt-2 w-full px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-xs font-medium transition-colors"
      >
        Show on Map
      </button>
    </div>
  </div>
);

const EventCard = ({ event, onShowOnMap }: { event: Event; onShowOnMap: () => void }) => (
  <div className="bg-[#071620] border border-[#0f2a3a] rounded-lg p-3 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start gap-2">
      <div className="flex-1">
        <h4 className="font-bold text-sm text-gray-100">{event.name}</h4>
        <p className="text-xs text-gray-400 mt-1">{event.address}</p>
        
        {event.description && (
          <p className="text-xs text-gray-300 mt-2 line-clamp-2">
            {event.description}
          </p>
        )}
        
        {event.dateTime && (
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span>📅 {new Date(event.dateTime).toLocaleDateString()}</span>
            <span>🕒 {new Date(event.dateTime).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>

    <button
      onClick={onShowOnMap}
      className="mt-2 w-full px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-xs font-medium transition-colors"
    >
      Show on Map
    </button>
  </div>
);

export default MessageList;