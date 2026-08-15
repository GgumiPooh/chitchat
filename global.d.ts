/// <reference types="react/canary" />

declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const Component: FC<SVGProps<SVGSVGElement> & { title?: string }>;
  export default Component;
}

/**
 * REQUIREMENTS.md § 13.6. The Network Information API, which `lib.dom` does not declare.
 *
 * WARN: Chromium only, and every field is optional there too — iOS Safari exposes no `connection` at all, so a reader MUST treat absence as "unknown" rather than as any particular network.
 */
interface NetworkInformation {
  readonly type?:
    | "bluetooth"
    | "cellular"
    | "ethernet"
    | "mixed"
    | "none"
    | "other"
    | "unknown"
    | "wifi"
    | "wimax";
  readonly effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  readonly saveData?: boolean;
}

interface Navigator {
  readonly connection?: NetworkInformation;
}
