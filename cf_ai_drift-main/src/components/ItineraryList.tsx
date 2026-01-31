import { TripPlan } from "@/types/TripPlan";
import { ItineraryItem } from "./ItineraryItem";

interface ItineraryListProps {
    plan: TripPlan;
    onHover: (id: string | null) => void;
    isEditing?: boolean;
    onDeleteItem?: (dayId: string, itemId: string) => void;
}

export const ItineraryList = ({ plan, onHover, isEditing, onDeleteItem }: ItineraryListProps) => {
    return (
        <div className="flex-1 overflow-y-auto px-8 pb-12 pt-4 scroll-smooth custom-scrollbar bg-gradient-to-b from-white to-slate-50/50">
            {plan.days.map((day, index) => (
                <div key={day.id}>
                    <div className="mt-8 mb-6 flex items-center gap-5">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-primary font-bold shadow-sm ring-4 ring-white">
                            {index + 1}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">{day.title}</h2>
                            <p className="text-sm font-medium text-slate-400">{day.date || day.subtitle}</p>
                        </div>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-border-light to-transparent ml-4"></div>
                    </div>

                    <div className="flex flex-col gap-8 relative">
                        <div className="absolute left-[21px] top-8 bottom-8 w-[2px] bg-border-light -z-10 bg-opacity-60"></div>
                        {day.items.map((item) => (
                            <ItineraryItem
                                key={item.id}
                                item={item}
                                onHover={onHover}
                                isEditing={isEditing}
                                onDelete={() => onDeleteItem?.(day.id, item.id)}
                            />
                        ))}
                        {day.items.length === 0 && (
                            <div className="pl-14 text-slate-400 italic text-sm">No items planned for this day.</div>
                        )}
                    </div>
                </div>
            ))}
            <div className="h-32"></div>
        </div>
    );
};
