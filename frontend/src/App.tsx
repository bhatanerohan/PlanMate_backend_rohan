// frontend/src/App.tsx

import { useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInterface from './components/ChatInterface';
import MapView from './components/MapView';
import BottomSheet, { type BottomSheetHandle } from './components/BottomSheet';
import VenueDetailSheet from './components/VenueDetailSheet';
import VenueChatSheet from './components/VenueChatSheet';
import DesktopVenueCard from './components/DesktopVenueCard';
import { analyticsApi, authApi, planApi, getSessionId } from './services/api';
import type { AuthUser, Message, MapMarker, Route, Location, Venue, InstagramReel, SharedTripPayload } from './types';

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
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [chatWidthPx, setChatWidthPx] = useState(600);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'map'>('chat'); // Unused
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomSheetRef = useRef<BottomSheetHandle>(null);
  const chatInterfaceRef = useRef<any>(null);

  // Mobile venue detail sheet state
  const [selectedVenueForSheet, setSelectedVenueForSheet] = useState<{
    venue: Venue;
    isPrimary: boolean;
    stopNumber?: number;
  } | null>(null);

  // Keep viewport height in sync on mobile browsers with dynamic UI bars
  useEffect(() => {
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-vh', `${viewportHeight * 0.01}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  // Auto-detect location on app load — prompts the browser for permission if not yet granted
  useEffect(() => {
    if (userLocation || !navigator.geolocation) return;

    console.log('🌍 Requesting user location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: Location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: 'Current Location'
        };
        setUserLocation(loc);
        console.log('📍 Auto-detected user location:', loc);
      },
      (err) => {
        console.warn('⚠️ Location request denied or failed:', err.message);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, [userLocation]);

  // Reel player state (lifted to App for proper z-index on mobile)
  const [activeReels, setActiveReels] = useState<InstagramReel[]>([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [touchStartY, setTouchStartY] = useState<number | null>(null); // 🆕 Swipe state

  // Analytics: track which reel and when it was opened
  const reelOpenTimeRef = useRef<number | null>(null);
  const currentReelRef = useRef<InstagramReel | null>(null);

  const handlePlayReel = (reel: InstagramReel, allReels?: InstagramReel[]) => {
    // Store start time and reel info for analytics
    reelOpenTimeRef.current = Date.now();
    currentReelRef.current = reel;

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
    // Calculate watch time and track analytics
    if (reelOpenTimeRef.current && currentReelRef.current) {
      const watchTimeSeconds = Math.round((Date.now() - reelOpenTimeRef.current) / 1000);
      const reel = currentReelRef.current;
      analyticsApi.trackReelClick(reel.id, reel.url, watchTimeSeconds);
    }

    // Reset state
    reelOpenTimeRef.current = null;
    currentReelRef.current = null;
    setActiveReels([]);
    setActiveReelIndex(0);
  };

  // 🆕 Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;

    // Swipe Up -> Next
    if (diff > 50 && activeReelIndex < activeReels.length - 1) {
      handleNextReel();
    }
    // Swipe Down -> Prev
    else if (diff < -50 && activeReelIndex > 0) {
      handlePrevReel();
    }
    setTouchStartY(null);
  };

  const handlePrevReel = () => {
    setActiveReelIndex(prev => (prev > 0 ? prev - 1 : activeReels.length - 1));
  };

  const handleNextReel = () => {
    setActiveReelIndex(prev => (prev < activeReels.length - 1 ? prev + 1 : 0));
  };

  const [reelsLoading, setReelsLoading] = useState(false);
  const [reelsChecked, setReelsChecked] = useState(false); // true once polling finishes (ready/failed/timeout)
  const [venueChatTarget, setVenueChatTarget] = useState<Venue | null>(null); // 🆕 Venue Chat state
  const [tempPins, setTempPins] = useState<{ name: string; address: string; location: { lat: number; lng: number }; placeId: string; type?: string }[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const loadCurrentUser = async () => {
      setAuthLoading(true);
      setAuthError(null);
      const result = await authApi.getCurrentUser();

      if (isCancelled) {
        return;
      }

      if (result.authenticated && result.user) {
        setAuthUser(result.user);
      } else {
        setAuthUser(null);
      }

      setAuthLoading(false);
    };

    loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleGoogleCredential = async (credential: string) => {
    setAuthError(null);
    setAuthLoading(true);

    const result = await authApi.loginWithGoogle(credential);
    if (!result.success || !result.user) {
      setAuthError(result.error || 'Google sign-in failed');
      setAuthLoading(false);
      return;
    }

    setAuthUser(result.user);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    setAuthError(null);
    setAuthLoading(true);

    await authApi.logout();
    window.google?.accounts.id.disableAutoSelect();
    setAuthUser(null);
    setAuthLoading(false);
  };

  const handleAskVenue = (venue: Venue) => {
    setVenueChatTarget(venue);
  };

  const buildMarkersFromPayload = (payload: SharedTripPayload): MapMarker[] => {
    const markerHasPlaceId = (marker: MapMarker): marker is MapMarker & { data: Venue } =>
      marker.type === 'venue' && 'placeId' in marker.data;

    const newMarkers: MapMarker[] = payload.venues.map((v, i) => ({
      id: `primary-${i}`,
      position: { lat: v.location.lat, lng: v.location.lng },
      title: v.name,
      type: 'venue',
      data: v,
      metadata: {
        stopNumber: i + 1,
        isPrimary: true
      }
    }));

    if (payload.alternativesMap) {
      Object.values(payload.alternativesMap).forEach((alts: any[]) => {
        alts.forEach((alt: any) => {
          if (!newMarkers.find(m => markerHasPlaceId(m) && m.data.placeId === alt.placeId)) {
            newMarkers.push({
              id: `alternative-${alt.placeId}`,
              type: 'venue',
              position: { lat: alt.location.lat, lng: alt.location.lng },
              title: alt.name,
              data: alt,
              metadata: {
                isAlternative: true,
                isPrimary: false
              }
            });
          }
        });
      });
    }

    if (payload.events) {
      payload.events.forEach((evt: any, i: number) => {
        if (evt.venue?.location) {
          newMarkers.push({
            id: `event-${i}`,
            position: { lat: evt.venue.location.lat, lng: evt.venue.location.lng },
            title: evt.name,
            type: 'event',
            data: evt
          });
        }
      });
    }

    return newMarkers;
  };

  const applySharedTrip = (payload: SharedTripPayload) => {
    const agentMsg: Message = {
      id: Date.now().toString(),
      type: 'agent',
      content: payload.result || 'Here is your shared trip!',
      data: {
        venues: payload.venues,
        events: payload.events || [],
        alternativesMap: payload.alternativesMap || {}
      },
      timestamp: Date.now()
    };

    setMessages([agentMsg]);
    setMarkers(buildMarkersFromPayload(payload));
    setRoutes(payload.routes || []);
    setIsRouteMode(payload.mode === 'route');
    setSelectedMarkerId(null);
    setVenueChatTarget(null);

    setCurrentItinerary({
      venues: payload.venues,
      originalPrompt: payload.originalPrompt || agentMsg.content,
      mode: payload.mode,
      timestamp: Date.now(),
      alternativesMap: payload.alternativesMap || {}
    });
  };

  const handleShareTrip = async () => {
    if (!currentItinerary || !currentItinerary.venues?.length) return;

    const latestAgent = [...messages].reverse().find(m => m.type === 'agent');
    const payload: SharedTripPayload = {
      result: latestAgent?.content || 'Shared trip from PlanMate',
      mode: currentItinerary.mode,
      venues: (latestAgent?.data?.venues as Venue[]) || currentItinerary.venues,
      events: latestAgent?.data?.events || [],
      routes: routes || [],
      alternativesMap: (latestAgent?.data?.alternativesMap as Record<string, Venue[]>) || currentItinerary.alternativesMap,
      originalPrompt: currentItinerary.originalPrompt
    };

    const response = await planApi.shareTrip(payload);
    if (!response.success || !response.shareId) {
      return;
    }

    const shareUrl = `${window.location.origin}/?share=${response.shareId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    } catch {
      window.prompt('Copy this share link:', shareUrl);
    }
  };

  const handleNewPlan = (
    message: Message,
    newMarkers: MapMarker[],
    newRoutes?: Route[],
    isRouteQuery?: boolean,
    isModification?: boolean
  ) => {
    // 🆕 DEBUG: Log incoming plan data to trace "remove" issues
    console.log('🏗️ handleNewPlan called:', {
      type: message.type,
      venuesCount: message.data?.venues?.length,
      isModification,
      hasAlternatives: !!message.data?.alternativesMap
    });

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

          // 🆕 UX FIX: Remove the modification prompt (user message) so it doesn't linger below the updated plan
          // This creates a seamless "in-place update" feel
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.type === 'user') {
            newMessages.pop();
          }

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
      // 🆕 OPTIMIZATION: Check if we already have reels for these venues
      const existingReelsMap = new Map<string, InstagramReel[]>();
      if (currentItinerary?.venues) {
        currentItinerary.venues.forEach(v => {
          if (v.instagramReels && v.instagramReels.length > 0) {
            existingReelsMap.set(v.placeId, v.instagramReels);
          }
        });
      }

      // Filter out venues that already have reels or are user-location
      const venuesToFetch = message.data.venues.filter((v: Venue) => {
        if (v.placeId === 'user-location') return false;
        return !existingReelsMap.has(v.placeId);
      });

      // Preserve existing reels in the venues object immediately
      const venuesWithPreservedReels = message.data.venues.map((v: Venue) => ({
        ...v,
        instagramReels: existingReelsMap.get(v.placeId) || v.instagramReels
      }));

      // Only poll if there are venues that need reels
      if (venuesToFetch.length > 0) {
        console.log('📸 Starting reels polling for', venuesToFetch.length, 'venues');
        setReelsLoading(true);
        setReelsChecked(false);

        // Poll reels-status endpoint every 3 seconds
        const sid = getSessionId();
        if (sid) {
          let pollCount = 0;
          const maxPolls = 30; // 30 * 3s = 90s timeout

          const pollInterval = setInterval(async () => {
            pollCount++;
            try {
              const result = await planApi.pollReelsStatus(sid);
              console.log(`📸 Reels poll #${pollCount}: status=${result.status}`);

              if (result.status === 'ready' || result.status === 'failed' || result.status === 'not_found' || pollCount >= maxPolls) {
                clearInterval(pollInterval);

                if (result.status === 'ready' && result.reelsMap) {
                  const reelsMap = result.reelsMap;
                  console.log('📸 Reels ready!', Object.keys(reelsMap).filter(k => reelsMap[k]?.length > 0).length, 'venues with reels');

                  // 1. Update Current Itinerary
                  setCurrentItinerary(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      venues: prev.venues.map(v => ({
                        ...v,
                        instagramReels: reelsMap[v.placeId] || v.instagramReels || []
                      }))
                    };
                  });

                  // 2. Update Markers
                  setMarkers(prevMarkers => {
                    return prevMarkers.map(marker => {
                      const venueData = marker.data as Venue;
                      if (venueData.placeId) {
                        return {
                          ...marker,
                          data: {
                            ...venueData,
                            instagramReels: reelsMap[venueData.placeId] || venueData.instagramReels || []
                          }
                        };
                      }
                      return marker;
                    });
                  });

                  // 3. Update active sheet if open
                  setSelectedVenueForSheet(prev => {
                    if (prev) {
                      return {
                        ...prev,
                        venue: {
                          ...prev.venue,
                          instagramReels: reelsMap[prev.venue.placeId] || prev.venue.instagramReels || []
                        }
                      };
                    }
                    return prev;
                  });
                } else {
                  console.warn('📸 Reels polling ended:', result.status === 'failed' ? 'job failed' : pollCount >= maxPolls ? 'timeout' : result.status);
                }

                setReelsLoading(false);
                setReelsChecked(true);
              }
            } catch (err) {
              console.warn('📸 Reels poll error:', err);
              clearInterval(pollInterval);
              setReelsLoading(false);
              setReelsChecked(true);
            }
          }, 3000);
        } else {
          // No session ID — fall back to direct fetch
          console.log('📸 No session ID, falling back to direct fetch');
          const payload = venuesToFetch.map((v: Venue) => ({
            placeId: v.placeId,
            name: v.name,
            address: v.address || ''
          }));
          planApi.fetchReels(payload).then(reelsMap => {
            setCurrentItinerary(prev => {
              if (!prev) return null;
              return { ...prev, venues: prev.venues.map(v => ({ ...v, instagramReels: reelsMap[v.placeId] || v.instagramReels || [] })) };
            });
            setMarkers(prev => prev.map(m => { const vd = m.data as Venue; return vd.placeId ? { ...m, data: { ...vd, instagramReels: reelsMap[vd.placeId] || vd.instagramReels || [] } } : m; }));
            setSelectedVenueForSheet(prev => prev ? { ...prev, venue: { ...prev.venue, instagramReels: reelsMap[prev.venue.placeId] || prev.venue.instagramReels || [] } } : prev);
            setReelsLoading(false);
            setReelsChecked(true);
          }).catch(() => { setReelsLoading(false); setReelsChecked(true); });
        }
      } else {
        console.log('📸 All venues already have reels, skipping fetch.');
        setReelsChecked(true);
      }

      if (isModification) {
        // ... (existing modification specific logic for CurrentItinerary)
        const userLocationStillPresent = venuesWithPreservedReels.some((v: Venue) => v.placeId === 'user-location');
        const newUserLocationIndex = userLocationStillPresent
          ? venuesWithPreservedReels.findIndex((v: Venue) => v.placeId === 'user-location')
          : undefined;

        console.log('🔧 Modification: Updating currentItinerary with alternativesMap:',
          Object.keys(message.data.alternativesMap || {}).length, 'alternatives');

        setCurrentItinerary({
          venues: venuesWithPreservedReels,
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
            venues: venuesWithPreservedReels,
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
    const marker = markers.find(m => m.id === markerId);
    if (marker?.type === 'venue') {
      const venue = marker.data as Venue;
      const isPrimary = marker.metadata?.isPrimary ?? marker.id.startsWith('primary-');
      const stopNumber = marker.metadata?.stopNumber;
      setSelectedVenueForSheet({ venue, isPrimary, stopNumber });
    }
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
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;

    const loadSharedTrip = async () => {
      const response = await planApi.getSharedTrip(shareId);
      if (response.success && response.payload) {
        applySharedTrip(response.payload);
      } else {
        alert('Shared trip not found or expired.');
      }
    };

    loadSharedTrip();
  }, []);

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
  }, [isMobile]);

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
                onShareTrip={handleShareTrip}
                canShare={!!currentItinerary?.venues?.length}
                authUser={authUser}
                authLoading={authLoading}
                authError={authError}
                googleClientId={googleClientId}
                onGoogleCredential={handleGoogleCredential}
                onLogout={handleLogout}
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
            <div className="flex-1 bg-gray-200 min-w-0 min-h-0 overflow-hidden relative">
              <MapView
                markers={markers}
                routes={routes}
                tempPins={tempPins}
                selectedMarkerId={selectedMarkerId}
                onMarkerClick={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                isRouteMode={isRouteMode}
                currentItinerary={currentItinerary}
                onQuickAction={handleQuickAction}
                onPlayReel={handlePlayReel}
                onClearTempPins={() => setTempPins([])}
                onVenueSelect={(venue, isPrimary, stopNumber) => {
                  setSelectedVenueForSheet({ venue, isPrimary, stopNumber });
                }}
              />

              {/* Desktop Venue Card - appears at bottom of map only */}
              {selectedVenueForSheet && (
                <DesktopVenueCard
                  venue={selectedVenueForSheet.venue}
                  isPrimary={selectedVenueForSheet.isPrimary}
                  stopNumber={selectedVenueForSheet.stopNumber}
                  onClose={() => setSelectedVenueForSheet(null)}
                  onPlayReel={handlePlayReel}
                  onQuickAction={handleQuickAction}
                  reelsLoading={reelsLoading}
                  reelsChecked={reelsChecked}
                  onAskVenue={handleAskVenue}
                />
              )}

              {/* Venue Chat Sheet - Scoped to Map Panel on Desktop */}
              {venueChatTarget && (
                <VenueChatSheet
                  venue={venueChatTarget}
                  onClose={() => {
                    setVenueChatTarget(null);
                  }}
                  onShowPins={(pins) => setTempPins(pins)}
                />
              )}
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
                tempPins={tempPins}
                selectedMarkerId={selectedMarkerId}
                onMarkerClick={handleMarkerSelect}
                userLocation={userLocation}
                onLocationChange={handleLocationChange}
                isRouteMode={isRouteMode}
                currentItinerary={currentItinerary}
                onQuickAction={handleQuickAction}
                onPlayReel={handlePlayReel}
                isMobile={true}
                onClearTempPins={() => setTempPins([])}
                onVenueSelect={(venue, isPrimary, stopNumber) => {
                  setSelectedVenueForSheet({ venue, isPrimary, stopNumber });
                }}
              />
            </div>

            {/* Chat in sliding BottomSheet - keep mounted so quick actions work */}
            <div className={selectedVenueForSheet ? 'hidden' : ''}>
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
                  onShareTrip={handleShareTrip}
                  canShare={!!currentItinerary?.venues?.length}
                  authUser={authUser}
                  authLoading={authLoading}
                  authError={authError}
                  googleClientId={googleClientId}
                  onGoogleCredential={handleGoogleCredential}
                  onLogout={handleLogout}
                />
              </BottomSheet>
            </div>

            {/* Venue Detail Sheet - shown when a venue is selected on mobile */}
            {selectedVenueForSheet && (
              <VenueDetailSheet
                venue={selectedVenueForSheet.venue}
                isPrimary={selectedVenueForSheet.isPrimary}
                stopNumber={selectedVenueForSheet.stopNumber}
                onClose={() => setSelectedVenueForSheet(null)}
                onPlayReel={handlePlayReel}
                onQuickAction={handleQuickAction}
                reelsLoading={reelsLoading}
                reelsChecked={reelsChecked}
                onAskVenue={handleAskVenue}
              />
            )}

            {/* Venue Chat Sheet - Scoped to Mobile Layout */}
            {venueChatTarget && (
              <VenueChatSheet
                venue={venueChatTarget}
                onClose={() => {
                  setVenueChatTarget(null);
                }}
                onShowPins={(pins) => setTempPins(pins)}
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

          <div
            className="relative w-full max-w-[350px] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 touch-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Video Player */}
            <video
              key={activeReels[activeReelIndex].id}
              src={activeReels[activeReelIndex].videoUrl}
              poster={activeReels[activeReelIndex].thumbnailUrl}
              className="w-full h-full object-cover pointer-events-none"
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
