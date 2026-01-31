"use client";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import L from "leaflet";
import { TripPlan, TripItem } from "@/types/TripPlan";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkerReelCard } from "./MarkerReelCard";

// Create custom circular icon with thumbnail and portal placeholder
const createCircularIcon = (item: TripItem, isActive: boolean, isHovered: boolean) => {
    const size = isActive ? 56 : isHovered ? 50 : 44;

    const iconMap: Record<string, string> = {
        hotel: 'hotel',
        activity: 'local_activity',
        museum: 'museum',
        food: 'restaurant',
        flight: 'flight',
        train: 'train',
    };

    const icon = iconMap[item.type] || 'place';

    // Color based on type
    const colorMap: Record<string, string> = {
        hotel: 'bg-violet-500',
        activity: 'bg-primary',
        museum: 'bg-amber-500',
        food: 'bg-orange-500',
        flight: 'bg-sky-500',
        train: 'bg-emerald-500',
    };
    const bgColor = colorMap[item.type] || 'bg-slate-500';

    const ringClass = isActive ? 'ring-4 ring-primary/50' : isHovered ? 'ring-2 ring-primary/30' : '';

    // Play badge removed per user request
    const playBadge = '';

    // Include a portal placeholder div for the popup
    // Fallback layering: background color → image (hides on error) → icon
    const html = `
        <div class="relative flex items-center justify-center" style="width: ${size}px; height: ${size}px;">
            ${isActive ? '<div class="absolute inset-0 -m-3 bg-primary/30 rounded-full animate-ping"></div>' : ''}
            
            <div class="relative bg-white rounded-full border-4 border-white shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden ${ringClass}" style="width: ${size}px; height: ${size}px;">
                
                <!-- Layer 1: Solid color background (always visible as fallback) -->
                <div class="absolute inset-0 w-full h-full ${bgColor || 'bg-slate-500'}"></div>
                
                <!-- Layer 2: Image (hides itself on error) -->
                ${item.imageUrl ? `
                <img 
                    src="${item.imageUrl}" 
                    alt="${item.name}" 
                    class="absolute inset-0 w-full h-full object-cover z-10" 
                    onerror="this.style.display='none'" 
                />
                ` : ''}
                
                <!-- Layer 3: Icon (always on top) -->
                <span class="material-symbols-outlined absolute text-white drop-shadow-lg z-20" style="font-size: ${size / 2.2}px;">${icon || 'place'}</span>
            </div>
            
            ${playBadge}
            <div id="reel-portal-${item.id}" class="absolute inset-0 flex items-center justify-center" style="pointer-events: none;"></div>
        </div>
    `;

    return L.divIcon({
        html,
        className: 'custom-marker-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

// Component to sync map view with selected item
function MapUpdater({ selectedId, items }: { selectedId: string | null; items: TripItem[] }) {
    const map = useMap();

    useEffect(() => {
        if (selectedId) {
            const item = items.find(i => i.id === selectedId);
            if (item && item.coordinates) {
                const currentZoom = map.getZoom();
                const targetZoom = Math.max(currentZoom, 14);
                map.flyTo(item.coordinates, targetZoom, { duration: 1.5 });
            }
        }
    }, [selectedId, items, map]);

    return null;
}

// Close popup on drag only (avoid closing on flyTo zoom changes)
function MapInteractionHandler({ onClose }: { onClose: () => void }) {
    useMapEvents({
        dragstart: () => onClose(), // Close when user manually drags
        // zoomstart: () => onClose(), // REMOVED: This was killing the popup during flyTo
        click: () => onClose(), // Close when clicking empty map space
    });
    return null;
}

// Custom marker component with portal-based popup
function ActivityMarker({
    item,
    isActive,
    isHovered,
    onMarkerClick,
    onClose,
    mapCenter,
}: {
    item: TripItem;
    isActive: boolean;
    isHovered: boolean;
    onMarkerClick: (id: string) => void;
    onClose: () => void;
    mapCenter: [number, number];
}) {
    const map = useMap(); // Get map instance for event listeners
    const markerRef = useRef<L.Marker>(null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    // FIX: Lock hover state to false if active to prevent re-renders
    const effectiveHover = isActive ? false : isHovered;

    const icon = useMemo(() =>
        createCircularIcon(item, isActive, effectiveHover),
        [item, isActive, effectiveHover]
    );

    // 2. FIND PORTAL TARGET (With Robust Retry & Event Listeners)
    useEffect(() => {
        if (!isActive) {
            setPortalTarget(null);
            return;
        }

        let attempts = 0;
        const maxAttempts = 60; // Increase to 6 seconds (covers 1.5s flight + rendering lag)
        let timer: NodeJS.Timeout;

        // The check function
        const checkForNode = () => {
            const target = document.getElementById(`reel-portal-${item.id}`);
            if (target) {
                setPortalTarget(target);
                return true; // Found
            }
            return false; // Not found yet
        };

        // Poll logic
        const poll = () => {
            if (checkForNode()) return; // Success, stop polling

            if (attempts < maxAttempts) {
                attempts++;
                timer = setTimeout(poll, 100);
            }
        };

        // Start polling immediately
        poll();

        // SAFETY NET: Check again when map finishes moving/zooming
        // This catches markers that were "culled" (removed from DOM) during the flight
        const onMapMoveEnd = () => checkForNode();

        map.on('moveend', onMapMoveEnd);
        map.on('zoomend', onMapMoveEnd);

        return () => {
            clearTimeout(timer);
            map.off('moveend', onMapMoveEnd);
            map.off('zoomend', onMapMoveEnd);
        };
    }, [isActive, item.id, icon, map]);

    // Determine popup position based on marker longitude relative to center
    const popupPosition: 'left' | 'right' = item.coordinates.lng > mapCenter[1] ? 'left' : 'right';

    return (
        <>
            <Marker
                ref={markerRef}
                position={[item.coordinates.lat, item.coordinates.lng]}
                icon={icon}
                eventHandlers={{
                    click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        console.log('Marker clicked:', item.id);
                        onMarkerClick(item.id);
                    },
                }}
                zIndexOffset={isActive ? 1000 : isHovered ? 500 : 0}
            />
            {/* Render popup via portal into marker's placeholder div */}
            {/* CRITICAL CHECK: Only render the Reel if item.hasReel is true */}
            {isActive && portalTarget && item.hasReel && createPortal(
                <MarkerReelCard
                    item={item}
                    onClose={onClose}
                    position={popupPosition}
                />,
                portalTarget
            )}
        </>
    );
}

// Component to handle map sizing issues
function MapResizer() {
    const map = useMap();

    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 100);

        return () => clearTimeout(timer);
    }, [map]);

    return null;
}

