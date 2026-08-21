"use client";

import { cn } from "@/shared/lib";
import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

export type SliderProps = ComponentProps<typeof SliderPrimitive.Root> & {
  className?: string;
  trackClassName?: string;
  rangeClassName?: string;
  thumbClassName?: string;
  /** One per thumb, in order — a two-thumb range has two ends to name and a screen reader hears neither otherwise. */
  thumbLabels?: string[];
};

/**
 * DESIGN.md § 4.5. A track with one thumb or several, which is the whole reason
 * this is not `input[type=range]` — a native range has exactly one, so a span used
 * to be two inputs stacked with a label each.
 *
 * INFO: `touch-none` on the root is required rather than decorative; without it the
 * browser claims the drag as a scroll and the thumb does not follow the finger.
 */
export function Slider({
  className,
  trackClassName,
  rangeClassName,
  thumbClassName,
  thumbLabels,
  value,
  defaultValue,
  min = 0,
  ...props
}: SliderProps) {
  const thumbCount = (value ?? defaultValue ?? [min]).length;

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      value={value}
      defaultValue={defaultValue}
      min={min}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-1 w-full grow overflow-hidden rounded-full bg-hairline-strong",
          trackClassName,
        )}
      >
        <SliderPrimitive.Range className={cn("absolute h-full bg-primary", rangeClassName)} />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          // INFO: DESIGN.md § 4.5. A 1px hairline is the system's elevation, as on `Switch`'s thumb — a shadow here would break § 8.2.
          className={cn(
            "block size-4 shrink-0 rounded-full border border-hairline-strong bg-canvas transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
            thumbClassName,
          )}
          aria-label={thumbLabels?.[index]}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
