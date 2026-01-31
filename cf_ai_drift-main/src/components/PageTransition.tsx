"use client";
import React, { useEffect, useState } from "react";

interface PageTransitionProps {
    isActive: boolean;
    onComplete?: () => void;
    color?: string;
}

export const PageTransition = ({
    isActive,
    onComplete,
    color = "#6366f1",
}: PageTransitionProps) => {
    const [shouldRender, setShouldRender] = useState(false);
    const [position, setPosition] = useState<"offscreen-right" | "center" | "offscreen-left">("offscreen-right");

    useEffect(() => {
        if (isActive) {
            // Step 1: Mount the component off-screen
            setShouldRender(true);
            setPosition("offscreen-right");

            // Step 2: After mount, slide to center
            const slideInTimer = setTimeout(() => {
                setPosition("center");
            }, 50);

            // Step 3: After reaching center, call onComplete and slide out
            const completeTimer = setTimeout(() => {
                if (onComplete) onComplete();
                setPosition("offscreen-left");
            }, 550); // 50ms delay + 500ms animation

            // Step 4: After sliding out, unmount
            const unmountTimer = setTimeout(() => {
                setShouldRender(false);
                setPosition("offscreen-right");
            }, 1100); // 550ms + 500ms exit animation + buffer

            return () => {
                clearTimeout(slideInTimer);
                clearTimeout(completeTimer);
                clearTimeout(unmountTimer);
            };
        }
    }, [isActive]); // Removed onComplete from deps to prevent re-triggering

    if (!shouldRender) return null;

    const getTransform = () => {
        switch (position) {
            case "offscreen-right":
                return "translateX(100%)";
            case "center":
                return "translateX(0%)";
            case "offscreen-left":
                return "translateX(-100%)";
        }
    };

    return (
        <div
            className="fixed inset-0 z-[10000]"
            style={{ overflow: "hidden" }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: color,
                    transform: getTransform(),
                    transition: "transform 500ms ease-in-out",
                }}
            />
        </div>
    );
};
