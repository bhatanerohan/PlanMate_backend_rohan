// frontend/src/components/MessageList.tsx

import { useEffect, useRef } from 'react';
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

const MessageList = ({ messages, isLoading, onMarkerSelect, currentItinerary }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Local alias to avoid issues with closure capture in JSX handlers
  const _currentItinerary = currentItinerary;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-transparent" style={{ WebkitOverflowScrolling: 'touch' }}>
      {currentItinerary && currentItinerary.venues.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              📍 Current Itinerary
              <span className="text-xs font-normal text-blue-600">
                ({currentItinerary.venues.length} stops)
              </span>
            </h3>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              {currentItinerary.mode === 'route' ? '🗺️ Route' : '🔍 Discovery'}
            </span>
          </div>
          
          <div className="space-y-2">
            {currentItinerary.venues.map((venue, idx) => (
              <div 
                key={idx}
                className="bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-blue-100"
                onClick={() => {
                  // If we have a current itinerary, map to primary marker ids
                  if (_currentItinerary && _currentItinerary.venues && _currentItinerary.venues.length > 0) {
                    const itinVenue = _currentItinerary.venues[idx];
                    if (itinVenue && itinVenue.placeId === 'user-location') {
                      onMarkerSelect('user-location');
                    } else {
                      // primary markers are named `primary-{index}` where index matches itinerary position
                      onMarkerSelect(`primary-${idx}`);
                    }
                  } else {
                    onMarkerSelect(`venue-${idx}`);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {venue.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {venue.address}
                    </p>
                    {/* Distance to next stop (if available) */}
                    {idx < currentItinerary.venues.length - 1 && currentItinerary.venues[idx + 1]?.location && venue.location && (
                      <p className="text-xs text-gray-400 mt-1">{
                        `➡️ ${formatDistanceKm(calculateDistanceKm(
                          venue.location.lat,
                          venue.location.lng,
                          currentItinerary.venues[idx + 1].location.lat,
                          currentItinerary.venues[idx + 1].location.lng
                        ))} to next stop`
                      }</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-xs text-blue-700 italic">
              💡 Try: "add a venue", "remove stop 2", "replace X with Y"
            </p>
          </div>
        </div>
      )}

      {messages.map((message) => (
        <MessageBubble 
          key={message.id} 
          message={message} 
          onMarkerSelect={onMarkerSelect}
          currentItinerary={currentItinerary}
        />
      ))}
      
      {isLoading && (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white">
            🤖
          </div>
          <div className="flex-1 bg-[#081622] rounded-lg p-4 border border-[#0f2a3a]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-sm text-gray-300 ml-2">Thinking...</span>
            </div>
          </div>
        </div>
      )}
      
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
                    if (currentItinerary && currentItinerary.venues && currentItinerary.venues.length > 0) {
                      if (venue.placeId === 'user-location') {
                        onMarkerSelect('user-location');
                        return;
                      }

                      const idxInItin = currentItinerary.venues.findIndex((v: Venue) => v.placeId === venue.placeId);
                      if (idxInItin !== -1) {
                        onMarkerSelect(`primary-${idxInItin}`);
                        return;
                      }
                      // Fallback to venue-<idx> if not found in itinerary
                      onMarkerSelect(`venue-${idx}`);
                    } else {
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
                      <div className="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-[10px] px-1 rounded">
                        {formatDuration(video.duration)}
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 line-clamp-2 leading-tight">
                      {video.title}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}
          {/* Distance to next stop when provided */}
          {nextVenue && nextVenue.location && venue.location && (
            <div className="mt-3 text-xs text-gray-400">{
              `➡️ ${formatDistanceKm(calculateDistanceKm(
                venue.location.lat,
                venue.location.lng,
                nextVenue.location.lat,
                nextVenue.location.lng
              ))} to next stop`
            }</div>
          )}
        </div>
        
        <button
          onClick={onShowOnMap}
          className="ml-2 px-3 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors flex-shrink-0"
        >
          Map
        </button>
      </div>
    </div>
  </div>
);

const formatDuration = (isoDuration: string): string => {
  const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0s';
  
  const minutes = parseInt(match[1] || '0', 10);
  const seconds = parseInt(match[2] || '0', 10);
  
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
};

const EventCard = ({ event, onShowOnMap }: { event: Event; onShowOnMap: () => void }) => {
  const hasMultipleShowtimes = (event as any).showtimeCount > 1;
  
  return (
    <div className="bg-[#071620] border border-[#0f2a3a] rounded-lg p-3 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-gray-100">
            {event.name}
            {hasMultipleShowtimes && (
              <span className="ml-2 text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full">
                {(event as any).showtimeCount} shows
              </span>
            )}
          </h4>
          <p className="text-xs text-gray-400 mt-1">{event.venue.name}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-gray-600">📅 {event.date}</span>
            {event.time && event.time !== 'Multiple showtimes' && (
              <span className="text-xs text-gray-600">🕐 {event.time}</span>
            )}
            {event.priceRange && (
              <span className="text-xs text-gray-600">💰 {event.priceRange}</span>
            )}
          </div>
        </div>
        <button
          onClick={onShowOnMap}
          className="ml-2 px-3 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors"
        >
          Map
        </button>
      </div>
    </div>
  );
};

export default MessageList;