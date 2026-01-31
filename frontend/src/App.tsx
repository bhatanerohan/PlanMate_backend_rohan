// frontend/src/App.tsx

import { useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInterface from './components/ChatInterface';
import MapView from './components/MapView';
import BottomSheet, { type BottomSheetHandle } from './components/BottomSheet';
import type { Message, MapMarker, Route, Location, Venue } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface CurrentItinerary {
  venues: Venue[];
  originalPrompt: string;
  mode: 'route' | 'discovery';
  timestamp: number;
  userLocationIndex?: number;
  hasUserLocation?: boolean;
  alternativesMap?: Record<string, Venue[]>;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      type: 'system',
      content: 'Welcome to PlanMate! 🗺️ Tell me what you\'d like to do and I\'ll help you plan it.',
      timestamp: Date.now(),
    },
  ]);

  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [isRouteMode, setIsRouteMode] = useState(false);
  const [currentItinerary, setCurrentItinerary] = useState<CurrentItinerary | null>(null);

  const [chatWidthPx, setChatWidthPx] = useState(600);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'map'>('chat');
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const chatInterfaceRef = useRef<any>(null);

  const handleNewPlan = (
    message: Message,
    newMarkers: MapMarker[],
    newRoutes?: Route[],
    isRouteQuery?: boolean,
    isModification?: boolean
  ) => {
    // If it's a modification, update the last agent message instead of adding a new one
    if (isModification && message.type === 'agent') {
      setMessages((prev) => {
        // Find the last agent message index
        let lastAgentIndex = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === 'agent') {
            lastAgentIndex = i;
            break;
          }
        }

        if (lastAgentIndex !== -1) {
          const newMessages = [...prev];
          newMessages[lastAgentIndex] = {
            ...newMessages[lastAgentIndex],
            content: message.content,
            data: message.data,
            timestamp: Date.now()
          };
          return newMessages;
        }
        return [...prev, message];
      });
    } else {
      setMessages((prev) => [...prev, message]);
    }

    if (newMarkers.length > 0) {
      setMarkers(newMarkers);
    } else if (message.type === 'agent' || message.type === 'system') {
      // Only clear markers if this is a NEW plan, not a modification? 
      // User said "remove... from output". If we remove a stop, newMarkers will be the updated list.
      // So we should update markers in both cases.
      setMarkers(newMarkers.length > 0 ? newMarkers : []);
    }

    setIsRouteMode(isRouteQuery || false);

    if (newRoutes && newRoutes.length > 0) {
      setRoutes(newRoutes);
    } else if (message.type === 'agent' || message.type === 'system') {
      setRoutes([]);
    }

    if (message.type === 'agent' && message.data?.venues && message.data.venues.length > 0) {
      if (isModification) {
        // ... (existing modification specific logic for CurrentItinerary)
        const userLocationStillPresent = message.data.venues.some((v: Venue) => v.placeId === 'user-location');
        const newUserLocationIndex = userLocationStillPresent
          ? message.data.venues.findIndex((v: Venue) => v.placeId === 'user-location')
          : undefined;

        console.log('🔧 Modification: Updating currentItinerary with alternativesMap:',
          Object.keys(message.data.alternativesMap || {}).length, 'alternatives');

        setCurrentItinerary({
          venues: message.data.venues,
          originalPrompt: currentItinerary?.originalPrompt || message.content,
          mode: 'route',
          timestamp: Date.now(),
          userLocationIndex: newUserLocationIndex,
          hasUserLocation: userLocationStillPresent,
          alternativesMap: message.data.alternativesMap || currentItinerary?.alternativesMap || {}
        });
      }
      else {
        // ... (existing new plan logic)
        const isItinerary = isRouteQuery ||
          message.content.toLowerCase().includes('crawl') ||
          message.content.toLowerCase().includes('tour') ||
          message.content.toLowerCase().includes('itinerary') ||
          message.content.toLowerCase().includes('plan');

        if (isItinerary) {
          const userLocationMarkerIndex = newMarkers.findIndex(m => m.id === 'user-location');

          console.log('📋 Initial itinerary: Saving alternativesMap with',
            Object.keys(message.data.alternativesMap || {}).length, 'alternatives');

          setCurrentItinerary({
            venues: message.data.venues,
            originalPrompt: message.content,
            mode: isRouteQuery ? 'route' : 'discovery',
            timestamp: Date.now(),
            userLocationIndex: userLocationMarkerIndex !== -1 ? userLocationMarkerIndex : undefined,
            hasUserLocation: userLocationMarkerIndex !== -1,
            alternativesMap: message.data.alternativesMap || {}
          });
        } else {
          setCurrentItinerary(null);
        }
      }
    }
  };

  const handleQuickAction = (action: string) => {
    if (chatInterfaceRef.current?.submitCommand) {
      chatInterfaceRef.current.submitCommand(action);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMarkerSelect = (markerId: string) => {
    setSelectedMarkerId(markerId);
    // On mobile, collapse the bottom sheet to reveal the map
    if (isMobile && bottomSheetRef.current) {
      bottomSheetRef.current.collapse();
    }
  };

  const handleLocationChange = (loc: Location) => {
    setUserLocation(loc);
    console.log('📍 User location updated:', loc);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (isMobile || !isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      const minWidth = 300;
      const maxWidth = containerRect.width - 400;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setChatWidthPx(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging && !isMobile) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);

    return () => clearTimeout(timer);
  }, [chatWidthPx]);

  useEffect(() => {
    if (!isMobile) return;
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
    return () => clearTimeout(timer);
  }, [activeMobilePanel, isMobile]);

  const chatPanelStyle = isMobile ? undefined : { width: `${chatWidthPx}px` };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-gray-100">

        {/* Desktop Layout */}
        {!isMobile && (
          <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
            {/* Chat Panel */}
            <div
              className="flex bg-white flex-col border-r border-gray-300 flex-shrink-0 min-h-0"
              style={chatPanelStyle}
            >
              <ChatInterface
                ref={chatInterfaceRef}
                messages={messages}
                onNewPlan={handleNewPlan}
                onMarkerSelect={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                currentItinerary={currentItinerary}
                onClearItinerary={() => setCurrentItinerary(null)}
              />
            </div>

            {/* Resizable Divider */}
            <div
              className="flex w-1 bg-gray-300 hover:bg-primary-500 cursor-col-resize transition-colors flex-shrink-0 relative group"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-400 group-hover:bg-primary-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
            </div>

            {/* Map Panel */}
            <div className="flex-1 bg-gray-200 min-w-0 min-h-0 overflow-hidden">
              <MapView
                markers={markers}
                routes={routes}
                selectedMarkerId={selectedMarkerId}
                onMarkerClick={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                isRouteMode={isRouteMode}
                currentItinerary={currentItinerary}
                onQuickAction={handleQuickAction}
              />
            </div>
          </div>
        )}

        {/* Mobile Layout - Map fullscreen with sliding BottomSheet */}
        {isMobile && (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {/* Map takes full screen */}
            <div className="absolute inset-0">
              <MapView
                markers={markers}
                routes={routes}
                selectedMarkerId={selectedMarkerId}
                onMarkerClick={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                isRouteMode={isRouteMode}
                currentItinerary={currentItinerary}
                onQuickAction={handleQuickAction}
              />
            </div>

            {/* Chat in sliding BottomSheet */}
            <BottomSheet ref={bottomSheetRef} snapPoints={[20, 50, 85]} defaultSnapIndex={1}>
              <ChatInterface
                ref={chatInterfaceRef}
                messages={messages}
                onNewPlan={handleNewPlan}
                onMarkerSelect={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                currentItinerary={currentItinerary}
                onClearItinerary={() => setCurrentItinerary(null)}
              />
            </BottomSheet>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}

export default App;
