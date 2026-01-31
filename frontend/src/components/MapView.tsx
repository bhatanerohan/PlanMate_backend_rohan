// frontend/src/components/MapView.tsx - COMPLETE FILE WITH ROUTE FIX

import { useEffect, useState, useRef, memo, useMemo } from 'react';
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

// 🆕 Use WALKING mode for walkable itineraries
const fetchMapboxRoutes = async (markers: MapMarker[], mapboxToken: string): Promise<Route[]> => {
  // Only use PRIMARY markers for routing (filter out alternatives)
  const primaryMarkers = markers.filter(m => m.id.startsWith('primary-') || m.id === 'user-location');
  console.log('🗺️ Route markers order:', primaryMarkers.map(m => m.title));
  console.log('🗺️ fetchMapboxRoutes called:', {
    totalMarkers: markers.length,
    primaryMarkers: primaryMarkers.length,
    markerIds: primaryMarkers.map(m => m.id)
  });

  if (primaryMarkers.length < 2) {
    console.log('⚠️ Not enough primary markers for routing');
    return [];
  }

  try {
    const coordinates = primaryMarkers.map(m => `${m.position.lng},${m.position.lat}`).join(';');
    // 🆕 Changed from 'driving' to 'walking' for walkable routes
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;

    console.log('🌐 Fetching route from Mapbox...');
    const response = await fetch(url);

    if (!response.ok) {
      console.error('❌ Mapbox response not OK:', response.status);
      return createStraightLineRoutes(primaryMarkers);
    }

    const data = await response.json();
    console.log('📦 Mapbox response:', {
      hasRoutes: !!data.routes,
      routeCount: data.routes?.length,
      legsCount: data.routes?.[0]?.legs?.length
    });

    if (!data.routes || data.routes.length === 0) {
      console.warn('⚠️ No routes in Mapbox response');
      return createStraightLineRoutes(primaryMarkers);
    }

    const fullRoute = data.routes[0];
    const routes: Route[] = [];

    // 🆕 Use the full route geometry for better path rendering
    if (fullRoute.geometry && fullRoute.geometry.coordinates) {
      // Create one continuous route with the full geometry
      for (let i = 0; i < primaryMarkers.length - 1; i++) {
        const leg = fullRoute.legs[i];

        // Extract coordinates from leg steps OR use leg geometry
        let coordinates: [number, number][] = [];

        if (leg.steps && leg.steps.length > 0) {
          leg.steps.forEach((step: any) => {
            if (step.geometry && step.geometry.coordinates) {
              coordinates.push(...step.geometry.coordinates);
            }
          });
        }

        // Fallback to straight line if no step coordinates
        if (coordinates.length === 0) {
          coordinates = [
            [primaryMarkers[i].position.lng, primaryMarkers[i].position.lat],
            [primaryMarkers[i + 1].position.lng, primaryMarkers[i + 1].position.lat]
          ];
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
    }

    console.log('✅ Routes created:', routes.length, 'segments');
    return routes;
  } catch (error) {
    console.error('❌ fetchMapboxRoutes error:', error);
    return createStraightLineRoutes(primaryMarkers);
  }
};

const createStraightLineRoutes = (markers: MapMarker[]): Route[] => {
  if (markers.length < 2) return [];
  const routes: Route[] = [];
  console.log('📏 Creating straight line fallback routes');

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
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🆕 Memoize primary markers to avoid unnecessary re-fetches
  const primaryMarkerIds = useMemo(() => {
    return markers
      .filter(m => m.id.startsWith('primary-') || m.id === 'user-location')
      .map(m => `${m.id}:${m.position.lat},${m.position.lng}`)
      .join('|');
  }, [markers]);

  // 🆕 FIXED: Route loading effect with stable dependencies
  useEffect(() => {
    const loadRoutes = async () => {
      // If routes are provided externally, use them
      if (providedRoutes && providedRoutes.length > 0) {
        console.log('📥 Using provided routes:', providedRoutes.length);
        setRoutes(providedRoutes);
        setIsLoadingRoutes(false);
        return;
      }

      // Count primary markers
      const primaryMarkers = markers.filter(m => m.id.startsWith('primary-') || m.id === 'user-location');

      console.log('🔍 Route loading check:', {
        isRouteMode,
        totalMarkers: markers.length,
        primaryMarkers: primaryMarkers.length,
        markerIds: markers.map(m => m.id)
      });

      // Need route mode AND at least 2 primary markers
      if (!isRouteMode || primaryMarkers.length < 2) {
        console.log('⏭️ Skipping route fetch:', { isRouteMode, primaryCount: primaryMarkers.length });
        setRoutes([]);
        setIsLoadingRoutes(false);
        return;
      }

      setIsLoadingRoutes(true);
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

      if (!mapboxToken) {
        console.warn('⚠️ No Mapbox token, using straight lines');
        setRoutes(createStraightLineRoutes(primaryMarkers));
        setIsLoadingRoutes(false);
        return;
      }

      try {
        const fetchedRoutes = await fetchMapboxRoutes(markers, mapboxToken);
        console.log('✅ Setting routes:', fetchedRoutes.length);
        setRoutes(fetchedRoutes);
      } catch (error) {
        console.error('❌ Route fetch error:', error);
        setRoutes(createStraightLineRoutes(primaryMarkers));
      } finally {
        setIsLoadingRoutes(false);
      }
    };

    loadRoutes();
  }, [primaryMarkerIds, isRouteMode]); // 🆕 Use stable primaryMarkerIds instead of markers array

  // Fit bounds when markers change
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
  }, [markers, userLocation]);

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
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    if (geoErrorTimeoutRef.current) {
      clearTimeout(geoErrorTimeoutRef.current);
      geoErrorTimeoutRef.current = null;
    }
    setGeoError(null);
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
      let message = 'Unable to retrieve location.';
      if (err.code === err.PERMISSION_DENIED) {
        message = 'Location access denied. Enable permission or use the search box.';
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        message = 'Location unavailable. Try again or use the search box.';
      } else if (err.code === err.TIMEOUT) {
        message = 'Location request timed out. Try again.';
      }
      setGeoError(message);
      geoErrorTimeoutRef.current = setTimeout(() => {
        setGeoError(null);
        geoErrorTimeoutRef.current = null;
      }, 6000);
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

  // 🆕 Debug log for route rendering
  useEffect(() => {
    console.log('🎨 MapView State:', {
      routeCount: routes.length,
      isLoadingRoutes,
      isRouteMode,
      markersCount: markers.length,
      primaryMarkersCount: markers.filter(m => m.id.startsWith('primary-') || m.id === 'user-location').length,
      routes: routes.map(r => ({
        start: r.start,
        end: r.end,
        coordCount: r.geometry?.coordinates?.length
      }))
    });
  }, [routes, isLoadingRoutes, isRouteMode, markers]);

  return (
    <div className="relative w-full h-full min-h-[40vh] md:min-h-full">
      {/* Quick Actions - TOP LEFT */}
      {currentItinerary && currentItinerary.venues.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-white rounded-lg shadow-lg p-3 w-[92vw] max-w-sm sm:top-4 sm:left-4 sm:translate-x-0 sm:w-auto sm:max-w-none sm:min-w-[280px]">
          <form onSubmit={handleQuickActionSubmit} className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionType(actionType === 'add' ? '' : 'add');
                  setInputValue('');
                  setSelectedStop('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${actionType === 'add'
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
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${actionType === 'remove'
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
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${actionType === 'replace'
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
                  placeholder="What to add? (e.g., coffee shop)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-full px-3 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add to Route
                </button>
              </div>
            )}

            {actionType === 'remove' && currentItinerary && (
              <div className="space-y-2">
                <select
                  value={selectedStop}
                  onChange={(e) => setSelectedStop(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select stop to remove</option>
                  {currentItinerary.venues.map((venue, idx) => (
                    venue.placeId !== 'user-location' && (
                      <option key={venue.placeId} value={idx + 1}>
                        {idx + 1}. {venue.name}
                      </option>
                    )
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

            {actionType === 'replace' && currentItinerary && (
              <div className="space-y-2">
                <select
                  value={selectedStop}
                  onChange={(e) => setSelectedStop(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select stop to replace</option>
                  {currentItinerary.venues.map((venue, idx) => (
                    venue.placeId !== 'user-location' && (
                      <option key={venue.placeId} value={idx + 1}>
                        {idx + 1}. {venue.name}
                      </option>
                    )
                  ))}
                </select>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Replace with... (e.g., Italian restaurant)"
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

      {/* Location Controls - TOP RIGHT */}
      <div className="absolute bottom-4 left-3 right-3 z-50 flex flex-col gap-2 sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:w-auto">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeocodeSearch()}
            placeholder="Search location..."
            className="px-3 py-2 text-sm bg-white rounded-lg shadow border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
          />
          <button
            onClick={handleGeocodeSearch}
            className="w-full sm:w-auto px-3 py-2 bg-white rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200"
          >
            🔍
          </button>
        </div>
        <button
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="w-full sm:w-auto px-4 py-2 bg-white rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-200 disabled:opacity-50"
        >
          📍 {isLocating ? 'Locating...' : 'My location'}
        </button>
        {geoError && (
          <div className="text-xs text-red-600 bg-white border border-red-200 rounded-lg px-3 py-2 shadow">
            {geoError}
          </div>
        )}
      </div>

      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        {/* 🆕 ROUTE RENDERING - Combined into single GeoJSON source */}
        {routes.length > 0 && (
          <Source
            id="route-source"
            type="geojson"
            data={{
              type: 'FeatureCollection',
              features: routes
                .filter(route => route.geometry && route.geometry.type === 'LineString' && route.geometry.coordinates?.length >= 2)
                .map((route, idx) => {
                  console.log(`🛤️ Adding route segment ${idx}:`, {
                    coordinateCount: route.geometry.coordinates?.length,
                    start: route.start,
                    end: route.end,
                    firstCoord: route.geometry.coordinates?.[0],
                    lastCoord: route.geometry.coordinates?.[route.geometry.coordinates.length - 1]
                  });
                  return {
                    type: 'Feature' as const,
                    properties: {
                      index: idx,
                      distance: route.distanceFormatted,
                      duration: route.durationFormatted
                    },
                    geometry: route.geometry
                  };
                })
            }}
          >
            <Layer
              id="route-border"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#ffffff',
                'line-width': 8,
                'line-opacity': 0.8
              }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#3b82f6',
                'line-width': 5,
                'line-opacity': 1
              }}
            />
          </Source>
        )}

        {/* MARKER RENDERING with Primary/Alternative distinction */}
        {markers.map((marker, index) => {
          const isPrimary = marker.id.startsWith('primary-');
          const isAlternative = marker.id.startsWith('alternative-');
          const isUserLocation = marker.id === 'user-location';

          // 🆕 FIX: Extract number from marker ID (e.g., "primary-0" -> 1, "primary-1" -> 2)
          let displayIndex = 0;
          if (isPrimary) {
            const idMatch = marker.id.match(/primary-(\d+)/);
            displayIndex = idMatch ? parseInt(idMatch[1], 10) + 1 : index + 1;
          }

          // Also check metadata for stop number
          if (marker.metadata?.stopNumber) {
            displayIndex = marker.metadata.stopNumber;
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
                  isUserLocation ? (
                    // User location marker - green pin
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                        <span className="text-white text-sm">📍</span>
                      </div>
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-green-500 rotate-45"></div>
                    </div>
                  ) : isAlternative ? (
                    // Alternative venue - Orange Pin with Star
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center">
                        <span className="text-white text-sm">★</span>
                      </div>
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-orange-500 rotate-45"></div>
                    </div>
                  ) : (
                    // Primary venue - numbered red marker
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                        {displayIndex}
                      </div>
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45"></div>
                    </div>
                  )
                ) : (
                  // Event marker - blue
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

        {userLocation && !markers.find(m => m.id === 'user-location') && (
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
        <div className="absolute bottom-24 sm:bottom-8 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-90 rounded-lg shadow-lg px-6 py-3 pointer-events-none z-40">
          <div className="text-center text-gray-700">
            <p className="text-sm font-medium">🗺️ Ready to plan your route</p>
            <p className="text-xs text-gray-500 mt-1">Chat with me to get started</p>
          </div>
        </div>
      )}
    </div>
  );
};

// PopupContent component
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
      <div className="compact-popup">
        {/* Compact header image */}
        {venue.photoUrl && (
          <img
            src={venue.photoUrl}
            alt={venue.name}
            className="popup-image"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        )}

        <div className="popup-content">
          {/* Stop number badge if applicable */}
          {marker.metadata?.stopNumber && (
            <div className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full mr-2 mb-1">
              {marker.metadata.stopNumber}
            </div>
          )}

          <h3 className="popup-title">{venue.name}</h3>
          <p className="popup-address">{venue.address}</p>

          {/* Inline meta info */}
          <div className="popup-meta">
            {venue.rating && (
              <span className="rating">⭐ {venue.rating}</span>
            )}
            {venue.priceLevel && (
              <span>{venue.priceLevel}</span>
            )}
          </div>

          {/* Action buttons */}
          {hasCurrentItinerary && (
            <div className="popup-actions">
              {isAlternative && (
                <button
                  onClick={handleAddToRoute}
                  className="action-btn success"
                  title="Add to Route"
                >
                  ➕
                </button>
              )}

              {isPrimary && marker.metadata?.stopNumber && (
                <button
                  onClick={handleRemoveFromRoute}
                  className="action-btn danger"
                  title="Remove from Route"
                >
                  ➖
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } else {
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
