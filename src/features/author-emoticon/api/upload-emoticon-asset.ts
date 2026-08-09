import { request } from "@/shared/api";
import { EMOTICON_UPLOAD_URL, type EmoticonSlot } from "@/shared/config";
import { holdAwake } from "@/shared/lib";

type UploadTicket = {
  r2Key: string;
  uploadUrl: string;
};

/**
 * Puts one emoticon asset in R2 and answers the key the item will be registered
 * with (REQUIREMENTS.md § 13.3.).
 *
 * INFO: No progress callback, unlike § 9.'s `uploadDraft`. Every slot is capped in
 * the low megabytes, so there is no bar worth drawing — the form shows one spinner
 * for the whole submit instead.
 */
export async function uploadEmoticonAsset(slot: EmoticonSlot, file: Blob): Promise<string> {
  // WARN: REQUIREMENTS.md § 8.4.1. This covers the ticket and the PUT only. Whatever registers the key afterwards is a separate request and must take a hold of its own that outlives this one — `addEmoticonsFromFiles` does, and an object uploaded without one is unreachable the moment dormancy refuses its registration.
  const release = holdAwake();

  try {
    const ticket = await requestTicket(slot, file);

    // INFO: Plain `fetch`. This is R2's presigned URL, not our API, so § 8.4.1.'s gate has nothing to protect and the hold above is what covers it.
    const response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      // WARN: `Content-Type` alone. It is CORS-safelisted; anything else needs the bucket's `AllowedHeaders` to name it, and a header the policy omits fails the preflight for every upload (§ 9., § 13.3.).
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`PUT responded ${response.status}`);
    }

    return ticket.r2Key;
  } finally {
    release();
  }
}

/**
 * Gives back the objects a failed submit already put in R2 (REQUIREMENTS.md § 13.3.).
 *
 * INFO: Never rejects. This is cleanup behind a failure the user has already been
 * told about, and a second error on top of it would say nothing they can act on.
 */
export async function discardEmoticonAssets(r2Keys: string[]): Promise<void> {
  if (r2Keys.length === 0) {
    return;
  }

  await request(EMOTICON_UPLOAD_URL, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ r2Keys }),
  }).catch(() => undefined);
}

async function requestTicket(slot: EmoticonSlot, file: Blob): Promise<UploadTicket> {
  const response = await request(EMOTICON_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot, mime: file.type, size: file.size }),
  });

  if (!response.ok) {
    throw new Error(`POST ${EMOTICON_UPLOAD_URL} responded ${response.status}`);
  }

  return response.json() as Promise<UploadTicket>;
}
