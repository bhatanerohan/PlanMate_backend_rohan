// frontend/src/components/VenueDetailSheet.tsx

import { useRef, useEffect, useState } from 'react';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';
import type { Venue, InstagramReel } from '../types';

// Swipeable Image Carousel
const ImageGallery = ({
    images,
    venueName,
    stopNumber,
    rating
}: {
    images: string[];
    venueName: string;
    stopNumber?: number;
    rating?: number;
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const width = scrollContainerRef.current.offsetWidth;
        const newIndex = Math.round(scrollLeft / width);
        setCurrentIndex(newIndex);
    };

    return (
        <div className="relative w-full h-56 bg-gray-100">
            {/* Carousel Container */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {images.map((img, idx) => (
                    <div key={idx} className="w-full h-full flex-shrink-0 snap-center relative">
                        <img
                            src={img}
                            alt={`${venueName} - ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                        {/* Gradient overlay for text readibility if needed */}
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                    </div>
                ))}
            </div>

            {/* Stop Number Badge */}
            {stopNumber && (
                <div className="absolute top-3 left-3 w-7 h-7 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md z-10 transition-opacity duration-300">
                    {stopNumber}
                </div>
            )}

            {/* Pagination Dots */}
            {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full">
                    {images.map((_, idx) => (
                        <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white scale-125' : 'bg-white/50'
                                }`}
                        />
                    ))}
                </div>
            )}

            {/* Venue name + rating overlay */}
            <div className="absolute bottom-3 left-3 right-3 z-10 text-white">
                <div className="text-sm font-semibold line-clamp-1 drop-shadow-md">{venueName}</div>
                <div className="text-xs opacity-90 drop-shadow-md">
                    ⭐ {rating !== undefined && rating !== null ? rating : 'N/A'}
                </div>
            </div>
        </div>
    );
};

interface VenueDetailSheetProps {
    venue: Venue;
    onClose: () => void;
    onPlayReel: (reel: InstagramReel, allReels?: InstagramReel[]) => void;
    onQuickAction?: (action: string) => void;
    isPrimary?: boolean;
    stopNumber?: number;
    reelsLoading?: boolean;
    reelsChecked?: boolean;
    onAskVenue?: (venue: Venue) => void;
}

