"use client";

import {
  EVENT_COLORS,
  EVENT_COLOR_FILL_CLASSES,
  EVENT_COLOR_LABELS,
  EVENT_FALLBACK_FILL_CLASS,
  type EventColor,
} from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Check } from "lucide-react";

export type EventColorPickerProps = {
  className?: string;
  value: Nullable<EventColor>;
  onChange: (color: Nullable<EventColor>) => void;
};

/**
 * DESIGN.md § 4.1.7. The closed set, plus 색상 없음 — an event without a colour is
 * the common case, so it is a swatch of its own rather than a cleared selection.
 */
export function EventColorPicker({ className, value, onChange }: EventColorPickerProps) {
  return (
    <div className={cn("flex flex-wrap gap-xs", className)} role="radiogroup" aria-label="색상">
      <Swatch
        colorClassName={EVENT_FALLBACK_FILL_CLASS}
        label="색상 없음"
        isSelected={value === null}
        onSelect={() => onChange(null)}
      />
      {EVENT_COLORS.map((color) => (
        <Swatch
          key={color}
          colorClassName={EVENT_COLOR_FILL_CLASSES[color]}
          label={EVENT_COLOR_LABELS[color]}
          isSelected={value === color}
          onSelect={() => onChange(color)}
        />
      ))}
    </div>
  );
}

type SwatchProps = {
  className?: string;
  colorClassName: string;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
};

function Swatch({ className, colorClassName, label, isSelected, onSelect }: SwatchProps) {
  return (
    <button
      className={cn(
        "flex size-9 cursor-pointer items-center justify-center rounded-full transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95",
        colorClassName,
        className,
      )}
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={label}
      onClick={onSelect}
    >
      {/* INFO: A checkmark rather than a ring, because a ring in the swatch's own colour is invisible and one in `primary` would read as a seventh option. */}
      {isSelected && <Check className="size-4.5 text-on-primary" strokeWidth={2.5} />}
    </button>
  );
}
