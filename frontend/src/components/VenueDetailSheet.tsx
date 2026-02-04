// frontend/src/components/VenueDetailSheet.tsx

import { useRef, useEffect, useState } from 'react';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';
import type { Venue, InstagramReel } from '../types';

// Image Gallery Component with thumbnails below
const ImageGallery = ({
    images,
    venueName,
    stopNumber
}: {
    images: string[];
    venueName: string;
    stopNumber?: number;
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    return (
        <div className="w-full">
            {/* Main Image */}
            <div className="relative h-52 w-full overflow-hidden bg-gray-100">
                <img
                    src={images[currentIndex]}
                    alt={`${venueName} - Image ${currentIndex + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-300"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />

                {/* Stop Number Badge */}
                {stopNumber && (
                    <div className="absolute top-3 left-3 w-8 h-8 bg-red-500 text-white text-sm font-bold rounded-full flex items-center justify-center shadow-lg">
                        {stopNumber}
                    </div>
                )}

                {/* Image Counter */}
                {images.length > 1 && (
                    <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                        {currentIndex + 1} / {images.length}
                    </div>
                )}
            </div>

            {/* Thumbnail Row - All images with horizontal scroll */}
            {images.length > 1 && (
                <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-white">
                    {images.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${idx === currentIndex
                                ? 'border-blue-500 ring-2 ring-blue-300'
                                : 'border-transparent hover:border-gray-300'
                                }`}
                        >
                            <img
                                src={img}
                                alt={`Thumbnail ${idx + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/56x56?text=...';
                                }}
                            />
                        </button>
                    ))}
                </div>
            )}
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
}

const VenueDetailSheet = ({
    venue,
    onClose,
    onPlayReel,
    onQuickAction,
    isPrimary,
    stopNumber
}: VenueDetailSheetProps) => {
    const sheetRef = useRef<BottomSheetHandle>(null);

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
            <div className="venue-detail-sheet h-full flex flex-col relative">
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Image Gallery with overlapping Back button */}
                    {(() => {
                        const images = venue.photos?.length ? venue.photos : (venue.photoUrl ? [venue.photoUrl] : []);
                        if (images.length === 0) {
                            // No images - show back button at top
                            return (
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-2 px-4 py-3 text-sm text-blue-600 font-medium hover:text-blue-700 bg-white"
                                >
                                    ← Back to Chat
                                </button>
                            );
                        }

                        return (
                            <div className="relative">
                                <ImageGallery images={images} venueName={venue.name} stopNumber={stopNumber} />
                                {/* Back to Chat Button - Overlapping on image */}
                                <button
                                    onClick={onClose}
                                    className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-3 py-1.5 text-sm text-white font-medium bg-black/50 hover:bg-black/70 rounded-full backdrop-blur-sm transition-colors"
                                >
                                    ← Back
                                </button>
                            </div>
                        );
                    })()}

                    {/* Content */}
                    <div className="p-4 space-y-4">
                        {/* Header */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{venue.name}</h2>
                            <p className="text-sm text-gray-500 mt-1">{venue.address}</p>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 text-sm">
                            {venue.rating && (
                                <span className="flex items-center gap-1 font-medium">
                                    ⭐ {venue.rating}
                                </span>
                            )}
                            {venue.priceLevel && (
                                <span className="text-gray-600">{venue.priceLevel}</span>
                            )}
                            {venue.category && (
                                <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                                    {venue.category}
                                </span>
                            )}
                        </div>

                        {/* Description */}
                        {venue.description && (
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {venue.description}
                            </p>
                        )}

                        {/* Instagram Reels Carousel */}
                        {venue.instagramReels && venue.instagramReels.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                    📸 Reels ({venue.instagramReels.length})
                                </h3>
                                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
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

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3 pt-2 pb-4">
                            <div className="flex gap-3">
                                {!isPrimary && (
                                    <button
                                        onClick={handleAddToRoute}
                                        className="flex-1 py-3 px-4 bg-green-500 text-white font-medium rounded-xl hover:bg-green-600 transition-colors"
                                    >
                                        ➕ Add to Route
                                    </button>
                                )}
                                {isPrimary && stopNumber && (
                                    <button
                                        onClick={handleRemoveFromRoute}
                                        className="flex-1 py-3 px-4 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors"
                                    >
                                        ➖ Remove from Route
                                    </button>
                                )}
                            </div>

                            {/* Open in Google Maps Button */}
                            <a
                                href={venue.placeId
                                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}&query_place_id=${venue.placeId}`
                                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.address)}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
                            >
                                🗺️ Open in Google Maps
                            </a>
                        </div>
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
