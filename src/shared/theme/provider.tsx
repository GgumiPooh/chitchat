"use client";

import { useHydrated, type Optional } from "@/shared/lib";
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";
import { useEffect, type PropsWithChildren } from "react";
import { THEME_COLOR } from "./theme-color";

export type Theme = "light" | "dark" | "system";

/**
 * DESIGN.md § 5.1. Light, dark, and the OS's own preference, chosen in § 12.
 *
 * INFO: `system` is the default rather than `light` — a theme setting that ignores
 * the phone's own until it is touched is a setting the user has to find to get what
 * they already asked the OS for.
 *
 * WARN: `next-themes` writes the class from a blocking inline script it injects
 * itself, which is what keeps a dark launch from flashing the light canvas first.
 * That script is also why `<html>` carries `suppressHydrationWarning` — removing
 * either one reintroduces the flash (DESIGN.md § 5.4.).
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * Keeps `<meta name="theme-color">` on the theme the app resolved to, rather than
 * the one the OS asked for.
 *
 * WARN: The tags `app/layout.tsx` emits are keyed on `prefers-color-scheme`, which
 * stops being the answer the moment § 12. lets the user override it — a phone in
 * light mode with 어둡게 chosen would frame a dark app in a `#FBF9F6` status bar.
 * Every tag is written, not just a matching one: the browser honours the first whose
 * `media` matches, so leaving the other holding a stale value reintroduces the band
 * as soon as the OS setting moves.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useNextTheme();

  useEffect(() => {
    const color = resolvedTheme === "dark" ? THEME_COLOR.dark : THEME_COLOR.light;

    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((tag) => tag.setAttribute("content", color));
  }, [resolvedTheme]);

  return null;
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const { theme, setTheme } = useNextTheme();
  const hydrated = useHydrated();

  return [hydrated ? parseTheme(theme) : "system", setTheme];
}

function parseTheme(value: Optional<string>): Theme {
  switch (value) {
    case "light":
    case "dark":
    case "system":
      return value;
    default:
      return "system";
  }
}