const VenueDetailSheet = ({
    venue,
    onClose,
    onPlayReel,
    onQuickAction,
    isPrimary,
    stopNumber,
    reelsLoading,
    reelsChecked,
    onAskVenue
}: VenueDetailSheetProps) => {
    const sheetRef = useRef<BottomSheetHandle>(null);
    const descriptionText = venue.description || venue.reviewsSummary || venue.reasoning;

    // Close sheet when snapped to very low position
    const handleSnapChange = (snapIndex: number) => {
        if (snapIndex === 0) {
            onClose();
        }
    };

    const handleAddToRoute = () => {
        if (!onQuickAction) return;
        const venueJson = JSON.stringify({
            name: venue.name,
            address: venue.address,
            location: venue.location,
            rating: venue.rating,
            priceLevel: venue.priceLevel,
            placeId: venue.placeId,
            types: venue.types,
            photoUrl: venue.photoUrl,
            description: venue.description,
            photos: venue.photos
        });
        onQuickAction(`add ${venue.name}[VENUE:${venueJson}]`);
        onClose();
    };

    const handleRemoveFromRoute = () => {
        if (!onQuickAction || !stopNumber) return;
        onQuickAction(`remove stop ${stopNumber}`);
        onClose();
    };

    return (
        <BottomSheet
            ref={sheetRef}
            snapPoints={[10, 55, 100]}
            defaultSnapIndex={1}
            onSnapChange={handleSnapChange}
        >
            <div className="venue-detail-sheet h-full flex flex-col relative w-full">
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden w-full">
                    {/* Image Gallery with overlapping Back button */}
                    {(() => {
                        const images = venue.photos?.length ? venue.photos : (venue.photoUrl ? [venue.photoUrl] : []);
                        if (images.length === 0) {
                            return (
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-2 px-4 py-3 text-sm text-blue-600 font-medium hover:text-blue-700 bg-white w-full border-b border-gray-100"
                                >
                                    ← Back to Chat
                                </button>
                            );
                        }

                        return (
                            <div className="relative w-full">
                                <ImageGallery images={images} venueName={venue.name} stopNumber={stopNumber} rating={venue.rating} />
                                <button
                                    onClick={onClose}
                                    className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full backdrop-blur-sm text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })()}

                    {/* Content */}
                    <div className="p-5 space-y-5">
                        {/* Header */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">{venue.name}</h2>
                            <p className="text-sm text-gray-500 mt-1">{venue.address}</p>
                        </div>

                        {/* Validated Buttons Row - Slim & Compact */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Ask Button */}
                            <button
                                onClick={() => onAskVenue?.(venue)}
                                className="col-span-2 flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm active:scale-95"
                            >
                                💬 Ask AI Assistant
                            </button>

                            {/* Google Maps - Slim */}
                            <a
                                href={venue.placeId
                                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}&query_place_id=${venue.placeId}`
                                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.address)}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-2 px-3 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                🗺️ Maps
                            </a>

                            {/* Add/Remove - Slim */}
                            {!isPrimary && (
                                <button
                                    onClick={handleAddToRoute}
                                    className="flex items-center justify-center gap-2 py-2 px-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm active:scale-95"
                                >
                                    ➕ Add
                                </button>
                            )}
                            {isPrimary && stopNumber && (
                                <button
                                    onClick={handleRemoveFromRoute}
                                    className="flex items-center justify-center gap-2 py-2 px-3 bg-red-50 text-red-600 border border-red-100 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors active:scale-95"
                                >
                                    Remove
                                </button>
                            )}
                        </div>

                        {/* Description */}
                        {descriptionText ? (
                            <p className="text-sm text-white leading-relaxed">
                                {descriptionText}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-300 leading-relaxed">
                                No description available.
                            </p>
                        )}

                        {/* Instagram Reels Carousel OR Skeleton */}
                        {reelsLoading ? (
                            <div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 animate-pulse">
                                    Loading Reels...
                                </h3>
                                <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 overflow-hidden no-scrollbar">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="flex-shrink-0 w-28 h-44 bg-gray-100 rounded-xl animate-pulse relative overflow-hidden ring-1 ring-black/5">
                                            <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-white to-gray-100 animate-[shimmer_1.5s_infinite] content-['']" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : venue.instagramReels && venue.instagramReels.length > 0 && (
                            <div className="space-y-3 pt-2">
                                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                    Instagram Reels <span className="text-gray-400 font-normal normal-case">({venue.instagramReels.length})</span>
                                </h3>
                                <div className="flex gap-3 overflow-x-auto pb-4 -mx-5 px-5 snap-x">
                                    {venue.instagramReels.map((reel, idx) => (
                                        <ReelCard
                                            key={reel.id || idx}
                                            reel={reel}
                                            onClick={() => onPlayReel(reel, venue.instagramReels)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* No reels found */}
                        {!reelsLoading && reelsChecked && (!venue.instagramReels || venue.instagramReels.length === 0) && !isPrimary && (
                            <div className="pt-2">
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                    🎬 Add venue to get reels
                                </p>
                            </div>
                        )}

                        {/* Bottom Spacer */}
                        <div className="h-4" />
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
};

// Individual Reel Card with auto-play muted video
const ReelCard = ({
    reel,
    onClick
}: {
    reel: InstagramReel;
    onClick: () => void;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Set up Intersection Observer for auto-play when visible
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        video.play().catch(() => {
                            // Autoplay blocked - that's fine
                        });
                    } else {
                        video.pause();
                        video.currentTime = 0;
                    }
                });
            },
            { threshold: 0.5 }
        );

        observer.observe(video);
        return () => observer.disconnect();
    }, []);

    return (
        <button
            onClick={onClick}
            className="flex-shrink-0 relative w-28 h-44 bg-black rounded-xl overflow-hidden shadow-md group"
        >
            {/* Auto-play muted video preview */}
            <video
                ref={videoRef}
                src={reel.videoUrl}
                poster={reel.thumbnailUrl}
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
            />

            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <span className="text-white text-lg ml-0.5">▶️</span>
                </div>
            </div>

            {/* Username overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="text-[10px] text-white font-medium truncate">
                    @{reel.ownerUsername}
                </div>
            </div>
        </button>
    );
};

export default VenueDetailSheet;
