// frontend/src/components/BottomSheet.tsx

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, type ReactNode } from 'react';

export interface BottomSheetHandle {
    collapse: () => void;
    expand: () => void;
    snapTo: (index: number) => void;
}

interface BottomSheetProps {
    children: ReactNode;
    snapPoints?: number[]; // Percentages of screen height (e.g., [15, 50, 90])
    defaultSnapIndex?: number; // Which snap point to start at
    onSnapChange?: (snapIndex: number) => void;
}

const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(({
    children,
    snapPoints = [15, 50, 90],
    defaultSnapIndex = 1,
    onSnapChange
}, ref) => {
    const [currentHeight, setCurrentHeight] = useState(snapPoints[defaultSnapIndex]);
    const [isDragging, setIsDragging] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        collapse: () => {
            setCurrentHeight(snapPoints[0]);
            onSnapChange?.(0);
        },
        expand: () => {
            setCurrentHeight(snapPoints[snapPoints.length - 1]);
            onSnapChange?.(snapPoints.length - 1);
        },
        snapTo: (index: number) => {
            if (index >= 0 && index < snapPoints.length) {
                setCurrentHeight(snapPoints[index]);
                onSnapChange?.(index);
            }
        }
    }), [snapPoints, onSnapChange]);

    // Find nearest snap point
    const snapToNearest = useCallback((targetHeight: number) => {
        let nearestSnap = snapPoints[0];
        let minDiff = Math.abs(targetHeight - snapPoints[0]);
        let snapIndex = 0;

        snapPoints.forEach((snap, index) => {
            const diff = Math.abs(targetHeight - snap);
            if (diff < minDiff) {
                minDiff = diff;
                nearestSnap = snap;
                snapIndex = index;
            }
        });

        setCurrentHeight(nearestSnap);
        onSnapChange?.(snapIndex);
    }, [snapPoints, onSnapChange]);

    // Touch handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        setIsDragging(true);
        startYRef.current = e.touches[0].clientY;
        startHeightRef.current = currentHeight;
    }, [currentHeight]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;

        const deltaY = startYRef.current - e.touches[0].clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.max(
            snapPoints[0],
            Math.min(snapPoints[snapPoints.length - 1], startHeightRef.current + deltaPercent)
        );

        setCurrentHeight(newHeight);
    }, [isDragging, snapPoints]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
        snapToNearest(currentHeight);
    }, [currentHeight, snapToNearest]);

    // Mouse handlers (for desktop testing)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        setIsDragging(true);
        startYRef.current = e.clientY;
        startHeightRef.current = currentHeight;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = startYRef.current - e.clientY;
            const deltaPercent = (deltaY / window.innerHeight) * 100;
            const newHeight = Math.max(
                snapPoints[0],
                Math.min(snapPoints[snapPoints.length - 1], startHeightRef.current + deltaPercent)
            );
            setCurrentHeight(newHeight);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            snapToNearest(currentHeight);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [currentHeight, snapPoints, snapToNearest]);

    return (
        <div
            ref={sheetRef}
            className={`bottom-sheet ${isDragging ? 'dragging' : ''}`}
            style={{
                height: `${currentHeight}vh`,
                transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            {/* Drag Handle */}
            <div
                className="sheet-handle"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
            >
                <div className="handle-bar" />
            </div>

            {/* Content */}
            <div className="sheet-content">
                {children}
            </div>
        </div>
    );
});

BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;

