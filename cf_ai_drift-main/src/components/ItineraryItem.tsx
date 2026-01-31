import { TripItem } from "@/types/TripPlan";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ItineraryItemProps {
    item: TripItem;
    onHover?: (id: string | null) => void;
    isEditing?: boolean;
    onDelete?: () => void;
}

export const ItineraryItem = ({ item, onHover, isEditing, onDelete }: ItineraryItemProps) => {
    const [imgError, setImgError] = useState(false);

    // Reset error state when image URL changes
    useEffect(() => {
        setImgError(false);
    }, [item.imageUrl]);
    const iconMap: Record<string, string> = {
        flight: "flight_land",
        train: "train", // or directions_railway
        hotel: "hotel",
        activity: "local_activity",
        food: "restaurant",
        museum: "museum", // material symbol might be distinct
    };

    const getIcon = (type: string) => iconMap[type] || "place";

    // Different layouts based on type or just a generic one?
    // The HTML has distinct layouts for Flight, Train, Hotel, Activity.
    // I will try to support them or make a versatile card.
    // For simplicity and robustness, I will make a generic card that adapts.

    const getProviderStyle = (provider?: string) => {
        if (!provider) return {
            bg: "bg-primary hover:bg-primary-hover shadow-primary/25 hover:shadow-primary/40",
            text: "Book Now"
        };
        const p = provider.toLowerCase();
        if (p.includes("airbnb")) return {
            bg: "bg-[#FF5A5F] hover:bg-[#FF5A5F]/90 shadow-[#FF5A5F]/25 hover:shadow-[#FF5A5F]/40",
            text: "View on Airbnb"
        };
        if (p.includes("booking.com")) return {
            bg: "bg-[#003580] hover:bg-[#003580]/90 shadow-[#003580]/25 hover:shadow-[#003580]/40",
            text: "View on Booking.com"
        };
        if (p.includes("viator")) return {
            bg: "bg-[#00a680] hover:bg-[#00a680]/90 shadow-[#00a680]/25 hover:shadow-[#00a680]/40",
            text: "View on Viator"
        };
        if (p.includes("klook")) return {
            bg: "bg-[#FF5722] hover:bg-[#FF5722]/90 shadow-[#FF5722]/25 hover:shadow-[#FF5722]/40",
            text: "View on Klook"
        };
        if (p.includes("headout")) return {
            bg: "bg-[#7c3aed] hover:bg-[#7c3aed]/90 shadow-[#7c3aed]/25 hover:shadow-[#7c3aed]/40",
            text: "View on Headout"
        };
        return {
            bg: "bg-primary hover:bg-primary-hover shadow-primary/25 hover:shadow-primary/40",
            text: "Book Now"
        };
    };

    const providerStyle = getProviderStyle(item.provider);

    return (
        <div
            id={`item-${item.id}`}
            className={`flex gap-6 group ${isEditing ? 'cursor-default' : ''}`}
            onMouseEnter={() => !isEditing && onHover?.(item.id)}
            onMouseLeave={() => !isEditing && onHover?.(null)}
        >
            <div className="shrink-0 w-11 h-11 rounded-full bg-white border border-border-light flex items-center justify-center shadow-card z-10 text-slate-400 group-hover:text-primary group-hover:border-primary/30 transition-colors">
                <span className="material-symbols-outlined text-[20px]">
                    {getIcon(item.type)}
                </span>
            </div>
            <div className={`flex-1 bg-white rounded-2xl shadow-soft overflow-hidden transition-all duration-300 group relative ${isEditing
                    ? 'border-2 border-dashed border-slate-300 hover:border-slate-400'
                    : 'border border-border-light/60 hover:border-primary/30 hover:shadow-float'
                }`}>
                {/* Delete Button - appears when editing */}
                <AnimatePresence>
                    {isEditing && (
                        <motion.button
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete?.();
                            }}
                            className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg z-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-white text-[16px]">remove</span>
                        </motion.button>
                    )}
                </AnimatePresence>

                {item.type === "hotel" ||
                    item.type === "activity" ||
                    item.type === "museum" ? (
                    item.imageUrl && !imgError ? (
                        <div className="flex flex-col sm:flex-row h-full">
                            <div className="w-full sm:w-44 relative h-48 sm:h-auto overflow-hidden">
                                <img
                                    alt={item.name}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    src={item.imageUrl}
                                    onError={() => setImgError(true)}
                                />
                                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-900 shadow-sm border border-white/50">
                                    {item.type === "hotel" ? "Stay" : "Activity"}
                                </div>
                            </div>
                            <div className="flex-1 p-6 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-xl text-slate-900 leading-tight">
                                                {item.name}
                                            </h3>
                                            <div className="flex items-center gap-1.5 mt-1.5 text-sm">
                                                {item.rating && (
                                                    <>
                                                        <span className="flex items-center text-amber-400">
                                                            <span className="material-symbols-outlined text-[18px] fill-current">
                                                                star
                                                            </span>
                                                        </span>
                                                        <span className="font-bold text-slate-700">
                                                            {item.rating}
                                                        </span>
                                                        <span className="text-slate-300">•</span>
                                                    </>
                                                )}
                                                {item.bookingUrl && (
                                                    <a
                                                        className="text-slate-500 hover:text-primary transition-colors font-medium border-b border-slate-300 hover:border-primary pb-0.5"
                                                        href={item.bookingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        See details
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right ml-3">
                                            {item.price > 0 && (
                                                <div title={item.isEstimate ? "Price subject to change on provider site." : undefined} className={item.isEstimate ? "cursor-help" : ""}>
                                                    <span className="block text-xl font-bold text-slate-900">
                                                        {item.currency}
                                                        {item.price}
                                                    </span>
                                                    {item.type === "hotel" && (
                                                        <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                                                            / night
                                                        </span>
                                                    )}
                                                    {(item.type === "activity" || item.type === "museum") && (
                                                        <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                                                            per person
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                                        {item.description}
                                    </p>
                                </div>
                                {item.bookingUrl && (
                                    <div className="mt-5 pt-5 border-t border-slate-100 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                                                {item.provider}
                                            </span>
                                        </div>
                                        <a
                                            href={item.bookingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2 ${providerStyle.bg}`}
                                        >
                                            {providerStyle.text}
                                            <span className="material-symbols-outlined text-[16px]">
                                                arrow_outward
                                            </span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Activity/Museum NO IMAGE
                        <div className="p-6">
                            {/* Similar to Food/Train but simpler */}
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
                                    <p className="text-sm text-slate-500 mt-1 font-medium">{item.description}</p>
                                </div>
                                {item.price > 0 && <div className="text-right bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                                    <span className="block text-sm font-bold text-slate-900">{item.time}</span>
                                </div>}
                            </div>
                        </div>
                    )
                ) : (
                    // FLIGHT / TRAIN / FOOD / GENERIC
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex gap-4 items-start">
                                {item.type === 'train' && (
                                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                                        <span className="material-symbols-outlined text-[26px]">directions_railway</span>
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        {item.name}
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1 font-medium">
                                        {item.description}
                                    </p>
                                    {item.type === 'train' && (
                                        <div className="mt-3 flex items-center gap-3">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
                                                <span className="material-symbols-outlined text-[14px]">chair</span>
                                                {item.metadata?.platform}
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium">{item.metadata?.seat}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                {item.time && (
                                    <div className="bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 mb-2 inline-block">
                                        <span className="block text-sm font-bold text-slate-900">
                                            {item.time}
                                        </span>
                                    </div>
                                )}
                                {item.price > 0 && (
                                    <div className="font-bold text-slate-900 block">{item.currency}{item.price}</div>
                                )}
                            </div>
                        </div>


                    </div>
                )}
            </div>
        </div>
    );
};
