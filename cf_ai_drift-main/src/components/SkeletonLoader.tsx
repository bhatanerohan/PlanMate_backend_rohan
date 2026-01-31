"use client";

export const SkeletonLoader = () => {
    return (
        <div className="flex-1 overflow-y-auto px-8 pb-12 pt-4 scroll-smooth custom-scrollbar bg-gradient-to-b from-white to-slate-50/50">
            {/* Simulate Header */}
            <div className="mt-8 mb-6 flex items-center gap-5 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-slate-200"></div>
                <div className="flex-1">
                    <div className="h-6 bg-slate-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                </div>
            </div>

            {/* Simulate Items */}
            <div className="flex flex-col gap-8 relative">
                <div className="absolute left-[21px] top-8 bottom-8 w-[2px] bg-slate-100 -z-10"></div>

                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-6 animate-pulse">
                        <div className="shrink-0 w-11 h-11 rounded-full bg-slate-200 border border-white"></div>
                        <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                            <div className="h-5 bg-slate-200 rounded w-3/4 mb-3"></div>
                            <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                            <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Simulate Day 2 Header */}
            <div className="mt-12 mb-6 flex items-center gap-5 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-slate-200"></div>
                <div className="flex-1">
                    <div className="h-6 bg-slate-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                </div>
            </div>
        </div>
    );
};
