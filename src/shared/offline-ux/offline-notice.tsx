import { cn } from "@/shared/lib";
import { OFFLINE_NOTICE_TEXT } from "./messages";

/** What every offline-blocked control points `aria-describedby` at. */
export const OFFLINE_NOTICE_ID = "offline-notice";

export type OfflineNoticeProps = {
  className?: string;
};

/**
 * The description an offline-blocked control is read out with.
 *
 * WARN: Mounted once, unconditionally, and **not** inside the 오프라인 모드 pill. The pill arrives a second after the network goes, so a control blocked before it renders would describe itself against an id that resolves to nothing — and two copies of this id is a worse bug than a description that is briefly redundant.
 */
export function OfflineNotice({ className }: OfflineNoticeProps) {
  return (
    <span className={cn("sr-only", className)} id={OFFLINE_NOTICE_ID}>
      {OFFLINE_NOTICE_TEXT}
    </span>
  );
}
