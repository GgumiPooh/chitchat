"use client";

import { useHydrated, type Optional } from "@/shared/lib";
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";
import { type PropsWithChildren } from "react";

export type Theme = "light" | "dark" | "system";

/** DESIGN.md § 5.1. Enabling dark: populate `.dark`, delete `forcedTheme`, render the settings toggle. */
export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem>
      {children}
    </NextThemesProvider>
  );
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
