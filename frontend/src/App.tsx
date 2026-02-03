// frontend/src/App.tsx

import { useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInterface from './components/ChatInterface';
import MapView from './components/MapView';
import BottomSheet, { type BottomSheetHandle } from './components/BottomSheet';
import VenueDetailSheet from './components/VenueDetailSheet';
import type { Message, MapMarker, Route, Location, Venue, InstagramReel } from './types';

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
  // Persistent State Initialization
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('planmate_messages');
      return saved ? JSON.parse(saved) : [{
        id: '0',
        type: 'system',
        content: 'Welcome to PlanMate! 🗺️ Tell me what you\'d like to do and I\'ll help you plan it.',
        timestamp: Date.now(),
      }];
    } catch {
      return [{
        id: '0',
        type: 'system',
        content: 'Welcome to PlanMate! 🗺️ Tell me what you\'d like to do and I\'ll help you plan it.',
        timestamp: Date.now(),
      }];
    }
  });

  const [markers, setMarkers] = useState<MapMarker[]>(() => {
    try {
      const saved = localStorage.getItem('planmate_markers');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [routes, setRoutes] = useState<Route[]>(() => {
    try {
      const saved = localStorage.getItem('planmate_routes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<Location | null>(() => {
    try {
      const saved = localStorage.getItem('planmate_user_location');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [isRouteMode, setIsRouteMode] = useState(() => {
    try {
      const saved = localStorage.getItem('planmate_route_mode');
      return saved ? JSON.parse(saved) : false;
    } catch { return false; }
  });

  const [currentItinerary, setCurrentItinerary] = useState<CurrentItinerary | null>(() => {
    try {
      const saved = localStorage.getItem('planmate_itinerary');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [chatWidthPx, setChatWidthPx] = useState(600);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'map'>('chat');
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const chatInterfaceRef = useRef<any>(null);

  // Mobile venue detail sheet state
  const [selectedVenueForSheet, setSelectedVenueForSheet] = useState<{
    venue: Venue;
    isPrimary: boolean;
    stopNumber?: number;
  } | null>(null);

  // Reel player state (lifted to App for proper z-index on mobile)
  const [activeReels, setActiveReels] = useState<InstagramReel[]>([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);

  const handlePlayReel = (reel: InstagramReel, allReels?: InstagramReel[]) => {
    if (allReels && allReels.length > 0) {
      const index = allReels.findIndex(r => r.id === reel.id);
      setActiveReels(allReels);
      setActiveReelIndex(index >= 0 ? index : 0);
    } else {
      setActiveReels([reel]);
      setActiveReelIndex(0);
    }
  };

  const handleCloseReelPlayer = () => {
    setActiveReels([]);
    setActiveReelIndex(0);
  };

  const handlePrevReel = () => {
    setActiveReelIndex(prev => (prev > 0 ? prev - 1 : activeReels.length - 1));
  };

  const handleNextReel = () => {
    setActiveReelIndex(prev => (prev < activeReels.length - 1 ? prev + 1 : 0));
  };

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
      setMessages((prev) => {
        // Remove welcome message (id: '0') when adding first new message
        const filtered = prev.filter(m => m.id !== '0');
        return [...filtered, message];
      });
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

  // State Persistence Effects
  useEffect(() => {
    localStorage.setItem('planmate_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('planmate_markers', JSON.stringify(markers));
  }, [markers]);

  useEffect(() => {
    localStorage.setItem('planmate_routes', JSON.stringify(routes));
  }, [routes]);

  useEffect(() => {
    if (userLocation) {
      localStorage.setItem('planmate_user_location', JSON.stringify(userLocation));
    } else {
      localStorage.removeItem('planmate_user_location');
    }
  }, [userLocation]);

  useEffect(() => {
    localStorage.setItem('planmate_route_mode', JSON.stringify(isRouteMode));
  }, [isRouteMode]);

  useEffect(() => {
    if (currentItinerary) {
      localStorage.setItem('planmate_itinerary', JSON.stringify(currentItinerary));
    } else {
      localStorage.removeItem('planmate_itinerary');
    }
  }, [currentItinerary]);

  const handleResetChat = () => {
    if (window.confirm("Start a new chat? This will clear your current plan.")) {
      const initialMessage = {
        id: '0',
        type: 'system' as const,
        content: 'Welcome to PlanMate! 🗺️ Tell me what you\'d like to do and I\'ll help you plan it.',
        timestamp: Date.now(),
      };
      setMessages([initialMessage]);
      setMarkers([]);
      setRoutes([]);
      setCurrentItinerary(null);
      setSelectedMarkerId(null);
      setIsRouteMode(false);
      // We purposefully do NOT clear userLocation as that's environmental

      // Clear persistence immediately (optional, as effects will run, but good for safety)
      localStorage.setItem('planmate_messages', JSON.stringify([initialMessage]));
      localStorage.setItem('planmate_markers', JSON.stringify([]));
      localStorage.setItem('planmate_routes', JSON.stringify([]));
      localStorage.removeItem('planmate_itinerary');
      localStorage.setItem('planmate_route_mode', 'false');
    }
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
                onNewChat={handleResetChat}
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
                onPlayReel={handlePlayReel}
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
                onPlayReel={handlePlayReel}
                isMobile={true}
                onVenueSelect={(venue, isPrimary, stopNumber) => {
                  setSelectedVenueForSheet({ venue, isPrimary, stopNumber });
                }}
              />
            </div>

            {/* Chat in sliding BottomSheet - hidden when venue sheet is open */}
            {!selectedVenueForSheet && (
              <BottomSheet ref={bottomSheetRef} snapPoints={[20, 50, 100]} defaultSnapIndex={1}>
                <ChatInterface
                  ref={chatInterfaceRef}
                  messages={messages}
                  onNewPlan={handleNewPlan}
                  onMarkerSelect={handleMarkerSelect}
                  userLocation={userLocation}
                  onLocationChange={handleLocationChange}
                  currentItinerary={currentItinerary}
                  onClearItinerary={() => setCurrentItinerary(null)}
                  onNewChat={handleResetChat}
                />
              </BottomSheet>
            )}

            {/* Venue Detail Sheet - shown when a venue is selected on mobile */}
            {selectedVenueForSheet && (
              <VenueDetailSheet
                venue={selectedVenueForSheet.venue}
                isPrimary={selectedVenueForSheet.isPrimary}
                stopNumber={selectedVenueForSheet.stopNumber}
                onClose={() => setSelectedVenueForSheet(null)}
                onPlayReel={handlePlayReel}
                onQuickAction={handleQuickAction}
              />
            )}
          </div>
        )}
      </div>

      {/* Reel Player Overlay - Rendered at App level for proper z-index */}
      {activeReels.length > 0 && activeReels[activeReelIndex] && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          {/* Previous Button */}
          {activeReels.length > 1 && (
            <button
              onClick={handlePrevReel}
              className="absolute left-2 sm:left-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors z-20"
            >
              ◀
            </button>
          )}

          <div className="relative w-full max-w-[350px] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20">
            {/* Video Player */}
            <video
              key={activeReels[activeReelIndex].id}
              src={activeReels[activeReelIndex].videoUrl}
              poster={activeReels[activeReelIndex].thumbnailUrl}
              className="w-full h-full object-cover"
              controls
              autoPlay
              playsInline
              loop
            />

            {/* Close Button */}
            <button
              onClick={handleCloseReelPlayer}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black/70 transition-colors z-10"
            >
              ✕
            </button>

            {/* Reel Counter */}
            {activeReels.length > 1 && (
              <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 text-white text-xs font-medium z-10">
                {activeReelIndex + 1} / {activeReels.length}
              </div>
            )}

            {/* Overlay Info */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 pt-12 pointer-events-none">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">Instagram</span>
                <span className="text-xs text-white/70">@{activeReels[activeReelIndex].ownerUsername}</span>
              </div>
              <p className="text-white text-sm font-medium line-clamp-2 mb-2 opacity-90">
                {activeReels[activeReelIndex].caption}
              </p>
              <div className="flex items-center gap-3 text-white/80 text-xs">
                <span className="flex items-center gap-1">❤️ {activeReels[activeReelIndex].likesCount}</span>
                <span className="flex items-center gap-1">💬 {activeReels[activeReelIndex].commentsCount}</span>
                <span className="flex items-center gap-1">👁️ {activeReels[activeReelIndex].viewCount}</span>
              </div>
            </div>
          </div>

          {/* Next Button */}
          {activeReels.length > 1 && (
            <button
              onClick={handleNextReel}
              className="absolute right-2 sm:right-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors z-20"
            >
              ▶
            </button>
          )}

          {/* Backdrop interaction to close */}
          <div className="absolute inset-0 -z-10" onClick={handleCloseReelPlayer} />
        </div>
      )}
    </QueryClientProvider>
  );
}

export default App;
