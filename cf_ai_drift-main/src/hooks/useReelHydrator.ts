import { useEffect, useRef } from 'react';
import { TripPlan } from '@/types/TripPlan';

export const useReelHydrator = (
    plan: TripPlan | null,
    setPlan: React.Dispatch<React.SetStateAction<TripPlan | null>>
) => {
    const processingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!plan) return;

        // 1. Find items that need hydration
        // Condition: AI said 'hasReel', we have a search term, but NO video yet.
        const itemsToHydrate = plan.days
            .flatMap(d => d.items)
            .filter(item =>
                item.hasReel &&
                item.instagramSearchTerm &&
                !item.videoUrl &&
                !processingRef.current.has(item.id)
            );

        if (itemsToHydrate.length === 0) return;

        // 2. Process one at a time (Queue Logic)
        const processNext = async () => {
            const item = itemsToHydrate[0]; // Take first item
            processingRef.current.add(item.id); // Mark as processing

            try {
                console.log(`🎥 Hydrating Reel for: ${item.name} (${item.instagramSearchTerm})`);

                const res = await fetch('/api/fetch-reels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        slug: item.instagramSearchTerm,
                        isDemo: plan?.isDemo || false
                    })
                });

                const data = await res.json() as {
                    success?: boolean;
                    videoUrl?: string;
                    gallery?: { type: 'image' | 'video'; url: string; thumbnail?: string }[]
                };

                if (data.success && data.videoUrl) {
                    // 3. Update State (This triggers the UI update)
                    setPlan(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            days: prev.days.map(day => ({
                                ...day,
                                items: day.items.map(i => {
                                    if (i.id === item.id) {
                                        return {
                                            ...i,
                                            videoUrl: data.videoUrl,
                                            gallery: data.gallery // Save the full gallery
                                        };
                                    }
                                    return i;
                                })
                            }))
                        };
                    });
                }
            } catch (error) {
                console.error('Failed to hydrate reel:', error);
            } finally {
                // Optional: Wait 2s before processing the next one to avoid rate limits
                // The useEffect will re-run automatically because 'plan' changed (if successful)
                // or we can force a re-check.
            }
        };

        processNext();
    }, [plan, setPlan]); // Re-runs whenever plan updates
};
