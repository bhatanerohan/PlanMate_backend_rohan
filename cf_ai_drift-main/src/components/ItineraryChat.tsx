"use client";
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
    id: string;
    role: 'assistant' | 'user';
    content: string;
}

interface ItineraryChatProps {
    isOpen: boolean;
    onClose: () => void;
    destination?: string;
}

const quickActions = [
    { label: 'Find cheaper hotels', icon: 'hotel' },
    { label: 'Add a food tour', icon: 'restaurant' },
    { label: 'Remove an activity', icon: 'delete' },
];

const initialMessages: Message[] = [
    {
        id: '1',
        role: 'assistant',
        content: "Hello! I'm here to help you perfect your trip. How would you like to tweak your itinerary today?",
    },
    {
        id: '2',
        role: 'assistant',
        content: "I noticed you have a gap on Day 2 afternoon. Would you like some suggestions for local experiences?",
    },
];

export function ItineraryChat({ isOpen, onClose, destination }: ItineraryChatProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [inputValue, setInputValue] = useState('');

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
        };
        setMessages(prev => [...prev, newMessage]);
        setInputValue('');

        // Simulate AI response
        setTimeout(() => {
            const aiResponse: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "I'll help you with that! Let me look into some options...",
            };
            setMessages(prev => [...prev, aiResponse]);
        }, 1000);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px]"
                        onClick={onClose}
                    />

                    {/* Chat Panel */}
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative flex w-full max-w-[400px] flex-col bg-white shadow-2xl rounded-l-3xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/30">
                                    <span className="material-symbols-outlined text-[20px]">auto_fix_high</span>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Itinerary AI</h2>
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                                        <span className="text-xs font-medium text-green-600">Assistant Active</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="flex-shrink-0 mr-2.5">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white">
                                                <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                                            </div>
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${message.role === 'user'
                                                ? 'bg-primary text-white rounded-br-md'
                                                : 'bg-slate-100 text-slate-700 rounded-bl-md'
                                            }`}
                                    >
                                        {message.content}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Quick Actions */}
                        <div className="px-5 py-3 border-t border-slate-100">
                            <div className="flex flex-wrap gap-2">
                                {quickActions.map((action) => (
                                    <button
                                        key={action.label}
                                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors shadow-sm"
                                        onClick={() => {
                                            setInputValue(action.label);
                                        }}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3 bg-white rounded-full border border-slate-200 px-4 py-2 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                <input
                                    type="text"
                                    placeholder="Ask me to change your trip..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!inputValue.trim()}
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[18px]">send</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
