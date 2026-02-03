// frontend/src/components/VenueDetailSheet.tsx

import { useRef, useEffect } from 'react';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';
import type { Venue, InstagramReel } from '../types';

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
            <div className="venue-detail-sheet h-full flex flex-col">
                {/* Back to Chat Button - Always visible at top */}
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 font-medium hover:text-blue-700"
                >
                    ← Back to Chat
                </button>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Hero Image */}
                    {venue.photoUrl && (
                        <div className="relative h-48 w-full overflow-hidden">
                            <img
                                src={venue.photoUrl}
                                alt={venue.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            {stopNumber && (
                                <div className="absolute top-3 left-3 w-8 h-8 bg-red-500 text-white text-sm font-bold rounded-full flex items-center justify-center shadow-lg">
                                    {stopNumber}
                                </div>
                            )}
                        </div>
                    )}

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
                        <div className="flex gap-3 pt-2 pb-4">
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
