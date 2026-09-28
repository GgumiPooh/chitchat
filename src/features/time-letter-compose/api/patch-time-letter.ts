import type { TimeLetter, TimeLetterInput } from "@/entities/time-letter";
import { request } from "@/shared/api";
import { TIME_LETTERS_PATH } from "@/shared/config";
import type { TimeLetterId } from "@/shared/lib";

export type PatchTimeLetterInput = Partial<TimeLetterInput>;

export async function patchTimeLetter(
  letterId: TimeLetterId,
  input: PatchTimeLetterInput,
): Promise<TimeLetter> {
  const url = `${TIME_LETTERS_PATH}/${letterId}`;
  const response = await request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${url} failed: ${response.status}`);
  }

  const data = (await response.json()) as { letter: TimeLetter };
  return data.letter;
}
