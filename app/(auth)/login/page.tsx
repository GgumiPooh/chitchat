import { LoginError, LoginPage } from "@/pages/login";
import type { Maybe } from "@/shared/lib";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "로그인",
};

type PageProps = {
  searchParams: Promise<{ error?: Maybe<string> }>;
};

/**
 * INFO: The promise is handed down rather than awaited here, so the screen itself
 * prerenders and only the `?error=` line streams. Its fallback is `null` because the
 * line is absent on every visit that did not just fail — a placeholder would reserve
 * a box for a message that is usually never coming.
 */
export default function Page({ searchParams }: PageProps) {
  return (
    <LoginPage
      error={
        <Suspense fallback={null}>
          <LoginError searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}
