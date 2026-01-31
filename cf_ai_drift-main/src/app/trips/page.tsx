"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/lib/SidebarContext';

// Mock trip data
const mockTrips = [
    {
        id: '1',
        title: '7 Days in Kyoto',
        destination: 'Kyoto',
        dates: 'Oct 14 - Oct 20, 2025',
        daysAway: '5 days away',
        status: 'confirmed',
        statusLabel: 'Confirmed',
        bookedItems: 12,
        travelers: '2 Adults',
        budget: '$1,450.00',
        image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80',
    },
    {
        id: '2',
        title: 'Romantic Weekend in Paris',
        destination: 'Paris',
        dates: 'Nov 02 - Nov 05, 2025',
        daysAway: null,
        status: 'planning',
        statusLabel: 'Planning',
        bookedItems: 4,
        travelers: '2 Adults',
        budget: '$2,100.00',
        image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80',
    },
    {
        id: '3',
        title: 'Tokyo Art & Museums',
        destination: 'Tokyo',
        dates: 'Dec 10 - Dec 15, 2025',
        daysAway: null,
        status: 'draft',
        statusLabel: 'Draft',
        bookedItems: 0,
        travelers: '1 Person',
        budget: 'TBD',
        image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80',
    },
];

const navItems = [
    { href: '/', icon: 'explore', label: 'Explore' },
    { href: '/trips', icon: 'luggage', label: 'My Trips' },
    { href: '#', icon: 'bookmark', label: 'Saved' },
    { href: '#', icon: 'settings', label: 'Settings' },
];

function PermanentSidebar() {
    const pathname = usePathname();
    const isActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname?.startsWith(href);
    };

    return (
        <aside className="w-[280px] flex-col bg-white border-r border-border-light hidden md:flex shrink-0 z-20 h-full relative shadow-xl">
            {/* Brand Header */}
            <div className="flex items-center gap-3 px-6 py-8">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/30">
                    <span className="material-symbols-outlined text-[20px]">travel_explore</span>
                </div>
                <span className="font-display text-xl font-bold tracking-tight text-slate-900">Drift</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-4">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-all ${active
                                ? 'bg-primary/5 font-bold text-primary shadow-sm ring-1 ring-primary/10'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <span className={`material-symbols-outlined text-[24px] transition-transform ${active ? 'fill-1 text-primary' : 'group-hover:scale-110'
                                }`}>
                                {item.icon}
                            </span>
                            <span className="text-[15px]">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* User Profile */}
            <div className="border-t border-slate-100 p-4">
                <div className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors hover:bg-slate-50">
                    <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            U
                        </div>
                        <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"></div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">User</p>
                        <p className="truncate text-xs font-medium text-slate-500">View Profile</p>
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-slate-400">chevron_right</span>
                </div>
            </div>
        </aside>
    );
}

