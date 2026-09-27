import type { TimeLetter, TimeLetterInput } from "@/entities/time-letter";
import { request } from "@/shared/api";
import { TIME_LETTERS_PATH } from "@/shared/config";

export async function postTimeLetter(input: TimeLetterInput): Promise<TimeLetter> {
  const response = await request(TIME_LETTERS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`POST ${TIME_LETTERS_PATH} failed: ${response.status}`);
  }

  const data = (await response.json()) as { letter: TimeLetter };
  return data.letter;
}
