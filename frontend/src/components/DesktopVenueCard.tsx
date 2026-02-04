// frontend/src/components/DesktopVenueCard.tsx

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Venue, InstagramReel } from '../types';

interface DesktopVenueCardProps {
    venue: Venue;
    onClose: () => void;
    onPlayReel?: (reel: InstagramReel, allReels?: InstagramReel[]) => void;
    onQuickAction?: (action: string) => void;
    isPrimary?: boolean;
    stopNumber?: number;
}

// Snap points as percentage of viewport height
const SNAP_COLLAPSED = 25; // ~25% height - just header
const SNAP_HALF = 45;      // ~45% height - details visible
const SNAP_EXPANDED = 75;  // ~75% height - full content with reels

// Auto-play Reel Card Component
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

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        video.play().catch(() => { /* Autoplay blocked */ });
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
            className="flex-shrink-0 relative w-36 h-52 bg-black rounded-xl overflow-hidden shadow-md group"
        >
            <video
                ref={videoRef}
                src={reel.videoUrl}
                poster={reel.thumbnailUrl}
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <span className="text-white text-xl ml-0.5">▶️</span>
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                <div className="text-xs text-white font-medium truncate">
                    @{reel.ownerUsername}
                </div>
            </div>
        </button>
    );
};

const DesktopVenueCard = ({
    venue,
    onClose,
    onPlayReel,
    onQuickAction,
    isPrimary,
    stopNumber
}: DesktopVenueCardProps) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [sheetHeight, setSheetHeight] = useState(SNAP_HALF);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const images = venue.photos?.length ? venue.photos : (venue.photoUrl ? [venue.photoUrl] : []);
    const hasReels = venue.instagramReels && venue.instagramReels.length > 0;

    // Snap to nearest snap point
    const snapToNearest = useCallback((height: number) => {
        const snapPoints = [SNAP_COLLAPSED, SNAP_HALF, SNAP_EXPANDED];
        let nearest = snapPoints[0];
        let minDist = Math.abs(height - snapPoints[0]);

        for (const snap of snapPoints) {
            const dist = Math.abs(height - snap);
            if (dist < minDist) {
                minDist = dist;
                nearest = snap;
            }
        }

        // If dragged very low, close the sheet
        if (height < 15) {
            onClose();
            return;
        }

        setSheetHeight(nearest);
    }, [onClose]);

    const handleDragStart = useCallback((clientY: number) => {
        setIsDragging(true);
        dragStartY.current = clientY;
        dragStartHeight.current = sheetHeight;
    }, [sheetHeight]);

    const handleDragMove = useCallback((clientY: number) => {
        if (!isDragging) return;

        const deltaY = dragStartY.current - clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.max(10, Math.min(85, dragStartHeight.current + deltaPercent));

        setSheetHeight(newHeight);
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        snapToNearest(sheetHeight);
    }, [isDragging, sheetHeight, snapToNearest]);

    // Mouse events
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        handleDragStart(e.clientY);
    };

    // Touch events
    const handleTouchStart = (e: React.TouchEvent) => {
        handleDragStart(e.touches[0].clientY);
    };

    // Global mouse/touch move and end handlers
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
        const handleMouseUp = () => handleDragEnd();
        const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientY);
        const handleTouchEnd = () => handleDragEnd();

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

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



    const formatRatingCount = (count?: number) => {
        if (!count) return '';
        if (count >= 1000) return `(${(count / 1000).toFixed(1)}k)`;
        return `(${count})`;
    };

    const googleMapsUrl = venue.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}&query_place_id=${venue.placeId}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.address)}`;

    return (
        <div
            ref={containerRef}
            className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] overflow-hidden"
            style={{
                height: `${sheetHeight}vh`,
                transition: isDragging ? 'none' : 'height 0.3s ease-out',
                maxHeight: '85vh'
            }}
        >
            {/* Drag Handle */}
            <div
                className="sticky top-0 z-20 bg-white pt-2 pb-3 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
            </div>

            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-2 right-3 z-20 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
                aria-label="Close"
            >
                ✕
            </button>

            {/* Scrollable Content */}
            <div className="overflow-y-auto h-[calc(100%-40px)] px-4 pb-4">
                {/* Main Content Row */}
                <div className="flex gap-4">
                    {/* Image Gallery - Left side with thumbnails below */}
                    {images.length > 0 && (
                        <div className="flex-shrink-0">
                            {/* Main Image - Large */}
                            <div className="relative w-[480px] h-[360px] bg-gray-100 rounded-xl overflow-hidden">
                                <img
                                    src={images[currentImageIndex]}
                                    alt={`${venue.name} - Image ${currentImageIndex + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/480x360?text=No+Image';
                                    }}
                                />

                                {stopNumber && (
                                    <div className="absolute top-4 left-4 w-10 h-10 bg-red-500 text-white text-lg font-bold rounded-full flex items-center justify-center shadow-lg">
                                        {stopNumber}
                                    </div>
                                )}
                            </div>

                            {/* Thumbnail Row - All images with scroll */}
                            {images.length > 1 && (
                                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                                    {images.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentImageIndex(idx)}
                                            className={`w-[72px] h-[72px] rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${idx === currentImageIndex
                                                ? 'border-blue-500 ring-2 ring-blue-300'
                                                : 'border-transparent hover:border-gray-300'
                                                }`}
                                        >
                                            <img
                                                src={img}
                                                alt={`Thumbnail ${idx + 1}`}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/72x72?text=...';
                                                }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Details - Right side */}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate pr-8">
                            {venue.name}
                        </h3>

                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 flex-wrap">
                            {venue.rating && (
                                <span className="flex items-center gap-1">
                                    <span className="text-yellow-500">⭐</span>
                                    <span className="font-medium">{venue.rating}</span>
                                    <span className="text-gray-400">{formatRatingCount(venue.userRatingCount)}</span>
                                </span>
                            )}
                            {venue.category && (
                                <>
                                    <span className="text-gray-300">•</span>
                                    <span>{venue.category}</span>
                                </>
                            )}
                            {venue.priceLevel && (
                                <>
                                    <span className="text-gray-300">•</span>
                                    <span className="text-green-600 font-medium">{venue.priceLevel}</span>
                                </>
                            )}
                        </div>

                        <p className="text-sm text-gray-500 mt-1 truncate">
                            📍 {venue.address}
                        </p>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                ↗ Directions
                            </a>

                            {!isPrimary ? (
                                <button
                                    onClick={handleAddToRoute}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
                                >
                                    ➕ Add
                                </button>
                            ) : stopNumber ? (
                                <button
                                    onClick={handleRemoveFromRoute}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    ➖ Remove
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Description - Full width below */}
                {venue.description && (
                    <p className="text-sm text-gray-600 mt-4 leading-relaxed">
                        {venue.description}
                    </p>
                )}

                {/* Reels Section - Below everything */}
                {hasReels && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            📸 Reels ({venue.instagramReels!.length})
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                            {venue.instagramReels!.map((reel, idx) => (
                                <ReelCard
                                    key={reel.id || idx}
                                    reel={reel}
                                    onClick={() => onPlayReel?.(reel, venue.instagramReels)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DesktopVenueCard;
