"use client";
import React, { useState, useEffect, useRef } from "react";
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    isWithinInterval,
    isBefore,
    isAfter,
} from "date-fns";

interface DateRangePickerProps {
    isOpen?: boolean;
    onClose: () => void;
    onRangeSelect?: (range: { startDate: Date | null; endDate: Date | null }) => void;
    onChange?: (start: Date | null, end: Date | null) => void; // Legacy prop support
    endDate?: Date | null; // Legacy prop support
    startDate?: Date | null; // Legacy prop support
    initialStartDate?: Date | null;
    initialEndDate?: Date | null;
}

export const DateRangePicker = ({
    isOpen = true,
    onClose,
    onRangeSelect,
    onChange,
    startDate,
    endDate,
    initialStartDate,
    initialEndDate,
}: DateRangePickerProps) => {
    // Ref for click outside detection
    const containerRef = useRef<HTMLDivElement>(null);

    // Determine initial state from either legacy or new props
    const initStart = initialStartDate || startDate || null;
    const initEnd = initialEndDate || endDate || null;

    // Internal State
    const [viewDate, setViewDate] = useState(new Date());
    const [selectionStart, setSelectionStart] = useState<Date | null>(initStart);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(initEnd);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    // Sync prop changes to state if handled externally
    useEffect(() => {
        if (startDate !== undefined) setSelectionStart(startDate);
        if (endDate !== undefined) setSelectionEnd(endDate);
    }, [startDate, endDate]);

    useEffect(() => {
        if (isOpen) {
            if (initialStartDate) {
                setViewDate(initialStartDate);
                setSelectionStart(initialStartDate);
                setSelectionEnd(initialEndDate || null);
            } else if (startDate) {
                setViewDate(startDate);
            }
        }
    }, [isOpen]);

    // Click outside detection
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Small delay to prevent the same click that opened the picker from closing it
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const nextMonth = () => setViewDate(addMonths(viewDate, 1));
    const prevMonth = () => {
        if (isSameMonth(viewDate, new Date())) return;
        setViewDate(subMonths(viewDate, 1));
    };

    const handleDateClick = (day: Date) => {
        // Validation: Prevent selecting dates in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (isBefore(day, today)) return;

        let newStart = selectionStart;
        let newEnd = selectionEnd;

        // State 1: Clean Slate (both null OR both set)
        if ((!selectionStart && !selectionEnd) || (selectionStart && selectionEnd)) {
            newStart = day;
            newEnd = null;
        }
        // State 2: Selecting End Date (start set, end null)
        else if (selectionStart && !selectionEnd) {
            if (isAfter(day, selectionStart) || isSameDay(day, selectionStart)) {
                // Case A: Forward (or same day)
                newEnd = day;
            } else {
                // Case B: Backward (clicked before start) -> User changed mind about start
                newStart = day;
                newEnd = null;
            }
        }

        setSelectionStart(newStart);
        setSelectionEnd(newEnd);

        // Trigger callbacks
        if (onRangeSelect) onRangeSelect({ startDate: newStart, endDate: newEnd });
        if (onChange) onChange(newStart, newEnd);
    };

    const handleDateHover = (day: Date) => {
        setHoverDate(day);
    };

    const renderHeader = () => {
        const isPrevDisabled = isSameMonth(viewDate, new Date());

        return (
            <div className="flex items-center justify-between mb-5">
                <button
                    onClick={prevMonth}
                    disabled={isPrevDisabled}
                    className={`size-8 flex items-center justify-center rounded-full transition-colors ${isPrevDisabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'hover:bg-gray-50 text-gray-500'
                        }`}
                >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                <span className="text-gray-800 font-bold text-lg font-display">
                    {format(viewDate, "MMMM yyyy")}
                </span>
                <button
                    onClick={nextMonth}
                    className="size-8 flex items-center justify-center hover:bg-gray-50 rounded-full text-gray-500 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
            </div>
        );
    };

    const renderDays = () => {
        const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        return (
            <div className="grid grid-cols-7 mb-3 text-center">
                {days.map((day) => (
                    <span
                        key={day}
                        className="text-xs text-gray-400 font-bold uppercase tracking-wide"
                    >
                        {day}
                    </span>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(viewDate);
        const monthEnd = endOfMonth(monthStart);
        const startDateGrid = startOfWeek(monthStart);
        const endDateGrid = endOfWeek(monthEnd);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rows = [];
        let days = [];
        let day = startDateGrid;

        while (day <= endDateGrid) {
            for (let i = 0; i < 7; i++) {
                const cloneDay = day; // capture for closure
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isPast = isBefore(day, today);

                // --- Interaction Logic ---
                // Normalize for comparison
                const normalize = (d: Date) =>
                    new Date(d.getFullYear(), d.getMonth(), d.getDate());

                const dayNorm = normalize(day);
                const startNorm = selectionStart ? normalize(selectionStart) : null;
                const endNorm = selectionEnd ? normalize(selectionEnd) : null;
                const hoverNorm = hoverDate ? normalize(hoverDate) : null;

                const isStart = startNorm ? isSameDay(dayNorm, startNorm) : false;
                const isEnd = endNorm ? isSameDay(dayNorm, endNorm) : false;

                // Is in the finalized range?
                let inRange = false;
                if (startNorm && endNorm) {
                    // Strict check: start < day < end
                    inRange = isWithinInterval(dayNorm, { start: startNorm, end: endNorm }) && !isStart && !isEnd;
                }

                // --- Hover / Preview Logic ---
                // If we have a start BUT NO end, and we are hovering...
                // VALIDATION: Don't show preview for past dates
                let inPreviewRange = false;
                if (startNorm && !endNorm && hoverNorm && !isPast) {
                    if (isAfter(hoverNorm, startNorm)) {
                        // Normal forward selection preview
                        inPreviewRange = isWithinInterval(dayNorm, { start: startNorm, end: hoverNorm }) && !isStart && !isSameDay(dayNorm, hoverNorm);
                    }
                }

                const showRangeStyle = inRange || inPreviewRange;

                // --- Styling Logic ---
                let showRightStrip = false;
                let showLeftStrip = false;

                if (isCurrentMonth && !isPast) {
                    if (isStart) {
                        if (endNorm) showRightStrip = true;
                        else if (hoverNorm && startNorm && isAfter(hoverNorm, startNorm)) showRightStrip = true;
                    }
                    else if (isEnd) {
                        showLeftStrip = true;
                    }
                    // Handle "Hover End" visual 
                    else if (startNorm && !endNorm && hoverNorm && isSameDay(dayNorm, hoverNorm) && isAfter(hoverNorm, startNorm)) {
                        showLeftStrip = true;
                    }
                    else if (showRangeStyle) {
                        showLeftStrip = true;
                        showRightStrip = true;
                    }
                }

                // Button Styling
                let buttonClass = "relative z-10 size-9 rounded-full transition-colors text-sm font-medium ";

                if (isPast) {
                    buttonClass += "text-gray-300 cursor-not-allowed ";
                } else if (isCurrentMonth) {
                    if (isStart || isEnd) {
                        buttonClass += "bg-primary text-white shadow-md shadow-primary/30 cursor-pointer";
                    } else if (startNorm && !endNorm && hoverNorm && isSameDay(dayNorm, hoverNorm) && isAfter(hoverNorm, startNorm)) {
                        // Preview End (Hover)
                        buttonClass += "text-primary bg-indigo-50 font-bold ring-1 ring-primary/50 cursor-pointer";
                    } else if (showRangeStyle) {
                        buttonClass += "text-primary hover:bg-indigo-100/50 cursor-pointer";
                    } else {
                        buttonClass += "text-gray-600 hover:bg-gray-100 cursor-pointer";
                    }
                } else {
                    buttonClass += "text-gray-300 cursor-default";
                }

                const wrapperClass = "relative flex justify-center w-full";

                days.push(
                    <div
                        className={wrapperClass}
                        key={day.toString()}
                        onClick={() => isCurrentMonth && !isPast && handleDateClick(cloneDay)}
                        onMouseEnter={() => isCurrentMonth && !isPast && handleDateHover(cloneDay)}
                    >
                        {isCurrentMonth && !isPast && showLeftStrip && (
                            <div className="absolute left-0 inset-y-0 w-1/2 bg-indigo-50"></div>
                        )}
                        {isCurrentMonth && !isPast && showRightStrip && (
                            <div className="absolute right-0 inset-y-0 w-1/2 bg-indigo-50"></div>
                        )}

                        <button className={buttonClass} disabled={isPast}>{format(day, "d")}</button>
                    </div>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="grid grid-cols-7 gap-y-2" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="mb-2 space-y-2">{rows}</div>;
    };

    return (
        <div
            ref={containerRef}
            className="absolute bottom-full left-0 mb-3 w-[340px] bg-white rounded-2xl shadow-xl border border-gray-100/50 p-4 z-50 animate-fade-in-up origin-bottom-left ring-1 ring-black/5"
        >
            {renderHeader()}
            {renderDays()}
            {renderCells()}
        </div>
    );
};
