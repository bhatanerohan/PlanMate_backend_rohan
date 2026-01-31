"use client";
import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { TripHeader } from '@/components/TripHeader';
import { ItineraryList } from '@/components/ItineraryList';
import { MapView } from '@/components/MapView';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ItineraryChat } from '@/components/ItineraryChat';
import { TripPlan } from '@/types/TripPlan';
import { mockTrip } from '@/data/mockTrip';
import { useReelHydrator } from '@/hooks/useReelHydrator';

// Component to handle the reading of search params
function ItineraryContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const destination = searchParams.get('destination');
    const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 3;
    const travelers = searchParams.get('travelers') ? parseInt(searchParams.get('travelers')!) : 2;
    const budget = searchParams.get('budget') ? parseInt(searchParams.get('budget')!) : 2000;
    const startDate = searchParams.get('startDate');
    const isLoadingParam = searchParams.get('loading') === 'true';

    // State
    const [plan, setPlan] = useState<TripPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(isLoadingParam);
    const [contentReady, setContentReady] = useState(!isLoadingParam);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [planningStatus, setPlanningStatus] = useState<string>('Starting...');

    // Ref to prevent double API calls when URL params change
    const hasFetchedRef = useRef(false);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Activate the background worker to fetch Instagram reels
    useReelHydrator(plan, setPlan);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const fetchPlan = async () => {
            // Prevent double fetch (caused by router.replace removing loading param)
            if (hasFetchedRef.current) return;
            hasFetchedRef.current = true;

            if (!destination) {
                // Fallback to mock data if no destination provided or just for demo
                setPlan(mockTrip);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setPlanningStatus('🚀 Starting trip planning...');

                // Step 1: Trigger the workflow
                const triggerRes = await fetch('/api/plan-trip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        destination,
                        days,
                        budget,
                        travelers,
                        startDate,
                        userPrompt: destination,
                    })
                });

                if (!triggerRes.ok) {
                    throw new Error('Failed to start trip planning');
                }

                const triggerData = await triggerRes.json() as { tripId?: string; status?: string; id?: string; days?: unknown[] };

                // Check if we got an immediate response (cached)
                if (triggerData.id && triggerData.days) {
                    // This is a full plan response (from cache)
                    setPlan(triggerData as unknown as TripPlan);
                    setLoading(false);
                    return;
                }

                const { tripId, status } = triggerData;

                if (status !== 'pending') {
                    throw new Error('Unexpected workflow response');
                }

                // Step 2: Start polling for results
                setPlanningStatus('📐 AI Architect is designing your trip...');

                const statusMessages = [
                    '📐 AI Architect is designing your trip...',
                    '🔍 Scouting the best hotels and activities...',
                    '🏨 Comparing Airbnb and Booking.com options...',
                    '🎯 Finding must-see attractions...',
                    '🎨 Curating your perfect itinerary...',
                    '✨ Adding finishing touches...',
                ];
                let messageIndex = 0;

                const pollForResult = async (): Promise<TripPlan | null> => {
                    const pollRes = await fetch(`/api/poll-trip?tripId=${tripId}`);
                    const pollData = await pollRes.json() as { status?: string; plan?: TripPlan };

                    if (pollData.status === 'complete' && pollData.plan) {
                        return pollData.plan;
                    }

                    return null;
                };

                // Poll every 2 seconds
                pollingRef.current = setInterval(async () => {
                    try {
                        // Update status message for visual feedback
                        messageIndex = (messageIndex + 1) % statusMessages.length;
                        setPlanningStatus(statusMessages[messageIndex]);

                        const result = await pollForResult();

                        if (result) {
                            // Stop polling
                            if (pollingRef.current) {
                                clearInterval(pollingRef.current);
                                pollingRef.current = null;
                            }

                            setPlan(result);
                            setLoading(false);
                            setPlanningStatus('✅ Trip planning complete!');
                        }
                    } catch (pollError) {
                        console.error('Polling error:', pollError);
                    }
                }, 2000);

                // Also do an immediate first poll
                const immediateResult = await pollForResult();
                if (immediateResult) {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                    setPlan(immediateResult);
                    setLoading(false);
                    return;
                }

            } catch (err) {
                console.error('Plan fetch error:', err);
                // Fallback to mock for smoother verification if API fails
                setPlan(mockTrip);
                setLoading(false);
            }
        };

        fetchPlan();
    }, [destination, days, budget, travelers, startDate]);

    // Handle transition from loading overlay to content
    useEffect(() => {
        if (!loading && plan && showLoadingOverlay) {
            // Data is ready, add a small delay for minimum loading animation time
            const timer = setTimeout(() => {
                setShowLoadingOverlay(false);
                setContentReady(true); // Trigger content animation immediately when overlay starts exiting
                // Remove loading param from URL for cleaner state
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.delete('loading');
                router.replace(`/itinerary?${newParams.toString()}`, { scroll: false });
            }, 1500); // Minimum 1.5s of loading overlay for good UX

            return () => clearTimeout(timer);
        }
    }, [loading, plan, showLoadingOverlay, searchParams, router]);

    const handleMarkerClick = (id: string) => {
        const element = document.getElementById(`item-${id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHoveredItemId(id);
            setTimeout(() => setHoveredItemId(null), 2000);
        }
    };

    // Chat Panel Handlers
    const toggleChat = () => {
        setIsChatOpen(prev => !prev);
    };

    const closeChat = () => {
        setIsChatOpen(false);
    };

    // Helper to persist plan changes to KV (fire-and-forget)
    const persistPlanToKV = (updatedPlan: TripPlan) => {
        // Only persist if we have a valid trip ID
        if (!updatedPlan.id) return;

        fetch('/api/update-trip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tripId: updatedPlan.id,
                newPlan: updatedPlan,
            }),
        }).catch((err) => {
            console.error('Failed to persist plan change:', err);
        });
    };

    const handleDeleteItem = (dayId: string, itemId: string) => {
        setPlan(prev => {
            if (!prev) return null;

            // Deep copy and filter out the item
            const newDays = prev.days.map(day => {
                if (day.id === dayId) {
                    return {
                        ...day,
                        items: day.items.filter(item => item.id !== itemId)
                    };
                }
                return day;
            });

            // Recalculate total budget
            const newTotalBudget = newDays.reduce((total, day) => {
                return total + day.items.reduce((dayTotal, item) => dayTotal + (item.price || 0), 0);
            }, 0);

            const updatedPlan = {
                ...prev,
                days: newDays,
                totalBudget: newTotalBudget
            };

            // Fire-and-forget persistence to KV
            persistPlanToKV(updatedPlan);

            return updatedPlan;
        });
    };

    // Show skeleton if still loading data (for direct navigation without loading param)
    if (loading && !isLoadingParam) {
        return (
            <div className="bg-background-light font-display h-screen flex overflow-hidden text-text-primary">
                <aside className="w-full max-w-[640px] flex flex-col h-full border-r border-border-light bg-white shadow-2xl z-20 relative">
                    <div className="p-6 border-b border-border-light animate-pulse">
                        <div className="h-8 bg-slate-200 rounded w-1/2 mb-4"></div>
                        <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="mb-6 animate-pulse">
                                <div className="h-6 bg-slate-200 rounded w-1/4 mb-4"></div>
                                <div className="h-24 bg-slate-100 rounded-xl"></div>
                            </div>
                        ))}
                    </div>
                </aside>
                <main className="flex-1 bg-slate-50 relative hidden md:block">
                    <div className="w-full h-full flex items-center justify-center text-slate-400 gap-2">
                        <span className="material-symbols-outlined animate-spin">autorenew</span>
                        <span>Planning your trip...</span>
                    </div>
                </main>
            </div>
        );
    }

    if (!plan && !loading) return <div>Error loading plan.</div>;

    return (
        <div className="bg-background-light font-display h-screen flex overflow-hidden text-text-primary antialiased selection:bg-primary/20 selection:text-primary relative">
            {/* Loading Overlay with Curtain Reveal animation */}
            <AnimatePresence>
                {showLoadingOverlay && <LoadingOverlay />}
            </AnimatePresence>

            {/* Main Content - always rendered but covered by overlay during loading */}
            <motion.aside
                className="w-full max-w-[640px] flex flex-col h-full border-r border-border-light bg-white shadow-2xl z-20 relative"
                initial={isLoadingParam ? { scale: 0.98, opacity: 0 } : { scale: 1, opacity: 1 }}
                animate={contentReady ? { scale: 1, opacity: 1 } : { scale: 0.98, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
                {plan && <TripHeader plan={plan} isEditing={isEditing} onToggleEdit={toggleChat} />}
                {plan && <ItineraryList plan={plan} onHover={setHoveredItemId} isEditing={isEditing} onDeleteItem={handleDeleteItem} />}
            </motion.aside>
            <motion.main
                className="flex-1 bg-slate-50 relative hidden md:block"
                initial={isLoadingParam ? { scale: 0.98, opacity: 0 } : { scale: 1, opacity: 1 }}
                animate={contentReady ? { scale: 1, opacity: 1 } : { scale: 0.98, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background-light to-transparent z-10 pointer-events-none"></div>
                {plan && (
                    <MapView
                        plan={plan}
                        hoveredItemId={hoveredItemId}
                        onMarkerClick={handleMarkerClick}
                    />
                )}
            </motion.main>

            {/* Itinerary AI Chat Panel */}
            {plan && (
                <ItineraryChat
                    isOpen={isChatOpen}
                    onClose={closeChat}
                    destination={plan.destination}
                />
            )}
        </div>
    );
}

export default function ItineraryPage() {
    return (
        <Suspense fallback={<LoadingScreen isVisible={true} />}>
            <ItineraryContent />
        </Suspense>
    );
}
