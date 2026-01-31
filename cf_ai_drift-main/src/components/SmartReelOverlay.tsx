"use client";

import { TripItem } from "@/types/TripPlan";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReelContent } from "./AttractionReel";

interface SmartReelOverlayProps {
    item: TripItem;
    anchorPoint: { x: number; y: number } | null;
    onClose: () => void;
}

export const SmartReelOverlay = ({ item, anchorPoint, onClose }: SmartReelOverlayProps) => {
    const [windowWidth, setWindowWidth] = useState(1024); // Default to reasonable desktop width
    const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        console.log('SmartReelOverlay mounted for item:', item.name);
        return () => console.log('SmartReelOverlay unmounted');
    }, [item.name]);

    // Track window size and calculate position
    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };

        // Initial set
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate position when anchorPoint or windowWidth changes
    // Calculate position when anchorPoint or windowWidth changes
    // Calculate position when anchorPoint or windowWidth changes
    useEffect(() => {
        if (!anchorPoint) return;

        const reelWidth = 300;
        const reelHeight = 533; // 9:16 aspect ratio
        const gap = 20;
        const markerRadius = 28; // Half of max marker size (56px)
        const padding = 24; // Edge padding

        console.log('Calculating reel position:', {
            anchorPoint,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
        });

        // Simple logic: Always place to the right of the marker
        // If not enough space, clamp to screen edge with padding
        let left = anchorPoint.x + markerRadius + gap;

        // Check if reel would go off screen
        if (left + reelWidth > window.innerWidth - padding) {
            left = window.innerWidth - reelWidth - padding;
        }

        // Calculate vertical position - center on marker but keep within viewport
        let top = anchorPoint.y - reelHeight / 2;
        top = Math.max(padding, Math.min(top, window.innerHeight - reelHeight - padding));

        const style: React.CSSProperties = {
            position: 'fixed',
            left: `${left}px`,
            top: `${top}px`,
            zIndex: 9999,
        };

        console.log('Final reel position (right of marker):', { style, anchorPoint });
        setPositionStyle(style);
    }, [anchorPoint, windowWidth]);


    if (!anchorPoint || !mounted) return null;

    // Use Portal to escape stacking contexts of parent animations
    // Requires document to be available (client-side only), checked by 'mounted'
    return createPortal(
        <AnimatePresence>
            <motion.div
                className="fixed z-[9999] w-[300px] aspect-[9/16] rounded-[24px] overflow-hidden shadow-2xl ring-1 ring-white/20 font-sans"
                style={{
                    ...positionStyle,
                    boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5)",
                    background: "rgba(0,0,0,0.85)"
                }}
                initial={{ opacity: 0, scale: 0.9, y: "-50%" }} // y: -50% to maintain vertical centering transform
                animate={{ opacity: 1, scale: 1, y: "-50%" }}
                exit={{ opacity: 0, scale: 0.9, y: "-50%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
                {/* Reuse the TikTok card design */}
                <ReelContent item={item} onClose={onClose} />
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};
