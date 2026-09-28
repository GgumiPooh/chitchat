import type { TimeLetter } from "@/entities/time-letter";
import { request } from "@/shared/api";
import { TIME_LETTERS_PATH } from "@/shared/config";
import type { Nullable, TimeLetterId } from "@/shared/lib";

export async function fetchTimeLetter(id: TimeLetterId): Promise<Nullable<TimeLetter>> {
  const response = await request(`${TIME_LETTERS_PATH}/${id}`);

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET ${TIME_LETTERS_PATH}/${id} failed: ${response.status}`);
  }

  const data = (await response.json()) as { letter: TimeLetter };
  return data.letter;
}
