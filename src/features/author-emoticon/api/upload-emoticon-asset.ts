import { EMOTICON_UPLOAD_URL_PATH, type EmoticonSlot } from "@/shared/config";

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
  const ticket = await requestTicket(slot, file);

  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    // WARN: Must match what the URL was signed for, or R2 rejects the signature (§ 9.).
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`PUT responded ${response.status}`);
  }

  return ticket.r2Key;
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

  await fetch(EMOTICON_UPLOAD_URL_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ r2Keys }),
  }).catch(() => undefined);
}

async function requestTicket(slot: EmoticonSlot, file: Blob): Promise<UploadTicket> {
  const response = await fetch(EMOTICON_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot, mime: file.type, size: file.size }),
  });

  if (!response.ok) {
    throw new Error(`POST ${EMOTICON_UPLOAD_URL_PATH} responded ${response.status}`);
  }

  return response.json() as Promise<UploadTicket>;
}
