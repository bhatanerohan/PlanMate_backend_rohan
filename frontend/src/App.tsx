// frontend/src/App.tsx

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInterface from './components/ChatInterface';
import MapView from './components/MapView';
import type { Message, MapMarker, Route, Location } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
  const [routes, setRoutes] = useState<Route[]>([]); // Routes for path visualization
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);

  const [isRouteMode, setIsRouteMode] = useState(false);

  const handleNewPlan = (
    message: Message, 
    newMarkers: MapMarker[], 
    newRoutes?: Route[],
    isRouteQuery?: boolean // NEW: flag to indicate if this is a route planning query
  ) => {
    setMessages((prev) => [...prev, message]);
    
    // For route queries, show markers immediately even before routes load
    // This prevents the map from being empty while Mapbox API is fetching
    setMarkers(newMarkers);

    setIsRouteMode(isRouteQuery || false);  // NEW: Track mode
    
    // If routes are explicitly provided, use them; otherwise MapView will auto-generate
    if (newRoutes && newRoutes.length > 0) {
      setRoutes(newRoutes);
    } else {
      setRoutes([]); // Clear routes, let MapView auto-generate from markers
    }
  };

  const handleMarkerClick = (markerId: string) => {
    setSelectedMarkerId(markerId);
  };

  const handleLocationChange = (loc: Location) => {
    setUserLocation(loc);
    console.log('📍 User location updated:', loc);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-gray-100">
        <div className="w-full md:w-2/5 md:border-r border-gray-300 bg-white flex flex-col">
          <ChatInterface
            messages={messages}
            onNewPlan={handleNewPlan}
            onMarkerSelect={setSelectedMarkerId}
            userLocation={userLocation}
            onLocationChange={handleLocationChange}
          />
        </div>

        <div className="w-full md:w-3/5 bg-gray-200">
          <MapView
            markers={markers}
            routes={routes}
            selectedMarkerId={selectedMarkerId}
            onMarkerClick={handleMarkerClick}
            userLocation={userLocation}
            onLocationChange={handleLocationChange}
            isRouteMode={isRouteMode}  // NEW: Pass mode
          />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;