import { countReclaimable, reclaimExpiredStorageOnce } from "@/shared/storage";
import { notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 9., § 12.4. Reclaims the bytes behind soft-deleted media and expired
 * upload claims, on a schedule rather than off an upload.
 *
 * INFO: The same two passes `reclaimExpiredStorage` runs inside `POST /api/media/upload-url`.
 * That copy is triggered by uploads and paid for by them, so a stretch of deleting without
 * uploading leaves the bytes in the bucket — this is the schedule that does not depend on
 * anybody uploading anything.
 */

/**
 * WARN: The reason a drained queue is not the only stop condition. A key R2 keeps refusing
 * stays unstamped, so the next pass selects it again — without a ceiling a bucket that is
 * refusing writes turns one run into an endless loop that never reports.
 */
const MAX_PASSES = 50;

/**
 * WARN: Off unless `PURGE_NOTIFY` is exactly `true`. The schedule fires whether or not there
 * was anything to do, and "회수할 파일 없음" every morning is a banner nobody asked for, on the
 * channel this app raises 메시지 on.
 *
 * WARN: It silences the FAILURE banner too, deliberately. A pass that throws is retried
 * unchanged by the next one, and a red scheduled run already says so.
 */
function isNotifyEnabled(): boolean {
  return process.env.PURGE_NOTIFY?.trim().toLowerCase() === "true";
}

/**
 * WARN: A preview counts and returns; it must reach neither `purgeNow` nor a stamp. The
 * whole value of 미리보기 is that pressing it cannot change anything.
 */
function isDryRun(): boolean {
  return process.env.PURGE_DRY_RUN?.trim().toLowerCase() === "true";
}

async function main() {
  if (isDryRun()) {
    const { media, claims } = await countReclaimable();
    const candidates = media + claims;

    console.log(`[purge] ${candidates} object(s) would be reclaimed`);

    if (isNotifyEnabled()) {
      await notifyOps(
        "삭제 파일 회수 점검",
        candidates === 0
          ? "회수 대상 없음"
          : `회수 대상 ${candidates}개 · 미디어 ${media} · 예약 ${claims}`,
      );
    }

    return;
  }

  let media = 0;
  let claims = 0;
  let passes = 0;

  while (passes < MAX_PASSES) {
    const report = await reclaimExpiredStorageOnce();

    passes += 1;
    media += report.media;
    claims += report.claims;

    // INFO: Zero is drained and total failure alike, and both mean this run is finished. A backlog the ceiling cut short is simply resumed by the next pass.
    if (report.media + report.claims === 0) {
      break;
    }
  }

  const reclaimed = media + claims;

  console.log(`[purge] ${reclaimed} object(s) reclaimed over ${passes} pass(es)`);

  /**
   * WARN: A run that reclaimed NOTHING still notifies, and that is the case the button
   * depends on. The schedule and the upload-triggered reclaim drain the queue, so 지금 회수하기 usually
   * finds it already empty — guarding this on `reclaimed > 0` left the panel promising a
   * banner that, in its most likely outcome, never came. Notifying is opt-in precisely so
   * that whoever turned it on is waiting for an answer, and "nothing to reclaim" is one.
   */
  if (isNotifyEnabled()) {
    await notifyOps(
      "삭제 파일 회수 완료",
      reclaimed === 0 ? "회수할 파일 없음" : `미디어 ${media}개 · 예약 ${claims}개 회수`,
    );
  }
}

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[purge] failed", error);

    if (isNotifyEnabled()) {
      await notifyOps(
        "삭제 파일 회수 실패",
        error instanceof Error ? error.message : String(error),
      );
    }

    process.exit(1);
  },
);
