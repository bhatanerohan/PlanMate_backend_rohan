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

// Helper wrapper to calculate distance helper props for VenueGroupItem
const VenueGroupItemWrapper = ({
  venue,
  index,
  onMarkerSelect,
  venuesList,
  isListGroup = false
}: {
  venue: Venue;
  index: number;
  onMarkerSelect: (id: string, idx: number) => void;
  venuesList: Venue[];
  isListGroup?: boolean;
}) => {
  const nextVenue = venuesList[index + 1];
  const distanceToNext = nextVenue?.location && venue.location
    ? formatDistanceKm(calculateDistanceKm(
      venue.location.lat,
      venue.location.lng,
      nextVenue.location.lat,
      nextVenue.location.lng
    ))
    : null;

  return (
    <div className={`mb-4 overflow-hidden rounded-lg bg-[#0f1b28] border border-[#1e293b]`}>
      <VenueGroupItem
        venue={venue}
        stopNumber={index + 1}
        distanceToNext={distanceToNext}
        onShowOnMap={() => onMarkerSelect(venue.placeId, index)}
      />
    </div>
  );
};

// List Group Item Component (Always Expanded)
const VenueGroupItem = ({
  venue,
  stopNumber,
  distanceToNext,
  onShowOnMap
}: {
  venue: Venue;
  stopNumber: number;
  distanceToNext: string | null;
  onShowOnMap: () => void;
}) => {
  return (
    <div className="venue-item border-none">
      {/* Header Info */}
      <div className="venue-header">
        <div className="venue-rank">{stopNumber}</div>

        <div className="venue-name-row">
          <span className="venue-name">{venue.name}</span>

          <div className="venue-meta-slim">
            {venue.rating && (
              <span className="flex items-center gap-1">
                <span className="text-yellow-500">⭐</span>
                {venue.rating}
              </span>
            )}
            {venue.priceLevel && <span>{venue.priceLevel}</span>}
            {distanceToNext && (
              <span className="text-blue-400">→ {distanceToNext}</span>
            )}
          </div>
        </div>
      </div>

      {/* Details (Always Visible) */}
      <div className="venue-info-expanded pt-0">
        <p className="venue-desc">{venue.description || venue.address}</p>

        {venue.photoUrl && (
          <div className="mb-3 rounded-lg overflow-hidden h-32 w-full relative bg-[#1e293b]">
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

        <div className="venue-actions">
          <button
            className="venue-btn primary"
            onClick={(e) => {
              e.stopPropagation();
              onShowOnMap();
            }}
          >
            🗺️ Show on Map
          </button>
        </div>
      </div>
    </div>
  );
};

// Interleaved Message Renderer
const InterleavedMessageContent = ({
  content,
  venues,
  onMarkerSelect
}: {
  content: string;
  venues: Venue[];
  onMarkerSelect: (id: string, idx: number) => void;
}) => {
  if (!venues || venues.length === 0) {
    return <p className="text-sm whitespace-pre-wrap text-gray-200 leading-relaxed">{renderContentWithBold(content)}</p>;
  }

  const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '');
  const lines = content.split('\n');
  const segments: { text: string[]; relatedVenue?: Venue; venueIndex?: number; }[] = [];

  let currentSegment: string[] = [];
  let currentVenueIndex = -1;
  const placedVenueIndices = new Set<number>();

  lines.forEach((line) => {
    // Basic detection for numbered items: "1. ", "1)", "*1."
    const numberMatch = line.match(/^(\**\d+)[\.\)]\s+/);

    if (numberMatch && venues.length > 0) {
      if (currentSegment.length > 0) {
        segments.push({
          text: currentSegment,
          relatedVenue: currentVenueIndex >= 0 ? venues[currentVenueIndex] : undefined,
          venueIndex: currentVenueIndex
        });
      }

      currentSegment = [line];
      const cleanLine = normalize(line);
      let matchIdx = -1;

      // 1. Exact name match
      matchIdx = venues.findIndex((v, idx) => {
        return !placedVenueIndices.has(idx) && cleanLine.includes(normalize(v.name));
      });

      // 2. Sequential Fallback
      if (matchIdx === -1) {
        const num = parseInt(numberMatch[1].replace(/\*/g, ''));
        if (!isNaN(num) && num > 0 && num <= venues.length) {
          const potentialIdx = num - 1;
          if (!placedVenueIndices.has(potentialIdx)) {
            matchIdx = potentialIdx;
          }
        }
      }

      if (matchIdx !== -1) {
        currentVenueIndex = matchIdx;
        placedVenueIndices.add(matchIdx);
      } else {
        currentVenueIndex = -1;
      }

    } else {
      currentSegment.push(line);
    }
  });

  if (currentSegment.length > 0) {
    segments.push({
      text: currentSegment,
      relatedVenue: currentVenueIndex >= 0 ? venues[currentVenueIndex] : undefined,
      venueIndex: currentVenueIndex
    });
  }

  const remainingVenues = venues.filter((_, idx) => !placedVenueIndices.has(idx));

  return (
    <div className="space-y-4">
      {segments.map((seg, i) => (
        <div key={i}>
          <p className="text-sm whitespace-pre-wrap text-gray-200 leading-relaxed mb-3">
            {renderContentWithBold(seg.text.join('\n'))}
          </p>
          {seg.relatedVenue && (
            <div className="my-2 pl-0">
              <VenueGroupItemWrapper
                venue={seg.relatedVenue}
                index={seg.venueIndex || 0}
                onMarkerSelect={onMarkerSelect}
                venuesList={venues}
              />
            </div>
          )}
        </div>
      ))}

      {remainingVenues.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 mb-2">More options:</p>
          <div className="flex flex-col gap-0 border border-[#1e293b] rounded-xl overflow-hidden bg-[#0f1b28]">
            {remainingVenues.map((v) => {
              const originalIdx = venues.indexOf(v);
              return (
                <VenueGroupItem
                  key={v.placeId}
                  venue={v}
                  stopNumber={originalIdx + 1}
                  distanceToNext={null}
                  onShowOnMap={() => onMarkerSelect(v.placeId, originalIdx)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const MessageBubble = ({ message, onMarkerSelect, currentItinerary }: MessageBubbleProps) => {
  const isUser = message.type === 'user';

  return (
    <div className={`flex w-full mb-4 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>


      <div className={isUser ? "max-w-[80%]" : "flex-1 min-w-0"}>
        <div className={`rounded-lg p-4 border ${isUser ? 'bg-[#1e40af] border-blue-700 text-white' : 'bg-[#0f1b28] border-[#10222b]'}`}>

          {isUser ? (
            <p className="text-sm whitespace-pre-wrap text-gray-200 leading-relaxed">{message.content}</p>
          ) : (
            <InterleavedMessageContent
              content={message.content}
              venues={message.data?.venues || []}
              onMarkerSelect={(placeId, idx) => {
                const venuesList = currentItinerary?.venues || [];
                const hasItinerary = venuesList.length > 0;
                const isRouteMode = currentItinerary?.mode === 'route';

                if (hasItinerary && isRouteMode) {
                  if (placeId === 'user-location') {
                    onMarkerSelect('user-location');
                    return;
                  }

                  const idxInItin = venuesList.findIndex((v: Venue) => v.placeId === placeId);
                  if (idxInItin !== -1) {
                    onMarkerSelect(`primary-${idxInItin}`);
                    return;
                  }
                  onMarkerSelect(`venue-${idx}`);
                } else {
                  onMarkerSelect(`venue-${idx}`);
                }
              }}
            />
          )}

        </div>

        {message.data?.events && message.data.events.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-400 ml-1">Related Events:</p>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {message.data.events.map((event, idx) => (
                <EventCard key={idx} event={event} onShowOnMap={() => onMarkerSelect(`event-${idx}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Venue List Group Container (This component is no longer used directly, its logic is integrated into InterleavedMessageContent)
// const VenueList = ({
//   venues,
//   onMarkerSelect
// }: {
//   venues: Venue[];
//   onMarkerSelect: (id: string, idx: number) => void;
// }) => {
//   return (
//     <div className="venue-accordion mt-3">
//       {venues.map((venue, idx) => {
//         const nextVenue = venues[idx + 1];
//         const distanceToNext = nextVenue?.location && venue.location
//           ? formatDistanceKm(calculateDistanceKm(
//             venue.location.lat,
//             venue.location.lng,
//             nextVenue.location.lat,
//             nextVenue.location.lng
//           ))
//           : null;

//         return (
//           <VenueGroupItem
//             key={`${venue.placeId}-${idx}`}
//             venue={venue}
//             stopNumber={idx + 1}
//             distanceToNext={distanceToNext}
//             onShowOnMap={() => onMarkerSelect(venue.placeId, idx)}
//           />
//         );
//       })}
//     </div>
//   );
// };

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