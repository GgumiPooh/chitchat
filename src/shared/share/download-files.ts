import { ARCHIVE_DOWNLOAD_STAGGER, toMediaDownloadUrl } from "@/shared/config";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";

/**
 * Saves the given originals to disk (REQUIREMENTS.md § 10.).
 *
 * WARN: No `download` attribute, and no `fetch` of the bytes. The route answers a
 * 302 to R2 and the spec drops `download` once the navigation resolves
 * cross-origin (§ 9.), so what actually saves the file is the
 * `Content-Disposition` signed into the presigned GET — which means a plain
 * navigation per file. Fetching the blob instead would need R2's CORS policy to
 * allow GET as well as PUT (§ 15.), and would hold a 500MB video in memory.
 *
 * WARN: Staggered. Several navigations started in the same tick collapse into
 * one — the browser treats the later ones as the same gesture and drops them.
 *
 * WARN: Every id is probed first, and that is not caution — it is the only thing
 * standing between a stale tile and a lost app. The other participant's 보관함
 * 삭제 reaches rows this user is looking at (`REQUIREMENTS.md § 18.` #1.) and
 * nothing publishes it, so an open screen can name an object that is already
 * gone; navigating to it then replaces a standalone PWA with a bare JSON 404 and
 * no way back, which is the failure `toMediaDownloadUrl` exists to avoid in the
 * cross-origin case.
 */
export async function downloadMedia(ids: string[]): Promise<void> {
  let missing = 0;

  for (const [index, id] of ids.entries()) {
    if (index > 0) {
      await delay(ARCHIVE_DOWNLOAD_STAGGER);
    }

    if (await isStillStored(id)) {
      saveOne(id);
    } else {
      missing += 1;
    }
  }

  if (missing === 0) {
    return;
  }

  // INFO: 원본 is the word the control that started this is named by, and it is the only noun that fits every caller — this saves 사진, 동영상, 파일 and 음성 alike.
  // WARN: AGENTS.md § 0.4. `josa` for the particle, never a literal, since the count is interpolated.
  toast.error(
    ids.length === 1
      ? "원본을 찾지 못했어요"
      : `${josa(`${missing}개`, "은/는")} 원본을 찾지 못했어요`,
  );
}

/**
 * Whether the route still answers for this id, without pulling a byte of the object.
 *
 * WARN: `redirect: "manual"` is what makes this cheap, and it is also what makes it
 * readable. Left to follow, the 302 would fetch the whole original from R2 just to
 * throw it away; stopped here, a redirect surfaces as an opaque response and a 404
 * as an ordinary one, which is exactly the distinction being asked for.
 * WARN: A thrown `fetch` answers **true**. That is the network failing, not the
 * object being gone, and refusing the save there would report a deletion that never
 * happened — the navigation below is allowed to fail on its own terms instead.
 */
async function isStillStored(id: string): Promise<boolean> {
  try {
    const response = await fetch(toMediaDownloadUrl(id), { redirect: "manual" });

    return response.type === "opaqueredirect" || response.ok;
  } catch {
    return true;
  }
}

function saveOne(id: string) {
  const anchor = document.createElement("a");

  anchor.href = toMediaDownloadUrl(id);
  // INFO: Kept out of the document. A detached anchor still navigates on `click`, and appending one would flash a stray node into the grid's layout.
  anchor.rel = "noopener";
  anchor.click();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
