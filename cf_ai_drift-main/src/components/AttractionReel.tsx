'use client';

import { TripItem } from '@/types/TripPlan';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo } from 'react';

interface AttractionReelProps {
    item: TripItem;
    onClose: () => void;
}

export const ReelContent = ({ item, onClose }: AttractionReelProps) => {
    // 1. Construct Media List (Gallery > Video > Image)
    const mediaList = useMemo(() => {
        const list: { type: 'image' | 'video'; url: string }[] = [];

        if (item.gallery && item.gallery.length > 0) {
            return item.gallery;
        }

        if (item.videoUrl) list.push({ type: 'video', url: item.videoUrl });
        if (item.imageUrl) list.push({ type: 'image', url: item.imageUrl });

        // Fallback if empty
        if (list.length === 0) list.push({ type: 'image', url: '' });

        return list;
    }, [item]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const currentMedia = mediaList[currentIndex];
    const DURATION = 5000; // 5 seconds for images

    // 2. Auto-Advance Logic
    useEffect(() => {
        setProgress(0);

        // Don't auto-advance if there's only 1 item
        if (mediaList.length <= 1) return;

        // If Video: Progress is handled by onTimeUpdate
        if (currentMedia.type === 'video') return;

        // If Image: Use Interval
        const startTime = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const nextProgress = (elapsed / DURATION) * 100;

            if (nextProgress >= 100) {
                handleNext();
                clearInterval(timer);
            } else {
                setProgress(nextProgress);
            }
        }, 50);

        return () => clearInterval(timer);
    }, [currentIndex, currentMedia]);

    const handleNext = () => {
        if (currentIndex < mediaList.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onClose(); // Close at end of story
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    // Toggle mute/unmute
    const toggleMute = () => {
        setIsMuted(prev => {
            const newState = !prev;
            if (videoRef.current) {
                videoRef.current.muted = newState;
            }
            return newState;
        });
    };

    // Data for UI
    const userHandle = item.provider === 'Klook' ? 'Klook' : item.provider === 'Headout' ? 'Headout' : 'Drift';

    // Generate random likes for each video in the gallery
    const likesPerVideo = useMemo(() =>
        mediaList.map(() => `${(Math.random() * 8 + 1).toFixed(1)}k`),
        [mediaList]
    );
    const likesCount = likesPerVideo[currentIndex] || '2.4k';

    return (
        <>
            {/* --- TABS / PROGRESS BAR --- */}
            {mediaList.length > 1 && (
                <div className="absolute top-3 left-3 right-3 flex gap-1 z-30">
                    {mediaList.map((_, idx) => (
                        <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-white"
                                initial={{ width: 0 }}
                                animate={{
                                    width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%'
                                }}
                                transition={{ ease: 'linear', duration: idx === currentIndex ? 0 : 0.2 }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* --- MEDIA DISPLAY --- */}
            <div className="absolute inset-0 z-0 bg-black">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full"
                    >
                        {currentMedia.type === 'video' ? (
                            <video
                                ref={videoRef}
                                src={currentMedia.url}
                                className="w-full h-full object-cover"
                                autoPlay
                                muted={isMuted}
                                playsInline
                                onTimeUpdate={(e) => {
                                    const vid = e.currentTarget;
                                    if (vid.duration) {
                                        const p = (vid.currentTime / vid.duration) * 100;
                                        setProgress(p);
                                    }
                                }}
                                onEnded={handleNext}
                            />
                        ) : (
                            <img
                                src={currentMedia.url}
                                alt={item.name}
                                className="w-full h-full object-cover animate-subtle-zoom"
                            />
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />
            </div>

            {/* --- INTERACTION ZONES --- */}
            <div className="absolute inset-0 z-20 flex">
                {/* Prev (Left 20%) */}
                {mediaList.length > 1 && (
                    <div className="w-[20%] h-full" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
                )}

                <div
                    className={`${mediaList.length > 1 ? 'w-[60%]' : 'w-full'} h-full flex items-center justify-center`}
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                >
                    {/* Mute/Unmute Icon Animation */}
                    <AnimatePresence>
                        {isMuted && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                className="bg-black/40 rounded-full p-4 backdrop-blur-sm"
                            >
                                <span className="material-symbols-outlined text-white text-4xl">volume_off</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Next (Right 20%) */}
                {mediaList.length > 1 && (
                    <div className="w-[20%] h-full" onClick={(e) => { e.stopPropagation(); handleNext(); }} />
                )}
            </div>

            {/* --- CONTENT OVERLAY (Z-30 to sit above nav zones if needing interaction, else Z-10) --- */}
            {/* Note: Set pointer-events-none on container, auto on buttons */}
            <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 pt-8">

                {/* Header */}
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                            {userHandle[0]}
                        </div>
                        <span className="text-xs font-medium text-white">{userHandle}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Footer Info */}
                <div className="pointer-events-auto">
                    <div className="flex items-end justify-between mb-2">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-xs text-white/80">
                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                {item.provider}
                            </div>
                            <h3 className="text-xl font-bold text-white leading-tight line-clamp-2 max-w-[80%]">
                                {item.name}
                            </h3>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="material-symbols-outlined text-white text-2xl drop-shadow-md">favorite</span>
                            <span className="text-[10px] text-white font-medium">{likesCount}</span>
                        </div>
                    </div>

                    {/* Book Button */}
                    {item.bookingUrl && (
                        <a
                            href={item.bookingUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-2 w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                            <span>Book from {item.currency}{item.price}</span>
                            <span className="material-symbols-outlined text-sm">arrow_outward</span>
                        </a>
                    )}
                </div>
            </div>
        </>
    );
};
