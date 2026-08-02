"use client";

import { getQueryClient } from "@/shared/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";

export function QueryProvider({ children }: PropsWithChildren) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
