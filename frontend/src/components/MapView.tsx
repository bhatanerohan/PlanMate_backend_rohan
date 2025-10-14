// frontend/src/components/MapView.tsx

import { useEffect, useState, useRef } from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import type { MapMarker, Venue, Event, Route, Location } from '../types';

interface MapViewProps {
  markers: MapMarker[];
  routes?: Route[];  // Optional - if not provided, auto-generate from markers
  selectedMarkerId: string | null;
  onMarkerClick: (markerId: string) => void;
  userLocation?: Location | null;
  onLocationChange?: (loc: Location) => void;
  isRouteMode?: boolean;  // NEW: Add this prop
}

/**
 * Fetch actual road-following routes using Mapbox Directions API
 * Supports up to 25 waypoints in a single request
 */
const fetchMapboxRoutes = async (markers: MapMarker[], mapboxToken: string): Promise<Route[]> => {
  if (markers.length < 2) return [];

  try {
    // Build coordinates string for Mapbox API (lng,lat format)
    const coordinates = markers
      .map(m => `${m.position.lng},${m.position.lat}`)
      .join(';');

    // Call Mapbox Directions API
    // Profile: walking (alternatives: driving, cycling)
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
    
    console.log('🗺️ Fetching route from Mapbox Directions API...');
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Mapbox Directions API error:', response.status);
      return createStraightLineRoutes(markers); // Fallback to straight lines
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn('No routes returned from Mapbox');
      return createStraightLineRoutes(markers); // Fallback
    }

    // Mapbox returns one route with all waypoints
    // We need to split it into segments between consecutive markers
    const fullRoute = data.routes[0];
    const routes: Route[] = [];

    // Create segments between each consecutive pair
    for (let i = 0; i < markers.length - 1; i++) {
      const leg = fullRoute.legs[i]; // Each leg is start → end segment
      
      // Get all coordinates for this leg from its steps
      const coordinates: [number, number][] = [];
      if (leg.steps && leg.steps.length > 0) {
        leg.steps.forEach((step: any) => {
          if (step.geometry && step.geometry.coordinates) {
            coordinates.push(...step.geometry.coordinates);
          }
        });
      }
      
      // Fallback to straight line if no coordinates found
      if (coordinates.length === 0) {
        coordinates.push(
          [markers[i].position.lng, markers[i].position.lat],
          [markers[i + 1].position.lng, markers[i + 1].position.lat]
        );
      }

      routes.push({
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        distance: leg.distance / 1000, // Convert meters to km
        distanceFormatted: `${(leg.distance / 1000).toFixed(2)} km`,
        duration: leg.duration,
        durationFormatted: formatDuration(leg.duration),
        start: markers[i].title,
        end: markers[i + 1].title
      });
    }

    console.log(`✅ Fetched ${routes.length} road-following route segments`);
    return routes;

  } catch (error) {
    console.error('Error fetching Mapbox routes:', error);
    // Fallback to straight lines
    return createStraightLineRoutes(markers);
  }
};

/**
 * Fallback: Create simple straight-line routes between consecutive markers
 * Used when Mapbox API fails or is unavailable
 */
const createStraightLineRoutes = (markers: MapMarker[]): Route[] => {
  if (markers.length < 2) return [];

  const routes: Route[] = [];

  for (let i = 0; i < markers.length - 1; i++) {
    const start = markers[i];
    const end = markers[i + 1];

    // Calculate straight-line distance using Haversine formula
    const distance = calculateDistance(
      start.position.lat,
      start.position.lng,
      end.position.lat,
      end.position.lng
    );

    // Estimate walking time (assuming 3 mph / 4.8 km/h average walking speed)
    const durationMinutes = Math.round((distance / 4.8) * 60);

    routes.push({
      geometry: {
        type: 'LineString',
        coordinates: [
          [start.position.lng, start.position.lat],
          [end.position.lng, end.position.lat]
        ]
      },
      distance: distance,
      distanceFormatted: `${distance.toFixed(2)} km`,
      duration: durationMinutes * 60,
      durationFormatted: `${durationMinutes} min walk`,
      start: start.title,
      end: end.title
    });
  }

  return routes;
};

/**
 * Format duration in seconds to human-readable string
 */
const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min walk`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m walk`;
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

