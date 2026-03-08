import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import planmateIcon from '../assets/planmate_icon.png';
import { planApi } from '../services/api';
import MessageList from './MessageList';
import GoogleLoginButton from './GoogleLoginButton';
import type { AuthUser, Message, MapMarker, Route, Location, Venue, GeoPreferenceMode } from '../types';

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
    onNewPlan: (
        message: Message,
        markers: MapMarker[],
        routes?: Route[],
        isRouteQuery?: boolean,
        isModification?: boolean
    ) => void;
    onMarkerSelect: (markerId: string) => void;
    userLocation: Location | null;
    onLocationChange: (location: Location) => void;
    currentItinerary: CurrentItinerary | null;
    onClearItinerary: () => void;
    onNewChat: () => void;
    onShareTrip: () => void;
    canShare: boolean;
    authUser: AuthUser | null;
    authLoading: boolean;
    authError: string | null;
    googleClientId?: string;
    onGoogleCredential: (credential: string) => void;
    onLogout: () => void;
}

export interface ChatInterfaceHandle {
    submitCommand: (command: string) => void;
}

const stripEmbeddedVenuePayload = (text: string) =>
    text.replace(/\s*\[VENUE:[\s\S]*\]\s*$/, '').trim();

const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(({
    messages,
    onNewPlan,
    onMarkerSelect,
    userLocation,
    // onLocationChange, // unused in this simplified version but part of props
    currentItinerary,
    // onClearItinerary, // unused
    onNewChat,
    onShareTrip,
    canShare,
    authUser,
    authLoading,
    authError,
    googleClientId,
    onGoogleCredential,
    onLogout
}, ref) => {
    const markerHasPlaceId = (marker: MapMarker): marker is MapMarker & { data: Venue } =>
        marker.type === 'venue' && 'placeId' in marker.data;
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [geoPreference, setGeoPreference] = useState<GeoPreferenceMode>('auto');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
        e?.preventDefault();
        const rawPrompt = (overrideInput ?? inputValue).trim();
        const cleanedPrompt = stripEmbeddedVenuePayload(rawPrompt);
        const displayPrompt = cleanedPrompt || rawPrompt;

        if (!rawPrompt || isLoading) return;

        // determine if this is a modification to an existing itinerary
        const isModification = !!currentItinerary && (
            displayPrompt.toLowerCase().includes('change') ||
            displayPrompt.toLowerCase().includes('replace') ||
            displayPrompt.toLowerCase().includes('remove') ||
            displayPrompt.toLowerCase().includes('add') ||
            displayPrompt.toLowerCase().includes('instead')
        );

        // 1. Add User Message
        const userMsg: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: displayPrompt,
            timestamp: Date.now()
        };

        // If modifying, we might not want to clear markers immediately, logic is in App.tsx
        onNewPlan(userMsg, [], undefined, false, isModification);

        setInputValue('');
        setIsLoading(true);

        try {
            // 2. Call API
            const response = await planApi.createPlan(
                rawPrompt,
                userLocation ? {
                    lat: userLocation.lat,
                    lng: userLocation.lng,
                    name: userLocation.name || 'User Location'
                } : undefined,
                currentItinerary || undefined,
                geoPreference
            );

            // 3. Process Response
            const agentMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'agent',
                content: response.result || '',
                data: {
                    venues: response.venues,
                    events: response.events,
                    alternativesMap: response.alternativesMap
                },
                timestamp: Date.now()
            };

            // Convert venues to markers
            const newMarkers: MapMarker[] = response.venues.map((v, i) => ({
                id: `primary-${i}`, // 🆕 FIXED: Must use primary- prefix for routing to work
                position: { lat: v.location.lat, lng: v.location.lng },
                title: v.name,
                type: 'venue',
                data: v,
                metadata: {
                    stopNumber: i + 1,
                    isPrimary: true
                }
            }));

            // 🆕 Add markers for alternatives if they exist
            if (response.alternativesMap) {
                Object.values(response.alternativesMap).forEach((alts: any[]) => {
                    alts.forEach((alt: any) => {
                        // Avoid duplicates if alternative is already a primary stop
                        if (!newMarkers.find(m => markerHasPlaceId(m) && m.data.placeId === alt.placeId)) {
                            newMarkers.push({
                                id: `alternative-${alt.placeId}`,
                                type: 'venue',
                                position: { lat: alt.location.lat, lng: alt.location.lng }, // Ensure consistent structure
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

            // Convert events to markers
            if (response.events) {
                response.events.forEach((evt, i) => {
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

            onNewPlan(
                agentMsg,
                newMarkers,
                response.routes,
                response.mode === 'route',
                isModification
            );

        } catch (error) {
            console.error('Plan failed:', error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'system',
                content: "Sorry, I encountered an issue while creating your plan. Please try again.",
                timestamp: Date.now()
            };
            onNewPlan(errorMsg, [], undefined, false, false);
        } finally {
            setIsLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        submitCommand: (command: string) => {
            handleSubmit(undefined, command);
        }
    }));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0b141a]">
            {/* Header */}
            <div className="p-4 border-b border-[#132f4c] flex justify-between items-center bg-[#081016]">
                <div className="w-full">
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2">
                            <img
                                src={planmateIcon}
                                alt="PlanMate"
                                className="w-6 h-6 rounded-md"
                            />
                            <h1 className="font-bold text-lg text-white tracking-tight">PlanMate</h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onShareTrip}
                                disabled={!canShare}
                                className={`p-2 rounded-full transition-colors ${
                                    canShare
                                        ? 'text-gray-300 hover:text-white hover:bg-[#132f4c]'
                                        : 'text-gray-600 cursor-not-allowed'
                                }`}
                                title={canShare ? 'Share Trip' : 'Create a trip to share'}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 6l-4-4-4 4" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v14" />
                                </svg>
                            </button>
                            <button
                                onClick={onNewChat}
                                className="p-2 text-gray-400 hover:text-white hover:bg-[#132f4c] rounded-full transition-colors"
                                title="New Chat"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-[#17324d] bg-[#0f1b25] px-3 py-3">
                        {authUser ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    {authUser.avatarUrl ? (
                                        <img
                                            src={authUser.avatarUrl}
                                            alt={authUser.name || authUser.email}
                                            className="h-10 w-10 rounded-full border border-[#2a4d70] object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f364d] text-sm font-semibold text-white">
                                            {(authUser.name || authUser.email).slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-white">
                                            {authUser.name || authUser.email}
                                        </div>
                                        <div className="truncate text-xs text-gray-400">
                                            {authUser.email}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={onLogout}
                                    className="rounded-lg border border-[#2a4d70] px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-[#17324d] hover:text-white"
                                >
                                    Log out
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-sm font-semibold text-white">Sign in with Google</div>
                                    <div className="text-xs text-gray-400">
                                        Keep an account identity for shared trips and future saved history.
                                    </div>
                                </div>
                                {authLoading ? (
                                    <div className="text-xs text-gray-400">Checking session...</div>
                                ) : (
                                    <GoogleLoginButton
                                        clientId={googleClientId}
                                        onCredential={onGoogleCredential}
                                        onError={(message) => {
                                            console.warn('Google login UI error:', message);
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        {authError && (
                            <div className="mt-2 text-xs text-rose-300">
                                {authError}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <MessageList
                messages={messages}
                isLoading={isLoading}
                onMarkerSelect={onMarkerSelect}
                currentItinerary={currentItinerary}
            />

            {/* Input Area */}
            <div className="p-4 bg-[#0b141a] border-t border-[#132f4c]">
                {/* Mode Selection */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mode:</span>
                    <div className="flex bg-[#162736] rounded-lg p-1 border border-[#1f364d]">
                        <button
                            onClick={() => setGeoPreference('auto')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${geoPreference === 'auto'
                                ? 'bg-[#1f364d] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-300'
                                }`}
                        >
                            <span>🤖</span>
                            Auto
                        </button>
                        <button
                            onClick={() => setGeoPreference('walkable')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${geoPreference === 'walkable'
                                ? 'bg-[#1f364d] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-300'
                                }`}
                        >
                            <span>🚶</span>
                            Walkable
                        </button>
                        <button
                            onClick={() => setGeoPreference('spread')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${geoPreference === 'spread'
                                ? 'bg-blue-900/40 text-blue-100 border border-blue-800/50 shadow-sm'
                                : 'text-gray-400 hover:text-gray-300'
                                }`}
                        >
                            <span>🌐</span>
                            Coverage
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isLoading ? "Planning..." : "Ask for a plan (e.g. 'Date night in NYC')"}
                        disabled={isLoading}
                        className="w-full bg-[#162736] text-white placeholder-gray-500 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:bg-[#1c3041] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
                    />

                    <button
                        onClick={() => handleSubmit()}
                        disabled={!inputValue.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-30 disabled:hover:bg-primary-600 transition-all shadow-md active:scale-95"
                    >
                        {isLoading ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Helper Hint */}
                {messages.length <= 1 && !isLoading && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {[
                            "Hit every major museum in DC in one day with lunch breaks",
                            "Plan a day out in midtown NYC where I could try out halal food trucks",
                            "Plan a day of Formula-1 themed sightseeing in Monaco",
                            "A trip to most iconic spots in Mumbai",
                            "Plan a route from my location to Northeastern University to starbucks near MIT"
                        ].map((text, i) => (
                            <SuggestionChip
                                key={i}
                                text={text}
                                onClick={() => setInputValue(text)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

const SuggestionChip = ({ text, onClick }: { text: string; onClick: () => void }) => (
    <button
        onClick={onClick}
        className="whitespace-nowrap px-3 py-1.5 bg-[#162736] hover:bg-[#1c3041] border border-[#1f364d] rounded-full text-xs text-gray-300 hover:text-white transition-colors"
    >
        {text}
    </button>
);

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;
