"use client";
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from '@/lib/SidebarContext';

const navItems = [
    { href: '/', icon: 'explore', label: 'Explore' },
    { href: '/trips', icon: 'luggage', label: 'My Trips' },
    { href: '#', icon: 'bookmark', label: 'Saved' },
    { href: '#', icon: 'settings', label: 'Settings' },
];

export function Sidebar() {
    const { isOpen, close } = useSidebar();
    const pathname = usePathname();

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, close]);

    // Determine active nav item
    const isActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname?.startsWith(href);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px]"
                        onClick={close}
                    />

                    {/* Drawer Panel */}
                    <motion.div
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative flex w-full max-w-[280px] flex-col bg-white shadow-2xl"
                    >
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
                                        onClick={close}
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
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
