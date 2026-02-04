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
    const [currentSnapIndex, setCurrentSnapIndex] = useState(defaultSnapIndex);
    const [dragFromHandle, setDragFromHandle] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    const isAtMaxHeight = currentSnapIndex === snapPoints.length - 1;

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        collapse: () => {
            setCurrentHeight(snapPoints[0]);
            setCurrentSnapIndex(0);
            onSnapChange?.(0);
        },
        expand: () => {
            setCurrentHeight(snapPoints[snapPoints.length - 1]);
            setCurrentSnapIndex(snapPoints.length - 1);
            onSnapChange?.(snapPoints.length - 1);
        },
        snapTo: (index: number) => {
            if (index >= 0 && index < snapPoints.length) {
                setCurrentHeight(snapPoints[index]);
                setCurrentSnapIndex(index);
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
        setCurrentSnapIndex(snapIndex);
        onSnapChange?.(snapIndex);
    }, [snapPoints, onSnapChange]);

    // HANDLE touch handlers - allows both up and down
    const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        setDragFromHandle(true);
        startYRef.current = e.touches[0].clientY;
        startHeightRef.current = currentHeight;
    }, [currentHeight]);

    const handleHandleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging || !dragFromHandle) return;

        const deltaY = startYRef.current - e.touches[0].clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.max(
            snapPoints[0],
            Math.min(snapPoints[snapPoints.length - 1], startHeightRef.current + deltaPercent)
        );

        setCurrentHeight(newHeight);
    }, [isDragging, dragFromHandle, snapPoints]);

    const handleHandleTouchEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        setDragFromHandle(false);
        snapToNearest(currentHeight);
    }, [currentHeight, snapToNearest, isDragging]);

    // HANDLE mouse handlers - allows both up and down
    const handleHandleMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        setDragFromHandle(true);
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
            setDragFromHandle(false);
            snapToNearest(currentHeight);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [currentHeight, snapPoints, snapToNearest]);

    // CONTENT touch handlers - only allows UP
    const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
        // If at max height, allow normal scrolling
        if (isAtMaxHeight) {
            return;
        }

        setIsDragging(true);
        setDragFromHandle(false);
        startYRef.current = e.touches[0].clientY;
        startHeightRef.current = currentHeight;
    }, [currentHeight, isAtMaxHeight]);

    const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging || dragFromHandle) return;

        const deltaY = startYRef.current - e.touches[0].clientY;

        // Only allow dragging UP (positive deltaY means dragging up)
        if (deltaY < 0) {
            return; // Ignore downward drag from content
        }

        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.min(
            snapPoints[snapPoints.length - 1],
            startHeightRef.current + deltaPercent
        );

        e.preventDefault();
        setCurrentHeight(newHeight);
    }, [isDragging, dragFromHandle, snapPoints]);

    const handleContentTouchEnd = useCallback(() => {
        if (!isDragging || dragFromHandle) return;
        setIsDragging(false);
        snapToNearest(currentHeight);
    }, [currentHeight, snapToNearest, isDragging, dragFromHandle]);

    // CONTENT mouse handlers - only allows UP
    const handleContentMouseDown = useCallback((e: React.MouseEvent) => {
        if (isAtMaxHeight) {
            return;
        }

        setIsDragging(true);
        setDragFromHandle(false);
        startYRef.current = e.clientY;
        startHeightRef.current = currentHeight;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = startYRef.current - e.clientY;

            // Only allow dragging UP
            if (deltaY < 0) {
                return;
            }

            const deltaPercent = (deltaY / window.innerHeight) * 100;
            const newHeight = Math.min(
                snapPoints[snapPoints.length - 1],
                startHeightRef.current + deltaPercent
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
    }, [currentHeight, snapPoints, snapToNearest, isAtMaxHeight]);

    return (
        <div
            ref={sheetRef}
            className={`bottom-sheet ${isDragging ? 'dragging' : ''}`}
            style={{
                height: `${currentHeight}vh`,
                transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            {/* Drag Handle - allows both up and down */}
            <div
                className="sheet-handle"
                onTouchStart={handleHandleTouchStart}
                onTouchMove={handleHandleTouchMove}
                onTouchEnd={handleHandleTouchEnd}
                onMouseDown={handleHandleMouseDown}
                style={{ cursor: 'grab', touchAction: 'none' }}
            >
                <div className="handle-bar" />
            </div>

            {/* Content - only allows drag UP */}
            <div
                ref={contentRef}
                className="sheet-content"
                style={{
                    overflowY: isAtMaxHeight ? 'auto' : 'hidden',
                    touchAction: isAtMaxHeight ? 'auto' : 'none'
                }}
                onTouchStart={handleContentTouchStart}
                onTouchMove={handleContentTouchMove}
                onTouchEnd={handleContentTouchEnd}
                onMouseDown={handleContentMouseDown}
            >
                {children}
            </div>
        </div>
    );
});

BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;
