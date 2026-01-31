// frontend/src/components/ChatInterface.tsx - ENHANCED VERSION

import { useState, forwardRef, useImperativeHandle } from 'react';
import { useMutation } from '@tanstack/react-query';
import { planApi } from '../services/api';
import MessageList from './MessageList';
import type { GeoPreferenceMode, Message, MapMarker, Venue, Event, Route, Location } from '../types';

interface CurrentItinerary {
  venues: Venue[];
  originalPrompt: string;
  mode: 'route' | 'discovery';
  timestamp: number;
  userLocationIndex?: number;
  hasUserLocation?: boolean;
  alternativesMap?: Record<string, Venue[]>;
}

interface ChatInterfaceProps {
  messages: Message[];
  onNewPlan: (message: Message, markers: MapMarker[], routes?: Route[], isRouteQuery?: boolean, isModification?: boolean) => void;
  onMarkerSelect: (markerId: string) => void;
  userLocation?: Location | null;
  onLocationChange?: (loc: Location) => void;
  currentItinerary?: CurrentItinerary | null;
  onClearItinerary?: () => void;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function isUserLocationInVenues(
  userLocation: Location,
  venues: Venue[]
): { isIncluded: boolean; matchedVenue?: Venue } {
  for (const venue of venues) {
    const distance = calculateDistance(
      venue.location.lat,
      venue.location.lng,
      userLocation.lat,
      userLocation.lng
    );

    if (distance < 0.2) {
      console.log(`   ✅ Distance match: "${venue.name}" is ${(distance * 1000).toFixed(0)}m from user location`);
      return { isIncluded: true, matchedVenue: venue };
    }

    const latDiff = Math.abs(venue.location.lat - userLocation.lat);
    const lngDiff = Math.abs(venue.location.lng - userLocation.lng);

    if (latDiff < 0.001 && lngDiff < 0.001) {
      console.log(`   ✅ Coordinate precision match: "${venue.name}"`);
      return { isIncluded: true, matchedVenue: venue };
    }
  }

  return { isIncluded: false };
}

const ChatInterface = forwardRef(({
  messages,
  onNewPlan,
  onMarkerSelect,
  userLocation,
  currentItinerary,
  onClearItinerary
}: ChatInterfaceProps, ref) => {
  const [input, setInput] = useState('');
  const [geoPreference, setGeoPreference] = useState<GeoPreferenceMode>('auto');

  const planMutation = useMutation({
    mutationFn: (vars: {
      prompt: string;
      userLocation?: Location | null;
      currentItinerary?: CurrentItinerary | null;
      geoPreference?: GeoPreferenceMode;
    }) =>
      planApi.createPlan(
        vars.prompt,
        vars.userLocation || undefined,
        vars.currentItinerary || undefined,
        vars.geoPreference
      ),
    onSuccess: (data, variables) => {
      if (!data.venues) {
        console.error('❌ Response missing venues array');
        data.venues = [];
      }
      if (!data.events) {
        console.error('❌ Response missing events array');
        data.events = [];
      }

      const isModification = data.queryType === 'itinerary_modification' || data.isModification;

      const agentMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: data.result || 'I found some results for you!',
        timestamp: Date.now(),
        data: {
          venues: data.venues,
          events: data.events,
          alternativesMap: data.alternativesMap || {},
        },
      };

      const isRouteQuery = isModification ? true : (data.mode === 'route');

      let markers: MapMarker[] = [];

      if (isModification) {
        console.log('🔄 Modification: Creating markers from returned venues');

        const primaryVenuesByPlaceId = new Map<string, { venue: Venue; stopNumber: number }>();
        data.venues.forEach((venue: Venue, idx: number) => {
          if (venue.placeId !== 'user-location') {
            primaryVenuesByPlaceId.set(venue.placeId, { venue, stopNumber: idx + 1 });
          }
        });

        markers = data.venues.map((venue: Venue, idx: number) => ({
          id: venue.placeId === 'user-location' ? 'user-location' : `primary-${idx}`,
          position: {
            lat: venue.location.lat,
            lng: venue.location.lng,
          },
          title: venue.name,
          type: 'venue' as const,
          data: venue,
          metadata: {
            isPrimary: true,
            stopNumber: venue.placeId === 'user-location' ? undefined : idx + 1
          }
        }));

        console.log(`   Created ${markers.length} primary markers after modification`);

        // Add markers for ALTERNATIVE venues
        if (data.alternativesMap && Object.keys(data.alternativesMap).length > 0) {
          console.log('🔍 Adding alternative venue markers for modification...');

          let altCount = 0;
          Object.entries(data.alternativesMap).forEach(([primaryPlaceId, alternatives]) => {
            const primaryInfo = primaryVenuesByPlaceId.get(primaryPlaceId);

            (alternatives as Venue[]).forEach((altVenue: Venue) => {
              markers.push({
                id: `alternative-${altCount}`,
                position: {
                  lat: altVenue.location.lat,
                  lng: altVenue.location.lng,
                },
                title: altVenue.name,
                type: 'venue' as const,
                data: altVenue,
                metadata: {
                  isPrimary: false,
                  isAlternative: true,
                  primaryPlaceId: primaryPlaceId,
                  primaryVenueName: primaryInfo?.venue.name,
                  primaryStopNumber: primaryInfo?.stopNumber
                }
              });
              altCount++;
            });
          });

          console.log(`   Created ${altCount} alternative markers`);
        }
      }
      // 🆕 FIX: Check isRouteQuery FIRST before falling to discovery mode
      else if (isRouteQuery) {
        console.log('🗺️ Route mode: Creating primary markers for route');

        // Build venue lookup map
        const venuesByPlaceId = new Map<string, Venue>();
        data.venues.forEach((venue: Venue) => {
          venuesByPlaceId.set(venue.placeId, venue);
        });

        // Check if backend provided selected_venue_ids for ordering
        const backendSelectedVenues = data.state?.finishParameters?.selected_venue_ids;
        console.log('🔍 Debug routing:', {
          hasState: !!data.state,
          hasFinishParams: !!data.state?.finishParameters,
          backendSelectedVenues,
          venuesFromData: data.venues?.map((v: Venue) => v.name)
        });
        if (backendSelectedVenues && backendSelectedVenues.length > 0) {
          // Use backend ordering
          console.log('   Using backend selected_venue_ids for ordering');
          let primaryStopNumber = 1;
          backendSelectedVenues.forEach((placeId: string) => {
            if (placeId === 'user-location') {
              const userVenue = venuesByPlaceId.get(placeId);
              if (userVenue?.location?.lat && userVenue?.location?.lng) {
                markers.push({
                  id: 'user-location',
                  position: {
                    lat: userVenue.location.lat,
                    lng: userVenue.location.lng,
                  },
                  title: userVenue.name,
                  type: 'venue' as const,
                  data: userVenue,
                  metadata: { isPrimary: true }
                });
              }
              return;
            }

            const venue = venuesByPlaceId.get(placeId);
            if (venue) {
              markers.push({
                id: `primary-${markers.length}`,
                position: {
                  lat: venue.location.lat,
                  lng: venue.location.lng,
                },
                title: venue.name,
                type: 'venue' as const,
                data: venue,
                metadata: {
                  isPrimary: true,
                  stopNumber: primaryStopNumber++
                }
              });
            }
          });
        } else {
          // 🆕 Use venues array directly (Gemini Grounding mode)
          console.log('   Using venues array directly for route markers');
          console.log('📦 Venues received in order:', data.venues.map((v: Venue) => v.name));  // ADD THIS

          markers = data.venues.map((venue: Venue, idx: number) => ({
            id: venue.placeId === 'user-location' ? 'user-location' : `primary-${idx}`,
            position: {
              lat: venue.location.lat,
              lng: venue.location.lng,
            },
            title: venue.name,
            type: 'venue' as const,
            data: venue,
            metadata: {
              isPrimary: true,
              stopNumber: venue.placeId === 'user-location' ? undefined : idx + 1
            }
          }));
        }

        console.log(`   Created ${markers.length} primary markers`);

        // Add markers for ALTERNATIVE venues
        if (data.alternativesMap && Object.keys(data.alternativesMap).length > 0) {
          console.log('🔍 Adding alternative venue markers...');

          let altCount = 0;
          Object.entries(data.alternativesMap).forEach(([primaryPlaceId, alternatives]) => {
            const primaryVenue = venuesByPlaceId.get(primaryPlaceId);
            const primaryMarker = markers.find(m =>
              m.metadata?.isPrimary && (m.data as Venue).placeId === primaryPlaceId
            );

            (alternatives as Venue[]).forEach((altVenue: Venue) => {
              markers.push({
                id: `alternative-${altCount}`,
                position: {
                  lat: altVenue.location.lat,
                  lng: altVenue.location.lng,
                },
                title: altVenue.name,
                type: 'venue' as const,
                data: altVenue,
                metadata: {
                  isPrimary: false,
                  isAlternative: true,
                  primaryPlaceId: primaryPlaceId,
                  primaryVenueName: primaryVenue?.name,
                  primaryStopNumber: primaryMarker?.metadata?.stopNumber
                }
              });
              altCount++;
            });
          });

          console.log(`   Created ${altCount} alternative markers`);
        }
      }
      else {
        // Discovery mode (non-route queries)
        console.log('🔍 Discovery mode: Creating markers from all results');

        const primaryVenuesByPlaceId = new Map<string, Venue>();
        data.venues.forEach((venue: Venue) => {
          if (venue.placeId) primaryVenuesByPlaceId.set(venue.placeId, venue);
        });

        const primaryMarkers = data.venues.map((venue: Venue, idx: number) => ({
          id: `venue-${idx}`,
          position: {
            lat: venue.location.lat,
            lng: venue.location.lng,
          },
          title: venue.name,
          type: 'venue' as const,
          data: venue,
        }));

        markers = [
          ...primaryMarkers,
          ...data.events.map((event: Event, idx: number) => ({
            id: `event-${idx}`,
            position: {
              lat: event.venue.location?.lat || 0,
              lng: event.venue.location?.lng || 0,
            },
            title: event.name,
            type: 'event' as const,
            data: event,
          })),
        ];

        if (data.alternativesMap && Object.keys(data.alternativesMap).length > 0) {
          console.log('Discovery mode: Adding alternative venue markers...');
          let altCount = 0;
          Object.entries(data.alternativesMap).forEach(([primaryPlaceId, alternatives]) => {
            const primaryVenue = primaryVenuesByPlaceId.get(primaryPlaceId);
            (alternatives as Venue[]).forEach((altVenue: Venue) => {
              markers.push({
                id: `alternative-${altCount}`,
                position: {
                  lat: altVenue.location.lat,
                  lng: altVenue.location.lng,
                },
                title: altVenue.name,
                type: 'venue' as const,
                data: altVenue,
                metadata: {
                  isPrimary: false,
                  isAlternative: true,
                  primaryPlaceId: primaryPlaceId,
                  primaryVenueName: primaryVenue?.name
                }
              });
              altCount++;
            });
          });
          console.log(`   Created ${altCount} alternative markers`);
        }
      }

      // Handle user location marker for route queries
      if (!isModification && isRouteQuery) {
        const originalPrompt = variables.prompt.toLowerCase();
        const mentionsUserLocation = /(my location|here|me|current location|where i am)/i.test(originalPrompt);

        const userLocationMarkerExists = markers.some(m => m.id === 'user-location');

        if (mentionsUserLocation && userLocation &&
          Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng) &&
          !userLocationMarkerExists) {

          const userMarker: MapMarker = {
            id: 'user-location',
            position: { lat: userLocation.lat, lng: userLocation.lng },
            title: userLocation.name || 'Your Location',
            type: 'venue',
            data: {
              name: userLocation.name || 'Your Location',
              address: 'Current location',
              location: {
                lat: userLocation.lat,
                lng: userLocation.lng,
                coordinates: `${userLocation.lat},${userLocation.lng}`
              },
              placeId: 'user-location'
            } as unknown as Venue
          };

          if (originalPrompt.includes('from my location') || originalPrompt.includes('from me')) {
            markers.unshift(userMarker);
          } else {
            markers.push(userMarker);
          }
        }
      }

      const routes: Route[] = [];

      console.log(`✅ Total markers created: ${markers.length}, primary: ${markers.filter(m => m.id.startsWith('primary-')).length}`);
      onNewPlan(agentMessage, markers, routes, isRouteQuery, isModification);
      // onNewPlan(agentMessage, markers, routes, isRouteQuery, isModification);
    },
    onError: (error: any) => {
      let errorMessage = 'Something went wrong. Please try again.';

      if (error.response?.data?.error === 'not_relevant') {
        errorMessage = error.response.data.message ||
          "I can only help with location-based queries like finding venues, planning routes, or discovering events.";
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      const errorMessageObj: Message = {
        id: Date.now().toString(),
        type: 'system',
        content: `❌ ${errorMessage}`,
        timestamp: Date.now(),
      };
      onNewPlan(errorMessageObj, [], []);
    },
  });

  const submitCommand = (command: string) => {
    if (!command.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: command,
      timestamp: Date.now(),
    };

    onNewPlan(userMessage, [], []);

    const wantsMyLocation = /\bmy location\b|\bfrom my location\b|\bfrom me\b|\bhere\b/i.test(command);

    const sendRequest = (loc?: Location | undefined) => {
      const locationToSend = loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
        ? loc
        : (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng) ? userLocation : undefined);

      planMutation.mutate({
        prompt: command,
        userLocation: locationToSend,
        currentItinerary: currentItinerary || undefined,
        geoPreference
      });
    };

    if (wantsMyLocation && (!userLocation || !Number.isFinite(userLocation.lat) || !Number.isFinite(userLocation.lng))) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const loc: Location = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Current location' };
          sendRequest(loc);
        }, (err) => {
          console.warn('Geolocation failed, proceeding without user location', err);
          sendRequest(undefined);
        });
        return;
      }
    }

    sendRequest();
  };

  useImperativeHandle(ref, () => ({
    submitCommand
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    submitCommand(input);
    setInput('');
  };

  const examplePrompts = [
    "Hit every major museum in DC in one day with lunch breaks",
    "Plan a day out in midtown NYC where I could try out halal food trucks",
    "Plan a day of Formula-1 themed sightseeing in Monaco",
    "a trip to most iconic spots in mumbai",
    "Plan a route from my location to Northeastern University to starbucks near MIT"
  ];

  const modificationPrompts = [
    "add a coffee shop after the first stop",
    "remove the second stop",
    "replace the bar with a cafe",
  ];

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-full">

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-3">
          <MessageList
            messages={messages}
            isLoading={planMutation.isPending}
            onMarkerSelect={onMarkerSelect}
            currentItinerary={currentItinerary}
          />
        </div>

        <div className="p-3 border-t border-gray-200 bg-white sticky bottom-0 z-10 safe-area-bottom">
          {messages.length === 1 && (
            <div className="mb-2">
              <details className="sm:hidden">
                <summary className="text-xs text-gray-500">Try example prompts</summary>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(currentItinerary ? modificationPrompts : examplePrompts).map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleExampleClick(prompt)}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </details>

              <div className="hidden sm:flex flex-wrap gap-2">
                {(currentItinerary ? modificationPrompts : examplePrompts).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(prompt)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2 text-xs text-gray-600">
            <span>Coverage</span>
            <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setGeoPreference('auto')}
                disabled={planMutation.isPending}
                aria-pressed={geoPreference === 'auto'}
                title="Auto"
                className={`flex items-center gap-1 px-2 py-1 text-xs ${geoPreference === 'auto'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M9 2h2l.6 2.1a6.9 6.9 0 0 1 2 .8L15.7 4l1.4 1.4-1 1.1c.3.6.6 1.3.8 2L19 9v2l-2.1.6a6.9 6.9 0 0 1-.8 2l1.1 1.1-1.4 1.4-1.1-1a6.9 6.9 0 0 1-2 .8L11 18h-2l-.6-2.1a6.9 6.9 0 0 1-2-.8l-1.1 1-1.4-1.4 1-1.1a6.9 6.9 0 0 1-.8-2L1 11V9l2.1-.6a6.9 6.9 0 0 1 .8-2L2.8 5.3 4.2 3.9l1.1 1a6.9 6.9 0 0 1 2-.8L9 2zm1 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                </svg>
                Auto
              </button>
              <button
                type="button"
                onClick={() => setGeoPreference('walkable')}
                disabled={planMutation.isPending}
                aria-pressed={geoPreference === 'walkable'}
                title="Walkable"
                className={`flex items-center gap-1 px-2 py-1 text-xs border-l border-gray-200 ${geoPreference === 'walkable'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm5.5 5.5-3 1.5-1.2 2.3 1.7 1.7-1.5 4h-2l1.3-3.3-2-2 .8-2.7L9 7l3-1.5 1.5 2zM14 12l2 6h-2l-1.2-3.5L11 13l3-1z" />
                </svg>
                Walkable
              </button>
              <button
                type="button"
                onClick={() => setGeoPreference('spread')}
                disabled={planMutation.isPending}
                aria-pressed={geoPreference === 'spread'}
                title="Spread out"
                className={`flex items-center gap-1 px-2 py-1 text-xs border-l border-gray-200 ${geoPreference === 'spread'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 2l3 7H7l3-7zm6 8v2l-7 3v-2l5-2-5-2V7l7 3zm-12-3v2l5 2-5 2v2l7-3v-2l-7-3z" />
                </svg>
                Spread
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={currentItinerary ? "Modify your itinerary..." : "What would you like to do?"}
              disabled={planMutation.isPending}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || planMutation.isPending}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {planMutation.isPending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;
