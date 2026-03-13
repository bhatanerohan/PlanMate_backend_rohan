import type { AdminDashboardData } from '../types';

interface AnalyticsDashboardPanelProps {
    data: AdminDashboardData | null;
    isLoading: boolean;
    error: string | null;
    currentTripId?: string;
    onRefresh: () => Promise<void> | void;
    onOpenTrip: (tripId: string) => Promise<void>;
}

const numberFormatter = new Intl.NumberFormat();

function formatRelativeTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
        return 'Unknown time';
    }

    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatMetric(value: number, suffix = ''): string {
    return `${numberFormatter.format(value)}${suffix}`;
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        window.prompt('Copy this link:', text);
    }
}

export default function AnalyticsDashboardPanel({
    data,
    isLoading,
    error,
    currentTripId,
    onRefresh,
    onOpenTrip
}: AnalyticsDashboardPanelProps) {
    if (isLoading) {
        return <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-400">Loading dashboard...</div>;
    }

    if (error) {
        return (
            <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-200">
                    <div className="font-semibold">Dashboard unavailable</div>
                    <div className="mt-1 text-rose-200/80">{error}</div>
                    <button
                        type="button"
                        onClick={() => void onRefresh()}
                        className="mt-3 rounded-lg border border-rose-700/60 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-900/40"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-2xl border border-[#17324d] bg-[#0f1b25] p-4 text-sm text-gray-300">
                    No dashboard data yet.
                </div>
            </div>
        );
    }

    const metrics = [
        { label: 'Plans', value: formatMetric(data.summary.totalPlans) },
        { label: 'Sessions', value: formatMetric(data.summary.uniqueSessions) },
        { label: 'Users', value: formatMetric(data.summary.totalUsers) },
        { label: 'Saved Trips', value: formatMetric(data.summary.savedTrips) },
        { label: 'Shared Trips', value: formatMetric(data.summary.sharedTrips) },
        { label: 'Avg Runtime', value: formatMetric(data.summary.avgExecutionTimeMs, ' ms') },
        { label: 'Modifications', value: formatMetric(data.summary.totalModificationCount) },
        { label: 'Reel Click Rate', value: formatMetric(data.summary.reelClickRate, '%') },
        { label: 'Mobile', value: formatMetric(data.summary.mobilePlans) },
        { label: 'Desktop', value: formatMetric(data.summary.desktopPlans) },
        { label: 'Avg Mods / Plan', value: data.summary.avgModificationCount.toFixed(2) },
        { label: 'Reel Interactions', value: formatMetric(data.summary.totalReelInteractions) }
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-4 space-y-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="rounded-2xl border border-[#17324d] bg-[#0f1b25] p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-white">Owner Dashboard</div>
                        <div className="mt-1 text-xs text-gray-400">Visible only to {data.ownerEmail}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void onRefresh()}
                        className="rounded-lg border border-[#2a4d70] px-3 py-2 text-xs font-medium text-gray-200 hover:bg-[#17324d] hover:text-white"
                    >
                        Refresh
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {metrics.map((metric) => (
                        <div key={metric.label} className="rounded-xl border border-[#1a3956] bg-[#0b1720] p-3">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500">{metric.label}</div>
                            <div className="mt-2 text-lg font-semibold text-white">{metric.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-[#17324d] bg-[#0f1b25] p-4">
                    <div className="text-sm font-semibold text-white">Top Prompts</div>
                    <div className="mt-3 space-y-3">
                        {data.topPrompts.length === 0 ? (
                            <div className="text-sm text-gray-400">No prompt analytics yet.</div>
                        ) : (
                            data.topPrompts.map((prompt) => (
                                <div key={`${prompt.prompt}-${prompt.lastSeenAt}`} className="rounded-xl border border-[#1a3956] bg-[#0b1720] p-3">
                                    <div className="line-clamp-2 text-sm text-white">{prompt.prompt}</div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                        <span>{prompt.count} runs</span>
                                        <span>{formatRelativeTime(prompt.lastSeenAt)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className="rounded-2xl border border-[#17324d] bg-[#0f1b25] p-4">
                    <div className="text-sm font-semibold text-white">Recent Activity</div>
                    <div className="mt-3 space-y-3">
                        {data.recentEvents.length === 0 ? (
                            <div className="text-sm text-gray-400">No recent analytics events.</div>
                        ) : (
                            data.recentEvents.map((event) => (
                                <div key={event.id} className="rounded-xl border border-[#1a3956] bg-[#0b1720] p-3">
                                    <div className="line-clamp-2 text-sm text-white">{event.userPrompt || 'Untitled prompt'}</div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                                        <span>{event.deviceType || 'unknown device'}</span>
                                        <span>{event.queryType || 'unknown query'}</span>
                                        <span>{formatMetric(event.totalTimeMs, ' ms')}</span>
                                        <span>{event.modificationCount} edits</span>
                                        <span>{event.reelInteractionCount} reel interactions</span>
                                        {event.clickedReels && <span className="text-emerald-300">reels clicked</span>}
                                    </div>
                                    <div className="mt-2 text-[11px] text-gray-500">{formatRelativeTime(event.timestamp)}</div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-[#17324d] bg-[#0f1b25] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-white">Recent Trips</div>
                        <div className="mt-1 text-xs text-gray-400">Private trip links open directly inside PlanMate when you are signed in.</div>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {data.recentTrips.length === 0 ? (
                        <div className="text-sm text-gray-400">No saved trips yet.</div>
                    ) : (
                        data.recentTrips.map((trip) => {
                            const privateLink = `${window.location.origin}/?trip=${trip.id}`;
                            const isActive = currentTripId === trip.id;

                            return (
                                <div
                                    key={trip.id}
                                    className={`rounded-2xl border p-4 ${
                                        isActive
                                            ? 'border-blue-500 bg-[#122437]'
                                            : 'border-[#1a3956] bg-[#0b1720]'
                                    }`}
                                >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">{trip.title}</div>
                                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
                                                <span>{trip.mode === 'route' ? 'Route' : 'Discovery'}</span>
                                                <span>{trip.venueCount} stops</span>
                                                <span>{trip.sharedCount} shares</span>
                                                <span>{trip.ownerName || trip.ownerEmail || 'Unknown owner'}</span>
                                            </div>
                                            {trip.originalPrompt && (
                                                <div className="mt-2 line-clamp-2 text-xs text-gray-300">{trip.originalPrompt}</div>
                                            )}
                                            <div className="mt-3 break-all text-[11px] text-blue-300">
                                                <a href={privateLink} className="hover:text-blue-200 hover:underline">
                                                    {privateLink}
                                                </a>
                                            </div>
                                            <div className="mt-2 text-[11px] text-gray-500">Updated {formatRelativeTime(trip.updatedAt)}</div>
                                        </div>

                                        <div className="flex shrink-0 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void onOpenTrip(trip.id)}
                                                className="rounded-lg bg-[#17324d] px-3 py-2 text-xs font-medium text-white hover:bg-[#21476a]"
                                            >
                                                Open now
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void copyToClipboard(privateLink)}
                                                className="rounded-lg border border-[#2a4d70] px-3 py-2 text-xs font-medium text-gray-200 hover:bg-[#17324d] hover:text-white"
                                            >
                                                Copy link
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>
        </div>
    );
}
