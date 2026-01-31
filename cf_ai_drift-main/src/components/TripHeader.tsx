"use client";
import { TripPlan } from "@/types/TripPlan";
import { motion } from "framer-motion";
import { useSidebar } from "@/lib/SidebarContext";

interface TripHeaderProps {
    plan: TripPlan;
    isEditing?: boolean;
    onToggleEdit?: () => void;
}

// Format dates to remove year (e.g., "Dec 28 - Jan 2")
const formatDatesWithoutYear = (dateString: string): string => {
    if (!dateString) return '';

    // Handle "DATE to DATE" format
    if (dateString.includes(' to ')) {
        const [startStr, endStr] = dateString.split(' to ');
        const start = new Date(startStr);
        const end = new Date(endStr);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${startFormatted} - ${endFormatted}`;
        }
    }

    // Try to parse as a single date and remove year
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Fallback: try to remove year patterns like ", 2025" or " 2025"
    return dateString.replace(/,?\s*\d{4}/g, '');
};

export const TripHeader = ({ plan, isEditing, onToggleEdit }: TripHeaderProps) => {
    const { toggle } = useSidebar();

    return (
        <header className="shrink-0 px-8 py-7 border-b border-border-light bg-white/70 backdrop-blur-md z-30 sticky top-0">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggle}
                            className="p-1 -ml-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-[28px]">menu</span>
                        </button>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                            Trip to {plan.destination}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                            <span className="material-symbols-outlined text-[16px] text-primary">
                                calendar_today
                            </span>
                            <span>{formatDatesWithoutYear(plan.dates)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                            <span className="material-symbols-outlined text-[16px] text-primary">
                                payments
                            </span>
                            <span>
                                Est. <span className="text-slate-900 font-bold">{plan.currency}{plan.totalBudget.toLocaleString()}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2.5 shrink-0">
                    {/* Edit Itinerary Button */}
                    <motion.button
                        layout
                        onClick={onToggleEdit}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-full transition-all shadow-sm hover:shadow-md group text-primary bg-white border border-primary/20 hover:bg-primary/5 hover:border-primary/40"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">
                            auto_fix_high
                        </span>
                        Edit Itinerary
                    </motion.button>

                    <button className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 rounded-full transition-all text-white shadow-float hover:shadow-lg transform hover:-translate-y-0.5">
                        <span className="material-symbols-outlined text-[18px]">
                            ios_share
                        </span>
                        Share
                    </button>
                </div>
            </div>
            <div className="mt-7 flex gap-3 text-xs font-semibold overflow-x-auto pb-1 no-scrollbar">
                <button className="px-5 py-2 rounded-full bg-slate-900 text-white shadow-md transform hover:scale-105 transition-transform">
                    All Items
                </button>
                <button className="px-5 py-2 rounded-full bg-white border border-border-light text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors shadow-sm">
                    Accommodations
                </button>
                <button className="px-5 py-2 rounded-full bg-white border border-border-light text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors shadow-sm">
                    Activities
                </button>
            </div>
        </header>
    );
};
