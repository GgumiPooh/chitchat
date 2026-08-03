import { pretendard } from "@/app/fonts";
import { GlobalProvider } from "@/app/providers";
import "@/app/styles";
import { APP_NAME } from "@/shared/config";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // INFO: Keeps the composer pinned to the keyboard instead of letting iOS scroll the whole page.
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
