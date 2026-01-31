'use client';

import { TripItem } from '@/types/TripPlan';
import { motion, AnimatePresence } from 'framer-motion';
import { useMap, useMapEvents } from 'react-leaflet';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ReelContent } from './AttractionReel';

interface MapReelPopupProps {
    item: TripItem | null;
    onClose: () => void;
}

export const MapReelPopup = ({ item, onClose }: MapReelPopupProps) => {
    const map = useMap();
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const requestRef = useRef<number | undefined>(undefined);

    // Calculate screen position from coordinates with 60fps smoothing
    const updatePosition = useCallback(() => {
        if (!item || !item.coordinates) {
            setPosition(null);
            return;
        }
        // Cancel previous frame to avoid stacking updates
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(() => {
            // Get the pixel position of the marker on the screen
            const point = map.latLngToContainerPoint([item.coordinates.lat, item.coordinates.lng]);

            // Offset: Marker is ~50px tall. We want the popup ~40px above the center.
            const yOffset = 40;
            setPosition({ x: point.x, y: point.y - yOffset });
        });
    }, [item, map]);

    // Initial position update
    useEffect(() => {
        updatePosition();
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [updatePosition]);

    // Listen for map events
    useMapEvents({
        dragstart: () => onClose(), // Close if user drags manually
        zoomstart: () => onClose(), // Close if user zooms manually
        move: () => updatePosition(), // CRITICAL: Update position while map flies/pans
        moveend: () => updatePosition() // Ensure perfect final position
    });

    if (!item || !position) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="leaflet-reel-popup absolute w-[280px] aspect-[9/16] rounded-[24px] overflow-hidden shadow-2xl ring-1 ring-white/20 font-sans pointer-events-auto"
                style={{
                    left: 0,
                    top: 0,
                    // Use translate for GPU-accelerated movement
                    transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -100%)`,
                    zIndex: 9999,
                    boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)',
                    background: 'rgba(0,0,0,0.9)',
                    transformOrigin: 'bottom center',
                }}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                    type: 'spring',
                    damping: 25,
                    stiffness: 350,
                }}
            >
                {/* Pointer arrow - rotated square */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black rotate-45" />
                <ReelContent item={item} onClose={onClose} />
            </motion.div>
        </AnimatePresence>
    );
};
