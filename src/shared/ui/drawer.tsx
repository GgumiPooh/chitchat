"use client";

import { cn } from "@/shared/lib";
import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

// WARN: AGENTS.md § 2.4. Composition primitive — compose it inside `@/shared/ui` only, never in a screen.

// WARN: `repositionInputs` is vaul's own keyboard handling and it measures against `window.innerHeight`, which WebKit does not shrink — it stretched the sheet downwards behind the keys instead of lifting it. DESIGN.md § 3.4. already tracks the visual viewport for the whole app.
export function Drawer(props: ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root repositionInputs={false} {...props} />;
}

export function DrawerPortal(props: ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal {...props} />;
}

export function DrawerClose(props: ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close {...props} />;
}

export function DrawerOverlay({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-scrim/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

export function DrawerContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      {/* WARN: `bottom` rides `--viewport-bottom`, not `0`. The portal puts this outside the shell, so its `fixed` box is laid out against the layout viewport and the keyboard would otherwise slide it under the keys (DESIGN.md § 3.4.). */}
      <DrawerPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-[var(--viewport-bottom,0px)] z-50 flex h-auto flex-col",
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

export function DrawerTitle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title className={cn("text-title-md text-ink", className)} {...props} />;
}

export function DrawerDescription({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description className={cn("text-body-sm text-meta", className)} {...props} />
  );
}
