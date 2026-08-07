import type { EmoticonPackWithItems } from "@/entities/emoticon";
import { EMOTICON_PACKS_PATH } from "@/shared/config";

export async function fetchEnabledPacks(): Promise<EmoticonPackWithItems[]> {
  const response = await fetch(`${EMOTICON_PACKS_PATH}?enabled=1`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_PACKS_PATH} responded ${response.status}`);
  }

  const { packs } = (await response.json()) as { packs: EmoticonPackWithItems[] };

  return packs;
}
