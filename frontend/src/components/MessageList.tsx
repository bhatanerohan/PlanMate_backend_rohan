// frontend/src/components/MessageList.tsx

import { useEffect, useRef } from 'react';
import type { Message, Venue, Event } from '../types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onMarkerSelect: (markerId: string) => void;
}

const MessageList = ({ messages, isLoading, onMarkerSelect }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
}

const MessageBubble = ({ message, onMarkerSelect }: MessageBubbleProps) => {
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
          <p className="text-sm whitespace-pre-wrap text-gray-200">{message.content}</p>
        </div>
        
        {message.data?.venues && message.data.venues.length > 0 && (
  <div className="mt-3 space-y-2">
    {message.data.venues.map((venue: Venue, idx: number) => (
      <VenueCard 
        key={idx} 
        venue={venue} 
        onShowOnMap={() => onMarkerSelect(`venue-${idx}`)}
      />
    ))}
    {message.data.venues.length > 5 && (
      <div className="text-xs text-gray-400 text-center py-2">
        Showing all {message.data.venues.length} venues
      </div>
    )}
  </div>
)}

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

const VenueCard = ({ venue, onShowOnMap }: { venue: Venue; onShowOnMap: () => void }) => (
  <div className="bg-[#071620] border border-[#0f2a3a] rounded-lg p-3 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <h4 className="font-semibold text-sm text-gray-100">{venue.name}</h4>
        <p className="text-xs text-gray-400 mt-1">{venue.address}</p>
        <div className="flex items-center gap-3 mt-2">
          {venue.rating && (
            <span className="text-xs text-gray-600">
              ⭐ {venue.rating}
            </span>
          )}
          {venue.priceLevel && (
            <span className="text-xs text-gray-600">{venue.priceLevel}</span>
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