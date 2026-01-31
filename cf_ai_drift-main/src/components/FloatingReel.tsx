"use client";

import { TripItem } from "@/types/TripPlan";
import { motion, AnimatePresence } from "framer-motion";

interface FloatingReelProps {
    item: TripItem;
    onClose: () => void;
    onNavigate?: (direction: 'prev' | 'next') => void;
    allItems?: TripItem[];
    currentIndex?: number;
}

export const FloatingReel = ({
    item,
    onClose,
    onNavigate,
    allItems = [],
    currentIndex = 0
}: FloatingReelProps) => {
    const totalItems = allItems.length || 3;

    // Generate a pseudo-random user handle from the provider
    const userHandle = item.provider === 'Klook'
        ? 'KlookTravel'
        : item.provider === 'Headout'
            ? 'HeadoutExp'
            : 'Drift';

    // Generate a pseudo likes count based on rating
    const likesCount = item.rating
        ? `${(item.rating * 1.2).toFixed(1)}k`
        : '2.4k';

    return (
        <motion.div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-5 w-[260px] z-50"
            initial={{ opacity: 0, x: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
            {/* Arrow pointer to marker */}
            <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 bg-slate-900 rotate-45 border-b border-l border-white/50" />

            {/* Main Reel Card */}
            <div className="relative aspect-[9/16] bg-slate-900 rounded-[24px] overflow-hidden shadow-2xl ring-4 ring-white/50 group">
                {/* Background Image */}
                {item.imageUrl ? (
                    <img
                        alt={item.name}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-[5s] hover:scale-110"
                        src={item.imageUrl}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary-dark flex items-center justify-center">
                        <span className="material-symbols-outlined text-6xl text-white/30">local_activity</span>
                    </div>
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90" />

                {/* Story Progress Bars */}
                <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
                    {Array.from({ length: Math.min(totalItems, 5) }).map((_, i) => (
                        <div
                            key={i}
                            className={`h-0.5 flex-1 rounded-full shadow-sm ${i === currentIndex ? 'bg-white/90' : 'bg-white/30'
                                }`}
                        />
                    ))}
                </div>

                {/* User Info */}
                <div className="absolute top-7 left-4 flex items-center gap-2 z-20">
                    <div className="w-7 h-7 rounded-full border border-white/40 p-[1px] overflow-hidden bg-white/20">
                        <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">{userHandle[0]}</span>
                        </div>
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-md tracking-wide">{userHandle}</span>
                </div>

                {/* Close Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="absolute top-7 right-4 w-7 h-7 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-black/50 transition-colors z-30"
                >
                    <span className="material-symbols-outlined text-white text-[16px]">close</span>
                </button>

                {/* Volume Icon (decorative) */}
                <div className="absolute bottom-28 right-4 w-8 h-8 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <span className="material-symbols-outlined text-white text-[16px]">volume_up</span>
                </div>

                {/* Bottom Content */}
                <div className="absolute bottom-0 left-0 right-0 p-5 pb-6 text-white z-20">
                    <div className="flex items-end justify-between mb-4">
                        <div className="flex-1 pr-2">
                            <h3 className="font-bold text-lg leading-tight mb-1 line-clamp-2">{item.name}</h3>
                            <p className="text-xs text-white/80 font-medium line-clamp-1">
                                {item.description || `Experience this amazing ${item.type} in ${item.provider}`}
                            </p>
                            {item.price > 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md text-sm font-bold">
                                        {item.currency}{item.price}
                                    </span>
                                    {item.rating && (
                                        <span className="flex items-center gap-0.5 text-xs">
                                            <span className="material-symbols-outlined text-amber-400 text-[14px]">star</span>
                                            {item.rating}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                            <button className="hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-2xl text-red-500">favorite</span>
                            </button>
                            <span className="text-[10px] font-bold">{likesCount}</span>
                        </div>
                    </div>

                    {/* CTA Button */}
                    {item.bookingUrl && (
                        <a
                            href={item.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2"
                        >
                            View Details
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </a>
                    )}
                </div>

                {/* Navigation Arrows */}
                {onNavigate && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate('prev'); }}
                            className="absolute inset-y-0 left-0 w-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30"
                        >
                            <div className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 border border-white/10 transition-colors">
                                <span className="material-symbols-outlined text-lg">chevron_left</span>
                            </div>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate('next'); }}
                            className="absolute inset-y-0 right-0 w-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30"
                        >
                            <div className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 border border-white/10 transition-colors">
                                <span className="material-symbols-outlined text-lg">chevron_right</span>
                            </div>
                        </button>
                    </>
                )}
            </div>
        </motion.div>
    );
};
