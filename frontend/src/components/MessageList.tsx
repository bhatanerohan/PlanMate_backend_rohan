// frontend/src/components/MessageList.tsx

import { useEffect, useRef, useState } from 'react';
import type { Message, Venue, Event } from '../types';

// Render inline **bold** markers as <strong> or clickable buttons if they match a venue
function renderContentWithBold(
  text: string,
  venues?: Venue[],
  onMarkerSelect?: (placeId: string, idx: number) => void
) {
  if (!text) return null;
  // Split on **bold** groups (including multiline)
  const parts = text.split(/(\*\*(?:[\s\S]*?)\*\*)/g);

  const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();

  return parts.map((part, i) => {
    if (!part) return null;
    const match = part.match(/^\*\*(?:[\s\S]*?)\*\*$/);
    if (match) {
      const inner = part.slice(2, -2);

      // 🆕 Check if this bold text matches a known venue
      if (venues && onMarkerSelect && venues.length > 0) {
        const cleanInner = normalize(inner);
        // Find matching venue (exact name match preferred)
        const matchedIdx = venues.findIndex(v => normalize(v.name) === cleanInner);

        if (matchedIdx !== -1) {
          const venue = venues[matchedIdx];
          return (
            <button
              key={i}
              onClick={() => onMarkerSelect(venue.placeId, matchedIdx)}
              className="font-bold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer inline transition-colors"
              title="Show on map"
            >
              {inner}
            </button>
          );
        }
      }

      return <strong key={i} className="font-bold">{inner}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
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

// Simplified renderer that only shows text with clickable links (cards removed per user request)
const InterleavedMessageContent = ({
  content,
  venues,
  onMarkerSelect
}: {
  content: string;
  venues: Venue[];
  onMarkerSelect: (id: string, idx: number) => void;
}) => {
  return (
    <div className="text-sm whitespace-pre-wrap text-gray-200 leading-relaxed">
      {renderContentWithBold(content, venues, onMarkerSelect)}
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
                const idxInItin = venuesList.findIndex((v: Venue) => v.placeId === placeId);
                if (idxInItin !== -1) {
                  onMarkerSelect(`primary-${idxInItin}`);
                  return;
                }
                onMarkerSelect(`primary-${idx}`);
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