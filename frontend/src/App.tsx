// frontend/src/App.tsx

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInterface from './components/ChatInterface';
import MapView from './components/MapView';
import type { Message, MapMarker, Route, Location } from './types';  // ⭐ Added Location

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
  const [routes, setRoutes] = useState<Route[]>([]);  // ⭐ NEW
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);

  const handleNewPlan = (message: Message, newMarkers: MapMarker[], newRoutes: Route[] = []) => {  // ⭐ Added newRoutes
    setMessages((prev) => [...prev, message]);
    setMarkers(newMarkers);
    setRoutes(newRoutes);  // ⭐ NEW
  };

  const handleMarkerClick = (markerId: string) => {
    setSelectedMarkerId(markerId);
  };

  const handleLocationChange = (loc: Location) => {
    setUserLocation(loc);
    // Optionally, add a system message when user changes location
    setMessages((prev) => [...prev, {
      id: String(prev.length + 1),
      type: 'system',
      content: `Location set to ${loc.name || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}`,
      timestamp: Date.now()
    }]);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
        <div className="w-2/5 border-r border-gray-300 bg-white flex flex-col">
          <ChatInterface
            messages={messages}
            onNewPlan={handleNewPlan}
            onMarkerSelect={setSelectedMarkerId}
          />
        </div>

        <div className="w-3/5 bg-gray-200">
          <MapView
            markers={markers}
            routes={routes}  // ⭐ NEW
            selectedMarkerId={selectedMarkerId}
            onMarkerClick={handleMarkerClick}
            userLocation={userLocation}
            onLocationChange={handleLocationChange}
          />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;