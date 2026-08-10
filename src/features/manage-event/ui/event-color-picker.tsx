"use client";

import {
  EVENT_COLORS,
  EVENT_COLOR_FILL_CLASSES,
  EVENT_COLOR_LABELS,
  EVENT_FALLBACK_FILL_CLASS,
  type EventColor,
} from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";

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
    // INFO: Silent on the swatch already chosen — re-picking it changes nothing.
    <HapticTarget className={cn("inline-flex shrink-0", className)} isTicking={!isSelected}>
      {/* WARN: A ring outside the swatch, never a glyph drawn on it. The checkmark this replaces was `on-primary` over the fill, which is 2.0:1 on `event-honey` and 2.3:1 on 색상 없음 — and no one token clears AA on six hues plus `meta-soft` in both themes. */}
      {/* INFO: `ink` and not `primary`, which DESIGN.md § 4.1.7. keeps out of the set: a neutral cannot read as a seventh colour, and it is ~16:1 against the `canvas` its offset paints in either theme. */}
      <button
        className={cn(
          "size-9 cursor-pointer rounded-full transition-transform outline-none group-active:scale-95 hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95",
          colorClassName,
          isSelected && "ring-2 ring-ink ring-offset-2 ring-offset-canvas",
        )}
        type="button"
        role="radio"
        aria-checked={isSelected}
        aria-label={label}
        onClick={onSelect}
      />
    </HapticTarget>
  );
}
