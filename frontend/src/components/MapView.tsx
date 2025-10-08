// frontend/src/components/MapView.tsx

import { useEffect, useState, useRef } from 'react';
import Map, { Marker, Source, Layer, Popup } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import type { MapMarker, Venue, Event, Route, Location } from '../types';

interface MapViewProps {
  markers: MapMarker[];
  routes: Route[];  // ⭐ NEW
  selectedMarkerId: string | null;
  onMarkerClick: (markerId: string) => void;
  userLocation?: Location | null;
  onLocationChange?: (loc: Location) => void;
}

const MapView = ({ markers, routes, selectedMarkerId, onMarkerClick, userLocation, onLocationChange }: MapViewProps) => {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<MapMarker | null>(null);
  const [viewState, setViewState] = useState({
    longitude: userLocation?.lng ?? -71.0589,
    latitude: userLocation?.lat ?? 42.3601,
    zoom: 12
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Fit map to show all markers when they change
  useEffect(() => {
    if ((markers.length === 0 && !userLocation) || !mapRef.current) return;

    const map = mapRef.current.getMap();

    // Calculate bounds from all markers
    // If we have markers, fit to markers; otherwise center on userLocation
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

    // Fly to selected marker
    const map = mapRef.current.getMap();
    map.flyTo({
      center: [marker.position.lng, marker.position.lat],
      zoom: 16,
      duration: 1000
    });

    // Show popup
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
      // center map immediately
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
      // Use Mapbox Geocoding API directly from frontend (public token expected)
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
    <div className="relative w-full h-full">
      {/* Location controls */}
      <div className="absolute top-4 right-4 z-50 bg-white rounded-md shadow-md p-3 flex gap-2 items-center">
        <input
          className="border px-2 py-1 rounded-md w-48"
          placeholder="Search location or address"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeSearch(); }}
        />
        <button className="bg-blue-500 text-white px-3 py-1 rounded-md" onClick={handleGeocodeSearch}>Go</button>
        <button className="bg-gray-100 px-2 py-1 rounded-md" onClick={handleUseMyLocation}>
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
        {/* Render route lines */}
        {routes.map((route, idx) => (
          <Source
            key={`route-${idx}`}
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: route.geometry
            }}
          >
            {/* Route line */}
            <Layer
              id={`route-line-${idx}`}
              type="line"
              paint={{
                'line-color': '#0ea5e9',
                'line-width': 4,
                'line-opacity': 0.8
              }}
            />
            {/* Route line border for visibility */}
            <Layer
              id={`route-border-${idx}`}
              type="line"
              paint={{
                'line-color': '#ffffff',
                'line-width': 6,
                'line-opacity': 0.4
              }}
              beforeId={`route-line-${idx}`}
            />
          </Source>
        ))}

        {/* Render markers */}
        {markers.map((marker) => (
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
                <div className="w-8 h-8 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-bold">
                  🍽️
                </div>
              ) : (
                <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-bold">
                  🎭
                </div>
              )}
            </div>
          </Marker>
        ))}

        {/* Popup for selected marker */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.position.lng}
            latitude={popupInfo.position.lat}
            anchor="top"
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <PopupContent marker={popupInfo} />
          </Popup>
        )}
      </Map>

      {/* Info overlay */}
      {(markers.length > 0 || routes.length > 0) && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-4 py-3 space-y-2">
          {markers.length > 0 && (
            <p className="text-sm font-medium text-gray-700">
              📍 {markers.length} {markers.length === 1 ? 'location' : 'locations'}
            </p>
          )}
          {routes.length > 0 && (
            <div className="text-xs text-gray-600 space-y-1">
              {routes.map((route, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-blue-500">🚶</span>
                  <span>{route.distanceFormatted} • {route.durationFormatted}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {markers.length === 0 && routes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-500">
            <p className="text-lg">🗺️</p>
            <p className="mt-2">Start planning to see locations</p>
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
      <div className="p-2 min-w-[200px]">
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
      <div className="p-2 min-w-[200px]">
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