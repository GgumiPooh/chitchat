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
  /** AGENTS.md § 4.4. `app/(main)/layout.tsx`'s SSR seed for `#app-shell`, read back by `theme.css`'s `:root:has()`. */
  "data-side-panel"?: "closed";
}>;

// INFO: AGENTS.md § 4.3. `md` caps what is read, not the pane — a box that must fill its pane adds `max-w-none`.
export function Container({
  className,
  size = "md",
  children,
  style,
  id,
  "data-side-panel": dataSidePanel,
}: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-md",
        size === "md" && "max-w-(--content-max-width)",
        size === "sm" && "max-w-(--container-app-narrow)",
        className,
      )}
      style={style}
      id={id}
      data-side-panel={dataSidePanel}
    >
      {children}
    </div>
  );
}
