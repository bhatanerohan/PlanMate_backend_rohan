// frontend/src/components/MapView.tsx - COMPLETE FILE

import { useEffect, useState, useRef, memo } from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import type { MapMarker, Venue, Event, Route, Location } from '../types';
import React from 'react';

interface MapViewProps {
  markers: MapMarker[];
  routes?: Route[];
  selectedMarkerId: string | null;
  onMarkerClick: (markerId: string) => void;
  userLocation?: Location | null;
  onLocationChange?: (loc: Location) => void;
  isRouteMode?: boolean;
  currentItinerary?: { venues: Venue[] } | null;
  onQuickAction?: (action: string) => void;
}

const fetchMapboxRoutes = async (markers: MapMarker[], mapboxToken: string): Promise<Route[]> => {
  if (markers.length < 2) return [];

  // 🆕 Only use PRIMARY markers for routing
  const primaryMarkers = markers.filter(m => m.id.startsWith('primary-') || m.id === 'user-location');
  
  if (primaryMarkers.length < 2) return [];

  try {
    const coordinates = primaryMarkers.map(m => `${m.position.lng},${m.position.lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
    
    const response = await fetch(url);
    if (!response.ok) return createStraightLineRoutes(primaryMarkers);

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) return createStraightLineRoutes(primaryMarkers);

    const fullRoute = data.routes[0];
    const routes: Route[] = [];

    for (let i = 0; i < primaryMarkers.length - 1; i++) {
      const leg = fullRoute.legs[i];
      const coordinates: [number, number][] = [];
      
      if (leg.steps && leg.steps.length > 0) {
        leg.steps.forEach((step: any) => {
          if (step.geometry && step.geometry.coordinates) {
            coordinates.push(...step.geometry.coordinates);
          }
        });
      }
      
      if (coordinates.length === 0) {
        coordinates.push(
          [primaryMarkers[i].position.lng, primaryMarkers[i].position.lat],
          [primaryMarkers[i + 1].position.lng, primaryMarkers[i + 1].position.lat]
        );
      }

      routes.push({
        geometry: { type: 'LineString', coordinates },
        distance: leg.distance / 1000,
        distanceFormatted: `${(leg.distance / 1000).toFixed(2)} km`,
        duration: leg.duration,
        durationFormatted: formatDuration(leg.duration),
        start: primaryMarkers[i].title,
        end: primaryMarkers[i + 1].title
      });
    }

    return routes;
  } catch (error) {
    return createStraightLineRoutes(primaryMarkers);
  }
};

const createStraightLineRoutes = (markers: MapMarker[]): Route[] => {
  if (markers.length < 2) return [];
  const routes: Route[] = [];

  for (let i = 0; i < markers.length - 1; i++) {
    const start = markers[i];
    const end = markers[i + 1];
    const distance = calculateDistance(start.position.lat, start.position.lng, end.position.lat, end.position.lng);
    const durationMinutes = Math.round((distance / 4.8) * 60);

    routes.push({
      geometry: {
        type: 'LineString',
        coordinates: [[start.position.lng, start.position.lat], [end.position.lng, end.position.lat]]
      },
      distance,
      distanceFormatted: `${distance.toFixed(2)} km`,
      duration: durationMinutes * 60,
      durationFormatted: `${durationMinutes} min walk`,
      start: start.title,
      end: end.title
    });
  }
  return routes;
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m walk`;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (degrees: number): number => degrees * (Math.PI / 180);

const MapView = ({ 
  markers, 
  routes: providedRoutes, 
  selectedMarkerId, 
  onMarkerClick, 
  userLocation, 
  onLocationChange, 
  isRouteMode = false,
  currentItinerary,
  onQuickAction
}: MapViewProps) => {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<MapMarker | null>(null);
  const [viewState, setViewState] = useState({
    longitude: userLocation?.lng ?? -71.0589,
    latitude: userLocation?.lat ?? 42.3601,
    zoom: 11
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  
  const [actionType, setActionType] = useState<'add' | 'remove' | 'replace' | ''>('');
  const [inputValue, setInputValue] = useState('');
  const [selectedStop, setSelectedStop] = useState('');

  useEffect(() => {
    const loadRoutes = async () => {
      if (providedRoutes && providedRoutes.length > 0) {
        setRoutes(providedRoutes);
        setIsLoadingRoutes(false);
        return;
      }

      if (!isRouteMode || markers.length < 2) {
        setRoutes([]);
        setIsLoadingRoutes(false);
        return;
      }

      setIsLoadingRoutes(true);
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      
      if (!mapboxToken) {
        setRoutes(createStraightLineRoutes(markers.filter(m => m.id.startsWith('primary-'))));
        setIsLoadingRoutes(false);
        return;
      }

      try {
        const fetchedRoutes = await fetchMapboxRoutes(markers, mapboxToken);
        setRoutes(fetchedRoutes);
      } catch (error) {
        setRoutes(createStraightLineRoutes(markers.filter(m => m.id.startsWith('primary-'))));
      } finally {
        setIsLoadingRoutes(false);
      }
    };

    loadRoutes();
  }, [markers, providedRoutes, isRouteMode]);

  useEffect(() => {
    if ((markers.length === 0 && !userLocation) || !mapRef.current) return;
    const map = mapRef.current.getMap();

    let bounds: mapboxgl.LngLatBounds;
    if (markers.length > 0) {
      bounds = markers.reduce((b, marker) => b.extend([marker.position.lng, marker.position.lat]),
        new mapboxgl.LngLatBounds([markers[0].position.lng, markers[0].position.lat], [markers[0].position.lng, markers[0].position.lat])
      );
    } else if (userLocation) {
      bounds = new mapboxgl.LngLatBounds([userLocation.lng, userLocation.lat], [userLocation.lng, userLocation.lat]);
    } else {
      return;
    }

    map.fitBounds(bounds, { padding: 50, maxZoom: markers.length === 1 ? 15 : 14, duration: 1000 });
  }, [markers]);

  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    const map = mapRef.current.getMap();
    map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 800 });
    setViewState((s) => ({ ...s, longitude: userLocation.lng, latitude: userLocation.lat }));
  }, [userLocation]);

  useEffect(() => {
    if (!selectedMarkerId || !mapRef.current) return;
    const marker = markers.find(m => m.id === selectedMarkerId);
    if (!marker) return;

    const map = mapRef.current.getMap();
    map.flyTo({ center: [marker.position.lng, marker.position.lat], zoom: 16, duration: 1000 });
    setPopupInfo(marker);
  }, [selectedMarkerId, markers]);

  const handleMarkerClick = (marker: MapMarker) => {
    onMarkerClick(marker.id);
    setPopupInfo(marker);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setIsLocating(false);
      const loc: Location = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Current location' };
      onLocationChange?.(loc);
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        map.flyTo({ center: [loc.lng, loc.lat], zoom: 13 });
      }
    }, (err) => {
      setIsLocating(false);
      alert('Unable to retrieve location: ' + err.message);
    });
  };

  const handleGeocodeSearch = async () => {
    if (!searchQuery) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.features || data.features.length === 0) {
        alert('Location not found');
        return;
      }
      const feat = data.features[0];
      const [lng, lat] = feat.center;
      const loc: Location = { lat, lng, name: feat.place_name };
      onLocationChange?.(loc);
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        map.flyTo({ center: [lng, lat], zoom: 13 });
      }
    } catch (err) {
      console.error(err);
      alert('Geocoding failed');
    }
  };

  const handleQuickActionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let command = '';
    
    if (actionType === 'add' && inputValue.trim()) {
      command = `add ${inputValue.trim()}`;
    } else if (actionType === 'remove' && selectedStop) {
      command = `remove stop ${selectedStop}`;
    } else if (actionType === 'replace' && selectedStop && inputValue.trim()) {
      command = `replace stop ${selectedStop} with ${inputValue.trim()}`;
    }
    
    if (command) {
      onQuickAction?.(command);
      setActionType('');
      setInputValue('');
      setSelectedStop('');
    }
  };

  return (
    <div className="relative w-full h-full min-h-[40vh] md:min-h-full">
      {/* Quick Actions - TOP LEFT */}
      {currentItinerary && currentItinerary.venues.length > 0 && (
        <div className="absolute top-4 left-4 z-50 bg-white rounded-lg shadow-lg p-3 min-w-[280px]">
          <form onSubmit={handleQuickActionSubmit} className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionType(actionType === 'add' ? '' : 'add');
                  setInputValue('');
                  setSelectedStop('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  actionType === 'add' 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ➕ Add
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setActionType(actionType === 'remove' ? '' : 'remove');
                  setInputValue('');
                  setSelectedStop('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  actionType === 'remove' 
                    ? 'bg-red-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ➖ Remove
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setActionType(actionType === 'replace' ? '' : 'replace');
                  setInputValue('');
                  setSelectedStop('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  actionType === 'replace' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🔄 Replace
              </button>
            </div>

            {actionType === 'add' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="What to add? (e.g., museum, coffee shop)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-full px-3 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add Stop
                </button>
              </div>
            )}

            {actionType === 'remove' && (
              <div className="space-y-2">
                <select
                  value={selectedStop}
                  onChange={(e) => setSelectedStop(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  autoFocus
                >
                  <option value="">Select stop to remove...</option>
                  {currentItinerary.venues.map((venue, idx) => (
                    <option key={idx} value={idx + 1}>
                      Stop {idx + 1}: {venue.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!selectedStop}
                  className="w-full px-3 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Remove Stop
                </button>
              </div>
            )}

            {actionType === 'replace' && (
              <div className="space-y-2">
                <select
                  value={selectedStop}
                  onChange={(e) => setSelectedStop(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select stop to replace...</option>
                  {currentItinerary.venues.map((venue, idx) => (
                    <option key={idx} value={idx + 1}>
                      Stop {idx + 1}: {venue.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Replace with? (e.g., cafe, restaurant)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  disabled={!selectedStop || !inputValue.trim()}
                  className="w-full px-3 py-2 bg-orange-500 text-white rounded-md text-sm font-medium hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Replace Stop
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Location controls - Top Right */}
      <div className="absolute top-4 right-4 z-50 bg-white rounded-md shadow-md p-3 flex gap-2 items-center touch-manipulation">
        <input
          className="border px-2 py-1 rounded-md w-48"
          placeholder="Search location or address"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeSearch(); }}
        />
        <button className="bg-blue-500 text-white px-3 py-1 rounded-md" onClick={handleGeocodeSearch}>Go</button>
        <button className="bg-gray-100 px-3 py-2 rounded-md text-sm" onClick={handleUseMyLocation}>
          {isLocating ? 'Locating...' : 'My location'}
        </button>
      </div>

      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        {routes.map((route, idx) => {
          if (!route.geometry || route.geometry.type !== 'LineString') return null;

          return (
            <Source
              key={`route-source-${idx}`}
              type="geojson"
              data={{
                type: 'Feature',
                properties: { distance: route.distanceFormatted, duration: route.durationFormatted },
                geometry: route.geometry
              }}
            >
              <Layer id={`route-border-${idx}`} type="line" paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.6 }} />
              <Layer id={`route-line-${idx}`} type="line" paint={{ 'line-color': '#0ea5e9', 'line-width': 4, 'line-opacity': 0.9 }} />
              <Layer id={`route-dash-${idx}`} type="line" paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 }} />
            </Source>
          );
        })}

        {/* 🆕 UPDATED MARKER RENDERING with Primary/Alternative distinction */}
        {markers.map((marker, index) => {
          const isPrimary = marker.id.startsWith('primary-');
          const isAlternative = marker.id.startsWith('alternative-');
          const isUserLocation = marker.id === 'user-location';
          
          let displayIndex = 0;
          if (isPrimary) {
            displayIndex = markers.filter(m => m.id.startsWith('primary-')).indexOf(marker) + 1;
          }
          
          return (
            <Marker
              key={marker.id}
              longitude={marker.position.lng}
              latitude={marker.position.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleMarkerClick(marker);
              }}
            >
              <div className={`cursor-pointer transform transition-all duration-200 hover:scale-110 ${selectedMarkerId === marker.id ? 'scale-125' : ''}`}>
                {marker.type === 'venue' ? (
                  <div className="relative">
                    {isPrimary && (
                      <>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                          {displayIndex}
                        </div>
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45"></div>
                      </>
                    )}
                    
                    {isAlternative && (
                      <>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-orange-400 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">
                          •
                        </div>
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-orange-400 rotate-45"></div>
                      </>
                    )}
                    
                    {isUserLocation && (
                      <>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                          📍
                        </div>
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-green-500 rotate-45"></div>
                      </>
                    )}
                    
                    {!isPrimary && !isAlternative && !isUserLocation && (
                      <>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                          {index + 1}
                        </div>
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45"></div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                      {index + 1}
                    </div>
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-500 rotate-45"></div>
                  </div>
                )}
              </div>
            </Marker>
          );
        })}

        {userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>
          </Marker>
        )}

{popupInfo && (
  <Popup
    longitude={popupInfo.position.lng}
    latitude={popupInfo.position.lat}
    anchor="top"
    onClose={() => setPopupInfo(null)}
    closeButton={true}
    closeOnClick={false}
    offset={25}
    maxWidth="none"
    className="venue-popup"
  >
    <PopupContent 
      marker={popupInfo} 
      onQuickAction={onQuickAction}
      hasCurrentItinerary={!!currentItinerary}
    />
  </Popup>
)}

      </Map>

      {isLoadingRoutes && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-95 rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 z-50">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-gray-700">Calculating route...</span>
        </div>
      )}

      {markers.length === 0 && routes.length === 0 && !isLoadingRoutes && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-90 rounded-lg shadow-lg px-6 py-3 pointer-events-none z-40">
          <div className="text-center text-gray-700">
            <p className="text-sm font-medium">🗺️ Ready to plan your route</p>
            <p className="text-xs text-gray-500 mt-1">Chat with me to get started</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Find the PopupContent component in MapView.tsx and replace it with this fixed version:

const PopupContent = memo(({ 
  marker, 
  onQuickAction, 
  hasCurrentItinerary 
}: { 
  marker: MapMarker; 
  onQuickAction?: (action: string) => void;
  hasCurrentItinerary: boolean;
}) => {
  if (marker.type === 'venue') {
    const venue = marker.data as Venue;
    const isAlternative = marker.metadata?.isAlternative;
    const isPrimary = marker.metadata?.isPrimary;
    
    const handleAddToRoute = () => {
      if (!onQuickAction) return;
      const venueJson = JSON.stringify({
        name: venue.name,
        address: venue.address,
        location: venue.location,
        rating: venue.rating,
        priceLevel: venue.priceLevel,
        placeId: venue.placeId,
        types: venue.types,
        photoUrl: venue.photoUrl,
        description: venue.description,
        photos: venue.photos
      });
      
      if (marker.metadata?.primaryStopNumber) {
        onQuickAction(`add ${venue.name} after stop ${marker.metadata.primaryStopNumber}[VENUE:${venueJson}]`);
      } else {
        onQuickAction(`add ${venue.name}[VENUE:${venueJson}]`);
      }
    };
    
    const handleRemoveFromRoute = () => {
      if (!onQuickAction || !marker.metadata?.stopNumber) return;
      onQuickAction(`remove stop ${marker.metadata.stopNumber}`);
    };
    
    return (
      <div className="w-[280px] sm:w-[320px] max-w-[90vw]">
        {/* Image Container - Fixed aspect ratio */}
        {venue.photoUrl && (
          <div className="w-full h-[140px] sm:h-[160px] bg-gray-100 overflow-hidden rounded-t-lg">
            <img 
              src={venue.photoUrl} 
              alt={venue.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.classList.add('flex', 'items-center', 'justify-center');
                  parent.innerHTML = '<div class="text-gray-400 text-sm">No image available</div>';
                }
              }}
            />
          </div>
        )}
        
        {/* Content Container - Controlled padding and spacing */}
        <div className="p-3 space-y-2">
          {/* Alternative Badge */}
          {isAlternative && (
            <div className="space-y-1">
              <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full font-medium">
                Alternative Option
              </span>
              {marker.metadata?.primaryVenueName && (
                <p className="text-xs text-gray-500">
                  Near: <span className="font-medium">{marker.metadata.primaryVenueName}</span>
                </p>
              )}
            </div>
          )}
          
          {/* Primary Stop Badge */}
          {isPrimary && marker.metadata?.stopNumber && (
            <div>
              <span className="inline-block bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold">
                Stop #{marker.metadata.stopNumber}
              </span>
            </div>
          )}
          
          {/* Venue Name - Truncate long names */}
          <h3 className="font-bold text-sm leading-tight line-clamp-2">
            {venue.name}
          </h3>
          
          {/* Address - Truncate long addresses */}
          <p className="text-xs text-gray-600 line-clamp-1">
            {venue.address}
          </p>
          
          {/* Description - Limit to 2 lines */}
          {venue.description && (
            <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">
              {venue.description}
            </p>
          )}
          
          {/* Rating and Price - Inline flex */}
          {(venue.rating || venue.priceLevel) && (
            <div className="flex items-center gap-2 text-xs">
              {venue.rating && (
                <span className="flex items-center gap-1 text-gray-700 font-medium">
                  <span className="text-yellow-500">⭐</span>
                  {venue.rating}
                </span>
              )}
              {venue.priceLevel && (
                <span className="text-gray-600">
                  {venue.priceLevel}
                </span>
              )}
            </div>
          )}
          
          {/* Action Buttons - Only show if has itinerary */}
          {hasCurrentItinerary && (
            <div className="pt-2 border-t border-gray-200">
              {isAlternative && (
                <button
                  onClick={handleAddToRoute}
                  className="w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors duration-150 flex items-center justify-center gap-1"
                >
                  <span>➕</span>
                  <span>Add to Route</span>
                </button>
              )}
              
              {isPrimary && marker.metadata?.stopNumber && (
                <button
                  onClick={handleRemoveFromRoute}
                  className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors duration-150 flex items-center justify-center gap-1"
                >
                  <span>➖</span>
                  <span>Remove from Route</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } else {
    // Event popup
    const event = marker.data as Event;
    return (
      <div className="w-[240px] sm:w-[280px] max-w-[90vw] p-3 space-y-2">
        <h3 className="font-bold text-sm leading-tight line-clamp-2">
          {event.name}
        </h3>
        <p className="text-xs text-gray-600 line-clamp-1">
          {event.venue.name}
        </p>
        <div className="space-y-1">
          <p className="text-xs text-gray-700 flex items-center gap-1">
            <span>📅</span>
            <span>{event.date}</span>
          </p>
          {event.priceRange && (
            <p className="text-xs text-gray-700 flex items-center gap-1">
              <span>💰</span>
              <span>{event.priceRange}</span>
            </p>
          )}
        </div>
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium mt-1"
          >
            View Details →
          </a>
        )}
      </div>
    );
  }
});
export default MapView;