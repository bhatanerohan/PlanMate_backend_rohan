"use client";
import React from "react";

interface LoadingScreenProps {
    isVisible: boolean;
}

export const LoadingScreen = ({ isVisible }: LoadingScreenProps) => {
    if (!isVisible) return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
            style={{ backgroundColor: "#f8fafc" }}
        >
            {/* Animated Background Blobs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div
                    className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[120px] animate-pulse"
                    style={{ animationDuration: "3s" }}
                />
                <div
                    className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-200/40 rounded-full blur-[120px] animate-pulse"
                    style={{ animationDuration: "3s", animationDelay: "1.5s" }}
                />
                <div className="absolute top-[40%] left-[50%] transform -translate-x-1/2 w-[30%] h-[30%] bg-blue-100/30 rounded-full blur-[100px]" />
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center px-6 animate-fade-in-up">
                {/* Loader Ring */}
                <div className="relative w-32 h-32 flex items-center justify-center mb-10">
                    {/* Ping effects */}
                    <div
                        className="absolute inset-0 bg-indigo-50 rounded-full animate-ping opacity-75"
                        style={{ animationDuration: "2s" }}
                    />
                    <div
                        className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-50"
                        style={{ animationDuration: "2.5s" }}
                    />

                    {/* Spinning border ring */}
                    <div
                        className="absolute inset-2 rounded-full border-[3px] border-indigo-100 border-t-indigo-600 animate-spin"
                        style={{ animationDuration: "1s" }}
                    />

                    {/* Center Icon */}
                    <div className="relative w-20 h-20 bg-white rounded-full shadow-xl flex items-center justify-center z-10">
                        <span
                            className="material-symbols-outlined text-4xl text-indigo-600 animate-pulse"
                            style={{
                                fontVariationSettings: "'FILL' 1, 'wght' 600",
                                backgroundImage: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            auto_awesome
                        </span>
                    </div>

                    {/* Orbiting particles */}
                    <div
                        className="absolute w-full h-full pointer-events-none"
                        style={{ animation: "spin 3s linear infinite" }}
                    >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/50" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1.5 h-1.5 bg-purple-400 rounded-full opacity-70" />
                    </div>
                </div>

                {/* Text */}
                <h2 className="text-3xl md:text-5xl font-display font-bold text-slate-900 mb-4 text-center tracking-tight drop-shadow-sm">
                    Crafting your perfect journey...
                </h2>
                <p className="text-slate-500 text-lg md:text-xl font-medium text-center max-w-lg px-4 leading-relaxed animate-pulse">
                    Our AI is analyzing thousands of routes and stays to plan your
                    adventure.
                </p>

                {/* Bouncing Dots */}
                <div className="mt-12 flex items-center gap-3">
                    <div
                        className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce"
                        style={{ animationDelay: "0s" }}
                    />
                    <div
                        className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                    />
                    <div
                        className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                    />
                </div>
            </div>
        </div>
    );
};
