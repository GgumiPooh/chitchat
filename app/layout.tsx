import { pretendard } from "@/app/fonts";
import { GlobalProvider } from "@/app/providers";
import "@/app/styles";
import { APPLE_SPLASH_DIR, APPLE_SPLASH_LINKS, APP_NAME } from "@/shared/config";
import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = {
  title: APP_NAME,
  // INFO: REQUIREMENTS.md § 14. Index blocking, layer 2 of 3.
  robots: { index: false, follow: false, nocache: true },
  // WARN: iOS reads `apple-touch-icon` from the markup, not the manifest — without it "Add to Home Screen" grabs a screenshot of the page.
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    // WARN: iOS has no manifest-driven splash the way Chromium does — without a `media` match here a home-screen launch shows a blank screen until the shell paints.
    startupImage: APPLE_SPLASH_LINKS.map(({ fileName, media }) => ({
      url: `${APPLE_SPLASH_DIR}/${fileName}`,
      media,
    })),
  },
  // INFO: `appleWebApp.capable` only emits the unprefixed `mobile-web-app-capable`, which iOS below 15.4 ignores — and WebKit paints no startup image outside standalone.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // INFO: DESIGN.md § 3.4. Kept as the Chromium-side belt to `VisualViewportSync`'s braces — WebKit ignores it, so it is never the only thing holding the shell together.
  interactiveWidget: "resizes-content",
  themeColor: "#fbf9f6",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html className={pretendard.variable} lang="ko" suppressHydrationWarning>
      <body>
        <GlobalProvider>{children}</GlobalProvider>
      </body>
    </html>
  );
}
