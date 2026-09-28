import type { TimeLetter, TimeLetterStatus } from "@/entities/time-letter";
import { request } from "@/shared/api";
import { TIME_LETTERS_PATH } from "@/shared/config";
import type { Nullable, TimeLetterId } from "@/shared/lib";

export type FetchTimeLettersParams = {
  status?: TimeLetterStatus;
  cursor?: string;
  limit?: number;
};

export type FetchTimeLettersResponse = {
  items: TimeLetter[];
  nextCursor: Nullable<string>;
  hasMore: boolean;
};

export async function fetchTimeLetters({
  status,
  cursor,
  limit,
}: FetchTimeLettersParams = {}): Promise<FetchTimeLettersResponse> {
  const query = new URLSearchParams();

  if (status) {
    query.set("status", status);
  }
  if (cursor) {
    query.set("cursor", cursor);
  }
  if (limit !== undefined) {
    query.set("limit", String(limit));
  }

  const queryString = query.toString();
  const url = queryString ? `${TIME_LETTERS_PATH}?${queryString}` : TIME_LETTERS_PATH;

  const response = await request(url);
  if (!response.ok) {
    throw new Error(`GET ${TIME_LETTERS_PATH} failed: ${response.status}`);
  }

  return (await response.json()) as FetchTimeLettersResponse;
}

export { postTimeLetter as createTimeLetterRequest } from "@/features/time-letter-compose";

export async function cancelTimeLetterRequest(id: TimeLetterId): Promise<boolean> {
  const response = await request(`${TIME_LETTERS_PATH}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`DELETE ${TIME_LETTERS_PATH}/${id} failed: ${response.status}`);
  }

  return response.status === 204;
}

export { fetchTimeLetter as getTimeLetterRequest } from "@/features/time-letter-viewer";
