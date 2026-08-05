"use client";

import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// WARN: DESIGN.md § 3.2. bans a long-press with no pointer equivalent, which is why there are two sensors rather than one. `PointerSensor` covers the mouse with a distance threshold; `TouchSensor` needs a *time* threshold instead, because a touch that moves is the page scrolling.
const LONG_PRESS_DELAY = 250;

// INFO: How far a finger may drift during the press without cancelling it. Below this a steady finger still counts as held.
const LONG_PRESS_TOLERANCE = 8;

const POINTER_DRAG_DISTANCE = 6;

/** The activation gesture every sortable list in the app shares: long-press on touch, drag past a threshold with a pointer, arrow keys from the keyboard. */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_DRAG_DISTANCE } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: LONG_PRESS_DELAY, tolerance: LONG_PRESS_TOLERANCE },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
