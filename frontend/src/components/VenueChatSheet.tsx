import { useState, useRef, useEffect } from 'react';
import type { Venue } from '../types';
import { planApi } from '../services/api';

interface NearbyPlace {
    name: string;
    address: string;
    location: { lat: number; lng: number };
    placeId: string;
    type?: string;
}

interface VenueChatSheetProps {
    venue: Venue;
    onClose: () => void;
    onShowPins?: (pins: NearbyPlace[]) => void;
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    sources?: { title: string; url: string }[];
    nearbyPlaces?: NearbyPlace[];
    isError?: boolean;
    retryPrompt?: string;
}


// Snap points as percentage of viewport height
const SNAP_COLLAPSED = 40; // Default view
const SNAP_EXPANDED = 85;  // Max view

export default function VenueChatSheet({ venue, onClose, onShowPins }: VenueChatSheetProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastFailedPromptRef = useRef<string | null>(null);

    // Drag state
    const [sheetHeight, setSheetHeight] = useState(SNAP_COLLAPSED);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);

    // Initial greeting
    useEffect(() => {
        setMessages([
            {
                role: 'model',
                text: `Ask anything about this venue`
            }
        ]);
    }, [venue.name]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input on mount
    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus();
        }, 300);
    }, []);

    // Drag Logic
    const handleDragStart = (clientY: number) => {
        setIsDragging(true);
        dragStartY.current = clientY;
        dragStartHeight.current = sheetHeight;
    };

    const handleDragMove = (clientY: number) => {
        if (!isDragging) return;
        const deltaY = dragStartY.current - clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.max(20, Math.min(95, dragStartHeight.current + deltaPercent));
        setSheetHeight(newHeight);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        // Snap logic
        if (sheetHeight > (SNAP_COLLAPSED + SNAP_EXPANDED) / 2) {
            setSheetHeight(SNAP_EXPANDED);
        } else if (sheetHeight < 25) {
            onClose();
        } else {
            setSheetHeight(SNAP_COLLAPSED);
        }
    };

    // Global drag listeners
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
        const onMouseUp = () => handleDragEnd();
        const onTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientY);
        const onTouchEnd = () => handleDragEnd();

        if (isDragging) {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        }
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };
    }, [isDragging, sheetHeight]);

    const sendPrompt = async (prompt: string) => {
        if (!prompt || isLoading) return;

        setIsLoading(true);

        // Expand sheet on interaction if collapsed
        if (sheetHeight < SNAP_EXPANDED) {
            setSheetHeight(SNAP_EXPANDED);
        }

        setMessages(prev => [...prev, { role: 'user', text: prompt }]);

        const history = messages.map(m => ({
            role: m.role,
            text: m.text
        }));

        try {
            const result = await planApi.venueChat(venue, prompt, history);
            lastFailedPromptRef.current = null;
            setMessages(prev => [
                ...prev,
                {
                    role: 'model',
                    text: result.answer,
                    sources: result.sources,
                    nearbyPlaces: result.nearbyPlaces
                }
            ]);
            // Show pins on map for any nearby places mentioned
            if (result.nearbyPlaces && result.nearbyPlaces.length > 0 && onShowPins) {
                onShowPins(result.nearbyPlaces);
            }
        } catch (err) {
            lastFailedPromptRef.current = prompt;
            setMessages(prev => [
                ...prev,
                {
                    role: 'model',
                    text: 'Sorry, I had trouble checking that for you.',
                    isError: true,
                    retryPrompt: prompt
                }
            ]);
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        await sendPrompt(userMsg);
    };

    const handleRetry = async (retryPrompt?: string) => {
        const promptToRetry = retryPrompt || lastFailedPromptRef.current;
        if (!promptToRetry || isLoading) return;
        await sendPrompt(promptToRetry);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isLoading) {
            handleSend();
        }
    };

    return (
        <div
            className="absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] rounded-t-2xl overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom duration-300 border-t border-gray-100"
            style={{
                height: `${sheetHeight}vh`,
                maxHeight: '95vh',
                transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
        >
            {/* Drag Handle Header */}
            <div
                className="w-full bg-white flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing border-b border-gray-50 flex-shrink-0"
                onMouseDown={(e) => handleDragStart(e.clientY)}
                onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
            >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-2" />

                {/* Header Content */}
                <div className="w-full px-5 flex items-center justify-between pb-2">
                    <div className="flex flex-col select-none">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 line-clamp-1 text-lg">{venue.name}</h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-full tracking-wide">
                                Assistant
                            </span>
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1">
                            Chatting about this {venue.category || 'place'}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                        <div
                            className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                                }`}
                        >
                            {msg.text}
                        </div>

                        {/* Nearby Places Pins */}
                        {msg.nearbyPlaces && msg.nearbyPlaces.length > 0 && (
                            <div className="mt-2 max-w-[85%] space-y-1.5">
                                <button
                                    onClick={() => onShowPins?.(msg.nearbyPlaces!)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm w-full justify-center"
                                >
                                    📍 Show {msg.nearbyPlaces.length} {msg.nearbyPlaces.length === 1 ? 'place' : 'places'} on map
                                </button>
                                <div className="flex flex-wrap gap-1.5">
                                    {msg.nearbyPlaces.map((place, pIdx) => (
                                        <span
                                            key={pIdx}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[10px] text-gray-600"
                                        >
                                            📌 {place.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {msg.isError && msg.retryPrompt && (
                            <button
                                onClick={() => handleRetry(msg.retryPrompt)}
                                className="mt-2 px-3 py-1.5 bg-red-50 border border-red-200 hover:border-red-400 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                                disabled={isLoading}
                            >
                                🔄 Retry
                            </button>
                        )}

                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 max-w-[85%]">
                                {msg.sources.map((source, sIdx) => (
                                    <a
                                        key={sIdx}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-2 py-1 bg-white border border-blue-100 hover:border-blue-300 rounded-lg text-[10px] font-medium text-blue-600 hover:bg-blue-50 transition-colors shadow-sm truncate max-w-full"
                                    >
                                        <span className="shrink-0">🔗</span>
                                        <span className="truncate">{source.title || 'Source'}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading Indicator */}
                {isLoading && (
                    <div className="flex items-start">
                        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                <div className="flex gap-2 relative">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Ask about ${venue.name}...`}
                        disabled={isLoading}
                        className="flex-1 bg-gray-100 text-gray-900 placeholder-gray-500 rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white border border-transparent focus:border-blue-200 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="w-11 h-11 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
                    >
                        {isLoading ? (
                            <svg className="w-5 h-5 animate-spin text-white/80" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
