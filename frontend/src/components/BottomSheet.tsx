import { useState, useRef, useCallback, useImperativeHandle, forwardRef, type ReactNode } from 'react';

export interface BottomSheetHandle {
    collapse: () => void;
    expand: () => void;
    snapTo: (index: number) => void;
}

interface BottomSheetProps {
    children: ReactNode;
    snapPoints?: number[];
    defaultSnapIndex?: number;
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
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    const getViewportHeight = useCallback(
        () => window.visualViewport?.height ?? window.innerHeight,
        []
    );

    useImperativeHandle(ref, () => ({
        collapse: () => {
            setCurrentHeight(snapPoints[0]);
            onSnapChange?.(0);
        },
        expand: () => {
            const index = snapPoints.length - 1;
            setCurrentHeight(snapPoints[index]);
            onSnapChange?.(index);
        },
        snapTo: (index: number) => {
            if (index >= 0 && index < snapPoints.length) {
                setCurrentHeight(snapPoints[index]);
                onSnapChange?.(index);
            }
        }
    }), [snapPoints, onSnapChange]);

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

    const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        startYRef.current = e.touches[0].clientY;
        startHeightRef.current = currentHeight;
    }, [currentHeight]);

    const handleHandleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;

        const deltaY = startYRef.current - e.touches[0].clientY;
        const deltaPercent = (deltaY / getViewportHeight()) * 100;
        const newHeight = Math.max(
            snapPoints[0],
            Math.min(snapPoints[snapPoints.length - 1], startHeightRef.current + deltaPercent)
        );

        setCurrentHeight(newHeight);
    }, [isDragging, snapPoints, getViewportHeight]);

    const handleHandleTouchEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        snapToNearest(currentHeight);
    }, [currentHeight, snapToNearest, isDragging]);

    const handleHandleMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        startYRef.current = e.clientY;
        startHeightRef.current = currentHeight;

        const handleMouseMove = (event: MouseEvent) => {
            const deltaY = startYRef.current - event.clientY;
            const deltaPercent = (deltaY / getViewportHeight()) * 100;
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
    }, [currentHeight, snapPoints, snapToNearest, getViewportHeight]);

    return (
        <div
            className={`bottom-sheet ${isDragging ? 'dragging' : ''}`}
            style={{
                height: `calc(var(--app-vh, 1vh) * ${currentHeight})`,
                transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
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

            <div className="sheet-content">
                {children}
            </div>
        </div>
    );
});

BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;
