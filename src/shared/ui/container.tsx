import { cn } from "@/shared/lib";
import type { CSSProperties, PropsWithChildren } from "react";

export type ContainerProps = PropsWithChildren<{
  className?: string;
  size?: "sm" | "md";
  /**
   * INFO: REQUIREMENTS.md § 12.2. For a value only the render knows, which no class can carry — `ChatScreen`'s wallpaper tint is the one case. Anything expressible as a token belongs in `className` (AGENTS.md § 5.1.).
   */
  style?: CSSProperties;
  id?: string;
}>;

// INFO: DESIGN.md § 3.3. The only source of the shell width — screens never hardcode `max-w-*`.
export function Container({ className, size = "md", children, style, id }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-md",
        size === "md" && "max-w-(--container-app)",
        size === "sm" && "max-w-(--container-app-narrow)",
        className,
      )}
      style={style}
      id={id}
    >
      {children}
    </div>
  );
}
