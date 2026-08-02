import { ThemeProvider } from "@/shared/theme";
import { Toaster } from "@/shared/ui";
import { type PropsWithChildren } from "react";
import { QueryProvider } from "./query-provider";

export function GlobalProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        <Toaster />
      </QueryProvider>
    </ThemeProvider>
  );
}
