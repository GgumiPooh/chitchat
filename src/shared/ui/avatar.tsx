"use client";

import { cn, type Maybe } from "@/shared/lib";
import { Avatar as AvatarPrimitive } from "radix-ui";

export type AvatarProps = {
  className?: string;
  fallbackClassName?: string;
  src?: Maybe<string>;
  /** Resolved display name. Its first character is the fallback, per DESIGN.md § 7.7. */
  name: string;
  size?: "chat" | "row" | "profile";
};

const SIZE_CLASS_NAME = {
  chat: "size-9",
  row: "size-11",
  profile: "size-18",
};

// INFO: DESIGN.md § 7.7. The inset hairline ring exists at every size so light photos cannot bleed into `canvas`.
export function Avatar({ className, fallbackClassName, src, name, size = "chat" }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full ring-1 ring-hairline select-none ring-inset",
        SIZE_CLASS_NAME[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image className="aspect-square size-full" src={src} alt={name} />}
      <AvatarPrimitive.Fallback
        className={cn(
          "flex size-full items-center justify-center bg-surface-strong text-title-sm text-meta",
          fallbackClassName,
        )}
      >
        {[...name][0] ?? ""}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
