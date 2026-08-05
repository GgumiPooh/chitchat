import { ThemeProvider } from "@/shared/theme";
import { Toaster } from "@/shared/ui";
import { type PropsWithChildren } from "react";
import { SyncedStorageProvider } from "synced-storage/react";
import { QueryProvider } from "./query-provider";

// INFO: `synced-storage` needs its client cache above every `useStorageState` caller; no `ssrCookies`, since nothing here is cookie-backed and reading them would opt every route into dynamic rendering.
export function GlobalProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <SyncedStorageProvider>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </SyncedStorageProvider>
    </ThemeProvider>
  );
}
