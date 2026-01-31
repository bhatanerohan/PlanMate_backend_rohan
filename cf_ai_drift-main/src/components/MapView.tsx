"use client";
import dynamic from 'next/dynamic';
import { TripPlan, TripItem } from '@/types/TripPlan';
import { useState, useCallback, useEffect } from 'react';

const MapComponent = dynamic(() => import('./MapComponent'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-100/50">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 font-medium text-sm">Loading map...</p>
            </div>
        </div>
    )
});

export const MapView = ({ plan, hoveredItemId, onMarkerClick }: {
    plan: TripPlan;
    hoveredItemId: string | null;
    onMarkerClick: (id: string) => void;
}) => {
    const [selectedItem, setSelectedItem] = useState<TripItem | null>(null);

    // Handle marker click - always select item to trigger map zoom
    const handleMarkerClick = useCallback((id: string) => {
        onMarkerClick(id); // Notify parent

        const item = plan.days.flatMap(d => d.items).find(i => i.id === id);
        // ALWAYS select the item to trigger MapUpdater (Zoom/FlyTo)
        // The visual Reel rendering will be handled by the Marker component itself.
        if (item) {
            setSelectedItem(item);
        }
    }, [plan.days, onMarkerClick]);

    // Auto-select when hovering any item from the itinerary
    useEffect(() => {
        if (hoveredItemId) {
            const item = plan.days.flatMap(d => d.items).find(i => i.id === hoveredItemId);
            if (item) {
                setSelectedItem(item);
            }
        }
    }, [hoveredItemId, plan.days]);

    const handleCloseSelection = useCallback(() => {
        setSelectedItem(null);
    }, []);

    return (
        <div className="absolute inset-0 z-0">
            <MapComponent
                plan={plan}
                hoveredItemId={hoveredItemId}
                selectedItem={selectedItem}
                onMarkerClick={handleMarkerClick}
                onCloseSelection={handleCloseSelection}
            />
        </div>
    );
};