const toRad = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

const MapView = ({ 
  markers, 
  routes: providedRoutes, 
  selectedMarkerId, 
  onMarkerClick, 
  userLocation, 
  onLocationChange, 
  isRouteMode = false  // NEW: Default to false
}: MapViewProps) => {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<MapMarker | null>(null);
  const [viewState, setViewState] = useState({
    longitude: userLocation?.lng ?? -71.0589,
    latitude: userLocation?.lat ?? 42.3601,
    zoom: 12
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);

  // Fetch road-following routes when markers change
  useEffect(() => {
    console.log('🗺️ MapView effect — markers changed', { markersCount: markers.length, isRouteMode });
    const loadRoutes = async () => {
      if (providedRoutes && providedRoutes.length > 0) {
        // Use provided routes if available
        setRoutes(providedRoutes);
        setIsLoadingRoutes(false);
        return;
      }

       // 🎯 KEY CHANGE: Only generate routes in route mode
       if (!isRouteMode || markers.length < 2) {
        setRoutes([]);
        setIsLoadingRoutes(false);
        return;
      }

      // Fetch actual road-following routes from Mapbox
      setIsLoadingRoutes(true);
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      
      if (!mapboxToken) {
        console.warn('Mapbox token not found, using straight lines');
        setRoutes(createStraightLineRoutes(markers));
        setIsLoadingRoutes(false);
        return;
      }

      try {
        const fetchedRoutes = await fetchMapboxRoutes(markers, mapboxToken);
        console.log('🗺️ MapView — fetched routes count:', fetchedRoutes.length);
        setRoutes(fetchedRoutes);
      } catch (error) {
        console.error('Failed to fetch routes:', error);
        setRoutes(createStraightLineRoutes(markers));
      } finally {
        setIsLoadingRoutes(false);
      }
    };

    loadRoutes();
  }, [markers, providedRoutes, isRouteMode]);

  // Fit map to show all markers when they change
  useEffect(() => {
    if ((markers.length === 0 && !userLocation) || !mapRef.current) return;

    const map = mapRef.current.getMap();

    let bounds: mapboxgl.LngLatBounds;
    if (markers.length > 0) {
      bounds = markers.reduce((b, marker) => b.extend([marker.position.lng, marker.position.lat]),
        new mapboxgl.LngLatBounds(
          [markers[0].position.lng, markers[0].position.lat],
          [markers[0].position.lng, markers[0].position.lat]
        )
      );
    } else if (userLocation) {
      bounds = new mapboxgl.LngLatBounds([userLocation.lng, userLocation.lat], [userLocation.lng, userLocation.lat]);
    } else {
      return;
    }

    map.fitBounds(bounds, {
      padding: 50,
      maxZoom: markers.length === 1 ? 15 : 14,
      duration: 1000
    });

    console.log(`📍 Fitted map to ${markers.length} markers`);
  }, [markers]);

  // Keep map center in sync when userLocation changes
  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    const map = mapRef.current.getMap();
    map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 800 });
    setViewState((s) => ({ ...s, longitude: userLocation.lng, latitude: userLocation.lat }));
  }, [userLocation]);

  // Handle selected marker
  useEffect(() => {
    if (!selectedMarkerId || !mapRef.current) return;

    const marker = markers.find(m => m.id === selectedMarkerId);
    if (!marker) return;

    const map = mapRef.current.getMap();
    map.flyTo({
      center: [marker.position.lng, marker.position.lat],
      zoom: 16,
      duration: 1000
    });

    setPopupInfo(marker);
    console.log(`🎯 Selected marker: ${marker.title}`);
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

  return (
    <div className="relative w-full h-full min-h-[40vh] md:min-h-full">
      {/* Location controls */}
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
        {/* Render route lines FIRST (so they appear under markers) */}
        {routes.map((route, idx) => {
          // Ensure geometry is properly formatted
          if (!route.geometry || route.geometry.type !== 'LineString') {
            console.warn(`Route ${idx} has invalid geometry`, route);
            return null;
          }

          return (
            <Source
              key={`route-source-${idx}`}
              type="geojson"
              data={{
                type: 'Feature',
                properties: {
                  distance: route.distanceFormatted,
                  duration: route.durationFormatted
                },
                geometry: route.geometry
              }}
            >
              {/* Outer white border for visibility */}
              <Layer
                id={`route-border-${idx}`}
                type="line"
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 8,
                  'line-opacity': 0.6
                }}
              />
              {/* Main route line */}
              <Layer
                id={`route-line-${idx}`}
                type="line"
                paint={{
                  'line-color': '#0ea5e9',
                  'line-width': 4,
                  'line-opacity': 0.9
                }}
              />
              {/* Dashed line overlay for style */}
              <Layer
                id={`route-dash-${idx}`}
                type="line"
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 2,
                  'line-dasharray': [2, 2],
                  'line-opacity': 0.7
                }}
              />
            </Source>
          );
        })}

        {/* Render markers with numbers for sequence */}
        {markers.map((marker, index) => (
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
            <div
              className={`cursor-pointer transform transition-all duration-200 hover:scale-110 ${
                selectedMarkerId === marker.id ? 'scale-125' : ''
              }`}
            >
              {marker.type === 'venue' ? (
                <div className="relative">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                    {index + 1}
                  </div>
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45"></div>
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
        ))}

        {/* User location marker if provided */}
        {userLocation && (
        <Marker
          longitude={userLocation.lng}
          latitude={userLocation.lat}
          anchor="center"
        >
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>
        </Marker>
        )}

        {/* Popup for selected marker */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.position.lng}
            latitude={popupInfo.position.lat}
            anchor="top"
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
            offset={25}
          >
            <PopupContent marker={popupInfo} />
          </Popup>
        )}
      </Map>

      {/* Info overlay */}
      {(markers.length > 0 || routes.length > 0) && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-4 py-3 space-y-2 max-w-xs">
          {markers.length > 0 && (
            <p className="text-sm font-medium text-gray-700">
              📍 {markers.length} {markers.length === 1 ? 'stop' : 'stops'}
            </p>
          )}
          {isLoadingRoutes && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Calculating route...</span>
            </div>
          )}
          {!isLoadingRoutes && routes.length > 0 && (
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700 mb-1">Route segments:</p>
              {routes.map((route, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-gray-50 p-2 rounded">
                  <span className="text-blue-500 text-base">→</span>
                  <div>
                    <div className="font-medium text-gray-800">
                      Stop {idx + 1} → {idx + 2}
                    </div>
                    <div className="text-gray-600">
                      {route.distanceFormatted} • {route.durationFormatted}
                    </div>
                  </div>
                </div>
              ))}
              {routes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="font-semibold text-gray-800">
                    Total: {routes.reduce((sum, r) => sum + r.distance, 0).toFixed(2)} km
                  </div>
                  <div className="text-gray-600">
                    {Math.round(routes.reduce((sum, r) => sum + r.duration, 0) / 60)} min total
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading/empty state */}
      {markers.length === 0 && routes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-500">
            <p className="text-4xl mb-2">🗺️</p>
            <p className="text-lg font-medium">Start planning your route</p>
            <p className="text-sm mt-1">Your locations will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
};

const PopupContent = ({ marker }: { marker: MapMarker }) => {
  if (marker.type === 'venue') {
    const venue = marker.data as Venue;
    return (
    <div className="p-2 min-w-[160px] sm:min-w-[200px]">
        <h3 className="font-bold text-sm mb-2">{venue.name}</h3>
        <p className="text-xs text-gray-600 mb-1">{venue.address}</p>
        {venue.rating && (
          <p className="text-xs text-gray-700 mb-1">
            ⭐ {venue.rating}
          </p>
        )}
        {venue.priceLevel && (
          <p className="text-xs text-gray-700">{venue.priceLevel}</p>
        )}
      </div>
    );
  } else {
    const event = marker.data as Event;
    return (
    <div className="p-2 min-w-[160px] sm:min-w-[200px]">
        <h3 className="font-bold text-sm mb-2">{event.name}</h3>
        <p className="text-xs text-gray-600 mb-1">{event.venue.name}</p>
        <p className="text-xs text-gray-700 mb-1">📅 {event.date}</p>
        {event.priceRange && (
          <p className="text-xs text-gray-700 mb-2">💰 {event.priceRange}</p>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            View Details →
          </a>
        )}
      </div>
    );
  }
};

export default MapView;