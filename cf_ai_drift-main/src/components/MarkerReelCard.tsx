'use client';

import { TripItem } from '@/types/TripPlan';
import { motion, AnimatePresence } from 'framer-motion';
import { ReelContent } from './AttractionReel';

interface MarkerReelCardProps {
    item: TripItem;
    onClose: () => void;
    position: 'left' | 'right';
}

export const MarkerReelCard = ({ item, onClose, position }: MarkerReelCardProps) => {
    return (
        <motion.div
            className={`
                absolute top-1/2 -translate-y-1/2 z-[9999] pointer-events-auto
                ${position === 'right' ? 'left-full ml-4' : 'right-full mr-4'}
            `}
            initial={{ opacity: 0, scale: 0.8, x: position === 'right' ? -20 : 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
                type: 'spring',
                damping: 25,
                stiffness: 350,
            }}
        >
            {/* Connector Arrow */}
            <div
                className={`
                    absolute top-1/2 -translate-y-1/2 w-4 h-4 rotate-45
                    bg-black
                    ${position === 'right' ? '-left-2' : '-right-2'}
                `}
            />

            {/* Card Container */}
            <div
                className="relative w-[280px] bg-black rounded-[32px] overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] transform-gpu"
                style={{ aspectRatio: '9/16' }}
            >
                <ReelContent item={item} onClose={onClose} />
            </div>
        </motion.div>
    );
};