function TripCard({ trip }: { trip: typeof mockTrips[0] }) {
    const statusColors = {
        confirmed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-100', dot: 'bg-green-500 animate-pulse' },
        planning: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-100', dot: 'bg-amber-500' },
        draft: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' },
    };
    const colors = statusColors[trip.status as keyof typeof statusColors];
    const isDraft = trip.status === 'draft';

    return (
        <div className={`group flex flex-col md:flex-row gap-6 bg-white p-5 rounded-2xl border border-border-light shadow-card hover:shadow-float transition-all duration-300 items-start md:items-center relative overflow-hidden ${isDraft ? 'opacity-80 hover:opacity-100' : ''}`}>
            {/* Left accent bar */}
            <div className={`absolute top-0 left-0 w-1 h-full ${trip.status === 'confirmed' ? 'bg-primary/0 group-hover:bg-primary' : trip.status === 'planning' ? 'bg-primary/0 group-hover:bg-amber-400' : 'bg-primary/0 group-hover:bg-slate-400'} transition-colors duration-300`}></div>

            {/* Image */}
            <div className={`w-full md:w-60 h-48 md:h-40 shrink-0 rounded-xl overflow-hidden relative shadow-inner ${isDraft ? 'grayscale group-hover:grayscale-0 transition-all duration-500' : ''}`}>
                <img
                    alt={trip.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    src={trip.image}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
                <div className={`absolute top-3 left-3 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${colors.text} shadow-sm ${colors.border} border flex items-center gap-1.5`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></div>
                    {trip.statusLabel}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">{trip.title}</h3>
                        <div className="flex items-center gap-2 mt-1.5 text-slate-500 text-sm font-medium">
                            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                            {trip.dates}
                            {trip.daysAway && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-slate-300 mx-1"></span>
                                    <span className="text-primary font-bold bg-primary/5 px-2 py-0.5 rounded-md text-xs">{trip.daysAway}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <button className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-50 transition-colors">
                        <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-4 md:gap-8 p-3.5 bg-slate-50/80 rounded-xl border border-slate-100/80">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center ${isDraft ? 'text-slate-400' : 'text-primary'} shadow-sm`}>
                            <span className="material-symbols-outlined text-[20px]">luggage</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide leading-tight">Booked Items</span>
                            <span className="text-sm font-bold text-slate-900">{trip.bookedItems} items</span>
                        </div>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-200 hidden sm:block"></div>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center ${isDraft ? 'text-slate-400' : 'text-primary'} shadow-sm`}>
                            <span className="material-symbols-outlined text-[20px]">group</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide leading-tight">Travelers</span>
                            <span className="text-sm font-bold text-slate-900">{trip.travelers}</span>
                        </div>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-200 hidden sm:block"></div>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center ${isDraft ? 'text-slate-400' : 'text-primary'} shadow-sm`}>
                            <span className="material-symbols-outlined text-[20px]">payments</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide leading-tight">Total Budget</span>
                            <span className="text-sm font-bold text-slate-900">{trip.budget}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div className="w-full md:w-auto flex justify-end self-end md:self-center">
                <Link
                    href="/itinerary"
                    className={`w-full md:w-auto px-6 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${trip.status === 'confirmed'
                        ? 'btn-primary text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 transform hover:-translate-y-0.5 group-hover:gap-3'
                        : 'bg-white border border-border-light text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 group-hover:border-primary/20'
                        }`}
                >
                    {trip.status === 'draft' ? 'Resume Planning' : 'View Itinerary'}
                    {trip.status === 'confirmed' && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
                </Link>
            </div>
        </div>
    );
}

function MobileHeader() {
    const { toggle } = useSidebar();

    return (
        <div className="md:hidden flex items-center gap-3 px-6 py-4 border-b border-border-light bg-white">
            <button onClick={toggle} className="p-1 -ml-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[28px]">menu</span>
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/30">
                <span className="material-symbols-outlined text-[18px]">travel_explore</span>
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">Drift</span>
        </div>
    );
}

export default function TripsPage() {
    return (
        <div className="bg-background-light font-display h-screen flex overflow-hidden text-text-primary transition-colors duration-200 antialiased selection:bg-primary/20 selection:text-primary">
            {/* Permanent Sidebar (desktop) */}
            <PermanentSidebar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50/50">
                {/* Mobile Header */}
                <MobileHeader />

                {/* Page Header */}
                <header className="px-8 py-6 bg-white border-b border-border-light flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Trips</h1>
                        <p className="text-slate-500 text-sm mt-1 font-medium">Manage all your planned adventures</p>
                    </div>
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 text-sm font-bold rounded-xl shadow-lg shadow-slate-900/10 transition-all transform hover:-translate-y-0.5"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        Create New Trip
                    </Link>
                </header>

                {/* Filters */}
                <div className="px-8 py-4 flex gap-3 border-b border-border-light bg-white/60 backdrop-blur-md sticky top-0 z-10 items-center">
                    <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                        <button className="px-4 py-1.5 rounded-lg bg-white text-slate-900 shadow-sm text-sm font-bold">Upcoming (2)</button>
                        <button className="px-4 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white/50 text-sm font-bold transition-all">Past</button>
                        <button className="px-4 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white/50 text-sm font-bold transition-all">Drafts</button>
                    </div>
                    <div className="w-[1px] h-6 bg-slate-200 mx-2"></div>
                    <button className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors">
                        <span className="material-symbols-outlined text-[18px]">sort</span> Sort by Date
                    </button>
                </div>

                {/* Trip List */}
                <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
                    <div className="max-w-5xl mx-auto flex flex-col gap-5 pb-10">
                        {mockTrips.map((trip) => (
                            <TripCard key={trip.id} trip={trip} />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