interface MapComponentProps {
    plan: TripPlan;
    hoveredItemId: string | null;
    selectedItem: TripItem | null;
    onMarkerClick: (id: string) => void;
    onCloseSelection: () => void;
}

export default function MapComponent({
    plan,
    hoveredItemId,
    selectedItem,
    onMarkerClick,
    onCloseSelection
}: MapComponentProps) {
    const [mapCenter, setMapCenter] = useState<[number, number]>([35.6762, 139.6503]);

    // Flatten items for easier access - filter out items with invalid coordinates
    const allItems = useMemo(() =>
        plan.days.flatMap(day => day.items).filter(item =>
            item.coordinates &&
            (item.coordinates.lat !== 0 || item.coordinates.lng !== 0)
        ),
        [plan.days]
    );

    const center = allItems.length > 0
        ? [allItems[0].coordinates.lat, allItems[0].coordinates.lng] as [number, number]
        : [35.6762, 139.6503] as [number, number];

    const polylinePositions = allItems.map(item => [item.coordinates.lat, item.coordinates.lng]);

    // Determine which item to fly to (selected takes priority over hovered)
    const flyToId = selectedItem?.id || hoveredItemId;

    // Update mapCenter when selected item changes
    useEffect(() => {
        if (selectedItem) {
            setMapCenter([selectedItem.coordinates.lat, selectedItem.coordinates.lng]);
        }
    }, [selectedItem]);

    return (
        <MapContainer
            center={center as L.LatLngExpression}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapResizer />
            <MapInteractionHandler onClose={onCloseSelection} />

            {allItems.map((item) => (
                <ActivityMarker
                    key={item.id}
                    item={item}
                    isActive={selectedItem?.id === item.id}
                    isHovered={hoveredItemId === item.id}
                    onMarkerClick={onMarkerClick}
                    onClose={onCloseSelection}
                    mapCenter={mapCenter}
                />
            ))}

            {polylinePositions.length > 1 && (
                <Polyline
                    positions={polylinePositions as L.LatLngExpression[]}
                    color="#13a4ec"
                    weight={4}
                    opacity={0.6}
                    dashArray="10, 10"
                />
            )}

            <MapUpdater selectedId={flyToId} items={allItems} />
        </MapContainer>
    );
}

